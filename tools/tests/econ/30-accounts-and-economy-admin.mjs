const adm = (method, path, body, tok = ADMIN, ip = '1.2.3.4') => call(method, path, body, tok, ip);
const parseDetail = t => { try { return JSON.parse(t) || {}; } catch (e) { return {}; } };
const legacyUser = (id, name, prof) => ENV.DB.raw.prepare('INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(id, name, 'x', 'y', JSON.stringify({ name, ...prof }), T, T);
async function badInputs(path, base, cases) {   // 每一种乱填都要 400、错误说明对得上；返回对不上的
  const out = [];
  for (const [b, re] of cases) { const r = await adm('POST', path, { ...base, ...b }); if (!(r.status === 400 && re.test(r.error))) out.push([b, r.status, r.error]); }
  return out;
}

section('Dev 和普通玩家一样记账；dev、官方这类昵称别人注册不了；Dev 只能在管理后台建号、重设密码');
{
  const names = ['dev', 'Dev', 'DEV', 'd e v', 'dev_master', 'admin', 'Administrator', 'GM', '官方', '管理员', '开发组', '刃影官方'];
  const rs = [];
  for (const [i, n] of names.entries()) rs.push(await call('POST', '/api/register', { username: n, password: 'secret123' }, undefined, '3.3.' + i + '.1'));
  ok(rs.every(r => r.status === 400 && r.error === '这个昵称不能用，换一个吧'), `${names.length} 个像官方、开发者的昵称都注册不了`, rs.map(r => r.error));
  ok((await newUser('devil')).ok, '只是名字里带 dev 的（devil）照常能注册');

  const bad = await badInputs('/api/admin/password', { uid: 'Dev', password: 'dev-pass-0123456789', create: true, why: '建开发组账号' }, [
    [{ password: 'short-pw-11' }, /12 到 128/], [{ password: 'x'.repeat(129) }, /12 到 128/], [{ why: '' }, /原因/],
    [{ uid: 'u_fake', create: true }, /u_ 开头/], [{ uid: 'x' }, /2 到 20/], [{ uid: '<b>坏</b>' }, /2 到 20/],
  ]);
  ok(!bad.length, '重设密码乱填：密码太短太长、没写原因、昵称不对，都改不了', bad);
  ok((await adm('POST', '/api/admin/password', { uid: 'Dev', password: 'dev-pass-0123456789', why: '没加 create' })).status === 404, '没有这个号、也没说要新建：不建');
  const mk = await adm('POST', '/api/admin/password', { uid: 'Dev', password: 'dev-pass-0123456789', create: true, why: '建开发组账号' });
  ok(mk.ok && mk.created && mk.username === 'Dev' && /^u_[0-9a-f]{16}$/.test(mk.uid), '管理后台建好了 Dev 号', mk);
  const dev = await call('POST', '/api/login', { username: 'dev', password: 'dev-pass-0123456789' }, undefined, '3.4.0.1');
  ok(dev.ok && dev.uid === mk.uid, 'Dev 用管理后台设的密码登录（昵称不分大小写）');
  const log0 = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'admin_pw'", mk.uid);
  ok(log0 && !log0.detail.includes('dev-pass') && JSON.parse(log0.detail).created === true, '流水记了建号，没记密码');

  // Dev 和普通玩家一样：同步上来的墨锭、皮肤、武库库存都不认；要给它东西走管理后台
  const k = C.CS_KEYS[0], prof = profOf(mk.uid);
  await econ(dev.token, 'sync');
  const devInk0 = inkOf(mk.uid);
  const up = await call('POST', '/api/profile', { profile: { ...prof, ink: 500000, skins: [...C.CS_KEYS, 'qf_frost'], armory: { inv: [{ i: 1, k, st: -1, t: T, src: 'case' }, { i: 2, k, st: 0, t: T, src: 'case' }], cases: { c1: 50 }, nid: 3 } }, ledger: { deltas: [], ev: 0 } }, dev.token);
  const ds = stateOf(mk.uid);
  ok(up.ok && inkOf(mk.uid) === devInk0 && !ds.inv.length && !ds.cases.c1 && !profOf(mk.uid).skins.some(x => C.CS_KEYS.includes(x)), 'Dev 报上来的墨锭、库存、武器箱、武库皮肤一样都不认（和普通玩家一样）', [inkOf(mk.uid), ds.inv.length, ds.cases.c1]);
  const give = await adm('POST', '/api/admin/adjust', { uid: mk.uid, give: [k], why: '给 Dev 放货' });
  const dItem = stateOf(mk.uid).inv.find(x => x.k === k);
  ok(give.ok && dItem && profOf(mk.uid).skins.includes(k), '管理后台给 Dev 发的饰品进了库存，能穿', give);
  const L = await econ(dev.token, 'list', { i: dItem.i, price: 777 });
  ok(L.res && L.res.ok && mrow(L.res.l).seller === mk.uid, 'Dev 把饰品挂到玩家市场', L.res);
  const buyer = await newUser('devbuyer', { ink: 2000 });
  await econ(buyer.token, 'sync');
  const by = await econ(buyer.token, 'buy', { l: L.res.l, price: 777 });
  ok(by.res && by.res.ok && by.res.item.k === k && inkOf(buyer.uid) === 2000 - 777, '玩家从 Dev 手里买到了', by.res);
  await econ(dev.token, 'sync');
  ok(!profOf(mk.uid).skins.includes(k) && !stateOf(mk.uid).inv.some(x => x.k === k), 'Dev 卖掉最后一件以后就穿不了了（和普通玩家一样）');

  // 普通玩家同样这么报：一样都不认
  const norm = await newUser('notdev');
  await econ(norm.token, 'sync');
  const up2 = await call('POST', '/api/profile', { profile: { ...profOf(norm.uid), ink: 500000, skins: [...C.CS_KEYS], armory: { inv: [{ i: 1, k, st: -1, t: T, src: 'case' }], cases: { c1: 50 }, nid: 2 } }, ledger: { deltas: [], ev: 0 } }, norm.token);
  ok(up2.ok && inkOf(norm.uid) < 500000 && !stateOf(norm.uid).inv.length && !stateOf(norm.uid).cases.c1 && !profOf(norm.uid).skins.some(k => C.CS_KEYS.includes(k)), '普通玩家报同样的东西：墨锭、库存、武器箱、武库皮肤都不认', [inkOf(norm.uid), stateOf(norm.uid).inv.length]);

  // 重设密码：旧的登录全部退出，旧密码不能用，新密码能用；输错太多被锁的也一起解开
  for (let i = 0; i < 8; i++) await call('POST', '/api/login', { username: 'Dev', password: 'guess-' + i }, undefined, '3.4.1.' + i);
  ok((await call('POST', '/api/login', { username: 'Dev', password: 'dev-pass-0123456789' }, undefined, '3.4.2.1')).status === 429, '有人猜 Dev 的密码 8 次：Dev 先锁住');
  const rp = await adm('POST', '/api/admin/password', { uid: mk.uid, password: 'dev-pass-new-9876543210', why: '密码可能泄露了' });
  ok(rp.ok && !rp.created, '重设了 Dev 的密码');
  ok((await call('GET', '/api/profile', undefined, dev.token)).status === 401, '重设以后，之前登录的那个人被踢下线');
  ok((await call('POST', '/api/login', { username: 'Dev', password: 'dev-pass-0123456789' }, undefined, '3.4.2.2')).status === 401, '旧密码不能用了');
  ok((await call('POST', '/api/login', { username: 'Dev', password: 'dev-pass-new-9876543210' }, undefined, '3.4.2.3')).ok, '新密码能登录（被锁的也解开了）');
  const twice = await adm('POST', '/api/admin/password', { uid: 'Dev', password: 'dev-pass-new-9876543210', create: true, why: '再建一次' });
  ok(twice.ok && !twice.created && twice.uid === mk.uid, '已经有这个号时加了 create 也只是重设密码，不会建第二个');
}

section('管理口令：没有、不对都不行；同一个 IP 试错 20 次锁一小时；可以几个人各用一个口令，流水记得是谁');
{
  ok((await call('GET', '/api/admin/whoami', undefined, undefined, '4.4.0.1')).status === 403, '不带口令：不让进');
  ok((await call('GET', '/api/admin/whoami', undefined, 'wrong-pass', '4.4.0.1')).status === 403, '口令不对：不让进');
  const me = await adm('GET', '/api/admin/whoami');
  ok(me.ok && me.who === 'admin', '只设了一个口令：流水里记成 admin', me);
  const nosy = await newUser('nosy');
  ok((await adm('GET', '/api/admin/stats', undefined, nosy.token, '4.4.0.2')).status === 403, '玩家的登录凭证当不了管理口令');
  const viaEcon = await econ(nosy.token, 'adjust', { uid: nosy.uid, ink: 99999 });
  ok(viaEcon.status === 400 && viaEcon.error === '不认识的操作', '管理员的操作走不了玩家的 /api/econ', viaEcon);
  ENV.ADMIN_SECRET = 'even:e-secret-111-aaaaaa,lnt:l-secret-222-bbbbbb';
  const ev = await adm('GET', '/api/admin/whoami', undefined, 'e-secret-111-aaaaaa'), ln = await adm('GET', '/api/admin/whoami', undefined, 'l-secret-222-bbbbbb');
  ok(ev.who === 'even' && ln.who === 'lnt', '写成「名字:口令」的两个人：各用各的口令，认得出是谁', [ev.who, ln.who]);
  ok((await adm('GET', '/api/admin/whoami', undefined, 'even:e-secret-111-aaaaaa', '4.4.0.3')).status === 403 && (await adm('GET', '/api/admin/whoami', undefined, ADMIN, '4.4.0.3')).status === 403, '带着名字的整段、换掉以前的口令都不行');
  const vic = await newUser('auditee');
  await adm('POST', '/api/admin/adjust', { uid: vic.uid, ink: 7, why: '看看记成谁' }, 'l-secret-222-bbbbbb');
  ok(JSON.parse(row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'admin'", vic.uid).detail).by === 'lnt', '流水里记着是 lnt 改的');
  ENV.ADMIN_SECRET = 'even:short-pass,lnt:l-secret-222-bbbbbb';
  ok((await adm('GET', '/api/admin/whoami', undefined, 'short-pass', '4.4.0.6')).status === 403 && (await adm('GET', '/api/admin/whoami', undefined, 'l-secret-222-bbbbbb')).who === 'lnt', '少于 16 位的口令不认（同一行里够长的照样能用）');
  ENV.ADMIN_SECRET = '';
  ok((await adm('GET', '/api/admin/whoami', undefined, 'anything', '4.4.0.4')).status === 403 && (await adm('GET', '/api/admin/whoami', undefined, '', '4.4.0.4')).status === 403, '没设 ADMIN_SECRET：谁都进不了');
  ENV.ADMIN_SECRET = ADMIN;
  const st = [];
  for (let i = 0; i < 21; i++) st.push((await adm('GET', '/api/admin/whoami', undefined, 'guess' + i, '8.8.4.4')).status);
  ok(st.slice(0, 20).every(s => s === 403) && st[20] === 429, '同一个 IP 试错 20 次以后锁住', st);
  ok((await adm('GET', '/api/admin/whoami', undefined, ADMIN, '8.8.4.4')).status === 429, '锁住期间口令对了也不让进（防爆破）');
  ok((await adm('GET', '/api/admin/whoami', undefined, ADMIN, '8.8.4.5')).ok, '别的 IP 不受影响');
  T += 61 * 60000;
  ok((await adm('GET', '/api/admin/whoami', undefined, ADMIN, '8.8.4.4')).ok, '一小时后自己解锁');
}

section('管理员加减：墨锭、武器箱、终端机、改名标签、发饰品、收饰品；一次请求里的要么都改成、要么都不改');
{
  const P = await newUser('patient');
  await econ(P.token, 'gift');   // 新手礼：初刃武器箱 1 个、终端机 1 台
  const ink0 = inkOf(P.uid), ver = () => row('SELECT ver FROM econ WHERE uid = ?', P.uid).ver;
  const noWhy = await adm('POST', '/api/admin/adjust', { uid: P.uid, ink: 100 });
  ok(noWhy.status === 400 && /原因/.test(noWhy.error) && inkOf(P.uid) === ink0, '不写原因不让改', noWhy.error);
  ok((await adm('POST', '/api/admin/adjust', { uid: 'nobody-here', ink: 1, why: '测试' })).status === 404, '没有这个号：404');
  const a1 = await adm('POST', '/api/admin/adjust', { uid: 'patient', ink: 500, cases: { c1: 2, c7: 1 }, term: 1, tags: 2, give: [{ k: 'gc_wolf', st: 5 }, { k: 'qf_p1' }], why: '测试补偿' });
  const s1 = stateOf(P.uid), wolf = s1.inv.find(x => x.k === 'gc_wolf'), p1 = s1.inv.find(x => x.k === 'qf_p1');
  ok(a1.ok && a1.uid === P.uid && inkOf(P.uid) === ink0 + 500, '按昵称找到号，墨锭 +500', a1);
  ok(s1.cases.c1 === 3 && s1.cases.c7 === 1 && s1.term === 2 && s1.tags === 2, '武器箱、终端机、改名标签都加上了', [s1.cases, s1.term, s1.tags]);
  ok(wolf && wolf.st === 5 && wolf.src === 'admin' && p1 && p1.st === -1, '发的饰品进了库存：斩数版从 5 开始、普通版，来源记成管理员发的', s1.inv);
  ok(profOf(P.uid).skins.includes('gc_wolf') && profOf(P.uid).ink === inkOf(P.uid), '发的武库皮肤能穿，存档里的墨锭也跟着变');
  const lg = row("SELECT detail, ink0, ink1 FROM econ_log WHERE uid = ? AND act = 'admin' ORDER BY id DESC LIMIT 1", P.uid), d = JSON.parse(lg.detail);
  ok(d.by === 'admin' && d.why === '测试补偿' && lg.ink1 - lg.ink0 === 500 && d.give.length === 2 && d.cases.c7 === 1, '流水记下谁改的、为什么、改了什么', d);
  const sy = await econ(P.token, 'sync');
  ok(sy.state.cases.c1 === 3 && sy.state.inv.some(x => x.k === 'gc_wolf') && sy.ledger.ink === ink0 + 500, '玩家下次动武库就看到了');
  const a2 = await adm('POST', '/api/admin/adjust', { uid: P.uid, ink: -100, cases: { c1: -3 }, take: [wolf.i], why: '收回误发的' });
  const s2 = stateOf(P.uid);
  ok(a2.ok && inkOf(P.uid) === ink0 + 400 && s2.cases.c1 === 0 && !s2.inv.some(x => x.i === wolf.i) && a2.taken.length === 1, '扣 100 墨锭、扣 3 个武器箱、收走一件', a2);
  ok(!profOf(P.uid).skins.includes('gc_wolf') && !s2.via.includes('gc_wolf'), '收走的武库皮肤不能穿了');
  await call('POST', '/api/profile', { profile: { ...profOf(P.uid), skins: [...profOf(P.uid).skins, 'gc_wolf'] }, ledger: { deltas: [], ev: 0 } }, P.token);
  ok(!profOf(P.uid).skins.includes('gc_wolf'), '拿旧存档覆盖也加不回来');
  const v1 = ver(), i1 = inkOf(P.uid);
  const bad = await badInputs('/api/admin/adjust', { uid: P.uid, why: '乱填测试' }, [
    [{ ink: -(i1 + 1) }, /扣不了/], [{ cases: { c2: -1 } }, /扣不了/], [{ term: -99 }, /终端机/], [{ tags: -3 }, /改名标签/], [{ ink: 1000001 }, /最多/], [{ ink: 1.5 }, /整数/],
    [{ ink: 'lots' }, /整数/], [{ cases: { c9: 1 } }, /武器箱/], [{ cases: { c1: 1001 } }, /武器箱/], [{ give: [{ k: 'nope' }] }, /没有这件饰品/], [{ give: ['__proto__'] }, /没有这件饰品/],
    [{ give: [{ k: 'qf_p1', st: 2.5 }] }, /斩数/], [{ take: [99999] }, /库存里没有/], [{ take: ['x'] }, /编号不对/], [{}, /什么都没填/], [{ ink: 50, take: [99999] }, /库存里没有/],
    [{ give: Array.from({ length: Object.keys(C.ITEM).length + 1 }, () => ({ k: 'qf_p1' })) }, /最多/],
  ]);
  ok(!bad.length && ver() === v1 && inkOf(P.uid) === i1, '17 种乱填都不改（扣成负数、超上限、小数、不存在的箱子和饰品、库存里没有的）；有一项不对，整个请求都不改', bad);
  const it = stateOf(P.uid).inv[0], l = await econ(P.token, 'list', { i: it.i, price: 99 });
  const tl = await adm('POST', '/api/admin/adjust', { uid: P.uid, take: [it.i], why: '测试' });
  ok(l.res.ok && tl.status === 400 && /市场/.test(tl.error), '挂在玩家市场上的收不了（要等玩家撤下或者卖掉）', tl.error);
  await econ(P.token, 'cancel', { l: l.res.l });
  const fullSetUser = await newUser('skin-set-recipient');
  const allKeys = Object.keys(C.ITEM);
  const fullSet = await adm('POST', '/api/admin/adjust', { uid: fullSetUser.uid, give: allKeys.map(k => ({ k, st: 7 })), why: '全饰品发放测试' });
  const allInv = stateOf(fullSetUser.uid).inv;
  const fullLog = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'admin' ORDER BY id DESC LIMIT 1", fullSetUser.uid);
  const loggedGive = JSON.parse(fullLog.detail).give;
  ok(fullSet.ok && fullSet.given.length === allKeys.length && allInv.length === allKeys.length && allInv.every(it => it.st === 7 && it.src === 'admin'), '整套发放上限覆盖全部饰品，斩数版应用到每件饰品', { given: fullSet.given.length, inventory: allInv.length });
  ok(new Set(allInv.map(it => it.k)).size === allKeys.length && allKeys.every(k => allInv.some(it => it.k === k)), '完整发放包含目录中的每一件饰品');
  ok(loggedGive.length === allKeys.length, '完整发放流水保留全部饰品明细', loggedGive.length);
  legacyUser('u_legacyold00001', 'oldtimer', { ink: 300 });
  const fa = await adm('POST', '/api/admin/adjust', { uid: 'oldtimer', ink: 200, why: '老号补偿' });
  ok(fa.ok && inkOf('u_legacyold00001') === 500 && row("SELECT COUNT(*) AS n FROM econ_log WHERE uid = ? AND act = 'open_account'", 'u_legacyold00001').n === 1, '还没有武库存档的老号：先按存档建好武库（300 墨锭），再加 200');
  const info = await adm('GET', '/api/admin/econ?uid=oldtimer');
  ok(info.ok && info.econ.ink === 500 && info.createdAt === T && info.log.some(x => x.act === 'admin'), '一个号的详情：武库、注册时间、流水', info.econ);
  await adm('POST', '/api/admin/adjust', { uid: P.uid, ink: 5000, why: '准备并发测试' });
  const b0 = inkOf(P.uid), c0 = stateOf(P.uid).cases.c2;
  const rs = await Promise.all([
    ...Array.from({ length: 4 }, () => adm('POST', '/api/admin/adjust', { uid: P.uid, ink: 10, why: '并发测试' })),
    ...Array.from({ length: 3 }, () => econ(P.token, 'buyCase', { c: 'c2' })),
  ]);
  const nA = rs.slice(0, 4).filter(r => r.ok).length, nB = rs.slice(4).filter(r => r.ok && r.res && r.res.ok).length;
  ok(nA >= 1 && nB >= 1 && inkOf(P.uid) === b0 + 10 * nA - C.COLS.c2.price * nB && stateOf(P.uid).cases.c2 === c0 + nB, `管理员加墨锭的时候玩家正好在买箱子：成了的 ${nA} 次加、${nB} 次买一笔不丢，也没有多算`, [nA, nB, inkOf(P.uid) - b0]);
}

section('封号、解封：管理员封几天或者永久，都要写原因');
{
  const V = await newUser('villain');
  ok((await adm('POST', '/api/admin/ban', { uid: V.uid, days: 2 })).status === 400, '不写原因不让封');
  ok((await adm('POST', '/api/admin/ban', { uid: V.uid, days: 0, why: '测试' })).status === 400 && (await adm('POST', '/api/admin/ban', { uid: V.uid, days: 9999, why: '测试' })).status === 400, '天数要在 1 到 3650');
  const b1 = await adm('POST', '/api/admin/ban', { uid: 'villain', days: 2, why: '刷屏骂人' });
  ok(b1.ok && b1.banUntil === T + 2 * 86400e3 && !b1.perm, '封 2 天', b1);
  ok((await econ(V.token, 'sync')).status === 403 && (await call('POST', '/api/profile', { profile: { ink: 1 } }, V.token)).status === 403, '封号期间不能动武库、不能写存档');
  const rec = (await call('GET', '/api/ac', undefined, V.token)).rec;
  ok(rec.log.some(x => x.src === 'admin:admin' && x.r === '刷屏骂人') && rec.strikes === 0, '处罚记录里写着是管理员封的、原因是什么（不算反作弊记过）', rec);
  const pd = await adm('POST', '/api/admin/pardon', { uid: V.uid, why: '道歉了' });
  ok(pd.ok && (await econ(V.token, 'sync')).ok, '解封后马上能动');
  const pm = await adm('POST', '/api/admin/ban', { uid: V.uid, perm: true, why: '开挂' });
  T += 5 * 86400e3;
  ok(pm.ok && pm.perm && (await econ(V.token, 'sync')).status === 403, '永久封号过了几天也还封着');
  await adm('POST', '/api/admin/pardon', { uid: V.uid, why: '申诉成功' });
  ok((await econ(V.token, 'sync')).ok, '永久封号也能解');
  const acts = ENV.DB.raw.prepare("SELECT act FROM econ_log WHERE uid = ? AND act IN ('admin_ban', 'pardon') ORDER BY id").all(V.uid).map(r => r.act);
  ok(acts.join() === 'admin_ban,pardon,admin_ban,pardon', '封、解封都记进流水', acts);
}

section('全服补偿：每个号只领一份，同时领也只领一份；发出之后才注册的号领不到；停发、过期的领不到');
{
  const G1 = await newUser('giftee1'), G2 = await newUser('giftee2');
  T += 1000;
  const bad = await badInputs('/api/admin/gift', { to: 'all', note: '维护补偿', why: '测试' }, [
    [{}, /什么都没有/], [{ ink: 10, note: 'x' }, /说明/], [{ ink: 1000001 }, /墨锭/], [{ ink: -5 }, /墨锭/], [{ cases: { c1: 101 } }, /武器箱/],
    [{ cases: { zz: 1 } }, /武器箱/], [{ term: 101 }, /最多 100/], [{ ink: 10, days: 91 }, /天数/], [{ ink: 10, days: 0 }, /天数/],
  ]);
  ok(!bad.length && row('SELECT COUNT(*) AS n FROM gift').n === 0, '9 种乱填的补偿都发不出去', bad);
  ok((await adm('POST', '/api/admin/gift', { to: 'nobody-x', ink: 10, note: '维护补偿' })).status === 404, '发给不存在的号：404');
  const g = await adm('POST', '/api/admin/gift', { to: 'all', ink: 300, cases: { c2: 1 }, term: 1, note: '服务器维护补偿', why: '周六维护了两小时' });
  ok(g.ok && /^[0-9a-f]{16}$/.test(g.id) && g.until === T + 14 * 86400e3, '发出全服补偿，默认 14 天内能领', g);
  const i1 = inkOf(G1.uid), r1 = await econ(G1.token, 'sync');
  ok(r1.ok && r1.gifts && r1.gifts.length === 1 && r1.gifts[0].note === '服务器维护补偿' && r1.gifts[0].ink === 300 && r1.gifts[0].cases.c2 === 1 && !('id' in r1.gifts[0]), '下次动武库就领到，回复里带着说明和内容（网页弹提示用）', r1.gifts);
  ok(inkOf(G1.uid) === i1 + 300 && stateOf(G1.uid).cases.c2 === 1 && stateOf(G1.uid).term === 1, '墨锭、武器箱、终端机都进了账');
  const r1b = await econ(G1.token, 'sync');
  ok(!r1b.gifts && inkOf(G1.uid) === i1 + 300, '再动武库不会再领');
  const i2 = inkOf(G2.uid), rs = await Promise.all(Array.from({ length: 6 }, () => econ(G2.token, 'sync')));
  ok(inkOf(G2.uid) === i2 + 300 && rs.filter(r => r.gifts).length === 1 && rs.every(r => r.ok), '同时发 6 个请求也只领一份', [inkOf(G2.uid) - i2, rs.map(r => r.status)]);
  ok(row('SELECT COUNT(*) AS n FROM gift_got WHERE gid = ?', g.id).n === 2 && row("SELECT COUNT(*) AS n FROM econ_log WHERE uid = ? AND act = 'gift_got'", G2.uid).n === 1, '领过的记下来，流水里一人一条（gift_got，和新手礼的 gift 分开）');
  await adm('POST', '/api/admin/gift', { to: 'giftee1', tags: 2, note: '单独补偿', why: '测试' });
  const o2 = await econ(G2.token, 'sync');
  ok(!(o2.gifts || []).some(x => x.note === '单独补偿'), '单发给一个号的，别的号领不到');
  const tags0 = stateOf(G1.uid).tags, fo = await econ(G1.token, 'open', { c: 'c5' });
  ok(fo.ok && fo.res.err && fo.gifts && fo.gifts[0].note === '单独补偿' && stateOf(G1.uid).tags === tags0 + 2, '那个号自己领到；这次的动作没成（没有这个箱子），补偿照样领到', [fo.res, fo.gifts]);
  T += 1000;
  const late = await newUser('latecomer'), li = inkOf(late.uid), rl = await econ(late.token, 'sync');
  ok(!rl.gifts && inkOf(late.uid) === li, '发补偿之后才注册的号领不到（免得开小号来领）');
  const gn = await adm('POST', '/api/admin/gift', { to: 'all', ink: 50, newToo: true, note: '新老都有', why: '测试' });
  T += 1000;
  const late2 = await newUser('latecomer2'), rl2 = await econ(late2.token, 'sync');
  ok(gn.ok && rl2.gifts && rl2.gifts.length === 1 && rl2.gifts[0].note === '新老都有', '勾了“之后新注册的也能领”的那份，新号也领到；别的那份还是领不到', rl2.gifts);
  const goff = await adm('POST', '/api/admin/gift', { to: 'all', ink: 10, note: '要停发的', why: '测试' });
  ok((await adm('POST', '/api/admin/gift/off', { id: goff.id })).status === 400, '停发也要写原因');
  const off = await adm('POST', '/api/admin/gift/off', { id: goff.id, why: '发错了' }), r3 = await econ(G2.token, 'sync');
  ok(off.ok && (r3.gifts || []).some(x => x.note === '新老都有') && !(r3.gifts || []).some(x => x.note === '要停发的'), '停发以后领不到，别的照样领', r3.gifts);
  const gexp = await adm('POST', '/api/admin/gift', { to: 'all', ink: 10, days: 1, note: '一天内领', why: '测试' });
  const r4a = await econ(G1.token, 'sync');
  T += 86400e3 + 1000;
  const r4 = await econ(G2.token, 'sync');
  ok(gexp.ok && (r4a.gifts || []).some(x => x.note === '一天内领') && !r4.gifts, '有效期里领得到，过了有效期领不到', [r4a.gifts, r4.gifts]);
  const gl = await adm('GET', '/api/admin/gifts'), byId = Object.fromEntries(gl.gifts.map(x => [x.id, x]));
  ok(byId[g.id].got === 2 && byId[goff.id].off === 1 && byId[g.id].items.cases.c2 === 1 && byId[g.id].by === 'admin' && byId[g.id].uid === '*', '补偿列表：领了几个、停发了没有、内容、谁发的', byId[g.id]);
  const tagged = await adm('POST', '/api/admin/gift', { to: 'all', ink: 1, note: '<img src=x onerror=1>维护', why: '测试' });
  ok(tagged.ok && row('SELECT note FROM gift WHERE id = ?', tagged.id).note === 'img src=x onerror=1维护', '说明里的尖括号去掉（游戏里显示也不会出事）');
  for (const id of [tagged.id, gn.id]) await adm('POST', '/api/admin/gift/off', { id, why: '测试完了' });   // 后面的测试不要再领到
}

section('兑换码：管理后台建、玩家在游戏的兑换框输入；每个号只领一次，领完、过期、停用都领不到；同时抢也不会多领；输错太多次先锁一小时');
{
  const claim = (tok, code, ip = '2.2.0.1', n = nonce()) => call('POST', '/api/econ', { act: 'claimCode', args: { code }, nonce: n }, tok, ip);
  const R1 = await newUser('redeemer1'), R2 = await newUser('redeemer2'), R3 = await newUser('redeemer3');
  for (const u of [R1, R2, R3]) await econ(u.token, 'sync');
  T += 1000;
  const bad = await badInputs('/api/admin/code', { ink: 10, note: '新春礼包', why: '测试' }, [
    [{ ink: 0 }, /什么都没有/], [{ note: 'x' }, /说明/], [{ ink: 1000001 }, /墨锭/], [{ cases: { c1: 101 } }, /武器箱/], [{ cases: { zz: 1 } }, /武器箱/],
    [{ uses: 0 }, /几个号/], [{ uses: 100001 }, /几个号/], [{ uses: 2.5 }, /几个号/], [{ days: 91 }, /天数/],
    [{ code: 'ab' }, /4 到 20/], [{ code: 'has space' }, /4 到 20/], [{ code: 'A'.repeat(21) }, /4 到 20/], [{ code: '新春礼包' }, /4 到 20/],
    [{ code: 'renying666' }, /游戏里已经有/], [{ code: 'Lock' }, /游戏里已经有/],
  ]);
  ok(!bad.length && row('SELECT COUNT(*) AS n FROM code').n === 0, '15 种乱填的兑换码都建不出来（什么都没有、没写说明、超出范围、码太短太长、有空格或汉字、和游戏里写死的码同名）', bad);
  const c1 = await adm('POST', '/api/admin/code', { code: ' spring2026 ', ink: 500, cases: { c2: 1 }, term: 1, tags: 1, uses: 2, note: '新春礼包', why: '新春活动' });
  ok(c1.ok && c1.code === 'SPRING2026' && c1.until === T + 14 * 86400e3, '自己起的码：去掉空格、换成大写；默认 14 天内能领', c1);
  ok((await adm('POST', '/api/admin/code', { code: 'Spring2026', ink: 1, note: '重复的码' })).status === 409, '同一个码不能建两次（不分大小写）');
  const rnd = [];
  for (let j = 0; j < 5; j++) rnd.push((await adm('POST', '/api/admin/code', { ink: 1, uses: 1, note: '随机码' })).code);
  ok(rnd.every(k => /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{10}$/.test(k)) && new Set(rnd).size === 5, '不填码就随机生成 10 位（没有 0、O、1、I、L，免得玩家看错）', rnd);

  const i1 = inkOf(R1.uid), s1 = stateOf(R1.uid);
  const r1 = await claim(R1.token, 'spring2026');
  ok(r1.ok && r1.res.ok && r1.code && r1.code.note === '新春礼包' && r1.code.ink === 500 && r1.code.cases.c2 === 1 && r1.code.term === 1 && r1.code.tags === 1, '玩家输入（小写也行）就领到，回复里带着说明和内容（网页弹提示用）', r1);
  const s1b = stateOf(R1.uid);
  ok(inkOf(R1.uid) === i1 + 500 && s1b.cases.c2 === (s1.cases.c2 || 0) + 1 && s1b.term === s1.term + 1 && s1b.tags === s1.tags + 1, '墨锭、武器箱、终端机、改名标签都进了账');
  ok(r1.ledger && r1.ledger.ink === inkOf(R1.uid) && r1.state && r1.state.term === s1b.term, '回复里的账本和存档也是领完以后的（网页按这个显示）', r1.ledger);
  const lg = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'code_got'", R1.uid), lgd = lg ? parseDetail(lg.detail) : {};
  ok(lgd.code === 'SPRING2026' && lgd.ink === 500 && lgd.cases.c2 === 1 && !row("SELECT 1 AS x FROM econ_log WHERE act = 'claimCode'"), '玩家的流水里记一条 code_got：哪个码、领到了什么', lgd);
  const again = await claim(R1.token, 'SPRING2026');
  ok(again.status === 400 && again.error === '这个兑换码你已经领过了' && inkOf(R1.uid) === i1 + 500, '同一个号再领：已经领过了', again);
  const n2 = nonce(), rp1 = await claim(R2.token, 'SPRING2026', '2.2.0.2', n2), i2 = inkOf(R2.uid), rp2 = await claim(R2.token, 'SPRING2026', '2.2.0.2', n2);
  ok(rp1.ok && rp2.ok && rp2.replay && rp2.code && rp2.code.note === '新春礼包' && inkOf(R2.uid) === i2, '网络重试（同一个请求编号再发一次）：照样回“领到了”，但只领一份', rp2);
  const full = await claim(R3.token, 'SPRING2026', '2.2.0.3');
  ok(full.status === 400 && full.error === '这个兑换码已经被领完了', '最多 2 个号能领：第 3 个号领不到', full);
  ok(row('SELECT got FROM code WHERE code = ?', 'SPRING2026').got === 2 && row('SELECT COUNT(*) AS n FROM code_got WHERE code = ?', 'SPRING2026').n === 2, '领过的号记下来（code_got），领走的份数对得上');

  await adm('POST', '/api/admin/code', { code: 'RUSHONE', ink: 70, uses: 100, note: '并发测试' });
  const i3 = inkOf(R3.uid), rs = await Promise.all(Array.from({ length: 6 }, (_, j) => claim(R3.token, 'RUSHONE', '2.2.1.' + j)));
  ok(rs.filter(r => r.ok).length === 1 && inkOf(R3.uid) === i3 + 70 && rs.filter(r => !r.ok).every(r => r.error === '这个兑换码你已经领过了'), '同一个号同时发 6 个请求：只领到一份', rs.map(r => r.status + (r.error || '')));
  await adm('POST', '/api/admin/code', { code: 'LASTTHREE', ink: 30, uses: 3, note: '抢最后几份' });
  const many = [];
  for (let j = 0; j < 6; j++) { const u = await newUser('rusher' + j); await econ(u.token, 'sync'); many.push(u); }
  const ink6 = many.map(u => inkOf(u.uid)), rr = await Promise.all(many.map((u, j) => claim(u.token, 'LASTTHREE', '2.2.2.' + j)));
  const gain6 = many.reduce((a, u, j) => a + inkOf(u.uid) - ink6[j], 0);
  ok(rr.filter(r => r.ok).length === 3 && rr.filter(r => !r.ok).every(r => r.error === '这个兑换码已经被领完了') && gain6 === 90 && row('SELECT got FROM code WHERE code = ?', 'LASTTHREE').got === 3, '6 个号同时抢最后 3 份：正好 3 个领到，别的领不到（不会多领）', [rr.map(r => r.status + (r.error || '')), gain6]);

  await adm('POST', '/api/admin/gift', { to: 'redeemer1', ink: 11, note: '顺便补偿', why: '测试' });
  await adm('POST', '/api/admin/code', { code: 'WITHGIFT', ink: 22, note: '和补偿一起' });
  const ig = inkOf(R1.uid), rg = await claim(R1.token, 'WITHGIFT', '2.2.3.1');
  ok(rg.ok && rg.gifts && rg.gifts[0].note === '顺便补偿' && rg.code.note === '和补偿一起' && inkOf(R1.uid) === ig + 33, '有补偿还没领的时候兑换：补偿和兑换码一起进账', [rg.gifts, rg.code]);

  await adm('POST', '/api/admin/code', { code: 'STOPME', ink: 20, note: '要停用的' });
  ok((await adm('POST', '/api/admin/code/off', { code: 'STOPME' })).status === 400, '停用也要写原因');
  ok((await adm('POST', '/api/admin/code/off', { code: 'NOSUCHCODE', why: '测试' })).status === 404, '停用不存在的码：404');
  const off = await adm('POST', '/api/admin/code/off', { code: 'stopme', why: '发错了' }), ro = await claim(R2.token, 'STOPME', '2.2.3.2');
  ok(off.ok && ro.status === 400 && ro.error === '兑换码无效或已过期', '停用以后领不到（和不存在的码说法一样）', ro);
  const B = await newUser('bannedredeemer');
  await econ(B.token, 'sync');
  await adm('POST', '/api/admin/code', { code: 'BANTEST', ink: 20, note: '封号测试' });
  await adm('POST', '/api/admin/ban', { uid: B.uid, days: 1, why: '测试封号' });
  const rb = await claim(B.token, 'BANTEST', '2.2.3.3');
  ok(rb.status === 403 && row('SELECT got FROM code WHERE code = ?', 'BANTEST').got === 0, '封了号的领不了', rb);
  const loc = C.run(C.blank(), 'claimCode', { code: 'BANTEST' }, { now: T, rnd: Math.random, uid: 'local', ink: 0, skins: [], equip: {}, server: false });
  ok(loc.res.err && /服务器/.test(loc.res.err) && C.ACTIONS.includes('claimCode'), '本机存档（没有服务器）领不了兑换码', loc.res);

  const W = await newUser('guesser');
  await econ(W.token, 'sync');
  const st = [];
  for (let j = 0; j < 11; j++) st.push((await claim(W.token, j === 3 ? '!!' : 'WRONG' + j, '2.2.4.' + j)).status);
  ok(st.slice(0, 10).every(s => s === 400) && st[10] === 429, '同一个号一小时里输错 10 次（换 IP 也算）：先锁住', st);
  await adm('POST', '/api/admin/code', { code: 'RIGHTONE', ink: 20, note: '锁住测试' });
  ok((await claim(W.token, 'RIGHTONE', '2.2.4.99')).status === 429, '锁住期间输对了也不让领（防猜码）');
  const G = [];
  for (let j = 0; j < 4; j++) { const u = await newUser('ipguess' + j); await econ(u.token, 'sync'); G.push(u); }
  const ipst = [];
  for (let j = 0; j < 31; j++) ipst.push((await claim(G[j % 4].token, 'NOPE' + j, '2.2.5.5')).status);
  ok(ipst.slice(0, 30).every(s => s === 400) && ipst[30] === 429, '同一个 IP 换着号输错 30 次：这个 IP 先锁住', ipst);
  ok((await claim(R3.token, 'RIGHTONE', '2.2.5.6')).ok, '别的 IP、别的号不受影响');
  T += 61 * 60000;
  ok((await claim(W.token, 'RIGHTONE', '2.2.4.99')).ok && (await claim(G[0].token, 'RIGHTONE', '2.2.5.5')).ok, '一小时后自己解锁');
  await adm('POST', '/api/admin/code', { code: 'ONEDAY', ink: 20, days: 1, note: '一天内领' });
  const ex0 = await claim(R2.token, 'ONEDAY', '2.2.6.1');
  T += 86400e3 + 1000;
  const ex = await claim(R3.token, 'ONEDAY', '2.2.6.2');
  ok(ex0.ok && ex.status === 400 && ex.error === '兑换码无效或已过期', '有效期里领得到，过了有效期领不到', ex);

  const cl = await adm('GET', '/api/admin/codes'), byCode = Object.fromEntries(cl.codes.map(x => [x.code, x]));
  const sp = byCode.SPRING2026 || {};
  ok(cl.ok && sp.got === 2 && sp.uses === 2 && sp.items.cases.c2 === 1 && sp.items.term === 1 && sp.by === 'admin' && sp.note === '新春礼包' && byCode.STOPME.off === 1 && !('items_json' in sp), '兑换码列表：领了几份、最多几份、内容、谁建的、停用了没有', sp);
  const au = await adm('GET', '/api/admin/audit');
  ok(au.rows.some(r => r.act === 'code_new' && r.uid === '*' && parseDetail(r.detail).code === 'SPRING2026' && parseDetail(r.detail).why === '新春活动' && parseDetail(r.detail).uses === 2) && au.rows.some(r => r.act === 'code_off' && parseDetail(r.detail).code === 'STOPME' && parseDetail(r.detail).why === '发错了'), '操作记录里有建码和停用，写着原因');
}

section('在线改经济数值：价格、每天能开几个、手续费、爆率马上生效；乱填的不收；能退回；规则核心里写死的默认值不变');
{
  const expanded = C.cleanCfg({ openDay: 1000, 'price.c1': 0, fee: 0.9 });
  ok(!expanded.err && expanded.cfg.openDay === 1000 && expanded.cfg['price.c1'] === 0 && expanded.cfg.fee === 0.9, '经济配置不再受原先的人为上限限制', expanded);
  const c0 = await adm('GET', '/api/admin/cfg');
  ok(c0.ok && c0.id === 0 && !Object.keys(c0.cfg).length && c0.info.length === C.CFG_INFO.length && !c0.hist.length, '一开始全是默认值', c0.id);
  const bad = await badInputs('/api/admin/cfg', { why: '乱填测试' }, [
    [{ set: { bogus: 1 } }, /不认识/], [{ set: { constructor: 1 } }, /不认识/], [{ set: { 'price.c1': -1 } }, /之间/], [{ set: { 'price.c1': 'abc' } }, /数字/],
    [{ set: { openDay: 2.5 } }, /整数/], [{ set: { fee: 1.1 } }, /之间/], [{ set: { 'odds.mil': 0.6 } }, /加起来/], [{ set: { 'prem.gold': 0.5 } }, /加起来/],
    [{ set: { 'term.lo': 2, 'term.hi': 1.5 } }, /最低/], [{ set: {} }, /没写/], [{ set: 'price.c1=1' }, /没写/], [{ set: { 'price.c1': 280 } }, /一样/],
  ]);
  ok(!bad.length && row('SELECT COUNT(*) AS n FROM cfg').n === 0, '12 种乱填的都存不进去（不认识的项、超出范围、不是数字、该填整数的填了小数、爆率加起来不是 1、终端机倍数反了、和现在一样）', bad);
  ok((await adm('POST', '/api/admin/cfg', { set: { 'price.c1': 300 } })).status === 400, '不写原因不让改');
  const E1 = await newUser('econ1'), E2 = await newUser('econ2');
  await adm('POST', '/api/admin/adjust', { uid: E1.uid, ink: 20000, why: '测试用' });
  await adm('POST', '/api/admin/adjust', { uid: E2.uid, ink: 5000, why: '测试用' });
  const s1 = await adm('POST', '/api/admin/cfg', { set: { 'price.c1': 300, openDay: 3, fee: 0.1, 'odds.mil': 0.5, 'odds.res': 0.3 }, why: '周末活动' });
  ok(s1.ok && s1.id === 1 && s1.cfg['price.c1'] === 300 && s1.cfg.fee === 0.1, '存成第 1 版', s1);
  const ib = inkOf(E1.uid), buy = await econ(E1.token, 'buyCase', { c: 'c1', n: 4 });
  ok(buy.res.ok && !buy.gifts && inkOf(E1.uid) === ib - 1200, '商店马上按新价格卖：4 个初刃武器箱 1200', [buy.res, ib - inkOf(E1.uid)]);
  ok(buy.cfg && buy.cfg['price.c1'] === 300 && buy.cfg.openDay === 3, '武库的回复里带着现在的数值（网页拿来显示价格、上限）');
  let opened = 0;
  for (let i = 0; i < 4; i++) if ((await econ(E1.token, 'open', { c: 'c1' })).res.ok) opened++;
  ok(opened === 3, '每天能开的普通武器箱从 2 个改成 3 个', opened);
  ok(C.oddsOf('c1', s1.cfg).mil === 0.5 && C.oddsOf('c1', s1.cfg).res === 0.3 && C.oddsOf('c7', s1.cfg).gold === 0.08 && C.oddsOf('c1').mil === 0.53, '开箱爆率按新的算（神兵武器箱没改的照旧）');
  const item = stateOf(E1.uid).inv[0], ls = await econ(E1.token, 'list', { i: item.i, price: 1000 }), by = await econ(E2.token, 'buy', { l: ls.res.l });
  const sel0 = inkOf(E1.uid);
  await econ(E1.token, 'sync');
  ok(ls.res.ok && by.res.ok && inkOf(E1.uid) === sel0 + 900, '卖掉标价 1000 的一件：手续费改成 10%，卖家到手 900', inkOf(E1.uid) - sel0);
  const s2 = await adm('POST', '/api/admin/cfg', { set: { fee: null }, why: '手续费改回去' });
  ok(s2.ok && s2.id === 2 && !('fee' in s2.cfg) && s2.cfg['price.c1'] === 300, '填 null 就这一项回到默认，别的不动', s2.cfg);
  const u1 = await adm('POST', '/api/admin/cfg/undo', { to: 1, why: '还是用第 1 版' });
  ok(u1.ok && u1.id === 3 && u1.cfg.fee === 0.1, '退回到第 1 版（存成第 3 版）', u1);
  ok((await adm('POST', '/api/admin/cfg/undo', { to: 1, why: '再来' })).status === 400 && (await adm('POST', '/api/admin/cfg/undo', { to: 99, why: '测试' })).status === 404, '退回到现在用的这一版、不存在的版本：都不存');
  const h = await adm('GET', '/api/admin/cfg');
  ok(h.id === 3 && h.hist.length === 3 && h.hist[0].note.startsWith('退回到第 1 版') && h.hist.every(x => x.by === 'admin'), '版本记录：谁改的、为什么', h.hist.map(x => x.note));
  ok((await adm('GET', '/api/admin/stats')).cfgId === 3, '总览里看得到现在是第几版');
  ENV.DB.raw.prepare('INSERT INTO cfg (json, by, note, at) VALUES (?, ?, ?, ?)').run('{"price.c1": -5}', 'x', '手动改坏的', T);
  T += 31000;
  const ib2 = inkOf(E1.uid), bb = await econ(E1.token, 'buyCase', { c: 'c1' });
  ok(bb.res.ok && inkOf(E1.uid) === ib2 - C.COLS.c1.price && !Object.keys(bb.cfg).length, '数据库里存的数值坏了：整版不用，回到默认，照样能玩', ib2 - inkOf(E1.uid));
  const z = await adm('POST', '/api/admin/cfg/undo', { to: 0, why: '全部回到默认' });
  ok(z.ok && !Object.keys(z.cfg).length, '全部回到默认值');
  ok(C.COLS.c1.price === 280 && C.FEE === 0.15 && C.OPEN_DAY === 5 && Object.isFrozen(C.CFG_DEF) && Object.isFrozen(C.CFG_INFO[0]) && C.CFG_DEF['price.c1'] === 280, '规则核心里写死的默认值一个没变（在线改的只存在数据库里）');
}

section('两个人同时注册同一个昵称：只成一个，另一个看到“已被注册”而不是服务器错误');
{
  for (let round = 0; round < 6; round++) {
    const name = 'twin' + round;
    const rs = await Promise.all([0, 1, 2].map(i => call('POST', '/api/register', { username: i === 1 ? name.toUpperCase() : name, password: 'secret123' }, undefined, `4.4.${round}.${i}`)));
    const okN = rs.filter(r => r.ok).length, dup = rs.filter(r => r.status === 400 && /已被注册/.test(r.error || '')).length;
    if (okN !== 1 || dup !== 2) { ok(false, '同时注册同名', rs.map(r => r.status + ' ' + (r.error || 'ok'))); break; }
    if (round === 5) ok(true, '六轮、每轮三个请求同时注册同一个昵称（大小写不同也算同名）：每轮只成一个，其余都提示已被注册');
  }
}

section('排行榜：段位榜只列本赛季打满定级赛的，战绩榜按胜场；被封的号不上榜；guest、游客不能注册');
{
  const mk = async (name, rk, w, l) => {
    const u = await newUser(name);
    const r = await call('POST', '/api/profile', { profile: { ...profOf(u.uid), rk }, ledger: { deltas: [], ev: 0 }, prog: { deltas: [{ id: 'abcd' + Buffer.from(name).toString('hex').slice(0, 12), d: { netWins: w, netLosses: l } }] } }, u.token);   // 胜负场走增量账（绝对数不认）
    if (!r.ok) throw new Error('profile ' + JSON.stringify(r));
    return u;
  };
  const a = await mk('lbAlpha', { season: 'S1', pts: 9000, placed: 5 }, 12, 3);
  await mk('lbBeta', { season: 'S1', pts: 99999, placed: 7 }, 30, 1);
  await mk('lbGamma', { season: 'S1', pts: 20000, placed: 3 }, 0, 2);
  await mk('lbPlacing', { season: 'S1', pts: 0, est: 7800, placed: 3 }, 0, 0);
  await mk('lbNotReady', { season: 'S1', pts: 0, est: 8000, placed: 2 }, 0, 0);
  await mk('lbDelta', { season: 'S0', pts: 24000, placed: 9 }, 5, 5);
  const bad = await mk('lbEvil', { season: 'S1', pts: 24000, placed: 9 }, 99, 0);
  await adm('POST', '/api/admin/ban', { uid: bad.uid, days: 2, why: '测试排行榜' });
  const rk = await call('GET', '/api/leaderboard?k=rank&s=S1', undefined, a.token, '8.8.1.1');
  const names = (rk.list || []).map(r => r.name);
  ok(rk.ok && names.includes('lbAlpha') && names.includes('lbBeta') && names.includes('lbGamma') && !names.includes('lbDelta') && !names.includes('lbEvil'),
    '段位榜：本赛季打满 3 场的上榜；没打满、上赛季、被封的不上', names);
  ok(names.includes('lbPlacing') && !names.includes('lbNotReady') && rk.list.find(x => x.name === 'lbPlacing').pts === 7800, '原来打了 3 场但尚未定级的账号按估分上榜');
  ok(names.indexOf('lbBeta') < names.indexOf('lbAlpha') && rk.list.find(r => r.name === 'lbBeta').pts === 25000, '按段位分排，报上来的离谱分数夹到最高 25000', rk.list.slice(0, 3));
  ok(rk.list.find(r => r.name === 'lbAlpha').me && !rk.list.find(r => r.name === 'lbBeta').me, '带登录凭证看，自己那一行标出来');
  const wn = await call('GET', '/api/leaderboard?k=wins', undefined, undefined, '8.8.1.2');
  const wl = (wn.list || []).map(r => r.name);
  ok(wn.ok && wn.players > 0 && wl.indexOf('lbBeta') < wl.indexOf('lbAlpha') && !wl.includes('lbGamma') && !wl.includes('lbEvil'), '战绩榜：按胜场排，没赢过的、被封的不上', wl);
  ok((await call('GET', '/api/leaderboard?k=rank&s=bad', undefined, undefined, '8.8.1.3')).list.length === 0, '赛季乱填：空榜');
  let lim = null;
  for (let i = 0; i < 31; i++) lim = await call('GET', '/api/leaderboard?k=wins', undefined, undefined, '8.8.1.9');
  ok(lim.status === 429, '同一个 IP 一分钟最多看 30 次');
  const g = await Promise.all(['guest', 'GUEST', '游客'].map((n, i) => call('POST', '/api/register', { username: n, password: 'secret123' }, undefined, '8.8.2.' + i)));
  ok(g.every(r => r.status === 400 && r.error === '这个昵称不能用，换一个吧'), 'guest、游客不能注册（没登录时的进度记在这个名字下）', g.map(r => r.error));
}

section('功能开关：管理后台按功能开关，可以只开 Dev 账号；网页只看得到它该知道的');
{
  FLAGS['test.page'] = ['off', '测试用：网页的开关', true];
  FLAGS['test.srv'] = ['all', '测试用：只有服务器知道的开关', false];
  const pub = (tok, ip = '8.8.3.1') => call('GET', '/api/flags', undefined, tok, ip);
  const a0 = await pub();
  ok(a0.ok && a0.flags['test.page'] === false && !('test.srv' in a0.flags), '没登录：拿到默认值，只看得到网页要知道的', a0.flags);
  const ls = await adm('GET', '/api/admin/flags');
  const tp = (ls.flags || []).find(f => f.k === 'test.page');
  ok(ls.ok && tp && tp.mode === 'off' && tp.def === 'off' && tp.client && (ls.flags || []).some(f => f.k === 'test.srv' && !f.client), '管理后台列出所有开关和默认值', ls.flags);
  ok((await adm('POST', '/api/admin/flags', { k: 'test.page', mode: 'dev' })).status === 400, '不写为什么不让改');
  ok((await adm('POST', '/api/admin/flags', { k: 'nope', mode: 'all', why: '测试' })).status === 400 && (await adm('POST', '/api/admin/flags', { k: 'test.page', mode: 'half', why: '测试' })).status === 400, '没有的开关、乱填的 mode 都不收');
  ok((await adm('POST', '/api/admin/flags', { k: 'test.page', mode: 'all', why: '测试' }, 'wrong-token-000000000', '8.8.3.9')).status === 403, '口令不对：403');
  ok((await pub(undefined, '8.8.3.2')).flags['test.page'] === false, '被拒的请求什么都没改');
  const d = await adm('POST', '/api/admin/flags', { k: 'test.page', mode: 'dev', why: '先给 Dev 试' });
  ok(d.ok && d.mode === 'dev', '改成只开 Dev 账号');
  const dev = await call('POST', '/api/login', { username: 'Dev', password: 'dev-pass-new-9876543210' }, undefined, '8.8.3.3');
  const other = await newUser('flagUser');
  ok(dev.ok && (await pub(dev.token, '8.8.3.4')).flags['test.page'] === true, 'Dev 账号：开了');
  ok((await pub(other.token, '8.8.3.5')).flags['test.page'] === false && (await pub(undefined, '8.8.3.6')).flags['test.page'] === false, '别的玩家、没登录的：还关着');
  await adm('POST', '/api/admin/flags', { k: 'test.page', mode: 'all', why: '全开' });
  ok((await pub(other.token, '8.8.3.7')).flags['test.page'] === true && (await pub(undefined, '8.8.3.8')).flags['test.page'] === true, '改成所有人：马上所有人都开了');
  const au = await adm('GET', '/api/admin/audit');
  const lr = (au.rows || au.list || []).find(r => r.act === 'flag');
  const det = lr ? (typeof lr.detail === 'string' ? JSON.parse(lr.detail) : lr.detail) : null;
  ok(det && det.k === 'test.page' && det.from === 'dev' && det.to === 'all' && det.why === '全开', '操作记录里有谁、为什么、从什么改成什么', lr);
  await adm('POST', '/api/admin/flags', { k: 'test.page', mode: 'off', why: '关回去' });
  ok((await pub(dev.token, '8.8.3.10')).flags['test.page'] === false, '一键关回去：Dev 也关了');
  let lim = null;
  for (let i = 0; i < 61; i++) lim = await pub(undefined, '8.8.3.20');
  ok(lim.status === 429, '同一个 IP 一分钟最多问 60 次');
  delete FLAGS['test.page']; delete FLAGS['test.srv'];
  ENV.DB.raw.prepare("DELETE FROM flags WHERE k LIKE 'test.%'").run();
}

section('登录令牌：数据库里只存哈希；以前存原文的照样能用，用一次就换成哈希，不用重新登录');
{
  const sha = t => 'h1:' + createHash('sha256').update(t).digest('hex');
  const u = await newUser('tokUser');
  ok(!row('SELECT 1 AS x FROM sessions WHERE token = ?', u.token) && row('SELECT user_id FROM sessions WHERE token = ?', sha(u.token))?.user_id === u.uid, '新注册：库里没有令牌原文，只有哈希');
  const li = await call('POST', '/api/login', { username: 'tokUser', password: 'secret123' }, undefined, '8.8.5.1');
  ok(li.ok && !row('SELECT 1 AS x FROM sessions WHERE token = ?', li.token) && row('SELECT 1 AS x FROM sessions WHERE token = ?', sha(li.token)), '登录也一样');
  ok((await call('GET', '/api/profile', undefined, u.token)).ok, '拿令牌原文照样能用');
  const old = 'ab'.repeat(32);
  ENV.DB.raw.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(old, u.uid, T, T + 86400e3);
  const g1 = await call('GET', '/api/profile', undefined, old);
  ok(g1.ok && g1.uid === u.uid, '以前存原文的令牌：还能用（玩家不用重新登录）', g1);
  ok(!row('SELECT 1 AS x FROM sessions WHERE token = ?', old) && row('SELECT expires_at FROM sessions WHERE token = ?', sha(old))?.expires_at === T + 86400e3, '用了一次就换成哈希，到期时间不变');
  ok((await call('GET', '/api/profile', undefined, old)).ok, '换完之后还能用');
  ok((await call('GET', '/api/profile', undefined, sha(old))).status === 401 && (await call('GET', '/api/profile', undefined, sha(old).slice(3))).status === 401, '把库里存的哈希拿来当令牌：不认');
  const lo = await call('POST', '/api/logout', undefined, old);
  ok(lo.ok && !row('SELECT 1 AS x FROM sessions WHERE token = ?', sha(old)) && (await call('GET', '/api/profile', undefined, old)).status === 401, '退出登录：删掉的是哈希那行，令牌不能用了');
  await adm('POST', '/api/admin/flags', { k: 'auth.token_hash', mode: 'off', why: '测试：关掉令牌哈希' });
  const off = await call('POST', '/api/login', { username: 'tokUser', password: 'secret123' }, undefined, '8.8.5.2');
  ok(off.ok && row('SELECT 1 AS x FROM sessions WHERE token = ?', off.token) && (await call('GET', '/api/profile', undefined, off.token)).ok && (await call('GET', '/api/profile', undefined, li.token)).ok, '开关关掉：新令牌存原文，存哈希的老令牌也照样认（关回去不会把人踢下线）');
  ok(row('SELECT 1 AS x FROM sessions WHERE token = ?', off.token), '关着的时候用到原文令牌也不去换');
  await adm('POST', '/api/admin/flags', { k: 'auth.token_hash', mode: 'all', why: '测试完开回去' });
  await call('GET', '/api/profile', undefined, off.token);
  ok(!row('SELECT 1 AS x FROM sessions WHERE token = ?', off.token) && row('SELECT 1 AS x FROM sessions WHERE token = ?', sha(off.token)), '再打开：那个原文令牌下次用到时换成哈希');
}

section('密码用 PBKDF2 存；老号照样能登录，登录成功时换成 PBKDF2；从老表升级不丢号');
{
  const v1 = (pw, salt) => createHash('sha256').update(salt + ':' + pw + ':renying_sword_salt_2026').digest('hex');
  const urow = name => row('SELECT id, password_hash, salt, password_algo, password_updated_at FROM users WHERE username = ?', name);
  ok(PW_ITER >= 20000 && PW_ITER <= 100000, `迭代次数 ${PW_ITER}（免费版 10ms CPU 里算得完，Cloudflare 上限 10 万）`);
  await newUser('pbNew');
  const n = urow('pbNew');
  ok(n.password_algo === 'pbkdf2-sha256:' + PW_ITER && /^[0-9a-f]{64}$/.test(n.password_hash) && /^[0-9a-f]{32}$/.test(n.salt) && n.password_updated_at === T, '新注册：PBKDF2，记着次数和改密码的时间', n);
  ok((await call('POST', '/api/login', { username: 'pbNew', password: 'secret123' }, undefined, '8.8.6.1')).ok, '新号能登录');
  ok((await call('POST', '/api/login', { username: 'pbNew', password: 'secret124' }, undefined, '8.8.6.2')).status === 401, '密码不对：401');
  const salt = 'abcdef123456', id = 'u_pbold000000000a';
  ENV.DB.raw.prepare('INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'pbOld', v1('old-pass-1', salt), salt, JSON.stringify({ name: 'pbOld', ink: 77 }), T, T);
  ok(urow('pbOld').password_algo === 'sha256-v1' && urow('pbOld').password_updated_at === 0, '以前的号：算法记成 sha256-v1');
  ok((await call('POST', '/api/login', { username: 'pbOld', password: 'old-pass-2' }, undefined, '8.8.6.3')).status === 401 && urow('pbOld').password_algo === 'sha256-v1', '老号输错：401，不换');
  const ol = await call('POST', '/api/login', { username: 'pbOld', password: 'old-pass-1' }, undefined, '8.8.6.4');
  const o = urow('pbOld');
  ok(ol.ok && ol.profile && ol.profile.ink === 77, '老号用原来的密码照样能登录，存档还在', ol);
  ok(o.password_algo === 'pbkdf2-sha256:' + PW_ITER && o.password_hash !== v1('old-pass-1', salt) && o.salt !== salt && o.password_updated_at === T, '登录成功时换成了 PBKDF2（换了新盐）', o);
  ok((await call('POST', '/api/login', { username: 'pbOld', password: 'old-pass-1' }, undefined, '8.8.6.5')).ok && (await call('POST', '/api/login', { username: 'pbOld', password: 'old-pass-x' }, undefined, '8.8.6.6')).status === 401, '换完以后：对的能登录，错的不行');
  ok((await call('GET', '/api/profile', undefined, ol.token)).ok, '换密码存法不会让已经登录的设备掉线');
  const ap = await adm('POST', '/api/admin/password', { uid: 'pbNew', password: 'admin-set-pass-123', why: '测试 PBKDF2' });
  ok(ap.ok && urow('pbNew').password_algo === 'pbkdf2-sha256:' + PW_ITER && (await call('POST', '/api/login', { username: 'pbNew', password: 'admin-set-pass-123' }, undefined, '8.8.6.7')).ok, '管理后台重设的密码也是 PBKDF2，能登录');
  await adm('POST', '/api/admin/flags', { k: 'auth.pbkdf2', mode: 'off', why: '测试：关掉 PBKDF2' });
  await newUser('pbOff');
  ok(urow('pbOff').password_algo === 'sha256-v1' && (await call('POST', '/api/login', { username: 'pbOff', password: 'secret123' }, undefined, '8.8.6.8')).ok, '开关关掉：新号用老办法存，能登录');
  ok(urow('pbOff').password_algo === 'sha256-v1', '关着的时候登录也不换');
  ok((await call('POST', '/api/login', { username: 'pbOld', password: 'old-pass-1' }, undefined, '8.8.6.9')).ok && urow('pbOld').password_algo.startsWith('pbkdf2'), '已经是 PBKDF2 的号照样能登录，也不会被换回去');
  await adm('POST', '/api/admin/flags', { k: 'auth.pbkdf2', mode: 'dev', why: '测试：只开 Dev' });
  await call('POST', '/api/login', { username: 'pbOff', password: 'secret123' }, undefined, '8.8.6.10');
  ok(urow('pbOff').password_algo === 'sha256-v1', '只开 Dev 时：别的号登录不换');
  await adm('POST', '/api/admin/flags', { k: 'auth.pbkdf2', mode: 'all', why: '测试完开回去' });
  await call('POST', '/api/login', { username: 'pbOff', password: 'secret123' }, undefined, '8.8.6.11');
  ok(urow('pbOff').password_algo === 'pbkdf2-sha256:' + PW_ITER, '再打开：下次登录就换');

  // 线上的库是以前建的：users 表没有新加的两列。换一个全新的 Worker 实例（模块重新加载）接上这样的老库
  const env2 = { DB: makeD1(), ADMIN_SECRET: ADMIN };
  env2.DB.raw.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, profile_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
  env2.DB.raw.prepare('INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('u_legacy00000000a', 'legacyGuy', v1('legacy-pw-1', salt), salt, JSON.stringify({ name: 'legacyGuy', ink: 5 }), T, T);
  const { default: w2 } = await import(new URL(FILE, ROOT).href + '?oldschema');
  const r2 = await w2.fetch(new Request('https://w.test/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '8.8.6.20' }, body: JSON.stringify({ username: 'legacyGuy', password: 'legacy-pw-1' }) }), env2, { waitUntil() {} }).then(r => r.json());
  const cols = env2.DB.raw.prepare("SELECT name FROM pragma_table_info('users')").all().map(c => c.name);
  ok(cols.includes('password_algo') && cols.includes('password_updated_at'), '老库自动加上两列', cols);
  ok(r2.ok && r2.profile.ink === 5 && env2.DB.raw.prepare('SELECT password_algo FROM users WHERE id = ?').get('u_legacy00000000a').password_algo.startsWith('pbkdf2'), '老库里的号用原来的密码能登录，存档在，密码换成了 PBKDF2', r2);
  const r3 = await w2.fetch(new Request('https://w.test/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '8.8.6.21' }, body: JSON.stringify({ username: 'legacyGuy', password: 'legacy-pw-1' }) }), env2, { waitUntil() {} }).then(r => r.json());
  ok(r3.ok, '再登录一次也没问题');
}

section('跨域：只放行游戏网页和本机开发；管理接口只给自己的管理网页');
{
  const raw = async (method, path, origin, extra = {}, env = ENV) => {
    const headers = { 'CF-Connecting-IP': '8.8.7.' + Math.floor(Math.random() * 250), ...extra };
    if (origin) headers.Origin = origin;
    return worker.fetch(new Request('https://w.test' + path, { method, headers }), env, { waitUntil() {} });
  };
  const acao = r => r.headers.get('Access-Control-Allow-Origin');
  const gh = await raw('GET', '/api/health', 'https://amfi-disable.github.io');
  ok(gh.status === 200 && acao(gh) === 'https://amfi-disable.github.io' && /Origin/.test(gh.headers.get('Vary') || ''), '游戏网页（GitHub Pages）：放行，回的是它自己的网址，带 Vary: Origin');
  const pf = await raw('OPTIONS', '/api/profile', 'https://amfi-disable.github.io', { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' });
  ok(pf.status === 204 && acao(pf) === 'https://amfi-disable.github.io' && /Authorization/.test(pf.headers.get('Access-Control-Allow-Headers') || '') && /POST/.test(pf.headers.get('Access-Control-Allow-Methods') || ''), '预检：放行 POST 和 Authorization');
  const devs = ['http://localhost:8000', 'http://127.0.0.1:5500', 'http://localhost', 'https://localhost:8443', 'http://[::1]:8080'];
  const dr = await Promise.all(devs.map(o => raw('GET', '/api/health', o)));
  ok(dr.every((r, i) => acao(r) === devs[i]), '本机开发的地址（localhost、127.0.0.1，什么端口都行）：放行', dr.map(acao));
  const bads = ['https://evil.example', 'https://amfi-disable.github.io.evil.example', 'http://amfi-disable.github.io', 'https://localhost.evil.example', 'http://127.0.0.1.nip.io', 'null', '*'];
  const br = await Promise.all(bads.map(o => raw('GET', '/api/health', o)));
  ok(br.every(r => r.status === 200 && acao(r) === null && !r.headers.get('Access-Control-Allow-Methods')), '别的网站、长得像的网址、离线版（null）：不带跨域头（浏览器读不到）', br.map(acao));
  const bp = await raw('OPTIONS', '/api/login', 'https://evil.example', { 'Access-Control-Request-Method': 'POST' });
  ok(acao(bp) === null, '别的网站的预检也不放行');
  const no = await raw('GET', '/api/health');
  ok(no.status === 200 && acao(no) === null, '不带 Origin（命令行、curl）：照常处理');
  const ex = await raw('GET', '/api/health', 'https://renying.example.org', {}, { ...ENV, CORS_ORIGINS: 'https://renying.example.org/, https://x.example' });
  ok(acao(ex) === 'https://renying.example.org', 'Worker 变量 CORS_ORIGINS 里写的网址也放行');
  const lb = await raw('GET', '/api/leaderboard?k=wins', 'https://amfi-disable.github.io');
  ok(lb.status === 200 && acao(lb) === 'https://amfi-disable.github.io', '排行榜这样的普通接口也带上');
  const er = await raw('GET', '/api/nope', 'https://amfi-disable.github.io');
  ok(er.status === 404 && acao(er) === 'https://amfi-disable.github.io', '404、报错也带（网页才看得到错误信息）');
  const A = { Authorization: 'Bearer ' + ADMIN };
  const a1 = await raw('GET', '/api/admin/whoami', 'https://amfi-disable.github.io', A);
  ok(a1.status === 403 && acao(a1) === null, '管理接口：游戏网页来的也 403，不带跨域头');
  ok((await raw('GET', '/api/admin/whoami', 'http://localhost:8000', A)).status === 403 && (await raw('POST', '/api/admin/flags', 'https://evil.example', A)).status === 403, '本机开发、别的网站来的：403');
  const a2 = await raw('GET', '/api/admin/whoami', 'https://w.test', A);
  ok(a2.status === 200 && acao(a2) === null, '自己的 /admin 网页（同一个网址）：能用，也不带跨域头');
  const a3 = await raw('GET', '/api/admin/whoami', undefined, A);
  ok(a3.status === 200, '命令行（tools/admin/econ-admin.mjs，不带 Origin）：能用');
  const a4 = await raw('OPTIONS', '/api/admin/flags', 'https://amfi-disable.github.io', { 'Access-Control-Request-Method': 'POST' });
  ok(a4.status === 403 && acao(a4) === null, '管理接口的跨域预检：不放行');
  const pg = await raw('GET', '/admin', 'https://evil.example');
  ok(pg.status === 200 && acao(pg) === null, '管理网页本身不带跨域头');
}

section('短效令牌 + 续期令牌：30 分钟过期，续期令牌用一次就换；偷来的旧续期令牌一用，整台设备退出');
{
  const sha = t => 'h1:' + createHash('sha256').update(t).digest('hex');
  const rf = (body, tok, ip = '8.8.8.' + Math.floor(Math.random() * 250)) => call('POST', '/api/refresh', body, tok, ip);
  await newUser('rtUser');
  const legacy = await call('POST', '/api/login', { username: 'rtUser', password: 'secret123', rt: 1 }, undefined, '8.8.8.1');
  ok(legacy.ok && legacy.token && !legacy.refresh, '开关默认只开 Dev：别的号还是老式的 30 天令牌（老网页、新网页都一样）', legacy);
  const dv = await call('POST', '/api/login', { username: 'Dev', password: 'dev-pass-new-9876543210', rt: 1 }, undefined, '8.8.8.2');
  ok(dv.ok && dv.refresh && dv.expiresIn === 1800 && /^d_[0-9a-f]{16}$/.test(dv.device), 'Dev 号：拿到 30 分钟的令牌和续期令牌', dv);
  await adm('POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'all', why: '测试：所有人开' });
  const old = await call('POST', '/api/login', { username: 'rtUser', password: 'secret123' }, undefined, '8.8.8.3');
  ok(old.ok && old.token && !old.refresh && row('SELECT expires_at - created_at AS t FROM sessions WHERE token = ?', sha(old.token)).t === 30 * 86400e3, '开关全开、老网页（不带 rt）登录：还是老式 30 天令牌，老网页不会 30 分钟就掉线');
  const a = await call('POST', '/api/login', { username: 'rtUser', password: 'secret123', rt: 1 }, undefined, '8.8.8.4');
  ok(a.ok && a.refresh && row('SELECT expires_at - created_at AS t FROM sessions WHERE token = ?', sha(a.token)).t === 1800e3, '新网页登录：令牌 30 分钟过期');
  ok(!row('SELECT 1 AS x FROM devices WHERE refresh = ?', a.refresh) && row('SELECT id FROM devices WHERE refresh = ?', sha(a.refresh)).id === a.device, '续期令牌在库里也只存哈希');
  ok((await call('GET', '/api/profile', undefined, a.token)).ok, '令牌能用');
  T += 31 * 60e3;
  ok((await call('GET', '/api/profile', undefined, a.token)).status === 401, '31 分钟后：令牌过期');
  const b = await rf({ refresh: a.refresh });
  ok(b.ok && b.token && b.refresh && b.refresh !== a.refresh && b.device === a.device, '用续期令牌换到新的一套', b);
  ok((await call('GET', '/api/profile', undefined, b.token)).ok, '新令牌能用');
  const race = await rf({ refresh: a.refresh });
  ok(race.status === 409 && race.race, '刚换完又拿上一个来换（两个标签页同时换）：409，让网页去读新的，不退出', race);
  ok((await call('GET', '/api/profile', undefined, b.token)).ok, '409 之后新令牌照样能用');
  T += 2 * 60e3;
  const c = await rf({ refresh: b.refresh });
  ok(c.ok, '再换一次');
  const r2 = await rf({ refresh: c.refresh });
  ok(r2.ok, '正常用的人一直换下去都没问题');
  T += 2 * 60e3;
  const stolen = await rf({ refresh: a.refresh });
  ok(stolen.status === 401 && stolen.reused, '偷来的旧续期令牌（早就换掉了）被拿来用：401', stolen);
  ok((await call('GET', '/api/profile', undefined, r2.token)).status === 401 && (await rf({ refresh: r2.refresh })).status === 401 && !row('SELECT 1 AS x FROM devices WHERE id = ?', a.device), '整台设备退出：本人手里最新的令牌和续期令牌也不能用了，得重新登录');
  ok((await call('GET', '/api/profile', undefined, old.token)).ok, '别的设备（老式令牌那个）不受影响');
  const e = await call('POST', '/api/login', { username: 'rtUser', password: 'secret123', rt: 1 }, undefined, '8.8.8.5');
  const f = await rf({ refresh: e.refresh });
  const ins = await rf({ refresh: e.refresh, insist: true });
  ok(ins.status === 401 && ins.reused && (await call('GET', '/api/profile', undefined, f.token)).status === 401, '网页说 localStorage 里读到的还是旧的（insist）：不是别的标签页换的，按被偷处理，整组退出');
  const g = await call('POST', '/api/login', { username: 'rtUser', password: 'secret123', rt: 1 }, undefined, '8.8.8.6');
  const [p1, p2] = await Promise.all([rf({ refresh: g.refresh }), rf({ refresh: g.refresh })]);
  ok([p1, p2].filter(x => x.ok).length === 1 && [p1, p2].some(x => x.status === 409), '两个请求同时拿同一个续期令牌来换：一个换到，另一个 409，不会两个都换到', [p1.status, p2.status]);
  const gap = await call('POST', '/api/login', { username: 'rtUser', password: 'secret123', rt: 1 }, undefined, '8.8.8.9');
  ENV.DB.raw.prepare('UPDATE devices SET prev = refresh, refresh = ?, rotated_at = ? WHERE id = ?').run(sha('new-refresh-for-test'), T, gap.device);
  const pendingRace = await rf({ refresh: gap.refresh });
  ok(pendingRace.status === 409 && pendingRace.race, '续期令牌已轮换、旧令牌尚未记账时也返回 409', pendingRace);
  ok((await rf({ refresh: 'f'.repeat(64) })).status === 401 && (await rf({})).status === 401 && (await rf({ refresh: 'x'.repeat(200) })).status === 401, '乱填的、没填的、太长的：401');
  const last = (p1.ok ? p1 : p2).refresh;   // 不拨时间（拨 31 天会顺手清掉后面要用的老令牌）：把到期时间改到现在之前
  ENV.DB.raw.prepare('UPDATE devices SET expires_at = ? WHERE refresh = ?').run(T - 1, sha(last));
  ok((await rf({ refresh: last })).status === 401, '30 天没用：续期令牌过期');
  const up = await rf({}, old.token);
  ok(up.ok && up.refresh && up.token !== old.token, '老式 30 天令牌能换成新的一套（老玩家不用重新登录）', up);
  ok((await call('GET', '/api/profile', undefined, old.token)).status === 401 && (await call('GET', '/api/profile', undefined, up.token)).ok, '换完老令牌就作废了，新令牌能用');
  ok((await rf({}, up.token)).status === 401, '新式令牌不能再走这条路（只能用续期令牌换）');
  const lo = await call('POST', '/api/logout', undefined, up.token);
  ok(lo.ok && (await rf({ refresh: up.refresh })).status === 401 && !row('SELECT 1 AS x FROM devices WHERE id = ?', up.device), '退出登录：这台设备的续期令牌一起作废');
  const h = await call('POST', '/api/login', { username: 'rtUser', password: 'secret123', rt: 1 }, undefined, '8.8.8.7');
  await adm('POST', '/api/admin/password', { uid: 'rtUser', password: 'new-pass-12345678', why: '测试：重设密码退出所有设备' });
  ok((await rf({ refresh: h.refresh })).status === 401 && (await call('GET', '/api/profile', undefined, h.token)).status === 401, '管理员重设密码：所有设备的续期令牌也作废');
  await adm('POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'off', why: '测试：关掉' });
  const k = await call('POST', '/api/login', { username: 'rtUser', password: 'new-pass-12345678', rt: 1 }, undefined, '8.8.8.8');
  ok(k.ok && !k.refresh && (await call('GET', '/api/profile', undefined, k.token)).ok, '开关关掉：新网页也拿到老式令牌，照样能用');
  await adm('POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'dev', why: '测试完回到默认' });
}

section('登录的设备：列出来、退出一台、退出全部；最近在用的时间');
{
  await adm('POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'all', why: '测试：设备列表' });
  await newUser('devUser');
  const UA = { mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', ph: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
  const loginUA = async (ua, ip) => {
    const res = await worker.fetch(new Request('https://w.test/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, 'User-Agent': ua }, body: JSON.stringify({ username: 'devUser', password: 'secret123', rt: 1 }) }), ENV, { waitUntil() {} });
    return res.json();
  };
  const A = await loginUA(UA.mac, '8.8.9.1'), B = await loginUA(UA.ph, '8.8.9.2'), Cw = await loginUA(UA.win, '8.8.9.3');
  const old = await call('POST', '/api/login', { username: 'devUser', password: 'secret123' }, undefined, '8.8.9.4');   // 老网页：老式令牌
  const l = await call('GET', '/api/devices', undefined, A.token);
  const labels = (l.devices || []).map(d => d.label).sort();
  ok(l.ok && l.devices.length === 3 && labels.join('|') === ['Mac · Safari', 'iPhone · Safari', 'Windows · Chrome'].sort().join('|'), '三台设备，名字只有系统和浏览器', labels);
  ok(l.current === A.device && l.devices.find(d => d.current).id === A.device && l.legacy === 2, '标出这台设备；老式登录（注册那次和老网页登录那次）合成一条，记着几处', l);
  ok(!JSON.stringify(l).includes('refresh') && !JSON.stringify(l).includes('h1:'), '列表里没有令牌');
  const seen0 = row('SELECT last_seen FROM devices WHERE id = ?', B.device).last_seen;
  T += 6 * 60e3;
  await call('GET', '/api/profile', undefined, B.token);
  const seen1 = row('SELECT last_seen FROM devices WHERE id = ?', B.device).last_seen;
  await call('GET', '/api/profile', undefined, B.token); T += 60e3; await call('GET', '/api/profile', undefined, B.token);
  ok(seen1 === T - 60e3 && seen1 > seen0 && row('SELECT last_seen FROM devices WHERE id = ?', B.device).last_seen === seen1, '用了就记最近在用的时间（5 分钟最多记一次）');
  const lo = await call('POST', '/api/devices', { id: B.device }, A.token);
  ok(lo.ok && !lo.current, 'A 在设备列表里退出 B');
  ok((await call('GET', '/api/profile', undefined, B.token)).status === 401 && (await call('POST', '/api/refresh', { refresh: B.refresh }, undefined, '8.8.9.5')).status === 401, 'B 的令牌和续期令牌马上都不能用了');
  ok((await call('GET', '/api/profile', undefined, A.token)).ok && (await call('GET', '/api/profile', undefined, Cw.token)).ok, 'A、C 不受影响');
  const other = await newUser('devOther');
  ok((await call('POST', '/api/devices', { id: Cw.device }, other.token)).status === 404 && (await call('GET', '/api/profile', undefined, Cw.token)).ok, '别人的设备退不了');
  ok((await call('POST', '/api/devices', { id: 'legacy' }, A.token)).ok && (await call('GET', '/api/profile', undefined, old.token)).status === 401, '退出以前的老式登录');
  ok((await call('GET', '/api/devices', undefined, B.token)).status === 401, '没登录看不了');
  const all = await call('POST', '/api/devices', { all: true }, Cw.token);
  ok(all.ok && (await call('GET', '/api/profile', undefined, A.token)).status === 401 && (await call('GET', '/api/profile', undefined, Cw.token)).status === 401 && !row("SELECT 1 AS x FROM devices d JOIN users u ON u.id = d.user_id WHERE u.username = 'devUser'"), '所有设备都退出：连自己这台一起');
  ok((await call('GET', '/api/profile', undefined, other.token)).ok, '别的账号不受影响');
  await adm('POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'dev', why: '测试完回到默认' });
}

section('登录记录：注册、登录、失败、退出、改密码都记；IP 只存打乱后的；管理后台按账号查');
{
  await adm('POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'all', why: '测试：登录记录' });
  const u = await call('POST', '/api/register', { username: 'logUser', password: 'secret123', rt: 1 }, undefined, '77.7.7.1');
  await call('POST', '/api/login', { username: 'logUser', password: 'wrong-pass' }, undefined, '77.7.7.2');
  await call('POST', '/api/login', { username: 'logUserX', password: 'whatever1' }, undefined, '77.7.7.2');
  const li = await call('POST', '/api/login', { username: 'LOGUSER', password: 'secret123', rt: 1 }, undefined, '77.7.7.3');
  await call('POST', '/api/devices', { id: u.device }, li.token, '77.7.7.3');
  await call('POST', '/api/logout', undefined, li.token, '77.7.7.3');
  await adm('POST', '/api/admin/password', { uid: 'logUser', password: 'admin-set-pass-123', why: '测试登录记录' });
  const r = await adm('GET', '/api/admin/authlog?q=logUser');
  const acts = (r.rows || []).map(x => x.act).reverse();
  ok(r.ok && r.uid === u.uid && JSON.stringify(acts) === JSON.stringify(['register', 'login_fail', 'login', 'device_out', 'logout', 'pw_admin']), '按账号查：注册、输错密码、登录、退出别的设备、退出、管理员重设密码，按顺序都在', acts);
  const fail = r.rows.find(x => x.act === 'login_fail');
  ok(fail.note === 'pw' && fail.uid === u.uid && r.rows.find(x => x.act === 'login').dev === li.device && r.rows.find(x => x.act === 'device_out').note === u.device, '记着为什么失败、哪台设备、退出的是哪台');
  ok(r.rows.every(x => /^[0-9a-f]{16}$/.test(x.ip)) && !JSON.stringify(r).includes('77.7.7'), 'IP 只存 16 位打乱后的，原来的 IP 查不到');
  ok(r.rows.find(x => x.act === 'register').ip !== fail.ip && r.rows.find(x => x.act === 'login').ip === r.rows.find(x => x.act === 'logout').ip, '同一个 IP 打乱后一样，不同 IP 不一样');
  const nx = await adm('GET', '/api/admin/authlog?q=logUserX');
  ok(nx.rows.length === 1 && nx.rows[0].note === 'noacct' && !nx.rows[0].uid, '没有这个号的也记着输的昵称');
  const f = await adm('GET', '/api/admin/authlog?q=logUser&act=login_fail');
  ok(f.rows.length === 1 && f.rows[0].act === 'login_fail', '可以只看某一种');
  const all = await adm('GET', '/api/admin/authlog');
  ok(all.ok && all.rows.length > 6 && all.rows.length <= 200, '不填账号：所有人最近的');
  ok((await call('GET', '/api/admin/authlog', undefined, u.token)).status === 403, '玩家的令牌看不了');
  ENV.LOG_SALT = 'another-salt-for-test';
  await call('POST', '/api/login', { username: 'logUser', password: 'admin-set-pass-123' }, undefined, '77.7.7.3');
  delete ENV.LOG_SALT;
  const r2 = await adm('GET', '/api/admin/authlog?q=logUser&act=login');
  ok(r2.rows[0].ip !== r2.rows[1].ip, '设了 LOG_SALT 打乱的结果就不一样（别人拿着代码也算不出来）');
  T += 91 * 86400e3;
  const rnd = Math.random; Math.random = () => 0;   // 清理是每个请求 2% 的机会顺手做：这次让它一定做
  await call('GET', '/api/flags', undefined, undefined, '77.7.8.1');
  Math.random = rnd;
  await new Promise(r => setTimeout(r, 100));
  ok(row('SELECT COUNT(*) AS n FROM auth_log WHERE at < ?', T - 90 * 86400e3).n === 0, '90 天前的会被清理掉');
  T -= 91 * 86400e3;
  await adm('POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'dev', why: '测试完回到默认' });
}

section('人机验证（Turnstile）：没配置时完全跳过；配置了以后注册要过，登录输错 3 次后要过');
{
  const reg = (name, extra = {}, ip = '66.6.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250)) => call('POST', '/api/register', { username: name, password: 'secret123', ...extra }, undefined, ip);
  ok((await reg('tsNone')).ok && (await call('GET', '/api/flags', undefined, undefined, '66.7.0.1')).turnstile === '', '没设 TURNSTILE_SITEKEY / SECRET：注册照常，网页拿不到 site key');
  const realFetch = globalThis.fetch, seen = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('https://challenges.cloudflare.com/')) {
      const f = new URLSearchParams(String(opts.body)); seen.push(Object.fromEntries(f));
      if (f.get('response') === 'down') throw new TypeError('network');
      return new Response(JSON.stringify({ success: f.get('secret') === 'ts-secret' && f.get('response') === 'good-token' }));
    }
    return realFetch(url, opts);
  };
  ENV.TURNSTILE_SITEKEY = 'ts-site-key'; ENV.TURNSTILE_SECRET = 'ts-secret';
  try {
    ok((await call('GET', '/api/flags', undefined, undefined, '66.7.0.2')).turnstile === 'ts-site-key', '配置好了：网页拿得到 site key（secret 不给）');
    const regRate = () => row("SELECT COALESCE(SUM(n), 0) AS n FROM rate WHERE k = 'reg:66.7.1.1'").n;
    const n0 = await reg('tsUser', {}, '66.7.1.1');
    ok(n0.status === 400 && n0.need === 'turnstile' && !row("SELECT 1 AS x FROM users WHERE username = 'tsUser'"), '注册没带验证结果：400、need turnstile，号没建');
    ok(regRate() === 0, '这次不算进每小时注册次数');
    const n1 = await reg('tsUser', { turnstile: 'bad-token' }, '66.7.1.1');
    ok(n1.status === 400 && n1.need === 'turnstile' && /没通过/.test(n1.error), '验证结果不对：不建号');
    const n2 = await reg('tsUser', { turnstile: 'down' }, '66.7.1.1');
    ok(n2.status === 400 && n2.need === 'turnstile', '验证服务器连不上：当没通过');
    const n3 = await reg('tsUser', { turnstile: 'good-token' }, '66.7.1.1');
    ok(n3.ok, '过了：建号成功');
    ok(seen.at(-1).secret === 'ts-secret' && seen.at(-1).remoteip === '66.7.1.1', '验证时带上 secret 和玩家的 IP');
    const li = (pw, extra = {}) => call('POST', '/api/login', { username: 'tsUser', password: pw, ...extra }, undefined, '66.7.2.' + Math.floor(Math.random() * 250));
    ok((await li('secret123')).ok, '没输错过：登录不用验证');
    for (let i = 0; i < 3; i++) await li('wrong-' + i);
    const l1 = await li('secret123');
    ok(l1.status === 400 && l1.need === 'turnstile', '同一个昵称输错 3 次后：密码对也要先过验证');
    ok((await li('secret123', { turnstile: 'bad-token' })).need === 'turnstile', '验证不对：还是不让登');
    ok((await li('secret123', { turnstile: 'good-token' })).ok, '过了验证、密码对：登录成功');
    ok((await li('secret123')).ok, '登录成功以后错误次数清零，下次不用再验证');
    await adm('POST', '/api/admin/flags', { k: 'auth.turnstile', mode: 'off', why: '测试：关掉人机验证' });
    ok((await reg('tsOff')).ok && (await call('GET', '/api/flags', undefined, undefined, '66.7.0.3')).turnstile === '', '开关关掉：配置了也跳过');
    await adm('POST', '/api/admin/flags', { k: 'auth.turnstile', mode: 'all', why: '测试完开回去' });
  } finally {
    globalThis.fetch = realFetch; delete ENV.TURNSTILE_SITEKEY; delete ENV.TURNSTILE_SECRET;
  }
}
