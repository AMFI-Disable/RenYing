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
  tourSaveLocal(TOUR);
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
function tourSaveLocal(tour = TOUR) {
  if (!tour) return false;
  try {
    const code = tourEncodeCode(tour);
    if (code) localStorage.setItem(TOUR_PERSIST_KEY, JSON.stringify({ id: tour.id || '', code, at: Date.now() }));
    return true;
  } catch (e) { return false; }
}
function tourRestoreLocal() {
  try {
    if (typeof location !== 'undefined') {
      const m = (location.hash || '').match(/tour=(RYTR1:[A-Za-z0-9_-]+)/) || (location.search || '').match(/tour=(RYTR1:[A-Za-z0-9_-]+)/);
      if (m && m[1]) {
        const imp = tourImportCode(decodeURIComponent(m[1]));
        if (imp) return imp;
      }
    }
    const raw = localStorage.getItem(TOUR_PERSIST_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved && saved.code) {
      const parsed = tourDecodeCode(saved.code);
      if (parsed) { if (saved.id) parsed.id = saved.id; TOUR = parsed; return TOUR; }
    }
  } catch (e) {}
  return null;
}
function tourShareUrl(tour = TOUR) {
  if (!tour) return '';
  const code = tourEncodeCode(tour);
  if (!code) return '';
  const base = typeof location !== 'undefined' && location.origin && location.origin !== 'null' ? (location.origin + location.pathname) : '';
  return base ? `${base}#tour=${code}` : code;
}
async function tourPublishPublic() {
  if (!TOUR) { toast('尚未开启武林大会赛程'); return false; }
  const code = tourEncodeCode(TOUR);
  const url = tourShareUrl(TOUR);
  const status = TOUR.champion >= 0 ? 'completed' : 'active';
  const title = `${(typeof ACC !== 'undefined' && ACC.name) || '江湖'} · ${TOUR.size}强武林大会`;
  if (window.CloudSave && typeof CloudSave.publishTournament === 'function' && CloudSave.getUser && CloudSave.getUser() && CloudSave.getUser().isCloud) {
    try {
      const res = await CloudSave.publishTournament({ id: TOUR.id, title, size: TOUR.size, status, code });
      if (res && res.id) TOUR.id = res.id;
      tourSaveLocal(TOUR);
      if (navigator.clipboard && navigator.clipboard.writeText && url) navigator.clipboard.writeText(url).catch(() => {});
      toast('已发布公开签表并复制观赛链接！');
      tourLoadPublicList();
      return true;
    } catch (err) {
      toast((err && err.message) || '发布公开签表失败');
      return false;
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText && url) {
    navigator.clipboard.writeText(url).then(() => toast('已复制签表观赛链接（登录云端账号可发布至公开大厅）')).catch(() => toast('已生成签表观赛链接'));
  } else {
    toast('已生成签表观赛链接');
  }
  return true;
}
async function tourLoadPublicList() {
  const el = $id('tourPublicList');
  if (!el || !window.CloudSave || typeof CloudSave.tournaments !== 'function') return;
  try {
    const r = await CloudSave.tournaments();
    const list = (r && Array.isArray(r.list)) ? r.list : [];
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="tour-st-head"><b>${cvT('公开赛程大厅')}</b><span>${list.length} ${cvT('场进行中/近期赛事')}</span></div><div class="tour-pub-grid">${list.slice(0, 8).map(t => `<button type="button" class="tour-pub-item" data-pub-code="${escapeHTML(t.code)}"><b>${escapeHTML(t.title)}</b><small>${escapeHTML(t.hostName)} · ${t.size}${cvT('强')} · ${cvT(t.status === 'completed' ? '已完赛' : '进行中')}</small></button>`).join('')}</div>`;
  } catch (e) { el.innerHTML = ''; }
}
if ($id('specStageBtn')) $id('specStageBtn').addEventListener('click', () => specHudToggleStage());
if ($id('tourShareComBtn')) {
  $id('tourShareComBtn').addEventListener('click', () => {
    if (!TOUR || typeof socShareMatchCard !== 'function') { toast('尚未开启武林大会赛程'); return; }
    const champ = TOUR.champion >= 0 ? TOUR.entrants[TOUR.champion] : null;
    socShareMatchCard({
      kind: 'tour',
      mode: '武林大会',
      title: `${TOUR.size}强单败淘汰赛${champ ? ' · 盟主 ' + champ.name : ''}`,
      summary: `已完赛 ${TOUR.history.length}/${TOUR.size - 1} 场 · 一键导入签表`,
      code: tourEncodeCode(TOUR),
    }, true);
  });
}
if ($id('tourPublishBtn')) $id('tourPublishBtn').addEventListener('click', () => { tourPublishPublic(); });
if ($id('tourPublicList')) {
  $id('tourPublicList').addEventListener('click', e => {
    const b = e.target.closest('[data-pub-code]');
    if (!b) return;
    if (tourImportCode(b.dataset.pubCode)) toast('已加载公开赛程签表');
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
tourRestoreLocal();
