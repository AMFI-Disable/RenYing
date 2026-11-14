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
// 磁极记号：一个圆圈，里面是 + 或 −，正极红、负极蓝。big 是按 Q 时身上那个大圈（粗一点、带光）
function drawMagSym(x, y, r, pol, a, big) {
  const rgb = magRGB(pol), w = big ? Math.max(4, r * 0.11) : Math.max(1.6, r * 0.22);
  ctx.save(); ctx.globalAlpha = a; ctx.lineCap = 'round';
  if (big) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = `rgb(${rgb})`; ctx.shadowBlur = 18; }
  else { ctx.fillStyle = 'rgba(10,10,18,0.7)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = `rgb(${rgb})`; ctx.lineWidth = w;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  const l = r * 0.55;
  ctx.beginPath(); ctx.moveTo(x - l, y); ctx.lineTo(x + l, y);
  if (pol > 0) { ctx.moveTo(x, y - l); ctx.lineTo(x, y + l); }
  ctx.stroke(); ctx.restore();
}
// 磁仙大招的磁石板：负极在地上、正极在天上，板面朝着对方
function drawMagPlate(x, y, pol) {
  const rgb = magRGB(pol), w = 170, h = 28;
  ctx.save();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, pol > 0 ? '#ff8a7a' : '#8ab8ff'); g.addColorStop(1, pol > 0 ? '#9a2a22' : '#22468a');
  ctx.fillStyle = g; ctx.strokeStyle = 'rgba(10,10,18,0.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill(); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = `rgb(${rgb})`; ctx.shadowBlur = 16;
  ctx.strokeStyle = `rgba(${rgb},0.7)`; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8);
  ctx.restore();
  for (const dx of [-50, 0, 50]) drawMagSym(x + dx, y, 9, pol, 1);
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
  const gy = gndY(f), hgt = clamp((gy - f.y) / 300, 0, 1);   // 站在平台上影子落在台面
  ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - hgt * 0.6)})`;
  ctx.beginPath(); ctx.ellipse(f.x, gy + 2, 34 * (1 - hgt * 0.4), 6, 0, 0, Math.PI * 2); ctx.fill();
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
  const sq = f.squashT > 0 ? clamp(f.squashT / 0.25, 0, 1) : 0;   // 被磁仙大招夹扁：先扁着，最后 0.25 秒弹回来
  const big = f.size !== 1 || sq > 0;
  if (big) { ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.size * (1 + 0.4 * sq), f.size * (1 - 0.62 * sq)); ctx.translate(-f.x, -f.y); }
  const gt = tierRank(L) >= 3 ? L.fx : null;   // 赤霄、绝世：残影在两种主题色之间流转（正常叠加：用“变亮”叠几层就糊成一团白）
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
  // 凌雀雀芒印记：身周环绕粉紫悬丝印记（最多 5 枚印记环绕）
  if ((f.needleMark || 0) > 0 && f.hp > 0) {
    const isPlayerLQ = A && A.ch && A.ch.id === 'lingque';
    const rReady = isPlayerLQ && (A.skill2CD || 0) <= 0;
    const markCount = Math.min(5, Math.max(1, Math.round(f.needleMark)));
    ctx.save();
    if (rReady) {
      // R 可重置就绪特效：醒目的粉紫双环气旋 + 顶部雀芒菱印
      const pulse = 0.7 + 0.3 * Math.sin(clock * 12);
      ctx.strokeStyle = `rgba(255,140,230,${pulse})`; ctx.lineWidth = 2.4;
      ctx.shadowColor = '#ff8ce6'; ctx.shadowBlur = 12;
      const a0 = clock * 6;
      for (let k = 0; k < markCount; k++) {
        const ang = a0 + k * (Math.PI * 2 / markCount);
        const px = f.x + Math.cos(ang) * 32, py = f.y - 52 + Math.sin(ang) * 22;
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 3.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 52, 34, 24, 0, 0, Math.PI * 2); ctx.stroke();
      // 头顶雀芒击破标志 (Diamond Crest with pips)
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
      for (let p = 0; p < markCount; p++) {
        const pipX = f.x + (p - (markCount - 1) / 2) * 7;
        ctx.fillStyle = '#ff8ce6';
        ctx.beginPath(); ctx.arc(pipX, topY + 22, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.strokeStyle = `rgba(235,110,210,${0.5 + 0.4 * Math.sin(clock * 10)})`; ctx.lineWidth = 1.8;
      const a0 = clock * 5;
      for (let k = 0; k < markCount; k++) {
        const ang = a0 + k * (Math.PI * 2 / markCount);
        const px = f.x + Math.cos(ang) * 26, py = f.y - 50 + Math.sin(ang) * 18;
        ctx.fillStyle = '#ffe8fa'; ctx.beginPath(); ctx.arc(px, py, 3.0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 50, 28, 20, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  // 磁仙：头顶小极性记号；按 Q 换极性时身上亮一个大圈 ⊕ / ⊖；大招时天上、地上两块磁石
  if (f.ch && f.ch.passive === 'magnet' && f.hp > 0 && f.pol) {
    drawMagSym(sk.head[0], sk.head[1] - 30, 9, f.pol, 0.92);
    if (f.polT > 0) {
      const k = clamp(f.polT / 0.6, 0, 1), r = 62 + (1 - k) * 22;
      drawMagSym(f.x, f.y - 62, r, f.pol, Math.min(1, k * 1.6), true);
    }
  }
  if (f.sw) { drawMagPlate(f.sw.x, -6, -1); drawMagPlate(f.sw.x, f.sw.top, 1); }
  // 千机：若傀丸在场且千机受击硬直（可释放 R 穿丝急袭解控），头顶提示「金丝护主」
  if (f.ch && f.ch.id === 'qianji' && f.hp > 0 && (f.state === 'hitstun' || f.state === 'launched') && f.skill2CD <= 0 && projs.some(p => p.kind === 'ironball' && p.owner === f.idx && !p.dead)) {
    ctx.save();
    ctx.font = `bold 12px ${TITLE_FONT}`; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdf7a'; ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 6;
    ctx.fillText('⚡ 穿丝急袭 (R) 可解控', f.x, f.y - 120 + Math.sin(clock * 10) * 3);
    ctx.restore();
  }
  // 被连击且可以挣脱时，头顶提示
  if ((f.state === 'launched' || f.state === 'knockdown' || (f.state === 'hitstun' && f.comboHits >= 2)) && f.hp > 0 && f.breakCD <= 0 && M.phase === 'fight' && M.mode !== 'demo'
      && !(f.ctrl instanceof AICtrl) && !f.dummy && f.ctrl !== NET.remote) {
    ctx.save(); ctx.font = `22px ${TITLE_FONT}`; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.45 * Math.sin(clock * 14)})`;
    ctx.fillText('腾空闪', sk.head[0], sk.head[1] - 28); ctx.restore();
  }
}
