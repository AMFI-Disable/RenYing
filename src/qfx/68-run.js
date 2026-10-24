/* ---------------- 一局：三章路线图（肉鸽） ---------------- */
// 每局三章，每章一张七层路线图：先在最下面一层挑一处出发，之后每次只能走到相连的上一层，最上面是本章首领。
// 战 遭遇 · 精 精锐 · 奇 奇遇 · 市 剑庐 · 憩 歇脚 · 宝 藏宝 · 首 首领。身死这一局就结束，剑魄和藏经阁的修为留着。
// 在路线图上会自动存档（打到一半关掉，下次从路线图接着走）。
const NODE = {
  fight: { g: '战', n: '遭遇', c: '#c9b48a', d: '一拨来敌，打完拾钱' },
  elite: { g: '精', n: '精锐', c: '#ef6a55', d: '硬仗：精锐扎堆，赢了必得一道珍品机缘' },
  event: { g: '奇', n: '奇遇', c: '#9fc7e8', d: '江湖路上的人和事，福祸难料' },
  shop: { g: '市', n: '剑庐', c: '#dcae55', d: '锻剑、淬体、养气、买回春丹' },
  rest: { g: '憩', n: '歇脚', c: '#62cdb9', d: '调息回血，或者磨一磨剑' },
  treasure: { g: '宝', n: '藏宝', c: '#e8c46a', d: '一口旧箱子，三样里挑一样' },
  boss: { g: '首', n: '首领', c: '#ff3a22', d: '本章强敌' },
};
const MAP_ROWS = 7, MAP_COLS = 4, BOSSES = ['boss1', 'boss3', 'boss2'];
/* 每章能出的敌人和“身价”（越凶越贵，一拨的总身价随层数涨） */
const POOL = [
  { bandit: 1, wolf: 1, archer: 1.5, spear: 1.5, brute: 4 },
  { wolf: 1, archer: 1.5, spear: 1.5, assassin: 2, wraith: 2, brute: 4 },
  { slave: 2.5, wraith: 2, spirit: .8, assassin: 2, brute: 4 },
];
/* 劫数：通关一次解锁下一劫，层层叠加 */
const ASC = [
  { n: '无劫', d: '寻常江湖' },
  { n: '一劫', d: '敌人气血 +15%' },
  { n: '二劫', d: '精锐更常见，精锐气血再 +20%' },
  { n: '三劫', d: '敌人伤害 +15%' },
  { n: '四劫', d: '歇脚调息只回两成气血' },
  { n: '五劫', d: '首领气血 +25%，开局少带一枚回春丹' },
];
function ascApply(a) { Object.assign(G, { asc: a, ascHp: a >= 1 ? 1.15 : 1, ascElite: a >= 2 ? 1.2 : 1, ascDmg: a >= 3 ? 1.15 : 1, ascBoss: a >= 5 ? 1.25 : 1 }); }
const ascMax = () => Math.min(ASC.length - 1, Save.load().asc || 0);

