// ======================= 江湖百戏：轮换趣味小游戏（传火折 / 断崖推手 / 飞球乱舞） =======================
// 本文件：五局三胜制江湖百戏小游戏合集，让好友聚会跳出传统拼血套路。
const PARTY_KINDS = [
  { id: 'potato', name: '传火折', sub: '挨打接火折，倒计时归零即炸！' },
  { id: 'sumo', name: '断崖推手', sub: '无伤 2.6 倍击退，把对手推下悬崖！' },
  { id: 'dodge', name: '飞球乱舞', sub: '格挡弹飞墨球，被砸中直接出局！' },
];
const PARTY_SUMO_MAP = { id: 'party_sumo', name: '断崖擂台', w: 1800, cliff: [480, 1320], plats: [], bg: 'cliff' };
const partyOn = () => M.mode === 'party' || !!(typeof netRoom === 'function' && netRoom() && netRoom().rule === 'party');

function partyRoundInit() {
  const idx = ((M.round || 1) - 1) % PARTY_KINDS.length;
  const kind = PARTY_KINDS[idx].id;
  M.party = {
    kind,
    bombHolder: (M.round || 1) % 2 === 1 ? 0 : 1,
    bombT: 9.0,
    balls: [],
  };
  M.timer = 45;
  if (kind === 'sumo') {
    A.x = STAGE_W / 2 - 180; A.face = 1;
    B.x = STAGE_W / 2 + 180; B.face = -1;
  } else {
    A.x = STAGE_W / 2 - 260; A.face = 1;
    B.x = STAGE_W / 2 + 260; B.face = -1;
  }
  if (kind === 'dodge') {
    M.party.balls = [
      { x: STAGE_W / 2, y: -340, vx: 640, vy: -120, r: 24 },
      { x: STAGE_W / 2, y: -520, vx: -680, vy: 80, r: 24 },
    ];
  }
}

function partyTransferBomb(newHolderIdx) {
  if (!partyOn() || !M.party || M.party.kind !== 'potato') return;
  if (M.party.bombHolder === newHolderIdx) return;
  M.party.bombHolder = newHolderIdx;
  M.party.bombT = Math.min(9.0, M.party.bombT + 1.2);
  const f = fighterByIdx(newHolderIdx);
  if (f && !RESIM) {
    ring(f.x, f.y - 60, 85, '255,140,60', 0.35);
    addP({ type: 'text', text: '传火!', x: f.x, y: f.y - 110, life: 0.7, max: 0.7, rgb: '255,150,70' });
    SFX.poof();
  }
}

