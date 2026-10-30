// ======================= 侠客列传：引擎 =======================
// 故事都在 22-saga-data.js（SAGA）。这里管：列传页、对话框、按故事里写的条件开打、记进度、江湖足迹。
// 进度每位侠客单独一份，存在 PROF.saga[侠客]（跟着存档走，云端账号会同步）：
//   r 重走了几次（合并两份存档时先比它，重走之后不会被旧存档改回去）、s 打完了几节（0 ~ 5），f 第 3 节的抉择，c 第 3 节打赢了但还没选（刷新回来直接接着选），e 拿到过的结局。
// 江湖足迹：云端账号走完一节、做了抉择、看到结局，会记一笔到服务器（/api/saga）；列传页显示的人数和比例
// 都是真实玩家的记录，各自打各自的，不是同场联机。
const SAGA_INK = { node: 40, end: 150 };
const SAGA_GOAL = { ko: '击败对手', survive: '撑过 {t} 秒', fast: '{t} 秒内击败对手' };
const SG = { hero: '', node: -1, replay: false, lines: [], li: 0, after: null, opts: null, spec: null };
const SAGA_FOOT = {};   // 侠客 → { at, data, err }
let sagaPick = '';

function sagaRec(h) {
  const r = (PROF.saga && PROF.saga[h]) || {};
  const n = SAGA[h] ? SAGA[h].nodes.length : 5;
  return { r: Math.max(0, Math.floor(+r.r || 0)), s: Math.max(0, Math.min(n, Math.floor(+r.s || 0))), f: typeof r.f === 'string' ? r.f : '', c: r.c ? 1 : 0, e: Array.isArray(r.e) ? r.e.filter(x => typeof x === 'string') : [], t: +r.t || 0 };
}
// rw：这一步该领的列传墨锭（{ n: 第几节, end: 结局 }）。云端账号找服务器领，每节、每个结局每个号只给一次，
// 所以「重走」照样能玩，只是不再发墨锭；离线版、本机账号照旧按 ink 本机加
function sagaPut(h, rec, ink, rw) {
  PROF.saga = Object.assign({}, PROF.saga || {}, { [h]: { r: rec.r, s: rec.s, f: rec.f, c: rec.c ? 1 : 0, e: rec.e, t: Date.now() } });
  if (rw && typeof rwServer === 'function' && rwServer()) { window.armoryReward('saga', { h, ...rw }, { queue: true }); ink = 0; }
  if (ink) PROF.ink = (PROF.ink || 0) + ink;
  if (window.CloudSave) CloudSave.saveProfile(PROF);
}
// 云端账号：这一节 / 这个结局服务器上还给不给墨锭（看服务器武库存档里的领取记录），显示用；没连上服务器时按本机算的 local
function sagaSrvInk(h, n, end, local) {
  const rw = typeof rwServer === 'function' && rwServer() && typeof window.armoryRw === 'function' ? window.armoryRw() : null;
  if (!rw) return local;
  const g = (rw.sg && rw.sg[h]) || { n: 0, e: [] };
  let ink = !g.e.length && !(g.n & (1 << (n - 1))) ? SAGA_INK.node : 0;
  if (end !== undefined && !g.e.includes(end) && g.e.length < 2) ink += SAGA_INK.end;
  return ink;
}
function sagaMerge(a, b) {
  const out = Object.assign({}, a || {});
  for (const [h, y] of Object.entries(b || {})) {
    const x = out[h];
    if (!x || !y) { out[h] = x || y; continue; }
    const key = z => [+z.r || 0, +z.s || 0, +z.t || 0], kx = key(x), ky = key(y);
    const win = kx[0] !== ky[0] ? (kx[0] > ky[0] ? x : y) : kx[1] !== ky[1] ? (kx[1] > ky[1] ? x : y) : (kx[2] >= ky[2] ? x : y);
    out[h] = Object.assign({}, win, { e: Array.from(new Set([...(x.e || []), ...(y.e || [])])) });
  }
  return out;
}
// 第 5 节的内容按抉择分岔：{ flag: 内容 }；没有分岔就原样用
const sagaVar = (v, f) => v && !Array.isArray(v) && typeof v === 'object' && !v.foe && !v.title ? (v[f] || v[Object.keys(v)[0]]) : v;
const sagaHeroes = () => CHARS.map(c => c.id).filter(id => SAGA[id]);
const sagaCanPlay = h => availList().includes(CHAR_IDX[h]);
function sagaGoalText(sp) { return SAGA_GOAL[sp.goal || 'ko'].replace('{t}', sp.time || ROUND_TIME); }

