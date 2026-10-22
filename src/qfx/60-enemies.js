/* ---------------- 敌人 ---------------- */
const skinA = 0xc49a78;
const ET = {
  bandit: {
    name: '山贼', hp: 84, spd: 3.6, r: .45, xp: 8, gold: [2, 5], poise: 1.2, mass: 1, reach: 2.1,
    rig: () => makeHumanoid({ colors: { robe: 0x6b4e38, trim: 0x3d3028, sash: 0x8a2a20, skin: skinA, hair: 0x1a1614, pants: 0x2e2a28, boots: 0x1c1a18 }, head: 'band', vest: true, bracer: true, skirt: .3, fur: true, strap: true, weapon: 'saber', stance: [-.34, 1.2, .18, -.22, .88, .36] }),
    atks: [{ kind: 'melee', anim: 'chop', max: 2.4, wind: .58, act: .16, rec: .6, dmg: 10, shape: { t: 'arc', r: 2.7, arc: 1.7 }, lunge: 1.3, cd: 1.6 },
    { kind: 'melee', anim: 'sweepRL', max: 2.4, wind: .66, act: .18, rec: .65, dmg: 11, shape: { t: 'arc', r: 2.8, arc: 2.8 }, lunge: .9, cd: 2.6 }]
  },
  spear: {
    name: '枪兵', hp: 120, spd: 3.1, r: .45, xp: 12, gold: [3, 7], poise: 2, mass: 1.2, reach: 3.3,
    rig: () => makeHumanoid({ colors: { robe: 0x46586e, trim: 0x2c333c, sash: 0x6b6f76, skin: skinA, hair: 0x1a1614, pants: 0x2a2e33, boots: 0x18191b }, head: 'helmet', sleeves: true, bracer: true, skirt: .46, armor: true, weapon: 'spear', pauldron: 0x70767c, stance: [-.32, 1.02, .1, 0, .16, 1] }),
    atks: [{ kind: 'melee', anim: 'thrust', max: 3.7, wind: .72, act: .16, rec: .7, dmg: 14, shape: { t: 'line', len: 4.3, w: 1.3 }, lunge: 2.2, cd: 2.0, tele: true }]
  },
  archer: {
    name: '弓手', hp: 52, spd: 3.3, r: .42, xp: 10, gold: [3, 6], poise: .8, mass: .9, keep: [10, 17], ranged: true,
    rig: () => makeHumanoid({ colors: { robe: 0x505a3a, trim: 0x2c3220, sash: 0x2c3220, skin: skinA, hair: 0x1a1614, pants: 0x3a3a30, boots: 0x1c1a18 }, head: 'hat', sleeves: true, skirt: .42, weapon: 'bow', quiver: true, stance: [-.28, .9, .08, 0, -1, 0] }),
    atks: [{ kind: 'shoot', anim: 'shoot', min: 5, max: 24, wind: 1.3, act: .1, rec: .9, dmg: 9, cd: 3.8 }]
  },
  wolf: {
    name: '妖狼', hp: 56, spd: 6.4, r: .5, xp: 7, gold: [1, 4], poise: .8, mass: .8, reach: 5.2, hitY: .7,
    rig: () => makeWolf({}),
    atks: [{ kind: 'pounce', min: 2.6, max: 6.5, wind: .46, act: .4, rec: .55, dmg: 9, speed: 17, cd: 2.2 }, { kind: 'melee', anim: 'bite', max: 1.9, wind: .34, act: .14, rec: .5, dmg: 7, shape: { t: 'arc', r: 2.0, arc: 1.8 }, lunge: .8, cd: 1.3 }]
  },
  brute: {
    name: '石甲力士', hp: 400, spd: 2.3, r: .8, xp: 30, gold: [10, 18], poise: 9, mass: 3.5, reach: 2.9,
    rig: () => makeHumanoid({ colors: { robe: 0x3a2e2a, trim: 0x2a2624, sash: 0x5a4a3a, skin: 0x7d7f86, hair: 0x2a2826, pants: 0x2e2a28, boots: 0x1c1a18 }, head: 'mask', bulk: 1.45, scale: 1.65, skirt: .4, bare: true, beads: true, jaw: .9, headSize: 1.22, bracer: true, weapon: 'club', pauldron: 0x55524e, wrap: true, stance: [-.3, 1.3, .05, -.2, .6, -.7] }),
    atks: [{ kind: 'melee', anim: 'slam', max: 3.6, wind: 1.1, act: .18, rec: 1.0, dmg: 24, shape: { t: 'circle', r: 3.5, off: 2.3 }, lunge: .8, cd: 2.4, tele: true, quake: true },
    { kind: 'melee', anim: 'sweepRL', max: 3.4, wind: .85, act: .2, rec: .8, dmg: 18, shape: { t: 'arc', r: 4.0, arc: 3.0 }, lunge: .6, cd: 3.6, tele: true }]
  },
  wraith: {
    name: '幽魂', hp: 96, spd: 2.7, r: .45, xp: 16, gold: [5, 10], poise: 1.5, mass: .8, keep: [8, 14], ranged: true, ghost: true, float: .45,
    rig: () => makeHumanoid({ colors: { robe: 0x4a3878, trim: 0x7a52b0, sash: 0x7a52b0, skin: 0x8a86a0, hair: 0x0a0a0c, pants: 0x1a1426, boots: 0x1a1426, eye: 0xb46cff }, head: 'hood', sleeves: 'long', skirt: 1.15, ghost: true, weapon: 'none' }),
    atks: [{ kind: 'cast', anim: 'cast', min: 4, max: 20, wind: .9, act: .12, rec: .8, dmg: 11, n: 3, cd: 3.4 }, { kind: 'blink', anim: 'cast', max: 4.2, wind: .32, act: .05, rec: .3, dmg: 0, cd: 5 }]
  },
  boss1: {
    name: '黑风寨主 · 屠千山', hp: 2700, spd: 3.5, r: .95, xp: 150, gold: [90, 110], poise: 34, mass: 8, reach: 3.3, boss: true,
    rig: () => makeHumanoid({ colors: { robe: 0x5a1f1a, trim: 0x2a2a2e, sash: 0xc59a3a, skin: 0xb88a66, hair: 0x14100e, pants: 0x221c1a, boots: 0x141210 }, head: 'warlord', bulk: 1.4, scale: 1.85, sleeves: true, bracer: true, skirt: .5, armor: true, jaw: .7, headSize: 1.12, fur: true, weapon: 'guandao', cape: 0x7a1a14, pauldron: 0x4a4d52, wrap: true, stance: [-.42, 1.12, .1, -.1, .96, .2] }),
    atks: [{ kind: 'melee', anim: 'chop', max: 4.4, wind: .62, act: .18, rec: .25, dmg: 20, shape: { t: 'arc', r: 5.0, arc: 1.5 }, lunge: 1.8, cd: 2.5, tele: true, chain: 1 },
    { kind: 'melee', anim: 'sweepRL', max: 0, wind: .46, act: .2, rec: .9, dmg: 22, shape: { t: 'arc', r: 5.2, arc: 3.2 }, lunge: 1.6, cd: 0, tele: true, only: 'chain' },
    { kind: 'leap', anim: 'leap', min: 5.5, max: 18, wind: .6, act: .62, rec: 1.0, dmg: 30, r: 4.6, cd: 6.5 },
    { kind: 'spin', anim: 'spin', min: 0, max: 9, wind: .75, act: 1.7, rec: 1.2, dmg: 16, r: 4.4, cd: 9, speed: 5.4 },
    { kind: 'summon', anim: 'roar', max: 99, wind: .9, act: .1, rec: .6, dmg: 0, cd: 999, only: 'script' }]
  },
  boss2: {
    name: '剑魔 · 独孤夜', hp: 5400, spd: 4.6, r: .65, xp: 400, gold: [200, 240], poise: 30, mass: 5, reach: 2.9, boss: true,
    rig: () => makeHumanoid({ colors: { robe: 0x151217, trim: 0x7a1a1a, sash: 0x7a1a1a, skin: 0xcfc4c0, hair: 0xe8e6e0, pants: 0x121013, boots: 0x0c0a0c, eye: 0xff2a1a }, head: 'demon', scale: 1.32, sleeves: 'long', skirt: .82, weapon: 'dark', cape: 0x1a1418, capeRag: true, stance: [-.42, .9, -.04, -.3, -.7, -.6] }),
    atks: [{ kind: 'melee', anim: 'sweepRL', max: 3.8, wind: .42, act: .16, rec: .16, dmg: 20, shape: { t: 'arc', r: 4.2, arc: 2.9 }, lunge: 2.2, cd: 2.2, tele: true, chain: 1 },
    { kind: 'melee', anim: 'sweepLR', max: 0, wind: .34, act: .16, rec: .16, dmg: 20, shape: { t: 'arc', r: 4.2, arc: 2.9 }, lunge: 2.2, cd: 0, tele: true, only: 'chain', chain: 2 },
    { kind: 'melee', anim: 'thrust', max: 0, wind: .4, act: .16, rec: .8, dmg: 26, shape: { t: 'line', len: 6, w: 1.5 }, lunge: 3.6, cd: 0, tele: true, only: 'chain' },
    { kind: 'dash', anim: 'dash', min: 6, max: 22, wind: .7, act: .3, rec: .7, dmg: 28, speed: 42, cd: 5 },
    { kind: 'waves', anim: 'sweepRL', min: 5, max: 26, wind: .6, act: .12, rec: .7, dmg: 18, n: 5, cd: 6 },
    { kind: 'blink', anim: 'cast', min: 3, max: 30, wind: .34, act: .05, rec: .05, dmg: 0, cd: 7.5, behind: true, chain: 0 },
    { kind: 'rain', anim: 'cast', min: 0, max: 40, wind: .8, act: .2, rec: .9, dmg: 24, cd: 10, phase2: true }]
  },
};
const _eb = new V3(), _et = new V3();
/* 不可弹反的招式：跳劈、旋风、突进、地震、剑雨；出手前刀尖闪红光，其余闪寒光 */
const unblockable = a => !!(a.unblock || a.quake || a.kind === 'leap' || a.kind === 'spin' || a.kind === 'dash' || a.kind === 'rain');
const GLINT = new Set(['melee', 'pounce', 'dash', 'leap', 'spin']);
/* 在玩家镜头背后：这类敌人要多等一会儿才出手 */
const behindCam = e => { const dx = e.pos.x - Pl.pos.x, dz = e.pos.z - Pl.pos.z, d = Math.hypot(dx, dz) || 1; return (dx * Math.sin(Cam.yaw) + dz * Math.cos(Cam.yaw)) / d < -.3; };

