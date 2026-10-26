// 由 python3 tools/build.py 生成，不要直接改：改 cloudflare/worker.js、cloudflare/admin.html 和 src/armory-core.js 再重新生成。
/**
 * 刃影 Cloudflare Worker：云端账号、存档同步、武库经济、反作弊
 *
 * 部署：wrangler.toml 的 main 是 worker.bundle.js，由 python3 tools/build.py 生成（本文件 + src/armory-core.js
 *       拼成一个文件，在 Cloudflare 网页编辑器里整段粘贴也能用）。要绑定 D1 数据库 DB，表会自动建好。
 * 环境变量（Workers → Settings → Variables，选 Secret；不设也能跑，只是用不了管理接口）：
 *   ADMIN_SECRET      管理口令：管理网页（这个 Worker 的 /admin）和 node tools/econ-admin.mjs 都用它。
 *                     可以只写一个口令，也可以写成「名字:口令」、几个人用逗号隔开（比如 even:口令1,lnt:口令2），
 *                     这样流水里记得下是谁做的。口令用 openssl rand -hex 24 这种随机生成的长串，少于 16 位的不认
 *
 * 管理后台（/api/admin/*，要管理口令）：查账号和流水、加减墨锭、发或收武器箱 / 终端机 / 改名标签 / 饰品、封号解封、
 *   全服补偿（玩家下次动武库时自动领）、在线改经济数值（价格、爆率、每天能开几个、手续费、掉落、每天认多少本机收入）。
 *   每一笔都要写原因，记进 econ_log（全服的操作记在 uid = '*' 名下）。没有“dev 账号”这种特殊昵称：开发者也是普通账号
 *
 * 防作弊（和钱有关的都在服务器上算，客户端只负责显示）：
 *   武库：开箱、终端机、商店、汰换、掉落、补给、星章都在这里用服务器的随机数和时钟算。
 *         存档带版本号，同时到的两个请求只有一个能改成（另一个重读再算，防双花）；每个请求带一次性编号，网络重试
 *         不会重复执行；对局奖励要开局领票、打够时间、每天有上限。
 *   玩家市场：只有玩家之间买卖饰品（mkt 表），标价玩家自己定。买、撤同一单时，先把那一单从“在卖”改掉，
 *         同一批写入里的其他语句都要看到这一改才生效：同时买同一件只有一个人买到，买和撤撞上只成一个。
 *         卖家的钱等卖家下次动武库时结（和卖家的存档一起写，只结一次）。
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
  C.FEE = 0.15;                                // 玩家市场成交扣的手续费（墨锭从这里流出去，免得越攒越多）
  C.PRICE_MAX = 999999;                        // 挂单标价 1 ~ 999999 墨锭，多少由玩家自己定，系统不定价、也不收购
  C.OPEN_DAY = 2;                            // 普通武器箱每天最多开 2 个（北京时间零点刷新）
  C.PREM_WEEK = 1;                             // 神兵武器箱每周最多开 1 个（周一刷新），不占每天那 2 个
  C.ZOD_WEEK = 1;                              // 星座武器箱也是每周 1 个，和神兵的分开算；每个号送 1 个
  C.DROP_P = 0.15, C.DROP_CAP = 4, C.SUPPLY_GAMES = 5;
  C.MATCH_MIN_MS = 20000, C.MATCH_MAX_MS = 45 * 60000, C.MATCH_GAP_MS = 15000, C.MATCH_DAY_CAP = 60;
  C.KO_MAX = 12;                               // 一局最多记 12 斩（三人车轮战也够了）
  C.HERO_IDS = ['qingfeng', 'feiying', 'tieshan', 'lingshuang', 'liuyun', 'leiming', 'moyu', 'yuehua', 'yanling', 'yuxiao', 'zuixian', 'gouchen'];
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
      mil: ['lm_p2', 'fy_p2', 'ly_p2', 'yh_p2'], res: ['ly_bamboo', 'yl_raven'], cla: ['fy_phantom'], cov: ['my_celestial', 'ts_crimson'], gold: ['qf_qfx'] },
    c5: { name: '惊雷', price: 280, emblem: '雷', col: '150,100,240',
      mil: ['ly_p1', 'yl_p2', 'my_p2', 'gc_p2'], res: ['lm_violet', 'my_cinnabar'], cla: ['lm_asura'], cov: ['ly_fox', 'ls_dragon'], gold: ['lm_jiuxiao'] },
    c6: { name: '寒月', price: 240, emblem: '月', col: '110,200,215',
      mil: ['yl_p1', 'ls_p2', 'yx_p2', 'zx_p2'], res: ['fy_jade', 'gc_crimson'], cla: ['lm_sun'], cov: ['gc_underworld', 'yl_blizzard'], gold: ['yh_guanghan'] },
    c7: { name: '神兵', price: 1000, emblem: '神', col: '240,190,80', prem: true, ok: 'prem.', lim: 'premWeek', cnt: 'pw', odds: { mil: 0, res: 0, cla: 0.7, cov: 0.22, gold: 0.08 },   // 隐秘 + 非凡一共 30%
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
    ['premWeek', C.PREM_WEEK, 0, 20, 1, '开箱', '神兵武器箱每周能开几个'],
    ['zodWeek', C.ZOD_WEEK, 0, 20, 1, '开箱', '星座武器箱每周能开几个'],
    ['stP', C.ST_P, 0, 1, 0, '开箱', '开出斩数版的概率'],
    ...C.TIERS.map(t => ['odds.' + t, C.ODDS[t], 0, 1, 0, '普通武器箱爆率', C.TIER[t].n]),
    ...C.CASES.filter(c => C.COLS[c].prem).flatMap(c => ['cla', 'cov', 'gold'].map(t => [C.COLS[c].ok + t, C.COLS[c].odds[t], 0, 1, 0, C.COLS[c].name + '武器箱爆率', C.TIER[t].n])),
    ['fee', C.FEE, 0, 0.5, 0, '玩家市场', '成交手续费（0.15 就是 15%）'],
    ['term.lo', C.TERM.markup[0], 0.5, 5, 0, '终端机', '报价最低是基准价的几倍'],
    ['term.hi', C.TERM.markup[1], 0.5, 5, 0, '终端机', '报价最高是基准价的几倍'],
    ['dropP', C.DROP_P, 0, 1, 0, '对局掉落', '每局掉一件的概率'],
    ['dropCap', C.DROP_CAP, 0, 100, 1, '对局掉落', '每周最多掉几次'],
    ['ink.base', 1500, 0, 100000, 1, '每天认多少本机收入', '每天先认多少墨锭'],
    ['ink.match', 80, 0, 10000, 1, '每天认多少本机收入', '每打完一局，当天多认多少'],
    ['ink.cap', 6000, 0, 1000000, 1, '每天认多少本机收入', '一天最多认多少'],
  ];
  C.CFG_DEF = Object.fromEntries(C.CFG_INFO.map(r => [r[0], r[1]]));
  C.cv = (cfg, k) => { const v = cfg && typeof cfg === 'object' ? own(cfg, k) : undefined; return v === undefined ? C.CFG_DEF[k] : v; };
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
  const PREFIX = { qf: 'qingfeng', fy: 'feiying', ts: 'tieshan', ls: 'lingshuang', ly: 'liuyun', lm: 'leiming', my: 'moyu', yh: 'yuehua', yl: 'yanling', yx: 'yuxiao', zx: 'zuixian', gc: 'gouchen' };
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
    lst: [], hist: [], od: { d: 0, n: 0 }, pw: { w: 0, n: 0 }, zw: { w: 0, n: 0 }, zf: 0, drop: { w: 0, g: 0, n: 0, sup: 0 },
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
  // 今天还能开几个普通武器箱、这周还能开几个神兵（星座）武器箱
  C.openLeft = (s, cid, cfg) => { const col = cid && own(C.COLS, cid); return col && col.prem ? Math.max(0, C.cv(cfg, col.lim) - s[col.cnt].n) : Math.max(0, C.cv(cfg, 'openDay') - s.od.n); };

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
  A.open = (s, a, env) => {   // 开箱：不用钥匙，开一个少一个。普通武器箱每天最多开 2 个，神兵、星座武器箱每周各 1 个
    const cid = a.c;
    if (!C.CASES.includes(cid)) return { err: '没有这个武器箱' };
    if ((s.cases[cid] || 0) < 1) return { err: '没有这个武器箱了' };
    const col = C.COLS[cid];
    if (!C.openLeft(s, cid, env.cfg)) {
      const n = C.cv(env.cfg, col.prem ? col.lim : 'openDay');
      return { err: !n ? `${col.prem ? col.name : '普通'}武器箱现在暂停开启` : col.prem ? `${col.name}武器箱每周只能开 ${n} 个，下周一再来` : `今天的 ${n} 个武器箱已经开完了，明天再来` };
    }
    if (C.invFull(s)) return { err: `库存满了（最多 ${C.INV_MAX} 件），先卖掉一些` };
    s.cases[cid]--; s.stat.open++;
    if (col.prem) s[col.cnt].n++; else s.od.n++;
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
    if (s.lst.length >= C.LIST_MAX) return { err: `最多同时挂 ${C.LIST_MAX} 件` };
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
  // 跑一个动作：先整理存档、结掉卖出去的挂单，再做动作。出错时存档原样不动（先在副本上做）
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
      if (env.mkt) env.mkt.out = null;
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
// 每天先认 1500；每打完一局服务器认可的对局（开局领了票、打够了时间），当天再多认 80；最多 6000。这三个数可以在线改
// （规则核心 C.CFG_INFO 里的 ink.base / ink.match / ink.cap）。
// 只在控制台里改数的人一天最多多拿 1500；正常玩家打得越多额度越高。超出额度的先记着（单条不超过 INK_OWE_ONE 的才记，
// 最多记 INK_OWE_MAX），之后哪天额度有空余就补上，所以新手一天里领了好几样一次性奖励也不会丢。
const INK_OWE_ONE = 2500, INK_OWE_MAX = 4000;
const INK_IMPORT_CAP = 100000;   // 第一次建账：老存档里的墨锭最多认这么多
const REG_INK_CAP = 5000;        // 注册时带上来的游客 / 本机存档，墨锭最多认这么多
const INK_SPIKE = 50000;         // 一条上报超过这么多，记下来给管理员看（导入老账号也可能这样，所以不自动封）
const BODY_MAX = 300000;
const SKIN_RE = /^[a-z0-9_]{1,24}$/;
const BAN_MS = 24 * 3600e3;
const CODE_USES = 100000;              // 一个兑换码最多让这么多个号领
const RDM_MAX = 10, RDM_IP_MAX = 30;   // 一小时里输错这么多次兑换码就先锁一小时（每个号、每个 IP）
// 游戏里写死的几个码（src/game.js 的 redeemCode 先认它们）：服务器上不建同名的，不然玩家永远领不到
const CODE_LOCAL = ['LOCK', 'RELOCK', 'RENYING666', 'RENYING888', 'SWORD2026', 'MOYUGIFT'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, profile_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS econ (uid TEXT PRIMARY KEY, state_json TEXT NOT NULL, srv_json TEXT NOT NULL, ink INTEGER NOT NULL, ver INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS econ_nonce (uid TEXT NOT NULL, nonce TEXT NOT NULL, at INTEGER NOT NULL, res_json TEXT NOT NULL, PRIMARY KEY (uid, nonce))`,
  `CREATE TABLE IF NOT EXISTS econ_log (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, at INTEGER NOT NULL, act TEXT NOT NULL, ok INTEGER NOT NULL, ink0 INTEGER, ink1 INTEGER, detail TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_econ_log_uid ON econ_log (uid, at)`,
  `CREATE INDEX IF NOT EXISTS idx_econ_log_act ON econ_log (act, id)`,   // 管理后台查“管理员做过的事”用
  `CREATE TABLE IF NOT EXISTS sanctions (uid TEXT PRIMARY KEY, strikes INTEGER NOT NULL DEFAULT 0, ban_until INTEGER NOT NULL DEFAULT 0, perm INTEGER NOT NULL DEFAULT 0, log_json TEXT NOT NULL DEFAULT '[]', at INTEGER NOT NULL DEFAULT 0, pardon INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL)`,
  // 玩家市场：state 0 在卖、1 卖掉了、2 撤下了；paid 是卖家拿到钱没有；tx 是改它的那个请求（同一批写入靠它确认改成了）
  `CREATE TABLE IF NOT EXISTS mkt (id TEXT PRIMARY KEY, seller TEXT NOT NULL, k TEXT NOT NULL, st INTEGER NOT NULL, item_json TEXT NOT NULL, price INTEGER NOT NULL, at INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 0, buyer TEXT, done_at INTEGER, paid INTEGER NOT NULL DEFAULT 0, tx TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_k ON mkt (k, state, price)`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_seller ON mkt (seller, state, paid)`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_done ON mkt (state, done_at)`,
  // 全服补偿：uid 是 '*' 发给所有人（只给 born 之前注册的号），否则只发给这一个号；领过的记在 gift_got
  `CREATE TABLE IF NOT EXISTS gift (id TEXT PRIMARY KEY, uid TEXT NOT NULL, ink INTEGER NOT NULL DEFAULT 0, items_json TEXT NOT NULL DEFAULT '{}', note TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL, until INTEGER NOT NULL, born INTEGER NOT NULL, off INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_gift_uid ON gift (uid, until)`,
  `CREATE TABLE IF NOT EXISTS gift_got (gid TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (gid, uid))`,
  // 兑换码：玩家在游戏里输入就领到里面的东西，每个号只领一次（code_got）；got 到了 uses 就领完了（CHECK 挡住多领），until 之后、off 是 1 都领不到
  `CREATE TABLE IF NOT EXISTS code (code TEXT PRIMARY KEY, ink INTEGER NOT NULL DEFAULT 0, items_json TEXT NOT NULL DEFAULT '{}', note TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL, until INTEGER NOT NULL, uses INTEGER NOT NULL, got INTEGER NOT NULL DEFAULT 0, off INTEGER NOT NULL DEFAULT 0, CHECK (got <= uses))`,
  `CREATE TABLE IF NOT EXISTS code_got (code TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (code, uid))`,
  // 在线改的经济数值：每改一次加一行，最后一行是现在用的（只存和默认值不一样的项）
  `CREATE TABLE IF NOT EXISTS cfg (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL, by TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL)`,
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
  return randHex(32);
}
function randHex(nBytes) {
  const bytes = new Uint8Array(nBytes);
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
    'SELECT u.id AS id, u.username AS username, u.profile_json AS profile_json, u.created_at AS created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
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
function overlay(prof, eco, isDev) {
  const p = { ...prof };
  delete p.armory; delete p.ledger;
  p.ink = eco.ink;
  p.skins = isDev ? cleanSkins(p.skins) : mergeSkins(p.skins, eco.state, eco.srv, eco.ver);
  p.equip = fixEquip(cleanEquip(p.equip), p.skins);
  return p;
}
// 给客户端的账本：服务器上的墨锭、版本号、最近记过的上报编号（客户端据此把已经记过的条目划掉）
function ledgerOut(eco, now) {
  const acks = Object.entries(eco.srv.ap).filter(([, v]) => now - v[0] < 3 * DAY_MS).sort((a, b) => b[1][0] - a[1][0]).slice(0, 200).map(([id]) => id);
  return { ink: eco.ink, ver: eco.ver, acks };
}
// 今天认多少本机收入：基础额度 + 今天服务器认可的对局数 × 每局额度（三个数都可以在线改）
function inkAllow(eco, day, cfg) {
  const dm = eco.state && eco.state.dm, n = dm && dm.d === day ? Math.max(0, Math.min(C.MATCH_DAY_CAP, Math.floor(+dm.n || 0))) : 0;
  return Math.min(C.cv(cfg, 'ink.cap'), C.cv(cfg, 'ink.base') + C.cv(cfg, 'ink.match') * n);
}
// 客户端本地赚的墨锭：每条只记一次，收入每天有额度，花掉的照扣。
// srv.ap 记着每条的 [到达时间, 认了多少收入, 其中先记着多少]；srv.rv 是“撤回”点名了、但还没到的收入编号
const LID = /^[0-9a-z]{8,32}$/;
function applyDeltas(eco, deltas, now, cfg) {
  const day = C.day(now), srv = eco.srv, allow = inkAllow(eco, day, cfg);
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
// 一批写入里的每一条都带上“版本号还是读出来时那个”：中间被别的请求改过，这一批就什么都不写，重读再算。
// 买、撤玩家市场上的一单时还要再带一条“那一单是被这个请求改掉的”（tx = [挂单编号, 请求标记]）：别人先买走了，这一批也什么都不写
const TXC = ' AND EXISTS (SELECT 1 FROM mkt WHERE id = ? AND tx = ?)';
// guard 只给 INSERT … SELECT、UPDATE … WHERE 后面接着用（cond 前面没有 AND）
const guard = (env, sql, binds, uid, ver, tx) => env.DB.prepare(`${sql} EXISTS (SELECT 1 FROM econ WHERE uid = ? AND ver = ?)${tx ? TXC : ''}`).bind(...binds, uid, ver, ...(tx || []));
const ins = (env, sql, binds, uid, ver, tx) => guard(env, sql + ' WHERE', binds, uid, ver, tx);
function userWrite(env, uid, prof, now, ver, tx) {
  return guard(env, 'UPDATE users SET profile_json = ?, updated_at = ? WHERE id = ? AND', [JSON.stringify(prof), now, uid], uid, ver, tx);
}
function econWrite(env, uid, ver, now, srv, ink, stateJson, tx) {
  return env.DB.prepare(`UPDATE econ SET state_json = ?, srv_json = ?, ink = ?, ver = ver + 1, updated_at = ? WHERE uid = ? AND ver = ?${tx ? TXC : ''}`)
    .bind(stateJson, JSON.stringify(srv), ink, now, uid, ver, ...(tx || []));
}

/* ---------- 在线改的经济数值（管理员用 /api/admin/cfg 改，cfg 表的最后一行是现在用的） ---------- */
// 每个 Worker 实例最多 30 秒重读一次：改完半分钟内各处都换成新的。读出来的再过一遍检查，坏了就当没改
let CFG_CACHE = { at: 0, id: 0, cfg: {} };
async function cfgNow(env, now) {
  if (CFG_CACHE.at && now - CFG_CACHE.at < 30e3 && now >= CFG_CACHE.at) return CFG_CACHE.cfg;
  const r = await env.DB.prepare('SELECT id, json FROM cfg ORDER BY id DESC LIMIT 1').first();
  const c = r ? C.cleanCfg(parseObj(r.json) || {}) : { cfg: {} };
  CFG_CACHE = { at: now, id: r ? r.id : 0, cfg: c.cfg || {} };
  return CFG_CACHE.cfg;
}

