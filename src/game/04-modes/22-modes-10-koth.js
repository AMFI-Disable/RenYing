// ======================= 灵坛争锋：占领灵坛 + 断崖击飞 + 无限复活 =======================
// 本文件：灵坛争锋（King of the Hill）规则、灵坛轮转、复活计时、电脑抢坛思路、画面绘制与按钮。
const KOTH = {
  W: 2200,
  cliff: [WALL + 140, 2200 - WALL - 140],
  zoneR: 135,
  rotateEvery: 18,
  target: 100,
  time: 120,
  respawnTime: 2.5,
  plats: [
    { x: 520, y: -155, w: 300 },
    { x: 1100, y: -230, w: 340 },
    { x: 1680, y: -155, w: 300 },
  ],
  zones: [
    { x: 1100, y: 0, label: '中庭灵坛' },
    { x: 520, y: -155, label: '左台灵坛' },
    { x: 1100, y: -230, label: '凌霄高坛' },
    { x: 1680, y: -155, label: '右台灵坛' },
  ],
};
const KOTH_MAP = { id: 'koth', name: '灵坛崖', w: KOTH.W, cliff: KOTH.cliff, plats: KOTH.plats, bg: 'cliff' };
const kothOn = () => M.mode === 'koth' || !!(typeof netRoom === 'function' && netRoom() && netRoom().rule === 'koth');

function kothRoundInit() {
  M.koth = {
    score: [0, 0],
    zoneIdx: 0,
    zoneT: KOTH.rotateEvery,
    respawn: [0, 0, 0, 0],
    contested: false,
    holder: -1,
  };
  M.timer = KOTH.time;
  if (is2v2()) {
    A.x = 560; A.face = 1;
    C.x = 760; C.face = 1;
    B.x = 1440; B.face = -1;
    D.x = 1640; D.face = -1;
  } else {
    A.x = 680; A.face = 1;
    B.x = 1520; B.face = -1;
  }
}

function kothRespawnFighter(f) {
  const side = fighterTeam(f);
  const rx = STAGE_W / 2 + (side === 0 ? -160 : 160);
  f.reset(rx);
  f.y = -280;
  f.vy = 0;
  f.invul = 1.4;
  f.hidden = false;
  if (!RESIM) {
    ring(rx, -280, 90, side === 0 ? '143,240,255' : '255,138,112', 0.4);
    SFX.poof();
  }
}

function kothMatch() {
  const k = M.koth; if (!k) return;
  const fs = allFighters();
  // 无限复活：倒地 / 落崖 / 气血归零后进入 2.5 秒复活倒计时
  for (const f of fs) {
    if (k.respawn[f.idx] > 0) {
      k.respawn[f.idx] = Math.max(0, k.respawn[f.idx] - STEP);
      f.hidden = true;
      f.hp = f.maxHp;
      if (k.respawn[f.idx] <= 0) kothRespawnFighter(f);
      continue;
    }
    if (f.hp <= 0) {
      k.respawn[f.idx] = KOTH.respawnTime;
      f.hidden = true;
      if (!RESIM) {
        addP({ type: 'text', text: '阵亡 · 待复活', x: clamp(f.x, WALL + 80, STAGE_W - WALL - 80), y: Math.min(-60, f.y - 60), life: 0.9, max: 0.9, rgb: '233,196,106' });
      }
    }
  }
  // 灵坛轮转
  k.zoneT -= STEP;
  if (k.zoneT <= 0) {
    k.zoneT = KOTH.rotateEvery;
    k.zoneIdx = (k.zoneIdx + 1) % KOTH.zones.length;
    if (!RESIM) {
      const z = KOTH.zones[k.zoneIdx];
      say(`灵坛转移 · ${z.label}`, 1.3, 'big');
      ring(z.x, z.y, 140, '233,196,106', 0.5);
      SFX.gong();
    }
  }
  // 占领判定
  const z = KOTH.zones[k.zoneIdx];
  const inZone = [0, 0];
  for (const f of fs) {
    if (f.hidden || f.hp <= 0) continue;
    const dx = Math.abs(f.x - z.x), dy = Math.abs(f.y - z.y);
    if (dx <= KOTH.zoneR && dy <= 95) inZone[fighterTeam(f)]++;
  }
  k.contested = inZone[0] > 0 && inZone[1] > 0;
  k.holder = inZone[0] > 0 && inZone[1] === 0 ? 0 : (inZone[1] > 0 && inZone[0] === 0 ? 1 : -1);
  if (k.holder >= 0) {
    const rate = inZone[k.holder] >= 2 ? 12.5 : 9.0;
    k.score[k.holder] = Math.min(KOTH.target, k.score[k.holder] + rate * STEP);
    if (k.score[k.holder] >= KOTH.target) {
      M.koWinner = k.holder;
      M.phase = 'ko';
      M.t = 0;
      say('灵坛已定', 1.4, 'big');
      return;
    }
  }
  M.timer = Math.max(0, M.timer - STEP);
  if (M.timer <= 0) {
    const w = k.score[0] > k.score[1] ? 0 : (k.score[1] > k.score[0] ? 1 : -1);
    M.koWinner = w;
    M.phase = 'ko';
    M.t = 0;
    say('时间到', 1.2);
  }
}

