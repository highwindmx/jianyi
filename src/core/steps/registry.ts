import type { StepDefinition, StepCategory } from '../model/step.ts';
import type { StepInstance } from '../model/pipeline.ts';
import { newStepId } from '../model/pipeline.ts';
import { sourceScan } from './source.ts';
import { sortBy } from './order.ts';
import { filterExtension, filterRule } from './filters.ts';
import { transformTrim, transformCase, transformReplace } from './transforms.ts';
import { renameTemplate } from './rename.ts';
import { moveTo, deleteRule } from './output.ts';

/** 所有可用积木。新增一种积木 = 往这里加一项，UI 完全不用改。 */
export const STEPS: StepDefinition<any>[] = [
  sourceScan,
  sortBy,
  filterExtension,
  filterRule,
  transformTrim,
  transformCase,
  transformReplace,
  renameTemplate,
  moveTo,
  deleteRule,
];

const STEP_MAP = new Map(STEPS.map((s) => [s.type, s]));

export function getStep(type: string): StepDefinition<any> | undefined {
  return STEP_MAP.get(type);
}

export const CATEGORY_META: Record<StepCategory, { label: string; color: string }> = {
  source: { label: '数据源', color: 'var(--cat-source)' },
  order: { label: '排序', color: 'var(--cat-order)' },
  filter: { label: '筛选', color: 'var(--cat-filter)' },
  transform: { label: '变换', color: 'var(--cat-transform)' },
  output: { label: '输出', color: 'var(--cat-output)' },
};

export function createStep(type: string): StepInstance | null {
  const def = STEP_MAP.get(type);
  if (!def) return null;
  return { id: newStepId(), type, enabled: true, params: structuredClone(def.defaults) };
}

export function stepSummary(step: StepInstance): string {
  const def = STEP_MAP.get(step.type);
  if (!def) return '未知积木：' + step.type;
  try {
    return def.summary(step.params);
  } catch {
    return '';
  }
}

export function stepTitle(step: StepInstance): string {
  return STEP_MAP.get(step.type)?.name ?? step.type;
}

/** 给用户挑积木用的分组清单（数据源不在其中，它只能有一个且恒在首位） */
export function paletteGroups(): { category: StepCategory; items: StepDefinition<any>[] }[] {
  const order: StepCategory[] = ['order', 'filter', 'transform', 'output'];
  return order.map((category) => ({
    category,
    items: STEPS.filter((s) => s.category === category),
  }));
}
