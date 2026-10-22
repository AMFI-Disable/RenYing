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
/* 按住重剑蓄满：破山，一记力劈带出地裂剑气 */
const PISHAN = { name: '破山', dur: .7, w: .36, a: .58, cancel: .86, mult: 3.4, range: 2.7, off: 2.2, arc: TAU, lunge: 1.9, anim: 'chop', knock: 7.5, stop: .15, shake: .55, poise: 6, sta: 24, slam: true, pishan: true };
/* 弹反：起手 win 秒内卸开来招；win 到 guard 之间只算格挡；落空后还要 rec 秒收势 */
const PARRY = { win: .22, guard: .45, rec: .3, sta: 8 };
const Pl = { pos: new V3(0, 0, 9), vel: new V3(), yaw: PI, kx: 0, kz: 0 };
const _b = new V3(), _t = new V3(), _v1 = new V3(), _v2 = new V3(), _v3 = new V3();
/* 镜头别钻进场外：收回到场地半径以内，且不低于地面 */
function collideCam(v) { const cr = Math.hypot(v.x, v.z), R = World.R + 7; if (cr > R) { v.x *= R / cr; v.z *= R / cr; } v.y = Math.max(.5, v.y); }

function resetPlayer() {
  Object.assign(Pl, { lv: 1, xp: 0, hp: 120, mp: 60, sta: 100, rage: 0, gold: 0, pots: 3, swordLv: 0, bodyLv: 0, qiLv: 0, perks: {}, state: 'free', st: 0, combo: 0, comboT: 0, buf: 0, bufH: 0, iframe: 0, staDelay: 0, cds: [0, 0, 0, 0], potCd: 0, lock: null, hits: 0, hitT: 0, shield: 0, shieldT: 0, buffT: 0, combatT: 0, hurtV: 0, speedN: 0, atkDef: null, hitSet: new Set(), kx: 0, kz: 0, yaw: PI, deadT: 0, tick: 0, pending: 0, parries: 0, execT: null, execE: null, flashE: null, perfectT: 0, perfectSrc: null, charged: false, flickAcc: 0, flickCd: 0, boltN: 0, metaRevive: false, rerolls: 0, slots: ['qi', null, null], ult: null, skLv: { qi: 1 }, cdMax: [1, 1, 1, 1], bellT: 0, wuyingT: 0, nextCrit: 0, reviveUsed: false });
  Pl.pos.set(0, 0, 9); Pl.vel.set(0, 0, 0); recalc(); Pl.hp = Pl.maxHp; Pl.mp = Pl.maxMp; setSwordTier();
}
const pk = k => Pl.perks[k] || 0;
function recalc() {
  Pl.atk = (20 + 2.2 * (Pl.lv - 1)) * (1 + .13 * Pl.swordLv) * (1 + .15 * pk('atk')) * (1 + .05 * up('jian'));
  Pl.maxHp = Math.round((120 + 6 * (Pl.lv - 1) + 30 * pk('hp') + 28 * Pl.bodyLv) * (reso('gen') >= 3 ? 1.15 : 1) * (1 + .06 * up('gu'))); Pl.maxMp = 60 + 20 * pk('mp') + 22 * Pl.qiLv; Pl.maxSta = 100;
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
  const cost = 22 * (1 - .2 * pk('mspd')) * (reso('shen') >= 3 ? .7 : 1); if (Pl.sta < cost) { UI.toast('体力不济'); return false; }
  Pl.sta -= cost; Pl.staDelay = .7; Pl.state = 'dodge'; Tut.dodged = true; Pl.st = 0; Pl.iframe = .36; Pl.perfect = false;
  Pl.dodgeYaw = Pl.moveMag > .3 ? Pl.moveYaw : Pl.yaw + PI; Pl.yawT = Pl.moveMag > .3 ? Pl.moveYaw : Pl.yaw; Snd.dodge(); FX.dust(Pl.pos, 5, .5); return true;
}
function startParry() {
  if (Pl.sta < PARRY.sta) { UI.toast('体力不济'); return; }
  Pl.sta -= PARRY.sta; Pl.staDelay = .5; Pl.state = 'parry'; Pl.st = 0; Pl.combatT = 3; Pl.buf = 0; Pl.bufH = 0;
  const tg = Pl.lock && Pl.lock.state !== 'dead' ? Pl.lock : pickTarget(Pl.moveMag > .3 ? Pl.moveYaw : Pl.yaw, 6, PI);
  Pl.yawT = tg ? Math.atan2(tg.pos.x - Pl.pos.x, tg.pos.z - Pl.pos.z) : Pl.yaw; Snd.guard();
}
/* 卸剑成功：火星、定帧、回体力内力；来者若是近身招式，记到它头上 */
function onDeflect(src, sx, sz, o) {
  const ax = sx - Pl.pos.x, az = sz - Pl.pos.z, d = Math.hypot(ax, az) || 1; Pl.yawT = Math.atan2(ax, az);
  if (Pl.state !== 'deflect' || Pl.st > .05) { Pl.state = 'deflect'; Pl.st = 0; }
  Pl.sta = Math.min(Pl.maxSta, Pl.sta + 20); Pl.mp = Math.min(Pl.maxMp, Pl.mp + 8); Pl.combatT = 3; Pl.parries++; gainRage(8); if (pk('huifeng')) Pl.nextCrit = 3;
  if (o.proj && pk('jieli')) Pl.mp = Math.min(Pl.maxMp, Pl.mp + 10);
  if (reso('yi') >= 6) { FX.ring(Pl.pos, .4, 4.4, swordTier().trail, .3); for (const e of G.enemies) if (e.state !== 'dead' && e !== src && Math.hypot(e.pos.x - Pl.pos.x, e.pos.z - Pl.pos.z) < 4.4 + e.radius) playerDamage(e, 1.3, { knock: 5, poise: 2, noRage: true }); }
  const p = { x: Pl.pos.x + ax / d * .75, y: 1.3, z: Pl.pos.z + az / d * .75 };
  FX.sparks(p, 24, 0xfff2c8, 11, 2.5); FX.glint(p, 0xfff6e0, 2.2, .28); FX.ring(p, .3, 2.4, 0xfff0c8, .25, 1.3); GFX.flashAt(p, 0xfff0d0, 4);
  G.hitstop = Math.max(G.hitstop, .1); Cam.shake = Math.max(Cam.shake, .22); Snd.parry();
  if (!(src && !o.proj && parriedBy(src))) FX.num({ x: Pl.pos.x, y: 2.3, z: Pl.pos.z }, '卸', 'word parry', .7);
}
/* 眼前露出破绽、够得着的敌人；锁定的优先 */
function findExec() {
  let best = null, bs = 1e9;
  for (const e of G.enemies) { if (e.state === 'dead' || e.stun <= 0 || e.execd) continue; const d = Math.hypot(e.pos.x - Pl.pos.x, e.pos.z - Pl.pos.z) - e.radius; if (d > 3.2) continue; const s = d - (e === Pl.lock ? 2 : 0); if (s < bs) { bs = s; best = e; } }
  return best;
}
function startExec(e) {
  Pl.state = 'exec'; Pl.st = 0; Pl.execE = e; Pl.iframe = 1.3; Pl.combatT = 3; Pl.fired = false; Pl.buf = 0; Pl.bufH = 0;
  e.execd = true; cancelAttack(e); e.state = 'stagger'; e.st = 0; e.stagger = e.stun = 9; e.kx = e.kz = 0;
  const dx = Pl.pos.x - e.pos.x, dz = Pl.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1, k = e.radius + 1.05;
  Pl.ex0 = Pl.pos.clone(); Pl.ex1 = new V3(e.pos.x + dx / d * k, 0, e.pos.z + dz / d * k); Pl.yaw = Pl.yawT = Math.atan2(-dx, -dz); e.yaw = Math.atan2(dx, dz);
  G.enemyTS = .12; G.slowT = 1.1; Snd.flash();
}
/* 处决这一刺：小卒毙命，精锐去半条命，头领掉一成二 */
function execImpact(e) {
  if (e.state === 'dead') return;
  const p = { x: e.pos.x, y: e.hitY, z: e.pos.z }, dmg = (e.boss ? e.maxHp * .12 + Pl.atk * 3 : e.elite ? Math.max(e.maxHp * .5, Pl.atk * 6) : e.hp + 1) * (1 + .3 * pk('duanyue'));
  e.stun = 0; damageEnemy(e, dmg, { crit: true, kx: Math.sin(Pl.yaw) * 3, kz: Math.cos(Pl.yaw) * 3 });
  G.dmgDone += dmg; Pl.hits++; Pl.hitT = 2.6; if (Pl.hits > G.maxCombo) G.maxCombo = Pl.hits; UI.combo(Pl.hits);
  FX.inkBurst(p, 16, 1.1); FX.sparks(p, 30, 0xff5a3a, 12, 3); FX.glow(p, 0xffffff, 4, .2); FX.decal(e.pos, 3.4);
  FX.slash({ x: Pl.pos.x, y: e.hitY, z: Pl.pos.z, yaw: Pl.yaw, roll: PI / 2, r: 3.2, arc: .45, inner: .05, color: 0xffe6c0, dur: .22, inten: 2 });
  G.hitstop = .18; Cam.shake = Math.max(Cam.shake, .55); GFX.final.uniforms.uFlash.value = .22; GFX.flashAt(p, 0xffe0c0, 6);
  FX.num({ x: e.pos.x, y: e.hitY + .5, z: e.pos.z }, '斩', 'exec', 1.4); Snd.exec(); Pl.mp = Math.min(Pl.maxMp, Pl.mp + 15); healPlayer(Pl.maxHp * (.04 + .04 * pk('duanyue'))); gainRage(18);
}
/* 踏雪之后趁势出剑：瞬身至出手者背后一斩 */
function startFlash(e) {
  Pl.state = 'flash'; Pl.st = 0; Pl.flashE = e; Pl.iframe = .7; Pl.perfectT = 0; Pl.perfectSrc = null; Pl.buf = 0; Pl.fired = false; Pl.combatT = 3;
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), k = e.radius + 1.25, to = new V3(e.pos.x - fx * k, 0, e.pos.z - fz * k); collide(to, .42);
  for (let i = 0; i <= 14; i++) { const t = i / 14; FX.ink.emit({ x: lerp(Pl.pos.x, to.x, t), y: rand(.5, 1.7), z: lerp(Pl.pos.z, to.z, t), vy: rand(.2, .6), life: rand(.4, .8), s0: rand(.6, 1.1), s1: .1, r: .05, g: .05, b: .07, a: .6, grav: -.2 }); }
  FX.wisp({ x: Pl.pos.x, y: 1, z: Pl.pos.z }, 0xdfeeee, 10, 1.6); Pl.pos.copy(to); Pl.yaw = Pl.yawT = Math.atan2(e.pos.x - to.x, e.pos.z - to.z); Snd.flash();
}
/* 锁定换人：dir 为 1 换到屏幕右边那个，-1 换左边 */
function switchLock(dir) {
  const cur = Pl.lock; if (!cur) return; const a0 = angDiff(Cam.yaw, Math.atan2(cur.pos.x - Pl.pos.x, cur.pos.z - Pl.pos.z)); let best = null, bs = 1e9;
  for (const e of G.enemies) { if (e === cur || e.state === 'dead') continue; const dx = e.pos.x - Pl.pos.x, dz = e.pos.z - Pl.pos.z, d = Math.hypot(dx, dz); if (d > 30) continue; const da = (a0 - angDiff(Cam.yaw, Math.atan2(dx, dz))) * dir; if (da <= .02) continue; const s = da + d * .01; if (s < bs) { bs = s; best = e; } }
  if (best) { Pl.lock = best; Snd.pick(); }
}
function trySkill(i) {
  const s = slotDef(i); if (!s) { if (i < 3) UI.toast('此槽尚空 · 破境时择剑谱'); else UI.toast('尚未悟得绝学'); return; }
  if (Pl.cds[i] > 0) return;
  if (i === 3) { if (Pl.rage < 100) { UI.toast('剑意未满'); return; } Pl.rage = 0; }
  else if (Pl.mp < s.mp) { UI.toast('内力不继'); return; }
  else { Pl.mp -= s.mp; Pl.cds[i] = s.cd * Pl.cdr; Pl.cdMax[i] = Pl.cds[i]; }
  Pl.combatT = 3; Pl.st = 0; Pl.tick = 0; Pl.fired = false; Pl.hitSet.clear(); Snd.skill();
  const tg = Pl.lock && Pl.lock.state !== 'dead' ? Pl.lock : pickTarget(Pl.yaw, 22, 1.2); if (tg && s.st !== 'whirl') Pl.yawT = Pl.yaw = Math.atan2(tg.pos.x - Pl.pos.x, tg.pos.z - Pl.pos.z);
  Pl.state = s.st;
  if (s.st === 'skShadow') { Pl.tick = -1; Pl.iframe = (3 + skLv('shadow')) * .15 + .1; }
  if (i === 3) { Pl.iframe = s.st === 'ultW' ? .6 : 3.3; if (s.st === 'ult') { G.enemyTS = .12; G.slowT = 2.7; } if (s.st === 'ultL') { G.enemyTS = .3; G.slowT = 3.1; } UI.banner(s.n, '', 'gold'); Snd.gong(); }
  FX.ring(Pl.pos, .4, 3.2, swordTier().trail, .4); FX.wisp({ x: Pl.pos.x, y: 1, z: Pl.pos.z }, swordTier().trail, 14, 2.4);
}
function usePotion() {
  if (Pl.potCd > 0 || Pl.state === 'dead') return; if (Pl.pots <= 0) { UI.toast('回春丹已尽'); return; } if (Pl.hp >= Pl.maxHp) { UI.toast('气血充盈'); return; }
  Pl.pots--; Pl.potCd = 1.5; const h = Math.round(Pl.maxHp * .45); healPlayer(h); Snd.level(); FX.pillar(Pl.pos, 0x8be0a0, 3);
}
function healPlayer(h, quiet) { const b = Pl.hp; Pl.hp = Math.min(Pl.maxHp, Pl.hp + h); const d = Math.round(Pl.hp - b); if (d >= 1 && !quiet) FX.num({ x: Pl.pos.x, y: 2, z: Pl.pos.z }, '+' + d, 'heal'); }

