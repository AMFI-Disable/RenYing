// ======================= 绘制：背景 =======================
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
function drawBackground(sc) {
  const T = SCN, sky = T ? T.sky : ['#060914', '#141b30', '#262b44', '#181c2b'];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sky[0]); g.addColorStop(0.48, sky[1]); g.addColorStop(0.78, sky[2]); g.addColorStop(1, sky[3]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 宣纸水墨暗纹晕染（四角微暗、天际微亮）
  const skyWash = ctx.createRadialGradient(W * 0.65, H * 0.24, H * 0.05, W * 0.55, H * 0.35, W * 0.75);
  skyWash.addColorStop(0, 'rgba(239, 230, 210, 0.08)');
  skyWash.addColorStop(0.5, 'rgba(180, 195, 220, 0.02)');
  skyWash.addColorStop(1, 'rgba(4, 6, 12, 0.28)');
  ctx.fillStyle = skyWash; ctx.fillRect(0, 0, W, H);
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
  const gy = groundY(), mt = (T && T.mtn) || SCN_DEF.mtn, bm = (T && T.bam) || SCN_DEF.bam, mc = T ? T.mist : SCN_DEF.mist;
  mountains(0.04, gy - H * 0.28, H * 0.18, 'rgba(26, 34, 54, 0.55)', 0.6, sc);
  mountains(0.08, gy - H * 0.2, H * 0.16, mt[0], 1.3, sc);
  // 远峰孤塔剪影
  const pagX = W * 0.76 - (cam.x - STAGE_W / 2) * 0.08 * sc;
  const pagU = (pagX + (cam.x - STAGE_W / 2) * 0.08 * sc) / H;
  const pagY = (gy - H * 0.2) - (H * 0.16) * (0.55 * Math.sin(pagU * 2.3 + 1.3) + 0.3 * Math.sin(pagU * 5.1 + 2.6) + 0.15 * Math.sin(pagU * 11 + 3.9));
  drawDistantPagoda(pagX, pagY + 4 * sc, sc * 0.95);
  // 中层云岚流雾
  const midMist = ctx.createLinearGradient(0, gy - H * 0.32, 0, gy - H * 0.08);
  midMist.addColorStop(0, `rgba(${mc},0)`);
  midMist.addColorStop(0.5, `rgba(${mc},0.11)`);
  midMist.addColorStop(1, `rgba(${mc},0.02)`);
  ctx.fillStyle = midMist; ctx.fillRect(0, gy - H * 0.32, W, H * 0.24);
  mountains(0.18, gy - H * 0.1, H * 0.12, mt[1], 4.7, sc);
  mountains(0.28, gy - H * 0.04, H * 0.07, 'rgba(10, 13, 24, 0.86)', 8.2, sc);
  drawInkClouds(gy, sc);
  const mist = ctx.createLinearGradient(0, gy - H * 0.25, 0, gy);
  mist.addColorStop(0, `rgba(${mc},0)`); mist.addColorStop(1, `rgba(${mc},${T && T.legend ? 0.28 : 0.19})`);
  ctx.fillStyle = mist; ctx.fillRect(0, gy - H * 0.25, W, H * 0.25);
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
  // 两侧朱红柱子（场地边界）
  for (const px of [WALL - 40, STAGE_W - WALL + 40]) {
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
      ctx.fillText(labels[ARENA2V2.orb.kind], ax, oy - 26);
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

// ======================= 绘制：角色 =======================
function drawTrainDummy(f) {
  const lying = f.state === 'knockdown' || f.state === 'getup' && f.t < 0.15;
  const wob = Math.sin(clock * 18) * Math.min(0.25, f.flash * 3) + (f.state === 'hitstun' ? Math.sin(f.t * 30) * 0.08 * Math.max(0, 1 - f.t * 3) : 0);
  const tilt = lying ? 1.4 : f.state === 'launched' ? clamp(-f.vy / 1500, -0.8, 0.8) + f.t * 4 : wob;
  const x = f.x + (f.vox || 0), y = f.y + (f.voy || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(f.x, 2, 34, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (f.escInvul) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(233,196,106,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 60, 36, 62, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.translate(x, y - 60); ctx.rotate(tilt); ctx.translate(0, 60);
  if (f.onGround() && !lying && f.state !== 'launched') { ctx.fillStyle = '#3a2718'; ctx.fillRect(-26, -6, 52, 6); }
  ctx.fillStyle = '#4a3322'; ctx.fillRect(-4, -126, 8, 122); ctx.fillRect(-40, -96, 80, 7);
  const straw = f.flash > 0 ? '#fff4d8' : '#b08a5a';
  ctx.fillStyle = straw; ctx.beginPath(); ctx.ellipse(0, -80, 23, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,55,30,0.55)'; ctx.lineWidth = 1; for (let i = -16; i <= 16; i += 5) { ctx.beginPath(); ctx.moveTo(i, -110); ctx.lineTo(i * 0.8, -48); ctx.stroke(); }
  ctx.fillStyle = straw; ctx.beginPath(); ctx.arc(0, -126, 15, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 2.5; for (const yy of [-92, -66]) { ctx.beginPath(); ctx.moveTo(-21, yy); ctx.lineTo(21, yy); ctx.stroke(); }
  ctx.fillStyle = '#f1e2c0'; ctx.fillRect(-5, -88, 10, 18); ctx.fillStyle = '#b8392e'; ctx.fillRect(-2, -85, 4, 12);
  ctx.strokeStyle = 'rgba(60,40,25,0.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-5, -130); ctx.lineTo(5, -122); ctx.moveTo(5, -130); ctx.lineTo(-5, -122); ctx.stroke();
  if (f.state === 'block' || f.state === 'blockstun') {
    ctx.strokeStyle = 'rgba(170,210,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath();
    const a1 = f.face === 1 ? -1.1 : Math.PI - 1.1;
    const a2 = f.face === 1 ? 1.1 : Math.PI + 1.1;
    ctx.arc(f.face * 26, -80, 30, a1, a2); ctx.stroke();
  }
  ctx.restore();
}
function drawFighter(f) {
  if (f.hidden) return;
  if (f.dummy) return drawTrainDummy(f);
  const rt = CHAR_RARITY[f.ch.id];
  if (f.look.fx) skinAmbient(f);
  else if (rt === 'legend' && Math.random() < 0.2) {   // 传说角色：专属粒子
    const k = f.ch.id, x = f.x + rand(-30, 30), y = f.y - rand(20, 115);
    addP(k === 'moyu' ? { type: 'ink', x, y, vx: rand(-15, 15), vy: -rand(15, 45), g: -30, life: 0.8, max: 0.8, r: rand(1.5, 3), rgb: '15,15,22' }
      : { type: 'spark', x, y, vx: rand(-15, 15), vy: k === 'yanling' ? rand(10, 40) : -rand(20, 60), life: 0.7, max: 0.7, rgb: k === 'yanling' ? '225,238,255' : '235,228,255', w: k === 'yanling' ? 2 : 1.2 });
  } else if (rt === 'rare' && Math.random() < 0.06) addP({ type: 'spark', x: f.x + rand(-24, 24), y: f.y - rand(20, 110), vx: 0, vy: -rand(20, 50), life: 0.5, max: 0.5, rgb: f.look.slash, w: 1 });
  if (f.meter >= 100 && f.hp > 0 && Math.random() < 0.22) {
    addP({ type: 'spark', x: f.x + rand(-22, 22), y: f.y - rand(8, 55), vx: rand(-10, 10), vy: -rand(35, 95), life: 0.42, max: 0.42, rgb: f.look.slash, w: 1.4 });
  }
  const sk = f.sk; if (!sk) return;
  const L = f.look, sc = worldScale();
  if (M.mode === 'mayhem') {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const auraR = 55 + Math.sin(clock * 16 + f.idx * 3) * 12;
    const g = ctx.createRadialGradient(f.x, f.y - 50, 6, f.x, f.y - 50, auraR * 1.5);
    g.addColorStop(0, `rgba(${L.slash}, 0.4)`);
    g.addColorStop(0.5, `rgba(255, 215, 80, 0.22)`);
    g.addColorStop(1, `rgba(${L.slash}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(f.x - auraR * 1.5, f.y - 50 - auraR * 1.5, auraR * 3, auraR * 3);
    ctx.restore();
    if (Math.random() < 0.35) {
      addP({ type: 'spark', x: f.x + rand(-30, 30), y: f.y - rand(10, 100), vx: rand(-40, 40), vy: -rand(60, 160), life: 0.4, max: 0.4, rgb: Math.random() < 0.5 ? '255,215,80' : L.slash, w: 2.2 });
    }
  }
  if (f.look.legend && f.look.fx) skinGround(f);
  if (f.look.tier && f.look.fx) skinTierGround(f);
  // 影子
  const hgt = clamp(-f.y / 300, 0, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - hgt * 0.6)})`;
  ctx.beginPath(); ctx.ellipse(f.x, 2, 34 * (1 - hgt * 0.4), 6, 0, 0, Math.PI * 2); ctx.fill();
  // 蓄力光环
  if (f.state === 'charge') {
    const lv = clamp(f.t / CHARGE_FULL, 0, 1), full = f.t >= CHARGE_FULL;
    const r = 40 + lv * 55 + (full ? Math.sin(clock * 30) * 6 : 0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(f.x, f.y - 50, 4, f.x, f.y - 50, r * 1.4);
    g.addColorStop(0, `rgba(${L.slash},${0.18 + 0.3 * lv})`); g.addColorStop(1, `rgba(${L.slash},0)`);
    ctx.fillStyle = g; ctx.fillRect(f.x - r * 1.5, f.y - 50 - r * 1.5, r * 3, r * 3);
    ctx.strokeStyle = `rgba(${L.slash},${0.3 + 0.5 * lv})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(f.x, 1, 28 + lv * 34, 5 + lv * 4, 0, 0, Math.PI * 2); ctx.stroke();
    if (full) { const tg = ctx.createRadialGradient(sk.tip[0], sk.tip[1], 0, sk.tip[0], sk.tip[1], 26); tg.addColorStop(0, 'rgba(255,255,255,0.9)'); tg.addColorStop(1, `rgba(${L.slash},0)`); ctx.fillStyle = tg; ctx.fillRect(sk.tip[0] - 26, sk.tip[1] - 26, 52, 52); }
    ctx.restore();
  }
  // 腾空闪无敌时的光圈
  if (f.escInvul) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${f.look.slash},${0.4 + 0.3 * Math.sin(clock * 30)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y - 55, 34, 60, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  // 残影
  const big = f.size !== 1;
  if (big) { ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.size, f.size); ctx.translate(-f.x, -f.y); }
  const gt = tierRank(L) >= 3 ? L.fx : null;   // 隐秘、非凡：残影在两种主题色之间流转（正常叠加：用“变亮”叠几层就糊成一团白）
  for (const g of f.ghosts) drawBody(g.sk, f, { ghost: g.life * (gt ? 0.46 : 0.4), tint: gt ? rgbMix(gt.c, gt.c2 || gt.c, (g.life * 2.5) % 1) : '' });
  skinTierMotes(f, false);
  // 霸体金光 / 影遁增益 / 月镜 / 金刚雷铠
  if (f.armorT > 0 || f.buffT > 0 || f.parryT > 0 || (f.thunderGuardT && f.thunderGuardT > 0)) {
    const rgb = (f.thunderGuardT && f.thunderGuardT > 0) ? '255,230,120' : (f.armorT > 0 ? '255,210,120' : f.parryT > 0 ? '235,225,255' : '190,80,255');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(f.x, f.y - 55, 5, f.x, f.y - 55, 80);
    g.addColorStop(0, `rgba(${rgb},${0.28 + 0.1 * Math.sin(clock * 20)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(f.x - 90, f.y - 145, 180, 180); ctx.restore();
    if (f.parryT > 0) {
      ctx.strokeStyle = 'rgba(245,240,255,0.8)'; ctx.lineWidth = 2.5; ctx.beginPath();
      const a1 = f.face === 1 ? -1.2 : Math.PI - 1.2;
      const a2 = f.face === 1 ? 1.2 : Math.PI + 1.2;
      ctx.arc(f.x + f.face * 22, f.y - 70, 38, a1, a2); ctx.stroke();
    }
    if (f.thunderGuardT && f.thunderGuardT > 0) {
      ctx.strokeStyle = 'rgba(255,235,140,0.85)'; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.arc(f.x, f.y - 60, 45 + 5 * Math.sin(clock * 25), 0, Math.PI * 2); ctx.stroke();
    }
  }
  // 定身墨迹
  if (f.rooted && f.state === 'hitstun') { ctx.fillStyle = 'rgba(10,10,16,0.75)'; ctx.beginPath(); ctx.ellipse(f.x, 0, 36, 8, 0, 0, Math.PI * 2); ctx.fill(); }
  // 围巾
  if (f.look.weapon === 'hammer') {   // 链锤：告诉物理模拟锤子现在该干什么
    const L = f.look, hk = projs.find(p => p.owner === f.idx && (p.kind === 'hook' || p.kind === 'net') && !p.dead);
    if (hk && hk.kind === 'hook') { L.flMode = 'out'; L.flTo = [hk.x, hk.y]; }
    else if (hk) { const drop = hk.delay > 0 ? hk.delay / 0.25 : 0; L.flMode = 'ult'; L.flTo = [hk.x, hk.y + 45 - drop * 320 - 40]; }
    else if (f.state === 'skill' && f.skill === 'whirl' && f.t > 0.08 && f.spN < 5) { L.flMode = 'spin'; L.flSpin = f.t; }
    else L.flMode = f.state === 'attack' || f.state === 'skill' || f.state === 'special' || f.state === 'charge' ? 'whip' : 'hang';
  }
  if (f.ch && f.ch.fly) drawWings(sk, f);
  drawScarf(f);
  drawBody(sk, f, { flash: f.flash > 0, invul: f.invul > 0 && f.invul < 50 && f.state !== 'special' && f.state !== 'knockdown' });
  if (big) ctx.restore();
  if (f.jailT > 0 && f.hp > 0) drawWengTing(f.jailX, 0, 1, Math.min(1, f.jailT * 3));   // 关在醉翁亭里：亭子罩着人，前柱半透明
  // 剑光
  drawTrail(f);
  skinTierMotes(f, true);
  // 玉箫头顶的音律、被勾陈震魄时身上的金圈
  if (f.ch && f.ch.passive === 'rhythm' && (f.notes || 0) > 0 && f.hp > 0) {
    ctx.save(); ctx.fillStyle = 'rgba(' + f.look.slash + ',0.85)'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.4;
    for (let k = 0; k < f.notes; k++) {
      const x = sk.head[0] + (k - (f.notes - 1) / 2) * 13, y = sk.head[1] - 30 + Math.sin(clock * 4 + k) * 2;
      ctx.beginPath(); ctx.ellipse(x, y, 3.6, 2.6, -0.4, 0, 7); ctx.fill(); line([x + 3, y], [x + 3, y - 10]);
    }
    ctx.restore();
  }
  if ((f.hookedT || 0) > 0 && f.hp > 0) {
    ctx.save(); ctx.strokeStyle = 'rgba(235,205,130,' + (0.4 + 0.3 * Math.min(1, f.hookedT)) + ')'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(f.x, f.y - 56, 22, 34, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // 凌雀雀芒印记：身周环绕粉紫悬丝印记（当自身为凌雀且 R 就绪时高亮显现可重置光环）
  if ((f.needleMark || 0) > 0 && f.hp > 0) {
    const isPlayerLQ = A && A.ch && A.ch.id === 'lingque';
    const rReady = isPlayerLQ && (A.skill2CD || 0) <= 0;
    ctx.save();
    if (rReady) {
      // R 可重置就绪特效：醒目的粉紫双环气旋 + 顶部雀芒菱印
      const pulse = 0.7 + 0.3 * Math.sin(clock * 12);
      ctx.strokeStyle = `rgba(255,140,230,${pulse})`; ctx.lineWidth = 2.4;
      ctx.shadowColor = '#ff8ce6'; ctx.shadowBlur = 12;
      const a0 = clock * 6;
      for (let k = 0; k < 4; k++) {
        const ang = a0 + k * (Math.PI / 2);
        const px = f.x + Math.cos(ang) * 30, py = f.y - 52 + Math.sin(ang) * 20;
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 52, 32, 22, 0, 0, Math.PI * 2); ctx.stroke();
      // 头顶雀芒击破标志 (Diamond Crest)
      ctx.fillStyle = `rgba(255,230,250,${0.85 + 0.15 * Math.sin(clock * 14)})`;
      ctx.beginPath();
      const topY = f.y - 110 + Math.sin(clock * 8) * 3;
      ctx.moveTo(f.x, topY - 14);
      ctx.lineTo(f.x + 10, topY);
      ctx.lineTo(f.x, topY + 14);
      ctx.lineTo(f.x - 10, topY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e040fb'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(235,110,210,${0.5 + 0.4 * Math.sin(clock * 10)})`; ctx.lineWidth = 1.8;
      const a0 = clock * 5;
      for (let k = 0; k < 3; k++) {
        const ang = a0 + k * (Math.PI * 2 / 3);
        const px = f.x + Math.cos(ang) * 24, py = f.y - 50 + Math.sin(ang) * 16;
        ctx.fillStyle = '#ffe8fa'; ctx.beginPath(); ctx.arc(px, py, 2.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 50, 26, 18, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  // 被连击且可以挣脱时，头顶提示
  if ((f.state === 'launched' || f.state === 'knockdown' || (f.state === 'hitstun' && f.comboHits >= 2)) && f.hp > 0 && f.breakCD <= 0 && M.phase === 'fight' && M.mode !== 'demo'
      && !(f.ctrl instanceof AICtrl) && !f.dummy && f.ctrl !== NET.remote) {
    ctx.save(); ctx.font = `22px ${TITLE_FONT}`; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.45 * Math.sin(clock * 14)})`;
    ctx.fillText('腾空闪', sk.head[0], sk.head[1] - 28); ctx.restore();
  }
  // 2v2 / 同袍肉鸽 队伍头顶指示三角（玩家绿、队友蓝、对手/魔首红金；阵亡后自动消失）
  if (isMulti() && f.hp > 0 && !f.hidden && sk.head) {
    const isAiWatch = M.watchAi || (M.mode === 'watch2v2' && M.watchAi);
    let col = '#46d3ea', glow = 'rgba(70,211,234,0.45)';
    if (isAiWatch) {
      const isTeam0 = fighterTeam(f) === 0;
      col = isTeam0 ? '#46d3ea' : '#ff4d4d';
      glow = isTeam0 ? 'rgba(70,211,234,0.45)' : 'rgba(255,77,77,0.45)';
    } else {
      const isUser = (f.ctrl === human[0]) || (typeof viewerIdx === 'function' && viewerIdx() >= 0 && f.idx === viewerIdx());
      const myTeam = typeof localTeam === 'function' ? localTeam() : 0;
      const isTeammate = (fighterTeam(f) === myTeam) && !isUser;
      col = isUser ? '#38d976' : (isTeammate ? '#46d3ea' : (isRaid() ? '#ffd166' : '#ff4d4d'));
      glow = isUser ? 'rgba(56,217,118,0.45)' : (isTeammate ? 'rgba(70,211,234,0.45)' : 'rgba(255,77,77,0.55)');
    }
    const hx = sk.head[0];
    const bounce = Math.sin(clock * 5 + f.idx * 1.5) * 2.5;
    const tipY = sk.head[1] - 32 + bounce;
    const topY = tipY - 12;
    const halfW = 7;
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 5;
    ctx.fillStyle = col;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, tipY);
    ctx.lineTo(hx - halfW, topY);
    ctx.lineTo(hx + halfW, topY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
function drawDecoys() {
  for (const d of decoys) {
    const sk = d.sk; if (!sk) continue;
    const a = clamp(d.life / 0.3, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(d.x, d.y - 40); ctx.rotate(d.rot); ctx.translate(-d.x0, -d.y0 + 40);
    const segs = [[sk.hip, sk.kb, 7], [sk.kb, sk.fb, 6.5], [sk.sh, sk.eb, 6], [sk.eb, sk.hb, 5.5], [sk.hip, sk.neck, 11], [sk.hip, sk.kf, 7], [sk.kf, sk.ff, 6.5], [sk.sh, sk.ef, 6], [sk.ef, sk.hf, 5.5]];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2e2014'; ctx.fillStyle = '#2e2014';
    for (const s of segs) { ctx.lineWidth = s[2] + 4; line(s[0], s[1]); }
    circle(sk.head, 12);
    ctx.strokeStyle = '#b08a5a'; ctx.fillStyle = '#b08a5a';
    for (const s of segs) { ctx.lineWidth = s[2]; line(s[0], s[1]); }
    circle(sk.head, 10);
    // 绑绳和符纸
    ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 1.5;
    const mx = (sk.hip[0] + sk.neck[0]) / 2, my = (sk.hip[1] + sk.neck[1]) / 2;
    line([mx - 6, my - 6], [mx + 6, my - 6]); line([mx - 6, my + 6], [mx + 6, my + 6]);
    ctx.fillStyle = '#f1e2c0'; ctx.fillRect(mx - 4, my - 9, 8, 16);
    ctx.fillStyle = '#b8392e'; ctx.fillRect(mx - 1.5, my - 6, 3, 10);
    ctx.strokeStyle = '#2e2014'; ctx.lineWidth = 1.6;
    line([sk.head[0] - 4, sk.head[1] - 3], [sk.head[0] + 4, sk.head[1] + 3]); line([sk.head[0] + 4, sk.head[1] - 3], [sk.head[0] - 4, sk.head[1] + 3]);
    ctx.restore();
  }
}
