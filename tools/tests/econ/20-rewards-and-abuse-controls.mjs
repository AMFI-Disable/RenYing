// 武库经济测试第 20 段：由 tools/tests/econ-test.mjs 按文件名顺序拼起来，和前面几段共用同一个本机 Worker 和数据库。
//
// 本段的小节（共 14 节，测试失败时按小节标题搜）：
//    1. 乱填参数：负数、超大数、不存在的东西、混档熔铸
//    2. 只有墨锭：没有充值、玉珏和钥匙；兑换码只有管理后台建的免费礼包码（下面单独测）
//    3. 第 1 版的武库存档：读进来自动换成新版
//    4. 第 2 版的武库存档：每周买箱的次数去掉，箱子买卖记录照旧
//    5. 第 3 版的武库存档：卖给系统的挂单全部退回，武器箱和货郎的挂单也退回
//    6. 不能套利：系统不定饰品的价、也不收购；墨锭只有对局、补给、星章和卖给别的玩家能拿到
//    7. 墨锭账本：本地收入按条记、每天有额度、重复的不记
//    8. 额度跟着对局走：打满一天，额度到 6000 封顶；记着的最多 4000
//    9. 撤回：反作弊作废的只有点名的那几条，按服务器当时认的数扣；花销撤不了；扣不成负数
//   10. 账本和武库一起动：本地收入不会把武库的钱冲掉
//   11. 一键出售重复饰品：保留最高斩数，多余重复折算墨锭
//   12. 伪造皮肤：存档里塞武库皮肤没用；卖掉的皮肤旧存档加不回来
//   13. 对局奖励：要开局领票、打够时间、隔开、每天有上限
//   14. 限速、封号、登录爆破
const MCTX = { mode: 'cpu', level: 'hard', char: 'qingfeng', win: true, rounds: 2, flawless: false, combo: 5, ults: 1 };
{
  T = nextNoon();
  const u = await newUser('zhanshu', { ink: 5000 });
  await econ(u.token, 'sync');
  const L1 = { st: 4 }, L2 = { st: 9 };
  const [it, it2, plain] = grant(u.uid, [{ k: 'qf_p1', st: L1.st }, { k: 'ts_p1', st: L2.st }, { k: 'qf_p1' }]);
  ok(stateOf(u.uid).inv.length === 3, '库存里有两件斩数版（两位侠客）和一件普通版');
  const h = C.charOf(it.k), h2 = C.charOf(it2.k);
  await econ(u.token, 'equip', { i: it.i }); await econ(u.token, 'equip', { i: it2.i });
  const play = async (ko, raw) => {
    await econ(u.token, 'matchStart', { mode: 'cpu' }); T += 21000;
    const ctx = raw ? `{"mode":"cpu","level":"hard","char":"${h}","win":true,"ko":${raw}}` : JSON.stringify({ ...MCTX, char: h, ko });
    const r = await call('POST', '/api/econ', `{"act":"matchEnd","nonce":"${nonce()}","args":{"ctx":${ctx}}}`, u.token);
    T += 16000; return r;
  };
  const r1 = await play({ [h]: 3 });
  const st1 = itemOf(u.uid, it.i).st;
  ok(r1.res.ok && st1 === L1.st + 3 && r1.res.st.length === 1 && r1.res.st[0].add === 3 && r1.res.st[0].total === st1, '击倒 3 个：斩数 +3', r1.res);
  await play({ [h]: 999 });
  ok(itemOf(u.uid, it.i).st === st1 + C.KO_MAX, `一局最多记 ${C.KO_MAX} 斩`, itemOf(u.uid, it.i).st - st1);
  const st2 = itemOf(u.uid, it.i).st;
  await play({ [h]: 10, [h2]: 10 });
  ok(itemOf(u.uid, it.i).st + itemOf(u.uid, it2.i).st === st2 + L2.st + C.KO_MAX, `车轮战几位侠客加起来也最多 ${C.KO_MAX} 斩`);
  const st3 = itemOf(u.uid, it.i).st, s23 = itemOf(u.uid, it2.i).st;
  const others = C.HERO_IDS.filter(x => x !== h && x !== h2);
  await play({ [others[0]]: 1, [others[1]]: 1, [others[2]]: 1, [h]: 5 });
  ok(itemOf(u.uid, it.i).st === st3, '一局最多看三位侠客，多报的不算');
  for (const raw of [`{"${h}":-5}`, `{"${h}":"abc"}`, `{"${h}":1e400}`, `{"__proto__":{"${h}":9}}`, `[3]`, `"lots"`, `{"nobody":5}`]) await play(null, raw);
  ok(itemOf(u.uid, it.i).st === st3 && itemOf(u.uid, it2.i).st === s23, '负数、不是数、原型链、编出来的侠客：都不记');
  await econ(u.token, 'unequip', { char: h });
  await play({ [h]: 2 });
  ok(itemOf(u.uid, it.i).st === st3, '脱下以后不记');
  await econ(u.token, 'equip', { i: it.i });
  const nt = await econ(u.token, 'matchEnd', { ctx: { ...MCTX, char: h, ko: { [h]: 2 } } });
  ok(nt.res.err && itemOf(u.uid, it.i).st === st3, '没领开局票的对局不记', nt.res);
  await econ(u.token, 'equip', { i: plain.i });
  await play({ [h]: 4 });
  ok(itemOf(u.uid, plain.i).st === -1 && itemOf(u.uid, it.i).st === st3, '穿的是普通版：不记，也不会记到没穿的那件上');
  const v = await newUser('zhanshu2', { ink: 5000 });
  await econ(v.token, 'sync');
  const li = await econ(u.token, 'list', { i: it.i, price: 99 });
  const bv = await econ(v.token, 'buy', { l: li.res.l });
  ok(bv.res.ok && bv.res.item.st === st3, '斩数版卖给别人，斩数跟着走', bv.res);
}

