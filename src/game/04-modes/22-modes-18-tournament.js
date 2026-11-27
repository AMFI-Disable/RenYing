// ======================= 实时观战 HUD 与武林大会赛程 (#56) =======================
// 1. Live Spectator HUD & Read-Only Online Spectating
// 纯渲染、只读广播与镜头控制，不修改任何战斗物理、随机数或回滚状态。
const SPEC_HUD = { focusIdx: -1, clean: false, lastDraw: 0, liveSpecs: 0, liveTitle: '', bcastAcc: 0 };
const SPEC_BCAST_INTERVAL = 1 / 20;   // 20Hz 被动只读快照广播，不干扰 120Hz 回滚输入通道

function spectatorHudAvail() {
  if (typeof currentScreen !== 'undefined' && currentScreen) return false;
  if (!M || M.phase === 'end' || M.mode === 'demo' || M.mode === 'train') return false;
  if (typeof FOREST !== 'undefined' && FOREST.on) return false;
  if (typeof WORLD !== 'undefined' && WORLD.on) return false;
  if (typeof NET !== 'undefined' && NET.spectating) return true;
  return !!(M.watchAi || (typeof isAiVsAi === 'function' && isAiVsAi()) || (typeof REPLAY !== 'undefined' && REPLAY.on) || (M.tournament && M.tournament.spectate));
}

function specHudSetFocus(idx) {
  SPEC_HUD.focusIdx = Number.isInteger(idx) && idx >= 0 ? idx : -1;
  SPEC_HUD.lastDraw = 0;
  specHudRender(true);
}

function specHudCycleFocus(dir = 1) {
  const active = allFighters().filter(f => !f.hidden && f.hp > 0);
  if (!active.length) { SPEC_HUD.focusIdx = -1; return -1; }
  const ids = [-1, ...active.map(f => f.idx)];
  const cur = ids.indexOf(SPEC_HUD.focusIdx);
  const next = ids[(cur + (dir >= 0 ? 1 : ids.length - 1)) % ids.length];
  specHudSetFocus(next);
  return next;
}

function specHudToggleClean() {
  SPEC_HUD.clean = !SPEC_HUD.clean;
  SPEC_HUD.lastDraw = 0;
  specHudRender(true);
  return SPEC_HUD.clean;
}

// 房主被动向只读观战者广播当前画面快照（绝不修改任何战斗或 ROLL 状态）
function specBroadcastTick(dt) {
  if (typeof p2pSpecCount !== 'function' || typeof p2pSpecBroadcast !== 'function') return 0;
  const count = p2pSpecCount();
  SPEC_HUD.liveSpecs = count;
  if (count <= 0) { SPEC_HUD.bcastAcc = 0; return 0; }
  SPEC_HUD.bcastAcc += Math.max(0, +dt || 0);
  if (SPEC_HUD.bcastAcc < SPEC_BCAST_INTERVAL) return 0;
  SPEC_HUD.bcastAcc = 0;
  if (typeof snapshot !== 'function' || !A || !B) return 0;
  const payload = {
    sys: 'spec_frame',
    snap: snapshot(),
    ch: [A.chIdx | 0, B.chIdx | 0],
    names: (typeof NET !== 'undefined' && NET.names) || {},
    specs: count,
    label: (M.tournament && M.tournament.label) ? M.tournament.label : ''
  };
  return p2pSpecBroadcast(payload);
}

function specOnLiveReady(msg) {
  if (typeof NET === 'undefined') return false;
  NET.spectating = true;
  NET.open = true;
  NET.role = 'spectator';
  NET.names = (msg && msg.names) || {};
  SPEC_HUD.liveSpecs = Math.max(1, +(msg && msg.specs) || 1);
  SPEC_HUD.liveTitle = (msg && msg.code) ? `${cvT('联机观战')} #${msg.code}` : cvT('联机观战');
  if (typeof ROLL !== 'undefined') ROLL.on = false;
  if (typeof initAudio === 'function') initAudio();
  const ch = (msg && Array.isArray(msg.ch) && msg.ch.length >= 2) ? msg.ch : [0, 1];
  if (typeof setChars === 'function') setChars(ch[0], ch[1]);
  M.mode = 'net';
  M.watchAi = true;
  M.phase = 'fight';
  if (typeof showScreen === 'function') showScreen(null);
  SPEC_HUD.focusIdx = -1;
  specHudRender(true);
  if (typeof toast === 'function') toast('已进入只读实时观战席');
  return true;
}