// ---------- 列传页（单人模式里的一个分页） ----------
function renderSaga() {
  const list = $id('sagaHeroes'), box = $id('sagaRoute'); if (!list || !box) return;
  const ids = sagaHeroes();
  if (!sagaPick || !SAGA[sagaPick]) sagaPick = (menuHeroId >= 0 && SAGA[CHARS[menuHeroId].id]) ? CHARS[menuHeroId].id : ids[0];
  ensurePortraits();
  list.innerHTML = ids.map(h => {
    const i = CHAR_IDX[h], r = sagaRec(h), n = SAGA[h].nodes.length;
    return `<button type="button" data-h="${h}" class="${h === sagaPick ? 'sel' : ''}${sagaCanPlay(h) ? '' : ' lock'}"><img src="${PORTRAITS[i] || ''}" alt=""><span style="color:rgb(${CHARS[i].look.slash})">${CHARS[i].name}</span><small>${r.e.length ? '✦'.repeat(r.e.length) : `${r.s}/${n}`}</small></button>`;
  }).join('');
  const S = SAGA[sagaPick], r = sagaRec(sagaPick), c = CHARS[CHAR_IDX[sagaPick]], can = sagaCanPlay(sagaPick), esc = escapeHTML;
  const nodes = S.nodes.map((nd, i) => {
    const done = i < r.s, cur = i === r.s, last = i === S.nodes.length - 1;
    const st = done ? '已走过' : cur ? (r.c && nd.choice ? '抉择未定' : '下一节') : '未解锁';
    const sub = last && r.e.length ? ' · 结局：' + r.e.map(f => S.nodes[i].end[f] ? '「' + S.nodes[i].end[f].title + '」' : '').join('') : '';
    const foe = (() => { const sp = sagaVar(nd.fight, r.f); return done || cur ? `对手 ${CHARS[CHAR_IDX[sp.foe]].name} · ${sagaGoalText(sp)}` : ''; })();
    return `<li class="${done ? 'done' : cur ? 'cur' : 'lock'}"><b>第 ${i + 1} 节 · ${esc(nd.place)} · ${esc(nd.name)}</b><span>${st}${sub}</span>${foe ? `<small>${esc(foe)}</small>` : ''}
      ${can && (done || cur) ? `<button type="button" class="ghost small" data-n="${i}">${done ? '重温' : r.c && nd.choice ? '做出抉择' : '开始'}</button>` : ''}</li>`;
  }).join('');
  const allDone = r.s >= S.nodes.length;
  box.innerHTML = `<h3 style="color:rgb(${c.look.slash})">${esc(S.title)}</h3><p class="saga-motive">${esc(S.motive)}</p>
    ${can ? '' : `<p class="saga-lock">还没有${esc(c.name)}。在首页福利、武库或招募里得到这位侠客后，就能走这条路。</p>`}
    <ol class="saga-nodes">${nodes}</ol>
    ${allDone && can ? `<button type="button" class="ghost small" id="sagaReset">重走此路（已得结局会保留，可以换个抉择看另一个结局）</button>` : ''}
    <div class="saga-foot" id="sagaFoot"></div>`;
  renderSagaFoot();
  sagaFootLoad(sagaPick);
}
$id('sagaHeroes').addEventListener('click', e => { const b = e.target.closest('button[data-h]'); if (!b) return; sagaPick = b.dataset.h; SFX.slice && SFX.slice(); renderSaga(); });
$id('sagaRoute').addEventListener('click', e => {
  const b = e.target.closest('button[data-n]');
  if (b) { initAudio(); sagaPlay(sagaPick, +b.dataset.n); return; }
  if (e.target.closest('#sagaReset')) { const r = sagaRec(sagaPick); r.r++; r.s = 0; r.f = ''; r.c = 0; sagaPut(sagaPick, r); renderSaga(); }
});

