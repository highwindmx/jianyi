import { invoke } from '@tauri-apps/api/core';
import type { PlatformAdapter, ScanEntry, ScanOptions } from '../types.ts';
import { normPath } from '../../core/model/item.ts';

/**
 * Tauri 命令返回 `Err(String)` 时，reject 出来的是**字符串**而不是 Error。
 * 上层到处 `(err as Error).message` 会拿到 undefined，错误信息就这么丢了。
 * 所有 IPC 走这一个口子，统一包成 Error。
 */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(typeof e === 'string' ? e : String(e));
  }
}

/**
 * 真磁盘适配器。每个方法背后是一条 Rust 命令（见 `src-tauri/src/fs.rs`）。
 *
 * 三条硬约束，都是踩出来的：
 * 1. **路径统一正斜杠**。core 层全程 `normPath()`，Rust 侧 `fwd()` 也转正斜杠，两边必须一致，
 *    否则 `Set<string>` 查冲突永远查不中。
 * 2. **目录列表带缓存**。冲突检测会对同一批目标目录反复问 `listDir`，
 *    一次 486 个文件的执行会问出上万次；缓存 2 秒，够用且不会陈旧到出事。
 * 3. **`allFilePaths` 必须给 scope**。真机不可能遍历整块盘，只走源目录 + 目标目录。
 */
export class TauriAdapter implements PlatformAdapter {
  readonly kind = 'tauri' as const;

  /** Windows / macOS 大小写不敏感，Linux 敏感 */
  readonly caseInsensitiveFs: boolean;

  /** dir -> { names, at } */
  private dirCache = new Map<string, { names: string[]; at: number }>();
  private static CACHE_MS = 2000;

  constructor() {
    const p = (navigator.platform || '').toLowerCase();
    this.caseInsensitiveFs = p.includes('win') || p.includes('mac');
  }

  /** 执行/撤销这类会改目录的操作之后，缓存必须立刻作废 */
  invalidate(): void {
    this.dirCache.clear();
  }

  async scanDir(root: string, opts: ScanOptions): Promise<ScanEntry[]> {
    return call<ScanEntry[]>('scan_dir', {
      root: normPath(root),
      recursive: opts.recursive,
      includeHidden: opts.includeHidden,
    });
  }

  async listDir(dir: string): Promise<string[]> {
    const key = normPath(dir).toLowerCase();
    const hit = this.dirCache.get(key);
    const now = performance.now();
    if (hit && now - hit.at < TauriAdapter.CACHE_MS) return hit.names;
    try {
      const names = await call<string[]>('list_dir', { dir: normPath(dir) });
      this.dirCache.set(key, { names, at: now });
      return names;
    } catch {
      // 目录不存在 = 空目录。不要抛，否则冲突检测会因为"目标目录还没建"而整体失败
      this.dirCache.set(key, { names: [], at: now });
      return [];
    }
  }

  async exists(path: string): Promise<boolean> {
    return call<boolean>('path_exists', { path: normPath(path) });
  }

  async mkdirp(dir: string): Promise<void> {
    await call('mkdirp', { dir: normPath(dir) });
  }

  async move(from: string, to: string): Promise<{ crossDevice: boolean }> {
    const res = await call<{ crossDevice: boolean }>('move_path', {
      from: normPath(from),
      to: normPath(to),
    });
    this.invalidate();
    return res;
  }

  async copy(from: string, to: string): Promise<void> {
    await call('copy_path', { from: normPath(from), to: normPath(to) });
    this.invalidate();
  }

  async trash(from: string, trashDir: string): Promise<string> {
    const dest = await call<string>('trash_path', {
      from: normPath(from),
      trashDir: normPath(trashDir),
    });
    this.invalidate();
    return dest;
  }

  async restore(trashPath: string, to: string): Promise<void> {
    await call('restore_path', { trashPath: normPath(trashPath), to: normPath(to) });
    this.invalidate();
  }

  async freeSpace(dir: string): Promise<number | null> {
    return call<number | null>('free_space', { dir: normPath(dir) });
  }

  async canWrite(dir: string): Promise<boolean> {
    return call<boolean>('can_write', { dir: normPath(dir) });
  }

  async allFilePaths(scope?: string[]): Promise<string[]> {
    const dirs = (scope ?? []).filter(Boolean).map(normPath);
    if (!dirs.length) return [];
    return call<string[]>('all_file_paths', { scope: dirs });
  }

  async hasChild(dir: string, name: string): Promise<boolean> {
    return call<boolean>('has_child', { dir: normPath(dir), name });
  }
}
