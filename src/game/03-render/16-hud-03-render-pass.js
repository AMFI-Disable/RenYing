function drawStats() {
  if (M.mode === 'demo') return;
  const fs = Math.max(12, Math.round(H * 0.016)), x = 14, y = H - 12;
  ctx.save(); ctx.font = `${fs}px ${BODY_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(239,232,216,0.55)';
  let t = `${cvT('帧率')} ${FPS}`;
  ctx.fillText(t, x, y);
  if (M.mode === 'net' && NET.rtt) {
    // 到对手的一个来回（点对点，没有服务器这一段）
    const ms = Math.round(NET.rtt), w = ctx.measureText(t + '   ').width;
    ctx.fillStyle = ms < 80 ? '#8fe0a0' : ms < 160 ? '#e9c46a' : '#ff8a78';
    const tx = `${cvT('延迟 对手')} ${ms}ms`;
    ctx.fillText(tx, x + w, y);
  }
  // 回滚与联机遥测 HUD (按 ~ 或 F2 切换)
  if (NET_HUD) {
    const hudFs = Math.max(12, Math.round(H * 0.015));
    const hw = 260, hh = 116, hx = W - hw - 14, hy = 14;
    ctx.fillStyle = 'rgba(10, 11, 28, 0.90)';
    ctx.strokeStyle = 'rgba(70, 211, 234, 0.45)';
    ctx.lineWidth = 1;
    ctx.fillRect(hx, hy, hw, hh);
    ctx.strokeRect(hx, hy, hw, hh);

    ctx.font = `bold ${hudFs}px ${BODY_FONT}`;
    ctx.fillStyle = '#46d3ea';
    ctx.fillText('📡 联机回滚遥测（按 ~ 或 F2 收起）', hx + 10, hy + 22);

    ctx.font = `${hudFs}px ${BODY_FONT}`;
    ctx.fillStyle = 'rgba(239,232,216,0.85)';
    const rttVal = (M.mode === 'net' && NET.rtt) ? `${Math.round(NET.rtt)}ms` : '本地';
    const advVal = ROLL.on ? `${ROLL.peerAdv}帧` : '0';
    const fVal = ROLL.on ? `${ROLL.F}/${ROLL.remLast}` : `${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, '0')}`;
    ctx.fillText(`延迟: ${rttVal} | 模式: ${M.mode}`, hx + 10, hy + 44);
    ctx.fillText(`帧进度: ${fVal} | 优势: ${advVal}`, hx + 10, hy + 66);
    ctx.fillText(`回滚: ${ROLL.rollbacks || 0}次 | 顿帧: ${ROLL.stall ? '是' : '否'}`, hx + 10, hy + 88);
    ctx.fillText(`状态: ${ROLL.on ? '回滚中' : '单机'}（按 ~ 或 F2 收起）`, hx + 10, hy + 110);
  }
  ctx.restore();
}
function drawCredit() {
  if (creditT <= 0 || M.mode === 'demo') return;
  const t = CREDIT - creditT, a = Math.min(clamp(t / 0.35, 0, 1), clamp(creditT / 0.45, 0, 1));
  const cx = W / 2, cy = H * 0.28, s1 = Math.round(H * 0.028);
  ctx.save(); ctx.globalAlpha = a;

  const lang = window.I18N ? I18N.getLang() : 'zh';
  const isEn = lang === 'en';
  const title = isEn ? 'CREATED BY' : '制作';
  const names = isEn
    ? 'Even, Luffy, Opus 5.5, Gemini 4 Argon'
    : 'Even、Luffy、Opus 5.5、Gemini 4 Argon';

  let s2 = Math.round(H * (isEn ? 0.048 : 0.052));
  const maxW = W * 0.86;
  ctx.font = `700 ${s2}px ${BODY_FONT}`;
  let tw = ctx.measureText(names).width;
  if (tw > maxW) {
    s2 = Math.max(12, Math.floor(s2 * (maxW / tw)));
    ctx.font = `700 ${s2}px ${BODY_FONT}`;
    tw = ctx.measureText(names).width;
  }

  const bw = Math.min(W * 0.94, Math.max(tw + s2 * 3.4, W * 0.65)), bh = Math.round(s2 * 2.35);
  const g = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  g.addColorStop(0, 'rgba(6,5,14,0)'); g.addColorStop(0.18, 'rgba(6,5,14,0.86)'); g.addColorStop(0.82, 'rgba(6,5,14,0.86)'); g.addColorStop(1, 'rgba(6,5,14,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);

  const lw = Math.min(bw * 0.84, tw + s2 * 1.6) * clamp(t / 0.6, 0, 1);          // 金线从中间展开
  ctx.fillStyle = 'rgba(233,196,106,0.8)';
  ctx.fillRect(cx - lw / 2, cy - bh / 2 + 5, lw, 1.5); ctx.fillRect(cx - lw / 2, cy + bh / 2 - 7, lw, 1.5);

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `italic ${s1}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.72)';
  if ('letterSpacing' in ctx) ctx.letterSpacing = isEn ? `${Math.round(s1 * 0.2)}px` : `${Math.round(s1 * 0.3)}px`;
  ctx.fillText(title, cx, cy - s2 * 0.52);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  const lift = (1 - clamp(t / 0.5, 0, 1)) * 12;
  ctx.font = `700 ${s2}px ${BODY_FONT}`;
  ctx.shadowColor = 'rgba(120,230,255,0.45)'; ctx.shadowBlur = 24; ctx.fillStyle = '#f4ecd8';
  ctx.fillText(names, cx, cy + s2 * 0.32 + lift);
  ctx.restore();
}
function drawAnnounce() {
  if (!announce) {
    if (announceQueue.length > 0) announce = announceQueue.shift();
    else return;
  }
  const a = announce, k = a.t / a.dur;
  if (k >= 1) {
    announce = announceQueue.length > 0 ? announceQueue.shift() : null;
    if (!announce) return;
  }
  const inK = clamp(a.t / 0.15, 0, 1), outK = clamp((a.dur - a.t) / 0.25, 0, 1), al = Math.min(inK, outK);
  const sc = a.style === 'ko' ? lerp(2.2, 1, Math.pow(inK, 0.5)) : lerp(1.4, 1, inK);
  const cyRatio = a.style === 'super' ? 0.3 : (creditT > 0 ? 0.54 : 0.42);
  ctx.save(); ctx.translate(W / 2, H * cyRatio); ctx.scale(sc, sc); ctx.globalAlpha = al;
  // 英文界面：大字和副标题查词条（KO 那一枚方印只放得下一个字，不翻）；译文长了就缩字号、副标题折行
  const lang = window.I18N ? I18N.getLang() : 'zh';
  if (a.lang !== lang) { a.lang = lang; a.tText = a.style === 'ko' ? a.text : cvT(a.text); a.tSub = cvT(a.sub); }
  const text = a.tText, maxW = W * 0.9;
  let size = H * (a.style === 'ko' ? 0.26 : a.style === 'super' ? 0.12 : 0.13);
  ctx.font = `${Math.round(size)}px ${TITLE_FONT}`;
  if (a.style !== 'ko' && ctx.measureText(text).width > maxW) { size *= maxW / ctx.measureText(text).width; ctx.font = `${Math.round(size)}px ${TITLE_FONT}`; }
  const tw = ctx.measureText(text).width;
  const subFit = a.tSub ? cvFit(a.tSub, maxW, Math.max(12, Math.round(H * (a.style === 'super' ? 0.12 : 0.13) * 0.27)), s => `${s}px ${BODY_FONT}`) : null;
  const subW = subFit ? Math.max(...subFit.lines.map(l => ctx.measureText(l).width)) : 0, subH = subFit ? subFit.size * 1.3 : 0;
  ctx.font = `${Math.round(size)}px ${TITLE_FONT}`;
  if (a.style === 'ko') {
    ctx.fillStyle = '#b8392e'; ctx.rotate(-0.04);
    ctx.fillRect(-size * 0.62, -size * 0.62, size * 1.24, size * 1.24);
    ctx.strokeStyle = 'rgba(255,240,225,0.6)'; ctx.lineWidth = 4; ctx.strokeRect(-size * 0.54, -size * 0.54, size * 1.08, size * 1.08);
    ctx.fillStyle = '#fbeee0';
  } else {
    // 墨迹笔刷底
    ctx.fillStyle = 'rgba(6,5,14,0.82)';
    ctx.beginPath();
    const w = Math.min(W, Math.max(tw, subW) + size * 1.2);
    const h = !a.sub ? size * 0.95 : lang === 'en' ? size * 1.15 + subFit.lines.length * subH : size * 1.35 + (subFit.lines.length - 1) * subH;
    ctx.moveTo(-w / 2, -h / 2);
    for (let i = 0; i <= 12; i++) ctx.lineTo(-w / 2 + w * i / 12, -h / 2 + (hash(a.seed + i) - 0.5) * size * 0.14);
    for (let i = 12; i >= 0; i--) ctx.lineTo(-w / 2 + w * i / 12 + (i === 12 ? size * 0.25 : 0), h / 2 + (hash(a.seed + i + 30) - 0.5) * size * 0.14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = a.style === 'go' ? '#ff8a78' : a.style === 'super' ? '#fff' : '#efe8d8';
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // 中文照旧：大字偏上、副标题压在下沿；英文的标题字体上下伸得长，副标题整块挪到大字下面
  const extra = subFit ? (subFit.lines.length - (lang === 'en' ? 0 : 1)) * subH : 0;
  const textY = lang === 'en' && subFit ? -(size * 0.9 + extra) / 2 + size * 0.42 : (a.sub ? -size * 0.14 : size * 0.05) - extra / 2;
  const subY = lang === 'en' && subFit ? textY + size * 0.5 + subH * 0.55 : size * 0.24 - extra / 2;
  ctx.fillText(text, 0, textY);
  if (subFit) {
    ctx.font = `${subFit.size}px ${BODY_FONT}`;
    ctx.fillStyle = '#efe8d8';
    subFit.lines.forEach((l, i) => ctx.fillText(l, 0, subY + i * subH));
  }
  ctx.restore();
}
// 离屏画布：背景（低分辨率 = 景深虚化）和泛光
const OFF = {};
function offCanvas(name, w, h) {
  let o = OFF[name];
  if (!o) { const c = document.createElement('canvas'); o = OFF[name] = { c, x: c.getContext && c.getContext('2d') }; }
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  if (o.c.width !== w || o.c.height !== h) { o.c.width = w; o.c.height = h; }
  return o;
}
function withCtx(c2, fn) { const main = ctx; ctx = c2; try { fn(); } finally { ctx = main; } }
// ---------- 大招电影镜头：先慢后快 ----------
const cine = { t: -1, owner: null };
function cineEnv() { if (cine.t < 0) return 0; return clamp(Math.min(cine.t / 0.15, (CINE_LEN - cine.t) / 0.3), 0, 1); }
function cineSpeed() {
  let rate = 1;
  if (typeof swapFreezeTimer !== 'undefined' && swapFreezeTimer > 0) rate *= 0.5;
  const t = cine.t;
  if (t < 0) return rate;
  if (t < 0.3) return 0.35 * rate;
  if (t < 0.55) return lerp(0.35, 1.6, (t - 0.3) / 0.25) * rate;
  if (t < CINE_LEN) return lerp(1.6, 1, (t - 0.55) / (CINE_LEN - 0.55)) * rate;
  return rate;
}
// ---------- 萤火虫 ----------
const FIREFLIES = Array.from({ length: 36 }, (_, i) => ({ x: rand(-200, STAGE_W + 200), y: rand(-420, -30), ph: rand(0, 6.28), sp: rand(0.4, 1.1) }));
function updateFireflies(dt) {
  for (const f of FIREFLIES) {
    f.ph += dt * f.sp; f.x += Math.cos(f.ph * 0.7) * 18 * dt; f.y += Math.sin(f.ph) * 12 * dt;
    if (f.y > -20) f.y = -20; if (f.y < -440) f.y = -440;
  }
}
function drawFireflies(glow) {
  for (const f of FIREFLIES) {
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(f.ph * 2.3));
    ctx.fillStyle = `rgba(255,236,150,${a * (glow ? 1 : 0.85)})`;
    circle([f.x, f.y], glow ? 5 : 1.8);
  }
}
// ---------- 发光层：只画会发光的东西，再模糊叠加 ----------
function drawEmissive(sc, sx, sy) {
  withBloomScreen(sc);   // 月亮和星星
  ctx.save();
  ctx.translate(W / 2 + sx, groundY() + sy); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  for (const lx of [260, STAGE_W / 2, STAGE_W - 260]) { ctx.fillStyle = 'rgba(255,170,90,0.5)'; circle([lx, -72], 13); }
  drawFireflies(true);
  drawProjs(true);
  for (const f of [A, B]) {
    if (f.state === 'special' || (f.state === 'charge' && f.t >= CHARGE_FULL) || f.buffT > 0) {
      const g = ctx.createRadialGradient(f.x, f.y - 60, 4, f.x, f.y - 60, 90);
      g.addColorStop(0, `rgba(${f.look.slash},0.8)`); g.addColorStop(1, `rgba(${f.look.slash},0)`);
      ctx.fillStyle = g; ctx.fillRect(f.x - 90, f.y - 150, 180, 180);
    }
    skinEmissive(f);
    drawTrail(f);
  }
  drawParticles(true);
  ctx.restore();
}
function drawBloom(sc, sx, sy, emit) {
  const b1 = offCanvas('b1', W / 4, H / 4), b2 = offCanvas('b2', W / 8, H / 8), b3 = offCanvas('b3', W / 16, H / 16);
  if (!b1.x) return;
  b1.x.setTransform(1, 0, 0, 1, 0, 0); b1.x.clearRect(0, 0, b1.c.width, b1.c.height);
  b1.x.setTransform(b1.c.width / W, 0, 0, b1.c.height / H, 0, 0);
  b1.x.globalCompositeOperation = 'lighter';
  withCtx(b1.x, () => (emit || drawEmissive)(sc, sx, sy));
  b1.x.globalCompositeOperation = 'source-over';
  for (const [src, dst] of [[b1, b2], [b2, b3]]) { dst.x.setTransform(1, 0, 0, 1, 0, 0); dst.x.clearRect(0, 0, dst.c.width, dst.c.height); dst.x.imageSmoothingEnabled = true; dst.x.drawImage(src.c, 0, 0, dst.c.width, dst.c.height); }
  const I = SETTINGS.bloom * (1 + 0.9 * cineEnv());
  // 三层光晕先在四分之一尺寸的画布上按原来的配比叠好，最后只往屏幕上合成一次。
  // 「加亮」是相加混合，先叠后叠结果一样（0.32·b1 + 0.42·b2 + 0.55·b3），但整屏混合从三次变成一次：
  // 无 GPU 的机器上一次 1440×900 的整屏混合就要几毫秒
  const mix = offCanvas('b4', W / 4, H / 4);
  if (mix.x) {
    mix.x.setTransform(1, 0, 0, 1, 0, 0); mix.x.globalAlpha = 1;
    mix.x.globalCompositeOperation = 'source-over'; mix.x.clearRect(0, 0, mix.c.width, mix.c.height);
    mix.x.globalCompositeOperation = 'lighter'; mix.x.imageSmoothingEnabled = true;
    mix.x.globalAlpha = Math.min(1, 0.32 * I); mix.x.drawImage(b1.c, 0, 0, mix.c.width, mix.c.height);
    mix.x.globalAlpha = Math.min(1, 0.42 * I); mix.x.drawImage(b2.c, 0, 0, mix.c.width, mix.c.height);
    mix.x.globalAlpha = Math.min(1, 0.55 * I); mix.x.drawImage(b3.c, 0, 0, mix.c.width, mix.c.height);
    mix.x.globalAlpha = 1;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mix.c, 0, 0, cv.width, cv.height);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.min(1, 0.32 * I); ctx.drawImage(b1.c, 0, 0, cv.width, cv.height);
  ctx.globalAlpha = Math.min(1, 0.42 * I); ctx.drawImage(b2.c, 0, 0, cv.width, cv.height);
  ctx.globalAlpha = Math.min(1, 0.55 * I); ctx.drawImage(b3.c, 0, 0, cv.width, cv.height);
  ctx.restore();
}
// 暗角：只有画布尺寸、vig、ce 会变。ce=0 的时候（绝大多数帧）把渐变烤成一张半尺寸贴图，每帧只做一次缩放贴图；
// 逐像素算一整个屏幕的径向渐变很贵，贴一次图便宜一个数量级
const VIG = { key: '', c: null };
function drawVignette(ce) {
  const vig = SETTINGS.vig;
  if (!(vig > 0)) return;
  if (ce > 0.01) {   // 大招特写：镜头边界与浓淡一直在动，走原来的逐帧渐变
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.36 - 0.08 * ce), W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.6, `rgba(0,0,0,${0.18 * vig})`); v.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, (0.66 + 0.2 * ce) * vig)})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    return;
  }
  const key = cv.width + 'x' + cv.height + '|' + vig;
  if (VIG.key !== key || !VIG.c) {
    // 按设备像素烤一张贴图：放大贴图要走重采样，比一比一贴贵六七倍。
    // 画布特别大（高分屏 + 4K）时退一半尺寸，省一块跟主画布一样大的显存，贴图会被拉开但暗角本来就是平滑渐变
    const big = cv.width * cv.height > 4200000;
    const o = offCanvas('vig', big ? cv.width / 2 : cv.width, big ? cv.height / 2 : cv.height);
    if (!o.x) return;
    o.x.setTransform(1, 0, 0, 1, 0, 0); o.x.clearRect(0, 0, o.c.width, o.c.height);
    o.x.setTransform(o.c.width / W, 0, 0, o.c.height / H, 0, 0);
    const v = o.x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.6, `rgba(0,0,0,${0.18 * vig})`); v.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, 0.66 * vig)})`);
    o.x.fillStyle = v; o.x.fillRect(0, 0, W, H);
    VIG.key = key; VIG.c = o.c; VIG.big = big;
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (VIG.big) { ctx.imageSmoothingEnabled = true; ctx.drawImage(VIG.c, 0, 0, cv.width, cv.height); }
  else ctx.drawImage(VIG.c, 0, 0);
  ctx.restore();
}
function cineFX(e) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 这里是设备像素坐标（变换被重置成单位阵）：要按画布的像素尺寸铺满，用 W/H（CSS 像素）只盖住左上角 1/DPR²
  ctx.fillStyle = '#050510'; ctx.globalAlpha = 0.25 * e; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.restore();
  const bh = H * 0.09 * e;   // 电影黑边
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
}
function drawBackdrop(sc) {
  if (SETTINGS.blur) {
    const k = 1 / 3, o = offCanvas('bg', cv.width * k, cv.height * k);
    if (o.x) {
      o.x.setTransform(o.c.width / W, 0, 0, o.c.height / H, 0, 0);
      withCtx(o.x, () => drawBackground(sc));
      // 放大这一下本来就够糊了（1/3 分辨率），用默认的双线性就好：'medium' 要重采样，实测贵一倍多
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
      ctx.drawImage(o.c, 0, 0, cv.width, cv.height); ctx.restore();
      return;
    }
  }
  drawBackground(sc);
}
function render() {
  if (M.mode === 'demo') return renderMenu();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sc = worldScale();
  drawBackdrop(sc);
  const sk = shake * SETTINGS.shake;
  const sx = rand(-sk, sk) + shakeDirX * SETTINGS.shake, sy = rand(-sk, sk) + shakeDirY * SETTINGS.shake;
  ctx.save();
  ctx.translate(W / 2 + sx, groundY() + sy); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  drawGround();
  if (SCN) drawWeather(SCN, sc); else drawPetals();
  drawFireflies(false);
  if (FOREST.on) drawForest();
  if (WORLD.on) drawWorld();
  ctx.restore();
  if (SCN) {   // 地面映出场景的颜色
    const gy = groundY(), gg = ctx.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, `rgba(${SCN.mist},${SCN.legend ? 0.16 : 0.08})`); gg.addColorStop(1, `rgba(${SCN.mist},0)`);
    ctx.fillStyle = gg; ctx.fillRect(0, gy, W, H - gy);
  }
  if (dimA > 0.01) { ctx.fillStyle = `rgba(3,3,10,${0.55 * dimA})`; ctx.fillRect(0, 0, W, H); }
  const pf = paperFX();
  if (pf) drawXuanzhi(pf.a);
  ctx.save();
  ctx.translate(W / 2 + sx, groundY() + sy); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  const order = isMulti()
    ? allFighters().slice().sort((a, b) => ((a.state === 'attack' || a.state === 'special') ? 1 : 0) - ((b.state === 'attack' || b.state === 'special') ? 1 : 0))
    : ((A.state === 'attack' || A.state === 'special') ? [B, A] : [A, B]);
  drawDecoys();
  drawClones();
  drawCujuField();
  drawProjs();
  if (WORLD.on && !M.worldKey) drawWorldGhosts();   // 关键战是各打各的一场：不画大地图上的同道
  drawIdentityGround(order);
  for (const f of order) {
    if (pf && pf.a > 0.3 && foesOf(pf.f).includes(f)) {   // 对手被朱砂染红
      const keep = f.look;
      f.look = { ...keep, body: '#c8321e', shade: '#7a1a12', outline: '#ff8a70', outlineA: 1, scarf: '#ff4a32', blade: '#ffd0c4' };
      drawFighter(f); f.look = keep;
      if (!pf.f.hitDone) drawFu(f.x, f.y - 150 + Math.sin(clock * 6) * 4, pf.a, pf.f.spN || 0);
    } else drawFighter(f);
  }
  drawCujuBall();
  drawParticles();
  drawComboTotals();
  drawIdentityTags(order);
  if ((M.mode === 'train' || (M.mode === 'replay' && REPLAY.on && M.phase !== 'end')) && debugHitbox) drawHitboxOverlay(order);
  ctx.restore();
  if (SETTINGS.bloom > 0 && !(pf && pf.a > 0.3)) drawBloom(sc, sx, sy);   // 宣纸上不要月亮和萤火的光晕
  if (FOREST.on) {
    const px = W / 2 + (A.x - cam.x) * sc, py = groundY() + (A.y - 60) * sc;
    const dk = ctx.createRadialGradient(px, py, 60 * sc, px, py, 520 * sc);
    dk.addColorStop(0, 'rgba(2,2,10,0)'); dk.addColorStop(1, 'rgba(2,2,10,0.62)');
    ctx.fillStyle = dk; ctx.fillRect(0, 0, W, H);
  }
  if (superFreeze > 0 && superOwner && superOwner.ch.ult === 'timestop' && superOwner.state === 'special') {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgb(128,128,128)'; ctx.globalAlpha = 0.85; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#6f8fd6'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  drawShanshui();
  const ce = cineEnv();
  if (ce > 0.01) cineFX(ce);
  { const T = superOwner && superFreeze > 0 && sceneOf(superOwner.skinKey);
    if (T && T.legend) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.1, W / 2, H / 2, Math.max(W, H) * 0.7); g.addColorStop(0, `rgba(${T.orbC},0)`); g.addColorStop(1, `rgba(${T.orbC},0.28)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } }
  // 暗角
  drawVignette(ce);
  if (flashA > 0.01) { ctx.fillStyle = `rgba(${flashRGB},${flashA * 0.5})`; ctx.fillRect(0, 0, W, H); }
  drawIdentityEdges(order, sx, sy);
  drawHUD();
  if (WORLD.on) drawWorldHUD();
  drawAnnounce();
  drawCredit();
  drawStats();
}

