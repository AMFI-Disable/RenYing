/* ---------------- 开放世界：敌营、强敌、土地庙、宝箱、山河图 ----------------
   玩法照旧在 y=0 平面上算；这里只管"人走到哪儿，哪儿就活过来"。 */
const WS = { camps: [], shrine: 0, found: new Set([0]), beaten: new Set(), opened: new Set(), cleared: new Set(), region: null, regT: 0, chkT: 0, fight: null, wall: null, act: null, anims: [], saveT: 0 };
function worldSnap() { const s = Save.snap(); return Object.assign(s, { shrine: WS.shrine, found: [...WS.found], beaten: [...WS.beaten], opened: [...WS.opened], cleared: [...WS.cleared] }); }
function worldSave() { const d = Save.load(); d.world = worldSnap(); Save.write(); }
function wsLoad(s) {
  WS.camps = OW.CAMPS.map(() => ({ on: false, list: [] })); WS.fight = null; WS.region = null; WS.regT = 0; WS.chkT = 0; WS.act = null; WS.anims = []; WS.saveT = 0;
  WS.shrine = s ? s.shrine || 0 : 0; WS.found = new Set(s ? s.found : [0]); WS.beaten = new Set(s ? s.beaten : []); WS.opened = new Set(s ? s.opened : []); WS.cleared = new Set(s ? s.cleared : []);
}

/* ---------- 落脚 ---------- */
const shrineYaw = s => s.id === 0 ? PI : Math.atan2(-s.x, -s.z);
function placeAt(x, z, yaw) {
  const p = new V3(x, 0, z); collide(p, .5); Pl.pos.copy(p); Pl.vel.set(0, 0, 0); Pl.kx = Pl.kz = 0; Pl.yaw = Pl.yawT = yaw; Pl.lock = null;
  Cam.yaw = yaw; Cam.pitch = .3; Cam.look.set(p.x, 1.5, p.z); Cam.dist = Cam.distT = 7.4; Cam.gy = gH(p.x, p.z);
}
function placeShrine(id) { const s = OW.SHRINES[id], a = shrineYaw(s); placeAt(s.x + Math.sin(a) * 5, s.z + Math.cos(a) * 5, a); }

/* ---------- 敌营 ---------- */
function dropEnemy(e) {
  const i = G.enemies.indexOf(e); if (i < 0) return; releaseToken(e); if (e.tele) e.tele.cancel(); if (Pl.lock === e) Pl.lock = null;
  GFX.scene.remove(e.rig.root); e.rig.dispose(); if (e.trail) e.trail.dispose(); G.enemies.splice(i, 1);
}
function campSpawn(i) {
  const cp = OW.CAMPS[i], C = WS.camps[i], q = []; for (const k in cp.comp) for (let n = 0; n < cp.comp[k]; n++) q.push(k);
  const a0 = rand(TAU); C.on = true; C.list = q.map((type, n) => {
    const a = a0 + n / q.length * TAU + rand(-.3, .3), r = rand(2.5, 6.5), p = new V3(cp.x + Math.cos(a) * r, 0, cp.z + Math.sin(a) * r); collide(p, .6);
    const e = spawnEnemy(type, p.x, p.z, { lv: cp.lv, home: { x: p.x, z: p.z }, camp: i, elite: cp.lv >= 3 && n === 0 && Math.random() < .3 + cp.lv * .05 }); e.yaw = rand(TAU); return e;
  });
}
function campDrop(i) { const C = WS.camps[i]; for (const e of C.list) dropEnemy(e); C.on = false; C.list = []; }
/* 歇息、魂归之后，各处敌营重新聚拢 */
function campsReset() { for (let i = 0; i < WS.camps.length; i++) campDrop(i); WS.cleared.clear(); }
function updateCamps() {
  const px = Pl.pos.x, pz = Pl.pos.z;
  OW.CAMPS.forEach((cp, i) => {
    const C = WS.camps[i], d = Math.hypot(cp.x - px, cp.z - pz);
    if (!C.on) { if (d < 85 && !WS.cleared.has(i) && !WS.fight) campSpawn(i); return; }
    if (C.list.every(e => e.state === 'dead' || !G.enemies.includes(e))) {
      C.on = false; C.list = []; WS.cleared.add(i); const sg = addSoul(3 + cp.lv * 2); G.soulRun = (G.soulRun || 0) + sg;
      UI.toast(`敌营已破 · 剑魄 +${sg}`, 2.4); Snd.level(); healPlayer(Pl.maxHp * .08); WS.saveT = 1; return;
    }
    if (d > 140 && C.list.every(e => e.state === 'idle' || e.state === 'return' || e.state === 'dead')) campDrop(i);
  });
}

