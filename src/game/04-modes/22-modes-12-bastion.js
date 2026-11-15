// ======================= 天枢城 · 守境（独立 2D 俯视角多人守城 + 肉鸽远征） =======================
// 本文件：
//   1. 24 种材谱 / 6 部位 × 8 流派穿戴套装 / 6 位基础灵侍 / 城防设施 / 宗门科技持久化档案；
//   2. 顶栏直达的独立平面 2D 俯视角大世界（3200 × 2400，WASD 移动 + 鼠标准心攻击/冲刺/技能 + 雷达小地图）；
//   3. 随时加入的同屏/同房联机（BroadcastChannel 同屋互传，点击同袍或按 [T] 传音降临 + 穿云箭 [V]）；
//   4. 兼顾战斗回放沙盒测试接口（startBastion / bastionTick / bastionMatch）。

const BASTION_KEY_PFX = 'ry_bastion_v1_';
const B2D_W = 3200, B2D_H = 2400;
const B2D_CITADEL = { x: 1600, y: 1200, r: 340 };
const B2D_WAYSTATIONS = [
  { id: 'ws_n', name: '北溟驿站', x: 1600, y: 520, r: 72 },
  { id: 'ws_s', name: '南离驿站', x: 1600, y: 1880, r: 72 },
  { id: 'ws_w', name: '西岭驿站', x: 760, y: 1200, r: 72 },
  { id: 'ws_e', name: '东海驿站', x: 2440, y: 1200, r: 72 },
];
const B2D_BUILD_SPOTS = [
  { id: 'array', tab: 'city', x: 1600, y: 1020 },
  { id: 'forge', tab: 'forge', x: 1390, y: 1110 },
  { id: 'sanctuary', tab: 'comp', x: 1810, y: 1110 },
  { id: 'apothecary', tab: 'mats', x: 1390, y: 1300 },
  { id: 'library', tab: 'forge', x: 1810, y: 1300 },
  { id: 'walls', tab: 'city', x: 1600, y: 1380 },
  { id: 'guild', tab: 'city', x: 1600, y: 1200 },
];
const B2D_TURRETS = [
  { x: 1365, y: 965, cd: 0 },
  { x: 1835, y: 965, cd: 0 },
  { x: 1365, y: 1435, cd: 0 },
  { x: 1835, y: 1435, cd: 0 },
];
const B2D_BIOMES = [
  { name: '竹影迷踪', tier: 1, x0: 0, y0: 0, x1: 1600, y1: 1200, bg: '#0e1d16', grid: 'rgba(65,135,95,0.16)', rgb: '125,215,155' },
  { name: '霜松寒狱', tier: 2, x0: 1600, y0: 0, x1: 3200, y1: 1200, bg: '#0e1828', grid: 'rgba(95,155,220,0.16)', rgb: '130,195,255' },
  { name: '雷煞古坛', tier: 3, x0: 0, y0: 1200, x1: 1600, y1: 2400, bg: '#161128', grid: 'rgba(155,115,235,0.16)', rgb: '185,145,255' },
  { name: '炎狱魔窟', tier: 4, x0: 1600, y0: 1200, x1: 3200, y1: 2400, bg: '#221012', grid: 'rgba(225,105,85,0.16)', rgb: '245,120,90' },
];
const BASTION_CARDS = [
  { id: 'card_frenzy', name: '狂澜剑意', rar: 'rare', desc: '每层 +18% 攻击、+10% 攻速' },
  { id: 'card_twin_wave', name: '重浪飞刃', rar: 'mythic', desc: '每次普攻额外发出两道侧翼剑气' },
  { id: 'card_lightning', name: '九霄引雷', rar: 'mythic', desc: '命中触发连锁天雷，造成 45% 额外雷伤' },
  { id: 'card_lifesteal', name: '饮血回春', rar: 'rare', desc: '每次攻击命中回复 6% 伤害气血' },
  { id: 'card_vitality', name: '金刚体魄', rar: 'common', desc: '+220 上限气血并立刻回复 220 气血' },
  { id: 'card_haste', name: '踏雪疾风', rar: 'common', desc: '+14% 移速与攻速' },
  { id: 'card_cd', name: '玄妙灵机', rar: 'rare', desc: '绝技与冲刺冷却缩短 20%' },
  { id: 'card_greed', name: '聚宝灵印', rar: 'common', desc: '+30% 战利品掉落与 +55 拾取范围' },
  { id: 'card_ward', name: '玄龟护体', rar: 'rare', desc: '+10% 减伤并立刻获得 140 护盾' },
  { id: 'card_critical', name: '破甲重击', rar: 'common', desc: '+25% 破韧与攻击威力' },
];
const BASTION_CARD_BY = Object.fromEntries(BASTION_CARDS.map(c => [c.id, c]));
const BASTION_BOOSTS = {
  frenzy: { name: '狂暴灵珠', rgb: '245,110,95', desc: '+35% 攻击 · +20% 速 (18s)' },
  barrier: { name: '玄盾灵珠', rgb: '125,215,255', desc: '+280 护盾 · +15% 减伤 (18s)' },
  magnet: { name: '聚宝灵珠', rgb: '245,205,95', desc: '全图吸宝 · +50% 掉落 (18s)' },
  haste: { name: '疾风灵珠', rgb: '125,245,180', desc: '+30% 移速 · -35% 冷却 (18s)' },
};
const bastionXpNeeded = lv => 100 + Math.max(0, (lv | 0) - 1) * 60;

const bastionOn = () => M.mode === 'bastion' || !!(typeof netRoom === 'function' && netRoom() && netRoom().rule === 'bastion') || B2D.open;
const bastion2dActive = () => !!B2D.open;
const bastionAcctId = () => {
  try {
    if (typeof currentAccount === 'function' && currentAccount()) return String(currentAccount());
  } catch (e) {}
  return 'guest';
};

let BASTION_PROF = null;
function bastionDefaultProfile() {
  const mats = {};
  for (const m of BASTION_MATS) mats[m.id] = m.tier === 1 ? 8 : 0;
  mats.m_iron1 = 16;
  mats.m_bamboo1 = 12;
  mats.m_herb1 = 10;
  mats.m_paper1 = 10;
  mats.m_bone1 = 10;
  const starterWep = { id: 'it_boot_w', slot: 'weapon', genre: 'berserker', tier: 1, name: '粗玄铁·狂战兵魄', mythic: false, atkPct: 0.08, hpFlat: 40 };
  const starterCloak = { id: 'it_boot_c', slot: 'cloak', genre: 'juggernaut', tier: 1, name: '青竹·镇岳背旗', mythic: false, atkPct: 0.04, hpFlat: 100 };
  const buildings = {};
  for (const b of BASTION_BUILDINGS) buildings[b.id] = 1;
  return {
    level: 1,
    xp: 0,
    merit: 240,
    ley: 600,
    threat: 22,
    mats,
    equipped: { weapon: 'it_boot_w', armor: null, boots: null, gauntlets: null, pendant: null, cloak: 'it_boot_c' },
    bag: [starterWep, starterCloak],
    presets: [null, null, null],
    nextItemId: 1,
    comp: {
      unlocked: ['c_blade', 'c_turtle', 'c_fox'],
      bonds: { c_blade: 1, c_turtle: 1, c_fox: 1, c_kite: 1, c_cub: 1, c_spark: 1 },
      active: 'c_blade',
      sub: 'c_fox',
      stance: 'aggressive',
    },
    guild: {
      name: '天枢义盟',
      lv: 1,
      treasury: 120,
      contrib: 120,
      research: { drop: 1, revive: 0, dmg: 0, tpCd: 0 },
    },
    buildings,
    stats: { runs: 0, clears: 0, sieges: 0, tps: 0 },
  };
}

function bastionProfile() {
  if (!BASTION_PROF) {
    let raw = null;
    try { raw = localStorage.getItem(BASTION_KEY_PFX + bastionAcctId()); } catch (e) {}
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (p && p.mats && p.equipped) BASTION_PROF = p;
      } catch (e) {}
    }
    if (!BASTION_PROF) BASTION_PROF = bastionDefaultProfile();
  }
  const d = bastionDefaultProfile();
  BASTION_PROF.mats = Object.assign({}, d.mats, BASTION_PROF.mats || {});
  BASTION_PROF.equipped = Object.assign({}, d.equipped, BASTION_PROF.equipped || {});
  BASTION_PROF.buildings = Object.assign({}, d.buildings, BASTION_PROF.buildings || {});
  BASTION_PROF.guild = Object.assign({}, d.guild, BASTION_PROF.guild || {});
  BASTION_PROF.guild.research = Object.assign({}, d.guild.research, BASTION_PROF.guild.research || {});
  BASTION_PROF.comp = Object.assign({}, d.comp, BASTION_PROF.comp || {});
  BASTION_PROF.stats = Object.assign({}, d.stats, BASTION_PROF.stats || {});
  if (!(BASTION_PROF.level >= 1)) BASTION_PROF.level = 1;
  if (!(BASTION_PROF.xp >= 0)) BASTION_PROF.xp = 0;
  if (!Array.isArray(BASTION_PROF.bag)) BASTION_PROF.bag = d.bag;
  return BASTION_PROF;
}

function bastionSave() {
  try {
    if (BASTION_PROF) localStorage.setItem(BASTION_KEY_PFX + bastionAcctId(), JSON.stringify(BASTION_PROF));
  } catch (e) {}
}

function bastionEquippedItems() {
  const p = bastionProfile();
  const res = {};
  for (const s of BASTION_SLOTS) {
    const id = p.equipped[s.id];
    res[s.id] = id ? p.bag.find(it => it.id === id) || null : null;
  }
  return res;
}

function bastionGenreCounts() {
  const eq = bastionEquippedItems();
  const c = {};
  for (const g of BASTION_GENRES) c[g.id] = 0;
  for (const s of BASTION_SLOTS) {
    const it = eq[s.id];
    if (it && c[it.genre] !== undefined) c[it.genre]++;
  }
  return c;
}

function bastionStats() {
  const p = bastionProfile(), eq = bastionEquippedItems(), gc = bastionGenreCounts();
  const B0 = typeof M === 'object' && M ? M.bastion : null;
  const cards = (B0 && B0.cards) || {};
  const boosts = (B0 && B0.boosts) || {};
  let atkMul = 1 + ((p.guild.research.dmg || 0) * 0.04) + ((p.buildings.library || 1) - 1) * 0.02 + Math.max(0, (p.level || 1) - 1) * 0.04;
  let hpMul = 1;
  let hpFlat = ((p.buildings.walls || 1) - 1) * 30 + Math.max(0, (p.level || 1) - 1) * 45;
  let dr = 0;
  let speedMul = 1;
  let cdMul = 1;
  let tpCd = Math.max(8, 22 - (p.guild.research.tpCd || 0) * 2 - ((p.buildings.array || 1) - 1));
  let reviveMul = 1 + (p.guild.research.revive || 0) * 0.15;
  let dropMul = 1 + (p.guild.research.drop || 0) * 0.08;
  let staggerMul = 1;
  for (const s of BASTION_SLOTS) {
    const it = eq[s.id];
    if (!it) continue;
    const upg = it.upg || 0;
    atkMul += (it.atkPct || 0) + upg * 0.03;
    hpFlat += (it.hpFlat || 0) + upg * 25;
  }
  if (gc.berserker >= 2) atkMul += 0.14;
  if (gc.juggernaut >= 2) { hpMul += 0.22; dr += 0.08; }
  if (gc.juggernaut >= 4) dr += 0.12;
  if (gc.juggernaut >= 6) staggerMul += 0.35;
  if (gc.assassin >= 2) { speedMul += 0.16; tpCd = Math.max(5, Math.round(tpCd * 0.72)); }
  if (gc.assassin >= 4) atkMul += 0.18;
  if (gc.elemental >= 2) atkMul += 0.15;
  if (gc.elemental >= 4) speedMul += 0.10;
  if (gc.medic >= 2) { reviveMul += 0.4; hpMul += 0.12; }
  if (gc.siege >= 2) { staggerMul += 0.28; atkMul += 0.10; }
  if (gc.siege >= 4) dr += 0.08;
  if (gc.ranger >= 2) { dropMul += 0.25; speedMul += 0.08; }
  if (cards.card_frenzy) { atkMul += 0.18 * cards.card_frenzy; speedMul += 0.10 * cards.card_frenzy; }
  if (cards.card_vitality) hpFlat += 220 * cards.card_vitality;
  if (cards.card_haste) speedMul += 0.14 * cards.card_haste;
  if (cards.card_cd) cdMul *= Math.pow(0.8, cards.card_cd);
  if (cards.card_greed) dropMul += 0.30 * cards.card_greed;
  if (cards.card_ward) dr += 0.10 * cards.card_ward;
  if (cards.card_critical) { staggerMul += 0.25 * cards.card_critical; atkMul += 0.12 * cards.card_critical; }
  if ((boosts.frenzy || 0) > 0) { atkMul += 0.35; speedMul += 0.20; }
  if ((boosts.barrier || 0) > 0) dr += 0.15;
  if ((boosts.magnet || 0) > 0) dropMul += 0.50;
  if ((boosts.haste || 0) > 0) { speedMul += 0.30; cdMul *= 0.65; }
  return { gc, cards, boosts, atkMul, hpMul, hpFlat, dr: Math.min(0.75, dr), speedMul, cdMul: Math.max(0.35, cdMul), tpCd, reviveMul, dropMul, staggerMul, eq };
}

function bastionForgeItem(slotId, genreId, tier = 1, useCatalyst = false) {
  const p = bastionProfile();
  const s = BASTION_SLOT_BY[slotId], g = BASTION_GENRE_BY[genreId];
  if (!s || !g) return null;
  const t = clamp(tier | 0, 1, 4);
  const forgeReq = [1, 1, 2, 4, 7][t] || 1;
  if ((p.buildings.forge || 1) < forgeReq) {
    bastionMsg(`需兵器坊达 L${forgeReq} 方可锻造 T${t} 装备`);
    return null;
  }
  const catA = BASTION_MATS.find(m => m.cat === g.cats[0] && m.tier === t);
  const catB = BASTION_MATS.find(m => m.cat === g.cats[1] && m.tier === t);
  const needA = 2 + t, needB = 2 + t, meritCost = 40 * t;
  if (!catA || !catB || (p.mats[catA.id] || 0) < needA || (p.mats[catB.id] || 0) < needB || p.merit < meritCost) {
    bastionMsg(`材料或功勋不足（需 ${needA}×${catA ? catA.name : ''} + ${needB}×${catB ? catB.name : ''} + ${meritCost} 功勋）`);
    return null;
  }
  let mythic = false, catId = null;
  if (t === 4 && useCatalyst) {
    const bossCat = ['m_horn', 'm_heart', 'm_lamp', 'm_scale'].find(id => (p.mats[id] || 0) >= 1);
    if (bossCat) { catId = bossCat; mythic = true; p.mats[bossCat]--; }
  }
  p.mats[catA.id] -= needA;
  p.mats[catB.id] -= needB;
  p.merit -= meritCost;
  const item = {
    id: `it_${p.nextItemId++}`,
    slot: slotId,
    genre: genreId,
    tier: t,
    mythic,
    name: `${mythic ? '绝世·' : t === 4 ? '神兵·' : t === 3 ? '珍稀·' : t === 2 ? '精良·' : ''}${g.name}·${s.name}`,
    atkPct: +(0.05 * t + (s.id === 'weapon' ? 0.06 * t : 0)).toFixed(2),
    hpFlat: Math.round(45 * t * (s.id === 'armor' || s.id === 'cloak' ? 2 : 1)),
    catId,
  };
  p.bag.push(item);
  p.equipped[slotId] = item.id;
  bastionSave();
  if (typeof A === 'object' && A && bastionOn()) bastionApplyPlayerStats(A);
  bastionSync2dPlayerStats();
  return item;
}

function bastionEquipItem(itemId) {
  const p = bastionProfile();
  const it = p.bag.find(x => x.id === itemId);
  if (!it) return false;
  p.equipped[it.slot] = it.id;
  bastionSave();
  if (typeof A === 'object' && A && bastionOn()) bastionApplyPlayerStats(A);
  bastionSync2dPlayerStats();
  return true;
}

