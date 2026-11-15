// ======================= 天枢城 · 守境：多人守城 + 肉鸽远征 + 同袍传音 + 灵侍 + 流派衣冠 =======================
// 本文件：天枢守境完整核心玩法（玩家互传与穿云箭、6 位基础灵侍、24 种材谱、6 部位 × 8 流派穿戴套装、
//         城防设施众筹与炮台、驿站寄存撤离、守城战、以及局内整备面板）。
const BASTION_KEY_PFX = 'ry_bastion_v1_';
const bastionOn = () => M.mode === 'bastion' || !!(typeof netRoom === 'function' && netRoom() && netRoom().rule === 'bastion');
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
    merit: 240,
    ley: 600,
    threat: 22,
    mats,
    equipped: { weapon: 'it_boot_w', armor: null, boots: null, gauntlets: null, pendant: null, cloak: 'it_boot_c' },
    bag: [starterWep, starterCloak],
    presets: [null, null, null],
    nextItemId: 1,
    comp: {
      active: 'c_blade',
      sub: 'c_fox',
      stance: 'aggressive',
      unlocked: ['c_blade', 'c_turtle', 'c_fox'],
      bonds: { c_blade: 1, c_turtle: 1, c_fox: 1, c_kite: 1, c_cub: 1, c_spark: 1 },
      core: null,
    },
    buildings,
    guild: { name: '天枢义盟', lv: 1, treasury: 320, contrib: 120, research: { drop: 1, revive: 0, dmg: 0 } },
    stats: { runs: 0, clears: 0, sieges: 0, revives: 0, tps: 0 },
  };
}

function bastionProfile() {
  const key = BASTION_KEY_PFX + bastionAcctId();
  if (BASTION_PROF && BASTION_PROF._key === key) return BASTION_PROF;
  let data = null;
  try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
  const def = bastionDefaultProfile();
  if (!data || typeof data !== 'object') data = def;
  else {
    data = { ...def, ...data };
    data.mats = { ...def.mats, ...(data.mats || {}) };
    data.equipped = { ...def.equipped, ...(data.equipped || {}) };
    data.buildings = { ...def.buildings, ...(data.buildings || {}) };
    data.comp = { ...def.comp, ...(data.comp || {}), bonds: { ...def.comp.bonds, ...((data.comp && data.comp.bonds) || {}) } };
    data.guild = { ...def.guild, ...(data.guild || {}) };
    if (!Array.isArray(data.bag)) data.bag = def.bag.slice();
    if (!Array.isArray(data.presets)) data.presets = [null, null, null];
  }
  data._key = key;
  BASTION_PROF = data;
  return data;
}

function bastionSave() {
  const p = bastionProfile();
  const clean = { ...p };
  delete clean._key;
  try { localStorage.setItem(p._key, JSON.stringify(clean)); } catch (e) {}
}

function bastionEquippedItems() {
  const p = bastionProfile();
  const out = {};
  for (const s of BASTION_SLOTS) {
    const iid = p.equipped[s.id];
    out[s.id] = iid ? (p.bag.find(it => it.id === iid) || null) : null;
  }
  return out;
}

function bastionGenreCounts() {
  const eq = bastionEquippedItems();
  const counts = {};
  for (const g of BASTION_GENRES) counts[g.id] = 0;
  for (const s of BASTION_SLOTS) {
    const it = eq[s.id];
    if (!it || !(it.genre in counts)) continue;
    counts[it.genre] += it.mythic ? 2 : 1;
  }
  return counts;
}

