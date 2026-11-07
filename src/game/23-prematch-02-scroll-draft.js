// ======================= 对局秘卷选择 =======================
// 本文件：对局秘卷选择（开打前每位侠客选一卷）：推荐、倒计时、锁定、联机两边同步。
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
    // Keep the other player's online slots empty so their client can choose them.
    const remoteHuman = online && side !== sides[0] && competitiveHumanSlots(state, mode, opts, side).includes(slot);
    if (!human && !remoteHuman && !state.selections[side][slot] && recommendations[side][slot]) preMatchSelect(state, side, slot, recommendations[side][slot]);
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
