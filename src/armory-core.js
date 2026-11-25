/* =====================================================================
   刃影武库 · 规则核心
   ---------------------------------------------------------------------
   浏览器（src/armory.js）和云端（cloudflare/worker.js）共用这一份规则：
   收藏品和武器箱、品质与概率、开箱次数、斩数、货郎、商店（武器箱和货郎按固定价格卖）、
   玩家市场（只有玩家之间买卖饰品，价格由玩家自己定）、熔铸契、对局掉落、每周补给、江湖行动。
   这里不碰页面，只改传进来的存档对象 s，所以同一份代码在服务器上跑出来的结果和本机一模一样。
   连上新版云端时，开箱、买卖、熔铸都由服务器算（随机数也在服务器上取），本机只负责显示。
   玩家市场的挂单放在服务器的 mkt 表里：挂单、购买、撤单时服务器把那一单交给这里（env.mkt），
   这里定下来要怎么改（env.mkt.out），服务器再和存档一起原子地写进去。
   所有数据表都冻结了，控制台改不动概率和价格。
   文件结构：数据表（品质、武器箱、货郎、星座） → 在线可调的经济数值 → 小工具 → 价格
     → 存档（读、校验、升级） → 物品进出库存 → 动作（开箱、买卖、熔铸、掉落、补给、江湖行动）。
   找 bug 提示：这份代码会被 tools/build.py 原样嵌进 cloudflare/worker.js，改了要重新构建，
     本机和服务器的结果才一致；动作出错先跑 node tools/tests/test-cloud.mjs（里面有经济测试）。
   ===================================================================== */
