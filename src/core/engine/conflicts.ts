import type { FileItem } from '../model/item.ts';
import { baseNameOf, normPath, pathKey, splitExt } from '../model/item.ts';
import type { Conflict, ConflictCode, PlanEntry } from '../model/plan.ts';
import type { ConflictPolicy } from '../model/pipeline.ts';
import { freeName, validateFileName } from './paths.ts';
import { fmtBytes } from './paths.ts';

export interface ConflictWorld {
  /** 磁盘上当前已存在的文件路径（已按 pathKey 折叠） */
  existingPaths: Set<string>;
  caseInsensitiveFs: boolean;
  /** 目标盘的剩余字节，null 表示未知 */
  freeBytes: number | null;
}

/**
 * 全局冲突检测。
 *
 * 为什么不全放在各步骤里：改名步骤看不到后面的移动步骤会把文件送去哪，
 * "目标已存在"只有拿到整条流水线的终态才判断得出来。
 * 为什么也不全放在这里：非法文件名属于参数错误，必须在右侧面板即时红字，
 * 不能等整条栈重算完才提示。
 */
export function detectConflicts(
  plan: readonly PlanEntry[],
  world: ConflictWorld,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const ci = world.caseInsensitiveFs;

  // 本批次会腾空的路径（被移走 / 被删除的）不算"已存在"
  const vacating = new Set<string>();
  for (const e of plan) {
    if (e.action === 'move' || e.action === 'delete') vacating.add(pathKey(e.from, ci));
  }
  const occupied = new Set<string>();
  for (const p of world.existingPaths) if (!vacating.has(p)) occupied.add(p);

  const claims = new Map<string, PlanEntry>();

  for (const e of plan) {
    if (e.action === 'keep' || e.action === 'delete' || !e.to) continue;

    const name = baseNameOf(e.to);
    const bad = validateFileName(name, 'win32');
    if (bad) {
      conflicts.push({
        code: 'INVALID_NAME',
        level: 'error',
        itemIds: [e.itemId],
        path: e.to,
        message: bad.message,
        resolvable: false,
      });
      e.blocked = bad.message;
      continue;
    }

    const fromKey = pathKey(e.from, ci);
    const toKey = pathKey(e.to, ci);

    if (normPath(e.from) === normPath(e.to)) {
      conflicts.push({
        code: 'SELF_TARGET',
        level: 'warn',
        itemIds: [e.itemId],
        path: e.to,
        message: '目标与源完全相同，已自动降级为保留',
        resolvable: true,
      });
      continue;
    }

    // a.txt → A.txt：在大小写不敏感盘上合法，必须特判放行
    const caseOnlyRename =
      e.action === 'rename' && fromKey === toKey && normPath(e.from) !== normPath(e.to);

    if (caseOnlyRename) {
      conflicts.push({
        code: 'CASE_ONLY_RENAME',
        level: 'warn',
        itemIds: [e.itemId],
        path: e.to,
        message: '仅大小写变更，执行时用两步改名规避',
        resolvable: true,
      });
      continue;
    }

    const prev = claims.get(toKey);
    if (prev) {
      const sameText = normPath(prev.to ?? '') === normPath(e.to);
      conflicts.push({
        code: sameText ? 'BATCH_DUPLICATE' : 'CASE_COLLISION',
        level: 'error',
        itemIds: [prev.itemId, e.itemId],
        path: e.to,
        message: sameText
          ? `本批次内有另一个文件也要变成 ${name}`
          : `与 ${baseNameOf(prev.to ?? '')} 仅大小写不同，在不区分大小写的磁盘上会撞车`,
        resolvable: true,
      });
      continue;
    }
    claims.set(toKey, e);

    if (occupied.has(toKey)) {
      conflicts.push({
        code: 'TARGET_EXISTS',
        level: 'error',
        itemIds: [e.itemId],
        path: e.to,
        message: `目标位置已存在 ${name}`,
        resolvable: true,
      });
    }
  }

  // 空间检查：只有复制才真正增加占用；跨盘移动也算一份
  if (world.freeBytes !== null) {
    let need = 0;
    for (const e of plan) if (e.action === 'copy') need += e.size;
    if (need > world.freeBytes) {
      conflicts.push({
        code: 'DISK_FULL',
        level: 'error',
        itemIds: [],
        path: '',
        message: `需要 ${fmtBytes(need)}，目标盘剩余 ${fmtBytes(world.freeBytes)}`,
        resolvable: false,
      });
    }
  }

  return conflicts;
}

