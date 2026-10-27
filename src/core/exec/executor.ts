import type { PlatformAdapter } from '../../platform/types.ts';
import type { PlanEntry } from '../model/plan.ts';
import type { Journal, JournalEntry } from '../model/journal.ts';
import { normPath, pathKey } from '../model/item.ts';
import { preflight } from './preflight.ts';

export interface ExecuteOptions {
  adapter: PlatformAdapter;
  /** 应用数据目录，暂存区放在它下面（**不在源目录里**，避免污染扫描结果） */
  appDataDir: string;
  onProgress?: (done: number, total: number, current: string) => void;
  signal?: AbortSignal;
  journalId?: string;
}

export class ExecutionError extends Error {
  readonly journal: Journal;

  constructor(message: string, journal: Journal) {
    super(message);
    this.name = 'ExecutionError';
    this.journal = journal;
  }
}

function newJournalId(): string {
  return 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function yieldToUI(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function applyEntry(
  e: PlanEntry,
  adapter: PlatformAdapter,
  trashDir: string,
  backupDir: string,
  seq: number,
): Promise<JournalEntry[]> {
  const at = Date.now();
  const out: JournalEntry[] = [];
  const to = e.to;
  if (!to) return out;

  const dir = to.slice(0, to.lastIndexOf('/'));
  if (dir) await adapter.mkdirp(dir);

  // 覆盖前先把旧目标挪到备份区，撤销时才拿得回来
  if (e.overwrite && (await adapter.exists(to))) {
    const backupPath = `${backupDir}/${seq}_${to.slice(to.lastIndexOf('/') + 1)}`;
    await adapter.move(to, backupPath);
    out.push({ seq: out.length, op: { kind: 'backup', from: to, backupPath }, itemId: e.itemId, at, status: 'done' });
  }

  if (e.action === 'copy') {
    await adapter.copy(e.from, to);
    out.push({ seq: out.length, op: { kind: 'copy', from: e.from, to }, itemId: e.itemId, at, status: 'done' });
  } else if (e.action === 'move' || e.action === 'rename') {
    const res = await adapter.move(e.from, to);
    out.push({
      seq: out.length,
      op: { kind: 'move', from: e.from, to, crossDevice: res.crossDevice },
      itemId: e.itemId,
      at,
      status: 'done',
    });
  } else if (e.action === 'delete') {
    const trashPath = await adapter.trash(e.from, trashDir);
    out.push({ seq: out.length, op: { kind: 'trash', from: e.from, trashPath }, itemId: e.itemId, at, status: 'done' });
  }

  return out;
}

/**
 * 按计划串行落盘。
 *
 * 三条硬规则：
 *  1. 失败即停 —— 半成品状态比"少做了几个"更难善后；
 *  2. 回滚必须**逆序** —— 链式改名 A→B、B→C 时，顺序回滚会互相踩；
 *  3. 删除只进暂存区，永不真删。
 */
export async function executePlan(
  plan: readonly PlanEntry[],
  opts: ExecuteOptions,
): Promise<Journal> {
  const { adapter, appDataDir } = opts;
  const id = opts.journalId ?? newJournalId();
  const trashDir = normPath(`${appDataDir}/trash/${id}`);
  const backupDir = normPath(`${appDataDir}/backup/${id}`);

  const journal: Journal = {
    id,
    root: appDataDir,
    startedAt: Date.now(),
    entries: [],
    status: 'running',
  };

  const pre = await preflight(plan, adapter);
  if (!pre.ok) {
    journal.status = 'aborted';
    throw new ExecutionError(
      '预检未通过：' + pre.problems.filter((p) => p.fatal).map((p) => p.message).join('；'),
      journal,
    );
  }

  const actionable = plan.filter((e) => e.action !== 'keep' && !e.blocked && e.to);
  const total = actionable.length;

  let current: PlanEntry | null = null;
  try {
    for (let i = 0; i < actionable.length; i++) {
      if (opts.signal?.aborted) throw new Error('已取消');
      const e = actionable[i];
      current = e;
      const entries = await applyEntry(e, adapter, trashDir, backupDir, journal.entries.length);
      journal.entries.push(...entries);
      opts.onProgress?.(i + 1, total, e.to ?? e.from);
      if ((i + 1) % 200 === 0) await yieldToUI();
    }
    journal.status = 'completed';
    journal.finishedAt = Date.now();
    return journal;
  } catch (err) {
    journal.status = 'aborted';
    journal.finishedAt = Date.now();
    // 报错必须带上"卡在哪一条"：只说"操作失败"，用户面对 486 条无从下手。
    // 另外 err 可能不是 Error —— Tauri 的 Err(String) 就是以字符串 reject 的。
    const detail = err instanceof Error ? err.message : String(err);
    const where = current ? `「${current.from}」→「${current.to}」：` : '';
    throw new ExecutionError(where + detail, journal);
  }
}

/** 计划里是否有需要落盘的动作 */
export function hasWork(plan: readonly PlanEntry[]): boolean {
  return plan.some((e) => e.action !== 'keep' && !e.blocked && e.to);
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}
