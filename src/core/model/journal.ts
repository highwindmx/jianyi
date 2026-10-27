import type { ItemId } from './item.ts';

/**
 * 落盘日志。粒度只记"能还原回去的最小信息"。
 * 删除一律进暂存区（trash），永不真删 —— 这是撤销可靠性的前提。
 */
export type JournalOp =
  | { kind: 'move'; from: string; to: string; crossDevice: boolean }
  | { kind: 'copy'; from: string; to: string }
  | { kind: 'trash'; from: string; trashPath: string }
  | { kind: 'mkdir'; path: string }
  /** 覆盖前把旧目标挪到备份区，撤销时再挪回来 */
  | { kind: 'backup'; from: string; backupPath: string };

export interface JournalEntry {
  seq: number;
  op: JournalOp;
  itemId: ItemId;
  at: number;
  status: 'done' | 'failed';
  error?: string;
}

export interface RollbackFailure {
  entry: JournalEntry;
  reason: string;
}

export interface Journal {
  id: string;
  root: string;
  startedAt: number;
  finishedAt?: number;
  entries: JournalEntry[];
  status: 'running' | 'completed' | 'rolled-back' | 'aborted';
  failures?: RollbackFailure[];
}

export interface ExecuteSummary {
  rename: number;
  move: number;
  copy: number;
  delete: number;
  keep: number;
  overwrite: number;
  conflict: number;
  totalBytes: number;
}