// 图鉴里「宿命篇章」那一格下面：这位侠客的列传走到哪了
function sagaCodexLine(h) {
  const S = SAGA[h]; if (!S) return '';
  const r = sagaRec(h), last = S.nodes[S.nodes.length - 1];
  const st = r.e.length ? '结局 ' + r.e.map(f => last.end[f] ? '「' + last.end[f].title + '」' : '').join('') : `走到第 ${r.s} / ${S.nodes.length} 节`;
  return `<div style="margin-top:8px"><b style="color:#efe8d8">侠客列传 · ${escapeHTML(S.title)}</b><br>${st}<div style="margin-top:6px"><button type="button" class="ghost small cx-go-saga" data-h="${h}" style="padding:2px 10px;font-size:12px;border-radius:4px;color:var(--gold);border-color:rgba(233,196,106,.4);cursor:pointer">📜 读这条列传</button></div></div>`;
}

// ---------- 江湖足迹：别的玩家在这条路上走到了哪、选了什么（服务器上的真实记录） ----------
async function sagaFootLoad(h, force) {
  if (OFFLINE_BUILD || !window.CloudSave || !CloudSave.saga) return;
  const F = SAGA_FOOT[h] || (SAGA_FOOT[h] = { at: 0, data: null, err: '' });
  if (F.busy || (!force && Date.now() - F.at < 60e3)) return;
  F.busy = true;
  try { F.data = await CloudSave.saga(h); F.err = ''; F.at = Date.now(); }
  catch (e) { F.err = '江湖足迹暂时连不上'; }
  F.busy = false;
  if (h === sagaPick) renderSagaFoot();
}
function renderSagaFoot() {
  const el = $id('sagaFoot'); if (!el) return;
  if (OFFLINE_BUILD) { el.innerHTML = ''; return; }
  const h = sagaPick, S = SAGA[h], F = SAGA_FOOT[h], d = F && F.data, esc = escapeHTML;
  const head = '<h4>江湖足迹 <small>其他玩家各自走这条路留下的记录，不是实时联机</small></h4>';
  if (!d) { el.innerHTML = head + (F && F.err ? uiState('error', F.err, 'saga-state') : uiState('loading', '正在查看江湖足迹…', 'saga-state')); return; }
  const N = d.nodes || {}, cnt = k => (N[k] && N[k].n) || 0;
  const ci = S.nodes.findIndex(n => n.choice), ch = ci >= 0 ? S.nodes[ci].choice : null, last = S.nodes.length - 1;
  const rows = [];
  if (cnt('n1')) rows.push(`走上这条路的：<b>${cnt('n1')}</b> 人 · 走完的：<b>${cnt('end')}</b> 人`);
  if (ch && cnt('c' + (ci + 1))) {
    const P = N['c' + (ci + 1)].picks || {}, tot = cnt('c' + (ci + 1));
    rows.push('在「' + esc(S.nodes[ci].name) + '」：' + ch.opts.map(o => `${esc(o.t)} <b>${Math.round((P[o.f] || 0) / tot * 100)}%</b>`).join(' · '));
  }
  if (cnt('end')) { const P = N.end.picks || {}; rows.push('结局：' + Object.entries(S.nodes[last].end).map(([f, x]) => `「${esc(x.title)}」${P[f] || 0} 人`).join(' · ')); }
  if (d.recent && d.recent.length) rows.push('最近走完的：' + d.recent.map(x => `${esc(x.name)}（${esc((S.nodes[last].end[x.pick] || {}).title || '')}）`).join('、'));
  const me = window.CloudSave && CloudSave.getUser && CloudSave.getUser();
  if (!(me && me.isCloud)) rows.push('<span class="saga-dim">登录云端账号后，你的选择也会记进江湖足迹</span>');
  el.innerHTML = head + (cnt('n1') ? '' : uiState('empty', '还没有人走过这条路，你会是第一个', 'saga-state')) + rows.map(x => `<p>${x}</p>`).join('');
}
function sagaMark(h, node, pick) {
  if (OFFLINE_BUILD || !window.CloudSave || !CloudSave.sagaMark) return;
  const me = CloudSave.getUser && CloudSave.getUser(); if (!me || !me.isCloud) return;
  CloudSave.sagaMark({ hero: h, node, pick: String(pick) }).then(() => { if (SAGA_FOOT[h]) SAGA_FOOT[h].at = 0; }).catch(() => {});
}

