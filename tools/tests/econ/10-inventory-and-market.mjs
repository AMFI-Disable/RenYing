section('皮肤都在箱子里：游戏里原有的皮肤和武库的新皮肤，每款正好在一个武器箱里');
{
  const src = gameJs();
  const a = src.indexOf('const SKINS = {'), b = src.indexOf('\n};', a);
  const orig = [...src.slice(a, b).matchAll(/^ {2}([a-z]{2}_[a-z0-9]+): \{ char: '([a-z]+)'/gm)].map(m => [m[1], m[2]]);
  const inCases = C.CASES.flatMap(c => C.TIERS.flatMap(t => C.COLS[c][t] || []));
  ok(orig.length >= 35 && orig.every(([k]) => C.isItem(k)), `游戏里原有的 ${orig.length} 款皮肤都在箱子里`, orig.filter(([k]) => !C.isItem(k)));
  ok(C.CS_KEYS.every(k => C.isItem(k)), `武库的 ${C.CS_KEYS.length} 款新皮肤也都在`);
  ok(inCases.length === new Set(inCases).size && inCases.length === orig.length + C.CS_KEYS.length, `一共 ${inCases.length} 款，没有重复的`, inCases.length);
  ok(orig.every(([k, ch]) => C.charOf(k) === ch), '每款的侠客对得上');
  ok(C.CASES.length === 8 && C.REG.length === 6 && C.REG.every(c => C.TIERS.every(t => (C.COLS[c][t] || []).length)), '八个武器箱：六个普通武器箱，每个五档品质都有东西');
  const P = C.COLS.c7, pk = ['cla', 'cov', 'gold'].flatMap(t => P[t]);
  ok(P.prem && !P.mil.length && !P.res.length && pk.length === 10 && P.odds.mil === 0 && P.odds.res === 0 && Math.abs(P.odds.cov + P.odds.gold - 0.3) < 1e-9, '神兵武器箱没有精铁和碧玉，赤霄加绝世一共 30%', P.odds);
  ok(pk.every(k => C.isItem(k) && C.ITEM[k].col === 'c7') && !C.REG.some(c => C.TIERS.some(t => C.COLS[c][t].some(k => pk.includes(k)))), '神兵武器箱的 10 款只在这个箱子里出');
  ok(C.isItem('qf_qfx') && !C.CS_KEYS.includes('qf_qfx'), '青锋行那款也在箱子里，青锋行通关拿到的照样认');
}

section('注册：带上来的存档不能凭空造墨锭和武库皮肤');
{
  const r = await newUser('forger', {
    ink: 999999,
    skins: ['gc_wolf', 'qf_frost', 'qf_p1'],
    equip: { gouchen: 'gc_wolf' },
    owned: ['qingfeng', 'moyu'],
    frags: { moyu: 999 },
    netWins: 999,
    netLosses: 999,
    rating: 9999,
    placed: 99,
    stageStars: { '1.2': 3 },
    rk: { season: 'S99', pts: 9999 },
    armory: { term: 99, cases: { c1: 99 } }
  });
  ok(r.profile.ink === 5000, '注册时墨锭最多认 5000', r.profile.ink);
  ok(!r.profile.skins.includes('gc_wolf') && !r.profile.skins.includes('qf_p1'), '武库专属皮肤被拿掉', r.profile.skins);
  ok(r.profile.skins.includes('qf_frost'), '以前得到的原有皮肤保留');
  ok(!r.profile.equip.gouchen, '穿着的假皮肤被脱掉', r.profile.equip);
  ok(r.profile.owned.length === 1 && r.profile.owned[0] === 'qingfeng' && !r.profile.frags.moyu &&
    r.profile.netWins === 0 && r.profile.netLosses === 0 && r.profile.rating === 1100 &&
    r.profile.placed === 0 && !r.profile.stageStars['1.2'] && !r.profile.rk,
  '注册时竞争数据、解锁和进度不从客户端导入', r.profile);
  ok(r.profile.armory === undefined, '存档里带的武库数据不认');
  ok(r.ledger && r.ledger.ink === 5000 && r.ledger.ver === 0, '返回账本', r.ledger);
}

section('正常流程：新手礼、开箱（不用钥匙）、穿上、挂到玩家市场、撤下');
const A = await newUser('alice');
{
  const g = await econ(A.token, 'gift');
  ok(g.ok && g.res.ok && g.state.cases.c1 === 1 && g.state.term === 1, '领新手礼：初刃武器箱 1 个、货郎 1 台', g);
  ok((await econ(A.token, 'gift')).res.err, '新手礼只能领一次');
  const o = await econ(A.token, 'open', { c: 'c1' });
  ok(o.res.ok && o.res.item && C.COLS.c1[C.ITEM[o.res.item.k].tier].includes(o.res.item.k), '开箱出了一件初刃收藏品', o.res);
  ok(o.state.cases.c1 === 0, '箱子扣掉了，不要钥匙');
  ok(o.skinsAdd.includes(o.res.item.k) || profOf(A.uid).skins.includes(o.res.item.k), '新皮肤记进能穿的皮肤');
  const again = await econ(A.token, 'open', { c: 'c1' });
  ok(again.res.err, '没箱子不能再开', again.res);
  const it = o.res.item;
  const eq = await econ(A.token, 'equip', { i: it.i });
  ok(eq.res.ok && profOf(A.uid).equip[C.charOf(it.k)] === it.k, '穿上以后服务器存档里也穿着');
  const ink0 = inkOf(A.uid);
  const l = await econ(A.token, 'list', { i: it.i, price: 123 });
  ok(l.res.ok && C.isLid(l.res.l) && !l.state.inv.length && l.state.lst.length === 1 && inkOf(A.uid) === ink0, '挂到玩家市场：饰品离开库存，墨锭不变（系统不收购）', l.res);
  ok(!profOf(A.uid).skins.includes(it.k) && !profOf(A.uid).equip[C.charOf(it.k)], '挂出去以后皮肤收回、换回默认');
  ok(mrow(l.res.l) && mrow(l.res.l).state === 0 && mrow(l.res.l).seller === A.uid && mrow(l.res.l).price === 123, '市场表里多了这一单（在卖）');
  const c = await econ(A.token, 'cancel', { l: l.res.l });
  ok(c.res.ok && c.state.inv.length === 1 && c.state.inv[0].i === it.i && !c.state.lst.length && mrow(l.res.l).state === 2, '撤下：饰品放回库存，市场上那一单标成撤下', c.res);
  ok(profOf(A.uid).skins.includes(it.k), '撤回来的皮肤又能穿了');
  ok(c.ledger.ink === inkOf(A.uid), '返回的账本和服务器一致');
}

section('升级斩数版：按品质收费、保留饰品编号并防止重复扣款');
{
  const U = await newUser('st-upgrader', { ink: 5000 }); await econ(U.token, 'sync');
  const [regular, listed] = grant(U.uid, [{ k: 'qf_p1', n: '旧名' }, { k: 'ts_p1' }]);
  await econ(U.token, 'equip', { i: regular.i });
  const cost = C.ST_UPGRADE_COST[C.ITEM[regular.k].tier], before = inkOf(U.uid), upgradeNonce = nonce();
  const upgraded = await econ(U.token, 'upgradeSt', { i: regular.i }, upgradeNonce);
  const item = itemOf(U.uid, regular.i), replay = await econ(U.token, 'upgradeSt', { i: regular.i }, upgradeNonce);
  ok(upgraded.res.ok && upgraded.res.price === cost && item.i === regular.i && item.st === 0 && item.n === '旧名' && inkOf(U.uid) === before - cost, '升级按品质扣固定墨锭，保留编号和改名并从 0 斩开始', { item, cost });
  ok(profOf(U.uid).equip.qingfeng === regular.k && stateOf(U.uid).eq.qingfeng === regular.i, '升级后原来的穿着状态不变');
  ok(replay.replay && inkOf(U.uid) === before - cost && stateOf(U.uid).hist.filter(h => h.kind === 'upgrade').length === 1, '重放同一升级请求不会再扣钱或重复记流水');
  const repeated = await econ(U.token, 'upgradeSt', { i: regular.i });
  ok(repeated.res.err && /已经是斩数版/.test(repeated.res.err) && inkOf(U.uid) === before - cost, '斩数版不能重复升级或重复收费');
  const badId = await econ(U.token, 'upgradeSt', { i: 1.5 });
  ok(badId.res.err && /编号不对/.test(badId.res.err) && inkOf(U.uid) === before - cost, '小数编号不能升级其他库存饰品');
  const listing = await econ(U.token, 'list', { i: listed.i, price: 150 });
  const listedUpgrade = await econ(U.token, 'upgradeSt', { i: listed.i });
  ok(listing.res.ok && listedUpgrade.res.err && /挂在玩家市场/.test(listedUpgrade.res.err) && mrow(listing.res.l).state === 0, '挂单中的饰品不能升级');

  const poor = await newUser('st-upgrade-poor', { ink: 0 }); await econ(poor.token, 'sync');
  const [poorItem] = grant(poor.uid, [{ k: 'qf_p1' }]), poorBefore = inkOf(poor.uid);
  const denied = await econ(poor.token, 'upgradeSt', { i: poorItem.i });
  ok(denied.res.err && /墨锭不够/.test(denied.res.err) && inkOf(poor.uid) === poorBefore && itemOf(poor.uid, poorItem.i).st === -1, '墨锭不足时不改饰品、不扣款');
}

section('一键开箱：单次请求按共享额度开箱，重试不会重复');
{
  const u = await newUser('bulkCases'); await econ(u.token, 'sync');
  const s = stateOf(u.uid); s.cases.c1 = 8; s.cases.c2 = 2; s.cases.c7 = 5; s.cases.c8 = 2;
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ?, ver = ver + 1 WHERE uid = ?').run(JSON.stringify(s), u.uid);
  const n = nonce(), opened = await econ(u.token, 'openAll', {}, n), again = await econ(u.token, 'openAll', {}, n), out = stateOf(u.uid);
  ok(opened.res.ok && opened.res.items.length === 9 && again.replay && out.cases.c1 === 3 && out.cases.c2 === 2 && out.cases.c7 === 2 && out.cases.c8 === 1 && out.inv.length === 9, '普通、神兵和星座额度各自生效，重放不重复开箱', opened.res);
  const log = JSON.parse(row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'openAll' ORDER BY id DESC LIMIT 1", u.uid).detail);
  ok(log.ad && log.ad.length === 9, '每件批量开出的饰品都有获得流水', log);
}

section('开箱概率：和公布的一样，五分之一是斩数版');
{
  const R = C.rng(20261023), N = 120000, cnt = Object.fromEntries(C.TIERS.map(t => [t, 0]));
  let st = 0;
  for (let i = 0; i < N; i++) {
    const s = C.blank(); s.cases.c3 = 1;
    const env = { now: T, rnd: R, uid: 'odds', ink: 0, skins: [], equip: {}, server: true };
    const it = C.run(s, 'open', { c: 'c3' }, env).res.item;
    cnt[C.ITEM[it.k].tier]++; if (it.st === 0) st++;
  }
  ok(C.ODDS.mil === 0.53 && C.ODDS.res === 0.27 && C.ODDS.cla === 0.13 && C.ODDS.cov === 0.052 && C.ODDS.gold === 0.018, '普通武器箱的爆率是 53% / 27% / 13% / 5.2% / 1.8%');
  ok(C.TIERS.every(t => Math.abs(cnt[t] / N - C.ODDS[t]) < Math.max(0.002, C.ODDS[t] * 0.15)), '五档品质的比例和公布的一样', Object.fromEntries(C.TIERS.map(t => [t, +(cnt[t] / N).toFixed(4)])));
  ok(Math.abs(st / N - C.ST_P) < 0.005, `斩数版占 ${(st / N * 100).toFixed(1)}%（公布的是 ${C.ST_P * 100}%）`);
  ok(C.CASES.every(c => Math.abs(Object.values(C.oddsOf(c)).reduce((a, b) => a + b, 0) - 1) < 1e-9) && Math.abs(Object.values(C.TERM.odds).reduce((a, b) => a + b, 0) - 1) < 1e-9, '每个武器箱和货郎的概率加起来都是 100%');
  const PO = C.oddsOf('c7'), M = 60000, pc = Object.fromEntries(C.TIERS.map(t => [t, 0]));
  for (let i = 0; i < M; i++) {
    const s = C.blank(); s.cases.c7 = 1;
    const env = { now: T, rnd: R, uid: 'odds', ink: 0, skins: [], equip: {}, server: true };
    const it = C.run(s, 'open', { c: 'c7' }, env).res.item;
    pc[C.ITEM[it.k].tier]++;
    if (C.ITEM[it.k].col !== 'c7') { pc.bad = (pc.bad || 0) + 1; }
  }
  ok(!pc.mil && !pc.res && !pc.bad && ['cla', 'cov', 'gold'].every(t => Math.abs(pc[t] / M - PO[t]) < Math.max(0.004, PO[t] * 0.1)), `神兵武器箱开 ${M} 次：灵犀 ${(pc.cla / M * 100).toFixed(1)}%、赤霄 ${(pc.cov / M * 100).toFixed(1)}%、绝世 ${(pc.gold / M * 100).toFixed(1)}%，一个精铁、碧玉都没有`, pc);
}

section('星座武器箱：十二星座 36 款，65% / 28% / 7%，每个号送 1 个，每周开 1 个');
{
  const Z = C.COLS.c8, codes = C.ZODIAC.map(z => z[0]);
  ok(Z.prem && !Z.mil.length && !Z.res.length && ['cla', 'cov', 'gold'].every(t => Z[t].length === 12) && Z.odds.cla === 0.65 && Z.odds.cov === 0.28 && Z.odds.gold === 0.07 && Z.price > C.COLS.c7.price,
    '灵犀、赤霄、绝世各 12 款，爆率 65 / 28 / 7，比神兵武器箱贵', [Z.price, Z.odds]);
  const ZOD_HERO_IDS = Object.keys(C.ZOD_OF).map(pre => C.charOf(pre + '_x'));
  ok(['cla', 'cov', 'gold'].every(t => ZOD_HERO_IDS.every(h => Z[t].filter(k => C.charOf(k) === h).length === 1)), '每位侠客粉、红、金各一款');
  ok(['cla', 'cov', 'gold'].every(t => codes.every(c => Z[t].filter(k => C.FULL[k].deco.sign === c).length === 1)), '每一档里十二星座正好各一款');
  ok(ZOD_HERO_IDS.every(h => new Set(['cla', 'cov', 'gold'].map(t => C.FULL[Z[t].find(k => C.charOf(k) === h)].deco.sign)).size === 3), '同一位侠客的三款是三个不同的星座');
  const all = ['cla', 'cov', 'gold'].flatMap(t => Z[t]);
  ok(all.every(k => C.CS_KEYS.includes(k) && C.ITEM[k].col === 'c8' && C.FULL[k].char === C.charOf(k) && k.length <= 24 && /^[a-z0-9_]+$/.test(k)) && !C.REG.some(c => C.TIERS.some(t => C.COLS[c][t].some(k => all.includes(k)))),
    '36 款都是武库皮肤，只在星座武器箱里出，名字合规');
  ok(all.every(k => { const d = C.FULL[k], t = C.ITEM[k].tier; return d.deco.back === 'zodiac' && d.deco.zt === ['cla', 'cov', 'gold'].indexOf(t) + 1 && /·星(辉|焰|冕)$/.test(d.name) && d.scene && d.scene.sky.length === 4 && d.fx.c && /^#[0-9a-f]{6}$/.test(d.look.body); }),
    '每款都有星图背饰、对应的档位、名字、场景和配色');
  const R = C.rng(2026), M = 60000, pc = Object.fromEntries(C.TIERS.map(t => [t, 0]));
  for (let i = 0; i < M; i++) {
    const s = C.normalize(C.blank(), { now: T, uid: 'zod' }), it = C.run(s, 'open', { c: 'c8' }, { now: T, rnd: R, uid: 'zod', ink: 0, skins: [], equip: {}, server: true }).res.item;
    pc[C.ITEM[it.k].tier]++; if (C.ITEM[it.k].col !== 'c8') pc.bad = (pc.bad || 0) + 1;
  }
  const ZO = C.oddsOf('c8');
  ok(!pc.mil && !pc.res && !pc.bad && ['cla', 'cov', 'gold'].every(t => Math.abs(pc[t] / M - ZO[t]) < Math.max(0.004, ZO[t] * 0.1)), `星座武器箱开 ${M} 次：灵犀 ${(pc.cla / M * 100).toFixed(1)}%、赤霄 ${(pc.cov / M * 100).toFixed(1)}%、绝世 ${(pc.gold / M * 100).toFixed(1)}%`, pc);
  const s0 = C.normalize(C.blank(), { now: T, uid: 'zf' });
  ok(s0.cases.c8 === 1 && s0.zf === 1 && Object.entries(s0.cases).every(([c, n]) => c === 'c8' || n === 0), '新号送 1 个星座武器箱', s0.cases);
  ok(C.normalize(s0, { now: T, uid: 'zf' }).cases.c8 === 1, '再读一次不会再送');
  const o = C.run(s0, 'open', { c: 'c8' }, { now: T, rnd: R, uid: 'zf', ink: 0, skins: [], equip: {}, server: true });
  ok(o.res.ok && o.state.cases.c8 === 0 && C.normalize(o.state, { now: T, uid: 'zf' }).cases.c8 === 0 && o.state.zw.n === 1 && o.state.pw.n === 0 && o.state.od.n === 0, '开掉以后不会再送；记在星座的每周次数上，不占神兵的和每天的');
  const old = { ...C.blank(), cases: { c1: 2, c7: 1 } }; delete old.zf; delete old.zw;
  const so = C.normalize(old, { now: T, uid: 'old' });
  ok(so.cases.c8 === 1 && so.cases.c1 === 2 && so.cases.c7 === 1 && so.zw.n === 0, '老号第一次读到这一版也送 1 个，原来的箱子照旧', so.cases);
  const s2 = C.normalize(C.blank(), { now: T, uid: 'zw' }); s2.cases.c8 = 3; s2.cases.c7 = 1;
  const env2 = { now: T, rnd: R, uid: 'zw', ink: 0, skins: [], equip: {}, server: true };
  const a1 = C.run(s2, 'open', { c: 'c8' }, env2), a2 = C.run(a1.state, 'open', { c: 'c8' }, env2), a3 = C.run(a2.state, 'open', { c: 'c7' }, env2);
  ok(a1.res.ok && a2.res.err === '星座武器箱每周只能开 1 个，下周一再来' && a3.res.ok, '星座武器箱一周开 1 个；开过了照样能开神兵武器箱', [a2.res, a3.res]);
  const cfg = C.cleanCfg({ 'zod.cla': 0.6, 'zod.cov': 0.3, 'zod.gold': 0.1, zodWeek: 2, 'price.c8': 2000 });
  ok(cfg.cfg && C.oddsOf('c8', cfg.cfg).gold === 0.1 && C.oddsOf('c7', cfg.cfg).gold === 0.08 && C.openLeft(C.normalize(C.blank(), { now: T, uid: 'x' }), 'c8', cfg.cfg) === 2 && C.shopPrice('c8', cfg.cfg) === 2000, '星座武器箱的爆率、每周个数、价格能在线改，不影响神兵的', cfg);
  ok(C.cleanCfg({ 'zod.gold': 0.2 }).err === '星座武器箱的几档爆率加起来要正好是 1（现在是 1.13）', '星座的几档爆率加起来不是 1：不让存', C.cleanCfg({ 'zod.gold': 0.2 }).err);
  const z0 = C.run(C.normalize(C.blank(), { now: T, uid: 'z0' }), 'open', { c: 'c8' }, { ...env2, cfg: { zodWeek: 0 } });
  ok(z0.res.err === '星座武器箱现在暂停开启', '每周个数改成 0：星座武器箱暂停开启', z0.res);
}

section('星章兑换：只从普通武器箱里出，神兵武器箱的 10 款换不到');
{
  const R = C.rng(77), env = () => ({ now: T, rnd: R, uid: 'star', ink: 0, skins: [], equip: {}, server: true });
  const rich = () => { const s = C.blank(); Object.assign(s.op, { s: C.season(C.day(T)).id, earned: 999 }); return s; };
  const prem = Object.keys(C.ITEM).filter(C.isPrem);
  ok(prem.length === 46 && prem.filter(k => C.ITEM[k].col === 'c7').length === 10 && prem.filter(k => C.ITEM[k].col === 'c8').length === 36, '神兵武器箱 10 款、星座武器箱 36 款，都只在自己的箱子里', prem.length);
  const pc = C.ofTier('cov').find(C.isPrem), rc = C.ofTierReg('cov')[0];
  const r1 = C.run(rich(), 'star', { id: 'cov', k: pc }, env()).res;
  ok(r1.err === '要从普通武器箱的赤霄级里挑一件', `自选赤霄挑神兵武器箱的 ${pc} 被拒绝`, r1);
  const o2 = C.run(rich(), 'star', { id: 'cov', k: rc }, env()), r2 = o2.res;
  ok(r2.ok && r2.item.k === rc && o2.state.op.spent === 15, `自选赤霄挑普通武器箱的 ${rc} 可以`, r2);
  let bad = 0;
  for (let i = 0; i < 400; i++) for (const id of ['res', 'cla']) { const r = C.run(rich(), 'star', { id }, env()).res; if (!r.ok || C.isPrem(r.item.k)) bad++; }
  ok(bad === 0, '随机碧玉、随机灵犀换 800 次，一次都没出神兵武器箱的饰品', bad);
  let cbad = 0;
  for (let i = 0; i < 300; i++) { const r = C.run(rich(), 'star', { id: 'case' }, env()).res; if (!C.REG.includes(r.c)) cbad++; }
  ok(cbad === 0, '随机武器箱换 300 次，一次都没出神兵武器箱', cbad);
}

section('重放：同一个请求编号发两次只算一次');
{
  const u = await newUser('replayer');
  await econ(u.token, 'gift');
  const n = nonce();
  const a = await econ(u.token, 'open', { c: 'c1' }, n);
  const b = await econ(u.token, 'open', { c: 'c1' }, n);
  ok(a.res.ok && b.replay && b.res.item.i === a.res.item.i, '第二次直接拿到第一次的结果', b);
  ok(stateOf(u.uid).inv.length === 1, '库存里只有一件');
  const bad = await call('POST', '/api/econ', { act: 'open', args: { c: 'c1' }, nonce: 'zz' }, u.token);
  ok(bad.status === 400, '没有合格的请求编号直接拒绝', bad);
}

let RACE_K = '';
section('并发双花：同一件同时挂 12 次、同一个箱子同时开 12 次、同一单同时买');
{
  const u = await newUser('racer');
  await econ(u.token, 'gift');
  const o = await econ(u.token, 'open', { c: 'c1' });
  RACE_K = o.res.item.k;   // 这件后面以 50 卖掉了：开出来的要是霜狼（gc_wolf，初刃武器箱的绝世），玩家市场那段的成交记录会多一笔
  const rs = await Promise.all(Array.from({ length: 12 }, () => econ(u.token, 'list', { i: o.res.item.i, price: 50 })));
  const wins = rs.filter(r => r.res && r.res.ok);
  ok(wins.length === 1 && stateOf(u.uid).lst.length === 1 && row('SELECT COUNT(*) AS n FROM mkt WHERE seller = ?', u.uid).n === 1, `12 个并发挂单只挂上 1 单（挂上 ${wins.length}）`, rs.map(r => r.res ? r.res.err || 'ok' : r.error));
  const v = await newUser('racer2');
  await econ(v.token, 'gift');
  const rs2 = await Promise.all(Array.from({ length: 12 }, () => econ(v.token, 'open', { c: 'c1' })));
  ok(rs2.filter(r => r.res && r.res.ok).length === 1 && stateOf(v.uid).inv.length === 1, '并发开箱只开出 1 件');
  const w = await newUser('racer3', { ink: 5000 });
  await econ(w.token, 'sync');
  const L = wins[0].res.l;
  const rs3 = await Promise.all(Array.from({ length: 10 }, () => econ(w.token, 'buy', { l: L })));
  ok(rs3.filter(r => r.res && r.res.ok).length === 1 && inkOf(w.uid) === 5000 - 50 && stateOf(w.uid).inv.length === 1, '同一单并发买 10 次：只买到 1 次、只扣 1 次钱', [inkOf(w.uid), rs3.map(r => r.res && (r.res.err || 'ok'))]);
}

section('开箱次数：普通武器箱每天开 5 个，神兵武器箱每天开 3 个；并发也多开不了');
{
  T = nextNoon();
  const u = await newUser('daily', { ink: 5000 });
  ENV.DB.raw.prepare('UPDATE econ SET ink = 20000 WHERE uid = ?').run(u.uid);
  const g = await econ(u.token, 'gift');
  ok(C.openLeft(g.state, 'c1') === C.OPEN_DAY && C.openLeft(g.state, 'c7') === C.PREM_DAY, `一开始：今天能开 ${C.OPEN_DAY} 个普通武器箱，今天能开 ${C.PREM_DAY} 个神兵武器箱`);
  const b1 = await econ(u.token, 'buyCase', { c: 'c3', n: 5 });
  ok(b1.res.ok && b1.state.cases.c3 === 5 && b1.res.price === 5 * C.COLS.c3.price, '从商店买 5 个名剑武器箱（固定价格，买不限次数）', b1.res);
  const o1 = await econ(u.token, 'open', { c: 'c1' }), o2 = await econ(u.token, 'open', { c: 'c3' }), o3 = await econ(u.token, 'open', { c: 'c3' }), o4 = await econ(u.token, 'open', { c: 'c3' }), o5 = await econ(u.token, 'open', { c: 'c3' });
  ok(o1.res.ok && o2.res.ok && o3.res.ok && o4.res.ok && o5.res.ok && C.openLeft(o5.state, 'c3') === 0, '新手礼的箱子和买来的一样算次数：开了 5 个，今天用完了', [o1.res, o5.res]);
  const o6 = await econ(u.token, 'open', { c: 'c3' });
  ok(o6.res.err && o6.res.err.includes('明天') && stateOf(u.uid).cases.c3 === 1 && stateOf(u.uid).inv.length === 5, '第 6 个开不了，箱子还在', o6.res);
  const bp = await econ(u.token, 'buyCase', { c: 'c7', n: 4 });
  ok(bp.res.ok && bp.state.cases.c7 === 4 && bp.res.price === 4 * C.COLS.c7.price, '从商店买 4 个神兵武器箱', bp.res);
  const p1 = await econ(u.token, 'open', { c: 'c7' });
  const pt = p1.res.item && C.ITEM[p1.res.item.k];
  ok(p1.res.ok && pt && ['cla', 'cov', 'gold'].includes(pt.tier) && pt.col === 'c7', '神兵武器箱不占每天那 5 个普通箱子，开出来的是灵犀或更高', p1.res);
  const p2 = await econ(u.token, 'open', { c: 'c7' }), p3 = await econ(u.token, 'open', { c: 'c7' });
  ok(p2.res.ok && p3.res.ok && C.openLeft(p3.state, 'c7') === 0, '神兵武器箱今天开了 3 个，用完了', [p2.res, p3.res]);
  const p4 = await econ(u.token, 'open', { c: 'c7' });
  ok(p4.res.err && p4.res.err.includes('明天') && stateOf(u.uid).cases.c7 === 1, '神兵武器箱今天开过了，明天再来，箱子还在', p4.res);
  T = nextNoon();
  const s1 = await econ(u.token, 'sync');
  ok(C.openLeft(s1.state, 'c3') === C.OPEN_DAY && C.openLeft(s1.state, 'c7') === C.PREM_DAY, '第二天：普通武器箱又能开 5 个，神兵武器箱又能开 3 个', [s1.state.od, s1.state.pd]);
  ok((await econ(u.token, 'open', { c: 'c3' })).res.ok, '第二天接着开普通武器箱');
  ok((await econ(u.token, 'open', { c: 'c7' })).res.ok, '第二天接着开神兵武器箱');

  T = nextNoon();
  const v = await newUser('daily2', { ink: 5000 });
  ENV.DB.raw.prepare('UPDATE econ SET ink = 20000 WHERE uid = ?').run(v.uid);
  ok((await econ(v.token, 'buyCase', { c: 'c2', n: 8 })).res.ok, '买 8 个霜华武器箱');
  const rs = await Promise.all(Array.from({ length: 12 }, () => econ(v.token, 'open', { c: 'c2' })));
  const sv = stateOf(v.uid);
  ok(rs.filter(r => r.res && r.res.ok).length === 5 && sv.inv.length === 5 && sv.cases.c2 === 3 && sv.od.n === 5, '12 个并发开箱：正好开出 5 个，剩下的箱子还在', rs.map(r => r.res && (r.res.err || 'ok')));
  ok((await econ(v.token, 'buyCase', { c: 'c7', n: 5 })).res.ok, '买 5 个神兵武器箱');
  ok(stateOf(v.uid).cases.c8 === 1 && (await econ(v.token, 'buyCase', { c: 'c8' })).res.ok && stateOf(v.uid).cases.c8 === 2, '服务器上的新号有送的 1 个星座武器箱，再买 1 个');
  const rz = await Promise.all(Array.from({ length: 8 }, () => econ(v.token, 'open', { c: 'c8' })));
  ok(rz.filter(r => r.res && r.res.ok).length === 1 && stateOf(v.uid).cases.c8 === 1 && stateOf(v.uid).zw.n === 1 && C.ITEM[stateOf(v.uid).inv.find(x => C.ITEM[x.k].col === 'c8').k].col === 'c8', '8 个并发开星座武器箱：只开出 1 个', rz.map(r => r.res && (r.res.err || 'ok')));
  const rp = await Promise.all(Array.from({ length: 8 }, () => econ(v.token, 'open', { c: 'c7' })));
  ok(rp.filter(r => r.res && r.res.ok).length === 3 && stateOf(v.uid).cases.c7 === 2 && stateOf(v.uid).pd.n === 3, '8 个并发开神兵武器箱：只开出 3 个', rp.map(r => r.res && (r.res.err || 'ok')));
  const poor = await newUser('daily3', { ink: 100 });
  ok((await econ(poor.token, 'buyCase', { c: 'c1' })).res.err && Object.entries(stateOf(poor.uid).cases).every(([c, n]) => n === (c === 'c8' ? 1 : 0)) && inkOf(poor.uid) === 100, '墨锭不够买不了箱子，也不扣钱（只有送的那个星座武器箱）');
}

section('商店：武器箱和货郎按固定价格买，不限量；不能挂到玩家市场，系统也不收购');
{
  T = nextNoon();
  const u = await newUser('shop', { ink: 5000 });
  const P = C.COLS.c4.price;
  ok(C.CASES.every(c => C.shopPrice(c) === C.COLS[c].price && C.COLS[c].price > 0) && C.shopPrice('term') === C.TERM.price && C.TERM.price === 500, '每个武器箱都有固定价格，货郎 500 墨锭一台');
  const b = await econ(u.token, 'buyCase', { c: 'c4', n: 3 });
  ok(b.res.ok && b.res.price === 3 * P && b.res.n === 3 && b.state.cases.c4 === 3 && inkOf(u.uid) === 5000 - 3 * P, `一次买 3 个江湖武器箱：正好 3 × ${P}`, b.res);
  ok(stateOf(u.uid).hist[0].kind === 'buy' && stateOf(u.uid).hist[0].g === 'c4' && stateOf(u.uid).hist[0].n === 3, '成交记录里记着买了 3 个江湖武器箱', stateOf(u.uid).hist[0]);
  T += 3600e3;
  const b2 = await econ(u.token, 'buyCase', { c: 'c4', n: 1 });
  ok(b2.res.ok && b2.res.price === P, '过一会儿再买，价格还是一样（不随时间、不随买的人多少变）', b2.res);
  const ink1 = inkOf(u.uid);
  const bt = await econ(u.token, 'buyTerm', { n: 2 });
  ok(bt.res.ok && bt.res.price === 2 * C.TERM.price && bt.state.term === 2 && inkOf(u.uid) === ink1 - 2 * C.TERM.price, '买 2 台货郎：2 × 500', bt.res);
  for (const n of [2, -5, 0, 11, 1e9, 2.5, 'abc', null, '3; DROP TABLE econ']) {
    const i0 = inkOf(u.uid), c0 = stateOf(u.uid).cases.c6, r = await econ(u.token, 'buyCase', { c: 'c6', n });
    const fine = n === 2;
    ok(fine ? r.res.ok && stateOf(u.uid).cases.c6 === c0 + 2 && inkOf(u.uid) === i0 - 2 * C.COLS.c6.price : r.res.err && inkOf(u.uid) === i0 && stateOf(u.uid).cases.c6 === c0, `一次买 ${JSON.stringify(n)} 个：${fine ? '照买' : '拒绝，不扣钱'}`, r.res);
  }
  for (const act of ['quick', 'sellCase', 'sellTerm']) {
    const r = await call('POST', '/api/econ', { act, args: { c: 'c4', n: 1, i: 1 }, nonce: nonce() }, u.token);
    ok(r.status === 400 && stateOf(u.uid).cases.c4 === 4, `没有“${act}”（卖给系统）这个操作了`, r);
  }
  for (const c of ['c4', 'term', 'c7']) {
    const r = await econ(u.token, 'list', { c, price: 10 });
    ok(r.res.err && r.res.err.includes('商店') && !stateOf(u.uid).lst.length, `${c === 'term' ? '货郎' : C.COLS[c].name + '武器箱'}不能挂到市场`, r.res);
  }
  for (const c of ['c9', '__proto__', 'constructor', 'toString', null, 7]) ok((await econ(u.token, 'buyCase', { c })).res.err, `买不存在的武器箱 ${JSON.stringify(c)} 被拒绝`);

  T = nextNoon();
  const w = await newUser('shop2', { ink: 3 * C.COLS.c5.price + 10 });
  const rs = await Promise.all(Array.from({ length: 14 }, () => econ(w.token, 'buyCase', { c: 'c5', n: 1 })));
  const won = rs.filter(r => r.res && r.res.ok);
  ok(won.length === 3 && stateOf(w.uid).cases.c5 === 3 && inkOf(w.uid) === 10, `只够买 3 个时 14 个并发购买：正好买到 3 个，墨锭一分不多扣`, [won.length, inkOf(w.uid)]);
}

section('玩家市场：只在玩家之间买卖饰品，标价自己定；卖家下次动武库时到账，只到一次');
{
  T = nextNoon();
  const S = await newUser('mseller'), B = await newUser('mbuyer', { ink: 5000 }), B2 = await newUser('mbuyer2', { ink: 5000 });
  for (const x of [S, B, B2]) await econ(x.token, 'sync');
  const [a, b, c, d] = grant(S.uid, [{ k: 'qf_p1' }, { k: 'qf_p1', st: 7 }, { k: 'gc_wolf' }, { k: 'yh_p1', n: '老刀' }]);
  const sync0 = await econ(S.token, 'sync');
  ok(sync0.state.inv.length === 4, '卖家库存里有 4 件');
  const l1 = await econ(S.token, 'list', { i: a.i, price: 120 });
  const l2 = await econ(S.token, 'list', { i: b.i, price: 300 });
  const l3 = await econ(S.token, 'list', { i: c.i, price: 2000 });
  const l4 = await econ(S.token, 'list', { i: d.i, price: 40 });
  ok([l1, l2, l3, l4].every(r => r.res.ok) && stateOf(S.uid).lst.length === 4 && !stateOf(S.uid).inv.length, '挂了 4 单：标价随便定，饰品都离开库存', [l1, l2, l3, l4].map(r => r.res));
  ok(!profOf(S.uid).skins.includes('gc_wolf'), '挂出去的武库皮肤不能再穿');
  ok(stateOf(S.uid).lst.find(x => x.l === l4.res.l).it.n === '' && JSON.parse(mrow(l4.res.l).item_json).n === '', '名字标签不跟着挂出去');
  for (const price of [-5, 0, 1.5, 'abc', 1e12, null, NaN, Infinity, C.PRICE_MAX + 1]) {
    const [e] = grant(S.uid, [{ k: 'ts_p1' }]);
    const r = await econ(S.token, 'list', { i: e.i, price });
    ok(r.res.err && stateOf(S.uid).inv.some(x => x.i === e.i), `标价 ${String(price)} 被拒绝，饰品还在`, r.res);
  }
  ok((await econ(S.token, 'list', { i: 99999, price: 10 })).res.err, '库存里没有的挂不了');

  const m = await market(B.token);
  ok(m.ok && m.items.qf_p1.n === 1 && m.items.qf_p1.lo === 120 && m.items.qf_p1.sn === 1 && m.items.qf_p1.slo === 300 && m.items.gc_wolf.lo === 2000, '行情：每一款在卖几件、最低多少，普通版和斩数版分开', m.items && m.items.qf_p1);
  const mk = await market(B.token, 'qf_p1'), mkS = await market(S.token, 'qf_p1');
  ok(mk.ok && mk.open.length === 2 && mk.open[0].price === 120 && mk.open[1].st === 7 && mk.open.every(x => !x.mine && !('seller' in x)), '一款的在卖列表：便宜的在前，看不到卖家是谁', mk.open);
  ok(mkS.open.every(x => x.mine), '卖家自己看，知道哪几单是自己的');
  ok((await market(B.token, '__proto__')).status === 404 && (await call('GET', '/api/market')).status === 401, '编出来的饰品、没登录都看不了');

  ok((await econ(S.token, 'buy', { l: l1.res.l })).res.err.includes('自己'), '不能买自己挂的');
  const wrong = await econ(B.token, 'buy', { l: l1.res.l, price: 100 });
  ok(wrong.res.err && inkOf(B.uid) === 5000, '标价对不上（看到的价和现在的不一样）不买', wrong.res);
  const fake = await econ(B.token, 'buy', { l: '0123456789abcdef' });
  ok(fake.res.err && inkOf(B.uid) === 5000, '编出来的挂单买不了');
  for (const l of [null, 7, '__proto__', `${C.day(T)}.qf_p1.0`, 'x'.repeat(16)]) ok((await econ(B.token, 'buy', { l })).res.err, `乱填挂单编号 ${JSON.stringify(l)} 买不了`);

  const by = await econ(B.token, 'buy', { l: l2.res.l, price: 300 });
  ok(by.res.ok && by.res.item.k === 'qf_p1' && by.res.item.st === 7 && by.res.item.src === 'market' && inkOf(B.uid) === 4700, '买到斩数版：斩数跟着过来，扣 300', by.res);
  ok(profOf(B.uid).skins.includes('qf_p1') && mrow(l2.res.l).state === 1 && mrow(l2.res.l).buyer === B.uid && mrow(l2.res.l).paid === 0, '买家能穿；那一单标成卖掉、钱还没给卖家');
  ok(stateOf(B.uid).hist[0].kind === 'buy' && stateOf(B.uid).hist[0].k === 'qf_p1' && stateOf(B.uid).hist[0].price === 300, '买家的成交记录');

  // 两个买家同时抢一单（gc_wolf，2000）
  const race = await Promise.all([...Array.from({ length: 6 }, () => econ(B.token, 'buy', { l: l3.res.l })), ...Array.from({ length: 6 }, () => econ(B2.token, 'buy', { l: l3.res.l }))]);
  const rw = race.filter(r => r.res && r.res.ok);
  const spent = (4700 - inkOf(B.uid)) + (5000 - inkOf(B2.uid));
  ok(rw.length === 1 && spent === 2000 && stateOf(B.uid).inv.concat(stateOf(B2.uid).inv).filter(x => x.k === 'gc_wolf').length === 1, '两个人各抢 6 次：只有一个人买到，钱只扣一次', [rw.length, spent]);

  const s0 = inkOf(S.uid);
  const st1 = await econ(S.token, 'sync'), st2 = await econ(S.token, 'sync');
  const gain = C.net(300) + C.net(2000);
  ok(st1.sold.length === 2 && st2.sold.length === 0 && inkOf(S.uid) === s0 + gain && gain === Math.floor(300 * 0.85) + Math.floor(2000 * 0.85), `卖家下次动武库时到账 ${gain}（扣 15% 手续费），再动不会重复到账`, [st1.sold, inkOf(S.uid) - s0]);
  ok(mrow(l2.res.l).paid === 1 && mrow(l3.res.l).paid === 1 && stateOf(S.uid).lst.length === 2 && stateOf(S.uid).hist.filter(h => h.kind === 'sold').length === 2, '两单都标成已付，卖家的挂单里只剩没卖掉的');

  const cl = await econ(S.token, 'cancel', { l: l1.res.l });
  ok(cl.res.ok && stateOf(S.uid).inv.some(x => x.i === a.i) && mrow(l1.res.l).state === 2, '撤下没卖掉的那单，饰品放回库存');
  const late = await econ(B.token, 'buy', { l: l1.res.l });
  ok(late.res.err && late.res.err.includes('撤'), '撤下的单买不了', late.res);
  ok((await econ(S.token, 'cancel', { l: l2.res.l })).res.err, '卖掉的单撤不了');

  // 买和撤同时撞上：只成一个
  const [e] = grant(S.uid, [{ k: 'ly_p1' }]);
  const le = await econ(S.token, 'list', { i: e.i, price: 77 });
  const ib = inkOf(B2.uid);
  const mix = await Promise.all([econ(B2.token, 'buy', { l: le.res.l }), econ(S.token, 'cancel', { l: le.res.l }), econ(B2.token, 'buy', { l: le.res.l }), econ(S.token, 'cancel', { l: le.res.l })]);
  const boughtIt = stateOf(B2.uid).inv.some(x => x.k === 'ly_p1'), backIt = stateOf(S.uid).inv.some(x => x.i === e.i);
  ok(boughtIt !== backIt && (boughtIt ? inkOf(B2.uid) === ib - 77 : inkOf(B2.uid) === ib), `买和撤同时到：只成了一个（${boughtIt ? '买到了' : '撤回去了'}），东西不会变成两份`, mix.map(r => r.res && (r.res.err || 'ok')));
  await econ(S.token, 'sync');
  ok(boughtIt ? stateOf(S.uid).hist[0].kind === 'sold' : true, '买到的那种情况，卖家照样到账');

  // 挂单不设上限：以前的上限是 20，挂到 25 单也都挂得上
  const many = grant(S.uid, Array.from({ length: 25 }, () => ({ k: 'ts_p1' })));
  const have = stateOf(S.uid).lst.length, rsMany = [];
  for (let i = 0; i < 25; i++) rsMany.push(await econ(S.token, 'list', { i: many[i].i, price: 5 + i }));
  ok(rsMany.every(r => r.res.ok) && stateOf(S.uid).lst.length === have + 25, `挂单不设上限：一共挂了 ${have + 25} 单都挂得上`, rsMany.map(r => r.res.err).filter(Boolean));

  // 本机存档（没有服务器）：玩家市场用不了
  const env = { now: T, rnd: Math.random, uid: 'local', ink: 100, skins: [], equip: {}, server: false };
  const s = C.blank(); s.inv.push({ i: 1, k: 'qf_p1', st: -1, n: '', t: T, src: 'case' }); s.nid = 2;
  const lr = C.run(s, 'list', { i: 1, price: 10 }, env).res, br = C.run(s, 'buy', { l: '0123456789abcdef' }, env).res;
  ok(lr.err && br.err && lr.err.includes('服务器'), '本机存档挂单、买都会提示要连服务器', [lr, br]);

  const m2 = await market(B.token);
  const early = RACE_K === 'gc_wolf' ? 1 : 0;   // 并发双花那段碰巧开出霜狼、以 50 卖掉的那一笔
  ok(m2.items.qf_p1.slast === 300 && m2.items.gc_wolf.last === 2000 && m2.items.gc_wolf.d === 1 + early && !m2.items.gc_wolf.n, '行情里记着最近成交价和 30 天成交几笔', m2.items.gc_wolf);
  const mi = await market(B.token, 'gc_wolf');
  ok(mi.deals.length === 1 + early && mi.deals[0].price === 2000 && mi.open.length === 0, '一款的成交记录（画走势用）', mi);
}

section('货郎：一次报一件，最多 5 件，买下就用掉；重发、并发都不会跳过或多买');
{
  T = nextNoon();
  const u = await newUser('peddler', { ink: 5000 });
  ok((await econ(u.token, 'unseal')).res.err, '没有货郎开不了');
  await econ(u.token, 'gift');
  ok((await econ(u.token, 'termNext', { n: 1 })).res.err, '没开封不能换');
  const s1 = await econ(u.token, 'unseal');
  const tm = s1.state.tm, rv = C.refVal(tm.o);
  ok(s1.res.ok && tm && tm.n === 1 && s1.state.term === 0, '开封：给出第 1 件，货郎少一台', s1.state.tm);
  ok(C.isItem(tm.o.k) && tm.o.price >= Math.round(rv * C.TERM.markup[0]) && tm.o.price <= Math.round(rv * C.TERM.markup[1]), `报价在这件基准价的 ${C.TERM.markup[0]}~${C.TERM.markup[1]} 倍之间`, [tm.o, rv]);
  ok((await econ(u.token, 'unseal')).res.err, '开着一台时不能再开封');
  const wrong = await econ(u.token, 'termNext', { n: 3 });
  ok(wrong.res.err && stateOf(u.uid).tm.n === 1, '编号对不上（看到的不是这一件）就不换', wrong.res);
  const n = nonce();
  const a = await econ(u.token, 'termNext', { n: 1 }, n);
  const b = await econ(u.token, 'termNext', { n: 1 }, n);
  ok(a.res.ok && b.replay && stateOf(u.uid).tm.n === 2, '同一个请求重发：只换一次', stateOf(u.uid).tm);
  const race = await Promise.all(Array.from({ length: 8 }, () => econ(u.token, 'termNext', { n: 2 })));
  ok(race.filter(r => r.res && r.res.ok).length === 1 && stateOf(u.uid).tm.n === 3, '8 个并发“换下一件”只换了一次', race.map(r => r.res && (r.res.err || 'ok')));
  const o = stateOf(u.uid).tm.o;
  // 偶尔会报到一件 5,000 墨锭买不起的（斩数版的 ★ 绝世）：让管理员先补上差的墨锭，这一段就不看运气
  if (inkOf(u.uid) < o.price) await call('POST', '/api/admin/adjust', { uid: u.uid, ink: o.price - inkOf(u.uid), why: '测试：报价比手里的墨锭高' }, ADMIN);
  const ink0 = inkOf(u.uid);
  const buys = await Promise.all(Array.from({ length: 6 }, () => econ(u.token, 'termBuy', { n: 3 })));
  const won = buys.filter(r => r.res && r.res.ok), s = stateOf(u.uid);
  ok(won.length === 1 && inkOf(u.uid) === ink0 - o.price && s.inv.filter(x => x.src === 'term').length === 1 && !s.tm, '6 个并发买下：只买到 1 件、只扣 1 次钱，货郎用掉了', [won.length, inkOf(u.uid) - ink0, o.price]);
  const got = won[0] && won[0].res.item;
  ok(got && got.k === o.k && got.st === o.st && s.hist[0].kind === 'term' && s.hist[0].price === o.price, '买到的就是报的那一件（斩数版也一样），记进成交记录', [got, o]);
  ok(got && profOf(u.uid).skins.includes(got.k), '买到的皮肤能穿');

  const v = await newUser('peddler2', { ink: 0 });
  await econ(v.token, 'gift');
  await econ(v.token, 'unseal');
  const poor = await econ(v.token, 'termBuy', { n: 1 });
  ok(poor.res.err && stateOf(v.uid).tm && stateOf(v.uid).inv.length === 0, '墨锭不够买不了，货郎还开着', poor.res);
  for (let i = 1; i < C.TERM.offers; i++) await econ(v.token, 'termNext', { n: i });
  ok(stateOf(v.uid).tm.n === C.TERM.offers, `换到第 ${C.TERM.offers} 件`);
  const last = await econ(v.token, 'termNext', { n: C.TERM.offers });
  ok(last.res.ok && last.res.gone && !stateOf(v.uid).tm && stateOf(v.uid).term === 0, `第 ${C.TERM.offers} 件也不要：货郎就没了`, last.res);
  ok((await econ(v.token, 'termBuy', { n: C.TERM.offers })).res.err, '没了就买不了');
  for (const x of ['abc', -1, null, 1e9, { n: 1 }]) ok((await econ(v.token, 'termNext', { n: x })).res.err, `乱填编号 ${JSON.stringify(x)}：不出错，什么也不做`);

  const w = await newUser('peddler3', { ink: 5000 });
  await econ(w.token, 'gift'); await econ(w.token, 'unseal');
  T += C.TERM.days * 86400e3 + 60000;
  const late = await econ(w.token, 'termBuy', { n: 1 });
  ok(late.res.err && !stateOf(w.uid).tm && inkOf(w.uid) === 5000, `开封 ${C.TERM.days} 天不处理就作废`, late.res);

  const R = C.rng(777), N = 60000, cnt = Object.fromEntries(C.TIERS.map(t => [t, 0]));
  let st = 0, lo = 9, hi = 0, out = 0;
  for (let i = 0; i < N; i++) {
    const x = C.termOffer(R), rv = C.refVal(x), r = x.price / rv;
    cnt[C.ITEM[x.k].tier]++; if (x.st >= 0) st++; lo = Math.min(lo, r); hi = Math.max(hi, r);
    if (x.price < Math.round(rv * C.TERM.markup[0]) || x.price > Math.round(rv * C.TERM.markup[1])) out++;
  }
  ok(C.TIERS.every(t => Math.abs(cnt[t] / N - C.TERM.odds[t]) < 0.01), '报价的品质比例和页面上写的一样', Object.fromEntries(C.TIERS.map(t => [t, +(cnt[t] / N).toFixed(3)])));
  ok(Math.abs(st / N - C.ST_P) < 0.01, `报价里斩数版占 ${(st / N * 100).toFixed(1)}%`);
  ok(!out && C.TERM.markup[0] >= 1.2, `报价都在基准价的 ${C.TERM.markup[0]}~${C.TERM.markup[1]} 倍（四舍五入到整数，实际 ${lo.toFixed(3)}~${hi.toFixed(3)}）`, [lo, hi, out]);
}

section('斩数：穿着斩数版的侠客每击倒一个对手 +1；没穿、没票、乱报都不算');