function genMap() {
  const nodes = [], at = {}, R = MAP_ROWS - 1;
  const get = (r, c) => { const k = r + ',' + c; if (!at[k]) { at[k] = { id: nodes.length, r, c, t: null, next: [] }; nodes.push(at[k]); } return at[k]; };
  const edge = (a, b) => { if (!a.next.includes(b.id)) a.next.push(b.id); };
  const has = (r, c1, c2) => { const a = at[r + ',' + c1], b = at[(r + 1) + ',' + c2]; return !!(a && b && a.next.includes(b.id)); };
  const boss = { id: -1, r: R, c: (MAP_COLS - 1) / 2, t: 'boss', next: [] };
  for (const s of [0, MAP_COLS - 1, randi(0, MAP_COLS - 1), randi(0, MAP_COLS - 1)]) {
    let c = s, prev = get(0, c);
    for (let r = 1; r < R; r++) {
      let nc = clamp(c + randi(-1, 1), 0, MAP_COLS - 1);
      if (nc === c + 1 && has(r - 1, c + 1, c)) nc = c;   // 不和已有的路交叉
      if (nc === c - 1 && has(r - 1, c - 1, c)) nc = c;
      const n = get(r, nc); edge(prev, n); prev = n; c = nc;
    }
    prev.bossNext = true;
  }
  boss.id = nodes.length; nodes.push(boss);
  for (const n of nodes) if (n.bossNext) { n.next.push(boss.id); delete n.bossNext; }
  const parents = n => nodes.filter(p => p.next.includes(n.id));
  const W = r => [['fight', 44], ['event', 24], ['elite', r >= 2 ? 14 + (G.asc >= 2 ? 6 : 0) : 0], ['shop', r >= 2 ? 10 : 0], ['rest', r >= 2 && r <= R - 3 ? 8 : 0]];
  const roll = r => { const w = W(r), tot = w.reduce((s, x) => s + x[1], 0); let v = Math.random() * tot; for (const [t, k] of w) { v -= k; if (v <= 0) return t; } return 'fight'; };
  for (const n of nodes.slice().sort((a, b) => a.r - b.r)) {
    if (n.t) continue;
    if (n.r === 0) { n.t = 'fight'; continue; }
    if (n.r === R - 1) { n.t = 'rest'; continue; }
    if (n.r === 3 && Math.random() < .55) { n.t = 'treasure'; continue; }
    let t, k = 0; do { t = roll(n.r); } while (k++ < 10 && (t === 'elite' || t === 'shop' || t === 'rest') && parents(n).some(p => p.t === t));
    n.t = t;
  }
  // 每张图至少一处剑庐、一处精锐
  for (const need of ['shop', 'elite']) if (!nodes.some(n => n.t === need)) { const c = nodes.filter(n => n.r >= 2 && n.r <= R - 2 && (n.t === 'fight' || n.t === 'event')); if (c.length) pick(c).t = need; }
  // 画图用的坐标：最下面是第一层，首领在最上面
  for (const n of nodes) { n.x = n.t === 'boss' ? 200 : Math.round(62 + n.c * 92 + rand(-12, 12)); n.y = n.t === 'boss' ? 50 : Math.round(560 - n.r * 78 + rand(-8, 8)); }
  return { nodes };
}
/* 一拨敌人的配法：按本章敌人池和身价随机配，弓手一拨最多两个，力士前两层不出 */
function genWaves(ci, r, kind) {
  if (kind === 'boss') return [{ [BOSSES[ci]]: 1 }];
  const pool = POOL[ci], ks = Object.keys(pool), waves = [], n = kind === 'elite' ? 2 : r < 2 ? 2 : 3;
  for (let w = 0; w < n; w++) {
    let b = ([5, 7.5, 10][ci] + r * [.6, .8, 1.1][ci]) * (kind === 'elite' ? 1.25 : 1) * (.85 + .15 * w); const comp = {};
    for (let k = 0; b > 0 && k < 60; k++) {
      const t = pick(ks); if (t === 'archer' && (comp.archer || 0) >= 2) continue; if (t === 'brute' && (r < 2 || (comp.brute || 0) >= (ci >= 2 ? 2 : 1))) continue;
      comp[t] = (comp[t] || 0) + 1; b -= pool[t];
    }
    waves.push(comp);
  }
  return waves;
}
/* 这一处战斗折算成原来十关里的第几关（敌人的气血、伤害、精锐几率都按它涨） */
const nodeLv = (ci, n) => n.t === 'boss' ? [3, 6, 10][ci] : [1, 4, 7][ci] + Math.floor(n.r * [2, 2, 3][ci] / 5) + (n.t === 'elite' ? 1 : 0);

