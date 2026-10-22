/* 龙虾市场 · 音效（WebAudio，零依赖，无音频文件） */
(function (global) {
  'use strict';
  var ctx = null, enabled = true;

  function ensure() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { enabled = false; return null; }
      ctx = new AC();
    }
    if (ctx.state === 'suspended') { ctx.resume(); }
    return ctx;
  }

  /* 用 WebAudio 时钟调度，不用 setTimeout：
   * 1) 采样级精确；2) 在无定时器宿主（Node 沙箱）里也不会抛错。 */
  function tone(freq, dur, type, gain, delay) {
    if (!enabled) return;
    var c = ensure(); if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  var SFX = {
    click: function () { tone(520, 0.08, 'triangle', 0.05); },
    coin: function () { tone(880, 0.12, 'square', 0.06); tone(1180, 0.12, 'square', 0.05, 0.07); },
    good: function () { tone(660, 0.1, 'sine', 0.07); tone(880, 0.16, 'sine', 0.07, 0.09); },
    bad: function () { tone(180, 0.28, 'sawtooth', 0.06); },
    unlock: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.06, i * 0.09); }); },
    warn: function () { tone(320, 0.18, 'square', 0.05); tone(240, 0.22, 'square', 0.05, 0.16); }
  };

  global.LM_AUDIO = {
    sfx: SFX,
    toggle: function () { enabled = !enabled; return enabled; },
    isOn: function () { return enabled; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
