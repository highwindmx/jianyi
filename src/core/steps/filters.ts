import type { FileItem } from '../model/item.ts';
import type { StepDefinition } from '../model/step.ts';
import { globToRegExp, makeStats, parseDateMs, touch } from './_shared.ts';

/* ───────────────────────── 按扩展名筛选 ───────────────────────── */

export interface FilterExtParams {
  mode: 'keep' | 'exclude';
  exts: string[];
}

function normExt(e: string): string {
  const s = e.trim().toLowerCase();
  if (!s) return '';
  return s.startsWith('.') ? s : '.' + s;
}

export const filterExtension: StepDefinition<FilterExtParams> = {
  type: 'filter.extension',
  name: '按扩展名筛选',
  category: 'filter',
  icon: 'filter',
  hint: '只留某几类文件，或把某几类踢出去',
  fields: [
    {
      key: 'mode',
      kind: 'select',
      label: '模式',
      options: [
        { value: 'keep', label: '只保留这些扩展名' },
        { value: 'exclude', label: '排除这些扩展名' },
      ],
    },
    {
      key: 'exts',
      kind: 'extList',
      label: '扩展名',
      presets: ['.mp3', '.flac', '.wav', '.m4a', '.lrc', '.txt', '.jpg', '.png', '.mp4', '.zip'],
      help: '不区分大小写，点与不点都能识别',
    },
  ],
  defaults: { mode: 'keep', exts: ['.mp3', '.flac', '.wav', '.m4a'] },
  validate: (p) =>
    p.exts.filter(Boolean).length
      ? []
      : [{ level: 'warn', code: 'EMPTY_EXTS', message: '没有选择任何扩展名，本步不会生效' }],
  summary: (p) => {
    const list = p.exts.join(' ');
    return `${p.mode === 'keep' ? '保留' : '排除'} ${list || '—'}`;
  },
  run: (items, p, _ctx, stepId) => {
    const set = new Set(p.exts.map(normExt).filter(Boolean));
    let dropped = 0;
    const out = items.map((it) => {
      if (it.status !== 'active' || set.size === 0) return it;
      const hit = set.has(it.cur.ext.toLowerCase());
      const drop = p.mode === 'keep' ? !hit : hit;
      if (!drop) return it;
      dropped++;
      return touch(it, stepId, { status: 'excluded', excludedBy: stepId });
    });
    return { items: out, issues: [], stats: makeStats(out, 0, dropped) };
  },
};

/* ───────────────────────── 按条件筛选 / 排除 ───────────────────────── */

export interface FilterRuleParams {
  mode: 'keep' | 'exclude';
  glob: string;
  regex: string;
  minKb: number;
  maxKb: number;
  after: string;
  before: string;
}

function buildPredicate(p: FilterRuleParams): ((it: FileItem) => boolean) | string {
  const tests: ((it: FileItem) => boolean)[] = [];

  if (p.glob.trim()) {
    const re = globToRegExp(p.glob.trim());
    tests.push((it) => re.test(it.cur.name));
  }
  if (p.regex.trim()) {
    let re: RegExp;
    try {
      re = new RegExp(p.regex, 'i');
    } catch (e) {
      return '正则表达式无效：' + (e as Error).message;
    }
    tests.push((it) => re.test(it.cur.name));
  }
  if (p.minKb > 0) {
    const min = p.minKb * 1024;
    tests.push((it) => it.origin.size >= min);
  }
  if (p.maxKb > 0) {
    const max = p.maxKb * 1024;
    tests.push((it) => it.origin.size <= max);
  }
  const after = parseDateMs(p.after);
  if (after !== null) tests.push((it) => it.origin.mtimeMs >= after);
  const before = parseDateMs(p.before);
  if (before !== null) tests.push((it) => it.origin.mtimeMs <= before + 86399999);

  return (it) => tests.every((t) => t(it));
}

export const filterRule: StepDefinition<FilterRuleParams> = {
  type: 'filter.rule',
  name: '条件筛选',
  category: 'filter',
  icon: 'sliders',
  hint: '通配符、正则、大小、日期，多个条件同时满足才命中',
  fields: [
    {
      key: 'mode',
      kind: 'select',
      label: '模式',
      options: [
        { value: 'keep', label: '只保留命中的' },
        { value: 'exclude', label: '排除命中的' },
      ],
    },
    { key: 'glob', kind: 'text', label: '通配符', placeholder: '* - 副本*', mono: true },
    { key: 'regex', kind: 'text', label: '正则', placeholder: '^\\d{4}-\\d{2}', mono: true },
    { key: 'minKb', kind: 'number', label: '最小体积', min: 0, unit: 'KB' },
    { key: 'maxKb', kind: 'number', label: '最大体积', min: 0, unit: 'KB' },
    { key: 'after', kind: 'text', label: '修改日期不早于', placeholder: 'YYYY-MM-DD' },
    { key: 'before', kind: 'text', label: '修改日期不晚于', placeholder: 'YYYY-MM-DD' },
  ],
  defaults: { mode: 'exclude', glob: '', regex: '', minKb: 0, maxKb: 0, after: '', before: '' },
  validate: (p) => {
    const r = buildPredicate(p);
    return typeof r === 'string' ? [{ level: 'error', code: 'BAD_REGEX', message: r }] : [];
  },
  summary: (p) => {
    const parts = [p.glob, p.regex && `/${p.regex}/`, p.minKb > 0 && `≥${p.minKb}KB`, p.maxKb > 0 && `≤${p.maxKb}KB`, p.after && `≥${p.after}`, p.before && `≤${p.before}`].filter(Boolean);
    return `${p.mode === 'keep' ? '保留' : '排除'} ${parts.join(' · ') || '（无条件）'}`;
  },
  run: (items, p, _ctx, stepId) => {
    const pred = buildPredicate(p);
    if (typeof pred === 'string') {
      return { items: items as FileItem[], issues: [{ level: 'error', code: 'BAD_REGEX', message: pred }], stats: makeStats(items, 0, 0) };
    }
    let dropped = 0;
    const out = items.map((it) => {
      if (it.status !== 'active') return it;
      const hit = pred(it);
      const drop = p.mode === 'keep' ? !hit : hit;
      if (!drop) return it;
      dropped++;
      return touch(it, stepId, { status: 'excluded', excludedBy: stepId });
    });
    return { items: out, issues: [], stats: makeStats(out, 0, dropped) };
  },
};
