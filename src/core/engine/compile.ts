import type { FileItem, StepIssue } from '../model/item.ts';
import { normPath, splitExt } from '../model/item.ts';
import type { PipelineDoc, ItemOverride } from '../model/pipeline.ts';
import { MANUAL_STEP_ID } from '../model/pipeline.ts';
import type { Conflict, PlanEntry, PlanSummary } from '../model/plan.ts';
import type { StepContext, StepStats } from '../model/step.ts';
import { getStep } from '../steps/registry.ts';
import { buildPlan, summarize } from './plan.ts';
import { applyPolicy, detectConflicts } from './conflicts.ts';
import type { ConflictWorld } from './conflicts.ts';

export interface CompiledStage {
  index: number;
  stepId: string;
  type: string;
  title: string;
  enabled: boolean;
  /** 该步的输出（含已被排除/删除的条目，只是 status 不同） */
  items: FileItem[];
  stats: StepStats;
  issues: StepIssue[];
  durationMs: number;
  /** 从数据源到该步的签名，用于增量重算 */
  sig: string;
  /** 是否命中缓存 */
  cached: boolean;
}

export interface StageCacheEntry {
  sig: string;
  items: FileItem[];
  stats: StepStats;
  issues: StepIssue[];
  durationMs: number;
}

export type StageCache = StageCacheEntry[];

export interface CompileResult {
  stages: CompiledStage[];
  /** 应用手动改写后的终态（最后一步预览与计划都用它） */
  finalItems: FileItem[];
  /** 手动改写生效的条目数 */
  overridesApplied: number;
  /** 策略应用后的最终计划 */
  plan: PlanEntry[];
  /** 检测到的全部冲突（含已被策略解决的） */
  conflicts: Conflict[];
  /** 仍会阻止执行的冲突 */
  blocking: Conflict[];
  summary: PlanSummary;
  totalMs: number;
  policyResolved: number;
  cache: StageCache;
}

export interface CompileOptions {
  world: ConflictWorld;
  cache?: StageCache;
  ctx?: StepContext;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function defaultContext(): StepContext {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const platform: StepContext['platform'] = /Mac/i.test(ua)
    ? 'darwin'
    : /Linux/i.test(ua)
      ? 'linux'
      : 'win32';
  return { now: Date.now(), platform, caseInsensitiveFs: platform !== 'linux' };
}

/** 手动排除：只克隆被排除的条目，其余复用引用 */
function applyExclusions(items: readonly FileItem[], excluded: Set<string>): FileItem[] {
  if (!excluded.size) return items as FileItem[];
  let out: FileItem[] | null = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.status !== 'active' || !excluded.has(it.id)) continue;
    if (!out) out = items.slice();
    out[i] = { ...it, status: 'excluded', excludedBy: 'manual' };
  }
  return out ?? (items as FileItem[]);
}

/**
 * 手动改写：在所有积木之后叠加的一层覆盖，优先级最高。
 *
 * 为什么放在最后而不是"在某一步插入"：用户改的是<b>最终结果</b>
 * （"这个文件就叫这个名字"），不是"某一步的中间值"。放最后语义最简单，
 * 也不会因为上游参数一变就被冲掉。
 */
function applyOverrides(
  items: readonly FileItem[],
  overrides: Record<string, ItemOverride>,
): { items: FileItem[]; applied: number } {
  const ids = Object.keys(overrides);
  if (!ids.length) return { items: items as FileItem[], applied: 0 };

  let applied = 0;
  const out = items.map((it) => {
    const ov = overrides[it.id];
    if (!ov || it.status !== 'active') return it;

    let cur = it.cur;
    if (ov.name && ov.name !== cur.name) {
      const s = splitExt(ov.name);
      cur = { ...cur, name: ov.name, base: s.base, ext: s.ext };
    }
    if (ov.dir && normPath(ov.dir) !== cur.dir) {
      cur = { ...cur, dir: normPath(ov.dir) };
    }
    if (cur === it.cur) return it;

    applied++;
    return {
      ...it,
      cur,
      touchedBy: it.touchedBy.includes(MANUAL_STEP_ID)
        ? it.touchedBy
        : [...it.touchedBy, MANUAL_STEP_ID],
    };
  });

  return { items: out, applied };
}