// ---------- 对话框 ----------
function sagaTalk(lines, after, opts) {
  SG.lines = lines || []; SG.li = 0; SG.after = after || null; SG.opts = opts || null;
  showScreen('sagaTalk');
  sagaShowLine();
}
function sagaShowLine() {
  const nd = SAGA[SG.hero] && SAGA[SG.hero].nodes[SG.node];
  $id('stPlace').textContent = nd ? `${SAGA[SG.hero].title} · 第 ${SG.node + 1} 节 · ${nd.place} · ${nd.name}` : '';
  const ln = SG.lines[SG.li];
  const who = ln ? ln[0] : '', base = who.replace(/[？?（(].*$/, ''), ci = CHARS.findIndex(c => c.name === base);
  $id('stWho').textContent = who;
  $id('stWho').style.color = ci >= 0 ? `rgb(${CHARS[ci].look.slash})` : '';
  $id('stLine').textContent = ln ? ln[1] : '';
  $id('stLine').classList.toggle('narr', !who);
  const atEnd = SG.li >= SG.lines.length - 1;
  const opts = atEnd && SG.opts ? SG.opts : null;
  $id('stOpts').innerHTML = opts ? opts.map((o, i) => `<button type="button" class="${i ? 'ghost' : 'go'}" data-o="${i}">${escapeHTML(o.t)}</button>`).join('') : '';
  $id('stHint').style.visibility = opts ? 'hidden' : '';
}
function sagaNext(skip) {
  if (currentScreen !== 'sagaTalk') return;
  const atEnd = SG.li >= SG.lines.length - 1;
  if (atEnd && SG.opts) return;   // 要选一个
  if (skip && !atEnd) { SG.li = SG.lines.length - 1; sagaShowLine(); if (SG.opts) return; }
  else if (!atEnd) { SG.li++; sagaShowLine(); return; }
  const fn = SG.after; SG.after = null;
  if (fn) fn();
}
$id('sagaTalk').addEventListener('click', e => {
  const b = e.target.closest('button[data-o]');
  if (b) { const o = SG.opts[+b.dataset.o]; SG.opts = null; if (o && o.fn) o.fn(); return; }
  sagaNext(false);
});
window.addEventListener('keydown', e => {
  if (currentScreen !== 'sagaTalk') return;
  const choosing = SG.opts && SG.li >= SG.lines.length - 1;   // 到了抉择：Enter / 空格按键盘选中的那个选项（26-kbnav.js）
  if ((e.code === 'Space' || e.code === 'Enter') && !choosing) { e.preventDefault(); e.stopImmediatePropagation(); sagaNext(false); }
  else if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); sagaNext(true); }
}, true);

