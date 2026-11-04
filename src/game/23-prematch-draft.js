// ======================= 赛前地图说明与点将台 =======================
function preMatchCreate(mapId, seed) {
  return { mapId: MAPS[mapId] ? mapId : null, seed: seed >>> 0, picks: [[], []], candidates: [[], []], recommendations: [[], []], selections: [[], []] };
}
function preMatchSetPicks(state, picks) {
  if (!state || !Array.isArray(picks) || picks.length !== 2) return false;
  const teams = picks.map(side => Array.isArray(side) ? side.slice() : [side]);
  if (teams.some(team => !team.length || team.some(i => !Number.isInteger(i) || !CHARS[i]))) return false;
  state.picks = teams;
  state.candidates = teams.map((team, side) => team.map((index, slot) =>
    scCompetitiveCandidates(CHARS[index].id, (state.seed + Math.imul(side + 1, 0x9e3779b9) + slot) >>> 0, 5).map(scroll => scroll.id)));
  state.recommendations = teams.map((team, side) => team.map((index, slot) => {
    const candidates = state.candidates[side][slot].map(id => SC_BY[id]).filter(Boolean);
    const recommended = getAuspiciousBuff(CHARS[index].id, state.mapId, candidates);
    return recommended ? recommended.id : null;
  }));
  state.selections = teams.map(team => team.map(() => null));
  return true;
}
function preMatchSelect(state, side, slot, scrollId) {
  if (!state || !Number.isInteger(side) || !Number.isInteger(slot) || !state.candidates[side] ||
      !state.candidates[side][slot] || !state.candidates[side][slot].includes(scrollId)) return false;
  state.selections[side][slot] = scrollId;
  return true;
}
let mapBriefingTimer = null;
const BP_BRIEFING_MODES = new Set(['cpu', 'cpuWatch', 'chaos', 'mayhem', 'maps', 'tag3', '2v2', 'net']);
function briefingMapId(mode, opts = {}) {
  if (MAPS[opts.mapId]) return opts.mapId;
  if (mode === 'net') {
    const seed = Number.isInteger(opts.matchSeed) ? opts.matchSeed : ((Math.random() * 0x7fffffff) | 0);
    opts.matchSeed = seed;
    const votes = netMapVotes();
    return Array.isArray(votes) ? mapPick(votes, mapSeedRand(seed)) : rollMap(seed);
  }
  if (mode === 'maps') return mapPick(mapVote ? [mapVote] : [], Math.random());
  if ((mode === 'tag3' || mode === '2v2') && MAPS[M.map]) return M.map;
  return rollMap();
}
function renderMapBriefing(mapId) {
  const map = MAPS[mapId];
  if (!map) return false;
  $id('mbTitle').textContent = cvT(map.n);
  $id('mbSub').textContent = cvT('山河风貌 · 战场通览');
  $id('mbTopoTag').textContent = cvT(map.n);
  $id('mbDesc').textContent = cvT(map.d);
  $id('mbFavGrid').innerHTML = Object.entries(map.fav || {}).filter(([id]) => CHAR_IDX[id] !== undefined).map(([id, desc]) => {
    const ch = CHARS[CHAR_IDX[id]];
    return `<div class="mb-fav-item"><span class="mb-fav-name">${escapeHTML(cvT(ch.name))}</span><span class="mb-fav-desc">${escapeHTML(cvT(desc))}</span></div>`;
  }).join('');
  return true;
}
function showMapBriefing(mapId, advance = null, remote = false) {
  if (!renderMapBriefing(mapId)) { if (advance) advance(); return; }
  if (mapBriefingTimer) { clearInterval(mapBriefingTimer); mapBriefingTimer = null; }
  showScreen('mapBriefing');
  const until = Date.now() + 15000;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(mapBriefingTimer); mapBriefingTimer = null;
    if (currentScreen !== 'mapBriefing') return;
    if (advance) advance();
    else if (remote) showScreen(null);
  };
  $id('mbContinueBtn').onclick = finish;
  $id('mbTimer').textContent = '15';
  $id('mbContinueBtn').focus();
  mapBriefingTimer = setInterval(() => {
    if (currentScreen !== 'mapBriefing') { clearInterval(mapBriefingTimer); mapBriefingTimer = null; return; }
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    $id('mbTimer').textContent = String(left);
    if (!left) finish();
  }, 250);
}
function skipInteractiveDraft() {
  return (typeof navigator !== 'undefined' && /node|jsdom/i.test(navigator.userAgent || '')) ||
    (typeof window !== 'undefined' && (window.RENYING_TEST || window.__RENYING_TEST__)) ||
    (typeof process !== 'undefined' && process.env && (process.env.NODE_TEST_CONTEXT || process.env.RENYING_TEST));
}
let competitiveDraft = null, competitiveDraftTimer = null, onlineCompetitiveDraft = null;
const COMPETITIVE_DRAFT_SECONDS = 7.5;
function competitiveRecommendations(state) {
  return state.picks.map((team, side) => team.map((_, slot) => {
    const ids = state.candidates[side][slot] || [];
    const saved = state.recommendations && state.recommendations[side] && state.recommendations[side][slot];
    return ids.includes(saved) ? saved : (getAuspiciousBuff(CHARS[state.picks[side][slot]].id, state.mapId, ids.map(id => SC_BY[id]).filter(Boolean)) || {}).id || ids[0] || null;
  }));
}
function competitiveScrollMap(state) {
  const out = { 0: {}, 1: {} };
  for (let side = 0; side < 2; side++) for (let slot = 0; slot < (state.picks[side] || []).length; slot++) {
    const hero = CHARS[state.picks[side][slot]], id = state.selections[side] && state.selections[side][slot];
    if (hero && id && (state.candidates[side][slot] || []).includes(id)) out[side][hero.id] = id;
  }
  return out;
}
function competitiveHumanSlots(state, mode, opts, side) {
  const n = (state.picks[side] || []).length;
  if (mode === 'net') return Array.from({ length: n }, (_, i) => i);
  if (opts.isWatch || mode === 'cpuWatch') return [];
  if (mode === '2v2') {
    if (opts.subMode === 'p_cc') return side === 0 ? [0] : [];
    if (opts.subMode === 'pp_pp') return Array.from({ length: n }, (_, i) => i);
    return side === 0 ? Array.from({ length: n }, (_, i) => i) : [];
  }
  return side === 0 ? Array.from({ length: n }, (_, i) => i) : [];
}
function competitiveReason(state, side, slot, id) {
  const s = SC_BY[id];
  const hero = CHARS[state.picks[side][slot]];
  const map = MAPS[state.mapId];
  const favored = getAuspiciousBuff(hero.id, state.mapId, (state.candidates[side][slot] || []).map(k => SC_BY[k]).filter(Boolean));
  if (s && s.h === hero.id) return cvT('侠客专属契合');
  if (favored && s && favored.id === s.id && map) return `${cvT('地形契合')} · ${cvT(map.n)}`;
  return cvT('武学契合');
}
function competitiveDraftRender() {
  const d = competitiveDraft;
  if (!d) return;
  const tabs = $id('bdTabs'), grid = $id('bdCardsGrid'), confirm = $id('bdConfirmBtn');
  const side = d.side, slot = d.activeSlot, heroIndex = d.state.picks[side][slot], hero = CHARS[heroIndex];
  tabs.innerHTML = d.humanSlots.map((i, n) => {
    const ch = CHARS[d.state.picks[side][i]], chosen = d.state.selections[side][i];
    return `<button type="button" class="bd-tab-btn${i === slot ? ' sel' : ''}" data-bd-slot="${i}" aria-pressed="${i === slot}">${n + 1}. ${escapeHTML(cvT(ch.name))}${chosen ? ' ✓' : ''}</button>`;
  }).join('');
  const ids = d.state.candidates[side][slot] || [];
  const rec = d.recommendations[side][slot];
  grid.innerHTML = ids.map((id, i) => {
    const s = SC_BY[id];
    if (!s) return '';
    const isTianshi = id === rec;
    const tianshiOdds = isTianshi ? (s.h === hero.id ? '92%' : '75%') : '';
    return `<button type="button" class="bd-card${id === d.selectedId ? ' sel' : ''}" data-bd-id="${escapeHTML(id)}" aria-pressed="${id === d.selectedId}">
      ${isTianshi ? `<span class="bd-tianshi-badge">${escapeHTML(cvT('【天时 · 契合】'))} <small style="opacity:0.85;font-size:10px;">${tianshiOdds}</small></span>` : ''}
      <span class="bd-card-key">${i + 1}</span><span class="bd-card-icon">${scIcon(s)}</span>
      <span class="bd-card-name">${escapeHTML(cvT(s.n))}</span><span class="bd-card-tag">${scTag(s)}</span>
      <span class="bd-card-desc">${escapeHTML(cvT(s.d))}</span></button>`;
  }).join('');
  $id('bdHeroIntro').textContent = `${cvT('为先锋挑选专属对局秘术，战斗中实时生效')} · ${cvT(hero.name)} · ${competitiveReason(d.state, side, slot, rec)}`;
  const waiting = d.online && d.doneLocal;
  const timerWrap = document.querySelector('.bd-timer-wrap');
  if (timerWrap) timerWrap.style.visibility = waiting ? 'hidden' : 'visible';
  $id('bdStatus').textContent = waiting ? cvT('密卷已锁定，等待对方完成选择…') : cvT('请选择一卷强化秘术');
  confirm.disabled = waiting || !ids.length;
  confirm.textContent = cvT(waiting ? '等待对方' : '确认密卷');
  for (const b of tabs.querySelectorAll('[data-bd-slot]')) b.onclick = () => competitiveDraftSetSlot(+b.dataset.bdSlot);
  for (const b of grid.querySelectorAll('[data-bd-id]')) b.onclick = () => { d.selectedId = b.dataset.bdId; competitiveDraftRender(); };
  confirm.onclick = () => competitiveDraftLock(false);
}
function competitiveDraftSetSlot(slot) {
  const d = competitiveDraft;
  if (!d || !d.humanSlots.includes(slot) || d.doneLocal) return;
  d.activeSlot = slot;
  const current = d.state.selections[d.side][slot];
  d.selectedId = current || d.recommendations[d.side][slot];
  d.slotUntil = Date.now() + COMPETITIVE_DRAFT_SECONDS * 1000;
  competitiveDraftRender();
}
function competitiveDraftLock(auto = false) {
  const d = competitiveDraft;
  if (!d || d.doneLocal || !d.humanSlots.includes(d.activeSlot)) return;
  const side = d.side, slot = d.activeSlot;
  const candidates = d.state.candidates[side][slot] || [];
  const id = candidates.includes(d.selectedId) ? d.selectedId : d.recommendations[side][slot];
  if (!id || !preMatchSelect(d.state, side, slot, id)) {
    competitiveDraftAdvance();
    return;
  }
  if (d.online && NET.role === 'client') send({ prematch: { type: 'select', side, slot, scrollId: id } });
  if (d.online && NET.role === 'host') competitiveDraftBroadcast();
  if (auto) SFX.slice(); else SFX.block();
  competitiveDraftAdvance();
}
function competitiveDraftAdvance() {
  const d = competitiveDraft;
  if (!d) return;
  const next = d.humanSlots.find(slot => !(d.state.selections[d.side] || [])[slot]);
  if (next !== undefined) return competitiveDraftSetSlot(next);
  d.doneLocal = true;
  d.selectedId = null;
  if (d.online && NET.role === 'host') competitiveDraftBroadcast();
  if (d.online && NET.role === 'client') {
    competitiveDraftRender();
    return;
  }
  if (!d.online) {
    competitiveDraftStopTimer();
    const cb = d.onComplete;
    const state = d.state;
    competitiveDraft = null;
    if (currentScreen === 'buffDraft') showScreen(null);   // 选完密卷就收起这一页，不然开打了还盖在场上
    if (cb) cb(state);
    return;
  }
  competitiveDraftRender();
  competitiveDraftMaybeFinishOnline();
}
function competitiveDraftStopTimer() {
  if (competitiveDraftTimer) { clearInterval(competitiveDraftTimer); competitiveDraftTimer = null; }
}
function competitiveDraftBroadcast() {
  if (!onlineCompetitiveDraft || NET.role !== 'host') return;
  send({ prematch: { type: 'state', state: onlineCompetitiveDraft.state } });
}
function competitiveDraftMaybeFinishOnline() {
  const d = onlineCompetitiveDraft;
  if (!d || d.finishing || NET.role !== 'host') return;
  const state = d.state;
  if (state.selections.some((side, s) => side.some((id, slot) => !id && (state.candidates[s][slot] || []).length))) return;
  d.finishing = true;
  competitiveDraftStopTimer();
  competitiveDraft = null; onlineCompetitiveDraft = null;
  if (currentScreen === 'buffDraft') showScreen(null);
  d.onComplete(state);
}
function competitiveDraftReceive(msg) {
  const d = onlineCompetitiveDraft;
  if (!msg || !d) return;
  if (msg.type === 'select' && NET.role === 'host' && !d.remoteResolved && !d.finishing && msg.side === 1 && Number.isInteger(msg.slot) &&
      preMatchSelect(d.state, 1, msg.slot, msg.scrollId)) {
    competitiveDraftBroadcast();
    if (competitiveDraft && competitiveDraft.side === 0) competitiveDraftRender();
    competitiveDraftMaybeFinishOnline();
    return;
  }
  if (msg.type === 'state' && NET.role === 'client' && msg.state && msg.state.seed === d.state.seed) {
    d.state = msg.state;
    if (competitiveDraft) {
      competitiveDraft.state = d.state;
      competitiveDraft.recommendations = d.state.recommendations || competitiveRecommendations(d.state);
      competitiveDraftRender();
    }
  }
}
function competitiveDraftStart(state, mode, opts, onComplete, online = false) {
  const recommendations = competitiveRecommendations(state);
  state.recommendations = recommendations;
  const sides = online ? [NET.role === 'host' ? 0 : 1] : [0, 1];
  for (let side = 0; side < 2; side++) for (let slot = 0; slot < state.picks[side].length; slot++) {
    const human = sides.includes(side) && competitiveHumanSlots(state, mode, opts, side).includes(slot);
    if (!human && !state.selections[side][slot] && recommendations[side][slot]) preMatchSelect(state, side, slot, recommendations[side][slot]);
  }
  if (skipInteractiveDraft()) {
    for (let side = 0; side < 2; side++) for (let slot = 0; slot < state.picks[side].length; slot++)
      if (!state.selections[side][slot] && recommendations[side][slot]) preMatchSelect(state, side, slot, recommendations[side][slot]);
    if ((!online || NET.role === 'host') && onComplete) onComplete(state);
    return;
  }
  if (online && NET.role === 'host') onlineCompetitiveDraft = { state, onComplete, remoteDeadline: Date.now() + COMPETITIVE_DRAFT_SECONDS * Math.max(1, state.picks[1].length), remoteResolved: false, finishing: false };
  const side = online ? (NET.role === 'host' ? 0 : 1) : 0;
  const humanSlots = competitiveHumanSlots(state, mode, opts, side).filter(i => !state.selections[side][i]);
  if (online && NET.role === 'host') send({ prematch: { type: 'start', state } });
  if (!humanSlots.length) {
    if (online && NET.role === 'host') competitiveDraftMaybeFinishOnline();
    else if (!online && onComplete) onComplete(state);
    return;
  }
  competitiveDraft = { state, mode, opts, side, humanSlots, activeSlot: humanSlots[0], selectedId: null, slotUntil: Date.now() + COMPETITIVE_DRAFT_SECONDS * 1000,
    doneLocal: false, online, onComplete: online ? null : onComplete, recommendations };
  competitiveDraft.selectedId = recommendations[side][competitiveDraft.activeSlot];
  showScreen('buffDraft');
  $id('bdTimerText').textContent = COMPETITIVE_DRAFT_SECONDS.toFixed(1);
  $id('bdTimerFg').style.strokeDashoffset = '0';
  competitiveDraftRender();
  competitiveDraftStopTimer();
  competitiveDraftTimer = setInterval(() => {
    const d = competitiveDraft;
    const now = Date.now();
    if (d && !d.doneLocal) {
      const left = Math.max(0, d.slotUntil - now);
      $id('bdTimerText').textContent = (left / 1000).toFixed(1);
      $id('bdTimerFg').style.strokeDashoffset = String(106.8 * (1 - left / (COMPETITIVE_DRAFT_SECONDS * 1000)));
      if (!left) competitiveDraftLock(true);
    }
    if (online && NET.role === 'host' && onlineCompetitiveDraft && !onlineCompetitiveDraft.remoteResolved) {
      const live = onlineCompetitiveDraft;
      if (!NET.open || now >= live.remoteDeadline) {
        live.remoteResolved = true;
        for (let i = 0; i < live.state.picks[1].length; i++) if (!live.state.selections[1][i] && live.state.recommendations[1][i]) preMatchSelect(live.state, 1, i, live.state.recommendations[1][i]);
        competitiveDraftBroadcast();
        competitiveDraftMaybeFinishOnline();
      }
    }
  }, 50);
  if (online && NET.role === 'host') competitiveDraftMaybeFinishOnline();
}
window.addEventListener('keydown', e => {
  if (currentScreen !== 'buffDraft' || !competitiveDraft || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^Digit[1-5]$/.test(e.code) || /^Numpad[1-5]$/.test(e.code)) {
    const i = Number(e.code.slice(-1)) - 1, id = (competitiveDraft.state.candidates[competitiveDraft.side][competitiveDraft.activeSlot] || [])[i];
    if (id) { e.preventDefault(); e.stopImmediatePropagation(); competitiveDraft.selectedId = id; competitiveDraftRender(); }
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
    e.preventDefault(); e.stopImmediatePropagation(); competitiveDraftLock(false);
  } else if (e.code === 'Tab' && competitiveDraft.humanSlots.length > 1) {
    e.preventDefault(); e.stopImmediatePropagation();
    const d = competitiveDraft, at = d.humanSlots.indexOf(d.activeSlot);
    competitiveDraftSetSlot(d.humanSlots[(at + (e.shiftKey ? d.humanSlots.length - 1 : 1)) % d.humanSlots.length]);
  }
}, true);
function bpStart(mode, customOpts = null) {
  currentPreMatch = null;
  customOpts = { ...(customOpts || {}) };
  if (BP_BRIEFING_MODES.has(mode) && !customOpts.mapBriefed && !skipInteractiveDraft()) {
    customOpts.mapId = briefingMapId(mode, customOpts);
    customOpts.mapBriefed = true;
    if (mode === 'net' && NET.role === 'host') send({ mbrief: { mapId: customOpts.mapId } });
    showMapBriefing(customOpts.mapId, () => {
      if (currentScreen === 'mapBriefing') bpStart(mode, customOpts);
    });
    return;
  }
  if (bpFinishTimer) { clearTimeout(bpFinishTimer); bpFinishTimer = null; }
  if (isLocalBp(mode)) netDropWaiting();
  watch2v2Bp = null;   // 进入任何常规禁选都先取消可能残留的 2v2 禁选
  ensurePortraits(); chatClear();
  bpMode = mode;
  bpCustomOpts = customOpts;
  // 顺序和每边选几个人都按模式表来（src/data/10-modes.js、11-bp-orders.js）
  const md = bpModeDef(mode);
  const squad = customOpts && customOpts.squadSize === 2 ? 2 : 3;
  const steps = BP_ORDERS[(md.squadBp && md.squadBp[squad]) || md.bp].map(st => st.slice());
  const bans = steps.some(st => st[1] === 'ban') ? [-1, -1] : [];
  const count = side => steps.filter(st => st[0] === side && st[1] === 'pick').length;
  const picks = md.team ? [count(0), count(1)].map(n => Array(n).fill(-1)) : [0, 1].filter(count).map(() => -1);

  BP = {
    step: 0,
    steps,
    bans,
    picks,
    t: BP_TIME,
    avail: [availList(), mode === 'net' ? (NET.peerAvail || null) : null]
  };
  BP.mapId = MAPS[customOpts.mapId] ? customOpts.mapId : briefingMapId(mode, customOpts);
  BP.matchSeed = Number.isInteger(customOpts.matchSeed) ? customOpts.matchSeed : null;
  if (['cpu', 'cpuWatch', 'chaos', 'mayhem', 'maps', 'tag3', '2v2'].includes(mode) || (mode === 'net' && !md.raid)) {
    BP.preMatch = preMatchCreate(BP.mapId, BP.matchSeed === null ? (Math.random() * 0x100000000) >>> 0 : BP.matchSeed >>> 0);
  }
  // Online map and scroll candidates share the match seed sent in the BP state.
  bpSel = -1; bpCpuT = BP_CPU_DELAY;
  showScreen('bp'); renderBP();
  if (mode === 'net') send({ bps: BP });
}
function bpValid(i) {
  if (!BP || BP.step >= bpSteps().length || i < 0 || i >= CHARS.length) return false;
  if (Array.isArray(BP.bans) && BP.bans.includes(i)) return false;
  const stepDef = bpSteps()[BP.step];
  if (!stepDef) return false;
  if (stepDef[1] === 'ban' && isMultiPickBP() && [...BP.picks[0], ...BP.picks[1]].includes(i)) return false;   // 已经选定的人不能禁
  if (stepDef[1] === 'pick') {
    if (isMultiPickBP()) {
      const allPicked = [...(BP.picks[0] || []), ...(BP.picks[1] || [])];
      if (allPicked.includes(i)) return false;
    } else if (Array.isArray(BP.picks) && BP.picks.includes(i)) {
      return false;
    }
  }
  if (stepDef[1] === 'pick') {
    const av = BP.avail && BP.avail[stepDef[0]];
    const currentBans = Array.isArray(BP.bans) ? BP.bans : [];
    const currentPicks = isMultiPickBP() ? [...(BP.picks[0] || []), ...(BP.picks[1] || [])] : (Array.isArray(BP.picks) ? BP.picks : []);
    if (av && av.length && av.some(k => !currentBans.includes(k) && !currentPicks.includes(k)) && !av.includes(i)) return false;
  }
  return true;
}
const bpValidList = () => CHARS.map((c, i) => i).filter(bpValid);   // 这一步还能点的角色
function bpApply(i) {
  if (!BP || BP.step >= bpSteps().length) return;
  if (!bpValid(i)) {
    const fallback = bpValidList()[0];
    if (fallback !== undefined) i = fallback;
    else return;
  }
  const [side, type] = bpSteps()[BP.step];
  if (type === 'ban') {
    BP.bans[side] = i;
  } else {
    if (isMultiPickBP()) {
      const slots = BP.picks[side];
      const emptyIdx = slots.findIndex(v => v < 0);
      if (emptyIdx >= 0) slots[emptyIdx] = i;
      else slots[slots.length - 1] = i;
    } else if (Array.isArray(BP.picks)) {
      BP.picks[side] = i;
    }
  }
  BP.step++; BP.t = BP_TIME; bpSel = -1; bpCpuT = BP_CPU_DELAY;
  if (BP.preMatch && BP.step >= bpSteps().length) preMatchSetPicks(BP.preMatch, BP.picks);
  if (type === 'ban') SFX.thud(); else { SFX.block(); }
  if (bpMode === 'net') send({ bps: BP });
  renderBP();
  if (BP.step >= bpSteps().length) {
    if (bpFinishTimer) clearTimeout(bpFinishTimer);
    bpFinishTimer = setTimeout(bpFinish, 1100);
  }
}
function bpFinish() {
  bpFinishTimer = null;
  if (currentScreen !== 'bp' || !BP || BP.step < bpSteps().length) return;
  showPop(null);
  const picks = JSON.parse(JSON.stringify(BP.picks));
  const bans = Array.isArray(BP.bans) ? BP.bans.filter(x => x >= 0) : [];
  const mode = bpMode;
  const opts = bpCustomOpts || {};
  const mapId = BP.mapId;   // 通览时定好的地图；联机开局也复用这个 id
  currentPreMatch = BP.preMatch || null;
  if (currentPreMatch && !currentPreMatch.candidates[0].length && !preMatchSetPicks(currentPreMatch, picks)) currentPreMatch = null;
  if ((mode === 'tag3' || mode === '2v2') && MAPS[mapId]) M.map = mapId;
  BP = null;
  bpCustomOpts = null;
  showScreen(null);
  MSTAT.maxcombo = 0; MSTAT.ults = 0;
  if (currentPreMatch && mode === 'net') {
    if (NET.role !== 'host') return; // The host starts the shared draft; the client waits for its authoritative state.
    const matchSeed = Number.isInteger(opts.matchSeed) ? opts.matchSeed : ((Math.random() * 0x7fffffff) | 0);
    const complete = state => {
      const competitiveScrolls = competitiveScrollMap(state);
      const is2v2Net = !!roomDef().four, raidNet = !!roomDef().raid;
      const duo = !is2v2Net && !raidNet && Array.isArray(picks[0]) ? picks : null;
      const flatCh = raidNet ? [picks[0][0], picks[0][0], picks[1][0], picks[0][1]]
        : is2v2Net && Array.isArray(picks[0]) ? [picks[0][0], picks[1][0], picks[0][1], picks[1][1]]
        : (duo ? [duo[0][0], duo[1][0]] : picks);
      const mv = netMapVotes(), mut = netTeamMutator();
      const start = { ch: flatCh, seed: matchSeed, duo, mv, map: mapId, mut, competitiveScrolls };
      send({ rstart: start });
      rollStart(flatCh, matchSeed, duo, mv, mapId, mut, competitiveScrolls);
    };
    onlineCompetitiveDraft = { state: currentPreMatch, onComplete: complete, remoteDeadline: Date.now() + COMPETITIVE_DRAFT_SECONDS * Math.max(1, currentPreMatch.picks[1].length), finishing: false };
    competitiveDraftStart(currentPreMatch, mode, opts, complete, true);
    return;
  }
  const launch = state => launchBpMatch(mode, opts, picks, bans, mapId, state);
  if (currentPreMatch) {
    competitiveDraftStart(currentPreMatch, mode, opts, launch, false);
    return;
  }
  launch(null);
}
function launchBpMatch(mode, opts, picks, bans, mapId, preMatch) {
  if (MAPS[mapId]) M.map = mapId;
  if (preMatch) {
    M.competitiveScrolls = competitiveScrollMap(preMatch);
    M.hasBuffs = Object.values(M.competitiveScrolls).some(team => Object.keys(team).length > 0);
  } else { M.hasBuffs = false; M.competitiveScrolls = null; }
  if (mode === 'cpu') {
    startMatch('cpu', opts.level || pickLevel, picks);
  } else if (mode === 'cpuWatch') {
    startMatch('cpu', opts.level || pickLevel || 'god', picks, true);
  } else if (mode === 'net') {
    if (NET.role === 'host') {
      const seed = Number.isInteger(opts.matchSeed) ? opts.matchSeed : ((Math.random() * 2147483647) | 0);
      const is2v2Net = !!roomDef().four, raidNet = !!roomDef().raid;
      const duo = !is2v2Net && !raidNet && Array.isArray(picks[0]) ? picks : null;
      // 同袍肉鸽：A 房主、C 好友、D 房主替电脑同袍选的；B 先放房主的人占位，开打时换成魔首
      const flatCh = raidNet ? [picks[0][0], picks[0][0], picks[1][0], picks[0][1]]
        : is2v2Net && Array.isArray(picks[0]) ? [picks[0][0], picks[1][0], picks[0][1], picks[1][1]]
        : (duo ? [duo[0][0], duo[1][0]] : picks);
      const mv = netMapVotes();   // 山河异境：两边的票（别的房间规则用不上）
      const mut = netTeamMutator();
      const competitiveScrolls = preMatch ? competitiveScrollMap(preMatch) : null;
      send({ rstart: duo ? { ch: flatCh, seed, duo, mv, map: mapId, mut, competitiveScrolls } : { ch: flatCh, seed, mv, map: mapId, mut, competitiveScrolls } });
      rollStart(flatCh, seed, duo, mv, mapId, mut, competitiveScrolls);
    }
  } else if (mode === 'chaos') {
    startChaos(picks[0], picks[1], opts.level || pickLevel, !!opts.isWatch);
  } else if (mode === 'mayhem') {
    startMayhem(picks[0], picks[1], opts.level || pickLevel, !!opts.isWatch);
  } else if (mode === 'maps') {
    startMapsMode(picks[0], picks[1], opts.level || pickLevel, !!opts.isWatch, mapId);
  } else if (mode === 'tag3') {
    startTag3Match(picks[0], picks[1], opts.level || pickLevel, !!opts.isWatch);
    M.bans = bans;
  } else if (mode === 'tower') {
    startTower(picks[0], !!opts.isWatch);
  } else if (mode === 'stage') {
    startStage(opts.stageCh !== undefined ? opts.stageCh : stageCh, opts.stageL !== undefined ? opts.stageL : (STAGE ? STAGE.l : 1), !!opts.isWatch, picks[0]);
  } else if (mode === 'train') {
    trainChar = picks[0];
    startTraining('dummy', !!opts.isWatch);   // 点将台里的「木人试剑」只会是木人桩，专项训练在 startTrainTarget 里直接去对应模式的点将台
  } else if (mode === 'world') {
    worldStart(picks[0]);
  } else if (mode === 'raid') {
    startRaidMatch(picks[0], opts.squadSize || (picks[0] ? picks[0].length : 3), opts);
  } else if (mode === '2v2') {
    if (opts.subMode === 'pp_pp') start2v2LocalVs(picks[0][0], picks[0][1], picks[1][0], picks[1][1]);
    else start2v2LocalCoop(picks[0][0], picks[0][1], picks[1][0], picks[1][1], opts.level || 'normal', opts.subMode === 'p_cc');
    M.bans = bans;
  }
  applySkins();
}
// 电脑选人：禁掉一个随机角色；选人时六成概率挑能克制你的角色
function bpCpuChoice() {
  const valid = bpValidList();
  if (!valid.length) {
    // 终极保底：任何未禁未选的角色
    for (let i = 0; i < CHARS.length; i++) {
      if (bpValid(i)) return i;
    }
    return 0;
  }
  if (pickLevel === 'adaptive') {
    const fav = adaptFav(), type = bpSteps()[BP.step][1];
    if (type === 'ban' && fav.best >= 0 && valid.includes(fav.best)) return fav.best;       // 禁你胜率最高的
    if (type === 'pick' && fav.most >= 0 && valid.includes(fav.most)) return fav.most;      // 用你最常用的
  }
  if (bpSteps()[BP.step][1] === 'pick') {
    let enemyHero = -1;
    if (Array.isArray(BP.picks)) {
      if (typeof BP.picks[0] === 'number' && BP.picks[0] >= 0) enemyHero = BP.picks[0];
      else if (Array.isArray(BP.picks[0]) && BP.picks[0].length) enemyHero = BP.picks[0][0];
    }
    if (enemyHero >= 0 && Math.random() < 0.6) {
      const mine = CHARS[enemyHero] && CHARS[enemyHero].id;
      if (mine) {
        const counters = valid.filter(i => CHARS[i] && CHARS[i].beats && CHARS[i].beats.includes(mine));
        if (counters.length) return counters[Math.random() * counters.length | 0];
      }
    }
  }
  return valid[Math.random() * valid.length | 0];
}
function bpTick(dt) {
  if (bpMode === 'watch2v2') { bpTickWatch2v2(dt); return; }
  if (!BP || BP.step >= bpSteps().length || !document.getElementById('bp').classList.contains('on') || NET.hold) return;
  BP.t = Math.max(0, BP.t - dt);
  document.getElementById('bpTime').textContent = `${Math.ceil(BP.t)} 秒`;
  document.getElementById('bpTime').classList.toggle('urgent', BP.t <= 8);
  if (!bpAuth()) return;
  const side = bpSteps()[BP.step][0];
  const isWatch = bpMode === 'cpuWatch' || (bpCustomOpts && bpCustomOpts.isWatch);
  const isCpuTurn = isWatch || !isMyTurnBP();
  if (isCpuTurn && bpMode !== 'net' && !isLocalBothHumanBP()) {
    bpCpuT -= dt;
    if (bpCpuT <= 0 || BP.t <= 0) {
      const choice = bpCpuChoice();
      bpApply(choice);
    }
    return;
  }
  if (BP.t <= 0) {
    const v = bpValidList();
    const chosen = bpSel >= 0 && bpValid(bpSel) && isMyTurnBP() ? bpSel : (v.length ? v[Math.random() * v.length | 0] : 0);
    bpApply(chosen);
  }
}
function bpDetailHTML(i) {
  if (i < 0) return '<p style="color:var(--dim);grid-column:1/-1;margin:0">把鼠标移到角色上，可查看招式与克制关系。</p>';
  const c = CHARS[i], S = SKILLS[c.skill], U = ULTS[c.ult];
  const curSkin = mySkin(c.id);
  const L = skinLook(i, curSkin);
  const col = `rgb(${L.slash})`;
  const nm = ids => (ids || []).map(id => (CHARS[CHAR_IDX[id]] ? CHARS[CHAR_IDX[id]].name : id)).filter(Boolean).join('、') || '无';
  const restr = HERO_RESTRAINTS_EXPLAIN[c.id];
  const restrHtml = restr
    ? `<div class="bp-restr-box" style="margin-top:6px;font-size:12px;line-height:1.45;color:var(--dim);text-align:left"><div style="color:#7fe0b0;margin-bottom:2px">${restr.beatsWhy}</div><div style="color:#ff8a8a">${restr.weakWhy}</div></div>`
    : `<p class="ctr">克制 <b>${nm(c.beats)}</b>　怕 <b>${nm(c.weakTo)}</b></p>`;
  const st = c.stat || {};
  const guardTxt = `耐力 ${st.guardMax || 100} · 稳定 ${Math.round((st.guardStab || 1) * 100)}% · 透伤 ${Math.round((st.guardChip || 0.1) * 100)}% · 回涌 ${st.guardRegen || 28}/秒`;
  const hits = HERO_HIT_DETAILS[c.id] || {};
  const comboFlow = hits.light ? `<span>${hits.light.name}</span>（<span>${hits.light.badge || '连击'}</span>） · <span>蓄力</span>：<span>${hits.charge ? hits.charge.name : '蓄力重斩'}</span>` : '';   // 每段单独一个节点，英文界面才能逐段查表
  const S2 = SKILLS[c.skill2];
  const specialMove = S2 ? `<span>${S2.name}</span> · <span>${S2.desc || ''}</span>` : '';

  return `<img src="${PORTRAITS[i] || makePortrait(i)}" alt="" style="border:1px solid ${col};border-radius:6px">
    <div><h3 style="color:${col};display:flex;align-items:center;gap:8px;margin:0 0 4px">${c.name}${curSkin ? `<span class="pill" style="font-size:12px;color:${col};border-color:${col}">皮肤 · ${SKINS[curSkin].name}</span>` : ''}</h3>
    <!-- 皮肤改在角色图鉴里装配：选人是有时限的，这里只显示当前装束 -->
    <div class="meta"><span>${c.role}</span><span>难度 ${'★'.repeat(c.diff)}${'☆'.repeat(3 - c.diff)}</span><span>生命 ${Math.round((st.hp || 850) * ((BAL[c.id] || {}).hp || 1))}</span><span>体量 ${(st.weight || 1).toFixed(2)}</span><span>移速 ${(st.walk || 1).toFixed(2)}</span></div>
    ${bpFav(c) ? `<div class="bp-fav"><b>本局地利</b> <span>${bpFav(c)}</span></div>` : ''}
    <dl><dt><span>被动</span> <span>${c.passiveName}</span></dt><dd>${c.passiveDesc}</dd>
    <dt>门派架势</dt><dd>${guardTxt}</dd>
    ${comboFlow ? `<dt>连招流向</dt><dd>${comboFlow}</dd>` : ''}
    <dt><span>技能</span> <span>${S.name}</span></dt><dd><span>${S.desc}</span><span>（冷却 ${S.cd} 秒）</span></dd>
    ${specialMove ? `<dt><span>绝技</span> <span>${S2.name}</span></dt><dd>${specialMove}</dd>` : ''}
    <dt><span>大招</span> <span>${U.name}</span></dt><dd><span>${U.desc}</span><div style="margin-top:2px;font-size:12px;color:#ffe8a3">${HERO_METER_EXPLAIN[c.id] || ''}</div></dd>${ADV[c.id] ? `<dt>进阶</dt><dd>${ADV[c.id]}</dd>` : ''}</dl>
    ${restrHtml}</div>`;
}
function buildDetails(force) {
  const box = document.getElementById('bpDetail'), mk = (bpMap() || {}).n || '';   // 换了地图，地利那一行跟着变
  if (!force && box.dataset.built === String(PORTRAITS.length) && box.dataset.map === mk) return;
  box.innerHTML = [-1, ...CHARS.map((c, i) => i)].map(i => `<div class="bpd" data-i="${i}">${bpDetailHTML(i)}</div>`).join('');
  box.dataset.built = String(PORTRAITS.length); box.dataset.map = mk;
}
// 山河异境与常规对决的点将台：这局的地图
const bpMap = () => (BP && MAPS[BP.mapId] && MAPS[BP.mapId]) || null;
const bpFav = c => { const mp = bpMap(); return (mp && mp.fav && mp.fav[c.id]) || ''; };
function bpMapBanner() {
  const box = $id('bpMap'), mp = bpMap();
  if (!box) return;
  box.classList.toggle('hidden', !mp); if (box.parentElement) box.parentElement.classList.toggle('has-map', !!mp);
  if (!mp || box.dataset.map === mp.n) return;
  box.dataset.map = mp.n;
  const fav = Object.keys(mp.fav || {}).filter(id => CHAR_IDX[id] !== undefined).map(id => `<span>${escapeHTML(cvT(CHARS[CHAR_IDX[id]].name))}</span>`).join(' · ');
  box.innerHTML = `<span class="bpm-n">${mp.n}</span><span class="bpm-d">${mp.d}</span>`
    + (fav ? `<span class="bpm-f"><span>地利侠客</span> ${fav}</span>` : '');
}
let bpDeckMove = 'light';
function updateBPDeck(i) {
  const idx = i >= 0 ? i : (bpSel >= 0 ? bpSel : 0);
  const ch = CHARS[idx];
  if (!ch) return;
  const curSkin = mySkin(ch.id);
  const L = skinLook(idx, curSkin);
  const col = `rgb(${L.slash})`;
  const mTypes = HERO_MOVE_TYPES[ch.id] || {};
  const qType = mTypes.skill || { label: '技能', type: 'melee' };
  const rType = mTypes.ranged || { label: '远程', type: 'ranged' };
  const tabs = [
    { k: 'light', lab: '普攻连击 [近战]' },
    { k: 'charge', lab: '蓄力重斩 [近战]' },
    { k: 'skill', lab: `Q · ${SKILLS[ch.skill].name} [${qType.label}]` },
    { k: 'ranged', lab: `R · ${SKILLS[ch.skill2].name} [${rType.label}]` },
    { k: 'ult', lab: `E · ${ULTS[ch.ult].name}` },
  ];
  const tabsEl = $id('bpDeckTabs');
  if (tabsEl) {
    tabsEl.innerHTML = tabs.map(t => `<button class="${t.k === bpDeckMove ? 'sel' : ''}" data-m="${t.k}">${t.lab}</button>`).join('');
    requestAnimationFrame(() => tabsEl.classList.toggle('overflowing', tabsEl.scrollWidth > tabsEl.clientWidth + 2));
  }
  const hit = (HERO_HIT_DETAILS[ch.id] && HERO_HIT_DETAILS[ch.id][bpDeckMove]) || { name: '', badge: '', badgeCls: 'badge-buff', dmg: '', desc: '' };
  const curType = mTypes[bpDeckMove] || { label: '近战', type: 'melee' };
  const nameEl = $id('bpdHitName');
  if (nameEl) {
    nameEl.innerHTML = `<span style="color:${col}">${hit.name}</span> <span class="type-tag ${curType.type || 'melee'}">${curType.label}</span>${hit.dmg ? ` <span style="font-size:12px;color:var(--gold);font-weight:600">· 伤害 ${hit.dmg}</span>` : ''}`;
  }
  const badgeEl = $id('bpdHitBadge');
  if (badgeEl) {
    badgeEl.innerHTML = hit.badge ? `<span class="${hit.badgeCls}">${hit.badge}</span>` : '';
  }
  const descEl = $id('bpdHitDesc');
  if (descEl) {
    descEl.textContent = hit.desc;
  }
}

