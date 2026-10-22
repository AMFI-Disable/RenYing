/* ---------------- 场景框架：三张地图轮换；第一章 · 山门（试剑坪） ---------------- */
const World = { colliders: [], lamps: [], fires: [], R: 46.5, id: '', root: null, grass: null, tick: null };
const MAPS = {};
World.update = (dt, t, focus) => { WIND_U.uPlayer.value.copy(focus); if (World.tick) World.tick(dt, t, focus); };
/* 拆掉当前地图：几何、材质、贴图全部释放（共用的几何缓存除外） */
World.clear = () => {
  const r = World.root; World.colliders.length = 0; World.lamps.length = 0; World.fires.length = 0; World.grass = null; World.tick = null; World.root = null; World.id = '';
  for (const k of ['inWater', 'leaves', 'smokes', 'runes', 'giants']) World[k] = null; World.rage = 1;
  if (!r) return; GFX.scene.remove(r);
  const geos = new Set(), mats = new Set(), texs = new Set();
  r.traverse(o => {
    if (o.isInstancedMesh && o.dispose) o.dispose();
    if (o.geometry && !o.geometry.userData.cached) geos.add(o.geometry);
    if (o.material) for (const m of [].concat(o.material)) { mats.add(m); for (const k of ['map', 'normalMap', 'emissiveMap', 'alphaMap']) if (m[k]) texs.add(m[k]); }
  });
  geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); texs.forEach(t => t.dispose());
};
World.build = id => {
  World.clear(); const m = MAPS[id]; World.id = id; World.R = m.R;
  const root = World.root = new T.Group(); GFX.scene.add(root); GFX.setEnv(m.env);
  if (window.__NOWORLD) { const gp = new T.Mesh(new T.CircleGeometry(m.R, 48).rotateX(-PI / 2), stdMat(0x8a857b)); gp.receiveShadow = true; root.add(gp); }
  else m.build(root);
};

function terrainH(x, z) {
  const r = Math.hypot(x, z); if (r < 49) return 0;
  const k = sstep(49, 130, r), n = fbm(x * .011 + 3.1, z * .011 - 7.7, 4);
  return k * (5 + 46 * n * n) + sstep(49, 60, r) * 1.1 * noise2(x * .13 + 5, z * .13);
}
function dirtAt(x, z) {
  const r = Math.hypot(x, z), n = fbm(x * .09 + 1.7, z * .09 + 4.2, 3);
  let d = 1 - sstep(20.2, 22.4 + 3 * n, r);
  if (r > 19 && r < 52) d = Math.max(d, 1 - sstep(.9, 2.2 + 1.6 * n, Math.min(Math.abs(x), Math.abs(z))));
  d = Math.max(d, sstep(.6, .72, fbm(x * .05 + 9.3, z * .05 - 2.1, 3)) * .8);
  return d;
}
function collide(p, rad) {
  for (const c of World.colliders) { const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + rad, d2 = dx * dx + dz * dz; if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; p.x += dx * k; p.z += dz * k; } }
  const r = Math.hypot(p.x, p.z), m = World.R - rad; if (r > m) { p.x *= m / r; p.z *= m / r; }
}