function bastionSalvageItem(itemId) {
  const p = bastionProfile();
  const idx = p.bag.findIndex(x => x.id === itemId);
  if (idx < 0) return false;
  const it = p.bag[idx];
  const g = BASTION_GENRE_BY[it.genre];
  if (g) {
    const catA = BASTION_MATS.find(m => m.cat === g.cats[0] && m.tier === it.tier);
    const catB = BASTION_MATS.find(m => m.cat === g.cats[1] && m.tier === it.tier);
    const ref = Math.max(1, Math.floor((2 + it.tier) * 0.7));
    if (catA) p.mats[catA.id] = (p.mats[catA.id] || 0) + ref;
    if (catB) p.mats[catB.id] = (p.mats[catB.id] || 0) + ref;
  }
  if (p.equipped[it.slot] === it.id) p.equipped[it.slot] = null;
  p.bag.splice(idx, 1);
  bastionSave();
  bastionSync2dPlayerStats();
  return true;
}

function bastionEnhanceItem(itemId) {
  const p = bastionProfile();
  const it = p.bag.find(x => x.id === itemId);
  if (!it) return false;
  const cur = it.upg || 0;
  if (cur >= 5) { bastionMsg('该装备已强化至满级 +5'); return false; }
  const meritCost = (cur + 1) * 50, ironCost = cur + 1;
  if (p.merit < meritCost || (p.mats.m_iron1 || 0) < ironCost) {
    bastionMsg(`强化需 ${meritCost} 功勋 + ${ironCost}×粗玄铁`);
    return false;
  }
  p.merit -= meritCost;
  p.mats.m_iron1 -= ironCost;
  it.upg = cur + 1;
  bastionSave();
  if (typeof A === 'object' && A && bastionOn()) bastionApplyPlayerStats(A);
  bastionSync2dPlayerStats();
  bastionMsg(`${it.name} 已强化至 +${it.upg}`);
  return true;
}

function bastionTransmuteMat(matId) {
  const p = bastionProfile();
  const m = BASTION_MAT_BY[matId];
  if (!m || m.tier >= 4 || m.cat === 'boss') return false;
  if ((p.mats[matId] || 0) < 4) return false;
  const next = BASTION_MATS.find(x => x.cat === m.cat && x.tier === m.tier + 1);
  if (!next) return false;
  p.mats[matId] -= 4;
  p.mats[next.id] = (p.mats[next.id] || 0) + 1;
  bastionSave();
  return true;
}

function bastionSavePreset(idx) {
  const p = bastionProfile();
  if (idx < 0 || idx > 2) return false;
  p.presets[idx] = { eq: { ...p.equipped }, comp: p.comp.active, sub: p.comp.sub };
  bastionSave();
  return true;
}

function bastionLoadPreset(idx) {
  const p = bastionProfile();
  const pr = p.presets[idx];
  if (!pr) return false;
  p.equipped = { ...pr.eq };
  if (pr.comp) p.comp.active = pr.comp;
  if (pr.sub) p.comp.sub = pr.sub;
  bastionSave();
  if (typeof A === 'object' && A && bastionOn()) bastionApplyPlayerStats(A);
  bastionSync2dPlayerStats();
  return true;
}

function bastionUnlockOrBondCompanion(compId) {
  const p = bastionProfile();
  if (!BASTION_COMP_BY[compId]) return false;
  if (!p.comp.unlocked.includes(compId)) {
    const req = { c_kite: ['m_bamboo1', 4, 'sanctuary', 2], c_cub: ['m_bone1', 4, 'sanctuary', 3], c_spark: ['m_sand2', 3, 'sanctuary', 4] }[compId];
    if (req) {
      if ((p.buildings[req[2]] || 1) < req[3]) { bastionMsg(`需灵兽园 L${req[3]} 方可契约此灵侍`); return false; }
      if ((p.mats[req[0]] || 0) < req[1]) { bastionMsg(`需要 ${req[1]}×${BASTION_MAT_BY[req[0]].name}`); return false; }
      p.mats[req[0]] -= req[1];
    }
    p.comp.unlocked.push(compId);
    p.comp.active = compId;
    bastionSave();
    bastionInitCompanions();
    return true;
  }
  const lv = p.comp.bonds[compId] || 1;
  if (lv >= 10) return false;
  const herb = p.mats.m_herb1 >= 2 ? 'm_herb1' : (p.mats.m_berry2 >= 1 ? 'm_berry2' : null);
  if (!herb) { bastionMsg('需要月见草 ×2 或赤阳朱果 ×1 喂养灵侍'); return false; }
  p.mats[herb] -= herb === 'm_herb1' ? 2 : 1;
  p.comp.bonds[compId] = lv + 1;
  bastionSave();
  return true;
}

function bastionDonateBuilding(bId, units = 3) {
  const p = bastionProfile();
  const lv = p.buildings[bId] || 1;
  if (lv >= 10) return false;
  const matPool = ['m_iron1', 'm_bamboo1', 'm_paper1', 'm_herb1', 'm_bone1'].find(id => (p.mats[id] || 0) >= units);
  if (!matPool) { bastionMsg(`至少需 ${units} 份基础材料方可捐献`); return false; }
  p.mats[matPool] -= units;
  p.merit += Math.round(units * 12);
  p.ley = Math.min(10000, p.ley + units * 8);
  const key = '_prog_' + bId;
  p[key] = (p[key] || 0) + units;
  const need = lv * 10;
  if (p[key] >= need) {
    p[key] -= need;
    p.buildings[bId] = lv + 1;
    bastionMsg(`${BASTION_BUILDINGS.find(b => b.id === bId).name} 升至 L${lv + 1}！`);
  }
  bastionSave();
  bastionSync2dPlayerStats();
  bastionCoopSend({ t: 'city', buildings: p.buildings, guild: p.guild });
  return true;
}

function bastionDonateGuild(units = 3) {
  const p = bastionProfile();
  const matId = ['m_iron1', 'm_bamboo1', 'm_paper1', 'm_bone1', 'm_herb1'].find(id => (p.mats[id] || 0) >= units);
  if (!matId) { bastionMsg(`至少需 ${units} 份材料方可捐献宗门`); return false; }
  p.mats[matId] -= units;
  p.guild.treasury += units * 25;
  p.guild.contrib += units * 25;
  if (p.guild.treasury >= p.guild.lv * 400 && p.guild.lv < 10) p.guild.lv++;
  bastionSave();
  bastionCoopSend({ t: 'city', buildings: p.buildings, guild: p.guild });
  return true;
}

function bastionUpgradeGuildResearch(key) {
  const p = bastionProfile();
  const lv = (p.guild.research && p.guild.research[key]) || 0;
  const cost = (lv + 1) * 180;
  if (p.guild.treasury < cost || lv >= 5) return false;
  p.guild.treasury -= cost;
  p.guild.research[key] = lv + 1;
  bastionSave();
  if (typeof A === 'object' && A && bastionOn()) bastionApplyPlayerStats(A);
  bastionSync2dPlayerStats();
  bastionCoopSend({ t: 'city', buildings: p.buildings, guild: p.guild });
  return true;
}

function bastionApplyPlayerStats(f) {
  if (!f || !bastionOn()) return;
  const st = bastionStats();
  const baseHp = (f.ch && f.ch.hp) || 1000;
  const maxHp = Math.round(baseHp * st.hpMul + st.hpFlat);
  const ratio = f.maxHp ? f.hp / f.maxHp : 1;
  f.maxHp = maxHp;
  f.hp = f.lagHp = Math.min(maxHp, Math.max(1, Math.round(maxHp * ratio)));
}

function bastionMsg(text) {
  if (typeof RESIM !== 'undefined' && RESIM) return;
  if (B2D.open) {
    B2D.toasts.push({ text, t: 2.2 });
    if (B2D.toasts.length > 4) B2D.toasts.shift();
  } else if (typeof toast === 'function') {
    toast(text);
  }
}

function bastionEnsureState() {
  const p = bastionProfile();
  if (!M.bastion) {
    M.bastion = {
      space: 'citadel',
      realmTier: 1,
      room: 1,
      maxRooms: 5,
      unbankedSilver: 0,
      bankedSilver: 0,
      unbankedMats: {},
      bankedMats: {},
      tpCd: 0,
      sosCd: 0,
      sosActiveT: 0,
      gateHp: 2000 + (p.buildings.walls || 1) * 400,
      gateMaxHp: 2000 + (p.buildings.walls || 1) * 400,
      turretCd: 0,
      barricadeHp: 350,
      drops: [],
      comps: [],
      reviveT: [0, 0],
      bleedT: [0, 0],
      cheatDeathCd: 0,
      downed: [false, false],
      armoryOpen: false,
      cards: {},
      pendingCards: [],
      boosts: {},
    };
  }
  return M.bastion;
}

function bastionRollCardDraft(force = false) {
  const B0 = bastionEnsureState();
  if (B0.pendingCards && B0.pendingCards.length && !force) return B0.pendingCards;
  const pool = BASTION_CARDS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  B0.pendingCards = pool.slice(0, 3).map(c => c.id);
  b2dRenderCardModal();
  return B0.pendingCards;
}

function bastionPickCard(idxOrId) {
  const B0 = bastionEnsureState();
  if (!B0.pendingCards || !B0.pendingCards.length) return false;
  const id = typeof idxOrId === 'number' ? B0.pendingCards[idxOrId] : B0.pendingCards.find(x => x === idxOrId);
  if (!id || !BASTION_CARD_BY[id]) return false;
  B0.cards = B0.cards || {};
  B0.cards[id] = (B0.cards[id] || 0) + 1;
  B0.pendingCards = [];
  if (id === 'card_vitality' && B2D.open) {
    bastionSync2dPlayerStats();
    B2D.player.hp = Math.min(B2D.player.maxHp, B2D.player.hp + 220);
  } else if (id === 'card_ward' && B2D.open) {
    B2D.player.shield = (B2D.player.shield || 0) + 140;
  } else {
    bastionSync2dPlayerStats();
  }
  b2dRenderCardModal();
  b2dRenderTopBar();
  bastionMsg(`习得秘卷：${BASTION_CARD_BY[id].name}`);
  return true;
}

function bastionGainXp(amount) {
  const p = bastionProfile();
  let gain = Math.max(0, Math.round(amount));
  if (!gain) return false;
  p.xp = (p.xp || 0) + gain;
  let leveled = false;
  while (p.xp >= bastionXpNeeded(p.level || 1)) {
    p.xp -= bastionXpNeeded(p.level || 1);
    p.level = (p.level || 1) + 1;
    leveled = true;
  }
  if (leveled) {
    bastionSave();
    bastionSync2dPlayerStats();
    if (B2D.open) {
      B2D.player.hp = Math.min(B2D.player.maxHp, B2D.player.hp + Math.round(B2D.player.maxHp * 0.25));
      b2dFloatText(`升级 Lv.${p.level}!`, B2D.player.x, B2D.player.y - 42, '255,220,115');
      B2D.rings.push({ x: B2D.player.x, y: B2D.player.y, r: 18, maxR: 160, life: 0.45, max: 0.45, rgb: '255,215,105' });
    }
    bastionRollCardDraft();
    bastionMsg(`境界提升 Lv.${p.level}！请选择 1 张强化秘卷`);
  } else {
    bastionSave();
  }
  return leveled;
}

function bastionApplyBoost(kind, dur = 18) {
  const B0 = bastionEnsureState(), def = BASTION_BOOSTS[kind];
  if (!def) return false;
  B0.boosts = B0.boosts || {};
  B0.boosts[kind] = Math.max(B0.boosts[kind] || 0, dur);
  if (kind === 'barrier' && B2D.open) {
    B2D.player.shield = (B2D.player.shield || 0) + 280;
  }
  if (B2D.open) {
    b2dFloatText(def.name, B2D.player.x, B2D.player.y - 36, def.rgb);
    B2D.rings.push({ x: B2D.player.x, y: B2D.player.y, r: 14, maxR: 110, life: 0.38, max: 0.38, rgb: def.rgb });
  }
  bastionMsg(`${def.name}：${def.desc}`);
  return true;
}

function b2dRenderCardModal() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('bastionCardModal');
  if (!el) return;
  const B0 = M.bastion;
  if (!B2D.open || !B0 || !B0.pendingCards || !B0.pendingCards.length) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const rarLabel = { common: '玄阶', rare: '地阶', mythic: '天阶' };
  el.innerHTML = `<div class="b2d-card-wrap"><div class="b2d-card-head">悟道择卷（点击或按 [1][2][3] 选择）</div>`
    + `<div class="b2d-card-grid">`
    + B0.pendingCards.map((cid, idx) => {
      const c = BASTION_CARD_BY[cid];
      if (!c) return '';
      const stacks = (B0.cards && B0.cards[cid]) || 0;
      return `<button type="button" class="b2d-pick-card ${c.rar}" data-cidx="${idx}">`
        + `<span class="b2d-pick-rar">${rarLabel[c.rar] || c.rar} · [${idx + 1}]</span>`
        + `<b>${c.name}${stacks > 0 ? ` ×${stacks + 1}` : ''}</b>`
        + `<span>${c.desc}</span></button>`;
    }).join('')
    + `</div></div>`;
  for (const btn of el.querySelectorAll('[data-cidx]')) {
    btn.onclick = () => bastionPickCard(+btn.dataset.cidx);
  }
}

function bastionRoundInit() {
  const B0 = bastionEnsureState();
  M.timer = 180;
  B0.tpCd = 0; B0.sosCd = 0; B0.sosActiveT = 0; B0.drops = []; B0.reviveT = [0, 0]; B0.bleedT = [0, 0]; B0.downed = [false, false];
  bastionApplyPlayerStats(A);
  bastionApplyPlayerStats(C);
  bastionSpawnSpaceWave();
  bastionInitCompanions();
}

function bastionInitCompanions() {
  const B0 = bastionEnsureState();
  const p = bastionProfile(), st = bastionStats();
  const soloOrDual = !M.bastionPvp || (st.gc.summoner >= 4);
  const px = B2D.open ? B2D.player.x : (typeof A === 'object' && A ? A.x : 1600);
  const py = B2D.open ? B2D.player.y : 0;
  const list = [{ id: p.comp.active || 'c_blade', x: px - 56, y: py + 24, cd: 0, tickT: 2, slot: 0 }];
  if (soloOrDual && p.comp.sub && BASTION_COMP_BY[p.comp.sub]) {
    list.push({ id: p.comp.sub, x: px + 56, y: py + 24, cd: 0, tickT: 3, slot: 1 });
  }
  B0.comps = list;
}

function bastionSpawnSpaceWave() {
  const B0 = bastionEnsureState();
  const realm = BASTION_REALMS[(B0.realmTier || 1) - 1] || BASTION_REALMS[0];
  const mul = realm.enemyMul * (1 + (B0.room - 1) * 0.14);
  if (typeof A === 'object' && A && typeof B === 'object' && B && typeof C === 'object' && C && typeof D === 'object' && D && !B2D.open) {
    if (B0.space === 'citadel') {
      STAGE_W = 2400;
      A.x = 640; A.face = 1; C.x = 840; C.face = 1;
      B.x = 1860; B.face = -1; D.x = 2040; D.face = -1;
      B.hidden = false; D.hidden = false; B.state = 'idle'; D.state = 'idle';
      B.maxHp = B.hp = B.lagHp = Math.round(900 * mul);
      D.maxHp = D.hp = D.lagHp = Math.round(900 * mul);
      return;
    }
    STAGE_W = 2200;
    A.x = 460; A.face = 1; C.x = 620; C.face = 1;
    if (B0.space === 'siege') {
      B.x = 1660; B.face = -1; D.x = 1840; D.face = -1;
      B.hidden = false; D.hidden = false; B.state = 'idle'; D.state = 'idle';
      B.maxHp = B.hp = B.lagHp = Math.round(1450 * mul);
      D.maxHp = D.hp = D.lagHp = Math.round(1150 * mul);
      B0.gateHp = B0.gateMaxHp = 2000 + (bastionProfile().buildings.walls || 1) * 400;
      return;
    }
    const isBossRoom = B0.room >= B0.maxRooms;
    const isWaystation = B0.room === 3;
    B.x = 1620; B.face = -1; D.x = 1820; D.face = -1;
    if (isWaystation) {
      B.hidden = false; B.state = 'idle';
      B.maxHp = B.hp = B.lagHp = Math.round(700 * mul);
      D.hp = 0; D.hidden = true;
    } else {
      B.hidden = false; D.hidden = false; B.state = 'idle'; D.state = 'idle';
      B.maxHp = B.hp = B.lagHp = Math.round((isBossRoom ? 1850 : 950) * mul);
      D.maxHp = D.hp = D.lagHp = Math.round((isBossRoom ? 1200 : 800) * mul);
    }
    return;
  }
  if (B2D.open) {
    if (B0.space === 'siege') {
      B0.gateHp = B0.gateMaxHp = 2000 + (bastionProfile().buildings.walls || 1) * 400;
      b2dSpawnSiegeWave(B0.realmTier || 1);
      bastionMsg('天枢守城战开启！四面敌潮来袭，守住天枢核心！');
    } else if (B0.space === 'expedition') {
      const targetBiome = B2D_BIOMES[clamp((B0.realmTier || 1) - 1, 0, B2D_BIOMES.length - 1)];
      B2D.player.x = targetBiome.tier === 1 ? 1050 : targetBiome.tier === 2 ? 2150 : targetBiome.tier === 3 ? 1050 : 2150;
      B2D.player.y = targetBiome.tier <= 2 ? 780 : 1620;
      b2dSpawnPack(B2D.player.x + 260, B2D.player.y - 60, targetBiome.tier, true);
      bastionMsg(`传送至 ${realm.name}（2D 平面荒野）`);
    } else {
      B2D.player.x = B2D_CITADEL.x;
      B2D.player.y = B2D_CITADEL.y + 85;
      bastionMsg('已返回天枢主城广场');
    }
  }
}