section('乱填参数：负数、超大数、不存在的东西、混档熔铸');
{
  const u = await newUser('fuzzer', { ink: 5000 });
  await econ(u.token, 'gift');
  const o = await econ(u.token, 'open', { c: 'c1' });
  const it = o.res.item;
  for (const price of [-5, 0, 'abc', 1e12, null, NaN, Infinity]) {
    const r = await econ(u.token, 'list', { i: it.i, price });
    ok(r.res.err, `挂单标价 ${String(price)} 被拒绝`, r.res);
  }
  const ink0 = inkOf(u.uid);
  for (const n of [-10, 0, 1e9, 'x']) {
    const r = await econ(u.token, 'buyTerm', { n });
    ok(r.res.err && inkOf(u.uid) === ink0, `买 ${n} 台货郎被拒绝`);
  }
  for (const c of ['c9', '__proto__', 'constructor', null]) ok((await econ(u.token, 'buyCase', { c })).res.err && inkOf(u.uid) === ink0, `买不存在的武器箱 ${c} 被拒绝`);
  for (const l of ['0123456789abcdef', '__proto__', 'constructor', { a: 1 }]) ok((await econ(u.token, 'buy', { l })).res.err && inkOf(u.uid) === ink0, `编出来的挂单 ${JSON.stringify(l)} 买不了`);
  ok((await econ(u.token, 'cancel', { l: '0123456789abcdef' })).res.err, '撤不存在的挂单什么也不做');
  const t1 = await econ(u.token, 'trade', { ids: [it.i, it.i, it.i, it.i, it.i, it.i, it.i, it.i, it.i, it.i] });
  ok(t1.res.err && stateOf(u.uid).inv.length === 1, '同一件放 10 次的熔铸契被拒绝', t1.res);
  const t2 = await econ(u.token, 'trade', { ids: [it.i, 9999, 9998, 9997, 9996, 9995, 9994, 9993, 9992, 9991] });
  ok(t2.res.err, '拿别人的 / 不存在的饰品熔铸被拒绝');
  const t3 = await econ(u.token, 'trade', { ids: 'all' });
  ok(t3.res.err, '熔铸材料不是数组被拒绝');
  const r1 = await econ(u.token, 'star', { id: 'cov', k: 'gc_wolf' });
  ok(r1.res.err, '星章不够不能换');
  const bogus = await call('POST', '/api/econ', { act: 'constructor', args: {}, nonce: nonce() }, u.token);
  ok(bogus.status === 400, '不存在的动作名被拒绝', bogus);
  const s0 = stateOf(u.uid);
  const pol = await call('POST', '/api/econ', '{"act":"sync","nonce":"' + nonce() + '","args":{"__proto__":{"ok":true,"term":99,"tags":99}}}', u.token);
  ok(pol.ok && stateOf(u.uid).term === s0.term && stateOf(u.uid).tags === s0.tags && ({}).term === undefined, '原型污染无效', [stateOf(u.uid).term, s0.term]);
  const sup = await econ(u.token, 'supply', { picks: [0, 1.5] });
  ok(sup.res.err, '补给挑小数位置被拒绝');
  const w0 = row('SELECT ver FROM econ WHERE uid = ?', u.uid).ver;
  await econ(u.token, 'sync'); await econ(u.token, 'sync');
  ok(row('SELECT ver FROM econ WHERE uid = ?', u.uid).ver === w0, '什么都没变的请求不写数据库');
  const big = await call('POST', '/api/econ', { act: 'sync', nonce: nonce(), args: { x: 'a'.repeat(5000) } }, u.token);
  ok(big.status === 413, '参数太大被拒绝');
  const huge = await call('POST', '/api/profile', { profile: { x: 'a'.repeat(400000) } }, u.token);
  ok(huge.status === 413, '超大存档被拒绝');
  const nt = await call('POST', '/api/econ', { act: 'sync', nonce: nonce() });
  ok(nt.status === 401, '没登录不能动武库');
}

section('只有墨锭：没有充值、玉珏和钥匙；兑换码只有管理后台建的免费礼包码（下面单独测）');
{
  const u = await newUser('nopay');
  for (const act of ['topup', 'redeem', 'age', 'buyKey']) {
    const r = await call('POST', '/api/econ', { act, args: { t: 0, code: 'YJ-100-AAAAAA-BBBBBBBBBB', age: 'adult' }, nonce: nonce() }, u.token);
    ok(r.status === 400, `没有“${act}”这个操作`, r);
  }
  for (const id of ['key1', 'key5', 'keyink']) ok((await econ(u.token, 'store', { id })).res.err, `商店不卖 ${id}`);
  const s = (await econ(u.token, 'sync')).state;
  ok(!['jade', 'keys', 'orders', 'age', 'codes'].some(k => k in s), '存档里没有玉珏、钥匙、充值记录这些字段', Object.keys(s));
  ok(!C.ACTIONS.some(a => /topup|redeem|pay|jade|^age$|key/i.test(a)), '规则核心里也没有这些动作', C.ACTIONS);
  const h = await call('GET', '/api/health');
  ok(h.econ === C.VER && C.VER === 4, '服务器报的规则版本是 4（网页据此判断服务器是不是新版）', h);
  ok(!C.ACTIONS.some(a => ['quick', 'sellCase', 'sellTerm'].includes(a)), '也没有卖给系统的动作：饰品只能卖给别的玩家', C.ACTIONS);
}

