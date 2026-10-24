// 武库经济 + 反作弊的服务器测试：在本机把 cloudflare/worker.js 跑起来（D1 用 node:sqlite 模拟），
// 正常流程走一遍，再按作弊的路数打一遍：改墨锭、伪造皮肤、重放请求、并发双花、乱填参数、刷每周武器箱、刷终端机、
// 乱报斩数、刷对局奖励、爆破密码……
// 用法：node tools/econ-test.mjs           （Node 22 以上，不用装任何包）
//       node tools/econ-test.mjs --bundle  测打包好的 cloudflare/worker.bundle.js（真正部署上去的那个文件）
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
let T = Date.UTC(2026, 9, 23, 4, 0, 0);   // 测试里的“现在”，可以随意往后拨
const realNow = Date.now;
Date.now = () => T;

const FILE = process.argv.includes('--bundle') ? 'cloudflare/worker.bundle.js' : 'cloudflare/worker.js';
const { default: worker } = await import(new URL(FILE, ROOT));
const C = globalThis.ArmoryCore;

/* ---------- 用 node:sqlite 模拟 D1（接口和 Cloudflare 的一样：prepare/bind/first/all/run/batch） ---------- */
function makeD1() {
  const db = new DatabaseSync(':memory:');
  const jitter = () => new Promise(r => setTimeout(r, Math.random() * 3));   // 每次读写前停一下，好让并发请求交错
  const exec1 = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params).map(r => ({ ...r })), success: true, meta: { changes: 0 } };
    const info = st.run(...params);
    return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  };
  class Stmt {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...p) { return new Stmt(this.sql, p.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)); }
    async first(col) { await jitter(); const r = exec1(this.sql, this.params).results[0]; return r ? (col ? r[col] : r) : null; }
    async all() { await jitter(); return exec1(this.sql, this.params); }
    async run() { await jitter(); return exec1(this.sql, this.params); }
  }
  return {
    raw: db,
    prepare: sql => new Stmt(sql),
    async batch(list) {
      await jitter();
      db.exec('BEGIN');
      try { const out = list.map(s => exec1(s.sql, s.params)); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const ADMIN = 'admin-pass-123';
const ENV = { DB: makeD1(), ADMIN_SECRET: ADMIN };
async function call(method, path, body, token, ip = '1.2.3.4') {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (token) headers.Authorization = 'Bearer ' + token;
  const req = new Request('https://w.test' + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const res = await worker.fetch(req, ENV, { waitUntil() {} });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ...j };
}
const rnd36 = () => Math.random() * 36 ** 8;
const nonce = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const econ = (tok, act, args = {}, n = nonce()) => call('POST', '/api/econ', { act, args, nonce: n }, tok);
const row = (sql, ...p) => ENV.DB.raw.prepare(sql).get(...p);

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra).slice(0, 300) : '')); }
}
function section(t) { console.log('\n' + t); }