function bastionDropLoot(x, isBoss, y = 0) {
  const B0 = bastionEnsureState();
  const realm = BASTION_REALMS[(B0.realmTier || 1) - 1] || BASTION_REALMS[0];
  const st = bastionStats();
  const silver = Math.round((isBoss ? 120 : 45) * st.dropMul * (1 + (B0.realmTier - 1) * 0.35));
  const matPool = isBoss ? [realm.catDrop, ...realm.drops] : realm.drops;
  const pick = matPool[Math.floor((typeof grnd === 'function' ? grnd() : Math.random()) * matPool.length)];
  const qty = isBoss ? 2 : 1;
  const dx = B2D.open ? clamp(x, 60, B2D_W - 60) : clamp(x, WALL + 80, STAGE_W - WALL - 80);
  const dy = B2D.open ? clamp(y, 60, B2D_H - 60) : -18;
  B0.drops.push({ x: dx, y: dy, kind: 'silver', val: silver, life: 36 });
  if (pick) B0.drops.push({ x: dx + 26, y: dy + (B2D.open ? 18 : 0), kind: 'mat', id: pick, val: qty, life: 36 });
}

function bastionCollectDrop(d) {
  const B0 = bastionEnsureState(); if (!d) return;
  if (d.kind === 'silver') {
    B0.unbankedSilver += d.val;
    b2dFloatText(`+${d.val} 碎银`, d.x, d.y - 16, '245,215,110');
  } else if (d.kind === 'mat' && BASTION_MAT_BY[d.id]) {
    B0.unbankedMats[d.id] = (B0.unbankedMats[d.id] || 0) + d.val;
    const m = BASTION_MAT_BY[d.id];
    b2dFloatText(`+${d.val} ${m.name}`, d.x, d.y - 24, m.rgb);
  }
}

function bastionPickAllyTarget(allyId) {
  if (B2D.open) {
    const candidates = [];
    const now = Date.now();
    for (const peer of B2D.peers.values()) {
      if (now - peer.ts < 8000) candidates.push(peer);
    }
    candidates.push(B2D.ally);
    if (allyId) return candidates.find(a => a.id === allyId) || candidates[0];
    return candidates.find(a => a.sosT > 0) || candidates[0];
  }
  return (!C.hidden && C.hp > 0) ? C : (!C.hidden ? C : null);
}

function bastionTpToAlly(allyId) {
  const B0 = bastionEnsureState();
  const ally = bastionPickAllyTarget(allyId);
  if (!ally) return false;
  const freeSos = B0.sosActiveT > 0 || (ally.sosT || 0) > 0;
  if (B0.tpCd > 0 && !freeSos) {
    bastionMsg(`同袍传音冷却中：${Math.ceil(B0.tpCd)}s`);
    return false;
  }
  const st = bastionStats();
  if (B2D.open) {
    const ang = (B2D.player.aim || 0) + Math.PI;
    B2D.player.x = clamp(ally.x + Math.cos(ang) * 48, 40, B2D_W - 40);
    B2D.player.y = clamp(ally.y + Math.sin(ang) * 48, 40, B2D_H - 40);
    B2D.player.invul = Math.max(B2D.player.invul, 1.5);
    B2D.player.shield = Math.max(B2D.player.shield, 180);
    B2D.player.downed = false;
    ally.invul = Math.max(ally.invul || 0, 1.5);
    if (typeof A === 'object' && A) { A.x = B2D.player.x; A.y = B2D.player.y; A.invul = B2D.player.invul; }
    B0.tpCd = freeSos ? 0 : st.tpCd;
    if (freeSos) B0.sosActiveT = 0;
    const shockMul = st.gc.assassin >= 6 ? 3.0 : 1.0;
    B2D.rings.push({ x: B2D.player.x, y: B2D.player.y, r: 24, maxR: 210, life: 0.45, max: 0.45, rgb: '95,225,215' });
    b2dFloatText('同袍传音降临!', B2D.player.x, B2D.player.y - 32, '95,225,215');
    b2dDamageCircle(B2D.player.x, B2D.player.y, 195, Math.round(75 * shockMul * st.atkMul), '95,225,215', 220);
  } else {
    const destX = clamp(ally.x - ally.face * 70, WALL + 60, STAGE_W - WALL - 60);
    A.x = destX; A.y = ally.y; A.vy = 0; A.vx = 0;
    A.invul = Math.max(A.invul || 0, 1.5);
    ally.invul = Math.max(ally.invul || 0, 1.5);
    B0.tpCd = freeSos ? 0 : (B0.space === 'citadel' ? 15 : st.tpCd);
    if (freeSos) B0.sosActiveT = 0;
    const shockMul = st.gc.assassin >= 6 ? 3.0 : 1.0;
    for (const foe of [B, D]) {
      if (!foe.hidden && foe.hp > 0 && Math.abs(foe.x - A.x) < 190) {
        applyHit(A, foe, { dmg: Math.round(65 * shockMul), kb: [(foe.x >= A.x ? 1 : -1) * 420, -320], stun: 0.45, hs: 0.05, launch: true, dir: foe.x >= A.x ? 1 : -1 }, [foe.x, foe.y - 50]);
      }
    }
    if (!RESIM) {
      ring(A.x, A.y - 50, 180, '95,225,215', 0.55);
      addP({ type: 'text', text: '同袍降临阵!', x: A.x, y: A.y - 125, life: 1.0, max: 1.0, rgb: '95,225,215' });
      SFX.gong();
    }
  }
  const p = bastionProfile();
  p.stats.tps++;
  bastionSave();
  bastionSyncHUD();
  return true;
}

function bastionFireSos() {
  const B0 = bastionEnsureState(), st = bastionStats();
  if (B0.sosCd > 0) { bastionMsg(`穿云箭冷却中：${Math.ceil(B0.sosCd)}s`); return false; }
  B0.sosCd = st.gc.medic >= 6 ? 25 : 60;
  B0.sosActiveT = 15;
  B0.tpCd = 0;
  if (B2D.open) {
    B2D.sosBeacons.push({ x: B2D.player.x, y: B2D.player.y, life: 15, name: curName() || '侠士' });
    B2D.rings.push({ x: B2D.player.x, y: B2D.player.y, r: 20, maxR: 250, life: 0.6, max: 0.6, rgb: '255,165,85' });
    b2dFloatText('穿云求援! 零冷却传音', B2D.player.x, B2D.player.y - 36, '255,190,95');
    bastionCoopSend({ t: 'sos', x: B2D.player.x, y: B2D.player.y, name: curName() || '侠士' });
    if (st.gc.medic >= 6) {
      B2D.player.hp = Math.min(B2D.player.maxHp, B2D.player.hp + Math.round(B2D.player.maxHp * 0.4));
      B2D.ally.hp = Math.min(B2D.ally.maxHp, B2D.ally.hp + Math.round(B2D.ally.maxHp * 0.5));
    }
  } else {
    if (st.gc.medic >= 6) {
      for (let idx = 0; idx < 2; idx++) {
        const f = idx === 0 ? A : C;
        if (f && f.hp <= 0 && Math.abs(f.x - A.x) < 240) {
          f.hp = f.lagHp = Math.round(f.maxHp * 0.75);
          f.invul = 2.0; B0.downed[idx] = false;
        }
      }
    }
    if (!RESIM) {
      ring(A.x, A.y - 60, 210, '255,140,80', 0.6);
      addP({ type: 'text', text: '求援穿云箭! 传音无冷却', x: A.x, y: A.y - 140, life: 1.2, max: 1.2, rgb: '255,180,90' });
      SFX.gong();
    }
  }
  bastionSyncHUD();
  return true;
}

function bastionCastCompanionSkill() {
  const B0 = bastionEnsureState(); if (!B0.comps || !B0.comps.length) bastionInitCompanions();
  const cp = B0.comps[0]; if (!cp) return false;
  if (cp.cd > 0) { bastionMsg(`灵侍技能冷却：${Math.ceil(cp.cd)}s`); return false; }
  const p = bastionProfile(), st = bastionStats(), def = BASTION_COMP_BY[cp.id];
  const bondMul = 1 + ((p.comp.bonds[cp.id] || 1) - 1) * 0.1 + (st.gc.summoner >= 2 ? 0.35 : 0);
  cp.cd = st.gc.summoner >= 6 ? 5 : 9;
  const px = B2D.open ? B2D.player.x : A.x, py = B2D.open ? B2D.player.y : A.y;
  if (cp.id === 'c_blade') {
    if (B2D.open) b2dDamageCircle(px, py, 220, Math.round(95 * bondMul * st.atkMul), def.rgb, 200);
    else for (const f of [B, D]) if (!f.hidden && f.hp > 0 && Math.abs(f.x - A.x) < 260) applyHit(A, f, { dmg: Math.round(80 * bondMul), kb: [260 * A.face, -200], stun: 0.35, hs: 0.04, dir: A.face }, [f.x, f.y - 50]);
  } else if (cp.id === 'c_turtle') {
    if (B2D.open) { B2D.player.shield += Math.round(220 * bondMul); B2D.player.invul = Math.max(B2D.player.invul, 2.2); }
    else { A.invul = Math.max(A.invul || 0, 2.2); A.hp = Math.min(A.maxHp, A.hp + Math.round(120 * bondMul)); }
  } else if (cp.id === 'c_fox') {
    if (B2D.open) {
      B2D.player.hp = Math.min(B2D.player.maxHp, B2D.player.hp + Math.round(B2D.player.maxHp * 0.25 * bondMul));
      B2D.ally.hp = Math.min(B2D.ally.maxHp, B2D.ally.hp + Math.round(B2D.ally.maxHp * 0.25 * bondMul));
    } else {
      for (const f of [A, C]) if (!f.hidden) { f.hp = Math.min(f.maxHp, (f.hp > 0 ? f.hp : 0) + Math.round(f.maxHp * 0.22 * bondMul)); f.lagHp = Math.max(f.lagHp, f.hp); }
    }
  } else if (cp.id === 'c_kite') {
    if (B2D.open) b2dDamageCircle(px, py, 320, Math.round(70 * bondMul * st.atkMul), def.rgb, 140);
    else for (const f of [B, D]) if (!f.hidden && f.hp > 0 && Math.abs(f.x - A.x) < 420) applyHit(A, f, { dmg: Math.round(58 * bondMul), kb: [160 * A.face, -140], stun: 0.25, hs: 0.02, dir: A.face }, [f.x, f.y - 60]);
  } else if (cp.id === 'c_cub') {
    for (let i = B0.drops.length - 1; i >= 0; i--) bastionCollectDrop(B0.drops.splice(i, 1)[0]);
  } else if (cp.id === 'c_spark') {
    if (B2D.open) b2dDamageCircle(px, py, 270, Math.round(115 * bondMul * st.atkMul), def.rgb, 180);
    else for (const f of [B, D]) if (!f.hidden && f.hp > 0 && Math.abs(f.x - A.x) < 340) applyHit(A, f, { dmg: Math.round(105 * bondMul), kb: [120 * A.face, -240], stun: 0.55, hs: 0.06, dir: A.face }, [f.x, f.y - 55]);
  }
  if (B2D.open && def) {
    B2D.rings.push({ x: px, y: py, r: 16, maxR: 220, life: 0.45, max: 0.45, rgb: def.rgb });
    b2dFloatText(`${def.name} · 绝技!`, px, py - 30, def.rgb);
  } else if (!RESIM && def) {
    addP({ type: 'text', text: `${def.name} · 绝技!`, x: A.x, y: -120, life: 1.0, max: 1.0, rgb: def.rgb });
    SFX.gong();
  }
  return true;
}

function bastionStepCompanions(dt) {
  const B0 = M.bastion; if (!B0 || !B0.comps) return;
  const p = bastionProfile(), st = bastionStats(), stance = p.comp.stance || 'aggressive';
  const px = B2D.open ? B2D.player.x : A.x, py = B2D.open ? B2D.player.y : A.y;
  for (const cp of B0.comps) {
    cp.cd = Math.max(0, cp.cd - dt);
    cp.tickT = (cp.tickT || 0) - dt;
    if (B2D.open) {
      const target = B2D.enemies[0];
      let tx = px + Math.cos(B2D.clock * 1.9 + cp.slot * 2.2) * 52;
      let ty = py + Math.sin(B2D.clock * 1.9 + cp.slot * 2.2) * 52;
      if (cp.id === 'c_cub' && B0.drops.length) { tx = B0.drops[0].x; ty = B0.drops[0].y; }
      else if (stance === 'aggressive' && target && Math.hypot(target.x - px, target.y - py) < 340) {
        tx = target.x - 42; ty = target.y;
      }
      const dx = tx - cp.x, dy = ty - cp.y, dist = Math.hypot(dx, dy);
      if (dist > 6) {
        const move = Math.min(dist, (cp.id === 'c_cub' ? 380 : 280) * dt);
        cp.x += (dx / dist) * move; cp.y += (dy / dist) * move;
      }
      if (cp.id === 'c_cub') {
        for (let i = B0.drops.length - 1; i >= 0; i--) {
          if (Math.hypot(B0.drops[i].x - cp.x, B0.drops[i].y - cp.y) < 160) bastionCollectDrop(B0.drops.splice(i, 1)[0]);
        }
      }
      if (cp.tickT <= 0) {
        cp.tickT = 2.4;
        if (cp.id === 'c_fox' && B2D.player.hp < B2D.player.maxHp) {
          B2D.player.hp = Math.min(B2D.player.maxHp, B2D.player.hp + Math.round(B2D.player.maxHp * 0.05));
        } else if (target && Math.hypot(target.x - cp.x, target.y - cp.y) < 280 && stance !== 'passive') {
          b2dDamageEnemy(target, Math.round(24 * st.atkMul), cp.x, cp.y, BASTION_COMP_BY[cp.id].rgb, 70);
        }
      }
      continue;
    }
    const targetFoe = [B, D].find(f => !f.hidden && f.hp > 0);
    const desiredX = cp.id === 'c_cub' && B0.drops.length
      ? B0.drops[0].x
      : cp.id === 'c_fox' && B0.downed[0]
        ? A.x - A.face * 36
        : stance === 'aggressive' && targetFoe && Math.abs(targetFoe.x - A.x) < 480
          ? targetFoe.x - Math.sign(targetFoe.x - A.x || 1) * 75
          : A.x - A.face * (80 + cp.slot * 50);
    const spd = cp.id === 'c_cub' ? 380 : 280;
    const dx = desiredX - cp.x;
    if (Math.abs(dx) > 12) cp.x += Math.sign(dx) * Math.min(Math.abs(dx), spd * dt);
    cp.y = cp.id === 'c_kite' ? -185 + Math.sin(clock * 4) * 14 : 0;
    if (cp.id === 'c_cub') {
      for (let i = B0.drops.length - 1; i >= 0; i--) {
        if (Math.abs(B0.drops[i].x - cp.x) < 480) { bastionCollectDrop(B0.drops[i]); B0.drops.splice(i, 1); }
      }
    }
    if (cp.id === 'c_fox' && B0.downed[0] && Math.abs(cp.x - A.x) < 120) {
      B0.reviveT[0] += dt * st.reviveMul * 0.7;
    }
    if (cp.tickT <= 0) {
      cp.tickT = 2.8;
      if (cp.id === 'c_fox' && A.hp > 0 && A.hp < A.maxHp) {
        A.hp = Math.min(A.maxHp, A.hp + Math.round(A.maxHp * 0.05));
      } else if (targetFoe && Math.abs(targetFoe.x - cp.x) < (cp.id === 'c_kite' ? 420 : 150) && stance !== 'passive') {
        const bondMul = 1 + ((p.comp.bonds[cp.id] || 1) - 1) * 0.08 + (st.gc.summoner >= 2 ? 0.35 : 0);
        applyHit(A, targetFoe, { dmg: Math.round(18 * bondMul), kb: [80 * A.face, -90], stun: 0.15, hs: 0.01, dir: A.face }, [targetFoe.x, targetFoe.y - 40]);
      }
    }
  }
}

