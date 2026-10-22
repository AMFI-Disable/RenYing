/* ---------------- 程序化建模：蒙皮网格、手绘面容、兵器 ---------------- */
const DOWN = new V3(0, -1, 0), UP = new V3(0, 1, 0);
const POSE0 = { hipY: 0, hipRX: 0, hipRY: 0, hipRZ: 0, torRX: 0, torRY: 0, torRZ: 0, headRX: 0, headRY: 0, LaX: 0, LaZ: .14, LfX: -.2, RaX: 0, RaZ: -.14, RfX: -.2, LlX: 0, LlZ: .04, LsX: 0, RlX: 0, RlZ: -.04, RsX: 0, hx: -.34, hy: .95, hz: .1, dx: -.2, dy: -.6, dz: .75 };
const PKEYS = Object.keys(POSE0);
const SWORD_TIERS = [
  { name: '凡铁剑', blade: 0xcfd6da, glow: 0x000000, ei: 0, trail: 0xc8dcea },
  { name: '青锋剑', blade: 0xbfe9e2, glow: 0x2fd0b8, ei: .6, trail: 0x62e6cf },
  { name: '寒霜剑', blade: 0xd6ecff, glow: 0x58a8ff, ei: .85, trail: 0x7cc0ff },
  { name: '赤霄剑', blade: 0xffd9c2, glow: 0xff5a22, ei: 1.05, trail: 0xff8a4a },
  { name: '轩辕剑', blade: 0xfff0c0, glow: 0xffb822, ei: 1.35, trail: 0xffd060 },
];
const _ik = { S: new V3(), T: new V3(), E: new V3(), d: new V3(), pole: new V3(), v: new V3(), W: new V3(), p: new V3(), sc: new V3(), qi: new T.Quaternion(), qt: new T.Quaternion(), q1: new T.Quaternion(), q2: new T.Quaternion() };
const _mv = new V3(), _f1 = new V3(), _f2 = new V3(), _f3 = new V3();
const KC = h => new T.Color(h).convertSRGBToLinear(), shade = (c, k) => c.clone().multiplyScalar(k);

/* 网格构建器：环形管、椭球、路径管、布片；可带骨骼权重，四个材质组（布 / 纹边 / 光泽 / 金属） */
class MB {
  constructor(skin) { this.skin = skin; this.P = []; this.C = []; this.U = []; this.SI = []; this.SW = []; this.I = [[], [], [], []]; this.W = []; this.m = null; this.n = 0; }
  T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) { this.m = new T.Matrix4().compose(new V3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new V3(s, s, s)); return this; }
  T0() { this.m = null; return this; }
  v(x, y, z, col, u, v, w) {
    if (this.m) { _mv.set(x, y, z).applyMatrix4(this.m); x = _mv.x; y = _mv.y; z = _mv.z; }
    this.P.push(x, y, z); this.C.push(col.r, col.g, col.b); this.U.push(u || 0, v || 0);
    if (this.skin) {
      if (typeof w === 'number') { this.SI.push(w, 0, 0, 0); this.SW.push(1, 0, 0, 0); }
      else { let a = w.filter(e => e[1] > .003); if (a.length > 4) a = a.sort((p, q) => q[1] - p[1]).slice(0, 4); let s = 0; for (const e of a) s += e[1]; for (let k = 0; k < 4; k++) { const e = a[k]; this.SI.push(e ? e[0] : 0); this.SW.push(e ? e[1] / s : 0); } }
    }
    return this.n++;
  }
  tube(rings, seg, o = {}) {
    const g = o.g || 0, closed = !o.arc, a0 = o.arc ? o.arc[0] : 0, a1 = o.arc ? o.arc[1] : TAU, rows = [], ur = (o.ur || 8) * (g === 0 ? 3 : 1), vr = (o.vr || 8) * (g === 0 ? 3 : 1), nr = rings.length;
    rings.forEach((r, i) => {
      const row = [];
      for (let j = 0; j <= seg; j++) {
        const th = a0 + (a1 - a0) * j / seg; let x, y, z;
        if (r.pos) { const q = r.pos(th); x = q[0]; y = q[1]; z = q[2]; } else { const m = r.mod ? r.mod(th) : 1, cs = Math.cos(th) * m, sn = Math.sin(th) * m; x = r.c[0] + r.u[0] * cs + r.v[0] * sn; y = r.c[1] + r.u[1] * cs + r.v[1] * sn; z = r.c[2] + r.u[2] * cs + r.v[2] * sn; }
        const col = o.col ? o.col(i, th, x, y, z) : r.col, w = typeof r.w === 'function' ? r.w(th, x, y, z) : r.w;
        row.push(this.v(x, y, z, col, j / seg * ur, r.t !== undefined ? r.t : i / Math.max(1, nr - 1) * vr, w));
      }
      if (closed) this.W.push(row[0], row[seg]); rows.push(row);
    });
    for (let i = 0; i < nr - 1; i++) for (let j = 0; j < seg; j++) { const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j], d = rows[i + 1][j + 1]; this.I[g].push(a, c, b, b, c, d); }
    const cap = (i, flip) => { const r = rings[i], row = rows[i]; let cx = 0, cy = 0, cz = 0; for (let j = 0; j < seg; j++) { cx += this.P[row[j] * 3]; cy += this.P[row[j] * 3 + 1]; cz += this.P[row[j] * 3 + 2]; } const sm = this.m; this.m = null; const ci = this.v(cx / seg, cy / seg, cz / seg, o.col ? o.col(i, 0, 0, 0, 0) : r.col, .5, 0, typeof r.w === 'function' ? r.w(0, cx / seg, cy / seg, cz / seg) : r.w); this.m = sm; for (let j = 0; j < seg; j++) flip ? this.I[g].push(ci, row[j + 1], row[j]) : this.I[g].push(ci, row[j], row[j + 1]); };
    if (o.capA) cap(0, false); if (o.capB) cap(nr - 1, true); return rows;
  }
  ell(c, r, col, w, g = 0, n = 7, seg = 10) { const rings = []; for (let k = 0; k <= n; k++) { const ph = PI * k / n, s = Math.max(.02, Math.sin(ph)); rings.push({ c: [c[0], c[1] + r[1] * Math.cos(ph), c[2]], u: [r[0] * s, 0, 0], v: [0, 0, r[2] * s], col, w }); } return this.tube(rings, seg, { g }); }
  path(pts, rad, seg, col, w, g = 0, hint, o = {}) {
    let P = pts.map(p => p.isVector3 ? p : new V3(p[0], p[1], p[2])); if (P.length > 2 && !o.raw) P = new T.CatmullRomCurve3(P, false, 'centripetal').getPoints(Math.max(8, P.length * 3)); const n = P.length, rings = [], H = hint || new V3(0, 0, 1);
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0; _f1.subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize(); _f2.crossVectors(H, _f1); if (_f2.lengthSq() < 1e-4) _f2.set(1, 0, 0); _f2.normalize(); _f3.crossVectors(_f1, _f2).normalize();
      const rr = typeof rad === 'function' ? rad(t) : rad, a = Array.isArray(rr) ? rr[0] : rr, b = Array.isArray(rr) ? rr[1] : rr;
      rings.push({ c: [P[i].x, P[i].y, P[i].z], u: [_f2.x * a, _f2.y * a, _f2.z * a], v: [_f3.x * b, _f3.y * b, _f3.z * b], col: typeof col === 'function' ? col(t) : col, w: typeof w === 'function' ? w(t, i, P[i]) : w, t: o.ut ? t * o.ut : undefined });
    }
    return this.tube(rings, seg, Object.assign({ g, capA: 1, capB: 1 }, o));
  }
  dome(c, r, col, w, g = 0, n = 5, seg = 10) { const rings = []; for (let k = 0; k <= n; k++) { const ph = PI * .56 * k / n, s = Math.max(.02, Math.sin(ph)); rings.push({ c: [c[0], c[1] + r[1] * Math.cos(ph), c[2]], u: [r[0] * s, 0, 0], v: [0, 0, r[2] * s], col: k === n ? shade(col, .55) : col, w }); } return this.tube(rings, seg, { g, ur: 3, vr: 1 }); }
  cone(a, b, r, col, w, g = 0, seg = 5) { return this.path([a, b], t => Math.max(.0015, r * (1 - t)), seg, col, w, g, Math.abs(b[1] - a[1]) > Math.abs(b[2] - a[2]) ? new V3(0, 0, 1) : new V3(0, 1, 0)); }
  sheet(nr, nc, fn, g = 0) { const rows = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const q = fn(i, j, i / (nr - 1), j / (nc - 1)); row.push(this.v(q.p[0], q.p[1], q.p[2], q.col, q.u || j / (nc - 1), q.v || i / (nr - 1), q.w)); } rows.push(row); } for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) { const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j], d = rows[i + 1][j + 1]; this.I[g].push(a, c, b, b, c, d); } return rows; }
  build() {
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(this.P, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(this.C, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(this.U, 2));
    if (this.skin) { geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(this.SI, 4)); geo.setAttribute('skinWeight', new T.Float32BufferAttribute(this.SW, 4)); }
    const idx = []; let st = 0; this.I.forEach((arr, gi) => { if (arr.length) { geo.addGroup(st, arr.length, gi); for (let i = 0; i < arr.length; i++) idx.push(arr[i]); st += arr.length; } });
    geo.setIndex(idx); geo.computeVertexNormals(); const N = geo.attributes.normal;
    for (let i = 0; i < this.W.length; i += 2) { const a = this.W[i], b = this.W[i + 1]; _f1.set(N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)).normalize(); N.setXYZ(a, _f1.x, _f1.y, _f1.z); N.setXYZ(b, _f1.x, _f1.y, _f1.z); }
    return geo;
  }
}
const yr = (y, rx, rz, col, w, cx = 0, cz = 0, ex) => Object.assign({ c: [cx, y, cz], u: [rx, 0, 0], v: [0, 0, rz], col, w }, ex);
const zr = (z, rx, ry, col, w, cy = 0, cx = 0) => ({ c: [cx, cy, z], u: [rx, 0, 0], v: [0, ry, 0], col, w });

