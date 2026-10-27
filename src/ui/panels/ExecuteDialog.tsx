import { useEffect, useState } from 'react';
import { useStore } from '../../state/usePipelineStore.ts';
import type { ConflictPolicy } from '../../core/model/pipeline.ts';
import { fmtBytes } from '../../core/engine/paths.ts';
import { Icon } from '../components/Icon.tsx';

const POLICIES: { value: ConflictPolicy; name: string; desc: string }[] = [
  {
    value: 'autoRename',
    name: '自动重命名',
    desc: '目标已存在时追加 (2)、(3)… 原文件不丢，最安全',
  },
  { value: 'skip', name: '跳过', desc: '目标已存在的条目直接不动，保留原名原位' },
  { value: 'overwrite', name: '覆盖', desc: '旧目标先移入备份区再落盘，撤销时能拿回来' },
];

export function ExecuteDialog() {
  const exec = useStore((s) => s.exec);
  const compiled = useStore((s) => s.compiled);
  const doc = useStore((s) => s.doc);
  const adapter = useStore((s) => s.adapter);
  const setPolicy = useStore((s) => s.setPolicy);
  const closeConfirm = useStore((s) => s.closeConfirm);
  const runExecute = useStore((s) => s.runExecute);
  const undo = useStore((s) => s.undo);
  const appData = useStore((s) => s.appData);
  const closeExec = useStore((s) => s.closeExec);

  const [injectFail, setInjectFail] = useState(false);
  const [free, setFree] = useState<number | null>(null);

  useEffect(() => {
    if (exec.status !== 'confirm') return;
    void adapter.freeSpace('D:/整理').then(setFree);
  }, [exec.status, adapter]);

  if (exec.status === 'idle') return null;

  const sum = compiled?.summary;
  const errors = (compiled?.conflicts ?? []).filter((c) => c.level === 'error');
  const fatal = (compiled?.blocking ?? []).length > 0;
  const pct = exec.total ? Math.round((exec.done / exec.total) * 100) : 0;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && exec.status === 'confirm' && closeConfirm()}>
      <div className="dialog">
        <div className="dialog-head">
          <span style={{ color: 'var(--accent)' }}>
            <Icon name="play" size={16} />
          </span>
          <div className="dialog-title">
            {exec.status === 'confirm' && '确认执行'}
            {exec.status === 'running' && '正在执行…'}
            {exec.status === 'done' && '执行完成'}
            {exec.status === 'error' && '执行中断'}
            {exec.status === 'undone' && '已撤销'}
          </div>
          <div className="spacer" />
          <span className="muted mono" style={{ fontSize: 11 }}>
            {doc.name}
          </span>
        </div>

        <div className="dialog-body">
          {exec.status === 'confirm' && (
            <>
              <div className="summary-grid">
                <div className="summary-cell">
                  <div className="summary-label">改名</div>
                  <div className="summary-value">{sum?.rename ?? 0}</div>
                </div>
                <div className="summary-cell">
                  <div className="summary-label">移动</div>
                  <div className="summary-value accent">{sum?.move ?? 0}</div>
                </div>
                <div className="summary-cell">
                  <div className="summary-label">删除 · 进暂存区</div>
                  <div className={'summary-value' + (sum?.delete ? ' danger' : '')}>{sum?.delete ?? 0}</div>
                </div>
                <div className="summary-cell">
                  <div className="summary-label">冲突 · 已处理</div>
                  <div className={'summary-value' + (errors.length ? ' warn' : '')}>{errors.length}</div>
                </div>
              </div>

              <div className="issue issue-info" style={{ flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="info" size={13} />
                  <span>
                    涉及数据量 <b className="mono">{fmtBytes(sum?.totalBytes ?? 0)}</b>
                    <span className="muted"> · </span>
                    新增写入 <b className="mono">{fmtBytes(sum?.writeBytes ?? 0)}</b>
                    <span className="muted"> · </span>
                    目标盘剩余 <b className="mono">{free === null ? '—' : fmtBytes(free)}</b>
                  </span>
                </div>
                <div className="muted" style={{ paddingLeft: 20, fontSize: 11 }}>
                  移动是同盘 rename，不额外占空间；只有复制才计入新增写入量。
                </div>
              </div>

              {errors.length > 0 && (
                <div>
                  <div className="field-label" style={{ marginBottom: 6 }}>
                    冲突处理策略
                  </div>
                  <div className="radio-group">
                    {POLICIES.map((p) => (
                      <div
                        key={p.value}
                        className={'radio' + (doc.conflictPolicy === p.value ? ' on' : '')}
                        onClick={() => setPolicy(p.value)}
                      >
                        <span className="radio-dot" />
                        <div>
                          <div className="radio-name">{p.name}</div>
                          <div className="radio-desc">{p.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {errors.length > 0 && (
                <div>
                  <div className="field-label" style={{ marginBottom: 6 }}>
                    冲突明细（{errors.length} 条，显示前 6 条）
                  </div>
                  <div className="conflict-list">
                    {errors.slice(0, 6).map((c, i) => (
                      <div className="conflict-row" key={i}>
                        <span className="badge badge-conflict">{c.code}</span>
                        <span>
                          {c.message}
                          <div className="conflict-path">{c.path}</div>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(compiled?.blocking ?? []).length > 0 && (
                <div className="issue issue-error">
                  <Icon name="alert" size={13} />
                  <span>
                    有 {compiled!.blocking.length} 个无法自动解决的问题，执行会被阻止：
                    {compiled!.blocking[0].message}
                  </span>
                </div>
              )}

              <div className="issue issue-info">
                <Icon name="info" size={13} />
                <span>
                  执行前不会改动任何文件。删除操作一律移入暂存区 <span className="mono">{appData}/trash</span>
                  ，执行后可一键撤销。
                </span>
              </div>

              <label className="checkline" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={injectFail}
                  onChange={(e) => setInjectFail(e.target.checked)}
                />
                演示用：在第 200 个写操作注入故障，观察逆序回滚
              </label>
            </>
          )}

          {exec.status === 'running' && (
            <>
              <div className="progress">
                <div className="progress-bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="checkline">
                <span className="mono">
                  {exec.done} / {exec.total}
                </span>
                <span className="muted">（{pct}%）</span>
                <div className="spacer" />
                <span className="mono muted" style={{ fontSize: 11, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {exec.current}
                </span>
              </div>
            </>
          )}

          {exec.status === 'done' && (
            <>
              <div className="issue" style={{ background: '#edfaf1', color: '#0a6b32', border: '1px solid #c7eed5' }}>
                <Icon name="check" size={13} />
                <span>
                  已落盘 {exec.journal?.entries.length ?? 0} 个文件操作，耗时{' '}
                  {exec.journal ? ((exec.journal.finishedAt ?? 0) - exec.journal.startedAt) / 1000 : 0}s。
                  全盘文件总数未变化 —— 移动不是增删。
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                撤销日志：{exec.journal?.entries.length} 条，删除的文件在{' '}
                <span className="mono">{appData}/trash/{exec.journal?.id}</span>
              </div>
            </>
          )}

          {exec.status === 'error' && (
            <>
              <div className="issue issue-error">
                <Icon name="alert" size={13} />
                <span>{exec.message}</span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                已完成的 {exec.journal?.entries.length ?? 0} 个操作需要回滚。点下面的按钮按**逆序**还原，
                回滚失败会逐条列出，不会静默忽略。
              </div>
            </>
          )}

          {exec.status === 'undone' && (
            <div className="issue" style={{ background: '#f0f6ff', color: '#1a56c4', border: '1px solid #cfe0ff' }}>
              <Icon name="undo" size={13} />
              <span>已撤销，文件恢复到执行前状态。</span>
            </div>
          )}
        </div>

        <div className="dialog-foot">
          <div className="spacer" />
          {exec.status === 'confirm' && (
            <>
              <button className="btn" onClick={closeConfirm}>
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={fatal || (sum?.affected ?? 0) === 0}
                onClick={() => void runExecute(injectFail ? 200 : null)}
              >
                <Icon name="play" size={12} />
                执行 {sum?.affected ?? 0} 个操作
              </button>
            </>
          )}
          {exec.status === 'running' && (
            <span className="muted" style={{ fontSize: 12 }}>
              正在落盘，请勿关闭窗口…
            </span>
          )}
          {exec.status === 'done' && (
            <>
              <button className="btn" onClick={closeExec}>
                关闭
              </button>
              <button className="btn btn-primary" onClick={() => void undo()}>
                <Icon name="undo" size={12} />
                撤销本次执行
              </button>
            </>
          )}
          {exec.status === 'error' && (
            <>
              <button className="btn" onClick={closeExec}>
                关闭
              </button>
              <button className="btn btn-danger" onClick={() => void undo()}>
                <Icon name="undo" size={12} />
                回滚已完成的 {exec.journal?.entries.length ?? 0} 个操作
              </button>
            </>
          )}
          {exec.status === 'undone' && (
            <button className="btn" onClick={closeExec}>
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