function bastionModifyHit(att, def, m) {
  if (!bastionOn() || !M.bastion) return m;
  const st = bastionStats();
  if (fighterTeam(att) === 0 && m.dmg) {
    let mul = st.atkMul;
    if (st.gc.berserker >= 6 && att.hp < att.maxHp * 0.5) mul *= 1.35;
    if (st.gc.ranger >= 6) mul *= (1 + Math.min(0.5, Math.floor((M.bastion.unbankedSilver || 0) / 100) * 0.02));
    if (st.gc.siege >= 6 && (m.move === 'cs2' || m.ult)) mul *= 1.3;
    if (st.gc.elemental >= 6 && m.ult && !RESIM) ring(def.x, -40, 130, '120,190,255', 0.45);
    m = { ...m, dmg: Math.round(m.dmg * mul) };
  }
  if (fighterTeam(def) === 0 && st.dr > 0 && m.dmg) {
    m = { ...m, dmg: Math.max(1, Math.round(m.dmg * (1 - st.dr))) };
  }
  if (st.gc.berserker >= 4 && att === A && (m.move === 'cs1' || m.move === 'cs2')) {
    A.hp = Math.min(A.maxHp, A.hp + Math.round((m.dmg || 0) * 0.12));
  }
  return m;
}

function bastionFighterDown(def, att) {
  const B0 = M.bastion; if (!B0) return false;
  if (fighterTeam(def) === 1) {
    bastionDropLoot(def.x, B0.room >= B0.maxRooms || B0.space === 'siege', def.y || 0);
    return true;
  }
  const st = bastionStats();
  if (st.gc.berserker >= 6 && def === A && B0.cheatDeathCd <= 0) {
    B0.cheatDeathCd = 15;
    def.hp = def.lagHp = Math.max(1, Math.round(def.maxHp * 0.25));
    def.invul = 2.0;
    if (!RESIM) addP({ type: 'text', text: '血煞免死!', x: def.x, y: -110, life: 1.0, max: 1.0, rgb: '235,75,85' });
    return true;
  }
  const slot = def === A ? 0 : 1;
  B0.downed[slot] = true;
  B0.bleedT[slot] = 12;
  def.hp = 0;
  def.invul = 99;
  if (!RESIM) say('队友倒地 · 靠近或灵狐自动救治！', 1.2);
  return true;
}

function bastionWaystationBank() {
  const B0 = bastionEnsureState(), st = bastionStats();
  const fee = st.gc.ranger >= 4 ? 0 : 0.15;
  const bankedS = Math.floor(B0.unbankedSilver * (1 - fee));
  B0.bankedSilver += bankedS;
  B0.unbankedSilver = 0;
  for (const [k, v] of Object.entries(B0.unbankedMats)) {
    B0.bankedMats[k] = (B0.bankedMats[k] || 0) + v;
  }
  B0.unbankedMats = {};
  bastionMsg(`驿站已寄存 ${bankedS} 碎银及全部材料`);
  return true;
}

function bastionExtract() {
  const B0 = bastionEnsureState(), p = bastionProfile(), st = bastionStats();
  const totSilver = B0.unbankedSilver + B0.bankedSilver;
  const cardStacks = Object.values(B0.cards || {}).reduce((a, b) => a + b, 0);
  const meritGain = Math.max(20, Math.round(totSilver / 10) + B0.room * 25 + cardStacks * 15);
  p.merit += meritGain;
  let matTotal = 0;
  for (const src of [B0.unbankedMats, B0.bankedMats]) {
    for (const [id, v] of Object.entries(src)) { p.mats[id] = (p.mats[id] || 0) + v; matTotal += v; }
  }
  if (st.gc.ranger >= 6) { p.mats.m_iron1 = (p.mats.m_iron1 || 0) + 2; matTotal += 2; }
  B0.unbankedSilver = 0; B0.bankedSilver = 0; B0.unbankedMats = {}; B0.bankedMats = {};
  B0.cards = {}; B0.pendingCards = []; B0.boosts = {};
  p.threat = Math.min(100, p.threat + Math.max(5, Math.round(matTotal * 1.5)));
  p.stats.runs++;
  bastionSave();
  B0.space = 'citadel';
  B0.room = 1;
  bastionSpawnSpaceWave();
  b2dRenderCardModal();
  bastionMsg(`凯旋撤离 · +${meritGain} 功勋 / +${matTotal} 材料`);
  bastionSyncHUD();
  return true;
}

function bastionSwitchSpace(space, tier = 1) {
  const B0 = bastionEnsureState(), p = bastionProfile();
  const realm = BASTION_REALMS[(tier || 1) - 1] || BASTION_REALMS[0];
  if (space === 'expedition' && (p.buildings.array || 1) < realm.reqArray) {
    bastionMsg(`需传送阵达 L${realm.reqArray} 方可进入 ${realm.name}`);
    return false;
  }
  B0.space = space;
  B0.realmTier = clamp(tier || 1, 1, 5);
  B0.room = 1;
  bastionSpawnSpaceWave();
  bastionSyncHUD();
  return true;
}

function bastionTick() {
  if (!bastionOn() || !M.bastion) return;
  if (!B2D.open && M.phase !== 'fight') return;
  const B0 = M.bastion, st = bastionStats();
  B0.tpCd = Math.max(0, B0.tpCd - STEP);
  B0.sosCd = Math.max(0, B0.sosCd - STEP);
  B0.sosActiveT = Math.max(0, B0.sosActiveT - STEP);
  B0.cheatDeathCd = Math.max(0, B0.cheatDeathCd - STEP);
  bastionStepCompanions(STEP);
  if (B2D.open) return;
  const pickR = st.gc.ranger >= 2 ? 230 : 80;
  for (let i = B0.drops.length - 1; i >= 0; i--) {
    const d = B0.drops[i];
    d.life -= STEP;
    if (d.life <= 0) { B0.drops.splice(i, 1); continue; }
    if (Math.abs(d.x - A.x) < pickR && Math.abs(d.y - A.y) < 120) {
      bastionCollectDrop(d);
      B0.drops.splice(i, 1);
    }
  }
  for (const slot of [0, 1]) {
    const f = slot === 0 ? A : C, helper = slot === 0 ? C : A;
    if (!f || f.hidden || f.hp > 0) { B0.downed[slot] = false; B0.reviveT[slot] = 0; continue; }
    B0.bleedT[slot] = Math.max(0, B0.bleedT[slot] - STEP);
    if (!helper.hidden && helper.hp > 0 && Math.abs(helper.x - f.x) < 105) {
      B0.reviveT[slot] += STEP * st.reviveMul;
    }
    if (B0.reviveT[slot] >= 1.5) {
      B0.reviveT[slot] = 0; B0.downed[slot] = false;
      f.hp = f.lagHp = Math.round(f.maxHp * (st.gc.medic >= 4 ? 0.75 : 0.45));
      f.invul = 2.0; f.state = 'idle';
      if (!RESIM) { ring(f.x, -50, 120, '130,235,175', 0.5); SFX.gong(); }
    } else if (B0.bleedT[slot] <= 0 && !B0.comps.some(c => c.id === 'c_fox')) {
      B0.unbankedSilver = Math.floor(B0.unbankedSilver * (st.gc.ranger >= 4 ? 0.75 : 0.5));
      f.hp = f.lagHp = f.maxHp; f.invul = 2.0; B0.downed[slot] = false;
      B0.space = 'citadel'; B0.room = 1; bastionSpawnSpaceWave();
      break;
    }
  }
  if (B0.space === 'siege') {
    B0.turretCd = Math.max(0, B0.turretCd - STEP);
    if (B0.turretCd <= 0) {
      B0.turretCd = st.gc.summoner >= 4 ? 1.8 : 2.8;
      const tg = [B, D].find(e => !e.hidden && e.hp > 0);
      if (tg) {
        const tdmg = Math.round(32 + (bastionProfile().buildings.walls || 1) * 8);
        applyHit(A, tg, { dmg: tdmg, kb: [90, -80], stun: 0.15, hs: 0.01, dir: 1 }, [tg.x, tg.y - 45]);
      }
    }
  }
}

function bastionMatch() {
  const B0 = M.bastion; if (!B0) return;
  if (B2D.open) return;
  if (B0.space === 'citadel') {
    for (const e of [B, D]) if (e.hp <= 0) { e.hp = e.lagHp = e.maxHp; e.x = 1900; }
    return;
  }
  const foesDown = [B, D].every(e => e.hidden || e.hp <= 0);
  if (!foesDown) return;
  if (B0.space === 'siege') {
    const p = bastionProfile();
    p.merit += 180; p.ley = Math.min(10000, p.ley + 200); p.threat = 0; p.stats.sieges++;
    bastionSave();
    B0.space = 'citadel'; B0.room = 1;
    bastionSpawnSpaceWave();
    if (!RESIM) { say('守城大捷! +180 功勋 +200 灵脉', 1.6, 'big'); SFX.gong(); }
    bastionSyncHUD();
    return;
  }
  if (B0.room < B0.maxRooms) {
    B0.room++;
    bastionSpawnSpaceWave();
  } else {
    const p = bastionProfile();
    p.stats.clears++;
    bastionExtract();
  }
  bastionSyncHUD();
}

function drawBastionField() {}
function drawBastionScore() {}

// ======================= 平面 2D 俯视角核心引擎 (B2D) =======================
const B2D = {
  open: false,
  raf: 0,
  lastTs: 0,
  clock: 0,
  camX: 1600,
  camY: 1200,
  keys: new Set(),
  mouse: { x: 0, y: 0, wx: 1600, wy: 1200, down: false },
  player: { x: 1600, y: 1280, vx: 0, vy: 0, r: 16, hp: 1000, maxHp: 1000, shield: 0, aim: 0, walkT: 0, atkAnim: 0, genre: 'berserker', atkCd: 0, dashCd: 0, dashT: 0, skillCd: 0, invul: 0, downed: false, bleedT: 12, reviveT: 0 },
  ally: { id: 'ally_ai', name: '同袍·墨影', x: 1710, y: 1250, vx: 0, vy: 0, r: 15, hp: 900, maxHp: 900, shield: 0, aim: 0, walkT: 0, atkAnim: 0, genre: 'assassin', atkCd: 0, invul: 0, sosT: 0, rgb: '95,225,215' },
  enemies: [],
  projs: [],
  slashes: [],
  rings: [],
  ghosts: [],
  orbs: [],
  texts: [],
  toasts: [],
  sosBeacons: [],
  peers: new Map(),
  bc: null,
  roomCode: 'TIANSHU',
  myId: 'p_' + Math.random().toString(36).slice(2, 7),
  syncT: 0,
  spawnT: 0,
  siegeLeft: 0,
  nearInteract: null,
  boundDom: false,
};

function bastionSync2dPlayerStats() {
  if (!B2D.open) return;
  const st = bastionStats();
  const prevRatio = B2D.player.maxHp ? B2D.player.hp / B2D.player.maxHp : 1;
  B2D.player.maxHp = Math.round(1000 * st.hpMul + st.hpFlat);
  B2D.player.hp = Math.min(B2D.player.maxHp, Math.max(1, Math.round(B2D.player.maxHp * prevRatio)));
  B2D.player.genre = (st.eq.weapon && st.eq.weapon.genre) || 'berserker';
}

function b2dFloatText(text, x, y, rgb = '245,235,205') {
  if (typeof RESIM !== 'undefined' && RESIM) return;
  if (B2D.open) {
    B2D.texts.push({ text, x, y, vy: -32, life: 0.9, max: 0.9, rgb });
    if (B2D.texts.length > 40) B2D.texts.shift();
  } else if (typeof addP === 'function') {
    addP({ type: 'text', text, x, y, life: 0.9, max: 0.9, rgb });
  }
}

function b2dBiomeAt(x, y) {
  if (Math.hypot(x - B2D_CITADEL.x, y - B2D_CITADEL.y) <= B2D_CITADEL.r) return { name: '天枢主城', tier: 1, rgb: '233,196,106' };
  return B2D_BIOMES.find(b => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) || B2D_BIOMES[0];
}

function b2dSpawnPack(cx, cy, tier, hasBoss = false) {
  const realm = BASTION_REALMS[clamp(tier - 1, 0, BASTION_REALMS.length - 1)] || BASTION_REALMS[0];
  const count = hasBoss ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const isBoss = hasBoss && i === 0;
    const isRanger = !isBoss && i % 2 === 1;
    const ang = (i / count) * Math.PI * 2;
    const x = clamp(cx + Math.cos(ang) * 70, 50, B2D_W - 50);
    const y = clamp(cy + Math.sin(ang) * 70, 50, B2D_H - 50);
    const baseHp = isBoss ? 880 : (isRanger ? 190 : 260);
    const hp = Math.round(baseHp * realm.enemyMul);
    B2D.enemies.push({
      x, y, vx: 0, vy: 0,
      r: isBoss ? 24 : 15,
      hp, maxHp: hp,
      spd: isBoss ? 115 : (isRanger ? 125 : 155),
      dmg: Math.round((isBoss ? 68 : 34) * realm.enemyMul),
      cd: 1.0 + i * 0.25,
      tier,
      isBoss,
      isRanger,
      siege: false,
      rgb: isBoss ? '255,95,95' : (isRanger ? '185,130,255' : '235,145,105'),
      name: isBoss ? `${realm.name}·魔首` : (isRanger ? '咒煞弓妖' : '玄甲魔卒'),
    });
  }
}

function b2dSpawnSiegeWave(tier = 1) {
  B2D.siegeLeft = 10 + tier * 2;
  const dirs = [[1600, 120], [1600, B2D_H - 120], [120, 1200], [B2D_W - 120, 1200]];
  for (let i = 0; i < dirs.length; i++) {
    const [sx, sy] = dirs[i];
    const realm = BASTION_REALMS[clamp(tier - 1, 0, 4)];
    const hp = Math.round(360 * realm.enemyMul);
    B2D.enemies.push({
      x: sx, y: sy, vx: 0, vy: 0, r: 17, hp, maxHp: hp,
      spd: 145, dmg: Math.round(45 * realm.enemyMul), cd: 1.1,
      tier, isBoss: i === 0, isRanger: i === 2, siege: true,
      rgb: '255,105,90', name: i === 0 ? '攻城魔将' : '破城魔兵',
    });
  }
}

