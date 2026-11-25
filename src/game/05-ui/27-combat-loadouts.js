// ======================= 架势与武学徽记 =======================
// 架势切换是战斗输入并随 Fighter 回滚；徽记效果只在指定动作成功时触发。
var HERO_STANCES = {
  qingfeng: { name: '回风式', en: 'Returning Gale', kind: 'swift', desc: '起手更快，收招更长，单次伤害略低。' },
  feiying: { name: '潜影式', en: 'Veiled Step', kind: 'precision', desc: '短距攻击更窄更远，蓄力斩后摇增加。' },
  tieshan: { name: '沉山式', en: 'Mountain Brace', kind: 'guard', desc: '攻击伤害略低，静止调息时架势恢复更快。' },
  lingshuang: { name: '穿云式', en: 'Cloud Piercer', kind: 'reach', desc: '攻击更远，伤害略低，出招稍慢。' },
  liuyun: { name: '逐风式', en: 'Wind Chase', kind: 'swift', desc: '轻击更快，后摇更长，重击伤害略低。' },
  leiming: { name: '连岳式', en: 'Rising Mountain', kind: 'power', desc: '重击更重，前后摇都更长。' },
  moyu: { name: '泼墨式', en: 'Splashed Ink', kind: 'control', desc: '命中硬直更久，伤害略低，攻击距离缩短。' },
  yuehua: { name: '守月式', en: 'Moon Guard', kind: 'guard', desc: '攻击伤害略低，静止调息时架势恢复更快。' },
  yanling: { name: '掠空式', en: 'Sky Skim', kind: 'swift', desc: '空中出招更快，空中攻击收招略长。' },
  yuxiao: { name: '清商式', en: 'Clear Tone', kind: 'control', desc: '攻击硬直更长，伤害略低，攻击距离缩短。' },
  zuixian: { name: '醉步式', en: 'Drunken Step', kind: 'precision', desc: '轻击判定更窄更远，蓄力斩后摇增加。' },
  gouchen: { name: '缠锋式', en: 'Binding Chain', kind: 'reach', desc: '攻击更远，伤害略低，出招稍慢。' },
  lingque: { name: '穿叶式', en: 'Threading Leaf', kind: 'precision', desc: '轻击判定更窄更远，蓄力斩后摇增加。' },
  liying: { name: '照影式', en: 'Reflected Mist', kind: 'control', desc: '攻击硬直更长，伤害略低，攻击距离缩短。' },
  cixian: { name: '双仪式', en: 'Twin Poles', kind: 'power', desc: '重击更重，前后摇都更长。' },
  qianji: { name: '游线式', en: 'Tether Flow', kind: 'reach', desc: '攻击更远，伤害略低，出招稍慢。' },
  chixiao: { name: '焚野式', en: 'Firebreak Stance', kind: 'power', desc: '重击与蓄力更猛，前后摇略长。' },
  xuanji: { name: '星枢式', en: 'Astral Pivot', kind: 'control', desc: '命中硬直更久，伤害略低，距离略缩。' },
  qingluan: { name: '翠岚式', en: 'Jade Breeze', kind: 'swift', desc: '身法更灵动，攻距略收。' },
  xuanwu: { name: '镇岳式', en: 'Bastion Shell', kind: 'guard', desc: '架势更稳固，移动略沉。' },
};
var COMBAT_BADGES = {
  flowing: { n: '连势', en: 'Flow', trigger: '连续普攻第 3 击命中', effect: '打开连段追步窗口；紫金阶可改接技能。', tiers: ['0.65 秒内可用冲刺取消收招。', '窗口延长 15%。', '窗口延长 30%，并可用一次技能取消收招。'] },
  focus: { n: '凝锋', en: 'Focus', trigger: '蓄力斩命中', effect: '下一次格挡交锋减少击退；紫金阶技能也可承接。', tiers: ['0.8 秒内下一次格挡击退降低 28%。', '窗口延长 15%。', '窗口延长 30%，且技能命中也可消耗压迫效果。'] },
  riposte: { n: '回锋', en: 'Riposte', trigger: '精准招架成功', effect: '重击获得短促踏进，抓住招架后的反击时机。', tiers: ['0.65 秒内重击向前踏进。', '窗口延长 15%。', '窗口延长 30%，踏进距离略增。'] },
  breaker: { n: '破军', en: 'Breaker', trigger: '造成破防', effect: '立刻重置冲刺冷却；紫金阶可选重击踏进追击。', tiers: ['破防后重置冲刺冷却，下一次冲刺距离略增。', '追击窗口延长 15%。', '窗口延长 30%，并可选择重击踏进追击。'] },
  ascent: { n: '凌空', en: 'Ascent', trigger: '空中攻击命中', effect: '腾空时最多续一次空中冲刺；紫金阶可接空中技能。', tiers: ['空中冲刺用尽后，命中可恢复一次并在收招时续闪。', '续闪窗口延长 15%。', '窗口延长 30%，并可用一次技能取消空中收招。'] },
  pursuit: { n: '追影', en: 'Pursuit', trigger: '闪避后 1 秒内首次命中', effect: '打开退步窗口；紫金阶退步带短暂无敌。', tiers: ['0.65 秒内可用冲刺取消收招并选择退路。', '窗口延长 15%。', '窗口延长 30%，退步时获得 0.08 秒无敌。'] },
  ironwall: { n: '铁壁', en: 'Ironwall', trigger: '连续格挡 3 次', effect: '下一次反击获得短暂霸体，稳住防线。', tiers: ['格挡 3 次后获得 0.5 秒霸体。', '霸体持续延长 15%。', '霸体延长 30% 并恢复 12 点架势。'] },
  tempest: { n: '疾电', en: 'Tempest', trigger: 'Q/R 技能命中', effect: '缩短下一招技能冷却并打开追步窗口。', tiers: ['技能命中后减少 0.4 秒剩余冷却。', '减少 0.6 秒冷却。', '减少 0.85 秒冷却并附加短促追步窗口。'] },
  bloodlust: { n: '血怒', en: 'Bloodlust', trigger: '低血量（<35%）命中', effect: '绝境反击：命中回复微量气血与额外真气。', tiers: ['每次命中额外回气 +4 并回血 1%。', '回气 +6，回血 1.5%。', '回气 +8，回血 2%。'] },
  phantom: { n: '绝影', en: 'Phantom', trigger: '虚招翻滚（C）后命中', effect: '翻滚绕袭后额外积攒真气并延长硬直。', tiers: ['虚招后 1.2 秒内命中回气 +6。', '窗口延长 15%，回气 +8。', '窗口延长 30%，回气 +10 并略增击退。'] },
  resonance: { n: '共鸣', en: 'Resonance', trigger: '发动灵宠秘技（V）', effect: '灵宠协同：立刻缩短 Q/R 技能冷却。', tiers: ['Q/R 冷却立减 1.0 秒。', 'Q/R 冷却立减 1.5 秒。', 'Q/R 冷却立减 2.2 秒并回气 +8。'] },
  skybreaker: { n: '破穹', en: 'Skybreaker', trigger: '空中蓄力斩命中', effect: '重置空中跳跃与冲刺，畅享空战连段。', tiers: ['重置 1 次空中跳跃。', '重置空中跳跃与冲刺。', '全重置并回复 10 点真气。'] },
  juggernaut: { n: '镇岳', en: 'Juggernaut', trigger: '霸体扛伤后命中', effect: '以伤换势，增强下一次重击压迫。', tiers: ['霸体扛伤后回气 +8。', '回气 +12 并补 10 架势。', '回气 +16 并补 18 架势。'] },
  vanguard: { n: '同心', en: 'Vanguard', trigger: '团战命中敌人', effect: '多人团战中为附近队友共享真气。', tiers: ['附近队友获得 +3 真气。', '附近队友获得 +5 真气。', '附近队友获得 +7 真气与 +6 架势。'] },
  iaido: { n: '居合', en: 'Iaido', trigger: '居合斩穴瞬拔命中', effect: '延长封脉时长并立即回气。', tiers: ['封脉延长 0.4 秒并回气 +8。', '封脉延长 0.7 秒并回气 +12。', '封脉延长 1.1 秒并重置短闪。'] },
  meridian: { n: '点穴', en: 'Meridian', trigger: '追击被点穴的目标', effect: '触发震气并额外削减架势。', tiers: ['额外削减 12 架势值。', '额外削减 18 架势并增伤 8%。', '额外削减 26 架势并增伤 14%。'] },
  grapple: { n: '擒龙', en: 'Grapple', trigger: '擒拿投技命中', effect: '落地重置闪避并强化追击。', tiers: ['投技后重置闪避冷却。', '重置闪避且下击增伤 10%。', '重置闪避且下击增伤 18% 并回气 +10。'] },
  execution: { n: '斩魄', en: 'Execution', trigger: '命中低血量（<25%）目标', effect: '重击与奥义附带斩杀破防威力。', tiers: ['斩杀阶段伤害 +8%。', '斩杀阶段伤害 +14%。', '斩杀阶段伤害 +20% 并强破格挡。'] },
  aegis: { n: '玄盾', en: 'Aegis', trigger: '聚气弹反（F）成功', effect: '获得减伤护盾并回复架势。', tiers: ['弹反后回复 15 架势。', '回复 22 架势并减伤 15%。', '回复 30 架势并获得 1.5 秒护盾。'] },
  steadfast: { n: '磐石', en: 'Steadfast', trigger: '倒地起身瞬间', effect: '震退贴身敌人并加快起身。', tiers: ['起身产生微弱震退。', '震退增强并回复 12 架势。', '强力震退并附带 0.25 秒霸体。'] },
  windstep: { n: '御风', en: 'Windstep', trigger: '腾跃或蹬墙落地', effect: '短时提升移速与突进距离。', tiers: ['2 秒内移速 +8%。', '2 秒内移速 +13%。', '2.5 秒内移速 +18% 且减耗。'] },
  mirage: { n: '幻步', en: 'Mirage', trigger: '连续闪避或翻滚', effect: '强化下一次轻击突进距离。', tiers: ['下击突进距离 +15%。', '突进距离 +22% 并回气 +5。', '突进距离 +30% 且附带残影。'] },
  momentum: { n: '千钧', en: 'Momentum', trigger: '高速冲刺或下坠命中', effect: '按当前速度放大动量击退与伤害。', tiers: ['动量增伤最高 +8%。', '动量增伤最高 +14%。', '动量增伤最高 +20% 并强震地。'] },
  harmony: { n: '太和', en: 'Harmony', trigger: '战斗中切换架势', effect: '切换架势时回复架势并短促加速。', tiers: ['回复 10 架势值。', '回复 16 架势并加速 1 秒。', '回复 24 架势并刷新普攻起手。'] },
  sovereign: { n: '天威', en: 'Sovereign', trigger: '释放奥义（E）', effect: '返还真气并强化下一次技能。', tiers: ['奥义后返还 12 真气。', '返还 18 真气。', '返还 25 真气并减少 Q/R 冷却 1.5 秒。'] },
  warbanner: { n: '战旗', en: 'Warbanner', trigger: '发动战意号令（T）', effect: '强化附近队友攻防与护盾。', tiers: ['队友真气 +8。', '队友真气 +12 且移速 +8%。', '队友真气 +16 且获得 1.2 秒霸体。'] },
  guardian: { n: '护法', en: 'Guardian', trigger: '在残血队友附近格挡成功', effect: '为队友回复气血与架势。', tiers: ['为附近队友回复 3% 气血。', '回复 5% 气血。', '回复 8% 气血并分担伤害。'] },
  synergy: { n: '合击', en: 'Synergy', trigger: '接续队友连段命中', effect: '触发团队合击破甲与回气。', tiers: ['合击额外回气 +8。', '合击增伤 10% 并回气 +12。', '合击增伤 18% 并削减目标 25 架势。'] },
  bloodmoon: { n: '血月', en: 'Blood Moon', trigger: '6 连击以上或残血命中', effect: '血月汲取：回血并削减目标架势。', tiers: ['回血 1.5% 并削减 10 架势。', '回血 2.5% 并削减 16 架势。', '回血 4% 并削减 24 架势与回气 +6。'] },
  sunder: { n: '裂甲', en: 'Sunder', trigger: '重击/蓄力斩命中格挡', effect: '额外削减对手大量架势值。', tiers: ['额外削减 14 架势。', '额外削减 22 架势。', '额外削减 32 架势并缩短自身收招。'] },
  frostbite: { n: '寒锋', en: 'Frostbite', trigger: '门派技能或重击命中', effect: '附加霜冻减速压制走位。', tiers: ['减速 1.0 秒。', '减速 1.5 秒。', '减速 2.2 秒并附加寒霜印记。'] },
  lotus: { n: '莲华', en: 'Lotus Ward', trigger: '精准招架成功', effect: '护体莲华回血并震开贴身敌手。', tiers: ['回血 2.5% 并微震敌手。', '回血 4% 并强力震退。', '回血 6% 并回复 15 架势与真气 +10。'] },
  mirror: { n: '镜反', en: 'Mirror Guard', trigger: '格挡远程飞行物', effect: '回气并稳固架势护体。', tiers: ['回气 +8。', '回气 +12 并回复 12 架势。', '回气 +18 并获得 0.6 秒霸体。'] },
  bulwark: { n: '铜墙', en: 'Bulwark', trigger: '气血低于 40% 持续生效', effect: '稳固架势并加速脱战架势回复。', tiers: ['架势回复 +25%。', '架势回复 +40%。', '架势回复 +60% 且低血量免于微弱击退。'] },
  cloudstep: { n: '踏云', en: 'Cloudstep', trigger: '高空二段跳或穿台下落', effect: '短时轻功提速与冲刺减耗。', tiers: ['1.5 秒内移速 +8%。', '1.8 秒内移速 +13%。', '2.2 秒内移速 +18% 并回气 +4。'] },
  gale: { n: '乘风', en: 'Gale Stride', trigger: '冲刺绕背或迅步穿身', effect: '立获真气补给并缩短闪避冷却。', tiers: ['回气 +5。', '回气 +8 且闪避冷却 -0.3 秒。', '回气 +12 且闪避冷却 -0.6 秒。'] },
  blink: { n: '缩地', en: 'Folded Earth', trigger: '腾空闪脱身', effect: '立减 Q/R 技能冷却并打开反击窗。', tiers: ['Q/R 冷却 -0.8 秒。', 'Q/R 冷却 -1.2 秒。', 'Q/R 冷却 -1.8 秒并回气 +8。'] },
  yin_yang: { n: '阴阳', en: 'Yin Yang', trigger: '交替命中 Q 与 R 技能', effect: '触发阴阳调和回气并回架势。', tiers: ['回气 +10 与 +12 架势。', '回气 +16 与 +18 架势。', '回气 +24 与 +28 架势并缩冷 1 秒。'] },
  scroll: { n: '墨韵', en: 'Ink Scroll', trigger: '奥义命中敌人', effect: '重置空中跳跃与冲刺冷却。', tiers: ['重置冲刺冷却。', '重置冲刺与空中跳跃。', '全重置并回复 15 点真气。'] },
  spiritflow: { n: '灵息', en: 'Spirit Flow', trigger: '脱战调息 2.5 秒', effect: '每秒持续积攒真气与架势。', tiers: ['每秒 +3 真气。', '每秒 +4.5 真气与 +4 架势。', '每秒 +6 真气与 +7 架势。'] },
  oath: { n: '结义', en: 'Sworn Oath', trigger: '团战队友受创或倒下', effect: '立获真气爆发与霸体护身。', tiers: ['真气 +12。', '真气 +18 并获 0.6 秒霸体。', '真气 +25 并获 1.0 秒霸体与满架势。'] },
  tactician: { n: '军师', en: 'Tactician', trigger: '团战命中敌方目标', effect: '为队友共享连击回气增益。', tiers: ['附近队友真气 +4。', '附近队友真气 +6。', '附近队友真气 +9 与架势 +8。'] },
};
var COMBAT_PETS = {
  inkfox: { n: '墨狐', en: 'Ink Fox', rgb: '120,235,205', cd: 7.5, shape: 'fox', passive: '连击>=2段命中额外回气 +2.5×品阶', active: '立刻回复 12×品阶 真元，并使 420px 内敌手缓速' },
  tortoise: { n: '玄龟', en: 'Obsidian Tortoise', rgb: '140,200,255', cd: 8.5, shape: 'shell', passive: '非格挡状态下持续加速回复架势 (+4.5/秒×品阶)', active: '获得短暂霸体 (0.75s×品阶) 并回复 25×品阶 架势' },
  falcon: { n: '雷隼', en: 'Thunder Falcon', rgb: '255,220,110', cd: 7.0, shape: 'bird', passive: '空中招式压制与追击协同', active: '朝锁定目标发射高速惊雷风刃 (14×品阶 伤)' },
  froststag: { n: '霜鹿', en: 'Frost Stag', rgb: '160,235,255', cd: 9.0, shape: 'stag', passive: '脱战 3.5 秒后持续缓慢回复气血', active: '瞬间回复 5.5%×品阶 最大气血与 20×品阶 架势' },
  flamelion: { n: '炎狮', en: 'Flame Lion', rgb: '255,125,85', cd: 8.0, shape: 'beast', passive: '近身灼烧与蓄力压制协同', active: '烈焰震退 260px 内敌众并施加灼烧 (2.5s×品阶)' },
  shadowcrow: { n: '影鸦', en: 'Shadow Crow', rgb: '195,140,255', cd: 7.0, shape: 'bird', passive: '机动追击与闪避节奏协同', active: '立刻重置虚招与冲刺冷却并回复 10×品阶 真元' },
  jadekoi: { n: '玉鲤', en: 'Jade Koi', rgb: '115,245,175', cd: 8.0, shape: 'koi', passive: '闪避脱身与状态净化协同', active: '驱散减速与灼烧，并获得短暂无敌 (0.22s×品阶)' },
  mechfinch: { n: '机雀', en: 'Clockwork Finch', rgb: '233,196,106', cd: 6.5, shape: 'bird', passive: '高频远程骚扰与连携补伤', active: '齐射三枚扇形机矢远程压制对手' },
  azure_dragon: { n: '青龙', en: 'Azure Dragon', rgb: '70,225,255', cd: 8.5, shape: 'dragon', passive: '全程每秒持续积攒 +1.8×品阶 真元', active: '释放贯通青龙气浪击飞沿途敌众 (18×品阶 伤)' },
  white_tiger: { n: '白虎', en: 'White Tiger', rgb: '240,244,255', cd: 8.0, shape: 'beast', passive: '强攻破防与重击压制协同', active: '撕裂 280px 内敌手 32×品阶 架势并回气 +10×品阶' },
  vermilion_bird: { n: '朱雀', en: 'Vermilion Bird', rgb: '255,105,75', cd: 8.5, shape: 'bird', passive: '气血低于 40% 时持续回复气血', active: '回复 5%×品阶 气血并击退灼烧 250px 内敌手' },
  qilin: { n: '墨麟', en: 'Ink Qilin', rgb: '235,195,90', cd: 9.0, shape: 'stag', passive: '非格挡状态下持续加速回复架势 (+4.5/秒×品阶)', active: '展开金墨护阵：2 次霸体 + 30×品阶 架势 + 10×品阶 真元' },
  moonrabbit: { n: '玉兔', en: 'Moon Rabbit', rgb: '215,225,255', cd: 7.0, shape: 'rabbit', passive: '空中机动与轻功步法协同', active: '重置冲刺、二段跳与空中冲刺，并回气 +12×品阶' },
  spiritcrane: { n: '灵鹤', en: 'Spirit Crane', rgb: '155,240,220', cd: 7.5, shape: 'bird', passive: '空战挑飞与滞空控场协同', active: '吹起旋风将 280px 内敌手挑空并施加缓速' },
  ironape: { n: '玄猿', en: 'Iron Ape', rgb: '185,155,120', cd: 8.5, shape: 'beast', passive: '非格挡状态下持续加速回复架势 (+4.5/秒×品阶)', active: '震地震退 260px 内敌手并削减 24×品阶 架势' },
  starowl: { n: '星枭', en: 'Star Owl', rgb: '175,145,255', cd: 7.2, shape: 'bird', passive: '远距控场与缓速牵制协同', active: '齐射两枚星弹并使 520px 内敌手缓速 (1.6s×品阶)' },
};
var PET_TIER_MUL = { basic: 1, spirit: 1.25, immortal: 1.55 };
var SKILL_MODS = {
  std: { cd: 1, dmg: 1, guard: 1, name: '本宗' },
  swift: { cd: 0.82, dmg: 0.92, guard: 0.95, name: '迅影' },
  heavy: { cd: 1.16, dmg: 1.18, guard: 1.25, name: '破军' },
};
var BADGE_TIER_POWER = { silver: 1, gold: 1.5, purpgold: 2 };
var BADGE_WINDOW_SCALE = { silver: 1, gold: 1.15, purpgold: 1.3 };
if (typeof window !== 'undefined') { window.HERO_STANCES = HERO_STANCES; window.COMBAT_BADGES = COMBAT_BADGES; window.COMBAT_PETS = COMBAT_PETS; }
function combatLoadoutMap() {
  try { return typeof armoryCombatLoadoutMap === 'function' ? armoryCombatLoadoutMap() : {}; } catch (e) { return {}; }
}
function skillModFor(f, slot) {
  const k = slot === 2 ? 'r' : slot === 'e' ? 'e' : 'q';
  const v = (f && f.skillMod && f.skillMod[k]) || 'std';
  return (SKILL_MODS && SKILL_MODS[v]) || { cd: 1, dmg: 1, guard: 1, name: '本宗' };
}
function applyCombatLoadouts(fighter = null) {
  const local = combatLoadoutMap(), maps = M.combatLoadouts;
  for (const f of fighter ? [fighter] : allFighters()) {
    if (!f || !f.ch) continue;
    let profile = local[f.ch.id] || {};
    if (M.mode === 'replay' && REPLAY.on) {
      const saved = (REPLAY.seg || REPLAY.m || {}).loadouts;
      profile = Array.isArray(saved) ? (saved[f.idx] || {}) : {};
    } else if (M.mode === 'net' && ROLL.on && Array.isArray(maps) && Array.isArray(ROLL.slots)) {
      const side = ROLL.slots[0].includes(f.idx) ? 0 : ROLL.slots[1].includes(f.idx) ? 1 : -1;
      profile = side >= 0 ? ((maps[side] || {})[f.ch.id] || {}) : {};
    } else if (M.watchAi || (M.mode !== 'pvp' && fighterTeam(f) !== (typeof localTeam === 'function' ? localTeam() : 0))) profile = {};
    const preview = typeof window !== 'undefined' && window.BADGE_TRAINING_PREVIEW;
    if (M.mode === 'train' && f.idx === 0 && preview && COMBAT_BADGES && COMBAT_BADGES[preview.id])
      profile = { ...profile, badge: preview.id, tier: BADGE_TIER_POWER && BADGE_TIER_POWER[preview.tier] ? preview.tier : 'silver' };
    f.stanceUnlocked = !!profile.unlocked;
    f.stance = f.stanceUnlocked && profile.stance === 1 ? 1 : 0;
    f.badgeId = COMBAT_BADGES && COMBAT_BADGES[profile.badge] ? profile.badge : '';
    f.badgeTier = BADGE_TIER_POWER && BADGE_TIER_POWER[profile.tier] ? profile.tier : '';
    f.petId = COMBAT_PETS && COMBAT_PETS[profile.pet] ? profile.pet : '';
    f.petTier = PET_TIER_MUL && PET_TIER_MUL[profile.petTier] ? profile.petTier : (f.petId ? 'basic' : '');
    const sl = profile.skills || {};
    f.skillMod = { q: SKILL_MODS && SKILL_MODS[sl.q] ? sl.q : 'std', r: SKILL_MODS && SKILL_MODS[sl.r] ? sl.r : 'std', e: SKILL_MODS && SKILL_MODS[sl.e] ? sl.e : 'std' };
    f.badgeDashT = 0; f.badgeBlockCnt = 0;
    f.badgeLinkT = f.badgePressureT = f.badgeRiposteT = f.badgeBreakT = f.badgeAirSkillT = f.badgeExitT = 0;
    f.badgePressureSkill = 0; f.badgeAirUsed = f.badgeAirSkillUsed = 0;
    f.stanceT = 0;
  }
}
function badgeDuration(f, base) { return base * (BADGE_WINDOW_SCALE[f && f.badgeTier] || 1); }
function showBadgeCue(f, key, consumed = false) {
  if (!f || RESIM) return;
  const badge = COMBAT_BADGES[f.badgeId]; if (!badge) return;
  const names = { flowing: consumed ? '连势 · 连段追步' : '连势 · 追步窗口', focus: consumed ? '凝锋 · 贴身压迫' : '凝锋 · 压迫窗口', riposte: consumed ? '回锋 · 踏进反击' : '回锋 · 反击窗口', breaker: consumed ? '破军 · 追击踏进' : '破军 · 破防追击', breakerDash: '破军 · 追击冲刺', ascent: consumed ? '凌空 · 空中续招' : '凌空 · 空中续闪', pursuit: consumed ? '追影 · 退步闪避' : '追影 · 退步窗口', ironwall: '铁壁 · 霸体反击', tempest: '疾电 · 灵动缩冷', bloodlust: '血怒 · 绝境回气', phantom: '绝影 · 虚招袭杀', resonance: '共鸣 · 灵宠缩冷', skybreaker: '破穹 · 御空重置', juggernaut: '镇岳 · 以伤换势', vanguard: '同心 · 众志聚气' };
  const label = names[key] || badge.n;
  if (M.mode === 'train' && f.idx === 0) {
    TRAIN.lastBadgeT = clock; TRAIN.lastBadgeMsg = label;
    if (typeof trainLogEvent === 'function') trainLogEvent('badge', label, badge.effect);
  }
  const rgb = f.look && f.look.slash || '233,196,106';
  ring(f.x, f.y - 58, consumed ? 78 : 58, rgb, consumed ? 0.28 : 0.18);
  addP({ type: 'text', text: label, x: f.x, y: f.y - 112, life: 0.7, max: 0.7, rgb });
}
function petTickAll() {
  if (M.phase !== 'fight') return;
  for (const f of allFighters()) {
    if (!f || f.hidden || f.hp <= 0) continue;
    if (f.badgeId === 'spiritflow' && f.badgeTier && f.sinceHit > 2.5) {
      const bm = BADGE_TIER_POWER[f.badgeTier] || 1;
      f.meter = Math.min(100, (f.meter || 0) + 3 * bm * STEP);
      if (f.badgeTier !== 'silver') f.guard = Math.min(f.maxGuard || 100, (f.guard || 0) + 3.5 * bm * STEP);
    } else if (f.badgeId === 'bulwark' && f.badgeTier && f.hp < f.maxHp * 0.4 && f.state !== 'block' && f.state !== 'blockstun') {
      const bm = BADGE_TIER_POWER[f.badgeTier] || 1;
      f.guard = Math.min(f.maxGuard || 100, (f.guard || 0) + 4 * bm * STEP);
    }
    if (!f.petId) continue;
    const mul = PET_TIER_MUL[f.petTier] || 1;
    if ((f.petId === 'tortoise' || f.petId === 'qilin' || f.petId === 'ironape') && f.state !== 'block' && f.state !== 'blockstun') {
      f.guard = Math.min(f.maxGuard || 100, (f.guard || 0) + 4.5 * mul * STEP);
    } else if (f.petId === 'froststag' && f.sinceHit > 3.5 && f.hp < f.maxHp) {
      f.hp = Math.min(f.maxHp, f.hp + 5 * HERO_HP_SCALE * mul * STEP);
    } else if (f.petId === 'vermilion_bird' && f.hp < f.maxHp * 0.4 && f.hp < f.maxHp) {
      f.hp = Math.min(f.maxHp, f.hp + 4.5 * HERO_HP_SCALE * mul * STEP);
    } else if (f.petId === 'azure_dragon') {
      f.meter = Math.min(100, (f.meter || 0) + 1.8 * mul * STEP);
    }
  }
}
function tryPetActive(f, foe) {
  if (!f || !f.petId || !COMBAT_PETS[f.petId]) return false;
  const spec = COMBAT_PETS[f.petId], mul = PET_TIER_MUL[f.petTier] || 1;
  f.petCD = spec.cd / (0.85 + 0.15 * mul);
  if (f.badgeId === 'resonance' && f.badgeTier) {
    const cut = f.badgeTier === 'purpgold' ? 2.2 : f.badgeTier === 'gold' ? 1.5 : 1.0;
    f.skillCD = Math.max(0, (f.skillCD || 0) - cut);
    f.skill2CD = Math.max(0, (f.skill2CD || 0) - cut);
    if (f.badgeTier === 'purpgold') f.meter = Math.min(100, (f.meter || 0) + 8);
    showBadgeCue(f, 'resonance');
  }
  const rgb = spec.rgb;
  const dir = foe ? Math.sign(foe.x - f.x || f.face) : f.face;
  if (f.petId === 'inkfox') {
    f.meter = Math.min(100, (f.meter || 0) + Math.round(12 * mul));
    if (foe && Math.abs(foe.x - f.x) < 420 && Math.abs(foe.y - f.y) < 160) foe.slowT = Math.max(foe.slowT || 0, 1.5 * mul);
  } else if (f.petId === 'tortoise') {
    f.armorT = Math.max(f.armorT || 0, 0.75 * mul); f.armorHits = Math.max(f.armorHits || 0, 1);
    f.guard = Math.min(f.maxGuard || 100, (f.guard || 0) + 25 * mul);
  } else if (f.petId === 'falcon' && foe) {
    const dy = (foe.y - 54) - (f.y - 84), dx = foe.x - f.x, d = Math.hypot(dx, dy) || 1;
    spawnProj(f, { kind: 'wind', x: f.x + f.face * 32, y: f.y - 84, vx: (dx / d) * 1150, vy: (dy / d) * 1150, w: 46, h: 40, life: 0.7, dmg: Math.round(14 * mul), kb: [180, -140], stun: 0.28, hs: 0.04, noScale: true });
  } else if (f.petId === 'froststag') {
    f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * 0.055 * mul));
    f.guard = Math.min(f.maxGuard || 100, (f.guard || 0) + 20 * mul);
  } else if (f.petId === 'flamelion') {
    for (const e of foesOf(f)) if (!e.hidden && e.hp > 0 && Math.abs(e.x - f.x) < 260 && Math.abs(e.y - f.y) < 140) {
      e.vx = Math.sign(e.x - f.x || f.face) * 340 * mul; e.burnT = Math.max(e.burnT || 0, 2.5 * mul);
    }
  } else if (f.petId === 'shadowcrow') {
    f.feintCD = 0; f.dashCD = 0; f.meter = Math.min(100, (f.meter || 0) + Math.round(10 * mul));
  } else if (f.petId === 'jadekoi') {
    f.slowT = 0; f.burnT = 0; f.frostSlow = 0; f.invul = Math.max(f.invul, 0.22 * mul);
  } else if (f.petId === 'mechfinch') {
    for (let k = -1; k <= 1; k++) {
      spawnProj(f, { kind: 'dart', x: f.x + dir * 28, y: f.y - 78 + k * 14, vx: dir * 1050, vy: k * 80, w: 28, h: 20, life: 0.65, dmg: Math.round(7 * mul), kb: [90, 0], stun: 0.16, hs: 0.02, noScale: true });
    }
  } else if (f.petId === 'azure_dragon') {
    spawnProj(f, { kind: 'wind', x: f.x + dir * 36, y: f.y - 64, vx: dir * 980, vy: 0, w: 72, h: 52, life: 0.78, dmg: Math.round(18 * mul), kb: [320, -240], stun: 0.34, hs: 0.05, pierce: true, noScale: true });
  } else if (f.petId === 'white_tiger') {
    for (const e of foesOf(f)) if (!e.hidden && e.hp > 0 && Math.abs(e.x - f.x) < 280 && Math.abs(e.y - f.y) < 140) {
      e.guard = Math.max(0, (e.guard || 0) - 32 * mul);
      e.vx = Math.sign(e.x - f.x || dir) * 360 * mul;
    }
    f.meter = Math.min(100, (f.meter || 0) + Math.round(10 * mul));
  } else if (f.petId === 'vermilion_bird') {
    f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * 0.05 * mul));
    for (const e of foesOf(f)) if (!e.hidden && e.hp > 0 && Math.abs(e.x - f.x) < 250 && Math.abs(e.y - f.y) < 140) {
      e.vx = Math.sign(e.x - f.x || dir) * 320 * mul; e.burnT = Math.max(e.burnT || 0, 2.2 * mul);
    }
  } else if (f.petId === 'qilin') {
    f.armorT = Math.max(f.armorT || 0, 0.9 * mul); f.armorHits = Math.max(f.armorHits || 0, 2);
    f.guard = Math.min(f.maxGuard || 100, (f.guard || 0) + 30 * mul);
    f.meter = Math.min(100, (f.meter || 0) + Math.round(10 * mul));
  } else if (f.petId === 'moonrabbit') {
    f.dashCD = 0; f.airDash = 1; f.jumps = 0;
    f.meter = Math.min(100, (f.meter || 0) + Math.round(12 * mul));
  } else if (f.petId === 'spiritcrane') {
    for (const e of foesOf(f)) if (!e.hidden && e.hp > 0 && Math.abs(e.x - f.x) < 280 && Math.abs(e.y - f.y) < 160) {
      e.vy = -420 * mul; e.plat = -1; e.slowT = Math.max(e.slowT || 0, 1.2 * mul);
    }
  } else if (f.petId === 'ironape') {
    for (const e of foesOf(f)) if (!e.hidden && e.hp > 0 && Math.abs(e.x - f.x) < 260 && Math.abs(e.y - f.y) < 130) {
      e.vx = Math.sign(e.x - f.x || dir) * 380 * mul; e.vy = -220; e.guard = Math.max(0, (e.guard || 0) - 24 * mul);
    }
  } else if (f.petId === 'starowl') {
    for (const dy of [-18, 18]) {
      spawnProj(f, { kind: 'dart', x: f.x + dir * 30, y: f.y - 78 + dy, vx: dir * 1020, vy: dy * 2, w: 30, h: 24, life: 0.72, dmg: Math.round(10 * mul), kb: [120, -60], stun: 0.24, hs: 0.03, noScale: true });
    }
    if (foe && Math.abs(foe.x - f.x) < 520) foe.slowT = Math.max(foe.slowT || 0, 1.6 * mul);
  }
  if (!RESIM) {
    if (M.mode === 'train' && f.idx === 0) {
      TRAIN.lastPetT = clock;
      if (typeof trainLogEvent === 'function') trainLogEvent('pet', `灵宠 · ${spec.n}`, spec.active || '发动主动秘技');
    }
    ring(f.x, f.y - 68, 108, rgb, 0.36);
    addP({ type: 'text', text: `灵宠 · ${spec.n}`, x: f.x, y: f.y - 122, life: 0.8, max: 0.8, rgb });
  }
  return true;
}
function drawPets(order) {
  if (!order) return;
  for (const f of order) {
    if (!f || f.hidden || f.hp <= 0 || !f.petId || !COMBAT_PETS[f.petId]) continue;
    const spec = COMBAT_PETS[f.petId], rgb = spec.rgb;
    const bob = Math.sin(clock * 4.5 + f.idx * 1.3) * 7;
    const px = f.x - f.face * 42, py = f.y - 96 + bob;
    const ready = (f.petCD || 0) <= 0.05;
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = `rgba(${rgb},${ready ? 0.22 : 0.1})`;
    ctx.beginPath(); ctx.arc(0, 0, ready ? 16 : 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${rgb},0.92)`;
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 7.5, f.face * -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0c1020';
    ctx.beginPath(); ctx.arc(f.face * 4, -1.5, 1.8, 0, Math.PI * 2); ctx.fill();
    // 灵尾飘带
    ctx.strokeStyle = `rgba(${rgb},0.75)`; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-f.face * 8, 1);
    ctx.quadraticCurveTo(-f.face * 16, Math.sin(clock * 8 + f.idx) * 6, -f.face * 22, -3);
    ctx.stroke();
    ctx.restore();
  }
}
function stanceMove(f, name) {
  const base = f.moves[name];
  if (!base || !f.stance || !f.stanceUnlocked) return base;
  const spec = HERO_STANCES[f.ch.id];
  if (!spec) return base;
  const m = { ...base, box: base.box && base.box.slice(), kb: base.kb && base.kb.slice() };
  const kind = spec.kind, aerial = name === 'a1' || name === 'a2', heavy = name === 'hv' || name === 'cs1' || name === 'cs2';
  if (kind === 'swift') { m.su *= aerial ? 0.9 : 0.93; m.rc += aerial ? 0.025 : 0.035; m.dmg *= heavy ? 0.9 : 0.96; }
  else if (kind === 'precision') { if (m.box) { m.box[0] += 5; m.box[2] += 9; } if (name.startsWith('l')) m.lunge = (m.lunge || 0) * 1.06; if (heavy) m.rc += 0.05; }
  else if (kind === 'reach') { if (m.box) m.box[2] += 12; if (m.lunge) m.lunge *= 1.08; m.dmg *= 0.94; if (m.su) m.su += 0.012; }
  else if (kind === 'power' && heavy) { m.su *= 1.1; m.rc += 0.04; m.dmg *= 1.05; if (m.kb) m.kb[0] *= 1.04; }
  else if (kind === 'control') { m.stun = Math.min(0.75, m.stun * 1.08); m.dmg *= 0.92; if (m.box) m.box[2] -= 6; }
  else if (kind === 'guard') m.dmg *= 0.92;
  return m;
}
function trySwitchStance(f) {
  const c = f && f.ctrl;
  if (!c || !f.stanceUnlocked || f.stanceT > 0 || M.phase !== 'fight' || !c.consume('stance')) return false;
  f.stance = f.stance ? 0 : 1;
  f.stanceT = 0.18; f.state = 'stance'; f.t = 0; f.move = null; f.skill = null; f.sp = null; f.vx *= 0.18;
  const stName = f.stance ? ((HERO_STANCES[f.ch.id] || {}).name || '二式') : '本式';
  if (!RESIM && M.mode === 'train' && f.idx === 0) {
    TRAIN.lastStanceT = clock;
    if (typeof trainLogEvent === 'function') trainLogEvent('stance', `切换架势 · ${stName}`, f.stance ? ((HERO_STANCES[f.ch.id] || {}).desc || '') : '恢复标准招式参数');
  }
  addP({ type: 'text', text: stName, x: f.x, y: f.y - 130, life: 0.7, max: 0.7, rgb: f.look.slash || '230,210,150' });
  ring(f.x, f.y - 54, 62, f.look.slash || '230,210,150', 0.28);
  return true;
}
function applyCombatBadgeHit(att, def, move, ev) {
  if (!att || !ev || ev.blk || ev.armor || ev.dd <= 0) return;
  // 墨狐灵宠被动：连击额外回气
  if (att.petId === 'inkfox' && def && (def.comboHits || 0) >= 2) {
    att.meter = Math.min(100, (att.meter || 0) + 2.5 * (PET_TIER_MUL[att.petTier] || 1));
  }
  if (!att.badgeId || !att.badgeTier) return;
  const name = att.moveName || (move && move.name) || '';
  if (att.badgeId === 'flowing' && !(move && (move.isProj || move.skill || move.ult)) && /^l[1-5]$/.test(name) && def.comboHits === 3) {
    att.badgeLinkT = badgeDuration(att, 0.65); showBadgeCue(att, 'flowing');
  } else if (att.badgeId === 'focus' && (name === 'cs1' || name === 'cs2')) {
    att.badgePressureT = badgeDuration(att, 0.8); att.badgePressureSkill = 0; showBadgeCue(att, 'focus');
  } else if (att.badgeId === 'ascent' && (att.y < -10 || name === 'a1' || name === 'a2')) {
    let cue = false;
    if (!att.badgeAirUsed && att.airDash <= 0) { att.airDash = 1; att.badgeAirUsed = 1; cue = true; }
    if (!att.badgeAirSkillUsed) { att.badgeAirSkillT = badgeDuration(att, 0.75); cue = true; }
    if (cue) showBadgeCue(att, 'ascent');
  } else if (att.badgeId === 'pursuit' && att.badgeDashT > 0) {
    att.badgeDashT = 0; att.badgeExitT = badgeDuration(att, 0.65); showBadgeCue(att, 'pursuit');
  } else if (att.badgeId === 'tempest' && (att.state === 'skill' || (move && move.skill))) {
    const cut = att.badgeTier === 'purpgold' ? 0.85 : att.badgeTier === 'gold' ? 0.6 : 0.4;
    att.skillCD = Math.max(0, (att.skillCD || 0) - cut); att.skill2CD = Math.max(0, (att.skill2CD || 0) - cut);
    if (att.badgeTier === 'purpgold') att.badgeLinkT = Math.max(att.badgeLinkT || 0, 0.45);
    showBadgeCue(att, 'tempest');
  } else if (att.badgeId === 'bloodlust' && att.hp > 0 && att.hp < att.maxHp * 0.35) {
    const mul = BADGE_TIER_POWER[att.badgeTier] || 1;
    att.meter = Math.min(100, (att.meter || 0) + 4 * mul);
    att.hp = Math.min(att.maxHp, att.hp + Math.round(att.maxHp * 0.01 * mul));
    showBadgeCue(att, 'bloodlust');
  } else if (att.badgeId === 'phantom' && att.feintCD > 1.0) {
    const gain = att.badgeTier === 'purpgold' ? 10 : att.badgeTier === 'gold' ? 8 : 6;
    att.meter = Math.min(100, (att.meter || 0) + gain);
    showBadgeCue(att, 'phantom');
  } else if (att.badgeId === 'skybreaker' && att.airCharged) {
    att.jumps = 0;
    if (att.badgeTier !== 'silver') att.airDash = 1;
    if (att.badgeTier === 'purpgold') att.meter = Math.min(100, (att.meter || 0) + 10);
    showBadgeCue(att, 'skybreaker');
  } else if (att.badgeId === 'vanguard' && isMulti()) {
    const gain = att.badgeTier === 'purpgold' ? 7 : att.badgeTier === 'gold' ? 5 : 3;
    for (const m of sideFighters(fighterTeam(att))) {
      if (m !== att && !m.hidden && m.hp > 0 && Math.abs(m.x - att.x) < 620) {
        m.meter = Math.min(100, (m.meter || 0) + gain);
        if (att.badgeTier === 'purpgold') m.guard = Math.min(m.maxGuard || 100, (m.guard || 0) + 6);
      }
    }
    showBadgeCue(att, 'vanguard');
  } else if (att.badgeId === 'bloodmoon' && ((def && def.comboHits >= 6) || att.hp < att.maxHp * 0.4)) {
    const bm = BADGE_TIER_POWER[att.badgeTier] || 1;
    att.hp = Math.min(att.maxHp, att.hp + Math.round(att.maxHp * 0.015 * bm));
    if (def) def.guard = Math.max(0, (def.guard || 0) - 10 * bm);
    if (att.badgeTier === 'purpgold') att.meter = Math.min(100, (att.meter || 0) + 6);
    showBadgeCue(att, 'bloodmoon');
  } else if (att.badgeId === 'frostbite' && (att.state === 'skill' || (move && (move.skill || name === 'hv' || name === 'cs1' || name === 'cs2')))) {
    const dur = att.badgeTier === 'purpgold' ? 2.2 : att.badgeTier === 'gold' ? 1.5 : 1.0;
    if (def) def.slowT = Math.max(def.slowT || 0, dur);
    showBadgeCue(att, 'frostbite');
  } else if (att.badgeId === 'scroll' && (att.state === 'ult' || (move && move.ult))) {
    att.dashCD = 0;
    if (att.badgeTier !== 'silver') { att.jumps = 0; att.airDash = 1; }
    if (att.badgeTier === 'purpgold') att.meter = Math.min(100, (att.meter || 0) + 15);
    showBadgeCue(att, 'scroll');
  } else if (att.badgeId === 'tactician' && isMulti()) {
    const gain = att.badgeTier === 'purpgold' ? 9 : att.badgeTier === 'gold' ? 6 : 4;
    for (const m of sideFighters(fighterTeam(att))) {
      if (m !== att && !m.hidden && m.hp > 0 && Math.abs(m.x - att.x) < 700) m.meter = Math.min(100, (m.meter || 0) + gain);
    }
    showBadgeCue(att, 'tactician');
  }
}
function applyCombatBadgeGuard(def, ev) {
  if (!def || !def.badgeId || !def.badgeTier || !ev) return;
  if (ev.justGuard && def.badgeId === 'riposte') {
    def.badgeRiposteT = badgeDuration(def, 0.65); showBadgeCue(def, 'riposte');
  } else if (ev.justGuard && def.badgeId === 'lotus') {
    const bm = BADGE_TIER_POWER[def.badgeTier] || 1;
    def.hp = Math.min(def.maxHp, def.hp + Math.round(def.maxHp * 0.025 * bm));
    for (const e of foesOf(def)) if (!e.hidden && e.hp > 0 && Math.abs(e.x - def.x) < 180 && Math.abs(e.y - def.y) < 110) e.vx = Math.sign(e.x - def.x || def.face) * 280 * bm;
    if (def.badgeTier === 'purpgold') { def.guard = Math.min(def.maxGuard || 100, (def.guard || 0) + 15); def.meter = Math.min(100, (def.meter || 0) + 10); }
    showBadgeCue(def, 'lotus');
  } else if (def.badgeId === 'mirror' && ev.isProj) {
    const bm = BADGE_TIER_POWER[def.badgeTier] || 1;
    def.meter = Math.min(100, (def.meter || 0) + 8 * bm);
    if (def.badgeTier !== 'silver') def.guard = Math.min(def.maxGuard || 100, (def.guard || 0) + 12);
    if (def.badgeTier === 'purpgold') { def.armorT = Math.max(def.armorT || 0, 0.6); def.armorHits = Math.max(def.armorHits || 0, 1); }
    showBadgeCue(def, 'mirror');
  } else if (def.badgeId === 'ironwall') {
    def.badgeBlockCnt = (def.badgeBlockCnt || 0) + 1;
    if (def.badgeBlockCnt >= 3) {
      def.badgeBlockCnt = 0;
      def.armorT = Math.max(def.armorT || 0, badgeDuration(def, 0.5));
      def.armorHits = Math.max(def.armorHits || 0, 1);
      if (def.badgeTier === 'purpgold') def.guard = Math.min(def.maxGuard || 100, (def.guard || 0) + 12);
      showBadgeCue(def, 'ironwall');
    }
  }
}
function applyCombatBadgeBlock(att, def) {
  if (!att) return false;
  if (att.badgeId === 'sunder' && att.badgeTier && ['hv', 'cs1', 'cs2'].includes(att.moveName)) {
    const cut = att.badgeTier === 'purpgold' ? 32 : att.badgeTier === 'gold' ? 22 : 14;
    def.guard = Math.max(0, (def.guard || 0) - cut);
    showBadgeCue(att, 'sunder', true);
    return true;
  }
  if (att.badgeId !== 'focus' || !(att.badgePressureSkill || att.badgePressureT > 0)) return false;
  def.vx *= 0.72;
  att.badgePressureT = 0; att.badgePressureSkill = 0;
  showBadgeCue(att, 'focus', true);
  return true;
}
function applyCombatBadgeBreak(att, ev) {
  if (!att || att.badgeId !== 'breaker' || !att.badgeTier || !ev || !ev.guardBreak) return;
  att.dashCD = 0;
  att.badgeBreakT = badgeDuration(att, 0.8);
  showBadgeCue(att, 'breaker');
}
