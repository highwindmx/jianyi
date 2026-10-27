// 验证：状态栏去掉读数链、排除按钮改成红叉
import { chromium } from 'playwright-core';

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe';
let fail = 0;
const check = (n, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? '  → ' + extra : ''}`);
  if (!ok) fail++;
};

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' });
await page.waitForSelector('.step-card', { timeout: 20000 });
await page.waitForTimeout(800);

/* ── 1. 状态栏 ── */
const statusText = (await page.locator('.statusbar').innerText()).replace(/\n/g, ' | ');
console.log('状态栏:', statusText);
check('读数链已移除', (await page.locator('.reading-chain, .reading').count()) === 0);
check('计数 chip 保留', (await page.locator('.statusbar .count-chip').count()) === 4);
check('编译耗时保留', /\d+\.\dms · \d+ 步/.test(statusText));

/* ── 2. 排除按钮 ── */
const row = page.locator('.tbody .row').first();
const btn = row.locator('.row-check');
const styleOf = () =>
  btn.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, border: s.borderTopColor, bg: s.backgroundColor };
  });

const rest = await styleOf();
check('默认不显示红叉（透明）', rest.color === 'rgba(0, 0, 0, 0)', rest.color);
check('默认边框可见', rest.border === 'rgb(195, 202, 211)', rest.border);
check('按钮里有 × 图标', (await btn.locator('svg').count()) === 1);

await btn.hover();
await page.waitForTimeout(250);
const hov = await styleOf();
check('悬停时亮出红叉', hov.color === 'rgb(229, 72, 77)', hov.color);
check('悬停时底色变浅红', hov.bg === 'rgb(255, 245, 245)', hov.bg);
await page.screenshot({ path: 'shots/ui-check-hover.png', clip: await row.boundingBox() });

// 记下这一行是谁 —— 排除后它会沉到列表末尾、滚出虚拟窗口，
// 所以后面要靠搜索把它单独捞回来验样式。
const target = await row.locator('.cell-name').getAttribute('title');

// 点一下：该行被排除
const before = (await page.locator('.statusbar').innerText()).match(/改名 (\d+)/)[1];
await btn.click();
await page.waitForTimeout(700);
const after = (await page.locator('.statusbar').innerText()).match(/改名 (\d+)/)[1];
check('排除后改名数减少 1', Number(after) === Number(before) - 1, `${before} → ${after}`);

// 切到「已排除」筛选 + 搜索这个名字，把它单独捞出来
await page.locator('.seg button', { hasText: '已排除' }).click();
await page.locator('.search-box input').fill(target);
await page.waitForTimeout(500);
const dropped = page.locator('.tbody .row');
const nDropped = await dropped.count();
check('「已排除」筛选能看到它', nDropped === 1, `${nDropped} 行 · ${target}`);

const dRow = dropped.first();
const dBtn = dRow.locator('.row-check');
const dStyle = await dBtn.evaluate((el) => {
  const s = getComputedStyle(el);
  return { color: s.color, bg: s.backgroundColor };
});
check('已排除的行红叉常亮', dStyle.color === 'rgb(229, 72, 77)', dStyle.color);
check('已排除的行底色浅红', dStyle.bg === 'rgb(254, 242, 242)', dStyle.bg);
const reason = (await dRow.locator('.cell-reason').innerText()).trim();
check('原因列写明是手动排除', reason.includes('手动排除'), reason);
await page.screenshot({ path: 'shots/ui-check-on.png', clip: await dRow.boundingBox() });

// 恢复
await dBtn.click();
await page.waitForTimeout(600);
const restored = (await page.locator('.statusbar').innerText()).match(/改名 (\d+)/)[1];
check('再点一次能恢复', Number(restored) === Number(before), `${after} → ${restored}`);

await page.locator('.seg button', { hasText: '全部' }).click();
await page.locator('.search-box input').fill('');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/ui-final.png' });

check('无控制台错误', errors.length === 0);
console.log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