function b2dDamageEnemy(e, dmg, srcX, srcY, rgb = '255,210,120', knock = 110, noChain = false) {
  if (!e || e.hp <= 0) return;
  const st = bastionStats();
  const actual = Math.max(1, Math.round(dmg));
  e.hp -= actual;
  const dx = e.x - srcX, dy = e.y - srcY, len = Math.hypot(dx, dy) || 1;
  e.vx += (dx / len) * knock;
  e.vy += (dy / len) * knock;
  b2dFloatText(`-${actual}`, e.x, e.y - 18, rgb);
  if (st.cards.card_lifesteal && B2D.player && !B2D.player.downed) {
    B2D.player.hp = Math.min(B2D.player.maxHp, B2D.player.hp + Math.max(1, Math.round(actual * 0.06 * st.cards.card_lifesteal)));
  }
  if (!noChain && st.cards.card_lightning) {
    const chain = B2D.enemies.find(o => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) < 210);
    if (chain) {
      B2D.rings.push({ x: chain.x, y: chain.y, r: 6, maxR: 38, life: 0.18, max: 0.18, rgb: '125,215,255' });
      b2dDamageEnemy(chain, actual * 0.45 * st.cards.card_lightning, e.x, e.y, '125,215,255', 60, true);
    }
  }
  if (e.hp <= 0) {
    M.bastion.realmTier = e.tier || M.bastion.realmTier || 1;
    bastionDropLoot(e.x, !!e.isBoss || !!e.siege, e.y);
    bastionGainXp((e.isBoss ? 110 : 28) * (e.tier || 1));
    if (e.isBoss) {
      const kinds = Object.keys(BASTION_BOOSTS);
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      B2D.orbs.push({ x: clamp(e.x + 28, 45, B2D_W - 45), y: clamp(e.y, 45, B2D_H - 45), kind, life: 35 });
    }
    B2D.rings.push({ x: e.x, y: e.y, r: 8, maxR: 52, life: 0.25, max: 0.25, rgb: e.rgb });
  }
}

function b2dDamageCircle(cx, cy, rad, dmg, rgb, knock = 140) {
  for (const e of B2D.enemies) {
    if (e.hp > 0 && Math.hypot(e.x - cx, e.y - cy) <= rad + e.r) {
      b2dDamageEnemy(e, dmg, cx, cy, rgb, knock);
    }
  }
}

function b2dPlayerAttack() {
  const pl = B2D.player, B0 = M.bastion; if (!pl || !B0 || pl.downed || pl.atkCd > 0) return;
  const st = bastionStats();
  pl.atkCd = 0.28 / st.speedMul;
  pl.atkAnim = 0.22;
  const ang = pl.aim || 0;
  let dmg = 95 * st.atkMul;
  if (st.gc.berserker >= 6 && pl.hp < pl.maxHp * 0.5) dmg *= 1.35;
  if (st.gc.ranger >= 6) dmg *= (1 + Math.min(0.5, Math.floor((B0.unbankedSilver || 0) / 100) * 0.02));
  const rgb = (st.eq.weapon && BASTION_GENRE_BY[st.eq.weapon.genre]) ? BASTION_GENRE_BY[st.eq.weapon.genre].rgb : '125,230,200';
  B2D.slashes.push({ x: pl.x, y: pl.y, ang, r: 108, life: 0.18, max: 0.18, rgb });
  for (const e of B2D.enemies) {
    if (e.hp <= 0) continue;
    const dx = e.x - pl.x, dy = e.y - pl.y, dist = Math.hypot(dx, dy);
    if (dist > 118 + e.r) continue;
    let da = Math.abs(Math.atan2(dy, dx) - ang);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (da <= 1.25 || dist < 44) {
      b2dDamageEnemy(e, dmg, pl.x, pl.y, rgb, 150 * st.staggerMul);
      if (st.gc.berserker >= 4) pl.hp = Math.min(pl.maxHp, pl.hp + Math.round(dmg * 0.08));
    }
  }
  const dirs = st.cards.card_twin_wave ? [ang, ang - 0.24, ang + 0.24] : [ang];
  for (const a of dirs) {
    B2D.projs.push({
      x: pl.x + Math.cos(a) * 24, y: pl.y + Math.sin(a) * 24,
      vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
      r: 8, dmg: Math.round(dmg * 0.55), team: 0, life: 0.42, rgb,
    });
  }
}

function b2dPlayerDash() {
  const pl = B2D.player; if (!pl || pl.downed || pl.dashCd > 0) return;
  const st = bastionStats();
  pl.dashCd = (1.6 / st.speedMul) * st.cdMul;
  pl.dashT = 0.22;
  pl.invul = Math.max(pl.invul, 0.35);
  const ang = pl.aim || 0;
  pl.vx = Math.cos(ang) * 680;
  pl.vy = Math.sin(ang) * 680;
  B2D.rings.push({ x: pl.x, y: pl.y, r: 12, maxR: 75, life: 0.28, max: 0.28, rgb: '140,220,255' });
}

function b2dPlayerSkill() {
  const pl = B2D.player; if (!pl || pl.downed || pl.skillCd > 0) return;
  const st = bastionStats();
  pl.skillCd = 4.2 * st.cdMul;
  const mul = st.gc.siege >= 6 ? 1.35 : 1.0;
  const rgb = (st.eq.weapon && BASTION_GENRE_BY[st.eq.weapon.genre]) ? BASTION_GENRE_BY[st.eq.weapon.genre].rgb : '233,196,106';
  B2D.rings.push({ x: pl.x, y: pl.y, r: 24, maxR: 230, life: 0.45, max: 0.45, rgb });
  b2dDamageCircle(pl.x, pl.y, 225, Math.round(175 * st.atkMul * mul), rgb, 240);
  if (st.gc.elemental >= 6) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      B2D.projs.push({ x: pl.x, y: pl.y, vx: Math.cos(a) * 440, vy: Math.sin(a) * 440, r: 9, dmg: Math.round(90 * st.atkMul), team: 0, life: 0.65, rgb: '120,200,255' });
    }
  }
}

function b2dInteract() {
  if (!B2D.nearInteract) { bastionToggleArmory(); return; }
  const spot = B2D.nearInteract;
  if (spot.kind === 'waystation') bastionWaystationBank();
  else { bastionArmoryTab = spot.tab || 'city'; bastionToggleArmory(true); }
}

function bastionCoopOpen(roomCode) {
  if (B2D.bc) { try { B2D.bc.close(); } catch (e) {} B2D.bc = null; }
  B2D.roomCode = (roomCode || B2D.roomCode || 'TIANSHU').toUpperCase().slice(0, 12);
  if (typeof BroadcastChannel === 'function') {
    B2D.bc = new BroadcastChannel('ry-bastion-coop-' + B2D.roomCode);
    B2D.bc.onmessage = ev => {
      const m = ev.data;
      if (!m || m.from === B2D.myId) return;
      if (m.t === 'state') {
        B2D.peers.set(m.from, {
          id: m.from, name: m.name || '同袍', x: m.x, y: m.y, vx: m.vx || 0, vy: m.vy || 0,
          aim: m.aim || 0, genre: m.genre || 'berserker', shield: m.shield || 0, atkAnim: m.atkAnim || 0, downed: !!m.downed,
          hp: m.hp, maxHp: m.maxHp, sosT: m.sosT || 0, rgb: '140,200,255', ts: Date.now()
        });
      } else if (m.t === 'sos') {
        B2D.sosBeacons.push({ x: m.x, y: m.y, life: 15, name: m.name || '同袍' });
        bastionMsg(`${m.name || '同袍'} 发射穿云箭！按 [T] 零冷却传送援护`);
      } else if (m.t === 'city') {
        const p = bastionProfile();
        if (m.buildings) for (const [k, v] of Object.entries(m.buildings)) p.buildings[k] = Math.max(p.buildings[k] || 1, v);
        if (m.guild && m.guild.lv > p.guild.lv) p.guild.lv = m.guild.lv;
        bastionSave();
      }
    };
  }
}

function bastionCoopSend(payload) {
  if (!B2D.bc) return;
  try { B2D.bc.postMessage({ from: B2D.myId, ...payload }); } catch (e) {}
}

function bastion2dStep(dt) {
  const B0 = bastionEnsureState(), p = bastionProfile(), st = bastionStats();
  B2D.clock += dt;
  B0.tpCd = Math.max(0, B0.tpCd - dt);
  B0.sosCd = Math.max(0, B0.sosCd - dt);
  B0.sosActiveT = Math.max(0, B0.sosActiveT - dt);
  B0.cheatDeathCd = Math.max(0, B0.cheatDeathCd - dt);

  const pl = B2D.player;
  pl.atkCd = Math.max(0, pl.atkCd - dt);
  pl.atkAnim = Math.max(0, (pl.atkAnim || 0) - dt);
  pl.dashCd = Math.max(0, pl.dashCd - dt);
  pl.skillCd = Math.max(0, pl.skillCd - dt);
  pl.invul = Math.max(0, pl.invul - dt);

  if (!B0.armoryOpen && !pl.downed) {
    let mx = 0, my = 0;
    if (B2D.keys.has('KeyA') || B2D.keys.has('ArrowLeft')) mx -= 1;
    if (B2D.keys.has('KeyD') || B2D.keys.has('ArrowRight')) mx += 1;
    if (B2D.keys.has('KeyW') || B2D.keys.has('ArrowUp')) my -= 1;
    if (B2D.keys.has('KeyS') || B2D.keys.has('ArrowDown')) my += 1;
    if (pl.dashT > 0) {
      pl.dashT -= dt;
      if (!B2D.ghosts.length || Math.hypot(pl.x - B2D.ghosts[B2D.ghosts.length - 1].x, pl.y - B2D.ghosts[B2D.ghosts.length - 1].y) > 22) {
        B2D.ghosts.push({ x: pl.x, y: pl.y, aim: pl.aim, r: pl.r, rgb: '130,220,255', life: 0.24, max: 0.24 });
      }
    } else {
      const mlen = Math.hypot(mx, my);
      const spd = 285 * st.speedMul;
      pl.vx = mlen > 0 ? (mx / mlen) * spd : pl.vx * Math.max(0, 1 - dt * 14);
      pl.vy = mlen > 0 ? (my / mlen) * spd : pl.vy * Math.max(0, 1 - dt * 14);
    }
    pl.x = clamp(pl.x + pl.vx * dt, 32, B2D_W - 32);
    pl.y = clamp(pl.y + pl.vy * dt, 32, B2D_H - 32);
    const pSpd = Math.hypot(pl.vx, pl.vy);
    if (pSpd > 18) pl.walkT = (pl.walkT || 0) + dt * Math.min(16, 7 + pSpd * 0.025);
    if (B2D.mouse.down) b2dPlayerAttack();
  }
  for (let i = B2D.ghosts.length - 1; i >= 0; i--) {
    B2D.ghosts[i].life -= dt;
    if (B2D.ghosts[i].life <= 0) B2D.ghosts.splice(i, 1);
  }
  const distCit = Math.hypot(pl.x - B2D_CITADEL.x, pl.y - B2D_CITADEL.y);
  if (distCit < 260 && pl.hp < pl.maxHp && !pl.downed) {
    pl.hp = Math.min(pl.maxHp, pl.hp + Math.round(45 * dt));
  }
  B2D.camX += (pl.x - B2D.camX) * Math.min(1, dt * 10);
  B2D.camY += (pl.y - B2D.camY) * Math.min(1, dt * 10);

  // 检测附近交互点（驿站/建筑）
  B2D.nearInteract = null;
  for (const ws of B2D_WAYSTATIONS) {
    if (Math.hypot(pl.x - ws.x, pl.y - ws.y) <= ws.r + 16) {
      B2D.nearInteract = { kind: 'waystation', name: ws.name, x: ws.x, y: ws.y };
      pl.hp = Math.min(pl.maxHp, pl.hp + Math.round(35 * dt));
      break;
    }
  }
  if (!B2D.nearInteract) {
    for (const bs of B2D_BUILD_SPOTS) {
      if (Math.hypot(pl.x - bs.x, pl.y - bs.y) <= 56) {
        const bDef = BASTION_BUILDINGS.find(b => b.id === bs.id);
        B2D.nearInteract = { kind: 'building', tab: bs.tab, name: bDef ? bDef.name : bs.id, x: bs.x, y: bs.y };
        break;
      }
    }
  }

  // AI 同袍：在野外协同游走或回防主城
  const al = B2D.ally;
  al.atkCd = Math.max(0, al.atkCd - dt);
  al.atkAnim = Math.max(0, (al.atkAnim || 0) - dt);
  al.invul = Math.max(0, al.invul - dt);
  const allyFoe = B2D.enemies.find(e => e.hp > 0 && Math.hypot(e.x - al.x, e.y - al.y) < 360)
    || B2D.enemies.find(e => e.hp > 0);
  let atx = B0.space === 'siege' ? B2D_CITADEL.x + Math.cos(B2D.clock * 0.6) * 210 : (allyFoe ? allyFoe.x : B2D_WAYSTATIONS[1].x);
  let aty = B0.space === 'siege' ? B2D_CITADEL.y + Math.sin(B2D.clock * 0.6) * 210 : (allyFoe ? allyFoe.y : B2D_WAYSTATIONS[1].y);
  const adx = atx - al.x, ady = aty - al.y, adist = Math.hypot(adx, ady);
  if (adist > 58) {
    al.vx = (adx / adist) * 195;
    al.vy = (ady / adist) * 195;
    al.x = clamp(al.x + al.vx * dt, 40, B2D_W - 40);
    al.y = clamp(al.y + al.vy * dt, 40, B2D_H - 40);
    al.aim = Math.atan2(ady, adx);
    al.walkT = (al.walkT || 0) + dt * 10;
  } else {
    al.vx = 0; al.vy = 0;
  }
  if (allyFoe && Math.hypot(allyFoe.x - al.x, allyFoe.y - al.y) < 110 && al.atkCd <= 0) {
    al.atkCd = 0.7;
    al.atkAnim = 0.22;
    B2D.slashes.push({ x: al.x, y: al.y, ang: Math.atan2(allyFoe.y - al.y, allyFoe.x - al.x), r: 85, life: 0.16, max: 0.16, rgb: '95,225,215' });
    b2dDamageEnemy(allyFoe, 58 * st.atkMul, al.x, al.y, '95,225,215', 90);
  }
  if (pl.downed && Math.hypot(al.x - pl.x, al.y - pl.y) < 120) {
    B0.reviveT[0] += dt * st.reviveMul;
  }

  // 玩家倒地/灵狐救治判定
  if (pl.downed) {
    pl.bleedT -= dt;
    if (B0.comps.some(c => c.id === 'c_fox')) B0.reviveT[0] += dt * st.reviveMul * 0.75;
    if (B0.reviveT[0] >= 1.5) {
      pl.downed = false; B0.reviveT[0] = 0;
      pl.hp = Math.round(pl.maxHp * (st.gc.medic >= 4 ? 0.75 : 0.45));
      pl.invul = 2.0;
      B2D.rings.push({ x: pl.x, y: pl.y, r: 16, maxR: 120, life: 0.45, max: 0.45, rgb: '130,235,175' });
    } else if (pl.bleedT <= 0) {
      B0.unbankedSilver = Math.floor(B0.unbankedSilver * (st.gc.ranger >= 4 ? 0.75 : 0.5));
      pl.downed = false; pl.hp = pl.maxHp; pl.invul = 2.0;
      pl.x = B2D_CITADEL.x; pl.y = B2D_CITADEL.y + 85;
      bastionMsg('重伤撤回天枢城，未寄存碎银折损！');
    }
  }

  bastionStepCompanions(dt);

  // 增益灵珠计时衰减与拾取（地面掉落 + 灵珠）
  if (B0.boosts) {
    for (const k of Object.keys(B0.boosts)) {
      B0.boosts[k] -= dt;
      if (B0.boosts[k] <= 0) delete B0.boosts[k];
    }
  }
  const pickR = (B0.boosts && B0.boosts.magnet > 0) ? 1200 : ((st.gc.ranger >= 2 ? 150 : 62) + (st.cards.card_greed || 0) * 55);
  for (let i = B0.drops.length - 1; i >= 0; i--) {
    const d = B0.drops[i];
    d.life -= dt;
    if (d.life <= 0) { B0.drops.splice(i, 1); continue; }
    if (Math.hypot(d.x - pl.x, d.y - pl.y) <= pickR) {
      bastionCollectDrop(d);
      B0.drops.splice(i, 1);
    }
  }
  for (let i = B2D.orbs.length - 1; i >= 0; i--) {
    const o = B2D.orbs[i];
    o.life -= dt;
    if (o.life <= 0) { B2D.orbs.splice(i, 1); continue; }
    if (Math.hypot(o.x - pl.x, o.y - pl.y) <= Math.max(68, Math.min(260, pickR))) {
      bastionApplyBoost(o.kind);
      B2D.orbs.splice(i, 1);
    }
  }

  // 四角城防弩炮
  const tInterval = st.gc.summoner >= 4 ? 1.5 : 2.3;
  const tdmg = Math.round(45 + (p.buildings.walls || 1) * 12);
  for (const tr of B2D_TURRETS) {
    tr.cd = Math.max(0, tr.cd - dt);
    if (tr.cd > 0) continue;
    const tg = B2D.enemies.find(e => e.hp > 0 && Math.hypot(e.x - tr.x, e.y - tr.y) < 460);
    if (tg) {
      tr.cd = tInterval;
      const a = Math.atan2(tg.y - tr.y, tg.x - tr.x);
      B2D.projs.push({ x: tr.x, y: tr.y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, r: 7, dmg: tdmg, team: 0, life: 0.9, rgb: '233,196,106' });
    }
  }

  // 怪物 AI（野外游走追击 / 守城强攻核心）
  for (let i = B2D.enemies.length - 1; i >= 0; i--) {
    const e = B2D.enemies[i];
    if (e.hp <= 0) { B2D.enemies.splice(i, 1); continue; }
    e.vx *= Math.max(0, 1 - dt * 8);
    e.vy *= Math.max(0, 1 - dt * 8);
    e.cd = Math.max(0, e.cd - dt);
    const distP = Math.hypot(pl.x - e.x, pl.y - e.y);
    const tx = e.siege && distP > 240 ? B2D_CITADEL.x : (distP < 520 ? pl.x : e.x);
    const ty = e.siege && distP > 240 ? B2D_CITADEL.y : (distP < 520 ? pl.y : e.y);
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    const stopR = e.isRanger ? 220 : 28;
    if (d > stopR) {
      e.x += (dx / d) * e.spd * dt;
      e.y += (dy / d) * e.spd * dt;
    }
    e.x = clamp(e.x + e.vx * dt, 30, B2D_W - 30);
    e.y = clamp(e.y + e.vy * dt, 30, B2D_H - 30);
    // 守城核心碰撞与远程射击
    const dCore = Math.hypot(e.x - B2D_CITADEL.x, e.y - B2D_CITADEL.y);
    if (e.siege && dCore < 110 && e.cd <= 0) {
      e.cd = 1.4;
      B0.gateHp = Math.max(0, B0.gateHp - e.dmg);
      B2D.rings.push({ x: B2D_CITADEL.x, y: B2D_CITADEL.y, r: 40, maxR: 90, life: 0.25, max: 0.25, rgb: '255,95,95' });
    } else if (distP < (e.isRanger ? 290 : e.r + pl.r + 12) && e.cd <= 0 && !pl.downed) {
      e.cd = e.isRanger ? 1.7 : 1.15;
      if (e.isRanger) {
        const a = Math.atan2(pl.y - e.y, pl.x - e.x);
        B2D.projs.push({ x: e.x, y: e.y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, r: 7, dmg: e.dmg, team: 1, life: 1.4, rgb: e.rgb });
      } else if (pl.invul <= 0) {
        b2dHitPlayer(e.dmg);
      }
    }
  }

  // 投射物更新
  for (let i = B2D.projs.length - 1; i >= 0; i--) {
    const pr = B2D.projs[i];
    pr.life -= dt;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (pr.life <= 0) { B2D.projs.splice(i, 1); continue; }
    if (pr.team === 0) {
      for (const e of B2D.enemies) {
        if (e.hp > 0 && Math.hypot(e.x - pr.x, e.y - pr.y) <= e.r + pr.r) {
          b2dDamageEnemy(e, pr.dmg, pr.x, pr.y, pr.rgb, 55);
          B2D.projs.splice(i, 1); break;
        }
      }
    } else if (Math.hypot(pl.x - pr.x, pl.y - pr.y) <= pl.r + pr.r && pl.invul <= 0 && !pl.downed) {
      b2dHitPlayer(pr.dmg);
      B2D.projs.splice(i, 1);
    }
  }

  // 特效与飘字衰减
  for (let i = B2D.slashes.length - 1; i >= 0; i--) if ((B2D.slashes[i].life -= dt) <= 0) B2D.slashes.splice(i, 1);
  for (let i = B2D.rings.length - 1; i >= 0; i--) if ((B2D.rings[i].life -= dt) <= 0) B2D.rings.splice(i, 1);
  for (let i = B2D.sosBeacons.length - 1; i >= 0; i--) if ((B2D.sosBeacons[i].life -= dt) <= 0) B2D.sosBeacons.splice(i, 1);
  for (let i = B2D.toasts.length - 1; i >= 0; i--) if ((B2D.toasts[i].t -= dt) <= 0) B2D.toasts.splice(i, 1);
  for (let i = B2D.texts.length - 1; i >= 0; i--) {
    const t = B2D.texts[i]; t.life -= dt; t.y += t.vy * dt;
    if (t.life <= 0) B2D.texts.splice(i, 1);
  }

  // 野外自动刷怪 & 守城波次判定
  B2D.spawnT -= dt;
  if (B2D.spawnT <= 0) {
    B2D.spawnT = 5.5;
    if (B2D.enemies.length < 14) {
      const bm = B2D_BIOMES[Math.floor(Math.random() * B2D_BIOMES.length)];
      b2dSpawnPack(bm.x0 + 380 + Math.random() * 820, bm.y0 + 280 + Math.random() * 640, bm.tier, Math.random() < 0.25);
    }
  }
  if (B0.space === 'siege') {
    const siegeAlive = B2D.enemies.some(e => e.siege && e.hp > 0);
    if (!siegeAlive && B2D.siegeLeft > 0) {
      b2dSpawnSiegeWave(B0.realmTier || 1);
      B2D.siegeLeft = Math.max(0, B2D.siegeLeft - 4);
    } else if (!siegeAlive && B2D.siegeLeft <= 0) {
      p.merit += 180; p.ley = Math.min(10000, p.ley + 200); p.threat = 0; p.stats.sieges++;
      bastionSave();
      B0.space = 'citadel';
      bastionMsg('守城大捷！+180 功勋 +200 灵脉');
    } else if (B0.gateHp <= 0) {
      B0.space = 'citadel'; p.threat = 35;
      B2D.enemies = B2D.enemies.filter(e => !e.siege);
      B0.gateHp = B0.gateMaxHp;
      bastionMsg('天枢核心受损，妖潮暂时退去！');
    }
  }

  // 同步 2.5D 战斗锚点 + 多人房间状态广播
  if (typeof A === 'object' && A) { A.x = pl.x; A.y = pl.y; A.hp = pl.hp; A.maxHp = pl.maxHp; }
  if (typeof C === 'object' && C) { C.x = al.x; C.y = al.y; C.hp = al.hp; C.maxHp = al.maxHp; }
  B2D.syncT -= dt;
  if (B2D.syncT <= 0) {
    B2D.syncT = 0.08;
    bastionCoopSend({
      t: 'state', name: (typeof curName === 'function' && curName()) || '侠士',
      x: Math.round(pl.x), y: Math.round(pl.y), vx: Math.round(pl.vx || 0), vy: Math.round(pl.vy || 0),
      aim: Math.round((pl.aim || 0) * 100) / 100, genre: pl.genre || 'berserker',
      shield: Math.round(pl.shield || 0), atkAnim: pl.atkAnim || 0, downed: !!pl.downed,
      hp: Math.round(pl.hp), maxHp: Math.round(pl.maxHp), sosT: B0.sosActiveT
    });
    b2dRenderTopBar();
    bastionSyncHUD();
  }
}