function spawnEnemy(type, x, z, o = {}) {
  const cfg = ET[type], rig = cfg.rig(); const elite = !!o.elite && !cfg.boss, wv = Math.max(1, G.stage), hs = (1 + .19 * (wv - 1) + (G.endless ? .08 * (wv - 10) * (wv - 10) : 0)) * (cfg.boss && G.endless ? 1.6 : 1), ds = 1.15 + .12 * (wv - 1);
  const e = { type, cfg, rig, pos: new V3(x, 0, z), yaw: Math.atan2(Pl.pos.x - x, Pl.pos.z - z), maxHp: Math.round(cfg.hp * hs * (elite ? 2.4 : 1)), dmgK: ds * (elite ? 1.3 : 1), state: 'spawn', st: 0, atk: null, cds: cfg.atks.map(() => rand(.4, 1.6)), token: false, stagger: 0, poiseD: 0, slowT: 0, burnT: 0, burnDps: 0, burnTick: 0, flash: 0, elite, boss: !!cfg.boss, ghost: !!cfg.ghost, kx: 0, kz: 0, didHit: false, tele: null, strafe: Math.random() < .5 ? 1 : -1, strafeT: rand(1, 3), speedN: 0, deadT: 0, name: cfg.name, phase: 1, tick: 0, jumpY: 0, summoned: 0, stun: 0, fx: 0 };
  e.hp = e.maxHp; const sc = rig.root.scale.x * (elite ? 1.18 : 1); rig.root.scale.setScalar(sc); e.radius = cfg.r * (elite ? 1.15 : 1); e.hitY = (cfg.hitY || 1.15) * sc + (cfg.float || 0);
  rig.root.position.copy(e.pos); rig.root.rotation.y = e.yaw; GFX.scene.add(rig.root);
  if (rig.bladeLen) e.trail = new Trail(cfg.boss ? 0xff4a2a : 0xff8a5a, .16, cfg.boss ? 1.3 : .8);
  if (elite) e.name = '精锐 · ' + cfg.name;
  FX.smoke(e.pos, cfg.boss ? 22 : 10, cfg.boss ? 1.5 : .9); if (cfg.boss) { G.boss = e; FX.ring(e.pos, 1, 9, 0xff3a22, .7); Cam.shake = .5; Snd.gong(); }
  G.enemies.push(e); return e;
}
function releaseToken(e) { if (e.token) { e.token = false; G.tokens--; } }
function cancelAttack(e) { if (e.tele) { e.tele.cancel(); e.tele = null; } releaseToken(e); e.atk = null; e.jumpY = 0; }