function bastionStats() {
  const p = bastionProfile();
  const eq = bastionEquippedItems();
  const gc = bastionGenreCounts();
  let atkMul = 1.0, hpMul = 1.0, dr = 0, hpFlat = 0, speedMul = 1.0;
  let tpCdRed = Math.min(10, Math.max(0, (p.buildings.array || 1) - 1) * 1.5);
  let reviveMul = 1.0 + (p.guild.research && p.guild.research.revive ? 0.1 : 0);
  let dropMul = 1.0 + (p.guild.research && p.guild.research.drop ? 0.08 : 0);
  let staggerMul = 1.0;
  for (const s of BASTION_SLOTS) {
    const it = eq[s.id];
    if (!it) continue;
    atkMul += it.atkPct || 0;
    hpFlat += it.hpFlat || 0;
  }
  if (p.guild.research && p.guild.research.dmg) atkMul += 0.05;
  if (gc.berserker >= 2) atkMul += 0.15;
  if (gc.juggernaut >= 2) { hpMul += 0.25; dr += 0.15; }
  if (gc.assassin >= 2) { speedMul += 0.18; tpCdRed += 11; }
  if (gc.siege >= 2) staggerMul += 0.30;
  if (gc.medic >= 2) reviveMul += 0.50;
  if (gc.ranger >= 2) dropMul += 0.25;
  const activeComp = BASTION_COMP_BY[p.comp.active];
  if (activeComp) {
    if (activeComp.id === 'c_turtle') hpMul += 0.15;
    if (activeComp.id === 'c_fox') reviveMul += 0.25;
    if (activeComp.id === 'c_cub') dropMul += 0.10;
    if (activeComp.id === 'c_spark') staggerMul += 0.15;
  }
  const tpCd = gc.assassin >= 6 ? 15 : Math.max(15, Math.round(45 - tpCdRed));
  return { gc, atkMul, hpMul, hpFlat, dr: Math.min(0.65, dr), speedMul, tpCd, reviveMul, dropMul, staggerMul, eq };
}