section('第 1 版的武库存档：读进来自动换成新版');
{
  const u = await newUser('legacy');
  await econ(u.token, 'sync');   // 建账
  const v1 = { v: 1, jade: 300, keys: 2, tags: 1, nid: 4, gift: 1, lst: [], hist: [], orders: [{ id: 'x', jade: 300 }], age: 'adult',
    inv: [{ i: 1, k: 'qf_p1', st: 7, f: 0.31, p: 512, n: '老刀', t: T - 1e6, src: 'case' }, { i: 2, k: 'gc_wolf', st: -1, f: 0.02, p: 1, n: '', t: T - 1e6, src: 'case' }],
    cases: { c1: 1, c2: 2, c3: 0 }, via: ['qf_p1', 'gc_wolf'], eq: { gouchen: 2 } };
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ? WHERE uid = ?').run(JSON.stringify(v1), u.uid);
  const r = await econ(u.token, 'sync');
  const s = stateOf(u.uid);
  ok(r.state.v === C.VER && s.v === C.VER, '服务器上的存档换成新版并写回', s.v);
  ok(s.term === 2 && !('keys' in s) && !('jade' in s) && !('orders' in s), '没用完的 2 把钥匙换成 2 台货郎，玉珏和充值记录去掉', s);
  ok(s.cases.c1 === 1 && s.cases.c2 === 2 && s.cases.c6 === 0 && s.cases.c7 === 0, '武器箱照旧，多了几种新箱子');
  ok(s.inv.length === 2 && s.inv[0].st === 7 && s.inv[0].n === '老刀' && !('f' in s.inv[0]) && !('p' in s.inv[0]), '饰品、斩数、名字照旧，磨损和图案模板去掉', s.inv);
  ok(s.eq.gouchen === 2 && profOf(u.uid).skins.includes('gc_wolf'), '穿着的照旧，皮肤还能穿');
  await econ(u.token, 'sync');
  ok(stateOf(u.uid).term === 2, '只换一次（再读不会再多给货郎）');
}

section('第 2 版的武库存档：每周买箱的次数去掉，箱子买卖记录照旧');
{
  T = nextNoon();
  const u = await newUser('legacy2');
  await econ(u.token, 'sync');
  const v2 = { v: 2, tags: 0, term: 1, tm: null, nid: 3, gift: 1, cases: { c1: 0, c2: 6, c3: 1, c4: 0, c5: 0, c6: 0 }, cw: { w: C.week(C.day(T)), n: 5 },
    inv: [{ i: 1, k: 'yh_p1', st: -1, n: '', t: T - 1e6, src: 'case' }], via: ['yh_p1'], eq: {},
    lst: [{ l: 'L9', it: { i: 2, k: 'ls_plum', st: 12, n: '', t: T - 1e6, src: 'case' }, price: 50, t: T - 1e5, at: 0 }],
    hist: [{ t: T - 1e5, kind: 'buy', c: 'c2', n: 3, price: 660 }, { t: T - 2e5, kind: 'sell', k: 'qf_p1', st: -1, price: 20 }] };
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ? WHERE uid = ?').run(JSON.stringify(v2), u.uid);
  const r = await econ(u.token, 'sync');
  const s = stateOf(u.uid);
  ok(r.state.v === C.VER && s.v === C.VER && !('cw' in s) && s.od.n === 0 && s.pw.n === 0, '换成新版：每周买箱的次数去掉，今天还能开 5 个', s);
  ok(s.cases.c2 === 6 && s.cases.c3 === 1 && s.cases.c7 === 0 && s.term === 1, '武器箱和货郎照旧');
  ok(s.inv.length === 2 && !s.lst.length && s.inv.some(x => x.k === 'ls_plum' && x.st === 12) && s.nid > 2, '以前卖给系统的挂单撤下，饰品（连斩数）退回库存', [s.inv, s.lst]);
  ok(s.hist[0].g === 'c2' && s.hist[0].n === 3 && !('c' in s.hist[0]) && s.hist[1].k === 'qf_p1', '第 2 版的买箱记录换成新的写法', s.hist);
  const ro = []; for (let i = 0; i < 6; i++) ro.push(await econ(u.token, 'open', { c: 'c2' }));
  ok(ro.slice(0, 5).every(x => x.res.ok) && ro[5].res.err && ro[5].res.err.includes('明天'), '接着开：今天开 5 个，第 6 个等明天');
}