/* ---------- 强敌：踏进擂台就关门 ---------- */
let wallTex = null;
function arenaWall(x, z, r) {
  if (!wallTex) { const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(200,40,20,0)'); gr.addColorStop(.6, 'rgba(210,40,24,.12)'); gr.addColorStop(.92, 'rgba(230,60,30,.32)'); gr.addColorStop(1, 'rgba(255,110,60,.55)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); wallTex = new T.CanvasTexture(cv); }
  const m = new T.Mesh(new T.CylinderGeometry(r, r, 5, 96, 8, true), new T.MeshBasicMaterial({ map: wallTex, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false, blending: T.AdditiveBlending }));
  m.position.set(x, 1.6, z); m.renderOrder = 6; GFX.scene.add(m); return m;
}
function fightStart(i) {
  const B = OW.BOSSES[i]; for (let k = 0; k < WS.camps.length; k++) if (WS.camps[k].on) campDrop(k);
  for (const e of G.enemies.slice()) { FX.smoke(e.pos, 8, .8); dropEnemy(e); }
  World.arena = { x: B.x, z: B.z, r: B.r }; WS.wall = arenaWall(B.x, B.z, B.r);
  const a = Math.atan2(Pl.pos.x - B.x, Pl.pos.z - B.z) + PI, e = spawnEnemy(B.type, B.x + Math.sin(a) * 4, B.z + Math.cos(a) * 4, { lv: B.lv });
  WS.regT = 0; $('region').classList.remove('show');
  WS.fight = { i, e, t: 0, end: 0 }; G.bossDead = false; UI.banner(ET[B.type].name, B.n + ' · 无路可退', 'red');
}
function fightEnd(win) {
  const F = WS.fight; if (!F) return; World.arena = null;
  if (WS.wall) { GFX.scene.remove(WS.wall); WS.wall.geometry.dispose(); WS.wall.material.dispose(); WS.wall = null; }
  if (!win && F.e) dropEnemy(F.e); if (G.boss === F.e) G.boss = null; G.bossDead = false; WS.fight = null;
  if (win) {
    const B = OW.BOSSES[F.i]; WS.beaten.add(F.i); const sg = addSoul(B.lv * 14); G.soulRun = (G.soulRun || 0) + sg;
    UI.banner('强敌已诛', `${B.n} · 剑魄 +${sg}`, 'gold'); Snd.level(); worldSave();
    if (WS.beaten.size === OW.BOSSES.length) setTimeout(() => UI.banner('万剑归寂', '三大强敌尽诛 · 青云山重归清净', 'gold'), 4200);
  }
}
function updateFight(dt) {
  const F = WS.fight;
  if (!F) {
    if (Pl.state === 'dead') return;
    OW.BOSSES.forEach((B, i) => { if (!WS.fight && !WS.beaten.has(i) && Math.hypot(Pl.pos.x - B.x, Pl.pos.z - B.z) < B.r - 4) fightStart(i); });
    return;
  }
  F.t += dt; if (WS.wall) WS.wall.material.opacity = Math.min(1, F.t * 2) * (.75 + Math.sin(G.t * 3) * .25);
  if (G.bossDead || F.e.state === 'dead') { F.end += dt; if (F.end > 3) fightEnd(true); }
}

