/* ---------------- 灵气珠 / 飞行物 / 波次 / 成长 ---------------- */
const Orbs = { list: [], mesh: null, m4: new T.Matrix4(), col: [new T.Color(.35, 1, .88), new T.Color(1, .78, .25), new T.Color(1, .3, .25)] };
function initOrbs(scene) { const m = Orbs.mesh = new T.InstancedMesh(new T.IcosahedronGeometry(.1, 0), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 500); m.count = 0; m.frustumCulled = false; m.setColorAt(0, Orbs.col[0]); scene.add(m); }
function spawnOrb(p, type, val) { if (Orbs.list.length >= 500) { collectOrb(Orbs.list.shift()); } const a = rand(TAU), s = rand(1.5, 5); Orbs.list.push({ x: p.x, y: rand(.8, 1.6), z: p.z, vx: Math.cos(a) * s, vy: rand(3, 7), vz: Math.sin(a) * s, type, val, age: 0 }); }
function collectOrb(o) { if (o.type === 0) gainXp(o.val); else if (o.type === 1) { Pl.gold += o.val; } else healPlayer(o.val); }
function updateOrbs(dt, t) {
  const L = Orbs.list, m = Orbs.mesh, range = 4.5 + 2.5 * pk('gold'), all = G.inter > 0 || G.queue.length === 0 && !G.enemies.some(e => e.state !== 'dead'); let n = 0, snd = 0;
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
function spawnWave(yaw, mult) { spawnProj({ kind: 'wave', x: Pl.pos.x + Math.sin(yaw) * .6, y: 1.15, z: Pl.pos.z + Math.cos(yaw) * .6, vx: Math.sin(yaw) * 28, vz: Math.cos(yaw) * 28, yaw, roll: rand(-.35, .35), life: .78, dmg: mult }); }
function killProj(p) { GFX.scene.remove(p.mesh); if (p.mesh.userData.own) p.mesh.material.dispose(); if (p.mesh.userData.mat) p.mesh.userData.mat.dispose(); }
const _pd = new V3();
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
      if (!p.done && Math.hypot(Pl.pos.x - p.x, Pl.pos.z - p.z) < 1.25) { p.done = true; hurtPlayer(p.dmg, p.x - p.vx, p.z - p.vz, { knock: 4 }); }
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
      if (Pl.attackActive && dd < 2.3) { dead = true; Snd.clang(); FX.sparks({ x: p.x, y: p.y, z: p.z }, 10, 0xffe0a0, 8); Pl.mp = Math.min(Pl.maxMp, Pl.mp + 3); }
      else if (!p.done && dd < .6) { p.done = true; if (hurtPlayer(p.dmg, p.x - p.vx, p.z - p.vz, { knock: 3 })) dead = true; }
    } else if (p.kind === 'orb') {
      const ta = Math.atan2(Pl.pos.x - p.x, Pl.pos.z - p.z), ca = Math.atan2(p.vx, p.vz), na = ca + clamp(angDiff(ca, ta), -p.turn * d, p.turn * d), sp = Math.hypot(p.vx, p.vz); p.vx = Math.sin(na) * sp; p.vz = Math.cos(na) * sp;
      p.x += p.vx * d; p.z += p.vz * d; p.y = 1.3 + Math.sin(p.t * 5) * .2; m.position.set(p.x, p.y, p.z); const dd = Math.hypot(Pl.pos.x - p.x, Pl.pos.z - p.z);
      if (Math.random() < .7) FX.add.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-.5, .5), vy: rand(-.5, .5), vz: rand(-.5, .5), life: .4, s0: .35, s1: 0, r: .7, g: .4, b: 1, grav: 0 });
      if (Pl.attackActive && dd < 2.6) { dead = true; FX.sparks({ x: p.x, y: p.y, z: p.z }, 10, 0xc48aff, 6); Snd.clang(); }
      else if (!p.done && dd < .75) { p.done = true; hurtPlayer(p.dmg, p.x - p.vx, p.z - p.vz, { knock: 3 }); dead = true; FX.sparks({ x: p.x, y: p.y, z: p.z }, 10, 0xc48aff, 6); }
    }
    if (Math.hypot(p.x, p.z) > 62) dead = true;
    if (dead) { killProj(p); G.projs.splice(i, 1); }
  }
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i]; h.t += dt * G.enemyTS; if (h.t >= h.delay && !h.tele) h.tele = FX.telegraph({ type: 'circle', x: h.x, z: h.z, r: h.r, dur: h.dur });
    if (h.t >= h.delay + h.dur) { const q = { x: h.x, y: .3, z: h.z }; FX.ring(q, .4, h.r + .4, 0xff3a22, .35); FX.sparks(q, 16, 0xff5a32, 10, 4); FX.pillar(q, 0xff3a22, 7); FX.decal(q, 2.4); Cam.shake = Math.max(Cam.shake, .25); Snd.hit(1); if (Math.hypot(Pl.pos.x - h.x, Pl.pos.z - h.z) < h.r + .2) hurtPlayer(h.dmg, h.x, h.z, { knock: 4 }); G.hazards.splice(i, 1); }
  }
}

