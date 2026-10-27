import { create } from 'zustand';
import type { FileItem } from '../core/model/item.ts';
import { makeItem } from '../core/model/item.ts';
import type { PipelineDoc, ConflictPolicy, StepInstance } from '../core/model/pipeline.ts';
import { emptyDoc, newStepId, parseDoc, serializeDoc } from '../core/model/pipeline.ts';
import type { CompileResult, StageCache } from '../core/engine/compile.ts';
import { compilePipeline, defaultContext } from '../core/engine/compile.ts';
import type { ConflictWorld } from '../core/engine/conflicts.ts';
import { createStep, getStep } from '../core/steps/registry.ts';
import { buildDemoFs } from '../core/mock/generate.ts';
import { demoPipeline, PRESETS } from '../core/mock/presets.ts';
import { executePlan } from '../core/exec/executor.ts';
import { rollbackJournal } from '../core/exec/rollback.ts';
import type { Journal } from '../core/model/journal.ts';
import type { PlanEntry } from '../core/model/plan.ts';
import type { PlatformAdapter } from '../platform/types.ts';
import type { ScanEntry } from '../platform/types.ts';
import { MemoryAdapter } from '../platform/mock/memoryAdapter.ts';
import { createAdapter, isTauri, pickFolder, resolveAppDataDir } from '../platform/index.ts';

/** 应用数据目录。真机上由 Tauri 在 init() 里解析并覆盖 */
let APP_DATA = 'D:/.jianyi';

/** 真实模式下记住用户选的文件夹 */
const ROOT_KEY = 'jianyi.root';

export type AppMode = 'demo' | 'real';

/**
 * 文件系统信息。demo = 内置演示数据；real = 用户真磁盘。
 * 两者共用同一个 PlatformAdapter 接口，下游代码不需要分支。
 */
export interface FsInfo {
  mode: AppMode;
  adapter: PlatformAdapter;
  root: string;
  target: string;
  seededConflicts: string[];
  total: number;
}

function boot(): FsInfo {
  if (isTauri()) {
    return {
      mode: 'real',
      adapter: createAdapter(),
      root: localStorage.getItem(ROOT_KEY) ?? '',
      target: '',
      seededConflicts: [],
      total: 0,
    };
  }
  const d = buildDemoFs();
  return {
    mode: 'demo',
    adapter: d.adapter,
    root: d.root,
    target: d.target,
    seededConflicts: d.seededConflicts,
    total: d.total,
  };
}

/** 演示文件系统只建一次，后续 reset 会重建 */
const bootFs: FsInfo = boot();

export type ViewFilter = 'all' | 'changed' | 'conflict' | 'dropped';

export interface ExecState {
  status: 'idle' | 'confirm' | 'running' | 'done' | 'error' | 'undone';
  done: number;
  total: number;
  current: string;
  journal?: Journal;
  message?: string;
}

interface PipelineState {
  adapter: PlatformAdapter;
  fsInfo: FsInfo;
  doc: PipelineDoc;
  dataset: FileItem[];
  compiled: CompileResult | null;
  selectedStepId: string | null;
  search: string;
  viewFilter: ViewFilter;
  exec: ExecState;
  toast: string | null;
  frozen: boolean;
  compileMs: number;
  /** 应用数据目录（暂存区、journal 的落点）。真机上由 Tauri 解析 */
  appData: string;

  init: () => Promise<void>;
  selectStep: (id: string) => void;
  addStep: (type: string, atIndex?: number) => void;
  removeStep: (id: string) => void;
  duplicateStep: (id: string) => void;
  toggleStep: (id: string) => void;
  moveStep: (from: number, to: number) => void;
  updateParams: (id: string, patch: Record<string, unknown>, delay?: number) => void;
  setPolicy: (p: ConflictPolicy) => void;
  toggleExclude: (itemId: string) => void;
  setOverride: (itemId: string, patch: { name?: string; dir?: string }) => void;
  clearOverride: (itemId: string) => void;
  clearAllOverrides: () => void;
  setSearch: (s: string) => void;
  setViewFilter: (v: ViewFilter) => void;
  loadPreset: (id: string) => void;
  newProject: () => void;
  /** 真实模式下切换源文件夹（Tauri 原生选择框） */
  pickRoot: () => Promise<void>;
  setRoot: (dir: string) => Promise<void>;
  exportProject: () => void;
  importProject: (text: string) => void;
  openConfirm: () => void;
  closeConfirm: () => void;
  /** 关掉执行弹窗但保留撤销入口 */
  closeExec: () => void;
  runExecute: (injectFailAt?: number | null) => Promise<void>;
  undo: () => Promise<void>;
  reset: () => Promise<void>;
  showToast: (msg: string) => void;
}

