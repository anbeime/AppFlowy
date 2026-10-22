/* 龙虾市场 · 顾客与结算逻辑（纯函数，可在 Node 下直接单测） */
(function (global) {
  'use strict';

  var D = global.LM_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  var COOKS = D.COOKS;

  function cookById(id) {
    for (var i = 0; i < COOKS.length; i++) { if (COOKS[i].id === id) return COOKS[i]; }
    return COOKS[0];
  }

  /* 判定一次成交。
   * 返回 {ok, reason[], gold, tip, health, sustainScore, grade}
   * grade: 'perfect' | 'pass' | 'violate'
   */
  function evaluate(customer, seafood, cookId) {
    var cook = cookById(cookId);
    var reasons = [];
    var need = customer.need;
    var val = seafood[need.key];

    var meetsNeed = val >= need.min;
    if (!meetsNeed) {
      reasons.push('需求不足：' + need.label + '，实际 ' + val + unitOf(need.key));
    } else {
      reasons.push('满足需求：' + need.label + '（实际 ' + val + unitOf(need.key) + '）');
    }

    var violate = false;
    if (customer.maxMercury != null && seafood.mercury > customer.maxMercury) {
      violate = true;
      reasons.push('⚠️ 汞超标：' + seafood.mercury + 'ppm > 上限 ' + customer.maxMercury +
        'ppm（FDA/EPA 建议）');
      // 平衡文案：只对真正高汞鱼种（≥0.5ppm）追加，避免滑向「恐吓式科普」
      if (seafood.mercury >= 0.5) {
        reasons.push('💡 平衡提示：低汞鱼（如三文鱼 / 对虾）每周 2-3 份仍被 FDA 推荐，' +
          'Omega-3 收益远大于低汞鱼风险；问题只在高汞鱼种本身。');
      }
    }
    if (customer.maxFat != null && seafood.fat > customer.maxFat) {
      violate = true;
      reasons.push('⚠️ 脂肪过高：' + seafood.fat + 'g > 上限 ' + customer.maxFat + 'g');
    }

    var base = seafood.price;
    var gold = 0, tip = 0, grade;
    if (violate) {
      grade = 'violate';
      gold = 0;
      reasons.push('顾客拒收，差评 -1 声望');
    } else if (meetsNeed) {
      grade = 'perfect';
      tip = Math.round(base * 0.5);
      gold = Math.round((base + tip) * cook.goldMul);
      reasons.push('小费 +' + tip + '（' + cook.name + ' ×' + cook.goldMul + '）');
    } else {
      grade = 'pass';
      gold = Math.round(base * 0.6 * cook.goldMul);
      reasons.push('勉强成交，收入打折（需求未满足）');
    }

    var sus = (D.SUSTAIN[seafood.sustain] || { score: 0 }).score;
    if (sus < 0) { reasons.push('🌊 过度捕捞风险：海洋守护者积分 ' + sus); }
    else if (sus > 0) { reasons.push('🌊 ' + D.SUSTAIN[seafood.sustain].label + '：海洋守护者积分 +' + sus); }

    return {
      ok: !violate,
      grade: grade,
      reasons: reasons,
      gold: gold,
      tip: tip,
      health: cook.health,
      sustainScore: sus,
      seafoodId: seafood.id,
      customerId: customer.id
    };
  }

  function unitOf(key) {
    if (key === 'protein' || key === 'fat') return 'g';
    if (key === 'o3' || key === 'zinc' || key === 'selenium') return 'mg';
    if (key === 'b12' || key === 'vitd') return 'µg';
    return '';
  }

  /* 市场星级：按需求文档 §三.3（专题卡 #7570 / #7585）
   * 1 星：只有虾蟹贝
   * 2 星：+ 白色鱼（任意 2 类）
   * 3 星：加入多脂鱼（有 oily 但无 shell）
   * 5 星：贝类 + 多脂鱼（shell && oily，需求「简化为只要有贝类和多脂鱼即可」）
   */
  function starRating(soldCats /* {shell:n,white:n,oily:n,deep:n} */, sustainSold /* {msc:n,asc:n} */) {
    var hasShell = (soldCats.shell || 0) > 0;
    var hasOily = (soldCats.oily || 0) > 0;
    if (hasShell && hasOily) return 5;   // 顶级：贝类 + 多脂鱼（简化去可持续门槛）
    if (hasOily) return 3;               // 加入多脂鱼 → 3 星
    var kinds = 0;
    ['shell', 'white', 'oily', 'deep'].forEach(function (k) { if (soldCats[k] > 0) kinds++; });
    return kinds >= 2 ? 2 : 1;           // 含白鱼 → 2 星；仅贝类 → 1 星
  }

  /* 阶段解锁：按金币门槛 */
  function unlockedStage(gold) {
    var s = 1;
    D.STAGES.forEach(function (st) { if (gold >= st.unlockGold) s = st.id; });
    return s;
  }

  function pickCustomer(rng) {
    rng = rng || Math.random;
    var list = D.CUSTOMERS;
    return list[Math.floor(rng() * list.length) % list.length];
  }

  /* 小费系数：回头客 +20%；情绪差（不耐烦/愤怒）打折。
   * 入参是 enriched 顾客对象（含 returning / mood 字段）。 */
  function tipMultiplier(cust) {
    var m = 1;
    if (cust && cust.returning) m *= 1.2;
    if (cust && cust.mood === 'angry') m *= 0.8;
    else if (cust && cust.mood === 'impatient') m *= 0.9;
    return m;
  }

  global.LM_LOGIC = {
    evaluate: evaluate,
    starRating: starRating,
    unlockedStage: unlockedStage,
    pickCustomer: pickCustomer,
    cookById: cookById,
    unitOf: unitOf,
    tipMultiplier: tipMultiplier
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.LM_LOGIC; }
})(typeof window !== 'undefined' ? window : globalThis);
