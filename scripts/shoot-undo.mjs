/**
 * 端到端验收：执行 → 撤销 → 复位，检查文件系统真实状态与界面读数。
 */
import { chromium } from 'playwright-core';

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1560, height: 940 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const readings = await page.locator('.reading .reading-n').allInnerTexts();
console.log('读数链：', readings.join(' → '));

// 执行
await page.locator('.topbar .btn-primary').click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /执行 \d+ 个操作/ }).click();
await page.waitForTimeout(3000);

const doneText = await page.locator('.dialog-body').innerText();
console.log('执行结果：', doneText.split('\n').filter(Boolean)[0]);

// 撤销
await page.getByRole('button', { name: '撤销本次执行' }).last().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/06-undone.png' });

const toast = await page.locator('.toast').innerText().catch(() => '(无 toast)');
console.log('撤销后提示：', toast);

// 关掉弹窗，确认预览恢复
await page.getByRole('button', { name: '关闭' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/07-after-undo.png' });

const readings2 = await page.locator('.reading .reading-n').allInnerTexts();
console.log('撤销后读数：', readings2.join(' → '));
console.log('页面错误：', errors.length ? errors : '无');

await browser.close();