function nameResolver(doc: PipelineDoc): (id?: string) => string {
  const map = new Map(doc.steps.map((s) => [s.id, getStep(s.type)?.name ?? s.type]));
  return (id?: string) => {
    if (!id) return '';
    if (id === MANUAL_STEP_ID) return '手动修改';
    return map.get(id) ?? '未知步骤';
  };
}

/**
 * 把积木栈编译成变更计划。
 *
 * 纯函数：不碰磁盘、不碰 DOM。磁盘状态通过 `world` 注入，
 * 所以同一份 (doc, items, world) 永远得到同一份计划 —— 可测试、可重放。
 */
export function compilePipeline(
  doc: PipelineDoc,
  scanned: readonly FileItem[],
  opts: CompileOptions,
): CompileResult {
  const t0 = performance.now();
  const ctx = opts.ctx ?? defaultContext();
  const oldCache = opts.cache ?? [];
  const newCache: StageCache = [];

  let items = applyExclusions(scanned, new Set(doc.excludedIds));

  // 手动排除是"第 0 步"的输入，必须进签名，否则改了勾选不会重算
  let sig = hash('v1|' + doc.excludedIds.slice().sort().join(','));
  const stages: CompiledStage[] = [];

  for (let i = 0; i < doc.steps.length; i++) {
    const step = doc.steps[i];
    sig = hash(sig + '|' + step.type + '|' + (step.enabled ? '1' : '0') + '|' + JSON.stringify(step.params));

    const hit = oldCache[i];
    if (hit && hit.sig === sig) {
      newCache[i] = hit;
      items = hit.items;
      stages.push({
        index: i,
        stepId: step.id,
        type: step.type,
        title: getStep(step.type)?.name ?? step.type,
        enabled: step.enabled,
        items: hit.items,
        stats: hit.stats,
        issues: hit.issues,
        durationMs: hit.durationMs,
        sig,
        cached: true,
      });
      continue;
    }

    const def = getStep(step.type);
    const t = performance.now();
    let res: { items: FileItem[]; issues: StepIssue[]; stats: StepStats };

    if (!def) {
      res = {
        items: items as FileItem[],
        issues: [{ level: 'error', code: 'UNKNOWN_STEP', message: `未知积木类型 ${step.type}` }],
        stats: { total: items.length, active: items.filter((x) => x.status === 'active').length, changed: 0, dropped: 0 },
      };
    } else if (!step.enabled) {
      res = {
        items: items as FileItem[],
        issues: [{ level: 'warn', code: 'BYPASSED', message: '该步已禁用，直接透传' }],
        stats: { total: items.length, active: items.filter((x) => x.status === 'active').length, changed: 0, dropped: 0 },
      };
    } else {
      const paramIssues = def.validate?.(step.params, ctx) ?? [];
      const r = def.run(items, step.params, ctx, step.id);
      res = { items: r.items, issues: [...paramIssues, ...r.issues], stats: r.stats };
    }

    const durationMs = performance.now() - t;
    items = res.items;
    newCache[i] = { sig, items: res.items, stats: res.stats, issues: res.issues, durationMs };
    stages.push({
      index: i,
      stepId: step.id,
      type: step.type,
      title: def?.name ?? step.type,
      enabled: step.enabled,
      items: res.items,
      stats: res.stats,
      issues: res.issues,
      durationMs,
      sig,
      cached: false,
    });
  }

  const nameOf = nameResolver(doc);
  const { items: finalItems, applied: overridesApplied } = applyOverrides(items, doc.overrides ?? {});
  const rawPlan = buildPlan(finalItems, nameOf);
  const conflicts = detectConflicts(rawPlan, opts.world);
  const { plan, blocking, resolved } = applyPolicy(rawPlan, conflicts, doc.conflictPolicy, opts.world);
  const summary = summarize(plan);
  summary.conflict = conflicts.filter((c) => c.level === 'error').length;

  return {
    stages,
    finalItems,
    overridesApplied,
    plan,
    conflicts,
    blocking,
    summary,
    totalMs: performance.now() - t0,
    policyResolved: resolved,
    cache: newCache,
  };
}

/** 未加任何积木时，也要能预览数据源本身 */
export function emptyResult(scanned: readonly FileItem[]): CompileResult {
  const plan = buildPlan(scanned, () => '');
  return {
    stages: [],
    finalItems: scanned as FileItem[],
    overridesApplied: 0,
    plan,
    conflicts: [],
    blocking: [],
    summary: summarize(plan),
    totalMs: 0,
    policyResolved: 0,
    cache: [],
  };
}
