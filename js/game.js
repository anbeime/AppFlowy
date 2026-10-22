/* 龙虾市场 · 主循环与渲染（v1.3：横屏 1280×720 + 竖屏 720×1280 双布局自适应） */
(function (global) {
  'use strict';

  var D = global.LM_DATA;
  var L = global.LM_LOGIC;
  var A = global.LM_AUDIO;
  var Particles = global.LM_PARTICLES;
  var DEX = global.LM_DEX;

  var W = 1280, H = 720; // 横屏设计尺寸（闭包常量，横屏绘制沿用）
  var SAVE_KEY = 'lobster_market_save_v1';
  var SERVE_PATIENCE = 28; // 当前顾客耐心（秒）
  var QUEUE_SIZE = 3;       // 排队人数（含正在服务的 1 人）

  // 集齐某阶段全部海鲜后的称号
  var STAGE_TITLE = {
    1: '虾蟹贝通',
    2: '白肉鱼行家',
    3: '多脂鱼大师',
    4: '深海探险家'
  };

  // 需求图标（图案化表达，避免纯文字）
  var NEED_ICON = { protein: '💪', o3: '🧠', zinc: '🛡️', fat: '🍃', selenium: '⚡' };
  // 阶段代表图标 / 营养维度图标 / 可持续图标（全游戏去文字化统一口径）
  var STAGE_EMOJI = { 1: '🦐', 2: '🐟', 3: '🍣', 4: '🗡️' };
  var DIM_ICON = { protein: '💪', o3: '🧠', zinc: '🛡️', selenium: '⚡', b12: '🩸', vitd: '☀️', fat: '🍃' };
  var SUSTAIN_ICON = { msc: '🏅', asc: '🏅', ok: '🐟', avoid: '🚫' };
  // 需求徽章底色（与订单气泡呼应，强化「图像化订单」）
  var NEED_TINT = { protein: '#c6f6d5', o3: '#bee3f8', zinc: '#feebc8', fat: '#c3f0e8', selenium: '#fefcbf' };

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.px = new Particles();
    this.hits = [];
    this.clock = 0;
    this._ckey = 0;
    this.state = this.freshState();
    this.vw = 1280; this.vh = 720; this.dpr = 1; this.portrait = false;
    this.W = 1280; this.H = 720; // 当前设计尺寸（竖屏时为 720×1280）
    this.load();
    this.spawnQueue();
  }

  // 响应式渲染管线：把画布缓冲区设为「CSS 尺寸 × devicePixelRatio」，
  // 再以统一缩放 U = vw / W 绘制（设计坐标恒为当前布局尺寸，不再缩放位图）。
  // 横屏 W=1280；竖屏切换为 W=720 / H=1280，画布按高度撑满竖屏，UI 满宽大字纵向堆叠。
  Game.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    var cssW = Math.round(r.width || this.canvas.clientWidth || 1280);
    var cssH = Math.round(r.height || (cssW * 9 / 16));
    if (!cssW || cssW < 1) cssW = 1280;
    if (!cssH || cssH < 1) cssH = 720;
    var dpr = Math.min((global.devicePixelRatio || 1), 3);
    this.dpr = dpr;
    this.vw = cssW;
    this.vh = cssH;
    this.portrait = cssH > cssW;
    if (this.portrait) { this.W = 720; this.H = 1280; }
    else { this.W = 1280; this.H = 720; }
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  };

  Game.prototype.freshState = function () {
    return {
      gold: 0, rep: 10, health: 10, stage: 1, served: 0, perfect: 0,
      soldCats: { shell: 0, white: 0, oily: 0, deep: 0 },
      sustainSold: { msc: 0, asc: 0 },
      dexUnlocked: {}, dexIndex: 0,
      queue: [], customer: null, timeLeft: 0, phase: 'serve',
      chosen: null, result: null, resultTimer: 0,
      toast: null, toastTimer: 0,
      showDex: false, detailItem: null, warn: null, day: 1, showIntro: true,
      returnLog: {}, titles: {}, stageBonus: {}
    };
  };

  // ---------- 存档 ----------
  Game.prototype.save = function () {
    try {
      var s = this.state;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        gold: s.gold, rep: s.rep, health: s.health, stage: s.stage,
        served: s.served, perfect: s.perfect,
        soldCats: s.soldCats, sustainSold: s.sustainSold,
        dexUnlocked: s.dexUnlocked, day: s.day,
        returnLog: s.returnLog, titles: s.titles, stageBonus: s.stageBonus,
        seenIntro: 1
      }));
    } catch (e) { /* file:// 下可能不可用，忽略 */ }
  };
  Game.prototype.load = function () {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw), s = this.state;
      ['gold', 'rep', 'health', 'stage', 'served', 'perfect', 'day'].forEach(function (k) {
        if (d[k] != null) s[k] = d[k];
      });
      ['soldCats', 'sustainSold', 'dexUnlocked', 'returnLog', 'titles', 'stageBonus'].forEach(function (k) {
        if (d[k]) s[k] = Object.assign(s[k], d[k]);
      });
      if (d.seenIntro) s.showIntro = false;
    } catch (e) { /* 忽略坏档 */ }
  };
  Game.prototype.resetSave = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    this.state = this.freshState();
    this.spawnQueue();
    this.toast('已重置存档');
  };

  // ---------- 顾客工厂 ----------
  Game.prototype.mkCustomer = function () {
    var type = L.pickCustomer();
    var log = this.state.returnLog[type.id];
    // 回头客：曾来过且上次满意，35% 概率以老主顾身份再来
    var returning = !!(log && log.visits >= 1 && log.satisfied && Math.random() < 0.35);
    return {
      key: 'c' + (++this._ckey),
      id: type.id, emoji: type.emoji, name: type.name, line: type.line,
      need: type.need, maxMercury: type.maxMercury, maxFat: type.maxFat, warn: type.warn,
      patience: SERVE_PATIENCE, timeLeft: SERVE_PATIENCE,
      returning: returning,
      visits: (log ? log.visits : 0) + 1,
      mood: 'happy'
    };
  };

  // 根据剩余耐心推导情绪
  function moodOf(c) {
    var r = c.timeLeft / c.patience;
    if (r > 0.5) return 'happy';
    if (r > 0.25) return 'neutral';
    if (r > 0.1) return 'impatient';
    return 'angry';
  }
  var MOOD_EMOJI = { happy: '😊', neutral: '😐', impatient: '😣', angry: '😡' };

  Game.prototype.syncFront = function () {
    var q = this.state.queue;
    this.state.customer = q[0] || null;
    this.state.timeLeft = this.state.customer ? this.state.customer.timeLeft : 0;
  };

  // 填满队列（不改变当前交互状态）
  Game.prototype.spawnQueue = function () {
    while (this.state.queue.length < QUEUE_SIZE) this.state.queue.push(this.mkCustomer());
    this.syncFront();
  };

  Game.prototype.chooseSeafood = function (item) {
    if (this.state.phase !== 'serve') return;
    var c = this.state.customer;
    if (!c) return;
    if (item.stage > this.state.stage) { this.toast('🔒 还没解锁：先把市场做大'); return; }
    this.state.chosen = item;
    this.state.phase = 'cook';
    A.sfx.click();
  };

  Game.prototype.serve = function (cookId) {
    var s = this.state, c = s.customer, item = s.chosen;
    if (!c || !item) return;
    var r = L.evaluate(c, item, cookId);
    // 回头客 / 情绪影响小费
    var mult = L.tipMultiplier(c);
    var boosted = r.tip > 0 ? Math.round(r.tip * (mult - 1)) : 0;
    r.gold = Math.round(r.gold * mult);
    if (r.ok && s.stageBonus[item.stage]) {
      var bonus = Math.round(r.gold * s.stageBonus[item.stage]);
      r.gold += bonus; boosted += bonus;
    }
    r.tipBonus = boosted;
    s.result = r;
    s.phase = 'result';
    s.resultTimer = 2.4;
    s.served++;

    if (!s.returnLog[c.id]) s.returnLog[c.id] = { visits: 0, satisfied: false };
    s.returnLog[c.id].visits = Math.max(s.returnLog[c.id].visits, c.visits);
    s.returnLog[c.id].satisfied = r.ok;

    if (r.ok) {
      s.gold += r.gold;
      if (r.grade === 'perfect') s.perfect++;
      s.health = Math.max(0, Math.min(20, s.health + r.health));
      s.soldCats[item.cat] = (s.soldCats[item.cat] || 0) + 1;
      if (item.sustain === 'msc' || item.sustain === 'asc') {
        s.sustainSold[item.sustain] = (s.sustainSold[item.sustain] || 0) + 1;
      }
      s.dexUnlocked[item.id] = true;
      A.sfx.coin();
      if (r.grade === 'perfect') A.sfx.good();
      if (item.sustain === 'avoid') { A.sfx.warn(); this.toast('🌊 过度捕捞鱼种：海洋守护者积分 -3'); }
      this.checkDexReward(item.stage);
    } else {
      s.rep = Math.max(0, s.rep - 1);
      A.sfx.bad();
    }
    this.checkUpgrade();
    this.save();
  };

  // 图鉴收集奖励：集齐某阶段全部海鲜 → 称号 + 该阶段收入 +10%
  Game.prototype.checkDexReward = function (stage) {
    var self = this;
    if (this.state.titles[stage]) return;
    var all = D.byStage(stage).every(function (x) { return self.state.dexUnlocked[x.id]; });
    if (!all) return;
    this.state.titles[stage] = STAGE_TITLE[stage];
    this.state.stageBonus[stage] = 0.10;
    this.toast('🏅 图鉴收集奖励：' + STAGE_TITLE[stage] + '！该阶段海鲜收入 +10%', 4);
    A.sfx.unlock();
  };

  Game.prototype.advance = function () {
    if (this.state.queue.length) this.state.queue.shift();
    this.state.chosen = null;
    this.state.result = null;
    this.state.phase = 'serve';
    this.spawnQueue();
  };

  // 队列优先级：把排在第 idx 位的顾客提到最前
  Game.prototype.promote = function (idx) {
    if (this.state.phase !== 'serve') return false;
    if (idx <= 0 || idx >= this.state.queue.length) return false;
    var c = this.state.queue.splice(idx, 1)[0];
    this.state.queue.unshift(c);
    this.syncFront();
    A.sfx.click();
    return true;
  };

  Game.prototype.checkUpgrade = function () {
    var s = this.state, next = L.unlockedStage(s.gold);
    if (next > s.stage) {
      s.stage = next;
      A.sfx.unlock();
      var st = D.STAGES[next - 1];
      this.toast('🎉 解锁阶段' + next + '：' + st.name + '！' + st.desc, 4);
      if (next === 4) {
        s.warn = {
          title: '⚠️ 进入深海与稀缺海鲜区',
          body: 'FDA / EPA 建议：孕妇、哺乳期女性与 17 岁以下儿童不要吃旗鱼（1.00ppm）、鲨鱼（0.98ppm）、方头鱼（1.45ppm）、王鲭（0.73ppm）、大眼金枪鱼（0.69ppm）。\n本阶段鱼种汞含量显著更高，卖给孕妇/儿童会被拒收并扣声望 —— 这是设计意图，不是 bug。\n💡 平衡提示：低汞鱼（如三文鱼 / 对虾）每周 2-3 份仍被 FDA 推荐，Omega-3 收益远大于低汞鱼风险；本题只在高汞鱼种上触发惩罚。',
          got: false
        };
      }
    }
  };

  Game.prototype.toast = function (msg, dur) {
    this.state.toast = msg;
    this.state.toastTimer = dur || 2.6;
  };

  // ---------- 输入 ----------
  Game.prototype.onClick = function (x, y) {
    var s = this.state;
    if (s.showIntro) { s.showIntro = false; A.sfx.click(); return; }
    if (s.warn) { s.warn = null; return; }
    // 「!」详情弹层打开时：点关闭按钮或弹层外区域即关闭
    if (s.detailItem) {
      if (this._detailClose && x >= this._detailClose.x && x <= this._detailClose.x + this._detailClose.w &&
        y >= this._detailClose.y && y <= this._detailClose.y + this._detailClose.h) {
        s.detailItem = null; A.sfx.click(); return;
      }
      var m = this._detailRect;
      if (!(m && x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h)) s.detailItem = null;
      return;
    }
    if (s.showDex) {
      var hitList = false;
      if (this.portrait) {
        // 竖屏图鉴：整列大列表可点切换；点列表外（详情区）关闭
        var dy = 110, dh = 66;
        for (var j = 0; j < D.SEAFOOD.length; j++) {
          if (x >= 20 && x <= this.W - 20 && y >= dy + j * dh && y <= dy + j * dh + dh - 6) {
            s.dexIndex = j; A.sfx.click(); hitList = true; break;
          }
        }
      } else {
        for (var i = 0; i < D.SEAFOOD.length; i++) {
          var ry = 150 + i * 52;
          if (x >= 32 && x <= 290 && y >= ry && y <= ry + 44) { s.dexIndex = i; A.sfx.click(); hitList = true; break; }
        }
      }
      if (!hitList) s.showDex = false; // 点列表外即关闭（横屏右侧空白 / 竖屏详情区）
      return;
    }
    // 「!」角标优先：点它开详情，不触发选货
    for (var d = 0; d < this.hits.length; d++) {
      var dh = this.hits[d];
      if (dh.kind === 'detail' && x >= dh.x && x <= dh.x + dh.w && y >= dh.y && y <= dh.y + dh.h) {
        s.detailItem = dh.item; A.sfx.click(); return;
      }
    }
    // 「下一位」次优先：结算面板画在货架之上（命中盒也后推），但点击必须
    // 优先结算按钮，否则高阶段货架卡与按钮区域重叠时会吃掉点击
    for (var n = 0; n < this.hits.length; n++) {
      var nh = this.hits[n];
      if (nh.kind === 'next' && x >= nh.x && x <= nh.x + nh.w && y >= nh.y && y <= nh.y + nh.h) {
        if (s.phase === 'result') this.advance();
        return;
      }
    }
    for (var k = 0; k < this.hits.length; k++) {
      var h = this.hits[k];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        if (h.kind === 'seafood') this.chooseSeafood(h.item);
        else if (h.kind === 'cook') this.serve(h.cookId);
        else if (h.kind === 'next') { if (s.phase === 'result') this.advance(); }
        else if (h.kind === 'promote') { this.promote(h.idx); }
        return;
      }
    }
  };

  Game.prototype.onKey = function (e) {
    var s = this.state, k = e.key;
    if (s.showIntro) { s.showIntro = false; return; }
    if (s.warn) { s.warn = null; return; }
    if (k === 't' || k === 'T') { s.showDex = !s.showDex; A.sfx.click(); return; }
    if (k === 'm' || k === 'M') { var on = A.toggle(); this.toast(on ? '🔊 音效开' : '🔇 音效关'); return; }
    if (k === 'n' || k === 'N') { this.resetSave(); return; }
    if (s.showDex) {
      if (k === 'ArrowRight') s.dexIndex = Math.min(D.SEAFOOD.length - 1, s.dexIndex + 1);
      if (k === 'ArrowLeft') s.dexIndex = Math.max(0, s.dexIndex - 1);
      if (k === 'Escape') s.showDex = false;
      return;
    }
    if (s.detailItem) { if (k === 'Escape') s.detailItem = null; return; }
    if (s.phase === 'serve') {
      var idx = parseInt(k, 10);
      if (!isNaN(idx) && idx >= 1) {
        var avail = this.availableItems();
        if (avail[idx - 1]) this.chooseSeafood(avail[idx - 1]);
      }
      // 数字键 1-9 选货架；[ ] 调整排队优先级
      if (k === '[') this.promote(1);
      if (k === ']') this.promote(2);
      if (k === ' ') { s.rep = Math.max(0, s.rep - 1); this.toast('当前顾客走了，声望 -1'); this.advance(); }
    } else if (s.phase === 'cook') {
      var map = { q: 'steam', w: 'garlic', e: 'braise', r: 'spicy' };
      if (map[k.toLowerCase()]) this.serve(map[k.toLowerCase()]);
      if (k === 'Escape') { s.phase = 'serve'; s.chosen = null; }
    } else if (s.phase === 'result') {
      if (k === ' ' || k === 'Enter') this.advance();
    }
  };

  Game.prototype.availableItems = function () {
    var s = this.state;
    return D.SEAFOOD.filter(function (x) { return x.stage <= s.stage; });
  };

  // 虚拟按钮（移动端/无键盘场景）：图鉴 / 音效 / 重置 / 下一位 / 全屏
  Game.prototype.tapButton = function (id) {
    var s = this.state;
    if (id === 'dex') { s.showDex = !s.showDex; A.sfx.click(); return true; }
    if (id === 'sound') {
      var on = A.toggle();
      this.toast(on ? '🔊 音效开' : '🔇 音效关');
      return true;
    }
    if (id === 'reset') { this.resetSave(); return true; }
    if (id === 'next') { if (s.phase === 'result') this.advance(); return true; }
    if (id === 'fullscreen') {
      // v1.11：回应「页面大小无法调节」——一键满屏（手机横屏画布过小时的解法）
      try {
        var doc = global.document;
        if (doc.fullscreenElement) { if (doc.exitFullscreen) doc.exitFullscreen(); }
        else if (doc.documentElement.requestFullscreen) doc.documentElement.requestFullscreen();
      } catch (e) { /* iframe 等环境可能被拒，忽略 */ }
      return true;
    }
    return false;
  };

  // ---------- 更新 ----------
  Game.prototype.update = function (dt) {
    var s = this.state;
    this.clock += dt;
    this.px.update(dt);
    if (s.toastTimer > 0) { s.toastTimer -= dt; if (s.toastTimer <= 0) s.toast = null; }
    if (s.warn || s.showDex || s.showIntro || s.detailItem) return;

    for (var i = s.queue.length - 1; i >= 0; i--) {
      var c = s.queue[i];
      c.timeLeft -= dt;
      c.mood = moodOf(c);
      if (c.timeLeft <= 0) {
        s.queue.splice(i, 1);
        s.rep = Math.max(0, s.rep - 1);
        A.sfx.bad();
        this.toast((i === 0 ? '顾客等太久走了' : '排队顾客不耐烦走了') + '，声望 -1');
        if (i === 0) { s.chosen = null; s.phase = 'serve'; s.result = null; }
      }
    }
    this.syncFront();

    if (s.phase === 'result') {
      s.resultTimer -= dt;
      if (s.resultTimer <= 0) this.advance();
    }
  };

  // ---------- 绘制通用工具 ----------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrap(ctx, text, maxW) {
    var out = [], line = '';
    for (var i = 0; i < text.length; i++) {
      var t = line + text[i];
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = text[i]; }
      else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  // 结算理由前缀图标（去文字化：用语义图标替代「·」分隔）
  function reasonIcon(t) {
    var c0 = t.charAt(0);
    if (c0 === '⚠️' || c0 === '💡' || c0 === '🌊' || c0 === '✅' || c0 === '🚫') return '';
    if (t.indexOf('拒收') >= 0) return '🚫 ';
    if (t.indexOf('不足') >= 0) return '❌ ';
    if (t.indexOf('满足') >= 0) return '✅ ';
    if (t.indexOf('勉强') >= 0) return '⚠️ ';
    if (t.indexOf('小费') >= 0) return '💰 ';
    if (t.indexOf('认证') >= 0) return '🏅 ';
    if (t.indexOf('过度捕捞') >= 0) return '🌊 ';
    return '• ';
  }

  // 顾客头像：圆盘 + emoji 脸 + 情绪角标（解决「看不到顾客是谁」）
  Game.prototype.drawAvatar = function (ctx, cx, cy, r, emoji, mood) {
    ctx.save();
    ctx.fillStyle = '#e6f0ff';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#cbd5e0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = Math.round(r * 1.1) + 'px system-ui, sans-serif';
    ctx.fillText(emoji, cx, cy + 1);
    ctx.font = Math.round(r * 0.5) + 'px system-ui, sans-serif';
    ctx.fillText(MOOD_EMOJI[mood] || '', cx + r * 0.72, cy - r * 0.72);
    ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  };

  // 订单气泡：📋订单 + 大需求图标徽章 + 文字要求。
  // v1.11 修复「需求文字与汞限制重叠」：徽章行统一 y+50、label 基线 y+57，
  // warn 行基线 y+h-14 —— 调用方必须给足高度（warn ? 110 : 76），否则必叠。
  Game.prototype.drawOrderBubble = function (ctx, x, y, w, h, need, warn) {
    var bg = warn ? '#fff5f5' : (need && NEED_TINT[need.key] ? NEED_TINT[need.key] : '#e6fffa');
    ctx.fillStyle = bg;
    rr(ctx, x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = warn ? '#feb2b2' : '#b2f5ea'; ctx.lineWidth = 1; ctx.stroke();
    // 订单小标签
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = warn ? '#c53030' : '#234e52';
    ctx.fillText('📋 订单', x + 14, y + 22);
    // 大需求图标徽章（统一垂直位，不再随 warn 分支跳）
    var badgeY = y + 50, badgeR = 22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + 14 + badgeR, badgeY, badgeR, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText(NEED_ICON[need.key] || '🎯', x + 14 + badgeR, badgeY + 1);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    // 文字要求（加大加粗，基线与徽章居中）
    ctx.font = 'bold 20px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#234e52';
    ctx.fillText(need.label, x + 14 + badgeR * 2 + 12, badgeY + 7);
    // 限制（独立一行，调用方给 h≥110 保证与 label 有 ≥20px 间距）
    if (warn) {
      ctx.font = '14px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#c53030';
      ctx.fillText('🚫 ' + warn, x + 14, y + h - 14);
    }
  };

  // ---------- 绘制主入口（横竖屏分流） ----------
  Game.prototype.draw = function () {
    var ctx = this.ctx, s = this.state;
    var U = this.vw / this.W;
    ctx.setTransform(this.dpr * U, 0, 0, this.dpr * U, 0, 0);
    this.hits = [];
    if (s.showDex) {
      if (this.portrait) this.drawDexP(ctx);
      else DEX.draw(ctx, W, H, s);
      this.drawToast(ctx);
      return;
    }
    if (this.portrait) {
      this.drawPortrait(ctx);
    } else {
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(0, 0, W, H);
      this.drawHUD(ctx);
      this.drawCustomer(ctx);
      this.drawQueue(ctx);
      this.drawShelf(ctx);
      if (s.phase === 'cook') this.drawCookBar(ctx);
      // 结算面板必须画在货架之后：两者坐标重叠（y=360..610 vs 货架 y=370..），
      // 先画会被货架完全盖住（真实浏览器实测 2026-10-08 抓到，竖屏无此问题）
      if (s.phase === 'result') this.drawResult(ctx);
      this.px.draw(ctx);
      this.drawToast(ctx);
      this.drawFooter(ctx);
    }
    if (s.detailItem) this.drawDetail(ctx);
    if (s.warn) this.drawWarn(ctx);
    if (s.showIntro) this.drawIntro(ctx);
  };

  // ================= 横屏绘制（1280×720，保持原版） =================
  Game.prototype.drawHUD = function (ctx) {
    var s = this.state;
    ctx.fillStyle = '#2c5282';
    rr(ctx, 0, 0, W, 66, 0); ctx.fill();
    var stars = L.starRating(s.soldCats, s.sustainSold);
    var items = [
      ['💰', '' + s.gold, '#f6c453'],
      ['⭐', '★'.repeat(stars) + '☆'.repeat(5 - stars), '#f6c453'],
      ['❤️', '' + s.health, '#fc8181'],
      ['📣', '' + s.rep, '#90cdf4'],
      [STAGE_EMOJI[s.stage], 'Lv.' + s.stage, '#bee3f8'],
      ['🍽️', '' + s.served, '#bee3f8'],
      ['🧵', '' + (s.queue.length - 1), '#bee3f8']
    ];
    var x = 24;
    items.forEach(function (it) {
      ctx.font = '18px system-ui, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = it[2];
      ctx.fillText(it[0] + ' ' + it[1], x, 42);
      x += ctx.measureText(it[0] + ' ' + it[1]).width + 22;
    });
    var nextStage = D.STAGES[s.stage];
    if (nextStage) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#bee3f8';
      ctx.font = '14px system-ui, "Microsoft YaHei", sans-serif';
      var need = nextStage.unlockGold;
      ctx.fillText('下一档 💰' + s.gold + '/' + need, W - 24, 42);
      var bw = 220, ratio = Math.min(1, s.gold / need);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(ctx, W - 24 - bw, 50, bw, 6, 3); ctx.fill();
      ctx.fillStyle = '#f6c453'; rr(ctx, W - 24 - bw, 50, Math.max(2, bw * ratio), 6, 3); ctx.fill();
    } else {
      ctx.textAlign = 'right'; ctx.fillStyle = '#f6c453';
      ctx.font = 'bold 16px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText('🏆 全解锁', W - 24, 42);
    }
  };

  Game.prototype.drawCustomer = function (ctx) {
    var s = this.state, c = s.customer;
    if (!c) return;
    var x = 40, y = 96, w = 500, h = 268;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.stroke();

    this.drawAvatar(ctx, x + 82, y + 74, 56, c.emoji, c.mood);

    ctx.textAlign = 'left';
    ctx.font = 'bold 22px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2d3748';
    ctx.fillText(c.name + (c.returning ? '  🎀回头客' : ''), x + 156, y + 50);
    ctx.font = '15px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#4a5568';
    var line = c.line + (c.returning ? '（老主顾了，多照顾下～）' : '');
    wrap(ctx, '「' + line + '」', w - 180).forEach(function (l, i) {
      ctx.fillText(l, x + 156, y + 76 + i * 22);
    });

    // v1.11：气泡给足高度（warn?110:76），台词(y+76/98)与耐心条(y+238)均不重叠
    var bx = x + 24, by = y + 118, bw = w - 48, bh = c.warn ? 110 : 76;
    this.drawOrderBubble(ctx, bx, by, bw, bh, c.need, c.warn);

    var ratio = Math.max(0, s.timeLeft / c.patience);
    ctx.fillStyle = '#edf2f7'; rr(ctx, x + 24, y + h - 30, w - 48, 12, 6); ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? '#38a169' : (ratio > 0.25 ? '#dd6b20' : '#c53030');
    rr(ctx, x + 24, y + h - 30, Math.max(2, (w - 48) * ratio), 12, 6); ctx.fill();
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#718096'; ctx.textAlign = 'right';
    ctx.fillText(s.timeLeft.toFixed(1) + 's', x + w - 24, y + h - 38);
  };

  Game.prototype.drawQueue = function (ctx) {
    var s = this.state;
    if (s.queue.length <= 1) return;
    var x = 560, y = 96, w = 360, h = 78, gap = 10;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#718096';
    ctx.font = 'bold 14px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('👥 队列 · 点我优先', x, y - 8);
    for (var i = 1; i < s.queue.length; i++) {
      var c = s.queue[i];
      var yy = y + (i - 1) * (h + gap);
      ctx.fillStyle = '#ffffff';
      rr(ctx, x, yy, w, h, 12); ctx.fill();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.stroke();
      // v1.11：同竖屏——drawAvatar 替代双 emoji 连排，避免压住 x+64 起的文字
      this.drawAvatar(ctx, x + 38, yy + 40, 26, c.emoji, c.mood);
      ctx.font = 'bold 15px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#2d3748';
      ctx.fillText(c.name + (c.returning ? ' 🎀' : ''), x + 64, yy + 30);
      ctx.font = '12px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#4a5568';
      ctx.fillText(c.need.label, x + 64, yy + 52);
      ctx.fillStyle = '#a0aec0'; ctx.textAlign = 'right';
      ctx.fillText('#' + (i + 1) + ' ' + c.timeLeft.toFixed(0) + 's', x + w - 14, yy + 30);
      ctx.textAlign = 'left';
      if (s.phase === 'serve') this.hits.push({ x: x, y: yy, w: w, h: h, kind: 'promote', idx: i });
    }
  };

  Game.prototype.drawResult = function (ctx) {
    var s = this.state, r = s.result;
    var x = 590, y = 360, w = W - x - 40, h = 250;
    ctx.fillStyle = r ? '#ffffff' : '#fffdf7';
    rr(ctx, x, y, w, h, 14); ctx.fill();
    ctx.setLineDash(r ? [] : [6, 6]);
    ctx.strokeStyle = r ? (r.ok ? '#38a169' : '#c53030') : '#cbd5e0';
    ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);

    ctx.textAlign = 'left';
    if (!r) {
      ctx.fillStyle = '#a0aec0';
      ctx.font = '16px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText('🦞 → 🛒 → 🍳 → 😋', x + 24, y + 40);
      ctx.fillText('选海鲜 · 选做法 · 看成交', x + 24, y + 66);
      return;
    }
    ctx.font = 'bold 20px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = r.grade === 'perfect' ? '#38a169' : (r.grade === 'pass' ? '#dd6b20' : '#c53030');
    var title = r.grade === 'perfect' ? '😋 完全满足需求' : (r.grade === 'pass' ? '😐 勉强成交' : '😡 顾客拒收');
    ctx.fillText(title, x + 24, y + 38);
    ctx.font = '15px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2d3748';
    r.reasons.slice(0, 6).forEach(function (line, i) {
      ctx.fillText(reasonIcon(line) + line, x + 24, y + 70 + i * 24);
    });
    var extra = '💰 +' + r.gold + '   ❤️ ' + (r.health >= 0 ? '+' : '') + r.health +
      '   🌊 ' + (r.sustainScore >= 0 ? '+' : '') + r.sustainScore;
    if (r.tipBonus > 0) extra += '   🎀 +' + r.tipBonus;
    ctx.fillStyle = '#4a5568';
    ctx.font = '14px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(extra, x + 24, y + h - 24);
    if (s.phase === 'result') {
      ctx.textAlign = 'right'; ctx.fillStyle = '#a0aec0';
      ctx.fillText('▶ 下一位', x + w - 24, y + h - 24);
      this.hits.push({ x: x + w - 150, y: y + h - 46, w: 130, h: 30, kind: 'next' });
    }
  };

  Game.prototype.drawShelf = function (ctx) {
    var s = this.state;
    var items = D.SEAFOOD.filter(function (x) { return x.stage <= s.stage + 1; });
    var cols = 5, gap = 12, x0 = 40, y0 = 370, Wp = W;
    var availH = 720 - y0 - 30; // 留出 footer
    var rows = Math.ceil(items.length / cols);
    var ch = Math.min(150, (availH - (rows - 1) * gap) / rows);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2d3748';
    ctx.font = 'bold 18px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('🏪 货架', x0, y0 - 14);

    for (var r = 0; r < rows; r++) {
      var rowItems = items.slice(r * cols, r * cols + cols);
      var cnt = rowItems.length;
      // 最后一行不足 cols 时均分宽度，消除缺角空白
      var cw = (r === rows - 1)
        ? (Wp - x0 * 2 - (cnt - 1) * gap) / cnt
        : (Wp - x0 * 2 - (cols - 1) * gap) / cols;
      var y = y0 + r * (ch + gap);
      for (var j = 0; j < cnt; j++) {
        var it = rowItems[j], gi = r * cols + j;
        var x = x0 + j * (cw + gap);
        var locked = it.stage > s.stage;
        var chosen = s.chosen && s.chosen.id === it.id;

        ctx.fillStyle = locked ? '#f7f7f7' : '#ffffff';
        rr(ctx, x, y, cw, ch, 12); ctx.fill();
        ctx.strokeStyle = chosen ? '#319795' : (locked ? '#e2e8f0' : '#fed7aa');
        ctx.lineWidth = chosen ? 3 : 1.5; ctx.stroke();

        ctx.globalAlpha = locked ? 0.45 : 1;
        ctx.font = '46px system-ui, sans-serif';
        ctx.fillStyle = '#2d3748';
        ctx.fillText(locked ? '🔒' : it.emoji, x + 18, y + ch * 0.5);
        ctx.font = 'bold 18px system-ui, "Microsoft YaHei", sans-serif';
        ctx.fillText(locked ? '未解锁' : it.name, x + 18, y + ch * 0.74);
        ctx.globalAlpha = 1;

        if (!locked) {
          ctx.fillStyle = '#a0aec0'; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'right';
          ctx.fillText('💰' + it.price, x + cw - 14, y + ch - 12);
          ctx.textAlign = 'left';
          var bx = x + cw - 26, by = y + 14, br = 13;
          ctx.fillStyle = it.mercury >= 0.5 ? '#c53030' : (it.mercury >= 0.3 ? '#dd6b20' : '#38a169');
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('!', bx, by + 6); ctx.textAlign = 'left';
          this.hits.push({ x: bx - br, y: by - br, w: br * 2, h: br * 2, kind: 'detail', item: it });
          this.hits.push({ x: x, y: y, w: cw, h: ch, kind: 'seafood', item: it });
        } else {
          ctx.fillStyle = '#a0aec0'; ctx.font = '13px system-ui, "Microsoft YaHei", sans-serif';
          ctx.fillText('阶段' + it.stage + ' 解锁', x + 18, y + ch * 0.9);
        }
      }
    }
  };

  Game.prototype.drawCookBar = function (ctx) {
    var s = this.state;
    var bw = 200, bh = 62, gap = 16;
    var total = D.COOKS.length * bw + (D.COOKS.length - 1) * gap;
    var x0 = (W - total) / 2, y = 300;
    ctx.fillStyle = 'rgba(44,82,130,0.95)';
    rr(ctx, x0 - 20, y - 34, total + 40, bh + 60, 14); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f6c453';
    ctx.font = 'bold 16px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('「' + s.chosen.name + '」🍳', W / 2, y - 12);
    D.COOKS.forEach(function (c, i) {
      var x = x0 + i * (bw + gap);
      ctx.fillStyle = '#ffffff';
      rr(ctx, x, y, bw, bh, 10); ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = '28px system-ui, sans-serif';
      ctx.fillStyle = '#2d3748';
      ctx.fillText(c.emoji, x + 12, y + 42);
      ctx.font = 'bold 16px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText(c.name, x + 54, y + 26);
      ctx.font = '12px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = c.health >= 0 ? '#38a169' : '#c53030';
      ctx.fillText('❤️' + (c.health >= 0 ? '+' : '') + c.health + '  💰×' + c.goldMul, x + 54, y + 48);
      this.hits.push({ x: x, y: y, w: bw, h: bh, kind: 'cook', cookId: c.id });
    }, this);
  };

  Game.prototype.drawFooter = function (ctx) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a0aec0';
    ctx.font = '13px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('🏪选货  ❗营养  🍳做法  👥优先  📖图鉴', 40, H - 18);
  };

  // ================= 竖屏绘制（720×1280，满宽大字纵向堆叠） =================
  Game.prototype.drawPortrait = function (ctx) {
    var s = this.state, Wp = this.W, Hp = this.H;
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, Wp, Hp);
    this.drawPortraitHUD(ctx);
    this.drawCustomerP(ctx);
    this.drawQueueP(ctx);
    this.drawShelfP(ctx);
    if (s.phase === 'cook') this.drawCookBarP(ctx);
    // 结算面板最后画：盖住货架与底栏，避免面板底部被货架压住（与横屏同理）
    if (s.phase === 'result') this.drawResultP(ctx);
    this.px.draw(ctx);
    this.drawToast(ctx);
    this.drawFooterP(ctx);
  };

  Game.prototype.drawPortraitHUD = function (ctx) {
    var s = this.state, Wp = this.W;
    ctx.fillStyle = '#2c5282';
    rr(ctx, 0, 0, Wp, 150, 0); ctx.fill();
    var stars = L.starRating(s.soldCats, s.sustainSold);
    ctx.textAlign = 'left';
    ctx.font = 'bold 26px system-ui, "Microsoft YaHei", sans-serif';
    // 行 1
    var y1 = 44, x = 20;
    [['💰', '' + s.gold, '#f6c453'],
     ['⭐', '★'.repeat(stars) + '☆'.repeat(5 - stars), '#f6c453'],
     ['❤️', '' + s.health, '#fc8181']].forEach(function (it) {
      ctx.fillStyle = it[2];
      ctx.fillText(it[0] + ' ' + it[1], x, y1);
      x += ctx.measureText(it[0] + ' ' + it[1]).width + 28;
    });
    // 行 2
    var y2 = 88, x2 = 20;
    [['📣', '' + s.rep, '#90cdf4'],
     [STAGE_EMOJI[s.stage], 'Lv.' + s.stage, '#bee3f8'],
     ['🍽️', '' + s.served, '#bee3f8'],
     ['🧵', '' + (s.queue.length - 1), '#bee3f8']].forEach(function (it) {
      ctx.fillStyle = it[2];
      ctx.fillText(it[0] + ' ' + it[1], x2, y2);
      x2 += ctx.measureText(it[0] + ' ' + it[1]).width + 22;
    });
    // 行 3：下一阶段进度
    var nextStage = D.STAGES[s.stage];
    ctx.textAlign = 'left';
    if (nextStage) {
      ctx.font = '20px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#bee3f8';
      var need = nextStage.unlockGold;
      ctx.fillText('下一档 💰' + s.gold + '/' + need, 20, 128);
      var bw = Wp - 40, ratio = Math.min(1, s.gold / need);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(ctx, 20, 134, bw, 8, 4); ctx.fill();
      ctx.fillStyle = '#f6c453'; rr(ctx, 20, 134, Math.max(3, bw * ratio), 8, 4); ctx.fill();
    } else {
      ctx.font = 'bold 22px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#f6c453';
      ctx.fillText('🏆 全解锁', 20, 128);
    }
  };

  Game.prototype.drawCustomerP = function (ctx) {
    var s = this.state, c = s.customer, Wp = this.W;
    if (!c) return;
    var x = 20, y = 162, w = Wp - 40, h = 300;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.stroke();

    this.drawAvatar(ctx, x + 92, y + 90, 60, c.emoji, c.mood);

    ctx.textAlign = 'left';
    ctx.font = 'bold 34px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2d3748';
    ctx.fillText(c.name + (c.returning ? '  🎀回头客' : ''), x + 184, y + 56);
    ctx.font = '24px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#4a5568';
    var line = c.line + (c.returning ? '（老主顾了，多照顾下～）' : '');
    wrap(ctx, '「' + line + '」', w - 210).forEach(function (l, i) {
      ctx.fillText(l, x + 184, y + 96 + i * 32);
    });

    // v1.11：气泡给足高度（warn?110:76）；台词两行到 y+128，气泡 y+140 起，warn 底 y+250 < 耐心条 y+256
    var bx = x + 24, by = y + 140, bw = w - 48, bh = c.warn ? 110 : 76;
    this.drawOrderBubble(ctx, bx, by, bw, bh, c.need, c.warn);

    var ratio = Math.max(0, s.timeLeft / c.patience);
    ctx.fillStyle = '#edf2f7'; rr(ctx, x + 24, y + h - 44, w - 48, 18, 9); ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? '#38a169' : (ratio > 0.25 ? '#dd6b20' : '#c53030');
    rr(ctx, x + 24, y + h - 44, Math.max(3, (w - 48) * ratio), 18, 9); ctx.fill();
    ctx.font = '22px system-ui, sans-serif'; ctx.fillStyle = '#718096'; ctx.textAlign = 'right';
    ctx.fillText(s.timeLeft.toFixed(1) + 's', x + w - 24, y + h - 52);
  };

  Game.prototype.drawQueueP = function (ctx) {
    var s = this.state, Wp = this.W;
    if (s.queue.length <= 1) return;
    var n = s.queue.length - 1;
    var gap = 12, x = 20, y = 470;
    var w = (Wp - 40 - (n - 1) * gap) / n, h = 116;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#718096';
    ctx.font = 'bold 22px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('👥 队列 · 点我优先', x, y - 10);
    for (var i = 1; i < s.queue.length; i++) {
      var c = s.queue[i];
      var xx = x + (i - 1) * (w + gap);
      ctx.fillStyle = '#ffffff';
      rr(ctx, xx, y, w, h, 14); ctx.fill();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.stroke();
      // v1.11：drawAvatar（圆盘+人物+情绪角标）替代「人物+情绪」双 emoji 连排，
      // 双 emoji 连排 54px 会压住 xx+86 起的需求文字（实测截图取证）
      this.drawAvatar(ctx, xx + 44, y + 58, 34, c.emoji, c.mood);
      ctx.font = 'bold 22px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#2d3748';
      ctx.fillText(c.name + (c.returning ? ' 🎀' : ''), xx + 86, y + 40);
      ctx.font = '18px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#4a5568';
      ctx.fillText(c.need.label, xx + 86, y + 72);
      ctx.fillStyle = '#a0aec0'; ctx.textAlign = 'right';
      ctx.fillText('#' + (i + 1) + ' ' + c.timeLeft.toFixed(0) + 's', xx + w - 14, y + 40);
      ctx.textAlign = 'left';
      if (s.phase === 'serve') this.hits.push({ x: xx, y: y, w: w, h: h, kind: 'promote', idx: i });
    }
  };

  Game.prototype.drawResultP = function (ctx) {
    var s = this.state, r = s.result, Wp = this.W;
    // 仅在结算阶段绘制；serve/cook 阶段不画占位卡，避免覆盖顾客卡导致文字叠在一起
    if (!r) return;
    // 覆盖顾客卡区域，做成大号结算面板
    var x = 20, y = 162, w = Wp - 40, h = 470;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x, y, w, h, 16); ctx.fill();
    ctx.setLineDash([]);
    ctx.strokeStyle = r.ok ? '#38a169' : '#c53030';
    ctx.lineWidth = 3; ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = 'bold 36px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = r.grade === 'perfect' ? '#38a169' : (r.grade === 'pass' ? '#dd6b20' : '#c53030');
    var title = r.grade === 'perfect' ? '😋 完全满足需求' : (r.grade === 'pass' ? '😐 勉强成交' : '😡 顾客拒收');
    ctx.fillText(title, x + 30, y + 64);
    ctx.font = '26px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2d3748';
    r.reasons.slice(0, 7).forEach(function (line, i) {
      ctx.fillText(reasonIcon(line) + line, x + 30, y + 120 + i * 40);
    });
    var extra = '💰 +' + r.gold + '   ❤️ ' + (r.health >= 0 ? '+' : '') + r.health +
      '   🌊 ' + (r.sustainScore >= 0 ? '+' : '') + r.sustainScore;
    if (r.tipBonus > 0) extra += '   🎀 +' + r.tipBonus;
    ctx.fillStyle = '#4a5568';
    ctx.font = '24px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(extra, x + 30, y + h - 56);
    if (s.phase === 'result') {
      ctx.textAlign = 'right'; ctx.fillStyle = '#a0aec0';
      ctx.font = '22px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText('▶ 下一位', x + w - 30, y + h - 56);
      this.hits.push({ x: x + w - 200, y: y + h - 90, w: 180, h: 60, kind: 'next' });
    }
  };

  Game.prototype.drawShelfP = function (ctx) {
    var s = this.state, Wp = this.W, Hp = this.H;
    var items = D.SEAFOOD.filter(function (x) { return x.stage <= s.stage + 1; });
    var cols = 3, gap = 12, x0 = 20, y0 = 612;
    var avail = Hp - y0 - 46; // 留出 footer
    var rows = Math.ceil(items.length / cols);
    var ch = (avail - (rows - 1) * gap) / rows;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2d3748';
    ctx.font = 'bold 26px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('🏪 货架', x0, y0 - 14);

    for (var r = 0; r < rows; r++) {
      var rowItems = items.slice(r * cols, r * cols + cols);
      var cnt = rowItems.length;
      // 最后一行不足 cols 时均分宽度，消除缺角空白
      var cw = (r === rows - 1)
        ? (Wp - 40 - (cnt - 1) * gap) / cnt
        : (Wp - 40 - (cols - 1) * gap) / cols;
      var y = y0 + r * (ch + gap);
      for (var j = 0; j < cnt; j++) {
        var it = rowItems[j], gi = r * cols + j;
        var x = x0 + j * (cw + gap);
        var locked = it.stage > s.stage;
        var chosen = s.chosen && s.chosen.id === it.id;

        ctx.fillStyle = locked ? '#f7f7f7' : '#ffffff';
        rr(ctx, x, y, cw, ch, 14); ctx.fill();
        ctx.strokeStyle = chosen ? '#319795' : (locked ? '#e2e8f0' : '#fed7aa');
        ctx.lineWidth = chosen ? 4 : 2; ctx.stroke();

        ctx.globalAlpha = locked ? 0.45 : 1;
        ctx.font = '60px system-ui, sans-serif';
        ctx.fillStyle = '#2d3748';
        ctx.fillText(locked ? '🔒' : it.emoji, x + 18, y + ch * 0.46);

        ctx.font = 'bold 26px system-ui, "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#2d3748';
        ctx.fillText(locked ? '未解锁' : it.name, x + 20, y + ch * 0.64);
        ctx.globalAlpha = 1;

        if (!locked) {
          ctx.fillStyle = '#a0aec0'; ctx.font = '17px system-ui, sans-serif'; ctx.textAlign = 'right';
          ctx.fillText('💰' + it.price, x + cw - 16, y + ch * 0.28);
          ctx.textAlign = 'left';
          var bx = x + cw - 26, by = y + 24, br = 16;
          ctx.fillStyle = it.mercury >= 0.5 ? '#c53030' : (it.mercury >= 0.3 ? '#dd6b20' : '#38a169');
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('!', bx, by + 8); ctx.textAlign = 'left';
          this.hits.push({ x: bx - br, y: by - br, w: br * 2, h: br * 2, kind: 'detail', item: it });
          this.hits.push({ x: x, y: y, w: cw, h: ch, kind: 'seafood', item: it });
        } else {
          ctx.fillStyle = '#a0aec0'; ctx.font = '17px system-ui, "Microsoft YaHei", sans-serif';
          ctx.fillText('阶段' + it.stage + ' 解锁', x + 20, y + ch * 0.82);
        }
      }
    }
  };

  Game.prototype.drawCookBarP = function (ctx) {
    var s = this.state, Wp = this.W;
    var bw = (Wp - 40 - 3 * 12) / 4, bh = 130, gap = 12;
    var x0 = 20, y = 482;
    ctx.fillStyle = 'rgba(44,82,130,0.95)';
    rr(ctx, x0 - 12, y - 44, Wp - 16, bh + 64, 16); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f6c453';
    ctx.font = 'bold 26px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('「' + s.chosen.name + '」🍳', Wp / 2, y - 14);
    D.COOKS.forEach(function (c, i) {
      var x = x0 + i * (bw + gap);
      ctx.fillStyle = '#ffffff';
      rr(ctx, x, y, bw, bh, 12); ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = '44px system-ui, sans-serif';
      ctx.fillStyle = '#2d3748';
      ctx.fillText(c.emoji, x + 14, y + 62);
      ctx.font = 'bold 24px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText(c.name, x + 14, y + 96);
      ctx.font = '18px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = c.health >= 0 ? '#38a169' : '#c53030';
      ctx.fillText('❤️' + (c.health >= 0 ? '+' : '') + c.health, x + 14, y + 120);
      this.hits.push({ x: x, y: y, w: bw, h: bh, kind: 'cook', cookId: c.id });
    }, this);
  };

  Game.prototype.drawFooterP = function (ctx) {
    var Wp = this.W, Hp = this.H;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a0aec0';
    ctx.font = '20px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('🏪选货  ❗营养  🍳做法  👥优先  📖图鉴', Wp / 2, Hp - 16);
  };

  // 竖屏图鉴（单列大列表，可点切换）
  Game.prototype.drawDexP = function (ctx) {
    var s = this.state, Wp = this.W, Hp = this.H;
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, Wp, Hp);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2c5282';
    ctx.font = 'bold 30px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('📖 图鉴', 20, 50);
    var totalP = D.SEAFOOD.length;
    var gotP = D.SEAFOOD.filter(function (x) { return s.dexUnlocked[x.id]; }).length;
    ctx.font = 'bold 17px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2f855a';
    ctx.fillText('📚 ' + gotP + '/' + totalP + ' 已收集', 150, 50);
    var dy = 110, dh = 66;
    D.SEAFOOD.forEach(function (it, i) {
      var y = dy + i * dh;
      var sel = i === s.dexIndex;
      var unlocked = s.dexUnlocked[it.id];
      ctx.fillStyle = sel ? '#fef3c7' : (unlocked ? '#ffffff' : '#f7fafc');
      rr(ctx, 20, y, Wp - 40, dh - 8, 12); ctx.fill();
      ctx.strokeStyle = sel ? '#f6c453' : '#e2e8f0'; ctx.lineWidth = sel ? 3 : 1; ctx.stroke();
      ctx.font = '40px system-ui, sans-serif';
      ctx.globalAlpha = unlocked ? 1 : 0.3;
      ctx.fillStyle = '#2d3748';
      ctx.fillText(unlocked ? it.emoji : '🔒', 36, y + 46);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 24px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = unlocked ? '#2d3748' : '#a0aec0';
      ctx.fillText(unlocked ? it.name : '？？？', 96, y + 32);
      ctx.font = '17px system-ui, "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#4a5568';
      ctx.fillText(DIM_ICON.protein + it.protein + ' ' + DIM_ICON.o3 + it.o3 + ' ' +
        (it.mercury >= 0.5 ? '🔴' : it.mercury >= 0.3 ? '🟠' : '🟢') + it.mercury, 96, y + 56);
      ctx.textAlign = 'right'; ctx.fillStyle = it.mercury >= 0.5 ? '#c53030' : (it.mercury >= 0.3 ? '#dd6b20' : '#38a169');
      ctx.font = '15px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText(unlocked ? DEX.mercuryVerdict(it.mercury).slice(0, 12) : '未解锁', Wp - 36, y + 40);
      if (unlocked) { ctx.fillStyle = '#38a169'; ctx.font = '15px system-ui, sans-serif'; ctx.fillText('✅', Wp - 36, y + 62); }
      ctx.textAlign = 'left';
    });
    // 详情区（点此关闭图鉴）
    var it = D.SEAFOOD[s.dexIndex];
    var detY = dy + D.SEAFOOD.length * dh + 4;
    ctx.fillStyle = '#2c5282'; rr(ctx, 20, detY, Wp - 40, Math.min(140, Hp - detY - 10), 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(it.emoji + ' ' + it.name, 40, detY + 40);
    ctx.font = '19px system-ui, "Microsoft YaHei", sans-serif';
    wrap(ctx, it.note, Wp - 80).forEach(function (l, i) {
      ctx.fillText(l, 40, detY + 76 + i * 28);
    });
  };

  // ---------- 通用覆盖层（横竖屏共用，基于 this.W/this.H） ----------

  // 「!」营养详情弹层：图案优先（雷达图 + 汞条 + 可持续标识），数值文字收起
  Game.prototype.drawDetail = function (ctx) {
    var s = this.state, Wp = this.W, Hp = this.H;
    var it = s.detailItem;
    ctx.fillStyle = 'rgba(26,32,44,0.55)';
    ctx.fillRect(0, 0, Wp, Hp);
    var mw = Math.min(Wp - 40, 600), mh = Math.min(Hp - 80, 560);
    var mx = (Wp - mw) / 2, my = (Hp - mh) / 2;
    this._detailRect = { x: mx, y: my, w: mw, h: mh };
    ctx.fillStyle = '#fffaf0';
    rr(ctx, mx, my, mw, mh, 18); ctx.fill();
    ctx.strokeStyle = '#319795'; ctx.lineWidth = 3; ctx.stroke();

    // 标题：大 emoji + 名称 + 阶段标签
    ctx.textAlign = 'left';
    ctx.font = (this.portrait ? '66px' : '56px') + ' system-ui, sans-serif';
    ctx.fillStyle = '#2d3748';
    ctx.fillText(it.emoji, mx + 26, my + (this.portrait ? 82 : 74));
    ctx.font = (this.portrait ? 'bold 34px' : 'bold 30px') + ' system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(it.name, mx + (this.portrait ? 112 : 102), my + (this.portrait ? 58 : 52));
    ctx.fillStyle = '#718096';
    ctx.font = (this.portrait ? '18px' : '15px') + ' system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(STAGE_EMOJI[it.stage] + ' Lv.' + it.stage + ' · 💰' + it.price, mx + (this.portrait ? 112 : 102), my + (this.portrait ? 88 : 80));

    // 关闭按钮 ✕
    var cb = this.portrait ? 46 : 38, cx = mx + mw - cb - 14, cy = my + 14;
    ctx.fillStyle = '#e2e8f0'; rr(ctx, cx, cy, cb, cb, 10); ctx.fill();
    ctx.fillStyle = '#4a5568'; ctx.textAlign = 'center';
    ctx.font = 'bold ' + (this.portrait ? 28 : 22) + 'px system-ui, sans-serif';
    ctx.fillText('✕', cx + cb / 2, cy + (this.portrait ? 32 : 26)); ctx.textAlign = 'left';
    this._detailClose = { x: cx, y: cy, w: cb, h: cb };

    var pad = 26, tx, tw, ty;
    if (this.portrait) {
      DEX.drawRadar(ctx, mx + mw / 2, my + 195, 100, it);
      tx = mx + pad; tw = mw - pad * 2; ty = my + 320;
    } else {
      DEX.drawRadar(ctx, mx + 152, my + 252, 108, it);
      tx = mx + 308; tw = mw - 308 - pad; ty = my + 120;
    }

    // 汞条（图案 + 一句判定，不堆文字）
    var col = it.mercury >= 0.5 ? '#c53030' : (it.mercury >= 0.3 ? '#dd6b20' : '#38a169');
    ctx.fillStyle = '#2d3748';
    ctx.font = (this.portrait ? 'bold 20px' : 'bold 16px') + ' system-ui, "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('汞含量 ' + it.mercury + ' ppm', tx, ty);
    var barW = tw, byy = ty + 12;
    ctx.fillStyle = '#edf2f7'; rr(ctx, tx, byy, barW, 14, 7); ctx.fill();
    ctx.fillStyle = col; rr(ctx, tx, byy, Math.max(6, barW * Math.min(1, it.mercury / 1.0)), 14, 7); ctx.fill();
    ctx.fillStyle = col; ctx.font = (this.portrait ? '17px' : '14px') + ' system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(DEX.mercuryVerdict(it.mercury), tx, byy + 38);
    ty = byy + 70;

    // 可持续性（图标 + 一句）
    var su = D.SUSTAIN[it.sustain];
    ctx.font = (this.portrait ? 'bold 18px' : 'bold 15px') + ' system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = su.color;
    ctx.fillText('🌊 ' + su.label, tx, ty);
    ty += this.portrait ? 36 : 30;

    // 营养师点评（短，收在「!」里本就属详情）
    ctx.font = (this.portrait ? '17px' : '14px') + ' system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#4a5568';
    wrap(ctx, '💬 ' + it.note, tw).slice(0, 5).forEach(function (l, i) {
      ctx.fillText(l, tx, ty + i * (this.portrait ? 28 : 22));
    }, this);

    // 底部提示
  };

  Game.prototype.drawToast = function (ctx) {
    var s = this.state, Wp = this.W;
    if (!s.toast) return;
    var fs = this.portrait ? 26 : 18;
    ctx.font = 'bold ' + fs + 'px system-ui, "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(s.toast).width + (this.portrait ? 60 : 48);
    var bw = Math.min(w, Wp - 24), bx = (Wp - bw) / 2, by = this.portrait ? 160 : 78;
    ctx.fillStyle = 'rgba(44,82,130,0.94)';
    rr(ctx, bx, by, bw, this.portrait ? 56 : 46, 23); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(s.toast, Wp / 2, by + (this.portrait ? 38 : 30));
  };

  Game.prototype.drawWarn = function (ctx) {
    var s = this.state, Wp = this.W, Hp = this.H;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, Wp, Hp);
    var w = Math.min(Wp - 40, 640), h = this.portrait ? 560 : 320;
    var x = (Wp - w) / 2, y = (Hp - h) / 2;
    ctx.fillStyle = '#fffaf0';
    rr(ctx, x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = '#c53030'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c53030';
    ctx.font = 'bold ' + (this.portrait ? 32 : 24) + 'px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(s.warn.title, x + 32, y + 52);
    ctx.fillStyle = '#2d3748';
    ctx.font = (this.portrait ? 22 : 16) + 'px system-ui, "Microsoft YaHei", sans-serif';
    s.warn.body.split('\n').forEach(function (l, i) {
      wrap(ctx, l, w - 64).forEach(function (line, j) {
        ctx.fillText(line, x + 32, y + 92 + (i * 2 + j) * (this.portrait ? 34 : 26));
      }, this);
    }, this);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#718096';
    ctx.font = (this.portrait ? 20 : 14) + 'px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('（点击任意处 / 按任意键关闭）', Wp / 2, y + h - 24);
  };

  // 首次进入：图标化玩法引导（直接回应「游戏里都是文字」的抱怨）
  Game.prototype.drawIntro = function (ctx) {
    var s = this.state, Wp = this.W, Hp = this.H;
    ctx.fillStyle = 'rgba(26,32,44,0.84)';
    ctx.fillRect(0, 0, Wp, Hp);
    var mw = Math.min(Wp - 40, 560), mh = Math.min(Hp - 60, 470);
    var mx = (Wp - mw) / 2, my = (Hp - mh) / 2;
    ctx.fillStyle = '#fffaf0';
    rr(ctx, mx, my, mw, mh, 18); ctx.fill();
    ctx.strokeStyle = '#f6c453'; ctx.lineWidth = 3; ctx.stroke();

    var cx = Wp / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2c5282';
    ctx.font = (this.portrait ? 'bold 36px' : 'bold 30px') + ' system-ui, sans-serif';
    ctx.fillText('🦞 龙虾市场', cx, my + (this.portrait ? 66 : 56));

    var lines = [
      '👉 顾客头顶气泡 = 他要什么',
      '   💪蛋白  🧠DHA  🛡️锌  🍃低脂',
      '',
      '🏪 选海鲜  →  🍳 选做法  →  😋 成交',
      '',
      '❗ 点卡片右上红点看营养详情',
      '🔴 高汞鱼别卖给孕妇 / 小孩',
      '💰 攒金币解锁更多海鲜'
    ];
    ctx.font = (this.portrait ? '18px' : '15px') + ' system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2d3748';
    var ly = my + (this.portrait ? 112 : 98);
    lines.forEach(function (t, i) {
      ctx.fillText(t, cx, ly + i * (this.portrait ? 30 : 26));
    }, this);

    var bw = this.portrait ? 220 : 200, bh = this.portrait ? 56 : 46;
    var bx = (Wp - bw) / 2, by = my + mh - bh - 18;
    ctx.fillStyle = '#319795';
    rr(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (this.portrait ? 24 : 20) + 'px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('▶ 开始游戏', cx, by + (this.portrait ? 37 : 30));
  };

  global.LM_GAME = Game;
  global.LM_W = W; global.LM_H = H;
})(typeof window !== 'undefined' ? window : globalThis);
