import type { PipelineDoc, StepInstance } from '../model/pipeline.ts';
import { newStepId } from '../model/pipeline.ts';
import { getStep } from '../steps/registry.ts';

function step(type: string, params: Record<string, unknown>): StepInstance {
  const def = getStep(type);
  const base = def ? structuredClone(def.defaults) : {};
  return { id: newStepId(), type, enabled: true, params: { ...base, ...params } };
}

/** 内置模板 1：整理下载文件夹（也是设计文档里的端到端演示） */
export function demoPipeline(): PipelineDoc {
  return {
    version: 1,
    name: '整理下载文件夹 · 音乐归档',
    conflictPolicy: 'autoRename',
    excludedIds: [],
    overrides: {},
    steps: [
      step('source.scan', { path: 'D:/下载', recursive: true, includeHidden: false }),
      step('filter.extension', { mode: 'keep', exts: ['.mp3', '.flac', '.wav', '.lrc', '.txt'] }),
      step('filter.extension', { mode: 'exclude', exts: ['.lrc', '.txt'] }),
      step('order.sort', { by: 'name', order: 'asc', natural: true }),
      step('transform.trim', { where: 'both', collapse: true, fullWidth: true }),
      step('rename.template', { template: '{序号:3}_{原名}', startAt: 1, keepExt: true }),
      step('output.move', { targetDir: 'D:/整理/音乐', operation: 'move', subPath: '' }),
    ],
  };
}

/** 内置模板 2：照片按日期归档 */
export function photoPipeline(): PipelineDoc {
  return {
    version: 1,
    name: '照片按日期归档',
    conflictPolicy: 'autoRename',
    excludedIds: [],
    overrides: {},
    steps: [
      step('source.scan', { path: 'D:/下载', recursive: true, includeHidden: false }),
      step('filter.extension', { mode: 'keep', exts: ['.jpg', '.png'] }),
      step('order.sort', { by: 'mtime', order: 'asc', natural: true }),
      step('rename.template', { template: '{日期:YYYY-MM-DD}_{序号:3}', startAt: 1, keepExt: true }),
      step('output.move', { targetDir: 'D:/整理/照片', operation: 'move', subPath: '{日期:YYYY-MM}' }),
    ],
  };
}

export const PRESETS: { id: string; name: string; desc: string; build: () => PipelineDoc }[] = [
  { id: 'demo', name: '整理下载文件夹', desc: '筛出音频、去空格、加序号前缀、归档到目标文件夹', build: demoPipeline },
  { id: 'photo', name: '照片按日期归档', desc: '按修改日期重命名并按月份分目录', build: photoPipeline },
];
