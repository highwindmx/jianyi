import type { FileItem } from '../model/item.ts';
import { currentPath, originPath } from '../model/item.ts';
import type { PlanEntry, PlanSummary } from '../model/plan.ts';

export function buildPlan(items: readonly FileItem[], nameOf: (id?: string) => string): PlanEntry[] {
  const plan: PlanEntry[] = [];
  for (const it of items) {
    const from = originPath(it);
    const base = {
      itemId: it.id,
      from,
      touchedBy: it.touchedBy,
      overwrite: false,
      size: it.origin.size,
    };

    if (it.status === 'excluded') {
      plan.push({
        ...base,
        action: 'keep',
        to: from,
        reason:
          it.excludedBy === 'manual'
            ? '手动排除 · 不参与后续步骤'
            : `排除 · 由「${nameOf(it.excludedBy)}」筛除`,
      });
      continue;
    }
    if (it.status === 'deleted') {
      plan.push({ ...base, action: 'delete', to: null, reason: `删除 · 由「${nameOf(it.deletedBy)}」执行` });
      continue;
    }

    const to = currentPath(it);
    const moved = it.cur.dir !== it.origin.dir;
    const renamed = it.cur.name !== it.origin.name;

    if (moved) {
      plan.push({
        ...base,
        action: it.copyAs ? 'copy' : 'move',
        to,
        reason: chainOf(it, nameOf),
      });
    } else if (renamed) {
      plan.push({ ...base, action: 'rename', to, reason: chainOf(it, nameOf) });
    } else {
      plan.push({ ...base, action: 'keep', to: from, reason: '' });
    }
  }
  return plan;
}

function chainOf(it: FileItem, nameOf: (id?: string) => string): string {
  if (!it.touchedBy.length) return '';
  return it.touchedBy.map((id) => nameOf(id)).join(' → ');
}

export function summarize(plan: readonly PlanEntry[]): PlanSummary {
  const s: PlanSummary = {
    rename: 0,
    move: 0,
    copy: 0,
    delete: 0,
    keep: 0,
    excluded: 0,
    conflict: 0,
    blocked: 0,
    affected: 0,
    totalBytes: 0,
    writeBytes: 0,
  };
  for (const e of plan) {
    if (e.action === 'delete') {
      s.delete++;
      s.affected++;
      continue;
    }
    if (e.action === 'keep' || !e.to) {
      s.keep++;
      continue;
    }
    s.affected++;
    // 按"属性"统计而不是按 action：一条 move 条目可能同时也改了文件名，
    // 确认弹窗里要如实说出"改名 N 个、移动 M 个"。
    const fromName = e.from.slice(e.from.lastIndexOf('/') + 1);
    const toName = e.to.slice(e.to.lastIndexOf('/') + 1);
    const fromDir = e.from.slice(0, e.from.lastIndexOf('/'));
    const toDir = e.to.slice(0, e.to.lastIndexOf('/'));
    if (fromName !== toName) s.rename++;
    if (fromDir !== toDir) s.move++;
    if (e.action === 'copy') {
      s.copy++;
      s.writeBytes += e.size;
    }
    s.totalBytes += e.size;
    if (e.blocked) s.blocked++;
  }
  return s;
}
