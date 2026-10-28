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
 * 天魔讨伐（/api/gboss）：全服一起打同一只天魔。血量、谁打了多少、谁斩杀的都只存在服务器上；每次出战先领一张票，
 *   打完交一次伤害（同一张票重交只算一次，伤害按出战时长封顶）。击败或天魔遁走后按伤害发奖励（走全服补偿那一套），
 *   然后换下一代。
 *
 * 江湖共斗 · 开放世界（/api/world/line/N，WebSocket）：一条分线一个 Durable Object（WorldLine，wrangler.toml 里的 WORLD 绑定），
 *   服务器模拟妖物和妖王、转发附近侠客的位置；每线 40 人，满了网页自动去下一线，总人数不设上限。不用 D1。
 *
 * 侠客列传的江湖足迹（/api/saga）：云端账号走完一节、做了抉择、看到结局各记一笔（每个号每节只算一次，重走会改成新的选择），
 *   列传页按侠客汇总成人数和比例。只存侠客、第几节、选了什么，不存别的。
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
  C.MKT_DAYS = 14;   // 挂单默认挂几天：过期没卖出去的自动撤回，饰品回到卖家库存（管理员可以在线改 mktDays）
  C.FEE = 0.15;                                // 玩家市场成交扣的手续费（墨锭从这里流出去，免得越攒越多）
  C.PRICE_MAX = 999999;                        // 挂单标价 1 ~ 999999 墨锭，多少由玩家自己定，系统不定价、也不收购
  C.OPEN_DAY = 2;                            // 普通武器箱每天最多开 2 个（北京时间零点刷新）
  C.PREM_WEEK = 1;                             // 神兵武器箱每周最多开 1 个（周一刷新），不占每天那 2 个
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

/* === cloudflare/worker.js === */

const C = globalThis.ArmoryCore;

/* ---------- 跨域（CORS）----------
 * 只有游戏网页（GitHub Pages）和本机开发（localhost、127.0.0.1）能从浏览器里调接口；要加别的网址，在 Worker 的变量 CORS_ORIGINS 里写，逗号分开。
 * 离线版（双击打开，Origin 是 null）本来就不连服务器，不放行。命令行、curl 这种不带 Origin 的照常处理（跨域只管浏览器）。
 * /api/admin/* 只给这个 Worker 自己的 /admin 网页用：从来不带跨域头，带着别的网站的 Origin 来的直接 403。 */
const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
const CORS_ORIGINS = ['https://amfi-disable.github.io'];
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
function corsOrigin(env, origin) {
  if (!origin) return '';
  const extra = String((env && env.CORS_ORIGINS) || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
  return CORS_ORIGINS.includes(origin) || extra.includes(origin) || DEV_ORIGIN.test(origin) ? origin : '';
}
async function withCors(request, env, ctx) {
  const url = new URL(request.url), origin = request.headers.get('Origin') || '';
  const rid = reqId(), t0 = Date.now();
  if (url.pathname.startsWith('/api/admin/')) {
    if (origin && origin !== url.origin) return error('管理接口只能从管理网页用', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    return tagged(await route(request, env, ctx, rid), request, url, env, ctx, rid, t0);
  }
  const allow = corsOrigin(env, origin);
  const res = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env, ctx, rid);
  if (res.status === 101 || res.webSocket) return res;
  const out = tagged(res, request, url, env, ctx, rid, t0);
  out.headers.append('Vary', 'Origin');
  if (allow) {
    out.headers.set('Access-Control-Allow-Origin', allow);
    for (const [k, v] of Object.entries(CORS_HEADERS)) out.headers.set(k, v);
  }
  return out;
}

/* ---------- 请求编号、慢请求 ----------
 * 每个回应都带 X-Request-Id（8 位），服务器出错时错误信息里也带上，玩家报问题时说这个编号就能在「错误」页找到。
 * 超过 SLOW_MS 的请求按“方法 + 路径”合成一行记进 errs（kind = slow），记最慢一次和总耗时。
 * Workers 里 Date.now() 只在等网络、等数据库之后才往前走，量出来的正好是花在 D1 和外部请求上的时间。 */
const SLOW_MS = 1000;
const reqId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
function tagged(res, request, url, env, ctx, rid, t0) {
  if (res.status === 101 || res.webSocket) return res;
  const out = new Response(res.body, res);
  out.headers.set('X-Request-Id', rid);
  const ms = Date.now() - t0;
  if (ms >= SLOW_MS && env.DB) {
    const p = errRecord(env, 'slow', { msg: request.method + ' ' + url.pathname.replace(/\d+/g, ':n'), meta: { status: res.status, rid }, ms }, Date.now()).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  }
  return out;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

// 出错时的回应都是这个样子：{ ok: false, error: 给人看的话, code: 给程序看的类别, ...extra }
const ERR_CODE = { 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 413: 'too_large',
  426: 'upgrade_required', 429: 'rate_limited', 500: 'internal', 503: 'unavailable' };
function error(message, status = 400, extra) {
  return json({ ok: false, error: message, code: ERR_CODE[status] || (status >= 500 ? 'internal' : 'bad_request'), ...(extra || {}) }, status);
}

const ICE_STUN = ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'];
const ICE_TTL = 6 * 3600;   // TURN 凭据的有效期（秒）：够打完一晚上，过期了网页下次建房会重新要
async function iceServers(env) {
  const out = { ok: true, iceServers: [{ urls: ICE_STUN }], turn: false };
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return out;
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: ICE_TTL }),
    });
    if (!r.ok) { console.error('turn creds', r.status); return out; }
    const d = await r.json();
    // 返回格式是 { iceServers: {...} } 或 { iceServers: [{...}] }，两种都认；只要带用户名和密码的 turn(s): 地址
    const list = (Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers]).filter(x => x && x.username && x.credential);
    const turn = list.map(x => ({ urls: (Array.isArray(x.urls) ? x.urls : [x.urls]).filter(u => /^turns?:/.test(u)), username: x.username, credential: x.credential })).filter(x => x.urls.length);
    if (turn.length) { out.iceServers.push(...turn); out.turn = true; out.ttl = ICE_TTL; }
  } catch (e) { console.error('turn creds', e); }
  return out;
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
const CODE_LOCAL = ['LOCK', 'RELOCK', 'RENYING666', 'RENYING888', 'SWORD2026', 'MOYUGIFT', 'ZODIAC2026STAR'];
// 以前不进库存的“绑定”皮肤（关卡奖励、老账号带过来的）：这一天之前建的号，第一次动武库时一次性换成库存里的饰品，
// 之后能卖能汰换。之后建的号不换：网页报上来的皮肤服务器核对不了，换成能卖的饰品就等于能凭空变出墨锭
const LEGACY_CUTOFF = Date.UTC(2026, 9, 31);
// 写在游戏里的兑换码：源码公开，等于人人都能领，已全部作废（名字留在 CODE_LOCAL 里，后台也建不了同名的）
const CODE_BUILTIN = {};
// 作废以前领过的号：码送的饰品（src 'code'）在库存里的、挂在市场上还没卖出的，第一次动武库时收回（记在 srv.zv）
const CODE_VOID = { ZODIAC2026STAR: it => it && it.src === 'code' && !!C.ITEM[it.k] && C.ITEM[it.k].col === 'c8' };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, profile_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, password_algo TEXT NOT NULL DEFAULT 'sha256-v1', password_updated_at INTEGER NOT NULL DEFAULT 0)`,
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
  // 在线人数：每个打开的网页（按标签页，刷新不算新人）每 30 秒报一次到；PRESENCE_WINDOW 内报过的算在线。ip 只存哈希
  `CREATE TABLE IF NOT EXISTS presence (sid TEXT PRIMARY KEY, ip TEXT NOT NULL, st TEXT NOT NULL, seen INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence (seen)`,
  // 天魔讨伐：每一代一行（hp 到 0 或 until 到了就 ended；killer 为空表示遁走了；paid 是奖励发了没有）；last / last_tx 是最近一次扣血扣了多少、是哪个请求
  `CREATE TABLE IF NOT EXISTS gboss (gen INTEGER PRIMARY KEY, hero TEXT NOT NULL, affix TEXT NOT NULL, max_hp INTEGER NOT NULL, hp INTEGER NOT NULL, started INTEGER NOT NULL, until INTEGER NOT NULL, ended INTEGER NOT NULL DEFAULT 0, killer TEXT, paid INTEGER NOT NULL DEFAULT 0, last INTEGER NOT NULL DEFAULT 0, last_tx TEXT)`,
  `CREATE TABLE IF NOT EXISTS gboss_hit (gen INTEGER NOT NULL, uid TEXT NOT NULL, dmg INTEGER NOT NULL, runs INTEGER NOT NULL, last INTEGER NOT NULL, PRIMARY KEY (gen, uid))`,
  // 一次出战一张票：done 是交过伤害没有，dmg 是最后算进去多少（天魔已经倒了就是 0），killed 是这一下打死的
  `CREATE TABLE IF NOT EXISTS gboss_try (id TEXT PRIMARY KEY, uid TEXT NOT NULL, gen INTEGER NOT NULL, started INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, tx TEXT, dmg INTEGER NOT NULL DEFAULT 0, killed INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_gboss_try_uid ON gboss_try (uid, started)`,
  `CREATE INDEX IF NOT EXISTS idx_gboss_try_done ON gboss_try (done, started)`,
  // 侠客列传的江湖足迹：node 是 n1 ~ n5（走完第几节）、c3（第 3 节的抉择）、end（结局），pick 是选了什么
  `CREATE TABLE IF NOT EXISTS saga_mark (hero TEXT NOT NULL, node TEXT NOT NULL, uid TEXT NOT NULL, pick TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (hero, node, uid))`,
  // 功能开关：mode 是 off（关）、dev（只对 Dev 账号开）、all（所有人开）；没有这一行就用代码里 FLAGS 写的默认值
  `CREATE TABLE IF NOT EXISTS flags (k TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('off', 'dev', 'all')), by TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL)`,
  // 错误记录：同一种错（kind + 消息 + 位置）合成一行，n 是出现了几次。kind：client 网页报上来的、server 服务器自己出的错、slow 慢请求。不存 IP、账号
  `CREATE TABLE IF NOT EXISTS errs (sig TEXT PRIMARY KEY, kind TEXT NOT NULL, msg TEXT NOT NULL, src TEXT NOT NULL, stack TEXT NOT NULL, meta TEXT NOT NULL, n INTEGER NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_errs_last ON errs (kind, last_at)`,
];
let schemaReady = null;
// 以前建的表后来加的列：已经有了 SQLite 会报 duplicate column，跳过就行
const SCHEMA_COLS = [
  `ALTER TABLE users ADD COLUMN password_algo TEXT NOT NULL DEFAULT 'sha256-v1'`,
  `ALTER TABLE users ADD COLUMN password_updated_at INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE errs ADD COLUMN ms INTEGER NOT NULL DEFAULT 0`,       // 慢请求：最慢一次多少毫秒
  `ALTER TABLE errs ADD COLUMN ms_sum INTEGER NOT NULL DEFAULT 0`,   // 慢请求：加起来多少毫秒（除以 n 是平均）
];
function ensureSchema(env) {
  if (!schemaReady) schemaReady = (async () => {
    await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
    for (const sql of SCHEMA_COLS) {
      try { await env.DB.prepare(sql).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
  })().catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}

/* ---------- 密码 ----------
 * 新密码用 PBKDF2-SHA256 存，users.password_algo 记着是哪种（'pbkdf2-sha256:次数'）；以前的号是 'sha256-v1'（下面 hashPassword，只算一遍）。
 * 老号登录成功时顺手换成 PBKDF2，玩家什么都不用做。两种一直都认，所以开关 auth.pbkdf2 关掉只是新密码又用老办法存。
 * PW_ITER：免费版每个请求最多 10ms CPU。在 workerd 1.20261028 上量的（Intel Xeon，每种跑 15 次取最快）：
 *   1 万次 1.7ms，2 万次 2.9ms，3 万次 4.1ms，5 万次 6.7ms，10 万次 12.8ms；登录请求别的部分不到 1ms。
 * 取 2.5 万次（约 3ms），给慢一些的机器留出一倍多的余量。Cloudflare 不让超过 10 万次。 */
export const PW_ITER = 25000;
const PW_ALGO = 'pbkdf2-sha256:' + PW_ITER;
async function pbkdf2(password, salt, iter) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// 新密码要写进库的三样：hash、salt、algo（user 用来看开关是不是只开了 Dev）
async function makePassword(env, user, password, now) {
  const salt = randHex(16);
  if (await flagOn(env, 'auth.pbkdf2', user, now)) return { hash: await pbkdf2(password, salt, PW_ITER), salt, algo: PW_ALGO };
  return { hash: await hashPassword(password, salt), salt, algo: 'sha256-v1' };
}
// user 是 users 那一行（要有 password_hash、salt、password_algo）
async function checkPassword(user, password) {
  const m = /^pbkdf2-sha256:(\d+)$/.exec(String(user.password_algo || ''));
  if (m) {
    const n = +m[1];
    return n >= 1000 && n <= 100000 && sameStr(await pbkdf2(password, user.salt, n), user.password_hash);
  }
  return sameStr(await hashPassword(password, user.salt), user.password_hash);
}

// 老办法（sha256-v1）：加盐 SHA-256 算一遍
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + ':' + password + ':renying_sword_salt_2026');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 登录令牌在数据库里只存它的 SHA-256（前面加 h1:），库被拖走也拿不到能用的令牌。
// 以前存的是原文：查的时候两种都认，原文那行用到一次就改成哈希，玩家不用重新登录。
// 原文令牌一定是 64 位十六进制；别的样子（比如把库里的 h1:… 拿来当令牌）不按原文查。
async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const tokenKey = async token => 'h1:' + await sha256Hex(token);
const PLAIN_TOKEN = /^[0-9a-f]{64}$/;
// 按令牌找登录记录（cols 是要的 users 列）；找到的还是原文、开关又开着，就顺手换成哈希
async function sessionOf(env, token, cols, now) {
  if (!token || token.length > 128) return null;
  const key = await tokenKey(token);
  const r = await env.DB.prepare(`SELECT s.token AS stok, ${cols} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token IN (?1, ?2) AND s.expires_at > ?3 ORDER BY s.token = ?1 DESC LIMIT 1`)
    .bind(key, PLAIN_TOKEN.test(token) ? token : key, now).first();
  if (r && r.stok !== key && await flagOn(env, 'auth.token_hash', r, now)) await env.DB.prepare('UPDATE sessions SET token = ?1 WHERE token = ?2').bind(key, token).run();
  return r;
}
// 新登录：写一行 sessions，返回给玩家的令牌原文
async function newSession(env, user, now) {
  const token = generateToken();
  const stored = (await flagOn(env, 'auth.token_hash', user, now)) ? await tokenKey(token) : token;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(stored, user.id, now, now + 30 * 24 * 3600 * 1000).run();
  return token;
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
  const r = await sessionOf(env, token, 'u.id AS id, u.username AS username, u.profile_json AS profile_json, u.created_at AS created_at', Date.now());
  if (!r) return null;
  const { stok, ...user } = r;
  return { token, user };
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

/* ---------- 功能开关 ----------
 * 大改动先做成开关，管理后台（/admin 的「功能开关」）按功能打开或关上，可以先只对 Dev 账号开，有问题一键关回去。
 * 不做按百分比放量。登记表在下面 FLAGS：[默认值, 说明, 网页要不要知道]。网页开局读 GET /api/flags，只拿得到“网页要知道”的那些。
 * 数据库里只存改过的；每个 Worker 实例最多 30 秒重读一次。 */
export const FLAGS = {
  'auth.pbkdf2': ['all', '新密码用 PBKDF2 存，老号登录成功时换成 PBKDF2（关掉：新密码用老办法存；两种照样都认）', false],
  'auth.token_hash': ['all', '新登录的令牌在数据库里只存哈希，旧的用到时换成哈希（关掉：新令牌存原文；两种照样都认）', false],
};
const FLAG_MODES = ['off', 'dev', 'all'];
let FLAG_CACHE = { db: null, at: 0, rows: {} };
async function flagRows(env, now) {
  const c = FLAG_CACHE;
  if (c.db === env.DB && c.at && now - c.at < 30e3 && now >= c.at) return c.rows;
  const rows = {};
  for (const r of (await env.DB.prepare('SELECT k, mode, by, note, at FROM flags').all()).results || []) rows[r.k] = r;
  FLAG_CACHE = { db: env.DB, at: now, rows };
  return rows;
}
const isDevUser = user => !!user && String(user.username || '').toLowerCase() === 'dev';
function flagMode(rows, k) { const r = rows[k]; return r && FLAG_MODES.includes(r.mode) ? r.mode : (FLAGS[k] ? FLAGS[k][0] : 'off'); }
// 这个开关对这个人开没开（user 可以是空：游客）
async function flagOn(env, k, user, now) {
  const m = flagMode(await flagRows(env, now), k);
  return m === 'all' || (m === 'dev' && isDevUser(user));
}
async function flagsFor(env, user, now) {
  const rows = await flagRows(env, now), out = {};
  for (const [k, [, , client]] of Object.entries(FLAGS)) if (client) { const m = flagMode(rows, k); out[k] = m === 'all' || (m === 'dev' && isDevUser(user)); }
  return out;
}

/* ---------- 全服补偿：开发组发的墨锭、武器箱、终端机、改名标签，玩家下次动武库时自动领 ---------- */
// 发给所有人的（uid = '*'）只给 born 之前注册的号，免得开小号来领；单发给某个号的不管注册时间。每个号每份只领一次
async function giftsFor(env, user, now) {
  return (await env.DB.prepare("SELECT id, ink, items_json, note FROM gift WHERE (uid = ? OR uid = '*') AND off = 0 AND at <= ? AND until > ? AND born > ? AND NOT EXISTS (SELECT 1 FROM gift_got x WHERE x.gid = gift.id AND x.uid = ?) ORDER BY at LIMIT 10")
    .bind(user.id, now, now, Math.floor(+user.created_at || 0), user.id).all()).results || [];
}
function giftItems(txt) {   // 一份补偿里的东西：{ cases: { c1: 2 }, term: 1, tags: 1 }，数都夹在 0 ~ 100；全服肉鸽发的还有 skin（只认星座武器箱的款）
  const o = parseObj(txt) || {}, cases = {};
  for (const c of C.CASES) { const n = Math.floor(+(o.cases && o.cases[c]) || 0); if (n > 0) cases[c] = Math.min(100, n); }
  const one = x => Math.max(0, Math.min(100, Math.floor(+x || 0)));
  const out = { cases, term: one(o.term), tags: one(o.tags) };
  if (typeof o.skin === 'string' && C.isItem(o.skin) && C.ITEM[o.skin].col === 'c8') out.skin = o.skin;
  return out;
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
// 流水里的一件饰品：「qf_p1#12 st3」（编号 12，斩数版，斩数 3；老流水只写 st）
const itemRef = it => `${it.k}#${it.i}${+it.st >= 0 ? ' st' + (+it.st | 0) : ''}`;   // 带斩数，找回时能还原
// 一次操作前后库存里少了哪几件、多了哪几件（库存加挂单一起算：挂上市场、撤回来都不算进出）
function itemDiff(a, b) {
  const ids = x => { const m = new Map(); for (const it of Array.isArray(x && x.inv) ? x.inv : []) if (it && Number.isInteger(+it.i)) m.set(+it.i, it);
    for (const L of Array.isArray(x && x.lst) ? x.lst : []) if (L && L.it && Number.isInteger(+L.it.i)) m.set(+L.it.i, L.it); return m; };
  const m0 = ids(a), m1 = ids(b);
  const rm = [...m0.values()].filter(it => !m1.has(+it.i)).map(itemRef), ad = [...m1.values()].filter(it => !m0.has(+it.i)).map(itemRef);
  return { rm: rm.length ? rm : undefined, ad: ad.length ? ad : undefined };
}
// 流水的 detail 最多 2000 字：放不下的话进出清单只留前面几件，另记总数（rmN、adN），保证存下来的还是完整的 JSON
function logDetail(d) {
  const n = k => Array.isArray(d[k]) ? d[k].length : undefined;
  let txt = JSON.stringify(d);
  for (const keep of [60, 20, 5, 0]) {
    if (txt.length <= 2000) return txt;
    const o = { ...d };
    for (const k of ['rm', 'ad']) if (Array.isArray(d[k]) && d[k].length > keep) { o[k] = d[k].slice(0, keep); o[k + 'N'] = d[k].length; }
    if (!keep) o.a = undefined;   // 参数也太长：不记参数
    txt = JSON.stringify(o);
  }
  return txt.length <= 2000 ? txt : JSON.stringify({ r: String(d.r).slice(0, 200), rmN: n('rm'), adN: n('ad') });
}
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
    if (k && CODE_BUILTIN[k]) {
      // 每个号只领一次：领过以后卖掉、汰换掉的不再补（不然卖了再领就是凭空变墨锭）
      if (await env.DB.prepare('SELECT 1 FROM code_got WHERE code = ? AND uid = ?').bind(k, uid).first()) return error('这个兑换码你已经领过了');
      code = { code: k, ink: 0, cases: {}, term: 0, tags: 0, builtin: true, ...CODE_BUILTIN[k]() };
    }
    const row = code ? null : k ? await env.DB.prepare('SELECT code, ink, items_json, note, until, uses, got, off, EXISTS (SELECT 1 FROM code_got x WHERE x.code = code.code AND x.uid = ?) AS mine FROM code WHERE code = ?').bind(uid, k).first() : null;
    if (code) { /* 游戏里自带的码，上面已经核对过 */ }
    else if (!row || row.off || row.until <= now) {
      await hit(env, 'rdm:' + uid, 1e9, 3600e3, now);
      await hit(env, 'rdmip:' + ip, 1e9, 3600e3, now);
      return error('兑换码无效或已过期');
    }
    else {
      if (row.mine) return error('这个兑换码你已经领过了');
      if (row.got >= row.uses) return error('这个兑换码已经被领完了');
      code = { code: row.code, note: row.note, ink: clampInk(row.ink, 1e6), ...giftItems(row.items_json) };
    }
  }
  // 自己挂了太久没卖出的单：先撤下（只改还在卖的那几单；同一刻被别人买走的照常算卖掉）。饰品在下面退回库存
  const ttl = C.cv(cfg, 'mktDays') * DAY_MS;
  await env.DB.prepare('UPDATE mkt SET state = 2, done_at = ? WHERE seller = ? AND state = 0 AND at < ?').bind(now, uid, now - ttl).run();
  for (let attempt = 0; attempt < 5; attempt++) {
    const prof = await freshProfile();
    const eco = await loadEcon(env, uid, prof, now);
    const skins0 = mergeSkins(prof.skins, eco.state, eco.srv, eco.ver);
    // 玩家市场：自己挂的单被别人买走、钱还没结的，这次一起结；买、撤的话把那一单现在的样子交给规则核心
    const paid = (await env.DB.prepare('SELECT id, k, st, price, done_at AS at FROM mkt WHERE seller = ? AND state = 1 AND paid = 0 ORDER BY done_at LIMIT 40').bind(uid).all()).results || [];
    const mkt = { id: randHex(8), ids: Array.from({ length: 20 }, () => randHex(8)), row: null, out: null, open: 0 };
    if ((act === 'buy' || act === 'cancel') && C.isLid(args.l)) {
      const r0 = await env.DB.prepare('SELECT id, seller, k, st, item_json, price, state, at FROM mkt WHERE id = ?').bind(args.l).first();
      if (r0) mkt.row = { id: r0.id, seller: r0.seller, k: r0.k, st: r0.st, price: r0.price, state: r0.state, item: parseObj(r0.item_json), expired: r0.state === 0 && r0.at < now - ttl };
    }
    if (act === 'list' || act === 'listDupes') mkt.open = ((await env.DB.prepare('SELECT COUNT(*) AS n FROM mkt WHERE seller = ? AND state = 0').bind(uid).first()) || {}).n || 0;
    // 存档里还挂着、市场上已经不在卖的（到期撤下、被撤下，或者那一单已经清理掉了）：这次退回库存。卖掉的不算，卖掉的走上面的结账
    const lst0 = (Array.isArray(eco.state.lst) ? eco.state.lst : []).filter(L => L && C.isLid(L.l)).slice(0, 40);
    let back = [];
    if (lst0.length) {
      const rows = (await env.DB.prepare(`SELECT id, state FROM mkt WHERE id IN (${lst0.map(() => '?').join(', ')})`).bind(...lst0.map(L => L.l)).all()).results || [];
      const stOf = new Map(rows.map(r => [r.id, r.state]));
      back = lst0.filter(L => !stOf.has(L.l) || stOf.get(L.l) === 2).map(L => L.l);
    }
    // 开发组发的补偿：先放进存档和墨锭，再做这次的动作（动作没做成也照样领到）
    const gifts = await giftsFor(env, auth.user, now), got = [];
    let state0 = eco.state, ink0 = eco.ink;
    const giftSkins = [];
    if (gifts.length || code) {
      state0 = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid });
      for (const g of gifts) {
        const it = giftItems(g.items_json), ink = clampInk(g.ink, 1e6);
        ink0 += ink;
        for (const [c, n] of Object.entries(it.cases)) state0.cases[c] += n;
        state0.term += it.term; state0.tags += it.tags;
        if (it.skin) giftSkins.push(it.skin);
        got.push({ id: g.id, note: g.note, ink, ...it });
      }
      if (code) {   // 兑换码里的东西也先放进去
        ink0 += code.ink;
        for (const [c, n] of Object.entries(code.cases)) state0.cases[c] += n;
        state0.term += code.term; state0.tags += code.tags;
      }
    }
    const E = { now, rnd, uid, ink: ink0, skins: skins0.slice(), equip: fixEquip(cleanEquip(prof.equip), skins0), server: true, paid, back, mkt, cfg };
    // 绑定皮肤换成饰品（每个号只做一次，记在 srv.lg）：库存里没有这一款的放一件普通版，并记进 via，卖掉最后一件就穿不了，和开箱得到的一样
    let legacy = null;
    if (!eco.srv.lg && Math.floor(+auth.user.created_at || 0) < LEGACY_CUTOFF) {
      legacy = skins0.filter(k => C.isItem(k) && !eco.state.inv.some(x => x.k === k) && !(eco.state.via || []).includes(k));
      if (legacy.length) {
        if (state0 === eco.state) state0 = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid });
        for (const k of legacy) { C.addItem(state0, C.mkItem(state0, k, 'legacy', rnd, { st: -1 }), E); if (!state0.via.includes(k)) state0.via.push(k); }
      }
    }
    // 作废的兑换码：领过的号把码送的饰品收回。已经被别人买走的不追（买家是花墨锭买的）
    let voided = null;
    if (!eco.srv.zv) {
      for (const [k, isV] of Object.entries(CODE_VOID)) {
        if (!(await env.DB.prepare('SELECT 1 FROM code_got WHERE code = ? AND uid = ?').bind(k, uid).first())) continue;
        if (state0 === eco.state) state0 = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid });
        voided = voided || { code: [], inv: [], lst: [] };
        voided.code.push(k);
        for (const it of state0.inv.filter(isV)) { C.dropItem(state0, it.i, E); voided.inv.push(it.k); }
        const open = new Set(((await env.DB.prepare('SELECT id FROM mkt WHERE seller = ? AND state = 0').bind(uid).all()).results || []).map(r => r.id));
        state0.lst = state0.lst.filter(L => { if (!isV(L.it) || !open.has(L.l)) return true; voided.lst.push(L.l); return false; });
      }
    }
    for (const k of giftSkins) if (state0.inv.length < C.INV_MAX) C.addItem(state0, C.mkItem(state0, k, 'rouge', rnd, { st: -1 }), E);   // 全服肉鸽发的星座皮肤：放一件进库存，能卖能汰换
    if (code && code.items) {   // 兑换码送的饰品：库存里没有这一款的才放一件进去（普通版）
      let n = 0;
      for (const k of code.items) if (C.isItem(k) && !state0.inv.some(x => x.k === k) && state0.inv.length < C.INV_MAX) { C.addItem(state0, C.mkItem(state0, k, 'code', rnd, { st: -1 }), E); n++; }
      code.n = n;
    }
    const equip0 = { ...E.equip };
    const r = C.run(state0, act, args, E);
    const res = r.res || {}, st = r.state, stJson = JSON.stringify(st);
    const add = E.skins.filter(k => !skins0.includes(k)), del = skins0.filter(k => !E.skins.includes(k));
    const eq = {};
    for (const c of new Set([...Object.keys(equip0), ...Object.keys(E.equip)])) if (equip0[c] !== E.equip[c]) eq[c] = E.equip[c] === undefined ? null : E.equip[c];
    const out = { res, sold: r.sold || [] };
    if (r.back && r.back.length) out.back = r.back.map(({ k, st }) => ({ k, st }));
    if (code) { const { items, builtin, ...c } = code; out.code = c; }
    // 最后一道保险：算出来的数不对劲（不是整数、是负数、大得离谱）就整个作废，记下来查
    const bad = [E.ink, st.tags, st.term, ...Object.values(st.cases), ...st.inv.map(x => x.st + 1)].find(v => !Number.isSafeInteger(v) || v < 0 || v > 1e12);   // 斩数 -1 是普通版
    if (bad !== undefined || st.inv.length > C.INV_MAX) {
      await logRow(env, uid, now, 'invariant', 0, eco.ink, null, JSON.stringify({ act, args, bad }).slice(0, 400));
      return error('操作失败，已记录', 500);
    }
    const mo = mkt.out, settled = E.settled || [];
    if (!legacy && !code && !out.sold.length && !out.back && !mo && !(voided && voided.lst.length) && E.ink === eco.ink && stJson === eco.stateJson && !add.length && !del.length && !Object.keys(eq).length) {
      return json({ ok: true, ...out, state: C.publicState(st), ledger: ledgerOut(eco, now), skinsAdd: [], skinsDel: [], equip: {}, cfg });   // 什么都没变：不用写
    }
    const ver = eco.ver, srv = eco.srv;
    if (legacy) srv.lg = now;
    if (!srv.zv) srv.zv = now;   // 走到这里说明作废那一步已经做过（领过的号收回了，没领过的不用再查）
    for (const k of del) srv.gone[k] = [ver + 1, now];
    for (const k of add) delete srv.gone[k];
    pruneGone(srv, now);
    const p = { ...prof, ink: E.ink, skins: E.skins, equip: E.equip, updatedAt: now };
    delete p.armory; delete p.ledger;
    const quiet = QUIET.includes(act) && !out.sold.length && !out.back;
    // 流水里记下这一次进出库存的每一件（rm 出去的、ad 进来的，挂到市场上不算出去）：哪件饰品是哪一步没的，后台找回工具按这个查
    const moved = itemDiff(eco.state, st);
    const detail = logDetail({ a: args, r: res.err ? res.err : res.item ? itemRef(res.item) : res.gain || res.price || '', s: out.sold.length || undefined, b: out.back ? out.back.length : undefined, ...moved });
    // 买、撤：先把那一单从“在卖”改掉（只有它还在卖、版本号也没变才改得动），后面每一条都要看到这一改才生效
    const id = mo && (mo.buy || mo.cancel), tx = id ? [id, nonce.slice(0, 24) + '.' + attempt] : null;
    const stmts = [];
    if (mo && mo.buy) stmts.push(guard(env, 'UPDATE mkt SET state = 1, buyer = ?, done_at = ?, tx = ? WHERE id = ? AND state = 0 AND seller <> ? AND at >= ? AND', [uid, now, tx[1], id, uid, now - ttl], uid, ver));   // 到期的单买不了
    if (mo && mo.cancel) stmts.push(guard(env, 'UPDATE mkt SET state = 2, done_at = ?, tx = ? WHERE id = ? AND seller = ? AND state = 0 AND', [now, tx[1], id, uid], uid, ver));
    if (mo && mo.list) {
      const L = mo.list;
      stmts.push(ins(env, 'INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) SELECT ?, ?, ?, ?, ?, ?, ?, 0, 0', [L.l, uid, L.it.k, L.it.st, JSON.stringify(L.it), L.price, now], uid, ver));
    }
    if (mo && Array.isArray(mo.lists)) {
      for (const L of mo.lists) {
        stmts.push(ins(env, 'INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) SELECT ?, ?, ?, ?, ?, ?, ?, 0, 0', [L.l, uid, L.it.k, L.it.st, JSON.stringify(L.it), L.price, now], uid, ver));
      }
    }
    if (settled.length) stmts.push(guard(env, `UPDATE mkt SET paid = 1 WHERE seller = ? AND state = 1 AND paid = 0 AND id IN (${settled.map(() => '?').join(', ')}) AND`, [uid, ...settled], uid, ver, tx));
    for (const g of got) {   // 补偿：记下领过了（同一份同时领两次，只有一次写得进去）；流水记成 gift_got（gift 是新手礼）
      stmts.push(ins(env, 'INSERT INTO gift_got (gid, uid, at) SELECT ?, ?, ?', [g.id, uid, now], uid, ver, tx));
      stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'gift_got', 1, null, null, JSON.stringify({ id: g.id, note: g.note, ink: g.ink || undefined, cases: Object.keys(g.cases).length ? g.cases : undefined, term: g.term || undefined, tags: g.tags || undefined })], uid, ver, tx));
    }
    stmts.push(ins(env, 'INSERT INTO econ_nonce (uid, nonce, at, res_json) SELECT ?, ?, ?, ?', [uid, nonce, now, JSON.stringify(out)], uid, ver, tx));
    if (code) {   // 兑换码：记下这个号领过了、这个码又被领走一份（领满了 CHECK 让这一批整个作废）；流水记成 code_got
      stmts.push(ins(env, `INSERT INTO code_got (code, uid, at) SELECT ?, ?, ?`, [code.code, uid, now], uid, ver, tx));
      if (!code.builtin) stmts.push(guard(env, 'UPDATE code SET got = got + 1 WHERE code = ? AND', [code.code], uid, ver, tx));
      stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'code_got', 1, null, null, JSON.stringify({ code: code.code, note: code.note, ink: code.ink || undefined, cases: Object.keys(code.cases).length ? code.cases : undefined, term: code.term || undefined, tags: code.tags || undefined })], uid, ver, tx));
    }
    if (voided) {   // 作废兑换码收回的挂单：还在卖的撤下来；同一刻被别人买走的不受影响，钱照常结给卖家
      for (const l of voided.lst) stmts.push(guard(env, 'UPDATE mkt SET state = 2, done_at = ? WHERE id = ? AND seller = ? AND state = 0 AND', [now, l, uid], uid, ver, tx));
      stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'code_void', 1, null, null, JSON.stringify(voided).slice(0, 400)], uid, ver, tx));
    }
    if (legacy && legacy.length) stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'legacy', 1, null, null, JSON.stringify({ k: legacy }).slice(0, 400)], uid, ver, tx));
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