function playerDamage(e, mult, o = {}) {
  let dmg = Pl.atk * mult * rand(.93, 1.07); const crit = Pl.nextCrit > 0 && o.melee || Math.random() < Pl.crit + (o.critBonus || 0); if (crit) dmg *= Pl.critD; if (crit && o.melee) Pl.nextCrit = 0;
  if (Pl.buffT > 0) dmg *= 1.4; if (Pl.wuyingT > 0) dmg *= 1.5; if (e.slowT > 0 && pk('frost')) dmg *= 1 + .15 * pk('frost');
  const dx = e.pos.x - Pl.pos.x, dz = e.pos.z - Pl.pos.z, d = Math.hypot(dx, dz) || 1;
  const ok = damageEnemy(e, dmg, { crit, kx: dx / d * (o.knock || 0), kz: dz / d * (o.knock || 0), poise: o.poise || 1, cls: o.cls });
  if (!ok) return false;
  G.dmgDone += dmg; Pl.hits++; Pl.hitT = 2.6; if (Pl.hits > G.maxCombo) G.maxCombo = Pl.hits; UI.combo(Pl.hits);
  if (o.melee) Pl.mp = Math.min(Pl.maxMp, Pl.mp + 1.6);
  if (!o.noRage) gainRage(o.melee ? 2.2 : .7);
  if (pk('leech')) healPlayer(dmg * .025 * pk('leech'), true);
  if (!o.noProc) {
    if (pk('frost')) e.slowT = 2.6;
    if (pk('burn')) { e.burnT = 3; e.burnDps = Pl.atk * .22 * pk('burn'); }
    if (crit && reso('lei') >= 3 && !pk('burn')) { e.burnT = 3; e.burnDps = Math.max(e.burnDps, Pl.atk * .2); }
    if (reso('lei') >= 6 && o.melee && ++Pl.boltN % 6 === 0) { FX.bolt(e.pos); Snd.bolt(); for (const o2 of G.enemies) if (o2.state !== 'dead' && Math.hypot(o2.pos.x - e.pos.x, o2.pos.z - e.pos.z) < 3.4) playerDamage(o2, 1.6, { noProc: true, cls: 'bolt', knock: 2, noRage: true }); }
    if (crit && pk('thunder') && Math.random() < .2 + .12 * pk('thunder')) { FX.bolt(e.pos); Snd.bolt(); Cam.shake = Math.max(Cam.shake, .3); for (const o2 of G.enemies) if (o2.state !== 'dead' && Math.hypot(o2.pos.x - e.pos.x, o2.pos.z - e.pos.z) < 3.8) playerDamage(o2, 1.5, { noProc: true, cls: 'bolt', knock: 2 }); }
  }
  const hp = { x: e.pos.x - dx / d * e.radius * .6, y: e.hitY, z: e.pos.z - dz / d * e.radius * .6 };
  FX.sparks(hp, crit ? 14 : 8, crit ? 0xffd060 : swordTier().trail, crit ? 10 : 7); FX.glow(hp, crit ? 0xffe0a0 : 0xffffff, crit ? 2.4 : 1.5, .14); if (o.melee) FX.inkBurst(hp, crit ? 7 : 4, .7);
  if (o.stop) G.hitstop = Math.max(G.hitstop, o.stop * (crit ? 1.4 : 1)); if (o.shake) Cam.shake = Math.max(Cam.shake, o.shake * (crit ? 1.4 : 1));
  if (crit) GFX.flashAt(e.pos, 0xffd9a0, 3);
  return true;
}
/* o.src 出手的敌人；o.proj 飞行物；o.parry === false 为不可弹反。弹开时返回 'parry' */
function hurtPlayer(dmg, sx, sz, o = {}) {
  if (Pl.state === 'dead' || G.state !== 'playing' || G.clearT > 0) return false;
  // 弹反：架势初起的一瞬（以及卸剑后片刻，防同时两刀），接得住的招式全数卸开
  if (o.parry !== false && ((Pl.state === 'parry' && Pl.st <= PARRY.win + .05 * pk('tingfeng')) || (Pl.state === 'deflect' && Pl.st < .14) || (Pl.bellT > 0 && Pl.iframe <= 0 && Pl.state !== 'dead'))) { onDeflect(o.src, sx, sz, o); return 'parry'; }
  const guard = o.parry !== false && Pl.state === 'parry' && Pl.st <= PARRY.guard;
  if (Pl.iframe > 0) {
    if (Pl.state === 'dodge' && Pl.st < .3 && !Pl.perfect) {
      Pl.perfect = true; G.enemyTS = .22; G.slowT = 1.1; Pl.mp = Math.min(Pl.maxMp, Pl.mp + 14); gainRage(10); Pl.sta = Math.min(Pl.maxSta, Pl.sta + 22); if (pk('snow')) Pl.buffT = 3 + pk('snow');
      FX.num({ x: Pl.pos.x, y: 2.2, z: Pl.pos.z }, '踏雪', 'word', 1.1); Snd.perfect(); FX.ring(Pl.pos, .5, 4, 0x9ff0e0, .5); GFX.final.uniforms.uFlash.value = .12;
      if (o.src && !o.proj && o.src.state !== 'dead') { Pl.perfectSrc = o.src; Pl.perfectT = 1.2; UI.toast('趁势出剑 · 瞬斩', 1.2); }
      if (reso('shen') >= 6) afterImage();
    }
    return false;
  }
  if (Pl.shield > 0) { Pl.shield--; Pl.shieldT = 12; Pl.iframe = .5; FX.num({ x: Pl.pos.x, y: 2.1, z: Pl.pos.z }, '真气护体', 'word', .9); FX.ring(Pl.pos, .6, 2.6, 0x62cdb9, .35); Snd.clang(); return false; }
  const armor = Pl.state === 'whirl' || Pl.bellT > 0; if (armor) dmg *= .5; if (guard) dmg *= reso('yi') >= 3 ? 0 : .3;
  dmg = Math.round(dmg); if (dmg < 1 && !guard) { Pl.iframe = .3; return false; } Pl.hp -= dmg; Pl.iframe = .5; Pl.hurtV = guard ? .35 : 1; Pl.hits = 0; UI.combo(0); Cam.shake = Math.max(Cam.shake, (guard ? .18 : .35) + dmg * .008);
  FX.num({ x: Pl.pos.x, y: 2.1, z: Pl.pos.z }, '-' + dmg, 'hurt');
  if (guard) { Pl.sta = Math.max(0, Pl.sta - 14); Pl.staDelay = .8; Snd.block(); FX.sparks({ x: Pl.pos.x, y: 1.3, z: Pl.pos.z }, 10, 0xffd8a0, 7); FX.num({ x: Pl.pos.x, y: 2.5, z: Pl.pos.z }, '格', 'word', .7); }
  else { Snd.hurt(); FX.inkBurst({ x: Pl.pos.x, y: 1.1, z: Pl.pos.z }, 6, .7); }
  const dx = Pl.pos.x - sx, dz = Pl.pos.z - sz, d = Math.hypot(dx, dz) || 1, kb = (o.knock === undefined ? 5 : o.knock) * (guard ? .5 : 1); Pl.kx += dx / d * kb; Pl.kz += dz / d * kb;
  if (Pl.hp <= 0 && reso('gen') >= 6 && !Pl.reviveUsed) { Pl.reviveUsed = true; Pl.hp = Math.round(Pl.maxHp * .4); Pl.iframe = 2; FX.pillar(Pl.pos, 0x8be0a0, 8); FX.ring(Pl.pos, .5, 6, 0x8be0a0, .6); UI.banner('回魂', '根基深厚，一口气续上', 'gold'); Snd.level(); G.enemyTS = .2; G.slowT = 1.2; }
  if (Pl.hp <= 0 && Pl.metaRevive) { Pl.metaRevive = false; Pl.hp = Math.round(Pl.maxHp * .3); Pl.iframe = 2; FX.pillar(Pl.pos, 0x8be0a0, 8); FX.ring(Pl.pos, .5, 6, 0x8be0a0, .6); UI.banner('回魂', '藏经阁所授，续一口气', 'gold'); Snd.level(); G.enemyTS = .2; G.slowT = 1.2; }
  if (Pl.hp <= 0) { Pl.hp = 0; Pl.state = 'dead'; Pl.st = 0; G.enemyTS = .25; G.slowT = 99; Game.onDeath(); return true; }
  if (!armor && !guard && Pl.state !== 'ult') { Pl.state = 'hurt'; Pl.st = 0; }
  return true;
}

