/* ---------------- 开放世界 · 搭建：分块地形、植被、草海、湖与瀑布 ---------------- */
const OWD = { data: null };
/* 地形块：64 米一块，四级细节；块边垂下一圈裙边挡住细节级之间的缝 */
function owChunkGeo(W, ci, cj, step) {
  const { N, cell, x0, z0 } = OW, C = 32, n = C / step + 1, i0 = ci * C, j0 = cj * C, cx = x0 + (i0 + C / 2) * cell, cz = z0 + (j0 + C / 2) * cell;
  const pos = [], nor = [], col = [], sp = [], wt = [], idx = [];
  const push = (i, j, drop) => { i = Math.min(N - 1, i); j = Math.min(N - 1, j); const k = j * N + i; pos.push(x0 + i * cell - cx, drop ? -5 : 0, z0 + j * cell - cz); nor.push(W.NM[k * 3], W.NM[k * 3 + 1], W.NM[k * 3 + 2]); col.push(W.TC[k * 3], W.TC[k * 3 + 1], W.TC[k * 3 + 2]); sp.push(W.SP[k * 4], W.SP[k * 4 + 1], W.SP[k * 4 + 2], W.SP[k * 4 + 3]); wt.push(W.WT[k]); };
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) push(i0 + a * step, j0 + b * step);
  for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) { const A = b * n + a, B = A + 1, Cc = A + n, D = Cc + 1; if ((a + b) % 2) idx.push(A, Cc, B, B, Cc, D); else idx.push(A, Cc, D, A, D, B); }
  // 裙边
  const ring = []; for (let a = 0; a < n; a++) ring.push([a, 0]); for (let b = 1; b < n; b++) ring.push([n - 1, b]); for (let a = n - 2; a >= 0; a--) ring.push([a, n - 1]); for (let b = n - 2; b > 0; b--) ring.push([0, b]);
  const s0 = pos.length / 3; for (const [a, b] of ring) push(i0 + a * step, j0 + b * step, true);
  for (let k = 0; k < ring.length; k++) { const k2 = (k + 1) % ring.length, A = ring[k][1] * n + ring[k][0], B = ring[k2][1] * n + ring[k2][0]; idx.push(A, s0 + k, B, B, s0 + k, s0 + k2, A, B, s0 + k, B, s0 + k2, s0 + k); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('aSp', new T.Float32BufferAttribute(sp, 4)); g.setAttribute('aWet', new T.Float32BufferAttribute(wt, 1)); g.setIndex(idx);
  let hmin = 1e9, hmax = -1e9; for (let b = 0; b <= C; b += 2) for (let a = 0; a <= C; a += 2) { const h = W.H[Math.min(N - 1, j0 + b) * N + Math.min(N - 1, i0 + a)]; hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
  g.boundingSphere = new T.Sphere(new V3(0, (hmin + hmax) / 2, 0), Math.hypot(C * cell * .72, (hmax - hmin) / 2 + 6));
  return { g, cx, cz };
}
/* 同一几何在不同扇区各开一个实例批次：每批算自己的包围球，好让视锥剔除生效 */
function owWrapGeo(g) { const w = new T.BufferGeometry(); for (const k in g.attributes) w.setAttribute(k, g.attributes[k]); w.setIndex(g.index); return w; }
function owInstance(scene, geo, mat, items, o = {}) {
  const S = o.sector || 128, groups = new Map(), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new V3(), sv = new V3(), out = [];
  const gr = geo.boundingSphere ? geo.boundingSphere.radius + geo.boundingSphere.center.length() : 10;
  for (const it of items) { const k = Math.floor(it.x / S) * 1000 + Math.floor(it.z / S); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  for (const list of groups.values()) {
    const im = new T.InstancedMesh(owWrapGeo(geo), mat, list.length); let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, mny = 1e9, mxy = -1e9, ms = 0;
    list.forEach((it, i) => {
      e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e); const s = it.s || 1; sv.set(it.sx || s, it.sy || s, it.sz || s); m4.compose(v.set(it.x, it.y || 0, it.z), q, sv); im.setMatrixAt(i, m4);
      if (it.c) im.setColorAt(i, it.c);
      const h = gH(it.x, it.z) + (it.y || 0); mnx = Math.min(mnx, it.x); mxx = Math.max(mxx, it.x); mnz = Math.min(mnz, it.z); mxz = Math.max(mxz, it.z); mny = Math.min(mny, h); mxy = Math.max(mxy, h); ms = Math.max(ms, Math.max(sv.x, sv.y, sv.z));
    });
    const c = new V3((mnx + mxx) / 2, (mny + mxy) / 2, (mnz + mxz) / 2); im.geometry.boundingSphere = new T.Sphere(c, Math.hypot(mxx - mnx, mxz - mnz, mxy - mny) / 2 + gr * ms);
    if (mat.defines && mat.defines.TERR_VERT !== undefined) { if (!OWD.depthV) { OWD.depthV = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }); OWD.depthV.defines = { TERR_VERT: '' }; } im.customDepthMaterial = OWD.depthV; }
    im.castShadow = o.cast !== false; im.receiveShadow = o.receive !== false; im.userData.far = o.far || 520; scene.add(im); out.push(im); OWD.inst.push(im);
  }
  return out;
}
/* 撒点：在满足 ok(x, z, W, k) 的格子里按密度随机取点，彼此至少相隔 gap */
function owScatter(W, rng, n, gap, ok, tries = 30) {
  const pts = [], grid = new Map(), cs = gap, key = (x, z) => Math.floor(x / cs) * 4096 + Math.floor(z / cs);
  for (let t = 0; t < n * tries && pts.length < n; t++) {
    const x = (rng() * 2 - 1) * 500, z = (rng() * 2 - 1) * 500, i = Math.round((x - OW.x0) / OW.cell), j = Math.round((z - OW.z0) / OW.cell); if (i < 0 || j < 0 || i >= OW.N || j >= OW.N) continue;
    const k = j * OW.N + i; if (!ok(x, z, W, k, rng)) continue;
    let near = false; const gx = Math.floor(x / cs), gz = Math.floor(z / cs);
    for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1 && !near; b++) { const L = grid.get((gx + a) * 4096 + gz + b); if (L) for (const p of L) if ((p.x - x) ** 2 + (p.z - z) ** 2 < gap * gap) { near = true; break; } }
    if (near) continue; const p = { x, z, k }; pts.push(p); const kk = key(x, z); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(p);
  }
  return pts;
}
const owRegD = (x, z, id) => { const r = OW.reg(id); return Math.hypot(x - r.x, z - r.z) - r.r; };
const owPadD = (x, z) => { let d = 1e9; for (const [px, pz, pr] of OW.PADS) d = Math.min(d, Math.hypot(x - px, z - pz) - pr); return d; };
const owLakeE = (x, z) => Math.hypot((x - OW.LAKE.x) / OW.LAKE.rx, (z - OW.LAKE.z) / OW.LAKE.rz);
/* 碰撞登记：开放世界用 8 米网格分桶 */
function owCol(x, z, r) { const c = { x, z, r }; World.colliders.push(c); if (!World.cg) World.cg = new Map(); const k = Math.floor(x / 8) * 4096 + Math.floor(z / 8); if (!World.cg.has(k)) World.cg.set(k, []); World.cg.get(k).push(c); }