/* ---- 波次 ---- */
const WAVES = [null, { bandit: 6 }, { bandit: 6, wolf: 4 }, { bandit: 7, wolf: 2, spear: 3 }, { wolf: 6, spear: 5, bandit: 3, brute: 1 }, { boss1: 1 }, { wraith: 4, bandit: 8, wolf: 4 }, { brute: 2, archer: 1, spear: 7, bandit: 4 }, { wolf: 8, wraith: 5, spear: 4, brute: 2 }, { brute: 3, wraith: 5, archer: 2, bandit: 9, spear: 5 }, { boss2: 1 }];
const WNAME = ['', '山贼探路', '狼嚎四野', '长枪列阵', '力士压阵', '黑风寨主', '幽魂夜行', '铁壁冷箭', '群妖乱舞', '倾巢而出', '剑魔临世'];
function startWave(n) {
  G.wave = n; G.inter = 0; G.bossDead = false; G.maxTokens = Math.min(4, 2 + Math.floor(n / 4)); G.cap = Math.min(13, 6 + Math.floor(n / 2)); G.tokens = 0; for (const e of G.enemies) e.token = false;
  let comp = WAVES[n];
  if (!comp) { comp = {}; if (n % 5 === 0) { comp[n % 10 === 0 ? 'boss2' : 'boss1'] = 1; } else { let b = 28 + (n - 10) * 5; const cost = { bandit: 1, wolf: 1, archer: 1.5, spear: 1.5, wraith: 2, brute: 4 }, ks = Object.keys(cost); while (b > 0) { const k = pick(ks); if (k === 'archer' && (comp.archer || 0) >= 2) continue; comp[k] = (comp[k] || 0) + 1; b -= cost[k]; } } }
  const q = []; for (const k in comp) for (let i = 0; i < comp[k]; i++) q.push(k); for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[q[i], q[j]] = [q[j], q[i]]; }
  G.queue = q; G.spawnT = 1.1; const boss = comp.boss1 || comp.boss2;
  UI.banner(boss ? WNAME[n] || '强敌再临' : `第${cnNum(n)}波`, boss ? ET[comp.boss1 ? 'boss1' : 'boss2'].name : (WNAME[n] || '无尽试炼'), boss ? 'red' : ''); if (!boss) Snd.gong();
}
function spawnFromQueue() {
  const type = G.queue.pop(), boss = ET[type].boss; let x, z, tries = 0;
  do { const a = rand(TAU), r = boss ? 15 : rand(13, 24); x = Pl.pos.x + Math.cos(a) * r; z = Pl.pos.z + Math.sin(a) * r; } while (Math.hypot(x, z) > ARENA_R - 3 && tries++ < 30);
  if (Math.hypot(x, z) > ARENA_R - 3) { const a = rand(TAU); x = Math.cos(a) * 20; z = Math.sin(a) * 20; }
  const p = new V3(x, 0, z); collide(p, 1); const eliteP = G.wave >= 4 ? Math.min(.28, .08 + .015 * (G.wave - 4)) : 0; spawnEnemy(type, p.x, p.z, { elite: Math.random() < eliteP });
}
function updateWaves(dt) {
  if (G.inter > 0) { G.inter -= dt; if (G.inter <= 0 || Input.hit('Enter')) { startWave(G.wave + 1); } return; }
  const alive = G.enemies.filter(e => e.state !== 'dead').length;
  if (G.queue.length && alive < G.cap) { G.spawnT -= dt; if (G.spawnT <= 0) { spawnFromQueue(); G.spawnT = alive < 3 ? .25 : .7; } }
  if (!G.queue.length && G.enemies.length === 0 && G.wave > 0 && Pl.state !== 'dead') {
    try { if (parent !== window) parent.postMessage({ qfx: 'wave', n: G.wave }, '*'); } catch (_) {}
    if (G.wave === 10 && !G.endless) { Game.victory(); return; }
    G.inter = 22; healPlayer(Pl.maxHp * .1); Pl.mp = Pl.maxMp; UI.banner('敌势暂歇', `第${cnNum(G.wave)}波已清`, 'gold'); Snd.level(); G.hazards.length = 0;
  }
}
function gainXp(v) {
  Pl.xp += v * (1 + .0 * 1);
  while (Pl.xp >= Pl.xpNeed) {
    Pl.xp -= Pl.xpNeed; Pl.lv++; recalc(); healPlayer(Pl.maxHp * .15); Pl.mp = Pl.maxMp; Pl.pending++; FX.pillar(Pl.pos, 0x62cdb9, 8); FX.ring(Pl.pos, .5, 7, 0x62cdb9, .7); Snd.level(); GFX.flashAt(Pl.pos, 0x9ff0e0, 5);
    FX.num({ x: Pl.pos.x, y: 2.5, z: Pl.pos.z }, `${cnNum(Pl.lv)}境`, 'word', 1.4);
    const un = SKILLS.find(s => s.lv === Pl.lv); if (un) UI.toast(`悟得剑技「${un.name}」`, 3.5);
  }
}

