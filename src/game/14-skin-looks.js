// ======================= 皮肤造型：头饰、背饰、披风、武器特效 =======================
function drawDeco(sk, f, L, layer) {
  const D = L.deco; if (!D) return;
  const t = typeof clock === 'number' ? clock : 0;
  const hx = sk.head[0], hy = sk.head[1], nx = sk.neck[0], ny = sk.neck[1];
  let ux = hx - nx, uy = hy - ny; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;   // 头的“上”方向
  const fx = -uy * sk.face, fy = ux * sk.face;                                                // 头的“前”方向
  const P = (a, b, bx = hx, by = hy) => [bx + fx * a + ux * b, by + fy * a + uy * b];      // 以头为原点：a 向前，b 向上
  const sway = Math.sin(t * 3 + (f.idx || 0)) * 3 - clamp((f.vx || 0) * sk.face / 60, -8, 8);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (layer === 'back') {
    // 背后的大装饰（在身体后面）
    const bc = P(-16, -4, nx, ny);
    if (drawBackPiece(D.back, D, sk, f, L, t, bc, sway)) { /* 传说专属背饰 */ }
    else if (D.back === 'sundisk' || D.back === 'bloodmoon' || D.back === 'eclipse') {
      const r = 26, col = D.back === 'sundisk' ? '255,200,90' : D.back === 'bloodmoon' ? '220,40,60' : '230,70,90';
      const g = ctx.createRadialGradient(bc[0], bc[1], 4, bc[0], bc[1], r * 1.9);
      g.addColorStop(0, `rgba(${col},0.55)`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; circle(bc, r * 1.9);
      if (D.back === 'sundisk') {
        ctx.strokeStyle = 'rgba(255,215,120,0.9)'; ctx.lineWidth = 2;
        for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6 + t * 0.4; ctx.beginPath(); ctx.moveTo(bc[0] + Math.cos(a) * r * 1.05, bc[1] + Math.sin(a) * r * 1.05); ctx.lineTo(bc[0] + Math.cos(a) * r * 1.45, bc[1] + Math.sin(a) * r * 1.45); ctx.stroke(); }
        ctx.fillStyle = '#ffcf5a'; circle(bc, r); ctx.strokeStyle = '#fff1c0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bc[0], bc[1], r * 0.7, 0, 7); ctx.stroke();
      } else if (D.back === 'bloodmoon') {
        ctx.fillStyle = '#c21e32'; circle(bc, r); ctx.fillStyle = 'rgba(40,5,10,0.85)'; circle([bc[0] - sk.face * 9, bc[1] - 4], r * 0.85);
      } else {
        ctx.strokeStyle = 'rgba(255,120,120,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bc[0], bc[1], r + 2, 0, 7); ctx.stroke();
        ctx.fillStyle = '#07050a'; circle(bc, r);
      }
    } else if (D.back === 'shell') {   // 玄武龟甲：六边形纹
      const c = P(-12, -24, nx, ny);
      ctx.fillStyle = '#211d2a'; ctx.strokeStyle = 'rgba(140,120,255,0.7)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(c[0], c[1], 20, 30, Math.atan2(uy, ux) + Math.PI / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const [a, b] of [[0, 0], [0, 14], [0, -14], [-9, 7], [-9, -7]]) { const q = P(a - 12, b - 24, nx, ny); ctx.beginPath(); for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; ctx.lineTo(q[0] + Math.cos(an) * 5.5, q[1] + Math.sin(an) * 5.5); } ctx.closePath(); ctx.stroke(); }
    } else if (D.back === 'lotus') {   // 圣莲 / 星莲（支持自定义主题色 D.lotusC）
      const lc = D.lotusC || '233,196,106';
      for (let k = -3; k <= 3; k++) {
        const a = Math.atan2(uy, ux) + k * 0.32, len = 35 - Math.abs(k) * 3;
        ctx.fillStyle = `rgba(${lc},${0.78 - Math.abs(k) * 0.08})`; ctx.beginPath();
        ctx.ellipse(bc[0] + Math.cos(a) * len * 0.5, bc[1] + Math.sin(a) * len * 0.5, 6.2, len * 0.5, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (D.back === 'snowflake') {   // 冰晶：六个分叉，缓缓旋转
      ctx.strokeStyle = 'rgba(200,240,255,0.85)'; ctx.lineWidth = 2.2;
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + t * 0.3, ex = bc[0] + Math.cos(a) * 26, ey = bc[1] + Math.sin(a) * 26;
        line(bc, [ex, ey]);
        for (const d2 of [0.5, 0.75]) { const mx = bc[0] + Math.cos(a) * 26 * d2, my = bc[1] + Math.sin(a) * 26 * d2; for (const s2 of [-1, 1]) line([mx, my], [mx + Math.cos(a + s2 * 0.8) * 7, my + Math.sin(a + s2 * 0.8) * 7]); }
      }
      ctx.fillStyle = 'rgba(230,250,255,0.9)'; circle(bc, 4);
    } else if (D.back === 'aurora') {   // 极光光带：三条波浪，从绿到紫
      for (let k = 0; k < 3; k++) {
        const g = ctx.createLinearGradient(bc[0] - 50, bc[1], bc[0] + 30, bc[1] - 40);
        g.addColorStop(0, 'rgba(120,255,210,0)'); g.addColorStop(0.4, `rgba(120,255,210,${0.55 - k * 0.12})`); g.addColorStop(1, `rgba(190,120,255,${0.45 - k * 0.1})`);
        ctx.strokeStyle = g; ctx.lineWidth = 7 - k * 1.5; ctx.beginPath();
        for (let q = 0; q <= 12; q++) { const u = q / 12, pt = P(-48 + u * 60, 6 + k * 10 + Math.sin(u * 6 + t * 2 + k) * 6, nx, ny); q ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); }
        ctx.stroke();
      }
    } else if (D.back === 'umbrella') {   // 烟雨：斜背一把撑开的油纸伞，伞沿滴雨
      const hand = P(-10, -30, nx, ny), top = P(-36, 30, nx, ny);
      const ax = top[0] - hand[0], ay = top[1] - hand[1], al = Math.hypot(ax, ay) || 1, vx = ax / al, vy = ay / al, wx = -vy, wy = vx;
      const rc = [top[0] - vx * 12, top[1] - vy * 12], R = 30;
      const rim = k => [rc[0] + wx * R * k + vx * (1 - k * k) * -3, rc[1] + wy * R * k + vy * (1 - k * k) * -3];
      ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.6; line(hand, top);   // 伞柄
      ctx.lineWidth = 2.6; line(hand, [hand[0] + vx * 7, hand[1] + vy * 7]);
      const g = ctx.createLinearGradient(top[0], top[1], rc[0], rc[1]); g.addColorStop(0, 'rgba(196,224,216,0.95)'); g.addColorStop(1, 'rgba(120,170,165,0.9)');
      ctx.fillStyle = g; ctx.beginPath(); const L0 = rim(-1); ctx.moveTo(L0[0], L0[1]);
      ctx.quadraticCurveTo(top[0] - wx * R * 0.55 + vx * 2, top[1] - wy * R * 0.55 + vy * 2, top[0], top[1]);
      ctx.quadraticCurveTo(top[0] + wx * R * 0.55 + vx * 2, top[1] + wy * R * 0.55 + vy * 2, rim(1)[0], rim(1)[1]);
      for (let k = 7; k >= 0; k--) { const q0 = rim(-1 + (k + 1) * 0.25), q1 = rim(-1 + k * 0.25), m = lerp2(q0, q1, 0.5); ctx.quadraticCurveTo(m[0] - vx * 3, m[1] - vy * 3, q1[0], q1[1]); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,80,78,0.55)'; ctx.lineWidth = 0.8;
      for (let k = 0; k <= 8; k++) { const q = rim(-1 + k * 0.25); ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.quadraticCurveTo(lerp2(top, q, 0.5)[0] + vx * 2, lerp2(top, q, 0.5)[1] + vy * 2, q[0], q[1]); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(30,60,60,0.5)'; ctx.lineWidth = 2.2; ctx.beginPath();   // 伞面一圈墨色宽边
      for (let k = 0; k <= 16; k++) { const q = rim(-1 + k / 8); const p2 = [q[0] + (top[0] - q[0]) * 0.18, q[1] + (top[1] - q[1]) * 0.18]; k ? ctx.lineTo(p2[0], p2[1]) : ctx.moveTo(p2[0], p2[1]); }
      ctx.stroke();
      ctx.fillStyle = '#2f5a56'; circle(top, 1.8);
      for (let k = 0; k < 3; k++) {   // 伞沿往下滴的水珠
        const ph = (t * 0.9 + k * 0.37) % 1, q = rim(-0.9 + k * 0.9);
        ctx.fillStyle = `rgba(200,235,240,${0.8 * (1 - ph)})`; circle([q[0], q[1] + ph * 26], 1.2);
      }
    } else if (D.back === 'clouds') {   // 背后流云
      ctx.fillStyle = 'rgba(235,245,255,0.8)';
      for (let k = 0; k < 4; k++) { const q = P(-20 - k * 9, -6 + Math.sin(t * 2 + k) * 4 - k * 5, nx, ny); circle(q, 9 - k * 1.2); }
    } else if (D.back === 'voiddisk') {   // 幽渊黑洞法环
      const r = 26;
      const g = ctx.createRadialGradient(bc[0], bc[1], 3, bc[0], bc[1], r * 2);
      g.addColorStop(0, 'rgba(160,80,240,0.6)'); g.addColorStop(0.7, 'rgba(40,10,70,0.4)'); g.addColorStop(1, 'rgba(20,5,35,0)'); ctx.fillStyle = g; circle(bc, r * 2);
      ctx.strokeStyle = 'rgba(180,110,255,0.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bc[0], bc[1], r, 0, 7); ctx.stroke();
      ctx.fillStyle = '#080210'; circle(bc, r * 0.85);
      for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4 - t * 0.5; line([bc[0] + Math.cos(an) * r * 0.9, bc[1] + Math.sin(an) * r * 0.9], [bc[0] + Math.cos(an) * r * 1.35, bc[1] + Math.sin(an) * r * 1.35]); }
    } else if (D.back === 'wings') {   // 幻灵/雪鸮飞翼
      for (const s2 of [-1, 1]) {
        ctx.fillStyle = s2 === 1 ? 'rgba(220,245,255,0.7)' : 'rgba(160,225,255,0.5)';
        ctx.beginPath(); ctx.moveTo(bc[0], bc[1]);
        const wSpan = 38, wFlap = Math.sin(t * 4) * 6;
        ctx.quadraticCurveTo(bc[0] - 20, bc[1] - 30 * s2 + wFlap, bc[0] - 55, bc[1] - 22 * s2 + wFlap);
        ctx.quadraticCurveTo(bc[0] - 30, bc[1] - 8 * s2, bc[0], bc[1]); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    } else if (D.back === 'dragonring') {   // 沧龙水轮
      const r = 28;
      ctx.strokeStyle = 'rgba(70,170,255,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(bc[0], bc[1], r, t * 1.2, t * 1.2 + Math.PI * 1.65); ctx.stroke();
      ctx.strokeStyle = 'rgba(180,230,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bc[0], bc[1], r * 0.75, -t * 1.5, -t * 1.5 + Math.PI * 1.4); ctx.stroke();
    } else if (D.back === 'chakra') {   // 金刚光轮 / 宝轮
      const r = 27;
      ctx.strokeStyle = 'rgba(255,190,40,0.95)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(bc[0], bc[1], r, 0, 7); ctx.stroke();
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6 + t * 0.4;
        const q1 = [bc[0] + Math.cos(a) * (r - 6), bc[1] + Math.sin(a) * (r - 6)], q2 = [bc[0] + Math.cos(a) * (r + 7), bc[1] + Math.sin(a) * (r + 7)];
        line(q1, q2);
      }
      ctx.fillStyle = 'rgba(255,220,100,0.7)'; circle(bc, 5);
    }
    // 披风：从肩膀往后飘
    if (D.cape || D.back === 'aurora') {
      const a = sk.sh, h = sk.hip, back = -sk.face;
      const tipX = h[0] + back * (26 + Math.abs(sway) * 1.5), tipY = h[1] + 22 + sway;
      if (D.back === 'aurora') { const g = ctx.createLinearGradient(a[0], a[1], tipX, tipY); g.addColorStop(0, 'rgba(120,255,210,0.85)'); g.addColorStop(0.5, 'rgba(120,170,255,0.75)'); g.addColorStop(1, 'rgba(200,120,255,0.3)'); ctx.fillStyle = g; }
      else ctx.fillStyle = D.cape;
      ctx.beginPath(); ctx.moveTo(a[0] + back * 3, a[1]);
      ctx.quadraticCurveTo(a[0] + back * 22, (a[1] + tipY) / 2 + sway, tipX, tipY);
      ctx.lineTo(tipX - back * 12, tipY - 4);
      ctx.quadraticCurveTo(h[0] + back * 4, h[1], a[0] - back * 2, a[1] + 4); ctx.closePath(); ctx.fill();
    }
    if (D.shawl) {   // 披帛：一条轻纱从两肩绕到身后，长长地飘着
      const a = sk.sh, h = sk.hip, back = -sk.face;
      const p0 = [a[0] + sk.face * 5, a[1] + 2], c1 = [a[0] + back * 10, a[1] - 6], p1 = [a[0] + back * 8, a[1] + 6];
      const c2 = [h[0] + back * (24 + Math.abs(sway)), h[1] - 4 + sway], e = [h[0] + back * (34 + Math.abs(sway) * 1.6), h[1] + 30 + sway * 1.5];
      for (const [w, al] of [[4, 0.55], [1.4, 0.85]]) {
        ctx.strokeStyle = `rgba(${D.shawl},${al})`; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(c1[0], c1[1], p1[0], p1[1]); ctx.quadraticCurveTo(c2[0], c2[1], e[0], e[1]); ctx.stroke();
      }
      const e2 = [sk.eb[0] + back * (14 + Math.abs(sway)), sk.eb[1] + 22 + sway];   // 另一头从后臂垂下来
      ctx.strokeStyle = `rgba(${D.shawl},0.5)`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.quadraticCurveTo(sk.eb[0] + back * 4, sk.eb[1], e2[0], e2[1]); ctx.stroke();
    }
    ctx.restore(); return;
  }
  // ---------- 前面一层：差异化定制头饰 ----------
  const hd = D.head;
  if (hd === 'douli' || hd === 'veilhat' || hd === 'bamboohat' || hd === 'talismanhat') {
    const L1 = P(-27, 5), R1 = P(27, 5), T1 = P(0, 21);
    ctx.fillStyle = D.hatC || '#c9a86a'; ctx.strokeStyle = '#3a2818'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(L1[0], L1[1]); ctx.quadraticCurveTo(T1[0], T1[1], R1[0], R1[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; for (let k = -2; k <= 2; k++) line(P(k * 9, 6), P(k * 2, 18));
    if (hd === 'veilhat') {
      ctx.fillStyle = D.veilC || 'rgba(255,150,95,0.42)';
      ctx.beginPath(); ctx.moveTo(L1[0] + fx * 3, L1[1]); ctx.lineTo(R1[0] - fx * 3, R1[1]);
      ctx.lineTo(P(18 + sway * 0.6, -12)[0], P(18 + sway * 0.6, -12)[1]);
      ctx.lineTo(P(-20 + sway * 0.8, -14)[0], P(-20 + sway * 0.8, -14)[1]); ctx.closePath(); ctx.fill();
    } else if (hd === 'bamboohat') {
      ctx.strokeStyle = '#7fe0a0'; ctx.lineWidth = 1.6;
      line(P(6, 14), P(16, 22)); line(P(10, 17), P(18, 16)); line(P(11, 18), P(14, 24));
    } else if (hd === 'talismanhat') {
      for (const s2 of [-14, 14]) {
        const p0 = P(s2, 5), p1 = P(s2 + sway * 0.4, -7);
        ctx.fillStyle = '#d83226'; ctx.beginPath(); ctx.moveTo(p0[0] - 2, p0[1]); ctx.lineTo(p0[0] + 2, p0[1]); ctx.lineTo(p1[0] + 2, p1[1]); ctx.lineTo(p1[0] - 2, p1[1]); ctx.closePath(); ctx.fill();
      }
    }
  } else if (hd === 'crown') {   // 帝日金冠
    ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#8a5a12'; ctx.lineWidth = 1.2; ctx.beginPath();
    const pts = [P(-10, 6), P(-10, 13), P(-6, 10), P(-3, 18), P(0, 11), P(3, 18), P(6, 10), P(10, 13), P(10, 6)];
    ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8403a'; circle(P(0, 9), 2); ctx.fillStyle = '#6fd6ff'; circle(P(-6, 8), 1.4); circle(P(6, 8), 1.4);
  } else if (hd === 'icecrown') {   // 寒霜冰棱冠（区别于幽渊）
    ctx.fillStyle = '#d8f4ff'; ctx.strokeStyle = '#5ab4e6'; ctx.lineWidth = 1.3;
    for (const [ox, h1] of [[-8, 14], [-4, 19], [0, 24], [4, 19], [8, 14]]) {
      const bL = P(ox - 2.2, 6), bR = P(ox + 2.2, 6), tp = P(ox, h1);
      ctx.beginPath(); ctx.moveTo(bL[0], bL[1]); ctx.lineTo(tp[0], tp[1]); ctx.lineTo(bR[0], bR[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff'; circle(P(0, 10), 2.2);
  } else if (hd === 'voidhorns') {   // 幽渊/冥狱：裂空暗渊双角 + 虚空眉印
    ctx.fillStyle = '#1b0d2e'; ctx.strokeStyle = '#b56bff'; ctx.lineWidth = 1.4;
    for (const s2 of [-1, 1]) {
      const b0 = P(s2 * 4, 8), c1 = P(s2 * 14 - 4, 20), tp = P(s2 * 9 - 12, 29);
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.lineTo(P(s2 * 7, 7)[0], P(s2 * 7, 7)[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#d896ff'; circle(P(8, 5), 2.5);
  } else if (hd === 'horns') {   // 血月恶鬼长角
    ctx.fillStyle = D.hornC || '#222'; ctx.strokeStyle = `rgba(${L.slash},0.85)`; ctx.lineWidth = 1.3;
    for (const s2 of [-1, 1]) {
      const b0 = P(s2 * 5 - 2, 8), b1 = P(s2 * 9 - 2, 9), c1 = P(s2 * 14 - 8, 22), tp = P(s2 * 10 - 14, 30);
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.quadraticCurveTo(c1[0] + fx * 4, c1[1] + fy * 4, b1[0], b1[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (hd === 'jadevisor') {   // 绯影·碧影：翡翠半脸轻甲面帘 + 翠叶发簪（与幻灵狐面完全区分）
    ctx.fillStyle = '#12382c'; ctx.strokeStyle = '#2bd49a'; ctx.lineWidth = 1.4;
    const m0 = P(1, -1), m1 = P(11, 2), m2 = P(9, -8), m3 = P(-2, -6);
    ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.lineTo(m2[0], m2[1]); ctx.lineTo(m3[0], m3[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5ef2c0'; circle(P(6, 3.2), 1.8);
    ctx.fillStyle = '#2bd49a'; ctx.beginPath(); const lf = P(-6, 11); ctx.ellipse(lf[0], lf[1], 7, 3, Math.atan2(uy, ux) - 0.5, 0, Math.PI * 2); ctx.fill();
  } else if (hd === 'foxears') {   // 流云·狐火：一对竖起的白狐耳（耳里朱红），眼角两道朱红狐纹
    for (const [b0, b1, tp, col] of [[P(-10, 5), P(-2, 9.6), P(-9.5, 23 + sway * 0.2), '#e9ddd0'], [P(0, 9.9), P(8, 6.5), P(4.5, 22 + sway * 0.15), '#fbf6ee']]) {
      ctx.fillStyle = col; ctx.strokeStyle = L.outline; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo((b0[0] + tp[0]) / 2 - fx * 1.5, (b0[1] + tp[1]) / 2 - fy * 1.5, tp[0], tp[1]); ctx.quadraticCurveTo((b1[0] + tp[0]) / 2 + fx * 1.5, (b1[1] + tp[1]) / 2 + fy * 1.5, b1[0], b1[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
      const c0 = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2], k = 0.62, i0 = [c0[0] + (b0[0] - c0[0]) * k, c0[1] + (b0[1] - c0[1]) * k], i1 = [c0[0] + (b1[0] - c0[0]) * k, c0[1] + (b1[1] - c0[1]) * k], it = [c0[0] + (tp[0] - c0[0]) * 0.8, c0[1] + (tp[1] - c0[1]) * 0.8];
      ctx.fillStyle = '#ff6a4a'; ctx.beginPath(); ctx.moveTo(i0[0], i0[1]); ctx.lineTo(it[0], it[1]); ctx.lineTo(i1[0], i1[1]); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#e8321e'; ctx.lineWidth = 1.3; line(P(2.8, 1.6), P(-2.5, 3.6)); line(P(2.8, -0.6), P(-2, 0.4));
  } else if (hd === 'foxmask') {   // 绯影·幻灵：九尾妖狐全覆灵面 + 幽蓝灵耳与妖瞳
    const c = P(4.5, 0.5);
    ctx.fillStyle = '#eefaff'; ctx.strokeStyle = D.mask || '#00f2fe'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(c[0], c[1], 9, 10, Math.atan2(uy, ux) + Math.PI / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (const s2 of [-1, 1]) {
      const e0 = P(s2 * 5 + 2, 7), e1 = P(s2 * 8 + 1, 19), e2 = P(s2 * 1 + 2, 9);
      ctx.fillStyle = '#eefaff'; ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = D.mask || '#00f2fe'; ctx.lineWidth = 2;
    line(P(5, 3), P(10, 4.5));
    ctx.lineWidth = 1.4; line(P(6, 0), P(10, -2)); line(P(5, -3), P(9, -5));
  } else if (hd === 'taotiehelm') {   // 铁山·青铜：商周饕餮方冠胄
    ctx.fillStyle = D.helmC || '#a8804a'; ctx.strokeStyle = '#3fa37a'; ctx.lineWidth = 1.5;
    const p1 = P(-11, -2), p2 = P(-11, 13), p3 = P(11, 13), p4 = P(11, -2);
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const s2 of [-1, 1]) { line(P(s2 * 9, 13), P(s2 * 13, 20)); }
    ctx.fillStyle = '#3fa37a'; circle(P(6, 5), 2.2);
  } else if (hd === 'asuramask') {   // 铁山·修罗：阿修罗鬼面 + 狂暴赤发
    ctx.fillStyle = '#380a0a'; ctx.strokeStyle = '#ff3a30'; ctx.lineWidth = 1.5;
    ctx.beginPath(); const a0 = Math.atan2(uy, ux); ctx.arc(hx, hy, 12.2, a0 - Math.PI * 0.6, a0 + Math.PI * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ff3a30'; ctx.lineWidth = 3.2;
    for (let k = 0; k < 3; k++) {
      const b0 = P(-2, 11 - k * 3), c1 = P(-16, 22 - k * 4 + sway), tp = P(-30 - k * 4, 16 - k * 6 + sway * 1.3);
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.stroke();
    }
    ctx.fillStyle = '#ffea70'; circle(P(8, 3), 2); circle(P(6, 8), 1.6);
  } else if (hd === 'helm') {   // 头盔 + 盔缨
    ctx.fillStyle = D.helmC; ctx.strokeStyle = '#3a2a14'; ctx.lineWidth = 1.2; ctx.beginPath();
    const a0 = Math.atan2(uy, ux); ctx.arc(hx, hy, 12, a0 - Math.PI / 2 - 0.2, a0 + Math.PI / 2 + 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = D.crest; ctx.lineWidth = 3; ctx.beginPath(); const b0 = P(0, 12), c1 = P(-10, 24), tp = P(-22, 20 + sway); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.stroke();
  } else if (hd === 'valkyrie') {   // 凌霜·极光：极光羽翼女武神冠
    ctx.strokeStyle = '#7dffd8'; ctx.fillStyle = '#dffcf4'; ctx.lineWidth = 1.5;
    line(P(-9, 5), P(10, 5));
    const w0 = P(-1, 6), w1 = P(-14, 19), w2 = P(-19, 13), w3 = P(-6, 4);
    ctx.beginPath(); ctx.moveTo(w0[0], w0[1]); ctx.lineTo(w1[0], w1[1]); ctx.lineTo(w2[0], w2[1]); ctx.lineTo(w3[0], w3[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5ef2c9'; circle(P(9, 5.5), 2.6);
  } else if (hd === 'dragonhorns') {   // 凌霜·沧龙：沧海分支龙角
    ctx.strokeStyle = '#1f90ff'; ctx.lineWidth = 2.6;
    for (const s2 of [-1, 1]) {
      const b0 = P(s2 * 3, 9), m1 = P(s2 * 6 - 7, 19), t1 = P(s2 * 4 - 16, 27), br = P(s2 * 8 - 4, 24);
      line(b0, m1); line(m1, t1); line(m1, br);
    }
    ctx.fillStyle = '#80d4ff'; circle(P(8, 5), 2.4);
  } else if (hd === 'startiara') {   // 星座·星焰 / 星冕：额上一道星冠，三（五）枚星芒，中间一颗星宝石；星冕的头顶还绕着一颗小星
    const tc = D.tiaraC || '#ffd36a', zt = D.zt || 2, gc = D.zc || '255,220,150';
    ctx.strokeStyle = tc; ctx.lineWidth = 2; line(P(-9, 6), P(9, 6));
    ctx.fillStyle = tc;
    for (const [a, h] of zt >= 3 ? [[-7, 4], [-3.5, 7], [0, 10], [3.5, 7], [7, 4]] : [[-4.5, 5], [0, 8.5], [4.5, 5]]) {
      const b0 = P(a - 1.8, 6.5), b1 = P(a + 1.8, 6.5), tp = P(a, 6.5 + h);
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(tp[0], tp[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath(); ctx.fill();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gp = P(0, 9.5), tw = 0.75 + 0.25 * Math.sin(t * 3.5);
    ctx.fillStyle = D.gem || '#fff'; circle(gp, 2.2);
    glint(gp[0], gp[1], 4.5 * tw + 1.5, gc, 0.9);
    if (zt >= 3) { const a = t * 1.6, q = P(Math.cos(a) * 13, 14 + Math.sin(a) * 4); glint(q[0], q[1], 3.2, '255,240,200', 0.9); }
    ctx.restore();
  } else if (hd === 'starguan') {   // 墨羽·星墨 / 玉箫·钧天：太虚星官高冠
    ctx.fillStyle = '#14244a'; ctx.strokeStyle = '#6fd6ff'; ctx.lineWidth = 1.4;
    const g0 = P(-6, 9), g1 = P(-4, 21), g2 = P(5, 21), g3 = P(6, 9);
    ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]); ctx.lineTo(g3[0], g3[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    line(P(-11, 14), P(11, 14));
    ctx.fillStyle = '#fff'; circle(P(0, 15), 2.2);
  } else if (hd === 'sakurabranch') {   // 月华·樱月：双樱花枝与粉樱飘带
    ctx.strokeStyle = '#6b3428'; ctx.lineWidth = 1.6; line(P(-10, 4), P(4, 14));
    for (const [a, b, r] of [[-6, 9, 4.8], [2, 13, 4.0], [-11, 4, 3.4]]) {
      const c = P(a, b); ctx.fillStyle = D.flower || '#ff9ec4';
      for (let k = 0; k < 5; k++) { const an = k * Math.PI * 0.4 + t * 0.3; circle([c[0] + Math.cos(an) * r * 0.65, c[1] + Math.sin(an) * r * 0.65], r * 0.5); }
      ctx.fillStyle = '#fff5f8'; circle(c, r * 0.28);
    }
    ctx.strokeStyle = '#ff9ec4'; ctx.lineWidth = 2; line(P(-9, 5), P(-24 + sway, -8));
  } else if (hd === 'frosttiara') {   // 月华·霜华 / 玉箫·雪箫：六棱冰钻冠冕
    ctx.strokeStyle = '#a8e0ff'; ctx.fillStyle = '#eef9ff'; ctx.lineWidth = 1.4;
    for (const [ox, h1] of [[-6, 13], [0, 19], [6, 13]]) {
      const c = P(ox, h1);
      ctx.beginPath(); ctx.moveTo(c[0], c[1] - 4); ctx.lineTo(c[0] + 3, c[1]); ctx.lineTo(c[0], c[1] + 4); ctx.lineTo(c[0] - 3, c[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    line(P(-9, 6), P(9, 6));
  } else if (hd === 'ravencowl') {   // 燕翎·玄羽：夜鸦尖喙暗살兜帽
    ctx.fillStyle = '#181822'; ctx.strokeStyle = '#8a8aa6'; ctx.lineWidth = 1.3;
    const a0 = Math.atan2(uy, ux);
    ctx.beginPath(); ctx.arc(hx, hy, 12.8, a0 - Math.PI * 0.7, a0 + Math.PI * 0.2);
    const beak = P(15, 3), tail = P(-19, -7 + sway * 0.5);
    ctx.lineTo(beak[0], beak[1]); ctx.lineTo(P(6, -1)[0], P(6, -1)[1]); ctx.lineTo(tail[0], tail[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (hd === 'owlhood') {   // 燕翎·雪鸮：极地雪鸮白羽耳簇兜帽
    ctx.fillStyle = '#dcebfa'; ctx.strokeStyle = '#70b6f6'; ctx.lineWidth = 1.4;
    const a0 = Math.atan2(uy, ux);
    ctx.beginPath(); ctx.arc(hx, hy, 12.8, a0 - Math.PI * 0.7, a0 + Math.PI * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6;
    line(P(3, 8), P(-6, 18)); line(P(5, 7), P(-2, 16));
  } else if (hd === 'gourdcrown') {   // 醉翁·琥珀：金樽藤叶束发金箍
    ctx.strokeStyle = '#e5a93c'; ctx.lineWidth = 3.2; line(P(-10, 4), P(10, 4));
    ctx.fillStyle = '#d9822b'; circle(P(0, 12), 4.2); circle(P(0, 17), 2.8);
  } else if (hd === 'ironvisage') {   // 勾陈·赤锤：赤狱百炼鬼面铁胄
    ctx.fillStyle = '#2b1014'; ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 1.5;
    ctx.beginPath(); const a0 = Math.atan2(uy, ux); ctx.arc(hx, hy, 11.8, a0 - 1.4, a0 + 2.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff4d4d'; circle(P(6, 2), 2.1);
  } else if (hd === 'circlet') {   // 额环 + 宝石
    ctx.strokeStyle = '#e6e9f5'; ctx.lineWidth = 2; line(P(-9, 5), P(9, 5));
    ctx.fillStyle = D.gem || '#7dd'; circle(P(9, 5), 2.8); ctx.fillStyle = 'rgba(255,255,255,0.8)'; circle(P(9.6, 5.8), 1);
  } else if (hd === 'flower') {   // 花簪
    for (const [a, b, r] of [[-7, 9, 5], [-11, 3, 3.6]]) {
      const c = P(a, b); ctx.fillStyle = D.flower;
      for (let k = 0; k < 5; k++) { const an = k * Math.PI * 0.4 + t * 0.3; circle([c[0] + Math.cos(an) * r * 0.7, c[1] + Math.sin(an) * r * 0.7], r * 0.55); }
      ctx.fillStyle = '#ffe07a'; circle(c, r * 0.3);
    }
    ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 1; line(P(-9, 6), P(-14 + sway * 0.5, -10));
  } else if (hd === 'plumpin') {   // 红梅：金簪上一朵小梅花，挂两串步摇；额上一点梅花钿
    const b0 = P(-12, 12), b1 = P(-3, 4);
    ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 1.4; line(b0, b1);
    const c = P(-12, 12);
    ctx.fillStyle = D.flower || '#d8344f';
    for (let k = 0; k < 5; k++) { const an = k * Math.PI * 0.4 + 0.3; circle([c[0] + Math.cos(an) * 2.3, c[1] + Math.sin(an) * 2.3], 1.9); }
    ctx.fillStyle = '#ffe07a'; circle(c, 1.1);
    for (const k of [0, 1]) {   // 步摇
      const top = P(-13 + k * 3, 10), bot = P(-14 + k * 3 + sway * 0.25, 2 - k * 2);
      ctx.strokeStyle = 'rgba(233,196,106,0.9)'; ctx.lineWidth = 0.7; line(top, bot);
      ctx.fillStyle = k ? '#ffd7df' : '#e9c46a'; circle(bot, 1.3);
    }
    const m = P(6.5, 6.5);   // 花钿
    ctx.fillStyle = '#d8344f'; for (let k = 0; k < 5; k++) { const an = k * Math.PI * 0.4 - Math.PI / 2; circle([m[0] + Math.cos(an) * 1.2, m[1] + Math.sin(an) * 1.2], 0.75); }
  } else if (hd === 'jadepin') {   // 烟雨：一根青玉簪横穿发髻，簪头垂一缕青穗
    const a = P(-11, 12), b = P(3, 17);
    ctx.strokeStyle = '#2f6a62'; ctx.lineWidth = 2.6; line(a, b);
    ctx.strokeStyle = '#8fd0c0'; ctx.lineWidth = 1.2; line(a, b);
    ctx.fillStyle = '#7cc6b4'; circle(b, 2.2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; circle([b[0] - 0.6, b[1] - 0.6], 0.8);
    ctx.strokeStyle = 'rgba(95,160,150,0.85)'; ctx.lineWidth = 1;
    for (const d of [-1.2, 0, 1.2]) { const e = P(-15 + d + sway * 0.4, 4 - Math.abs(d)); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + e[0]) / 2 + d, (a[1] + e[1]) / 2, e[0], e[1]); ctx.stroke(); }
  } else if (hd === 'hood') {   // 兜帽
    ctx.fillStyle = D.hoodC || '#222'; ctx.beginPath();
    const a0 = Math.atan2(uy, ux); ctx.arc(hx, hy, 13, a0 - Math.PI / 2 - 0.9, a0 + Math.PI / 2 + 0.25);
    const tail = P(-18, -8 + sway * 0.5); ctx.lineTo(tail[0], tail[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(${L.slash},0.6)`; ctx.lineWidth = 1; ctx.stroke();
  } else if (hd === 'plume') {   // 翎羽冠
    const cols = D.plumeC || ['#fff', '#ddd'];
    for (let k = 0; k < 3; k++) {
      const b0 = P(-3, 10), c1 = P(-16 - k * 6, 30 + k * 4), tp = P(-34 - k * 10, 34 + k * 6 + sway * (1 + k * 0.4));
      ctx.strokeStyle = cols[k % cols.length]; ctx.lineWidth = 3.2 - k * 0.6; ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.stroke();
    }
  } else if (hd === 'headband') {   // 头巾 + 飘带
    ctx.strokeStyle = D.band; ctx.lineWidth = 3; line(P(-10, 3), P(10, 3));
    ctx.lineWidth = 2.2; for (const k of [0, 1]) { const b0 = P(-10, 3), c1 = P(-22, -2 - k * 4 + sway), tp = P(-34 - k * 4, -8 - k * 6 + sway * 1.5); ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.stroke(); }
  }
  if (D.shoulder) {   // 护肩
    ctx.fillStyle = D.shoulder; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(sk.sh[0], sk.sh[1] + 2, 10, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (D.breastplate) {   // 斜挎的甲带（不画胸口的护心镜圆片）
    const a0 = [sk.sh[0] + sk.face * 4, sk.sh[1] - 1], a1 = [sk.hip[0] - sk.face * 6, sk.hip[1] + 2];
    ctx.strokeStyle = D.breastplate; ctx.lineWidth = 4.5; line(a0, a1);
    ctx.strokeStyle = `rgba(${L.slash},0.7)`; ctx.lineWidth = 1; line(a0, a1);
  }
  if (D.robe) {   // 独有服饰下摆 / 战袍长裾
    const rbCol = D.robeC ? D.robeC : D.robe === 'ice' ? '#b8d8ff' : D.robe === 'gold' ? '#e5b842' : D.robe === 'dark' ? '#321650'
      : D.robe === 'leaf' ? '#1f8f68' : D.robe === 'crimson' ? '#781420' : D.robe === 'spirit' ? '#105577'
      : D.robe === 'bronze' ? '#8a6838' : D.robe === 'heavy' ? '#242030' : D.robe === 'shura' ? '#5a1212'
      : D.robe === 'plum' ? '#c02a4a' : D.robe === 'aurora' ? '#287766' : D.robe === 'ocean' ? '#12406e'
      : D.robe === 'dusk' ? '#a04822' : D.robe === 'celestial' ? '#306496' : D.robe === 'bamboo' ? '#2a4830'
      : D.robe === 'thunder' ? '#4a287c' : D.robe === 'solar' ? '#ba5416' : D.robe === 'vajra' ? '#6a3610'
      : D.robe === 'cinnabar' ? '#882014' : D.robe === 'gilt' ? '#8a6820' : D.robe === 'starry' ? '#14244a'
      : D.robe === 'sakura' ? '#c86488' : D.robe === 'eclipse' ? '#34101e' : D.robe === 'snow' ? '#4478a8'
      : D.robe === 'raven' ? '#1c1c24' : D.robe === 'jade_master' ? '#1a5448' : D.robe === 'phoenix' ? '#a83610' : D.robe === 'foxfire' ? '#c8361e' : '#284666';
    ctx.fillStyle = rbCol; ctx.strokeStyle = `rgba(${L.slash},0.6)`; ctx.lineWidth = 1.2;
    const h = sk.hip, kf = sk.kf, kb = sk.kb;
    const rDir = -sk.face;
    const rTipX = (kf[0] + kb[0]) * 0.5 + rDir * (12 + Math.abs(sway)), rTipY = Math.max(kf[1], kb[1]) + 8 + (f.state === 'skill' ? Math.sin(t * 18) * 6 : 0);
    ctx.beginPath(); ctx.moveTo(h[0] - 6, h[1]); ctx.lineTo(h[0] + 6, h[1]);
    ctx.quadraticCurveTo(kf[0] + 8, kf[1], rTipX, rTipY);
    ctx.quadraticCurveTo(kb[0] - 8, kb[1], h[0] - 6, h[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (D.dress) {   // 及踝长裙：上浅下深，裙摆随风往后飘；腰上一道带子，两根带尾往后飘
    const h = sk.hip, kf = sk.kf, kb = sk.kb, ff = sk.ff, fb = sk.fb, fc = sk.face, bk = -fc;
    const wF = [h[0] + fc * 6, h[1] - 4], wB = [h[0] - fc * 6, h[1] - 4];
    const hemF = [ff[0] + fc * 3, ff[1] - 6], hemB = [fb[0] + bk * (5 + Math.abs(sway) * 0.8), fb[1] - 5 + sway * 0.3];
    const g = ctx.createLinearGradient(h[0], h[1], h[0], Math.max(ff[1], fb[1]));
    g.addColorStop(0, D.dress[0]); g.addColorStop(0.45, D.dress[0]); g.addColorStop(1, D.dress[1]);
    ctx.fillStyle = g; ctx.strokeStyle = `rgba(${L.slash},0.55)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wB[0], wB[1]); ctx.lineTo(wF[0], wF[1]);
    ctx.quadraticCurveTo(kf[0] + fc * 7, kf[1], hemF[0], hemF[1]);
    const mid = [(hemF[0] + hemB[0]) / 2, Math.max(hemF[1], hemB[1]) + 3];
    ctx.quadraticCurveTo(mid[0] + Math.sin(t * 4) * 3, mid[1], hemB[0], hemB[1]);
    ctx.quadraticCurveTo(kb[0] + bk * 8, kb[1], wB[0], wB[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8;   // 两道褶
    for (const q of [0.35, 0.65]) { const a = lerp2(wB, wF, q), b = lerp2(hemB, hemF, q); ctx.beginPath(); ctx.moveTo(a[0], a[1] + 3); ctx.quadraticCurveTo((a[0] + b[0]) / 2 + bk * 2, (a[1] + b[1]) / 2, b[0], b[1] - 3); ctx.stroke(); }
    if (D.sash) {
      ctx.strokeStyle = D.sash; ctx.lineWidth = 3; line([wB[0] - fc, wB[1] + 1], [wF[0] + fc, wF[1] + 1]);
      ctx.lineWidth = 1.6;
      for (const k of [0, 1]) { const b0 = [wB[0], wB[1] + 1], c1 = [b0[0] + bk * (8 + k * 3), b0[1] + 10 + sway], e = [b0[0] + bk * (12 + k * 5 + Math.abs(sway)), b0[1] + 22 + k * 5 + sway * 1.4]; ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]); ctx.stroke(); }
    }
  }
  if (D.orbs) {   // 环绕周身的灵珠/法球（技能时加速旋转并放大）
    const orbSpin = (f.state === 'skill' || f.state === 'special' ? t * 8 : t * 2.5);
    const orbR = 24 + (f.state === 'special' ? 14 : f.state === 'skill' ? 8 : 0);
    const cx0 = (sk.hip[0] + sk.sh[0]) * 0.5, cy0 = (sk.hip[1] + sk.sh[1]) * 0.5;
    for (let k = 0; k < 3; k++) {
      const an = orbSpin + k * (Math.PI * 2 / 3);
      const ox = cx0 + Math.cos(an) * orbR, oy = cy0 + Math.sin(an) * (orbR * 0.42);
      ctx.fillStyle = D.orbs; circle([ox, oy], 3.8);
      ctx.fillStyle = '#fff'; circle([ox - 1, oy - 1], 1.6);
      if (f.state === 'skill' || f.state === 'special') {
        ctx.strokeStyle = `rgba(${L.slash},0.7)`; ctx.lineWidth = 1;
        line([cx0, cy0], [ox, oy]);
      }
    }
  }
  ctx.restore();
}
function drawTaperedSeg(a, b, r1, r2, fill) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a[0] + nx * r1, a[1] + ny * r1);
  ctx.lineTo(b[0] + nx * r2, b[1] + ny * r2);
  ctx.arc(b[0], b[1], r2, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
  ctx.lineTo(a[0] - nx * r1, a[1] - ny * r1);
  ctx.arc(a[0], a[1], r1, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
  ctx.closePath();
  ctx.fill();
}
function drawFace(sk, f, L, flash) {
  if (flash) return;
  const h = sk.head, nx = h[0] - sk.neck[0], ny = h[1] - sk.neck[1], nl = Math.hypot(nx, ny) || 1;
  const ux = nx / nl, uy = ny / nl, fx = -uy * sk.face, fy = ux * sk.face;
  const ex = h[0] + fx * 5.2 + ux * 1.2, ey = h[1] + fy * 5.2 + uy * 1.2;
  ctx.save();
  const isGlow = L.legend || ['feiying', 'tieshan', 'leiming', 'gouchen'].includes(f.ch && f.ch.id);
  ctx.strokeStyle = isGlow ? `rgb(${L.slash})` : '#121521';
  ctx.lineWidth = isGlow ? 2.1 : 1.7;
  ctx.beginPath();
  ctx.moveTo(ex - fx * 2.4 + ux * 0.6, ey - fy * 2.4 + uy * 0.6);
  ctx.lineTo(ex + fx * 2.2 - ux * 0.3, ey + fy * 2.2 - uy * 0.3);
  ctx.stroke();
  if (f.ch && f.ch.id === 'yuehua') {
    ctx.fillStyle = `rgb(${L.slash})`;
    circle([h[0] + fx * 6.5 + ux * 4.5, h[1] + fy * 6.5 + uy * 4.5], 1.5);
  }
  ctx.restore();
  if (L.legend && L.fx) skinEyes(f, ex, ey);
}
function drawBody(sk, f, o) {
  const L = f.look; DRAW_F = f;
  if (L.deco && !o.ghost) drawDeco(sk, f, L, 'back');
  const chId = (f.ch && f.ch.id) || 'qingfeng';
  const isHeavy = chId === 'tieshan' || chId === 'gouchen';
  const isRobed = chId === 'liuyun' || chId === 'yuxiao' || chId === 'yuehua' || chId === 'moyu';
  const isMartial = chId === 'leiming' || chId === 'zuixian';
  const shF = sk.shF || sk.sh, shB = sk.shB || sk.sh;
  const segs = [
    [sk.hip, sk.kb, isHeavy ? 5.2 : 4.2, isHeavy ? 4.4 : 3.5, 1],
    [sk.kb, sk.fb, isHeavy ? 4.8 : (isMartial ? 4.4 : 3.6), isHeavy ? 4.2 : 3.0, 1],
    [shB, sk.eb, isHeavy ? 4.6 : 3.6, isRobed ? 5.2 : 3.2, 1],
    [sk.eb, sk.hb, isRobed ? 5.4 : 3.4, isRobed ? 6.2 : (isHeavy ? 4.2 : 2.9), 1],
    [sk.hip, sk.neck, isHeavy ? 6.2 : 4.8, isHeavy ? 7.8 : (isMartial ? 6.8 : 5.8), 0],
    [sk.hip, sk.kf, isHeavy ? 5.2 : 4.2, isHeavy ? 4.4 : 3.5, 0],
    [sk.kf, sk.ff, isHeavy ? 4.8 : (isMartial ? 4.4 : 3.6), isHeavy ? 4.2 : 3.0, 0],
  ];
  const arm = [
    [shF, sk.ef, isHeavy ? 4.6 : 3.6, isRobed ? 5.2 : 3.2, 0],
    [sk.ef, sk.hf, isRobed ? 5.4 : 3.4, isRobed ? 6.4 : (isHeavy ? 4.2 : 3.0), 0]
  ];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.ghost) {
    const gc = o.tint || L.slash;
    ctx.fillStyle = `rgba(${gc},${o.ghost})`;
    for (const s of [...segs, ...arm]) drawTaperedSeg(s[0], s[1], s[2], s[3], `rgba(${gc},${o.ghost})`);
    circle(sk.head, 10);
    if (L.weapon !== 'fists') { ctx.strokeStyle = `rgba(${gc},${o.ghost})`; ctx.lineWidth = 2.5; line(sk.hilt, sk.tip); }
    return;
  }
  const alpha = o.invul ? 0.55 : 1;
  const hideBaseHead = !!(L.deco && L.deco.hideBaseHead);
  if (L.legend && L.fx && !o.flash) skinGlow([...segs, ...arm], sk, f, L);
  ctx.globalAlpha = alpha;
  // 外轮廓
  ctx.strokeStyle = L.outline; ctx.fillStyle = L.outline;
  ctx.globalAlpha = alpha * L.outlineA;
  for (const s of [...segs, ...arm]) drawTaperedSeg(s[0], s[1], s[2] + 2.5, s[3] + 2.5, L.outline);
  circle(sk.head, 12.5);
  if (!hideBaseHead) headAcc(sk, 3, L.outline, L);
  weapon(sk, L, true, false);
  ctx.globalAlpha = alpha;
  // 身体与流派服饰细节
  for (const s of segs) drawTaperedSeg(s[0], s[1], s[2], s[3], o.flash ? '#fff' : (s[4] ? L.shade : L.body));
  // 腰封 / 战甲裙甲点缀
  if (!o.flash) {
    ctx.strokeStyle = L.scarf; ctx.lineWidth = isHeavy ? 4.2 : 2.8;
    line([sk.hip[0] - 6, sk.hip[1]], [sk.hip[0] + 6, sk.hip[1]]);
  }
  ctx.fillStyle = o.flash ? '#fff' : L.body; circle(sk.head, 10);
  drawFace(sk, f, L, o.flash);
  if (!hideBaseHead) headAcc(sk, 0, o.flash ? '#fff' : L.body, L);
  weapon(sk, L, false, o.flash);
  if (L.fx && !o.flash) { if (L.legend) skinBlade(sk, f, L); else skinTint(sk, f, L); }
  if (L.deco && L.deco.zw && !o.flash) drawZodiacGleam(sk, L);
  // 前手臂（在剑柄之上）
  for (const s of arm) drawTaperedSeg(s[0], s[1], s[2], s[3], o.flash ? '#fff' : L.body);
  if (!o.flash && !isRobed) {
    ctx.strokeStyle = L.scarf; ctx.lineWidth = 2.0;
    line(sk.ef, [(sk.ef[0] + sk.hf[0]) * 0.5, (sk.ef[1] + sk.hf[1]) * 0.5]);
  }
  ctx.globalAlpha = 1;
  if (L.deco) drawDeco(sk, f, L, 'front');
}
// 头饰：topknot 发髻 hat 斗笠 hood 兜帽 helm 头盔 ponytail 马尾 bun 双髻 band 头带 moon 月牙簪
function headAcc(sk, grow, color, L) {
  const h = sk.head, nx = h[0] - sk.neck[0], ny = h[1] - sk.neck[1], nl = Math.hypot(nx, ny) || 1;
  const ux = nx / nl, uy = ny / nl, px = -uy, py = ux, bk = -sk.face;
  const outline = grow > 0;
  ctx.fillStyle = color; ctx.strokeStyle = color;
  switch (L.head) {
    case 'hat': hat(sk, grow); break;
    case 'topknot': topknot(sk, grow, outline ? color : L.hair || color); break;
    case 'hood':
      ctx.beginPath(); ctx.moveTo(h[0] + ux * (12 + grow), h[1] + uy * (12 + grow)); ctx.lineTo(h[0] + bk * (22 + grow) - ux * 6, h[1] - uy * 6 + 4);
      ctx.lineTo(h[0] - ux * (8 + grow) + bk * 4, h[1] - uy * (8 + grow)); ctx.closePath();
      if (!outline) ctx.fillStyle = L.shade; ctx.fill();
      if (!outline) { ctx.fillStyle = L.scarf; ctx.fillRect(h[0] - 7 + sk.face * 2, h[1] + 1, 12, 4); }
      break;
    case 'helm':
      ctx.beginPath(); ctx.arc(h[0] + ux * 2, h[1] + uy * 2, 12 + grow, Math.atan2(uy, ux) - 1.7, Math.atan2(uy, ux) + 1.7); ctx.closePath();
      if (!outline) ctx.fillStyle = L.helmC || '#9a9ea8'; ctx.fill();
      if (!outline) { ctx.fillStyle = L.scarf; ctx.beginPath(); ctx.arc(h[0] + ux * 14, h[1] + uy * 14, 3.5, 0, 7); ctx.fill(); }
      break;
    case 'ponytail': {
      ctx.lineWidth = 5 + grow; ctx.lineCap = 'round';
      const a = [h[0] + ux * 6 + bk * 6, h[1] + uy * 6], b = [a[0] + bk * 16, a[1] + 10 + Math.sin(clock * 5) * 3], c = [b[0] + bk * 8, b[1] + 16];
      if (!outline) ctx.strokeStyle = L.hair || '#2a2f3a';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); ctx.stroke();
      break;
    }
    case 'bun':
      if (!outline) ctx.fillStyle = L.hair || '#2a3a30';
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(h[0] + ux * 9 + px * sd * 8, h[1] + uy * 9 + py * sd * 8, 5 + grow, 0, 7); ctx.fill(); }
      break;
    case 'band':
      if (!outline) {
        ctx.strokeStyle = L.scarf; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(h[0] + px * 10, h[1] + py * 10); ctx.lineTo(h[0] - px * 10, h[1] - py * 10); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h[0] + bk * 9, h[1]); ctx.lineTo(h[0] + bk * 22, h[1] + 6 + Math.sin(clock * 9) * 3); ctx.stroke();
      }
      break;
    case 'feather':
      if (!outline) {
        ctx.strokeStyle = L.scarf; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(h[0] + ux * 8, h[1] + uy * 8); ctx.quadraticCurveTo(h[0] + ux * 22 + bk * 8, h[1] + uy * 22, h[0] + ux * 16 + bk * 22, h[1] + uy * 20 + 4); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      topknot(sk, grow, outline ? color : L.hair || '#2a3050');
      break;
    case 'jade': {  // 玉箫：披发、发髻、一支青玉簪
      if (!outline) {
        ctx.strokeStyle = L.hair || '#1f2a26'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(h[0] + bk * 7 + ux * 2, h[1] + uy * 2); ctx.quadraticCurveTo(h[0] + bk * 16, h[1] + 8, h[0] + bk * 13 + Math.sin(clock * 3) * 2, h[1] + 26); ctx.stroke();
      }
      topknot(sk, grow, outline ? color : L.hair || '#1f2a26');
      if (!outline) {
        const kp = [h[0] + ux * 10 - sk.face * 5, h[1] + uy * 10];
        ctx.strokeStyle = '#7fe0b0'; ctx.lineWidth = 2; line([kp[0] - px * 8, kp[1] - py * 8], [kp[0] + px * 8, kp[1] + py * 8]);
        ctx.fillStyle = '#c9f5dc'; circle([kp[0] + px * 8, kp[1] + py * 8], 1.8);
      }
      break;
    }
    case 'messy': {  // 醉翁：乱发几撮，红布条扎额，带子飘在脑后
      if (!outline) ctx.fillStyle = L.hair || '#3a2a1e';
      for (const k of [-1, 0, 1]) {
        const b = [h[0] + ux * 8 + px * k * 6, h[1] + uy * 8 + py * k * 6], tp = [h[0] + ux * (16 + grow) + px * k * 10 + bk * 4, h[1] + uy * (16 + grow) + py * k * 10];
        ctx.beginPath(); ctx.moveTo(b[0] - px * 4, b[1] - py * 4); ctx.lineTo(tp[0], tp[1]); ctx.lineTo(b[0] + px * 4, b[1] + py * 4); ctx.closePath(); ctx.fill();
      }
      if (!outline) {
        ctx.strokeStyle = L.scarf; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
        line([h[0] + px * 10 + ux * 3, h[1] + py * 10 + uy * 3], [h[0] - px * 10 + ux * 3, h[1] - py * 10 + uy * 3]);
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h[0] + bk * 9 + ux * 3, h[1] + uy * 3); ctx.quadraticCurveTo(h[0] + bk * 18, h[1] + 2, h[0] + bk * 24, h[1] + 8 + Math.sin(clock * 7) * 3); ctx.stroke();
      }
      break;
    }
    case 'mask': {  // 勾陈：发髻，黑面巾遮住下半张脸
      topknot(sk, grow, outline ? color : L.hair || '#15171c');
      if (!outline) {
        const au = Math.atan2(uy, ux);
        ctx.fillStyle = '#15171c'; ctx.beginPath(); ctx.arc(h[0], h[1], 9.4, au + 1.75, au + 4.55); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = L.scarf; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(h[0], h[1], 9.4, au + 1.75, au + 4.55); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h[0] + bk * 8, h[1] + 3); ctx.quadraticCurveTo(h[0] + bk * 16, h[1] + 6, h[0] + bk * 21, h[1] + 12 + Math.sin(clock * 8) * 3); ctx.stroke();
      }
      break;
    }
    case 'moon':
      if (!outline) {
        ctx.strokeStyle = '#f5e6a8'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(h[0] + ux * 11 + bk * 4, h[1] + uy * 11, 7, 0.6, 3.6); ctx.stroke();
      }
      topknot(sk, grow, outline ? color : L.hair || '#3a3050');
      break;
  }
}
// 武器：sword 剑 dual 双刀 greatsword 巨剑 spear 长枪 fan 扇 fists 拳套 brush 大笔 moonblade 月刃
const FLAIL = new WeakMap();
let DRAW_F = null;
function flailSim(sk, L, step) {
  const N = 9, hand = sk.hf, key = DRAW_F || L;
  let s = FLAIL.get(key);
  if (!s || !Number.isFinite(s.p[N - 1][0]) || Math.hypot(s.p[0][0] - hand[0], s.p[0][1] - hand[1]) > 260) {
    s = { p: [], o: [], len: 62, t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) };
    for (let i = 0; i < N; i++) { s.p.push([hand[0] - (L.flFace || 0), hand[1] + i * 7.7]); s.o.push([hand[0], hand[1] + i * 7.7]); }
    FLAIL.set(key, s);
  }
  if (!step) return s;
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()), dt = clamp((now - s.t) / 1000, 0, 1 / 30); s.t = now;
  if (dt <= 0) return s;
  const mode = L.flMode || 'hang', to = L.flTo || hand, far = mode === 'out' || mode === 'ult';
  const want = far ? Math.hypot(to[0] - hand[0], to[1] - hand[1]) : mode === 'spin' ? 140 : mode === 'whip' ? 80 : 62;
  s.len = far ? want : s.len + (want - s.len) * Math.min(1, dt * 9);   // 收链：长度慢慢缩回去，锤子像被拽回来
  const sub = 3, h = dt / sub, seg = s.len / (N - 1), P = s.p, O = s.o;
  for (let it = 0; it < sub; it++) {
    P[0][0] = O[0][0] = hand[0]; P[0][1] = O[0][1] = hand[1];
    for (let i = 1; i < N; i++) {
      const p = P[i], o = O[i], vx = (p[0] - o[0]) * 0.99, vy = (p[1] - o[1]) * 0.99;
      o[0] = p[0]; o[1] = p[1]; p[0] += vx; p[1] += vy + 2100 * h * h;
    }
    let kin = null;
    if (far) kin = to;
    else if (mode === 'spin') { const a = (L.flSpin || 0) * 19; kin = [hand[0] + Math.cos(a) * s.len, hand[1] + Math.sin(a) * s.len * 0.36]; }
    else if (mode === 'whip') {   // 出招：锤头被甩向招式指的方向，带着惯性追过去
      const dx = sk.tip[0] - sk.hilt[0], dy = sk.tip[1] - sk.hilt[1], d = Math.hypot(dx, dy) || 1, hd = P[N - 1];
      hd[0] += (hand[0] + dx / d * s.len - hd[0]) * 0.22; hd[1] += (hand[1] + dy / d * s.len - hd[1]) * 0.22;
    }
    if (kin) { P[N - 1][0] = kin[0]; P[N - 1][1] = kin[1]; }
    if (kin) for (let i = 1; i < N - 1; i++) {   // 甩出去或抡圆了链子是绷直的，只稍微垂一点
      const q = i / (N - 1), sag = far ? Math.sin(q * Math.PI) * Math.min(14, s.len * 0.04) : 0;
      P[i][0] += (hand[0] + (kin[0] - hand[0]) * q - P[i][0]) * 0.4; P[i][1] += (hand[1] + (kin[1] - hand[1]) * q + sag - P[i][1]) * 0.4;
    }
    for (let r = 0; r < 6; r++) for (let i = 0; i < N - 1; i++) {
      const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 0.001;
      const wa = i === 0 ? 0 : 1, wb = i + 1 === N - 1 ? (kin ? 0 : 0.45) : 1, w = wa + wb;
      if (!w) continue;
      const k = (d - seg) / d / w;
      a[0] += dx * k * wa; a[1] += dy * k * wa; b[0] -= dx * k * wb; b[1] -= dy * k * wb;
    }
    for (let i = 1; i < N; i++) { const gy = i === N - 1 ? -11 : -2; if (P[i][1] > gy && !(kin && i === N - 1)) { P[i][1] = gy; O[i][0] += (P[i][0] - O[i][0]) * 0.3; } }   // 落地拖着走
  }
  return s;
}
