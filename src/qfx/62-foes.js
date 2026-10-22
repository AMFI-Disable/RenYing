/* ---------------- 第二、三章的新敌人与首领阶段 ---------------- */
/* 飞剑剑灵：一柄悬空的剑，没有人形 */
function makeSpirit(o) {
  const rig = { kind: 'blade', phase: rand(TAU), bones: [] }; rigBase(rig);
  const root = rig.root = new T.Group(), inner = rig.inner = group(0, 0, 0, root), pivot = rig.pivot = group(0, 0, 0, inner);
  const w = makeWeapon('sword', rig); pivot.add(w.group); w.group.rotation.x = PI / 2; w.group.position.z = -.5;
  rig.bladeMat.emissive.set(o.glow || 0x3affc0); rig.bladeMat.userData.em0.set(o.glow || 0x3affc0).multiplyScalar(.55); rig.bladeLen = w.len; rig.bladeBase = w.base;
  const halo = new T.Mesh(sphG(.2, 10, 8), new T.MeshBasicMaterial({ color: o.glow || 0x3affc0, transparent: true, opacity: .15, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })); halo.userData.own = true; halo.position.z = -.5; pivot.add(halo); rig.halo = halo;
  root.scale.setScalar(o.scale || 1.6); rig.finish();
  rig.bladePts = function (base, tip) { this.pivot.updateWorldMatrix(true, false); base.set(0, 0, -.5 + this.bladeBase).applyMatrix4(this.pivot.matrixWorld); tip.set(0, 0, -.5 + this.bladeLen).applyMatrix4(this.pivot.matrixWorld); };
  rig.animate = function (dt, t, st) {
    let pull = 0, roll = Math.sin(t * 1.7 + this.phase) * .4, shake = 0;
    if (st.action) { const a = st.action; if (a.u < a.w) { pull = smooth(a.u / a.w); shake = pull; roll += pull * 6 * dt * 60 * 0; } else if (a.u < a.a) pull = -.4; else pull = .2 * (1 - (a.u - a.a) / (1 - a.a)); }
    this.inner.position.y = (st.rootY || 0) + 1.25 - (st.fall || 0) * 1.1; this.pivot.position.z = -pull * .55 + (shake ? rand(-.03, .03) : 0); this.pivot.rotation.z = roll + t * (st.action ? 9 : 2.2);
    this.pivot.rotation.x = (st.fall || 0) * 1.3 + (st.hurt || 0) * .6; this.halo.material.opacity = .1 + shake * .3 + Math.sin(t * 6 + this.phase) * .04;
  };
  const od = rig.dispose; rig.dispose = () => { halo.material.dispose(); od(); };
  return rig;
}

