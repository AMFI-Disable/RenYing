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
// 有自己顶栏（标题 + 返回）的页面不显示右上角账号栏，免得返回按钮和登录/退出叠在一起
const MENU_SCREENS = ['menu', 'single', 'netp', 'help', 'settings', 'acc', 'lb', 'welfare', 'gboss'];
// 首页动效：一次按压只走一条时间线 —— 镜头推进、首页散场、新页面入场都在这里排好
const MENU_DOLLY = 520;                 // 推进镜头的时长，和 CSS 里 .scr 的交接收尾对齐
let menuLock = false;                   // 按下之后锁住悬停和连点，回到首页才解锁
let menuEntered = false;                // 首页入场动画是否已经播过
let currentScreen = 'menu';             // showScreen 当前显示的是哪一页（null = 在对局里）
const prefersReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// 主界面按钮：悬停时镜头平移到对应场景，点击后推进镜头再打开页面
function menuGo(name) {
  if (menuLock) return;                 // 已经出发了：忽略连点和二次点击
  menuLock = true;
  initAudio();
  const spot = MENU_SPOT[name];
  const root = $id('menu');
  if (spot !== undefined) { menuCam.tx = spot * 1.05; menuCam.tz = 1.9; }
  root.classList.remove('hl-single', 'hl-netp');   // 出发了就收掉悬停态，别让两张卡一个亮一个暗地退场
  delete root.dataset.enter;                       // 入场还没播完就点了：直接切到退场
  root.dataset.phase = spot !== undefined ? 'out' : 'out-fast';
  document.body.classList.add('menu-handoff');
  let target = null;
  try { target = openScreen(name, false); }   // 先把页面建好，等镜头推到位再上屏
  catch (err) {                               // 建页出错也要把首页放回来，别让它停在全透明的状态
    console.error('刃影：打开页面出错', err);
    menuLock = false;
    delete root.dataset.phase;
    document.body.classList.remove('menu-handoff');
    return;
  }
  if (!target) {                        // 教程直接在场上开讲，没有要上屏的页面
    menuLock = false;
    delete root.dataset.phase;
    document.body.classList.remove('menu-handoff');
    return;
  }
  setTimeout(() => {
    delete root.dataset.phase;
    showScreen(target);
    setTimeout(() => document.body.classList.remove('menu-handoff'), 320);
  }, prefersReduced() ? 0 : (spot !== undefined ? MENU_DOLLY : 220));
}
const AI_PROFILES = {
  easy: {
    name: '入门',
    badge: '初学练手',
    badgeCol: '#46d3ea',
    desc: '反应很慢（0.42~0.7 秒），很少格挡（15%），一套最多打 2 下，技能常常乱放，三成动作会失误。适合熟悉移动、按键手感和技能命中。',
    traits: ['反应 0.4 秒以上', '很少格挡 (15%)', '2 连段']
  },
  normal: {
    name: '寻常',
    badge: '标准对练',
    badgeCol: '#2bd49a',
    desc: '反应 0.26~0.42 秒，会格挡（40%）、偶尔确反，能打 3 连段、偶尔取消接技能，被连多了会腾空闪。适合练常规走位和破招时机。',
    traits: ['反应约 0.3 秒', '格挡 40%', '3 连段']
  },
  hard: {
    name: '劲敌',
    badge: '凌厉反击',
    badgeCol: '#e9c46a',
    desc: '反应 0.15~0.25 秒，格挡 68% 并偶尔精准招架，挡住就确反，5 连段接技能，会压起身、偶尔骗闪，血量领先会拉开距离，并按双方角色调整站位。',
    traits: ['挡后确反', '压起身', '按角色针对']
  },
  impossible: {
    name: '绝顶',
    badge: '极境宗师',
    badgeCol: '#ff6b6b',
    desc: '反应 0.08~0.13 秒，格挡 88%、四成精准招架，记住你被连几下会闪并停手骗闪，算好起身时机压起身，用自我对弈训练出的角色打法。本难度电脑多 35% 血。',
    traits: ['骗闪', '读你的起身习惯', '训练出的角色打法']
  },
  god: {
    name: '天道',
    badge: '天道神境 · 自我对弈',
    badgeCol: '#d946ef',
    desc: '反应只有 0.025~0.05 秒，几乎每招都防、九成精准招架，蓄力斩没蓄满就打断，躲大招、骗闪、压起身、针对角色特性全开；每个角色的打法都是 AI 和 AI 自我对弈进化出来的。',
    traits: ['自我对弈训练', '九成精准招架', '骗闪与压起身']
  }
};

