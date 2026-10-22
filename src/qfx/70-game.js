/* ---------------- 灵气珠 / 飞行物 / 成长 / 机缘 / 剑庐 ---------------- */
const Orbs = { list: [], mesh: null, m4: new T.Matrix4(), col: [new T.Color(.35, 1, .88), new T.Color(1, .78, .25), new T.Color(1, .3, .25)] };
function initOrbs(scene) { const m = Orbs.mesh = new T.InstancedMesh(new T.IcosahedronGeometry(.1, 0), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 500); m.count = 0; m.frustumCulled = false; m.setColorAt(0, Orbs.col[0]); scene.add(m); }
function spawnOrb(p, type, val) { if (Orbs.list.length >= 500) { collectOrb(Orbs.list.shift()); } const a = rand(TAU), s = rand(1.5, 5); Orbs.list.push({ x: p.x, y: rand(.8, 1.6), z: p.z, vx: Math.cos(a) * s, vy: rand(3, 7), vz: Math.sin(a) * s, type, val, age: 0 }); }
function collectOrb(o) { if (o.type === 0) gainXp(o.val); else if (o.type === 1) { Pl.gold += o.val; } else healPlayer(o.val); }
function updateOrbs(dt, t) {
  const L = Orbs.list, m = Orbs.mesh, range = 4.5 + 2.5 * pk('gold'), all = G.inter > 0 || G.clearT > 0 || G.queue.length === 0 && !G.enemies.some(e => e.state !== 'dead'); let n = 0, snd = 0;
  for (let i = L.length - 1; i >= 0; i--) {
    const o = L[i]; o.age += dt; const dx = Pl.pos.x - o.x, dy = 1.1 - o.y, dz = Pl.pos.z - o.z, d = Math.hypot(dx, dz);
    if (o.age > .45 && (d < range || all || o.pull) && Pl.state !== 'dead') { o.pull = true; const sp = Math.min(30, 8 + o.age * 22), l = Math.hypot(d, dy) || 1; o.vx = dx / l * sp; o.vy = dy / l * sp; o.vz = dz / l * sp; if (l < .7) { collectOrb(o); L.splice(i, 1); snd |= 1 << o.type; continue; } }
    else { o.vy -= 16 * dt; o.vx *= 1 - 2 * dt; o.vz *= 1 - 2 * dt; if (o.y < .35 && o.vy < 0) { o.y = .35; o.vy *= -.35; } }
    o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
    const sc = (o.type === 2 ? 1.5 : 1) * (1 + Math.sin(t * 8 + i) * .25); Orbs.m4.makeScale(sc, sc, sc); Orbs.m4.setPosition(o.x, o.y + Math.sin(t * 4 + i) * .06, o.z); m.setMatrixAt(n, Orbs.m4); m.setColorAt(n, Orbs.col[o.type]); n++;
  }
  m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  if (snd & 2) Snd.coin(); else if (snd) Snd.pick();
}

