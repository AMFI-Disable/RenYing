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
  flowing: { n: '连势', en: 'Flow', trigger: '连续普攻命中', effect: '连段普攻命中后获得额外真气。' },
  focus: { n: '凝锋', en: 'Focus', trigger: '蓄力斩命中', effect: '蓄力斩命中后获得额外真气。' },
  riposte: { n: '回锋', en: 'Riposte', trigger: '精准招架', effect: '精准招架后恢复少量架势。' },
  breaker: { n: '破军', en: 'Breaker', trigger: '造成破防', effect: '造成破防后获得额外真气。' },
  ascent: { n: '凌空', en: 'Ascent', trigger: '空中攻击命中', effect: '空中攻击命中后获得额外真气。' },
  pursuit: { n: '追影', en: 'Pursuit', trigger: '闪避后命中', effect: '闪避后一秒内命中可获得额外真气。' },
};
var BADGE_TIER_POWER = { silver: 1, gold: 1.5, purpgold: 2 };
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
    f.stanceUnlocked = !!profile.unlocked;
    f.stance = f.stanceUnlocked && profile.stance === 1 ? 1 : 0;
    f.badgeId = COMBAT_BADGES && COMBAT_BADGES[profile.badge] ? profile.badge : '';
    f.badgeTier = BADGE_TIER_POWER && BADGE_TIER_POWER[profile.tier] ? profile.tier : '';
    f.badgeDashT = 0;
    f.stanceT = 0;
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
  addP({ type: 'text', text: f.stance ? (HERO_STANCES[f.ch.id] || {}).name : '本式', x: f.x, y: f.y - 130, life: 0.7, max: 0.7, rgb: f.look.slash || '230,210,150' });
  ring(f.x, f.y - 54, 62, f.look.slash || '230,210,150', 0.28);
  return true;
}
function applyCombatBadgeHit(att, def, move, ev) {
  if (!att || !att.badgeId || !att.badgeTier || !ev || ev.blk || ev.armor || ev.dd <= 0) return;
  const power = BADGE_TIER_POWER[att.badgeTier] || 1, name = att.moveName || move.name || '';
  let gain = 0;
  if (att.badgeId === 'flowing' && /^l[1-5]$/.test(name) && (att.comboHits || 0) >= 2) gain = 0.7 * power;
  else if (att.badgeId === 'focus' && (name === 'cs1' || name === 'cs2')) gain = 1.2 * power;
  else if (att.badgeId === 'ascent' && (att.y < -10 || name === 'a1' || name === 'a2')) gain = 1.1 * power;
  else if (att.badgeId === 'pursuit' && att.badgeDashT > 0) { gain = 1.1 * power; att.badgeDashT = 0; }
  if (gain) att.meter = Math.min(100, att.meter + gain);
}
function applyCombatBadgeGuard(def, ev) {
  if (!def || !def.badgeId || !def.badgeTier || !ev) return;
  const power = BADGE_TIER_POWER[def.badgeTier] || 1;
  if (ev.justGuard && def.badgeId === 'riposte') def.guard = Math.min(def.maxGuard, def.guard + 2.5 * power);
}
function applyCombatBadgeBreak(att, ev) {
  if (att && att.badgeId === 'breaker' && att.badgeTier && ev && ev.guardBreak)
    att.meter = Math.min(100, att.meter + 2 * (BADGE_TIER_POWER[att.badgeTier] || 1));
}
