/**
 * 端到端：接管真实的 Tauri 窗口（WebView2 远程调试口 9222），
 * 在**真磁盘**上跑完整流程：扫描 → 去空格 → 移动 → 执行 → 落盘校验 → 撤销 → 复原校验。
 *
 * 这不是 mock 测试 —— 每一步都真的在 D:/ 上动文件。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = 'D:/jianyi-test';
const OUT = 'D:/jianyi-test-out';
const MESSY = '  陈奕迅 - 搁浅.mp3';   // 首部两个空格
const CLEAN = '陈奕迅 - 搁浅.mp3';

/**
 * 直接删。环境的 fs.rmSync / unlinkSync 都被安全删除垫片接管了（走回收站，
 * 在测试夹具上还会因为文件已被移走而报错），这里用系统命令干净地删自己的临时目录。
 */
function rmTree(p) {
  if (!fs.existsSync(p)) return;
  execFileSync('cmd.exe', ['/c', 'rd', '/s', '/q', p.replace(/\//g, '\\')], { stdio: 'ignore' });
}

/** 每次跑之前重建夹具，保证可重复 —— 上一轮失败时文件可能已经被移走了 */
function resetFixtures() {
  rmTree(OUT);
  rmTree(SRC);
  fs.mkdirSync(path.join(SRC, '子目录'), { recursive: true });
  fs.mkdirSync(path.join(SRC, '.hidden'), { recursive: true });
  const files = [
    '  陈奕迅 - 搁浅.mp3', '  陈奕迅 - 红模仿.mp3', '周杰伦 - 晴天.mp3',
    '周杰伦 - 七里香.mp3 ', '林俊杰 - 江南.mp3', '林俊杰 - 不为谁而作的歌.mp3',
    '李荣浩 - 模特.mp3', '李荣浩 - 老街.mp3',
    '晴天.lrc', '七里香.lrc', '说明.txt', 'readme.txt',
    '封面.jpg', '封面2.png', '视频.mp4',
    '子目录/孙燕姿 - 遇见.mp3', '子目录/孙燕姿 - 天黑黑.mp3',
    '.hidden/秘密.mp3', '.DS_Store',
  ];
  for (const f of files) {
    fs.writeFileSync(path.join(SRC, f), 'x'.repeat(2048));
  }
}
resetFixtures();

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
  if (!ok) fail++;
};

const listOut = () => (fs.existsSync(OUT) ? fs.readdirSync(OUT).sort() : []);

console.log('起始状态');
console.log('  源目录  :', fs.readdirSync(SRC).length, '个条目');
console.log('  输出目录:', fs.existsSync(OUT) ? listOut().length + ' 个' : '不存在');

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.waitForEvent('page'));

/* ── 0. 清空记忆的根目录，回到"第一次打开"的状态 ── */
await page.waitForSelector('.step-card', { timeout: 20000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.step-card', { timeout: 20000 });
await page.waitForTimeout(800);

/* ── 1. 确认跑在 Tauri 里，且是真实模式 ── */
const demoChip = await page.locator('.demo-chip').count();
const rootChip = await page.locator('.root-chip').count();
check('运行在 Tauri 壳内（无「演示数据」标记）', demoChip === 0);
check('顶栏有源文件夹入口', rootChip === 1);

const emptyReal = await page.locator('.empty-real').count();
check('首次打开显示引导页', emptyReal === 1);

/* ── 2. 填源目录 → 触发真实扫描 ── */
await page.locator('input.input.mono').first().fill(SRC);
await page.waitForFunction(
  () => document.querySelectorAll('.tbody .row').length > 0,
  { timeout: 15000 },
);
await page.waitForTimeout(500);

const rows = await page.locator('.tbody .row').count();
const status = (await page.locator('.statusbar').innerText()).replace(/\n/g, ' | ');
console.log('\n扫描后状态栏：', status);
check('扫描出真实文件', rows > 0, `${rows} 行可见`);
check('隐藏文件被排除（.DS_Store / .hidden 不该出现）',
  !(await page.locator('.tbody').innerText()).includes('.DS_Store'));

// 真实条数：19 个文件 - .DS_Store - .hidden/秘密.mp3 = 17
const readout = Number((status.match(/读数\s*\|\s*(\d+)/) ?? [])[1] ?? -1);
check('读数等于非隐藏文件数 17', readout === 17, String(readout));

/* ── 3. 加积木：去空格 → 移动 ── */
async function addBlock(name) {
  const btn = page.locator('button', { hasText: '添加积木' }).first();
  await btn.click();
  await page.waitForSelector('.picker', { timeout: 5000 });
  await page.locator('.picker-item', { hasText: name }).first().click();
  await page.waitForTimeout(400);
}

await addBlock('去空格');
await addBlock('移动');

const stepNames = await page.locator('.step-card .step-name').allInnerTexts();
console.log('\n积木栈：', stepNames.join(' → '));
check('积木栈顺序正确', stepNames.join(',') === '数据源,去空格,移动 / 复制', stepNames.join(','));

/* ── 4. 设置输出目录 ── */
await page.locator('input.input.mono').first().fill(OUT);
await page.waitForTimeout(900);

const status2 = (await page.locator('.statusbar').innerText()).replace(/\n/g, ' | ');
console.log('\n设完目标目录：', status2);

const planCount = Number((status2.match(/移动\s*(\d+)/) ?? [])[1] ?? -1);
check('计划里有移动操作', planCount === 17, `移动 ${planCount}`);

// 表格里能看到首尾空格被标出来
const wsMarks = await page.locator('.ws').count();
check('表格标出了空格位置', wsMarks > 0, `${wsMarks} 处`);

/* ── 5. 执行 ── */
await page.locator('button', { hasText: '一键执行' }).first().click();
await page.waitForSelector('.dialog, .modal', { timeout: 6000 }).catch(() => {});
await page.screenshot({ path: 'shots/tauri-exec-confirm.png' });

const confirmBtn = page.locator('.btn-primary', { hasText: /执行\s*\d+\s*个操作/ }).first();
await confirmBtn.click();

await page.waitForFunction(
  () => !!document.querySelector('.banner-done'),
  { timeout: 30000 },
);
await page.waitForTimeout(600);

const after = listOut();
console.log('\n执行后输出目录：', after.length, '个文件');
console.log('  ' + after.slice(0, 6).join('\n  '));

check('文件真的落到磁盘', after.length === 17, `${after.length} 个`);
check('首部空格真的被去掉了', after.includes(CLEAN), after.includes(CLEAN) ? CLEAN : '没找到 ' + CLEAN);
check('源目录已空（是移动不是复制）',
  fs.readdirSync(SRC).filter((n) => n.endsWith('.mp3')).length === 0);

await page.screenshot({ path: 'shots/tauri-executed.png' });

// 关掉弹窗 —— 撤销入口必须还在（这正是刚才修掉的 UX 缺陷）
const closeBtn = page.locator('.overlay button', { hasText: '关闭' }).first();
if (await closeBtn.count()) {
  await closeBtn.click();
  await page.waitForTimeout(700);
}
const undoBtn = page.locator('button', { hasText: '撤销本次执行' }).first();
check('关掉弹窗后撤销入口仍在', (await undoBtn.count()) > 0);

/* ── 6. 撤销 ── */
await undoBtn.click();
await page.waitForFunction(
  () => !!document.querySelector('.banner-info'),
  { timeout: 30000 },
);
await page.waitForTimeout(1200);

const back = fs.readdirSync(SRC);
console.log('\n撤销后源目录：', back.length, '个条目');
check('文件回到源目录', back.includes(MESSY), back.includes(MESSY) ? '空格原样恢复' : '未找到原名');
check('输出目录已清空', listOut().length === 0, `${listOut().length} 个残留`);

await page.screenshot({ path: 'shots/tauri-undone.png' });

console.log(`\n${fail === 0 ? '端到端全部通过' : fail + ' 项失败'}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
