import type { PlatformAdapter } from '../../platform/types.ts';
import type { PlanEntry } from '../model/plan.ts';

export interface PreflightProblem {
  code: string;
  message: string;
  fatal: boolean;
}

export interface PreflightResult {
  ok: boolean;
  problems: PreflightProblem[];
  neededBytes: number;
  freeBytes: number | null;
}

/**
 * 执行前预检。只做"能不能开始"的判断，不做任何写操作。
 * 真正的落盘闸门还有一道：执行时每个目标落盘前会再 exists() 一次（TOCTOU）。
 */
export async function preflight(
  plan: readonly PlanEntry[],
  adapter: PlatformAdapter,
  opts: { minFreeRatio?: number } = {},
): Promise<PreflightResult> {
  const problems: PreflightProblem[] = [];
  const ratio = opts.minFreeRatio ?? 1.2;

  const blocked = plan.filter((e) => e.blocked).length;
  if (blocked > 0) {
    problems.push({
      code: 'BLOCKED_ENTRIES',
      message: `${blocked} 个条目不可执行（文件名非法或按策略跳过），将被忽略`,
      fatal: false,
    });
  }

  let neededBytes = 0;
  const dirs = new Set<string>();
  for (const e of plan) {
    if (e.action === 'copy') neededBytes += e.size;
    if (e.to && (e.action === 'move' || e.action === 'copy' || e.action === 'rename')) {
      const i = e.to.lastIndexOf('/');
      if (i > 0) dirs.add(e.to.slice(0, i));
    }
  }

  let freeBytes: number | null = null;
  if (dirs.size) {
    const first = [...dirs][0];
    freeBytes = await adapter.freeSpace(first);
    if (freeBytes !== null && neededBytes * ratio > freeBytes) {
      problems.push({
        code: 'DISK_FULL',
        message: `复制需要约 ${(neededBytes / 1024 ** 3).toFixed(2)} GB，目标盘剩余 ${(freeBytes / 1024 ** 3).toFixed(2)} GB`,
        fatal: true,
      });
    }
    for (const d of dirs) {
      const ok = await adapter.canWrite(d);
      if (!ok) {
        problems.push({ code: 'PERMISSION', message: `没有写入权限：${d}`, fatal: true });
      }
    }
  }

  return {
    ok: !problems.some((p) => p.fatal),
    problems,
    neededBytes,
    freeBytes,
  };
}