function damageEnemy(e, dmg, o = {}) {
  if (e.state === 'dead') return false; if (e.state === 'spawn' && e.st < .25) return false;
  if (e.stun > 0) dmg *= 1.3; dmg = Math.max(1, Math.round(dmg)); e.hp -= dmg; e.flash = 1;
  FX.num({ x: e.pos.x, y: e.hitY + .7, z: e.pos.z }, '' + dmg, o.crit ? 'crit' : (o.cls || ''), o.crit ? 1 : .8);
  const m = e.cfg.mass; e.kx += (o.kx || 0) / m; e.kz += (o.kz || 0) / m;
  if (e.hp <= 0) { killEnemy(e); return true; }
  if (e.stun <= 0 && e.state !== 'spawn' && !e.execd) {
    e.poiseD += o.poise || 1;
    if (e.poiseD >= e.cfg.poise * (e.elite ? 1.6 : 1)) {
      const super_ = e.atk && (e.atk.kind === 'leap' || e.atk.kind === 'dash') && e.state === 'active';
      // 力士、头领架势一破就露破绽；小卒只是踉跄，挨了重手（破山、瞬斩）才露破绽
      if (!super_) { if (e.boss || e.cfg.poise > 4 || (o.poise || 1) >= 4) breakPoise(e); else { e.poiseD = 0; cancelAttack(e); e.state = 'stagger'; e.st = 0; e.stagger = .42; } }
    }
  }
  return true;
}
function breakPoise(e) {
  e.poiseD = 0; cancelAttack(e); e.state = 'stagger'; e.st = 0; e.stagger = e.stun = e.boss ? 2.6 : e.cfg.poise > 4 ? 1.8 : 1.3;
  FX.num({ x: e.pos.x, y: e.hitY + 1.3, z: e.pos.z }, '破绽', 'word', 1.2); Snd.clang(); FX.ring(e.pos, .5, 4, 0xffd060, .4);
}
/* 被弹反：小卒当场露出破绽，力士与头领吃一大截架势 */
function parriedBy(e) {
  if (e.state === 'dead' || e.execd) return false; const c = e.cfg, dx = e.pos.x - Pl.pos.x, dz = e.pos.z - Pl.pos.z, d = Math.hypot(dx, dz) || 1, cap = c.poise * (e.elite ? 1.6 : 1);
  e.kx += dx / d * 4 / c.mass; e.kz += dz / d * 4 / c.mass;
  if (e.boss || c.poise > 4) { e.poiseD += cap * (e.boss ? .22 : .4); if (e.poiseD >= cap) { breakPoise(e); return true; } if (!e.boss) { cancelAttack(e); e.state = 'stagger'; e.st = 0; e.stagger = .5; } return false; }
  breakPoise(e); if (e.elite) e.stagger = e.stun = 1.05; return true;
}
function killEnemy(e) {
  cancelAttack(e); e.state = 'dead'; e.deadT = 0; e.hp = 0; G.kills++; if (Pl.lock === e) Pl.lock = null;
  Save.kill(); const c = e.cfg, n = e.boss ? 26 : e.elite ? 8 : 3, xp = c.xp * (e.elite ? 2.5 : 1) * (1 + .06 * (G.stage - 1)), gold = randi(c.gold[0], c.gold[1]) * (e.elite ? 2.5 : 1) * (1 + .3 * pk('gold')) * (1 + .05 * (G.stage - 1));
  for (let i = 0; i < n; i++) spawnOrb(e.pos, 0, xp / n); const gn = e.boss ? 16 : Math.min(5, Math.ceil(gold / 4)); for (let i = 0; i < gn; i++) spawnOrb(e.pos, 1, gold / gn);
  if (Math.random() < (e.boss ? 1 : e.elite ? .5 : .07)) for (let i = 0; i < (e.boss ? 4 : 1); i++) spawnOrb(e.pos, 2, 18);
  if (pk('wolf')) { Pl.mp = Math.min(Pl.maxMp, Pl.mp + 4 * pk('wolf')); healPlayer(Pl.maxHp * .02 * pk('wolf'), true); }
  if (false) Pl.rage = Math.min(100, Pl.rage + (e.boss ? 0 : 4) * (1 + .3 * pk('rage')));
  FX.inkBurst({ x: e.pos.x, y: e.hitY, z: e.pos.z }, e.boss ? 60 : 16, e.boss ? 2.4 : 1.1); FX.decal(e.pos, e.boss ? 6 : rand(1.6, 2.6) * (e.radius / .45));
  if (e.boss) { G.hitstop = .35; Cam.shake = 1; FX.ring(e.pos, 1, 16, 0xffe0a0, 1); GFX.final.uniforms.uFlash.value = .4; Snd.gong(); Snd.boom(); G.enemyTS = .2; G.slowT = 1.6; for (const o of G.enemies) if (o !== e && o.state !== 'dead') killEnemy(o); G.queue.length = 0; if (G.boss === e) G.bossDead = true; }
  else { G.hitstop = Math.max(G.hitstop, .05); }
}

