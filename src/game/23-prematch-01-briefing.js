// ======================= 赛前地图说明 =======================
// 本文件：开打前的赛前状态（选了谁）和山河异境的地图说明页。
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
