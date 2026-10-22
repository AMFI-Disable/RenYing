/* ---------------- 全局状态 / 相机 / 玩家 ---------------- */
const G = { state: 'title', t: 0, hitstop: 0, enemyTS: 1, slowT: 0, enemies: [], projs: [], hazards: [], wave: 0, kills: 0, inter: 0, queue: [], spawnT: 0, tokens: 0, boss: null, endless: false, dmgDone: 0, maxCombo: 0, playT: 0 };
const Cam = { yaw: PI, pitch: .34, dist: 7.4, distT: 7.4, shake: 0, pos: new V3(0, 4, 14), look: new V3(), fov: 52, tOrbit: 0 };
const ATK = [
  { name: '横斩', dur: .40, w: .26, a: .52, cancel: .6, mult: 1.0, range: 3.1, arc: 2.9, lunge: 1.7, anim: 'sweepRL', roll: .14, dir: 1, knock: 2.2, stop: .04, shake: .1, poise: 1 },
  { name: '反撩', dur: .40, w: .24, a: .52, cancel: .6, mult: 1.08, range: 3.1, arc: 2.9, lunge: 1.5, anim: 'sweepLR', roll: -.42, dir: -1, knock: 2.2, stop: .04, shake: .1, poise: 1 },
  { name: '突刺', dur: .44, w: .3, a: .56, cancel: .66, mult: 1.35, range: 4.0, arc: 1.0, lunge: 2.8, anim: 'thrust', knock: 4, stop: .06, shake: .16, poise: 1.4 },
  { name: '跃斩', dur: .7, w: .4, a: .6, cancel: .82, mult: 2.3, range: 3.4, arc: TAU, lunge: 2.4, anim: 'jumpChop', knock: 6.5, stop: .11, shake: .42, poise: 3, slam: true },
];
const HEAVY = { name: '旋风斩', dur: .72, w: .28, a: .64, cancel: .82, mult: 1.9, range: 3.7, arc: TAU, lunge: .6, anim: 'spin', knock: 5.5, stop: .08, shake: .3, poise: 2.5, sta: 16, spin: true };
const SKILLS = [
  { name: '剑气纵横', mp: 20, cd: 4, lv: 1 }, { name: '回风落雁', mp: 30, cd: 9, lv: 2 },
];
const Pl = { pos: new V3(0, 0, 9), vel: new V3(), yaw: PI, kx: 0, kz: 0 };
const _b = new V3(), _t = new V3(), _v1 = new V3(), _v2 = new V3();

function resetPlayer() {
  Object.assign(Pl, { lv: 1, xp: 0, hp: 120, mp: 60, sta: 100, rage: 0, gold: 0, pots: 3, swordLv: 0, bodyLv: 0, qiLv: 0, perks: {}, state: 'free', st: 0, combo: 0, comboT: 0, buf: 0, bufH: 0, iframe: 0, staDelay: 0, cds: [0, 0, 0, 0], potCd: 0, lock: null, hits: 0, hitT: 0, shield: 0, shieldT: 0, buffT: 0, combatT: 0, hurtV: 0, speedN: 0, atkDef: null, hitSet: new Set(), kx: 0, kz: 0, yaw: PI, deadT: 0, tick: 0, pending: 0 });
  Pl.pos.set(0, 0, 9); Pl.vel.set(0, 0, 0); recalc(); Pl.hp = Pl.maxHp; Pl.mp = Pl.maxMp; setSwordTier();
}
const pk = k => Pl.perks[k] || 0;
function recalc() {
  Pl.atk = (20 + 2.2 * (Pl.lv - 1)) * (1 + .13 * Pl.swordLv) * (1 + .15 * pk('atk'));
  Pl.maxHp = Math.round(120 + 6 * (Pl.lv - 1) + 30 * pk('hp') + 28 * Pl.bodyLv); Pl.maxMp = 60 + 20 * pk('mp') + 22 * Pl.qiLv; Pl.maxSta = 100;
  Pl.crit = .08 + .08 * pk('crit'); Pl.critD = 1.7 + .35 * pk('critd'); Pl.aspd = 1 + .1 * pk('aspd'); Pl.mspd = 1 + .08 * pk('mspd'); Pl.cdr = Math.pow(.87, pk('cdr')); Pl.mpRegen = (2.4 + .5 * Pl.qiLv) * (1 + .5 * pk('mp'));
  Pl.xpNeed = Math.round(34 + 30 * (Pl.lv - 1) + 9 * Math.pow(Pl.lv - 1, 1.6));
}
const swordTier = () => SWORD_TIERS[Math.min(4, Math.floor(Pl.swordLv / 2))];
function setSwordTier() { const tr = swordTier(), m = Pl.rig.bladeMat; m.color.set(tr.blade); m.userData.em0.set(tr.glow).multiplyScalar(tr.ei); m.emissive.copy(m.userData.em0); Pl.trail.setColor(tr.trail); }
function initPlayer(scene) {
  Pl.rig = makeHumanoid({ colors: { robe: 0xdcd8ce, trim: 0x2f6f6a, sash: 0x2f6f6a, skin: 0xe2b79a, hair: 0x15130f, pants: 0xd6d0c2, boots: 0x2a2622 }, head: 'knot', sleeves: 'long', scabbard: true, jade: true, skirt: .8, weapon: 'sword' });
  Pl.rig.setRim(.42, .3, .2); scene.add(Pl.rig.root); Pl.trail = new Trail(0xc8dcea, .2, .95); resetPlayer();
}

