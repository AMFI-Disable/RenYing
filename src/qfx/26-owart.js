/* ---------------- 开放世界 · 美术资源：可平铺地表贴图、树叶图集、树皮、树与石的程序化模型 ---------------- */
/* 可平铺噪声：格点按周期 P 取模 */
function tnoise(x, y, P) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = a => ((a % P) + P) % P, x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1);
  return lerp(lerp(hash2(x0, y0), hash2(x1, y0), u), lerp(hash2(x0, y1), hash2(x1, y1), u), v);
}
function tfbm(x, y, P, o = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * tnoise(x * f, y * f, P * f); f *= 2; a *= .5; } return s; }
/* 在 S×S 画布上逐像素填色：fn(u, v) → [r, g, b]（u、v 为 0..1） */
function pixTex(S, fn) {
  const c = makeCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const r = fn(x / S, y / S), i = (y * S + x) * 4; d[i] = r[0]; d[i + 1] = r[1]; d[i + 2] = r[2]; d[i + 3] = r[3] === undefined ? 255 : r[3]; }
  g.putImageData(img, 0, 0); return c;
}
/* 在可平铺画布上画东西：越界的部分在对边再画一次 */
function wrapDraw(g, S, x, y, r, fn) { for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) { const X = x + dx, Y = y + dy; if (X < -r || X > S + r || Y < -r || Y > S + r) continue; fn(X, Y); } }

