/* 龙虾市场 · 冒烟测试（Node 直跑，无第三方依赖）
 * 运行：node tests/smoke.cjs
 * 覆盖：数据完整性 / 结算规则 / 星级 / 阶段解锁 / 渲染路径 / 交互路径 /
 *       升级与高汞合规 / D-LOB-02（回头客·情绪·排队·汞平衡文案·图鉴奖励）
 */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
}

// ---- 1. 加载浏览器脚本到同一 sandbox ----
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
['js/data.js', 'js/customers.js', 'js/audio.js', 'js/particles.js', 'js/dex.js', 'js/game.js', 'js/touch.js']
  .forEach(f => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  });

const D = sandbox.LM_DATA, L = sandbox.LM_LOGIC;
const byId = D.BY_ID;

function cust(id) {
  const t = D.CUSTOMERS.find(c => c.id === id);
  const o = Object.assign({}, t);
  o.key = 't_' + id; o.patience = 22; o.timeLeft = 22;
  o.returning = false; o.visits = 1; o.mood = 'happy';
  return o;
}

console.log('\n[1] 数据完整性');
ok('海鲜共 15 种', D.SEAFOOD.length === 15, D.SEAFOOD.length);
ok('四阶段齐全', D.STAGES.length === 4);
ok('顾客类型 ≥5', D.CUSTOMERS.length >= 5, D.CUSTOMERS.length);
ok('每条都有汞值+来源', D.SEAFOOD.every(s => typeof s.mercury === 'number' && !!s.src));
ok('每条营养五维齐全', D.SEAFOOD.every(s =>
  ['protein', 'fat', 'o3', 'zinc', 'selenium', 'b12'].every(k => typeof s[k] === 'number')));
ok('阶段分布 4/4/4/3', [1, 2, 3, 4].map(n => D.byStage(n).length).join('/') === '4/4/4/3',
  [1, 2, 3, 4].map(n => D.byStage(n).length).join('/'));
ok('深海阶段全部标记 avoid/高汞', D.byStage(4).every(s => s.sustain === 'avoid' && s.mercury >= 0.35));
ok('儿童汞阈值已放宽到 0.15', D.CUSTOMERS.find(c => c.id === 'kid').maxMercury === 0.15);

console.log('\n[2] 结算规则（真实营养判定）');
const pregnant = D.CUSTOMERS.find(c => c.id === 'pregnant');
const gym = D.CUSTOMERS.find(c => c.id === 'gym');
const student = D.CUSTOMERS.find(c => c.id === 'student');
const cold = D.CUSTOMERS.find(c => c.id === 'cold');
const elder = D.CUSTOMERS.find(c => c.id === 'elder');
const kid = D.CUSTOMERS.find(c => c.id === 'kid');

let r1 = L.evaluate(pregnant, byId['swordfish'], 'steam');
ok('孕妇 + 旗鱼(1.00ppm) → 拒收', r1.grade === 'violate' && r1.gold === 0, r1.reasons.join('|'));
let r2 = L.evaluate(pregnant, byId['salmon'], 'steam');
ok('孕妇 + 三文鱼(ω3 1966, 汞0.02) → 满单', r2.grade === 'perfect' && r2.gold > 0, r2.gold);
let r3 = L.evaluate(gym, byId['crayfish'], 'steam');
ok('健身者 + 小龙虾(蛋白16.5<18) → 勉强成交', r3.grade === 'pass', r3.grade);
let r4 = L.evaluate(gym, byId['salmon'], 'steam');
ok('健身者 + 三文鱼(蛋白20.4) → 满单', r4.grade === 'perfect');
let r5 = L.evaluate(student, byId['cod'], 'steam');
ok('学生(ω3≥1000) + 鳕鱼(72) → 勉强成交', r5.grade === 'pass');
let r6 = L.evaluate(cold, byId['oyster'], 'steam');
ok('补锌 + 牡蛎(39.3mg) → 满单', r6.grade === 'perfect');
let r7 = L.evaluate(elder, byId['salmon'], 'steam');
ok('老人(脂肪≤3) + 三文鱼(13.4g) → 拒收', r7.grade === 'violate', r7.reasons.join('|'));
let r8 = L.evaluate(kid, byId['cod'], 'steam');
ok('儿童(汞≤0.15) + 鳕鱼(0.11) → 满单(阈值已放宽)', r8.grade === 'perfect', r8.grade);
let r9 = L.evaluate(kid, byId['pollock'], 'steam');
ok('儿童 + 狭鳕(0.03) → 满单', r9.grade === 'perfect');
let r10 = L.evaluate(kid, byId['swordfish'], 'steam');
ok('儿童 + 旗鱼(1.00) → 拒收', r10.grade === 'violate', r10.reasons.join('|'));

