import { useMemo } from 'react';
import { useStore } from '../../state/usePipelineStore.ts';
import { getStep, CATEGORY_META } from '../../core/steps/registry.ts';
import { renderTemplate } from '../../core/engine/tokens.ts';
import { Icon } from '../components/Icon.tsx';
import {
  DirField,
  ExtListField,
  NumberField,
  SelectField,
  TemplateField,
  TextField,
  ToggleField,
} from './Fields.tsx';

const DIR_SUGGESTIONS = [
  'D:/下载',
  'D:/下载/音乐',
  'D:/下载/图片',
  'D:/整理/音乐',
  'D:/整理/照片',
];

export function ParamsPanel() {
  const doc = useStore((s) => s.doc);
  const compiled = useStore((s) => s.compiled);
  const selectedStepId = useStore((s) => s.selectedStepId);
  const updateParams = useStore((s) => s.updateParams);

  const index = doc.steps.findIndex((s) => s.id === selectedStepId);
  const step = index >= 0 ? doc.steps[index] : null;
  const def = step ? getStep(step.type) : undefined;
  const stage = compiled?.stages[index];

  const prevStage = index > 0 ? compiled?.stages[index - 1] : undefined;

  const sample = useMemo(() => {
    const items = prevStage?.items ?? stage?.items ?? [];
    const first = items.find((i) => i.status === 'active');
    return first ?? null;
  }, [prevStage, stage]);

  if (!step || !def) {
    return (
      <>
        <div className="pane-head">
          <span className="pane-title">参数</span>
        </div>
        <div className="empty">在左侧选中一个积木，这里会显示它的参数</div>
      </>
    );
  }

  const params = step.params as Record<string, unknown>;
  const cat = CATEGORY_META[def.category].color;

  return (
    <>
      <div className="pane-head">
        <span className="pane-title">参数</span>
        <div className="spacer" />
        <span className="mono muted" style={{ fontSize: 10.5 }}>
          {def.type}
        </span>
      </div>

      <div className="pane-body">
        <div className="params">
          <div className="params-head" style={{ ['--cat' as string]: cat }}>
            <span className="params-icon">
              <Icon name={def.icon} size={15} />
            </span>
            <div>
              <div className="params-name">{def.name}</div>
              <div className="params-type">{def.hint}</div>
            </div>
          </div>

          {def.fields.map((f) => {
            const v = params[f.key];
            const onChange = (val: unknown) => updateParams(step.id, { [f.key]: val });

            switch (f.kind) {
              case 'text':
                return <TextField key={f.key} field={f} value={v as string} onChange={onChange} />;
              case 'number':
                return <NumberField key={f.key} field={f} value={v as number} onChange={onChange} />;
              case 'select':
                return <SelectField key={f.key} field={f} value={v as string} onChange={onChange} />;
              case 'toggle':
                return <ToggleField key={f.key} field={f} value={Boolean(v)} onChange={onChange} />;
              case 'extList':
                return <ExtListField key={f.key} field={f} value={(v as string[]) ?? []} onChange={onChange} />;
              case 'template': {
                // 预览用的是"这一步的输入"，不是输出，否则会看到套娃式的结果
                const probe =
                  sample && f.key === 'template'
                    ? {
                        ...sample,
                        cur: { ...sample.cur, seq: Number(params.startAt ?? 1) || 1 },
                      }
                    : null;
                const sampleLine = probe
                  ? {
                      input: probe.cur.name,
                      output:
                        renderTemplate(String(v ?? ''), probe).text +
                        (params.keepExt === false ? '' : probe.cur.ext),
                    }
                  : null;
                return (
                  <TemplateField
                    key={f.key}
                    field={f}
                    value={v as string}
                    onChange={onChange}
                    sample={sampleLine}
                  />
                );
              }
              case 'dir':
                return (
                  <DirField
                    key={f.key}
                    field={f}
                    value={v as string}
                    onChange={onChange}
                    suggestions={DIR_SUGGESTIONS}
                  />
                );
              default:
                return null;
            }
          })}

          {(stage?.issues ?? []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(stage?.issues ?? []).map((iss, i) => (
                <div
                  key={i}
                  className={'issue ' + (iss.level === 'error' ? 'issue-error' : 'issue-warn')}
                >
                  <Icon name="alert" size={13} />
                  <span>{iss.message}</span>
                </div>
              ))}
            </div>
          )}

          {!step.enabled && (
            <div className="issue issue-info">
              <Icon name="info" size={13} />
              <span>此步已禁用，求值时直接透传，不产生任何变更。</span>
            </div>
          )}
        </div>
      </div>

      <div className="params-foot">
        <span>
          本步输出 <b>{stage?.stats.active ?? 0}</b> 个
        </span>
        <span>
          改写 <b>{stage?.stats.changed ?? 0}</b> ·{' '}
          {step.type === 'output.delete' ? '删除' : '排除'} <b>{stage?.stats.dropped ?? 0}</b>
        </span>
      </div>
    </>
  );
}
