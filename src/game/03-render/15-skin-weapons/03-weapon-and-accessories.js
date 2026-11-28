function weapon(sk, L, outline, flash, f) {
  const g = sk.guard, t = sk.tip, hl = sk.hilt;
  const dx = t[0] - g[0], dy = t[1] - g[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, px = -uy, py = ux;
  const blade = flash ? '#fff' : L.blade;
  const ws = (L.deco && L.deco.weapStyle) || L.weapon;
  ctx.lineCap = 'round';
  const isRelicWeap = typeof ws === 'string' && ws.startsWith('relic_');
  if (L.weapon !== 'hammer' && L.weapon !== 'dyelash' && (L.weapon !== 'bastionshell' || isRelicWeap) && (skinWeapon(ws, sk, L, outline, flash, f) ||
      (ws !== L.weapon && skinWeapon(L.weapon, sk, L, outline, flash, f)))) return;
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
    case 'magnet': {  // 磁仙：两手各托一块磁石，颜色跟着正负极走（正极红、负极蓝）
      if (outline) { ctx.fillStyle = L.outline; circle(sk.hf, 9.5); circle(sk.hb, 8.5); return; }
      const pol = sk.pol || 1;
      for (const [p, r] of [[sk.hf, 7.5], [sk.hb, 6.5]]) {
        ctx.fillStyle = flash ? '#fff' : (pol > 0 ? '#c8382e' : '#2e5ec8'); circle(p, r);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle([p[0] - r * 0.3, p[1] - r * 0.3], r * 0.35);
      }
      drawMagSym(sk.hf[0], sk.hf[1], 4.6, pol, 0.95);
      return;
    }
    case 'puppet': {  // 千机：护腕带发条齿轮，手托金丝机关傀丸（球在手中时显示）
      if (outline) { ctx.fillStyle = L.outline; circle(sk.hf, 9.5); return; }
      ctx.fillStyle = flash ? '#fff' : (L.metal || '#d49b42'); circle(sk.hf, 7.5);
      ctx.fillStyle = '#2b2318'; circle([sk.hf[0] - 2, sk.hf[1] - 2], 4.2);
      ctx.strokeStyle = `rgba(${L.slash},0.85)`; ctx.lineWidth = 1.2;
      line([sk.hf[0] - 6, sk.hf[1]], [sk.hf[0] + 6, sk.hf[1]]);
      line([sk.hf[0], sk.hf[1] - 6], [sk.hf[0], sk.hf[1] + 6]);
      return;
    }
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
    case 'gourd': {  // 醉翁：缠布的拳头，另一只手拎着酒葫芦
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
    case 'dyelash': {  // 幽篁：回纹绞带，柔韧绸带连铅坠
      const s = flailSim(sk, L, 0);
      if (!s) return;
      const pts = s.p, hd = pts[pts.length - 1];
      if (outline) {
        ctx.strokeStyle = L.outline; ctx.lineWidth = 6.0;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke(); circle(hd, 8); return;
      }
      ctx.strokeStyle = flash ? '#fff' : '#c2528c'; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : '#6cf0c2'; circle(hd, 5.5);
      ctx.strokeStyle = '#fce7cc'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(hd[0], hd[1], 5.5, 0, 7); ctx.stroke();
      return;
    }
    case 'bastionshell': {  // 玄武：玄甲重链流星锤
      const s = flailSim(sk, L, 0);
      if (!s) return;
      const pts = s.p, hd = pts[pts.length - 1];
      if (outline) {
        ctx.strokeStyle = L.outline; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke(); circle(hd, 11.5); return;
      }
      ctx.strokeStyle = flash ? '#fff' : '#58695c'; ctx.lineWidth = 3.0;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : '#2d3b32'; circle(hd, 9.2);
      ctx.strokeStyle = '#8cd48c'; ctx.lineWidth = 2.0;
      for (let k = 0; k < 6; k++) {
        const a = k * 1.047 + clock * 2;
        line(hd, [hd[0] + Math.cos(a) * 11, hd[1] + Math.sin(a) * 11]);
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
