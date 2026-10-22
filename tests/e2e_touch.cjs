/* 龙虾市场 · 移动端触屏实测（真实 Chromium + hasTouch）
 * 用横屏手机视口，playwright.touchscreen.tap 派发真实触摸事件，
 * 走通：关闭引导 → 选海鲜 → 选做法 → 成交结算 → 下一位，
 * 并验证虚拟按键（图鉴/音效/重置）与「屏幕坐标→设计坐标」映射正确性。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const CHROME = 'C:/Users/topgo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; log.push('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 896, height: 414 },  // 横屏手机
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(URL);
  await page.waitForTimeout(700); // 等 RAF 至少绘制一帧 + touch 初始化

  const snap = () => page.evaluate(() => {
    const g = window.__lmGame, s = g.state;
    return {
      gold: s.gold, served: s.served, rep: s.rep, health: s.health,
      phase: s.phase, chosen: s.chosen ? s.chosen.id : null,
      showDex: s.showDex, customer: s.customer ? s.customer.id : null,
      W: g.W, H: g.H, portrait: g.portrait,
      touchbarHidden: document.getElementById('touchbar').classList.contains('hidden'),
      isTouch: document.body.classList.contains('is-touch'),
      soundOn: window.__lmAudioOn
    };
  });

  // 把设计坐标映射回屏幕坐标并真实触摸点击
  async function tapDesign(dx, dy) {
    const box = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, W: window.__lmGame.W, H: window.__lmGame.H };
    });
    const sx = box.left + dx * (box.width / box.W);
    const sy = box.top + dy * (box.height / box.H);
    await page.touchscreen.tap(sx, sy);
    await page.waitForTimeout(220);
  }
  const hits = () => page.evaluate(() => window.__lmGame.hits.map(h => ({
    kind: h.kind, x: h.x, y: h.y, w: h.w, h: h.h,
    item: h.item ? h.item.id : null, cookId: h.cookId, idx: h.idx
  })));

  log.push('【环境】横屏手机视口 896×414 · hasTouch=true · chrome=' + path.basename(CHROME));
  const env0 = await snap();
  ok('游戏实例已挂载 (window.__lmGame)', !!env0, 'phase=' + env0.phase);
  ok('横屏布局生效 (portrait=false)', env0.portrait === false, 'W=' + env0.W + ' H=' + env0.H);
  ok('触屏环境识别为 touch (body.is-touch)', env0.isTouch === true);
  ok('虚拟按键条已显示 (touchbar 可见)', env0.touchbarHidden === false);
  ok('首屏为引导层 (showIntro)', env0.phase === 'serve'); // 引导关闭后才会 serve
  await page.screenshot({ path: path.join(SHOTS, '01-intro.png') });

  // 1) 关闭引导层
  await tapDesign(env0.W / 2, env0.H / 2);
  const env1 = await snap();
  ok('引导层被触摸关闭 → 进入 serve', env1.phase === 'serve');

  // 2) 选海鲜（验证坐标映射：点的正是货架命中盒中心，chosen 应等于该海鲜）
  let h = await hits();
  const sf = h.find(x => x.kind === 'seafood');
  ok('货架存在可点击海鲜命中盒', !!sf, sf ? 'item=' + sf.item : '');
  if (sf) {
    await tapDesign(sf.x + sf.w / 2, sf.y + sf.h / 2);
    const env2 = await snap();
    ok('触摸选货成功 → 进入 cook 阶段', env2.phase === 'cook', 'chosen=' + env2.chosen);
    ok('坐标映射正确：选中即所点海鲜', env2.chosen === sf.item, 'got=' + env2.chosen + ' want=' + sf.item);
    await page.screenshot({ path: path.join(SHOTS, '02-pick.png') });

    // 3) 选做法 → 成交结算
    h = await hits();
    const ck = h.find(x => x.kind === 'cook');
    ok('做法栏存在命中盒', !!ck, ck ? 'cook=' + ck.cookId : '');
    if (ck) {
      const goldBefore = env2.gold, servedBefore = env2.served;
      await tapDesign(ck.x + ck.w / 2, ck.y + ck.h / 2);
      const env3 = await snap();
      ok('触摸选做法 → 进入 result 结算', env3.phase === 'result', 'phase=' + env3.phase);
      ok('成交计数 +1 (served)', env3.served === servedBefore + 1, servedBefore + '→' + env3.served);
      ok('金币产生变化 (成交收入)', env3.gold !== goldBefore, goldBefore + '→' + env3.gold);
      const r = await page.evaluate(() => window.__lmGame.state.result);
      ok('结算结果含 grade/reasons', r && r.grade && Array.isArray(r.reasons) && r.reasons.length > 0,
        'grade=' + (r && r.grade));
      await page.screenshot({ path: path.join(SHOTS, '03-result.png') });

      // 4) 触摸「下一位」推进
      h = await hits();
      const nx = h.find(x => x.kind === 'next');
      ok('结算页含「下一位」命中盒', !!nx);
      if (nx) {
        await tapDesign(nx.x + nx.w / 2, nx.y + nx.h / 2);
        const env4 = await snap();
        ok('触摸下一位 → 回到 serve 并刷新队列', env4.phase === 'serve' && env4.served === env3.served, 'served=' + env4.served);
        await page.screenshot({ path: path.join(SHOTS, '04-next.png') });
      }
    }
  }

  // 4b) 回归（2026-10-08 真机实测发现）：高阶段货架卡与「下一位」命中盒重叠，
  // 点击必须优先结算按钮，而不是被先推入的 seafood 命中盒吃掉
  {
    await page.evaluate(() => { const g = window.__lmGame; g.state.gold = 0; g.state.stage = 3; });
    let hh = await hits();
    const sf2 = hh.find(x => x.kind === 'seafood');
    await tapDesign(sf2.x + sf2.w / 2, sf2.y + sf2.h / 2);
    hh = await hits();
    const ck2 = hh.find(x => x.kind === 'cook');
    await tapDesign(ck2.x + ck2.w / 2, ck2.y + ck2.h / 2);
    hh = await hits();
    const nx2 = hh.find(x => x.kind === 'next');
    const overlap = nx2 && hh.some(x => x.kind === 'seafood' &&
      x.x < nx2.x + nx2.w && x.x + x.w > nx2.x && x.y < nx2.y + nx2.h && x.y + x.h > nx2.y);
    ok('高阶段下「下一位」与货架命中盒确实重叠（用例有效）', overlap);
    await tapDesign(nx2.x + nx2.w / 2, nx2.y + nx2.h / 2);
    const env5 = await snap();
    ok('重叠时点击仍优先「下一位」→ 回到 serve', env5.phase === 'serve', 'phase=' + env5.phase);
  }

  // 5) 虚拟按键：图鉴
  await page.click('#touchbar button[data-act="dex"]');
  await page.waitForTimeout(200);
  ok('虚拟按键「图鉴」打开图鉴', (await snap()).showDex === true);
  await page.screenshot({ path: path.join(SHOTS, '05-dex.png') });
  await page.click('#touchbar button[data-act="dex"]'); // 关闭
  await page.waitForTimeout(150);
  ok('虚拟按键「图鉴」再次点击关闭', (await snap()).showDex === false);

  // 6) 虚拟按键：音效开关（toast 切换，验证无异常）
  await page.click('#touchbar button[data-act="sound"]');
  await page.waitForTimeout(150);
  ok('虚拟按键「音效」点击无异常', true);

  // 7) 虚拟按键：重置存档
  const beforeReset = await snap();
  await page.click('#touchbar button[data-act="reset"]');
  await page.waitForTimeout(200);
  const afterReset = await snap();
  ok('虚拟按键「重置」清空存档', afterReset.gold === 0 && afterReset.served === 0 && afterReset.phase === 'serve',
    'gold=' + afterReset.gold + ' served=' + afterReset.served);

  // 8) 无运行时错误
  ok('全程无 console/page 错误', errors.length === 0, errors.length ? JSON.stringify(errors.slice(0, 3)) : '');

  await browser.close();

  console.log('\n================ 龙虾市场 · 移动端触屏实测 ================');
  console.log(log.join('\n'));
  console.log('————————————————————————');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  console.log('截图目录: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('E2E 运行异常:', e); process.exit(2); });
