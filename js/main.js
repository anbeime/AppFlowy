/* 龙虾市场 · 启动（v1.2：触屏/键盘统一走 LM_TOUCH.init） */
(function (global) {
  'use strict';

  function boot() {
    var canvas = document.getElementById('game-canvas');
    var game = new global.LM_GAME(canvas);

    // 输入（指针 / 触屏 / 虚拟按键 / 键盘）统一交给 touch 模块
    global.LM_TOUCH.init(game, canvas);

    // 响应式：尺寸/旋转变化时重算画布缓冲区（DPR 感知，避免中文糊成「叠一起」）
    function onResize() {
      game.resize();
      var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      document.body.classList.toggle('is-touch', !!coarse);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    // 全屏切换后画布 CSS 尺寸变化，必须重算缓冲区（v1.11）
    document.addEventListener('fullscreenchange', onResize);
    onResize();

    var last = performance.now();
    function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      game.update(dt);
      game.draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    global.__lmGame = game; // 便于手动检查
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})(typeof window !== 'undefined' ? window : globalThis);