async function newUser(name, profile) {
  const r = await call('POST', '/api/register', { username: name, password: 'secret123', profile }, undefined, '9.9.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250));
  if (!r.ok) throw new Error('register failed ' + JSON.stringify(r));
  return r;
}
const inkOf = uid => row('SELECT ink FROM econ WHERE uid = ?', uid).ink;
const stateOf = uid => JSON.parse(row('SELECT state_json FROM econ WHERE uid = ?', uid).state_json);
const profOf = uid => JSON.parse(row('SELECT profile_json FROM users WHERE id = ?', uid).profile_json);
const itemOf = (uid, i) => stateOf(uid).inv.find(x => x.i === i);
const nextNoon = () => (C.day(T) + 1) * 86400e3 - 8 * 3600e3 + 12 * 3600e3;   // 下一天北京时间中午（时间只往后拨）
// 今天市场上的一件斩数版（按侠客挑）
const stListing = (day, not = []) => { for (const k of C.ofTier('mil')) for (const x of C.listings(k, day)) if (x.st >= 0 && !not.includes(C.charOf(k))) return x; return null; };

/* ===================================================================== */
section('皮肤都在箱子里：游戏里原有的皮肤和武库的新皮肤，每款正好在一个武器箱里');
{
  const src = readFileSync(new URL('src/game.js', ROOT), 'utf8');
  const a = src.indexOf('const SKINS = {'), b = src.indexOf('\n};', a);
  const orig = [...src.slice(a, b).matchAll(/^ {2}([a-z]{2}_[a-z0-9]+): \{ char: '([a-z]+)'/gm)].map(m => [m[1], m[2]]);
  const inCases = C.CASES.flatMap(c => C.TIERS.flatMap(t => C.COLS[c][t] || []));
  ok(orig.length >= 35 && orig.every(([k]) => C.isItem(k)), `游戏里原有的 ${orig.length} 款皮肤都在箱子里`, orig.filter(([k]) => !C.isItem(k)));
  ok(C.CS_KEYS.every(k => C.isItem(k)), `武库的 ${C.CS_KEYS.length} 款新皮肤也都在`);
  ok(inCases.length === new Set(inCases).size && inCases.length === orig.length + C.CS_KEYS.length, `一共 ${inCases.length} 款，没有重复的`, inCases.length);
  ok(orig.every(([k, ch]) => C.charOf(k) === ch), '每款的侠客对得上');
  ok(C.CASES.length === 6 && C.CASES.every(c => C.TIERS.every(t => (C.COLS[c][t] || []).length)), '六个武器箱，每个箱子五档品质都有东西');
  ok(C.isItem('qf_qfx') && !C.CS_KEYS.includes('qf_qfx'), '青锋行那款也在箱子里，青锋行通关拿到的照样认');
}

section('注册：带上来的存档不能凭空造墨锭和武库皮肤');
{
  const r = await newUser('forger', { ink: 999999, skins: ['gc_wolf', 'qf_frost', 'qf_p1'], equip: { gouchen: 'gc_wolf' }, armory: { term: 99, cases: { c1: 99 } } });
  ok(r.profile.ink === 5000, '注册时墨锭最多认 5000', r.profile.ink);
  ok(!r.profile.skins.includes('gc_wolf') && !r.profile.skins.includes('qf_p1'), '武库专属皮肤被拿掉', r.profile.skins);
  ok(r.profile.skins.includes('qf_frost'), '以前得到的原有皮肤保留');
  ok(!r.profile.equip.gouchen, '穿着的假皮肤被脱掉', r.profile.equip);
  ok(r.profile.armory === undefined, '存档里带的武库数据不认');
  ok(r.ledger && r.ledger.ink === 5000 && r.ledger.ver === 0, '返回账本', r.ledger);
}

section('正常流程：新手礼、开箱（不用钥匙）、穿上、卖出');
const A = await newUser('alice');
{
  const g = await econ(A.token, 'gift');
  ok(g.ok && g.res.ok && g.state.cases.c1 === 1 && g.state.term === 1, '领新手礼：初刃武器箱 1 个、终端机 1 台', g);
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
  const q = await econ(A.token, 'quick', { i: it.i });
  ok(q.res.ok && inkOf(A.uid) === ink0 + q.res.gain && q.res.gain === C.quick(C.price(it, C.day(T))) && q.res.gain === Math.floor(C.price(it, C.day(T)) * 0.88 * 0.85), '直接卖出按市场价的 88% 收、再扣 15% 手续费', q.res);
  ok(!profOf(A.uid).skins.includes(it.k) && !profOf(A.uid).equip[C.charOf(it.k)], '卖掉后皮肤收回、换回默认');
  ok(q.ledger.ink === inkOf(A.uid), '返回的账本和服务器一致');
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
  ok(C.TIERS.every(t => Math.abs(cnt[t] / N - C.ODDS[t]) < Math.max(0.002, C.ODDS[t] * 0.15)), '五档品质的比例和公布的一样', Object.fromEntries(C.TIERS.map(t => [t, +(cnt[t] / N).toFixed(4)])));
  ok(Math.abs(st / N - C.ST_P) < 0.005, `斩数版占 ${(st / N * 100).toFixed(1)}%（公布的是 ${C.ST_P * 100}%）`);
  ok(Math.abs(Object.values(C.ODDS).reduce((a, b) => a + b, 0) - 1) < 1e-9 && Math.abs(Object.values(C.TERM.odds).reduce((a, b) => a + b, 0) - 1) < 1e-9, '开箱和终端机的概率加起来都是 100%');
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

section('并发双花：同一件饰品同时卖 12 次、同一个箱子同时开 12 次');
{
  const u = await newUser('racer');
  await econ(u.token, 'gift');
  const o = await econ(u.token, 'open', { c: 'c1' });
  const ink0 = inkOf(u.uid);
  const rs = await Promise.all(Array.from({ length: 12 }, () => econ(u.token, 'quick', { i: o.res.item.i })));
  const wins = rs.filter(r => r.res && r.res.ok);
  ok(wins.length === 1, `12 个并发卖出只成交 1 个（成交 ${wins.length}）`, rs.map(r => r.res ? r.res.err || 'ok' : r.error));
  ok(inkOf(u.uid) === ink0 + wins[0].res.gain, '墨锭只加了一次', [inkOf(u.uid), ink0]);
  const v = await newUser('racer2');
  await econ(v.token, 'gift');
  const rs2 = await Promise.all(Array.from({ length: 12 }, () => econ(v.token, 'open', { c: 'c1' })));
  ok(rs2.filter(r => r.res && r.res.ok).length === 1 && stateOf(v.uid).inv.length === 1, '并发开箱只开出 1 件');
  const w = await newUser('racer3', { ink: 5000 });
  const day = C.day(T), k = 'qf_p1', L = C.listings(k, day)[0];
  const rs3 = await Promise.all(Array.from({ length: 10 }, () => econ(w.token, 'buy', { l: L.l })));
  ok(rs3.filter(r => r.res && r.res.ok).length === 1 && inkOf(w.uid) === 5000 - L.price, '同一件挂单并发买只买到 1 次、只扣 1 次钱', [inkOf(w.uid), L.price]);
}

section('武器箱：用墨锭买，每周最多 5 个；并发、乱填数量也买不到第 6 个');
{
  const u = await newUser('weekly', { ink: 5000 });
  const g = await econ(u.token, 'gift');
  ok(C.caseLeft(g.state) === C.CASE_WEEK, '新手礼送的箱子不占本周的次数');
  const p = C.casePrice('c3', C.day(T));
  const b1 = await econ(u.token, 'buyCase', { c: 'c3', n: 3 });
  ok(b1.res.ok && b1.res.price === 3 * p && b1.state.cases.c3 === 3 && C.caseLeft(b1.state) === 2 && inkOf(u.uid) === 5000 - 3 * p, '一次买 3 个，按当天价扣钱', b1.res);
  const b2 = await econ(u.token, 'buyCase', { c: 'c4', n: 3 });
  ok(b2.res.err === '这周还能买 2 个' && stateOf(u.uid).cases.c4 === 0, '只剩 2 次时买 3 个被拒绝', b2.res);
  ok((await econ(u.token, 'buyCase', { c: 'c4', n: 2 })).res.ok, '剩下 2 次买 2 个可以');
  const b3 = await econ(u.token, 'buyCase', { c: 'c5' });
  ok(b3.res.err && stateOf(u.uid).cw.n === 5 && b3.res.err.includes('下周一'), '这周买满 5 个就买不了了', b3.res);
  const sold = await econ(u.token, 'sellCase', { c: 'c3', n: 1 });
  ok(sold.res.ok && C.caseLeft(stateOf(u.uid)) === 0 && (await econ(u.token, 'buyCase', { c: 'c3' })).res.err, '卖掉一个也不会多出购买次数');
  const D = C.day(T), mon = D + 7 - ((D + 3) % 7);   // 下一个周一（C.week 在周一换）
  T = mon * 86400e3 - 8 * 3600e3 + 3600e3;           // 北京时间周一凌晨 1 点
  const s = await econ(u.token, 'sync');
  ok(C.caseLeft(s.state) === C.CASE_WEEK && (await econ(u.token, 'buyCase', { c: 'c6' })).res.ok, '到了下周一次数恢复');

  const v = await newUser('weekly2', { ink: 5000 });
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => econ(v.token, 'buyCase', { c: C.CASES[i % 6], n: 1 })));
  const won = rs.filter(r => r.res && r.res.ok), cost = won.reduce((a, r) => a + r.res.price, 0), sv = stateOf(v.uid);
  ok(won.length === 5 && sv.cw.n === 5 && Object.values(sv.cases).reduce((a, n) => a + n, 0) === 5 && inkOf(v.uid) === 5000 - cost, `12 个并发买箱：正好买到 5 个（${won.length}），钱也只扣这 5 个的`, [sv.cw, inkOf(v.uid), cost]);
  const w = await newUser('weekly3', { ink: 5000 });
  for (const n of [-5, 0, 6, 1e9, 2.5e9, 'abc', null, '3; DROP TABLE econ']) {
    const r = await econ(w.token, 'buyCase', { c: 'c1', n });
    const fine = Number.isInteger(+n) && +n >= 1 && +n <= 5;
    ok(fine ? r.res.ok : r.res.err && inkOf(w.uid) === 5000, `买 ${JSON.stringify(n)} 个：${fine ? '照买' : '拒绝，不扣钱'}`, r.res);
  }
  const poor = await newUser('weekly4', { ink: 100 });
  ok((await econ(poor.token, 'buyCase', { c: 'c1' })).res.err && stateOf(poor.uid).cw.n === 0, '墨锭不够买不了，也不占次数');
}

section('终端机：一次报一件，最多 5 件，买下就用掉；重发、并发都不会跳过或多买');
{
  T = nextNoon();
  const u = await newUser('terminal', { ink: 5000 });
  ok((await econ(u.token, 'unseal')).res.err, '没有终端机开不了');
  await econ(u.token, 'gift');
  ok((await econ(u.token, 'termNext', { n: 1 })).res.err, '没开封不能换');
  const s1 = await econ(u.token, 'unseal');
  const tm = s1.state.tm, mk = C.price(tm.o, C.day(T));
  ok(s1.res.ok && tm && tm.n === 1 && s1.state.term === 0, '开封：给出第 1 件，终端机少一台', s1.state.tm);
  ok(C.isItem(tm.o.k) && tm.o.price >= mk && tm.o.price <= Math.round(mk * C.TERM.markup[1]), '报价在当天市场价的 1~1.3 倍之间', [tm.o, mk]);
  ok((await econ(u.token, 'unseal')).res.err, '开着一台时不能再开封');
  const wrong = await econ(u.token, 'termNext', { n: 3 });
  ok(wrong.res.err && stateOf(u.uid).tm.n === 1, '编号对不上（看到的不是这一件）就不换', wrong.res);
  const n = nonce();
  const a = await econ(u.token, 'termNext', { n: 1 }, n);
  const b = await econ(u.token, 'termNext', { n: 1 }, n);
  ok(a.res.ok && b.replay && stateOf(u.uid).tm.n === 2, '同一个请求重发：只换一次', stateOf(u.uid).tm);
  const race = await Promise.all(Array.from({ length: 8 }, () => econ(u.token, 'termNext', { n: 2 })));
  ok(race.filter(r => r.res && r.res.ok).length === 1 && stateOf(u.uid).tm.n === 3, '8 个并发“换下一件”只换了一次', race.map(r => r.res && (r.res.err || 'ok')));
  const o = stateOf(u.uid).tm.o, ink0 = inkOf(u.uid);
  const buys = await Promise.all(Array.from({ length: 6 }, () => econ(u.token, 'termBuy', { n: 3 })));
  const won = buys.filter(r => r.res && r.res.ok), s = stateOf(u.uid);
  ok(won.length === 1 && inkOf(u.uid) === ink0 - o.price && s.inv.filter(x => x.src === 'term').length === 1 && !s.tm, '6 个并发买下：只买到 1 件、只扣 1 次钱，终端机用掉了', [won.length, inkOf(u.uid) - ink0, o.price]);
  const got = won[0] && won[0].res.item;
  ok(got && got.k === o.k && got.st === o.st && s.hist[0].kind === 'term' && s.hist[0].price === o.price, '买到的就是报的那一件（斩数版也一样），记进成交记录', [got, o]);
  ok(got && profOf(u.uid).skins.includes(got.k), '买到的皮肤能穿');

  const v = await newUser('terminal2', { ink: 0 });
  await econ(v.token, 'gift');
  await econ(v.token, 'unseal');
  const poor = await econ(v.token, 'termBuy', { n: 1 });
  ok(poor.res.err && stateOf(v.uid).tm && stateOf(v.uid).inv.length === 0, '墨锭不够买不了，终端机还开着', poor.res);
  for (let i = 1; i < C.TERM.offers; i++) await econ(v.token, 'termNext', { n: i });
  ok(stateOf(v.uid).tm.n === C.TERM.offers, `换到第 ${C.TERM.offers} 件`);
  const last = await econ(v.token, 'termNext', { n: C.TERM.offers });
  ok(last.res.ok && last.res.gone && !stateOf(v.uid).tm && stateOf(v.uid).term === 0, `第 ${C.TERM.offers} 件也不要：终端机就没了`, last.res);
  ok((await econ(v.token, 'termBuy', { n: C.TERM.offers })).res.err, '没了就买不了');
  for (const x of ['abc', -1, null, 1e9, { n: 1 }]) ok((await econ(v.token, 'termNext', { n: x })).res.err, `乱填编号 ${JSON.stringify(x)}：不出错，什么也不做`);

  const w = await newUser('terminal3', { ink: 5000 });
  await econ(w.token, 'gift'); await econ(w.token, 'unseal');
  T += C.TERM.days * 86400e3 + 60000;
  const late = await econ(w.token, 'termBuy', { n: 1 });
  ok(late.res.err && !stateOf(w.uid).tm && inkOf(w.uid) === 5000, `开封 ${C.TERM.days} 天不处理就作废`, late.res);

  const R = C.rng(777), D0 = C.day(T), N = 60000, cnt = Object.fromEntries(C.TIERS.map(t => [t, 0]));
  let st = 0, lo = 9, hi = 0, out = 0;
  for (let i = 0; i < N; i++) {
    const x = C.termOffer(R, D0 + (i % 60)), mk = C.price(x, D0 + (i % 60)), r = x.price / mk;
    cnt[C.ITEM[x.k].tier]++; if (x.st >= 0) st++; lo = Math.min(lo, r); hi = Math.max(hi, r);
    if (x.price < mk || x.price > Math.round(mk * C.TERM.markup[1])) out++;
  }
  ok(C.TIERS.every(t => Math.abs(cnt[t] / N - C.TERM.odds[t]) < 0.01), '报价的品质比例和页面上写的一样', Object.fromEntries(C.TIERS.map(t => [t, +(cnt[t] / N).toFixed(3)])));
  ok(Math.abs(st / N - C.ST_P) < 0.01, `报价里斩数版占 ${(st / N * 100).toFixed(1)}%`);
  ok(lo >= 1 && !out, `报价都在市场价的 1~${C.TERM.markup[1]} 倍（四舍五入到整数，实际 ${lo.toFixed(3)}~${hi.toFixed(3)}）`, [lo, hi, out]);
}

section('斩数：穿着斩数版的侠客每击倒一个对手 +1；没穿、没票、乱报都不算');
const MCTX = { mode: 'cpu', level: 'hard', char: 'qingfeng', win: true, rounds: 2, flawless: false, combo: 5, ults: 1 };
{
  T = nextNoon();
  const u = await newUser('stattrak', { ink: 5000 });
  const day = C.day(T), L1 = stListing(day), L2 = stListing(day, [C.charOf(L1.k)]);
  const b1 = await econ(u.token, 'buy', { l: L1.l }), b2 = await econ(u.token, 'buy', { l: L2.l });
  ok(b1.res.ok && b1.res.item.st === L1.st && b2.res.ok, '从市场买到两件斩数版（两位侠客）', [b1.res, b2.res]);
  const it = b1.res.item, h = C.charOf(it.k), it2 = b2.res.item, h2 = C.charOf(it2.k);
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
  const plain = (await econ(u.token, 'buy', { l: C.listings(it.k, day).find(x => x.st < 0).l })).res.item;
  await econ(u.token, 'equip', { i: plain.i });
  await play({ [h]: 4 });
  ok(itemOf(u.uid, plain.i).st === -1 && itemOf(u.uid, it.i).st === st3, '穿的是普通版：不记，也不会记到没穿的那件上');
  ok((await econ(u.token, 'quick', { i: it.i })).res.gain === C.quick(C.price({ k: it.k, st: 0 }, C.day(T))), '斩数多少不影响价格，斩数版统一按斩数版的价');
}

section('乱填参数：负数、超大数、不存在的东西、混档汰换');
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
    const r = await econ(u.token, 'sellCase', { c: 'c1', n });
    ok(r.res.err && inkOf(u.uid) === ink0, `卖出 ${n} 个不存在的箱子被拒绝`);
  }
  for (const c of ['c7', '__proto__', 'constructor', null]) ok((await econ(u.token, 'buyCase', { c })).res.err && inkOf(u.uid) === ink0, `买不存在的武器箱 ${c} 被拒绝`);
  const fakeL = await econ(u.token, 'buy', { l: `${C.day(T) - 1}.qf_p1.0` });
  ok(fakeL.res.err && inkOf(u.uid) === ink0, '昨天的挂单买不了');
  const fakeL2 = await econ(u.token, 'buy', { l: `${C.day(T)}.gc_wolf.99` });
  ok(fakeL2.res.err, '编出来的挂单买不了');
  const fakeL3 = await econ(u.token, 'buy', { l: `${C.day(T)}.__proto__.0` });
  ok(fakeL3.res.err, '原型链挂单买不了');
  const t1 = await econ(u.token, 'trade', { ids: [it.i, it.i, it.i, it.i, it.i, it.i, it.i, it.i, it.i, it.i] });
  ok(t1.res.err && stateOf(u.uid).inv.length === 1, '同一件放 10 次的汰换合同被拒绝', t1.res);
  const t2 = await econ(u.token, 'trade', { ids: [it.i, 9999, 9998, 9997, 9996, 9995, 9994, 9993, 9992, 9991] });
  ok(t2.res.err, '拿别人的 / 不存在的饰品汰换被拒绝');
  const t3 = await econ(u.token, 'trade', { ids: 'all' });
  ok(t3.res.err, '汰换材料不是数组被拒绝');
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

