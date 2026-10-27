import type { FileItem, StepIssue } from './item.ts';

/** 右侧参数面板由这份描述自动渲染 —— 积木自己声明表单，UI 不认识具体积木 */
export type FieldSpec =
  | { key: string; kind: 'text'; label: string; placeholder?: string; help?: string; mono?: boolean }
  | { key: string; kind: 'number'; label: string; min?: number; max?: number; step?: number; unit?: string; help?: string }
  | { key: string; kind: 'select'; label: string; options: { value: string; label: string }[]; help?: string }
  | { key: string; kind: 'toggle'; label: string; help?: string }
  | { key: string; kind: 'extList'; label: string; presets: string[]; help?: string }
  | { key: string; kind: 'template'; label: string; help?: string }
  | { key: string; kind: 'dir'; label: string; role: 'source' | 'target'; help?: string };

export interface StepStats {
  /** 进入该步的条目总数（含已排除/已删除） */
  total: number;
  /** 该步输出后仍然参与后续步骤的条目数 */
  active: number;
  /** 该步真正改写过的条目数 */
  changed: number;
  /** 该步移出流程的条目数（排除或删除） */
  dropped: number;
}

export interface StepResult {
  items: FileItem[];
  issues: StepIssue[];
  stats: StepStats;
}

export interface StepContext {
  /** 冻结的"当前时间"，保证同一份文档可重放出同样结果 */
  readonly now: number;
  readonly platform: 'win32' | 'darwin' | 'linux';
  readonly caseInsensitiveFs: boolean;
}

export type StepRun<P> = (
  items: readonly FileItem[],
  params: P,
  ctx: StepContext,
  stepId: string,
) => StepResult;

export type StepCategory = 'source' | 'order' | 'filter' | 'transform' | 'output';

export interface StepDefinition<P = Record<string, unknown>> {
  /** 稳定标识，也是项目文件里的 type 字段 */
  type: string;
  name: string;
  category: StepCategory;
  /** Icon 组件里的名字 */
  icon: string;
  /** 一句话说明，出现在积木选择器和空态引导里 */
  hint: string;
  fields: FieldSpec[];
  defaults: P;
  /** 参数级校验：右侧面板即时红字，不等重算 */
  validate?: (params: P, ctx: StepContext) => StepIssue[];
  /** 积木卡片上的副标题，展示当前参数摘要 */
  summary: (params: P) => string;
  run: StepRun<P>;
}

export function statsOf(items: readonly FileItem[], changed: number, dropped: number): StepStats {
  let active = 0;
  for (const it of items) if (it.status === 'active') active++;
  return { total: items.length, active, changed, dropped };
}
