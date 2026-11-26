// ======================= 实时观战 HUD 与八强武林大会赛程 (#56) =======================
// 1. Live Spectator HUD（纯渲染与镜头控制，不修改任何战斗逻辑或回滚状态）
const SPEC_HUD = { focusIdx: -1, clean: false, lastDraw: 0 };

function spectatorHudAvail() {
  if (typeof currentScreen !== 'undefined' && currentScreen) return false;
  if (!M || M.phase === 'end' || M.mode === 'demo' || M.mode === 'train') return false;
  if (typeof FOREST !== 'undefined' && FOREST.on) return false;
  if (typeof WORLD !== 'undefined' && WORLD.on) return false;
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

function specHudRender(force = false) {
  const el = $id('specHud');
  if (!el) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && nowMs - SPEC_HUD.lastDraw < 110) return;
  SPEC_HUD.lastDraw = nowMs;
  const active = allFighters().filter(f => !f.hidden);
  const titleEl = $id('specTitle'), pillsEl = $id('specFighters'), tickerEl = $id('specTicker'), cleanBtn = $id('specCleanBtn');
  if (titleEl) {
    const tag = (M.tournament && M.tournament.label) ? M.tournament.label : (typeof REPLAY !== 'undefined' && REPLAY.on) ? cvT('回放观战') : cvT('实时观战');
    titleEl.textContent = tag;
  }
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
    const focusF = SPEC_HUD.focusIdx >= 0 ? fighterByIdx(SPEC_HUD.focusIdx) : active[0];
    const st = M.combatStats && focusF ? (M.combatStats[focusF.idx] || {}) : {};
    const dmg = Math.round(+st.damage || 0), maxC = +st.combo || 0, brk = +st.breaks || 0;
    const gPct = focusF ? Math.round(clamp((focusF.guard || 0) / Math.max(1, focusF.maxGuard || 100), 0, 1) * 100) : 0;
    const fname = focusF ? cvT(focusF.look ? focusF.look.name : focusF.ch.name) : '—';
    tickerEl.textContent = `${fname} · ${cvT('架势')} ${gPct}% · ${cvT('伤害')} ${dmg} · ${cvT('最长连击')} ${maxC} · ${cvT('破防')} ${brk}`;
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
  });
}

window.addEventListener('keydown', e => {
  if (!spectatorHudAvail() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'F2') { e.preventDefault(); specHudToggleClean(); }
  else if (e.code === 'BracketLeft') { e.preventDefault(); specHudCycleFocus(-1); }
  else if (e.code === 'BracketRight') { e.preventDefault(); specHudCycleFocus(1); }
});

// 2. 八强单败淘汰武林大会（Local / AI-filled / Spectator Bracket Mode）
let TOUR = null;
let tourFormat = 'player';
const TOUR_ROUND_NAMES = ['八强赛', '半决赛', '总决赛'];