function drawKothField() {
  if (!kothOn() || !M.koth) return;
  const k = M.koth, z = KOTH.zones[k.zoneIdx], R = KOTH.zoneR;
  const rgb = k.contested ? '233,196,106' : k.holder === 0 ? '143,240,255' : k.holder === 1 ? '255,138,112' : '220,215,200';
  ctx.save();
  const pulse = 0.75 + 0.25 * Math.sin(clock * 6);
  const grad = ctx.createLinearGradient(z.x, z.y - 180, z.x, z.y);
  grad.addColorStop(0, `rgba(${rgb},0)`);
  grad.addColorStop(1, `rgba(${rgb},${0.26 * pulse})`);
  ctx.fillStyle = grad;
  ctx.fillRect(z.x - R, z.y - 180, R * 2, 180);
  ctx.strokeStyle = `rgba(${rgb},${0.85 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(z.x - R, z.y - 2);
  ctx.lineTo(z.x + R, z.y - 2);
  ctx.stroke();
  ctx.font = `700 13px ${BODY_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.fillText(cvT(k.contested ? '争夺中' : z.label), z.x, z.y - 190);
  ctx.restore();
}

function drawKothScore(cx, top, bh, gap) {
  const k = M.koth; if (!k) return;
  ctx.save();
  ctx.textBaseline = 'middle';
  for (const side of [0, 1]) {
    const rgb = side === 0 ? '143,240,255' : '255,138,112', out = side === 0 ? -1 : 1;
    const pct = Math.floor(k.score[side]);
    ctx.font = `700 ${Math.round(bh * 1.9)}px ${BODY_FONT}`;
    ctx.textAlign = side === 0 ? 'right' : 'left';
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.fillText(`${pct}%`, cx + out * (gap + 8), top + bh / 2 + 2);
  }
  ctx.font = `600 ${Math.max(11, Math.round(bh * 0.78))}px ${BODY_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e9c46a';
  const nextS = Math.ceil(k.zoneT);
  ctx.fillText(`${cvT(k.contested ? '争夺中' : '灵坛争锋')} · ${nextS}s`, cx, top + bh * 2.1);
  ctx.restore();
}

function startKoth(p1, p2, lv, opts = {}) {
  initAudio();
  paused = false;
  const four = !!opts.four || (Array.isArray(p1) && Array.isArray(p2));
  const pvp = !!opts.pvp, watch = !!opts.isWatch && !pvp;
  M.mode = 'koth';
  M.level = lv || pickLevel || 'normal';
  M.round = 1; M.wins = [0, 0]; M.carry = null; M.stage = null; M.duo = null; M.map = null; M.quick = false;
  M.watchAi = watch; M.kothPvp = pvp; M.kothFour = four;
  M.teamMutator = 'normal';
  if (four) {
    const t0 = Array.isArray(p1) ? p1 : [p1, (p1 + 1) % CHARS.length];
    const t1 = Array.isArray(p2) ? p2 : [p2, (p2 + 1) % CHARS.length];
    setChars(t0[0], t1[0], t0[1], t1[1]);
    A.ctrl = watch ? new AICtrl(M.level) : human[0];
    C.ctrl = new AICtrl(M.level);
    B.ctrl = pvp ? human[1] : new AICtrl(M.level);
    D.ctrl = new AICtrl(M.level);
  } else {
    setChars(p1, p2);
    A.ctrl = watch ? new AICtrl(M.level) : human[0];
    B.ctrl = pvp ? human[1] : new AICtrl(M.level);
  }
  human[0].clear(); human[1].clear();
  showScreen(null);
  REC.on = false;
  startRound();
  say(four ? '2v2 灵坛争锋' : '灵坛争锋', 1.4, 'big', '占领灵坛先达 100% 获胜');
}

const kothStartBtn = document.getElementById('kothStartBtn');
if (kothStartBtn) kothStartBtn.addEventListener('click', () => bpStart('koth', { level: pickLevel }));
const koth2v2Btn = document.getElementById('koth2v2Btn');
if (koth2v2Btn) koth2v2Btn.addEventListener('click', () => bpStart('koth2v2', { level: pickLevel, four: true }));
const kothPvpBtn = document.getElementById('kothPvpBtn');
if (kothPvpBtn) kothPvpBtn.addEventListener('click', () => bpStart('koth', { level: pickLevel, pvp: true }));