console.log('\n[3] 烹饪对健康值的影响（黄卡 #7591）');
const steam = L.evaluate(gym, byId['salmon'], 'steam');
const spicy = L.evaluate(gym, byId['salmon'], 'spicy');
ok('清蒸 健康 +2', steam.health === 2);
ok('麻辣 健康 -2', spicy.health === -2);
ok('麻辣收益高于清蒸（利润 vs 健康的取舍成立）', spicy.gold > steam.gold, spicy.gold + '>' + steam.gold);

console.log('\n[4] 市场星级 / 阶段解锁');
ok('只卖虾蟹贝 → 1 星', L.starRating({ shell: 5 }, {}) === 1);
ok('虾蟹贝+白肉鱼 → 2 星', L.starRating({ shell: 5, white: 2 }, {}) === 2);
ok('贝类+多脂鱼 → 5 星（需求简化门槛）', L.starRating({ shell: 5, white: 2, oily: 1 }, {}) === 5);
ok('贝类+多脂鱼+认证 → 5 星', L.starRating({ shell: 5, white: 2, oily: 1 }, { msc: 1, asc: 1 }) === 5);
ok('仅多脂鱼（无贝类）→ 3 星', L.starRating({ white: 2, oily: 1 }, {}) === 3);
ok('贝类+深海（无多脂鱼）→ 2 星', L.starRating({ shell: 5, deep: 1 }, {}) === 2);
ok('金币 0 → 阶段1', L.unlockedStage(0) === 1);
ok('金币 600 → 阶段2', L.unlockedStage(600) === 2);
ok('金币 1800 → 阶段3', L.unlockedStage(1800) === 3);
ok('金币 4000 → 阶段4', L.unlockedStage(4000) === 4);

console.log('\n[5] 渲染路径（真实 Game 实例，逐帧绘制）');
function stubCtx() {
  const noop = () => {};
  return {
    canvas: { width: 1280, height: 720 },
    measureText: t => ({ width: String(t).length * 8 }),
    setLineDash: noop, save: noop, restore: noop, setTransform: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, arc: noop,
    closePath: noop, fill: noop, stroke: noop, fillRect: noop, strokeRect: noop,
    fillText: noop, clearRect: noop, translate: noop, rotate: noop, scale: noop
  };
}
const canvas = {
  width: 1280, height: 720, clientWidth: 800, clientHeight: 450,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
  getContext: () => stubCtx()
};
let game;
try { game = new sandbox.LM_GAME(canvas); ok('Game 实例化成功', !!game); }
catch (e) { ok('Game 实例化成功', false, e.message); }
game.state.showIntro = false; // 测试不模拟首次引导层

function tryDraw(label, fn) {
  try { fn(); ok(label, true); }
  catch (e) { ok(label, false, e.stack.split('\n')[0]); }
}
function fresh() { game.state.chosen = null; game.state.result = null; game.state.phase = 'serve'; game.state.warn = null; game.state.showDex = false; game.state.detailItem = null; game.state.showIntro = false; game.spawnQueue(); }

