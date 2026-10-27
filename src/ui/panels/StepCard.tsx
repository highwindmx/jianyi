import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { StepInstance } from '../../core/model/pipeline.ts';
import type { CompiledStage } from '../../core/engine/compile.ts';
import { getStep, stepSummary } from '../../core/steps/registry.ts';
import { CATEGORY_META } from '../../core/steps/registry.ts';
import { Icon } from '../components/Icon.tsx';

export function StepCard({
  step,
  index,
  stage,
  selected,
  onSelect,
  onToggle,
  onDuplicate,
  onRemove,
}: {
  step: StepInstance;
  index: number;
  stage?: CompiledStage;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const def = getStep(step.type);
  const isSource = index === 0;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id, disabled: isSource });

  const cat = def ? CATEGORY_META[def.category].color : 'var(--border-strong)';
  const active = stage?.stats.active ?? 0;
  const hasError = (stage?.issues ?? []).some((i) => i.level === 'error');

  return (
    <div
      ref={setNodeRef}
      className={
        'step-card' +
        (selected ? ' selected' : '') +
        (step.enabled ? '' : ' disabled') +
        (isSource ? ' source' : '')
      }
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : undefined,
        // @ts-expect-error CSS 自定义属性
        '--cat': cat,
      }}
      onClick={onSelect}
    >
      <span
        className="step-drag"
        ref={setActivatorNodeRef}
        {...(isSource ? {} : attributes)}
        {...(isSource ? {} : listeners)}
        title={isSource ? '数据源固定在首位' : '拖动调整顺序'}
      >
        <Icon name={isSource ? 'layers' : 'grip'} size={13} />
      </span>

      <span className="step-index">{index === 0 ? '源' : index}</span>

      <div className="step-main">
        <span className="step-icon">
          <Icon name={def?.icon ?? 'file'} size={14} />
        </span>
        <span className="step-name">{def?.name ?? step.type}</span>
        <span
          className={'step-count' + (active === 0 ? ' zero' : hasError ? ' warn' : '')}
          title={`本步输出 ${active} 个文件`}
        >
          {active}
        </span>
      </div>

      <div className="step-tools" onClick={(e) => e.stopPropagation()}>
        <button
          className={'icon-btn' + (step.enabled ? '' : ' on')}
          title={step.enabled ? '禁用此步（旁路）' : '启用此步'}
          onClick={onToggle}
        >
          <Icon name={step.enabled ? 'eye' : 'eyeOff'} size={13} />
        </button>
        {!isSource && (
          <>
            <button className="icon-btn" title="复制此步" onClick={onDuplicate}>
              <Icon name="copy" size={13} />
            </button>
            <button className="icon-btn danger" title="删除此步" onClick={onRemove}>
              <Icon name="x" size={13} />
            </button>
          </>
        )}
      </div>

      <div className="step-sub" title={stepSummary(step)}>
        {stepSummary(step)}
      </div>
    </div>
  );
}