section('第 3 版的武库存档：卖给系统的挂单全部退回，武器箱和货郎的挂单也退回');
{
  T = nextNoon();
  const u = await newUser('legacy3');
  await econ(u.token, 'sync');
  const v3 = { v: 3, tags: 0, term: 0, tm: null, nid: 5, gift: 1, cases: { c1: 0, c2: 0, c3: 0, c4: 1, c5: 0, c6: 0, c7: 0 }, inv: [], via: ['qf_p1'], eq: {},
    lst: [{ l: 'L1', it: { i: 1, k: 'qf_p1', st: 3, n: '', t: T - 1e6, src: 'case' }, price: 50, t: T - 1e5, at: T + 1e9 }, { l: 'L2', g: 'c4', price: 200, t: T - 1e5, at: T + 1e9 }, { l: 'L3', g: 'term', price: 300, t: T - 1e5, at: T + 1e9 }],
    hist: [], bought: { d: C.day(T), ids: ['x'] } };
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ? WHERE uid = ?').run(JSON.stringify(v3), u.uid);
  const s = (await econ(u.token, 'sync')).state;
  ok(s.v === C.VER && !s.lst.length && s.inv.length === 1 && s.inv[0].st === 3 && s.cases.c4 === 2 && s.term === 1 && !('bought' in s), '饰品、武器箱、货郎都退回来，“今天买过哪几单”也去掉', s);
  ok(!row('SELECT COUNT(*) AS n FROM mkt WHERE seller = ?', u.uid).n, '旧挂单不会出现在玩家市场上');
}

section('不能套利：系统不定饰品的价、也不收购；墨锭只有对局、补给、星章和卖给别的玩家能拿到');
{
  const income = ['matchEnd', 'supply', 'star', 'sellDupes', 'task', 'comp', 'tut', 'stars', 'saga'];   // 规则里会加墨锭的动作（加上结算挂单与出售重复饰品；任务、补偿、教程、关卡星、列传每份只给一次，下面单独测）
  const R = C.rng(99), env = () => ({ now: T, rnd: R, uid: 'arb', ink: 1000, skins: [], equip: {}, server: true });
  const rich = () => { const s = C.blank(); s.cases = Object.fromEntries(C.CASES.map(c => [c, 3])); s.term = 3; s.tags = 3; s.gift = 0;
    for (let i = 1; i <= 12; i++) s.inv.push({ i, k: C.ofTier('mil')[i % 4], st: -1, n: '', t: T, src: 'case' }); s.nid = 13; return s; };
  let gained = [];
  const argsOf = { open: { c: 'c1' }, buyCase: { c: 'c1', n: 1 }, buyTerm: { n: 1 }, store: { id: 'tag' }, trade: { ids: Array.from({ length: 10 }, (_, i) => i + 1) }, rename: { i: 1, name: 'x' }, equip: { i: 1 }, unequip: { char: 'qingfeng' }, unseal: {}, gift: {}, collect: { c: 'c1' }, mission: { m: 0 }, list: { i: 1, price: 5 }, buy: { l: '0123456789abcdef' }, cancel: { l: '0123456789abcdef' }, sync: {}, matchStart: { mode: 'cpu' }, sellDupes: {} };
  for (const a of C.ACTIONS) {
    if (income.includes(a)) continue;
    for (let k = 0; k < 20; k++) {
      const e = env(), r = C.run(rich(), a, argsOf[a] || {}, e);
      if (e.ink > 1000) gained.push([a, e.ink - 1000, r.res]);
    }
  }
  ok(!gained.length, '除了对局、补给、星章，没有哪个动作能凭空加墨锭（开箱、熔铸、货郎、商店都只花不赚）', gained.slice(0, 3));
  const e = env(), s = rich(); s.tm = { t0: T, n: 1, o: C.termOffer(R) };
  C.run(s, 'termBuy', { n: 1 }, e);
  ok(e.ink <= 1000, '货郎只能花钱买下，不能反过来卖给它');
  ok(C.TERM.markup[0] >= 1.2 && C.TIERS.every(t => C.BASE[t] > 0), `货郎报价不低于基准价的 ${C.TERM.markup[0]} 倍`);
  ok(C.FEE === 0.15 && C.net(100) === 85 && C.net(1) === 0, '玩家之间成交扣 15% 手续费（墨锭从这里流出去）');
}