function bastionForgeItem(slotId, genreId, tier = 1, useCatalyst = false) {
  const p = bastionProfile();
  const s = BASTION_SLOT_BY[slotId], g = BASTION_GENRE_BY[genreId];
  if (!s || !g) return null;
  const t = clamp(tier | 0, 1, 4);
  const forgeReq = [1, 1, 2, 4, 7][t] || 1;
  if ((p.buildings.forge || 1) < forgeReq) {
    if (!RESIM) toast(`需兵器坊达 L${forgeReq} 方可锻造 T${t} 装备`);
    return null;
  }
  const catA = BASTION_MATS.find(m => m.cat === g.cats[0] && m.tier === t);
  const catB = BASTION_MATS.find(m => m.cat === g.cats[1] && m.tier === t);
  const needA = 2 + t, needB = 2 + t, meritCost = 40 * t;
  if (!catA || !catB || (p.mats[catA.id] || 0) < needA || (p.mats[catB.id] || 0) < needB || p.merit < meritCost) {
    if (!RESIM) toast(`材料或功勋不足（需 ${needA}×${catA ? catA.name : ''} + ${needB}×${catB ? catB.name : ''} + ${meritCost} 功勋）`);
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
  return item;
}

function bastionEquipItem(itemId) {
  const p = bastionProfile();
  const it = p.bag.find(x => x.id === itemId);
  if (!it) return false;
  p.equipped[it.slot] = it.id;
  bastionSave();
  if (typeof A === 'object' && A && bastionOn()) bastionApplyPlayerStats(A);
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
  return true;
}

function bastionUnlockOrBondCompanion(compId) {
  const p = bastionProfile();
  if (!BASTION_COMP_BY[compId]) return false;
  if (!p.comp.unlocked.includes(compId)) {
    const req = { c_kite: ['m_bamboo1', 4, 'sanctuary', 2], c_cub: ['m_bone1', 4, 'sanctuary', 3], c_spark: ['m_sand2', 3, 'sanctuary', 4] }[compId];
    if (req) {
      if ((p.buildings[req[2]] || 1) < req[3]) {
        if (!RESIM) toast(`需灵兽园 L${req[3]} 方可契约此灵侍`);
        return false;
      }
      if ((p.mats[req[0]] || 0) < req[1]) {
        if (!RESIM) toast(`需要 ${req[1]}×${BASTION_MAT_BY[req[0]].name}`);
        return false;
      }
      p.mats[req[0]] -= req[1];
    }
    p.comp.unlocked.push(compId);
    p.comp.active = compId;
    bastionSave();
    return true;
  }
  const lv = p.comp.bonds[compId] || 1;
  if (lv >= 10) return false;
  const herb = p.mats.m_herb1 >= 2 ? 'm_herb1' : (p.mats.m_berry2 >= 1 ? 'm_berry2' : null);
  if (!herb) {
    if (!RESIM) toast('需要月见草 ×2 或赤阳朱果 ×1 喂养灵侍');
    return false;
  }
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
  if (!matPool) {
    if (!RESIM) toast(`至少需 ${units} 份基础材料方可捐献`);
    return false;
  }
  p.mats[matPool] -= units;
  p.merit += Math.round(units * 12);
  p.ley = Math.min(10000, p.ley + units * 8);
  const key = '_prog_' + bId;
  p[key] = (p[key] || 0) + units;
  const need = lv * 10;
  if (p[key] >= need) {
    p[key] -= need;
    p.buildings[bId] = lv + 1;
    if (!RESIM) { say(`${BASTION_BUILDINGS.find(b => b.id === bId).name} 升至 L${lv + 1}！`, 1.5, 'big'); SFX.gong(); }
  }
  bastionSave();
  return true;
}

function bastionDonateGuild(units = 3) {
  const p = bastionProfile();
  const matId = ['m_iron1', 'm_bamboo1', 'm_paper1', 'm_bone1', 'm_herb1'].find(id => (p.mats[id] || 0) >= units);
  if (!matId) { if (!RESIM) toast(`至少需 ${units} 份材料方可捐献宗门`); return false; }
  p.mats[matId] -= units;
  p.guild.treasury += units * 25;
  p.guild.contrib += units * 25;
  if (p.guild.treasury >= p.guild.lv * 400 && p.guild.lv < 10) p.guild.lv++;
  bastionSave();
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
  return true;
}

function bastionApplyPlayerStats(f) {
  if (!f || !f.ch || !f.ch.stat) return;
  const st = bastionStats();
  const baseHp = f.ch.stat.hp || 1000;
  const ratio = f.maxHp > 0 ? clamp(f.hp / f.maxHp, 0, 1) : 1;
  f.maxHp = Math.round(baseHp * st.hpMul + st.hpFlat);
  f.hp = f.hp > 0 ? Math.max(1, Math.round(f.maxHp * ratio)) : 0;
  f.lagHp = Math.max(f.lagHp, f.hp);
  f.bastionSpeedMul = st.speedMul;
}

function bastionRoundInit() {
  const p = bastionProfile();
  M.timer = 180;
  M.bastion = M.bastion || {
    space: 'expedition',
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
  };
  const B0 = M.bastion;
  B0.tpCd = 0; B0.sosCd = 0; B0.sosActiveT = 0; B0.drops = []; B0.reviveT = [0, 0]; B0.bleedT = [0, 0]; B0.downed = [false, false];
  bastionApplyPlayerStats(A);
  bastionApplyPlayerStats(C);
  bastionSpawnSpaceWave();
  bastionInitCompanions();
}

function bastionInitCompanions() {
  const B0 = M.bastion; if (!B0) return;
  const p = bastionProfile(), st = bastionStats();
  const soloOrDual = !M.bastionPvp || (st.gc.summoner >= 4);
  const list = [{ id: p.comp.active || 'c_blade', x: A.x - 80, y: 0, cd: 0, tickT: 2, slot: 0 }];
  if (soloOrDual && p.comp.sub && BASTION_COMP_BY[p.comp.sub]) {
    list.push({ id: p.comp.sub, x: A.x - 140, y: 0, cd: 0, tickT: 3, slot: 1 });
  }
  B0.comps = list;
}

function bastionSpawnSpaceWave() {
  const B0 = M.bastion; if (!B0) return;
  const realm = BASTION_REALMS[(B0.realmTier || 1) - 1] || BASTION_REALMS[0];
  const mul = realm.enemyMul * (1 + (B0.room - 1) * 0.14);
  if (B0.space === 'citadel') {
    STAGE_W = 2400;
    A.x = 640; A.face = 1;
    C.x = 840; C.face = 1;
    B.x = 1860; B.face = -1; D.x = 2040; D.face = -1;
    B.hidden = false; D.hidden = false; B.state = 'idle'; D.state = 'idle';
    B.maxHp = B.hp = B.lagHp = Math.round(900 * mul);
    D.maxHp = D.hp = D.lagHp = Math.round(900 * mul);
    return;
  }
  STAGE_W = 2200;
  A.x = 460; A.face = 1;
  C.x = 620; C.face = 1;
  if (B0.space === 'siege') {
    B.x = 1660; B.face = -1; D.x = 1840; D.face = -1;
    B.hidden = false; D.hidden = false; B.state = 'idle'; D.state = 'idle';
    B.maxHp = B.hp = B.lagHp = Math.round(1450 * mul);
    D.maxHp = D.hp = D.lagHp = Math.round(1150 * mul);
    B0.gateHp = B0.gateMaxHp = 2000 + (bastionProfile().buildings.walls || 1) * 400;
    if (!RESIM) say('天枢守城战 · 守住城门与核心！', 1.5, 'big');
    return;
  }
  const isBossRoom = B0.room >= B0.maxRooms;
  const isWaystation = B0.room === 3;
  B.x = 1620; B.face = -1; D.x = 1820; D.face = -1;
  if (isWaystation) {
    B.hidden = false; B.state = 'idle';
    B.maxHp = B.hp = B.lagHp = Math.round(700 * mul);
    D.hp = 0; D.hidden = true;
    if (!RESIM) say('⛩ 驿站补给区 · 可整备、寄存战利品或撤离！', 1.6, 'big');
  } else {
    B.hidden = false; D.hidden = false; B.state = 'idle'; D.state = 'idle';
    B.maxHp = B.hp = B.lagHp = Math.round((isBossRoom ? 1850 : 950) * mul);
    D.maxHp = D.hp = D.lagHp = Math.round((isBossRoom ? 1200 : 800) * mul);
    if (!RESIM) say(`${realm.name} · 第 ${B0.room}/${B0.maxRooms} 室`, 1.3, isBossRoom ? 'big' : '');
  }
}

function bastionDropLoot(x, isBoss) {
  const B0 = M.bastion; if (!B0) return;
  const realm = BASTION_REALMS[(B0.realmTier || 1) - 1] || BASTION_REALMS[0];
  const st = bastionStats();
  const silver = Math.round((isBoss ? 120 : 45) * st.dropMul * (1 + (B0.realmTier - 1) * 0.35));
  const matPool = isBoss ? [realm.catDrop, ...realm.drops] : realm.drops;
  const pick = matPool[Math.floor(grnd() * matPool.length)];
  const qty = isBoss ? 2 : 1;
  B0.drops.push({ x: clamp(x, WALL + 80, STAGE_W - WALL - 80), y: -18, kind: 'silver', val: silver, life: 30 });
  if (pick) B0.drops.push({ x: clamp(x + 36, WALL + 80, STAGE_W - WALL - 80), y: -18, kind: 'mat', id: pick, val: qty, life: 30 });
}

function bastionCollectDrop(d) {
  const B0 = M.bastion; if (!B0 || !d) return;
  if (d.kind === 'silver') {
    B0.unbankedSilver += d.val;
    if (!RESIM) addP({ type: 'text', text: `+${d.val} 碎银`, x: d.x, y: -70, life: 0.8, max: 0.8, rgb: '245,215,110' });
  } else if (d.kind === 'mat' && BASTION_MAT_BY[d.id]) {
    B0.unbankedMats[d.id] = (B0.unbankedMats[d.id] || 0) + d.val;
    const m = BASTION_MAT_BY[d.id];
    if (!RESIM) addP({ type: 'text', text: `+${d.val} ${m.name}`, x: d.x, y: -90, life: 0.9, max: 0.9, rgb: m.rgb });
  }
}

function bastionTpToAlly() {
  const B0 = M.bastion; if (!B0) return false;
  const ally = !C.hidden && C.hp > 0 ? C : (!C.hidden ? C : null);
  if (!ally) return false;
  const freeSos = B0.sosActiveT > 0;
  if (B0.tpCd > 0 && !freeSos) {
    if (!RESIM) toast(`同袍传音冷却中：${Math.ceil(B0.tpCd)}s`);
    return false;
  }
  const st = bastionStats();
  const destX = clamp(ally.x - ally.face * 70, WALL + 60, STAGE_W - WALL - 60);
  A.x = destX; A.y = ally.y; A.vy = 0; A.vx = 0;
  A.invul = Math.max(A.invul || 0, 1.5);
  ally.invul = Math.max(ally.invul || 0, 1.5);
  B0.tpCd = freeSos ? 0 : (B0.space === 'citadel' ? 15 : st.tpCd);
  if (freeSos) B0.sosActiveT = 0;
  const p = bastionProfile();
  p.stats.tps++;
  bastionSave();
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
  bastionSyncHUD();
  return true;
}

function bastionFireSos() {
  const B0 = M.bastion; if (!B0) return false;
  const st = bastionStats();
  if (B0.sosCd > 0) { if (!RESIM) toast(`穿云箭冷却中：${Math.ceil(B0.sosCd)}s`); return false; }
  B0.sosCd = st.gc.medic >= 6 ? 25 : 60;
  B0.sosActiveT = 15;
  B0.tpCd = 0;
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
  bastionSyncHUD();
  return true;
}

function bastionCastCompanionSkill() {
  const B0 = M.bastion; if (!B0 || !B0.comps || !B0.comps.length) return false;
  const st = bastionStats();
  let fired = false;
  for (const cp of B0.comps) {
    if (cp.cd > 0) continue;
    const def = BASTION_COMP_BY[cp.id]; if (!def) continue;
    const cdScale = st.gc.summoner >= 2 ? 0.75 : 1.0;
    cp.cd = def.cd * cdScale;
    fired = true;
    const tx = foeOf(A) ? foeOf(A).x : A.x + A.face * 180;
    if (cp.id === 'c_blade' || cp.id === 'c_spark') {
      for (const f of [B, D]) {
        if (!f.hidden && f.hp > 0 && Math.abs(f.x - cp.x) < 340) {
          applyHit(A, f, { dmg: cp.id === 'c_spark' ? 95 : 85, kb: [(tx >= f.x ? 1 : -1) * 180, -260], stun: 0.4, hs: 0.04, dir: A.face }, [f.x, f.y - 50]);
          if (cp.id === 'c_spark' && typeof M.raidStagger === 'number') M.raidStagger = Math.min(100, (M.raidStagger || 0) + 18);
        }
      }
    } else if (cp.id === 'c_turtle') {
      A.invul = Math.max(A.invul || 0, 1.5);
      A.guard = Math.min(A.maxGuard || 100, (A.guard || 0) + 40);
    } else if (cp.id === 'c_fox') {
      for (const f of [A, C]) if (!f.hidden && f.hp > 0) f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * 0.15));
    } else if (cp.id === 'c_kite') {
      for (const f of [B, D]) if (!f.hidden && f.hp > 0) applyHit(A, f, { dmg: 70, kb: [120 * A.face, -180], stun: 0.25, hs: 0.03, dir: A.face }, [f.x, f.y - 60]);
    } else if (cp.id === 'c_cub') {
      B0.unbankedSilver += 35;
    }
    if (!RESIM) {
      ring(cp.x, cp.y - 50, 120, def.rgb, 0.45);
      addP({ type: 'text', text: def.skill, x: cp.x, y: cp.y - 95, life: 0.85, max: 0.85, rgb: def.rgb });
    }
    if (st.gc.summoner < 6) break;
  }
  return fired;
}

