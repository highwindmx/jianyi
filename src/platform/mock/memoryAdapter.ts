import type { PlatformAdapter, ScanEntry, ScanOptions } from '../types.ts';
import { baseNameOf, normPath, pathKey } from '../../core/model/item.ts';

interface MockNode {
  path: string;
  size: number;
  mtimeMs: number;
}

/**
 * 内存文件系统。同步实现、零延迟，但对外是 async —— 和 Tauri 版本签名一致。
 * 支持故障注入（第 N 次写操作抛错），用来验证执行器的逆序回滚。
 */
export class MemoryAdapter implements PlatformAdapter {
  readonly kind = 'mock' as const;
  readonly caseInsensitiveFs = true;

  private files = new Map<string, MockNode>();
  private dirs = new Set<string>();

  /** 第 N 次写操作时抛错，null = 不注入 */
  failAtOp: number | null = null;
  private opCount = 0;
  readonly freeBytesTotal: number;

  constructor(freeBytesTotal = 240 * 1024 ** 3) {
    this.freeBytesTotal = freeBytesTotal;
  }

  /* ── 供 mock 数据构造使用（真实 adapter 没有这些） ── */

  seedFile(path: string, size: number, mtimeMs: number): void {
    const p = normPath(path);
    this.files.set(pathKey(p), { path: p, size, mtimeMs });
    this.ensureDirs(p);
  }

  seedDir(path: string): void {
    const p = normPath(path);
    this.dirs.add(pathKey(p));
    this.ensureDirs(p + '/_');
  }

  private ensureDirs(filePath: string): void {
    const parts = normPath(filePath).split('/');
    parts.pop();
    let acc = '';
    for (const part of parts) {
      acc = acc ? acc + '/' + part : part;
      this.dirs.add(pathKey(acc));
    }
  }

  /** 目录下所有后代文件（递归） */
  private under(dir: string): MockNode[] {
    const k = pathKey(normPath(dir));
    const prefix = k.endsWith('/') ? k : k + '/';
    const out: MockNode[] = [];
    for (const [key, node] of this.files) if (key.startsWith(prefix)) out.push(node);
    return out;
  }

  /* ── PlatformAdapter ── */

  async scanDir(root: string, opts: ScanOptions): Promise<ScanEntry[]> {
    const rootKey = pathKey(normPath(root));
    const prefix = rootKey + '/';
    const out: ScanEntry[] = [];
    for (const [key, node] of this.files) {
      if (!key.startsWith(prefix)) continue;
      const rel = key.slice(prefix.length);
      if (!opts.recursive && rel.includes('/')) continue;
      if (!opts.includeHidden && rel.split('/').some((seg) => seg.startsWith('.'))) continue;
      out.push({ path: node.path, size: node.size, mtimeMs: node.mtimeMs });
    }
    out.sort((a, b) => (a.path < b.path ? -1 : 1));
    return out;
  }

  async listDir(dir: string): Promise<string[]> {
    const k = pathKey(normPath(dir));
    const prefix = k.endsWith('/') ? k : k + '/';
    const out = new Set<string>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      out.add(key.slice(prefix.length).split('/')[0]);
    }
    return [...out];
  }

  async exists(path: string): Promise<boolean> {
    const k = pathKey(normPath(path));
    return this.files.has(k) || this.dirs.has(k);
  }

  async mkdirp(dir: string): Promise<void> {
    this.dirs.add(pathKey(normPath(dir)));
    this.ensureDirs(normPath(dir) + '/_');
  }

  private tick(): void {
    this.opCount++;
    if (this.failAtOp !== null && this.opCount >= this.failAtOp) {
      this.failAtOp = null;
      throw new Error(`注入故障：第 ${this.opCount} 个写操作失败（模拟权限不足）`);
    }
  }

  async move(from: string, to: string): Promise<{ crossDevice: boolean }> {
    this.tick();
    const fk = pathKey(normPath(from));
    const tk = pathKey(normPath(to));
    const node = this.files.get(fk);
    if (!node) throw new Error(`源文件不存在：${from}`);
    const dest = normPath(to);
    if (fk === tk) {
      // 仅大小写变更：不区分大小写的盘上只需改写记录的显示路径
      this.files.set(tk, { ...node, path: dest });
      return { crossDevice: false };
    }
    if (this.files.has(tk)) throw new Error(`目标已存在：${to}`);
    this.files.delete(fk);
    this.files.set(tk, { path: dest, size: node.size, mtimeMs: node.mtimeMs });
    this.ensureDirs(dest);
    const driveA = normPath(from).slice(0, 2).toLowerCase();
    const driveB = dest.slice(0, 2).toLowerCase();
    return { crossDevice: driveA !== driveB };
  }

  async copy(from: string, to: string): Promise<void> {
    this.tick();
    const node = this.files.get(pathKey(normPath(from)));
    if (!node) throw new Error(`源文件不存在：${from}`);
    const dest = normPath(to);
    if (this.files.has(pathKey(dest))) throw new Error(`目标已存在：${to}`);
    this.files.set(pathKey(dest), { path: dest, size: node.size, mtimeMs: node.mtimeMs });
    this.ensureDirs(dest);
  }

  async trash(from: string, trashDir: string): Promise<string> {
    this.tick();
    const node = this.files.get(pathKey(normPath(from)));
    if (!node) throw new Error(`源文件不存在：${from}`);
    const dest = normPath(trashDir) + '/' + baseNameOf(from);
    this.files.delete(pathKey(normPath(from)));
    this.files.set(pathKey(dest), { path: dest, size: node.size, mtimeMs: node.mtimeMs });
    this.ensureDirs(dest);
    return dest;
  }

  async restore(trashPath: string, to: string): Promise<void> {
    this.tick();
    const node = this.files.get(pathKey(normPath(trashPath)));
    if (!node) throw new Error(`暂存区文件不存在：${trashPath}`);
    this.files.delete(pathKey(normPath(trashPath)));
    const dest = normPath(to);
    this.files.set(pathKey(dest), { path: dest, size: node.size, mtimeMs: node.mtimeMs });
    this.ensureDirs(dest);
  }

  async freeSpace(_dir?: string): Promise<number | null> {
    let used = 0;
    for (const n of this.files.values()) used += n.size;
    return Math.max(0, this.freeBytesTotal - used);
  }

  async canWrite(): Promise<boolean> {
    return true;
  }

  async allFilePaths(_scope?: string[]): Promise<string[]> {
    // 内存 FS 本来就只有这一份数据，scope 无意义 —— 全给
    return [...this.files.values()].map((n) => n.path);
  }

  async hasChild(dir: string, name: string): Promise<boolean> {
    return this.files.has(pathKey(normPath(dir) + '/' + name));
  }

  /* ── 调试 ── */

  stats(): { files: number; dirs: number; bytes: number } {
    let bytes = 0;
    for (const n of this.files.values()) bytes += n.size;
    return { files: this.files.size, dirs: this.dirs.size, bytes };
  }

  resetOpCounter(): void {
    this.opCount = 0;
    this.failAtOp = null;
  }

  /** 用于测试：清空 */
  clear(): void {
    this.files.clear();
    this.dirs.clear();
  }
}
