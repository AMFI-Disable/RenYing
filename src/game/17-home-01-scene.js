// ======================= 首页场景与画面 =======================
// ======================= 主界面场景：竹林、习武亭、擂台 =======================
const menuCam = { x: 0, tx: 0, z: 1, tz: 1 };
const MENU_SPOT = { single: -640, netp: 640 };
const MENU_FLIES = Array.from({ length: 60 }, () => ({ x: rand(-1500, 1500), y: rand(-420, -20), ph: rand(0, 6.28), sp: rand(0.4, 1.1) }));
const MENU_LEAVES = Array.from({ length: 40 }, () => ({ x: rand(-1500, 1500), y: rand(-700, 0), vx: rand(-30, -8), vy: rand(18, 45), r: rand(0, 6), s: rand(3, 6), ph: rand(0, 6) }));
let menuDt = 0.016;
function menuFlies(glow) {
  for (const f of MENU_FLIES) {
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(f.ph * 2.3));
    ctx.fillStyle = `rgba(255,236,150,${a})`; circle([f.x, f.y], glow ? 5 : 1.8);
  }
}
function lanternAt(x, y, glow) {
  if (glow) { ctx.fillStyle = 'rgba(255,150,80,0.6)'; circle([x, y], 15); return; }
  ctx.fillStyle = '#c23b2e'; ctx.beginPath(); ctx.ellipse(x, y, 12, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,200,130,0.55)'; ctx.beginPath(); ctx.ellipse(x, y, 6, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0b35a'; ctx.fillRect(x - 7, y - 17, 14, 3); ctx.fillRect(x - 7, y + 14, 14, 3);
  ctx.strokeStyle = '#e0b35a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y + 17); ctx.lineTo(x + Math.sin(clock * 2 + x) * 2, y + 28); ctx.stroke();
}
function roofShape(cx, y, half, h, col, edge) {
  ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(cx - half - 26, y - 14);
  ctx.quadraticCurveTo(cx - half + 20, y + 4, cx - half * 0.55, y - h * 0.55);
  ctx.lineTo(cx, y - h); ctx.lineTo(cx + half * 0.55, y - h * 0.55);
  ctx.quadraticCurveTo(cx + half - 20, y + 4, cx + half + 26, y - 14);
  ctx.lineTo(cx + half, y + 6); ctx.lineTo(cx - half, y + 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
}
function drawPavilion(x) {
  ctx.fillStyle = '#26203a'; ctx.fillRect(x - 160, -26, 320, 26);
  ctx.fillStyle = 'rgba(200,180,255,0.15)'; ctx.fillRect(x - 160, -26, 320, 2);
  ctx.fillStyle = '#1d182e'; for (let k = 0; k < 3; k++) ctx.fillRect(x - 50 + k * 4, -8 - k * 6, 100 - k * 8, 6);
  for (const dx of [-76, 76]) { ctx.fillStyle = '#3a1418'; ctx.fillRect(x + dx - 5, -236, 10, 212); }
  for (const dx of [-118, 118]) { ctx.fillStyle = '#5c1e22'; ctx.fillRect(x + dx - 7, -236, 14, 212); ctx.fillStyle = 'rgba(255,140,120,0.18)'; ctx.fillRect(x + dx - 7, -236, 3, 212); }
  ctx.strokeStyle = '#4a1a1e'; ctx.lineWidth = 3;
  for (const yy of [-66, -46]) { ctx.beginPath(); ctx.moveTo(x - 118, yy); ctx.lineTo(x + 118, yy); ctx.stroke(); }
  ctx.lineWidth = 2; for (let k = -110; k <= 110; k += 14) { ctx.beginPath(); ctx.moveTo(x + k, -66); ctx.lineTo(x + k, -26); ctx.stroke(); }
  roofShape(x, -236, 170, 70, '#181424', '#3a3056');
  roofShape(x, -300, 90, 40, '#1b1628', '#3a3056');
  ctx.fillStyle = '#e0b35a'; ctx.beginPath(); ctx.arc(x, -344, 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 36, -232, 72, 22); ctx.strokeStyle = '#e0b35a'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 36, -232, 72, 22);
  ctx.fillStyle = '#f0d890'; ctx.font = `18px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('习武亭', x, -220);
  lanternAt(x, -186, false);
}
function drawDummy(x, k) {
  const sw = Math.sin(clock * 1.3 + k) * 0.03;
  ctx.save(); ctx.translate(x, 0); ctx.rotate(sw);
  ctx.fillStyle = '#4a3322'; ctx.fillRect(-4, -140, 8, 140); ctx.fillRect(-38, -104, 76, 7);
  ctx.fillStyle = '#b08a5a'; ctx.beginPath(); ctx.ellipse(0, -88, 22, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,55,30,0.6)'; ctx.lineWidth = 1; for (let i = -16; i <= 16; i += 5) { ctx.beginPath(); ctx.moveTo(i, -118); ctx.lineTo(i * 0.8, -56); ctx.stroke(); }
  ctx.fillStyle = '#b08a5a'; ctx.beginPath(); ctx.arc(0, -136, 15, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 2.5; for (const yy of [-100, -74]) { ctx.beginPath(); ctx.moveTo(-20, yy); ctx.lineTo(20, yy); ctx.stroke(); }
  ctx.fillStyle = '#f1e2c0'; ctx.fillRect(-5, -96, 10, 18); ctx.fillStyle = '#b8392e'; ctx.fillRect(-2, -93, 4, 12);
  ctx.strokeStyle = 'rgba(60,40,25,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-5, -140); ctx.lineTo(5, -132); ctx.moveTo(5, -140); ctx.lineTo(-5, -132); ctx.stroke();
  ctx.restore();
}
function drawTarget(x) {
  ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x, -110); ctx.lineTo(x + 30, 0); ctx.moveTo(x, -110); ctx.lineTo(x + 6, 0); ctx.stroke();
  const rings = ['#e8dcc0', '#b8392e', '#e8dcc0', '#b8392e', '#e0b35a'];
  rings.forEach((c, k) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, -118, 40 - k * 8, 0, 7); ctx.fill(); });
  ctx.strokeStyle = '#2a2020'; ctx.lineWidth = 2; for (const [dx, dy] of [[-6, -4], [10, 8]]) { ctx.beginPath(); ctx.moveTo(x + dx, -118 + dy); ctx.lineTo(x + dx - 34, -118 + dy - 10); ctx.stroke(); }
}
function drawArena(x) {
  for (const dx of [-176, 176]) { ctx.fillStyle = '#2a1016'; ctx.fillRect(x + dx - 9, -330, 18, 300); }
  ctx.fillStyle = '#1a1424'; ctx.fillRect(x - 220, -300, 440, 16); ctx.fillRect(x - 200, -262, 400, 12);
  roofShape(x, -300, 210, 36, '#161222', '#3a3056');
  ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 48, -286, 96, 26); ctx.strokeStyle = '#e0b35a'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 48, -286, 96, 26);
  ctx.fillStyle = '#f0d890'; ctx.font = `20px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('擂台', x, -272);
  ctx.fillStyle = '#2c2638'; ctx.fillRect(x - 230, -34, 460, 34); ctx.fillStyle = 'rgba(200,180,255,0.18)'; ctx.fillRect(x - 230, -34, 460, 2);
  ctx.fillStyle = '#211c30'; for (let k = 0; k < 3; k++) ctx.fillRect(x - 60 + k * 5, -10 - k * 7, 120 - k * 10, 7);
  for (const [dx, ch] of [[-262, '武'], [262, '战']]) {
    ctx.fillStyle = '#3a2a1e'; ctx.fillRect(x + dx - 3, -360, 6, 360);
    const w = Math.sin(clock * 1.7 + dx) * 6;
    ctx.fillStyle = '#9e2a24'; ctx.beginPath(); ctx.moveTo(x + dx + 3, -350); ctx.lineTo(x + dx + 46 + w, -346); ctx.lineTo(x + dx + 42 + w * 1.3, -200); ctx.lineTo(x + dx + 3, -206); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0d890'; ctx.font = `26px ${TITLE_FONT}`; ctx.fillText(ch, x + dx + 24 + w * 0.6, -276);
  }
  ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 90, -34); ctx.lineTo(x + 90, -130); ctx.moveTo(x + 150, -34); ctx.lineTo(x + 150, -130); ctx.moveTo(x + 84, -120); ctx.lineTo(x + 156, -120); ctx.stroke();
  ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 2; for (const dx of [102, 118, 134]) { ctx.beginPath(); ctx.moveTo(x + dx, -36); ctx.lineTo(x + dx, -150); ctx.stroke(); }
  for (const dx of [-212, 212]) { ctx.fillStyle = '#3a2a1e'; ctx.fillRect(x + dx - 3, -110, 6, 76); lanternAt(x + dx, -122, false); }
}
function drawStoneLantern(x, glow) {
  if (glow) { ctx.fillStyle = 'rgba(255,170,90,0.5)'; circle([x, -72], 12); return; }
  lantern(x, -2);
}
function menuGround() {
  const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, '#1f1a33'); g.addColorStop(1, '#07060f');
  ctx.fillStyle = g; ctx.fillRect(-3000, 0, 6000, 900);
  ctx.strokeStyle = 'rgba(200,180,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3000, 0); ctx.lineTo(3000, 0); ctx.stroke();
  for (let k = -24; k <= 24; k++) {   // 石板路
    const x = k * 62 + hash(k) * 16, w = 40 + hash(k + 3) * 18;
    ctx.fillStyle = `rgba(120,110,150,${0.12 + hash(k + 7) * 0.08})`; ctx.beginPath(); ctx.ellipse(x, 14 + hash(k + 11) * 6, w / 2, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(20,30,20,0.9)'; ctx.lineWidth = 1.5;   // 草
  for (let k = -80; k <= 80; k++) { const x = k * 19 + hash(k * 2) * 12, h = 6 + hash(k * 5) * 12; ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 2, -h * 0.6, x + 4 + Math.sin(clock + k) * 2, -h); ctx.stroke(); }
}
function menuEmissive(sc) {
  withBloomScreen(sc);
  ctx.save(); ctx.translate(W / 2, groundY()); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  lanternAt(MENU_SPOT.single, -186, true);
  for (const dx of [-212, 212]) lanternAt(MENU_SPOT.netp + dx, -122, true);
  drawStoneLantern(160, true); drawStoneLantern(-160, true);
  menuFlies(true);
  ctx.restore();
}
// 泛光里的月亮：天河的星核是斜着的椭圆，不是圆月
function moonGlow(mx, my, mr) {
  if (SCN && SCN.orb === 'galaxy') { ctx.save(); ctx.translate(mx, my); ctx.rotate(-0.3); ctx.scale(1, 0.46); ctx.fillStyle = 'rgba(255,236,250,0.3)'; circle([0, 0], mr * 0.75); ctx.restore(); }
  else { ctx.fillStyle = 'rgba(255,236,210,0.32)'; circle([mx, my], mr * 1.02); }
}
function withBloomScreen(sc) {   // 月亮和星星的发光
  const mx = W * 0.68 - (cam.x - STAGE_W / 2) * 0.04 * sc, my = H * 0.26, mr = H * 0.11;
  moonGlow(mx, my, mr);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 90; i += 3) {
    const x = ((hash(i) * W * 1.4 - cam.x * 0.02 * sc) % W + W) % W, y = hash(i + 50) * H * 0.5;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * (1 + hash(i + 9) * 2) + i); ctx.fillRect(x - 1.5, y - 1.5, 4, 4);
  }
  ctx.globalAlpha = 1;
}
// 场景细节
function drawPlum(x) {
  ctx.strokeStyle = '#2a1a1c'; ctx.lineCap = 'round';
  const br = (x0, y0, a, len, w, d) => {
    if (d > 5 || len < 8) return;
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (d >= 2) for (let k = 0; k < 3; k++) { ctx.fillStyle = k % 2 ? 'rgba(255,190,205,0.85)' : 'rgba(255,230,236,0.9)'; circle([x1 + (hash(x1 + k) - 0.5) * 16, y1 + (hash(y1 + k) - 0.5) * 14], 3 + hash(x1 * k) * 2.5); }
    br(x1, y1, a - 0.45 - hash(d + x0) * 0.2, len * 0.72, w * 0.66, d + 1);
    br(x1, y1, a + 0.4 + hash(d + y0) * 0.2, len * 0.66, w * 0.66, d + 1);
  };
  br(x, 0, -Math.PI / 2 - 0.12, 90, 10, 0);
}
function drawFence(x0, x1) {
  ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x0, -40); ctx.lineTo(x1, -40); ctx.moveTo(x0, -22); ctx.lineTo(x1, -22); ctx.stroke();
  ctx.lineWidth = 5; for (let x = x0; x <= x1; x += 34) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -52); ctx.stroke(); }
}
function drawWarDrum(x) {
  ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 36, 0); ctx.lineTo(x - 10, -60); ctx.moveTo(x + 36, 0); ctx.lineTo(x + 10, -60); ctx.stroke();
  ctx.fillStyle = '#7a1f22'; ctx.beginPath(); ctx.ellipse(x, -82, 40, 36, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8d8b0'; ctx.beginPath(); ctx.ellipse(x + 30, -82, 8, 32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0b35a'; for (let k = -2; k <= 2; k++) circle([x + k * 12, -50], 2);
}
function drawLanternString(x0, x1, y) {
  ctx.strokeStyle = 'rgba(40,30,30,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + 40, x1, y); ctx.stroke();
  for (let k = 1; k < 5; k++) { const t = k / 5, lx = x0 + (x1 - x0) * t, ly = y + 40 * 4 * t * (1 - t) * 0.5 + 10; lanternAt(lx, ly, false); }
}
function drawRocks(x, n) {
  for (let k = 0; k < n; k++) { const w = 18 + hash(x + k) * 26; ctx.fillStyle = k % 2 ? '#2a2638' : '#34304a'; ctx.beginPath(); ctx.ellipse(x + k * 26, -w * 0.3, w, w * 0.55, 0, Math.PI, 0); ctx.fill(); }
}
const MENU_M = { x: 0, y: 0, sx: 0, sy: 0 };
window.addEventListener('pointermove', e => { MENU_M.x = (e.clientX / innerWidth - 0.5) * 2; MENU_M.y = (e.clientY / innerHeight - 0.5) * 2; });
function renderMenu() {
  const dt = menuDt;
  menuCam.x = damp(menuCam.x, menuCam.tx, 3.2, dt); menuCam.z = damp(menuCam.z, menuCam.tz, 2.4, dt);
  const onMenu = $id('menu').classList.contains('on');
  MENU_M.sx = damp(MENU_M.sx, onMenu ? MENU_M.x : 0, 2, dt); MENU_M.sy = damp(MENU_M.sy, onMenu ? MENU_M.y : 0, 2, dt);
  const dz = menuCam.z - 1, baseX = menuCam.x + MENU_M.sx * 18;
  // 分层：远处的东西随镜头移动和放大得少，近处的多 → 推进时有纵深感
  const layer = (par, zk) => { cam.x = baseX * par; cam.y = -MENU_M.sy * 5 * par - dz * 30 * zk; cam.zoom = 1 + dz * zk; };
  for (const f of MENU_FLIES) { f.ph += dt * f.sp; f.x += Math.cos(f.ph * 0.7) * 18 * dt; f.y = clamp(f.y + Math.sin(f.ph) * 12 * dt, -440, -20); }
  for (const l of MENU_LEAVES) { l.x += (l.vx + Math.sin(clock + l.ph) * 20) * dt; l.y += l.vy * dt; l.r += dt * 2; if (l.y > 20) { l.y = rand(-800, -500); l.x = rand(cam.x - 1200, cam.x + 1200); } }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layer(0.9, 0.25); drawBackdrop(worldScale());
  layer(0.95, 0.55);
  bamboo(0.3, worldScale(), groundY(), '#221e44', 120, 0.55);
  const mist = ctx.createLinearGradient(0, groundY() - H * 0.35, 0, groundY());
  mist.addColorStop(0, 'rgba(170,150,210,0)'); mist.addColorStop(1, 'rgba(170,150,210,0.14)'); ctx.fillStyle = mist; ctx.fillRect(0, 0, W, groundY());
  layer(1, 1);
  const sc = worldScale();
  ctx.save(); ctx.translate(W / 2, groundY()); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  menuGround();
  const S1 = MENU_SPOT.single, S2 = MENU_SPOT.netp;
  drawPlum(S1 - 420); drawRocks(S1 - 520, 3); drawTarget(S1 - 260); drawFence(S1 - 360, S1 - 200);
  drawPavilion(S1); drawLanternString(S1 + 160, S1 + 420, -170);
  drawDummy(S1 + 250, 1); drawDummy(S1 + 330, 2); drawDummy(S1 + 410, 3); drawRocks(S1 + 460, 2);
  drawArena(S2); drawWarDrum(S2 - 320); drawRocks(S2 + 300, 3); drawPlum(S2 + 420);
  lantern(160, -2); lantern(-160, -2);
  if (MENU_HERO && onMenu) {   // 正中站着当前选的侠客
    animFighter(MENU_HERO);
    // 人和脚下的按钮不跟着鼠标左右的视差走（只有背景在动），鼠标或触控板左右划过去时按钮不会跑开
    ctx.save(); ctx.translate(baseX - menuCam.x, 0); ctx.scale(1.4, 1.4); drawFighter(MENU_HERO); drawParticles(false); ctx.restore();   // 放大一点，站在两盏灯中间
    const hx = W / 2 + (MENU_HERO.x * 1.4 - menuCam.x) * sc, hy = groundY() + 10, el = $id('homeHero');
    const half = el ? Math.min(W / 2, (el.offsetWidth || 0) / 2 + 12) : 0, ux = Math.max(half, Math.min(W - half, hx));   // 窄屏时侠客站得偏，按钮夹在屏幕里
    if (el && (el._x !== Math.round(ux) || el._y !== Math.round(hy))) { el._x = Math.round(ux); el._y = Math.round(hy); el.style.left = el._x + 'px'; el.style.top = el._y + 'px'; }
  }
  menuFlies(false);
  for (const l of MENU_LEAVES) { ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.r); ctx.fillStyle = 'rgba(120,160,110,0.6)'; ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * 0.35, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  ctx.restore();
  // 前景竹子：推进时放大最快，并淡出，像镜头穿过竹林
  layer(1.1, 1.9);
  ctx.globalAlpha = clamp(1 - dz * 1.1, 0.12, 1);
  bamboo(1.45, worldScale(), groundY() + 40 * worldScale(), '#050409', 330, 1.35);
  ctx.globalAlpha = 1;
  layer(1, 1);
  if (SETTINGS.bloom > 0) drawBloom(sc, 0, 0, menuEmissive);
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, 0.7 * SETTINGS.vig)})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const dim = clamp(dz / 0.9, 0, 1) * 0.22;
  if (dim > 0.01) { ctx.fillStyle = `rgba(4,4,12,${dim})`; ctx.fillRect(0, 0, W, H); }
}