function pickTarget(yaw, maxD, cone) {
  let best = null, bs = 1e9;
  for (const e of G.enemies) { if (e.state === 'dead') continue; const dx = e.pos.x - Pl.pos.x, dz = e.pos.z - Pl.pos.z, d = Math.hypot(dx, dz) - e.radius; if (d > maxD) continue; const ad = Math.abs(angDiff(yaw, Math.atan2(dx, dz))); if (ad > cone) continue; const s = d + ad * 2.2 - (e === Pl.lock ? 3 : 0); if (s < bs) { bs = s; best = e; } }
  return best;
}
function nearestEnemy(x, z, maxD = 1e9, skip) { let best = null, bd = maxD; for (const e of G.enemies) { if (e.state === 'dead' || (skip && skip.has(e))) continue; const d = Math.hypot(e.pos.x - x, e.pos.z - z); if (d < bd) { bd = d; best = e; } } return best; }

function startAttack(def) {
  Pl.state = 'attack'; Pl.st = 0; Pl.atkDef = def; Pl.hitSet.clear(); Pl.atkFx = false; Pl.slamDone = false; Pl.combatT = 3; Pl.buf = 0; Pl.bufH = 0;
  let want = Pl.yaw; if (Pl.moveMag > .3) want = Pl.moveYaw;
  const tg = pickTarget(want, 6.5, 1.5) || (Pl.lock && Pl.lock.state !== 'dead' ? Pl.lock : null);
  Pl.lungeD = def.lunge;
  if (tg) { const dx = tg.pos.x - Pl.pos.x, dz = tg.pos.z - Pl.pos.z, d = Math.hypot(dx, dz); if (d < 9) { want = Math.atan2(dx, dz); Pl.lungeD = clamp(d - tg.radius - (def.slam ? 1.9 : 1.5), 0, def.lunge + 1.6); } }
  Pl.yawT = want; Snd.swing(def.slam || def.spin ? 1 : 0);
}
function tryDodge() {
  const cost = 22 * (1 - .2 * pk('mspd')); if (Pl.sta < cost) { UI.toast('体力不济'); return false; }
  Pl.sta -= cost; Pl.staDelay = .7; Pl.state = 'dodge'; Pl.st = 0; Pl.iframe = .36; Pl.perfect = false;
  Pl.dodgeYaw = Pl.moveMag > .3 ? Pl.moveYaw : Pl.yaw + PI; Pl.yawT = Pl.moveMag > .3 ? Pl.moveYaw : Pl.yaw; Snd.dodge(); FX.dust(Pl.pos, 5, .5); return true;
}
function trySkill(i) {
  const s = SKILLS[i]; if (Pl.lv < s.lv) { UI.toast(`未至${cnNum(s.lv)}境，难悟「${s.name}」`); return; }
  if (Pl.cds[i] > 0) return;
  if (i === 3) { if (Pl.rage < 100) { UI.toast('剑意未满'); return; } Pl.rage = 0; }
  else if (Pl.mp < s.mp) { UI.toast('内力不继'); return; }
  Pl.mp -= s.mp; Pl.cds[i] = s.cd * Pl.cdr; Pl.cdMax = Pl.cdMax || [1, 1, 1, 1]; Pl.cdMax[i] = Pl.cds[i]; Pl.combatT = 3; Pl.st = 0; Pl.tick = 0; Pl.fired = false; Pl.hitSet.clear(); Snd.skill();
  const tg = pickTarget(Pl.yaw, 22, 1.2); if (tg && i !== 1) Pl.yawT = Pl.yaw = Math.atan2(tg.pos.x - Pl.pos.x, tg.pos.z - Pl.pos.z);
  if (i === 0) Pl.state = 'castQ'; else if (i === 1) Pl.state = 'whirl'; else if (i === 2) Pl.state = 'castR'; else { Pl.state = 'ult'; Pl.iframe = 3.2; G.enemyTS = .12; G.slowT = 2.7; UI.banner('万剑归宗', '', 'gold'); Snd.gong(); }
  FX.ring(Pl.pos, .4, 3.2, swordTier().trail, .4); FX.wisp({ x: Pl.pos.x, y: 1, z: Pl.pos.z }, swordTier().trail, 14, 2.4);
}
function usePotion() {
  if (Pl.potCd > 0 || Pl.state === 'dead') return; if (Pl.pots <= 0) { UI.toast('回春丹已尽'); return; } if (Pl.hp >= Pl.maxHp) { UI.toast('气血充盈'); return; }
  Pl.pots--; Pl.potCd = 1.5; const h = Math.round(Pl.maxHp * .45); healPlayer(h); Snd.level(); FX.pillar(Pl.pos, 0x8be0a0, 3);
}
function healPlayer(h, quiet) { const b = Pl.hp; Pl.hp = Math.min(Pl.maxHp, Pl.hp + h); const d = Math.round(Pl.hp - b); if (d >= 1 && !quiet) FX.num({ x: Pl.pos.x, y: 2, z: Pl.pos.z }, '+' + d, 'heal'); }