section('墨锭账本：本地收入按条记、每天有额度、重复的不记');
async function playMatches(tok, want) {   // 按规矩打 want 局服务器认可的对局
  let n = 0;
  for (let i = 0; i < want * 2 && n < want; i++) {
    await econ(tok, 'matchStart', { mode: 'cpu' }); T += 21000;
    const r = await econ(tok, 'matchEnd', { ctx: MCTX });
    if (r.status === 429) { T += 61000; continue; }
    if (r.res && r.res.ok) n++;
  }
  return n;
}
{
  T = nextNoon();
  const u = await newUser('earner', { ink: 1000 });
  const p = await call('GET', '/api/profile', undefined, u.token);
  ok(p.profile.ink === 1000 && p.ledger.ink === 1000, '读档时墨锭以服务器为准');
  const d1 = { id: 'aaaaaaaa01', d: 60 }, d2 = { id: 'aaaaaaaa02', d: -540 };
  const r1 = await call('POST', '/api/profile', { profile: { ...p.profile, ink: 520 }, ledger: { deltas: [d1, d2], ev: p.ledger.ver } }, u.token);
  ok(r1.ok && r1.ledger.ink === 520 && inkOf(u.uid) === 520, '赚 60、花 540：服务器记成 520', r1.ledger);
  ok(r1.ledger.acks.includes('aaaaaaaa01') && r1.ledger.acks.includes('aaaaaaaa02'), '回执里有这两条');
  const r2 = await call('POST', '/api/profile', { profile: { ...p.profile, ink: 520 }, ledger: { deltas: [d1, d2], ev: r1.ledger.ver } }, u.token);
  ok(inkOf(u.uid) === 520, '同一条重发不重复记', inkOf(u.uid));
  const r3 = await call('POST', '/api/profile', { profile: { ...p.profile, ink: 999999 }, ledger: { deltas: [{ id: 'bbbbbbbb01', d: 4000 }, { id: 'bbbbbbbb02', d: 4000 }], ev: r2.ledger.ver } }, u.token);
  ok(inkOf(u.uid) === 520 + 1440 && r3.capped === 8000 - 1440 && r3.owed === 0, '一局没打：一天只认 1500（前面那 60 也算在内）；单条太大的，超出的不记着', [inkOf(u.uid), r3.capped, r3.owed]);
  ok(profOf(u.uid).ink === inkOf(u.uid), '存档里的墨锭跟着账本走，不信客户端报的 999999');
  ok(await playMatches(u.token, 1) === 1, '按规矩打完一局');
  const r4 = await call('POST', '/api/profile', { profile: { ...p.profile }, ledger: { deltas: [{ id: 'bbbbbbbb03', d: 100 }], ev: r3.ledger.ver } }, u.token);
  ok(inkOf(u.uid) === 1960 + 80 && r4.capped === 20 && r4.owed === 20, '打了一局额度多 80；超出的 20 先记着', [inkOf(u.uid), r4.capped, r4.owed]);
  T = nextNoon();
  const r5 = await call('POST', '/api/profile', { profile: { ...p.profile }, ledger: { deltas: [{ id: 'cccccccc01', d: 100 }], ev: r4.ledger.ver } }, u.token);
  ok(inkOf(u.uid) === 2040 + 100 + 20 && r5.owed === 0, '第二天额度重新算，记着的 20 也补上了', [inkOf(u.uid), r5.owed]);
  const old = await call('POST', '/api/profile', { profile: { ...p.profile, ink: 100000 } }, u.token);
  ok(old.ok && inkOf(u.uid) === 2160 + 1380, '老版本网页直接报墨锭：差额也按额度算', inkOf(u.uid));
  const ac0 = await call('GET', '/api/ac', undefined, u.token);
  ok(ac0.rec.strikes === 0 && row("SELECT COUNT(*) AS n FROM econ_log WHERE uid = ? AND act = 'ink_spike'", u.uid).n === 1, '一次报几万墨锭：只认额度、记进流水账给管理员看（导入老账号也会这样，不自动封）', ac0.rec);
  const v = await newUser('earner2');
  await call('POST', '/api/profile', { profile: { ink: 0 }, ledger: { deltas: [{ id: 'dddddddd01', d: -99999 }], ev: 0 } }, v.token);
  ok(inkOf(v.uid) === 0, '墨锭不会被扣成负数');
  const bad = await call('POST', '/api/profile', { profile: {}, ledger: { deltas: [{ id: 'x', d: 50 }, { id: 'eeeeeeee01', d: 'NaN' }, { id: 'eeeeeeee02', d: 1e308 }], ev: 0 } }, v.token);
  ok(bad.ok && inkOf(v.uid) <= 1500, '编号不合格的、数不对的上报都按规矩处理', inkOf(v.uid));
}

section('额度跟着对局走：打满一天，额度到 6000 封顶；记着的最多 4000');
{
  T = nextNoon();
  const u = await newUser('allowance');
  const ink0 = inkOf(u.uid);
  ok(await playMatches(u.token, 60) === 60 && stateOf(u.uid).dm.n === 60, '今天按规矩打了 60 局', stateOf(u.uid).dm);
  const ds = n => Array.from({ length: n }, (_, i) => ({ id: 'hh' + Math.floor(rnd36()) + i, d: 2000 }));
  const r1 = await call('POST', '/api/profile', { profile: {}, ledger: { deltas: ds(4), ev: 0 } }, u.token);
  ok(inkOf(u.uid) === ink0 + 6000 && r1.capped === 2000 && r1.owed === 2000, '额度最多 6000，多出来的那条 2000 先记着', [inkOf(u.uid) - ink0, r1.capped, r1.owed]);
  const r2 = await call('POST', '/api/profile', { profile: {}, ledger: { deltas: ds(3), ev: 0 } }, u.token);
  ok(r2.owed === 4000 && inkOf(u.uid) === ink0 + 6000, '记着的最多 4000，再多的不记', [r2.owed, inkOf(u.uid) - ink0]);
  T = nextNoon();
  const r3 = await call('POST', '/api/profile', { profile: {}, ledger: { deltas: [], ev: 0 } }, u.token);
  ok(inkOf(u.uid) === ink0 + 7500 && r3.owed === 2500, '第二天没打对局：额度 1500 先拿去补记着的', [inkOf(u.uid) - ink0, r3.owed]);
}