/* ---------- 全服补偿：开发组发的墨锭、武器箱、终端机、改名标签，玩家下次动武库时自动领 ---------- */
// 发给所有人的（uid = '*'）只给 born 之前注册的号，免得开小号来领；单发给某个号的不管注册时间。每个号每份只领一次
async function giftsFor(env, user, now) {
  return (await env.DB.prepare("SELECT id, ink, items_json, note FROM gift WHERE (uid = ? OR uid = '*') AND off = 0 AND at <= ? AND until > ? AND born > ? AND NOT EXISTS (SELECT 1 FROM gift_got x WHERE x.gid = gift.id AND x.uid = ?) ORDER BY at LIMIT 10")
    .bind(user.id, now, now, Math.floor(+user.created_at || 0), user.id).all()).results || [];
}
function giftItems(txt) {   // 一份补偿里的东西：{ cases: { c1: 2 }, term: 1, tags: 1 }，数都夹在 0 ~ 100
  const o = parseObj(txt) || {}, cases = {};
  for (const c of C.CASES) { const n = Math.floor(+(o.cases && o.cases[c]) || 0); if (n > 0) cases[c] = Math.min(100, n); }
  const one = x => Math.max(0, Math.min(100, Math.floor(+x || 0)));
  return { cases, term: one(o.term), tags: one(o.tags) };
}

/* ---------- 兑换码：管理后台建，玩家在游戏里输入，服务器核对后和补偿一样放进存档和墨锭 ---------- */
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 不用 0 O 1 I L，免得玩家看错
const codeKey = x => { const k = String(x || '').trim().toUpperCase(); return /^[A-Z0-9]{4,20}$/.test(k) ? k : ''; };
function randCode(n = 10) {   // 只收 248（31 的 8 倍）以下的字节，每个字符出现的机会一样
  let out = '';
  while (out.length < n) for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < 248 && out.length < n) out += CODE_ABC[b % 31];
  return out;
}

/* ---------- 武库：所有动作都在服务器上算 ---------- */
const QUIET = ['sync', 'matchStart', 'claimCode'];   // 太频繁的动作不进流水账（有成交的除外）；兑换码另记一条 code_got
async function handleEcon(env, auth, body, now, ip) {
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
  const cfg = await cfgNow(env, now);
  const freshProfile = async () => {
    const r = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(uid).first();
    return parseProfile(r ? r.profile_json : '', auth.user.username);
  };
  // 同一个编号已经做过：直接把上次的结果给它（网络重试不会开两次箱）
  const seen = await env.DB.prepare('SELECT res_json FROM econ_nonce WHERE uid = ? AND nonce = ?').bind(uid, nonce).first();
  if (seen) {
    const eco = await loadEcon(env, uid, await freshProfile(), now);
    return json({ ok: true, ...JSON.parse(seen.res_json), state: C.publicState(C.normalize(eco.state, { now, uid })), ledger: ledgerOut(eco, now), cfg, replay: true });
  }
  // 兑换码：先核对（输错的记一次，一小时里错太多就先锁住），对的话下面和补偿一起放进存档
  let code = null;
  if (act === 'claimCode') {
    if ((await peek(env, 'rdm:' + uid, now)) >= RDM_MAX || (await peek(env, 'rdmip:' + ip, now)) >= RDM_IP_MAX) return error('兑换码输错太多次了，一小时后再试', 429);
    const k = codeKey(args.code);
    const row = k ? await env.DB.prepare('SELECT code, ink, items_json, note, until, uses, got, off, EXISTS (SELECT 1 FROM code_got x WHERE x.code = code.code AND x.uid = ?) AS mine FROM code WHERE code = ?').bind(uid, k).first() : null;
    if (!row || row.off || row.until <= now) {
      await hit(env, 'rdm:' + uid, 1e9, 3600e3, now);
      await hit(env, 'rdmip:' + ip, 1e9, 3600e3, now);
      return error('兑换码无效或已过期');
    }
    if (row.mine) return error('这个兑换码你已经领过了');
    if (row.got >= row.uses) return error('这个兑换码已经被领完了');
    code = { code: row.code, note: row.note, ink: clampInk(row.ink, 1e6), ...giftItems(row.items_json) };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const prof = await freshProfile();
    const eco = await loadEcon(env, uid, prof, now);
    const isDevUser = auth.user && String(auth.user.username || '').toLowerCase() === 'dev';
    const skins0 = isDevUser ? cleanSkins(prof.skins) : mergeSkins(prof.skins, eco.state, eco.srv, eco.ver);
    // 玩家市场：自己挂的单被别人买走、钱还没结的，这次一起结；买、撤的话把那一单现在的样子交给规则核心
    const paid = (await env.DB.prepare('SELECT id, k, st, price, done_at AS at FROM mkt WHERE seller = ? AND state = 1 AND paid = 0 ORDER BY done_at LIMIT 40').bind(uid).all()).results || [];
    const mkt = { id: randHex(8), row: null, out: null };
    if ((act === 'buy' || act === 'cancel') && C.isLid(args.l)) {
      const r0 = await env.DB.prepare('SELECT id, seller, k, st, item_json, price, state FROM mkt WHERE id = ?').bind(args.l).first();
      if (r0) mkt.row = { id: r0.id, seller: r0.seller, k: r0.k, st: r0.st, price: r0.price, state: r0.state, item: parseObj(r0.item_json) };
    }
    // 开发组发的补偿：先放进存档和墨锭，再做这次的动作（动作没做成也照样领到）
    const gifts = await giftsFor(env, auth.user, now), got = [];
    let state0 = eco.state, ink0 = eco.ink;
    if (gifts.length || code) {
      state0 = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid });
      for (const g of gifts) {
        const it = giftItems(g.items_json), ink = clampInk(g.ink, 1e6);
        ink0 += ink;
        for (const [c, n] of Object.entries(it.cases)) state0.cases[c] += n;
        state0.term += it.term; state0.tags += it.tags;
        got.push({ id: g.id, note: g.note, ink, ...it });
      }
      if (code) {   // 兑换码里的东西也先放进去
        ink0 += code.ink;
        for (const [c, n] of Object.entries(code.cases)) state0.cases[c] += n;
        state0.term += code.term; state0.tags += code.tags;
      }
    }
    const E = { now, rnd, uid, ink: ink0, skins: skins0.slice(), equip: fixEquip(cleanEquip(prof.equip), skins0), server: true, paid, mkt, cfg };
    const equip0 = { ...E.equip };
    const r = C.run(state0, act, args, E);
    const res = r.res || {}, st = r.state, stJson = JSON.stringify(st);
    const add = E.skins.filter(k => !skins0.includes(k)), del = skins0.filter(k => !E.skins.includes(k));
    const eq = {};
    for (const c of new Set([...Object.keys(equip0), ...Object.keys(E.equip)])) if (equip0[c] !== E.equip[c]) eq[c] = E.equip[c] === undefined ? null : E.equip[c];
    const out = { res, sold: r.sold || [] };
    if (code) out.code = code;
    // 最后一道保险：算出来的数不对劲（不是整数、是负数、大得离谱）就整个作废，记下来查
    const bad = [E.ink, st.tags, st.term, ...Object.values(st.cases), ...st.inv.map(x => x.st + 1)].find(v => !Number.isSafeInteger(v) || v < 0 || v > 1e12);   // 斩数 -1 是普通版
    if (bad !== undefined || st.inv.length > C.INV_MAX) {
      await logRow(env, uid, now, 'invariant', 0, eco.ink, null, JSON.stringify({ act, args, bad }).slice(0, 400));
      return error('操作失败，已记录', 500);
    }
    const mo = mkt.out, settled = E.settled || [];
    if (!out.sold.length && !mo && E.ink === eco.ink && stJson === eco.stateJson && !add.length && !del.length && !Object.keys(eq).length) {
      return json({ ok: true, ...out, state: C.publicState(st), ledger: ledgerOut(eco, now), skinsAdd: [], skinsDel: [], equip: {}, cfg });   // 什么都没变：不用写
    }
    const ver = eco.ver, srv = eco.srv;
    for (const k of del) srv.gone[k] = [ver + 1, now];
    for (const k of add) delete srv.gone[k];
    pruneGone(srv, now);
    const p = { ...prof, ink: E.ink, skins: E.skins, equip: E.equip, updatedAt: now };
    delete p.armory; delete p.ledger;
    const quiet = QUIET.includes(act) && !out.sold.length;
    const detail = JSON.stringify({ a: args, r: res.err ? res.err : res.item ? `${res.item.k}#${res.item.i}${res.item.st >= 0 ? ' st' : ''}` : res.gain || res.price || '', s: out.sold.length || undefined }).slice(0, 400);
    // 买、撤：先把那一单从“在卖”改掉（只有它还在卖、版本号也没变才改得动），后面每一条都要看到这一改才生效
    const id = mo && (mo.buy || mo.cancel), tx = id ? [id, nonce.slice(0, 24) + '.' + attempt] : null;
    const stmts = [];
    if (mo && mo.buy) stmts.push(guard(env, 'UPDATE mkt SET state = 1, buyer = ?, done_at = ?, tx = ? WHERE id = ? AND state = 0 AND seller <> ? AND', [uid, now, tx[1], id, uid], uid, ver));
    if (mo && mo.cancel) stmts.push(guard(env, 'UPDATE mkt SET state = 2, done_at = ?, tx = ? WHERE id = ? AND seller = ? AND state = 0 AND', [now, tx[1], id, uid], uid, ver));
    if (mo && mo.list) {
      const L = mo.list;
      stmts.push(ins(env, 'INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) SELECT ?, ?, ?, ?, ?, ?, ?, 0, 0', [L.l, uid, L.it.k, L.it.st, JSON.stringify(L.it), L.price, now], uid, ver));
    }
    if (settled.length) stmts.push(guard(env, `UPDATE mkt SET paid = 1 WHERE seller = ? AND state = 1 AND paid = 0 AND id IN (${settled.map(() => '?').join(', ')}) AND`, [uid, ...settled], uid, ver, tx));
    for (const g of got) {   // 补偿：记下领过了（同一份同时领两次，只有一次写得进去）；流水记成 gift_got（gift 是新手礼）
      stmts.push(ins(env, 'INSERT INTO gift_got (gid, uid, at) SELECT ?, ?, ?', [g.id, uid, now], uid, ver, tx));
      stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'gift_got', 1, null, null, JSON.stringify({ id: g.id, note: g.note, ink: g.ink || undefined, cases: Object.keys(g.cases).length ? g.cases : undefined, term: g.term || undefined, tags: g.tags || undefined })], uid, ver, tx));
    }
    stmts.push(ins(env, 'INSERT INTO econ_nonce (uid, nonce, at, res_json) SELECT ?, ?, ?, ?', [uid, nonce, now, JSON.stringify(out)], uid, ver, tx));
    if (code) {   // 兑换码：记下这个号领过了、这个码又被领走一份（领满了 CHECK 让这一批整个作废）；流水记成 code_got
      stmts.push(ins(env, 'INSERT INTO code_got (code, uid, at) SELECT ?, ?, ?', [code.code, uid, now], uid, ver, tx));
      stmts.push(guard(env, 'UPDATE code SET got = got + 1 WHERE code = ? AND', [code.code], uid, ver, tx));
      stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'code_got', 1, null, null, JSON.stringify({ code: code.code, note: code.note, ink: code.ink || undefined, cases: Object.keys(code.cases).length ? code.cases : undefined, term: code.term || undefined, tags: code.tags || undefined })], uid, ver, tx));
    }
    if (!quiet) stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, act, res.err ? 0 : 1, eco.ink, E.ink, detail], uid, ver, tx));
    stmts.push(userWrite(env, uid, p, now, ver, tx));
    stmts.push(econWrite(env, uid, ver, now, srv, E.ink, stJson, tx));
    let results;
    try { results = await env.DB.batch(stmts); }
    catch (e) {
      const m = String(e && e.message || e);
      if (/econ_nonce/.test(m)) continue;   // 同一个编号的请求正好同时到：重来一遍会走上面“已经做过”
      if (/UNIQUE/.test(m) && mo && mo.list) continue;   // 挂单编号撞上了（几乎不可能）：换一个再来
      if (/gift_got/.test(m)) continue;   // 这份补偿刚被同一个号的另一个请求领走了：重读再算
      if (code && /code_got/.test(m)) return error('这个兑换码你已经领过了');   // 同一个号的另一个请求刚领走
      if (code && /CHECK constraint/i.test(m)) return error('这个兑换码已经被领完了');   // 最后几份刚被别人领走
      throw e;
    }
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;   // 版本冲突：别的请求先改了，重读再算
    eco.ink = E.ink; eco.ver = ver + 1;
    return json({ ok: true, ...out, state: C.publicState(st), ledger: ledgerOut(eco, now), skinsAdd: add, skinsDel: del, equip: eq, cfg, gifts: got.length ? got.map(({ id, ...g }) => g) : undefined });
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
  const isDevUser = auth.user && String(auth.user.username || '').toLowerCase() === 'dev';
  const cfg = await cfgNow(env, now);
  for (let attempt = 0; attempt < 5; attempt++) {
    const urow = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(uid).first();
    const eco = await loadEcon(env, uid, parseProfile(urow ? urow.profile_json : '', auth.user.username), now);
    const ink0 = eco.ink, ver = eco.ver;
    const p = { ...incoming };
    delete p.armory; delete p.ledger;
    p.name = auth.user.username;
    p.updatedAt = now;
    if (isDevUser) {
      if (typeof incoming.ink === 'number') eco.ink = Math.max(eco.ink, clampInk(incoming.ink));
      p.ink = eco.ink;
      p.skins = cleanSkins(incoming.skins || []);
      p.equip = fixEquip(cleanEquip(p.equip), p.skins);
      if (incoming.armory && typeof incoming.armory === 'object') {
        const arm = incoming.armory;
        if (Array.isArray(arm.inv)) eco.state.inv = arm.inv;
        if (arm.cases && typeof arm.cases === 'object') eco.state.cases = Object.assign(eco.state.cases || {}, arm.cases);
        if (Array.isArray(arm.via)) eco.state.via = Array.from(new Set([...(eco.state.via || []), ...arm.via]));
        if (typeof arm.nid === 'number') eco.state.nid = Math.max(eco.state.nid || 1, arm.nid);
        eco.state = C.normalize(eco.state, { now, uid });
        eco.stateJson = JSON.stringify(eco.state);
      }
      const stmts = [userWrite(env, uid, p, now, ver), econWrite(env, uid, ver, now, eco.srv, eco.ink, eco.stateJson)];
      const results = await env.DB.batch(stmts);
      if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;
      eco.ver = ver + 1;
      return json({ ok: true, updatedAt: now, ledger: ledgerOut(eco, now) });
    }
    // 老版本网页没有账本：拿它报的数和服务器上的差当作一条上报（一样有每日上限）
    const deltas = ledger ? ledger.deltas : [{ id: 'abs' + now.toString(36) + Math.floor(rnd() * 1e9).toString(36), d: clampInk(p.ink) - eco.ink }];
    const { capped, forged, paid, owed, allow, revoked } = applyDeltas(eco, deltas, now, cfg);
    p.ink = eco.ink;
    const sent = cleanSkins(p.skins), ev = ledger ? Math.floor(+ledger.ev) : -1;
    p.skins = mergeSkins(sent, eco.state, eco.srv, Number.isFinite(ev) ? ev : -1);
    p.equip = fixEquip(cleanEquip(p.equip), p.skins);
    const fix = { skinsAdd: p.skins.filter(k => !sent.includes(k)), skinsDel: sent.filter(k => !p.skins.includes(k)) };
    const stmts = [userWrite(env, uid, p, now, ver)];
    if (eco.ink !== ink0 || capped) stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, forged ? 'ink_spike' : 'ledger', 1, ink0, eco.ink, [capped ? `超过今天的额度 ${allow}，没认 ${capped}` : '', paid ? `补上以前记下的 ${paid}` : '', owed ? `还记着 ${owed}` : '', forged ? `一条上报 ${forged}` : '', revoked ? `反作弊撤回 ${revoked}` : ''].filter(Boolean).join('；')], uid, ver));
    stmts.push(econWrite(env, uid, ver, now, eco.srv, eco.ink, eco.stateJson));
    const results = await env.DB.batch(stmts);
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;
    eco.ver = ver + 1;
    return json({ ok: true, updatedAt: now, ledger: ledgerOut(eco, now), capped, owed, fix: fix.skinsAdd.length || fix.skinsDel.length ? fix : undefined });
  }
  return error('服务器忙，请稍后再试', 503);
}

// 新账号的默认存档（注册时没带存档、管理后台建号）
const newProfile = (name, now) => ({ name, ink: 100, owned: ['qingfeng'], frags: {}, pity: 0, spity: 0, skins: [], equip: {}, netWins: 0, netLosses: 0, rating: 1100, placed: 0, stageStars: {}, updatedAt: now });
// 注册时带上来的存档（游客进度、本机老账号）：墨锭有上限，武库专属皮肤不认。不管叫什么昵称都一样
function cleanInitial(prof) {
  const p = { ...prof };
  delete p.armory; delete p.ledger;
  p.ink = Math.min(clampInk(p.ink), REG_INK_CAP);
  p.skins = cleanSkins(p.skins).filter(k => !C.CS_KEYS.includes(k));
  p.equip = fixEquip(cleanEquip(p.equip), p.skins);
  return p;
}
// 不让注册的昵称：像是官方、开发者的。云端的 Dev 是开发组的市场账号（库存不受限，见上面的 handleProfilePost），
// 只能在管理后台建、重设密码（POST /api/admin/password），别人注册不了
const RESERVED = /^(dev|dev_master|admin|administrator|root|system|gm|official|staff|官方|系统|管理员|开发者|开发组|客服|刃影官方)$/i;
async function profileOut(env, user, now) {
  const isDev = user && String(user.username || '').toLowerCase() === 'dev';
  const prof = parseProfile(user.profile_json, user.username);
  const eco = await loadEcon(env, user.id, prof, now);
  return { profile: overlay(prof, eco, isDev), ledger: ledgerOut(eco, now) };
}