/* ---- 机缘 ---- */
const PERKS = [
  { id: 'atk', n: '锋锐', r: 1, max: 6, d: '剑锋加锐，攻击提高 15%。' }, { id: 'aspd', n: '疾风', r: 1, max: 5, d: '剑走疾风，出剑速度提高 10%。' }, { id: 'crit', n: '洞察', r: 1, max: 5, d: '目察破绽，暴击几率提高 8%。' },
  { id: 'critd', n: '破军', r: 2, max: 4, d: '一击破军，暴击伤害提高 35%。' }, { id: 'hp', n: '金钟', r: 1, max: 6, d: '身如金钟，生命上限 +30，并回复等量生命。' }, { id: 'leech', n: '汲魂', r: 2, max: 3, d: '剑饮敌血，造成伤害的 2.5% 化为生命。' },
  { id: 'mspd', n: '凌波', r: 1, max: 4, d: '踏波而行，移动速度 +8%，闪避更省体力。' }, { id: 'mp', n: '归元', r: 1, max: 4, d: '气归丹田，内力上限 +20，回复加快 50%。' },
  { id: 'wave', n: '剑气外放', r: 2, max: 3, d: '轻剑第四式「跃斩」落地，荡出一道剑气，每重多一道。' }, { id: 'thunder', n: '惊雷', r: 3, max: 3, d: '暴击时或有落雷应声而下，殃及周围敌人。' },
  { id: 'frost', n: '寒魄', r: 2, max: 3, d: '剑附寒魄，中者迟缓；对迟缓之敌伤害 +15%。' }, { id: 'burn', n: '焚心', r: 2, max: 3, d: '命中即燃，三息之内灼烧不止。' },
  { id: 'split', n: '分光', r: 2, max: 2, d: '「剑气纵横」多荡出两道剑气。' },
  { id: 'cdr', n: '剑心通明', r: 2, max: 3, d: '心念一动，剑技调息缩短 13%。' }, { id: 'shield', n: '护体真气', r: 3, max: 3, d: '真气自凝成罩，每隔一阵可挡一次伤害。' },
  { id: 'snow', n: '踏雪', r: 3, max: 2, d: '贴刃闪避成「踏雪」，数息之内伤害 +40%。' }, { id: 'wolf', n: '贪狼', r: 1, max: 3, d: '每斩一敌，回 4 点内力、2% 生命。' },
  { id: 'gold', n: '聚宝', r: 1, max: 3, d: '财气自聚，铜钱收获 +30%，拾取范围更广。' },
];
function offerPerks() {
  const pool = PERKS.filter(p => pk(p.id) < p.max && (!p.lv || Pl.lv >= p.lv)), out = [];
  while (out.length < 3 && pool.length) { let tw = 0; for (const p of pool) tw += [0, 55, 32, 14][p.r]; let r = Math.random() * tw, c = pool[0]; for (const p of pool) { r -= [0, 55, 32, 14][p.r]; if (r <= 0) { c = p; break; } } out.push(c); pool.splice(pool.indexOf(c), 1); }
  return out;
}
function takePerk(p) { Pl.perks[p.id] = pk(p.id) + 1; const hp0 = Pl.maxHp; recalc(); if (p.id === 'hp') Pl.hp = Math.min(Pl.maxHp, Pl.hp + 30); if (p.id === 'mp') Pl.mp = Pl.maxMp; if (p.id === 'shield') { Pl.shield = 1; } Snd.ui(); }
const SHOP = [
  { id: 'sword', n: () => '锻剑 · ' + cnNum(Pl.swordLv + 1) + '重', cost: () => Math.round(55 * Math.pow(1.5, Pl.swordLv)), max: () => Pl.swordLv >= 9, d: () => { const nt = SWORD_TIERS[Math.min(4, Math.floor((Pl.swordLv + 1) / 2))]; return '攻击 +13%。' + (nt !== swordTier() ? `剑身一振，蜕作「${nt.name}」。` : `手中仍是「${swordTier().name}」`); }, buy: () => { Pl.swordLv++; recalc(); setSwordTier(); Snd.forge(); } },
  { id: 'body', n: () => '淬体', cost: () => Math.round(45 * Math.pow(1.38, Pl.bodyLv)), max: () => Pl.bodyLv >= 10, d: () => '筋强骨壮，生命上限 +28，并回复三成生命。', buy: () => { Pl.bodyLv++; recalc(); healPlayer(Pl.maxHp * .3 + 28); Snd.ui(); } },
  { id: 'qi', n: () => '养气', cost: () => Math.round(45 * Math.pow(1.38, Pl.qiLv)), max: () => Pl.qiLv >= 8, d: () => '吐纳养气，内力上限 +22，回复更快。', buy: () => { Pl.qiLv++; recalc(); Pl.mp = Pl.maxMp; Snd.ui(); } },
  { id: 'pot', n: () => `回春丹（${Pl.pots}/5）`, cost: () => 35, max: () => Pl.pots >= 5, d: () => '一丸入喉，回复 45% 生命。', buy: () => { Pl.pots++; Snd.ui(); } },
];