/* 贴图：织纹法线、回纹镶边、札甲法线、面容 */
const TEX = {};
function texWeaveN() { if (TEX.wv) return TEX.wv; const c = makeCanvas(64, 64), g = c.getContext('2d'), im = g.createImageData(64, 64); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const h = .5 + .25 * Math.sin(x * TAU / 8) * (y % 16 < 8 ? 1 : -1) + .25 * Math.sin(y * TAU / 8), i = (y * 64 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = h * 255; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); const t = canvasTex(normalFromCanvas(c, 1.2), false); t.wrapS = t.wrapT = T.RepeatWrapping; return TEX.wv = t; }
function texTrim() {
  if (TEX.tr) return TEX.tr; const c = makeCanvas(256, 64), g = c.getContext('2d'); g.fillStyle = '#a9a9a9'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.lineJoin = 'miter';
  g.beginPath(); g.moveTo(0, 5); g.lineTo(256, 5); g.moveTo(0, 59); g.lineTo(256, 59); g.stroke();
  for (let k = 0; k < 4; k++) { const x = k * 64; g.beginPath(); g.moveTo(x, 48); g.lineTo(x + 8, 48); g.lineTo(x + 8, 17); g.lineTo(x + 52, 17); g.lineTo(x + 52, 40); g.lineTo(x + 22, 40); g.lineTo(x + 22, 28); g.lineTo(x + 38, 28); g.stroke(); g.beginPath(); g.moveTo(x + 52, 48); g.lineTo(x + 64, 48); g.stroke(); }
  const t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping; return TEX.tr = t;
}
function texLamN() {
  if (TEX.lm) return TEX.lm; const c = makeCanvas(128, 128), g = c.getContext('2d'); g.fillStyle = '#202020'; g.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 4; r++) for (let k = -1; k < 4; k++) { const x = k * 32 + (r % 2) * 16 + 2, y = r * 32 + 2, gr = g.createLinearGradient(0, y, 0, y + 30); gr.addColorStop(0, '#8a8a8a'); gr.addColorStop(.5, '#e8e8e8'); gr.addColorStop(1, '#6a6a6a'); g.fillStyle = gr; g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + 24, y); g.quadraticCurveTo(x + 28, y, x + 28, y + 4); g.lineTo(x + 28, y + 22); g.quadraticCurveTo(x + 28, y + 29, x + 14, y + 29); g.quadraticCurveTo(x, y + 29, x, y + 22); g.lineTo(x, y + 4); g.quadraticCurveTo(x, y, x + 4, y); g.fill(); g.fillStyle = '#303030'; g.beginPath(); g.arc(x + 14, y + 7, 2, 0, TAU); g.fill(); }
  const t = canvasTex(normalFromCanvas(c, 3), false); t.wrapS = t.wrapT = T.RepeatWrapping; return TEX.lm = t;
}
function faceTex(f) {
  const key = 'F' + JSON.stringify(f); if (TEX[key]) return TEX[key];
  const S = 2, c = makeCanvas(512 * S, 256 * S), g = c.getContext('2d'); g.scale(S, S); const sk = new T.Color(f.skin), css = (k = 1, a) => { const q = v => Math.round(sat(v * k) * 255); return a === undefined ? `rgb(${q(sk.r)},${q(sk.g)},${q(sk.b)})` : `rgba(${q(sk.r)},${q(sk.g)},${q(sk.b)},${a})`; };
  const X = 128, circ = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }, rad = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  g.fillStyle = f.void ? '#050406' : css(); g.fillRect(0, 0, 512, 256);
  let em = null, eg = null; if (f.glow) { em = makeCanvas(512, 256); eg = em.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, 512, 256); }
  const FX0 = () => { g.save(); g.translate(X, 128); g.scale(1.62, 1.42); g.translate(-X, -128); };
  if (!f.void) {
    let gr = g.createLinearGradient(0, 186, 0, 236); gr.addColorStop(0, css(1, 0)); gr.addColorStop(1, css(.62, 1)); g.fillStyle = gr; g.fillRect(0, 186, 512, 70);
    gr = g.createLinearGradient(0, 60, 0, 100); gr.addColorStop(0, css(.72, 1)); gr.addColorStop(1, css(.9, 0)); g.fillStyle = gr; g.fillRect(0, 0, 512, 100);
    FX0();
    rad(X - 30, 150, 24, f.pale ? 'rgba(120,90,110,.14)' : 'rgba(214,96,84,.17)'); rad(X + 30, 150, 24, f.pale ? 'rgba(120,90,110,.14)' : 'rgba(214,96,84,.17)');
    rad(X - 62, 140, 40, 'rgba(60,30,24,.18)'); rad(X + 62, 140, 40, 'rgba(60,30,24,.18)'); rad(X, 138, 9, 'rgba(255,240,225,.2)');
    if (f.beard) { g.fillStyle = f.beardCol || 'rgba(22,16,14,.9)'; g.beginPath(); g.moveTo(X - 58, 150); g.quadraticCurveTo(X - 46, 176, X - 16, 172); g.lineTo(X - 13, 160); g.lineTo(X + 13, 160); g.lineTo(X + 16, 172); g.quadraticCurveTo(X + 46, 176, X + 58, 150); g.lineTo(X + 64, 200); g.quadraticCurveTo(X, 246, X - 64, 200); g.closePath(); g.fill(); }
    if (f.stubble) { g.fillStyle = 'rgba(30,22,20,.5)'; const r = mulberry(5); for (let i = 0; i < 520; i++) { const a = r() * PI, d = 20 + r() * 34; g.fillRect(X + Math.cos(a) * d * 1.25, 156 + Math.sin(a) * d * .9, .9, .9); } }
    // 鼻
    g.strokeStyle = 'rgba(70,36,28,.3)'; g.lineWidth = 1.3; g.lineCap = 'round'; g.beginPath(); g.moveTo(X + 3.5, 122); g.quadraticCurveTo(X + 5.5, 136, X + 4.5, 143); g.stroke();
    g.fillStyle = 'rgba(50,24,20,.42)'; g.beginPath(); g.ellipse(X - 4.2, 146.5, 2.3, 1.2, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(X + 4.2, 146.5, 2.3, 1.2, 0, 0, TAU); g.fill();
    // 口
    const my = 164, fr = f.frown || 0; g.fillStyle = f.lip || 'rgba(168,84,80,.55)'; g.beginPath(); g.moveTo(X - 9.5, my); g.quadraticCurveTo(X - 4, my - 3.4, X, my - 1.8); g.quadraticCurveTo(X + 4, my - 3.4, X + 9.5, my); g.quadraticCurveTo(X, my + 5.6, X - 9.5, my); g.fill();
    g.strokeStyle = 'rgba(70,28,26,.85)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X - 10.5, my + fr * 2); g.quadraticCurveTo(X, my + 1.4 - fr * 2.5, X + 10.5, my + fr * 2); g.stroke();
    rad(X, 173, 9, 'rgba(60,30,24,.14)');
    if (f.mustache) { g.fillStyle = 'rgba(22,16,14,.9)'; g.beginPath(); g.moveTo(X, 154); g.quadraticCurveTo(X - 12, 153, X - 17, 166); g.quadraticCurveTo(X - 9, 158.5, X, 158.5); g.quadraticCurveTo(X + 9, 158.5, X + 17, 166); g.quadraticCurveTo(X + 12, 153, X, 154); g.fill(); }
    if (f.paint) { g.fillStyle = f.paint; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(X + sd * 16, 136); g.lineTo(X + sd * 40, 140); g.lineTo(X + sd * 38, 146); g.lineTo(X + sd * 17, 141); g.fill(); g.beginPath(); g.moveTo(X + sd * 20, 148); g.lineTo(X + sd * 38, 152); g.lineTo(X + sd * 36, 157); g.lineTo(X + sd * 21, 152); g.fill(); } g.fillRect(X - 2.5, 88, 5, 20); }
    if (f.scar) { g.strokeStyle = 'rgba(150,70,64,.85)'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(X + 13, 100); g.lineTo(X + 31, 152); g.stroke(); g.strokeStyle = 'rgba(240,200,190,.5)'; g.lineWidth = .7; g.beginPath(); g.moveTo(X + 14, 101); g.lineTo(X + 32, 152); g.stroke(); }
    g.restore();
  }
  FX0(); if (eg) { eg.translate(X, 128); eg.scale(1.62, 1.42); eg.translate(-X, -128); }
  for (const sd of [-1, 1]) {
    const cx = X + sd * 23, cy = 125;
    if (f.void) { if (eg) { const gr = eg.createRadialGradient(cx, cy, 0, cx, cy, 13); gr.addColorStop(0, '#fff'); gr.addColorStop(.3, f.glow); gr.addColorStop(1, '#000'); eg.fillStyle = gr; eg.fillRect(cx - 13, cy - 13, 26, 26); } continue; }
    g.save(); g.translate(cx, cy); g.scale(sd, 1); g.rotate(f.tilt === undefined ? -.09 : f.tilt);
    rad(0, -1, 18, f.dark ? 'rgba(30,10,16,.6)' : 'rgba(84,42,34,.24)');
    g.save(); g.beginPath(); g.moveTo(-10.6, .9); g.quadraticCurveTo(-2, -6.4, 10.6, -1.3); g.quadraticCurveTo(1, 5.3, -10.6, .9); g.closePath(); g.clip();
    g.fillStyle = f.glow ? '#1c0a08' : '#efe8dc'; g.fillRect(-12, -8, 24, 16); g.fillStyle = f.glow || f.iris || '#3b2416'; circ(.5, -.7, 5); g.fillStyle = f.glow ? '#fff' : '#0a0606'; circ(.5, -.7, f.glow ? 1.6 : 2.4); if (!f.glow) { g.fillStyle = '#fff'; circ(-1.3, -2.5, 1.25); }
    g.fillStyle = 'rgba(30,14,14,.28)'; g.fillRect(-12, -8, 24, 3.8); g.restore();
    g.strokeStyle = '#170d0b'; g.lineWidth = f.lash || 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-10.9, 1); g.quadraticCurveTo(-2, -6.9, 10.9, -1.7); g.lineTo(13.6, -3.5); g.stroke();
    g.strokeStyle = 'rgba(90,48,40,.42)'; g.lineWidth = .9; g.beginPath(); g.moveTo(-9, -3.4); g.quadraticCurveTo(-1, -9.6, 10.5, -5.2); g.stroke(); g.beginPath(); g.moveTo(-8, 2.8); g.quadraticCurveTo(1, 5.9, 10, -.1); g.stroke();
    g.restore();
    if (eg) { eg.save(); eg.translate(cx, cy); const gr = eg.createRadialGradient(0, 0, 0, 0, 0, 9); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, f.glow); gr.addColorStop(1, '#000'); eg.fillStyle = gr; eg.beginPath(); eg.ellipse(0, 0, 10, 5, 0, 0, TAU); eg.fill(); eg.restore(); }
    const k = f.browK || 1; g.save(); g.translate(cx, cy - 12.5 + (f.browY || 0)); g.scale(sd, 1); g.rotate(f.brow === undefined ? -.2 : f.brow); g.fillStyle = f.browCol || '#1c1210';
    g.beginPath(); g.moveTo(-11, -1.4 * k); g.quadraticCurveTo(0, -5.2 * k, 14, -2.6); g.quadraticCurveTo(1, 1 * k, -11, 2.8 * k); g.closePath(); g.fill(); g.restore();
  }
  g.restore();
  const out = { map: canvasTex(c), emap: em ? canvasTex(em) : null }; return TEX[key] = out;
}
const _hg = {};
function headData(jaw) {
  const key = 'h' + jaw; if (_hg[key]) return _hg[key];
  const g = new T.SphereGeometry(1, 36, 26), p = g.attributes.position, n = p.count, dir = new Float32Array(n * 3), G = (x, y, z, cx, cy, cz, s) => Math.exp(-((x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz)) / (2 * s * s));
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i); dir[i * 3] = x; dir[i * 3 + 1] = y; dir[i * 3 + 2] = z;
    const lo = Math.max(0, -y), up = Math.max(0, y), kx = (1 - (.46 - jaw * .3) * Math.pow(lo, 1.6)) * (1 - .06 * up * up), kz = z > 0 ? 1 - .1 * lo * lo : 1 - .3 * Math.pow(lo, 1.3);
    let px = x * .098 * kx, py = y * .125, pz = z * .112 * kz;
    if (z > 0) {
      pz *= 1 - .06 * (1 - Math.abs(y)) * (1 - Math.abs(x));
      pz += .022 * G(x, y, z, 0, -.2, .98, .13) + .011 * G(x, y, z, 0, -.3, .95, .065) + .006 * (G(x, y, z, .42, .27, .86, .2) + G(x, y, z, -.42, .27, .86, .2)) - .007 * (G(x, y, z, .46, .05, .88, .12) + G(x, y, z, -.46, .05, .88, .12)) + .006 * G(x, y, z, 0, -.58, .81, .12) + (.012 + jaw * .012) * G(x, y, z, 0, -.84, .52, .22);
      px += (x > 0 ? 1 : -1) * .007 * G(Math.abs(x), y, z, .62, -.12, .72, .22);
    }
    p.setXYZ(i, px, py, pz);
  }
  g.computeVertexNormals(); const N = g.attributes.normal;
  for (let r = 0; r <= 26; r++) { const a = r * 37, b = r * 37 + 36; _f1.set(N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)).normalize(); N.setXYZ(a, _f1.x, _f1.y, _f1.z); N.setXYZ(b, _f1.x, _f1.y, _f1.z); }
  return _hg[key] = { geo: g, dir };
}
/* 从雕刻过的头型上切出一片壳（发际线以上的头发、兜帽等） */
function shellInto(mb, jaw, keep, sc, col, w, g, oy) {
  const hd = headData(jaw), p = hd.geo.attributes.position, d = hd.dir, ix = hd.geo.index.array, map = new Int32Array(p.count).fill(-1), ok = new Uint8Array(p.count);
  for (let i = 0; i < p.count; i++) ok[i] = keep(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]) ? 1 : 0;
  const V = i => { if (map[i] < 0) { const k = typeof sc === 'function' ? sc(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]) : sc; map[i] = mb.v(p.getX(i) * k, p.getY(i) * k + oy, p.getZ(i) * k, col, 0, 0, w); } return map[i]; };
  for (let i = 0; i < ix.length; i += 3) { const a = ix[i], b = ix[i + 1], c = ix[i + 2]; if (ok[a] && ok[b] && ok[c]) mb.I[g].push(V(a), V(b), V(c)); }
  for (let r = 0; r <= 26; r++) { const a = map[r * 37], b = map[r * 37 + 36]; if (a >= 0 && b >= 0) mb.W.push(a, b); }
}