function updateAIBrief() {
  const lv = pickLevel || 'normal';
  const p = AI_PROFILES[lv] || AI_PROFILES.normal;
  const badgeEl = $id('aiBadge');
  if (badgeEl) {
    badgeEl.textContent = p.badge;
    badgeEl.style.borderColor = p.badgeCol;
    badgeEl.style.color = p.badgeCol;
  }
  const descEl = $id('aiDesc');
  if (descEl) descEl.textContent = p.desc;
  const traitsEl = $id('aiTraits');
  if (traitsEl) traitsEl.innerHTML = p.traits.map(t => `<span class="trait-chip">${t}</span>`).join('');
  const adaptEl = $id('adaptLine');
  if (adaptEl) {
    adaptEl.style.display = 'none';
  }
}

// 模式所属类别映射
const SINGLE_TAB_CATS = {
  cpu: 'regular', stage: 'regular', train: 'regular',
  tower: 'rogue', chaos: 'rogue',
  tag3: 'special', mayhem: 'special', watch2v2: 'special'
};

// 单人面板：sec 为空时切换至当前激活的模式标签，否则切换并显示指定模块
let currentSingleTab = 'cpu';
let currentSingleCat = 'regular';

function setSingleCat(cat) {
  currentSingleCat = cat;
  for (const b of document.querySelectorAll('#singleCatTabs button')) {
    b.classList.toggle('sel', b.dataset.cat === cat);
  }
  for (const b of document.querySelectorAll('#singleTabs button')) {
    const belongs = b.dataset.cat === cat;
    b.style.display = belongs ? '' : 'none';
  }
}

