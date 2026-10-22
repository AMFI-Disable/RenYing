/* ---------------- 剑谱：Q/E/R 三槽剑技 + V 绝学 ---------------- */
/* 剑技从破境的三选一里得来：槽没满就学新的，满了只出已学的升重（最多三重） */
const SK = {
  qi: { n: '剑气纵横', g: '气', mp: 20, cd: 4, st: 'castQ', d: l => `横扫出 ${1 + 2 * (l - 1)} 道剑气，穿身而过。` },
  whirl: { n: '回风落雁', g: '风', mp: 30, cd: 9, st: 'whirl', d: l => `旋身成风 ${(1.3 + .3 * (l - 1)).toFixed(1)} 息，可走动、减伤一半，收势一震。` },
  fly: { n: '御剑术', g: '御', mp: 28, cd: 8, st: 'castR', d: l => `召出 ${5 + 2 * (l - 1)} 柄飞剑环身，片刻后各寻敌人。` },
  thunder: { n: '惊雷剑', g: '雷', mp: 26, cd: 7, st: 'skThunder', d: l => `引天雷劈向眼前之敌，再跳向近旁 ${2 + l} 人。` },
  fire: { n: '焚天', g: '焚', mp: 30, cd: 8, st: 'skFire', d: l => `向前斩出一道 ${9 + 2 * l} 步长的火痕，烧 ${3 + l} 息，踏入即燃。` },
  shadow: { n: '流影', g: '影', mp: 22, cd: 6, st: 'skShadow', d: l => `化作残影连闪 ${2 + l} 下，每闪一斩，期间刀枪不入。` },
  frost: { n: '寒江雪', g: '寒', mp: 32, cd: 11, st: 'skFrost', d: l => `寒气炸开，近身敌人冻住 ${(1.4 + .4 * l).toFixed(1)} 息，冻住即露破绽可处决。` },
  bell: { n: '金钟罩', g: '钟', mp: 24, cd: 14, st: 'skBell', d: l => `${3 + l} 息之内，接得住的招式全数自动弹开，接不住的减半。` },
};
const ULT = {
  wanjian: { n: '万剑归宗', g: '万', st: 'ult', d: '万剑自天而降，追着敌人落，最后一震荡开四周。' },
  leiting: { n: '雷霆万钧', g: '霆', st: 'ultL', d: '三息之内天雷连落，专劈敌人，头领也躲不开。' },
  wuying: { n: '无影', g: '影', st: 'ultW', d: '天地一静：四息半之内敌人几近停滞，你的每一剑伤害 +50%。' },
};
const skLv = id => (Pl.skLv && Pl.skLv[id]) || 0;
const slotDef = i => i === 3 ? (Pl.ult ? ULT[Pl.ult] : null) : (Pl.slots[i] ? SK[Pl.slots[i]] : null);
function learnSkill(id) {
  if (ULT[id]) { Pl.ult = id; UI.toast(`悟得绝学「${ULT[id].n}」· V 施展`, 3); return; }
  if (skLv(id)) { Pl.skLv[id]++; return; }
  const i = Pl.slots.indexOf(null); if (i < 0) return; Pl.slots[i] = id; Pl.skLv[id] = 1; Pl.cds[i] = 0; UI.toast(`悟得剑技「${SK[id].n}」· ${'QER'[i]} 施展`, 3);
}