section('只有墨锭：没有充值、兑换码、玉珏和钥匙');
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
  ok(h.econ === C.VER && C.VER === 2, '服务器报的规则版本是 2（网页据此判断服务器是不是新版）', h);
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
  ok(r.state.v === 2 && s.v === 2, '服务器上的存档换成第 2 版并写回', s.v);
  ok(s.term === 2 && !('keys' in s) && !('jade' in s) && !('orders' in s), '没用完的 2 把钥匙换成 2 台终端机，玉珏和充值记录去掉', s);
  ok(s.cases.c1 === 1 && s.cases.c2 === 2 && s.cases.c6 === 0, '武器箱照旧，多了三种新箱子');
  ok(s.inv.length === 2 && s.inv[0].st === 7 && s.inv[0].n === '老刀' && !('f' in s.inv[0]) && !('p' in s.inv[0]), '饰品、斩数、名字照旧，磨损和图案模板去掉', s.inv);
  ok(s.eq.gouchen === 2 && profOf(u.uid).skins.includes('gc_wolf'), '穿着的照旧，皮肤还能穿');
  await econ(u.token, 'sync');
  ok(stateOf(u.uid).term === 2, '只换一次（再读不会再多给终端机）');
}

section('挂单：成交时间不告诉客户端，到点只成交一次');
{
  const u = await newUser('seller');
  await econ(u.token, 'gift');
  const o = await econ(u.token, 'open', { c: 'c1' });
  const mk = C.price(o.res.item, C.day(T));
  const l = await econ(u.token, 'list', { i: o.res.item.i, price: Math.max(1, Math.floor(mk * 0.7)) });
  ok(l.res.ok && l.state.lst.length === 1 && l.state.lst[0].at === undefined, '返回的挂单里看不到成交时间', l.state.lst);
  ok(stateOf(u.uid).lst[0].at > T, '服务器自己记着成交时间');
  const ink0 = inkOf(u.uid);
  T += 3 * 86400e3;
  const s1 = await econ(u.token, 'sync');
  const s2 = await econ(u.token, 'sync');
  ok(s1.sold.length === 1 && s2.sold.length === 0 && inkOf(u.uid) === ink0 + C.net(Math.floor(mk * 0.7)), '到点成交、只到账一次（扣 15% 手续费）', [s1.sold, inkOf(u.uid) - ink0]);
}

