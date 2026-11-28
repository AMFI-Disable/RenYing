  /* ---------- 存档 ---------- */
  // 领奖记录：d / w 是哪天哪周，dp / wp 是这天这周服务器认的对局数，dc / wc 是这天这周领过的任务，ev 活动期间打了几局人机，
  // ec / comp / tut 领没领过，ss 每关领过几颗星，sg 每部列传领过哪几节（位）、哪几个结局。seed 是第一次建这份记录时用服务器上的旧进度做底
  C.rwBlank = () => ({ d: 0, w: 0, dp: { games: 0, wins: 0, combo: 0, ults: 0 }, wp: { games: 0, wins: 0, combo: 0, ults: 0 }, dc: [], wc: [], ev: 0, ec: 0, comp: 0, tut: 0, ss: {}, sg: {}, seeded: 0 });
  C.blank = () => ({
    v: C.VER, tags: 0, term: 0, tm: null, nid: 1, inv: [], cases: Object.fromEntries(C.CASES.map(c => [c, 0])), via: [], eq: {},
    badgeGift: 0, badgeOwned: {}, badgeEquip: {}, badgeSigils: 0, heroKOs: {}, stances: {},
    petOwned: {}, petEquip: {}, skillUnlocks: {}, skillLoadout: {}, appreciation2026: 0, promoAll: 0, promoKeys: [], heirloomPromo: 0,
    lst: [], hist: [], od: { d: 0, n: 0 }, pd: { d: 0, n: 0 }, pw: { w: 0, n: 0 }, zw: { w: 0, n: 0 }, hw: { w: 0, n: 0 }, zf: 0, drop: { w: 0, g: 0, n: 0, sup: 0 },
    op: { s: '', earned: 0, spent: 0, w: 0, ms: [], prog: {}, done: [] }, cc: [], buys: {},
    stat: { open: 0, trade: 0, sold: 0, bought: 0, term: 0 }, tk: null, last: 0, dm: { d: 0, n: 0 }, gift: 0,
    rw: C.rwBlank(),
  });
  const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const int = (x, lo = 0, hi = 1e15) => { const v = Math.floor(+x); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  const num = (x, lo = 0, hi = 1e15) => { const v = +x; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  const str = (x, n) => typeof x === 'string' ? x.slice(0, n) : '';
  const stOf = x => Math.floor(+x) >= 0 ? int(x, 0, 1e7) : -1;
  const cleanItem = x => isObj(x) && C.isItem(C.liveKey(x.k)) && Number.isFinite(+x.i) ? {
    i: int(x.i, 1), k: C.liveKey(x.k), st: C.isStOnly(C.liveKey(x.k)) ? Math.max(0, stOf(x.st)) : stOf(x.st), n: str(x.n, 12).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, ''), t: num(x.t), src: str(x.src, 8) } : null;
  // 读进来的存档先整理一遍：缺的补上，类型不对的换掉，每一层都按格式重新拼一遍（多出来的字段一律丢掉），过了周就换周任务。
  // 第 1 版的存档也这样读：磨损、图案模板、玉珏、充值记录这些字段直接丢掉，没用完的钥匙一把换一台货郎，饰品和武器箱照旧。
  // 第 2 版的“本周买了几个箱子”也丢掉（现在不限买，限的是每天开几个）。
  // 第 3 版以前挂着的单是卖给系统的（系统按时间成交）：换成第 4 版时全部撤下，饰品、武器箱、货郎退回来
  C.normalize = (s, env) => {
    if (!isObj(s)) s = C.blank();
    const oldKeys = s.v === 1 ? int(s.keys, 0, 50) : 0, oldLst = !(+s.v >= 4);
    const b = C.blank();
    for (const k of Object.keys(b)) {
      const okType = Array.isArray(b[k]) ? Array.isArray(s[k]) : isObj(b[k]) ? isObj(s[k]) : b[k] === null ? (s[k] === null || isObj(s[k])) : typeof s[k] === typeof b[k];
      if (!okType) s[k] = b[k];
    }
    for (const k of Object.keys(s)) if (!(k in b)) delete s[k];
    s.v = C.VER;
    s.badgeGift = s.badgeGift ? 1 : 0;
    s.appreciation2026 = s.appreciation2026 ? 1 : 0;
    s.promoAll = s.promoAll ? 1 : 0;
    s.heirloomPromo = s.heirloomPromo ? 1 : 0;
    s.promoKeys = Array.from(new Set((Array.isArray(s.promoKeys) ? s.promoKeys : []).map(C.liveKey).filter(k => C.isItem(k))));
    s.badgeOwned = Object.fromEntries(Object.entries(s.badgeOwned).filter(([id, tier]) => own(C.BADGES, id) && own(C.BADGE_TIER, tier)));
    s.badgeEquip = Object.fromEntries(Object.entries(s.badgeEquip).filter(([h, id]) => C.HERO_IDS.includes(h) && own(s.badgeOwned, id)).slice(0, C.HERO_IDS.length));
    const equippedBadges = new Set();
    for (const [h, id] of Object.entries(s.badgeEquip)) { if (equippedBadges.has(id)) delete s.badgeEquip[h]; else equippedBadges.add(id); }
    s.badgeSigils = int(s.badgeSigils, 0, 1e6);
    s.heroKOs = Object.fromEntries(Object.entries(s.heroKOs).filter(([h]) => C.HERO_IDS.includes(h)).map(([h, n]) => [h, int(n, 0, 1e6)]));
    s.stances = Object.fromEntries(Object.entries(s.stances).filter(([h, n]) => C.HERO_IDS.includes(h) && (n === 0 || n === 1) && (n === 0 || (s.heroKOs[h] || 0) >= 20)));
    s.petOwned = Object.fromEntries(Object.entries(s.petOwned).filter(([id, tier]) => own(C.PETS, id) && own(C.PET_TIER, tier)));
    s.petEquip = Object.fromEntries(Object.entries(s.petEquip).filter(([h, id]) => C.HERO_IDS.includes(h) && own(s.petOwned, id)));
    const cleanSU = {};
    for (const [h, v] of Object.entries(s.skillUnlocks)) {
      if (!C.HERO_IDS.includes(h) || !isObj(v)) continue;
      const slots = {};
      for (const sl of C.SKILL_SLOTS) {
        if (Array.isArray(v[sl])) slots[sl] = [...new Set(v[sl].filter(x => x === 'swift' || x === 'heavy'))];
      }
      if (Object.keys(slots).length) cleanSU[h] = slots;
    }
    s.skillUnlocks = cleanSU;
    const cleanSL = {};
    for (const [h, v] of Object.entries(s.skillLoadout)) {
      if (!C.HERO_IDS.includes(h) || !isObj(v)) continue;
      const slots = {};
      for (const sl of C.SKILL_SLOTS) {
        const pick = v[sl];
        if (pick === 'std' || ((pick === 'swift' || pick === 'heavy') && ((cleanSU[h] && cleanSU[h][sl]) || []).includes(pick))) slots[sl] = pick;
      }
      if (Object.keys(slots).length) cleanSL[h] = slots;
    }
    s.skillLoadout = cleanSL;
    s.tags = int(s.tags, 0, 1e9); s.term = int(s.term, 0, 1e6) + oldKeys;
    s.cases = Object.fromEntries(C.CASES.map(c => [c, int(s.cases[c], 0, 1e6)]));
    const seen = new Set();
    s.inv = s.inv.map(cleanItem).filter(x => x && !seen.has(x.i) && seen.add(x.i)).slice(0, C.INV_MAX);
    if (oldLst) {   // 旧版的挂单：退回库存
      for (const L of s.lst.slice(0, 200)) {
        if (!isObj(L)) continue;
        if (L.g === 'term') s.term++;
        else if (L.g !== undefined) { if (own(C.COLS, L.g)) s.cases[L.g]++; }
        else { const it = cleanItem(L.it); if (it && !seen.has(it.i)) { seen.add(it.i); s.inv.push(it); } }
      }
      s.lst = [];
    }
    s.lst = s.lst.map(L => {   // 挂在玩家市场上的饰品：编号是服务器给的，和 mkt 表里的那一单对应
      if (!isObj(L) || !C.isLid(L.l)) return null;
      const it = cleanItem(L.it);
      if (!it || seen.has(it.i)) return null;
      seen.add(it.i);
      return { l: L.l, it: { ...it, n: '' }, price: int(L.price, 1, C.PRICE_MAX), t: num(L.t) };
    }).filter(Boolean).slice(0, C.INV_MAX);
    let top = 0;
    for (const x of s.inv) top = Math.max(top, x.i);
    for (const L of s.lst) top = Math.max(top, L.it.i);
    s.nid = Math.max(int(s.nid, 1), top + 1);
    s.via = Array.from(new Set(s.via.map(C.liveKey).filter(k => C.isItem(k))));
    s.eq = Object.fromEntries(Object.entries(s.eq).filter(([c, id]) => C.HERO_IDS.includes(c) && s.inv.some(x => x.i === id && C.charOf(x.k) === c)));
    s.hist = s.hist.filter(isObj).slice(0, C.HIST_MAX).map(h => ({ t: num(h.t), kind: ['buy', 'sell', 'sold', 'term', 'upgrade'].includes(h.kind) ? h.kind : 'sell',
      ...(C.isGood(h.g) || C.CASES.includes(h.c) ? { g: C.isGood(h.g) ? h.g : h.c, n: int(h.n, 0, 1e6) } : { k: C.isItem(C.liveKey(h.k)) ? C.liveKey(h.k) : 'qf_p1', st: stOf(h.st) }),   // 第 2 版的箱子记录写在 c 里
      price: int(h.price, 0, 1e9), ...(h.gain !== undefined ? { gain: int(h.gain, 0, 1e9) } : {}) }));
    s.cc = Array.from(new Set(s.cc.filter(c => own(C.COLS, c))));
    s.buys = Object.fromEntries(Object.entries(s.buys).filter(([id, v]) => C.STORE.some(g => g.id === id) && isObj(v)).map(([id, v]) => [id, { k: str(v.k, 12), n: int(v.n, 0, 1e6) }]));
    s.stat = Object.fromEntries(Object.keys(b.stat).map(k => [k, int(s.stat[k])]));
    s.tk = isObj(s.tk) && C.MODES.includes(s.tk.mode) ? { t0: num(s.tk.t0), mode: s.tk.mode } : null;
    s.last = num(s.last); s.gift = s.gift ? 1 : 0;
    s.od = { d: int(s.od.d), n: int(s.od.n, 0, 1000) };   // 每天、每周能开几个可以在线改，这里只防乱填
    s.pd = isObj(s.pd) ? { d: int(s.pd.d), n: int(s.pd.n, 0, 1000) } : { d: 0, n: 0 };
    s.pw = { w: int(s.pw.w), n: int(s.pw.n, 0, 1000) };
    s.zw = { w: int(s.zw.w), n: int(s.zw.n, 0, 1000) };
    s.hw = isObj(s.hw) ? { w: int(s.hw.w), n: int(s.hw.n, 0, 1000) } : { w: 0, n: 0 };
    if (!s.zf) s.cases.c8++;   // 每个号送 1 个星座武器箱（只送一次，老号第一次读到这一版的时候送）
    s.zf = 1;
    s.drop = { w: int(s.drop.w), g: int(s.drop.g, 0, 1e6), n: int(s.drop.n, 0, 1e6), sup: s.drop.sup ? 1 : 0 };
    s.dm = { d: int(s.dm.d), n: int(s.dm.n, 0, 1e6) };
    const tm = s.tm, o = isObj(tm) && isObj(tm.o) && C.isItem(C.liveKey(tm.o.k)) ? tm.o : null, ok = o ? C.liveKey(o.k) : '';
    s.tm = o ? { t0: num(tm.t0), n: int(tm.n, 1, C.TERM.offers), o: { k: ok, st: C.isStOnly(ok) ? Math.max(0, stOf(o.st)) : stOf(o.st), price: int(o.price, 1, 1e8) } } : null;
    const op = s.op, ms = Array.isArray(op.ms) && op.ms.length === 4 && op.ms.every(m => isObj(m) && own(C.MISSIONS, m.id)) ? op.ms.map(m => ({ id: m.id, n: C.MISSIONS[m.id].n, star: C.MISSIONS[m.id].star, ...(m.id === 'hero' ? { h: C.HERO_IDS.includes(m.h) ? m.h : 'qingfeng' } : {}) })) : null;
    const earned = int(op.earned, 0, 1e6);
    s.op = { s: str(op.s, 8), earned, spent: int(op.spent, 0, earned), w: ms ? int(op.w) : -1, ms: ms || [],
      prog: ms ? Object.fromEntries([0, 1, 2, 3].filter(i => i in (isObj(op.prog) ? op.prog : {})).map(i => [i, int(op.prog[i], 0, ms[i].n)])) : {},
      done: ms && Array.isArray(op.done) ? Array.from(new Set(op.done.map(Number).filter(i => i >= 0 && i < 4 && Number.isInteger(i)))) : [] };
    const now = env.now, day = C.day(now), wk = C.week(day), se = C.season(day);
    if (s.od.d !== day) s.od = { d: day, n: 0 };
    if (s.pd.d !== day) s.pd = { d: day, n: 0 };
    if (s.pw.w !== wk) s.pw = { w: wk, n: 0 };
    if (s.zw.w !== wk) s.zw = { w: wk, n: 0 };
    if (s.hw.w !== wk) s.hw = { w: wk, n: 0 };
    if (s.drop.w !== wk) s.drop = { w: wk, g: 0, n: 0, sup: 0 };
    if (s.op.s !== se.id) s.op = { s: se.id, earned: 0, spent: 0, w: 0, ms: [], prog: {}, done: [] };
    if (s.op.w !== wk) Object.assign(s.op, { w: wk, ms: C.genMissions(env.uid, wk), prog: {}, done: [] });
    if (s.dm.d !== day) s.dm = { d: day, n: 0 };
    s.rw = C.rwClean(s.rw, env, day, wk);
    if (s.tm && !(now - s.tm.t0 < C.TERM.days * 86400e3)) s.tm = null;   // 开封超过 3 天：作废
    C.retireSkins(env);
    return s;
  };
  const STAGE_RE = /^([1-9]\d?)\.([1-9])$/;
  C.stageOk = id => { const m = STAGE_RE.exec(String(id)); return !!m && +m[1] <= C.HERO_IDS.length && +m[2] <= C.RW.stages; };   // 关卡编号「第几章.第几关」：一位侠客一章，每章 5 关
  const END_RE = /^[a-z0-9_]{1,16}$/;
  const cnt = o => ({ games: int(o && o.games, 0, 1e6), wins: int(o && o.wins, 0, 1e6), combo: int(o && o.combo, 0, 1e6), ults: int(o && o.ults, 0, 1e6) });
  C.rwClean = (r, env, day, wk) => {
    if (!isObj(r)) r = C.rwBlank();
    const o = { d: int(r.d), w: int(r.w), dp: cnt(r.dp), wp: cnt(r.wp), dc: [], wc: [], ev: int(r.ev, 0, 1e6), ec: r.ec ? 1 : 0, comp: r.comp ? 1 : 0, tut: r.tut ? 1 : 0, ss: {}, sg: {}, seeded: r.seeded ? 1 : 0 };
    o.dc = Array.from(new Set((Array.isArray(r.dc) ? r.dc : []).filter(id => own(C.TASKS, id) && C.TASKS[id][0] === 'd')));
    o.wc = Array.from(new Set((Array.isArray(r.wc) ? r.wc : []).filter(id => own(C.TASKS, id) && C.TASKS[id][0] === 'w')));
    if (isObj(r.ss)) for (const [id, n] of Object.entries(r.ss)) if (C.stageOk(id)) o.ss[id] = int(n, 0, 3);
    if (isObj(r.sg)) for (const [h, v] of Object.entries(r.sg)) if (C.HERO_IDS.includes(h) && isObj(v)) o.sg[h] = { n: int(v.n, 0, (1 << C.RW.sagaNodes) - 1), e: Array.from(new Set((Array.isArray(v.e) ? v.e : []).filter(x => typeof x === 'string' && END_RE.test(x)))).slice(0, C.RW.sagaEnds) };
    // 第一次建这份记录：服务器上已经有的关卡星、列传进度当成领过了（老号不能把已经拿过的再领一遍）
    if (!o.seeded && env && isObj(env.seed)) {
      if (isObj(env.seed.ss)) for (const [id, n] of Object.entries(env.seed.ss)) if (C.stageOk(id)) o.ss[id] = Math.max(o.ss[id] || 0, int(n, 0, 3));
      if (isObj(env.seed.sg)) for (const [h, v] of Object.entries(env.seed.sg)) {
        if (!C.HERO_IDS.includes(h) || !isObj(v)) continue;
        const e = (Array.isArray(v.e) ? v.e : []).filter(x => typeof x === 'string' && END_RE.test(x));
        const g = o.sg[h] || { n: 0, e: [] };
        g.n |= e.length ? (1 << C.RW.sagaNodes) - 1 : (1 << int(v.s, 0, C.RW.sagaNodes)) - 1;   // 节点墨锭只在第一次走、还没拿到结局时给
        g.e = Array.from(new Set([...g.e, ...e])).slice(0, C.RW.sagaEnds);
        o.sg[h] = g;
      }
      o.seeded = 1;
    }
    if (day !== undefined && o.d !== day) Object.assign(o, { d: day, dp: cnt(null), dc: [] });
    if (wk !== undefined && o.w !== wk) Object.assign(o, { w: wk, wp: cnt(null), wc: [] });
    return o;
  };
  // 一局服务器认了：记进今天、这周的任务进度；活动期间的人机局记进活动任务
  const rwMatch = (s, c, env) => {
    const r = s.rw, win = !!c.win, combo = int(c.combo, 0, 200), ults = int(c.ults, 0, 30);
    for (const p of [r.dp, r.wp]) { p.games++; if (win) p.wins++; p.combo = Math.max(p.combo, combo); p.ults += ults; }
    if (c.mode === 'cpu' && C.inEvent(env.now)) r.ev++;
  };
  // 任务现在的样子（网页显示用）：进度、领没领过
  C.taskView = (s, now) => {
    const r0 = s && s.rw ? s.rw : C.rwBlank(), day = C.day(now), wk = C.week(day);
    const r = { ...r0, dp: r0.d === day ? r0.dp : cnt(null), dc: r0.d === day ? r0.dc : [], wp: r0.w === wk ? r0.wp : cnt(null), wc: r0.w === wk ? r0.wc : [] }, out = [];
    for (const [id, [per, k, n, ink]] of Object.entries(C.TASKS)) {
      if (per === 'e' && !C.inEvent(now)) continue;
      const v = per === 'd' ? r.dp[k] : per === 'w' ? r.wp[k] : r.ev, done = per === 'd' ? r.dc.includes(id) : per === 'w' ? r.wc.includes(id) : !!r.ec;
      out.push({ id, per, target: n, prog: Math.min(n, v || 0), reward: ink, claimed: done });
    }
    return out;
  };
  // 给玩家看的那份：开局领的票只有服务器知道
  C.publicState = s => { const o = JSON.parse(JSON.stringify(s)); delete o.tk; return o; };
  // 武库专属内容（24 款涂装、5 款 ★、神兵武器箱新增的 7 款和星座武器箱的 36 款）：服务器只认库存里真有的
  C.CS_KEYS = [...C.PAINTS.map(p => p[0]), ...Object.keys(C.FULL)];
  C.genMissions = (uid, wk) => {
    const r = rng(hash32(`ms|${uid}|${wk}`)), out = [];
    for (let g = 0; g < 4; g++) {
      const ids = Object.keys(C.MISSIONS).filter(id => C.MISSIONS[id].g === g), id = ids[Math.floor(r() * ids.length)], m = C.MISSIONS[id];
      const row = { id, n: m.n, star: m.star };
      if (id === 'hero') row.h = C.HERO_IDS[Math.floor(r() * C.HERO_IDS.length)];
      out.push(row);
    }
    return out;
  };
  C.supplyOpts = (uid, wk) => {
    const r = rng(hash32(`sup|${uid}|${wk}`)), pick = a => a[Math.floor(r() * a.length)];
    const opts = [{ t: 'case', c: pick(C.REG) }, { t: 'term', n: 1 }, r() < 0.3 ? { t: 'item', k: pick(C.ofTier('res')) } : { t: 'item', k: pick(C.ofTier('mil')) }, r() < 0.5 ? { t: 'ink', n: 400 } : { t: 'tag', n: 1 }];
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return opts;
  };
  // 今天还能开几个普通武器箱、今天/这周还能开几个神兵（星座）武器箱
  C.openLeft = (s, cid, cfg) => { const col = cid && own(C.COLS, cid); return col && col.prem ? Math.max(0, C.cv(cfg, col.lim) - ((s[col.cnt] && s[col.cnt].n) || 0)) : Math.max(0, C.cv(cfg, 'openDay') - s.od.n); };

  /* ---------- 物品进出库存 ---------- */
  C.mkItem = (s, k, src, rnd, o = {}) => {
    const rawSt = o.st !== undefined ? o.st : (rnd() < (o.stP !== undefined ? o.stP : C.ST_P) ? 0 : -1);
    const st = C.isStOnly(k) ? Math.max(0, Math.floor(+rawSt) || 0) : rawSt;
    return { i: s.nid++, k, st, n: '', t: o.t || 0, src };
  };
  // 拿到一件：这款皮肤原来没有的话，记进“可穿的皮肤”里，并记下是靠武库才有的
  C.addItem = (s, it, env) => {
    it.t = it.t || env.now;
    s.inv.push(it);
    if (!env.skins.includes(it.k)) { env.skins.push(it.k); if (!s.via.includes(it.k)) s.via.push(it.k); }
    return it;
  };
  C.findItem = (s, id) => s.inv.find(x => x.i === id) || null;
  // 送走一件：同款一件都不剩、又是靠武库才有的，就从可穿的皮肤里拿掉，正穿着的换回默认
  C.dropItem = (s, id, env) => {
    const ix = s.inv.findIndex(x => x.i === id); if (ix < 0) return null;
    const it = s.inv.splice(ix, 1)[0], char = C.charOf(it.k);
    for (const [c, v] of Object.entries(s.eq)) if (v === id) delete s.eq[c];
    if (!s.inv.some(x => x.k === it.k) && s.via.includes(it.k)) {
      s.via = s.via.filter(x => x !== it.k);
      const j = env.skins.indexOf(it.k); if (j >= 0) env.skins.splice(j, 1);
      if (char && env.equip[char] === it.k) delete env.equip[char];
    }
    return it;
  };
  const histPush = (s, row) => { s.hist.unshift(row); if (s.hist.length > C.HIST_MAX) s.hist.length = C.HIST_MAX; };
  const giveInk = (env, n) => {
    if (!Number.isFinite(n) || !Number.isFinite(env.ink)) throw new Error('bad ink');   // 算出来不是数：整个动作作废
    env.ink = Math.max(0, Math.floor(env.ink + n)); env.inkGain = (env.inkGain || 0) + Math.max(0, n);
  };
  const bump = (s, id, v, max) => {
    s.op.ms.forEach((m, i) => {
      if (m.id !== id || s.op.done.includes(i)) return;
      const cur = s.op.prog[i] || 0;
      s.op.prog[i] = Math.min(m.n, max ? Math.max(cur, v) : cur + v);
    });
  };
  const bought = (s, id, day) => { const b = s.buys[id]; return b && b.k === 'w' + C.week(day) ? b.n : 0; };
  const rollTier = (rnd, odds) => {   // 概率是 0 的档跳过；浮点误差落到最后时，给最后一档有概率的
    let r = rnd(), acc = 0, last = 'mil';
    for (const t of C.TIERS) { if (!(odds[t] > 0)) continue; last = t; acc += odds[t]; if (r < acc) return t; }
    return last;
  };
  const pickOf = (rnd, a) => a[Math.floor(rnd() * a.length)];
  C.invFull = (s, n = 1) => false;
  // 货郎报的价：随机一档品质、这一档里随机一件（不含天工传世典藏），五分之一是斩数版；价格是这一件基准价的 1.2~1.5 倍
  C.termOffer = (rnd, cfg) => {
    const pool = C.ofTier(rollTier(rnd, C.TERM.odds)).filter(x => !C.isHeirloom(x));
    const k = pickOf(rnd, pool.length ? pool : C.ofTier('mil')), st = rnd() < C.cv(cfg, 'stP') ? 0 : -1;
    const lo = C.cv(cfg, 'term.lo'), m = lo + rnd() * (C.cv(cfg, 'term.hi') - lo);
    return { k, st, price: Math.max(1, Math.round(C.refVal({ k, st }) * m)) };
  };
  // 熔铸契能出什么：每件材料平分它所在收藏品里高一档的那些饰品
  C.tradeCheck = (s, ids) => {
    if (!Array.isArray(ids) || !ids.length) return { err: '还没放材料' };
    const uniq = Array.from(new Set(ids.map(Number)));
    if (uniq.length !== ids.length) return { err: '同一件放了两次' };
    const items = uniq.map(id => C.findItem(s, id));
    if (items.some(x => !x)) return { err: '有材料已经不在库存里了' };
    const tier = C.ITEM[items[0].k].tier, up = C.UP[tier];
    if (!up) return { err: '★ 绝世已经是最高一档' };
    if (items.some(x => C.ITEM[x.k].tier !== tier)) return { err: '材料要同一档品质' };
    const stN = items.filter(x => x.st >= 0).length;
    if (stN && stN !== items.length) return { err: '斩数版和普通版不能混着放' };
    if (items.some(x => !(C.COLS[C.ITEM[x.k].col][up] || []).length)) return { err: '有材料的收藏品里没有更高一档的饰品' };
    const odds = {};
    for (const x of items) {
      const list = C.COLS[C.ITEM[x.k].col][up];
      for (const k of list) odds[k] = (odds[k] || 0) + 1 / list.length / items.length;
    }
    const outs = Object.entries(odds).map(([k, p]) => ({ k, p })).sort((a, b) => b.p - a.p);
    const full = items.length === C.NEED[tier];
    return { ok: full, full, err: full ? '' : `要正好 ${C.NEED[tier]} 件，现在 ${items.length} 件`, items, tier, up, outs, st: stN === items.length };
  };
  C.ctxOk = c => isObj(c) && C.MODES.includes(c.mode) && C.HERO_IDS.includes(c.char);
  // 找出库存中的所有重复饰品，保留最高斩数/当前穿着，返回待出售列表与总墨锭估值
  C.dupePlan = s => {
    if (!isObj(s) || !Array.isArray(s.inv)) return { items: [], totalGain: 0, byKey: {} };
    const groups = new Map();
    for (const it of s.inv) {
      if (!it || !it.k) continue;
      if (!groups.has(it.k)) groups.set(it.k, []);
      groups.get(it.k).push(it);
    }
    const toSell = [], byKey = {};
    let totalGain = 0;
    for (const [k, list] of groups.entries()) {
      if (list.length <= 1) continue;
      const sorted = list.slice().sort((a, b) => {
        const stA = a.st >= 0 ? a.st : -1, stB = b.st >= 0 ? b.st : -1;
        if (stB !== stA) return stB - stA;
        const eqA = s.eq && s.eq[C.charOf(a.k)] === a.i ? 1 : 0;
        const eqB = s.eq && s.eq[C.charOf(b.k)] === b.i ? 1 : 0;
        if (eqB !== eqA) return eqB - eqA;
        return b.i - a.i;
      });
      const kept = sorted[0], dupes = sorted.slice(1);
      byKey[k] = { kept, dupes };
      for (const it of dupes) {
        const val = C.refVal(it);
        toSell.push({ ...it, val });
        totalGain += val;
      }
    }
    return { items: toSell, totalGain, byKey };
  };

