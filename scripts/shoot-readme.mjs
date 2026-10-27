// 给 README 拍三张图：主界面 / 冲突 / 执行确认。
// 全部用当前构建，避免文档里出现已经删掉的旧控件。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe';
const OUT = 'docs/img';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' });
await page.waitForSelector('.step-card', { timeout: 20000 });
await page.waitForTimeout(1000);

// 1. 主界面（停在最后一步，能看到完整的改名+移动结果）
await page.screenshot({ path: `${OUT}/main.png` });

// 2. 仅冲突：5 条撞车记录
await page.locator('.seg button', { hasText: '仅冲突' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/conflicts.png` });
await page.locator('.seg button', { hasText: '全部' }).click();
await page.waitForTimeout(400);

// 3. 执行确认弹窗
await page.locator('header .btn-primary').click();
await page.waitForSelector('.dialog', { timeout: 8000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/execute.png` });

console.log('已生成 docs/img/main.png、conflicts.png、execute.png');
await browser.close();