Object.assign(ET, {
  assassin: {
    name: '刺客', hp: 92, spd: 4.6, r: .42, xp: 14, gold: [4, 8], poise: 1.3, mass: .9, reach: 2.4,
    rig: () => makeHumanoid({ colors: { robe: 0x1c1f26, trim: 0x34283a, sash: 0x6a1a22, skin: skinA, hair: 0x0c0c0e, pants: 0x16181c, boots: 0x0e0f11 }, head: 'hood', face: { glow: '#ff5a3a' }, sleeves: true, bracer: true, skirt: .5, weapon: 'sword', stance: [-.3, 1.0, .2, -.4, .5, .7] }),
    atks: [{ kind: 'melee', anim: 'sweepRL', max: 2.6, wind: .4, act: .14, rec: .2, dmg: 9, shape: { t: 'arc', r: 2.8, arc: 2.4 }, lunge: 1.6, cd: 2.2, chain: 1 },
    { kind: 'melee', anim: 'sweepLR', max: 0, wind: .28, act: .14, rec: .6, dmg: 9, shape: { t: 'arc', r: 2.8, arc: 2.4 }, lunge: 1.2, cd: 0, only: 'chain' },
    { kind: 'melee', anim: 'thrust', min: 3, max: 6.5, wind: .55, act: .2, rec: .7, dmg: 13, shape: { t: 'line', len: 6, w: 1.2 }, lunge: 4.6, cd: 4.5, tele: true },
    { kind: 'shoot', anim: 'cast', min: 6, max: 16, wind: .6, act: .08, rec: .5, dmg: 6, n: 3, dart: true, cd: 5.5 },
    { kind: 'blink', anim: 'cast', min: 5, max: 20, wind: .3, act: .05, rec: .05, dmg: 0, cd: 7, behind: true, chain: 0 }]
  },
  slave: {
    name: '剑奴', hp: 150, spd: 2.9, r: .45, xp: 16, gold: [4, 9], poise: 2.6, mass: 1.3, reach: 2.6, revive: true,
    rig: () => makeHumanoid({ colors: { robe: 0x3c4240, trim: 0x22272a, sash: 0x4a2a24, skin: 0x8a948e, hair: 0x2a2c2c, pants: 0x262a2a, boots: 0x161818, eye: 0x5affc8 }, head: 'hood', face: { glow: '#5affc8' }, sleeves: true, skirt: .6, armor: true, weapon: 'saber', pauldron: 0x4a4c4a, stance: [-.36, 1.1, .12, -.2, .8, .3] }),
    atks: [{ kind: 'melee', anim: 'chop', max: 2.8, wind: .62, act: .16, rec: .25, dmg: 13, shape: { t: 'arc', r: 2.9, arc: 1.6 }, lunge: 1.2, cd: 2.4, tele: true, chain: 1 },
    { kind: 'melee', anim: 'sweepLR', max: 0, wind: .42, act: .16, rec: .25, dmg: 12, shape: { t: 'arc', r: 3, arc: 2.6 }, lunge: 1, cd: 0, only: 'chain', chain: 2 },
    { kind: 'melee', anim: 'thrust', max: 0, wind: .5, act: .16, rec: .9, dmg: 16, shape: { t: 'line', len: 4, w: 1.2 }, lunge: 2.4, cd: 0, tele: true, only: 'chain' },
    { kind: 'dash', anim: 'dash', min: 4, max: 11, wind: .8, act: .26, rec: .9, dmg: 16, speed: 26, cd: 6 }]
  },
  spirit: {
    name: '剑灵', hp: 42, spd: 4.2, xp: 6, gold: [1, 3], poise: .6, mass: .5, keep: [4.5, 8], hitY: 1.25, r: .45, ghost: true, flier: true,
    rig: () => makeSpirit({}),
    atks: [{ kind: 'pounce', anim: 'thrust', min: 2.4, max: 8.5, wind: .7, act: .38, rec: .6, dmg: 9, speed: 22, cd: 2.6 }]
  },
  boss3: {
    name: '竹影 · 无相', hp: 4200, spd: 5.2, r: .55, xp: 260, gold: [140, 170], poise: 26, mass: 4, reach: 2.8, boss: true,
    rig: () => makeHumanoid({ colors: { robe: 0x24332f, trim: 0xd6d0c0, sash: 0x8a1a1a, skin: 0xcfc4b8, hair: 0x0e0e0e, pants: 0x18211f, boots: 0x0e1312 }, head: 'hat', face: { void: 1, glow: '#9ff0e0' }, scale: 1.2, sleeves: 'long', skirt: .9, weapon: 'sword', cape: 0x1c2826, capeRag: true, stance: [-.36, .95, .05, -.3, -.4, -.7] }),
    atks: [{ kind: 'melee', anim: 'sweepRL', max: 3.4, wind: .4, act: .14, rec: .14, dmg: 18, shape: { t: 'arc', r: 3.8, arc: 2.8 }, lunge: 2, cd: 2, tele: true, chain: 1 },
    { kind: 'melee', anim: 'sweepLR', max: 0, wind: .3, act: .14, rec: .14, dmg: 18, shape: { t: 'arc', r: 3.8, arc: 2.8 }, lunge: 2, cd: 0, tele: true, only: 'chain', chain: 2 },
    { kind: 'melee', anim: 'thrust', max: 0, wind: .36, act: .16, rec: .75, dmg: 24, shape: { t: 'line', len: 5.6, w: 1.4 }, lunge: 3.4, cd: 0, tele: true, only: 'chain' },
    { kind: 'shoot', anim: 'cast', min: 5, max: 22, wind: .55, act: .08, rec: .5, dmg: 12, n: 5, dart: true, cd: 5 },
    { kind: 'blink', anim: 'cast', min: 4, max: 30, wind: .28, act: .05, rec: .05, dmg: 0, cd: 6.5, behind: true, chain: 0 },
    { kind: 'clones', anim: 'roar', max: 99, wind: .8, act: .1, rec: .4, dmg: 0, cd: 999, only: 'script' },
    { kind: 'spikes', anim: 'cast', min: 3, max: 26, wind: .7, act: .2, rec: .7, dmg: 22, cd: 7, phase2: true }]
  },
  clone: {
    name: '无相 · 影', hp: 1, spd: 5, r: .55, xp: 0, gold: [0, 0], poise: 1, mass: 2, reach: 2.8, ghost: true,
    rig: () => { const r = ET.boss3.rig(); r.setOpacity(.55); return r; },
    atks: [{ kind: 'melee', anim: 'sweepRL', max: 3.4, wind: .5, act: .14, rec: .6, dmg: 10, shape: { t: 'arc', r: 3.6, arc: 2.6 }, lunge: 1.8, cd: 2.6, tele: true },
    { kind: 'shoot', anim: 'cast', min: 5, max: 20, wind: .7, act: .08, rec: .6, dmg: 7, n: 3, dart: true, cd: 5.5 }]
  },
});
ET.boss1.atks.push({ kind: 'jars', anim: 'cast', min: 4, max: 24, wind: .7, act: .2, rec: .7, dmg: 18, cd: 6.5, phase2: true });
ET.boss2.atks.push({ kind: 'giants', anim: 'roar', min: 0, max: 40, wind: 1.1, act: .2, rec: 1, dmg: 30, cd: 11, phase3: true });
ET.boss2.atks[6].cd = 9;

