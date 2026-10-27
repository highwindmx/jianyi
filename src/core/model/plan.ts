import type { ItemId } from './item.ts';

/**
 * 变更计划：积木栈编译出来的**唯一产物**。
 * 执行器只认这个结构，完全不理解积木是什么。
 */
export type PlanAction = 'keep' | 'rename' | 'move' | 'copy' | 'delete';

export interface PlanEntry {
  itemId: ItemId;
  action: PlanAction;
  /** 绝对路径 */
  from: string;
  /** delete 时为 null */
  to: string | null;
  /** 人类可读的原因链，例如 "去空格 → 模板重命名" */
  reason: string;
  touchedBy: string[];
  /** 策略应用后的结果：执行时若目标已存在则先备份 */
  overwrite: boolean;
  /** 不可执行的原因（如非法文件名、跳过策略） */
  blocked?: string;
  size: number;
}

export type ConflictCode =
  | 'INVALID_NAME'
  | 'TARGET_EXISTS'
  | 'BATCH_DUPLICATE'
  | 'CASE_COLLISION'
  | 'CASE_ONLY_RENAME'
  | 'SELF_TARGET'
  | 'DISK_FULL';

export interface Conflict {
  code: ConflictCode;
  level: 'error' | 'warn';
  itemIds: ItemId[];
  path: string;
  message: string;
  /** 该冲突能否被策略自动解决 */
  resolvable: boolean;
}

export interface PlanSummary {
  rename: number;
  move: number;
  copy: number;
  delete: number;
  keep: number;
  excluded: number;
  conflict: number;
  blocked: number;
  /** 真正需要落盘的文件数（去重后的受影响条目） */
  affected: number;
  /** 涉及的数据总量 */
  totalBytes: number;
  /** 真正新增写入的字节（只有复制才占新空间） */
  writeBytes: number;
}
