// ======================= 皮肤兵器：每款皮肤一把自己的兵器（只换样子，判定、范围、出招都和原皮一样） =======================
const SKIN_WEAP = {};
function skinWeapon(ws, sk, L, o, flash) {
  const draw = SKIN_WEAP[ws]; if (!draw) return false;
  const g = sk.guard, t = sk.tip, hl = sk.hilt, pf = sk.face || 1;
  const dx = t[0] - g[0], dy = t[1] - g[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, px = -uy * pf, py = ux * pf;
  const T = typeof clock === 'number' ? clock : 0, live = !o && !flash;
  const P = (s, w = 0) => [g[0] + dx * s + px * w, g[1] + dy * s + py * w];                  // 从护手沿刃走 s（1 是刃尖），往刃口一侧偏 w
  const At = (b, s, w = 0) => [b[0] + ux * s + px * w, b[1] + uy * s + py * w];              // 从 b 点沿刃的方向走 s 像素
  const fillWith = (build, col) => {
    ctx.beginPath(); build(); ctx.closePath();
    if (o) { ctx.fillStyle = ctx.strokeStyle = L.outline; ctx.lineWidth = 3.4; ctx.stroke(); ctx.fill(); }
    else { ctx.fillStyle = flash ? '#fff' : col; ctx.fill(); }
  };
  const poly = (pts, col) => fillWith(() => { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }, col);
  const bar = (a, b, w, col) => { ctx.strokeStyle = o ? L.outline : flash ? '#fff' : col; ctx.lineWidth = o ? w + 3 : w; line(a, b); };
  const lg = (a, b, stops) => { const q = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); for (const [k, c] of stops) q.addColorStop(k, c); return q; };
  const glow = (c, r, rgb, a) => { const q = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r); q.addColorStop(0, `rgba(${rgb},${a})`); q.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = q; ctx.fillRect(c[0] - r, c[1] - r, r * 2, r * 2); };
  const leaf = (a, b, w, col) => {   // 两头尖的柳叶形
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1, nx = -ey / el * w, ny = ex / el * w;
    fillWith(() => { ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0] + nx, m[1] + ny, b[0], b[1]); ctx.quadraticCurveTo(m[0] - nx, m[1] - ny, a[0], a[1]); }, col);
  };
  const flower = (c, r, col, mid) => {   // 五瓣小花
    ctx.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k * 1.2566 + 0.3; circle([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r], r * 0.85); }
    ctx.fillStyle = mid; circle(c, r * 0.5);
  };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  draw({ sk, L, o, flash, live, g, t, hl, len, ux, uy, px, py, pf, T, P, At, fillWith, poly, bar, lg, glow, leaf, flower });
  ctx.restore();
  return true;
}
// ---------- 剑：青锋 ----------
SKIN_WEAP.rain_sword = W => {   // 烟雨：细长青钢剑，刃上一道水纹，护手是一圈涟漪，剑首垂青穗，刃尖挂着水珠
  const { P, poly, bar, live, t, T } = W;
  bar(W.hl, W.g, 4, '#2f4a4c');
  poly([P(0, -2.2), P(0.9, -2), t, P(0.9, 2), P(0, 2.2)], W.lg(W.g, t, [[0, '#7fa9ad'], [0.55, '#d6eef0'], [1, '#ffffff']]));
  poly([P(0.02, -6.5), P(-0.03, -7.5), P(-0.05, 0), P(-0.03, 7.5), P(0.02, 6.5), P(0.0, 0)], '#5f9a9c');
  if (!live) return;
  ctx.strokeStyle = 'rgba(60,110,115,0.8)'; ctx.lineWidth = 0.9; ctx.beginPath();   // 刃上水纹
  for (let i = 0; i <= 14; i++) { const k = 0.05 + i / 14 * 0.8, q = P(k, Math.sin(k * 14 - T * 5) * 0.9); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190,230,232,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(...P(-0.03, 0), 4.2, 0, 7); ctx.stroke();   // 护手涟漪
  ctx.strokeStyle = 'rgba(95,160,150,0.9)'; ctx.lineWidth = 1;   // 剑穗
  const hl = W.hl, sw = Math.sin(T * 4) * 2;
  for (const d of [-1.5, 0, 1.5]) { ctx.beginPath(); ctx.moveTo(hl[0], hl[1]); ctx.quadraticCurveTo(hl[0] + d, hl[1] + 6, hl[0] + d * 1.5 + sw, hl[1] + 13); ctx.stroke(); }
  const ph = (T * 0.8) % 1, dq = P(0.35 + ph * 0.6, 1.6);   // 一颗水珠沿刃滑到刃尖
  ctx.fillStyle = `rgba(225,248,255,${0.9 - ph * 0.5})`; circle(dq, 1.3);
  const ph2 = (T * 1.1 + 0.4) % 1; ctx.fillStyle = `rgba(200,235,242,${0.8 * (1 - ph2)})`; circle([t[0], t[1] + ph2 * 18], 1.2);
};
SKIN_WEAP.sun_sword = W => {   // 金乌：火焰刃口的金剑，护手是两片往后掠的金乌翅
  const { P, poly, bar, live, t, T } = W;
  bar(W.hl, W.g, 4.5, '#7a2a0c');
  const edge = [];
  for (let i = 9; i >= 0; i--) { const s = i * 0.095; edge.push(P(s, (i % 2 ? 6.2 : 3.6) + Math.sin(T * 9 + i) * 0.8)); }
  poly([P(0, -3), P(0.84, -3.2), t, ...edge], W.lg(W.g, t, [[0, '#ff8a1a'], [0.45, '#ffd25a'], [1, '#fffbe8']]));
  for (const s2 of [-1, 1]) poly([P(0, s2 * 2), P(-0.03, s2 * 11), P(-0.2, s2 * 13.5), P(-0.1, s2 * 7), P(-0.12, s2 * 3)], '#ffcf5a');
  if (!live) return;
  ctx.strokeStyle = 'rgba(200,70,10,0.8)'; ctx.lineWidth = 1.1; line(P(0.04, 0), P(0.84, 0));
  for (const s2 of [-1, 1]) { ctx.strokeStyle = 'rgba(160,80,10,0.7)'; ctx.lineWidth = 0.9; line(P(-0.02, s2 * 4), P(-0.15, s2 * 11)); }
  ctx.globalCompositeOperation = 'lighter'; W.glow(t, 9, '255,190,80', 0.5);
};
SKIN_WEAP.abyss_blade = W => {   // 幽渊：碎成三截、悬着不散的暗渊之刃，裂缝里透紫光
  const { P, poly, bar, live, t, T } = W;
  bar(W.hl, W.g, 4.5, '#1a0c28');
  for (const s2 of [-1, 1]) poly([P(0, s2 * 2), P(0.03, s2 * 9.5), P(-0.12, s2 * 7)], '#6b2fa8');
  const segs = [[0, 0.3], [0.37, 0.64], [0.71, 1]], shards = [];
  segs.forEach(([a, b], k) => {
    const j = Math.sin(T * 3 + k * 2.1) * 1.3, pts = b === 1 ? [P(a, -2.6 + j), [t[0] + W.px * j, t[1] + W.py * j], P(a, 3 + j)] : [P(a, -3 + j), P(b, -2.6 + j), P(b, 3.4 + j), P(a, 3.2 + j)];
    shards.push(pts); poly(pts, '#2a1442');
  });
  if (!live) return;
  ctx.strokeStyle = 'rgba(190,120,255,0.95)'; ctx.lineWidth = 1.1;
  for (const s of shards) { ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); for (const q of s) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.stroke(); }
  ctx.globalCompositeOperation = 'lighter';
  for (const s of [0.335, 0.675]) W.glow(P(s, 0.3), 6, '170,90,255', 0.7);
};
SKIN_WEAP.qfx_sword = W => {   // 青锋行：素白长剑，剑脊一道青痕，剑首垂两缕红穗
  const { P, poly, bar, live, t, T, At, hl } = W;
  bar(hl, W.g, 4.5, '#2a1a12');
  poly([P(0, -2.4), P(0.9, -2.4), t, P(0.9, 2.4), P(0, 2.4)], W.lg(W.g, t, [[0, '#cfeee2'], [1, '#f6fffb']]));
  poly([P(0.02, -6.5), P(-0.03, -7.5), P(-0.03, 7.5), P(0.02, 6.5)], '#2e5a4e');
  if (!live) return;
  ctx.strokeStyle = 'rgba(40,140,110,0.8)'; ctx.lineWidth = 1; line(P(0.04, 0), P(0.88, 0));
  const sw = Math.sin(T * 3.4) * 3, k0 = At(hl, -3);
  ctx.strokeStyle = '#c8321e'; ctx.lineWidth = 1.6;
  for (const d of [0, 2.5]) { ctx.beginPath(); ctx.moveTo(k0[0], k0[1]); ctx.quadraticCurveTo(k0[0] - W.ux * 6 + d, k0[1] + 7, k0[0] - W.ux * 5 + sw + d, k0[1] + 17 - d); ctx.stroke(); }
  ctx.fillStyle = '#e8b04a'; circle(k0, 1.6);
};
// ---------- 双刃：绯影 ----------
function dualPair(W) { const s = W.sk; return [[W.g, W.t, 1], [s.hb, [s.hb[0] + W.ux * 38, s.hb[1] + W.uy * 38], -1]]; }
SKIN_WEAP.jade_daggers = W => {   // 碧影：一对柳叶翠玉短刃
  const pr = dualPair(W);
  W.bar(W.hl, W.g, 4, '#1c3a2c');
  pr.forEach(([a, b], k) => W.leaf(a, b, 4.6, k ? '#5ed8a6' : '#86f2c6'));
  if (!W.live) return;
  for (const [a, b] of pr) {
    ctx.strokeStyle = 'rgba(20,110,80,0.85)'; ctx.lineWidth = 1; line(a, b);
    const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1, nx = -ey / el, ny = ex / el;
    ctx.lineWidth = 0.7;
    for (const k of [0.3, 0.5, 0.7]) for (const s2 of [-1, 1]) { const m = [a[0] + ex * k, a[1] + ey * k]; line(m, [m[0] + ex / el * 3 + nx * s2 * 3, m[1] + ey / el * 3 + ny * s2 * 3]); }
  }
};
SKIN_WEAP.blood_scythes = W => {   // 血月：一对弯月镰，刃口朝外勾
  W.bar(W.hl, W.g, 4, '#2a0a10');
  const blades = [];
  for (const [a, b, sg] of dualPair(W)) {
    const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1, nx = -ey / el * W.pf * sg, ny = ex / el * W.pf * sg;
    const h = [a[0] + ex * 0.42, a[1] + ey * 0.42], c1 = [h[0] + ex * 0.45 + nx * 20, h[1] + ey * 0.45 + ny * 20], c2 = [h[0] + ex * 0.42 + nx * 6, h[1] + ey * 0.42 + ny * 6];
    W.bar(a, h, 3.2, '#3a1018');
    W.fillWith(() => { ctx.moveTo(h[0], h[1]); ctx.quadraticCurveTo(c1[0], c1[1], b[0], b[1]); ctx.quadraticCurveTo(c2[0], c2[1], h[0] - nx * 1.5, h[1] - ny * 1.5); }, W.lg(h, b, [[0, '#5a0010'], [0.6, '#e01830'], [1, '#ff6a78']]));
    blades.push([h, c2, b]);
  }
  if (!W.live) return;
  ctx.strokeStyle = 'rgba(255,190,200,0.85)'; ctx.lineWidth = 0.9;
  for (const [h, c2, b] of blades) { ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.quadraticCurveTo(c2[0], c2[1], b[0], b[1]); ctx.stroke(); }
};
SKIN_WEAP.phantom_kunai = W => {   // 幻灵：一对青白苦无，身后拖着两道幻影
  const pr = dualPair(W);
  const kunai = (a, b, col, ghost) => {
    const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1, nx = -ey / el, ny = ex / el;
    const q = k => [a[0] + ex * k, a[1] + ey * k];
    const s0 = q(0.36), s1 = q(0.56);
    if (!ghost) W.bar(a, s0, 3, '#1b4d6b');
    const pts = [s0, [s1[0] + nx * 4.8, s1[1] + ny * 4.8], b, [s1[0] - nx * 4.8, s1[1] - ny * 4.8]];
    if (ghost) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill(); }
    else W.poly(pts, col);
    return [a, b, ex, ey, el];
  };
  if (W.live) {
    ctx.globalCompositeOperation = 'lighter';
    for (const k of [2, 1]) for (const [a, b] of pr) { const off = [-W.ux * 7 * k, -W.uy * 7 * k + Math.sin(W.T * 6 + k) * 1.5]; kunai([a[0] + off[0], a[1] + off[1]], [b[0] + off[0], b[1] + off[1]], `rgba(0,230,255,${0.32 / k})`, true); }
    ctx.globalCompositeOperation = 'source-over';
  }
  const res = pr.map(([a, b]) => kunai(a, b, '#e6ffff'));
  if (!W.live) return;
  for (const [a, b, ex, ey, el] of res) {
    ctx.strokeStyle = 'rgba(0,200,240,0.95)'; ctx.lineWidth = 1; line([a[0] + ex * 0.4, a[1] + ey * 0.4], b);
    ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(a[0] - ex / el * 3, a[1] - ey / el * 3, 2.6, 0, 7); ctx.stroke();
  }
};
// ---------- 巨剑：铁山 ----------
SKIN_WEAP.bronze_cleaver = W => {   // 青铜：宽背大刀，刀身铸着饕餮回纹，长着铜绿
  const { P, poly, bar, live, t } = W;
  bar(W.hl, W.g, 5, '#3a2a1e');
  poly([P(0, -4.5), P(0.95, -4.5), t, P(0.88, 7.2), P(0.6, 9), P(0.3, 7.8), P(0, 4.5)], W.lg(P(0.5, -4.5), P(0.5, 9), [[0, '#e0bd84'], [1, '#9a7440']]));
  bar(W.P(0.01, -10.5), W.P(0.01, 10.5), 3.6, '#3fa37a');
  if (!live) return;
  ctx.fillStyle = 'rgba(63,163,122,0.55)';
  for (const [s, w, r] of [[0.22, 1, 2.2], [0.58, 4.5, 1.8], [0.76, -1.5, 1.5], [0.4, -2.5, 1.2]]) circle(P(s, w), r);
  ctx.strokeStyle = 'rgba(80,46,18,0.85)'; ctx.lineWidth = 0.9;
  const box = (s0, s1, w0, w1) => { ctx.beginPath(); for (const [s, w] of [[s0, w0], [s1, w0], [s1, w1], [s0, w1]]) ctx.lineTo(...P(s, w)); ctx.closePath(); ctx.stroke(); };
  box(0.1, 0.3, -2.5, 5); box(0.14, 0.26, -0.8, 3.2);
  ctx.strokeStyle = 'rgba(255,240,205,0.75)'; ctx.lineWidth = 1; ctx.beginPath(); for (const [s, w] of [[0.05, 4.2], [0.3, 7.2], [0.6, 8.4], [0.86, 6.6]]) ctx.lineTo(...P(s, w)); ctx.stroke();
};
SKIN_WEAP.obsidian_slab = W => {   // 玄武：黑曜石方碑巨剑，裂缝里流着熔岩，龟甲六角护手
  const { P, poly, bar, live, T } = W;
  bar(W.hl, W.g, 5.5, '#1a1622');
  poly([P(0, -6.2), P(0.84, -6.6), P(1, -1.2), P(1, 3.5), P(0.9, 6.6), P(0, 6.2)], '#24202e');
  const c = W.g; poly([0, 1, 2, 3, 4, 5].map(k => { const a = k * Math.PI / 3 + Math.atan2(W.uy, W.ux); return [c[0] + Math.cos(a) * 7.5 * (k % 3 ? 1 : 0.62), c[1] + Math.sin(a) * 7.5 * (k % 3 ? 1 : 0.62)]; }), '#2e2642');
  if (!live) return;
  const a = 0.55 + 0.35 * Math.sin(T * 4), crack = [];
  for (let i = 0; i <= 8; i++) crack.push(P(0.06 + i * 0.105, (i % 2 ? 2.6 : -2) + (i === 4 ? 1.5 : 0)));
  ctx.strokeStyle = `rgba(255,${130 + 60 * Math.sin(T * 4) | 0},60,${a})`; ctx.lineWidth = 1.4;
  ctx.beginPath(); for (const q of crack) ctx.lineTo(q[0], q[1]); ctx.stroke();
  ctx.lineWidth = 0.9; line(crack[3], P(0.4, -5)); line(crack[6], P(0.66, 5.4));
  ctx.strokeStyle = 'rgba(140,120,255,0.6)'; ctx.lineWidth = 1; line(P(0.02, -6), P(0.84, -6.4));
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,120,40,${a * 0.3})`; ctx.lineWidth = 4;
  ctx.beginPath(); for (const q of crack) ctx.lineTo(q[0], q[1]); ctx.stroke();
};
SKIN_WEAP.shura_blade = W => {   // 修罗：锯齿鬼刃，刃口一排血牙，刀尖烧着火
  const { P, poly, bar, live, t, T } = W;
  bar(W.hl, W.g, 5, '#1c0808');
  const saw = [[0.9, 4], [0.8, 8.5], [0.72, 4], [0.6, 9], [0.5, 4], [0.38, 8.5], [0.28, 4], [0.16, 7.5], [0.07, 4], [0, 4.5]].map(([s, w]) => P(s, w));
  poly([P(0, -4.5), P(0.88, -5), t, ...saw], W.lg(W.g, t, [[0, '#2a0606'], [1, '#801616']]));
  for (const s2 of [-1, 1]) poly([P(0, s2 * 3), P(-0.05, s2 * 12.5), P(0.1, s2 * 6)], '#2a0a0a');
  if (!live) return;
  ctx.strokeStyle = '#ff3a30'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(...t); for (const q of saw) ctx.lineTo(q[0], q[1]); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) { const fl = 6 + Math.sin(T * 22 + k * 2) * 2.5, b = P(0.84 + k * 0.05, 0); ctx.fillStyle = `rgba(255,${90 + k * 40},40,0.55)`; ctx.beginPath(); ctx.moveTo(b[0] - 3, b[1]); ctx.quadraticCurveTo(b[0], b[1] - fl * 1.4, b[0] + 1, b[1] - fl * 1.7); ctx.quadraticCurveTo(b[0] + 2, b[1] - fl * 0.6, b[0] + 3, b[1]); ctx.fill(); }
};
// ---------- 枪：凌霜 ----------
SKIN_WEAP.plum_spear = W => {   // 红梅：朱漆枪杆缠金箍，银枪头上錾一朵梅花，红缨蓬松
  const { At, t, bar, live, T } = W, back = At(W.g, -36), head0 = At(t, -22);
  bar(back, head0, 3.2, '#9a1e34');
  ctx.strokeStyle = 'rgba(255,200,210,0.35)'; ctx.lineWidth = 0.8; line(At(back, 0, 0.8), At(head0, 0, 0.8));
  for (const s of [-30, -60, -92]) bar(At(t, s, -2), At(t, s, 2), 2.2, '#e9c46a');
  W.poly([t, At(t, -9, 3.8), At(t, -19, 2.6), At(t, -23, 1.4), At(t, -23, -1.4), At(t, -19, -2.6), At(t, -9, -3.8)], W.lg(At(t, -23), t, [[0, '#b9bec8'], [0.6, '#f2f4f8'], [1, '#ffffff']]));
  bar(At(t, -23, -3.2), At(t, -23, 3.2), 2.4, '#e9c46a');
  if (!live) return;
  W.flower(At(t, -14), 1.6, '#d8344f', '#ffe07a');
  ctx.strokeStyle = 'rgba(140,145,160,0.6)'; ctx.lineWidth = 0.7; line(At(t, -8), At(t, -1));
  const r0 = At(t, -24), sw = Math.sin(T * 4) * 2.5;
  for (const [d, col] of [[-3, '#b8243f'], [-1.5, '#d8344f'], [0, '#e8455e'], [1.5, '#d8344f'], [3, '#b8243f']]) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(r0[0], r0[1]);
    ctx.quadraticCurveTo(r0[0] - W.ux * 6 + d, r0[1] + 5, r0[0] - W.ux * 9 + d * 1.4 + sw, r0[1] + 13 + Math.abs(d) * 0.6); ctx.stroke();
  }
};
SKIN_WEAP.aurora_lance = W => {   // 极光：细长骑枪，枪头从青绿流到淡紫，后面飘两条极光带
  const { At, t, bar, live, T } = W, back = At(W.g, -36);
  bar(back, At(t, -26), 3, '#d8f6ee');
  W.poly([t, At(t, -11, 3.6), At(t, -26, 2.4), At(t, -29), At(t, -26, -2.4), At(t, -11, -3.6)], W.lg(At(t, -29), t, [[0, '#2fd4a8'], [0.5, '#8ab4ff'], [1, '#f4f0ff']]));
  if (!live) return;
  ctx.strokeStyle = '#2c7873'; ctx.lineWidth = 2.2; for (const s of [-30, -40, -50]) line(At(t, s, -2), At(t, s, 2));
  const r0 = At(t, -29);
  for (const [k, col] of [[0, 'rgba(110,255,205,0.7)'], [1, 'rgba(170,120,255,0.6)']]) {
    const c1 = At(r0, -14, 6 * Math.sin(T * 4 + k) + (k ? 3 : -3)), e1 = At(r0, -30, 10 * Math.sin(T * 4 + 1 + k) + (k ? 6 : -6));
    ctx.strokeStyle = col; ctx.lineWidth = 2.4 - k * 0.6; ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.quadraticCurveTo(c1[0], c1[1], e1[0], e1[1]); ctx.stroke();
  }
};
SKIN_WEAP.dragon_spear = W => {   // 沧龙：蛇形游龙枪头，龙口吞刃，杆上缠金
  const { At, t, bar, live } = W, back = At(W.g, -36);
  bar(back, At(t, -22), 3.6, '#163e74');
  const l1 = [], r1 = [];
  for (let i = 0; i <= 6; i++) { const s = -26 + i * 26 / 6, w = 3.8 * (1 - i / 6) + 0.6, wv = 1.9 * Math.sin(i * 1.7); l1.push(At(t, s, w + wv)); r1.push(At(t, s, -w + wv)); }
  W.poly([...l1, t, ...r1.reverse()], W.lg(At(t, -26), t, [[0, '#9ccfff'], [1, '#f2f9ff']]));
  for (const s2 of [-1, 1]) W.poly([At(t, -29, s2 * 2), At(t, -22, s2 * 9), At(t, -18, s2 * 5), At(t, -24, s2 * 2.5)], '#1f90ff');
  if (!live) return;
  ctx.fillStyle = '#ffd54a'; circle(At(t, -25, -5.2), 1.2); circle(At(t, -25, 5.2), 1.2);
  ctx.strokeStyle = '#e8c45a'; ctx.lineWidth = 1.2; for (let s = -34; s > -70; s -= 6) line(At(t, s, -2), At(t, s - 3, 2));
  ctx.strokeStyle = 'rgba(40,120,220,0.85)'; ctx.lineWidth = 0.9; ctx.beginPath(); for (const q of l1) ctx.lineTo(q[0], q[1]); ctx.lineTo(...t); ctx.stroke();
};
// ---------- 扇：流云 ----------
function fanSector(W, r, a0, a1) { const g = W.g; ctx.moveTo(g[0], g[1]); ctx.arc(g[0], g[1], r, a0, a1); }
SKIN_WEAP.dusk_fan = W => {   // 晚霞：扇面一片晚霞，从金到橘到紫，扇骨深褐
  const { g, live } = W, a = Math.atan2(W.uy, W.ux);
  W.bar(W.hl, g, 3.4, '#5a2a1a');
  const q = ctx.createRadialGradient(g[0], g[1], 4, g[0], g[1], 32); for (const [k, c] of [[0, '#ffe7a0'], [0.45, '#ff8a4a'], [0.75, '#e0507a'], [1, '#6a2a6a']]) q.addColorStop(k, c);
  W.fillWith(() => fanSector(W, 31, a - 0.72, a + 0.72), q);
  if (!live) return;
  ctx.strokeStyle = 'rgba(90,40,20,0.85)'; ctx.lineWidth = 1.1;
  for (let i = -3; i <= 3; i++) { const b = a + i * 0.2; line([g[0] + Math.cos(b) * 5, g[1] + Math.sin(b) * 5], [g[0] + Math.cos(b) * 30, g[1] + Math.sin(b) * 30]); }
  ctx.strokeStyle = 'rgba(255,236,200,0.85)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(g[0], g[1], 30.5, a - 0.72, a + 0.72); ctx.stroke();
  ctx.strokeStyle = 'rgba(50,16,30,0.85)'; ctx.lineWidth = 1;
  for (const [r, d] of [[20, -0.25], [24, 0.05], [17, 0.3]]) { const c = [g[0] + Math.cos(a + d) * r, g[1] + Math.sin(a + d) * r]; ctx.beginPath(); ctx.moveTo(c[0] - 2.5, c[1] - 1); ctx.lineTo(c[0], c[1] + 0.6); ctx.lineTo(c[0] + 2.5, c[1] - 1); ctx.stroke(); }
};
SKIN_WEAP.feather_fan = W => {   // 天青：一柄白羽扇，九支羽毛，羽尖染天青
  const { g, live } = W, a = Math.atan2(W.uy, W.ux), quills = [];
  W.bar(W.hl, g, 3.4, '#8fb4d6');
  for (let k = -4; k <= 4; k++) {
    const b = a + k * 0.17, r = 33 - Math.abs(k) * 1.2, p0 = [g[0] + Math.cos(b) * 4, g[1] + Math.sin(b) * 4], p1 = [g[0] + Math.cos(b) * r, g[1] + Math.sin(b) * r];
    W.leaf(p0, p1, 3.8, W.lg(p0, p1, [[0, '#ffffff'], [0.65, '#eef7ff'], [1, '#7cc4ff']])); quills.push([p0, p1]);
  }
  if (!live) return;
  ctx.strokeStyle = 'rgba(90,150,210,0.7)'; ctx.lineWidth = 0.8; for (const [p0, p1] of quills) line(p0, p1);
  ctx.strokeStyle = '#56b8ff'; ctx.lineWidth = 2.4; const n = [-W.uy, W.ux]; line([g[0] + n[0] * 3.5, g[1] + n[1] * 3.5], [g[0] - n[0] * 3.5, g[1] - n[1] * 3.5]);
};
SKIN_WEAP.bamboo_fan = W => {   // 墨竹：竹骨折扇，扇面画着一枝墨竹，角上一方朱印
  const { g, live } = W, a = Math.atan2(W.uy, W.ux);
  W.bar(W.hl, g, 3.4, '#4e3a22');
  if (!live) { W.fillWith(() => fanSector(W, 31, a - 0.72, a + 0.72), '#e8e2c8'); return; }
  for (let i = 0; i < 10; i++) { ctx.beginPath(); fanSector(W, 31, a - 0.72 + i * 0.144, a - 0.72 + (i + 1) * 0.144 + 0.004); ctx.closePath(); ctx.fillStyle = i % 2 ? '#e2dbbd' : '#f1ebd2'; ctx.fill(); }
  ctx.strokeStyle = 'rgba(78,58,34,0.7)'; ctx.lineWidth = 0.9;
  for (let i = 0; i <= 10; i++) { const b = a - 0.72 + i * 0.144; line([g[0] + Math.cos(b) * 4, g[1] + Math.sin(b) * 4], [g[0] + Math.cos(b) * 12, g[1] + Math.sin(b) * 12]); }
  const pol = (r, d) => [g[0] + Math.cos(a + d) * r, g[1] + Math.sin(a + d) * r];
  ctx.strokeStyle = '#2d4730'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(...pol(29, -0.5)); ctx.quadraticCurveTo(...pol(22, -0.25), ...pol(15, -0.3)); ctx.stroke();
  for (const [r, d] of [[24, -0.38], [25, -0.3]]) line(pol(r, d - 0.02), pol(r, d + 0.02));
  ctx.fillStyle = '#2d4730'; for (const [r, d, e] of [[25, -0.2, 0.25], [21, -0.12, 0.3], [27, 0.0, 0.22]]) { const p0 = pol(r, d), p1 = pol(r + 2, d + e); ctx.beginPath(); ctx.moveTo(...p0); ctx.quadraticCurveTo(p1[0] + 2, p1[1] - 2, p1[0], p1[1]); ctx.quadraticCurveTo(p1[0] - 2, p1[1] + 2, ...p0); ctx.fill(); }
  ctx.fillStyle = '#c8321e'; const st = pol(24, 0.5); ctx.fillRect(st[0] - 1.8, st[1] - 1.8, 3.6, 3.6);
};
SKIN_WEAP.fox_fan = W => {   // 狐火：一面圆圆的火光扇面，上面三片狐火三角一直在转，转过的地方留下三道重影
  const { g, live, T } = W, spin = T * 7 * W.pf, R = 31;
  const tri = b => { const pt = (d, r) => [g[0] + Math.cos(b + d * W.pf) * r, g[1] + Math.sin(b + d * W.pf) * r]; return [pt(-0.75, 13), pt(0.1, R), pt(0.5, 7)]; };
  const fillTri = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.closePath(); ctx.fill(); };
  W.bar(W.hl, g, 3.4, '#3a1a14');
  if (W.o) return;
  if (live) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,120,60,0.3)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(g[0], g[1], R, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,225,190,0.85)'; ctx.lineWidth = 1.1; ctx.stroke();
    for (const [k, a] of [[3, 0.3], [2, 0.5], [1, 0.75]]) for (let i = 0; i < 3; i++) fillTri(tri(spin + i * 2.094 - k * 0.5 * W.pf), `rgba(255,${120 + k * 20},70,${a})`);   // 重影：越旧越淡
    ctx.restore();
  }
  for (let i = 0; i < 3; i++) { const pts = tri(spin + i * 2.094); fillTri(pts, W.flash ? '#fff' : W.lg(pts[2], pts[1], [[0, '#fff8ee'], [0.5, '#ffb07a'], [1, '#ff4a1a']])); }
  if (!live) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) W.glow(tri(spin + i * 2.094)[1], 7, '255,150,70', 0.6);
  ctx.restore();
  const sw = Math.sin(T * 3.5) * 2.5, k0 = W.hl; ctx.strokeStyle = '#ff4a2a'; ctx.lineWidth = 1.5;
  for (const d of [0, 2.2]) { ctx.beginPath(); ctx.moveTo(k0[0], k0[1]); ctx.quadraticCurveTo(k0[0] - W.ux * 4 + d, k0[1] + 6, k0[0] - W.ux * 3 + sw + d, k0[1] + 14 - d); ctx.stroke(); }
};
// ---------- 拳套：雷鸣 ----------
function fistPlates(W, fn) {
  const sk = W.sk;
  for (const [h, sz] of [[sk.hf, 1], [sk.hb, 0.92]]) {
    let dx = h[0] - sk.sh[0], dy = h[1] - sk.sh[1]; const dl = Math.hypot(dx, dy); if (dl < 2) { dx = sk.face; dy = 0; } else { dx /= dl; dy /= dl; }
    const n = [-dy, dx], Q = (a, b) => [h[0] + dx * a * sz + n[0] * b * sz, h[1] + dy * a * sz + n[1] * b * sz];
    fn(Q, h, sz);
  }
}
SKIN_WEAP.violet_gauntlet = W => {   // 紫电：棱角分明的紫铁拳套，拳面刻着雷纹，周围噼啪跳电
  fistPlates(W, (Q, h) => {
    W.poly([Q(7, 6.5), Q(7, -6.5), Q(-5, -5.5), Q(-6, 0), Q(-5, 5.5)], '#4a2a8a');
    if (!W.live) return;
    ctx.fillStyle = '#d8c4ff'; for (const b of [-4, 0, 4]) circle(Q(6.2, b), 1.3);
    ctx.strokeStyle = '#e6d8ff'; ctx.lineWidth = 1.2; ctx.beginPath(); for (const [a, b] of [[3, -3], [0.5, 1], [-0.5, -1], [-3, 3]]) ctx.lineTo(...Q(a, b)); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(200,170,255,0.85)'; ctx.lineWidth = 1;
    const ph = Math.floor(W.T * 14); for (let k = 0; k < 2; k++) { const an = Math.sin(ph * 12.9898 + k * 78.233 + h[0]) * 3.14; zigzag(Q(2, 0), [h[0] + Math.cos(an) * 15, h[1] + Math.sin(an) * 15], 4, 3); }
    ctx.globalCompositeOperation = 'source-over';
  });
};
SKIN_WEAP.sun_gauntlet = W => {   // 烈阳：赤铜拳套，拳面往前窜三道火舌
  fistPlates(W, (Q, h, sz) => {
    if (W.live) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const b of [-4, 0, 4]) { const fl = 8 + Math.sin(W.T * 24 + b + h[1]) * 3 - Math.abs(b) * 0.4, f0 = Q(6, b - 2.4), f1 = Q(6, b + 2.4), tp = Q(6 + fl, b * 1.3); ctx.fillStyle = W.lg(Q(6, b), tp, [[0, 'rgba(255,220,120,0.9)'], [1, 'rgba(255,80,20,0)']]); ctx.beginPath(); ctx.moveTo(...f0); ctx.quadraticCurveTo(...Q(6 + fl * 0.5, b - 3), ...tp); ctx.quadraticCurveTo(...Q(6 + fl * 0.5, b + 3), ...f1); ctx.fill(); }
      ctx.restore();
    }
    W.poly([Q(7, 6), Q(7, -6), Q(-5, -6), Q(-6, 0), Q(-5, 6)], '#c0501a');
    if (!W.live) return;
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.2; line(Q(6.5, -5.5), Q(6.5, 5.5)); line(Q(-1, -5.6), Q(-1, 5.6));
  });
};
SKIN_WEAP.vajra_gauntlet = W => {   // 金刚：金拳套，拳前三股金刚杵尖
  fistPlates(W, Q => {
    W.poly([Q(6, 6), Q(6, -6), Q(-5, -5.5), Q(-6, 0), Q(-5, 5.5)], '#e8a41a');
    const tip = Q(16, 0);
    for (const b of [-1, 1]) W.fillWith(() => { ctx.moveTo(...Q(6, b * 5.5)); ctx.quadraticCurveTo(...Q(12, b * 7.5), ...tip); ctx.quadraticCurveTo(...Q(11, b * 4.5), ...Q(6, b * 2.5)); }, '#ffcc4a');
    W.poly([Q(6, -1.4), tip, Q(6, 1.4)], '#fff0b0');
    if (!W.live) return;
    ctx.strokeStyle = 'rgba(120,60,0,0.8)'; ctx.lineWidth = 1; line(Q(5.5, -5.5), Q(5.5, 5.5)); line(Q(0, -5.8), Q(0, 5.8));
  });
};
// ---------- 笔：墨羽 ----------
function brushTip(W, col) { const { At, t } = W; W.fillWith(() => { ctx.moveTo(...At(t, -12, -3.4)); ctx.quadraticCurveTo(...At(t, -2, -6.8), ...At(t, 2.5)); ctx.quadraticCurveTo(...At(t, -2, 6.8), ...At(t, -12, 3.4)); }, col); }
SKIN_WEAP.cinnabar_brush = W => {   // 朱砂：朱漆笔杆，笔头蘸满朱砂往下滴，杆上系一道黄符
  const { At, t, hl, bar, live, T } = W;
  bar(hl, At(t, -11), 4.2, '#9a2016');
  brushTip(W, W.lg(At(t, -12), At(t, 2), [[0, '#6a1008'], [1, '#e8402a']]));
  bar(At(t, -14), At(t, -11.5), 5.2, '#e8c45a');
  if (!live) return;
  const dp = (T * 1.4) % 1; ctx.fillStyle = `rgba(220,50,30,${1 - dp})`; circle([t[0], t[1] + 4 + dp * 10], 1.5);
  const s0 = At(hl, 9, 0), sw = Math.sin(T * 3) * 0.12;
  ctx.save(); ctx.translate(s0[0], s0[1]); ctx.rotate(sw); ctx.fillStyle = '#f2d04a'; ctx.fillRect(-2.6, 0, 5.2, 15);
  ctx.strokeStyle = '#c8321e'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(-1.4, 5); ctx.lineTo(1.4, 7.5); ctx.lineTo(-1.4, 10); ctx.lineTo(0, 13); ctx.stroke(); ctx.restore();
};
SKIN_WEAP.gold_brush = W => {   // 泥金：金杆，笔斗是三片金莲瓣，笔头是一团金箔，闪着光
  const { At, t, hl, bar, live, T } = W;
  bar(hl, At(t, -11), 4.2, '#c8a040');
  brushTip(W, W.lg(At(t, -12), At(t, 2), [[0, '#b88a20'], [0.6, '#f5d870'], [1, '#fff6dc']]));
  for (const b of [-1, 0, 1]) W.leaf(At(t, -17, b * 1.5), At(t, -9, b * 5), 2.2, '#e8c45a');
  if (!live) return;
  ctx.strokeStyle = 'rgba(120,80,10,0.6)'; ctx.lineWidth = 0.8; for (const s of [0.2, 0.45]) { const q = [hl[0] + (t[0] - hl[0]) * s, hl[1] + (t[1] - hl[1]) * s]; line(At(q, 0, -2.2), At(q, 0, 2.2)); }
  ctx.globalCompositeOperation = 'lighter';
  for (const [k, s, w] of [[0, -6, 8], [1, 2, -7], [2, -14, -6]]) { const tw = Math.max(0, Math.sin(T * 4 + k * 2.1)); if (tw > 0.1) glint(...At(t, s, w), 2 + tw * 3, '255,225,140', tw * 0.9); }
};
SKIN_WEAP.star_brush = W => {   // 星墨：夜蓝笔杆缀着星点，笔头从深蓝渐到亮青，笔尖边上星光一明一灭
  const { At, t, hl, bar, live, T } = W;
  bar(hl, At(t, -11), 4.2, '#1c2c5a');
  brushTip(W, W.lg(At(t, -12), At(t, 2.5), [[0, '#0d1838'], [0.55, '#2f7ad8'], [1, '#e0f6ff']]));
  bar(At(t, -14), At(t, -11.5), 5, '#4facfe');
  if (!live) return;
  ctx.fillStyle = 'rgba(220,240,255,0.9)'; for (const s of [0.15, 0.32, 0.5, 0.66]) circle([hl[0] + (t[0] - hl[0]) * s, hl[1] + (t[1] - hl[1]) * s], 0.8);
  ctx.globalCompositeOperation = 'lighter';
  for (const [k, s, w] of [[0, 4, 6], [1, -4, -8], [2, 8, -3]]) { const tw = Math.max(0, Math.sin(T * 3 + k * 2.3)); if (tw > 0.1) glint(...At(t, s, w), 2 + tw * 3.5, '140,210,255', tw); }
};
// ---------- 月刃：月华 ----------
function moonCrescent(W, R, col, jag) {
  const { At, t } = W, c = At(t, -6), a = Math.atan2(W.uy, W.ux), c2 = At(c, -3.2);
  W.fillWith(() => {
    if (jag) { for (let i = 0; i <= 12; i++) { const b = a - 2.2 + i * 4.4 / 12, r = R + (i % 2 ? 2.6 : 0); ctx.lineTo(c[0] + Math.cos(b) * r, c[1] + Math.sin(b) * r); } }
    else ctx.arc(c[0], c[1], R, a - 2.2, a + 2.2);
    ctx.arc(c2[0], c2[1], R - 1.2, a + 2.32, a - 2.32, true);
  }, col);
  return [c, a];
}
function moonBlade(W, col, hilt) { const { P, t } = W; W.bar(W.hl, W.g, 4.5, hilt); W.poly([P(0, -2), P(0.86, -1.7), t, P(0.86, 1.7), P(0, 2)], col); }
SKIN_WEAP.sakura_moon = W => {   // 樱月：粉白月刃，护手开一朵樱花
  moonBlade(W, '#ffe6f0', '#7a3050');
  const [c, a] = moonCrescent(W, 11, W.lg(W.At(W.t, -14), W.At(W.t, 6), [[0, '#ff8ab8'], [1, '#fff2f8']]));
  if (!W.live) return;
  W.flower(W.g, 2.6, '#ff9ec4', '#fff0a0');
  ctx.strokeStyle = 'rgba(220,90,140,0.8)'; ctx.lineWidth = 0.9; line(W.P(0.05), W.P(0.85));
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(c[0], c[1], 9.6, a - 1.2, a + 1.2); ctx.stroke();
};
SKIN_WEAP.eclipse_moon = W => {   // 月蚀：漆黑月刃，只有边上一圈血红的日冕
  moonBlade(W, '#140e1c', '#2a0a14');
  const [c, a] = moonCrescent(W, 11.5, W.lg(W.At(W.t, -16), W.At(W.t, 6), [[0, '#100a16'], [0.6, '#3a0a18'], [1, '#7a1424']]));
  if (!W.live) return;
  ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(c[0], c[1], 11.5, a - 2.1, a + 2.1); ctx.stroke();
  ctx.lineWidth = 0.9; line(W.P(0.02, 1.7), W.P(0.86, 1.6));
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(230,70,90,${0.25 + 0.12 * Math.sin(W.T * 3)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(c[0], c[1], 12.5, a - 1.4, a + 1.4); ctx.stroke();
};
SKIN_WEAP.frost_moon = W => {   // 霜华：冰晶月刃，外沿结满冰牙
  moonBlade(W, 'rgba(226,244,255,0.95)', '#4878a8');
  const [c, a] = moonCrescent(W, 10.5, W.lg(W.At(W.t, -14), W.At(W.t, 8), [[0, '#9fd8ff'], [1, '#f4fbff']]), true);
  if (!W.live) return;
  ctx.strokeStyle = 'rgba(110,170,230,0.8)'; ctx.lineWidth = 0.9; line(W.P(0.05), W.P(0.85));
  const tw = 0.5 + 0.5 * Math.sin(W.T * 4); glint(c[0] + Math.cos(a) * 12, c[1] + Math.sin(a) * 12, 2.5 + tw * 2, '200,240,255', 0.5 + tw * 0.4);
};
// ---------- 羽刃：燕翎 ----------
function featherVane(W, bulge, inner, n, edgeFn) {
  const { g, t, px, py } = W, m = [(g[0] + t[0]) / 2, (g[1] + t[1]) / 2], c1 = [m[0] + px * bulge, m[1] + py * bulge], c2 = [m[0] - px * inner, m[1] - py * inner];
  const bz = (c, u) => [(1 - u) * (1 - u) * g[0] + 2 * (1 - u) * u * c[0] + u * u * t[0], (1 - u) * (1 - u) * g[1] + 2 * (1 - u) * u * c[1] + u * u * t[1]];
  const outer = []; for (let i = 0; i <= n; i++) { const u = i / n, p = bz(c1, u), e = edgeFn ? edgeFn(i, u) : 0; outer.push([p[0] + px * e, p[1] + py * e]); }
  return { outer, c2, bz, c1 };
}
SKIN_WEAP.raven_feather = W => {   // 玄羽：乌鸦黑羽刃，外沿一道道羽缝，泛着蓝紫的光泽
  W.bar(W.hl, W.g, 4, '#20202a');
  const V = featherVane(W, 11, 2.5, 12, i => (i % 3 === 1 && i < 11 ? -2.6 : 0));
  W.fillWith(() => { ctx.moveTo(...W.g); for (const q of V.outer) ctx.lineTo(q[0], q[1]); ctx.quadraticCurveTo(V.c2[0], V.c2[1], ...W.g); }, '#1c1c26');
  if (!W.live) return;
  ctx.strokeStyle = '#8a8aa6'; ctx.lineWidth = 1; line(W.g, W.t);
  ctx.strokeStyle = 'rgba(120,140,230,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let i = 1; i < 11; i++) { const p = V.bz(V.c1, i / 12); ctx.lineTo(p[0] - W.px * 2.5, p[1] - W.py * 2.5); } ctx.stroke();
};
SKIN_WEAP.phoenix_feather = W => {   // 凤羽：赤金凤翎，外沿一排火舌在跳
  W.bar(W.hl, W.g, 4, '#6a1a08');
  const V = featherVane(W, 11, 2.5, 10, (i, u) => (i % 2 && i < 10 ? 3 + Math.sin(W.T * 20 + i) * 1.4 : 0) * Math.sin(Math.PI * u));
  W.fillWith(() => { ctx.moveTo(...W.g); for (const q of V.outer) ctx.lineTo(q[0], q[1]); ctx.quadraticCurveTo(V.c2[0], V.c2[1], ...W.g); }, W.lg(W.g, W.t, [[0, '#d8340e'], [0.55, '#ffa03a'], [1, '#fff2c0']]));
  if (!W.live) return;
  ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 1.1; line(W.g, W.t);
  ctx.globalCompositeOperation = 'lighter'; W.glow(W.t, 8, '255,170,60', 0.45);
};
SKIN_WEAP.owl_feather = W => {   // 雪鸮：宽圆的雪白鸮羽，横着几道灰斑
  W.bar(W.hl, W.g, 4, '#385878');
  const V = featherVane(W, 13, 4, 12);
  W.fillWith(() => { ctx.moveTo(...W.g); for (const q of V.outer) ctx.lineTo(q[0], q[1]); ctx.quadraticCurveTo(V.c2[0], V.c2[1], ...W.g); }, '#f2f8ff');
  if (!W.live) return;
  ctx.strokeStyle = 'rgba(70,90,120,0.6)'; ctx.lineWidth = 1.6;
  for (const u of [0.3, 0.45, 0.6, 0.75]) { const p = V.bz(V.c1, u), q = [W.g[0] + (W.t[0] - W.g[0]) * u, W.g[1] + (W.t[1] - W.g[1]) * u]; line([q[0] + (p[0] - q[0]) * 0.25, q[1] + (p[1] - q[1]) * 0.25], [q[0] + (p[0] - q[0]) * 0.8, q[1] + (p[1] - q[1]) * 0.8]); }
  ctx.strokeStyle = 'rgba(120,180,230,0.8)'; ctx.lineWidth = 0.9; line(W.g, W.t);
};
// ---------- 箫：玉箫 ----------
function fluteBody(W, col, bands, bandC) {
  const { hl, t } = W, F = (s, w = 0) => [hl[0] + (t[0] - hl[0]) * s + W.px * w, hl[1] + (t[1] - hl[1]) * s + W.py * w];
  W.bar(hl, t, 4.6, col);
  if (W.live) { ctx.strokeStyle = bandC; ctx.lineWidth = 2; for (const s of bands) line(F(s, -2.8), F(s, 2.8)); ctx.fillStyle = 'rgba(30,40,60,0.8)'; for (let k = 0.42; k < 0.9; k += 0.12) circle(F(k), 1.1); }
  return F;
}
SKIN_WEAP.snow_flute = W => {   // 雪箫：白玉箫，冰蓝箍，穗子底下坠一枚雪花
  const F = fluteBody(W, '#f4fbff', [0.12, 0.92], '#9fd8ff');
  if (!W.live) return;
  const sw = Math.sin(W.T * 3.4) * 3, k0 = W.hl, end = [k0[0] - W.ux * 4 + sw, k0[1] + 15];
  ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(...k0); ctx.quadraticCurveTo(k0[0] - W.ux * 5, k0[1] + 8, ...end); ctx.stroke();
  ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = 1.1; for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3 + W.T; line([end[0] + Math.cos(a) * 3.6, end[1] + Math.sin(a) * 3.6], [end[0] - Math.cos(a) * 3.6, end[1] - Math.sin(a) * 3.6]); }
};
SKIN_WEAP.bell_flute = W => {   // 钧天：金箫，三道金箍，穗子上挂两只小金铃
  const F = fluteBody(W, '#f2d27a', [0.1, 0.5, 0.9], '#a8761e');
  if (!W.live) return;
  const sw = Math.sin(W.T * 3.4) * 3, k0 = W.hl;
  ctx.strokeStyle = '#c8321e'; ctx.lineWidth = 1.4;
  for (const [d, ln] of [[0, 13], [3, 9]]) {
    const end = [k0[0] - W.ux * 4 + sw + d, k0[1] + ln]; ctx.beginPath(); ctx.moveTo(...k0); ctx.lineTo(...end); ctx.stroke();
    ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.moveTo(end[0] - 1.6, end[1]); ctx.lineTo(end[0] + 1.6, end[1]); ctx.lineTo(end[0] + 3, end[1] + 4.2); ctx.lineTo(end[0] - 3, end[1] + 4.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a5a10'; circle([end[0], end[1] + 4.6], 0.9);
  }
};
// ---------- 葫芦：醉翁 ----------
function gourdParts(W) {
  const sk = W.sk, up = sk.hb[1] < sk.neck[1] + 4, gp = up ? [sk.hb[0] + sk.face * 6, sk.hb[1] - 2] : [sk.hb[0], sk.hb[1] + 10];
  const top = up ? [gp[0] + sk.face * 5, gp[1] - 4] : [gp[0], gp[1] - 5], bot = up ? [gp[0] - sk.face * 6, gp[1] + 6] : [gp[0], gp[1] + 7];
  if (W.o) { ctx.fillStyle = W.L.outline; circle(sk.hf, 8); circle(top, 7.5); circle(bot, 10.5); return null; }
  ctx.fillStyle = W.flash ? '#fff' : '#e8d2a6'; circle(sk.hf, 6);
  return { top, bot, mid: [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2] };
}
SKIN_WEAP.amber_gourd = W => {   // 琥珀：半透明的琥珀葫芦，里面晃着酒，腰上缠一圈青藤
  const G = gourdParts(W); if (!G) return;
  const { top, bot, mid } = G;
  const fillG = (c, r) => { const q = ctx.createRadialGradient(c[0] - r * 0.3, c[1] - r * 0.3, 1, c[0], c[1], r); q.addColorStop(0, '#ffe2a0'); q.addColorStop(0.6, '#f0a030'); q.addColorStop(1, '#a8580e'); ctx.fillStyle = W.flash ? '#fff' : q; circle(c, r); };
  fillG(bot, 8.5); fillG(top, 5.5);
  if (!W.live) return;
  ctx.save(); ctx.beginPath(); ctx.arc(bot[0], bot[1], 8.5, 0, 7); ctx.clip(); ctx.fillStyle = 'rgba(150,60,8,0.55)'; ctx.fillRect(bot[0] - 9, bot[1] + 1.5 + Math.sin(W.T * 4) * 1.2, 18, 9); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; circle([bot[0] - 3, bot[1] - 3], 2);
  ctx.strokeStyle = '#3f7a2a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(mid[0] - 4, mid[1] - 1); ctx.quadraticCurveTo(mid[0], mid[1] + 3, mid[0] + 4, mid[1] - 1); ctx.stroke();
  ctx.fillStyle = '#5aa83a'; W.leaf([mid[0] + 3, mid[1] - 1], [mid[0] + 9, mid[1] + 2], 2.2, '#5aa83a');
};
SKIN_WEAP.jade_gourd = W => {   // 酒剑仙：青玉葫芦刻着云纹，葫芦口飘出一缕仙气
  const G = gourdParts(W); if (!G) return;
  const { top, bot, mid } = G;
  const fillG = (c, r) => { const q = ctx.createRadialGradient(c[0] - r * 0.3, c[1] - r * 0.3, 1, c[0], c[1], r); q.addColorStop(0, '#d8fff6'); q.addColorStop(0.6, '#50d8c8'); q.addColorStop(1, '#1a7a78'); ctx.fillStyle = W.flash ? '#fff' : q; circle(c, r); };
  fillG(bot, 8.5); fillG(top, 5.5);
  if (!W.live) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.9;
  for (const [ox, oy, r] of [[-2, 1, 2.6], [3, 3, 2]]) { ctx.beginPath(); ctx.arc(bot[0] + ox, bot[1] + oy, r, 3.4, 6.6); ctx.stroke(); ctx.beginPath(); ctx.arc(bot[0] + ox + r * 0.5, bot[1] + oy, r * 0.5, 3.1, 6.3); ctx.stroke(); }
  ctx.fillStyle = W.L.scarf || '#38e8ff'; ctx.fillRect(mid[0] - 3, mid[1] - 1, 6, 2.2);
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) { const u = (W.T * 0.7 + k / 3) % 1, p = [top[0] + Math.sin(u * 6 + k) * 4, top[1] - 5 - u * 16]; ctx.fillStyle = `rgba(150,240,255,${0.35 * (1 - u)})`; circle(p, 2.5 + u * 3); }
};
// ---------- 流星锤：勾陈（链子和锤头的物理还是原来那套，这里只换颜色和锤头花样） ----------
const HAMMER_LOOK = {
  crimson_hammer: { chain: ['#6a2a22', '#b0503a'], head: '#4a1610', band: '#ff6a2a', crack: '255,120,50', spikes: '#2a0c08' },
  underworld_hammer: { chain: ['#4a2a7a', '#b48cff'], head: '#2a1840', band: '#a855f7', crack: '185,105,255', ghost: true },
};
function weapon(sk, L, outline, flash) {
  const g = sk.guard, t = sk.tip, hl = sk.hilt;
  const dx = t[0] - g[0], dy = t[1] - g[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, px = -uy, py = ux;
  const blade = flash ? '#fff' : L.blade;
  const ws = (L.deco && L.deco.weapStyle) || '';
  ctx.lineCap = 'round';
  if (ws && L.weapon !== 'hammer' && skinWeapon(ws, sk, L, outline, flash)) return;
  const guardBar = (w, col = L.metal || '#d9b36a') => { ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(g[0] - px * w, g[1] - py * w); ctx.lineTo(g[0] + px * w, g[1] + py * w); ctx.stroke(); };
  switch (L.weapon) {
    case 'fists':
      if (outline) { ctx.fillStyle = L.outline; circle(sk.hf, 8.5); circle(sk.hb, 8); }
      else {
        ctx.fillStyle = flash ? '#fff' : L.metal || '#c9a24a';
        circle(sk.hf, 6.5); circle(sk.hb, 6);
        ctx.fillStyle = `rgb(${L.slash})`; circle(sk.hf, 3.2); circle(sk.hb, 2.8);
      }
      return;
    case 'spear': {
      const back = [g[0] - ux * 36, g[1] - uy * 36];
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 6.5; line(back, t); return; }
      ctx.strokeStyle = L.haft || '#6a4a2e';
      ctx.lineWidth = 3.2; line(back, [t[0] - ux * 15, t[1] - uy * 15]);
      ctx.fillStyle = blade; ctx.beginPath(); ctx.moveTo(t[0], t[1]);
      const wid = 4.5;
      ctx.lineTo(t[0] - ux * 18 + px * wid, t[1] - uy * 18 + py * wid);
      ctx.lineTo(t[0] - ux * 14, t[1] - uy * 14);
      ctx.lineTo(t[0] - ux * 18 - px * wid, t[1] - uy * 18 - py * wid);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = L.fx ? L.scarf : '#d9383a';
      ctx.beginPath(); ctx.arc(t[0] - ux * 19, t[1] - uy * 19, 3.8, 0, 7); ctx.fill();
      return;
    }
    case 'greatsword': {
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 11.5; line(hl, t); return; }
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 5; line(hl, g);
      const b0 = [g[0] + px * 4.5, g[1] + py * 4.5], b1 = [g[0] - px * 4.5, g[1] - py * 4.5];
      const t0 = [t[0] - ux * 8 + px * 4, t[1] - uy * 8 + py * 4];
      const t1 = [t[0] - ux * 8 - px * 4, t[1] - uy * 8 - py * 4];
      ctx.fillStyle = blade; ctx.beginPath();
      ctx.moveTo(b0[0], b0[1]); ctx.lineTo(t0[0], t0[1]); ctx.lineTo(t[0], t[1]); ctx.lineTo(t1[0], t1[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${L.slash},0.75)`; ctx.lineWidth = 2.2; line(g, [t[0] - ux * 6, t[1] - uy * 6]);
      guardBar(11);
      return;
    }
    case 'fan': {
      if (outline) { ctx.fillStyle = L.outline; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.arc(g[0], g[1], 34, Math.atan2(uy, ux) - 0.75, Math.atan2(uy, ux) + 0.75); ctx.closePath(); ctx.fill(); return; }
      ctx.fillStyle = flash ? '#fff' : '#f3efe2'; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.arc(g[0], g[1], 31, Math.atan2(uy, ux) - 0.7, Math.atan2(uy, ux) + 0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${L.slash},0.85)`; ctx.lineWidth = 1.3;
      for (let i = -3; i <= 3; i++) { const a = Math.atan2(uy, ux) + i * 0.2; line(g, [g[0] + Math.cos(a) * 30, g[1] + Math.sin(a) * 30]); }
      return;
    }
    case 'brush':
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 7; line(hl, t); ctx.fillStyle = L.outline; circle(t, 8); return; }
      ctx.strokeStyle = L.haft || '#8a5a34'; ctx.lineWidth = 4.2; line(hl, [t[0] - ux * 10, t[1] - uy * 10]);
      ctx.fillStyle = L.fx ? L.blade : '#0c0c10';
      ctx.beginPath(); ctx.ellipse(t[0] - ux * 4, t[1] - uy * 4, 9.5, 5.2, Math.atan2(uy, ux), 0, 7); ctx.fill();
      return;
    case 'dual': {
      const b2 = [sk.hb[0] + ux * 38, sk.hb[1] + uy * 38];
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 6.2; line(hl, t); line(sk.hb, b2); return; }
      ctx.strokeStyle = blade; ctx.lineWidth = 3.0; line(g, t); line(sk.hb, b2);
      ctx.strokeStyle = `rgba(${L.slash},0.75)`; ctx.lineWidth = 1.2; line(g, t);
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 4; line(hl, g);
      return;
    }
    case 'wing': {  // 羽刃：弯弯的一片
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 7; line(hl, t); return; }
      ctx.fillStyle = blade; ctx.beginPath(); ctx.moveTo(g[0], g[1]);
      ctx.quadraticCurveTo((g[0] + t[0]) / 2 + px * 10, (g[1] + t[1]) / 2 + py * 10, t[0], t[1]);
      ctx.quadraticCurveTo((g[0] + t[0]) / 2 - px * 2, (g[1] + t[1]) / 2 - py * 2, g[0], g[1]); ctx.fill();
      ctx.strokeStyle = `rgba(${L.slash},0.7)`; ctx.lineWidth = 1; line(g, t);
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 4; line(hl, g);
      return;
    }
    case 'flute': {  // 玉箫：一管青玉，几个音孔，尾挂红穗
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 7; line(hl, t); return; }
      ctx.strokeStyle = flash ? '#fff' : L.blade; ctx.lineWidth = 4.4; line(hl, t);
      ctx.strokeStyle = 'rgba(20,60,40,0.35)'; ctx.lineWidth = 1.2; line([hl[0] + px * 1.4, hl[1] + py * 1.4], [t[0] + px * 1.4, t[1] + py * 1.4]);
      ctx.fillStyle = 'rgba(20,50,36,0.85)';
      for (let k = 0.4; k < 0.92; k += 0.13) circle([hl[0] + (t[0] - hl[0]) * k, hl[1] + (t[1] - hl[1]) * k], 1.1);
      ctx.strokeStyle = L.scarf || '#c8372e'; ctx.lineWidth = 1.8;
      const sway = Math.sin(clock * 4) * 3;
      line(hl, [hl[0] - ux * 4 + sway, hl[1] - uy * 4 + 12]); line(hl, [hl[0] - ux * 4 + sway + 3, hl[1] - uy * 4 + 11]);
      return;
    }
    case 'gourd': {  // 醉仙：缠布的拳头，另一只手拎着酒葫芦
      const up = sk.hb[1] < sk.neck[1] + 4, gp = up ? [sk.hb[0] + sk.face * 6, sk.hb[1] - 2] : [sk.hb[0], sk.hb[1] + 10];
      const top = up ? [gp[0] + sk.face * 5, gp[1] - 4] : [gp[0], gp[1] - 5], bot = up ? [gp[0] - sk.face * 6, gp[1] + 6] : [gp[0], gp[1] + 7];
      if (outline) { ctx.fillStyle = L.outline; circle(sk.hf, 8); circle(top, 7.5); circle(bot, 10.5); return; }
      ctx.fillStyle = flash ? '#fff' : '#e8d2a6'; circle(sk.hf, 6);
      ctx.strokeStyle = 'rgba(120,80,40,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sk.hf[0], sk.hf[1], 4, 0.4, 2.6); ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : L.metal || '#c98a3a'; circle(bot, 8.5); circle(top, 5.5);
      ctx.fillStyle = L.scarf || '#d8452f'; circle([(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2], 2.4);
      ctx.fillStyle = 'rgba(255,255,255,0.26)'; circle([bot[0] - 3, bot[1] - 3], 2.4);
      return;
    }
    case 'hammer': {  // 勾陈：一条铁链拴着方锤（流星锤），锤头按物理甩动
      const fl = flailSim(sk, L, outline), P = fl.p, n = P.length, hd = P[n - 1], pv = P[n - 2];
      const showHead = L.flMode !== 'ult', ang = Math.atan2(hd[1] - pv[1], hd[0] - pv[0]);
      const head = (fill, w, h, ox) => { ctx.save(); ctx.translate(hd[0], hd[1]); ctx.rotate(ang); ctx.fillStyle = fill; ctx.fillRect(ox, -h / 2, w, h); ctx.restore(); };
      const HS = HAMMER_LOOK[ws];
      const spikes = (fill, grow) => {   // 赤锤：锤头四角和前面长着铁刺
        ctx.save(); ctx.translate(hd[0], hd[1]); ctx.rotate(ang); ctx.fillStyle = fill; ctx.beginPath();
        for (const [x, y, ax, ay] of [[17, 13.5, 1, 1], [17, -13.5, 1, -1], [3, 13.5, -0.4, 1], [3, -13.5, -0.4, -1], [17, 0, 1, 0]]) {
          const l = 7 + grow, nx = -ay, ny = ax, w = 3.2 + grow * 0.5; ctx.moveTo(x + nx * w, y + ny * w); ctx.lineTo(x + ax * l, y + ay * l); ctx.lineTo(x - nx * w, y - ny * w);
        }
        ctx.fill(); ctx.restore();
      };
      if (outline) {
        if (showHead && HS && HS.spikes) spikes(L.outline, 2);
        ctx.strokeStyle = L.outline; ctx.lineWidth = 4.6; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let k = 1; k < n; k++) ctx.lineTo(P[k][0], P[k][1]); ctx.stroke();
        if (showHead) { head(L.outline, 21, 31, -2); head(L.outline, 12, 8, -10); }
        return;
      }
      if (L.flMode === 'spin') {   // 抡圆的锤风
        ctx.save(); ctx.strokeStyle = 'rgba(' + L.slash + ',0.28)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(P[0][0], P[0][1], fl.len, fl.len * 0.36, 0, 0, 7); ctx.stroke(); ctx.restore();
      }
      if (HS && HS.ghost && !flash) {   // 冥狱：链子和锤头罩着一层紫色鬼火
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${HS.crack},0.28)`; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let k = 1; k < n; k++) ctx.lineTo(P[k][0], P[k][1]); ctx.stroke();
        if (showHead) { const q = ctx.createRadialGradient(hd[0], hd[1], 2, hd[0], hd[1], 26); q.addColorStop(0, `rgba(${HS.crack},0.45)`); q.addColorStop(1, `rgba(${HS.crack},0)`); ctx.fillStyle = q; ctx.fillRect(hd[0] - 26, hd[1] - 26, 52, 52); }
        ctx.restore();
      }
      for (let k = 0; k < n - 1; k++) {   // 一节节铁链
        ctx.strokeStyle = HS ? HS.chain[k % 2] : k % 2 ? '#c4c8d2' : '#8a909e'; ctx.lineWidth = k % 2 ? 2.2 : 3; line(P[k], P[k + 1]);
      }
      ctx.fillStyle = '#5a5f6c'; for (let k = 1; k < n - 1; k += 2) circle(P[k], 1.6);
      if (showHead) {
        head('#3a2a1e', 9, 5, -9);                       // 锤颈
        if (HS && HS.spikes) spikes(flash ? '#fff' : HS.spikes, 0);
        head(flash ? '#fff' : HS ? HS.head : blade, 17, 27, 0);          // 锤头
        head('rgba(40,44,54,0.55)', 17, 5, 0);
        head(HS ? HS.band : L.scarf, 3, 27, 7);
        if (HS && !flash) {   // 锤面上的纹：赤锤是烧红的裂纹，冥狱是发光的符文
          ctx.save(); ctx.translate(hd[0], hd[1]); ctx.rotate(ang); ctx.lineCap = 'round';
          const a = 0.6 + 0.3 * Math.sin(clock * 4);
          ctx.strokeStyle = `rgba(${HS.crack},${a})`; ctx.lineWidth = 1.3; ctx.beginPath();
          if (HS.ghost) { ctx.moveTo(12, -9); ctx.lineTo(12, 9); ctx.moveTo(12, -5); ctx.lineTo(15.5, -8); ctx.moveTo(12, 2); ctx.lineTo(15.5, 6); ctx.moveTo(1.5, -4); ctx.lineTo(5, 0); ctx.lineTo(1.5, 4); }
          else { ctx.moveTo(1, -11); ctx.lineTo(5, -5); ctx.lineTo(3, 0); ctx.lineTo(6, 5); ctx.lineTo(4, 11); ctx.moveTo(5, -5); ctx.lineTo(12, -7); ctx.moveTo(6, 5); ctx.lineTo(13, 8); ctx.lineTo(16, 4); }
          ctx.stroke(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 3.5; ctx.strokeStyle = `rgba(${HS.crack},${a * 0.3})`; ctx.stroke(); ctx.restore();
        }
      }
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 4.5; line(hl, sk.hf);   // 手里一小截握把
      return;
    }
    case 'spindle': {  // 凌雀：双手子母飞梭，梭身牵引粉紫悬丝
      const b2 = [sk.hb[0] + ux * 34, sk.hb[1] + uy * 34];
      const spinDraw = (pt, ang) => {
        ctx.save(); ctx.translate(pt[0], pt[1]); ctx.rotate(ang);
        if (outline) { ctx.fillStyle = L.outline; ctx.beginPath(); ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
        ctx.fillStyle = blade; ctx.beginPath(); ctx.ellipse(0, 0, 14, 3.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = L.metal || '#e056b0'; ctx.fillRect(-3, -2, 6, 4);
        ctx.strokeStyle = `rgba(${L.slash},0.85)`; ctx.lineWidth = 1.2;
        line([-14, 0], [14, 0]);
        ctx.restore();
      };
      spinDraw(g, Math.atan2(uy, ux));
      spinDraw(sk.hb, Math.atan2(uy, ux));
      if (!outline) {
        ctx.strokeStyle = `rgba(${L.slash},0.75)`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sk.hf[0], sk.hf[1]); ctx.quadraticCurveTo((sk.hf[0] + sk.hb[0]) / 2, (sk.hf[1] + sk.hb[1]) / 2 + 8, sk.hb[0], sk.hb[1]); ctx.stroke();
      }
      return;
    }
    default: {  // sword / moonblade
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 6.2; line(hl, g); return; }
      ctx.strokeStyle = blade; ctx.lineWidth = 3.4; line(g, t);
      ctx.strokeStyle = `rgba(${L.slash},0.65)`; ctx.lineWidth = 1.5; line(g, t);
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 4.5; line(hl, g);
      guardBar(6);
      if (L.weapon === 'moonblade') { ctx.strokeStyle = blade; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(t[0] - ux * 6, t[1] - uy * 6, 10, Math.atan2(uy, ux) - 2.2, Math.atan2(uy, ux) + 2.2); ctx.stroke(); }
    }
  }
}
function hat(sk, grow) {
  const h = sk.head, nx = h[0] - sk.neck[0], ny = h[1] - sk.neck[1], nl = Math.hypot(nx, ny) || 1;
  const ux = nx / nl, uy = ny / nl, px = -uy, py = ux;
  const top = [h[0] + ux * (16 + grow), h[1] + uy * (16 + grow)];
  const bx = h[0] + ux * 3, by = h[1] + uy * 3, w = 24 + grow;
  ctx.fillStyle = grow ? ctx.fillStyle : (DRAW_F && DRAW_F.look.hatC) || '#5a3a2e';
  ctx.beginPath(); ctx.moveTo(bx + px * w, by + py * w); ctx.lineTo(top[0], top[1]); ctx.lineTo(bx - px * w, by - py * w); ctx.closePath(); ctx.fill();
}
function topknot(sk, grow, color) {
  const h = sk.head, nx = h[0] - sk.neck[0], ny = h[1] - sk.neck[1], nl = Math.hypot(nx, ny) || 1;
  const p = [h[0] + nx / nl * 10 - sk.face * 5, h[1] + ny / nl * 10];
  ctx.fillStyle = color; circle(p, 4.5 + grow);
}
// 燕翎的翅膀：飞行时张开扇动，平时收起
function drawWings(sk, f) {
  const open = f.flying ? 1 : (f.state === 'air' ? 0.45 : 0.15);
  const flap = f.flying ? Math.sin(clock * 22) * 0.5 : Math.sin(clock * 3) * 0.05;
  const base = [(sk.sh[0] + sk.neck[0]) / 2, (sk.sh[1] + sk.neck[1]) / 2 + 4], bk = -sk.face;
  for (const [layer, col] of [[1, f.look.shade], [0, f.look.body]]) {
    const len = 46 + 26 * open, ang = -0.4 - open * 0.9 + flap - layer * 0.25;
    ctx.fillStyle = col; ctx.strokeStyle = f.look.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(base[0], base[1]);
    for (let k = 0; k <= 5; k++) {
      const a = ang + k * (0.22 + 0.1 * open), r = len * (1 - k * 0.1);
      ctx.lineTo(base[0] + bk * Math.cos(a) * r, base[1] + Math.sin(a) * r);
      ctx.lineTo(base[0] + bk * Math.cos(a + 0.11) * r * 0.78, base[1] + Math.sin(a + 0.11) * r * 0.78);
    }
    ctx.closePath(); ctx.globalAlpha = f.look.outlineA; ctx.stroke(); ctx.globalAlpha = 1; ctx.fill();
    if (f.look.legend && f.look.fx) {   // 传说：羽翼从根部向羽尖渐亮，羽缘一道光
      const c = f.look.fx.c, c2 = f.look.fx.c2 || c, tip = [base[0] + bk * Math.cos(ang + 0.5) * len, base[1] + Math.sin(ang + 0.5) * len];
      const g = ctx.createLinearGradient(base[0], base[1], tip[0], tip[1]); g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.7, `rgba(${c},${0.35 + 0.1 * Math.sin(clock * 4)})`); g.addColorStop(1, `rgba(${c2},0.6)`);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = `rgba(${c},0.55)`; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
    }
  }
}
function drawScarf(f) {
  const s = f.scarf; if (s.length < 2) return;
  ctx.fillStyle = f.look.scarf;
  ctx.beginPath();
  const left = [], right = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const w = 4.2 * (1 - i / s.length) + 0.8;
    left.push([s[i].x - dy / d * w, s[i].y + dx / d * w]); right.push([s[i].x + dy / d * w, s[i].y - dx / d * w]);
  }
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.strokeStyle = f.look.outline; ctx.lineWidth = 3; ctx.globalAlpha = f.look.outlineA; ctx.stroke(); ctx.globalAlpha = 1; ctx.fill();
  if (f.look.legend && f.look.fx) skinScarf(f, left, right);
}
function drawTrail(f) {
  const tr = f.trail; if (tr.length < 2) return;
  if (f.look.fx && M.mode !== 'mayhem') return skinTrail(f, tr);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const mul = M.mode === 'mayhem' ? 2.4 : 1.15;
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i], al = Math.max(0, b.life);
    // 外层气韵柔光带
    if (a.h && b.h) {
      ctx.fillStyle = `rgba(${f.look.slash},${Math.min(0.42, 0.22 * al * mul)})`;
      ctx.beginPath(); ctx.moveTo(a.h[0], a.h[1]); ctx.lineTo(a.t[0], a.t[1]); ctx.lineTo(b.t[0], b.t[1]); ctx.lineTo(b.h[0], b.h[1]); ctx.closePath(); ctx.fill();
    }
    // 中层主锋芒缎带
    ctx.fillStyle = `rgba(${f.look.slash},${Math.min(1, 0.58 * al * mul)})`;
    ctx.beginPath(); ctx.moveTo(a.b[0], a.b[1]); ctx.lineTo(a.t[0], a.t[1]); ctx.lineTo(b.t[0], b.t[1]); ctx.lineTo(b.b[0], b.b[1]); ctx.closePath(); ctx.fill();
    // 内锋高亮刃尖线
    ctx.strokeStyle = M.mode === 'mayhem' ? `rgba(255,220,90,${0.96 * al})` : `rgba(255,255,255,${0.9 * al})`;
    ctx.lineWidth = (2.6 * al + 0.6) * (M.mode === 'mayhem' ? 2.5 : 1.15);
    ctx.beginPath(); ctx.moveTo(a.t[0], a.t[1]); ctx.lineTo(b.t[0], b.t[1]); ctx.stroke();
  }
  ctx.restore();
}
const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
const circle = (p, r) => { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); };
function drawParticles(glowOnly) {
  for (const p of particles) {
    if (glowOnly && (p.ng || !(p.type === 'spark' || p.type === 'slash' || p.type === 'ring' || p.type === 'glyph' || SKIN_GLOW_P[p.type]))) continue;   // ng：品质特效不进泛光；命中闪光本身就是一团柔光，再泛一遍就糊成一团白
    const k = clamp(p.life / p.max, 0, 1);
    if (p.type === 'spark') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${p.rgb},${k})`; ctx.lineWidth = p.w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); ctx.restore();
    } else if (p.type === 'ring') {
      ctx.strokeStyle = `rgba(${p.rgb},${k * 0.9})`; ctx.lineWidth = 3 * k + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.15 - k * 0.8), 0, Math.PI * 2); ctx.stroke();
    } else if (p.type === 'flash') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const R = p.r * 1.7, g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);   // 亮的只有中间一小团，外圈很快淡下去：击倒慢放时闪光停得久，整块白圆盘会把人盖住
      g.addColorStop(0, `rgba(255,255,255,${k})`); g.addColorStop(0.22, `rgba(255,255,255,${k * 0.55})`); g.addColorStop(0.55, `rgba(255,255,255,${k * 0.14})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2); ctx.restore();
    } else if (p.type === 'dmg') {
      const pop = 1 + Math.max(0, (p.life - p.max + 0.12) / 0.12) * 0.6;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.s * pop, p.s * pop);
      ctx.globalAlpha = Math.min(1, k * 2.5); ctx.font = `800 21px ${BODY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,8,20,0.85)'; ctx.strokeText(p.text, 0, 0);
      ctx.shadowColor = `rgba(${p.edge},0.9)`; ctx.shadowBlur = 10; ctx.fillStyle = `rgb(${p.rgb})`; ctx.fillText(p.text, 0, 0); ctx.restore();
    } else if (p.type === 'shape') {   // 皮肤碎片：雪花、花瓣、羽毛……（锦鲤朝着游的方向，蝴蝶基本立着、轻轻晃）
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.rotate(p.sh === 'koi' ? Math.atan2(p.vy || 0, p.vx || 1) : p.sh === 'butterfly' ? Math.sin(p.life * 7 + p.r * 5) * 0.35 : (p.spin || 0) * (p.max - p.life));
      if (WX_RISE[p.sh] || p.sh === 'spark') ctx.globalCompositeOperation = 'lighter';
      drawShape(p.sh, p.r, p.rgb, Math.min(1, k * 1.5)); ctx.restore();
    } else if (p.type === 'glyph') {   // 皮肤命中图案
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate((p.rot || 0) + (p.spin || 0) * (p.max - p.life));
      drawGlyph(p.g2, p.r * (0.55 + 0.6 * Math.sqrt(1 - k)), p.rgb, k * 0.95); ctx.restore();
    } else if (p.type === 'ink') {
      ctx.fillStyle = `rgba(${p.rgb},${k * 0.9})`; circle([p.x, p.y], p.r * (p.y >= 0 ? 1.3 : 1));
    } else if (p.type === 'text') {
      ctx.save(); ctx.font = `28px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = k; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const yy = p.y - (1 - k) * 30; ctx.strokeText(p.text, p.x, yy); ctx.fillStyle = `rgb(${p.rgb})`; ctx.fillText(p.text, p.x, yy); ctx.restore();
    } else if (p.type === 'callout') {
      const pop = 1 + Math.max(0, (p.life - p.max + 0.15) / 0.15) * 0.75;
      const sc = (p.scale || 2) * pop;
      ctx.save(); ctx.translate(p.x, p.y - (1 - k) * 22); ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = `900 36px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(8,6,12,0.92)'; ctx.strokeText(p.text, 0, 0);
      ctx.shadowColor = `rgba(${p.rgb},0.95)`; ctx.shadowBlur = 18;
      ctx.fillStyle = `rgb(${p.rgb})`; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    } else if (p.type === 'smoke') {
      ctx.fillStyle = `rgba(215,210,232,${k * 0.32})`; circle([p.x, p.y], p.r * (1.8 - k * 0.8));
    } else if (p.type === 'dust') {
      ctx.fillStyle = `rgba(200,190,230,${k * 0.18})`; circle([p.x, p.y], p.r * (1.6 - k * 0.6));
    } else if (p.type === 'slash') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate(p.ang);
      const len = p.len * (1.2 - k * 0.2);
      ctx.fillStyle = `rgba(${p.rgb},${k * 0.8})`;
      ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -7 * k, len / 2, 0); ctx.quadraticCurveTo(0, 7 * k, -len / 2, 0); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.fillRect(-len / 2, -0.8, len, 1.6);
      ctx.restore();
    } else drawSkinParticle(p, k);
  }
}
function drawComboTotals() {
  for (let i = 0; i < 2; i++) {
    const cu = comboUI[i], d = [A, B][1 - i], atk = [A, B][i];
    if (!d || d.hidden || cu.t <= 0 || cu.n < 2 || cu.dmg <= 0) continue;
    const a = clamp(cu.t / 0.5, 0, 1), pop = 1 + Math.max(0, cu.t - 1.25) * 2;
    ctx.save(); ctx.translate(d.x, d.y - 200 * (d.size || 1)); ctx.scale(pop, pop); ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 30px ${BODY_FONT}`; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,8,20,0.85)';
    const t = String(Math.round(cu.dmg));
    ctx.strokeText(t, 0, 0); ctx.shadowColor = `rgba(${atk.look.slash},0.95)`; ctx.shadowBlur = 16; ctx.fillStyle = '#ffe9b0'; ctx.fillText(t, 0, 0);
    ctx.shadowBlur = 0; ctx.font = `13px ${TITLE_FONT}`; ctx.lineWidth = 3.5; ctx.strokeText(`${cu.n} 连击`, 0, 24); ctx.fillStyle = `rgb(${atk.look.slash})`; ctx.fillText(`${cu.n} 连击`, 0, 24);
    ctx.restore();
  }
}
function drawProjs(glowOnly) {
  for (const p of projs) {
    if (glowOnly && (p.kind === 'dragon' || p.kind === 'trap' || p.kind === 'quake' || p.kind === 'pavilion' || p.kind === 'popcorn')) continue;
    const L = ([A, B, C, D][p.owner] || A).look;   // 2v2 里 C/D 的技能也会生成弹道，owner 可能是 2/3
    ctx.save();
    if (p.kind === 'popcorn') {   // 爆米花：落下时一小撮，半秒后噼啪炸开
      if (p.delay > 0) {
        const j = p.delay < 0.15 ? Math.sin(p.age * 90) * 2 : 0;   // 快炸的时候抖一抖
        for (let k = 0; k < 4; k++) {
          const a = p.seed + k * 1.7, x = p.x + Math.cos(a) * 7 + j, y = p.y + Math.sin(a) * 5;
          ctx.fillStyle = k % 2 ? '#fff6dc' : '#ffe9a8'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(214,150,60,0.8)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 1.5, 1.8, 0, 7); ctx.fill();
        }
      } else {
        const k = clamp(1 - p.life / 0.12, 0, 1);
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, 14 + k * 30, 0, 7); ctx.stroke();
      }
    } else if (p.kind === 'wind') {
      ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y);
      const scX = (Math.sign(p.vx) || 1) * ((p.w || 56) / 56), scY = (p.h || 52) / 52;
      ctx.scale(scX, scY);
      ctx.fillStyle = `rgba(${L.slash},0.55)`; ctx.beginPath(); ctx.moveTo(-26, -22); ctx.quadraticCurveTo(34, 0, -26, 22); ctx.quadraticCurveTo(10, 0, -26, -22); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-24, -20); ctx.quadraticCurveTo(30, 0, -24, 20); ctx.stroke();
    } else if (p.kind === 'quake') {
      ctx.fillStyle = 'rgba(120,95,70,0.9)';
      for (let i = 0; i < 5; i++) { const x = p.x - Math.sign(p.vx) * i * 12, h = (22 - i * 4) * (0.8 + 0.2 * Math.sin(p.age * 40 + i)); ctx.beginPath(); ctx.moveTo(x - 8, 0); ctx.lineTo(x, -h); ctx.lineTo(x + 8, 0); ctx.fill(); }
      if (Math.random() < 0.5) dust(p.x, 0, 1);
    } else if (p.kind === 'tornado') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const y = p.y + p.h / 2 - i * (p.h / 9), w = 16 + i * 6, off = Math.sin(p.age * 14 + i) * 8;
        ctx.strokeStyle = `rgba(${L.slash},${0.25 + 0.05 * i})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x + off, y, w, 6, 0, p.age * 10 + i, p.age * 10 + i + 4.5); ctx.stroke();
      }
    } else if (p.kind === 'bolt') {
      if (p.delay > 0) {
        const k = 1 - p.delay / 0.46;
        ctx.strokeStyle = `rgba(255,235,120,${0.4 + 0.5 * Math.sin(clock * 30)})`; ctx.lineWidth = p.small ? 4 : 5;
        ctx.beginPath(); ctx.ellipse(p.x, 0, (p.w || 64) * 0.5 * (0.6 + 0.4 * k), 9, 0, 0, Math.PI * 2); ctx.stroke();
        if (!p.small) { ctx.fillStyle = 'rgba(255,235,120,0.18)'; ctx.fillRect(p.x - 1, -700, 2, 700); }
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const top = p.h ? -p.h : (p.small ? -320 : -720);
        ctx.strokeStyle = 'rgba(255,245,190,0.95)'; ctx.lineWidth = p.small ? 8 : 7; ctx.beginPath(); ctx.moveTo(p.x, top);
        for (let y = top; y < 0; y += 60) ctx.lineTo(p.x + rand(-24, 24), y + 60);
        ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 2.5; ctx.stroke();
      }
    } else if (p.kind === 'rock') {
      ctx.translate(p.x, p.y); ctx.rotate((p.rot || 0) + p.age * 8);
      ctx.fillStyle = '#5a5060'; ctx.strokeStyle = '#2a2230'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-4, -14); ctx.lineTo(12, -9); ctx.lineTo(15, 6); ctx.lineTo(2, 13); ctx.lineTo(-12, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-6, -10, 8, 4);
    } else if (p.kind === 'dragon') {   // 墨龙：水墨身子蜿蜒，金眼、长须，墨雾拖尾
      const dir = Math.sign(p.vx) || 1, t = p.age;
      ctx.translate(p.x, p.y); ctx.scale(dir, 1);
      const pts = [];
      for (let i = 0; i <= 16; i++) pts.push([-i * 22, Math.sin(t * 9 - i * 0.55) * (8 + i * 1.4)]);
      for (let i = pts.length - 1; i > 0; i--) {               // 身子：从尾到头，越往前越粗越浓
        const k = 1 - i / pts.length, w = 6 + k * 34;
        ctx.strokeStyle = `rgba(12,12,20,${0.25 + 0.7 * k})`; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i - 1][0], pts[i - 1][1]); ctx.stroke();
        if (i % 3 === 0) { ctx.strokeStyle = `rgba(200,190,170,${0.18 * k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1] - w * 0.2, w * 0.35, 3.6, 5.8); ctx.stroke(); }   // 鳞光
      }
      for (const [i, s2] of [[5, 1], [10, -1]]) {               // 爪子
        const [x0, y0] = pts[i]; ctx.strokeStyle = 'rgba(12,12,20,0.8)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 8, y0 + 24 * s2); ctx.lineTo(x0 + 16, y0 + 20 * s2); ctx.stroke();
      }
      ctx.fillStyle = '#0c0c14';                                // 龙头
      ctx.beginPath(); ctx.moveTo(-8, -26); ctx.quadraticCurveTo(40, -30, 66, -10); ctx.lineTo(50, 0); ctx.lineTo(70, 10); ctx.quadraticCurveTo(36, 30, -8, 22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(232,220,190,0.85)'; ctx.lineWidth = 2;   // 角
      ctx.beginPath(); ctx.moveTo(14, -22); ctx.quadraticCurveTo(0, -48, -18, -52); ctx.moveTo(24, -24); ctx.quadraticCurveTo(16, -46, 2, -58); ctx.stroke();
      ctx.strokeStyle = 'rgba(232,220,190,0.6)'; ctx.lineWidth = 1.2;   // 须
      ctx.beginPath(); ctx.moveTo(58, 2); ctx.bezierCurveTo(40, 30 + Math.sin(t * 7) * 8, 10, 26, -20, 40 + Math.sin(t * 5) * 10); ctx.moveTo(56, -6); ctx.bezierCurveTo(40, -30, 10, -20 + Math.sin(t * 6) * 8, -26, -36); ctx.stroke();
      ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.arc(34, -10, 3.5, 0, 7); ctx.fill();   // 金眼
      ctx.fillStyle = 'rgba(233,196,106,0.25)'; ctx.beginPath(); ctx.arc(34, -10, 9, 0, 7); ctx.fill();
      if (Math.random() < 0.8) { const q = pts[4 + (Math.random() * 12 | 0)]; addP({ type: 'smoke', x: p.x + q[0] * dir, y: p.y + q[1], vx: -p.vx * 0.05, vy: rand(-30, 30), drag: 2, life: 0.6, max: 0.6, r: rand(8, 16) }); }
    } else if (p.kind === 'dragonOld') {
      const dir = Math.sign(p.vx) || 1;
      ctx.translate(p.x, p.y); ctx.scale(dir, 1);
      ctx.fillStyle = '#0b0b12';
      for (let i = 6; i >= 1; i--) { const x = -i * 26, y = Math.sin(p.age * 12 - i * 0.8) * 14; ctx.beginPath(); ctx.arc(x, y, 30 - i * 3, 0, 7); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-10, -34); ctx.quadraticCurveTo(70, -20, 76, 6); ctx.quadraticCurveTo(40, 36, -10, 34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8e2d0'; ctx.beginPath(); ctx.moveTo(30, -26); ctx.lineTo(4, -54); ctx.lineTo(18, -24); ctx.fill();
      ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(40, -8, 4.5, 0, 7); ctx.fill();
    } else if (p.kind === 'qi') {
      ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y);
      const scX = (Math.sign(p.vx) || 1) * ((p.w || 60) / 60), scY = (p.h || 70) / 70;
      ctx.scale(scX, scY);
      const a = clamp(p.life / 0.2, 0, 1);
      ctx.strokeStyle = `rgba(${L.slash},${0.85 * a})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-18, 0, 34, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2; ctx.stroke();
    } else if (p.kind === 'note') {   // 音波：几道弧线 + 一个音符
      const dir = Math.sign(p.vx) || 1, r = p.w * 0.5, a = clamp(p.life / 0.25, 0, 1), big = p.notes >= 3;
      ctx.translate(p.x, p.y); ctx.scale(dir, 1); ctx.globalAlpha = a;
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = 'rgba(' + L.slash + ',' + ((big ? 0.75 : 0.6) - k * 0.15) + ')'; ctx.lineWidth = (big ? 3.2 : 2.4) - k * 0.5;
        ctx.beginPath(); ctx.arc(-k * 10, 0, r * (0.55 + k * 0.2), -0.85, 0.85); ctx.stroke();
      }
      ctx.fillStyle = L.blade; ctx.strokeStyle = L.blade; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(-r * 0.35, 6, 5, 3.6, -0.4, 0, 7); ctx.fill();
      line([-r * 0.35 + 4, 5], [-r * 0.35 + 4, -12]); line([-r * 0.35 + 4, -12], [-r * 0.35 + 10, -6]);
    } else if (p.kind === 'chord') {   // 绝响：脚下一圈五线谱，然后一柱音浪
      if (p.delay > 0) {
        ctx.strokeStyle = 'rgba(' + L.slash + ',0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.ellipse(p.x, 0, p.w * 0.5, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      } else {
        const a = clamp(p.life / 0.3, 0, 1);
        for (let k = 0; k < 5; k++) {
          const y = p.y - p.h * 0.4 + k * p.h * 0.2, wob = Math.sin(p.age * 30 + k) * 6;
          ctx.strokeStyle = 'rgba(' + L.slash + ',' + (0.55 * a) + ')'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x - p.w * 0.5, y + wob); ctx.quadraticCurveTo(p.x, y - wob * 2, p.x + p.w * 0.5, y + wob); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(' + L.slash + ',' + (0.16 * a) + ')'; ctx.fillRect(p.x - p.w * 0.25, p.y - p.h * 0.5, p.w * 0.5, p.h);
      }
    } else if (p.kind === 'flame') {   // 酒火
      const dir = Math.sign(p.vx) || 1, a = clamp(p.life / 0.12, 0, 1);
      ctx.translate(p.x, p.y); ctx.scale(dir, 1);
      for (let k = 0; k < 6; k++) {
        const q = k / 5, x = -p.w * 0.45 + q * p.w * 0.9, r = 10 + q * p.h * 0.32 + Math.sin(p.age * 40 + k) * 3;
        ctx.fillStyle = 'rgba(255,' + (200 - k * 18) + ',' + (80 - k * 10) + ',' + ((0.55 - q * 0.25) * a) + ')';
        ctx.beginPath(); ctx.arc(x, Math.sin(p.age * 25 + k * 2) * 4, r, 0, 7); ctx.fill();
      }
    } else if (p.kind === 'hook') {   // 飞锤：链子和锤头由勾陈的链锤物理画，这里只画破风线
      const dir = Math.sign(p.vx) || 1;
      ctx.strokeStyle = 'rgba(' + L.slash + ',0.45)'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) line([p.x - dir * (26 + k * 10), p.y - 12 + k * 12], [p.x - dir * (60 + k * 16), p.y - 12 + k * 12]);
    } else if (p.kind === 'net') {   // 开天一锤：链锤甩上天变成巨锤砸下来，落地一圈震波
      const drop = p.delay > 0 ? p.delay / 0.25 : 0, hw = 64, hh = 40;
      const cy = p.y + 45 - drop * 320, top = cy - hh;
      if (p.delay > 0) { ctx.strokeStyle = 'rgba(' + L.slash + ',0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(p.x, 0, hw + 20, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.globalAlpha = p.delay > 0 ? 1 : clamp(p.life / 0.3, 0, 1) * 0.55;   // 落地后变淡，不挡住被砸的人
      ctx.fillStyle = '#3a2a1e'; ctx.fillRect(p.x - 7, top - 22, 14, 22);   // 锤颈，链子由勾陈的链锤物理画
      ctx.fillStyle = L.outline; ctx.fillRect(p.x - hw - 3, cy - hh - 3, hw * 2 + 6, hh * 2 + 6);
      ctx.fillStyle = '#7d8492'; ctx.fillRect(p.x - hw, cy - hh, hw * 2, hh * 2);
      ctx.fillStyle = L.blade; ctx.fillRect(p.x - hw, cy - hh, hw * 2, 7);
      ctx.fillStyle = 'rgba(30,34,42,0.5)'; ctx.fillRect(p.x - hw, cy + hh - 8, hw * 2, 8);
      ctx.fillStyle = L.scarf; ctx.fillRect(p.x - 10, cy - hh, 20, hh * 2);
      ctx.globalAlpha = 1;
      if (p.delay <= 0) {
        const k = clamp(1 - p.life / 0.3, 0, 1);
        ctx.strokeStyle = 'rgba(' + L.slash + ',' + (0.5 * (1 - k)) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x, 0, hw + 40 + k * 120, 10 + k * 8, 0, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (p.kind === 'kunai') {
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a1a22'; ctx.fillRect(-12, -1.5, 8, 3); ctx.strokeStyle = `rgb(${L.slash})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-14, 0, 3, 0, 7); ctx.stroke();
    } else if (p.kind === 'inkblob') {
      const r = (p.w || 34) * 0.44;
      ctx.fillStyle = '#0c0c12'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x - Math.sign(p.vx) * r * 0.9, p.y + 4, r * 0.5, 0, 7); ctx.fill();
    } else if (p.kind === 'moonring') {
      ctx.translate(p.x, p.y); ctx.rotate(p.age * 18);
      const r = (p.w || 44) * 0.45;
      ctx.fillStyle = `rgba(${L.slash},0.95)`; ctx.beginPath(); ctx.arc(0, 0, r, 0.3, Math.PI * 2 - 0.3); ctx.arc(r * 0.3, 0, r * 0.75, Math.PI * 2 - 0.4, 0.4, true); ctx.closePath(); ctx.fill();
    } else if (p.kind === 'feather') {
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2);
      ctx.fillStyle = `rgba(${L.slash},0.9)`; ctx.beginPath(); ctx.ellipse(0, 0, 5, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 18); ctx.stroke();
    } else if (p.kind === 'spindle') {  // 凌雀：子母飞梭与悬丝
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = L.blade || '#ffe8fa'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = L.metal || '#e056b0'; ctx.fillRect(-3, -2.5, 6, 5);
      ctx.strokeStyle = `rgba(${L.slash},0.85)`; ctx.lineWidth = 1.5;
      line([-15, 0], [15, 0]);
      // 尾部牵引丝线
      ctx.strokeStyle = `rgba(${L.slash},0.6)`; ctx.lineWidth = 1.2;
      line([-15, 0], [-45, 0]);
    } else if (p.kind === 'trap') {
      const armed = p.delay <= 0, r = (p.w || 84) * 0.48;
      ctx.translate(p.x, 0); ctx.scale(1, 0.28);
      ctx.strokeStyle = armed ? 'rgba(20,20,30,0.95)' : 'rgba(20,20,30,0.45)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(p.age * 1.5); ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(r * 0.35, 0); ctx.lineTo(r * 0.8, 6); ctx.stroke(); }
    } else if (p.kind === 'bottle') {   // 醉翁飞掷酒坛
      ctx.translate(p.x, p.y); ctx.rotate(p.age * 12);
      ctx.fillStyle = '#8a5a36'; ctx.strokeStyle = '#2b1b10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#683f20'; ctx.fillRect(-4, -18, 8, 6); ctx.strokeRect(-4, -18, 8, 6);
      ctx.fillStyle = '#d8452f'; ctx.fillRect(-5, -6, 10, 8); // 红布封口/坛签
      ctx.fillStyle = 'rgba(255,220,150,0.5)'; ctx.fillRect(-2, -4, 4, 4);
    } else if (p.kind === 'pavilion') {   // 亭中留客：醉翁亭从天而降，和关人时是同一座亭子
      const drop = p.delay > 0 ? p.delay / 0.35 : 0;   // 0.35 秒从天上落到地面
      if (p.delay > 0) { ctx.strokeStyle = 'rgba(255,190,90,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(p.x, 0, 100, 9, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      drawWengTing(p.x, -drop * drop * 640, 1, 1);
    }
    ctx.restore();
  }
}
function drawPetals() {
  for (const p of petals) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
    ctx.fillStyle = 'rgba(255,205,220,0.55)';
    ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

