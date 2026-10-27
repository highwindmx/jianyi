import type { PlatformAdapter } from '../../platform/types.ts';
import type { Journal, JournalEntry, RollbackFailure } from '../model/journal.ts';
import { normPath } from '../model/item.ts';

async function undoEntry(
  entry: JournalEntry,
  adapter: PlatformAdapter,
  trashDir: string,
): Promise<void> {
  const op = entry.op;
  switch (op.kind) {
    case 'move':
      await adapter.move(op.to, op.from);
      break;
    case 'copy':
      // 复制出来的副本要清掉；原文件本来就没动
      await adapter.trash(op.to, trashDir);
      break;
    case 'trash':
      await adapter.restore(op.trashPath, op.from);
      break;
    case 'backup':
      await adapter.move(op.backupPath, op.from);
      break;
  }
}

/**
 * 逆序回滚。
 *
 * 为什么必须逆序：链式改名 A→B、B→C 时，正序回滚会把 C 还原成 B，
 * 而 B 的还原又需要 B 是空的 —— 互相踩。
 *
 * 回滚失败不重试、不递归，只如实出报告：这是唯一诚实的做法。
 */
export async function rollbackJournal(
  journal: Journal,
  adapter: PlatformAdapter,
  appDataDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Journal> {
  const trashDir = normPath(`${appDataDir}/trash/${journal.id}-rollback`);
  const failures: RollbackFailure[] = [];
  const entries = [...journal.entries].reverse();

  for (let i = 0; i < entries.length; i++) {
    try {
      await undoEntry(entries[i], adapter, trashDir);
    } catch (e) {
      failures.push({ entry: entries[i], reason: (e as Error).message });
    }
    onProgress?.(i + 1, entries.length);
    if ((i + 1) % 200 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return {
    ...journal,
    status: failures.length ? 'aborted' : 'rolled-back',
    failures: failures.length ? failures : undefined,
  };
}
