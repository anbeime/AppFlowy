/* 龙虾市场 · 触屏适配（单一可测模块）
 * 纯函数 isTouchEnv / toCanvas 可在 Node 下直接单测；init 只在浏览器里跑，
 * 把 index.html 的真实结构（#touchbar[data-act] + canvas 指针事件）接到 Game 上。
 */
(function (global) {
  'use strict';

  /* 判断是否触屏环境（传入 env 便于单测，默认取 global） */
  function isTouchEnv(env) {
    env = env || global;
    return !!(env.ontouchstart !== undefined || (env.maxTouchPoints || 0) > 0);
  }

  /* 把客户端坐标换算成 canvas 内部坐标（canvas 经 CSS 缩放过） */
  function toCanvas(rect, clientX, clientY, canvasW, canvasH) {
    if (!rect || !rect.width || !rect.height) { return { x: -1, y: -1 }; }
    return {
      x: (clientX - rect.left) * (canvasW / rect.width),
      y: (clientY - rect.top) * (canvasH / rect.height)
    };
  }

  /* 浏览器里绑定：指针事件（鼠标/触屏/手写笔统一，无 300ms 延迟）+ 虚拟按键 */
  function init(game, canvas, doc) {
    doc = doc || global.document;
    if (!doc || !canvas || !game) return false;

    // 触屏环境显示虚拟按键条（桌面端默认隐藏）
    if (isTouchEnv(global)) {
      var tb = doc.getElementById('touchbar');
      if (tb) tb.classList.remove('hidden');
    }

    // 画布指针事件 → 屏幕坐标换算（映射回当前设计坐标 W×H）→ 命中测试
    function handle(e) {
      var r = canvas.getBoundingClientRect();
      var p = toCanvas(r, e.clientX, e.clientY, game.W || 1280, game.H || 720);
      game.onClick(p.x, p.y);
    }
    if (global.PointerEvent) {
      canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); handle(e); });
    } else {
      canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var t = e.changedTouches && e.changedTouches[0];
        if (t) handle(t);
      }, { passive: false });
      canvas.addEventListener('mousedown', handle);
    }
    // 关掉长按菜单 / 双击缩放
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // 虚拟按键：事件委托到 #touchbar 的 data-act
    var bar = doc.getElementById('touchbar');
    if (bar) {
      bar.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('button[data-act]');
        if (!btn) return;
        e.preventDefault();
        game.tapButton(btn.getAttribute('data-act'));
      });
    }

    // 键盘（桌面端保留；触屏无键盘也不影响）
    doc.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      game.onKey(e);
    });
    return true;
  }

  global.LM_TOUCH = { isTouchEnv: isTouchEnv, toCanvas: toCanvas, init: init };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.LM_TOUCH; }
})(typeof window !== 'undefined' ? window : globalThis);