const PM = {};
function projMesh(kind) {
  const tr = swordTier();
  if (kind === 'wave' || kind === 'ewave') { const m = new T.Mesh(sectorGeo(1.7, .72), slashMat(kind === 'wave' ? tr.trail : 0xff3a22, 2)); m.material.uniforms.uStatic.value = 1; m.frustumCulled = false; m.renderOrder = 8; m.userData.own = true; return m; }
  if (kind === 'fly' || kind === 'rain' || kind === 'erain') {
    const g = new T.Group(), mat = new T.MeshBasicMaterial({ color: kind === 'erain' ? 0xff3a22 : tr.trail, toneMapped: false }); const k = kind === 'fly' ? 1 : 1.9;
    mesh(boxG(.05, .95, .014), mat, 0, 0, 0, g).scale.setScalar(k); mesh(boxG(.18, .03, .04), mat, 0, -.48 * k, 0, g).scale.setScalar(k); mesh(boxG(.03, .16, .03), mat, 0, -.58 * k, 0, g).scale.setScalar(k); g.userData.mat = mat; return g;
  }
  if (kind === 'arrow') { const g = new T.Group(); PM.wood = PM.wood || new T.MeshStandardMaterial({ color: 0x6a4a2e }); PM.tip = PM.tip || new T.MeshBasicMaterial({ color: 0xffb080, toneMapped: false }); mesh(cylG(.014, .014, .95, 4), PM.wood, 0, 0, 0, g); mesh(coneG(.035, .14, 4), PM.tip, 0, .52, 0, g); return g; }
  PM.orb = PM.orb || new T.MeshBasicMaterial({ color: 0xc48aff, toneMapped: false }); return new T.Mesh(sphG(.2, 10, 8), PM.orb);
}
function spawnProj(o) { const p = Object.assign({ t: 0, hit: new Set(), vx: 0, vy: 0, vz: 0, y: 1.2 }, o); p.mesh = projMesh(p.kind); GFX.scene.add(p.mesh); G.projs.push(p); return p; }
function spawnWave(yaw, mult) { mult *= 1 + .25 * pk('jiangang') + (reso('qi') >= 3 ? .3 : 0); spawnProj({ kind: 'wave', x: Pl.pos.x + Math.sin(yaw) * .6, y: 1.15, z: Pl.pos.z + Math.cos(yaw) * .6, vx: Math.sin(yaw) * 28, vz: Math.cos(yaw) * 28, yaw, roll: rand(-.35, .35), life: .78, dmg: mult }); }
function killProj(p) { GFX.scene.remove(p.mesh); if (p.mesh.userData.own) p.mesh.material.dispose(); if (p.mesh.userData.mat) p.mesh.userData.mat.dispose(); }
const _pd = new V3();
/* 弹反飞物：掉头飞回出手者（不在了就找最近的敌人），化作自己的剑气 */
function reflectProj(p) {
  const tg = p.src && p.src.state !== 'dead' ? p.src : nearestEnemy(p.x, p.z, 30), sp = Math.max(18, Math.hypot(p.vx, p.vz) * 1.6), a = tg ? Math.atan2(tg.pos.x - p.x, tg.pos.z - p.z) : Math.atan2(-p.vx, -p.vz);
  p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp; p.yaw = a; p.reflect = true; p.done = false; p.enemy = false; p.t = 0; p.life = 1.8; p.target = tg; p.turn = 6; p.dmg = (1.6 + (p.kind === 'ewave' ? .8 : 0)) * (1 + pk('jieli'));
  if (p.kind === 'ewave') p.mesh.material.uniforms.uCol.value.set(swordTier().trail);
  if (p.kind === 'orb') { PM.orbR = PM.orbR || new T.MeshBasicMaterial({ color: 0xbff4ff, toneMapped: false }); p.mesh.material = PM.orbR; }
}
function reflectHit(p, r) {
  for (const e of G.enemies) { if (e.state === 'dead' || p.hit.has(e)) continue; if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < r + e.radius) { p.hit.add(e); playerDamage(e, p.dmg, { knock: 4, poise: 3, shake: .12, stop: .05, critBonus: .5 }); Snd.hit(1); FX.sparks({ x: p.x, y: p.y, z: p.z }, 14, swordTier().trail, 9); if (p.kind !== 'ewave') return true; } }
  return false;
}
function updateProjs(dt, t) {
  const tr = swordTier();
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i], d = p.enemy ? dt * G.enemyTS : dt; p.t += d; let dead = p.t > p.life; const m = p.mesh;
    if (p.kind === 'wave') {
      p.x += p.vx * d; p.z += p.vz * d; const sc = 2.5; m.scale.setScalar(sc); m.rotation.set(0, p.yaw, p.roll, 'YXZ'); m.position.set(p.x - Math.sin(p.yaw) * sc * .9, p.y, p.z - Math.cos(p.yaw) * sc * .9); m.material.uniforms.uProg.value = sat((p.t - p.life + .22) / .22);
      for (const e of G.enemies) { if (e.state === 'dead' || p.hit.has(e)) continue; if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 2.0 + e.radius) { p.hit.add(e); if (playerDamage(e, p.dmg, { knock: 3.5, poise: 1.5, shake: .08, stop: .03 })) Snd.hit(0); } }
      if (Math.random() < .6) FX.wisp({ x: p.x, y: p.y, z: p.z }, tr.trail, 1, .5);
    } else if (p.kind === 'ewave') {
      p.x += p.vx * d; p.z += p.vz * d; const sc = 2.1; m.scale.setScalar(sc); m.rotation.set(0, p.yaw, .2, 'YXZ'); m.position.set(p.x - Math.sin(p.yaw) * sc * .9, p.y, p.z - Math.cos(p.yaw) * sc * .9); m.material.uniforms.uProg.value = sat((p.t - p.life + .25) / .25);
      if (p.reflect) reflectHit(p, 1.6);
      else if (!p.done && Math.hypot(Pl.pos.x - p.x, Pl.pos.z - p.z) < 1.25) { p.done = true; if (hurtPlayer(p.dmg, p.x - p.vx, p.z - p.vz, { knock: 4, src: p.src, proj: true }) === 'parry') reflectProj(p); }
    } else if (p.kind === 'fly') {
      if (p.t < p.delay) { p.ang += dt * 5.5; p.x = Pl.pos.x + Math.cos(p.ang) * 1.35; p.z = Pl.pos.z + Math.sin(p.ang) * 1.35; p.y = 1.7 + Math.sin(p.ang * 2) * .25; m.quaternion.identity(); }
      else {
        if (!p.go) { p.go = true; p.target = nearestEnemy(p.x, p.z, 26); const a = p.target ? Math.atan2(p.target.pos.x - p.x, p.target.pos.z - p.z) + rand(-.9, .9) : Pl.yaw + rand(-.4, .4); p.vx = Math.sin(a) * 18; p.vz = Math.cos(a) * 18; p.vy = 3; Snd.swing(0); }
        if (p.target && p.target.state === 'dead') p.target = nearestEnemy(p.x, p.z, 20);
        if (p.target) { const e = p.target; _pd.set(e.pos.x - p.x, e.hitY - p.y, e.pos.z - p.z); const l = _pd.length() || 1, sp = 32, k = 1 - Math.exp(-9 * dt); p.vx += (_pd.x / l * sp - p.vx) * k; p.vy += (_pd.y / l * sp - p.vy) * k; p.vz += (_pd.z / l * sp - p.vz) * k; if (l < e.radius + .7) { playerDamage(e, p.dmg, { knock: 2, poise: 1, shake: .06, stop: .02 }); Snd.hit(0); dead = true; } }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; _pd.set(p.vx, p.vy, p.vz).normalize(); m.quaternion.setFromUnitVectors(UP, _pd);
        FX.add.emit({ x: p.x, y: p.y, z: p.z, life: .25, s0: .22, s1: 0, r: m.userData.mat.color.r, g: m.userData.mat.color.g, b: m.userData.mat.color.b, grav: 0 });
      }
      m.position.set(p.x, p.y, p.z);
    } else if (p.kind === 'rain') {
      p.y -= 75 * dt; const k = sat(p.t / .22); p.x = lerp(p.x, p.tx, k); p.z = lerp(p.z, p.tz, k); m.position.set(p.x, p.y, p.z); m.rotation.x = PI;
      FX.add.emit({ x: p.x, y: p.y + 1, z: p.z, life: .2, s0: .3, s1: 0, r: m.userData.mat.color.r, g: m.userData.mat.color.g, b: m.userData.mat.color.b, grav: 0 });
      if (p.y <= .5) { dead = true; const q = { x: p.x, y: .4, z: p.z }; FX.ring(q, .3, 2.8, tr.trail, .3); FX.sparks(q, 8, tr.trail, 8, 3); FX.glow(q, 0xffffff, 2.4, .14); Cam.shake = Math.max(Cam.shake, .12); if (Math.random() < .5) Snd.hit(0); for (const e of G.enemies) if (e.state !== 'dead' && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 2.6 + e.radius) playerDamage(e, p.dmg, { knock: 1.5, poise: .8, noRage: true }); }
    } else if (p.kind === 'arrow') {
      p.x += p.vx * d; p.z += p.vz * d; m.position.set(p.x, p.y, p.z); _pd.set(p.vx, 0, p.vz).normalize(); m.quaternion.setFromUnitVectors(UP, _pd); const dd = Math.hypot(Pl.pos.x - p.x, Pl.pos.z - p.z);
      if (p.reflect) { if (reflectHit(p, .9)) dead = true; if (Math.random() < .5) FX.wisp({ x: p.x, y: p.y, z: p.z }, tr.trail, 1, .3); }
      else if (Pl.attackActive && dd < 2.3) { dead = true; Snd.clang(); FX.sparks({ x: p.x, y: p.y, z: p.z }, 10, 0xffe0a0, 8); Pl.mp = Math.min(Pl.maxMp, Pl.mp + 3); }
      else if (!p.done && dd < .6) { p.done = true; const r = hurtPlayer(p.dmg, p.x - p.vx, p.z - p.vz, { knock: 3, src: p.src, proj: true }); if (r === 'parry') reflectProj(p); else if (r) dead = true; }
    } else if (p.kind === 'orb') {
      const tx = p.reflect ? (p.target && p.target.state !== 'dead' ? p.target.pos : null) : Pl.pos, ta = tx ? Math.atan2(tx.x - p.x, tx.z - p.z) : Math.atan2(p.vx, p.vz), ca = Math.atan2(p.vx, p.vz), na = ca + clamp(angDiff(ca, ta), -p.turn * d, p.turn * d), sp = Math.hypot(p.vx, p.vz); p.vx = Math.sin(na) * sp; p.vz = Math.cos(na) * sp;
      p.x += p.vx * d; p.z += p.vz * d; p.y = 1.3 + Math.sin(p.t * 5) * .2; m.position.set(p.x, p.y, p.z); const dd = Math.hypot(Pl.pos.x - p.x, Pl.pos.z - p.z);
      if (Math.random() < .7) FX.add.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-.5, .5), vy: rand(-.5, .5), vz: rand(-.5, .5), life: .4, s0: .35, s1: 0, r: .7, g: .4, b: 1, grav: 0 });
      if (p.reflect) { if (reflectHit(p, 1)) dead = true; }
      else if (Pl.attackActive && dd < 2.6) { dead = true; FX.sparks({ x: p.x, y: p.y, z: p.z }, 10, 0xc48aff, 6); Snd.clang(); }
      else if (!p.done && dd < .75) { p.done = true; const r = hurtPlayer(p.dmg, p.x - p.vx, p.z - p.vz, { knock: 3, src: p.src, proj: true }); if (r === 'parry') reflectProj(p); else { dead = true; FX.sparks({ x: p.x, y: p.y, z: p.z }, 10, 0xc48aff, 6); } }
    }
    if (Math.hypot(p.x, p.z) > 62) dead = true;
    if (dead) { killProj(p); G.projs.splice(i, 1); }
  }
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i]; h.t += dt * G.enemyTS; if (h.t >= h.delay && !h.tele) h.tele = FX.telegraph({ type: 'circle', x: h.x, z: h.z, r: h.r, dur: h.dur });
    if (h.t >= h.delay + h.dur) { const q = { x: h.x, y: .3, z: h.z }; FX.ring(q, .4, h.r + .4, 0xff3a22, .35); FX.sparks(q, 16, 0xff5a32, 10, 4); FX.pillar(q, 0xff3a22, 7); FX.decal(q, 2.4); Cam.shake = Math.max(Cam.shake, .25); Snd.hit(1); if (Math.hypot(Pl.pos.x - h.x, Pl.pos.z - h.z) < h.r + .2) hurtPlayer(h.dmg, h.x, h.z, { knock: 4, parry: false }); G.hazards.splice(i, 1); }
  }
}