/* ---------- 玩家市场：看谁在卖什么、最近成交多少（挂单、买、撤都走 /api/econ） ---------- */
// 不给卖家是谁：只告诉看的人哪几单是他自己挂的
async function handleMarket(env, uid, k, now) {
  if (k) {
    if (!C.isItem(k)) return error('没有这件饰品', 404);
    const open = (await env.DB.prepare('SELECT id, st, price, at, seller = ? AS mine FROM mkt WHERE k = ? AND state = 0 ORDER BY price, at LIMIT 80').bind(uid, k).all()).results || [];
    const deals = (await env.DB.prepare('SELECT st, price, done_at AS at FROM mkt WHERE k = ? AND state = 1 ORDER BY done_at DESC LIMIT 120').bind(k).all()).results || [];
    return json({ ok: true, now, k, open: open.map(r => ({ l: r.id, st: r.st, price: r.price, at: r.at, mine: !!r.mine })), deals: deals.map(r => ({ st: r.st, price: r.price, at: r.at })) });
  }
  // 每一款：在卖几件、最低多少（普通版 n / lo，斩数版 sn / slo），最近一次成交（last / slast），30 天成交几次（d）
  const open = (await env.DB.prepare('SELECT k, st >= 0 AS s, COUNT(*) AS n, MIN(price) AS lo FROM mkt WHERE state = 0 GROUP BY k, st >= 0').all()).results || [];
  const deals = (await env.DB.prepare('SELECT k, st >= 0 AS s, price FROM mkt WHERE state = 1 AND done_at > ? ORDER BY done_at DESC LIMIT 3000').bind(now - 30 * DAY_MS).all()).results || [];
  const items = {}, of = k => items[k] || (items[k] = { n: 0, lo: 0, sn: 0, slo: 0, last: 0, slast: 0, d: 0 });
  for (const r of open) { if (!C.isItem(r.k)) continue; const x = of(r.k); if (r.s) { x.sn = r.n; x.slo = r.lo; } else { x.n = r.n; x.lo = r.lo; } }
  for (const r of deals) { if (!C.isItem(r.k)) continue; const x = of(r.k); x.d++; if (r.s) x.slast = x.slast || r.price; else x.last = x.last || r.price; }
  return json({ ok: true, now, items });
}

/* ---------- 管理后台（/api/admin/*，要管理口令，见文件开头；网页版在这个 Worker 的 /admin） ---------- */
// 口令对的话给出是谁：「名字:口令」里的名字；只写了一个口令就是 admin
const ADMIN_MIN = 16;   // 管理口令至少 16 位：设成 123456 这种短的不认，免得被人猜中
function adminOf(env, request) {
  const tok = getBearerToken(request) || '', raw = String(env.ADMIN_SECRET || '').trim();
  if (!raw || tok.length < ADMIN_MIN || tok.length > 256) return '';
  let who = sameStr(tok, raw) ? 'admin' : '';   // 只写了一个口令（口令里带冒号、逗号也认）
  if (raw.includes(':')) for (const part of raw.split(/[,\n]/)) {
    const i = part.indexOf(':'), name = part.slice(0, i).trim(), sec = part.slice(i + 1).trim();
    if (i > 0 && sec && sameStr(tok, sec) && !who) who = name.slice(0, 20);
  }
  return who;
}
const isPlain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const intIn = (v, lo, hi) => {   // 是整数、在范围里就给这个数，不然给 null；没填当 0
  if (v === undefined || v === null || v === '') return 0;
  const x = typeof v === 'number' ? v : typeof v === 'string' ? +v.trim() : NaN;
  return Number.isInteger(x) && x >= lo && x <= hi ? x : null;
};
const ADJ_INK = 1000000, ADJ_N = 1000;   // 一次最多加减这么多墨锭、这么多个箱子 / 终端机 / 标签

// 改一个玩家：墨锭、武器箱、终端机、改名标签加减，发饰品、收饰品，一次请求里的几样要么一起改成、要么都不改。
// 和玩家自己的操作走同一套带版本号的写入：玩家正好在开箱也不会互相覆盖。收走的皮肤记进 gone，旧存档加不回来
async function adminAdjust(env, u, body, who, why, now) {
  const dInk = intIn(body.ink, -ADJ_INK, ADJ_INK), dTerm = intIn(body.term, -ADJ_N, ADJ_N), dTags = intIn(body.tags, -ADJ_N, ADJ_N);
  if (dInk === null) return error(`墨锭一次最多加减 ${ADJ_INK}，要填整数`);
  if (dTerm === null || dTags === null) return error(`终端机、改名标签一次最多加减 ${ADJ_N} 个，要填整数`);
  const cases = {};
  for (const [c, v] of Object.entries(isPlain(body.cases) ? body.cases : {})) {
    const n = intIn(v, -ADJ_N, ADJ_N);
    if (!C.CASES.includes(c) || n === null) return error(`武器箱 ${c} 不对：要是 ${C.CASES.join(' / ')}，一次最多加减 ${ADJ_N} 个`);
    if (n) cases[c] = n;
  }
  const give = Array.isArray(body.give) ? body.give : [], take = Array.isArray(body.take) ? body.take : [];
  if (give.length > 50 || take.length > 200) return error('一次最多发 50 件、收 200 件');
  const gv = [];
  for (const g of give) {
    const k = isPlain(g) ? String(g.k || '') : String(g || ''), st = isPlain(g) && g.st !== undefined && g.st !== null && g.st !== '' && +g.st >= 0 ? intIn(g.st, 0, 1e7) : -1;
    if (!C.isItem(k)) return error(`没有这件饰品：${k}`);
    if (st === null) return error('斩数要是 0 到 10000000 的整数');
    gv.push({ k, st });
  }
  const tk = take.map(Number);
  if (tk.some(i => !Number.isInteger(i) || i < 1)) return error('要收的饰品编号不对');
  if (!dInk && !dTerm && !dTags && !Object.keys(cases).length && !gv.length && !tk.length) return error('什么都没填，没有要改的');
  for (let attempt = 0; attempt < 5; attempt++) {
    const urow = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(u.id).first();
    const prof = parseProfile(urow ? urow.profile_json : '', u.username);
    const eco = await loadEcon(env, u.id, prof, now);
    const s = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid: u.id });
    const isDev = String(u.username || '').toLowerCase() === 'dev';   // Dev 的皮肤不按库存核对，和它自己同步时一样
    const skins0 = isDev ? cleanSkins(prof.skins) : mergeSkins(prof.skins, eco.state, eco.srv, eco.ver);
    const E = { now, rnd, uid: u.id, ink: eco.ink + dInk, skins: skins0.slice(), equip: fixEquip(cleanEquip(prof.equip), skins0), server: true };
    if (E.ink < 0) return error(`这个号只有 ${eco.ink} 墨锭，扣不了 ${-dInk}`);
    for (const [c, n] of Object.entries(cases)) {
      if (s.cases[c] + n < 0) return error(`这个号只有 ${s.cases[c]} 个${C.COLS[c].name}武器箱，扣不了 ${-n} 个`);
      s.cases[c] += n;
    }
    if (s.term + dTerm < 0) return error(`这个号只有 ${s.term} 台终端机`);
    if (s.tags + dTags < 0) return error(`这个号只有 ${s.tags} 张改名标签`);
    s.term += dTerm; s.tags += dTags;
    const given = gv.map(g => C.addItem(s, C.mkItem(s, g.k, 'admin', rnd, { st: g.st }), E)), taken = [];
    for (const i of tk) {
      if (s.lst.some(L => L.it.i === i)) return error(`第 ${i} 号饰品挂在玩家市场上，要等玩家撤下或者卖掉才能收`);
      const it = C.dropItem(s, i, E);
      if (!it) return error(`库存里没有第 ${i} 号饰品`);
      taken.push(it);
    }
    const bad = [E.ink, s.tags, s.term, ...Object.values(s.cases)].find(v => !Number.isSafeInteger(v) || v < 0 || v > 1e12);
    if (bad !== undefined) return error('算出来的数不对，没有改');
    const add = E.skins.filter(k => !skins0.includes(k)), del = skins0.filter(k => !E.skins.includes(k));
    const ver = eco.ver, srv = eco.srv;
    for (const k of del) srv.gone[k] = [ver + 1, now];
    for (const k of add) delete srv.gone[k];
    pruneGone(srv, now);
    const p = { ...prof, ink: E.ink, skins: E.skins, equip: E.equip, updatedAt: now };
    delete p.armory; delete p.ledger;
    const detail = JSON.stringify({ by: who, why, ink: dInk || undefined, cases: Object.keys(cases).length ? cases : undefined, term: dTerm || undefined, tags: dTags || undefined,
      give: given.length ? given.map(x => `${x.k}#${x.i}${x.st >= 0 ? ' st' : ''}`) : undefined, take: taken.length ? taken.map(x => `${x.k}#${x.i}`) : undefined });
    const results = await env.DB.batch([
      ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [u.id, now, 'admin', 1, eco.ink, E.ink, detail.slice(0, 2000)], u.id, ver),
      userWrite(env, u.id, p, now, ver),
      econWrite(env, u.id, ver, now, srv, E.ink, JSON.stringify(s)),
    ]);
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;   // 玩家刚好也在动：重读再改
    return json({ ok: true, uid: u.id, ink: E.ink, cases: s.cases, term: s.term, tags: s.tags, given, taken });
  }
  return error('服务器忙，请再试一次', 503);
}

async function cfgRow(env, id) {
  const r = id ? await env.DB.prepare('SELECT id, json, by, note, at FROM cfg WHERE id = ?').bind(id).first()
    : await env.DB.prepare('SELECT id, json, by, note, at FROM cfg ORDER BY id DESC LIMIT 1').first();
  return r ? { id: r.id, cfg: parseObj(r.json) || {}, by: r.by, note: r.note, at: r.at } : null;
}
async function cfgSave(env, cfg, who, why, now) {   // 存成新的一版，这个实例马上换成新的
  const r = await env.DB.prepare('INSERT INTO cfg (json, by, note, at) VALUES (?, ?, ?, ?)').bind(JSON.stringify(cfg), who, why, now).run();
  const id = r.meta && r.meta.last_row_id ? Number(r.meta.last_row_id) : ((await cfgRow(env)) || {}).id || 0;
  CFG_CACHE = { at: now, id, cfg };
  return id;
}
const sameCfg = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

async function handleAdmin(env, request, path, now, ip) {
  if ((await peek(env, 'admf:' + ip, now)) >= 20) return error('管理口令试错太多次了，一小时后再试', 429);
  const who = adminOf(env, request);
  if (!who) { await hit(env, 'admf:' + ip, 1e9, 3600e3, now); return error('没有权限', 403); }
  const url = new URL(request.url), q = k => String(url.searchParams.get(k) || '').trim().slice(0, 64);
  const post = request.method === 'POST', body = post ? (await readBody(request)) : {};
  if (!body) return error('请求太大', 413);
  const why = String(body.why || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
  const needWhy = () => why.length >= 2 ? null : error('要写上原因（至少 2 个字），会记进流水');
  const findUser = key => key ? env.DB.prepare('SELECT id, username, created_at FROM users WHERE id = ? OR username = ?').bind(key, key).first() : null;
  const bundleIn = (noun, eg) => {   // 补偿、兑换码里的东西：墨锭、每种武器箱、终端机、改名标签，还有给玩家看的说明
    const ink = intIn(body.ink, 0, ADJ_INK), term = intIn(body.term, 0, 100), tags = intIn(body.tags, 0, 100);
    if (ink === null) return { err: `墨锭要填 0 到 ${ADJ_INK} 的整数` };
    if (term === null || tags === null) return { err: '终端机、改名标签每份最多 100 个' };
    const cases = {};
    for (const [c, v] of Object.entries(isPlain(body.cases) ? body.cases : {})) {
      const n = intIn(v, 0, 100);
      if (!C.CASES.includes(c) || n === null) return { err: `武器箱 ${c} 不对：每份每种最多 100 个` };
      if (n) cases[c] = n;
    }
    if (!ink && !term && !tags && !Object.keys(cases).length) return { err: noun + '里什么都没有' };
    const note = String(body.note || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60);
    if (note.length < 2) return { err: `要写给玩家看的说明（至少 2 个字），比如「${eg}」` };
    return { ink, cases, term, tags, note };
  };
  const bundleLog = b => ({ ink: b.ink || undefined, cases: Object.keys(b.cases).length ? b.cases : undefined, term: b.term || undefined, tags: b.tags || undefined });
  const route = (post ? 'POST ' : 'GET ') + path;

  if (route === 'GET /api/admin/whoami') return json({ ok: true, who, now });
  if (route === 'GET /api/admin/catalog') {   // 管理网页用：武器箱、每档品质的名字和颜色、每件饰品在哪个箱子哪一档、能改的经济数值
    return json({ ok: true, tiers: C.TIERS.map(t => ({ id: t, n: C.TIER[t].n, c: C.TIER[t].c })),
      cols: C.CASES.map(c => ({ id: c, name: C.COLS[c].name, prem: !!C.COLS[c].prem })),
      items: Object.keys(C.ITEM).map(k => ({ k, col: C.ITEM[k].col, tier: C.ITEM[k].tier, char: C.charOf(k) })), cfg: C.CFG_INFO });
  }
  if (route === 'GET /api/admin/stats') {   // 总览
    await cfgNow(env, now);
    const one = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
    const [users, fresh, eco, open, deals, banned] = await Promise.all([
      one('SELECT COUNT(*) AS n FROM users'), one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - DAY_MS),
      one('SELECT COUNT(*) AS n, COALESCE(SUM(ink), 0) AS ink FROM econ'), one('SELECT COUNT(*) AS n FROM mkt WHERE state = 0'),
      one('SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS v FROM mkt WHERE state = 1 AND done_at > ?', now - DAY_MS),
      one('SELECT COUNT(*) AS n FROM sanctions WHERE perm = 1 OR ban_until > ?', now),
    ]);
    return json({ ok: true, who, now, users: users.n, newToday: fresh.n, accounts: eco.n, inkTotal: eco.ink, open: open.n, deals24: deals.n, dealInk24: deals.v, banned: banned.n, cfgId: CFG_CACHE.id });
  }
  if (route === 'GET /api/admin/find') {   // 按昵称开头找号；不填就列最近动过的
    const key = q('q'), like = key.replace(/[\\%_]/g, m => '\\' + m) + '%';
    const rows = key
      ? await env.DB.prepare("SELECT u.id, u.username, u.created_at, e.ink, e.updated_at FROM users u LEFT JOIN econ e ON e.uid = u.id WHERE u.username LIKE ? ESCAPE '\\' OR u.id = ? ORDER BY length(u.username), u.username LIMIT 20").bind(like, key).all()
      : await env.DB.prepare('SELECT u.id, u.username, u.created_at, e.ink, e.updated_at FROM users u LEFT JOIN econ e ON e.uid = u.id ORDER BY COALESCE(e.updated_at, u.updated_at) DESC LIMIT 20').all();
    return json({ ok: true, users: rows.results || [] });
  }
  if (route === 'GET /api/admin/econ') {   // 一个号的武库存档、处罚、流水、市场记录
    const u = await findUser(q('uid'));
    if (!u) return error('没有这个账号', 404);
    const row = await env.DB.prepare('SELECT state_json, ink, ver, updated_at FROM econ WHERE uid = ?').bind(u.id).first();
    const log = await env.DB.prepare('SELECT at, act, ok, ink0, ink1, detail FROM econ_log WHERE uid = ? ORDER BY id DESC LIMIT 100').bind(u.id).all();
    const mk = await env.DB.prepare('SELECT id, seller, buyer, k, st, price, at, state, done_at, paid FROM mkt WHERE seller = ? OR buyer = ? ORDER BY at DESC LIMIT 60').bind(u.id, u.id).all();
    const pr = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(u.id).first();
    const p = parseProfile(pr ? pr.profile_json : '', u.username);
    return json({ ok: true, uid: u.id, username: u.username, createdAt: u.created_at, econ: row ? { ink: row.ink, ver: row.ver, at: row.updated_at, state: parseObj(row.state_json) } : null,
      profile: { rating: p.rating, placed: p.placed, netWins: p.netWins, netLosses: p.netLosses, skins: cleanSkins(p.skins).length, updatedAt: p.updatedAt },
      sanction: await sanctionOf(env, u.id), log: log.results || [], mkt: mk.results || [] });
  }
  if (route === 'GET /api/admin/audit') {   // 管理员做过的事（谁、什么时候、改了谁、为什么）
    const rows = await env.DB.prepare("SELECT l.at, l.uid, u.username, l.act, l.ink0, l.ink1, l.detail FROM econ_log l LEFT JOIN users u ON u.id = l.uid WHERE l.act IN ('admin', 'admin_ban', 'pardon', 'admin_pw', 'gift_new', 'gift_off', 'code_new', 'code_off', 'cfg') ORDER BY l.id DESC LIMIT 100").all();
    return json({ ok: true, rows: rows.results || [] });
  }
  if (route === 'POST /api/admin/adjust') {
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    return needWhy() || await adminAdjust(env, u, body, who, why, now);
  }
  if (route === 'POST /api/admin/ban') {   // 封几天或者永久；解封用 pardon
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    const w = needWhy(); if (w) return w;
    const perm = body.perm === true, days = intIn(body.days, 1, 3650);
    if (!perm && !days) return error('封几天要填 1 到 3650 的整数，永久封号选永久');
    const rec = await sanctionOf(env, u.id);
    const until = perm ? rec.banUntil : Math.max(rec.banUntil, now + days * DAY_MS), log = rec.log.concat({ r: why.slice(0, 60), at: now, src: 'admin:' + who }).slice(-20);
    await env.DB.prepare('INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0) ON CONFLICT(uid) DO UPDATE SET ban_until = ?3, perm = ?4, log_json = ?5, at = ?6')
      .bind(u.id, rec.strikes, until, perm || rec.perm ? 1 : 0, JSON.stringify(log), now).run();
    await logRow(env, u.id, now, 'admin_ban', 1, null, null, JSON.stringify({ by: who, why, days: perm ? 'perm' : days }));
    return json({ ok: true, uid: u.id, banUntil: until, perm: perm || rec.perm });
  }
  if (route === 'POST /api/admin/pardon') {   // 解封，清空处罚记录（玩家刷新网页后生效）
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    const note = why || String(body.note || '').trim().slice(0, 100);
    await env.DB.prepare("INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES (?1, 0, 0, 0, '[]', ?2, ?2) ON CONFLICT(uid) DO UPDATE SET strikes = 0, ban_until = 0, perm = 0, log_json = '[]', at = ?2, pardon = ?2").bind(u.id, now).run();
    await logRow(env, u.id, now, 'pardon', 1, null, null, JSON.stringify({ by: who, why: note }));
    return json({ ok: true, uid: u.id });
  }
  if (route === 'POST /api/admin/password') {   // 重设密码（新密码由管理员给，至少 12 位），这个号在别处的登录全部退出。create 为 true 时没有这个号就新建：dev 这类保留的昵称只能这样建
    const w = needWhy(); if (w) return w;
    const key = String(body.uid || '').trim(), pw = String(body.password || '');
    if (pw.length < 12 || pw.length > 128) return error('新密码要 12 到 128 位');
    const salt = crypto.randomUUID().slice(0, 12), hash = await hashPassword(pw, salt);
    let u = await findUser(key), created = false;
    if (!u) {
      if (body.create !== true) return error('没有这个账号', 404);
      if (key.length < 2 || key.length > 20 || /^u_/i.test(key) || /[\u0000-\u001f\u007f<>]/.test(key)) return error('新账号的昵称要 2 到 20 个字，不能用 u_ 开头');
      u = { id: 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), username: key };
      await env.DB.prepare('INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(u.id, key, hash, salt, JSON.stringify(newProfile(key, now)), now, now).run();
      created = true;
    } else {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?').bind(hash, salt, now, u.id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
        env.DB.prepare('DELETE FROM rate WHERE k = ?').bind('lf:' + String(u.username).toLowerCase().slice(0, 40)),
      ]);
    }
    await logRow(env, u.id, now, 'admin_pw', 1, null, null, JSON.stringify({ by: who, why, created: created || undefined }));
    return json({ ok: true, uid: u.id, username: u.username, created });
  }
  if (route === 'GET /api/admin/gifts') {
    const rows = await env.DB.prepare('SELECT g.id, g.uid, u.username, g.ink, g.items_json, g.note, g.by, g.at, g.until, g.born, g.off, (SELECT COUNT(*) FROM gift_got x WHERE x.gid = g.id) AS got FROM gift g LEFT JOIN users u ON u.id = g.uid ORDER BY g.at DESC LIMIT 50').all();
    return json({ ok: true, now, gifts: (rows.results || []).map(r => ({ ...r, items: giftItems(r.items_json), items_json: undefined })) });
  }
  if (route === 'POST /api/admin/gift') {   // 发补偿：to 是 all（所有人）或者一个号
    const to = String(body.to || 'all').trim();
    let uid = '*';
    if (to !== 'all' && to !== '*') { const u = await findUser(to); if (!u) return error('没有这个账号', 404); uid = u.id; }
    const b = bundleIn('补偿', '服务器维护补偿'), days = intIn(body.days === undefined ? 14 : body.days, 1, 90);
    if (b.err) return error(b.err);
    if (!days) return error('有效天数要填 1 到 90');
    const id = randHex(8), until = now + days * DAY_MS, born = uid === '*' && !body.newToo ? now : until;
    await env.DB.prepare('INSERT INTO gift (id, uid, ink, items_json, note, by, at, until, born, off) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
      .bind(id, uid, b.ink, JSON.stringify({ cases: b.cases, term: b.term, tags: b.tags }), b.note, who, now, until, born).run();
    await logRow(env, uid, now, 'gift_new', 1, null, null, JSON.stringify({ by: who, why: why || b.note, id, ...bundleLog(b), days, newToo: uid === '*' ? !!body.newToo : undefined }));
    return json({ ok: true, id, until });
  }
  if (route === 'POST /api/admin/gift/off') {   // 停发：还没领的就领不到了，已经领了的不收回
    const g = await env.DB.prepare('SELECT id, uid FROM gift WHERE id = ?').bind(String(body.id || '')).first();
    if (!g) return error('没有这份补偿', 404);
    const w = needWhy(); if (w) return w;
    await env.DB.prepare('UPDATE gift SET off = 1 WHERE id = ?').bind(g.id).run();
    await logRow(env, g.uid, now, 'gift_off', 1, null, null, JSON.stringify({ by: who, why, id: g.id }));
    return json({ ok: true });
  }
  if (route === 'GET /api/admin/codes') {
    const rows = await env.DB.prepare('SELECT code, ink, items_json, note, by, at, until, uses, got, off FROM code ORDER BY at DESC LIMIT 50').all();
    return json({ ok: true, now, codes: (rows.results || []).map(r => ({ ...r, items: giftItems(r.items_json), items_json: undefined })) });
  }
  if (route === 'POST /api/admin/code') {   // 建兑换码：code 不填就随机生成 10 位；uses 是最多几个号能领，每个号一次
    const b = bundleIn('兑换码', '新春礼包');
    if (b.err) return error(b.err);
    const uses = intIn(body.uses === undefined ? 100 : body.uses, 1, CODE_USES), days = intIn(body.days === undefined ? 14 : body.days, 1, 90);
    if (!uses) return error(`最多几个号能领要填 1 到 ${CODE_USES}`);
    if (!days) return error('有效天数要填 1 到 90');
    const raw = String(body.code || '').trim(), k = raw ? codeKey(raw) : randCode();
    if (!k) return error('兑换码只能用 4 到 20 位英文字母和数字');
    if (CODE_LOCAL.includes(k)) return error('游戏里已经有这个码了，换一个');
    const until = now + days * DAY_MS;
    try {
      await env.DB.prepare('INSERT INTO code (code, ink, items_json, note, by, at, until, uses, got, off) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)')
        .bind(k, b.ink, JSON.stringify({ cases: b.cases, term: b.term, tags: b.tags }), b.note, who, now, until, uses).run();
    } catch (e) {
      if (/UNIQUE|PRIMARY/i.test(String(e && e.message || e))) return error('已经有这个兑换码了，换一个', 409);
      throw e;
    }
    await logRow(env, '*', now, 'code_new', 1, null, null, JSON.stringify({ by: who, why: why || b.note, code: k, ...bundleLog(b), uses, days }));
    return json({ ok: true, code: k, until });
  }
  if (route === 'POST /api/admin/code/off') {   // 停用：还没领的就领不到了，已经领了的不收回
    const k = codeKey(body.code), c = k ? await env.DB.prepare('SELECT code FROM code WHERE code = ?').bind(k).first() : null;
    if (!c) return error('没有这个兑换码', 404);
    const w = needWhy(); if (w) return w;
    await env.DB.prepare('UPDATE code SET off = 1 WHERE code = ?').bind(c.code).run();
    await logRow(env, '*', now, 'code_off', 1, null, null, JSON.stringify({ by: who, why, code: c.code }));
    return json({ ok: true });
  }
  if (route === 'GET /api/admin/cfg') {   // 现在的经济数值、每一项的范围和说明、最近改过的 30 版
    const cur = await cfgRow(env), hist = await env.DB.prepare('SELECT id, json, by, note, at FROM cfg ORDER BY id DESC LIMIT 30').all();
    return json({ ok: true, id: cur ? cur.id : 0, cfg: cur ? cur.cfg : {}, info: C.CFG_INFO, hist: (hist.results || []).map(r => ({ id: r.id, by: r.by, note: r.note, at: r.at, cfg: parseObj(r.json) || {} })) });
  }
  if (route === 'POST /api/admin/cfg') {   // set 里写要改的项；填 null 回到默认值
    const w = needWhy(); if (w) return w;
    if (!isPlain(body.set) || !Object.keys(body.set).length) return error('没写要改哪一项');
    const cur = await cfgRow(env), merged = { ...(cur ? cur.cfg : {}) };
    for (const [k, v] of Object.entries(body.set)) { if (v === null || v === '') delete merged[k]; else merged[k] = v; }
    const c = C.cleanCfg(merged);
    if (c.err) return error(c.err);
    if (sameCfg(c.cfg, cur ? cur.cfg : {})) return error('和现在的一样，没有要改的');
    const id = await cfgSave(env, c.cfg, who, why, now);
    await logRow(env, '*', now, 'cfg', 1, null, null, JSON.stringify({ by: who, why, id, set: body.set }).slice(0, 400));
    return json({ ok: true, id, cfg: c.cfg });
  }
  if (route === 'POST /api/admin/cfg/undo') {   // 退回到以前的某一版（to 填 0 就是全部回到默认值），存成新的一版
    const w = needWhy(); if (w) return w;
    const to = intIn(body.to, 0, 1e12);
    if (to === null) return error('要退回到第几版？');
    const old = to ? await cfgRow(env, to) : { cfg: {} };
    if (!old) return error('没有这一版', 404);
    const c = C.cleanCfg(old.cfg), cur = await cfgRow(env);
    if (c.err) return error('那一版的数值现在用不了：' + c.err);
    if (sameCfg(c.cfg, cur ? cur.cfg : {})) return error('现在用的就是这一版');
    const id = await cfgSave(env, c.cfg, who, (to ? `退回到第 ${to} 版：` : '全部回到默认值：') + why, now);
    await logRow(env, '*', now, 'cfg', 1, null, null, JSON.stringify({ by: who, why, id, undo: to }));
    return json({ ok: true, id, cfg: c.cfg });
  }
  return error('Not found', 404);
}

