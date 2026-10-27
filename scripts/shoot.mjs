/**
 * 截图验收：用本机已安装的 chromium 打开 dev server，抓三态。
 *   node scripts/shoot.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe';
const URL = process.env.URL || 'http://localhost:5183/';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, deviceScaleFactor: 1.5 });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-overview.png` });

// 选中"去空格"这一步，看中间态
const cards = page.locator('.step-card');
const n = await cards.count();
console.log('积木卡片数：', n);
for (let i = 0; i < n; i++) {
  const name = await cards.nth(i).locator('.step-name').innerText();
  const count = await cards.nth(i).locator('.step-count').innerText();
  console.log(`  ${i}: ${name} → ${count}`);
}
if (n >= 6) {
  await cards.nth(5).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-step5-trim.png` });
}

// 冲突视图
await page.getByRole('button', { name: '仅冲突' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-conflicts.png` });

// 执行确认弹窗
await page.getByRole('button', { name: '全部' }).click();
await page.waitForTimeout(200);
await page.locator('.topbar .btn-primary').click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/04-execute-dialog.png` });

// 真跑一次
await page.getByRole('button', { name: /执行 \d+ 个操作/ }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/05-executed.png` });

const toast = await page.locator('.toast').count();
console.log('toast 数量', toast);
console.log('控制台错误：', errors.length ? errors.slice(0, 8) : '无');

await browser.close();