function specApplyLiveFrame(msg) {
  if (typeof NET === 'undefined' || !NET.spectating || !msg || !msg.snap) return false;
  if (typeof msg.specs === 'number') SPEC_HUD.liveSpecs = Math.max(1, msg.specs | 0);
  if (msg.label) SPEC_HUD.liveTitle = msg.label;
  if (Array.isArray(msg.ch) && msg.ch.length >= 2 && (A.chIdx !== msg.ch[0] || B.chIdx !== msg.ch[1])) {
    if (typeof setChars === 'function') setChars(msg.ch[0], msg.ch[1]);
  }
  if (typeof applySnapshot === 'function') applySnapshot(msg.snap, true);
  specHudRender(false);
  return true;
}

function specExitLive(reason) {
  SPEC_HUD.liveSpecs = 0;
  SPEC_HUD.liveTitle = '';
  SPEC_HUD.focusIdx = -1;
  SPEC_HUD.clean = false;
  if (typeof netReset === 'function') netReset();
  if (typeof toMenu === 'function') toMenu();
  if (reason && typeof toast === 'function') toast(reason);
  if (reason && typeof netStatus === 'function') netStatus(reason);
}

function specHudRender(force = false) {
  const el = $id('specHud');
  if (!el) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && nowMs - SPEC_HUD.lastDraw < 110) return;
  SPEC_HUD.lastDraw = nowMs;
  const active = allFighters().filter(f => !f.hidden);
  const titleEl = $id('specTitle'), countEl = $id('specCount'), pillsEl = $id('specFighters'), tickerEl = $id('specTicker'), cleanBtn = $id('specCleanBtn'), exitBtn = $id('specExitBtn');
  const isLiveNet = !!(typeof NET !== 'undefined' && NET.spectating);
  if (titleEl) {
    const tag = (isLiveNet && SPEC_HUD.liveTitle) ? SPEC_HUD.liveTitle
      : (M.tournament && M.tournament.label) ? M.tournament.label
      : (typeof REPLAY !== 'undefined' && REPLAY.on) ? cvT('回放观战')
      : cvT('实时观战');
    titleEl.textContent = tag;
  }
  if (countEl) {
    const sc = isLiveNet ? Math.max(1, SPEC_HUD.liveSpecs || 1) : (typeof p2pSpecCount === 'function' ? p2pSpecCount() : 0);
    countEl.classList.toggle('hidden', sc <= 0);
    if (sc > 0) countEl.textContent = `${sc} ${cvT('观战中')}`;
  }
  if (exitBtn) exitBtn.classList.toggle('hidden', !isLiveNet);
  if (cleanBtn) {
    cleanBtn.setAttribute('aria-pressed', String(SPEC_HUD.clean));
    cleanBtn.textContent = cvT(SPEC_HUD.clean ? '恢复完整界面' : '纯净直转');
  }
  el.classList.toggle('is-clean', !!SPEC_HUD.clean);
  if (pillsEl) {
    const autoBtn = `<button type="button" class="spec-pill${SPEC_HUD.focusIdx < 0 ? ' sel' : ''}" data-spec-focus="-1">${cvT('自动镜头')}</button>`;
    const fighterBtns = active.slice(0, 8).map(f => {
      const hpPct = Math.round(clamp(f.hp / Math.max(1, f.maxHp), 0, 1) * 100);
      const metPct = Math.round(clamp((f.meter || 0) / 100, 0, 1) * 100);
      const sel = SPEC_HUD.focusIdx === f.idx ? ' sel' : '';
      const ko = f.hp <= 0 ? ' is-ko' : '';
      return `<button type="button" class="spec-pill${sel}${ko}" data-spec-focus="${f.idx}"><b>${escapeHTML(cvT(f.look ? f.look.name : f.ch.name))}</b><span>${hpPct}% · ${metPct}气</span></button>`;
    }).join('');
    pillsEl.innerHTML = autoBtn + fighterBtns;
  }
  if (tickerEl) {
    if (SPEC_HUD.focusIdx < 0 && active.length >= 2) {
      const fmtSide = f => {
        const st = (M.combatStats && M.combatStats[f.idx]) || {};
        const gPct = Math.round(clamp((f.guard || 0) / Math.max(1, f.maxGuard || 100), 0, 1) * 100);
        const fn = cvT(f.look ? f.look.name : f.ch.name);
        return `${fn} (${cvT('架势')}${gPct}% · ${cvT('伤害')}${Math.round(+st.damage || 0)} · ${cvT('连击')}${+st.combo || 0})`;
      };
      tickerEl.textContent = `${fmtSide(active[0])}  VS  ${fmtSide(active[1])}`;
    } else {
      const focusF = SPEC_HUD.focusIdx >= 0 ? fighterByIdx(SPEC_HUD.focusIdx) : active[0];
      const st = M.combatStats && focusF ? (M.combatStats[focusF.idx] || {}) : {};
      const dmg = Math.round(+st.damage || 0), maxC = +st.combo || 0, brk = +st.breaks || 0;
      const gPct = focusF ? Math.round(clamp((focusF.guard || 0) / Math.max(1, focusF.maxGuard || 100), 0, 1) * 100) : 0;
      const fname = focusF ? cvT(focusF.look ? focusF.look.name : focusF.ch.name) : '—';
      tickerEl.textContent = `${fname} · ${cvT('架势')} ${gPct}% · ${cvT('伤害')} ${dmg} · ${cvT('最长连击')} ${maxC} · ${cvT('破防')} ${brk}`;
    }
  }
}