function texCourtyard() {
  const S = 1024, c = makeCanvas(S, S), g = c.getContext('2d'), R = S / 2, rng = mulberry(7);
  g.fillStyle = '#5d5952'; g.fillRect(0, 0, S, S); g.save(); g.translate(R, R);
  let r0 = 150; while (r0 < R - 4) {
    const w = 30 + rng() * 12, a = r0, b = Math.min(R, r0 + w), n = Math.round((a + b) * PI / (50 + rng() * 22)), off = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const t0 = off + i / n * TAU, t1 = off + (i + 1) / n * TAU, v = 112 + rng() * 50, warm = rng() * 12, gap = 1.6 / a;
      g.fillStyle = `rgb(${v + warm | 0},${v + warm * .5 | 0},${v - 6 | 0})`; g.beginPath(); g.arc(0, 0, b - 1.3, t0 + gap, t1 - gap); g.arc(0, 0, a + 1.3, t1 - gap, t0 + gap, true); g.closePath(); g.fill();
    } r0 = b;
  }
  g.fillStyle = '#7e7a70'; g.beginPath(); g.arc(0, 0, 150, 0, TAU); g.fill();
  g.strokeStyle = '#2c2b29'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 147, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 98, 0, TAU); g.stroke();
  const Rt = 86; g.fillStyle = '#c9c1ad'; g.beginPath(); g.arc(0, 0, Rt, 0, TAU); g.fill();
  g.fillStyle = '#26282a'; g.beginPath(); g.arc(0, 0, Rt, -PI / 2, PI / 2, false); g.arc(0, Rt / 2, Rt / 2, PI / 2, -PI / 2, true); g.arc(0, -Rt / 2, Rt / 2, PI / 2, -PI / 2, false); g.fill();
  g.fillStyle = '#c9c1ad'; g.beginPath(); g.arc(0, -Rt / 2, Rt / 7, 0, TAU); g.fill(); g.fillStyle = '#26282a'; g.beginPath(); g.arc(0, Rt / 2, Rt / 7, 0, TAU); g.fill();
  const tri = [7, 6, 5, 4, 0, 1, 2, 3]; g.fillStyle = '#2a2a29';
  for (let i = 0; i < 8; i++) {
    g.save(); g.rotate(i / 8 * TAU); g.translate(0, -122);
    for (let b = 0; b < 3; b++) { const y = (b - 1) * 11 - 3.5, solid = tri[i] >> b & 1; if (solid) g.fillRect(-19, y, 38, 7); else { g.fillRect(-19, y, 15, 7); g.fillRect(4, y, 15, 7); } }
    g.restore();
  }
  for (let i = 0; i < 16000; i++) { const a = rng() * TAU, r = Math.sqrt(rng()) * R; g.fillStyle = rng() < .5 ? 'rgba(0,0,0,.09)' : 'rgba(255,250,235,.07)'; g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 1 + rng() * 2.4, 1 + rng() * 2.4); }
  for (let i = 0; i < 46; i++) { const a = rng() * TAU, r = (.35 + .65 * Math.sqrt(rng())) * R, x = Math.cos(a) * r, y = Math.sin(a) * r, rr = 20 + rng() * 60, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, rng() < .6 ? 'rgba(52,70,38,.30)' : 'rgba(24,22,20,.26)'); gr.addColorStop(1, 'rgba(40,50,30,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  g.restore(); return c;
}
function texGround(S, span) {
  const c = makeCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = (x / S - .5) * span, wz = (y / S - .5) * span, n = fbm(wx * .09, wz * .09, 3), n2 = noise2(wx * 1.3, wz * 1.3), n3 = noise2(wx * 4.1 + 7, wz * 4.1), dt = dirtAt(wx, wz), sh = .8 + .28 * n2 + .12 * n3;
    const gr = lerp(52, 96, n) * sh, gg = lerp(76, 110, n) * sh, gb = lerp(34, 48, n) * sh, dr = (122 + 26 * n2) * (.86 + .2 * n3), dg = (98 + 20 * n2) * (.86 + .2 * n3), db = (70 + 14 * n2) * (.86 + .2 * n3), i = (y * S + x) * 4;
    d[i] = lerp(gr, dr, dt); d[i + 1] = lerp(gg, dg, dt); d[i + 2] = lerp(gb, db, dt); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
function texSoft(S = 128, noisy = false) {
  const c = makeCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = x / S - .5, v = y / S - .5, r = Math.hypot(u * 2, v * 2), i = (y * S + x) * 4; let a = Math.pow(sat(1 - r), 1.6); if (noisy) a *= .35 + .9 * fbm(x * .05, y * .09, 3); d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = sat(a) * 255; }
  g.putImageData(img, 0, 0); return c;
}
function texPlaque(text, w = 512, h = 180) {
  const c = makeCanvas(w, h), g = c.getContext('2d'); g.fillStyle = '#12233a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d6a94c'; g.lineWidth = 10; g.strokeRect(9, 9, w - 18, h - 18); g.lineWidth = 2; g.strokeRect(22, 22, w - 44, h - 44);
  g.fillStyle = '#e6bb5a'; g.font = `${h * .58}px "Ma Shan Zheng","STKaiti","Kaiti SC","KaiTi","Noto Serif CJK SC",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = text.length; for (let i = 0; i < n; i++) g.fillText(text[i], w * (.5 + (i - (n - 1) / 2) * (.8 / n)), h * .54); return c;
}
function roofMesh(W, D, H, mat) {
  const pr = [[1.04, .2], [.97, .07], [.88, .0], [.74, .08], [.56, .3], [.38, .6], [.24, .95], [.2, 1]].map(p => new T.Vector2(p[0], p[1] * H));
  const g = new T.LatheGeometry(pr, 4); g.rotateY(PI / 4); g.scale(W / 2 / .7071, 1, D / 2 / .7071); g.computeVertexNormals();
  const m = new T.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}

/* ---- 三张地图共用的布景件 ---- */
/* 远山：几层环形剪影，越远越淡，融进天际 */
function farMountains(scene, layers, horizonHex) {
  const horizon = new T.Color(horizonHex);
  for (const [rad, h0, h1, col, seed] of layers) {
    const N = 220, pos = [], cols = [], idx = [], c1 = new T.Color(col), c0 = c1.clone().lerp(horizon, .78);
    for (let i = 0; i <= N; i++) {
      const a = i / N * TAU, n = fbm(Math.cos(a) * 3.2 + seed, Math.sin(a) * 3.2 + seed, 5), rg = 1 - Math.abs(fbm(Math.cos(a) * 9 + seed, Math.sin(a) * 9, 3) * 2 - 1), h = lerp(h0, h1, n * .6 + rg * rg * .4);
      pos.push(Math.cos(a) * rad, -30, Math.sin(a) * rad, Math.cos(a) * rad, h, Math.sin(a) * rad); cols.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); g.setIndex(idx);
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, fog: false, side: T.DoubleSide, depthWrite: true })); m.frustumCulled = false; m.renderOrder = -5; scene.add(m);
  }
}
/* 草叶：三片交叉的叶面实例化；place(i) 返回 [x, y, z, 高, 宽, r, g, b] 或 null */
function grassBlades(scene, N, place, tries = 5) {
  const pos = [], col = [], nor = [], idx = [];
  for (let b = 0; b < 3; b++) { const a = b / 3 * PI + .3, ca = Math.cos(a), sa = Math.sin(a), o = pos.length / 3, lean = .22, w = .085; const pts = [[-w, 0, 0], [w, 0, 0], [-w * .62, .5, lean * .35], [w * .62, .5, lean * .35], [0, 1, lean]]; for (const p of pts) { pos.push(p[0] * ca - p[2] * sa, p[1], p[0] * sa + p[2] * ca); const k = .42 + .58 * p[1]; col.push(k, k, k); nor.push(0, 1, 0); } idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  const gm = new T.InstancedMesh(g, windMat(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), .075, 1, true), N), m4 = new T.Matrix4(), cc = new T.Color(), q = new T.Quaternion(), e = new T.Euler(), v = new V3(), sv = new V3(); let n = 0, k = 0;
  while (n < N && k++ < N * tries) {
    const r = place(); if (!r) continue;
    e.set(0, Math.random() * TAU, 0); q.setFromEuler(e); m4.compose(v.set(r[0], r[1], r[2]), q, sv.set(r[4], r[3], r[4])); gm.setMatrixAt(n, m4); cc.setRGB(r[5], r[6], r[7]); gm.setColorAt(n, cc); n++;
  }
  gm.count = n; gm.userData.full = n; gm.receiveShadow = true; gm.frustumCulled = false; scene.add(gm); World.grass = gm; return gm;
}
/* 飘落物（花瓣、竹叶、灰烬）：围着玩家 48 米见方循环 */
function fallingBits(scene, o) {
  const PN = o.n, mesh0 = new T.InstancedMesh(new T.PlaneGeometry(o.w, o.h), new T.MeshBasicMaterial({ color: o.color, side: T.DoubleSide, transparent: !!o.opacity, opacity: o.opacity || 1, depthWrite: !o.opacity }), PN); mesh0.frustumCulled = false; scene.add(mesh0);
  const pd = new Float32Array(PN * 5), fall = o.fall || .7, spin = o.spin || 2.4, dx = o.drift || [.9, .3], top = o.top || [7, 13];
  for (let i = 0; i < PN; i++) { pd[i * 5] = rand(-24, 24); pd[i * 5 + 1] = rand(0, top[1]); pd[i * 5 + 2] = rand(-24, 24); pd[i * 5 + 3] = rand(TAU); pd[i * 5 + 4] = rand(.5, 1.2); }
  const pm4 = new T.Matrix4(), pe = new T.Euler(), pq = new T.Quaternion(), pv = new V3(), ps = new V3(1, 1, 1);
  return (dt, focus) => {
    for (let i = 0; i < PN; i++) {
      const j = i * 5, sp = pd[j + 4]; pd[j + 3] += dt * spin * sp; pd[j + 1] -= dt * fall * sp; pd[j] += dt * (dx[0] + Math.sin(pd[j + 3] * .7) * .8); pd[j + 2] += dt * (dx[1] + Math.cos(pd[j + 3] * .5) * .6);
      if (pd[j + 1] < 0) { pd[j + 1] = rand(top[0], top[1]); pd[j] = focus.x + rand(-24, 24); pd[j + 2] = focus.z + rand(-24, 24); }
      if (pd[j] - focus.x > 24) pd[j] -= 48; else if (pd[j] - focus.x < -24) pd[j] += 48; if (pd[j + 2] - focus.z > 24) pd[j + 2] -= 48; else if (pd[j + 2] - focus.z < -24) pd[j + 2] += 48;
      pe.set(pd[j + 3], pd[j + 3] * .7, pd[j + 3] * 1.3); pq.setFromEuler(pe); pm4.compose(pv.set(pd[j], pd[j + 1], pd[j + 2]), pq, ps); mesh0.setMatrixAt(i, pm4);
    }
    mesh0.instanceMatrix.needsUpdate = true;
  };
}
/* 岚气：远处缓缓绕行的雾团 */
function mistRing(scene, o) {
  const mistT = canvasTex(texSoft(128, true)), mists = [];
  for (let i = 0; i < o.n; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: mistT, color: o.color, opacity: rand(o.op[0], o.op[1]), depthWrite: false, fog: !!o.fog, transparent: true })); const a = rand(TAU), r = rand(o.r[0], o.r[1]); sp.userData = { a, r, y: rand(o.y[0], o.y[1]), w: rand(.004, .012) * (o.speed || 1) }; sp.scale.set(rand(o.sx[0], o.sx[1]), rand(o.sy[0], o.sy[1]), 1); scene.add(sp); mists.push(sp); }
  return (dt, t) => { for (const m of mists) { const u = m.userData; u.a += u.w * dt; m.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * .2 + u.r) * .6, Math.sin(u.a) * u.r); } };
}

function buildGate(scene) {
  const rng = mulberry(20261009), R2 = (a, b) => a + rng() * (b - a);
  const q = new T.Quaternion(), e = new T.Euler(), v = new V3(), s = new V3(), UPV = new V3(0, 1, 0);
  const addCol = (x, z, r) => World.colliders.push({ x, z, r });
  const shadowAll = g => g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  /* 地面 */
  const tg = new T.PlaneGeometry(900, 900, 180, 180); tg.rotateX(-PI / 2);
  const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = terrainH(x, z); tp.setY(i, h - (Math.hypot(x, z) < 46 ? .2 : 0));
    const n = fbm(x * .03, z * .03, 3), rk = sstep(18, 46, h) * .8; tc[i * 3] = lerp(lerp(.16, .3, n), .36, rk); tc[i * 3 + 1] = lerp(lerp(.25, .36, n), .33, rk); tc[i * 3 + 2] = lerp(lerp(.1, .14, n), .32, rk);
  }
  tg.setAttribute('color', new T.BufferAttribute(tc, 3)); tg.computeVertexNormals();
  const terr = new T.Mesh(tg, stdMat(0xffffff, { vc: true, rough: 1 })); terr.receiveShadow = true; scene.add(terr);
  const inner = new T.Mesh(new T.PlaneGeometry(112, 112).rotateX(-PI / 2), stdMat(0xffffff, { map: canvasTex(texGround(768, 112)), rough: 1 })); inner.position.y = .01; inner.receiveShadow = true; scene.add(inner);
  const cyC = texCourtyard();
  const court = new T.Mesh(new T.CircleGeometry(20, 96).rotateX(-PI / 2), stdMat(0xffffff, { map: canvasTex(cyC), normalMap: canvasTex(normalFromCanvas(cyC, 2.6), false), ns: 1.1, rough: .78 }));
  court.position.y = .035; court.receiveShadow = true; scene.add(court);
  const curb = mesh(cylG(20.45, 20.6, .1, 96), stdMat(0x4e4b46, { rough: .9 }), 0, -.02, 0, scene); curb.receiveShadow = true;

  /* 远山（水墨层叠） */
  farMountains(scene, [[330, 70, 150, 0x6f6f86, 11], [470, 110, 210, 0x8e879a, 23], [640, 150, 300, 0xad9ea8, 37]], 0xcfb2a6);
  /* 石峰 */
  const peakMat = stdMat(0xffffff, { vc: true, flat: true, rough: 1 });
  for (let i = 0; i < 20; i++) {
    const a = R2(0, TAU), rad = R2(115, 300), h = R2(60, 150), rb = R2(9, 20), g = new T.CylinderGeometry(rb * R2(.35, .6), rb, h, 10, 9), p = g.attributes.position, cl = new Float32Array(p.count * 3);
    for (let j = 0; j < p.count; j++) {
      const x = p.getX(j), y = p.getY(j), z = p.getZ(j), n = fbm(x * .09 + i, y * .05 + z * .09, 3), k = .72 + n * .6, top = sstep(h * .28, h * .5, y);
      p.setXYZ(j, x * k + (n - .5) * 3, y + (top > .5 ? (n - .5) * 9 : 0), z * k); const gcol = top * (.4 + n * .6);
      cl[j * 3] = lerp(.34, .2, gcol); cl[j * 3 + 1] = lerp(.31, .31, gcol); cl[j * 3 + 2] = lerp(.33, .17, gcol);
    }
    g.setAttribute('color', new T.BufferAttribute(cl, 3)); g.computeVertexNormals();
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad; mesh(g, peakMat, x, terrainH(x, z) + h / 2 - 8, z, scene);
  }

  /* 批次 */
  const rockGeo = new T.IcosahedronGeometry(1, 1); { const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = .78 + .45 * hash2(Math.round(x * 31), Math.round(y * 17 + z * 53)); p.setXYZ(i, x * k, y * k * .8, z * k); } rockGeo.computeVertexNormals(); }
  const B = {
    bark: new Batch(cylG(.72, 1, 1, 7), stdMat(0x4a3628, { flat: true, rough: 1 })),
    blossom: new Batch(icoG(1, 1), stdMat(0xffffff, { flat: true, rough: .9, emissive: 0x7a3044, ei: .32 })),
    pine: new Batch(icoG(1, 1), stdMat(0xffffff, { flat: true, rough: 1 })),
    rock: new Batch(rockGeo, stdMat(0xffffff, { flat: true, rough: .95 })),
    wall: new Batch(boxG(1.7, .72, .95), stdMat(0xffffff, { rough: .95 })),
    stalk: new Batch(cylG(.8, 1, 1, 6), stdMat(0xffffff, { rough: .6 })),
    leaf: new Batch(icoG(1, 0), windMat(new T.MeshLambertMaterial({ color: 0xffffff }), .22, 3, false)),
  };
  const seg = (batch, a, b, r, col) => { v.subVectors(b, a); const l = v.length(); q.setFromUnitVectors(UPV, v.normalize()); batch.add(a.clone().lerp(b, .5), q.clone(), new V3(r, l, r), col); };
  const C = (h, sv, l) => new T.Color().setHSL(h, sv, l);

  function peach(x, z, sc) {
    const p0 = new V3(x, 0, z), p1 = p0.clone().add(new V3(R2(-.5, .5), 1.5, R2(-.5, .5)).multiplyScalar(sc)), p2 = p1.clone().add(new V3(R2(-.7, .7), 1.2, R2(-.7, .7)).multiplyScalar(sc));
    seg(B.bark, p0, p1, .3 * sc); seg(B.bark, p1, p2, .22 * sc);
    const nb = 5; for (let i = 0; i < nb; i++) {
      const a = i / nb * TAU + R2(0, .8), tip = p2.clone().add(new V3(Math.cos(a) * R2(1.4, 2.3), R2(.6, 1.7), Math.sin(a) * R2(1.4, 2.3)).multiplyScalar(sc)); seg(B.bark, p2, tip, .1 * sc);
      for (let k = 0; k < 3; k++) { e.set(R2(0, 3), R2(0, 3), R2(0, 3)); const r = R2(.6, 1.15) * sc; B.blossom.add(tip.clone().add(new V3(R2(-.7, .7), R2(-.2, .6), R2(-.7, .7)).multiplyScalar(sc)), new T.Quaternion().setFromEuler(e), new V3(r, r * .72, r), C(R2(.93, .97), R2(.7, .9), R2(.72, .86))); }
    }
    const r = 1.2 * sc; B.blossom.add(p2.clone().add(new V3(0, 1.3 * sc, 0)), null, new V3(r, r * .7, r), C(.95, .8, .8));
  }
  function pine(x, z, sc, y0 = 0) {
    const p0 = new V3(x, y0, z), lean = new V3(R2(-.6, .6), 0, R2(-.6, .6)), p1 = p0.clone().add(new V3(lean.x, 3.4, lean.z).multiplyScalar(sc)), p2 = p1.clone().add(new V3(lean.x * 1.5, 3, lean.z * 1.5).multiplyScalar(sc));
    seg(B.bark, p0, p1, .34 * sc, C(.04, .35, .3)); seg(B.bark, p1, p2, .24 * sc, C(.04, .35, .3));
    for (let i = 0; i < 6; i++) { const t = i / 5, a = R2(0, TAU), rr = lerp(2.1, .5, t) * sc, c = p1.clone().lerp(p2, t).add(new V3(Math.cos(a) * rr * .9, R2(.2, .6), Math.sin(a) * rr * .9)), w = lerp(2.3, 1.2, t) * sc * R2(.8, 1.15); seg(B.bark, p1.clone().lerp(p2, t), c, .08 * sc, C(.04, .35, .3)); e.set(R2(-.12, .12), R2(0, 3), R2(-.12, .12)); B.pine.add(c, new T.Quaternion().setFromEuler(e), new V3(w, w * .26, w), C(R2(.33, .4), R2(.35, .5), R2(.13, .2))); }
    const w = 1.5 * sc; B.pine.add(p2.clone().add(new V3(0, .5 * sc, 0)), null, new V3(w, w * .3, w), C(.36, .45, .18));
  }
  function rock(x, z, sc, y0 = 0) { e.set(R2(-.3, .3), R2(0, TAU), R2(-.3, .3)); const l = R2(.3, .44); B.rock.add(new V3(x, y0 + sc * .35, z), new T.Quaternion().setFromEuler(e), new V3(sc * R2(.9, 1.3), sc * R2(.8, 1.4), sc * R2(.9, 1.3)), new T.Color(l, l * .97, l * .94)); }

  [[27, .55], [33, 2.1], [29, 3.7], [36, 5.2], [39, 1.2], [41, 4.3], [26, 2.9]].forEach(([r, a]) => { const x = Math.cos(a) * r, z = Math.sin(a) * r, sc = R2(1.05, 1.4); peach(x, z, sc); addCol(x, z, .5); });
  [[42, .2], [43, 2.6], [42.5, 4.9]].forEach(([r, a]) => { const x = Math.cos(a) * r, z = Math.sin(a) * r; pine(x, z, 1.25); addCol(x, z, .6); });
  for (let i = 0; i < 16; i++) { const a = R2(0, TAU), r = R2(51, 68), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(x) < 12 && z < 0) continue; pine(x, z, R2(1.2, 2), terrainH(x, z) - .3); }
  [[31, 1.25, 1.5], [37, 2.75, 1.9], [34, 4.05, 1.3], [40, 5.6, 1.7], [30, 5.9, 1.1], [38, .75, 1.2]].forEach(([r, a, sc]) => { const x = Math.cos(a) * r, z = Math.sin(a) * r; rock(x, z, sc); rock(x + sc * .9, z + sc * .5, sc * .5); addCol(x, z, sc * 1.02); });
  for (let i = 0; i < 90; i++) { const a = R2(0, TAU), r = R2(49, 110), x = Math.cos(a) * r, z = Math.sin(a) * r; rock(x, z, R2(.4, 2.6) * (r > 70 ? 2 : 1), terrainH(x, z)); }

  // 残垣
  for (let c = 0; c < 3; c++) { const n = 178; for (let i = 0; i < n; i++) { const a = (i + (c % 2) * .5) / n * TAU, x = Math.cos(a) * 48.6, z = Math.sin(a) * 48.6; if (Math.abs(x) < 6.5) continue; if (rng() < [.06, .3, .68][c] + .25 * sstep(.5, .7, fbm(x * .08, z * .08, 2))) continue; e.set(R2(-.03, .03), -a + PI / 2 + R2(-.05, .05), R2(-.03, .03)); const l = R2(.34, .5); B.wall.add(new V3(x, .36 + c * .72 + terrainH(x, z) * .5, z), new T.Quaternion().setFromEuler(e), new V3(R2(.9, 1.05), 1, R2(.9, 1.1)), new T.Color(l, l * .98, l * .93)); } }

  // 竹林
  for (let cI = 0; cI < 30; cI++) {
    const a = R2(0, TAU), r = R2(52, 72), cx = Math.cos(a) * r, cz = Math.sin(a) * r; if (Math.abs(cx) < 16 && cz < 0) continue; if (Math.abs(cx) < 9 && cz > 0 && r < 60) continue;
    const n = 12 + (rng() * 12 | 0);
    for (let i = 0; i < n; i++) {
      const x = cx + R2(-4.5, 4.5), z = cz + R2(-4.5, 4.5), h = R2(8, 14), y0 = terrainH(x, z) - .2, top = new V3(x + R2(-1.2, 1.2), y0 + h, z + R2(-1.2, 1.2)), rr = R2(.06, .1);
      seg(B.stalk, new V3(x, y0, z), top, rr, C(R2(.24, .3), R2(.4, .55), R2(.3, .42)));
      for (let k = 0; k < 9; k++) { const t = R2(.4, 1.03), p = new V3(x, y0, z).lerp(top, t).add(new V3(R2(-.7, .7), R2(-.2, .3), R2(-.7, .7))); e.set(R2(-.7, .7), R2(0, 3), R2(-.7, .7)); const w = R2(.55, 1.1); B.leaf.add(p, new T.Quaternion().setFromEuler(e), new V3(w, w * .5, w * .75), C(R2(.24, .31), R2(.45, .62), R2(.26, .4))); }
    }
  }
  for (const k in B) B[k].build(scene);

  /* 草 */
  grassBlades(scene, 76000, () => {
    const r = Math.sqrt(rng()) * 74, a = rng() * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r; if (r < 20.5) return null; if (r > 50 && rng() < .55) return null; if (dirtAt(x, z) > .3 + rng() * .35) return null;
    const nn = fbm(x * .07, z * .07, 2); return [x, terrainH(x, z) - (r > 49 ? .1 : 0), z, (r > 49.5 ? R2(.45, .95) : R2(.2, .4)) * (.7 + nn * .6), R2(.9, 1.5), lerp(.2, .42, nn) + R2(0, .08), lerp(.36, .5, nn) + R2(0, .08), lerp(.1, .16, nn)];
  });

  /* 山门大殿 */
  const stone = stdMat(0x8f887c, { rough: .92 }), red = stdMat(0x8a2a20, { rough: .7 }), redD = stdMat(0x5e1c17, { rough: .8 }), tile = stdMat(0x27383c, { rough: .55, flat: true, side: T.DoubleSide, metal: .15 }), teal = stdMat(0x2a6660, { rough: .7 }), goldM = stdMat(0xc8962e, { rough: .35, metal: .8 }), dark = stdMat(0x1b1714, { rough: .9 });
  const tmp = group(0, 0, 0, scene);
  mesh(boxG(38, 3.4, 22), stone, 0, 1.5, -67.2, tmp);
  for (let i = 0; i < 8; i++) mesh(boxG(11, .4 * (i + 1), .9), stone, 0, .2 * (i + 1), -49.9 - .9 * i, tmp);
  for (const sx of [-1, 1]) { mesh(boxG(.8, 3.2, 8.2), stone, sx * 5.9, 1.4, -53, tmp).rotation.x = -.42; mesh(boxG(1.1, 1.3, 1.1), stone, sx * 5.9, .65, -49.2, tmp); }
  for (const z of [-58.6, -70.5]) for (let i = 0; i < 6; i++) mesh(cylG(.46, .5, 7, 12), red, -13.5 + i * 5.4, 6.7, z, tmp);
  mesh(boxG(27, 7, 9.5), redD, 0, 6.7, -65.6, tmp);
  for (let i = 0; i < 5; i++) { mesh(boxG(3.6, 5.2, .25), dark, -10.8 + i * 5.4, 5.9, -60.75, tmp); mesh(boxG(3.9, .25, .3), goldM, -10.8 + i * 5.4, 8.6, -60.75, tmp); }
  mesh(boxG(31, .9, 15), teal, 0, 10.6, -64.5, tmp); mesh(boxG(31.4, .22, 15.4), goldM, 0, 11.1, -64.5, tmp);
  const r1 = roofMesh(40, 23, 4.2, tile); r1.position.set(0, 11.1, -64.5); tmp.add(r1);
  mesh(boxG(18, 2.6, 8), redD, 0, 15.6, -64.5, tmp); mesh(boxG(19, .5, 9), teal, 0, 16.9, -64.5, tmp);
  const r2 = roofMesh(27, 15, 4.6, tile); r2.position.set(0, 17.1, -64.5); tmp.add(r2);
  mesh(boxG(8.4, .7, .7), goldM, 0, 21.9, -64.5, tmp); for (const sx of [-1, 1]) { const o = mesh(coneG(.5, 1.8, 5), goldM, sx * 4.3, 22.5, -64.5, tmp); o.rotation.z = -sx * .5; }
  const plq = new T.Mesh(new T.PlaneGeometry(6.4, 2.2), new T.MeshStandardMaterial({ map: canvasTex(texPlaque('青云剑宗')), roughness: .6, emissive: 0x3a2a10, emissiveIntensity: .5 })); plq.position.set(0, 12.6, -57.2); plq.rotation.x = .2; tmp.add(plq);
  const lanternMat = stdMat(0xff5a2a, { emissive: 0xff4a1e, ei: 1.9, rough: .6 });
  for (let i = 0; i < 4; i++) { const x = -8.1 + i * 5.4; const l = mesh(sphG(.5, 12, 8), lanternMat, x, 9.1, -57.6, tmp); l.scale.set(1, 1.2, 1); mesh(cylG(.02, .02, 1.6, 4), dark, x, 10.3, -57.6, tmp); mesh(cylG(.22, .22, .12, 8), goldM, x, 9.72, -57.6, tmp); World.lamps.push(l); }
  for (const sx of [-1, 1]) { const x = sx * 8.2, z = -57.4; mesh(cylG(.25, .4, 1.3, 8), dark, x, 3.85, z, tmp); mesh(cylG(.75, .4, .5, 10), dark, x, 4.7, z, tmp); mesh(cylG(.62, .62, .1, 10), stdMat(0xff7a2a, { emissive: 0xff6a1a, ei: 2.6 }), x, 4.93, z, tmp); World.fires.push(new V3(x, 5.1, z)); }
  // 后山宝塔
  { const px = -44, pz = -104, py = terrainH(px, pz) - 1, pg = group(px, py, pz, tmp); let y = 0; for (let i = 0; i < 7; i++) { const w = 10 - i * 1.05; mesh(boxG(w, 4, w), i % 2 ? redD : red, 0, y + 2, 0, pg); const rf = roofMesh(w + 5, w + 5, 2.2, tile); rf.position.y = y + 4; pg.add(rf); y += 5.2; } mesh(coneG(.6, 6, 6), goldM, 0, y + 2.5, 0, pg); }
  shadowAll(tmp); plq.castShadow = false;

  /* 牌坊 */
  const gate = group(0, 0, 51.5, scene);
  for (const [x, h] of [[-8.2, 6], [-3.4, 8], [3.4, 8], [8.2, 6]]) { mesh(cylG(.42, .46, h, 10), red, x, h / 2, 0, gate); mesh(boxG(1.3, .9, 1.3), stone, x, .45, 0, gate); }
  mesh(boxG(8.2, .8, .7), teal, 0, 7.2, 0, gate); mesh(boxG(8.2, .6, .6), red, 0, 5.9, 0, gate);
  for (const sx of [-1, 1]) { mesh(boxG(5.2, .7, .6), teal, sx * 5.8, 5.3, 0, gate); const rf = roofMesh(6.6, 2.6, 1.1, tile); rf.position.set(sx * 5.8, 5.7, 0); gate.add(rf); }
  const gr = roofMesh(10.4, 3.2, 1.5, tile); gr.position.set(0, 7.6, 0); gate.add(gr);
  const gp = new T.Mesh(new T.PlaneGeometry(3.4, 1.25), new T.MeshStandardMaterial({ map: canvasTex(texPlaque('试剑坪', 400, 150)), roughness: .6, emissive: 0x3a2a10, emissiveIntensity: .5 })); gp.position.set(0, 6.55, -.4); gp.rotation.y = PI; gate.add(gp);
  shadowAll(gate); gp.castShadow = false;

  /* 石灯 */
  const lampGlow = stdMat(0xffb060, { emissive: 0xff9a3a, ei: 2.4 }), capM = stdMat(0x55524c, { rough: .9, flat: true, side: T.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + PI / 6, x = Math.cos(a) * 21.7, z = Math.sin(a) * 21.7, g = group(x, 0, z, scene); g.rotation.y = -a;
    mesh(boxG(.8, .28, .8), stone, 0, .14, 0, g); mesh(cylG(.15, .2, 1.25, 8), stone, 0, .9, 0, g); mesh(boxG(.66, .14, .66), stone, 0, 1.58, 0, g);
    const gl = mesh(boxG(.4, .42, .4), lampGlow, 0, 1.86, 0, g); for (const [dx, dz] of [[-.22, -.22], [.22, -.22], [-.22, .22], [.22, .22]]) mesh(boxG(.07, .44, .07), stone, dx, 1.86, dz, g);
    const cp = roofMesh(1.05, 1.05, .4, capM); cp.position.y = 2.06; g.add(cp); mesh(sphG(.09, 8, 6), stone, 0, 2.52, 0, g);
    shadowAll(g); gl.castShadow = false; addCol(x, z, .55); World.lamps.push(gl);
    if (i % 2 === 0) { const pl = new T.PointLight(0xff9440, 1.5, 15, 2); pl.position.set(x * .97, 2.0, z * .97); scene.add(pl); World.lamps.push(pl); }
  }

  /* 落英 */
  const petals = fallingBits(scene, { n: 300, w: .1, h: .065, color: 0xf5b6c6 });
  /* 岚气 */
  const mist = mistRing(scene, { n: 12, color: 0xe8d2c8, op: [.06, .14], r: [80, 170], y: [3, 14], sx: [50, 100], sy: [10, 20] });

  let fireT = 0, emberT = 0;
  World.tick = (dt, t, focus) => {
    petals(dt, focus); mist(dt, t);
    const fl = 1 + Math.sin(t * 11) * .06 + Math.sin(t * 23.7) * .05; for (const l of World.lamps) { if (l.isPointLight) l.intensity = 1.5 * fl; }
    fireT -= dt; if (fireT < 0) { fireT = .035; for (const f of World.fires) FX.add.emit({ x: f.x + rand(-.3, .3), y: f.y, z: f.z + rand(-.3, .3), vx: rand(-.2, .2), vy: rand(1.2, 2.6), vz: rand(-.2, .2), life: rand(.4, .9), s0: rand(.5, .9), s1: .05, r: 1, g: rand(.4, .65), b: .12, a: .9, grav: -1 }); }
    emberT -= dt; if (emberT < 0) { emberT = .12; const a = rand(TAU), r = rand(4, 30); FX.add.emit({ x: focus.x + Math.cos(a) * r, y: rand(.2, 1), z: focus.z + Math.sin(a) * r, vx: rand(-.3, .3), vy: rand(.2, .7), vz: rand(-.3, .3), life: rand(2, 4), s0: .09, s1: .02, r: 1, g: .82, b: .45, a: .8, grav: -.1, wob: 1.5 }); }
  };
}

MAPS.gate = {
  R: 46.5, spawn: [0, 9, PI], build: buildGate,
  env: {
    fog: 0xb9a2a8, fogD: .0052, hemi: [0x93aede, 0x6f5a48, .78], sun: [0xffc48a, 1.22], sunDir: [-.72, .36, -.6], fill: [0x6f8fd0, .32], exp: 1.02,
    sky: { uZen: [.105, .19, .36], uMid: [.58, .47, .56], uHor: [.80, .63, .60], uHor2: [1.0, .70, .42], uGlow: [.32, .176, .08], uHalo: [.7, .574, .42], uDisc: [2.2, 2.09, 1.87], uDiscK: .9992,
      uCloudD: [.36, .30, .42], uCloudL: [1.0, .66, .46], uCloudG: [.5, .4, .275], uCov: .46, uGround: [.80, .66, .60], uStars: 0, uMoon: 0 },
    envGrad: [[0, '#22406e'], [.36, '#8f86a8'], [.5, '#f0c8a6'], [.52, '#5a4a3e'], [1, '#2a2622']], envGlow: ['rgba(255,240,210,1)', 'rgba(255,196,130,.9)', 'rgba(255,170,110,0)'],
  },
  /* 小地图上的地标：北面大殿 */
  mini(g, P) { const p = P(0, -50); g.fillStyle = 'rgba(198,59,46,.8)'; g.fillRect(p[0] - 9, p[1] - 5, 18, 10); },
};
