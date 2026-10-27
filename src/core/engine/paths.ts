import { normPath, pathKey, splitExt } from '../model/item.ts';
import type { StepIssue } from '../model/item.ts';

const ILLEGAL_CHARS = /[\\/:*?"<>|]/;
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/**
 * 文件名合法性校验。放在步骤内跑，右侧参数面板即时红字，
 * 不用等整条流水线重算完才知道写错了。
 */
export function validateFileName(name: string, platform: string): StepIssue | null {
  if (!name.trim()) {
    return { level: 'error', code: 'INVALID_NAME', message: '文件名不能为空' };
  }
  const { base } = splitExt(name);
  if (!base) {
    return { level: 'error', code: 'INVALID_NAME', message: '文件名不能只有扩展名' };
  }
  if (platform === 'win32' || platform === 'darwin') {
    if (ILLEGAL_CHARS.test(name)) {
      const bad = name.match(ILLEGAL_CHARS)?.[0] ?? '';
      return { level: 'error', code: 'INVALID_NAME', message: `文件名含非法字符 ${bad}` };
    }
  } else if (name.includes('/')) {
    return { level: 'error', code: 'INVALID_NAME', message: '文件名不能含 /' };
  }
  if (platform === 'win32') {
    if (/[. ]$/.test(base)) {
      return { level: 'error', code: 'INVALID_NAME', message: '文件名不能以空格或点结尾' };
    }
    if (RESERVED.has(base.toUpperCase())) {
      return { level: 'error', code: 'INVALID_NAME', message: `${base} 是系统保留名` };
    }
  }
  if (new TextEncoder().encode(name).length > 255) {
    return { level: 'error', code: 'INVALID_NAME', message: '文件名超过 255 字节' };
  }
  return null;
}

/** child 是否位于 parent 之内（含自身） */
export function isSubPath(child: string, parent: string): boolean {
  const c = normPath(child).toLowerCase();
  const p = normPath(parent).toLowerCase();
  if (c === p) return true;
  return c.startsWith(p.endsWith('/') ? p : p + '/');
}

export function keyOf(p: string, caseInsensitive = true): string {
  return pathKey(p, caseInsensitive);
}

/** 自动重命名：base (2).ext → base (3).ext，直到不撞车 */
export function freeName(
  dir: string,
  name: string,
  occupied: Set<string>,
  caseInsensitive: boolean,
): string {
  const { base, ext } = splitExt(name);
  let n = 2;
  for (;;) {
    const candidate = `${base} (${n})${ext}`;
    if (!occupied.has(keyOf(dir + '/' + candidate, caseInsensitive))) return candidate;
    n++;
    if (n > 9999) return `${base}_${Date.now()}${ext}`;
  }
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
