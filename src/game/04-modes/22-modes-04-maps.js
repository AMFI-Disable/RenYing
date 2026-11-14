// 本文件：山河异境的地图投票界面和开局；另外几个模式卡上"观战"按钮的绑定也在这里。
// ---------- 山河异境：投票选地图（地图表在 src/data/12-maps.js）----------
// 本机：你的一票（再点一次收回）；联机：两边各一票，房主开局时把票随开局一起发过去（rollStart 按种子选图）
let mapsP1 = 0, mapsP2 = 1;
let mapVote = null;
try { const v = localStorage.getItem('renying-map-vote'); if (MAPS[v]) mapVote = v; } catch (e) {}
function setMapVote(id) {
  mapVote = MAPS[id] ? id : null;
  try { if (mapVote) localStorage.setItem('renying-map-vote', mapVote); else localStorage.removeItem('renying-map-vote'); } catch (e) {}
  updateMapChipsUI();
}
function updateMapChipsUI() {
  const badge = $id('mapVoteStatusBadge');
  if (badge) {
    badge.textContent = mapVote && MAPS[mapVote] ? `偏好：${MAPS[mapVote].n}` : '标准擂台';
  }
}
// 一排地图卡片：名字、说明、得票和概率。数字和中文分开放，界面翻成英文时各自翻
function mapVoteCards(box, votes, mine, onPick) {
  if (!box) return;
  const odds = mapOdds(votes);
  box.innerHTML = MAP_POOL.map((id, i) => {
    const n = votes.filter(v => v === id).length;
    return `<button type="button" class="map-card${mine === id ? ' sel' : ''}" data-map="${id}" aria-pressed="${mine === id}">`
      + `<span class="map-n">${MAPS[id].n}</span><span class="map-d">${MAPS[id].d}</span>`
      + `<span class="map-v"><span>得票</span> <b>${n}</b> · <span>概率</span> <b>${Math.round(odds[i] * 100)}%</b></span></button>`;
  }).join('');
  for (const b of box.querySelectorAll('button[data-map]')) b.onclick = () => { onPick(b.dataset.map); SFX.slice(); };
}
function renderMaps() {
  mapVoteCards($id('mapVote'), mapVote ? [mapVote] : [], mapVote, id => { setMapVote(mapVote === id ? null : id); renderMaps(); });
}
function startMapsMode(p1, p2, lv, isWatch = false, mapId) {
  initAudio();
  paused = false;
  mapsP1 = p1 !== undefined ? p1 : mapsP1;
  mapsP2 = p2 !== undefined ? p2 : mapsP2;
  M.mode = 'maps';
  M.level = lv || pickLevel;
  M.round = 1;
  M.wins = [0, 0];
  M.carry = null;
  M.stage = null;
  M.duo = null;
  M.watchAi = !!isWatch;
  M.map = MAP_POOL.includes(mapId) ? mapId : (MAP_POOL.includes(mapVote) ? mapVote : (M.map || rollMap()));
  setChars(mapsP1, mapsP2);
  A.ctrl = isWatch ? new AICtrl(M.level || 'god') : human[0];
  B.ctrl = new AICtrl(M.level || 'god');
  A.meter = B.meter = 0;
  human[0].clear(); human[1].clear();
  showScreen(null);
  REC.on = false; if (!isWatch) recBegin('loc');
  startRound();
  say('山河异境 · ' + MAPS[M.map].n, 1.4, 'big', MAPS[M.map].d);
}
const mapsStartBtn = document.getElementById('mapsStartBtn');
if (mapsStartBtn) mapsStartBtn.addEventListener('click', () => bpStart('maps', { level: pickLevel, isWatch: false }));
const mapsWatchBtn = document.getElementById('mapsWatchBtn');
if (mapsWatchBtn) mapsWatchBtn.addEventListener('click', () => bpStart('maps', { level: pickLevel || 'god', isWatch: true }));

const cpuWatchBtn = document.getElementById('cpuWatchBtn');
if (cpuWatchBtn) cpuWatchBtn.addEventListener('click', () => {
  initAudio();
  paused = false;
  if (mapVote) bpStart('maps', { level: pickLevel || 'god', isWatch: true });
  else bpStart('cpuWatch');
});

const tag3WatchBtn = document.getElementById('tag3WatchBtn');
if (tag3WatchBtn) tag3WatchBtn.addEventListener('click', () => {
  bpStart('tag3', { level: pickLevel || 'god', isWatch: true });
});