const OWTex = {};
function owTextures() {
  if (OWTex.ready) return OWTex; const S = 512, rng = mulberry(9);
  /* 草地：底色斑驳 + 成千上万根短草叶 */
  const grass = pixTex(S, (u, v) => { const n = tfbm(u * 8, v * 8, 8, 4), m = tfbm(u * 3 + 5, v * 3, 3, 3); return [52 + 40 * n + 22 * m, 74 + 42 * n, 30 + 16 * n]; });
  { const g = grass.getContext('2d'); for (let i = 0; i < 9000; i++) { const x = rng() * S, y = rng() * S, l = 4 + rng() * 9, a = -PI / 2 + (rng() - .5) * 1.4, k = rng(); g.strokeStyle = `rgba(${90 + k * 70 | 0},${110 + k * 60 | 0},${40 + k * 30 | 0},${.35 + rng() * .4})`; g.lineWidth = .8 + rng() * 1.2; wrapDraw(g, S, x, y, 14, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); g.stroke(); }); }
    for (let i = 0; i < 2600; i++) { const x = rng() * S, y = rng() * S; g.fillStyle = rng() < .5 ? 'rgba(20,28,10,.35)' : 'rgba(150,140,80,.25)'; wrapDraw(g, S, x, y, 3, (X, Y) => g.fillRect(X, Y, 1 + rng() * 2, 1 + rng() * 2)); } }
  /* 泥土 / 山路：夯土、碎石、车辙 */
  const dirt = pixTex(S, (u, v) => { const n = tfbm(u * 6, v * 6, 6, 5), m = tnoise(u * 40, v * 40, 40); return [112 + 46 * n - 14 * m, 92 + 36 * n - 12 * m, 66 + 26 * n - 10 * m]; });
  { const g = dirt.getContext('2d'); for (let i = 0; i < 1300; i++) { const x = rng() * S, y = rng() * S, r = 1.5 + rng() * rng() * 9, l = 92 + rng() * 70, rot = rng() * PI, e = .6 + rng() * .4;
      wrapDraw(g, S, x, y, r * 2, (X, Y) => { g.fillStyle = 'rgba(30,22,14,.45)'; g.beginPath(); g.ellipse(X + r * .25, Y + r * .3, r, r * e, rot, 0, TAU); g.fill(); g.fillStyle = `rgb(${l | 0},${l * .92 | 0},${l * .8 | 0})`; g.beginPath(); g.ellipse(X, Y, r, r * e, rot, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,245,225,.18)'; g.beginPath(); g.ellipse(X - r * .25, Y - r * .3, r * .5, r * e * .4, rot, 0, TAU); g.fill(); }); } }
  /* 岩石：层理 + 裂隙 + 地衣 */
  const wor = (u, v, P, seed) => { const x = u * P, y = v * P, xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const cx = xi + a, cy = yi + b, m = ((cx % P) + P) % P, n = ((cy % P) + P) % P, px = cx + hash2(m + seed, n), py = cy + hash2(n + seed * 3, m + 7), d = Math.hypot(px - x, py - y); if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; } return [f1, f2]; };
  const rock = pixTex(S, (u, v) => {
    const wu = u + (tfbm(u * 4, v * 4, 4, 3) - .5) * .08, wv = v + (tfbm(u * 4 + 7, v * 4, 4, 3) - .5) * .08, [a1, a2] = wor(wu, wv, 6, 11), [b1, b2] = wor(wu, wv, 15, 23);
    const n = tfbm(u * 8, v * 8, 8, 5), cm = sstep(.42, .6, tfbm(u * 3 + 1, v * 3, 3, 3)), crack = sstep(.045, .0, a2 - a1) * .55 * cm + sstep(.03, 0, b2 - b1) * .22 * cm, face = .3 + .25 * sstep(0, .8, a1) + n * .7;
    const l = (66 + 100 * face) * (1 - crack * .6), li = sstep(.6, .72, tfbm(u * 9 + 9, v * 9 + 2, 9, 3)) * (1 - crack);
    return [l * 1.02 - li * 8, l * (.99 + li * .14), l * .93 - li * 14];
  });
  /* 林下：苔藓、落叶、细枝 */
  const moss = pixTex(S, (u, v) => { const n = tfbm(u * 7, v * 7, 7, 5); return [40 + 32 * n, 52 + 34 * n, 26 + 14 * n]; });
  { const g = moss.getContext('2d'), cols = ['#7a4a22', '#8e3a1c', '#6a5a2a', '#a8642a', '#4a3a20']; for (let i = 0; i < 1400; i++) { const x = rng() * S, y = rng() * S, r = 3 + rng() * 6, rot = rng() * TAU, c = cols[i % 5];
      wrapDraw(g, S, x, y, r * 2, (X, Y) => { g.save(); g.translate(X, Y); g.rotate(rot); g.globalAlpha = .45 + rng() * .4; g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, r, r * .45, 0, 0, TAU); g.fill(); g.restore(); }); }
    g.globalAlpha = .5; g.strokeStyle = '#2a2014'; for (let i = 0; i < 160; i++) { const x = rng() * S, y = rng() * S, a = rng() * TAU, l = 8 + rng() * 22; g.lineWidth = .8 + rng(); wrapDraw(g, S, x, y, 30, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); g.stroke(); }); } g.globalAlpha = 1; }
  const T4 = c => canvasTex(c, true, 1), N4 = (c, s) => canvasTex(normalFromCanvas(c, s), false, 1);
  Object.assign(OWTex, { grass: T4(grass), grassN: N4(grass, 2), dirt: T4(dirt), dirtN: N4(dirt, 3), rock: T4(rock), rockN: N4(rock, 3.2), moss: T4(moss), mossN: N4(moss, 2) });
  /* 大尺度色斑：打破平铺感 */
  OWTex.macro = T4(pixTex(256, (u, v) => { const n = tfbm(u * 4, v * 4, 4, 5) * 255; return [n, tfbm(u * 9 + 3, v * 9, 9, 3) * 255, n]; }));
  OWTex.leaf = owLeafAtlas(); OWTex.bark = owBark();
  OWTex.ready = true; return OWTex;
}
/* 树叶图集 2×2：松针、枫叶、阔叶、竹叶。透明底，alphaTest 裁剪 */
function owLeafAtlas() {
  const S = 1024, h = 512, c = makeCanvas(S, S), g = c.getContext('2d'), rng = mulberry(77);
  const cell = (cx, cy, fn) => { g.save(); g.beginPath(); g.rect(cx * h, cy * h, h, h); g.clip(); g.translate(cx * h + h / 2, cy * h + h / 2); fn(); g.restore(); };
  const twig = (x0, y0, x1, y1, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (rng() - .5) * 30, (y0 + y1) / 2 + (rng() - .5) * 30, x1, y1); g.stroke(); };
  // 松：一簇簇放射的针叶，整体扁平
  cell(0, 0, () => {
    for (let k = 0; k < 7; k++) { const a = rng() * TAU; twig(0, 0, Math.cos(a) * 180, Math.sin(a) * 110, 5, '#3a2a1c'); }
    for (let i = 0; i < 46; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * 190, x = Math.cos(a) * r, y = Math.sin(a) * r * .6, n = 34 + rng() * 20 | 0, L = 34 + rng() * 26, dk = rng();
      for (let k = 0; k < n; k++) { const b = rng() * TAU, l = L * (.6 + rng() * .4), t = rng(); g.strokeStyle = `rgb(${30 + 30 * t + dk * 10 | 0},${56 + 46 * t + dk * 16 | 0},${30 + 22 * t | 0})`; g.lineWidth = 1.6 + rng() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l * .8); g.stroke(); }
    }
  });
  // 枫：五裂掌状叶，深红到橙黄
  const maple = (x, y, s, rot, col) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.fillStyle = col; g.beginPath();
    for (let i = 0; i <= 10; i++) { const a = -PI / 2 + i / 10 * TAU, r = i % 2 ? .42 : (i === 0 || i === 10 ? 1 : i === 4 || i === 6 ? .72 : .92); const aa = a + (i % 2 ? 0 : 0); g.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); }
    g.closePath(); g.fill(); g.strokeStyle = 'rgba(60,10,6,.35)'; g.lineWidth = .04; for (const a of [-PI / 2, -PI / 2 + 1.26, -PI / 2 - 1.26, PI / 2 + .62, PI / 2 - .62]) { g.beginPath(); g.moveTo(0, .2); g.lineTo(Math.cos(a) * .8, Math.sin(a) * .8); g.stroke(); } g.restore();
  };
  cell(1, 0, () => {
    for (let k = 0; k < 8; k++) { const a = rng() * TAU; twig(0, 0, Math.cos(a) * 200, Math.sin(a) * 200, 4, '#3a2418'); }
    const cols = ['#8e1a10', '#a8220f', '#c2381a', '#d4521c', '#e0702a', '#e89a34', '#b0281a', '#7a1410'];
    for (let i = 0; i < 150; i++) { const a = rng() * TAU, r = Math.pow(rng(), .7) * 205, s = 20 + rng() * 22; maple(Math.cos(a) * r, Math.sin(a) * r, s, rng() * TAU, cols[rng() * cols.length | 0]); }
  });
  // 阔叶：卵形叶
  cell(0, 1, () => {
    for (let k = 0; k < 8; k++) { const a = rng() * TAU; twig(0, 0, Math.cos(a) * 200, Math.sin(a) * 200, 4, '#3a2a1c'); }
    for (let i = 0; i < 260; i++) { const a = rng() * TAU, r = Math.pow(rng(), .7) * 210, x = Math.cos(a) * r, y = Math.sin(a) * r, s = 12 + rng() * 10, t = rng(); g.save(); g.translate(x, y); g.rotate(rng() * TAU); g.fillStyle = `rgb(${38 + 46 * t | 0},${64 + 52 * t | 0},${26 + 20 * t | 0})`; g.beginPath(); g.ellipse(0, 0, s * 1.6, s * .75, 0, 0, TAU); g.fill(); g.restore(); }
  });
  // 竹：细长披针叶，从枝上垂下
  cell(1, 1, () => {
    for (let k = 0; k < 9; k++) {
      const a = -PI / 2 + (rng() - .5) * 2.6, L = 120 + rng() * 110, x1 = Math.cos(a) * L, y1 = Math.sin(a) * L * .6; twig(0, -40, x1, y1, 3, '#5a6a2a');
      for (let i = 0; i < 9; i++) { const t = .3 + i / 9 * .7, x = x1 * t, y = -40 + (y1 + 40) * t, b = (a > -PI / 2 ? .7 : PI - .7) + (rng() - .5) * 1.2 + PI / 2 * .4, l = 70 + rng() * 60, w = 9 + rng() * 6, k = rng();
        g.save(); g.translate(x, y); g.rotate(b); g.fillStyle = `rgb(${62 + 50 * k | 0},${104 + 54 * k | 0},${38 + 20 * k | 0})`; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * .4, -w, l, 0); g.quadraticCurveTo(l * .4, w, 0, 0); g.fill(); g.strokeStyle = 'rgba(30,50,20,.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(l * .9, 0); g.stroke(); g.restore(); }
    }
  });
  const t = canvasTex(c); t.generateMipmaps = true; return t;
}
/* 树皮：竖向纤维与裂纹 */
function owBark() {
  const c = pixTex(256, (u, v) => { const n = tfbm(u * 6, v * 2, 6, 4), f = Math.abs(tfbm(u * 14 + tnoise(v * 4, u * 4, 4) * .6, v * 3, 14, 3) * 2 - 1), l = 60 + 50 * n - 46 * sstep(.08, 0, f); return [l * 1.05, l * .9, l * .78]; });
  return { map: canvasTex(c, true, 1), nm: canvasTex(normalFromCanvas(c, 3.5), false, 1) };
}