function bastionStepCompanions(dt) {
  const B0 = M.bastion; if (!B0 || !B0.comps) return;
  const p = bastionProfile(), st = bastionStats(), stance = p.comp.stance || 'aggressive';
  for (const cp of B0.comps) {
    cp.cd = Math.max(0, cp.cd - dt);
    cp.tickT = (cp.tickT || 0) - dt;
    const def = BASTION_COMP_BY[cp.id];
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
    bastionDropLoot(def.x, B0.room >= B0.maxRooms || B0.space === 'siege');
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
  const B0 = M.bastion; if (!B0) return false;
  const st = bastionStats();
  const fee = st.gc.ranger >= 4 ? 0 : 0.15;
  const bankedS = Math.floor(B0.unbankedSilver * (1 - fee));
  B0.bankedSilver += bankedS;
  B0.unbankedSilver = 0;
  for (const [id, v] of Object.entries(B0.unbankedMats)) B0.bankedMats[id] = (B0.bankedMats[id] || 0) + v;
  B0.unbankedMats = {};
  if (A.hp > 0) A.hp = A.lagHp = A.maxHp;
  if (!C.hidden && C.hp > 0) C.hp = C.lagHp = C.maxHp;
  if (!RESIM) toast(`已安全寄存 ${bankedS} 碎银及全部材料！（手续费 ${Math.round(fee * 100)}%）`);
  bastionSyncHUD();
  return true;
}

function bastionExtract() {
  const B0 = M.bastion; if (!B0) return false;
  const p = bastionProfile(), st = bastionStats();
  const totSilver = B0.unbankedSilver + B0.bankedSilver;
  const meritGain = Math.max(20, Math.round(totSilver / 10) + B0.room * 25);
  p.merit += meritGain;
  let matTotal = 0;
  for (const src of [B0.unbankedMats, B0.bankedMats]) {
    for (const [id, v] of Object.entries(src)) { p.mats[id] = (p.mats[id] || 0) + v; matTotal += v; }
  }
  if (st.gc.ranger >= 6) { p.mats.m_iron1 = (p.mats.m_iron1 || 0) + 2; matTotal += 2; }
  B0.unbankedSilver = 0; B0.bankedSilver = 0; B0.unbankedMats = {}; B0.bankedMats = {};
  p.threat = Math.min(100, p.threat + Math.max(5, Math.round(matTotal * 1.5)));
  p.stats.runs++;
  bastionSave();
  B0.space = 'citadel';
  B0.room = 1;
  bastionSpawnSpaceWave();
  if (!RESIM) { say(`凯旋撤离 · +${meritGain} 功勋 / +${matTotal} 材料`, 1.6, 'big'); SFX.gong(); }
  bastionSyncHUD();
  return true;
}

function bastionSwitchSpace(space, tier = 1) {
  const B0 = M.bastion; if (!B0) return false;
  const p = bastionProfile();
  const realm = BASTION_REALMS[(tier || 1) - 1] || BASTION_REALMS[0];
  if (space === 'expedition' && (p.buildings.array || 1) < realm.reqArray) {
    if (!RESIM) toast(`需传送阵达 L${realm.reqArray} 方可进入 ${realm.name}`);
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
  if (!bastionOn() || !M.bastion || M.phase !== 'fight') return;
  const B0 = M.bastion, st = bastionStats();
  B0.tpCd = Math.max(0, B0.tpCd - STEP);
  B0.sosCd = Math.max(0, B0.sosCd - STEP);
  B0.sosActiveT = Math.max(0, B0.sosActiveT - STEP);
  B0.cheatDeathCd = Math.max(0, B0.cheatDeathCd - STEP);
  bastionStepCompanions(STEP);
  // 掉落物自动拾取
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
  // 队友互救与失血判定
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
      if (!RESIM) toast('重伤撤回天枢城，未寄存碎银折损！');
      break;
    }
  }
  // 守城弩炮自动掩护
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

function drawBastionField() {
  if (!bastionOn() || !M.bastion) return;
  const B0 = M.bastion, st = bastionStats();
  ctx.save();
  // 背旗与流派光环绘制
  const cloakIt = st.eq.cloak;
  if (cloakIt && BASTION_GENRE_BY[cloakIt.genre] && A.hp > 0) {
    const rgb = BASTION_GENRE_BY[cloakIt.genre].rgb;
    ctx.strokeStyle = `rgba(${rgb},0.65)`;
    ctx.lineWidth = 3;
    const fx = A.x - A.face * 18;
    ctx.beginPath(); ctx.moveTo(fx, A.y - 25); ctx.lineTo(fx, A.y - 125); ctx.lineTo(fx - A.face * 26, A.y - 102); ctx.closePath();
    ctx.fillStyle = `rgba(${rgb},0.35)`; ctx.fill(); ctx.stroke();
  }
  // 灵侍绘制
  for (const cp of B0.comps) {
    const def = BASTION_COMP_BY[cp.id]; if (!def) continue;
    ctx.fillStyle = `rgba(${def.rgb},0.3)`;
    ctx.strokeStyle = `rgb(${def.rgb})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cp.x, cp.y - 38, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = `700 12px ${BODY_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgb(${def.rgb})`;
    ctx.fillText(cvT(def.name), cp.x, cp.y - 62);
  }
  // 掉落物绘制
  for (const d of B0.drops) {
    const rgb = d.kind === 'silver' ? '245,215,110' : ((BASTION_MAT_BY[d.id] && BASTION_MAT_BY[d.id].rgb) || '180,220,255');
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, Math.PI * 2); ctx.fill();
  }
  // 守城门 / 驿站标牌
  if (B0.space === 'siege') {
    ctx.strokeStyle = 'rgba(233,196,106,0.85)'; ctx.lineWidth = 4;
    ctx.strokeRect(WALL + 20, -220, 48, 220);
  } else if (B0.space === 'expedition' && B0.room === 3) {
    ctx.fillStyle = 'rgba(130,235,175,0.22)';
    ctx.fillRect(STAGE_W / 2 - 90, -180, 180, 180);
    ctx.font = `700 13px ${BODY_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#8ef0b5';
    ctx.fillText(cvT('⛩ 驿站（可寄存/撤离）'), STAGE_W / 2, -190);
  }
  ctx.restore();
}

function drawBastionScore(cx, top, bh, gap) {
  const B0 = M.bastion; if (!B0) return;
  const p = bastionProfile();
  ctx.save();
  ctx.font = `700 ${Math.max(12, Math.round(bh * 0.9))}px ${BODY_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e9c46a';
  const spaceName = B0.space === 'siege' ? '天枢守城战' : B0.space === 'citadel' ? '天枢城·整备区' : `${(BASTION_REALMS[B0.realmTier - 1] || BASTION_REALMS[0]).name} (${B0.room}/${B0.maxRooms})`;
  ctx.fillText(`${cvT(spaceName)} | 功勋:${p.merit} 碎银:${B0.unbankedSilver} 威胁:${Math.floor(p.threat)}%`, cx, top + bh * 2.1);
  ctx.restore();
}

let bastionArmoryTab = 'forge';
function bastionToggleArmory(force) {
  if (!M.bastion) return;
  M.bastion.armoryOpen = force !== undefined ? !!force : !M.bastion.armoryOpen;
  bastionRenderArmory();
}

function ensureBastionOverlay() {
  if (typeof document === 'undefined' || !document.body) return null;
  let bar = document.getElementById('bastionHudBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bastionHudBar';
    bar.className = 'bastion-hud-bar';
    bar.innerHTML = `<button type="button" class="ghost small" id="bHudTp">[T] 传音同袍</button>`
      + `<button type="button" class="ghost small" id="bHudSos">[V] 穿云箭</button>`
      + `<button type="button" class="ghost small" id="bHudComp">[G] 灵侍绝技</button>`
      + `<button type="button" class="ghost small" id="bHudBank">⛩ 寄存</button>`
      + `<button type="button" class="ghost small" id="bHudExtract">撤离回城</button>`
      + `<button type="button" class="go small" id="bHudArmory">[B] 天枢整备</button>`;
    document.body.appendChild(bar);
    document.getElementById('bHudTp').onclick = () => bastionTpToAlly();
    document.getElementById('bHudSos').onclick = () => bastionFireSos();
    document.getElementById('bHudComp').onclick = () => bastionCastCompanionSkill();
    document.getElementById('bHudBank').onclick = () => bastionWaystationBank();
    document.getElementById('bHudExtract').onclick = () => bastionExtract();
    document.getElementById('bHudArmory').onclick = () => bastionToggleArmory();
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
  const on = bastionOn() && !document.querySelector('.scr.on');
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
    html += `<p class="bd-sub">已穿戴流派：${activeSets} | 传音冷却 ${st.tpCd}s | 攻击×${st.atkMul.toFixed(2)} | 气血×${st.hpMul.toFixed(2)}</p>`;
    html += `<div class="bd-grid">` + BASTION_SLOTS.map(s => {
      const it = st.eq[s.id];
      return `<div class="bd-card"><b>${s.name}</b><small>${it ? it.name : '未穿戴'}</small></div>`;
    }).join('') + `</div>`;
    html += `<div class="bd-row">` + BASTION_GENRES.map(g => `<button type="button" class="ghost small bForgeBtn" data-bg="${g.id}">锻造 ${g.name} 兵器</button>`).join('') + `</div>`;
    html += `<div class="bd-row">` + p.bag.slice(-8).map(it => `<button type="button" class="ghost small bEquipBtn" data-bi="${it.id}">穿戴 ${it.name}</button>`).join('') + `</div>`;
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
  say('天枢城 · 守境', 1.5, 'big', '随时加入 · 传音支援 · 灵侍随行');
  bastionSyncHUD();
}

const bastionStartBtn = document.getElementById('bastionStartBtn');
if (bastionStartBtn) bastionStartBtn.addEventListener('click', () => bpStart('bastion', { level: pickLevel }));
const bastionCoopBtn = document.getElementById('bastionCoopBtn');
if (bastionCoopBtn) bastionCoopBtn.addEventListener('click', () => bpStart('bastion', { level: pickLevel, pvp: true }));
const bastionSiegeBtn = document.getElementById('bastionSiegeBtn');
if (bastionSiegeBtn) bastionSiegeBtn.addEventListener('click', () => bpStart('bastion', { level: pickLevel, space: 'siege' }));
