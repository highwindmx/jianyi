import { invoke } from '@tauri-apps/api/core';
import type { PlatformAdapter } from './types.ts';
import { MemoryAdapter } from './mock/memoryAdapter.ts';
import { TauriAdapter } from './tauri/tauriAdapter.ts';

export type { PlatformAdapter, ScanEntry, ScanOptions } from './types.ts';
export { MemoryAdapter } from './mock/memoryAdapter.ts';
export { TauriAdapter } from './tauri/tauriAdapter.ts';

/**
 * 是否跑在 Tauri 壳里。
 *
 * 用 `__TAURI_INTERNALS__` 而不是 `import.meta.env.TAURI`：后者要在构建期注入，
 * 而同一份 dist 产物既可能被 `tauri dev` 加载、也可能被浏览器直接打开，
 * 运行期探测才是可靠的。
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function createAdapter(): PlatformAdapter {
  return isTauri() ? new TauriAdapter() : new MemoryAdapter();
}

/** 原生目录选择框。浏览器里返回 null（调用方自行降级） */
export async function pickFolder(title = '选择文件夹'): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const res = await open({ directory: true, multiple: false, title });
  return typeof res === 'string' ? res.replace(/\\/g, '/') : null;
}

/** 应用数据目录（暂存区 / journal 落这里）。真机交给系统解析，别硬编码盘符 */
export async function resolveAppDataDir(): Promise<string> {
  if (!isTauri()) return 'D:/.jianyi';
  const dir = await invoke<string>('app_data_dir');
  return dir.replace(/\\/g, '/');
}