function rigBase(rig) {
  rig.mats = []; rig.lag = [];
  rig.M = (c, op = {}) => {
    const m = stdMat(c, Object.assign({ rim: true }, op)); m.color.convertSRGBToLinear(); if (op.emap) { m.emissiveMap = op.emap; } if (op.env && GFX.env) { m.envMap = GFX.env; m.envMapIntensity = op.env; }
    m.userData.em0 = m.emissive.clone().multiplyScalar(op.emissive !== undefined ? m.emissiveIntensity : 0); m.emissive.copy(m.userData.em0); m.emissiveIntensity = 1; if (op.skin) m.skinning = true; rig.mats.push(m); return m;
  };
  rig.setGlow = (r, g, b) => { for (const m of rig.mats) { const e = m.userData.em0; m.emissive.setRGB(e.r + r, e.g + g, e.b + b); } };
  rig.setRim = (r, g, b) => { for (const m of rig.mats) m.userData.rim.value.setRGB(r, g, b); };
  rig.setOpacity = a => { for (const m of rig.mats) { m.transparent = a < 1 || !!m.userData.tr; m.opacity = a * (m.userData.op0 || 1); m.depthWrite = a > .5; } };
  rig.finish = () => { rig.root.traverse(o => { if (o.isMesh) { o.castShadow = !rig.ghost; o.receiveShadow = false; if (o.isSkinnedMesh) o.frustumCulled = false; } }); };
  rig.dispose = () => { for (const m of rig.mats) m.dispose(); rig.root.traverse(o => { if (o.isSkinnedMesh) { o.geometry.dispose(); if (o.skeleton && o.skeleton.boneTexture) o.skeleton.boneTexture.dispose(); } else if (o.isMesh && o.userData.own) o.geometry.dispose(); }); };
  /* 四组蒙皮材质：布 / 纹边 / 光泽（皮、发、革）/ 金属 */
  rig.skinMats = () => [
    rig.M(0xffffff, { vc: true, rough: .88, side: T.DoubleSide, normalMap: texWeaveN(), ns: .16, skin: true }),
    rig.M(0xffffff, { vc: true, rough: .7, side: T.DoubleSide, map: texTrim(), skin: true }),
    rig.M(0xffffff, { vc: true, rough: .5, side: T.DoubleSide, skin: true }),
    rig.M(0xffffff, { vc: true, rough: .4, metal: .85, side: T.DoubleSide, normalMap: texLamN(), ns: .8, env: 1.1, skin: true }),
  ];
  rig.bind = (mb, mats) => { const mesh = new T.SkinnedMesh(mb.build(), mats); rig.root.add(mesh); rig.root.updateMatrixWorld(true); mesh.bind(new T.Skeleton(rig.bones)); rig.skinMesh = mesh; return mesh; };
}
const partMesh = (mb, mat, parent) => { const m = new T.Mesh(mb.build(), mat); m.userData.own = true; if (parent) parent.add(m); return m; };

/* ---------------- 兵器 ---------------- */
function bladeInto(mb, prof, col) { mb.tube(prof.map(q => ({ c: [q[3] || 0, q[0], 0], u: [Math.max(.0008, q[1] / 2), 0, 0], v: [0, 0, Math.max(.0008, q[2] / 2)], col, w: 0 })), 4, {}); }
function makeWeapon(type, rig) {
  const g = new T.Group(), M = rig.M, W = KC(0xffffff); let len = 1, base = .2;
  const steelM = () => M(0xc6ccd2, { metal: .95, rough: .22, flat: true, env: 1.4, side: T.DoubleSide }), goldM = () => M(0xd2a548, { metal: .9, rough: .32, env: 1.2, side: T.DoubleSide }), woodM = () => M(0x3a2a1e, { rough: .7, side: T.DoubleSide }), redM = () => M(0xb3261e, { rough: .8, side: T.DoubleSide });
  const tassel = (y, par, lenT = .26) => { const tb = group(0, y, 0, par), mb = new MB(false); mb.path([[0, 0, 0], [0, -.06, 0]], .004, 4, W, 0); mb.ell([0, -.075, 0], [.016, .018, .016], W, 0); mb.path([[0, -.085, 0], [0, -.085 - lenT * .5, 0], [0, -.085 - lenT, 0]], t => .017 * (1 - t * .55), 7, W, 0); partMesh(mb, redM(), tb); rig.lag.push({ o: tb, rest: .2, amp: 1.0, sway: .28, w: 3 }); };
  if (type === 'sword' || type === 'dark') {
    const dk = type === 'dark', L = dk ? 1.28 : 1.06, bm = dk ? M(0x241a20, { metal: .9, rough: .28, flat: true, env: 1.2, emissive: 0xff2a1a, ei: 1.1, side: T.DoubleSide }) : M(0xcfd6da, { metal: .95, rough: .2, flat: true, env: 1.5, emissive: 0x000000, ei: 1, side: T.DoubleSide });
    rig.bladeMat = bm; let mb = new MB(false);
    bladeInto(mb, dk ? [[.11, .07, .016], [.2, .06, .016], [.34, .074, .015], [.5, .056, .014], [L - .1, .05, .012], [L + .04, .03, .008], [L + .12, 0, 0]] : [[.11, .058, .015], [.16, .054, .015], [L - .12, .046, .012], [L + .02, .03, .008], [L + .11, 0, 0]], W); partMesh(mb, bm, g);
    mb = new MB(false); mb.ell([0, .1, 0], [.05, .03, .022], W, 0, 0, 5, 8);
    for (const sd of [-1, 1]) { mb.path([[sd * .03, .1, 0], [sd * .08, .098, 0], [sd * .112, .078, 0], [sd * .118, .05, 0], [sd * .1, .04, 0]], t => [.011 * (1 - t * .5), .016 * (1 - t * .4)], 6, W, 0); }
    mb.ell([0, -.128, 0], [.03, .024, .02], W, 0, 0, 5, 8); mb.tube([yr(-.106, .022, .02, W, 0), yr(-.095, .02, .018, W, 0)], 8); mb.tube([yr(.075, .02, .018, W, 0), yr(.088, .028, .02, W, 0)], 8); partMesh(mb, goldM(), g);
    mb = new MB(false); const gr = []; for (let i = 0; i <= 14; i++) { const y = -.095 + i * .012; gr.push(yr(y, i % 2 ? .0195 : .0168, i % 2 ? .0175 : .015, W, 0)); } mb.tube(gr, 8); partMesh(mb, M(dk ? 0x3a1414 : 0x1f3f3c, { rough: .75, side: T.DoubleSide }), g);
    mb = new MB(false); mb.ell([0, .104, .021], [.013, .017, .007], W, 0, 0, 4, 6); mb.ell([0, .104, -.021], [.013, .017, .007], W, 0, 0, 4, 6); partMesh(mb, M(dk ? 0xff3020 : 0x6fd8b4, { rough: .2, emissive: dk ? 0xff2010 : 0x1a6a54, ei: dk ? 1.6 : .5, side: T.DoubleSide }), g);
    tassel(-.15, g); len = L + .1; base = .22;
  } else if (type === 'saber' || type === 'guandao') {
    const big = type === 'guandao', sh = new T.Shape(), Wd = big ? .21 : .09, L = big ? 1.02 : .84;
    sh.moveTo(0, 0); sh.lineTo(Wd * .72, 0); sh.quadraticCurveTo(Wd * 1.3, L * .55, Wd * .62, L * .96); sh.lineTo(Wd * .2, L); if (big) { sh.lineTo(Wd * .05, L * .8); sh.lineTo(-Wd * .42, L * .74); sh.lineTo(-Wd * .1, L * .62); } sh.lineTo(0, L * .84); sh.lineTo(0, 0);
    const bg = new T.ExtrudeGeometry(sh, { depth: .006, bevelEnabled: true, bevelThickness: .006, bevelSize: .012, bevelSegments: 1 }); bg.translate(-Wd * .35, 0, -.003);
    const y0 = big ? 1.26 : .1, bl = new T.Mesh(bg, steelM()); bl.position.y = y0; bl.userData.own = true; g.add(bl); let mb = new MB(false);
    if (big) {
      mb.tube([yr(-.98, .024, .024, W, 0), yr(1.26, .026, .026, W, 0)], 8, { capA: 1 }); partMesh(mb, M(0x4a1c14, { rough: .55, side: T.DoubleSide }), g); mb = new MB(false);
      for (const y of [1.25, 1.14, .5, -.4, -.9]) mb.tube([yr(y - .03, .034, .034, W, 0), yr(y, .04, .04, W, 0), yr(y + .03, .034, .034, W, 0)], 8);
      mb.ell([0, 1.22, 0], [.07, .05, .03], W, 0, 0, 5, 8); mb.cone([0, -.98, 0], [0, -1.2, 0], .034, W, 0, 0, 6); partMesh(mb, goldM(), g);
      mb = new MB(false); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; mb.path([[Math.cos(a) * .03, 1.12, Math.sin(a) * .03], [Math.cos(a) * .075, 1.04, Math.sin(a) * .075], [Math.cos(a) * .06, .9, Math.sin(a) * .06]], t => .022 * (1 - t * .7), 5, W, 0); } partMesh(mb, redM(), g); len = 2.28; base = 1.22;
    } else {
      mb.tube([yr(.085, .075, .03, W, 0), yr(.1, .08, .034, W, 0), yr(.112, .07, .028, W, 0)], 10, { capA: 1, capB: 1 }); mb.ell([0, -.115, 0], [.026, .022, .022], W, 0, 0, 5, 8); partMesh(mb, goldM(), g);
      const rg = new T.Mesh(new T.TorusGeometry(.03, .007, 6, 14), goldM()); rg.position.y = -.16; rg.userData.own = true; g.add(rg);
      mb = new MB(false); const gr = []; for (let i = 0; i <= 14; i++) gr.push(yr(-.1 + i * .013, i % 2 ? .021 : .018, i % 2 ? .019 : .016, W, 0)); mb.tube(gr, 8); partMesh(mb, M(0x2a1a14, { rough: .75, side: T.DoubleSide }), g);
      const tb = group(0, -.19, 0, g); mb = new MB(false); mb.sheet(5, 2, (i, j) => ({ p: [(j - .5) * .05, -i * .07, i * .004], col: W, w: 0 })); partMesh(mb, redM(), tb); rig.lag.push({ o: tb, rest: .3, amp: 1.2, sway: .3, w: 3.2 }); len = .96; base = .15;
    }
  } else if (type === 'spear') {
    let mb = new MB(false); mb.tube([yr(-.72, .019, .019, W, 0), yr(1.56, .021, .021, W, 0)], 8, { capA: 1 }); partMesh(mb, M(0x5a2a1c, { rough: .55, side: T.DoubleSide }), g);
    mb = new MB(false); bladeInto(mb, [[1.6, .03, .02], [1.7, .085, .02], [1.82, .06, .014], [1.98, 0, 0]], W); partMesh(mb, steelM(), g);
    mb = new MB(false); mb.tube([yr(1.5, .026, .026, W, 0), yr(1.56, .03, .03, W, 0), yr(1.62, .02, .02, W, 0)], 8); mb.cone([0, -.72, 0], [0, -.86, 0], .024, W, 0, 0, 6); partMesh(mb, goldM(), g);
    mb = new MB(false); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; mb.path([[Math.cos(a) * .024, 1.5, Math.sin(a) * .024], [Math.cos(a) * .08, 1.43, Math.sin(a) * .08], [Math.cos(a) * .07, 1.28, Math.sin(a) * .07]], t => .02 * (1 - t * .75), 5, W, 0); } partMesh(mb, redM(), g); len = 1.95; base = 1.1;
  } else if (type === 'club') {
    let mb = new MB(false); const gr = []; for (let i = 0; i <= 10; i++) gr.push(yr(-.15 + i * .06, (.042 + i * .0035) * (i % 2 ? 1.08 : 1), (.042 + i * .0035) * (i % 2 ? 1.08 : 1), W, 0)); mb.tube(gr, 8, { capA: 1 }); mb.ell([0, -.17, 0], [.06, .04, .06], W, 0, 0, 5, 8); partMesh(mb, woodM(), g);
    mb = new MB(false); mb.tube([yr(.46, .085, .085, W, 0), yr(.56, .13, .13, W, 0), yr(1.12, .15, .15, W, 0), yr(1.2, .1, .1, W, 0)], 10, { capA: 1, capB: 1 });
    for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + r * .52, y = .62 + r * .115, R = .13 + r * .004; mb.cone([Math.cos(a) * R, y, Math.sin(a) * R], [Math.cos(a) * (R + .1), y + .01, Math.sin(a) * (R + .1)], .036, W, 0, 0, 4); }
    partMesh(mb, M(0x55524e, { metal: .7, rough: .5, flat: true, env: .8, side: T.DoubleSide }), g); len = 1.25; base = .5;
  } else if (type === 'bow') {
    let mb = new MB(false); const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14 * 2 - 1, a = Math.abs(t); pts.push([0, .2 * a * a - .06 * Math.pow(a, 5) * 1.6, t * .56]); }
    mb.path(pts, t => { const a = Math.abs(t * 2 - 1); return [.014 * (1 - a * .5) + .004, .02 * (1 - a * .6) + .004]; }, 6, W, 0, 0, new V3(1, 0, 0)); partMesh(mb, M(0x4a2e1a, { rough: .5, side: T.DoubleSide }), g);
    mb = new MB(false); mb.tube([zr(-.07, .022, .026, W, 0), zr(.07, .022, .026, W, 0)], 8); partMesh(mb, redM(), g);
    mb = new MB(false); const ty = pts[0][1]; mb.path([[0, ty, -.56], [0, ty, .56]], .003, 3, W, 0, 0, new V3(1, 0, 0)); partMesh(mb, M(0xe8e0d0, { side: T.DoubleSide }), g); len = 0; base = 0;
  }
  return { group: g, len, base };
}

