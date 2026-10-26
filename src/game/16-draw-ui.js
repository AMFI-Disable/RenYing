// ======================= 绘制：界面 =======================
function drawTrainStats(cx, top, bh) {
  if (TUT) return;
  if (FOREST.on) return drawForestHUD();
  const cu = comboUI[0];
  if (cu.t > 0 && cu.n > TRAIN.best) { TRAIN.best = cu.n; }
  if (cu.t > 0 && cu.dmg > TRAIN.bestDmg) TRAIN.bestDmg = cu.dmg;
  while (TRAIN.hits.length && clock - TRAIN.hits[0][0] > 5) TRAIN.hits.shift();
  const dps = TRAIN.hits.reduce((a, h) => a + h[1], 0) / 5;
  const x = W - Math.max(24, W * 0.04), y = top + bh + 80, fs = Math.max(13, Math.round(H * 0.019));
  const lines = [
    ['木人桩', DUMMY_MODES[dummyMode], '#e9c46a'],
    ['当前连击', cu.t > 0 ? `${cu.n} 段 · ${Math.round(cu.dmg)} 伤` : '-', cu.t > 0 ? '#ffb088' : '#efe8d8'],
    ['最高连击', `${TRAIN.best} 段 · ${Math.round(TRAIN.bestDmg)} 伤`, '#ffd166'],
    ['累计伤害', `${Math.round(TRAIN.total)}`, '#efe8d8'],
    ['每秒伤害（DPS）', dps.toFixed(1), '#8ff0ff']
  ];
  ctx.save(); ctx.font = `${fs}px ${BODY_FONT}`;
  const pw = fs * 17;
  const cardH = (lines.length + 2) * fs * 1.75 + 16;
  ctx.fillStyle = 'rgba(10,10,24,0.68)'; ctx.fillRect(x - pw - 14, y - 12, pw + 28, cardH);
  ctx.strokeStyle = 'rgba(233,196,106,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(x - pw - 14, y - 12, pw + 28, cardH);
  ctx.font = `600 ${Math.round(fs * 1.05)}px ${TITLE_FONT}`;
  ctx.fillStyle = '#e9c46a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('试剑数据', x - pw, y - 4);
  const startY = y + fs * 1.8;
  ctx.font = `${fs}px ${BODY_FONT}`;
  lines.forEach(([k, v, col], i) => {
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(239,232,216,0.65)'; ctx.fillText(k, x - pw, startY + i * fs * 1.75);
    ctx.textAlign = 'right'; ctx.fillStyle = col || '#efe8d8'; ctx.fillText(v, x, startY + i * fs * 1.75);
  });
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(239,232,216,0.45)';
  ctx.fillText(TOUCH ? '左上角切换木人' : '按 1-6 切换木人 | F1 判定框透视', x, startY + lines.length * fs * 1.75);
  ctx.restore();
}
function keyHint(i, k) {
  if (TOUCH) return '';
  const spKey = keyLabel(custom1PKeys.special);
  const skKey = keyLabel(custom1PKeys.skill);
  const p1 = { sp: ` 按 ${spKey}`, sk: ` ${skKey}`, sk2: ' 左+右', esc: ' 右键' }, p2 = { sp: ' 按 I', sk: '', sk2: '', esc: '' };
  if (M.mode === 'pvp') return (i === 0 ? p1 : p2)[k];
  if (M.mode === 'cpu' || M.mode === 'train') return i === 0 ? p1[k] : '';
  if (M.mode === 'net') return i === localIdx() ? p1[k] : '';
  return '';
}
// 醉翁亭：by 是亭子落脚的地面高度，front 是前面两根柱子的不透明度（关人时让里面的人看得见）
function drawWengTing(x, by, a, front) {
  ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'round';
  const col = (k, w, al) => { ctx.globalAlpha = a * al; ctx.fillStyle = '#5a1e18'; ctx.fillRect(x + k - w / 2 - 1, by - 172, w + 2, 168); ctx.fillStyle = '#9a3328'; ctx.fillRect(x + k - w / 2, by - 172, w, 168); ctx.fillStyle = 'rgba(255,220,180,0.18)'; ctx.fillRect(x + k - w / 2 + 1, by - 172, 2, 168); };
  ctx.fillStyle = '#2b2a2e'; ctx.fillRect(x - 100, by - 8, 200, 8); ctx.fillStyle = '#4a4850'; ctx.fillRect(x - 100, by - 8, 200, 2);   // 台基
  col(-48, 8, 0.85); col(48, 8, 0.85);                                           // 后柱
  ctx.globalAlpha = a * front * 0.8; ctx.strokeStyle = '#7a2a20'; ctx.lineWidth = 3;   // 栏杆
  for (const y of [by - 26, by - 46]) { ctx.beginPath(); ctx.moveTo(x - 72, y); ctx.lineTo(x + 72, y); ctx.stroke(); }
  for (let k = -60; k <= 60; k += 20) { ctx.beginPath(); ctx.moveTo(x + k, by - 8); ctx.lineTo(x + k, by - 46); ctx.stroke(); }
  col(-74, 11, front); col(74, 11, front);                                       // 前柱
  ctx.globalAlpha = a;
  ctx.fillStyle = '#3a1612'; ctx.fillRect(x - 92, by - 184, 184, 14);           // 横梁
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(x - 92, by - 184, 184, 2.5);
  ctx.fillStyle = '#1e1c22'; ctx.beginPath();                                    // 飞檐屋顶
  ctx.moveTo(x - 128, by - 168); ctx.quadraticCurveTo(x - 100, by - 186, x - 70, by - 192);
  ctx.quadraticCurveTo(x - 30, by - 222, x, by - 248); ctx.quadraticCurveTo(x + 30, by - 222, x + 70, by - 192);
  ctx.quadraticCurveTo(x + 100, by - 186, x + 128, by - 168); ctx.quadraticCurveTo(x + 96, by - 180, x, by - 182); ctx.quadraticCurveTo(x - 96, by - 180, x - 128, by - 168); ctx.fill();
  ctx.strokeStyle = 'rgba(200,190,170,0.35)'; ctx.lineWidth = 1.2;
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * 22, by - 184); ctx.lineTo(x + k * 9, by - 236); ctx.stroke(); }
  ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(x, by - 252, 5, 0, 7); ctx.fill(); ctx.fillRect(x - 1.5, by - 262, 3, 10);   // 宝顶
  ctx.fillStyle = '#1a1210'; ctx.fillRect(x - 30, by - 176, 60, 20); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 30, by - 176, 60, 20);   // 匾额
  ctx.fillStyle = '#e9c46a'; ctx.font = `14px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('醉翁亭', x, by - 165.5);
  ctx.restore();
}
// 醉翁大招：一幅满屏山水从天上压下来（屏幕坐标，纯视觉，按施法者的 f.t 画）
function drawXuanzhi(a) {   // 宣纸：米黄底子，带点纤维和帘纹
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgb(238,229,206)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(170,150,110,0.12)'; ctx.lineWidth = 1;
  for (let x = 12; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(150,130,95,0.16)';
  for (let k = 0; k < 90; k++) {   // 纤维：位置固定，每帧一样
    const x = (k * 397) % W, y = (k * 211) % H, l = 10 + (k % 7) * 4, r = k * 0.7;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(r) * l, y + Math.sin(r) * l * 0.4, x + Math.cos(r + 0.4) * l * 1.6, y + Math.sin(r + 0.4) * l * 0.6); ctx.stroke();
  }
  const g = groundY(); ctx.fillStyle = 'rgba(30,28,30,0.55)'; ctx.fillRect(0, g, W, 3);   // 地面只剩一道墨线
  ctx.restore();
}
function drawFu(x, y, a, n) {   // 对手头顶那张符：黄纸朱砂
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(Math.sin(clock * 3) * 0.06);
  const w = 52, h = 96;
  ctx.fillStyle = '#efd27a'; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = '#b8321e'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
  ctx.fillStyle = '#b8321e'; ctx.font = `bold 34px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('符', 0, -12);
  ctx.font = `bold 18px ${BODY_FONT}`; ctx.fillText('×' + n, 0, 28);
  ctx.restore();
}
// 谁在看这块屏幕：本机玩家的序号；AI 观战、回放、同屏双人、演示都算旁观者（-1）
function viewerIdx() { return (M.watchAi || M.mode === 'demo' || M.mode === 'replay' || (M.mode === 'pvp' && !is2v2()) || (M.mode === 'watch2v2' && M.watchAi)) ? -1 : localIdx(); }
// 山水之间 / 蓬莱境：画卷落下时人人都看得到；落下之后被困的一方整屏被画挡住，醉翁一方和旁观者照常看，只在被困的人身上留一圈雾
function drawShanshui() {
  const f = [A, B].find(x => x && x.state === 'special' && x.sp === 'cast' && x.ch.ult === 'shanshui');   // 起手蓄势那 0.42 秒不画，否则画卷会落两遍
  const vi = viewerIdx(), vf = vi >= 0 ? [A, B][vi] : null;
  for (const x of [A, B]) if (x && x.veilT > 0 && x !== vf && x.hp > 0) drawPenglaiMist(x);
  if (f && f !== vf && vf && vf.hp > 0) {   // 我被开大：画卷落下后不再淡出，慢慢变成不透明
    const t = f.t;
    drawShanshuiScroll(1 - Math.pow(1 - clamp(t / 1.55, 0, 1), 3), 1, clamp((t - 1.1) / 0.45, 0, 1));
  } else if (f) {
    const t = f.t;
    drawShanshuiScroll(1 - Math.pow(1 - clamp(t / 1.55, 0, 1), 3), t > 1.75 ? clamp((1.95 - t) / 0.2, 0, 1) : 1, 0);
  } else if (vf && vf.veilT > 0 && vf.hp > 0) {
    drawShanshuiScroll(1, clamp(vf.veilT / 0.4, 0, 1), 1);
    const fs = Math.round(Math.min(W, H) * 0.03);
    ctx.save(); ctx.globalAlpha = clamp(vf.veilT / 0.4, 0, 1); ctx.fillStyle = 'rgba(40,30,24,0.85)'; ctx.font = `${fs}px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`困于蓬莱境 · ${vf.veilT.toFixed(1)}`, W / 2, H * 0.9); ctx.restore();
  }
}
// 被困的人身上一圈淡淡的画纸雾和倒计时（醉翁一方和旁观者看到的）
function drawPenglaiMist(x) {
  const sc = worldScale(), px = W / 2 + (x.x - cam.x) * sc, py = groundY() + (x.y - 70) * sc, r = 95 * sc, k = clamp(x.veilT / 0.4, 0, 1);
  ctx.save(); ctx.globalAlpha = k;
  const g = ctx.createRadialGradient(px, py, r * 0.2, px, py, r); g.addColorStop(0, 'rgba(236,226,200,0.05)'); g.addColorStop(0.7, 'rgba(236,226,200,0.28)'); g.addColorStop(1, 'rgba(236,226,200,0)');
  ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2);
  const fy = groundY() + 34 * sc, fs = Math.max(12, Math.round(14 * sc));   // 倒计时放在脚下，不和头顶的伤害数字挤在一起
  ctx.strokeStyle = 'rgba(184,57,46,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px - fs * 2.2, fy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * x.veilT / PENGLAI_T); ctx.stroke();
  ctx.fillStyle = 'rgba(250,238,220,0.9)'; ctx.font = `${fs}px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('蓬莱境', px + 6, fy);
  ctx.restore();
}
// 画卷本身：e 落下进度（0 在天上，1 铺满），a 整体透明度，op 底纸不透明度（1 就完全挡住后面的战场）
function drawShanshuiScroll(e, a, op) {
  const top = -H + H * e, bot = top + H;
  ctx.save(); ctx.globalAlpha = a;
  ctx.beginPath(); ctx.rect(0, 0, W, Math.max(0, bot)); ctx.clip();
  if (op > 0) { ctx.fillStyle = `rgba(226,214,186,${op})`; ctx.fillRect(0, top, W, H); }
  const pg = ctx.createLinearGradient(0, top, 0, bot); pg.addColorStop(0, 'rgba(236,226,200,0.82)'); pg.addColorStop(1, 'rgba(220,206,174,0.62)');
  ctx.fillStyle = pg; ctx.fillRect(0, top, W, H);
  // 远山到近山，越近越浓；每层山峰顶上墨重、山脚化进云雾里（水墨的晕染）
  const peak = (u, fr, ph) => { const q = ((u * fr + ph) % 1 + 1) % 1; return Math.pow(1 - Math.abs(q * 2 - 1), 1.7); };
  const layers = [[0.40, 0.16, '70,80,86', 0.30, 2.2, 0.13], [0.52, 0.2, '46,54,60', 0.42, 1.6, 0.61], [0.66, 0.22, '26,30,34', 0.55, 1.25, 0.37], [0.80, 0.16, '12,14,16', 0.62, 0.9, 0.82]];
  layers.forEach(([by, amp, rgb, al, fr, ph], i) => {
    let ymin = bot;
    ctx.beginPath(); ctx.moveTo(0, bot);
    for (let x = 0; x <= W + 8; x += 8) {
      const u = x / W, h = 0.62 * peak(u, fr, ph) + 0.38 * peak(u, fr * 2.3, ph * 1.9) + 0.04 * Math.sin(u * 41 + i * 3);
      const y = top + H * (by - amp * h); ymin = Math.min(ymin, y); ctx.lineTo(x, y);
    }
    ctx.lineTo(W, bot); ctx.closePath();
    const lg = ctx.createLinearGradient(0, ymin, 0, top + H * (by + 0.12));
    lg.addColorStop(0, `rgba(${rgb},${al})`); lg.addColorStop(0.55, `rgba(${rgb},${al * 0.55})`); lg.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = lg; ctx.fill();
  });
  // 一叶小舟、几只飞鸟
  ctx.strokeStyle = 'rgba(20,20,24,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W * 0.3, top + H * 0.78); ctx.quadraticCurveTo(W * 0.32, top + H * 0.795, W * 0.36, top + H * 0.78); ctx.stroke();
  for (let k = 0; k < 4; k++) { const bx = W * (0.55 + k * 0.04), byy = top + H * (0.2 + (k % 2) * 0.03); ctx.beginPath(); ctx.moveTo(bx - 7, byy); ctx.quadraticCurveTo(bx, byy - 5, bx, byy); ctx.quadraticCurveTo(bx, byy - 5, bx + 7, byy); ctx.stroke(); }
  // 题字与印章
  const fs = Math.round(Math.min(W, H) * 0.045);
  ctx.fillStyle = 'rgba(16,14,14,0.88)'; ctx.font = `${fs}px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const col = (str, x) => { for (let k = 0; k < str.length; k++) ctx.fillText(str[k], x, top + H * 0.17 + k * fs * 1.12); };
  col('醉翁之意不在酒', W * 0.88); col('在乎山水之间也', W * 0.88 - fs * 1.4);
  const sw = fs * 1.5; ctx.save(); ctx.translate(W * 0.88 - fs * 0.7, top + H * 0.17 + fs * 8.6); ctx.rotate(-0.05);
  ctx.fillStyle = '#b8392e'; ctx.fillRect(-sw / 2, 0, sw, sw); ctx.strokeStyle = 'rgba(255,240,225,0.7)'; ctx.lineWidth = 1.5; ctx.strokeRect(-sw / 2 + 3, 3, sw - 6, sw - 6);
  ctx.fillStyle = '#fbeee0'; ctx.font = `${Math.round(fs * 0.55)}px ${TITLE_FONT}`; ctx.textBaseline = 'middle'; ctx.fillText('山水', 0, sw / 2); ctx.restore();
  ctx.restore();
  // 卷轴下沿的木轴：压下来的那条边
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = '#3a2416'; ctx.fillRect(-10, bot - 6, W + 20, 16); ctx.fillStyle = '#6a4228'; ctx.fillRect(-10, bot - 6, W + 20, 4);
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(-6, bot - 9, 18, 22); ctx.fillRect(W - 12, bot - 9, 18, 22);
  ctx.restore();
}
// ============ 2v2 天道演武专用 HUD ============
// 四名角色分左右两队两行排布：每行 = 名字 + 血量数值 + 势值，下面依次是血条、架势条、真气条。
// 中线只留给计时器；"👁️ 2v2 天道演武 · 禁选" 挪到屏幕底部，避免与任何顶部信息打架。
function drawHUD2v2() {
  const bh = Math.max(12, H * 0.02);
  const top = Math.max(22, H * 0.04) + (H < 520 ? 8 : 0);
  const cx = W / 2;
  const margin = Math.max(10, Math.round(W * 0.012));
  const gutter = Math.max(84, Math.round(W * 0.1));
  const blk = Math.max(160, Math.floor((W - margin * 2 - gutter) / 2));
  const fsTop = Math.max(13, Math.round(bh * 1.3));
  const fsSub = Math.max(12, Math.round(bh * 0.95));
  const fsNum = Math.max(12, Math.round(bh * 0.82));
  const hpTopH = Math.max(9, Math.round(bh * 0.95));
  const hpSubH = Math.max(8, Math.round(bh * 0.7));
  const gmH = Math.max(4, Math.round(bh * 0.32));
  const txtGap = 8, rowGap = Math.max(7, Math.round(bh * 0.55));
  // 行 1（先锋 A/B）与行 2（次锋 C/D）的纵向节奏
  const r1 = { y: top, fs: fsTop, hpY: top + fsTop + 4, hpH: hpTopH };
  r1.gmY = r1.hpY + r1.hpH + 2;
  const r2 = { y: r1.gmY + gmH + rowGap, fs: fsSub, hpH: hpSubH };
  r2.hpY = r2.y + fsSub + 4; r2.gmY = r2.hpY + r2.hpH + 2;

  // —— 中央计时（正好落在左右两队之间的空档里）
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(bh * 2.3)}px ${BODY_FONT}`;
  ctx.fillStyle = M.timer < 10 ? '#ff8a78' : '#efe8d8';
  if (M.ot) ctx.fillStyle = '#ff6a5a';
  ctx.fillText(Math.ceil(M.timer), cx, top + bh / 2 + 2);
  if (M.ot) { ctx.font = `${Math.max(12, Math.round(bh * 0.8))}px ${TITLE_FONT}`; ctx.fillStyle = '#ff6a5a'; ctx.fillText('加时', cx, top - bh * 0.75); }
  ctx.restore();

  // 通用条：黑底 + 残影 + 填充；rev 表示从右端开始填充（右队）
  const bar = (x, y, w, h, ratio, style, rev, lag) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    if (lag > 0) { ctx.fillStyle = 'rgba(255,240,220,0.7)'; ctx.fillRect(rev ? x + w - w * lag : x, y, w * lag, h); }
    if (ratio > 0) { ctx.fillStyle = style; ctx.fillRect(rev ? x + w - w * ratio : x, y, w * ratio, h); }
  };

  const team = (main, sub, si) => {
    const rev = si === 1;
    const x = rev ? W - margin - blk : margin;
    const edge = rev ? x + blk : x;
    const line = (f, y, fsN) => {
      if (!f) return;
      const dead = f.hp <= 0;
      const maxG = f.maxGuard || 100;
      const curG = Math.round(clamp(f.guard !== undefined ? f.guard : maxG, 0, maxG));
      const gLow = curG < maxG * 0.3;
      const hpTxt = `${Math.max(0, Math.round(f.hp))}/${f.maxHp}`;
      const gTxt = `势 ${curG}`;
      let fTag = '';
      if (f.ctrl === human[0]) fTag = ' [1P]';
      else if (f.ctrl === human[1] && (M.subMode === 'pp_cc' || M.subMode === 'pp_pp')) fTag = ' [2P]';
      else if (f.ctrl === human[2]) fTag = ' [3P]';
      else if (f.ctrl === human[3]) fTag = ' [4P]';
      else if (M.mode === 'net') {
        if (netRoomMode === 'pp_cc') {
          fTag = (f === A || f === C) ? (f.ctrl === human[0] ? ' [我]' : ' [队友]') : ' [电脑]';
        } else if (netRoomMode === 'pp_pp') {
          fTag = (f === A || f === C) ? (NET.role === 'host' ? ' [我方]' : ' [敌方]') : (NET.role === 'client' ? ' [我方]' : ' [敌方]');
        }
      }
      const dispName = f.look.name + fTag;
      ctx.font = `bold ${fsN}px ${TITLE_FONT}`; const nameW = ctx.measureText(dispName).width;
      ctx.font = `${fsNum}px ${BODY_FONT}`; const hpW = ctx.measureText(hpTxt).width, gW = ctx.measureText(gTxt).width;
      const total = nameW + hpW + gW + txtGap * 2;
      const nameFont = `bold ${fsN}px ${TITLE_FONT}`, numFont = `${fsNum}px ${BODY_FONT}`;
      const items = rev
        ? [[gTxt, numFont, gLow ? '#ff7a8a' : 'rgba(233,196,106,0.95)', gW], [hpTxt, numFont, dead ? 'rgba(200,140,140,0.8)' : 'rgba(255,255,255,0.92)', hpW], [dispName, nameFont, dead ? 'rgba(200,120,120,0.65)' : `rgb(${f.look.slash})`, nameW]]
        : [[dispName, nameFont, dead ? 'rgba(200,120,120,0.65)' : `rgb(${f.look.slash})`, nameW], [hpTxt, numFont, dead ? 'rgba(200,140,140,0.8)' : 'rgba(255,255,255,0.92)', hpW], [gTxt, numFont, gLow ? '#ff7a8a' : 'rgba(233,196,106,0.95)', gW]];
      let px = rev ? edge - total : x;
      const yMid = y + Math.max(fsN, fsNum) / 2;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const [str, font, col, w] of items) { ctx.font = font; ctx.fillStyle = col; ctx.fillText(str, px, yMid); px += w + txtGap; }
    };
    const rows = [[main, r1], [sub, r2]];
    for (const [f, R] of rows) {
      if (!f) continue;
      line(f, R.y, R.fs);
      const dead = f.hp <= 0;
      const grad = ctx.createLinearGradient(x, 0, x + blk, 0);
      if (!rev) { grad.addColorStop(0, '#2a8fb0'); grad.addColorStop(1, '#8ff0ff'); }
      else { grad.addColorStop(0, '#ff8a70'); grad.addColorStop(1, '#c42a45'); }
      bar(x, R.hpY, blk, R.hpH, clamp(f.hp / f.maxHp, 0, 1), dead ? 'rgba(120,120,130,0.45)' : grad, rev, clamp(f.lagHp / f.maxHp, 0, 1));
      // 架势（外侧）与真气（内侧）并排在同一条窄带上，不占用额外高度
      const gW2 = Math.round(blk * 0.46), mW2 = Math.round(blk * 0.46);
      const gMax = f.maxGuard || 100, gRatio = clamp(clamp(f.guard !== undefined ? f.guard : gMax, 0, gMax) / gMax, 0, 1);
      let gCol = '#e9c46a';
      if (gRatio < 0.3) gCol = Math.sin(clock * 14) > 0 ? '#ff3b52' : '#ff7a8a';
      else if (gRatio < 0.6) gCol = '#f39c12';
      bar(rev ? x + blk - gW2 : x, R.gmY, gW2, gmH, gRatio, gCol, rev, 0);
      const mRatio = clamp(f.meter / 100, 0, 1), full = f.meter >= 100;
      if (full) { ctx.save(); ctx.shadowColor = `rgba(${f.look.slash},0.9)`; ctx.shadowBlur = 8 + 4 * (0.5 + 0.5 * Math.sin(clock * 14)); }
      bar(rev ? x : x + blk - mW2, R.gmY, mW2, gmH, mRatio, full ? '#ffe9a8' : `rgba(${f.look.slash},0.85)`, !rev, 0);
      if (full) ctx.restore();
    }
  };
  team(A, C, 0);
  team(B, D, 1);

  // —— 底部标签与模式
  ctx.save();
  ctx.font = `bold ${Math.max(12, Math.round(H * 0.018))}px ${TITLE_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#46d3ea';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
  const banTxt = (M.bans && M.bans.length === 2 && CHARS[M.bans[0]] && CHARS[M.bans[1]]) ? ` · 禁选：${CHARS[M.bans[0]].name} / ${CHARS[M.bans[1]].name}` : '';
  let bTitle = `👁️ 2v2 天道演武 (纯观战)${banTxt}`;
  if (!M.watchAi) {
    if (M.subMode === 'pc_cc') bTitle = '⚔️ 2v2 协同实战 (玩家+AI vs 双AI)';
    else if (M.subMode === 'pp_cc') bTitle = '⚔️ 2v2 双人共斗 (双人破阵 vs 双AI)';
    else if (M.subMode === 'pp_pp') bTitle = '⚔️ 2v2 四方争锋 (双人对决)';
    else if (M.mode === 'net' && netRoomMode === 'pp_cc') bTitle = '🌐 2v2 双人联机共斗 (抗击双天道)';
    else if (M.mode === 'net' && netRoomMode === 'pp_pp') bTitle = '🌐 2v2 四人对决 (全员切磋)';
  }
  ctx.fillText(bTitle, cx, H - 10);
  ctx.restore();
}
function drawHUD() {
  if (M.mode === 'demo') return;
  if (is2v2()) { drawHUD2v2(); return; }
  const barW = Math.min(W * 0.36, 520), bh = Math.max(12, H * 0.02), top = Math.max(22, H * 0.04), cx = W / 2, gap = 56;
  [A, B].forEach((f, i) => {
    if (f.hidden) return;
    const dir = i === 0 ? -1 : 1;
    const x0 = i === 0 ? cx - gap - barW : cx + gap;
    const sk = bh * 0.6;
    const para = (x, w, y, h) => {
      ctx.beginPath();
      if (i === 0) { ctx.moveTo(x + sk, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - sk, y + h); ctx.lineTo(x, y + h); }
      else { ctx.moveTo(x, y); ctx.lineTo(x + w - sk, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + sk, y + h); }
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; para(x0 - 3, barW + 6, top - 3, bh + 6);
    const lagW = barW * clamp(f.lagHp / f.maxHp, 0, 1), hpW = barW * clamp(f.hp / f.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(255,240,220,0.85)';
    para(i === 0 ? x0 : x0 + barW - lagW, lagW, top, bh);
    const g = ctx.createLinearGradient(x0, 0, x0 + barW, 0);
    if (i === 0) { g.addColorStop(0, '#2a8fb0'); g.addColorStop(1, '#8ff0ff'); } else { g.addColorStop(0, '#ff8a70'); g.addColorStop(1, '#c42a45'); }
    ctx.fillStyle = f.hp < f.maxHp * 0.25 && Math.sin(clock * 12) > 0 ? '#ffd0c0' : g;
    para(i === 0 ? x0 : x0 + barW - hpW, hpW, top, bh);

    // 顶部血量数值显示（Top Bar exact numeric HP right next to health bar）
    ctx.save();
    ctx.font = `bold ${Math.max(12, Math.round(bh * 0.95))}px ${BODY_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 4;
    const curHpStr = Math.max(0, Math.round(f.hp));
    const hpStr = `${curHpStr} / ${f.maxHp}`;
    if (i === 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = f.hp < f.maxHp * 0.25 ? '#ff7a8a' : 'rgba(255,255,255,0.95)';
      ctx.fillText(hpStr, x0 - 10, top + bh / 2);
    } else {
      ctx.textAlign = 'left';
      ctx.fillStyle = f.hp < f.maxHp * 0.25 ? '#ff7a8a' : 'rgba(255,255,255,0.95)';
      ctx.fillText(hpStr, x0 + barW + 10, top + bh / 2);
    }
    ctx.restore();

    // 格挡架势条（Guard Posture Bar）：紧贴血条下方，显示英雄防御耐力
    const gh = Math.max(4, Math.round(bh * 0.3)), gy = top + bh + 3;
    const maxG = f.maxGuard || 100, curG = clamp(f.guard !== undefined ? f.guard : maxG, 0, maxG);
    const gRatio = curG / maxG;
    const gw = barW * (f.ch.inkShot ? 0.54 : 0.88);
    const gx = i === 0 ? x0 : x0 + barW - gw;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(gx - 1, gy - 1, gw + 2, gh + 2);
    let gCol = '#e9c46a';
    if (gRatio < 0.3) gCol = Math.sin(clock * 14) > 0 ? '#ff3b52' : '#ff7a8a';
    else if (gRatio < 0.6) gCol = '#f39c12';
    ctx.fillStyle = gCol;
    ctx.fillRect(i === 0 ? gx : gx + gw - gw * gRatio, gy, gw * gRatio, gh);
    ctx.font = `${Math.max(12, Math.round(gh * 1.8))}px ${BODY_FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.fillStyle = gRatio < 0.3 ? '#ff7a8a' : 'rgba(239,232,216,0.65)';
    if (gRatio <= 0.02) ctx.fillText('💥 崩防', i === 0 ? gx + gw + 4 : gx - 4, gy + gh / 2);
    else if (gRatio < 0.95 || f.state === 'block' || f.state === 'blockstun') ctx.fillText(`势 ${Math.round(curG)}`, i === 0 ? gx + gw + 4 : gx - 4, gy + gh / 2);

    if (f.ch.inkShot) {   // 墨羽的墨水条：贴在血条下面靠中间的一侧
      const iw = barW * 0.38, ih = Math.max(5, bh * 0.5), iy = top + bh + 3, ix = i === 0 ? x0 + barW - iw : x0;
      const k = clamp(f.ink / INK_MAX, 0, 1), low = f.ink < INK_COST;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ix - 1, iy - 1, iw + 2, ih + 2);
      ctx.fillStyle = low ? `rgba(200,80,70,${0.55 + 0.25 * Math.sin(clock * 8)})` : 'rgba(205,200,225,0.9)';
      ctx.fillRect(i === 0 ? ix + iw - iw * k : ix, iy, iw * k, ih);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let n = 1; n < INK_MAX / INK_COST; n++) ctx.fillRect(ix + iw * n * INK_COST / INK_MAX - 0.5, iy, 1, ih);   // 每一格是一团墨
      ctx.font = `${Math.round(ih * 2.2)}px ${BODY_FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = i === 0 ? 'right' : 'left';
      ctx.fillStyle = 'rgba(239,232,216,0.7)'; ctx.fillText('墨', i === 0 ? ix - 5 : ix + iw + 5, iy + ih / 2);
      // 符条：墨水条下面一排小黄符，和墨水分开算
      const fy = iy + ih * 1.9, fh = Math.max(9, ih * 1.6), gap = 3, fw = (iw - gap * (FU_MAX - 1)) / FU_MAX, fu = f.fu || 0;
      for (let n = 0; n < FU_MAX; n++) {
        const fx = i === 0 ? ix + iw - (n + 1) * (fw + gap) + gap : ix + n * (fw + gap);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(fx - 1, fy - 1, fw + 2, fh + 2);
        ctx.fillStyle = n < fu ? '#efd27a' : 'rgba(239,210,122,0.14)'; ctx.fillRect(fx, fy, fw, fh);
        if (n < fu) { ctx.fillStyle = '#b8321e'; ctx.fillRect(fx + fw / 2 - 1.5, fy + 2, 3, fh - 4); }
      }
      ctx.font = `${Math.round(fh * 1.2)}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.7)'; ctx.fillText('符', i === 0 ? ix - 5 : ix + iw + 5, fy + fh / 2);
    }
    // 名字和回合
    ctx.font = `${Math.round(bh * 2)}px ${TITLE_FONT}`; ctx.textBaseline = 'top';
    ctx.fillStyle = `rgb(${f.look.slash})`;
    ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.fillText(f.look.name, i === 0 ? x0 : x0 + barW, top + bh + 8);
    if ((M.mode === 'net' && NET.names) || (M.mode === 'replay' && REPLAY.names)) {
      const pn = M.mode === 'replay' ? REPLAY.names[i] || '' : NET.names[i === 0 ? 'host' : 'client'] || '游客', cw = ctx.measureText(f.look.name).width;
      ctx.font = `${Math.round(bh * 0.95)}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.6)';
      ctx.fillText(pn, i === 0 ? x0 + cw + 10 : x0 + barW - cw - 10, top + bh + 8 + bh * 0.6);
    }
    if (isDuo()) {   // 各选 2 人：名字旁边两个圆点，首发和接力，被击倒的打叉
      const slotTitles = ['首', '接'], out = Math.min(2, M.wins[1 - i]);
      for (let r = 0; r < 2; r++) {
        const px = i === 0 ? cx - gap - 14 - r * 26 : cx + gap + 14 + r * 26, py = top + bh + 18;
        const isDead = r < out;
        const isActive = r === out;
        ctx.save();
        ctx.translate(px, py);
        if (isActive) {
          ctx.fillStyle = '#e9c46a';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = `bold 12px ${BODY_FONT}`;
          ctx.fillStyle = '#0c0b16';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(slotTitles[r], 0, 1);
        } else if (isDead) {
          ctx.fillStyle = 'rgba(255,80,80,0.35)';
          ctx.strokeStyle = 'rgba(255,80,80,0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = `12px ${BODY_FONT}`;
          ctx.fillStyle = '#ff7a8a';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('✕', 0, 0);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = `12px ${BODY_FONT}`;
          ctx.fillStyle = 'rgba(239,232,216,0.6)';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(slotTitles[r], 0, 0);
        }
        ctx.restore();
      }
    } else {
      for (let r = 0; r < 2; r++) {
        const px = i === 0 ? cx - gap - 12 - r * 20 : cx + gap + 12 + r * 20, py = top + bh + 18;
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = M.wins[i] > r ? '#e9c46a' : 'rgba(255,255,255,0.14)'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      }
    }
    // 气槽
    const mw = barW * 0.55, my = top + bh + 44, mx = i === 0 ? x0 : x0 + barW - mw;
    // 角色资源条（玉箫·音律 / 醉仙·醉意）：紧贴在大招气槽下面
    let resH = 0;
    if (f.ch.passive === 'rhythm' || f.ch.passive === 'drunk') {
      resH = 9;
      const ry0 = my + 8, lab = f.ch.passive === 'rhythm' ? '音律' : '醉意';
      ctx.save();
      ctx.font = Math.round(bh * 0.7) + 'px ' + BODY_FONT; ctx.textBaseline = 'middle';
      const lw = ctx.measureText(lab).width + 6, bw = mw - lw;
      const bx0 = i === 0 ? mx + lw : mx;
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(lab, i === 0 ? mx : mx + mw, ry0 + 1.5);
      if (f.ch.passive === 'rhythm') {
        const n = f.notes || 0, sw = (bw - 8) / 3;
        for (let k = 0; k < 3; k++) {
          const sx = i === 0 ? bx0 + k * (sw + 4) : bx0 + bw - (k + 1) * sw - k * 4;
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(sx - 1, ry0 - 1, sw + 2, 5);
          if (k < n) { ctx.fillStyle = n >= 3 ? 'rgba(150,240,200,' + (0.8 + 0.2 * Math.sin(clock * 9)) + ')' : 'rgb(150,240,200)'; ctx.fillRect(sx, ry0, sw, 3); }
          else if (k === n) { ctx.fillStyle = 'rgba(150,240,200,0.35)'; ctx.fillRect(sx, ry0, sw * clamp((f.noteT || 0) / 2.5, 0, 1), 3); }
        }
      } else {
        const d = clamp((f.drunk || 0) / 100, 0, 1), dw = bw * d;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx0 - 1, ry0 - 1, bw + 2, 5);
        ctx.fillStyle = d >= 0.5 ? 'rgba(255,170,70,' + (0.8 + 0.2 * Math.sin(clock * 7)) + ')' : 'rgb(230,160,90)';
        ctx.fillRect(i === 0 ? bx0 : bx0 + bw - dw, ry0, dw, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx0 + bw * 0.5 - 0.5, ry0 - 1, 1, 5);   // 50 醉意刻度
      }
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mx - 2, my - 2, mw + 4, 9);
    const full = f.meter >= 100;
    const fw = mw * clamp(f.meter / 100, 0, 1);
    if (full) {
      // 沸腾真气火焰光效与高亮脉冲
      const pulse = 0.5 + 0.5 * Math.sin(clock * 14);
      const auraG = ctx.createLinearGradient(mx, 0, mx + mw, 0);
      auraG.addColorStop(0, '#e9c46a');
      auraG.addColorStop(0.5, '#fff');
      auraG.addColorStop(1, '#ff6a5a');
      ctx.save();
      ctx.shadowColor = `rgba(${f.look.slash}, 0.95)`;
      ctx.shadowBlur = 10 + 6 * pulse;
      ctx.fillStyle = auraG;
      ctx.fillRect(i === 0 ? mx : mx + mw - fw, my - 1, fw, 6);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(mx - 3, my - 3, mw + 6, 11);
      ctx.restore();
      ctx.font = `bold ${Math.max(12, Math.round(bh * 0.96))}px ${BODY_FONT}`; ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff'; ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.shadowColor = `rgba(${f.look.slash}, 0.9)`; ctx.shadowBlur = 8;
      const ultNm = skinUltName(f) || ULTS[f.ch.ult].name;
      ctx.fillText(`⚡ ${ultNm} 绝技就绪${keyHint(i, 'sp')}`, i === 0 ? mx : mx + mw, my + 11);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = `rgba(${f.look.slash}, 0.75)`;
      ctx.fillRect(i === 0 ? mx : mx + mw - fw, my, fw, 5);
    }
    // 技能冷却（木人桩不显示）
    if (!f.dummy) {
      ctx.font = `${Math.round(bh * 0.85)}px ${BODY_FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const ry = my + (full ? 9 + bh * 1.3 : 12), fs = bh * 0.85;
      const S = SKILLS[f.ch.skill];
      const S2 = SKILLS[f.ch.skill2];
      const s1Nm = skinSkillName(f, 1) || S.name;
      const s2Nm = skinSkillName(f, 2) || S2.name;
      const items = [[s1Nm + keyHint(i, 'sk'), f.skillCD, S.cd], [s2Nm + keyHint(i, 'sk2'), f.skill2CD, S2.cd], ['腾空闪' + keyHint(i, 'esc'), f.breakCD, f.ch.escCD || BREAK_CD]];
      if (f.ch.fly) items.push(['飞行', f.ch.fly - f.flyT, f.ch.fly]);
      const widths = items.map(it => ctx.measureText(it[0]).width + 8 + 46 + 16);
      const total = widths.reduce((a, b) => a + b, 0);
      let x = i === 0 ? mx : mx + mw - total;
      for (const [k, [name, cd, max]] of items.entries()) {
        const ready = cd <= 0;
        ctx.fillStyle = ready ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)';
        ctx.fillText(name, x, ry);
        const bx = x + ctx.measureText(name).width + 8, by = ry + fs * 0.45;
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, 46, 3);
        ctx.fillStyle = ready ? `rgb(${f.look.slash})` : 'rgba(255,255,255,0.5)';
        ctx.fillRect(bx, by, 46 * (1 - clamp(cd / max, 0, 1)), 3);
        x += widths[k];
      }
    }
    // 连击
    const cu = comboUI[i];
    if (cu.t > 0 && cu.n >= 2) {
      const a = clamp(cu.t / 0.4, 0, 1), pop = 1 + Math.max(0, cu.t - 1.25) * 3;
      const x = i === 0 ? W * 0.06 : W * 0.94, y = H * 0.32;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(pop, pop);
      ctx.textAlign = i === 0 ? 'left' : 'right'; ctx.textBaseline = 'alphabetic';
      ctx.font = `700 ${Math.round(H * 0.058)}px ${BODY_FONT}`; ctx.fillStyle = '#fff';
      ctx.shadowColor = `rgba(${f.look.slash},0.9)`; ctx.shadowBlur = 20;
      ctx.fillText(cu.n, 0, 0); ctx.shadowBlur = 0;
      ctx.font = `${Math.round(H * 0.028)}px ${TITLE_FONT}`; ctx.fillStyle = `rgb(${f.look.slash})`;
      ctx.fillText('连击', 0, H * 0.036);
      ctx.font = `${Math.round(H * 0.02)}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(`${Math.round(cu.dmg)} 伤害`, 0, H * 0.075);
      ctx.restore();
    }
  });
  // 计时
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(bh * 2.3)}px ${BODY_FONT}`;
  ctx.fillStyle = M.timer < 10 ? '#ff8a78' : '#efe8d8';
  if (M.ot && M.mode !== 'train') ctx.fillStyle = '#ff6a5a';
  ctx.fillText(M.mode === 'train' ? '∞' : Math.ceil(M.timer), cx, top + bh / 2 + 2);
  if (M.ot && M.mode !== 'train') { ctx.save(); ctx.font = `${Math.max(12, Math.round(bh * 0.8))}px ${TITLE_FONT}`; ctx.fillStyle = '#ff6a5a'; ctx.fillText('加时', cx, top - bh * 0.75); ctx.restore(); }
  if (M.mode === 'tower') {
    ctx.save();
    ctx.font = `bold ${Math.max(12, Math.round(bh * 0.95))}px ${TITLE_FONT}`;
    ctx.fillStyle = '#e9c46a';
    ctx.fillText(`问剑 · 第 ${M.towerFloor || 1} 层`, cx, top + bh + 18);
    ctx.restore();
  } else if (M.mode === 'chaos') {
    ctx.save();
    ctx.font = `bold ${Math.max(12, Math.round(bh * 0.92))}px ${TITLE_FONT}`;
    ctx.fillStyle = '#e9c46a';
    const remSec = Math.max(0, Math.ceil(CHAOS_INTERVAL - chaosTimer));
    const mutTxt = currentChaosMutation ? (currentChaosMutation.icon + ' ' + currentChaosMutation.name + ' (' + remSec + 's)') : '🎲 乾坤异变';
    ctx.fillText(mutTxt, cx, top + bh + 18);
    if (currentChaosMutation && currentChaosMutation.desc) {
      ctx.font = `${Math.max(12, Math.round(bh * 0.68))}px ${BODY_FONT}`;
      ctx.fillStyle = 'rgba(239,232,216,0.88)';
      ctx.fillText(currentChaosMutation.desc, cx, top + bh + 34);
    }
    if (currentChaosMutation && (!announce || announce.text !== ('天机异变 · ' + currentChaosMutation.name))) {
      const badgeTxt = `${currentChaosMutation.icon} ${currentChaosMutation.name}：${currentChaosMutation.desc}`;
      const bFs = Math.max(12, Math.round(bh * 0.65));
      ctx.font = `${bFs}px ${BODY_FONT}`;
      const tw = ctx.measureText(badgeTxt).width;
      const padX = 14, bw = Math.min(W * 0.92, tw + padX * 2), bhBadge = Math.max(20, Math.round(bh * 1.05));
      const bx = cx - bw / 2, by = Math.max(2, top - bhBadge - 4);
      ctx.fillStyle = 'rgba(6,5,14,0.78)';
      ctx.strokeStyle = 'rgba(233,196,106,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bhBadge, 4);
      else ctx.rect(bx, by, bw, bhBadge);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f4ecd8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeTxt, cx, by + bhBadge / 2);
    }
    ctx.restore();
  } else if (M.mode === 'mayhem') {
    ctx.save();
    ctx.font = `bold ${Math.max(12, Math.round(bh * 0.95))}px ${TITLE_FONT}`;
    ctx.fillStyle = '#ff9f43';
    ctx.fillText('💥 通天神决 · 神魔乱战', cx, top + bh + 18);
    ctx.restore();
  }
  if (M.mode === 'train') drawTrainStats(cx, top, bh);
}
function drawStats() {
  if (M.mode === 'demo') return;
  const fs = Math.max(12, Math.round(H * 0.016)), x = 14, y = H - 12;
  ctx.save(); ctx.font = `${fs}px ${BODY_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(239,232,216,0.55)';
  let t = `帧率 ${FPS}`;
  ctx.fillText(t, x, y);
  if (M.mode === 'net' && NET.rtt) {
    // 分开显示：到对手（整个来回）和到服务器，方便看出慢在哪一段
    const ms = Math.round(NET.rtt), w = ctx.measureText(t + '   ').width;
    ctx.fillStyle = ms < 80 ? '#8fe0a0' : ms < 160 ? '#e9c46a' : '#ff8a78';
    const tx = `延迟 对手 ${ms}ms`;
    ctx.fillText(tx, x + w, y);
    if (NET.srtt) { const sm = Math.round(NET.srtt); ctx.fillStyle = 'rgba(239,232,216,0.55)'; ctx.fillText(`· 服务器 ${sm}ms`, x + w + ctx.measureText(tx + ' ').width, y); }
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
    ctx.fillText('📡 联机回滚遥测 (NET_HUD)', hx + 10, hy + 22);

    ctx.font = `${hudFs}px ${BODY_FONT}`;
    ctx.fillStyle = 'rgba(239,232,216,0.85)';
    const rttVal = (M.mode === 'net' && NET.rtt) ? `${Math.round(NET.rtt)}ms` : '本地';
    const advVal = ROLL.on ? `${ROLL.peerAdv}帧` : '0';
    const fVal = ROLL.on ? `${ROLL.F}/${ROLL.remLast}` : `${clock.toFixed(1)}s`;
    ctx.fillText(`RTT: ${rttVal} | 模式: ${M.mode}`, hx + 10, hy + 44);
    ctx.fillText(`帧进度: ${fVal} | 优势: ${advVal}`, hx + 10, hy + 66);
    ctx.fillText(`回滚: ${ROLL.rollbacks || 0}次 | 顿帧: ${ROLL.stall ? '是' : '否'}`, hx + 10, hy + 88);
    ctx.fillText(`状态: ${ROLL.on ? '回滚中' : '单机'} (按~或F2收起)`, hx + 10, hy + 110);
  }
  ctx.restore();
}
function drawCredit() {
  if (creditT <= 0 || M.mode === 'demo') return;
  const t = CREDIT - creditT, a = Math.min(clamp(t / 0.35, 0, 1), clamp(creditT / 0.45, 0, 1));
  const cx = W / 2, cy = H * 0.28, s1 = Math.round(H * 0.028), s2 = Math.round(H * 0.07);
  ctx.save(); ctx.globalAlpha = a;
  const bw = Math.min(W * 0.86, s2 * 11), bh = s2 * 2.4;
  const g = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  g.addColorStop(0, 'rgba(6,5,14,0)'); g.addColorStop(0.2, 'rgba(6,5,14,0.86)'); g.addColorStop(0.8, 'rgba(6,5,14,0.86)'); g.addColorStop(1, 'rgba(6,5,14,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
  const lw = bw * 0.6 * clamp(t / 0.6, 0, 1);          // 金线从中间展开
  ctx.fillStyle = 'rgba(233,196,106,0.8)';
  ctx.fillRect(cx - lw / 2, cy - bh / 2 + 6, lw, 1.5); ctx.fillRect(cx - lw / 2, cy + bh / 2 - 8, lw, 1.5);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `italic ${s1}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.72)';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(s1 * 0.3)}px`;
  ctx.fillText('Created by', cx, cy - s2 * 0.55);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const lift = (1 - clamp(t / 0.5, 0, 1)) * 12;
  ctx.font = `700 ${s2}px ${BODY_FONT}`;
  ctx.shadowColor = 'rgba(120,230,255,0.45)'; ctx.shadowBlur = 24; ctx.fillStyle = '#f4ecd8';
  ctx.fillText('Even, Luffy, and Opus 5.5', cx, cy + s2 * 0.3 + lift);
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
  const size = H * (a.style === 'ko' ? 0.26 : a.style === 'super' ? 0.12 : 0.13);
  ctx.font = `${Math.round(size)}px ${TITLE_FONT}`;
  const tw = ctx.measureText(a.text).width;
  if (a.style === 'ko') {
    ctx.fillStyle = '#b8392e'; ctx.rotate(-0.04);
    ctx.fillRect(-size * 0.62, -size * 0.62, size * 1.24, size * 1.24);
    ctx.strokeStyle = 'rgba(255,240,225,0.6)'; ctx.lineWidth = 4; ctx.strokeRect(-size * 0.54, -size * 0.54, size * 1.08, size * 1.08);
    ctx.fillStyle = '#fbeee0';
  } else {
    // 墨迹笔刷底
    ctx.fillStyle = 'rgba(6,5,14,0.82)';
    ctx.beginPath();
    const w = Math.max(tw, a.sub ? ctx.measureText(a.sub).width : 0) + size * 1.2;
    const h = a.sub ? size * 1.35 : size * 0.95;
    ctx.moveTo(-w / 2, -h / 2);
    for (let i = 0; i <= 12; i++) ctx.lineTo(-w / 2 + w * i / 12, -h / 2 + (hash(a.seed + i) - 0.5) * size * 0.14);
    for (let i = 12; i >= 0; i--) ctx.lineTo(-w / 2 + w * i / 12 + (i === 12 ? size * 0.25 : 0), h / 2 + (hash(a.seed + i + 30) - 0.5) * size * 0.14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = a.style === 'go' ? '#ff8a78' : a.style === 'super' ? '#fff' : '#efe8d8';
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const textY = a.sub ? -size * 0.14 : size * 0.05;
  ctx.fillText(a.text, 0, textY);
  if (a.sub) {
    ctx.font = `${Math.max(12, Math.round(size * 0.27))}px ${BODY_FONT}`;
    ctx.fillStyle = '#efe8d8';
    ctx.fillText(a.sub, 0, size * 0.24);
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
const CINE_LEN = 1.3;
function cineEnv() { if (cine.t < 0) return 0; return clamp(Math.min(cine.t / 0.15, (CINE_LEN - cine.t) / 0.3), 0, 1); }
function cineSpeed() {
  const t = cine.t;
  if (t < 0) return 1;
  if (t < 0.3) return 0.35;
  if (t < 0.55) return lerp(0.35, 1.6, (t - 0.3) / 0.25);
  if (t < CINE_LEN) return lerp(1.6, 1, (t - 0.55) / (CINE_LEN - 0.55));
  return 1;
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
  const mx = W * 0.68 - (cam.x - STAGE_W / 2) * 0.04 * sc, my = H * 0.26, mr = H * 0.11;
  moonGlow(mx, my, mr);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 90; i += 3) {
    const x = ((hash(i) * W * 1.4 - cam.x * 0.02 * sc) % W + W) % W, y = hash(i + 50) * H * 0.5;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * (1 + hash(i + 9) * 2) + i);
    ctx.fillRect(x - 1.5, y - 1.5, 4, 4);
  }
  ctx.globalAlpha = 1;
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
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.min(1, 0.32 * I); ctx.drawImage(b1.c, 0, 0, cv.width, cv.height);
  ctx.globalAlpha = Math.min(1, 0.42 * I); ctx.drawImage(b2.c, 0, 0, cv.width, cv.height);
  ctx.globalAlpha = Math.min(1, 0.55 * I); ctx.drawImage(b3.c, 0, 0, cv.width, cv.height);
  ctx.restore();
}
function cineFX(e) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#050510'; ctx.globalAlpha = 0.25 * e; ctx.fillRect(0, 0, W, H);
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
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
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
  const order = is2v2()
    ? [A, B, C, D].sort((a, b) => ((a.state === 'attack' || a.state === 'special') ? 1 : 0) - ((b.state === 'attack' || b.state === 'special') ? 1 : 0))
    : ((A.state === 'attack' || A.state === 'special') ? [B, A] : [A, B]);
  drawDecoys();
  drawProjs();
  for (const f of order) {
    if (pf && pf.a > 0.3 && foesOf(pf.f).includes(f)) {   // 对手被朱砂染红
      const keep = f.look;
      f.look = { ...keep, body: '#c8321e', shade: '#7a1a12', outline: '#ff8a70', outlineA: 1, scarf: '#ff4a32', blade: '#ffd0c4' };
      drawFighter(f); f.look = keep;
      if (!pf.f.hitDone) drawFu(f.x, f.y - 150 + Math.sin(clock * 6) * 4, pf.a, pf.f.spN || 0);
    } else drawFighter(f);
  }
  drawParticles();
  drawComboTotals();
  if (debugHitbox) drawHitboxOverlay(order);
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
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.36 - 0.08 * ce), W / 2, H / 2, Math.max(W, H) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.6, `rgba(0,0,0,${0.18 * SETTINGS.vig})`); v.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, (0.66 + 0.2 * ce) * SETTINGS.vig)})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (flashA > 0.01) { ctx.fillStyle = `rgba(${flashRGB},${flashA * 0.5})`; ctx.fillRect(0, 0, W, H); }
  drawHUD();
  drawAnnounce();
  drawCredit();
  drawStats();
}

