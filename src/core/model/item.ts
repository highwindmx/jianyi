/**
 * 文件条目模型。
 *
 * 核心约定（贯穿整个引擎）：
 *  - 一条 FileItem 从扫描开始到最终落盘，始终是同一条记录，**不会从数组里被摘除**。
 *  - origin 只读，永远记录"它原本是什么"；cur 可变，记录"现在它变成什么"。
 *  - 删除 / 筛选排除 / 手动排除，都只是把 status 改成 deleted / excluded。
 *
 * 这样做的三个收益：
 *  1. 数组长度恒定 → 行 key 稳定，虚拟滚动不跳行；
 *  2. 最终变更计划 = origin ↔ cur 的纯 diff，不需要逐步累积旁路数据；
 *  3. 撤销时按 id 定位，不依赖副作用日志反查。
 */

export type ItemId = string;
export type ItemStatus = 'active' | 'excluded' | 'deleted';

export interface FileOrigin {
  /** 原始目录，不带结尾斜杠 */
  readonly dir: string;
  /** 原始完整文件名，含扩展名 */
  readonly name: string;
  /** 去掉扩展名的主干 */
  readonly base: string;
  /** 扩展名，含点；无扩展名时为空串。保留原始大小写 */
  readonly ext: string;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface FileCurrent {
  dir: string;
  name: string;
  base: string;
  ext: string;
  /** 当前顺序位，1 起。由 reindex() 统一维护，是 {序号} 的唯一来源 */
  seq: number;
}

export interface StepIssue {
  itemId?: ItemId;
  level: 'warn' | 'error';
  code: string;
  message: string;
}

export interface FileItem {
  readonly id: ItemId;
  readonly origin: FileOrigin;
  cur: FileCurrent;
  status: ItemStatus;
  /** 被哪一步删除 / 排除 */
  deletedBy?: string;
  excludedBy?: 'manual' | string;
  /** 哪些步骤真正改动过它，用于预览的"原因"列 */
  touchedBy: string[];
  issues: StepIssue[];
  /** 最终落盘是"复制"而非"移动"（由移动积木的 operation 决定，后者覆盖前者） */
  copyAs?: boolean;
}

/** 拆分文件名为主干 + 扩展名。'.tar.gz' 只取最后一段。 */
export function splitExt(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf('.');
  if (i <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  return dir.endsWith('/') ? dir + name : dir + '/' + name;
}

/** 路径归一：统一分隔符、去掉重复斜杠、去掉结尾斜杠 */
export function normPath(p: string): string {
  let s = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

/** 用于比较的路径键（大小写不敏感文件系统上折叠大小写） */
export function pathKey(p: string, caseInsensitive = true): string {
  const s = normPath(p);
  return caseInsensitive ? s.toLowerCase() : s;
}

export function dirOf(p: string): string {
  const s = normPath(p);
  const i = s.lastIndexOf('/');
  return i <= 0 ? s.slice(0, Math.max(i, 0)) : s.slice(0, i);
}

export function baseNameOf(p: string): string {
  const s = normPath(p);
  return s.slice(s.lastIndexOf('/') + 1);
}

/** 由磁盘扫描结果构造一条条目 */
export function makeItem(absPath: string, size: number, mtimeMs: number): FileItem {
  const dir = dirOf(absPath);
  const name = baseNameOf(absPath);
  const { base, ext } = splitExt(name);
  return {
    id: pathKey(absPath),
    origin: { dir, name, base, ext, size, mtimeMs },
    cur: { dir, name, base, ext, seq: 0 },
    status: 'active',
    touchedBy: [],
    issues: [],
  };
}

export function originPath(it: FileItem): string {
  return joinPath(it.origin.dir, it.origin.name);
}

export function currentPath(it: FileItem): string {
  return joinPath(it.cur.dir, it.cur.name);
}

/** 该条目相对原始状态发生了什么（用于行高亮与状态列） */
export type RowAction = 'keep' | 'rename' | 'move' | 'delete' | 'excluded';

export function actionOf(it: FileItem): RowAction {
  if (it.status === 'excluded') return 'excluded';
  if (it.status === 'deleted') return 'delete';
  if (it.cur.dir !== it.origin.dir) return 'move';
  if (it.cur.name !== it.origin.name) return 'rename';
  return 'keep';
}

/**
 * 重排顺序位。无变化时返回**同一个数组引用** —— 下游可以据此整段短路。
 */
export function reindex(items: readonly FileItem[]): FileItem[] {
  let n = 0;
  let out: FileItem[] | null = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.status !== 'active') continue;
    n++;
    if (it.cur.seq !== n) {
      if (!out) out = items.slice();
      out[i] = { ...it, cur: { ...it.cur, seq: n } };
    }
  }
  return out ?? (items as FileItem[]);
}

/** 只改动命中的条目，其余复用引用（性能地基） */
export function mapActive(
  items: readonly FileItem[],
  fn: (it: FileItem) => FileItem | null,
): { items: FileItem[]; changed: number } {
  let changed = 0;
  let out: FileItem[] | null = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.status !== 'active') continue;
    const next = fn(it);
    if (!next || next === it) continue;
    if (!out) out = items.slice();
    out[i] = next;
    changed++;
  }
  return { items: out ?? (items as FileItem[]), changed };
}
