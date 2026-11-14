// ---------- 开局 ----------
// pvp：同一台电脑两个人（1P 键盘鼠标、2P 方向键 + K）；four：2v2 四人踢球；isWatch：两个电脑踢给你看
function startCuju(p1, p2, lv, opts = {}) {
  initAudio();
  paused = false;
  const four = !!opts.four || (Array.isArray(p1) && Array.isArray(p2));
  const pvp = !!opts.pvp, watch = !!opts.isWatch && !pvp;
  M.mode = 'cuju';
  M.level = lv || pickLevel || 'normal';
  M.round = 1; M.wins = [0, 0]; M.carry = null; M.stage = null; M.duo = null; M.map = null; M.quick = false;
  M.watchAi = watch; M.cujuPvp = pvp; M.cujuFour = four;
  M.cujuTarget = [3, 5, 7].includes(Number(opts.target)) ? Number(opts.target) : cujuPickTarget;
  M.cujuChaos = opts.chaos !== undefined ? !!opts.chaos : cujuChaosOpt;
  M.teamMutator = 'normal';
  M.cuju = null;
  if (four) {
    const t0 = Array.isArray(p1) ? p1 : [p1, (p1 + 1) % CHARS.length];
    const t1 = Array.isArray(p2) ? p2 : [p2, (p2 + 1) % CHARS.length];
    setChars(t0[0], t1[0], t0[1], t1[1]);
    A.ctrl = watch ? new CujuAICtrl(M.level === 'easy' ? 'normal' : M.level) : human[0];
    C.ctrl = new CujuAICtrl(M.level === 'easy' ? 'normal' : M.level);
    B.ctrl = pvp ? human[1] : new CujuAICtrl(M.level);
    D.ctrl = new CujuAICtrl(M.level);
    A.meter = B.meter = C.meter = D.meter = 0;
  } else {
    setChars(p1, p2);
    A.ctrl = watch ? new CujuAICtrl(M.level === 'easy' ? 'normal' : M.level) : human[0];
    B.ctrl = pvp ? human[1] : new CujuAICtrl(M.level);
    A.meter = B.meter = 0;
  }
  human[0].clear(); human[1].clear();
  showScreen(null);
  REC.on = false;
  startRound();
  say(four ? '2v2 墨球蹴鞠' : '墨球蹴鞠', 1.4, 'big', `先进${cujuTarget()}球获胜`);
}
let cujuPickTarget = CUJU.target;
let cujuChaosOpt = false;
const cujuTargetSeg = document.getElementById('cujuTargetSeg');
if (cujuTargetSeg) {
  cujuTargetSeg.addEventListener('click', e => {
    const b = e.target.closest('button[data-target]');
    if (!b) return;
    cujuPickTarget = Number(b.dataset.target) || 3;
    cujuTargetSeg.querySelectorAll('button[data-target]').forEach(btn => btn.classList.toggle('sel', Number(btn.dataset.target) === cujuPickTarget));
  });
}
const cujuChaosChk = document.getElementById('cujuChaosChk');
if (cujuChaosChk) cujuChaosChk.addEventListener('change', () => { cujuChaosOpt = !!cujuChaosChk.checked; });
const cujuOptsNow = (extra = {}) => ({ level: pickLevel, target: cujuPickTarget, chaos: cujuChaosOpt, ...extra });
const cujuStartBtn = document.getElementById('cujuStartBtn');
if (cujuStartBtn) cujuStartBtn.addEventListener('click', () => bpStart('cuju', cujuOptsNow()));
const cuju2v2Btn = document.getElementById('cuju2v2Btn');
if (cuju2v2Btn) cuju2v2Btn.addEventListener('click', () => bpStart('cuju2v2', cujuOptsNow({ four: true })));
const cujuPvpBtn = document.getElementById('cujuPvpBtn');
if (cujuPvpBtn) cujuPvpBtn.addEventListener('click', () => bpStart('cuju', cujuOptsNow({ pvp: true })));
const cujuWatchBtn = document.getElementById('cujuWatchBtn');
if (cujuWatchBtn) cujuWatchBtn.addEventListener('click', () => bpStart('cuju', cujuOptsNow({ level: pickLevel || 'god', isWatch: true })));

