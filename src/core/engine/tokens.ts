import type { FileItem } from '../model/item.ts';
import { baseNameOf } from '../model/item.ts';

export interface TokenSpec {
  token: string;
  label: string;
  sample: string;
}

/** 模板变量清单。右侧面板的"插入变量"按钮直接来自这里。 */
export const TEMPLATE_TOKENS: TokenSpec[] = [
  { token: '{原名}', label: '原名（不含扩展名）', sample: '七里香' },
  { token: '{全名}', label: '完整文件名', sample: '七里香.mp3' },
  { token: '{扩展名}', label: '扩展名', sample: 'mp3' },
  { token: '{序号}', label: '序号', sample: '1' },
  { token: '{序号:3}', label: '序号（补零）', sample: '001' },
  { token: '{日期}', label: '修改日期 YYYYMMDD', sample: '20240513' },
  { token: '{日期:YYYY-MM}', label: '修改日期 自定义', sample: '2024-05' },
  { token: '{大小}', label: '大小（KB）', sample: '8420' },
  { token: '{上级目录}', label: '当前所在目录名', sample: '下载' },
  { token: '{源目录}', label: '原始目录名', sample: '音乐' },
];

const TOKEN_RE = /\{([^{}]+)\}/g;

function pad(n: number, width: number): string {
  return width > 1 ? String(n).padStart(width, '0') : String(n);
}

function formatDate(ms: number, fmt?: string): string {
  const d = new Date(ms);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  if (!fmt) return `${Y}${M}${D}`;
  return fmt
    .replace(/YYYY/g, String(Y))
    .replace(/MM/g, M)
    .replace(/DD/g, D)
    .replace(/hh/g, h)
    .replace(/mm/g, m);
}

function tokenValue(raw: string, it: FileItem): string | null {
  const [name, arg] = raw.split(':');
  switch (name) {
    case '原名':
    case 'name':
      return it.cur.base;
    case '全名':
    case 'fullname':
      return it.cur.name;
    case '扩展名':
    case 'ext':
      return it.cur.ext.replace(/^\./, '');
    case '序号':
    case 'seq':
      return pad(it.cur.seq, arg ? Number(arg) : 0);
    case '日期':
    case '修改日期':
      return formatDate(it.origin.mtimeMs, arg);
    case '大小':
      return String(Math.max(1, Math.round(it.origin.size / 1024)));
    case '上级目录':
      return baseNameOf(it.cur.dir);
    case '源目录':
      return baseNameOf(it.origin.dir);
    default:
      return null;
  }
}

export interface RenderResult {
  text: string;
  unknownTokens: string[];
}

/** 渲染模板。未知变量原样保留，同时返回出来给校验用。 */
export function renderTemplate(template: string, it: FileItem): RenderResult {
  const unknownTokens: string[] = [];
  const text = template.replace(TOKEN_RE, (whole, raw: string) => {
    const v = tokenValue(raw, it);
    if (v === null) {
      unknownTokens.push(whole);
      return whole;
    }
    return v;
  });
  return { text, unknownTokens };
}

/** 静态检查模板里有没有写错的变量 */
export function checkTemplate(template: string): string[] {
  const bad: string[] = [];
  const known = new Set(
    TEMPLATE_TOKENS.map((t) => t.token.replace(/[{}]/g, '').split(':')[0].trim()),
  );
  for (const m of template.matchAll(TOKEN_RE)) {
    const name = m[1].split(':')[0].trim();
    if (!known.has(name)) bad.push(m[0]);
  }
  return bad;
}
