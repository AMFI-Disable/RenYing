// 武库经济 + 反作弊的服务器测试：在本机把 cloudflare/worker.js 跑起来（D1 用 node:sqlite 模拟），
// 正常流程走一遍，再按作弊的路数打一遍：改墨锭、伪造皮肤、重放请求、并发双花、乱填参数、刷开箱次数、刷终端机、
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
  ok(C.CASES.length === 7 && C.REG.length === 6 && C.REG.every(c => C.TIERS.every(t => (C.COLS[c][t] || []).length)), '七个武器箱：六个普通武器箱，每个五档品质都有东西');
  const P = C.COLS.c7, pk = ['cla', 'cov', 'gold'].flatMap(t => P[t]);
  ok(P.prem && !P.mil.length && !P.res.length && pk.length === 7 && P.odds.mil === 0 && P.odds.res === 0 && Math.abs(P.odds.cov + P.odds.gold - 0.3) < 1e-9, '神兵武器箱没有军规级和受限，隐秘加非凡一共 30%', P.odds);
  ok(pk.every(k => C.CS_KEYS.includes(k) && C.ITEM[k].col === 'c7') && !C.REG.some(c => C.TIERS.some(t => C.COLS[c][t].some(k => pk.includes(k)))), '神兵武器箱的 7 款只在这个箱子里出');
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
  ok(C.ODDS.mil === 0.53 && C.ODDS.res === 0.27 && C.ODDS.cla === 0.13 && C.ODDS.cov === 0.052 && C.ODDS.gold === 0.018, '普通武器箱的爆率是 53% / 27% / 13% / 5.2% / 1.8%');
  ok(C.TIERS.every(t => Math.abs(cnt[t] / N - C.ODDS[t]) < Math.max(0.002, C.ODDS[t] * 0.15)), '五档品质的比例和公布的一样', Object.fromEntries(C.TIERS.map(t => [t, +(cnt[t] / N).toFixed(4)])));
  ok(Math.abs(st / N - C.ST_P) < 0.005, `斩数版占 ${(st / N * 100).toFixed(1)}%（公布的是 ${C.ST_P * 100}%）`);
  ok(C.CASES.every(c => Math.abs(Object.values(C.oddsOf(c)).reduce((a, b) => a + b, 0) - 1) < 1e-9) && Math.abs(Object.values(C.TERM.odds).reduce((a, b) => a + b, 0) - 1) < 1e-9, '每个武器箱和终端机的概率加起来都是 100%');
  const PO = C.oddsOf('c7'), M = 60000, pc = Object.fromEntries(C.TIERS.map(t => [t, 0]));
  for (let i = 0; i < M; i++) {
    const s = C.blank(); s.cases.c7 = 1;
    const env = { now: T, rnd: R, uid: 'odds', ink: 0, skins: [], equip: {}, server: true };
    const it = C.run(s, 'open', { c: 'c7' }, env).res.item;
    pc[C.ITEM[it.k].tier]++;
    if (C.ITEM[it.k].col !== 'c7') { pc.bad = (pc.bad || 0) + 1; }
  }
  ok(!pc.mil && !pc.res && !pc.bad && ['cla', 'cov', 'gold'].every(t => Math.abs(pc[t] / M - PO[t]) < Math.max(0.004, PO[t] * 0.1)), `神兵武器箱开 ${M} 次：保密 ${(pc.cla / M * 100).toFixed(1)}%、隐秘 ${(pc.cov / M * 100).toFixed(1)}%、非凡 ${(pc.gold / M * 100).toFixed(1)}%，一个军规级、受限都没有`, pc);
}

