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
      B2D.siegeLeft = 6 + (B0.realmTier || 1) * 2;   // 第一波已经出来 4 个，剩下的分批来；打完才算守住
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
    for (const e of [B, D]) if (e.hp <= 0) {   // 主城广场的陪练魔卒倒下后重新站起来（以前回满血却一直隐身，广场上就没人可打了）
      e.hp = e.lagHp = e.maxHp; e.x = e === B ? 1860 : 2040; e.y = 0; e.vx = e.vy = 0;
      e.hidden = false; e.state = 'idle'; e.t = 0; e.invul = 1.0;
    }
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