/* 技能区域：焚天火痕等留在地上的东西 */
const Zones = [];
let fireTex = null;
function fireStrip(z) {
  if (!fireTex) { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in'; const gv = g.createLinearGradient(0, 0, 0, 256); gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(.08, '#000'); gv.addColorStop(.85, '#000'); gv.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gv; g.fillRect(0, 0, 64, 256); fireTex = new T.CanvasTexture(c); }
  const m = new T.Mesh(new T.PlaneGeometry(z.w * 1.3, z.len + 1), new T.MeshBasicMaterial({ map: fireTex, color: 0xff6a1a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.rotation.set(-PI / 2, Math.atan2(z.fx, z.fz), 0, 'YXZ');
  m.position.set(z.x + z.fx * z.len / 2, .06, z.z + z.fz * z.len / 2); m.renderOrder = 6; GFX.scene.add(m); return m;
}
function dropZone(z) { if (z.mesh) { GFX.scene.remove(z.mesh); z.mesh.geometry.dispose(); z.mesh.material.dispose(); } }
function clearZones() { for (const z of Zones) dropZone(z); Zones.length = 0; }
function updateZones(dt) {
  for (let i = Zones.length - 1; i >= 0; i--) {
    const z = Zones[i]; z.t += dt; z.tick -= dt; const fade = sat((z.life - z.t) / .6);
    if (z.type === 'efire') updateEFire(z, dt);
    if (z.type === 'fire') {
      if (!z.mesh) z.mesh = fireStrip(z); z.mesh.material.opacity = Math.min(1, z.t * 6) * fade * (.75 + Math.sin(z.t * 13) * .12 + Math.sin(z.t * 31) * .06);
      const n = Math.ceil(z.len * 1.1 * fade); for (let k = 0; k < n; k++) { if (Math.random() > .8) continue; const s = rand(z.len), w = rand(-z.w, z.w) * .5, x = z.x + z.fx * s + z.fz * w, zz = z.z + z.fz * s - z.fx * w;
        FX.add.emit({ x, y: .15, z: zz, vx: rand(-.3, .3), vy: rand(1.6, 3.6), vz: rand(-.3, .3), life: rand(.35, .7), s0: rand(.35, .7), s1: 0, r: 1, g: rand(.35, .6), b: .1, grav: -1.5 }); }
      if (z.tick <= 0) { z.tick = .35; for (const e of G.enemies) { if (e.state === 'dead') continue; const dx = e.pos.x - z.x, dz = e.pos.z - z.z, s = dx * z.fx + dz * z.fz, w = Math.abs(dx * z.fz - dz * z.fx); if (s > -.5 && s < z.len + .5 && w < z.w * .5 + e.radius) { playerDamage(e, z.dmg, { noProc: true, noRage: true, cls: 'fire' }); e.burnT = 3; e.burnDps = Math.max(e.burnDps, Pl.atk * .3 * z.lv); } } }
    }
    if (z.t >= z.life) { dropZone(z); Zones.splice(i, 1); }
  }
}

/* 金钟罩的光罩 */
let bellMesh = null;
function bellFx(on, t) {
  if (!bellMesh) { bellMesh = new T.Mesh(sphG(1.25, 24, 16), new T.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false })); bellMesh.renderOrder = 7; GFX.scene.add(bellMesh); }
  bellMesh.visible = on; if (!on) return; bellMesh.position.set(Pl.pos.x, 1.05, Pl.pos.z); bellMesh.scale.set(1, 1.15, 1); bellMesh.rotation.y = t * .8;
  bellMesh.material.opacity = (.1 + Math.sin(t * 6) * .03) * Math.min(1, Pl.bellT * 2);
}

/* 冻住：小卒精英定在原地露出破绽；头领只减速、掉架势 */
function freezeEnemy(e, dur) {
  if (e.state === 'dead') return;
  if (e.boss) { e.slowT = Math.max(e.slowT, dur * 2.2); e.poiseD += e.cfg.poise * .25; if (e.poiseD >= e.cfg.poise) breakPoise(e); return; }
  cancelAttack(e); e.state = 'stagger'; e.st = 0; e.stagger = dur; e.stun = dur; e.frozeT = dur; e.kx = e.kz = 0;
  FX.sparks({ x: e.pos.x, y: e.hitY, z: e.pos.z }, 12, 0xbfe8ff, 5, 2);
}

function boltOn(e, mult) { FX.bolt(e.pos); playerDamage(e, mult, { cls: 'bolt', knock: 1.5, poise: 2.5, noProc: true, stop: .03 }); }
/* 一条闪电链：先劈 first，再按远近跳 n 次，每跳隔一小会 */
function chainBolts(first, n, mult) {
  const hit = new Set([first]); let cur = first, delay = 0; boltOn(first, mult); Snd.bolt();
  for (let k = 0; k < n; k++) {
    const nx = nearestEnemy(cur.pos.x, cur.pos.z, 9, hit); if (!nx) break; hit.add(nx); const from = cur; cur = nx; delay += .09; let t = 0;
    FX.list.push({ update(dt) { t += dt; if (t < delay) return true; if (nx.state !== 'dead') { boltOn(nx, mult * .8); arcFx(from.pos, nx.pos); } return false; } });
  }
}
function arcFx(a, b) { for (let i = 0; i <= 10; i++) { const k = i / 10; FX.add.emit({ x: lerp(a.x, b.x, k) + rand(-.2, .2), y: 1.2 + Math.sin(k * PI) * .8 + rand(-.2, .2), z: lerp(a.z, b.z, k) + rand(-.2, .2), life: .18, s0: .3, s1: 0, r: .75, g: .85, b: 1, grav: 0 }); } }

/* 各剑技的状态：返回 [动作, 动画速率, 拖尾] */
const SKST = {
  skThunder(dt, c) {
    const u = Pl.st / .42; Pl.vel.x *= .8; Pl.vel.z *= .8;
    if (!Pl.fired && u >= .4) { Pl.fired = true; const tg = (Pl.lock && Pl.lock.state !== 'dead' && Math.hypot(Pl.lock.pos.x - Pl.pos.x, Pl.lock.pos.z - Pl.pos.z) < 18) ? Pl.lock : pickTarget(Pl.yaw, 18, 1.4) || nearestEnemy(Pl.pos.x, Pl.pos.z, 14);
      rig0().bladePts(_b, _t); FX.glint(_t, 0xcfe0ff, 2); if (tg) chainBolts(tg, 2 + skLv('thunder'), 2.4); else { FX.bolt({ x: Pl.pos.x + Math.sin(Pl.yaw) * 4, z: Pl.pos.z + Math.cos(Pl.yaw) * 4 }); Snd.bolt(); } Cam.shake = Math.max(Cam.shake, .3); }
    if (u >= 1) Pl.state = 'free'; return [{ name: 'summon', u: Math.min(1, u) }, 26, false];
  },
  skFire(dt, c) {
    const u = Pl.st / .42; Pl.vel.x *= .8; Pl.vel.z *= .8;
    if (!Pl.fired && u >= .32) { Pl.fired = true; const l = skLv('fire'), fx = Math.sin(Pl.yaw), fz = Math.cos(Pl.yaw), len = 9 + 2 * l;
      Zones.push({ type: 'fire', x: Pl.pos.x + fx * .8, z: Pl.pos.z + fz * .8, fx, fz, len, w: 2.4, t: 0, life: 3 + l, tick: 0, dmg: .55 + .2 * l, lv: l });
      FX.slash({ x: Pl.pos.x, y: .9, z: Pl.pos.z, yaw: Pl.yaw, roll: PI / 2, dir: -1, r: 3.4, arc: 2.4, color: 0xff7a2a, dur: .24, inten: 1.6 });
      for (let s = 1; s < len; s += 1.6) FX.decal({ x: Pl.pos.x + fx * s, z: Pl.pos.z + fz * s }, 1.5); GFX.flashAt({ x: Pl.pos.x + fx * 3, y: .6, z: Pl.pos.z + fz * 3 }, 0xff8a3a, 6); Snd.boom(); Cam.shake = Math.max(Cam.shake, .25); }
    if (u >= 1) Pl.state = 'free'; return [{ name: 'chop', u: Math.min(1, u), w: .25, a: .55 }, 32, u > .2 && u < .6];
  },
  skShadow(dt, c) {
    const n = 2 + skLv('shadow'), step = .15; Pl.vel.x = Pl.vel.z = 0; const k = Math.floor(Pl.st / step);
    if (k > Pl.tick && k <= n) {
      Pl.tick = k; const tg = nearestEnemy(Pl.pos.x, Pl.pos.z, 11, Pl.hitSet) || nearestEnemy(Pl.pos.x, Pl.pos.z, 11);
      const from = Pl.pos.clone(); let to;
      if (tg) { const a = Math.atan2(tg.pos.x - Pl.pos.x, tg.pos.z - Pl.pos.z), r = tg.radius + 1.1; to = new V3(tg.pos.x + Math.sin(a) * r, 0, tg.pos.z + Math.cos(a) * r); Pl.hitSet.add(tg); }
      else to = new V3(Pl.pos.x + Math.sin(Pl.yaw) * 4, 0, Pl.pos.z + Math.cos(Pl.yaw) * 4);
      collide(to, .42); const yaw = Math.atan2(to.x - from.x, to.z - from.z);
      for (const e of G.enemies) { if (e.state === 'dead') continue; const dx = e.pos.x - from.x, dz = e.pos.z - from.z, len = Math.hypot(to.x - from.x, to.z - from.z) || 1, s = (dx * Math.sin(yaw) + dz * Math.cos(yaw)), w = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)); if (s > -.5 && s < len + .5 && w < 1.2 + e.radius) playerDamage(e, 1.5, { melee: true, knock: 2, poise: 1.5, stop: .02, shake: .08 }); }
      for (let i = 0; i <= 10; i++) { const t = i / 10; FX.ink.emit({ x: lerp(from.x, to.x, t), y: rand(.5, 1.6), z: lerp(from.z, to.z, t), vy: rand(.1, .4), life: rand(.3, .6), s0: rand(.5, .9), s1: .1, r: .05, g: .05, b: .07, a: .55, grav: -.2 }); }
      FX.slash({ x: (from.x + to.x) / 2, y: 1.2, z: (from.z + to.z) / 2, yaw, roll: PI / 2 + rand(-.4, .4), r: 3, arc: .5, inner: .05, color: c.trail, dur: .16, inten: 1.6 });
      Pl.pos.copy(to); Pl.yaw = Pl.yawT = tg ? Math.atan2(tg.pos.x - to.x, tg.pos.z - to.z) : yaw; Snd.swing(0);
    }
    if (Pl.st >= (n + 1) * step) { Pl.state = 'free'; Pl.iframe = .25; }
    return [{ name: 'sweepRL', u: (Pl.st / step) % 1, w: .1, a: .6 }, 44, true];
  },
  skFrost(dt, c) {
    const u = Pl.st / .5; Pl.vel.x *= .7; Pl.vel.z *= .7;
    if (!Pl.fired && u >= .45) { Pl.fired = true; const l = skLv('frost'), R = 4.6 + .8 * l, dur = 1.4 + .4 * l;
      FX.ring(Pl.pos, .5, R + .5, 0xbfe8ff, .5); FX.ring(Pl.pos, .3, R * .6, 0xffffff, .35, .3); FX.sparks({ x: Pl.pos.x, y: .4, z: Pl.pos.z }, 50, 0xd8f2ff, 12, 3); FX.pillar(Pl.pos, 0xbfe8ff, 4); GFX.flashAt(Pl.pos, 0xbfe8ff, 7);
      for (let i = 0; i < 40; i++) { const a = rand(TAU), r = rand(1, R); FX.add.emit({ x: Pl.pos.x + Math.cos(a) * r, y: rand(.1, .8), z: Pl.pos.z + Math.sin(a) * r, vy: rand(.2, 1.2), life: rand(.6, 1.2), s0: rand(.2, .4), s1: 0, r: .75, g: .9, b: 1, grav: -.3 }); }
      for (const e of G.enemies) if (e.state !== 'dead' && Math.hypot(e.pos.x - Pl.pos.x, e.pos.z - Pl.pos.z) < R + e.radius) { playerDamage(e, 1.2, { noProc: true, knock: 0, poise: 0 }); freezeEnemy(e, dur); }
      Cam.shake = Math.max(Cam.shake, .35); Snd.boom(); Snd.clang(); }
    if (u >= 1) Pl.state = 'free'; return [{ name: 'summon', u: Math.min(1, u) }, 24, false];
  },
  skBell(dt, c) {
    const u = Pl.st / .4; Pl.vel.x *= .7; Pl.vel.z *= .7;
    if (!Pl.fired && u >= .35) { Pl.fired = true; Pl.bellT = 3 + skLv('bell'); FX.ring(Pl.pos, .4, 3, 0xffc860, .4); FX.pillar(Pl.pos, 0xffc860, 4); Snd.gong(); }
    if (u >= 1) Pl.state = 'free'; return [{ name: 'parry', u: Math.min(1, u * .4) }, 24, false];
  },
  /* 雷霆万钧：三息天雷 */
  ultL(dt, c) {
    const dur = 3.2, u = Pl.st / dur; Pl.vel.x = Pl.vel.z = 0; Pl.tick -= dt; Cam.distT = 10.5;
    if (u > .12 && u < .92 && Pl.tick <= 0) { Pl.tick = .16; const pool = G.enemies.filter(e => e.state !== 'dead' && Math.hypot(e.pos.x - Pl.pos.x, e.pos.z - Pl.pos.z) < 18);
      const e = pool.length ? pick(pool) : null; if (e) { boltOn(e, 2.1); } else { const a = rand(TAU), r = rand(3, 10); FX.bolt({ x: Pl.pos.x + Math.cos(a) * r, z: Pl.pos.z + Math.sin(a) * r }); }
      if (Math.random() < .6) Snd.bolt(); Cam.shake = Math.max(Cam.shake, .25); }
    if (Math.random() < .5) FX.wisp({ x: Pl.pos.x, y: 1.4, z: Pl.pos.z }, 0xcfe0ff, 2, 2);
    if (u >= 1) { Pl.state = 'free'; Pl.iframe = .5; Cam.distT = 7.4; } return [{ name: 'ult', u: Math.min(1, u * 1.1) }, 20, false];
  },
  /* 无影：天地一静 */
  ultW(dt, c) {
    const u = Pl.st / .55; Pl.vel.x *= .7; Pl.vel.z *= .7;
    if (!Pl.fired && u >= .5) { Pl.fired = true; Pl.wuyingT = 4.5; G.enemyTS = .06; G.slowT = 4.5; GFX.final.uniforms.uFlash.value = .3; FX.ring(Pl.pos, .5, 18, 0xffffff, .8, .4); Snd.flash(); }
    if (u >= 1) Pl.state = 'free'; return [{ name: 'charge', u: Math.min(1, u) }, 24, true];
  },
};
const rig0 = () => Pl.rig;