const bpDeckTabsEl = $id('bpDeckTabs');
if (bpDeckTabsEl) {
  bpDeckTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    bpDeckMove = b.dataset.m;
    const idx = bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0);
    updateBPDeck(idx);
    const cv = $id('bpDeckCanvas');
    if (cv && cv._pup && HERO_MOVE_SEQS[CHARS[idx].id] && HERO_MOVE_SEQS[CHARS[idx].id][bpDeckMove]) {
      cv._pup.playSeq(HERO_MOVE_SEQS[CHARS[idx].id][bpDeckMove], null, true);
    }
    SFX.slice();
  });
}
demoLoop($id('bpDeckCanvas'), () => (bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0)), () => $id('bp') && $id('bp').classList.contains('on'), () => mySkin(CHARS[(bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0))].id), () => bpDeckMove);

const bpDetailEl = $id('bpDetail');
if (bpDetailEl) {
  bpDetailEl.addEventListener('click', e => {
    const b = e.target.closest('.bp-skin-btn');
    if (!b) return;
    const idx = +b.dataset.i;
    const sk = b.dataset.sk || '';
    const ch = CHARS[idx];
    if (!ch) return;
    const has = skinOwned(sk);
    if (!has) {
      SFX.slice();
      toast('尚未解锁该皮肤');
      return;
    }
    PROF.equip = PROF.equip || {};
    PROF.equip[ch.id] = sk;
    try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (err) {}
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    PORTRAITS.length = 0;
    ensurePortraits();
    applyProfile(PROF);
    buildDetails(true);
    setDetail(idx);
    updateBPDeck(idx);
    renderBP();
    if (M.mode === 'net' || bpMode === 'net') {
      send({ pskin: mySkinMap() });
    }
    const cv = $id('bpDeckCanvas');
    if (cv && cv._pup) {
      cv._pup = new Puppet(idx, sk);
      if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][bpDeckMove]) {
        cv._pup.playSeq(HERO_MOVE_SEQS[ch.id][bpDeckMove], null, true);
      }
    }
    SFX.slice();
    toast(sk ? `已装配「${SKINS[sk].name}」` : '已换回原本装束');
  });
}