section('套利：哪天买、哪天卖都赚不到差价；开箱、汰换合同、终端机也一样');
{
  // 规则：挂单最高标到市场价的 95%，直接卖出 88%，成交扣 15%；在售的贵 2%~12%；价格每天最多偏离 ±10%
  const u = await newUser('arbitrage', { ink: 5000 });
  await econ(u.token, 'gift');
  const it = (await econ(u.token, 'open', { c: 'c1' })).res.item, mk = C.price(it, C.day(T)), top = Math.floor(mk * C.LIST_MAX_R);
  const hi = await econ(u.token, 'list', { i: it.i, price: top + 1 });
  ok(hi.res.err && stateOf(u.uid).lst.length === 0, '挂单标价超过市场价的 95% 被拒绝', hi.res);
  const lo = await econ(u.token, 'list', { i: it.i, price: top });
  ok(lo.res.ok && C.sellRate(top / mk) > 0, '标到 95% 可以，能卖掉');
  ok(C.NEED.cov === 10, '隐秘换非凡也要 10 件');

  // 最坏情况的上限（只看规则里的数，跟哪天、哪件无关）
  const muls = Object.values(C.ITEM).map(d => d.mul), mulR = Math.max(...muls) / Math.min(...muls);
  let tMin = 9, tMax = 0;
  for (const k of [...Object.keys(C.ITEM), ...C.CASES.map(c => 'case|' + c)]) for (let d = C.day(T); d < C.day(T) + 730; d++) { const t = C.trend(k, d); tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
  ok(tMin >= 0.9 && tMax <= 1.1, '价格每天最多偏离 ±10%', [tMin, tMax]);
  const sellMax = Math.max(C.BID, C.LIST_MAX_R) * (1 - C.FEE), askMin = C.ASK[0], trendR = 1.1 / 0.9;
  const spec = sellMax * trendR / askMin;
  ok(spec < 0.98, `低买高卖的上限：最低点买、最高点卖也只能卖回 ${(spec * 100).toFixed(1)}%`, spec);
  ok(C.BID * (1 - C.FEE) * trendR < 0.95, '武器箱低买高卖也一样（直接卖出）');
  const base = Math.max(...['mil', 'res', 'cla', 'cov'].map(t => C.BASE[C.UP[t]] / (C.NEED[t] * C.BASE[t])));
  const stR = Math.max(1, ...['mil', 'res', 'cla', 'cov'].map(t => C.ST_MUL(C.UP[t]) / C.ST_MUL(t)));   // 斩数版换斩数版：产出比材料多贵几成
  const tradeMax = base * mulR * trendR * stR * sellMax / askMin;
  ok(tradeMax < 0.9, `汰换合同的上限：材料挑最便宜、产出全挑最贵的那天，也只能换回 ${(tradeMax * 100).toFixed(1)}%`, { base, mulR, stR, tradeMax });
  const termMax = sellMax * trendR / C.TERM.markup[0];
  ok(C.TERM.markup[0] >= 1 && termMax < 1, `终端机报价不低于市场价：买下来转手最多卖回 ${(termMax * 100).toFixed(1)}%`, termMax);

  // 真跑一遍：一年里每一天
  const sell = P => Math.max(C.quick(P), C.net(Math.floor(P * C.LIST_MAX_R)));
  const D0 = C.day(T), DAYS = 365;
  const bestSell = {};   // 每件（普通版 / 斩数版）一年里卖得最贵的那天能拿到多少
  for (const k of Object.keys(C.ITEM)) for (const st of [-1, 0]) { let b = 0; for (let d = D0; d < D0 + DAYS; d++) b = Math.max(b, sell(C.price({ k, st }, d))); bestSell[k + st] = b; }
  let worstSpec = 0;
  for (const k of Object.keys(C.ITEM)) for (let d = D0; d < D0 + DAYS; d++) for (const x of C.listings(k, d)) worstSpec = Math.max(worstSpec, bestSell[k + (x.st >= 0 ? 0 : -1)] / x.price);
  ok(worstSpec < 1, `一年里任何一天买进的任何一件，以后最好的那天卖也只卖回 ${(worstSpec * 100).toFixed(1)}%`, worstSpec);
  let worstCase = 0, worstCid = '';
  for (const cid of C.CASES) {
    const col = C.COLS[cid];
    let ev = 0, pMin = 1e9;
    for (const t of C.TIERS) ev += C.ODDS[t] * col[t].reduce((a, k) => a + (1 - C.ST_P) * bestSell[k + -1] + C.ST_P * bestSell[k + 0], 0) / col[t].length;
    for (let d = D0; d < D0 + DAYS; d++) pMin = Math.min(pMin, C.casePrice(cid, d));
    if (ev / pMin > worstCase) { worstCase = ev / pMin; worstCid = cid; }
  }
  ok(worstCase < 1, `开箱：最便宜那天买箱子，开出来的都挑最贵那天卖，平均也只卖回 ${(worstCase * 100).toFixed(1)}%（${C.COLS[worstCid].name}武器箱）`, worstCase);
  let worstTrade = 0;
  for (let d = D0; d < D0 + DAYS; d++) for (const col of Object.values(C.COLS)) for (const t of ['mil', 'res', 'cla', 'cov']) {
    const up = C.UP[t], need = C.NEED[t], all = col[t].flatMap(k => C.listings(k, d));
    for (const st of [false, true]) {
      const pick = all.filter(x => (x.st >= 0) === st).sort((a, b) => a.price - b.price).slice(0, need);
      if (pick.length < need) continue;
      const cost = pick.reduce((s, x) => s + x.price, 0);
      const ev = col[up].reduce((s, k) => s + bestSell[k + (st ? 0 : -1)], 0) / col[up].length;
      worstTrade = Math.max(worstTrade, ev / cost);
    }
  }
  ok(worstTrade < 1, `一年里每天从市场买最便宜的材料签汰换合同，最好的一份也只换回 ${(worstTrade * 100).toFixed(1)}%`, worstTrade);
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

section('伪造皮肤：存档里塞武库皮肤没用；卖掉的皮肤旧存档加不回来');
{
  const u = await newUser('skinner', { ink: 3000 });
  const p = await call('GET', '/api/profile', undefined, u.token);
  const r = await call('POST', '/api/profile', { profile: { ...p.profile, skins: ['gc_wolf', 'zx_moon', 'lm_jiuxiao', 'qf_frost'], equip: { gouchen: 'gc_wolf', leiming: 'lm_jiuxiao', qingfeng: 'qf_frost' } }, ledger: { deltas: [], ev: p.ledger.ver } }, u.token);
  const pr = profOf(u.uid);
  ok(!pr.skins.includes('gc_wolf') && !pr.skins.includes('zx_moon') && !pr.skins.includes('lm_jiuxiao') && pr.skins.includes('qf_frost'), '武库专属皮肤被拿掉、以前得到的原有皮肤保留', pr.skins);
  ok(!pr.equip.gouchen && !pr.equip.leiming && pr.equip.qingfeng === 'qf_frost', '穿着的假皮肤被脱掉', pr.equip);
  ok(r.fix && r.fix.skinsDel.includes('gc_wolf'), '回执告诉客户端拿掉了哪些', r.fix);
  // 从市场买一件原有的皮肤（qf_gold），再卖掉；旧存档（没看到卖出）想把它加回来
  const day = C.day(T), L = C.listings('qf_gold', day)[0];
  await call('POST', '/api/profile', { profile: { ...p.profile, ink: 0 }, ledger: { deltas: [{ id: 'gggggggg01', d: Math.max(0, L.price - inkOf(u.uid) + 10) }], ev: r.ledger.ver } }, u.token);
  const g0 = await call('GET', '/api/profile', undefined, u.token);
  const buy = await econ(u.token, 'buy', { l: L.l });
  ok(buy.res.ok, '买到金乌', buy.res);
  const sell = await econ(u.token, 'quick', { i: buy.res.item.i });
  ok(sell.res.ok && !profOf(u.uid).skins.includes('qf_gold'), '卖掉以后金乌收回');
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
  ok(C.caseLeft(s) === C.CASE_WEEK, '掉落的武器箱不占每周买箱的次数');
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

section('规则核心：冻结、坏存档自愈');
{
  'use strict';
  let threw = false;
  try { C.ODDS.gold = 1; } catch (e) { threw = true; }
  ok(C.ODDS.gold === 0.0026 && C.CASE_WEEK === 5, '概率表、每周次数改不动' + (threw ? '（严格模式下会报错）' : ''));
  const s = C.normalize({ v: 1, jade: '1e9', keys: 'x', term: -5, cw: { w: 0, n: 99 },
    inv: [{ i: 1, k: 'qf_p1', f: 9, p: -3, st: 5 }, { i: 1, k: 'qf_p1', st: 2 }, { i: 2, k: 'nope' }, { i: 3, k: 'qf_p2', st: -7 }, null],
    lst: [{ l: 'L5', it: { i: 1, k: 'qf_p1' }, price: -1 }], eq: { qingfeng: 77 }, op: { earned: 5, spent: 99 }, evil: 1,
    tm: { t0: T, n: 99, o: { k: 'nope', price: 1 } } }, { now: T, uid: 'x' });
  ok(s.inv.length === 2 && s.inv[0].st === 5 && !('f' in s.inv[0]) && s.inv[1].st === -1, '坏饰品被修正、重复编号和假饰品被丢掉', s.inv);
  ok(s.term === 0 && !('keys' in s) && !('jade' in s) && s.lst.length === 0 && !s.eq.qingfeng && s.op.spent <= s.op.earned && !('evil' in s), '负数、乱填的钥匙、重复的挂单、穿着不存在的饰品、多余字段都被清掉', s);
  ok(s.tm === null && C.caseLeft(s) === C.CASE_WEEK, '假的终端机报价作废；乱填的本周次数换周就重置', [s.tm, s.cw]);
  const t2 = C.normalize({ tm: { t0: T, n: 99, o: { k: 'qf_p1', st: 3, price: -9 } } }, { now: T, uid: 'x' });
  ok(t2.tm && t2.tm.n === C.TERM.offers && t2.tm.o.price >= 1, '终端机报到第几件、价格都夹在范围里', t2.tm);
  ok(s.nid > 3, '新编号不会和已有的撞');
}

console.log(`\n${pass} 项通过，${fail} 项失败`);
Date.now = realNow;
process.exit(fail ? 1 : 0);
