function say(text, dur = 1.1, style = 'big', sub = '') {
  if (RESIM) return;
  const item = { text, t: 0, dur, style, sub, seed: Math.random() * 100 };
  if (!announce) {
    announce = item;
  } else {
    if (announce.text !== text && !announceQueue.some(q => q.text === text)) {
      announceQueue.push(item);
    }
  }
}
function randomPair() { const a = Math.random() * CHARS.length | 0; let b = Math.random() * (CHARS.length - 1) | 0; if (b >= a) b++; return [a, b]; }
// 还在等人进房间或在排队时开始单人模式：先关掉房间，免得有人进来把你拉去选人
function netDropWaiting() { if (!NET.open && p2pActive()) { netLeave(); $id('roomCode').textContent = ''; netStatus(''); } }
function startMatch(mode, level, chars, isWatch = false) {
  // 训练场的观察工具不能带入任何正式对局。
  debugHitbox = false;
  TRAIN.inspectHz = 120; TRAIN.inspectAcc = 0; TRAIN.inspectPaused = false;
  if (mode !== 'demo') refocusGame();
  if (mode !== 'net' && mode !== 'demo' && mode !== 'replay') netDropWaiting();
  human[0].rec = null;
  chars = chars || randomPair();
  // 常规对战各选 2 人：chars 是 [[我方第一人, 第二人], [对方第一人, 第二人]]，先由各自的第一人出战
  const duo = Array.isArray(chars[0]) ? chars : null;
  if (duo) chars = [duo[0][0], duo[1][0]];
  setChars(chars[0], chars[1]);
  if (mode === 'net') { setupNetMatch(); send({ mstart: 1 }); startRound(); return; }
  const keepMap = M.map;
  M.mode = mode; M.level = level; M.wins = [0, 0]; M.round = 1; M.carry = null; M.stage = null; M.duo = duo; M.quick = false; M.map = keepMap || null;
  M.watchAi = !!isWatch;
  A.meter = B.meter = 0;
  A.ctrl = (mode === 'demo' || isWatch) ? new AICtrl(level || 'god') : human[0];
  B.ctrl = mode === 'pvp' ? human[1] : mode === 'train' ? new DummyCtrl(level) : new AICtrl(mode === 'demo' ? 'normal' : level);
  human[0].clear(); human[1].clear();
  M.reviewReady = false;
  REC.on = false; if (mode !== 'demo' && mode !== 'train' && mode !== 'replay' && !TUT && !isWatch) recBegin(mode === 'net' ? 'net' : 'loc');
  startRound();
  if (isWatch && mode !== 'demo') say('AI 对决 · 演武观战', 1.4);
  else if (mode === 'cpu') say('人机切磋 · 实战对练', 1.4);
}
// 磁仙每回合开局抽正极或负极：只在这里抽、只用对局随机数，联机两边和回放抽到的一样（预览用的角色 reset 不碰随机数）
function magRoll() { for (const f of allFighters()) if (f.ch.passive === 'magnet') f.pol = grnd() < 0.5 ? 1 : -1; }
function startRound() {
  M.reviewReady = false;
  CLONE_FADES.length = 0;
  if (typeof statMatch === 'function') statMatch();   // 匿名统计：一局的第一回合记一次模式
  announce = null;
  announceQueue.length = 0;
  secretRound();
  STAGE_W = M.mode === 'world' ? WORLD_W : cujuOn() ? CUJU.W : (typeof kothOn === 'function' && kothOn()) ? KOTH.W : (isMulti() ? 2600 : 1800);   // 开放世界是 8000 宽的大地图
  const mp = mapNow(); if (mp && mp.w && !isMulti()) STAGE_W = mp.w;     // 山河异境的地图可以换宽度
  M.mapEnv = mp ? { wT: mp.wind ? mp.wind.every : 0, wOn: 0, wDir: 1, wN: 0, tT: mp.thunder ? mp.thunder.every : 0, tWarn: 0 } : null;   // 风、天雷的计时：每回合从头算
  if (typeof applySkins === 'function') applySkins();
  if (isRaid()) {
    const sq = M.raidSquadSize || 3;
    C.hidden = false;
    D.hidden = sq < 3;
    A.reset(STAGE_W / 2 - 440); A.face = 1;
    C.reset(STAGE_W / 2 - 260); C.face = 1;
    if (!D.hidden) { D.reset(STAGE_W / 2 - 110); D.face = 1; }
    B.reset(STAGE_W / 2 + 300); B.face = -1;
    if (typeof applyRaidBossToB === 'function') applyRaidBossToB();
    initArena2v2();
    for (const f of allFighters()) {
      if (f.ctrl && typeof f.ctrl.updateTactic === 'function') f.ctrl.updateTactic(f, foeOf(f));
    }
  } else if (is2v2()) {
    C.hidden = false; D.hidden = false;
    A.reset(STAGE_W / 2 - 420); C.reset(STAGE_W / 2 - 210);
    B.reset(STAGE_W / 2 + 210); D.reset(STAGE_W / 2 + 420);
    initArena2v2();
    for (const f of [A, B, C, D]) {
      if (f.ctrl && typeof f.ctrl.updateTactic === 'function') f.ctrl.updateTactic(f, foeOf(f));
    }
  } else {
    C.hidden = true; D.hidden = true;
    A.reset(STAGE_W / 2 - 230); B.reset(STAGE_W / 2 + 230);
    if (A.ctrl && typeof A.ctrl.updateTactic === 'function') A.ctrl.updateTactic(A, B);
    if (B.ctrl && typeof B.ctrl.updateTactic === 'function') B.ctrl.updateTactic(B, A);
  }
  magRoll();
  if (typeof applyCombatLoadouts === 'function') applyCombatLoadouts();
  if (REC.on && REC.meta) REC.meta.loadouts = [A, B, C, D].map(f => ({ unlocked: !!f.stanceUnlocked, stance: f.stance || 0, badge: f.badgeId || '', tier: f.badgeTier || '' }));
  if (M.round === 1) M.combatStats = Array.from({ length: 4 }, () => ({ damage: 0, combo: 0, breaks: 0, falls: 0 }));
  const isMayhem = mayhemOn();
  if (isMayhem) {
    for (const f of allFighters()) if (!f.hidden) {
      f.maxHp = Math.round(f.maxHp * 10); f.hp = f.lagHp = f.maxHp;
      f.guard = f.maxGuard = 500; f.meter = 100;
    }
  }
  if (chaosOn() && M.round === 1) M.chaos = { i: -1, t: 0 };   // 天机乱斗：开打第一帧抽第一条异变（updateChaos），之后的回合接着换
  const foeHp = (LEVEL_BY_ID[M.level] || {}).foeHp || 1;   // 难度表里的电脑气血倍数（绝顶多 35%）
  if ((M.mode === 'cpu' || (M.mode === 'replay' && REPLAY.kind !== 'net') || M.mode === 'tag3') && foeHp !== 1) { B.maxHp = Math.round(B.maxHp * foeHp); B.hp = B.lagHp = B.maxHp; }
  if (M.carry && M.round > 1) { [A, B].forEach((f, i) => { if (M.carry[i] !== null && M.carry[i] !== undefined) f.hp = f.lagHp = Math.round(f.maxHp * M.carry[i] * 10) / 10; }); }
  M.carry = null; M.pre = null; M.ot = false; M.rseq = (M.rseq || 0) + 1; M.introFX = M.round === 1 && M.mode !== 'demo';
  M.phase = 'intro'; M.t = 0; M.timer = isRaid() ? 120 : (is2v2() ? ROUND_TIME_2V2 : ROUND_TIME); M.koWinner = -1; M.flags = {};
  if (cujuOn()) cujuRoundInit();   // 墨球蹴鞠：摆好两人和墨球，换成这个模式的比赛时长
  if (typeof kothOn === 'function' && kothOn()) kothRoundInit();
  if (typeof partyOn === 'function' && partyOn()) partyRoundInit();
  hitstop = slowmo = superFreeze = 0; particles.length = 0; decoys.length = 0; projs.length = 0;
  for (const cu of comboUI) cu.t = 0;
  if (M.mode !== 'demo' && M.mode !== 'train') {
    if (M.round === 1) {
      creditT = CREDIT; creditPending = true; metal(880, 1.8, 0.05);
    } else {
      const txt = M.mode === 'tag3' ? `第${CN[M.round] || M.round}局` : `第${CN[M.round] || M.round}回合`;
      say(txt, 1.1); SFX.gong();
    }
  }
  scRoundStart();
  netEmit({ e: 'round', r: M.round, w: [...M.wins], ch: [A.chIdx, B.chIdx] });
}
// 回合规则的数值（回合时长、加时、带血 +CARRY_HEAL）都在 01-core.js 的「对战规则数值」里
function timeDeath(winner, text) {
  M.phase = 'ko'; M.t = 0; M.koWinner = winner;
  M.pre = [A.hp / A.maxHp, B.hp / B.maxHp];           // 记下“生前”的血量
  if (winner >= 0) {
    const losers = sideFighters(1 - winner);
    const winRef = [A, B][winner];
    for (const l of losers) {
      l.hp = 0; l.state = 'launched'; l.t = 0; l.vy = -380; l.vx = (l.x >= winRef.x ? 1 : -1) * 260; l.y = Math.min(l.y, -1); l.invul = 99; l.move = null; l.skill = null;
    }
  }
  sayNet(text, 1.4, 'big', 'gong');
}
function updateMatch() {
  M.t += STEP;
  if (M.phase === 'intro') {
    if (M.introFX && M.t > 0.2) { M.introFX = false; for (const f of allFighters()) if (!f.hidden && !f.dummy) skinIntroFX(f); }
    const go = M.mode === 'demo' || M.mode === 'train' ? 0.3 : 1.25 + (M.round === 1 ? CREDIT : 0);
    if (M.t > go && !M.flags.go) { M.flags.go = true; if (M.mode !== 'demo' && M.mode !== 'train') sayNet('开战', 0.7, 'go', 'heavy'); }
    if (M.t > go + 0.35) { M.phase = 'fight'; M.t = 0; }
  } else if (M.phase === 'fight') {
    if (FOREST.on) return;   // 斩妖波次由 forestUpdate 独立推进，清完群妖再衔接六技魔首或结算
    if (cujuOn()) { cujuMatch(); return; }   // 墨球蹴鞠：按进球判胜负（22-modes-09-cuju/）
    if (typeof kothOn === 'function' && kothOn()) { kothMatch(); return; }
    if (M.mode === 'boss') gbossStep();   // 天魔倒下会再站起来，见 22-tianmo.js
    if (isRaid() && typeof updateRaidBoss === 'function') updateRaidBoss(STEP);
    const team0Out = isRaid() ? sideFighters(0).every(f => f.hp <= 0) : (is2v2() ? (A.hp <= 0 && C.hp <= 0) : (A.hp <= 0));
    const team1Out = isRaid() ? (B.hp <= 0) : (is2v2() ? (B.hp <= 0 && D.hp <= 0) : (B.hp <= 0));
    if (M.mode !== 'train' && (team0Out || team1Out)) {
      const sumHp = sd => sideFighters(sd).reduce((s, f) => s + Math.max(0, f.hp), 0);
      const winner = (team0Out && team1Out)
        ? (sumHp(0) >= sumHp(1) ? 0 : 1)
        : (team0Out ? 1 : 0);
      const losers = sideFighters(1 - winner);
      for (const loser of losers) {
        loser.hp = 0;
        if (loser.state !== 'launched' && loser.state !== 'knockdown') {
          loser.state = 'launched';
          loser.t = 0;
          loser.vy = Math.min(loser.vy, -520);
          loser.y = Math.min(loser.y, -1);
        }
      }
      M.phase = 'ko';
      M.t = 0;
      M.koWinner = winner;
    } else if (M.mode !== 'demo' && M.mode !== 'train') {
      if (chaosOn()) updateChaos(STEP);   // 联机两边都算（以前只有房主抽，异变也只认本地模式，联机等于没有）
      M.timer = Math.max(0, M.timer - STEP);
      if (M.timer <= 0) {
        const s0 = sideFighters(0), s1 = sideFighters(1);
        const ra = s0.reduce((s, f) => s + Math.max(0, f.hp), 0) / Math.max(1, s0.reduce((s, f) => s + f.maxHp, 0));
        const rb = s1.reduce((s, f) => s + Math.max(0, f.hp), 0) / Math.max(1, s1.reduce((s, f) => s + f.maxHp, 0));
        if (M.mode === 'boss') timeDeath(-1, '时辰已到');
        else if (M.mode === 'saga') sagaTimeUp(ra, rb);   // 侠客列传：按这一战的胜利条件判
        else if (!M.ot) { M.ot = true; M.timer = OT_TIME; sayNet('加时 · 伤害翻倍', 1.4, 'big', 'gong'); }
        else timeDeath(ra > rb ? 0 : rb > ra ? 1 : -1, '时间到');
      }
    }
  } else if (M.phase === 'ko') {
    const winners = M.koWinner >= 0 ? sideFighters(M.koWinner) : [];
    for (const w of winners) {
      if (w && M.t > 1.2 && w.hp > 0 && w.onGround() && (w.state === 'idle' || w.state === 'walk')) { w.state = 'victory'; w.t = 0; skinVictoryFX(w); }
    }
    if (M.t > 2.8) {
      try { endRound(); } catch (err) { console.error('endRound error:', err); showEnd(M.koWinner >= 0 ? M.koWinner : 0); }
    }
  }
}
function saveProfile() {
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  applyProfile(PROF);
}
function sayNet(text, dur, style, snd) { say(text, dur, style); if (snd) SFX[snd](); netEmit({ e: 'say', text, dur, style, snd }); }
// 结算大字：墨笔写“谁，胜”，胜字盖成朱印
function inkTitle(name, lost) {
  const t = $id('endTitle');
  t.style.color = '';
  t.className = 'ink-title' + (lost ? ' lost' : '');
  t.innerHTML = `<span class="it-name">${escapeHTML(name)}</span><span class="it-comma">，</span><span class="it-seal">胜</span>`;
}
