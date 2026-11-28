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