function playerDamage(e, mult, o = {}) {
  let dmg = Pl.atk * mult * rand(.93, 1.07); const crit = Math.random() < Pl.crit + (o.critBonus || 0); if (crit) dmg *= Pl.critD;
  if (Pl.buffT > 0) dmg *= 1.4; if (e.slowT > 0 && pk('frost')) dmg *= 1 + .15 * pk('frost');
  const dx = e.pos.x - Pl.pos.x, dz = e.pos.z - Pl.pos.z, d = Math.hypot(dx, dz) || 1;
  const ok = damageEnemy(e, dmg, { crit, kx: dx / d * (o.knock || 0), kz: dz / d * (o.knock || 0), poise: o.poise || 1, cls: o.cls });
  if (!ok) return false;
  G.dmgDone += dmg; Pl.hits++; Pl.hitT = 2.6; if (Pl.hits > G.maxCombo) G.maxCombo = Pl.hits; UI.combo(Pl.hits);
  if (o.melee) Pl.mp = Math.min(Pl.maxMp, Pl.mp + 1.6);
  if (false) Pl.rage = Math.min(100, Pl.rage + (o.melee ? 2.4 : 1) * (1 + .3 * pk('rage')));
  if (pk('leech')) healPlayer(dmg * .025 * pk('leech'), true);
  if (!o.noProc) {
    if (pk('frost')) e.slowT = 2.6;
    if (pk('burn')) { e.burnT = 3; e.burnDps = Pl.atk * .22 * pk('burn'); }
    if (crit && pk('thunder') && Math.random() < .2 + .12 * pk('thunder')) { FX.bolt(e.pos); Snd.bolt(); Cam.shake = Math.max(Cam.shake, .3); for (const o2 of G.enemies) if (o2.state !== 'dead' && Math.hypot(o2.pos.x - e.pos.x, o2.pos.z - e.pos.z) < 3.8) playerDamage(o2, 1.5, { noProc: true, cls: 'bolt', knock: 2 }); }
  }
  const hp = { x: e.pos.x - dx / d * e.radius * .6, y: e.hitY, z: e.pos.z - dz / d * e.radius * .6 };
  FX.sparks(hp, crit ? 14 : 8, crit ? 0xffd060 : swordTier().trail, crit ? 10 : 7); FX.glow(hp, crit ? 0xffe0a0 : 0xffffff, crit ? 2.4 : 1.5, .14); if (o.melee) FX.inkBurst(hp, crit ? 7 : 4, .7);
  if (o.stop) G.hitstop = Math.max(G.hitstop, o.stop * (crit ? 1.4 : 1)); if (o.shake) Cam.shake = Math.max(Cam.shake, o.shake * (crit ? 1.4 : 1));
  if (crit) GFX.flashAt(e.pos, 0xffd9a0, 3);
  return true;
}
function hurtPlayer(dmg, sx, sz, o = {}) {
  if (Pl.state === 'dead' || G.state !== 'playing') return false;
  if (Pl.iframe > 0) {
    if (Pl.state === 'dodge' && Pl.st < .3 && !Pl.perfect) {
      Pl.perfect = true; G.enemyTS = .22; G.slowT = 1.1; Pl.mp = Math.min(Pl.maxMp, Pl.mp + 14); if (Pl.lv >= 6) Pl.rage = Math.min(100, Pl.rage + 10); Pl.sta = Math.min(Pl.maxSta, Pl.sta + 22); if (pk('snow')) Pl.buffT = 3 + pk('snow');
      FX.num({ x: Pl.pos.x, y: 2.2, z: Pl.pos.z }, '踏雪', 'word', 1.1); Snd.perfect(); FX.ring(Pl.pos, .5, 4, 0x9ff0e0, .5); GFX.final.uniforms.uFlash.value = .12;
    }
    return false;
  }
  if (Pl.shield > 0) { Pl.shield--; Pl.shieldT = 12; Pl.iframe = .5; FX.num({ x: Pl.pos.x, y: 2.1, z: Pl.pos.z }, '真气护体', 'word', .9); FX.ring(Pl.pos, .6, 2.6, 0x62cdb9, .35); Snd.clang(); return false; }
  const armor = Pl.state === 'whirl'; if (armor) dmg *= .5;
  dmg = Math.round(dmg); Pl.hp -= dmg; Pl.iframe = .5; Pl.hurtV = 1; Pl.hits = 0; UI.combo(0); Cam.shake = Math.max(Cam.shake, .35 + dmg * .008); Snd.hurt();
  FX.num({ x: Pl.pos.x, y: 2.1, z: Pl.pos.z }, '-' + dmg, 'hurt'); FX.inkBurst({ x: Pl.pos.x, y: 1.1, z: Pl.pos.z }, 6, .7);
  const dx = Pl.pos.x - sx, dz = Pl.pos.z - sz, d = Math.hypot(dx, dz) || 1, kb = o.knock === undefined ? 5 : o.knock; Pl.kx += dx / d * kb; Pl.kz += dz / d * kb;
  if (Pl.hp <= 0) { Pl.hp = 0; Pl.state = 'dead'; Pl.st = 0; G.enemyTS = .25; G.slowT = 99; Game.onDeath(); return true; }
  if (!armor && Pl.state !== 'ult') { Pl.state = 'hurt'; Pl.st = 0; }
  return true;
}

