import type { StepDefinition } from '../model/step.ts';
import { makeStats } from './_shared.ts';

export interface SourceParams {
  path: string;
  recursive: boolean;
  includeHidden: boolean;
}

/**
 * 数据源。全流程唯一的 IO 入口 —— 扫描发生在编译之前（边界处），
 * 所以这个积木的 run 是恒等变换，它只负责携带参数、触发重扫。
 */
export const sourceScan: StepDefinition<SourceParams> = {
  type: 'source.scan',
  name: '数据源',
  category: 'source',
  icon: 'folder',
  hint: '选择要处理的文件夹，流程的起点',
  fields: [
    { key: 'path', kind: 'dir', label: '源文件夹', role: 'source' },
    { key: 'recursive', kind: 'toggle', label: '包含子文件夹', help: '关闭则只处理第一层文件' },
    { key: 'includeHidden', kind: 'toggle', label: '包含隐藏文件', help: '以 . 开头的文件' },
  ],
  defaults: { path: 'D:/下载', recursive: true, includeHidden: false },
  validate: (p) =>
    p.path.trim() ? [] : [{ level: 'error', code: 'NO_PATH', message: '请选择一个文件夹' }],
  summary: (p) => p.path || '未选择文件夹',
  run: (items) => ({
    // 扫描在编译边界完成，这里原样透传（只读视图转可变引用，不复制）
    items: items as import('../model/item.ts').FileItem[],
    issues: [],
    stats: makeStats(items, 0, 0),
  }),
};