/* ---------- 土地庙、宝箱、区域 ---------- */
function nearShrine(r) { let best = null, bd = r; for (const s of OW.SHRINES) { const d = Math.hypot(Pl.pos.x - s.x, Pl.pos.z - s.z); if (d < bd) { bd = d; best = s; } } return best; }
function nearChest(r) { let best = null, bd = r; for (const c of OWD.chests || []) { if (WS.opened.has(c.id)) continue; const d = Math.hypot(Pl.pos.x - c.x, Pl.pos.z - c.z); if (d < bd) { bd = d; best = c; } } return best; }
function lidOpen(c, k) { const a = -1.9 * k; c.lid.rotation.x = a; c.lid.position.set(0, .6 - .35 * Math.sin(a), -.35 + .35 * Math.cos(a)); }
function chestsSync() { for (const c of OWD.chests || []) lidOpen(c, WS.opened.has(c.id) ? 1 : 0); }
function openChest(c) {
  WS.opened.add(c.id); WS.anims.push({ c, t: 0 }); Snd.coin(); const p = { x: c.x, z: c.z }, lv = c.lv;
  const gold = 20 + lv * 14, n = 6; for (let i = 0; i < n; i++) spawnOrb(p, 1, gold / n); for (let i = 0; i < 4; i++) spawnOrb(p, 0, (10 + lv * 8) / 4);
  FX.glow({ x: c.x, y: 1, z: c.z }, 0xffd080, 3, .5); FX.sparks({ x: c.x, y: .8, z: c.z }, 18, 0xffd080, 6, 3);
  const r = Math.random(); let msg;
  if (r < .3 && Pl.pots < 5) { Pl.pots++; msg = '回春丹一枚'; }
  else if (r < .55) { Pl.pending++; msg = '一页残谱（可悟机缘）'; }
  else { const sg = addSoul(6 + lv * 3); G.soulRun = (G.soulRun || 0) + sg; msg = `剑魄 ${sg}`; }
  UI.toast(`开箱 · 得铜钱 ${gold}、${msg}`, 2.6); worldSave();
}
function shrineOpen(s) {
  G.state = 'shrine'; unlock(); WS.shrine = s.id; Snd.gong(); const reg = regionAt(s.x, s.z);
  $('shT').firstChild.textContent = s.n; $('shS').textContent = reg ? reg.n + ' · ' + reg.sub : '香火未断，可歇脚';
  const host = $('tpList'); host.innerHTML = '';
  for (const o of OW.SHRINES) { if (!WS.found.has(o.id)) continue; const b = document.createElement('button'), rg = regionAt(o.x, o.z); b.type = 'button'; b.className = 'btn sm'; b.textContent = o.n + (rg ? ' · ' + rg.n : ''); b.disabled = o.id === s.id; b.onclick = () => worldTravel(o.id); host.appendChild(b); }
  $('shrine').hidden = false;
}
function shrineRest() {
  if (G.state !== 'shrine') return; healPlayer(Pl.maxHp, true); Pl.mp = Pl.maxMp; Pl.pots = Math.max(Pl.pots, 3 + up('dan')); campsReset(); worldSave();
  Snd.level(); FX.pillar(Pl.pos, 0xffd080, 3); UI.toast('歇息已毕 · 气血回满 · 已存档', 2.4); $('btnRest').textContent = '已歇息';
}
function shrineLeave() { if (G.state !== 'shrine') return; $('shrine').hidden = true; $('btnRest').textContent = '歇息 · 存档'; G.state = 'playing'; canvas.focus(); }
/* 传送：墨色一盖一揭 */
function worldTravel(id) {
  const s = OW.SHRINES[id], reg = regionAt(s.x, s.z); $('shrine').hidden = true; $('btnRest').textContent = '歇息 · 存档'; G.state = 'travel';
  travelShow({ idx: '传送', n: s.n, sub: reg ? reg.n : '', story: '心念一动，香火为引。' });
  setTimeout(() => {
    clearField(); WS.camps.forEach(C => { C.on = false; C.list = []; }); fightEnd(false); WS.shrine = id; placeShrine(id); healPlayer(Pl.maxHp, true); worldSave();
    setTimeout(() => { G.state = 'playing'; canvas.focus(); travelHide(); WS.region = null; }, window.__instant ? 0 : 900);
  }, window.__instant ? 0 : 650);
}
function regionAt(x, z) { let best = null, bk = 1.15; for (const r of OW.REG) { const k = Math.hypot(x - r.x, z - r.z) / r.r; if (k < bk) { bk = k; best = r; } } return best; }
function updateRegion(dt) {
  const r = regionAt(Pl.pos.x, Pl.pos.z); if (r) G.stage = r.lv;
  if (r && r !== WS.region) { WS.region = r; $('regT').textContent = r.n; $('regS').textContent = r.sub; $('region').classList.add('show'); WS.regT = 3.6; }
  if (WS.regT > 0) { WS.regT -= dt; if (WS.regT <= 0) $('region').classList.remove('show'); }
}
function worldInteract() {
  if (Pl.state === 'dead' || WS.fight && G.enemies.some(e => e.state !== 'dead')) return;
  const A = WS.act; if (!A) return; if (A.k === 'shrine') shrineOpen(A.o); else if (A.k === 'chest') openChest(A.o);
}
function updateWorld(dt) {
  G.atkGap = (G.atkGap || 0) - dt * G.enemyTS;
  updateRegion(dt); updateFight(dt);
  WS.chkT -= dt; if (WS.chkT <= 0) { WS.chkT = .25; updateCamps(); }
  // 土地庙走近即拜过，可传送
  const s = nearShrine(14); if (s && !WS.found.has(s.id)) { WS.found.add(s.id); WS.shrine = s.id; UI.banner('土地庙', s.n + ' · 已可传送至此', 'gold'); Snd.level(); worldSave(); }
  const fighting = G.enemies.some(e => e.state !== 'dead' && e.state !== 'idle' && e.state !== 'return');
  let act = null; if (!fighting && Pl.state !== 'dead') { const sh = nearShrine(6); if (sh) act = { k: 'shrine', o: sh }; else { const c = nearChest(2.6); if (c) act = { k: 'chest', o: c }; } }
  WS.act = act; const html = act ? (act.k === 'shrine' ? `<kbd>G</kbd>拜${act.o.n}` : '<kbd>G</kbd>开箱') : '';
  if (UI.c.actp !== html) { UI.c.actp = html; $('actp').innerHTML = html; $('actp').hidden = !act; }
  if (Input.hit('KeyG')) worldInteract();
  for (let i = WS.anims.length - 1; i >= 0; i--) { const A = WS.anims[i]; A.t += dt; lidOpen(A.c, easeOut(sat(A.t / .7))); if (A.t > .7) WS.anims.splice(i, 1); }
  if (WS.saveT > 0) { WS.saveT -= dt; if (WS.saveT <= 0) worldSave(); }
}