(function (G) {
  'use strict';
  const C = {};
  C.VER = 5;                                   // 5：加入武学徽记和架势进度（4：市场只剩玩家之间买卖，武器箱和货郎改成商店固定价格）
  C.UNIVERSAL_PROMO_CODE = 'RENYINGALL';       // 全服通用全内容解锁兑换码（动态同步所有侠客、皮肤、徽记、灵宠、招式流派与资源，兼容未来更新）
  C.HEIRLOOM_PROMO_CODE = 'TGCS9K4V7Q2M8X';    // 天工传世典藏专属密钥
  C.UNIVERSAL_PROMO_INK = 100000;
  C.UNIVERSAL_PROMO_CASES = 10;
  C.DAY0 = 20748;                              // 北京时间 2026-10-22，第一个行动季第一天
  C.SEASON_DAYS = 32;
  C.INV_MAX = 1000000000, C.HIST_MAX = 40;
  // 玩家市场同时挂几单不设上限（和库存一样，挂出去的饰品只是从库存挪到挂单，存档不会因此变大多少）。
  // 单次批量挂牌不再受 50 件硬性上限约束：
  C.LIST_BATCH = 500;   // 一键挂牌单次可处理大批量重复饰品
  C.LIST_CHECK = 90;   // 每次操作最多核对几单挂单还在不在卖（从最早挂的开始，快到期的先核对；D1 一条查询最多 100 个参数）
  C.MKT_DAYS = 14;   // 挂单默认挂几天：过期没卖出去的自动撤回，饰品回到卖家库存（管理员可以在线改 mktDays）
  C.FEE = 0.15;                                // 玩家市场成交扣的手续费（墨锭从这里流出去，免得越攒越多）
  C.PRICE_MAX = 999999;                        // 挂单标价 1 ~ 999999 墨锭，多少由玩家自己定，系统不定价、也不收购
  C.OPEN_DAY = 5;                              // 普通武器箱每天最多开 5 个（北京时间零点刷新）
  C.PREM_DAY = 3;                              // 神兵武器箱每天最多开 3 个（北京时间零点刷新），不占普通武器箱每天那 5 个
  C.PREM_WEEK = 3;                             // 兼容别名
  C.ZOD_WEEK = 1;                              // 星座武器箱也是每周 1 个，和神兵的分开算；每个号送 1 个
  C.HEIR_WEEK = 1;                             // 天工传世匣每周限启 1 匣（全 20 款仅存斩数版）
  C.DROP_P = 0.15, C.DROP_CAP = 4, C.SUPPLY_GAMES = 5;
  C.MATCH_MIN_MS = 20000, C.MATCH_MAX_MS = 45 * 60000, C.MATCH_GAP_MS = 15000, C.MATCH_DAY_CAP = 60;
  C.KO_MAX = 12;                               // 一局最多记 12 斩（三人车轮战也够了）
  C.HERO_IDS = ['qingfeng', 'feiying', 'tieshan', 'lingshuang', 'liuyun', 'leiming', 'moyu', 'yuehua', 'yanling', 'yuxiao', 'zuixian', 'gouchen', 'lingque', 'liying', 'cixian', 'qianji', 'chixiao', 'xuanji', 'qingluan', 'xuanwu'];
  C.MODES = ['cpu', 'net', '2v2', 'tower', 'chaos', 'tag3', 'mayhem', 'melee', 'ctf', 'gauntlet'];
  C.LEVELS = ['easy', 'normal', 'hard', 'impossible', 'god'];
  C.BADGE_CATS = { all: '全部', offense: '进攻', defense: '防御', mobility: '身法', mastery: '绝技', team: '团队' };
  C.BADGE_RARITIES = { all: '全部品阶', legend: '绝世', epic: '奇珍', rare: '精良' };
  C.BADGE_RARITY_RANK = { rare: 1, epic: 2, legend: 3 };
  C.BADGES = {
    flowing: { name: '连势', cat: 'offense', rarity: 'rare', desc: '连续普攻第 3 击命中后，可在收招时冲刺追步；紫金阶可改接技能。', en: 'Flow', effect: 'normal', ach: '累计完成 50 次 5 连击' },
    focus: { name: '凝锋', cat: 'offense', rarity: 'rare', desc: '蓄力斩命中后，下一次格挡交锋会减少击退；紫金阶技能也可承接。', en: 'Focus', effect: 'charged', ach: '累计蓄力斩命中 30 次' },
    riposte: { name: '回锋', cat: 'defense', rarity: 'epic', desc: '精准招架后，限时重击会向前踏进，抓住反击时机。', en: 'Riposte', effect: 'parry', ach: '累计完成 20 次精准招架' },
    breaker: { name: '破军', cat: 'offense', rarity: 'epic', desc: '破防后立刻重置冲刺冷却，下一次冲刺可更快追击；紫金阶也可选重击踏进。', en: 'Breaker', effect: 'break', ach: '累计破防对手 25 次' },
    ascent: { name: '凌空', cat: 'mobility', rarity: 'epic', desc: '腾空攻击命中后可续一次空中冲刺；紫金阶可接空中技能。', en: 'Ascent', effect: 'air', ach: '累计空中连段命中 40 次' },
    pursuit: { name: '追影', cat: 'mobility', rarity: 'rare', desc: '闪避后命中，可在收招时冲刺退步；紫金阶退步带短暂无敌。', en: 'Pursuit', effect: 'dash', ach: '累计闪避反击 30 次' },
    ironwall: { name: '铁壁', cat: 'defense', rarity: 'epic', desc: '连续格挡 3 次后，下一次反击附带短暂霸体护身。', en: 'Ironwall', effect: 'guard', ach: '单局格挡 15 次攻击' },
    tempest: { name: '疾电', cat: 'mastery', rarity: 'epic', desc: 'Q/R 技能命中后，下一次普攻起手提速并延长追击窗口。', en: 'Tempest', effect: 'skill', ach: '累计技能命中 80 次' },
    bloodlust: { name: '血怒', cat: 'offense', rarity: 'legend', desc: '气血低于 35% 时，命中回复少量气血并额外积攒真气。', en: 'Bloodlust', effect: 'lowhp', ach: '残血反杀 10 场对局' },
    phantom: { name: '绝影', cat: 'mobility', rarity: 'rare', desc: '虚招翻滚（C）后 1.2 秒内首次命中伤害提升。', en: 'Phantom', effect: 'feint', ach: '累计虚招翻滚反击 25 次' },
    resonance: { name: '共鸣', cat: 'mastery', rarity: 'epic', desc: '发动灵宠秘技（V）后，立刻缩短 Q/R 技能剩余冷却。', en: 'Resonance', effect: 'pet', ach: '累计发动灵宠秘技 30 次' },
    skybreaker: { name: '破穹', cat: 'mobility', rarity: 'legend', desc: '空中蓄力斩命中后，重置空中跳跃与冲刺次数。', en: 'Skybreaker', effect: 'aircharge', ach: '累计空中蓄力斩命中 20 次' },
    juggernaut: { name: '镇岳', cat: 'defense', rarity: 'legend', desc: '霸体硬扛受击后，下一次重击或蓄力斩威力增强。', en: 'Juggernaut', effect: 'armor', ach: '霸体承伤反击 25 次' },
    vanguard: { name: '同心', cat: 'team', rarity: 'rare', desc: '多人团战中协同命中敌人时，为己方附近队友回复真气。', en: 'Vanguard', effect: 'team', ach: '参与 10 场大型团战胜利' },
    iaido: { name: '居合', cat: 'mastery', rarity: 'legend', desc: '居合斩穴（O）瞬拔命中后，额外延长点穴封脉时长并回气。', en: 'Iaido', effect: 'iaido', ach: '累计触发 20 次居合瞬拔' },
    meridian: { name: '点穴', cat: 'mastery', rarity: 'epic', desc: '对被点穴封脉的目标追加打击时，额外削减架势并触发震气。', en: 'Meridian', effect: 'acupoint', ach: '累计点穴封脉 30 次' },
    grapple: { name: '擒龙', cat: 'offense', rarity: 'epic', desc: '擒拿投技（H）得手后，落地瞬间重置闪避冷却并提升追击伤害。', en: 'Grapple', effect: 'grapple', ach: '累计擒拿投技命中 20 次' },
    execution: { name: '斩魄', cat: 'offense', rarity: 'legend', desc: '对手气血低于 25% 时，重击与奥义额外附带斩杀破防威力。', en: 'Execution', effect: 'execute', ach: '累计完成 60 次终结击倒' },
    aegis: { name: '玄盾', cat: 'defense', rarity: 'epic', desc: '聚气弹反（F）成功后，获得短时减伤护盾并回复架势值。', en: 'Aegis', effect: 'qiparry', ach: '累计聚气弹反成功 20 次' },
    steadfast: { name: '磐石', cat: 'defense', rarity: 'rare', desc: '受击倒地起身时，震开贴身敌人并缩短起身僵直。', en: 'Steadfast', effect: 'getup', ach: '完成 30 场无破防对局' },
    windstep: { name: '御风', cat: 'mobility', rarity: 'rare', desc: '墙面蹬跳与轻功腾跃后，2 秒内移动与突进速度提升。', en: 'Windstep', effect: 'wall', ach: '累计高空滞空连招 30 次' },
    mirage: { name: '幻步', cat: 'mobility', rarity: 'epic', desc: '连续两次闪避或翻滚后，下一次轻击突进距离显著延长。', en: 'Mirage', effect: 'evade', ach: '单局无伤闪避 10 次攻击' },
    momentum: { name: '千钧', cat: 'offense', rarity: 'epic', desc: '高速冲刺或高空下坠命中时，按动量额外放大击退与伤害。', en: 'Momentum', effect: 'velocity', ach: '累计高速重击破敌 40 次' },
    harmony: { name: '太和', cat: 'mastery', rarity: 'rare', desc: '战斗中切换二式架势时，立即回复少量架势值并获得短暂加速。', en: 'Harmony', effect: 'stance', ach: '解锁 5 位侠客的第二架势' },
    sovereign: { name: '天威', cat: 'mastery', rarity: 'legend', desc: '释放奥义（E）后无论是否命中，返还部分真气并强化下一次技能。', en: 'Sovereign', effect: 'ult', ach: '累计释放奥义 50 次' },
    warbanner: { name: '战旗', cat: 'team', rarity: 'epic', desc: '发动战意号令（T）时，附近队友同步获得攻防增幅与霸体微盾。', en: 'Warbanner', effect: 'rally', ach: '在 8v8 团战中发动号令 20 次' },
    guardian: { name: '护法', cat: 'team', rarity: 'epic', desc: '在己方残血队友附近格挡或弹反成功时，为队友分担并回复气血。', en: 'Guardian', effect: 'protect', ach: '在 2v2 或 8v8 中救援队友 15 次' },
    synergy: { name: '合击', cat: 'team', rarity: 'legend', desc: '接续队友连段命中同一敌人时，触发合击破甲并大幅积攒真气。', en: 'Synergy', effect: 'assist', ach: '触发 30 次团队合击连携' },
    bloodmoon: { name: '血月', cat: 'offense', rarity: 'legend', desc: '达成 6 连击以上或残血命敌时，触发血月汲取，回血并大幅削减敌方架势。', en: 'Blood Moon', effect: 'bloodmoon', ach: '单局打出 12 连击并获胜' },
    sunder: { name: '裂甲', cat: 'offense', rarity: 'epic', desc: '重击或蓄力斩命中格挡目标时，额外削减大量架势并延长破防僵直。', en: 'Sunder', effect: 'sunder', ach: '累计重击压制格挡 50 次' },
    frostbite: { name: '寒锋', cat: 'offense', rarity: 'rare', desc: '门派技能或重击命中时，为目标附加短时霜冻减速，压制对手走位。', en: 'Frostbite', effect: 'frostbite', ach: '累计减速控敌 40 次' },
    lotus: { name: '莲华', cat: 'defense', rarity: 'legend', desc: '精准招架成功瞬间绽放护体莲华，回复气血并震开贴身敌手。', en: 'Lotus Ward', effect: 'lotus', ach: '单局完成 4 次精准招架' },
    mirror: { name: '镜反', cat: 'defense', rarity: 'epic', desc: '格挡远程招式或暗器时，回复额外真气并反震护体。', en: 'Mirror Guard', effect: 'mirror', ach: '累计格挡飞行物 40 次' },
    bulwark: { name: '铜墙', cat: 'defense', rarity: 'rare', desc: '气血低于 40% 时，持续稳固架势并在脱战时快速回复护体值。', en: 'Bulwark', effect: 'bulwark', ach: '承受 5000 点伤害仍赢得对局' },
    cloudstep: { name: '踏云', cat: 'mobility', rarity: 'epic', desc: '高空二段跳或穿台下落后，获得短时轻功加速与冲刺减耗。', en: 'Cloudstep', effect: 'cloudstep', ach: '累计多层平台连段 30 次' },
    gale: { name: '乘风', cat: 'mobility', rarity: 'rare', desc: '冲刺绕背或迅步穿身时，立获真气补给并缩短闪避冷却。', en: 'Gale Stride', effect: 'gale', ach: '累计绕背追击 35 次' },
    blink: { name: '缩地', cat: 'mobility', rarity: 'legend', desc: '腾空闪脱身后，立减 Q/R 技能剩余冷却并获得瞬步反击窗口。', en: 'Folded Earth', effect: 'blink', ach: '腾空闪后反杀 15 次' },
    yin_yang: { name: '阴阳', cat: 'mastery', rarity: 'legend', desc: '交替命中 Q 与 R 技能后，触发阴阳调和，大幅回气并回复架势。', en: 'Yin Yang', effect: 'yinyang', ach: '累计 Q/R 联动命中 40 次' },
    scroll: { name: '墨韵', cat: 'mastery', rarity: 'epic', desc: '奥义命中敌人时，重置空中跳跃与冲刺冷却，无缝续接追击。', en: 'Ink Scroll', effect: 'scroll', ach: '奥义终结对手 25 次' },
    spiritflow: { name: '灵息', cat: 'mastery', rarity: 'rare', desc: '脱战调息 2.5 秒后，每秒持续积攒真气与架势，掌控开团节奏。', en: 'Spirit Flow', effect: 'spiritflow', ach: '累计积攒 5000 点真气' },
    oath: { name: '结义', cat: 'team', rarity: 'legend', desc: '团战中有队友倒下或受重创时，自身立获真气爆发与霸体护身。', en: 'Sworn Oath', effect: 'oath', ach: '在大型团战中逆转获胜 10 次' },
    tactician: { name: '军师', cat: 'team', rarity: 'epic', desc: '团战命中敌手时为其施加策印，附近队友命中该目标额外回气。', en: 'Tactician', effect: 'tactician', ach: '团战累计助攻 40 次' },
  };
  C.BADGE_TIER = { silver: 1, gold: 2, purpgold: 3 };
  C.BADGE_UPGRADE = { silver: { to: 'gold', sigils: 3, ink: 2000, kos: 100 }, gold: { to: 'purpgold', sigils: 7, ink: 6000, kos: 300 } };
  C.BADGE_SIGIL_KOS = 40;
  C.BADGE_UNLOCK_INK = 1200;
  C.BADGE_UNLOCK_SIGILS = 2;

  // 灵宠系统：16 只水墨灵宠，分四大流派与三档品阶，每只具备被动增益 + V 键主动秘技 + 三阶养成（初阶/灵阶/仙阶）
  C.PET_CATS = { all: '全部', attack: '攻伐', defense: '护御', support: '辅助', control: '控场' };
  C.PET_RARITIES = { all: '全部品阶', legend: '神兽', epic: '灵兽', rare: '珍兽' };
  C.PETS = {
    inkfox: { name: '墨狐', en: 'Ink Fox', cat: 'support', rarity: 'rare', rgb: '120,235,205', passive: '连击额外回气', active: '灵狐突袭：前冲造成缓速印记' },
    tortoise: { name: '玄龟', en: 'Obsidian Tortoise', cat: 'defense', rarity: 'rare', rgb: '140,200,255', passive: '架势恢复提速', active: '玄甲护盾：获得短暂霸体与架势回复' },
    falcon: { name: '雷隼', en: 'Thunder Falcon', cat: 'attack', rarity: 'epic', rgb: '255,220,110', passive: '空中招式威力略增', active: '惊雷俯冲：电光劈向锁定目标' },
    froststag: { name: '霜鹿', en: 'Frost Stag', cat: 'support', rarity: 'epic', rgb: '160,235,255', passive: '脱战缓慢回血', active: '寒露甘泉：瞬间回复气血与架势' },
    flamelion: { name: '炎狮', en: 'Flame Lion', cat: 'attack', rarity: 'epic', rgb: '255,125,85', passive: '蓄力斩破防增强', active: '烈焰狮吼：震退近身敌众并灼烧' },
    shadowcrow: { name: '影鸦', en: 'Shadow Crow', cat: 'control', rarity: 'epic', rgb: '195,140,255', passive: '虚招与闪避冷却略减', active: '鸦影袭背：瞬闪扰敌并积攒真气' },
    jadekoi: { name: '玉鲤', en: 'Jade Koi', cat: 'support', rarity: 'rare', rgb: '115,245,175', passive: '闪避无敌略微延长', active: '跃渊清心：驱散减速灼烧并疾行' },
    mechfinch: { name: '机雀', en: 'Clockwork Finch', cat: 'attack', rarity: 'rare', rgb: '233,196,106', passive: 'Q/R 技能冷却略减', active: '连弩齐发：齐射三枚追踪机矢' },
    azure_dragon: { name: '青龙', en: 'Azure Dragon', cat: 'attack', rarity: 'legend', rgb: '70,225,255', passive: '奥义积气提速', active: '苍龙破阵：释放贯通青龙气浪击飞敌众' },
    white_tiger: { name: '白虎', en: 'White Tiger', cat: 'attack', rarity: 'legend', rgb: '240,244,255', passive: '破防与重击威力提升', active: '白虎啸天：撕裂冲击并大幅削减架势' },
    vermilion_bird: { name: '朱雀', en: 'Vermilion Bird', cat: 'support', rarity: 'legend', rgb: '255,105,75', passive: '残血时持续微幅回血', active: '涅槃烈羽：烈焰羽扇击退敌人并回复气血' },
    qilin: { name: '墨麟', en: 'Ink Qilin', cat: 'defense', rarity: 'legend', rgb: '235,195,90', passive: '受击硬直与架势损耗略减', active: '瑞麟镇煞：展开金墨护阵，霸体并回气回架势' },
    moonrabbit: { name: '玉兔', en: 'Moon Rabbit', cat: 'support', rarity: 'rare', rgb: '215,225,255', passive: '轻功跳跃与落地更灵动', active: '月华跃步：重置冲刺冷却并瞬间回气' },
    spiritcrane: { name: '灵鹤', en: 'Spirit Crane', cat: 'control', rarity: 'epic', rgb: '155,240,220', passive: '空中滞空与闪避更稳', active: '鹤唳清风：吹起浮空旋风托举近身敌手' },
    ironape: { name: '玄猿', en: 'Iron Ape', cat: 'defense', rarity: 'epic', rgb: '185,155,120', passive: '格挡消耗降低', active: '巨猿震地：砸出震荡波击退并削减架势' },
    starowl: { name: '星枭', en: 'Star Owl', cat: 'control', rarity: 'epic', rgb: '175,145,255', passive: '远程招式命中额外回气', active: '星瞳锁魂：发射两枚星弹并致缓敌手' },
  };
  C.PET_TIER = { basic: 1, spirit: 2, immortal: 3 };
  C.PET_BUY_COST = 800;
  C.PET_UPGRADE = { basic: { to: 'spirit', ink: 1500, kos: 30 }, spirit: { to: 'immortal', ink: 4000, kos: 100 } };

  // 招式自选流派：每位侠客的 Q / R / E 均可切换本宗、迅影、破军三种变式
  C.SKILL_SLOTS = ['q', 'r', 'e'];
  C.SKILL_VARIANTS = {
    std: { name: '本宗', en: 'Classic', cost: 0, kos: 0, desc: '默认均衡招式配置。' },
    swift: { name: '迅影', en: 'Swift', cost: 400, kos: 10, desc: '冷却缩短 18%，位移更灵动，单次威力略降 8%。' },
    heavy: { name: '破军', en: 'Ruin', cost: 600, kos: 25, desc: '威力提升 18% 且破防增强 25%，冷却延长 16%。' },
  };

  // 一次性、按天按周的奖励：领没领过记在武库存档的 rw 里（云端账号就是服务器上那份，玩家改不了），墨锭由这里发。
  // 本机的领取记录（localStorage）不算数：换设备、清缓存、退出再登录都领不到第二次。离线版和本机账号没有服务器，照旧本机算
  // 任务：[按天 d / 按周 w / 活动 e, 看哪个数, 要多少, 给多少墨锭]；数只认服务器记过的对局（matchEnd 带开局票的那些）
  C.TASKS = { d1: ['d', 'games', 1, 30], d2: ['d', 'combo', 5, 40], d3: ['d', 'wins', 1, 50], w1: ['w', 'games', 5, 120], w2: ['w', 'wins', 3, 180], w3: ['w', 'ults', 5, 200], e1000: ['e', 'cpu', 3, 1000] };
  C.EVENT = { start: Date.UTC(2026, 9, 21, 16), end: Date.UTC(2026, 10, 4, 16) };   // 全皮肤限免活动（和 src/game/01-core.js 的 FREE_SKIN_EVENT 一样）：活动任务、系统补偿只在这段时间能领
  C.inEvent = now => now >= C.EVENT.start && now < C.EVENT.end;
  C.RW = { comp: 500, tut: 300, star: 30, sagaNode: 40, sagaEnd: 150, sagaNodes: 5, sagaEnds: 2, stages: 5 };   // 补偿、教程、每颗关卡星、列传每节、每个结局；每部列传 5 节 2 个结局，每章 5 关

  // 品质：从低到高五档，每档有自己的颜色和名字
  C.TIERS = ['mil', 'res', 'cla', 'cov', 'gold'];
  C.TIER = {
    mil: { n: '精铁', c: '75,105,255' },
    res: { n: '碧玉', c: '136,71,255' },
    cla: { n: '灵犀', c: '211,44,230' },
    cov: { n: '赤霄', c: '235,75,75' },
    gold: { n: '★ 绝世', c: '228,174,57' },
  };
  C.ODDS = { mil: 0.53, res: 0.27, cla: 0.13, cov: 0.052, gold: 0.018 };   // 普通武器箱；神兵武器箱的写在它自己那一项里
  C.ST_P = 0.2;                                // 开出斩数版（记击倒数）的概率
  C.BASE = { mil: 30, res: 90, cla: 300, cov: 900, gold: 3200 };   // 每档的基准价（墨锭）：只用来定货郎的报价
  C.ST_UPGRADE_COST = { mil: 100, res: 250, cla: 600, cov: 1500, gold: 4000 };   // 把普通饰品升级成斩数版的固定花费（墨锭）
  // 货郎：开封后一次给你看一件、报一个价，买下就用掉；不要就换下一件，最多看 5 件，
  // 5 件都不要货郎也没了；开封 3 天不处理就作废。货郎在商店按固定价格 price 卖（不能转卖），
  // 报价是这一件基准价的 1.2~1.5 倍（按品质、热门程度、斩数定，不跟玩家市场走）
  C.TERM = { offers: 5, days: 3, odds: { mil: 0.45, res: 0.3, cla: 0.15, cov: 0.08, gold: 0.02 }, markup: [1.2, 1.5], price: 500 };

  // 新涂装：只换配色的精铁饰品 [皮肤 key, 侠客, 名字, 配色]
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
  // 武库专属的整套皮肤：五款 ★ 绝世（青锋行那款是游戏里原有的，放在江湖武器箱），后面七款只在神兵武器箱里出
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
  // 星座武器箱：十二星座，每个侠客三款，灵犀「星辉」、赤霄「星焰」、绝世「星冕」各一款，一共 36 款（皮肤本身在后面按这张表生成）
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
  // 每个侠客分到的三个星座 [灵犀, 赤霄, 绝世]：每一档里十二星座正好各一款
  C.ZOD_OF = { qf: ['pis', 'sag', 'leo'], fy: ['tau', 'aqu', 'sco'], ts: ['cap', 'leo', 'tau'], ls: ['gem', 'sco', 'sag'], ly: ['vir', 'pis', 'lib'], lm: ['leo', 'cap', 'ari'],
    my: ['aqu', 'lib', 'vir'], yh: ['lib', 'vir', 'can'], yl: ['sag', 'ari', 'gem'], yx: ['can', 'gem', 'pis'], zx: ['sco', 'can', 'aqu'], gc: ['ari', 'tau', 'cap'] };
  const zodKeys = i => Object.entries(C.ZOD_OF).map(([p, z]) => `${p}_z${z[i]}`);
  // 八个武器箱，各是一套收藏品：游戏里原有的 35 款皮肤和武库的 72 款全在里面，每款只在一个箱子里。
  // 前六个是普通武器箱（爆率 C.ODDS），神兵、星座武器箱只出灵犀、赤霄、绝世三档，价钱也高，各自每周限开几个。price 是商店的固定价格。
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
    c7: { name: '神兵', price: 1000, emblem: '神', col: '240,190,80', prem: true, daily: true, ok: 'prem.', lim: 'premDay', cnt: 'pd', odds: { mil: 0, res: 0, cla: 0.7, cov: 0.22, gold: 0.08 },   // 赤霄 + 绝世一共 30%
      mil: [], res: [], cla: ['my_qinglv', 'yl_kongque', 'ly_jinli'], cov: ['ts_liuli', 'yx_tianlai'], gold: ['ls_tianhe', 'fy_huandie', 'lq_star', 'li_star', 'cx_star'] },
    c8: { name: '星座', price: 1500, emblem: '星', col: '170,150,255', prem: true, ok: 'zod.', lim: 'zodWeek', cnt: 'zw', odds: { mil: 0, res: 0, cla: 0.65, cov: 0.28, gold: 0.07 },
      mil: [], res: [], cla: zodKeys(0), cov: zodKeys(1), gold: zodKeys(2) },
    // 五套主题系列套装武器箱（精铁至赤霄四档，不含独立绝世单皮）
    c9: { name: '山海星陨', price: 320, emblem: '陨', col: '130,155,255', themed: true, odds: { mil: 0.48, res: 0.30, cla: 0.15, cov: 0.07, gold: 0 },
      mil: ['ch_sf1', 'ql_sf1', 'xj_sf1', 'xw_sf1'], res: ['qf_sf2', 'fy_sf2', 'qj_sf2'], cla: ['ch_sf3', 'xj_sf3', 'ls_sf3'], cov: ['xj_sf4', 'ch_sf4'], gold: [] },
    c10: { name: '墨韵丹青', price: 320, emblem: '丹', col: '235,95,80', themed: true, odds: { mil: 0.48, res: 0.30, cla: 0.15, cov: 0.07, gold: 0 },
      mil: ['qf_ic1', 'my_ic1', 'ql_ic1', 'xw_ic1'], res: ['ch_ic2', 'xj_ic2', 'yh_ic2'], cla: ['ql_ic3', 'my_ic3', 'li_ic3'], cov: ['ql_ic4', 'qf_ic4'], gold: [] },
    c11: { name: '沧澜雷霆', price: 320, emblem: '澜', col: '80,210,245', themed: true, odds: { mil: 0.48, res: 0.30, cla: 0.15, cov: 0.07, gold: 0 },
      mil: ['xw_st1', 'lm_st1', 'ch_st1', 'ts_st1'], res: ['xw_st2', 'ly_st2', 'cx_st2'], cla: ['xw_st3', 'lm_st3', 'gc_st3'], cov: ['xw_st4', 'lm_st4'], gold: [] },
    c12: { name: '九霄剑阁', price: 360, emblem: '霄', col: '245,205,110', themed: true, odds: { mil: 0.46, res: 0.31, cla: 0.16, cov: 0.07, gold: 0 },
      mil: ['qf_jx1', 'ls_jx1', 'yl_jx1', 'yx_jx1'], res: ['ch_jx2', 'xj_jx2', 'lq_jx2'], cla: ['qf_jx3', 'ls_jx3', 'zx_jx3'], cov: ['qf_jx4', 'xj_jx4'], gold: [] },
    c13: { name: '幽冥玄煞', price: 360, emblem: '冥', col: '185,95,255', themed: true, odds: { mil: 0.46, res: 0.31, cla: 0.16, cov: 0.07, gold: 0 },
      mil: ['fy_ym1', 'xw_ym1', 'li_ym1', 'gc_ym1'], res: ['xw_ym2', 'fy_ym2', 'qj_ym2'], cla: ['ql_ym3', 'li_ym3', 'ts_ym3'], cov: ['li_ym4', 'fy_ym4'], gold: [] },
    // 典藏至臻：天工传世 · 器灵纪（全 20 位侠客各 1 款，仅存斩数版，解锁专属攻守双境）
    c14: { name: '天工传世', price: 12000, emblem: '器', col: '218,175,92', prem: true, heirloom: true, stOnly: true, ok: 'heir.', lim: 'heirWeek', cnt: 'hw', odds: { mil: 0, res: 0, cla: 0, cov: 0, gold: 1 },
      mil: [], res: [], cla: [], cov: [],
      gold: ['qf_porcelain', 'fy_puppet', 'ts_taotie', 'ls_celadon', 'ly_embroidery', 'lm_cloisonne', 'my_woodblock', 'yh_liuli', 'yl_kingfisher', 'yx_guqin', 'zx_sancai', 'gc_kintsugi', 'lq_papercut', 'li_screen', 'cx_compass', 'qj_marionette', 'ch_ironfire', 'xj_armillary', 'ql_dunhuang', 'xw_cinnabar'] },
  };
  C.CASES = Object.keys(C.COLS);
  C.REG = C.CASES.filter(c => !C.COLS[c].prem);   // 普通武器箱与主题套装箱
  C.HEIRLOOM_KEYS = C.COLS.c14.gold.slice();
  // 爆率：cfg 是服务器上管理员改过的经济数值（见下面的 C.CFG_INFO），不传就是上面写死的
  C.oddsOf = (cid, cfg) => {
    if (C.COLS[cid] && (C.COLS[cid].themed || C.COLS[cid].heirloom)) return C.COLS[cid].odds;
    if (!cfg) return C.COLS[cid].odds || C.ODDS;
    const p = C.COLS[cid].prem && C.COLS[cid].ok;
    if (p) return { mil: 0, res: 0, cla: C.cv(cfg, p + 'cla'), cov: C.cv(cfg, p + 'cov'), gold: C.cv(cfg, p + 'gold') };
    return Object.fromEntries(C.TIERS.map(t => [t, C.cv(cfg, 'odds.' + t)]));
  };
  C.UP = { mil: 'res', res: 'cla', cla: 'cov', cov: 'gold' };
  C.NEED = { mil: 10, res: 10, cla: 10, cov: 10 };

  // 商店：改名标签（墨锭，每周限量）；武器箱和货郎按固定价格不限量（见 A.buyCase / A.buyTerm）
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
    trade: { g: 3, n: 1, star: 1, t: '签 {n} 份熔铸契' },
    sell: { g: 9, n: 1, star: 1, t: '在玩家市场卖出 {n} 件饰品' },
    buy: { g: 9, n: 1, star: 1, t: '在玩家市场买入 {n} 件饰品' },
  };
  C.STAR_SHOP = [
    { id: 'ink', cost: 1, name: '300 墨锭' },
    { id: 'case', cost: 2, name: '随机武器箱' },
    { id: 'tag', cost: 2, name: '改名标签' },
    { id: 'term', cost: 3, name: '货郎' },
    { id: 'res', cost: 5, name: '随机碧玉饰品' },
    { id: 'cla', cost: 9, name: '随机灵犀饰品' },
    { id: 'cov', cost: 15, name: '自选赤霄饰品' },
  ];

  /* ---------- 在线可调的经济数值 ---------- */
  // 管理员在服务器上改（cloudflare/worker.js 的 /api/admin/cfg），没改的项用上面写死的默认值。
  // 服务器每次算的时候把改过的那几项放进 env.cfg，网页显示用服务器发来的同一份。
  // 每一行：[键, 默认值, 最小, 最大, 是不是整数, 分组, 说明]
  C.CFG_INFO = [
    ...Object.keys(C.COLS).map(c => ['price.' + c, C.COLS[c].price, 1, 100000, 1, '商店价格', C.COLS[c].name + '武器箱']),
    ['price.term', C.TERM.price, 1, 100000, 1, '商店价格', '货郎'],
    ['openDay', C.OPEN_DAY, 0, 50, 1, '开箱', '普通武器箱每天能开几个'],
    ['premDay', C.PREM_DAY, 0, 50, 1, '开箱', '神兵武器箱每天能开几个'],
    ['premWeek', C.PREM_WEEK, 0, 20, 1, '开箱', '神兵武器箱每周能开几个（旧）'],
    ['zodWeek', C.ZOD_WEEK, 0, 20, 1, '开箱', '星座武器箱每周能开几个'],
    ['heirWeek', C.HEIR_WEEK, 0, 20, 1, '开箱', '天工传世匣每周能开几个'],
    ['stP', C.ST_P, 0, 1, 0, '开箱', '开出斩数版的概率'],
    ...C.TIERS.map(t => ['odds.' + t, C.ODDS[t], 0, 1, 0, '普通武器箱爆率', C.TIER[t].n]),
    ...C.CASES.filter(c => C.COLS[c].prem && !C.COLS[c].heirloom).flatMap(c => ['cla', 'cov', 'gold'].map(t => [C.COLS[c].ok + t, C.COLS[c].odds[t], 0, 1, 0, C.COLS[c].name + '武器箱爆率', C.TIER[t].n])),
    ['fee', C.FEE, 0, 0.5, 0, '玩家市场', '成交手续费（0.15 就是 15%）'],
    ['mktDays', C.MKT_DAYS, 1, 90, 1, '玩家市场', '挂单几天没卖出就自动撤回'],
    ['term.lo', C.TERM.markup[0], 0.5, 5, 0, '货郎', '报价最低是基准价的几倍'],
    ['term.hi', C.TERM.markup[1], 0.5, 5, 0, '货郎', '报价最高是基准价的几倍'],
    ['dropP', C.DROP_P, 0, 1, 0, '对局掉落', '每局掉一件的概率'],
    ['dropCap', C.DROP_CAP, 0, 100, 1, '对局掉落', '每周最多掉几次'],
    ['ink.base', 1500, 0, 100000, 1, '每天认多少本机收入', '每天先认多少墨锭'],
    ['ink.match', 80, 0, 10000, 1, '每天认多少本机收入', '每打完一局，当天多认多少'],
    ['ink.cap', 6000, 0, 1000000, 1, '每天认多少本机收入', '一天最多认多少'],
  ];
  C.CFG_DEF = Object.fromEntries(C.CFG_INFO.map(r => [r[0], r[1]]));
  C.cv = (cfg, k) => { const v = cfg && typeof cfg === 'object' ? own(cfg, k) : undefined; if (v !== undefined) return v; if (k === 'premDay' && cfg && typeof cfg === 'object' && own(cfg, 'premWeek') !== undefined) return own(cfg, 'premWeek'); return C.CFG_DEF[k]; };
  // 检查一份配置：只认表里有的键，数要在范围里（整数项要是整数），同一组爆率加起来要正好是 1，货郎报价的最低倍数不能高过最高倍数。
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
      if (r[4] && !Number.isSafeInteger(x)) return { cfg: null, err: `${r[6]}（${k}）要填安全整数` };
      const probability = /^(odds|prem|zod)\./.test(k) || ['stP', 'dropP', 'fee'].includes(k);
      if (x < 0 || (probability && x > 1)) return { cfg: null, err: `${r[6]}（${k}）要在有效范围之间` };
      if (x !== r[1]) cfg[k] = x;
    }
    for (const [p, name] of [['odds.', '普通武器箱'], ...C.CASES.filter(c => C.COLS[c].prem && !C.COLS[c].heirloom).map(c => [C.COLS[c].ok, C.COLS[c].name + '武器箱'])]) {
      const sum = C.CFG_INFO.filter(r => r[0].startsWith(p)).reduce((a, r) => a + C.cv(cfg, r[0]), 0);
      if (Math.abs(sum - 1) > 1e-6) return { cfg: null, err: `${name}的几档爆率加起来要正好是 1（现在是 ${+sum.toFixed(6)}）` };
    }
    if (C.cv(cfg, 'term.lo') > C.cv(cfg, 'term.hi')) return { cfg: null, err: '货郎报价的最低倍数不能高过最高倍数' };
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
  C.isHeirloom = k => C.isItem(k) && !!C.COLS[C.ITEM[k].col].heirloom;
  C.isStOnly = k => C.isItem(k) && !!C.COLS[C.ITEM[k].col].stOnly;
  C.ofTierReg = t => C.ofTier(t).filter(k => !C.isPrem(k));   // 普通武器箱里的：星章兑换只从这些里出，神兵、星座与传世武器箱不在此列
  const PREFIX = { qf: 'qingfeng', fy: 'feiying', ts: 'tieshan', ls: 'lingshuang', ly: 'liuyun', lm: 'leiming', my: 'moyu', yh: 'yuehua', yl: 'yanling', yx: 'yuxiao', zx: 'zuixian', gc: 'gouchen', lq: 'lingque', li: 'liying', cx: 'cixian', qj: 'qianji', ch: 'chixiao', xj: 'xuanji', ql: 'qingluan', xw: 'xuanwu' };
  C.charOf = k => own(PREFIX, String(k).split('_')[0]) || '';

  // 星座武器箱的 36 款：按 C.ZODIAC 的配色和 C.ZOD_OF 的分配生成。
  // 背后一枚星座星图（deco.sign 是哪个星座，zt 是第几档：灵犀只有星图，赤霄加一圈星环，绝世是转动的星盘），头上星冠，绝世的兵器上还有星光（zw）
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
  // 五套主题系列套装皮肤生成（山海星陨 sf、墨韵丹青 ic、沧澜雷霆 st、九霄剑阁 jx、幽冥玄煞 ym；全套专属外观、兵器、配饰、特效与全景天象）
  const HERO_WEAP_STYLE = {
    qf: 'renying_blade', fy: 'butterfly_daggers', ts: 'crystal_greatsword', ls: 'tianhe_spear',
    ly: 'koi_fan', lm: 'jiuxiao_gauntlet', my: 'jade_brush', yh: 'guanghan_moon',
    yl: 'peacock_feather', yx: 'tianlai_flute', zx: 'moon_gourd', gc: 'frost_hammer',
    lq: 'peacock_feather', li: 'butterfly_daggers', cx: 'guanghan_moon', qj: 'frost_hammer',
    ch: 'tianhe_spear', xj: 'guanghan_moon', ql: 'koi_fan', xw: 'crystal_greatsword',
  };
  const SET_THEMES = {
    sf: {
      name: '星陨', body: '#1c234d', shade: '#0d112b', scarf: '#9bb2ff', slash: '165,188,255', blade: '#f2f6ff', outline: '#b6c8ff',
      breast: '#27306b', shoulder: '#36428c', cape: '#161c42', gem: '#ffd8f6',
      heads: ['headband', 'jadepin', 'valkyrie', 'starguan'],
      robes: ['starry', 'starry', 'celestial', 'celestial'],
      backs: ['crescent', 'notering', 'galaxy', 'galaxy'],
      fx: { th: 'nebula', c: '165,188,255', c2: '255,160,235' },
      scene: { sky: ['#040512', '#0e1338', '#232864', '#0b0e28'], orb: 'galaxy', orbC: '175,195,255', mist: '165,175,255', mtn: ['#151a44', '#0b0e26'], bam: ['#080a1c', '#040510'], wx: 'twinkle', wxC: '225,230,255', hit: 'swirl', hitC: '180,190,255', stars: 1, rays: true },
    },
    ic: {
      name: '丹青', body: '#f2eadc', shade: '#bda892', scarf: '#d83b30', slash: '238,88,74', blade: '#1e1917', outline: '#281814',
      breast: '#8a2620', shoulder: '#a8342a', cape: '#2a1a16', gem: '#ff8a7a',
      heads: ['bamboohat', 'bamboohat', 'veilhat', 'plume'],
      robes: ['jade_master', 'jade_master', 'dusk', 'phoenix'],
      backs: ['scroll', 'scroll', 'koi', 'flysword'],
      fx: { th: 'ink', c: '238,88,74', c2: '24,18,16' },
      scene: { sky: ['#140a08', '#341612', '#6a261e', '#24100d'], orb: 'bloodmoon', orbC: '255,115,92', mist: '240,140,115', mtn: ['#2e1612', '#1a0c0a'], bam: ['#120806', '#0a0404'], wx: 'ink', wxC: '60,24,20', hit: 'enso', hitC: '245,95,80', stars: 0.25, rays: true },
    },
    st: {
      name: '沧澜', body: '#143248', shade: '#091a28', scarf: '#38d2ff', slash: '90,222,255', blade: '#ecfbff', outline: '#7ae4ff',
      breast: '#1d4d6e', shoulder: '#2a6a92', cape: '#0c2638', gem: '#a8f4ff',
      heads: ['headband', 'voidhorns', 'taotiehelm', 'starguan'],
      robes: ['blizzard', 'thunder', 'thunder', 'heavy'],
      backs: ['crystals', 'icewings', 'chakra', 'chakra'],
      fx: { th: 'thunder', c: '90,222,255', c2: '220,250,255' },
      scene: { sky: ['#04101c', '#0a263e', '#1a4f74', '#0a2034'], orb: 'rift', orbC: '120,232,255', mist: '115,215,250', mtn: ['#10324a', '#081d2e'], bam: ['#061624', '#030c14'], wx: 'spark', wxC: '150,235,255', hit: 'bolt', hitC: '95,225,255', stars: 0.45, rays: true },
    },
    jx: {
      name: '九霄', body: '#f8f2e2', shade: '#c8b482', scarf: '#f5be48', slash: '255,218,125', blade: '#fffaf0', outline: '#3a280e',
      breast: '#c6983e', shoulder: '#deb356', cape: '#5c3c16', gem: '#fff0b8',
      heads: ['jadepin', 'plume', 'starguan', 'valkyrie'],
      robes: ['celestial', 'celestial', 'phoenix', 'celestial'],
      backs: ['notering', 'flysword', 'flysword', 'peacock'],
      fx: { th: 'star', c: '255,218,125', c2: '255,248,220' },
      scene: { sky: ['#161006', '#3d2a0e', '#8c6424', '#2e1e08'], orb: 'sun', orbC: '255,228,150', mist: '255,215,135', mtn: ['#3e2a10', '#241808'], bam: ['#181006', '#0e0904'], wx: 'gold', wxC: '255,228,145', hit: 'sunburst', hitC: '255,220,125', stars: 0.35, rays: true },
    },
    ym: {
      name: '幽冥', body: '#241438', shade: '#10081c', scarf: '#c870ff', slash: '205,120,255', blade: '#f5e8ff', outline: '#b668ff',
      breast: '#381e58', shoulder: '#4f2a7a', cape: '#180c28', gem: '#8ff6ff',
      heads: ['foxmask', 'voidhorns', 'foxmask', 'voidhorns'],
      robes: ['dark', 'spirit', 'spirit', 'dark'],
      backs: ['butterflywings', 'crescent', 'butterflywings', 'galaxy'],
      fx: { th: 'butterfly', c: '205,120,255', c2: '125,245,255', part: 'butterfly' },
      scene: { sky: ['#080412', '#1c0c34', '#3b1866', '#140826'], orb: 'bloodmoon', orbC: '215,135,255', mist: '185,120,255', mtn: ['#22103c', '#120822'], bam: ['#0e061a', '#06030e'], wx: 'petal', wxC: '215,160,255', hit: 'crescent', hitC: '205,120,255', stars: 0.75, rays: true },
    },
  };
  const SET_RANK = { 1: '初影', 2: '流光', 3: '玄华', 4: '赤霄' };
  const SET_TRAIL = { 1: 'cloud', 2: 'spark', 3: 'gold', 4: 'gold' };
  const SET_AURA = { 1: undefined, 2: 'cloud', 3: 'aurora', 4: 'gold' };
  for (const cid of ['c9', 'c10', 'c11', 'c12', 'c13']) {
    for (const t of ['mil', 'res', 'cla', 'cov']) {
      for (const k of C.COLS[cid][t] || []) {
        const [pre, tag] = k.split('_'), th = SET_THEMES[tag.slice(0, 2)], rkNum = +tag.slice(2) || 1, rk = SET_RANK[rkNum] || '';
        const head = th.heads[rkNum - 1] || th.heads[0];
        const robe = th.robes[rkNum - 1] || th.robes[0];
        const back = th.backs[rkNum - 1] || th.backs[0];
        C.FULL[k] = {
          char: PREFIX[pre],
          name: `${th.name}·${rk}`,
          look: { body: th.body, shade: th.shade, scarf: th.scarf, slash: th.slash, blade: th.blade, outline: th.outline, outlineA: 0.95 },
          deco: {
            head,
            hideBaseHead: head === 'foxmask' || head === 'voidhorns' || head === 'taotiehelm',
            gem: th.gem,
            band: th.scarf,
            hatC: th.breast,
            veilC: 'rgba(220,200,255,0.35)',
            mask: th.gem,
            helmC: th.shoulder,
            crest: th.scarf,
            plumeC: [th.scarf, th.gem],
            robe,
            breastplate: th.breast,
            shoulder: rkNum >= 2 ? th.shoulder : undefined,
            cape: rkNum >= 3 ? th.cape : undefined,
            back,
            trail: SET_TRAIL[rkNum],
            aura: SET_AURA[rkNum],
            weapStyle: HERO_WEAP_STYLE[pre] || 'renying_blade',
            transform: rkNum >= 3 ? 'awaken' : undefined,
          },
          fx: { ...th.fx },
          scene: JSON.parse(JSON.stringify(th.scene)),
        };
      }
    }
  }

  // ---------- 典藏至臻：天工传世 · 器灵纪（全 20 位侠客专属，各承一脉非遗国宝器艺，解锁攻守双境） ----------
  const HEIRLOOM_DEFS = {
    qf_porcelain: { char: 'qingfeng', name: '青花龙泉', relic: { craft: '元青花瓷', material: 'porcelain', title: '窑火胎骨 · 龙泉剑魄', sfx: 'porcelain', glyph: '瓷', stanceAtk: '青花裂锋', stanceDef: '釉玉守心' },
      look: { body: '#f2f6fb', shade: '#9db6d6', scarf: '#1e4fa3', slash: '58,124,230', blade: '#f7fbff', metal: '#d8b464', haft: '#1a3668', outline: '#122852', outlineA: 1 },
      deco: { head: 'jadepin', gem: '#2c6be0', robe: 'jade_master', robeC: '#1b3d7a', breastplate: '#2352a6', shoulder: '#d8b464', cape: '#162f60', back: 'flysword', trail: 'cloud', aura: 'cloud', weapStyle: 'relic_porcelain', relicMat: 'porcelain', relicGlyph: '瓷', transform: 'heirloom' },
      fx: { th: 'crystal', c: '64,132,235', c2: '242,248,255', relicMat: 'porcelain' },
      scene: { sky: ['#061024', '#10254a', '#26508e', '#0d1d3c'], orb: 'moon', orbC: '235,244,255', mist: '150,195,245', mtn: ['#1a3b6e', '#0f2548'], bam: ['#0a1830', '#050d1c'], wx: 'petal', wxC: '215,232,255', hit: 'enso', hitC: '64,132,235', stars: 0.55, rays: true } },
    fy_puppet: { char: 'feiying', name: '皮影千机', relic: { craft: '驴皮影戏', material: 'puppet', title: '烛火镂影 · 丝牵双刃', sfx: 'puppet', glyph: '影', stanceAtk: '剪影夺魂', stanceDef: '幕障藏锋' },
      look: { body: '#241410', shade: '#120806', scarf: '#e6552e', slash: '245,112,62', blade: '#ffe6b8', metal: '#d99a3e', haft: '#3b180e', outline: '#f5b85a', outlineA: 0.92 },
      deco: { head: 'foxmask', hideBaseHead: true, mask: '#f5b85a', gem: '#ff6438', robe: 'dark', robeC: '#2b120c', breastplate: '#7a2214', shoulder: '#c97828', cape: '#1a0a06', back: 'butterflywings', trail: 'ink', aura: 'smoke', weapStyle: 'relic_puppet', relicMat: 'puppet', relicGlyph: '影', transform: 'heirloom' },
      fx: { th: 'ink', c: '245,112,62', c2: '255,214,132', relicMat: 'puppet' },
      scene: { sky: ['#140804', '#38160c', '#7c3418', '#260e08'], orb: 'sun', orbC: '255,204,120', mist: '240,140,80', mtn: ['#36180d', '#1e0c06'], bam: ['#140704', '#0a0302'], wx: 'gold', wxC: '255,186,100', hit: 'inksplat', hitC: '245,112,62', stars: 0.25, rays: true } },
    ts_taotie: { char: 'tieshan', name: '后母饕餮', relic: { craft: '商周青铜', material: 'bronze', title: '铭文古鼎 · 饕餮镇岳', sfx: 'bronze', glyph: '鼎', stanceAtk: '饕餮噬锋', stanceDef: '玄鼎不动' },
      look: { body: '#2b4742', shade: '#162825', scarf: '#d4a64a', slash: '110,204,178', blade: '#76b8a4', metal: '#d4a64a', haft: '#1e322e', outline: '#6ac4aa', outlineA: 0.95 },
      deco: { head: 'taotiehelm', hideBaseHead: true, helmC: '#355c54', crest: '#e6b852', gem: '#78e6c8', robe: 'heavy', robeC: '#1f3833', breastplate: '#3f6c62', shoulder: '#d4a64a', cape: '#152622', back: 'chakra', trail: 'spark', aura: 'gold', weapStyle: 'relic_bronze', relicMat: 'bronze', relicGlyph: '鼎', transform: 'heirloom' },
      fx: { th: 'crystal', c: '108,208,180', c2: '230,186,88', relicMat: 'bronze' },
      scene: { sky: ['#071210', '#132a26', '#265048', '#0e201d'], orb: 'sun', orbC: '232,196,112', mist: '112,196,174', mtn: ['#1b3b35', '#0e221e'], bam: ['#0a1815', '#050d0b'], wx: 'gold', wxC: '225,190,104', hit: 'hexagon', hitC: '108,208,180', stars: 0.3, rays: true } },
    ls_celadon: { char: 'lingshuang', name: '汝窑天青', relic: { craft: '宋代汝窑', material: 'celadon', title: '雨过天青 · 冰裂长枪', sfx: 'porcelain', glyph: '汝', stanceAtk: '冰裂穿云', stanceDef: '天青止水' },
      look: { body: '#cfe6e4', shade: '#7fa8a8', scarf: '#f0cfa0', slash: '152,218,220', blade: '#e8faf8', metal: '#e0bc7a', haft: '#3f686b', outline: '#1e3e42', outlineA: 1 },
      deco: { head: 'valkyrie', gem: '#9ee8e4', robe: 'blizzard', robeC: '#588284', breastplate: '#7ca8aa', shoulder: '#e0bc7a', cape: '#3a5d60', back: 'icewings', trail: 'snow', aura: 'snow', weapStyle: 'relic_celadon', relicMat: 'celadon', relicGlyph: '汝', transform: 'heirloom' },
      fx: { th: 'frost', c: '152,222,224', c2: '245,226,184', relicMat: 'celadon' },
      scene: { sky: ['#071418', '#15343c', '#346872', '#122c32'], orb: 'moon', orbC: '228,248,248', mist: '160,215,218', mtn: ['#204a52', '#122c32'], bam: ['#0b1e22', '#061114'], wx: 'snow', wxC: '220,245,245', hit: 'snowflake', hitC: '152,222,224', stars: 0.5, rays: true } },
    ly_embroidery: { char: 'liuyun', name: '苏绣云锦', relic: { craft: '江南苏绣', material: 'silk', title: '金线双面 · 锦扇生风', sfx: 'silk', glyph: '绣', stanceAtk: '金针破锦', stanceDef: '云缎卸力' },
      look: { body: '#fbf2eb', shade: '#cfa39a', scarf: '#d94862', slash: '245,126,154', blade: '#fff5e6', metal: '#f0c464', haft: '#7a2434', outline: '#3c1420', outlineA: 1 },
      deco: { head: 'veilhat', hatC: '#a82a44', veilC: 'rgba(255,198,210,0.42)', gem: '#ffd278', robe: 'dusk', robeC: '#8a2238', breastplate: '#c9405c', shoulder: '#f0c464', cape: '#6e1a2e', back: 'koi', trail: 'cloud', aura: 'cloud', weapStyle: 'relic_embroidery', relicMat: 'silk', relicGlyph: '绣', transform: 'heirloom' },
      fx: { th: 'water', c: '245,126,154', c2: '255,216,136', part: 'petal', relicMat: 'silk' },
      scene: { sky: ['#160810', '#3a1426', '#782c4a', '#280e1c'], orb: 'moon', orbC: '255,232,226', mist: '245,155,175', mtn: ['#3c1628', '#220c18'], bam: ['#180812', '#0d040a'], wx: 'petal', wxC: '255,184,200', hit: 'ripple', hitC: '245,126,154', stars: 0.45, rays: true } },
    lm_cloisonne: { char: 'leiming', name: '景泰掐丝', relic: { craft: '景泰蓝珐琅', material: 'enamel', title: '金丝宝蓝 · 雷火珐琅', sfx: 'enamel', glyph: '蓝', stanceAtk: '掐丝奔雷', stanceDef: '宝蓝金钟' },
      look: { body: '#143878', shade: '#0a1c42', scarf: '#f5c242', slash: '82,172,255', blade: '#fff3c4', metal: '#f5c242', haft: '#0f2858', outline: '#ffd86b', outlineA: 0.95 },
      deco: { head: 'starguan', gem: '#38c8ff', robe: 'thunder', robeC: '#102e66', breastplate: '#1a4c9e', shoulder: '#f5c242', cape: '#0b2048', back: 'chakra', trail: 'spark', aura: 'gold', weapStyle: 'relic_cloisonne', relicMat: 'enamel', relicGlyph: '蓝', transform: 'heirloom' },
      fx: { th: 'thunder', c: '82,172,255', c2: '255,212,96', relicMat: 'enamel' },
      scene: { sky: ['#050c20', '#0e2252', '#1e4696', '#0a1a40'], orb: 'rift', orbC: '255,218,108', mist: '108,180,255', mtn: ['#122c62', '#0a1a3d'], bam: ['#07122a', '#040918'], wx: 'spark', wxC: '255,216,104', hit: 'bolt', hitC: '82,172,255', stars: 0.6, rays: true } },
    my_woodblock: { char: 'moyu', name: '雕版朱印', relic: { craft: '梨木雕版', material: 'woodblock', title: '梨木刻经 · 朱砂镇纸', sfx: 'woodblock', glyph: '印', stanceAtk: '朱砂判笔', stanceDef: '古卷镇印' },
      look: { body: '#f0e6d2', shade: '#b8a484', scarf: '#c82e24', slash: '220,62,50', blade: '#1e1612', metal: '#c82e24', haft: '#3e2618', outline: '#24140e', outlineA: 1 },
      deco: { head: 'bamboohat', hatC: '#4a2b1c', gem: '#e03e32', robe: 'jade_master', robeC: '#2b1b14', breastplate: '#7a221c', shoulder: '#c82e24', cape: '#1c120d', back: 'scroll', trail: 'ink', inkC: '198,46,36', aura: 'smoke', weapStyle: 'relic_woodblock', relicMat: 'woodblock', relicGlyph: '印', transform: 'heirloom' },
      fx: { th: 'ink', c: '220,62,50', c2: '28,20,16', relicMat: 'woodblock' },
      scene: { sky: ['#140c08', '#2e1a12', '#5c3020', '#20120c'], orb: 'bloodmoon', orbC: '235,84,68', mist: '220,160,130', mtn: ['#2c1810', '#180d08'], bam: ['#120a06', '#080402'], wx: 'ink', wxC: '80,28,22', hit: 'enso', hitC: '220,62,50', stars: 0.2, rays: true } },
    yh_liuli: { char: 'yuehua', name: '琉璃月华', relic: { craft: '药玉琉璃', material: 'liuli', title: '流光药玉 · 弦月琉璃', sfx: 'liuli', glyph: '琉', stanceAtk: '流光折月', stanceDef: '玉魄凝华' },
      look: { body: '#1f2b58', shade: '#0f1636', scarf: '#88f0ff', slash: '142,232,255', blade: '#f2fdff', metal: '#c4a2ff', haft: '#1a2450', outline: '#a6f4ff', outlineA: 0.92 },
      deco: { head: 'startiara', tiaraC: '#88f0ff', gem: '#e4b2ff', robe: 'starry', robeC: '#182452', breastplate: '#2c4688', shoulder: '#88f0ff', cape: '#121a3e', back: 'crescent', trail: 'star', aura: 'aurora', weapStyle: 'relic_liuli', relicMat: 'liuli', relicGlyph: '琉', transform: 'heirloom' },
      fx: { th: 'crystal', c: '142,232,255', c2: '220,174,255', relicMat: 'liuli' },
      scene: { sky: ['#05081a', '#101d48', '#254488', '#0c1638'], orb: 'moon', orbC: '225,248,255', mist: '150,218,255', mtn: ['#162c5e', '#0c1838'], bam: ['#081026', '#040814'], wx: 'twinkle', wxC: '210,242,255', hit: 'crescent', hitC: '142,232,255', stars: 0.9, rays: true } },
    yl_kingfisher: { char: 'yanling', name: '点翠金凤', relic: { craft: '宫廷点翠', material: 'kingfisher', title: '翠羽鎏金 · 凤翎穿风', sfx: 'feather', glyph: '翠', stanceAtk: '金凤掠羽', stanceDef: '翠幕回旋' },
      look: { body: '#0d4a58', shade: '#062630', scarf: '#f5c84c', slash: '46,216,212', blade: '#e8fffb', metal: '#f5c84c', haft: '#093440', outline: '#f5c84c', outlineA: 0.95 },
      deco: { head: 'plume', plumeC: ['#14c8c0', '#f5c84c'], gem: '#2ee6dc', robe: 'phoenix', robeC: '#0a3a46', breastplate: '#126474', shoulder: '#f5c84c', cape: '#082c36', back: 'peacock', trail: 'feather', featherC: '46,216,212', aura: 'gold', weapStyle: 'relic_kingfisher', relicMat: 'kingfisher', relicGlyph: '翠', transform: 'heirloom' },
      fx: { th: 'feather', c: '46,216,212', c2: '245,200,76', part: 'feather', relicMat: 'kingfisher' },
      scene: { sky: ['#041218', '#0a2e3a', '#165e6e', '#092630'], orb: 'sun', orbC: '255,224,126', mist: '80,212,208', mtn: ['#0f404c', '#08242c'], bam: ['#061a20', '#030e12'], wx: 'feather', wxC: '110,234,228', hit: 'feathers', hitC: '46,216,212', stars: 0.45, rays: true } },
    yx_guqin: { char: 'yuxiao', name: '古琴断纹', relic: { craft: '仲尼断纹琴', material: 'guqin', title: '蛇腹金徽 · 广陵清商', sfx: 'guqin', glyph: '琴', stanceAtk: '十面杀伐', stanceDef: '流水清心' },
      look: { body: '#2c1e16', shade: '#160e0a', scarf: '#e6c278', slash: '238,198,118', blade: '#f8eed8', metal: '#e6c278', haft: '#3c261a', outline: '#e6c278', outlineA: 0.9 },
      deco: { head: 'jadepin', gem: '#e6c278', robe: 'celestial', robeC: '#241812', breastplate: '#6a4a2a', shoulder: '#d8b060', cape: '#1a110c', back: 'notering', trail: 'gold', aura: 'gold', weapStyle: 'relic_guqin', relicMat: 'guqin', relicGlyph: '琴', transform: 'heirloom' },
      fx: { th: 'note', c: '238,198,118', c2: '255,244,214', part: 'note', relicMat: 'guqin' },
      scene: { sky: ['#120c08', '#2a1c12', '#5c3e24', '#1e140c'], orb: 'moon', orbC: '252,232,188', mist: '225,190,130', mtn: ['#322216', '#1c120b'], bam: ['#120c08', '#090604'], wx: 'gold', wxC: '240,206,132', hit: 'sunburst', hitC: '238,198,118', stars: 0.4, rays: true } },
    zx_sancai: { char: 'zuixian', name: '唐三彩釉', relic: { craft: '盛唐三彩', material: 'sancai', title: '流釉琥珀 · 醉卧长安', sfx: 'porcelain', glyph: '彩', stanceAtk: '琥珀醉拳', stanceDef: '翠釉化劲' },
      look: { body: '#f5ecd8', shade: '#c4a672', scarf: '#2e9e66', slash: '242,162,56', blade: '#fff6e0', metal: '#e89a2c', haft: '#7a4a18', outline: '#2e1e0e', outlineA: 1 },
      deco: { head: 'veilhat', hatC: '#c4721c', veilC: 'rgba(110,214,154,0.34)', gem: '#2e9e66', robe: 'dusk', robeC: '#a8621c', breastplate: '#2e8a5a', shoulder: '#e89a2c', cape: '#6e3e12', back: 'gourdback', trail: 'gold', aura: 'cloud', weapStyle: 'relic_sancai', relicMat: 'sancai', relicGlyph: '彩', transform: 'heirloom' },
      fx: { th: 'water', c: '242,162,56', c2: '72,196,132', relicMat: 'sancai' },
      scene: { sky: ['#161006', '#3a2810', '#7e5620', '#2a1c0a'], orb: 'sun', orbC: '255,222,148', mist: '225,186,120', mtn: ['#3a2c14', '#22180a'], bam: ['#141008', '#0a0804'], wx: 'gold', wxC: '245,190,96', hit: 'swirl', hitC: '242,162,56', stars: 0.3, rays: true } },
    gc_kintsugi: { char: 'gouchen', name: '金缮大漆', relic: { craft: '大漆金缮', material: 'kintsugi', title: '玄漆裂金 · 碎玉重铸', sfx: 'kintsugi', glyph: '缮', stanceAtk: '裂金崩岳', stanceDef: '玄漆不坏' },
      look: { body: '#1a1618', shade: '#0b090a', scarf: '#f4c542', slash: '248,198,66', blade: '#2a2220', metal: '#f4c542', haft: '#141012', outline: '#f4c542', outlineA: 0.96 },
      deco: { head: 'voidhorns', hideBaseHead: true, gem: '#ffcf48', robe: 'dark', robeC: '#161214', breastplate: '#261e20', shoulder: '#f4c542', cape: '#120e10', back: 'crystals', trail: 'gold', aura: 'gold', weapStyle: 'relic_kintsugi', relicMat: 'kintsugi', relicGlyph: '缮', transform: 'heirloom' },
      fx: { th: 'crystal', c: '248,198,66', c2: '255,240,180', relicMat: 'kintsugi' },
      scene: { sky: ['#0a0808', '#1e1612', '#42301c', '#16100c'], orb: 'bloodmoon', orbC: '248,200,76', mist: '215,176,92', mtn: ['#241a12', '#120d08'], bam: ['#0c0806', '#060403'], wx: 'gold', wxC: '248,202,82', hit: 'hexagon', hitC: '248,198,66', stars: 0.45, rays: true } },
    lq_papercut: { char: 'lingque', name: '蔚县剪纸', relic: { craft: '蔚县窗花', material: 'papercut', title: '朱红镂空 · 飞雀剪风', sfx: 'paper', glyph: '剪', stanceAtk: '飞剪断影', stanceDef: '纸蝶化形' },
      look: { body: '#fff6ee', shade: '#e0b8b0', scarf: '#e62e2d', slash: '245,62,62', blade: '#ffebe8', metal: '#f5c24a', haft: '#8e1818', outline: '#b81a1a', outlineA: 1 },
      deco: { head: 'plume', plumeC: ['#e62e2d', '#f5c24a'], gem: '#ff4242', robe: 'phoenix', robeC: '#b81c1c', breastplate: '#d82828', shoulder: '#f5c24a', cape: '#8a1414', back: 'butterflywings', trail: 'feather', featherC: '245,62,62', aura: 'cloud', weapStyle: 'relic_papercut', relicMat: 'papercut', relicGlyph: '剪', transform: 'heirloom' },
      fx: { th: 'feather', c: '245,62,62', c2: '255,214,112', part: 'butterfly', relicMat: 'papercut' },
      scene: { sky: ['#180606', '#441010', '#8c2020', '#2e0a0a'], orb: 'sun', orbC: '255,214,132', mist: '255,120,110', mtn: ['#441212', '#260808'], bam: ['#180606', '#0c0303'], wx: 'petal', wxC: '255,108,108', hit: 'feathers', hitC: '245,62,62', stars: 0.35, rays: true } },
    li_screen: { char: 'liying', name: '金箔屏风', relic: { craft: '金箔漆屏', material: 'goldleaf', title: '折屏藏刃 · 鎏金离影', sfx: 'goldleaf', glyph: '屏', stanceAtk: '金屏裂影', stanceDef: '折光避锋' },
      look: { body: '#241e14', shade: '#120e08', scarf: '#ffd65c', slash: '255,214,92', blade: '#fff6d0', metal: '#ffd65c', haft: '#382a14', outline: '#ffd65c', outlineA: 0.94 },
      deco: { head: 'foxmask', hideBaseHead: true, mask: '#ffd65c', gem: '#fff0a8', robe: 'spirit', robeC: '#2c2212', breastplate: '#8c6824', shoulder: '#ffd65c', cape: '#1c150a', back: 'crescent', trail: 'gold', aura: 'gold', weapStyle: 'relic_screen', relicMat: 'goldleaf', relicGlyph: '屏', transform: 'heirloom' },
      fx: { th: 'star', c: '255,214,92', c2: '255,248,214', relicMat: 'goldleaf' },
      scene: { sky: ['#120e06', '#322610', '#6e521e', '#241a0a'], orb: 'sun', orbC: '255,232,148', mist: '245,208,118', mtn: ['#362812', '#1e1608'], bam: ['#140e06', '#0a0703'], wx: 'gold', wxC: '255,222,126', hit: 'crescent', hitC: '255,214,92', stars: 0.6, rays: true } },
    cx_compass: { char: 'cixian', name: '司南浑仪', relic: { craft: '磁石司南', material: 'compass', title: '玄磁勺盘 · 阴阳定向', sfx: 'bronze', glyph: '磁', stanceAtk: '磁极裂阵', stanceDef: '司南定乾' },
      look: { body: '#1e2838', shade: '#0e1420', scarf: '#58d8ff', slash: '96,218,255', blade: '#dff8ff', metal: '#e2b862', haft: '#1a2434', outline: '#78e0ff', outlineA: 0.92 },
      deco: { head: 'circlet', gem: '#58d8ff', robe: 'starry', robeC: '#162030', breastplate: '#2e4662', shoulder: '#e2b862', cape: '#101824', back: 'zodiac', sign: 'aqu', zt: 3, zc: '96,218,255', zc2: '226,184,98', trail: 'spark', aura: 'aurora', weapStyle: 'relic_compass', relicMat: 'compass', relicGlyph: '磁', transform: 'heirloom' },
      fx: { th: 'nebula', c: '96,218,255', c2: '226,184,98', relicMat: 'compass' },
      scene: { sky: ['#050c18', '#0e2038', '#1e446c', '#0b182a'], orb: 'galaxy', orbC: '132,226,255', mist: '112,196,238', mtn: ['#142c48', '#0a182a'], bam: ['#071220', '#030a12'], wx: 'spark', wxC: '150,232,255', hit: 'swirl', hitC: '96,218,255', stars: 0.85, rays: true } },
    qj_marionette: { char: 'qianji', name: '提线榫卯', relic: { craft: '鲁班榫卯', material: 'woodblock', title: '紫檀榫卯 · 机丝连环', sfx: 'woodblock', glyph: '榫', stanceAtk: '连环机括', stanceDef: '榫合铁壁' },
      look: { body: '#4a2b1e', shade: '#26140c', scarf: '#f0b858', slash: '240,184,88', blade: '#fae6c0', metal: '#e0a642', haft: '#361c12', outline: '#f0b858', outlineA: 0.9 },
      deco: { head: 'headband', band: '#f0b858', gem: '#ffcf70', robe: 'heavy', robeC: '#3a2016', breastplate: '#6a3c26', shoulder: '#e0a642', cape: '#28140e', back: 'chakra', trail: 'spark', aura: 'gold', weapStyle: 'relic_marionette', relicMat: 'woodblock', relicGlyph: '榫', transform: 'heirloom' },
      fx: { th: 'star', c: '240,184,88', c2: '180,120,64', relicMat: 'woodblock' },
      scene: { sky: ['#120a06', '#2e1a10', '#603820', '#20120a'], orb: 'sun', orbC: '245,204,126', mist: '220,164,108', mtn: ['#341e12', '#1c1008'], bam: ['#120a06', '#080402'], wx: 'spark', wxC: '245,196,104', hit: 'hexagon', hitC: '240,184,88', stars: 0.35, rays: true } },
    ch_ironfire: { char: 'chixiao', name: '打铁熔星', relic: { craft: '非遗打铁花', material: 'ironfire', title: '千度铁水 · 星雨焚天', sfx: 'ironfire', glyph: '熔', stanceAtk: '铁花焚空', stanceDef: '熔炉护体' },
      look: { body: '#281412', shade: '#120808', scarf: '#ff7a22', slash: '255,126,38', blade: '#fff0c2', metal: '#ff9632', haft: '#3c1810', outline: '#ffa842', outlineA: 0.96 },
      deco: { head: 'voidhorns', hideBaseHead: true, gem: '#ff9632', robe: 'thunder', robeC: '#24100e', breastplate: '#6a2214', shoulder: '#ff7a22', cape: '#1a0a08', back: 'chakra', trail: 'spark', aura: 'gold', weapStyle: 'relic_ironfire', relicMat: 'ironfire', relicGlyph: '熔', transform: 'heirloom' },
      fx: { th: 'thunder', c: '255,126,38', c2: '255,236,160', relicMat: 'ironfire' },
      scene: { sky: ['#120604', '#361208', '#7c2a10', '#260c06'], orb: 'bloodmoon', orbC: '255,152,64', mist: '255,134,58', mtn: ['#38140a', '#1e0a04'], bam: ['#140604', '#080302'], wx: 'spark', wxC: '255,198,96', hit: 'sunburst', hitC: '255,126,38', stars: 0.7, rays: true } },
    xj_armillary: { char: 'xuanji', name: '浑天玑衡', relic: { craft: '张衡浑天仪', material: 'armillary', title: '三环玑衡 · 璇玑演星', sfx: 'bronze', glyph: '浑', stanceAtk: '星轨贯日', stanceDef: '天仪护周' },
      look: { body: '#181e3a', shade: '#0a0e20', scarf: '#f2c864', slash: '242,200,100', blade: '#fff8de', metal: '#f2c864', haft: '#141a32', outline: '#f2c864', outlineA: 0.94 },
      deco: { head: 'startiara', tiaraC: '#f2c864', gem: '#92b8ff', robe: 'celestial', robeC: '#141a34', breastplate: '#3a4678', shoulder: '#f2c864', cape: '#0e1226', back: 'galaxy', trail: 'star', aura: 'aurora', weapStyle: 'relic_armillary', relicMat: 'armillary', relicGlyph: '浑', transform: 'heirloom' },
      fx: { th: 'nebula', c: '242,200,100', c2: '132,178,255', part: 'twinkle', relicMat: 'armillary' },
      scene: { sky: ['#040614', '#0e1638', '#22306a', '#0a1028'], orb: 'galaxy', orbC: '248,216,136', mist: '165,190,255', mtn: ['#16204a', '#0c122c'], bam: ['#080c1e', '#040610'], wx: 'twinkle', wxC: '248,224,158', hit: 'starburst', hitC: '242,200,100', stars: 1, rays: true } },
    ql_dunhuang: { char: 'qingluan', name: '敦煌飞天', relic: { craft: '莫高窟壁画', material: 'dunhuang', title: '石青金箔 · 飞天伎乐', sfx: 'guqin', glyph: '煌', stanceAtk: '琵琶破阵', stanceDef: '藻井慈光' },
      look: { body: '#f4e4cc', shade: '#c29c72', scarf: '#28889e', slash: '68,186,204', blade: '#fff2d2', metal: '#eab84a', haft: '#7a4222', outline: '#3c1e12', outlineA: 1 },
      deco: { head: 'startiara', tiaraC: '#eab84a', gem: '#28a4b8', robe: 'celestial', robeC: '#1e6478', breastplate: '#c86832', shoulder: '#eab84a', cape: '#184e5e', back: 'notering', trail: 'gold', aura: 'gold', weapStyle: 'relic_dunhuang', relicMat: 'dunhuang', relicGlyph: '煌', transform: 'heirloom' },
      fx: { th: 'note', c: '68,186,204', c2: '245,196,86', part: 'petal', relicMat: 'dunhuang' },
      scene: { sky: ['#160e08', '#3c2614', '#86582a', '#2c1c0e'], orb: 'sun', orbC: '255,224,142', mist: '220,178,120', mtn: ['#4a3018', '#2a1a0c'], bam: ['#181008', '#0e0804'], wx: 'gold', wxC: '255,216,124', hit: 'sunburst', hitC: '245,196,86', stars: 0.45, rays: true } },
    xw_cinnabar: { char: 'xuanwu', name: '剔红镇岳', relic: { craft: '宫廷剔红漆', material: 'cinnabar', title: '百层雕漆 · 玄龟镇岳', sfx: 'cinnabar', glyph: '漆', stanceAtk: '雕漆重压', stanceDef: '百层玄甲' },
      look: { body: '#7c1816', shade: '#420a0a', scarf: '#f0c458', slash: '232,68,58', blade: '#f8dfd4', metal: '#f0c458', haft: '#380a08', outline: '#f0c458', outlineA: 0.94 },
      deco: { head: 'taotiehelm', hideBaseHead: true, helmC: '#8e1c1a', crest: '#f0c458', gem: '#ff5242', robe: 'heavy', robeC: '#641210', breastplate: '#9e221e', shoulder: '#f0c458', cape: '#4a0c0a', back: 'crystals', trail: 'gold', aura: 'gold', weapStyle: 'relic_cinnabar', relicMat: 'cinnabar', relicGlyph: '漆', transform: 'heirloom' },
      fx: { th: 'ink', c: '232,68,58', c2: '242,196,88', relicMat: 'cinnabar' },
      scene: { sky: ['#160606', '#3e0e0c', '#821c18', '#2a0808'], orb: 'bloodmoon', orbC: '255,140,104', mist: '228,108,92', mtn: ['#42100e', '#240808'], bam: ['#160606', '#0c0303'], wx: 'gold', wxC: '245,200,96', hit: 'hexagon', hitC: '232,68,58', stars: 0.35, rays: true } },
  };
  for (const [k, def] of Object.entries(HEIRLOOM_DEFS)) {
    C.FULL[k] = { ...def, heirloom: true, stOnly: true };
  }

  /* ---------- 价格 ---------- */
  // 系统只给自己卖的东西定价：武器箱、货郎（商店固定价格）和货郎报的那一件。
  // 饰品在玩家市场上卖多少钱全由玩家定，系统不定价、不收购，所以也没有“市场价”。
  C.ST_MUL = t => t === 'gold' ? 1.4 : 1.75;   // 货郎报斩数版时贵多少
  C.refVal = it => {   // 一件饰品的基准价：只用来定货郎的报价
    const d = C.ITEM[it.k]; if (!d) return 0;
    const base = C.isHeirloom(it.k) ? 12000 : C.BASE[d.tier];
    return Math.max(2, Math.round(base * d.mul * (it.st >= 0 ? C.ST_MUL(d.tier) : 1)));
  };
  C.GOODS = [...C.CASES, 'term'];              // 武器箱和货郎：只在商店卖，不能挂到市场
  C.isGood = k => C.GOODS.includes(k);
  C.shopPrice = (k, cfg) => k === 'term' ? C.cv(cfg, 'price.term') : own(C.COLS, k) ? C.cv(cfg, 'price.' + k) : 0;
  C.net = (p, cfg) => Math.floor(p * (1 - C.cv(cfg, 'fee')));    // 挂单卖掉，卖家到手多少
  const LID_RE = /^[0-9a-f]{16}$/;
  C.isLid = l => typeof l === 'string' && LID_RE.test(l);   // 挂单编号：服务器随机给的 16 位

  /* ---------- 存档 ---------- */
  // 领奖记录：d / w 是哪天哪周，dp / wp 是这天这周服务器认的对局数，dc / wc 是这天这周领过的任务，ev 活动期间打了几局人机，
  // ec / comp / tut 领没领过，ss 每关领过几颗星，sg 每部列传领过哪几节（位）、哪几个结局。seed 是第一次建这份记录时用服务器上的旧进度做底
  C.rwBlank = () => ({ d: 0, w: 0, dp: { games: 0, wins: 0, combo: 0, ults: 0 }, wp: { games: 0, wins: 0, combo: 0, ults: 0 }, dc: [], wc: [], ev: 0, ec: 0, comp: 0, tut: 0, ss: {}, sg: {}, seeded: 0 });
  C.blank = () => ({
    v: C.VER, tags: 0, term: 0, tm: null, nid: 1, inv: [], cases: Object.fromEntries(C.CASES.map(c => [c, 0])), via: [], eq: {},
    badgeGift: 0, badgeOwned: {}, badgeEquip: {}, badgeSigils: 0, heroKOs: {}, stances: {},
    petOwned: {}, petEquip: {}, skillUnlocks: {}, skillLoadout: {}, appreciation2026: 0, promoAll: 0, promoKeys: [], heirloomPromo: 0,
    lst: [], hist: [], od: { d: 0, n: 0 }, pd: { d: 0, n: 0 }, pw: { w: 0, n: 0 }, zw: { w: 0, n: 0 }, hw: { w: 0, n: 0 }, zf: 0, drop: { w: 0, g: 0, n: 0, sup: 0 },
    op: { s: '', earned: 0, spent: 0, w: 0, ms: [], prog: {}, done: [] }, cc: [], buys: {},
    stat: { open: 0, trade: 0, sold: 0, bought: 0, term: 0 }, tk: null, last: 0, dm: { d: 0, n: 0 }, gift: 0,
    rw: C.rwBlank(),
  });
  const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const int = (x, lo = 0, hi = 1e15) => { const v = Math.floor(+x); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  const num = (x, lo = 0, hi = 1e15) => { const v = +x; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  const str = (x, n) => typeof x === 'string' ? x.slice(0, n) : '';
  const stOf = x => Math.floor(+x) >= 0 ? int(x, 0, 1e7) : -1;
  const cleanItem = x => isObj(x) && C.isItem(x.k) && Number.isFinite(+x.i) ? {
    i: int(x.i, 1), k: x.k, st: C.isStOnly(x.k) ? Math.max(0, stOf(x.st)) : stOf(x.st), n: str(x.n, 12).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, ''), t: num(x.t), src: str(x.src, 8) } : null;
  // 读进来的存档先整理一遍：缺的补上，类型不对的换掉，每一层都按格式重新拼一遍（多出来的字段一律丢掉），过了周就换周任务。
  // 第 1 版的存档也这样读：磨损、图案模板、玉珏、充值记录这些字段直接丢掉，没用完的钥匙一把换一台货郎，饰品和武器箱照旧。
  // 第 2 版的“本周买了几个箱子”也丢掉（现在不限买，限的是每天开几个）。
  // 第 3 版以前挂着的单是卖给系统的（系统按时间成交）：换成第 4 版时全部撤下，饰品、武器箱、货郎退回来
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
    s.badgeGift = s.badgeGift ? 1 : 0;
    s.appreciation2026 = s.appreciation2026 ? 1 : 0;
    s.promoAll = s.promoAll ? 1 : 0;
    s.heirloomPromo = s.heirloomPromo ? 1 : 0;
    s.promoKeys = Array.from(new Set((Array.isArray(s.promoKeys) ? s.promoKeys : []).filter(k => C.isItem(k))));
    s.badgeOwned = Object.fromEntries(Object.entries(s.badgeOwned).filter(([id, tier]) => own(C.BADGES, id) && own(C.BADGE_TIER, tier)));
    s.badgeEquip = Object.fromEntries(Object.entries(s.badgeEquip).filter(([h, id]) => C.HERO_IDS.includes(h) && own(s.badgeOwned, id)).slice(0, C.HERO_IDS.length));
    const equippedBadges = new Set();
    for (const [h, id] of Object.entries(s.badgeEquip)) { if (equippedBadges.has(id)) delete s.badgeEquip[h]; else equippedBadges.add(id); }
    s.badgeSigils = int(s.badgeSigils, 0, 1e6);
    s.heroKOs = Object.fromEntries(Object.entries(s.heroKOs).filter(([h]) => C.HERO_IDS.includes(h)).map(([h, n]) => [h, int(n, 0, 1e6)]));
    s.stances = Object.fromEntries(Object.entries(s.stances).filter(([h, n]) => C.HERO_IDS.includes(h) && (n === 0 || n === 1) && (n === 0 || (s.heroKOs[h] || 0) >= 20)));
    s.petOwned = Object.fromEntries(Object.entries(s.petOwned).filter(([id, tier]) => own(C.PETS, id) && own(C.PET_TIER, tier)));
    s.petEquip = Object.fromEntries(Object.entries(s.petEquip).filter(([h, id]) => C.HERO_IDS.includes(h) && own(s.petOwned, id)));
    const cleanSU = {};
    for (const [h, v] of Object.entries(s.skillUnlocks)) {
      if (!C.HERO_IDS.includes(h) || !isObj(v)) continue;
      const slots = {};
      for (const sl of C.SKILL_SLOTS) {
        if (Array.isArray(v[sl])) slots[sl] = [...new Set(v[sl].filter(x => x === 'swift' || x === 'heavy'))];
      }
      if (Object.keys(slots).length) cleanSU[h] = slots;
    }
    s.skillUnlocks = cleanSU;
    const cleanSL = {};
    for (const [h, v] of Object.entries(s.skillLoadout)) {
      if (!C.HERO_IDS.includes(h) || !isObj(v)) continue;
      const slots = {};
      for (const sl of C.SKILL_SLOTS) {
        const pick = v[sl];
        if (pick === 'std' || ((pick === 'swift' || pick === 'heavy') && ((cleanSU[h] && cleanSU[h][sl]) || []).includes(pick))) slots[sl] = pick;
      }
      if (Object.keys(slots).length) cleanSL[h] = slots;
    }
    s.skillLoadout = cleanSL;
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
    }).filter(Boolean).slice(0, C.INV_MAX);
    let top = 0;
    for (const x of s.inv) top = Math.max(top, x.i);
    for (const L of s.lst) top = Math.max(top, L.it.i);
    s.nid = Math.max(int(s.nid, 1), top + 1);
    s.via = Array.from(new Set(s.via.filter(k => C.isItem(k))));
    s.eq = Object.fromEntries(Object.entries(s.eq).filter(([c, id]) => C.HERO_IDS.includes(c) && s.inv.some(x => x.i === id && C.charOf(x.k) === c)));
    s.hist = s.hist.filter(isObj).slice(0, C.HIST_MAX).map(h => ({ t: num(h.t), kind: ['buy', 'sell', 'sold', 'term', 'upgrade'].includes(h.kind) ? h.kind : 'sell',
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
    s.hw = isObj(s.hw) ? { w: int(s.hw.w), n: int(s.hw.n, 0, 1000) } : { w: 0, n: 0 };
    if (!s.zf) s.cases.c8++;   // 每个号送 1 个星座武器箱（只送一次，老号第一次读到这一版的时候送）
    s.zf = 1;
    s.drop = { w: int(s.drop.w), g: int(s.drop.g, 0, 1e6), n: int(s.drop.n, 0, 1e6), sup: s.drop.sup ? 1 : 0 };
    s.dm = { d: int(s.dm.d), n: int(s.dm.n, 0, 1e6) };
    const tm = s.tm, o = isObj(tm) && isObj(tm.o) && C.isItem(tm.o.k) ? tm.o : null;
    s.tm = o ? { t0: num(tm.t0), n: int(tm.n, 1, C.TERM.offers), o: { k: o.k, st: C.isStOnly(o.k) ? Math.max(0, stOf(o.st)) : stOf(o.st), price: int(o.price, 1, 1e8) } } : null;
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
    if (s.hw.w !== wk) s.hw = { w: wk, n: 0 };
    if (s.drop.w !== wk) s.drop = { w: wk, g: 0, n: 0, sup: 0 };
    if (s.op.s !== se.id) s.op = { s: se.id, earned: 0, spent: 0, w: 0, ms: [], prog: {}, done: [] };
    if (s.op.w !== wk) Object.assign(s.op, { w: wk, ms: C.genMissions(env.uid, wk), prog: {}, done: [] });
    if (s.dm.d !== day) s.dm = { d: day, n: 0 };
    s.rw = C.rwClean(s.rw, env, day, wk);
    if (s.tm && !(now - s.tm.t0 < C.TERM.days * 86400e3)) s.tm = null;   // 开封超过 3 天：作废
    return s;
  };
  const STAGE_RE = /^([1-9]\d?)\.([1-9])$/;
  C.stageOk = id => { const m = STAGE_RE.exec(String(id)); return !!m && +m[1] <= C.HERO_IDS.length && +m[2] <= C.RW.stages; };   // 关卡编号「第几章.第几关」：一位侠客一章，每章 5 关
  const END_RE = /^[a-z0-9_]{1,16}$/;
  const cnt = o => ({ games: int(o && o.games, 0, 1e6), wins: int(o && o.wins, 0, 1e6), combo: int(o && o.combo, 0, 1e6), ults: int(o && o.ults, 0, 1e6) });
  C.rwClean = (r, env, day, wk) => {
    if (!isObj(r)) r = C.rwBlank();
    const o = { d: int(r.d), w: int(r.w), dp: cnt(r.dp), wp: cnt(r.wp), dc: [], wc: [], ev: int(r.ev, 0, 1e6), ec: r.ec ? 1 : 0, comp: r.comp ? 1 : 0, tut: r.tut ? 1 : 0, ss: {}, sg: {}, seeded: r.seeded ? 1 : 0 };
    o.dc = Array.from(new Set((Array.isArray(r.dc) ? r.dc : []).filter(id => own(C.TASKS, id) && C.TASKS[id][0] === 'd')));
    o.wc = Array.from(new Set((Array.isArray(r.wc) ? r.wc : []).filter(id => own(C.TASKS, id) && C.TASKS[id][0] === 'w')));
    if (isObj(r.ss)) for (const [id, n] of Object.entries(r.ss)) if (C.stageOk(id)) o.ss[id] = int(n, 0, 3);
    if (isObj(r.sg)) for (const [h, v] of Object.entries(r.sg)) if (C.HERO_IDS.includes(h) && isObj(v)) o.sg[h] = { n: int(v.n, 0, (1 << C.RW.sagaNodes) - 1), e: Array.from(new Set((Array.isArray(v.e) ? v.e : []).filter(x => typeof x === 'string' && END_RE.test(x)))).slice(0, C.RW.sagaEnds) };
    // 第一次建这份记录：服务器上已经有的关卡星、列传进度当成领过了（老号不能把已经拿过的再领一遍）
    if (!o.seeded && env && isObj(env.seed)) {
      if (isObj(env.seed.ss)) for (const [id, n] of Object.entries(env.seed.ss)) if (C.stageOk(id)) o.ss[id] = Math.max(o.ss[id] || 0, int(n, 0, 3));
      if (isObj(env.seed.sg)) for (const [h, v] of Object.entries(env.seed.sg)) {
        if (!C.HERO_IDS.includes(h) || !isObj(v)) continue;
        const e = (Array.isArray(v.e) ? v.e : []).filter(x => typeof x === 'string' && END_RE.test(x));
        const g = o.sg[h] || { n: 0, e: [] };
        g.n |= e.length ? (1 << C.RW.sagaNodes) - 1 : (1 << int(v.s, 0, C.RW.sagaNodes)) - 1;   // 节点墨锭只在第一次走、还没拿到结局时给
        g.e = Array.from(new Set([...g.e, ...e])).slice(0, C.RW.sagaEnds);
        o.sg[h] = g;
      }
      o.seeded = 1;
    }
    if (day !== undefined && o.d !== day) Object.assign(o, { d: day, dp: cnt(null), dc: [] });
    if (wk !== undefined && o.w !== wk) Object.assign(o, { w: wk, wp: cnt(null), wc: [] });
    return o;
  };
  // 一局服务器认了：记进今天、这周的任务进度；活动期间的人机局记进活动任务
  const rwMatch = (s, c, env) => {
    const r = s.rw, win = !!c.win, combo = int(c.combo, 0, 200), ults = int(c.ults, 0, 30);
    for (const p of [r.dp, r.wp]) { p.games++; if (win) p.wins++; p.combo = Math.max(p.combo, combo); p.ults += ults; }
    if (c.mode === 'cpu' && C.inEvent(env.now)) r.ev++;
  };
  // 任务现在的样子（网页显示用）：进度、领没领过
  C.taskView = (s, now) => {
    const r0 = s && s.rw ? s.rw : C.rwBlank(), day = C.day(now), wk = C.week(day);
    const r = { ...r0, dp: r0.d === day ? r0.dp : cnt(null), dc: r0.d === day ? r0.dc : [], wp: r0.w === wk ? r0.wp : cnt(null), wc: r0.w === wk ? r0.wc : [] }, out = [];
    for (const [id, [per, k, n, ink]] of Object.entries(C.TASKS)) {
      if (per === 'e' && !C.inEvent(now)) continue;
      const v = per === 'd' ? r.dp[k] : per === 'w' ? r.wp[k] : r.ev, done = per === 'd' ? r.dc.includes(id) : per === 'w' ? r.wc.includes(id) : !!r.ec;
      out.push({ id, per, target: n, prog: Math.min(n, v || 0), reward: ink, claimed: done });
    }
    return out;
  };
  // 给玩家看的那份：开局领的票只有服务器知道
  C.publicState = s => { const o = JSON.parse(JSON.stringify(s)); delete o.tk; return o; };
  // 武库专属内容（24 款涂装、5 款 ★、神兵武器箱新增的 7 款和星座武器箱的 36 款）：服务器只认库存里真有的
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
    const rawSt = o.st !== undefined ? o.st : (rnd() < (o.stP !== undefined ? o.stP : C.ST_P) ? 0 : -1);
    const st = C.isStOnly(k) ? Math.max(0, Math.floor(+rawSt) || 0) : rawSt;
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
  // 货郎报的价：随机一档品质、这一档里随机一件（不含天工传世典藏），五分之一是斩数版；价格是这一件基准价的 1.2~1.5 倍
  C.termOffer = (rnd, cfg) => {
    const pool = C.ofTier(rollTier(rnd, C.TERM.odds)).filter(x => !C.isHeirloom(x));
    const k = pickOf(rnd, pool.length ? pool : C.ofTier('mil')), st = rnd() < C.cv(cfg, 'stP') ? 0 : -1;
    const lo = C.cv(cfg, 'term.lo'), m = lo + rnd() * (C.cv(cfg, 'term.hi') - lo);
    return { k, st, price: Math.max(1, Math.round(C.refVal({ k, st }) * m)) };
  };
  // 熔铸契能出什么：每件材料平分它所在收藏品里高一档的那些饰品
  C.tradeCheck = (s, ids) => {
    if (!Array.isArray(ids) || !ids.length) return { err: '还没放材料' };
    const uniq = Array.from(new Set(ids.map(Number)));
    if (uniq.length !== ids.length) return { err: '同一件放了两次' };
    const items = uniq.map(id => C.findItem(s, id));
    if (items.some(x => !x)) return { err: '有材料已经不在库存里了' };
    const tier = C.ITEM[items[0].k].tier, up = C.UP[tier];
    if (!up) return { err: '★ 绝世已经是最高一档' };
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
    if (col.prem) (s[col.cnt] || (s[col.cnt] = col.daily ? { d: C.day(env.now), n: 0 } : { w: C.week(C.day(env.now)), n: 0 })).n++; else s.od.n++;
    const tier = rollTier(env.rnd, C.oddsOf(cid, env.cfg)), pool = col[tier];
    const unowned = col.heirloom ? pool.filter(x => !s.inv.some(it => it.k === x) && !(s.lst || []).some(L => L && L.it && L.it.k === x)) : [];
    const k = pickOf(env.rnd, unowned.length ? unowned : pool);
    const it = C.addItem(s, C.mkItem(s, k, 'case', env.rnd, { stP: C.cv(env.cfg, 'stP') }), env);
    bump(s, 'open', 1);
    return { ok: true, item: it };
  };
  // One authoritative transaction per batch; keep the audit's item list complete.
  A.openAll = (s, a, env) => {
    const items = [], cases = {};
    for (const cid of C.CASES) {
      while ((s.cases[cid] || 0) > 0 && C.openLeft(s, cid, env.cfg) > 0 && items.length < 500 && !C.invFull(s)) {
        const r = A.open(s, { c: cid }, env);
        if (!r.ok) return items.length ? { ok: true, items, cases } : r;
        items.push(r.item); cases[cid] = (cases[cid] || 0) + 1;
      }
    }
    return items.length ? { ok: true, items, cases } : { err: '没有可以开启的武器箱' };
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
  // 商店：武器箱、货郎按固定价格买，不限量（限的是每天开几个）；买来的不能转卖
  const shopBuy = (s, k, a, env) => {
    const n = a.n === undefined ? 1 : +a.n;
    if (!(Number.isInteger(n) && n >= 1 && n <= 10)) return { err: '数量不对' };
    const p = C.shopPrice(k, env.cfg) * n;
    if (!(p >= 0 && Number.isSafeInteger(p))) return { err: '价格不正确' };
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
    if (a.c !== undefined) return { err: '武器箱和货郎只在商店按固定价格卖，不能挂到市场' };
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
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
    for (const id of Array.isArray(env.back) ? env.back.slice(0, C.LIST_CHECK) : []) {
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
  A.listDupes = (s, a, env) => {   // 一键自动挂牌市场：保留最高斩数/穿着那一件，其余全部挂牌出售（不受 50 件限制）
    const m = env.mkt;
    if (!m || (!C.isLid(m.id) && !Array.isArray(m.ids))) return { err: NO_MKT };
    const plan = C.dupePlan(s);
    if (!plan.items.length) return { err: '库存里没有重复的饰品' };
    const ids = Array.isArray(m.ids) ? m.ids.slice() : [m.id];
    const toList = plan.items.slice(0, ids.length);
    const listed = [];
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
  A.upgradeSt = (s, a, env) => {
    const id = +a.i;
    if (!Number.isSafeInteger(id) || id < 1) return { err: '饰品编号不对' };
    const listed = s.lst.find(L => L.it.i === id);
    if (listed) return { err: '这件饰品挂在玩家市场上，撤下后才能升级' };
    const it = C.findItem(s, id); if (!it) return { err: '库存里没有这件' };
    if (it.st >= 0) return { err: '这件已经是斩数版了' };
    const cost = C.ST_UPGRADE_COST[C.ITEM[it.k].tier];
    if (!Number.isSafeInteger(cost) || cost < 0) return { err: '升级价格设置不正确' };
    if (env.ink < cost) return { err: `墨锭不够，升级要 ${cost}` };
    giveInk(env, -cost);
    it.st = 0;
    histPush(s, { t: env.now, kind: 'upgrade', k: it.k, st: it.st, price: cost });
    return { ok: true, item: it, price: cost };
  };
  C.upgradeAllQuote = s => {
    const items = (s && Array.isArray(s.inv) ? s.inv : []).filter(it => it && it.st < 0 && C.ITEM[it.k]);
    const basePrice = items.reduce((sum, it) => sum + (C.ST_UPGRADE_COST[C.ITEM[it.k].tier] || 0), 0);
    const price = Math.floor(basePrice * 0.8);
    return { count: items.length, basePrice, discount: basePrice - price, price };
  };
  A.upgradeAllSt = (s, a, env) => {
    const items = s.inv.filter(it => it.st < 0 && C.ITEM[it.k]);
    const quote = C.upgradeAllQuote(s);
    if (!items.length) return { err: '库存里没有普通饰品可升级' };
    if (+a.count !== quote.count || +a.price !== quote.price) return { err: '库存或价格已变化，请刷新后重新确认' };
    if (items.some(it => !Number.isSafeInteger(C.ST_UPGRADE_COST[C.ITEM[it.k].tier]) || C.ST_UPGRADE_COST[C.ITEM[it.k].tier] < 0)) return { err: '升级价格设置不正确' };
    if (env.ink < quote.price) return { err: `墨锭不够，批量升级要 ${quote.price}` };
    giveInk(env, -quote.price);
    const charges = items.map(it => Math.floor(C.ST_UPGRADE_COST[C.ITEM[it.k].tier] * quote.price / quote.basePrice));
    let remainder = quote.price - charges.reduce((sum, cost) => sum + cost, 0);
    for (let i = 0; remainder > 0; i = (i + 1) % charges.length, remainder--) charges[i]++;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; it.st = 0;
      histPush(s, { t: env.now, kind: 'upgrade', k: it.k, st: it.st, price: charges[i] });
    }
    return { ok: true, count: items.length, basePrice: quote.basePrice, discount: quote.discount, price: quote.price };
  };
  A.equip = (s, a, env) => {
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
    const char = C.charOf(it.k);
    if (!char) return { err: '这件穿不上' };
    s.eq[char] = it.i; env.equip[char] = it.k;
    return { ok: true, char };
  };
  A.badgeGift = (s, a) => {
    const id = String(a.id || '');
    if (s.badgeGift) return { err: '已经领过徽记礼了' };
    if (!own(C.BADGES, id)) return { err: '没有这枚徽记' };
    s.badgeOwned[id] = 'silver'; s.badgeGift = 1;
    return { ok: true, id, tier: 'silver' };
  };
  A.badgeEquip = (s, a) => {
    const hero = String(a.hero || ''), id = String(a.id || '');
    if (!C.HERO_IDS.includes(hero)) return { err: '没有这位侠客' };
    if (id && !own(s.badgeOwned, id)) return { err: '还没有这枚徽记' };
    for (const h of Object.keys(s.badgeEquip)) if (s.badgeEquip[h] === id || h === hero) delete s.badgeEquip[h];
    if (id) s.badgeEquip[hero] = id;
    return { ok: true, hero, id };
  };
  A.stanceSet = (s, a) => {
    const hero = String(a.hero || ''), stance = +a.stance;
    if (!C.HERO_IDS.includes(hero) || (stance !== 0 && stance !== 1)) return { err: '架势设置不正确' };
    if (stance && (s.heroKOs[hero] || 0) < 20) return { err: '这位侠客还没有解锁第二架势' };
    s.stances[hero] = stance;
    return { ok: true, hero, stance };
  };
  A.badgeUpgrade = (s, a, env) => {
    const id = String(a.id || ''), tier = s.badgeOwned[id], rule = C.BADGE_UPGRADE[tier];
    if (!rule) return { err: '这枚徽记已升至最高阶' };
    const totalKOs = Object.values(s.heroKOs).reduce((sum, n) => sum + n, 0);
    if (totalKOs < rule.kos) return { err: `累计斩获 ${rule.kos} 次后才可升阶` };
    if (s.badgeSigils < rule.sigils) return { err: `徽记碎片不足，需要 ${rule.sigils} 枚` };
    if (env.ink < rule.ink) return { err: `墨锭不足，需要 ${rule.ink}` };
    s.badgeSigils -= rule.sigils; giveInk(env, -rule.ink); s.badgeOwned[id] = rule.to;
    return { ok: true, id, tier: rule.to, sigils: s.badgeSigils, ink: rule.ink };
  };
  A.badgeUnlock = (s, a, env) => {
    const id = String(a.id || '');
    if (!own(C.BADGES, id)) return { err: '没有这枚徽记' };
    if (own(s.badgeOwned, id)) return { err: '已经拥有这枚徽记' };
    if (s.badgeSigils >= C.BADGE_UNLOCK_SIGILS) {
      s.badgeSigils -= C.BADGE_UNLOCK_SIGILS;
      s.badgeOwned[id] = 'silver';
      return { ok: true, id, tier: 'silver', sigils: s.badgeSigils, usedSigils: C.BADGE_UNLOCK_SIGILS };
    }
    if (env.ink < C.BADGE_UNLOCK_INK) return { err: `需要 ${C.BADGE_UNLOCK_SIGILS} 枚徽记碎片或 ${C.BADGE_UNLOCK_INK} 墨锭` };
    giveInk(env, -C.BADGE_UNLOCK_INK);
    s.badgeOwned[id] = 'silver';
    return { ok: true, id, tier: 'silver', ink: C.BADGE_UNLOCK_INK };
  };
  A.claimAppreciation = (s, a, env) => {
    if (s.appreciation2026) return { err: '已经领取过感恩盛典全员大礼了' };
    const chosen = own(C.BADGES, String((a && a.badgeId) || '')) ? String(a.badgeId) : 'flowing';
    s.appreciation2026 = 1;
    s.badgeGift = 1;
    s.badgeOwned[chosen] = 'purpgold';
    s.badgeSigils = Math.min(1e6, (s.badgeSigils || 0) + 50);
    s.term = Math.min(1e6, (s.term || 0) + 10);
    s.tags = Math.min(1e6, (s.tags || 0) + 10);
    for (const c of C.CASES) if (!C.COLS[c].heirloom) s.cases[c] = Math.min(1e6, (s.cases[c] || 0) + 10);
    for (const pid of Object.keys(C.PETS)) if (!s.petOwned[pid]) s.petOwned[pid] = 'spirit';
    for (const h of C.HERO_IDS) {
      s.heroKOs[h] = Math.max(s.heroKOs[h] || 0, 20);
      s.skillUnlocks[h] = { q: ['swift', 'heavy'], r: ['swift', 'heavy'], e: ['swift', 'heavy'] };
    }
    giveInk(env, 50000);
    return { ok: true, badgeId: chosen, tier: 'purpgold', ink: 50000, sigils: 50 };
  };
  const HERO_ARCH = {
    qingfeng: 'swordsman', lingshuang: 'swordsman', yuehua: 'swordsman',
    feiying: 'assassin', lingque: 'assassin', liying: 'assassin',
    tieshan: 'tank', gouchen: 'tank', xuanwu: 'tank',
    leiming: 'fighter', zuixian: 'fighter', chixiao: 'fighter', yanling: 'fighter',
    liuyun: 'support', yuxiao: 'support', qingluan: 'support',
    moyu: 'controller', cixian: 'controller', qianji: 'controller', xuanji: 'controller',
  };
  A.badgeAutoAssign = (s) => {
    const owned = Object.entries(s.badgeOwned || {})
      .filter(([id]) => own(C.BADGES, id))
      .sort((a, b) => (C.BADGE_TIER[b[1]] || 0) - (C.BADGE_TIER[a[1]] || 0)
        || (C.BADGE_RARITY_RANK[C.BADGES[b[0]].rarity] || 0) - (C.BADGE_RARITY_RANK[C.BADGES[a[0]].rarity] || 0)
        || a[0].localeCompare(b[0]));
    if (!owned.length) return { err: '还没有任何武学徽记可装配' };
    const PREF = {
      offense: ['swordsman', 'fighter', 'assassin', 'tank', 'controller', 'support'],
      defense: ['tank', 'fighter', 'swordsman', 'support', 'controller', 'assassin'],
      mobility: ['assassin', 'swordsman', 'fighter', 'support', 'controller', 'tank'],
      mastery: ['controller', 'swordsman', 'support', 'assassin', 'fighter', 'tank'],
      team: ['support', 'controller', 'tank', 'fighter', 'swordsman', 'assassin'],
    };
    s.badgeEquip = {};   // 覆盖所有现有徽记限制与旧装配，全阵容重新智能分配
    const usedHeroes = new Set();
    let assigned = 0;
    for (const [bid] of owned) {
      if (usedHeroes.size >= C.HERO_IDS.length) break;
      const cat = (C.BADGES[bid] && C.BADGES[bid].cat) || 'offense';
      const order = PREF[cat] || PREF.offense;
      let chosenHero = '';
      for (const arch of order) {
        chosenHero = C.HERO_IDS.find(h => !usedHeroes.has(h) && (HERO_ARCH[h] || 'fighter') === arch) || '';
        if (chosenHero) break;
      }
      if (!chosenHero) chosenHero = C.HERO_IDS.find(h => !usedHeroes.has(h)) || '';
      if (!chosenHero) break;
      s.badgeEquip[chosenHero] = bid;
      usedHeroes.add(chosenHero);
      assigned++;
    }
    return { ok: true, assigned, badgeEquip: s.badgeEquip };
  };
  // FULL AUTO：全自动一键管理 —— 覆盖重配全阵容徽记、穿戴最优皮肤、匹配最佳灵宠、启用已解锁二式架势与招式流派，
  // 并无上限直接变现全部可售饰品（含库存重复饰品与玩家市场上尚未成交的在售挂单），立即结算为墨锭
  A.fullAuto = (s, a, env) => {
    let badges = 0, skins = 0, pets = 0, stances = 0, skills = 0, soldCount = 0, soldDupesCount = 0, soldMarketCount = 0, inkGain = 0;
    if (Object.keys(s.badgeOwned || {}).length) {
      const br = A.badgeAutoAssign(s);
      if (br && br.ok) badges = br.assigned || 0;
    }
    const tierRank = k => C.TIERS.indexOf((C.ITEM[k] && C.ITEM[k].tier) || 'mil');
    const byHero = {};
    for (const it of s.inv) {
      const h = C.charOf(it.k);
      if (!h) continue;
      if (!byHero[h]) byHero[h] = [];
      byHero[h].push(it);
    }
    for (const h of C.HERO_IDS) {
      const list = byHero[h];
      if (!list || !list.length) continue;
      list.sort((x, y) => (C.isHeirloom(y.k) ? 1 : 0) - (C.isHeirloom(x.k) ? 1 : 0) || tierRank(y.k) - tierRank(x.k) || (y.st >= 0 ? 1 : 0) - (x.st >= 0 ? 1 : 0) || (y.st - x.st) || (y.i - x.i));
      const best = list[0];
      s.eq[h] = best.i;
      env.equip[h] = best.k;
      skins++;
    }
    const ownedPets = Object.entries(s.petOwned || {}).filter(([id]) => own(C.PETS, id));
    if (ownedPets.length) {
      const PET_PREF = {
        swordsman: ['attack', 'control', 'support', 'defense'],
        assassin: ['control', 'attack', 'support', 'defense'],
        tank: ['defense', 'support', 'attack', 'control'],
        fighter: ['attack', 'defense', 'support', 'control'],
        support: ['support', 'control', 'defense', 'attack'],
        controller: ['control', 'support', 'attack', 'defense'],
      };
      for (const h of C.HERO_IDS) {
        const arch = HERO_ARCH[h] || 'fighter';
        const pref = PET_PREF[arch] || PET_PREF.fighter;
        const ranked = ownedPets.slice().sort((x, y) => {
          const px = C.PETS[x[0]], py = C.PETS[y[0]];
          const tx = C.PET_TIER[x[1]] || 0, ty = C.PET_TIER[y[1]] || 0;
          if (ty !== tx) return ty - tx;
          const rx = C.BADGE_RARITY_RANK[px.rarity] || 0, ry = C.BADGE_RARITY_RANK[py.rarity] || 0;
          if (ry !== rx) return ry - rx;
          const ix = pref.indexOf(px.cat), iy = pref.indexOf(py.cat);
          return (ix < 0 ? 9 : ix) - (iy < 0 ? 9 : iy) || x[0].localeCompare(y[0]);
        });
        if (ranked.length) { s.petEquip[h] = ranked[0][0]; pets++; }
      }
    }
    const SWIFT_ARCH = new Set(['assassin', 'swordsman', 'support']);
    for (const h of C.HERO_IDS) {
      if ((s.heroKOs[h] || 0) >= 20) { s.stances[h] = 1; stances++; }
      const su = s.skillUnlocks[h];
      if (su && isObj(su)) {
        const want = SWIFT_ARCH.has(HERO_ARCH[h]) ? 'swift' : 'heavy';
        const alt = want === 'swift' ? 'heavy' : 'swift';
        for (const sl of C.SKILL_SLOTS) {
          const unl = Array.isArray(su[sl]) ? su[sl] : [];
          const pick = unl.includes(want) ? want : unl.includes(alt) ? alt : 'std';
          if (!s.skillLoadout[h]) s.skillLoadout[h] = {};
          s.skillLoadout[h][sl] = pick;
          if (pick !== 'std') skills++;
        }
      }
    }
    // 直接变现玩家市场上所有仍在售（未成交）的挂单，无需等待买家；已成交的挂单保留给 settle 结账，避免重复发奖
    const openIds = env.server && env.mkt && env.mkt.openIds instanceof Set ? env.mkt.openIds : null;
    const cancelledIds = [], keepLst = [];
    for (const L of s.lst) {
      if (!L || !L.it || !C.isItem(L.it.k)) continue;
      if (openIds && !openIds.has(L.l)) { keepLst.push(L); continue; }
      const val = C.refVal(L.it);
      giveInk(env, val);
      s.stat.sold++;
      histPush(s, { t: env.now, kind: 'sell', k: L.it.k, st: L.it.st, price: val, gain: val });
      soldMarketCount++;
      soldCount++;
      inkGain += val;
      bump(s, 'sell', 1);
      cancelledIds.push(L.l);
    }
    s.lst = keepLst;
    if (cancelledIds.length && env.mkt) env.mkt.out = { cancelMany: cancelledIds };
    // 无数量上限直接出售库存中的全部重复饰品
    const plan = C.dupePlan(s);
    if (plan.items.length) {
      for (const d of plan.items) {
        const it = C.dropItem(s, d.i, env);
        if (!it) continue;
        const val = C.refVal(it);
        giveInk(env, val);
        s.stat.sold++;
        histPush(s, { t: env.now, kind: 'sell', k: it.k, st: it.st, price: val, gain: val });
        soldDupesCount++;
        soldCount++;
        inkGain += val;
        bump(s, 'sell', 1);
      }
    }
    return { ok: true, badges, skins, pets, stances, skills, soldCount, soldDupesCount, soldMarketCount, inkGain };
  };
  A.petBuy = (s, a, env) => {
    const id = String(a.id || '');
    if (!own(C.PETS, id)) return { err: '没有这只灵宠' };
    if (own(s.petOwned, id)) return { err: '已经收养这只灵宠' };
    if (env.ink < C.PET_BUY_COST) return { err: `墨锭不足，需要 ${C.PET_BUY_COST}` };
    giveInk(env, -C.PET_BUY_COST);
    s.petOwned[id] = 'basic';
    return { ok: true, id, tier: 'basic', ink: C.PET_BUY_COST };
  };
  A.petUpgrade = (s, a, env) => {
    const id = String(a.id || ''), tier = s.petOwned[id], rule = C.PET_UPGRADE[tier];
    if (!own(s.petOwned, id)) return { err: '还没有这只灵宠' };
    if (!rule) return { err: '这只灵宠已升至最高阶' };
    const totalKOs = Object.values(s.heroKOs).reduce((sum, n) => sum + n, 0);
    if (totalKOs < rule.kos) return { err: `累计斩获 ${rule.kos} 次后才可进阶` };
    if (env.ink < rule.ink) return { err: `墨锭不足，需要 ${rule.ink}` };
    giveInk(env, -rule.ink);
    s.petOwned[id] = rule.to;
    return { ok: true, id, tier: rule.to, ink: rule.ink };
  };
  A.petEquip = (s, a) => {
    const hero = String(a.hero || ''), id = String(a.id || '');
    if (!C.HERO_IDS.includes(hero)) return { err: '没有这位侠客' };
    if (id && !own(s.petOwned, id)) return { err: '还没有这只灵宠' };
    if (id) s.petEquip[hero] = id; else delete s.petEquip[hero];
    return { ok: true, hero, id };
  };
  A.skillUnlock = (s, a, env) => {
    const hero = String(a.hero || ''), slot = String(a.slot || ''), variant = String(a.variant || '');
    if (!C.HERO_IDS.includes(hero)) return { err: '没有这位侠客' };
    if (!C.SKILL_SLOTS.includes(slot)) return { err: '技能槽位不正确' };
    if (variant !== 'swift' && variant !== 'heavy') return { err: '招式流派不正确' };
    const cur = (s.skillUnlocks[hero] && s.skillUnlocks[hero][slot]) || [];
    if (cur.includes(variant)) return { err: '已解锁该招式流派' };
    const spec = C.SKILL_VARIANTS[variant];
    const kos = s.heroKOs[hero] || 0;
    let spent = 0;
    if (kos < spec.kos) {
      if (env.ink < spec.cost) return { err: `需要 ${spec.kos} 斩或 ${spec.cost} 墨锭解锁` };
      giveInk(env, -spec.cost); spent = spec.cost;
    }
    if (!s.skillUnlocks[hero]) s.skillUnlocks[hero] = {};
    s.skillUnlocks[hero][slot] = [...cur, variant];
    return { ok: true, hero, slot, variant, ink: spent };
  };
  A.skillSet = (s, a) => {
    const hero = String(a.hero || ''), slot = String(a.slot || ''), variant = String(a.variant || 'std');
    if (!C.HERO_IDS.includes(hero)) return { err: '没有这位侠客' };
    if (!C.SKILL_SLOTS.includes(slot)) return { err: '技能槽位不正确' };
    if (!own(C.SKILL_VARIANTS, variant)) return { err: '招式流派不正确' };
    if (variant !== 'std') {
      const cur = (s.skillUnlocks[hero] && s.skillUnlocks[hero][slot]) || [];
      if (!cur.includes(variant)) return { err: '尚未解锁该招式流派' };
    }
    if (!s.skillLoadout[hero]) s.skillLoadout[hero] = {};
    s.skillLoadout[hero][slot] = variant;
    return { ok: true, hero, slot, variant };
  };
  A.unequip = (s, a, env) => {
    const char = String(a.char || ''); if (!C.HERO_IDS.includes(char)) return { err: '没有这位侠客' };
    delete s.eq[char]; env.equip[char] = '';
    return { ok: true };
  };
  // 货郎：开封给第一件；不要就换下一件（第 5 件也不要，货郎就没了）；买下就用掉
  A.unseal = (s, a, env) => {
    if (s.tm) return { err: '已经有一台开着的货郎，先处理完它' };
    if (s.term < 1) return { err: '没有货郎' };
    s.term--;
    s.tm = { t0: env.now, n: 1, o: C.termOffer(env.rnd, env.cfg) };
    return { ok: true, tm: s.tm };
  };
  A.termNext = (s, a, env) => {
    if (!s.tm) return { err: '没有开着的货郎' };
    if (a.n !== undefined && +a.n !== s.tm.n) return { err: '这一件已经换掉了，刷新看看' };   // 点得太快、请求重发：不会一下跳过两件
    if (s.tm.n >= C.TERM.offers) { s.tm = null; return { ok: true, gone: true }; }
    s.tm.n++; s.tm.o = C.termOffer(env.rnd, env.cfg);
    return { ok: true, tm: s.tm };
  };
  A.termBuy = (s, a, env) => {
    const tm = s.tm; if (!tm) return { err: '没有开着的货郎' };
    if (a.n !== undefined && +a.n !== tm.n) return { err: '这一件已经换掉了，刷新看看' };   // 点“买下”时看到的是第几件
    if (C.invFull(s)) return { err: '库存满了' };
    if (env.ink < tm.o.price) return { err: `墨锭不够，要 ${tm.o.price}` };
    giveInk(env, -tm.o.price);
    const it = C.addItem(s, C.mkItem(s, tm.o.k, 'term', env.rnd, { st: tm.o.st }), env);
    histPush(s, { t: env.now, kind: 'term', k: tm.o.k, st: tm.o.st, price: tm.o.price });
    s.tm = null; s.stat.term++;
    return { ok: true, item: it, price: tm.o.price };
  };
  // 批量开启全部可用货郎（含已开封尚未处理的货郎与所有未开封货郎，单次事务最多 500 台，前端自动接续循环）
  A.termOpenAll = (s, a, env) => {
    const items = [];
    if (s.tm && s.tm.o && C.isItem(s.tm.o.k)) {
      const o = s.tm.o;
      const it = C.addItem(s, C.mkItem(s, o.k, 'term', env.rnd, { st: o.st }), env);
      histPush(s, { t: env.now, kind: 'term', k: o.k, st: o.st, price: 0 });
      s.tm = null;
      s.stat.term++;
      items.push(it);
    }
    while (s.term > 0 && items.length < 500 && !C.invFull(s)) {
      s.term--;
      const o = C.termOffer(env.rnd, env.cfg);
      const it = C.addItem(s, C.mkItem(s, o.k, 'term', env.rnd, { st: o.st }), env);
      histPush(s, { t: env.now, kind: 'term', k: o.k, st: o.st, price: 0 });
      s.stat.term++;
      items.push(it);
    }
    return items.length ? { ok: true, count: items.length, remaining: s.term, items } : { err: '没有可开启的货郎' };
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
      if (g.id === 'cov') { if (!(C.isItem(a.k) && C.ITEM[a.k].tier === 'cov' && !C.isPrem(a.k))) return { err: '要从普通武器箱的赤霄级里挑一件' }; k = a.k; }
      else k = pickOf(r, C.ofTierReg(g.id));
      res.item = C.addItem(s, C.mkItem(s, k, 'op', r, { stP: C.cv(env.cfg, 'stP') }), env);
    }
    s.op.spent += g.cost;
    return res;
  };
  // 集齐一套收藏品的 4 款精铁：送这个武器箱一个和一张改名标签
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
      if (!tk || tk.mode !== c.mode || env.now - tk.t0 < C.MATCH_MIN_MS || env.now - tk.t0 > C.MATCH_MAX_MS) return { err: '这局时间不对，不算' };
      if (env.now - (s.last || 0) < C.MATCH_GAP_MS) return { err: '太快了，不算' };
      if (s.dm.n >= C.MATCH_DAY_CAP) return { err: '今天的对局奖励已经拿满了' };
    }
    s.last = env.now; s.dm.n++;
    rwMatch(s, c, env);
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
    const totalBefore = Object.values(s.heroKOs).reduce((sum, n) => sum + n, 0);
    let koLeft = C.KO_MAX;
    for (const [h, raw] of Object.entries(isObj(c.ko) ? c.ko : {}).slice(0, 3)) {
      if (!C.HERO_IDS.includes(h) || !Number.isFinite(+raw) || +raw <= 0 || koLeft <= 0) continue;
      const add = Math.min(koLeft, Math.floor(+raw));
      koLeft -= add;
      const old = s.heroKOs[h] || 0;
      s.heroKOs[h] = Math.min(1e6, old + add);
      if (old < 20 && s.heroKOs[h] >= 20) res.stanceUnlocks = (res.stanceUnlocks || []).concat(h);
    }
    const totalAfter = Object.values(s.heroKOs).reduce((sum, n) => sum + n, 0);
    const sigils = Math.floor(totalAfter / C.BADGE_SIGIL_KOS) - Math.floor(totalBefore / C.BADGE_SIGIL_KOS);
    if (sigils > 0) { s.badgeSigils = Math.min(1e6, s.badgeSigils + sigils); res.badgeSigils = sigils; }
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
  // 全服全内容解锁（动态读取当前目录，不重复发放已有饰品；记录已发过的 promoKeys 以便未来新内容自动补齐而不刷旧饰品）
  C.applyPromoAll = (s, env, opts = {}) => {
    const first = !!opts.firstClaim || !s.promoAll;
    s.promoAll = 1;
    s.badgeGift = 1;
    if (first) {
      giveInk(env, C.UNIVERSAL_PROMO_INK);
      for (const cid of C.CASES) if (!C.COLS[cid].heirloom) s.cases[cid] = Math.min(1e6, (s.cases[cid] || 0) + C.UNIVERSAL_PROMO_CASES);
      s.term = Math.min(1e6, (s.term || 0) + 10);
      s.tags = Math.min(1e6, (s.tags || 0) + 10);
      s.badgeSigils = Math.min(1e6, (s.badgeSigils || 0) + 100);
    }
    const seenKeys = new Set(Array.isArray(s.promoKeys) ? s.promoKeys : []);
    const haveInv = new Set(s.inv.map(x => x.k));
    const haveLst = new Set((s.lst || []).map(L => L && L.it && L.it.k).filter(Boolean));
    let addedSkins = 0;
    for (const k of Object.keys(C.ITEM)) {
      if (C.isHeirloom(k)) continue;
      if (!seenKeys.has(k) && !haveInv.has(k) && !haveLst.has(k) && s.inv.length < C.INV_MAX) {
        C.addItem(s, C.mkItem(s, k, 'promo', env.rnd, { st: -1 }), env);
        haveInv.add(k);
        addedSkins++;
      }
      seenKeys.add(k);
    }
    s.promoKeys = Array.from(seenKeys);
    let addedBadges = 0;
    for (const bid of Object.keys(C.BADGES)) {
      if (s.badgeOwned[bid] !== 'purpgold') { s.badgeOwned[bid] = 'purpgold'; addedBadges++; }
    }
    let addedPets = 0;
    for (const pid of Object.keys(C.PETS)) {
      if (s.petOwned[pid] !== 'immortal') { s.petOwned[pid] = 'immortal'; addedPets++; }
    }
    const nonStd = Object.keys(C.SKILL_VARIANTS).filter(v => v !== 'std');
    let addedHeroes = 0, addedSkills = 0;
    for (const h of C.HERO_IDS) {
      if ((s.heroKOs[h] || 0) < 300) { s.heroKOs[h] = 300; addedHeroes++; }
      if (!isObj(s.skillUnlocks[h])) s.skillUnlocks[h] = {};
      for (const sl of C.SKILL_SLOTS) {
        const cur = Array.isArray(s.skillUnlocks[h][sl]) ? s.skillUnlocks[h][sl].slice() : [];
        for (const v of nonStd) if (!cur.includes(v)) { cur.push(v); addedSkills++; }
        s.skillUnlocks[h][sl] = cur;
      }
    }
    if (!Object.keys(s.badgeEquip || {}).length) A.badgeAutoAssign(s);
    const changed = first || addedSkins > 0 || addedBadges > 0 || addedPets > 0 || addedHeroes > 0 || addedSkills > 0;
    return { first, addedSkins, addedBadges, addedPets, addedHeroes, addedSkills, changed };
  };
  // 天工传世典藏密钥：一次性解锁全 20 款天工传世斩数版皮肤（不重复发放已有款式）
  C.applyHeirloomPromo = (s, env) => {
    const first = !s.heirloomPromo;
    s.heirloomPromo = 1;
    const haveInv = new Set(s.inv.map(x => x.k));
    const haveLst = new Set((s.lst || []).map(L => L && L.it && L.it.k).filter(Boolean));
    let addedSkins = 0;
    for (const k of C.HEIRLOOM_KEYS) {
      if (!haveInv.has(k) && !haveLst.has(k) && s.inv.length < C.INV_MAX) {
        C.addItem(s, C.mkItem(s, k, 'promo', env.rnd, { st: 0 }), env);
        haveInv.add(k);
        addedSkins++;
      }
    }
    const changed = first || addedSkins > 0;
    return { first, addedSkins, total: C.HEIRLOOM_KEYS.length, changed };
  };
  // 兑换码：码在服务器上核对，里面的东西在跑这一步之前就放进存档了；内置专属码也支持本机/离线存档
  A.claimCode = (s, a, env) => {
    const k = String((a && a.code) || '').trim().toUpperCase();
    if (k === C.UNIVERSAL_PROMO_CODE && !env.server) {
      const sum = C.applyPromoAll(s, env, { firstClaim: !s.promoAll });
      if (!sum.changed) return { err: '这个兑换码你已经领过了' };
      return { ok: true, promoAll: true, ...sum };
    }
    if (k === C.HEIRLOOM_PROMO_CODE && !env.server) {
      const sum = C.applyHeirloomPromo(s, env);
      if (!sum.changed) return { err: '这个兑换码你已经领过了' };
      return { ok: true, heirloomPromo: true, ...sum };
    }
    return env.server ? { ok: true } : { err: '礼包兑换码要连上服务器才能领' };
  };
  A.gift = (s, a, env) => {   // 第一次进武库：送一个初刃武器箱和一台货郎
    if (s.gift) return { err: '已经领过了' };
    s.gift = 1; s.cases.c1++; s.term++;
    return { ok: true };
  };
  // 每日、每周、活动任务：按服务器认的对局算进度，这天 / 这周 / 这次活动只领一次
  A.task = (s, a, env) => {
    const t = own(C.TASKS, a.id) ? C.TASKS[a.id] : null;
    if (!t) return { err: '没有这个任务' };
    const [per, k, n, ink] = t, r = s.rw;
    if (per === 'e' && !C.inEvent(env.now)) return { err: '活动已经结束了' };
    const got = per === 'd' ? r.dc : per === 'w' ? r.wc : null;
    if (got ? got.includes(a.id) : r.ec) return { err: '已经领过了' };
    if ((per === 'd' ? r.dp[k] : per === 'w' ? r.wp[k] : r.ev) < n) return { err: '任务还没完成' };
    if (got) got.push(a.id); else r.ec = 1;
    giveInk(env, ink);
    return { ok: true, gain: ink };
  };
  // 系统补偿（活动期间）、新手教程：每个号一次
  A.comp = (s, a, env) => {
    if (!C.inEvent(env.now)) return { err: '补偿已经结束了' };
    if (s.rw.comp) return { err: '已经领过了' };
    s.rw.comp = 1; giveInk(env, C.RW.comp);
    return { ok: true, gain: C.RW.comp };
  };
  A.tut = (s, a, env) => {
    if (s.rw.tut) return { err: '已经领过了' };
    s.rw.tut = 1; giveInk(env, C.RW.tut);
    return { ok: true, gain: C.RW.tut };
  };
  // 关卡星：每关每颗星只给一次（拿到更多星时补差）。重复报、报少了都不给，也不算错
  A.stars = (s, a, env) => {
    if (!C.stageOk(a.id)) return { err: '没有这一关' };
    const n = int(a.n, 0, 3), had = s.rw.ss[a.id] || 0;
    if (n <= had) return { ok: true, gain: 0 };
    s.rw.ss[a.id] = n;
    const gain = (n - had) * C.RW.star;
    giveInk(env, gain);
    return { ok: true, gain };
  };
  // 列传：每节第一次走完给一次（重走、刷新回来再走都不再给）；每部最多两个结局，每个结局给一次
  A.saga = (s, a, env) => {
    if (!C.HERO_IDS.includes(a.h)) return { err: '没有这位侠客' };
    const g = s.rw.sg[a.h] || (s.rw.sg[a.h] = { n: 0, e: [] });
    let gain = 0;
    const node = int(a.n, 0, C.RW.sagaNodes);
    if (node >= 1 && !(g.n & (1 << (node - 1))) && !g.e.length) { g.n |= 1 << (node - 1); gain += C.RW.sagaNode; }
    if (a.end !== undefined) {
      if (typeof a.end !== 'string' || !END_RE.test(a.end)) return { err: '没有这个结局' };
      if (!g.e.includes(a.end) && g.e.length < C.RW.sagaEnds) { g.e.push(a.end); gain += C.RW.sagaEnd; }
      g.n = (1 << C.RW.sagaNodes) - 1;   // 拿到结局以后再走的节都不给了（和以前一样）
    }
    if (gain) giveInk(env, gain);
    return { ok: true, gain };
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