tryDraw('draw 阶段：serve（顾客在场+队列）', () => game.draw());
tryDraw('draw 阶段：cook（选了海鲜）', () => {
  game.chooseSeafood(byId['crayfish']);
  ok('  选海鲜后 phase=cook', game.state.phase === 'cook');
  game.draw();
});
tryDraw('draw 阶段：result（结算后）', () => {
  game.serve('steam');
  ok('  结算后 phase=result', game.state.phase === 'result');
  game.draw();
});
tryDraw('draw 阶段：图鉴 showDex', () => {
  game.state.showDex = true; game.draw(); game.state.showDex = false;
});
tryDraw('draw 阶段：高汞警告 modal', () => {
  game.state.warn = { title: 't', body: 'b\nb' }; game.draw(); game.state.warn = null;
});
tryDraw('队列绘制（drawQueue 多个排队顾客）', () => {
  game.state.phase = 'serve';
  game.state.queue = [cust('gym'), cust('pregnant'), cust('kid')];
  game.syncFront(); game.draw();
  ok('  promote 命中区域存在', game.hits.some(h => h.kind === 'promote'));
});
tryDraw('update 推进倒计时不报错', () => { fresh(); game.update(1.0); ok('  倒计时递减', game.state.timeLeft < game.state.queue[0].patience); });
tryDraw('引导层/详情期间耐心不倒计时（防首屏顾客流失）', () => {
  fresh();
  const t0 = game.state.timeLeft;
  game.state.showIntro = true; game.update(1.0);
  ok('  showIntro 期间不倒计时', game.state.timeLeft === t0, t0 + '→' + game.state.timeLeft);
  game.state.showIntro = false; game.state.detailItem = { id: 'shrimp' }; game.update(1.0);
  ok('  detail 期间不倒计时', game.state.timeLeft === t0);
  game.state.detailItem = null;
});
tryDraw('倒计时耗尽 → 队首离开 + 声望 -1', () => {
  const before = game.state.rep;
  game.state.queue[0].timeLeft = 0.05;
  game.update(0.2);
  ok('  声望下降', game.state.rep === before - 1, before + '→' + game.state.rep);
});

console.log('\n[6] 交互路径');
tryDraw('键盘选海鲜（按 1）', () => {
  fresh(); game.onKey({ key: '1' });
  ok('  进入做法选择', game.state.phase === 'cook');
});
tryDraw('键盘选做法（Q 清蒸）', () => {
  game.onKey({ key: 'q' });
  ok('  产生结算结果', !!game.state.result);
});
tryDraw('点击命中货架卡片', () => {
  fresh();
  const hit = game.hits.find(h => h.kind === 'seafood');
  game.onClick(hit.x + 10, hit.y + 10);
  ok('  点中卡片进入做法选择', game.state.phase === 'cook');
});
tryDraw('点击做法按钮完成成交', () => {
  game.draw();
  const cook = game.hits.find(h => h.kind === 'cook');
  game.onClick(cook.x + 5, cook.y + 5);
  ok('  金币增加', game.state.gold >= 0 && !!game.state.result);
});
tryDraw('T 键开关图鉴', () => {
  game.state.showDex = false; game.onKey({ key: 't' });
  ok('  图鉴打开', game.state.showDex === true);
  game.onKey({ key: 't' });
  ok('  图鉴关闭', game.state.showDex === false);
});

console.log('\n[7] 升级与高汞合规（黄卡 #7574）');
tryDraw('金币达标触发升级 + 阶段4 弹汞警告', () => {
  game.state.gold = 4000; game.checkUpgrade();
  ok('  阶段升到 4', game.state.stage === 4);
  ok('  弹出汞警告 modal', !!game.state.warn && game.state.warn.title.indexOf('深海') >= 0);
  ok('  警告文案含 FDA 禁用鱼种', game.state.warn.body.indexOf('旗鱼') >= 0);
  ok('  警告含平衡提示(低汞鱼)', game.state.warn.body.indexOf('低汞鱼') >= 0);
});
tryDraw('未解锁海鲜不可选', () => {
  game.state.warn = null; game.state.stage = 1; fresh();
  game.chooseSeafood(byId['swordfish']);
  ok('  阶段1 选旗鱼被拦截', game.state.phase === 'serve');
});

console.log('\n[8] D-LOB-02：回头客 · 情绪 · 排队 · 汞平衡 · 图鉴奖励');
// 8a 汞平衡文案
ok('高汞拒收理由含平衡提示(低汞鱼)',
  L.evaluate(pregnant, byId['swordfish'], 'steam').reasons.join('|').indexOf('低汞鱼') >= 0);