// ---------- 走一节：开打前的对话 → 按条件开打 → 打赢的对话 / 抉择 / 结局 ----------
function sagaPlay(h, i) {
  const S = SAGA[h], nd = S && S.nodes[i]; if (!nd || !sagaCanPlay(h)) return;
  const r = sagaRec(h);
  if (i > r.s) return;
  SG.hero = h; SG.node = i; SG.replay = i < r.s;
  SG.spec = sagaVar(nd.fight, r.f);
  paused = false;
  M.mode = 'saga'; M.round = 1; M.wins = [0, 0]; M.stage = null; M.watchAi = false; M.duo = null; M.carry = null; M.quick = false;
  M.level = SG.spec.lv || 'normal'; M.towerPerks = []; M.foeScrolls = []; M.scRun = {};
  setChars(CHAR_IDX[h], CHAR_IDX[SG.spec.foe]);
  A.ctrl = human[0]; B.ctrl = new AICtrl(M.level);
  A.meter = B.meter = 0; human[0].clear(); human[1].clear();
  showScreen(null);
  startRound();
  M.phase = 'talk'; paused = true;
  if (!SG.replay && r.c && nd.choice) { sagaChoose(); return; }   // 上次打赢了、还没选：直接选
  const pre = (sagaVar(nd.pre, r.f) || []).concat([['', `【这一战】${sagaGoalText(SG.spec)}${SG.spec.hp && SG.spec.hp < 1 ? `，开局只剩 ${Math.round(SG.spec.hp * 100)}% 生命` : ''}`]]);
  sagaTalk(pre, sagaFight);
}
function sagaFight() {
  const sp = SG.spec;
  showScreen(null); paused = false;
  M.towerPerks = (sp.mySc || []).filter(id => SC_BY[id]); M.foeScrolls = (sp.foeSc || []).filter(id => SC_BY[id]);
  B.ctrl = new AICtrl(sp.lv || 'normal');
  startRound();   // 故事给的秘卷在这里生效
  if (sp.hp && sp.hp < 1) A.hp = A.lagHp = Math.max(1, Math.round(A.maxHp * sp.hp));
  if (sp.foeHp && sp.foeHp !== 1) { B.maxHp = Math.round(B.maxHp * sp.foeHp); B.hp = B.lagHp = B.maxHp; }
  M.timer = sp.time || ROUND_TIME;
  say(sagaGoalText(sp), 1.4);
}
// 时间到：撑过就算赢、限时没打倒算输、普通的比血量
function sagaTimeUp(ra, rb) {
  const g = SG.spec ? SG.spec.goal : 'ko';
  if (g === 'survive') timeDeath(A.hp > 0 ? 0 : 1, '撑住了');
  else if (g === 'fast') timeDeath(1, '时辰已到');
  else timeDeath(ra > rb ? 0 : rb > ra ? 1 : -1, '时间到');
}
function sagaEnd(w) {
  M.phase = 'end'; paused = true;
  const h = SG.hero, S = SAGA[h], nd = S.nodes[SG.node], last = SG.node === S.nodes.length - 1;
  if (w !== 0) {
    playSting('defeat');
    sagaTalk([['', `${CHARS[CHAR_IDX[h]].name}败下阵来。调匀气息，可以再来一次。`]], null, [{ t: '再战一次', fn: () => sagaPlay(h, SG.node) }, { t: '返回列传', fn: sagaBack }]);
    return;
  }
  playSting('victory');
  const r = sagaRec(h);
  if (SG.replay) { sagaTalk(last ? sagaVar(nd.end, r.f).text : (nd.post || []), sagaBack); return; }
  if (nd.choice) {   // 先记下「打赢了还没选」，刷新回来不用再打
    r.c = 1; sagaPut(h, r);
    sagaTalk(nd.post || [], sagaChoose);
    return;
  }
  const lines = nd.post ? nd.post.slice() : [];
  let ink = r.e.length ? 0 : SAGA_INK.node;   // 每节的墨锭只在第一次走这条路时给；重走只给新结局的
  if (last) {
    const E = sagaVar(nd.end, r.f), fresh = !r.e.includes(r.f);
    if (fresh) { r.e.push(r.f); ink += SAGA_INK.end; }
    ink = sagaSrvInk(h, SG.node + 1, r.f, ink);
    lines.push(...E.text, ['', `—— 结局 · 「${E.title}」 ——${ink ? `　获得 ${ink} 墨锭` : ''}`]);
    sagaMark(h, 'end', r.f);
  } else {
    ink = sagaSrvInk(h, SG.node + 1, undefined, ink);
    lines.push(['', `第 ${SG.node + 1} 节走完${ink ? `，获得 ${ink} 墨锭` : ''}`]);
    sagaMark(h, 'n' + (SG.node + 1), 1);
  }
  r.s = Math.max(r.s, SG.node + 1);
  sagaPut(h, r, ink, last ? { n: SG.node + 1, end: r.f } : { n: SG.node + 1 });
  sagaTalk(lines, sagaBack);
}
function sagaChoose() {
  const h = SG.hero, nd = SAGA[h].nodes[SG.node];
  M.phase = 'end'; paused = true;
  sagaTalk([['', nd.choice.q]], null, nd.choice.opts.map(o => ({ t: o.t, fn: () => {
    const r = sagaRec(h), ink = sagaSrvInk(h, SG.node + 1, undefined, r.e.length ? 0 : SAGA_INK.node);
    r.f = o.f; r.c = 0; r.s = Math.max(r.s, SG.node + 1);
    sagaPut(h, r, ink, { n: SG.node + 1 });
    sagaMark(h, 'n' + (SG.node + 1), 1); sagaMark(h, 'c' + (SG.node + 1), o.f);
    sagaTalk((o.say || []).concat([['', `第 ${SG.node + 1} 节走完${ink ? `，获得 ${ink} 墨锭` : ''}`]]), sagaBack);
  } })));
}
function sagaBack() {
  paused = false; M.mode = 'demo';
  singleSec('saga'); showScreen('single');
  startMatch('demo');
  renderSaga();
}