function tourSeededRng(seed) {
  let s = (Math.floor(+seed || Date.now()) >>> 0) || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tourCreate(opts = {}) {
  const format = ['player', 'local2', 'watch8'].includes(opts.format) ? opts.format : tourFormat || 'player';
  const level = ['easy', 'normal', 'hard', 'impossible', 'god'].includes(opts.level) ? opts.level : (typeof pickLevel === 'string' ? pickLevel : 'normal');
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
  if (format === 'player' || format === 'local2') take(p1Hero);
  if (format === 'local2') {
    const p2Hero = Number.isInteger(opts.p2Hero) && opts.p2Hero >= 0 && opts.p2Hero < CHARS.length && opts.p2Hero !== p1Hero
      ? opts.p2Hero : pool[Math.floor(rng() * pool.length)];
    take(p2Hero);
  }
  while (picked.length < 8 && pool.length) {
    const k = Math.floor(rng() * pool.length);
    take(pool[k]);
  }
  const entrants = picked.map((chIdx, i) => {
    const humanSlot = format === 'player' ? (i === 0 ? 1 : 0) : format === 'local2' ? (i === 0 ? 1 : i === 1 ? 2 : 0) : 0;
    const heroName = (CHARS[chIdx] || {}).name || '侠客';
    const label = humanSlot === 1 ? (format === 'local2' ? `1P · ${heroName}` : `${(typeof ACC !== 'undefined' && ACC.name) || '你'} · ${heroName}`)
      : humanSlot === 2 ? `2P · ${heroName}` : `AI · ${heroName}`;
    return { id: i, seed: i + 1, chIdx, human: humanSlot, name: label };
  });
  const qfPairs = [[0, 7], [3, 4], [1, 6], [2, 5]];
  const rounds = [
    qfPairs.map(([a, b], idx) => ({ round: 0, idx, a, b, winner: -1, score: null })),
    [0, 1].map(idx => ({ round: 1, idx, a: -1, b: -1, winner: -1, score: null })),
    [{ round: 2, idx: 0, a: -1, b: -1, winner: -1, score: null }]
  ];
  TOUR = { id: `tour-${Date.now().toString(36)}`, format, level, entrants, rounds, champion: -1, rewardPaid: false, history: [] };
  tourRender();
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

function tourReportResult(roundIdx, matchIdx, winnerSide, score = null) {
  if (!TOUR || !TOUR.rounds[roundIdx] || !TOUR.rounds[roundIdx][matchIdx]) return false;
  const bout = TOUR.rounds[roundIdx][matchIdx];
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
    if (!TOUR.rewardPaid && champ && champ.human > 0 && typeof PROF !== 'undefined') {
      TOUR.rewardPaid = true;
      PROF.ink = (PROF.ink || 0) + 200;
      if (typeof saveProfile === 'function') saveProfile();
      if (typeof toast === 'function') toast('武林大会夺魁！获得 +200 墨锭');
    }
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

function tourPlayMatch(roundIdx, matchIdx, spectate = false) {
  if (!TOUR || !TOUR.rounds[roundIdx] || !TOUR.rounds[roundIdx][matchIdx]) return false;
  const bout = TOUR.rounds[roundIdx][matchIdx];
  if (bout.winner >= 0 || bout.a < 0 || bout.b < 0) return false;
  const eA = TOUR.entrants[bout.a], eB = TOUR.entrants[bout.b];
  const bothHuman = !spectate && eA.human > 0 && eB.human > 0;
  const oneHuman = !spectate && ((eA.human > 0) !== (eB.human > 0));
  const aiWatch = spectate || (!bothHuman && !oneHuman);
  const label = `${cvT('武林大会')} · ${cvT(TOUR_ROUND_NAMES[roundIdx] || '淘汰赛')} #${matchIdx + 1}`;
  if (typeof initAudio === 'function') initAudio();
  paused = false;
  showScreen(null);
  const mode = bothHuman ? 'pvp' : 'cpu';
  startMatch(mode, TOUR.level, [eA.chIdx, eB.chIdx]);
  M.tournament = { round: roundIdx, match: matchIdx, spectate: aiWatch, label };
  if (aiWatch) {
    M.watchAi = true;
    A.ctrl = new AICtrl(TOUR.level);
    B.ctrl = new AICtrl(TOUR.level);
  } else if (oneHuman && eB.human > 0) {
    // Human is in slot B: swap control so human plays slot B or map human[0] to B
    A.ctrl = new AICtrl(TOUR.level);
    B.ctrl = human[0];
  }
  SPEC_HUD.focusIdx = -1;
  say(label, 1.5);
  return true;
}

function tourOnMatchEnd(w) {
  if (!TOUR || !M.tournament) return false;
  const { round, match } = M.tournament;
  const winnerSide = w === 1 ? 1 : 0;
  const score = [M.wins ? M.wins[0] : (winnerSide === 0 ? 2 : 0), M.wins ? M.wins[1] : (winnerSide === 1 ? 2 : 0)];
  M.tournament = null;
  tourReportResult(round, match, winnerSide, score);
  if (typeof scheduleEndScreen === 'function') scheduleEndScreen(() => showScreen('tournament'));
  else showScreen('tournament');
  return true;
}

function tourRender() {
  const tree = $id('tourTree'), sub = $id('tourSub'), nextBtn = $id('tourNextBtn'), skipBtn = $id('tourSkipAiBtn');
  if (!tree) return;
  if (!TOUR) {
    tree.innerHTML = `<p class="sub">${cvT('尚未开启武林大会赛程。')}</p>`;
    return;
  }
  const next = tourNextPending();
  const champ = TOUR.champion >= 0 ? TOUR.entrants[TOUR.champion] : null;
  if (sub) {
    sub.textContent = champ
      ? `${cvT('武林盟主诞生')}：${champ.name} · ${cvT(LV_NAME[TOUR.level] || TOUR.level)}`
      : `${cvT('八强单败淘汰赛')} · ${cvT(LV_NAME[TOUR.level] || TOUR.level)} · ${cvT('待决场次')}：${next ? `${cvT(TOUR_ROUND_NAMES[next.round])} #${next.idx + 1}` : '—'}`;
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
      <h4>${cvT(TOUR_ROUND_NAMES[rIdx] || '')}</h4>
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
  const trophyCol = `<div class="tour-col tour-champ-col"><h4>${cvT('武林盟主')}</h4><div class="tour-champ-card${champ ? ' is-crowned' : ''}"><b>${champ ? escapeHTML(champ.name) : cvT('悬念待揭')}</b><span>${champ ? cvT('八强连胜折桂') : cvT('三战全胜登顶')}</span></div></div>`;
  tree.innerHTML = cols + trophyCol;
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
if ($id('tourStartBtn')) {
  $id('tourStartBtn').addEventListener('click', () => {
    tourCreate({ format: tourFormat, level: pickLevel || 'normal', playerHero: typeof menuHeroPick === 'function' ? menuHeroPick() : 0 });
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
if ($id('tourResetBtn')) {
  $id('tourResetBtn').addEventListener('click', () => {
    tourCreate({ format: tourFormat, level: pickLevel || 'normal', playerHero: typeof menuHeroPick === 'function' ? menuHeroPick() : 0 });
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