const Run = {
  ch: 0, map: null, at: -1, path: [], step: 0, node: null, ev: null,
  begin(asc) { this.ch = 0; this.at = -1; this.path = []; this.step = 0; this.node = null; this.seenEv = new Set(); G.mode = 'rl'; ascApply(asc); this.map = genMap(); },
  load(r) { G.mode = 'rl'; ascApply(r.asc || 0); Object.assign(this, { ch: r.ch, map: r.map, at: r.at, path: r.path || [], step: r.step || 0, node: null, seenEv: new Set(r.seen || []) }); G.soulRun = r.soulRun || 0; Pl.reviveUsed = !!r.revUsed; },
  save() {
    const d = Save.load();
    d.rl = { v: 1, ch: this.ch, asc: G.asc, map: this.map, at: this.at, path: this.path, step: this.step, snap: Save.snap(), hp: Math.max(1, Math.round(Pl.hp)), soulRun: G.soulRun || 0, revUsed: !!Pl.reviveUsed, seen: [...(this.seenEv || [])] };
    Save.write();
  },
  reach() { const ns = this.map.nodes; return this.at < 0 ? ns.filter(n => n.r === 0).map(n => n.id) : ns[this.at].next.slice(); },
  /* ---- 路线图 ---- */
  showMap() {
    hideAll(); clearField(); $('hud').hidden = true; $('touch').hidden = true; unlock(); G.state = 'rlmap'; this.node = null; this.save();
    const ch = CHAPTERS[this.ch], ns = this.map.nodes, ok = new Set(this.reach()), done = new Set(this.path);
    $('rmT').firstChild.textContent = ch.n; $('rmS').textContent = `${ch.idx} · ${ch.sub}${G.asc ? ' · ' + ASC[G.asc].n : ''}`;
    $('rmStat').innerHTML = `<span>气血 <b>${Math.ceil(Pl.hp)} / ${Pl.maxHp}</b></span><span>铜钱 <b>${Math.floor(Pl.gold)}</b></span><span>回春丹 <b>${Pl.pots}</b></span><span>境界 <b>${cnNum(Pl.lv)}</b></span><span>佩剑 <b>${swordTier().name}</b></span>`;
    const L = [];
    for (const a of ns) for (const id of a.next) { const b = ns[id], walked = done.has(a.id) && done.has(b.id) && this.path.indexOf(b.id) === this.path.indexOf(a.id) + 1, live = a.id === this.at && ok.has(b.id);
      L.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${walked ? 'walk' : live ? 'live' : ''}"/>`); }
    for (const n of ns) {
      const N = NODE[n.t], big = n.t === 'boss', r = big ? 30 : 19, cls = ['nd', done.has(n.id) ? 'done' : '', ok.has(n.id) ? 'ok' : '', n.id === this.at ? 'cur' : ''].join(' ');
      L.push(`<g class="${cls}" data-n="${n.id}" transform="translate(${n.x} ${n.y})" style="--c:${N.c}"${ok.has(n.id) ? ' tabindex="0" role="button"' : ''} aria-label="${N.n}"><circle class="halo" r="${r + 7}"/><circle r="${r}"/><text y="${big ? 11 : 7}" font-size="${big ? 32 : 20}">${N.g}</text></g>`);
    }
    const svg = $('rmSvg'); svg.innerHTML = L.join('');
    for (const g of svg.querySelectorAll('.nd.ok')) { const go = () => this.go(+g.dataset.n); g.onclick = go; g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
      g.onmouseenter = () => this.tip(ns[+g.dataset.n]); }
    this.tip(null); UI.perkList('rmPerks'); $('rlmap').hidden = false;
  },
  tip(n) { $('rmTip').textContent = n ? `${NODE[n.t].n}：${NODE[n.t].d}` : (this.at < 0 ? '从最下面一层挑一处出发' : '只能走到相连的上一层 · 越往上越凶'); },
  go(id) {
    if (G.state !== 'rlmap' || !this.reach().includes(id)) return;
    const n = this.map.nodes[id]; this.at = id; this.path.push(id); this.step++; this.node = n; $('rlmap').hidden = true; Snd.init(); Snd.ui();
    if (n.t === 'fight' || n.t === 'elite' || n.t === 'boss') this.fight(n);
    else if (n.t === 'shop') { G.shopFrom = 'rlmap'; G.state = 'shop'; UI.showShop(); }
    else if (n.t === 'rest') this.rest();
    else if (n.t === 'treasure') this.treasure();
    else this.event();
  },
  /* ---- 战斗：沿用原来一关几拨的打法 ---- */
  fight(n, waves) {
    const ci = this.ch, lv = nodeLv(ci, n);
    Object.assign(G, { stage: lv, sub: 0, subT: 0, clearT: 0, inter: 0, intro: false, bossDead: false, rlDoneT: 0, cleared: false, waves: waves || genWaves(ci, n.r, n.t), k0: G.kills, tokens: 0, queue: [] });
    G.stageName = n.t === 'boss' ? ET[BOSSES[ci]].name : NODE[n.t].n; G.maxTokens = Math.min(4, 2 + Math.floor(lv / 4)); G.cap = Math.min(13, 6 + Math.floor(lv / 2));
    G.eliteP = n.t === 'elite' ? (G.asc >= 2 ? .55 : .4) : lv >= 3 ? Math.min(.28, .07 + .02 * (lv - 3)) + (G.asc >= 2 ? .06 : 0) : 0;
    fillQueue(G.waves[0]); G.spawnT = 1.1;
    $('hud').hidden = false; $('touch').hidden = !Input.touch; G.state = 'playing'; canvas.focus();
    if (n.t === 'boss') UI.banner(ET[BOSSES[ci]].name, CHAPTERS[ci].n + ' · 首领', 'red'); else { UI.banner(n.t === 'elite' ? '精锐当道' : `第${cnNum(this.step)}程`, G.stageName, n.t === 'elite' ? 'red' : ''); Snd.gong(); }
  },
  /* 一处打完：剑魄照旧，精锐给珍品机缘，首领破章 */
  won() {
    const n = this.node, ci = this.ch; if (!n) return;
    try { if (n.t === 'boss' && parent !== window) parent.postMessage({ qfx: 'wave', n: [3, 6, 10][ci] }, '*'); } catch (_) {}
    G.hazards.length = 0; Pl.mp = Pl.maxMp;
    const sg = addSoul((4 + 2 * Math.min(G.stage, 12)) * (n.t === 'boss' ? 3 : n.t === 'elite' ? 1.6 : 1) + (G.kills - (G.k0 ?? G.kills)) * .25); G.soulRun = (G.soulRun || 0) + sg; setTimeout(() => UI.toast(`剑魄 +${sg}`, 1.6), 900);
    if (n.t === 'boss') {
      const r = Save.load().rec; r.bestCh = Math.max(r.bestCh || 0, ci + 1); Save.write();
      if (ci >= CHAPTERS.length - 1) { Game.victory(); return; }
      G.clearT = 3.2; const ch = CHAPTERS[ci]; UI.banner(`${ch.n} · 已破`, ch.idx + ' · ' + ch.sub, 'gold'); Snd.level(); return;
    }
    if (this.bounty === 'sword' && Pl.swordLv < 9) { Pl.swordLv++; recalc(); setSwordTier(); setTimeout(() => UI.toast('孤魂留下的残剑：锻剑一重', 2.2), 1400); }
    if (this.bounty === 'pelt') { Pl.gold += 45; setTimeout(() => UI.toast('狼皮换得铜钱 45 文', 2.2), 1400); }
    this.bounty = null;
    if (n.t === 'fight' && Math.random() < .18 && Pl.pots < 5) { Pl.pots++; setTimeout(() => UI.toast('拾得回春丹一枚', 1.8), 1400); }
    UI.banner('敌势已尽', n.t === 'elite' ? '精锐授首' : '收拾行囊，再上路', 'gold'); Snd.level(); G.rlDoneT = 1.8;
  },
  /* 打完停一会儿让灵气珠飞回来，再结算 */
  afterFight() {
    if (this.node && this.node.t === 'elite') { this.offer(rareCards(), '精锐授首', '珍品机缘一道，择之'); return; }
    this.showMap();
  },
  nextChapter() { this.ch++; this.map = genMap(); this.at = -1; this.path = []; this.node = null; Game.enterChapter(this.ch); },
  /* ---- 三选一（精锐、藏宝、奇遇里的机缘） ---- */
  offer(cards, t, s, after) {
    if (!cards.length) { Pl.gold += 60; UI.toast('机缘已尽 · 改得铜钱 60', 2); (after || (() => this.showMap()))(); return; }
    G.state = 'reward'; unlock(); this.after = after || (() => this.showMap()); this.cards = cards;
    $('hud').hidden = true; UI.showCards(cards, t, s, c => this.pickCard(c));
  },
  pickCard(c) { if (G.state !== 'reward' || !c) return; takeCard(c); $('levelup').hidden = true; const f = this.after; this.after = null; f(); },
  /* ---- 歇脚 ---- */
  rest() {
    const heal = G.asc >= 4 ? .2 : .35, opts = [
      { n: '调息', d: `回复 ${Math.round(heal * 100)}% 气血（${Math.round(Pl.maxHp * heal)} 点）`, f: () => { healPlayer(Pl.maxHp * heal, true); return '一炷香后，气息渐匀。'; } },
      { n: '磨剑', d: Pl.swordLv >= 9 ? '剑已磨到头了' : `锻剑一重，不花铜钱（攻击 +13%）`, ok: () => Pl.swordLv < 9, f: () => { Pl.swordLv++; recalc(); setSwordTier(); Snd.forge(); return `剑锋又亮了一分：${swordTier().name} · ${cnNum(Pl.swordLv)}重。`; } },
      { n: '炼丹', d: Pl.pots >= 5 ? '丹囊满了' : '炼一枚回春丹', ok: () => Pl.pots < 5, f: () => { Pl.pots++; return '药香满室，得回春丹一枚。'; } },
    ];
    this.panel('歇脚', '山间小筑 · 只能做一件事', '炉火温着一壶茶。天色还早，歇一歇，或者把剑磨利些。', opts);
  },
  /* ---- 藏宝 ---- */
  treasure() {
    const g = randi(25, 55) + this.ch * 15; Pl.gold += g; Snd.forge();
    this.offer(rareCards(), '藏宝', `箱底压着铜钱 ${g} 文 · 另有三样，择其一`);
  },
  /* ---- 奇遇 ---- */
  event() {
    const seen = this.seenEv || (this.seenEv = new Set()), pool = EVENTS.filter(e => !seen.has(e.id) && (!e.ch || e.ch.includes(this.ch)));
    const e = pick(pool.length ? pool : EVENTS); seen.add(e.id);
    this.panel(e.t, '奇遇', e.d, e.opts.map(o => ({ ...o, d: typeof o.d === 'function' ? o.d() : o.d })));
  },
  panel(t, s, d, opts) {
    G.state = 'event'; unlock(); $('hud').hidden = true;
    $('evT').firstChild.textContent = t; $('evS').textContent = s; $('evD').textContent = d; $('evR').hidden = true; $('evGo').hidden = true;
    const host = $('evOpts'); host.innerHTML = ''; host.hidden = false;
    opts.forEach((o, i) => { const b = document.createElement('button'), can = !o.ok || o.ok(); b.type = 'button'; b.className = 'item'; b.disabled = !can;
      b.innerHTML = `<span class="in">${o.n}</span><span class="ip">${i + 1}</span><span class="id">${o.d}</span>`; b.onclick = () => this.choose(o); host.appendChild(b); });
    this.opts = opts; $('event').hidden = false;
  },
  choose(o) {
    if (G.state !== 'event' || $('evOpts').hidden || !o || (o.ok && !o.ok())) return;
    const res = o.f(); Snd.ui(); $('evOpts').hidden = true;
    if (res && res.fight) { $('event').hidden = true; this.fight({ ...this.node, t: 'fight' }, res.fight); return; }
    if (res && res.cards) { $('event').hidden = true; this.offer(res.cards, this.node ? $('evT').firstChild.textContent : '机缘', res.sub || '择其一'); return; }
    if (Pl.hp <= 0) Pl.hp = 1;
    $('evR').textContent = res || ''; $('evR').hidden = !res; $('evGo').hidden = false; $('evGo').focus();
  },
  closeEvent() { if (G.state !== 'event' || $('evGo').hidden) return; $('event').hidden = true; this.showMap(); },
};
/* 珍品三选一：机缘只出珍、绝两档；剑技能新学或升重；没有绝学时也可能出绝学 */
function rareCards() {
  const pool = PERKS.filter(p => p.r >= 2 && pk(p.id) < p.max && (!p.need || skLv(p.need))).map(p => ({ k: 'perk', p, w: p.r === 3 ? 18 : 30 }));
  const empty = Pl.slots.includes(null);
  for (const id in SK) { const l = skLv(id); if (l ? l < 3 : empty) pool.push({ k: 'skill', id, w: l ? 22 : 26 }); }
  if (!Pl.ult) for (const id in ULT) pool.push({ k: 'ult', id, w: 9 });
  const out = [];
  while (out.length < 3 && pool.length) { const c = wpick(pool); out.push(c); pool.splice(pool.indexOf(c), 1); if (c.k === 'ult') for (let i = pool.length - 1; i >= 0; i--) if (pool[i].k === 'ult') pool.splice(i, 1); }
  return out;
}
const hpCost = k => Math.max(1, Math.round(Pl.maxHp * k));
function hurtFlat(n) { Pl.hp = Math.max(1, Pl.hp - n); Pl.hurtV = 1; }
/* 奇遇：每局不重样。f() 返回结果文字；返回 { fight } 就地开打，返回 { cards } 给三选一 */
const EVENTS = [
  { id: 'swordsman', t: '落难剑客', d: '路边倒着一个剑客，腿上中了一箭，手里还攥着半本剑谱。', opts: [
    { n: '赠他一枚回春丹', d: '失去回春丹一枚，他把剑谱送你（三选一）', ok: () => Pl.pots > 0, f: () => { Pl.pots--; return { cards: rareCards(), sub: '剑客的半本剑谱 · 择其一' }; } },
    { n: '翻他的行囊', d: '得铜钱 70 文，但他挣扎着刺了你一剑', f: () => { Pl.gold += 70; hurtFlat(hpCost(.12)); return '你拿了钱。背后那一剑，疼了一路。'; } },
    { n: '走开', d: '什么也不做', f: () => '江湖路远，各安天命。' }] },
  { id: 'temple', t: '山间古寺', d: '半山腰一座古寺，香炉还有余温，不见僧人。', opts: [
    { n: '上一炷香', d: '花 30 文，回复四成气血', ok: () => Pl.gold >= 30, f: () => { Pl.gold -= 30; healPlayer(Pl.maxHp * .4, true); return '青烟袅袅，心定了，伤也轻了。'; } },
    { n: '在佛前参禅', d: '悟出一道剑意机缘（弹反、处决更强）', f: () => { const p = PERKS.filter(x => x.s === 'yi' && pk(x.id) < x.max); if (!p.length) { Pl.gold += 40; return '心中空明，却无所得。案上留着 40 文香火钱。'; } const q = pick(p); takePerk(q); return `坐到月上中天，忽有所悟：「${q.n}」。`; } },
    { n: '离开', d: '什么也不做', f: () => '你合十一拜，转身下山。' }] },
  { id: 'dice', t: '野店赌坊', d: '酒旗下面一桌骰子，庄家朝你招手：“客官，押一把？”', opts: [
    { n: '押 40 文', d: '五五开：赢了得 100 文，输了 40 文没了', ok: () => Pl.gold >= 40, f: () => { Pl.gold -= 40; if (Math.random() < .5) { Pl.gold += 100; return '三个六！庄家脸都绿了，你揣着 100 文出了门。'; } return '骰子落定，你输了。庄家笑得合不拢嘴。'; } },
    { n: '掀桌子', d: '骰子灌了铅！打跑这伙赌徒', f: () => ({ fight: [{ bandit: 4 + G.asc % 2 }, { bandit: 3, archer: 1 }] }) },
    { n: '离开', d: '什么也不做', f: () => '赌字头上一把刀，不碰为妙。' }] },
  { id: 'smith', t: '铸剑老人', d: '溪边一座铁匠铺，老人眯眼看你的剑：“好坯子，可惜没开锋。”', opts: [
    { n: '请他开锋', d: () => `花 ${60 + Pl.swordLv * 15} 文，锻剑一重`, ok: () => Pl.swordLv < 9 && Pl.gold >= 60 + Pl.swordLv * 15, f: () => { Pl.gold -= 60 + Pl.swordLv * 15; Pl.swordLv++; recalc(); setSwordTier(); Snd.forge(); return `火星四溅，${swordTier().name}寒光更胜。`; } },
    { n: '以血淬剑', d: () => `失去 ${hpCost(.2)} 点气血，锻剑一重`, ok: () => Pl.swordLv < 9, f: () => { hurtFlat(hpCost(.2)); Pl.swordLv++; recalc(); setSwordTier(); Snd.forge(); return '剑身饮了你的血，嗡嗡作响。'; } },
    { n: '离开', d: '什么也不做', f: () => '老人摇摇头，又低头打铁去了。' }] },
  { id: 'spring', t: '寒潭', d: '一汪寒潭，水清见底，潭边石上刻着“洗剑”二字。', opts: [
    { n: '饮一口潭水', d: '回复三成气血，内力回满', f: () => { healPlayer(Pl.maxHp * .3, true); Pl.mp = Pl.maxMp; return '凉意直透丹田，浑身一轻。'; } },
    { n: '入潭洗剑', d: '得一道剑气机缘', f: () => { const p = PERKS.filter(x => x.s === 'qi' && pk(x.id) < x.max && (!x.need || skLv(x.need))); if (!p.length) { healPlayer(Pl.maxHp * .3, true); return '剑已无垢。你顺便洗了把脸，精神一振。'; } const q = pick(p); takePerk(q); return `潭水沸腾，剑气冲霄：「${q.n}」。`; } }] },
  { id: 'stele', t: '残碑', d: '荒草里半截石碑，碑上刻着一路剑招，剩下一半已经风化。', opts: [
    { n: '拓下剑招', d: '学一门新剑技，或把已会的剑技升一重', ok: () => Object.keys(SK).some(id => skLv(id) ? skLv(id) < 3 : Pl.slots.includes(null)), f: () => { const ids = Object.keys(SK).filter(id => skLv(id) ? skLv(id) < 3 : Pl.slots.includes(null)); const id = pick(ids), l = skLv(id); learnSkill(id); return l ? `「${SK[id].n}」更进一重。` : `学会了「${SK[id].n}」。`; } },
    { n: '在碑前打坐', d: '回复两成气血', f: () => { healPlayer(Pl.maxHp * .2, true); return '风吹草低，一身疲惫散去。'; } }] },
  { id: 'black', t: '黑市', d: '一个蒙面人拦住你：“机缘，要不要？只收气血，不收铜钱。”', opts: [
    { n: '以气血换机缘', d: () => `失去 ${hpCost(.25)} 点气血，换珍品机缘三选一`, ok: () => Pl.hp > hpCost(.25) + 1, f: () => { hurtFlat(hpCost(.25)); return { cards: rareCards(), sub: '蒙面人摊开三卷 · 择其一' }; } },
    { n: '买一枚回春丹', d: '花 25 文（比剑庐便宜）', ok: () => Pl.gold >= 25 && Pl.pots < 5, f: () => { Pl.gold -= 25; Pl.pots++; return '药丸还带着体温。'; } },
    { n: '离开', d: '什么也不做', f: () => '蒙面人冷笑一声，隐入林中。' }] },
  { id: 'child', t: '迷路的孩子', d: '一个小童坐在路边哭，说爹娘在山下村子里，他找不到路了。', opts: [
    { n: '送他回村', d: '村民谢你回春丹一枚、铜钱 30 文', f: () => { Pl.pots = Math.min(5, Pl.pots + 1); Pl.gold += 30; return '村口的灯一盏盏亮起来，孩子的娘哭着道谢。'; } },
    { n: '指个方向', d: '得铜钱 10 文', f: () => { Pl.gold += 10; return '孩子塞给你十文钱，一溜烟跑了。'; } }] },
  { id: 'wolves', t: '狼嚎', d: '林子里绿光点点，狼群盯上你了。', ch: [0, 1], opts: [
    { n: '拔剑迎战', d: '打退狼群，狼皮能换 45 文', f: () => (Run.bounty = 'pelt', { fight: [{ wolf: 5 }, { wolf: 4, brute: G.asc >= 3 ? 1 : 0 }] }) },
    { n: '绕路', d: () => `失去 ${hpCost(.1)} 点气血，不打`, f: () => { hurtFlat(hpCost(.1)); return '你在荆棘里穿行半夜，总算甩掉了狼群。'; } }] },
  { id: 'ghost', t: '剑冢孤魂', d: '一缕孤魂飘在断剑之间：“替我了结那些剑奴，这柄残剑归你。”', ch: [2], opts: [
    { n: '应下', d: '打一场，赢了锻剑一重', f: () => { Run.bounty = 'sword'; return { fight: [{ slave: 3, spirit: 3 }, { slave: 2, wraith: 2 }] }; } },
    { n: '婉拒', d: '孤魂叹息着散去，留下 50 文', f: () => { Pl.gold += 50; return '断剑之间，只剩风声。'; } }] },
];
