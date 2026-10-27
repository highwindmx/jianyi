import { z } from 'zod';

export type ConflictPolicy = 'skip' | 'overwrite' | 'autoRename';

/** 手动修改用的伪步骤 id，出现在原因链里 */
export const MANUAL_STEP_ID = '__manual__';

export interface StepInstance {
  id: string;
  /** 对应 StepDefinition.type */
  type: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

/** 针对单个文件的手动覆盖（终态生效，优先级高于所有积木） */
export interface ItemOverride {
  /** 新文件名，含扩展名 */
  name?: string;
  /** 新目录 */
  dir?: string;
}

export interface PipelineDoc {
  version: 1;
  name: string;
  /** steps[0] 恒为数据源，不可删除、不可拖出首位 */
  steps: StepInstance[];
  /** 用户在预览里手动排除的条目（是用户输入，不是步骤产物，故不放在 item 上） */
  excludedIds: string[];
  /** 用户对单个文件的手动改写，在所有积木之后生效 */
  overrides: Record<string, ItemOverride>;
  conflictPolicy: ConflictPolicy;
}

let seq = 0;
export function newStepId(prefix = 's'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${seq.toString(36)}`;
}

export function emptyDoc(): PipelineDoc {
  return {
    version: 1,
    name: '未命名流程',
    steps: [],
    excludedIds: [],
    overrides: {},
    conflictPolicy: 'autoRename',
  };
}

export const stepInstanceSchema = z.object({
  id: z.string(),
  type: z.string(),
  enabled: z.boolean(),
  params: z.record(z.unknown()),
});

export const pipelineDocSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  steps: z.array(stepInstanceSchema).min(1, '流程至少要有一个数据源积木'),
  excludedIds: z.array(z.string()).default([]),
  overrides: z
    .record(z.object({ name: z.string().optional(), dir: z.string().optional() }))
    .default({}),
  conflictPolicy: z.enum(['skip', 'overwrite', 'autoRename']).default('autoRename'),
});

export function serializeDoc(doc: PipelineDoc): string {
  return JSON.stringify(doc, null, 2);
}

export type ParseResult =
  | { ok: true; doc: PipelineDoc }
  | { ok: false; error: string };

export function parseDoc(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败：' + (e as Error).message };
  }
  const r = pipelineDocSchema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `项目文件格式不符：${first.path.join('.')} ${first.message}` };
  }
  return { ok: true, doc: r.data as PipelineDoc };
}