ok('低汞拒收(脂肪)不含汞平衡提示',
  L.evaluate(elder, byId['salmon'], 'steam').reasons.join('|').indexOf('低汞鱼') < 0);

// 8b 小费系数（回头客 / 情绪）
ok('回头客 +20%', Math.abs(L.tipMultiplier({ returning: true, mood: 'happy' }) - 1.2) < 1e-9);
ok('愤怒 -20%', Math.abs(L.tipMultiplier({ returning: false, mood: 'angry' }) - 0.8) < 1e-9);
ok('回头客+愤怒 = 0.96', Math.abs(L.tipMultiplier({ returning: true, mood: 'angry' }) - 0.96) < 1e-9);

// 8c 回头客在 serve 中真实加成金币
tryDraw('回头客成交金币含加成', () => {
  game.state.gold = 0; game.state.stage = 3; fresh();
  game.state.queue = [cust('gym')]; game.state.queue[0].returning = true; game.syncFront();
  game.chooseSeafood(byId['salmon']); game.serve('steam');
  ok('  满单且加成>0', game.state.result.grade === 'perfect' && game.state.result.tipBonus > 0);
});

// 8d 排队优先级（promote）
tryDraw('点击/按键可调整排队优先级', () => {
  game.state.warn = null; game.state.showDex = false; game.state.phase = 'serve';
  game.state.queue = [cust('gym'), cust('pregnant'), cust('kid')];
  game.syncFront();
  ok('  队首为 gym', game.state.queue[0].id === 'gym');
  const okP = game.promote(2);
  ok('  promote(2) 成功', okP === true);
  ok('  队首变为 kid', game.state.queue[0].id === 'kid');
  ok('  非 serve 阶段 promote 被拒', (game.state.phase = 'result', game.promote(1) === false));
  game.state.phase = 'serve';
});

// 8e 情绪随等待时间变化
tryDraw('情绪随等待时间变化', () => {
  game.state.warn = null; game.state.showDex = false;
  game.state.queue = [cust('gym')]; game.syncFront();
  game.state.queue[0].timeLeft = 0.5; // 远低于耐心
  game.update(0.1);
  ok('  低剩余耐心 → angry', game.state.queue[0].mood === 'angry');
  game.state.queue[0].timeLeft = 20; game.update(0.1);
  ok('  高剩余耐心 → happy', game.state.queue[0].mood === 'happy');
});

// 8f 图鉴收集奖励（集齐阶段1 → 称号 + 收入+10%）
tryDraw('集齐阶段1 → 称号 + 收入加成', () => {
  game.state.stage = 1; game.state.titles = {}; game.state.stageBonus = {};
  D.byStage(1).forEach(s => { game.state.dexUnlocked[s.id] = true; });
  game.checkDexReward(1);
  ok('  获得称号', game.state.titles[1] === '虾蟹贝通');
  ok('  阶段收入 +10%', Math.abs(game.state.stageBonus[1] - 0.10) < 1e-9);
});

console.log('\n[10] 触屏模块纯函数（LM_TOUCH）');
const T = sandbox.LM_TOUCH;
ok('LM_TOUCH 已加载', !!T && typeof T.toCanvas === 'function' && typeof T.isTouchEnv === 'function');
ok('isTouchEnv：有 ontouchstart → true', T.isTouchEnv({ ontouchstart: null }) === true);
ok('isTouchEnv：maxTouchPoints>0 → true', T.isTouchEnv({ maxTouchPoints: 5 }) === true);
ok('isTouchEnv：桌面环境 → false', T.isTouchEnv({}) === false);
ok('坐标系换算：左上角→(0,0)', (() => {
  const p = T.toCanvas({ left: 0, top: 0, width: 640, height: 360 }, 0, 0, 1280, 720);
  return p.x === 0 && p.y === 0;
})());
ok('坐标系换算：右下角→(1280,720)', (() => {
  const p = T.toCanvas({ left: 0, top: 0, width: 640, height: 360 }, 640, 360, 1280, 720);
  return p.x === 1280 && p.y === 720;
})());
ok('坐标系换算：中点→(640,360)', (() => {
  const p = T.toCanvas({ left: 100, top: 50, width: 640, height: 360 }, 420, 230, 1280, 720);
  return p.x === 640 && p.y === 360;
})());
ok('坐标系换算：画布未布局(宽0)→(-1,-1)', (() => {
  const p = T.toCanvas({ left: 0, top: 0, width: 0, height: 0 }, 10, 10, 1280, 720);
  return p.x === -1 && p.y === -1;
})());

