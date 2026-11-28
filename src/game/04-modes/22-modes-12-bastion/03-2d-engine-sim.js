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
  const ang = pl.moveDir != null ? pl.moveDir : (pl.aim || 0);   // 按着方向键就往走的方向闪，没按才朝准心
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
    if ((mx || my) && B2D.clock - (B2D.mouse.movedAt || -99) > 1.2) pl.aim = Math.atan2(my, mx);   // 只用键盘时朝走的方向出招
    pl.moveDir = (mx || my) ? Math.atan2(my, mx) : null;
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

  // 实体碰撞：怪物之间互相挤开，不再叠成一团；人和怪也不能穿过去
  const ens = B2D.enemies;
  for (let i = 0; i < ens.length; i++) {
    const a = ens[i]; if (a.hp <= 0) continue;
    for (let j = i + 1; j < ens.length; j++) {
      const b = ens[j]; if (b.hp <= 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
      if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const nx = d > 0.01 ? dx / d : 1, ny = d > 0.01 ? dy / d : 0, push = (min - d) * 0.5;
      const wa = a.isBoss ? 0.25 : 1, wb = b.isBoss ? 0.25 : 1, wsum = wa + wb;
      a.x -= nx * push * 2 * wa / wsum; a.y -= ny * push * 2 * wa / wsum;
      b.x += nx * push * 2 * wb / wsum; b.y += ny * push * 2 * wb / wsum;
    }
    if (!pl.downed && pl.dashT <= 0) {
      const dx = pl.x - a.x, dy = pl.y - a.y, min = a.r + pl.r, d = Math.hypot(dx, dy);
      if (d < min) {
        const nx = d > 0.01 ? dx / d : 1, ny = d > 0.01 ? dy / d : 0, over = min - d;
        const share = a.isBoss ? 0.8 : 0.5;   // 魔首更重，主要是人被推开
        pl.x = clamp(pl.x + nx * over * share, 32, B2D_W - 32); pl.y = clamp(pl.y + ny * over * share, 32, B2D_H - 32);
        a.x -= nx * over * (1 - share); a.y -= ny * over * (1 - share);
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