/* ---------- 进出世界 ---------- */
function worldEnter(fresh) {
  hideAll(); $('hud').hidden = true; $('touch').hidden = true; unlock(); G.state = 'travel'; Snd.init();
  const sv = !fresh && Save.world(), s0 = OW.SHRINES[sv ? sv.shrine || 0 : 0];
  travelShow(sv ? { idx: '青云山', n: '续行', sub: s0.n, story: '香火未冷，剑还在手。' } : { idx: '青云山', n: '入山', sub: '天地为局', story: '黑风寨夜袭山门，师门星散。山河辽阔，敌营、强敌、古寺剑冢都在等你，往哪儿走，由你。' });
  const t0 = performance.now();
  const go = () => {
    fightEnd(false); resetGame(); G.mode = 'world';
    if (sv) Save.applyRun(sv); else { Save.load().rec.runs++; applyMetaStart(); }
    wsLoad(sv || null); if (World.id !== 'open') World.build('open'); clearField();
    if (sv) placeShrine(WS.shrine); else placePlayer();
    applyQuality(); chestsSync(); G.maxTokens = 3; G.cap = 99; G.stage = 1; Pl.reviveUsed = false; Pl.rerolls = up('wu'); worldSave();
    try { GFX.renderer.compile(GFX.scene, GFX.camera); } catch (_) {}
    setTimeout(() => {
      $('hud').hidden = false; $('touch').hidden = !Input.touch; G.state = 'playing'; canvas.focus(); travelHide(); Snd.gong();
      if (!sv) setTimeout(() => UI.toast('G 拜庙开箱 · M 山河图 · 拜过的土地庙可传送', 6), 3800);
    }, window.__instant ? 0 : Math.max(0, 2600 - (performance.now() - t0)));
  };
  if (window.__instant) go(); else setTimeout(go, 650);
}
/* 魂归土地庙：境界、机缘都留着，只丢三成铜钱 */
function worldRespawn(died) {
  G.state = 'travel'; unlock(); const s = OW.SHRINES[WS.shrine];
  travelShow({ idx: died ? '剑折' : '回返', n: '魂归', sub: s.n, story: died ? '剑折人未亡。一缕香火引你魂归土地庙，遗落铜钱三成。' : '收剑回庙。' });
  setTimeout(() => {
    const snap = worldSnap(); if (died) { snap.gold = Math.floor(snap.gold * .7); Save.runEnd(false); }
    fightEnd(false); resetGame(); G.mode = 'world'; Save.applyRun(snap); wsLoad(snap); clearField(); campsReset();
    placeShrine(WS.shrine); G.maxTokens = 3; G.cap = 99; Pl.rerolls = up('wu'); worldSave(); $('pause').hidden = true;
    setTimeout(() => { $('hud').hidden = false; G.state = 'playing'; canvas.focus(); travelHide(); }, window.__instant ? 0 : 1600);
  }, window.__instant ? 0 : 650);
}