function setDetail(i) {
  buildDetails();
  for (const el of document.querySelectorAll('#bpDetail .bpd')) el.classList.toggle('show', +el.dataset.i === i);
  updateBPDeck(i);
}

function renderBP() {
  // 2v2 专属天道演武禁选走独立状态与独立渲染
  bpMapBanner();
  if (bpMode === 'watch2v2') { if (watch2v2Bp) renderBPWatch2v2(); return; }
  if (!BP) return;
  $id('bpChat').classList.toggle('hidden', bpMode !== 'net');
  const my = bpMySide(), done = BP.step >= bpSteps().length;
  const [side, type] = done ? [-1, ''] : bpSteps()[BP.step];
  const isWatch = bpMode === 'cpuWatch' || (bpCustomOpts && bpCustomOpts.isWatch);
  const myTurn = !done && isMyTurnBP();
  const multiPick = isMultiPickBP();
  const hasBans = bpSteps().some(x => x[1] === 'ban');

  let modePrefix = '';
  if (bpMode === 'net' && NET.isRanked) modePrefix = '排位赛 · ';
  else if (bpMode === 'net' && roomDef().four) modePrefix = '联机2v2 · ';
  else if (bpMode === 'cpu' || bpMode === 'cpuWatch') modePrefix = '论剑点将 · ';
  else if (bpMode === 'chaos') modePrefix = '天机乱斗 · ';
  else if (bpMode === 'maps') modePrefix = '山河异境 · ';
  else if (bpMode === 'mayhem') modePrefix = '通天神决 · ';
  else if (bpMode === 'tag3') modePrefix = '3v3车轮 · ';
  else if (bpMode === 'tower') modePrefix = '问剑密卷 · ';
  else if (bpMode === 'stage') modePrefix = '守关挑战 · ';
  else if (bpMode === 'train') modePrefix = '木人试剑 · ';
  else if (bpMode === '2v2') modePrefix = '2v2演武 · ';
  else if (bpMode === 'raid') modePrefix = '同袍肉鸽 · ';
  else if (bpMode === 'world') modePrefix = '江湖共斗 · ';

  const TAG3_ROLES = ['先锋', '中坚', '大将'];
  const TEAM2_ROLES = ['先锋', '次锋'];

  const isTag3BP = bpMode === 'tag3' || !!(multiPick && BP.picks[0] && BP.picks[0].length === 3);

  let stepTitle = '';
  if (done) {
    stepTitle = isWatch ? '点将完成 · 演武即将开战' : '点将完成 · 准备开战';
  } else if (type === 'ban') {
    stepTitle = `${bpSideName(side)}禁用一名侠客`;
  } else if (isTag3BP) {
    const idxNum = (BP.picks[side] || []).filter(x => x >= 0).length;
    stepTitle = `${bpSideName(side)}钦点【${TAG3_ROLES[idxNum] || '大将'}】出战`;
  } else if (multiPick) {
    const idxNum = (BP.picks[side] || []).filter(x => x >= 0).length;
    stepTitle = `${bpSideName(side)}钦点【${TEAM2_ROLES[idxNum] || '次锋'}】出战`;
  } else if (bpMode === 'tower' || bpMode === 'stage' || bpMode === 'train' || bpMode === 'world') {
    stepTitle = '挑选你的本命首发出战侠客（免禁用直选）';
  } else {
    stepTitle = `${bpSideName(side)}选择出战侠客`;
  }

  // 模式名和这一步分开放，英文界面才能各自查表
  document.getElementById('bpStep').innerHTML = (modePrefix ? `<span>${modePrefix.slice(0, -3)}</span> · ` : '') + `<span>${stepTitle}</span>`
    + (done ? '' : `<span class="bpcount">第 ${BP.step + 1} / ${bpSteps().length} 步</span>`);
  document.getElementById('bpStep').style.color = myTurn ? '#e9c46a' : 'var(--ink)';
  document.getElementById('bpTime').textContent = done ? '' : `${Math.ceil(BP.t)} 秒`;

  // 左右双方席位槽位渲染
  for (const sd of [0, 1]) {
    const el = document.getElementById('bpS' + sd);
    if (!el) continue;
    const keep = [...el.querySelectorAll('.bubble')];
    const banSlotHtml = hasBans
      ? (() => {
          const bIdx = Array.isArray(BP.bans) ? BP.bans[sd] : -1;
          const bActive = !done && side === sd && type === 'ban';
          return `<div class="slot2 ban${bActive ? ' on' : ''}">${bIdx >= 0 ? `<img src="${PORTRAITS[bIdx] || ''}" alt=""><span class="lab">禁 ${CHARS[bIdx].name}</span>` : '禁用'}</div>`;
        })()
      : '';
    if (bpMode === 'raid' && sd === 1) {
      const rb = typeof pendingRaidBoss !== 'undefined' && pendingRaidBoss ? pendingRaidBoss : null;
      const bossTitle = rb ? `六技魔首：${rb.heroNames.join('·')}` : '三侠六技·融魂魔首';
      el.innerHTML = `<div class="who" style="color:var(--p2)">秘境魔首 (3xHP · 1.25x伤)</div>
        <div class="slots"><div class="slot2">${bossTitle}</div></div>`;
    } else if (bpMode === 'tower' || bpMode === 'stage' || bpMode === 'train' || bpMode === 'world') {
      if (sd === 1) {
        // 单人模式右侧显示对位/关卡信息
        let rightInfo = '木人桩试剑';
        if (bpMode === 'tower') rightInfo = '万仞剑阁守关者';
        else if (bpMode === 'stage') rightInfo = (STAGE && STAGE.C ? STAGE.C.name : '守关宗师');
        el.innerHTML = `<div class="who" style="color:var(--p2)">敌阵挑战</div>
          <div class="slots"><div class="slot2">${rightInfo}</div></div>`;
      } else {
        const pIdx = Array.isArray(BP.picks) ? BP.picks[0] : -1;
        const slot = `<div class="slot2 pick${!done ? ' on' : ''}">${pIdx >= 0 ? `<img src="${PORTRAITS[pIdx] || ''}" alt=""><span class="lab">${CHARS[pIdx].name}</span>` : '选择出战'}</div>`;
        el.innerHTML = `<div class="who" style="color:var(--p1)">出战大侠</div>
          <div class="slots">${slot}</div>`;
      }
    } else if (isTag3BP) {
      const picks = BP.picks[sd] || [-1, -1, -1];
      const slotsHtml = [0, 1, 2].map(slotIdx => {
        const idx = picks[slotIdx];
        const isActive = !done && side === sd && type === 'pick' && (BP.picks[sd].filter(x => x >= 0).length === slotIdx);
        return `<div class="slot2 pick${isActive ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${TAG3_ROLES[slotIdx]} ${CHARS[idx].name}</span>` : TAG3_ROLES[slotIdx]}</div>`;
      }).join('');
      const sideLabel = bpMode === 'tag3' ? `${escapeHTML(bpSideName(sd))}阵线` : escapeHTML(bpSideName(sd));
      el.innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${sideLabel}</div>
        <div class="slots">${banSlotHtml}${slotsHtml}</div>`;
    } else if (multiPick) {
      const picks = BP.picks[sd] || [-1, -1];
      const slotsHtml = [0, 1].map(slotIdx => {
        const idx = picks[slotIdx];
        const isActive = !done && side === sd && type === 'pick' && (BP.picks[sd].filter(x => x >= 0).length === slotIdx);
        return `<div class="slot2 pick${isActive ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${TEAM2_ROLES[slotIdx]} ${CHARS[idx].name}</span>` : TEAM2_ROLES[slotIdx]}</div>`;
      }).join('');
      el.innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${escapeHTML(bpSideName(sd))}</div>
        <div class="slots">${banSlotHtml}${slotsHtml}</div>`;
    } else {
      const slot = (idx, kind, active) => `<div class="slot2 ${kind}${active ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${kind === 'ban' ? '禁 ' : ''}${CHARS[idx].name}</span>` : (kind === 'ban' ? '禁用' : '选择')}</div>`;
      el.innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${escapeHTML(bpSideName(sd))}</div>
        <div class="slots">${banSlotHtml}${slot(BP.picks[sd], 'pick', !done && side === sd && type === 'pick')}</div>`;
    }
    for (const b of keep) el.appendChild(b);
  }

  const focusI = document.activeElement && document.activeElement.closest && document.activeElement.closest('#bpGrid .bpcard') ? +document.activeElement.dataset.i : -1;   // 重画后键盘选中框留在同一张卡上
  document.getElementById('bpGrid').innerHTML = CHARS.map((c, i) => {
    let banned = false, pickedBy = -1;
    if (Array.isArray(BP.bans)) banned = BP.bans.includes(i);
    if (multiPick) {
      if (BP.picks[0] && BP.picks[0].includes(i)) pickedBy = 0;
      else if (BP.picks[1] && BP.picks[1].includes(i)) pickedBy = 1;
    } else if (Array.isArray(BP.picks)) {
      pickedBy = BP.picks.indexOf(i);
    }
    const can = myTurn && bpValid(i);
    const myAv = BP.avail && BP.avail[my];
    const lock = !OFFLINE_BUILD && myAv && !myAv.includes(i);
    const free = !OFFLINE_BUILD && !heroesFree() && !ownsHero(c.id) && (PROF.rotation || []).includes(c.id);
    const fav = !!bpFav(c);   // 山河异境：这张图的地利侠客
    const tag = banned ? '<span class="tag">禁</span>' : pickedBy >= 0 ? `<span class="tag p">${escapeHTML(bpSideName(pickedBy))}</span>` : lock ? '<span class="tag lk">未拥有</span>' : free ? '<span class="tag free">限免</span>' : fav ? '<span class="tag fav">地利</span>' : '';
    const state = (banned ? '，已禁用' : pickedBy >= 0 ? '，已被选择' : lock ? '，未拥有' : free ? '，本周限免' : '') + (fav ? '，本局地利' : '');
    const aria = `${c.name}，${c.role}${state}${bpSel === i ? '，已选中' : ''}${can ? '' : '，当前不可选'}`;
    return `<button class="bpcard${lock ? ' lock' : ''}${banned ? ' banned' : ''}${pickedBy >= 0 ? ' picked' : ''}${bpSel === i ? ' sel' : ''}${fav ? ' fav' : ''}" data-i="${i}" aria-label="${aria}" ${can ? '' : 'aria-disabled="true"'}>
      <span class="bp-shortcut">${i + 1}</span>${tag}<img src="${PORTRAITS[i] || ''}" alt=""><div class="nm" style="color:rgb(${c.look.slash})">${c.name}</div><div class="rl">${c.role}</div></button>`;
  }).join('');
  if (focusI >= 0) { const fc = document.querySelector(`#bpGrid .bpcard[data-i="${focusI}"]`); if (fc) fc.focus({ preventScroll: true }); }
  const show = bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0);
  setDetail(show);
  const goB = document.getElementById('bpGo');
  if (isWatch) {
    goB.disabled = true;
    goB.textContent = done ? '即将开战 · 演武观战' : 'AI 演武禁选中…';
  } else {
    goB.disabled = !(myTurn && bpValid(bpSel));
    goB.textContent = myTurn ? (bpSel >= 0 ? `${type === 'ban' ? '禁用' : '选择'} ${CHARS[bpSel].name}` : (type === 'ban' ? '选一个禁用' : '选一个角色')) : (done ? '开战在即' : '等待对方');
  }
}
document.getElementById('bpGrid').addEventListener('click', e => {
  const b = e.target.closest('.bpcard'); if (!b || !BP || BP.step >= bpSteps().length) return;
  const i = +b.dataset.i;
  if (!isMyTurnBP() || !bpValid(i)) return;
  if (e.detail === 0 && bpSel === i) { bpConfirm(); return; }   // 键盘（Enter / 空格）对已选中的卡再按一次：确认
  bpSel = i; SFX.slice(); renderBP();
});
let lastCardClick = { i: -1, t: 0 };
document.getElementById('bpGrid').addEventListener('click', e => {
  const b = e.target.closest('.bpcard'); if (!b) return;
  const i = +b.dataset.i, now = performance.now();
  if (lastCardClick.i === i && now - lastCardClick.t < 400) {
    lastCardClick.i = -1;
    if (BP && BP.step < bpSteps().length && isMyTurnBP() && bpValid(i)) { bpSel = i; bpConfirm(); }
    return;
  }
  lastCardClick = { i, t: now };
});
document.getElementById('bpGrid').addEventListener('dblclick', e => {
  const b = e.target.closest('.bpcard'); if (!b || !BP || BP.step >= bpSteps().length) return;
  const i = +b.dataset.i;
  if (!isMyTurnBP() || !bpValid(i)) return;
  bpSel = i; bpConfirm();
});
// 数字键 1～9 直接选人；方向键移动由纯键盘导航（26-kbnav.js）统一处理。
// Enter / 空格：第一次选中这张卡，对已选中的卡再按一次就确认
document.getElementById('bpGrid').addEventListener('keydown', e => {
  if (!BP) return;   // 2v2 观战禁选没有玩家操作，按键不参与
  const k = e.key;
  const cards = [...document.querySelectorAll('#bpGrid .bpcard')];
  if (k >= '1' && k <= '9') {
    const pickNum = parseInt(k, 10) - 1;
    if (pickNum >= 0 && pickNum < CHARS.length && cards[pickNum]) {
      e.preventDefault();
      cards[pickNum].focus();
      if (isMyTurnBP() && bpValid(pickNum)) {
        bpSel = pickNum;
        SFX.slice();
        renderBP();
      }
      return;
    }
  }
});
// 悬停：更新下部检视视窗
let popIdx = -1;
function showPop(card) {
  const pop = $id('bpPop');
  if (!card) { if (pop) pop.classList.remove('on'); popIdx = -1; return; }
  const i = +card.dataset.i;
  popIdx = i;
  updateBPDeck(i);
  if (pop) pop.classList.remove('on');
}
demoLoop($id('bpPopCv'), () => popIdx, () => false);
document.getElementById('bpGrid').addEventListener('pointerover', e => {
  const b = e.target.closest('.bpcard'); const i = b ? +b.dataset.i : -1;
  if (i !== bpHover) { bpHover = i; setDetail(i >= 0 ? i : bpSel); showPop(b); }
});
document.getElementById('bpGrid').addEventListener('focusin', e => {   // 键盘移到哪张卡，下面就显示谁的招式（和鼠标悬停一样）
  const b = e.target.closest('.bpcard'); if (!b) return;
  const i = +b.dataset.i;
  if (i !== bpHover) { bpHover = i; setDetail(i); showPop(b); }
});
document.getElementById('bpGrid').addEventListener('pointerleave', () => { bpHover = -1; setDetail(bpSel); showPop(null); });
function bpConfirm() {
  if (!BP || BP.step >= bpSteps().length || !isMyTurnBP() || !bpValid(bpSel)) return;
  if (bpAuth()) bpApply(bpSel); else { send({ bp: bpSel }); document.getElementById('bpGo').disabled = true; }
}
document.getElementById('bpGo').addEventListener('click', bpConfirm);
document.getElementById('bpQuit').addEventListener('click', () => toMenu());
