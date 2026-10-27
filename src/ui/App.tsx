import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/usePipelineStore.ts';
import { PRESETS } from '../core/mock/presets.ts';
import { StepStackPanel } from './panels/StepStackPanel.tsx';
import { PreviewPanel } from './panels/PreviewPanel.tsx';
import { ParamsPanel } from './panels/ParamsPanel.tsx';
import { StatusBar } from './panels/StatusBar.tsx';
import { ExecuteDialog } from './panels/ExecuteDialog.tsx';
import { Icon } from './components/Icon.tsx';

export function App() {
  const doc = useStore((s) => s.doc);
  const init = useStore((s) => s.init);
  const compiled = useStore((s) => s.compiled);
  const exec = useStore((s) => s.exec);
  const openConfirm = useStore((s) => s.openConfirm);
  const loadPreset = useStore((s) => s.loadPreset);
  const exportProject = useStore((s) => s.exportProject);
  const importProject = useStore((s) => s.importProject);
  const reset = useStore((s) => s.reset);
  const toast = useStore((s) => s.toast);
  const fsInfo = useStore((s) => s.fsInfo);
  const pickRoot = useStore((s) => s.pickRoot);

  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (useStore.getState().exec.status === 'idle') openConfirm();
      }
      if (e.key === 'Escape') setMenu(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openConfirm]);

  const sum = compiled?.summary;
  const workCount = sum?.affected ?? 0;
  const frozen = exec.status === 'done' || exec.status === 'running';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">鉴</span>
          鉴易
          <span className="brand-sub">文件流程工作台</span>
        </div>

        <span className="topbar-sep" />
        <span className="doc-name" title={doc.name}>
          {doc.name}
        </span>

        {fsInfo.mode === 'real' && (
          <button
            className="btn btn-ghost btn-sm root-chip"
            onClick={() => void pickRoot()}
            title={fsInfo.root || '尚未选择源文件夹'}
          >
            <Icon name="folder" size={12} />
            <span className="root-chip-path">{fsInfo.root || '选择文件夹'}</span>
          </button>
        )}
        {fsInfo.mode === 'demo' && (
          <span className="demo-chip" title="当前是内置演示数据，不是你的真实磁盘">
            演示数据
          </span>
        )}

        <div style={{ position: 'relative' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setMenu((v) => !v)}>
            <Icon name="sparkle" size={12} />
            模板
            <Icon name="chevronDown" size={11} />
          </button>
          {menu && (
            <div
              className="picker"
              style={{ position: 'absolute', top: 34, left: 0, width: 300, zIndex: 60 }}
              onMouseLeave={() => setMenu(false)}
            >
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className="picker-item"
                  style={{ ['--cat' as string]: 'var(--accent)' }}
                  onClick={() => {
                    loadPreset(p.id);
                    setMenu(false);
                  }}
                >
                  <span className="picker-item-icon">
                    <Icon name="layers" size={14} />
                  </span>
                  <span>
                    <div className="picker-item-name">{p.name}</div>
                    <div className="picker-item-hint">{p.desc}</div>
                  </span>
                </button>
              ))}
              <div className="picker-group">
                <button className="picker-item" onClick={() => { useStore.getState().newProject(); setMenu(false); }}>
                  <span className="picker-item-icon" style={{ color: 'var(--text-muted)' }}>
                    <Icon name="plus" size={14} />
                  </span>
                  <span>
                    <div className="picker-item-name">空白流程</div>
                    <div className="picker-item-hint">只留一个数据源，自己搭</div>
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        <button className="btn btn-ghost btn-sm" onClick={exportProject} title="导出项目 JSON">
          <Icon name="download" size={12} />
          导出
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} title="导入项目 JSON">
          <Icon name="upload" size={12} />
          导入
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            importProject(await f.text());
            e.target.value = '';
          }}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => void reset()} title="重置演示文件系统">
          <Icon name="refresh" size={12} />
          重置数据
        </button>

        <div className="spacer" />

        <span className="muted nowrap" style={{ fontSize: 11.5 }}>
          预览不落盘 · <span className="kbd">Ctrl</span> + <span className="kbd">↵</span> 执行
        </span>

        <button
          className="btn btn-primary"
          disabled={frozen || workCount === 0 || (compiled?.blocking?.length ?? 0) > 0}
          onClick={openConfirm}
          title={workCount === 0 ? '当前流程没有产生任何变更' : '确认后一次性落盘'}
        >
          <Icon name="play" size={12} />
          一键执行
          {workCount > 0 && (
            <span className="mono" style={{ opacity: 0.8 }}>
              {workCount}
            </span>
          )}
        </button>
      </header>

      <div className="workspace">
        <aside className="pane pane-stack">
          <StepStackPanel />
        </aside>
        <main className="pane">
          <PreviewPanel />
        </main>
        <aside className="pane">
          <ParamsPanel />
        </aside>
      </div>

      <StatusBar />
      <ExecuteDialog />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
