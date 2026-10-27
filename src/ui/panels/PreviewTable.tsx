import { memo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FileItem } from '../../core/model/item.ts';
import { actionOf, currentPath, originPath } from '../../core/model/item.ts';
import { MANUAL_STEP_ID } from '../../core/model/pipeline.ts';
import type { Conflict } from '../../core/model/plan.ts';
import { Icon } from '../components/Icon.tsx';

export interface PreviewRow {
  item: FileItem;
  conflict?: Conflict;
}

export type EditField = 'name' | 'dir';

const ACTION_LABEL: Record<string, string> = {
  keep: '保留',
  rename: '改名',
  move: '移动',
  delete: '删除',
  excluded: '已排除',
};

const ACTION_CLASS: Record<string, string> = {
  keep: '',
  rename: 'hl-rename',
  move: 'hl-move',
  delete: 'hl-delete',
  excluded: 'hl-excluded',
};

const ACTION_BADGE: Record<string, string> = {
  keep: 'badge-keep',
  rename: 'badge-rename',
  move: 'badge-move',
  delete: 'badge-delete',
  excluded: 'badge-excluded',
};

/**
 * 空格在表格里是隐形的 —— 而"去空格"恰恰改的就是它。
 * 所以只把"看得见才有意义"的空格标出来：首尾的、连续两个以上的、紧贴扩展名点的。
 * 正常单词之间的单个空格保持原样，避免整张表变噪。
 */
function renderName(name: string): React.ReactNode {
  const parts = name.split(/(\s+)/);
  return parts.map((p, i) => {
    if (!/^\s+$/.test(p)) return p;
    const atEdge = i === 0 || i === parts.length - 1;
    const next = parts[i + 1] ?? '';
    const beforeDot = next.startsWith('.');
    if (!atEdge && p.length < 2 && !beforeDot) return p;
    return (
      <span className="ws" key={i} title="空格">
        {'·'.repeat(p.length)}
      </span>
    );
  });
}

const Row = memo(function Row({
  row,
  top,
  editable,
  onToggle,
  onEdit,
}: {
  row: PreviewRow;
  top: number;
  editable: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string, field: EditField, value: string) => void;
}) {
  const { item, conflict } = row;
  const action = actionOf(item);
  const cls = conflict && conflict.level === 'error' ? 'hl-conflict' : ACTION_CLASS[action];
  const newName = item.cur.name;
  const nameChanged = newName !== item.origin.name;
  const pathChanged = item.cur.dir !== item.origin.dir;
  const manual = item.touchedBy.includes(MANUAL_STEP_ID);
  const canEdit = editable && item.status === 'active';

  const [edit, setEdit] = useState<{ field: EditField; value: string } | null>(null);
  const cancelRef = useRef(false);

  function start(field: EditField, value: string) {
    if (!canEdit) return;
    cancelRef.current = false;
    setEdit({ field, value });
  }

  function finish(commit: boolean) {
    if (!edit) return;
    if (commit && !cancelRef.current) onEdit(item.id, edit.field, edit.value.trim());
    cancelRef.current = false;
    setEdit(null);
  }

  function editorFor(field: EditField) {
    if (edit?.field !== field) return null;
    return (
      <input
        className="cell-input"
        autoFocus
        value={edit.value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setEdit({ field, value: e.target.value })}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelRef.current = true;
            finish(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className={'row ' + cls + (item.status !== 'active' ? ' dropped' : '')}
      style={{ transform: `translateY(${top}px)` }}
    >
      <div className="row-bar">
        <button
          className={'row-check' + (item.status === 'excluded' ? ' checked' : '')}
          title={
            item.status === 'excluded'
              ? '恢复参与后续步骤（磁盘上一直没动过）'
              : '排除此文件，不参与后续步骤（磁盘上不动，只是不进这次流程）'
          }
          onClick={() => onToggle(item.id)}
        >
          <Icon name="x" size={10} />
        </button>
      </div>
      <div className="cell-name" title={item.origin.name}>
        {renderName(item.origin.name)}
      </div>
      <div className="cell-path" title={item.origin.dir}>
        {item.origin.dir}
      </div>
      <div className="arrow-col">
        {(nameChanged || pathChanged) && <Icon name="chevronRight" size={11} />}
      </div>

      <div
        className={'cell-new cell-editable' + (nameChanged ? ' changed' : '')}
        title={canEdit ? '双击改写这个文件名' : nameChanged ? newName : ''}
        onDoubleClick={() => start('name', newName)}
      >
        {editorFor('name') ?? (nameChanged ? renderName(newName) : '—')}
      </div>

      <div
        className="cell-newpath cell-editable"
        title={canEdit ? '双击改写这个目录' : pathChanged ? item.cur.dir : ''}
        onDoubleClick={() => start('dir', item.cur.dir)}
      >
        {editorFor('dir') ?? (pathChanged ? item.cur.dir : '—')}
      </div>

      <div>
        {conflict && conflict.level === 'error' ? (
          <span className="badge badge-conflict" title={conflict.message}>
            冲突
          </span>
        ) : (
          <span className={'badge ' + ACTION_BADGE[action]}>{ACTION_LABEL[action]}</span>
        )}
      </div>
      <div className="cell-reason" title={conflict?.message ?? reasonOf(item)}>
        {manual && (
          <span className="manual-tag" title="已手动改写">
            手动
          </span>
        )}
        {conflict?.message ?? reasonOf(item)}
      </div>
    </div>
  );
});

function reasonOf(item: FileItem): string {
  if (item.status === 'excluded') {
    return item.excludedBy === 'manual' ? '手动排除 · 不参与后续' : '被上游筛选排除';
  }
  if (item.status === 'deleted') return '被删除步骤移除';
  const parts: string[] = [];
  if (item.cur.name !== item.origin.name) parts.push('文件名变更');
  if (item.cur.dir !== item.origin.dir) parts.push('目录变更');
  return parts.join(' · ') || '—';
}

export function PreviewTable({
  rows,
  editable,
  onToggle,
  onEdit,
}: {
  rows: PreviewRow[];
  editable: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string, field: EditField, value: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 12,
  });

  if (rows.length === 0) {
    return (
      <div className="empty">
        <div>
          没有匹配的行。
          <br />
          <b>试试清空搜索，或把显示范围切到「全部」。</b>
        </div>
      </div>
    );
  }

  return (
    <div className="tbody" ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi) => (
          <Row
            key={rows[vi.index].item.id}
            row={rows[vi.index]}
            top={vi.start}
            editable={editable}
            onToggle={onToggle}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

export { originPath, currentPath };