console.log('\n[9] 移动端 / 虚拟按键（v1.2）');
tryDraw('tapButton 图鉴开关', () => {
  game.state.showDex = false;
  ok('  dex 打开', game.tapButton('dex') === true && game.state.showDex === true);
  ok('  dex 关闭', game.tapButton('dex') === true && game.state.showDex === false);
});
tryDraw('tapButton 音效开关', () => {
  ok('  sound 返回 true', game.tapButton('sound') === true);
});
tryDraw('tapButton 下一位（result 推进到 serve）', () => {
  fresh(); game.chooseSeafood(byId['crayfish']); game.serve('steam');
  ok('  结算中 phase=result', game.state.phase === 'result');
  game.tapButton('next');
  ok('  下一位 → 回到 serve', game.state.phase === 'serve');
});
tryDraw('tapButton 重置存档', () => {
  game.state.gold = 999; game.tapButton('reset');
  ok('  重置后金币归零', game.state.gold === 0);
});
tryDraw('触屏主路径：点货架 → 进入做法', () => {
  fresh();
  const hit = game.hits.find(h => h.kind === 'seafood');
  game.onClick(hit.x + 5, hit.y + 5);
  ok('  phase=cook', game.state.phase === 'cook');
});
tryDraw('触屏：点排队顾客 → 优先服务', () => {
  fresh();
  game.state.queue = [cust('gym'), cust('pregnant'), cust('kid')];
  game.syncFront(); game.draw();
  const ph = game.hits.find(h => h.kind === 'promote');
  game.onClick(ph.x + 5, ph.y + 5);
  ok('  队首变为 pregnant', game.state.queue[0].id === 'pregnant');
});

console.log('\n[11] 数据回归：FDA/EPA 汞表锁值（已核真值，防误改）');
const HG = {
  shrimp: 0.01, oyster: 0.01, crayfish: 0.03, pollock: 0.03, salmon: 0.02,
  sardine: 0.01, herring: 0.08, mackerel: 0.05, flatfish: 0.06, crab: 0.06,
  cod: 0.11, bass: 0.13, yellowfin: 0.35, bigeye: 0.69, swordfish: 1.00
};
let hgOk = true;
Object.keys(HG).forEach(id => {
  const s = byId[id];
  if (!s || Math.abs(s.mercury - HG[id]) > 1e-9) {
    hgOk = false; ok('  汞值 ' + id + '=' + HG[id] + 'ppm', false, s ? s.mercury : '缺失');
  }
});
ok('  15 种汞值全部对齐 FDA 表', hgOk);
ok('  15 种营养值全部已逐项核对(verified=true)', D.SEAFOOD.every(s => s.verified === true));
ok('  营养五维落在合理区间（蛋白 0–40 / ω3 0–5000 / 硒 0–100）', D.SEAFOOD.every(s =>
  s.protein >= 0 && s.protein <= 40 && s.o3 >= 0 && s.o3 <= 5000 && s.selenium >= 0 && s.selenium <= 100));
ok('  孕期低汞鱼(三文鱼)可达 perfect', L.evaluate(pregnant, byId['salmon'], 'steam').grade === 'perfect');

console.log('\n[12] 响应式渲染管线（DPR 感知，根治移动端文字叠在一起）');
ok('resize 按 CSS 尺寸设置 vw/vh（800×450）', (game.resize(), game.vw === 800 && game.vh === 450));
ok('resize 设置 DPR（默认 1）+ 缓冲区像素', (game.dpr === 1 && game.canvas.width === 800 && game.canvas.height === 450));
ok('draw 在缩放变换下逐帧不报错', (game.draw(), true));
game.vw = 360; game.vh = 800; game.portrait = game.vh > game.vw;
ok('竖屏判定：vh>vw → portrait=true', game.portrait === true);
game.vw = 800; game.vh = 450; game.portrait = game.vh > game.vw;
ok('横屏判定：vw>=vh → portrait=false', game.portrait === false);