function updatePlayer(dt) {
  const rig = Pl.rig; Pl.st += dt; Pl.iframe -= dt; Pl.combatT -= dt; Pl.potCd -= dt; Pl.buffT -= dt; Pl.hurtV = Math.max(0, Pl.hurtV - dt * 2.2);
  for (let i = 0; i < 4; i++) Pl.cds[i] = Math.max(0, Pl.cds[i] - dt);
  Pl.bellT -= dt; Pl.wuyingT -= dt; Pl.nextCrit -= dt; bellFx(Pl.bellT > 0 && Pl.state !== 'dead', G.t);
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
  const wantDodge = Input.hit('Space') || Input.hit('KeyL'), wantParry = Input.hit('KeyF');
  const busy = Pl.state === 'exec' || Pl.state === 'flash';
  const canAct = Pl.state === 'free' || Pl.state === 'deflect' || (Pl.state === 'attack' && Pl.st / (Pl.atkDef.dur / Pl.aspd) > Pl.atkDef.cancel);
  const alive = Pl.state !== 'dead' && Pl.state !== 'ult' && Pl.state !== 'ultL' && Pl.state !== 'skShadow';
  Pl.perfectT -= dt; Pl.flickCd -= dt; Pl.execT = alive && !busy ? findExec() : null;
  if (alive && !busy) {
    if (Input.hit('KeyC')) usePotion();
    if (Input.hit('Tab')) { if (Pl.lock) Pl.lock = null; else { Pl.lock = pickTarget(Cam.yaw, 30, 1.0) || nearestEnemy(Pl.pos.x, Pl.pos.z, 30); if (!Pl.lock) UI.toast('四下无敌可锁'); } }
    if (Pl.lock && Pl.lock.state === 'dead') Pl.lock = nearestEnemy(Pl.pos.x, Pl.pos.z, 22);
    // 锁定时 ← → 或甩一下鼠标换目标
    if (Pl.lock) { Pl.flickAcc = Pl.flickAcc * Math.exp(-dt * 10) + Input.mdx; if (Input.hit('ArrowRight')) switchLock(1); else if (Input.hit('ArrowLeft')) switchLock(-1); else if (Math.abs(Pl.flickAcc) > 90 && Pl.flickCd <= 0) { switchLock(Math.sign(Pl.flickAcc)); Pl.flickCd = .4; Pl.flickAcc = 0; } }
    const interruptible = Pl.state === 'free' || Pl.state === 'attack' || Pl.state === 'castQ' || Pl.state === 'castR' || Pl.state === 'charge' || Pl.state === 'deflect';
    if (wantParry && (interruptible || Pl.state === 'dodge')) { if (Pl.execT) startExec(Pl.execT); else if (Pl.state !== 'dodge') startParry(); }
    else if (wantDodge && interruptible) tryDodge();
    else if (Pl.buf > 0 && Pl.perfectT > 0 && Pl.perfectSrc && Pl.perfectSrc.state !== 'dead' && (Pl.state === 'free' || Pl.state === 'dodge')) startFlash(Pl.perfectSrc);
    else if (canAct || (Pl.state === 'attack' && Pl.st > .12)) {
      if (Input.hit('KeyQ') || Input.hit('Digit1') || Input.hit('Sk0')) trySkill(0); else if (Input.hit('KeyE') || Input.hit('Digit2') || Input.hit('Sk1')) trySkill(1);
      else if (Input.hit('KeyR') || Input.hit('Digit3') || Input.hit('Sk2')) trySkill(2); else if (Input.hit('KeyV') || Input.hit('Digit4') || Input.hit('Sk3')) trySkill(3);
    }
    if (canAct && (Pl.state === 'free' || Pl.state === 'attack' || Pl.state === 'deflect')) {
      if (Pl.bufH > 0) { if (Pl.sta >= HEAVY.sta) { Pl.state = 'charge'; Pl.st = 0; Pl.charged = false; Pl.bufH = 0; Pl.buf = 0; Pl.combatT = 3; } else { Pl.bufH = 0; UI.toast('体力不济'); } }
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
    if (!Pl.atkFx && u >= d.w && !d.slam) { Pl.atkFx = true; if (reso('qi') >= 6 && !d.spin) spawnWave(Pl.yaw, .7); if (d.anim === 'thrust') { FX.slash({ x: Pl.pos.x + Math.sin(Pl.yaw) * 1.4, y: 1.3, z: Pl.pos.z + Math.cos(Pl.yaw) * 1.4, yaw: Pl.yaw, roll: PI / 2, r: 2.9, arc: .5, inner: .1, color: tier.trail, dur: .2, inten: 1.3 }); } else FX.slash({ x: Pl.pos.x, y: d.spin ? 1.15 : 1.25, z: Pl.pos.z, yaw: Pl.yaw + (d.spin ? PI : 0), roll: d.roll || 0, dir: d.dir || 1, r: d.range * .98, arc: d.spin ? TAU * .98 : d.arc, color: tier.trail, dur: d.spin ? .3 : .2, follow: Pl.pos }); }
    if (d.slam) {
      const land = (d.w + d.a) * .5;
      if (!Pl.slamDone && u >= land) {
        Pl.slamDone = true; const cx = Pl.pos.x + Math.sin(Pl.yaw) * (d.off || 1.5), cz = Pl.pos.z + Math.cos(Pl.yaw) * (d.off || 1.5); let any = false;
        for (const e of G.enemies) { if (e.state === 'dead') continue; if (Math.hypot(e.pos.x - cx, e.pos.z - cz) < d.range + e.radius) any = playerDamage(e, d.mult, { melee: true, knock: d.knock, poise: d.poise, stop: d.stop, shake: d.shake }) || any; }
        FX.ring({ x: cx, z: cz }, .6, d.range + .6, tier.trail, .38); FX.dust({ x: cx, z: cz }, 16, 1.2); FX.slash({ x: Pl.pos.x, y: 1.3, z: Pl.pos.z, yaw: Pl.yaw, roll: PI / 2, dir: -1, r: 3.1, arc: 2.6, color: tier.trail, dur: .2 });
        Cam.shake = Math.max(Cam.shake, .28); Snd.boom(); if (!any) Snd.hit(1); FX.decal({ x: cx, z: cz }, 2.6);
        if (pk('wave')) for (let i = 0; i < pk('wave'); i++) spawnWave(Pl.yaw + (i - (pk('wave') - 1) / 2) * .3, 1.6);
        if (d.pishan) { spawnWave(Pl.yaw, 1.8); FX.decal({ x: cx, z: cz }, 4); FX.ring({ x: cx, z: cz }, .4, 5.5, 0xffe0b0, .5); FX.sparks({ x: cx, y: .3, z: cz }, 26, tier.trail, 10, 4); GFX.flashAt({ x: cx, y: .5, z: cz }, 0xffe6c0, 5); Cam.shake = Math.max(Cam.shake, .55); }
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
    if (!Pl.fired && u >= .3) { Pl.fired = true; const n = Math.min(11, 1 + 2 * (skLv('qi') - 1) + 2 * pk('split')); for (let i = 0; i < n; i++) spawnWave(Pl.yaw + (i - (n - 1) / 2) * .24, 2.3); FX.slash({ x: Pl.pos.x, y: 1.25, z: Pl.pos.z, yaw: Pl.yaw, roll: .1, r: 3.4, arc: 2.9, color: tier.trail, dur: .22, inten: 1.4 }); Snd.swing(1); Cam.shake = Math.max(Cam.shake, .14); }
    if (u >= 1) Pl.state = 'free';
  } else if (Pl.state === 'whirl') {
    const dur = 1.3 + .3 * (skLv('whirl') - 1); action = { name: 'whirl', u: 0 }; rate = 30; trailOn = true; const sp = 5 * Pl.mspd * mag; Pl.vel.x = damp(Pl.vel.x, mx * sp, 10, dt); Pl.vel.z = damp(Pl.vel.z, mz * sp, 10, dt); Pl.tick -= dt;
    if (Pl.tick <= 0) {
      Pl.tick = .15; let any = false; FX.slash({ x: Pl.pos.x, y: rand(.9, 1.5), z: Pl.pos.z, yaw: rand(TAU), roll: rand(-.25, .25), r: 4.3, arc: 4.2, color: tier.trail, dur: .24, follow: Pl.pos, inten: .9 }); Snd.swing(0);
      for (const e of G.enemies) { if (e.state === 'dead') continue; const dx = e.pos.x - Pl.pos.x, dz = e.pos.z - Pl.pos.z, dd = Math.hypot(dx, dz); if (dd < 4.5 + e.radius) { any = playerDamage(e, .55, { melee: true, knock: e.boss ? 0 : -1.6, poise: .7, shake: .06 }) || any; } }
      if (any) Snd.hit(0);
    }
    if (Pl.st >= dur) { Pl.state = 'free'; FX.ring(Pl.pos, 1, 6, tier.trail, .45); Cam.shake = Math.max(Cam.shake, .3); Snd.boom(); for (const e of G.enemies) if (e.state !== 'dead' && Math.hypot(e.pos.x - Pl.pos.x, e.pos.z - Pl.pos.z) < 5.4 + e.radius) playerDamage(e, 1.6 * (1 + .3 * (skLv('whirl') - 1)), { knock: 8, poise: 3, stop: .08 }); }
  } else if (Pl.state === 'castR') {
    const dur = .5, u = Pl.st / dur; action = { name: 'summon', u: Math.min(1, u) }; rate = 26; Pl.vel.x *= .8; Pl.vel.z *= .8;
    if (!Pl.fired && u >= .25) { Pl.fired = true; const n = 5 + 2 * (skLv('fly') - 1); for (let i = 0; i < n; i++) spawnProj({ kind: 'fly', x: Pl.pos.x, y: 1.6, z: Pl.pos.z, ang: i / n * TAU, delay: .45 + i * .08, life: 4, dmg: 1.5 }); }
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
  } else if (SKST[Pl.state]) { [action, rate, trailOn] = SKST[Pl.state](dt, tier);
  } else if (Pl.state === 'parry') {
    action = { name: 'parry', u: Math.min(1, Pl.st / (PARRY.guard + PARRY.rec)) }; rate = 34; Pl.vel.x *= .7; Pl.vel.z *= .7; Pl.yaw = dampAng(Pl.yaw, Pl.yawT, 18, dt);
    if (Pl.st >= PARRY.guard + PARRY.rec) Pl.state = 'free';
  } else if (Pl.state === 'deflect') {
    action = { name: 'deflect', u: Math.min(1, Pl.st / .34) }; rate = 36; Pl.vel.x *= .8; Pl.vel.z *= .8; trailOn = Pl.st < .15; Pl.yaw = dampAng(Pl.yaw, Pl.yawT, 20, dt);
    if (Pl.st >= .34) Pl.state = 'free';
  } else if (Pl.state === 'exec') {
    const e = Pl.execE, u = Pl.st / .95; action = { name: 'exec', u: Math.min(1, u) }; rate = 30; Pl.vel.x = Pl.vel.z = 0;
    if (u < .2) Pl.pos.lerpVectors(Pl.ex0, Pl.ex1, easeOut(u / .2)); trailOn = (u > .2 && u < .46) || (u > .64 && u < .82);
    if (!Pl.fired && u >= .44) { Pl.fired = true; execImpact(e); }
    if (u >= 1) { Pl.state = 'free'; Pl.iframe = .35; if (e.state !== 'dead') { e.execd = false; e.stun = 0; e.state = 'recover'; e.st = 0; e.rec = .7; e.atk = null; } }
  } else if (Pl.state === 'charge') {
    const held = Input.down('KeyK') || Input.down('Mouse2') || Input.down('TouchK'); action = { name: 'charge', u: Math.min(1, Pl.st / .5) }; rate = 18;
    const sp = 1.9 * Pl.mspd * mag; Pl.vel.x = damp(Pl.vel.x, mx * sp, 10, dt); Pl.vel.z = damp(Pl.vel.z, mz * sp, 10, dt);
    if (Pl.lock) Pl.yaw = dampAng(Pl.yaw, Math.atan2(Pl.lock.pos.x - Pl.pos.x, Pl.lock.pos.z - Pl.pos.z), 8, dt); else if (mag > .1) Pl.yaw = dampAng(Pl.yaw, Pl.moveYaw, 6, dt);
    if (Pl.st >= .5 && !Pl.charged) { Pl.charged = true; rig.bladePts(_b, _t); FX.glint(_t, tier.trail, 1.6); FX.ring(Pl.pos, .3, 2.4, tier.trail, .3); Snd.charged(); }
    if (Pl.st > .12 && Math.random() < (Pl.charged ? .8 : .45)) { rig.bladePts(_b, _t); _c.set(tier.trail); const a = rand(TAU), r = rand(.8, 1.6); _v1.lerpVectors(_b, _t, rand()); FX.add.emit({ x: _v1.x + Math.cos(a) * r, y: _v1.y + rand(-.4, .6), z: _v1.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 3, vy: 0, vz: -Math.sin(a) * r * 3, life: .3, s0: .14, s1: .02, r: _c.r, g: _c.g, b: _c.b, grav: 0 }); }
    if (!held || Pl.st > 2.4) { const def = Pl.charged ? PISHAN : HEAVY; if (Pl.sta >= def.sta) { Pl.sta -= def.sta; Pl.staDelay = .6; Pl.combo = 0; startAttack(def); } else { Pl.state = 'free'; UI.toast('体力不济'); } Pl.charged = false; }
  } else if (Pl.state === 'flash') {
    const e = Pl.flashE, u = Pl.st / .46; action = { name: 'sweepRL', u: Math.min(1, u), w: .18, a: .5 }; rate = 40; Pl.vel.x = Pl.vel.z = 0; trailOn = u > .1 && u < .62;
    if (e.state !== 'dead') Pl.yaw = dampAng(Pl.yaw, Math.atan2(e.pos.x - Pl.pos.x, e.pos.z - Pl.pos.z), 20, dt);
    if (!Pl.fired && u >= .2) {
      Pl.fired = true; FX.slash({ x: Pl.pos.x, y: 1.25, z: Pl.pos.z, yaw: Pl.yaw, roll: .1, r: 3.8, arc: 3.0, color: 0xffffff, dur: .22, inten: 1.6, follow: Pl.pos }); let any = false;
      for (const o of G.enemies) { if (o.state === 'dead') continue; const dx = o.pos.x - Pl.pos.x, dz = o.pos.z - Pl.pos.z, dd = Math.hypot(dx, dz); if (dd > 3.8 + o.radius || (dd > o.radius + .6 && Math.abs(angDiff(Pl.yaw, Math.atan2(dx, dz))) > 1.6)) continue; any = playerDamage(o, (o === e ? 2.8 : 1.4) * (1 + .3 * pk('youshen')), { melee: true, critBonus: 1, knock: 4, poise: 4, stop: .12, shake: .3 }) || any; }
      if (any) Snd.hit(1);
    }
    if (u >= 1) Pl.state = 'free';
  } else if (Pl.state === 'hurt') { Pl.vel.x *= .85; Pl.vel.z *= .85; rate = 26; if (Pl.st > .24) Pl.state = 'free'; }
  else if (Pl.state === 'dead') { Pl.vel.x = Pl.vel.z = 0; Pl.deadT += dt; }
  if (Pl.state !== 'ult' && Pl.state !== 'ultL') Cam.distT = sprint ? 8.2 : 7.4;
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
  const sens = (Input.touch ? .005 : .0026) * setting('sens'); Cam.yaw -= Input.mdx * sens; Cam.pitch = clamp(Cam.pitch + Input.mdy * sens * .8, -.12, 1.15);
  Cam.yaw += ((Input.down('ArrowLeft') ? 1 : 0) - (Input.down('ArrowRight') ? 1 : 0)) * 2.3 * rdt; Cam.pitch = clamp(Cam.pitch + ((Input.down('ArrowDown') ? 1 : 0) - (Input.down('ArrowUp') ? 1 : 0)) * 1.2 * rdt, -.12, 1.15);
  const lk = Pl.lock && Pl.lock.state !== 'dead' ? Pl.lock : null;
  // 锁定：镜头随目标转，离得越近俯得越高，把两人都框进画面
  if (lk) { const ty = Math.atan2(lk.pos.x - Pl.pos.x, lk.pos.z - Pl.pos.z), ld = Math.hypot(lk.pos.x - Pl.pos.x, lk.pos.z - Pl.pos.z); Cam.yaw = dampAng(Cam.yaw, ty, 4.5, rdt); Cam.pitch = damp(Cam.pitch, clamp(.44 - ld * .013, .22, .44) + (lk.boss ? .05 : 0), 2.2, rdt); }
  else if (!Input.locked && !Input.drag && !Input.touch && Pl.moveMag > .3 && Pl.state === 'free') { const d = angDiff(Cam.yaw, Pl.moveYaw); if (Math.abs(d) < 2.4) Cam.yaw += d * Math.min(1, rdt * .9); }
  Cam.dist = damp(Cam.dist, Cam.distT, 4, rdt); Cam.shake = Math.max(0, Cam.shake - rdt * 1.8);
  const cp = Math.cos(Cam.pitch), sp = Math.sin(Cam.pitch), ry = Pl.rig.P.rootY || 0;
  _v1.set(Pl.pos.x, 1.55 + ry * .6, Pl.pos.z); if (lk) { _v1.x += (lk.pos.x - Pl.pos.x) * .2; _v1.z += (lk.pos.z - Pl.pos.z) * .2; } Cam.look.lerp(_v1, 1 - Math.exp(-14 * rdt));
  _v2.set(Cam.look.x - Math.sin(Cam.yaw) * cp * Cam.dist, Cam.look.y + sp * Cam.dist + .35, Cam.look.z - Math.cos(Cam.yaw) * cp * Cam.dist);
  collideCam(_v2);
  Cam.pos.copy(_v2); const s = Cam.shake * Cam.shake * 1.3 * setting('shake'); _v3.set(Cam.look.x, Cam.look.y + .15, Cam.look.z);
  // 处决特写：镜头绕到两人侧面贴近，事后再缓缓退回
  Cam.execK = damp(Cam.execK || 0, Pl.state === 'exec' ? 1 : 0, Pl.state === 'exec' ? 8 : 4, rdt);
  if (Cam.execK > .002 && Pl.execE) {
    const e = Pl.execE, fx = e.pos.x - Pl.pos.x, fz = e.pos.z - Pl.pos.z, fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl, mx = (Pl.pos.x + e.pos.x) / 2, mz = (Pl.pos.z + e.pos.z) / 2, k = smooth(Cam.execK);
    _v1.set(mx + uz * 3.4 - ux * 1.5, 1.7 + e.hitY * .3, mz - ux * 3.4 - uz * 1.5); collideCam(_v1); Cam.pos.lerp(_v1, k); _v1.set(mx, .95 + e.hitY * .35, mz); _v3.lerp(_v1, k);
  }
  cam.position.set(Cam.pos.x + rand(-s, s), Cam.pos.y + rand(-s, s), Cam.pos.z + rand(-s, s)); cam.lookAt(_v3);
  const tf = 52 + (Pl.state === 'dodge' ? 5 : 0) + (Pl.speedN > 1.2 ? 4 : 0) + (Pl.state === 'ult' ? 6 : 0) - 8 * (Cam.execK || 0); Cam.fov = damp(Cam.fov, tf, 6, rdt); cam.fov = Cam.fov; cam.updateProjectionMatrix();
}