/* 剑意：命中、弹反、处决、踏雪都长，满了可放绝学 */
function gainRage(v) { if (!Pl.ult) return; const b = Pl.rage; Pl.rage = Math.min(100, Pl.rage + v); if (b < 100 && Pl.rage >= 100) { UI.toast(`剑意已满 · V「${ULT[Pl.ult].n}」`, 2); Snd.charged(); } }

/* 身法六重：踏雪时原地留一道残影，一息后炸开 */
function afterImage() {
  const p = { x: Pl.pos.x, y: 1, z: Pl.pos.z }; let t = 0, done = false; const tr = swordTier().trail;
  FX.list.push({ update(dt) {
    t += dt; if (Math.random() < .8) FX.add.emit({ x: p.x + rand(-.3, .3), y: rand(.3, 1.8), z: p.z + rand(-.3, .3), vy: .3, life: .3, s0: .4, s1: 0, r: .8, g: .95, b: 1, grav: 0 });
    if (!done && t > .9) { done = true; FX.ring(p, .4, 3.6, tr, .35); FX.sparks(p, 20, tr, 9); GFX.flashAt(p, 0xdff6ff, 4); Snd.boom();
      for (const e of G.enemies) if (e.state !== 'dead' && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 3.4 + e.radius) playerDamage(e, 2.4, { knock: 5, poise: 3, noRage: true }); return false; }
    return true; } });
}
