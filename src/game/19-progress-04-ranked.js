// Ranked season state and presentation.
// ---------- 排位赛：赛季、段位、定级（不需要服务器，分数存在账号里） ----------
// 分数 1000–25000。D C B A S 每个字母 5000 分（D 从 1000 起，只有 4000 分），
// 每个字母最低的 1500 分是“-”、最高的 1500 分是“+”，中间是不带符号的。
// 新赛季先打 3 场定级赛：定级期间显示一个估分（～xxxx 分），最高只能定到 B+。
const SEASON = { id: 'S1', name: '第一赛季', start: Date.UTC(2026, 9, 21, 16), end: Date.UTC(2026, 10, 21, 16) };   // 北京时间 10 月 22 日 0 点到 11 月 22 日 0 点
const RK = { MIN: 1000, MAX: 25000, STEP: 5000, EDGE: 1500, PLACE: 3, PLACE_CAP: 14999, PLACE_START: 2600 };
const RK_TIERS = [
  { l: 'D', n: '初出茅庐', c1: '#e0a06a', c2: '#5a2c12', glow: '#ffb27a' },
  { l: 'C', n: '小有名气', c1: '#e8eef5', c2: '#4f5c6c', glow: '#dff0ff' },
  { l: 'B', n: '名动一方', c1: '#ffd875', c2: '#7e4f0c', glow: '#ffe7a3' },
  { l: 'A', n: '一代宗师', c1: '#72f5d6', c2: '#0b4f5a', glow: '#8fffe6' },
  { l: 'S', n: '天下无双', c1: '#ff5a5a', c2: '#4d0718', glow: '#ffcf6e' },
];
function rkSeason() {
  const now = Date.now();
  if (now < SEASON.start) return { id: 'S0', name: '季前赛', pre: true, left: SEASON.start - now };
  return { id: SEASON.id, name: SEASON.name, pre: false, left: Math.max(0, SEASON.end - now), over: now >= SEASON.end };
}
function rkClamp(v, hi) { return Math.max(RK.MIN, Math.min(hi || RK.MAX, Math.round(+v || 0))); }
function rkTier(pts) {
  pts = rkClamp(pts);
  const li = Math.min(4, Math.floor(pts / RK.STEP));
  const lo = li === 0 ? RK.MIN : li * RK.STEP, hi = (li + 1) * RK.STEP;
  const sub = pts < lo + RK.EDGE ? '-' : pts >= hi - RK.EDGE ? '+' : '';
  const prev = sub === '-' ? lo : sub === '' ? lo + RK.EDGE : hi - RK.EDGE;
  const next = Math.min(RK.MAX, sub === '-' ? lo + RK.EDGE : sub === '' ? hi - RK.EDGE : hi);
  const t = RK_TIERS[li];
  return { li, sub, letter: t.l, label: t.l + sub, name: t.n, pts, lo, hi, prev, next, prog: Math.max(0, Math.min(1, (pts - prev) / Math.max(1, next - prev))) };
}
function rkOwner() { const u = window.CloudSave && CloudSave.getUser && CloudSave.getUser(); return (u && u.name) || ACC.name || ''; }
let RKS = null, RKS_KEY = '';
function rkFresh(season) { return { season, owner: rkOwner(), pts: 0, placed: 0, est: RK.PLACE_START, w: 0, l: 0, peak: 0, streak: 0, hist: [], pending: null, at: 0 }; }
// 当前账号这个赛季的排位数据：本机一份、云端一份（PROF.rk），谁新用谁
function rkState() {
  const owner = rkOwner(), key = 'renying-rk-' + owner, sid = rkSeason().id;
  if (!RKS || RKS_KEY !== key) {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
    RKS = s && typeof s === 'object' ? s : null; RKS_KEY = key;
  }
  const c = PROF.rk;
  if (c && typeof c === 'object' && c.owner === owner && (!RKS || (c.at || 0) > (RKS.at || 0))) RKS = JSON.parse(JSON.stringify(c));
  if (!RKS || RKS.season !== sid) {
    const old = RKS;
    RKS = rkFresh(sid);
    if (old && old.placed >= RK.PLACE) RKS.last = { season: old.season, label: rkTier(old.pts).label, peak: old.peak || old.pts };
  }
  // Players already on their third or fourth placement under the old rules are placed at their estimate.
  if (RKS.placed >= RK.PLACE && !(RKS.pts > 0)) { RKS.pts = rkClamp(RKS.est, RK.PLACE_CAP); RKS.peak = Math.max(RKS.peak || 0, RKS.pts); }
  RKS.owner = owner;
  return RKS;
}
function rkSave() {
  const s = rkState();
  s.at = Date.now();
  try { localStorage.setItem(RKS_KEY, JSON.stringify(s)); } catch (e) {}
  PROF.rk = JSON.parse(JSON.stringify(s));
  if (window.CloudSave && rkOwner()) CloudSave.saveProfile(PROF, true);
  if (typeof renderTopNav === 'function') renderTopNav();
}
function rkPlaced(s) { return (s || rkState()).placed >= RK.PLACE; }
function rkMatchPts() { const s = rkState(); return rkPlaced(s) ? s.pts : s.est; }
// 排队时发给对手的信息
function rkMatchInfo() {
  const s = rkState(), pts = rkMatchPts();
  return { band: rkTier(pts).li, uid: rkOwner(), rk: { pts, placed: s.placed, label: rkPlaced(s) ? rkTier(s.pts).label : '定级中' } };
}
function rkLabel(s) {
  s = s || rkState();
  if (!rkPlaced(s)) return `定级赛 ${s.placed}/${RK.PLACE} · ～${Math.round(s.est)} 分`;
  const t = rkTier(s.pts);
  return `${t.label} · ${t.name} · ${t.pts.toLocaleString()} 分`;
}
// 一场的分数变化：对手越强赢了涨得越多、输了扣得越少；定级赛的幅度是平时的五倍多
function rkDelta(me, opp, won, placing, streak) {
  const E = 1 / (1 + Math.pow(10, (opp - me) / 6000));
  let d = won ? (placing ? 3200 : 600) * (1 - E) : -(placing ? 1900 : 600) * E;   // 定级赛输了扣得比赢了涨得少
  if (placing) d = won ? Math.max(900, d) : Math.min(-400, d);
  else {
    d = won ? Math.max(80, d) : Math.min(-60, d);
    if (won && streak >= 2) d *= 1 + Math.min(0.5, (streak - 1) * 0.1);   // 连胜加成，最多 +50%
  }
  return Math.round(d);
}
// 开打就先记一笔“未完成”：中途关网页、点离开，下次打开按输算
function rkBegin() {
  if (!NET.isRanked || NET.rkDone || !rkOwner()) return;
  const s = rkState();
  const o = NET.oppRk || {};
  s.pending = { opp: rkClamp(o.pts || rkMatchPts()), at: Date.now() };
  rkSave();
}
function rkFinish(won, why) {
  const s = rkState();
  if (!s.pending) return null;
  const opp = s.pending.opp, placing = !rkPlaced(s);
  const beforeT = placing ? null : rkTier(s.pts);
  s.streak = won ? Math.max(0, s.streak) + 1 : Math.min(0, s.streak) - 1;
  const d = rkDelta(placing ? s.est : s.pts, opp, won, placing, won ? s.streak : 0);
  won ? s.w++ : s.l++;
  const r = { won, delta: d, placing, why: why || '' };
  if (placing) {
    s.est = rkClamp(s.est + d, RK.PLACE_CAP);
    s.placed++;
    r.est = s.est;
    if (rkPlaced(s)) { s.pts = s.est; s.peak = Math.max(s.peak || 0, s.pts); r.placedDone = true; }
  } else {
    s.pts = rkClamp(s.pts + d);
    s.peak = Math.max(s.peak || 0, s.pts);
    const t = rkTier(s.pts);
    if (t.li > beforeT.li) r.promo = 'letter'; else if (t.li === beforeT.li && t.label !== beforeT.label && d > 0) r.promo = 'sub';
    if (t.li < beforeT.li) r.demote = true;
  }
  r.tier = rkTier(rkPlaced(s) ? s.pts : s.est);
  s.hist = [{ w: won ? 1 : 0, d, o: opp, t: Date.now(), p: placing ? 1 : 0 }].concat(s.hist || []).slice(0, 20);
  s.pending = null;
  rkSave();
  return r;
}
function rkClearPending() { const s = rkState(); if (s.pending) { s.pending = null; rkSave(); } }
function rkResultText(r) {
  if (!r) return '';
  const sign = r.delta >= 0 ? '+' : '';
  if (r.placing && !r.placedDone) return `定级赛 ${rkState().placed}/${RK.PLACE} · 估分 ${sign}${r.delta} → ～${r.est}`;
  if (r.placedDone) return `定级完成 · ${r.tier.label} ${r.tier.name}（${r.tier.pts.toLocaleString()} 分）`;
  return `排位赛 ${sign}${r.delta} 分 · ${r.tier.label}（${r.tier.pts.toLocaleString()}）${r.promo === 'letter' ? ' · 晋升！' : r.promo === 'sub' ? ' · 升段' : r.demote ? ' · 掉段' : ''}`;
}
// 上次排位没打完就关了网页：按输算
function rkCheckPending() {
  if (!rkOwner() || (M.mode === 'net' && NET.open) || bpMode === 'net') return;
  const s = rkState();
  if (!s.pending) return;
  const r = rkFinish(false, 'quit');
  if (r) setTimeout(() => toast(`上一场排位赛中途离开，判负（${r.delta} 分）`), 600);
}
// ---------- 段位勋章（SVG） ----------
let rkMedalN = 0;
function rkMedalSVG(t, size, opt) {
  opt = opt || {};
  const id = 'rkm' + (++rkMedalN), sz = size || 96;
  const hex = (r, cx = 100, cy = 100) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i - Math.PI / 2; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  if (!t) {   // 定级中：灰色问号，外圈 5 格表示打了几场
    const n = opt.placed || 0, segs = [];
    for (let i = 0; i < RK.PLACE; i++) {
      const a0 = -Math.PI / 2 + i * 2 * Math.PI / RK.PLACE + 0.08, a1 = a0 + 2 * Math.PI / RK.PLACE - 0.16, R = 86;
      segs.push(`<path d="M${(100 + R * Math.cos(a0)).toFixed(1)} ${(100 + R * Math.sin(a0)).toFixed(1)} A${R} ${R} 0 0 1 ${(100 + R * Math.cos(a1)).toFixed(1)} ${(100 + R * Math.sin(a1)).toFixed(1)}" stroke="${i < n ? '#ece8e1' : 'rgba(236,232,225,.18)'}" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    }
    return `<svg class="rk-medal unranked" viewBox="0 0 200 200" width="${sz}" height="${sz}" aria-hidden="true"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b6470"/><stop offset="1" stop-color="#1c222b"/></linearGradient></defs>${segs.join('')}<polygon points="${hex(62)}" fill="url(#${id}g)" stroke="rgba(236,232,225,.5)" stroke-width="2"/><polygon points="${hex(50)}" fill="#0f1923" stroke="rgba(236,232,225,.25)" stroke-width="1.5"/><text x="100" y="121" text-anchor="middle" font-size="58" font-weight="800" fill="#ece8e1" font-family="Oswald,Impact,'Arial Narrow',sans-serif">?</text></svg>`;
  }
  const T = RK_TIERS[t.li], blades = [];
  const nb = [0, 2, 4, 6, 8][t.li];
  const m = nb / 2;
  for (let k = 0; k < m; k++) for (const side of [1, -1]) {   // 背后左右对称的刃：段位越高越多
    const off = m === 1 ? -0.25 : -0.7 + 1.4 * k / (m - 1);
    const a = side > 0 ? off : Math.PI - off, w = 0.2, L = 99 - Math.abs(off) * 12;
    const pt = (r, aa) => `${(100 + r * Math.cos(aa)).toFixed(1)},${(100 + r * Math.sin(aa)).toFixed(1)}`;
    blades.push(`<polygon points="${pt(50, a - w)} ${pt(L, a)} ${pt(50, a + w)}" fill="url(#${id}b)" stroke="${T.c1}" stroke-opacity=".55" stroke-width="1.2"/>`);
  }
  const pips = t.sub === '-' ? 1 : t.sub === '' ? 2 : 3, chev = [];
  for (let i = 0; i < pips; i++) { const y = 168 + i * 9; chev.push(`<path d="M84 ${y} L100 ${y + 7} L116 ${y}" stroke="${T.c1}" stroke-width="4" fill="none" stroke-linejoin="miter"/>`); }
  const crown = t.li >= 3 ? `<polygon points="100,14 108,30 100,40 92,30" fill="${T.glow}" stroke="#fff" stroke-opacity=".6"/>` : '';
  const flame = t.li === 4 ? `<circle cx="100" cy="100" r="86" fill="none" stroke="url(#${id}f)" stroke-width="3" stroke-dasharray="3 7" class="rk-spin"/><circle cx="100" cy="100" r="80" fill="none" stroke="${T.glow}" stroke-opacity=".35" stroke-width="1"/>` : '';
  return `<svg class="rk-medal t${t.li}" viewBox="0 0 200 200" width="${sz}" height="${sz}" aria-hidden="true"><defs>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.c1}"/><stop offset=".55" stop-color="${T.c2}"/><stop offset="1" stop-color="${T.c1}"/></linearGradient>
<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.c1}" stop-opacity=".95"/><stop offset="1" stop-color="${T.c2}" stop-opacity=".9"/></linearGradient>
<linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${T.c1}"/></linearGradient>
<radialGradient id="${id}r"><stop offset="0" stop-color="${T.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${T.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffcf6e"/><stop offset=".5" stop-color="#ff4655"/><stop offset="1" stop-color="#ffcf6e"/></linearGradient>
<clipPath id="${id}c"><polygon points="${hex(62)}"/></clipPath></defs>
<circle cx="100" cy="100" r="${70 + t.li * 6}" fill="url(#${id}r)"/>${flame}${blades.join('')}${crown}
<polygon points="${hex(62)}" fill="url(#${id}g)" stroke="${T.glow}" stroke-width="2.5"/>
<polygon points="${hex(57)}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
<polygon points="${hex(50)}" fill="#0f1923" stroke="${T.c1}" stroke-width="2"/>
<path d="M${hex(50).split(' ').slice(4).join(' L')} L${hex(50).split(' ')[0]} L${hex(50).split(' ')[1]} Z" fill="#fff" opacity=".05"/>
<g clip-path="url(#${id}c)"><rect class="rk-shine" x="-60" y="-20" width="34" height="240" fill="#fff" opacity=".18" transform="rotate(25 100 100)"/></g>
<text x="100" y="122" text-anchor="middle" font-size="64" font-weight="800" fill="url(#${id}t)" font-family="Oswald,Impact,'Arial Narrow',sans-serif" letter-spacing="1">${T.l}</text>
${chev.join('')}</svg>`;
}
function rkMedalFor(s, size) { s = s || rkState(); return rkPlaced(s) ? rkMedalSVG(rkTier(s.pts), size) : rkMedalSVG(null, size, { placed: s.placed }); }
// 定级完成 / 晋升时的全屏展示
function rkReveal(r) {
  const box = $id('rkReveal');
  if (!box || !r || !(r.placedDone || r.promo === 'letter')) return;
  const t = r.tier;
  box.innerHTML = `<div class="rkr-in"><div class="rkr-kicker">${r.placedDone ? '定级完成' : '段位晋升'}</div><div class="rkr-medal">${rkMedalSVG(t, 220)}</div><div class="rkr-label">${t.label}</div><div class="rkr-name">${t.name}</div><div class="rkr-pts">${t.pts.toLocaleString()} 分</div><button class="go" type="button">继续</button></div>`;
  box.classList.remove('hidden');
  requestAnimationFrame(() => box.classList.add('on'));
  SFX.gong();
  const close = () => { box.classList.remove('on'); setTimeout(() => box.classList.add('hidden'), 300); };
  box.querySelector('button').onclick = close;
}
// 结算页的段位环：字母勋章外面一圈进度条，赢了顺时针涨、输了往回退，跨段时换勋章接着转
function endRkRing(before, r) {
  const box = $id('endRk');
  if (!box) return;
  box.classList.remove('hidden');
  const R = 92, C = 2 * Math.PI * R, up = r.delta >= 0;
  if (r.placing && !r.placedDone) {   // 定级赛：外圈五格，只报估分
    box.innerHTML = `<div class="erk-dial">${rkMedalSVG(null, 200, { placed: rkState().placed })}</div><div class="erk-txt"><b class="${up ? 'up' : 'down'}">${up ? '+' : ''}${r.delta}</b><span>定级赛 ${rkState().placed}/${RK.PLACE} · 估分 ～${r.est.toLocaleString()}</span></div>`;
    return;
  }
  const t1 = r.tier, t0 = before === null ? null : rkTier(before);
  box.innerHTML = `<div class="erk-dial"><svg class="erk-ring" viewBox="0 0 220 220" aria-hidden="true">
      <circle cx="110" cy="110" r="${R}" class="erk-track"/>
      <circle cx="110" cy="110" r="${R}" class="erk-bar ${up ? 'up' : 'down'}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" transform="rotate(-90 110 110)"/>
      <circle cx="110" cy="18" r="6" class="erk-head ${up ? 'up' : 'down'}"/>
    </svg><div class="erk-medal"></div></div>
    <div class="erk-txt"><b class="${up ? 'up' : 'down'}">${up ? '+0' : '-0'}</b><span class="erk-lab"></span></div>`;
  const bar = box.querySelector('.erk-bar'), head = box.querySelector('.erk-head'), medal = box.querySelector('.erk-medal');
  const num = box.querySelector('.erk-txt b'), lab = box.querySelector('.erk-lab');
  const setMedal = t => { medal.innerHTML = rkMedalSVG(t, 128); lab.textContent = `${t.label} · ${t.name}`; };
  const setP = p => {
    p = Math.max(0, Math.min(1, p));
    bar.setAttribute('stroke-dashoffset', (C * (1 - p)).toFixed(1));
    head.setAttribute('transform', `rotate(${(p * 360).toFixed(1)} 110 110)`);
  };
  // 一段段地转：同一小段就从旧进度转到新进度；升段先转满再从零开始，掉段先退到零再从满往回
  const legs = [];
  if (!t0 || t0.label === t1.label) legs.push([t0 ? t0.prog : 0, t1.prog, t1]);
  else if (t1.pts > t0.pts) { legs.push([t0.prog, 1, t0]); legs.push([0, t1.prog, t1]); }
  else { legs.push([t0.prog, 0, t0]); legs.push([1, t1.prog, t1]); }
  setMedal(legs[0][2]); setP(legs[0][0]);
  const total = 1500, start = performance.now() + 450;
  let leg = 0;
  const tick = now => {
    if (!box.contains(bar)) return;
    const k = Math.max(0, Math.min(1, (now - start) / total)), e = 1 - Math.pow(1 - k, 3);
    num.textContent = (up ? '+' : '-') + Math.round(Math.abs(r.delta) * e);
    const per = 1 / legs.length, li = Math.min(legs.length - 1, Math.floor(e / per)), lk = Math.min(1, (e - li * per) / per);
    if (li !== leg) { leg = li; setMedal(legs[li][2]); SFX.gong(); box.classList.add('erk-flip'); setTimeout(() => box.classList.remove('erk-flip'), 500); }
    setP(legs[li][0] + (legs[li][1] - legs[li][0]) * lk);
    if (k < 1) requestAnimationFrame(tick);
    else lab.textContent = `${t1.label} · ${t1.name} · ${t1.pts.toLocaleString()} 分`;
  };
  requestAnimationFrame(tick);
}
function fmtLeft(ms) { const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24; return d > 0 ? `${d} 天 ${h} 小时` : `${h} 小时 ${Math.floor(ms / 60000) % 60} 分`; }
// 对战大厅：赛季条、两张模式卡
function renderLobby() {
  const sea = rkSeason();
  if ($id('seasonName')) $id('seasonName').textContent = sea.pre ? '季前赛' : SEASON.name;
  if ($id('seasonLeft')) $id('seasonLeft').textContent = sea.pre ? `第一赛季 ${fmtLeft(sea.left)} 后开启（季前赛分数届时清零）` : sea.over ? '赛季已结束' : `剩余 ${fmtLeft(sea.left)}`;
  const owner = rkOwner();
  if ($id('mmMedal')) $id('mmMedal').innerHTML = owner ? rkMedalFor(null, 108) : rkMedalSVG(null, 108, { placed: 0 });
  if (!owner) {
    if ($id('mmRankLabel')) $id('mmRankLabel').textContent = '登录后开启排位';
    if ($id('mmRankSub')) $id('mmRankSub').textContent = '段位与分数保存在账号里';
    if ($id('mmRankBar')) $id('mmRankBar').style.width = '0%';
    return;
  }
  const s = rkState();
  if (rkPlaced(s)) {
    const t = rkTier(s.pts);
    $id('mmRankLabel').textContent = `${t.label} · ${t.name}`;
    $id('mmRankSub').textContent = `${t.pts.toLocaleString()} 分 · 距下一段 ${Math.max(0, t.next - t.pts).toLocaleString()} 分 · ${s.w} 胜 ${s.l} 负`;
    $id('mmRankBar').style.width = (t.prog * 100).toFixed(1) + '%';
  } else {
    $id('mmRankLabel').textContent = `定级赛 ${s.placed}/${RK.PLACE}`;
    $id('mmRankSub').textContent = `当前估分 ～${Math.round(s.est).toLocaleString()} 分（最高定到 B+）`;
    $id('mmRankBar').style.width = (s.placed / RK.PLACE * 100) + '%';
  }
}
// 段位说明
function renderRankInfo() {
  const box = $id('rkInfoBody');
  if (!box) return;
  const s = rkOwner() ? rkState() : null;
  const rows = RK_TIERS.map((T, li) => {
    const lo = li === 0 ? RK.MIN : li * RK.STEP, hi = (li + 1) * RK.STEP;
    const mine = s && rkPlaced(s) && rkTier(s.pts).li === li;
    return `<div class="rki-tier${mine ? ' mine' : ''}">${rkMedalSVG(rkTier(lo + RK.EDGE + 1), 64)}<div><b>${T.l} · ${T.n}</b><span>${lo.toLocaleString()} – ${hi.toLocaleString()} 分</span><span class="rki-subs">${T.l}- ${lo.toLocaleString()}+ · ${T.l} ${(lo + RK.EDGE).toLocaleString()}+ · ${T.l}+ ${(hi - RK.EDGE).toLocaleString()}+</span></div></div>`;
  }).join('');
  const hist = s && s.hist && s.hist.length ? `<div class="rki-hist">${s.hist.slice(0, 10).map(h => `<span class="${h.w ? 'w' : 'l'}" title="${new Date(h.t).toLocaleString()}">${h.w ? '胜' : '负'} ${h.d >= 0 ? '+' : ''}${h.d}</span>`).join('')}</div>` : '';
  const me = s ? `<div class="rki-me">${rkMedalFor(s, 120)}<div><div class="rki-me-l">${rkPlaced(s) ? rkTier(s.pts).label + ' · ' + rkTier(s.pts).name : '定级中'}</div><div class="rki-me-s">${rkLabel(s)}</div><div class="rki-me-s">本赛季 ${s.w} 胜 ${s.l} 负 · 最高 ${(s.peak || 0) ? rkTier(s.peak).label + '（' + s.peak.toLocaleString() + '）' : '—'}${s.last ? ` · 上赛季 ${s.last.label}` : ''}</div>${hist}</div></div>` : '<p class="netnote">登录后即可开始定级。</p>';
  box.innerHTML = `${me}<div class="rki-tiers">${rows}</div><p class="rki-note">新赛季先打 ${RK.PLACE} 场定级赛：定级期间显示估分，起点偏低、每场涨落很大，最高可定到 B+。之后每场按对手强弱加减分，连胜有额外加成。排位只会匹配同段位或相差 1–2 个大段的对手；开打后中途离开按输算。</p>`;
}
// ---------- 排位 ----------
function renderRankLine() {
  renderLobby();
  const rs = rkOwner() ? rkState() : null;
  const rankText = !rs ? '登录后定级' : rkPlaced(rs) ? `${rkTier(rs.pts).label} · ${rkTier(rs.pts).name}` : '定级中';
  if ($id('netRankName')) $id('netRankName').textContent = rankText;
  if ($id('netWinsCount')) {
    const wins = PROF.netWins || 0, losses = PROF.netLosses || 0;
    const total = wins + losses;
    const rate = total > 0 ? Math.round((wins / total) * 100) : 0;
    $id('netWinsCount').textContent = `${wins} 胜 ${losses} 负${total > 0 ? ` (${rate}%)` : ''}`;
  }
}
function reportProgress(w) {
  // GitHub 站与离线模式本地结算与云端持久化
  if (M.mode === 'net') {
    NET.consensus = NET.consensus || {};
    NET.consensus.pendingReport = true;
    // 等双方互相确认胜负再结算；对面迟迟不回就按存疑处理
    if (!tryCommitNet(false)) setTimeout(() => tryCommitNet(true), 5000);
  } else if (M.mode === 'cpu') {
    const won = w === 0;
    if (won) {
      const gain = (LEVEL_BY_ID[M.level] || {}).reward || 20;   // 打赢给的墨锭写在难度表里
      PROF.ink = (PROF.ink || 0) + gain;
      $id('endRank').textContent = `+${gain} 墨锭`;
      if (window.CloudSave) CloudSave.saveProfile(PROF);
      applyProfile(PROF);
    }
  }
}

function tryCommitNet(force) {
  const c = NET.consensus;
  if (!c || !c.pendingReport || c.committed) return false;
  if (!force && !(c.gotFinish && c.gotAck)) return false;
  // 两边的消息都到了：要两边都认。对方打完马上关网页、只到了一半：对方报的胜负和我算的一样也算数
  // （收到对方的结束消息且胜者一致，或者对方确认了我的结果），免得赢的一方白打
  const agreed = c.gotFinish && c.gotAck ? !!(c.agreed && c.peerAgreed) : c.gotFinish ? !!c.agreed : c.gotAck ? !!c.peerAgreed : false;
  commitNetProgress(c.localWinner, agreed, c.qualifying !== false);
  return true;
}
function commitNetProgress(w, agreed, isQualifying) {
  if (NET.consensus && NET.consensus.committed) return;
  if (!NET.consensus) NET.consensus = {};
  NET.consensus.committed = true;

  const won = w === (NET.consensus.myTeam !== undefined ? NET.consensus.myTeam : localTeam());
  const ranked = NET.isRanked && !NET.rkDone && rkOwner();
  if (ranked) NET.rkDone = true;
  // 若对局过短（<15秒且<4次命中），属于切磋/自测练习局，不计入胜场与排位分，仅给予友好提示
  if (!isQualifying) {
    $id('endRank').textContent = '切磋对局（耗时过短，不计入排位胜场与墨锭）';
    if (ranked) rkClearPending();
    return;
  }
  // 双方意见不一致（作弊或不同步）
  if (!agreed) {
    $id('endRank').textContent = '对局结果同步存疑，本次结果不计入排位';
    if (ranked) rkClearPending();
    return;
  }

  const gain = won ? 60 : 30;
  PROF.ink = (PROF.ink || 0) + gain;
  if (won) {
    PROF.netWins = (PROF.netWins || 0) + 1;
  } else {
    PROF.netLosses = (PROF.netLosses || 0) + 1;
  }
  $id('endRank').textContent = `+${gain} 墨锭 · 联机${won ? '胜' : '负'}（累计 ${PROF.netWins || 0} 胜）`;
  if (ranked) {
    const s0 = rkState(), before = rkPlaced(s0) ? s0.pts : null;
    const r = rkFinish(won);
    if (r) {
      $id('endRank').textContent = `+${gain} 墨锭`;
      endRkRing(before, r);
      setTimeout(() => rkReveal(r), 2600);
    }
  }
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  applyProfile(PROF);
}
