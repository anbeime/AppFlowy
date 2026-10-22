/* 龙虾市场 · 营养图鉴（雷达图 + 营养师点评 + 汞条 + 来源） */
(function (global) {
  'use strict';

  var D = global.LM_DATA;
  // 阶段代表图标（与 game.js 保持一致口径，图鉴去文字化）
  var STAGE_EMOJI = { 1: '🦐', 2: '🐟', 3: '🍣', 4: '🗡️' };

  // 五维上限（用于归一化雷达图）
  var AXES = [
    { key: 'protein', label: '蛋白质', max: 30, unit: 'g' },
    { key: 'o3', label: 'Omega-3', max: 3500, unit: 'mg' },
    { key: 'zinc', label: '锌', max: 40, unit: 'mg' },
    { key: 'selenium', label: '硒', max: 60, unit: 'µg' },
    { key: 'b12', label: '维生素B12', max: 12, unit: 'µg' }
  ];

  function norm(v, max) { return Math.max(0, Math.min(1, v / max)); }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawRadar(ctx, cx, cy, r, item) {
    var n = AXES.length;
    // 底盘
    ctx.strokeStyle = '#cbd5e0'; ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + i * 2 * Math.PI / n;
        var x = cx + Math.cos(a) * r * k, y = cy + Math.sin(a) * r * k;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
    });
    // 轴线
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    // 数据
    ctx.beginPath();
    for (var j = 0; j < n; j++) {
      var ang = -Math.PI / 2 + j * 2 * Math.PI / n;
      var v = norm(item[AXES[j].key], AXES[j].max);
      var x = cx + Math.cos(ang) * r * v, y = cy + Math.sin(ang) * r * v;
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(49,151,149,0.35)';
    ctx.fill();
    ctx.strokeStyle = '#319795'; ctx.lineWidth = 2; ctx.stroke();
    // 标签
    ctx.font = '13px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2d3748';
    for (var k2 = 0; k2 < n; k2++) {
      var an = -Math.PI / 2 + k2 * 2 * Math.PI / n;
      var lx = cx + Math.cos(an) * (r + 26), ly = cy + Math.sin(an) * (r + 22);
      ctx.textAlign = 'center';
      ctx.fillText(AXES[k2].label, lx, ly);
      ctx.fillStyle = '#718096';
      ctx.fillText(item[AXES[k2].key] + AXES[k2].unit, lx, ly + 15);
      ctx.fillStyle = '#2d3748';
    }
  }

  function wrap(ctx, text, maxW) {
    var out = [], line = '';
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = text[i]; }
      else { line = test; }
    }
    if (line) out.push(line);
    return out;
  }

  /* 全屏图鉴面板（需求 §二.3：正面 Q 版插画 + 背面营养数据 · 卡片化收藏墙） */
  function draw(ctx, W, H, state) {
    ctx.fillStyle = 'rgba(247,250,252,0.97)';
    ctx.fillRect(0, 0, W, H);

    var total = D.SEAFOOD.length;
    var got = D.SEAFOOD.filter(function (s) { return state.dexUnlocked[s.id]; }).length;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#2c5282';
    ctx.font = 'bold 26px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('📖 图鉴', 40, 52);
    ctx.font = 'bold 16px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2f855a';
    ctx.fillText('📚 ' + got + '/' + total + ' 已收集', 168, 52);

    ctx.font = '14px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#718096';
    ctx.fillText('每100g可食部生重 · ←→切换 · T关闭', 40, 76);

    // 平衡总纲：避免滑向「恐吓式科普」
    ctx.fillStyle = '#2f855a';
    ctx.font = 'bold 15px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('💡 低汞鱼每周2-3份被FDA推荐，风险只在高汞鱼种', 40, 98);

    // 已获称号
    var earned = [];
    for (var t = 1; t <= 4; t++) { if (state.titles[t]) earned.push(state.titles[t]); }
    if (earned.length) {
      ctx.fillStyle = '#b7791f';
      ctx.font = '14px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText('🏅 已获称号：' + earned.join(' · '), 40, 122);
    }

    var idx = state.dexIndex;
    var item = D.SEAFOOD[idx];

    // ===== 左侧收藏卡列表（卡片化：大 emoji 插画 + 名字 + 阶段 + 收集印章）=====
    var lx = 40, ly = 150, rowH = 52, cardW = 250;
    D.SEAFOOD.forEach(function (s, i) {
      var unlocked = state.dexUnlocked[s.id];
      var y = ly + i * rowH;
      var isSel = i === idx;
      roundRect(ctx, lx, y, cardW, rowH - 8, 10);
      ctx.fillStyle = isSel ? '#e6fffa' : (unlocked ? '#ffffff' : '#f7fafc');
      ctx.fill();
      ctx.strokeStyle = isSel ? '#319795' : '#e2e8f0';
      ctx.lineWidth = isSel ? 2 : 1; ctx.stroke();
      // 大 emoji 插画缩略（正面）
      ctx.globalAlpha = unlocked ? 1 : 0.3;
      ctx.font = '30px system-ui, sans-serif';
      ctx.fillStyle = '#2d3748';
      ctx.fillText(unlocked ? s.emoji : '🔒', lx + 14, y + 32);
      ctx.globalAlpha = 1;
      // 名字
      ctx.font = (isSel ? 'bold ' : '') + '15px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = unlocked ? '#2d3748' : '#a0aec0';
      ctx.fillText(unlocked ? s.name : '？？？', lx + 56, y + 22);
      // 阶段角标
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = '#718096';
      ctx.fillText(unlocked ? (STAGE_EMOJI[s.stage] + ' Lv.' + s.stage) : '未解锁', lx + 56, y + 40);
      // 已收集印章
      if (unlocked) { ctx.fillStyle = '#38a169'; ctx.font = '13px system-ui, sans-serif'; ctx.fillText('✅', lx + cardW - 24, y + 32); }
    });

    // ===== 右侧详情面板 =====
    var px = 340, py = 110;
    var panelW = W - px - 40, panelH = H - py - 40;
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.stroke();

    if (!state.dexUnlocked[item.id]) {
      ctx.fillStyle = '#a0aec0';
      ctx.font = '20px system-ui, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('还没卖过这种海鲜，图鉴未解锁', px + panelW / 2, py + 200);
      return;
    }

    ctx.textAlign = 'left';

    // —— 正面：Q 版插画卡 ——
    var fx = px + 20, fy = py + 18, fw = panelW - 40, fh = 122;
    var grad = (ctx.createLinearGradient ? ctx.createLinearGradient(fx, fy, fx, fy + fh) : null);
    if (grad) { grad.addColorStop(0, '#fff7ed'); grad.addColorStop(1, '#e6fffa'); ctx.fillStyle = grad; }
    else ctx.fillStyle = '#fff7ed';
    roundRect(ctx, fx, fy, fw, fh, 14); ctx.fill();
    ctx.strokeStyle = '#fbd38d'; ctx.lineWidth = 1.5; ctx.stroke();
    // 大 emoji 插画
    ctx.font = '90px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.emoji, fx + 72, fy + 96);
    // 名字 + 阶段 + 价格
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2d3748';
    ctx.font = 'bold 28px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(item.name, fx + 140, fy + 50);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#718096';
    ctx.fillText(STAGE_EMOJI[item.stage] + ' Lv.' + item.stage + ' · 💰' + item.price, fx + 140, fy + 78);
    // 阶段角标徽章（右上）
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(STAGE_EMOJI[item.stage], fx + fw - 18, fy + 32);
    // 已收集印章（右下）
    ctx.font = '13px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#38a169';
    ctx.fillText('✅ 已收集', fx + fw - 18, fy + fh - 14);

    // —— 背面：营养数据 ——
    var by = fy + fh + 16;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2c5282';
    ctx.font = 'bold 16px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText('📋 营养数据（背面）', px + 20, by + 2);

    // 本阶段收集进度 + 奖励
    (function () {
      var stItems = D.byStage(item.stage);
      var c = stItems.filter(function (s) { return state.dexUnlocked[s.id]; }).length;
      var done = c === stItems.length;
      var bonus = state.stageBonus[item.stage] ? ' · 已集齐，收入 +' + Math.round(state.stageBonus[item.stage] * 100) + '%' : '';
      ctx.fillStyle = done ? '#2f855a' : '#718096';
      ctx.font = '13px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText('📚 ' + c + '/' + stItems.length + (done ? ' ✅+收入加成' : '（集齐得称号）') + bonus, px + 20, by + 26);
    })();

    var dataY = by + 48;
    drawRadar(ctx, px + 175, dataY + 95, 92, item);

    // 汞条
    var mx = px + 360, my = dataY;
    ctx.font = 'bold 15px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2d3748';
    ctx.fillText('☢️ 汞 ' + item.mercury + ' ppm', mx, my);
    var barW = 240, ratio = Math.min(1, item.mercury / 1.0);
    ctx.fillStyle = '#edf2f7'; roundRect(ctx, mx, my + 12, barW, 14, 7); ctx.fill();
    var col = item.mercury >= 0.5 ? '#c53030' : (item.mercury >= 0.3 ? '#dd6b20' : '#38a169');
    ctx.fillStyle = col; roundRect(ctx, mx, my + 12, Math.max(6, barW * ratio), 14, 7); ctx.fill();
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = col;
    ctx.fillText(mercuryVerdict(item.mercury), mx, my + 46);

    // 可持续性
    var su = D.SUSTAIN[item.sustain];
    ctx.font = 'bold 14px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = su.color;
    ctx.fillText(SUSTAIN_ICON_PLACEHOLDER(su) + su.label, mx, my + 78);

    // 营养师点评 + 来源
    ctx.font = '15px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#2d3748';
    var lines = wrap(ctx, '💬 ' + item.note, panelW - 40);
    var noteY = dataY + 230;
    lines.forEach(function (l, i) { ctx.fillText(l, px + 20, noteY + i * 24); });
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#718096';
    ctx.fillText('来源：' + item.src + (item.verified ? '' : '（营养值待二次核对）'), px + 20, noteY + lines.length * 24 + 22);
  }

  function SUSTAIN_ICON_PLACEHOLDER(su) {
    if (su.score > 0) return '🏅 ';
    if (su.score < 0) return '🚫 ';
    return '🐟 ';
  }

  function mercuryVerdict(m) {
    if (m >= 0.5) return 'FDA/EPA：应避免（孕妇、哺乳期、儿童不要吃）';
    if (m >= 0.3) return 'FDA/EPA：Good Choices，每周限 1 份';
    return 'FDA/EPA：Best Choices，2-3 份/周';
  }

  global.LM_DEX = { draw: draw, AXES: AXES, drawRadar: drawRadar, mercuryVerdict: mercuryVerdict };
})(typeof window !== 'undefined' ? window : globalThis);