function b2dHitPlayer(rawDmg) {
  const pl = B2D.player, B0 = M.bastion, st = bastionStats();
  let d = Math.max(1, Math.round(rawDmg * (1 - st.dr)));
  if (pl.shield > 0) {
    const abs = Math.min(pl.shield, d);
    pl.shield -= abs; d -= abs;
  }
  pl.hp = Math.max(0, pl.hp - d);
  pl.invul = 0.25;
  b2dFloatText(`-${d}`, pl.x, pl.y - 24, '255,95,105');
  if (pl.hp <= 0) {
    if (st.gc.berserker >= 6 && B0.cheatDeathCd <= 0) {
      B0.cheatDeathCd = 15;
      pl.hp = Math.max(1, Math.round(pl.maxHp * 0.25));
      pl.invul = 2.0;
      b2dFloatText('血煞免死!', pl.x, pl.y - 36, '235,75,85');
      return;
    }
    pl.downed = true;
    pl.bleedT = 12;
    bastionMsg('重伤倒地！队友靠近或灵狐正在救治…');
  }
}

function b2dDrawWorld() {
  const cv = document.getElementById('bastionCanvas'); if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const c2 = cv.getContext('2d');
  c2.save();
  c2.scale(dpr, dpr);
  c2.fillStyle = '#070b11';
  c2.fillRect(0, 0, w, h);

  const ox = w / 2 - B2D.camX, oy = h / 2 - B2D.camY;
  c2.translate(ox, oy);

  // 1. 四大 2D 平面地貌分区
  for (const bm of B2D_BIOMES) {
    c2.fillStyle = bm.bg;
    c2.fillRect(bm.x0, bm.y0, bm.x1 - bm.x0, bm.y1 - bm.y0);
    c2.strokeStyle = bm.grid;
    c2.lineWidth = 1;
    const step = 120;
    for (let x = bm.x0; x <= bm.x1; x += step) {
      c2.beginPath(); c2.moveTo(x, bm.y0); c2.lineTo(x, bm.y1); c2.stroke();
    }
    for (let y = bm.y0; y <= bm.y1; y += step) {
      c2.beginPath(); c2.moveTo(bm.x0, y); c2.lineTo(bm.x1, y); c2.stroke();
    }
    c2.font = '700 22px "Noto Serif SC", serif';
    c2.fillStyle = `rgba(${bm.rgb},0.22)`;
    c2.textAlign = 'center';
    c2.fillText(`${bm.name} (T${bm.tier})`, (bm.x0 + bm.x1) / 2, (bm.y0 + bm.y1) / 2 - 220);
  }

  // 四方驰道（连接主城与四方驿站）
  c2.fillStyle = 'rgba(233,196,106,0.06)';
  c2.fillRect(B2D_CITADEL.x - 42, 460, 84, B2D_H - 920);
  c2.fillRect(700, B2D_CITADEL.y - 42, B2D_W - 1400, 84);

  // 2. 天枢主城（城墙、核心、炮台、七座建筑）
  c2.beginPath(); c2.arc(B2D_CITADEL.x, B2D_CITADEL.y, B2D_CITADEL.r, 0, Math.PI * 2);
  c2.fillStyle = '#151925'; c2.fill();
  c2.lineWidth = 8; c2.strokeStyle = 'rgba(233,196,106,0.48)'; c2.stroke();

  const B0 = bastionEnsureState();
  c2.beginPath(); c2.arc(B2D_CITADEL.x, B2D_CITADEL.y, 44, 0, Math.PI * 2);
  c2.fillStyle = 'rgba(95,225,215,0.2)'; c2.fill();
  c2.lineWidth = 3; c2.strokeStyle = '#6fe8dc'; c2.stroke();
  c2.font = '700 13px "Noto Serif SC", sans-serif'; c2.fillStyle = '#e9c46a'; c2.textAlign = 'center';
  c2.fillText(`天枢核心 ${Math.round(B0.gateHp)}/${B0.gateMaxHp}`, B2D_CITADEL.x, B2D_CITADEL.y - 54);

  for (const tr of B2D_TURRETS) {
    c2.fillStyle = '#2b3248'; c2.strokeStyle = '#e9c46a'; c2.lineWidth = 2;
    c2.beginPath(); c2.arc(tr.x, tr.y, 16, 0, Math.PI * 2); c2.fill(); c2.stroke();
  }

  const p = bastionProfile();
  for (const bs of B2D_BUILD_SPOTS) {
    const bDef = BASTION_BUILDINGS.find(b => b.id === bs.id);
    const active = B2D.nearInteract && B2D.nearInteract.x === bs.x && B2D.nearInteract.y === bs.y;
    c2.fillStyle = active ? 'rgba(233,196,106,0.28)' : 'rgba(233,196,106,0.1)';
    c2.strokeStyle = active ? '#ffd97a' : 'rgba(233,196,106,0.45)';
    c2.lineWidth = active ? 2.5 : 1.5;
    c2.beginPath(); c2.arc(bs.x, bs.y, 26, 0, Math.PI * 2); c2.fill(); c2.stroke();
    c2.font = '600 12px "Noto Serif SC", sans-serif'; c2.fillStyle = '#efe8d8';
    c2.fillText(`${bDef ? bDef.name : bs.id} L${p.buildings[bs.id] || 1}`, bs.x, bs.y - 32);
  }

  // 3. 四方驿站
  for (const ws of B2D_WAYSTATIONS) {
    c2.beginPath(); c2.arc(ws.x, ws.y, ws.r, 0, Math.PI * 2);
    c2.fillStyle = 'rgba(110,235,175,0.12)'; c2.fill();
    c2.lineWidth = 2.5; c2.strokeStyle = 'rgba(110,235,175,0.65)'; c2.stroke();
    c2.font = '700 13px "Noto Serif SC", sans-serif'; c2.fillStyle = '#9ef5c8';
    c2.fillText(`⛩ ${ws.name}`, ws.x, ws.y - ws.r - 8);
  }

  // 4. 地面掉落与 SOS 信标
  for (const d of B0.drops) {
    const rgb = d.kind === 'silver' ? '245,215,110' : ((BASTION_MAT_BY[d.id] && BASTION_MAT_BY[d.id].rgb) || '180,220,255');
    c2.fillStyle = `rgb(${rgb})`;
    c2.beginPath(); c2.arc(d.x, d.y, 8, 0, Math.PI * 2); c2.fill();
  }
  for (const sb of B2D.sosBeacons) {
    const pulse = 28 + Math.sin(B2D.clock * 8) * 10;
    c2.strokeStyle = 'rgba(255,165,80,0.85)'; c2.lineWidth = 3;
    c2.beginPath(); c2.arc(sb.x, sb.y, pulse, 0, Math.PI * 2); c2.stroke();
  }

  // 5. 敌人
  for (const e of B2D.enemies) {
    c2.fillStyle = `rgba(${e.rgb},0.88)`;
    c2.beginPath(); c2.arc(e.x, e.y, e.r, 0, Math.PI * 2); c2.fill();
    c2.strokeStyle = '#111'; c2.lineWidth = 2; c2.stroke();
    c2.fillStyle = 'rgba(0,0,0,0.65)'; c2.fillRect(e.x - 22, e.y - e.r - 12, 44, 5);
    c2.fillStyle = `rgb(${e.rgb})`; c2.fillRect(e.x - 22, e.y - e.r - 12, 44 * Math.max(0, e.hp / e.maxHp), 5);
    c2.font = '600 12px "Noto Serif SC", sans-serif'; c2.fillStyle = '#f8d8d0';
    c2.fillText(e.name, e.x, e.y - e.r - 16);
  }

  // 6. 冲刺残影、队友、同房玩家、灵侍与本地玩家（分层俯视角武侠身形）
  for (const g of B2D.ghosts) {
    const a = (g.life / g.max) * 0.45;
    c2.save();
    c2.translate(g.x, g.y); c2.rotate(g.aim || 0);
    c2.fillStyle = `rgba(${g.rgb},${a})`;
    c2.beginPath(); c2.arc(0, 0, g.r * 0.9, 0, Math.PI * 2); c2.fill();
    c2.restore();
  }

  const drawWeapon = (genre, r, accentRgb) => {
    c2.save();
    if (genre === 'ranger') {
      c2.strokeStyle = '#d9b578'; c2.lineWidth = 3;
      c2.beginPath(); c2.arc(r * 0.55, 0, r * 0.95, -0.85, 0.85); c2.stroke();
      c2.strokeStyle = 'rgba(255,255,255,0.65)'; c2.lineWidth = 1.2;
      c2.beginPath(); c2.moveTo(r * 0.55 + Math.cos(-0.85) * r * 0.95, Math.sin(-0.85) * r * 0.95);
      c2.lineTo(r * 0.55 + Math.cos(0.85) * r * 0.95, Math.sin(0.85) * r * 0.95); c2.stroke();
      c2.strokeStyle = '#e7edf5'; c2.lineWidth = 2;
      c2.beginPath(); c2.moveTo(r * 0.45, 0); c2.lineTo(r * 1.9, 0); c2.stroke();
    } else if (genre === 'assassin') {
      for (const sgn of [-1, 1]) {
        c2.fillStyle = '#dce6f2'; c2.strokeStyle = `rgb(${accentRgb})`; c2.lineWidth = 1.2;
        c2.beginPath(); c2.moveTo(r * 0.6, sgn * r * 0.72);
        c2.lineTo(r * 1.75, sgn * r * 0.55); c2.lineTo(r * 0.85, sgn * r * 0.92);
        c2.closePath(); c2.fill(); c2.stroke();
      }
    } else if (genre === 'elemental' || genre === 'medic' || genre === 'summoner') {
      c2.strokeStyle = '#9c784c'; c2.lineWidth = 3;
      c2.beginPath(); c2.moveTo(-r * 0.4, r * 0.62); c2.lineTo(r * 1.65, r * 0.36); c2.stroke();
      c2.fillStyle = `rgb(${accentRgb})`;
      c2.beginPath(); c2.arc(r * 1.72, r * 0.34, 4.5, 0, Math.PI * 2); c2.fill();
    } else if (genre === 'juggernaut' || genre === 'warden' || genre === 'siege') {
      c2.fillStyle = '#536275'; c2.strokeStyle = '#e9c46a'; c2.lineWidth = 2;
      c2.beginPath(); c2.arc(r * 0.85, -r * 0.42, r * 0.72, -1.1, 1.1); c2.stroke();
      c2.strokeStyle = '#d8dee8'; c2.lineWidth = 3;
      c2.beginPath(); c2.moveTo(0, r * 0.72); c2.lineTo(r * 2.0, r * 0.62); c2.stroke();
    } else {
      c2.fillStyle = '#dde5ef'; c2.strokeStyle = '#8b9bb0'; c2.lineWidth = 1.2;
      c2.beginPath(); c2.moveTo(r * 0.65, r * 0.5); c2.lineTo(r * 2.05, r * 0.32);
      c2.lineTo(r * 1.88, r * 0.64); c2.lineTo(r * 0.65, r * 0.66);
      c2.closePath(); c2.fill(); c2.stroke();
      c2.strokeStyle = '#e9c46a'; c2.lineWidth = 2.4;
      c2.beginPath(); c2.moveTo(r * 0.62, r * 0.32); c2.lineTo(r * 0.62, r * 0.8); c2.stroke();
    }
    c2.restore();
  };

  const drawActor = (act, fillRgb, label) => {
    const r = act.r || 15;
    const genre = act.genre || 'berserker';
    const wepDef = BASTION_GENRE_BY[genre];
    const accentRgb = wepDef ? wepDef.rgb : fillRgb;
    const walk = act.walkT || 0;
    const stride = Math.sin(walk) * 5.5;
    const swing = act.atkAnim > 0 ? ((act.atkAnim / 0.22) - 0.5) * 1.9 : 0;
    const spd = Math.hypot(act.vx || 0, act.vy || 0);
    const flutter = Math.sin(B2D.clock * 8 + act.x * 0.02) * (spd > 20 ? 5.5 : 2.2);

    c2.save();
    // 地面投影
    c2.save();
    c2.translate(act.x + 2, act.y + 6);
    c2.scale(1.18, 0.72);
    c2.fillStyle = 'rgba(0,0,0,0.42)';
    c2.beginPath(); c2.arc(0, 0, r * 0.96, 0, Math.PI * 2); c2.fill();
    c2.restore();

    // 无敌 / 护盾 / 倒地外环
    if (act.downed) {
      const pulse = 0.45 + 0.35 * Math.sin(B2D.clock * 7);
      c2.strokeStyle = `rgba(255,95,95,${pulse})`; c2.lineWidth = 3;
      c2.beginPath(); c2.arc(act.x, act.y, r + 10, 0, Math.PI * 2); c2.stroke();
    } else if (act.invul > 0) {
      c2.strokeStyle = 'rgba(130,235,255,0.82)'; c2.lineWidth = 3;
      c2.beginPath(); c2.arc(act.x, act.y, r + 8, 0, Math.PI * 2); c2.stroke();
    }
    if ((act.shield || 0) > 0) {
      c2.fillStyle = 'rgba(115,215,255,0.16)'; c2.strokeStyle = 'rgba(130,230,255,0.72)'; c2.lineWidth = 2;
      c2.beginPath(); c2.arc(act.x, act.y, r + 5, 0, Math.PI * 2); c2.fill(); c2.stroke();
    }

    // 旋转至面朝方向绘制角色身形
    c2.save();
    c2.translate(act.x, act.y);
    c2.rotate(act.aim || 0);
    if (act.downed) c2.scale(0.9, 0.72);

    // 飘动披风/绶带
    c2.fillStyle = `rgba(${fillRgb},0.48)`;
    c2.beginPath();
    c2.moveTo(-r * 0.35, -r * 0.62);
    c2.quadraticCurveTo(-r * 1.45, -r * 0.25 + flutter, -r * 1.65 - Math.min(8, spd * 0.025), flutter);
    c2.quadraticCurveTo(-r * 1.3, r * 0.45 + flutter, -r * 0.35, r * 0.62);
    c2.closePath();
    c2.fill();

    // 行走双足
    c2.fillStyle = '#1d2230';
    for (const [fx, fy] of [[stride, -r * 0.46], [-stride, r * 0.46]]) {
      c2.beginPath(); c2.arc(fx, fy, 4.2, 0, Math.PI * 2); c2.fill();
    }

    // 武器与双掌（随攻击挥砍摆动）
    c2.save();
    c2.rotate(swing);
    drawWeapon(genre, r, accentRgb);
    c2.fillStyle = '#f2cfb0'; c2.strokeStyle = '#2b221a'; c2.lineWidth = 1.2;
    for (const [hx, hy] of [[r * 0.56, r * 0.58], [r * 0.52, -r * 0.54]]) {
      c2.beginPath(); c2.arc(hx, hy, 4, 0, Math.PI * 2); c2.fill(); c2.stroke();
    }
    c2.restore();

    // 宽肩武袍与护肩
    c2.save();
    c2.scale(0.76, 1.16);
    c2.fillStyle = `rgb(${fillRgb})`;
    c2.strokeStyle = 'rgba(255,255,255,0.88)'; c2.lineWidth = 1.8;
    c2.beginPath(); c2.arc(0, 0, r * 0.92, 0, Math.PI * 2); c2.fill(); c2.stroke();
    // 交领前襟
    c2.strokeStyle = 'rgba(22,26,36,0.65)'; c2.lineWidth = 2;
    c2.beginPath(); c2.moveTo(r * 0.15, -r * 0.45); c2.lineTo(r * 0.68, r * 0.25); c2.stroke();
    c2.restore();

    // 头部、束发发髻与护额
    c2.fillStyle = '#202432';
    c2.beginPath(); c2.arc(2, 0, r * 0.56, 0, Math.PI * 2); c2.fill();
    c2.fillStyle = '#f3d2b5';
    c2.beginPath(); c2.arc(5, 0, r * 0.34, -1.1, 1.1); c2.fill();
    c2.fillStyle = '#181b26';
    c2.beginPath(); c2.arc(-3, 0, r * 0.28, 0, Math.PI * 2); c2.fill();
    c2.fillStyle = `rgb(${accentRgb})`;
    c2.beginPath(); c2.arc(-3, 0, r * 0.13, 0, Math.PI * 2); c2.fill();
    c2.restore();

    // 血条与姓名
    c2.fillStyle = 'rgba(0,0,0,0.68)'; c2.fillRect(act.x - 24, act.y - r - 18, 48, 5);
    c2.fillStyle = act.downed ? '#eb5f5f' : '#6fe89f';
    c2.fillRect(act.x - 24, act.y - r - 18, 48 * Math.max(0, act.hp / act.maxHp), 5);
    if ((act.shield || 0) > 0) {
      c2.fillStyle = '#8ad8ff';
      c2.fillRect(act.x - 24, act.y - r - 18, 48 * Math.min(1, act.shield / act.maxHp), 2);
    }
    c2.font = '700 12px "Noto Serif SC", sans-serif'; c2.fillStyle = '#fff'; c2.textAlign = 'center';
    c2.fillText(label, act.x, act.y - r - 23);
    c2.restore();
  };
  drawActor(B2D.ally, B2D.ally.rgb, B2D.ally.name);
  const now = Date.now();
  for (const peer of B2D.peers.values()) {
    if (now - peer.ts < 8000) {
      drawActor({ ...peer, r: 15, invul: 0, walkT: B2D.clock * (Math.hypot(peer.vx || 0, peer.vy || 0) > 20 ? 10 : 0) }, peer.rgb, peer.name);
    }
  }
  drawActor(B2D.player, B2D.player.downed ? '235,95,95' : '233,196,106', (typeof curName === 'function' && curName()) || '你');

  for (const cp of B0.comps || []) {
    const def = BASTION_COMP_BY[cp.id]; if (!def) continue;
    c2.fillStyle = `rgba(${def.rgb},0.35)`; c2.strokeStyle = `rgb(${def.rgb})`; c2.lineWidth = 2;
    c2.beginPath(); c2.arc(cp.x, cp.y, 11, 0, Math.PI * 2); c2.fill(); c2.stroke();
    c2.font = '600 12px "Noto Serif SC", sans-serif'; c2.fillStyle = `rgb(${def.rgb})`; c2.textAlign = 'center';
    c2.fillText(def.name, cp.x, cp.y - 15);
  }

  for (const o of B2D.orbs) {
    const def = BASTION_BOOSTS[o.kind] || { name: '灵珠', rgb: '233,196,106' };
    const bob = Math.sin(B2D.clock * 6 + o.x) * 3;
    c2.fillStyle = `rgba(${def.rgb},0.32)`; c2.strokeStyle = `rgb(${def.rgb})`; c2.lineWidth = 2.5;
    c2.beginPath(); c2.arc(o.x, o.y + bob, 13, 0, Math.PI * 2); c2.fill(); c2.stroke();
    c2.fillStyle = '#fff';
    c2.beginPath(); c2.arc(o.x - 3, o.y + bob - 3, 3.5, 0, Math.PI * 2); c2.fill();
    c2.font = '700 12px "Noto Serif SC", sans-serif'; c2.fillStyle = `rgb(${def.rgb})`; c2.textAlign = 'center';
    c2.fillText(def.name, o.x, o.y + bob - 18);
  }

  // 7. 挥砍弧光、光环、投射物与飘字
  for (const s of B2D.slashes) {
    const a = s.life / s.max;
    c2.strokeStyle = `rgba(${s.rgb},${a})`; c2.lineWidth = 10 * a;
    c2.beginPath(); c2.arc(s.x, s.y, s.r, s.ang - 1.1, s.ang + 1.1); c2.stroke();
  }
  for (const r of B2D.rings) {
    const p2 = 1 - r.life / r.max;
    c2.strokeStyle = `rgba(${r.rgb},${r.life / r.max})`; c2.lineWidth = 3;
    c2.beginPath(); c2.arc(r.x, r.y, r.r + (r.maxR - r.r) * p2, 0, Math.PI * 2); c2.stroke();
  }
  for (const pr of B2D.projs) {
    c2.fillStyle = `rgb(${pr.rgb})`;
    c2.beginPath(); c2.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); c2.fill();
  }
  for (const tx of B2D.texts) {
    c2.font = '700 13px "Noto Serif SC", sans-serif';
    c2.fillStyle = `rgba(${tx.rgb},${tx.life / tx.max})`;
    c2.textAlign = 'center';
    c2.fillText(tx.text, tx.x, tx.y);
  }

  // 附近交互提示
  if (B2D.nearInteract) {
    c2.font = '700 13px "Noto Serif SC", sans-serif';
    c2.fillStyle = '#ffe596';
    c2.textAlign = 'center';
    c2.fillText(B2D.nearInteract.kind === 'waystation' ? `[E] 寄存战利品 (${B2D.nearInteract.name})` : `[E] 进入 ${B2D.nearInteract.name}`, B2D.player.x, B2D.player.y + 38);
  }
  c2.restore();

  // 屏幕左下提示队列
  if (B2D.toasts.length) {
    c2.save();
    c2.scale(dpr, dpr);
    c2.font = '600 13px "Noto Serif SC", sans-serif';
    c2.textAlign = 'left';
    B2D.toasts.forEach((tt, idx) => {
      c2.fillStyle = 'rgba(12,15,24,0.82)';
      c2.fillRect(16, h - 135 - idx * 30, 320, 24);
      c2.fillStyle = '#f5de9a';
      c2.fillText(tt.text, 24, h - 118 - idx * 30);
    });
    c2.restore();
  }

  b2dDrawMinimap();
}

