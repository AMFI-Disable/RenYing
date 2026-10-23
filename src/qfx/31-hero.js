/* ---------------- 主角青锋：精细模型（雕刻头面、千缕发丝、交领广袖、五指、云头靴） ---------------- */
/* 主角专用贴图：暗纹绸、刺绣镶边、发丝、皮革 */
function cloudSpiral(g, cx, cy, s, dir = 1) {
  g.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40 * PI * 2.6, r = s * (1 - t / (PI * 2.6) * .82); g.lineTo(cx + Math.cos(t * dir) * r, cy + Math.sin(t) * r * .82); } g.stroke();
}
/* 祥云：三团卷云连成一朵 */
function cloudMotif(g, cx, cy, s) {
  cloudSpiral(g, cx, cy, s, 1); cloudSpiral(g, cx - s * 1.5, cy + s * .35, s * .65, -1); cloudSpiral(g, cx + s * 1.5, cy + s * .35, s * .65, 1);
  g.beginPath(); g.moveTo(cx - s * 2.2, cy + s * .9); g.quadraticCurveTo(cx, cy + s * 1.35, cx + s * 2.2, cy + s * .9); g.stroke();
  g.beginPath(); g.moveTo(cx + s * 2.1, cy + s * .95); g.quadraticCurveTo(cx + s * 3.2, cy + s * 1.1, cx + s * 3.6, cy + s * .5); g.stroke();
}
function texHeroDamask() {
  if (TEX.hdm) return TEX.hdm; const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, S, S);
  const im = g.getImageData(0, 0, S, S), d = im.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4, tw = (((x >> 1) + (y >> 1)) & 1) ? 2.2 : -2.2, n = (hash2(x, y) - .5) * 7 + tw + Math.sin(y * 1.7) * 1.2 + (hash2(x >> 3, y * 7) - .5) * 4; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(im, 0, 0);
  g.strokeStyle = 'rgba(160,168,160,.34)'; g.lineWidth = 2.6; g.lineCap = 'round';
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) cloudMotif(g, (i + (j % 2) * .5) * S / 4 + S / 8 + ox, j * S / 4 + S / 8 + oy, S / 34);
  const t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping; const n = canvasTex(normalFromCanvas(c, 1.6), false); n.wrapS = n.wrapT = T.RepeatWrapping;
  return TEX.hdm = { map: t, nm: n };
}
/* 镶边刺绣：金线滚边 + 绿底卷云，横向一条（环形布边用）和竖向一条（沿边走的布带用） */
function texHeroTrim() {
  if (TEX.htr) return TEX.htr; const Wd = 1024, Ht = 160, c = makeCanvas(Wd, Ht), g = c.getContext('2d');
  let gr = g.createLinearGradient(0, 0, 0, Ht); gr.addColorStop(0, '#1d4f4a'); gr.addColorStop(.5, '#2c7268'); gr.addColorStop(1, '#1d4f4a'); g.fillStyle = gr; g.fillRect(0, 0, Wd, Ht);
  for (const [y, h, col] of [[0, 12, '#c79a3e'], [3, 4, '#f3d98c'], [16, 3, '#e8efe6'], [Ht - 12, 12, '#c79a3e'], [Ht - 7, 4, '#f3d98c'], [Ht - 19, 3, '#e8efe6']]) { g.fillStyle = col; g.fillRect(0, y, Wd, h); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  const draw = (lw, col) => { g.strokeStyle = col; g.lineWidth = lw; for (let k = -1; k <= 4; k++) { const x = k * 256 + 128; cloudMotif(g, x, 66, 22); g.beginPath(); g.arc(x + 128, 78, 6, 0, TAU); g.stroke(); } };
  draw(9, '#173f3a'); draw(6, '#9fe0cc'); draw(2.2, '#e6fff6');
  g.strokeStyle = '#d8b25a'; g.lineWidth = 2; for (let k = -1; k <= 4; k++) { const x = k * 256 + 128; cloudSpiral(g, x, 66, 10); }
  // 缎纹针脚
  g.globalCompositeOperation = 'source-atop'; g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = .8; for (let x = -Ht; x < Wd; x += 3) { g.beginPath(); g.moveTo(x, Ht); g.lineTo(x + Ht * .6, 0); g.stroke(); } g.globalCompositeOperation = 'source-over';
  const cv = makeCanvas(Ht, Wd), gv = cv.getContext('2d'); gv.translate(Ht, 0); gv.rotate(PI / 2); gv.drawImage(c, 0, 0);
  const mk = (cc, nrm) => { const t = nrm ? canvasTex(normalFromCanvas(cc, 2.4), false) : canvasTex(cc); t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
  return TEX.htr = { u: mk(c), un: mk(c, 1), v: mk(cv), vn: mk(cv, 1) };
}
function texHeroHair() {
  if (TEX.hhr) return TEX.hhr; const Wd = 128, Ht = 512, c = makeCanvas(Wd, Ht), g = c.getContext('2d'), r = mulberry(77);
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, Wd, Ht);
  for (let i = 0; i < 260; i++) { const x = r() * Wd, l = 120 + r() * 135 | 0; g.strokeStyle = `rgba(${l},${l},${l},${.25 + r() * .5})`; g.lineWidth = .6 + r() * 1.6; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - .5) * 6, Ht * .33, x + (r() - .5) * 6, Ht * .66, x + (r() - .5) * 4, Ht); g.stroke(); }
  const t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping; const n = canvasTex(normalFromCanvas(c, 1.2), false); n.wrapS = n.wrapT = T.RepeatWrapping; return TEX.hhr = { map: t, nm: n };
}
function texLeatherN() {
  if (TEX.hlt) return TEX.hlt; const S = 256, c = makeCanvas(S, S), g = c.getContext('2d'), im = g.createImageData(S, S), d = im.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4, n = fbm(x * .08, y * .08, 3) * 180 + noise2(x * .5, y * .5) * 60; d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255; }
  g.putImageData(im, 0, 0); const t = canvasTex(normalFromCanvas(c, 1.4), false); t.wrapS = t.wrapT = T.RepeatWrapping; return TEX.hlt = t;
}

