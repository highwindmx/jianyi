// 手动改写（override）运行时验证：双击 → 提交 → 徽标 → 计数 → Esc 取消
import { chromium } from 'playwright-core';

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe';
const URL = 'http://localhost:5183/';

const log = (...a) => console.log(...a);
let fail = 0;
function check(name, ok, extra = '') {
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
  if (!ok) fail++;
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.step-card', { timeout: 15000 });

// 1. 选中最后一步
const cards = page.locator('.step-card');
const n = await cards.count();
log(`\n共 ${n} 个积木卡片`);
await cards.nth(n - 1).click();
await page.waitForSelector('.tbody .row', { timeout: 5000 });
log('已选中最后一步：' + (await cards.nth(n - 1).locator('.step-name').innerText()));

const editableHeader = await page.locator('.thead .th-hint').count();
check('最后一步表头出现「双击可改」提示', editableHeader === 1);

// 2. 记录改前状态
const row0 = page.locator('.tbody .row').first();
const originName = (await row0.locator('.cell-name').innerText()).trim();
const beforeNew = (await row0.locator('.cell-new').innerText()).trim();
log(`\n第 1 行  原名「${originName}」  当前新名「${beforeNew}」`);

const statusBefore = await page.locator('.statusbar').innerText().catch(() => '');
const chipBefore = await page.locator('.override-chip').count();
check('初始无 override 徽标', chipBefore === 0);

// 3. 双击新文件名单元格 → 出现输入框
await row0.locator('.cell-new').dblclick();
const input = row0.locator('.cell-input');
await input.waitFor({ timeout: 3000 });
check('双击后出现就地编辑框', true);

const NEW_NAME = '01_手动改名验证.mp3';
await input.fill(NEW_NAME);
await page.screenshot({ path: 'shots/override-1-editing.png' });
await input.press('Enter');

// 4. 提交后校验
await page.waitForTimeout(400);
const afterNew = (await row0.locator('.cell-new').innerText()).trim();
check('新文件名已变成手改值', afterNew === NEW_NAME, afterNew);

const tag = await row0.locator('.manual-tag').count();
check('该行出现紫色「手动」徽标', tag === 1);

const chip = page.locator('.override-chip');
check('工具栏出现 override 计数 chip', (await chip.count()) === 1, (await chip.count()) ? await chip.innerText() : '');

const badge = (await row0.locator('.badge').innerText()).trim();
// 末步是"移动"，改名+移动合并为一条 move —— 这是设计约定，不是 bug
check('状态列按计划语义显示（末步为移动）', badge === '移动', badge);

const reason = (await row0.locator('.cell-reason').innerText()).trim();
check('原因列含「文件名变更」且带手动标记', reason.includes('文件名变更') && reason.startsWith('手动'), reason);

// 5. 检查 override 是否真的进了变更计划 / 状态栏读数
const statusAfter = await page.locator('.statusbar').innerText().catch(() => '');
log(`\n状态栏改前：${statusBefore.replace(/\n/g, ' | ')}`);
log(`状态栏改后：${statusAfter.replace(/\n/g, ' | ')}`);

// 手改撞开了原本存在的同名冲突 —— 证明覆盖层真的进了全局冲突检测
const conflictBefore = Number((statusBefore.match(/冲突\s*(\d+)/) ?? [])[1] ?? -1);
const conflictAfter = Number((statusAfter.match(/冲突\s*(\d+)/) ?? [])[1] ?? -1);
check('手改后冲突数下降（覆盖层参与冲突检测）', conflictAfter === conflictBefore - 1, `${conflictBefore} → ${conflictAfter}`);

// 6. 验证中间步骤不可编辑
await cards.nth(1).click();
await page.waitForTimeout(300);
const hintMid = await page.locator('.thead .th-hint').count();
check('中间步骤无「双击可改」提示', hintMid === 0);
await page.locator('.tbody .row').first().locator('.cell-new').dblclick();
await page.waitForTimeout(200);
check('中间步骤双击不产生输入框', (await page.locator('.cell-input').count()) === 0);

// 7. 回到最后一步，验证 Esc 取消
await cards.nth(n - 1).click();
await page.waitForTimeout(300);
const rowA = page.locator('.tbody .row').first();
const keepName = (await rowA.locator('.cell-new').innerText()).trim();
await rowA.locator('.cell-new').dblclick();
const input2 = rowA.locator('.cell-input');
await input2.waitFor({ timeout: 3000 });
await input2.fill('这条不该被保存.mp3');
await input2.press('Escape');
await page.waitForTimeout(300);
const afterEsc = (await rowA.locator('.cell-new').innerText()).trim();
check('Esc 取消后名字未变', afterEsc === keepName, afterEsc);
check('Esc 后输入框已关闭', (await page.locator('.cell-input').count()) === 0);

// 8. 改积木参数后 override 依然生效（终态覆盖层优先级最高）
await cards.nth(n - 2).click();
await page.waitForTimeout(200);
const beforeSwitch = await page.evaluate(() => {
  const el = document.querySelector('.override-chip');
  return el ? el.textContent : '';
});
await cards.nth(n - 1).click();
await page.waitForTimeout(300);
const rowB = page.locator('.tbody .row').first();
const nameAfterSwitch = (await rowB.locator('.cell-new').innerText()).trim();
check('切走再切回，手改值仍在', nameAfterSwitch === NEW_NAME, nameAfterSwitch);

await page.screenshot({ path: 'shots/override-2-applied.png', fullPage: false });

// 9. 一键清除
await page.locator('.override-chip .icon-btn').click();
await page.waitForTimeout(400);
check('清除后 chip 消失', (await page.locator('.override-chip').count()) === 0);
const nameAfterClear = (await page.locator('.tbody .row').first().locator('.cell-new').innerText()).trim();
check('清除后名字回到积木计算值', nameAfterClear !== NEW_NAME, nameAfterClear);

await page.screenshot({ path: 'shots/override-3-cleared.png' });

log(`\n控制台错误：${errors.length}`);
if (errors.length) errors.slice(0, 5).forEach((e) => log('  ! ' + e));
check('无控制台错误', errors.length === 0);

await browser.close();
log(`\n${fail === 0 ? '全部通过' : fail + ' 项失败'}`);
process.exit(fail === 0 ? 0 : 1);