/* ---------- 进度计数（胜场、负场、侠客碎片）：和墨锭一样按条记账 ----------
 * 两台设备各自打了几局，云端要的是两边新增的加起来，不是谁大要谁、也不是后传的覆盖先传的。
 * 所以网页把“这次比上次多了几”记成一条条带编号的增量（prog.deltas），服务器每条只加一次（编号记在 srv.pg），
 * 存档里报上来的绝对数不认。网页重试、刷新后重报、两台设备同时报，都不会重复加。
 * 老版本网页没有 prog：照旧用它报的绝对数（等它刷新成新网页就走账了）。 */
const PG_KEY = /^(netWins|netLosses|frags\.[a-z]{2,16})$/, PG_MAX = 1e6, PG_STEP = 10000, PG_KEEP = 10 * DAY_MS;
function clampPg(x) { return Math.max(0, Math.min(PG_MAX, Math.floor(+x || 0))); }
function pgVals(p) {
  const v = { netWins: clampPg(p.netWins), netLosses: clampPg(p.netLosses) };
  if (p.frags && typeof p.frags === 'object' && !Array.isArray(p.frags)) for (const [h, n] of Object.entries(p.frags)) if (PG_KEY.test('frags.' + h) && clampPg(n)) v['frags.' + h] = clampPg(n);
  return v;
}
function pgPut(p, v) {
  p.netWins = v.netWins || 0; p.netLosses = v.netLosses || 0;
  const frags = {};
  for (const [k, n] of Object.entries(v)) if (k.startsWith('frags.') && n > 0) frags[k.slice(6)] = n;
  p.frags = frags;
}
// 把还没记过的增量加到 vals 上；返回这次请求里所有已经记过的编号（新记的和以前记过的都算，网页据此划掉）
function pgApply(srv, vals, deltas, now) {
  const pg = srv.pg && typeof srv.pg === 'object' && !Array.isArray(srv.pg) ? srv.pg : (srv.pg = {});
  const acks = [];
  for (const e of (Array.isArray(deltas) ? deltas : []).slice(0, 60)) {
    if (!e || typeof e.id !== 'string' || !/^[0-9a-f]{8,32}$/.test(e.id) || !e.d || typeof e.d !== 'object') continue;
    if (pg[e.id]) { acks.push(e.id); continue; }
    for (const [k, d] of Object.entries(e.d)) {
      const n = Math.trunc(+d);
      if (!PG_KEY.test(k) || !Number.isFinite(n) || Math.abs(n) > PG_STEP) continue;
      vals[k] = clampPg((vals[k] || 0) + n);
    }
    pg[e.id] = now; acks.push(e.id);
  }
  for (const [id, at] of Object.entries(pg)) if (now - at > PG_KEEP) delete pg[id];
  const ids = Object.keys(pg);
  if (ids.length > 3000) ids.sort((a, b) => pg[a] - pg[b]).slice(0, ids.length - 3000).forEach(id => delete pg[id]);
  return acks;
}
// 给网页的计数：现在的数，和最近 10 天记过的编号（网页刷新后据此划掉已经记上的，不会把它们再算一遍）
function pgOut(prof, srv, now) {
  const pg = srv.pg && typeof srv.pg === 'object' ? srv.pg : {};
  const acks = Object.keys(pg).filter(id => now - pg[id] <= PG_KEEP).sort((a, b) => pg[b] - pg[a]).slice(0, 500);
  return { vals: pgVals(prof), acks };
}
// 存档里不是计数的部分，两份怎么合（确定的规则，谁先到谁后到结果都一样）：
//   侠客：两边有的都算；关卡星、青锋行最高波数：每一项取较高的（这是“最好成绩”，不是累计量）；
//   列传：每位侠客取重走次数多的、再取走得远的，结局合在一起；排位：按 at 取新的那份；online10Unlocked：有一边解锁就算
function mergeStored(stored, inc) {
  const out = {};
  const own = new Set([...(Array.isArray(stored.owned) ? stored.owned : []), ...(Array.isArray(inc.owned) ? inc.owned : [])].filter(h => typeof h === 'string' && /^[a-z]{2,16}$/.test(h)));
  out.owned = own.size ? [...own] : ['qingfeng'];
  const stars = {};
  for (const src of [stored.stageStars, inc.stageStars]) if (src && typeof src === 'object' && !Array.isArray(src)) for (const [k, v] of Object.entries(src)) if (/^[\w-]{1,32}$/.test(k)) stars[k] = Math.max(stars[k] || 0, Math.max(0, Math.min(3, Math.floor(+v || 0))));
  out.stageStars = stars;
  out.qfx = Math.max(clampPg(stored.qfx), clampPg(inc.qfx));
  out.online10Unlocked = !!(stored.online10Unlocked || inc.online10Unlocked);
  if (stored.saga || inc.saga) out.saga = mergeSagaSrv(stored.saga, inc.saga);
  const sr = stored.rk && typeof stored.rk === 'object' ? stored.rk : null, ir = inc.rk && typeof inc.rk === 'object' ? inc.rk : null;
  if (sr || ir) out.rk = !ir ? sr : !sr ? ir : ((+sr.at || 0) > (+ir.at || 0) ? sr : ir);
  return out;
}
function cleanSagaSrv(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [h, r] of Object.entries(v)) {
    if (!/^[a-z]{2,16}$/.test(h) || !r || typeof r !== 'object') continue;
    out[h] = { r: Math.max(0, Math.min(1e6, Math.floor(+r.r || 0))), s: Math.max(0, Math.min(20, Math.floor(+r.s || 0))), f: /^[a-z0-9_]{0,16}$/.test(r.f || '') ? (r.f || '') : '', c: r.c ? 1 : 0,
      e: Array.isArray(r.e) ? Array.from(new Set(r.e.filter(x => typeof x === 'string' && /^[a-z0-9_]{1,16}$/.test(x)))).slice(0, 8) : [], t: Math.max(0, +r.t || 0) };
  }
  return out;
}
function mergeSagaSrv(a, b) {
  const A = cleanSagaSrv(a), B = cleanSagaSrv(b), out = {};
  for (const h of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = A[h], y = B[h];
    if (!x || !y) { out[h] = x || y; continue; }
    const win = x.r !== y.r ? (x.r > y.r ? x : y) : x.s !== y.s ? (x.s > y.s ? x : y) : (x.t >= y.t ? x : y);
    out[h] = { ...win, e: Array.from(new Set([...x.e, ...y.e])) };
  }
  return out;
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
  const prog = body.prog && typeof body.prog === 'object' && Array.isArray(body.prog.deltas) ? body.prog : null;
  const cfg = await cfgNow(env, now);
  for (let attempt = 0; attempt < 5; attempt++) {
    const urow = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(uid).first();
    const stored = parseProfile(urow ? urow.profile_json : '', auth.user.username);
    const eco = await loadEcon(env, uid, stored, now);
    const ink0 = eco.ink, ver = eco.ver;
    const p = { ...incoming };
    delete p.armory; delete p.ledger; delete p.prog;
    p.name = auth.user.username;
    p.updatedAt = now;
    // 计数走增量账；其余进度和服务器上那份按确定的规则合并，不让后到的一份把另一台设备的进度盖掉
    let pgAcks = [];
    if (prog) {
      const vals = pgVals(stored);
      pgAcks = pgApply(eco.srv, vals, prog.deltas, now);
      pgPut(p, vals);
      Object.assign(p, mergeStored(stored, incoming));
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
    return json({ ok: true, updatedAt: now, ledger: ledgerOut(eco, now), capped, owed, fix: fix.skinsAdd.length || fix.skinsDel.length ? fix : undefined, prog: prog ? { vals: pgVals(p), acks: pgAcks } : undefined });
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
// 不让注册的昵称：像是官方、开发者的。云端的 Dev 账号和别人一样按规则记账，只是这个名字只能在管理后台建、
// 重设密码（POST /api/admin/password），别人注册不了
// guest、游客：没登录时网页里的进度、任务都记在这个名字下面，注册成真账号会和没登录的状态串在一起
const RESERVED = /^(dev|dev_master|admin|administrator|root|system|gm|official|staff|guest|官方|系统|管理员|开发者|开发组|客服|刃影官方|游客)$/i;
async function profileOut(env, user, now) {
  const prof = parseProfile(user.profile_json, user.username);
  const eco = await loadEcon(env, user.id, prof, now);
  return { profile: overlay(prof, eco), ledger: ledgerOut(eco, now), prog: pgOut(prof, eco.srv, now) };
}

/* ---------- 玩家市场：看谁在卖什么、最近成交多少（挂单、买、撤都走 /api/econ） ---------- */
// 不给卖家是谁：只告诉看的人哪几单是他自己挂的
const mktTtl = () => C.cv(CFG_CACHE.cfg, 'mktDays') * DAY_MS;   // 挂单挂几天（管理员在线改过就按改过的）
async function handleMarket(env, uid, k, now) {
  await cfgNow(env, now);
  if (k) {
    if (!C.isItem(k)) return error('没有这件饰品', 404);
    const open = (await env.DB.prepare('SELECT id, st, price, at, seller = ? AS mine FROM mkt WHERE k = ? AND state = 0 AND at >= ? ORDER BY price, at LIMIT 80').bind(uid, k, now - mktTtl()).all()).results || [];
    const deals = (await env.DB.prepare('SELECT st, price, done_at AS at FROM mkt WHERE k = ? AND state = 1 ORDER BY done_at DESC LIMIT 120').bind(k).all()).results || [];
    return json({ ok: true, now, k, open: open.map(r => ({ l: r.id, st: r.st, price: r.price, at: r.at, mine: !!r.mine })), deals: deals.map(r => ({ st: r.st, price: r.price, at: r.at })) });
  }
  // 每一款：在卖几件、最低多少（普通版 n / lo，斩数版 sn / slo），最近一次成交（last / slast），30 天成交几次（d）
  const open = (await env.DB.prepare('SELECT k, st >= 0 AS s, COUNT(*) AS n, MIN(price) AS lo FROM mkt WHERE state = 0 AND at >= ? GROUP BY k, st >= 0').bind(now - mktTtl()).all()).results || [];
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
    const skins0 = mergeSkins(prof.skins, eco.state, eco.srv, eco.ver);
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
      give: given.length ? given.map(itemRef) : undefined, take: taken.length ? taken.map(itemRef) : undefined });
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

// ---------- 找回饰品：按流水查“拿到过、现在库存和挂单里都没有”的饰品，管理员确认后放回去 ----------
// 正常的去向（汰换掉、一键卖掉重复的、在玩家市场卖掉）只列出来，不能找回（找回就是凭空多一件）；
// 去向不明的（某一步操作里突然没了、旧流水没记去向）和管理员收走的可以找回。找回过的会标出来，不能再找回第二次
const LOST_WHY = { trade: '汰换掉了', sellDupes: '一键卖掉了重复的', sold: '在玩家市场卖掉了', admin: '管理员收走了' };
const parseItemRef = t => { const m = /^([a-z]{2}_[a-z0-9]+)#(\d+)( st(\d+)?)?$/.exec(String(t)); return m && C.isItem(m[1]) ? { k: m[1], i: +m[2], st: m[3] ? +(m[4] || 0) : -1, n: m[4] !== undefined } : null; };   // 老流水只记了 st，没有斩数
async function lostItems(env, uid) {
  const row = await env.DB.prepare('SELECT state_json FROM econ WHERE uid = ?').bind(uid).first();
  const st = parseObj(row && row.state_json) || C.blank(), here = new Set();
  for (const it of Array.isArray(st.inv) ? st.inv : []) if (it) here.add(+it.i);
  for (const L of Array.isArray(st.lst) ? st.lst : []) if (L && L.it) here.add(+L.it.i);
  const sold = new Set();
  for (const r of (await env.DB.prepare('SELECT item_json FROM mkt WHERE seller = ? AND state = 1').bind(uid).all()).results || []) { const it = parseObj(r.item_json); if (it) sold.add(+it.i); }
  const log = (await env.DB.prepare('SELECT at, act, ok, detail FROM econ_log WHERE uid = ? ORDER BY id LIMIT 20000').bind(uid).all()).results || [];
  const seen = new Map();
  const one = (x, fresh) => { let o = seen.get(x.i); if (!o) seen.set(x.i, o = { i: x.i, k: x.k, st: x.st }); else if (fresh || x.n) { o.k = x.k; o.st = x.st; } return o; };   // 记了斩数的以最近一次为准；老流水没记斩数，以拿到时的为准
  const got = (t, r) => { const x = parseItemRef(t); if (x) { const o = one(x, true); if (!o.got) o.got = { at: r.at, act: r.act }; } };
  const gone = (t, r, why) => { const x = typeof t === 'number' ? seen.get(t) : parseItemRef(t); if (!x) return; const o = one(x); o.gone = { at: r.at, act: r.act, why }; o.restored = null; };
  for (const r of log) {
    const d = parseObj(r.detail); if (!d) continue;
    if (r.act === 'restore') { for (const x of Array.isArray(d.items) ? d.items : []) { const o = seen.get(+x.from); if (o) o.restored = { at: r.at, to: x.to }; } for (const t of d.ad || []) got(t, r); continue; }
    if (r.act === 'admin') { for (const t of d.give || []) got(t, r); for (const t of d.take || []) gone(t, r, 'admin'); continue; }
    if (!r.ok && !d.rm && !d.ad) continue;
    if (typeof d.r === 'string') got(d.r, r);   // 开箱、汰换、终端机、买到的那一件
    for (const t of Array.isArray(d.ad) ? d.ad : []) got(t, r);
    for (const t of Array.isArray(d.rm) ? d.rm : []) gone(t, r);
    if (r.act === 'trade' && r.ok && !d.rm && d.a && Array.isArray(d.a.ids)) for (const i of d.a.ids) gone(+i, r);   // 旧流水没记进出：汰换按参数里的编号算
  }
  const out = [];
  for (const o of seen.values()) {
    if (here.has(o.i)) continue;
    const g = o.gone, why = o.restored ? 'restored' : sold.has(o.i) ? 'sold' : g && g.why === 'admin' ? 'admin' : g && LOST_WHY[g.act] ? g.act : g ? 'odd' : 'unknown';
    out.push({ i: o.i, k: o.k, st: o.st, got: o.got || null, gone: g || null, why, can: ['admin', 'odd', 'unknown'].includes(why) });
  }
  out.sort((a, b) => ((b.gone && b.gone.at) || 0) - ((a.gone && a.gone.at) || 0) || b.i - a.i);
  return out.slice(0, 300);
}
async function adminRestore(env, u, body, who, why, now) {
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number))] : [];
  if (!ids.length || ids.length > 50 || ids.some(i => !Number.isInteger(i) || i < 1)) return error('要找回的饰品编号不对（一次最多 50 件）');
  const lost = new Map((await lostItems(env, u.id)).map(x => [x.i, x]));
  for (const i of ids) {
    const x = lost.get(i);
    if (!x) return error(`第 ${i} 号饰品不在“找不到的饰品”里（可能还在库存里，或者流水里没有它）`);
    if (!x.can) return error(`第 ${i} 号饰品${x.why === 'restored' ? '已经找回过了' : LOST_WHY[x.why] || '是正常没的'}，不能找回`);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const urow = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(u.id).first();
    const prof = parseProfile(urow ? urow.profile_json : '', u.username);
    const eco = await loadEcon(env, u.id, prof, now);
    const s = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid: u.id });
    const skins0 = mergeSkins(prof.skins, eco.state, eco.srv, eco.ver);
    const E = { now, rnd, uid: u.id, ink: eco.ink, skins: skins0.slice(), equip: fixEquip(cleanEquip(prof.equip), skins0), server: true };
    const taken = new Set([...s.inv.map(x => x.i), ...s.lst.map(L => L.it.i)]), items = [];
    for (const i of ids) {
      const x = lost.get(i), to = taken.has(i) ? s.nid++ : i;   // 原来的编号空着就用原来的，流水里好对上
      taken.add(to); s.nid = Math.max(s.nid, to + 1);
      C.addItem(s, { i: to, k: x.k, st: x.st, n: '', t: now, src: 'restore' }, E);
      items.push({ from: i, to, k: x.k, st: x.st });
    }
    const add = E.skins.filter(k => !skins0.includes(k)), ver = eco.ver, srv = eco.srv;
    for (const k of add) delete srv.gone[k];
    const p = { ...prof, ink: E.ink, skins: E.skins, equip: E.equip, updatedAt: now };
    delete p.armory; delete p.ledger;
    const detail = JSON.stringify({ by: who, why, items, ad: items.map(x => itemRef({ k: x.k, i: x.to, st: x.st })) });
    const results = await env.DB.batch([
      ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [u.id, now, 'restore', 1, eco.ink, E.ink, detail.slice(0, 2000)], u.id, ver),
      userWrite(env, u.id, p, now, ver),
      econWrite(env, u.id, ver, now, srv, E.ink, JSON.stringify(s)),
    ]);
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;   // 玩家刚好也在动：重读再改
    return json({ ok: true, uid: u.id, items });
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
  if (route === 'GET /api/admin/errors') {   // 错误记录：最近出现的在前；kind 不填就全部
    const kind = q('kind'), days = Math.max(1, Math.min(30, +q('days') || 7));
    const rows = (await env.DB.prepare(
      `SELECT sig, kind, msg, src, stack, meta, n, first_at, last_at, ms, ms_sum FROM errs WHERE last_at > ?1 ${kind ? 'AND kind = ?2' : ''} ORDER BY last_at DESC LIMIT 200`
    ).bind(...(kind ? [now - days * DAY_MS, kind] : [now - days * DAY_MS])).all()).results || [];
    return json({ ok: true, days, rows });
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
    const rows = await env.DB.prepare("SELECT l.at, l.uid, u.username, l.act, l.ink0, l.ink1, l.detail FROM econ_log l LEFT JOIN users u ON u.id = l.uid WHERE l.act IN ('admin', 'restore', 'admin_ban', 'pardon', 'admin_pw', 'gift_new', 'gift_off', 'code_new', 'code_off', 'cfg', 'flag') ORDER BY l.id DESC LIMIT 100").all();
    return json({ ok: true, rows: rows.results || [] });
  }
  if (route === 'POST /api/admin/adjust') {
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    return needWhy() || await adminAdjust(env, u, body, who, why, now);
  }
  if (route === 'GET /api/admin/lost') {   // 找回饰品：这个号拿到过、现在没有的饰品，各自是哪一步没的
    const u = await findUser(q('uid'));
    if (!u) return error('没有这个账号', 404);
    return json({ ok: true, uid: u.id, username: u.username, items: await lostItems(env, u.id) });
  }
  if (route === 'POST /api/admin/restore') {   // 把找不到的饰品放回库存（只认去向不明、管理员收走的）
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    return needWhy() || await adminRestore(env, u, body, who, why, now);
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
    let u = await findUser(key), created = false;
    const pwr = await makePassword(env, u || { username: key }, pw, now);
    if (!u) {
      if (body.create !== true) return error('没有这个账号', 404);
      if (key.length < 2 || key.length > 20 || /^u_/i.test(key) || /[\u0000-\u001f\u007f<>]/.test(key)) return error('新账号的昵称要 2 到 20 个字，不能用 u_ 开头');
      u = { id: 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), username: key };
      await env.DB.prepare('INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at, password_algo, password_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(u.id, key, pwr.hash, pwr.salt, JSON.stringify(newProfile(key, now)), now, now, pwr.algo, now).run();
      created = true;
    } else {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, password_algo = ?, password_updated_at = ?, updated_at = ? WHERE id = ?').bind(pwr.hash, pwr.salt, pwr.algo, now, now, u.id),
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
  if (route === 'GET /api/admin/flags') {   // 所有登记过的开关：现在是什么、默认是什么、谁什么时候改的
    const rows = await flagRows(env, 0);
    return json({ ok: true, flags: Object.entries(FLAGS).map(([k, [def, desc, client]]) => ({ k, mode: flagMode(rows, k), def, desc, client: !!client, by: rows[k] ? rows[k].by : '', note: rows[k] ? rows[k].note : '', at: rows[k] ? rows[k].at : 0 })) });
  }
  if (route === 'POST /api/admin/flags') {   // k 是开关名，mode 是 off / dev / all
    const w = needWhy(); if (w) return w;
    const k = String(body.k || ''), mode = String(body.mode || '');
    if (!FLAGS[k]) return error('没有这个开关');
    if (!FLAG_MODES.includes(mode)) return error('mode 要是 off（关）、dev（只开 Dev 账号）或 all（所有人）');
    const before = flagMode(await flagRows(env, 0), k);
    await env.DB.prepare('INSERT INTO flags (k, mode, by, note, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(k) DO UPDATE SET mode = ?2, by = ?3, note = ?4, at = ?5').bind(k, mode, who, why, now).run();
    FLAG_CACHE = { db: null, at: 0, rows: {} };
    await logRow(env, '*', now, 'flag', 1, null, null, JSON.stringify({ by: who, why, k, from: before, to: mode }));
    return json({ ok: true, k, mode });
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
const ADMIN_PAGE = { html: "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"robots\" content=\"noindex, nofollow\">\n<meta name=\"color-scheme\" content=\"dark\">\n<title>刃影管理后台</title>\n<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='2' y='2' width='28' height='28' rx='6' fill='%23b8392e'/%3E%3Cpath d='M10 9h12M16 9v15M11 15l5 4 5-4' stroke='%23fbeee0' stroke-width='2.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\">\n<!--\n  刃影管理后台：Worker 的 /admin 回这一页（python3 tools/build.py 把它打包进 cloudflare/worker.bundle.js）。\n  只连这个 Worker 自己的 /api/admin/*，要管理口令（ADMIN_SECRET）；口令只存在这个标签页的 sessionStorage 里。\n  整页只有最下面一段脚本：Worker 按它的 sha256 放行，别的脚本、onclick 这种都不会跑，所以事件一律用 addEventListener。\n  服务器给的字（昵称、原因、说明）一律经过 H`` 转义再放进网页。\n-->\n<style>\n  :root {\n    --bg: #0a0b1c; --bg2: #0e1024; --panel: #13152c; --panel2: #1a1c38;\n    --line: rgba(239, 232, 216, .11); --line2: rgba(239, 232, 216, .22);\n    --ink: #efe8d8; --dim: rgba(239, 232, 216, .66); --faint: rgba(239, 232, 216, .44);\n    --gold: #e9c46a; --gold2: #f3d690; --goldbg: rgba(233, 196, 106, .12);\n    --seal: #b8392e; --red: #ff8a80; --redbg: rgba(255, 110, 100, .12); --ok: #74d9ad; --okbg: rgba(116, 217, 173, .12);\n    --title: \"STKaiti\", \"KaiTi\", \"Kaiti SC\", \"楷体\", serif;\n    --body: -apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", \"Noto Sans SC\", system-ui, sans-serif;\n    --mono: ui-monospace, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace;\n    color-scheme: dark;\n  }\n  * { box-sizing: border-box; }\n  html, body { margin: 0; }\n  body {\n    min-height: 100vh; color: var(--ink); font: 14px/1.6 var(--body); -webkit-text-size-adjust: 100%;\n    background: var(--bg) radial-gradient(ellipse 110% 55% at 50% -12%, rgba(233, 196, 106, .09), transparent 62%) no-repeat;\n  }\n  .hidden { display: none !important; }\n  h1, h2, h3 { font-family: var(--title); font-weight: 400; letter-spacing: .04em; margin: 0; line-height: 1.25; text-wrap: balance; }\n  p { margin: 0 0 10px; text-wrap: pretty; }\n  small { color: var(--faint); font-family: var(--body); font-size: 12.5px; letter-spacing: 0; }\n  .mono { font-family: var(--mono); font-size: 12.5px; }\n  .hint { color: var(--faint); font-size: 12.5px; }\n  .empty { color: var(--faint); padding: 18px 0 6px; text-align: center; }\n  .loading { color: var(--faint); padding: 40px 0; text-align: center; }\n  .nowrap { white-space: nowrap; }\n  .up { color: var(--ok); font-weight: 600; }\n  .down { color: var(--red); font-weight: 600; }\n\n  /* 按钮和输入框 */\n  .btn {\n    appearance: none; border: 1px solid transparent; background: var(--gold); color: #1d1606; cursor: pointer;\n    font: 600 14px/1.2 var(--body); padding: 9px 16px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;\n    transition: filter .15s, background-color .15s, border-color .15s; white-space: nowrap;\n  }\n  .btn:hover { filter: brightness(1.08); }\n  .btn:disabled { opacity: .42; cursor: not-allowed; filter: none; }\n  .btn.ghost { background: transparent; color: var(--ink); border-color: var(--line2); font-weight: 500; }\n  .btn.ghost:hover:not(:disabled) { background: rgba(255, 255, 255, .05); border-color: rgba(239, 232, 216, .34); }\n  .btn.danger { background: var(--seal); color: #fff1ea; }\n  .btn.sm { font-size: 12.5px; padding: 5px 10px; border-radius: 6px; }\n  .btn.wide { width: 100%; justify-content: center; padding: 11px 16px; font-size: 15px; }\n  .link { appearance: none; background: none; border: 0; padding: 0; color: var(--gold2); font: inherit; font-weight: 600; cursor: pointer; text-align: left; }\n  .link:hover { text-decoration: underline; text-underline-offset: 3px; }\n  :focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }\n  input, select {\n    font: inherit; color: var(--ink); background: var(--bg2); border: 1px solid var(--line2); border-radius: 7px;\n    padding: 7px 10px; width: 100%; min-width: 0; transition: border-color .15s, box-shadow .15s;\n  }\n  input::placeholder { color: rgba(239, 232, 216, .3); }\n  input:focus, select:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(233, 196, 106, .16); }\n  input[type=checkbox] { width: auto; accent-color: var(--gold); margin: 0; }\n  input[type=number] { font-variant-numeric: tabular-nums; }\n  select { cursor: pointer; }\n  .f { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--dim); min-width: 0; }\n  .f .cur { color: var(--faint); font-size: 11.5px; margin-top: -3px; }\n  .chk { display: inline-flex; align-items: center; gap: 7px; color: var(--dim); font-size: 13px; cursor: pointer; }\n  .giverow .chk, .row .chk { white-space: nowrap; }\n  .grid { display: grid; gap: 10px 12px; grid-template-columns: repeat(auto-fill, minmax(138px, 1fr)); margin: 6px 0 4px; }\n  .row { display: flex; align-items: center; gap: 10px; }\n  .row.wrap { flex-wrap: wrap; }\n  .row.between { justify-content: space-between; }\n  .row.end { justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }\n  .w120 { width: 120px; }\n  .grow { flex: 1 1 14em; }\n\n  /* 登录 */\n  .login { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }\n  .login form {\n    width: min(390px, 100%); padding: 30px 24px 22px; border-radius: 16px; text-align: center;\n    background: linear-gradient(180deg, var(--panel), var(--bg2)); border: 1px solid var(--line);\n    box-shadow: 0 30px 80px rgba(0, 0, 0, .45);\n  }\n  .login h1 { font-size: 30px; margin: 14px 0 6px; }\n  .login .f { text-align: left; margin: 18px 0 12px; }\n  .login .msg { color: var(--red); min-height: 1.6em; margin: 10px 0 4px; font-size: 13px; }\n  .seal {\n    width: 34px; height: 34px; flex: none; display: grid; place-items: center; background: var(--seal); color: #fbeee0;\n    font: 20px/1 var(--title); border-radius: 6px; transform: rotate(-3deg);\n    box-shadow: inset 0 0 0 2px #8e2a21, inset 0 0 0 3.5px rgba(255, 240, 225, .45);\n  }\n  .seal.big { width: 56px; height: 56px; font-size: 32px; margin: 0 auto; border-radius: 8px; }\n\n  /* 顶栏和分页 */\n  .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 10px; max-width: 1180px; margin: 0 auto; }\n  .brand { display: flex; align-items: center; gap: 11px; min-width: 0; }\n  .brand h1 { font-size: 22px; white-space: nowrap; }\n  .brand small { display: block; margin-top: 1px; }\n  .me { display: flex; align-items: center; gap: 10px; color: var(--dim); font-size: 13px; }\n  .me b { color: var(--gold2); font-weight: 600; }\n  .tabs {\n    position: sticky; top: 0; z-index: 5; background: rgba(10, 11, 28, .9); border-bottom: 1px solid var(--line);\n    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);\n  }\n  .tabs div { display: flex; gap: 2px; overflow-x: auto; max-width: 1180px; margin: 0 auto; padding: 0 8px; scrollbar-width: none; }\n  .tabs div::-webkit-scrollbar { display: none; }\n  .tabs button {\n    flex: none; appearance: none; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--dim); cursor: pointer;\n    font: 500 14.5px/1 var(--body); padding: 13px 13px 11px; transition: color .15s, border-color .15s;\n  }\n  .tabs button:hover { color: var(--ink); }\n  .tabs button[aria-selected=true] { color: var(--gold); border-bottom-color: var(--gold); }\n  main { max-width: 1180px; margin: 0 auto; padding: 18px 16px 70px; }\n  footer { text-align: center; color: var(--faint); font-size: 12px; padding: 0 16px 28px; }\n\n  /* 卡片、数字块 */\n  .card { background: linear-gradient(180deg, var(--panel), var(--bg2)); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 16px; }\n  .card h2 { font-size: 21px; color: var(--gold2); margin-bottom: 8px; }\n  .card h3 { font-size: 17px; margin: 16px 0 8px; }\n  .card.err { color: var(--red); display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }\n  .tiles { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); margin-bottom: 16px; }\n  .tiles.sm { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin: 12px 0 0; }\n  .tile { background: rgba(255, 255, 255, .025); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; min-width: 0; }\n  .tile span { color: var(--dim); font-size: 12.5px; }\n  .tile b { display: block; font: 600 23px/1.25 var(--body); font-variant-numeric: tabular-nums; margin-top: 2px; overflow-wrap: anywhere; }\n  .tile b small { font-weight: 400; color: var(--dim); font-size: 13px; margin-left: 3px; }\n  .tiles.sm .tile { padding: 9px 11px; }\n  .tiles.sm .tile b { font-size: 18px; }\n  .tile i { font-style: normal; color: var(--faint); font-size: 12px; }\n  .badge { display: inline-block; font-size: 11.5px; line-height: 1.5; padding: 0 7px; border-radius: 99px; border: 1px solid var(--line2); color: var(--dim); white-space: nowrap; vertical-align: 1px; font-family: var(--body); letter-spacing: 0; }\n  .badge.gold { color: var(--gold2); border-color: rgba(233, 196, 106, .45); background: var(--goldbg); }\n  .badge.bad { color: var(--red); border-color: rgba(255, 138, 128, .45); background: var(--redbg); }\n  .badge.ok { color: var(--ok); border-color: rgba(116, 217, 173, .4); background: var(--okbg); }\n  .tier { display: inline-block; font-size: 12px; padding: 0 7px; border-radius: 4px; white-space: nowrap; color: rgb(var(--tc)); color: color-mix(in srgb, rgb(var(--tc)) 72%, #fff); background: rgba(var(--tc), .15); border: 1px solid rgba(var(--tc), .38); }\n  .it { white-space: nowrap; }\n  .it b { font-weight: 600; }\n  .it i { font-style: normal; color: var(--faint); margin-left: 6px; font-size: 12.5px; }\n  .it .st { margin-left: 6px; font-size: 11.5px; color: #ffb27a; border: 1px solid rgba(255, 178, 122, .4); border-radius: 4px; padding: 0 5px; }\n\n  /* 表格：太宽时只在表格里横向滚动 */\n  .tw { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; margin-top: 6px; }\n  table { width: 100%; border-collapse: collapse; font-size: 13px; }\n  th { text-align: left; font-weight: 500; color: var(--dim); background: rgba(255, 255, 255, .03); padding: 8px 10px; white-space: nowrap; border-bottom: 1px solid var(--line); }\n  td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }\n  tbody tr:last-child td { border-bottom: 0; }\n  tbody tr:hover td { background: rgba(255, 255, 255, .018); }\n  tr.fail td { color: var(--faint); }\n  tr.mute td { color: var(--faint); }\n  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }\n  td.detail { min-width: 200px; overflow-wrap: anywhere; color: var(--dim); }\n  td.mw { min-width: 8.5em; }\n  /* 错误 */\n  td.err { min-width: 220px; overflow-wrap: anywhere; }\n  td.err summary { cursor: pointer; }\n  td.err pre { margin: 6px 0 0; white-space: pre-wrap; font-family: var(--mono); font-size: 12px; color: var(--dim); max-height: 260px; overflow: auto; }\n  .btn.sm[aria-pressed=true] { color: var(--gold); border-color: var(--gold); }\n\n  /* 玩家 */\n  .search { display: flex; gap: 8px; margin: 4px 0 8px; }\n  .search input { flex: 1; }\n  .head .who { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }\n  .head .who h2 { margin: 0; font-size: 26px; overflow-wrap: anywhere; }\n  .head .meta { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--faint); font-size: 12.5px; margin-top: 6px; align-items: center; }\n  .crumbs { margin-bottom: 12px; }\n  .giverow { display: grid; grid-template-columns: minmax(0, 1fr) auto 90px auto; gap: 8px; align-items: center; }\n  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 2px; }\n  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 99px; background: var(--goldbg); border: 1px solid rgba(233, 196, 106, .35); font-size: 13px; }\n  .chip button { appearance: none; border: 0; background: none; color: var(--dim); cursor: pointer; font-size: 15px; line-height: 1; padding: 2px 6px; border-radius: 99px; }\n  .chip button:hover { color: var(--ink); background: rgba(255, 255, 255, .08); }\n\n  /* 经济数值 */\n  fieldset.grp { border: 1px solid var(--line); border-radius: 10px; padding: 4px 12px 8px; margin: 12px 0 0; min-width: 0; }\n  fieldset.grp legend { font-family: var(--title); font-size: 16px; color: var(--gold2); padding: 0 6px; }\n  .cfgrow { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(150px, 1fr) minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 8px 0 8px 10px; border-bottom: 1px dashed var(--line); border-left: 2px solid transparent; }\n  .cfgrow:last-of-type { border-bottom: 0; }\n  .cfgrow.mod { border-left-color: rgba(233, 196, 106, .55); }\n  .cfgrow.dirty { border-left-color: var(--ok); background: linear-gradient(90deg, rgba(116, 217, 173, .07), transparent 60%); }\n  .cfgrow label { font-size: 13.5px; }\n  .cfgin { display: flex; align-items: center; gap: 8px; }\n  .cfgin input { max-width: 140px; }\n  .pct { color: var(--faint); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }\n  .sum { font-size: 12.5px; padding: 6px 0 2px 12px; }\n  .sum.ok { color: var(--ok); }\n  .sum.bad { color: var(--red); font-weight: 600; }\n\n  /* 确认框、提示 */\n  dialog {\n    border: 1px solid var(--line2); border-radius: 14px; background: var(--panel2); color: var(--ink); padding: 0;\n    width: min(540px, calc(100vw - 32px)); max-height: calc(100vh - 48px); box-shadow: 0 30px 90px rgba(0, 0, 0, .65);\n  }\n  dialog::backdrop { background: rgba(4, 4, 12, .72); }\n  .dlg-b { padding: 20px 20px 4px; }\n  .dlg-b h3 { font-size: 21px; color: var(--gold2); margin-bottom: 12px; }\n  .dlg-b ul { margin: 0 0 14px; padding-left: 20px; display: grid; gap: 5px; }\n  .dlg-b .f { margin-bottom: 6px; }\n  .dlg-f { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px 18px; }\n  #toast {\n    position: fixed; left: 50%; bottom: 24px; z-index: 50; max-width: calc(100vw - 32px); pointer-events: none;\n    background: var(--panel2); border: 1px solid var(--line2); border-radius: 10px; padding: 10px 16px; box-shadow: 0 12px 40px rgba(0, 0, 0, .5);\n    opacity: 0; transform: translate(-50%, 16px); transition: opacity .2s, transform .2s;\n  }\n  #toast.on { opacity: 1; transform: translate(-50%, 0); }\n  #toast.err { border-color: rgba(255, 138, 128, .55); color: #ffd9d4; }\n\n  @media (max-width: 720px) {\n    .cfgrow { grid-template-columns: minmax(0, 1fr) auto; }\n    .cfgrow label { grid-column: 1 / -1; }\n    .cfgrow .hint { grid-column: 1 / -1; order: 3; }\n    .giverow { grid-template-columns: auto minmax(0, 1fr) auto; }\n    .giverow select { grid-column: 1 / -1; }\n  }\n  @media (max-width: 560px) {\n    body { font-size: 14.5px; }\n    input, select { font-size: 16px; }\n    .top { flex-wrap: wrap; }\n    .brand small { display: none; }\n    .card { padding: 14px 12px; }\n    .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }\n    .tile b { font-size: 19px; }\n    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  }\n  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }\n</style>\n</head>\n<body>\n<div id=\"login\" class=\"login hidden\">\n  <form id=\"loginForm\">\n    <div class=\"seal big\">刃</div>\n    <h1>刃影管理后台</h1>\n    <p class=\"hint\">只给开发组用。每一笔修改都要写原因，都记在流水里。</p>\n    <input type=\"text\" name=\"username\" value=\"renying-admin\" autocomplete=\"username\" hidden>\n    <label class=\"f\">管理口令<input id=\"tok\" type=\"password\" autocomplete=\"current-password\" spellcheck=\"false\" required></label>\n    <button class=\"btn wide\" id=\"loginBtn\">进入</button>\n    <p id=\"loginMsg\" class=\"msg\" role=\"alert\"></p>\n    <p class=\"hint\">口令是 Cloudflare 里 ADMIN_SECRET 的值；写成「名字:口令」的，只输入冒号后面那一段。口令只存在这个标签页里，关掉就要重新输入。</p>\n  </form>\n</div>\n\n<div id=\"app\" class=\"hidden\">\n  <header class=\"top\">\n    <div class=\"brand\"><div class=\"seal\">刃</div><div><h1>刃影管理后台</h1><small>查账号、调墨锭、发补偿和兑换码、改经济数值</small></div></div>\n    <div class=\"me\"><span>管理员 <b id=\"who\"></b></span><button class=\"btn ghost sm\" data-act=\"logout\">退出</button></div>\n  </header>\n  <nav class=\"tabs\" aria-label=\"分页\"><div role=\"tablist\">\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"home\">总览</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"players\">玩家</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"gifts\">补偿</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"codes\">兑换码</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"cfg\">经济数值</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"flags\">功能开关</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"audit\">操作记录</button>\n    <button role=\"tab\" data-act=\"tab\" data-tab=\"errors\">错误</button>\n  </div></nav>\n  <main id=\"main\"></main>\n  <footer>刃影 · 管理后台 · 所有修改都记在流水里，谁做的、为什么都查得到</footer>\n</div>\n\n<dialog id=\"dlg\"></dialog>\n<div id=\"toast\" role=\"status\" aria-live=\"polite\"></div>\n\n<script>\n'use strict';\nconst NAMES = {\"skins\":{\"qf_frost\":\"烟雨\",\"qf_gold\":\"金乌\",\"qf_abyss\":\"幽渊\",\"fy_jade\":\"碧影\",\"fy_blood\":\"血月\",\"fy_phantom\":\"幻灵\",\"ts_bronze\":\"青铜\",\"ts_obsidian\":\"玄武\",\"ts_crimson\":\"修罗\",\"ls_plum\":\"红梅\",\"ls_aurora\":\"极光\",\"ls_dragon\":\"沧龙\",\"ly_dusk\":\"晚霞\",\"ly_sky\":\"天青\",\"ly_bamboo\":\"墨竹\",\"ly_fox\":\"狐火\",\"lm_violet\":\"紫电\",\"lm_sun\":\"烈阳\",\"lm_asura\":\"金刚\",\"my_cinnabar\":\"朱砂\",\"my_gold\":\"泥金\",\"my_celestial\":\"星墨\",\"yh_sakura\":\"樱月\",\"yh_eclipse\":\"月蚀\",\"yh_solstice\":\"霜华\",\"yl_raven\":\"玄羽\",\"qf_qfx\":\"青锋行\",\"yx_snow\":\"雪箫\",\"yx_celestial\":\"钧天\",\"zx_amber\":\"琥珀\",\"zx_immortal\":\"酒剑仙\",\"gc_crimson\":\"赤锤\",\"gc_underworld\":\"冥狱\",\"lq_silk\":\"素丝\",\"lq_sparrow\":\"惊雀\",\"yl_phoenix\":\"凤羽\",\"yl_blizzard\":\"雪鸮\",\"qf_p1\":\"竹影\",\"ts_p1\":\"锈蚀\",\"lm_p1\":\"夜雨\",\"fy_p1\":\"沙暴\",\"ly_p1\":\"胭脂\",\"ls_p1\":\"墨梅\",\"yh_p1\":\"碧潮\",\"my_p1\":\"月白\",\"yl_p1\":\"赤霞\",\"gc_p1\":\"苔痕\",\"yx_p1\":\"紫檀\",\"zx_p1\":\"松烟\",\"qf_p2\":\"赤练\",\"ts_p2\":\"冰川\",\"ls_p2\":\"琥珀\",\"lm_p2\":\"霓虹\",\"fy_p2\":\"夜航\",\"ly_p2\":\"苍山\",\"yh_p2\":\"鎏金\",\"yl_p2\":\"夜鸦\",\"my_p2\":\"青花\",\"gc_p2\":\"赭石\",\"yx_p2\":\"靛青\",\"zx_p2\":\"青瓷\",\"gc_wolf\":\"霜狼\",\"zx_moon\":\"醉月\",\"qf_renying\":\"刃影\",\"lm_jiuxiao\":\"九霄\",\"yh_guanghan\":\"广寒\",\"ls_tianhe\":\"天河\",\"fy_huandie\":\"幻蝶\",\"ts_liuli\":\"琉璃\",\"yx_tianlai\":\"天籁\",\"my_qinglv\":\"青绿\",\"yl_kongque\":\"孔雀\",\"ly_jinli\":\"锦鲤\",\"qf_zpis\":\"双鱼·星辉\",\"qf_zsag\":\"射手·星焰\",\"qf_zleo\":\"狮子·星冕\",\"fy_ztau\":\"金牛·星辉\",\"fy_zaqu\":\"水瓶·星焰\",\"fy_zsco\":\"天蝎·星冕\",\"ts_zcap\":\"摩羯·星辉\",\"ts_zleo\":\"狮子·星焰\",\"ts_ztau\":\"金牛·星冕\",\"ls_zgem\":\"双子·星辉\",\"ls_zsco\":\"天蝎·星焰\",\"ls_zsag\":\"射手·星冕\",\"ly_zvir\":\"处女·星辉\",\"ly_zpis\":\"双鱼·星焰\",\"ly_zlib\":\"天秤·星冕\",\"lm_zleo\":\"狮子·星辉\",\"lm_zcap\":\"摩羯·星焰\",\"lm_zari\":\"白羊·星冕\",\"my_zaqu\":\"水瓶·星辉\",\"my_zlib\":\"天秤·星焰\",\"my_zvir\":\"处女·星冕\",\"yh_zlib\":\"天秤·星辉\",\"yh_zvir\":\"处女·星焰\",\"yh_zcan\":\"巨蟹·星冕\",\"yl_zsag\":\"射手·星辉\",\"yl_zari\":\"白羊·星焰\",\"yl_zgem\":\"双子·星冕\",\"yx_zcan\":\"巨蟹·星辉\",\"yx_zgem\":\"双子·星焰\",\"yx_zpis\":\"双鱼·星冕\",\"zx_zsco\":\"天蝎·星辉\",\"zx_zcan\":\"巨蟹·星焰\",\"zx_zaqu\":\"水瓶·星冕\",\"gc_zari\":\"白羊·星辉\",\"gc_ztau\":\"金牛·星焰\",\"gc_zcap\":\"摩羯·星冕\"},\"heroes\":{\"qingfeng\":\"青锋\",\"feiying\":\"绯影\",\"tieshan\":\"铁山\",\"lingshuang\":\"凌霜\",\"liuyun\":\"流云\",\"leiming\":\"雷鸣\",\"moyu\":\"墨羽\",\"yuehua\":\"月华\",\"yanling\":\"燕翎\",\"yuxiao\":\"玉箫\",\"zuixian\":\"醉翁\",\"gouchen\":\"勾陈\",\"lingque\":\"凌雀\"}};   // 打包时填上：{ skins: { 皮肤 key: 名字 }, heroes: { 侠客 id: 名字 } }\nconst SKIN = (NAMES && NAMES.skins) || {}, HERO = (NAMES && NAMES.heroes) || {};\nconst $ = (sel, el = document) => el.querySelector(sel);\n\n/* ---------- 拼网页：H`…${值}…` 里的值一律转义，只有 H 拼出来的才原样放进去 ---------- */\nconst ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' };\nconst esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>\"']/g, c => ESC[c]);\nclass Raw { constructor(s) { this.s = s; } }\nconst put = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(put).join('') : esc(v);\nconst H = (strs, ...vals) => new Raw(strs.reduce((o, s, i) => o + s + (i < vals.length ? put(vals[i]) : ''), ''));\nconst paint = (el, raw) => { el.innerHTML = put(raw); };\n\n/* ---------- 数字和时间 ---------- */\nconst fmtN = n => Math.round(+n || 0).toLocaleString('zh-CN');\nconst sign = n => (n > 0 ? '+' : '') + fmtN(n);\nconst pad = n => String(n).padStart(2, '0');\nfunction fmtT(ms) {\n  if (!ms) return '—';\n  const d = new Date(+ms);\n  return (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());\n}\nfunction ago(ms) {\n  if (!ms) return '—';\n  const s = (Date.now() - ms) / 1000;\n  if (s < 60) return '刚刚';\n  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';\n  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';\n  if (s < 30 * 86400) return Math.floor(s / 86400) + ' 天前';\n  return fmtT(ms);\n}\nconst parse = t => { try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };\n\n/* ---------- 口令、请求 ---------- */\nconst KEY = 'renying-admin';\nconst S = { tok: '', who: '', tab: 'home', uid: '', q: '', p: null, give: [], gifts: [], codes: [], cfg: null, flags: [], seq: 0 };\nconst saveTok = t => { try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch (e) {} };\nconst loadTok = () => { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } };\n\nasync function api(path, body) {\n  const headers = { Authorization: 'Bearer ' + S.tok };\n  if (body) headers['Content-Type'] = 'application/json';\n  let r;\n  try { r = await fetch('/api/admin/' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); }\n  catch (e) { throw new Error('连不上服务器，检查一下网络'); }\n  let j = {};\n  try { j = await r.json(); } catch (e) {}\n  if (r.status === 403 && S.who) { logout('口令失效了（可能刚换过），请重新输入'); throw new Error('口令失效了'); }\n  if (!r.ok || !j.ok) throw new Error(j.error || '出错了（' + r.status + '）');\n  return j;\n}\n\n/* ---------- 武器箱、饰品、品质（登录后从服务器读一次） ---------- */\nconst CAT = { items: {}, cols: {}, tiers: {}, order: [], caseIds: [], cfgInfo: [] };\nfunction useCat(c) {\n  CAT.order = c.tiers.map(t => t.id);\n  for (const t of c.tiers) CAT.tiers[t.id] = t;\n  for (const x of c.cols) CAT.cols[x.id] = x;\n  for (const x of c.items) CAT.items[x.k] = x;\n  CAT.caseIds = c.cols.map(x => x.id);\n  CAT.cfgInfo = c.cfg || [];\n}\nconst itemName = k => SKIN[k] || k;\nconst heroOf = k => HERO[(CAT.items[k] || {}).char] || '';\nconst caseName = c => CAT.cols[c] ? CAT.cols[c].name + '武器箱' : String(c || '—');\nconst tierTag = t => CAT.tiers[t] ? H`<span class=\"tier\" style=\"--tc:${CAT.tiers[t].c}\">${CAT.tiers[t].n}</span>` : '';\nconst itemTag = (k, st) => H`<span class=\"it\"><b>${itemName(k)}</b><i>${heroOf(k)}</i>${st >= 0 ? H`<span class=\"st\">斩数 ${st}</span>` : ''}</span>`;\nconst cfgName = k => { const x = CAT.cfgInfo.find(r => r[0] === k); return x ? x[5] + '：' + x[6] : k; };\nconst unit = (n, u) => H`${fmtN(n)}<small>${u}</small>`;\nconst tile = (label, v, sub) => H`<div class=\"tile\"><span>${label}</span><b>${typeof v === 'number' ? fmtN(v) : v}</b>${sub ? H`<i>${sub}</i>` : ''}</div>`;\nconst SRC = { case: '开箱', term: '终端机', trade: '汰换', supply: '补给', op: '星章兑换', admin: '管理员发的', restore: '找回的', market: '市场买的' };\nconst ACT = {\n  open: '开箱', store: '商店', buyCase: '买武器箱', buyTerm: '买终端机', list: '挂单', buy: '买下', cancel: '撤单', trade: '汰换', rename: '改名',\n  equip: '穿上', unequip: '脱下', unseal: '开封终端机', termNext: '终端机换一件', termBuy: '终端机买下', supply: '领补给', mission: '领任务奖励',\n  star: '星章兑换', collect: '集齐奖励', matchEnd: '对局结束', matchStart: '开局', sync: '同步', gift: '新手礼',\n  ledger: '本机收入', ink_spike: '大额上报', invariant: '数值异常', strike: '反作弊记过', open_account: '建武库存档',\n  admin: '管理员调整', restore: '找回饰品', admin_ban: '封号', pardon: '解封', admin_pw: '重设密码', gift_got: '领到补偿', gift_new: '发补偿', gift_off: '停发补偿', cfg: '改经济数值',\n  claimCode: '兑换', code_got: '兑换礼包码', code_new: '建兑换码', code_off: '停用兑换码', flag: '改功能开关',\n};\nconst FLAG_MODE = { off: '关', dev: '只开 Dev 账号', all: '所有人开' };\n\n/* ---------- 流水里的详情写成人话 ---------- */\nfunction stuff(d) {   // 墨锭、武器箱、终端机、改名标签（调整、补偿共用）\n  const out = [];\n  if (d.ink) out.push('墨锭 ' + sign(d.ink));\n  for (const [c, n] of Object.entries(d.cases || {})) out.push(caseName(c) + ' ' + sign(n));\n  if (d.term) out.push('终端机 ' + sign(d.term));\n  if (d.tags) out.push('改名标签 ' + sign(d.tags));\n  return out;\n}\nfunction itemRef(s) {   // \"qf_p1#12 st\" → 竹影 #12（斩数版）\n  const m = /^([a-z]{2}_[a-z0-9]+)#(\\d+)( st)?$/.exec(String(s));\n  return m ? itemName(m[1]) + ' #' + m[2] + (m[3] ? '（斩数版）' : '') : String(s);\n}\nconst giftText = g => {\n  const it = g.items || g, out = [];\n  if (g.ink) out.push('墨锭 ' + fmtN(g.ink));\n  for (const [c, n] of Object.entries(it.cases || {})) out.push(caseName(c) + ' ×' + n);\n  if (it.term) out.push('终端机 ×' + it.term);\n  if (it.tags) out.push('改名标签 ×' + it.tags);\n  return out.join('、') || '—';\n};\nconst argText = (k, v) => k === 'c' ? caseName(v) : k === 'i' ? '#' + v : k === 'price' ? '标价 ' + fmtN(v) : k === 'l' ? '单号 ' + String(v).slice(0, 6) : k + ' ' + v;\nfunction detailText(act, raw, withWho) {\n  const d = parse(raw);\n  if (!d) return raw || '';\n  const who = withWho && d.by ? d.by + (d.why ? '：' + d.why : '') + '｜' : '';\n  if (act === 'admin') return who + [...stuff(d), ...(d.give || []).map(x => '发 ' + itemRef(x)), ...(d.take || []).map(x => '收 ' + itemRef(x))].join('，');\n  if (act === 'restore') return who + '找回 ' + (d.items || []).map(x => itemRef(x.k + '#' + x.to + (x.st >= 0 ? ' st' : '')) + (x.to !== x.from ? '（原 #' + x.from + '）' : '')).join('、');\n  if (act === 'admin_ban') return who + (d.days === 'perm' ? '永久封号' : '封 ' + d.days + ' 天');\n  if (act === 'pardon') return who + '解封';\n  if (act === 'admin_pw') return who + (d.created ? '建号，设好密码' : '重设密码，别处的登录都退出了');\n  if (act === 'gift_new') return who + [...stuff(d), d.days + ' 天内有效', d.newToo ? '之后新注册的也能领' : ''].filter(Boolean).join('，');\n  if (act === 'gift_off') return who + '停发 ' + d.id;\n  if (act === 'gift_got') return (d.note || '') + '：' + stuff(d).join('，');\n  if (act === 'code_new') return who + [d.code, ...stuff(d), '最多 ' + fmtN(d.uses) + ' 个号', d.days + ' 天内有效'].join('，');\n  if (act === 'code_off') return who + '停用 ' + d.code;\n  if (act === 'code_got') return d.code + '（' + (d.note || '') + '）：' + stuff(d).join('，');\n  if (act === 'cfg') return who + (d.undo !== undefined ? (d.undo ? '退回到第 ' + d.undo + ' 版' : '全部回到默认值') + '（存成第 ' + d.id + ' 版）'\n    : '第 ' + d.id + ' 版：' + Object.entries(d.set || {}).map(([k, v]) => cfgName(k) + (v === null ? ' 回到默认' : ' → ' + v)).join('，'));\n  if (act === 'flag') return who + d.k + '：' + (FLAG_MODE[d.from] || d.from) + ' → ' + (FLAG_MODE[d.to] || d.to);\n  // 玩家自己的操作：{ a: 参数, r: 结果, s: 这次结了几单 }\n  const parts = [];\n  if (d.r !== undefined && d.r !== '') parts.push(typeof d.r === 'number' ? fmtN(d.r) : itemRef(d.r));\n  if (d.s) parts.push('结了 ' + d.s + ' 单');\n  if (d.b) parts.push('到期退回 ' + d.b + ' 件');\n  if (Array.isArray(d.rm) && d.rm.length) parts.push('出去：' + d.rm.map(itemRef).join('、') + (d.rmN > d.rm.length ? ' 等 ' + d.rmN + ' 件' : ''));\n  if (Array.isArray(d.ad) && d.ad.length && d.ad.join() !== String(d.r)) parts.push('进来：' + d.ad.map(itemRef).join('、') + (d.adN > d.ad.length ? ' 等 ' + d.adN + ' 件' : ''));\n  if (d.a && typeof d.a === 'object') {\n    const a = Object.entries(d.a).filter(([, v]) => v !== '' && v !== null && typeof v !== 'object').map(([k, v]) => argText(k, v)).join(' ');\n    if (a) parts.push(a);\n  }\n  return parts.join(' · ');\n}\nconst inkCell = r => r.ink0 === null || r.ink0 === undefined || r.ink1 === null || r.ink1 === undefined ? ''\n  : r.ink1 === r.ink0 ? fmtN(r.ink1) : H`${fmtN(r.ink0)} → <b class=\"${r.ink1 > r.ink0 ? 'up' : 'down'}\">${fmtN(r.ink1)}</b>`;\nconst target = r => r.uid === '*' ? '全服' : r.username ? H`<button class=\"link\" data-act=\"open\" data-uid=\"${r.uid}\">${r.username}</button>` : H`<span class=\"mono\">${r.uid}</span>`;\n\n/* ---------- 确认框：每一笔修改先给你看要改什么，再写原因 ---------- */\nfunction ask({ title, lines = [], whyInit = '', ok = '确定', danger = false }) {\n  const d = $('#dlg');\n  paint(d, H`<form>\n    <div class=\"dlg-b\"><h3>${title}</h3>${lines.length ? H`<ul>${lines.map(l => H`<li>${l}</li>`)}</ul>` : ''}\n      <label class=\"f\">原因（记进流水，至少 2 个字）<input name=\"why\" maxlength=\"100\" value=\"${whyInit}\" autocomplete=\"off\"></label></div>\n    <div class=\"dlg-f\"><button type=\"button\" class=\"btn ghost\" data-x=\"no\">取消</button><button class=\"btn${danger ? ' danger' : ''}\">${ok}</button></div>\n  </form>`);\n  return new Promise(res => {\n    const f = $('form', d), inp = f.elements.why;\n    const done = v => { d.oncancel = null; if (d.open) d.close(); res(v); };\n    f.addEventListener('submit', e => {\n      e.preventDefault();\n      const why = inp.value.trim();\n      if (why.length < 2) { inp.focus(); inp.placeholder = '要写原因'; return; }\n      done({ why });\n    });\n    $('[data-x=no]', f).addEventListener('click', () => done(null));\n    d.oncancel = e => { e.preventDefault(); done(null); };\n    d.showModal();\n    inp.focus();\n  });\n}\nlet toastT = 0;\nfunction toast(msg, err) {\n  const t = $('#toast');\n  t.textContent = msg;\n  t.className = 'on' + (err ? ' err' : '');\n  clearTimeout(toastT);\n  toastT = setTimeout(() => { t.className = ''; }, err ? 5000 : 2800);\n}\nasync function busy(btn, fn) {\n  if (btn) btn.disabled = true;\n  try { return await fn(); }\n  catch (e) { toast(e.message, true); }\n  finally { if (btn && btn.isConnected) btn.disabled = false; }\n}\nconst numIn = (f, name) => { const el = f.elements[name], v = el ? el.value.trim() : ''; return v === '' ? 0 : Number(v); };\nconst submitBtn = f => $('button:not([type=button])', f);\n\n/* ---------- 总览 ---------- */\nasync function vHome() {\n  const [s, a] = await Promise.all([api('stats'), api('audit')]);\n  const rows = a.rows.slice(0, 8);\n  return H`<div class=\"tiles\">\n      ${tile('注册账号', s.users, '24 小时内新注册 ' + fmtN(s.newToday))}\n      ${tile('有武库存档的', s.accounts, '打开过武库的账号')}\n      ${tile('全服墨锭', s.inkTotal, '所有武库存档加起来')}\n      ${tile('市场在卖', unit(s.open, '单'), '玩家挂出来的')}\n      ${tile('24 小时成交', unit(s.deals24, '单'), '成交额 ' + fmtN(s.dealInk24) + ' 墨锭')}\n      ${tile('封禁中', unit(s.banned, '个号'), '包括永久封号')}\n      ${tile('经济数值', s.cfgId ? '第 ' + s.cfgId + ' 版' : '默认', s.cfgId ? '改过' : '没改过')}\n    </div>\n    <div class=\"card\"><div class=\"row between\"><h2>最近的操作</h2><button class=\"btn ghost sm\" data-act=\"tab\" data-tab=\"audit\">全部记录</button></div>\n      ${rows.length ? H`<div class=\"tw\"><table><thead><tr><th>时间</th><th>谁</th><th>做了什么</th><th>对象</th><th>内容</th></tr></thead><tbody>\n        ${rows.map(r => { const d = parse(r.detail) || {}; return H`<tr><td class=\"nowrap\">${fmtT(r.at)}</td><td>${d.by || '—'}</td><td class=\"nowrap\">${ACT[r.act] || r.act}</td><td>${target(r)}</td><td class=\"detail\">${detailText(r.act, r.detail)}${d.why ? H`<div class=\"hint\">原因：${d.why}</div>` : ''}</td></tr>`; })}\n      </tbody></table></div>` : H`<p class=\"empty\">还没有管理员操作</p>`}\n    </div>\n    <div class=\"card\"><h2>常用</h2><div class=\"row wrap\">\n      <button class=\"btn ghost\" data-act=\"tab\" data-tab=\"players\">找玩家、加减墨锭</button>\n      <button class=\"btn ghost\" data-act=\"tab\" data-tab=\"gifts\">发全服补偿</button>\n      <button class=\"btn ghost\" data-act=\"tab\" data-tab=\"codes\">建兑换码</button>\n      <button class=\"btn ghost\" data-act=\"tab\" data-tab=\"cfg\">改价格、爆率</button>\n    </div></div>`;\n}\n\n/* ---------- 玩家：搜索 ---------- */\nasync function vPlayers() {\n  if (S.uid) return vPlayer();\n  const r = await api('find?q=' + encodeURIComponent(S.q));\n  return H`<div class=\"card\">\n    <h2>玩家</h2>\n    <form class=\"search\" data-form=\"find\"><input name=\"q\" value=\"${S.q}\" placeholder=\"昵称开头，或者账号编号（u_ 开头）\" autocomplete=\"off\" spellcheck=\"false\" aria-label=\"搜索玩家\"><button class=\"btn\">搜索</button></form>\n    <p class=\"hint\">${S.q ? '“' + S.q + '” 的结果（最多 20 个）' : '最近动过武库的 20 个账号'}</p>\n    ${r.users.length ? H`<div class=\"tw\"><table><thead><tr><th>昵称</th><th class=\"num\">墨锭</th><th>上次动武库</th><th>注册</th></tr></thead><tbody>\n      ${r.users.map(u => H`<tr><td><button class=\"link\" data-act=\"open\" data-uid=\"${u.id}\">${u.username}</button><div class=\"hint mono\">${u.id}</div></td>\n        <td class=\"num\">${u.ink === null || u.ink === undefined ? '—' : fmtN(u.ink)}</td><td class=\"nowrap\">${ago(u.updated_at)}</td><td class=\"nowrap\">${fmtT(u.created_at)}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">没找到这个昵称</p>`}\n  </div>${S.q.toLowerCase() === 'dev' && !r.users.some(u => String(u.username).toLowerCase() === 'dev') ? devCard() : ''}`;\n}\nfunction devCard() {   // 云端还没有 Dev：只能在这里建，别人注册不了\n  return H`<form class=\"card\" data-form=\"mkdev\" novalidate>\n    <h2>建 Dev 账号</h2>\n    <p class=\"hint\">云端还没有 Dev。Dev 是开发组的市场账号，库存不受限，只能在这里建。填一个密码（至少 12 位），或者点「随机生成」。</p>\n    <div class=\"row wrap\"><label class=\"f grow\">密码<input name=\"pw\" type=\"text\" maxlength=\"128\" autocomplete=\"off\" spellcheck=\"false\"></label>\n      <button type=\"button\" class=\"btn ghost\" data-act=\"genpw\" style=\"margin-top:18px\">随机生成</button>\n      <button class=\"btn\" style=\"margin-top:18px\">建号…</button></div>\n  </form>`;\n}\n\n/* ---------- 玩家：一个号的详情、加减、封号、流水 ---------- */\nfunction itemOptions() {\n  return H`<option value=\"\">选一件饰品…</option>${CAT.caseIds.map(c => H`<optgroup label=\"${caseName(c)}\">${CAT.order\n    .flatMap(t => Object.values(CAT.items).filter(x => x.col === c && x.tier === t))\n    .map(x => H`<option value=\"${x.k}\">${itemName(x.k)} · ${heroOf(x.k)} · ${CAT.tiers[x.tier].n}</option>`)}</optgroup>`)}`;\n}\nasync function vPlayer() {\n  const p = S.p = await api('econ?uid=' + encodeURIComponent(S.uid));\n  S.give = [];\n  const e = p.econ, s = (e && e.state) || {}, now = Date.now();\n  const inv = Array.isArray(s.inv) ? s.inv : [], lst = Array.isArray(s.lst) ? s.lst : [], cases = s.cases || {};\n  const worn = new Set(Object.values(s.eq || {})), sc = p.sanction || {}, isBan = !!(sc.perm || sc.banUntil > now);\n  const nCases = CAT.caseIds.reduce((a, c) => a + (+cases[c] || 0), 0), pr = p.profile || {};\n  return H`<div class=\"crumbs\"><button class=\"btn ghost sm\" data-act=\"back\">← 玩家列表</button></div>\n  <div class=\"card head\">\n    <div class=\"who\"><h2>${p.username}</h2>${isBan ? H`<span class=\"badge bad\">${sc.perm ? '永久封禁' : '封禁中'}</span>` : ''}</div>\n    <div class=\"meta\"><span class=\"mono\">${p.uid}</span><button class=\"btn ghost sm\" data-act=\"copy\" data-v=\"${p.uid}\">复制编号</button>\n      <span>注册于 ${fmtT(p.createdAt)}</span><span>上次动武库：${e ? ago(e.at) : '还没打开过'}</span></div>\n    <div class=\"tiles sm\">\n      ${tile('墨锭', e ? e.ink : 0)}${tile('饰品', unit(inv.length, '件'))}${tile('在卖', unit(lst.length, '单'))}${tile('武器箱', unit(nCases, '个'))}\n      ${tile('终端机', unit(+s.term || 0, '台'))}${tile('改名标签', unit(+s.tags || 0, '张'))}${tile('段位分', pr.rating === undefined ? '—' : pr.rating)}${tile('联机', H`${pr.netWins || 0}<small>胜</small> ${pr.netLosses || 0}<small>负</small>`)}\n    </div>\n    ${e ? '' : H`<p class=\"hint\" style=\"margin-top:10px\">这个号还没打开过武库：第一次调整时会先按它的存档建好武库，再加减。</p>`}\n  </div>\n  <form data-form=\"adjust\" novalidate>\n    <div class=\"card\">\n      <h2>加减</h2>\n      <p class=\"hint\">正数是加，负数是扣，空着就是不动。墨锭一次最多 ±1,000,000；武器箱、终端机、改名标签一次最多 ±1,000。扣不成负数。</p>\n      <div class=\"grid\">\n        <label class=\"f\">墨锭<span class=\"cur\">现有 ${fmtN(e ? e.ink : 0)}</span><input type=\"number\" name=\"ink\" step=\"1\" placeholder=\"0\"></label>\n        ${CAT.caseIds.map(c => H`<label class=\"f\">${caseName(c)}<span class=\"cur\">现有 ${+cases[c] || 0}</span><input type=\"number\" name=\"case_${c}\" step=\"1\" placeholder=\"0\"></label>`)}\n        <label class=\"f\">终端机<span class=\"cur\">现有 ${+s.term || 0}</span><input type=\"number\" name=\"term\" step=\"1\" placeholder=\"0\"></label>\n        <label class=\"f\">改名标签<span class=\"cur\">现有 ${+s.tags || 0}</span><input type=\"number\" name=\"tags\" step=\"1\" placeholder=\"0\"></label>\n      </div>\n      <h3>发饰品</h3>\n      <div class=\"giverow\">\n        <select name=\"gk\" aria-label=\"选一件饰品\">${itemOptions()}</select>\n        <label class=\"chk\"><input type=\"checkbox\" name=\"gst\"> 斩数版</label>\n        <input type=\"number\" name=\"gstn\" min=\"0\" step=\"1\" value=\"0\" aria-label=\"斩数（记了多少次击倒）\">\n        <button type=\"button\" class=\"btn ghost\" data-act=\"addgive\">加进清单</button>\n      </div>\n      <div id=\"gives\" class=\"chips\"></div>\n      <p class=\"hint\">要收走饰品，在下面的库存里勾上。挂在市场上的收不了。</p>\n      <div class=\"row end\"><button class=\"btn\">检查并提交…</button></div>\n    </div>\n    <div class=\"card\">\n      <h2>库存 <small>${inv.length} 件</small></h2>\n      ${inv.length ? H`<div class=\"tw\"><table><thead><tr><th>收走</th><th>编号</th><th>饰品</th><th>品质</th><th>武器箱</th><th>来源</th><th>拿到</th></tr></thead><tbody>\n        ${inv.slice().sort((a, b) => b.i - a.i).map(it => { const d = CAT.items[it.k] || {}; return H`<tr>\n          <td><input type=\"checkbox\" name=\"take\" value=\"${it.i}\" aria-label=\"收走第 ${it.i} 号\"></td><td class=\"mono\">#${it.i}</td>\n          <td>${itemTag(it.k, it.st)}${worn.has(it.i) ? H` <span class=\"badge ok\">穿着</span>` : ''}${it.n ? H`<div class=\"hint\">改了名：${it.n}</div>` : ''}</td>\n          <td>${tierTag(d.tier)}</td><td class=\"nowrap\">${caseName(d.col)}</td><td class=\"nowrap\">${SRC[it.src] || it.src || '—'}</td><td class=\"nowrap\">${fmtT(it.t)}</td></tr>`; })}\n      </tbody></table></div>` : H`<p class=\"empty\">库存是空的</p>`}\n      ${lst.length ? H`<h3>挂在玩家市场上的 <small>要等玩家撤下或者卖掉</small></h3><div class=\"tw\"><table><thead><tr><th>编号</th><th>饰品</th><th>品质</th><th class=\"num\">标价</th></tr></thead><tbody>\n        ${lst.map(L => H`<tr><td class=\"mono\">#${L.it.i}</td><td>${itemTag(L.it.k, L.it.st)}</td><td>${tierTag((CAT.items[L.it.k] || {}).tier)}</td><td class=\"num\">${fmtN(L.price)}</td></tr>`)}\n      </tbody></table></div>` : ''}\n    </div>\n  </form>\n  ${lostCard(p)}\n  ${banCard(sc, isBan)}\n  ${pwCard(p)}\n  ${logCard(p.log || [])}\n  ${mktCard(p)}`;\n}\n// 找回饰品：按流水查这个号拿到过、现在没有的饰品。正常没的（汰换、一键卖掉、市场卖掉）只列出来，去向不明和管理员收走的可以勾上找回\nconst LOST_TEXT = { trade: '汰换掉了', sellDupes: '一键卖掉了重复的', sold: '在玩家市场卖掉了', admin: '管理员收走了', odd: '在这一步里不见了', unknown: '去向不明（流水里没记）', restored: '已经找回过了' };\nfunction lostCard(p) {\n  const L = S.lost && S.lost.uid === p.uid ? S.lost.items : null;\n  if (!L) return H`<div class=\"card\"><div class=\"row between wrap\"><h2>找回饰品</h2><button type=\"button\" class=\"btn ghost\" data-act=\"lost\">查一查丢了什么</button></div>\n    <p class=\"hint\">按这个号的流水，列出拿到过、现在库存和挂单里都没有的饰品，写明是哪一步没的。去向不明的、管理员收走的可以找回，每件只能找回一次。</p></div>`;\n  const can = L.filter(x => x.can);\n  return H`<form class=\"card\" data-form=\"restore\" novalidate><div class=\"row between wrap\"><h2>找回饰品 <small>${L.length} 件不在了，${can.length} 件能找回</small></h2><button type=\"button\" class=\"btn ghost sm\" data-act=\"lost\">重新查</button></div>\n    ${L.length ? H`<div class=\"tw\"><table><thead><tr><th>找回</th><th>编号</th><th>饰品</th><th>拿到</th><th>没了</th><th>去向</th></tr></thead><tbody>\n      ${L.map(x => H`<tr class=\"${x.can ? '' : 'mute'}\"><td>${x.can ? H`<input type=\"checkbox\" name=\"restore\" value=\"${x.i}\" aria-label=\"找回第 ${x.i} 号\">` : ''}</td><td class=\"mono\">#${x.i}</td><td>${itemTag(x.k, x.st)}</td>\n        <td class=\"nowrap\">${x.got ? fmtT(x.got.at) + ' ' + (ACT[x.got.act] || x.got.act) : '—'}</td><td class=\"nowrap\">${x.gone ? fmtT(x.gone.at) + ' ' + (ACT[x.gone.act] || x.gone.act) : '—'}</td>\n        <td>${x.why === 'restored' ? H`<span class=\"badge ok\">${LOST_TEXT.restored}</span>` : x.can ? H`<span class=\"badge bad\">${LOST_TEXT[x.why]}</span>` : LOST_TEXT[x.why] || x.why}</td></tr>`)}\n    </tbody></table></div>\n    ${can.length ? H`<div class=\"row end\"><button class=\"btn\">找回勾上的…</button></div>` : ''}` : H`<p class=\"empty\">流水里拿到过的饰品都还在</p>`}\n  </form>`;\n}\nfunction banCard(sc, isBan) {\n  return H`<form class=\"card\" data-form=\"ban\" novalidate>\n    <h2>封号</h2>\n    ${isBan ? H`<p>${sc.perm ? '永久封禁。' : '封禁中，到 ' + fmtT(sc.banUntil) + '。'}</p><div class=\"row\"><button type=\"button\" class=\"btn\" data-act=\"pardon\">解封…</button></div>`\n      : H`<div class=\"row wrap\"><label class=\"f w120\">封几天<input type=\"number\" name=\"days\" min=\"1\" max=\"3650\" step=\"1\" value=\"1\"></label>\n        <label class=\"chk\" style=\"margin-top:18px\"><input type=\"checkbox\" name=\"perm\"> 永久封号</label>\n        <button class=\"btn danger\" style=\"margin-top:18px\">封号…</button></div>`}\n    <p class=\"hint\" style=\"margin-top:10px\">反作弊记过 ${sc.strikes || 0} 次${sc.pardon ? '，上次解封在 ' + fmtT(sc.pardon) : ''}。封禁期间不能同步存档、不能交易；解封后玩家刷新网页就好了。</p>\n    ${(sc.log || []).length ? H`<div class=\"tw\"><table><thead><tr><th>时间</th><th>原因</th><th>来源</th></tr></thead><tbody>\n      ${sc.log.slice().reverse().map(x => H`<tr><td class=\"nowrap\">${fmtT(x.at)}</td><td>${x.r}</td><td class=\"nowrap\">${String(x.src || '').replace(/^admin:/, '管理员 ').replace(/^client$/, '网页检测').replace(/^server$/, '服务器检测')}</td></tr>`)}\n    </tbody></table></div>` : ''}\n  </form>`;\n}\nfunction pwCard(p) {\n  const dev = String(p.username || '').toLowerCase() === 'dev';\n  return H`<form class=\"card\" data-form=\"pw\" novalidate>\n    <h2>重设密码</h2>\n    <p class=\"hint\">${dev ? 'Dev 是开发组的市场账号，它的密码只能在这里改。' : ''}填一个新密码（至少 12 位），或者点「随机生成」。重设以后，这个号在所有设备上的登录都会退出，要用新密码重新登录。</p>\n    <div class=\"row wrap\"><label class=\"f grow\">新密码<input id=\"newpw\" name=\"pw\" type=\"text\" maxlength=\"128\" autocomplete=\"off\" spellcheck=\"false\"></label>\n      <button type=\"button\" class=\"btn ghost\" data-act=\"genpw\" style=\"margin-top:18px\">随机生成</button>\n      <button class=\"btn danger\" style=\"margin-top:18px\">重设密码…</button></div>\n  </form>`;\n}\nfunction logCard(log) {\n  return H`<div class=\"card\"><h2>流水 <small>最近 ${log.length} 条</small></h2>\n    ${log.length ? H`<div class=\"tw\"><table><thead><tr><th>时间</th><th>操作</th><th class=\"num\">墨锭</th><th>详情</th></tr></thead><tbody>\n      ${log.map(r => H`<tr class=\"${r.ok ? '' : 'fail'}\"><td class=\"nowrap\">${fmtT(r.at)}</td><td class=\"nowrap\">${ACT[r.act] || r.act}${r.ok ? '' : H` <span class=\"badge bad\">没成</span>`}</td>\n        <td class=\"num\">${inkCell(r)}</td><td class=\"detail\">${detailText(r.act, r.detail, true)}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">还没有流水</p>`}</div>`;\n}\nfunction mktCard(p) {\n  const rows = p.mkt || [];\n  if (!rows.length) return '';\n  const stText = r => r.state === 0 ? '在卖' : r.state === 2 ? '撤下了' : r.seller === p.uid ? (r.paid ? '卖掉了，已到账' : '卖掉了，下次动武库时到账') : '买到了';\n  return H`<div class=\"card\"><h2>玩家市场 <small>最近 ${rows.length} 单</small></h2><div class=\"tw\"><table>\n    <thead><tr><th>时间</th><th>买还是卖</th><th>饰品</th><th class=\"num\">价格</th><th>状态</th></tr></thead><tbody>\n    ${rows.map(r => H`<tr><td class=\"nowrap\">${fmtT(r.done_at || r.at)}</td><td>${r.seller === p.uid ? '卖' : '买'}</td><td>${itemTag(r.k, r.st)}</td><td class=\"num\">${fmtN(r.price)}</td><td class=\"nowrap\">${stText(r)}</td></tr>`)}\n  </tbody></table></div></div>`;\n}\nfunction drawGives() {\n  const el = $('#gives');\n  if (el) paint(el, S.give.map((g, i) => H`<span class=\"chip\">${itemName(g.k)}（${heroOf(g.k)}）${g.st >= 0 ? ' 斩数 ' + g.st : ''}<button type=\"button\" data-act=\"delgive\" data-i=\"${i}\" aria-label=\"去掉\">×</button></span>`));\n}\n\n/* ---------- 补偿 ---------- */\nasync function vGifts() {\n  const r = await api('gifts');\n  S.gifts = r.gifts;\n  const now = Date.now();\n  const state = g => g.off ? H`<span class=\"badge\">停发了</span>` : g.until <= now ? H`<span class=\"badge\">过期了</span>` : H`<span class=\"badge ok\">发放中</span>`;\n  return H`<form class=\"card\" data-form=\"gift\" novalidate>\n    <h2>发补偿</h2>\n    <p class=\"hint\">玩家下次登录或者打开武库时自动领到，每个账号只领一次；游戏里会弹出「开发组补偿：说明（内容）」。</p>\n    <div class=\"grid\">\n      <label class=\"f\">发给<select name=\"to\"><option value=\"all\">所有人</option><option value=\"one\">一个账号</option></select></label>\n      <label class=\"f hidden\" data-one>昵称或账号编号<input name=\"user\" autocomplete=\"off\" spellcheck=\"false\"></label>\n      <label class=\"f\">墨锭<input type=\"number\" name=\"ink\" min=\"0\" max=\"1000000\" step=\"1\" placeholder=\"0\"></label>\n      ${CAT.caseIds.map(c => H`<label class=\"f\">${caseName(c)}<input type=\"number\" name=\"gc_${c}\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>`)}\n      <label class=\"f\">终端机<input type=\"number\" name=\"term\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>\n      <label class=\"f\">改名标签<input type=\"number\" name=\"tags\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>\n      <label class=\"f\">几天内能领<input type=\"number\" name=\"days\" min=\"1\" max=\"90\" step=\"1\" value=\"14\"></label>\n    </div>\n    <label class=\"f\" style=\"margin-top:8px\">给玩家看的说明（2～60 个字）<input name=\"note\" maxlength=\"60\" placeholder=\"比如：服务器维护补偿\"></label>\n    <label class=\"chk\" style=\"margin-top:10px\" data-all><input type=\"checkbox\" name=\"newToo\"> 之后新注册的账号也能领（不勾就只发给现在已经注册的，免得有人开小号来领）</label>\n    <div class=\"row end\"><button class=\"btn\">检查并发出…</button></div>\n  </form>\n  <div class=\"card\"><h2>发过的补偿 <small>最近 50 份</small></h2>\n    ${r.gifts.length ? H`<div class=\"tw\"><table><thead><tr><th>说明</th><th>发给</th><th>内容</th><th class=\"num\">领了</th><th>谁发的</th><th>发出</th><th>截止</th><th>状态</th><th></th></tr></thead><tbody>\n      ${r.gifts.map(g => H`<tr><td class=\"mw\">${g.note}</td><td class=\"nowrap\">${g.uid === '*' ? (g.born > g.at ? '所有人（含新号）' : '所有人') : (g.username || g.uid)}</td><td class=\"mw\">${giftText(g)}</td>\n        <td class=\"num\">${fmtN(g.got)}</td><td>${g.by}</td><td class=\"nowrap\">${fmtT(g.at)}</td><td class=\"nowrap\">${fmtT(g.until)}</td><td>${state(g)}</td>\n        <td>${!g.off && g.until > now ? H`<button class=\"btn ghost sm\" data-act=\"giftoff\" data-id=\"${g.id}\">停发…</button>` : ''}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">还没发过补偿</p>`}\n  </div>`;\n}\n\n/* ---------- 兑换码 ---------- */\nasync function vCodes() {\n  const r = await api('codes');\n  S.codes = r.codes;\n  const now = Date.now();\n  const state = c => c.off ? H`<span class=\"badge\">停用了</span>` : c.until <= now ? H`<span class=\"badge\">过期了</span>` : c.got >= c.uses ? H`<span class=\"badge\">领完了</span>` : H`<span class=\"badge ok\">能领</span>`;\n  return H`<form class=\"card\" data-form=\"code\" novalidate>\n    <h2>建兑换码</h2>\n    <p class=\"hint\">玩家在游戏的「任务 → 礼包兑换」里输入就能领，要登录云端账号，每个号只领一次。码只存在服务器上，不在代码里。公开发出去的码，看到的人都能领，领满人数就停；只想给少数人的，用随机生成的码。</p>\n    <div class=\"grid\">\n      <label class=\"f\">兑换码（不填就随机生成）<input name=\"code\" maxlength=\"20\" placeholder=\"比如 SPRING2026\" autocomplete=\"off\" spellcheck=\"false\"></label>\n      <label class=\"f\">墨锭<input type=\"number\" name=\"ink\" min=\"0\" max=\"1000000\" step=\"1\" placeholder=\"0\"></label>\n      ${CAT.caseIds.map(c => H`<label class=\"f\">${caseName(c)}<input type=\"number\" name=\"cc_${c}\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>`)}\n      <label class=\"f\">终端机<input type=\"number\" name=\"term\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>\n      <label class=\"f\">改名标签<input type=\"number\" name=\"tags\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"0\"></label>\n      <label class=\"f\">最多几个号能领<input type=\"number\" name=\"uses\" min=\"1\" max=\"100000\" step=\"1\" value=\"100\"></label>\n      <label class=\"f\">几天内能领<input type=\"number\" name=\"days\" min=\"1\" max=\"90\" step=\"1\" value=\"14\"></label>\n    </div>\n    <label class=\"f\" style=\"margin-top:8px\">给玩家看的说明（2～60 个字）<input name=\"note\" maxlength=\"60\" placeholder=\"比如：新春礼包\"></label>\n    <div class=\"row end\"><button class=\"btn\">检查并建码…</button></div>\n  </form>\n  <div class=\"card\"><h2>建过的兑换码 <small>最近 50 个</small></h2>\n    ${r.codes.length ? H`<div class=\"tw\"><table><thead><tr><th>兑换码</th><th>说明</th><th>内容</th><th class=\"num\">领了 / 最多</th><th>谁建的</th><th>建于</th><th>截止</th><th>状态</th><th></th></tr></thead><tbody>\n      ${r.codes.map(c => H`<tr><td class=\"mono nowrap\">${c.code}</td><td class=\"mw\">${c.note}</td><td class=\"mw\">${giftText(c)}</td>\n        <td class=\"num nowrap\">${fmtN(c.got)} / ${fmtN(c.uses)}</td><td>${c.by}</td><td class=\"nowrap\">${fmtT(c.at)}</td><td class=\"nowrap\">${fmtT(c.until)}</td><td>${state(c)}</td>\n        <td>${!c.off && c.until > now ? H`<button class=\"btn ghost sm\" data-act=\"codeoff\" data-code=\"${c.code}\">停用…</button>` : ''}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">还没建过兑换码</p>`}\n  </div>`;\n}\n\n/* ---------- 经济数值 ---------- */\nconst ODDS_RE = /^(odds|prem|zod)\\./;   // 几组爆率：普通、神兵、星座武器箱，各自加起来要是 1\nconst isPct = k => ODDS_RE.test(k) || ['stP', 'dropP', 'fee'].includes(k);\nasync function vCfg() {\n  const r = S.cfg = await api('cfg');\n  const groups = [];\n  for (const [k, def, lo, hi, isInt, g, desc] of r.info) {\n    let grp = groups.find(x => x.name === g);\n    if (!grp) groups.push(grp = { name: g, rows: [] });\n    grp.rows.push({ k, def, lo, hi, isInt, desc, cur: Object.prototype.hasOwnProperty.call(r.cfg, k) ? r.cfg[k] : def });\n  }\n  const sumKey = grp => grp.rows.every(x => ODDS_RE.test(x.k)) ? grp.rows[0].k.split('.')[0] : '';\n  return H`<form class=\"card\" data-form=\"cfg\" novalidate>\n    <div class=\"row between wrap\"><h2>经济数值</h2><span class=\"badge${r.id ? ' gold' : ''}\">${r.id ? '现在用的是第 ' + r.id + ' 版' : '现在用的是默认数值'}</span></div>\n    <p class=\"hint\">保存后半分钟内全服生效，玩家的武库下一次操作后显示新数值。这里只有经济数值，伤害、血量、技能这些在代码里改。</p>\n    ${groups.map(g => { const sk = sumKey(g); return H`<fieldset class=\"grp\"><legend>${g.name}</legend>\n      ${g.rows.map(x => H`<div class=\"cfgrow${x.cur !== x.def ? ' mod' : ''}\" data-row=\"${x.k}\">\n        <label for=\"cfg_${x.k}\">${x.desc}${x.cur !== x.def ? H` <span class=\"badge gold\">改过</span>` : ''}</label>\n        <div class=\"cfgin\"><input id=\"cfg_${x.k}\" name=\"${x.k}\" type=\"number\" inputmode=\"${x.isInt ? 'numeric' : 'decimal'}\" step=\"${x.isInt ? 1 : 'any'}\" min=\"${x.lo}\" max=\"${x.hi}\" value=\"${x.cur}\"><span class=\"pct\" data-pct=\"${x.k}\"></span></div>\n        <span class=\"hint\">默认 ${x.def}，范围 ${x.lo}～${x.hi}</span>\n        <button type=\"button\" class=\"btn ghost sm\" data-act=\"cfgdef\" data-k=\"${x.k}\">用默认</button>\n      </div>`)}\n      ${sk ? H`<div class=\"sum\" data-sum=\"${sk}\"></div>` : ''}\n    </fieldset>`; })}\n    <div class=\"row end\"><span class=\"hint\" id=\"cfgDirty\"></span><button class=\"btn\" id=\"cfgSave\" disabled>检查并保存…</button></div>\n  </form>\n  ${histCard(r)}`;\n}\nfunction histCard(r) {\n  const diff = c => Object.entries(c).map(([k, v]) => cfgName(k) + ' ' + v).join('，') || '全是默认值';\n  return H`<div class=\"card\"><div class=\"row between wrap\"><h2>改过的版本 <small>最近 30 版</small></h2>${Object.keys(r.cfg).length ? H`<button class=\"btn ghost sm\" data-act=\"cfgundo\" data-to=\"0\">全部回到默认值…</button>` : ''}</div>\n    ${r.hist.length ? H`<div class=\"tw\"><table><thead><tr><th>版本</th><th>谁</th><th>时间</th><th>原因</th><th>和默认值不一样的</th><th></th></tr></thead><tbody>\n      ${r.hist.map(h => H`<tr><td class=\"nowrap\">第 ${h.id} 版${h.id === r.id ? H` <span class=\"badge gold\">现在用的</span>` : ''}</td><td>${h.by}</td><td class=\"nowrap\">${fmtT(h.at)}</td><td>${h.note}</td><td class=\"detail\">${diff(h.cfg)}</td>\n        <td>${h.id === r.id ? '' : H`<button class=\"btn ghost sm\" data-act=\"cfgundo\" data-to=\"${h.id}\">退回到这一版…</button>`}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">还没改过，用的都是默认值</p>`}\n  </div>`;\n}\nfunction cfgLive(f) {\n  const { info, cfg: cur } = S.cfg, sums = {};\n  let dirty = 0;\n  for (const [k, def] of info) {\n    const inp = f.elements[k];\n    if (!inp) continue;\n    const v = inp.value.trim() === '' ? def : Number(inp.value), was = Object.prototype.hasOwnProperty.call(cur, k) ? cur[k] : def;\n    const row = f.querySelector('[data-row=\"' + k + '\"]'), pe = f.querySelector('[data-pct=\"' + k + '\"]');\n    if (v !== was) dirty++;\n    row.classList.toggle('dirty', v !== was);\n    $('[data-act=cfgdef]', row).disabled = v === def;\n    if (pe) pe.textContent = isPct(k) && Number.isFinite(v) ? '= ' + +(v * 100).toFixed(2) + '%' : /^term\\.(lo|hi)$/.test(k) ? '× 基准价' : '';\n    const g = k.split('.')[0];\n    if (ODDS_RE.test(k)) sums[g] = (sums[g] || 0) + v;\n  }\n  for (const [g, s] of Object.entries(sums)) {\n    const el = f.querySelector('[data-sum=\"' + g + '\"]'), good = Math.abs(s - 1) <= 1e-6;\n    el.className = 'sum ' + (good ? 'ok' : 'bad');\n    el.textContent = '几档加起来是 ' + (Number.isFinite(s) ? +s.toFixed(6) : '?') + (good ? '，正好是 1' : '，要正好是 1 才能保存');\n  }\n  $('#cfgDirty').textContent = dirty ? '改了 ' + dirty + ' 项，还没保存' : '还没有改动';\n  $('#cfgSave').disabled = !dirty;\n}\n\n/* ---------- 操作记录 ---------- */\nasync function vAudit() {\n  const r = await api('audit');\n  return H`<div class=\"card\"><h2>操作记录 <small>最近 100 条</small></h2>\n    <p class=\"hint\">管理员做过的事：加减、封号、解封、发补偿、停发、改经济数值。每个号自己的流水在「玩家」里。</p>\n    ${r.rows.length ? H`<div class=\"tw\"><table><thead><tr><th>时间</th><th>谁</th><th>做了什么</th><th>对象</th><th class=\"num\">墨锭</th><th>内容</th><th>原因</th></tr></thead><tbody>\n      ${r.rows.map(row => { const d = parse(row.detail) || {}; return H`<tr><td class=\"nowrap\">${fmtT(row.at)}</td><td>${d.by || '—'}</td><td class=\"nowrap\">${ACT[row.act] || row.act}</td>\n        <td>${target(row)}</td><td class=\"num\">${inkCell(row)}</td><td class=\"detail\">${detailText(row.act, row.detail)}</td><td>${d.why || ''}</td></tr>`; })}\n    </tbody></table></div>` : H`<p class=\"empty\">还没有管理员操作</p>`}\n  </div>`;\n}\n\n/* ---------- 错误 ---------- */\nconst ERR_KIND = { client: '网页', server: '服务器', slow: '慢请求' };\nasync function vErrors() {\n  const kind = S.errKind || '';\n  const r = await api('errors' + (kind ? '?kind=' + encodeURIComponent(kind) : ''));\n  return H`<div class=\"card\"><div class=\"row between wrap\"><h2>错误 <small>最近 ${r.days} 天，同一种错合成一行</small></h2>\n    <div class=\"row\">${[['', '全部'], ...Object.entries(ERR_KIND)].map(([k, n]) => H`<button class=\"btn ghost sm\" data-act=\"errkind\" data-k=\"${k}\" aria-pressed=\"${String(k === kind)}\">${n}</button> `)}</div></div>\n    <p class=\"hint\">网页里没接住的错、服务器自己出的错、超过 1 秒的慢请求都记在这里（网址参数、邮箱、长串号码都已经去掉，不带账号）。点错误那一格看调用栈。\n      玩家报“服务器内部错误（编号 xxxx）”时，在「当时」那一列找 rid=xxxx。</p>\n    ${r.rows.length ? H`<div class=\"tw\"><table><thead><tr><th>最近一次</th><th>来源</th><th class=\"num\">次数</th><th class=\"num\">耗时</th><th>错误</th><th>位置</th><th>当时</th><th>第一次</th></tr></thead><tbody>\n      ${r.rows.map(e => { const m = parse(e.meta) || {}; return H`<tr><td class=\"nowrap\">${fmtT(e.last_at)}</td><td class=\"nowrap\">${ERR_KIND[e.kind] || e.kind}</td><td class=\"num\">${e.n}</td>\n        <td class=\"num\">${e.ms ? H`最慢 ${e.ms}ms<br><small>平均 ${Math.round(e.ms_sum / e.n)}ms</small>` : '—'}</td><td class=\"err\"><details><summary>${e.msg}</summary><pre>${e.stack || '（没有调用栈）'}</pre></details></td><td class=\"mono\">${e.src || '—'}</td>\n        <td class=\"detail\">${Object.entries(m).map(([k, v]) => k + '=' + v).join(' · ')}</td><td class=\"nowrap\">${fmtT(e.first_at)}</td></tr>`; })}\n    </tbody></table></div>` : H`<p class=\"empty\">这段时间没有错误</p>`}\n  </div>`;\n}\n\n/* ---------- 换页 ---------- */\n/* ---------- 功能开关 ---------- */\nasync function vFlags() {\n  const r = await api('flags');\n  S.flags = r.flags;\n  return H`<div class=\"card\"><h2>功能开关</h2>\n    <p class=\"hint\">大改动先做成开关：可以先只对 Dev 账号打开试，没问题再对所有人开，出了问题一键关回去。改完 30 秒内各处生效；网页那边的开关要玩家刷新网页才换。</p>\n    ${r.flags.length ? H`<div class=\"tw\"><table><thead><tr><th>开关</th><th>说明</th><th>现在</th><th>默认</th><th>最后改动</th><th></th></tr></thead><tbody>\n      ${r.flags.map(f => H`<tr><td class=\"mono nowrap\">${f.k}${f.client ? H` <span class=\"badge\">网页</span>` : ''}</td><td class=\"mw\">${f.desc}</td>\n        <td class=\"nowrap\"><span class=\"badge${f.mode === 'all' ? ' ok' : f.mode === 'dev' ? ' gold' : ''}\">${FLAG_MODE[f.mode]}</span></td><td class=\"nowrap\">${FLAG_MODE[f.def]}</td>\n        <td class=\"mw\">${f.at ? H`${f.by} · ${fmtT(f.at)}<br><small>${f.note}</small>` : '没改过'}</td>\n        <td class=\"nowrap\">${['off', 'dev', 'all'].filter(m => m !== f.mode).map(m => H`<button class=\"btn ghost sm\" data-act=\"flagset\" data-k=\"${f.k}\" data-mode=\"${m}\">改成${FLAG_MODE[m]}…</button> `)}</td></tr>`)}\n    </tbody></table></div>` : H`<p class=\"empty\">现在没有登记的开关</p>`}\n  </div>`;\n}\n\nconst VIEWS = { home: vHome, players: vPlayers, gifts: vGifts, codes: vCodes, cfg: vCfg, flags: vFlags, audit: vAudit, errors: vErrors };\nconst AFTER = { players: drawGives, cfg: () => { const f = $('form[data-form=cfg]'); if (f) cfgLive(f); } };\nasync function render() {\n  const main = $('#main'), seq = ++S.seq, tab = S.tab;\n  paint(main, H`<p class=\"loading\">读取中…</p>`);\n  try {\n    const view = await VIEWS[tab]();\n    if (seq !== S.seq) return;   // 读的时候又换了页：不画旧的\n    paint(main, view);\n    if (AFTER[tab]) AFTER[tab]();\n  } catch (e) {\n    if (seq === S.seq && S.who) paint(main, H`<div class=\"card err\"><span>${e.message}</span><button class=\"btn ghost sm\" data-act=\"reload\">再试一次</button></div>`);\n  }\n}\nfunction route() {\n  const m = location.hash.slice(1).split('/');\n  S.tab = VIEWS[m[0]] ? m[0] : 'home';\n  let uid = '';\n  try { uid = S.tab === 'players' && m[1] ? decodeURIComponent(m[1]) : ''; } catch (e) {}\n  if (uid !== S.uid) window.scrollTo(0, 0);\n  S.uid = uid;\n  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));\n  render();\n}\nfunction go(tab, uid) {\n  const h = '#' + tab + (uid ? '/' + encodeURIComponent(uid) : '');\n  if (location.hash === h) route(); else location.hash = h;\n}\nwindow.addEventListener('hashchange', () => { if (S.who) route(); });\n\n/* ---------- 按钮 ---------- */\nconst ACTS = {\n  tab: b => go(b.dataset.tab),\n  open: b => go('players', b.dataset.uid),\n  back: () => go('players'),\n  reload: () => render(),\n  errkind: b => { S.errKind = b.dataset.k; render(); },\n  logout: () => logout(),\n  copy: b => { if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.v).then(() => toast('复制好了'), () => toast('复制不了，手动选一下吧', true)); },\n  addgive: () => {\n    const f = $('form[data-form=adjust]'), k = f.elements.gk.value;\n    if (!k) return toast('先选一件饰品', true);\n    if (S.give.length >= 50) return toast('一次最多发 50 件', true);\n    const n = Number(f.elements.gstn.value || 0);\n    if (f.elements.gst.checked && !(Number.isInteger(n) && n >= 0 && n <= 1e7)) return toast('斩数要填 0 到 10000000 的整数', true);\n    S.give.push({ k, st: f.elements.gst.checked ? n : -1 });\n    drawGives();\n  },\n  delgive: b => { S.give.splice(+b.dataset.i, 1); drawGives(); },\n  lost: b => busy(b, async () => { const r = await api('lost?uid=' + encodeURIComponent(S.p.uid)); S.lost = { uid: S.p.uid, items: r.items }; render(); }),\n  genpw: b => {   // 15 个随机字节 → 20 位，只用字母、数字、- 和 _\n    const a = new Uint8Array(15);\n    crypto.getRandomValues(a);\n    const el = b.form.elements.pw;\n    el.value = btoa(String.fromCharCode(...a)).replace(/\\+/g, '-').replace(/\\//g, '_');\n    el.select();\n  },\n  pardon: async b => {\n    const p = S.p, a = await ask({ title: '解封 ' + p.username, lines: ['清空处罚记录（记过次数归零），玩家刷新网页后就能正常同步、交易'], ok: '解封' });\n    if (a) await busy(b, async () => { await api('pardon', { uid: p.uid, why: a.why }); toast('解封了'); render(); });\n  },\n  giftoff: async b => {\n    const g = S.gifts.find(x => x.id === b.dataset.id);\n    if (!g) return;\n    const a = await ask({ title: '停发这份补偿', lines: ['“' + g.note + '”：' + giftText(g), '已经领了的 ' + fmtN(g.got) + ' 个账号不收回，还没领的就领不到了'], ok: '停发', danger: true });\n    if (a) await busy(b, async () => { await api('gift/off', { id: g.id, why: a.why }); toast('停发了'); render(); });\n  },\n  codeoff: async b => {\n    const c = S.codes.find(x => x.code === b.dataset.code);\n    if (!c) return;\n    const a = await ask({ title: '停用兑换码 ' + c.code, lines: ['“' + c.note + '”：' + giftText(c), '已经领了的 ' + fmtN(c.got) + ' 个号不收回，还没领的就领不到了'], ok: '停用', danger: true });\n    if (a) await busy(b, async () => { await api('code/off', { code: c.code, why: a.why }); toast('停用了'); render(); });\n  },\n  cfgdef: b => {\n    const f = b.form, row = S.cfg.info.find(x => x[0] === b.dataset.k);\n    if (!row) return;\n    f.elements[row[0]].value = row[1];\n    cfgLive(f);\n  },\n  flagset: async b => {\n    const f = S.flags.find(x => x.k === b.dataset.k), mode = b.dataset.mode;\n    if (!f) return;\n    const a = await ask({ title: '改功能开关 ' + f.k, lines: [f.desc, FLAG_MODE[f.mode] + ' → ' + FLAG_MODE[mode]], ok: '改', danger: mode === 'all' });\n    if (a) await busy(b, async () => { await api('flags', { k: f.k, mode, why: a.why }); toast('改好了'); render(); });\n  },\n  cfgundo: async b => {\n    const to = +b.dataset.to, h = S.cfg.hist.find(x => x.id === to);\n    const what = to ? '第 ' + to + ' 版：' + (Object.entries((h || {}).cfg || {}).map(([k, v]) => cfgName(k) + ' ' + v).join('，') || '全是默认值') : '所有经济数值回到代码里写的默认值';\n    const a = await ask({ title: to ? '退回到第 ' + to + ' 版' : '全部回到默认值', lines: [what, '会存成新的一版，之后还能再退回来'], ok: '退回' });\n    if (a) await busy(b, async () => { const r = await api('cfg/undo', { to, why: a.why }); toast('退回好了，现在是第 ' + r.id + ' 版'); render(); });\n  },\n};\ndocument.addEventListener('click', e => {\n  const b = e.target.closest('[data-act]');\n  if (!b || b.disabled || !ACTS[b.dataset.act]) return;\n  e.preventDefault();\n  ACTS[b.dataset.act](b);\n});\ndocument.addEventListener('change', e => {\n  const f = e.target.form;\n  if (f && f.dataset.form === 'gift' && e.target.name === 'to') {\n    const one = e.target.value === 'one';\n    $('[data-one]', f).classList.toggle('hidden', !one);\n    $('[data-all]', f).classList.toggle('hidden', one);\n    if (one) f.elements.user.focus();\n  }\n});\ndocument.addEventListener('input', e => {\n  const f = e.target.form;\n  if (f && f.dataset.form === 'cfg') cfgLive(f);\n});\n\n/* ---------- 表单 ---------- */\nconst FORMS = {\n  find: f => { S.q = f.elements.q.value.trim().slice(0, 64); render(); },\n  adjust: async f => {\n    const p = S.p, e = p.econ, s = (e && e.state) || {}, cases = s.cases || {}, inv = s.inv || [];\n    const body = { uid: p.uid, ink: numIn(f, 'ink'), cases: {}, term: numIn(f, 'term'), tags: numIn(f, 'tags'), give: S.give.slice(),\n      take: [...f.querySelectorAll('input[name=take]:checked')].map(x => Number(x.value)) };\n    for (const c of CAT.caseIds) { const n = numIn(f, 'case_' + c); if (n) body.cases[c] = n; }\n    if ([body.ink, body.term, body.tags, ...Object.values(body.cases)].some(v => !Number.isInteger(v))) return toast('数量要填整数', true);\n    const ink0 = e ? e.ink : 0, lines = [];\n    if (body.ink) lines.push('墨锭 ' + sign(body.ink) + '（' + fmtN(ink0) + ' → ' + fmtN(ink0 + body.ink) + '）');\n    for (const [c, n] of Object.entries(body.cases)) lines.push(caseName(c) + ' ' + sign(n) + '（' + (+cases[c] || 0) + ' → ' + ((+cases[c] || 0) + n) + '）');\n    if (body.term) lines.push('终端机 ' + sign(body.term) + '（' + (+s.term || 0) + ' → ' + ((+s.term || 0) + body.term) + '）');\n    if (body.tags) lines.push('改名标签 ' + sign(body.tags) + '（' + (+s.tags || 0) + ' → ' + ((+s.tags || 0) + body.tags) + '）');\n    for (const g of body.give) lines.push('发：' + itemName(g.k) + '（' + heroOf(g.k) + '）' + (g.st >= 0 ? ' 斩数版，斩数 ' + g.st : ''));\n    for (const i of body.take) { const it = inv.find(x => x.i === i); lines.push('收走：#' + i + ' ' + (it ? itemName(it.k) + '（' + heroOf(it.k) + '）' : '')); }\n    if (!lines.length) return toast('什么都没填，没有要改的', true);\n    const a = await ask({ title: '修改 ' + p.username, lines, ok: '确定修改' });\n    if (a) await busy(submitBtn(f), async () => { const r = await api('adjust', { ...body, why: a.why }); toast('改好了：' + p.username + ' 现在有 ' + fmtN(r.ink) + ' 墨锭'); render(); });\n  },\n  restore: async f => {\n    const p = S.p, ids = [...f.querySelectorAll('input[name=restore]:checked')].map(x => Number(x.value));\n    if (!ids.length) return toast('先勾上要找回的饰品', true);\n    if (ids.length > 50) return toast('一次最多找回 50 件', true);\n    const L = S.lost.items, lines = ids.map(i => { const x = L.find(y => y.i === i) || {}; return '找回：#' + i + ' ' + itemName(x.k) + '（' + heroOf(x.k) + '）' + (x.st >= 0 ? ' 斩数版' : '') + '，' + (LOST_TEXT[x.why] || ''); });\n    const a = await ask({ title: '给 ' + p.username + ' 找回饰品', lines: [...lines, '放回库存，原来的编号空着就用原来的；每件只能找回一次'], ok: '确定找回' });\n    if (a) await busy(submitBtn(f), async () => { const r = await api('restore', { uid: p.uid, ids, why: a.why }); S.lost = null; toast('找回了 ' + r.items.length + ' 件'); render(); });\n  },\n  ban: async f => {\n    const p = S.p, perm = f.elements.perm.checked, days = numIn(f, 'days');\n    if (!perm && !(Number.isInteger(days) && days >= 1 && days <= 3650)) return toast('封几天要填 1 到 3650 的整数', true);\n    const a = await ask({ title: '封号 ' + p.username, lines: [perm ? '永久封号' : '封 ' + days + ' 天（到 ' + fmtT(Date.now() + days * 864e5) + '）', '封禁期间不能同步存档、不能交易'], ok: '封号', danger: true });\n    if (a) await busy(submitBtn(f), async () => { await api('ban', perm ? { uid: p.uid, perm: true, why: a.why } : { uid: p.uid, days, why: a.why }); toast('封了'); render(); });\n  },\n  pw: async f => {\n    const p = S.p, pw = f.elements.pw.value;\n    if (pw.length < 12 || pw.length > 128) return toast('新密码要 12 到 128 位', true);\n    const a = await ask({ title: '重设 ' + p.username + ' 的密码', lines: ['新密码：' + pw, '先把它记下来，重设以后这里不再显示', '这个号在所有设备上的登录都会退出，要用新密码重新登录'], ok: '重设密码', danger: true });\n    if (a) await busy(submitBtn(f), async () => { await api('password', { uid: p.uid, password: pw, why: a.why }); toast('密码重设好了，' + p.username + ' 在别处的登录都退出了'); render(); });\n  },\n  mkdev: async f => {\n    const pw = f.elements.pw.value;\n    if (pw.length < 12 || pw.length > 128) return toast('密码要 12 到 128 位', true);\n    const a = await ask({ title: '建 Dev 账号', lines: ['密码：' + pw, '先把它记下来，建好以后这里不再显示'], ok: '建号' });\n    if (a) await busy(submitBtn(f), async () => { const r = await api('password', { uid: 'Dev', password: pw, create: true, why: a.why }); toast(r.created ? '建好了，Dev 可以用这个密码登录了' : 'Dev 已经有了，密码重设好了'); go('players', r.uid); });\n  },\n  gift: async f => {\n    const E = f.elements, one = E.to.value === 'one', to = one ? E.user.value.trim() : 'all';\n    if (one && !to) return toast('填上要发给哪个账号', true);\n    const body = { to, ink: numIn(f, 'ink'), cases: {}, term: numIn(f, 'term'), tags: numIn(f, 'tags'), days: numIn(f, 'days') || 14, newToo: !one && E.newToo.checked, note: E.note.value.trim() };\n    for (const c of CAT.caseIds) { const n = numIn(f, 'gc_' + c); if (n) body.cases[c] = n; }\n    if ([body.ink, body.term, body.tags, body.days, ...Object.values(body.cases)].some(v => !Number.isInteger(v) || v < 0)) return toast('数量要填 0 或者正整数', true);\n    if (!body.ink && !body.term && !body.tags && !Object.keys(body.cases).length) return toast('补偿里什么都没有', true);\n    if (body.note.length < 2) return toast('写一句给玩家看的说明（至少 2 个字）', true);\n    const lines = ['发给：' + (one ? to : body.newToo ? '所有人，包括之后新注册的' : '现在已经注册的所有人'), '内容：' + giftText(body),\n      '玩家看到：开发组补偿：' + body.note, body.days + ' 天内登录或者打开武库就能领，每个账号一份'];\n    const a = await ask({ title: '发补偿', lines, whyInit: body.note, ok: '发出' });\n    if (a) await busy(submitBtn(f), async () => { await api('gift', { ...body, why: a.why }); toast('补偿发出去了'); render(); });\n  },\n  code: async f => {\n    const E = f.elements, raw = E.code.value.trim().toUpperCase();\n    if (raw && !/^[A-Z0-9]{4,20}$/.test(raw)) return toast('兑换码只能用 4 到 20 位英文字母和数字', true);\n    const body = { code: raw, ink: numIn(f, 'ink'), cases: {}, term: numIn(f, 'term'), tags: numIn(f, 'tags'), uses: numIn(f, 'uses') || 100, days: numIn(f, 'days') || 14, note: E.note.value.trim() };\n    for (const c of CAT.caseIds) { const n = numIn(f, 'cc_' + c); if (n) body.cases[c] = n; }\n    if ([body.ink, body.term, body.tags, body.uses, body.days, ...Object.values(body.cases)].some(v => !Number.isInteger(v) || v < 0)) return toast('数量要填 0 或者正整数', true);\n    if (!body.ink && !body.term && !body.tags && !Object.keys(body.cases).length) return toast('兑换码里什么都没有', true);\n    if (body.note.length < 2) return toast('写一句给玩家看的说明（至少 2 个字）', true);\n    const lines = ['兑换码：' + (raw || '随机生成 10 位'), '内容：' + giftText(body), '玩家看到：兑换成功：' + body.note + '（内容）',\n      '最多 ' + fmtN(body.uses) + ' 个号能领，每个号一次；' + body.days + ' 天内有效'];\n    const a = await ask({ title: '建兑换码', lines, whyInit: body.note, ok: '建码' });\n    if (a) await busy(submitBtn(f), async () => { const r = await api('code', { ...body, why: a.why }); toast('建好了：' + r.code); render(); });\n  },\n  cfg: async f => {\n    const { info, cfg: cur } = S.cfg, set = {}, lines = [];\n    for (const [k, def, lo, hi, isInt, g, desc] of info) {\n      const raw = f.elements[k].value.trim(), v = raw === '' ? def : Number(raw), was = Object.prototype.hasOwnProperty.call(cur, k) ? cur[k] : def;\n      if (!Number.isFinite(v) || v < lo || v > hi || (isInt && !Number.isInteger(v))) return toast(g + '：' + desc + ' 要填 ' + lo + '～' + hi + ' 的' + (isInt ? '整数' : '数'), true);\n      if (v === was) continue;\n      set[k] = v === def ? null : v;\n      lines.push(g + '：' + desc + '　' + was + ' → ' + v + (v === def ? '（默认值）' : ''));\n    }\n    if (!lines.length) return toast('没有改动', true);\n    const a = await ask({ title: '保存经济数值', lines, ok: '保存' });\n    if (a) await busy($('#cfgSave'), async () => { const r = await api('cfg', { set, why: a.why }); toast('保存好了，现在是第 ' + r.id + ' 版'); render(); });\n  },\n};\ndocument.addEventListener('submit', e => {\n  const f = e.target;\n  if (!f.dataset || !FORMS[f.dataset.form]) return;\n  e.preventDefault();\n  FORMS[f.dataset.form](f);\n});\n\n/* ---------- 登录、退出 ---------- */\nasync function start() {\n  const [w, cat] = await Promise.all([api('whoami'), api('catalog')]);\n  useCat(cat);\n  S.who = w.who;\n  $('#who').textContent = w.who;\n  $('#login').classList.add('hidden');\n  $('#app').classList.remove('hidden');\n  route();\n}\nfunction logout(msg) {\n  S.tok = ''; S.who = ''; S.p = null; S.cfg = null;\n  saveTok('');\n  $('#app').classList.add('hidden');\n  $('#main').textContent = '';\n  $('#login').classList.remove('hidden');\n  $('#tok').value = '';\n  $('#loginMsg').textContent = msg || '';\n  $('#tok').focus();\n}\n$('#loginForm').addEventListener('submit', async e => {\n  e.preventDefault();\n  const tok = $('#tok').value.trim(), btn = $('#loginBtn');\n  if (!tok) return;\n  if (tok.length < 16) { $('#loginMsg').textContent = '管理口令至少 16 位，短的服务器不认'; return; }\n  btn.disabled = true; btn.textContent = '检查口令…'; $('#loginMsg').textContent = '';\n  S.tok = tok;\n  try { await start(); saveTok(tok); }\n  catch (err) { S.tok = ''; $('#loginMsg').textContent = err.message === '没有权限' ? '口令不对' : err.message; }\n  finally { btn.disabled = false; btn.textContent = '进入'; }\n});\n(async () => {\n  S.tok = loadTok();\n  if (!S.tok) return logout();\n  try { await start(); } catch (e) { logout(e.message === '没有权限' ? '' : e.message); }\n})();\n</script>\n</body>\n</html>\n", sha: '48F4hBtBMG1yTR+td0vUdZtK0vIaKo9YrMS/zwisjek=' };
function adminPage() {
  const html = ADMIN_PAGE.html || '<!doctype html><meta charset="utf-8"><title>刃影管理后台</title><p>管理网页在打包好的 cloudflare/worker.bundle.js 里，先运行 python3 tools/build.py。</p>';
  const script = ADMIN_PAGE.sha ? `'sha256-${ADMIN_PAGE.sha}'` : "'none'";
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; script-src ${script}; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
}

async function cleanup(env, now) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM errs WHERE last_at < ?').bind(now - 30 * DAY_MS),                              // 错误记录留 30 天
    env.DB.prepare('DELETE FROM econ_nonce WHERE at < ?').bind(now - 2 * DAY_MS),
    env.DB.prepare('DELETE FROM rate WHERE reset < ?').bind(now - DAY_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('UPDATE mkt SET state = 2, done_at = ? WHERE state = 0 AND at < ?').bind(now, now - mktTtl()),   // 到期没卖出的撤下；饰品在卖家下次动武库时退回
    env.DB.prepare('DELETE FROM mkt WHERE state = 2 AND done_at < ?').bind(now - 7 * DAY_MS),               // 撤下的单留一周（删了也没关系：存档里还挂着、表里找不到的一样退回）
    env.DB.prepare('DELETE FROM mkt WHERE state = 1 AND paid = 1 AND done_at < ?').bind(now - 120 * DAY_MS),   // 成交记录留四个月（价格走势用）
    env.DB.prepare('DELETE FROM presence WHERE seen < ?').bind(now - 10 * 60e3),
    env.DB.prepare('DELETE FROM gboss_try WHERE started < ?').bind(now - 7 * DAY_MS),
  ]);
}

/* ---------- 错误记录 ----------
 * 网页出了没接住的错，src/errlog.js 脱敏以后报到 POST /api/err；这里再洗一遍（不信网页），同一种错合成一行计数。
 * 每个 IP 一小时最多 30 条，全服一小时最多 2000 条，多出来的直接丢（错误记录不能把数据库写爆）。管理网页「错误」页看。
 * 服务器自己没接住的错（kind = server）和慢请求（kind = slow）也记在这里。 */
const ERR_KINDS = ['client'];
function errScrub(s, cap) {
  return String(s == null ? '' : s)
    .replace(/(?:https?|file|blob):\/\/[^\s)'"]*?([^/\s)'"?#]*)(?:[?#][^\s)'":]*)?(?=[\s)'":]|$)/g, (m, f) => f || '(url)')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '*@*')
    .replace(/\b(?:[0-9a-f]{20,}|[A-Za-z0-9_-]{32,})\b/g, '*')
    .replace(/\d{6,}/g, '*')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .slice(0, cap);
}
async function errRecord(env, kind, e, now) {
  const msg = errScrub(e.msg, 300) || '未知错误', src = errScrub(e.src, 200), stack = errScrub(e.stack, 1500);
  const meta = {};
  for (const [k, v] of Object.entries(isPlain(e.meta) ? e.meta : {}).slice(0, 12)) {
    if (/^[a-z]{1,8}$/i.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) meta[k] = typeof v === 'string' ? (kind === 'client' ? errScrub(v, 60) : v.slice(0, 60)) : v;   // 网页报的才要洗，服务器自己记的（请求编号这种）原样留
  }
  const sig = (await sha256Hex(kind + '|' + msg + '|' + src)).slice(0, 32), ms = Math.max(0, Math.round(+e.ms || 0));
  await ensureSchema(env);
  await env.DB.prepare(
    'INSERT INTO errs (sig, kind, msg, src, stack, meta, n, first_at, last_at, ms, ms_sum) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7, ?8, ?8) ' +
    'ON CONFLICT(sig) DO UPDATE SET n = errs.n + 1, last_at = ?7, meta = ?6, stack = CASE WHEN ?5 = \'\' THEN errs.stack ELSE ?5 END, ms = MAX(errs.ms, ?8), ms_sum = errs.ms_sum + ?8'
  ).bind(sig, kind, msg, src, stack, JSON.stringify(meta), now, ms).run();
}
async function errReport(env, request, ip, now) {
  const txt = await request.text().catch(() => '');
  if (txt.length > 8000) return error('请求太大', 413);
  if (!(await hit(env, 'err:' + ip, 30, 3600e3, now)) || !(await hit(env, 'err:*', 2000, 3600e3, now))) return json({ ok: true, kept: false });
  const body = parseObj(txt);
  if (!body || !ERR_KINDS.includes(body.k) || typeof body.msg !== 'string') return error('格式不对');
  await errRecord(env, body.k, body, now);
  return json({ ok: true, kept: true });
}

/* ---------- 在线人数 ----------
 * 大厅名单靠浏览器之间直连，连不上别人的网页（有的防火墙、网络会挡 WebRTC）就只能看到自己，所以人数以这里为准。
 * 每个标签页带一个随机 sid（存在 sessionStorage，刷新还是同一个），30 秒报一次状态：menu 在逛、queue 在匹配、match 在联机对战。
 * 关网页时发 bye 立刻下线。同一个 IP 最多算 PRESENCE_PER_IP 个，防止有人刷人数（同一个校园网、家里几台机器都还够用）。 */
const PRESENCE_WINDOW = 90e3, PRESENCE_PER_IP = 16, PRESENCE_ST = ['menu', 'queue', 'match'];
async function ipTag(ip) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('renying-presence:' + ip));
  return Array.from(new Uint8Array(d).slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function presence(env, body, ip, now) {
  const sid = String(body.sid || '');
  if (!/^[a-z0-9]{12,40}$/.test(sid)) return error('sid 不对');
  const tag = await ipTag(ip);
  if (body.bye) {
    await env.DB.prepare('DELETE FROM presence WHERE sid = ? AND ip = ?').bind(sid, tag).run();
  } else {
    const st = PRESENCE_ST.includes(body.st) ? body.st : 'menu';
    const mine = await env.DB.prepare('SELECT (SELECT ip FROM presence WHERE sid = ?1) AS owner, (SELECT COUNT(*) FROM presence WHERE ip = ?2 AND seen > ?3) AS n').bind(sid, tag, now - PRESENCE_WINDOW).first();
    if (mine && mine.owner && mine.owner !== tag) return error('sid 不对');   // 别人的 sid：不让顶替
    if ((mine && mine.owner) || !mine || mine.n < PRESENCE_PER_IP) {
      await env.DB.prepare('INSERT INTO presence (sid, ip, st, seen) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(sid) DO UPDATE SET st = ?3, seen = ?4').bind(sid, tag, st, now).run();
    }
  }
  const c = await env.DB.prepare("SELECT COUNT(*) AS online, SUM(st = 'match') AS playing, SUM(st = 'queue') AS waiting FROM presence WHERE seen > ?").bind(now - PRESENCE_WINDOW).first();
  return json({ ok: true, online: (c && c.online) || 0, playing: (c && c.playing) || 0, waiting: (c && c.waiting) || 0, every: 30 });
}

/* ---------- 天魔讨伐：全服一起打一只天魔 ----------
 * 打架在各自的网页里打（90 秒，天魔倒下会再站起来），打完把造成的伤害交上来，扣在全服同一只天魔的血上。
 * 出战先领票（gboss_try），交伤害时把这张票改成“交过了”、扣天魔的血、记个人伤害放在同一批写入里：同一张票重交、
 * 网络重试、刷新后补交都只算一次；两个人同时打出最后一下，只有一个扣得动（hp > 0 才扣），另一个记 0。
 * 伤害上限：一张票最多 GB_TRY_MAX，而且不超过 (出战到现在的秒数 - 3) × GB_DPS。票一小时内不交就作废。
 * 一代天魔活 GB_LIFE，到时没打死就遁走；结束后按伤害发奖励（写进 gift 表，玩家下次动武库自动领），再出下一代。 */
const GB_TRY_MAX = 9000, GB_DPS = 110, GB_LIFE = 3 * DAY_MS, GB_TICKET = 3600e3, GB_HP0 = 30000;
const GB_AFFIX = ['bx_enrage', 'bx_thunder', 'bx_regen', 'bx_thorns', 'bx_armor', 'bx_frost', 'bx_venom', 'bx_haste'];
const gbLatest = env => env.DB.prepare('SELECT * FROM gboss ORDER BY gen DESC LIMIT 1').first();
function gbNext(prev, now) {
  const gen = prev ? prev.gen + 1 : 1;
  const heroes = C.HERO_IDS.filter(h => !prev || h !== prev.hero);
  const hero = heroes[Math.floor(rnd() * heroes.length)];
  const bag = GB_AFFIX.slice(), affix = [];
  for (let n = Math.min(4, 2 + Math.floor((gen - 1) / 4)); n > 0; n--) affix.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]);
  // 上一代打死了就更硬一点，遁走了就弱一点
  const hp = !prev ? GB_HP0 : prev.killer ? Math.min(300000, Math.round(prev.max_hp * 1.2)) : Math.max(15000, Math.round(prev.max_hp * 0.8));
  return env => env.DB.prepare('INSERT OR IGNORE INTO gboss (gen, hero, affix, max_hp, hp, started, until) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(gen, hero, affix.join(','), hp, hp, now, now + GB_LIFE);
}
// 结束了的那一代发奖励、出下一代。可以重复跑：奖励的编号是固定的（INSERT OR IGNORE），下一代也只插得进一次
async function gbSettle(env, b, now) {
  const rows = (await env.DB.prepare('SELECT uid, dmg FROM gboss_hit WHERE gen = ? AND dmg > 0 ORDER BY dmg DESC').bind(b.gen).all()).results || [];
  const kill = !!b.killer, stmts = [];
  rows.forEach((r, i) => {
    const share = Math.min(1, r.dmg / b.max_hp);
    let ink = kill ? 120 + Math.min(880, Math.round(3000 * share)) : 60 + Math.min(440, Math.round(1500 * share));
    const killer = kill && r.uid === b.killer;
    if (killer) ink += 300;
    const items = kill && (i < 3 || killer) ? { cases: { [C.CASES[Math.floor(rnd() * C.CASES.length)]]: 1 } } : {};
    const note = kill ? `天魔讨伐 · 第 ${b.gen} 代被斩杀${killer ? ' · 斩杀一击' : i < 3 ? ` · 伤害第 ${i + 1}` : ''}` : `天魔讨伐 · 第 ${b.gen} 代遁走 · 参战奖励`;
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO gift (id, uid, ink, items_json, note, by, at, until, born) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(`gb${b.gen}_${r.uid}`, r.uid, ink, JSON.stringify(items), note, 'gboss', now, now + 30 * DAY_MS, now));
  });
  stmts.push(gbNext(b, now)(env));
  stmts.push(env.DB.prepare('UPDATE gboss SET paid = 1 WHERE gen = ?').bind(b.gen));
  stmts.push(logStmt(env, '*', now, 'gboss_end', 1, null, null, JSON.stringify({ gen: b.gen, killer: b.killer || null, players: rows.length })));
  await env.DB.batch(stmts);
}
// 现在这一代：没有就建第一代；到时没打死的算遁走；结束了还没发奖励的补发
async function gbNow(env, now) {
  let b = await gbLatest(env);
  if (!b) { await gbNext(null, now)(env).run(); b = await gbLatest(env); }
  if (!b.ended && b.until <= now) {
    await env.DB.prepare('UPDATE gboss SET ended = ? WHERE gen = ? AND ended = 0').bind(now, b.gen).run();
    b = await gbLatest(env);
  }
  if (b.ended && !b.paid) { await gbSettle(env, b, now); b = await gbLatest(env); }
  return b;
}
async function gbState(env, b, uid, now) {
  const [top, cnt, me, kills, last, feed, live] = await Promise.all([
    env.DB.prepare('SELECT u.username AS name, h.dmg, h.runs FROM gboss_hit h LEFT JOIN users u ON u.id = h.uid WHERE h.gen = ? ORDER BY h.dmg DESC LIMIT 8').bind(b.gen).all(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM gboss_hit WHERE gen = ?').bind(b.gen).first(),
    uid ? env.DB.prepare('SELECT dmg, runs FROM gboss_hit WHERE gen = ? AND uid = ?').bind(b.gen, uid).first() : null,
    env.DB.prepare('SELECT COUNT(*) AS n FROM gboss WHERE killer IS NOT NULL').first(),
    env.DB.prepare('SELECT g.gen, g.hero, g.max_hp, g.ended, u.username AS killer, g.killer IS NOT NULL AS killed FROM gboss g LEFT JOIN users u ON u.id = g.killer WHERE g.gen = ?').bind(b.gen - 1).first(),
    env.DB.prepare('SELECT u.username AS name, t.dmg, t.done AS at, t.killed FROM gboss_try t LEFT JOIN users u ON u.id = t.uid WHERE t.gen = ? AND t.done > 0 AND t.dmg > 0 ORDER BY t.done DESC LIMIT 6').bind(b.gen).all(),
    env.DB.prepare('SELECT COUNT(DISTINCT uid) AS n FROM gboss_try WHERE done = 0 AND started > ?').bind(now - 150e3).first(),
  ]);
  const name = x => x || '已注销的侠客';
  return {
    ok: true, now,
    boss: { gen: b.gen, hero: b.hero, affix: b.affix.split(',').filter(Boolean), maxHp: b.max_hp, hp: b.hp, started: b.started, until: b.until, ended: b.ended },
    kills: (kills && kills.n) || 0,
    players: (cnt && cnt.n) || 0,
    fighting: (live && live.n) || 0,
    top: ((top && top.results) || []).map(r => ({ name: name(r.name), dmg: r.dmg, runs: r.runs })),
    feed: ((feed && feed.results) || []).map(r => ({ name: name(r.name), dmg: r.dmg, at: r.at, killed: !!r.killed })),
    me: uid ? { dmg: (me && me.dmg) || 0, runs: (me && me.runs) || 0 } : null,
    last: last ? { gen: last.gen, hero: last.hero, maxHp: last.max_hp, ended: last.ended, killed: !!last.killed, killer: last.killed ? name(last.killer) : null } : null,
    rules: { fight: 90, tryMax: GB_TRY_MAX, life: GB_LIFE },
  };
}
async function gbStart(env, auth, now) {
  const uid = auth.user.id;
  const ban = await banOf(env, uid, now);
  if (ban) return banned(ban);
  if (!(await hit(env, 'gbs:' + uid, 1, 15e3, now))) return error('刚出战过，稍等几秒再来', 429);
  if (!(await hit(env, 'gbd:' + uid, 40, DAY_MS, now))) return error('今天已经讨伐很多次了，明天再来', 429);
  const b = await gbNow(env, now);
  const id = randHex(10);
  await env.DB.prepare('INSERT INTO gboss_try (id, uid, gen, started) VALUES (?, ?, ?, ?)').bind(id, uid, b.gen, now).run();
  return json({ ...(await gbState(env, b, uid, now)), ticket: id });
}
async function gbHit(env, auth, body, now) {
  const uid = auth.user.id, id = String(body.id || '');
  if (!/^[0-9a-f]{20}$/.test(id)) return error('出战记录不对');
  if (!(await hit(env, 'gbh:' + uid, 30, 60e3, now))) return error('交得太快了，稍等再试', 429);
  const t = await env.DB.prepare('SELECT * FROM gboss_try WHERE id = ? AND uid = ?').bind(id, uid).first();
  if (!t) return error('找不到这次出战', 404);
  const done = async (extra) => {
    const t2 = await env.DB.prepare('SELECT dmg, killed, gen FROM gboss_try WHERE id = ?').bind(id).first();
    const b = await gbNow(env, now);
    return json({ ...(await gbState(env, b, uid, now)), credited: t2.dmg, killed: !!t2.killed, tryGen: t2.gen, ...extra });
  };
  if (t.done) return await done({ dup: true });
  const asked = Math.max(0, Math.floor(+body.dmg || 0));
  const late = now - t.started > GB_TICKET;
  const cap = late ? 0 : Math.max(0, Math.min(GB_TRY_MAX, Math.floor((now - t.started - 3000) / 1000 * GB_DPS)));
  const dmg = Math.min(asked, cap);
  const tx = randHex(8);
  const stmts = [env.DB.prepare('UPDATE gboss_try SET done = ?, tx = ? WHERE id = ? AND uid = ? AND done = 0').bind(now, tx, id, uid)];
  if (dmg > 0) {
    // 只有刚才那一句改成了（tx 对得上），下面几句才生效；天魔已经倒了 / 遁走了 / 换代了就一句都不生效，这次记 0
    stmts.push(env.DB.prepare(`UPDATE gboss SET last = MIN(hp, ?1), last_tx = ?2, killer = CASE WHEN hp <= ?1 THEN ?3 ELSE killer END,
        ended = CASE WHEN hp <= ?1 THEN ?4 ELSE 0 END, hp = MAX(0, hp - ?1)
        WHERE gen = ?5 AND hp > 0 AND ended = 0 AND until > ?4 AND EXISTS (SELECT 1 FROM gboss_try WHERE id = ?6 AND tx = ?2)`).bind(dmg, tx, uid, now, t.gen, id));
    stmts.push(env.DB.prepare(`INSERT INTO gboss_hit (gen, uid, dmg, runs, last) SELECT ?1, ?2, last, 1, ?3 FROM gboss WHERE gen = ?1 AND last_tx = ?4
        ON CONFLICT(gen, uid) DO UPDATE SET dmg = gboss_hit.dmg + excluded.dmg, runs = gboss_hit.runs + 1, last = excluded.last`).bind(t.gen, uid, now, tx));
    stmts.push(env.DB.prepare(`UPDATE gboss_try SET dmg = COALESCE((SELECT last FROM gboss WHERE gen = ?1 AND last_tx = ?2), 0),
        killed = COALESCE((SELECT hp = 0 FROM gboss WHERE gen = ?1 AND last_tx = ?2), 0) WHERE id = ?3 AND tx = ?2`).bind(t.gen, tx, id));
  }
  await env.DB.batch(stmts);
  if (asked > cap) await logRow(env, uid, now, 'gboss_cap', 1, null, null, JSON.stringify({ id, asked, cap, gen: t.gen }));
  return await done({ capped: asked > cap, late });
}

/* ---------- 排行榜 ----------
 * 段位分、胜负场都是玩家自己的网页算好存进存档的（rk、netWins / netLosses），服务器只负责排序和挡掉被封的号，
 * 所以这里的数只用来展示，不拿去发奖励。 */
const LB_N = 100, RK_PLACE = 5, RK_MIN = 1000, RK_MAX = 25000;
async function leaderboard(env, kind, season, me, now) {
  const notBanned = 'id NOT IN (SELECT uid FROM sanctions WHERE perm = 1 OR ban_until > ?1)';
  if (kind === 'rank') {
    if (!/^S\d{1,3}$/.test(season)) return { ok: true, kind, list: [] };
    const rows = (await env.DB.prepare(
      `SELECT id, username, json_extract(profile_json, '$.rk.pts') AS pts FROM users WHERE ${notBanned}
       AND json_extract(profile_json, '$.rk.season') = ?2 AND json_extract(profile_json, '$.rk.placed') >= ?3
       ORDER BY pts DESC, updated_at LIMIT ?4`).bind(now, season, RK_PLACE, LB_N).all()).results || [];
    return { ok: true, kind, list: rows.map(r => ({ name: r.username, pts: Math.max(RK_MIN, Math.min(RK_MAX, Math.round(+r.pts || 0))), me: r.id === me })) };
  }
  const [rows, cnt] = await Promise.all([
    env.DB.prepare(
      `SELECT id, username, json_extract(profile_json, '$.netWins') AS w, json_extract(profile_json, '$.netLosses') AS l FROM users WHERE ${notBanned}
       AND json_extract(profile_json, '$.netWins') > 0 ORDER BY w DESC, l, updated_at LIMIT ?2`).bind(now, LB_N).all(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(),
  ]);
  const n = v => Math.max(0, Math.min(1e6, Math.floor(+v || 0)));
  return { ok: true, kind, players: (cnt && cnt.n) || 0, list: (rows.results || []).map(r => ({ name: r.username, wins: n(r.w), losses: n(r.l), me: r.id === me })) };
}

/* ---------- 侠客列传：江湖足迹 ---------- */
async function sagaFoot(env, hero) {
  const [rows, recent] = await Promise.all([
    env.DB.prepare('SELECT node, pick, COUNT(*) AS n FROM saga_mark WHERE hero = ? GROUP BY node, pick').bind(hero).all(),
    env.DB.prepare("SELECT u.username AS name, m.pick, m.at FROM saga_mark m JOIN users u ON u.id = m.uid WHERE m.hero = ? AND m.node = 'end' ORDER BY m.at DESC LIMIT 5").bind(hero).all(),
  ]);
  const nodes = {};
  for (const r of (rows && rows.results) || []) {
    const x = nodes[r.node] || (nodes[r.node] = { n: 0, picks: {} });
    x.n += r.n; x.picks[r.pick] = r.n;
  }
  return { ok: true, hero, nodes, recent: ((recent && recent.results) || []).map(r => ({ name: r.name, pick: r.pick, at: r.at })) };
}
async function sagaMarkPost(env, auth, body, now) {
  const hero = String(body.hero || ''), node = String(body.node || ''), pick = String(body.pick || '');
  if (!C.HERO_IDS.includes(hero) || !/^(n[1-9]|c[1-9]|end)$/.test(node) || !/^[a-z0-9_]{1,16}$/.test(pick)) return error('记录格式不对');
  if (!(await hit(env, 'saga:' + auth.user.id, 120, 3600e3, now))) return error('记得太频繁了', 429);
  await env.DB.prepare('INSERT INTO saga_mark (hero, node, uid, pick, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(hero, node, uid) DO UPDATE SET pick = ?4, at = ?5')
    .bind(hero, node, auth.user.id, pick, now).run();
  return json({ ok: true });
}

/* ---------- 江湖共斗 · 开放世界（/api/world/line/N，WebSocket） ----------
   一条分线 = 一个 Durable Object（WorldLine）。妖物和妖王由服务器每秒模拟 10 次；每位侠客只在自己的网页里模拟，
   服务器只收「我在哪、在做什么、打中了哪只妖物多少伤害」，伤害按距离和每秒上限封顶，改网页也刷不动。
   妖物出招时广播一条攻击，打没打中由挨打的那个网页自己判定（跟斩妖列传里一样能格挡、能闪）。
   每线最多 WL.CAP 人，满了网页自动去下一线，线数不设上限；每次只发视野内（左右 WL.AOI）最近的 WL.NEAR 位侠客。
   免费额度：网页发上来的消息 20 条算一次请求，发下去的不算；没人时停掉定时器，Durable Object 自动休眠不计时。 */
const WL = {
  CAP: 40, W: 8000, WALL: 60, TICK: 100, AOI: 2000, NEAR: 24, AGGRO: 700, IDLE: 15e3,
  HIT_MAX: 160, HIT_RANGE: 420, DPS: 320, BURST: 900,   // 单次伤害上限、离妖物多远还算打得到、每秒伤害上限和攒着的上限
  BOSS_EVERY: 40, BOSS_LIFE: 360,                         // 全线每斩 40 只妖物，魔窟里出一次妖王；6 分钟没打死就遁走
  ZONES: [
    { a: 60, b: 2000, hp: 1, dk: 1, keys: ['blade', 'archer', 'owl'] },                          // 竹林
    { a: 2000, b: 4000, hp: 1.5, dk: 1.25, keys: ['blade', 'archer', 'owl', 'binder'] },         // 古道
    { a: 4000, b: 6000, hp: 2.2, dk: 1.5, keys: ['blade', 'archer', 'binder', 'caster'] },       // 山寨
    { a: 6000, b: 7940, hp: 3, dk: 1.8, keys: ['blade', 'archer', 'owl', 'binder', 'caster'] },  // 魔窟
  ],
  MON: { blade: { hp: 40, spd: 150, keep: 70 }, archer: { hp: 30, spd: 120, keep: 380 }, binder: { hp: 34, spd: 90, keep: 260 }, caster: { hp: 32, spd: 100, keep: 320 }, owl: { hp: 24, spd: 220, keep: 0 } },
};
/* 全服肉鸽：每条分线一份共享进程。一轮 RG.JIE 劫，每劫全线斩够妖物后投票选一卷秘卷，全线共享；第 RG.JIE 劫斩够后进关键战。
   关键战：线上真人（按账号去重，游客按连接）够 RG.BOSS_MIN 人打天道 Boss（每人在自己网页里打同一只融魂魔首，血量全线共享，
   以服务器为准）。打赢了，够资格的云端账号由服务器写进 gift 表发一件随机星座皮肤（下次动武库自动领）。
   奖励相关的数都在 RG 里，改这里就行。 */
const RG = {
  JIE: 5, VOTE_T: 15, PERK_MAX: 8, EMPTY_RESET: 10 * 60e3,
  NEED0: 20, NEED_PER: 5, NEED_MAX: 150, CYC_HP: 0.15, CYC_HP_MAX: 3,   // 每劫要斩几只：20 + 每人 5 只；每过一轮妖物血量 +15%
  BOSS_MIN: 3, BOSS_HP: 1500, BOSS_T: 180,                              // 几个真人打 Boss、Boss 每人份的血、限时（秒）
  TRIO_T: 420,                                                          // 真人不够时改打 3 位天道 AI 的车轮战，限时（秒）
  KEY_DPS: 90, KEY_HIT_MAX: 600,                                        // 关键战伤害封顶：开战秒数 × 每秒上限，一次最多交多少
  ZOD_PER_DAY: 1, MIN_AGE_H: 24, MIN_JIE: 3, MIN_SHARE: 0.25, INK: 200, // 星座皮肤：每号每天几件、注册满几小时、这一轮至少在场几劫、伤害至少平均份额的几成、附带墨锭
  // 可以抽到的秘卷：src/game/22-scrolls.js 里不分侠客的凡品、精品、绝品（tools/world-test.mjs 会核对这些编号都还在）
  PERKS: ['ink_resonance', 'storm_wrath', 'air_burst', 'ink_blade', 'first_blood', 'executioner', 'giant_slayer', 'crescendo', 'heavy_hand', 'needle_rain', 'counter_master', 'backstab', 'sniper', 'brawler', 'momentum', 'crit_eye', 'lethal_rhythm', 'sunder', 'double_strike', 'shockwave', 'ult_amp', 'piercing_wind', 'golden_bell', 'parry_refresh', 'iron_skin', 'thorns', 'last_stand', 'guard_wall', 'retaliation', 'second_wind', 'evasion', 'stone_stance', 'aegis', 'counter_guard', 'jg_window', 'meditation', 'bulwark', 'proj_ward', 'ult_resist', 'after_armor', 'lifeline', 'recoil_guard', 'thunder_dash', 'sky_master', 'swift_feet', 'phantom_step', 'jump_guard', 'dash_strike', 'aerial_ace', 'feather_fall', 'jg_blink', 'wind_runner', 'dash_cd', 'slipstream', 'air_reset', 'ground_slam', 'escape_meter', 'sidestep', 'light_cdr', 'skill_echo', 'haste', 'ult_cdr', 'alternate', 'break_reset', 'hurt_cdr', 'full_meter_cdr', 'low_hp_haste', 'patient_power', 'jg_escape', 'combo_cdr', 'link_skill', 'opening_haste', 'cd_shield', 'flow_combo', 'meter_start', 'meter_block', 'meter_drain', 'meter_heal', 'ult_refund', 'meter_power', 'jg_meter', 'meter_shield', 'overflow', 'meter_bank', 'foe_meter_cut', 'ult_heal', 'guard_regen', 'fury', 'full_hp', 'berserker', 'far_reach', 'wall_pin', 'clutch', 'opener', 'untouched', 'juggler', 'low_leech', 'stance_switch', 'stun_bonus', 'block_punish', 'full_meter_foe', 'odd_even', 'heat', 'frost_lock', 'bleed_rend', 'venom', 'virulent', 'ignite', 'wildfire', 'shatter', 'hemorrhage', 'marked_prey', 'static', 'weaken', 'expose', 'root_strike', 'plague', 'cauterize', 'toxic_guard', 'frost_aura', 'chill_proj', 'frost_armor', 'deep_freeze', 'chain_lightning', 'thunder_mark', 'overcharge', 'storm_guard', 'charge_break', 'proj_absorb', 'listen_wind', 'skill_heal', 'guard_crush', 'after_skill_light', 'pressure', 'escape_strike', 'jg_heal'],
};
const rgNew = () => ({ cyc: 1, jie: 1, got: 0, need: RG.NEED0, perks: [], vote: null, key: null, seq: 0 });
const ZOD_KEYS = () => Object.keys(C.ITEM).filter(k => C.ITEM[k].col === 'c8');
const wlNum = (v, lo, hi, d = 0) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
const wlStr = v => (typeof v === 'string' && /^[a-z0-9_]{0,16}$/i.test(v) ? v : '');
const wlName = (v, id) => (String(v || '').match(/[\w\u4e00-\u9fff]/g) || []).join('').slice(0, 12) || `游侠${id}`;   // 没登录的显示成「游侠 + 编号」，好分清
const r1 = v => Math.round(v * 10) / 10;

class WorldSim {
  constructor(rnd = Math.random) {
    this.rnd = rnd; this.t = 0; this.players = new Map(); this.mons = []; this.nid = 1; this.mid = 1;
    this.kills = 0; this.sinceBoss = 0; this.boss = null; this.spawnT = 0; this.events = [];
    this.run = rgNew(); this.rewards = []; this.dirty = false;
  }
  get count() { return this.players.size; }
  join(meta) {
    if (this.players.size >= WL.CAP) return 0;
    const id = this.nid++;
    const ch = C.HERO_IDS.includes(meta && meta.ch) ? meta.ch : 'qingfeng';
    const skin = typeof (meta && meta.skin) === 'string' && /^[a-z]{2}_[a-z0-9]{1,20}$/.test(meta.skin) ? meta.skin : '';
    this.players.set(id, { id, name: wlName(meta && meta.name, id), ch, skin, x: 200 + this.rnd() * 400, y: 0, vx: 0, f: 1, st: 'idle', tt: 0, mv: '', sk: '', sp: '', ph: 0,
      hp: 100, mh: 100, seen: this.t, budget: WL.BURST, bt: this.t, uid: '', born: 0, jies: 0, inKey: false, keyIn: 0, keyDmg: 0 });
    return id;
  }
  // 登录令牌核对成云端账号以后：记下 uid 和注册时间（发奖励用）。同一个号开两个网页只算一个真人
  setAuth(id, uid, born) { const p = this.players.get(id); if (p) { p.uid = String(uid || ''); p.born = +born || 0; } }
  leave(id) {
    this.players.delete(id); if (this.boss && this.boss.dmg) delete this.boss.dmg[id];
    const v = this.run.vote; if (v) delete v.votes[id];
  }
  meta(p) { return [p.id, p.name, p.ch, p.skin]; }
  state(id, s) {
    const p = this.players.get(id); if (!p || !s) return false;
    p.x = wlNum(s.x, 0, WL.W, p.x); p.y = wlNum(s.y, -3000, 0, 0); p.vx = wlNum(s.vx, -3000, 3000); p.f = s.f < 0 ? -1 : 1;
    p.st = wlStr(s.st) || 'idle'; p.tt = wlNum(s.tt, 0, 60); p.mv = wlStr(s.mv); p.sk = wlStr(s.sk); p.sp = wlStr(s.sp); p.ph = wlNum(s.ph, 0, 9) | 0;
    p.mh = wlNum(s.mh, 1, 9999, 100); p.hp = wlNum(s.hp, 0, p.mh, p.mh);
    p.inKey = !!(s.kf && this.run.key);   // 在打关键战：妖物不追他
    if (p.inKey) this.run.key.in[id] = 1;
    if (C.HERO_IDS.includes(s.ch) && s.ch !== p.ch) { p.ch = s.ch; p.skin = ''; this.events.push({ t: 'j', p: this.meta(p), x: p.x }); }
    p.seen = this.t;
    return true;
  }
  // 侠客说自己打中了哪只妖物：要离得够近，伤害单次封顶，再按每秒上限扣掉攒着的额度
  hit(id, mid, d) {
    const p = this.players.get(id); d = +d;
    if (!p || !(d > 0)) return 0;
    const m = (this.boss && this.boss.id === mid) ? this.boss : this.mons.find(q => q.id === mid);
    if (!m || m.hp <= 0 || Math.abs(p.x - m.x) > WL.HIT_RANGE + (m.boss ? 160 : 0)) return 0;
    p.budget = Math.min(WL.BURST, p.budget + (this.t - p.bt) * WL.DPS); p.bt = this.t;
    d = Math.min(d, WL.HIT_MAX, p.budget); if (d <= 0) return 0;
    p.budget -= d; m.hp -= d;
    if (m.boss) m.dmg[id] = (m.dmg[id] || 0) + d;
    else { m.stag = Math.max(m.stag, 0.3); m.wind = 0; m.act = null; m.vx = (m.x >= p.x ? 1 : -1) * 140; }
    if (m.hp <= 0) this.kill(m, p);
    return d;
  }
  kill(m, p) {
    m.hp = 0; this.kills++;
    if (m.boss) {
      const top = Object.entries(m.dmg).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([pid, n]) => [(this.players.get(+pid) || { name: '已离开的侠客' }).name, Math.round(n)]);
      this.events.push({ t: 'bk', by: p.name, top, all: true });
      this.boss = null; this.sinceBoss = 0;
    } else {
      this.sinceBoss++;
      this.events.push({ t: 'x', m: m.id, by: p.id, x: m.x });
      const R = this.run;
      if (!R.vote && !R.key && R.got < R.need) { R.got++; if (R.got >= R.need) this.jieDone(); }
    }
  }
  zoneOf(x) { const i = WL.ZONES.findIndex(z => x < z.b); return i < 0 ? WL.ZONES.length - 1 : i; }
  spawn() {
    const want = Math.min(70, 10 + 3 * this.players.size);
    if (this.mons.length >= want) return;
    // 哪一段有人就多刷在哪一段，没人的地方也留几只
    const w = WL.ZONES.map(() => 1);
    for (const p of this.players.values()) w[this.zoneOf(p.x)] += 2;
    let r = this.rnd() * w.reduce((s, v) => s + v, 0), zi = 0;
    while (zi < w.length - 1 && r >= w[zi]) { r -= w[zi]; zi++; }
    const z = WL.ZONES[zi], key = z.keys[(this.rnd() * z.keys.length) | 0], T = WL.MON[key];
    let x = 0;
    for (let k = 0; k < 5; k++) {   // 别刷在侠客脸上
      x = z.a + 80 + this.rnd() * (z.b - z.a - 160);
      let near = false; for (const p of this.players.values()) if (Math.abs(p.x - x) < 450) near = true;
      if (!near) break;
    }
    const hp = Math.round(T.hp * z.hp * Math.min(RG.CYC_HP_MAX, 1 + RG.CYC_HP * (this.run.cyc - 1)));
    this.mons.push({ id: this.mid++, key, x, y: key === 'owl' ? -230 : 0, vx: 0, vy: 0, hp, mh: hp, f: 1, cd: 1 + this.rnd(), wind: 0, act: null, stag: 0,
      home: x, ph: this.rnd() * 6, zi, dk: z.dk, spd: T.spd, keep: T.keep });
  }
  spawnBoss() {
    const hp = 1500 + 600 * this.players.size, x = 6970;
    this.boss = { id: this.mid++, key: 'king', boss: true, x, y: 0, vx: 0, hp, mh: hp, f: -1, cd: 2.5, wind: 0, act: null, life: WL.BOSS_LIFE, dmg: {}, dk: 2, zi: 3 };
    this.events.push({ t: 'bs', all: true });
  }
  target(x, range) {
    let best = null, bd = range;
    for (const p of this.players.values()) { const d = Math.abs(p.x - x); if (p.hp > 0 && !p.inKey && d < bd) { bd = d; best = p; } }
    return best;
  }
  step(dt) {
    this.t += dt;
    for (const p of [...this.players.values()]) if (this.t - p.seen > WL.IDLE / 1000) this.leave(p.id);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.players.size && !this.run.key) { this.spawn(); this.spawnT = 0.5; }
    this.rgStep();
    if (!this.boss && this.sinceBoss >= WL.BOSS_EVERY && this.players.size) this.spawnBoss();
    for (const m of this.mons) this.monStep(m, dt);
    this.mons = this.mons.filter(m => m.hp > 0);
    if (this.boss) this.bossStep(this.boss, dt);
  }
  monStep(m, dt) {
    m.ph += dt;
    const tgt = this.target(m.x, WL.AGGRO), dx = tgt ? tgt.x - m.x : m.home - m.x, d = Math.abs(dx), dir = Math.sign(dx) || m.f;
    if (m.stag > 0) { m.stag -= dt; m.vx *= 0.7; }
    else if (m.key === 'owl') {
      if (m.act === 'dive') { m.x += m.vx * dt; m.y += m.vy * dt; if (m.y > -30 || m.y < -320) { m.act = null; m.vx = 0; m.vy = 0; m.y = Math.min(-40, m.y); } }
      else {
        const tx = (tgt ? tgt.x : m.home) + Math.sin(m.ph * 0.8) * 200;
        m.vx = Math.max(-m.spd, Math.min(m.spd, (tx - m.x) * 2)); m.y += (-230 - m.y) * Math.min(1, 3 * dt); m.f = dir;
        if (m.wind > 0) { m.wind -= dt; m.vx *= 0.3; if (m.wind <= 0 && tgt) { const ty = tgt.y - 60 - m.y, l = Math.hypot(dx, ty) || 1; m.vx = dx / l * 760; m.vy = ty / l * 760; m.act = 'dive'; this.attack(m, { k: 'dive', vx: r1(m.vx), vy: r1(m.vy) }); } }
        else if (tgt && (m.cd -= dt) <= 0) { m.wind = 0.45; m.cd = 2.6 + this.rnd(); }
      }
    } else if (m.wind > 0) {
      m.wind -= dt; m.vx *= 0.5;
      if (m.wind <= 0) {
        if (m.key === 'blade') this.attack(m, { k: 'blade' });
        if (m.key === 'archer') this.attack(m, { k: 'shot', vx: m.f * 620 });
        if (m.key === 'binder') this.attack(m, { k: 'trap', at: r1(m.mark), delay: 0.8 });
        if (m.key === 'caster') this.attack(m, { k: 'fire', at: r1(m.mark), delay: 0.9 });
      }
    } else {
      m.f = dir;
      const want = !tgt ? (d > 60 ? dir * 0.35 : 0) : m.key === 'blade' ? (d > m.keep ? dir : 0) : (d > m.keep + 60 ? dir : d < m.keep - 60 ? -dir : 0);
      m.vx += (want * m.spd - m.vx) * Math.min(1, 6 * dt);
      if (tgt && (m.cd -= dt) <= 0 && (m.key !== 'blade' || d < 110) && d < 600) {
        m.wind = { blade: 0.5, archer: 0.4, binder: 0.5, caster: 0.5 }[m.key]; m.cd = { blade: 2.2, archer: 2.8, binder: 4.5, caster: 4.5 }[m.key] * (0.8 + 0.4 * this.rnd());
        m.mark = tgt.x;
      }
    }
    if (m.act !== 'dive') m.x += m.vx * dt;
    const z = WL.ZONES[m.zi];   // 妖物守着自己那一段，不会追出去
    m.x = Math.max(z.a, Math.min(z.b, m.x));
  }
  bossStep(b, dt) {
    b.life -= dt;
    if (b.life <= 0) { this.boss = null; this.sinceBoss = 0; this.events.push({ t: 'bg', all: true }); return; }
    const tgt = this.target(b.x, 1400);
    if (b.act === 'charge') {
      b.x += b.vx * dt; b.ct -= dt;
      if (b.ct <= 0 || b.x < 6000 || b.x > 7940) { b.act = null; b.vx = 0; b.x = Math.max(6000, Math.min(7940, b.x)); }
      return;
    }
    if (b.wind > 0) {
      b.wind -= dt;
      if (b.wind <= 0) {
        if (b.act === 'slam') this.attack(b, { k: 'slam', r: 300 });
        if (b.act === 'rain') for (const p of this.players.values()) if (p.hp > 0 && Math.abs(p.x - b.x) < 1400) this.attack(b, { k: 'fire', at: r1(p.x), delay: 0.9 });
        if (b.act === 'chargeW') { b.act = 'charge'; b.ct = 0.7; b.vx = b.f * 900; this.attack(b, { k: 'charge', vx: b.vx, len: 0.7 }); return; }
        b.act = null;
      }
      return;
    }
    if (!tgt) { b.vx = 0; return; }
    const dx = tgt.x - b.x; b.f = Math.sign(dx) || b.f;
    b.vx = Math.abs(dx) > 200 ? b.f * 110 : 0; b.x = Math.max(6000, Math.min(7940, b.x + b.vx * dt));
    if ((b.cd -= dt) <= 0) {
      const r = this.rnd();
      if (Math.abs(dx) < 320 && r < 0.5) { b.act = 'slam'; b.wind = 0.9; }
      else if (r < 0.75) { b.act = 'chargeW'; b.wind = 0.6; }
      else { b.act = 'rain'; b.wind = 0.7; }
      b.cd = 2.6 + this.rnd() * 1.2;
      this.events.push({ t: 'bw', a: b.act, x: r1(b.x), f: b.f, w: b.wind });
    }
  }
  attack(m, o) { this.events.push({ t: 'a', m: m.id, x: r1(m.x), y: r1(m.y), f: m.f, dk: m.dk, ...o }); }
  // 发给一位侠客的一帧：附近的侠客、附近的妖物、妖王（全线都看得到血条）
  frameFor(id) {
    const me = this.players.get(id); if (!me) return null;
    const ps = [];
    for (const p of this.players.values()) if (p.id !== id && Math.abs(p.x - me.x) <= WL.AOI) ps.push(p);
    if (ps.length > WL.NEAR) { ps.sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x)); ps.length = WL.NEAR; }
    const b = this.boss;
    return {
      t: 'k', n: this.players.size, kills: this.kills, nb: Math.max(0, WL.BOSS_EVERY - this.sinceBoss),
      p: ps.map(p => [p.id, r1(p.x), r1(p.y), r1(p.vx), p.f, p.st, r1(p.tt), p.mv, p.sk, p.sp, p.ph, Math.round(p.hp), Math.round(p.mh)]),
      m: this.mons.filter(m => Math.abs(m.x - me.x) <= WL.AOI + 300).map(m => [m.id, m.key, r1(m.x), r1(m.y), Math.ceil(m.hp), m.mh, m.f, m.wind > 0 || m.act === 'dive' ? 1 : 0, m.zi]),
      b: b ? [b.id, r1(b.x), Math.ceil(b.hp), b.mh, b.f, b.act || '', Math.round(b.life)] : null,
      r: this.rgView(id),
    };
  }
  /* ---------- 全服肉鸽的共享进程 ---------- */
  real() { return new Set([...this.players.values()].map(p => p.uid || 'g' + p.id)).size; }
  needOf() { return Math.min(RG.NEED_MAX, RG.NEED0 + RG.NEED_PER * this.players.size); }
  rgView(id) {
    const R = this.run, v = R.vote, k = R.key, me = this.players.get(id);
    return {
      c: R.cyc, j: R.jie, g: R.got, nd: R.need, pk: R.perks, n: this.real(),
      v: v ? { o: v.opts, u: Math.max(0, Math.ceil(v.until - this.t)), n: v.opts.map((_, i) => Object.values(v.votes).filter(x => x === i).length), my: v.votes[id] === undefined ? -1 : v.votes[id] } : null,
      k: k ? { kind: k.kind, s: k.seq, h: k.heroes, hp: Math.ceil(k.hp), mh: k.mh, u: Math.max(0, Math.ceil(k.until - this.t)), my: me ? Math.round(me.keyDmg) : 0 } : null,
    };
  }
  // 这一劫斩够了：在场的人都记一劫；还没到最后一劫就投票选秘卷，到了就开关键战
  jieDone() {
    const R = this.run;
    for (const p of this.players.values()) p.jies++;
    if (R.jie < RG.JIE) this.startVote(); else this.startKey();
    this.dirty = true;
  }
  startVote() {
    const pool = RG.PERKS.filter(id => !this.run.perks.includes(id)), opts = [];
    while (opts.length < 3 && pool.length) opts.push(pool.splice((this.rnd() * pool.length) | 0, 1)[0]);
    this.run.vote = { opts, until: this.t + RG.VOTE_T, votes: {} };
    this.events.push({ t: 'rv', all: true });
  }
  vote(id, i) {
    const v = this.run.vote; i = +i;
    if (!v || !this.players.has(id) || !(i >= 0 && i < v.opts.length) || (i | 0) !== i) return false;
    v.votes[id] = i;
    if (Object.keys(v.votes).length >= this.players.size) v.until = Math.min(v.until, this.t);   // 人都投了就不用等
    return true;
  }
  endVote() {
    const R = this.run, v = R.vote, cnt = v.opts.map((_, i) => Object.values(v.votes).filter(x => x === i).length);
    const top = Math.max(...cnt), best = cnt.map((n, i) => n === top ? i : -1).filter(i => i >= 0);
    const pick = v.opts[best[(this.rnd() * best.length) | 0]];
    if (R.perks.length >= RG.PERK_MAX) R.perks.shift();   // 满了：最早的那卷让位
    R.perks.push(pick);
    R.vote = null; R.jie++; R.got = 0; R.need = this.needOf();
    this.events.push({ t: 'rp', pick, perks: R.perks, j: R.jie, all: true });
    this.dirty = true;
  }
  // 最后一劫斩完开关键战：线上真人够 RG.BOSS_MIN 位打天道 Boss（血量全线共享，赢了发星座皮肤）；
  // 不够就各自打一场 3v3 车轮战，对面是 3 位天道 AI（不发皮肤）。两种打完秘卷都保留，进下一轮
  startKey() {
    const R = this.run, n = this.real(), boss = n >= RG.BOSS_MIN;
    const bag = C.HERO_IDS.slice(), heroes = [];
    while (heroes.length < 3) heroes.push(bag.splice((this.rnd() * bag.length) | 0, 1)[0]);
    const mh = boss ? RG.BOSS_HP * n : 0, T = boss ? RG.BOSS_T : RG.TRIO_T;
    R.key = { kind: boss ? 'boss' : 'trio', seq: ++R.seq, heroes, mh, hp: mh, t0: this.t, until: this.t + T, dmg: {}, in: {}, rep: {} };
    for (const p of this.players.values()) { p.keyDmg = 0; p.keyIn = this.t; }
    this.mons.length = 0; this.boss = null;
    this.events.push({ t: 'ks', kind: R.key.kind, all: true });
    this.dirty = true;
  }
  // 车轮战打完了：网页报输赢。进过场的人都报了（走了的不等）就收场，有一个人赢了就算赢
  keyReport(id, seq, w) {
    const k = this.run.key;
    if (!k || k.kind !== 'trio' || k.seq !== +seq || !this.players.has(id) || id in k.rep) return false;
    k.rep[id] = w ? 1 : 0; k.in[id] = 1;
    const left = Object.keys(k.in).filter(x => this.players.has(+x) && !(x in k.rep));
    if (!left.length) this.endKey(Object.values(k.rep).some(Boolean));
    return true;
  }
  // 关键战里交伤害：要是这一场、开战（或进场）三秒后才算，总数不超过 (进场秒数 - 3) × 每秒上限
  keyHit(id, seq, d) {
    const k = this.run.key, p = this.players.get(id); d = +d;
    if (!k || k.kind !== 'boss' || k.seq !== +seq || !p || !(d > 0) || k.hp <= 0) return 0;
    if (!p.keyIn || p.keyIn < k.t0) { p.keyIn = this.t; p.keyDmg = 0; }   // 中途进来的从进来那一刻算
    const cap = Math.max(0, (this.t - p.keyIn - 3) * RG.KEY_DPS) - p.keyDmg;
    d = Math.min(d, RG.KEY_HIT_MAX, cap); if (d <= 0) return 0;
    p.keyDmg += d; k.hp -= d;
    const who = p.uid || 'g' + p.id; k.dmg[who] = (k.dmg[who] || 0) + d;
    if (k.hp <= 0) this.endKey(true);
    return d;
  }
  endKey(win) {
    const R = this.run, k = R.key; if (!k) return;
    k.hp = Math.max(0, k.hp);
    let top = [];
    if (k.kind === 'boss') {
      top = Object.entries(k.dmg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => {
        const p = [...this.players.values()].find(q => (q.uid || 'g' + q.id) === w); return [p ? p.name : '已离开的侠客', Math.round(n)];
      });
      if (win) this.payout(k);
    } else top = Object.entries(k.rep).filter(([, w]) => w).slice(0, 5).map(([id]) => { const p = this.players.get(+id); return [p ? p.name : '已离开的侠客', 1]; });
    this.events.push({ t: 'ke', kind: k.kind, win: !!win, top, all: true });
    R.key = null; R.cyc++; R.jie = 1; R.got = 0; R.need = this.needOf();   // 秘卷保留，下一轮
    for (const p of this.players.values()) { p.jies = 0; p.keyDmg = 0; }
    this.dirty = true;
  }
  // 谁能拿星座皮肤：云端账号、注册满 RG.MIN_AGE_H 小时、这一轮在场至少 RG.MIN_JIE 劫、伤害至少平均份额的 RG.MIN_SHARE。
  // 每号每天只发 RG.ZOD_PER_DAY 件由写 gift 表时的编号保证（见 rgPay）
  payout(k) {
    const now = Date.now(), parts = Object.keys(k.dmg).length || 1, fair = k.mh / parts, seen = new Set();
    for (const p of this.players.values()) {
      if (!p.uid || seen.has(p.uid)) continue;
      const dmg = k.dmg[p.uid] || 0;
      if (now - p.born < RG.MIN_AGE_H * 3600e3 || p.jies < RG.MIN_JIE || dmg < fair * RG.MIN_SHARE) continue;
      seen.add(p.uid); this.rewards.push({ uid: p.uid, dmg: Math.round(dmg), cyc: this.run.cyc });
    }
  }
  rgStep() {
    const R = this.run;
    if (R.vote && this.t >= R.vote.until) this.endVote();
    const k = R.key;
    if (k && k.kind === 'trio' && Object.keys(k.rep).length && Object.keys(k.in).every(x => x in k.rep || !this.players.has(+x))) this.endKey(Object.values(k.rep).some(Boolean));   // 没报的人走了
    else if (k && this.t >= k.until) this.endKey(false);
  }
  // 存进 Durable Object 存储 / 从存储读回来（关键战不存：重启就算这一场没打完）
  saveRun() { const R = this.run; return { cyc: R.cyc, jie: R.jie, got: R.got, need: R.need, perks: R.perks.slice(), seq: R.seq, at: Date.now() }; }
  loadRun(o) {
    if (!o || Date.now() - (+o.at || 0) > RG.EMPTY_RESET) return;
    const R = this.run;
    R.cyc = wlNum(o.cyc, 1, 1e6, 1) | 0; R.jie = wlNum(o.jie, 1, RG.JIE, 1) | 0; R.got = wlNum(o.got, 0, RG.NEED_MAX, 0) | 0; R.need = wlNum(o.need, 1, RG.NEED_MAX, RG.NEED0) | 0;
    if (R.got >= R.need) R.got = R.need - 1;   // 存档时正在打关键战（关键战不存）：再斩一只就重开
    R.perks = Array.isArray(o.perks) ? o.perks.filter(id => RG.PERKS.includes(id)).slice(-RG.PERK_MAX) : []; R.seq = wlNum(o.seq, 0, 1e9, 0) | 0;
  }
  // 这一拍的事件谁该收到：全线播报的人人都收，其余只发给附近的侠客
  takeEvents() { const e = this.events; this.events = []; return e; }
  wants(id, ev) { const me = this.players.get(id); return !!me && (ev.all || ev.x === undefined || Math.abs(ev.x - me.x) <= WL.AOI + 300); }
}

