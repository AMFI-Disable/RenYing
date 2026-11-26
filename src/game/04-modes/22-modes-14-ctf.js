// ======================= 夺旗争锋：2v2 ~ 10v10 团队夺旗战 =======================
// 双方基地各立战旗；夺取敌方战旗护送回己方阵地即得 1 分，先夺 3 旗者胜。
const ctfOn = () => M.mode === 'ctf' || (M.mode === 'replay' && REPLAY.on && !!(REPLAY.m && (REPLAY.m.mode === 'ctf' || REPLAY.m.room === 'ctf'))) || !!(typeof netRoom === 'function' && netRoom() && netRoom().rule === 'ctf');

function ctfRoundInit() {
  const base0 = WALL + 160, base1 = STAGE_W - WALL - 160;
  M.ctf = {
    score: [0, 0],
    target: 3,
    flags: [
      { team: 0, baseX: base0, x: base0, y: 0, carrier: -1, dropped: false },
      { team: 1, baseX: base1, x: base1, y: 0, carrier: -1, dropped: false },
    ],
    respawn: new Array(MAX_FIGHTERS).fill(0),
  };
  M.timer = 180;
}

function ctfObjective(f, foe) {
  if (!ctfOn() || !M.ctf || M.phase !== 'fight') return null;
  const team = fighterTeam(f);
  const home = M.ctf.flags[team], away = M.ctf.flags[1 - team];
  if (away.carrier === f.idx) return { x: home.baseX, y: 0 };
  if (foe && foe.hp > 0 && Math.abs(f.x - foe.x) < 220 && Math.abs(f.y - foe.y) < 120) return null;
  if (home.dropped) return home;
  if (home.carrier >= 0) return fighterByIdx(home.carrier);
  return away.carrier < 0 ? away : null;
}

function ctfMatch() {
  const S = M.ctf;
  if (!S) return;
  M.timer = Math.max(0, M.timer - STEP);
  if (chaosOn()) updateChaos(STEP);
  const fs = allFighters();
  for (const f of fs) {
    if (f.hidden) continue;
    if (f.hp <= 0) {
      for (const fl of S.flags) if (fl.carrier === f.idx) { fl.carrier = -1; fl.dropped = true; fl.x = f.x;
        const bm = typeof battleMapDef === 'function' ? battleMapDef() : null;
        fl.y = bm ? Math.min(0, Math.ceil(f.y / bm.layerH) * bm.layerH) : 0; }
      if (S.respawn[f.idx] <= 0) S.respawn[f.idx] = 3.0;
      else {
        S.respawn[f.idx] -= STEP;
        if (S.respawn[f.idx] <= 0) {
          const team = fighterTeam(f);
          const offset = 45 + Math.floor(f.idx / 2) * 55;
          f.reset(S.flags[team].baseX + (team === 0 ? offset : -offset));
          f.face = team === 0 ? 1 : -1;
          f.invul = 1.0;
          if (typeof applyCombatLoadouts === 'function') applyCombatLoadouts(f);
          if (mayhemOn()) applyMayhemStats(f);
          if (f.idx === localIdx()) { f.beaconT = 1.2; camFocusPingT = 0.8; }
        }
      }
      continue;
    }
    const myTeam = fighterTeam(f), enTeam = 1 - myTeam;
    const enFlag = S.flags[enTeam], myFlag = S.flags[myTeam];
    // 拾取敌旗
    if (enFlag.carrier < 0 && Math.abs(f.x - enFlag.x) < 62 && Math.abs(f.y - enFlag.y) < 80) {
      enFlag.carrier = f.idx; enFlag.dropped = false;
      if (!RESIM) { ring(f.x, f.y - 60, 110, '255,215,90', 0.36); addP({ type: 'text', text: '夺旗成功!', x: f.x, y: f.y - 120, life: 0.9, max: 0.9, rgb: '255,220,100' }); }
    }
    // 归还掉落的己旗
    if (myFlag.dropped && myFlag.carrier < 0 && Math.abs(f.x - myFlag.x) < 62 && Math.abs(f.y - myFlag.y) < 80) {
      myFlag.x = myFlag.baseX; myFlag.y = 0; myFlag.dropped = false;
      if (!RESIM) addP({ type: 'text', text: '战旗归位', x: f.x, y: f.y - 115, life: 0.8, max: 0.8, rgb: '120,230,255' });
    }
    // 护旗回基地得分
    if (enFlag.carrier === f.idx) {
      enFlag.x = f.x; enFlag.y = f.y;
      if (Math.abs(f.x - myFlag.baseX) < 88 && Math.abs(f.y) < 80) {
        S.score[myTeam]++;
        enFlag.carrier = -1; enFlag.dropped = false; enFlag.x = enFlag.baseX; enFlag.y = 0;
        if (!RESIM) { say(myTeam === 0 ? '我方夺旗得分！' : '敌方夺旗得分！', 1.2, 'big'); SFX.gong(); }
        if (S.score[myTeam] >= S.target) {
          M.phase = 'ko'; M.t = 0; M.koWinner = myTeam;
          return;
        }
      }
    }
  }
  if (M.timer <= 0) {
    const winner = S.score[0] > S.score[1] ? 0 : S.score[1] > S.score[0] ? 1 : -1;
    M.phase = 'ko'; M.t = 0; M.koWinner = winner;
    sayNet('时辰已到', 1.3, 'big', 'gong');
  }
}