function specHudUpdate() {
  const el = $id('specHud');
  if (!el) return;
  const on = spectatorHudAvail();
  el.classList.toggle('hidden', !on);
  if (!on) {
    if (SPEC_HUD.focusIdx >= 0) SPEC_HUD.focusIdx = -1;
    if (SPEC_HUD.clean) SPEC_HUD.clean = false;
    return;
  }
  specHudRender(false);
}

if ($id('specHud')) {
  $id('specHud').addEventListener('click', e => {
    const btn = e.target.closest('[data-spec-focus]');
    if (btn) { specHudSetFocus(+btn.dataset.specFocus); return; }
    if (e.target.closest('#specCleanBtn')) { specHudToggleClean(); return; }
    if (e.target.closest('#specPrevBtn')) { specHudCycleFocus(-1); return; }
    if (e.target.closest('#specNextBtn')) { specHudCycleFocus(1); return; }
    if (e.target.closest('#specExitBtn')) { specExitLive('已退出实时观战'); return; }
  });
}

window.addEventListener('keydown', e => {
  if (!spectatorHudAvail() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'F2') { e.preventDefault(); specHudToggleClean(); }
  else if (e.code === 'BracketLeft') { e.preventDefault(); specHudCycleFocus(-1); }
  else if (e.code === 'BracketRight') { e.preventDefault(); specHudCycleFocus(1); }
});

// 2. 武林大会单败淘汰赛（支持 4 / 8 / 16 人签表、标准/随机种子、自动推进、本地/联机与可分享战绩码）
let TOUR = null;
let tourFormat = 'player';
let tourSize = 8;
let tourSeedMode = 'standard';
let tourAutoTimer = 0;
const TOUR_SIZES = [4, 8, 16];
const TOUR_ROUND_NAMES = ['八强赛', '半决赛', '总决赛'];

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
function tourB64UrlEncode(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += TOUR_B64[a >> 2] + TOUR_B64[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) out += TOUR_B64[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) out += TOUR_B64[c & 63];
  }
  return out;
}

