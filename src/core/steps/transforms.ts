import type { FileItem } from '../model/item.ts';
import type { StepDefinition } from '../model/step.ts';
import { makeStats, touch } from './_shared.ts';

function setBase(it: FileItem, newBase: string): FileItem {
  if (newBase === it.cur.base) return it;
  return { ...it, cur: { ...it.cur, base: newBase, name: newBase + it.cur.ext } };
}

function setExt(it: FileItem, newExt: string): FileItem {
  if (newExt === it.cur.ext) return it;
  return { ...it, cur: { ...it.cur, ext: newExt, name: it.cur.base + newExt } };
}

/* ───────────────────────── 去空格 ───────────────────────── */

export interface TrimParams {
  where: 'both' | 'leading' | 'trailing';
  collapse: boolean;
  fullWidth: boolean;
}

export const transformTrim: StepDefinition<TrimParams> = {
  type: 'transform.trim',
  name: '去空格',
  category: 'transform',
  icon: 'trim',
  hint: '清理首尾空格、连续空格、全角空格',
  fields: [
    {
      key: 'where',
      kind: 'select',
      label: '清理位置',
      options: [
        { value: 'both', label: '首尾都清' },
        { value: 'leading', label: '只清开头' },
        { value: 'trailing', label: '只清结尾' },
      ],
    },
    { key: 'collapse', kind: 'toggle', label: '合并连续空格', help: '把多个空格压成一个' },
    { key: 'fullWidth', kind: 'toggle', label: '处理全角空格', help: '把　（U+3000）当成普通空格' },
  ],
  defaults: { where: 'both', collapse: true, fullWidth: true },
  summary: (p) => {
    const parts = [p.where === 'both' ? '首尾' : p.where === 'leading' ? '开头' : '结尾'];
    if (p.collapse) parts.push('合并连续');
    if (p.fullWidth) parts.push('含全角');
    return '清理 ' + parts.join(' · ');
  },
  run: (items, p, _ctx, stepId) => {
    let changed = 0;
    const out = items.map((it) => {
      if (it.status !== 'active') return it;
      let s = it.cur.base;
      if (p.fullWidth) s = s.replace(/\u3000/g, ' ');
      if (p.collapse) s = s.replace(/ {2,}/g, ' ');
      if (p.where !== 'trailing') s = s.replace(/^ +/, '');
      if (p.where !== 'leading') s = s.replace(/ +$/, '');
      const next = setBase(it, s);
      if (next === it) return it;
      changed++;
      return touch(next, stepId, {});
    });
    return { items: out, issues: [], stats: makeStats(out, changed, 0) };
  },
};

/* ───────────────────────── 大小写 ───────────────────────── */

export interface CaseParams {
  mode: 'lower' | 'upper' | 'title' | 'sentence';
  target: 'base' | 'ext' | 'both';
}

function toTitle(s: string): string {
  return s.replace(/(^|[\s\-_·])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export const transformCase: StepDefinition<CaseParams> = {
  type: 'transform.case',
  name: '大小写',
  category: 'transform',
  icon: 'case',
  hint: '统一转小写、大写、词首大写',
  fields: [
    {
      key: 'mode',
      kind: 'select',
      label: '转换方式',
      options: [
        { value: 'lower', label: '全部小写' },
        { value: 'upper', label: '全部大写' },
        { value: 'title', label: '词首大写' },
        { value: 'sentence', label: '句首大写' },
      ],
    },
    {
      key: 'target',
      kind: 'select',
      label: '作用范围',
      options: [
        { value: 'base', label: '仅文件名' },
        { value: 'ext', label: '仅扩展名' },
        { value: 'both', label: '两者都改' },
      ],
    },
  ],
  defaults: { mode: 'title', target: 'base' },
  summary: (p) => {
    const m: Record<string, string> = { lower: '全小写', upper: '全大写', title: '词首大写', sentence: '句首大写' };
    return m[p.mode] + (p.target === 'ext' ? ' · 扩展名' : p.target === 'both' ? ' · 含扩展名' : '');
  },
  run: (items, p, _ctx, stepId) => {
    let changed = 0;
    const conv = (s: string): string => {
      switch (p.mode) {
        case 'lower':
          return s.toLowerCase();
        case 'upper':
          return s.toUpperCase();
        case 'title':
          return toTitle(s);
        case 'sentence':
          return s.charAt(0).toUpperCase() + s.slice(1);
      }
    };
    const out = items.map((it) => {
      if (it.status !== 'active') return it;
      let next = it;
      if (p.target !== 'ext') next = setBase(next, conv(next.cur.base));
      if (p.target !== 'base') next = setExt(next, conv(next.cur.ext));
      if (next === it) return it;
      changed++;
      return touch(next, stepId, {});
    });
    return { items: out, issues: [], stats: makeStats(out, changed, 0) };
  },
};

/* ───────────────────────── 正则替换 ───────────────────────── */

export interface ReplaceParams {
  find: string;
  replace: string;
  isRegex: boolean;
  global: boolean;
  caseSensitive: boolean;
}

export const transformReplace: StepDefinition<ReplaceParams> = {
  type: 'transform.replace',
  name: '查找替换',
  category: 'transform',
  icon: 'replace',
  hint: '支持正则与 $1 捕获组',
  fields: [
    { key: 'find', kind: 'text', label: '查找', placeholder: '\\s*-\\s*副本', mono: true },
    { key: 'replace', kind: 'text', label: '替换为', placeholder: '', mono: true, help: '正则模式下可用 $1 $2 引用捕获组' },
    { key: 'isRegex', kind: 'toggle', label: '使用正则' },
    { key: 'global', kind: 'toggle', label: '替换全部匹配' },
    { key: 'caseSensitive', kind: 'toggle', label: '区分大小写' },
  ],
  defaults: { find: '', replace: '', isRegex: false, global: true, caseSensitive: false },
  validate: (p) => {
    if (!p.find) return [{ level: 'warn', code: 'EMPTY_FIND', message: '查找内容为空，本步不会生效' }];
    if (p.isRegex) {
      try {
        new RegExp(p.find);
      } catch (e) {
        return [{ level: 'error', code: 'BAD_REGEX', message: '正则无效：' + (e as Error).message }];
      }
    }
    return [];
  },
  summary: (p) => (p.find ? `${p.isRegex ? '/' : ''}${p.find}${p.isRegex ? '/' : ''} → ${p.replace || '（删除）'}` : '未设置查找内容'),
  run: (items, p, _ctx, stepId) => {
    if (!p.find) return { items: items as FileItem[], issues: [], stats: makeStats(items, 0, 0) };
    let matcher: RegExp;
    try {
      const flags = (p.global ? 'g' : '') + (p.caseSensitive ? '' : 'i');
      matcher = p.isRegex ? new RegExp(p.find, flags) : new RegExp(p.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    } catch (e) {
      return {
        items: items as FileItem[],
        issues: [{ level: 'error', code: 'BAD_REGEX', message: '正则无效：' + (e as Error).message }],
        stats: makeStats(items, 0, 0),
      };
    }
    let changed = 0;
    const out = items.map((it) => {
      if (it.status !== 'active') return it;
      matcher.lastIndex = 0;
      const s = it.cur.base.replace(matcher, p.replace);
      const next = setBase(it, s);
      if (next === it) return it;
      changed++;
      return touch(next, stepId, {});
    });
    return { items: out, issues: [], stats: makeStats(out, changed, 0) };
  },
};