function updatePlayer(dt) {
  const rig = Pl.rig; Pl.st += dt; Pl.iframe -= dt; Pl.combatT -= dt; Pl.potCd -= dt; Pl.buffT -= dt; Pl.hurtV = Math.max(0, Pl.hurtV - dt * 2.2);
  for (let i = 0; i < 4; i++) Pl.cds[i] = Math.max(0, Pl.cds[i] - dt);
  if (Pl.hitT > 0) { Pl.hitT -= dt; if (Pl.hitT <= 0) { Pl.hits = 0; UI.combo(0); } }
  if (Pl.state !== 'dead') {
    Pl.mp = Math.min(Pl.maxMp, Pl.mp + Pl.mpRegen * dt); Pl.staDelay -= dt; if (Pl.staDelay <= 0) Pl.sta = Math.min(Pl.maxSta, Pl.sta + 30 * dt);
    if (pk('shield')) { if (Pl.shield < 1) { Pl.shieldT -= dt; if (Pl.shieldT <= 0) { Pl.shield = 1; Pl.shieldT = Math.max(6, 13 - pk('shield')); } } }
  }
  // 输入
  let ix = (Input.down('KeyD') ? 1 : 0) - (Input.down('KeyA') ? 1 : 0) + Input.ax, iy = (Input.down('KeyW') ? 1 : 0) - (Input.down('KeyS') ? 1 : 0) + Input.ay;
  let mag = Math.hypot(ix, iy); if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
  const fy = Cam.yaw, mx = Math.sin(fy) * iy - Math.cos(fy) * ix, mz = Math.cos(fy) * iy + Math.sin(fy) * ix; Pl.moveMag = mag; if (mag > .1) Pl.moveYaw = Math.atan2(mx, mz);
  if (Input.hit('Mouse0') || Input.hit('KeyJ')) Pl.buf = .32; if (Input.hit('Mouse2') || Input.hit('KeyK')) Pl.bufH = .32; Pl.buf -= dt; Pl.bufH -= dt;
  const wantDodge = Input.hit('Space') || Input.hit('KeyL');
  const canAct = Pl.state === 'free' || (Pl.state === 'attack' && Pl.st / (Pl.atkDef.dur / Pl.aspd) > Pl.atkDef.cancel);
  const alive = Pl.state !== 'dead' && Pl.state !== 'ult';
  if (alive) {
    if (Input.hit('KeyC')) usePotion();
    if (Input.hit('Tab')) { if (Pl.lock) Pl.lock = null; else { Pl.lock = pickTarget(Cam.yaw, 30, 1.0) || nearestEnemy(Pl.pos.x, Pl.pos.z, 30); if (!Pl.lock) UI.toast('四下无敌可锁'); } }
    if (Pl.lock && Pl.lock.state === 'dead') Pl.lock = nearestEnemy(Pl.pos.x, Pl.pos.z, 22);
    const interruptible = Pl.state === 'free' || Pl.state === 'attack' || Pl.state === 'castQ' || Pl.state === 'castR';
    if (wantDodge && interruptible && Pl.state !== 'dodge') tryDodge();
    else if (canAct || (Pl.state === 'attack' && Pl.st > .12)) {
      if (Input.hit('KeyQ') || Input.hit('Digit1') || Input.hit('Sk0')) trySkill(0); else if (Input.hit('KeyE') || Input.hit('Digit2') || Input.hit('Sk1')) trySkill(1);
    }
    if (canAct && (Pl.state === 'free' || Pl.state === 'attack')) {
      if (Pl.bufH > 0) { if (Pl.sta >= HEAVY.sta) { Pl.sta -= HEAVY.sta; Pl.staDelay = .6; Pl.combo = 0; startAttack(HEAVY); } else { Pl.bufH = 0; UI.toast('体力不济'); } }
      else if (Pl.buf > 0) { const i = Pl.state === 'attack' || Pl.comboT > 0 ? Pl.combo : 0; startAttack(ATK[i]); Pl.combo = (i + 1) % ATK.length; }
    }
  }
  Pl.comboT -= dt;
  // 状态
  let speed = 0, action = null, rate = 14, sprint = false, trailOn = false; const tier = swordTier(); if (Pl.state !== 'attack') Pl.attackActive = Pl.state === 'whirl';
  if (Pl.state === 'free') {
    sprint = Input.down('ShiftLeft') || Input.down('ShiftRight'); if (sprint && mag > .2 && Pl.sta > 1) { Pl.sta -= 11 * dt; Pl.staDelay = .35; } else sprint = false;
    const sp = (sprint ? 9.6 : 6.3) * Pl.mspd * mag; Pl.vel.x = damp(Pl.vel.x, mx * sp, 12, dt); Pl.vel.z = damp(Pl.vel.z, mz * sp, 12, dt);
    if (mag > .1) Pl.yaw = dampAng(Pl.yaw, Pl.moveYaw, 13, dt); else if (Pl.lock) Pl.yaw = dampAng(Pl.yaw, Math.atan2(Pl.lock.pos.x - Pl.pos.x, Pl.lock.pos.z - Pl.pos.z), 6, dt);
    speed = Math.hypot(Pl.vel.x, Pl.vel.z) / 6.3;
  } else if (Pl.state === 'attack') {
    const d = Pl.atkDef, dur = d.dur / Pl.aspd, u = Pl.st / dur; action = { name: d.anim, u: Math.min(1, u), w: d.w, a: d.a }; rate = 34; Pl.yaw = dampAng(Pl.yaw, Pl.yawT, 22, dt);
    const l0 = d.slam ? .06 : d.w * .5, l1 = d.slam ? (d.w + d.a) * .5 : d.a * .9, lv = u > l0 && u < l1 ? Pl.lungeD / ((l1 - l0) * dur) : 0;
    Pl.vel.x = Math.sin(Pl.yaw) * lv; Pl.vel.z = Math.cos(Pl.yaw) * lv; trailOn = u > d.w - .08 && u < d.a + .1; Pl.attackActive = u >= d.w && u <= d.a;
    if (!Pl.atkFx && u >= d.w && !d.slam) { Pl.atkFx = true; if (d.anim === 'thrust') { FX.slash({ x: Pl.pos.x + Math.sin(Pl.yaw) * 1.4, y: 1.3, z: Pl.pos.z + Math.cos(Pl.yaw) * 1.4, yaw: Pl.yaw, roll: PI / 2, r: 2.9, arc: .5, inner: .1, color: tier.trail, dur: .2, inten: 1.3 }); } else FX.slash({ x: Pl.pos.x, y: d.spin ? 1.15 : 1.25, z: Pl.pos.z, yaw: Pl.yaw + (d.spin ? PI : 0), roll: d.roll || 0, dir: d.dir || 1, r: d.range * .98, arc: d.spin ? TAU * .98 : d.arc, color: tier.trail, dur: d.spin ? .3 : .2, follow: Pl.pos }); }
    if (d.slam) {
      const land = (d.w + d.a) * .5;
      if (!Pl.slamDone && u >= land) {
        Pl.slamDone = true; const cx = Pl.pos.x + Math.sin(Pl.yaw) * 1.5, cz = Pl.pos.z + Math.cos(Pl.yaw) * 1.5; let any = false;
        for (const e of G.enemies) { if (e.state === 'dead') continue; if (Math.hypot(e.pos.x - cx, e.pos.z - cz) < d.range + e.radius) any = playerDamage(e, d.mult, { melee: true, knock: d.knock, poise: d.poise, stop: d.stop, shake: d.shake }) || any; }
        FX.ring({ x: cx, z: cz }, .6, d.range + .6, tier.trail, .38); FX.dust({ x: cx, z: cz }, 16, 1.2); FX.slash({ x: Pl.pos.x, y: 1.3, z: Pl.pos.z, yaw: Pl.yaw, roll: PI / 2, dir: -1, r: 3.1, arc: 2.6, color: tier.trail, dur: .2 });
        Cam.shake = Math.max(Cam.shake, .28); Snd.boom(); if (!any) Snd.hit(1); FX.decal({ x: cx, z: cz }, 2.6);
        if (pk('wave')) for (let i = 0; i < pk('wave'); i++) spawnWave(Pl.yaw + (i - (pk('wave') - 1) / 2) * .3, 1.6);
      }
    } else if (u >= d.w && u <= d.a) {
      let any = false;
      for (const e of G.enemies) {
        if (e.state === 'dead' || Pl.hitSet.has(e)) continue; const dx = e.pos.x - Pl.pos.x, dz = e.pos.z - Pl.pos.z, dd = Math.hypot(dx, dz); if (dd > d.range + e.radius) continue;
        if (d.arc < TAU && dd > e.radius + .6 && Math.abs(angDiff(Pl.yaw, Math.atan2(dx, dz))) > d.arc / 2) continue;
        Pl.hitSet.add(e); any = playerDamage(e, d.mult, { melee: true, knock: d.knock, poise: d.poise, stop: d.stop, shake: d.shake }) || any;
      }
      if (any) Snd.hit(d.spin ? 1 : 0);
    }
    if (u >= 1) { Pl.state = 'free'; Pl.comboT = .45; Pl.attackActive = false; if (d === ATK[3] || d === HEAVY) Pl.combo = 0; }
  } else if (Pl.state === 'dodge') {
    const dur = .44, u = Pl.st / dur, sp = 15.5 * (1 - u * .75); Pl.vel.x = Math.sin(Pl.dodgeYaw) * sp; Pl.vel.z = Math.cos(Pl.dodgeYaw) * sp; action = { name: 'dodge', u }; rate = 30; Pl.yaw = dampAng(Pl.yaw, Pl.yawT, 16, dt);
    if (Math.random() < .7) FX.wisp({ x: Pl.pos.x, y: rand(.4, 1.5), z: Pl.pos.z }, 0xdfeeee, 1, .4);
    if (u >= 1) { Pl.state = 'free'; if (Pl.buf > 0) { startAttack(ATK[2]); Pl.combo = 3; } }
  } else if (Pl.state === 'castQ') {
    const dur = .36, u = Pl.st / dur; action = { name: 'sweepRL', u: Math.min(1, u), w: .25, a: .6 }; rate = 36; Pl.vel.x *= .8; Pl.vel.z *= .8; trailOn = true;
    if (!Pl.fired && u >= .3) { Pl.fired = true; const n = 1 + 2 * pk('split'); for (let i = 0; i < n; i++) spawnWave(Pl.yaw + (i - (n - 1) / 2) * .24, 2.3); FX.slash({ x: Pl.pos.x, y: 1.25, z: Pl.pos.z, yaw: Pl.yaw, roll: .1, r: 3.4, arc: 2.9, color: tier.trail, dur: .22, inten: 1.4 }); Snd.swing(1); Cam.shake = Math.max(Cam.shake, .14); }
    if (u >= 1) Pl.state = 'free';
  } else if (Pl.state === 'whirl') {
    const dur = 1.3; action = { name: 'whirl', u: 0 }; rate = 30; trailOn = true; const sp = 5 * Pl.mspd * mag; Pl.vel.x = damp(Pl.vel.x, mx * sp, 10, dt); Pl.vel.z = damp(Pl.vel.z, mz * sp, 10, dt); Pl.tick -= dt;
    if (Pl.tick <= 0) {
      Pl.tick = .15; let any = false; FX.slash({ x: Pl.pos.x, y: rand(.9, 1.5), z: Pl.pos.z, yaw: rand(TAU), roll: rand(-.25, .25), r: 4.3, arc: 4.2, color: tier.trail, dur: .24, follow: Pl.pos, inten: .9 }); Snd.swing(0);
      for (const e of G.enemies) { if (e.state === 'dead') continue; const dx = e.pos.x - Pl.pos.x, dz = e.pos.z - Pl.pos.z, dd = Math.hypot(dx, dz); if (dd < 4.5 + e.radius) { any = playerDamage(e, .55, { melee: true, knock: e.boss ? 0 : -1.6, poise: .7, shake: .06 }) || any; } }
      if (any) Snd.hit(0);
    }
    if (Pl.st >= dur) { Pl.state = 'free'; FX.ring(Pl.pos, 1, 6, tier.trail, .45); Cam.shake = Math.max(Cam.shake, .3); Snd.boom(); for (const e of G.enemies) if (e.state !== 'dead' && Math.hypot(e.pos.x - Pl.pos.x, e.pos.z - Pl.pos.z) < 5.4 + e.radius) playerDamage(e, 1.6, { knock: 8, poise: 3, stop: .08 }); }
  } else if (Pl.state === 'castR') {
    const dur = .5, u = Pl.st / dur; action = { name: 'summon', u: Math.min(1, u) }; rate = 26; Pl.vel.x *= .8; Pl.vel.z *= .8;
    if (!Pl.fired && u >= .25) { Pl.fired = true; const n = 5 + 3 * pk('fly'); for (let i = 0; i < n; i++) spawnProj({ kind: 'fly', x: Pl.pos.x, y: 1.6, z: Pl.pos.z, ang: i / n * TAU, delay: .45 + i * .08, life: 4, dmg: 1.5 }); }
    if (u >= 1) Pl.state = 'free';
  } else if (Pl.state === 'ult') {
    const dur = 2.9, u = Pl.st / dur; action = { name: 'ult', u: Math.min(1, u) }; rate = 20; Pl.vel.x = Pl.vel.z = 0; Pl.tick -= dt; Cam.distT = 11.5;
    if (u > .14 && u < .8 && Pl.tick <= 0) {
      Pl.tick = .042; const e = Math.random() < .75 ? pick(G.enemies.filter(e => e.state !== 'dead' && Math.hypot(e.pos.x - Pl.pos.x, e.pos.z - Pl.pos.z) < 16)) : null; const a = rand(TAU), r = Math.sqrt(Math.random()) * 12;
      const tx = e ? e.pos.x + rand(-.8, .8) : Pl.pos.x + Math.cos(a) * r, tz = e ? e.pos.z + rand(-.8, .8) : Pl.pos.z + Math.sin(a) * r; spawnProj({ kind: 'rain', x: tx + rand(-2, 2), y: rand(15, 20), z: tz + rand(-2, 2), tx, tz, life: 2, dmg: 1.25 * (1 + .25 * pk('rage')) });
    }
    if (Math.random() < .5) FX.wisp({ x: Pl.pos.x, y: 1.2 + (rig.P.rootY || 0), z: Pl.pos.z }, tier.trail, 2, 2.5);
    if (!Pl.fired && u >= .9) { Pl.fired = true; FX.ring(Pl.pos, 1, 15, tier.trail, .6); FX.ring(Pl.pos, .5, 9, 0xffffff, .4); FX.dust(Pl.pos, 30, 2.5); Cam.shake = .8; Snd.boom(); GFX.final.uniforms.uFlash.value = .35; GFX.flashAt(Pl.pos, 0xffffff, 8); for (const e of G.enemies) if (e.state !== 'dead' && Math.hypot(e.pos.x - Pl.pos.x, e.pos.z - Pl.pos.z) < 14) playerDamage(e, 5 * (1 + .25 * pk('rage')), { knock: 9, poise: 8, noRage: true }); }
    if (u >= 1) { Pl.state = 'free'; Pl.iframe = .5; Cam.distT = 7.4; }
  } else if (Pl.state === 'hurt') { Pl.vel.x *= .85; Pl.vel.z *= .85; rate = 26; if (Pl.st > .24) Pl.state = 'free'; }
  else if (Pl.state === 'dead') { Pl.vel.x = Pl.vel.z = 0; Pl.deadT += dt; }
  if (Pl.state !== 'ult') Cam.distT = sprint ? 8.2 : 7.4;
  // 位移
  Pl.pos.x += (Pl.vel.x + Pl.kx) * dt; Pl.pos.z += (Pl.vel.z + Pl.kz) * dt; const kd = Math.exp(-9 * dt); Pl.kx *= kd; Pl.kz *= kd; collide(Pl.pos, .42);
  for (const e of G.enemies) { if (e.state === 'dead' || Pl.state === 'dodge' || e.ghost) continue; const dx = Pl.pos.x - e.pos.x, dz = Pl.pos.z - e.pos.z, d = Math.hypot(dx, dz), rr = e.radius + .4; if (d < rr && d > .001) { const k = (rr - d) / d * (e.boss ? 1 : .5); Pl.pos.x += dx * k; Pl.pos.z += dz * k; } }
  if (sprint && Math.random() < .3) FX.dust(Pl.pos, 1, .3);
  // 骨架
  rig.root.position.copy(Pl.pos); rig.root.rotation.y = Pl.yaw;
  const back = Pl.combatT <= 0 && Pl.state === 'free';
  animHuman(rig, dt, G.t, { speed: Pl.state === 'free' ? speed : 0, action, rate, hurt: Pl.state === 'hurt' ? 1 - Pl.st / .24 : 0, fall: Pl.state === 'dead' ? smooth(Pl.deadT / .7) : 0, pose: P => { if (back) setHand(P, -.36, .98, -.1, -.1, .94, -.33); else setHand(P, -.36, .93, .14, -.28, -.52, .8); } });
  const fl = Pl.hurtV; rig.setGlow(fl * .9, fl * .12, fl * .08);
  if (Pl.buffT > 0 || Pl.shield > 0) { if (Math.random() < .25) FX.wisp({ x: Pl.pos.x, y: 1, z: Pl.pos.z }, Pl.buffT > 0 ? 0xffd060 : 0x62cdb9, 1, .8); }
  if (trailOn) { rig.bladePts(_b, _t); Pl.trail.push(_b, _t); } Pl.trail.update(dt);
  Pl.speedN = speed;
}

