// 由 python3 tools/build.py 生成，不要直接改：改 cloudflare/worker.js 和 src/armory-core.js 再重新生成。
/**
 * 刃影 Cloudflare Worker：云端账号、存档同步、武库经济、反作弊
 *
 * 部署：wrangler.toml 的 main 是 worker.bundle.js，由 python3 tools/build.py 生成（本文件 + src/armory-core.js
 *       拼成一个文件，在 Cloudflare 网页编辑器里整段粘贴也能用）。要绑定 D1 数据库 DB，表会自动建好。
 * 环境变量（Workers → Settings → Variables，选 Secret；不设也能跑，只是用不了管理接口）：
 *   ADMIN_SECRET      管理接口口令：查流水、查处罚、解封（node tools/econ-admin.mjs）
 *
 * 防作弊（和钱有关的都在服务器上算，客户端只负责显示）：
 *   武库：开箱、终端机、买卖、汰换、掉落、补给、星章都在这里用服务器的随机数和时钟算；武器箱每周最多用墨锭买 5 个。
 *         存档带版本号，同时到的两个请求只有一个能改成（另一个重读再算，防双花）；每个请求带一次性编号，网络重试
 *         不会重复执行；挂单什么时候成交不告诉客户端（防撤单重挂刷成交）；对局奖励要开局领票、打够时间、每天有上限。
 *   墨锭：服务器记账。武库里赚的花的由服务器直接算；客户端本地赚的（打赢电脑、任务、关卡星）按条上报，
 *         每条带编号只记一次；每天先认 1500，每打完一局服务器认可的对局再多认 80，最多 6000；一次报几万的记进流水给管理员查。
 *   皮肤：武库专属的 29 款只认库存里真有的；卖掉之后，旧存档也覆盖不回来。没有充值，也没有别的货币。
 *   其他：每个账号、每个 IP 限速；登录失败太多次暂时锁定；注册带上来的存档墨锭有上限；被封期间不能写存档和交易。
 */
/* === src/armory-core.js === */
/* =====================================================================
   刃影武库 · 规则核心
   ---------------------------------------------------------------------
   浏览器（src/armory.js）和云端（cloudflare/worker.js）共用这一份规则：
   收藏品和武器箱、品质与概率、斩数、终端机、市场价格、汰换合同、对局掉落、每周补给、江湖行动。
   这里不碰页面，只改传进来的存档对象 s，所以同一份代码在服务器上跑出来的结果和本机一模一样。
   连上新版云端时，开箱、买卖、汰换都由服务器算（随机数也在服务器上取），本机只负责显示。
   所有数据表都冻结了，控制台改不动概率和价格。
   ===================================================================== */