function buildOpen(scene) {
  const t0 = performance.now();
  const W = OWD.data || (OWD.data = owGenerate()); OWD.inst = []; OWD.chunks = []; World.open = true; World.cg = new Map();
  TERR.set(W.H, OW.N, OW.cell, OW.x0, OW.z0, W.EX); TERR.sdf = W.sdf;
  const tx = owTextures(), rng = mulberry(20261023);
  /* 地形 */
  const tmat = owTerrainMat(tx);
  for (let cj = 0; cj < 16; cj++) for (let ci = 0; ci < 16; ci++) {
    const lod = new T.LOD(); let cx = 0, cz = 0;
    [[1, 0], [2, 150], [4, 320], [8, 560]].forEach(([st, d]) => { const r = owChunkGeo(W, ci, cj, st); cx = r.cx; cz = r.cz; const m = new T.Mesh(r.g, tmat); m.receiveShadow = true; m.castShadow = st <= 2; lod.addLevel(m, d); });
    lod.position.set(cx, 0, cz); lod.updateMatrix(); lod.matrixAutoUpdate = false; scene.add(lod); OWD.chunks.push(lod);
  }
  /* 树 */
  const barkM = owBarkMat(tx), leafM = { pine: owLeafMat(tx.leaf, 0x5a7a30, .6), maple: owLeafMat(tx.leaf, 0xff6a20, 1), broad: owLeafMat(tx.leaf, 0x88a040, 1), bamboo: owLeafMat(tx.leaf, 0x9ac050, 1.6) };
  const kinds = { pine: [], maple: [], broad: [], dead: [] }; const V = {};
  for (const k in kinds) V[k] = [0, 1, 2, 3].map(i => owTree(k, 100 + i * 31 + k.length * 7));
  const free = (x, z, W, k) => W.RD[k] > 7 && owPadD(x, z) > 4 && owLakeE(x, z) > 1.12 && W.H[k] > OW.WL + .6 && Math.hypot(x - OW.POOL.x, z - OW.POOL.z) > OW.POOL.r + 3;
  const pines = owScatter(W, rng, 3400, 5.2, (x, z, W, k, r) => free(x, z, W, k) && W.SL[k] < 1.4 && owRegD(x, z, 'zhu') > 20 && owRegD(x, z, 'zhu2') > 10 && r() < (.12 + .8 * sstep(.35, .62, fbm(x * .012 + 4, z * .012, 3))) * (W.WK[k] < .5 ? 1.3 : .55) * (owRegD(x, z, 'feng') < 0 ? .3 : 1));
  const maples = owScatter(W, rng, 900, 6, (x, z, W, k, r) => free(x, z, W, k) && W.SL[k] < 1 && (owRegD(x, z, 'feng') < 70 && r() < .9 || owRegD(x, z, 'zhai') < 40 && r() < .3 || owRegD(x, z, 'shan') < 40 && r() < .2 || owRegD(x, z, 'si') < 30 && r() < .25));
  const broads = owScatter(W, rng, 1300, 6.5, (x, z, W, k, r) => free(x, z, W, k) && W.SL[k] < .9 && (owRegD(x, z, 'tan') < 70 || owRegD(x, z, 'shan') < 90 || owRegD(x, z, 'zhu') < 60 && r() < .3) && r() < .6);
  const deads = owScatter(W, rng, 220, 7, (x, z, W, k, r) => free(x, z, W, k) && (owRegD(x, z, 'zhong') < 40 || owRegD(x, z, 'zhai') < 20 && r() < .3));
  const put = (list, kind) => { for (const p of list) { const s = .72 + rng() * rng() * .9, v = rng() * 4 | 0; kinds[kind].push({ x: p.x, z: p.z, s, ry: rng() * TAU, v }); if (W.sdf.d[p.k] < 0) owCol(p.x, p.z, (kind === 'pine' ? .45 : .55) * s); } };
  put(pines, 'pine'); put(maples, 'maple'); put(broads, 'broad'); put(deads, 'dead');
  for (const k in kinds) for (let v = 0; v < 4; v++) { const list = kinds[k].filter(t => t.v === v); if (!list.length) continue; owInstance(scene, V[k][v].bark, barkM, list); if (V[k][v].leaf) owInstance(scene, V[k][v].leaf, leafM[k], list); }
  /* 竹海 */
  const BV = [0, 1, 2].map(i => owBambooClump(500 + i * 13)), bambooBark = new T.MeshStandardMaterial({ vertexColors: true, roughness: .5, color: 0xffffff });
  const bam = owScatter(W, rng, 1100, 4.6, (x, z, W, k, r) => free(x, z, W, k) && W.SL[k] < 1.1 && (owRegD(x, z, 'zhu') < 40 || owRegD(x, z, 'zhu2') < 30) && r() < .92);
  const bl = bam.map(p => { const s = .85 + rng() * .4; if (W.sdf.d[p.k] < 0) owCol(p.x, p.z, 1.5 * s); return { x: p.x, z: p.z, s, ry: rng() * TAU, v: rng() * 3 | 0 }; });
  for (let v = 0; v < 3; v++) { const list = bl.filter(t => t.v === v); owInstance(scene, BV[v].bark, bambooBark, list); owInstance(scene, BV[v].leaf, leafM.bamboo, list); }
  /* 岩石：崖脚大石、坡上散石 */
  const RV = [0, 1, 2, 3, 4, 5].map(i => owRock(900 + i * 7, i < 3 ? .7 : 1)), CV = [0, 1, 2, 3].map(i => owRock(1300 + i * 11, 1.5 + i * .2, 2)), rockM = owRockMat(tx, 1), rockD = owRockMat(tx, .25, 0xb8aca4);
  const cliffs = owScatter(W, rng, 2200, 6, (x, z, W, k, r) => W.SL[k] > 1.0 && W.sdf.d[k] > -1 && W.sdf.d[k] < 30 && W.H[k] < 240 && owLakeE(x, z) > 1.02 && Math.abs(x) > 12 - (z < -100 || z > -15 ? 99 : 0));
  const small = owScatter(W, rng, 1500, 5, (x, z, W, k, r) => W.SL[k] > .12 && W.SL[k] < 1 && W.RD[k] > 5 && owPadD(x, z) > 3 && W.H[k] > OW.WL - .5 && r() < .5);
  const RI = [];
  const CI = []; for (const p of cliffs) { const s = 4 + rng() * 7; CI.push({ x: p.x, z: p.z, y: -s * .3, s, sx: s * (.7 + rng() * .6), sy: s * (.8 + rng() * .9), ry: rng() * TAU, rx: (rng() - .5) * .3, rz: (rng() - .5) * .3, v: rng() * 4 | 0 }); }
  for (let v = 0; v < 4; v++) owInstance(scene, CV[v], rockD, CI.filter(r => r.v === v), { far: 700 });
  for (const p of small) { const big = rng() < .18, s = big ? 1.4 + rng() * 2.2 : .25 + rng() * .9; RI.push({ x: p.x, z: p.z, y: -s * .15, s, ry: rng() * TAU, rx: (rng() - .5) * .5, rz: (rng() - .5) * .5, v: rng() * 6 | 0, d: owRegD(p.x, p.z, 'zhong') < 60 }); if (big && W.sdf.d[p.k] < 0) owCol(p.x, p.z, s * .85); }
  for (let v = 0; v < 6; v++) { owInstance(scene, RV[v], rockM, RI.filter(r => r.v === v && !r.d)); const dl = RI.filter(r => r.v === v && r.d); if (dl.length) owInstance(scene, RV[v], rockD, dl); }
  /* 草海：16 米一片，玩家周围 9×9 片轮换；所有片共用一份实例矩阵 */
  {
    const GN = [1400, 1900, 2400, 2800][GFX.quality] || 2400, gg = owGrassGeo(), gm = owGrassMat(), m4 = new T.Matrix4(), v = new V3(), q = new T.Quaternion(), sv = new V3(), shared = new T.InstancedBufferAttribute(new Float32Array(GN * 16), 16), gr = mulberry(3);
    for (let i = 0; i < GN; i++) { const s = .6 + gr() * .6; m4.compose(v.set(gr() * 16, 0, gr() * 16), q, sv.set(s, s * (.5 + gr() * .4), s)); m4.toArray(shared.array, i * 16); }
    OWD.grass = []; for (let i = 0; i < 81; i++) { const im = new T.InstancedMesh(gg, gm, GN); im.instanceMatrix = shared; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false; im.userData.full = GN; scene.add(im); OWD.grass.push(im); }
    World.grass = null;
  }
  /* 湖、泉池、飞瀑 */
  const L = OW.LAKE, lake = new T.Mesh(new T.PlaneGeometry(L.rx * 2.8, L.rz * 2.8, 1, 1).rotateX(-PI / 2), owWaterMat(OW.WL, 0x3f7f86)); lake.position.set(L.x, OW.WL, L.z); lake.renderOrder = 2; scene.add(lake);
  const P = OW.POOL, pool = new T.Mesh(new T.CircleGeometry(P.r + 6, 40).rotateX(-PI / 2), owWaterMat(P.wl, 0x3f7f86)); pool.position.set(P.x, P.wl, P.z); pool.renderOrder = 2; scene.add(pool);
  {
    const pos = [], uv = [], idx = [], n = 40, z0 = -93, z1 = -19;
    for (let i = 0; i <= n; i++) { const t = i / n, z = lerp(z0, z1, t), w = lerp(5, 8.5, t), y = Math.max(gH(0, z), OW.WL) + lerp(.9, .6, t) + (i === 0 ? .2 : 0); for (const s of [-1, 1]) { pos.push(s * w, y, z); uv.push(s < 0 ? 0 : 1, 1 - t); } if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    const fall = new T.Mesh(g, owFallMat()); fall.renderOrder = 3; scene.add(fall);
  }
  /* 远山：世界外围三圈剪影 */
  { const n0 = scene.children.length; farMountains(scene, [[900, 160, 330, 0x5d6f86, 11], [1150, 220, 460, 0x7a8aa0, 23], [1420, 260, 560, 0x98a4b4, 37]], 0xb8c0c4); for (const o of scene.children.slice(n0)) o.material.defines = { NO_TERR: '' }; }
  /* 灯火池：只点亮离玩家最近的四盏 */
  OWD.lights = [0, 1, 2, 3].map(() => { const l = new T.PointLight(0xff9a4a, 0, 18, 2); scene.add(l); return l; }); OWD.lightSrc = [];
  owStructures(scene, W, rng);
  /* 落叶、岚气 */
  OWD.leaves = fallingBits(scene, { n: 260, w: .13, h: .1, color: 0xc8501e, fall: .9, top: [6, 14] });
  OWD.mist = owMist(scene);
  World.tick = owTick;
  console.log('open world built', Math.round(performance.now() - t0), 'ms');
}
/* 谷中岚气：大团柔光雾片贴着地面缓缓飘 */
function owMist(scene) {
  const tex = canvasTex(texSoft(128, true)), list = [], rng = mulberry(31);
  const spots = [[0, 40, 26, 0xe8f0f4, 14], [0, -40, 30, 0xf2f6f8, 6], [-300, 62, 30, 0xd8cfc4, 6], [215, 185, 40, 0xdfeedf, 8], [0, -325, 40, 0xc8a0a0, 8], [-165, 225, 40, 0xf0e2d0, 6], [20, -170, 34, 0xeceae2, 5]];
  for (const [x, z, r, col, n] of spots) for (let i = 0; i < n; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, color: col, opacity: .1 + rng() * .1, depthWrite: false, transparent: true, fog: true })); const a = rng() * TAU, d = Math.sqrt(rng()) * r; sp.userData = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, y: 2 + rng() * 6, ph: rng() * TAU }; sp.scale.set(30 + rng() * 30, 8 + rng() * 6, 1); scene.add(sp); list.push(sp); }
  return (dt, t) => { for (const s of list) { const u = s.userData; s.position.set(u.x + Math.sin(t * .05 + u.ph) * 8, u.y + Math.sin(t * .3 + u.ph) * .6, u.z + Math.cos(t * .04 + u.ph) * 6); } };
}
const _owF = new T.Frustum(), _owM = new T.Matrix4(), _owS = new T.Sphere();
function owTick(dt, t, focus) {
  const cam = GFX.camera, cp = cam.position;
  OWU.uPl.value.set(focus.x, 0, focus.z); OWU.uSunV.value.copy(SUN_DIR).transformDirection(cam.matrixWorldInverse);
  /* 实例批次：远了就不画 */
  for (const im of OWD.inst) { const c = im.geometry.boundingSphere.center; im.visible = (c.x - cp.x) ** 2 + (c.z - cp.z) ** 2 < (im.userData.far + im.geometry.boundingSphere.radius) ** 2; }
  /* 草片跟着玩家挪 */
  _owM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _owF.setFromProjectionMatrix(_owM);
  const gx = Math.floor(focus.x / 16), gz = Math.floor(focus.z / 16), q = GFX.quality, GR = [36, 46, 58, 66][q] || 58; OWU.uGR.value = GR; let n = 0;
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
    const im = OWD.grass[n++], x = (gx + a) * 16, z = (gz + b) * 16, d = Math.hypot(x + 8 - focus.x, z + 8 - focus.z);
    im.position.set(x, 0, z); im.updateMatrix(); im.updateMatrixWorld(); _owS.center.set(x + 8, gH(x + 8, z + 8) + .5, z + 8); _owS.radius = 13;
    im.visible = d < GR + 12 && _owF.intersectsSphere(_owS); im.count = Math.max(1, Math.floor(im.userData.full * (d < 24 ? 1 : d < 40 ? .55 : .3)));
  }
  /* 最近的灯火 */
  const src = OWD.lightSrc; src.sort((A, B) => ((A.x - focus.x) ** 2 + (A.z - focus.z) ** 2) - ((B.x - focus.x) ** 2 + (B.z - focus.z) ** 2));
  const fl = 1 + Math.sin(t * 11) * .06 + Math.sin(t * 23.7) * .05;
  OWD.lights.forEach((l, i) => { const s = src[i]; if (!s || Math.hypot(s.x - focus.x, s.z - focus.z) > 70) { l.intensity = 0; return; } l.position.set(s.x, s.y + gH(s.x, s.z), s.z); l.color.setHex(s.c); l.intensity = s.i * (s.fl ? fl : 1); l.distance = s.r || 18; });
  if (OWD.leaves) OWD.leaves(dt, focus); if (OWD.mist) OWD.mist(dt, t);
  if (OWD.ticks) for (const f of OWD.ticks) f(dt, t, focus);
}

