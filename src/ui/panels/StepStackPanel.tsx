import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useStore } from '../../state/usePipelineStore.ts';
import { StepCard } from './StepCard.tsx';
import { BlockPicker } from './BlockPicker.tsx';
import { Icon } from '../components/Icon.tsx';

export function StepStackPanel() {
  const doc = useStore((s) => s.doc);
  const compiled = useStore((s) => s.compiled);
  const selectedStepId = useStore((s) => s.selectedStepId);
  const selectStep = useStore((s) => s.selectStep);
  const moveStep = useStore((s) => s.moveStep);
  const toggleStep = useStore((s) => s.toggleStep);
  const removeStep = useStore((s) => s.removeStep);
  const duplicateStep = useStore((s) => s.duplicateStep);
  const [picking, setPicking] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = doc.steps.findIndex((s) => s.id === active.id);
    const to = doc.steps.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0 || from === 0 || to === 0) return;
    moveStep(from, to);
    void arrayMove; // 保持 import 有用（自定义移动在 store 里做，便于统一进撤销栈）
  }

  return (
    <>
      <div className="pane-head">
        <span className="pane-title">积木栈</span>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {doc.steps.length} 步
        </span>
        <div className="spacer" />
        <button className="icon-btn" title="添加积木" onClick={() => setPicking((v) => !v)}>
          <Icon name="plus" size={15} />
        </button>
      </div>

      <div className="pane-body">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={doc.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="stack">
              {doc.steps.map((step, i) => (
                <div className="stack-item" key={step.id}>
                  {i > 0 && <div className="stack-arrow" />}
                  <StepCard
                    step={step}
                    index={i}
                    stage={compiled?.stages[i]}
                    selected={step.id === selectedStepId}
                    onSelect={() => selectStep(step.id)}
                    onToggle={() => toggleStep(step.id)}
                    onDuplicate={() => duplicateStep(step.id)}
                    onRemove={() => removeStep(step.id)}
                  />
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div style={{ padding: '0 10px 18px' }}>
          <button
            className={'stack-add' + (picking ? ' active' : '')}
            onClick={() => setPicking((v) => !v)}
          >
            <Icon name="plus" size={13} />
            添加积木
          </button>
          {picking && (
            <BlockPicker
              onPick={(type) => {
                useStore.getState().addStep(type);
                setPicking(false);
              }}
              onClose={() => setPicking(false)}
            />
          )}
        </div>
      </div>
    </>
  );
}