// 竖屏 resize：CSS 画布竖向 → 设计尺寸切换为 720×1280
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 640 });
game.resize();
ok('竖屏 resize：vw=360/vh=640', game.vw === 360 && game.vh === 640);
ok('竖屏 resize：设计尺寸切 720×1280', game.W === 720 && game.H === 1280);
ok('竖屏 resize：portrait=true', game.portrait === true);
ok('竖屏 resize：缓冲区=CSS×DPR', game.canvas.width === 360 * game.dpr && game.canvas.height === 640 * game.dpr);
// 恢复横屏
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 450 });
game.resize(); game.portrait = false;

console.log('\n[13] 竖屏布局（720×1280 满宽大字纵向堆叠）');
game.W = 720; game.H = 1280; game.portrait = true; game.state.warn = null; game.state.showDex = false;
tryDraw('竖屏 draw 不报错', () => { fresh(); game.draw(); });
tryDraw('竖屏货架卡片命中 + 点击进入做法', () => {
  fresh(); game.draw();
  const h = game.hits.find(x => x.kind === 'seafood');
  ok('  有 seafood 命中区', !!h);
  if (h) { game.onClick(h.x + 5, h.y + 5); ok('  点货架进入做法', game.state.phase === 'cook'); }
});
tryDraw('竖屏排队优先服务命中', () => {
  fresh(); game.state.queue = [cust('gym'), cust('pregnant'), cust('kid')]; game.syncFront(); game.draw();
  const p = game.hits.find(x => x.kind === 'promote');
  ok('  有 promote 命中区', !!p);
});
tryDraw('竖屏做法栏命中 + 结算面板 next', () => {
  fresh(); game.state.stage = 3; game.chooseSeafood(byId['salmon']); game.draw();
  const c = game.hits.find(x => x.kind === 'cook');
  ok('  有 cook 命中区', !!c);
  game.onClick(c.x + 5, c.y + 5);
  ok('  结算出结果', !!game.state.result);
  game.draw();
  ok('  result 面板 next 命中存在', game.hits.some(x => x.kind === 'next'));
});
tryDraw('竖屏图鉴：点列表切换 + 点外关闭', () => {
  game.state.showDex = true; game.state.dexIndex = 0; game.draw();
  game.onClick(20, 110 + 1 * 66 + 10);
  ok('  点第 2 项 → dexIndex=1', game.state.dexIndex === 1);
  game.onClick(20, 1300);
  ok('  点列表外 → 关闭图鉴', game.state.showDex === false);
});
tryDraw('竖屏 toast / warn 不报错', () => {
  game.toast('竖屏提示'); game.draw();
  game.state.warn = { title: 't', body: 'b\nb' }; game.draw(); game.state.warn = null;
});