function singleSec(sec) {
  const active = sec || currentSingleTab || 'cpu';
  currentSingleTab = active;
  const targetCat = SINGLE_TAB_CATS[active] || 'regular';
  setSingleCat(targetCat);

  for (const b of document.querySelectorAll('#singleTabs button')) {
    b.classList.toggle('sel', b.dataset.tab === active);
  }
  for (const el of document.querySelectorAll('#single [data-sec]')) {
    const secs = el.dataset.sec.split(' ');
    el.style.display = secs.includes(active) ? '' : 'none';
  }
  const scr = $id('single');
  if (scr) scr.scrollTop = 0;
  $id('singleT').textContent = '单人模式';
  const subEl = $id('singleSub');
  if (subEl) {
    const subs = {
      cpu: '选择 AI 难度与对手境界，在实战对局中锤炼招式攻防',
      tag3: '挑选三位豪杰排定出战顺序，胜者保留残血守擂，直至一方全灭！',
      tower: '挑选本命侠客登临万仞剑阁，突破层层守关者，顿悟三选一武林秘卷！',
      chaos: '天机莫测，乾坤逆转！每隔十五息随机降临百种异象秘法加持',
      stage: '六大篇章逐级挑战，斩妖除魔，迎战守关宗师',
      train: '召唤不屈木人靶桩，随心演练连段、伤害与打击判定',
      mayhem: '通天彻地神魔狂战！十倍真元气血，全技能绝技无冷却狂暴轰炸！',
      watch2v2: '你和电脑队友两人一队，对阵两名电脑；也可以旁观四名天道 AI 同台演武'
    };
    subEl.textContent = subs[active] || '挑选离线玩法，潜心修习剑术招式';
  }
  if (active === 'tag3') renderTag3();
  else if (active === 'tower') renderTower();
  else if (active === 'chaos') renderChaos();
  else if (active === 'stage') renderStages();
  else if (active === 'train') renderDummyFeatures();
  else if (active === 'mayhem') renderMayhem();
  else if (active === 'watch2v2') renderSingle2v2();
  else if (active === 'cpu') updateAIBrief();
}
// 建页面和上屏分开：menuGo 先把页面建好（趁镜头推进时做，不占上屏那一帧），镜头到位再 showScreen
function openScreen(name, reveal = true) {
  if (OFFLINE_BUILD && name === 'netp') name = 'stage';
  if (name === 'cpu' || name === 'tag3' || name === 'tower' || name === 'chaos' || name === 'stage' || name === 'train' || name === 'mayhem' || name === 'watch2v2') {
    singleSec(name);
    if (reveal) showScreen('single');
    return 'single';
  }
  if (name === 'single') singleSec(null);
  if (name === 'tutorial') { startTutorial(); return null; }   // 开的是教学对局，没有页面要上屏
  if (name === 'tasks') renderTasks();
  if (name === 'replays') renderReplays();
  if (name === 'netp') renderRankLine();
  if (name === 'single') renderStages();
  if (name === 'settings') { settingsBack = 'menu'; buildSettings(); }
  if (name === 'codex') openCodex();
  if (name === 'community') openCommunity();
  if (name === 'armory' && typeof window.openArmory === 'function') window.openArmory();
  if (name === 'gboss') { renderGboss(); gbLoad(); gbFlush(); }
  if (reveal) showScreen(name);
  return name;
}
function backToMenu() { menuLock = false; $id('menu').classList.remove('hl-single', 'hl-netp'); showScreen('menu'); compMaybe(); }
// ---------- 首页正中的展示角色：下面一个「开始人机对战」直接用他开打，一个「更换角色」 ----------
let MENU_HERO = null, menuHeroId = -1;
function menuHeroPick() {   // 记住上次展示的角色；现在用不了就换成第一个能用的
  const av = availList();
  let id = null; try { id = localStorage.getItem('renying-hero'); } catch (e) {}
  const i = CHARS.findIndex(c => c.id === id);
  return av.includes(i) ? i : (av.length ? av[0] : 0);
}
function setMenuHero(ci) {
  try { localStorage.setItem('renying-hero', CHARS[ci].id); } catch (e) {}
  const k = mySkin(CHARS[ci].id);
  if (MENU_HERO && menuHeroId === ci && MENU_HERO.skinKey === k) return;
  const f = new Fighter(0); f.setChar(ci); f.look = skinLook(ci, k); f.skinKey = k; f.reset(0); f.face = 1;
  MENU_HERO = f; menuHeroId = ci;
  const sk = k && SKINS[k];   // 穿着皮肤时样子会变很多，名字写出来免得认不出是谁
  $id('heroName').innerHTML = escapeHTML(CHARS[ci].name) + (sk ? `<small>${escapeHTML(sk.name)}</small>` : '');
}
function heroQuickFight(lv) {
  if (menuLock || menuHeroId < 0) return;
  initAudio(); heroPickShow(false); heroLvShow(false);
  if (lv) { pickLevel = lv; for (const x of document.querySelectorAll('#levels button')) x.classList.toggle('sel', x.dataset.lv === lv); }
  paused = false;
  // 首页已经选好角色和难度：不进点将台，直接开打，对手随机挑一个别的侠客
  const foes = CHARS.map((c, i) => i).filter(i => i !== menuHeroId);
  const foe = foes[Math.random() * foes.length | 0];
  netDropWaiting(); chatClear(); BP = null; bpMode = 'cpu'; bpCustomOpts = null;
  showPop(null); showScreen(null);
  MSTAT.maxcombo = 0; MSTAT.ults = 0;
  startMatch('cpu', pickLevel, [menuHeroId, foe]);
  M.quick = true;   // 「再来一局」也不进点将台
  applySkins();
}
function heroPickShow(on) {
  const el = $id('heroPick'); if (!el) return;
  if (on) {
    const av = availList(); ensurePortraits();
    el.style.gridTemplateColumns = `repeat(${Math.min(6, av.length)}, 64px)`;
    el.innerHTML = av.map(i => `<button type="button" data-i="${i}" class="${i === menuHeroId ? 'sel' : ''}"><img src="${PORTRAITS[i] || ''}" alt=""><span style="color:rgb(${CHARS[i].look.slash})">${CHARS[i].name}</span></button>`).join('');
  }
  el.hidden = !on;
  if (on) heroLvShow(false);
}
function heroLvShow(on) {   // 点「开始人机对战」先弹一排难度，点哪个就用哪个开打
  const el = $id('heroLv'); if (!el) return;
  if (on) { heroPickShow(false); for (const b of el.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.lv === pickLevel); }
  el.hidden = !on;
}
$id('heroGo').addEventListener('click', e => { e.stopPropagation(); SFX.block && SFX.block(); heroLvShow($id('heroLv').hidden); });
$id('heroLv').addEventListener('click', e => { const b = e.target.closest('button[data-lv]'); if (!b) return; e.stopPropagation(); SFX.slice && SFX.slice(); heroQuickFight(b.dataset.lv); });
$id('heroSwap').addEventListener('click', e => { e.stopPropagation(); heroPickShow($id('heroPick').hidden); });
$id('heroPick').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]'); if (!b) return;
  e.stopPropagation(); setMenuHero(+b.dataset.i); heroPickShow(false); SFX.block && SFX.block();
});
document.addEventListener('click', e => { if (!e.target.closest('#homeHero')) { heroPickShow(false); heroLvShow(false); } });
// 回放从设置里进：返回时回到设置
let replaysFrom = 'menu';
$id('setReplays').addEventListener('click', () => { replaysFrom = 'settings'; openScreen('replays'); });
$id('rpBack').addEventListener('click', () => { if (replaysFrom === 'settings') { replaysFrom = 'menu'; openScreen('settings'); } else backToMenu(); });
// ---------- 顶部导航 ----------
const NAV_SCREENS = ['menu', 'single', 'netp', 'codex', 'armory', 'tasks', 'community', 'replays', 'lb', 'acc', 'settings', 'help', 'welfare', 'gboss'];
function navTo(name) {
  initAudio();
  if (name === 'menu') { backToMenu(); return; }
  if (name === 'acc') { openAcc(); return; }
  if (name === 'qfx') { openQfx(); return; }
  if ($id('menu').classList.contains('on')) { menuGo(name); return; }   // 和卡片走同一条时间线，目的地一样感觉就一样
  if (MENU_SPOT[name] !== undefined) { menuCam.tx = MENU_SPOT[name]; menuCam.tz = 1.35; }
  openScreen(name);
}
for (const b of document.querySelectorAll('#topNav [data-nav]')) b.addEventListener('click', () => { SFX.slice && SFX.slice(); navTo(b.dataset.nav); });
$id('helpTut').addEventListener('click', () => openScreen('tutorial'));
function renderTopNav() {
  const nav = $id('topNav');
  if (!nav) return;
  const name = curName();
  $id('tnInkN').textContent = (PROF.ink || 0).toLocaleString();
  $id('tnName').textContent = name || '未登录';
  if (name) {
    const s = rkState();
    $id('tnRank').textContent = rkPlaced(s) ? `${rkTier(s.pts).label} · ${rkTier(s.pts).name}` : `定级赛 ${s.placed}/${RK.PLACE}`;
    $id('tnMedal').innerHTML = rkMedalFor(s, 34);
  } else {
    $id('tnRank').textContent = '登录 / 注册';
    $id('tnMedal').innerHTML = rkMedalSVG(null, 34, { placed: 0 });
  }
  const st = window.CloudSave && CloudSave.getSyncState ? CloudSave.getSyncState() : { state: 'local' };
  $id('tnSync').className = 'tn-sync s-' + (name ? st.state : 'none');
  $id('tnSync').title = !name ? '' : { local: '本机存档', idle: '已连接云端', ok: '云端已同步', pending: '等待上传', syncing: '上传中', offline: '断网中，联网后补传', error: '上传失败' }[st.state] || '';
}
function renderHome() {
  const sea = rkSeason();
  $id('homeSeason').textContent = sea.pre ? '季前赛' : SEASON.name;
  $id('homeSeasonTxt').textContent = sea.pre ? `第一赛季 ${fmtLeft(sea.left)} 后开启` : sea.over ? '赛季已结束' : `10.22 – 11.22 · 剩余 ${fmtLeft(sea.left)}`;
  const name = curName();
  if (!name) { $id('homeMedal').innerHTML = rkMedalSVG(null, 56, { placed: 0 }); $id('homeRankL').textContent = '未定级'; $id('homeRankS').textContent = '登录后打 5 场定级赛'; return; }
  const s = rkState();
  $id('homeMedal').innerHTML = rkMedalFor(s, 56);
  if (rkPlaced(s)) { const t = rkTier(s.pts); $id('homeRankL').textContent = `${t.label} · ${t.name}`; $id('homeRankS').textContent = `${t.pts.toLocaleString()} 分 · ${s.w} 胜 ${s.l} 负`; }
  else { $id('homeRankL').textContent = `定级赛 ${s.placed}/${RK.PLACE}`; $id('homeRankS').textContent = `估分 ～${Math.round(s.est).toLocaleString()}`; }
}
$id('homeRank').addEventListener('click', () => navTo('netp'));
for (const b of document.querySelectorAll('#menu [data-go]')) {
  b.addEventListener('click', () => {
    if (menuLock) return;                                  // 连点只算一次
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 900);
    menuGo(b.dataset.go);
  });
}   // 悬停不再把镜头甩到两边：场景只跟着鼠标轻轻晃（见 renderMenu 里的 MENU_M）
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', backToMenu);

