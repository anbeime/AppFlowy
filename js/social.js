/* 龙虾市场 · 客户端增强（v2.0：战绩面板 + 分享卡片）
 * 纯前端，零后端、零依赖。直接读 localStorage 存档与实时游戏状态，
 * 不改动 game.js 任何逻辑。用于满足「完成度/体验」并直接支撑社媒加分。 */
(function (global) {
  'use strict';

  var SAVE_KEY = 'lobster_market_save_v1';

  function readStats() {
    var g = global.__lmGame;
    var live = g && g.state ? g.state : null;
    var out = {
      served: 0, perfect: 0, day: 1, rep: 50,
      sustainSold: 0, dexCount: 0, dexTotal: 15, hasLive: !!live, hasSave: false
    };
    if (global.LM_DATA && global.LM_DATA.SEAFOOD) out.dexTotal = global.LM_DATA.SEAFOOD.length;

    if (live) {
      out.served = live.served || 0;
      out.perfect = live.perfect || 0;
      out.day = live.day || 1;
      out.rep = live.rep != null ? live.rep : 50;
      out.sustainSold = live.sustainSold || 0;
      out.dexCount = live.dexUnlocked ? Object.keys(live.dexUnlocked).length : 0;
      return out;
    }
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return out;
      var d = JSON.parse(raw);
      out.hasSave = true;
      out.served = d.served || 0;
      out.perfect = d.perfect || 0;
      out.day = d.day || 1;
      out.rep = d.rep != null ? d.rep : 50;
      out.sustainSold = d.sustainSold || 0;
      out.dexCount = d.dexUnlocked ? Object.keys(d.dexUnlocked).length : 0;
    } catch (e) { /* 忽略坏档 */ }
    return out;
  }

  function toast(msg) {
    var t = document.getElementById('lm-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'lm-toast';
      t.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:1001;max-width:86%;padding:11px 16px;background:rgba(8,12,20,.94);color:#e8eefc;border:1px solid #2a3a55;border-radius:10px;font:14px system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.5)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.style.display = 'none'; }, 2600);
  }

  // ---------- 战绩面板 ----------
  function openStats() {
    var s = readStats();
    var el = document.getElementById('stats-body');
    if (el) {
      var rows = [
        ['🧾 累计服务顾客', s.served + ' 位'],
        ['✨ 完美服务', s.perfect + ' 次'],
        ['📅 经营天数', s.day + ' 天'],
        ['🐟 解锁海鲜图鉴', s.dexCount + ' / ' + s.dexTotal + ' 种'],
        ['🌱 可持续销量', s.sustainSold + ' 份'],
        ['⭐ 店铺声望', s.rep]
      ];
      el.innerHTML = rows.map(function (r) {
        return '<div class="stat-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
      }).join('');
      if (!s.hasLive && !s.hasSave) {
        el.innerHTML = '<p class="stat-empty">还没有战绩，先去🦞经营一局吧！</p>';
      }
    }
    var ov = document.getElementById('stats-overlay');
    if (ov) ov.style.display = 'flex';
  }
  function closeStats() {
    var ov = document.getElementById('stats-overlay');
    if (ov) ov.style.display = 'none';
  }

  // ---------- 分享卡片（离屏 canvas） ----------
  function buildCard(s) {
    var W = 1080, H = 1350;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');

    var grad = x.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0b1830');
    grad.addColorStop(1, '#06101f');
    x.fillStyle = grad; x.fillRect(0, 0, W, H);

    x.textAlign = 'center';
    x.fillStyle = '#ffd166';
    x.font = '700 88px sans-serif';
    x.fillText('🦞 龙虾市场', W / 2, 180);

    x.fillStyle = '#7fd1ff';
    x.font = '34px sans-serif';
    x.fillText('把 FDA / EPA 营养科普玩进脑子', W / 2, 240);

    x.fillStyle = '#9fb3d1';
    x.font = '26px sans-serif';
    x.fillText('海鲜经营玩法 × 真实营养学教育', W / 2, 286);

    // 数据面板
    var items = [
      ['🧾 服务顾客', s.served + ''],
      ['✨ 完美服务', s.perfect + ''],
      ['📅 经营天数', s.day + ''],
      ['🐟 解锁图鉴', s.dexCount + '/' + s.dexTotal],
      ['🌱 可持续销量', s.sustainSold + ''],
      ['⭐ 店铺声望', s.rep + '']
    ];
    var cardX = 90, cardY = 360, cardW = 900, cardH = 660, gap = 30;
    var colW = (cardW - gap) / 2, rowH = (cardH - gap * 2) / 3;
    x.fillStyle = 'rgba(255,255,255,.04)';
    x.strokeStyle = '#2a3a55';
    x.lineWidth = 2;
    roundRect(x, cardX, cardY, cardW, cardH, 24); x.fill(); x.stroke();

    for (var i = 0; i < items.length; i++) {
      var cx = cardX + (i % 2) * (colW + gap) + 40;
      var cy = cardY + Math.floor(i / 2) * (rowH + gap) + 50;
      x.textAlign = 'left';
      x.fillStyle = '#9fb3d1';
      x.font = '30px sans-serif';
      x.fillText(items[i][0], cx, cy);
      x.fillStyle = '#e8eefc';
      x.font = '700 64px sans-serif';
      x.fillText(items[i][1], cx, cy + 78);
    }

    x.textAlign = 'center';
    x.fillStyle = '#ffd166';
    x.font = '700 34px sans-serif';
    x.fillText('WorkBuddy 1024 造物挑战', W / 2, 1110);

    x.fillStyle = '#7fd1ff';
    x.font = '30px sans-serif';
    x.fillText('#WorkBuddy  #1024程序员节', W / 2, 1160);

    x.fillStyle = '#6079a0';
    x.font = '24px sans-serif';
    x.fillText('扫码/搜索「龙虾市场」即可在线体验', W / 2, 1216);

    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shareResult() {
    var s = readStats();
    var canvas = buildCard(s);
    try {
      canvas.toBlob(function (blob) {
        if (!blob) { fallbackDownload(canvas); return; }
        var file = new File([blob], 'lobster-result.png', { type: 'image/png' });
        var text = '我用🦞龙虾市场把 FDA/EPA 营养科普玩进脑子了！海鲜经营×真实营养学，边玩边学～ #WorkBuddy #1024程序员节';
        var url = location.href;
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: text, title: '🦞 龙虾市场战绩', url: url })
            .then(function () { toast('已唤起分享，去小红书/视频号发帖带双话题即可加分'); })
            .catch(function () { fallbackDownload(canvas); });
        } else {
          fallbackDownload(canvas);
        }
      }, 'image/png');
    } catch (e) {
      fallbackDownload(canvas);
    }
  }

  function fallbackDownload(canvas) {
    try {
      var a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'lobster-result.png';
      a.click();
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          toast('战绩图已下载，体验链接已复制，去社媒发帖带 #WorkBuddy #1024程序员节 即可加分');
        }).catch(function () { toast('战绩图已下载，复制链接去社媒发布即可加分'); });
      } else {
        toast('战绩图已下载，复制链接去社媒发布即可加分');
      }
    } catch (e) {
      toast('分享不可用，请手动截图发布');
    }
  }

  global.LM_SOCIAL = {
    openStats: openStats,
    closeStats: closeStats,
    shareResult: shareResult,
    toast: toast
  };
})(typeof window !== 'undefined' ? window : globalThis);