MAPS.open = {
  R: 600, far: 2600, open: true, spawn: [0, 398, PI], build: buildOpen,
  env: {
    fog: 0x9fb0c0, fogD: .0031, fogH: [8, .013, 0, .9], fogSun: [1, .8, .56], shaft: .55, shaftC: [1, .82, .58], hemi: [0x9ab8e0, 0x5a4a3a, .62], sun: [0xffd6a8, 1.75], sunDir: [-.8, .42, -.42], fill: [0x7f9fd8, .26], exp: 1.0,
    sky: { uZen: [.13, .26, .5], uMid: [.44, .56, .7], uHor: [.74, .74, .72], uHor2: [1.0, .8, .56], uGlow: [.36, .26, .14], uHalo: [.5, .42, .3], uDisc: [1.9, 1.75, 1.5], uDiscK: .99965,
      uCloudD: [.5, .54, .62], uCloudL: [1.0, .9, .78], uCloudG: [.6, .45, .3], uCov: .5, uGround: [.62, .64, .64], uStars: 0, uMoon: 0 },
    envGrad: [[0, '#2a4a7a'], [.36, '#8fa6c2'], [.5, '#e8dcc6'], [.52, '#5a5a4a'], [1, '#2a2a24']], envGlow: ['rgba(255,245,225,1)', 'rgba(255,214,160,.9)', 'rgba(255,190,130,0)'],
  },
};