// ======================= 设置 =======================
let settingsBack = 'menu';
const SETTING_ROWS = [
  { k: 'lang', name: '语言 / Language', opts: [['zh', '简体中文'], ['en', 'English']] },
  { k: 'aim', name: '朝向', opts: [[true, '按 A / D 决定'], [false, '自动面向对手']] },
  { k: 'autoSkin', name: '皮肤', opts: [[true, '自动穿最好的'], [false, '按我选的穿']] },
  { k: 'bloom', name: '泛光', opts: [[1.6, '高（最佳效果）'], [1, '中'], [0.5, '低'], [0, '关']] },
  { k: 'fps', name: '帧率上限', opts: [[144, '144'], [120, '120'], [60, '60'], [30, '30']] },
  { k: 'quality', name: '画质', opts: [['high', '极高画质（原生全像素）'], ['mid', '中'], ['low', '低']] },
  { k: 'blur', name: '背景虚化', opts: [[true, '开'], [false, '关']] },
  { k: 'shake', name: '画面震动', range: [0, 2, 0.1] },
  { k: 'vig', name: '暗角', range: [0, 1.5, 0.1] },
  { k: 'music', name: '音乐', range: [0, 1, 0.05] },
  { k: 'sfx', name: '音效', range: [0, 1, 0.05] },
];
const KEY_ACTIONS = [
  ['left', '向左移动'],
  ['right', '向右移动'],
  ['jump', '跳跃 / 二段跳'],
  ['down', '沉身格挡'],
  ['dash', '疾步冲刺'],
  ['special', '绝技（气满）'],
  ['skill', '门派绝学（Q）'],
  ['skill2', '特殊突进（R）']
];
let rebindingKey = null;
function handleKeyRebind(e) {
  if (!rebindingKey) return;
  e.preventDefault(); e.stopPropagation();
  if (e.code === 'Escape') {
    rebindingKey = null;
    window.removeEventListener('keydown', handleKeyRebind, true);
    buildSettings();
    return;
  }
  custom1PKeys[rebindingKey] = e.code;
  try { localStorage.setItem('renying-1p-keys', JSON.stringify(custom1PKeys)); } catch (err) {}
  applyCustomKeys();
  rebindingKey = null;
  window.removeEventListener('keydown', handleKeyRebind, true);
  buildSettings();
}
function buildSettings() {
  const baseHtml = SETTING_ROWS.map(r => r.opts
    ? `<div class="setrow"><span>${r.name}</span><div class="seg" data-k="${r.k}">${r.opts.map(([v, t]) => `<button data-v='${JSON.stringify(v)}' class="${SETTINGS[r.k] === v ? 'sel' : ''}">${t}</button>`).join('')}</div><span></span></div>`
    : `<div class="setrow"><span>${r.name}</span><input type="range" data-k="${r.k}" min="${r.range[0]}" max="${r.range[1]}" step="${r.range[2]}" value="${SETTINGS[r.k]}"><span class="v" id="sv_${r.k}">${Math.round(SETTINGS[r.k] * 100)}%</span></div>`).join('');
  const keyHtml = `
    <div class="keypanel" style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-family:${TITLE_FONT};font-size:18px;color:#e9c46a;">1P 键位设置</span>
        <button id="resetKeysBtn" class="ghost" style="padding:4px 12px;font-size:12px;">恢复默认</button>
      </div>
      <div class="keygrid">
        ${KEY_ACTIONS.map(([act, name]) => `
          <div class="keyitem">
            <span>${name}</span>
            <button class="ghost keybind-btn ${rebindingKey === act ? 'active' : ''}" data-act="${act}">
              ${rebindingKey === act ? '请按新键…' : keyLabel(custom1PKeys[act])}
            </button>
          </div>
        `).join('')}
      </div>
      <p style="font-size:12px;color:rgba(239,232,216,0.4);margin-top:10px;">鼠标提示：左键轻击与蓄力，右键腾空闪，左键加右键使特殊技</p>
    </div>
  `;
  $id('setList').innerHTML = baseHtml + keyHtml;
}
$id('setList').addEventListener('click', e => {
  const rst = e.target.closest('#resetKeysBtn');
  if (rst) {
    custom1PKeys = { ...DEFAULT_1P_KEYS };
    try { localStorage.removeItem('renying-1p-keys'); } catch (err) {}
    applyCustomKeys();
    buildSettings();
    toast('已恢复默认键位');
    return;
  }
  const kb = e.target.closest('.keybind-btn');
  if (kb) {
    rebindingKey = kb.dataset.act;
    window.removeEventListener('keydown', handleKeyRebind, true);
    window.addEventListener('keydown', handleKeyRebind, true);
    buildSettings();
    return;
  }
  const b = e.target.closest('button'); if (!b || !b.parentElement || !b.parentElement.dataset.k) return;
  const k = b.parentElement.dataset.k; SETTINGS[k] = JSON.parse(b.dataset.v); saveSettings(); buildSettings();
  if (k === 'lang' && window.I18N) window.I18N.setLang(SETTINGS[k]);
  if (k === 'quality') resize();
  if (k === 'autoSkin') applySkins();
});
$id('setList').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  SETTINGS[k] = +e.target.value; $id('sv_' + k).textContent = Math.round(SETTINGS[k] * 100) + '%'; saveSettings();
  if (k === 'music' || k === 'sfx') applyVolumes();
});
$id('setDone').addEventListener('click', () => { if (settingsBack === 'pause') showScreen('pause'); else backToMenu(); });
$id('pauseSet').addEventListener('click', () => { settingsBack = 'pause'; buildSettings(); showScreen('settings'); });