section('撤回：反作弊作废的只有点名的那几条，按服务器当时认的数扣；花销撤不了；扣不成负数');
{
  T = nextNoon();
  const u = await newUser('revoker', { ink: 500 });
  const post = deltas => call('POST', '/api/profile', { profile: {}, ledger: { deltas, ev: 0 } }, u.token);
  const ink0 = inkOf(u.uid);
  await post([{ id: 'ra000001', d: 300 }, { id: 'ra000002', d: 5000 }]);
  ok(inkOf(u.uid) === ink0 + 1500, '先报 300 和 5000：今天额度 1500，认了 300 + 1200', inkOf(u.uid) - ink0);
  const r1 = await post([{ id: 'ra000003', d: 0, r: ['ra000002'] }]);
  ok(inkOf(u.uid) === ink0 + 300 && r1.ledger.acks.includes('ra000003'), '撤回那条 5000：只扣回当时认的 1200，前面的 300 和原来的余额不动', inkOf(u.uid) - ink0);
  await post([{ id: 'ra000004', d: 0, r: ['ra000002', 'ra000002', 'ra000001x'] }]);
  ok(inkOf(u.uid) === ink0 + 300, '同一条撤两次不会多扣', inkOf(u.uid) - ink0);
  await post([{ id: 'ra000005', d: 99999, r: [] }]);
  ok(inkOf(u.uid) === ink0 + 300, '撤回条目自己带的数不算', inkOf(u.uid) - ink0);

  T = nextNoon();
  const ink1 = inkOf(u.uid);
  await post([{ id: 'rb000001', d: 0, r: ['rb000002', 'rb000004'] }]);
  const v = await post([{ id: 'rb000002', d: 700 }]);
  ok(inkOf(u.uid) === ink1 && v.ledger.acks.includes('rb000002'), '撤回先到、收入后到：这条收入不记（回执照样有它，客户端会划掉）', inkOf(u.uid) - ink1);
  await post([{ id: 'rb000003', d: 700 }]);
  ok(inkOf(u.uid) === ink1 + 700, '作废的那条不占今天的额度，别的收入照常记', inkOf(u.uid) - ink1);
  await post([{ id: 'rb000004', d: -200 }]);
  ok(inkOf(u.uid) === ink1 + 500, '撤回点名的是一笔花销：照扣，花销撤不了', inkOf(u.uid) - ink1);
  await post([{ id: 'rb000005', d: -100 }]);
  await post([{ id: 'rb000006', d: 0, r: ['rb000005'] }]);
  ok(inkOf(u.uid) === ink1 + 400, '已经记上的花销被撤回：什么都不变', inkOf(u.uid) - ink1);

  T = nextNoon();
  const ink2 = inkOf(u.uid);
  await post([{ id: 'rc000001', d: 1500 }]);
  const q1 = await post([{ id: 'rc000002', d: 2000 }]);
  ok(inkOf(u.uid) === ink2 + 1500 && q1.owed === 2000, '额度用完，这条 2000 先记着', [inkOf(u.uid) - ink2, q1.owed]);
  const q2 = await post([{ id: 'rc000003', d: 0, r: ['rc000002'] }]);
  ok(inkOf(u.uid) === ink2 + 1500 && q2.owed === 0, '撤回它：记着的也一起划掉', [inkOf(u.uid) - ink2, q2.owed]);
  await post([{ id: 'rc000004', d: 2000 }]);
  T = nextNoon();
  const q3 = await post([]);
  ok(inkOf(u.uid) === ink2 + 3000 && q3.owed === 500, '第二天补上 1500，还记着 500', [inkOf(u.uid) - ink2, q3.owed]);
  const q4 = await post([{ id: 'rc000005', d: 0, r: ['rc000004'] }]);
  ok(inkOf(u.uid) === ink2 + 1500 && q4.owed === 0, '撤回那条：补上的 1500 扣回，还记着的 500 划掉', [inkOf(u.uid) - ink2, q4.owed]);

  const w = await newUser('revoker2', { ink: 0 });
  const postW = deltas => call('POST', '/api/profile', { profile: {}, ledger: { deltas, ev: 0 } }, w.token);
  await postW([{ id: 'rd000001', d: 1000 }, { id: 'rd000002', d: -900 }]);
  await postW([{ id: 'rd000003', d: 0, r: ['rd000001'] }]);
  ok(inkOf(w.uid) === 0, '假墨锭已经花掉了：撤回扣到 0 为止，不会变成负数', inkOf(w.uid));
  const bad = await postW([{ id: 'rd000004', d: 0, r: 'rd000001' }, { id: 'rd000005', d: 0, r: [1, null, {}, 'x'.repeat(40)] }]);
  ok(bad.ok && inkOf(w.uid) === 0, '撤回里乱填的编号不出错', bad);
}

section('账本和武库一起动：本地收入不会把武库的钱冲掉');
{
  const u = await newUser('mixer', { ink: 2000 });
  const p = await call('GET', '/api/profile', undefined, u.token);
  const b = await econ(u.token, 'buyCase', { c: 'c2', n: 2 });
  const cost = b.res.price;
  // 客户端还没收到武库回包就同步了一次存档（存档里的墨锭是旧的，但账本只报本地的那 +40）
  const r = await call('POST', '/api/profile', { profile: { ...p.profile, ink: 2040 }, ledger: { deltas: [{ id: 'ffffffff01', d: 40 }], ev: p.ledger.ver } }, u.token);
  ok(inkOf(u.uid) === 2000 - cost + 40, '旧存档里的墨锭数不会覆盖武库的花销', [inkOf(u.uid), 2000 - cost + 40]);
  ok(r.ledger.ink === inkOf(u.uid), '回执的墨锭对');
}