function b2dDrawMinimap() {
  const mm = document.getElementById('bastionMinimap'); if (!mm) return;
  const mc = mm.getContext('2d'), mw = mm.width, mh = mm.height;
  const sx = mw / B2D_W, sy = mh / B2D_H;
  mc.clearRect(0, 0, mw, mh);
  for (const bm of B2D_BIOMES) {
    mc.fillStyle = bm.bg;
    mc.fillRect(bm.x0 * sx, bm.y0 * sy, (bm.x1 - bm.x0) * sx, (bm.y1 - bm.y0) * sy);
  }
  mc.strokeStyle = 'rgba(233,196,106,0.7)'; mc.lineWidth = 1.5;
  mc.beginPath(); mc.arc(B2D_CITADEL.x * sx, B2D_CITADEL.y * sy, B2D_CITADEL.r * sx, 0, Math.PI * 2); mc.stroke();
  mc.fillStyle = '#9ef5c8';
  for (const ws of B2D_WAYSTATIONS) { mc.fillRect(ws.x * sx - 2, ws.y * sy - 2, 4, 4); }
  mc.fillStyle = '#ff6d6d';
  for (const e of B2D.enemies) { mc.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3); }
  mc.fillStyle = '#ffa84a';
  for (const sb of B2D.sosBeacons) { mc.beginPath(); mc.arc(sb.x * sx, sb.y * sy, 5, 0, Math.PI * 2); mc.fill(); }
  mc.fillStyle = '#6fe8dc';
  mc.beginPath(); mc.arc(B2D.ally.x * sx, B2D.ally.y * sy, 4, 0, Math.PI * 2); mc.fill();
  const now = Date.now();
  for (const peer of B2D.peers.values()) {
    if (now - peer.ts < 8000) {
      mc.fillStyle = '#8cc8ff';
      mc.beginPath(); mc.arc(peer.x * sx, peer.y * sy, 4, 0, Math.PI * 2); mc.fill();
    }
  }
  mc.fillStyle = '#ffd97a';
  mc.beginPath(); mc.arc(B2D.player.x * sx, B2D.player.y * sy, 4.5, 0, Math.PI * 2); mc.fill();
}

function b2dRenderTopBar() {
  const bar = document.getElementById('bastionTopBar'); if (!bar) return;
  const B0 = bastionEnsureState(), p = bastionProfile(), bm = b2dBiomeAt(B2D.player.x, B2D.player.y);
  const now = Date.now(), peers = [];
  for (const pr of B2D.peers.values()) if (now - pr.ts < 8000) peers.push(pr);
  const allyHtml = `<button type="button" class="b2d-ally-btn" data-tp="${B2D.ally.id}">TP → ${B2D.ally.name}</button>`
    + peers.map(pr => `<button type="button" class="b2d-ally-btn" data-tp="${pr.id}">TP → ${pr.name}</button>`).join('');
  const cardStacks = Object.values(B0.cards || {}).reduce((a, b) => a + b, 0);
  const activeBoosts = Object.entries(B0.boosts || {}).map(([k, t]) => `${BASTION_BOOSTS[k]?.name || k} ${Math.ceil(t)}s`).join(' · ');
  bar.innerHTML = `<span class="b2d-pill"><b>${B0.space === 'siege' ? '守城战' : bm.name}</b> · 威胁 ${Math.floor(p.threat)}%</span>`
    + `<span class="b2d-pill"><b>Lv.${p.level || 1}</b> (${p.xp || 0}/${bastionXpNeeded(p.level || 1)})${cardStacks ? ` · 秘卷×${cardStacks}` : ''}${activeBoosts ? ` · ${activeBoosts}` : ''}</span>`
    + `<span class="b2d-pill">气血 <b>${Math.round(B2D.player.hp)}/${B2D.player.maxHp}</b>${B2D.player.shield > 0 ? ` (+${Math.round(B2D.player.shield)}盾)` : ''}</span>`
    + `<span class="b2d-pill">功勋 <b>${p.merit}</b> · 随身银 <b>${B0.unbankedSilver}</b> · 寄存 <b>${B0.bankedSilver}</b></span>`
    + allyHtml
    + `<button type="button" class="b2d-ally-btn" id="b2dRoomBtn">房号:${B2D.roomCode} (${1 + peers.length}人)</button>`;
  for (const btn of bar.querySelectorAll('[data-tp]')) btn.onclick = () => bastionTpToAlly(btn.dataset.tp);
  const rb = document.getElementById('b2dRoomBtn');
  if (rb) rb.onclick = () => {
    const nxt = prompt('输入联机房号（相同房号可随时加入并互相传送）：', B2D.roomCode);
    if (nxt && nxt.trim()) { bastionCoopOpen(nxt.trim()); b2dRenderTopBar(); }
  };
}