function partyTick() {
  if (!partyOn() || !M.party || M.phase !== 'fight') return;
  const P = M.party;
  if (P.kind === 'potato' || P.kind === 'dodge') {
    A.hp = A.lagHp = A.maxHp;
    B.hp = B.lagHp = B.maxHp;
  } else if (P.kind === 'sumo') {
    if (A.hp > 0) A.hp = A.lagHp = A.maxHp;
    if (B.hp > 0) B.hp = B.lagHp = B.maxHp;
  }
  if (P.kind === 'potato') {
    P.bombT = Math.max(0, P.bombT - STEP);
    if (P.bombT <= 0) {
      const loser = fighterByIdx(P.bombHolder) || A;
      const w = loser === A ? 1 : 0;
      loser.hp = 0;
      if (!RESIM) {
        ring(loser.x, loser.y - 50, 180, '255,100,50', 0.6);
        shake = Math.max(shake, 16);
        SFX.heavy();
        say('火折爆裂!', 1.2, 'big');
      }
      M.koWinner = w;
      M.phase = 'ko';
      M.t = 0;
    }
  } else if (P.kind === 'dodge') {
    for (let i = 0; i < P.balls.length; i++) {
      const b = P.balls[i];
      b.vy += 1200 * STEP;
      b.x += b.vx * STEP;
      b.y += b.vy * STEP;
      if (b.y > -b.r) { b.y = -b.r; b.vy = -Math.max(460, Math.abs(b.vy) * 0.92); }
      if (b.y < -900) { b.y = -900; b.vy = Math.abs(b.vy) * 0.85; }
      if (b.x < WALL + b.r) { b.x = WALL + b.r; b.vx = Math.abs(b.vx) * 1.03; }
      if (b.x > STAGE_W - WALL - b.r) { b.x = STAGE_W - WALL - b.r; b.vx = -Math.abs(b.vx) * 1.03; }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 1550) { b.vx *= 1550 / sp; b.vy *= 1550 / sp; }
      for (const f of [A, B]) {
        if (f.hp <= 0 || f.invul > 0) continue;
        const hu = hurtbox(f);
        const cx = clamp(b.x, hu[0], hu[2]), cy = clamp(b.y, hu[1], hu[3]);
        if (Math.hypot(b.x - cx, b.y - cy) < b.r) {
          if ((f.state === 'block' || f.state === 'blockstun') && f.onGround()) {
            b.vx = f.face * Math.max(760, Math.abs(b.vx) * 1.05);
            b.vy = -420;
            if (!RESIM) { blockFX(b.x, b.y, f.face); SFX.block(); }
          } else {
            f.hp = 0;
            M.koWinner = f === A ? 1 : 0;
            M.phase = 'ko';
            M.t = 0;
            if (!RESIM) { ring(f.x, f.y - 50, 120, '255,100,100', 0.45); SFX.heavy(); }
            return;
          }
        }
      }
    }
  }
}

function drawPartyField() {
  if (!partyOn() || !M.party) return;
  const P = M.party;
  ctx.save();
  if (P.kind === 'potato') {
    const holder = fighterByIdx(P.bombHolder);
    if (holder && holder.hp > 0) {
      const pulse = 0.7 + 0.3 * Math.sin(clock * (P.bombT < 3 ? 22 : 10));
      ctx.strokeStyle = `rgba(255,120,50,${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(holder.x, holder.y - 125, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = P.bombT < 3 ? '#ff6446' : '#ffd070';
      ctx.font = `700 15px ${BODY_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`🔥 ${P.bombT.toFixed(1)}s`, holder.x, holder.y - 148);
    }
  } else if (P.kind === 'dodge') {
    for (const b of P.balls) {
      ctx.fillStyle = '#181822';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff7b54'; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }
  const def = PARTY_KINDS.find(k => k.id === P.kind) || PARTY_KINDS[0];
  ctx.font = `700 13px ${BODY_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(233,196,106,0.9)';
  ctx.fillText(cvT(def.name), STAGE_W / 2, -260);
  ctx.restore();
}

function startParty(p1, p2, lv, opts = {}) {
  initAudio();
  paused = false;
  const pvp = !!opts.pvp, watch = !!opts.isWatch && !pvp;
  M.mode = 'party';
  M.level = lv || pickLevel || 'normal';
  M.round = 1; M.wins = [0, 0]; M.carry = null; M.stage = null; M.duo = null; M.map = null; M.quick = false;
  M.watchAi = watch; M.partyPvp = pvp;
  M.teamMutator = 'normal';
  setChars(p1, p2);
  A.ctrl = watch ? new AICtrl(M.level) : human[0];
  B.ctrl = pvp ? human[1] : new AICtrl(M.level);
  human[0].clear(); human[1].clear();
  showScreen(null);
  REC.on = false;
  startRound();
  const k = PARTY_KINDS[0];
  say(`江湖百戏 · ${k.name}`, 1.5, 'big', k.sub);
}

const partyStartBtn = document.getElementById('partyStartBtn');
if (partyStartBtn) partyStartBtn.addEventListener('click', () => bpStart('party', { level: pickLevel }));
const partyPvpBtn = document.getElementById('partyPvpBtn');
if (partyPvpBtn) partyPvpBtn.addEventListener('click', () => bpStart('party', { level: pickLevel, pvp: true }));