export class WorldLine {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sim = new WorldSim(); this.timer = 0; this.emptyAt = 0;
    if (ctx.storage && ctx.blockConcurrencyWhile) ctx.blockConcurrencyWhile(async () => { try { this.sim.loadRun(await ctx.storage.get('run')); } catch (e) {} });
  }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const line = wlNum(new URL(request.url).pathname.split('/').pop(), 1, 9999, 1) | 0;
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ line, id: 0 });
    if (this.ctx.getWebSockets().length > WL.CAP) { this.send(server, { t: 'full', line }); server.close(4001, 'full'); }
    return new Response(null, { status: 101, webSocket: client });
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) {} }
  sockOf(id) { for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a && a.id === id) return ws; } return null; }
  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 2000) return;
    let o; try { o = JSON.parse(data); } catch (e) { return; }
    if (!o || typeof o !== 'object') return;
    const a = ws.deserializeAttachment() || { line: 1, id: 0 }, sim = this.sim;
    const now = Date.now();   // 一个连接每秒最多认 25 条，多的直接丢
    if (now - (a.rt || 0) > 1000) { a.rt = now; a.rn = 0; }
    if (++a.rn > 25) { ws.serializeAttachment(a); return; }
    if (o.t === 'hi') {
      if (a.id && sim.players.has(a.id)) { ws.serializeAttachment(a); return; }
      const id = sim.join(o);
      if (!id) { this.send(ws, { t: 'full', line: a.line }); ws.close(4001, 'full'); return; }
      if (sim.players.size === 1 && this.emptyAt && Date.now() - this.emptyAt > RG.EMPTY_RESET) sim.run = rgNew();   // 整条线空了很久：进度清零
      a.id = id; ws.serializeAttachment(a);
      if (o.tk && this.env && this.env.DB) this.auth(id, String(o.tk).slice(0, 200));
      const roster = [...sim.players.values()].map(p => sim.meta(p));
      this.send(ws, { t: 'w', id, line: a.line, cap: WL.CAP, w: WL.W, roster });
      sim.events.push({ t: 'j', p: sim.meta(sim.players.get(id)), all: true });
      this.ensureTimer();
      return;
    }
    ws.serializeAttachment(a);
    if (!a.id || !sim.players.has(a.id)) { this.send(ws, { t: 're' }); return; }   // 服务器重启过：请网页重新打个招呼
    if (o.t === 's') sim.state(a.id, o);   // 位置和这一拍打出的伤害一起上报（h: [[妖物编号, 伤害], ...]），省一半消息
    if ((o.t === 's' || o.t === 'h') && Array.isArray(o.h)) for (const h of o.h.slice(0, 12)) if (Array.isArray(h)) sim.hit(a.id, +h[0], +h[1]);
    if (o.t === 'v') sim.vote(a.id, o.i);
    if (o.t === 'kd') sim.keyHit(a.id, o.s, o.d);
    if (o.t === 'kr') sim.keyReport(a.id, o.s, o.w);
  }
  // 登录令牌 → 云端账号（和 HTTP 接口同一张 sessions 表）；被封的号不认
  async auth(id, tk) {
    try {
      const now = Date.now();
      const r = await sessionOf(this.env, String(tk || ''), 'u.id AS id, u.username AS username, u.created_at AS created_at', now);
      if (r && !(await banOf(this.env, r.id, now))) this.sim.setAuth(id, r.id, r.created_at);
    } catch (e) {}
  }
  // 发星座皮肤：写进 gift 表（玩家下次动武库时自动领，走 C.addItem，和开箱拿到的一样）。
  // 编号是「rz + 北京日期 + 第几件 + uid」，INSERT OR IGNORE：同一天重复写、并发写都只有 RG.ZOD_PER_DAY 件
  async pay(list) {
    const env = this.env; if (!env || !env.DB) return;
    const now = Date.now(), day = C.day(now), all = ZOD_KEYS();
    for (const w of list) {
      try {
        const have = await env.DB.prepare("SELECT COUNT(*) AS n FROM gift WHERE uid = ? AND id LIKE ?").bind(w.uid, `rz${day}_%`).first();
        const n = (have && have.n) || 0; if (n >= RG.ZOD_PER_DAY) continue;
        const e = await env.DB.prepare('SELECT state_json FROM econ WHERE uid = ?').bind(w.uid).first();
        const own = new Set(((parseObj(e && e.state_json) || {}).inv || []).map(x => x && x.k));
        const fresh = all.filter(k => !own.has(k)), pool = fresh.length ? fresh : all, k = pool[Math.floor(rnd() * pool.length)];
        await env.DB.batch([
          env.DB.prepare('INSERT OR IGNORE INTO gift (id, uid, ink, items_json, note, by, at, until, born) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(`rz${day}_${n}_${w.uid}`, w.uid, RG.INK, JSON.stringify({ skin: k }), `全服肉鸽 · 天道 Boss 讨伐大捷`, 'rouge', now, now + 30 * DAY_MS, now),
          logStmt(env, w.uid, now, 'rouge_zod', 1, null, null, JSON.stringify({ k, dmg: w.dmg, cyc: w.cyc })),
        ]);
      } catch (e) { console.error('rouge pay', e); }
    }
  }
  async webSocketClose(ws) { this.drop(ws); }
  async webSocketError(ws) { this.drop(ws); }
  drop(ws) {
    const a = ws.deserializeAttachment();
    if (a && a.id && this.sim.players.has(a.id)) { this.sim.leave(a.id); this.sim.events.push({ t: 'l', id: a.id, all: true }); }
  }
  ensureTimer() { if (!this.timer) this.timer = setInterval(() => this.tick(), WL.TICK); }
  tick() {
    const sim = this.sim;
    sim.step(WL.TICK / 1000);
    const evs = sim.takeEvents();
    if (sim.rewards.length) { const list = sim.rewards; sim.rewards = []; this.paying = this.pay(list); }
    if (sim.dirty && this.ctx.storage) { sim.dirty = false; this.ctx.storage.put('run', sim.saveRun()).catch(() => {}); }
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment(); if (!a || !a.id) continue;
      if (!sim.players.has(a.id)) { this.send(ws, { t: 're' }); continue; }
      const fr = sim.frameFor(a.id), mine = evs.filter(e => sim.wants(a.id, e));
      if (mine.length) fr.e = mine;
      this.send(ws, fr);
    }
    if (!sim.players.size) { clearInterval(this.timer); this.timer = 0; this.emptyAt = Date.now(); if (this.ctx.storage) this.ctx.storage.put('run', sim.saveRun()).catch(() => {}); }   // 没人了：停表，让它休眠
  }
}
globalThis.RenyingWorldSim = { WorldSim, WL, RG };

