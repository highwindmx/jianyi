import type { FileItem } from '../model/item.ts';
import { normPath } from '../model/item.ts';
import type { StepDefinition } from '../model/step.ts';
import { renderTemplate, checkTemplate } from '../engine/tokens.ts';
import { globToRegExp, makeStats, touch } from './_shared.ts';

/* ───────────────────────── 移动 / 复制 ───────────────────────── */

export interface MoveParams {
  targetDir: string;
  operation: 'move' | 'copy';
  subPath: string;
}

export const moveTo: StepDefinition<MoveParams> = {
  type: 'output.move',
  name: '移动 / 复制',
  category: 'output',
  icon: 'move',
  hint: '把结果送到目标文件夹，可带日期子目录',
  fields: [
    { key: 'targetDir', kind: 'dir', label: '目标文件夹', role: 'target' },
    {
      key: 'operation',
      kind: 'select',
      label: '方式',
      options: [
        { value: 'move', label: '移动（原位置不再保留）' },
        { value: 'copy', label: '复制（保留原文件）' },
      ],
    },
    {
      key: 'subPath',
      kind: 'template',
      label: '子目录模板（可选）',
      help: '例如 {日期:YYYY-MM} 会按修改月份分子目录归档',
    },
  ],
  defaults: { targetDir: 'D:/整理/音乐', operation: 'move', subPath: '' },
  validate: (p) => {
    const issues = [];
    if (!p.targetDir.trim()) {
      issues.push({ level: 'error' as const, code: 'NO_TARGET', message: '请选择目标文件夹' });
    }
    const bad = checkTemplate(p.subPath);
    if (bad.length) {
      issues.push({ level: 'error' as const, code: 'BAD_TOKEN', message: `未知变量 ${bad.join(' ')}` });
    }
    return issues;
  },
  summary: (p) => `${p.operation === 'move' ? '移至' : '复制到'} ${p.targetDir || '—'}${p.subPath ? '/' + p.subPath : ''}`,
  run: (items, p, _ctx, stepId) => {
    const target = normPath(p.targetDir);
    let changed = 0;
    const out = items.map((it) => {
      if (it.status !== 'active') return it;
      let dir = target;
      if (p.subPath.trim()) {
        const sub = normPath(renderTemplate(p.subPath, it).text).replace(/^\/+|\/+$/g, '');
        if (sub) dir = target + '/' + sub;
      }
      if (dir === it.cur.dir && it.copyAs === (p.operation === 'copy')) return it;
      changed++;
      const next: FileItem = { ...it, cur: { ...it.cur, dir }, copyAs: p.operation === 'copy' };
      return touch(next, stepId, {});
    });
    return { items: out, issues: [], stats: makeStats(out, changed, 0) };
  },
};

/* ───────────────────────── 删除 ───────────────────────── */

export interface DeleteParams {
  glob: string;
}

export const deleteRule: StepDefinition<DeleteParams> = {
  type: 'output.delete',
  name: '删除',
  category: 'output',
  icon: 'trash',
  hint: '移入暂存区，可撤销，永不真删',
  fields: [
    {
      key: 'glob',
      kind: 'text',
      label: '只删匹配的文件（可选）',
      placeholder: '留空 = 删除全部剩余文件',
      mono: true,
      help: '匹配的是当前文件名，支持 * 与 ?',
    },
  ],
  defaults: { glob: '' },
  summary: (p) => (p.glob ? `删除匹配 ${p.glob}` : '删除全部剩余'),
  run: (items, p, _ctx, stepId) => {
    const re = p.glob.trim() ? globToRegExp(p.glob.trim()) : null;
    let dropped = 0;
    const out = items.map((it) => {
      if (it.status !== 'active') return it;
      if (re && !re.test(it.cur.name)) return it;
      dropped++;
      return touch(it, stepId, { status: 'deleted', deletedBy: stepId });
    });
    const issues = [];
    if (!re && dropped > 0) {
      issues.push({ level: 'warn' as const, code: 'DELETE_ALL', message: `将删除全部 ${dropped} 个文件（进暂存区，可撤销）` });
    }
    return { items: out, issues, stats: makeStats(out, 0, dropped) };
  },
};
