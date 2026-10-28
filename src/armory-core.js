/* =====================================================================
   刃影武库 · 规则核心
   ---------------------------------------------------------------------
   浏览器（src/armory.js）和云端（cloudflare/worker.js）共用这一份规则：
   收藏品和武器箱、品质与概率、开箱次数、斩数、终端机、商店（武器箱和终端机按固定价格卖）、
   玩家市场（只有玩家之间买卖饰品，价格由玩家自己定）、汰换合同、对局掉落、每周补给、江湖行动。
   这里不碰页面，只改传进来的存档对象 s，所以同一份代码在服务器上跑出来的结果和本机一模一样。
   连上新版云端时，开箱、买卖、汰换都由服务器算（随机数也在服务器上取），本机只负责显示。
   玩家市场的挂单放在服务器的 mkt 表里：挂单、购买、撤单时服务器把那一单交给这里（env.mkt），
   这里定下来要怎么改（env.mkt.out），服务器再和存档一起原子地写进去。
   所有数据表都冻结了，控制台改不动概率和价格。
   ===================================================================== */
(function (G) {
  'use strict';
  const C = {};
  C.VER = 4;                                   // 4：市场只剩玩家之间买卖，武器箱和终端机改成商店固定价格（3：爆率调高，加神兵武器箱，改成限制每天开几个；2：去掉磨损和玉珏，加终端机）
  C.DAY0 = 20748;                              // 北京时间 2026-10-22，第一个行动季第一天
  C.SEASON_DAYS = 32;
  C.INV_MAX = 1000000000, C.LIST_MAX = 20, C.HIST_MAX = 40;
  C.MKT_DAYS = 14;   // 挂单默认挂几天：过期没卖出去的自动撤回，饰品回到卖家库存（管理员可以在线改 mktDays）
  C.FEE = 0.15;                                // 玩家市场成交扣的手续费（墨锭从这里流出去，免得越攒越多）
  C.PRICE_MAX = 999999;                        // 挂单标价 1 ~ 999999 墨锭，多少由玩家自己定，系统不定价、也不收购
  C.OPEN_DAY = 5;                              // 普通武器箱每天最多开 5 个（北京时间零点刷新）
  C.PREM_DAY = 3;                              // 神兵武器箱每天最多开 3 个（北京时间零点刷新），不占普通武器箱每天那 5 个
  C.PREM_WEEK = 3;                             // 兼容别名
  C.ZOD_WEEK = 1;                              // 星座武器箱也是每周 1 个，和神兵的分开算；每个号送 1 个
  C.DROP_P = 0.15, C.DROP_CAP = 4, C.SUPPLY_GAMES = 5;
  C.MATCH_MIN_MS = 20000, C.MATCH_MAX_MS = 45 * 60000, C.MATCH_GAP_MS = 15000, C.MATCH_DAY_CAP = 60;
  C.KO_MAX = 12;                               // 一局最多记 12 斩（三人车轮战也够了）
  C.HERO_IDS = ['qingfeng', 'feiying', 'tieshan', 'lingshuang', 'liuyun', 'leiming', 'moyu', 'yuehua', 'yanling', 'yuxiao', 'zuixian', 'gouchen', 'lingque'];
  C.MODES = ['cpu', 'net', '2v2', 'tower', 'chaos', 'tag3', 'mayhem'];
  C.LEVELS = ['easy', 'normal', 'hard', 'impossible', 'god'];

  // 品质：从低到高五档，每档有自己的颜色和名字
  C.TIERS = ['mil', 'res', 'cla', 'cov', 'gold'];
  C.TIER = {
    mil: { n: '军规级', c: '75,105,255' },
    res: { n: '受限', c: '136,71,255' },
    cla: { n: '保密', c: '211,44,230' },
    cov: { n: '隐秘', c: '235,75,75' },
    gold: { n: '★ 非凡', c: '228,174,57' },
  };
  C.ODDS = { mil: 0.53, res: 0.27, cla: 0.13, cov: 0.052, gold: 0.018 };   // 普通武器箱；神兵武器箱的写在它自己那一项里
  C.ST_P = 0.2;                                // 开出斩数版（记击倒数）的概率
  C.BASE = { mil: 30, res: 90, cla: 300, cov: 900, gold: 3200 };   // 每档的基准价（墨锭）：只用来定终端机的报价
  // 终端机：开封后一次给你看一件、报一个价，买下就用掉；不要就换下一件，最多看 5 件，
  // 5 件都不要终端机也没了；开封 3 天不处理就作废。终端机在商店按固定价格 price 卖（不能转卖），
  // 报价是这一件基准价的 1.2~1.5 倍（按品质、热门程度、斩数定，不跟玩家市场走）
  C.TERM = { offers: 5, days: 3, odds: { mil: 0.45, res: 0.3, cla: 0.15, cov: 0.08, gold: 0.02 }, markup: [1.2, 1.5], price: 500 };

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
  // 武库专属的整套皮肤：五款 ★ 非凡（青锋行那款是游戏里原有的，放在江湖武器箱），后面七款只在神兵武器箱里出
  C.FULL = {
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
    // ---------- 神兵武器箱 ----------
    ls_tianhe: { char: 'lingshuang', name: '天河',
      look: { body: '#1c2146', shade: '#0c0f26', scarf: '#a9c2ff', slash: '170,190,255', blade: '#f6f8ff', outline: '#d6e0ff', outlineA: 0.85 },
      deco: { head: 'valkyrie', gem: '#ffd6f4', robe: 'starry', breastplate: '#262c64', shoulder: '#323a80', back: 'galaxy', trail: 'spark', aura: 'aurora', weapStyle: 'tianhe_spear' },
      fx: { th: 'nebula', c: '165,185,255', c2: '255,150,225' },
      scene: { sky: ['#03030d', '#0a0b26', '#1e1a50', '#0a0a24'], orb: 'galaxy', orbC: '170,180,255', mist: '170,160,255', mtn: ['#14143a', '#0a0a24'], bam: ['#06061a', '#030310'], wx: 'twinkle', wxC: '225,220,255', hit: 'swirl', hitC: '190,170,255', stars: 1, rays: true } },
    fy_huandie: { char: 'feiying', name: '幻蝶',
      look: { body: '#22163a', shade: '#100a1e', scarf: '#c08cff', slash: '190,150,255', blade: '#f6ecff', outline: '#8ff4ff', outlineA: 0.75 },
      deco: { head: 'foxmask', hideBaseHead: true, mask: '#8ff4ff', robe: 'spirit', shoulder: '#3a2468', back: 'butterflywings', cape: '#1c1238', trail: 'snow', aura: 'aurora', weapStyle: 'butterfly_daggers' },
      fx: { th: 'butterfly', c: '185,140,255', c2: '120,240,255', part: 'butterfly' },
      scene: { sky: ['#07040f', '#160c2a', '#2e1a4e', '#120a22'], orb: 'moon', orbC: '225,210,255', mist: '180,150,255', mtn: ['#1e1238', '#120a24'], bam: ['#0c0618', '#06030e'], wx: 'petal', wxC: '200,170,255', hit: 'swirl', hitC: '160,230,255', stars: 0.7, rays: true } },
    ts_liuli: { char: 'tieshan', name: '琉璃',
      look: { body: '#c4e6f2', shade: '#6ea6bf', scarf: '#ff9ad5', slash: '170,240,255', blade: '#f4feff', outline: '#16323f', outlineA: 1 },
      deco: { head: 'taotiehelm', hideBaseHead: true, helmC: '#9fd4e6', crest: '#ff9ad5', shoulder: '#7fbcd2', breastplate: '#a8d8ea', robe: 'heavy', back: 'crystals', trail: 'snow', aura: 'snow', weapStyle: 'crystal_greatsword' },
      fx: { th: 'crystal', c: '170,240,255', c2: '255,170,230' },
      scene: { sky: ['#041018', '#0a2230', '#16405a', '#0a1c28'], orb: 'moon', orbC: '220,248,255', mist: '160,230,255', mtn: ['#123448', '#0a2232'], bam: ['#06141e', '#030c12'], wx: 'snow', wxC: '230,250,255', hit: 'hexagon', hitC: '170,240,255', stars: 0.5, rays: true } },
    yx_tianlai: { char: 'yuxiao', name: '天籁',
      look: { body: '#fbf6e8', shade: '#c9b88a', scarf: '#ffcf6a', slash: '255,220,140', blade: '#fff8e6', outline: '#3a2a10', outlineA: 1 },
      deco: { head: 'starguan', robe: 'celestial', breastplate: '#c9a24e', back: 'notering', trail: 'gold', aura: 'gold', weapStyle: 'tianlai_flute' },
      fx: { th: 'note', c: '255,212,120', c2: '255,248,225', part: 'note' },
      scene: { sky: ['#140c06', '#3a2410', '#86602c', '#2e1c0a'], orb: 'sun', orbC: '255,226,150', mist: '255,215,140', mtn: ['#3a2812', '#24180a'], bam: ['#160e06', '#0e0804'], wx: 'gold', wxC: '255,225,150', hit: 'sunburst', hitC: '255,215,120', stars: 0.2, rays: true } },
    my_qinglv: { char: 'moyu', name: '青绿',
      look: { body: '#e6efe2', shade: '#7f9c86', scarf: '#1f8a76', slash: '70,200,170', blade: '#163c40', outline: '#0e2a2a', outlineA: 1 },
      deco: { head: 'bamboohat', hatC: '#2a6a5a', robe: 'jade_master', breastplate: '#2a6a5a', back: 'scroll', trail: 'ink', inkC: '30,120,110', weapStyle: 'jade_brush' },
      fx: { th: 'ink', c: '70,200,170', c2: '16,60,64' },
      scene: { sky: ['#06120f', '#0f2a26', '#2a5a4c', '#10261f'], orb: 'moon', orbC: '220,250,235', mist: '120,210,180', mtn: ['#1a4a40', '#0e2e28'], bam: ['#0a1c16', '#06120e'], wx: 'ink', wxC: '40,140,120', hit: 'enso', hitC: '70,200,170', stars: 0.2 } },
    yl_kongque: { char: 'yanling', name: '孔雀',
      look: { body: '#e8f6f2', shade: '#76a8a0', scarf: '#14a88c', slash: '60,215,185', blade: '#eafffa', outline: '#0a2a26', outlineA: 1 },
      deco: { head: 'plume', plumeC: ['#14a88c', '#e8c040'], robe: 'phoenix', breastplate: '#0e6a5c', cape: '#0c5a50', back: 'peacock', trail: 'feather', featherC: '60,215,185', weapStyle: 'peacock_feather' },
      fx: { th: 'feather', c: '60,215,185', c2: '235,195,70', part: 'feather' },
      scene: { sky: ['#04120f', '#0a2a24', '#145448', '#0a2620'], orb: 'moon', orbC: '220,255,240', mist: '100,220,190', mtn: ['#0e3a32', '#082420'], bam: ['#061a16', '#03100c'], wx: 'feather', wxC: '120,230,200', hit: 'feathers', hitC: '60,215,185', stars: 0.3 } },
    ly_jinli: { char: 'liuyun', name: '锦鲤',
      look: { body: '#fff6ee', shade: '#d4ab94', scarf: '#ff5a3a', slash: '255,140,110', blade: '#fff4ee', outline: '#2a1208', outlineA: 1 },
      deco: { head: 'veilhat', hatC: '#d8483a', veilC: 'rgba(255,170,140,0.38)', robe: 'dusk', cape: '#e0603a', back: 'koi', trail: 'cloud', weapStyle: 'koi_fan' },
      fx: { th: 'water', c: '255,125,95', c2: '255,232,205', part: 'koi' },
      scene: { sky: ['#0a1018', '#14283a', '#2a5470', '#12283a'], orb: 'moon', orbC: '255,236,220', mist: '170,210,235', mtn: ['#16304a', '#0e2032'], bam: ['#0a1624', '#060e18'], wx: 'petal', wxC: '255,170,150', hit: 'ripple', hitC: '255,150,120', stars: 0.3 } },
  };
  // 星座武器箱：十二星座，每个侠客三款，保密「星辉」、隐秘「星焰」、非凡「星冕」各一款，一共 36 款（皮肤本身在后面按这张表生成）
  // [代号, 名字, 主色, 浅色, 深色, 夜色, 点缀色]
  C.ZODIAC = [
    ['ari', '白羊', '#ff5a3c', '#ffe8e0', '#5c1810', '#1c0604', '#ffc24a'],
    ['tau', '金牛', '#3cc98a', '#e4f7ec', '#14503a', '#05180f', '#f4b8a0'],
    ['gem', '双子', '#7ad8ff', '#eef9ff', '#1c3e5e', '#070f1e', '#ffe27a'],
    ['can', '巨蟹', '#aebcff', '#f4f6ff', '#2a3462', '#090c22', '#9ff0ff'],
    ['leo', '狮子', '#ffb22a', '#fff3d8', '#6a3a08', '#1e1004', '#ff6a2a'],
    ['vir', '处女', '#e8d47c', '#fcf9ec', '#4a5a2a', '#11160a', '#b8f0c4'],
    ['lib', '天秤', '#ff8ac8', '#fff0f8', '#5c2448', '#1a0a16', '#ffe2a0'],
    ['sco', '天蝎', '#ff3a5a', '#fbe2e8', '#420c1e', '#10030a', '#b070ff'],
    ['sag', '射手', '#b46eff', '#f3eaff', '#3a1a6a', '#0e0620', '#ff9a5a'],
    ['cap', '摩羯', '#4ac0b4', '#e4f4f2', '#1a3c3c', '#061212', '#e0c48a'],
    ['aqu', '水瓶', '#3aa8ff', '#e6f4ff', '#0e3060', '#040c1e', '#8affea'],
    ['pis', '双鱼', '#5ae0d0', '#e8fbf8', '#144a50', '#051618', '#c8a0ff'],
  ];
  C.ZOD_TIERS = [['cla', '星辉'], ['cov', '星焰'], ['gold', '星冕']];
  // 每个侠客分到的三个星座 [保密, 隐秘, 非凡]：每一档里十二星座正好各一款
  C.ZOD_OF = { qf: ['pis', 'sag', 'leo'], fy: ['tau', 'aqu', 'sco'], ts: ['cap', 'leo', 'tau'], ls: ['gem', 'sco', 'sag'], ly: ['vir', 'pis', 'lib'], lm: ['leo', 'cap', 'ari'],
    my: ['aqu', 'lib', 'vir'], yh: ['lib', 'vir', 'can'], yl: ['sag', 'ari', 'gem'], yx: ['can', 'gem', 'pis'], zx: ['sco', 'can', 'aqu'], gc: ['ari', 'tau', 'cap'] };
  const zodKeys = i => Object.entries(C.ZOD_OF).map(([p, z]) => `${p}_z${z[i]}`);
  // 八个武器箱，各是一套收藏品：游戏里原有的 35 款皮肤和武库的 72 款全在里面，每款只在一个箱子里。
  // 前六个是普通武器箱（爆率 C.ODDS），神兵、星座武器箱只出保密、隐秘、非凡三档，价钱也高，各自每周限开几个。price 是商店的固定价格。
  // 这两种的 ok 是爆率在在线数值里的键前缀，lim 是每周能开几个的键，cnt 是存档里记这周开了几个的地方
  C.COLS = {
    c1: { name: '初刃', price: 280, emblem: '刃', col: '200,70,60',
      mil: ['qf_p1', 'ts_p1', 'lm_p1', 'fy_p1'], res: ['qf_frost', 'ts_bronze', 'ly_dusk'], cla: ['ts_obsidian', 'ly_sky'], cov: ['qf_gold', 'fy_blood'], gold: ['gc_wolf'] },
    c2: { name: '霜华', price: 270, emblem: '霜', col: '90,160,230',
      mil: ['ls_p1', 'yh_p1', 'my_p1', 'gc_p1'], res: ['ls_plum', 'yh_sakura'], cla: ['yh_eclipse', 'my_gold'], cov: ['ls_aurora', 'yh_solstice'], gold: ['zx_moon'] },
    c3: { name: '名剑', price: 260, emblem: '剑', col: '220,170,70',
      mil: ['yx_p1', 'zx_p1', 'qf_p2', 'ts_p2'], res: ['yx_snow', 'zx_amber'], cla: ['yx_celestial', 'yl_phoenix'], cov: ['qf_abyss', 'zx_immortal'], gold: ['qf_renying'] },
    c4: { name: '江湖', price: 250, emblem: '行', col: '90,200,150',
      mil: ['lm_p2', 'fy_p2', 'ly_p2', 'yh_p2'], res: ['ly_bamboo', 'yl_raven', 'lq_silk'], cla: ['fy_phantom'], cov: ['my_celestial', 'ts_crimson'], gold: ['qf_qfx'] },
    c5: { name: '惊雷', price: 280, emblem: '雷', col: '150,100,240',
      mil: ['ly_p1', 'yl_p2', 'my_p2', 'gc_p2'], res: ['lm_violet', 'my_cinnabar'], cla: ['lm_asura', 'lq_sparrow'], cov: ['ly_fox', 'ls_dragon'], gold: ['lm_jiuxiao'] },
    c6: { name: '寒月', price: 240, emblem: '月', col: '110,200,215',
      mil: ['yl_p1', 'ls_p2', 'yx_p2', 'zx_p2'], res: ['fy_jade', 'gc_crimson'], cla: ['lm_sun'], cov: ['gc_underworld', 'yl_blizzard'], gold: ['yh_guanghan'] },
    c7: { name: '神兵', price: 1000, emblem: '神', col: '240,190,80', prem: true, daily: true, ok: 'prem.', lim: 'premDay', cnt: 'pd', odds: { mil: 0, res: 0, cla: 0.7, cov: 0.22, gold: 0.08 },   // 隐秘 + 非凡一共 30%
      mil: [], res: [], cla: ['my_qinglv', 'yl_kongque', 'ly_jinli'], cov: ['ts_liuli', 'yx_tianlai'], gold: ['ls_tianhe', 'fy_huandie'] },
    c8: { name: '星座', price: 1500, emblem: '星', col: '170,150,255', prem: true, ok: 'zod.', lim: 'zodWeek', cnt: 'zw', odds: { mil: 0, res: 0, cla: 0.65, cov: 0.28, gold: 0.07 },
      mil: [], res: [], cla: zodKeys(0), cov: zodKeys(1), gold: zodKeys(2) },
  };
  C.CASES = Object.keys(C.COLS);
  C.REG = C.CASES.filter(c => !C.COLS[c].prem);   // 普通武器箱：对局掉落、补给、星章送的都是这几种
  // 爆率：cfg 是服务器上管理员改过的经济数值（见下面的 C.CFG_INFO），不传就是上面写死的
  C.oddsOf = (cid, cfg) => {
    if (!cfg) return C.COLS[cid].odds || C.ODDS;
    const p = C.COLS[cid].prem && C.COLS[cid].ok;
    if (p) return { mil: 0, res: 0, cla: C.cv(cfg, p + 'cla'), cov: C.cv(cfg, p + 'cov'), gold: C.cv(cfg, p + 'gold') };
    return Object.fromEntries(C.TIERS.map(t => [t, C.cv(cfg, 'odds.' + t)]));
  };
  C.UP = { mil: 'res', res: 'cla', cla: 'cov', cov: 'gold' };
  C.NEED = { mil: 10, res: 10, cla: 10, cov: 10 };

  // 商店：改名标签（墨锭，每周限量）；武器箱和终端机按固定价格不限量（见 A.buyCase / A.buyTerm）
  C.STORE = [{ id: 'tag', name: '改名标签', give: ['tags', 1], cost: 400, lim: 2 }];
  // 江湖行动：每周四个任务（四组里各抽一个），完成得星章。
  // 市场的两个（sell / buy）不再抽到：玩家市场人少的时候不一定做得完；已经抽到的这周照样能做（g: 9 不在 0~3 里）
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
    sell: { g: 9, n: 1, star: 1, t: '在玩家市场卖出 {n} 件饰品' },
    buy: { g: 9, n: 1, star: 1, t: '在玩家市场买入 {n} 件饰品' },
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

  /* ---------- 在线可调的经济数值 ---------- */
  // 管理员在服务器上改（cloudflare/worker.js 的 /api/admin/cfg），没改的项用上面写死的默认值。
  // 服务器每次算的时候把改过的那几项放进 env.cfg，网页显示用服务器发来的同一份。
  // 每一行：[键, 默认值, 最小, 最大, 是不是整数, 分组, 说明]
  C.CFG_INFO = [
    ...Object.keys(C.COLS).map(c => ['price.' + c, C.COLS[c].price, 1, 100000, 1, '商店价格', C.COLS[c].name + '武器箱']),
    ['price.term', C.TERM.price, 1, 100000, 1, '商店价格', '终端机'],
    ['openDay', C.OPEN_DAY, 0, 50, 1, '开箱', '普通武器箱每天能开几个'],
    ['premDay', C.PREM_DAY, 0, 50, 1, '开箱', '神兵武器箱每天能开几个'],
    ['premWeek', C.PREM_WEEK, 0, 20, 1, '开箱', '神兵武器箱每周能开几个（旧）'],
    ['zodWeek', C.ZOD_WEEK, 0, 20, 1, '开箱', '星座武器箱每周能开几个'],
    ['stP', C.ST_P, 0, 1, 0, '开箱', '开出斩数版的概率'],
    ...C.TIERS.map(t => ['odds.' + t, C.ODDS[t], 0, 1, 0, '普通武器箱爆率', C.TIER[t].n]),
    ...C.CASES.filter(c => C.COLS[c].prem).flatMap(c => ['cla', 'cov', 'gold'].map(t => [C.COLS[c].ok + t, C.COLS[c].odds[t], 0, 1, 0, C.COLS[c].name + '武器箱爆率', C.TIER[t].n])),
    ['fee', C.FEE, 0, 0.5, 0, '玩家市场', '成交手续费（0.15 就是 15%）'],
    ['mktDays', C.MKT_DAYS, 1, 90, 1, '玩家市场', '挂单几天没卖出就自动撤回'],
    ['term.lo', C.TERM.markup[0], 0.5, 5, 0, '终端机', '报价最低是基准价的几倍'],
    ['term.hi', C.TERM.markup[1], 0.5, 5, 0, '终端机', '报价最高是基准价的几倍'],
    ['dropP', C.DROP_P, 0, 1, 0, '对局掉落', '每局掉一件的概率'],
    ['dropCap', C.DROP_CAP, 0, 100, 1, '对局掉落', '每周最多掉几次'],
    ['ink.base', 1500, 0, 100000, 1, '每天认多少本机收入', '每天先认多少墨锭'],
    ['ink.match', 80, 0, 10000, 1, '每天认多少本机收入', '每打完一局，当天多认多少'],
    ['ink.cap', 6000, 0, 1000000, 1, '每天认多少本机收入', '一天最多认多少'],
  ];
  C.CFG_DEF = Object.fromEntries(C.CFG_INFO.map(r => [r[0], r[1]]));
  C.cv = (cfg, k) => { const v = cfg && typeof cfg === 'object' ? own(cfg, k) : undefined; if (v !== undefined) return v; if (k === 'premDay' && cfg && typeof cfg === 'object' && own(cfg, 'premWeek') !== undefined) return own(cfg, 'premWeek'); return C.CFG_DEF[k]; };
  // 检查一份配置：只认表里有的键，数要在范围里（整数项要是整数），同一组爆率加起来要正好是 1，终端机报价的最低倍数不能高过最高倍数。
  // 和默认值一样的项、填 null 或空的项都不存（就是回到默认值）。不对时 cfg 是 null，err 写明是哪一项
  C.cleanCfg = raw => {
    const cfg = {}, info = Object.fromEntries(C.CFG_INFO.map(r => [r[0], r]));
    if (!isObj(raw)) return { cfg, err: '' };
    for (const [k, v] of Object.entries(raw)) {
      const r = own(info, k);
      if (!r) return { cfg: null, err: `不认识的数值：${k}` };
      if (v === null || v === undefined || v === '') continue;
      const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN;
      if (!Number.isFinite(x)) return { cfg: null, err: `${r[6]}（${k}）要填数字` };
      if (r[4] && !Number.isInteger(x)) return { cfg: null, err: `${r[6]}（${k}）要填整数` };
      if (x < r[2] || x > r[3]) return { cfg: null, err: `${r[6]}（${k}）要在 ${r[2]} 到 ${r[3]} 之间` };
      if (x !== r[1]) cfg[k] = x;
    }
    for (const [p, name] of [['odds.', '普通武器箱'], ...C.CASES.filter(c => C.COLS[c].prem).map(c => [C.COLS[c].ok, C.COLS[c].name + '武器箱'])]) {
      const sum = C.CFG_INFO.filter(r => r[0].startsWith(p)).reduce((a, r) => a + C.cv(cfg, r[0]), 0);
      if (Math.abs(sum - 1) > 1e-6) return { cfg: null, err: `${name}的几档爆率加起来要正好是 1（现在是 ${+sum.toFixed(6)}）` };
    }
    if (C.cv(cfg, 'term.lo') > C.cv(cfg, 'term.hi')) return { cfg: null, err: '终端机报价的最低倍数不能高过最高倍数' };
    return { cfg, err: '' };
  };

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
  C.isPrem = k => C.isItem(k) && !!C.COLS[C.ITEM[k].col].prem;
  C.ofTierReg = t => C.ofTier(t).filter(k => !C.isPrem(k));   // 普通武器箱里的：星章兑换只从这些里出，神兵、星座武器箱的靠开箱、市场、终端机、汰换
  const PREFIX = { qf: 'qingfeng', fy: 'feiying', ts: 'tieshan', ls: 'lingshuang', ly: 'liuyun', lm: 'leiming', my: 'moyu', yh: 'yuehua', yl: 'yanling', yx: 'yuxiao', zx: 'zuixian', gc: 'gouchen', lq: 'lingque' };
  C.charOf = k => own(PREFIX, String(k).split('_')[0]) || '';

  // 星座武器箱的 36 款：按 C.ZODIAC 的配色和 C.ZOD_OF 的分配生成。
  // 背后一枚星座星图（deco.sign 是哪个星座，zt 是第几档：保密只有星图，隐秘加一圈星环，非凡是转动的星盘），头上星冠，非凡的兵器上还有星光（zw）
  const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgbS = h => hexRGB(h).join(',');
  const mixH = (a, b, t) => '#' + hexRGB(a).map((v, i) => Math.round(v + (hexRGB(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
  const GOLD = '#ffd36a';
  const zodSkin = (pre, z, ti) => {
    const [code, name, m, lt, dk, nt, ac] = z, char = PREFIX[pre], tier = C.ZOD_TIERS[ti][0];
    const sky = (a, b) => [nt, mixH(nt, dk, a), mixH(dk, m, b), mixH(nt, dk, a * 0.8)];
    const sign = { sign: code, zt: ti + 1, zc: rgbS(m), zc2: rgbS(ti === 2 ? GOLD : ac) };
    const base = { char, name: `${name}·${C.ZOD_TIERS[ti][1]}` }, ws = pre === 'gc' ? { weapStyle: 'zod_' + code } : {};   // 勾陈的流星锤按星座换颜色（HAMMER_LOOK）
    if (tier === 'cla') return { ...base,
      look: { body: lt, shade: mixH(lt, m, 0.45), scarf: m, slash: rgbS(mixH(m, '#ffffff', 0.25)), blade: mixH(lt, '#ffffff', 0.5), metal: mixH(m, '#ffffff', 0.35), haft: dk, outline: nt, outlineA: 1 },
      deco: { head: 'circlet', gem: m, robe: 'starry', robeC: mixH(m, dk, 0.55), back: 'zodiac', ...sign, trail: 'star', ...ws },
      fx: { th: 'star', c: rgbS(m), c2: rgbS(ac) },
      scene: { sky: sky(0.5, 0.25), orb: 'moon', orbC: rgbS(lt), mist: rgbS(m), mtn: [mixH(nt, dk, 0.7), mixH(nt, dk, 0.4)], bam: [mixH(nt, dk, 0.3), nt], wx: 'twinkle', wxC: rgbS(lt), hit: 'starburst', hitC: rgbS(m), stars: 0.7 } };
    if (tier === 'cov') return { ...base,
      look: { body: dk, shade: mixH(dk, nt, 0.6), scarf: m, slash: rgbS(m), blade: lt, metal: m, haft: nt, outline: mixH(m, '#ffffff', 0.2), outlineA: 0.85 },
      deco: { head: 'startiara', tiaraC: ac, gem: m, robe: 'starry', robeC: mixH(dk, nt, 0.3), breastplate: m, shoulder: mixH(dk, m, 0.35), cape: mixH(dk, nt, 0.4), back: 'zodiac', ...sign, trail: 'star', aura: 'aurora', ...ws },
      fx: { th: 'nebula', c: rgbS(m), c2: rgbS(ac), part: 'twinkle' },
      scene: { sky: sky(0.7, 0.4), orb: 'moon', orbC: rgbS(mixH(lt, m, 0.3)), mist: rgbS(m), mtn: [mixH(nt, dk, 0.75), mixH(nt, dk, 0.45)], bam: [mixH(nt, dk, 0.3), nt], wx: 'twinkle', wxC: rgbS(mixH(lt, m, 0.3)), hit: 'swirl', hitC: rgbS(m), stars: 0.9, rays: true } };
    return { ...base,
      look: { body: mixH(nt, dk, 0.55), shade: nt, scarf: GOLD, slash: rgbS(mixH(m, GOLD, 0.35)), blade: '#fffbea', metal: GOLD, haft: mixH(dk, '#3a2a10', 0.5), outline: mixH(GOLD, '#ffffff', 0.25), outlineA: 0.9 },
      deco: { head: 'startiara', tiaraC: GOLD, gem: m, robe: 'celestial', robeC: mixH(dk, nt, 0.2), breastplate: '#d8aa4a', shoulder: mixH(dk, GOLD, 0.35), cape: mixH(nt, dk, 0.6), back: 'zodiac', ...sign, orbs: mixH(m, '#ffffff', 0.3), zw: 1, trail: 'gold', aura: 'gold', ...ws },
      fx: { th: 'nebula', c: rgbS(m), c2: rgbS(GOLD), part: 'twinkle' },
      scene: { sky: sky(0.85, 0.55), orb: 'galaxy', orbC: rgbS(mixH(m, '#ffffff', 0.4)), mist: rgbS(m), mtn: [mixH(nt, dk, 0.8), mixH(nt, dk, 0.5)], bam: [mixH(nt, dk, 0.35), nt], wx: 'gold', wxC: rgbS(GOLD), hit: 'sunburst', hitC: rgbS(GOLD), stars: 1, rays: true } };
  };
  for (const [pre, zs] of Object.entries(C.ZOD_OF)) zs.forEach((code, ti) => { C.FULL[`${pre}_z${code}`] = zodSkin(pre, C.ZODIAC.find(z => z[0] === code), ti); });

  /* ---------- 价格 ---------- */
  // 系统只给自己卖的东西定价：武器箱、终端机（商店固定价格）和终端机报的那一件。
  // 饰品在玩家市场上卖多少钱全由玩家定，系统不定价、不收购，所以也没有“市场价”。
  C.ST_MUL = t => t === 'gold' ? 1.4 : 1.75;   // 终端机报斩数版时贵多少
  C.refVal = it => {   // 一件饰品的基准价：只用来定终端机的报价
    const d = C.ITEM[it.k]; if (!d) return 0;
    return Math.max(2, Math.round(C.BASE[d.tier] * d.mul * (it.st >= 0 ? C.ST_MUL(d.tier) : 1)));
  };
  C.GOODS = [...C.CASES, 'term'];              // 武器箱和终端机：只在商店卖，不能挂到市场
  C.isGood = k => C.GOODS.includes(k);
  C.shopPrice = (k, cfg) => k === 'term' ? C.cv(cfg, 'price.term') : own(C.COLS, k) ? C.cv(cfg, 'price.' + k) : 0;
  C.net = (p, cfg) => Math.floor(p * (1 - C.cv(cfg, 'fee')));    // 挂单卖掉，卖家到手多少
  const LID_RE = /^[0-9a-f]{16}$/;
  C.isLid = l => typeof l === 'string' && LID_RE.test(l);   // 挂单编号：服务器随机给的 16 位

  /* ---------- 存档 ---------- */
  C.blank = () => ({
    v: C.VER, tags: 0, term: 0, tm: null, nid: 1, inv: [], cases: Object.fromEntries(C.CASES.map(c => [c, 0])), via: [], eq: {},
    lst: [], hist: [], od: { d: 0, n: 0 }, pd: { d: 0, n: 0 }, pw: { w: 0, n: 0 }, zw: { w: 0, n: 0 }, zf: 0, drop: { w: 0, g: 0, n: 0, sup: 0 },
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
  // 第 1 版的存档也这样读：磨损、图案模板、玉珏、充值记录这些字段直接丢掉，没用完的钥匙一把换一台终端机，饰品和武器箱照旧。
  // 第 2 版的“本周买了几个箱子”也丢掉（现在不限买，限的是每天开几个）。
  // 第 3 版以前挂着的单是卖给系统的（系统按时间成交）：换成第 4 版时全部撤下，饰品、武器箱、终端机退回来
  C.normalize = (s, env) => {
    if (!isObj(s)) s = C.blank();
    const oldKeys = s.v === 1 ? int(s.keys, 0, 50) : 0, oldLst = !(+s.v >= 4);
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
    if (oldLst) {   // 旧版的挂单：退回库存
      for (const L of s.lst.slice(0, 200)) {
        if (!isObj(L)) continue;
        if (L.g === 'term') s.term++;
        else if (L.g !== undefined) { if (own(C.COLS, L.g)) s.cases[L.g]++; }
        else { const it = cleanItem(L.it); if (it && !seen.has(it.i)) { seen.add(it.i); s.inv.push(it); } }
      }
      s.lst = [];
    }
    s.lst = s.lst.map(L => {   // 挂在玩家市场上的饰品：编号是服务器给的，和 mkt 表里的那一单对应
      if (!isObj(L) || !C.isLid(L.l)) return null;
      const it = cleanItem(L.it);
      if (!it || seen.has(it.i)) return null;
      seen.add(it.i);
      return { l: L.l, it: { ...it, n: '' }, price: int(L.price, 1, C.PRICE_MAX), t: num(L.t) };
    }).filter(Boolean).slice(0, C.LIST_MAX);
    let top = 0;
    for (const x of s.inv) top = Math.max(top, x.i);
    for (const L of s.lst) top = Math.max(top, L.it.i);
    s.nid = Math.max(int(s.nid, 1), top + 1);
    s.via = Array.from(new Set(s.via.filter(k => C.isItem(k))));
    s.eq = Object.fromEntries(Object.entries(s.eq).filter(([c, id]) => C.HERO_IDS.includes(c) && s.inv.some(x => x.i === id && C.charOf(x.k) === c)));
    s.hist = s.hist.filter(isObj).slice(0, C.HIST_MAX).map(h => ({ t: num(h.t), kind: ['buy', 'sell', 'sold', 'term'].includes(h.kind) ? h.kind : 'sell',
      ...(C.isGood(h.g) || C.CASES.includes(h.c) ? { g: C.isGood(h.g) ? h.g : h.c, n: int(h.n, 0, 1e6) } : { k: C.isItem(h.k) ? h.k : 'qf_p1', st: stOf(h.st) }),   // 第 2 版的箱子记录写在 c 里
      price: int(h.price, 0, 1e9), ...(h.gain !== undefined ? { gain: int(h.gain, 0, 1e9) } : {}) }));
    s.cc = Array.from(new Set(s.cc.filter(c => own(C.COLS, c))));
    s.buys = Object.fromEntries(Object.entries(s.buys).filter(([id, v]) => C.STORE.some(g => g.id === id) && isObj(v)).map(([id, v]) => [id, { k: str(v.k, 12), n: int(v.n, 0, 1e6) }]));
    s.stat = Object.fromEntries(Object.keys(b.stat).map(k => [k, int(s.stat[k])]));
    s.tk = isObj(s.tk) && C.MODES.includes(s.tk.mode) ? { t0: num(s.tk.t0), mode: s.tk.mode } : null;
    s.last = num(s.last); s.gift = s.gift ? 1 : 0;
    s.od = { d: int(s.od.d), n: int(s.od.n, 0, 1000) };   // 每天、每周能开几个可以在线改，这里只防乱填
    s.pd = isObj(s.pd) ? { d: int(s.pd.d), n: int(s.pd.n, 0, 1000) } : { d: 0, n: 0 };
    s.pw = { w: int(s.pw.w), n: int(s.pw.n, 0, 1000) };
    s.zw = { w: int(s.zw.w), n: int(s.zw.n, 0, 1000) };
    if (!s.zf) s.cases.c8++;   // 每个号送 1 个星座武器箱（只送一次，老号第一次读到这一版的时候送）
    s.zf = 1;
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
    if (s.od.d !== day) s.od = { d: day, n: 0 };
    if (s.pd.d !== day) s.pd = { d: day, n: 0 };
    if (s.pw.w !== wk) s.pw = { w: wk, n: 0 };
    if (s.zw.w !== wk) s.zw = { w: wk, n: 0 };
    if (s.drop.w !== wk) s.drop = { w: wk, g: 0, n: 0, sup: 0 };
    if (s.op.s !== se.id) s.op = { s: se.id, earned: 0, spent: 0, w: 0, ms: [], prog: {}, done: [] };
    if (s.op.w !== wk) Object.assign(s.op, { w: wk, ms: C.genMissions(env.uid, wk), prog: {}, done: [] });
    if (s.dm.d !== day) s.dm = { d: day, n: 0 };
    if (s.tm && !(now - s.tm.t0 < C.TERM.days * 86400e3)) s.tm = null;   // 开封超过 3 天：作废
    return s;
  };
  // 给玩家看的那份：开局领的票只有服务器知道
  C.publicState = s => { const o = JSON.parse(JSON.stringify(s)); delete o.tk; return o; };
  // 只在武库里出的皮肤（24 款涂装、5 款 ★、神兵武器箱的 7 款和星座武器箱的 36 款）：服务器只认库存里真有的
  C.CS_KEYS = [...C.PAINTS.map(p => p[0]), ...Object.keys(C.FULL)];
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
    const opts = [{ t: 'case', c: pick(C.REG) }, { t: 'term', n: 1 }, r() < 0.3 ? { t: 'item', k: pick(C.ofTier('res')) } : { t: 'item', k: pick(C.ofTier('mil')) }, r() < 0.5 ? { t: 'ink', n: 400 } : { t: 'tag', n: 1 }];
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return opts;
  };
  // 今天还能开几个普通武器箱、今天/这周还能开几个神兵（星座）武器箱
  C.openLeft = (s, cid, cfg) => { const col = cid && own(C.COLS, cid); return col && col.prem ? Math.max(0, C.cv(cfg, col.lim) - ((s[col.cnt] && s[col.cnt].n) || 0)) : Math.max(0, C.cv(cfg, 'openDay') - s.od.n); };

  /* ---------- 物品进出库存 ---------- */
  C.mkItem = (s, k, src, rnd, o = {}) => {
    const st = o.st !== undefined ? o.st : (rnd() < (o.stP !== undefined ? o.stP : C.ST_P) ? 0 : -1);
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
  const rollTier = (rnd, odds) => {   // 概率是 0 的档跳过；浮点误差落到最后时，给最后一档有概率的
    let r = rnd(), acc = 0, last = 'mil';
    for (const t of C.TIERS) { if (!(odds[t] > 0)) continue; last = t; acc += odds[t]; if (r < acc) return t; }
    return last;
  };
  const pickOf = (rnd, a) => a[Math.floor(rnd() * a.length)];
  C.invFull = (s, n = 1) => false;
  // 终端机报的价：随机一档品质、这一档里随机一件，五分之一是斩数版；价格是这一件基准价的 1.2~1.5 倍
  C.termOffer = (rnd, cfg) => {
    const k = pickOf(rnd, C.ofTier(rollTier(rnd, C.TERM.odds))), st = rnd() < C.cv(cfg, 'stP') ? 0 : -1;
    const lo = C.cv(cfg, 'term.lo'), m = lo + rnd() * (C.cv(cfg, 'term.hi') - lo);
    return { k, st, price: Math.max(1, Math.round(C.refVal({ k, st }) * m)) };
  };
  // 汰换合同能出什么：每件材料平分它所在收藏品里高一档的那些饰品
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
  // 找出库存中的所有重复饰品，保留最高斩数/当前穿着，返回待出售列表与总墨锭估值
  C.dupePlan = s => {
    if (!isObj(s) || !Array.isArray(s.inv)) return { items: [], totalGain: 0, byKey: {} };
    const groups = new Map();
    for (const it of s.inv) {
      if (!it || !it.k) continue;
      if (!groups.has(it.k)) groups.set(it.k, []);
      groups.get(it.k).push(it);
    }
    const toSell = [], byKey = {};
    let totalGain = 0;
    for (const [k, list] of groups.entries()) {
      if (list.length <= 1) continue;
      const sorted = list.slice().sort((a, b) => {
        const stA = a.st >= 0 ? a.st : -1, stB = b.st >= 0 ? b.st : -1;
        if (stB !== stA) return stB - stA;
        const eqA = s.eq && s.eq[C.charOf(a.k)] === a.i ? 1 : 0;
        const eqB = s.eq && s.eq[C.charOf(b.k)] === b.i ? 1 : 0;
        if (eqB !== eqA) return eqB - eqA;
        return b.i - a.i;
      });
      const kept = sorted[0], dupes = sorted.slice(1);
      byKey[k] = { kept, dupes };
      for (const it of dupes) {
        const val = C.refVal(it);
        toSell.push({ ...it, val });
        totalGain += val;
      }
    }
    return { items: toSell, totalGain, byKey };
  };

  /* ---------- 动作 ---------- */
  // env：now 现在时间、rnd 随机数、uid、ink 墨锭（会被改）、skins 可穿的皮肤（会被改）、equip 穿着（会被改）、server 是不是服务器在算、
  //      cfg 管理员在线改过的经济数值（没有就用默认值）
  const A = {};
  A.open = (s, a, env) => {   // 开箱：不用钥匙，开一个少一个。普通武器箱每天最多开 5 个，神兵武器箱每天 3 个，星座武器箱每周 1 个
    const cid = a.c;
    if (!C.CASES.includes(cid)) return { err: '没有这个武器箱' };
    if ((s.cases[cid] || 0) < 1) return { err: '没有这个武器箱了' };
    const col = C.COLS[cid];
    if (!C.openLeft(s, cid, env.cfg)) {
      const n = C.cv(env.cfg, col.prem ? col.lim : 'openDay');
      return { err: !n ? `${col.prem ? col.name : '普通'}武器箱现在暂停开启` : (col.daily || !col.prem) ? `今天的 ${n} 个${col.prem ? col.name : ''}武器箱已经开完了，明天再来` : `${col.name}武器箱每周只能开 ${n} 个，下周一再来` };
    }
    if (C.invFull(s)) return { err: `库存满了（最多 ${C.INV_MAX} 件），先卖掉一些` };
    s.cases[cid]--; s.stat.open++;
    if (col.prem) (s[col.cnt] || (s[col.cnt] = { d: C.day(env.now), n: 0 })).n++; else s.od.n++;
    const tier = rollTier(env.rnd, C.oddsOf(cid, env.cfg)), k = pickOf(env.rnd, col[tier]);
    const it = C.addItem(s, C.mkItem(s, k, 'case', env.rnd, { stP: C.cv(env.cfg, 'stP') }), env);
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
  // 商店：武器箱、终端机按固定价格买，不限量（限的是每天开几个）；买来的不能转卖
  const shopBuy = (s, k, a, env) => {
    const n = a.n === undefined ? 1 : +a.n;
    if (!(Number.isInteger(n) && n >= 1 && n <= 10)) return { err: '数量不对' };
    const p = C.shopPrice(k, env.cfg) * n;
    if (!(p > 0)) return { err: '没有这件商品' };
    if (env.ink < p) return { err: `墨锭不够，要 ${p}` };
    giveInk(env, -p);
    if (k === 'term') s.term += n; else s.cases[k] += n;
    histPush(s, { t: env.now, kind: 'buy', g: k, n, price: p });
    return { ok: true, price: p, n };
  };
  A.buyCase = (s, a, env) => C.CASES.includes(a.c) ? shopBuy(s, a.c, a, env) : { err: '没有这个武器箱' };
  A.buyTerm = (s, a, env) => shopBuy(s, 'term', a, env);
  // 玩家市场：只有饰品，只有玩家之间买卖，标价自己定。挂单、购买、撤单都要服务器（env.mkt）：
  // 服务器把这次要用的挂单编号（id）或者那一单现在的样子（row）交进来，这里决定要怎么改（out），服务器原子地写
  const NO_MKT = '玩家市场要登录云端账号、连上服务器才能用';
  A.list = (s, a, env) => {
    const m = env.mkt;
    if (!m || !C.isLid(m.id)) return { err: NO_MKT };
    if (a.c !== undefined) return { err: '武器箱和终端机只在商店按固定价格卖，不能挂到市场' };
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
    if (Math.max(s.lst.length, m.open | 0) >= C.LIST_MAX) return { err: `最多同时挂 ${C.LIST_MAX} 件` };   // m.open：服务器 mkt 表里这个号还在卖的单数，存档里的对不上也按多的算
    const price = +a.price;
    if (!(Number.isInteger(price) && price >= 1 && price <= C.PRICE_MAX)) return { err: `标价要是 1 到 ${C.PRICE_MAX} 之间的整数` };
    C.dropItem(s, it.i, env);
    const L = { l: m.id, it: { ...it, n: '' }, price, t: env.now };   // 名字标签不跟着卖出去
    s.lst.push(L);
    m.out = { list: L };
    return { ok: true, l: L.l, price };
  };
  A.buy = (s, a, env) => {   // 买别的玩家挂的一件
    const m = env.mkt, r = m && m.row;
    if (!m) return { err: NO_MKT };
    if (!r || r.id !== a.l) return { err: '没有这件挂单，刷新看看' };
    if (r.state !== 0) return { err: r.state === 1 ? '这件已经被别人买走了' : '这件已经撤下了' };
    if (r.seller === env.uid) return { err: '这是你自己挂的，要拿回来就撤下' };
    if (r.expired) return { err: '这件挂单已经到期撤下了，刷新看看' };
    if (a.price !== undefined && +a.price !== r.price) return { err: '标价变了，刷新看看' };
    const it0 = cleanItem(r.item);
    if (!it0 || it0.k !== r.k) return { err: '这件挂单坏了' };
    if (C.invFull(s)) return { err: '库存满了' };
    if (env.ink < r.price) return { err: `墨锭不够，要 ${r.price}` };
    giveInk(env, -r.price);
    const it = C.addItem(s, { i: s.nid++, k: it0.k, st: it0.st, n: '', t: env.now, src: 'market' }, env);   // 斩数跟着走
    histPush(s, { t: env.now, kind: 'buy', k: it.k, st: it.st, price: r.price });
    s.stat.bought++;
    bump(s, 'buy', 1);
    m.out = { buy: r.id };
    return { ok: true, item: it, price: r.price };
  };
  A.cancel = (s, a, env) => {   // 撤下自己挂的：饰品放回库存
    const m = env.mkt;
    const ix = s.lst.findIndex(x => x.l === a.l); if (ix < 0) return { err: '没有这个挂单，可能已经卖掉了' };
    if (!m) return { err: NO_MKT };
    const r = m.row && m.row.id === a.l ? m.row : null;
    if (r && r.state === 1) return { err: '这件刚被买走了，钱马上到账' };
    if (C.invFull(s)) return { err: '库存满了，放不回去' };
    const L = s.lst.splice(ix, 1)[0];
    C.addItem(s, L.it, env);
    if (r && r.state === 0) m.out = { cancel: L.l };   // 市场上找不到这一单（没人能买到它）就只把东西放回来
    return { ok: true };
  };
  // 卖掉的挂单结账：服务器把“别的玩家已经买走、还没给钱”的单放在 env.paid 里，这里给钱（扣手续费）。
  // 每次动作之前都先结一遍；结过的编号记在 env.settled，服务器在同一批写入里把它们标成已付
  C.settle = (s, env) => {
    const sold = [];
    env.settled = [];
    for (const r of Array.isArray(env.paid) ? env.paid.slice(0, 40) : []) {
      if (!isObj(r) || !C.isLid(r.id) || env.settled.includes(r.id)) continue;
      const ix = s.lst.findIndex(L => L.l === r.id), L = ix >= 0 ? s.lst.splice(ix, 1)[0] : null;
      const price = int(r.price, 1, C.PRICE_MAX), gain = C.net(price, env.cfg), k = L ? L.it.k : C.isItem(r.k) ? r.k : 'qf_p1', st = L ? L.it.st : stOf(r.st);
      giveInk(env, gain); s.stat.sold++;
      histPush(s, { t: num(r.at) || env.now, kind: 'sold', k, st, price, gain });
      sold.push({ k, st, price, gain });
      env.settled.push(r.id);
      bump(s, 'sell', 1);
    }
    return sold;
  };
  // 撤回的挂单退回库存：服务器把“存档里还挂着、市场上已经不在卖”（到期撤回、被撤下，或者那一单已经清理掉了）的编号放在 env.back。
  // 已经卖掉的单不会在这里（卖掉的走上面的结账）。退回的记在 env.returned，服务器在流水里记下
  C.unlist = (s, env) => {
    const out = [];
    for (const id of Array.isArray(env.back) ? env.back.slice(0, C.LIST_MAX * 2) : []) {
      const ix = s.lst.findIndex(L => L.l === id); if (ix < 0) continue;
      const L = s.lst.splice(ix, 1)[0];
      C.addItem(s, L.it, env);
      out.push({ l: L.l, i: L.it.i, k: L.it.k, st: L.it.st });
    }
    env.returned = out;
    return out;
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
  A.sellDupes = (s, a, env) => {   // 自动出售所有重复饰品，保留最高斩数/穿着那一件
    const plan = C.dupePlan(s);
    if (!plan.items.length) return { err: '库存里没有重复的饰品' };
    const sold = [];
    for (const d of plan.items) {
      const it = C.dropItem(s, d.i, env);
      if (!it) continue;
      const val = C.refVal(it);
      giveInk(env, val);
      s.stat.sold++;
      histPush(s, { t: env.now, kind: 'sell', k: it.k, st: it.st, price: val, gain: val });
      sold.push({ i: it.i, k: it.k, st: it.st, val });
      bump(s, 'sell', 1);
    }
    return { ok: true, count: sold.length, totalGain: plan.totalGain, sold };
  };
  A.listDupes = (s, a, env) => {   // 一键自动挂牌市场：保留最高斩数/穿着那一件，其余挂牌出售
    const m = env.mkt;
    if (!m || (!C.isLid(m.id) && !Array.isArray(m.ids))) return { err: NO_MKT };
    const plan = C.dupePlan(s);
    if (!plan.items.length) return { err: '库存里没有重复的饰品' };
    const freeSlots = Math.max(0, C.LIST_MAX - Math.max(s.lst.length, m.open | 0));
    if (freeSlots <= 0) return { err: `市场挂单已满（最多 ${C.LIST_MAX} 件），请先撤回或等待售出` };
    const toList = plan.items.slice(0, freeSlots);
    const listed = [];
    const ids = Array.isArray(m.ids) ? m.ids.slice() : [m.id];
    for (let idx = 0; idx < toList.length; idx++) {
      const d = toList[idx];
      const it = C.dropItem(s, d.i, env);
      if (!it) continue;
      const lid = ids[idx] || (C.isLid(m.id) && idx === 0 ? m.id : null);
      if (!lid || !C.isLid(lid)) continue;
      const price = Math.max(1, Math.min(C.PRICE_MAX, +d.price || C.refVal(it)));
      const L = { l: lid, it: { ...it, n: '' }, price, t: env.now };
      s.lst.push(L);
      listed.push(L);
    }
    if (!listed.length) return { err: '未能成功挂牌任何饰品' };
    if (listed.length === 1) m.out = { list: listed[0] };
    else m.out = { lists: listed };
    return { ok: true, count: listed.length, totalListed: listed.length, skipped: plan.items.length - listed.length, listings: listed };
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
    s.tm = { t0: env.now, n: 1, o: C.termOffer(env.rnd, env.cfg) };
    return { ok: true, tm: s.tm };
  };
  A.termNext = (s, a, env) => {
    if (!s.tm) return { err: '没有开着的终端机' };
    if (a.n !== undefined && +a.n !== s.tm.n) return { err: '这一件已经换掉了，刷新看看' };   // 点得太快、请求重发：不会一下跳过两件
    if (s.tm.n >= C.TERM.offers) { s.tm = null; return { ok: true, gone: true }; }
    s.tm.n++; s.tm.o = C.termOffer(env.rnd, env.cfg);
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
      else if (o.t === 'item') got.push({ t: 'item', item: C.addItem(s, C.mkItem(s, o.k, 'supply', env.rnd, { stP: C.cv(env.cfg, 'stP') }), env) });
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
    else if (g.id === 'case') { const c = pickOf(r, C.REG); s.cases[c]++; res.c = c; }
    else if (g.id === 'tag') s.tags++;
    else if (g.id === 'term') s.term++;
    else {
      if (C.invFull(s)) return { err: '库存满了' };
      let k;
      if (g.id === 'cov') { if (!(C.isItem(a.k) && C.ITEM[a.k].tier === 'cov' && !C.isPrem(a.k))) return { err: '要从普通武器箱的隐秘级里挑一件' }; k = a.k; }
      else k = pickOf(r, C.ofTierReg(g.id));
      res.item = C.addItem(s, C.mkItem(s, k, 'op', r, { stP: C.cv(env.cfg, 'stP') }), env);
    }
    s.op.spent += g.cost;
    return res;
  };
  // 集齐一套收藏品的 4 款军规级：送这个武器箱一个和一张改名标签
  A.collect = (s, a, env) => {
    const col = own(C.COLS, a.c); if (!col || !col.mil.length) return { err: '没有这套收藏品' };
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
    if (s.drop.n < C.cv(env.cfg, 'dropCap') && env.rnd() < C.cv(env.cfg, 'dropP') && !C.invFull(s)) {
      s.drop.n++;
      if (env.rnd() < 0.3) { const cid = pickOf(env.rnd, C.REG); s.cases[cid]++; res.drop = { t: 'case', c: cid }; }
      else res.drop = { t: 'item', item: C.addItem(s, C.mkItem(s, pickOf(env.rnd, C.ofTier(env.rnd() < 0.85 ? 'mil' : 'res')), 'drop', env.rnd, { stP: C.cv(env.cfg, 'stP') }), env) };
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
  // 兑换码：码在服务器上核对，里面的东西在跑这一步之前就放进存档了；本机存档没有服务器，领不了
  A.claimCode = (s, a, env) => env.server ? { ok: true } : { err: '礼包兑换码要连上服务器才能领' };
  A.gift = (s, a, env) => {   // 第一次进武库：送一个初刃武器箱和一台终端机
    if (s.gift) return { err: '已经领过了' };
    s.gift = 1; s.cases.c1++; s.term++;
    return { ok: true };
  };
  C.ACTIONS = Object.keys(A);
  // 跑一个动作：先整理存档、结掉卖出去的挂单、把撤回的挂单退回库存，再做动作。出错时存档原样不动（先在副本上做）
  C.run = (state, name, args, env) => {
    if (!own(A, name)) return { res: { err: '不认识的操作' }, state };
    const s = C.normalize(JSON.parse(JSON.stringify(state || C.blank())), env);
    const ink0 = env.ink, skins0 = env.skins.slice(), equip0 = JSON.parse(JSON.stringify(env.equip));
    const sold = C.settle(s, env), back = C.unlist(s, env);
    let res;
    try { res = A[name](s, args || {}, env); } catch (e) { res = { err: '操作失败' }; }
    if (!res || res.err) {   // 失败了：动作本身改的全部撤回，只留下结算挂单的结果
      const s2 = C.normalize(JSON.parse(JSON.stringify(state || C.blank())), env);
      env.ink = ink0; env.skins.length = 0; env.skins.push(...skins0);
      Object.keys(env.equip).forEach(k => delete env.equip[k]); Object.assign(env.equip, equip0);
      env.inkGain = 0;
      if (env.mkt) env.mkt.out = null;
      const sold2 = C.settle(s2, env), back2 = C.unlist(s2, env);
      return { res: res || { err: '操作失败' }, state: s2, sold: sold2, back: back2 };
    }
    return { res, state: s, sold, back };
  };

  // 冻结所有数据表：控制台里改概率、价格、收藏品都没用
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
  deepFreeze(C);
  if (!G.ArmoryCore) Object.defineProperty(G, 'ArmoryCore', { value: C, writable: false, configurable: false, enumerable: false });
})(typeof globalThis !== 'undefined' ? globalThis : this);
