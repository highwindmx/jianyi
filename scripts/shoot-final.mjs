import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.locator('.step-card').nth(4).click();       // 去空格
await page.waitForTimeout(400);
await page.getByRole('button', { name: '仅变更' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/app-trim.png' });
await browser.close();
