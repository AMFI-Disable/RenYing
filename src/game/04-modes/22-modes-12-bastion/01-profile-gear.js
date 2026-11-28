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