/* ---------------- 人形 ---------------- */
const FACES = {
  knot: { brow: -.3, browK: .9, tilt: -.1 }, cap: {}, band: { brow: -.46, browK: 1.35, stubble: 1, scar: 1, frown: 1 }, hat: { brow: -.34, browK: 1.1, frown: .5 },
  helmet: { brow: -.38, browK: 1.25, mustache: 1, frown: .8 }, mask: { brow: -.55, browK: 1.7, glow: '#ffb020', dark: 1, paint: 'rgba(150,30,24,.9)', frown: 1.5, lip: 'rgba(60,50,56,.7)' },
  hood: { void: 1, glow: '#b46cff' }, warlord: { brow: -.52, browK: 1.7, beard: 1, scar: 1, frown: 1.2 }, demon: { brow: -.5, browK: .8, glow: '#ff2a1a', dark: 1, pale: 1, lip: 'rgba(70,20,30,.85)', lash: 2.8, paint: 'rgba(120,16,20,.85)' },
};
function makeHumanoid(o) {
  const rig = { kind: 'human', P: Object.assign({}, POSE0), C: Object.assign({}, POSE0), phase: rand(TAU), ik: o.weapon !== 'none', stance: o.stance || null, ghost: !!o.ghost, bones: [] };
  rigBase(rig); const c = o.colors, b = o.bulk || 1, bz = 1 + (b - 1) * .6, ba = 1 + (b - 1) * .8, hs = o.head || 'cap';
  const robe = KC(c.robe), trim = KC(c.trim), skin = KC(c.skin), hair = KC(c.hair), pants = KC(c.pants), boot = KC(c.boots), sash = KC(c.sash), accent = KC(c.accent || 0xa82a20), steel = KC(o.pauldron || 0x8a9096), gold = KC(0xd2a548), bone = KC(0xd8cfb8);
  const root = rig.root = new T.Group(), inner = rig.inner = group(0, 0, 0, root);
  const BN = (x, y, z, par) => { const bn = new T.Bone(); bn.position.set(x, y, z); par.add(bn); bn.userData.i = rig.bones.length; rig.bones.push(bn); return bn; }, I = bn => bn.userData.i;
  const LB = (x, y, z, par, rest, amp, sway, w) => { const bn = BN(x, y, z, par); rig.lag.push({ o: bn, rest, amp, sway, w }); return bn; };
  const W2 = (a, bb, t) => t <= .001 ? I(a) : t >= .999 ? I(bb) : [[I(a), 1 - t], [I(bb), t]];
  const chainW = (bs, q) => { const k = clamp(Math.floor(q), 0, bs.length - 2); return q <= 0 ? I(bs[0]) : W2(bs[k], bs[k + 1], sat(q - k)); };
  const hips = rig.hips = BN(0, .93, 0, inner), torso = rig.torso = BN(0, .06, 0, hips), head = rig.head = BN(0, .6, 0, torso);
  for (const [k, sd] of [['L', 1], ['R', -1]]) { const arm = rig['arm' + k] = BN(sd * .218 * b, .46, 0, torso), fore = rig['fore' + k] = BN(0, -.28, 0, arm); rig['hand' + k] = BN(0, -.28, 0, fore); const leg = rig['leg' + k] = BN(sd * .092 * b, -.04, 0, hips); rig['shin' + k] = BN(0, -.44, 0, leg); }
  const mb = new MB(true), sides = [['L', 1], ['R', -1]];

  /* 腿、靴 */
  if (!o.ghost) for (const [k, sd] of sides) {
    const x = sd * .092 * b, L = rig['leg' + k], S = rig['shin' + k], bag = o.wrap ? 0 : 1, bl = 1 + (b - 1) * .7, lw = y => W2(L, S, sstep(.56, .36, y));
    mb.tube([[.95, .086], [.86, .092], [.66, bag ? .09 : .08], [.47, bag ? .086 : .067], [.36, bag ? .09 : .066], [.31, bag ? .072 : .058], [.28, .056]].map(([y, r]) => yr(y, r * bl, r * bl, y < .47 && o.wrap ? shade(trim, 1.25) : pants, lw(y), x, 0)), 10, { capA: 1, ur: 5, vr: 10 });
    if (o.wrap) for (let i = 0; i < 4; i++) mb.tube([yr(.44 - i * .04, .07 * bl, .07 * bl, trim, I(S), x), yr(.425 - i * .04, .071 * bl, .071 * bl, shade(trim, .7), I(S), x)], 10, { g: 2 });
    mb.tube([[.325, .074], [.31, .076], [.29, .07], [.12, .058], [.06, .06], [.03, .058]].map(([y, r], i) => yr(y, r * bl, r * bl, i < 2 ? shade(boot, 1.6) : boot, I(S), x, i > 3 ? .01 : 0)), 10, { g: 2 });
    mb.ell([x, .05, .062], [.055 * bl, .05, .128], boot, I(S), 2, 6, 10); mb.ell([x, .017, .062], [.059 * bl, .018, .134], shade(boot, .45), I(S), 2, 4, 10); mb.ell([x, .078, .178], [.037, .032, .04], boot, I(S), 2, 5, 8);
  }
  /* 躯干 */
  const TR = [[.83, .02, .02, 0], [.86, .125, .1, 0], [.92, .152, .118, 0], [.99, .143, .108, 0], [1.06, .127, .096, 0], [1.15, .138, .102, .005], [1.27, .16, .114, .012], [1.38, .168, .112, .008], [1.45, .158, .1, 0], [1.5, .112, .082, -.005], [1.535, .068, .064, -.008], [1.6, .054, .056, -.004], [1.67, .05, .052, 0]].map(q => [q[0], q[1] * (q[0] < 1.52 ? b : ba), q[2] * (q[0] < 1.52 ? bz : ba), q[3]]);
  const tor = y => { let i = 0; while (i < TR.length - 2 && TR[i + 1][0] < y) i++; const a = TR[i], d = TR[i + 1], t = sat((y - a[0]) / (d[0] - a[0])); return [lerp(a[1], d[1], t), lerp(a[2], d[2], t), lerp(a[3], d[3], t)]; };
  const surf = (x, y) => { const q = tor(y); return q[2] + q[1] * Math.sqrt(Math.max(0, 1 - (x / q[0]) * (x / q[0]))); };
  const tw = y => y <= .93 ? I(hips) : y < 1.12 ? W2(hips, torso, sstep(.93, 1.12, y)) : y < 1.56 ? I(torso) : W2(torso, head, sstep(1.56, 1.67, y));
  const shW = (th, x, y) => { const f = sstep(.08 * b, .17 * b, Math.abs(x)) * .45; return f < .01 ? I(torso) : [[I(torso), 1 - f], [I(x > 0 ? rig.armL : rig.armR), f]]; };
  const torCol = o.bare ? skin : o.vest ? trim : robe;
  mb.tube(TR.map(q => yr(q[0], q[1], q[2], q[0] > 1.51 ? skin : q[0] < .95 && !o.bare ? pants : torCol, q[0] > 1.34 && q[0] < 1.52 ? shW : tw(q[0]), 0, q[3])), 18, { capA: 1, g: o.bare ? 2 : 0, ur: 10, vr: 12 });
  /* 腰带、结、垂绦 */
  mb.tube([1.0, 1.03, 1.075, 1.105].map((y, i) => { const q = tor(y); return yr(y, q[0] + .013, q[1] + .013, sash, tw(y), 0, q[2], { t: i / 3 }); }), 18, { g: 1, ur: 6 });
  mb.ell([.035, 1.052, surf(.035, 1.05) + .018], [.036, .03, .02], shade(sash, 1.15), tw(1.05), 0, 5, 8);
  { const st = LB(.04, .1, .13 * bz, hips, .02, -.5, .1, 2.2); for (const [dx, ln] of [[0, .38], [.045, .29]]) mb.sheet(5, 2, (i, j, ti) => ({ p: [.02 + dx + (j - .5) * .038, 1.03 - ti * ln, surf(.04, 1.03) + .012 + ti * .02], col: shade(sash, 1 - ti * .15), w: I(st) })); }
  /* 领 */
  if (!o.bare) {
    mb.tube([[1.5, .078, .072], [1.535, .068, .064], [1.572, .061, .059]].map((q, i) => yr(q[0], q[1] * ba, q[2] * ba, trim, I(torso), 0, -.006, { t: i / 2 })), 14, { g: 1, ur: 9 });
    const lap = (x0, x1, y0, y1, n) => { const pts = []; for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t); pts.push([x, y, surf(x, y) + .008]); } mb.path(pts, [.027, .0075], 6, trim, (t, i, p) => tw(p.y), 1, new V3(0, 0, 1), { ut: 3, ur: 1 }); };
    lap(-.064, -.004, 1.548, 1.4, 4); lap(.064, -.1 * b, 1.548, 1.105, 9);
  }
  /* 臂、袖、手 */
  for (const [k, sd] of sides) {
    const x = sd * .218 * b, A = rig['arm' + k], F = rig['fore' + k], Hn = rig['hand' + k], aw = y => W2(A, F, sstep(1.25, 1.09, y)), slv = o.sleeves, sc = slv === true ? (o.vest ? robe : robe) : skin;
    const topW = (th, px) => [[I(A), .7], [I(torso), .3]];
    mb.tube([[1.5, .03], [1.475, .058], [1.4, .056], [1.3, .049], [1.19, .041], [1.1, .045], [.99, .036], [.975, .035], [.945, .03], [.92, .03]].map(([y, r], i) => yr(y, r * ba, r * ba, y > .98 ? sc : skin, i < 2 ? topW : aw(y), x, 0)), 10, { capA: 1, g: slv === true ? 0 : 2, ur: 4, vr: 10 });
    if (o.bracer) mb.tube([[1.125, .046], [1.115, .053], [1.0, .045], [.968, .041], [.96, .034]].map(([y, r], i) => yr(y, r * ba, r * ba, i === 1 || i === 3 ? shade(trim, 1.5) : trim, I(F), x)), 10, { g: 2 });
    if (slv === 'long') {
      const sl = LB(0, -.25, -.04, F, 0, -.7, .16, 2.6 + sd * .3), cw = [[I(F), .8], [I(sl), .2]], bw = [[I(F), .5], [I(sl), .5]];
      const fold = th => 1 + .05 * Math.sin(th * 5 + sd), cuff = col => yr(.95, .072, .128, col, cw, x, -.04, { mod: fold }), bot = col => ({ pos: th => { const s = Math.sin(th), m = fold(th); return [x + .066 * Math.cos(th) * m, lerp(.925, .76, sstep(.5, -.8, s)), -.058 + .13 * s * m]; }, col, w: bw, t: 1 });
      mb.tube([yr(1.505, .04, .04, robe, topW, x), yr(1.478, .058, .06, robe, topW, x), yr(1.4, .058, .064, robe, I(A), x, -.002), yr(1.29, .057, .07, robe, aw(1.29), x, -.005, { mod: fold }), yr(1.17, .06, .084, robe, aw(1.17), x, -.012, { mod: fold }), yr(1.05, .065, .104, shade(robe, .96), I(F), x, -.026, { mod: fold }), cuff(shade(robe, .92))], 14, { capA: 1, ur: 8, vr: 10 });
      mb.tube([Object.assign(cuff(trim), { t: 0 }), bot(trim)], 14, { g: 1, ur: 4 });
      mb.tube([{ pos: bot().pos, col: shade(robe, .8), w: bw }, yr(1.02, .05, .07, shade(robe, .6), I(F), x, -.02)], 14, { ur: 8, vr: 2 });
    } else if (slv === true) mb.tube([yr(1.0, .043 * ba, .043 * ba, trim, I(F), x, 0, { t: 0 }), yr(.965, .04 * ba, .04 * ba, trim, I(F), x, 0, { t: 1 })], 10, { g: 1, ur: 2 });
    if (o.pauldron) { const pc = steel; mb.dome([x + sd * .012, 1.455, 0], [.088 * ba, .075, .088 * ba], pc, [[I(A), .6], [I(torso), .4]], 3); mb.dome([x + sd * .028, 1.395, 0], [.086 * ba, .075, .084 * ba], shade(pc, .92), I(A), 3); mb.dome([x + sd * .034, 1.335, 0], [.08 * ba, .075, .078 * ba], shade(pc, .84), I(A), 3); mb.ell([x + sd * .012, 1.53, 0], [.02, .016, .02], gold, I(A), 3, 4, 6); }
    const hb = b > 1.2 ? 1.25 : 1;
    if ((k === 'R' && o.weapon !== 'none' && o.weapon !== 'bow') || (k === 'L' && o.weapon === 'bow')) { mb.ell([x, .888, .004], [.031 * hb, .043 * hb, .038 * hb], skin, I(Hn), 2, 6, 10); mb.ell([x - sd * .024 * hb, .9, .03], [.014 * hb, .028 * hb, .016 * hb], skin, I(Hn), 2, 4, 6); }
    else { mb.ell([x, .845, .003], [.019 * hb, .085 * hb, .036 * hb], skin, I(Hn), 2, 7, 10); mb.ell([x - sd * .004, .86, .04], [.012 * hb, .03 * hb, .013 * hb], skin, I(Hn), 2, 4, 6); }
  }
  /* 袍摆 */
  const skL = o.skirt === undefined ? .6 : o.skirt;
  if (skL > 0) {
    const y0 = 1.005, y1 = y0 - skL, gh = o.ghost, tl1 = gh ? LB(0, -.45, 0, hips, .1, .8, .18, 1.6) : null, tl2 = gh ? LB(0, -.36, 0, tl1, .05, .5, .2, 2.1) : null, hemT = gh ? 0 : Math.min(.25, .075 / skL), phs = rand(TAU);
    const ring = (t, ex, col, tt) => ({
      col, t: tt,
      pos: th => { const R = Math.pow(t, .85), m = 1 + t * (.045 + t * .075) * Math.sin(th * 10 + phs) + t * .04 * Math.sin(th * 4 + .5); let rx = lerp(.144 * b, .15 * b + skL * .13, R) + ex, rz = lerp(.108 * bz, .12 * bz + skL * .17, R) + ex, y = lerp(y0, y1, t); if (gh) { rx = lerp(.16, .06, t * t) * m; rz = lerp(.115, .06, t * t) * m; if (t > .99) y += .13 * Math.sin(th * 5 + phs) + .07 * Math.sin(th * 11); } return [rx * Math.cos(th) * m, y, rz * Math.sin(th) * m - t * .02 * skL]; },
      w: (th, x, y) => { if (gh) return t < .35 ? I(hips) : t < .7 ? W2(hips, tl1, sstep(.35, .7, t)) : W2(tl1, tl2, sstep(.7, 1, t)); const k = sstep(0, .85, t) * .8, s = sstep(-.07, .07, x), sh = y < .5 ? sstep(.5, .28, y) * .45 : 0; return [[I(hips), 1 - k], [I(rig.legL), k * s * (1 - sh)], [I(rig.shinL), k * s * sh], [I(rig.legR), k * (1 - s) * (1 - sh)], [I(rig.shinR), k * (1 - s) * sh]]; }
    });
    const ts = [0, .1, .24, .4, .58, .76, .9, 1].filter(t => t < 1 - hemT - .02).concat([1 - hemT]); mb.tube(ts.map(t => ring(t, 0, shade(robe, 1 - t * .1))), 40, { ur: 16, vr: 14, col: (i, th) => shade(robe, (1 - ts[i] * .1) * (1 - ts[i] * .22 * Math.max(0, -Math.sin(th * 10 + phs)))) });
    if (hemT) mb.tube([ring(1 - hemT, .004, trim, 0), ring(1, .005, trim, 1)], 40, { g: 1, ur: 10 });
    if (!o.bare && !gh && skL > .35) { const th0 = 2.02; mb.sheet(7, 2, (i, j, ti) => { const r = ring(ti * (1 - hemT), .007, trim), th = th0 + (j - .5) * .1, p = r.pos(th); return { p, col: trim, w: r.w(th, p[0], p[1]), u: ti * 4, v: j }; }, 1); }
  }
  /* 甲 */
  if (o.armor) {
    mb.tube([1.1, 1.16, 1.27, 1.38, 1.45, 1.485].map(y => { const q = tor(y); return yr(y, q[0] + .022, q[1] + .022, steel, y > 1.34 ? shW : tw(y), 0, q[2]); }), 18, { g: 3, ur: 9, vr: 4 });
    mb.ell([0, 1.3, surf(0, 1.3) + .012], [.06, .06, .02], gold, I(torso), 3, 5, 10);
    for (const a of [.62, 1.57, 2.52, 3.77, 4.71, 5.66]) mb.sheet(4, 4, (i, j, ti, tj) => { const th = a + (tj - .5) * .78, R = 1 + ti * .2, x = Math.cos(th) * (.165 * b) * R, z = Math.sin(th) * (.128 * bz) * R, y = 1.0 - ti * (o.skirt > .4 ? .34 : .28), k = ti * .5, s = sstep(-.07, .07, x); return { p: [x, y, z], col: shade(steel, 1 - ti * .12), w: [[I(hips), 1 - k], [I(rig.legL), k * s], [I(rig.legR), k * (1 - s)]], u: tj * 2, v: ti * 2 }; }, 3);
  }
  if (o.fur) { const fc = KC(0x4a3524), q = tor(1.46), lp = []; for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU + PI / 2; lp.push([Math.cos(a) * (q[0] + .01), 1.485 - .035 * Math.max(0, Math.sin(a)) - .02 * Math.abs(Math.cos(a)), Math.sin(a) * (q[1] + .025)]); } mb.path(lp, .04, 8, fc, (t, i, p) => Math.abs(p.x) > .1 ? [[I(torso), .6], [I(p.x > 0 ? rig.armL : rig.armR), .4]] : I(torso), 0, new V3(0, 1, 0), { raw: 1, col: (i, th) => shade(fc, .75 + .5 * hash2(i * 7, Math.round(th * 5))) }); }
  if (o.fur) for (let i = 0; i < 60; i++) { const a = i / 60 * TAU + rand(.1), y = 1.5 + rand(-.03, .02), q = tor(1.45), x = Math.cos(a) * (q[0] + .03), z = Math.sin(a) * (q[1] + .045); mb.cone([x * .9, y, z * .9], [x * 1.1 + rand(-.015, .015), y - .035 + rand(-.02, .03), z * 1.16], .02, shade(KC(0x5a4230), rand(.6, 1.2)), Math.abs(x) > .11 ? [[I(torso), .6], [I(x > 0 ? rig.armL : rig.armR), .4]] : I(torso), 0, 4); }
  if (o.strap) { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8, x = lerp(.16 * b, -.15 * b, t), y = lerp(1.47, 1.09, t); pts.push([x, y, surf(x, y) + .014]); } mb.path(pts, [.026, .008], 6, KC(0x2a1c14), (t, i, p) => tw(p.y), 2); mb.ell([-.02, 1.3, surf(-.02, 1.3) + .022], [.022, .022, .008], gold, I(torso), 3, 4, 8); }
  if (o.beads) for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, q = tor(1.42), y = 1.43 - .11 * Math.max(0, Math.sin(a)); mb.ell([Math.cos(a) * (q[0] * .72), y, Math.sin(a) * (q[1] + .02) + q[2]], [.03, .03, .03], i % 4 ? KC(0x5a2a1c) : bone, I(torso), 2, 4, 6); }
  /* 披风 */
  if (o.cape) {
    const cc = KC(o.cape), cp = [LB(0, .5, -.15 * bz, torso, .13, .9, .1, 1.8)]; cp.push(LB(0, -.38, 0, cp[0], .05, .5, .12, 2.3)); cp.push(LB(0, -.38, 0, cp[1], .04, .45, .14, 2.7)); const rg = o.capeRag ? mulberry(7) : null;
    mb.sheet(9, 7, (i, j, ti, tj) => { const w = lerp(.19, .34, Math.pow(ti, .8)) * b, x = (tj - .5) * 2 * w, edge = rg && i === 8 ? rg() * .2 : 0; return { p: [x, 1.5 - ti * 1.18 + edge - (i === 0 ? Math.abs(x) * .25 : 0), -.15 * bz - .05 * Math.cos(tj * PI * 2) * ti - (1 - Math.abs(tj - .5) * 2) * .03 + (i === 0 ? Math.abs(x) * .45 : 0)], col: shade(cc, 1 - .25 * Math.abs(Math.sin(tj * PI * 3)) * ti), w: i === 0 ? I(torso) : chainW(cp, ti * 3.1 - .35) }; });
    mb.ell([-.13 * b, 1.49, .02], [.03, .03, .02], gold, I(torso), 3, 4, 6); mb.ell([.13 * b, 1.49, .02], [.03, .03, .02], gold, I(torso), 3, 4, 6);
  }
  /* 佩饰 */
  if (o.scabbard) { mb.path([[.17 * b, 1.06, .04], [.215, .86, -.1], [.27, .6, -.3], [.3, .5, -.38]], t => [.03 - t * .008, .017 - t * .004], 8, KC(0x18242a), I(hips), 2); for (const [p, r] of [[[.172 * b, 1.04, .03], .034], [[.228, .8, -.14], .03], [[.296, .51, -.37], .027]]) mb.ell(p, [r, .014, r * .7], gold, I(hips), 3, 4, 8); }
  if (o.jade) { const jb = LB(-.1, .08, .125 * bz, hips, 0, -.7, .14, 2.8), X = -.1, Z = surf(-.1, 1.0) + .02; mb.path([[X, 1.01, Z], [X, .91, Z]], .004, 4, accent, I(jb)); mb.tube([zr(Z - .005, .03, .03, KC(0x8fe0c0), I(jb), .875, X), zr(Z + .005, .03, .03, KC(0x8fe0c0), I(jb), .875, X)], 12, { g: 2, capA: 1, capB: 1 }); mb.ell([X, .84, Z], [.011, .012, .011], accent, I(jb)); mb.path([[X, .83, Z], [X, .76, Z], [X, .68, Z]], t => .015 * (1 - t * .55), 6, accent, I(jb)); }
  if (o.quiver) { mb.path([[-.14, 1.12, -.15 * bz - .03], [.0, 1.36, -.16 * bz - .04], [.07, 1.5, -.17 * bz - .04]], [.052, .04], 8, KC(0x4a3526), I(torso), 2); for (let i = 0; i < 4; i++) { const ox = i * .022 - .03, oz = (i % 2) * .03 - .015; mb.path([[.07 + ox, 1.5, -.2 * bz + oz], [.12 + ox, 1.62, -.21 * bz + oz]], .006, 4, KC(0xcbb89a), I(torso), 2); mb.ell([.125 + ox, 1.63, -.21 * bz + oz], [.016, .03, .006], i % 2 ? accent : KC(0xe8e0d0), I(torso)); } }

  /* 头：面容贴图 + 发、冠、盔 */
  const fcfg = Object.assign({ skin: c.skin }, FACES[hs] || {}, o.face || {}), ft = faceTex(fcfg), jaw = o.jaw || 0, hsz = o.headSize || 1;
  const hm = new T.Mesh(headData(jaw).geo, rig.M(0xffffff, Object.assign({ map: ft.map, rough: .62 }, ft.emap ? { emap: ft.emap, emissive: 0xffffff, ei: 2.4 } : {}))); hm.position.set(0, .12, 0); hm.scale.setScalar(hsz); head.add(hm);
  const HY = 1.71, hw = I(head), hl = (x, y, z) => y > (z > 0 ? lerp(.02, .44, sstep(0, .5, z)) + .1 * Math.abs(x) * Math.max(0, z) : lerp(.02, -.5, sstep(0, .7, -z))), HK = .91, hsc = (x, y, z) => (1.06 + .04 * Math.max(0, y) + .04 * Math.max(0, -z)) / HK;
  const capHair = col => shellInto(mb, jaw, hl, hsc, col || hair, hw, 2, 0);
  if (!fcfg.void) for (const sd of [-1, 1]) mb.ell([sd * .097 * hsz, HY - .004, -.01], [.012, .028, .018], skin, hw, 2, 5, 6);
  mb.T(0, HY, 0, 0, 0, 0, hsz * HK);
  const lock = (sd, len, col) => { mb.path([[sd * .092, .085, .058], [sd * .112, .02, .062], [sd * .116, -.06, .058], [sd * .112, -.06 - len * .5, .06], [sd * .1, -.06 - len, .07]], t => [.02 * (1 - t * .7) + .004, .0085 * (1 - t * .4)], 6, col || hair, hw, 2, new V3(sd, 0, .4)); mb.path([[sd * .012, .118, .112], [sd * .05, .1, .112], [sd * .09, .05, .09], [sd * .104, -.01, .074]], t => [.02 * (1 - t * .6) + .003, .007], 6, col || hair, hw, 2); };
  const dome = (col, k = 1, g = 3) => mb.tube([[.178, .004], [.17, .05], [.146, .096], [.105, .126], [.066, .135], [.046, .137], [.036, .162]].map(([y, r]) => yr(y * k, r * k, r * 1.13 * k, col, hw, 0, -.004)), 16, { g, ur: 6, vr: 3 });
  const guard = (col, k = 1) => mb.tube([[.05, .14, .155], [-.04, .154, .168], [-.13, .176, .184]].map(([y, rx, rz]) => yr(y, rx * k, rz * k, col, hw, 0, -.004)), 14, { g: 3, arc: [PI * .86, PI * 2.14], ur: 6, vr: 2 });
  const plume = (ln, col) => { mb.cone([0, .16, 0], [0, .235, 0], .022, gold, hw, 3, 6); mb.path([[0, .225, 0], [0, .262, -.035], [0, .235, -.11], [0, .235 - ln * .5, -.17], [0, .235 - ln, -.16]], t => .036 * (1 - t * .7) + .004, 7, col, hw, 0); };
  const strawHat = (R, col, tilt) => { mb.T(0, HY, 0, tilt, 0, 0, hsz * HK); mb.tube([[.21, .004], [.2, .06], [.155, .2 * R / .37], [.098, R * .96], [.086, R], [.08, R * .97], [.115, .13]].map(([y, r]) => yr(y, r, r, col, hw)), 22, { ur: 30, vr: 6 }); mb.ell([0, .212, 0], [.022, .014, .022], shade(col, .6), hw, 0, 4, 8); mb.T(0, HY, 0, 0, 0, 0, hsz * HK); };
  if (hs === 'knot') {
    capHair(); lock(1, .17); lock(-1, .17); mb.ell([0, .168, -.03], [.05, .042, .05], hair, hw, 2, 6, 10);
    mb.tube([yr(.128, .044, .044, KC(0xd8dde2), hw, 0, -.03), yr(.142, .047, .047, KC(0xd8dde2), hw, 0, -.03), yr(.17, .04, .04, KC(0xd8dde2), hw, 0, -.03)], 12, { g: 3 }); mb.path([[-.105, .158, -.03], [.105, .158, -.03]], .005, 5, KC(0xd8dde2), hw, 3); mb.ell([.11, .158, -.03], [.012, .012, .012], KC(0x7fd8b8), hw, 2, 4, 6);
    mb.T0(); const pt = [LB(0, .28, -.085, head, .2, .5, .08, 2.4)]; for (let i = 0; i < 3; i++) pt.push(LB(0, -.15, 0, pt[i], .04, .14, .07, 2.9 + i * .5));
    mb.tube([[1.875, .02, -.075], [1.85, .034, -.1], [1.76, .037, -.15], [1.63, .034, -.155], [1.5, .028, -.14], [1.38, .021, -.13], [1.29, .013, -.125], [1.25, .004, -.125]].map(([y, r, z]) => yr(y, r, r * .8, hair, chainW(pt, (1.87 - y) / .15 - .5), 0, z)), 10, { g: 2, capB: 1 });
    for (const sd of [-1, 1]) { const rb = [LB(sd * .03, .285, -.08, head, .25, .75, .22, 3.4 + sd * .6)]; rb.push(LB(0, -.22, 0, rb[0], .08, .3, .2, 4.1 + sd * .4)); mb.sheet(7, 2, (i, j, ti) => ({ p: [sd * .03 + (j - .5) * .032 + sd * ti * .07, 1.875 - ti * .52, -.105 - ti * .07], col: shade(accent, 1 - ti * .1), w: chainW(rb, ti * 2.3 - .4) })); }
  } else if (hs === 'band') {
    capHair(); const r = mulberry(11); for (let i = 0; i < 26; i++) { const a = r() * TAU, e = .15 + r() * 1.15, x = Math.cos(a) * Math.sin(e) * .1, z = Math.sin(a) * Math.sin(e) * .11 - .02, y = Math.cos(e) * .13; if (z > .05 && y < .09) continue; mb.cone([x * .9, y * .9, z * .9], [x * 1.3, y * 1.25 + .012, z * 1.3 - .035], .03, shade(hair, .8 + r() * .5), hw, 2, 4); }
    mb.tube([[.082, .117, .131], [.066, .12, .134], [.046, .119, .134]].map(([y, rx, rz], i) => yr(y, rx, rz, accent, hw, 0, -.004, { t: i / 2 })), 18, { g: 1, ur: 5 }); mb.ell([0, .064, -.14], [.022, .02, .014], accent, hw, 0, 4, 6);
    mb.T0(); const tb = LB(0, .185, -.135, head, .15, 1.2, .3, 3); for (const dx of [-.02, .025]) mb.sheet(5, 2, (i, j, ti) => ({ p: [dx + (j - .5) * .03, 1.775 - ti * (.24 + dx), -.14 - ti * .03], col: accent, w: I(tb) }));
  } else if (hs === 'hat') {
    capHair(); lock(1, .04); lock(-1, .04); mb.ell([0, -.03, -.125], [.042, .04, .04], hair, hw, 2, 5, 8); strawHat(.37, KC(0xb99d5c), -.07);
    mb.tube([[.0, .113, .13], [-.05, .112, .128], [-.1, .1, .112], [-.15, .09, .09]].map(([y, rx, rz]) => yr(y, rx, rz, trim, hw, 0, .002)), 16, { ur: 6, vr: 3 });
  } else if (hs === 'helmet') {
    dome(KC(0x5c6066)); guard(KC(0x4a4e54)); plume(.16, accent); mb.tube([yr(.07, .139, .158, gold, hw, 0, -.004), yr(.048, .141, .16, gold, hw, 0, -.004)], 16, { g: 3 });
  } else if (hs === 'mask') {
    for (const sd of [-1, 1]) { mb.path([[sd * .062, .09, .08], [sd * .11, .15, .1], [sd * .14, .24, .085], [sd * .125, .33, .04]], t => .03 * (1 - t * .85) + .003, 7, bone, hw, 2); mb.cone([sd * .046, -.088, .098], [sd * .062, -.02, .126], .013, bone, hw, 2, 5); }
    mb.ell([0, .088, .104], [.092, .026, .028], KC(0x3a3632), hw, 3, 4, 10); mb.path([[0, .13, -.02], [0, .2, -.06], [0, .17, -.15], [0, .06, -.2]], t => .03 * (1 - t * .7), 6, hair, hw, 2);
  } else if (hs === 'hood') {
    shellInto(mb, 0, (x, y, z) => !(z > .3 && Math.abs(x) < .66 && y > -.7 && y < .6), (x, y, z) => 1.24 + .1 * Math.max(0, -z) + .06 * Math.max(0, y), robe, hw, 0, 0);
    mb.cone([0, .1, -.13], [0, .19, -.3], .09, robe, hw, 0, 8); mb.T0();
    mb.tube([[1.6, .125, .12], [1.54, .17, .14], [1.48, .25, .16], [1.42, .29, .17]].map(([y, rx, rz]) => yr(y, rx, rz, shade(robe, .85), y > 1.5 ? I(torso) : shW, 0, 0)), 18, { ur: 10, vr: 3 });
  } else if (hs === 'warlord') {
    dome(KC(0x3f4247), 1.06); guard(KC(0x34373c), 1.06); plume(.3, accent); mb.tube([yr(.085, .147, .167, gold, hw, 0, -.004), yr(.05, .15, .17, gold, hw, 0, -.004)], 16, { g: 3 }); mb.ell([0, .13, .135], [.032, .05, .014], gold, hw, 3, 5, 8);
    for (const sd of [-1, 1]) mb.path([[sd * .11, .075, 0], [sd * .2, .11, 0], [sd * .262, .21, .012], [sd * .235, .35, .035]], t => .037 * (1 - t * .85) + .004, 8, bone, hw, 2);
    for (let i = -2; i <= 2; i++) mb.path([[i * .024, -.105, .088], [i * .03, -.19, .1], [i * .022, -.27 + Math.abs(i) * .03, .075]], t => .019 * (1 - t * .75) + .003, 5, hair, hw, 2);
  } else if (hs === 'demon') {
    capHair(); lock(1, .3); lock(-1, .3); strawHat(.43, KC(0x16130f), .1);
    for (let i = 0; i < 9; i++) { const a = PI * 1.02 + i / 8 * PI * .96, R = .41, ln = .16 + (i * 37 % 5) * .035; mb.sheet(3, 2, (r, j, ti) => ({ p: [Math.cos(a + (j - .5) * .16) * R, .09 - ti * ln, Math.sin(a + (j - .5) * .16) * R + .02], col: KC(0x120f0d), w: hw })); }
    mb.T0(); const bh = [LB(0, .2, -.1, head, .12, .8, .08, 2)]; for (let i = 0; i < 3; i++) bh.push(LB(0, -.19, 0, bh[i], .03, .28, .08, 2.5 + i * .4));
    mb.tube([[1.8, .09, .03, -.1], [1.7, .11, .035, -.135], [1.52, .1, .034, -.15], [1.34, .085, .03, -.15], [1.16, .065, .024, -.145], [1.02, .03, .012, -.14]].map(([y, rx, rz, z]) => yr(y, rx, rz, hair, chainW(bh, (1.79 - y) / .19 - .4), 0, z, { mod: th => 1 + .06 * Math.sin(th * 7) })), 14, { g: 2, capB: 1 });
  } else capHair();
  mb.T0();

  rig.bind(mb, rig.skinMats());
  if (o.weapon && o.weapon !== 'none') { const w = makeWeapon(o.weapon, rig); if (o.weapon === 'bow') rig.handL.add(w.group); else { rig.handR.add(w.group); rig.bladeLen = w.len; rig.bladeBase = w.base; } rig.weapon = w.group; }
  root.scale.setScalar(o.scale || 1); rig.finish();

  rig.solveIK = function () {
    const C = this.C, s = this.root.scale.x, a = .28 * s, bb = .28 * s, K = _ik;
    this.torso.updateWorldMatrix(true, false); this.torso.matrixWorld.decompose(K.p, K.qt, K.sc); this.inner.matrixWorld.decompose(K.p, K.qi, K.sc);
    K.S.copy(this.armR.position).applyMatrix4(this.torso.matrixWorld); K.T.set(C.hx, C.hy, C.hz).applyMatrix4(this.inner.matrixWorld);
    K.d.subVectors(K.T, K.S); let dist = K.d.length(); const mx = (a + bb) * .995; if (dist > mx) { K.d.multiplyScalar(mx / dist); dist = mx; K.T.copy(K.S).add(K.d); } if (dist < .08 * s) dist = .08 * s; K.d.normalize();
    const cosA = clamp((a * a + dist * dist - bb * bb) / (2 * a * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    K.pole.set(-.55, -1, -.7).applyQuaternion(K.qi); K.pole.addScaledVector(K.d, -K.pole.dot(K.d)).normalize();
    K.E.copy(K.S).addScaledVector(K.d, a * cosA).addScaledVector(K.pole, a * sinA);
    K.v.subVectors(K.E, K.S).normalize().applyQuaternion(K.q1.copy(K.qt).invert()); this.armR.quaternion.setFromUnitVectors(DOWN, K.v);
    K.q2.copy(K.qt).multiply(this.armR.quaternion);
    K.v.subVectors(K.T, K.E).normalize().applyQuaternion(K.q1.copy(K.q2).invert()); this.foreR.quaternion.setFromUnitVectors(DOWN, K.v);
    K.q2.multiply(this.foreR.quaternion);
    K.W.set(C.dx, C.dy, C.dz); if (K.W.lengthSq() < 1e-4) K.W.set(0, 1, 0); K.W.normalize().applyQuaternion(K.qi);
    K.q1.setFromUnitVectors(UP, K.W); this.handR.quaternion.copy(K.q2.invert()).multiply(K.q1);
  };
  rig.bladePts = function (base, tip) { this.handR.updateWorldMatrix(true, false); base.set(0, this.bladeBase, 0).applyMatrix4(this.handR.matrixWorld); tip.set(0, this.bladeLen, 0).applyMatrix4(this.handR.matrixWorld); };
  rig.reset = function () { const P = this.P; for (const k of PKEYS) P[k] = POSE0[k]; P.rootY = 0; P.spin = 0; P.fall = 0; if (this.stance) { P.hx = this.stance[0]; P.hy = this.stance[1]; P.hz = this.stance[2]; P.dx = this.stance[3]; P.dy = this.stance[4]; P.dz = this.stance[5]; } return P; };
  rig.apply = function (dt, rate, t, mv) {
    const P = this.P, C = this.C, k = 1 - Math.exp(-rate * dt); for (const key of PKEYS) C[key] += (P[key] - C[key]) * k;
    this.inner.position.y = P.rootY || 0; this.inner.rotation.y = P.spin || 0; this.inner.rotation.x = -(P.fall || 0) * 1.5;
    this.hips.position.y = .93 + C.hipY; this.hips.rotation.set(C.hipRX, C.hipRY, C.hipRZ); this.torso.rotation.set(C.torRX, C.torRY, C.torRZ); this.head.rotation.set(C.headRX, C.headRY, 0);
    this.armL.rotation.set(C.LaX, 0, C.LaZ); this.foreL.rotation.x = C.LfX; this.legL.rotation.set(C.LlX, 0, C.LlZ); this.shinL.rotation.x = C.LsX; this.legR.rotation.set(C.RlX, 0, C.RlZ); this.shinR.rotation.x = C.RsX;
    if (this.ik) this.solveIK(); else { this.armR.quaternion.setFromEuler(_e.set(C.RaX, 0, C.RaZ)); this.foreR.quaternion.setFromEuler(_e.set(C.RfX, 0, 0)); }
    for (const l of this.lag) { const tg = l.rest + mv * l.amp + Math.sin(t * l.w + this.phase) * l.sway; l.o.rotation.x = damp(l.o.rotation.x, tg, 7, dt); }
  };
  return rig;
}

const _e = new T.Euler();

function locomotion(rig, P, sp, dt, t) {
  if (sp > .04) rig.phase += dt * (3.5 + sp * 7.2);
  const ph = rig.phase, A = Math.min(1, sp) * (.56 + .22 * Math.max(0, sp - 1)), sn = Math.sin(ph), cs = Math.cos(ph);
  P.LlX = -sn * A * 1.05; P.RlX = sn * A * 1.05; P.LsX = Math.max(0, cs) * A * 1.5 + .12 * A; P.RsX = Math.max(0, -cs) * A * 1.5 + .12 * A;
  P.hipY = -Math.abs(cs) * .04 * A - .02 * A + Math.sin(t * 1.7 + rig.phase * 0) * .006; P.torRX = .15 * A + Math.sin(t * 1.7) * .012; P.torRY = sn * .13 * A; P.hipRY = -sn * .09 * A;
  P.LaX = sn * A * .75; P.LfX = -.25 - A * .55; P.RaX = -sn * A * .75; P.RfX = -.25 - A * .55;
}
function setHand(P, x, y, z, dx, dy, dz) { P.hx = x; P.hy = y; P.hz = z; P.dx = dx; P.dy = dy; P.dz = dz; }
function arcHand(P, th, el, r, y, lag) { const tb = th - lag, ce = Math.cos(el); P.hx = Math.sin(th) * r; P.hz = Math.cos(th) * r + .06; P.hy = y; P.dx = Math.sin(tb) * ce; P.dy = Math.sin(el); P.dz = Math.cos(tb) * ce; }
function vertHand(P, phi, y0, r, x) { P.hx = x; P.hy = y0 + Math.cos(phi) * r; P.hz = .12 + Math.sin(phi) * r; P.dx = 0; P.dy = Math.cos(phi); P.dz = Math.sin(phi); }

/* 动作库：u ∈ [0,1] 为整段进度，w 为蓄势结束点，a 为出手结束点 */
const HA = {
  sweepRL(P, u, w, a) {
    let th, el, y, lag = 0;
    if (u < w) { const k = smooth(u / w); th = lerp(-.7, -2.4, k); el = lerp(-.3, .14, k); y = lerp(1.05, 1.34, k); P.torRY = -.8 * k; P.hipRY = -.3 * k; }
    else if (u < a) { const k = easeOut((u - w) / (a - w)); th = lerp(-2.4, 1.95, k); el = lerp(.14, -.12, k); y = lerp(1.34, 1.16, k); P.torRY = lerp(-.8, .8, k); P.hipRY = lerp(-.3, .35, k); lag = .4 * (1 - k); }
    else { const k = (u - a) / (1 - a); th = 1.95 + .15 * k; el = -.12 - .2 * k; y = 1.16 - .08 * k; P.torRY = .8 - .3 * k; P.hipRY = .35 - .12 * k; }
    arcHand(P, th, el, .52, y, lag); P.torRX = .2; P.hipY = -.1; P.LlX = -.6; P.LsX = .65; P.RlX = .42; P.RsX = .28; P.LaX = .5; P.LaZ = .55; P.LfX = -.9;
  },
  sweepLR(P, u, w, a) {
    let th, el, y, lag = 0;
    if (u < w) { const k = smooth(u / w); th = lerp(1.2, 2.3, k); el = lerp(-.3, -.45, k); y = lerp(1.1, .98, k); P.torRY = .8 * k; P.hipRY = .3 * k; }
    else if (u < a) { const k = easeOut((u - w) / (a - w)); th = lerp(2.3, -2.1, k); el = lerp(-.45, .5, k); y = lerp(.98, 1.52, k); P.torRY = lerp(.8, -.85, k); P.hipRY = lerp(.3, -.35, k); lag = -.4 * (1 - k); }
    else { const k = (u - a) / (1 - a); th = -2.1 - .15 * k; el = .5 - .25 * k; y = 1.52 - .12 * k; P.torRY = -.85 + .3 * k; P.hipRY = -.35 + .12 * k; }
    arcHand(P, th, el, .52, y, lag); P.torRX = .16; P.hipY = -.1; P.RlX = -.6; P.RsX = .65; P.LlX = .42; P.LsX = .28; P.LaX = -.3; P.LaZ = .8; P.LfX = -.7;
  },
  thrust(P, u, w, a) {
    let k;
    if (u < w) { k = smooth(u / w); setHand(P, -.3, 1.24, lerp(.1, -.24, k), .04, .02, 1); P.torRY = -.75 * k; P.torRX = .05; }
    else if (u < a) { k = easeOut((u - w) / (a - w)); setHand(P, lerp(-.3, -.04, k), 1.3, lerp(-.24, .84, k), 0, .02, 1); P.torRY = lerp(-.75, .5, k); P.torRX = lerp(.05, .36, k); }
    else { k = (u - a) / (1 - a); setHand(P, -.04 - .1 * k, 1.3 - .08 * k, .84 - .2 * k, 0, 0, 1); P.torRY = .5 - .2 * k; P.torRX = .36 - .12 * k; }
    P.hipY = -.14; P.LlX = -.75; P.LsX = .8; P.RlX = .55; P.RsX = .2; P.LaX = 1.0; P.LaZ = .45; P.LfX = -.3;
  },
  jumpChop(P, u, w, a) {
    const land = (w + a) * .5; P.rootY = .95 * Math.sin(PI * sat((u - .04) / (land - .04))); let phi;
    if (u < w) { const k = smooth(u / w); phi = lerp(1.2, -.9, k); P.torRX = -.3 * k; }
    else if (u < land) { const k = easeIn((u - w) / (land - w)) * .5 + .5 * sat((u - w) / (land - w)); phi = lerp(-.9, 2.15, k); P.torRX = lerp(-.3, .55, k); }
    else { phi = 2.15; P.torRX = .55 - .25 * sat((u - land) / (1 - land)); }
    vertHand(P, phi, 1.42, .36, -.12);
    if (u < land) { P.LlX = -1.0; P.LsX = 1.4; P.RlX = -.25; P.RsX = 1.5; } else { P.hipY = -.3 + .2 * sat((u - land) / (1 - land)); P.LlX = -.85; P.LsX = 1.0; P.RlX = .5; P.RsX = .7; }
    P.LaX = -.6; P.LaZ = .7; P.LfX = -.8;
  },
  spin(P, u, w, a) {
    const k = sat((u - w * .5) / (a - w * .5)); P.spin = TAU * (k * k * (3 - 2 * k)); arcHand(P, -1.25, -.04, .56, 1.2, 0);
    P.torRX = .18; P.hipY = -.14; P.LlZ = .28; P.RlZ = -.28; P.LsX = .3; P.RsX = .3; P.LaZ = 1.25; P.LaX = .1; P.LfX = -.2;
  },
  whirl(P, u, w, a, rig, t) { P.spin = t * 19; arcHand(P, -1.3, -.02, .56, 1.25, 0); P.torRX = .1; P.hipY = -.08; P.LlZ = .2; P.RlZ = -.2; P.LaZ = 1.35; P.LfX = -.1; },
  summon(P, u) { setHand(P, -.14, 1.32, .32, 0, 1, .05); P.LaX = -1.9; P.LaZ = .12; P.LfX = -.45; P.torRX = -.06; P.rootY = .18 * Math.sin(PI * u); P.LlX = -.2; P.LsX = .3; },
  ult(P, u) {
    const up = smooth(u / .18), dn = sstep(.84, .97, u); P.rootY = 1.9 * up * (1 - dn);
    if (u < .82) setHand(P, -.1, 1.86, .06, 0, 1, 0); else { const k = sstep(.82, .95, u); vertHand(P, lerp(0, 2.2, k), 1.42, .38, -.12); P.torRX = .5 * k; }
    P.LaX = -1.15; P.LaZ = -.3; P.LfX = -1.7; P.LlX = -.7; P.LsX = 1.2; P.RlX = .12; P.RsX = .3; P.headRX = -.2 * (1 - dn);
  },
  dodge(P, u) { const s = Math.sin(PI * u); P.spin = TAU * easeOut(u); P.torRX = .6 * s; P.hipY = -.3 * s; P.rootY = .1 * s; P.LlX = -.85 * s; P.LsX = 1.3 * s; P.RlX = .4 * s; P.RsX = .9 * s; P.LaX = .6 * s; P.LaZ = .6; },
  hurt(P, k) { P.torRX = -.45 * k; P.headRX = -.3 * k; P.hipY -= .06 * k; P.LaZ = .14 + .7 * k; P.LaX = .3 * k; P.torRY = .3 * k; P.RaZ = -.14 - .6 * k; },
  chop(P, u, w, a) {
    let phi;
    if (u < w) { const k = smooth(u / w); phi = lerp(.9, -1.0, k); P.torRX = -.25 * k; P.torRY = -.3 * k; }
    else if (u < a) { const k = easeOut((u - w) / (a - w)); phi = lerp(-1.0, 2.1, k); P.torRX = lerp(-.25, .5, k); P.torRY = lerp(-.3, .25, k); }
    else { phi = 2.1; P.torRX = .5 - .2 * (u - a) / (1 - a); P.torRY = .25; }
    vertHand(P, phi, 1.4, .36, -.14); P.hipY = -.08; P.LlX = -.5; P.LsX = .5; P.RlX = .35; P.RsX = .2; P.LaX = -.4; P.LaZ = .5; P.LfX = -.8;
  },
  slam(P, u, w, a) {
    HA.chop(P, u, w, a); const k = u < w ? smooth(u / w) : 1 - sat((u - w) / (a - w)); P.LaX = lerp(-.8, -2.7, k); P.LaZ = .1; P.LfX = -.5;
    P.rootY = u < a ? .35 * Math.sin(PI * sat((u - w * .6) / (a - w * .6))) : 0; if (u >= a) P.hipY = -.3;
  },
  shoot(P, u, w, a) {
    P.LaX = -1.5; P.LaZ = .1; P.LfX = -.04; P.torRY = -.2; P.headRY = .1;
    if (u < w) { const k = smooth(u / w); setHand(P, lerp(-.05, -.22, k), 1.4, lerp(.42, -.02, k), 0, 0, 1); } else setHand(P, -.1, 1.38, .3, 0, 0, 1);
    P.LlX = -.3; P.RlX = .3; P.hipY = -.05;
  },
  cast(P, u, w, a) {
    if (u < w) { const k = smooth(u / w); setHand(P, -.36, lerp(1.2, 1.8, k), .15, 0, 1, 0); P.LaX = lerp(-.5, -2.5, k); P.LaZ = .5; P.torRX = -.2 * k; }
    else { const k = easeOut((u - w) / Math.max(.01, a - w)); setHand(P, -.2, lerp(1.8, 1.4, k), lerp(.15, .6, k), 0, .4, 1); P.LaX = lerp(-2.5, -1.4, k); P.LaZ = .2; P.torRX = lerp(-.2, .3, k); }
    P.LfX = -.3;
  },
  dash(P, u, w, a) {
    if (u < w) { const k = smooth(u / w); setHand(P, -.36, 1.05, -.3 * k, -.2, -.1, 1); P.torRY = -.8 * k; P.hipY = -.25 * k; P.torRX = .3 * k; P.LlX = -.6 * k; P.LsX = .9 * k; P.RlX = .5 * k; }
    else { setHand(P, -.05, 1.2, .82, 0, 0, 1); P.torRY = .5; P.torRX = .6; P.hipY = -.2; P.LlX = -.9; P.LsX = .6; P.RlX = .8; P.RsX = .3; P.LaX = 1.2; P.LaZ = .4; }
  },
  leap(P, u, w, a) {
    if (u < w) { const k = smooth(u / w); P.hipY = -.36 * k; P.torRX = .35 * k; vertHand(P, lerp(.9, -.6, k), 1.3, .36, -.14); P.LlX = -.5 * k; P.LsX = 1.0 * k; P.RlX = -.5 * k; P.RsX = 1.0 * k; }
    else if (u < a) { const k = (u - w) / (a - w); vertHand(P, lerp(-1.0, 2.1, easeIn(k)), 1.45, .38, -.14); P.torRX = lerp(-.3, .55, k); P.LlX = -.9; P.LsX = 1.3; P.RlX = .2; P.RsX = 1.2; P.LaX = -2.4 + 1.6 * k; }
    else { vertHand(P, 2.1, 1.4, .36, -.14); P.torRX = .5; P.hipY = -.32; P.LlX = -.8; P.LsX = 1.0; P.RlX = .5; P.RsX = .7; }
  },
  roar(P, u) { const k = Math.sin(PI * sat(u)); P.torRX = -.35 * k; P.headRX = -.4 * k; P.LaZ = .14 + 1.2 * k; P.LaX = -.3 * k; setHand(P, -.7, 1.0 + .6 * k, .1, -.6, .7, .2); P.hipY = -.12 * k; P.LlZ = .2; P.RlZ = -.2; },
};

function animHuman(rig, dt, t, st) {
  const P = rig.reset(); locomotion(rig, P, st.speed || 0, dt, t);
  if (st.pose) st.pose(P);
  if (st.action) { const a = st.action; HA[a.name](P, a.u, a.w, a.a, rig, t); }
  if (st.hurt > 0) HA.hurt(P, st.hurt);
  if (st.fall) { P.fall = st.fall; P.hipY -= .1 * st.fall; }
  if (st.rootY) P.rootY = (P.rootY || 0) + st.rootY;
  rig.apply(dt, st.rate || 14, t, (st.speed || 0) + (st.action ? .5 : 0));
}


/* ---------------- 妖狼 ---------------- */
function makeWolf(o) {
  const rig = { kind: 'wolf', phase: rand(TAU), bones: [] }; rigBase(rig);
  const fur = KC(o.fur || 0x2b2731), fur2 = KC(o.fur2 || 0x5c5466), dark = KC(0x141218), tooth = KC(0xe8e0d0);
  const root = rig.root = new T.Group(), inner = rig.inner = group(0, 0, 0, root);
  const BN = (x, y, z, par) => { const bn = new T.Bone(); bn.position.set(x, y, z); par.add(bn); bn.userData.i = rig.bones.length; rig.bones.push(bn); return bn; }, I = bn => bn.userData.i, W2 = (a, b, t) => t <= .001 ? I(a) : t >= .999 ? I(b) : [[I(a), 1 - t], [I(b), t]];
  const body = rig.body = BN(0, .66, 0, inner), neck = rig.neck = BN(0, .14, .52, body), head = rig.headG = BN(0, .16, .26, neck), jaw = rig.jaw = BN(0, -.07, .12, head);
  const tail = rig.tail = BN(0, .1, -.56, body), tail2 = rig.tail2 = BN(0, 0, -.26, tail), tail3 = rig.tail3 = BN(0, 0, -.24, tail2); rig.legs = [];
  const mb = new MB(true), belly = (i, th) => Math.sin(th) < -.35 ? fur2 : fur;
  /* 躯干—颈—头 */
  const sp = [[-.66, .03, .03, .74], [-.58, .15, .17, .7], [-.42, .2, .22, .68], [-.2, .165, .185, .685], [.05, .19, .23, .645], [.3, .22, .27, .64], [.47, .19, .245, .7], [.6, .145, .18, .79], [.72, .12, .14, .9], [.8, .128, .128, .97], [.9, .124, .116, .985], [.99, .094, .09, .965], [1.08, .062, .06, .945], [1.2, .05, .047, .932], [1.27, .034, .036, .93], [1.3, .012, .014, .93]];
  const bw = z => z < .44 ? I(body) : z < .62 ? W2(body, neck, sstep(.44, .62, z)) : z < .8 ? W2(neck, head, sstep(.62, .8, z)) : I(head);
  mb.tube(sp.map(([z, rx, ry, cy]) => zr(z, rx, ry, fur, bw(z), cy)), 16, { capA: 1, capB: 1, col: (i, th) => sp[i][0] > 1.24 ? dark : sp[i][0] > 1.0 && Math.sin(th) < .2 ? fur2 : belly(i, th), ur: 6, vr: 10 });
  mb.tube([[.94, .04, .028, .892], [1.05, .04, .026, .888], [1.18, .034, .022, .888], [1.25, .02, .014, .89]].map(([z, rx, ry, cy]) => zr(z, rx, ry, fur2, I(jaw), cy)), 8, { capA: 1, capB: 1 });
  for (const sd of [-1, 1]) {
    mb.path([[sd * .075, 1.07, .86], [sd * .1, 1.17, .83], [sd * .115, 1.25, .79]], t => [.05 * (1 - t) + .004, .018 * (1 - t * .6)], 6, fur, I(head), 0, new V3(0, 0, 1));
    for (const z of [1.14, 1.2]) mb.cone([sd * .03, .925, z], [sd * .032, .868, z + .008], .011, tooth, I(head), 2, 4); mb.cone([sd * .024, .9, 1.17], [sd * .026, .94, 1.175], .009, tooth, I(jaw), 2, 4);
    for (let i = 0; i < 3; i++) mb.cone([sd * .11, .93 - i * .03, .84], [sd * .2, .9 - i * .05, .74 - i * .02], .035, fur2, I(head), 0, 5);
  }
  /* 鬃毛与背刺 */
  for (let i = 0; i < 12; i++) { const a = -.5 + i / 11 * (PI + 1), x = Math.cos(a) * .17, y = .78 + Math.sin(a) * .2; mb.cone([x * .8, y, .56], [x * 1.5, y + Math.sin(a) * .1 + .05, .36 + (i % 2) * .05], .06, i % 3 ? fur : fur2, W2(body, neck, .5), 0, 5); }
  for (let i = 0; i < 10; i++) { const z = .42 - i * .1, y = .9 - Math.abs(z + .05) * .12; mb.cone([0, y - .04, z], [(i % 2 - .5) * .05, y + .13 - i * .006, z - .13], .055, i % 2 ? fur : shade(fur, .7), I(body), 0, 5); }
  /* 四肢 */
  for (const [x, z, f] of [[.16, .34, 1], [-.16, .34, 1], [.15, -.42, 0], [-.15, -.42, 0]]) {
    const up = BN(x, -.08, z, body), lo = BN(0, -.32, 0, up); rig.legs.push({ up, lo, f }); const lw = y => W2(up, lo, sstep(.34, .2, y)), k = f ? 1 : 1.3, zo = f ? 0 : -.035;
    mb.tube([[.7, .074 * k, 0], [.58, .07 * k, 0], [.44, .05 * k, zo], [.32, .037, zo * 2], [.25, .033, zo * 2.2], [.12, .027, zo], [.05, .028, 0]].map(([y, r, dz]) => yr(y, r * .85, r * 1.1, y < .2 ? fur2 : fur, y > .6 ? [[I(up), .5], [I(body), .5]] : lw(y), x, z + dz)), 9, { capA: 1 });
    mb.ell([x, .034, z + .035], [.05, .034, .07], fur2, I(lo), 0, 5, 8); for (let i = -1; i <= 1; i++) mb.cone([x + i * .028, .03, z + .09], [x + i * .034, .004, z + .135], .011, tooth, I(lo), 2, 4);
    mb.cone([x, .36, z - .05], [x, .28, z - .16], .04, fur2, I(up), 0, 5);
  }
  /* 尾 */
  const tw = z => z > -.84 ? W2(tail, tail2, sstep(-.62, -.84, z)) : W2(tail2, tail3, sstep(-.84, -1.08, z));
  mb.tube([[-.56, .05, .74], [-.66, .075, .755], [-.82, .1, .76], [-1.0, .105, .75], [-1.16, .08, .735], [-1.28, .04, .72], [-1.34, .008, .715]].map(([z, r, cy]) => Object.assign(zr(z, r, r, z < -1.1 ? fur2 : fur, tw(z), cy), { mod: th => 1 + .16 * Math.sin(th * 7 + z * 9) })), 12, { capB: 1 });
  rig.bind(mb, rig.skinMats());
  const eyeM = rig.M(0x111111, { emissive: o.eye || 0xff3a10, ei: 1.5 }), mouthM = rig.M(0x3a0c0a, { emissive: 0xff3010, ei: .8 });
  for (const sd of [-1, 1]) { const e = mesh(sphG(.02, 8, 6), eyeM, sd * .088, .05, .2, head); e.scale.set(.8, .7, 1.2); } mesh(sphG(.03, 8, 6), mouthM, 0, -.06, .26, head).scale.set(1, .5, 3);
  root.scale.setScalar(o.scale || 1); rig.finish();
  rig.animate = function (dt, t, st) {
    const sp = st.speed || 0; if (sp > .04) this.phase += dt * (5 + sp * 9); const ph = this.phase, A = Math.min(1.2, sp);
    let pitch = Math.sin(ph) * .07 * A, by = .66 - Math.abs(Math.sin(ph)) * .05 * A, pounce = 0, crouch = 0;
    if (st.action) { const a = st.action; if (a.u < a.w) crouch = smooth(a.u / a.w); else if (a.u < a.a) pounce = 1; else crouch = .4 * (1 - (a.u - a.a) / (1 - a.a)); }
    this.body.position.y = by - crouch * .2; this.body.rotation.x = pitch + crouch * .18 - pounce * .3 - (st.hurt || 0) * .3; this.inner.position.y = st.rootY || 0; this.inner.rotation.z = (st.fall || 0) * 1.5;
    this.legs.forEach((l, i) => { const off = l.f ? (i % 2 ? .5 : 0) : (i % 2 ? 2.4 : 2.0); let a = Math.sin(ph + off) * .85 * A; if (pounce) a = l.f ? -1.2 : 1.1; if (crouch) a = lerp(a, l.f ? -.5 : .5, crouch); l.up.rotation.x = a; l.lo.rotation.x = pounce ? .2 : Math.max(0, -Math.cos(ph + off)) * 1.1 * A + (l.f ? .1 : .3) + crouch * .45 * (l.f ? 1 : -1); });
    const wag = Math.sin(t * 5 + this.phase) * .3; this.tail.rotation.x = .5 - A * .5 + pounce * .5; this.tail.rotation.y = wag; this.tail2.rotation.y = wag * .8; this.tail2.rotation.x = -.15 + A * .1; this.tail3.rotation.y = Math.sin(t * 5 + this.phase - .8) * .35; this.tail3.rotation.x = -.2;
    this.neck.rotation.x = -pitch - .15 + crouch * .3; this.headG.rotation.x = .1 + Math.sin(t * 1.3 + this.phase) * .05; this.jaw.rotation.x = (pounce || crouch > .5) ? .55 : .1 + Math.max(0, Math.sin(t * 3 + this.phase)) * .12;
  };
  return rig;
}