function enemyHitsPlayer(e, a) {
  const s = a.shape, fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), dx = Pl.pos.x - e.pos.x, dz = Pl.pos.z - e.pos.z, sc = e.elite ? 1.1 : 1;
  if (s.t === 'arc') { const d = Math.hypot(dx, dz); return d < s.r * sc + .35 && (d < e.radius + .7 || Math.abs(angDiff(e.yaw, Math.atan2(dx, dz))) < s.arc / 2 + .12); }
  if (s.t === 'circle') return Math.hypot(dx - fx * s.off, dz - fz * s.off) < s.r * sc + .3;
  const along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx); return along > -.3 && along < s.len * sc + .3 && lat < s.w / 2 + .35;
}
function makeTele(e, a, dur) {
  const s = a.shape, fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), sc = e.elite ? 1.1 : 1, color = unblockable(a) ? 0xff3a22 : 0xffb24a;
  if (a.kind === 'melee' && s) {
    if (s.t === 'arc') return FX.telegraph({ type: 'sector', x: e.pos.x, z: e.pos.z, yaw: e.yaw, r: s.r * sc, arc: s.arc, dur, color });
    if (s.t === 'circle') return FX.telegraph({ type: 'circle', x: e.pos.x + fx * s.off, z: e.pos.z + fz * s.off, r: s.r * sc, dur, color });
    return FX.telegraph({ type: 'line', x: e.pos.x, z: e.pos.z, yaw: e.yaw, len: s.len * sc, w: s.w, dur, color });
  }
  return null;
}