function tourB64UrlDecode(b64) {
  const clean = String(b64 || '').replace(/[^A-Za-z0-9\-_]/g, '');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const v0 = TOUR_B64.indexOf(clean[i]);
    const v1 = i + 1 < clean.length ? TOUR_B64.indexOf(clean[i + 1]) : -1;
    const v2 = i + 2 < clean.length ? TOUR_B64.indexOf(clean[i + 2]) : -1;
    const v3 = i + 3 < clean.length ? TOUR_B64.indexOf(clean[i + 3]) : -1;
    if (v0 < 0 || v1 < 0) break;
    bytes.push((v0 << 2) | (v1 >> 4));
    if (v2 >= 0) bytes.push(((v1 & 15) << 4) | (v2 >> 2));
    if (v3 >= 0) bytes.push(((v2 & 3) << 6) | v3);
  }
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b0 = bytes[i++];
    if (b0 < 0x80) out += String.fromCharCode(b0);
    else if ((b0 & 0xe0) === 0xc0 && i < bytes.length) out += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if ((b0 & 0xf0) === 0xe0 && i + 1 < bytes.length) out += String.fromCharCode(((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else if ((b0 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
      const cp = ((b0 & 7) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      const u = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
    }
  }
  return out;
}

function tourStandings(tour = TOUR) {
  if (!tour || !Array.isArray(tour.entrants)) return [];
  const totalRounds = tour.rounds.length;
  const stats = tour.entrants.map(e => ({
    id: e.id,
    seed: e.seed,
    name: e.name,
    chIdx: e.chIdx,
    human: e.human,
    wins: 0,
    losses: 0,
    elimRound: -1,
    place: 0
  }));
  for (let r = 0; r < totalRounds; r++) {
    for (const b of tour.rounds[r]) {
      if (b.winner < 0) continue;
      const loser = b.winner === b.a ? b.b : b.a;
      if (stats[b.winner]) stats[b.winner].wins++;
      if (stats[loser]) {
        stats[loser].losses++;
        stats[loser].elimRound = r;
      }
    }
  }
  for (const s of stats) {
    if (tour.champion === s.id) s.place = 1;
    else if (s.elimRound >= 0) s.place = (1 << (totalRounds - 1 - s.elimRound)) + 1;
    else s.place = 0;
  }
  stats.sort((a, b) => {
    const pa = a.place || 999, pb = b.place || 999;
    if (a.place !== b.place) {
      if (a.place === 0 && b.place > 0) return -1;
      if (b.place === 0 && a.place > 0) return 1;
      return pa - pb;
    }
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.seed - b.seed;
  });
  let running = 1;
  for (let i = 0; i < stats.length; i++) {
    if (stats[i].place === 0) stats[i].place = running;
    running = i + 2;
  }
  return stats;
}

function tourEncodeCode(tour = TOUR) {
  if (!tour || !Array.isArray(tour.entrants)) return '';
  const payload = {
    v: 1,
    sz: tour.size,
    fm: tour.format,
    sm: tour.seedMode || 'standard',
    lv: tour.level || 'normal',
    en: tour.entrants.map(e => [e.chIdx, e.human, e.name]),
    h: tour.history.map(h => [h.round, h.idx, h.winner === h.b ? 1 : 0, (h.score && h.score[0]) || 0, (h.score && h.score[1]) || 0])
  };
  return 'RYTR1:' + tourB64UrlEncode(JSON.stringify(payload));
}

function tourDecodeCode(code) {
  const raw = String(code || '').trim();
  if (!raw.startsWith('RYTR1:')) return null;
  let d;
  try { d = JSON.parse(tourB64UrlDecode(raw.slice(6))); } catch (e) { return null; }
  if (!d || d.v !== 1 || !TOUR_SIZES.includes(d.sz) || !Array.isArray(d.en) || d.en.length !== d.sz) return null;
  const entrants = d.en.map((row, i) => ({
    id: i,
    seed: i + 1,
    chIdx: clamp((row[0] | 0), 0, Math.max(0, CHARS.length - 1)),
    human: clamp((row[1] | 0), 0, 2),
    name: String(row[2] || `侠客 #${i + 1}`).slice(0, 28)
  }));
  const roundCount = Math.round(Math.log2(d.sz));
  const r0Pairs = tourSeedPairs(d.sz);
  const rounds = [r0Pairs.map(([a, b], idx) => ({ round: 0, idx, a, b, winner: -1, score: null }))];
  for (let r = 1; r < roundCount; r++) {
    const cnt = d.sz >> (r + 1);
    rounds.push(Array.from({ length: cnt }, (_, idx) => ({ round: r, idx, a: -1, b: -1, winner: -1, score: null })));
  }
  const reconstructed = {
    id: `tour-imp-${Date.now().toString(36)}`,
    size: d.sz,
    format: ['player', 'local2', 'watch', 'watch8', 'online'].includes(d.fm) ? d.fm : 'player',
    seedMode: d.sm === 'random' ? 'random' : 'standard',
    level: ['easy', 'normal', 'hard', 'impossible', 'god'].includes(d.lv) ? d.lv : 'normal',
    autoAdvance: false,
    online: d.fm === 'online',
    entrants,
    rounds,
    champion: -1,
    rewardPaid: true,
    history: []
  };
  if (Array.isArray(d.h)) {
    for (const item of d.h) {
      if (!Array.isArray(item) || item.length < 3) continue;
      const r = item[0] | 0, m = item[1] | 0, ws = item[2] === 1 ? 1 : 0;
      const bout = reconstructed.rounds[r] && reconstructed.rounds[r][m];
      if (!bout || bout.a < 0 || bout.b < 0 || bout.winner >= 0) continue;
      const winId = ws === 0 ? bout.a : bout.b;
      bout.winner = winId;
      bout.score = [item[3] | 0, item[4] | 0];
      reconstructed.history.push({ round: r, idx: m, a: bout.a, b: bout.b, winner: winId, score: bout.score });
      if (r + 1 < reconstructed.rounds.length) {
        const nb = reconstructed.rounds[r + 1][Math.floor(m / 2)];
        if (m % 2 === 0) nb.a = winId; else nb.b = winId;
      } else {
        reconstructed.champion = winId;
      }
    }
  }
  return reconstructed;
}

function tourImportCode(code) {
  const parsed = tourDecodeCode(code);
  if (!parsed) return null;
  tourCancelAuto();
  TOUR = parsed;
  tourRender();
  return TOUR;
}

function tourFormatStandingsText(tour = TOUR) {
  if (!tour) return '';
  const rows = tourStandings(tour);
  const code = tourEncodeCode(tour);
  const lines = [`【刃影 · 武林大会 ${tour.size}强战绩榜】`];
  for (const r of rows) {
    lines.push(`#${r.place}  [种子${r.seed}] ${r.name}  (${r.wins}胜-${r.losses}负)`);
  }
  lines.push(`分享码：${code}`);
  return lines.join('\n');
}

function tourShareStandings() {
  if (!TOUR) return '';
  const text = tourFormatStandingsText(TOUR);
  const done = ok => {
    if (typeof toast === 'function') toast(ok ? '已复制战绩榜与分享码！' : '已生成赛果分享码');
  };
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
  } else {
    done(false);
  }
  return text;
}

function tourRender() {
  const tree = $id('tourTree'), sub = $id('tourSub'), heading = $id('tourHeading');
  const nextBtn = $id('tourNextBtn'), skipBtn = $id('tourSkipAiBtn'), autoBtn = $id('tourAutoBtn'), standingsEl = $id('tourStandings');
  if (!tree) return;
  if (!TOUR) {
    tree.innerHTML = `<p class="sub">${cvT('尚未开启武林大会赛程。')}</p>`;
    if (standingsEl) standingsEl.innerHTML = '';
    return;
  }
  const rNames = tourRoundNames(TOUR.size);
  const next = tourNextPending();
  const champ = TOUR.champion >= 0 ? TOUR.entrants[TOUR.champion] : null;
  if (heading) {
    heading.textContent = `${cvT(TOUR.online ? '联机武林大会' : '武林大会')} · ${TOUR.size}${cvT('强签表')}`;
  }
  if (sub) {
    const seedTag = cvT(TOUR.seedMode === 'random' ? '随机抽签' : '标准种子');
    sub.textContent = champ
      ? `${cvT('武林盟主诞生')}：${champ.name} · ${TOUR.size}${cvT('强')} · ${seedTag} · ${cvT(LV_NAME[TOUR.level] || TOUR.level)}`
      : `${TOUR.size}${cvT('强单败淘汰赛')} · ${seedTag} · ${cvT(LV_NAME[TOUR.level] || TOUR.level)} · ${cvT('待决场次')}：${next ? `${cvT(rNames[next.round])} #${next.idx + 1}` : '—'}`;
  }
  if (nextBtn) {
    nextBtn.disabled = !next;
    if (next) {
      const eA = TOUR.entrants[next.a], eB = TOUR.entrants[next.b];
      const isHuman = eA.human > 0 || eB.human > 0;
      nextBtn.textContent = cvT(isHuman ? '出战下一场' : '观战下一场');
    } else {
      nextBtn.textContent = cvT('赛事已结束');
    }
  }
  if (skipBtn) {
    const canSkip = !!(next && TOUR.entrants[next.a].human === 0 && TOUR.entrants[next.b].human === 0);
    skipBtn.disabled = !canSkip;
  }
  if (autoBtn) {
    autoBtn.setAttribute('aria-pressed', String(!!TOUR.autoAdvance));
    autoBtn.classList.toggle('sel', !!TOUR.autoAdvance);
    autoBtn.textContent = cvT(TOUR.autoAdvance ? '自动推进：开' : '自动推进：关');
  }
  tree.dataset.size = String(TOUR.size);
  const slotHtml = (id, bout) => {
    if (id < 0) return `<div class="tour-slot is-tbd"><span>${cvT('待定')}</span><b>—</b></div>`;
    const e = TOUR.entrants[id];
    const winCls = bout.winner === id ? ' is-win' : (bout.winner >= 0 ? ' is-lose' : '');
    const humCls = e.human > 0 ? ' is-human' : '';
    const sc = bout.score ? (id === bout.a ? bout.score[0] : bout.score[1]) : '';
    return `<div class="tour-slot${winCls}${humCls}"><span>#${e.seed} ${escapeHTML(e.name)}</span><b>${sc}</b></div>`;
  };
  const cols = TOUR.rounds.map((round, rIdx) => `
    <div class="tour-col">
      <h4>${cvT(rNames[rIdx] || '')}</h4>
      ${round.map(b => {
        const isNext = next && next.round === b.round && next.idx === b.idx;
        const canAct = b.winner < 0 && b.a >= 0 && b.b >= 0;
        const eA = b.a >= 0 ? TOUR.entrants[b.a] : null, eB = b.b >= 0 ? TOUR.entrants[b.b] : null;
        const aiOnly = canAct && eA && eB && eA.human === 0 && eB.human === 0;
        return `<div class="tour-match${isNext ? ' is-next' : ''}${b.winner >= 0 ? ' is-done' : ''}">
          ${slotHtml(b.a, b)}
          ${slotHtml(b.b, b)}
          ${canAct ? `<div class="tour-m-acts"><button type="button" class="go small" data-tour-play="${b.round}:${b.idx}">${cvT(aiOnly ? '观战' : '出战')}</button>${aiOnly ? `<button type="button" class="ghost small" data-tour-sim="${b.round}:${b.idx}">${cvT('快结')}</button>` : ''}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`).join('');
  const winsToCrown = Math.round(Math.log2(TOUR.size));
  const trophyCol = `<div class="tour-col tour-champ-col"><h4>${cvT('武林盟主')}</h4><div class="tour-champ-card${champ ? ' is-crowned' : ''}"><b>${champ ? escapeHTML(champ.name) : cvT('悬念待揭')}</b><span>${champ ? cvT('连胜折桂') : `${winsToCrown} ${cvT('战全胜登顶')}`}</span></div></div>`;
  tree.innerHTML = cols + trophyCol;

  if (standingsEl) {
    const rows = tourStandings(TOUR);
    standingsEl.innerHTML = `<div class="tour-st-head"><b>${cvT('实时排名榜')}</b><span>${TOUR.history.length} / ${TOUR.size - 1} ${cvT('场已完赛')}</span></div><div class="tour-st-grid">${rows.map(r => `<div class="tour-st-row${r.place === 1 && TOUR.champion >= 0 ? ' is-champ' : ''}${r.human > 0 ? ' is-human' : ''}"><em>#${r.place}</em><span>${escapeHTML(r.name)}</span><b>${r.wins}-${r.losses}</b></div>`).join('')}</div>`;
  }
}

if ($id('tourFormatSeg')) {
  $id('tourFormatSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-tfmt]');
    if (!b) return;
    tourFormat = b.dataset.tfmt;
    for (const x of $id('tourFormatSeg').querySelectorAll('button[data-tfmt]')) x.classList.toggle('sel', x === b);
    SFX.slice && SFX.slice();
  });
}
if ($id('tourSizeSeg')) {
  $id('tourSizeSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-tsize]');
    if (!b) return;
    const sz = +b.dataset.tsize;
    if (TOUR_SIZES.includes(sz)) tourSize = sz;
    for (const x of $id('tourSizeSeg').querySelectorAll('button[data-tsize]')) x.classList.toggle('sel', x === b);
    SFX.slice && SFX.slice();
  });
}
if ($id('tourSeedSeg')) {
  $id('tourSeedSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-tseed]');
    if (!b) return;
    tourSeedMode = b.dataset.tseed === 'random' ? 'random' : 'standard';
    for (const x of $id('tourSeedSeg').querySelectorAll('button[data-tseed]')) x.classList.toggle('sel', x === b);
    SFX.slice && SFX.slice();
  });
}
if ($id('tourStartBtn')) {
  $id('tourStartBtn').addEventListener('click', () => {
    tourCreate({
      format: tourFormat,
      size: tourSize,
      seedMode: tourSeedMode,
      level: pickLevel || 'normal',
      playerHero: typeof menuHeroPick === 'function' ? menuHeroPick() : 0
    });
    showScreen('tournament');
  });
}
if ($id('tourNextBtn')) {
  $id('tourNextBtn').addEventListener('click', () => {
    const next = tourNextPending();
    if (next) tourPlayMatch(next.round, next.idx);
  });
}
if ($id('tourSkipAiBtn')) {
  $id('tourSkipAiBtn').addEventListener('click', () => {
    const n = tourSimAllAi();
    if (n > 0 && typeof toast === 'function') toast(`已快速结算 ${n} 场 AI 对局`);
  });
}
if ($id('tourAutoBtn')) {
  $id('tourAutoBtn').addEventListener('click', () => {
    const on = tourToggleAuto();
    if (typeof toast === 'function') toast(on ? '已开启自动推进赛程' : '已关闭自动推进赛程');
  });
}
if ($id('tourShareBtn')) {
  $id('tourShareBtn').addEventListener('click', () => tourShareStandings());
}
if ($id('tourImportBtn')) {
  $id('tourImportBtn').addEventListener('click', () => {
    const box = $id('tourImportBox');
    if (box) { box.classList.toggle('hidden'); if (!box.classList.contains('hidden') && $id('tourImportIn')) $id('tourImportIn').focus(); }
  });
}
if ($id('tourImportApplyBtn')) {
  $id('tourImportApplyBtn').addEventListener('click', () => {
    const inp = $id('tourImportIn');
    if (!inp) return;
    const ok = tourImportCode(inp.value);
    if (ok) {
      inp.value = '';
      if ($id('tourImportBox')) $id('tourImportBox').classList.add('hidden');
      if (typeof toast === 'function') toast(`已导入 ${ok.size} 强武林大会战绩榜`);
    } else if (typeof toast === 'function') {
      toast('赛果分享码无效，请检查是否以 RYTR1: 开头');
    }
  });
}
if ($id('tourImportCancelBtn')) {
  $id('tourImportCancelBtn').addEventListener('click', () => {
    if ($id('tourImportBox')) $id('tourImportBox').classList.add('hidden');
  });
}
if ($id('tourResetBtn')) {
  $id('tourResetBtn').addEventListener('click', () => {
    tourCreate({
      format: TOUR ? TOUR.format : tourFormat,
      size: TOUR ? TOUR.size : tourSize,
      seedMode: TOUR ? TOUR.seedMode : tourSeedMode,
      autoAdvance: TOUR ? TOUR.autoAdvance : false,
      level: pickLevel || 'normal',
      playerHero: typeof menuHeroPick === 'function' ? menuHeroPick() : 0
    });
  });
}
if ($id('tourTree')) {
  $id('tourTree').addEventListener('click', e => {
    const play = e.target.closest('[data-tour-play]');
    if (play) { const [r, m] = play.dataset.tourPlay.split(':').map(Number); tourPlayMatch(r, m); return; }
    const sim = e.target.closest('[data-tour-sim]');
    if (sim) { const [r, m] = sim.dataset.tourSim.split(':').map(Number); tourSimMatch(r, m); }
  });
}