export interface PolicyResult {
  plan: PlanEntry[];
  /** 仍会阻止执行的冲突 */
  blocking: Conflict[];
  /** 被策略处理掉的冲突数 */
  resolved: number;
}

/**
 * 冲突策略在**计划阶段**就应用，执行器不参与任何决策。
 * 理由：用户点"执行"之前看到的必须是最终会发生的事，否则预演是假的；
 * 而且改策略要能立刻重算预览。
 */
export function applyPolicy(
  plan: readonly PlanEntry[],
  conflicts: readonly Conflict[],
  policy: ConflictPolicy,
  world: ConflictWorld,
): PolicyResult {
  const ci = world.caseInsensitiveFs;
  const next = plan.map((e) => ({ ...e }));
  const byItem = new Map<string, Conflict[]>();
  for (const c of conflicts) {
    for (const id of c.itemIds) {
      const arr = byItem.get(id) ?? [];
      arr.push(c);
      byItem.set(id, arr);
    }
  }

  const occupied = new Set(world.existingPaths);
  for (const e of next) if (e.action === 'move' || e.action === 'delete') occupied.delete(pathKey(e.from, ci));

  let resolved = 0;
  const keepBlocking = new Set<Conflict>();

  for (const e of next) {
    const cs = byItem.get(e.itemId);
    if (!cs || !cs.length) {
      if (e.to && e.action !== 'keep' && e.action !== 'delete') occupied.add(pathKey(e.to, ci));
      continue;
    }

    const codes = new Set<ConflictCode>(cs.map((c) => c.code));

    if (codes.has('INVALID_NAME')) {
      e.blocked = cs.find((c) => c.code === 'INVALID_NAME')!.message;
      cs.forEach((c) => keepBlocking.add(c));
      continue;
    }
    if (codes.has('SELF_TARGET')) {
      e.action = 'keep';
      e.to = e.from;
      resolved++;
      continue;
    }
    if (codes.has('CASE_ONLY_RENAME')) {
      // 执行器用 临时名 → 目标名 两步走，计划本身不变
      occupied.add(pathKey(e.to!, ci));
      continue;
    }

    const hard = cs.find(
      (c) => c.code === 'TARGET_EXISTS' || c.code === 'BATCH_DUPLICATE' || c.code === 'CASE_COLLISION',
    );
    if (!hard) continue;

    if (policy === 'skip') {
      e.action = 'keep';
      e.to = e.from;
      e.blocked = '目标已存在，按策略跳过';
      resolved++;
      continue;
    }
    if (policy === 'overwrite') {
      e.overwrite = true;
      occupied.add(pathKey(e.to!, ci));
      resolved++;
      continue;
    }

    // autoRename：按计划顺序对"已占用目标集合"去重，避免改名本身又撞车
    const dir = normPath(e.to!).slice(0, normPath(e.to!).lastIndexOf('/'));
    const name = baseNameOf(e.to!);
    const fresh = freeName(dir, name, occupied, ci);
    e.to = dir + '/' + fresh;
    e.reason = e.reason ? `${e.reason} · 自动重命名` : '自动重命名';
    occupied.add(pathKey(e.to, ci));
    resolved++;
  }

  for (const c of conflicts) if (c.code === 'DISK_FULL') keepBlocking.add(c);

  return { plan: next, blocking: [...keepBlocking], resolved };
}
