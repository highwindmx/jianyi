import { MemoryAdapter } from '../../platform/mock/memoryAdapter.ts';

/**
 * 演示数据集：一个真实的"下载文件夹"—— 2137 个文件，塞了音频、歌词、
 * 图片、视频、压缩包、文档，还带首尾空格、连续空格、全角空格的脏名字。
 *
 * 固定种子，保证每次打开看到的数字完全一样（设计文档里的读数和它对齐）。
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CN_TITLES = [
  '七里香', '稻香', '晴天', '青花瓷', '夜曲', '东风破', '发如雪', '菊花台',
  '千里之外', '听妈妈的话', '简单爱', '星晴', '龙卷风', '安静', '回到过去', '开不了口',
  '上海一九四三', '以父之名', '三年二班', '她的睫毛', '你听得到', '同一种调调', '爱情悬崖', '梯田',
  '双刀', '轨迹', '断了的弦', '借口', '外婆', '将军', '搁浅', '乱舞春秋',
  '困兽之斗', '园游会', '止战之殇', '蓝色风暴', '逆鳞', '夜的第七章', '听爸爸的话', '红模仿',
  '心雨', '白色风车', '迷迭香', '退后', '最长的电影', '彩虹', '蒲公英的约定', '无双',
  '我不配', '扯', '甜甜的', '最伟大的作品', '说好不哭', 'mojito', '等你下课', '不爱我就拉倒',
  '床边故事', '前世情人', '一点点', '告白气球',
];

const ARTISTS = [
  '周杰伦', '陈奕迅', '五月天', '李宗盛', '林俊杰', '孙燕姿', '王菲',
  '张学友', '刘若英', '蔡健雅', 'Radiohead', 'Coldplay', 'Daft Punk', 'Nujabes',
  '坂本龍一', '宇多田ヒカル', '米津玄師', 'Adele', 'Norah Jones', 'Bonobo',
  'Ólafur Arnalds', '久石譲', '苏打绿', '朴树',
];

const EN_TITLES = [
  'intro', 'outro', 'demo', 'take-one', 'take-two', 'session', 'rehearsal', 'field-rec',
  'ambient-01', 'ambient-02', 'loop', 'sketch', 'rough-mix', 'vocal', 'instrumental', 'bounce',
  'test-tone', 'noise-floor', 'room-tone', 'click-track', 'stem-drums', 'stem-bass', 'stem-gtr',
];

interface Seed {
  dir: string;
  name: string;
  size: number;
  mtimeMs: number;
}

const MUSIC_DIRS = ['D:/下载/音乐', 'D:/下载/音乐/华语', 'D:/下载/音乐/欧美', 'D:/下载/音乐/日语'];
const IMG_DIRS = ['D:/下载/图片', 'D:/下载/图片/截图'];

export const DEMO_ROOT = 'D:/下载';
export const DEMO_TARGET = 'D:/整理/音乐';

/** 与引擎排序完全一致的口径，供预置冲突文件使用 */
const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

