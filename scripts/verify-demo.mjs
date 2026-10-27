// 改名 + 演示模式回归验证
import { chromium } from 'playwright-core';

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' });
await page.waitForSelector('.step-card', { timeout: 15000 });
await page.waitForTimeout(600);

const brand = (await page.locator('.brand').innerText()).replace(/\n/g, ' ');
const title = await page.title();
const demoChip = await page.locator('.demo-chip').count();
const rows = await page.locator('.tbody .row').count();
const status = (await page.locator('.statusbar').innerText()).replace(/\n/g, ' | ');

console.log('title      :', title);
console.log('brand      :', brand);
console.log('演示标记   :', demoChip === 1 ? '有' : '无');
console.log('表格行数   :', rows);
console.log('状态栏     :', status);
console.log('控制台错误 :', errors.length);
if (errors.length) errors.slice(0, 4).forEach((e) => console.log('  ! ' + e));

await page.screenshot({ path: 'shots/jianyi-demo.png' });
await browser.close();