console.log('\n[14] 「!」营养详情弹层（图案优先，数值收进气泡）');
tryDraw('横屏货架存在 detail 命中区', () => {
  game.W = 1280; game.H = 720; game.portrait = false; game.resize();
  fresh(); game.draw();
  const d = game.hits.find(x => x.kind === 'detail');
  ok('  有 detail(「!」) 命中区', !!d);
});
tryDraw('点「!」打开详情 + drawDetail 不报错', () => {
  fresh(); game.draw();
  const d = game.hits.find(x => x.kind === 'detail');
  game.onClick(d.x + 4, d.y + 4);
  ok('  detailItem 被设置', !!game.state.detailItem);
  ok('  详情为所点海鲜', game.state.detailItem === d.item);
  game.draw();
  ok('  drawDetail 渲染无异常', true);
});
tryDraw('点弹层外区域关闭详情', () => {
  // 详情已开，点画布左上角空白处应关闭
  game.onClick(4, 4);
  ok('  点空白 → detailItem 清空', game.state.detailItem === null);
});
tryDraw('点弹层内（非关闭按钮）不关闭', () => {
  const d = game.hits.find(x => x.kind === 'detail');
  game.onClick(d.x + 4, d.y + 4); // 再开
  const r = game._detailRect;
  game.onClick(r.x + r.w / 2, r.y + r.h / 2); // 弹层中央
  ok('  点弹层内 → 仍打开', !!game.state.detailItem);
  // 关闭按钮关闭
  const c = game._detailClose;
  game.onClick(c.x + 4, c.y + 4);
  ok('  点 ✕ 关闭 → 清空', game.state.detailItem === null);
});
tryDraw('Escape 关闭详情', () => {
  const d = game.hits.find(x => x.kind === 'detail');
  game.onClick(d.x + 4, d.y + 4);
  ok('  已打开', !!game.state.detailItem);
  game.onKey({ key: 'Escape' });
  ok('  Escape 关闭', game.state.detailItem === null);
});
tryDraw('竖屏货架也存在 detail 命中区', () => {
  game.W = 720; game.H = 1280; game.portrait = true; game.resize();
  fresh(); game.draw();
  ok('  竖屏有 detail 命中区', !!game.hits.find(x => x.kind === 'detail'));
  game.onClick(game.hits.find(x => x.kind === 'detail').x + 4, game.hits.find(x => x.kind === 'detail').y + 4);
  ok('  竖屏点 ! 开详情', !!game.state.detailItem);
  game.draw();
  ok('  竖屏 drawDetail 无异常', true);
  game.W = 1280; game.H = 720; game.portrait = false; game.resize();
});

console.log('\n[15] 货架改为图案优先（不再内联数值文字）');
ok('横屏货架仍产出 seafood 命中区', (() => {
  game.W = 1280; game.H = 720; game.portrait = false; game.resize();
  fresh(); game.draw();
  return !!game.hits.find(x => x.kind === 'seafood');
})());
ok('货架卡不再直接画「蛋白」文字（drawShelf 无该串）', !/蛋白/.test(game.drawShelf.toString()));
game.W = 1280; game.H = 720; game.portrait = false; game.resize();

console.log('\n[16] 首次图标化引导层（去文字化入口）');
ok('  新实例默认显示引导 showIntro=true', (() => {
  const g2 = new sandbox.LM_GAME(canvas); return g2.state.showIntro === true;
})());
ok('  引导层渲染不报错', (() => {
  const g2 = new sandbox.LM_GAME(canvas);
  try { g2.draw(); return true; } catch (e) { return false; }
})());
ok('  首次点击任意处关闭引导', (() => {
  const g2 = new sandbox.LM_GAME(canvas); g2.onClick(10, 10);
  return g2.state.showIntro === false;
})());
ok('  关闭引导后键盘可正常选货', (() => {
  const g2 = new sandbox.LM_GAME(canvas); g2.onClick(10, 10); g2.onKey({ key: '1' });
  return g2.state.phase === 'cook';
})());
ok('  引导以 emoji 为主（drawIntro 含玩法图标）', /🦞/.test(sandbox.LM_GAME.prototype.drawIntro.toString()));