function drawCtfField() {
  if (!ctfOn() || !M.ctf) return;
  for (const fl of M.ctf.flags) {
    const col = fl.team === localTeam() ? '#46d3ea' : '#ff5e6c';
    ctx.save();
    // 基地标记
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(fl.baseX, 0, 52, 12, 0, 0, Math.PI * 2); ctx.stroke();
    // 战旗
    const fx = fl.x, fy = fl.carrier >= 0 ? (fighterByIdx(fl.carrier).y - 145) : fl.y;
    ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 110); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(fx, fy - 110); ctx.lineTo(fx + 44, fy - 92); ctx.lineTo(fx, fy - 74); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function startCtf(teamSize = 4, heroIdx = 0, level = 'normal', drafted = null, mut = 'normal') {
  const sz = clamp(teamSize | 0, 2, 10);
  debugHitbox = false;
  refocusGame();
  netDropWaiting();
  M.mode = 'ctf';
  M.teamSize = sz;
  M.level = level || 'normal';
  M.teamMutator = mut === 'mayhem' ? 'mayhem' : 'normal';
  M.wins = [0, 0]; M.round = 1; M.watchAi = false;
  const total = sz * 2;
  const hasDraft = Array.isArray(drafted) && Array.isArray(drafted[0]) && Array.isArray(drafted[1]);
  for (let i = 0; i < total; i++) {
    const f = FIGHTERS[i];
    const side = i % 2, slot = Math.floor(i / 2);
    const draftedCid = hasDraft && Number.isInteger(drafted[side][slot]) && drafted[side][slot] >= 0 ? drafted[side][slot] : -1;
    const stride = side === 0 ? 3 : 7;
    f.setChar(draftedCid >= 0 ? draftedCid : (i === 0 ? (heroIdx | 0) : ((heroIdx + (side ? 1 : 0) + slot * stride) % CHARS.length)));
    f.ctrl = i === 0 ? human[0] : new AICtrl(M.level);
    f.hidden = false;
  }
  for (let i = total; i < MAX_FIGHTERS; i++) FIGHTERS[i].hidden = true;
  if (typeof invalidateFighterCache === 'function') invalidateFighterCache();
  human[0].clear();
  paused = false;
  showScreen(null);
  REC.on = false; recBegin('loc');
  startRound();
  say(`夺旗争锋 · ${sz}v${sz}`, 1.4);
}
