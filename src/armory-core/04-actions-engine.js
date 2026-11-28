  /* ---------- 动作 ---------- */
  // env：now 现在时间、rnd 随机数、uid、ink 墨锭（会被改）、skins 可穿的皮肤（会被改）、equip 穿着（会被改）、server 是不是服务器在算、
  //      cfg 管理员在线改过的经济数值（没有就用默认值）
  const A = {};
  A.open = (s, a, env) => {   // 开箱：不用钥匙，开一个少一个。普通武器箱每天最多开 5 个，神兵武器箱每天 3 个，星座武器箱每周 1 个
    const cid = a.c;
    if (!C.CASES.includes(cid)) return { err: '没有这个武器箱' };
    if ((s.cases[cid] || 0) < 1) return { err: '没有这个武器箱了' };
    const col = C.COLS[cid];
    if (!C.openLeft(s, cid, env.cfg)) {
      const n = C.cv(env.cfg, col.prem ? col.lim : 'openDay');
      return { err: !n ? `${col.prem ? col.name : '普通'}武器箱现在暂停开启` : (col.daily || !col.prem) ? `今天的 ${n} 个${col.prem ? col.name : ''}武器箱已经开完了，明天再来` : `${col.name}武器箱每周只能开 ${n} 个，下周一再来` };
    }
    if (C.invFull(s)) return { err: `库存满了（最多 ${C.INV_MAX} 件），先卖掉一些` };
    s.cases[cid]--; s.stat.open++;
    if (col.prem) (s[col.cnt] || (s[col.cnt] = col.daily ? { d: C.day(env.now), n: 0 } : { w: C.week(C.day(env.now)), n: 0 })).n++; else s.od.n++;
    const tier = rollTier(env.rnd, C.oddsOf(cid, env.cfg)), pool = col[tier];
    const unowned = col.heirloom ? pool.filter(x => !s.inv.some(it => it.k === x) && !(s.lst || []).some(L => L && L.it && L.it.k === x)) : [];
    const k = pickOf(env.rnd, unowned.length ? unowned : pool);
    const it = C.addItem(s, C.mkItem(s, k, 'case', env.rnd, { stP: C.cv(env.cfg, 'stP') }), env);
    bump(s, 'open', 1);
    return { ok: true, item: it };
  };
  // One authoritative transaction per batch; keep the audit's item list complete.
  A.openAll = (s, a, env) => {
    const items = [], cases = {};
    for (const cid of C.CASES) {
      while ((s.cases[cid] || 0) > 0 && C.openLeft(s, cid, env.cfg) > 0 && items.length < 500 && !C.invFull(s)) {
        const r = A.open(s, { c: cid }, env);
        if (!r.ok) return items.length ? { ok: true, items, cases } : r;
        items.push(r.item); cases[cid] = (cases[cid] || 0) + 1;
      }
    }
    return items.length ? { ok: true, items, cases } : { err: '没有可以开启的武器箱' };
  };
  A.store = (s, a, env) => {
    const g = C.STORE.find(x => x.id === a.id), n = Math.max(1, Math.min(10, Math.floor(+a.n || 1)));
    if (!g) return { err: '没有这件商品' };
    const day = C.day(env.now);
    if (bought(s, g.id, day) + n > g.lim) return { err: `本周最多买 ${g.lim} 次` };
    const cost = g.cost * n;
    if (env.ink < cost) return { err: '墨锭不够' };
    giveInk(env, -cost);
    s[g.give[0]] += g.give[1] * n;
    const pk = 'w' + C.week(day);
    if (!s.buys[g.id] || s.buys[g.id].k !== pk) s.buys[g.id] = { k: pk, n: 0 };
    s.buys[g.id].n += n;
    return { ok: true };
  };
  // 商店：武器箱、货郎按固定价格买，不限量（限的是每天开几个）；买来的不能转卖
  const shopBuy = (s, k, a, env) => {
    const n = a.n === undefined ? 1 : +a.n;
    if (!(Number.isInteger(n) && n >= 1 && n <= 10)) return { err: '数量不对' };
    const p = C.shopPrice(k, env.cfg) * n;
    if (!(p >= 0 && Number.isSafeInteger(p))) return { err: '价格不正确' };
    if (env.ink < p) return { err: `墨锭不够，要 ${p}` };
    giveInk(env, -p);
    if (k === 'term') s.term += n; else s.cases[k] += n;
    histPush(s, { t: env.now, kind: 'buy', g: k, n, price: p });
    return { ok: true, price: p, n };
  };
  A.buyCase = (s, a, env) => C.CASES.includes(a.c) ? shopBuy(s, a.c, a, env) : { err: '没有这个武器箱' };
  A.buyTerm = (s, a, env) => shopBuy(s, 'term', a, env);
  // 玩家市场：只有饰品，只有玩家之间买卖，标价自己定。挂单、购买、撤单都要服务器（env.mkt）：
  // 服务器把这次要用的挂单编号（id）或者那一单现在的样子（row）交进来，这里决定要怎么改（out），服务器原子地写
  const NO_MKT = '玩家市场要登录云端账号、连上服务器才能用';
  A.list = (s, a, env) => {
    const m = env.mkt;
    if (!m || !C.isLid(m.id)) return { err: NO_MKT };
    if (a.c !== undefined) return { err: '武器箱和货郎只在商店按固定价格卖，不能挂到市场' };
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
    const price = +a.price;
    if (!(Number.isInteger(price) && price >= 1 && price <= C.PRICE_MAX)) return { err: `标价要是 1 到 ${C.PRICE_MAX} 之间的整数` };
    C.dropItem(s, it.i, env);
    const L = { l: m.id, it: { ...it, n: '' }, price, t: env.now };   // 名字标签不跟着卖出去
    s.lst.push(L);
    m.out = { list: L };
    return { ok: true, l: L.l, price };
  };
  A.buy = (s, a, env) => {   // 买别的玩家挂的一件
    const m = env.mkt, r = m && m.row;
    if (!m) return { err: NO_MKT };
    if (!r || r.id !== a.l) return { err: '没有这件挂单，刷新看看' };
    if (r.state !== 0) return { err: r.state === 1 ? '这件已经被别人买走了' : '这件已经撤下了' };
    if (r.seller === env.uid) return { err: '这是你自己挂的，要拿回来就撤下' };
    if (r.expired) return { err: '这件挂单已经到期撤下了，刷新看看' };
    if (a.price !== undefined && +a.price !== r.price) return { err: '标价变了，刷新看看' };
    const it0 = cleanItem(r.item);
    if (!it0 || it0.k !== C.liveKey(r.k)) return { err: '这件挂单坏了' };
    if (C.invFull(s)) return { err: '库存满了' };
    if (env.ink < r.price) return { err: `墨锭不够，要 ${r.price}` };
    giveInk(env, -r.price);
    const it = C.addItem(s, { i: s.nid++, k: it0.k, st: it0.st, n: '', t: env.now, src: 'market' }, env);   // 斩数跟着走
    histPush(s, { t: env.now, kind: 'buy', k: it.k, st: it.st, price: r.price });
    s.stat.bought++;
    bump(s, 'buy', 1);
    m.out = { buy: r.id };
    return { ok: true, item: it, price: r.price };
  };
  A.cancel = (s, a, env) => {   // 撤下自己挂的：饰品放回库存
    const m = env.mkt;
    const ix = s.lst.findIndex(x => x.l === a.l); if (ix < 0) return { err: '没有这个挂单，可能已经卖掉了' };
    if (!m) return { err: NO_MKT };
    const r = m.row && m.row.id === a.l ? m.row : null;
    if (r && r.state === 1) return { err: '这件刚被买走了，钱马上到账' };
    if (C.invFull(s)) return { err: '库存满了，放不回去' };
    const L = s.lst.splice(ix, 1)[0];
    C.addItem(s, L.it, env);
    if (r && r.state === 0) m.out = { cancel: L.l };   // 市场上找不到这一单（没人能买到它）就只把东西放回来
    return { ok: true };
  };
  // 卖掉的挂单结账：服务器把“别的玩家已经买走、还没给钱”的单放在 env.paid 里，这里给钱（扣手续费）。
  // 每次动作之前都先结一遍；结过的编号记在 env.settled，服务器在同一批写入里把它们标成已付
  C.settle = (s, env) => {
    const sold = [];
    env.settled = [];
    for (const r of Array.isArray(env.paid) ? env.paid.slice(0, 40) : []) {
      if (!isObj(r) || !C.isLid(r.id) || env.settled.includes(r.id)) continue;
      const ix = s.lst.findIndex(L => L.l === r.id), L = ix >= 0 ? s.lst.splice(ix, 1)[0] : null;
      const price = int(r.price, 1, C.PRICE_MAX), gain = C.net(price, env.cfg), k = L ? L.it.k : C.isItem(C.liveKey(r.k)) ? C.liveKey(r.k) : 'qf_p1', st = L ? L.it.st : stOf(r.st);
      giveInk(env, gain); s.stat.sold++;
      histPush(s, { t: num(r.at) || env.now, kind: 'sold', k, st, price, gain });
      sold.push({ k, st, price, gain });
      env.settled.push(r.id);
      bump(s, 'sell', 1);
    }
    return sold;
  };
  // 撤回的挂单退回库存：服务器把“存档里还挂着、市场上已经不在卖”（到期撤回、被撤下，或者那一单已经清理掉了）的编号放在 env.back。
  // 已经卖掉的单不会在这里（卖掉的走上面的结账）。退回的记在 env.returned，服务器在流水里记下
  C.unlist = (s, env) => {
    const out = [];
    for (const id of Array.isArray(env.back) ? env.back.slice(0, C.LIST_CHECK) : []) {
      const ix = s.lst.findIndex(L => L.l === id); if (ix < 0) continue;
      const L = s.lst.splice(ix, 1)[0];
      C.addItem(s, L.it, env);
      out.push({ l: L.l, i: L.it.i, k: L.it.k, st: L.it.st });
    }
    env.returned = out;
    return out;
  };
  A.trade = (s, a, env) => {
    const chk = C.tradeCheck(s, a.ids);
    if (!chk.ok) return { err: chk.err };
    let r = env.rnd(), pick = chk.outs[chk.outs.length - 1];
    for (const o of chk.outs) { if (r < o.p) { pick = o; break; } r -= o.p; }
    for (const x of chk.items) C.dropItem(s, x.i, env);
    const it = C.addItem(s, C.mkItem(s, pick.k, 'trade', env.rnd, { st: chk.st ? 0 : -1 }), env);
    s.stat.trade++;
    bump(s, 'trade', 1);
    return { ok: true, item: it };
  };
  A.sellDupes = (s, a, env) => {   // 自动出售所有重复饰品，保留最高斩数/穿着那一件
    const plan = C.dupePlan(s);
    if (!plan.items.length) return { err: '库存里没有重复的饰品' };
    const sold = [];
    for (const d of plan.items) {
      const it = C.dropItem(s, d.i, env);
      if (!it) continue;
      const val = C.refVal(it);
      giveInk(env, val);
      s.stat.sold++;
      histPush(s, { t: env.now, kind: 'sell', k: it.k, st: it.st, price: val, gain: val });
      sold.push({ i: it.i, k: it.k, st: it.st, val });
      bump(s, 'sell', 1);
    }
    return { ok: true, count: sold.length, totalGain: plan.totalGain, sold };
  };
  A.listDupes = (s, a, env) => {   // 一键自动挂牌市场：保留最高斩数/穿着那一件，其余全部挂牌出售（不受 50 件限制）
    const m = env.mkt;
    if (!m || (!C.isLid(m.id) && !Array.isArray(m.ids))) return { err: NO_MKT };
    const plan = C.dupePlan(s);
    if (!plan.items.length) return { err: '库存里没有重复的饰品' };
    const ids = Array.isArray(m.ids) ? m.ids.slice() : [m.id];
    const toList = plan.items.slice(0, ids.length);
    const listed = [];
    for (let idx = 0; idx < toList.length; idx++) {
      const d = toList[idx];
      const it = C.dropItem(s, d.i, env);
      if (!it) continue;
      const lid = ids[idx] || (C.isLid(m.id) && idx === 0 ? m.id : null);
      if (!lid || !C.isLid(lid)) continue;
      const price = Math.max(1, Math.min(C.PRICE_MAX, +d.price || C.refVal(it)));
      const L = { l: lid, it: { ...it, n: '' }, price, t: env.now };
      s.lst.push(L);
      listed.push(L);
    }
    if (!listed.length) return { err: '未能成功挂牌任何饰品' };
    if (listed.length === 1) m.out = { list: listed[0] };
    else m.out = { lists: listed };
    return { ok: true, count: listed.length, totalListed: listed.length, skipped: plan.items.length - listed.length, listings: listed };
  };
  A.rename = (s, a, env) => {
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
    const name = String(a.name || '').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').trim().slice(0, 12);
    if (name && s.tags < 1) return { err: '没有改名标签' };
    if (name) s.tags--;
    it.n = name;
    return { ok: true };
  };
  A.upgradeSt = (s, a, env) => {
    const id = +a.i;
    if (!Number.isSafeInteger(id) || id < 1) return { err: '饰品编号不对' };
    const listed = s.lst.find(L => L.it.i === id);
    if (listed) return { err: '这件饰品挂在玩家市场上，撤下后才能升级' };
    const it = C.findItem(s, id); if (!it) return { err: '库存里没有这件' };
    if (it.st >= 0) return { err: '这件已经是斩数版了' };
    const cost = C.ST_UPGRADE_COST[C.ITEM[it.k].tier];
    if (!Number.isSafeInteger(cost) || cost < 0) return { err: '升级价格设置不正确' };
    if (env.ink < cost) return { err: `墨锭不够，升级要 ${cost}` };
    giveInk(env, -cost);
    it.st = 0;
    histPush(s, { t: env.now, kind: 'upgrade', k: it.k, st: it.st, price: cost });
    return { ok: true, item: it, price: cost };
  };
  C.upgradeAllQuote = s => {
    const items = (s && Array.isArray(s.inv) ? s.inv : []).filter(it => it && it.st < 0 && C.ITEM[it.k]);
    const basePrice = items.reduce((sum, it) => sum + (C.ST_UPGRADE_COST[C.ITEM[it.k].tier] || 0), 0);
    const price = Math.floor(basePrice * 0.8);
    return { count: items.length, basePrice, discount: basePrice - price, price };
  };
  A.upgradeAllSt = (s, a, env) => {
    const items = s.inv.filter(it => it.st < 0 && C.ITEM[it.k]);
    const quote = C.upgradeAllQuote(s);
    if (!items.length) return { err: '库存里没有普通饰品可升级' };
    if (+a.count !== quote.count || +a.price !== quote.price) return { err: '库存或价格已变化，请刷新后重新确认' };
    if (items.some(it => !Number.isSafeInteger(C.ST_UPGRADE_COST[C.ITEM[it.k].tier]) || C.ST_UPGRADE_COST[C.ITEM[it.k].tier] < 0)) return { err: '升级价格设置不正确' };
    if (env.ink < quote.price) return { err: `墨锭不够，批量升级要 ${quote.price}` };
    giveInk(env, -quote.price);
    const charges = items.map(it => Math.floor(C.ST_UPGRADE_COST[C.ITEM[it.k].tier] * quote.price / quote.basePrice));
    let remainder = quote.price - charges.reduce((sum, cost) => sum + cost, 0);
    for (let i = 0; remainder > 0; i = (i + 1) % charges.length, remainder--) charges[i]++;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; it.st = 0;
      histPush(s, { t: env.now, kind: 'upgrade', k: it.k, st: it.st, price: charges[i] });
    }
    return { ok: true, count: items.length, basePrice: quote.basePrice, discount: quote.discount, price: quote.price };
  };
  A.equip = (s, a, env) => {
    const it = C.findItem(s, +a.i); if (!it) return { err: '库存里没有这件' };
    const char = C.charOf(it.k);
    if (!char) return { err: '这件穿不上' };
    s.eq[char] = it.i; env.equip[char] = it.k;
    return { ok: true, char };
  };
  A.badgeGift = (s, a) => {
    const id = String(a.id || '');
    if (s.badgeGift) return { err: '已经领过徽记礼了' };
    if (!own(C.BADGES, id)) return { err: '没有这枚徽记' };
    s.badgeOwned[id] = 'silver'; s.badgeGift = 1;
    return { ok: true, id, tier: 'silver' };
  };
  A.badgeEquip = (s, a) => {
    const hero = String(a.hero || ''), id = String(a.id || '');
    if (!C.HERO_IDS.includes(hero)) return { err: '没有这位侠客' };
    if (id && !own(s.badgeOwned, id)) return { err: '还没有这枚徽记' };
    for (const h of Object.keys(s.badgeEquip)) if (s.badgeEquip[h] === id || h === hero) delete s.badgeEquip[h];
    if (id) s.badgeEquip[hero] = id;
    return { ok: true, hero, id };
  };
  A.stanceSet = (s, a) => {
    const hero = String(a.hero || ''), stance = +a.stance;
    if (!C.HERO_IDS.includes(hero) || (stance !== 0 && stance !== 1)) return { err: '架势设置不正确' };
    if (stance && (s.heroKOs[hero] || 0) < 20) return { err: '这位侠客还没有解锁第二架势' };
    s.stances[hero] = stance;
    return { ok: true, hero, stance };
  };
  A.badgeUpgrade = (s, a, env) => {
    const id = String(a.id || ''), tier = s.badgeOwned[id], rule = C.BADGE_UPGRADE[tier];
    if (!rule) return { err: '这枚徽记已升至最高阶' };
    const totalKOs = Object.values(s.heroKOs).reduce((sum, n) => sum + n, 0);
    if (totalKOs < rule.kos) return { err: `累计斩获 ${rule.kos} 次后才可升阶` };
    if (s.badgeSigils < rule.sigils) return { err: `徽记碎片不足，需要 ${rule.sigils} 枚` };
    if (env.ink < rule.ink) return { err: `墨锭不足，需要 ${rule.ink}` };
    s.badgeSigils -= rule.sigils; giveInk(env, -rule.ink); s.badgeOwned[id] = rule.to;
    return { ok: true, id, tier: rule.to, sigils: s.badgeSigils, ink: rule.ink };
  };
  A.badgeUnlock = (s, a, env) => {
    const id = String(a.id || '');
    if (!own(C.BADGES, id)) return { err: '没有这枚徽记' };
    if (own(s.badgeOwned, id)) return { err: '已经拥有这枚徽记' };
    if (s.badgeSigils >= C.BADGE_UNLOCK_SIGILS) {
      s.badgeSigils -= C.BADGE_UNLOCK_SIGILS;
      s.badgeOwned[id] = 'silver';
      return { ok: true, id, tier: 'silver', sigils: s.badgeSigils, usedSigils: C.BADGE_UNLOCK_SIGILS };
    }
    if (env.ink < C.BADGE_UNLOCK_INK) return { err: `需要 ${C.BADGE_UNLOCK_SIGILS} 枚徽记碎片或 ${C.BADGE_UNLOCK_INK} 墨锭` };
    giveInk(env, -C.BADGE_UNLOCK_INK);
    s.badgeOwned[id] = 'silver';
    return { ok: true, id, tier: 'silver', ink: C.BADGE_UNLOCK_INK };
  };
  A.claimAppreciation = (s, a, env) => {
    if (s.appreciation2026) return { err: '已经领取过感恩盛典全员大礼了' };
    const chosen = own(C.BADGES, String((a && a.badgeId) || '')) ? String(a.badgeId) : 'flowing';
    s.appreciation2026 = 1;
    s.badgeGift = 1;
    s.badgeOwned[chosen] = 'purpgold';
    s.badgeSigils = Math.min(1e6, (s.badgeSigils || 0) + 50);
    s.term = Math.min(1e6, (s.term || 0) + 10);
    s.tags = Math.min(1e6, (s.tags || 0) + 10);
    for (const c of C.CASES) if (!C.COLS[c].heirloom) s.cases[c] = Math.min(1e6, (s.cases[c] || 0) + 10);
    for (const pid of Object.keys(C.PETS)) if (!s.petOwned[pid]) s.petOwned[pid] = 'spirit';
    for (const h of C.HERO_IDS) {
      s.heroKOs[h] = Math.max(s.heroKOs[h] || 0, 20);
      s.skillUnlocks[h] = { q: ['swift', 'heavy'], r: ['swift', 'heavy'], e: ['swift', 'heavy'] };
    }
    giveInk(env, 50000);
    return { ok: true, badgeId: chosen, tier: 'purpgold', ink: 50000, sigils: 50 };
  };
  const HERO_ARCH = {
    qingfeng: 'swordsman', lingshuang: 'swordsman', yuehua: 'swordsman',
    feiying: 'assassin', lingque: 'assassin', liying: 'assassin',
    tieshan: 'tank', gouchen: 'tank', xuanwu: 'tank',
    leiming: 'fighter', zuixian: 'fighter', chixiao: 'fighter', yanling: 'fighter',
    liuyun: 'support', yuxiao: 'support', qingluan: 'support',
    moyu: 'controller', cixian: 'controller', qianji: 'controller', xuanji: 'controller',
  };
  A.badgeAutoAssign = (s) => {
    const owned = Object.entries(s.badgeOwned || {})
      .filter(([id]) => own(C.BADGES, id))
      .sort((a, b) => (C.BADGE_TIER[b[1]] || 0) - (C.BADGE_TIER[a[1]] || 0)
        || (C.BADGE_RARITY_RANK[C.BADGES[b[0]].rarity] || 0) - (C.BADGE_RARITY_RANK[C.BADGES[a[0]].rarity] || 0)
        || a[0].localeCompare(b[0]));
    if (!owned.length) return { err: '还没有任何武学徽记可装配' };
    const PREF = {
      offense: ['swordsman', 'fighter', 'assassin', 'tank', 'controller', 'support'],
      defense: ['tank', 'fighter', 'swordsman', 'support', 'controller', 'assassin'],
      mobility: ['assassin', 'swordsman', 'fighter', 'support', 'controller', 'tank'],
      mastery: ['controller', 'swordsman', 'support', 'assassin', 'fighter', 'tank'],
      team: ['support', 'controller', 'tank', 'fighter', 'swordsman', 'assassin'],
    };
    s.badgeEquip = {};   // 覆盖所有现有徽记限制与旧装配，全阵容重新智能分配
    const usedHeroes = new Set();
    let assigned = 0;
    for (const [bid] of owned) {
      if (usedHeroes.size >= C.HERO_IDS.length) break;
      const cat = (C.BADGES[bid] && C.BADGES[bid].cat) || 'offense';
      const order = PREF[cat] || PREF.offense;
      let chosenHero = '';
      for (const arch of order) {
        chosenHero = C.HERO_IDS.find(h => !usedHeroes.has(h) && (HERO_ARCH[h] || 'fighter') === arch) || '';
        if (chosenHero) break;
      }
      if (!chosenHero) chosenHero = C.HERO_IDS.find(h => !usedHeroes.has(h)) || '';
      if (!chosenHero) break;
      s.badgeEquip[chosenHero] = bid;
      usedHeroes.add(chosenHero);
      assigned++;
    }
    return { ok: true, assigned, badgeEquip: s.badgeEquip };
  };
  // FULL AUTO：全自动一键管理 —— 覆盖重配全阵容徽记、穿戴最优皮肤、匹配最佳灵宠、启用已解锁二式架势与招式流派，
  // 并无上限直接变现全部可售饰品（含库存重复饰品与玩家市场上尚未成交的在售挂单），立即结算为墨锭
  A.fullAuto = (s, a, env) => {
    let badges = 0, skins = 0, pets = 0, stances = 0, skills = 0, soldCount = 0, soldDupesCount = 0, soldMarketCount = 0, inkGain = 0;
    if (Object.keys(s.badgeOwned || {}).length) {
      const br = A.badgeAutoAssign(s);
      if (br && br.ok) badges = br.assigned || 0;
    }
    const tierRank = k => C.TIERS.indexOf((C.ITEM[k] && C.ITEM[k].tier) || 'mil');
    const byHero = {};
    for (const it of s.inv) {
      const h = C.charOf(it.k);
      if (!h) continue;
      if (!byHero[h]) byHero[h] = [];
      byHero[h].push(it);
    }
    for (const h of C.HERO_IDS) {
      const list = byHero[h];
      if (!list || !list.length) continue;
      list.sort((x, y) => (C.isHeirloom(y.k) ? 1 : 0) - (C.isHeirloom(x.k) ? 1 : 0) || tierRank(y.k) - tierRank(x.k) || (y.st >= 0 ? 1 : 0) - (x.st >= 0 ? 1 : 0) || (y.st - x.st) || (y.i - x.i));
      const best = list[0];
      s.eq[h] = best.i;
      env.equip[h] = best.k;
      skins++;
    }
    const ownedPets = Object.entries(s.petOwned || {}).filter(([id]) => own(C.PETS, id));
    if (ownedPets.length) {
      const PET_PREF = {
        swordsman: ['attack', 'control', 'support', 'defense'],
        assassin: ['control', 'attack', 'support', 'defense'],
        tank: ['defense', 'support', 'attack', 'control'],
        fighter: ['attack', 'defense', 'support', 'control'],
        support: ['support', 'control', 'defense', 'attack'],
        controller: ['control', 'support', 'attack', 'defense'],
      };
      for (const h of C.HERO_IDS) {
        const arch = HERO_ARCH[h] || 'fighter';
        const pref = PET_PREF[arch] || PET_PREF.fighter;
        const ranked = ownedPets.slice().sort((x, y) => {
          const px = C.PETS[x[0]], py = C.PETS[y[0]];
          const tx = C.PET_TIER[x[1]] || 0, ty = C.PET_TIER[y[1]] || 0;
          if (ty !== tx) return ty - tx;
          const rx = C.BADGE_RARITY_RANK[px.rarity] || 0, ry = C.BADGE_RARITY_RANK[py.rarity] || 0;
          if (ry !== rx) return ry - rx;
          const ix = pref.indexOf(px.cat), iy = pref.indexOf(py.cat);
          return (ix < 0 ? 9 : ix) - (iy < 0 ? 9 : iy) || x[0].localeCompare(y[0]);
        });
        if (ranked.length) { s.petEquip[h] = ranked[0][0]; pets++; }
      }
    }
    const SWIFT_ARCH = new Set(['assassin', 'swordsman', 'support']);
    for (const h of C.HERO_IDS) {
      if ((s.heroKOs[h] || 0) >= 20) { s.stances[h] = 1; stances++; }
      const su = s.skillUnlocks[h];
      if (su && isObj(su)) {
        const want = SWIFT_ARCH.has(HERO_ARCH[h]) ? 'swift' : 'heavy';
        const alt = want === 'swift' ? 'heavy' : 'swift';
        for (const sl of C.SKILL_SLOTS) {
          const unl = Array.isArray(su[sl]) ? su[sl] : [];
          const pick = unl.includes(want) ? want : unl.includes(alt) ? alt : 'std';
          if (!s.skillLoadout[h]) s.skillLoadout[h] = {};
          s.skillLoadout[h][sl] = pick;
          if (pick !== 'std') skills++;
        }
      }
    }
    // 直接变现玩家市场上所有仍在售（未成交）的挂单，无需等待买家；已成交的挂单保留给 settle 结账，避免重复发奖
    const openIds = env.server && env.mkt && env.mkt.openIds instanceof Set ? env.mkt.openIds : null;
    const cancelledIds = [], keepLst = [];
    for (const L of s.lst) {
      if (!L || !L.it || !C.isItem(L.it.k)) continue;
      if (openIds && !openIds.has(L.l)) { keepLst.push(L); continue; }
      const val = C.refVal(L.it);
      giveInk(env, val);
      s.stat.sold++;
      histPush(s, { t: env.now, kind: 'sell', k: L.it.k, st: L.it.st, price: val, gain: val });
      soldMarketCount++;
      soldCount++;
      inkGain += val;
      bump(s, 'sell', 1);
      cancelledIds.push(L.l);
    }
    s.lst = keepLst;
    if (cancelledIds.length && env.mkt) env.mkt.out = { cancelMany: cancelledIds };
    // 无数量上限直接出售库存中的全部重复饰品
    const plan = C.dupePlan(s);
    if (plan.items.length) {
      for (const d of plan.items) {
        const it = C.dropItem(s, d.i, env);
        if (!it) continue;
        const val = C.refVal(it);
        giveInk(env, val);
        s.stat.sold++;
        histPush(s, { t: env.now, kind: 'sell', k: it.k, st: it.st, price: val, gain: val });
        soldDupesCount++;
        soldCount++;
        inkGain += val;
        bump(s, 'sell', 1);
      }
    }
    return { ok: true, badges, skins, pets, stances, skills, soldCount, soldDupesCount, soldMarketCount, inkGain };
  };
  A.petBuy = (s, a, env) => {
    const id = String(a.id || '');
    if (!own(C.PETS, id)) return { err: '没有这只灵宠' };
    if (own(s.petOwned, id)) return { err: '已经收养这只灵宠' };
    if (env.ink < C.PET_BUY_COST) return { err: `墨锭不足，需要 ${C.PET_BUY_COST}` };
    giveInk(env, -C.PET_BUY_COST);
    s.petOwned[id] = 'basic';
    return { ok: true, id, tier: 'basic', ink: C.PET_BUY_COST };
  };
  A.petUpgrade = (s, a, env) => {
    const id = String(a.id || ''), tier = s.petOwned[id], rule = C.PET_UPGRADE[tier];
    if (!own(s.petOwned, id)) return { err: '还没有这只灵宠' };
    if (!rule) return { err: '这只灵宠已升至最高阶' };
    const totalKOs = Object.values(s.heroKOs).reduce((sum, n) => sum + n, 0);
    if (totalKOs < rule.kos) return { err: `累计斩获 ${rule.kos} 次后才可进阶` };
    if (env.ink < rule.ink) return { err: `墨锭不足，需要 ${rule.ink}` };
    giveInk(env, -rule.ink);
    s.petOwned[id] = rule.to;
    return { ok: true, id, tier: rule.to, ink: rule.ink };
  };
  A.petEquip = (s, a) => {
    const hero = String(a.hero || ''), id = String(a.id || '');
    if (!C.HERO_IDS.includes(hero)) return { err: '没有这位侠客' };
    if (id && !own(s.petOwned, id)) return { err: '还没有这只灵宠' };
    if (id) s.petEquip[hero] = id; else delete s.petEquip[hero];
    return { ok: true, hero, id };
  };
  A.skillUnlock = (s, a, env) => {
    const hero = String(a.hero || ''), slot = String(a.slot || ''), variant = String(a.variant || '');
    if (!C.HERO_IDS.includes(hero)) return { err: '没有这位侠客' };
    if (!C.SKILL_SLOTS.includes(slot)) return { err: '技能槽位不正确' };
    if (variant !== 'swift' && variant !== 'heavy') return { err: '招式流派不正确' };
    const cur = (s.skillUnlocks[hero] && s.skillUnlocks[hero][slot]) || [];
    if (cur.includes(variant)) return { err: '已解锁该招式流派' };
    const spec = C.SKILL_VARIANTS[variant];
    const kos = s.heroKOs[hero] || 0;
    let spent = 0;
    if (kos < spec.kos) {
      if (env.ink < spec.cost) return { err: `需要 ${spec.kos} 斩或 ${spec.cost} 墨锭解锁` };
      giveInk(env, -spec.cost); spent = spec.cost;
    }
    if (!s.skillUnlocks[hero]) s.skillUnlocks[hero] = {};
    s.skillUnlocks[hero][slot] = [...cur, variant];
    return { ok: true, hero, slot, variant, ink: spent };
  };
  A.skillSet = (s, a) => {
    const hero = String(a.hero || ''), slot = String(a.slot || ''), variant = String(a.variant || 'std');
    if (!C.HERO_IDS.includes(hero)) return { err: '没有这位侠客' };
    if (!C.SKILL_SLOTS.includes(slot)) return { err: '技能槽位不正确' };
    if (!own(C.SKILL_VARIANTS, variant)) return { err: '招式流派不正确' };
    if (variant !== 'std') {
      const cur = (s.skillUnlocks[hero] && s.skillUnlocks[hero][slot]) || [];
      if (!cur.includes(variant)) return { err: '尚未解锁该招式流派' };
    }
    if (!s.skillLoadout[hero]) s.skillLoadout[hero] = {};
    s.skillLoadout[hero][slot] = variant;
    return { ok: true, hero, slot, variant };
  };
  A.unequip = (s, a, env) => {
    const char = String(a.char || ''); if (!C.HERO_IDS.includes(char)) return { err: '没有这位侠客' };
    delete s.eq[char]; env.equip[char] = '';
    return { ok: true };
  };
  // 货郎：开封给第一件；不要就换下一件（第 5 件也不要，货郎就没了）；买下就用掉
  A.unseal = (s, a, env) => {
    if (s.tm) return { err: '已经有一台开着的货郎，先处理完它' };
    if (s.term < 1) return { err: '没有货郎' };
    s.term--;
    s.tm = { t0: env.now, n: 1, o: C.termOffer(env.rnd, env.cfg) };
    return { ok: true, tm: s.tm };
  };
  A.termNext = (s, a, env) => {
    if (!s.tm) return { err: '没有开着的货郎' };
    if (a.n !== undefined && +a.n !== s.tm.n) return { err: '这一件已经换掉了，刷新看看' };   // 点得太快、请求重发：不会一下跳过两件
    if (s.tm.n >= C.TERM.offers) { s.tm = null; return { ok: true, gone: true }; }
    s.tm.n++; s.tm.o = C.termOffer(env.rnd, env.cfg);
    return { ok: true, tm: s.tm };
  };
  A.termBuy = (s, a, env) => {
    const tm = s.tm; if (!tm) return { err: '没有开着的货郎' };
    if (a.n !== undefined && +a.n !== tm.n) return { err: '这一件已经换掉了，刷新看看' };   // 点“买下”时看到的是第几件
    if (C.invFull(s)) return { err: '库存满了' };
    if (env.ink < tm.o.price) return { err: `墨锭不够，要 ${tm.o.price}` };
    giveInk(env, -tm.o.price);
    const it = C.addItem(s, C.mkItem(s, tm.o.k, 'term', env.rnd, { st: tm.o.st }), env);
    histPush(s, { t: env.now, kind: 'term', k: tm.o.k, st: tm.o.st, price: tm.o.price });
    s.tm = null; s.stat.term++;
    return { ok: true, item: it, price: tm.o.price };
  };
  // 批量开启全部可用货郎（含已开封尚未处理的货郎与所有未开封货郎，单次事务最多 500 台，前端自动接续循环）
  A.termOpenAll = (s, a, env) => {
    const items = [];
    if (s.tm && s.tm.o && C.isItem(s.tm.o.k)) {
      const o = s.tm.o;
      const it = C.addItem(s, C.mkItem(s, o.k, 'term', env.rnd, { st: o.st }), env);
      histPush(s, { t: env.now, kind: 'term', k: o.k, st: o.st, price: 0 });
      s.tm = null;
      s.stat.term++;
      items.push(it);
    }
    while (s.term > 0 && items.length < 500 && !C.invFull(s)) {
      s.term--;
      const o = C.termOffer(env.rnd, env.cfg);
      const it = C.addItem(s, C.mkItem(s, o.k, 'term', env.rnd, { st: o.st }), env);
      histPush(s, { t: env.now, kind: 'term', k: o.k, st: o.st, price: 0 });
      s.stat.term++;
      items.push(it);
    }
    return items.length ? { ok: true, count: items.length, remaining: s.term, items } : { err: '没有可开启的货郎' };
  };
  A.supply = (s, a, env) => {
    const picks = Array.isArray(a.picks) ? a.picks.map(Number).filter(Number.isInteger) : [];
    if (s.drop.sup) return { err: '这周的补给已经领过了' };
    if (s.drop.g < C.SUPPLY_GAMES) return { err: `这周再打 ${C.SUPPLY_GAMES - s.drop.g} 局就能领` };
    if (picks.length !== 2 || picks[0] === picks[1] || picks.some(x => !(x >= 0 && x < 4))) return { err: '要从四样里挑两样' };
    const opts = C.supplyOpts(env.uid, s.drop.w), got = [];
    if (picks.some(x => opts[x].t === 'item') && C.invFull(s)) return { err: '库存满了' };
    s.drop.sup = 1;
    for (const x of picks) {
      const o = opts[x];
      if (o.t === 'case') { s.cases[o.c]++; got.push(o); }
      else if (o.t === 'term') { s.term += o.n; got.push(o); }
      else if (o.t === 'tag') { s.tags += o.n; got.push(o); }
      else if (o.t === 'ink') { giveInk(env, o.n); got.push(o); }
      else if (o.t === 'item') got.push({ t: 'item', item: C.addItem(s, C.mkItem(s, o.k, 'supply', env.rnd, { stP: C.cv(env.cfg, 'stP') }), env) });
    }
    return { ok: true, got };
  };
  A.mission = (s, a, env) => {
    const i = Math.floor(+a.m), m = s.op.ms[i];
    if (!m) return { err: '没有这个任务' };
    if (s.op.done.includes(i)) return { err: '已经领过了' };
    if ((s.op.prog[i] || 0) < m.n) return { err: '还没完成' };
    s.op.done.push(i); s.op.earned += m.star;
    return { ok: true, star: m.star };
  };
  A.star = (s, a, env) => {
    const g = C.STAR_SHOP.find(x => x.id === a.id); if (!g) return { err: '没有这一项' };
    if (s.op.earned - s.op.spent < g.cost) return { err: '星章不够' };
    const r = env.rnd;
    let res = { ok: true };
    if (g.id === 'ink') giveInk(env, 300);
    else if (g.id === 'case') { const c = pickOf(r, C.REG); s.cases[c]++; res.c = c; }
    else if (g.id === 'tag') s.tags++;
    else if (g.id === 'term') s.term++;
    else {
      if (C.invFull(s)) return { err: '库存满了' };
      let k;
      if (g.id === 'cov') { if (!(C.isItem(a.k) && C.ITEM[a.k].tier === 'cov' && !C.isPrem(a.k))) return { err: '要从普通武器箱的赤霄级里挑一件' }; k = a.k; }
      else k = pickOf(r, C.ofTierReg(g.id));
      res.item = C.addItem(s, C.mkItem(s, k, 'op', r, { stP: C.cv(env.cfg, 'stP') }), env);
    }
    s.op.spent += g.cost;
    return res;
  };
  // 集齐一套收藏品的 4 款精铁：送这个武器箱一个和一张改名标签
  A.collect = (s, a, env) => {
    const col = own(C.COLS, a.c); if (!col || !col.mil.length) return { err: '没有这套收藏品' };
    if (s.cc.includes(a.c)) return { err: '已经领过了' };
    if (!col.mil.every(k => s.inv.some(x => x.k === k))) return { err: '还没集齐' };
    s.cc.push(a.c); s.cases[a.c]++; s.tags++;
    return { ok: true };
  };
  // 一局打完：记补给进度、行动任务、斩数（穿着斩数版的侠客每击倒一个对手 +1），再按概率掉一件
  A.matchEnd = (s, a, env) => {
    const c = a.ctx;
    if (!C.ctxOk(c)) return { err: '这局不算' };
    if (env.server) {   // 服务器上：要有开局时领的票，打够时间，两局之间隔开，每天有上限
      const tk = s.tk; s.tk = null;
      if (!tk || tk.mode !== c.mode || env.now - tk.t0 < C.MATCH_MIN_MS || env.now - tk.t0 > C.MATCH_MAX_MS) return { err: '这局时间不对，不算' };
      if (env.now - (s.last || 0) < C.MATCH_GAP_MS) return { err: '太快了，不算' };
      if (s.dm.n >= C.MATCH_DAY_CAP) return { err: '今天的对局奖励已经拿满了' };
    }
    s.last = env.now; s.dm.n++;
    rwMatch(s, c, env);
    const win = !!c.win;
    const combo = Math.max(0, Math.min(200, Math.floor(+c.combo || 0))), ults = Math.max(0, Math.min(30, Math.floor(+c.ults || 0)));
    s.drop.g++;
    bump(s, 'games', 1);
    if (win) bump(s, 'wins', 1);
    s.op.ms.forEach((m, i) => { if (m.id === 'hero' && win && c.char === m.h && !s.op.done.includes(i)) s.op.prog[i] = Math.min(m.n, (s.op.prog[i] || 0) + 1); });
    if (win && c.mode === 'cpu' && ['hard', 'impossible', 'god'].includes(c.level)) bump(s, 'hard', 1);
    if (win && c.flawless) bump(s, 'flaw', 1);
    if (combo) bump(s, 'combo', combo, true);
    if (ults) bump(s, 'ults', ults);
    if (c.mode === 'net') bump(s, 'net', 1);
    if (c.mode === 'tower') bump(s, 'tower', 1);
    if (c.mode === 'chaos') bump(s, 'chaos', 1);
    if (c.mode === 'tag3' && win) bump(s, 'tag3', 1);
    if (c.mode === '2v2') bump(s, 'duo', 1);
    const res = { ok: true, st: [] };
    let left = C.KO_MAX;
    for (const [h, v] of Object.entries(isObj(c.ko) ? c.ko : {}).slice(0, 3)) {   // 车轮战一局最多三位侠客
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;   // 只认正常的数字（1e400 这种会变成无穷大，不算）
      const add = Math.min(left, Math.max(0, n)), id = C.HERO_IDS.includes(h) && s.eq[h], eq = id && C.findItem(s, id);
      if (!add || !eq || eq.st < 0) continue;
      left -= add; eq.st += add;
      res.st.push({ i: eq.i, k: eq.k, add, total: eq.st });
    }
    const totalBefore = Object.values(s.heroKOs).reduce((sum, n) => sum + n, 0);
    let koLeft = C.KO_MAX;
    for (const [h, raw] of Object.entries(isObj(c.ko) ? c.ko : {}).slice(0, 3)) {
      if (!C.HERO_IDS.includes(h) || !Number.isFinite(+raw) || +raw <= 0 || koLeft <= 0) continue;
      const add = Math.min(koLeft, Math.floor(+raw));
      koLeft -= add;
      const old = s.heroKOs[h] || 0;
      s.heroKOs[h] = Math.min(1e6, old + add);
      if (old < 20 && s.heroKOs[h] >= 20) res.stanceUnlocks = (res.stanceUnlocks || []).concat(h);
    }
    const totalAfter = Object.values(s.heroKOs).reduce((sum, n) => sum + n, 0);
    const sigils = Math.floor(totalAfter / C.BADGE_SIGIL_KOS) - Math.floor(totalBefore / C.BADGE_SIGIL_KOS);
    if (sigils > 0) { s.badgeSigils = Math.min(1e6, s.badgeSigils + sigils); res.badgeSigils = sigils; }
    if (s.drop.n < C.cv(env.cfg, 'dropCap') && env.rnd() < C.cv(env.cfg, 'dropP') && !C.invFull(s)) {
      s.drop.n++;
      if (env.rnd() < 0.3) { const cid = pickOf(env.rnd, C.REG); s.cases[cid]++; res.drop = { t: 'case', c: cid }; }
      else res.drop = { t: 'item', item: C.addItem(s, C.mkItem(s, pickOf(env.rnd, C.ofTier(env.rnd() < 0.85 ? 'mil' : 'res')), 'drop', env.rnd, { stP: C.cv(env.cfg, 'stP') }), env) };
    }
    return res;
  };
  A.matchStart = (s, a, env) => {
    const mode = String(a.mode || '');
    if (!C.MODES.includes(mode)) return { err: '这个模式不记' };
    s.tk = { t0: env.now, mode };
    return { ok: true };
  };
  A.sync = () => ({ ok: true });
  // 全服全内容解锁（动态读取当前目录，不重复发放已有饰品；记录已发过的 promoKeys 以便未来新内容自动补齐而不刷旧饰品）
  C.applyPromoAll = (s, env, opts = {}) => {
    const first = !!opts.firstClaim || !s.promoAll;
    s.promoAll = 1;
    s.badgeGift = 1;
    if (first) {
      giveInk(env, C.UNIVERSAL_PROMO_INK);
      for (const cid of C.CASES) if (!C.COLS[cid].heirloom) s.cases[cid] = Math.min(1e6, (s.cases[cid] || 0) + C.UNIVERSAL_PROMO_CASES);
      s.term = Math.min(1e6, (s.term || 0) + 10);
      s.tags = Math.min(1e6, (s.tags || 0) + 10);
      s.badgeSigils = Math.min(1e6, (s.badgeSigils || 0) + 100);
    }
    const seenKeys = new Set(Array.isArray(s.promoKeys) ? s.promoKeys : []);
    const haveInv = new Set(s.inv.map(x => x.k));
    const haveLst = new Set((s.lst || []).map(L => L && L.it && L.it.k).filter(Boolean));
    let addedSkins = 0;
    for (const k of Object.keys(C.ITEM)) {
      if (C.isHeirloom(k)) continue;
      if (!seenKeys.has(k) && !haveInv.has(k) && !haveLst.has(k) && s.inv.length < C.INV_MAX) {
        C.addItem(s, C.mkItem(s, k, 'promo', env.rnd, { st: -1 }), env);
        haveInv.add(k);
        addedSkins++;
      }
      seenKeys.add(k);
    }
    s.promoKeys = Array.from(seenKeys);
    let addedBadges = 0;
    for (const bid of Object.keys(C.BADGES)) {
      if (s.badgeOwned[bid] !== 'purpgold') { s.badgeOwned[bid] = 'purpgold'; addedBadges++; }
    }
    let addedPets = 0;
    for (const pid of Object.keys(C.PETS)) {
      if (s.petOwned[pid] !== 'immortal') { s.petOwned[pid] = 'immortal'; addedPets++; }
    }
    const nonStd = Object.keys(C.SKILL_VARIANTS).filter(v => v !== 'std');
    let addedHeroes = 0, addedSkills = 0;
    for (const h of C.HERO_IDS) {
      if ((s.heroKOs[h] || 0) < 300) { s.heroKOs[h] = 300; addedHeroes++; }
      if (!isObj(s.skillUnlocks[h])) s.skillUnlocks[h] = {};
      for (const sl of C.SKILL_SLOTS) {
        const cur = Array.isArray(s.skillUnlocks[h][sl]) ? s.skillUnlocks[h][sl].slice() : [];
        for (const v of nonStd) if (!cur.includes(v)) { cur.push(v); addedSkills++; }
        s.skillUnlocks[h][sl] = cur;
      }
    }
    if (!Object.keys(s.badgeEquip || {}).length) A.badgeAutoAssign(s);
    const changed = first || addedSkins > 0 || addedBadges > 0 || addedPets > 0 || addedHeroes > 0 || addedSkills > 0;
    return { first, addedSkins, addedBadges, addedPets, addedHeroes, addedSkills, changed };
  };
  // 天工传世典藏密钥：一次性解锁全 20 款天工传世斩数版皮肤（不重复发放已有款式）
  C.applyHeirloomPromo = (s, env) => {
    const first = !s.heirloomPromo;
    s.heirloomPromo = 1;
    const haveInv = new Set(s.inv.map(x => x.k));
    const haveLst = new Set((s.lst || []).map(L => L && L.it && L.it.k).filter(Boolean));
    let addedSkins = 0;
    for (const k of C.HEIRLOOM_KEYS) {
      if (!haveInv.has(k) && !haveLst.has(k) && s.inv.length < C.INV_MAX) {
        C.addItem(s, C.mkItem(s, k, 'promo', env.rnd, { st: 0 }), env);
        haveInv.add(k);
        addedSkins++;
      }
    }
    const changed = first || addedSkins > 0;
    return { first, addedSkins, total: C.HEIRLOOM_KEYS.length, changed };
  };
  // 兑换码：码在服务器上核对，里面的东西在跑这一步之前就放进存档了；内置专属码也支持本机/离线存档
  A.claimCode = (s, a, env) => {
    const k = String((a && a.code) || '').trim().toUpperCase();
    if (k === C.UNIVERSAL_PROMO_CODE && !env.server) {
      const sum = C.applyPromoAll(s, env, { firstClaim: !s.promoAll });
      if (!sum.changed) return { err: '这个兑换码你已经领过了' };
      return { ok: true, promoAll: true, ...sum };
    }
    if (k === C.HEIRLOOM_PROMO_CODE && !env.server) {
      const sum = C.applyHeirloomPromo(s, env);
      if (!sum.changed) return { err: '这个兑换码你已经领过了' };
      return { ok: true, heirloomPromo: true, ...sum };
    }
    return env.server ? { ok: true } : { err: '礼包兑换码要连上服务器才能领' };
  };
  A.gift = (s, a, env) => {   // 第一次进武库：送一个初刃武器箱和一台货郎
    if (s.gift) return { err: '已经领过了' };
    s.gift = 1; s.cases.c1++; s.term++;
    return { ok: true };
  };
  // 每日、每周、活动任务：按服务器认的对局算进度，这天 / 这周 / 这次活动只领一次
  A.task = (s, a, env) => {
    const t = own(C.TASKS, a.id) ? C.TASKS[a.id] : null;
    if (!t) return { err: '没有这个任务' };
    const [per, k, n, ink] = t, r = s.rw;
    if (per === 'e' && !C.inEvent(env.now)) return { err: '活动已经结束了' };
    const got = per === 'd' ? r.dc : per === 'w' ? r.wc : null;
    if (got ? got.includes(a.id) : r.ec) return { err: '已经领过了' };
    if ((per === 'd' ? r.dp[k] : per === 'w' ? r.wp[k] : r.ev) < n) return { err: '任务还没完成' };
    if (got) got.push(a.id); else r.ec = 1;
    giveInk(env, ink);
    return { ok: true, gain: ink };
  };
  // 系统补偿（活动期间）、新手教程：每个号一次
  A.comp = (s, a, env) => {
    if (!C.inEvent(env.now)) return { err: '补偿已经结束了' };
    if (s.rw.comp) return { err: '已经领过了' };
    s.rw.comp = 1; giveInk(env, C.RW.comp);
    return { ok: true, gain: C.RW.comp };
  };
  A.tut = (s, a, env) => {
    if (s.rw.tut) return { err: '已经领过了' };
    s.rw.tut = 1; giveInk(env, C.RW.tut);
    return { ok: true, gain: C.RW.tut };
  };
  // 关卡星：每关每颗星只给一次（拿到更多星时补差）。重复报、报少了都不给，也不算错
  A.stars = (s, a, env) => {
    if (!C.stageOk(a.id)) return { err: '没有这一关' };
    const n = int(a.n, 0, 3), had = s.rw.ss[a.id] || 0;
    if (n <= had) return { ok: true, gain: 0 };
    s.rw.ss[a.id] = n;
    const gain = (n - had) * C.RW.star;
    giveInk(env, gain);
    return { ok: true, gain };
  };
  // 列传：每节第一次走完给一次（重走、刷新回来再走都不再给）；每部最多两个结局，每个结局给一次
  A.saga = (s, a, env) => {
    if (!C.HERO_IDS.includes(a.h)) return { err: '没有这位侠客' };
    const g = s.rw.sg[a.h] || (s.rw.sg[a.h] = { n: 0, e: [] });
    let gain = 0;
    const node = int(a.n, 0, C.RW.sagaNodes);
    if (node >= 1 && !(g.n & (1 << (node - 1))) && !g.e.length) { g.n |= 1 << (node - 1); gain += C.RW.sagaNode; }
    if (a.end !== undefined) {
      if (typeof a.end !== 'string' || !END_RE.test(a.end)) return { err: '没有这个结局' };
      if (!g.e.includes(a.end) && g.e.length < C.RW.sagaEnds) { g.e.push(a.end); gain += C.RW.sagaEnd; }
      g.n = (1 << C.RW.sagaNodes) - 1;   // 拿到结局以后再走的节都不给了（和以前一样）
    }
    if (gain) giveInk(env, gain);
    return { ok: true, gain };
  };
  C.ACTIONS = Object.keys(A);
  // 跑一个动作：先整理存档、结掉卖出去的挂单、把撤回的挂单退回库存，再做动作。出错时存档原样不动（先在副本上做）
  C.run = (state, name, args, env) => {
    if (!own(A, name)) return { res: { err: '不认识的操作' }, state };
    const s = C.normalize(JSON.parse(JSON.stringify(state || C.blank())), env);
    const ink0 = env.ink, skins0 = env.skins.slice(), equip0 = JSON.parse(JSON.stringify(env.equip));
    const sold = C.settle(s, env), back = C.unlist(s, env);
    let res;
    try { res = A[name](s, args || {}, env); } catch (e) { res = { err: '操作失败' }; }
    if (!res || res.err) {   // 失败了：动作本身改的全部撤回，只留下结算挂单的结果
      const s2 = C.normalize(JSON.parse(JSON.stringify(state || C.blank())), env);
      env.ink = ink0; env.skins.length = 0; env.skins.push(...skins0);
      Object.keys(env.equip).forEach(k => delete env.equip[k]); Object.assign(env.equip, equip0);
      env.inkGain = 0;
      if (env.mkt) env.mkt.out = null;
      const sold2 = C.settle(s2, env), back2 = C.unlist(s2, env);
      return { res: res || { err: '操作失败' }, state: s2, sold: sold2, back: back2 };
    }
    return { res, state: s, sold, back };
  };

  // 冻结所有数据表：控制台里改概率、价格、收藏品都没用
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
  deepFreeze(C);
  if (!G.ArmoryCore) Object.defineProperty(G, 'ArmoryCore', { value: C, writable: false, configurable: false, enumerable: false });
})(typeof globalThis !== 'undefined' ? globalThis : this);