/* ── 编译调度：模块级，避免每次 render 重建定时器 ── */
let world: ConflictWorld = { existingPaths: new Set(), caseInsensitiveFs: true, freeBytes: null };
let cache: StageCache = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let runId = 0;

export const useStore = create<PipelineState>()((set, get) => {
  /** 同步重算。core 是纯函数，2137 条 × 7 步在 20ms 内 */
  function compileNow() {
    const { doc, dataset } = get();
    if (get().frozen) return;
    const my = ++runId;
    const t = performance.now();
    const res = compilePipeline(doc, dataset, { world, ctx: defaultContext(), cache });
    if (my !== runId) return; // 过期结果丢弃
    cache = res.cache;
    set({ compiled: res, compileMs: performance.now() - t });
  }

  function schedule(delay = 0) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      compileNow();
    }, delay);
  }

  async function rescan(keepCache = false) {
    const { adapter, doc, fsInfo } = get();
    const src = doc.steps[0];
    const p = src?.params as { path?: string; recursive?: boolean; includeHidden?: boolean } | undefined;
    const root = (p?.path || fsInfo.root || '').trim();

    // 真实模式下还没选文件夹：给空数据集，UI 会引导去选
    if (!root) {
      world = { existingPaths: new Set(), caseInsensitiveFs: adapter.caseInsensitiveFs, freeBytes: null };
      if (!keepCache) cache = [];
      set({ dataset: [] });
      compileNow();
      return;
    }

    let entries: ScanEntry[];
    try {
      entries = await adapter.scanDir(root, {
        recursive: p?.recursive ?? true,
        includeHidden: p?.includeHidden ?? false,
      });
    } catch (err) {
      get().showToast(`扫描失败：${(err as Error).message}`);
      entries = [];
    }

    // 冲突检测的"世界"只需要源目录 + 各个输出目录。
    // 真机上千万别不带 scope —— 那是要把整块盘遍历一遍。
    const scope = new Set<string>([root]);
    for (const s of doc.steps) {
      const tp = (s.params as { targetDir?: string }).targetDir;
      if (tp) scope.add(tp);
    }
    const paths = await adapter.allFilePaths([...scope]);
    const ci = adapter.caseInsensitiveFs;

    world = {
      existingPaths: new Set(paths.map((x) => (ci ? x.toLowerCase() : x))),
      caseInsensitiveFs: ci,
      freeBytes: await adapter.freeSpace(root),
    };
    if (!keepCache) cache = [];
    set({ dataset: entries.map((e) => makeItem(e.path, e.size, e.mtimeMs)) });
    compileNow();
  }

  function patchDoc(fn: (d: PipelineDoc) => PipelineDoc, delay = 0) {
    set({ doc: fn(get().doc) });
    schedule(delay);
  }

  return {
    adapter: bootFs.adapter,
    fsInfo: bootFs,
    doc: emptyDoc(),
    dataset: [],
    compiled: null,
    selectedStepId: null,
    search: '',
    viewFilter: 'all',
    exec: { status: 'idle', done: 0, total: 0, current: '' },
    toast: null,
    frozen: false,
    compileMs: 0,
    appData: APP_DATA,

    async init() {
      const fs = get().fsInfo;

      if (fs.mode === 'real') {
        // 真机：暂存区放到系统应用数据目录，别往用户盘里塞隐藏文件夹
        APP_DATA = (await resolveAppDataDir()) || APP_DATA;
        set({ appData: APP_DATA });
        const src = createStep('source.scan');
        const steps = src
          ? [{ ...src, params: { ...src.params, path: fs.root } }]
          : [];
        const doc: PipelineDoc = { ...emptyDoc(), name: '未命名流程', steps };
        set({ doc, selectedStepId: steps[0]?.id ?? null });
        await rescan();
        return;
      }

      await rescan();
      const doc = demoPipeline();
      set({ doc, selectedStepId: doc.steps[doc.steps.length - 1].id });
      await rescan();
    },

    async pickRoot() {
      const dir = await pickFolder('选择要处理的文件夹');
      if (dir) await get().setRoot(dir);
    },

    async setRoot(dir) {
      const norm = dir.replace(/\\/g, '/').replace(/\/+$/, '');
      localStorage.setItem(ROOT_KEY, norm);

      const d = get().doc;
      let steps = d.steps;
      if (steps.length && steps[0].type === 'source.scan') {
        steps = [{ ...steps[0], params: { ...steps[0].params, path: norm } }, ...steps.slice(1)];
      } else {
        const s = createStep('source.scan');
        if (s) steps = [{ ...s, params: { ...s.params, path: norm } }, ...steps];
      }

      cache = [];
      set({
        doc: { ...d, steps },
        fsInfo: { ...get().fsInfo, root: norm },
        selectedStepId: get().selectedStepId ?? steps[0]?.id ?? null,
      });
      await rescan();
      get().showToast(`源文件夹已切到 ${norm}`);
    },

    selectStep(id) {
      set({ selectedStepId: id });
    },

    addStep(type, atIndex) {
      const s = createStep(type);
      if (!s) return;
      patchDoc((d) => {
        const steps = [...d.steps];
        const idx = atIndex ?? steps.length;
        steps.splice(Math.max(1, idx), 0, s);
        return { ...d, steps };
      });
      set({ selectedStepId: s.id });
    },

    removeStep(id) {
      const d = get().doc;
      const i = d.steps.findIndex((s) => s.id === id);
      if (i <= 0) return;
      patchDoc((doc) => ({ ...doc, steps: doc.steps.filter((s) => s.id !== id) }));
      if (get().selectedStepId === id) {
        const next = get().doc.steps[Math.min(i, get().doc.steps.length - 1)];
        set({ selectedStepId: next?.id ?? null });
      }
    },

    duplicateStep(id) {
      const d = get().doc;
      const i = d.steps.findIndex((s) => s.id === id);
      if (i <= 0) return;
      const copy: StepInstance = {
        ...d.steps[i],
        id: newStepId(),
        params: structuredClone(d.steps[i].params),
      };
      patchDoc((doc) => {
        const steps = [...doc.steps];
        steps.splice(i + 1, 0, copy);
        return { ...doc, steps };
      });
      set({ selectedStepId: copy.id });
    },

    toggleStep(id) {
      patchDoc(
        (d) => ({
          ...d,
          steps: d.steps.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
        }),
        0,
      );
    },

    moveStep(from, to) {
      if (from <= 0 || to <= 0 || from === to) return;
      patchDoc((d) => {
        const steps = [...d.steps];
        const [m] = steps.splice(from, 1);
        steps.splice(to, 0, m);
        return { ...d, steps };
      });
    },

    updateParams(id, patch, delay = 150) {
      const d = get().doc;
      const isSource = d.steps[0]?.id === id;
      patchDoc(
        (doc) => ({
          ...doc,
          steps: doc.steps.map((s) => (s.id === id ? { ...s, params: { ...s.params, ...patch } } : s)),
        }),
        delay,
      );
      if (isSource) {
        // 源路径可能来自「浏览」按钮，也可能是用户手打的 —— 两条路都要同步 fsInfo.root，
        // 否则顶栏的文件夹 chip 和空态引导会一直停留在旧值。
        if (typeof patch.path === 'string') {
          const p = patch.path.replace(/\\/g, '/').replace(/\/+$/, '');
          localStorage.setItem(ROOT_KEY, p);
          set({ fsInfo: { ...get().fsInfo, root: p } });
        }
        void rescan();
      }
    },

    setPolicy(p) {
      patchDoc((d) => ({ ...d, conflictPolicy: p }), 0);
    },

    toggleExclude(itemId) {
      patchDoc((d) => {
        const has = d.excludedIds.includes(itemId);
        return {
          ...d,
          excludedIds: has ? d.excludedIds.filter((x) => x !== itemId) : [...d.excludedIds, itemId],
        };
      }, 0);
    },

    /** 手动改写单个文件。传空串或与当前值相同即视为清除该字段 */
    setOverride(itemId, patch) {
      patchDoc((d) => {
        const prev = d.overrides[itemId] ?? {};
        const next = { ...prev, ...patch };
        if (!next.name) delete next.name;
        if (!next.dir) delete next.dir;
        const overrides = { ...d.overrides };
        if (!next.name && !next.dir) delete overrides[itemId];
        else overrides[itemId] = next;
        return { ...d, overrides };
      }, 0);
    },

    clearOverride(itemId) {
      patchDoc((d) => {
        if (!d.overrides[itemId]) return d;
        const overrides = { ...d.overrides };
        delete overrides[itemId];
        return { ...d, overrides };
      }, 0);
    },

    clearAllOverrides() {
      patchDoc((d) => ({ ...d, overrides: {} }), 0);
    },

    setSearch(s) {
      set({ search: s });
    },
    setViewFilter(v) {
      set({ viewFilter: v });
    },

    loadPreset(id) {
      const p = PRESETS.find((x) => x.id === id);
      if (!p) return;
      const doc = p.build();
      set({ doc, selectedStepId: doc.steps[doc.steps.length - 1].id, frozen: false, exec: { status: 'idle', done: 0, total: 0, current: '' } });
      cache = [];
      void rescan();
    },

    newProject() {
      const doc = emptyDoc();
      const src = createStep('source.scan');
      if (src) doc.steps.push(src);
      set({ doc, selectedStepId: src?.id ?? null, frozen: false, exec: { status: 'idle', done: 0, total: 0, current: '' } });
      cache = [];
      void rescan();
    },

    exportProject() {
      const { doc } = get();
      const blob = new Blob([serializeDoc(doc)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${doc.name || 'pipeline'}.jianyi.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      get().showToast('项目文件已导出');
    },

    importProject(text) {
      const r = parseDoc(text);
      if (!r.ok) {
        get().showToast('导入失败：' + r.error);
        return;
      }
      cache = [];
      set({ doc: r.doc, selectedStepId: r.doc.steps[r.doc.steps.length - 1]?.id ?? null, frozen: false });
      void rescan();
      get().showToast('项目已导入');
    },

    openConfirm() {
      set({ exec: { ...get().exec, status: 'confirm' } });
    },

    closeConfirm() {
      const e = get().exec;
      if (e.status === 'confirm') set({ exec: { status: 'idle', done: 0, total: 0, current: '' } });
    },

    /**
     * 关掉执行弹窗。**保留 journal** —— 撤销入口不能跟着弹窗一起消失，
     * 否则用户关掉弹窗就再也撤不回来了，而这个工具的核心承诺就是可撤销。
     */
    closeExec() {
      const e = get().exec;
      set({ exec: { ...e, status: 'idle' } });
    },

    async runExecute(injectFailAt) {
      const { compiled, adapter } = get();
      if (!compiled) return;
      const plan: PlanEntry[] = compiled.plan;
      const total = plan.filter((e) => e.action !== 'keep' && !e.blocked && e.to).length;
      set({ exec: { status: 'running', done: 0, total, current: '' }, frozen: true });
      // 故障注入只有内存适配器支持；真机上不给这个后门
      if (adapter.kind === 'mock') {
        const m = adapter as MemoryAdapter;
        m.resetOpCounter();
        if (injectFailAt) m.failAtOp = injectFailAt;
      }
      try {
        const journal = await executePlan(plan, {
          adapter,
          appDataDir: APP_DATA,
          onProgress: (done, t, current) =>
            set({ exec: { status: 'running', done, total: t, current } }),
        });
        set({ exec: { status: 'done', done: total, total, current: '', journal } });
      } catch (err) {
        const journal = (err as { journal?: Journal }).journal;
        set({
          exec: {
            status: 'error',
            done: journal?.entries.length ?? 0,
            total,
            current: '',
            journal,
            message: (err as Error).message,
          },
        });
      }
    },

    async undo() {
      const { exec, adapter } = get();
      if (!exec.journal) return;
      set({ exec: { ...exec, status: 'running', current: '正在撤销…' } });
      const res = await rollbackJournal(exec.journal, adapter, APP_DATA, (done, total) =>
        set({ exec: { status: 'running', done, total, current: '正在撤销…' } }),
      );
      set({
        exec: {
          status: res.status === 'aborted' ? 'error' : 'undone',
          done: exec.total,
          total: exec.total,
          current: '',
          // 撤销成功就把 journal 交出去，否则关掉弹窗后横幅会带着过期日志重新冒出来
          journal: res.status === 'aborted' ? res : undefined,
          message:
            res.status === 'aborted'
              ? `有 ${res.failures?.length ?? 0} 条无法撤销，已生成报告`
              : undefined,
        },
        frozen: false,
      });
      await rescan();
      get().showToast(res.status === 'aborted' ? '撤销未完全成功，请查看报告' : '已撤销本次执行，文件已复原');
    },

    async reset() {
      cache = [];
      if (get().fsInfo.mode === 'real') {
        set({ frozen: false, exec: { status: 'idle', done: 0, total: 0, current: '' } });
        await rescan();
        get().showToast('已重新扫描磁盘');
        return;
      }
      const fsInfo = boot();
      set({
        adapter: fsInfo.adapter,
        fsInfo,
        frozen: false,
        exec: { status: 'idle', done: 0, total: 0, current: '' },
      });
      await rescan();
      get().showToast('已重置演示文件系统');
    },

    showToast(msg) {
      set({ toast: msg });
      setTimeout(() => {
        if (get().toast === msg) set({ toast: null });
      }, 2600);
    },
  };
});

export function selectedStage(state: PipelineState) {
  const { compiled, selectedStepId } = state;
  if (!compiled) return null;
  const idx = state.doc.steps.findIndex((s) => s.id === selectedStepId);
  if (idx < 0) return null;
  return compiled.stages[idx] ?? null;
}

export function selectedStep(state: PipelineState): StepInstance | null {
  return state.doc.steps.find((s) => s.id === state.selectedStepId) ?? null;
}

export function stepDef(type: string) {
  return getStep(type);
}
