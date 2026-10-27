import { useRef, useState } from 'react';
import type { FieldSpec } from '../../core/model/step.ts';
import { TEMPLATE_TOKENS } from '../../core/engine/tokens.ts';
import { Icon } from '../components/Icon.tsx';
import { isTauri, pickFolder } from '../../platform/index.ts';

export function FieldShell({
  field,
  children,
}: {
  field: FieldSpec;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label">{field.label}</label>
      {children}
      {'help' in field && field.help && <div className="field-help">{field.help}</div>}
    </div>
  );
}

export function TextField({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: 'text' }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FieldShell field={field}>
      <input
        className={'input' + (field.mono ? ' mono' : '')}
        value={value ?? ''}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}

export function NumberField({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: 'number' }>;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <FieldShell field={field}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          className="input"
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {field.unit && <span className="muted nowrap">{field.unit}</span>}
      </div>
    </FieldShell>
  );
}

export function SelectField({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: 'select' }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FieldShell field={field}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function ToggleField({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: 'toggle' }>;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="field">
      <div className="field-row">
        <div>
          <div className="field-label" style={{ marginBottom: 2 }}>
            {field.label}
          </div>
          {field.help && <div className="field-help">{field.help}</div>}
        </div>
        <button className={'switch' + (value ? ' on' : '')} onClick={() => onChange(!value)} aria-label={field.label} />
      </div>
    </div>
  );
}

export function ExtListField({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: 'extList' }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [custom, setCustom] = useState('');
  const list = value ?? [];

  function toggle(ext: string) {
    onChange(list.includes(ext) ? list.filter((e) => e !== ext) : [...list, ext]);
  }

  function addCustom() {
    const v = custom.trim();
    if (!v) return;
    const e = v.startsWith('.') ? v.toLowerCase() : '.' + v.toLowerCase();
    if (!list.includes(e)) onChange([...list, e]);
    setCustom('');
  }

  const extra = list.filter((e) => !field.presets.includes(e));

  return (
    <FieldShell field={field}>
      <div className="chips">
        {field.presets.map((p) => (
          <button key={p} className={'chip' + (list.includes(p) ? ' on' : '')} onClick={() => toggle(p)}>
            {p}
          </button>
        ))}
        {extra.map((p) => (
          <button key={p} className="chip on" onClick={() => toggle(p)} title="点击移除">
            {p} ×
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <input
          className="input mono"
          style={{ height: 26, fontSize: 11.5 }}
          placeholder="自定义，如 .aac"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addCustom();
          }}
        />
        <button className="btn btn-sm" onClick={addCustom}>
          添加
        </button>
      </div>
    </FieldShell>
  );
}

export function TemplateField({
  field,
  value,
  onChange,
  sample,
}: {
  field: Extract<FieldSpec, { kind: 'template' }>;
  value: string;
  onChange: (v: string) => void;
  sample?: { input: string; output: string } | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(token: string) {
    const el = ref.current;
    if (!el) {
      onChange((value ?? '') + token);
      return;
    }
    const start = el.selectionStart ?? (value ?? '').length;
    const end = el.selectionEnd ?? start;
    const next = (value ?? '').slice(0, start) + token + (value ?? '').slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <FieldShell field={field}>
      <textarea
        ref={ref}
        className="textarea mono"
        rows={2}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <div className="token-bar">
        {TEMPLATE_TOKENS.map((t) => (
          <button key={t.token} className="token" title={`${t.label} · 例：${t.sample}`} onClick={() => insert(t.token)}>
            {t.token}
          </button>
        ))}
      </div>
      {sample && (
        <div className="preview-line">
          {sample.input} <span className="muted">→</span> <b>{sample.output}</b>
        </div>
      )}
    </FieldShell>
  );
}

export function DirField({
  field,
  value,
  onChange,
  suggestions,
}: {
  field: Extract<FieldSpec, { kind: 'dir' }>;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}) {
  const listId = 'dirlist-' + field.key;
  const real = isTauri();

  return (
    <FieldShell field={field}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input mono"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          list={listId}
          placeholder={real ? '点右边按钮选文件夹' : 'D:/...'}
        />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          className="btn btn-sm"
          title={real ? '选择文件夹' : '在演示文件系统里选一个'}
          onClick={async () => {
            if (real) {
              const dir = await pickFolder(field.label);
              if (dir) onChange(dir);
              return;
            }
            // 演示模式下循环切换预置目录
            if (!suggestions.length) return;
            const i = suggestions.indexOf(value);
            onChange(suggestions[(i + 1) % suggestions.length]);
          }}
        >
          <Icon name="folder" size={12} />
        </button>
      </div>
    </FieldShell>
  );
}