function b2dLoop(ts) {
  if (!B2D.open) return;
  const dt = Math.min(0.05, Math.max(0.004, (ts - (B2D.lastTs || ts)) / 1000));
  B2D.lastTs = ts;
  bastion2dStep(dt);
  b2dDrawWorld();
  B2D.raf = requestAnimationFrame(b2dLoop);
}

function b2dBindDom() {
  if (B2D.boundDom) return;
  B2D.boundDom = true;
  const cv = document.getElementById('bastionCanvas');
  const mm = document.getElementById('bastionMinimap');
  const back = document.getElementById('bastionBack');
  if (back) back.onclick = closeBastion;
  if (cv) {
    cv.addEventListener('mousemove', e => {
      const r = cv.getBoundingClientRect();
      B2D.mouse.x = e.clientX - r.left; B2D.mouse.y = e.clientY - r.top;
      const wx = B2D.mouse.x - r.width / 2 + B2D.camX;
      const wy = B2D.mouse.y - r.height / 2 + B2D.camY;
      B2D.player.aim = Math.atan2(wy - B2D.player.y, wx - B2D.player.x);
    });
    cv.addEventListener('mousedown', e => {
      if (e.button === 2) b2dPlayerDash();
      else { B2D.mouse.down = true; b2dPlayerAttack(); }
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }
  if (mm) {
    mm.onclick = ev => {
      const r = mm.getBoundingClientRect();
      const wx = ((ev.clientX - r.left) / r.width) * B2D_W;
      const wy = ((ev.clientY - r.top) / r.height) * B2D_H;
      let nearest = B2D.ally, best = Math.hypot(B2D.ally.x - wx, B2D.ally.y - wy);
      for (const peer of B2D.peers.values()) {
        const d = Math.hypot(peer.x - wx, peer.y - wy);
        if (d < best) { best = d; nearest = peer; }
      }
      if (best < 420 && nearest) bastionTpToAlly(nearest.id);
    };
  }
  window.addEventListener('mouseup', () => { B2D.mouse.down = false; });
  window.addEventListener('keydown', e => {
    if (!B2D.open) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    B2D.keys.add(e.code);
    if (e.repeat) return;
    if (M.bastion && M.bastion.pendingCards && M.bastion.pendingCards.length) {
      if (e.code === 'Digit1') { e.preventDefault(); bastionPickCard(0); return; }
      if (e.code === 'Digit2') { e.preventDefault(); bastionPickCard(1); return; }
      if (e.code === 'Digit3') { e.preventDefault(); bastionPickCard(2); return; }
    }
    if (e.code === 'KeyT') { e.preventDefault(); bastionTpToAlly(); }
    else if (e.code === 'KeyV') { e.preventDefault(); bastionFireSos(); }
    else if (e.code === 'KeyG') { e.preventDefault(); bastionCastCompanionSkill(); }
    else if (e.code === 'KeyB') { e.preventDefault(); bastionToggleArmory(); }
    else if (e.code === 'KeyE' || e.code === 'KeyR') { e.preventDefault(); b2dInteract(); }
    else if (e.code === 'KeyJ' || e.code === 'Space') { e.preventDefault(); b2dPlayerAttack(); }
    else if (e.code === 'KeyK' || e.code === 'ShiftLeft') { e.preventDefault(); b2dPlayerDash(); }
    else if (e.code === 'KeyU') { e.preventDefault(); b2dPlayerSkill(); }
    else if (e.code === 'Escape') {
      e.preventDefault();
      if (M.bastion && M.bastion.armoryOpen) bastionToggleArmory(false);
      else closeBastion();
    }
  });
  window.addEventListener('keyup', e => { B2D.keys.delete(e.code); });
}

function openBastion() {
  initAudio();
  b2dBindDom();
  const wrap = document.getElementById('bastionGame');
  if (wrap) wrap.classList.remove('hidden');
  B2D.open = true;
  B2D.lastTs = performance.now();
  const B0 = bastionEnsureState();
  bastionSync2dPlayerStats();
  bastionInitCompanions();
  if (!B2D.enemies.length) {
    for (const bm of B2D_BIOMES) b2dSpawnPack((bm.x0 + bm.x1) / 2, (bm.y0 + bm.y1) / 2, bm.tier, true);
  }
  bastionCoopOpen(B2D.roomCode);
  b2dRenderTopBar();
  ensureBastionOverlay();
  bastionSyncHUD();
  bastionMsg('已进入 2D 平面天枢大世界（WASD移动 · 鼠标/J攻击 · K冲刺 · T传音 · V穿云）');
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(B2D.raf);
  B2D.raf = requestAnimationFrame(b2dLoop);
  const cv = document.getElementById('bastionCanvas');
  if (cv && typeof cv.focus === 'function') cv.focus();
}

function closeBastion() {
  B2D.open = false;
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(B2D.raf);
  B2D.keys.clear();
  B2D.mouse.down = false;
  if (B2D.bc) { try { B2D.bc.close(); } catch (e) {} B2D.bc = null; }
  const wrap = document.getElementById('bastionGame');
  if (wrap) wrap.classList.add('hidden');
  if (M.bastion) M.bastion.armoryOpen = false;
  bastionSyncHUD();
}

// ======================= 整备抽屉与 HUD =======================
let bastionArmoryTab = 'forge';
function bastionToggleArmory(force) {
  const B0 = bastionEnsureState();
  B0.armoryOpen = force !== undefined ? !!force : !B0.armoryOpen;
  bastionRenderArmory();
}

function ensureBastionOverlay() {
  if (typeof document === 'undefined' || !document.body) return null;
  let bar = document.getElementById('bastionHudBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bastionHudBar';
    bar.className = 'bastion-hud-bar';
    document.body.appendChild(bar);
  }
  if (!bar.dataset.bound) {
    bar.dataset.bound = '1';
    bar.innerHTML = `<button type="button" class="ghost small" id="bHudTp">[T] 传音同袍</button>`
      + `<button type="button" class="ghost small" id="bHudSos">[V] 穿云箭</button>`
      + `<button type="button" class="ghost small" id="bHudComp">[G] 灵侍绝技</button>`
      + `<button type="button" class="ghost small" id="bHudBank">⛩ 寄存</button>`
      + `<button type="button" class="ghost small" id="bHudExtract">撤离回城</button>`
      + `<button type="button" class="go small" id="bHudArmory">[B] 天枢整备</button>`;
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind('bHudTp', () => bastionTpToAlly());
    bind('bHudSos', () => bastionFireSos());
    bind('bHudComp', () => bastionCastCompanionSkill());
    bind('bHudBank', () => bastionWaystationBank());
    bind('bHudExtract', () => bastionExtract());
    bind('bHudArmory', () => bastionToggleArmory());
  }
  let drawer = document.getElementById('bastionDrawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'bastionDrawer';
    drawer.className = 'bastion-drawer hidden';
    document.body.appendChild(drawer);
  }
  return { bar, drawer };
}

function bastionSyncHUD() {
  const ui = ensureBastionOverlay(); if (!ui) return;
  const on = B2D.open || (M.mode === 'bastion' && !document.querySelector('.scr.on'));
  ui.bar.style.display = on ? 'flex' : 'none';
  if (!on || !M.bastion) { ui.drawer.classList.add('hidden'); return; }
  const tpBtn = document.getElementById('bHudTp');
  if (tpBtn) tpBtn.textContent = M.bastion.tpCd > 0 && M.bastion.sosActiveT <= 0 ? `[T] 传音 (${Math.ceil(M.bastion.tpCd)}s)` : '[T] 传音同袍';
  const sosBtn = document.getElementById('bHudSos');
  if (sosBtn) sosBtn.textContent = M.bastion.sosCd > 0 ? `[V] 穿云 (${Math.ceil(M.bastion.sosCd)}s)` : '[V] 穿云箭';
}

function bastionRenderArmory() {
  const ui = ensureBastionOverlay(); if (!ui) return;
  if (!M.bastion || !M.bastion.armoryOpen) { ui.drawer.classList.add('hidden'); return; }
  ui.drawer.classList.remove('hidden');
  const p = bastionProfile(), st = bastionStats();
  let html = `<div class="bd-head"><b>天枢城 · 整备百业（功勋:${p.merit} | 灵脉:${p.ley} | 宗门库:${p.guild.treasury}）</b>`
    + `<button type="button" class="ghost small" id="bCloseDrawer">关闭 [B]</button></div>`
    + `<div class="bd-tabs">`
    + `<button type="button" class="ghost small ${bastionArmoryTab === 'forge' ? 'sel' : ''}" data-bt="forge">百兵衣冠 (8流派6槽)</button>`
    + `<button type="button" class="ghost small ${bastionArmoryTab === 'comp' ? 'sel' : ''}" data-bt="comp">随行灵侍 (6位)</button>`
    + `<button type="button" class="ghost small ${bastionArmoryTab === 'mats' ? 'sel' : ''}" data-bt="mats">万象材谱 (24种)</button>`
    + `<button type="button" class="ghost small ${bastionArmoryTab === 'city' ? 'sel' : ''}" data-bt="city">城防·宗门·传送阵</button>`
    + `</div><div class="bd-body">`;
  if (bastionArmoryTab === 'forge') {
    const activeSets = BASTION_GENRES.filter(g => st.gc[g.id] >= 2).map(g => `${g.name} (${st.gc[g.id]}件)`).join('、') || '暂无激活套装';
    const cardList = Object.entries(st.cards || {}).map(([id, n]) => `${BASTION_CARD_BY[id]?.name || id}×${n}`).join('、') || '暂无本局秘卷';
    html += `<p class="bd-sub">境界 Lv.${p.level || 1} | 套装：${activeSets} | 秘卷：${cardList} | 攻击×${st.atkMul.toFixed(2)} | 气血×${st.hpMul.toFixed(2)}</p>`;
    html += `<div class="bd-grid">` + BASTION_SLOTS.map(s => {
      const it = st.eq[s.id];
      const upgTxt = it && it.upg ? ` +${it.upg}` : '';
      return `<div class="bd-card"><b>${s.name}</b><small>${it ? it.name + upgTxt : '未穿戴'}</small>`
        + (it && (it.upg || 0) < 5 ? `<button type="button" class="ghost small bEnhBtn" data-bi="${it.id}">强化 +1 (${((it.upg || 0) + 1) * 50}功勋)</button>` : '')
        + `</div>`;
    }).join('') + `</div>`;
    html += `<div class="bd-row">` + BASTION_GENRES.map(g => `<button type="button" class="ghost small bForgeBtn" data-bg="${g.id}">锻造 ${g.name} 兵器</button>`).join('') + `</div>`;
    html += `<div class="bd-row">` + p.bag.slice(-8).map(it => `<button type="button" class="ghost small bEquipBtn" data-bi="${it.id}">穿戴 ${it.name}${it.upg ? ` +${it.upg}` : ''}</button>`).join('') + `</div>`;
  } else if (bastionArmoryTab === 'comp') {
    html += `<div class="bd-grid">` + BASTION_COMPANIONS.map(c => {
      const has = p.comp.unlocked.includes(c.id), isAct = p.comp.active === c.id;
      return `<div class="bd-card"><b>${c.name} (${c.role})</b><small>${c.desc} 羁绊 L${p.comp.bonds[c.id] || 1}</small>`
        + `<button type="button" class="ghost small bCompBtn" data-bc="${c.id}">${has ? (isAct ? '出战中 · 喂养' : '设为出战') : '契约解锁'}</button></div>`;
    }).join('') + `</div>`;
  } else if (bastionArmoryTab === 'mats') {
    html += `<div class="bd-grid">` + BASTION_MATS.map(m => `<div class="bd-card"><b>${m.name} (T${m.tier})</b><small>持有：${p.mats[m.id] || 0}</small>`
      + (m.tier < 4 && m.cat !== 'boss' ? `<button type="button" class="ghost small bTransBtn" data-bm="${m.id}">4→1 炼化</button>` : '')
      + `</div>`).join('') + `</div>`;
  } else {
    html += `<div class="bd-grid">` + BASTION_BUILDINGS.map(b => `<div class="bd-card"><b>${b.name} L${p.buildings[b.id] || 1}</b><small>${b.desc}</small>`
      + `<button type="button" class="ghost small bBuildBtn" data-bb="${b.id}">捐献材料</button></div>`).join('') + `</div>`;
    html += `<div class="bd-row">`
      + `<button type="button" class="ghost small" id="bGuildDonBtn">宗门捐献 (+25 宗门库/贡献)</button>`
      + BASTION_REALMS.map(r => `<button type="button" class="ghost small bRealmBtn" data-br="${r.tier}">传送 ${r.name}</button>`).join('')
      + `<button type="button" class="go small" id="bGoSiegeBtn">进入守城战</button></div>`;
  }
  html += `</div>`;
  ui.drawer.innerHTML = html;
  const cl = document.getElementById('bCloseDrawer'); if (cl) cl.onclick = () => bastionToggleArmory(false);
  for (const t of ui.drawer.querySelectorAll('[data-bt]')) t.onclick = () => { bastionArmoryTab = t.dataset.bt; bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bForgeBtn')) b.onclick = () => { bastionForgeItem('weapon', b.dataset.bg, 1); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bEquipBtn')) b.onclick = () => { bastionEquipItem(b.dataset.bi); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bEnhBtn')) b.onclick = () => { bastionEnhanceItem(b.dataset.bi); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bCompBtn')) b.onclick = () => {
    const id = b.dataset.bc;
    if (p.comp.unlocked.includes(id) && p.comp.active !== id) { p.comp.active = id; bastionSave(); bastionInitCompanions(); }
    else bastionUnlockOrBondCompanion(id);
    bastionRenderArmory();
  };
  for (const b of ui.drawer.querySelectorAll('.bTransBtn')) b.onclick = () => { bastionTransmuteMat(b.dataset.bm); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bBuildBtn')) b.onclick = () => { bastionDonateBuilding(b.dataset.bb, 3); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bRealmBtn')) b.onclick = () => { bastionSwitchSpace('expedition', +b.dataset.br); bastionToggleArmory(false); };
  const gd = document.getElementById('bGuildDonBtn'); if (gd) gd.onclick = () => { bastionDonateGuild(3); bastionRenderArmory(); };
  const sg = document.getElementById('bGoSiegeBtn'); if (sg) sg.onclick = () => { bastionSwitchSpace('siege', 1); bastionToggleArmory(false); };
}

function startBastion(p1, p2, lv, opts = {}) {
  initAudio();
  paused = false;
  const pvp = !!opts.pvp;
  M.mode = 'bastion';
  M.level = lv || pickLevel || 'normal';
  M.round = 1; M.wins = [0, 0]; M.carry = null; M.stage = null; M.duo = null; M.map = null; M.quick = false;
  M.watchAi = false; M.bastionPvp = pvp;
  M.teamMutator = 'normal';
  const allyCh = (p1 + 1) % CHARS.length;
  const bossCh = (p2 + 2) % CHARS.length;
  setChars(p1, p2, allyCh, bossCh);
  A.ctrl = human[0];
  C.ctrl = pvp ? human[1] : new AICtrl(M.level);
  B.ctrl = new AICtrl(M.level);
  D.ctrl = new AICtrl(M.level);
  human[0].clear(); human[1].clear();
  showScreen(null);
  REC.on = false;
  startRound();
  if (opts.space) bastionSwitchSpace(opts.space, opts.tier || 1);
  bastionSyncHUD();
}