/* ---------- 山河图 ---------- */
let owMapImg = null;
function owMapRelief() {
  if (owMapImg) return owMapImg; const W = OWD.data, N = OW.N, S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), im = g.createImageData(S, S), d = im.data, L = [-.55, .7, -.45], ll = Math.hypot(...L);
  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const i = Math.min(N - 1, Math.round(v * (N - 1) / (S - 1))) * N + Math.min(N - 1, Math.round(u * (N - 1) / (S - 1))), sp = W.SP, h = W.H[i];
    const gr = sp[i * 4], rd = sp[i * 4 + 1], rk = sp[i * 4 + 2], ms = sp[i * 4 + 3], tc = W.TC;
    let r = (gr * 104 + ms * 84) * tc[i * 3] + rd * 176 + rk * 132, gg = (gr * 118 + ms * 100) * tc[i * 3 + 1] + rd * 156 + rk * 126, b = (gr * 70 + ms * 62) * tc[i * 3 + 2] + rd * 116 + rk * 116;
    const sh = .5 + .75 * Math.max(0, (W.NM[i * 3] * L[0] + W.NM[i * 3 + 1] * L[1] + W.NM[i * 3 + 2] * L[2]) / ll);
    r *= sh; gg *= sh; b *= sh;
    const lk = Math.hypot((u / S * 1024 - 512 - OW.LAKE.x) / OW.LAKE.rx, (v / S * 1024 - 512 - OW.LAKE.z) / OW.LAKE.rz);
    if (h < OW.WL && lk < 1.4 || W.WT[i] > .6) { const k = sat((OW.WL - h) / 4); r = lerp(96, 52, k); gg = lerp(124, 84, k); b = lerp(130, 104, k); }
    const c0 = Math.floor(h / 24); if (u && v && (Math.floor(W.H[i - 1] / 24) !== c0 || Math.floor(W.H[i - N] / 24) !== c0)) { r *= .8; gg *= .8; b *= .8; }
    // 宣纸底色混一点
    const o = (v * S + u) * 4; d[o] = r * .82 + 236 * .18; d[o + 1] = gg * .82 + 222 * .18; d[o + 2] = b * .82 + 192 * .18; d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0); return owMapImg = cv;
}
function mapOpen() { G.state = 'map'; unlock(); $('map').hidden = false; drawMap(); }
function mapClose() { if (G.state !== 'map') return; $('map').hidden = true; G.state = 'playing'; canvas.focus(); }
function drawMap() {
  const cv = $('mapc'), g = cv.getContext('2d'), S = cv.width, k = S / 1024, P = (x, z) => [(x - OW.x0) * k, (z - OW.z0) * k];
  g.drawImage(owMapRelief(), 0, 0, S, S); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '30px "Ma Shan Zheng", serif'; g.fillStyle = 'rgba(30,22,14,.72)'; for (const r of OW.REG) { const [x, y] = P(r.x, r.z); g.fillText(r.n, x, y - 34); }
  for (const c of OWD.chests || []) { if (WS.opened.has(c.id)) continue; const [x, y] = P(c.x, c.z); g.fillStyle = '#4ed08a'; g.fillRect(x - 3, y - 3, 6, 6); }
  OW.CAMPS.forEach((c, i) => { const [x, y] = P(c.x, c.z); g.fillStyle = WS.cleared.has(i) ? 'rgba(90,70,60,.6)' : '#c8321e'; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); });
  OW.BOSSES.forEach((B, i) => { const [x, y] = P(B.x, B.z); g.strokeStyle = WS.beaten.has(i) ? 'rgba(90,70,60,.7)' : '#e0281a'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, B.r * k, 0, TAU); g.stroke(); g.font = '600 15px "Noto Serif SC", serif'; g.fillStyle = g.strokeStyle; g.fillText(WS.beaten.has(i) ? '已诛' : ET[B.type].name.split(' · ')[0], x, y + B.r * k + 14); });
  for (const s of OW.SHRINES) { const [x, y] = P(s.x, s.z), f = WS.found.has(s.id); g.save(); g.translate(x, y); g.rotate(PI / 4); g.fillStyle = f ? '#e8b54a' : 'rgba(60,50,40,.5)'; g.fillRect(-6, -6, 12, 12); g.restore(); if (f) { g.font = '600 13px "Noto Serif SC", serif'; g.fillStyle = '#3a2a14'; g.fillText(s.n, x, y + 17); } }
  const [px, py] = P(Pl.pos.x, Pl.pos.z); g.save(); g.translate(px, py); g.rotate(-Pl.yaw + PI); g.fillStyle = '#16806e'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -13); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke(); g.restore();
}
/* 小地图：地形底图跟着镜头转 */
function owMini(g, c, k, rx, rz, fx, fz, P) {
  const img = owMapRelief(), s = 1024 / img.width, px = Pl.pos.x, pz = Pl.pos.z; g.save();
  g.setTransform(k * rx * s, -k * fx * s, k * rz * s, -k * fz * s, c + k * (rx * (OW.x0 - px) + rz * (OW.z0 - pz)), c - k * (fx * (OW.x0 - px) + fz * (OW.z0 - pz)));
  g.globalAlpha = .78; g.drawImage(img, 0, 0); g.restore();
  for (const s2 of OW.SHRINES) { const p = P(s2.x, s2.z); if (Math.hypot(p[0] - c, p[1] - c) > c) continue; g.fillStyle = WS.found.has(s2.id) ? '#e8b54a' : 'rgba(40,30,20,.6)'; g.fillRect(p[0] - 4, p[1] - 4, 8, 8); }
  for (const ch of OWD.chests || []) { if (WS.opened.has(ch.id)) continue; const p = P(ch.x, ch.z); g.fillStyle = '#4ed08a'; g.fillRect(p[0] - 2.5, p[1] - 2.5, 5, 5); }
  OW.BOSSES.forEach((B, i) => { if (WS.beaten.has(i)) return; const p = P(B.x, B.z); g.strokeStyle = '#e0281a'; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], B.r * k, 0, TAU); g.stroke(); });
}
