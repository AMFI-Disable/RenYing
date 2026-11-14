// ======================= 绘制：背景 =======================
// 本文件：画场景和侠客。
//   1. 背景：远山、云、竹林、地面、地图的特殊地面、灯笼（背景渐变会缓存，不是每帧重算）
//   2. 侠客：drawFighter（身体、兵器、皮肤效果都从这里调出去）、木人、磁极标记
//   3. 多人同屏的身份标识：自己 / 队友 / 对手的光圈、地面标记、头顶名字、出画面时的边缘箭头
//   4. 雾身和替身的画法
// 找 bug 提示：画面问题和逻辑无关——这里只读状态不改状态；改了这里不会影响联机同步。
function drawDistantPagoda(px, py, sc) {
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(14, 18, 30, 0.78)';
  // 塔刹尖顶
  ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(2, -32); ctx.lineTo(-2, -32); ctx.closePath(); ctx.fill();
  // 三层飞檐古塔
  for (let tier = 0; tier < 3; tier++) {
    const ty = -32 + tier * 11, tw = 11 + tier * 5;
    ctx.beginPath();
    ctx.moveTo(-tw - 5, ty + 5);
    ctx.quadraticCurveTo(0, ty - 2, tw + 5, ty + 5);
    ctx.lineTo(tw, ty + 8);
    ctx.lineTo(-tw, ty + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-tw * 0.55, ty + 7, tw * 1.1, 6);
  }
  // 塔窗微光
  ctx.fillStyle = 'rgba(255, 200, 110, 0.55)';
  ctx.fillRect(-1.5, -18, 3, 4);
  ctx.restore();
}
function drawInkClouds(gy, sc) {
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const sp = 14 + (i % 3) * 6;
    const cx = ((hash(i * 19 + 3) * W * 1.5 + clock * sp - cam.x * (0.06 + i * 0.02) * sc) % (W + 420) + (W + 420)) % (W + 420) - 210;
    const cy = gy - H * (0.14 + (i % 3) * 0.09);
    const rw = (130 + hash(i * 7) * 90) * sc, rh = (18 + hash(i * 13) * 12) * sc;
    const g = ctx.createRadialGradient(cx, cy, rh * 0.2, cx, cy, rw);
    g.addColorStop(0, 'rgba(225, 220, 235, 0.09)');
    g.addColorStop(0.55, 'rgba(160, 155, 185, 0.04)');
    g.addColorStop(1, 'rgba(20, 22, 36, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
const ARENA_SPLATTERS = [];
// 天空、宣纸晕染和两带山岚只跟画布尺寸与场景颜色有关：按 context 缓存渐变对象，每帧只换 fillStyle。
// 山岚是纯竖直渐变，按 y=0 建一次、画的时候整体 translate 到地平线，镜头上下移动也不会失效
const BG_GRAD = new WeakMap();
function bgGrads(sky, mc, legend) {
  const key = W + 'x' + H + '|' + sky.join(',') + '|' + mc + '|' + (legend ? 1 : 0);
  let g = BG_GRAD.get(ctx);
  if (!g || g.key !== key) {
    const skyG = ctx.createLinearGradient(0, 0, 0, H);
    skyG.addColorStop(0, sky[0]); skyG.addColorStop(0.48, sky[1]); skyG.addColorStop(0.78, sky[2]); skyG.addColorStop(1, sky[3]);
    const wash = ctx.createRadialGradient(W * 0.65, H * 0.24, H * 0.05, W * 0.55, H * 0.35, W * 0.75);
    wash.addColorStop(0, 'rgba(239, 230, 210, 0.08)');
    wash.addColorStop(0.5, 'rgba(180, 195, 220, 0.02)');
    wash.addColorStop(1, 'rgba(4, 6, 12, 0.28)');
    const mid = ctx.createLinearGradient(0, -H * 0.32, 0, -H * 0.08);
    mid.addColorStop(0, `rgba(${mc},0)`);
    mid.addColorStop(0.5, `rgba(${mc},0.11)`);
    mid.addColorStop(1, `rgba(${mc},0.02)`);
    const low = ctx.createLinearGradient(0, -H * 0.25, 0, 0);
    low.addColorStop(0, `rgba(${mc},0)`); low.addColorStop(1, `rgba(${mc},${legend ? 0.28 : 0.19})`);
    g = { key, sky: skyG, wash, mid, low };
    BG_GRAD.set(ctx, g);
  }
  return g;
}
function drawBackground(sc) {
  const T = SCN, sky = T ? T.sky : ['#060914', '#141b30', '#262b44', '#181c2b'], mc = T ? T.mist : SCN_DEF.mist;
  const bg = bgGrads(sky, mc, !!(T && T.legend));
  ctx.fillStyle = bg.sky; ctx.fillRect(0, 0, W, H);
  // 宣纸水墨暗纹晕染（四角微暗、天际微亮）
  ctx.fillStyle = bg.wash; ctx.fillRect(0, 0, W, H);
  // 雷雨天：偶尔闪一下
  if (T && T.storm) { const k = Math.floor(clock * 0.4), ph = clock * 0.4 - k; if (hash(k) < 0.45 && ph < 0.12) { ctx.fillStyle = `rgba(200,170,255,${0.22 * (1 - ph / 0.12)})`; ctx.fillRect(0, 0, W, H); } }
  // 星星
  ctx.fillStyle = '#fff';
  for (let i = 0, ns = 90 * (T && T.stars !== undefined ? T.stars : 1); i < ns; i++) {
    const x = ((hash(i) * W * 1.4 - cam.x * 0.02 * sc) % W + W) % W, y = hash(i + 50) * H * 0.5;
    ctx.globalAlpha = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(clock * (1 + hash(i + 9) * 2) + i));
    ctx.fillRect(x, y, 1.3, 1.3);
  }
  ctx.globalAlpha = 1;
  // 月亮
  const mx = W * 0.68 - (cam.x - STAGE_W / 2) * 0.04 * sc, my = H * 0.26, mr = H * 0.11;
  drawOrb(T, mx, my, mr, clock);
  if (T && T.legend && T.rays) drawRays(T, mx, my);
  // 远山：四层水墨皴染峰峦 + 层间云雾 + 孤峰古塔
  const gy = groundY(), mt = (T && T.mtn) || SCN_DEF.mtn, bm = (T && T.bam) || SCN_DEF.bam;
  mountains(0.04, gy - H * 0.28, H * 0.18, 'rgba(26, 34, 54, 0.55)', 0.6, sc);
  mountains(0.08, gy - H * 0.2, H * 0.16, mt[0], 1.3, sc);
  // 远峰孤塔剪影
  const pagX = W * 0.76 - (cam.x - STAGE_W / 2) * 0.08 * sc;
  const pagU = (pagX + (cam.x - STAGE_W / 2) * 0.08 * sc) / H;
  const pagY = (gy - H * 0.2) - (H * 0.16) * (0.55 * Math.sin(pagU * 2.3 + 1.3) + 0.3 * Math.sin(pagU * 5.1 + 2.6) + 0.15 * Math.sin(pagU * 11 + 3.9));
  drawDistantPagoda(pagX, pagY + 4 * sc, sc * 0.95);
  // 中层云岚流雾（渐变按 y=0 缓存，画之前整体移到地平线）
  ctx.save(); ctx.translate(0, gy);
  ctx.fillStyle = bg.mid; ctx.fillRect(0, -H * 0.32, W, H * 0.24);
  ctx.restore();
  mountains(0.18, gy - H * 0.1, H * 0.12, mt[1], 4.7, sc);
  mountains(0.28, gy - H * 0.04, H * 0.07, 'rgba(10, 13, 24, 0.86)', 8.2, sc);
  drawInkClouds(gy, sc);
  ctx.save(); ctx.translate(0, gy);
  ctx.fillStyle = bg.low; ctx.fillRect(0, -H * 0.25, W, H * 0.25);
  ctx.restore();
  // 竹林
  bamboo(0.5, sc, gy, bm[0], 150, 0.75);
  bamboo(0.75, sc, gy, bm[1], 210, 0.9);
  if (T && T.legend) {   // 传说场景：地平线上一层主题色的光
    const gl = ctx.createLinearGradient(0, gy - H * 0.12, 0, gy + 4);
    gl.addColorStop(0, `rgba(${T.orbC},0)`); gl.addColorStop(1, `rgba(${T.orbC},0.2)`);
    ctx.fillStyle = gl; ctx.fillRect(0, gy - H * 0.12, W, H * 0.12 + 4);
  }
}
const groundY = () => H * 0.8 + (-cam.y) * worldScale();
function mountains(par, base, amp, color, seed, sc) {
  const off = (cam.x - STAGE_W / 2) * par * sc;
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W + 10; x += 10) {
    const u = (x + off) / H;
    const y = base - amp * (0.55 * Math.sin(u * 2.3 + seed) + 0.3 * Math.sin(u * 5.1 + seed * 2) + 0.15 * Math.sin(u * 11 + seed * 3));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}
function bamboo(par, sc, gy, color, spacing, scale) {
  const s = sc * scale, cx = cam.x * par;
  const k0 = Math.floor((cx - W / 2 / s) / spacing) - 1, k1 = Math.ceil((cx + W / 2 / s) / spacing) + 1;
  ctx.fillStyle = color; ctx.strokeStyle = color;
  for (let k = k0; k <= k1; k++) {
    if (hash(k * 3.1 + par) < 0.3) continue;
    const lx = k * spacing + hash(k + par * 10) * spacing * 0.6;
    const x = W / 2 + (lx - cx) * s, w = (7 + hash(k + 5) * 5) * s;
    const sway = Math.sin(clock * 0.8 + k) * 8 * s;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, gy); ctx.lineTo(x + w / 2, gy);
    ctx.lineTo(x + w / 2 + sway, -20); ctx.lineTo(x - w / 2 + sway, -20); ctx.closePath(); ctx.fill();
    for (let n = 1; n < 9; n++) {
      const yy = gy - n * 80 * s; if (yy < 0) break;
      const sx = x + sway * (1 - yy / gy);
      ctx.fillRect(sx - w * 0.7, yy, w * 1.4, 2 * s);
      if (hash(k * 7 + n) > 0.62) {
        const dir = hash(k + n * 3) > 0.5 ? 1 : -1;
        for (let l = 0; l < 3; l++) {
          ctx.save(); ctx.translate(sx, yy); ctx.rotate(dir * (0.5 + l * 0.35) + Math.sin(clock * 1.3 + k + l) * 0.08);
          ctx.beginPath(); ctx.ellipse(dir * 22 * s, 0, 22 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
    }
  }
}
// 山河异境的地面：断崖台两侧画成深谷，寒潭冰面画出冰的范围，还有酒雾、平台、风、天雷预警（画在柱子、灯笼前面）
function drawMapGround() {
  const mp = mapNow();
  if (!mp) return;
  if (mp.cliff) {
    for (const side of [-1, 1]) {
      const ex = side < 0 ? WALL : STAGE_W - WALL, x0 = side < 0 ? ex - 3000 : ex;
      const g = ctx.createLinearGradient(0, -40, 0, 420);
      g.addColorStop(0, 'rgba(6,6,16,0.2)'); g.addColorStop(0.15, '#05050d'); g.addColorStop(1, '#020206');
      ctx.fillStyle = g; ctx.fillRect(x0, -2, 3000, 820);
      // 崖壁：一道参差的石边
      ctx.fillStyle = '#2a2440';
      ctx.beginPath(); ctx.moveTo(ex, -2);
      for (let k = 0; k <= 8; k++) ctx.lineTo(ex - side * (10 + hash(k * 13 + (side > 0 ? 7 : 0)) * 26), k * 34);
      ctx.lineTo(ex, 300); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(190,210,255,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex - side * 60, 0); ctx.lineTo(ex, 0); ctx.stroke();
      // 谷底的雾
      for (let k = 0; k < 4; k++) {
        const mx = ex + side * (120 + k * 170) + Math.sin(clock * 0.3 + k) * 30;
        const mg = ctx.createRadialGradient(mx, 120 + k * 30, 10, mx, 120 + k * 30, 180);
        mg.addColorStop(0, 'rgba(150,170,220,0.13)'); mg.addColorStop(1, 'rgba(150,170,220,0)');
        ctx.fillStyle = mg; ctx.fillRect(mx - 180, -60 + k * 30, 360, 360);
      }
    }
  }
  const ix = mapIceX();
  if (ix) {
    const [x0, x1] = ix;
    const g = ctx.createLinearGradient(0, 0, 0, 60);
    g.addColorStop(0, 'rgba(170,220,255,0.38)'); g.addColorStop(1, 'rgba(120,180,230,0.05)');
    ctx.fillStyle = g; ctx.fillRect(x0, 0, x1 - x0, 60);
    ctx.strokeStyle = 'rgba(210,240,255,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
    // 冰上的反光和裂纹
    ctx.strokeStyle = 'rgba(230,248,255,0.22)'; ctx.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
      const cx = x0 + (k + 0.5) * (x1 - x0) / 9, len = 16 + hash(k * 5) * 30;
      ctx.beginPath(); ctx.moveTo(cx - len, 6 + hash(k) * 30); ctx.lineTo(cx + len, 2 + hash(k * 3) * 26); ctx.stroke();
    }
    const sx = x0 + ((clock * 90) % (x1 - x0));
    const sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.16)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - 60, 0, 120, 40);
  }
  // 醉翁墨阁的酒雾：地面上一层慢慢飘的淡雾
  if (mp.fog) {
    const x0 = mp.fog.from * STAGE_W, x1 = mp.fog.to * STAGE_W;
    for (let k = 0; k < 7; k++) {
      const mx = x0 + (k + 0.5) * (x1 - x0) / 7 + Math.sin(clock * 0.5 + k * 1.7) * 26, my = -26 - hash(k * 7) * 30;
      const mg = ctx.createRadialGradient(mx, my, 6, mx, my, 120);
      mg.addColorStop(0, 'rgba(230,200,160,0.16)'); mg.addColorStop(1, 'rgba(230,200,160,0)');
      ctx.fillStyle = mg; ctx.fillRect(mx - 120, my - 120, 240, 240);
    }
  }
  // 平台：竹台、石坛、木檐
  for (const P of mp.plats || []) {
    const left = P.x - P.w / 2, top = P.y, w = P.w, h = 12;
    if (P.k === 'bamboo') {
      ctx.fillStyle = '#212d1b'; ctx.fillRect(left + 28, top + h, 8, -top - h); ctx.fillRect(left + w - 36, top + h, 8, -top - h);
      ctx.fillStyle = '#2d3b26'; ctx.fillRect(left, top, w, h);
      ctx.fillStyle = '#415735'; ctx.fillRect(left, top + 2, w, h - 4);
      ctx.strokeStyle = '#182414'; ctx.lineWidth = 1.5;
      for (let bx = left + 15; bx < left + w; bx += 22) { ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx, top + h); ctx.stroke(); }
      ctx.fillStyle = '#9e814a'; for (const rx of [left + 35, left + w - 35]) ctx.fillRect(rx - 4, top - 1, 8, h + 2);
    } else if (P.k === 'stone') {
      ctx.fillStyle = '#141824'; ctx.strokeStyle = 'rgba(233,196,106,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(left + 20, top + h); ctx.lineTo(left + 45, 0); ctx.lineTo(left + w - 45, 0); ctx.lineTo(left + w - 20, top + h); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1c2130'; ctx.fillRect(left, top, w, h); ctx.strokeRect(left, top, w, h);
    } else {
      ctx.fillStyle = '#2a0e14'; ctx.fillRect(left + 24, top + h, 6, -top - h); ctx.fillRect(left + w - 30, top + h, 6, -top - h);
      ctx.fillStyle = '#3a161e'; ctx.fillRect(left, top, w, h);
      ctx.fillStyle = '#6e2732'; ctx.fillRect(left, top, w, 3);
      ctx.strokeStyle = 'rgba(233,196,106,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left - 8, top - 4); ctx.quadraticCurveTo(left, top + 3, left + 14, top + 3);
      ctx.moveTo(left + w + 8, top - 4); ctx.quadraticCurveTo(left + w, top + 3, left + w - 14, top + 3);
      ctx.stroke();
    }
  }
  const E = M.mapEnv;
  // 竹海悬岩的风：顺着风向飞的竹叶
  if (mp.wind && E && E.wOn > 0) {
    ctx.fillStyle = 'rgba(140,245,190,0.45)';
    for (let i = 0; i < 9; i++) {
      const span = STAGE_W + 400, lx = ((clock * 680 * E.wDir + i * 210) % span + span) % span - 200, ly = -30 - ((i * 35) % 190);
      ctx.beginPath(); ctx.ellipse(lx, ly, 13, 3.2, E.wDir * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 雷泽石坛的天雷预警：落点上空闪的圈和一道虚线
  if (mp.thunder && E && E.tWarn > 0) {
    const tx = mp.thunder.x * STAGE_W, pulse = 0.6 + 0.4 * Math.sin(clock * 25);
    ctx.save();
    ctx.strokeStyle = `rgba(255,220,110,${pulse})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(tx, -120, mp.thunder.r - 10, 24, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(tx, -120, 100, 15, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([8, 6]); ctx.strokeStyle = `rgba(255,240,160,${pulse * 0.7})`;
    ctx.beginPath(); ctx.moveTo(tx, -500); ctx.lineTo(tx, -120); ctx.stroke();
    ctx.restore();
  }
}
function drawGround() {
  // 世界坐标里画地面、柱子、灯笼
  const g = ctx.createLinearGradient(0, 0, 0, 260);
  g.addColorStop(0, '#221c38'); g.addColorStop(1, '#0a0816');
  ctx.fillStyle = g; ctx.fillRect(-3000, 0, STAGE_W + 6000, 800);
  ctx.strokeStyle = 'rgba(200,180,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3000, 0); ctx.lineTo(STAGE_W + 3000, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,180,255,0.07)'; ctx.lineWidth = 1;
  for (const y of [22, 58, 110]) { ctx.beginPath(); ctx.moveTo(-3000, y); ctx.lineTo(STAGE_W + 3000, y); ctx.stroke(); }
  for (let x = -600; x < STAGE_W + 600; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (x - cam.x) * 0.25, 22); ctx.stroke(); }
  // 月光倒影
  const rg = ctx.createRadialGradient(cam.x + 200, 40, 10, cam.x + 200, 40, 400);
  rg.addColorStop(0, 'rgba(255,236,210,0.1)'); rg.addColorStop(1, 'rgba(255,236,210,0)');
  ctx.fillStyle = rg; ctx.fillRect(cam.x - 400, 0, 1200, 200);
  drawMapGround();
  // 两侧朱红柱子（场地边界）；断崖台两侧是崖、皇城飞檐两侧是开阔的殿顶，没有柱子
  if (!(mapNow() || {}).cliff && !(mapNow() || {}).nobounce) for (const px of [WALL - 40, STAGE_W - WALL + 40]) {
    ctx.fillStyle = '#3a121c'; ctx.fillRect(px - 16, -900, 32, 900);
    ctx.fillStyle = 'rgba(255,120,120,0.12)'; ctx.fillRect(px - 16, -900, 6, 900);
    ctx.fillStyle = '#1e0a10'; ctx.fillRect(px - 22, -10, 44, 10);
  }
  // 石灯笼
  const lanternXs = isMulti() ? [260, 780, STAGE_W / 2, STAGE_W - 780, STAGE_W - 260] : [260, STAGE_W / 2, STAGE_W - 260];
  for (const lx of lanternXs) lantern(lx, -2);
  // 场地边界墨痕重击血迹与刀痕飞溅 (Arena Boundary Splatters)
  if (ARENA_SPLATTERS && ARENA_SPLATTERS.length) {
    for (let i = ARENA_SPLATTERS.length - 1; i >= 0; i--) {
      const sp = ARENA_SPLATTERS[i];
      sp.life -= STEP;
      if (sp.life <= 0) { ARENA_SPLATTERS.splice(i, 1); continue; }
      const al = clamp(sp.life / sp.max, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(18,18,25,${0.65 * al})`;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.rx, sp.ry, sp.rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // 地面重击裂痕 / 焦痕
  if (ARENA2V2.scars && ARENA2V2.scars.length) {
    for (let i = ARENA2V2.scars.length - 1; i >= 0; i--) {
      const sc = ARENA2V2.scars[i];
      sc.life -= STEP;
      if (sc.life <= 0) { ARENA2V2.scars.splice(i, 1); continue; }
      const al = clamp(sc.life / sc.max, 0, 1);
      ctx.save();
      ctx.strokeStyle = `rgba(${sc.rgb || '255,200,110'},${0.55 * al})`;
      ctx.fillStyle = `rgba(10,8,18,${0.65 * al})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sc.x, 2, sc.r, sc.r * 0.18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let k = -2; k <= 2; k++) {
        line([sc.x + k * 8, 2], [sc.x + k * (sc.r * 0.45), (k % 2 ? 7 : -4)]);
      }
      ctx.restore();
    }
  }
  // 2v2 / 同袍肉鸽 扩阔擂台专属交互奇阵：两侧【御风灵泉】与中央【天道剑坛】
  if (isMulti()) {
    ctx.save();
    for (const gy of ARENA2V2.geysers) {
      const ready = gy.cd <= 0;
      const col = ready ? '100,245,215' : '110,130,150';
      const pulse = 0.65 + 0.35 * Math.sin(clock * 6 + gy.x);
      ctx.strokeStyle = `rgba(${col},${ready ? 0.8 * pulse : 0.3})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(gy.x, 1, 44, 9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(gy.x, 1, 28, 5, 0, 0, Math.PI * 2); ctx.stroke();
      if (ready) {
        const wg = ctx.createLinearGradient(gy.x, 0, gy.x, -135);
        wg.addColorStop(0, 'rgba(100,245,215,0.34)');
        wg.addColorStop(1, 'rgba(100,245,215,0)');
        ctx.fillStyle = wg;
        ctx.fillRect(gy.x - 32, -135, 64, 135);
        for (let k = 0; k < 3; k++) {
          const wy = -((clock * 120 + k * 45) % 130);
          ctx.strokeStyle = `rgba(180,255,240,${0.6 * (1 + wy / 130)})`;
          ctx.beginPath(); ctx.ellipse(gy.x, wy, 26 * (1 - wy / 220), 4, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    const ax = STAGE_W / 2;
    ctx.fillStyle = '#241d38'; ctx.strokeStyle = 'rgba(233,196,106,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(ax, 2, 64, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (ARENA2V2.orb && ARENA2V2.orb.active) {
      const cols = ['255,110,70', '110,245,185', '195,135,255'];
      const labels = ['破军神火', '太阴灵丹', '紫微星魄'];
      const oc = cols[ARENA2V2.orb.kind] || cols[0];
      const oy = -64 + Math.sin(clock * 4.5) * 8;
      const og = ctx.createRadialGradient(ax, oy, 3, ax, oy, 46);
      og.addColorStop(0, 'rgba(255,255,255,0.95)');
      og.addColorStop(0.35, `rgba(${oc},0.75)`);
      og.addColorStop(1, `rgba(${oc},0)`);
      ctx.fillStyle = og; circle([ax, oy], 46);
      ctx.strokeStyle = `rgba(${oc},0.9)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ax, oy, 18, clock * 3, clock * 3 + Math.PI * 1.5); ctx.stroke();
      ctx.font = `bold 13px ${BODY_FONT}`; ctx.fillStyle = `rgb(${oc})`; ctx.textAlign = 'center';
      ctx.fillText(cvT(labels[ARENA2V2.orb.kind]), ax, oy - 26);
    }
    ctx.restore();
  }
}
function lantern(x, y) {
  const flick = 0.85 + Math.sin(clock * 9 + x) * 0.08 + Math.sin(clock * 23 + x) * 0.05;
  const rg = ctx.createRadialGradient(x, y - 70, 2, x, y - 70, 110);
  rg.addColorStop(0, `rgba(255,170,90,${0.35 * flick})`); rg.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = rg; ctx.fillRect(x - 110, y - 180, 220, 220);
  ctx.fillStyle = '#16121f';
  ctx.fillRect(x - 5, y - 50, 10, 50); ctx.fillRect(x - 16, y - 8, 32, 8);
  ctx.fillRect(x - 14, y - 58, 28, 8);
  ctx.beginPath(); ctx.moveTo(x - 22, y - 84); ctx.lineTo(x + 22, y - 84); ctx.lineTo(x, y - 104); ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(255,190,110,${flick})`; ctx.fillRect(x - 9, y - 80, 18, 20);
  ctx.fillStyle = '#16121f'; ctx.fillRect(x - 1, y - 80, 2, 20);
}