function chooseAttack(e, d) {
  const c = e.cfg; let best = -1, bw = 0;
  for (let i = 0; i < c.atks.length; i++) {
    const a = c.atks[i]; if (a.only || e.cds[i] > 0) continue; if (a.phase2 && e.phase < 2) continue; if (d < (a.min || 0) || d > a.max + e.radius) continue;
    const w = Math.random() + (a.kind === 'melee' ? .2 : .35); if (w > bw) { bw = w; best = i; }
  }
  return best;
}
function startAttack_E(e, i, chained) {
  const a = e.cfg.atks[i]; e.atk = a; e.atkI = i; e.state = 'windup'; e.st = 0; e.didHit = false; e.tick = 0; e.cds[i] = a.cd * rand(.85, 1.25) / (e.phase > 1 ? 1.25 : 1);
  e.wind = a.wind * (chained ? 1 : rand(.95, 1.1)) / (e.phase > 1 ? 1.15 : 1); e.teleMade = false; e.lockYaw = false; e.glinted = false;
  if (a.kind === 'leap') { e.tele = null; }
  if (a.kind === 'dash') { e.tele = FX.telegraph({ type: 'line', x: e.pos.x, z: e.pos.z, yaw: e.yaw, len: a.speed * a.act, w: 2.2, dur: e.wind, color: 0xff3a22 }); }
  if (a.kind === 'summon') { UI.banner('喽啰何在', '', 'red'); Snd.gong(); }
}
function execAttack(e) {
  const a = e.atk, fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), dmg = a.dmg * e.dmgK;
  if (a.kind === 'shoot') { const dx = Pl.pos.x + Pl.vel.x * .25 - e.pos.x, dz = Pl.pos.z + Pl.vel.z * .25 - e.pos.z, d = Math.hypot(dx, dz) || 1; spawnProj({ kind: 'arrow', x: e.pos.x + fx * .6, y: 1.4, z: e.pos.z + fz * .6, vx: dx / d * 21, vz: dz / d * 21, life: 2.6, dmg, enemy: true, src: e }); Snd.bow(); }
  else if (a.kind === 'cast') { for (let i = 0; i < a.n; i++) { const an = e.yaw + (i - (a.n - 1) / 2) * .5; spawnProj({ kind: 'orb', x: e.pos.x + Math.sin(an) * .8, y: 1.6, z: e.pos.z + Math.cos(an) * .8, vx: Math.sin(an) * 8.5, vz: Math.cos(an) * 8.5, life: 4.2, dmg, enemy: true, turn: 1.5, src: e }); } Snd.cast(); }
  else if (a.kind === 'waves') { for (let i = 0; i < a.n; i++) { const an = e.yaw + (i - (a.n - 1) / 2) * .26; spawnProj({ kind: 'ewave', x: e.pos.x, y: 1.1, z: e.pos.z, vx: Math.sin(an) * 19, vz: Math.cos(an) * 19, yaw: an, life: 1.7, dmg, enemy: true, src: e }); } Snd.swing(1); FX.slash({ x: e.pos.x, y: 1.4, z: e.pos.z, yaw: e.yaw, r: 4, arc: 2.9, color: 0xff3a22, dur: .22 }); }
  else if (a.kind === 'blink') {
    FX.smoke(e.pos, 14, 1.2, .08); let nx, nz;
    if (a.behind) { const py = Pl.yaw; nx = Pl.pos.x - Math.sin(py) * 2.6; nz = Pl.pos.z - Math.cos(py) * 2.6; } else { const an = rand(TAU), r = rand(9, 13); nx = Pl.pos.x + Math.cos(an) * r; nz = Pl.pos.z + Math.sin(an) * r; }
    e.pos.x = nx; e.pos.z = nz; collide(e.pos, e.radius); e.yaw = Math.atan2(Pl.pos.x - e.pos.x, Pl.pos.z - e.pos.z); FX.smoke(e.pos, 14, 1.2, .08); Snd.cast();
  }
  else if (a.kind === 'rain') { const n = 8; for (let i = 0; i < n; i++) { const an = rand(TAU), r = i === 0 ? 0 : rand(2, 9); G.hazards.push({ x: Pl.pos.x + Math.cos(an) * r, z: Pl.pos.z + Math.sin(an) * r, r: 2.7, delay: i * .2, t: 0, dur: .95, dmg, tele: null }); } Snd.cast(); }
  else if (a.kind === 'summon') { for (let i = 0; i < 4; i++) { const an = e.yaw + PI / 2 + i * PI / 2 + .6, p = new V3(e.pos.x + Math.cos(an) * 5, 0, e.pos.z + Math.sin(an) * 5); collide(p, .5); spawnEnemy(i % 2 ? 'spear' : 'bandit', p.x, p.z); } }
  else if (a.kind === 'leap') { const dx = Pl.pos.x - e.pos.x, dz = Pl.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1, dd = Math.min(d, 16); e.lx = e.pos.x; e.lz = e.pos.z; e.tx = e.pos.x + dx / d * dd; e.tz = e.pos.z + dz / d * dd; e.tele = FX.telegraph({ type: 'circle', x: e.tx, z: e.tz, r: a.r, dur: a.act }); Snd.swing(1); }
  else if (a.kind === 'pounce' || a.kind === 'dash') { Snd.swing(a.kind === 'dash' ? 1 : 0); if (a.kind === 'dash') FX.slash({ x: e.pos.x + fx * 3, y: 1.3, z: e.pos.z + fz * 3, yaw: e.yaw, roll: PI / 2, r: 7, arc: .5, inner: .05, color: 0xff3a22, dur: .3, inten: 2 }); }
  else if (a.kind === 'melee') { Snd.swing(e.cfg.mass > 2 ? 1 : 0); if (a.anim === 'sweepRL' || a.anim === 'sweepLR') FX.slash({ x: e.pos.x, y: e.hitY, z: e.pos.z, yaw: e.yaw, dir: a.anim === 'sweepRL' ? 1 : -1, roll: a.anim === 'sweepRL' ? .1 : -.3, r: a.shape.r * .98, arc: a.shape.arc, color: 0xff5a32, dur: .2, inten: 1.2 }); }
}