// 管理网页：python3 tools/build.py 打包时把 cloudflare/admin.html 和它那段脚本的 sha256 放进来（直接跑 worker.js 时是空的）。
// 浏览器只许跑 sha256 对得上的那一段脚本：页面里就算混进了别的脚本、onclick 这种，也跑不起来
const ADMIN_PAGE = { html: "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"robots\" content=\"noindex, nofollow\">\n<meta name=\"color-scheme\" content=\"dark\">\n<title>刃影管理后台</title>\n<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='2' y='2' width='28' height='28' rx='6' fill='%23b8392e'/%3E%3Cpath d='M10 9h12M16 9v15M11 15l5 4 5-4' stroke='%23fbeee0' stroke-width='2.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\">\n<!--\n  刃影管理后台：Worker 的 /admin 回这一页（python3 tools/build.py 把它打包进 cloudflare/worker.bundle.js）。\n  只连这个 Worker 自己的 /api/admin/*，要管理口令（ADMIN_SECRET）；口令只存在这个标签页的 sessionStorage 里。\n  整页只有最下面一段脚本：Worker 按它的 sha256 放行，别的脚本、onclick 这种都不会跑，所以事件一律用 addEventListener。\n  服务器给的字（昵称、原因、说明）一律经过 H`` 转义再放进网页。\n-->\n<style>\n  :root {\n    --bg: #0a0b1c; --bg2: #0e1024; --panel: #13152c; --panel2: #1a1c38;\n    --line: rgba(239, 232, 216, .11); --line2: rgba(239, 232, 216, .22);\n    --ink: #efe8d8; --dim: rgba(239, 232, 216, .66); --faint: rgba(239, 232, 216, .44);\n    --gold: #e9c46a; --gold2: #f3d690; --goldbg: rgba(233, 196, 106, .12);\n    --seal: #b8392e; --red: #ff8a80; --redbg: rgba(255, 110, 100, .12); --ok: #74d9ad; --okbg: rgba(116, 217, 173, .12);\n    --title: \"STKaiti\", \"KaiTi\", \"Kaiti SC\", \"楷体\", serif;\n    --body: -apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", \"Noto Sans SC\", system-ui, sans-serif;\n    --mono: ui-monospace, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace;\n    color-scheme: dark;\n  }\n  * { box-sizing: border-box; }\n  html, body { margin: 0; }\n  body {\n    min-height: 100vh; color: var(--ink); font: 14px/1.6 var(--body); -webkit-text-size-adjust: 100%;\n    background: var(--bg) radial-gradient(ellipse 110% 55% at 50% -12%, rgba(233, 196, 106, .09), transparent 62%) no-repeat;\n  }\n  .hidden { display: none !important; }\n  h1, h2, h3 { font-family: var(--title); font-weight: 400; letter-spacing: .04em; margin: 0; line-height: 1.25; text-wrap: balance; }\n  p { margin: 0 0 10px; text-wrap: pretty; }\n  small { color: var(--faint); font-family: var(--body); font-size: 12.5px; letter-spacing: 0; }\n  .mono { font-family: var(--mono); font-size: 12.5px; }\n  .hint { color: var(--faint); font-size: 12.5px; }\n  .empty { color: var(--faint); padding: 18px 0 6px; text-align: center; }\n  .loading { color: var(--faint); padding: 40px 0; text-align: center; }\n  .nowrap { white-space: nowrap; }\n  .up { color: var(--ok); font-weight: 600; }\n  .down { color: var(--red); font-weight: 600; }\n\n  /* 按钮和输入框 */\n  .btn {\n    appearance: none; border: 1px solid transparent; background: var(--gold); color: #1d1606; cursor: pointer;\n    font: 600 14px/1.2 var(--body); padding: 9px 16px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;\n    transition: filter .15s, background-color .15s, border-color .15s; white-space: nowrap;\n  }\n  .btn:hover { filter: brightness(1.08); }\n  .btn:disabled { opacity: .42; cursor: not-allowed; filter: none; }\n  .btn.ghost { background: transparent; color: var(--ink); border-color: var(--line2); font-weight: 500; }\n  .btn.ghost:hover:not(:disabled) { background: rgba(255, 255, 255, .05); border-color: rgba(239, 232, 216, .34); }\n  .btn.danger { background: var(--seal); color: #fff1ea; }\n  .btn.sm { font-size: 12.5px; padding: 5px 10px; border-radius: 6px; }\n  .btn.wide { width: 100%; justify-content: center; padding: 11px 16px; font-size: 15px; }\n  .link { appearance: none; background: none; border: 0; padding: 0; color: var(--gold2); font: inherit; font-weight: 600; cursor: pointer; text-align: left; }\n  .link:hover { text-decoration: underline; text-underline-offset: 3px; }\n  :focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }\n  input, select {\n    font: inherit; color: var(--ink); background: var(--bg2); border: 1px solid var(--line2); border-radius: 7px;\n    padding: 7px 10px; width: 100%; min-width: 0; transition: border-color .15s, box-shadow .15s;\n  }\n  input::placeholder { color: rgba(239, 232, 216, .3); }\n  input:focus, select:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(233, 196, 106, .16); }\n  input[type=checkbox] { width: auto; accent-color: var(--gold); margin: 0; }\n  input[type=number] { font-variant-numeric: tabular-nums; }\n  select { cursor: pointer; }\n  .f { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--dim); min-width: 0; }\n  .f .cur { color: var(--faint); font-size: 11.5px; margin-top: -3px; }\n  .chk { display: inline-flex; align-items: center; gap: 7px; color: var(--dim); font-size: 13px; cursor: pointer; }\n  .giverow .chk, .row .chk { white-space: nowrap; }\n  .grid { display: grid; gap: 10px 12px; grid-template-columns: repeat(auto-fill, minmax(138px, 1fr)); margin: 6px 0 4px; }\n  .row { display: flex; align-items: center; gap: 10px; }\n  .row.wrap { flex-wrap: wrap; }\n  .row.between { justify-content: space-between; }\n  .row.end { justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }\n  .w120 { width: 120px; }\n  .grow { flex: 1 1 14em; }\n\n  /* 登录 */\n  .login { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }\n  .login form {\n    width: min(390px, 100%); padding: 30px 24px 22px; border-radius: 16px; text-align: center;\n    background: linear-gradient(180deg, var(--panel), var(--bg2)); border: 1px solid var(--line);\n    box-shadow: 0 30px 80px rgba(0, 0, 0, .45);\n  }\n  .login h1 { font-size: 30px; margin: 14px 0 6px; }\n  .login .f { text-align: left; margin: 18px 0 12px; }\n  .login .msg { color: var(--red); min-height: 1.6em; margin: 10px 0 4px; font-size: 13px; }\n  .seal {\n    width: 34px; height: 34px; flex: none; display: grid; place-items: center; background: var(--seal); color: #fbeee0;\n    font: 20px/1 var(--title); border-radius: 6px; transform: rotate(-3deg);\n    box-shadow: inset 0 0 0 2px #8e2a21, inset 0 0 0 3.5px rgba(255, 240, 225, .45);\n  }\n  .seal.big { width: 56px; height: 56px; font-size: 32px; margin: 0 auto; border-radius: 8px; }\n\n  /* 顶栏和分页 */\n  .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 10px; max-width: 1180px; margin: 0 auto; }\n  .brand { display: flex; align-items: center; gap: 11px; min-width: 0; }\n  .brand h1 { font-size: 22px; white-space: nowrap; }\n  .brand small { display: block; margin-top: 1px; }\n  .me { display: flex; align-items: center; gap: 10px; color: var(--dim); font-size: 13px; }\n  .me b { color: var(--gold2); font-weight: 600; }\n  .tabs {\n    position: sticky; top: 0; z-index: 5; background: rgba(10, 11, 28, .9); border-bottom: 1px solid var(--line);\n    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);\n  }\n  .tabs div { display: flex; gap: 2px; overflow-x: auto; max-width: 1180px; margin: 0 auto; padding: 0 8px; scrollbar-width: none; }\n  .tabs div::-webkit-scrollbar { display: none; }\n  .tabs button {\n    flex: none; appearance: none; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--dim); cursor: pointer;\n    font: 500 14.5px/1 var(--body); padding: 13px 13px 11px; transition: color .15s, border-color .15s;\n  }\n  .tabs button:hover { color: var(--ink); }\n  .tabs button[aria-selected=true] { color: var(--gold); border-bottom-color: var(--gold); }\n  main { max-width: 1180px; margin: 0 auto; padding: 18px 16px 70px; }\n  footer { text-align: center; color: var(--faint); font-size: 12px; padding: 0 16px 28px; }\n\n  /* 卡片、数字块 */\n  .card { background: linear-gradient(180deg, var(--panel), var(--bg2)); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 16px; }\n  .card h2 { font-size: 21px; color: var(--gold2); margin-bottom: 8px; }\n  .card h3 { font-size: 17px; margin: 16px 0 8px; }\n  .card.err { color: var(--red); display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }\n  .tiles { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); margin-bottom: 16px; }\n  .tiles.sm { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin: 12px 0 0; }\n  .tile { background: rgba(255, 255, 255, .025); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; min-width: 0; }\n  .tile span { color: var(--dim); font-size: 12.5px; }\n  .tile b { display: block; font: 600 23px/1.25 var(--body); font-variant-numeric: tabular-nums; margin-top: 2px; overflow-wrap: anywhere; }\n  .tile b small { font-weight: 400; color: var(--dim); font-size: 13px; margin-left: 3px; }\n  .tiles.sm .tile { padding: 9px 11px; }\n  .tiles.sm .tile b { font-size: 18px; }\n  .tile i { font-style: normal; color: var(--faint); font-size: 12px; }\n  .badge { display: inline-block; font-size: 11.5px; line-height: 1.5; padding: 0 7px; border-radius: 99px; border: 1px solid var(--line2); color: var(--dim); white-space: nowrap; vertical-align: 1px; font-family: var(--body); letter-spacing: 0; }\n  .badge.gold { color: var(--gold2); border-color: rgba(233, 196, 106, .45); background: var(--goldbg); }\n  .badge.bad { color: var(--red); border-color: rgba(255, 138, 128, .45); background: var(--redbg); }\n  .badge.ok { color: var(--ok); border-color: rgba(116, 217, 173, .4); background: var(--okbg); }\n  .tier { display: inline-block; font-size: 12px; padding: 0 7px; border-radius: 4px; white-space: nowrap; color: rgb(var(--tc)); color: color-mix(in srgb, rgb(var(--tc)) 72%, #fff); background: rgba(var(--tc), .15); border: 1px solid rgba(var(--tc), .38); }\n  .it { white-space: nowrap; }\n  .it b { font-weight: 600; }\n  .it i { font-style: normal; color: var(--faint); margin-left: 6px; font-size: 12.5px; }\n  .it .st { margin-left: 6px; font-size: 11.5px; color: #ffb27a; border: 1px solid rgba(255, 178, 122, .4); border-radius: 4px; padding: 0 5px; }\n\n  /* 表格：太宽时只在表格里横向滚动 */\n  .tw { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; margin-top: 6px; }\n  table { width: 100%; border-collapse: collapse; font-size: 13px; }\n  th { text-align: left; font-weight: 500; color: var(--dim); background: rgba(255, 255, 255, .03); padding: 8px 10px; white-space: nowrap; border-bottom: 1px solid var(--line); }\n  td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }\n  tbody tr:last-child td { border-bottom: 0; }\n  tbody tr:hover td { background: rgba(255, 255, 255, .018); }\n  tr.fail td { color: var(--faint); }\n  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }\n  td.detail { min-width: 200px; overflow-wrap: anywhere; color: var(--dim); }\n  td.mw { min-width: 8.5em; }\n\n  /* 玩家 */\n  .search { display: flex; gap: 8px; margin: 4px 0 8px; }\n  .search input { flex: 1; }\n  .head .who { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }\n  .head .who h2 { margin: 0; font-size: 26px; overflow-wrap: anywhere; }\n  .head .meta { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--faint); font-size: 12.5px; margin-top: 6px; align-items: center; }\n  .crumbs { margin-bottom: 12px; }\n  .giverow { display: grid; grid-template-columns: minmax(0, 1fr) auto 90px auto; gap: 8px; align-items: center; }\n  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 2px; }\n  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 99px; background: var(--goldbg); border: 1px solid rgba(233, 196, 106, .35); font-size: 13px; }\n  .chip button { appearance: none; border: 0; background: none; color: var(--dim); cursor: pointer; font-size: 15px; line-height: 1; padding: 2px 6px; border-radius: 99px; }\n  .chip button:hover { color: var(--ink); background: rgba(255, 255, 255, .08); }\n\n  /* 经济数值 */\n  fieldset.grp { border: 1px solid var(--line); border-radius: 10px; padding: 4px 12px 8px; margin: 12px 0 0; min-width: 0; }\n  fieldset.grp legend { font-family: var(--title); font-size: 16px; color: var(--gold2); padding: 0 6px; }\n  .cfgrow { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(150px, 1fr) minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 8px 0 8px 10px; border-bottom: 1px dashed var(--line); border-left: 2px solid transparent; }\n  .cfgrow:last-of-type { border-bottom: 0; }\n  .cfgrow.mod { border-left-color: rgba(233, 196, 106, .55); }\n  .cfgrow.dirty { border-left-color: var(--ok); background: linear-gradient(90deg, rgba(116, 217, 173, .07), transparent 60%); }\n  .cfgrow label { font-size: 13.5px; }\n  .cfgin { display: flex; align-items: center; gap: 8px; }\n  .cfgin input { max-width: 140px; }\n  .pct { color: var(--faint); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }\n  .sum { font-size: 12.5px; padding: 6px 0 2px 12px; }\n  .sum.ok { color: var(--ok); }\n  .sum.bad { color: var(--red); font-weight: 600; }\n\n  /* 确认框、提示 */\n  dialog {\n    border: 1px solid var(--line2); border-radius: 14px; background: var(--panel2); color: var(--ink); padding: 0;\n    width: min(540px, calc(100vw - 32px)); max-height: calc(100vh - 48px); box-shadow: 0 30px 90px rgba(0, 0, 0, .65);\n  }\n  dialog::backdrop { background: rgba(4, 4, 12, .72); }\n  .dlg-b { padding: 20px 20px 4px; }\n  .dlg-b h3 { font-size: 21px; color: var(--gold2); margin-bottom: 12px; }\n  .dlg-b ul { margin: 0 0 14px; padding-left: 20px; display: grid; gap: 5px; }\n  .dlg-b .f { margin-bottom: 6px; }\n  .dlg-f { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px 18px; }\n  #toast {\n    position: fixed; left: 50%; bottom: 24px; z-index: 50; max-width: calc(100vw - 32px); pointer-events: none;\n    background: var(--panel2); border: 1px solid var(--line2); border-radius: 10px; padding: 10px 16px; box-shadow: 0 12px 40px rgba(0, 0, 0, .5);\n    opacity: 0; transform: translate(-50%, 16px); transition: opacity .2s, transform .2s;\n  }\n  #toast.on { opacity: 1; transform: translate(-50%, 0); }\n  #toast.err { border-color: rgba(255, 138, 128, .55); color: #ffd9d4; }\n\n  @media (max-width: 720px) {\n    .cfgrow { grid-template-columns: minmax(0, 1fr) auto; }\n    .cfgrow label { grid-column: 1 / -1; }\n    .cfgrow .hint { grid-column: 1 / -1; order: 3; }\n    .giverow { grid-template-columns: auto minmax(0, 1fr) auto; }\n    .giverow select { grid-column: 1 / -1; }\n  }\n  @media (max-width: 560px) {\n    body { font-size: 14.5px; }\n    input, select { font-size: 16px; }\n    .top { flex-wrap: wrap; }\n    .brand small { display: none; }\n    .card { padding: 14px 12px; }\n    .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }\n    .tile b { font-size: 19px; }\n    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  }\n  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }\n</style>\n</head>\n<body>\n<div id=\"login\" class=\"login hidden\">\n  <form id=\"loginForm\">\n    <div class=\"seal big\">刃</div>\n    <h1>刃影管理后台</h1>\n    <p class=\"hint\">只给开发组用。每一笔修改都要写原因，都记在流水里。</p>\n    <input type=\"text\" name=\"username\" value=\"renying-admin\" autocomplete=\"username\" hidden>\n    <label class=\"f\">管理口令<input id=\"tok\" type=\"password\" autocomplete=\"current-password\" spellcheck=\"false\" required></label>\n    <button class=\"btn wide\" id=\"loginBtn\">进入</button>\n    <p id=\"loginMsg\" class=\"msg\" role=\"alert\"></p>\n    <p class=\"hint\">口令是 Cloudflare 里 ADMIN_SECRET 的值；写成「名字:口令」的，只输入冒号后面那一段。口令只存在这个标签页里，关掉就要重新输入。</p>\n  </form>\n</div>\n\n<div id=\"app\" class=\"hidden\">\n  <header class=\"top\">\n    <div class=\"brand\"><div class=\"seal\">刃</div><div><h1>刃影管理后台</h1><small>查账号、调墨锭、发补偿和兑换码、改经济数值</small></div></div>\n    <div class=\"me\"><span>管理员 <b id=\"who\"></b></span><button class=\"btn ghost sm\" data-act=\"logout\">退出</button></div>\n  </header>\n  <nav class=\"tabs\" aria-label=\"分页\"><div role=\"tablist\">\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"home\">总览</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"players\">玩家</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"gifts\">补偿</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"codes\">兑换码</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"cfg\">经济数值</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"audit\">操作记录</button>\n  </div></nav>\n  <main id=\"main\"></main>\n  <footer>刃影 · 管理后台 · 所有修改都记在流水里，谁做的、为什么都查得到</footer>\n</div>\n\n<dialog id=\"dlg\"></dialog>\n<div id=\"toast\" role=\"status\" aria-live=\"polite\"></div>\n\n<script>\n'use strict';\nconst NAMES = {\"skins\":{\"qf_frost\":\"烟雨\",\"qf_gold\":\"金乌\",\"qf_abyss\":\"幽渊\",\"fy_jade\":\"碧影\",\"fy_blood\":\"血月\",\"fy_phantom\":\"幻灵\",\"ts_bronze\":\"青铜\",\"ts_obsidian\":\"玄武\",\"ts_crimson\":\"修罗\",\"ls_plum\":\"红梅\",\"ls_aurora\":\"极光\",\"ls_dragon\":\"沧龙\",\"ly_dusk\":\"晚霞\",\"ly_sky\":\"天青\",\"ly_bamboo\":\"墨竹\",\"ly_fox\":\"狐火\",\"lm_violet\":\"紫电\",\"lm_sun\":\"烈阳\",\"lm_asura\":\"金刚\",\"my_cinnabar\":\"朱砂\",\"my_gold\":\"泥金\",\"my_celestial\":\"星墨\",\"yh_sakura\":\"樱月\",\"yh_eclipse\":\"月蚀\",\"yh_solstice\":\"霜华\",\"yl_raven\":\"玄羽\",\"qf_qfx\":\"青锋行\",\"yx_snow\":\"雪箫\",\"yx_celestial\":\"钧天\",\"zx_amber\":\"琥珀\",\"zx_immortal\":\"酒剑仙\",\"gc_crimson\":\"赤锤\",\"gc_underworld\":\"冥狱\",\"yl_phoenix\":\"凤羽\",\"yl_blizzard\":\"雪鸮\",\"qf_p1\":\"竹影\",\"ts_p1\":\"锈蚀\",\"lm_p1\":\"夜雨\",\"fy_p1\":\"沙暴\",\"ly_p1\":\"胭脂\",\"ls_p1\":\"墨梅\",\"yh_p1\":\"碧潮\",\"my_p1\":\"月白\",\"yl_p1\":\"赤霞\",\"gc_p1\":\"苔痕\",\"yx_p1\":\"紫檀\",\"zx_p1\":\"松烟\",\"qf_p2\":\"赤练\",\"ts_p2\":\"冰川\",\"ls_p2\":\"琥珀\",\"lm_p2\":\"霓虹\",\"fy_p2\":\"夜航\",\"ly_p2\":\"苍山\",\"yh_p2\":\"鎏金\",\"yl_p2\":\"夜鸦\",\"my_p2\":\"青花\",\"gc_p2\":\"赭石\",\"yx_p2\":\"靛青\",\"zx_p2\":\"青瓷\",\"gc_wolf\":\"霜狼\",\"zx_moon\":\"醉月\",\"qf_renying\":\"刃影\",\"lm_jiuxiao\":\"九霄\",\"yh_guanghan\":\"广寒\",\"ls_tianhe\":\"天河\",\"fy_huandie\":\"幻蝶\",\"ts_liuli\":\"琉璃\",\"yx_tianlai\":\"天籁\",\"my_qinglv\":\"青绿\",\"yl_kongque\":\"孔雀\",\"ly_jinli\":\"锦鲤\",\"qf_zpis\":\"双鱼·星辉\",\"qf_zsag\":\"射手·星焰\",\"qf_zleo\":\"狮子·星冕\",\"fy_ztau\":\"金牛·星辉\",\"fy_zaqu\":\"水瓶·星焰\",\"fy_zsco\":\"天蝎·星冕\",\"ts_zcap\":\"摩羯·星辉\",\"ts_zleo\":\"狮子·星焰\",\"ts_ztau\":\"金牛·星冕\",\"ls_zgem\":\"双子·星辉\",\"ls_zsco\":\"天蝎·星焰\",\"ls_zsag\":\"射手·星冕\",\"ly_zvir\":\"处女·星辉\",\"ly_zpis\":\"双鱼·星焰\",\"ly_zlib\":\"天秤·星冕\",\"lm_zleo\":\"狮子·星辉\",\"lm_zcap\":\"摩羯·星焰\",\"lm_zari\":\"白羊·星冕\",\"my_zaqu\":\"水瓶·星辉\",\"my_zlib\":\"天秤·星焰\",\"my_zvir\":\"处女·星冕\",\"yh_zlib\":\"天秤·星辉\",\"yh_zvir\":\"处女·星焰\",\"yh_zcan\":\"巨蟹·星冕\",\"yl_zsag\":\"射手·星辉\",\"yl_zari\":\"白羊·星焰\",\"yl_zgem\":\"双子·星冕\",\"yx_zcan\":\"巨蟹·星辉\",\"yx_zgem\":\"双子·星焰\",\"yx_zpis\":\"双鱼·星冕\",\"zx_zsco\":\"天蝎·星辉\",\"zx_zcan\":\"巨蟹·星焰\",\"zx_zaqu\":\"水瓶·星冕\",\"gc_zari\":\"白羊·星辉\",\"gc_ztau\":\"金牛·星焰\",\"gc_zcap\":\"摩羯·星冕\"},\"heroes\":{\"qingfeng\":\"青锋\",\"feiying\":\"绯影\",\"tieshan\":\"铁山\",\"lingshuang\":\"凌霜\",\"liuyun\":\"流云\",\"leiming\":\"雷鸣\",\"moyu\":\"墨羽\",\"yuehua\":\"月华\",\"yanling\":\"燕翎\",\"yuxiao\":\"玉箫\",\"zuixian\":\"醉翁\",\"gouchen\":\"勾陈\"}};   // 打包时填上：{ skins: { 皮肤 key: 名字 }, heroes: { 侠客 id: 名字 } }\nconst SKIN = (NAMES && NAMES.skins) || {}, HERO = (NAMES && NAMES.heroes) || {};\nconst $ = (sel, el = document) => el.querySelector(sel);\n\n/* ---------- 拼网页：H`…${值}…` 里的值一律转义，只有 H 拼出来的才原样放进去 ---------- */\nconst ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' };\nconst esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>\"']/g, c => ESC[c]);\nclass Raw { constructor(s) { this.s = s; } }\nconst put = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(put).join('') : esc(v);\nconst H = (strs, ...vals) => new Raw(strs.reduce((o, s, i) => o + s + (i < vals.length ? put(vals[i]) : ''), ''));\nconst paint = (el, raw) => { el.innerHTML = put(raw); };\n\n/* ---------- 数字和时间 ---------- */\nconst fmtN = n => Math.round(+n || 0).toLocaleString('zh-CN');\nconst sign = n => (n > 0 ? '+' : '') + fmtN(n);\nconst pad = n => String(n).padStart(2, '0');\nfunction fmtT(ms) {\n  if (!ms) return '—';\n  const d = new Date(+ms);\n  return (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());\n}\nfunction ago(ms) {\n  if (!ms) return '—';\n  const s = (Date.now() - ms) / 1000;\n  if (s < 60) return '刚刚';\n  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';\n  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';\n  if (s < 30 * 86400) return Math.floor(s / 86400) + ' 天前';\n  return fmtT(ms);\n}\nconst parse = t => { try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };\n\n/* ---------- 口令、请求 ---------- */\nconst KEY = 'renying-admin';\nconst S = { tok: '', who: '', tab: 'home', uid: '', q: '', p: null, give: [], gifts: [], codes: [], cfg: null, seq: 0 };\nconst saveTok = t => { try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch (e) {} };\nconst loadTok = () => { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } };\n\nasync function api(path, body) {\n  const headers = { Authorization: 'Bearer ' + S.tok };\n  if (body) headers['Content-Type'] = 'application/json';\n  let r;\n  try { r = await fetch('/api/admin/' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); }\n  catch (e) { throw new Error('连不上服务器，检查一下网络'); }\n  let j = {};\n  try { j = await r.json(); } catch (e) {}\n  if (r.status === 403 && S.who) { logout('口令失效了（可能刚换过），请重新输入'); throw new Error('口令失效了'); }\n  if (!r.ok || !j.ok) throw new Error(j.error || '出错了（' + r.status + '）');\n  return j;\n}\n\n/* ---------- 武器箱、饰品、品质（登录后从服务器读一次） ---------- */\nconst CAT = { items: {}, cols: {}, tiers: {}, order: [], caseIds: [], cfgInfo: [] };\nfunction useCat(c) {\n  CAT.order = c.tiers.map(t => t.id);\n  for (const t of c.tiers) CAT.tiers[t.id] = t;\n  for (const x of c.cols) CAT.cols[x.id] = x;\n  for (const x of c.items) CAT.items[x.k] = x;\n  CAT.caseIds = c.cols.map(x => x.id);\n  CAT.cfgInfo = c.cfg || [];\n}\nconst itemName = k => SKIN[k] || k;\nconst heroOf = k => HERO[(CAT.items[k] || {}).char] || '';\nconst caseName = c => CAT.cols[c] ? CAT.cols[c].name + '武器箱' : String(c || '—');\nconst tierTag = t => CAT.tiers[t] ? H`<span class=\"tier\" style=\"--tc:${CAT.tiers[t].c}\">${CAT.tiers[t].n}</span>` : '';\nconst itemTag = (k, st) => H`<span class=\"it\"><b>${itemName(k)}</b><i>${heroOf(k)}</i>${st >= 0 ? H`<span class=\"st\">斩数 ${st}</span>` : ''}</span>`;\nconst cfgName = k => { const x = CAT.cfgInfo.find(r => r[0] === k); return x ? x[5] + '：' + x[6] : k; };\nconst unit = (n, u) => H`${fmtN(n)}<small>${u}</small>`;\nconst tile = (label, v, sub) => H`<div class=\"tile\"><span>${label}</span><b>${typeof v === 'number' ? fmtN(v) : v}</b>${sub ? H`<i>${sub}</i>` : ''}</div>`;\nconst SRC = { case: '开箱', term: '终端机', trade: '汰换', supply: '补给', op: '星章兑换', admin: '管理员发的' };\nconst ACT = {\n  open: '开箱', store: '商店', buyCase: '买武器箱', buyTerm: '买终端机', list: '挂单', buy: '买下', cancel: '撤单', trade: '汰换', rename: '改名',\n  equip: '穿上', unequip: '脱下', unseal: '开封终端机', termNext: '终端机换一件', termBuy: '终端机买下', supply: '领补给', mission: '领任务奖励',\n  star: '星章兑换', collect: '集齐奖励', matchEnd: '对局结束', matchStart: '开局', sync: '同步', gift: '新手礼',\n  ledger: '本机收入', ink_spike: '大额上报', invariant: '数值异常', strike: '反作弊记过', open_account: '建武库存档',\n  admin: '管理员调整', admin_ban: '封号', pardon: '解封', admin_pw: '重设密码', gift_got: '领到补偿', gift_new: '发补偿', gift_off: '停发补偿', cfg: '改经济数值',\n  claimCode: '兑换', code_got: '兑换礼包码', code_new: '建兑换码', code_off: '停用兑换码',\n};\n\n/* ---------- 流水里的详情写成人话 ---------- */\nfunction stuff(d) {   // 墨锭、武器箱、终端机、改名标签（调整、补偿共用）\n  const out = [];\n  if (d.ink) out.push('墨锭 ' + sign(d.ink));\n  for (const [c, n] of Object.entries(d.cases || {})) out.push(caseName(c) + ' ' + sign(n));\n  if (d.term) out.push('终端机 ' + sign(d.term));\n  if (d.tags) out.push('改名标签 ' + sign(d.tags));\n  return out;\n}\nfunction itemRef(s) {   // \"qf_p1#12 st\" → 竹影 #12（斩数版）\n  const m = /^([a-z]{2}_[a-z0-9]+)#(\\d+)( st)?$/.exec(String(s));\n  return m ? itemName(m[1]) + ' #' + m[2] + (m[3] ? '（斩数版）' : '') : String(s);\n}\nconst giftText = g => {\n  const it = g.items || g, out = [];\n  if (g.ink) out.push('墨锭 ' + fmtN(g.ink));\n  for (const [c, n] of Object.entries(it.cases || {})) out.push(caseName(c) + ' ×' + n);\n  if (it.term) out.push('终端机 ×' + it.term);\n  if (it.tags) out.push('改名标签 ×' + it.tags);\n  return out.join('、') || '—';\n};\nconst argText = (k, v) => k === 'c' ? caseName(v) : k === 'i' ? '#' + v : k === 'price' ? '标价 ' + fmtN(v) : k === 'l' ? '单号 ' + String(v).slice(0, 6) : k + ' ' + v;\nfunction detailText(act, raw, withWho) {\n  const d = parse(raw);\n  if (!d) return raw || '';\n  const who = withWho && d.by ? d.by + (d.why ? '：' + d.why : '') + '｜' : '';\n  if (act === 'admin') return who + [...stuff(d), ...(d.give || []).map(x => '发 ' + itemRef(x)), ...(d.take || []).map(x => '收 ' + itemRef(x))].join('，');\n  if (act === 'admin_ban') return who + (d.days === 'perm' ? '永久封号' : '封 ' + d.days + ' 天');\n  if (act === 'pardon') return who + '解封';\n  if (act === 'admin_pw') return who + (d.created ? '建号，设好密码' : '重设密码，别处的登录都退出了');\n  if (act === 'gift_new') return who + [...stuff(d), d.days + ' 天内有效', d.newToo ? '之后新注册的也能领' : ''].filter(Boolean).join('，');\n  if (act === 'gift_off') return who + '停发 ' + d.id;\n  if (act === 'gift_got') return (d.note || '') + '：' + stuff(d).join('，');\n  if (act === 'code_new') return who + [d.code, ...stuff(d), '最多 ' + fmtN(d.uses) + ' 个号', d.days + ' 天内有效'].join('，');\n  if (act === 'code_off') return who + '停用 ' + d.code;\n  if (act === 'code_got') return d.code + '（' + (d.note || '') + '）：' + stuff(d).join('，');\n  if (act === 'cfg') return who + (d.undo !== undefined ? (d.undo ? '退回到第 ' + d.undo + ' 版' : '全部回到默认值') + '（存成第 ' + d.id + ' 版）'\n    : '第 ' + d.id + ' 版：' + Object.entries(d.set || {}).map(([k, v]) => cfgName(k) + (v === null ? ' 回到默认' : ' → ' + v)).join('，'));\n  // 玩家自己的操作：{ a: 参数, r: 结果, s: 这次结了几单 }\n  const parts = [];\n  if (d.r !== undefined && d.r !== '') parts.push(typeof d.r === 'number' ? fmtN(d.r) : itemRef(d.r));\n  if (d.s) parts.push('结了 ' + d.s + ' 单');\n  if (d.a && typeof d.a === 'object') {\n    const a = Object.entries(d.a).filter(([, v]) => v !== '' && v !== null && typeof v !== 'object').map(([k, v]) => argText(k, v)).join(' ');\n    if (a) parts.push(a);\n  }\n  return parts.join(' · ');\n}\nconst inkCell = r => r.ink0 === null || r.ink0 === undefined || r.ink1 === null || r.ink1 === undefined ? ''\n  : r.ink1 === r.ink0 ? fmtN(r.ink1) : H`${fmtN(r.ink0)} → <b class=\"${r.ink1 > r.ink0 ? 'up' : 'down'}\">${fmtN(r.ink1)}</b>`;\nconst target = r => r.uid === '*' ? '全服' : r.username ? H`<button class=\"link\" data-act=\"open\" data-uid=\"${r.uid}\">${r.username}</button>` : H`<span class=\"mono\">${r.uid}</span>`;\n\n/* ---------- 确认框：每一笔修改先给你看要改什么，再写原因 ---------- */\nfunction ask({ title, lines = [], whyInit = '', ok = '确定', danger = false }) {\n  const d = $('#dlg');\n  paint(d, H`<form>\n    <div class=\"dlg-b\"><h3>${title}</h3>${lines.length ? H`<ul>${lines.map(l => H`<li>${l}</li>`)}</ul>` : ''}\n      <label class=\"f\">原因（记进流水，至少 2 个字）<input name=\"why\" maxlength=\"100\" value=\"${whyInit}\" autocomplete=\"off\"></label></div>\n    <div class=\"dlg-f\"><button type=\"button\" class=\"btn ghost\" data-x=\"no\">取消</button><button class=\"btn${danger ? ' danger' : ''}\">${ok}</button></div>\n  </form>`);\n  return new Promise(res => {\n    const f = $('form', d), inp = f.elements.why;\n    const done = v => { d.oncancel = null; if (d.open) d.close(); res(v); };\n    f.addEventListener('submit', e => {\n      e.preventDefault();\n      const why = inp.value.trim();\n      if (why.length < 2) { inp.focus(); inp.placeholder = '要写原因'; return; }\n      done({ why });\n    });\n    $('[data-x=no]', f).addEventListener('click', () => done(null));\n    d.oncancel = e => { e.preventDefault(); done(null); };\n    d.showModal();\n    inp.focus();\n  });\n}\nlet toastT = 0;\nfunction toast(msg, err) {\n  const t = $('#toast');\n  t.textContent = msg;\n  t.className = 'on' + (err ? ' err' : '');\n  clearTimeout(toastT);\n  toastT = setTimeout(() => { t.className = ''; }, err ? 5000 : 2800);\n}\nasync function busy(btn, fn) {\n  if (btn) btn.disabled = true;\n  try { return await fn(); }\n  catch (e) { toast(e.message, true); }\n  finally { if (btn && btn.isConnected) btn.disabled = false; }\n}\nconst numIn = (f, name) => { const el = f.elements[name], v = el ? el.value.trim() : ''; return v === '' ? 0 : Number(v); };\nconst submitBtn = f => $('button:not([type=button])', f);\n\n/* ---------- 总览 ---------- */\nasync function vHome() {\n  const [s, a] = await Promise.all([api('stats'), api('audit')]);\n  const rows = a.rows.slice(0, 8);\n  return H`<div class=\"tiles\">\n      ${tile('注册账号', s.users, '24 小时内新注册 ' + fmtN(s.newToday))}\n      ${tile('有武库存档的', s.accounts, '打开过武库的账号')}\n      ${tile('全服墨锭', s.inkTotal, '所有武库存档加起来')}\n      ${tile('市场在卖', unit(s.open, '单'), '玩家挂出来的')}\n      ${tile('24 小时成交', unit(s.deals24, '单'), '成交额 ' + fmtN(s.dealInk24) + ' 墨锭')}\n      ${tile('封禁中', unit(s.banned, '个号'), '包括永久封号')}\n      ${tile('经济数值', s.cfgId ? '第 ' + s.cfgId + ' 版' : '默认', s.cfgId ? '改过' : '没改过')}\n    </div>\n    <div class=\"card\"><div class=\"row between\"><h2>最近的操作</h2><button class=\"btn ghost sm\" data-act=\"tab\" data-tab=\"audit\">全部记录</button></div>\n      ${rows.length ? H`<div class=\"tw\"><table><thead><tr><th>时间</th><th>谁</th><th>做了什么</th><th>对象</th><th>内容</th></tr></thead><tbody>\n        ${rows.map(r => { const d = parse(r.detail) || {}; return H`<tr><td class=\"nowrap\">${fmtT(r.at)}</td><td>${d.by || '—'}</td><td class=\"nowrap\">${ACT[r.act] || r.act}</td><td>${target(r)}</td><td class=\"detail\">${detailText(r.act, r.detail)}${d.why ? H`<div class=\"hint\">原因：${d.why}</div>` : ''}</td></tr>`; })}\n      </tbody></table></div>` : H`<p class=\"empty\">还没有管理员操作</p>`}\n    </div>\n    <div class=\"card\"><h2>常用</h2><div class=\"row wrap\">\n      <button class=\"btn ghost\" data-act=\"tab\" data-tab=\"players\">找玩家、加减墨锭</button>\n      <button class=\"btn ghost\" data-act=\"tab\" data-tab=\"gifts\">发全服补偿</button>\n      <button class=\"btn ghost\" data-act=\"tab\" data-tab=\"codes\">建兑换码</button>\n      <button class=\"btn ghost\" data-act=\"tab\" data-tab=\"cfg\">改价格、爆率</button>\n    </div></div>`;\n}\n\n/* ---------- 玩家：搜索 ---------- */\nasync function vPlayers() {\n  if (S.uid) return vPlayer();\n  const r = await api('find?q=' + encodeURIComponent(S.q));\n  return H`<div class=\"card\">\n    <h2>玩家</h2>\n    <form class=\"search\" data-form=\"find\"><input name=\"q\" value=\"${S.q}\" placeholder=\"昵称开头，或者账号编号（u_ 开头）\" autocomplete=\"off\" spellcheck=\"false\" aria-label=\"搜索玩家\"><button class=\"btn\">搜索</button></form>\n    <p class=\"hint\">${S.q ? '“' + S.q + '” 的结果（最多 20 个）' : '最近动过武库的 20 个账号'}</p>\n    ${r.users.length ? H`<div class=\"tw\"><table><thead><tr><th>昵称</th><th class=\"num\">墨锭</th><th>上次动武库</th><th>注册</th></tr></thead><tbody>\n      ${r.users.map(u => H`<tr><td><button class=\"link\" data-act=\"open\" data-uid=\"${u.id}\">${u.username}</button><div class=\"hint mono\">${u.id}</div></td>\n        <td class=\"num\">${u.ink === null || u.ink === undefined ? '—' : fmtN(u.ink)}</td><td class=\"nowrap\">${ago(u.updated_at)}</td><td class=\"nowrap\">${fmtT(u.created_at)}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">没找到这个昵称</p>`}\n  </div>${S.q.toLowerCase() === 'dev' && !r.users.some(u => String(u.username).toLowerCase() === 'dev') ? devCard() : ''}`;\n}\nfunction devCard() {   // 云端还没有 Dev：只能在这里建，别人注册不了\n  return H`<form class=\"card\" data-form=\"mkdev\" novalidate>\n    <h2>建 Dev 账号</h2>\n    <p class=\"hint\">云端还没有 Dev。Dev 是开发组的市场账号，库存不受限，只能在这里建。填一个密码（至少 12 位），或者点「随机生成」。</p>\n    <div class=\"row wrap\"><label class=\"f grow\">密码<input name=\"pw\" type=\"text\" maxlength=\"128\" autocomplete=\"off\" spellcheck=\"false\"></label>\n      <button type=\"button\" class=\"btn ghost\" data-act=\"genpw\" style=\"margin-top:18px\">随机生成</button>\n      <button class=\"btn\" style=\"margin-top:18px\">建号…</button></div>\n  </form>`;\n}\n\n/* ---------- 玩家：一个号的详情、加减、封号、流水 ---------- */\nfunction itemOptions() {\n  return H`<option value=\"\">选一件饰品…</option>${CAT.caseIds.map(c => H`<optgroup label=\"${caseName(c)}\">${CAT.order\n    .flatMap(t => Object.values(CAT.items).filter(x => x.col === c && x.tier === t))\n    .map(x => H`<option value=\"${x.k}\">${itemName(x.k)} · ${heroOf(x.k)} · ${CAT.tiers[x.tier].n}</option>`)}</optgroup>`)}`;\n}\nasync function vPlayer() {\n  const p = S.p = await api('econ?uid=' + encodeURIComponent(S.uid));\n  S.give = [];\n  const e = p.econ, s = (e && e.state) || {}, now = Date.now();\n  const inv = Array.isArray(s.inv) ? s.inv : [], lst = Array.isArray(s.lst) ? s.lst : [], cases = s.cases || {};\n  const worn = new Set(Object.values(s.eq || {})), sc = p.sanction || {}, isBan = !!(sc.perm || sc.banUntil > now);\n  const nCases = CAT.caseIds.reduce((a, c) => a + (+cases[c] || 0), 0), pr = p.profile || {};\n  return H`<div class=\"crumbs\"><button class=\"btn ghost sm\" data-act=\"back\">← 玩家列表</button></div>\n  <div class=\"card head\">\n    <div class=\"who\"><h2>${p.username}</h2>${isBan ? H`<span class=\"badge bad\">${sc.perm ? '永久封禁' : '封禁中'}</span>` : ''}</div>\n    <div class=\"meta\"><span class=\"mono\">${p.uid}</span><button class=\"btn ghost sm\" data-act=\"copy\" data-v=\"${p.uid}\">复制编号</button>\n      <span>注册于 ${fmtT(p.createdAt)}</span><span>上次动武库：${e ? ago(e.at) : '还没打开过'}</span></div>\n    <div class=\"tiles sm\">\n      ${tile('墨锭', e ? e.ink : 0)}${tile('饰品', unit(inv.length, '件'))}${tile('在卖', unit(lst.length, '单'))}${tile('武器箱', unit(nCases, '个'))}\n      ${tile('终端机', unit(+s.term || 0, '台'))}${tile('改名标签', unit(+s.tags || 0, '张'))}${tile('段位分', pr.rating === undefined ? '—' : pr.rating)}${tile('联机', H`${pr.netWins || 0}<small>胜</small> ${pr.netLosses || 0}<small>负</small>`)}\n    </div>\n    ${e ? '' : H`<p class=\"hint\" style=\"margin-top:10px\">这个号还没打开过武库：第一次调整时会先按它的存档建好武库，再加减。</p>`}\n  </div>\n  <form data-form=\"adjust\" novalidate>\n    <div class=\"card\">\n      <h2>加减</h2>\n      <p class=\"hint\">正数是加，负数是扣，空着就是不动。墨锭一次最多 ±1,000,000；武器箱、终端机、改名标签一次最多 ±1,000。扣不成负数。</p>\n      <div class=\"grid\">\n        <label class=\"f\">墨锭<span class=\"cur\">现有 ${fmtN(e ? e.ink : 0)}</span><input type=\"number\" name=\"ink\" step=\"1\" placeholder=\"0\"></label>\n        ${CAT.caseIds.map(c => H`<label class=\"f\">${caseName(c)}<span class=\"cur\">现有 ${+cases[c] || 0}</span><input type=\"number\" name=\"case_${c}\" step=\"1\" placeholder=\"0\"></label>`)}\n        <label class=\"f\">终端机<span class=\"cur\">现有 ${+s.term || 0}</span><input type=\"number\" name=\"term\" step=\"1\" placeholder=\"0\"></label>\n        <label class=\"f\">改名标签<span class=\"cur\">现有 ${+s.tags || 0}</span><input type=\"number\" name=\"tags\" step=\"1\" placeholder=\"0\"></label>\n      </div>\n      <h3>发饰品</h3>\n      <div class=\"giverow\">\n        <select name=\"gk\" aria-label=\"选一件饰品\">${itemOptions()}</select>\n        <label class=\"chk\"><input type=\"checkbox\" name=\"gst\"> 斩数版</label>\n        <input type=\"number\" name=\"gstn\" min=\"0\" step=\"1\" value=\"0\" aria-label=\"斩数（记了多少次击倒）\">\n        <button type=\"button\" class=\"btn ghost\" data-act=\"addgive\">加进清单</button>\n      </div>\n      <div id=\"gives\" class=\"chips\"></div>\n      <p class=\"hint\">要收走饰品，在下面的库存里勾上。挂在市场上的收不了。</p>\n      <div class=\"row end\"><button class=\"btn\">检查并提交…</button></div>\n    </div>\n    <div class=\"card\">\n      <h2>库存 <small>${inv.length} 件</small></h2>\n      ${inv.length ? H`<div class=\"tw\"><table><thead><tr><th>收走</th><th>编号</th><th>饰品</th><th>品质</th><th>武器箱</th><th>来源</th><th>拿到</th></tr></thead><tbody>\n        ${inv.slice().sort((a, b) => b.i - a.i).map(it => { const d = CAT.items[it.k] || {}; return H`<tr>\n          <td><input type=\"checkbox\" name=\"take\" value=\"${it.i}\" aria-label=\"收走第 ${it.i} 号\"></td><td class=\"mono\">#${it.i}</td>\n          <td>${itemTag(it.k, it.st)}${worn.has(it.i) ? H` <span class=\"badge ok\">穿着</span>` : ''}${it.n ? H`<div class=\"hint\">改了名：${it.n}</div>` : ''}</td>\n          <td>${tierTag(d.tier)}</td><td class=\"nowrap\">${caseName(d.col)}</td><td class=\"nowrap\">${SRC[it.src] || it.src || '—'}</td><td class=\"nowrap\">${fmtT(it.t)}</td></tr>`; })}\n      </tbody></table></div>` : H`<p class=\"empty\">库存是空的</p>`}\n      ${lst.length ? H`<h3>挂在玩家市场上的 <small>要等玩家撤下或者卖掉</small></h3><div class=\"tw\"><table><thead><tr><th>编号</th><th>饰品</th><th>品质</th><th class=\"num\">标价</th></tr></thead><tbody>\n        ${lst.map(L => H`<tr><td class=\"mono\">#${L.it.i}</td><td>${itemTag(L.it.k, L.it.st)}</td><td>${tierTag((CAT.items[L.it.k] || {}).tier)}</td><td class=\"num\">${fmtN(L.price)}</td></tr>`)}\n      </tbody></table></div>` : ''}\n    </div>\n  </form>\n  ${banCard(sc, isBan)}\n  ${pwCard(p)}\n  ${logCard(p.log || [])}\n  ${mktCard(p)}`;\n}\nfunction banCard(sc, isBan) {\n  return H`<form class=\"card\" data-form=\"ban\" novalidate>\n    <h2>封号</h2>\n    ${isBan ? H`<p>${sc.perm ? '永久封禁。' : '封禁中，到 ' + fmtT(sc.banUntil) + '。'}</p><div class=\"row\"><button type=\"button\" class=\"btn\" data-act=\"pardon\">解封…</button></div>`\n      : H`<div class=\"row wrap\"><label class=\"f w120\">封几天<input type=\"number\" name=\"days\" min=\"1\" max=\"3650\" step=\"1\" value=\"1\"></label>\n        <label class=\"chk\" style=\"margin-top:18px\"><input type=\"checkbox\" name=\"perm\"> 永久封号</label>\n        <button class=\"btn danger\" style=\"margin-top:18px\">封号…</button></div>`}\n    <p class=\"hint\" style=\"margin-top:10px\">反作弊记过 ${sc.strikes || 0} 次${sc.pardon ? '，上次解封在 ' + fmtT(sc.pardon) : ''}。封禁期间不能同步存档、不能交易；解封后玩家刷新网页就好了。</p>\n    ${(sc.log || []).length ? H`<div class=\"tw\"><table><thead><tr><th>时间</th><th>原因</th><th>来源</th></tr></thead><tbody>\n      ${sc.log.slice().reverse().map(x => H`<tr><td class=\"nowrap\">${fmtT(x.at)}</td><td>${x.r}</td><td class=\"nowrap\">${String(x.src || '').replace(/^admin:/, '管理员 ').replace(/^client$/, '网页检测').replace(/^server$/, '服务器检测')}</td></tr>`)}\n    </tbody></table></div>` : ''}\n  </form>`;\n}\nfunction pwCard(p) {\n  const dev = String(p.username || '').toLowerCase() === 'dev';\n  return H`<form class=\"card\" data-form=\"pw\" novalidate>\n    <h2>重设密码</h2>\n    <p class=\"hint\">${dev ? 'Dev 是开发组的市场账号，它的密码只能在这里改。' : ''}填一个新密码（至少 12 位），或者点「随机生成」。重设以后，这个号在所有设备上的登录都会退出，要用新密码重新登录。</p>\n    <div class=\"row wrap\"><label class=\"f grow\">新密码<input id=\"newpw\" name=\"pw\" type=\"text\" maxlength=\"128\" autocomplete=\"off\" spellcheck=\"false\"></label>\n      <button type=\"button\" class=\"btn ghost\" data-act=\"genpw\" style=\"margin-top:18px\">随机生成</button>\n      <button class=\"btn danger\" style=\"margin-top:18px\">重设密码…</button></div>\n  </form>`;\n}\nfunction logCard(log) {\n  return H`<div class=\"card\"><h2>流水 <small>最近 ${log.length} 条</small></h2>\n    ${log.length ? H`<div class=\"tw\"><table><thead><tr><th>时间</th><th>操作</th><th class=\"num\">墨锭</th><th>详情</th></tr></thead><tbody>\n      ${log.map(r => H`<tr class=\"${r.ok ? '' : 'fail'}\"><td class=\"nowrap\">${fmtT(r.at)}</td><td class=\"nowrap\">${ACT[r.act] || r.act}${r.ok ? '' : H` <span class=\"badge bad\">没成</span>`}</td>\n        <td class=\"num\">${inkCell(r)}</td><td class=\"detail\">${detailText(r.act, r.detail, true)}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">还没有流水</p>`}</div>`;\n}\nfunction mktCard(p) {\n  const rows = p.mkt || [];\n  if (!rows.length) return '';\n  const stText = r => r.state === 0 ? '在卖' : r.state === 2 ? '撤下了' : r.seller === p.uid ? (r.paid ? '卖掉了，已到账' : '卖掉了，下次动武库时到账') : '买到了';\n  return H`<div class=\"card\"><h2>玩家市场 <small>最近 ${rows.length} 单</small></h2><div class=\"tw\"><table>\n    <thead><tr><th>时间</th><th>买还是卖</th><th>饰品</th><th class=\"num\">价格</th><th>状态</th></tr></thead><tbody>\n    ${rows.map(r => H`<tr><td class=\"nowrap\">${fmtT(r.done_at || r.at)}</td><td>${r.seller === p.uid ? '卖' : '买'}</td><td>${itemTag(r.k, r.st)}</td><td class=\"num\">${fmtN(r.price)}</td><td class=\"nowrap\">${stText(r)}</td></tr>`)}\n  </tbody></table></div></div>`;\n}\nfunction drawGives() {\n  const el = $('#gives');\n  if (el) paint(el, S.give.map((g, i) => H`<span class=\"chip\">${itemName(g.k)}（${heroOf(g.k)}）${g.st >= 0 ? ' 斩数 ' + g.st : ''}<button type=\"button\" data-act=\"delgive\" data-i=\"${i}\" aria-label=\"去掉\">×</button></span>`));\n}\n\n/* ---------- 补偿 ---------- */\nasync function vGifts() {\n  const r = await api('gifts');\n  S.gifts = r.gifts;\n  const now = Date.now();\n  const state = g => g.off ? H`<span class=\"badge\">停发了</span>` : g.until <= now ? H`<span class=\"badge\">过期了</span>` : H`<span class=\"badge ok\">发放中</span>`;\n  return H`<form class=\"card\" data-form=\"gift\" novalidate>\n    <h2>发补偿</h2>\n    <p class=\"hint\">玩家下次登录或者打开武库时自动领到，每个账号只领一次；游戏里会弹出「开发组补偿：说明（内容）」。</p>\n    <div class=\"grid\">\n      <label class=\"f\">发给<select name=\"to\"><option value=\"all\">所有人</option><option value=\"one\">一个账号</option></select></label>\n      <label class=\"f hidden\" data-one>昵称或账号编号<input name=\"user\" autocomplete=\"off\" spellcheck=\"false\"></label>\n      <label class=\"f\">墨锭<input type=\"number\" name=\"ink\" min=\"0\" max=\"1000000\" step=\"1\" placeholder=\"0\"></label>\n      ${CAT.caseIds.map(c => H`<label class=\"f\">${caseName(c)}<input type=\"number\" name=\"gc_${c}\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>`)}\n      <label class=\"f\">终端机<input type=\"number\" name=\"term\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>\n      <label class=\"f\">改名标签<input type=\"number\" name=\"tags\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>\n      <label class=\"f\">几天内能领<input type=\"number\" name=\"days\" min=\"1\" max=\"90\" step=\"1\" value=\"14\"></label>\n    </div>\n    <label class=\"f\" style=\"margin-top:8px\">给玩家看的说明（2～60 个字）<input name=\"note\" maxlength=\"60\" placeholder=\"比如：服务器维护补偿\"></label>\n    <label class=\"chk\" style=\"margin-top:10px\" data-all><input type=\"checkbox\" name=\"newToo\"> 之后新注册的账号也能领（不勾就只发给现在已经注册的，免得有人开小号来领）</label>\n    <div class=\"row end\"><button class=\"btn\">检查并发出…</button></div>\n  </form>\n  <div class=\"card\"><h2>发过的补偿 <small>最近 50 份</small></h2>\n    ${r.gifts.length ? H`<div class=\"tw\"><table><thead><tr><th>说明</th><th>发给</th><th>内容</th><th class=\"num\">领了</th><th>谁发的</th><th>发出</th><th>截止</th><th>状态</th><th></th></tr></thead><tbody>\n      ${r.gifts.map(g => H`<tr><td class=\"mw\">${g.note}</td><td class=\"nowrap\">${g.uid === '*' ? (g.born > g.at ? '所有人（含新号）' : '所有人') : (g.username || g.uid)}</td><td class=\"mw\">${giftText(g)}</td>\n        <td class=\"num\">${fmtN(g.got)}</td><td>${g.by}</td><td class=\"nowrap\">${fmtT(g.at)}</td><td class=\"nowrap\">${fmtT(g.until)}</td><td>${state(g)}</td>\n        <td>${!g.off && g.until > now ? H`<button class=\"btn ghost sm\" data-act=\"giftoff\" data-id=\"${g.id}\">停发…</button>` : ''}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">还没发过补偿</p>`}\n  </div>`;\n}\n\n/* ---------- 兑换码 ---------- */\nasync function vCodes() {\n  const r = await api('codes');\n  S.codes = r.codes;\n  const now = Date.now();\n  const state = c => c.off ? H`<span class=\"badge\">停用了</span>` : c.until <= now ? H`<span class=\"badge\">过期了</span>` : c.got >= c.uses ? H`<span class=\"badge\">领完了</span>` : H`<span class=\"badge ok\">能领</span>`;\n  return H`<form class=\"card\" data-form=\"code\" novalidate>\n    <h2>建兑换码</h2>\n    <p class=\"hint\">玩家在游戏的「任务 → 礼包兑换」里输入就能领，要登录云端账号，每个号只领一次。码只存在服务器上，不在代码里。公开发出去的码，看到的人都能领，领满人数就停；只想给少数人的，用随机生成的码。</p>\n    <div class=\"grid\">\n      <label class=\"f\">兑换码（不填就随机生成）<input name=\"code\" maxlength=\"20\" placeholder=\"比如 SPRING2026\" autocomplete=\"off\" spellcheck=\"false\"></label>\n      <label class=\"f\">墨锭<input type=\"number\" name=\"ink\" min=\"0\" max=\"1000000\" step=\"1\" placeholder=\"0\"></label>\n      ${CAT.caseIds.map(c => H`<label class=\"f\">${caseName(c)}<input type=\"number\" name=\"cc_${c}\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>`)}\n      <label class=\"f\">终端机<input type=\"number\" name=\"term\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>\n      <label class=\"f\">改名标签<input type=\"number\" name=\"tags\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>\n      <label class=\"f\">最多几个号能领<input type=\"number\" name=\"uses\" min=\"1\" max=\"100000\" step=\"1\" value=\"100\"></label>\n      <label class=\"f\">几天内能领<input type=\"number\" name=\"days\" min=\"1\" max=\"90\" step=\"1\" value=\"14\"></label>\n    </div>\n    <label class=\"f\" style=\"margin-top:8px\">给玩家看的说明（2～60 个字）<input name=\"note\" maxlength=\"60\" placeholder=\"比如：新春礼包\"></label>\n    <div class=\"row end\"><button class=\"btn\">检查并建码…</button></div>\n  </form>\n  <div class=\"card\"><h2>建过的兑换码 <small>最近 50 个</small></h2>\n    ${r.codes.length ? H`<div class=\"tw\"><table><thead><tr><th>兑换码</th><th>说明</th><th>内容</th><th class=\"num\">领了 / 最多</th><th>谁建的</th><th>建于</th><th>截止</th><th>状态</th><th></th></tr></thead><tbody>\n      ${r.codes.map(c => H`<tr><td class=\"mono nowrap\">${c.code}</td><td class=\"mw\">${c.note}</td><td class=\"mw\">${giftText(c)}</td>\n        <td class=\"num nowrap\">${fmtN(c.got)} / ${fmtN(c.uses)}</td><td>${c.by}</td><td class=\"nowrap\">${fmtT(c.at)}</td><td class=\"nowrap\">${fmtT(c.until)}</td><td>${state(c)}</td>\n        <td>${!c.off && c.until > now ? H`<button class=\"btn ghost sm\" data-act=\"codeoff\" data-code=\"${c.code}\">停用…</button>` : ''}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">还没建过兑换码</p>`}\n  </div>`;\n}\n\n/* ---------- 经济数值 ---------- */\nconst ODDS_RE = /^(odds|prem|zod)\\./;   // 几组爆率：普通、神兵、星座武器箱，各自加起来要是 1\nconst isPct = k => ODDS_RE.test(k) || ['stP', 'dropP', 'fee'].includes(k);\nasync function vCfg() {\n  const r = S.cfg = await api('cfg');\n  const groups = [];\n  for (const [k, def, lo, hi, isInt, g, desc] of r.info) {\n    let grp = groups.find(x => x.name === g);\n    if (!grp) groups.push(grp = { name: g, rows: [] });\n    grp.rows.push({ k, def, lo, hi, isInt, desc, cur: Object.prototype.hasOwnProperty.call(r.cfg, k) ? r.cfg[k] : def });\n  }\n  const sumKey = grp => grp.rows.every(x => ODDS_RE.test(x.k)) ? grp.rows[0].k.split('.')[0] : '';\n  return H`<form class=\"card\" data-form=\"cfg\" novalidate>\n    <div class=\"row between wrap\"><h2>经济数值</h2><span class=\"badge${r.id ? ' gold' : ''}\">${r.id ? '现在用的是第 ' + r.id + ' 版' : '现在用的是默认数值'}</span></div>\n    <p class=\"hint\">保存后半分钟内全服生效，玩家的武库下一次操作后显示新数值。这里只有经济数值，伤害、血量、技能这些在代码里改。</p>\n    ${groups.map(g => { const sk = sumKey(g); return H`<fieldset class=\"grp\"><legend>${g.name}</legend>\n      ${g.rows.map(x => H`<div class=\"cfgrow${x.cur !== x.def ? ' mod' : ''}\" data-row=\"${x.k}\">\n        <label for=\"cfg_${x.k}\">${x.desc}${x.cur !== x.def ? H` <span class=\"badge gold\">改过</span>` : ''}</label>\n        <div class=\"cfgin\"><input id=\"cfg_${x.k}\" name=\"${x.k}\" type=\"number\" inputmode=\"${x.isInt ? 'numeric' : 'decimal'}\" step=\"${x.isInt ? 1 : 'any'}\" min=\"${x.lo}\" max=\"${x.hi}\" value=\"${x.cur}\"><span class=\"pct\" data-pct=\"${x.k}\"></span></div>\n        <span class=\"hint\">默认 ${x.def}，范围 ${x.lo}～${x.hi}</span>\n        <button type=\"button\" class=\"btn ghost sm\" data-act=\"cfgdef\" data-k=\"${x.k}\">用默认</button>\n      </div>`)}\n      ${sk ? H`<div class=\"sum\" data-sum=\"${sk}\"></div>` : ''}\n    </fieldset>`; })}\n    <div class=\"row end\"><span class=\"hint\" id=\"cfgDirty\"></span><button class=\"btn\" id=\"cfgSave\" disabled>检查并保存…</button></div>\n  </form>\n  ${histCard(r)}`;\n}\nfunction histCard(r) {\n  const diff = c => Object.entries(c).map(([k, v]) => cfgName(k) + ' ' + v).join('，') || '全是默认值';\n  return H`<div class=\"card\"><div class=\"row between wrap\"><h2>改过的版本 <small>最近 30 版</small></h2>${Object.keys(r.cfg).length ? H`<button class=\"btn ghost sm\" data-act=\"cfgundo\" data-to=\"0\">全部回到默认值…</button>` : ''}</div>\n    ${r.hist.length ? H`<div class=\"tw\"><table><thead><tr><th>版本</th><th>谁</th><th>时间</th><th>原因</th><th>和默认值不一样的</th><th></th></tr></thead><tbody>\n      ${r.hist.map(h => H`<tr><td class=\"nowrap\">第 ${h.id} 版${h.id === r.id ? H` <span class=\"badge gold\">现在用的</span>` : ''}</td><td>${h.by}</td><td class=\"nowrap\">${fmtT(h.at)}</td><td>${h.note}</td><td class=\"detail\">${diff(h.cfg)}</td>\n        <td>${h.id === r.id ? '' : H`<button class=\"btn ghost sm\" data-act=\"cfgundo\" data-to=\"${h.id}\">退回到这一版…</button>`}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">还没改过，用的都是默认值</p>`}\n  </div>`;\n}\nfunction cfgLive(f) {\n  const { info, cfg: cur } = S.cfg, sums = {};\n  let dirty = 0;\n  for (const [k, def] of info) {\n    const inp = f.elements[k];\n    if (!inp) continue;\n    const v = inp.value.trim() === '' ? def : Number(inp.value), was = Object.prototype.hasOwnProperty.call(cur, k) ? cur[k] : def;\n    const row = f.querySelector('[data-row=\"' + k + '\"]'), pe = f.querySelector('[data-pct=\"' + k + '\"]');\n    if (v !== was) dirty++;\n    row.classList.toggle('dirty', v !== was);\n    $('[data-act=cfgdef]', row).disabled = v === def;\n    if (pe) pe.textContent = isPct(k) && Number.isFinite(v) ? '= ' + +(v * 100).toFixed(2) + '%' : /^term\\.(lo|hi)$/.test(k) ? '× 基准价' : '';\n    const g = k.split('.')[0];\n    if (ODDS_RE.test(k)) sums[g] = (sums[g] || 0) + v;\n  }\n  for (const [g, s] of Object.entries(sums)) {\n    const el = f.querySelector('[data-sum=\"' + g + '\"]'), good = Math.abs(s - 1) <= 1e-6;\n    el.className = 'sum ' + (good ? 'ok' : 'bad');\n    el.textContent = '几档加起来是 ' + (Number.isFinite(s) ? +s.toFixed(6) : '?') + (good ? '，正好是 1' : '，要正好是 1 才能保存');\n  }\n  $('#cfgDirty').textContent = dirty ? '改了 ' + dirty + ' 项，还没保存' : '还没有改动';\n  $('#cfgSave').disabled = !dirty;\n}\n\n/* ---------- 操作记录 ---------- */\nasync function vAudit() {\n  const r = await api('audit');\n  return H`<div class=\"card\"><h2>操作记录 <small>最近 100 条</small></h2>\n    <p class=\"hint\">管理员做过的事：加减、封号、解封、发补偿、停发、改经济数值。每个号自己的流水在「玩家」里。</p>\n    ${r.rows.length ? H`<div class=\"tw\"><table><thead><tr><th>时间</th><th>谁</th><th>做了什么</th><th>对象</th><th class=\"num\">墨锭</th><th>内容</th><th>原因</th></tr></thead><tbody>\n      ${r.rows.map(row => { const d = parse(row.detail) || {}; return H`<tr><td class=\"nowrap\">${fmtT(row.at)}</td><td>${d.by || '—'}</td><td class=\"nowrap\">${ACT[row.act] || row.act}</td>\n        <td>${target(row)}</td><td class=\"num\">${inkCell(row)}</td><td class=\"detail\">${detailText(row.act, row.detail)}</td><td>${d.why || ''}</td></tr>`; })}\n    </tbody></table></div>` : H`<p class=\"empty\">还没有管理员操作</p>`}\n  </div>`;\n}\n\n/* ---------- 换页 ---------- */\nconst VIEWS = { home: vHome, players: vPlayers, gifts: vGifts, codes: vCodes, cfg: vCfg, audit: vAudit };\nconst AFTER = { players: drawGives, cfg: () => { const f = $('form[data-form=cfg]'); if (f) cfgLive(f); } };\nasync function render() {\n  const main = $('#main'), seq = ++S.seq, tab = S.tab;\n  paint(main, H`<p class=\"loading\">读取中…</p>`);\n  try {\n    const view = await VIEWS[tab]();\n    if (seq !== S.seq) return;   // 读的时候又换了页：不画旧的\n    paint(main, view);\n    if (AFTER[tab]) AFTER[tab]();\n  } catch (e) {\n    if (seq === S.seq && S.who) paint(main, H`<div class=\"card err\"><span>${e.message}</span><button class=\"btn ghost sm\" data-act=\"reload\">再试一次</button></div>`);\n  }\n}\nfunction route() {\n  const m = location.hash.slice(1).split('/');\n  S.tab = VIEWS[m[0]] ? m[0] : 'home';\n  let uid = '';\n  try { uid = S.tab === 'players' && m[1] ? decodeURIComponent(m[1]) : ''; } catch (e) {}\n  if (uid !== S.uid) window.scrollTo(0, 0);\n  S.uid = uid;\n  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));\n  render();\n}\nfunction go(tab, uid) {\n  const h = '#' + tab + (uid ? '/' + encodeURIComponent(uid) : '');\n  if (location.hash === h) route(); else location.hash = h;\n}\nwindow.addEventListener('hashchange', () => { if (S.who) route(); });\n\n/* ---------- 按钮 ---------- */\nconst ACTS = {\n  tab: b => go(b.dataset.tab),\n  open: b => go('players', b.dataset.uid),\n  back: () => go('players'),\n  reload: () => render(),\n  logout: () => logout(),\n  copy: b => { if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.v).then(() => toast('复制好了'), () => toast('复制不了，手动选一下吧', true)); },\n  addgive: () => {\n    const f = $('form[data-form=adjust]'), k = f.elements.gk.value;\n    if (!k) return toast('先选一件饰品', true);\n    if (S.give.length >= 50) return toast('一次最多发 50 件', true);\n    const n = Number(f.elements.gstn.value || 0);\n    if (f.elements.gst.checked && !(Number.isInteger(n) && n >= 0 && n <= 1e7)) return toast('斩数要填 0 到 10000000 的整数', true);\n    S.give.push({ k, st: f.elements.gst.checked ? n : -1 });\n    drawGives();\n  },\n  delgive: b => { S.give.splice(+b.dataset.i, 1); drawGives(); },\n  genpw: b => {   // 15 个随机字节 → 20 位，只用字母、数字、- 和 _\n    const a = new Uint8Array(15);\n    crypto.getRandomValues(a);\n    const el = b.form.elements.pw;\n    el.value = btoa(String.fromCharCode(...a)).replace(/\\+/g, '-').replace(/\\//g, '_');\n    el.select();\n  },\n  pardon: async b => {\n    const p = S.p, a = await ask({ title: '解封 ' + p.username, lines: ['清空处罚记录（记过次数归零），玩家刷新网页后就能正常同步、交易'], ok: '解封' });\n    if (a) await busy(b, async () => { await api('pardon', { uid: p.uid, why: a.why }); toast('解封了'); render(); });\n  },\n  giftoff: async b => {\n    const g = S.gifts.find(x => x.id === b.dataset.id);\n    if (!g) return;\n    const a = await ask({ title: '停发这份补偿', lines: ['“' + g.note + '”：' + giftText(g), '已经领了的 ' + fmtN(g.got) + ' 个账号不收回，还没领的就领不到了'], ok: '停发', danger: true });\n    if (a) await busy(b, async () => { await api('gift/off', { id: g.id, why: a.why }); toast('停发了'); render(); });\n  },\n  codeoff: async b => {\n    const c = S.codes.find(x => x.code === b.dataset.code);\n    if (!c) return;\n    const a = await ask({ title: '停用兑换码 ' + c.code, lines: ['“' + c.note + '”：' + giftText(c), '已经领了的 ' + fmtN(c.got) + ' 个号不收回，还没领的就领不到了'], ok: '停用', danger: true });\n    if (a) await busy(b, async () => { await api('code/off', { code: c.code, why: a.why }); toast('停用了'); render(); });\n  },\n  cfgdef: b => {\n    const f = b.form, row = S.cfg.info.find(x => x[0] === b.dataset.k);\n    if (!row) return;\n    f.elements[row[0]].value = row[1];\n    cfgLive(f);\n  },\n  cfgundo: async b => {\n    const to = +b.dataset.to, h = S.cfg.hist.find(x => x.id === to);\n    const what = to ? '第 ' + to + ' 版：' + (Object.entries((h || {}).cfg || {}).map(([k, v]) => cfgName(k) + ' ' + v).join('，') || '全是默认值') : '所有经济数值回到代码里写的默认值';\n    const a = await ask({ title: to ? '退回到第 ' + to + ' 版' : '全部回到默认值', lines: [what, '会存成新的一版，之后还能再退回来'], ok: '退回' });\n    if (a) await busy(b, async () => { const r = await api('cfg/undo', { to, why: a.why }); toast('退回好了，现在是第 ' + r.id + ' 版'); render(); });\n  },\n};\ndocument.addEventListener('click', e => {\n  const b = e.target.closest('[data-act]');\n  if (!b || b.disabled || !ACTS[b.dataset.act]) return;\n  e.preventDefault();\n  ACTS[b.dataset.act](b);\n});\ndocument.addEventListener('change', e => {\n  const f = e.target.form;\n  if (f && f.dataset.form === 'gift' && e.target.name === 'to') {\n    const one = e.target.value === 'one';\n    $('[data-one]', f).classList.toggle('hidden', !one);\n    $('[data-all]', f).classList.toggle('hidden', one);\n    if (one) f.elements.user.focus();\n  }\n});\ndocument.addEventListener('input', e => {\n  const f = e.target.form;\n  if (f && f.dataset.form === 'cfg') cfgLive(f);\n});\n\n/* ---------- 表单 ---------- */\nconst FORMS = {\n  find: f => { S.q = f.elements.q.value.trim().slice(0, 64); render(); },\n  adjust: async f => {\n    const p = S.p, e = p.econ, s = (e && e.state) || {}, cases = s.cases || {}, inv = s.inv || [];\n    const body = { uid: p.uid, ink: numIn(f, 'ink'), cases: {}, term: numIn(f, 'term'), tags: numIn(f, 'tags'), give: S.give.slice(),\n      take: [...f.querySelectorAll('input[name=take]:checked')].map(x => Number(x.value)) };\n    for (const c of CAT.caseIds) { const n = numIn(f, 'case_' + c); if (n) body.cases[c] = n; }\n    if ([body.ink, body.term, body.tags, ...Object.values(body.cases)].some(v => !Number.isInteger(v))) return toast('数量要填整数', true);\n    const ink0 = e ? e.ink : 0, lines = [];\n    if (body.ink) lines.push('墨锭 ' + sign(body.ink) + '（' + fmtN(ink0) + ' → ' + fmtN(ink0 + body.ink) + '）');\n    for (const [c, n] of Object.entries(body.cases)) lines.push(caseName(c) + ' ' + sign(n) + '（' + (+cases[c] || 0) + ' → ' + ((+cases[c] || 0) + n) + '）');\n    if (body.term) lines.push('终端机 ' + sign(body.term) + '（' + (+s.term || 0) + ' → ' + ((+s.term || 0) + body.term) + '）');\n    if (body.tags) lines.push('改名标签 ' + sign(body.tags) + '（' + (+s.tags || 0) + ' → ' + ((+s.tags || 0) + body.tags) + '）');\n    for (const g of body.give) lines.push('发：' + itemName(g.k) + '（' + heroOf(g.k) + '）' + (g.st >= 0 ? ' 斩数版，斩数 ' + g.st : ''));\n    for (const i of body.take) { const it = inv.find(x => x.i === i); lines.push('收走：#' + i + ' ' + (it ? itemName(it.k) + '（' + heroOf(it.k) + '）' : '')); }\n    if (!lines.length) return toast('什么都没填，没有要改的', true);\n    const a = await ask({ title: '修改 ' + p.username, lines, ok: '确定修改' });\n    if (a) await busy(submitBtn(f), async () => { const r = await api('adjust', { ...body, why: a.why }); toast('改好了：' + p.username + ' 现在有 ' + fmtN(r.ink) + ' 墨锭'); render(); });\n  },\n  ban: async f => {\n    const p = S.p, perm = f.elements.perm.checked, days = numIn(f, 'days');\n    if (!perm && !(Number.isInteger(days) && days >= 1 && days <= 3650)) return toast('封几天要填 1 到 3650 的整数', true);\n    const a = await ask({ title: '封号 ' + p.username, lines: [perm ? '永久封号' : '封 ' + days + ' 天（到 ' + fmtT(Date.now() + days * 864e5) + '）', '封禁期间不能同步存档、不能交易'], ok: '封号', danger: true });\n    if (a) await busy(submitBtn(f), async () => { await api('ban', perm ? { uid: p.uid, perm: true, why: a.why } : { uid: p.uid, days, why: a.why }); toast('封了'); render(); });\n  },\n  pw: async f => {\n    const p = S.p, pw = f.elements.pw.value;\n    if (pw.length < 12 || pw.length > 128) return toast('新密码要 12 到 128 位', true);\n    const a = await ask({ title: '重设 ' + p.username + ' 的密码', lines: ['新密码：' + pw, '先把它记下来，重设以后这里不再显示', '这个号在所有设备上的登录都会退出，要用新密码重新登录'], ok: '重设密码', danger: true });\n    if (a) await busy(submitBtn(f), async () => { await api('password', { uid: p.uid, password: pw, why: a.why }); toast('密码重设好了，' + p.username + ' 在别处的登录都退出了'); render(); });\n  },\n  mkdev: async f => {\n    const pw = f.elements.pw.value;\n    if (pw.length < 12 || pw.length > 128) return toast('密码要 12 到 128 位', true);\n    const a = await ask({ title: '建 Dev 账号', lines: ['密码：' + pw, '先把它记下来，建好以后这里不再显示'], ok: '建号' });\n    if (a) await busy(submitBtn(f), async () => { const r = await api('password', { uid: 'Dev', password: pw, create: true, why: a.why }); toast(r.created ? '建好了，Dev 可以用这个密码登录了' : 'Dev 已经有了，密码重设好了'); go('players', r.uid); });\n  },\n  gift: async f => {\n    const E = f.elements, one = E.to.value === 'one', to = one ? E.user.value.trim() : 'all';\n    if (one && !to) return toast('填上要发给哪个账号', true);\n    const body = { to, ink: numIn(f, 'ink'), cases: {}, term: numIn(f, 'term'), tags: numIn(f, 'tags'), days: numIn(f, 'days') || 14, newToo: !one && E.newToo.checked, note: E.note.value.trim() };\n    for (const c of CAT.caseIds) { const n = numIn(f, 'gc_' + c); if (n) body.cases[c] = n; }\n    if ([body.ink, body.term, body.tags, body.days, ...Object.values(body.cases)].some(v => !Number.isInteger(v) || v < 0)) return toast('数量要填 0 或者正整数', true);\n    if (!body.ink && !body.term && !body.tags && !Object.keys(body.cases).length) return toast('补偿里什么都没有', true);\n    if (body.note.length < 2) return toast('写一句给玩家看的说明（至少 2 个字）', true);\n    const lines = ['发给：' + (one ? to : body.newToo ? '所有人，包括之后新注册的' : '现在已经注册的所有人'), '内容：' + giftText(body),\n      '玩家看到：开发组补偿：' + body.note, body.days + ' 天内登录或者打开武库就能领，每个账号一份'];\n    const a = await ask({ title: '发补偿', lines, whyInit: body.note, ok: '发出' });\n    if (a) await busy(submitBtn(f), async () => { await api('gift', { ...body, why: a.why }); toast('补偿发出去了'); render(); });\n  },\n  code: async f => {\n    const E = f.elements, raw = E.code.value.trim().toUpperCase();\n    if (raw && !/^[A-Z0-9]{4,20}$/.test(raw)) return toast('兑换码只能用 4 到 20 位英文字母和数字', true);\n    const body = { code: raw, ink: numIn(f, 'ink'), cases: {}, term: numIn(f, 'term'), tags: numIn(f, 'tags'), uses: numIn(f, 'uses') || 100, days: numIn(f, 'days') || 14, note: E.note.value.trim() };\n    for (const c of CAT.caseIds) { const n = numIn(f, 'cc_' + c); if (n) body.cases[c] = n; }\n    if ([body.ink, body.term, body.tags, body.uses, body.days, ...Object.values(body.cases)].some(v => !Number.isInteger(v) || v < 0)) return toast('数量要填 0 或者正整数', true);\n    if (!body.ink && !body.term && !body.tags && !Object.keys(body.cases).length) return toast('兑换码里什么都没有', true);\n    if (body.note.length < 2) return toast('写一句给玩家看的说明（至少 2 个字）', true);\n    const lines = ['兑换码：' + (raw || '随机生成 10 位'), '内容：' + giftText(body), '玩家看到：兑换成功：' + body.note + '（内容）',\n      '最多 ' + fmtN(body.uses) + ' 个号能领，每个号一次；' + body.days + ' 天内有效'];\n    const a = await ask({ title: '建兑换码', lines, whyInit: body.note, ok: '建码' });\n    if (a) await busy(submitBtn(f), async () => { const r = await api('code', { ...body, why: a.why }); toast('建好了：' + r.code); render(); });\n  },\n  cfg: async f => {\n    const { info, cfg: cur } = S.cfg, set = {}, lines = [];\n    for (const [k, def, lo, hi, isInt, g, desc] of info) {\n      const raw = f.elements[k].value.trim(), v = raw === '' ? def : Number(raw), was = Object.prototype.hasOwnProperty.call(cur, k) ? cur[k] : def;\n      if (!Number.isFinite(v) || v < lo || v > hi || (isInt && !Number.isInteger(v))) return toast(g + '：' + desc + ' 要填 ' + lo + '～' + hi + ' 的' + (isInt ? '整数' : '数'), true);\n      if (v === was) continue;\n      set[k] = v === def ? null : v;\n      lines.push(g + '：' + desc + '　' + was + ' → ' + v + (v === def ? '（默认值）' : ''));\n    }\n    if (!lines.length) return toast('没有改动', true);\n    const a = await ask({ title: '保存经济数值', lines, ok: '保存' });\n    if (a) await busy($('#cfgSave'), async () => { const r = await api('cfg', { set, why: a.why }); toast('保存好了，现在是第 ' + r.id + ' 版'); render(); });\n  },\n};\ndocument.addEventListener('submit', e => {\n  const f = e.target;\n  if (!f.dataset || !FORMS[f.dataset.form]) return;\n  e.preventDefault();\n  FORMS[f.dataset.form](f);\n});\n\n/* ---------- 登录、退出 ---------- */\nasync function start() {\n  const [w, cat] = await Promise.all([api('whoami'), api('catalog')]);\n  useCat(cat);\n  S.who = w.who;\n  $('#who').textContent = w.who;\n  $('#login').classList.add('hidden');\n  $('#app').classList.remove('hidden');\n  route();\n}\nfunction logout(msg) {\n  S.tok = ''; S.who = ''; S.p = null; S.cfg = null;\n  saveTok('');\n  $('#app').classList.add('hidden');\n  $('#main').textContent = '';\n  $('#login').classList.remove('hidden');\n  $('#tok').value = '';\n  $('#loginMsg').textContent = msg || '';\n  $('#tok').focus();\n}\n$('#loginForm').addEventListener('submit', async e => {\n  e.preventDefault();\n  const tok = $('#tok').value.trim(), btn = $('#loginBtn');\n  if (!tok) return;\n  if (tok.length < 16) { $('#loginMsg').textContent = '管理口令至少 16 位，短的服务器不认'; return; }\n  btn.disabled = true; btn.textContent = '检查口令…'; $('#loginMsg').textContent = '';\n  S.tok = tok;\n  try { await start(); saveTok(tok); }\n  catch (err) { S.tok = ''; $('#loginMsg').textContent = err.message === '没有权限' ? '口令不对' : err.message; }\n  finally { btn.disabled = false; btn.textContent = '进入'; }\n});\n(async () => {\n  S.tok = loadTok();\n  if (!S.tok) return logout();\n  try { await start(); } catch (e) { logout(e.message === '没有权限' ? '' : e.message); }\n})();\n</script>\n</body>\n</html>\n", sha: 'ZS883B/XMLZEvOT3CgMDGthr8CoRY2W4vlh1CWccii0=' };
function adminPage() {
  const html = ADMIN_PAGE.html || '<!doctype html><meta charset="utf-8"><title>刃影管理后台</title><p>管理网页在打包好的 cloudflare/worker.bundle.js 里，先运行 python3 tools/build.py。</p>';
  const script = ADMIN_PAGE.sha ? `'sha256-${ADMIN_PAGE.sha}'` : "'none'";
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; script-src ${script}; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
}

async function cleanup(env, now) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM econ_nonce WHERE at < ?').bind(now - 2 * DAY_MS),
    env.DB.prepare('DELETE FROM rate WHERE reset < ?').bind(now - DAY_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM mkt WHERE state = 2 AND done_at < ?').bind(now - 7 * DAY_MS),               // 撤下的单留一周
    env.DB.prepare('DELETE FROM mkt WHERE state = 1 AND paid = 1 AND done_at < ?').bind(now - 120 * DAY_MS),   // 成交记录留四个月（价格走势用）
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
      if (path === '/admin' || path === '/admin/') return adminPage();

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
        if (RESERVED.test(username.replace(/\s+/g, ''))) {
          return error('这个昵称不能用，换一个吧');
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
        const initialProf = cleanInitial((body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)) ? body.profile : newProfile(username, now));
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
        return await handleEcon(env, auth, body, now, ip);
      }

      // 7. 玩家市场：看在卖的、最近成交（挂单、买、撤走上面的 /api/econ）
      if (path === '/api/market' && request.method === 'GET') {
        const auth = await authenticate(env, request);
        if (!auth) return error('未登录或登录已过期，请重新登录', 401);
        if (!(await hit(env, 'mkt:' + auth.user.id, 60, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        return await handleMarket(env, auth.user.id, String(url.searchParams.get('k') || '').slice(0, 24), now);
      }

      // 8. 反作弊记录：客户端查自己的处罚；客户端抓到作弊时上报（只能往上加，10 分钟最多记一次）
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

      if (path.startsWith('/api/admin/')) return await handleAdmin(env, request, path, now, ip);

      // 9. Logout
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
