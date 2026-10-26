// ======================= 皮肤：换配色 + 光效，不往身上贴图形 =======================
// 皮肤保留角色原本的发型、帽子、兵器样子，只换颜色；好看的东西都做成“光”和“动”：
//   精英：主题色的刀光拖尾，出招时带一点主题粒子，命中有小爆点。
//   传说：在精英的基础上，兵器刃口发光并有流光走过，围巾变成光带，身上有呼吸的微光，
//         眼睛发光、快速移动时拖出一道眼光，身边常驻主题氛围（火星、寒雾、暗焰、电弧……），
//         命中是整套主题爆发（火团、冰碎、内爆、雷枝、水花……）。
// 每个主题：trail 拖尾画法、amb 氛围粒子、hit 命中爆发
const SKIN_TH = {
  flame: { trail: 'fire', amb: 'ember', hit: 'fire' },
  frost: { trail: 'frost', amb: 'mist', hit: 'shatter' },
  void: { trail: 'smoke', amb: 'wisp', hit: 'implode' },
  thunder: { trail: 'bolt', amb: 'arc', hit: 'fork' },
  water: { trail: 'flow', amb: 'drop', hit: 'splash' },
  aurora: { trail: 'prism', amb: 'glint', hit: 'prism' },
  star: { trail: 'star', amb: 'glint', hit: 'starburst' },
  gold: { trail: 'gilt', amb: 'flake', hit: 'gilt' },
  ink: { trail: 'brush', amb: 'inkdrop', hit: 'inksplat' },
  wind: { trail: 'wind', amb: 'streak', hit: 'gust' },
  rain: { trail: 'flow', amb: 'drop', hit: 'splash' },
  petal: { trail: 'ribbon', amb: 'petal', hit: 'petals' },
  leaf: { trail: 'ribbon', amb: 'leaf', hit: 'petals' },
  feather: { trail: 'ribbon', amb: 'feather', hit: 'petals' },
  metal: { trail: 'ribbon', amb: 'spark', hit: 'sparks' },
  nebula: { trail: 'prism', amb: 'glint', hit: 'starburst' },
  butterfly: { trail: 'prism', amb: 'glint', hit: 'petals' },
  crystal: { trail: 'frost', amb: 'glint', hit: 'shatter' },
  note: { trail: 'gilt', amb: 'flake', hit: 'petals' },
};
const rgbMix = (a, b, k) => { const p = a.split(','), q = b.split(','); return p.map((v, i) => Math.round(+v + (+q[i] - +v) * k)).join(','); };
const skinTh = L => L && L.fx ? SKIN_TH[L.fx.th] : null;
// 武库品质：保密 2、隐秘 3、非凡 4（不在武库里的皮肤是 0）。越高，拖尾、命中、开场、残影越华丽，只改画面和声音
const TIER_RANK = { mil: 0, res: 1, cla: 2, cov: 3, gold: 4 };
const tierRank = L => (L && L.fx && TIER_RANK[L.tier]) || 0;
const TIER_TXT = { cla: ['保密', '235,120,255'], cov: ['隐秘', '255,120,110'], gold: ['★ 非凡', '255,214,120'] };
// 兵器上“发光的那一段”：刀剑枪是护手到刃尖，拳和葫芦是两只手，锤是锤头
function skinBladeSeg(sk, f, L) {
  const w = L.weapon;
  if (w === 'fists' || w === 'gourd') return null;
  if (w === 'hammer') { const s = FLAIL.get(f); if (!s) return null; const n = s.p.length; return [s.p[n - 3], s.p[n - 1]]; }
  if (w === 'flute' || w === 'brush') return [sk.hilt, sk.tip];
  if (w === 'fan') { const dx = sk.tip[0] - sk.guard[0], dy = sk.tip[1] - sk.guard[1], d = Math.hypot(dx, dy) || 1; return [[sk.guard[0] + dx / d * 12, sk.guard[1] + dy / d * 12], [sk.guard[0] + dx / d * 31, sk.guard[1] + dy / d * 31]]; }
  return [sk.guard, sk.tip];
}
const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
// 锯齿电弧：两点之间随机折几下（每帧都变，看起来在噼啪跳）
function zigzag(a, b, n, amp) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, px = -dy / d, py = dx / d;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]);
  for (let i = 1; i < n; i++) { const k = i / n, o = (Math.random() - 0.5) * 2 * amp; ctx.lineTo(a[0] + dx * k + px * o, a[1] + dy * k + py * o); }
  ctx.lineTo(b[0], b[1]); ctx.stroke();
}
function glint(x, y, r, rgb, a) {   // 四角星光
  ctx.fillStyle = `rgba(${rgb},${a})`;
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r * 0.28, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r * 0.28, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y + r * 0.2); ctx.quadraticCurveTo(x, y, x + r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y - r * 0.2); ctx.quadraticCurveTo(x, y, x - r * 0.7, y); ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, 7); ctx.fill();
}
// 传说：身体外面一圈会呼吸的微光（画在描边下面）
function skinGlow(segs, sk, f, L) {
  const c = L.fx.c, br = 0.75 + 0.25 * Math.sin(clock * 2.4 + (f.idx || 0) * 1.7);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [grow, a] of [[11, 0.05], [6, 0.08]]) {
    ctx.globalAlpha = a * br;
    for (const s of segs) drawTaperedSeg(s[0], s[1], s[2] + grow, s[3] + grow, `rgb(${c})`);
    ctx.fillStyle = `rgb(${c})`; circle(sk.head, 10 + grow);
  }
  ctx.restore();
}
// 传说：兵器刃口发光，一道流光从护手走到刃尖；每个主题再加自己的东西
function skinBlade(sk, f, L) {
  if (L.deco && L.deco.weapStyle === 'fox_fan') return;   // 狐火扇自己会发光
  const seg = skinBladeSeg(sk, f, L), th = L.fx.th, c = L.fx.c, c2 = L.fx.c2 || c, t = clock;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  if (!seg) {   // 拳、葫芦：两只手上一团光
    for (const h of [sk.hf, sk.hb]) {
      const r = 13 + Math.sin(t * 6 + h[0] * 0.1) * 2, g = ctx.createRadialGradient(h[0], h[1], 0, h[0], h[1], r);
      g.addColorStop(0, `rgba(255,255,255,0.55)`); g.addColorStop(0.35, `rgba(${c},0.45)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.fillRect(h[0] - r, h[1] - r, r * 2, r * 2);
      if (th === 'thunder' && Math.random() < 0.5) { ctx.strokeStyle = `rgba(${c},0.9)`; ctx.lineWidth = 1.3; const a = Math.random() * 6.28; zigzag(h, [h[0] + Math.cos(a) * 18, h[1] + Math.sin(a) * 18], 4, 4); }
      if (th === 'flame') { ctx.fillStyle = `rgba(${c2},0.5)`; const lk = 8 + Math.sin(t * 25 + h[1]) * 3; ctx.beginPath(); ctx.moveTo(h[0] - 5, h[1]); ctx.quadraticCurveTo(h[0], h[1] - lk * 2, h[0] + 1, h[1] - lk * 2.2); ctx.quadraticCurveTo(h[0] + 2, h[1] - lk, h[0] + 5, h[1]); ctx.fill(); }
    }
    ctx.restore(); return;
  }
  const [a, b] = seg, own = !!(L.deco && L.deco.weapStyle);   // 有自己兵器样子的皮肤，刃光压淡，不把兵器盖成一根光棍
  if (!own && (th === 'void' || th === 'ink' || th === 'star')) {   // 暗芯：先压一道深色，再描亮边
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = `rgba(${c2},${th === 'ink' ? 0.55 : 0.7})`; ctx.lineWidth = 7; line(a, b);
    ctx.globalCompositeOperation = 'lighter';
  }
  ctx.strokeStyle = `rgba(${c},${own ? 0.1 : 0.22})`; ctx.lineWidth = 9; line(a, b);
  if (!own) { ctx.strokeStyle = `rgba(${c},0.45)`; ctx.lineWidth = 4.5; line(a, b); }
  if (th === 'aurora') {   // 刃上的颜色在两种之间流动
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]), s = (t * 0.6) % 1;
    g.addColorStop(0, `rgba(${c},0.85)`); g.addColorStop(s, `rgba(${c2},0.85)`); g.addColorStop(1, `rgba(${c},0.85)`);
    ctx.strokeStyle = g; ctx.lineWidth = 2.6; line(a, b);
  }
  if (!own) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.1; line(a, b); }
  // 流光：一小段亮光沿刃走
  const k = (t * (th === 'gold' ? 0.9 : 1.4) + (f.idx || 0) * 0.37) % 1.4;
  if (k < 1) {
    const p0 = lerp2(a, b, Math.max(0, k - 0.18)), p1 = lerp2(a, b, Math.min(1, k + 0.04)), g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
    g.addColorStop(0, `rgba(255,255,255,0)`); g.addColorStop(0.8, `rgba(255,255,255,${th === 'gold' ? 1 : 0.85})`); g.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.strokeStyle = g; ctx.lineWidth = th === 'gold' ? 4 : 3; line(p0, p1);
  }
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, px = -dy / d, py = dx / d;
  if (th === 'flame') {   // 刃上冒火舌，往上飘
    for (let i = 0; i < 4; i++) {
      const q = lerp2(a, b, 0.25 + i * 0.22), lk = 7 + 5 * Math.sin(t * 22 + i * 2.1) + 3 * Math.sin(t * 37 + i);
      const g = ctx.createLinearGradient(q[0], q[1], q[0], q[1] - lk * 2.2); g.addColorStop(0, `rgba(${c},0.75)`); g.addColorStop(1, `rgba(${c2},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(q[0] - 3.5, q[1]); ctx.quadraticCurveTo(q[0] - 2, q[1] - lk * 1.4, q[0] + Math.sin(t * 9 + i) * 3, q[1] - lk * 2.2); ctx.quadraticCurveTo(q[0] + 2, q[1] - lk * 1.2, q[0] + 3.5, q[1]); ctx.fill();
    }
  } else if (th === 'frost' || th === 'star') {   // 刃上闪几颗星光
    for (let i = 0; i < 3; i++) { const ph = (t * 1.3 + i * 0.33) % 1, q = lerp2(a, b, hash(Math.floor(t * 1.3 + i * 0.33) * 3 + i)); glint(q[0], q[1], 7 * Math.sin(ph * Math.PI), th === 'star' ? '255,255,255' : c, 0.9 * Math.sin(ph * Math.PI)); }
  } else if (th === 'thunder') {
    if (Math.random() < 0.7) { ctx.strokeStyle = `rgba(${c},0.95)`; ctx.lineWidth = 1.4; zigzag(a, b, 6, 6); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.7; zigzag(a, b, 6, 3); }
  } else if (th === 'water') {   // 刃上一道起伏的水光
    ctx.strokeStyle = `rgba(${c2},0.7)`; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const k2 = i / 12, q = lerp2(a, b, k2), o = Math.sin(k2 * 9 - t * 8) * 2.6; ctx.lineTo(q[0] + px * o, q[1] + py * o); }
    ctx.stroke();
  } else if (th === 'wind') {   // 刃后几缕风线
    ctx.strokeStyle = `rgba(${c2},0.35)`; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { const o = i * 4 * -sk.face, s = (t * 3 + i * 0.3) % 1; line(lerp2([a[0] + px * o, a[1] + py * o], [b[0] + px * o, b[1] + py * o], s * 0.5), lerp2([a[0] + px * o, a[1] + py * o], [b[0] + px * o, b[1] + py * o], s * 0.5 + 0.5)); }
  }
  // 刃尖一点亮光（有自己兵器样子的皮肤不加，免得刃尖像挂了个球）
  if (own) { ctx.restore(); return; }
  const tg = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], 12); tg.addColorStop(0, `rgba(255,255,255,0.7)`); tg.addColorStop(0.4, `rgba(${c},0.35)`); tg.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = tg; ctx.fillRect(b[0] - 12, b[1] - 12, 24, 24);
  ctx.restore();
}
// 精英：兵器上一层淡淡的主题色
function skinTint(sk, f, L) {
  const seg = skinBladeSeg(sk, f, L); if (!seg) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${L.fx.c},${0.18 + 0.06 * Math.sin(clock * 3 + (f.idx || 0))})`; ctx.lineWidth = 6; line(seg[0], seg[1]);
  ctx.restore();
}
// 传说：眼睛发光；冲刺这类快速移动时眼光拖成一道线（走路不拖），每回合清空
const EYE_TR = new WeakMap();
function skinEyes(f, ex, ey) {
  const c = f.look.fx.c;
  let tr = EYE_TR.get(f);
  if (!tr || tr.r !== M.rseq) { tr = []; tr.r = M.rseq; EYE_TR.set(f, tr); }
  const now = performance.now() / 1000, last = tr[tr.length - 1];
  if (last && (now < last[2] || Math.hypot(last[0] - ex, last[1] - ey) > 160)) tr.length = 0;   // 瞬移、回滚或时间倒退：断开，不连线
  tr.push([ex, ey, now]); while (tr.length > 24 || (tr.length && now - tr[0][2] > 0.14)) tr.shift();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 7); g.addColorStop(0, `rgba(255,255,255,0.8)`); g.addColorStop(0.4, `rgba(${c},0.6)`); g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g; ctx.fillRect(ex - 7, ey - 7, 14, 14);
  if (tr.length > 2 && Math.hypot(tr[0][0] - ex, tr[0][1] - ey) > 90) {
    for (let i = 1; i < tr.length; i++) { const k = i / tr.length; ctx.strokeStyle = `rgba(${c},${0.75 * k})`; ctx.lineWidth = 2.6 * k; line(tr[i - 1], tr[i]); }
  }
  ctx.restore();
}
// 传说：围巾变光带（底色照旧，叠一层渐亮的光和亮边）
function skinScarf(f, left, right) {
  const c = f.look.fx.c, s = f.scarf, n = s.length;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(s[0].x, s[0].y, s[n - 1].x, s[n - 1].y);
  g.addColorStop(0, `rgba(${c},0.05)`); g.addColorStop(0.6, `rgba(${c},0.35)`); g.addColorStop(1, `rgba(255,255,255,0.55)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(${c},0.5)`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]); for (const p of left) ctx.lineTo(p[0], p[1]); ctx.stroke();
  ctx.restore();
}
// 传说：脚下一汪主题色的光（离地越高越淡）
function skinGround(f) {
  const c = f.look.fx.c, hg = clamp(1 + f.y / 160, 0, 1); if (hg <= 0) return;
  const r = 62 + Math.sin(clock * 2 + (f.idx || 0)) * 6;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(f.x, 1); ctx.scale(1, 0.16);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(${c},${0.32 * hg})`); g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
}
// 主题拖尾：替换默认的刀光（传说更亮、更宽）
function skinTrail(f, tr) {
  const L = f.look, th = skinTh(L), c = L.fx.c, c2 = L.fx.c2 || c, leg = L.legend, rk = tierRank(L), mul = (leg ? 1.25 : 0.95) + Math.max(0, rk - 1) * 0.1, kind = th.trail;
  ctx.save();
  const quad = (p, q, r, s) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(r[0], r[1]); ctx.lineTo(s[0], s[1]); ctx.closePath(); ctx.fill(); };
  if (kind === 'smoke' || kind === 'brush') {   // 深色的烟/墨先铺一层（正常混合）
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i], al = Math.max(0, b.life);
      ctx.fillStyle = `rgba(${c2},${(kind === 'brush' ? 0.8 : 0.55) * al})`;
      const ext = (p, q, k) => [q[0] + (q[0] - p[0]) * k, q[1] + (q[1] - p[1]) * k];
      quad(a.b, ext(a.b, a.t, 0.12), ext(b.b, b.t, 0.12), b.b);
      if (kind === 'brush' && i % 3 === 0 && al > 0.5) { ctx.beginPath(); ctx.arc(b.t[0] + Math.sin(i * 7) * 6, b.t[1] + Math.cos(i * 5) * 6, 1.6 + al * 1.5, 0, 7); ctx.fill(); }
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i], al = Math.max(0, b.life), q = i / tr.length;
    let col = c;
    if (kind === 'prism') col = rgbMix(c, c2, (Math.sin(q * 5 - clock * 4) + 1) / 2);
    else if (kind === 'fire') col = rgbMix(c2, c, al);
    if (a.h && b.h && kind !== 'brush') { ctx.fillStyle = `rgba(${col},${Math.min(0.45, 0.24 * al * mul)})`; quad(a.h, a.t, b.t, b.h); }
    ctx.fillStyle = `rgba(${col},${Math.min(1, (kind === 'smoke' || kind === 'brush' ? 0.35 : 0.62) * al * mul)})`; quad(a.b, a.t, b.t, b.b);
    ctx.strokeStyle = kind === 'fire' ? `rgba(255,240,200,${0.95 * al})` : `rgba(255,255,255,${0.9 * al})`;
    ctx.lineWidth = (2.6 * al + 0.6) * (leg ? 1.35 : 1.1); line(a.t, b.t);
    if (!leg) continue;
    const dx = b.t[0] - b.b[0], dy = b.t[1] - b.b[1], d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
    if (rk >= 4 && a.h && al > 0.15) {   // 非凡：刀光外沿再铺一层淡金的光边
      ctx.fillStyle = `rgba(${rgbMix(c, '255,226,150', 0.5)},${0.16 * al})`; quad(a.t, [a.t[0] + nx * 11 * al, a.t[1] + ny * 11 * al], [b.t[0] + nx * 11 * al, b.t[1] + ny * 11 * al], b.t);
    }
    if (rk >= 3 && i % 3 === 0 && al > 0.35) glint(b.t[0], b.t[1], (rk >= 4 ? 7.5 : 5.5) * al, rk >= 4 ? '255,240,190' : c2, al * 0.9);   // 隐秘以上：刃尖划过的地方留几颗星光
    if (kind === 'fire' && al > 0.2) {   // 刃尖外侧一排跳动的火舌
      const lk = (10 + 9 * Math.sin(clock * 30 + i * 1.9)) * al;
      const g = ctx.createLinearGradient(b.t[0], b.t[1], b.t[0] + nx * lk * 2, b.t[1] + ny * lk * 2 - lk);
      g.addColorStop(0, `rgba(${c},${0.7 * al})`); g.addColorStop(1, `rgba(${c2},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(a.t[0], a.t[1]); ctx.quadraticCurveTo(b.t[0] + nx * lk, b.t[1] + ny * lk - lk * 0.6, b.t[0] + nx * lk * 2, b.t[1] + ny * lk * 2 - lk); ctx.lineTo(b.t[0], b.t[1]); ctx.closePath(); ctx.fill();
    } else if ((kind === 'frost' || kind === 'star' || kind === 'gilt') && i % 4 === 0 && al > 0.3) {
      const p = lerp2(b.b, b.t, 0.4 + 0.5 * hash(i * 13 + Math.floor(clock * 8)));
      glint(p[0], p[1], (kind === 'gilt' ? 6 : 8) * al, kind === 'gilt' ? '255,245,210' : '255,255,255', al);
    } else if (kind === 'flow' && al > 0.2) {   // 水流：刃尖内侧一道起伏的浪花线
      const o = Math.sin(i * 0.9 - clock * 10) * 5 * al, p0 = [a.t[0] - nx * (9 + o), a.t[1] - ny * (9 + o)], p1 = [b.t[0] - nx * (9 - o), b.t[1] - ny * (9 - o)];
      ctx.strokeStyle = `rgba(${c2},${0.75 * al})`; ctx.lineWidth = 1.6 * al + 0.4; line(p0, p1);
    } else if (kind === 'wind' && al > 0.2) {   // 风：外侧两道细线
      for (const o of [10, 20]) { ctx.strokeStyle = `rgba(${c2},${0.45 * al * (o === 10 ? 1 : 0.6)})`; ctx.lineWidth = 1; line([a.t[0] + nx * o, a.t[1] + ny * o], [b.t[0] + nx * o, b.t[1] + ny * o]); }
    }
  }
  if (kind === 'bolt' && tr.length > 3) {   // 沿着刃尖的轨迹劈出一道闪电（每帧都在跳）
    const pts = tr.filter((e, i) => i % 3 === 0 && e.life > 0.15).map(e => e.t);
    if (pts.length > 1) for (const [w, col] of [[leg ? 2.4 : 1.6, c], [0.9, '255,255,255']]) {
      ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) { const m = lerp2(pts[i - 1], pts[i], 0.5); ctx.lineTo(m[0] + (Math.random() - 0.5) * 16, m[1] + (Math.random() - 0.5) * 16); ctx.lineTo(pts[i][0], pts[i][1]); }
      ctx.stroke();
    }
  }
  ctx.restore();
}
// 氛围粒子：传说常驻、出招时更多；精英只在出招时从刀光上掉一点
function skinAmbient(f) {
  const L = f.look, th = skinTh(L); if (!th) return;
  const leg = L.legend, c = L.fx.c, c2 = L.fx.c2 || c, kind = L.fx.part || th.amb;
  const e = f.trail.length > 1 ? f.trail[f.trail.length - 1] : null;
  if (e && Math.random() < (leg ? 0.8 : 0.45)) { const q = lerp2(e.b, e.t, 0.3 + Math.random() * 0.7); skinSpawn(kind, q[0], q[1], c, c2, leg ? 1 : 0.7, true); }
  if (!leg) { if (Math.random() < 0.04) skinSpawn(kind, f.x + rand(-24, 24), f.y - rand(10, 110), c, c2, 0.7, false); return; }
  if (Math.random() < 0.3) skinSpawn(kind, f.x + rand(-26, 26), f.y - rand(8, 120), c, c2, 1, false);
  if (tierRank(L) >= 3 && Math.random() < 0.12) addP({ type: 'glint', x: f.x + rand(-30, 30), y: f.y - rand(10, 125), vx: rand(-6, 6), vy: -rand(10, 30), life: rand(0.5, 0.9), max: 0.9, r: rand(2.5, 4.5), rgb: Math.random() < 0.5 ? c2 : '255,255,255' });   // 隐秘以上：身边时不时亮一颗星
  if (kind !== 'arc' && th.amb === 'arc' && Math.random() < 0.06) skinSpawn('arc', f.x + rand(-20, 20), f.y - rand(30, 100), c, c2, 1, false);   // 雷：配着别的粒子时也偶尔跳一道电
}
function skinSpawn(kind, x, y, c, c2, s, fromBlade) {
  const v = fromBlade ? 1.6 : 1;
  switch (kind) {
    case 'ember': addP({ type: 'ember', x, y, vx: rand(-30, 30) * v, vy: -rand(40, 110), g: -40, drag: 1.2, life: rand(0.5, 1), max: 1, r: rand(1.2, 2.4) * s, rgb: Math.random() < 0.5 ? c : c2, ph: rand(0, 6) }); break;
    case 'mist': addP({ type: 'mist', x, y: fromBlade ? y : Math.min(-4, y * 0.15), vx: rand(-25, 25), vy: rand(-12, 4), drag: 0.8, life: rand(0.8, 1.4), max: 1.4, r: rand(5, 10) * s, rgb: c2 }); if (Math.random() < 0.3) addP({ type: 'glint', x, y, life: 0.5, max: 0.5, r: rand(3, 6) * s, rgb: '255,255,255' }); break;
    case 'wisp': addP({ type: 'wisp', x, y, vx: rand(-15, 15), vy: -rand(30, 70), drag: 0.6, life: rand(0.6, 1.1), max: 1.1, r: rand(3, 6) * s, rgb: c2 }); if (Math.random() < 0.4) addP({ type: 'ember', x, y, vx: rand(-20, 20), vy: rand(10, 50), drag: 1, life: 0.6, max: 0.6, r: 1.2 * s, rgb: c, ph: 0 }); break;
    case 'arc': { const a = rand(0, 6.28), l = rand(14, 30) * s; addP({ type: 'arc', x, y, x2: x + Math.cos(a) * l, y2: y + Math.sin(a) * l, life: rand(0.06, 0.14), max: 0.14, rgb: c }); break; }
    case 'drop': addP({ type: 'drop', x, y, vx: rand(-60, 60) * v, vy: -rand(20, 120) * v, g: 520, life: rand(0.5, 0.9), max: 0.9, r: rand(1.4, 2.4) * s, rgb: Math.random() < 0.6 ? c : c2 }); break;
    case 'glint': addP({ type: 'glint', x, y, vx: rand(-10, 10), vy: -rand(5, 25), life: rand(0.4, 0.8), max: 0.8, r: rand(3, 6) * s, rgb: Math.random() < 0.5 ? c : c2 }); break;
    case 'flake': addP({ type: 'flake', x, y, vx: rand(-25, 25) * v, vy: rand(-30, 20), g: 60, drag: 1.4, life: rand(0.8, 1.4), max: 1.4, r: rand(2, 3.6) * s, rgb: Math.random() < 0.7 ? c : c2, rot: rand(0, 6), spin: rand(-9, 9) }); break;
    case 'inkdrop': addP({ type: 'ink', x, y, vx: rand(-30, 30) * v, vy: rand(0, 60), g: 700, life: rand(0.4, 0.8), max: 0.8, r: rand(1.4, 2.8) * s, rgb: c2 }); if (Math.random() < 0.35) addP({ type: 'ember', x, y, vx: rand(-15, 15), vy: -rand(20, 50), drag: 1, life: 0.7, max: 0.7, r: 1.4 * s, rgb: c, ph: 0 }); break;
    case 'streak': addP({ type: 'streak', x, y, vx: rand(-260, -120) * (Math.random() < 0.5 ? 1 : -1), vy: rand(-20, 10), drag: 1.5, life: rand(0.3, 0.6), max: 0.6, rgb: Math.random() < 0.5 ? c2 : c }); break;
    case 'spark': addP({ type: 'spark', x, y, vx: rand(-120, 120) * v, vy: -rand(40, 160) * v, g: 700, drag: 1, life: rand(0.25, 0.5), max: 0.5, rgb: c, w: 1.4 }); break;
    default: addP({ type: 'shape', sh: kind, x, y, vx: rand(-40, 40) * v, vy: rand(-20, 30), g: 40, drag: 1.2, life: rand(0.8, 1.4), max: 1.4, r: rand(2.4, 3.8) * s, rgb: c, spin: rand(-5, 5) });   // petal leaf feather snow
  }
}
// 命中：主题爆发（精英小、传说大）
function skinHitFX(atk, ev) {
  const L = atk.look, th = skinTh(L); if (!th) return;
  const leg = L.legend, c = L.fx.c, c2 = L.fx.c2 || c, p = clamp(ev.dmg / 7, 0.7, 1.6), n = Math.round((leg ? 14 : 6) * p), x = ev.x, y = ev.y, kind = L.fx.part || th.amb;
  const out = (fn, k = n) => { for (let i = 0; i < k; i++) { const a = rand(0, 6.28), s = rand(140, 420) * p * (leg ? 1.15 : 1); fn(Math.cos(a) * s, Math.sin(a) * s, a); } };
  if (leg) addP({ type: 'glow', x, y, r: 46 * p, life: 0.22, max: 0.22, rgb: c });
  switch (th.hit) {
    case 'fire':
      out((vx, vy) => addP({ type: 'ember', x, y, vx, vy: vy - 120, g: -260, drag: 3, life: rand(0.4, 0.8), max: 0.8, r: rand(1.6, 3) * p, rgb: Math.random() < 0.5 ? c : c2, ph: rand(0, 6) }));
      if (leg) for (let i = 0; i < 4; i++) addP({ type: 'wisp', x: x + rand(-14, 14), y: y + rand(-10, 10), vx: rand(-40, 40), vy: -rand(40, 90), drag: 1, life: 0.9, max: 0.9, r: rand(6, 10), rgb: '40,24,20' });
      break;
    case 'shatter':
      out((vx, vy, a) => addP({ type: 'shard', x, y, vx, vy, g: 500, drag: 2, life: rand(0.35, 0.7), max: 0.7, r: rand(3, 7) * p, rgb: Math.random() < 0.5 ? c : '255,255,255', rot: a, spin: rand(-14, 14) }));
      for (let i = 0; i < (leg ? 4 : 2); i++) addP({ type: 'mist', x: x + rand(-12, 12), y: y + rand(-12, 12), vx: rand(-40, 40), vy: rand(-30, 10), drag: 1.5, life: 0.9, max: 0.9, r: rand(8, 14), rgb: c2 });
      break;
    case 'implode':
      addP({ type: 'iring', x, y, r: 70 * p, life: 0.26, max: 0.26, rgb: c });
      out((vx, vy) => addP({ type: 'wisp', x, y, vx: vx * 0.5, vy: vy * 0.5 - 40, drag: 2, life: rand(0.5, 0.9), max: 0.9, r: rand(3, 6) * p, rgb: c2 }), Math.round(n * 0.7));
      out((vx, vy) => addP({ type: 'ember', x, y, vx, vy, drag: 4, life: 0.4, max: 0.4, r: 1.6, rgb: c, ph: 0 }), Math.round(n * 0.5));
      break;
    case 'fork':
      for (let i = 0; i < (leg ? 5 : 2); i++) { const a = rand(0, 6.28), l = rand(50, 110) * p; addP({ type: 'arc', x, y, x2: x + Math.cos(a) * l, y2: y + Math.sin(a) * l, life: rand(0.12, 0.22), max: 0.22, rgb: c, w: leg ? 2.2 : 1.5 }); }
      out((vx, vy) => addP({ type: 'spark', x, y, vx, vy, drag: 5, life: 0.3, max: 0.3, rgb: Math.random() < 0.5 ? c : '255,255,255', w: 1.6 }));
      break;
    case 'splash':
      out((vx, vy) => addP({ type: 'drop', x, y, vx, vy: vy - 180, g: 900, life: rand(0.4, 0.8), max: 0.8, r: rand(1.6, 3) * p, rgb: Math.random() < 0.6 ? c : c2 }));
      ring(x, y, 54 * p, c2, 0.3);
      break;
    case 'prism':
      out((vx, vy) => addP({ type: 'glint', x, y, vx: vx * 0.6, vy: vy * 0.6, drag: 3, life: rand(0.4, 0.7), max: 0.7, r: rand(4, 8) * p, rgb: rgbMix(c, c2, Math.random()) }));
      ring(x, y, 50 * p, c, 0.26); if (leg) ring(x, y, 70 * p, c2, 0.34);
      break;
    case 'starburst':
      out((vx, vy) => addP({ type: 'glint', x, y, vx: vx * 0.5, vy: vy * 0.5, drag: 3, life: rand(0.4, 0.8), max: 0.8, r: rand(4, 9) * p, rgb: Math.random() < 0.5 ? c : '255,255,255' }));
      if (leg) addP({ type: 'glint', x, y, life: 0.3, max: 0.3, r: 36 * p, rgb: c2 });
      break;
    case 'gilt':
      out((vx, vy) => addP({ type: 'flake', x, y, vx, vy: vy - 60, g: 260, drag: 2.5, life: rand(0.6, 1.1), max: 1.1, r: rand(2.4, 4.2) * p, rgb: Math.random() < 0.7 ? c : c2, rot: rand(0, 6), spin: rand(-12, 12) }));
      break;
    case 'inksplat':
      out((vx, vy) => addP({ type: 'ink', x, y, vx, vy: vy - 100, g: 1300, life: rand(0.5, 0.9), max: 0.9, r: rand(2.4, 5) * p, rgb: c2 }));
      if (leg) out((vx, vy) => addP({ type: 'ember', x, y, vx: vx * 0.7, vy: vy * 0.7, drag: 3, life: 0.5, max: 0.5, r: 1.8, rgb: c, ph: 0 }), 6);
      break;
    case 'gust':
      for (let i = 0; i < n; i++) { const a = (atk.face > 0 ? 0 : Math.PI) + rand(-0.6, 0.6), s = rand(300, 700) * p; addP({ type: 'streak', x, y: y + rand(-20, 20), vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 4, life: rand(0.25, 0.45), max: 0.45, rgb: Math.random() < 0.5 ? c : c2 }); }
      break;
    case 'sparks':
      out((vx, vy) => addP({ type: 'spark', x, y, vx, vy: vy - 100, g: 1100, drag: 1.5, life: rand(0.3, 0.6), max: 0.6, rgb: Math.random() < 0.5 ? c : '255,240,200', w: rand(1.4, 2.4) }));
      break;
    default:   // petals：花瓣、叶子、羽毛炸开
      out((vx, vy) => addP({ type: 'shape', sh: kind, x, y, vx, vy: vy - 60, g: 260, drag: 2.5, life: rand(0.6, 1.1), max: 1.1, r: rand(2.6, 4.4) * p, rgb: c, spin: rand(-8, 8) }));
  }
  if (L.fx.part && th.hit !== 'petals' && leg) out((vx, vy) => addP({ type: 'shape', sh: L.fx.part, x, y, vx: vx * 0.6, vy: vy * 0.6 - 60, g: 200, drag: 2.5, life: 0.9, max: 0.9, r: rand(2.6, 4) * p, rgb: c, spin: rand(-8, 8) }), 5);
  skinTierHit(atk, ev, p, out);
}
// 武库品质越高，打中越“脆”：保密多一圈亮环和一下白闪；隐秘再加一圈主题环、往外射的冲击线、镜头多震一点、“铮”一声；
// 非凡再加金色八角星印、一圈飞散的金星、重击时一层淡淡的金光、“叮”一声。都只是画面和声音，不碰顿帧和伤害
let TIER_SFX_T = 0;
function skinTierHit(atk, ev, p, out) {
  const L = atk.look, tr = tierRank(L); if (tr < 2) return;
  const c = L.fx.c, c2 = L.fx.c2 || c, x = ev.x, y = ev.y;
  addP({ type: 'ring', x, y, r: 40 * p, life: 0.16, max: 0.16, rgb: '255,255,255', ng: 1 });
  if (tr < 3) return;
  addP({ type: 'ring', x, y, r: 86 * p, life: 0.3, max: 0.3, rgb: c2, ng: 1 });
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + rand(-0.15, 0.15), sp = rand(700, 1100) * p; addP({ type: 'streak', x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 7, life: 0.2, max: 0.2, rgb: i % 2 ? c : '255,255,255', ng: 1 }); }
  shake = Math.max(shake, 7 * p);
  const now = performance.now();
  if (now - TIER_SFX_T > 70) { TIER_SFX_T = now; if (tr >= 4) SFX.shine(clamp(ev.dmg / 8, 0.6, 1.4)); else SFX.shing(clamp(ev.dmg / 8, 0.6, 1.3)); }   // 连击时别叠成一片
  if (tr < 4) return;
  addP({ type: 'glyph', g2: 'star8', x, y, r: 44 * p, life: 0.42, max: 0.42, rgb: '255,214,120', rot: rand(0, 1), spin: 1.5, ng: 1 });
  out((vx, vy) => addP({ type: 'glint', x, y, vx: vx * 0.75, vy: vy * 0.75 - 40, drag: 3.5, life: rand(0.45, 0.8), max: 0.8, r: rand(4, 8) * p, rgb: Math.random() < 0.5 ? '255,226,150' : '255,255,255', ng: 1 }), 8);
  if (ev.dmg >= 8 || ev.big || ev.ult) { flashA = Math.max(flashA, 0.16); flashRGB = '255,214,120'; }
}
// 开场亮相：名号 + 主题粒子从脚下升起（传说多一圈光）
function skinIntroFX(f) {
  const S = SKINS[f.skinKey], L = f.look; if (!S || !L.fx) return;
  const tr = tierRank(L), T = TIER_TXT[L.tier];
  const leg = S.rarity === 'legend', c = L.fx.c, c2 = L.fx.c2 || c, kind = L.fx.part || skinTh(L).amb;
  const name = () => addP({ type: 'text', text: `${T ? T[0] : S.rarity === 'legend' ? '传说' : '精英'} · ${S.name}`, x: f.x, y: f.y - 175, life: 2.2 + (tr >= 4 ? 0.6 : 0), max: 2.2 + (tr >= 4 ? 0.6 : 0), rgb: T ? T[1] : S.rarity === 'legend' ? '233,196,106' : '150,200,255' });
  for (let i = 0; i < (leg ? 34 : 12) + (tr >= 3 ? 16 : 0); i++) skinSpawn(kind, f.x + rand(-40, 40), rand(-110, -4), c, c2, 1.2, true);
  if (!leg && tr < 2) { name(); return; }
  addP({ type: 'glow', x: f.x, y: f.y - 60, r: 90, life: 0.6, max: 0.6, rgb: c, ng: tr >= 2 ? 1 : 0 });   // 品质皮肤的不进泛光：开场一下别把人照成白的
  ring(f.x, f.y - 60, 120, c, 0.55);
  if (tr >= 3) { addP({ type: 'ring', x: f.x, y: f.y - 60, r: 190, life: 0.8, max: 0.8, rgb: c2, ng: 1 }); for (let i = 0; i < 14; i++) addP({ type: 'glint', x: f.x + rand(-60, 60), y: f.y - rand(10, 170), vx: 0, vy: -rand(10, 40), life: rand(0.6, 1.2), max: 1.2, r: rand(4, 8), rgb: Math.random() < 0.5 ? c2 : '255,255,255', ng: 1 }); }
  if (tr >= 4) {   // 非凡：一道柔光从天上落到脚下，脚下亮起金星印，一串铃音
    addP({ type: 'pillar', x: f.x, y: f.y, r: 40, life: 1.5, max: 1.5, rgb: rgbMix(c, '255,226,150', 0.5), ng: 1 });
    addP({ type: 'glyph', g2: 'star8', x: f.x, y: f.y - 70, r: 78, life: 0.9, max: 0.9, rgb: '255,214,120', rot: 0, spin: 0.8, ng: 1 });
    addP({ type: 'ring', x: f.x, y: f.y - 4, r: 150, life: 0.9, max: 0.9, rgb: '255,226,150', ng: 1 });
    if (!RESIM) SFX.sparkle();
  } else if (tr >= 3 && !RESIM) SFX.shing(1.2);
  name();   // 名号最后加：画在光柱、光环上面，不会被盖住
}
// 胜利：主题粒子像烟花一样喷出来
function skinVictoryFX(f) {
  const S = SKINS[f.skinKey], L = f.look; if (!S || !L.fx) return;
  const leg = S.rarity === 'legend', tr = tierRank(L), c = L.fx.c, c2 = L.fx.c2 || c, kind = L.fx.part || skinTh(L).amb;
  for (let i = 0; i < (leg ? 40 : 16) + tr * 6; i++) { const a = rand(-Math.PI * 0.85, -Math.PI * 0.15), v = rand(250, 650); skinSpawn(kind, f.x, f.y - 60, c, c2, 1.3, true); const q = particles[particles.length - 1]; if (q) { q.vx = Math.cos(a) * v; q.vy = Math.sin(a) * v; q.g = 420; q.life = q.max = rand(1, 1.8); } }
  if (leg) addP({ type: 'glow', x: f.x, y: f.y - 80, r: 110, life: 0.8, max: 0.8, rgb: c });
  if (tr >= 3) for (let i = 0; i < 18; i++) { const a = rand(-Math.PI * 0.9, -Math.PI * 0.1), v = rand(200, 520); addP({ type: 'glint', x: f.x, y: f.y - 70, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 300, drag: 1.2, life: rand(0.9, 1.6), max: 1.6, r: rand(4, 8), rgb: tr >= 4 ? (Math.random() < 0.6 ? '255,226,150' : '255,255,255') : (Math.random() < 0.5 ? c2 : '255,255,255'), ng: 1 }); }
  if (tr >= 4) {
    addP({ type: 'pillar', x: f.x, y: f.y, r: 46, life: 1.7, max: 1.7, rgb: rgbMix(c, '255,226,150', 0.5), ng: 1 });
    addP({ type: 'glyph', g2: 'star8', x: f.x, y: f.y - 80, r: 92, life: 1.1, max: 1.1, rgb: '255,214,120', rot: 0, spin: 0.6, ng: 1 });
    if (!RESIM) SFX.sparkle();
  }
}
// 新粒子的画法（drawParticles 里调用）
function drawSkinParticle(p, k) {
  switch (p.type) {
    case 'ember': {
      const fl = 0.65 + 0.35 * Math.sin(clock * 25 + (p.ph || 0)), r = p.r * 2.6, g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(255,250,230,${k * fl})`); g.addColorStop(0.35, `rgba(${p.rgb},${k * fl * 0.8})`); g.addColorStop(1, `rgba(${p.rgb},0)`);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); ctx.restore(); return;
    }
    case 'mist': case 'wisp': {   // 寒雾、暗焰：边缘化开的一团
      const r = p.r * (p.type === 'mist' ? 2.4 - k : 2.2 - k), a = p.type === 'mist' ? 0.22 : 0.5, g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${p.rgb},${k * a})`); g.addColorStop(1, `rgba(${p.rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); return;
    }
    case 'arc':
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(${p.rgb},${k})`; ctx.lineWidth = p.w || 1.5; zigzag([p.x, p.y], [p.x2, p.y2], 5, 7);
      ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 0.7; zigzag([p.x, p.y], [p.x2, p.y2], 5, 3); ctx.restore(); return;
    case 'drop': {
      const a = Math.atan2(p.vy || 1, p.vx || 0), sp = Math.min(3, Math.hypot(p.vx || 0, p.vy || 0) / 200 + 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate(a); ctx.fillStyle = `rgba(${p.rgb},${k * 0.85})`;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r * sp, p.r * 0.8, 0, 0, 7); ctx.fill(); ctx.restore(); return;
    }
    case 'glint': ctx.save(); ctx.globalCompositeOperation = 'lighter'; glint(p.x, p.y, p.r * Math.sin(k * Math.PI), p.rgb, Math.min(1, k * 1.6)); ctx.restore(); return;
    case 'flake': {
      const r = (p.rot || 0) + (p.spin || 0) * (p.max - p.life), sh = Math.abs(Math.cos(r * 1.3));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(r); ctx.fillStyle = `rgba(${p.rgb},${k * (0.45 + 0.55 * sh)})`; ctx.fillRect(-p.r, -p.r * 0.7 * sh, p.r * 2, p.r * 1.4 * sh + 0.4);
      if (sh > 0.85) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,250,225,${k * 0.8})`; ctx.fillRect(-p.r, -0.5, p.r * 2, 1); }
      ctx.restore(); return;
    }
    case 'shard': {
      const r = (p.rot || 0) + (p.spin || 0) * (p.max - p.life);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate(r); ctx.fillStyle = `rgba(${p.rgb},${k * 0.9})`;
      ctx.beginPath(); ctx.moveTo(p.r * 1.6, 0); ctx.lineTo(-p.r * 0.6, p.r * 0.45); ctx.lineTo(-p.r * 0.6, -p.r * 0.45); ctx.closePath(); ctx.fill(); ctx.restore(); return;
    }
    case 'streak':
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(${p.rgb},${k * 0.7})`; ctx.lineWidth = 1.3;
      line([p.x, p.y], [p.x - (p.vx || 0) * 0.07, p.y - (p.vy || 0) * 0.07]); ctx.restore(); return;
    case 'glow': {
      const r = p.r * (1 + (1 - k) * 0.6), g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(255,255,255,${k * 0.6})`); g.addColorStop(0.3, `rgba(${p.rgb},${k * 0.5})`); g.addColorStop(1, `rgba(${p.rgb},0)`);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); ctx.restore(); return;
    }
    case 'iring':
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${p.rgb},${(1 - k) * 0.9 + 0.1})`; ctx.lineWidth = 2 + 4 * k;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.r * k), 0, 7); ctx.stroke(); ctx.restore(); return;
    case 'pillar': {   // 非凡开场 / 胜利：一道柔光从天上落下来，落到脚下化成一圈光晕，慢慢收窄淡掉
      const age = 1 - k, reach = Math.min(1, age * 5), a = Math.min(1, age * 8) * Math.pow(k, 0.6), w = p.r * (0.45 + 0.55 * k), h = 1100, top = p.y - h, bot = top + h * reach;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const v = ctx.createLinearGradient(0, top, 0, bot); v.addColorStop(0, `rgba(${p.rgb},0)`); v.addColorStop(0.6, `rgba(${p.rgb},${0.12 * a})`); v.addColorStop(1, `rgba(${p.rgb},${0.28 * a})`);
      ctx.fillStyle = v; ctx.fillRect(p.x - w * 1.9, top, w * 3.8, bot - top);   // 外面一层淡淡的色光
      const g = ctx.createLinearGradient(p.x - w, 0, p.x + w, 0); g.addColorStop(0, 'rgba(255,250,235,0)'); g.addColorStop(0.5, `rgba(255,250,235,${0.34 * a})`); g.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - w, top, w * 2, bot - top);   // 中间一道白光
      ctx.fillStyle = `rgba(255,255,255,${0.5 * a})`; ctx.fillRect(p.x - 0.8, top, 1.6, bot - top);   // 光芯一条细线
      if (reach >= 1) {   // 落到地上的光晕
        const e = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, w * 2.8); e.addColorStop(0, `rgba(255,250,235,${0.42 * a})`); e.addColorStop(0.45, `rgba(${p.rgb},${0.2 * a})`); e.addColorStop(1, `rgba(${p.rgb},0)`);
        ctx.translate(p.x, p.y); ctx.scale(1, 0.24); ctx.translate(-p.x, -p.y); ctx.fillStyle = e; ctx.fillRect(p.x - w * 2.8, p.y - w * 2.8, w * 5.6, w * 5.6);
      }
      ctx.restore(); return;
    }
  }
}
const SKIN_GLOW_P = { ember: 1, arc: 1, glint: 1, shard: 1, streak: 1, drop: 1, pillar: 1 };   // glow 本身就是一团渐变光，不再泛一遍
// 泛光那一遍：传说兵器的刃再画粗一点，模糊后就是真正的光晕
function skinEmissive(f) {
  const L = f.look; if (!L.legend || !L.fx || f.hidden || !f.sk) return;
  const seg = skinBladeSeg(f.sk, f, L);
  ctx.strokeStyle = `rgba(${L.fx.c},0.9)`; ctx.lineWidth = 6; ctx.lineCap = 'round';
  if (seg) line(seg[0], seg[1]); else { ctx.fillStyle = `rgba(${L.fx.c},0.8)`; circle(f.sk.hf, 7); circle(f.sk.hb, 7); }
  if (tierRank(L) >= 4) { ctx.fillStyle = `rgba(${rgbMix(L.fx.c, '255,226,150', 0.5)},0.9)`; for (const m of tierMotes(f)) circle(m, 4); }   // 非凡的三颗光点也泛光
}
// 非凡：三颗绕着身子转的光点（位置按时间算，不存状态）。第三个数是前后：大于 0 在身前
function tierMotes(f) {
  const t = clock * 1.6 + (f.idx || 0) * 2.1, out = [];
  for (let k = 0; k < 3; k++) { const a = t + k * 2.094; out.push([f.x + Math.cos(a) * 36, f.y - 64 + Math.sin(t * 1.3 + k * 2) * 26 + Math.sin(a) * 8, Math.sin(a)]); }
  return out;
}
function skinTierMotes(f, front) {
  const L = f.look; if (tierRank(L) < 4) return;
  const c = rgbMix(L.fx.c, '255,226,150', 0.5);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, z] of tierMotes(f)) {
    if ((z >= 0) !== front) continue;
    const r = 8 + z * 2.5, g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,255,255,${0.75 + z * 0.2})`); g.addColorStop(0.3, `rgba(${c},0.6)`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
  if (front && Math.random() < 0.3) { const m = tierMotes(f)[Math.floor(Math.random() * 3)]; addP({ type: 'glint', x: m[0], y: m[1], vx: rand(-8, 8), vy: -rand(8, 24), life: 0.45, max: 0.45, r: rand(2, 3.5), rgb: '255,236,180' }); }   // 光点后面拖一串小星
}
// 脚下：隐秘是一圈会呼吸的主题色光环；非凡是一座慢慢转的金色法阵（两圈、十二道刻纹、一个六芒星）
function skinTierGround(f) {
  const L = f.look, tr = tierRank(L); if (tr < 3) return;
  const hg = clamp(1 + f.y / 160, 0, 1); if (hg <= 0) return;
  const c = tr >= 4 ? rgbMix(L.fx.c, '255,214,120', 0.55) : L.fx.c, t = clock + (f.idx || 0) * 1.7;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(f.x, 1); ctx.scale(1, 0.2);
  if (tr === 3) {
    const r = 46 + Math.sin(t * 2.2) * 4;
    ctx.strokeStyle = `rgba(${c},${(0.3 + 0.12 * Math.sin(t * 3)) * hg})`; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.16 * hg})`; ctx.lineWidth = 2.5; ctx.stroke();
  } else {
    const R = 60, g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(${c},${0.2 * hg})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.strokeStyle = `rgba(${c},${0.5 * hg})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, 7); ctx.stroke();
    ctx.save(); ctx.rotate(t * 0.6); ctx.fillStyle = `rgba(${c},${0.6 * hg})`;
    for (let k = 0; k < 12; k++) { ctx.rotate(Math.PI / 6); ctx.fillRect(R * 0.82, -3, R * 0.15, 6); }
    ctx.restore();
    ctx.save(); ctx.rotate(-t * 0.4); ctx.strokeStyle = `rgba(255,240,200,${0.42 * hg})`; ctx.lineWidth = 3;
    for (const o of [0, Math.PI]) { ctx.beginPath(); for (let k = 0; k <= 3; k++) { const a = o + k * 2.094 - Math.PI / 2; ctx.lineTo(Math.cos(a) * R * 0.76, Math.sin(a) * R * 0.76); } ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
}
// 锥形流线肢体与服饰轮廓绘制（支持重甲护胫、宽袖长袍、武僧绑腿与刺客护腕）
// 传说背饰：每款一个自己的轮廓（金乌火翼、幻灵狐尾、沧龙盘龙、修罗战旗……），不再都是背后一个圆盘
// 星座武器箱的十二星图：星的位置（-1~1，往下是正）、连线、最亮的那颗
const ZODIAC_STARS = {
  ari: { s: [[-0.9, 0.15], [-0.25, -0.2], [0.3, -0.32], [0.8, -0.08]], e: [[0, 1], [1, 2], [2, 3]], b: 2 },
  tau: { s: [[0.05, 0.45], [-0.3, 0.12], [-0.8, -0.5], [0.3, 0.05], [0.85, -0.42], [-0.05, 0.85], [0.45, 0.8]], e: [[0, 1], [1, 2], [0, 3], [3, 4], [0, 5], [0, 6]], b: 1 },
  gem: { s: [[-0.55, -0.8], [-0.45, -0.1], [-0.7, 0.55], [-0.3, 0.75], [0.25, -0.85], [0.3, -0.1], [0.1, 0.7], [0.55, 0.6]], e: [[0, 1], [1, 2], [1, 3], [4, 5], [5, 6], [5, 7], [0, 4], [1, 5]], b: 4 },
  can: { s: [[0, 0], [0.05, -0.75], [-0.65, 0.6], [0.7, 0.55], [-0.1, 0.25]], e: [[1, 0], [0, 4], [4, 2], [0, 3]], b: 0 },
  leo: { s: [[0.75, -0.75], [0.4, -0.88], [0.1, -0.62], [0.2, -0.25], [0.5, 0.05], [-0.4, -0.08], [-0.9, 0.15], [-0.45, 0.5]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [5, 6], [6, 7], [7, 4]], b: 4 },
  vir: { s: [[-0.9, -0.55], [-0.45, -0.3], [-0.05, -0.15], [0.35, -0.5], [0.15, 0.3], [0.6, 0.78], [-0.35, 0.5]], e: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [4, 6]], b: 5 },
  lib: { s: [[0, -0.78], [-0.6, -0.15], [0.58, -0.2], [-0.48, 0.62], [0.42, 0.58]], e: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4]], b: 2 },
  sco: { s: [[0.88, -0.78], [0.72, -0.45], [0.82, -0.12], [0.38, -0.36], [0.08, -0.15], [-0.18, 0.18], [-0.28, 0.52], [-0.08, 0.82], [-0.52, 0.84], [-0.8, 0.58], [-0.72, 0.34]], e: [[0, 3], [1, 3], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]], b: 3 },
  sag: { s: [[-0.62, 0.42], [-0.62, -0.1], [-0.1, -0.25], [0.2, -0.62], [0.45, -0.15], [0.8, -0.3], [0.58, 0.38], [0.05, 0.42]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 4], [4, 5], [5, 6], [6, 7], [7, 0], [7, 2]], b: 6 },
  cap: { s: [[0.82, -0.58], [0.62, -0.2], [0.18, 0.48], [-0.3, 0.38], [-0.85, -0.12], [-0.25, -0.15], [0.3, -0.38]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]], b: 4 },
  aqu: { s: [[-0.88, -0.5], [-0.42, -0.62], [0, -0.35], [0.38, -0.62], [0.82, -0.36], [0.1, 0.1], [0.45, 0.55], [-0.2, 0.78]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [5, 7]], b: 3 },
  pis: { s: [[0.1, 0.78], [-0.3, 0.32], [-0.62, -0.12], [-0.5, -0.58], [-0.82, -0.78], [-0.98, -0.38], [0.45, 0.48], [0.75, 0.12], [0.98, -0.12], [0.72, -0.38], [0.5, -0.12]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 2], [0, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 7]], b: 0 },
};
// 星座皮肤背后的星图：zt 1 只有星图和一团星光，2 加一圈星环和十二个刻度，3 是慢慢转的金色星盘（两圈环、外圈十二颗小星、一颗流星）
function drawZodiacBack(D, sk, f, t, bc, bk, glow) {
  const Z = ZODIAC_STARS[D.sign]; if (!Z) return;
  const zt = D.zt || 1, c1 = D.zc || '255,220,150', c2 = D.zc2 || '255,255,255', idx = f.idx || 0;
  const c = [bc[0] + bk * 12, bc[1] - 24], R = 30 + zt * 4, bob = Math.sin(t * 1.3 + idx) * 2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow([c[0], c[1] + bob], R * 1.7, c1, 0.1 + zt * 0.05);
  if (zt >= 2) {
    const rot = t * 0.18 * bk;
    ctx.strokeStyle = `rgba(${c2},${zt >= 3 ? 0.55 : 0.4})`; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(c[0], c[1] + bob, R, 0, 7); ctx.stroke();
    for (let k = 0; k < 12; k++) {
      const a = rot + k * Math.PI / 6, ca = Math.cos(a), sa = Math.sin(a), r0 = R - 3, r1 = R + (k % 3 ? 3 : 6);
      ctx.beginPath(); ctx.moveTo(c[0] + ca * r0, c[1] + bob + sa * r0); ctx.lineTo(c[0] + ca * r1, c[1] + bob + sa * r1); ctx.stroke();
    }
    if (zt >= 3) {
      ctx.strokeStyle = `rgba(${c2},0.35)`; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.arc(c[0], c[1] + bob, R + 10, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      for (let k = 0; k < 12; k++) {   // 外圈十二颗小星跟着星盘反着转，其中一颗最亮
        const a = rot * -1.6 + k * Math.PI / 6, q = [c[0] + Math.cos(a) * (R + 10), c[1] + bob + Math.sin(a) * (R + 10)], hi = k === 0;
        glint(q[0], q[1], hi ? 5.5 + Math.sin(t * 3) * 1.2 : 2.6, hi ? c2 : c1, hi ? 0.95 : 0.7);
      }
    }
  }
  const S = Z.s.map(([x, y], i) => [c[0] + bk * x * R * 0.72, c[1] + bob + y * R * 0.72 + Math.sin(t * 1.7 + i * 1.3) * 0.8]);
  ctx.strokeStyle = `rgba(${c1},${0.45 + zt * 0.1})`; ctx.lineWidth = zt >= 3 ? 1.3 : 1;
  ctx.beginPath(); for (const [a, b] of Z.e) { ctx.moveTo(S[a][0], S[a][1]); ctx.lineTo(S[b][0], S[b][1]); } ctx.stroke();
  S.forEach((p, i) => {
    const tw = 0.6 + 0.4 * Math.sin(t * 3.2 + i * 1.9 + idx), big = i === Z.b;
    glow(p, big ? 12 : 7, big ? c2 : c1, big ? 0.45 : 0.28);
    glint(p[0], p[1], (big ? 6 : 3.2) * (0.85 + tw * 0.3) + (zt - 1) * 0.6, big ? '255,255,255' : c1, 0.75 + tw * 0.25);
  });
  if (zt >= 3) {   // 一颗流星隔几秒从星盘上划过
    const u = (t * 0.35 + idx * 0.3) % 1;
    if (u < 0.25) {
      const k = u / 0.25, p0 = [c[0] - bk * R * 1.1, c[1] - R * 0.9], p1 = [c[0] + bk * R * 0.9, c[1] + R * 0.5], q = [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k];
      const g = ctx.createLinearGradient(p0[0], p0[1], q[0], q[1]); g.addColorStop(0, `rgba(${c2},0)`); g.addColorStop(1, `rgba(${c2},${0.8 * (1 - k)})`);
      ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p0[0] + (q[0] - p0[0]) * 0.4, p0[1] + (q[1] - p0[1]) * 0.4); ctx.lineTo(q[0], q[1]); ctx.stroke();
      glint(q[0], q[1], 3.5, '255,255,255', 1 - k);
    }
  }
  ctx.restore();
}
// 星冕：兵器上缀着几颗一闪一闪的星，刃尖一点星光；拳、葫芦、流星锤的星绕在手上
function drawZodiacGleam(sk, L) {
  const t = typeof clock === 'number' ? clock : 0, D = L.deco, c = D.zc || L.slash, w = L.weapon;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (w === 'fists' || w === 'gourd' || w === 'hammer') {
    for (const [h, ph] of [[sk.hf, 0], [sk.hb, 2.1]]) for (let k = 0; k < 3; k++) {
      const a = t * 2.2 + ph + k * 2.09, q = [h[0] + Math.cos(a) * 10, h[1] + Math.sin(a) * 6];
      glint(q[0], q[1], 2.6 + Math.sin(t * 5 + k) * 0.8, k ? c : '255,240,200', 0.85);
    }
  } else {
    const a = sk.hilt, b = sk.tip;
    for (let k = 0; k < 4; k++) {
      const u = 0.32 + k * 0.17, tw = Math.max(0, Math.sin(t * 3.4 + k * 1.7));
      glint(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 1.6 + tw * 2.8, k % 2 ? c : '255,240,200', 0.4 + tw * 0.6);
    }
    const tw = 0.7 + 0.3 * Math.sin(t * 4.2);
    glint(b[0], b[1], 5 * tw + 2, '255,250,230', 0.9);
  }
  ctx.restore();
}
function drawBackPiece(kind, D, sk, f, L, t, bc, sway) {
  const bk = -sk.face, sh = sk.sh, hip = sk.hip, idx = f.idx || 0;
  const bez = (p0, p1, p2, u) => [(1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]];
  // 沿一条二次曲线画一条由粗到细的带子（尾巴、羽毛、龙身都用它）
  const ribbon = (p0, p1, p2, w0, w1, fill, n = 14) => {
    const L1 = [], R1 = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = bez(p0, p1, p2, u), q = bez(p0, p1, p2, Math.min(1, u + 0.02)), r = bez(p0, p1, p2, Math.max(0, u - 0.02));
      let dx = q[0] - r[0], dy = q[1] - r[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const w = typeof w0 === 'function' ? w0(u) : w0 + (w1 - w0) * u; L1.push([p[0] - dy * w, p[1] + dx * w]); R1.push([p[0] + dy * w, p[1] - dx * w]);
    }
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(L1[0][0], L1[0][1]);
    for (const p of L1) ctx.lineTo(p[0], p[1]);
    for (let i = R1.length - 1; i >= 0; i--) ctx.lineTo(R1[i][0], R1[i][1]);
    ctx.closePath(); ctx.fill();
  };
  const lg = (a, b, stops) => { const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); for (const [o, c] of stops) g.addColorStop(o, c); return g; };
  const glow = (c, r, col, a) => { const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(c[0] - r, c[1] - r, r * 2, r * 2); };
  switch (kind) {
    case 'zodiac': drawZodiacBack(D, sk, f, t, bc, bk, glow); break;
    case 'crowwings': {   // 金乌：两扇金红火羽翼，羽尖跳动的火苗
      const flap = Math.sin(t * 3.2 + idx) * 0.12;
      glow([bc[0] + bk * 18, bc[1] - 14], 62, '255,170,60', 0.28);
      for (const layer of [1, 0]) {
        const sc = layer ? 0.82 : 1, root = [bc[0] - bk * layer * 6, bc[1] + 2 - layer * 3];
        for (let k = 0; k < 7; k++) {
          const a = -1.45 + k * 0.29 + flap * (1 - k / 8) + layer * 0.12, len = (54 - k * 3.2) * sc;
          const tip = [root[0] + bk * Math.cos(a) * len, root[1] + Math.sin(a) * len];
          const mid = [root[0] + bk * Math.cos(a - 0.18) * len * 0.55, root[1] + Math.sin(a - 0.18) * len * 0.55];
          ctx.globalAlpha = layer ? 0.7 : 1;
          ribbon(root, mid, tip, 5.5 * sc, 0.6, lg(root, tip, [[0, '#fff3c4'], [0.45, '#ffb43a'], [1, '#e2421a']]), 10);
          const fl = 4 + Math.sin(t * 14 + k * 1.7) * 2.5;
          ctx.fillStyle = 'rgba(255,230,140,0.85)'; ctx.beginPath(); ctx.ellipse(tip[0], tip[1], 2.2, fl, a + Math.PI / 2, 0, 7); ctx.fill();
        }
      }
      ctx.globalAlpha = 1; break;
    }
    case 'voidshards': {   // 幽渊：五片悬浮的黑晶碎片扇形排开，紫光描边，黑雾在后
      glow(bc, 58, '120,40,200', 0.35);
      for (let k = 0; k < 5; k++) {
        const a = -2.2 + k * 0.48, r = 34 + (k % 2) * 8, bob = Math.sin(t * 2 + k * 1.3) * 3;
        const c = [bc[0] + bk * Math.cos(a) * r * -1, bc[1] + Math.sin(a) * r + bob];
        const len = 15 - Math.abs(k - 2) * 1.5, rot = a + Math.PI / 2 + Math.sin(t + k) * 0.15;
        const q = (d, w) => [c[0] + Math.cos(rot) * d * bk - Math.sin(rot) * w, c[1] + Math.sin(rot) * d + Math.cos(rot) * w * bk];
        ctx.fillStyle = '#12061f'; ctx.strokeStyle = 'rgba(200,130,255,0.95)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); const p1 = q(-len, 0), p2 = q(0, 5), p3 = q(len, 0), p4 = q(-2, -4);
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(240,210,255,0.7)'; ctx.lineWidth = 0.8; line(p1, p3);
      }
      break;
    }
    case 'flysword': {   // 青锋行：一柄青色飞剑斜悬在背后，剑穗飘动，脚下一朵墨云
      const bob = Math.sin(t * 2.2 + idx) * 4;
      const hilt = [bc[0] + bk * 22, bc[1] + 30 + bob], tip = [bc[0] - bk * 6, bc[1] - 58 + bob];
      const dx = tip[0] - hilt[0], dy = tip[1] - hilt[1], dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl, px = -uy, py = ux;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(120,230,195,0.25)'; ctx.lineWidth = 12; line([hilt[0] + ux * 14, hilt[1] + uy * 14], tip);
      ctx.restore();
      const g0 = [hilt[0] + ux * 14, hilt[1] + uy * 14];
      ctx.fillStyle = lg(g0, tip, [[0, '#d8fff2'], [1, '#ffffff']]); ctx.beginPath();
      ctx.moveTo(g0[0] + px * 3.2, g0[1] + py * 3.2); ctx.lineTo(tip[0] - ux * 8 + px * 3, tip[1] - uy * 8 + py * 3); ctx.lineTo(tip[0], tip[1]);
      ctx.lineTo(tip[0] - ux * 8 - px * 3, tip[1] - uy * 8 - py * 3); ctx.lineTo(g0[0] - px * 3.2, g0[1] - py * 3.2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(80,190,160,0.9)'; ctx.lineWidth = 1; line(g0, [tip[0] - ux * 6, tip[1] - uy * 6]);
      ctx.strokeStyle = '#2e5a4e'; ctx.lineWidth = 4; line(hilt, g0);
      ctx.strokeStyle = '#d9b36a'; ctx.lineWidth = 2.6; line([g0[0] - px * 8, g0[1] - py * 8], [g0[0] + px * 8, g0[1] + py * 8]);
      ctx.strokeStyle = '#c8321e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hilt[0], hilt[1]);
      ctx.quadraticCurveTo(hilt[0] + bk * 6, hilt[1] + 10, hilt[0] + bk * 10 + Math.sin(t * 4) * 3, hilt[1] + 18); ctx.stroke();
      ctx.fillStyle = 'rgba(30,40,36,0.55)';
      for (let k = 0; k < 4; k++) { const q = [sk.hip[0] + bk * (14 + k * 9), sk.hip[1] + 6 - k * 4 + Math.sin(t * 2 + k) * 3]; circle(q, 8 - k); }
      break;
    }
    case 'crescent': {   // 血月：头后一弯巨大的血色新月，月刃锋利，红光外溢
      const c = [bc[0] + bk * 8, bc[1] - 26], r = 34, rot = -0.5 * bk + Math.sin(t * 1.5) * 0.06;
      glow([c[0] + bk * 14, c[1]], 40, '230,30,50', 0.22);
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(rot); ctx.scale(bk, 1);
      ctx.fillStyle = lg([-r, 0], [r, 0], [[0, '#4a0610'], [0.6, '#d21a32'], [1, '#ff6070']]);
      ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI * 0.62, Math.PI * 0.62); ctx.arc(-10, 0, r * 0.94, Math.PI * 0.56, -Math.PI * 0.56, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,205,0.85)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke();
      ctx.restore(); break;
    }
    case 'foxtails': {   // 幻灵：五条蓬松的灵狐尾巴扇形张开，青到紫的渐变，尾尖雪白
      const base = [hip[0] + bk * 4, hip[1] - 4], wf = u => 1.5 + 8.5 * Math.sin(Math.PI * Math.pow(u, 0.75)) * (1 - u * 0.2);
      for (let k = 4; k >= 0; k--) {
        const a = -1.55 + k * 0.34, wv = Math.sin(t * 2.4 + k * 0.9) * 0.14, len = 66 - Math.abs(k - 2) * 6;
        const tip = [base[0] + bk * Math.cos(a + wv) * len, base[1] + Math.sin(a + wv) * len];
        const mid = [base[0] + bk * Math.cos(a + 0.55 + wv * 2) * len * 0.62, base[1] + Math.sin(a + 0.55 + wv * 2) * len * 0.62];
        ctx.globalAlpha = 0.92;
        ribbon(base, mid, tip, wf, 0, lg(base, tip, [[0, 'rgba(0,190,255,0.55)'], [0.45, 'rgba(90,170,255,0.9)'], [0.75, 'rgba(170,140,255,0.95)'], [0.9, '#efeaff'], [1, '#ffffff']]), 18);
      }
      ctx.globalAlpha = 1; break;
    }
    case 'kitsunetails': {   // 狐火：一条蓬松的大白狐尾，先往后甩再往上卷过头顶，尾尖烧成朱红的狐火
      const wv = Math.sin(t * 2) * 3, b0 = [hip[0] + bk * 5, hip[1] - 4];
      const c1 = [b0[0] + bk * 44, b0[1] + 14], c2 = [b0[0] + bk * 70, b0[1] - 46 + wv], tip = [b0[0] + bk * (24 + wv * 0.5), b0[1] - 72];
      const cub = u => { const v = 1 - u; return [v * v * v * b0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * tip[0], v * v * v * b0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * tip[1]]; };
      const n = 40, C = [], N = [], pf0 = 1;
      for (let i = 0; i <= n; i++) { const u = i / n, p = cub(u), q = cub(Math.min(1, u + 0.01)), r = cub(Math.max(0, u - 0.01)); let ex = q[0] - r[0], ey = q[1] - r[1]; const el = Math.hypot(ex, ey) || 1; C.push(p); N.push([-ey / el, ex / el]); }
      const fur = u => (u > 0.15 && u < 0.93 ? Math.abs(Math.sin(u * 46)) * 2.6 : 0);   // 外沿一簇簇蓬起来的毛
      const side = (wf, sg) => C.map((p, i) => { const u = i / n, w = wf(u) + (sg * bk * pf0 > 0 ? fur(u) : 0); return [p[0] + N[i][0] * w * sg, p[1] + N[i][1] * w * sg]; });
      const body = (wf, fill) => { const A1 = side(wf, 1), B1 = side(wf, -1).reverse(); ctx.fillStyle = fill; ctx.beginPath(); for (const p of [...A1, ...B1]) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill(); };
      const wf = u => 3 + 17 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.05)), 0.55) * (0.35 + 0.65 * u);
      body(u => wf(u) + 1.6, f.look.outline || '#1a0e0a');
      body(wf, lg(b0, tip, [[0, '#ead8c6'], [0.35, '#fffaf2'], [0.7, '#fff0e0'], [0.86, '#ff9a5a'], [1, '#ff3a10']]));
      ctx.globalAlpha = 0.55; body(u => wf(u) * 0.3, '#ffffff'); ctx.globalAlpha = 1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 4; j++) {
        const fl = 8 + Math.sin(t * 18 + j * 2) * 3, bb = C[n - 1 - j * 2], w0 = 4;
        ctx.fillStyle = `rgba(255,${110 + j * 35},60,0.5)`; ctx.beginPath(); ctx.moveTo(bb[0] - w0, bb[1]); ctx.quadraticCurveTo(bb[0] - 1, bb[1] - fl, bb[0] - bk * 2, bb[1] - fl * 1.6); ctx.quadraticCurveTo(bb[0] + 2, bb[1] - fl * 0.5, bb[0] + w0, bb[1]); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'flamebanners': {   // 修罗：背插两面黑红战旗，旗尾烧着火
      for (const [k, ang] of [[0, -0.25], [1, 0.05]]) {
        const root = [sh[0] + bk * (8 + k * 6), sh[1] + 10], top = [root[0] + bk * Math.sin(-ang) * -60 + bk * 6, root[1] - 64 + k * 6];
        ctx.strokeStyle = '#1a0a08'; ctx.lineWidth = 2.6; line(root, top);
        ctx.fillStyle = '#d9b36a'; circle(top, 2.6);
        const w = 22, h = 34, pts = [];
        for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([top[0] + bk * u * w, top[1] + 4 + Math.sin(t * 5 + u * 4 + k) * 3 * u]); }
        ctx.fillStyle = k ? '#2a0606' : '#6a0e10'; ctx.beginPath(); ctx.moveTo(top[0], top[1] + 4);
        for (const p of pts) ctx.lineTo(p[0], p[1]);
        for (let i = 8; i >= 0; i--) { const p = pts[i]; ctx.lineTo(p[0], p[1] + h - (i % 2 ? 6 : 0) * (i / 8)); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 1.2; ctx.stroke();
        const em = [top[0] + bk * w * 0.5, top[1] + 4 + h * 0.45];
        ctx.fillStyle = '#ff5a30'; ctx.beginPath(); ctx.moveTo(em[0], em[1] - 8); ctx.quadraticCurveTo(em[0] + 6, em[1], em[0], em[1] + 6); ctx.quadraticCurveTo(em[0] - 6, em[1], em[0], em[1] - 8); ctx.fill();
        const tail = pts[8], fl = 6 + Math.sin(t * 12 + k * 2) * 3;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,120,40,0.75)';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(tail[0] + bk * (3 + i * 2), tail[1] + 6 + i * 10, 3, fl - i, 0.4 * bk, 0, 7); ctx.fill(); }
        ctx.restore();
      }
      break;
    }
    case 'dragon': {   // 沧龙：一条青龙从腰后盘上肩头，龙首探在肩上
      const wv = (u) => Math.sin(t * 2 + u * 7) * 5;
      const pts = [];
      for (let i = 0; i <= 22; i++) {
        const u = i / 22;
        pts.push([hip[0] + bk * (28 * Math.sin(u * Math.PI * 1.15) + 6) + wv(u) * 0.6, hip[1] + 18 - u * 112 + Math.cos(u * 6) * 6]);
      }
      for (let i = 1; i < pts.length; i++) {
        const u = i / pts.length, w = 3 + 5 * Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.9);
        ctx.strokeStyle = `rgb(${30 + u * 60 | 0},${120 + u * 70 | 0},${230 + u * 25 | 0})`; ctx.lineWidth = w * 2; line(pts[i - 1], pts[i]);
        if (i % 3 === 0) { const d = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]], dl = Math.hypot(d[0], d[1]) || 1; ctx.fillStyle = '#bfe6ff'; ctx.beginPath(); ctx.moveTo(pts[i][0] - d[1] / dl * w, pts[i][1] + d[0] / dl * w); ctx.lineTo(pts[i][0] - d[1] / dl * (w + 5) * bk * bk, pts[i][1] + d[0] / dl * (w + 5)); ctx.lineTo(pts[i - 1][0] - d[1] / dl * w, pts[i - 1][1] + d[0] / dl * w); ctx.fill(); }
      }
      const hd = pts[pts.length - 1];
      ctx.fillStyle = '#5ab4ff'; ctx.beginPath(); ctx.ellipse(hd[0] - bk * 5, hd[1], 9, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a7ad8'; ctx.beginPath(); ctx.moveTo(hd[0] - bk * 10, hd[1] - 3); ctx.lineTo(hd[0] - bk * 20, hd[1] + 1); ctx.lineTo(hd[0] - bk * 10, hd[1] + 5); ctx.fill();
      ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 1.6; line([hd[0] + bk * 1, hd[1] - 4], [hd[0] + bk * 9, hd[1] - 14]); line([hd[0] - bk * 3, hd[1] - 5], [hd[0] + bk * 2, hd[1] - 16]);
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hd[0] - bk * 16, hd[1] + 2); ctx.quadraticCurveTo(hd[0] - bk * 24, hd[1] + 8 + Math.sin(t * 5) * 3, hd[0] - bk * 30, hd[1] + 2); ctx.stroke();
      ctx.fillStyle = '#fff'; circle([hd[0] - bk * 8, hd[1] - 2], 1.6);
      break;
    }
    case 'pibo': {   // 天青：一条天衣披帛从肩后绕过头顶垂到身前，另一端在身后随风飘
      const fl = Math.sin(t * 1.8 + idx) * 6, s0 = [sh[0] + bk * 6, sh[1] + 12];
      const fill = (a, b) => lg(a, b, [[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(150,210,255,0.85)'], [1, 'rgba(225,240,255,0.7)']]);
      const e1 = [sh[0] - bk * 20, sh[1] + 34 + fl * 0.5];
      ribbon(s0, [bc[0] + bk * 22, bc[1] - 96 + fl], e1, u => 1.6 + 2.6 * Math.sin(Math.PI * u), 0, fill(s0, e1), 22);
      const e2 = [hip[0] + bk * 62 + fl, hip[1] + 26 + fl * 0.6];
      ribbon(s0, [hip[0] + bk * 34, hip[1] - 22], e2, u => 3.6 - 2.6 * u, 0, fill(s0, e2), 18);
      ctx.fillStyle = 'rgba(235,245,255,0.7)';
      for (let k = 0; k < 3; k++) { const q = [bc[0] + bk * (30 + k * 10), bc[1] - 4 - k * 6 + Math.sin(t * 2 + k) * 3]; circle(q, 7 - k * 1.5); }
      break;
    }
    case 'flamemane': {   // 烈阳：肩背燃起一圈火舌，像太阳的火焰日冕
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const c = [bc[0] + bk * 2, bc[1] - 10];
      for (let k = 0; k < 11; k++) {
        const a = -Math.PI * 0.95 + k * Math.PI * 0.9 / 10 * 1.1, h = 26 + Math.sin(t * 9 + k * 2.1) * 6 + (k % 2) * 8;
        const base = [c[0] + Math.cos(a) * 18 * bk, c[1] + Math.sin(a) * 18], tip = [c[0] + Math.cos(a) * (18 + h) * bk, c[1] + Math.sin(a) * (18 + h)];
        const mid = [(base[0] + tip[0]) / 2 + Math.sin(t * 7 + k) * 4, (base[1] + tip[1]) / 2];
        ribbon(base, mid, tip, 5, 0.5, lg(base, tip, [[0, 'rgba(255,240,170,0.9)'], [0.5, 'rgba(255,140,40,0.75)'], [1, 'rgba(220,40,10,0)']]), 8);
      }
      ctx.restore(); break;
    }
    case 'constellation': {   // 星墨：背后浮着北斗七星，星与星之间连着细线，星光一闪一闪
      glow([bc[0] + bk * 14, bc[1] - 20], 60, '60,120,255', 0.25);
      const S = [[-8, 10], [6, 2], [18, -6], [30, -8], [36, -24], [52, -28], [50, -10]].map(([a, b]) => [bc[0] + bk * (a + 4), bc[1] - 26 + b + Math.sin(t * 1.4 + a) * 1.5]);
      ctx.strokeStyle = 'rgba(150,200,255,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); S.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.lineTo(S[3][0], S[3][1]); ctx.stroke();
      S.forEach((p, i) => {
        const tw = 2.5 + Math.sin(t * 4 + i * 1.7) * 1.2;
        ctx.fillStyle = 'rgba(220,240,255,0.95)'; ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? tw * 0.4 : tw * 2; ctx.lineTo(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
      });
      break;
    }
    case 'tattered': {   // 月蚀：一件残破的大斗篷，外黑内红，下摆碎成锯齿
      const back = bk, a = sh, h = hip;
      const bot = h[1] + 46 + sway, far = h[0] + back * (36 + Math.abs(sway) * 1.6);
      const edge = [];
      for (let i = 0; i <= 7; i++) { const u = i / 7; edge.push([a[0] + back * 2 + (far - a[0] - back * 2) * u, bot - u * 12 + (i % 2 ? -10 : 0) + Math.sin(t * 3 + i) * 2]); }
      ctx.fillStyle = '#7a1424'; ctx.beginPath(); ctx.moveTo(a[0] + back * 2, a[1]);
      ctx.quadraticCurveTo(a[0] + back * 30, a[1] + 20, far, bot - 12); for (let i = 7; i >= 0; i--) ctx.lineTo(edge[i][0], edge[i][1]); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#120a18'; ctx.beginPath(); ctx.moveTo(a[0] - back * 4, a[1] - 2);
      ctx.quadraticCurveTo(a[0] + back * 36, a[1] + 10, far + back * 6, bot - 16);
      for (let i = 7; i >= 0; i--) ctx.lineTo(edge[i][0] + back * 4, edge[i][1] - 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,110,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      break;
    }
    case 'icewings': {   // 霜华：冰晶羽翼，一片片棱角分明的冰刃向后上方展开
      const flap = Math.sin(t * 2.6 + idx) * 0.08;
      for (const layer of [1, 0]) {
        const root = [bc[0] - bk * layer * 4, bc[1] + 2];
        for (let k = 0; k < 6; k++) {
          const a = -1.5 + k * 0.3 + flap + layer * 0.15, len = (50 - Math.abs(k - 1.5) * 6) * (layer ? 0.8 : 1);
          const tip = [root[0] + bk * Math.cos(a) * len, root[1] + Math.sin(a) * len];
          const s1 = [root[0] + bk * Math.cos(a - 0.12) * len * 0.45, root[1] + Math.sin(a - 0.12) * len * 0.45], s2 = [root[0] + bk * Math.cos(a + 0.12) * len * 0.5, root[1] + Math.sin(a + 0.12) * len * 0.5];
          ctx.fillStyle = layer ? 'rgba(160,215,255,0.45)' : 'rgba(215,240,255,0.75)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(root[0], root[1]); ctx.lineTo(s1[0], s1[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(s2[0], s2[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      break;
    }
    case 'phoenixtail': {   // 凤羽：三根长长的凤尾翎从腰后垂下，翎尖有金色凤眼
      const base = [hip[0] + bk * 4, hip[1] - 2];
      for (let k = 0; k < 3; k++) {
        const wv = Math.sin(t * 2 + k * 1.2) * 8, len = 70 + k * 10;
        const tip = [base[0] + bk * (len * 0.75 + wv), base[1] + 26 + k * 12 + wv * 0.5];
        const mid = [base[0] + bk * len * 0.35, base[1] - 10 + k * 6];
        ribbon(base, mid, tip, 2, 5, lg(base, tip, [[0, '#ffd25a'], [0.5, '#ff7a2a'], [1, '#d8341a']]), 14);
        ctx.fillStyle = '#ffd25a'; circle(tip, 5); ctx.fillStyle = '#c0281a'; circle(tip, 2.6); ctx.fillStyle = '#2a0a06'; circle(tip, 1.2);
      }
      break;
    }
    case 'bells': {   // 钧天：背后一架弯弯的金色编钟，五口小钟轻轻摇
      const L0 = [bc[0] - bk * 20, bc[1] - 30], R0 = [bc[0] + bk * 44, bc[1] - 22], T0 = [bc[0] + bk * 12, bc[1] - 58];
      ctx.strokeStyle = '#c99a3e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L0[0], L0[1]); ctx.quadraticCurveTo(T0[0], T0[1], R0[0], R0[1]); ctx.stroke();
      ctx.fillStyle = '#ffe08a'; circle(L0, 3); circle(R0, 3);
      for (let k = 0; k < 5; k++) {
        const u = 0.12 + k * 0.19, p = bez(L0, T0, R0, u), sw = Math.sin(t * 3 + k * 1.3) * 0.18;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(sw);
        ctx.strokeStyle = '#8a5a1e'; ctx.lineWidth = 1; line([0, 0], [0, 6]);
        const s = 1 - Math.abs(k - 2) * 0.12;
        ctx.fillStyle = lg([-6 * s, 0], [6 * s, 0], [[0, '#a8761e'], [0.5, '#ffe9a0'], [1, '#b8862a']]);
        ctx.beginPath(); ctx.moveTo(-4 * s, 6); ctx.lineTo(4 * s, 6); ctx.lineTo(6.5 * s, 18 * s + 6); ctx.quadraticCurveTo(0, 21 * s + 6, -6.5 * s, 18 * s + 6); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'gourdback': {   // 酒剑仙：背着一只大青玉葫芦，红绳系着，脚下踩一朵仙云
      const c = [bc[0] + bk * 14, bc[1] + 8], rot = 0.5 * bk + Math.sin(t * 2) * 0.05;
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(rot);
      ctx.fillStyle = lg([-14, 0], [14, 0], [[0, '#1e8a8a'], [0.45, '#7ff0e0'], [1, '#1a6a70']]);
      circle([0, 10], 14); circle([0, -12], 9); ctx.fillRect(-4, -6, 8, 8);
      ctx.fillStyle = '#c8321e'; ctx.fillRect(-6, -3, 12, 3);
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-3, -25, 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle([-5, 6], 3.5);
      ctx.restore();
      ctx.strokeStyle = '#c8321e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sh[0], sh[1] + 4); ctx.quadraticCurveTo(c[0], c[1] + 18, hip[0] - bk * 4, hip[1]); ctx.stroke();
      const fy0 = Math.max(sk.ff[1], sk.fb[1]) + 6;
      for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? 'rgba(200,250,255,0.8)' : 'rgba(255,255,255,0.85)'; circle([(sk.ff[0] + sk.fb[0]) / 2 + (k - 2.5) * 9 + Math.sin(t * 2 + k) * 2, fy0 + Math.cos(t * 2.5 + k) * 2 - (k % 2) * 3], 8 - Math.abs(k - 2.5)); }
      break;
    }
    case 'ghostchains': {   // 冥狱：两条幽冥锁链在身后盘绕，三团鬼火飘着
      for (const s2 of [0, 1]) {
        const p0 = [sh[0] - bk * 4, sh[1] + 6 + s2 * 20], p1 = [bc[0] + bk * (50 + s2 * 10), bc[1] - 40 + s2 * 50 + Math.sin(t * 2 + s2) * 8], p2 = [hip[0] + bk * (20 + s2 * 26), hip[1] + 30 + s2 * 6];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12, p = bez(p0, p1, p2, u), q = bez(p0, p1, p2, Math.min(1, u + 0.05)), a = Math.atan2(q[1] - p[1], q[0] - p[0]);
          ctx.strokeStyle = i % 2 ? 'rgba(200,150,255,0.9)' : 'rgba(120,70,190,0.95)'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.ellipse(p[0], p[1], 4.5, i % 2 ? 1.6 : 3, a, 0, 7); ctx.stroke();
        }
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const q = [bc[0] + bk * (20 + k * 16), bc[1] - 34 + k * 18 + Math.sin(t * 2.5 + k * 2) * 5], h = 12 + Math.sin(t * 9 + k) * 3;
        const g = ctx.createRadialGradient(q[0], q[1] + 2, 0, q[0], q[1], h); g.addColorStop(0, 'rgba(230,200,255,0.95)'); g.addColorStop(0.5, 'rgba(160,80,255,0.6)'); g.addColorStop(1, 'rgba(90,20,180,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(q[0], q[1] - h); ctx.quadraticCurveTo(q[0] + 7, q[1], q[0], q[1] + 5); ctx.quadraticCurveTo(q[0] - 7, q[1], q[0], q[1] - h); ctx.fill();
      }
      ctx.restore(); break;
    }
    // ---------- 神兵武器箱 ----------
    case 'galaxy': {   // 天河：背后一团慢慢转的星系，两条旋臂一蓝一粉，星核发白光，外面一圈淡淡的星环
      const c = [bc[0] + bk * 10, bc[1] - 18], R = 40, rot = t * 0.35 * bk;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(c, R * 1.5, '150,140,255', 0.2);
      ctx.translate(c[0], c[1]); ctx.rotate(-0.35 * bk); ctx.scale(1, 0.6);
      for (let arm = 0; arm < 2; arm++) {
        const col = arm ? '255,150,225' : '150,175,255';
        for (let i = 0; i < 28; i++) {
          const u = i / 28, a = rot + arm * Math.PI + u * 4.4 * bk, r = 4 + u * R, x = Math.cos(a) * r, y = Math.sin(a) * r;
          ctx.fillStyle = `rgba(${col},${0.36 * (1 - u * 0.55)})`; ctx.beginPath(); ctx.arc(x, y, (1 - u) * 4.5 + 1.8, 0, 7); ctx.fill();
          if (i % 4 === 2) { const tw = 0.5 + 0.5 * Math.sin(t * 4 + i + arm * 3); ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.55 * tw})`; ctx.beginPath(); ctx.arc(x, y, 0.8 + tw * 0.8, 0, 7); ctx.fill(); }
        }
      }
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 13); core.addColorStop(0, 'rgba(255,255,255,0.95)'); core.addColorStop(0.4, 'rgba(225,205,255,0.55)'); core.addColorStop(1, 'rgba(180,160,255,0)');
      ctx.fillStyle = core; ctx.fillRect(-13, -13, 26, 26);
      ctx.strokeStyle = 'rgba(205,215,255,0.32)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, R + 5, 0, 7); ctx.stroke();
      ctx.restore(); break;
    }
    case 'butterflywings': {   // 幻蝶：一对半透明的大蝶翼，紫青两色慢慢流转，有翼脉和翼斑，一扇一扇
      const flap = 0.74 + 0.26 * Math.sin(t * 2.4 + idx), mix = (Math.sin(t * 1.3 + idx) + 1) / 2;
      const UP = [[0, 0], [6, -48], [44, -64], [78, -52], [60, -22], [40, -4], [0, 0]], LO = [[0, 4], [38, 6], [50, 30], [46, 54], [24, 44], [10, 24], [0, 4]];
      for (const [layer, sc, al] of [[1, 0.84, 0.45], [0, 1, 0.85]]) {
        const root = [bc[0] - bk * layer * 6, bc[1] + 4 - layer * 2], X = (x, y) => [root[0] + bk * x * flap * sc, root[1] + y * sc];
        const shape = pts => { ctx.beginPath(); ctx.moveTo(...X(...pts[0])); for (let i = 1; i + 1 < pts.length; i += 2) ctx.quadraticCurveTo(...X(...pts[i]), ...X(...pts[i + 1])); ctx.closePath(); };
        const c1 = rgbMix('120,235,255', '190,140,255', mix), c2 = rgbMix('190,140,255', '255,170,240', mix);
        ctx.globalAlpha = al;
        shape(UP); ctx.fillStyle = lg(root, X(76, -54), [[0, `rgba(${c1},0.25)`], [0.55, `rgba(${c2},0.6)`], [1, 'rgba(245,230,255,0.85)']]); ctx.fill();
        ctx.strokeStyle = 'rgba(235,220,255,0.85)'; ctx.lineWidth = 1.1; ctx.stroke();
        shape(LO); ctx.fillStyle = lg(root, X(46, 54), [[0, `rgba(${c1},0.3)`], [1, `rgba(${c2},0.65)`]]); ctx.fill(); ctx.stroke();
        if (!layer) {   // 翼脉、翼斑只画近的那一对
          ctx.strokeStyle = 'rgba(240,230,255,0.45)'; ctx.lineWidth = 0.8;
          for (const [x, y] of [[44, -62], [76, -50], [58, -22], [48, 30], [44, 52]]) { ctx.beginPath(); ctx.moveTo(...X(0, 2)); ctx.quadraticCurveTo(...X(x * 0.5, y * 0.35), ...X(x * 0.92, y * 0.92)); ctx.stroke(); }
          for (const [x, y, r] of [[50, -42, 6.5], [32, 32, 4.5]]) { const q = X(x, y); ctx.fillStyle = 'rgba(120,240,255,0.8)'; circle(q, r); ctx.fillStyle = 'rgba(40,20,80,0.85)'; circle(q, r * 0.55); ctx.fillStyle = 'rgba(255,255,255,0.9)'; circle([q[0] - 1, q[1] - 1], r * 0.18); }
        }
      }
      ctx.globalAlpha = 1; break;
    }
    case 'crystals': {   // 琉璃：头后悬着一圈琉璃晶柱，粉青两色，慢慢浮动，晶面上闪光
      glow([bc[0] + bk * 6, bc[1] - 22], 58, '170,240,255', 0.18);
      for (let k = 0; k < 6; k++) {
        const a = -2.35 + k * 0.42, r = 36 + (k % 2) * 7, bob = Math.sin(t * 1.8 + k * 1.1) * 3;
        const c = [bc[0] - bk * Math.cos(a) * r, bc[1] - 6 + Math.sin(a) * r + bob], len = 14 - Math.abs(k - 2.5) * 1.6, w = 4.2, rot = Math.atan2(c[1] - bc[1] + 6, c[0] - bc[0]) + Math.sin(t * 0.8 + k) * 0.1;
        const q = (d, s2) => [c[0] + Math.cos(rot) * d - Math.sin(rot) * s2, c[1] + Math.sin(rot) * d + Math.cos(rot) * s2];
        const pts = [q(len, 0), q(len * 0.5, w), q(-len * 0.6, w), q(-len, 0), q(-len * 0.6, -w), q(len * 0.5, -w)];
        ctx.fillStyle = lg(q(-len, 0), q(len, 0), [[0, 'rgba(160,230,250,0.75)'], [0.6, 'rgba(225,250,255,0.85)'], [1, 'rgba(255,190,235,0.9)']]);
        ctx.beginPath(); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.moveTo(...q(len, 0)); ctx.lineTo(...q(len * 0.5, w)); ctx.lineTo(...q(-len * 0.6, w)); ctx.lineTo(...q(-len, 0)); ctx.closePath(); ctx.fill();
        const tw = Math.max(0, Math.sin(t * 2.6 + k * 1.9)); if (tw > 0.2) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glint(...q(len * 0.7, 0), 2 + tw * 4, '255,240,255', tw); ctx.restore(); }
      }
      break;
    }
    case 'notering': {   // 天籁：背后一圈金色的五线谱光环，音符沿着光环慢慢转
      const c = [bc[0] + bk * 8, bc[1] - 20], R = 31;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(c, R * 1.6, '255,215,130', 0.2);
      for (let k = 0; k < 5; k++) { ctx.strokeStyle = `rgba(255,${200 + k * 10},${110 + k * 22},${0.55 - k * 0.06})`; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(c[0], c[1], R - 6 + k * 3, 0, 7); ctx.stroke(); }
      for (let k = 0; k < 6; k++) { const a = t * 0.5 * bk + k * Math.PI / 3, q = [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R], bob = Math.sin(t * 3 + k) * 1.5; ctx.save(); ctx.translate(q[0], q[1] + bob); drawShape('note', 3.4, '255,226,150', 0.95); ctx.restore(); }
      ctx.restore(); break;
    }
    case 'scroll': {   // 青绿：背后浮着一卷展开的青绿山水，两头是木轴、玉轴头，随风轻轻起伏
      const c = [bc[0] + bk * 16, bc[1] - 12];
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate((-0.2 + Math.sin(t * 1.6 + idx) * 0.04) * bk); ctx.scale(bk, 1);
      const wv = x => Math.sin(x * 0.12 + t * 2.2) * 2.2, top = x => -15 + wv(x), bot = x => 15 + wv(x);
      ctx.beginPath(); for (let x = -30; x <= 30; x += 6) ctx.lineTo(x, top(x)); for (let x = 30; x >= -30; x -= 6) ctx.lineTo(x, bot(x)); ctx.closePath();
      ctx.fillStyle = '#f2ead2'; ctx.fill();
      ctx.save(); ctx.clip();
      for (const [x0, h, col] of [[-26, 20, '#3f9a86'], [-6, 26, '#1f6f78'], [14, 18, '#5fae7c']]) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x0 - 14, 16); ctx.lineTo(x0 - 4, 16 - h * 0.6); ctx.lineTo(x0, 16 - h); ctx.lineTo(x0 + 6, 16 - h * 0.7); ctx.lineTo(x0 + 16, 16); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(x0 - 1, 16 - h); ctx.lineTo(x0 + 2, 16 - h * 0.7); ctx.lineTo(x0 - 2, 16 - h * 0.55); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-30, 4 + wv(0), 60, 3);
      ctx.fillStyle = '#c8321e'; ctx.fillRect(20, -11 + wv(20), 4, 4);
      ctx.restore();
      for (const x of [-32, 32]) { ctx.fillStyle = '#6a3a1e'; ctx.fillRect(x - 2, top(x) - 4, 4, 38); ctx.fillStyle = '#6ad8b4'; circle([x, top(x) - 5], 2.6); circle([x, bot(x) + 5], 2.6); }
      ctx.restore(); break;
    }
    case 'peacock': {   // 孔雀：腰后开一把孔雀屏，九根长翎扇形张开，翎眼金、青、宝蓝
      const base = [hip[0] + bk * 4, hip[1] - 6], open = 0.9 + 0.1 * Math.sin(t * 1.6 + idx);
      for (let k = 8; k >= 0; k--) {
        const th = -0.12 - k * 0.2 * open + Math.sin(t * 2 + k * 0.7) * 0.025, len = 62 + Math.sin(k * 1.7) * 6;
        const tip = [base[0] + bk * Math.cos(th) * len, base[1] + Math.sin(th) * len], mid = [base[0] + bk * Math.cos(th + 0.12) * len * 0.5, base[1] + Math.sin(th + 0.12) * len * 0.5];
        ribbon(base, mid, tip, 0.8, 3.6, lg(base, tip, [[0, '#0a4a40'], [0.6, '#14a88c'], [1, '#7fe8c8']]), 12);
        const a = Math.atan2(tip[1] - base[1], tip[0] - base[0]);
        for (const [r, col] of [[5.6, '#e8c040'], [4.4, '#14a88c'], [3.1, '#1a3a9a'], [1.5, '#0a0e2a']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(tip[0], tip[1], r * 1.25, r, a, 0, 7); ctx.fill(); }
        const sh = Math.max(0, Math.sin(t * 2.2 + k * 0.9)); if (sh > 0.3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glint(tip[0], tip[1] - 1, 1.5 + sh * 2.5, '200,255,235', sh * 0.8); ctx.restore(); }
      }
      break;
    }
    case 'koi': {   // 锦鲤：一红一金两尾锦鲤在背后绕着圈游，身后一圈水纹
      const c = [bc[0] + bk * 12, bc[1] - 12], R = 27;
      ctx.strokeStyle = 'rgba(170,220,240,0.35)'; ctx.lineWidth = 1.2;
      for (const [r, k] of [[R - 7, 0], [R + 6, 1]]) { ctx.beginPath(); ctx.ellipse(c[0], c[1], r + Math.sin(t * 2 + k) * 1.2, (r + Math.sin(t * 2 + k) * 1.2) * 0.8, 0, 0, 7); ctx.stroke(); }
      for (const [k, body, spot] of [[0, '#ff5a3a', '#fff4ee'], [1, '#ffb83a', '#fff2cc']]) {
        const a = t * 0.9 * bk + k * Math.PI, q = [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R * 0.8];
        ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(Math.atan2(Math.cos(a) * 0.8 * bk, -Math.sin(a) * bk)); drawKoi(7, body, spot, t * 7 + k * 2); ctx.restore();
      }
      break;
    }
    default: return false;
  }
  return true;
}