function trimName(name: string): string {
  const i = name.lastIndexOf('.');
  const base = i <= 0 ? name : name.slice(0, i);
  const ext = i <= 0 ? '' : name.slice(i);
  const t = base.replace(/\u3000/g, ' ').replace(/ {2,}/g, ' ').replace(/^ +/, '').replace(/ +$/, '');
  return t + ext;
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

export interface DemoFsInfo {
  adapter: MemoryAdapter;
  root: string;
  target: string;
  /** 预置在目标目录、用来演示冲突的同名文件 */
  seededConflicts: string[];
  total: number;
}

export function buildDemoFs(): DemoFsInfo {
  const adapter = new MemoryAdapter();
  const rnd = mulberry32(20240513);
  const t0 = Date.UTC(2022, 0, 1);
  const span = 4.6 * 365 * 24 * 3600 * 1000;
  const mt = () => t0 + Math.floor(rnd() * span);

  const audio: Seed[] = [];

  // ── mp3 402 ──
  for (let i = 0; i < 402; i++) {
    const title = CN_TITLES[i % 60];
    const artist = ARTISTS[Math.floor(i / 60)];
    audio.push({
      dir: MUSIC_DIRS[i % 4],
      name: `${artist} - ${title}.mp3`,
      size: Math.floor((2.6 + rnd() * 8.4) * 1024 * 1024),
      mtimeMs: mt(),
    });
  }
  // ── flac 61 ──
  for (let i = 0; i < 60; i++) {
    audio.push({
      dir: MUSIC_DIRS[i % 4],
      name: `${CN_TITLES[i]} (Hi-Res).flac`,
      size: Math.floor((18 + rnd() * 26) * 1024 * 1024),
      mtimeMs: mt(),
    });
  }
  audio.push({
    dir: MUSIC_DIRS[1],
    name: `${CN_TITLES[0]} (Hi-Res 2024).flac`,
    size: Math.floor((20 + rnd() * 20) * 1024 * 1024),
    mtimeMs: mt(),
  });
  // ── wav 23 ──
  for (let i = 0; i < 23; i++) {
    audio.push({
      dir: MUSIC_DIRS[i % 4],
      name: `${EN_TITLES[i]} take${i + 1}.wav`,
      size: Math.floor((30 + rnd() * 60) * 1024 * 1024),
      mtimeMs: mt(),
    });
  }

  // ── 脏名字：137 个带空格问题（每 3 个挑 1 个，固定口径） ──
  let variant = 0;
  for (let i = 0; i < audio.length && variant < 137; i += 3) {
    const s = audio[i];
    const dot = s.name.lastIndexOf('.');
    const base = s.name.slice(0, dot);
    const ext = s.name.slice(dot);
    const v = variant % 3;
    if (v === 0) {
      s.name = '  ' + base + ext;
    } else if (v === 1) {
      s.name = base + ' ' + ext; // 扩展名前的尾随空格
    } else if (variant % 9 === 2) {
      s.name = base + '\u3000' + ext; // 全角空格
    } else {
      const at = base.indexOf(' - ');
      s.name = at > 0 ? base.replace(' - ', '  - ') + ext : base.slice(0, 2) + '  ' + base.slice(2) + ext;
    }
    variant++;
  }

  const seeds: Seed[] = [...audio];

  // ── 歌词 .lrc 61 ──
  for (let i = 0; i < 61; i++) {
    const src = audio[i];
    const base = src.name.slice(src.name.lastIndexOf('.'));
    seeds.push({
      dir: src.dir,
      name: src.name.slice(0, src.name.length - base.length) + '.lrc',
      size: Math.floor(1 + rnd() * 8) * 1024,
      mtimeMs: src.mtimeMs,
    });
  }

  // ── 说明文本 .txt 13 ──
  const TXT = ['下载说明', '链接合集', '解压密码', '专辑介绍', '曲目列表', '备注', 'readme',
    '版权信息', '抓轨日志', '扫描结果', '备忘', '待整理', '来源'];
  TXT.forEach((t, i) => {
    seeds.push({
      dir: i % 3 === 0 ? 'D:/下载/文档' : MUSIC_DIRS[i % 4],
      name: `${t}.txt`,
      size: Math.floor(200 + rnd() * 4000),
      mtimeMs: mt(),
    });
  });

  // ── 图片 902 ──
  for (let i = 0; i < 612; i++) {
    seeds.push({
      dir: IMG_DIRS[i % 2],
      name: `IMG_${pad(i + 1, 4)}.jpg`,
      size: Math.floor((0.8 + rnd() * 7) * 1024 * 1024),
      mtimeMs: mt(),
    });
  }
  for (let i = 0; i < 290; i++) {
    seeds.push({
      dir: IMG_DIRS[i % 2],
      name: `截图 ${pad(i + 1, 3)}.png`,
      size: Math.floor((0.2 + rnd() * 4) * 1024 * 1024),
      mtimeMs: mt(),
    });
  }

  // ── 视频 178 ──
  for (let i = 0; i < 152; i++) {
    seeds.push({
      dir: 'D:/下载/视频',
      name: `video_${pad(i + 1, 3)}.mp4`,
      size: Math.floor((40 + rnd() * 460) * 1024 * 1024),
      mtimeMs: mt(),
    });
  }
  for (let i = 0; i < 26; i++) {
    seeds.push({
      dir: 'D:/下载/视频',
      name: `movie_${pad(i + 1, 2)}.mkv`,
      size: Math.floor((300 + rnd() * 1200) * 1024 * 1024),
      mtimeMs: mt(),
    });
  }

  // ── 压缩包 264 ──
  for (let i = 0; i < 214; i++) {
    seeds.push({
      dir: 'D:/下载/压缩包',
      name: `资料包_${pad(i + 1, 3)}.zip`,
      size: Math.floor((1 + rnd() * 180) * 1024 * 1024),
      mtimeMs: mt(),
    });
  }
  for (let i = 0; i < 50; i++) {
    seeds.push({
      dir: 'D:/下载/压缩包',
      name: `backup-${pad(i + 1, 2)}.rar`,
      size: Math.floor((5 + rnd() * 300) * 1024 * 1024),
      mtimeMs: mt(),
    });
  }

  // ── 其他 233 ──
  for (let i = 0; i < 88; i++) {
    seeds.push({ dir: 'D:/下载/文档', name: `说明书_${pad(i + 1, 3)}.pdf`, size: Math.floor((0.2 + rnd() * 12) * 1024 * 1024), mtimeMs: mt() });
  }
  for (let i = 0; i < 61; i++) {
    seeds.push({ dir: 'D:/下载/文档', name: `简历_${pad(i + 1, 2)}.docx`, size: Math.floor((0.1 + rnd() * 3) * 1024 * 1024), mtimeMs: mt() });
  }
  for (let i = 0; i < 44; i++) {
    seeds.push({ dir: 'D:/下载/其他', name: `setup_${pad(i + 1, 2)}.exe`, size: Math.floor((8 + rnd() * 300) * 1024 * 1024), mtimeMs: mt() });
  }
  for (let i = 0; i < 40; i++) {
    seeds.push({ dir: 'D:/下载/其他', name: `app-release_${pad(i + 1, 2)}.apk`, size: Math.floor((10 + rnd() * 120) * 1024 * 1024), mtimeMs: mt() });
  }

  // ── 隐藏文件 7（默认扫描不含） ──
  const HIDDEN = [
    'D:/下载/.DS_Store', 'D:/下载/音乐/.DS_Store', 'D:/下载/图片/.DS_Store',
    'D:/下载/.thumbcache', 'D:/下载/.gitignore', 'D:/下载/文档/.localized', 'D:/下载/视频/.DS_Store',
  ];
  for (const p of HIDDEN) seeds.push({ dir: p.slice(0, p.lastIndexOf('/')), name: p.slice(p.lastIndexOf('/') + 1), size: 6148, mtimeMs: t0 });

  for (const s of seeds) adapter.seedFile(`${s.dir}/${s.name}`, s.size, s.mtimeMs);

  // ── 预置 5 个"目标已存在"的文件，用来演示冲突检测 ──
  // 取排序后的前 5 个音频，按演示模板 {序号:3}_{原名} 拼出终名，先放进目标目录。
  adapter.seedDir(DEMO_TARGET);
  const sorted = [...audio].sort((a, b) => collator.compare(a.name.toLowerCase(), b.name.toLowerCase()));
  const seededConflicts: string[] = [];
  for (let i = 0; i < 5 && i < sorted.length; i++) {
    const finalName = `${pad(i + 1, 3)}_${trimName(sorted[i].name)}`;
    adapter.seedFile(`${DEMO_TARGET}/${finalName}`, 1024 * 1024 * 3, Date.UTC(2023, 5, 1));
    seededConflicts.push(finalName);
  }

  return { adapter, root: DEMO_ROOT, target: DEMO_TARGET, seededConflicts, total: seeds.length };
}
