import type { FileItem, StepIssue } from '../model/item.ts';
import type { StepDefinition, StepStats } from '../model/step.ts';

export type AnyStep = StepDefinition<any>;

/** 命中即改，未命中复用引用 —— 所有积木都遵守这一条，才有后面的增量重算 */
export function touch(
  it: FileItem,
  stepId: string,
  patch: Partial<Pick<FileItem, 'cur' | 'status' | 'issues' | 'deletedBy' | 'excludedBy'>>,
): FileItem {
  const touchedBy = it.touchedBy.includes(stepId) ? it.touchedBy : [...it.touchedBy, stepId];
  return {
    ...it,
    ...patch,
    touchedBy,
    issues: patch.issues ?? it.issues,
  };
}

export function countActive(items: readonly FileItem[]): number {
  let n = 0;
  for (const it of items) if (it.status === 'active') n++;
  return n;
}

export function makeStats(
  items: readonly FileItem[],
  changed: number,
  dropped: number,
): StepStats {
  return { total: items.length, active: countActive(items), changed, dropped };
}

/** glob → RegExp，只支持 * ? 与字符集，够用且不会让用户写出灾难性回溯 */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (const ch of glob) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else if ('\\^$.|+()[]{}'.includes(ch)) re += '\\' + ch;
    else re += ch;
  }
  return new RegExp('^' + re + '$', 'i');
}

export function parseDateMs(s: string): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(t) ? null : t;
}

export type { StepIssue };