export default {
  fetch: withCors,
};

async function route(request, env, ctx, rid = reqId()) {
    if (!env.DB) {
      return error('D1 Database binding "DB" is missing in Worker configuration.', 500);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const now = Date.now();

    try {
      // 江湖共斗 · 开放世界：交给这一线的 Durable Object（不碰 D1）。没部署 WORLD 绑定时回 503，网页会提示服务器还没更新
      const wm = path.match(/^\/api\/world\/line\/(\d{1,4})$/);
      if (wm) {
        if (!env.WORLD) return error('开放世界还没部署', 503);
        if (request.headers.get('Upgrade') !== 'websocket') return json({ ok: true, world: true, cap: WL.CAP });
        const n = Math.max(1, Math.min(9999, +wm[1] || 1));
        return env.WORLD.get(env.WORLD.idFromName('line-' + n)).fetch(request);
      }

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

      // 联机打洞用的 ICE 列表：平时只有 STUN；Even 在 Cloudflare 开了 TURN 并设好 TURN_KEY_ID / TURN_KEY_API_TOKEN 两个 Secret 后，
      // 每次给一份几小时就过期的 TURN 凭据（直连打不通时走中转）。拿 TURN 失败也照样回 STUN，网页不会因此连不上
      if (path === '/api/ice' && request.method === 'GET') {
        if (!(await hit(env, 'ice:' + ip, 60, 3600e3, now))) return error('请求太频繁了，过一会儿再试', 429);
        return json(await iceServers(env));
      }

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
        const pwr = await makePassword(env, { username }, password, now);

        // Default or initial guest profile
        const initialProf = cleanInitial((body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)) ? body.profile : newProfile(username, now));
        initialProf.name = username;
        initialProf.updatedAt = now;

        try {
          await env.DB.prepare(
            'INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at, password_algo, password_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(userId, username, pwr.hash, pwr.salt, JSON.stringify(initialProf), now, now, pwr.algo, now).run();
        } catch (e) {
          // 两个人同时注册同一个昵称：上面的查询都没查到，后到的那个在这里撞上唯一约束
          if (/UNIQUE/i.test(String(e && e.message))) return error('该昵称已被注册，请直接点击“登录”');
          throw e;
        }

        const token = await newSession(env, { id: userId, username }, now);   // 30 天有效

        const out = await profileOut(env, { id: userId, username, profile_json: JSON.stringify(initialProf) }, now);
        return json({
          ok: true,
          uid: userId,
          username,
          token,
          profile: out.profile,
          ledger: out.ledger,
          prog: out.prog
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
          'SELECT id, username, password_hash, salt, password_algo, profile_json FROM users WHERE username = ?'
        ).bind(username).first();

        if (!user) {
          await hit(env, ipKey, 1e9, 15 * 60e3, now);
          return error('未找到该账号，请先点击“注册”', 404);
        }

        if (!(await checkPassword(user, password))) {
          await fail();
          return error('昵称或密码不对', 401);
        }
        await env.DB.prepare('DELETE FROM rate WHERE k = ?').bind(nameKey).run();
        // 老办法存的密码（或者次数比现在少）：趁着知道原文换成现在的。WHERE 带上旧 hash：这期间管理员刚重设过就不覆盖
        if (user.password_algo !== PW_ALGO && await flagOn(env, 'auth.pbkdf2', user, now)) {
          const pwr = await makePassword(env, user, password, now);
          await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, password_algo = ?, password_updated_at = ? WHERE id = ? AND password_hash = ?')
            .bind(pwr.hash, pwr.salt, pwr.algo, now, user.id, user.password_hash).run();
        }

        const token = await newSession(env, user, now);

        const out = await profileOut(env, user, now);
        return json({
          ok: true,
          uid: user.id,
          username: user.username,
          token,
          profile: out.profile,
          ledger: out.ledger,
          prog: out.prog
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
          ledger: out.ledger,
          prog: out.prog
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

      // 网页报上来的错误（不用登录）
      if (path === '/api/err' && request.method === 'POST') return await errReport(env, request, ip, now);

      // 10. 在线人数（不用登录，游客也算）
      if (path === '/api/presence' && request.method === 'POST') {
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await presence(env, body, ip, now);
      }

      // 11. 天魔讨伐：看天魔不用登录；出战、交伤害要云端账号
      if (path === '/api/gboss' && request.method === 'GET') {
        if (!(await hit(env, 'gbg:' + ip, 120, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        const auth = await authenticate(env, request);
        return json(await gbState(env, await gbNow(env, now), auth && auth.user.id, now));
      }
      if ((path === '/api/gboss/start' || path === '/api/gboss/hit') && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) return error('登录云端账号才能出战', 401);
        if (path === '/api/gboss/start') return await gbStart(env, auth, now);
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await gbHit(env, auth, body, now);
      }

      // 12. 侠客列传的江湖足迹：看不用登录，记要云端账号
      if (path === '/api/saga' && request.method === 'GET') {
        if (!(await hit(env, 'sgg:' + ip, 120, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        const hero = String(url.searchParams.get('hero') || '');
        if (!C.HERO_IDS.includes(hero)) return error('没有这位侠客');
        return json(await sagaFoot(env, hero));
      }
      if (path === '/api/saga' && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) return error('未登录或登录已过期，请重新登录', 401);
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await sagaMarkPost(env, auth, body, now);
      }

      // 14. 功能开关（不用登录；带登录凭证时 Dev 账号能看到“只开 Dev”的）
      if (path === '/api/flags' && request.method === 'GET') {
        if (!(await hit(env, 'flg:' + ip, 60, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        const auth = await authenticate(env, request);
        return json({ ok: true, flags: await flagsFor(env, auth && auth.user, now) });
      }

      // 13. 排行榜（不用登录）：段位榜是这个赛季打满定级赛的，按段位分排；战绩榜按联机胜场排。被封的号不上榜
      if (path === '/api/leaderboard' && request.method === 'GET') {
        if (!(await hit(env, 'lbg:' + ip, 30, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        const auth = await authenticate(env, request);
        const kind = url.searchParams.get('k') === 'wins' ? 'wins' : 'rank';
        return json(await leaderboard(env, kind, String(url.searchParams.get('s') || ''), auth && auth.user.id, now));
      }

      // 9. Logout
      if (path === '/api/logout' && request.method === 'POST') {
        const token = getBearerToken(request);
        if (token) {
          await env.DB.prepare('DELETE FROM sessions WHERE token IN (?, ?)').bind(await tokenKey(token), PLAIN_TOKEN.test(token) ? token : '-').run();
        }
        return json({ ok: true });
      }

      return error('Not found', 404);
    } catch (err) {
      console.error('Worker error:', rid, err);
      const p = errRecord(env, 'server', { msg: (err && (err.message || err.name)) || String(err), src: request.method + ' ' + path.replace(/\d+/g, ':n'), stack: err && err.stack, meta: { rid } }, Date.now()).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(p);
      return error(`服务器内部错误（编号 ${rid}）`, 500, { rid });
    }
}
