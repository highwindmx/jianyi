import { useMemo } from 'react';
import { useStore } from '../../state/usePipelineStore.ts';
import type { ViewFilter } from '../../state/usePipelineStore.ts';
import { actionOf } from '../../core/model/item.ts';
import type { Conflict } from '../../core/model/plan.ts';
import { PreviewTable } from './PreviewTable.tsx';
import type { EditField, PreviewRow } from './PreviewTable.tsx';
import { Icon } from '../components/Icon.tsx';

const FILTERS: { value: ViewFilter; label: string; title: string }[] = [
  { value: 'all', label: '全部', title: '显示所有条目' },
  { value: 'changed', label: '仅变更', title: '只看会被改名/移动/删除的' },
  { value: 'conflict', label: '仅冲突', title: '只看会撞车的（终态）' },
  { value: 'dropped', label: '已排除', title: '看被上游筛选或删除步骤移出流程的条目' },
];

/** 删除步骤叫"删除"，筛选步骤叫"排除" —— 别用一个词糊住两件事 */
function droppedLabel(stepType?: string): string {
  return stepType === 'output.delete' ? '删除' : '排除';
}

export function PreviewPanel() {
  const doc = useStore((s) => s.doc);
  const compiled = useStore((s) => s.compiled);
  const selectedStepId = useStore((s) => s.selectedStepId);
  const search = useStore((s) => s.search);
  const viewFilter = useStore((s) => s.viewFilter);
  const setSearch = useStore((s) => s.setSearch);
  const setViewFilter = useStore((s) => s.setViewFilter);
  const toggleExclude = useStore((s) => s.toggleExclude);
  const setOverride = useStore((s) => s.setOverride);
  const clearAllOverrides = useStore((s) => s.clearAllOverrides);
  const exec = useStore((s) => s.exec);
  const undo = useStore((s) => s.undo);
  const fsInfo = useStore((s) => s.fsInfo);
  const pickRoot = useStore((s) => s.pickRoot);

  /** 真机上还没配源文件夹 —— 表格没东西可显示，换成引导 */
  const srcPath = ((doc.steps[0]?.params ?? {}) as { path?: string }).path ?? fsInfo.root;
  const needsRoot = fsInfo.mode === 'real' && !srcPath.trim();

  const stepIndex = doc.steps.findIndex((s) => s.id === selectedStepId);
  const stage = compiled?.stages[stepIndex] ?? null;
  const isLast = stepIndex === doc.steps.length - 1;
  const stepType = doc.steps[stepIndex]?.type;

  // 最后一步展示"终态"（含手动改写），中间步骤只展示那一步的输出
  const items = isLast ? (compiled?.finalItems ?? stage?.items ?? []) : (stage?.items ?? []);

  const conflictMap = useMemo(() => {
    const m = new Map<string, Conflict>();
    for (const c of compiled?.conflicts ?? []) {
      if (c.level !== 'error') continue;
      for (const id of c.itemIds) if (!m.has(id)) m.set(id, c);
    }
    return m;
  }, [compiled]);

  const rows = useMemo<PreviewRow[]>(() => {
    if (!stage) return [];
    const q = search.trim().toLowerCase();
    // 冲突是整条流水线的终态事实，只在最后一步展示；
    // 中间步骤若提前标红，用户会看到"新文件名还没改就已经冲突"的错位信息。
    const showConflicts = isLast;
    const out: PreviewRow[] = [];
    for (const item of items) {
      const conflict = showConflicts ? conflictMap.get(item.id) : undefined;
      if (q) {
        const hay = (item.origin.name + ' ' + item.cur.name + ' ' + item.origin.dir).toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (viewFilter === 'changed') {
        const a = actionOf(item);
        if (a === 'keep' || a === 'excluded') continue;
      } else if (viewFilter === 'conflict') {
        if (!conflict) continue;
      } else if (viewFilter === 'dropped') {
        if (item.status === 'active') continue;
      }
      out.push({ item, conflict });
    }
    return out;
  }, [stage, items, search, viewFilter, conflictMap, isLast]);

  const stats = stage?.stats;
  const overrideCount = Object.keys(doc.overrides ?? {}).length;

  function onEdit(id: string, field: EditField, value: string) {
    setOverride(id, { [field]: value });
  }

  return (
    <>
      <div className="pane-head">
        <span className="pane-title">预览</span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
          {stepIndex >= 0
            ? `${stepIndex === 0 ? '数据源' : '第 ' + stepIndex + ' 步'} · ${compiled?.stages[stepIndex]?.title ?? ''}`
            : '未选中积木'}
        </span>
        {stats && (
          <span className="muted mono" style={{ fontSize: 11.5 }}>
            {stats.active} / {stats.total} 参与
            {stats.changed > 0 && ` · 本步改写 ${stats.changed}`}
            {stats.dropped > 0 && ` · 本步${droppedLabel(stepType)} ${stats.dropped}`}
          </span>
        )}
        <div className="spacer" />
        {compiled && (
          <span className="muted mono" style={{ fontSize: 11 }}>
            重算 {compiled.totalMs.toFixed(1)}ms
          </span>
        )}
      </div>

      {/* 只要还有未撤销的 journal，撤销入口就一直在 —— 关掉弹窗不等于放弃撤销 */}
      {exec.journal && (exec.status === 'done' || exec.status === 'idle') && (
        <div className="banner banner-done">
          <Icon name="check" size={14} />
          已执行 {exec.journal.entries.length} 个文件操作
          <div className="spacer" />
          <button className="btn btn-sm" onClick={() => void undo()}>
            <Icon name="undo" size={12} />
            撤销本次执行
          </button>
        </div>
      )}
      {exec.status === 'undone' && (
        <div className="banner banner-info">
          <Icon name="undo" size={14} />
          已撤销，文件已恢复到执行前状态
        </div>
      )}
      {exec.status === 'error' && (
        <div className="banner banner-error">
          <Icon name="alert" size={14} />
          {exec.message}
        </div>
      )}

      <div className="preview-toolbar">
        <div className="search-box">
          <Icon name="search" size={13} />
          <input
            placeholder="搜索文件名或路径"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="icon-btn" onClick={() => setSearch('')} title="清空">
              <Icon name="x" size={11} />
            </button>
          )}
        </div>

        <div className="seg">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={viewFilter === f.value ? 'on' : ''}
              title={f.title}
              onClick={() => setViewFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="spacer" />

        {overrideCount > 0 && (
          <span className="override-chip" title="这些文件已被手动改写，优先级高于所有积木">
            <Icon name="tag" size={11} />
            手动 {overrideCount}
            <button className="icon-btn" title="清除全部手动修改" onClick={clearAllOverrides}>
              <Icon name="x" size={10} />
            </button>
          </span>
        )}

        <div className="legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--hl-rename-bar)' }} />
            改名
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--hl-move-bar)' }} />
            移动
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--hl-delete-bar)' }} />
            删除
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--hl-conflict-bar)' }} />
            冲突
          </span>
        </div>

        <span className="muted mono" style={{ fontSize: 11.5 }}>
          {rows.length} 行{!isLast && ' · 中间态'}
        </span>
      </div>

      {needsRoot ? (
        <div className="empty-real">
          <div className="empty-real-icon">
            <Icon name="folder" size={26} />
          </div>
          <h3>先选一个要处理的文件夹</h3>
          <p>
            鉴易只在你选定的目录里操作。删除一律先进暂存区，整批执行完可以一键撤销。
          </p>
          <button className="btn btn-primary" onClick={() => void pickRoot()}>
            <Icon name="folder" size={13} />
            选择文件夹
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <div className="thead">
            <div />
            <div>原始文件名</div>
            <div>原路径</div>
            <div className="arrow-col" />
            <div title={isLast ? '双击可直接改写' : '切到最后一步才能手动改写'}>
              新文件名{isLast && <span className="th-hint">双击可改</span>}
            </div>
            <div>新路径</div>
            <div>状态</div>
            <div>原因</div>
          </div>
          <PreviewTable rows={rows} editable={isLast} onToggle={toggleExclude} onEdit={onEdit} />
        </div>
      )}
    </>
  );
}