section('一键出售重复饰品：保留最高斩数，多余重复折算墨锭');
{
  const u = await newUser('duper', { ink: 500 });
  await econ(u.token, 'sync');
  // 注入测试库存：3 件相同饰品 qf_frost，斩数分别为 5, 20, -1；以及 2 件相同的 fy_jade（普通版）
  const st0 = stateOf(u.uid);
  st0.inv.push(
    { i: 101, k: 'qf_frost', st: 5, n: '', t: T, src: 'case' },
    { i: 102, k: 'qf_frost', st: 20, n: '', t: T, src: 'case' },
    { i: 103, k: 'qf_frost', st: -1, n: '', t: T, src: 'case' },
    { i: 104, k: 'fy_jade', st: -1, n: '', t: T, src: 'case' },
    { i: 105, k: 'fy_jade', st: -1, n: '', t: T, src: 'case' }
  );
  st0.nid = 106;
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ? WHERE uid = ?').run(JSON.stringify(st0), u.uid);

  const plan = C.dupePlan(stateOf(u.uid));
  ok(plan.items.length === 3, 'dupePlan 找出 3 件待出售重复饰品（qf_frost 2件，fy_jade 1件）', plan.items.length);
  ok(plan.byKey['qf_frost'].kept.i === 102 && plan.byKey['qf_frost'].kept.st === 20, 'qf_frost 保留斩数最高的第 102 号（20斩）');

  const inkBefore = inkOf(u.uid);
  const r = await econ(u.token, 'sellDupes');
  ok(r.res.ok && r.res.count === 3, 'sellDupes 成功出售 3 件', r.res);
  const stAfter = stateOf(u.uid);
  ok(stAfter.inv.length === 2, '出售后库存剩余 2 件（每款仅留一件最高斩数）', stAfter.inv.length);
  const remainingFrost = stAfter.inv.find(x => x.k === 'qf_frost');
  ok(remainingFrost && remainingFrost.i === 102 && remainingFrost.st === 20, '剩余的 qf_frost 确实是最高斩数的那件');
  ok(inkOf(u.uid) === inkBefore + r.res.totalGain, '出售获得相应墨锭并到账');

  const rEmpty = await econ(u.token, 'sellDupes');
  ok(rEmpty.res.err && rEmpty.res.err.includes('没有重复'), '无重复时再次出售被拒绝');

  // 测试自动挂牌到市场 listDupes
  const stFresh = stateOf(u.uid);
  stFresh.inv.push(
    { i: 201, k: 'qf_frost', st: 10, n: '', t: T, src: 'case' },
    { i: 202, k: 'qf_frost', st: -1, n: '', t: T, src: 'case' }
  );
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ? WHERE uid = ?').run(JSON.stringify(stFresh), u.uid);
  const rList = await econ(u.token, 'listDupes');
  ok(rList.res.ok && rList.res.count === 2, 'listDupes 成功将 2 件重复饰品挂牌到市场', rList.res);
  const stListed = stateOf(u.uid);
  ok(stListed.lst.length === 2 && stListed.lst.every(x => x.it.k === 'qf_frost'), '市场上出现自动挂牌的饰品单');
}

section('伪造皮肤：存档里塞武库皮肤没用；卖掉的皮肤旧存档加不回来');
{
  const u = await newUser('skinner', { ink: 3000 });
  const p = await call('GET', '/api/profile', undefined, u.token);
  const r = await call('POST', '/api/profile', { profile: { ...p.profile, skins: ['gc_wolf', 'zx_moon', 'lm_jiuxiao', 'qf_frost'], equip: { gouchen: 'gc_wolf', leiming: 'lm_jiuxiao', qingfeng: 'qf_frost' } }, ledger: { deltas: [], ev: p.ledger.ver } }, u.token);
  const pr = profOf(u.uid);
  ok(!pr.skins.includes('gc_wolf') && !pr.skins.includes('zx_moon') && !pr.skins.includes('lm_jiuxiao') && pr.skins.includes('qf_frost'), '武库专属皮肤被拿掉、以前得到的原有皮肤保留', pr.skins);
  ok(!pr.equip.gouchen && !pr.equip.leiming && pr.equip.qingfeng === 'qf_frost', '穿着的假皮肤被脱掉', pr.equip);
  ok(r.fix && r.fix.skinsDel.includes('gc_wolf'), '回执告诉客户端拿掉了哪些', r.fix);
  // 从玩家市场买一件原有的皮肤（qf_gold），再挂出去卖；旧存档（没看到挂出）想把它加回来
  const sv = await newUser('skinseller');
  await econ(sv.token, 'sync');
  const [gi] = grant(sv.uid, [{ k: 'qf_gold' }]);
  const L = (await econ(sv.token, 'list', { i: gi.i, price: 900 })).res;
  const g0 = await call('GET', '/api/profile', undefined, u.token);
  const buy = await econ(u.token, 'buy', { l: L.l });
  ok(buy.res.ok && profOf(u.uid).skins.includes('qf_gold'), '买到金乌', buy.res);
  const sell = await econ(u.token, 'list', { i: buy.res.item.i, price: 950 });
  ok(sell.res.ok && !profOf(u.uid).skins.includes('qf_gold'), '挂出去以后金乌收回');
  await call('POST', '/api/profile', { profile: { ...g0.profile, skins: [...g0.profile.skins, 'qf_gold'] }, ledger: { deltas: [], ev: g0.ledger.ver } }, u.token);
  ok(!profOf(u.uid).skins.includes('qf_gold'), '还没看到卖出的旧存档加不回来');
  await call('POST', '/api/profile', { profile: { ...g0.profile, skins: [...g0.profile.skins, 'qf_gold'] }, ledger: { deltas: [], ev: sell.ledger.ver } }, u.token);
  ok(profOf(u.uid).skins.includes('qf_gold'), '看到卖出以后的新存档照常认（继承老账号这类本机加的原有皮肤）');
}

