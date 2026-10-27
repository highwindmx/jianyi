import { useStore } from '../../state/usePipelineStore.ts';

/**
 * 状态栏：只放"全局计数 + 进度 + 性能"。
 *
 * 这里原来有一条「读数链」（2137 → 560 → 486 → 486 …），
 * 和左栏每个积木卡片上的数字完全重复，7 步里有 5 个都是同一个数，
 * 看着像噪声，已删。逐级读数看左栏就够了。
 *
 * 撤销按钮也不放这里 —— 预览区顶部那条横幅已经承载了它，
 * 同一屏出现两个一样的按钮只会让人犹豫该点哪个。
 */
export function StatusBar() {
  const doc = useStore((s) => s.doc);
  const compiled = useStore((s) => s.compiled);
  const exec = useStore((s) => s.exec);
  const compileMs = useStore((s) => s.compileMs);

  const sum = compiled?.summary;

  return (
    <div className="statusbar">
      <span className="count-chip" title="改名的文件数">
        <span className="count-dot" style={{ background: 'var(--hl-rename-bar)' }} />
        改名 {sum?.rename ?? 0}
      </span>
      <span className="count-chip" title="移动的文件数">
        <span className="count-dot" style={{ background: 'var(--hl-move-bar)' }} />
        移动 {sum?.move ?? 0}
      </span>
      <span className="count-chip" title="删除的文件数（进暂存区，可撤销）">
        <span className="count-dot" style={{ background: 'var(--hl-delete-bar)' }} />
        删除 {sum?.delete ?? 0}
      </span>
      <span className="count-chip" title="冲突数（已按所选策略处理）">
        <span className="count-dot" style={{ background: 'var(--hl-conflict-bar)' }} />
        冲突 {sum?.conflict ?? 0}
      </span>

      <div className="spacer" />

      {exec.status === 'running' && (
        <span className="count-chip">
          执行中 {exec.done}/{exec.total}
        </span>
      )}
      <span className="muted mono nowrap" style={{ fontSize: 11 }} title="本次编译耗时">
        {compileMs.toFixed(1)}ms · {doc.steps.length} 步
      </span>
    </div>
  );
}
