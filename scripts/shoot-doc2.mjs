import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1240, height: 1050 }, deviceScaleFactor: 1.5 });
await page.goto('file:///D:/Dev/Scripts/jianbian/docs/design-spec.html', { waitUntil: 'load' });
await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
await page.waitForTimeout(400);
const targets = [['#s5', 1250, 'doc-6'], ['#s5', 2700, 'doc-7'], ['#s6', 0, 'doc-8'], ['#s3', 700, 'doc-9']];
for (const [sel, off, name] of targets) {
  await page.evaluate(([s, o]) => {
    const el = document.querySelector(s);
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 56 + o);
  }, [sel, off]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `shots/${name}.png` });
}
await browser.close();