// ---------- 画面 ----------
// 球门：画在侠客后面（drawProjs 那一层）；墨球画在侠客前面
function drawCujuField() {
  if (!cujuOn() || !M.cuju) return;
  const GD = CUJU.GD, GH = CUJU.GH;
  ctx.save();
  // 中线和中圈
  ctx.strokeStyle = 'rgba(239,232,216,0.16)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(STAGE_W / 2, 0); ctx.lineTo(STAGE_W / 2, -14); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(STAGE_W / 2, 0, 150, 14, 0, 0, Math.PI * 2); ctx.stroke();
  for (const side of [0, 1]) {
    const x0 = side === 0 ? WALL : STAGE_W - WALL - GD, x1 = x0 + GD, post = side === 0 ? x1 : x0, back = side === 0 ? x0 : x1;
    const rgb = side === 0 ? '143,240,255' : '255,138,112';
    const ripple = (M.cuju.netRipple && M.cuju.netRipple[side]) || 0;
    const flash = M.cuju.pause > 0 && M.cuju.lastGoal === 1 - side ? 0.25 + 0.2 * Math.sin(clock * 18) : 0;
    ctx.fillStyle = `rgba(${rgb},${0.07 + flash})`; ctx.fillRect(x0, -GH, GD, GH);
    // 网：细墨线织成的格子，进球时网面震荡波纹
    ctx.strokeStyle = `rgba(239,232,216,${0.22 + ripple * 0.3})`; ctx.lineWidth = 1 + ripple * 0.8;
    ctx.beginPath();
    for (let yy = -GH + 26; yy < 0; yy += 26) {
      const wave = ripple ? Math.sin(clock * 28 + yy * 0.08) * 10 * ripple : 0;
      ctx.moveTo(x0, yy); ctx.lineTo(x1, yy + wave);
    }
    for (let xx = x0 + 24; xx < x1; xx += 24) {
      const wave = ripple ? Math.cos(clock * 24 + xx * 0.08) * 8 * ripple : 0;
      ctx.moveTo(xx + wave, -GH); ctx.lineTo(xx, 0);
    }
    ctx.stroke();
    // 门柱和横梁：朱漆木杆
    ctx.fillStyle = '#3a1712'; ctx.fillRect(post - 6, -GH - CUJU.BAR, 12, GH + CUJU.BAR);
    ctx.fillStyle = '#b8321e'; ctx.fillRect(post - 4, -GH - CUJU.BAR + 2, 8, GH + CUJU.BAR - 2);
    ctx.fillStyle = '#3a1712'; ctx.fillRect(Math.min(back, post), -GH - CUJU.BAR, GD, CUJU.BAR);
    ctx.fillStyle = '#b8321e'; ctx.fillRect(Math.min(back, post), -GH - CUJU.BAR + 3, GD, CUJU.BAR - 6);
    ctx.fillStyle = `rgba(${rgb},0.9)`; ctx.fillRect(post - 5, -GH - CUJU.BAR - 30, 10, 30);   // 门柱顶上的小旗
    ctx.beginPath(); ctx.moveTo(post, -GH - CUJU.BAR - 30); ctx.lineTo(post + (side === 0 ? 34 : -34), -GH - CUJU.BAR - 21); ctx.lineTo(post, -GH - CUJU.BAR - 12); ctx.closePath(); ctx.fill();
    // 门线
    ctx.strokeStyle = `rgba(${rgb},0.55)`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(post, 2); ctx.lineTo(post, -2); ctx.moveTo(x0, 1); ctx.lineTo(x1, 1); ctx.stroke();
  }
  ctx.restore();
}
function drawCujuBall() {
  if (!cujuOn() || !M.cuju || !M.cuju.ball) return;
  const b = M.cuju.ball, R = cujuBallR();
  ctx.save();
  // 地上的影子：越高越淡越小
  const hk = clamp(1 - (-b.y - R) / 600, 0.25, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * hk})`;
  ctx.beginPath(); ctx.ellipse(b.x, 2, R * 1.1 * hk + 4, 6 * hk + 1, 0, 0, Math.PI * 2); ctx.fill();
  for (const t of CUJU_TRAIL) {
    const a = clamp(t.life / t.max, 0, 1);
    ctx.fillStyle = t.iced ? `rgba(140,220,255,${0.35 * a})` : `rgba(18,18,24,${0.3 * a})`;
    ctx.beginPath(); ctx.arc(t.x, t.y, R * (0.5 + 0.5 * a), 0, Math.PI * 2); ctx.fill();
  }
  // 墨球：深墨色的圆，一道金边（冰球青边、火球赤边），几笔旋转的墨纹
  const g = ctx.createRadialGradient(b.x - R * 0.35, b.y - R * 0.4, 2, b.x, b.y, R);
  g.addColorStop(0, b.iced > 0 ? '#7ad7f0' : '#5a5560'); g.addColorStop(0.55, '#1b1a22'); g.addColorStop(1, '#07070b');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = b.iced > 0 ? 'rgba(140,230,255,0.9)' : (M.cuju.chaos === 'fire' ? 'rgba(255,120,80,0.9)' : 'rgba(233,196,106,0.85)');
  ctx.lineWidth = 2; ctx.stroke();
  ctx.translate(b.x, b.y); ctx.rotate(b.spin);
  ctx.strokeStyle = 'rgba(239,232,216,0.55)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.rotate(Math.PI * 2 / 3);
    ctx.beginPath(); ctx.arc(R * 0.32, 0, R * 0.5, -1.1, 1.1); ctx.stroke();
  }
  ctx.restore();
}
// 比分：画在血条的位置（墨球蹴鞠不显示血条）
function drawCujuScore(cx, top, bh, gap) {
  const cj = M.cuju; if (!cj) return;
  const target = cujuTarget();
  ctx.save();
  ctx.textBaseline = 'middle';
  for (const side of [0, 1]) {
    const rgb = side === 0 ? '143,240,255' : '255,138,112', out = side === 0 ? -1 : 1;
    // 大字比分紧挨着中间的计时，往外是 target 个进球墨点
    ctx.font = `700 ${Math.round(bh * 2.4)}px ${BODY_FONT}`;
    ctx.textAlign = side === 0 ? 'right' : 'left';
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
    const nx = cx + out * (gap + 4);
    ctx.fillText(String(cj.score[side]), nx, top + bh / 2 + 2);
    ctx.shadowBlur = 0;
    const r = Math.max(6, bh * 0.56), start = gap + 4 + bh * 1.8 + 14;
    for (let k = 0; k < target; k++) {
      const px = cx + out * (start + r + k * (r * 2 + 8)), py = top + bh / 2;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = k < cj.score[side] ? `rgb(${rgb})` : 'rgba(0,0,0,0.45)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(${rgb},0.8)`; ctx.stroke();
    }
  }
  if (cj.golden) {
    ctx.font = `${Math.max(12, Math.round(bh * 0.9))}px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#e9c46a';
    ctx.fillText(cvT('金球决胜'), cx, top + bh * 2.2);
  } else if (cj.chaos) {
    const cDef = CUJU_CHAOS_LIST.find(x => x.id === cj.chaos);
    if (cDef) {
      ctx.font = `${Math.max(11, Math.round(bh * 0.78))}px ${BODY_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(233,196,106,0.9)';
      ctx.fillText(cvT(`异象 · ${cDef.name}`), cx, top + bh * 2.2);
    }
  }
  // 墨球飞出画面顶上：顶上标一个小三角
  const b = cj.ball;
  if (b) {
    const sc = worldScale(), sy = groundY() + b.y * sc;
    if (sy < 0) {
      const sx = clamp(W / 2 + (b.x - cam.x) * sc, 20, W - 20);
      ctx.fillStyle = 'rgba(233,196,106,0.9)';
      ctx.beginPath(); ctx.moveTo(sx, top + bh * 3.4); ctx.lineTo(sx - 9, top + bh * 3.4 + 14); ctx.lineTo(sx + 9, top + bh * 3.4 + 14); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}
