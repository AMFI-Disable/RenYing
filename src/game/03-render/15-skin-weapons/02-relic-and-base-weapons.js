// ---------- 流星锤：勾陈（链子和锤头的物理还是原来那套，这里只换颜色和锤头花样） ----------
const HAMMER_LOOK = {
  crimson_hammer: { chain: ['#6a2a22', '#b0503a'], head: '#4a1610', band: '#ff6a2a', crack: '255,120,50', spikes: '#2a0c08' },
  underworld_hammer: { chain: ['#4a2a7a', '#b48cff'], head: '#2a1840', band: '#a855f7', crack: '185,105,255', ghost: true },
  relic_kintsugi: { chain: ['#221a16', '#f4c542'], head: '#161214', band: '#f4c542', crack: '248,198,66', spikes: '#d8a432' },
};
// ---------- 天工传世 · 器灵纪 20 款专属国宝兵器 ----------
SKIN_WEAP.relic_porcelain = W => {
  const { P, poly, bar, live, t, T, hl, g } = W;
  bar(hl, g, 4.4, '#1a3668');
  poly([P(0, -2.8), P(0.88, -2.5), t, P(0.88, 2.5), P(0, 2.8)], W.lg(g, t, [[0, '#dce8f8'], [0.45, '#f7fbff'], [1, '#ffffff']]));
  poly([P(0.03, -8), P(-0.04, -9.5), P(-0.06, 0), P(-0.04, 9.5), P(0.03, 8), P(0, 0)], '#d8b464');
  if (!live) return;
  ctx.strokeStyle = '#1e4fa3'; ctx.lineWidth = 1.2; ctx.beginPath();
  for (let i = 0; i <= 14; i++) { const k = 0.06 + i / 14 * 0.78, q = P(k, Math.sin(k * 18 - T * 3.5) * 1.1); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
  ctx.stroke();
  ctx.fillStyle = '#2c6be0'; circle(P(-0.01, 0), 2.2);
  ctx.globalCompositeOperation = 'lighter'; W.glow(t, 8, '64,132,235', 0.48);
};
SKIN_WEAP.relic_puppet = W => {
  const pr = dualPair(W);
  W.bar(W.hl, W.g, 3.8, '#3b180e');
  for (const [a, b, sg] of pr) {
    const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1, nx = -ey / el * W.pf * sg, ny = ex / el * W.pf * sg;
    const mid = [a[0] + ex * 0.55 + nx * 6.5, a[1] + ey * 0.55 + ny * 6.5];
    W.poly([a, [a[0] + ex * 0.35 + nx * 4, a[1] + ey * 0.35 + ny * 4], mid, b, [a[0] + ex * 0.45 - nx * 2, a[1] + ey * 0.45 - ny * 2]], W.lg(a, b, [[0, '#7a2214'], [0.55, '#e6552e'], [1, '#ffe6b8']]));
    if (W.live) {
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1; line(a, b);
      ctx.fillStyle = '#241410'; circle([a[0] + ex * 0.52 + nx * 1.5, a[1] + ey * 0.52 + ny * 1.5], 1.8);
    }
  }
};
SKIN_WEAP.relic_bronze = W => {
  const { P, poly, bar, live, t } = W;
  bar(W.hl, W.g, 5.4, '#1e322e');
  poly([P(0, -5.8), P(0.86, -6.2), t, P(0.86, 6.4), P(0, 5.8)], W.lg(P(0.5, -6), P(0.5, 6), [[0, '#355c54'], [0.5, '#76b8a4'], [1, '#2b4742']]));
  poly([P(0.04, -12), P(-0.05, -13), P(-0.05, 13), P(0.04, 12)], '#d4a64a');
  if (!live) return;
  ctx.strokeStyle = '#d4a64a'; ctx.lineWidth = 1.1; line(P(0.05, 0), P(0.84, 0));
  for (const s of [0.18, 0.38, 0.58]) ctx.strokeRect(P(s, -2.5)[0] - 2, P(s, -2.5)[1] - 2, 4, 4);
  ctx.fillStyle = '#78e6c8'; circle(P(0, 0), 2.5);
};
SKIN_WEAP.relic_celadon = W => {
  const { At, t, bar, live, T } = W, back = At(W.g, -36);
  bar(back, At(t, -24), 3.4, '#3f686b');
  for (const s of [-30, -58, -86]) bar(At(t, s, -2.2), At(t, s, 2.2), 2.2, '#e0bc7a');
  W.poly([t, At(t, -10, 4.2), At(t, -22, 3), At(t, -26, 0), At(t, -22, -3), At(t, -10, -4.2)], W.lg(At(t, -26), t, [[0, '#7fa8a8'], [0.55, '#cfe6e4'], [1, '#f4ffff']]));
  if (!live) return;
  ctx.strokeStyle = 'rgba(224,188,122,0.85)'; ctx.lineWidth = 0.9;
  line(At(t, -20, -1.2), At(t, -12, 1.5)); line(At(t, -14, -2), At(t, -7, 0.8));
  const r0 = At(t, -26), sw = Math.sin(T * 4) * 2.4;
  ctx.strokeStyle = '#f0cfa0'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.quadraticCurveTo(r0[0] - W.ux * 7, r0[1] + 6, r0[0] - W.ux * 10 + sw, r0[1] + 15); ctx.stroke();
};
SKIN_WEAP.relic_embroidery = W => {
  const { g, live, T } = W, a = Math.atan2(W.uy, W.ux);
  W.bar(W.hl, g, 3.6, '#7a2434');
  const q = ctx.createRadialGradient(g[0], g[1], 4, g[0], g[1], 32);
  q.addColorStop(0, '#fff5e6'); q.addColorStop(0.55, '#f29ab0'); q.addColorStop(1, '#a82a44');
  W.fillWith(() => fanSector(W, 32, a - 0.76, a + 0.76), q);
  if (!live) return;
  ctx.strokeStyle = '#f0c464'; ctx.lineWidth = 1.1;
  for (let i = -3; i <= 3; i++) { const b = a + i * 0.22; line([g[0] + Math.cos(b) * 5, g[1] + Math.sin(b) * 5], [g[0] + Math.cos(b) * 31, g[1] + Math.sin(b) * 31]); }
  ctx.strokeStyle = '#ffd278'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(g[0], g[1], 31, a - 0.76, a + 0.76); ctx.stroke();
  const sw = Math.sin(T * 4) * 2.5; ctx.strokeStyle = '#d94862'; ctx.lineWidth = 1.5;
  line(W.hl, [W.hl[0] + sw, W.hl[1] + 13]);
};
SKIN_WEAP.relic_cloisonne = W => {
  fistPlates(W, (Q, h) => {
    W.poly([Q(7.5, 6.8), Q(7.5, -6.8), Q(-5.5, -5.8), Q(-6.5, 0), Q(-5.5, 5.8)], '#143878');
    if (!W.live) return;
    ctx.strokeStyle = '#f5c242'; ctx.lineWidth = 1.4;
    line(Q(7, -6.2), Q(7, 6.2)); line(Q(1, -5.5), Q(1, 5.5)); line(Q(-3.5, -4.5), Q(5.5, 0)); line(Q(-3.5, 4.5), Q(5.5, 0));
    ctx.fillStyle = '#38c8ff'; circle(Q(3, 0), 2.2);
    ctx.globalCompositeOperation = 'lighter'; W.glow(h, 9, '82,172,255', 0.42);
    ctx.globalCompositeOperation = 'source-over';
  });
};
SKIN_WEAP.relic_woodblock = W => {
  const { At, t, hl, bar, live, T } = W;
  bar(hl, At(t, -12), 4.6, '#3e2618');
  brushTip(W, W.lg(At(t, -13), At(t, 3), [[0, '#1e1612'], [0.6, '#8a1e18'], [1, '#e03e32']]));
  bar(At(t, -15), At(t, -12), 5.6, '#d8b464');
  if (!live) return;
  ctx.fillStyle = '#c82e24'; ctx.fillRect(hl[0] - 3.5, hl[1] - 3.5, 7, 7);
  ctx.strokeStyle = '#f0e6d2'; ctx.lineWidth = 0.8; ctx.strokeRect(hl[0] - 2.4, hl[1] - 2.4, 4.8, 4.8);
  const dp = (T * 1.2) % 1; ctx.fillStyle = `rgba(220,62,50,${0.9 - dp * 0.7})`; circle([t[0], t[1] + 3 + dp * 9], 1.5);
};
SKIN_WEAP.relic_liuli = W => {
  moonBlade(W, W.lg(W.g, W.t, [[0, '#2c4688'], [0.55, '#88f0ff'], [1, '#f2fdff']]), '#1a2450');
  const [c, a] = moonCrescent(W, 12, W.lg(W.At(W.t, -15), W.At(W.t, 7), [[0, '#88f0ff'], [0.55, '#c4a2ff'], [1, '#ffffff']]));
  if (!W.live) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(c[0], c[1], 10.6, a - 1.5, a + 1.5); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; W.glow(W.t, 9, '142,232,255', 0.5);
};
SKIN_WEAP.relic_kingfisher = W => {
  W.bar(W.hl, W.g, 4.2, '#093440');
  const V = featherVane(W, 12.5, 3, 12, (i, u) => (i % 2 && i < 11 ? 2.4 : 0) * Math.sin(Math.PI * u));
  W.fillWith(() => { ctx.moveTo(...W.g); for (const q of V.outer) ctx.lineTo(q[0], q[1]); ctx.quadraticCurveTo(V.c2[0], V.c2[1], ...W.g); }, W.lg(W.g, W.t, [[0, '#0d4a58'], [0.5, '#14c8c0'], [1, '#e8fffb']]));
  if (!W.live) return;
  ctx.strokeStyle = '#f5c84c'; ctx.lineWidth = 1.5; line(W.g, W.t);
  ctx.strokeStyle = 'rgba(245,200,76,0.75)'; ctx.lineWidth = 0.9;
  for (const u of [0.3, 0.55, 0.78]) { const p = V.bz(V.c1, u); line(W.P(u, 0), p); }
};
SKIN_WEAP.relic_guqin = W => {
  const F = fluteBody(W, '#2c1e16', [0.1, 0.5, 0.9], '#e6c278');
  if (!W.live) return;
  ctx.fillStyle = '#e6c278';
  for (let i = 0; i < 7; i++) circle(F(0.2 + i * 0.1, -2.1), 1.0);
  ctx.strokeStyle = 'rgba(238,198,118,0.8)'; ctx.lineWidth = 0.8; line(F(0.12, 1.8), F(0.88, 1.8));
  const sw = Math.sin(W.T * 3.2) * 2.8; ctx.strokeStyle = '#e6c278'; ctx.lineWidth = 1.4;
  line(W.hl, [W.hl[0] + sw, W.hl[1] + 13]);
};
SKIN_WEAP.relic_sancai = W => {
  const G = gourdParts(W); if (!G) return;
  const { top, bot, mid } = G;
  const fillG = (c, r) => { const q = ctx.createLinearGradient(c[0] - r, c[1] - r, c[0] + r, c[1] + r); q.addColorStop(0, '#fff6e0'); q.addColorStop(0.45, '#e89a2c'); q.addColorStop(1, '#2e9e66'); ctx.fillStyle = W.flash ? '#fff' : q; circle(c, r); };
  fillG(bot, 8.8); fillG(top, 5.8);
  if (!W.live) return;
  ctx.fillStyle = '#d84828'; ctx.fillRect(mid[0] - 3.5, mid[1] - 1.2, 7, 2.4);
  ctx.fillStyle = 'rgba(255,255,255,0.48)'; circle([bot[0] - 2.8, bot[1] - 2.8], 2.2);
};
SKIN_WEAP.relic_papercut = W => {
  const { sk, L, o, flash, ux, uy, g } = W;
  const spinDraw = (pt, ang) => {
    ctx.save(); ctx.translate(pt[0], pt[1]); ctx.rotate(ang);
    if (o) { ctx.fillStyle = L.outline; ctx.beginPath(); ctx.ellipse(0, 0, 18, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
    ctx.fillStyle = flash ? '#fff' : '#e62e2d';
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-6, -5); ctx.lineTo(0, -2.5); ctx.lineTo(6, -5); ctx.lineTo(18, 0); ctx.lineTo(6, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f5c24a'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.fillStyle = '#fff6ee'; circle([0, 0], 2.1);
    ctx.restore();
  };
  spinDraw(g, Math.atan2(uy, ux)); spinDraw(sk.hb, Math.atan2(uy, ux) + 0.2);
  if (!o) { ctx.strokeStyle = 'rgba(245,62,62,0.85)'; ctx.lineWidth = 1.3; line(sk.hf, sk.hb); }
};
SKIN_WEAP.relic_screen = W => {
  const { P, poly, bar, live, t, g, hl } = W;
  bar(hl, g, 4.4, '#382a14');
  poly([P(0.03, -7.5), P(-0.04, -5), P(-0.04, 5), P(0.03, 7.5)], '#ffd65c');
  poly([P(0, -2.6), P(0.6, -3.6), P(0.92, -2.4), t, P(0.88, 2.4), P(0, 2.6)], W.lg(g, t, [[0, '#241e14'], [0.45, '#b88a24'], [0.85, '#ffd65c'], [1, '#fff8dc']]));
  if (!live) return;
  ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 1.1; line(P(0.06, -1.6), P(0.86, -1.2));
  ctx.globalCompositeOperation = 'lighter'; W.glow(t, 8, '255,214,92', 0.5);
};
SKIN_WEAP.relic_compass = W => {
  const { sk, L, o, flash, live, T } = W;
  if (o) { ctx.fillStyle = L.outline; circle(sk.hf, 11.5); circle(sk.hb, 10.5); return; }
  const pol = sk.pol || 1;
  for (const [p, r] of [[sk.hf, 9.2], [sk.hb, 7.8]]) {
    ctx.fillStyle = flash ? '#fff' : '#1e2838'; circle(p, r + 1.5);
    ctx.strokeStyle = '#e2b862'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p[0], p[1], r + 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = pol > 0 ? '#58d8ff' : '#e2b862'; circle(p, r * 0.55);
  }
  const a = T * 2.5 * pol;
  ctx.strokeStyle = '#dff8ff'; ctx.lineWidth = 1.8;
  line([sk.hf[0] - Math.cos(a) * 8, sk.hf[1] - Math.sin(a) * 8], [sk.hf[0] + Math.cos(a) * 9, sk.hf[1] + Math.sin(a) * 9]);
  if (live) { ctx.globalCompositeOperation = 'lighter'; W.glow(sk.hf, 11, '96,218,255', 0.48); }
};
SKIN_WEAP.relic_marionette = W => {
  const { sk, L, o, flash, live, T } = W;
  if (o) { ctx.fillStyle = L.outline; circle(sk.hf, 10.5); return; }
  ctx.fillStyle = flash ? '#fff' : '#4a2b1e'; circle(sk.hf, 8.6);
  ctx.strokeStyle = '#f0b858'; ctx.lineWidth = 1.8;
  const a = T * 1.8;
  for (let k = 0; k < 4; k++) { const b = a + k * Math.PI / 2; line(sk.hf, [sk.hf[0] + Math.cos(b) * 10, sk.hf[1] + Math.sin(b) * 10]); }
  ctx.fillStyle = '#fae6c0'; circle(sk.hf, 3.2);
  if (live) { ctx.globalCompositeOperation = 'lighter'; W.glow(sk.hf, 9, '240,184,88', 0.45); }
};
SKIN_WEAP.relic_ironfire = W => {
  const { At, g, t, bar, poly, live, T } = W, crown = At(t, -18);
  bar(At(g, -30), crown, 4.4, '#3c1810');
  bar(At(crown, 0, -14), At(crown, 0, 14), 5.2, '#ff7a22');
  for (const side of [-1, 0, 1]) {
    const w = side * 12, length = side ? 15 : 20;
    poly([At(crown, -3, w - 2.6), At(crown, length - 4, w - 3.6), At(crown, length, w + 1), At(crown, length - 6, w + 3.6), At(crown, -3, w + 2.6)], W.lg(crown, At(crown, length, w), [[0, '#ff7a22'], [0.6, '#ffd25a'], [1, '#fff8e0']]));
  }
  if (!live) return;
  ctx.globalCompositeOperation = 'lighter'; W.glow(t, 12 + Math.sin(T * 14) * 2, '255,140,48', 0.6);
};
SKIN_WEAP.relic_armillary = W => {
  const { At, hl, t, bar, poly, live, T } = W, hub = At(t, -22);
  bar(hl, At(hub, -8), 4.2, '#2a2440');
  ctx.strokeStyle = W.o ? W.L.outline : W.flash ? '#fff' : '#f2c864'; ctx.lineWidth = W.o ? 4.5 : 2.2;
  ctx.beginPath(); ctx.arc(hub[0], hub[1], 14, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(hub[0], hub[1], 14, 6, T * 0.9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(hub[0], hub[1], 14, 6, -T * 0.7 + 1.2, 0, Math.PI * 2); ctx.stroke();
  poly([At(hub, 6), At(hub, 0, 5), At(hub, -6), At(hub, 0, -5)], '#92b8ff');
  if (!live) return;
  ctx.globalCompositeOperation = 'lighter'; W.glow(hub, 12, '242,200,100', 0.5);
};
SKIN_WEAP.relic_dunhuang = W => {
  const { hl, t, At, bar, glow, o, flash, live, T, L } = W;
  bar(At(hl, -12, 0), At(t, -4, 0), o ? 6.4 : 4.2, o ? L.outline : flash ? '#fff' : '#7a4222');
  const head = At(t, -2, 0), lamp = At(t, 6, 3 + Math.sin(T * 5) * 1.5);
  ctx.strokeStyle = o ? L.outline : flash ? '#fff' : '#eab84a'; ctx.lineWidth = o ? 4.4 : 2.5;
  ctx.beginPath(); ctx.moveTo(head[0], head[1]); ctx.quadraticCurveTo(At(t, 5, -8)[0], At(t, 5, -8)[1], lamp[0], lamp[1] - 5); ctx.stroke();
  ctx.fillStyle = o ? L.outline : flash ? '#fff' : '#28889e'; circle(lamp, o ? 7.2 : 5.6);
  if (!o && !flash) {
    ctx.strokeStyle = '#eab84a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(lamp[0], lamp[1], 5.6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff2d2'; circle(lamp, 2.5);
    if (live) glow(lamp, 12, '245,196,86', 0.54);
  }
};
SKIN_WEAP.relic_cinnabar = W => {
  const { sk, L, o, flash, live, T } = W;
  const s = flailSim(sk, L, 0); if (!s) return;
  const pts = s.p, hd = pts[pts.length - 1];
  if (o) {
    ctx.strokeStyle = L.outline; ctx.lineWidth = 5.8;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    circle(hd, 12.5); return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.strokeStyle = flash ? '#fff' : (i % 2 ? '#f0c458' : '#7c1816'); ctx.lineWidth = 3.2; line(pts[i], pts[i + 1]);
  }
  ctx.fillStyle = flash ? '#fff' : '#8e1c1a';
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + T * 1.4; const q = [hd[0] + Math.cos(a) * 11, hd[1] + Math.sin(a) * 11]; k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
  ctx.closePath(); ctx.fill();
  if (!flash) {
    ctx.strokeStyle = '#f0c458'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = '#f0c458'; circle(hd, 3.6);
    if (live) { ctx.globalCompositeOperation = 'lighter'; W.glow(hd, 12, '232,68,58', 0.42); }
  }
};
// ---------- 新侠客的原装兵器 ----------
SKIN_WEAP.firerake = ({ At, g, t, bar, poly, L }) => {
  const crown = At(t, -18);
  bar(At(g, -29), crown, 4, '#613222');
  for (const offset of [-8, 8]) bar(At(g, offset, -2), At(g, offset, 2), 2.5, L.scarf);
  bar(At(crown, 0, -13), At(crown, 0, 13), 5, '#9e4934');
  for (const side of [-1, 0, 1]) {
    const w = side * 11, length = side ? 13 : 18;
    poly([At(crown, -3, w - 2.5), At(crown, length - 4, w - 3.5),
      At(crown, length, w + 1), At(crown, length - 6, w + 3.5), At(crown, -3, w + 2.5)], L.blade);
  }
};

SKIN_WEAP.dyelash = ({ sk, g, hl, t, len, bar, poly, f, L, o, flash }) => {
  bar(hl, g, 5, '#462439');
  const cast = f.state === 'skill' && f.skill === 'whiplash' && f.skPh === 1
    ? clamp(1 - f.t / 0.26, 0, 1) : 0;
  const swinging = f.state === 'attack' || f.state === 'special';
  const end = cast ? [g[0] + sk.face * (len + 135 * cast), g[1] - 6]
    : swinging ? t : [g[0] + sk.face * 22, g[1] + 38];
  const dx = end[0] - g[0], dy = end[1] - g[1];
  const bend = (cast || swinging) ? 14 : 27;
  const ribbon = (width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(...g);
    ctx.bezierCurveTo(g[0] + dx * 0.32, g[1] + dy * 0.32 - bend,
      g[0] + dx * 0.75, g[1] + dy * 0.75 + bend, ...end);
    ctx.stroke();
  };
  ribbon(o ? 10 : 7, o ? L.outline : flash ? '#fff' : L.scarf);
  if (!o && !flash) ribbon(2, L.blade);
  const [x, y] = end;
  poly([[x - 5, y], [x, y - 5], [x + 5, y], [x, y + 5]], '#d5ac7b');
};

SKIN_WEAP.stargauge = ({ At, hl, t, bar, poly, L, live, T }) => {
  const hub = At(t, -24);
  const sights = [t, At(hub, -11, 18), At(hub, -11, -18)];
  bar(hl, At(hub, -9), 4, '#915d3d');
  for (let i = 0; i < sights.length; i++) {
    bar(sights[i], sights[(i + 1) % sights.length], 2.4, '#ad8f55');
    bar(hub, sights[i], 2.6, L.blade);
  }
  poly([At(hub, 6), At(hub, 0, 5), At(hub, -6), At(hub, 0, -5)], L.scarf);
  if (!live) return;
  const needle = T * 2.8;
  bar(hub, At(hub, 11 * Math.cos(needle), 11 * Math.sin(needle)), 1.8, '#fff2a9');
};

SKIN_WEAP.rescueanchor = ({ At, hl, t, bar, poly, L }) => {
  const crown = At(t, -4);
  bar(At(hl, -6), crown, 5.5, '#3b5763');
  bar(At(hl, 5, -11), At(hl, 5, 11), 4.5, '#c69156');
  const eye = [At(hl, -12), At(hl, -6, 5), At(hl, 0), At(hl, -6, -5)];
  for (let i = 0; i < eye.length; i++) bar(eye[i], eye[(i + 1) % eye.length], 2.5, '#c69156');
  for (const side of [-1, 1]) {
    const w = n => n * side;
    poly([At(crown, 4, 0), At(crown, 1, w(12)), At(crown, -9, w(22)),
      At(crown, -24, w(24)), At(crown, -17, w(12)), At(crown, -14, w(17)),
      At(crown, -6, w(9)), At(crown, -5, 0)], L.blade);
  }
};
SKIN_WEAP.bastionshell = ({ hl, g, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  const c = At(g, 20, 0);
  bar(At(hl, -6), At(g, 14), 5.2, o ? L.outline : flash ? '#fff' : '#2f3d36');
  const hex = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    hex.push(At(c, Math.cos(a) * 18, Math.sin(a) * 14));
  }
  poly(hex, o ? L.outline : flash ? '#fff' : '#26443a');
  if (!o && !flash) {
    const inner = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      inner.push(At(c, Math.cos(a) * 11, Math.sin(a) * 8.5));
    }
    poly(inner, '#3d705e');
    for (let i = 0; i < 6; i++) bar(inner[i], hex[i], 1.8, '#d9b968');
    poly([At(c, 5, 0), At(c, 0, 4), At(c, -5, 0), At(c, 0, -4)], '#e6cf84');
    if (live) {
      const pulse = 0.35 + 0.2 * Math.sin(T * 4.2);
      glow(c, 10, '94,214,168', pulse);
    }
  }
};
SKIN_WEAP.abyssblade = ({ hl, g, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  bar(hl, g, 4.8, o ? L.outline : flash ? '#fff' : '#132036');
  bar(At(g, 0, -10), At(g, 0, 10), 4.0, o ? L.outline : flash ? '#fff' : '#6ec4ff');
  poly([At(g, 2, -4), At(t, -18, -7), At(t, -12, -3), At(t, 4, 0), At(t, -14, 6), At(g, 2, 5)], o ? L.outline : flash ? '#fff' : '#2b6cb0');
  if (!o && !flash) {
    poly([At(g, 4, -2), At(t, 2, 0), At(t, -14, 3), At(g, 4, 2)], '#e0f4ff');
    if (live) {
      const ph = (T * 0.9) % 1;
      glow(At(g, 10 + ph * 46, 0), 7, '110,196,255', 0.52);
    }
  }
};
SKIN_WEAP.willowsaber = ({ hl, g, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  // 离影 · 雁翎弯刀：弧形单刃刀身 + 环形刀首 + 雾青刃口
  bar(hl, g, 3.6, o ? L.outline : flash ? '#fff' : '#12262e');
  const ringP = At(hl, -4, 0);
  ctx.strokeStyle = o ? L.outline : flash ? '#fff' : '#5cc8d6';
  ctx.lineWidth = o ? 3.2 : 1.8;
  ctx.beginPath(); ctx.arc(ringP[0], ringP[1], 4.2, 0, Math.PI * 2); ctx.stroke();
  bar(At(g, 0, -5), At(g, 0, 5), 3.0, o ? L.outline : flash ? '#fff' : '#5cc8d6');
  poly([At(g, 1, -3), At(g, 24, -5.5), At(t, -8, -4.5), At(t, 4, 0.5), At(t, -10, 4.5), At(g, 22, 2.2), At(g, 1, 2.5)], o ? L.outline : flash ? '#fff' : '#1b3844');
  if (!o && !flash) {
    poly([At(g, 4, -2.6), At(g, 26, -4.8), At(t, -6, -3.6), At(t, 4, 0.5), At(t, -10, 1.2)], '#d8fbff');
    if (live) glow(At(t, -8, -1), 7, '120,215,225', 0.42 + 0.16 * Math.sin(T * 6));
  }
};
SKIN_WEAP.chimestaff = ({ hl, g, t, At, bar, glow, o, flash, live, T, L }) => {
  // 青鸾 · 药灯铃杖：翠竹药杖 + 悬垂药灯与双风铃环
  bar(At(hl, -12, 0), At(t, -4, 0), o ? 6.2 : 4.0, o ? L.outline : flash ? '#fff' : '#164d42');
  const head = At(t, -2, 0), hook = At(t, 5, -7), lamp = At(t, 6, 3 + Math.sin(T * 5) * 1.5);
  ctx.strokeStyle = o ? L.outline : flash ? '#fff' : '#52f0c8';
  ctx.lineWidth = o ? 4.4 : 2.4;
  ctx.beginPath(); ctx.moveTo(head[0], head[1]); ctx.quadraticCurveTo(hook[0], hook[1], lamp[0], lamp[1] - 5); ctx.stroke();
  ctx.fillStyle = o ? L.outline : flash ? '#fff' : '#28c79e';
  ctx.beginPath(); ctx.arc(lamp[0], lamp[1], o ? 6.8 : 5.2, 0, Math.PI * 2); ctx.fill();
  if (!o && !flash) {
    ctx.fillStyle = '#e6fff8'; ctx.beginPath(); ctx.arc(lamp[0], lamp[1], 2.6, 0, Math.PI * 2); ctx.fill();
    for (const d of [-10, -18]) {
      const r = At(t, d, 4);
      ctx.strokeStyle = '#ffd97d'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(r[0], r[1], 2.5, 0, Math.PI * 2); ctx.stroke();
    }
    if (live) glow(lamp, 11, '82,240,200', 0.48 + 0.18 * Math.sin(T * 5));
  }
};
SKIN_WEAP.jadefan = SKIN_WEAP.chimestaff;
SKIN_WEAP.blazegauntlet = ({ sk, glow, o, flash, live, T, L }) => {
  for (const h of [sk.hf, sk.hb]) {
    ctx.fillStyle = o ? L.outline : flash ? '#fff' : '#6e2014';
    ctx.beginPath(); ctx.arc(h[0], h[1], o ? 9.4 : 7.8, 0, 7); ctx.fill();
    if (!o && !flash) {
      ctx.strokeStyle = '#ff9638'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(h[0], h[1], 7.8, -0.8, 1.4); ctx.stroke();
      if (live) glow(h, 9 + Math.sin(T * 9) * 1.6, '255,140,50', 0.52);
    }
  }
};
SKIN_WEAP.foxdaggers = ({ sk, bar, poly, glow, o, flash, live, T, L }) => {
  for (const h of [sk.hf, sk.hb]) {
    const dir = h === sk.hf ? 1 : -1;
    const tip = [h[0] + dir * sk.face * 30, h[1] + 2];
    poly([[h[0], h[1] - 2], [h[0] + dir * sk.face * 22, h[1] - 8], tip, [h[0] + dir * sk.face * 12, h[1] + 4]], o ? L.outline : flash ? '#fff' : '#d4b8ff');
    bar([h[0], h[1] - 4], [h[0], h[1] + 4], 2.5, o ? L.outline : flash ? '#fff' : '#a78bfa');
    if (!o && !flash && live) glow(tip, 6, '196,155,255', 0.4 + 0.18 * Math.sin(T * 7 + dir));
  }
};
SKIN_WEAP.cranewing = ({ hl, g, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  bar(hl, At(g, 8), 3.6, o ? L.outline : flash ? '#fff' : '#f2d080');
  for (let i = 0; i < 4; i++) {
    poly([At(g, 4 + i * 4, 0), At(t, -i * 6, -12 - i * 2), At(t, -i * 5 + 4, -3)], o ? L.outline : flash ? '#fff' : (i % 2 ? '#edf6ff' : '#a8e6ff'));
  }
  bar(g, t, 2.2, o ? L.outline : flash ? '#fff' : '#ffffff');
  if (!o && !flash && live) glow(At(t, -6, -6), 7, '168,230,255', 0.35 + 0.15 * Math.sin(T * 4.5));
};
SKIN_WEAP.gangpike = ({ hl, g, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  bar(At(hl, -12), At(t, -14), 3.6, o ? L.outline : flash ? '#fff' : '#2a3448');
  poly([At(t, -16, -2), At(t, 4, 0), At(t, -16, 2)], o ? L.outline : flash ? '#fff' : '#fff6d6');
  poly([At(t, -14, 0), At(t, -22, -10), At(t, -10, -3)], o ? L.outline : flash ? '#fff' : '#f0c860');
  poly([At(t, -14, 0), At(t, -22, 10), At(t, -10, 3)], o ? L.outline : flash ? '#fff' : '#f0c860');
  if (!o && !flash) {
    const sway = live ? Math.sin(T * 6) * 3.5 : 0;
    ctx.strokeStyle = '#c83e3b'; ctx.lineWidth = 3.0;
    ctx.beginPath(); ctx.moveTo(...At(t, -18, 0)); ctx.quadraticCurveTo(...At(t, -24, 9 + sway), ...At(t, -30, 5 + sway)); ctx.stroke();
    if (live) glow(t, 6, '240,200,96', 0.38);
  }
};
SKIN_WEAP.soulbrush = ({ hl, g, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  bar(At(hl, -6), At(t, -16), 4.6, o ? L.outline : flash ? '#fff' : '#221c38');
  bar(At(t, -18, -3), At(t, -14, -3), 5.6, o ? L.outline : flash ? '#fff' : '#b48eff');
  poly([At(t, -14, -4), At(t, 4, 0), At(t, -14, 4)], o ? L.outline : flash ? '#fff' : '#181228');
  if (!o && !flash && live) glow(At(t, -2, 0), 7 + Math.sin(T * 5) * 1.4, '180,142,255', 0.54);
};
SKIN_WEAP.frostrapier = ({ hl, g, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  bar(hl, g, 3.0, o ? L.outline : flash ? '#fff' : '#182430');
  poly([At(g, 0, -2.5), At(t, 3, 0), At(g, 0, 2.5)], o ? L.outline : flash ? '#fff' : '#eefaff');
  if (!o && !flash) {
    ctx.strokeStyle = '#5ec8ff'; ctx.lineWidth = 2.0;
    ctx.beginPath(); ctx.arc(g[0], g[1], 6, 0, 7); ctx.stroke();
    if (live) glow(At(t, -8, 0), 6, '125,220,255', 0.44 + 0.18 * Math.sin(T * 6));
  }
};
SKIN_WEAP.rocwing = ({ hl, g, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  bar(hl, At(g, 6), 4.0, o ? L.outline : flash ? '#fff' : '#5a3a14');
  for (let i = 0; i < 4; i++) {
    poly([At(g, 4 + i * 4, 0), At(t, -i * 5, 13 + i * 2), At(t, -i * 4 + 4, 2)], o ? L.outline : flash ? '#fff' : (i % 2 ? '#ffc84a' : '#fff4d0'));
  }
  bar(g, t, 2.4, o ? L.outline : flash ? '#fff' : '#f0a828');
  if (!o && !flash && live) glow(At(t, -5, 6), 7, '255,200,74', 0.42 + 0.16 * Math.sin(T * 6));
};
SKIN_WEAP.reapscythes = ({ sk, bar, poly, glow, o, flash, live, T, L }) => {
  for (const h of [sk.hf, sk.hb]) {
    const dir = h === sk.hf ? 1 : -1;
    bar(h, [h[0] + dir * sk.face * 22, h[1] - 12], 3.0, o ? L.outline : flash ? '#fff' : '#2a1842');
    poly([[h[0] + dir * sk.face * 20, h[1] - 14], [h[0] + dir * sk.face * 34, h[1] - 6], [h[0] + dir * sk.face * 24, h[1] + 10], [h[0] + dir * sk.face * 26, h[1] - 4]], o ? L.outline : flash ? '#fff' : '#b26bff');
    if (!o && !flash && live) glow([h[0] + dir * sk.face * 28, h[1] - 4], 6, '178,107,255', 0.42 + 0.18 * Math.sin(T * 7 + dir));
  }
};
SKIN_WEAP.spiritflute = ({ hl, t, At, bar, glow, o, flash, live, T, L }) => {
  bar(hl, t, 3.8, o ? L.outline : flash ? '#fff' : '#2ec9aa');
  if (!o && !flash) {
    bar(At(hl, 6), At(t, -6), 2.0, '#e8fffb');
    const sway = live ? Math.sin(T * 4.5) * 3 : 0;
    ctx.strokeStyle = '#4ce6c8'; ctx.lineWidth = 2.0;
    ctx.beginPath(); ctx.moveTo(hl[0], hl[1]); ctx.lineTo(hl[0] - 4 + sway, hl[1] + 14); ctx.stroke();
    if (live) glow(At(t, -4, 0), 6, '76,230,200', 0.4);
  }
};
SKIN_WEAP.overlordblade = ({ hl, g, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  bar(At(hl, -4), g, 5.4, o ? L.outline : flash ? '#fff' : '#2a1410');
  bar(At(g, 0, -11), At(g, 0, 11), 4.4, o ? L.outline : flash ? '#fff' : '#e6b450');
  poly([At(g, 2, -6), At(t, -12, -8), At(t, 4, 0), At(t, -12, 7), At(g, 2, 6)], o ? L.outline : flash ? '#fff' : '#6e1e1a');
  if (!o && !flash) {
    poly([At(g, 4, -2), At(t, 2, 0), At(t, -10, 2), At(g, 4, 2)], '#f2e4cc');
    if (live) glow(At(t, -4, 0), 7, '230,180,80', 0.4 + 0.15 * Math.sin(T * 5));
  }
};
SKIN_WEAP.chimefan = ({ hl, g, t, At, bar, glow, o, flash, live, T, L }) => {
  const dx = t[0] - g[0], dy = t[1] - g[1], a = Math.atan2(dy, dx), r = 32;
  ctx.fillStyle = o ? L.outline : flash ? '#fff' : '#f5a8c4';
  ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.arc(g[0], g[1], r, a - 0.8, a + 0.8); ctx.closePath(); ctx.fill();
  bar(hl, g, 3.2, o ? L.outline : flash ? '#fff' : '#4a3642');
  if (!o && !flash) {
    ctx.strokeStyle = '#f5fbff'; ctx.lineWidth = 2.0;
    ctx.beginPath(); ctx.arc(g[0], g[1], r * 0.85, a - 0.75, a + 0.75); ctx.stroke();
    if (live) glow(At(g, 18, 0), 5, '255,168,200', 0.45 + 0.15 * Math.sin(T * 6));
  }
};
SKIN_WEAP.iaidoblade = ({ hl, g, t, At, bar, glow, o, flash, live, T, L }) => {
  bar(hl, g, 3.6, o ? L.outline : flash ? '#fff' : '#141822');
  bar(At(g, 0, -6), At(g, 0, 6), 2.8, o ? L.outline : flash ? '#fff' : '#7c96d8');
  ctx.strokeStyle = o ? L.outline : flash ? '#fff' : '#f8fbff';
  ctx.lineWidth = o ? 4.4 : 2.6;
  ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.quadraticCurveTo(...At(g, 26, -3), t[0], t[1]); ctx.stroke();
  if (!o && !flash && live) glow(At(t, -6, 0), 6, '156,192,255', 0.42 + 0.18 * Math.sin(T * 7));
};
SKIN_WEAP.vermilionbrush = ({ hl, t, At, bar, poly, glow, o, flash, live, T, L }) => {
  bar(At(hl, -6), At(t, -15), 4.6, o ? L.outline : flash ? '#fff' : '#8a281e');
  bar(At(t, -17, 0), At(t, -13, 0), 5.6, o ? L.outline : flash ? '#fff' : '#d9b36a');
  poly([At(t, -13, -4), At(t, 4, 0), At(t, -13, 4)], o ? L.outline : flash ? '#fff' : '#ffeae4');
  if (!o && !flash && live) glow(At(t, -1, 0), 6.5 + Math.sin(T * 5) * 1.4, '245,105,80', 0.52);
};

