import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1240, height: 1000 }, deviceScaleFactor: 1.5 });
await page.goto('file:///D:/Dev/Scripts/jianbian/docs/design-spec.html', { waitUntil: 'load' });
await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
await page.waitForTimeout(400);

async function shot(sel, name) {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 56);
  }, sel);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/${name}.png` });
  const y = await page.evaluate(() => Math.round(window.scrollY));
  console.log(name, 'scrollY=', y);
}

await page.screenshot({ path: 'shots/doc-1.png' });
await shot('#s1', 'doc-2');
await shot('#s2', 'doc-2b');
await shot('#s3', 'doc-2c');
await shot('#s4', 'doc-3');
await shot('#s5', 'doc-4');
await shot('#s6', 'doc-5');
await browser.close();