/* ---- 成长 ---- */
function gainXp(v) {
  Pl.xp += v * (1 + .0 * 1);
  while (Pl.xp >= Pl.xpNeed) {
    Pl.xp -= Pl.xpNeed; Pl.lv++; recalc(); healPlayer(Pl.maxHp * .15); Pl.mp = Pl.maxMp; Pl.pending++; FX.pillar(Pl.pos, 0x62cdb9, 8); FX.ring(Pl.pos, .5, 7, 0x62cdb9, .7); Snd.level(); GFX.flashAt(Pl.pos, 0x9ff0e0, 5);
    FX.num({ x: Pl.pos.x, y: 2.5, z: Pl.pos.z }, `${cnNum(Pl.lv)}境`, 'word', 1.4);
  }
}

/* ---- 机缘 ---- */
/* s 流派：qi 剑气 · lei 雷火 · shen 身法 · yi 剑意 · gen 根基；同派机缘合计三重、六重各有共鸣 */
const PERKS = [
  { id: 'atk', s: 'gen', n: '锋锐', r: 1, max: 6, d: '剑锋加锐，攻击提高 15%。' }, { id: 'aspd', s: 'qi', n: '疾风', r: 1, max: 5, d: '剑走疾风，出剑速度提高 10%。' }, { id: 'crit', s: 'lei', n: '洞察', r: 1, max: 5, d: '目察破绽，暴击几率提高 8%。' },
  { id: 'critd', s: 'lei', n: '破军', r: 2, max: 4, d: '一击破军，暴击伤害提高 35%。' }, { id: 'hp', s: 'gen', n: '金钟', r: 1, max: 6, d: '身如金钟，生命上限 +30，并回复等量生命。' }, { id: 'leech', s: 'gen', n: '汲魂', r: 2, max: 3, d: '剑饮敌血，造成伤害的 2.5% 化为生命。' },
  { id: 'mspd', s: 'shen', n: '凌波', r: 1, max: 4, d: '踏波而行，移动速度 +8%，闪避更省体力。' }, { id: 'mp', s: 'gen', n: '归元', r: 1, max: 4, d: '气归丹田，内力上限 +20，回复加快 50%。' },
  { id: 'wave', s: 'qi', n: '剑气外放', r: 2, max: 3, d: '轻剑末式「跃斩」与「破山」落地，荡出剑气，每重多一道。' }, { id: 'thunder', s: 'lei', n: '惊雷', r: 3, max: 3, d: '暴击时或有落雷应声而下，殃及周围敌人。' },
  { id: 'frost', s: 'lei', n: '寒魄', r: 2, max: 3, d: '剑附寒魄，中者迟缓；对迟缓之敌伤害 +15%。' }, { id: 'burn', s: 'lei', n: '焚心', r: 2, max: 3, d: '命中即燃，三息之内灼烧不止。' },
  { id: 'split', s: 'qi', n: '分光', r: 2, max: 2, d: '「剑气纵横」多荡出两道剑气。', need: 'qi' }, { id: 'jiangang', s: 'qi', n: '剑罡', r: 1, max: 3, d: '剑气凝罡，一切剑气伤害 +25%。' },
  { id: 'cdr', s: 'qi', n: '剑心通明', r: 2, max: 3, d: '心念一动，剑技调息缩短 13%。' }, { id: 'shield', s: 'gen', n: '护体真气', r: 3, max: 3, d: '真气自凝成罩，每隔一阵可挡一次伤害。' },
  { id: 'snow', s: 'shen', n: '踏雪', r: 3, max: 2, d: '贴刃闪避成「踏雪」，数息之内伤害 +40%。' }, { id: 'wolf', s: 'shen', n: '贪狼', r: 1, max: 3, d: '每斩一敌，回 4 点内力、2% 生命。' },
  { id: 'youshen', s: 'shen', n: '游身', r: 2, max: 3, d: '踏雪判定更宽，「瞬斩」伤害 +30%。' },
  { id: 'tingfeng', s: 'yi', n: '听风', r: 1, max: 3, d: '听风辨器，弹反时机放宽 0.05 息。' }, { id: 'huifeng', s: 'yi', n: '回锋', r: 2, max: 1, d: '弹反之后三息之内，下一剑必定暴击。' },
  { id: 'duanyue', s: 'yi', n: '断岳', r: 2, max: 3, d: '处决伤害 +30%，处决回复的生命多 4%。' }, { id: 'jieli', s: 'yi', n: '借力', r: 1, max: 2, d: '反弹回去的飞物伤害翻倍；接住飞物回 10 点内力。' },
  { id: 'gold', s: 'gen', n: '聚宝', r: 1, max: 3, d: '财气自聚，铜钱收获 +30%，拾取范围更广。' },
];
const SCHOOLS = {
  qi: { n: '剑气', c: '#62cdb9', r3: '剑气伤害 +30%', r6: '每一式轻剑都带出一道小剑气' },
  lei: { n: '雷火', c: '#e8874f', r3: '暴击必燃', r6: '每斩六剑，引落一道天雷' },
  shen: { n: '身法', c: '#9fc7e8', r3: '闪避省三成体力，踏雪判定更宽', r6: '踏雪时留下残影，一息后炸开' },
  yi: { n: '剑意', c: '#dcae55', r3: '格挡不再掉血', r6: '弹反时震出一圈剑气' },
  gen: { n: '根基', c: '#c9b48a', r3: '生命上限 +15%', r6: '每章一次，濒死回魂' },
};
function reso(s) { let n = 0; for (const p of PERKS) if (p.s === s) n += pk(p.id); return n; }
const cardW = r => [0, 55, 32, 14][r];
/* 破境三选一：机缘、剑谱、绝学混在一起。有空槽时前几次破境必出一张剑谱 */
function offerCards() {
  const pool = PERKS.filter(p => pk(p.id) < p.max && (!p.need || skLv(p.need))).map(p => ({ k: 'perk', p, w: cardW(p.r) }));
  const empty = Pl.slots.includes(null), skills = [];
  for (const id in SK) { const l = skLv(id); if (l ? l < 3 : empty) skills.push({ k: 'skill', id, w: l ? 22 : 30 }); }
  const ults = Pl.lv >= 5 && !Pl.ult ? Object.keys(ULT).map(id => ({ k: 'ult', id, w: 20 })) : [];
  const out = [];
  if (empty && skills.length && (Pl.lv <= 4 || Math.random() < .5)) { const c = wpick(skills.filter(c => !skLv(c.id))); if (c) out.push(c); }
  if (ults.length && Pl.lv >= 5 && (Pl.lv === 5 || Math.random() < .45)) out.push(wpick(ults));
  const all = pool.concat(skills, ults).filter(c => !out.some(o => o.k === c.k && (o.id || o.p) === (c.id || c.p)));
  while (out.length < 3 && all.length) { const c = wpick(all); out.push(c); all.splice(all.indexOf(c), 1); if (c.k === 'ult') for (let i = all.length - 1; i >= 0; i--) if (all[i].k === 'ult') all.splice(i, 1); }
  return out;
}
function wpick(a) { let tw = 0; for (const c of a) tw += c.w; let r = Math.random() * tw; for (const c of a) { r -= c.w; if (r <= 0) return c; } return a[a.length - 1]; }
function takeCard(c) {
  if (c.k !== 'perk') { learnSkill(c.id); Snd.ui(); return; }
  const p = c.p, s0 = reso(p.s); takePerk(p); const s1 = reso(p.s), S = SCHOOLS[p.s];
  if (s0 < 3 && s1 >= 3) UI.toast(`${S.n}共鸣 · 三重：${S.r3}`, 3.2); else if (s0 < 6 && s1 >= 6) UI.toast(`${S.n}共鸣 · 六重：${S.r6}`, 3.2);
}
function takePerk(p) { Pl.perks[p.id] = pk(p.id) + 1; const hp0 = Pl.maxHp; recalc(); Pl.hp = Math.min(Pl.maxHp, Pl.hp + Math.max(0, Pl.maxHp - hp0)); if (p.id === 'mp') Pl.mp = Pl.maxMp; if (p.id === 'shield') { Pl.shield = 1; } Snd.ui(); }
const SHOP = [
  { id: 'sword', n: () => '锻剑 · ' + cnNum(Pl.swordLv + 1) + '重', cost: () => Math.round(55 * Math.pow(1.5, Pl.swordLv)), max: () => Pl.swordLv >= 9, d: () => { const nt = SWORD_TIERS[Math.min(4, Math.floor((Pl.swordLv + 1) / 2))]; return '攻击 +13%。' + (nt !== swordTier() ? `剑身一振，蜕作「${nt.name}」。` : `手中仍是「${swordTier().name}」`); }, buy: () => { Pl.swordLv++; recalc(); setSwordTier(); Snd.forge(); } },
  { id: 'body', n: () => '淬体', cost: () => Math.round(45 * Math.pow(1.38, Pl.bodyLv)), max: () => Pl.bodyLv >= 10, d: () => '筋强骨壮，生命上限 +28，并回复三成生命。', buy: () => { Pl.bodyLv++; recalc(); healPlayer(Pl.maxHp * .3 + 28); Snd.ui(); } },
  { id: 'qi', n: () => '养气', cost: () => Math.round(45 * Math.pow(1.38, Pl.qiLv)), max: () => Pl.qiLv >= 8, d: () => '吐纳养气，内力上限 +22，回复更快。', buy: () => { Pl.qiLv++; recalc(); Pl.mp = Pl.maxMp; Snd.ui(); } },
  { id: 'pot', n: () => `回春丹（${Pl.pots}/5）`, cost: () => 35, max: () => Pl.pots >= 5, d: () => '一丸入喉，回复 45% 生命。', buy: () => { Pl.pots++; Snd.ui(); } },
];

