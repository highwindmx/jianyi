import type { FileItem, StepIssue } from '../model/item.ts';
import { splitExt } from '../model/item.ts';
import type { StepDefinition } from '../model/step.ts';
import { renderTemplate, checkTemplate } from '../engine/tokens.ts';
import { validateFileName } from '../engine/paths.ts';
import { makeStats } from './_shared.ts';

export interface RenameTemplateParams {
  template: string;
  startAt: number;
  keepExt: boolean;
}

/**
 * 模板重命名。序号 = 条目在当前数组里的位置（从 startAt 起），
 * 所以它天然跟随上游"排序"积木 —— 这也是为什么排序必须排在重命名前面。
 */
export const renameTemplate: StepDefinition<RenameTemplateParams> = {
  type: 'rename.template',
  name: '模板重命名',
  category: 'transform',
  icon: 'tag',
  hint: '用变量拼出新文件名，{原名}_{序号:3}_{日期}',
  fields: [
    { key: 'template', kind: 'template', label: '文件名模板', help: '只写主干，扩展名默认保留' },
    { key: 'startAt', kind: 'number', label: '序号起始', min: 1, max: 99999 },
    { key: 'keepExt', kind: 'toggle', label: '保留原扩展名' },
  ],
  defaults: { template: '{原名}', startAt: 1, keepExt: true },
  validate: (p) => {
    const bad = checkTemplate(p.template);
    const issues: StepIssue[] = [];
    if (bad.length) {
      issues.push({ level: 'error', code: 'BAD_TOKEN', message: `未知变量 ${bad.join(' ')}` });
    }
    if (!p.template.trim()) {
      issues.push({ level: 'error', code: 'EMPTY_TEMPLATE', message: '模板不能为空' });
    }
    return issues;
  },
  summary: (p) => p.template || '（空模板）',
  run: (items, p, ctx, stepId) => {
    const issues: StepIssue[] = [];
    const bad = checkTemplate(p.template);
    if (bad.length) {
      issues.push({ level: 'error', code: 'BAD_TOKEN', message: `未知变量 ${bad.join(' ')}，将原样保留` });
    }

    let n = Math.max(1, p.startAt) - 1;
    let changed = 0;

    const out = items.map((it) => {
      if (it.status !== 'active') return it;
      n++;

      // 先落序号，模板才能读到正确的 {序号}
      const withSeq: FileItem = it.cur.seq === n ? it : { ...it, cur: { ...it.cur, seq: n } };
      const rendered = renderTemplate(p.template, withSeq);
      const text = rendered.text.trim();

      let base: string;
      let ext: string;
      let name: string;
      if (p.keepExt) {
        base = text;
        ext = withSeq.cur.ext;
        name = base + ext;
      } else {
        const s = splitExt(text);
        base = s.base;
        ext = s.ext;
        name = text;
      }

      const itemIssues: StepIssue[] = [];
      const badName = validateFileName(name, ctx.platform);
      if (badName) itemIssues.push({ ...badName, itemId: it.id });

      if (name === withSeq.cur.name && withSeq === it) return it;

      changed++;
      const touchedBy = it.touchedBy.includes(stepId) ? it.touchedBy : [...it.touchedBy, stepId];
      return {
        ...withSeq,
        cur: { ...withSeq.cur, base, ext, name },
        touchedBy,
        issues: itemIssues.length ? [...it.issues.filter((x) => x.code !== 'INVALID_NAME'), ...itemIssues] : it.issues,
      };
    });

    const badCount = out.reduce((acc, it) => acc + (it.issues.some((x) => x.code === 'INVALID_NAME') ? 1 : 0), 0);
    if (badCount > 0) {
      issues.push({ level: 'error', code: 'INVALID_NAME', message: `${badCount} 个文件名不合法，执行时会被跳过` });
    }

    return { items: out, issues, stats: makeStats(out, changed, 0) };
  },
};
