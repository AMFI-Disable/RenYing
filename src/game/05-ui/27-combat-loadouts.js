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
};
var COMBAT_BADGES = {
  flowing: { n: '连势', en: 'Flow', trigger: '连续普攻第 3 击命中', effect: '打开连段追步窗口；紫金阶可改接技能。', tiers: ['0.65 秒内可用冲刺取消收招。', '窗口延长 15%。', '窗口延长 30%，并可用一次技能取消收招。'] },
  focus: { n: '凝锋', en: 'Focus', trigger: '蓄力斩命中', effect: '下一次格挡交锋减少击退；紫金阶技能也可承接。', tiers: ['0.8 秒内下一次格挡击退降低 28%。', '窗口延长 15%。', '窗口延长 30%，且技能命中也可消耗压迫效果。'] },
  riposte: { n: '回锋', en: 'Riposte', trigger: '精准招架成功', effect: '重击获得短促踏进，抓住招架后的反击时机。', tiers: ['0.65 秒内重击向前踏进。', '窗口延长 15%。', '窗口延长 30%，踏进距离略增。'] },
  breaker: { n: '破军', en: 'Breaker', trigger: '造成破防', effect: '立刻重置冲刺冷却；紫金阶可选重击踏进追击。', tiers: ['破防后重置冲刺冷却，下一次冲刺距离略增。', '追击窗口延长 15%。', '窗口延长 30%，并可选择重击踏进追击。'] },
  ascent: { n: '凌空', en: 'Ascent', trigger: '空中攻击命中', effect: '腾空时最多续一次空中冲刺；紫金阶可接空中技能。', tiers: ['空中冲刺用尽后，命中可恢复一次并在收招时续闪。', '续闪窗口延长 15%。', '窗口延长 30%，并可用一次技能取消空中收招。'] },
  pursuit: { n: '追影', en: 'Pursuit', trigger: '闪避后 1 秒内首次命中', effect: '打开退步窗口；紫金阶退步带短暂无敌。', tiers: ['0.65 秒内可用冲刺取消收招并选择退路。', '窗口延长 15%。', '窗口延长 30%，退步时获得 0.08 秒无敌。'] },
};
var BADGE_TIER_POWER = { silver: 1, gold: 1.5, purpgold: 2 };
var BADGE_WINDOW_SCALE = { silver: 1, gold: 1.15, purpgold: 1.3 };
if (typeof window !== 'undefined') { window.HERO_STANCES = HERO_STANCES; window.COMBAT_BADGES = COMBAT_BADGES; }
function combatLoadoutMap() {
  try { return typeof armoryCombatLoadoutMap === 'function' ? armoryCombatLoadoutMap() : {}; } catch (e) { return {}; }
}
function applyCombatLoadouts() {
  const local = combatLoadoutMap(), maps = M.combatLoadouts;
  for (const f of allFighters()) {
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
    if (M.mode === 'train' && f.idx === 0 && preview && COMBAT_BADGES[preview.id])
      profile = { ...profile, badge: preview.id, tier: BADGE_TIER_POWER[preview.tier] ? preview.tier : 'silver' };
    f.stanceUnlocked = !!profile.unlocked;
    f.stance = f.stanceUnlocked && profile.stance === 1 ? 1 : 0;
    f.badgeId = COMBAT_BADGES && COMBAT_BADGES[profile.badge] ? profile.badge : '';
    f.badgeTier = BADGE_TIER_POWER && BADGE_TIER_POWER[profile.tier] ? profile.tier : '';
    f.badgeDashT = 0;
    f.badgeLinkT = f.badgePressureT = f.badgeRiposteT = f.badgeBreakT = f.badgeAirSkillT = f.badgeExitT = 0;
    f.badgePressureSkill = 0; f.badgeAirUsed = f.badgeAirSkillUsed = 0;
    f.stanceT = 0;
  }
}
function badgeDuration(f, base) { return base * (BADGE_WINDOW_SCALE[f && f.badgeTier] || 1); }
function showBadgeCue(f, key, consumed = false) {
  if (!f || RESIM) return;
  const badge = COMBAT_BADGES[f.badgeId]; if (!badge) return;
  const names = { flowing: consumed ? '连势 · 连段追步' : '连势 · 追步窗口', focus: consumed ? '凝锋 · 贴身压迫' : '凝锋 · 压迫窗口', riposte: consumed ? '回锋 · 踏进反击' : '回锋 · 反击窗口', breaker: consumed ? '破军 · 追击踏进' : '破军 · 破防追击', breakerDash: '破军 · 追击冲刺', ascent: consumed ? '凌空 · 空中续招' : '凌空 · 空中续闪', pursuit: consumed ? '追影 · 退步闪避' : '追影 · 退步窗口' };
  const rgb = f.look && f.look.slash || '233,196,106';
  ring(f.x, f.y - 58, consumed ? 78 : 58, rgb, consumed ? 0.28 : 0.18);
  addP({ type: 'text', text: names[key] || badge.n, x: f.x, y: f.y - 112, life: 0.7, max: 0.7, rgb });
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
  addP({ type: 'text', text: f.stance ? (HERO_STANCES[f.ch.id] || {}).name : '本式', x: f.x, y: f.y - 130, life: 0.7, max: 0.7, rgb: f.look.slash || '230,210,150' });
  ring(f.x, f.y - 54, 62, f.look.slash || '230,210,150', 0.28);
  return true;
}
function applyCombatBadgeHit(att, def, move, ev) {
  if (!att || !att.badgeId || !att.badgeTier || !ev || ev.blk || ev.armor || ev.dd <= 0) return;
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
  }
}
function applyCombatBadgeGuard(def, ev) {
  if (!def || !def.badgeId || !def.badgeTier || !ev || !ev.justGuard || def.badgeId !== 'riposte') return;
  def.badgeRiposteT = badgeDuration(def, 0.65); showBadgeCue(def, 'riposte');
}
function applyCombatBadgeBlock(att, def) {
  if (!att || att.badgeId !== 'focus' || !(att.badgePressureSkill || att.badgePressureT > 0)) return false;
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
