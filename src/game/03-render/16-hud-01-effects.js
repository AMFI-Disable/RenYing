// ======================= 绘制：界面 =======================
// 本文件：画对局界面和整帧画面的合成。
//   1. 木人桩数据卡、按键提示、醉翁 / 墨羽 / 玉箫等侠客的专属资源条
//   2. HUD：2v2、同袍肉鸽、普通对局（drawHUD）、统计、结算字幕、播报
//   3. 离屏画布（offCanvas）、大招电影镜头（cine*）、萤火虫
//   4. 发光（drawBloom：四分之一尺寸画好再一次合成）、暗角（drawVignette：烤成贴图）、背景虚化
//   5. render：一帧的总入口，按顺序画背景 → 场地 → 侠客 → 特效 → 发光 → 界面
// 找 bug 提示：性能问题先看 drawBloom、drawVignette、drawBackdrop——没有 GPU 的机器上整屏合成最贵。
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
    ['对手行为', B && B.ctrl instanceof DummyCtrl ? dummyActName(B.ctrl.cfg) : '站桩', '#e9c46a'],
    ['当前连击', cu.t > 0 ? `${cu.n} 段 · ${Math.round(cu.dmg)} 伤` : '-', cu.t > 0 ? '#ffb088' : '#efe8d8'],
    ['最高连击', `${TRAIN.best} 段 · ${Math.round(TRAIN.bestDmg)} 伤`, '#ffd166'],
    ['累计伤害', `${Math.round(TRAIN.total)}`, '#efe8d8'],
    ['每秒伤害（DPS）', dps.toFixed(1), '#8ff0ff'],
    ['帧优势', TRAIN.advantage == null ? '—' : `${TRAIN.advantage >= 0 ? '+' : ''}${TRAIN.advantage}f`, '#a9efc4']
  ];
  ctx.save(); ctx.font = `${fs}px ${BODY_FONT}`;
  for (const l of lines) { l[0] = cvT(l[0]); l[1] = cvT(l[1]); }
  const hint = cvT(TOUCH ? '点左上角「对手行为」换动作' : `按 ${dummyBarKey()} 换对手行为 | F1 判定框 · Hz 慢放 · 单帧推进`);
  const pw = Math.min(fs * 22, Math.max(fs * 17, ctx.measureText(hint).width, ...lines.map(([k, v]) => ctx.measureText(k).width + ctx.measureText(v).width + fs * 1.5)));   // 英文长：卡片跟着变宽（不超过 fs * 22）
  const cardH = (lines.length + 2) * fs * 1.75 + 16;
  ctx.fillStyle = 'rgba(10,10,24,0.68)'; ctx.fillRect(x - pw - 14, y - 12, pw + 28, cardH);
  ctx.strokeStyle = 'rgba(233,196,106,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(x - pw - 14, y - 12, pw + 28, cardH);
  ctx.font = `600 ${Math.round(fs * 1.05)}px ${TITLE_FONT}`;
  ctx.fillStyle = '#e9c46a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(cvT('试剑数据'), x - pw, y - 4);
  const startY = y + fs * 1.8;
  ctx.font = `${fs}px ${BODY_FONT}`;
  lines.forEach(([k, v, col], i) => {
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(239,232,216,0.65)'; ctx.fillText(k, x - pw, startY + i * fs * 1.75);
    ctx.textAlign = 'right'; ctx.fillStyle = col || '#efe8d8'; ctx.fillText(v, x, startY + i * fs * 1.75);
  });
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(239,232,216,0.45)';
  ctx.fillText(hint, x, startY + lines.length * fs * 1.75);
  ctx.restore();
}
function keyHint(i, k) {
  if (TOUCH) return '';
  const spKey = keyLabel(custom1PKeys.special);
  const skKey = keyLabel(custom1PKeys.skill);
  const en = window.I18N && I18N.getLang() === 'en';
  const p1 = en ? { sp: ` · ${spKey}`, sk: ` ${skKey}`, sk2: ' L+R', esc: ' RMB' } : { sp: ` 按 ${spKey}`, sk: ` ${skKey}`, sk2: ' 左+右', esc: ' 右键' };
  const p2 = { sp: en ? ' · I' : ' 按 I', sk: '', sk2: '', esc: '' };
  if (M.mode === 'pvp') return (i === 0 ? p1 : p2)[k];
  if (M.mode === 'cpu' || M.mode === 'train' || M.mode === 'tag3') return i === 0 ? p1[k] : '';
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
