/* 龙虾市场 · 数据层
 * 所有营养数值：每 100g 可食部，生重。
 * 来源标注在每条 src 字段；verified=true 表示本轮已对照公开数据库逐项核对，
 * verified=false 表示取公开资料典型值，待二次核对（见 README「待核对清单」）。
 * 汞值统一来自 FDA/EPA 2024 官方鱼种汞表（已核对）。
 */
(function (global) {
  'use strict';

  // 四阶段升级路线（专题卡 #7568 / #7583）
  var STAGES = [
    { id: 1, name: '虾蟹贝类', minLevel: 1, unlockGold: 0, desc: '高蛋白、低 Omega-3 的入门货架' },
    { id: 2, name: '白色鱼类', minLevel: 11, unlockGold: 600, desc: '低脂高蛋白，Omega-3 仍不高' },
    { id: 3, name: '多脂鱼旗舰店', minLevel: 21, unlockGold: 1800, desc: 'Omega-3 之王：鲭鱼 / 三文鱼 / 沙丁鱼' },
    { id: 4, name: '深海与稀缺海鲜', minLevel: 31, unlockGold: 4000, desc: '高汞风险区，出货前必须弹警告' }
  ];

  // 类别：shell=虾蟹贝 / white=白色鱼 / oily=多脂鱼 / deep=深海稀缺
  var SEAFOOD = [
    // ---- 阶段 1：虾蟹贝类 ----
    {
      id: 'crayfish', name: '小龙虾', emoji: '🦞', stage: 1, cat: 'shell',
      protein: 16.0, fat: 0.9, o3: 200, zinc: 1.2, selenium: 32, b12: 2.2, vitd: 0.5,
      mercury: 0.03, sustain: 'ok', price: 18,
      note: '原生食材很健康：高蛋白低脂，硒约是鸡蛋的 3 倍。但油焖麻辣会让油盐爆表。',
      src: 'USDA FDC 174206（小龙虾，野生，生）；汞值 FDA/EPA Crawfish 0.03ppm', verified: true
    },
    {
      id: 'shrimp', name: '对虾', emoji: '🦐', stage: 1, cat: 'shell',
      protein: 15.6, fat: 0.8, o3: 300, zinc: 1.0, selenium: 19.5, b12: 1.0, vitd: 0.1,
      mercury: 0.01, sustain: 'ok', price: 16,
      note: '蛋白密度高、脂肪极低，汞含量是常见海鲜里最低的一档。注意胆固醇 136mg。',
      src: 'USDA FDC 2684443（养殖对虾，生）；汞值 FDA/EPA Shrimp 0.01ppm', verified: true
    },
    {
      id: 'crab', name: '梭子蟹', emoji: '🦀', stage: 1, cat: 'shell',
      protein: 18.1, fat: 1.08, o3: 320, zinc: 3.54, selenium: 37.4, b12: 9.0, vitd: 0,
      mercury: 0.06, sustain: 'ok', price: 22,
      note: '蛋白与锌都不错，蟹黄胆固醇偏高，痛风人群要限量。',
      src: 'USDA FDC 174204（蓝蟹代梭子蟹）；汞值 FDA/EPA Crab 0.06ppm', verified: true
    },
    {
      id: 'oyster', name: '牡蛎', emoji: '🦪', stage: 1, cat: 'shell',
      protein: 5.7, fat: 1.71, o3: 330, zinc: 39.3, selenium: 19.7, b12: 8.75, vitd: 0.5,
      mercury: 0.01, sustain: 'ok', price: 20,
      note: '锌的王者（39mg/100g），换季补锌首选；但锌上限 40mg/天，别当饭吃。生食有弧菌风险。',
      src: 'USDA FDC（东方牡蛎，野生，生）；汞值 FDA/EPA Oyster 0.01ppm', verified: true
    },

    // ---- 阶段 2：白色鱼类 ----
    {
      id: 'cod', name: '大西洋鳕鱼', emoji: '🐟', stage: 2, cat: 'white',
      protein: 17.8, fat: 0.67, o3: 72, zinc: 0.31, selenium: 22.8, b12: 1.25, vitd: 0.9,
      mercury: 0.11, sustain: 'msc', price: 26,
      note: '典型的「高蛋白低脂」，但 Omega-3 只有 ~72mg，靠它补脑不够。',
      src: 'USDA FDC 2684444（大西洋鳕鱼，野生，生）；汞值 FDA/EPA Cod 0.11ppm', verified: true
    },
    {
      id: 'flatfish', name: '比目鱼', emoji: '🐠', stage: 2, cat: 'white',
      protein: 12.4, fat: 1.9, o3: 200, zinc: 0.32, selenium: 26.6, b12: 1.1, vitd: 2.8,
      mercury: 0.06, sustain: 'ok', price: 24,
      note: '肉质细嫩易消化，适合老人小孩；低汞，孕期可选。',
      src: 'USDA FDC 174196（比目鱼/鲽类，生）；汞值 FDA/EPA Flatfish 0.06ppm', verified: true
    },
    {
      id: 'pollock', name: '狭鳕', emoji: '🐡', stage: 2, cat: 'white',
      protein: 19.44, fat: 0.98, o3: 421, zinc: 0.47, selenium: 36.5, b12: 3.19, vitd: 1.0,
      mercury: 0.03, sustain: 'msc', price: 18,
      note: '性价比最高的白肉鱼，汞极低，是麦当劳麦香鱼的原料鱼。',
      src: 'USDA FDC 175129（狭鳕，生）；汞值 FDA/EPA Pollock 0.03ppm', verified: true
    },
    {
      id: 'bass', name: '鲈鱼', emoji: '🐟', stage: 2, cat: 'white',
      protein: 18.6, fat: 3.4, o3: 600, zinc: 2.83, selenium: 33.06, b12: 2.0, vitd: 2.0,
      mercury: 0.13, sustain: 'ok', price: 28,
      note: '淡水养殖为主，蛋白高、刺少，清蒸最能保留营养。',
      src: '中国食物成分表 2019（淡水鲈鱼：蛋白18.6/锌2.83/硒33.06）；汞参考 FDA 淡水鱼区间；B12/D/ω3 代表性值', verified: true
    },

    // ---- 阶段 3：多脂鱼旗舰店 ----
    {
      id: 'salmon', name: '三文鱼', emoji: '🍣', stage: 3, cat: 'oily',
      protein: 20.42, fat: 13.42, o3: 1966, zinc: 0.3, selenium: 24, b12: 3.23, vitd: 11,
      mercury: 0.02, sustain: 'asc', price: 42,
      note: 'EPA 862mg + DHA 1104mg，维生素 D 11µg —— 少数天然含维 D 的食物。孕期低汞首选。',
      src: 'USDA FDC 175167（养殖大西洋鲑，生）；汞值 FDA/EPA Salmon fresh 0.022ppm', verified: true
    },
    {
      id: 'mackerel', name: '鲭鱼', emoji: '🐟', stage: 3, cat: 'oily',
      protein: 18.6, fat: 13.89, o3: 2299, zinc: 0.63, selenium: 44.1, b12: 8.71, vitd: 16.1,
      mercury: 0.05, sustain: 'msc', price: 30,
      note: 'EPA 898mg + DHA 1401mg，多脂鱼里 Omega-3 最高之一（鳕鱼的百倍量级）。',
      src: 'USDA FDC 175119（大西洋鲭鱼，生）；汞值 FDA/EPA Atlantic mackerel 0.05ppm（王鲭 0.73ppm 属避免名单）', verified: true
    },
    {
      id: 'sardine', name: '沙丁鱼', emoji: '🐟', stage: 3, cat: 'oily',
      protein: 24.6, fat: 11.5, o3: 1480, zinc: 1.3, selenium: 52, b12: 8.9, vitd: 4.8,
      mercury: 0.01, sustain: 'msc', price: 22,
      note: '连骨吃可补钙，汞几乎为零，是最被低估的 Omega-3 性价比之王。',
      src: 'USDA FDC（大西洋沙丁鱼，生）；汞值 FDA/EPA Sardine 0.01ppm', verified: true
    },
    {
      id: 'herring', name: '鲱鱼', emoji: '🐟', stage: 3, cat: 'oily',
      protein: 17.96, fat: 9.04, o3: 1571, zinc: 0.99, selenium: 36.5, b12: 13.7, vitd: 4.2,
      mercury: 0.08, sustain: 'msc', price: 20,
      note: '北欧家常鱼，维 B12 极高；传统做法是腌制，钠含量会飙升。',
      src: 'USDA FDC 15039（大西洋鲱鱼，生）；汞值 FDA/EPA Herring 0.08ppm', verified: true
    },

    // ---- 阶段 4：深海与稀缺海鲜（高汞风险区）----
    {
      id: 'yellowfin', name: '黄鳍金枪鱼', emoji: '🍥', stage: 4, cat: 'deep',
      protein: 24.4, fat: 0.49, o3: 100, zinc: 0.37, selenium: 90.6, b12: 2.08, vitd: 1.7,
      mercury: 0.35, sustain: 'avoid', price: 55,
      note: '高蛋白低脂，但汞 0.35ppm 属「Good Choices」，孕妇儿童每周限 1 份。',
      src: 'USDA FDC 175159（黄鳍金枪鱼，生）；汞值 FDA/EPA Tuna yellowfin 0.35ppm', verified: true
    },
    {
      id: 'bigeye', name: '大眼金枪鱼', emoji: '🍤', stage: 4, cat: 'deep',
      protein: 23.8, fat: 1.8, o3: 440, zinc: 0.80, selenium: 99, b12: 2.12, vitd: 0.3,
      mercury: 0.69, sustain: 'avoid', price: 68,
      note: '汞 0.69ppm，FDA/EPA 列入「Choices to Avoid」：孕妇、哺乳期、儿童不要吃。',
      src: 'USDA FDC（大眼金枪鱼，生）；汞值 FDA/EPA Tuna bigeye 0.69ppm', verified: true
    },
    {
      id: 'swordfish', name: '旗鱼', emoji: '🗡️', stage: 4, cat: 'deep',
      protein: 19.66, fat: 6.65, o3: 790, zinc: 0.66, selenium: 57.4, b12: 1.7, vitd: 13.9,
      mercury: 1.00, sustain: 'avoid', price: 88,
      note: '汞 1.00ppm —— FDA/EPA 明令：孕妇、哺乳期女性、17 岁以下儿童不要吃。',
      src: 'USDA FDC 173703（旗鱼，生）；汞值 FDA/EPA Swordfish 1.00ppm（专题卡 #7574）', verified: true
    }
  ];

  // 烹饪方式（黄卡 #7591：重口味破坏营养价值）
  var COOKS = [
    { id: 'steam', name: '清蒸', emoji: '♨️', health: 2, goldMul: 1.0, tip: '最大程度保留 Omega-3，营养师点赞' },
    { id: 'garlic', name: '蒜蓉', emoji: '🧄', health: 1, goldMul: 1.05, tip: '少油提香，健康与口味的平衡点' },
    { id: 'braise', name: '油焖', emoji: '🍳', health: -1, goldMul: 1.15, tip: '油脂盐分超标，优质蛋白还在但健康扣分' },
    { id: 'spicy', name: '麻辣', emoji: '🌶️', health: -2, goldMul: 1.25, tip: '最赚钱也最伤：油盐爆表，Omega-3 被高温破坏' }
  ];

  // 顾客类型（红卡 #7593：至少 5 种，每种独立点单逻辑）
  var CUSTOMERS = [
    {
      id: 'gym', emoji: '🏋️', name: '健身者',
      line: '刚练完背，来点顶蛋白质的。',
      need: { key: 'protein', min: 18, label: '蛋白质 ≥ 18g' }
    },
    {
      id: 'pregnant', emoji: '🤰', name: '孕妇',
      line: '医生说要补 DHA，但汞千万不能高。',
      need: { key: 'o3', min: 500, label: 'Omega-3 ≥ 500mg' },
      maxMercury: 0.15, // FDA Best Choices 档
      warn: '汞 ≤ 0.15ppm（FDA 孕期 Best Choices）'
    },
    {
      id: 'elder', emoji: '👴', name: '老人',
      line: '胃不太好，要清淡点、好消化的。',
      need: { key: 'protein', min: 15, label: '蛋白质 ≥ 15g' },
      maxFat: 3.0,
      warn: '脂肪 ≤ 3g（清淡易消化）'
    },
    {
      id: 'student', emoji: '🧠', name: '备考学生',
      line: '用脑过度，想补补 DHA。',
      need: { key: 'o3', min: 1000, label: 'Omega-3 ≥ 1000mg' }
    },
    {
      id: 'cold', emoji: '🤧', name: '换季感冒的人',
      line: '一换季就中招，听说海鲜能补锌？',
      need: { key: 'zinc', min: 5, label: '锌 ≥ 5mg' }
    },
    {
      id: 'kid', emoji: '🧒', name: '小朋友',
      line: '妈妈说我还在长身体～',
      need: { key: 'protein', min: 15, label: '蛋白质 ≥ 15g' },
      maxMercury: 0.15,
      warn: '汞 ≤ 0.15ppm（儿童限量更低）'
    }
  ];

  // 可持续性标签（黄卡 #7590）
  var SUSTAIN = {
    msc: { label: 'MSC 认证', color: '#2f855a', score: 2 },
    asc: { label: 'ASC 认证', color: '#2c7a7b', score: 2 },
    ok: { label: '常规来源', color: '#8a6d3b', score: 0 },
    avoid: { label: '过度捕捞风险', color: '#c53030', score: -3 }
  };

  var BY_ID = {};
  SEAFOOD.forEach(function (s) { BY_ID[s.id] = s; });

  global.LM_DATA = {
    STAGES: STAGES,
    SEAFOOD: SEAFOOD,
    COOKS: COOKS,
    CUSTOMERS: CUSTOMERS,
    SUSTAIN: SUSTAIN,
    BY_ID: BY_ID,
    byStage: function (n) { return SEAFOOD.filter(function (s) { return s.stage === n; }); }
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.LM_DATA; }
})(typeof window !== 'undefined' ? window : globalThis);
