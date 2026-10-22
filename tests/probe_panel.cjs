/* 验证：横屏/竖屏下「结算面板」是否被货架遮挡（裁剪截图取证） */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const CHROME = 'C:/Users/topgo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

async function runScenario(page, tag) {
  await page.goto(URL);
  await page.waitForTimeout(700);
  const box0 = await page.evaluate(() => {
    const r = document.getElementById('game-canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, W: window.__lmGame.W, H: window.__lmGame.H };
  });
  const tap = async (dx, dy) => {
    await page.touchscreen.tap(box0.left + dx * box0.width / box0.W, box0.top + dy * box0.height / box0.H);
    await page.waitForTimeout(220);
  };
  await tap(box0.W / 2, box0.H / 2);            // 关引导
  let hits = await page.evaluate(() => window.__lmGame.hits.map(h => ({ kind: h.kind, x: h.x, y: h.y, w: h.w, h: h.h, cookId: h.cookId })));
  const sf = hits.find(h => h.kind === 'seafood');
  await tap(sf.x + sf.w / 2, sf.y + sf.h / 2);  // 选货
  hits = await page.evaluate(() => window.__lmGame.hits.map(h => ({ kind: h.kind, x: h.x, y: h.y, w: h.w, h: h.h, cookId: h.cookId })));
  const ck = hits.find(h => h.kind === 'cook');
  await tap(ck.x + ck.w / 2, ck.y + ck.h / 2);  // 出餐 → result
  const st = await page.evaluate(() => ({ phase: window.__lmGame.state.phase, portrait: window.__lmGame.portrait, W: window.__lmGame.W, H: window.__lmGame.H }));
  // 结算面板设计坐标：横 (590,360,650,250) / 竖 (20,162,680,470)
  const p = st.portrait ? { x: 20, y: 162, w: 680, h: 470 } : { x: 590, y: 360, w: 650, h: 250 };
  const clip = {
    x: box0.left + p.x * box0.width / box0.W,
    y: box0.top + p.y * box0.height / box0.H,
    width: p.w * box0.width / box0.W,
    height: p.h * box0.height / box0.H
  };
  await page.screenshot({ path: path.join(SHOTS, 'probe-' + tag + '-panel.png'), clip });
  await page.screenshot({ path: path.join(SHOTS, 'probe-' + tag + '-full.png') });
  console.log(tag, 'phase=' + st.phase, 'portrait=' + st.portrait, 'panelDesign=' + JSON.stringify(p));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  // 横屏
  const land = await browser.newContext({ viewport: { width: 896, height: 414 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await runScenario(await land.newPage(), 'landscape');
  // 竖屏
  const port = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await runScenario(await port.newPage(), 'portrait');
  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
