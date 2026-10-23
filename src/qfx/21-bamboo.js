/* ---------------- 第二章 · 竹林：月夜竹海中的一片空地 ---------------- */
const BAMBOO_STREAM = [[64, -34], [46, -24], [32, -15], [24, -3], [22, 9], [27, 21], [38, 30], [60, 42]];
const BAMBOO_PATH = [[1, 66], [0, 46], [-3, 33], [2, 20], [-2, 6], [-6, -8], [-2, -21], [0, -33], [0, -37]];
/* 点到折线的距离 */
function polyDist(pts, x, z) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1), px = ax + dx * t - x, pz = az + dz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return Math.sqrt(best);
}
function bambooH(x, z) {
  const r = Math.hypot(x, z); if (r < 46) return 0;
  const k = sstep(46, 125, r), n = fbm(x * .012 + 11, z * .012 - 3, 4);
  return k * (5 + 38 * n * n) + sstep(46, 56, r) * .9 * noise2(x * .17 + 2, z * .17);
}
/* 地面：苔藓、泥土、落叶、湿润的溪床、踩出来的小径 */
function texBambooGround(S, span) {
  const c = makeCanvas(S, S), g = c.getContext('2d'), h = S / 2, c2 = makeCanvas(h, h), g2 = c2.getContext('2d'), img = g2.createImageData(h, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
    const wx = (x / h - .5) * span, wz = (y / h - .5) * span, n = fbm(wx * .08, wz * .08, 3), n2 = noise2(wx * .9, wz * .9), dirt = sstep(.5, .68, fbm(wx * .045 + 4, wz * .045 - 6, 3));
    const sd = polyDist(BAMBOO_STREAM, wx, wz), pd = polyDist(BAMBOO_PATH, wx, wz), sh = .82 + .3 * n2;
    let r = lerp(30, 54, n) * sh, gg = lerp(42, 62, n) * sh, b = lerp(30, 40, n) * sh;
    r = lerp(r, 66 * sh, dirt * .7); gg = lerp(gg, 54 * sh, dirt * .7); b = lerp(b, 40 * sh, dirt * .7);
    const wet = 1 - sstep(1.6, 4.2, sd); r = lerp(r, 20, wet * .8); gg = lerp(gg, 28, wet * .8); b = lerp(b, 32, wet * .8);
    const path = 1 - sstep(1.1, 2.3 + .8 * n, pd); r = lerp(r, 92 * sh, path); gg = lerp(gg, 80 * sh, path); b = lerp(b, 62 * sh, path);
    const i = (y * h + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g2.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(c2, 0, 0, S, S);
  const rng = mulberry(42), W = v => (v / span + .5) * S, cols = ['rgba(92,94,56,', 'rgba(104,88,54,', 'rgba(66,58,40,', 'rgba(74,86,52,'];
  // 落叶
  for (let i = 0; i < 11000; i++) {
    const x = rng() * S, y = rng() * S, wx = (x / S - .5) * span, wz = (y / S - .5) * span; if (polyDist(BAMBOO_STREAM, wx, wz) < 1.8) continue;
    g.save(); g.translate(x, y); g.rotate(rng() * TAU); g.fillStyle = cols[i % 4] + (.18 + rng() * .3) + ')'; g.beginPath(); g.ellipse(0, 0, 1.6 + rng() * 2.4, .6 + rng() * .4, 0, 0, TAU); g.fill(); g.restore();
  }
  // 小径上的踏石
  for (let i = 0; i < BAMBOO_PATH.length - 1; i++) {
    const [ax, az] = BAMBOO_PATH[i], [bx, bz] = BAMBOO_PATH[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
    for (let k = 0; k < n; k++) {
      const t = (k + rng() * .3) / n, x = W(lerp(ax, bx, t) + (rng() - .5) * .9), y = W(lerp(az, bz, t) + (rng() - .5) * .9), rr = (.34 + rng() * .18) / span * S, l = 70 + rng() * 22;
      g.fillStyle = 'rgba(20,22,20,.5)'; g.beginPath(); g.ellipse(x + 1.5, y + 1.5, rr * 1.15, rr * .85, rng() * PI, 0, TAU); g.fill();
      g.fillStyle = `rgb(${l | 0},${l + 3 | 0},${l - 2 | 0})`; g.beginPath(); g.ellipse(x, y, rr * 1.15, rr * .85, rng() * PI, 0, TAU); g.fill();
    }
  }
  for (let i = 0; i < 14000; i++) { g.fillStyle = rng() < .5 ? 'rgba(0,0,0,.12)' : 'rgba(200,220,190,.05)'; g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2); }
  return c;
}
/* 竹竿：世界高度上画出竹节，越往上越青亮 */
function bambooStalkMat() {
  const m = stdMat(0xffffff, { rough: .48 });
  m.onBeforeCompile = sh => {
    terrU(sh); sh.vertexShader = 'varying float vWY, vLY, vSeed;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 bw = vec4(transformed, 1.); vSeed = 0.;
      #ifdef USE_INSTANCING
        bw = instanceMatrix * bw; vSeed = fract(instanceMatrix[3].x * .37 + instanceMatrix[3].z * .71);
      #endif
      vWY = (modelMatrix * bw).y; vLY = position.y;`);
    sh.fragmentShader = 'varying float vWY, vLY, vSeed;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float seg = .52 + vSeed * .34, f = fract(vWY / seg + vSeed * 9.), dn = min(f, 1. - f);
      diffuseColor.rgb *= 1. - .5 * smoothstep(.028, .0, dn);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.4 + .025, smoothstep(.0, .03, f) * smoothstep(.12, .03, f) * .65);
      diffuseColor.rgb *= mix(.62, 1.15, vLY);`);
  };
  m.customProgramCacheKey = () => 'bambooStalk';
  return m;
}
/* 一簇竹叶：七片细长下垂的叶子 */
function leafSprayGeo() {
  const pos = [], col = [], nor = [], idx = [], NL = 7;
  for (let i = 0; i < NL; i++) {
    const a = i / NL * TAU + (i % 2) * .45, len = .5 + (i % 3) * .13, w = .05, droop = .32 + (i % 2) * .18, ca = Math.cos(a), sa = Math.sin(a), o = pos.length / 3;
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, al = t * len, y = .06 * t - droop * t * t * len, ww = k === 4 ? 0 : w * Math.sin(PI * (t * .85 + .12)), cx = ca * al, cz = sa * al;
      pos.push(cx + sa * ww, y, cz - ca * ww, cx - sa * ww, y, cz + ca * ww); const s = .5 + .5 * t; col.push(s, s, s, s, s, s); nor.push(0, 1, 0, 0, 1, 0);
    }
    for (let k = 0; k < 4; k++) { const b = o + k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
}
/* 可平铺的水波法线 */
function texWaterN(S = 256) {
  const c = makeCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  const waves = [[3, 1, 0, .5], [-2, 3, 1.3, .35], [5, -2, 2.1, .25], [1, -5, .7, .2], [7, 4, 3.3, .12]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let h = 0; for (const [a, b, p, k] of waves) h += Math.sin((x * a + y * b) / S * TAU + p) * k; const v = 128 + h * 70, i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  g.putImageData(img, 0, 0); const t = canvasTex(normalFromCanvas(c, 3), false); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
}
/* 刻字石碑的碑面 */
function texStele(text) {
  const w = 256, h = 512, c = makeCanvas(w, h), g = c.getContext('2d'), rng = mulberry(9);
  g.fillStyle = '#6d706a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { g.fillStyle = rng() < .5 ? 'rgba(0,0,0,.1)' : 'rgba(255,255,250,.06)'; g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3); }
  for (let i = 0; i < 26; i++) { const x = rng() * w, y = (rng() < .6 ? .7 + rng() * .3 : rng()) * h, r = 10 + rng() * 40, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(58,82,44,.55)'); gr.addColorStop(1, 'rgba(58,82,44,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.strokeStyle = 'rgba(30,32,30,.6)'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28);
  g.font = `${w * .42}px "Ma Shan Zheng","STKaiti","Kaiti SC","KaiTi",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < text.length; i++) { const y = h * (.17 + i * .22); g.fillStyle = 'rgba(240,240,232,.18)'; g.fillText(text[i], w / 2 + 2, y + 2); g.fillStyle = '#26282a'; g.fillText(text[i], w / 2, y); }
  return c;
}

function buildBamboo(scene) {
  const rng = mulberry(20261022), R2 = (a, b) => a + rng() * (b - a), R = World.R;
  const q = new T.Quaternion(), e = new T.Euler(), v = new V3(), UPV = new V3(0, 1, 0), C = (h, s, l) => new T.Color().setHSL(h, s, l);
  const addCol = (x, z, r) => World.colliders.push({ x, z, r });
  const shadowAll = g => g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  /* 地形与地面 */
  const tg = new T.PlaneGeometry(900, 900, 180, 180); tg.rotateX(-PI / 2);
  const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i), hh = bambooH(x, z); tp.setY(i, hh - (Math.hypot(x, z) < 45 ? .2 : 0)); const n = fbm(x * .03, z * .03, 3); tc[i * 3] = lerp(.07, .12, n); tc[i * 3 + 1] = lerp(.1, .16, n); tc[i * 3 + 2] = lerp(.08, .11, n); }
  tg.setAttribute('color', new T.BufferAttribute(tc, 3)); tg.computeVertexNormals();
  const terr = new T.Mesh(tg, stdMat(0xffffff, { vc: true, rough: 1 })); terr.receiveShadow = true; scene.add(terr);
  const gc = texBambooGround(1024, 112);
  const inner = new T.Mesh(new T.PlaneGeometry(112, 112).rotateX(-PI / 2), stdMat(0xffffff, { map: canvasTex(gc), normalMap: canvasTex(normalFromCanvas(gc, 1.6), false), ns: .6, rough: .95 }));
  inner.position.y = .01; inner.receiveShadow = true; scene.add(inner);

  /* 远山 */
  farMountains(scene, [[330, 60, 140, 0x16232b, 5], [470, 100, 200, 0x1d2d36, 17], [640, 140, 280, 0x263842, 29]], 0x2a3a42);

  /* 溪水 */
  const curve = new T.CatmullRomCurve3(BAMBOO_STREAM.map(([x, z]) => new V3(x, .045, z))), NS = 160, wp = [], wu = [], wi = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, p = curve.getPoint(t), tn = curve.getTangent(t), w = 1.9 * (1 + .22 * Math.sin(i * .31)), nx = -tn.z, nz = tn.x, l = Math.hypot(nx, nz) || 1;
    wp.push(p.x + nx / l * w, p.y, p.z + nz / l * w, p.x - nx / l * w, p.y, p.z - nz / l * w); wu.push(t * curve.getLength() / 5, 0, t * curve.getLength() / 5, 1);
    if (i < NS) { const b = i * 2; wi.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute(wp, 3)); wg.setAttribute('uv', new T.Float32BufferAttribute(wu, 2)); wg.setIndex(wi); wg.computeVertexNormals();
  const wn = texWaterN(), wm = new T.MeshStandardMaterial({ color: 0x05090c, roughness: .06, metalness: .1, normalMap: wn, envMap: GFX.env, envMapIntensity: .5, transparent: true, opacity: .94 }); wm.normalScale.set(.5, .5);
  const water = new T.Mesh(wg, wm); water.receiveShadow = true; water.renderOrder = 1; scene.add(water);
  World.inWater = (x, z) => polyDist(BAMBOO_STREAM, x, z) < 1.7;
  /* 溪上小木桥：桥面横跨溪水，木板顺水流方向铺 */
  { const bp = curve.getPoint(.47), bt = curve.getTangent(.47), br = group(bp.x, 0, bp.z, scene), wood = stdMat(0x3e3226, { rough: .85 }), woodD = stdMat(0x2a211a, { rough: .9 }); br.rotation.y = Math.atan2(bt.x, bt.z);
    for (let i = -6; i <= 6; i++) { const k = i / 6, pl = mesh(boxG(.4, .09, 2.1), wood, i * .43, .2 + Math.cos(k * 1.2) * .26, 0, br); pl.rotation.z = Math.sin(k * 1.2) * .2; }
    for (const sx of [-2.5, 2.5]) for (const sz of [-1.12, 1.12]) mesh(cylG(.07, .09, 1.1, 6), woodD, sx, .55, sz, br);
    for (const sz of [-1.12, 1.12]) { mesh(boxG(2.6, .07, .07), woodD, -1.3, 1.02, sz, br).rotation.z = .12; mesh(boxG(2.6, .07, .07), woodD, 1.3, 1.02, sz, br).rotation.z = -.12; }
    shadowAll(br); }

  /* 竹子：竹竿 + 竹叶簇，全部实例化 */
  const stalkGeo = new T.CylinderGeometry(.82, 1, 1, 7, 1); stalkGeo.translate(0, .5, 0);
  const stalks = [], sprays = [];
  const bamboo = (x, z, hgt, rad, y0 = 0) => {
    const lx = R2(-.06, .06), lz = R2(-.06, .06); q.setFromUnitVectors(UPV, v.set(lx, 1, lz).normalize()); stalks.push([new V3(x, y0 - .1, z), q.clone(), new V3(rad, hgt, rad), C(R2(.2, .28), R2(.35, .55), R2(.26, .38))]);
    const ns = 4 + (rng() * 4 | 0);
    for (let k = 0; k < ns; k++) {
      const t = R2(.5, 1.02), a = R2(0, TAU), bl = R2(.15, .7), px = x + lx * hgt * t + Math.cos(a) * bl, pz = z + lz * hgt * t + Math.sin(a) * bl, s = R2(.9, 1.6) * (t > .9 ? 1.25 : 1);
      e.set(R2(-.25, .25), a, R2(-.25, .25)); sprays.push([new V3(px, y0 + hgt * t, pz), new T.Quaternion().setFromEuler(e), new V3(s, s, s), C(R2(.25, .33), R2(.35, .55), R2(.14, .24))]);
    }
  };
  const clearOK = (x, z, m) => polyDist(BAMBOO_PATH, x, z) > m && polyDist(BAMBOO_STREAM, x, z) > m * .9 && Math.hypot(x, z + 40.5) > 5.5;
  // 场内竹丛：天然掩体
  const clumps = [[-15, 10, 1.9], [13, -18, 2.1], [-24, -10, 1.7], [-9, -26, 1.6], [9, 26, 1.8], [-30, 18, 2.0], [33, 4, 1.4], [-20, 31, 1.6], [16, -34, 1.5], [-34, -24, 1.9], [36, -12, 1.3]];
  for (const [cx, cz, cr] of clumps) { if (!clearOK(cx, cz, cr + 2)) continue; const n = 9 + (rng() * 7 | 0); for (let i = 0; i < n; i++) { const a = R2(0, TAU), r = Math.sqrt(rng()) * cr; bamboo(cx + Math.cos(a) * r, cz + Math.sin(a) * r, R2(9, 15), R2(.055, .085)); } addCol(cx, cz, cr + .25); }
  // 场外竹海
  for (let i = 0; i < 260; i++) {
    const a = R2(0, TAU), r = R + 1.2 + Math.pow(rng(), 1.5) * 70, cx = Math.cos(a) * r, cz = Math.sin(a) * r; if (polyDist(BAMBOO_PATH, cx, cz) < 3 && cz > 0) continue; if (polyDist(BAMBOO_STREAM, cx, cz) < 2.5) continue;
    const n = 5 + (rng() * 7 | 0), cr = R2(1.2, 3);
    for (let k = 0; k < n; k++) { const b = R2(0, TAU), rr = Math.sqrt(rng()) * cr, x = cx + Math.cos(b) * rr, z = cz + Math.sin(b) * rr; if (Math.hypot(x, z) < R + .6) continue; bamboo(x, z, R2(11, 19), R2(.06, .1), bambooH(x, z)); }
  }
  const sm = new T.InstancedMesh(stalkGeo, bambooStalkMat(), stalks.length), m4 = new T.Matrix4();
  stalks.forEach(([p, qq, sc, col], i) => { m4.compose(p, qq, sc); sm.setMatrixAt(i, m4); sm.setColorAt(i, col); }); sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false; scene.add(sm);
  const lm = new T.InstancedMesh(leafSprayGeo(), windMat(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), .14, -2.4, false), sprays.length);
  sprays.forEach(([p, qq, sc, col], i) => { m4.compose(p, qq, sc); lm.setMatrixAt(i, m4); lm.setColorAt(i, col); }); lm.castShadow = true; lm.receiveShadow = true; lm.frustumCulled = false; lm.userData.full = sprays.length; scene.add(lm); World.leaves = lm;

  /* 青苔石 */
  const rockGeo = new T.IcosahedronGeometry(1, 1); { const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = .78 + .45 * hash2(Math.round(x * 31), Math.round(y * 17 + z * 53)); p.setXYZ(i, x * k, y * k * .75, z * k); } rockGeo.computeVertexNormals(); }
  const rocks = new Batch(rockGeo, stdMat(0xffffff, { flat: true, rough: .95 }));
  const rock = (x, z, sc, y0 = 0) => { e.set(R2(-.3, .3), R2(0, TAU), R2(-.3, .3)); const l = R2(.2, .3); rocks.add(new V3(x, y0 + sc * .3, z), new T.Quaternion().setFromEuler(e), new V3(sc * R2(.9, 1.4), sc * R2(.7, 1.2), sc * R2(.9, 1.3)), new T.Color(l * .85, l, l * .82)); };
  for (const [x, z, sc] of [[-8, 14, 1.3], [20, -26, 1.6], [-27, -2, 1.1], [27, 30, 1.2], [-36, 6, 1.5], [6, -12, .9]]) { if (!clearOK(x, z, sc + 1)) continue; rock(x, z, sc); rock(x + sc, z + sc * .4, sc * .5); addCol(x, z, sc * 1.05); }
  for (let i = 0; i < 70; i++) { const t = rng(), p = curve.getPoint(t), sd = rng() < .5 ? 1 : -1, tn = curve.getTangent(t), w = R2(1.9, 2.6); rock(p.x - tn.z * w * sd, p.z + tn.x * w * sd, R2(.15, .45)); }
  for (let i = 0; i < 60; i++) { const a = R2(0, TAU), r = R2(R + 2, 100), x = Math.cos(a) * r, z = Math.sin(a) * r; rock(x, z, R2(.5, 2.4), bambooH(x, z)); }
  rocks.build(scene);

  /* 草：场内稀疏低矮，竹丛、石边、场外更密 */
  const nearCover = (x, z) => { let d = 1e9; for (const c of World.colliders) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r); return d; };
  grassBlades(scene, 36000, () => {
    const r = Math.sqrt(rng()) * 70, a = rng() * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clearOK(x, z, 1.8 + rng() * 1.4)) return null; if (polyDist(BAMBOO_STREAM, x, z) < 2.6) return null;
    const out = r > 44.5, cov = out ? 0 : nearCover(x, z), dense = out || cov < 2.5 ? 1 : .22 + .5 * sstep(.45, .7, fbm(x * .05 + 7, z * .05, 2)); if (rng() > dense) return null;
    const nn = fbm(x * .06 + 3, z * .06, 2); return [x, bambooH(x, z) - (out ? .1 : 0), z, (out ? R2(.35, .7) : R2(.12, .3)) * (.75 + nn * .5), R2(.8, 1.3), lerp(.1, .19, nn) + R2(0, .04), lerp(.19, .28, nn) + R2(0, .05), lerp(.11, .15, nn)];
  });
  /* 倒伏的竹竿、竹桩 */
  { const fall = new Batch(stalkGeo, bambooStalkMat()); const col = C(.17, .32, .28);
    for (let i = 0; i < 14; i++) { const a = R2(0, TAU), r = R2(8, 40), x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clearOK(x, z, 2.5)) continue; e.set(PI / 2 + R2(-.06, .06), R2(0, TAU), 0); fall.add(new V3(x, .07, z), new T.Quaternion().setFromEuler(e), new V3(.07, R2(3, 7), .07), col); }
    for (let i = 0; i < 24; i++) { const a = R2(0, TAU), r = R2(6, 42), x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clearOK(x, z, 2)) continue; fall.add(new V3(x, 0, z), null, new V3(.08, R2(.25, .6), .08), C(.15, .3, .3)); }
    fall.build(scene); }

  /* 土地祠 */
  const stone = stdMat(0x575852, { rough: .95 }), stoneD = stdMat(0x41423e, { rough: .95 }), redF = stdMat(0x5a2620, { rough: .8 }), tile = stdMat(0x1e2a2c, { rough: .6, flat: true, side: T.DoubleSide, metal: .1 }), wood = stdMat(0x3a2c22, { rough: .85 });
  const lanternM = stdMat(0xffa060, { emissive: 0xff7a2a, ei: 2.2, rough: .7 }), glowM = stdMat(0xffc070, { emissive: 0xffa040, ei: 3 });
  const sh = group(0, 0, -40.8, scene);
  mesh(boxG(6.6, .5, 4.8), stone, 0, .25, 0, sh); mesh(boxG(3.2, .25, .7), stone, 0, .12, 2.75, sh);
  for (const sx of [-2.5, 2.5]) for (const sz of [-1.6, 1.7]) mesh(cylG(.17, .19, 2.7, 10), redF, sx, 1.85, sz, sh);
  mesh(boxG(5.4, 2.6, .25), stoneD, 0, 1.8, -1.8, sh); for (const sx of [-2.6, 2.6]) mesh(boxG(.25, 2.6, 3.4), stoneD, sx, 1.8, -.1, sh);
  mesh(boxG(6.2, .35, 4.4), redF, 0, 3.3, 0, sh); const rf = roofMesh(7.8, 6.2, 1.7, tile); rf.position.set(0, 3.45, 0); sh.add(rf); mesh(boxG(3.2, .3, .3), tile, 0, 5.1, 0, sh);
  const plq = new T.Mesh(new T.PlaneGeometry(2.1, .75), new T.MeshStandardMaterial({ map: canvasTex(texPlaque('土地祠', 420, 150)), roughness: .6, emissive: 0x2a1a08, emissiveIntensity: .6 })); plq.position.set(0, 3.08, 2.42); sh.add(plq);
  mesh(boxG(2.2, .9, 1), wood, 0, .95, -.9, sh); const statM = stdMat(0x3c3d3a, { rough: .9 }); mesh(sphG(.17, 10, 8), statM, 0, 2.1, -1.3, sh); mesh(coneG(.36, 1.0, 10), statM, 0, 1.55, -1.3, sh); mesh(boxG(.9, .12, .5), statM, 0, 1.05, -1.3, sh);
  mesh(cylG(.22, .18, .26, 10), stdMat(0x6a5a3a, { metal: .6, rough: .5 }), 0, 1.53, -.6, sh);
  for (let i = -1; i <= 1; i++) { mesh(cylG(.012, .012, .5, 4), wood, i * .07, 1.85, -.6, sh); mesh(sphG(.025, 6, 4), glowM, i * .07, 2.1, -.6, sh); }
  World.smokes = [new V3(0, 2.15, -41.4)];
  shadowAll(sh); plq.castShadow = false; addCol(0, -40.8, 3.3);
  // 祠前两盏挂灯
  for (const sx of [-4.2, 4.2]) {
    const lg = group(sx, 0, -37.6, scene); mesh(cylG(.07, .09, 3.6, 6), wood, 0, 1.8, 0, lg); mesh(boxG(1.1, .07, .07), wood, sx > 0 ? -.45 : .45, 3.45, 0, lg);
    const l = mesh(sphG(.34, 12, 8), lanternM, sx > 0 ? -.85 : .85, 2.85, 0, lg); l.scale.set(1, 1.3, 1); mesh(cylG(.14, .14, .08, 8), wood, sx > 0 ? -.85 : .85, 3.33, 0, lg); mesh(cylG(.14, .14, .08, 8), wood, sx > 0 ? -.85 : .85, 2.37, 0, lg);
    shadowAll(lg); l.castShadow = false; addCol(sx, -37.6, .3); World.lamps.push(l);
    const pl = new T.PointLight(0xff9a4a, 1.6, 16, 2); pl.position.set(sx + (sx > 0 ? -.85 : .85), 2.7, -37.2); scene.add(pl); World.lamps.push(pl);
  }
  // 小径旁的石灯
  const lampGlow = stdMat(0xffb060, { emissive: 0xff9a3a, ei: 2.2 }), capM = stdMat(0x4a4b46, { rough: .9, flat: true, side: T.DoubleSide });
  for (const [x, z] of [[3.6, 21], [-4.6, -6], [3.2, -22]]) {
    const g = group(x, 0, z, scene); mesh(boxG(.7, .26, .7), stone, 0, .13, 0, g); mesh(cylG(.13, .18, 1.1, 8), stone, 0, .8, 0, g); mesh(boxG(.58, .12, .58), stone, 0, 1.4, 0, g);
    const gl = mesh(boxG(.34, .36, .34), lampGlow, 0, 1.64, 0, g); const cp = roofMesh(.92, .92, .36, capM); cp.position.y = 1.82; g.add(cp);
    shadowAll(g); gl.castShadow = false; addCol(x, z, .45); World.lamps.push(gl);
  }
  /* 石碑：竹海听涛 */
  { const sg = group(-16, 0, -19, scene); sg.rotation.y = .5; mesh(boxG(1.9, .5, 1.1), stone, 0, .25, 0, sg); mesh(boxG(1.3, 2.9, .34), stoneD, 0, 1.95, 0, sg);
    const face = new T.Mesh(new T.PlaneGeometry(1.2, 2.5), stdMat(0xffffff, { map: canvasTex(texStele('竹海听涛')), rough: .9 })); face.position.set(0, 1.98, .175); sg.add(face);
    const cap = mesh(boxG(1.5, .22, .5), stone, 0, 3.5, 0, sg); cap.rotation.z = 0; shadowAll(sg); addCol(-16, -19, 1.1); }

  /* 萤火、落叶、地雾 */
  const leaves = fallingBits(scene, { n: 200, w: .05, h: .2, color: 0x56643a, fall: .45, spin: 1.5, drift: [.35, .15], top: [8, 15] });
  const mistLow = mistRing(scene, { n: 18, color: 0x8ea6b4, op: [.05, .1], r: [16, 70], y: [.6, 2.4], sx: [26, 52], sy: [4, 8], fog: true, speed: .6 });
  const mistFar = mistRing(scene, { n: 10, color: 0x5a7080, op: [.08, .16], r: [90, 170], y: [4, 16], sx: [50, 100], sy: [10, 20] });
  let flyT = 0, smokeT = 0;
  World.tick = (dt, t, focus) => {
    leaves(dt, focus); mistLow(dt, t); mistFar(dt, t); wn.offset.x -= dt * .05; wn.offset.y += dt * .012;
    const fl = 1 + Math.sin(t * 9) * .05 + Math.sin(t * 21.3) * .04; for (const l of World.lamps) if (l.isPointLight) l.intensity = 1.6 * fl;
    flyT -= dt; if (flyT < 0) { flyT = .07; const a = rand(TAU), r = rand(3, 26), x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r; FX.add.emit({ x, y: rand(.3, 2.6), z, vx: rand(-.3, .3), vy: rand(-.1, .2), vz: rand(-.3, .3), life: rand(2.5, 5), s0: rand(.06, .1), s1: .02, r: .75, g: 1, b: .45, a: .9, grav: 0, wob: 1.2 }); }
    smokeT -= dt; if (smokeT < 0) { smokeT = .25; for (const s of World.smokes) FX.ink.emit({ x: s.x + rand(-.05, .05), y: s.y, z: s.z, vx: rand(-.05, .05), vy: rand(.25, .45), vz: rand(-.05, .05), life: rand(2, 3), s0: .06, s1: .4, r: .5, g: .52, b: .55, a: .25, grav: -.05, wob: .3 }); }
  };
}

MAPS.bamboo = {
  R: 44, spawn: [0, 30, PI], build: buildBamboo,
  env: {
    fog: 0x0f1b21, fogD: .0105, hemi: [0x3a5878, 0x141c18, .58], sun: [0xb4c8ff, .95], sunDir: [.34, .5, -.8], fill: [0x2f5f66, .3], exp: 1.1,
    sky: { uZen: [.012, .022, .05], uMid: [.035, .06, .1], uHor: [.07, .11, .14], uHor2: [.12, .17, .2], uGlow: [.06, .08, .12], uHalo: [.25, .3, .38], uDisc: [1.5, 1.55, 1.6], uDiscK: .99935,
      uCloudD: [.03, .045, .065], uCloudL: [.25, .3, .38], uCloudG: [.15, .18, .22], uCov: .5, uGround: [.06, .09, .11], uStars: 1, uMoon: 1 },
    envGrad: [[0, '#0a1424'], [.4, '#1a2a3c'], [.5, '#3a4c5a'], [.52, '#141c1c'], [1, '#080a0a']], envGlow: ['rgba(220,232,255,1)', 'rgba(150,170,210,.6)', 'rgba(100,120,160,0)'],
  },
  mini(g, P, k) {
    g.strokeStyle = 'rgba(90,150,190,.55)'; g.lineWidth = Math.max(2, 3.4 * k); g.beginPath(); BAMBOO_STREAM.forEach(([x, z], i) => { const p = P(x, z); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke();
    const p = P(0, -40.8); g.fillStyle = 'rgba(198,59,46,.8)'; g.fillRect(p[0] - 6, p[1] - 4, 12, 8);
  },
};