(function (G) {
  'use strict';
  const C = {};
  C.VER = 2;                                   // 2：去掉磨损、图案模板、钥匙和玉珏，加终端机，六个武器箱
  C.DAY0 = 20748;                              // 北京时间 2026-10-22，第一个行动季第一天
  C.SEASON_DAYS = 32;
  C.INV_MAX = 300, C.LIST_MAX = 20, C.HIST_MAX = 40;
  C.FEE = 0.15;                                // 市场手续费
  // 买卖差价：在售的比市场价贵 2%~12%；直接卖出是卖给收购商，按市场价的 88% 收；自己挂单最高标到市场价的 95%。
  // 价格每天最多偏离 ±10%，所以哪天买、哪天卖都赚不到差价，汰换合同也换不出比材料更值钱的东西（见 tools/econ-test.mjs 的“套利”一节）
  C.ASK = [1.02, 1.12], C.BID = 0.88, C.LIST_MAX_R = 0.95;
  C.CASE_WEEK = 5;                             // 每周最多用墨锭买 5 个武器箱
  C.DROP_P = 0.15, C.DROP_CAP = 4, C.SUPPLY_GAMES = 5;
  C.MATCH_MIN_MS = 20000, C.MATCH_MAX_MS = 45 * 60000, C.MATCH_GAP_MS = 15000, C.MATCH_DAY_CAP = 60;
  C.KO_MAX = 12;                               // 一局最多记 12 斩（三人车轮战也够了）
  C.HERO_IDS = ['qingfeng', 'feiying', 'tieshan', 'lingshuang', 'liuyun', 'leiming', 'moyu', 'yuehua', 'yanling', 'yuxiao', 'zuixian', 'gouchen'];
  C.MODES = ['cpu', 'net', '2v2', 'tower', 'chaos', 'tag3', 'mayhem'];
  C.LEVELS = ['easy', 'normal', 'hard', 'impossible', 'god'];

  // 品质：颜色和名字照 CS 的五档
  C.TIERS = ['mil', 'res', 'cla', 'cov', 'gold'];
  C.TIER = {
    mil: { n: '军规级', c: '75,105,255' },
    res: { n: '受限', c: '136,71,255' },
    cla: { n: '保密', c: '211,44,230' },
    cov: { n: '隐秘', c: '235,75,75' },
    gold: { n: '★ 非凡', c: '228,174,57' },
  };
  C.ODDS = { mil: 0.7992, res: 0.1598, cla: 0.032, cov: 0.0064, gold: 0.0026 };
  C.ST_P = 0.2;                                // 开出斩数版（记击倒数）的概率
  C.BASE = { mil: 35, res: 160, cla: 650, cov: 2200, gold: 8800 };   // 参考价（墨锭）
  // 终端机（照 CS2）：开封后一次给你看一件、报一个价，买下就用掉；不要就换下一件，最多看 5 件，
  // 5 件都不要终端机也没了；开封 3 天不处理就作废。报价是当天市场价的 1~1.3 倍，所以买下来转手赚不到钱
  C.TERM = { offers: 5, days: 3, odds: { mil: 0.45, res: 0.3, cla: 0.15, cov: 0.08, gold: 0.02 }, markup: [1, 1.3] };

  // 新涂装：只换配色的军规级饰品 [皮肤 key, 侠客, 名字, 配色]
  C.PAINTS = [
    ['qf_p1', 'qingfeng', '竹影', { body: '#e4efe2', shade: '#87a58a', scarf: '#3d8f5a', slash: '120,210,150', blade: '#effff2' }],
    ['ts_p1', 'tieshan', '锈蚀', { body: '#7a5544', shade: '#4a3024', scarf: '#c46a2a', slash: '230,140,80', blade: '#e8d6c6' }],
    ['lm_p1', 'leiming', '夜雨', { body: '#232c3a', shade: '#141a24', scarf: '#4aa8ff', slash: '120,190,255', blade: '#e6f2ff', outline: '#6ab8ff' }],
    ['fy_p1', 'feiying', '沙暴', { body: '#b89a6a', shade: '#7a6040', scarf: '#e0b050', slash: '240,200,120', blade: '#fff2d8', outline: '#3a2810' }],
    ['ly_p1', 'liuyun', '胭脂', { body: '#f6e6ea', shade: '#c49aa4', scarf: '#d84a6a', slash: '255,140,170', blade: '#fff0f4' }],
    ['ls_p1', 'lingshuang', '墨梅', { body: '#2a2a33', shade: '#16161c', scarf: '#c83a5a', slash: '230,90,120', blade: '#ffe6ee', outline: '#d8c8cc' }],
    ['yh_p1', 'yuehua', '碧潮', { body: '#e2f4f2', shade: '#86b8b4', scarf: '#2fb8a8', slash: '110,230,210', blade: '#eafffb' }],
    ['my_p1', 'moyu', '月白', { body: '#ecebe6', shade: '#a6a49a', scarf: '#8a8a96', slash: '230,230,240', blade: '#3a3a44', outline: '#1a1a22', outlineA: 1 }],
    ['yl_p1', 'yanling', '赤霞', { body: '#f8e8e0', shade: '#c8988a', scarf: '#e0502a', slash: '255,140,100', blade: '#fff0e8' }],
    ['gc_p1', 'gouchen', '苔痕', { body: '#3a4436', shade: '#222a20', scarf: '#8ab04a', slash: '180,220,120', blade: '#eef4e0', outline: '#c8d8a0' }],
    ['yx_p1', 'yuxiao', '紫檀', { body: '#ece4f2', shade: '#a594b8', scarf: '#8a5ac8', slash: '190,150,255', blade: '#b89ae0' }],
    ['zx_p1', 'zuixian', '松烟', { body: '#a8a49c', shade: '#6a665e', scarf: '#3a3a40', slash: '200,200,210', blade: '#e8e4dc' }],
    ['qf_p2', 'qingfeng', '赤练', { body: '#f4ecea', shade: '#b89a96', scarf: '#d8322a', slash: '255,110,100', blade: '#fff4f2' }],
    ['ts_p2', 'tieshan', '冰川', { body: '#c8d8e4', shade: '#8aa0b4', scarf: '#5ab4e8', slash: '150,210,255', blade: '#f0f8ff' }],
    ['ls_p2', 'lingshuang', '琥珀', { body: '#f4e6cc', shade: '#c4a274', scarf: '#e09a2a', slash: '255,200,110', blade: '#fff6e0' }],
    ['lm_p2', 'leiming', '霓虹', { body: '#2a1a30', shade: '#160c1a', scarf: '#ff4ad8', slash: '255,110,230', blade: '#ffe6fa', outline: '#ff6ae0' }],
    ['fy_p2', 'feiying', '夜航', { body: '#1e2638', shade: '#0e1420', scarf: '#3a6aff', slash: '110,150,255', blade: '#e0e8ff', outline: '#5a8aff' }],
    ['ly_p2', 'liuyun', '苍山', { body: '#d4dad8', shade: '#8a9894', scarf: '#4a6a64', slash: '150,190,180', blade: '#eef6f4' }],
    ['yh_p2', 'yuehua', '鎏金', { body: '#f8f0dc', shade: '#c8b070', scarf: '#d8a830', slash: '255,215,110', blade: '#fff8e0' }],
    ['yl_p2', 'yanling', '夜鸦', { body: '#2a2a30', shade: '#121216', scarf: '#6a6a7a', slash: '190,190,210', blade: '#dcdce6' }],
    ['my_p2', 'moyu', '青花', { body: '#eef2f8', shade: '#9aa8c4', scarf: '#2a4a9a', slash: '110,140,230', blade: '#1e2c5a', outline: '#1a2a5a', outlineA: 1 }],
    ['gc_p2', 'gouchen', '赭石', { body: '#c8945a', shade: '#8a5a2e', scarf: '#6a3a1a', slash: '230,170,100', blade: '#f4e2c8', outline: '#2a1608' }],
    ['yx_p2', 'yuxiao', '靛青', { body: '#dfe6f4', shade: '#8c9ac0', scarf: '#3a4fb0', slash: '120,140,240', blade: '#e8ecff' }],
    ['zx_p2', 'zuixian', '青瓷', { body: '#cfe0d4', shade: '#8aa894', scarf: '#4a8a78', slash: '140,220,190', blade: '#eef8f2' }],
  ];
  // ★ 非凡：只在武器箱里出的传说皮肤（青锋行那款是游戏里原有的，也放进了江湖武器箱）
  C.STARS = {
    gc_wolf: { char: 'gouchen', name: '霜狼',
      look: { body: '#dfe9f2', shade: '#7d93ab', scarf: '#7fd4ff', slash: '140,210,255', blade: '#f0f8ff', outline: '#0a1422', outlineA: 1 },
      deco: { head: 'voidhorns', hideBaseHead: true, gem: '#9fe0ff', robe: 'blizzard', breastplate: '#3a5878', shoulder: '#2d4a66', back: 'icewings', trail: 'snow', aura: 'snow', weapStyle: 'frost_hammer' },
      fx: { th: 'frost', c: '150,215,255', c2: '235,248,255' },
      scene: { sky: ['#06101c', '#10243a', '#24486a', '#10243a'], orb: 'moon', orbC: '220,240,255', mist: '170,215,255', mtn: ['#16304c', '#0c1e32'], bam: ['#081624', '#040c16'], wx: 'snow', wxC: '225,242,255', hit: 'snowflake', hitC: '150,215,255', stars: 0.5, rays: true } },
    zx_moon: { char: 'zuixian', name: '醉月',
      look: { body: '#e9ecf8', shade: '#8a93b8', scarf: '#8fa2ff', slash: '170,185,255', blade: '#f2f4ff' },
      deco: { head: 'veilhat', hatC: '#2a3550', veilC: 'rgba(170,190,255,0.40)', robe: 'starry', breastplate: '#2c3a66', back: 'gourdback', trail: 'cloud', aura: 'cloud', weapStyle: 'moon_gourd' },
      fx: { th: 'star', c: '170,190,255', c2: '240,244,255' },
      scene: { sky: ['#070a1c', '#141a3c', '#2a3470', '#121838'], orb: 'moon', orbC: '235,238,255', mist: '170,185,255', mtn: ['#1a2048', '#10142e'], bam: ['#0a0e22', '#060816'], wx: 'petal', wxC: '210,215,255', hit: 'swirl', hitC: '170,190,255', stars: 0.8, rays: true } },
    qf_renying: { char: 'qingfeng', name: '刃影',
      look: { body: '#2a2426', shade: '#141012', scarf: '#ff3b30', slash: '255,72,60', blade: '#fff1ee', outline: '#070708' },
      deco: { head: 'headband', band: '#ff3b30', robe: 'dark', breastplate: '#2a1416', shoulder: '#3a1a1c', back: 'flysword', trail: 'ink', aura: 'smoke', weapStyle: 'renying_blade' },
      fx: { th: 'ink', c: '255,80,70', c2: '12,8,8' },
      scene: { sky: ['#0c0606', '#2a0c0c', '#6a1a16', '#2a0a0a'], orb: 'bloodmoon', orbC: '255,90,70', mist: '255,90,80', mtn: ['#220a0a', '#140606'], bam: ['#0e0404', '#080202'], wx: 'ink', wxC: '40,20,20', hit: 'inksplat', hitC: '255,80,70', stars: 0.15, rays: true } },
    lm_jiuxiao: { char: 'leiming', name: '九霄',
      look: { body: '#2c2a4a', shade: '#16142a', scarf: '#ffd23a', slash: '255,225,110', blade: '#fffbe6', outline: '#ffe27a', outlineA: 0.9 },
      deco: { head: 'starguan', robe: 'thunder', breastplate: '#3a3070', shoulder: '#5a48a0', back: 'chakra', trail: 'spark', aura: 'gold', weapStyle: 'jiuxiao_gauntlet' },
      fx: { th: 'thunder', c: '255,225,110', c2: '170,140,255' },
      scene: { sky: ['#07051a', '#181040', '#38246e', '#140c30'], orb: 'rift', orbC: '255,225,120', mist: '190,160,255', mtn: ['#1c1238', '#0e0a22'], bam: ['#0a0616', '#06040e'], wx: 'spark', wxC: '255,220,110', hit: 'bolt', hitC: '255,220,90', stars: 0.5, rays: true } },
    yh_guanghan: { char: 'yuehua', name: '广寒',
      look: { body: '#24305a', shade: '#121a3a', scarf: '#e8eeff', slash: '215,228,255', blade: '#f6f9ff', outline: '#dce6ff', outlineA: 0.9 },
      deco: { head: 'jadepin', gem: '#cfe0ff', robe: 'starry', breastplate: '#1a2650', back: 'crescent', trail: 'snow', aura: 'cloud', weapStyle: 'guanghan_moon' },
      fx: { th: 'star', c: '205,222,255', c2: '255,255,255' },
      scene: { sky: ['#03061a', '#0a163a', '#1c3468', '#0a1632'], orb: 'moon', orbC: '240,246,255', mist: '190,210,255', mtn: ['#122444', '#0a162c'], bam: ['#060c1c', '#040812'], wx: 'snow', wxC: '230,240,255', hit: 'crescent', hitC: '205,222,255', stars: 0.9, rays: true } },
  };
  // 六个武器箱，各是一套收藏品：游戏里原有的 35 款皮肤和武库的 29 款全在里面，每款只在一个箱子里
  C.COLS = {
    c1: { name: '初刃', price: 180, emblem: '刃', col: '200,70,60',
      mil: ['qf_p1', 'ts_p1', 'lm_p1', 'fy_p1'], res: ['qf_frost', 'ts_bronze', 'ly_dusk'], cla: ['ts_obsidian', 'ly_sky'], cov: ['qf_gold', 'fy_blood'], gold: ['gc_wolf'] },
    c2: { name: '霜华', price: 220, emblem: '霜', col: '90,160,230',
      mil: ['ls_p1', 'yh_p1', 'my_p1', 'gc_p1'], res: ['ls_plum', 'yh_sakura'], cla: ['yh_eclipse', 'my_gold'], cov: ['ls_aurora', 'yh_solstice'], gold: ['zx_moon'] },
    c3: { name: '名剑', price: 260, emblem: '剑', col: '220,170,70',
      mil: ['yx_p1', 'zx_p1', 'qf_p2', 'ts_p2'], res: ['yx_snow', 'zx_amber'], cla: ['yx_celestial', 'yl_phoenix'], cov: ['qf_abyss', 'zx_immortal'], gold: ['qf_renying'] },
    c4: { name: '江湖', price: 220, emblem: '行', col: '90,200,150',
      mil: ['lm_p2', 'fy_p2', 'ly_p2', 'yh_p2'], res: ['ly_bamboo', 'yl_raven'], cla: ['fy_phantom'], cov: ['my_celestial', 'ts_crimson'], gold: ['qf_qfx'] },
    c5: { name: '惊雷', price: 240, emblem: '雷', col: '150,100,240',
      mil: ['ly_p1', 'yl_p2', 'my_p2', 'gc_p2'], res: ['lm_violet', 'my_cinnabar'], cla: ['lm_asura'], cov: ['ly_fox', 'ls_dragon'], gold: ['lm_jiuxiao'] },
    c6: { name: '寒月', price: 240, emblem: '月', col: '110,200,215',
      mil: ['yl_p1', 'ls_p2', 'yx_p2', 'zx_p2'], res: ['fy_jade', 'gc_crimson'], cla: ['lm_sun'], cov: ['gc_underworld', 'yl_blizzard'], gold: ['yh_guanghan'] },
  };
  C.CASES = Object.keys(C.COLS);
  C.UP = { mil: 'res', res: 'cla', cla: 'cov', cov: 'gold' };
  C.NEED = { mil: 10, res: 10, cla: 10, cov: 10 };

  // 商店只剩改名标签（墨锭，每周限量）；武器箱在武器箱页用墨锭买
  C.STORE = [{ id: 'tag', name: '改名标签', give: ['tags', 1], cost: 400, lim: 2 }];
  // 江湖行动：每周四个任务（四组里各抽一个），完成得星章
  C.MISSIONS = {
    games: { g: 0, n: 5, star: 1, t: '进行 {n} 局对战' },
    wins: { g: 0, n: 3, star: 1, t: '赢下 {n} 局' },
    hero: { g: 1, n: 2, star: 2, t: '用{h}赢下 {n} 局' },
    hard: { g: 1, n: 1, star: 2, t: '在劲敌或更高难度下赢 {n} 局人机' },
    flaw: { g: 1, n: 1, star: 2, t: '以 2 : 0 拿下 {n} 局' },
    combo: { g: 2, n: 15, star: 1, max: true, t: '一局里打出 {n} 连击' },
    ults: { g: 2, n: 6, star: 1, t: '施展 {n} 次终极奥义' },
    net: { g: 2, n: 2, star: 2, t: '联机对战 {n} 局' },
    tower: { g: 2, n: 1, star: 1, t: '打 {n} 局问剑密卷' },
    chaos: { g: 2, n: 1, star: 1, t: '打 {n} 局天机乱斗' },
    tag3: { g: 2, n: 1, star: 2, t: '赢下 {n} 局 3v3 车轮战' },
    duo: { g: 2, n: 1, star: 1, t: '打 {n} 局 2v2' },
    open: { g: 3, n: 2, star: 1, t: '开启 {n} 个武器箱' },
    trade: { g: 3, n: 1, star: 1, t: '签 {n} 份汰换合同' },
    sell: { g: 3, n: 1, star: 1, t: '在江湖市场卖出 {n} 件饰品' },
    buy: { g: 3, n: 1, star: 1, t: '在江湖市场买入 {n} 件饰品' },
  };
  C.STAR_SHOP = [
    { id: 'ink', cost: 1, name: '300 墨锭' },
    { id: 'case', cost: 2, name: '随机武器箱' },
    { id: 'tag', cost: 2, name: '改名标签' },
    { id: 'term', cost: 3, name: '终端机' },
    { id: 'res', cost: 5, name: '随机受限饰品' },
    { id: 'cla', cost: 9, name: '随机保密饰品' },
    { id: 'cov', cost: 15, name: '自选隐秘饰品' },
  ];

  /* ---------- 小工具 ---------- */
  function hash32(str) {
    let h = 0x811c9dc5;
    str = String(str);
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  function rng(seed) {   // mulberry32：同一个种子在哪台机器上都得到同一串数
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const r01 = (seed, i) => hash32(seed + ':' + i) / 4294967296;
  // 查表一律只认表里自己的键（'__proto__'、'constructor' 这种名字查不到东西）
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  C.own = own;
  C.hash32 = hash32; C.rng = rng;
  C.day = t => Math.floor((t + 8 * 3600e3) / 86400e3);
  C.week = d => Math.floor((d + 3) / 7);
  C.season = d => { const k = Math.max(0, Math.floor((d - C.DAY0) / C.SEASON_DAYS)), s = C.DAY0 + k * C.SEASON_DAYS; return { k, id: 's' + (k + 1), start: s, end: s + C.SEASON_DAYS }; };

  // 每件饰品：属于哪个武器箱（收藏品）、什么品质、热门程度
  C.ITEM = Object.create(null);
  for (const [cid, col] of Object.entries(C.COLS)) for (const t of C.TIERS) for (const k of col[t] || [])
    C.ITEM[k] = { col: cid, tier: t, mul: 0.85 + (hash32('pop|' + k) % 450) / 1000 };   // 热门程度 0.85~1.3
  C.isItem = k => Object.prototype.hasOwnProperty.call(C.ITEM, k);
  C.ofTier = t => Object.keys(C.ITEM).filter(k => C.ITEM[k].tier === t);
  const PREFIX = { qf: 'qingfeng', fy: 'feiying', ts: 'tieshan', ls: 'lingshuang', ly: 'liuyun', lm: 'leiming', my: 'moyu', yh: 'yuehua', yl: 'yanling', yx: 'yuxiao', zx: 'zuixian', gc: 'gouchen' };
  C.charOf = k => own(PREFIX, String(k).split('_')[0]) || '';

  /* ---------- 市场价格 ---------- */
  // 每天的价格走势：几层平滑的随机起伏叠在一起（只用整数哈希和加减乘除，哪个浏览器、服务器算出来都一样）
  C.trend = (key, day) => {
    const h = 'tr|' + key;
    const oct = (period, amp, salt) => {
      const x = day / period, i = Math.floor(x), t = x - i, u = t * t * (3 - 2 * t);
      const a = r01(h + salt, i), b = r01(h + salt, i + 1);
      return (a + (b - a) * u - 0.5) * 2 * amp;
    };
    return 1 + oct(29, 0.06, 'a') + oct(9, 0.028, 'b') + oct(3, 0.012, 'c');   // 加起来最多 ±10%
  };
  C.ST_MUL = t => t === 'gold' ? 1.4 : 1.75;   // 斩数版贵多少
  C.price = (it, day) => {
    const d = C.ITEM[it.k]; if (!d) return 0;
    let p = C.BASE[d.tier] * d.mul;
    if (it.st >= 0) p *= C.ST_MUL(d.tier);
    return Math.max(2, Math.round(p * C.trend(it.k, day)));
  };
  C.refPrice = (k, day) => C.price({ k, st: -1 }, day);   // 走势图用：普通版
  C.casePrice = (cid, day) => Math.max(5, Math.round(C.COLS[cid].price * C.trend('case|' + cid, day)));
  C.quick = p => Math.floor(p * C.BID * (1 - C.FEE));   // 直接卖出（饰品、武器箱）到手多少
  C.net = p => Math.floor(p * (1 - C.FEE));             // 挂单成交到手多少
  // 市场上今天在卖的几件（别的江湖人挂的单）：同一天同一件饰品，谁来看都是这几件
  C.listings = (k, day) => {
    if (!C.isItem(k)) return [];
    const r = rng(hash32(`ls|${k}|${day}`)), n = 3 + Math.floor(r() * 4), out = [];
    for (let j = 0; j < n; j++) {
      const st = r() < 0.2 ? Math.floor(r() * 150) : -1, m = C.ASK[0] + r() * (C.ASK[1] - C.ASK[0]);
      out.push({ l: `${day}.${k}.${j}`, k, st, price: Math.round(C.price({ k, st }, day) * m) });
    }
    return out.sort((a, b) => a.price - b.price);
  };
  // 挂单多久能卖掉：标价和市场价的比，越便宜越快（每小时卖出的机会）；超过 95% 没人买
  C.sellRate = ratio => ratio > C.LIST_MAX_R ? 0 : Math.min(6, 0.6 * Math.exp(-(ratio - C.LIST_MAX_R) * 8));

  /* ---------- 存档 ---------- */
  C.blank = () => ({
    v: C.VER, tags: 0, term: 0, tm: null, nid: 1, inv: [], cases: Object.fromEntries(C.CASES.map(c => [c, 0])), via: [], eq: {},
    lst: [], hist: [], bought: { d: 0, ids: [] }, cw: { w: 0, n: 0 }, drop: { w: 0, g: 0, n: 0, sup: 0 },
    op: { s: '', earned: 0, spent: 0, w: 0, ms: [], prog: {}, done: [] }, cc: [], buys: {},
    stat: { open: 0, trade: 0, sold: 0, bought: 0, term: 0 }, tk: null, last: 0, dm: { d: 0, n: 0 }, gift: 0,
  });
  const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const int = (x, lo = 0, hi = 1e15) => { const v = Math.floor(+x); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  const num = (x, lo = 0, hi = 1e15) => { const v = +x; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  const str = (x, n) => typeof x === 'string' ? x.slice(0, n) : '';
  const stOf = x => Math.floor(+x) >= 0 ? int(x, 0, 1e7) : -1;
  const cleanItem = x => isObj(x) && C.isItem(x.k) && Number.isFinite(+x.i) ? {
    i: int(x.i, 1), k: x.k, st: stOf(x.st), n: str(x.n, 12).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, ''), t: num(x.t), src: str(x.src, 8) } : null;
  // 读进来的存档先整理一遍：缺的补上，类型不对的换掉，每一层都按格式重新拼一遍（多出来的字段一律丢掉），过了周就换周任务。
  // 第 1 版的存档也这样读：磨损、图案模板、玉珏、充值记录这些字段直接丢掉，没用完的钥匙一把换一台终端机，饰品和武器箱照旧
  C.normalize = (s, env) => {
    if (!isObj(s)) s = C.blank();
    const oldKeys = s.v === 1 ? int(s.keys, 0, 50) : 0;
    const b = C.blank();
    for (const k of Object.keys(b)) {
      const okType = Array.isArray(b[k]) ? Array.isArray(s[k]) : isObj(b[k]) ? isObj(s[k]) : b[k] === null ? (s[k] === null || isObj(s[k])) : typeof s[k] === typeof b[k];
      if (!okType) s[k] = b[k];
    }
    for (const k of Object.keys(s)) if (!(k in b)) delete s[k];
    s.v = C.VER;
    s.tags = int(s.tags, 0, 1e9); s.term = int(s.term, 0, 1e6) + oldKeys;
    s.cases = Object.fromEntries(C.CASES.map(c => [c, int(s.cases[c], 0, 1e6)]));
    const seen = new Set();
    s.inv = s.inv.map(cleanItem).filter(x => x && !seen.has(x.i) && seen.add(x.i)).slice(0, C.INV_MAX);
    s.lst = s.lst.map(L => {
      const it = isObj(L) && cleanItem(L.it);
      if (!it || seen.has(it.i) || !/^L\d{1,12}$/.test(String(L.l))) return null;
      seen.add(it.i);
      return { l: String(L.l), it, price: int(L.price, 1, 9999999), t: num(L.t), at: num(L.at) };
    }).filter(Boolean).slice(0, C.LIST_MAX);
    let top = 0;
    for (const x of s.inv) top = Math.max(top, x.i);
    for (const L of s.lst) top = Math.max(top, L.it.i, +L.l.slice(1));
    s.nid = Math.max(int(s.nid, 1), top + 1);
    s.via = Array.from(new Set(s.via.filter(k => C.isItem(k))));
    s.eq = Object.fromEntries(Object.entries(s.eq).filter(([c, id]) => C.HERO_IDS.includes(c) && s.inv.some(x => x.i === id && C.charOf(x.k) === c)));
    s.hist = s.hist.filter(isObj).slice(0, C.HIST_MAX).map(h => ({ t: num(h.t), kind: ['buy', 'sell', 'sold', 'term'].includes(h.kind) ? h.kind : 'sell',
      ...(C.CASES.includes(h.c) ? { c: h.c, n: int(h.n, 0, 1e6) } : { k: C.isItem(h.k) ? h.k : 'qf_p1', st: stOf(h.st) }),
      price: int(h.price, 0, 1e9), ...(h.gain !== undefined ? { gain: int(h.gain, 0, 1e9) } : {}) }));
    s.cc = Array.from(new Set(s.cc.filter(c => own(C.COLS, c))));
    s.buys = Object.fromEntries(Object.entries(s.buys).filter(([id, v]) => C.STORE.some(g => g.id === id) && isObj(v)).map(([id, v]) => [id, { k: str(v.k, 12), n: int(v.n, 0, 1e6) }]));
    s.stat = Object.fromEntries(Object.keys(b.stat).map(k => [k, int(s.stat[k])]));
    s.tk = isObj(s.tk) && C.MODES.includes(s.tk.mode) ? { t0: num(s.tk.t0), mode: s.tk.mode } : null;
    s.last = num(s.last); s.gift = s.gift ? 1 : 0;
    s.bought = { d: int(s.bought.d), ids: Array.isArray(s.bought.ids) ? s.bought.ids.filter(x => typeof x === 'string').map(x => x.slice(0, 40)).slice(0, 600) : [] };
    s.cw = { w: int(s.cw.w), n: int(s.cw.n, 0, C.CASE_WEEK) };
    s.drop = { w: int(s.drop.w), g: int(s.drop.g, 0, 1e6), n: int(s.drop.n, 0, 1e6), sup: s.drop.sup ? 1 : 0 };
    s.dm = { d: int(s.dm.d), n: int(s.dm.n, 0, 1e6) };
    const tm = s.tm, o = isObj(tm) && isObj(tm.o) && C.isItem(tm.o.k) ? tm.o : null;
    s.tm = o ? { t0: num(tm.t0), n: int(tm.n, 1, C.TERM.offers), o: { k: o.k, st: stOf(o.st), price: int(o.price, 1, 1e8) } } : null;
    const op = s.op, ms = Array.isArray(op.ms) && op.ms.length === 4 && op.ms.every(m => isObj(m) && own(C.MISSIONS, m.id)) ? op.ms.map(m => ({ id: m.id, n: C.MISSIONS[m.id].n, star: C.MISSIONS[m.id].star, ...(m.id === 'hero' ? { h: C.HERO_IDS.includes(m.h) ? m.h : 'qingfeng' } : {}) })) : null;
    const earned = int(op.earned, 0, 1e6);
    s.op = { s: str(op.s, 8), earned, spent: int(op.spent, 0, earned), w: ms ? int(op.w) : -1, ms: ms || [],
      prog: ms ? Object.fromEntries([0, 1, 2, 3].filter(i => i in (isObj(op.prog) ? op.prog : {})).map(i => [i, int(op.prog[i], 0, ms[i].n)])) : {},
      done: ms && Array.isArray(op.done) ? Array.from(new Set(op.done.map(Number).filter(i => i >= 0 && i < 4 && Number.isInteger(i)))) : [] };
    const now = env.now, day = C.day(now), wk = C.week(day), se = C.season(day);
    if (s.bought.d !== day) s.bought = { d: day, ids: [] };
    if (s.cw.w !== wk) s.cw = { w: wk, n: 0 };
    if (s.drop.w !== wk) s.drop = { w: wk, g: 0, n: 0, sup: 0 };
    if (s.op.s !== se.id) s.op = { s: se.id, earned: 0, spent: 0, w: 0, ms: [], prog: {}, done: [] };
    if (s.op.w !== wk) Object.assign(s.op, { w: wk, ms: C.genMissions(env.uid, wk), prog: {}, done: [] });
    if (s.dm.d !== day) s.dm = { d: day, n: 0 };
    if (s.tm && !(now - s.tm.t0 < C.TERM.days * 86400e3)) s.tm = null;   // 开封超过 3 天：作废
    return s;
  };
  // 给玩家看的那份：挂单什么时候成交只有服务器知道（不然撤了重挂能刷出马上成交的单）
  C.publicState = s => { const o = JSON.parse(JSON.stringify(s)); for (const L of o.lst) delete L.at; delete o.tk; return o; };
  // 只在武库里出的皮肤（24 款涂装和 5 款 ★）：服务器只认库存里真有的
  C.CS_KEYS = [...C.PAINTS.map(p => p[0]), ...Object.keys(C.STARS)];
  C.genMissions = (uid, wk) => {
    const r = rng(hash32(`ms|${uid}|${wk}`)), out = [];
    for (let g = 0; g < 4; g++) {
      const ids = Object.keys(C.MISSIONS).filter(id => C.MISSIONS[id].g === g), id = ids[Math.floor(r() * ids.length)], m = C.MISSIONS[id];
      const row = { id, n: m.n, star: m.star };
      if (id === 'hero') row.h = C.HERO_IDS[Math.floor(r() * C.HERO_IDS.length)];
      out.push(row);
    }
    return out;
  };
  C.supplyOpts = (uid, wk) => {
    const r = rng(hash32(`sup|${uid}|${wk}`)), pick = a => a[Math.floor(r() * a.length)];
    const opts = [{ t: 'case', c: pick(C.CASES) }, { t: 'term', n: 1 }, r() < 0.3 ? { t: 'item', k: pick(C.ofTier('res')) } : { t: 'item', k: pick(C.ofTier('mil')) }, r() < 0.5 ? { t: 'ink', n: 400 } : { t: 'tag', n: 1 }];
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return opts;
  };
  C.caseLeft = s => Math.max(0, C.CASE_WEEK - s.cw.n);   // 这周还能用墨锭买几个武器箱

  /* ---------- 物品进出库存 ---------- */
  C.mkItem = (s, k, src, rnd, o = {}) => {
    const st = o.st !== undefined ? o.st : (rnd() < C.ST_P ? 0 : -1);
    return { i: s.nid++, k, st, n: '', t: o.t || 0, src };
  };
  // 拿到一件：这款皮肤原来没有的话，记进“可穿的皮肤”里，并记下是靠武库才有的
  C.addItem = (s, it, env) => {
    it.t = it.t || env.now;
    s.inv.push(it);
    if (!env.skins.includes(it.k)) { env.skins.push(it.k); if (!s.via.includes(it.k)) s.via.push(it.k); }
    return it;
  };
  C.findItem = (s, id) => s.inv.find(x => x.i === id) || null;
  // 送走一件：同款一件都不剩、又是靠武库才有的，就从可穿的皮肤里拿掉，正穿着的换回默认
  C.dropItem = (s, id, env) => {
    const ix = s.inv.findIndex(x => x.i === id); if (ix < 0) return null;
    const it = s.inv.splice(ix, 1)[0], char = C.charOf(it.k);
    for (const [c, v] of Object.entries(s.eq)) if (v === id) delete s.eq[c];
    if (!s.inv.some(x => x.k === it.k) && s.via.includes(it.k)) {
      s.via = s.via.filter(x => x !== it.k);
      const j = env.skins.indexOf(it.k); if (j >= 0) env.skins.splice(j, 1);
      if (char && env.equip[char] === it.k) delete env.equip[char];
    }
    return it;
  };
  const histPush = (s, row) => { s.hist.unshift(row); if (s.hist.length > C.HIST_MAX) s.hist.length = C.HIST_MAX; };
  const giveInk = (env, n) => {
    if (!Number.isFinite(n) || !Number.isFinite(env.ink)) throw new Error('bad ink');   // 算出来不是数：整个动作作废
    env.ink = Math.max(0, Math.floor(env.ink + n)); env.inkGain = (env.inkGain || 0) + Math.max(0, n);
  };
  const bump = (s, id, v, max) => {
    s.op.ms.forEach((m, i) => {
      if (m.id !== id || s.op.done.includes(i)) return;
      const cur = s.op.prog[i] || 0;
      s.op.prog[i] = Math.min(m.n, max ? Math.max(cur, v) : cur + v);
    });
  };
  const bought = (s, id, day) => { const b = s.buys[id]; return b && b.k === 'w' + C.week(day) ? b.n : 0; };
  const rollTier = (rnd, odds) => { let r = rnd(), acc = 0; for (const t of C.TIERS) { acc += odds[t]; if (r < acc) return t; } return 'mil'; };
  const pickOf = (rnd, a) => a[Math.floor(rnd() * a.length)];
  C.invFull = (s, n = 1) => s.inv.length + n > C.INV_MAX;
  // 终端机报的价：随机一档品质、这一档里随机一件，五分之一是斩数版；价格是今天市场价的 1~1.3 倍
  C.termOffer = (rnd, day) => {
    const k = pickOf(rnd, C.ofTier(rollTier(rnd, C.TERM.odds))), st = rnd() < C.ST_P ? 0 : -1;
    const m = C.TERM.markup[0] + rnd() * (C.TERM.markup[1] - C.TERM.markup[0]);
    return { k, st, price: Math.max(1, Math.round(C.price({ k, st }, day) * m)) };
  };
  // 汰换合同能出什么：每件材料平分它所在收藏品里高一档的那些饰品（和 CS 一样的算法）
  C.tradeCheck = (s, ids) => {
    if (!Array.isArray(ids) || !ids.length) return { err: '还没放材料' };
    const uniq = Array.from(new Set(ids.map(Number)));
    if (uniq.length !== ids.length) return { err: '同一件放了两次' };
    const items = uniq.map(id => C.findItem(s, id));
    if (items.some(x => !x)) return { err: '有材料已经不在库存里了' };
    const tier = C.ITEM[items[0].k].tier, up = C.UP[tier];
    if (!up) return { err: '★ 非凡已经是最高一档' };
    if (items.some(x => C.ITEM[x.k].tier !== tier)) return { err: '材料要同一档品质' };
    const stN = items.filter(x => x.st >= 0).length;
    if (stN && stN !== items.length) return { err: '斩数版和普通版不能混着放' };
    if (items.some(x => !(C.COLS[C.ITEM[x.k].col][up] || []).length)) return { err: '有材料的收藏品里没有更高一档的饰品' };
    const odds = {};
    for (const x of items) {
      const list = C.COLS[C.ITEM[x.k].col][up];
      for (const k of list) odds[k] = (odds[k] || 0) + 1 / list.length / items.length;
    }
    const outs = Object.entries(odds).map(([k, p]) => ({ k, p })).sort((a, b) => b.p - a.p);
    const full = items.length === C.NEED[tier];
    return { ok: full, full, err: full ? '' : `要正好 ${C.NEED[tier]} 件，现在 ${items.length} 件`, items, tier, up, outs, st: stN === items.length };
  };
  C.ctxOk = c => isObj(c) && C.MODES.includes(c.mode) && C.HERO_IDS.includes(c.char);

  /* ---------- 动作 ---------- */
  // env：now 现在时间、rnd 随机数、uid、ink 墨锭（会被改）、skins 可穿的皮肤（会被改）、equip 穿着（会被改）、server 是不是服务器在算
  const A = {};
  A.open = (s, a, env) => {   // 开箱：不用钥匙，开一个少一个
    const cid = a.c;
    if (!C.CASES.includes(cid)) return { err: '没有这个武器箱' };
    if ((s.cases[cid] || 0) < 1) return { err: '没有这个武器箱了' };
    if (C.invFull(s)) return { err: `库存满了（最多 ${C.INV_MAX} 件），先卖掉一些` };
    s.cases[cid]--; s.stat.open++;
    const tier = rollTier(env.rnd, C.ODDS), k = pickOf(env.rnd, C.COLS[cid][tier]);
    const it = C.addItem(s, C.mkItem(s, k, 'case', env.rnd), env);
    bump(s, 'open', 1);
    return { ok: true, item: it };
  };
  A.store = (s, a, env) => {
    const g = C.STORE.find(x => x.id === a.id), n = Math.max(1, Math.min(10, Math.floor(+a.n || 1)));
    if (!g) return { err: '没有这件商品' };
    const day = C.day(env.now);
    if (bought(s, g.id, day) + n > g.lim) return { err: `本周最多买 ${g.lim} 次` };
    const cost = g.cost * n;
    if (env.ink < cost) return { err: '墨锭不够' };
    giveInk(env, -cost);
    s[g.give[0]] += g.give[1] * n;
    const pk = 'w' + C.week(day);
    if (!s.buys[g.id] || s.buys[g.id].k !== pk) s.buys[g.id] = { k: pk, n: 0 };
    s.buys[g.id].n += n;
    return { ok: true };
  };
  A.buy = (s, a, env) => {   // 买市场上的一件
    const day = C.day(env.now), parts = String(a.l || '').split('.');
    if (parts.length !== 3 || +parts[0] !== day) return { err: '这件已经下架了，刷新看看' };
    const L = C.listings(parts[1], day).find(x => x.l === a.l);
    if (!L) return { err: '没有这件挂单' };
    if (s.bought.ids.includes(a.l)) return { err: '这件已经被你买走了' };
    if (C.invFull(s)) return { err: '库存满了' };
    if (env.ink < L.price) return { err: `墨锭不够，要 ${L.price}` };
    giveInk(env, -L.price);
    s.bought.ids.push(a.l); s.stat.bought++;
    const it = C.addItem(s, C.mkItem(s, L.k, 'market', env.rnd, { st: L.st }), env);
    histPush(s, { t: env.now, kind: 'buy', k: L.k, st: L.st, price: L.price });
    bump(s, 'buy', 1);
    return { ok: true, item: it, price: L.price };
  };
  A.buyCase = (s, a, env) => {   // 用墨锭买武器箱：每周最多 5 个
    const cid = a.c, n = a.n === undefined ? 1 : Math.floor(+a.n);
    if (!C.CASES.includes(cid)) return { err: '没有这个武器箱' };
    if (!(n >= 1 && n <= C.CASE_WEEK)) return { err: '数量不对' };
    const left = C.caseLeft(s);
    if (n > left) return { err: left ? `这周还能买 ${left} 个` : `这周的 ${C.CASE_WEEK} 次已经用完了，下周一再来` };
    const p = C.casePrice(cid, C.day(env.now)) * n;
    if (env.ink < p) return { err: `墨锭不够，要 ${p}` };
    giveInk(env, -p); s.cases[cid] += n; s.cw.n += n;
    histPush(s, { t: env.now, kind: 'buy', c: cid, n, price: p });
    return { ok: true, price: p };
  };
  A.sellCase = (s, a, env) => {
    const cid = a.c, n = Math.max(1, Math.min(50, Math.floor(+a.n || 1)));
    if (!C.CASES.includes(cid) || s.cases[cid] < n) return { err: '武器箱不够' };
    const p = C.quick(C.casePrice(cid, C.day(env.now))) * n;
    s.cases[cid] -= n; giveInk(env, p); s.stat.sold += n;
    histPush(s, { t: env.now, kind: 'sell', c: cid, n, price: p });
    bump(s, 'sell', n);
    return { ok: true, gain: p };
  };
  A.quick = (s, a, env) => {   // 直接卖给收购的人：市场价扣掉手续费
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
    const p = C.quick(C.price(it, C.day(env.now)));
    C.dropItem(s, it.i, env); giveInk(env, p); s.stat.sold++;
    histPush(s, { t: env.now, kind: 'sell', k: it.k, st: it.st, price: p });
    bump(s, 'sell', 1);
    return { ok: true, gain: p };
  };
  A.list = (s, a, env) => {   // 自己定价挂单，卖掉才到账
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
    if (s.lst.length >= C.LIST_MAX) return { err: `最多同时挂 ${C.LIST_MAX} 件` };
    const day = C.day(env.now), mk = C.price(it, day), price = Math.floor(+a.price || 0);
    if (!(price >= 1) || price > 9999999) return { err: '标价不对' };
    if (price > Math.floor(mk * C.LIST_MAX_R)) return { err: `标价最高 ${Math.floor(mk * C.LIST_MAX_R)}（市场价的 ${Math.round(C.LIST_MAX_R * 100)}%），再高没人买` };
    const rate = C.sellRate(price / mk), u = env.rnd();
    const at = rate > 0 ? env.now + Math.round(-Math.log(1 - u) / rate * 3600e3) : 0;
    C.dropItem(s, it.i, env);
    s.lst.push({ l: 'L' + (s.nid++), it, price, t: env.now, at });
    return { ok: true };
  };
  A.cancel = (s, a, env) => {
    const ix = s.lst.findIndex(x => x.l === a.l); if (ix < 0) return { err: '没有这个挂单' };
    if (C.invFull(s)) return { err: '库存满了，放不回去' };
    const L = s.lst.splice(ix, 1)[0];
    C.addItem(s, L.it, env);
    return { ok: true };
  };
  // 到时间的挂单算成交（每次读存档都会先结一遍）
  C.settle = (s, env) => {
    const sold = [];
    s.lst = s.lst.filter(L => {
      if (!L.at || env.now < L.at) return true;
      const gain = C.net(L.price);
      giveInk(env, gain); s.stat.sold++;
      histPush(s, { t: L.at, kind: 'sold', k: L.it.k, st: L.it.st, price: L.price, gain });
      bump(s, 'sell', 1);
      sold.push({ k: L.it.k, price: L.price, gain });
      return false;
    });
    return sold;
  };
  A.trade = (s, a, env) => {
    const chk = C.tradeCheck(s, a.ids);
    if (!chk.ok) return { err: chk.err };
    let r = env.rnd(), pick = chk.outs[chk.outs.length - 1];
    for (const o of chk.outs) { if (r < o.p) { pick = o; break; } r -= o.p; }
    for (const x of chk.items) C.dropItem(s, x.i, env);
    const it = C.addItem(s, C.mkItem(s, pick.k, 'trade', env.rnd, { st: chk.st ? 0 : -1 }), env);
    s.stat.trade++;
    bump(s, 'trade', 1);
    return { ok: true, item: it };
  };
  A.rename = (s, a, env) => {
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
    const name = String(a.name || '').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').trim().slice(0, 12);
    if (name && s.tags < 1) return { err: '没有改名标签' };
    if (name) s.tags--;
    it.n = name;
    return { ok: true };
  };
  A.equip = (s, a, env) => {
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
    const char = C.charOf(it.k);
    if (!char) return { err: '这件穿不上' };
    s.eq[char] = it.i; env.equip[char] = it.k;
    return { ok: true, char };
  };
  A.unequip = (s, a, env) => {
    const char = String(a.char || ''); if (!C.HERO_IDS.includes(char)) return { err: '没有这位侠客' };
    delete s.eq[char]; env.equip[char] = '';
    return { ok: true };
  };
  // 终端机：开封给第一件；不要就换下一件（第 5 件也不要，终端机就没了）；买下就用掉
  A.unseal = (s, a, env) => {
    if (s.tm) return { err: '已经有一台开着的终端机，先处理完它' };
    if (s.term < 1) return { err: '没有终端机' };
    s.term--;
    s.tm = { t0: env.now, n: 1, o: C.termOffer(env.rnd, C.day(env.now)) };
    return { ok: true, tm: s.tm };
  };
  A.termNext = (s, a, env) => {
    if (!s.tm) return { err: '没有开着的终端机' };
    if (a.n !== undefined && +a.n !== s.tm.n) return { err: '这一件已经换掉了，刷新看看' };   // 点得太快、请求重发：不会一下跳过两件
    if (s.tm.n >= C.TERM.offers) { s.tm = null; return { ok: true, gone: true }; }
    s.tm.n++; s.tm.o = C.termOffer(env.rnd, C.day(env.now));
    return { ok: true, tm: s.tm };
  };
  A.termBuy = (s, a, env) => {
    const tm = s.tm; if (!tm) return { err: '没有开着的终端机' };
    if (a.n !== undefined && +a.n !== tm.n) return { err: '这一件已经换掉了，刷新看看' };   // 点“买下”时看到的是第几件
    if (C.invFull(s)) return { err: '库存满了' };
    if (env.ink < tm.o.price) return { err: `墨锭不够，要 ${tm.o.price}` };
    giveInk(env, -tm.o.price);
    const it = C.addItem(s, C.mkItem(s, tm.o.k, 'term', env.rnd, { st: tm.o.st }), env);
    histPush(s, { t: env.now, kind: 'term', k: tm.o.k, st: tm.o.st, price: tm.o.price });
    s.tm = null; s.stat.term++;
    return { ok: true, item: it, price: tm.o.price };
  };
  A.supply = (s, a, env) => {
    const picks = Array.isArray(a.picks) ? a.picks.map(Number).filter(Number.isInteger) : [];
    if (s.drop.sup) return { err: '这周的补给已经领过了' };
    if (s.drop.g < C.SUPPLY_GAMES) return { err: `这周再打 ${C.SUPPLY_GAMES - s.drop.g} 局就能领` };
    if (picks.length !== 2 || picks[0] === picks[1] || picks.some(x => !(x >= 0 && x < 4))) return { err: '要从四样里挑两样' };
    const opts = C.supplyOpts(env.uid, s.drop.w), got = [];
    if (picks.some(x => opts[x].t === 'item') && C.invFull(s)) return { err: '库存满了' };
    s.drop.sup = 1;
    for (const x of picks) {
      const o = opts[x];
      if (o.t === 'case') { s.cases[o.c]++; got.push(o); }
      else if (o.t === 'term') { s.term += o.n; got.push(o); }
      else if (o.t === 'tag') { s.tags += o.n; got.push(o); }
      else if (o.t === 'ink') { giveInk(env, o.n); got.push(o); }
      else if (o.t === 'item') got.push({ t: 'item', item: C.addItem(s, C.mkItem(s, o.k, 'supply', env.rnd), env) });
    }
    return { ok: true, got };
  };
  A.mission = (s, a, env) => {
    const i = Math.floor(+a.m), m = s.op.ms[i];
    if (!m) return { err: '没有这个任务' };
    if (s.op.done.includes(i)) return { err: '已经领过了' };
    if ((s.op.prog[i] || 0) < m.n) return { err: '还没完成' };
    s.op.done.push(i); s.op.earned += m.star;
    return { ok: true, star: m.star };
  };
  A.star = (s, a, env) => {
    const g = C.STAR_SHOP.find(x => x.id === a.id); if (!g) return { err: '没有这一项' };
    if (s.op.earned - s.op.spent < g.cost) return { err: '星章不够' };
    const r = env.rnd;
    let res = { ok: true };
    if (g.id === 'ink') giveInk(env, 300);
    else if (g.id === 'case') { const c = pickOf(r, C.CASES); s.cases[c]++; res.c = c; }
    else if (g.id === 'tag') s.tags++;
    else if (g.id === 'term') s.term++;
    else {
      if (C.invFull(s)) return { err: '库存满了' };
      let k;
      if (g.id === 'cov') { if (!(C.isItem(a.k) && C.ITEM[a.k].tier === 'cov')) return { err: '要从隐秘级里挑一件' }; k = a.k; }
      else k = pickOf(r, C.ofTier(g.id));
      res.item = C.addItem(s, C.mkItem(s, k, 'op', r), env);
    }
    s.op.spent += g.cost;
    return res;
  };
  // 集齐一套收藏品的 4 款军规级：送这个武器箱一个和一张改名标签
  A.collect = (s, a, env) => {
    const col = own(C.COLS, a.c); if (!col) return { err: '没有这套收藏品' };
    if (s.cc.includes(a.c)) return { err: '已经领过了' };
    if (!col.mil.every(k => s.inv.some(x => x.k === k))) return { err: '还没集齐' };
    s.cc.push(a.c); s.cases[a.c]++; s.tags++;
    return { ok: true };
  };
  // 一局打完：记补给进度、行动任务、斩数（穿着斩数版的侠客每击倒一个对手 +1），再按概率掉一件
  A.matchEnd = (s, a, env) => {
    const c = a.ctx;
    if (!C.ctxOk(c)) return { err: '这局不算' };
    if (env.server) {   // 服务器上：要有开局时领的票，打够时间，两局之间隔开，每天有上限
      const tk = s.tk; s.tk = null;
      if (!tk || env.now - tk.t0 < C.MATCH_MIN_MS || env.now - tk.t0 > C.MATCH_MAX_MS) return { err: '这局时间不对，不算' };
      if (env.now - (s.last || 0) < C.MATCH_GAP_MS) return { err: '太快了，不算' };
      if (s.dm.n >= C.MATCH_DAY_CAP) return { err: '今天的对局奖励已经拿满了' };
    }
    s.last = env.now; s.dm.n++;
    const win = !!c.win;
    const combo = Math.max(0, Math.min(200, Math.floor(+c.combo || 0))), ults = Math.max(0, Math.min(30, Math.floor(+c.ults || 0)));
    s.drop.g++;
    bump(s, 'games', 1);
    if (win) bump(s, 'wins', 1);
    s.op.ms.forEach((m, i) => { if (m.id === 'hero' && win && c.char === m.h && !s.op.done.includes(i)) s.op.prog[i] = Math.min(m.n, (s.op.prog[i] || 0) + 1); });
    if (win && c.mode === 'cpu' && ['hard', 'impossible', 'god'].includes(c.level)) bump(s, 'hard', 1);
    if (win && c.flawless) bump(s, 'flaw', 1);
    if (combo) bump(s, 'combo', combo, true);
    if (ults) bump(s, 'ults', ults);
    if (c.mode === 'net') bump(s, 'net', 1);
    if (c.mode === 'tower') bump(s, 'tower', 1);
    if (c.mode === 'chaos') bump(s, 'chaos', 1);
    if (c.mode === 'tag3' && win) bump(s, 'tag3', 1);
    if (c.mode === '2v2') bump(s, 'duo', 1);
    const res = { ok: true, st: [] };
    let left = C.KO_MAX;
    for (const [h, v] of Object.entries(isObj(c.ko) ? c.ko : {}).slice(0, 3)) {   // 车轮战一局最多三位侠客
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;   // 只认正常的数字（1e400 这种会变成无穷大，不算）
      const add = Math.min(left, Math.max(0, n)), id = C.HERO_IDS.includes(h) && s.eq[h], eq = id && C.findItem(s, id);
      if (!add || !eq || eq.st < 0) continue;
      left -= add; eq.st += add;
      res.st.push({ i: eq.i, k: eq.k, add, total: eq.st });
    }
    if (s.drop.n < C.DROP_CAP && env.rnd() < C.DROP_P && !C.invFull(s)) {
      s.drop.n++;
      if (env.rnd() < 0.3) { const cid = pickOf(env.rnd, C.CASES); s.cases[cid]++; res.drop = { t: 'case', c: cid }; }
      else res.drop = { t: 'item', item: C.addItem(s, C.mkItem(s, pickOf(env.rnd, C.ofTier(env.rnd() < 0.85 ? 'mil' : 'res')), 'drop', env.rnd), env) };
    }
    return res;
  };
  A.matchStart = (s, a, env) => {
    const mode = String(a.mode || '');
    if (!C.MODES.includes(mode)) return { err: '这个模式不记' };
    s.tk = { t0: env.now, mode };
    return { ok: true };
  };
  A.sync = () => ({ ok: true });
  A.gift = (s, a, env) => {   // 第一次进武库：送一个初刃武器箱和一台终端机
    if (s.gift) return { err: '已经领过了' };
    s.gift = 1; s.cases.c1++; s.term++;
    return { ok: true };
  };
  C.ACTIONS = Object.keys(A);
  // 跑一个动作：先整理存档、结掉到期的挂单，再做动作。出错时存档原样不动（先在副本上做）
  C.run = (state, name, args, env) => {
    if (!own(A, name)) return { res: { err: '不认识的操作' }, state };
    const s = C.normalize(JSON.parse(JSON.stringify(state || C.blank())), env);
    const ink0 = env.ink, skins0 = env.skins.slice(), equip0 = JSON.parse(JSON.stringify(env.equip));
    const sold = C.settle(s, env);
    let res;
    try { res = A[name](s, args || {}, env); } catch (e) { res = { err: '操作失败' }; }
    if (!res || res.err) {   // 失败了：动作本身改的全部撤回，只留下结算挂单的结果
      const s2 = C.normalize(JSON.parse(JSON.stringify(state || C.blank())), env);
      env.ink = ink0; env.skins.length = 0; env.skins.push(...skins0);
      Object.keys(env.equip).forEach(k => delete env.equip[k]); Object.assign(env.equip, equip0);
      env.inkGain = 0;
      const sold2 = C.settle(s2, env);
      return { res: res || { err: '操作失败' }, state: s2, sold: sold2 };
    }
    return { res, state: s, sold };
  };

  // 冻结所有数据表：控制台里改概率、价格、收藏品都没用
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
  deepFreeze(C);
  if (!G.ArmoryCore) Object.defineProperty(G, 'ArmoryCore', { value: C, writable: false, configurable: false, enumerable: false });
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* === cloudflare/worker.js === */

const C = globalThis.ArmoryCore;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

function error(message, status = 400, extra) {
  return json({ ok: false, error: message, ...(extra || {}) }, status);
}

const DAY_MS = 86400e3;
// 客户端上报的墨锭收入（打电脑、任务、关卡星这些都在本机算）：服务器看不见本机发生了什么，只能限量。
// 每天先认 INK_BASE；每打完一局服务器认可的对局（开局领了票、打够了时间），当天再多认 INK_PER_MATCH；最多 INK_DAY_CAP。
// 只在控制台里改数的人一天最多多拿 INK_BASE；正常玩家打得越多额度越高。超出额度的先记着（单条不超过 INK_OWE_ONE 的才记，
// 最多记 INK_OWE_MAX），之后哪天额度有空余就补上，所以新手一天里领了好几样一次性奖励也不会丢。
const INK_BASE = 1500, INK_PER_MATCH = 80, INK_DAY_CAP = 6000;
const INK_OWE_ONE = 2500, INK_OWE_MAX = 4000;
const INK_IMPORT_CAP = 100000;   // 第一次建账：老存档里的墨锭最多认这么多
const REG_INK_CAP = 5000;        // 注册时带上来的游客 / 本机存档，墨锭最多认这么多
const INK_SPIKE = 50000;         // 一条上报超过这么多，记下来给管理员看（导入老账号也可能这样，所以不自动封）
const BODY_MAX = 300000;
const SKIN_RE = /^[a-z0-9_]{1,24}$/;
const BAN_MS = 24 * 3600e3;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, profile_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS econ (uid TEXT PRIMARY KEY, state_json TEXT NOT NULL, srv_json TEXT NOT NULL, ink INTEGER NOT NULL, ver INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS econ_nonce (uid TEXT NOT NULL, nonce TEXT NOT NULL, at INTEGER NOT NULL, res_json TEXT NOT NULL, PRIMARY KEY (uid, nonce))`,
  `CREATE TABLE IF NOT EXISTS econ_log (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, at INTEGER NOT NULL, act TEXT NOT NULL, ok INTEGER NOT NULL, ink0 INTEGER, ink1 INTEGER, detail TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_econ_log_uid ON econ_log (uid, at)`,
  `CREATE TABLE IF NOT EXISTS sanctions (uid TEXT PRIMARY KEY, strikes INTEGER NOT NULL DEFAULT 0, ban_until INTEGER NOT NULL DEFAULT 0, perm INTEGER NOT NULL DEFAULT 0, log_json TEXT NOT NULL DEFAULT '[]', at INTEGER NOT NULL DEFAULT 0, pardon INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL)`,
];
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) schemaReady = env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))).catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}

// SHA-256 password hash with salt
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + ':' + password + ':renying_sword_salt_2026');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Generate crypto-secure token
function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 服务器的随机数（开箱、终端机、掉落、斩数都用它，客户端碰不到）
function rnd() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0] * 2097152 + (a[1] >>> 11)) / 9007199254740992;
}

// 比较两个字符串，花的时间和内容无关（防止一位一位试出口令）
function sameStr(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

// Extract bearer token from Authorization header
function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

// Authenticate session from token
async function authenticate(env, request) {
  const token = getBearerToken(request);
  if (!token || token.length > 128) return null;
  const user = await env.DB.prepare(
    'SELECT u.id AS id, u.username AS username, u.profile_json AS profile_json FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
  ).bind(token, Date.now()).first();
  return user ? { token, user } : null;
}

async function readBody(request) {
  const txt = await request.text().catch(() => '');
  if (txt.length > BODY_MAX) return null;
  try { const v = JSON.parse(txt || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
}

/* ---------- 限速：同一个键在一段时间里最多几次 ---------- */
async function hit(env, k, limit, windowMs, now) {
  const r = await env.DB.prepare(
    'INSERT INTO rate (k, n, reset) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN rate.reset <= ?3 THEN 1 ELSE rate.n + 1 END, reset = CASE WHEN rate.reset <= ?3 THEN ?2 ELSE rate.reset END RETURNING n'
  ).bind(k, now + windowMs, now).first();
  return (r ? r.n : 1) <= limit;
}
async function peek(env, k, now) {
  const r = await env.DB.prepare('SELECT n, reset FROM rate WHERE k = ?').bind(k).first();
  return r && r.reset > now ? r.n : 0;
}
const clientIp = request => (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown').split(',')[0].trim().slice(0, 64);

/* ---------- 处罚：第一次警告，第二次封 1 天，第三次永久 ---------- */
async function sanctionOf(env, uid) {
  const r = await env.DB.prepare('SELECT strikes, ban_until, perm, log_json, at, pardon FROM sanctions WHERE uid = ?').bind(uid).first();
  let log = [];
  try { log = r ? JSON.parse(r.log_json) : []; } catch (e) {}
  return { strikes: r ? r.strikes : 0, banUntil: r ? r.ban_until : 0, perm: !!(r && r.perm), log: Array.isArray(log) ? log : [], at: r ? r.at : 0, pardon: r ? r.pardon : 0 };
}
const isBanned = (rec, now) => rec.perm || rec.banUntil > now;
async function banOf(env, uid, now) {
  const rec = await sanctionOf(env, uid);
  return isBanned(rec, now) ? rec : null;
}
function banned(rec) {
  return error(rec.perm ? '账号已被永久封禁，如有异议请联系作者' : '账号封禁中，解封后才能同步存档和交易', 403, { ban: { perm: rec.perm, banUntil: rec.banUntil, strikes: rec.strikes } });
}
async function strike(env, uid, reason, now, src) {
  const rec = await sanctionOf(env, uid);
  rec.strikes += 1; rec.at = now;
  rec.log = rec.log.concat({ r: String(reason).slice(0, 60), at: now, src }).slice(-20);
  if (rec.strikes === 2) rec.banUntil = Math.max(rec.banUntil, now + BAN_MS);
  if (rec.strikes >= 3) rec.perm = true;
  await env.DB.prepare(
    'INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0) ON CONFLICT(uid) DO UPDATE SET strikes = ?2, ban_until = ?3, perm = ?4, log_json = ?5, at = ?6'
  ).bind(uid, rec.strikes, rec.banUntil, rec.perm ? 1 : 0, JSON.stringify(rec.log), now).run();
  await logRow(env, uid, now, 'strike', 1, null, null, `${src}:${reason}`);
  return rec;
}

/* ---------- 流水账 ---------- */
function logStmt(env, uid, now, act, ok, ink0, ink1, detail) {
  return env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(uid, now, act, ok ? 1 : 0, ink0, ink1, String(detail || '').slice(0, 400));
}
function logRow(...a) { return logStmt(...a).run(); }

/* ---------- 存档 ---------- */
function parseProfile(txt, name) {
  let p = null;
  try { p = JSON.parse(txt); } catch (e) {}
  if (!p || typeof p !== 'object' || Array.isArray(p)) p = { name, ink: 100, owned: ['qingfeng'] };
  return p;
}
function cleanSkins(a) {
  return Array.isArray(a) ? Array.from(new Set(a.filter(k => typeof k === 'string' && SKIN_RE.test(k)))).slice(0, 300) : [];
}
function cleanEquip(e) {
  const o = {};
  if (e && typeof e === 'object' && !Array.isArray(e)) for (const [c, k] of Object.entries(e)) if (SKIN_RE.test(c) && typeof k === 'string' && (k === '' || SKIN_RE.test(k))) o[c] = k;
  return o;
}
const clampInk = (x, hi = 1e9) => Math.max(0, Math.min(hi, Math.floor(+x || 0)));
function srvBlank() { return { ap: {}, rv: {}, ed: 0, en: 0, ow: 0, gone: {} }; }
function parseObj(txt) { try { const v = JSON.parse(txt); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (e) { return null; } }

// 这个账号的武库和墨锭账本；第一次用时按老存档建账
async function loadEcon(env, uid, prof, now) {
  const sel = () => env.DB.prepare('SELECT state_json, srv_json, ink, ver FROM econ WHERE uid = ?').bind(uid).first();
  let row = await sel();
  if (!row) {
    const ink0 = clampInk(prof.ink), ink = Math.min(ink0, INK_IMPORT_CAP);
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES (?, ?, ?, ?, 0, ?)')
      .bind(uid, JSON.stringify(C.blank()), JSON.stringify(srvBlank()), ink, now).run();
    if (ins.meta && ins.meta.changes) await logRow(env, uid, now, 'open_account', 1, ink0, ink, ink < ink0 ? '老存档墨锭超过上限，按上限建账' : '');
    row = await sel();
  }
  const state = parseObj(row.state_json) || C.blank();
  return { state, stateJson: row.state_json, srv: Object.assign(srvBlank(), parseObj(row.srv_json) || {}), ink: row.ink, ver: row.ver };
}

// 能穿的皮肤：武库专属的只认库存里真有的；武库刚收走的，旧存档也加不回来
function mergeSkins(list, st, srv, ev) {
  const via = new Set(Array.isArray(st.via) ? st.via : []), out = [];
  for (const k of cleanSkins(list)) {
    if (C.CS_KEYS.includes(k) && !via.has(k)) continue;
    const g = srv.gone[k];
    if (g && !(ev >= g[0]) && !via.has(k)) continue;
    out.push(k);
  }
  for (const k of via) if (!out.includes(k)) out.push(k);
  return out;
}
function fixEquip(eq, skins) {
  const o = { ...eq };
  for (const [c, k] of Object.entries(o)) if (k && C.CS_KEYS.includes(k) && !skins.includes(k)) delete o[c];
  return o;
}
function overlay(prof, eco) {
  const p = { ...prof };
  delete p.armory; delete p.ledger;
  p.ink = eco.ink;
  p.skins = mergeSkins(p.skins, eco.state, eco.srv, eco.ver);
  p.equip = fixEquip(cleanEquip(p.equip), p.skins);
  return p;
}
// 给客户端的账本：服务器上的墨锭、版本号、最近记过的上报编号（客户端据此把已经记过的条目划掉）
function ledgerOut(eco, now) {
  const acks = Object.entries(eco.srv.ap).filter(([, v]) => now - v[0] < 3 * DAY_MS).sort((a, b) => b[1][0] - a[1][0]).slice(0, 200).map(([id]) => id);
  return { ink: eco.ink, ver: eco.ver, acks };
}
// 今天认多少本机收入：基础额度 + 今天服务器认可的对局数 × 每局额度
function inkAllow(eco, day) {
  const dm = eco.state && eco.state.dm, n = dm && dm.d === day ? Math.max(0, Math.min(C.MATCH_DAY_CAP, Math.floor(+dm.n || 0))) : 0;
  return Math.min(INK_DAY_CAP, INK_BASE + INK_PER_MATCH * n);
}
// 客户端本地赚的墨锭：每条只记一次，收入每天有额度，花掉的照扣。
// srv.ap 记着每条的 [到达时间, 认了多少收入, 其中先记着多少]；srv.rv 是“撤回”点名了、但还没到的收入编号
const LID = /^[0-9a-z]{8,32}$/;
function applyDeltas(eco, deltas, now) {
  const day = C.day(now), srv = eco.srv, allow = inkAllow(eco, day);
  if (srv.ed !== day) { srv.ed = day; srv.en = 0; }
  srv.ow = Math.max(0, Math.min(INK_OWE_MAX, Math.floor(+srv.ow || 0)));
  if (!srv.rv || typeof srv.rv !== 'object') srv.rv = {};
  let capped = 0, forged = 0, n = 0, paid = 0, revoked = 0;
  for (const x of deltas.slice(0, 80)) {
    if (!x || typeof x.id !== 'string' || !LID.test(x.id) || srv.ap[x.id]) continue;
    if (Array.isArray(x.r)) {   // 撤回（本机反作弊抓到凭空多出来的墨锭）：点名的几条收入作废。只能扣，不能退花销
      for (const rid of x.r.slice(0, 40)) {
        if (typeof rid !== 'string' || !LID.test(rid)) continue;
        const a = srv.ap[rid];
        if (!a) { srv.rv[rid] = now; continue; }   // 还没到：到了以后收入不记
        const g = Math.max(0, Math.floor(+a[1] || 0)), q = Math.max(0, Math.floor(+a[2] || 0));
        eco.ink = Math.max(0, eco.ink - g); srv.ow = Math.max(0, srv.ow - q); revoked += g;
        srv.ap[rid] = [a[0], 0, 0];
      }
      srv.ap[x.id] = [now, 0, 0]; n++;
      continue;
    }
    let d = Math.trunc(+x.d);
    if (!Number.isFinite(d)) d = 0;
    d = Math.max(-1e9, Math.min(1e9, d));
    if (d > 0 && srv.rv[x.id]) { delete srv.rv[x.id]; srv.ap[x.id] = [now, 0, 0]; n++; continue; }
    let q = 0;
    if (d > 0) {
      if (d > INK_SPIKE) forged = Math.max(forged, d);
      const g = Math.min(d, Math.max(0, allow - srv.en)), rest = d - g;
      srv.en += g;
      if (rest > 0) { capped += rest; if (d <= INK_OWE_ONE) { q = Math.min(rest, INK_OWE_MAX - srv.ow); srv.ow += q; } }
      d = g;
    }
    eco.ink = Math.max(0, eco.ink + d);
    srv.ap[x.id] = [now, Math.max(0, d), q];
    n++;
  }
  // 以前超出额度记下的：今天额度还有空余就补上，按先来后到记到各条名下（以后撤回这条时一起扣回）
  const pay = Math.min(srv.ow, Math.max(0, allow - srv.en));
  if (pay > 0) {
    srv.ow -= pay; srv.en += pay; eco.ink += pay; paid = pay;
    let left = pay;
    for (const [id, a] of Object.entries(srv.ap).filter(([, a]) => Array.isArray(a) && a[2] > 0).sort((x, y) => x[1][0] - y[1][0])) {
      if (left <= 0) break;
      const t = Math.min(a[2], left);
      srv.ap[id] = [a[0], a[1] + t, a[2] - t]; left -= t;
    }
  }
  const ids = Object.entries(srv.ap).filter(([, v]) => Array.isArray(v) && now - v[0] < 14 * DAY_MS).sort((a, b) => b[1][0] - a[1][0]).slice(0, 600);
  srv.ap = Object.fromEntries(ids);
  srv.rv = Object.fromEntries(Object.entries(srv.rv).filter(([, t]) => now - t < 14 * DAY_MS).sort((a, b) => a[1] - b[1]).slice(-200));
  return { capped, forged, n, paid, owed: srv.ow, allow, revoked };
}
function pruneGone(srv, now) {
  srv.gone = Object.fromEntries(Object.entries(srv.gone).filter(([, v]) => Array.isArray(v) && now - v[1] < 30 * DAY_MS).slice(-200));
}
// 一批写入里的每一条都带上“版本号还是读出来时那个”：中间被别的请求改过，这一批就什么都不写，重读再算
// guard 只给 INSERT … SELECT 用（语句里本来没有 WHERE）
const guard = (env, sql, binds, uid, ver) => env.DB.prepare(`${sql} WHERE EXISTS (SELECT 1 FROM econ WHERE uid = ? AND ver = ?)`).bind(...binds, uid, ver);
function userWrite(env, uid, prof, now, ver) {
  return env.DB.prepare('UPDATE users SET profile_json = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM econ WHERE uid = ? AND ver = ?)')
    .bind(JSON.stringify(prof), now, uid, uid, ver);
}
function econWrite(env, uid, ver, now, srv, ink, stateJson) {
  return env.DB.prepare('UPDATE econ SET state_json = ?, srv_json = ?, ink = ?, ver = ver + 1, updated_at = ? WHERE uid = ? AND ver = ?')
    .bind(stateJson, JSON.stringify(srv), ink, now, uid, ver);
}

/* ---------- 武库：所有动作都在服务器上算 ---------- */
const QUIET = ['sync', 'matchStart'];   // 太频繁的动作不进流水账（有成交的除外）
async function handleEcon(env, auth, body, now) {
  const uid = auth.user.id;
  const act = String(body.act || ''), nonce = String(body.nonce || '');
  const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? body.args : {};
  if (!C.ACTIONS.includes(act)) return error('不认识的操作');
  if (!/^[0-9a-f]{16,64}$/.test(nonce)) return error('请求格式不对');
  if (JSON.stringify(args).length > 4000) return error('请求太大', 413);
  const ban = await banOf(env, uid, now);
  if (ban) return banned(ban);
  if (!(await hit(env, 'econ:' + uid, 90, 60e3, now))) return error('操作太快了，歇一会儿再试', 429);
  if (!(await hit(env, 'econday:' + uid, 4000, DAY_MS, now))) return error('今天的操作次数用完了，明天再来', 429);
  const freshProfile = async () => {
    const r = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(uid).first();
    return parseProfile(r ? r.profile_json : '', auth.user.username);
  };
  // 同一个编号已经做过：直接把上次的结果给它（网络重试不会开两次箱）
  const seen = await env.DB.prepare('SELECT res_json FROM econ_nonce WHERE uid = ? AND nonce = ?').bind(uid, nonce).first();
  if (seen) {
    const eco = await loadEcon(env, uid, await freshProfile(), now);
    return json({ ok: true, ...JSON.parse(seen.res_json), state: C.publicState(C.normalize(eco.state, { now, uid })), ledger: ledgerOut(eco, now), replay: true });
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const prof = await freshProfile();
    const eco = await loadEcon(env, uid, prof, now);
    const skins0 = mergeSkins(prof.skins, eco.state, eco.srv, eco.ver);
    const E = { now, rnd, uid, ink: eco.ink, skins: skins0.slice(), equip: fixEquip(cleanEquip(prof.equip), skins0), server: true };
    const equip0 = { ...E.equip };
    const r = C.run(eco.state, act, args, E);
    const res = r.res || {}, st = r.state, stJson = JSON.stringify(st);
    const add = E.skins.filter(k => !skins0.includes(k)), del = skins0.filter(k => !E.skins.includes(k));
    const eq = {};
    for (const c of new Set([...Object.keys(equip0), ...Object.keys(E.equip)])) if (equip0[c] !== E.equip[c]) eq[c] = E.equip[c] === undefined ? null : E.equip[c];
    const out = { res, sold: r.sold || [] };
    // 最后一道保险：算出来的数不对劲（不是整数、是负数、大得离谱）就整个作废，记下来查
    const bad = [E.ink, st.tags, st.term, ...Object.values(st.cases), ...st.inv.map(x => x.st + 1)].find(v => !Number.isSafeInteger(v) || v < 0 || v > 1e12);   // 斩数 -1 是普通版
    if (bad !== undefined || st.inv.length > C.INV_MAX) {
      await logRow(env, uid, now, 'invariant', 0, eco.ink, null, JSON.stringify({ act, args, bad }).slice(0, 400));
      return error('操作失败，已记录', 500);
    }
    if (!out.sold.length && E.ink === eco.ink && stJson === eco.stateJson && !add.length && !del.length && !Object.keys(eq).length) {
      return json({ ok: true, ...out, state: C.publicState(st), ledger: ledgerOut(eco, now), skinsAdd: [], skinsDel: [], equip: {} });   // 什么都没变：不用写
    }
    const ver = eco.ver, srv = eco.srv;
    for (const k of del) srv.gone[k] = [ver + 1, now];
    for (const k of add) delete srv.gone[k];
    pruneGone(srv, now);
    const p = { ...prof, ink: E.ink, skins: E.skins, equip: E.equip, updatedAt: now };
    delete p.armory; delete p.ledger;
    const quiet = QUIET.includes(act) && !out.sold.length;
    const detail = JSON.stringify({ a: args, r: res.err ? res.err : res.item ? `${res.item.k}#${res.item.i}${res.item.st >= 0 ? ' st' : ''}` : res.gain || res.price || '', s: out.sold.length || undefined }).slice(0, 400);
    const stmts = [guard(env, 'INSERT INTO econ_nonce (uid, nonce, at, res_json) SELECT ?, ?, ?, ?', [uid, nonce, now, JSON.stringify(out)], uid, ver)];
    if (!quiet) stmts.push(guard(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, act, res.err ? 0 : 1, eco.ink, E.ink, detail], uid, ver));
    stmts.push(userWrite(env, uid, p, now, ver));
    stmts.push(econWrite(env, uid, ver, now, srv, E.ink, stJson));
    let results;
    try { results = await env.DB.batch(stmts); }
    catch (e) {
      const m = String(e && e.message || e);
      if (/econ_nonce/.test(m)) continue;   // 同一个编号的请求正好同时到：重来一遍会走上面“已经做过”
      throw e;
    }
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;   // 版本冲突：别的请求先改了，重读再算
    eco.ink = E.ink; eco.ver = ver + 1;
    return json({ ok: true, ...out, state: C.publicState(st), ledger: ledgerOut(eco, now), skinsAdd: add, skinsDel: del, equip: eq });
  }
  return error('服务器忙，请再试一次', 503);
}

/* ---------- 存档同步：墨锭走账本，皮肤以武库库存为准 ---------- */
async function handleProfilePost(env, auth, body, now) {
  const uid = auth.user.id;
  const ban = await banOf(env, uid, now);
  if (ban) return banned(ban);
  if (!(await hit(env, 'prof:' + uid, 40, 60e3, now))) return error('同步太频繁了，稍后自动重试', 429);
  const incoming = body.profile || body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return error('无效的存档数据');
  const ledger = body.ledger && typeof body.ledger === 'object' && Array.isArray(body.ledger.deltas) ? body.ledger : null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const urow = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(uid).first();
    const eco = await loadEcon(env, uid, parseProfile(urow ? urow.profile_json : '', auth.user.username), now);
    const ink0 = eco.ink, ver = eco.ver;
    const p = { ...incoming };
    delete p.armory; delete p.ledger;
    p.name = auth.user.username;
    p.updatedAt = now;
    // 老版本网页没有账本：拿它报的数和服务器上的差当作一条上报（一样有每日上限）
    const deltas = ledger ? ledger.deltas : [{ id: 'abs' + now.toString(36) + Math.floor(rnd() * 1e9).toString(36), d: clampInk(p.ink) - eco.ink }];
    const { capped, forged, paid, owed, allow, revoked } = applyDeltas(eco, deltas, now);
    p.ink = eco.ink;
    const sent = cleanSkins(p.skins), ev = ledger ? Math.floor(+ledger.ev) : -1;
    p.skins = mergeSkins(sent, eco.state, eco.srv, Number.isFinite(ev) ? ev : -1);
    p.equip = fixEquip(cleanEquip(p.equip), p.skins);
    const fix = { skinsAdd: p.skins.filter(k => !sent.includes(k)), skinsDel: sent.filter(k => !p.skins.includes(k)) };
    const stmts = [userWrite(env, uid, p, now, ver)];
    if (eco.ink !== ink0 || capped) stmts.push(guard(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, forged ? 'ink_spike' : 'ledger', 1, ink0, eco.ink, [capped ? `超过今天的额度 ${allow}，没认 ${capped}` : '', paid ? `补上以前记下的 ${paid}` : '', owed ? `还记着 ${owed}` : '', forged ? `一条上报 ${forged}` : '', revoked ? `反作弊撤回 ${revoked}` : ''].filter(Boolean).join('；')], uid, ver));
    stmts.push(econWrite(env, uid, ver, now, eco.srv, eco.ink, eco.stateJson));
    const results = await env.DB.batch(stmts);
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;
    eco.ver = ver + 1;
    return json({ ok: true, updatedAt: now, ledger: ledgerOut(eco, now), capped, owed, fix: fix.skinsAdd.length || fix.skinsDel.length ? fix : undefined });
  }
  return error('服务器忙，请稍后再试', 503);
}

// 注册时带上来的存档（游客进度、本机老账号）：墨锭有上限，武库专属皮肤不认
function cleanInitial(prof) {
  const p = { ...prof };
  delete p.armory; delete p.ledger;
  p.ink = Math.min(clampInk(p.ink), REG_INK_CAP);
  p.skins = cleanSkins(p.skins).filter(k => !C.CS_KEYS.includes(k));
  p.equip = fixEquip(cleanEquip(p.equip), p.skins);
  return p;
}
async function profileOut(env, user, now) {
  const prof = parseProfile(user.profile_json, user.username);
  const eco = await loadEcon(env, user.id, prof, now);
  return { profile: overlay(prof, eco), ledger: ledgerOut(eco, now) };
}

/* ---------- 管理接口（要 ADMIN_SECRET） ---------- */
async function handleAdmin(env, request, path, now) {
  if (!env.ADMIN_SECRET || !sameStr(getBearerToken(request) || '', env.ADMIN_SECRET)) return error('没有权限', 403);
  const url = new URL(request.url);
  if (path === '/api/admin/econ' && request.method === 'GET') {
    const uid = url.searchParams.get('uid') || '';
    const u = await env.DB.prepare('SELECT id, username FROM users WHERE id = ? OR username = ?').bind(uid, uid).first();
    if (!u) return error('没有这个账号', 404);
    const row = await env.DB.prepare('SELECT state_json, ink, ver, updated_at FROM econ WHERE uid = ?').bind(u.id).first();
    const log = await env.DB.prepare('SELECT at, act, ok, ink0, ink1, detail FROM econ_log WHERE uid = ? ORDER BY id DESC LIMIT 100').bind(u.id).all();
    return json({ ok: true, uid: u.id, username: u.username, econ: row ? { ink: row.ink, ver: row.ver, at: row.updated_at, state: parseObj(row.state_json) } : null, sanction: await sanctionOf(env, u.id), log: log.results || [] });
  }
  if (path === '/api/admin/pardon' && request.method === 'POST') {
    const body = await readBody(request) || {};
    const uid = String(body.uid || '');
    const u = await env.DB.prepare('SELECT id FROM users WHERE id = ? OR username = ?').bind(uid, uid).first();
    if (!u) return error('没有这个账号', 404);
    await env.DB.prepare("INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES (?1, 0, 0, 0, '[]', ?2, ?2) ON CONFLICT(uid) DO UPDATE SET strikes = 0, ban_until = 0, perm = 0, log_json = '[]', at = ?2, pardon = ?2").bind(u.id, now).run();
    await logRow(env, u.id, now, 'pardon', 1, null, null, String(body.note || '').slice(0, 100));
    return json({ ok: true, uid: u.id });
  }
  return error('Not found', 404);
}

async function cleanup(env, now) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM econ_nonce WHERE at < ?').bind(now - 2 * DAY_MS),
    env.DB.prepare('DELETE FROM rate WHERE reset < ?').bind(now - DAY_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ]);
}

