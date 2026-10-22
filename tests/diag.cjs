/* 诊断脚本：复现用户反馈「看不见订单 / 文字重叠 / 页面不能调大小」
 * 真实 Chromium，多视口截图 + dump 运行时尺寸，定位根因。 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOT = path.resolve(__dirname, 'shots');
fs.mkdirSync(SHOT, { recursive: true });

function dump(page, tag) {
  return page.evaluate(() => {
    const g = window.__lmGame;
    const c = document.getElementById('game-canvas');
    const r = c.getBoundingClientRect();
    return {
      dpr: window.devicePixelRatio,
      cssRect: { w: Math.round(r.width), h: Math.round(r.height) },
      canvasBuffer: { w: c.width, h: c.height },
      gameVW: g.vw, gameVH: g.vh, gameW: g.W, gameH: g.H, portrait: g.portrait,
      // canvas buffer 与 CSS 显示的比例（应 = cssRect.w / gameW 左右，验证 layout 一致）
      bufferW_over_cssW: +(c.width / r.width).toFixed(2),
      cssW_over_gameW: +(r.width / g.W).toFixed(3),
      customer: g.state.customer ? {
        name: g.state.customer.name,
        need: g.state.customer.need,
        warn: g.state.customer.warn
      } : null,
      phase: g.state.phase,
      shelfItems: D => null
    };
  }).then(d => { console.log('[' + tag + ']', JSON.stringify(d)); return d; });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });

  // 1) 桌面宽屏 1440×900
  let p = await ctx.newPage();
  await p.setViewportSize({ width: 1440, height: 900 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto(URL);
  await p.waitForTimeout(800);
  await dump(p, 'desktop-1440x900');
  await p.screenshot({ path: path.join(SHOT, 'diag-desktop-wide.png') });
  // 关闭引导层（点一下）
  await p.mouse.click(720, 450);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOT, 'diag-desktop-wide-play.png') });

  // 2) 桌面小窗 900×600 —— 验证「页面大小能否调节」
  await p.setViewportSize({ width: 900, height: 600 });
  await p.waitForTimeout(500);
  await dump(p, 'desktop-900x600');
  await p.screenshot({ path: path.join(SHOT, 'diag-desktop-small.png') });

  // 3) 窄竖屏手机 390×844
  let m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(URL);
  await m.waitForTimeout(800);
  await dump(m, 'mobile-portrait-390x844');
  await m.screenshot({ path: path.join(SHOT, 'diag-mobile-portrait.png') });
  await m.mouse.click(195, 422);
  await m.waitForTimeout(400);
  await m.screenshot({ path: path.join(SHOT, 'diag-mobile-portrait-play.png') });

  // 4) 移动横屏 844×390
  await m.setViewportSize({ width: 844, height: 390 });
  await m.waitForTimeout(500);
  await dump(m, 'mobile-landscape-844x390');
  await m.screenshot({ path: path.join(SHOT, 'diag-mobile-landscape.png') });

  console.log('CONSOLE_ERRORS:', errs.length, errs.slice(0, 5));
  await browser.close();
})();