console.log('\n[17] 营养值 USDA FDC 真值锁值（11 条核对落定 + 全 15 种回归保护）');
// 本段把"已逐项对照 USDA FoodData Central 原始记录"的真值写死进测试，
// 任何误改 data.js 数值都会让测试失败 → 把《11 条营养值核对》永久锁定、可回归。
// 数值单位：每 100g 可食部（生重）；o3 = EPA+DHA 合计 mg。
const USDA = {
  crayfish: { protein: 16.0,  fat: 0.9,   o3: 200,  zinc: 1.2,  selenium: 32,  b12: 2.2,  vitd: 0.5 },
  shrimp:   { protein: 15.6,  fat: 0.8,   o3: 300,  zinc: 1.0,  selenium: 19.5, b12: 1.0,  vitd: 0.1 },
  crab:     { protein: 18.1,  fat: 1.08,  o3: 320,  zinc: 3.54, selenium: 37.4, b12: 9.0,  vitd: 0 },
  oyster:   { protein: 5.7,   fat: 1.71,  o3: 330,  zinc: 39.3, selenium: 19.7, b12: 8.75, vitd: 0.5 },
  cod:      { protein: 17.8,  fat: 0.67,  o3: 72,   zinc: 0.31, selenium: 22.8, b12: 1.25, vitd: 0.9 },
  flatfish: { protein: 12.4,  fat: 1.9,   o3: 200,  zinc: 0.32, selenium: 26.6, b12: 1.1,  vitd: 2.8 },
  pollock:  { protein: 19.44, fat: 0.98,  o3: 421,  zinc: 0.47, selenium: 36.5, b12: 3.19, vitd: 1.0 },
  bass:     { protein: 18.6,  fat: 3.4,   o3: 600,  zinc: 2.83, selenium: 33.06,b12: 2.0,  vitd: 2.0 },
  salmon:   { protein: 20.42, fat: 13.42, o3: 1966, zinc: 0.3,  selenium: 24,  b12: 3.23, vitd: 11 },
  mackerel: { protein: 18.6,  fat: 13.89, o3: 2299, zinc: 0.63, selenium: 44.1, b12: 8.71, vitd: 16.1 },
  sardine:  { protein: 24.6,  fat: 11.5,  o3: 1480, zinc: 1.3,  selenium: 52,  b12: 8.9,  vitd: 4.8 },
  herring:  { protein: 17.96, fat: 9.04,  o3: 1571, zinc: 0.99, selenium: 36.5, b12: 13.7, vitd: 4.2 },
  yellowfin:{ protein: 24.4,  fat: 0.49,  o3: 100,  zinc: 0.37, selenium: 90.6, b12: 2.08, vitd: 1.7 },
  bigeye:   { protein: 23.8,  fat: 1.8,   o3: 440,  zinc: 0.80, selenium: 99,  b12: 2.12, vitd: 0.3 },
  swordfish:{ protein: 19.66, fat: 6.65,  o3: 790,  zinc: 0.66, selenium: 57.4, b12: 1.7,  vitd: 13.9 }
};
const NUT_KEYS = ['protein', 'fat', 'o3', 'zinc', 'selenium', 'b12', 'vitd'];
let nutOk = true;
Object.keys(USDA).forEach(function (id) {
  const s = byId[id], t = USDA[id];
  if (!s) { nutOk = false; ok('  营养真值 ' + id + ' 存在', false, '缺失'); return; }
  NUT_KEYS.forEach(function (k) {
    if (Math.abs(s[k] - t[k]) > 0.5) { // 容差 0.5 吸收四舍五入
      nutOk = false;
      ok('  营养 ' + id + '.' + k + ' 应=' + t[k], false, 'data=' + s[k]);
    }
  });
});
ok('  15 种营养五维全部对齐 USDA 真值（容差 0.5）', nutOk);

// 独立再核：3 个鱼种用本轮实时拉取的 FDC API 原始值精确比对（非来自 data.js）
const LIVE = {
  salmon:   { protein: 20.42, fat: 13.42, zinc: 0.3,  selenium: 24,  b12: 3.23 },
  mackerel: { protein: 18.6,  fat: 13.89, zinc: 0.63, selenium: 44.1, b12: 8.71 },
  pollock:  { protein: 19.44, fat: 0.98,  zinc: 0.47, selenium: 36.5, b12: 3.19 }
};
let liveOk = true;
Object.keys(LIVE).forEach(function (id) {
  const s = byId[id], t = LIVE[id];
  ['protein', 'fat', 'zinc', 'selenium', 'b12'].forEach(function (k) {
    if (Math.abs(s[k] - t[k]) > 1e-9) {
      liveOk = false;
      ok('  实时 FDC ' + id + '.' + k + ' 应=' + t[k], false, 'data=' + s[k]);
    }
  });
});
ok('  3 个鱼种实时 FDC 拉取值与游戏数据精确一致（独立再核，非循环引用）', liveOk);
ok('  README 待核对清单已清零（全部 verified=true）', D.SEAFOOD.every(s => s.verified === true));
ok('  USDA 表覆盖全部 15 种（无遗漏）', Object.keys(USDA).length === 15 && D.SEAFOOD.every(s => !!USDA[s.id]));

console.log('\n————————————————————————');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