section('星章兑换：只从普通武器箱里出，神兵武器箱的 7 款换不到');
{
  const R = C.rng(77), env = () => ({ now: T, rnd: R, uid: 'star', ink: 0, skins: [], equip: {}, server: true });
  const rich = () => { const s = C.blank(); Object.assign(s.op, { s: C.season(C.day(T)).id, earned: 999 }); return s; };
  const prem = Object.keys(C.ITEM).filter(C.isPrem);
  ok(prem.length === 7 && prem.every(k => C.ITEM[k].col === 'c7'), '神兵武器箱正好 7 款，都只在神兵武器箱里', prem);
  const pc = C.ofTier('cov').find(C.isPrem), rc = C.ofTierReg('cov')[0];
  const r1 = C.run(rich(), 'star', { id: 'cov', k: pc }, env()).res;
  ok(r1.err === '要从普通武器箱的隐秘级里挑一件', `自选隐秘挑神兵武器箱的 ${pc} 被拒绝`, r1);
  const o2 = C.run(rich(), 'star', { id: 'cov', k: rc }, env()), r2 = o2.res;
  ok(r2.ok && r2.item.k === rc && o2.state.op.spent === 15, `自选隐秘挑普通武器箱的 ${rc} 可以`, r2);
  let bad = 0;
  for (let i = 0; i < 400; i++) for (const id of ['res', 'cla']) { const r = C.run(rich(), 'star', { id }, env()).res; if (!r.ok || C.isPrem(r.item.k)) bad++; }
  ok(bad === 0, '随机受限、随机保密换 800 次，一次都没出神兵武器箱的饰品', bad);
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

section('开箱次数：普通武器箱每天开 2 个，神兵武器箱每周开 1 个；并发也多开不了');
{
  T = nextNoon();
  const u = await newUser('daily', { ink: 5000 });
  const g = await econ(u.token, 'gift');
  ok(C.openLeft(g.state, 'c1') === C.OPEN_DAY && C.openLeft(g.state, 'c7') === C.PREM_WEEK, `一开始：今天能开 ${C.OPEN_DAY} 个普通武器箱，这周能开 ${C.PREM_WEEK} 个神兵武器箱`);
  const b1 = await econ(u.token, 'buyCase', { c: 'c3', n: 2 });
  ok(b1.res.ok && b1.state.cases.c3 === 2, '从市场买 2 个名剑武器箱（买不限次数）', b1.res);
  const o1 = await econ(u.token, 'open', { c: 'c1' }), o2 = await econ(u.token, 'open', { c: 'c3' });
  ok(o1.res.ok && o2.res.ok && C.openLeft(o2.state, 'c3') === 0, '新手礼的箱子和买来的一样算次数：开了 2 个，今天用完了', [o1.res, o2.res]);
  const o3 = await econ(u.token, 'open', { c: 'c3' });
  ok(o3.res.err && o3.res.err.includes('明天') && stateOf(u.uid).cases.c3 === 1 && stateOf(u.uid).inv.length === 2, '第 3 个开不了，箱子还在', o3.res);
  const bp = await econ(u.token, 'buyCase', { c: 'c7', n: 2 });
  ok(bp.res.ok && bp.state.cases.c7 === 2, '从市场买 2 个神兵武器箱', bp.res);
  const p1 = await econ(u.token, 'open', { c: 'c7' });
  const pt = p1.res.item && C.ITEM[p1.res.item.k];
  ok(p1.res.ok && pt && ['cla', 'cov', 'gold'].includes(pt.tier) && pt.col === 'c7', '神兵武器箱不占每天那 2 个，开出来的是保密或更高', p1.res);
  const p2 = await econ(u.token, 'open', { c: 'c7' });
  ok(p2.res.err && p2.res.err.includes('下周一') && stateOf(u.uid).cases.c7 === 1, '神兵武器箱这周开过了，再开不了', p2.res);
  T = nextNoon();
  const s1 = await econ(u.token, 'sync');
  const wk = C.week(C.day(T)) !== C.week(C.day(T) - 1);
  ok(C.openLeft(s1.state, 'c3') === C.OPEN_DAY && C.openLeft(s1.state, 'c7') === (wk ? C.PREM_WEEK : 0), '第二天：普通武器箱又能开 2 个，神兵武器箱要等到周一', [s1.state.od, s1.state.pw]);
  ok((await econ(u.token, 'open', { c: 'c3' })).res.ok, '第二天接着开');
  const D = C.day(T), mon = D + 7 - ((D + 3) % 7);
  T = mon * 86400e3 - 8 * 3600e3 + 3600e3;           // 北京时间周一凌晨 1 点
  const s2 = await econ(u.token, 'sync');
  ok(C.openLeft(s2.state, 'c7') === C.PREM_WEEK && (await econ(u.token, 'open', { c: 'c7' })).res.ok, '到了周一，神兵武器箱又能开 1 个');

  T = nextNoon();
  const v = await newUser('daily2', { ink: 5000 });
  ok((await econ(v.token, 'buyCase', { c: 'c2', n: 4 })).res.ok, '买 4 个霜华武器箱');
  const rs = await Promise.all(Array.from({ length: 12 }, () => econ(v.token, 'open', { c: 'c2' })));
  const sv = stateOf(v.uid);
  ok(rs.filter(r => r.res && r.res.ok).length === 2 && sv.inv.length === 2 && sv.cases.c2 === 2 && sv.od.n === 2, '12 个并发开箱：正好开出 2 个，剩下的箱子还在', rs.map(r => r.res && (r.res.err || 'ok')));
  ok((await econ(v.token, 'buyCase', { c: 'c7', n: 2 })).res.ok, '买 2 个神兵武器箱');
  const rp = await Promise.all(Array.from({ length: 8 }, () => econ(v.token, 'open', { c: 'c7' })));
  ok(rp.filter(r => r.res && r.res.ok).length === 1 && stateOf(v.uid).cases.c7 === 1 && stateOf(v.uid).pw.n === 1, '8 个并发开神兵武器箱：只开出 1 个', rp.map(r => r.res && (r.res.err || 'ok')));
  const poor = await newUser('daily3', { ink: 100 });
  ok((await econ(poor.token, 'buyCase', { c: 'c1' })).res.err && Object.values(stateOf(poor.uid).cases).every(n => n === 0) && inkOf(poor.uid) === 100, '墨锭不够买不了箱子，也不扣钱');
}

section('市场上的武器箱和终端机：买最便宜的、卖完就没了；直接卖、挂单、撤单都和饰品一样');
{
  T = nextNoon();
  const u = await newUser('goods', { ink: 5000 });
  const day = C.day(T), L = C.listings('c4', day), mk = C.goodPrice('c4', day);
  ok(L.length >= 6 && L.length <= 12 && L.every(x => x.price >= Math.round(mk * C.ASK[0]) && x.price <= Math.round(mk * C.ASK[1])), `今天市场上有 ${L.length} 个江湖武器箱在卖，都比市场价贵 2%~12%`, [L.length, mk]);
  const want = L.slice(0, 3).reduce((a, x) => a + x.price, 0);
  const b = await econ(u.token, 'buyCase', { c: 'c4', n: 3 });
  ok(b.res.ok && b.res.price === want && b.res.n === 3 && b.state.cases.c4 === 3 && inkOf(u.uid) === 5000 - want, '一次买 3 个：买的是今天最便宜的那 3 个', [b.res, want]);
  ok(stateOf(u.uid).hist[0].kind === 'buy' && stateOf(u.uid).hist[0].g === 'c4' && stateOf(u.uid).hist[0].n === 3, '成交记录里记着买了 3 个江湖武器箱', stateOf(u.uid).hist[0]);
  const PL = C.listings('c7', day);
  ok(PL.length >= 2 && PL.length <= 4 && PL[0].price >= C.casePrice('c7', day), `神兵武器箱每天只有 ${PL.length} 个在卖`, PL.length);
  const tL = C.listings('term', day), ink1 = inkOf(u.uid);
  const bt = await econ(u.token, 'buyTerm', { n: 2 });
  ok(bt.res.ok && bt.res.price === tL[0].price + tL[1].price && bt.state.term === 2 && inkOf(u.uid) === ink1 - bt.res.price, '从市场买 2 台终端机', bt.res);
  const rest = tL.length - 2;
  const over = await econ(u.token, 'buyTerm', { n: rest + 1 });
  ok(over.res.err && over.res.err.includes(`只剩 ${rest} 个`) && stateOf(u.uid).term === 2, `今天只剩 ${rest} 台时买 ${rest + 1} 台被拒绝`, over.res);
  ok((await econ(u.token, 'buyTerm', { n: rest })).res.ok && stateOf(u.uid).term === tL.length, '剩下的全买走');
  const sold = await econ(u.token, 'buyTerm', { n: 1 });
  ok(sold.res.err && sold.res.err.includes('卖完了'), '今天的终端机卖完了，明天再来', sold.res);
  for (const n of [2, -5, 0, 11, 1e9, 2.5, 'abc', null, '3; DROP TABLE econ']) {
    const i0 = inkOf(u.uid), c0 = stateOf(u.uid).cases.c6, r = await econ(u.token, 'buyCase', { c: 'c6', n });
    const fine = n === 2;
    ok(fine ? r.res.ok && stateOf(u.uid).cases.c6 === c0 + 2 : r.res.err && inkOf(u.uid) === i0 && stateOf(u.uid).cases.c6 === c0, `一次买 ${JSON.stringify(n)} 个：${fine ? '照买' : '拒绝，不扣钱'}`, r.res);
  }
  const ink2 = inkOf(u.uid), q = C.quick(mk);
  const sc = await econ(u.token, 'sellCase', { c: 'c4', n: 2 });
  ok(sc.res.ok && sc.res.gain === 2 * q && inkOf(u.uid) === ink2 + 2 * q && stateOf(u.uid).cases.c4 === 1 && q === Math.floor(mk * 0.88 * 0.85), '直接卖 2 个武器箱：按市场价的 88% 收、再扣 15% 手续费', sc.res);
  const st = await econ(u.token, 'sellTerm', { n: 1 });
  ok(st.res.ok && st.res.gain === C.quick(C.goodPrice('term', day)) && stateOf(u.uid).term === tL.length - 1, '直接卖 1 台终端机', st.res);
  ok((await econ(u.token, 'sellCase', { c: 'c5', n: 1 })).res.err, '没有的武器箱卖不了');
  const top = Math.floor(mk * C.LIST_MAX_R);
  ok((await econ(u.token, 'list', { c: 'c4', price: top + 1 })).res.err && stateOf(u.uid).cases.c4 === 1, '武器箱挂单也最高只能标到市场价的 95%');
  const li = await econ(u.token, 'list', { c: 'c4', price: top });
  ok(li.res.ok && li.state.cases.c4 === 0 && li.state.lst.some(x => x.g === 'c4' && x.price === top && x.at === undefined), '挂一个武器箱：箱子先收走，挂单里看不到成交时间', li.state.lst);
  ok((await econ(u.token, 'open', { c: 'c4' })).res.err && (await econ(u.token, 'sellCase', { c: 'c4' })).res.err, '挂着的箱子不能开、不能再卖');
  const cl = await econ(u.token, 'cancel', { l: li.state.lst.find(x => x.g === 'c4').l });
  ok(cl.res.ok && cl.state.cases.c4 === 1 && !cl.state.lst.length, '撤单：箱子放回来');
  const tp = Math.floor(C.goodPrice('term', day) * 0.6);
  const lt = await econ(u.token, 'list', { c: 'term', price: tp });
  ok(lt.res.ok && lt.state.term === tL.length - 2, '挂一台终端机');
  for (const c of ['c8', '__proto__', 'constructor', 'toString', null, 7]) ok((await econ(u.token, 'list', { c, price: 10 })).res.err, `挂单挂不存在的东西 ${JSON.stringify(c)} 被拒绝`);
  const ink3 = inkOf(u.uid);
  T += 3 * 86400e3;
  const s1 = await econ(u.token, 'sync'), s2 = await econ(u.token, 'sync');
  ok(s1.sold.length === 1 && s1.sold[0].g === 'term' && s2.sold.length === 0 && inkOf(u.uid) === ink3 + C.net(tp), '终端机到点成交、只到账一次（扣 15% 手续费）', [s1.sold, inkOf(u.uid) - ink3]);
  ok(stateOf(u.uid).hist[0].kind === 'sold' && stateOf(u.uid).hist[0].g === 'term', '成交记录里记着卖掉了终端机', stateOf(u.uid).hist[0]);

  T = nextNoon();
  const w = await newUser('goods2', { ink: 5000 });
  const dw = C.day(T), LW = C.listings('c5', dw);
  const rs = await Promise.all(Array.from({ length: 14 }, () => econ(w.token, 'buyCase', { c: 'c5', n: 1 })));
  const won = rs.filter(r => r.res && r.res.ok), cost = won.reduce((a, r) => a + r.res.price, 0), sw = stateOf(w.uid);
  const expect = LW.slice(0, won.length).reduce((a, x) => a + x.price, 0);
  ok(won.length === LW.length && sw.cases.c5 === LW.length && cost === expect && inkOf(w.uid) === 5000 - cost && new Set(sw.bought.ids).size === sw.bought.ids.length, `14 个并发买箱：今天在卖的 ${LW.length} 个各买到一次，钱一分不多扣`, [won.length, LW.length, cost, expect]);
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
  for (const c of ['c8', '__proto__', 'constructor', null]) ok((await econ(u.token, 'buyCase', { c })).res.err && inkOf(u.uid) === ink0, `买不存在的武器箱 ${c} 被拒绝`);
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
  ok(h.econ === C.VER && C.VER === 3, '服务器报的规则版本是 3（网页据此判断服务器是不是新版）', h);
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
  ok(s.term === 2 && !('keys' in s) && !('jade' in s) && !('orders' in s), '没用完的 2 把钥匙换成 2 台终端机，玉珏和充值记录去掉', s);
  ok(s.cases.c1 === 1 && s.cases.c2 === 2 && s.cases.c6 === 0 && s.cases.c7 === 0, '武器箱照旧，多了几种新箱子');
  ok(s.inv.length === 2 && s.inv[0].st === 7 && s.inv[0].n === '老刀' && !('f' in s.inv[0]) && !('p' in s.inv[0]), '饰品、斩数、名字照旧，磨损和图案模板去掉', s.inv);
  ok(s.eq.gouchen === 2 && profOf(u.uid).skins.includes('gc_wolf'), '穿着的照旧，皮肤还能穿');
  await econ(u.token, 'sync');
  ok(stateOf(u.uid).term === 2, '只换一次（再读不会再多给终端机）');
}

section('第 2 版的武库存档：每周买箱的次数去掉，箱子买卖记录照旧');
{
  T = nextNoon();
  const u = await newUser('legacy2');
  await econ(u.token, 'sync');
  const v2 = { v: 2, tags: 0, term: 1, tm: null, nid: 3, gift: 1, cases: { c1: 0, c2: 3, c3: 1, c4: 0, c5: 0, c6: 0 }, cw: { w: C.week(C.day(T)), n: 5 },
    inv: [{ i: 1, k: 'yh_p1', st: -1, n: '', t: T - 1e6, src: 'case' }], via: ['yh_p1'], eq: {},
    lst: [{ l: 'L9', it: { i: 2, k: 'ls_plum', st: 12, n: '', t: T - 1e6, src: 'case' }, price: 50, t: T - 1e5, at: 0 }],
    hist: [{ t: T - 1e5, kind: 'buy', c: 'c2', n: 3, price: 660 }, { t: T - 2e5, kind: 'sell', k: 'qf_p1', st: -1, price: 20 }] };
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ? WHERE uid = ?').run(JSON.stringify(v2), u.uid);
  const r = await econ(u.token, 'sync');
  const s = stateOf(u.uid);
  ok(r.state.v === 3 && s.v === 3 && !('cw' in s) && s.od.n === 0 && s.pw.n === 0, '换成第 3 版：每周买箱的次数去掉，今天还能开 2 个', s);
  ok(s.cases.c2 === 3 && s.cases.c3 === 1 && s.cases.c7 === 0 && s.term === 1, '武器箱和终端机照旧');
  ok(s.inv.length === 1 && s.lst.length === 1 && s.lst[0].it.k === 'ls_plum' && s.lst[0].it.st === 12 && s.nid > 9, '饰品和挂着的单照旧', [s.inv, s.lst]);
  ok(s.hist[0].g === 'c2' && s.hist[0].n === 3 && !('c' in s.hist[0]) && s.hist[1].k === 'qf_p1', '第 2 版的买箱记录换成新的写法', s.hist);
  ok((await econ(u.token, 'open', { c: 'c2' })).res.ok && (await econ(u.token, 'open', { c: 'c2' })).res.ok && (await econ(u.token, 'open', { c: 'c2' })).res.err, '接着开：今天开 2 个，第 3 个等明天');
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
  for (const k of [...Object.keys(C.ITEM), ...C.CASES.map(c => 'case|' + c), 'term']) for (let d = C.day(T); d < C.day(T) + 730; d++) { const t = C.trend(k, d); tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
  ok(tMin >= 0.9 && tMax <= 1.1, '价格每天最多偏离 ±10%', [tMin, tMax]);
  const sellMax = Math.max(C.BID, C.LIST_MAX_R) * (1 - C.FEE), askMin = C.ASK[0], trendR = 1.1 / 0.9;
  const spec = sellMax * trendR / askMin;
  ok(spec < 0.98, `低买高卖的上限：最低点买、最高点卖也只能卖回 ${(spec * 100).toFixed(1)}%`, spec);
  ok(C.BID * (1 - C.FEE) * trendR < 0.95, '武器箱、终端机低买高卖也一样（直接卖出）');
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
    for (const t of C.TIERS) if (col[t].length) ev += C.oddsOf(cid)[t] * col[t].reduce((a, k) => a + (1 - C.ST_P) * bestSell[k + -1] + C.ST_P * bestSell[k + 0], 0) / col[t].length;
    for (let d = D0; d < D0 + DAYS; d++) pMin = Math.min(pMin, C.casePrice(cid, d));
    if (ev / pMin > worstCase) { worstCase = ev / pMin; worstCid = cid; }
  }
  ok(worstCase < 1, `开箱：最便宜那天买箱子，开出来的都挑最贵那天卖，平均也只卖回 ${(worstCase * 100).toFixed(1)}%（${C.COLS[worstCid].name}武器箱）`, worstCase);
  let worstGood = 0;
  for (const k of C.GOODS) {
    let b = 0; for (let d = D0; d < D0 + DAYS; d++) b = Math.max(b, sell(C.goodPrice(k, d)));
    for (let d = D0; d < D0 + DAYS; d++) for (const x of C.listings(k, d)) worstGood = Math.max(worstGood, b / x.price);
  }
  ok(worstGood < 1, `一年里任何一天从市场买进的武器箱、终端机，以后最好的那天卖也只卖回 ${(worstGood * 100).toFixed(1)}%`, worstGood);
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
  ok(C.openLeft(s, 'c1') === C.OPEN_DAY && s.cases.c7 === 0, '掉落的都是普通武器箱（神兵武器箱只在市场上买得到）', s.cases);
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
  try { C.COLS.c7.odds.gold = 1; C.COLS.c7.price = 1; } catch (e) { threw = true; }
  ok(C.ODDS.gold === 0.018 && C.COLS.c7.odds.gold === 0.08 && C.COLS.c7.price === 1000 && C.OPEN_DAY === 2 && C.PREM_WEEK === 1, '概率表、箱子价钱、每天和每周能开几个都改不动' + (threw ? '（严格模式下会报错）' : ''));
  const s = C.normalize({ v: 1, jade: '1e9', keys: 'x', term: -5, cw: { w: 0, n: 99 }, od: { d: 0, n: 99 }, pw: { w: 'x', n: -3 },
    inv: [{ i: 1, k: 'qf_p1', f: 9, p: -3, st: 5 }, { i: 1, k: 'qf_p1', st: 2 }, { i: 2, k: 'nope' }, { i: 3, k: 'qf_p2', st: -7 }, null],
    lst: [{ l: 'L5', it: { i: 1, k: 'qf_p1' }, price: -1 }], eq: { qingfeng: 77 }, op: { earned: 5, spent: 99 }, evil: 1,
    tm: { t0: T, n: 99, o: { k: 'nope', price: 1 } } }, { now: T, uid: 'x' });
  ok(s.inv.length === 2 && s.inv[0].st === 5 && !('f' in s.inv[0]) && s.inv[1].st === -1, '坏饰品被修正、重复编号和假饰品被丢掉', s.inv);
  ok(s.term === 0 && !('keys' in s) && !('jade' in s) && s.lst.length === 0 && !s.eq.qingfeng && s.op.spent <= s.op.earned && !('evil' in s), '负数、乱填的钥匙、重复的挂单、穿着不存在的饰品、多余字段都被清掉', s);
  ok(s.tm === null && C.openLeft(s, 'c1') === C.OPEN_DAY && C.openLeft(s, 'c7') === C.PREM_WEEK && !('cw' in s), '假的终端机报价作废；乱填的开箱次数换天、换周就重置', [s.tm, s.od, s.pw]);
  const t2 = C.normalize({ tm: { t0: T, n: 99, o: { k: 'qf_p1', st: 3, price: -9 } } }, { now: T, uid: 'x' });
  ok(t2.tm && t2.tm.n === C.TERM.offers && t2.tm.o.price >= 1, '终端机报到第几件、价格都夹在范围里', t2.tm);
  ok(s.nid > 3, '新编号不会和已有的撞');
}

console.log(`\n${pass} 项通过，${fail} 项失败`);
Date.now = realNow;
process.exit(fail ? 1 : 0);