function updateEnemy(e, dt0, t) {
  const c = e.cfg, rig = e.rig; let dt = dt0 * G.enemyTS; if (e.slowT > 0) { e.slowT -= dt0; dt *= .62; }
  if (e.frozeT > 0) { e.frozeT -= dt0; e.stun = Math.max(e.stun, e.frozeT); dt *= .03; if (Math.random() < .25) FX.add.emit({ x: e.pos.x + rand(-.4, .4), y: rand(.2, e.hitY + .5), z: e.pos.z + rand(-.4, .4), vy: rand(.1, .5), life: .5, s0: .18, s1: 0, r: .8, g: .95, b: 1, grav: 0 }); }
  e.st += dt; e.flash = Math.max(0, e.flash - Math.max(dt0, .004) * 9); for (let i = 0; i < e.cds.length; i++) e.cds[i] -= dt; e.poiseD = Math.max(0, e.poiseD - dt * c.poise * .12); e.stun -= dt;
  const dx = Pl.pos.x - e.pos.x, dz = Pl.pos.z - e.pos.z, d = Math.hypot(dx, dz) || .001, toP = Math.atan2(dx, dz); let action = null, speed = 0, glow = 0, rate = 14, rootY = c.float ? c.float + Math.sin(t * 2 + rig.phase) * .12 : 0, fall = 0, hurt = 0, mvx = 0, mvz = 0, trail = false;
  if (e.burnT > 0 && e.state !== 'dead') { e.burnT -= dt0; e.burnTick -= dt0; if (e.burnTick <= 0) { e.burnTick = .5; e.hp -= e.burnDps * .5; FX.num({ x: e.pos.x, y: e.hitY + .5, z: e.pos.z }, '' + Math.max(1, Math.round(e.burnDps * .5)), 'fire', .6); if (e.hp <= 0) { killEnemy(e); } } if (Math.random() < .4) FX.add.emit({ x: e.pos.x + rand(-.3, .3), y: e.hitY + rand(-.5, .4), z: e.pos.z + rand(-.3, .3), vy: rand(1, 2.4), life: rand(.3, .6), s0: rand(.2, .4), s1: 0, r: 1, g: .5, b: .12, grav: -1 }); }
  if (e.boss && e.state !== 'dead') {
    if (e.type === 'boss1' && e.summoned < 2 && e.hp < e.maxHp * (e.summoned ? .33 : .66) && (e.state === 'chase' || e.state === 'recover')) { e.summoned++; cancelAttack(e); startAttack_E(e, 4); }
    if (e.type === 'boss2' && e.phase < 2 && e.hp < e.maxHp * .5) { e.phase = 2; UI.banner('剑魔入魔', '', 'red'); Snd.gong(); FX.ring(e.pos, 1, 12, 0xff2a1a, .8); Cam.shake = .6; cancelAttack(e); e.state = 'recover'; e.st = 0; e.rec = 1; e.cds[6] = .5; FX.smoke(e.pos, 30, 2, .1); }
  }
  if (e.state === 'spawn') { const k = sat(e.st / .7); rootY += -2.0 * (1 - easeOut(k)) * rig.root.scale.x; if (e.st > .7) { e.state = 'chase'; e.st = 0; } }
  else if (e.state === 'dead') {
    e.deadT += dt0; fall = smooth(e.deadT / .45); if (e.deadT > .9) rig.setOpacity(sat(1 - (e.deadT - .9) / .7)); rootY -= Math.max(0, e.deadT - .9) * .5;
    if (Math.random() < .5 && e.deadT > .5) FX.ink.emit({ x: e.pos.x + rand(-.5, .5), y: rand(.1, .6), z: e.pos.z + rand(-.5, .5), vy: rand(.5, 1.6), life: rand(.5, 1), s0: .3, s1: .9, r: .05, g: .05, b: .06, a: .5, grav: -.5 });
  }
  else if (e.state === 'stagger') { hurt = sat(1 - e.st / Math.max(.3, e.stagger)) * .8 + .2; rate = 24; if (e.st >= e.stagger) { e.state = 'chase'; e.st = 0; } }
  else if (e.state === 'chase') {
    e.yaw = dampAng(e.yaw, toP, 7, dt); let moveA = null, sp = c.spd * (e.phase > 1 ? 1.15 : 1);
    const ai = d < 30 ? chooseAttack(e, d) : -1; let started = false;
    if (ai >= 0 && e.st > .25) {
      const a = c.atks[ai], needTok = (a.kind === 'melee' || a.kind === 'pounce') && !e.boss, ranged = a.kind === 'shoot' || a.kind === 'cast';
      // 围攻也讲节奏：近身出手要等令牌和全局间隔；镜头背后的多等一会儿；同时最多两人开弓施法
      let ok = !needTok || (G.tokens < G.maxTokens && G.atkGap <= 0);
      if (ok && needTok && behindCam(e)) { e.waitT = (e.waitT || 0) + dt; if (e.waitT < 1.3) ok = false; }
      if (ok && ranged && G.enemies.reduce((n, o) => n + (o !== e && o.atk && (o.state === 'windup' || o.state === 'active') && (o.atk.kind === 'shoot' || o.atk.kind === 'cast') ? 1 : 0), 0) >= 2) ok = false;
      if (ok) { if (needTok) { e.token = true; G.tokens++; G.atkGap = rand(.3, .6) * (G.stage >= 7 ? .75 : 1); } e.waitT = 0; startAttack_E(e, ai); started = true; }
    }
    if (!started) {
      if (c.keep) { if (d < c.keep[0]) { moveA = toP + PI; sp *= .85; } else if (d > c.keep[1]) moveA = toP; else { moveA = toP + e.strafe * PI / 2; sp *= .45; } }
      else if (d > (c.reach || 2) * .82 + e.radius) { moveA = toP; if (!e.boss && G.tokens >= G.maxTokens && d < 6.5) { moveA = toP + e.strafe * (PI / 2 - (d > 5 ? .5 : -.25)); sp *= .5; } }
      e.strafeT -= dt; if (e.strafeT <= 0) { e.strafeT = rand(1.5, 4); e.strafe *= -1; }
      if (moveA !== null) { mvx = Math.sin(moveA) * sp; mvz = Math.cos(moveA) * sp; speed = sp / (rig.kind === 'wolf' ? 6 : 4.5); }
    }
  }
  else if (e.state === 'windup') {
    const a = e.atk, u0 = e.st / e.wind; if (u0 < .72 || a.kind === 'shoot') e.yaw = dampAng(e.yaw, toP, a.kind === 'dash' ? 10 : 5.5, dt);
    if (a.tele && !e.teleMade && u0 >= .25) { e.teleMade = true; e.tele = makeTele(e, a, e.wind * .75); }
    if (!e.glinted && e.wind - e.st <= .3 && GLINT.has(a.kind)) {
      e.glinted = true; const ub = unblockable(a); if (rig.bladeLen) rig.bladePts(_eb, _et); else _et.set(e.pos.x + Math.sin(e.yaw) * .7, e.hitY + .1, e.pos.z + Math.cos(e.yaw) * .7);
      FX.glint(_et, ub ? 0xff2a1a : 0xdff2ff, (ub ? 1.9 : 1.35) * (e.boss ? 1.4 : 1)); if (ub) Snd.danger(); else Snd.glint();
    }
    if (e.tele && a.kind === 'dash') { e.tele.mesh.rotation.y = e.yaw; }
    if (e.tele && a.kind === 'melee' && u0 < .72) { e.tele.mesh.rotation.y = e.yaw; if (a.shape.t === 'circle') { e.tele.mesh.position.x = e.pos.x + Math.sin(e.yaw) * a.shape.off; e.tele.mesh.position.z = e.pos.z + Math.cos(e.yaw) * a.shape.off; } else { e.tele.mesh.position.x = e.pos.x; e.tele.mesh.position.z = e.pos.z; } }
    const tot = e.wind + a.act + a.rec; action = { name: a.anim, u: e.st / tot, w: e.wind / tot, a: (e.wind + a.act) / tot }; glow = smooth(u0); rate = 22;
    if (a.kind === 'shoot' && Math.random() < .3) FX.add.emit({ x: e.pos.x + Math.sin(e.yaw) * (1 + rand(d - 1)), y: 1.4, z: e.pos.z + Math.cos(e.yaw) * (1 + rand(d - 1)), life: .15, s0: .08, s1: 0, r: 1, g: .25, b: .15, grav: 0 });
    if ((a.kind === 'cast' || a.kind === 'rain' || a.kind === 'waves') && Math.random() < .6) FX.wisp({ x: e.pos.x, y: e.hitY + .6, z: e.pos.z }, a.kind === 'cast' && !e.boss ? 0xb46cff : 0xff3a22, 1, 1.5);
    if (e.st >= e.wind) { e.state = 'active'; e.st = 0; if (e.tele && a.kind !== 'leap') e.tele = null; execAttack(e); }
  }
  else if (e.state === 'active') {
    const a = e.atk, tot = e.wind + a.act + a.rec; action = { name: a.anim, u: (e.wind + e.st) / tot, w: e.wind / tot, a: (e.wind + a.act) / tot }; rate = 32; trail = true; glow = .6;
    const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), dmg = a.dmg * e.dmgK;
    if (a.kind === 'melee') { const lv = (a.lunge || 0) / a.act; if (d > e.radius + .9) { mvx = fx * lv; mvz = fz * lv; } if (!e.didHit && enemyHitsPlayer(e, a)) { e.didHit = true; if (hurtPlayer(dmg, e.pos.x, e.pos.z, { knock: c.mass > 2 ? 9 : 5, src: e, parry: !unblockable(a) }) === true) { G.hitstop = Math.max(G.hitstop, .06); } }
      // 贴刃闪开：刀落时人刚闪出刃口一步之内，也算踏雪
      else if (!e.didHit && Pl.state === 'dodge' && Pl.iframe > 0 && e.st > a.act * .3 && d < (a.shape.r || a.shape.len || 3) + (a.shape.off || 0) + e.radius + 1.4 + (reso('shen') >= 3 ? .8 : 0) + .4 * pk('youshen')) { e.didHit = true; hurtPlayer(dmg, e.pos.x, e.pos.z, { src: e }); } if (a.quake && !e.fxDone && e.st >= a.act * .5) { e.fxDone = true; const p = { x: e.pos.x + fx * a.shape.off, z: e.pos.z + fz * a.shape.off }; FX.ring(p, .5, a.shape.r + .5, 0xffa060, .4); FX.dust(p, 18, 1.4); Cam.shake = Math.max(Cam.shake, .4); Snd.boom(); FX.decal(p, 3); } }
    else if (a.kind === 'pounce' || a.kind === 'dash') { mvx = fx * a.speed; mvz = fz * a.speed; rootY += a.kind === 'pounce' ? Math.sin(PI * sat(e.st / a.act)) * .9 : 0; if (!e.didHit && d < e.radius + (a.kind === 'dash' ? 1.5 : 1.0)) { e.didHit = true; hurtPlayer(dmg, e.pos.x - fx, e.pos.z - fz, { knock: 7, src: e, parry: a.kind !== 'dash' }); } if (a.kind === 'dash') { FX.smoke(e.pos, 1, .8, .05, .5); FX.wisp({ x: e.pos.x, y: 1.2, z: e.pos.z }, 0xff3a22, 2, 1); } }
    else if (a.kind === 'leap') { const k = sat(e.st / a.act); e.pos.x = lerp(e.lx, e.tx, k); e.pos.z = lerp(e.lz, e.tz, k); rootY += Math.sin(PI * k) * 4.5; if (k >= 1 && !e.didHit) { e.didHit = true; e.tele = null; FX.ring(e.pos, 1, a.r + 1, 0xffa060, .5); FX.dust(e.pos, 30, 2); Cam.shake = Math.max(Cam.shake, .7); Snd.boom(); FX.decal(e.pos, 5); if (d < a.r + .3) hurtPlayer(dmg, e.pos.x, e.pos.z, { knock: 11, src: e, parry: false }); } }
    else if (a.kind === 'spin') { e.yaw = dampAng(e.yaw, toP, 3, dt); mvx = Math.sin(toP) * a.speed; mvz = Math.cos(toP) * a.speed; action = { name: 'whirl', u: 0 }; e.tick -= dt; if (e.tick <= 0) { e.tick = .32; FX.slash({ x: e.pos.x, y: rand(1.2, 2), z: e.pos.z, yaw: rand(TAU), r: a.r, arc: 4.2, color: 0xff5a32, dur: .26, follow: e.pos, inten: 1.2 }); Snd.swing(1); if (d < a.r + .3) hurtPlayer(dmg, e.pos.x, e.pos.z, { knock: 8, src: e, parry: false }); } }
    if (e.st >= a.act) {
      e.fxDone = false; e.jumpY = 0;
      if (a.chain !== undefined && e.stun <= 0 && (a.kind !== 'melee' || d < 9)) { const ci = a.chain; e.yaw = dampAng(e.yaw, toP, 60, .05); startAttack_E(e, ci, true); }
      else { e.state = 'recover'; e.st = 0; e.rec = a.rec; }
    }
  }
  else if (e.state === 'recover') { const a = e.atk; if (a) { const tot = e.wind + a.act + a.rec; action = { name: a.kind === 'spin' ? 'slam' : a.anim, u: Math.min(1, (e.wind + a.act + e.st) / tot), w: e.wind / tot, a: (e.wind + a.act) / tot }; } rate = 12; if (e.st >= (e.rec || .5)) { releaseToken(e); e.atk = null; e.state = 'chase'; e.st = 0; } }

  // 位移与分离
  if (e.state !== 'dead') {
    e.pos.x += (mvx + e.kx) * dt; e.pos.z += (mvz + e.kz) * dt; const kd = Math.exp(-8 * dt); e.kx *= kd; e.kz *= kd;
    for (const o of G.enemies) { if (o === e || o.state === 'dead') continue; const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, od = Math.hypot(ox, oz), rr = e.radius + o.radius + .15; if (od < rr && od > .001) { const k = (rr - od) / od * .5 * (o.cfg.mass / (e.cfg.mass + o.cfg.mass)) * 2; e.pos.x += ox * k * .5; e.pos.z += oz * k * .5; } }
    collide(e.pos, e.radius);
  }
  e.speedN = speed; rig.root.position.set(e.pos.x, 0, e.pos.z); rig.root.rotation.y = e.yaw;
  if (rig.kind === 'wolf') { rig.animate(dt, t, { speed, action: e.atk && (e.state === 'windup' || e.state === 'active' || e.state === 'recover') ? action || { u: 1, w: .3, a: .6 } : null, hurt, fall, rootY }); }
  else animHuman(rig, dt, t, { speed, action: action && HA[action.name] ? action : null, rate, hurt, fall, rootY });
  const f = e.flash, st = e.stun > 0 ? .25 + Math.sin(t * 14) * .1 : 0, fr = e.frozeT > 0 ? .9 : e.slowT > 0 ? .12 : 0;
  rig.setGlow(f * .15 + glow * .05 + st * .3, f * .12 + st * .24 + fr * .5, f * .1 + st * .06 + fr);
  if (e.elite) { rig.setRim(.9, .6, .15); if (Math.random() < .15) FX.wisp({ x: e.pos.x, y: e.hitY, z: e.pos.z }, 0xffc040, 1, .6); } else rig.setRim(.3 + glow * 1.1, .2, .14);
  if (e.trail) { if (trail && e.state === 'active') { rig.bladePts(_eb, _et); e.trail.push(_eb, _et); } e.trail.update(dt0); }
  if (e.state === 'dead' && e.deadT > 1.6) { GFX.scene.remove(rig.root); rig.dispose(); if (e.trail) e.trail.dispose(); return false; }
  return true;
}