/* 首领分阶段：血线跌破 at 时换阶段，播横幅、喘一口气，可能接一招剧本招式 */
const PHASES = {
  boss1: [{ at: .66, script: 4 }, { at: .45, up: true, banner: ['屠千山 · 狂怒', '火油罐，连环跳劈'] }, { at: .2, script: 4 }],
  boss2: [{ at: .5, up: true, banner: ['剑魔入魔', '剑雨倾城'], cd: 6 }, { at: .22, up: true, banner: ['万剑同悲', '巨剑自天而落'], cd: 7 }],
  boss3: [{ at: .5, up: true, banner: ['无相 · 分影', '真身只有一个'], script: 5 }, { at: .22, up: true, banner: ['无相 · 竹海', '竹刺破土'], script: 5 }],
};
function bossPhase(e) {
  const P = PHASES[e.type]; if (!P) return; e.pi = e.pi || 0; const ph = P[e.pi];
  if (!ph || e.hp >= e.maxHp * ph.at || e.state === 'stagger' || e.execd || e.state === 'windup' || e.state === 'active') return;
  e.pi++; cancelAttack(e);
  if (ph.up) { e.phase++; FX.ring(e.pos, 1, 12, 0xff2a1a, .8); FX.smoke(e.pos, 30, 2, .1); Cam.shake = .6; Snd.gong(); }
  if (ph.banner) UI.banner(ph.banner[0], ph.banner[1], 'red');
  if (ph.cd !== undefined) for (let i = 0; i < e.cfg.atks.length; i++) if (e.cfg.atks[i].phase2 || e.cfg.atks[i].phase3) e.cds[i] = Math.min(e.cds[i], 1.2);
  if (ph.script !== undefined) startAttack_E(e, ph.script); else { e.state = 'recover'; e.st = 0; e.rec = 1; }
}
/* 新招式 */
const FOE_ATK = {
  clones(e, a) {
    FX.smoke(e.pos, 30, 1.6, .08); Snd.cast(); const n = e.phase >= 3 ? 3 : 2; for (const o of G.enemies) if (o.clone && o.state !== 'dead') killEnemy(o);
    for (let i = 0; i < n; i++) { const an = rand(TAU), r = rand(6, 10), p = new V3(Pl.pos.x + Math.cos(an) * r, 0, Pl.pos.z + Math.sin(an) * r); collide(p, .6); const c = spawnEnemy('clone', p.x, p.z); c.clone = true; c.name = e.name; c.dmgK = e.dmgK * .6; c.maxHp = c.hp = 1; c.life = 16; FX.smoke(c.pos, 14, 1.2, .08); }
    const an = rand(TAU), p = new V3(Pl.pos.x + Math.cos(an) * 9, 0, Pl.pos.z + Math.sin(an) * 9); collide(p, e.radius); e.pos.copy(p); FX.smoke(e.pos, 20, 1.4, .08);
  },
  spikes(e, a, dmg) {
    const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), rows = e.phase >= 3 ? 3 : 1;
    for (let r = 0; r < rows; r++) { const yaw = e.yaw + (r - (rows - 1) / 2) * .35, sx = Math.sin(yaw), sz = Math.cos(yaw); for (let i = 1; i <= 11; i++) G.hazards.push({ x: e.pos.x + sx * i * 1.9, z: e.pos.z + sz * i * 1.9, r: 1.3, delay: i * .07, t: 0, dur: .55, dmg, tele: null, kind: 'spike' }); }
    Snd.cast(); FX.dust({ x: e.pos.x + fx * 2, z: e.pos.z + fz * 2 }, 10, 1);
  },
  jars(e, a, dmg) {
    for (let i = 0; i < 3; i++) { const an = rand(TAU), r = i ? rand(2.5, 6) : rand(0, 1.5); G.hazards.push({ x: Pl.pos.x + Math.cos(an) * r + Pl.vel.x * .5, z: Pl.pos.z + Math.sin(an) * r + Pl.vel.z * .5, r: 2.6, delay: i * .15, t: 0, dur: 1, dmg, tele: null, kind: 'jar' }); }
    Snd.swing(1);
  },
  giants(e, a, dmg) {
    const n = 8, R = 6.5; G.hazards.push({ x: Pl.pos.x, z: Pl.pos.z, r: 3.2, delay: 0, t: 0, dur: 1.2, dmg, tele: null, kind: 'giant' });
    for (let i = 0; i < n; i++) { const an = i / n * TAU; G.hazards.push({ x: Pl.pos.x + Math.cos(an) * R, z: Pl.pos.z + Math.sin(an) * R, r: 3, delay: .5 + i * .12, t: 0, dur: 1.1, dmg, tele: null, kind: 'giant' }); }
    UI.toast('万剑落 · 看准空隙', 2); Snd.gong();
  },
};
/* 落地特效：竹刺、火油、巨剑各不相同 */
function hazardFx(h) {
  const q = { x: h.x, y: .3, z: h.z };
  if (h.kind === 'spike') { FX.sparks(q, 8, 0x9ac27a, 7, 6); FX.dust(q, 6, .7); for (let i = 0; i < 5; i++) { const a = rand(TAU), r = rand(.2, 1); FX.ink.emit({ x: h.x + Math.cos(a) * r, y: .2, z: h.z + Math.sin(a) * r, vy: rand(6, 10), life: .35, s0: .25, s1: .05, r: .35, g: .5, b: .22, a: .9, grav: 18 }); } Cam.shake = Math.max(Cam.shake, .12); return; }
  if (h.kind === 'jar') { FX.ring(q, .4, h.r + .4, 0xff7a2a, .35); FX.sparks(q, 22, 0xff8a3a, 10, 5); FX.smoke(q, 10, 1.2, .1); GFX.flashAt(q, 0xff8a3a, 5); FX.decal(q, 2.6); Snd.boom(); Cam.shake = Math.max(Cam.shake, .3);
    Zones.push({ type: 'efire', x: h.x, z: h.z, r: 2.2, t: 0, life: 4, tick: .5, dmg: h.dmg * .25 }); return; }
  if (h.kind === 'giant') { FX.ring(q, .6, h.r + 1, 0xff3a22, .45); FX.pillar(q, 0xff3a22, 12); FX.dust(q, 24, 2); FX.decal(q, 4); GFX.flashAt(q, 0xff5a3a, 7); Cam.shake = Math.max(Cam.shake, .5); Snd.boom(); giantDrop(h); return; }
  FX.ring(q, .4, h.r + .4, 0xff3a22, .35); FX.sparks(q, 16, 0xff5a32, 10, 4); FX.pillar(q, 0xff3a22, 7); FX.decal(q, 2.4); Cam.shake = Math.max(Cam.shake, .25); Snd.hit(1);
}
/* 巨剑：插进地里停一会再散 */
let giantGeo = null;
function giantDrop(h) {
  if (!giantGeo) { giantGeo = new T.BoxGeometry(.5, 7, .12); giantGeo.translate(0, 3.5, 0); }
  const m = new T.Mesh(giantGeo, new T.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.position.set(h.x, -1.2, h.z); m.rotation.set(rand(-.15, .15), rand(TAU), rand(-.15, .15)); GFX.scene.add(m); let t = 0;
  FX.list.push({ update(dt) { t += dt; m.material.opacity = .9 * (1 - sat((t - .6) / .6)); if (t > 1.2) { GFX.scene.remove(m); m.material.dispose(); return false; } return true; } });
}
/* 敌方火地：火油罐留下的 */
function updateEFire(z, dt) {
  if (Math.random() < .7) { const a = rand(TAU), r = Math.sqrt(Math.random()) * z.r; FX.add.emit({ x: z.x + Math.cos(a) * r, y: .15, z: z.z + Math.sin(a) * r, vy: rand(1.4, 3), life: rand(.35, .6), s0: rand(.3, .6), s1: 0, r: 1, g: rand(.3, .5), b: .08, grav: -1.4 }); }
  if (z.tick <= 0) { z.tick = .5; if (Math.hypot(Pl.pos.x - z.x, Pl.pos.z - z.z) < z.r && Pl.iframe <= 0) hurtPlayer(z.dmg, z.x, z.z, { knock: 1, parry: false }); }
}
/* 剑奴倒地后会再爬起来，除非被处决或趁倒地再补一剑 */
function slaveDown(e) {
  e.revived = true; cancelAttack(e); e.state = 'down'; e.st = 0; e.hp = Math.round(e.maxHp * .4); e.stun = 2.4; e.stagger = 2.4; e.poiseD = 0; e.kx *= .3; e.kz *= .3;
  FX.num({ x: e.pos.x, y: e.hitY + 1.2, z: e.pos.z }, '未死', 'word', 1); FX.wisp({ x: e.pos.x, y: e.hitY, z: e.pos.z }, 0x5affc8, 10, 1.5); Snd.clang();
}
/* 每帧额外的敌人表现 */
function foeTick(e, dt) {
  if (e.clone && e.state !== 'dead' && (e.life -= dt) <= 0) killEnemy(e);
  if (e.type === 'spirit' && e.state !== 'dead' && Math.random() < .5) { e.rig.bladePts(_eb, _et); const k = rand(); FX.add.emit({ x: lerp(_eb.x, _et.x, k), y: lerp(_eb.y, _et.y, k), z: lerp(_eb.z, _et.z, k), life: .3, s0: .16, s1: 0, r: .3, g: 1, b: .78, grav: 0 }); }
  if (e.state === 'down' && Math.random() < .3) FX.add.emit({ x: e.pos.x + rand(-.4, .4), y: rand(.1, .5), z: e.pos.z + rand(-.4, .4), vy: rand(.5, 1.4), life: .5, s0: .2, s1: 0, r: .3, g: 1, b: .78, grav: -.3 });
}