/* 雕刻头型：单位方向 → 头面上的点。眼、鼻、唇、颧、颏都按面容贴图的位置雕出起伏 */
const G2 = (x, y, cx, cy, sx, sy) => Math.exp(-((x - cx) * (x - cx)) / (2 * sx * sx) - ((y - cy) * (y - cy)) / (2 * sy * sy));
function heroHP(x, y, z) {
  const lo = Math.max(0, -y), up = Math.max(0, y), ax = Math.abs(x);
  const kx = (1 - .34 * Math.pow(lo, 1.9)) * (1 - .08 * up * up), kz = z > 0 ? 1 - .1 * lo * lo : 1 - .22 * Math.pow(lo, 1.3);
  let px = x * .092 * kx, py = y * .121, pz = z * .108 * kz;
  if (z < 0) pz *= 1 + .16 * up * (1 - up) + .05 * sstep(.2, -.3, y) * (1 - lo);
  if (z > .2) {
    const f = sstep(.35, .85, z);
    pz *= 1 - .055 * (1 - Math.abs(y)) * (1 - ax) * f;
    let dz = 0;
    dz -= .0068 * G2(ax, y, .42, .06, .13, .085);                                        // 眼窝
    dz += .0052 * G2(ax, y, .4, .23, .17, .055) + .0032 * G2(x, y, 0, .2, .18, .07);       // 眉弓、眉心
    dz += .0105 * G2(x, y, 0, -.08, .05, .19) + .019 * G2(x, y, 0, -.3, .068, .068);      // 鼻梁、鼻尖
    dz += .0062 * G2(ax, y, .12, -.34, .05, .04) - .0045 * G2(x, y, 0, -.395, .075, .022); // 鼻翼、鼻底
    dz -= .0022 * G2(x, y, 0, -.46, .028, .04);                                            // 人中
    dz += .0058 * G2(x, y, 0, -.528, .15, .034) - .0032 * G2(x, y, 0, -.585, .13, .013) + .0064 * G2(x, y, 0, -.64, .12, .038); // 唇
    dz -= .0018 * G2(x, y, 0, -.73, .05, .03) + .0;                                         // 颏窝
    dz += .0105 * G2(x, y, 0, -.85, .16, .1);                                               // 下巴
    dz += .0062 * G2(ax, y, .55, -.12, .16, .13) - .0032 * G2(ax, y, .55, -.46, .14, .12); // 颧骨、颊
    pz += dz * f;
    px += Math.sign(x) * .0042 * G2(ax, y, .62, -.1, .2, .18) * f;
  }
  return [px, py, pz];
}
function heroHead() {
  if (_hg.hero) return _hg.hero;
  const WS = 96, HS = 72, g = new T.SphereGeometry(1, WS, HS), p = g.attributes.position, n = p.count, dir = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); dir[i * 3] = x; dir[i * 3 + 1] = y; dir[i * 3 + 2] = z; const q = heroHP(x, y, z); p.setXYZ(i, q[0], q[1], q[2]); }
  g.computeVertexNormals(); const N = g.attributes.normal;
  for (let r = 0; r <= HS; r++) { const a = r * (WS + 1), b = a + WS; _f1.set(N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)).normalize(); N.setXYZ(a, _f1.x, _f1.y, _f1.z); N.setXYZ(b, _f1.x, _f1.y, _f1.z); }
  return _hg.hero = { geo: g, dir, WS, HS };
}
/* 面容：按头型的方向坐标落笔，五官和雕刻的起伏对得上 */
function heroFaceTex(skinHex) {
  if (TEX.hface) return TEX.hface;
  const S = 4, c = makeCanvas(512 * S, 256 * S), g = c.getContext('2d'); g.scale(S, S); const sk = new T.Color(skinHex);
  const css = (k = 1, a = 1) => { const q = v => Math.round(sat(v * k) * 255); return `rgba(${q(sk.r)},${q(sk.g)},${q(sk.b)},${a})`; };
  const P = (dx, dy) => { const th = Math.acos(clamp(dy, -1, 1)), st = Math.max(.05, Math.sin(th)), ph = PI / 2 + Math.asin(clamp(dx / st, -1, 1)); return [ph / TAU * 512, th / PI * 256]; };
  const rad = (dx, dy, r, col, sy = 1) => { const [x, y] = P(dx, dy); g.save(); g.translate(x, y); g.scale(1, sy); const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore(); };
  const path = (pts, close) => { g.beginPath(); pts.forEach((q, i) => { const [x, y] = P(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (close) g.closePath(); };
  const curve = (pts) => { g.beginPath(); const Q = pts.map(q => P(q[0], q[1])); g.moveTo(Q[0][0], Q[0][1]); for (let i = 1; i < Q.length - 1; i++) { const mx = (Q[i][0] + Q[i + 1][0]) / 2, my = (Q[i][1] + Q[i + 1][1]) / 2; g.quadraticCurveTo(Q[i][0], Q[i][1], i === Q.length - 2 ? Q[i + 1][0] : mx, i === Q.length - 2 ? Q[i + 1][1] : my); } };
  g.fillStyle = css(); g.fillRect(0, 0, 512, 256);
  // 肤质：细微的明暗斑驳
  const r = mulberry(9); for (let i = 0; i < 9000; i++) { g.fillStyle = r() < .5 ? 'rgba(120,60,50,.025)' : 'rgba(255,240,230,.03)'; g.fillRect(r() * 512, r() * 256, 1.2, 1.2); }
  let gr = g.createLinearGradient(0, 200, 0, 245); gr.addColorStop(0, css(1, 0)); gr.addColorStop(1, css(.66)); g.fillStyle = gr; g.fillRect(0, 200, 512, 56);
  gr = g.createLinearGradient(0, 40, 0, 80); gr.addColorStop(0, css(.8)); gr.addColorStop(1, css(1, 0)); g.fillStyle = gr; g.fillRect(0, 0, 512, 80);
  // 体积：眼窝、鼻侧、颧下、颏下的阴影，额、鼻梁、颧上的高光
  for (const s of [-1, 1]) { rad(s * .42, .05, 16, 'rgba(110,52,42,.22)', .7); rad(s * .2, -.18, 7, 'rgba(110,50,40,.2)', 2); rad(s * .58, -.42, 20, 'rgba(110,52,42,.14)', .8); rad(s * .52, -.3, 16, 'rgba(225,105,95,.16)', .7); rad(s * .55, -.08, 10, 'rgba(255,240,228,.16)', .8); rad(s * .78, .1, 22, 'rgba(90,45,35,.16)'); }
  rad(0, .3, 22, 'rgba(255,242,230,.18)', .6); rad(0, -.14, 4.5, 'rgba(255,244,236,.3)', 3.2); rad(0, -.3, 5, 'rgba(255,246,240,.35)'); rad(0, -.78, 12, 'rgba(255,240,230,.12)', .6); rad(0, -.72, 9, 'rgba(100,45,38,.14)', .5);
  // 鼻：鼻翼、鼻孔
  g.strokeStyle = 'rgba(120,58,46,.38)'; g.lineWidth = .9; g.lineCap = 'round';
  for (const s of [-1, 1]) { rad(s * .14, -.33, 4, 'rgba(120,58,46,.18)'); g.fillStyle = 'rgba(60,24,20,.55)'; const [x, y] = P(s * .07, -.385); g.beginPath(); g.ellipse(x, y, 1.9, .9, s * .25, 0, TAU); g.fill(); }
  // 唇
  { const up = [[-.15, -.58], [-.09, -.545], [-.03, -.52], [0, -.535], [.03, -.52], [.09, -.545], [.15, -.58]], lw = [[.15, -.58], [.08, -.63], [0, -.655], [-.08, -.63], [-.15, -.58]];
    path(up.concat([[.08, -.59], [0, -.595], [-.08, -.59]]), true); g.fillStyle = 'rgba(172,82,78,.62)'; g.fill();
    path([[.15, -.58], [.08, -.59], [0, -.595], [-.08, -.59], [-.15, -.58]].concat(lw.slice(1)), true); g.fillStyle = 'rgba(184,92,86,.6)'; g.fill();
    rad(0, -.625, 5, 'rgba(255,215,205,.28)', .45);
    g.strokeStyle = 'rgba(74,26,24,.85)'; g.lineWidth = .8; curve([[-.16, -.575], [-.08, -.588], [0, -.594], [.08, -.588], [.16, -.575]]); g.stroke();
    for (const s of [-1, 1]) rad(s * .17, -.575, 2.6, 'rgba(90,35,30,.4)'); }
  // 眼：凤目，上眼线带出眼尾，虹膜有纹、有角膜反光
  for (const s of [-1, 1]) {
    const [cx, cy] = P(s * .42, .055); g.save(); g.translate(cx, cy); g.scale(s, 1); g.rotate(-.12);
    const eye = () => { g.beginPath(); g.moveTo(-12.5, 1.2); g.bezierCurveTo(-7, -6.2, 5, -6.8, 13.5, -2.6); g.bezierCurveTo(7, 3.6, -4, 4.6, -12.5, 1.2); g.closePath(); };
    rad(0, 0, 0, 'rgba(0,0,0,0)');
    g.save(); eye(); g.clip();
    let eg = g.createLinearGradient(0, -6, 0, 4); eg.addColorStop(0, '#d8cfc6'); eg.addColorStop(.45, '#f4efe8'); eg.addColorStop(1, '#e6ddd4'); g.fillStyle = eg; g.fillRect(-14, -8, 28, 14);
    const ix = 1.2, iy = -.9, ir = 5.2; eg = g.createRadialGradient(ix, iy, 0, ix, iy, ir); eg.addColorStop(0, '#8a5a2e'); eg.addColorStop(.55, '#4a2c16'); eg.addColorStop(.9, '#22140c'); eg.addColorStop(1, '#0e0806'); g.fillStyle = eg; g.beginPath(); g.arc(ix, iy, ir, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(190,140,80,.35)'; g.lineWidth = .3; for (let k = 0; k < 28; k++) { const a = k / 28 * TAU; g.beginPath(); g.moveTo(ix + Math.cos(a) * 2.2, iy + Math.sin(a) * 2.2); g.lineTo(ix + Math.cos(a) * 4.6, iy + Math.sin(a) * 4.6); g.stroke(); }
    g.fillStyle = '#050304'; g.beginPath(); g.arc(ix, iy, 2.1, 0, TAU); g.fill();
    g.fillStyle = 'rgba(30,14,10,.45)'; g.fillRect(-14, -8, 28, 4.2);
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ix - 1.6, iy - 1.9, 1.25, .95, -.4, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(ix + 2.2, iy + 1.6, .5, 0, TAU); g.fill();
    g.restore();
    // 上眼睑：粗线 + 睫毛 + 眼尾上挑
    g.strokeStyle = '#120a08'; g.lineCap = 'round'; g.lineWidth = 1.9; g.beginPath(); g.moveTo(-12.8, 1.0); g.bezierCurveTo(-7, -6.6, 5, -7.2, 13.6, -2.8); g.lineTo(16.2, -4.6); g.stroke();
    g.lineWidth = .55; for (let k = 0; k < 16; k++) { const t = .35 + k / 15 * .65, x = lerp(-7, 13.6, t), y = -6.2 + t * t * 3.8; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 1.4, y - 1.6, x + 2.8 * t, y - 2.4 - t); g.stroke(); }
    g.strokeStyle = 'rgba(96,52,40,.5)'; g.lineWidth = .7; g.beginPath(); g.moveTo(-9.5, -4.6); g.bezierCurveTo(-4, -10.4, 6, -10.2, 13, -6.4); g.stroke();
    g.strokeStyle = 'rgba(70,34,28,.55)'; g.lineWidth = .6; g.beginPath(); g.moveTo(-10.5, 2.4); g.bezierCurveTo(-3, 5.4, 6, 4.6, 12.6, -1.4); g.stroke();
    g.fillStyle = 'rgba(205,120,110,.5)'; g.beginPath(); g.ellipse(-12.4, 1.6, 1.4, 1, 0, 0, TAU); g.fill();
    g.restore();
    rad(s * .43, -.06, 9, 'rgba(120,70,70,.1)', .5);
    // 剑眉：先铺一层淡墨眉形，再顺着眉势一根根挑出
    const B = t => { const [x0, y0] = P(s * lerp(.16, .72, t), lerp(.215, .32, t) + Math.sin(t * PI) * .035); return [x0, y0]; }, bw = t => (t < .15 ? lerp(1.6, 2.4, t / .15) : lerp(2.4, .5, (t - .15) / .85));
    g.beginPath(); for (let i = 0; i <= 20; i++) { const t = i / 20, [x, y] = B(t); g.lineTo(x, y - bw(t)); } for (let i = 20; i >= 0; i--) { const t = i / 20, [x, y] = B(t); g.lineTo(x, y + bw(t) * .8); } g.closePath(); g.fillStyle = 'rgba(40,26,20,.42)'; g.fill();
    const rb = mulberry(s > 0 ? 41 : 43);
    for (let k = 0; k < 260; k++) { const t = Math.pow(rb(), .9), [x, y] = B(t), w = bw(t), oy = (rb() - .5) * w * 1.6, [x2, y2] = B(Math.min(1, t + .06)), ang = Math.atan2(y2 - y, x2 - x) + (oy > 0 ? -.25 : .25) * (1 - t) + (rb() - .5) * .2, l = 1.6 + rb() * 2;
      g.strokeStyle = `rgba(${16 + rb() * 14 | 0},${11 + rb() * 8 | 0},${9 + rb() * 6 | 0},${.45 + rb() * .4})`; g.lineWidth = .28 + rb() * .22; g.beginPath(); g.moveTo(x, y + oy); g.lineTo(x + Math.cos(ang) * l, y + oy + Math.sin(ang) * l); g.stroke(); }
  }
  const out = canvasTex(c); out.anisotropy = 8; return TEX.hface = out;
}

function makeHero(o) {
  const rig = { kind: 'human', hero: true, P: Object.assign({}, POSE0), C: Object.assign({}, POSE0), phase: rand(TAU), ik: true, stance: null, ghost: false, bones: [] };
  rigBase(rig); const c = o.colors, Wc = KC(0xffffff);
  const robe = KC(c.robe), coat = KC(c.coat), skin = KC(c.skin), hair = KC(c.hair), pants = KC(c.pants), boot = KC(c.boots), red = KC(c.accent), jade = KC(c.jade), silver = KC(c.silver), sheath = KC(c.sheath);
  const root = rig.root = new T.Group(), inner = rig.inner = group(0, 0, 0, root);
  const BN = (x, y, z, par) => { const bn = new T.Bone(); bn.position.set(x, y, z); par.add(bn); bn.userData.i = rig.bones.length; rig.bones.push(bn); return bn; }, I = bn => bn.userData.i;
  const LB = (x, y, z, par, rest, amp, sway, w) => { const bn = BN(x, y, z, par); rig.lag.push({ o: bn, rest, amp, sway, w }); return bn; };
  const W2 = (a, bb, t) => t <= .001 ? I(a) : t >= .999 ? I(bb) : [[I(a), 1 - t], [I(bb), t]];
  const chainW = (bs, q) => { const k = clamp(Math.floor(q), 0, bs.length - 2); return q <= 0 ? I(bs[0]) : W2(bs[k], bs[k + 1], sat(q - k)); };
  const hips = rig.hips = BN(0, .93, 0, inner), torso = rig.torso = BN(0, .06, 0, hips), head = rig.head = BN(0, .6, 0, torso);
  for (const [k, sd] of [['L', 1], ['R', -1]]) { const arm = rig['arm' + k] = BN(sd * .218, .46, 0, torso), fore = rig['fore' + k] = BN(0, -.28, 0, arm); rig['hand' + k] = BN(0, -.28, 0, fore); const leg = rig['leg' + k] = BN(sd * .092, -.04, 0, hips); rig['shin' + k] = BN(0, -.44, 0, leg); }
  const GC = 0, GT = 1, GS = 2, GM = 3, GH = 4, GL = 5, GJ = 6, GV = 7;
  const mb = new MB(true, 8), sides = [['L', 1], ['R', -1]];
  const TRIM = texHeroTrim();

  /* 躯干轮廓（与通用人形一致，胸背更饱满） */
  const TR = [[.83, .02, .02, 0], [.86, .125, .1, 0], [.92, .152, .118, 0], [.99, .143, .108, 0], [1.06, .127, .096, 0], [1.15, .138, .102, .005], [1.22, .15, .11, .01], [1.3, .163, .116, .013], [1.38, .168, .113, .009], [1.44, .16, .104, .003], [1.49, .128, .088, -.004], [1.52, .09, .072, -.006], [1.545, .064, .06, -.008], [1.6, .052, .053, -.006], [1.67, .047, .049, -.004]];
  const tor = y => { let i = 0; while (i < TR.length - 2 && TR[i + 1][0] < y) i++; const a = TR[i], d = TR[i + 1], t = sat((y - a[0]) / (d[0] - a[0])); return [lerp(a[1], d[1], t), lerp(a[2], d[2], t), lerp(a[3], d[3], t)]; };
  const surf = (x, y) => { const q = tor(y); return q[2] + q[1] * Math.sqrt(Math.max(0, 1 - (x / q[0]) * (x / q[0]))); };
  const tw = y => y <= .93 ? I(hips) : y < 1.12 ? W2(hips, torso, sstep(.93, 1.12, y)) : y < 1.56 ? I(torso) : W2(torso, head, sstep(1.56, 1.67, y));
  const shW = (x, y) => { if (y < 1.34) return tw(y); const f = sstep(.08, .17, Math.abs(x)) * .45 * sstep(1.34, 1.44, y); return f < .01 ? tw(y) : [[I(torso), 1 - f], [I(x > 0 ? rig.armL : rig.armR), f]]; };
  const ao = (col, k) => shade(col, k);

  /* ---- 腿：中裤束进靴里；云头靴有靴底、靴筒、靴口镶边 ---- */
  for (const [k, sd] of sides) {
    const x = sd * .092, L = rig['leg' + k], S = rig['shin' + k], lw = y => W2(L, S, sstep(.56, .36, y));
    mb.tube([[.95, .088], [.86, .094], [.7, .092], [.55, .086], [.44, .08], [.36, .074], [.31, .062]].map(([y, r]) => yr(y, r, r * .96, ao(pants, .9 + y * .1), lw(y), x, 0, { mod: th => 1 + .035 * Math.sin(th * 7 + y * 30) })), 16, { capA: 1, ur: 3, vr: 6 });
    // 靴筒
    mb.tube([[.345, .066], [.33, .068], [.31, .064], [.22, .058], [.14, .056], [.09, .058], [.06, .062]].map(([y, r], i) => yr(y, r, r * 1.05, ao(boot, i < 2 ? 1.25 : .9 + i * .03), I(S), x, i > 4 ? .006 : 0)), 16, { g: GL, ur: 2, vr: 3 });
    mb.tube([yr(.352, .07, .073, Wc, I(S), x, 0, { t: 0 }), yr(.318, .07, .073, Wc, I(S), x, 0, { t: 1 })], 18, { g: GT, ur: 2 });
    // 靴面（沿 z 的截面，脚尖微翘）
    const FT = [[-.062, .02, .02, .05], [-.05, .043, .042, .05], [-.02, .05, .05, .052], [.03, .053, .046, .047], [.09, .054, .036, .038], [.14, .046, .028, .032], [.172, .032, .02, .032], [.19, .014, .012, .04]];
    mb.tube(FT.map(([z, rx, ry, cy], i) => zr(z, rx, ry, ao(boot, .85 + i * .03), I(S), cy, x)), 16, { g: GL, capA: 1, capB: 1, ur: 2, vr: 3 });
    // 千层底
    mb.tube([[-.066, .045], [-.04, .055], [.04, .059], [.12, .052], [.17, .036], [.19, .016]].map(([z, rx]) => zr(z, rx, .011, KC(0xd8d2c4), I(S), .011, x)), 14, { g: GC, capA: 1, capB: 1 });
    // 靴面中缝
    mb.path([[x, .095, .02], [x, .07, .1], [x, .05, .16], [x, .046, .186]], .0035, 4, ao(boot, .6), I(S), GL);
  }

  /* ---- 内袍躯干 + 颈 ---- */
  mb.tube(TR.filter(q => q[0] < 1.56).map(q => yr(q[0], q[1], q[2], q[0] < .95 ? pants : ao(robe, .92 + .08 * sstep(1.0, 1.4, q[0])), q[0] > 1.34 ? (th, x, y) => shW(x, y) : tw(q[0]), 0, q[3], { mod: th => 1 - .04 * Math.pow(Math.abs(Math.cos(th)), 4) })), 28, { capA: 1, ur: 8, vr: 10 });
  mb.tube([[1.51, .07, .064], [1.55, .062, .058], [1.6, .057, .055], [1.64, .053, .052], [1.68, .047, .045]].map(([y, rx, rz]) => yr(y, rx, rz, skin, tw(y), 0, -.006 - (y - 1.5) * .05)), 16, { g: GS });

  /* ---- 交领：中衣白领在内，翠绣领缘在外（右衽） ---- */
  const lapPts = (x0, x1, y0, y1, n, off) => { const pts = [], nr = []; for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t), q = tor(y); pts.push([x, y, surf(x, y) + off]); nr.push(new V3(x / (q[0] * q[0]), 0, Math.max(.2, (surf(x, y) - q[2]) / (q[1] * q[1]))).normalize()); } return [pts, nr]; };
  const band = (pts, nrm, hw, th, wf, g, vk, col = Wc) => {
    const rings = []; let Lr = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], r0 = pts[Math.max(0, i - 1)];
      const T1 = new V3(q[0] - r0[0], q[1] - r0[1], q[2] - r0[2]).normalize(), n = nrm[i], s2 = new V3().crossVectors(n, T1).normalize(), s3 = new V3().crossVectors(T1, s2).normalize(), hh = typeof hw === 'function' ? hw(i / (pts.length - 1)) : hw;
      if (i) Lr += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
      rings.push({ c: p, u: [s2.x * hh, s2.y * hh, s2.z * hh], v: [s3.x * th, s3.y * th, s3.z * th], col: typeof col === 'function' ? col(i) : col, w: wf(p, i), t: Lr * vk });
    }
    return mb.tube(rings, 6, { g, ur: 2, capA: 1, capB: 1 });
  };
  const lapW = p => p[1] > 1.34 ? shW(p[0], p[1]) : tw(p[1]);
  { // 后领一圈
    mb.tube([[1.485, .085, .079], [1.515, .074, .069], [1.55, .066, .062]].map((q, i) => yr(q[0], q[1], q[2], Wc, I(torso), 0, -.008, { t: i / 2 })), 22, { g: GT, ur: 6 });
    mb.tube([[1.515, .07, .065], [1.545, .063, .06], [1.568, .06, .057]].map(q => yr(q[0], q[1], q[2], robe, tw(q[0]), 0, -.008)), 22, {});
    let [p, n] = lapPts(-.07, -.004, 1.56, 1.39, 6, .01); band(p, n, .016, .004, lapW, GC, 1, robe);
    [p, n] = lapPts(-.06, 0, 1.55, 1.4, 6, .016); band(p, n, .021, .005, lapW, GV, 1 / (12.8 * .021));
    [p, n] = lapPts(.07, -.11, 1.56, 1.1, 12, .017); band(p, n, .016, .004, lapW, GC, 1, robe);
    [p, n] = lapPts(.058, -.122, 1.548, 1.1, 12, .024); band(p, n, .022, .005, lapW, GV, 1 / (12.8 * .022));
  }

  /* ---- 腰封 + 丝绦 + 玉佩禁步 ---- */
  mb.tube([.995, 1.012, 1.06, 1.098, 1.112].map((y, i) => { const q = tor(y), e = i === 0 || i === 4 ? .012 : .019; return yr(y, q[0] + e, q[1] + e, Wc, tw(y), 0, q[2], { t: i / 4 * 1.0 }); }), 32, { g: GT, ur: 4 });
  for (const y of [1.0, 1.107]) mb.tube([yr(y - .004, tor(y)[0] + .02, tor(y)[1] + .02, silver, tw(y), 0, tor(y)[2]), yr(y + .004, tor(y)[0] + .02, tor(y)[1] + .02, silver, tw(y), 0, tor(y)[2])], 32, { g: GM });
  { // 丝绦：腰间一道红绳，正中打结垂下两股
    const y = 1.052, q = tor(y); mb.tube([yr(y - .006, q[0] + .024, q[1] + .024, red, tw(y), 0, q[2]), yr(y + .006, q[0] + .024, q[1] + .024, red, tw(y), 0, q[2])], 32, {}); const z0 = surf(0, y) + .026;
    mb.ell([.012, y, z0], [.016, .013, .01], ao(red, 1.1), tw(y), GC, 5, 8); for (const sd of [-1, 1]) mb.ell([.012 + sd * .022, y + .004, z0 - .002], [.016, .009, .007], ao(red, 1.05), tw(y), GC, 4, 8);
    const cb = LB(.02, .1, .14, hips, .02, -.4, .08, 2.6);
    for (const [dx, ln] of [[0, .3], [.02, .24]]) { const xs = .012 + dx; mb.path([[xs, y - .01, z0], [xs + .004, y - ln * .4, z0 + .004], [xs - .002, y - ln, z0 + .012]], .0035, 5, red, I(cb), GC); mb.ell([xs - .002, y - ln - .012, z0 + .012], [.008, .012, .008], silver, I(cb), GM, 4, 6); mb.path([[xs - .002, y - ln - .02, z0 + .012], [xs - .002, y - ln - .1, z0 + .016]], t => .011 * (1 - t * .5), 6, red, I(cb), GC); }
  }
  { // 玉佩：系绳、玉珩、玉璧、珠、流苏
    const jb = LB(-.1, .08, .13, hips, 0, -.7, .14, 2.8), X = -.105, Z = surf(-.105, 1.0) + .024, J = I(jb);
    mb.path([[X, 1.0, Z], [X, .93, Z + .002]], .0028, 4, red, J, GC);
    mb.tube([zr(Z - .004, .03, .01, jade, J, .925, X), zr(Z + .004, .03, .01, jade, J, .925, X)], 12, { g: GJ, capA: 1, capB: 1 });
    for (const sd of [-1, 1]) mb.path([[X + sd * .024, .92, Z], [X + sd * .018, .885, Z]], .002, 4, red, J, GC);
    mb.ell([X, .905, Z], [.007, .007, .007], KC(0xc8a050), J, GM, 4, 6);
    const bi = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; bi.push([X + Math.cos(a) * .022, .86 + Math.sin(a) * .022, Z]); }
    mb.path(bi, [.0065, .005], 6, jade, J, GJ, new V3(0, 0, 1), { raw: 1, capA: 0, capB: 0 });
    mb.ell([X, .83, Z], [.008, .008, .008], red, J, GC, 4, 6); mb.ell([X, .816, Z], [.006, .006, .006], jade, J, GJ, 4, 6);
    mb.cone([X, .81, Z], [X, .798, Z], .007, silver, J, GM, 6);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; mb.path([[X + Math.cos(a) * .004, .8, Z + Math.sin(a) * .004], [X + Math.cos(a) * .008, .74, Z + Math.sin(a) * .008], [X + Math.cos(a) * .009, .69, Z + Math.sin(a) * .009]], .0028, 4, red, J, GC); }
  }

  /* ---- 内袍下摆：细密的竖褶，压一道绣边 ---- */
  const skL = .8, y0 = 1.0, y1 = y0 - skL, phs = 1.7;
  const fold = (th, t) => 1 + t * (.05 + t * .07) * Math.sin(th * 13 + phs) + t * .035 * Math.sin(th * 5 + .5) + t * .02 * Math.sin(th * 29);
  const ring = (t, ex, col, tt) => ({ col, t: tt, pos: th => { const R = Math.pow(t, .85), m = fold(th, t), rx = lerp(.148, .152 + skL * .14, R) + ex, rz = lerp(.112, .122 + skL * .18, R) + ex; return [rx * Math.cos(th) * m, lerp(y0, y1, t), rz * Math.sin(th) * m - t * .02 * skL]; },
    w: (th, x, y) => { const k = sstep(0, .85, t) * .8, s = sstep(-.07, .07, x), sh = y < .5 ? sstep(.5, .28, y) * .45 : 0; return [[I(hips), 1 - k], [I(rig.legL), k * s * (1 - sh)], [I(rig.shinL), k * s * sh], [I(rig.legR), k * (1 - s) * (1 - sh)], [I(rig.shinR), k * (1 - s) * sh]]; } });
  const hemT = .07, ts = [0, .08, .18, .3, .44, .58, .72, .84, .93];
  mb.tube(ts.map(t => ring(t, 0, robe)), 72, { ur: 10, vr: 8, col: (i, th) => shade(robe, (1 - ts[i] * .08) * (1 - ts[i] * .3 * Math.max(0, -Math.sin(th * 13 + phs)))) });
  mb.tube([ring(.93, .003, Wc, 0), ring(1, .004, Wc, 1)], 72, { g: GT, ur: 9 });
  mb.sheet(9, 2, (i, j, ti) => { const r = ring(ti * .93, .006, Wc), th = 2.02 + (j - .5) * .085, p = r.pos(th); return { p, col: Wc, w: r.w(th, p[0], p[1]), u: j, v: ti * 5 }; }, GV);

  /* ---- 外袍（大氅）：对襟敞开，自肩垂至小腿；后摆随步飘起 ---- */
  const flap = LB(0, -.32, -.16, hips, .04, .55, .06, 1.7), flapL = LB(.12, -.32, .1, hips, .02, .12, .05, 2.1), flapR = LB(-.12, -.32, .1, hips, .02, .12, .05, 2.3);
  const CY = [1.5, 1.47, 1.43, 1.38, 1.31, 1.23, 1.15, 1.09, 1.03, .97, .89, .8, .7, .6, .5, .42, .36];
  const edge = y => y > 1.38 ? lerp(.62, .75, sstep(1.38, 1.5, y)) : y > 1.0 ? lerp(.46, .62, sstep(1.0, 1.38, y)) : lerp(.46, .58, sstep(1.0, .36, y));
  const coatR = (y, a) => {
    if (y >= 1.0) { const q = tor(y), bump = y < 1.12 ? .018 : 0; return [q[0] + .022 + bump, q[1] + .024 + bump, q[2]]; }
    const t = (1.0 - y) / .64, R = Math.pow(t, .85), m = 1 + t * (.055 + t * .08) * Math.sin(a * 11 + 2.3) + t * .045 * Math.sin(a * 4 + 1) + t * .015 * Math.sin(a * 23);
    return [lerp(.165, .33, R) * m, lerp(.13, .3, R) * m, -t * .03];
  };
  const coatW = (x, y, z) => {
    if (y >= 1.0) return y > 1.34 ? shW(x, y) : tw(y);
    const t = (1.0 - y) / .64, k = sstep(0, .9, t) * .75, s = sstep(-.08, .08, x), back = sstep(.05, -.12, z), flp = back * sstep(0, .5, t) * .6, fs = (1 - back) * sstep(.2, .8, t) * .35, rest = 1 - flp - fs, legk = k * rest;
    const sh = y < .5 ? sstep(.5, .3, y) * .4 : 0;
    return [[I(hips), (1 - k) * rest], [I(rig.legL), legk * s * (1 - sh)], [I(rig.shinL), legk * s * sh], [I(rig.legR), legk * (1 - s) * (1 - sh)], [I(rig.shinR), legk * (1 - s) * sh], [I(flap), flp], [I(x > 0 ? flapL : flapR), fs]];
  };
  const NC = 64, coatPt = (i, j) => { const y = CY[i], e = edge(y), a = PI / 2 + e + (TAU - 2 * e) * j / NC, q = coatR(y, a); return [q[0] * Math.cos(a), y, q[1] * Math.sin(a) + q[2]]; };
  mb.sheet(CY.length, NC + 1, (i, j, ti, tj) => { const p = coatPt(i, j), y = p[1], a = PI / 2 + edge(y) + (TAU - 2 * edge(y)) * tj, fo = y < 1 ? Math.max(0, -Math.sin(a * 11 + 2.3)) * (1 - y) * .5 : 0; return { p, col: shade(coat, (1 - fo) * (y < 1.0 ? 1 - (1 - y) * .08 : 1)), w: coatW(p[0], p[1], p[2]), u: tj * 9, v: ti * 4 }; }, GC);
  { // 下摆绣边
    const last = CY.length - 1, yb = CY[last], hem = []; for (let j = 0; j <= NC; j++) { const p = coatPt(last, j); hem.push(p); }
    mb.sheet(2, NC + 1, (i, j, ti, tj) => { const p = hem[j], k = 1 + i * .035; return { p: [p[0] * k, yb - i * .048, p[2] * k], col: Wc, w: coatW(p[0], p[1], p[2]), u: tj * 14, v: i }; }, GT);
  }
  { // 对襟镶边：右襟下摆 → 绕过后颈 → 左襟下摆
    const pts = [], nr = [], push = (p, n) => { pts.push(p); nr.push(n); };
    const side = sd => { const out = []; for (let i = CY.length - 1; i >= 1; i--) { const y = CY[i], e = edge(y), a = sd > 0 ? PI / 2 - e : PI / 2 + e, q = coatR(y, a), p = [q[0] * Math.cos(a) * 1.02, y, q[1] * Math.sin(a) * 1.02 + q[2]]; out.push([p, new V3(Math.cos(a) / q[0], 0, Math.sin(a) / q[1]).normalize()]); } return out; };
    const R = side(-1), Lft = side(1).reverse();
    R.forEach(([p, n]) => push(p, n));
    for (let i = 0; i <= 10; i++) { const a = PI / 2 + .75 + (TAU - 1.5) * i / 10, rx = .095, rz = .085; push([Math.cos(a) * rx, 1.52 + .012 * Math.sin(PI * i / 10), Math.sin(a) * rz - .01], new V3(Math.cos(a), .35, Math.sin(a)).normalize()); }
    Lft.forEach(([p, n]) => push(p, n));
    band(pts, nr, .026, .006, p => p[1] < 1.0 ? coatW(p[0], p[1], p[2]) : p[1] > 1.34 ? shW(p[0], p[1]) : tw(p[1]), GV, 1 / (12.8 * .026));
  }

  /* ---- 广袖：外袍大袖垂成袖兜，袖口压绣边，内露中衣窄袖 ---- */
  for (const [k, sd] of sides) {
    const x = sd * .218, A = rig['arm' + k], F = rig['fore' + k], Hn = rig['hand' + k], aw = y => W2(A, F, sstep(1.25, 1.09, y)), topW = [[I(A), .7], [I(torso), .3]];
    // 臂（袖里）
    mb.tube([[1.5, .03], [1.475, .056], [1.4, .054], [1.3, .047], [1.19, .04], [1.1, .043], [.99, .034], [.96, .031]].map(([y, r], i) => yr(y, r, r, robe, i < 2 ? topW : aw(y), x, 0)), 12, { capA: 1, ur: 4, vr: 10 });
    // 中衣窄袖口
    mb.tube([yr(.985, .037, .037, robe, I(F), x), yr(.95, .036, .036, robe, I(F), x), yr(.935, .034, .034, ao(robe, .8), I(F), x)], 14, {});
    mb.tube([yr(.952, .0375, .0375, Wc, I(F), x, 0, { t: 0 }), yr(.936, .0355, .0355, Wc, I(F), x, 0, { t: 1 })], 14, { g: GT, ur: 2 });
    const sl = LB(0, -.25, -.05, F, 0, -.75, .14, 2.6 + sd * .3), sl2 = LB(0, -.12, 0, sl, .02, -.35, .1, 3.1), cw = [[I(F), .82], [I(sl), .18]], bw = [[I(F), .45], [I(sl), .4], [I(sl2), .15]];
    const fold2 = th => 1 + .055 * Math.sin(th * 6 + sd) + .025 * Math.sin(th * 13 + sd * 2);
    const cuff = (col, e = 0) => yr(.95, .076 + e, .126 + e, col, cw, x, -.048, { mod: fold2 });
    const bot = (col, e = 0) => ({ pos: th => { const s = Math.sin(th), m = fold2(th); return [x + (.07 + e) * Math.cos(th) * m, lerp(.93, .74, sstep(.45, -.85, s)) - e * .5, -.06 + (.13 + e) * s * m]; }, col, w: bw, t: 1 });
    mb.tube([yr(1.508, .04, .042, coat, topW, x), yr(1.48, .061, .063, coat, topW, x), yr(1.41, .062, .066, coat, I(A), x, -.003), yr(1.3, .061, .072, coat, aw(1.3), x, -.008, { mod: fold2 }), yr(1.18, .064, .085, ao(coat, .98), aw(1.18), x, -.016, { mod: fold2 }), yr(1.06, .07, .104, ao(coat, .95), I(F), x, -.03, { mod: fold2 }), cuff(ao(coat, .92))], 28, { capA: 1, ur: 6, vr: 8 });
    mb.tube([Object.assign(cuff(Wc, .002), { t: 0 }), bot(Wc, .002)], 28, { g: GT, ur: 5 });
    mb.tube([{ pos: bot().pos, col: ao(coat, .75), w: bw }, yr(1.0, .055, .08, ao(coat, .55), I(F), x, -.025)], 28, { ur: 6, vr: 2 });
    // 手
    const out = sd, hx = x;
    if (k === 'R') {
      // 握剑：四指绕剑柄，拇指压在食指上
      mb.ell([hx + out * .02, .89, -.008], [.017, .042, .034], skin, I(Hn), GS, 7, 12);
      mb.tube([yr(.95, .03, .028, skin, I(F), hx), yr(.925, .028, .03, skin, W2(F, Hn, .5), hx), yr(.905, .026, .032, skin, I(Hn), hx + out * .006)], 12, { g: GS });
      [[.914, .0088], [.894, .0092], [.874, .0086], [.856, .0074]].forEach(([y, fr], f) => {
        const R0 = .03 - f * .001, pts = []; for (const a of [.25, .9, 1.6, 2.3, 3.0, 3.5]) { const R = R0 - a * .0018; pts.push([hx + out * Math.cos(a) * R, y - a * .002, Math.sin(a) * R]); }
        mb.path(pts, t => fr * (1 - t * .25), 8, ao(skin, .96 + f * .01), I(Hn), GS, new V3(0, 1, 0));
        const kn = pts[1]; mb.ell([kn[0], kn[1], kn[2]], [fr * 1.05, fr * 1.1, fr * 1.05], ao(skin, 1.03), I(Hn), GS, 4, 6);
      });
      mb.path([[hx + out * .014, .87, -.03], [hx + out * .002, .9, .022], [hx - out * .012, .918, .03], [hx - out * .022, .924, .016]], t => .011 * (1 - t * .3), 8, skin, I(Hn), GS, new V3(0, 0, 1));
    } else {
      // 垂手：掌心向内，四指微蜷
      mb.tube([yr(.95, .03, .028, skin, I(F), hx), yr(.92, .027, .03, skin, W2(F, Hn, .5), hx), yr(.895, .022, .032, skin, I(Hn), hx)], 12, { g: GS });
      mb.ell([hx, .86, .002], [.0135, .04, .034], skin, I(Hn), GS, 7, 12);
      [[.022, .0078, .07], [.008, .0084, .078], [-.007, .008, .074], [-.021, .0068, .062]].forEach(([z, fr, ln], f) => {
        mb.path([[hx, .826, z], [hx - out * .004, .826 - ln * .45, z], [hx - out * .012, .826 - ln * .8, z * .92], [hx - out * .02, .826 - ln, z * .85]], t => fr * (1 - t * .3), 7, ao(skin, .97 + f * .01), I(Hn), GS, new V3(1, 0, 0));
      });
      mb.path([[hx - out * .008, .875, .028], [hx - out * .018, .852, .04], [hx - out * .025, .832, .038]], t => .009 * (1 - t * .3), 7, skin, I(Hn), GS, new V3(1, 0, 0));
    }
  }

  /* ---- 剑鞘：左胯斜挂，银饰件、系带 ---- */
  { const P0 = [.172, 1.05, .05], pts = [P0, [.215, .86, -.09], [.268, .6, -.29], [.296, .5, -.375]];
    mb.path(pts, t => [.031 - t * .008, .018 - t * .004], 10, sheath, I(hips), GL);
    for (const [p, r, h] of [[[.174, 1.035, .04], .036, .03], [[.226, .8, -.14], .032, .014], [[.258, .66, -.245], .03, .012], [[.293, .515, -.364], .029, .04]]) mb.ell(p, [r, h, r * .66], silver, I(hips), GM, 5, 10);
    mb.cone([.296, .5, -.375], [.31, .465, -.405], .022, silver, I(hips), GM, 8);
    mb.path([[.13, 1.07, .09], [.165, 1.045, .07], [.2, .99, .0]], .004, 4, red, I(hips), GC); }

  /* ---- 头：雕刻头面 + 面容贴图 + 角膜高光 ---- */
  const HY = 1.695, hw = I(head), HD = heroHead();
  const hm = new T.Mesh(HD.geo, rig.M(0xffffff, { map: heroFaceTex(c.skin), rough: .55 })); hm.position.set(0, HY - 1.59, 0); head.add(hm); hm.userData.headMesh = true;
  { const cm = new T.MeshStandardMaterial({ color: 0x000000, roughness: .04, metalness: 0, transparent: true, opacity: .18, depthWrite: false }); cm.envMap = GFX.env; cm.envMapIntensity = 1.6; rig.mats.push(cm); cm.userData.em0 = new T.Color(0, 0, 0); cm.userData.rim = { value: new T.Color() }; cm.userData.tr = true; cm.userData.op0 = .18;
    for (const s of [-1, 1]) { const d = new V3(s * .42, .055, .9).normalize(), q = heroHP(d.x, d.y, d.z), m = new T.Mesh(sphG(1, 16, 12), cm); m.scale.set(.0125, .0062, .0035); m.position.set(q[0], q[1] + HY - 1.59, q[2] + .0012); m.rotation.y = s * .32; m.rotation.z = -s * .1; m.renderOrder = 2; head.add(m); } }
  // 耳：耳廓、耳轮、耳垂
  for (const sd of [-1, 1]) {
    const ex = sd * .089, ey = HY - .012, ez = -.012;
    mb.ell([ex + sd * .004, ey, ez], [.008, .026, .016], skin, hw, GS, 6, 8);
    const rim = []; for (let i = 0; i <= 12; i++) { const a = -.4 + i / 12 * 3.6; rim.push([ex + sd * .009, ey + Math.cos(a) * .024 + .002, ez - Math.sin(a) * .014 - .002]); }
    mb.path(rim, .0042, 5, ao(skin, .97), hw, GS, new V3(sd, 0, 0)); mb.ell([ex + sd * .007, ey - .026, ez + .003], [.006, .009, .007], skin, hw, GS, 4, 6);
  }

  /* ---- 发：头皮底色 + 束向发冠的发丝 + 后脑披发 + 鬓边两缕 + 发髻 ---- */
  const hairP = (d, lift) => { const q = heroHP(d.x, d.y, d.z), k = 1 + lift; return new V3(q[0] * k, q[1] * k + HY, q[2] * k); };
  const hairLine = psi => { const a = Math.abs(psi); return a < .55 ? .6 - a * a * .25 : a < 1.0 ? lerp(.52, .3, (a - .55) / .45) : a < 1.4 ? lerp(.3, .12, (a - 1.0) / .4) : a < 1.75 ? lerp(.12, .05, (a - 1.4) / .35) : lerp(.05, -.4, (a - 1.75) / (PI - 1.75)); };
  const dirAt = (psi, y) => { const s = Math.sqrt(Math.max(0, 1 - y * y)); return new V3(Math.sin(psi) * s, y, Math.cos(psi) * s); };
  { const HDg = HD.geo, p = HDg.attributes.position, d = HD.dir, ix = HDg.index.array, map = new Int32Array(p.count).fill(-1), ok = new Uint8Array(p.count);
    for (let i = 0; i < p.count; i++) { const x = d[i * 3], y = d[i * 3 + 1], z = d[i * 3 + 2]; ok[i] = y > hairLine(Math.atan2(x, z)) + .03 ? 1 : 0; }
    const V = i => { if (map[i] < 0) map[i] = mb.v(p.getX(i) * 1.012, p.getY(i) * 1.012 + HY, p.getZ(i) * 1.012, ao(hair, .7), 0, 0, hw); return map[i]; };
    for (let i = 0; i < ix.length; i += 3) { const a = ix[i], b = ix[i + 1], cc = ix[i + 2]; if (ok[a] && ok[b] && ok[cc]) mb.I[GH].push(V(a), V(b), V(cc)); } }
  const BUN = new V3(0, HY + .128, -.042), bunDir = new V3(0, .82, -.42).normalize(), rh = mulberry(1234), RH = (a, b) => a + rh() * (b - a);
  const hairCol = () => shade(hair, RH(.88, 1.14));
  // 上半束发：一张顺着梳向的发壳，一绺一绺起伏，再撒几根散发
  const NP = 240, NK = 16, clump = j => { const a = j / NP * 60; return Math.pow(Math.abs(Math.sin(a * PI)), .6) * .7 + .3 * Math.abs(Math.sin(a * 2.3 * PI + 1)); };
  const topPt = (j, t, extra) => { const psi = (j / NP * 2 - 1) * PI, y0 = Math.max(hairLine(psi), Math.abs(psi) > 1.85 ? .14 : -1), d0 = dirAt(psi, y0), dd = d0.clone().lerp(bunDir, smooth(t)).normalize(), cl = clump(j);
    const P = hairP(dd, .006 + .036 * sstep(0, .25, t) * (1 - .25 * t) + .006 * cl * sstep(0, .15, t) + (extra || 0)); if (t > .88) P.lerp(BUN, (t - .88) * 3); return P; };
  mb.sheet(NK, NP + 1, (k, j, t, u) => { const P = topPt(j, t), cl = clump(j); return { p: [P.x, P.y, P.z], col: shade(hair, (.68 + .42 * cl) * (1 + .1 * Math.sin(j * 1.3))), w: hw, u: u * 36, v: t * 2 }; }, GH);
  for (let i = 0; i < 70; i++) { const j = rh() * NP, pts = []; for (let k = 0; k <= 8; k++) pts.push(topPt(j, k / 8 * .92, .004 + .008 * Math.sin(PI * k / 8))); mb.path(pts, [.0018, .001], 3, shade(hair, 1.25), hw, GH, new V3(0, 1, 0)); }
  // 发髻：一圈圈盘起
  mb.ell([BUN.x, BUN.y, BUN.z], [.042, .036, .044], ao(hair, .8), hw, GH, 6, 12);
  for (let i = 0; i < 22; i++) { const a0 = i / 22 * TAU, pts = []; for (let k = 0; k <= 12; k++) { const a = a0 + k / 12 * PI * 1.4, h = (k / 12 - .5) * .05 * Math.cos(i); pts.push([BUN.x + Math.cos(a) * (.046 - Math.abs(h) * .3), BUN.y + h + .004, BUN.z + Math.sin(a) * .047]); } mb.path(pts, [.009, .0035], 4, hairCol(), hw, GH, new V3(0, 1, 0), { ut: 2 }); }
  // 后脑披发：自发髻下压过后脑垂到背上，三节骨随步摆
  const hb = [LB(0, .05, -.11, head, .05, .28, .05, 2.2)]; for (let i = 0; i < 3; i++) hb.push(LB(0, -.16, 0, hb[i], .03, .16, .06, 2.7 + i * .5));
  const hbW = y => y > 1.66 ? hw : chainW(hb, (1.66 - y) / .16);
  { const NB = 120, NR = 14, len = u => .5 - Math.pow(Math.abs(u - .5) * 2, 2) * .12 + .04 * Math.sin(u * 23) + .02 * Math.sin(u * 61), cl = j => .7 + .3 * Math.pow(Math.abs(Math.sin(j / NB * 34 * PI)), .7);
    const bpt = (u, t) => { const psi = PI + (u - .5) * 2.3, k1 = 7; if (t < .45) { const yd = lerp(.42, -.62, t / .45); return hairP(dirAt(psi, yd), .045 + .006 * Math.sin(u * 40)); } const e = hairP(dirAt(psi, -.62), .045), tt = (t - .45) / .55; return new V3(e.x * (1 + tt * .25) + Math.sin(psi) * tt * .02, e.y - len(u) * tt, e.z - .03 - .05 * Math.sin(tt * PI * .5) - .01 * Math.cos(u * 30)); };
    mb.sheet(NR, NB + 1, (i, j, t, u) => { const P = bpt(u, t); return { p: [P.x, P.y, P.z], col: shade(hair, cl(j) * (1 - t * .1)), w: hbW(P.y), u: u * 22, v: t * 3 }; }, GH);
    for (let i = 0; i < 40; i++) { const u = .04 + rh() * .92, pts = []; for (let k = 0; k <= 10; k++) { const P = bpt(u, k / 10 * .97); P.z -= .004; pts.push(P); } mb.path(pts, t => [lerp(.006, .002, t), .0018], 3, shade(hair, 1.2), (t, kk, p) => hbW(p.y), GH, new V3(0, 0, -1)); } }
  // 鬓边两缕：自鬓角垂到胸前
  for (const sd of [-1, 1]) {
    const lk = [LB(sd * .095, .1, .05, head, .02, .1, .05, 2.6 + sd * .2)]; lk.push(LB(0, -.12, 0, lk[0], .02, .08, .07, 3.2));
    for (let s = 0; s < 5; s++) { const d0 = dirAt(sd * (1.0 + s * .02), .4 - s * .01), p0 = hairP(d0, .03), pts = [p0]; const off = (s - 2) * .0016;
      for (const [dx, dy, dz] of [[.008, -.04, -.002], [.016, -.09, -.004], [.02, -.14, .001], [.017, -.19, .01], [.012, -.235, .018]]) pts.push(new V3(p0.x + sd * (dx + off * (1 + dy * -4)), p0.y + dy, p0.z + dz + off * .3));
      mb.path(pts, t => [lerp(.0045, .0012, t), .0016], 4, hairCol(), (t, kk, p) => p.y > 1.68 ? hw : chainW(lk, (1.68 - p.y) / .12), GH, new V3(sd, 0, .3), { ut: 3 }); }
  }
  // 发冠：银冠托住发髻，正面嵌青玉，一支长簪横贯
  { const C = BUN; const cr = [];
    const crownM = th => 1 + .06 * Math.pow(Math.abs(Math.sin(th)), 6);
    mb.tube([[-.032, .043, 1.15], [-.022, .046, 1.1], [-.008, .047, .95], [.01, .044, .9], [.024, .038, .95], [.034, .027, .85], [.04, .014, .8], [.042, .003, .8]].map(([dy, r, k], i) => yr(C.y + dy + (i > 2 ? .006 : 0), r, r * 1.08, shade(silver, k), hw, 0, C.z, { mod: crownM })), 28, { g: GM, ur: 2 });
    for (const dy of [-.026, -.004]) mb.tube([yr(C.y + dy - .002, .049, .053, KC(0xc8a050), hw, 0, C.z), yr(C.y + dy + .002, .049, .053, KC(0xc8a050), hw, 0, C.z)], 28, { g: GM });
    for (let i = 0; i < 7; i++) { const a = PI / 2 + (i - 3) * .42; mb.ell([Math.cos(a) * .044, C.y + .014, C.z + Math.sin(a) * .048], [.006, .012, .006], shade(silver, 1.15), hw, GM, 4, 6); }
    mb.ell([0, C.y + .006, C.z + .05], [.012, .015, .006], jade, hw, GJ, 6, 10); mb.tube([zr(C.z + .048, .015, .019, silver, hw, C.y + .006), zr(C.z + .053, .016, .02, silver, hw, C.y + .006)], 14, { g: GM });
    mb.path([[-.13, C.y + .008, C.z + .004], [0, C.y + .015, C.z + .004], [.13, C.y + .008, C.z + .004]], t => .0045 * (1 - Math.pow(Math.abs(t - .5) * 2, 3) * .6), 6, silver, hw, GM);
    for (const sd of [-1, 1]) { mb.ell([sd * .135, C.y + .008, C.z + .004], [.009, .009, .009], jade, hw, GJ, 5, 8); mb.cone([sd * .144, C.y + .008, C.z + .004], [sd * .16, C.y + .006, C.z + .004], .005, silver, hw, GM, 6); }
    // 发带：两条赤绸自冠后垂下
    for (const sd of [-1, 1]) { const rb = [LB(sd * .02, .26, -.09, head, .25, .75, .22, 3.4 + sd * .6)]; rb.push(LB(0, -.2, 0, rb[0], .08, .32, .2, 4.1 + sd * .4)); rb.push(LB(0, -.2, 0, rb[1], .06, .3, .22, 4.6 + sd * .3));
      mb.sheet(16, 3, (i, j, ti, tj) => { const wd = .03 * (1 - Math.pow(ti, 3) * .85), tw2 = Math.sin(ti * 5 + sd) * .5; return { p: [sd * .022 + (tj - .5) * wd * Math.cos(tw2) + sd * ti * .05, C.y - .01 - ti * .58, C.z - .05 - ti * .08 + (tj - .5) * wd * Math.sin(tw2)], col: shade(red, 1 - ti * .1 - Math.abs(tj - .5) * .1), w: chainW(rb, ti * 3 - .3), u: tj, v: ti * 6 }; }, GC); }
  }

  /* ---- 材质：绸、绣、肤、金银、发、革、玉 ---- */
  const DM = texHeroDamask(), HR = texHeroHair();
  const phys = (op) => { const m = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: op.rough, metalness: op.metal || 0, side: T.DoubleSide, vertexColors: true }); if (op.map) m.map = op.map; if (op.nm) { m.normalMap = op.nm; m.normalScale.set(op.ns, op.ns); } if (op.sheen) m.sheen = new T.Color(op.sheen); if (op.cc) { m.clearcoat = op.cc; m.clearcoatRoughness = op.ccr || .12; } if (op.env && GFX.env) { m.envMap = GFX.env; m.envMapIntensity = op.env; } m.userData.rim = { value: new T.Color(0x4a3524) }; m.onBeforeCompile = rimHook; m.userData.em0 = new T.Color(0, 0, 0); m.skinning = true; rig.mats.push(m); return m; };
  const mats = [
    phys({ rough: .6, map: DM.map, nm: DM.nm, ns: .35, sheen: 0x3a4a46, env: .35 }),
    phys({ rough: .5, map: TRIM.u, nm: TRIM.un, ns: .6, sheen: 0x2a4a40, env: .5 }),
    rig.M(0xffffff, { vc: true, rough: .55, side: T.DoubleSide, skin: true }),
    rig.M(0xffffff, { vc: true, rough: .26, metal: .92, side: T.DoubleSide, env: 1.4, skin: true }),
    phys({ rough: .4, map: HR.map, nm: HR.nm, ns: .5, sheen: 0x161210, env: .25 }),
    rig.M(0xffffff, { vc: true, rough: .48, side: T.DoubleSide, normalMap: texLeatherN(), ns: .5, env: .5, skin: true }),
    phys({ rough: .18, cc: 1, env: 1.2 }),
    phys({ rough: .5, map: TRIM.v, nm: TRIM.vn, ns: .6, sheen: 0x2a4a40, env: .5 }),
  ];
  rig.bind(mb, mats);
  { const w = makeWeapon('sword', rig); rig.handR.add(w.group); rig.bladeLen = w.len; rig.bladeBase = w.base; rig.weapon = w.group; }
  root.scale.setScalar(o.scale || 1); rig.finish();
  humanMethods(rig);
  return rig;
}
