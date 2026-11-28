function tourRoundNames(size) {
  if (size === 4) return ['半决赛', '总决赛'];
  if (size === 16) return ['十六强赛', '八强赛', '半决赛', '总决赛'];
  return ['八强赛', '半决赛', '总决赛'];
}

// 标准单败淘汰种子对阵（保证 1 号与 2 号种子分处上下半区，仅可在总决赛相遇）
function tourSeedPairs(size) {
  const n = TOUR_SIZES.includes(size) ? size : 8;
  let order = [0, 1];
  while (order.length < n) {
    const next = [];
    const sum = order.length * 2 - 1;
    for (const s of order) next.push(s, sum - s);
    order = next;
  }
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return pairs;
}

function tourSeededRng(seed) {
  let s = (Math.floor(+seed || Date.now()) >>> 0) || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tourHeroRating(chIdx) {
  const st = (CHARS[chIdx] && CHARS[chIdx].stat) || {};
  return (+st.hp || 850) * 0.4 + (+st.atk || 60) * 6 + (+st.spd || 60) * 4 + (chIdx % 7);
}

function tourCancelAuto() {
  if (tourAutoTimer) { clearTimeout(tourAutoTimer); tourAutoTimer = 0; }
}

function tourCreate(opts = {}) {
  tourCancelAuto();
  const size = TOUR_SIZES.includes(+opts.size) ? (+opts.size) : (TOUR_SIZES.includes(tourSize) ? tourSize : 8);
  const rawFmt = opts.format || tourFormat || 'player';
  const format = ['player', 'local2', 'watch', 'watch8', 'online'].includes(rawFmt) ? rawFmt : 'player';
  const seedMode = opts.seedMode === 'random' ? 'random' : (opts.seedMode === 'standard' ? 'standard' : (tourSeedMode || 'standard'));
  const level = ['easy', 'normal', 'hard', 'impossible', 'god'].includes(opts.level) ? opts.level : (typeof pickLevel === 'string' ? pickLevel : 'normal');
  const autoAdvance = !!opts.autoAdvance;
  const rng = tourSeededRng(opts.seed || Date.now());
  const pool = CHARS.map((_, i) => i);
  const p1Hero = Number.isInteger(opts.playerHero) && opts.playerHero >= 0 && opts.playerHero < CHARS.length
    ? opts.playerHero : (typeof menuHeroPick === 'function' ? menuHeroPick() : 0);
  const picked = [];
  const take = idx => {
    const pos = pool.indexOf(idx);
    if (pos >= 0) pool.splice(pos, 1);
    picked.push(idx);
    return idx;
  };
  if (format === 'player' || format === 'local2' || format === 'online') take(p1Hero);
  if (format === 'local2' || format === 'online') {
    const p2Hero = Number.isInteger(opts.p2Hero) && opts.p2Hero >= 0 && opts.p2Hero < CHARS.length && opts.p2Hero !== p1Hero
      ? opts.p2Hero : pool[Math.floor(rng() * pool.length)];
    take(p2Hero);
  }
  while (picked.length < size && pool.length) {
    const k = Math.floor(rng() * pool.length);
    take(pool[k]);
  }
  const hostName = opts.hostName || (typeof NET !== 'undefined' && NET.names && NET.names.host) || (typeof ACC !== 'undefined' && ACC.name) || '你';
  const clientName = opts.clientName || (typeof NET !== 'undefined' && NET.names && NET.names.client) || '对手';
  let entrants = picked.map((chIdx, i) => {
    const humanSlot = format === 'player' ? (i === 0 ? 1 : 0)
      : (format === 'local2' || format === 'online') ? (i === 0 ? 1 : i === 1 ? 2 : 0) : 0;
    const heroName = (CHARS[chIdx] || {}).name || '侠客';
    const label = humanSlot === 1
      ? (format === 'local2' ? `1P · ${heroName}` : `${hostName} · ${heroName}`)
      : humanSlot === 2
        ? (format === 'online' ? `${clientName} · ${heroName}` : `2P · ${heroName}`)
        : `AI · ${heroName}`;
    return { id: i, seed: i + 1, chIdx, human: humanSlot, name: label };
  });
  if (seedMode === 'standard') {
    // 人类选手固定最高顺位种子（1P/房主 #1，2P/应战 #2，确保上下半区错开），AI 按综合战力排定种子
    const humans = entrants.filter(e => e.human > 0).sort((a, b) => a.human - b.human);
    const ais = entrants.filter(e => e.human === 0).sort((a, b) => tourHeroRating(b.chIdx) - tourHeroRating(a.chIdx));
    entrants = [...humans, ...ais];
  } else {
    // 随机抽签：确定性 Fisher-Yates 洗牌
    for (let i = entrants.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = entrants[i]; entrants[i] = entrants[j]; entrants[j] = tmp;
    }
  }
  entrants.forEach((e, i) => { e.id = i; e.seed = i + 1; });

  const roundCount = Math.round(Math.log2(size));
  const r0Pairs = tourSeedPairs(size);
  const rounds = [r0Pairs.map(([a, b], idx) => ({ round: 0, idx, a, b, winner: -1, score: null }))];
  for (let r = 1; r < roundCount; r++) {
    const cnt = size >> (r + 1);
    rounds.push(Array.from({ length: cnt }, (_, idx) => ({ round: r, idx, a: -1, b: -1, winner: -1, score: null })));
  }
  TOUR = {
    id: `tour-${Date.now().toString(36)}`,
    size,
    format,
    seedMode,
    level,
    autoAdvance,
    online: format === 'online',
    entrants,
    rounds,
    champion: -1,
    rewardPaid: false,
    history: []
  };
  tourRender();
  if (TOUR.online && typeof NET !== 'undefined' && NET.open && NET.role === 'host') tourSyncSend();
  return TOUR;
}

function tourNextPending() {
  if (!TOUR) return null;
  for (let r = 0; r < TOUR.rounds.length; r++) {
    for (let m = 0; m < TOUR.rounds[r].length; m++) {
      const bout = TOUR.rounds[r][m];
      if (bout.winner < 0 && bout.a >= 0 && bout.b >= 0) return bout;
    }
  }
  return null;
}

function tourReportResult(roundIdx, matchIdx, winnerSide, score = null, fromRemote = false) {
  if (!TOUR || !TOUR.rounds[roundIdx] || !TOUR.rounds[roundIdx][matchIdx]) return false;
  const bout = TOUR.rounds[roundIdx][matchIdx];
  if (bout.winner >= 0) return false;
  if (bout.a < 0 || bout.b < 0 || (winnerSide !== 0 && winnerSide !== 1)) return false;
  const winId = winnerSide === 0 ? bout.a : bout.b;
  bout.winner = winId;
  bout.score = Array.isArray(score) ? [score[0] | 0, score[1] | 0] : (winnerSide === 0 ? [2, 0] : [0, 2]);
  TOUR.history.push({ round: roundIdx, idx: matchIdx, a: bout.a, b: bout.b, winner: winId, score: bout.score });
  if (roundIdx + 1 < TOUR.rounds.length) {
    const nextBout = TOUR.rounds[roundIdx + 1][Math.floor(matchIdx / 2)];
    if (matchIdx % 2 === 0) nextBout.a = winId; else nextBout.b = winId;
  } else {
    TOUR.champion = winId;
    const champ = TOUR.entrants[winId];
    const reward = TOUR.size === 16 ? 350 : TOUR.size === 4 ? 120 : 200;
    if (!TOUR.rewardPaid && champ && champ.human > 0 && typeof PROF !== 'undefined') {
      TOUR.rewardPaid = true;
      PROF.ink = (PROF.ink || 0) + reward;
      if (typeof saveProfile === 'function') saveProfile();
      if (typeof toast === 'function') toast(`武林大会夺魁！获得 +${reward} 墨锭`);
    }
  }
  if (!fromRemote && TOUR.online && typeof NET !== 'undefined' && NET.open) {
    if (NET.role === 'host') tourSyncSend();
    else send({ sys: 'tour_result', round: roundIdx, match: matchIdx, winnerSide, score: bout.score });
  }
  tourRender();
  return true;
}

function tourSimMatch(roundIdx, matchIdx) {
  if (!TOUR || !TOUR.rounds[roundIdx] || !TOUR.rounds[roundIdx][matchIdx]) return false;
  const bout = TOUR.rounds[roundIdx][matchIdx];
  if (bout.winner >= 0 || bout.a < 0 || bout.b < 0) return false;
  const eA = TOUR.entrants[bout.a], eB = TOUR.entrants[bout.b];
  const hpA = ((CHARS[eA.chIdx] || {}).stat || {}).hp || 850;
  const hpB = ((CHARS[eB.chIdx] || {}).stat || {}).hp || 850;
  const rng = tourSeededRng((roundIdx + 1) * 997 + (matchIdx + 1) * 131 + eA.chIdx * 17 + eB.chIdx * 31);
  const wSide = rng() * (hpA + hpB) < hpA ? 0 : 1;
  const loseR = rng() < 0.45 ? 1 : 0;
  return tourReportResult(roundIdx, matchIdx, wSide, wSide === 0 ? [2, loseR] : [loseR, 2]);
}

function tourSimAllAi() {
  if (!TOUR) return 0;
  let count = 0;
  for (;;) {
    const bout = tourNextPending();
    if (!bout) break;
    const eA = TOUR.entrants[bout.a], eB = TOUR.entrants[bout.b];
    if (eA.human > 0 || eB.human > 0) break;
    if (!tourSimMatch(bout.round, bout.idx)) break;
    count++;
  }
  tourRender();
  return count;
}

// 自动推进赛程：自动快结 AI 场次；全 AI 观战模式下自动倒计时开打下一场
function tourAutoStep() {
  tourCancelAuto();
  if (!TOUR || !TOUR.autoAdvance || TOUR.champion >= 0) return 0;
  const isWatchAll = TOUR.format === 'watch' || TOUR.format === 'watch8';
  if (!isWatchAll) {
    if (TOUR.online && typeof NET !== 'undefined' && NET.role === 'client') return 0;
    return tourSimAllAi();
  }
  const next = tourNextPending();
  if (!next) return 0;
  tourAutoTimer = setTimeout(() => {
    tourAutoTimer = 0;
    if (!TOUR || !TOUR.autoAdvance || TOUR.champion >= 0) return;
    const b = tourNextPending();
    if (b) tourPlayMatch(b.round, b.idx, true);
  }, 1600);
  return 1;
}

function tourToggleAuto(forceVal) {
  if (!TOUR) return false;
  TOUR.autoAdvance = typeof forceVal === 'boolean' ? forceVal : !TOUR.autoAdvance;
  if (!TOUR.autoAdvance) tourCancelAuto();
  else tourAutoStep();
  tourRender();
  return TOUR.autoAdvance;
}

// 联机武林大会同步（完全在回滚循环之外，对战仍走标准 rollStart 保证确定性）
function tourSerialize(tour) {
  if (!tour) return null;
  return {
    id: tour.id,
    size: tour.size,
    format: tour.format,
    seedMode: tour.seedMode,
    level: tour.level,
    autoAdvance: !!tour.autoAdvance,
    online: !!tour.online,
    champion: tour.champion,
    entrants: tour.entrants.map(e => ({ id: e.id, seed: e.seed, chIdx: e.chIdx, human: e.human, name: e.name })),
    rounds: tour.rounds.map(r => r.map(b => ({ round: b.round, idx: b.idx, a: b.a, b: b.b, winner: b.winner, score: b.score }))),
    history: tour.history.map(h => ({ round: h.round, idx: h.idx, a: h.a, b: h.b, winner: h.winner, score: h.score }))
  };
}

function tourSyncSend() {
  if (!TOUR || !TOUR.online || typeof NET === 'undefined' || !NET.open || NET.role !== 'host') return false;
  send({ sys: 'tour_sync', tour: tourSerialize(TOUR) });
  return true;
}

function tourSyncRecv(msg) {
  if (!msg || !msg.tour || !Array.isArray(msg.tour.entrants) || !Array.isArray(msg.tour.rounds)) return false;
  TOUR = Object.assign({ rewardPaid: false }, msg.tour, { online: true });
  tourRender();
  if (typeof showScreen === 'function' && currentScreen !== 'tournament' && M.phase !== 'fight') showScreen('tournament');
  return true;
}

function tourStartOnlineRoom(opts = {}) {
  const t = tourCreate(Object.assign({
    format: 'online',
    size: tourSize,
    seedMode: tourSeedMode,
    level: typeof pickLevel === 'string' ? pickLevel : 'normal',
    autoAdvance: true,
    hostName: (typeof NET !== 'undefined' && NET.names && NET.names.host) || (typeof ACC !== 'undefined' && ACC.name) || '房主',
    clientName: (typeof NET !== 'undefined' && NET.names && NET.names.client) || '对手'
  }, opts));
  if (typeof showScreen === 'function') showScreen('tournament');
  return t;
}

function tourRecvRemoteResult(msg) {
  if (!TOUR || !msg) return false;
  const ok = tourReportResult(msg.round | 0, msg.match | 0, msg.winnerSide | 0, msg.score || null, true);
  if (ok && typeof NET !== 'undefined' && NET.role === 'host') {
    if (TOUR.autoAdvance) tourAutoStep();
    tourSyncSend();
  }
  return ok;
}

function tourRecvOnlineStart(msg) {
  if (!TOUR || !msg) return false;
  const rNames = tourRoundNames(TOUR.size);
  const label = msg.label || `${cvT('联机武林大会')} · ${cvT(rNames[msg.round] || '淘汰赛')} #${(msg.match | 0) + 1}`;
  M.tournament = { round: msg.round | 0, match: msg.match | 0, online: true, spectate: false, label };
  return true;
}

function tourPlayMatch(roundIdx, matchIdx, spectate = false) {
  tourCancelAuto();
  if (!TOUR || !TOUR.rounds[roundIdx] || !TOUR.rounds[roundIdx][matchIdx]) return false;
  const bout = TOUR.rounds[roundIdx][matchIdx];
  if (bout.winner >= 0 || bout.a < 0 || bout.b < 0) return false;
  const eA = TOUR.entrants[bout.a], eB = TOUR.entrants[bout.b];
  const bothHuman = !spectate && eA.human > 0 && eB.human > 0;
  const oneHuman = !spectate && ((eA.human > 0) !== (eB.human > 0));
  const aiWatch = spectate || (!bothHuman && !oneHuman);
  const rNames = tourRoundNames(TOUR.size);
  const label = `${cvT(TOUR.online ? '联机武林大会' : '武林大会')} · ${cvT(rNames[roundIdx] || '淘汰赛')} #${matchIdx + 1}`;
  if (typeof initAudio === 'function') initAudio();
  paused = false;

  // 联机赛程中房主 vs 应战者直面对决：走标准回滚联机通道（rollStart），保持 100% 回滚确定性
  if (TOUR.online && bothHuman && typeof NET !== 'undefined' && NET.open) {
    if (NET.role !== 'host') {
      if (typeof toast === 'function') toast('请等待擂主开启本场联机对决');
      return false;
    }
    const hostOnA = eA.human === 1;
    const chPair = hostOnA ? [eA.chIdx, eB.chIdx] : [eB.chIdx, eA.chIdx];
    const seed = (Date.now() ^ ((roundIdx + 1) * 7919) ^ ((matchIdx + 1) * 104729)) >>> 0;
    showScreen(null);
    M.tournament = { round: roundIdx, match: matchIdx, online: true, swapped: !hostOnA, spectate: false, label };
    send({ sys: 'tour_start', round: roundIdx, match: matchIdx, ch: chPair, label });
    send({ rstart: { ch: chPair, seed } });
    if (typeof rollStart === 'function') rollStart(chPair, seed);
    SPEC_HUD.focusIdx = -1;
    say(label, 1.5);
    return true;
  }

  showScreen(null);
  const mode = bothHuman ? 'pvp' : 'cpu';
  startMatch(mode, TOUR.level, [eA.chIdx, eB.chIdx]);
  M.tournament = { round: roundIdx, match: matchIdx, online: !!TOUR.online, spectate: aiWatch, label };
  if (aiWatch) {
    M.watchAi = true;
    A.ctrl = new AICtrl(TOUR.level);
    B.ctrl = new AICtrl(TOUR.level);
  } else if (oneHuman && eB.human > 0) {
    A.ctrl = new AICtrl(TOUR.level);
    B.ctrl = human[0];
  }
  SPEC_HUD.focusIdx = -1;
  say(label, 1.5);
  return true;
}

function tourOnMatchEnd(w) {
  if (!TOUR || !M.tournament) return false;
  const { round, match, swapped } = M.tournament;
  const rawSide = w === 1 ? 1 : 0;
  const winnerSide = swapped ? (1 - rawSide) : rawSide;
  const rawScore = [M.wins ? M.wins[0] : (rawSide === 0 ? 2 : 0), M.wins ? M.wins[1] : (rawSide === 1 ? 2 : 0)];
  const score = swapped ? [rawScore[1], rawScore[0]] : rawScore;
  M.tournament = null;
  tourReportResult(round, match, winnerSide, score);
  if (TOUR.autoAdvance && TOUR.champion < 0) tourAutoStep();
  if (typeof scheduleEndScreen === 'function') scheduleEndScreen(() => showScreen('tournament'));
  else showScreen('tournament');
  return true;
}

// 3. 可分享赛果与排名编码（纯 JS Base64URL，兼容浏览器与 Node VM）
const TOUR_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
