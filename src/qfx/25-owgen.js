/* ---------------- 开放世界 · 青云山：地形生成 ----------------
   一千米见方。南麓山门起步，西有枫林古道、黑风寨，东有竹海，中间寒潭，
   北面一道断崖，飞瀑垂落；崖上古寺，再往北是剑冢。 */
const OW = {
  N: 513, cell: 2, x0: -512, z0: -512, WL: 15.5,
  REG: [
    { id: 'shan', n: '山门', sub: '青云旧址', x: 0, z: 372, r: 60, h: 2, lv: 1, tint: [1, 1.04, .92] },
    { id: 'feng', n: '枫林古道', sub: '霜叶红于二月花', x: -165, z: 225, r: 80, h: 13, lv: 2, tint: [1.32, .98, .58], au: 1 },
    { id: 'zhai', n: '黑风寨', sub: '匪窟', x: -300, z: 62, r: 62, h: 27, lv: 4, tint: [1.1, .95, .72], au: .5, dry: .3 },
    { id: 'zhu', n: '竹海', sub: '万竿摇碧', x: 215, z: 185, r: 90, h: 17, lv: 4, tint: [.86, 1.1, .86] },
    { id: 'zhu2', n: '竹海深处', sub: '无相之地', x: 305, z: 50, r: 40, h: 22, lv: 6, tint: [.82, 1.08, .86] },
    { id: 'tan', n: '寒潭', sub: '飞瀑千尺', x: 0, z: 60, r: 100, h: 19, lv: 3, tint: [.96, 1.04, 1] },
    { id: 'si', n: '古寺', sub: '钟声已绝', x: 20, z: -170, r: 62, h: 75, lv: 6, tint: [1.04, 1, .86], dry: .3, au: .2 },
    { id: 'zhong', n: '剑冢', sub: '万剑同悲', x: 0, z: -325, r: 78, h: 85, lv: 8, tint: [.9, .84, .8], dry: .85 },
  ],
  /* 路：ramp 表示两端高度直线连起来（崖边盘山道） */
  ROADS: [
    { p: [[0, 392], [0, 360], [-28, 328], [-70, 296], [-112, 262], [-165, 225]] },
    { p: [[-165, 225], [-205, 186], [-246, 140], [-280, 100], [-300, 66]] },
    { p: [[6, 356], [48, 326], [108, 280], [160, 232], [215, 185]] },
    { p: [[-165, 225], [-128, 172], [-82, 128], [-52, 104]] },
    { p: [[215, 185], [168, 140], [118, 104], [78, 82]] },
    { p: [[215, 185], [262, 130], [290, 84], [305, 52]] },
    { p: [[78, 70], [118, 40], [140, 8], [132, -28], [104, -54], [72, -78], [52, -110], [34, -140], [20, -170]], ramp: true },
    { p: [[20, -170], [8, -220], [-6, -270], [0, -325]] },
  ],
  /* 平台：建筑、神龛脚下压平 */
  PADS: [[0, 372, 30], [-300, 62, 44], [305, 50, 24], [20, -170, 40], [0, -325, 40], [-58, 118, 9], [-8, 352, 6], [-150, 236, 7], [-252, 120, 7], [190, 232, 7], [298, 92, 6], [44, -126, 7], [10, -262, 7]],
  LAKE: { x: 0, z: 34, rx: 88, rz: 56 },
  /* 土地庙：歇脚、存档、回血补丹、传送；敌营在此重整 */
  SHRINES: [
    { id: 0, n: '山门土地庙', x: -8, z: 352 }, { id: 1, n: '枫林驿', x: -150, z: 236 }, { id: 2, n: '黑风岭', x: -252, z: 120 }, { id: 3, n: '寒潭亭', x: -58, z: 118 },
    { id: 4, n: '竹海小筑', x: 190, z: 232 }, { id: 5, n: '竹海深处', x: 298, z: 92 }, { id: 6, n: '古寺山门', x: 44, z: -126 }, { id: 7, n: '剑冢碑林', x: 10, z: -262 },
  ],
  /* 敌营：lv 为等级，comp 为兵种 */
  CAMPS: [
    { x: 30, z: 324, lv: 1, comp: { bandit: 3 } }, { x: -84, z: 286, lv: 1, comp: { wolf: 3 } }, { x: 96, z: 292, lv: 1, comp: { bandit: 2, archer: 1 } },
    { x: -190, z: 254, lv: 2, comp: { bandit: 3, archer: 1 } }, { x: -128, z: 186, lv: 2, comp: { wolf: 4 } }, { x: -214, z: 172, lv: 3, comp: { spear: 2, bandit: 2 } },
    { x: -318, z: 34, lv: 4, comp: { bandit: 3, spear: 2, archer: 2 } }, { x: -270, z: 92, lv: 4, comp: { brute: 1, bandit: 2 } },
    { x: 232, z: 222, lv: 3, comp: { assassin: 2, archer: 2 } }, { x: 168, z: 152, lv: 4, comp: { wraith: 1, assassin: 2 } }, { x: 270, z: 116, lv: 5, comp: { assassin: 3, wraith: 1 } },
    { x: 62, z: 102, lv: 3, comp: { wolf: 3, spear: 1 } }, { x: -92, z: 64, lv: 3, comp: { bandit: 2, wraith: 1 } }, { x: 130, z: -12, lv: 5, comp: { spear: 2, archer: 2 } },
    { x: 18, z: -196, lv: 6, comp: { slave: 3, wraith: 1 } }, { x: -32, z: -152, lv: 6, comp: { brute: 1, slave: 2 } }, { x: -22, z: -282, lv: 7, comp: { spirit: 4, slave: 2 } }, { x: 42, z: -306, lv: 8, comp: { brute: 1, spirit: 3, wraith: 1 } },
  ],
  BOSSES: [
    { type: 'boss1', x: -300, z: 70, r: 22, lv: 5, n: '黑风寨' }, { type: 'boss3', x: 305, z: 48, r: 20, lv: 6, n: '竹海深处' }, { type: 'boss2', x: 0, z: -338, r: 24, lv: 9, n: '剑冢' },
  ],
  POOL: { x: 0, z: -98, r: 11, wl: 72.4 },
};
OW.reg = id => OW.REG.find(r => r.id === id);

function owSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1), x = ax + dx * t - px, z = az + dz * t - pz;
  return [x * x + z * z, t];
}
/* 把路折线按 4 米重采样，并给每个点一个平滑过的路面高度 */
function owRoads(raw) {
  const out = [];
  for (const R of OW.ROADS) {
    const pts = []; for (let i = 0; i < R.p.length - 1; i++) { const [ax, az] = R.p[i], [bx, bz] = R.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4)); for (let k = 0; k < n; k++) pts.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]); }
    pts.push(R.p[R.p.length - 1].slice());
    let h = pts.map(p => raw(p[0], p[1]));
    if (R.ramp) { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const h0 = h[0], h1 = h[h.length - 1]; h = L.map(l => lerp(h0, h1, smooth(l / L[L.length - 1]) * .3 + l / L[L.length - 1] * .7)); }
    else for (let it = 0; it < 40; it++) { const nh = h.slice(); for (let i = 1; i < h.length - 1; i++) nh[i] = (h[i - 1] + h[i] * 2 + h[i + 1]) / 4; h = nh; }
    out.push({ pts, h, w: R.ramp ? 5 : 4.2 });
  }
  return out;
}
/* 生成整张高度图与它的配套数据（贴图权重、草密度、可走距离场） */
function owGenerate() {
  const { N, cell, x0, z0, REG, LAKE, POOL } = OW, NN = N * N;
  const south = REG.filter(r => r.h < 40), north = REG.filter(r => r.h >= 40);
  const shep = (list, x, z) => { let s = 0, w = 0; for (const r of list) { const d2 = (x - r.x) ** 2 + (z - r.z) ** 2, k = 1 / Math.pow(d2 + 900, 1.35); s += r.h * k; w += k; } return s / w; };
  const edgeK = (x, z) => { const e = Math.pow(Math.pow(Math.abs(x) / 455, 4) + Math.pow(Math.abs(z - 20) / 480, 4), .25); return sstep(.84, 1.0, e + (fbm(x * .008 + 7, z * .008, 3) - .5) * .16); };
  /* 未经道路平整的原始地形 */
  const base = (x, z) => {
    const cliff = sstep(-24, -76, z + (fbm(x * .006, 3.3, 3) - .5) * 70 * sstep(10, 60, Math.abs(x)));
    return lerp(shep(south, x, z), shep(north, x, z), cliff);
  };
  const walkOf = (x, z, rd) => {
    let m = 0; for (const r of REG) { const d = Math.hypot(x - r.x, z - r.z); m = Math.max(m, 1 - sstep(r.r * .8, r.r + 55, d)); }
    return Math.max(m, 1 - sstep(8, 46, rd));
  };
  const wild = (x, z) => { const wx = x + (fbm(x * .004 + 1, z * .004 + 2, 3) - .5) * 140, wz = z + (fbm(x * .004 + 5, z * .004 - 3, 3) - .5) * 140; x = wx; z = wz; const f = fbm(x * .0042 + 13.1, z * .0042 - 4.2, 5), rg = 1 - Math.abs(2 * f - 1), f2 = fbm(x * .011 - 3, z * .011 + 8, 4), r2 = 1 - Math.abs(2 * f2 - 1); return rg * rg * 1.1 + r2 * r2 * .32 + fbm(x * .03, z * .03, 3) * .12; };
  const roads = owRoads((x, z) => base(x, z));
  const H = new Float32Array(NN), RD = new Float32Array(NN), WK = new Float32Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, idx = j * N + i;
    // 最近的路段与路面高度
    let rd2 = 1e12, rh = 0, rw = 4;
    for (const R of roads) { const P = R.pts; for (let k = 0; k < P.length - 1; k++) { const a = P[k], b = P[k + 1]; if ((Math.abs(x - a[0]) > 70 && Math.abs(x - b[0]) > 70) || (Math.abs(z - a[1]) > 70 && Math.abs(z - b[1]) > 70)) continue; const [d2, t] = owSegDist(x, z, a[0], a[1], b[0], b[1]); if (d2 < rd2) { rd2 = d2; rh = lerp(R.h[k], R.h[k + 1], t); rw = R.w; } } }
    const rd = Math.sqrt(rd2), wk = walkOf(x, z, rd), b0 = base(x, z);
    let h = b0 + wild(x, z) * lerp(46, 3.5, wk) + (fbm(x * .06 + 3, z * .06, 3) - .5) * 1.6;
    // 道路：路面平整，两侧过渡成路堑与路堤
    h = lerp(rh + (fbm(x * .1, z * .1, 2) - .5) * .25, h, sstep(rw, rw + 16, rd));
    // 平台
    for (const [px, pz, pr] of OW.PADS) { const d = Math.hypot(x - px, z - pz); if (d < pr + 18) { const ph = base(px, pz); h = lerp(ph, h, sstep(pr, pr + 16, d)); } }
    // 寒潭：椭圆湖盆
    { const e = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) + (fbm(x * .03, z * .03, 3) - .5) * .22; if (e < 1.25) { const k = sstep(1.25, .78, e), deep = OW.WL - .3 - 7.5 * sstep(1, .1, e); h = lerp(h, Math.min(h, deep), k); } }
    // 崖上泉池
    { const d = Math.hypot(x - POOL.x, z - POOL.z); if (d < POOL.r + 10) h = lerp(Math.min(h, POOL.wl - 2.4 * sstep(POOL.r, 0, d) - .2), h, sstep(POOL.r, POOL.r + 9, d)); }
    // 瀑布缺口
    if (Math.abs(x) < 9 && z > -96 && z < -60) h -= 1.8 * sstep(9, 3, Math.abs(x)) * sstep(-96, -86, z);
    h += edgeK(x, z) * (150 + 90 * fbm(x * .02, z * .02, 3));
    H[idx] = h; RD[idx] = rd; WK[idx] = wk;
  }
  /* 坡度、贴图权重、地色、草 */
  const WT = new Float32Array(NN), EX = new Float32Array(NN * 3), SL = new Float32Array(NN), SP = new Float32Array(NN * 4), TC = new Float32Array(NN * 3), GR = new Float32Array(NN), NM = new Float32Array(NN * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const idx = j * N + i, x = x0 + i * cell, z = z0 + j * cell, hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(N - 1, i + 1)], hd = H[Math.max(0, j - 1) * N + i], hu = H[Math.min(N - 1, j + 1) * N + i];
    const dx = (hr - hl) / (2 * cell), dz = (hu - hd) / (2 * cell), s = Math.hypot(dx, dz); SL[idx] = s;
    const nl = 1 / Math.hypot(dx, 1, dz); NM[idx * 3] = -dx * nl; NM[idx * 3 + 1] = nl; NM[idx * 3 + 2] = -dz * nl;
    const h = H[idx], n1 = fbm(x * .03 + 1, z * .03 - 2, 3), n2 = noise2(x * .2, z * .2);
    let rock = sstep(.72, 1.08, s + (n1 - .5) * .4) + sstep(170, 230, h) * .5, road = (1 - sstep(2.6, 5.2, RD[idx] + (n2 - .5) * 1.4)) * (1 - rock);
    for (const [px, pz, pr] of OW.PADS) { const d = Math.hypot(x - px, z - pz); if (d < pr) road = Math.max(road, sstep(pr, pr * .55, d + (n1 - .5) * 6) * .85); }
    const wet = sstep(OW.WL + 1.2, OW.WL - .2, h) * (1 - sstep(1.3, 1.45, Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz)));
    rock = sat(rock + wet * .5); WT[idx] = Math.max(wet, sstep(POOL.wl + 1, POOL.wl, h) * sstep(POOL.r + 8, POOL.r, Math.hypot(x - POOL.x, z - POOL.z))); let moss = sat(Math.max(sstep(.35, .7, n1) * .8, sstep(.28, .62, s) * .75) * (1 - rock) * (1 - road)), grass = sat(1 - rock - road - moss);
    const t = SP.subarray(idx * 4, idx * 4 + 4); t[0] = grass; t[1] = road; t[2] = rock; t[3] = moss;
    // 地色：按区域染（枫林偏金红、竹海偏青、剑冢偏灰）
    let tr = 0, tg = 0, tb = 0, tw = 0, ta = 0, td = 0; for (const r of REG) { const d2 = (x - r.x) ** 2 + (z - r.z) ** 2, k = 1 / Math.pow(d2 + 2500, 1.6); tr += r.tint[0] * k; tg += r.tint[1] * k; tb += r.tint[2] * k; ta += (r.au || 0) * k; td += (r.dry || 0) * k; tw += k; }
    EX[idx * 3 + 1] = ta / tw; EX[idx * 3 + 2] = td / tw;
    const v = .9 + .2 * n2; TC[idx * 3] = tr / tw * v; TC[idx * 3 + 1] = tg / tw * v; TC[idx * 3 + 2] = tb / tw * v;
    GR[idx] = EX[idx * 3] = grass * sstep(.55, .3, s) * (1 - WT[idx]) * (h < OW.WL + .3 && Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.35 ? 0 : 1) * (.55 + .45 * sstep(.3, .6, fbm(x * .05 + 9, z * .05, 2)));
  }
  /* 可走距离场：陡坡、深水、界外为禁区；双遍倒角距离变换 */
  const BL = new Uint8Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const idx = j * N + i, x = x0 + i * cell, z = z0 + j * cell, deepLake = H[idx] < OW.WL - .9 && Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.4, deepPool = H[idx] < POOL.wl - 1 && Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 4;
    BL[idx] = (SL[idx] > .82 && RD[idx] > 5.5) || deepLake || deepPool || edgeK(x, z) > .5 ? 1 : 0;
  }
  const D = owChamfer(BL, N, cell);
  return { H, SP, TC, GR, EX, WT, NM, SL, RD, WK, sdf: { d: D, N, cell, x0, z0 } };
}
/* 有向距离：禁区内为正（到可走区的距离），可走区为负 */
function owChamfer(BL, N, cell) {
  const INF = 1e6, a = new Float32Array(N * N), b = new Float32Array(N * N), d1 = cell, d2 = cell * Math.SQRT2;
  for (let i = 0; i < N * N; i++) { a[i] = BL[i] ? INF : 0; b[i] = BL[i] ? 0 : INF; }
  const pass = f => {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; let v = f[k]; if (i > 0) v = Math.min(v, f[k - 1] + d1); if (j > 0) { v = Math.min(v, f[k - N] + d1); if (i > 0) v = Math.min(v, f[k - N - 1] + d2); if (i < N - 1) v = Math.min(v, f[k - N + 1] + d2); } f[k] = v; }
    for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; let v = f[k]; if (i < N - 1) v = Math.min(v, f[k + 1] + d1); if (j < N - 1) { v = Math.min(v, f[k + N] + d1); if (i < N - 1) v = Math.min(v, f[k + N + 1] + d2); if (i > 0) v = Math.min(v, f[k + N - 1] + d2); } f[k] = v; }
  };
  pass(a); pass(b);
  const out = new Float32Array(N * N); for (let i = 0; i < N * N; i++) out[i] = BL[i] ? a[i] - cell * .5 : -(b[i] - cell * .5); return out;
}