/* ---- 几何累加器：一棵树、一块石都拼进同一个 BufferGeometry ---- */
class GAcc {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  get v() { return this.p.length / 3; }
  vert(p, n, u, v, c) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.u.push(u, v); this.c.push(c[0], c[1], c[2]); }
  /* 沿折线的锥管：pts 为 V3，rs 为半径 */
  tube(pts, rs, seg, col, vScale = .5) {
    const v0 = this.v, up = new V3(0, 1, 0), t = new V3(), a = new V3(), b = new V3(), p = new V3(), nn = new V3(); let L = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i < pts.length - 1) t.subVectors(pts[i + 1], pts[i]).normalize(); else t.subVectors(pts[i], pts[i - 1]).normalize();
      a.crossVectors(Math.abs(t.y) > .95 ? new V3(1, 0, 0) : up, t).normalize(); b.crossVectors(t, a);
      if (i) L += pts[i].distanceTo(pts[i - 1]);
      for (let k = 0; k <= seg; k++) { const an = k / seg * TAU; nn.copy(a).multiplyScalar(Math.cos(an)).addScaledVector(b, Math.sin(an)); p.copy(pts[i]).addScaledVector(nn, rs[i]); const sh = .82 + .18 * Math.sin(an * 3 + i); this.vert(p, nn, k / seg * Math.max(1, Math.round(rs[0] * 9)), L * vScale, [col[0] * sh, col[1] * sh, col[2] * sh]); }
    }
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < seg; k++) { const A = v0 + i * (seg + 1) + k, B = A + seg + 1; this.i.push(A, B, A + 1, A + 1, B, B + 1); }
  }
  /* 叶片卡：中心 c、右 r、上 u（含半长），图集格 cell，法线 nrm（朝外的“球面法线”让树冠受光柔和） */
  card(c, r, u, cell, nrm, col) {
    const v0 = this.v, cx = (cell % 2) * .5, cy = (cell >> 1) * .5, q = new V3();
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]], sg = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) { q.copy(c).addScaledVector(r, sg[k][0]).addScaledVector(u, sg[k][1]); this.vert(q, nrm, cx + uv[k][0] * .5, 1 - (cy + (1 - uv[k][1]) * .5), col); }
    this.i.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  }
  geo() {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i); g.computeBoundingSphere(); return g;
  }
}
/* 一根弯曲的枝：从 p0 沿 dir 长 len，逐段受“趋光/下垂”与随机弯折 */
function owLimb(rng, p0, dir, len, n, bend, trop) {
  const pts = [p0.clone()], d = dir.clone().normalize(), p = p0.clone();
  for (let i = 1; i <= n; i++) { d.x += (rng() - .5) * bend; d.z += (rng() - .5) * bend; d.y += trop; d.normalize(); p.addScaledVector(d, len / n); pts.push(p.clone()); }
  return pts;
}
/* 树：kind = pine 黄山松 / maple 枫 / broad 阔叶 / dead 枯木。返回 { bark, leaf, h, r } */
function owTree(kind, seed) {
  const rng = mulberry(seed), B = new GAcc(), L = new GAcc(), up = new V3(0, 1, 0), cell = { pine: 0, maple: 1, broad: 2 }[kind];
  const barkC = kind === 'dead' ? [.5, .47, .45] : kind === 'pine' ? [.5, .4, .34] : [.36, .32, .29], tips = [];
  const H = kind === 'pine' ? 12 + rng() * 6 : kind === 'maple' ? 8.5 + rng() * 3 : kind === 'broad' ? 11 + rng() * 4 : 6 + rng() * 4;
  const R0 = H * (kind === 'pine' ? .03 : kind === 'broad' ? .05 : .045);
  // 主干
  const lean = new V3((rng() - .5) * (kind === 'pine' ? .7 : .3), 1, (rng() - .5) * (kind === 'pine' ? .7 : .3));
  const trunk = owLimb(rng, new V3(0, -.4, 0), lean, H * (kind === 'pine' ? 1 : .55), 8, kind === 'pine' || kind === 'dead' ? .5 : .25, .05);
  const tr = trunk.map((_, i) => R0 * (1 - i / trunk.length * .65) * (i === 0 ? 1.35 : 1));
  B.tube(trunk, tr, 9, barkC);
  // 根部隆起
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + rng(); B.tube([new V3(Math.cos(a) * R0 * 2.2, -.25, Math.sin(a) * R0 * 2.2), new V3(Math.cos(a) * R0 * .6, .7, Math.sin(a) * R0 * .6)], [R0 * .35, R0 * .5], 5, barkC); }
  const top = trunk[trunk.length - 1];
  const sub = (p, d, len, r, depth) => {
    const pts = owLimb(rng, p, d, len, 4, kind === 'dead' ? .9 : .5, kind === 'pine' ? -.02 : kind === 'dead' ? .02 : .08), rs = pts.map((_, i) => r * (1 - i / pts.length * .7)); B.tube(pts, rs, 5, barkC);
    const end = pts[pts.length - 1]; if (depth <= 0 || r < .03) { tips.push(end); return; }
    const nk = kind === 'pine' ? 2 : 2 + (rng() * 2 | 0);
    for (let k = 0; k < nk; k++) { const q = pts[2 + (rng() * 3 | 0)] || end, nd = d.clone().add(new V3((rng() - .5) * 1.4, (rng() - .2) * (kind === 'pine' ? .2 : .9), (rng() - .5) * 1.4)).normalize(); sub(q, nd, len * (.55 + rng() * .2), r * .6, depth - 1); }
    tips.push(end);
  };
  if (kind === 'pine') {
    // 黄山松：枝条近乎平展，层层叠叠；顶上一片伞盖
    const nb = 6 + (rng() * 4 | 0);
    for (let k = 0; k < nb; k++) { const t = .42 + k / nb * .55, i = Math.min(trunk.length - 1, Math.floor(t * trunk.length)), a = rng() * TAU, d = new V3(Math.cos(a), (rng() - .3) * .35, Math.sin(a)); sub(trunk[i], d, H * (.42 - t * .2) * (.8 + rng() * .5), tr[i] * .6, 1); }
    tips.push(top);
  } else if (kind !== 'dead' || true) {
    const nb = kind === 'dead' ? 4 + (rng() * 3 | 0) : kind === 'broad' ? 5 + (rng() * 2 | 0) : 4 + (rng() * 2 | 0);
    for (let k = 0; k < nb; k++) { const a = k / nb * TAU + rng() * .8, i = Math.floor(trunk.length * (.55 + rng() * .4)), d = new V3(Math.cos(a) * .8, .75 + rng() * .5, Math.sin(a) * .8); sub(trunk[Math.min(i, trunk.length - 1)], d, H * (.42 + rng() * .15), tr[Math.min(i, trunk.length - 1)] * .7, kind === 'dead' ? 2 : 2); }
  }
  // 树冠：在枝梢周围撒叶片卡
  let cy = 0, crad = 1; if (tips.length) { const c = new V3(); for (const t of tips) c.add(t); c.multiplyScalar(1 / tips.length); cy = c.y; for (const t of tips) crad = Math.max(crad, Math.hypot(t.x - c.x, t.z - c.z)); }
  if (kind !== 'dead') {
    const cc = new V3(0, cy, 0), q = new V3(), r = new V3(), u = new V3(), nrm = new V3();
    for (const tp of tips) {
      const n = kind === 'pine' ? 7 : 7;
      for (let k = 0; k < n; k++) {
        const s = kind === 'pine' ? 1.3 + rng() * .9 : kind === 'maple' ? 1.2 + rng() * .8 : 1.5 + rng() * .9;
        q.copy(tp).add(new V3((rng() - .5) * s * 1.4, (rng() - .3) * s * (kind === 'pine' ? .35 : 1), (rng() - .5) * s * 1.4));
        if (kind === 'pine') { const a = rng() * TAU, tilt = (rng() - .5) * .5; r.set(Math.cos(a), tilt, Math.sin(a)).normalize().multiplyScalar(s); u.set(-Math.sin(a), (rng() - .5) * .3, Math.cos(a)).normalize().multiplyScalar(s * .8); }
        else { r.set(rng() - .5, rng() - .5, rng() - .5).normalize(); u.set(rng() - .5, rng() - .5, rng() - .5).cross(r).normalize(); r.multiplyScalar(s); u.multiplyScalar(s); }
        nrm.subVectors(q, cc); const rad = Math.hypot(nrm.x, nrm.z) / crad; nrm.y = nrm.y * .6 + (kind === 'pine' ? 1.2 : .5); nrm.normalize(); const k2 = .8 + rng() * .3, hk = (.55 + .45 * sat(rad)) * (.8 + .3 * sat((q.y - cy + 2) / 5));
        L.card(q, r, u, cell, nrm, [k2 * hk, k2 * hk, k2 * hk]);
      }
    }
  }
  return { bark: B.geo(), leaf: kind === 'dead' ? null : L.geo(), h: H, r: crad + 1.5 };
}
/* 竹子一丛：竿与叶分两份几何；单位是整丛 */
function owBambooClump(seed) {
  const rng = mulberry(seed), B = new GAcc(), L = new GAcc(), n = 7 + (rng() * 6 | 0);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng()) * 2.2, x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = 11 + rng() * 7, lx = (rng() - .5) * 2.2 + x * .35, lz = (rng() - .5) * 2.2 + z * .35, r0 = .07 + rng() * .05;
    const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new V3(x + lx * t * t, -.3 + h * t, z + lz * t * t)); }
    const g = .78 + rng() * .3; B.tube(pts, pts.map((_, k) => r0 * (1 - k / 8 * .5)), 6, [.62 * g, .78 * g, .42 * g], 1);
    for (let k = 0; k < 7; k++) { const t = .45 + rng() * .55, p = new V3(x + lx * t * t, -.3 + h * t, z + lz * t * t), s = 1.1 + rng() * .8, r = new V3(rng() - .5, (rng() - .5) * .6, rng() - .5).normalize().multiplyScalar(s), u = new V3(0, -1, 0).cross(r).normalize().multiplyScalar(s).add(new V3(0, -s * .4, 0)), nrm = new V3(p.x, 1.5, p.z).normalize(), k2 = .8 + rng() * .35; L.card(p.add(new V3(0, -s * .2, 0)), r, u, 3, nrm, [k2, k2, k2]); }
  }
  return { bark: B.geo(), leaf: L.geo() };
}
/* 石头：二十面体细分后用三维噪声推挤，底部压平 */
function owRock(seed, flat = .7, det = 3) {
  const rng = mulberry(seed), g = new T.IcosahedronGeometry(1, det), p = g.attributes.position, o = [rng() * 50, rng() * 50, rng() * 50], sq = [.8 + rng() * .5, flat * (.7 + rng() * .5), .8 + rng() * .5];
  const n3 = (x, y, z) => (fbm(x + o[0], z + o[2] + y * 1.7, 4) + fbm(y * 1.3 + o[1], x * 1.1 - z, 3)) * .5;
  for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = .62 + .8 * n3(x * 1.4, y * 1.4, z * 1.4) + (Math.abs(fbm(x * 4 + o[1], y * 4 + z * 3, 2) - .5) < .04 ? -.04 : 0); x *= k * sq[0]; y *= k * sq[1]; z *= k * sq[2]; if (y < -.25) y = -.25 + (y + .25) * .2; p.setXYZ(i, x, y + .2, z); }
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
/* 草丛：五片弯曲的草叶，每片 4 节；颜色根暗梢亮 */
function owGrassGeo() {
  const pos = [], col = [], nor = [], idx = [], rng = mulberry(5);
  for (let b = 0; b < 5; b++) {
    const a = rng() * TAU, ox = (rng() - .5) * .3, oz = (rng() - .5) * .3, lean = .18 + rng() * .3, w = .026 + rng() * .016, h = .42 + rng() * .4, ca = Math.cos(a), sa = Math.sin(a), v0 = pos.length / 3;
    for (let k = 0; k <= 4; k++) { const t = k / 4, ww = w * (1 - t * .92), y = h * t, f = lean * t * t; for (const s of [-1, 1]) { pos.push(ox + ca * ww * s + sa * f, y, oz - sa * ww * s + ca * f); const c = .45 + .65 * t; col.push(c, c, c); nor.push(sa * .3, 1, ca * .3); } }
    for (let k = 0; k < 4; k++) { const A = v0 + k * 2; idx.push(A, A + 1, A + 2, A + 1, A + 3, A + 2); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
}
