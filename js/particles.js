/* 龙虾市场 · 粒子（金币飞溅 / 评价文字上浮） */
(function (global) {
  'use strict';

  function Particles() { this.list = []; }

  Particles.prototype.burst = function (x, y, text, color, count) {
    count = count || 10;
    for (var i = 0; i < count; i++) {
      this.list.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 260,
        vy: -120 - Math.random() * 200,
        life: 0.8 + Math.random() * 0.4,
        age: 0,
        r: 3 + Math.random() * 4,
        color: color || '#f6c453',
        dot: true
      });
    }
    if (text) {
      this.list.push({ x: x, y: y - 10, vx: 0, vy: -46, life: 1.1, age: 0, text: text, color: color || '#2d3748' });
    }
  };

  Particles.prototype.update = function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.age += dt;
      if (p.dot) {
        p.vy += 520 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      } else {
        p.y += p.vy * dt; p.vy *= 0.94;
      }
      if (p.age >= p.life) { this.list.splice(i, 1); }
    }
  };

  Particles.prototype.draw = function (ctx) {
    this.list.forEach(function (p) {
      var a = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, a);
      if (p.dot) {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.font = 'bold 22px system-ui, "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      }
    });
    ctx.globalAlpha = 1;
  };

  global.LM_PARTICLES = Particles;
})(typeof window !== 'undefined' ? window : globalThis);
