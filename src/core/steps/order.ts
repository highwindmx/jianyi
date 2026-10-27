import type { FileItem } from '../model/item.ts';
import type { StepDefinition } from '../model/step.ts';
import { makeStats } from './_shared.ts';

export interface SortParams {
  by: 'name' | 'ext' | 'size' | 'mtime' | 'path';
  order: 'asc' | 'desc';
  natural: boolean;
}

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

function keyOfItem(it: FileItem, by: SortParams['by']): string | number {
  switch (by) {
    case 'ext':
      return it.cur.ext.toLowerCase() || '\uffff';
    case 'size':
      return it.origin.size;
    case 'mtime':
      return it.origin.mtimeMs;
    case 'path':
      return it.origin.dir.toLowerCase() + '/' + it.origin.name.toLowerCase();
    case 'name':
    default:
      return it.cur.name.toLowerCase();
  }
}

/**
 * 排序。数组顺序即表格顺序，也是 {序号} 的来源 —— 所以"排序"这个积木
 * 直接决定了后面模板重命名的编号。
 *
 * 只对参与后续的条目排序；已排除/已删除的条目按原相对顺序沉到底部，
 * 避免预览表里出现"死行乱插"的观感。
 */
export const sortBy: StepDefinition<SortParams> = {
  type: 'order.sort',
  name: '排序',
  category: 'order',
  icon: 'sort',
  hint: '决定顺序，也是 {序号} 的编号依据',
  fields: [
    {
      key: 'by',
      kind: 'select',
      label: '排序依据',
      options: [
        { value: 'name', label: '文件名' },
        { value: 'ext', label: '扩展名' },
        { value: 'size', label: '大小' },
        { value: 'mtime', label: '修改日期' },
        { value: 'path', label: '原路径' },
      ],
    },
    {
      key: 'order',
      kind: 'select',
      label: '方向',
      options: [
        { value: 'asc', label: '升序' },
        { value: 'desc', label: '降序' },
      ],
    },
    { key: 'natural', kind: 'toggle', label: '自然排序', help: '让 track2 排在 track10 前面' },
  ],
  defaults: { by: 'name', order: 'asc', natural: true },
  summary: (p) => {
    const m: Record<string, string> = { name: '文件名', ext: '扩展名', size: '大小', mtime: '修改日期', path: '原路径' };
    return `${m[p.by]} · ${p.order === 'asc' ? '升序' : '降序'}`;
  },
  run: (items, p) => {
    const active: FileItem[] = [];
    const rest: FileItem[] = [];
    for (const it of items) (it.status === 'active' ? active : rest).push(it);

    const dir = p.order === 'asc' ? 1 : -1;
    active.sort((a, b) => {
      const ka = keyOfItem(a, p.by);
      const kb = keyOfItem(b, p.by);
      let c: number;
      if (typeof ka === 'number' && typeof kb === 'number') c = ka - kb;
      else if (p.natural) c = collator.compare(String(ka), String(kb));
      else c = String(ka) < String(kb) ? -1 : String(ka) > String(kb) ? 1 : 0;
      return c * dir;
    });

    const out = [...active, ...rest];
    return { items: out, issues: [], stats: makeStats(out, 0, 0) };
  },
};