section('对局奖励：要开局领票、打够时间、隔开、每天有上限');
{
  T = nextNoon();
  const u = await newUser('grinder');
  const ctx = { mode: 'cpu', level: 'hard', char: 'qingfeng', win: true, rounds: 2, flawless: true, combo: 20, ults: 3 };
  const n1 = await econ(u.token, 'matchEnd', { ctx });
  ok(n1.res.err, '没领票的对局不算', n1.res);
  await econ(u.token, 'matchStart', { mode: 'cpu' });
  T += 5000;
  const n2 = await econ(u.token, 'matchEnd', { ctx });
  ok(n2.res.err, '5 秒就打完的对局不算');
  await econ(u.token, 'matchStart', { mode: 'cpu' });
  T += 60000;
  const n3 = await econ(u.token, 'matchEnd', { ctx });
  ok(n3.res.ok && stateOf(u.uid).drop.g === 1, '正常一局记上了');
  const n4 = await econ(u.token, 'matchEnd', { ctx });
  ok(n4.res.err, '一张票只能用一次');
  await econ(u.token, 'matchStart', { mode: 'cpu' });
  T += 50 * 60000;
  ok((await econ(u.token, 'matchEnd', { ctx })).res.err, '票过期（超过 45 分钟）不算');
  const bad = await econ(u.token, 'matchEnd', { ctx: { mode: 'god', char: 'nobody' } });
  ok(bad.res.err, '编出来的模式和侠客不算');
  let okN = 1;
  for (let i = 0; i < 70; i++) {
    await econ(u.token, 'matchStart', { mode: 'cpu' }); T += 21000;
    const r = await econ(u.token, 'matchEnd', { ctx });
    if (r.res && r.res.ok) okN++;
    if (r.status === 429) { T += 61000; i--; }
  }
  ok(okN <= C.MATCH_DAY_CAP, `一天最多记 ${C.MATCH_DAY_CAP} 局（记了 ${okN}）`);
  const s = stateOf(u.uid);
  ok(s.drop.n <= C.DROP_CAP, `掉落每周最多 ${C.DROP_CAP} 次（掉了 ${s.drop.n}）`);
  ok(C.openLeft(s, 'c1') === C.OPEN_DAY && s.cases.c7 === 0, '掉落的都是普通武器箱（神兵武器箱只在商店买得到）', s.cases);
}

section('限速、封号、登录爆破');
{
  const u = await newUser('spammer');
  let got429 = false;
  for (let i = 0; i < 95; i++) { const r = await econ(u.token, 'sync'); if (r.status === 429) { got429 = true; break; } }
  ok(got429, '一分钟 90 次以上被限速');
  T += 61000;
  const b = await newUser('cheater');
  for (let i = 0; i < 3; i++) { await call('POST', '/api/ac', { reason: '测试' }, b.token); T += 11 * 60000; }
  const rec = (await call('GET', '/api/ac', undefined, b.token)).rec;
  ok(rec.strikes === 3 && rec.perm, '三次作弊永久封号', rec);
  const e = await econ(b.token, 'gift');
  ok(e.status === 403, '封号后不能动武库');
  const pp = await call('POST', '/api/profile', { profile: { ink: 99 } }, b.token);
  ok(pp.status === 403, '封号后不能写存档');
  const spam = await newUser('reporter');
  await call('POST', '/api/ac', { reason: 'x' }, spam.token);
  await call('POST', '/api/ac', { reason: 'x' }, spam.token);
  ok((await call('GET', '/api/ac', undefined, spam.token)).rec.strikes === 1, '10 分钟内重复上报只记一次');
  const noAdmin = await call('POST', '/api/admin/pardon', { uid: b.uid }, 'guess');
  ok(noAdmin.status === 403, '没有管理口令不能解封');
  const pd = await call('POST', '/api/admin/pardon', { uid: b.uid }, ADMIN);
  ok(pd.ok && (await econ(b.token, 'gift')).res.ok, '管理员解封后恢复');
  const lg = await call('GET', '/api/admin/econ?uid=' + b.uid, undefined, ADMIN);
  ok(lg.ok && lg.log.some(x => x.act === 'gift') && lg.log.every(x => !('jade0' in x)), '流水账查得到（没有玉珏那两栏了）');
  await newUser('victim');
  let locked = null;
  for (let i = 0; i < 9; i++) locked = await call('POST', '/api/login', { username: 'victim', password: 'wrong' + i }, undefined, '5.5.5.5');
  ok(locked.status === 429, '密码输错 8 次后锁住', locked);
  const right = await call('POST', '/api/login', { username: 'victim', password: 'secret123' }, undefined, '6.6.6.6');
  ok(right.status === 429, '锁住期间换 IP、输对了也不让进（防爆破）');
  T += 16 * 60000;
  const right2 = await call('POST', '/api/login', { username: 'VICTIM', password: 'secret123' }, undefined, '6.6.6.6');
  ok(right2.ok && right2.ledger, '15 分钟后能正常登录');
  let regBlocked = false;
  for (let i = 0; i < 8; i++) { const r = await call('POST', '/api/register', { username: 'bulk' + i, password: 'secret123' }, undefined, '7.7.7.7'); if (r.status === 429) regBlocked = true; }
  ok(regBlocked, '同一个 IP 一小时最多注册 6 个');
}

/* ---------- 管理后台 ---------- */