export default {
  async fetch(request, env, ctx) {
    if (!env.DB) {
      return error('D1 Database binding "DB" is missing in Worker configuration.', 500);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const now = Date.now();

    try {
      // 1. Health & ping check
      if (path === '/' || path === '/health' || path === '/api/health') {
        return json({ ok: true, name: 'RenYing Cloud API', time: now, econ: C.VER });
      }

      await ensureSchema(env);
      if (Math.random() < 0.02) {
        const p = cleanup(env, now).catch(() => {});
        if (ctx && ctx.waitUntil) ctx.waitUntil(p);
      }
      const ip = clientIp(request);

      // 2. Register
      if (path === '/api/register' && request.method === 'POST') {
        if (!(await hit(env, 'reg:' + ip, 6, 3600e3, now))) return error('注册太频繁了，过一会儿再试', 429);
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (!username || username.length < 2) {
          return error('昵称至少需要 2 个字符');
        }
        if (username.length > 20) {
          return error('昵称不能超过 20 个字符');
        }
        if (!password || password.length < 6) {
          return error('密码至少需要 6 个字符');
        }
        if (password.length > 128) {
          return error('密码太长了');
        }

        // Check if user already exists
        const existing = await env.DB.prepare(
          'SELECT id FROM users WHERE username = ?'
        ).bind(username).first();

        if (existing) {
          return error('该昵称已被注册，请直接点击“登录”');
        }

        const userId = 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const salt = crypto.randomUUID().slice(0, 12);
        const passHash = await hashPassword(password, salt);

        // Default or initial guest profile
        const initialProf = cleanInitial((body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)) ? body.profile : {
          name: username,
          ink: 100,
          owned: ['qingfeng'],
          frags: {},
          pity: 0,
          spity: 0,
          skins: [],
          equip: {},
          netWins: 0,
          netLosses: 0,
          rating: 1100,
          placed: 0,
          stageStars: {},
          updatedAt: now
        });
        initialProf.name = username;
        initialProf.updatedAt = now;

        await env.DB.prepare(
          'INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(userId, username, passHash, salt, JSON.stringify(initialProf), now, now).run();

        // Generate session token (valid for 30 days)
        const token = generateToken();
        const expiresAt = now + 30 * 24 * 3600 * 1000;
        await env.DB.prepare(
          'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
        ).bind(token, userId, now, expiresAt).run();

        const out = await profileOut(env, { id: userId, username, profile_json: JSON.stringify(initialProf) }, now);
        return json({
          ok: true,
          uid: userId,
          username,
          token,
          profile: out.profile,
          ledger: out.ledger
        });
      }

      // 3. Login（同一个昵称 15 分钟内输错 8 次、同一个 IP 输错 40 次，就先锁 15 分钟）
      if (path === '/api/login' && request.method === 'POST') {
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (!username || !password) {
          return error('请输入昵称和密码');
        }
        const nameKey = 'lf:' + username.toLowerCase().slice(0, 40), ipKey = 'lfip:' + ip;
        if ((await peek(env, nameKey, now)) >= 8 || (await peek(env, ipKey, now)) >= 40) {
          return error('密码输错太多次了，请 15 分钟后再试', 429);
        }
        const fail = async () => { await hit(env, nameKey, 1e9, 15 * 60e3, now); await hit(env, ipKey, 1e9, 15 * 60e3, now); };

        const user = await env.DB.prepare(
          'SELECT id, username, password_hash, salt, profile_json FROM users WHERE username = ?'
        ).bind(username).first();

        if (!user) {
          await hit(env, ipKey, 1e9, 15 * 60e3, now);
          return error('未找到该账号，请先点击“注册”', 404);
        }

        const checkHash = await hashPassword(password, user.salt);
        if (!sameStr(checkHash, user.password_hash)) {
          await fail();
          return error('昵称或密码不对', 401);
        }
        await env.DB.prepare('DELETE FROM rate WHERE k = ?').bind(nameKey).run();

        const token = generateToken();
        const expiresAt = now + 30 * 24 * 3600 * 1000;

        await env.DB.prepare(
          'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
        ).bind(token, user.id, now, expiresAt).run();

        const out = await profileOut(env, user, now);
        return json({
          ok: true,
          uid: user.id,
          username: user.username,
          token,
          profile: out.profile,
          ledger: out.ledger
        });
      }

      // 4. Get Profile
      if (path === '/api/profile' && request.method === 'GET') {
        const auth = await authenticate(env, request);
        if (!auth) {
          return error('未登录或登录已过期，请重新登录', 401);
        }
        const out = await profileOut(env, auth.user, now);
        return json({
          ok: true,
          uid: auth.user.id,
          username: auth.user.username,
          profile: out.profile,
          ledger: out.ledger
        });
      }

      // 5. Update Profile (Sync)
      if (path === '/api/profile' && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) {
          return error('未登录或登录已过期，请重新登录', 401);
        }
        const body = await readBody(request);
        if (!body) return error('存档太大', 413);
        return await handleProfilePost(env, auth, body, now);
      }

      // 6. 武库：开箱、买卖、汰换……
      if (path === '/api/econ' && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) return error('未登录或登录已过期，请重新登录', 401);
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await handleEcon(env, auth, body, now);
      }

      // 7. 反作弊记录：客户端查自己的处罚；客户端抓到作弊时上报（只能往上加，10 分钟最多记一次）
      if (path === '/api/ac') {
        const auth = await authenticate(env, request);
        if (!auth) return error('未登录或登录已过期，请重新登录', 401);
        if (request.method === 'GET') return json({ ok: true, rec: await sanctionOf(env, auth.user.id), now });
        if (request.method === 'POST') {
          const body = await readBody(request) || {};
          const rec = await sanctionOf(env, auth.user.id);
          if (now - rec.at < 10 * 60e3) return json({ ok: true, rec, now });
          return json({ ok: true, rec: await strike(env, auth.user.id, String(body.reason || '客户端检测到作弊').slice(0, 60), now, 'client'), now });
        }
      }

      if (path.startsWith('/api/admin/')) return await handleAdmin(env, request, path, now);

      // 8. Logout
      if (path === '/api/logout' && request.method === 'POST') {
        const token = getBearerToken(request);
        if (token) {
          await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        }
        return json({ ok: true });
      }

      return error('Not found', 404);
    } catch (err) {
      console.error('Worker error:', err);
      return error('服务器内部错误', 500);
    }
  }
};