function updateCamera(dt, rdt) {
  const cam = GFX.camera;
  if (window.__cam) { const c = window.__cam; cam.position.set(c.p[0], c.p[1], c.p[2]); cam.lookAt(c.t[0], c.t[1], c.t[2]); cam.fov = c.fov || 52; cam.updateProjectionMatrix(); return; }
  if (G.state === 'title') {
    Cam.tOrbit += rdt * .05; const a = Math.sin(Cam.tOrbit) * .55 - .15; Cam.pos.set(Pl.pos.x + Math.sin(a) * 4.3, 1.75 + Math.sin(Cam.tOrbit * 2) * .25, Pl.pos.z + Math.cos(a) * 4.3); Cam.look.set(Pl.pos.x - Math.sin(a + 1.15) * 1.25, 1.32, Pl.pos.z - Math.cos(a + 1.15) * 1.25);
    cam.position.copy(Cam.pos); cam.lookAt(Cam.look); cam.fov = 44; cam.updateProjectionMatrix(); return;
  }
  const sens = Input.touch ? .005 : .0026; Cam.yaw -= Input.mdx * sens; Cam.pitch = clamp(Cam.pitch + Input.mdy * sens * .8, -.12, 1.15);
  Cam.yaw += ((Input.down('ArrowLeft') ? 1 : 0) - (Input.down('ArrowRight') ? 1 : 0)) * 2.3 * rdt; Cam.pitch = clamp(Cam.pitch + ((Input.down('ArrowDown') ? 1 : 0) - (Input.down('ArrowUp') ? 1 : 0)) * 1.2 * rdt, -.12, 1.15);
  if (Pl.lock && Pl.lock.state !== 'dead') { const ty = Math.atan2(Pl.lock.pos.x - Pl.pos.x, Pl.lock.pos.z - Pl.pos.z); Cam.yaw = dampAng(Cam.yaw, ty, 4.5, rdt); }
  else if (!Input.locked && !Input.drag && !Input.touch && Pl.moveMag > .3 && Pl.state === 'free') { const d = angDiff(Cam.yaw, Pl.moveYaw); if (Math.abs(d) < 2.4) Cam.yaw += d * Math.min(1, rdt * .9); }
  Cam.dist = damp(Cam.dist, Cam.distT, 4, rdt); Cam.shake = Math.max(0, Cam.shake - rdt * 1.8);
  const cp = Math.cos(Cam.pitch), sp = Math.sin(Cam.pitch), ry = Pl.rig.P.rootY || 0;
  _v1.set(Pl.pos.x, 1.55 + ry * .6, Pl.pos.z); Cam.look.lerp(_v1, 1 - Math.exp(-14 * rdt));
  _v2.set(Cam.look.x - Math.sin(Cam.yaw) * cp * Cam.dist, Cam.look.y + sp * Cam.dist + .35, Cam.look.z - Math.cos(Cam.yaw) * cp * Cam.dist);
  const cr = Math.hypot(_v2.x, _v2.z); if (cr > 52) { _v2.x *= 52 / cr; _v2.z *= 52 / cr; } _v2.y = Math.max(.5, _v2.y);
  Cam.pos.copy(_v2); const s = Cam.shake * Cam.shake * 1.3;
  cam.position.set(Cam.pos.x + rand(-s, s), Cam.pos.y + rand(-s, s), Cam.pos.z + rand(-s, s)); cam.lookAt(Cam.look.x, Cam.look.y + .15, Cam.look.z);
  const tf = 52 + (Pl.state === 'dodge' ? 5 : 0) + (Pl.speedN > 1.2 ? 4 : 0) + (Pl.state === 'ult' ? 6 : 0); Cam.fov = damp(Cam.fov, tf, 6, rdt); cam.fov = Cam.fov; cam.updateProjectionMatrix();
}

