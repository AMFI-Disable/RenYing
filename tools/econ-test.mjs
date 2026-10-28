// 武库经济 + 反作弊的服务器测试：在本机把 cloudflare/worker.js 跑起来（D1 用 node:sqlite 模拟），
// 正常流程走一遍，再按作弊的路数打一遍：改墨锭、伪造皮肤、重放请求、并发双花（同一件同时卖、同一单同时买、买和撤撞上）、
// 乱填参数、刷开箱次数、刷终端机、乱报斩数、刷对局奖励、爆破密码……
// 全服肉鸽的星座皮肤：服务器写 gift 表、下次动武库领到；游客、新号、伤害不够的没有；每号每天一件；同时领、同时发都不会多。
// 还有管理后台：管理口令、加减墨锭和东西、封号解封、全服补偿、兑换码、在线改经济数值、管理网页。
// 用法：node tools/econ-test.mjs           （Node 22 以上，不用装任何包）
//       node tools/econ-test.mjs --bundle  测打包好的 cloudflare/worker.bundle.js（真正部署上去的那个文件）
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gameJs } from './ai-code.mjs';

const ROOT = new URL('..', import.meta.url);
let T = Date.UTC(2026, 9, 23, 4, 0, 0);   // 测试里的“现在”，可以随意往后拨
const realNow = Date.now;
Date.now = () => T;

const FILE = process.argv.includes('--bundle') ? 'cloudflare/worker.bundle.js' : 'cloudflare/worker.js';
const { default: worker, WorldLine, FLAGS, PW_ITER } = await import(new URL(FILE, ROOT));
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

const ADMIN = 'admin-pass-0123456789';
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
// 直接往服务器存档里塞几件饰品（测试用，省得一件件开箱）。要先 sync 一次建好账
function grant(uid, items, extra = {}) {
  const s = stateOf(uid), out = [];
  for (const x of items) { const it = { i: s.nid++, k: x.k, st: x.st === undefined ? -1 : x.st, n: x.n || '', t: T, src: 'case' }; s.inv.push(it); out.push(it); }
  s.via = [...new Set([...s.via, ...items.map(x => x.k)])];
  Object.assign(s, extra);
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ?, ver = ver + 1 WHERE uid = ?').run(JSON.stringify(s), uid);
  return out;
}
const market = (tok, k) => call('GET', '/api/market' + (k ? '?k=' + k : ''), undefined, tok);
const mrow = id => row('SELECT * FROM mkt WHERE id = ?', id);

/* ===================================================================== */
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

section('正常流程：新手礼、开箱（不用钥匙）、穿上、挂到玩家市场、撤下');
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
  const l = await econ(A.token, 'list', { i: it.i, price: 123 });
  ok(l.res.ok && C.isLid(l.res.l) && !l.state.inv.length && l.state.lst.length === 1 && inkOf(A.uid) === ink0, '挂到玩家市场：饰品离开库存，墨锭不变（系统不收购）', l.res);
  ok(!profOf(A.uid).skins.includes(it.k) && !profOf(A.uid).equip[C.charOf(it.k)], '挂出去以后皮肤收回、换回默认');
  ok(mrow(l.res.l) && mrow(l.res.l).state === 0 && mrow(l.res.l).seller === A.uid && mrow(l.res.l).price === 123, '市场表里多了这一单（在卖）');
  const c = await econ(A.token, 'cancel', { l: l.res.l });
  ok(c.res.ok && c.state.inv.length === 1 && c.state.inv[0].i === it.i && !c.state.lst.length && mrow(l.res.l).state === 2, '撤下：饰品放回库存，市场上那一单标成撤下', c.res);
  ok(profOf(A.uid).skins.includes(it.k), '撤回来的皮肤又能穿了');
  ok(c.ledger.ink === inkOf(A.uid), '返回的账本和服务器一致');
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

section('星座武器箱：十二星座 36 款，65% / 28% / 7%，每个号送 1 个，每周开 1 个');
{
  const Z = C.COLS.c8, codes = C.ZODIAC.map(z => z[0]);
  ok(Z.prem && !Z.mil.length && !Z.res.length && ['cla', 'cov', 'gold'].every(t => Z[t].length === 12) && Z.odds.cla === 0.65 && Z.odds.cov === 0.28 && Z.odds.gold === 0.07 && Z.price > C.COLS.c7.price,
    '保密、隐秘、非凡各 12 款，爆率 65 / 28 / 7，比神兵武器箱贵', [Z.price, Z.odds]);
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
  ok(!pc.mil && !pc.res && !pc.bad && ['cla', 'cov', 'gold'].every(t => Math.abs(pc[t] / M - ZO[t]) < Math.max(0.004, ZO[t] * 0.1)), `星座武器箱开 ${M} 次：保密 ${(pc.cla / M * 100).toFixed(1)}%、隐秘 ${(pc.cov / M * 100).toFixed(1)}%、非凡 ${(pc.gold / M * 100).toFixed(1)}%`, pc);
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

section('星章兑换：只从普通武器箱里出，神兵武器箱的 7 款换不到');
{
  const R = C.rng(77), env = () => ({ now: T, rnd: R, uid: 'star', ink: 0, skins: [], equip: {}, server: true });
  const rich = () => { const s = C.blank(); Object.assign(s.op, { s: C.season(C.day(T)).id, earned: 999 }); return s; };
  const prem = Object.keys(C.ITEM).filter(C.isPrem);
  ok(prem.length === 43 && prem.filter(k => C.ITEM[k].col === 'c7').length === 7 && prem.filter(k => C.ITEM[k].col === 'c8').length === 36, '神兵武器箱 7 款、星座武器箱 36 款，都只在自己的箱子里', prem.length);
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

let RACE_K = '';
section('并发双花：同一件同时挂 12 次、同一个箱子同时开 12 次、同一单同时买');
{
  const u = await newUser('racer');
  await econ(u.token, 'gift');
  const o = await econ(u.token, 'open', { c: 'c1' });
  RACE_K = o.res.item.k;   // 这件后面以 50 卖掉了：开出来的要是霜狼（gc_wolf，初刃武器箱的非凡），玩家市场那段的成交记录会多一笔
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

section('开箱次数：普通武器箱每天开 2 个，神兵武器箱每周开 1 个；并发也多开不了');
{
  T = nextNoon();
  const u = await newUser('daily', { ink: 5000 });
  const g = await econ(u.token, 'gift');
  ok(C.openLeft(g.state, 'c1') === C.OPEN_DAY && C.openLeft(g.state, 'c7') === C.PREM_WEEK, `一开始：今天能开 ${C.OPEN_DAY} 个普通武器箱，这周能开 ${C.PREM_WEEK} 个神兵武器箱`);
  const b1 = await econ(u.token, 'buyCase', { c: 'c3', n: 2 });
  ok(b1.res.ok && b1.state.cases.c3 === 2 && b1.res.price === 2 * C.COLS.c3.price, '从商店买 2 个名剑武器箱（固定价格，买不限次数）', b1.res);
  const o1 = await econ(u.token, 'open', { c: 'c1' }), o2 = await econ(u.token, 'open', { c: 'c3' });
  ok(o1.res.ok && o2.res.ok && C.openLeft(o2.state, 'c3') === 0, '新手礼的箱子和买来的一样算次数：开了 2 个，今天用完了', [o1.res, o2.res]);
  const o3 = await econ(u.token, 'open', { c: 'c3' });
  ok(o3.res.err && o3.res.err.includes('明天') && stateOf(u.uid).cases.c3 === 1 && stateOf(u.uid).inv.length === 2, '第 3 个开不了，箱子还在', o3.res);
  const bp = await econ(u.token, 'buyCase', { c: 'c7', n: 2 });
  ok(bp.res.ok && bp.state.cases.c7 === 2 && bp.res.price === 2 * C.COLS.c7.price, '从商店买 2 个神兵武器箱', bp.res);
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
  ok(stateOf(v.uid).cases.c8 === 1 && (await econ(v.token, 'buyCase', { c: 'c8' })).res.ok && stateOf(v.uid).cases.c8 === 2, '服务器上的新号有送的 1 个星座武器箱，再买 1 个');
  const rz = await Promise.all(Array.from({ length: 8 }, () => econ(v.token, 'open', { c: 'c8' })));
  ok(rz.filter(r => r.res && r.res.ok).length === 1 && stateOf(v.uid).cases.c8 === 1 && stateOf(v.uid).zw.n === 1 && C.ITEM[stateOf(v.uid).inv.find(x => C.ITEM[x.k].col === 'c8').k].col === 'c8', '8 个并发开星座武器箱：只开出 1 个', rz.map(r => r.res && (r.res.err || 'ok')));
  const rp = await Promise.all(Array.from({ length: 8 }, () => econ(v.token, 'open', { c: 'c7' })));
  ok(rp.filter(r => r.res && r.res.ok).length === 1 && stateOf(v.uid).cases.c7 === 1 && stateOf(v.uid).pw.n === 1, '8 个并发开神兵武器箱：只开出 1 个', rp.map(r => r.res && (r.res.err || 'ok')));
  const poor = await newUser('daily3', { ink: 100 });
  ok((await econ(poor.token, 'buyCase', { c: 'c1' })).res.err && Object.entries(stateOf(poor.uid).cases).every(([c, n]) => n === (c === 'c8' ? 1 : 0)) && inkOf(poor.uid) === 100, '墨锭不够买不了箱子，也不扣钱（只有送的那个星座武器箱）');
}

section('商店：武器箱和终端机按固定价格买，不限量；不能挂到玩家市场，系统也不收购');
{
  T = nextNoon();
  const u = await newUser('shop', { ink: 5000 });
  const P = C.COLS.c4.price;
  ok(C.CASES.every(c => C.shopPrice(c) === C.COLS[c].price && C.COLS[c].price > 0) && C.shopPrice('term') === C.TERM.price && C.TERM.price === 500, '每个武器箱都有固定价格，终端机 500 墨锭一台');
  const b = await econ(u.token, 'buyCase', { c: 'c4', n: 3 });
  ok(b.res.ok && b.res.price === 3 * P && b.res.n === 3 && b.state.cases.c4 === 3 && inkOf(u.uid) === 5000 - 3 * P, `一次买 3 个江湖武器箱：正好 3 × ${P}`, b.res);
  ok(stateOf(u.uid).hist[0].kind === 'buy' && stateOf(u.uid).hist[0].g === 'c4' && stateOf(u.uid).hist[0].n === 3, '成交记录里记着买了 3 个江湖武器箱', stateOf(u.uid).hist[0]);
  T += 3600e3;
  const b2 = await econ(u.token, 'buyCase', { c: 'c4', n: 1 });
  ok(b2.res.ok && b2.res.price === P, '过一会儿再买，价格还是一样（不随时间、不随买的人多少变）', b2.res);
  const ink1 = inkOf(u.uid);
  const bt = await econ(u.token, 'buyTerm', { n: 2 });
  ok(bt.res.ok && bt.res.price === 2 * C.TERM.price && bt.state.term === 2 && inkOf(u.uid) === ink1 - 2 * C.TERM.price, '买 2 台终端机：2 × 500', bt.res);
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
    ok(r.res.err && r.res.err.includes('商店') && !stateOf(u.uid).lst.length, `${c === 'term' ? '终端机' : C.COLS[c].name + '武器箱'}不能挂到市场`, r.res);
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

  // 同时最多挂 20 单
  const many = grant(S.uid, Array.from({ length: C.LIST_MAX + 1 }, () => ({ k: 'ts_p1' })));
  const have = stateOf(S.uid).lst.length;
  for (let i = 0; i < C.LIST_MAX - have; i++) await econ(S.token, 'list', { i: many[i].i, price: 5 });
  const over = await econ(S.token, 'list', { i: many[C.LIST_MAX].i, price: 5 });
  ok(stateOf(S.uid).lst.length === C.LIST_MAX && over.res.err, `同时最多挂 ${C.LIST_MAX} 单`, over.res);

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

section('终端机：一次报一件，最多 5 件，买下就用掉；重发、并发都不会跳过或多买');
{
  T = nextNoon();
  const u = await newUser('terminal', { ink: 5000 });
  ok((await econ(u.token, 'unseal')).res.err, '没有终端机开不了');
  await econ(u.token, 'gift');
  ok((await econ(u.token, 'termNext', { n: 1 })).res.err, '没开封不能换');
  const s1 = await econ(u.token, 'unseal');
  const tm = s1.state.tm, rv = C.refVal(tm.o);
  ok(s1.res.ok && tm && tm.n === 1 && s1.state.term === 0, '开封：给出第 1 件，终端机少一台', s1.state.tm);
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
  // 偶尔会报到一件 5,000 墨锭买不起的（斩数版的 ★ 非凡）：让管理员先补上差的墨锭，这一段就不看运气
  if (inkOf(u.uid) < o.price) await call('POST', '/api/admin/adjust', { uid: u.uid, ink: o.price - inkOf(u.uid), why: '测试：报价比手里的墨锭高' }, ADMIN);
  const ink0 = inkOf(u.uid);
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
    const r = await econ(u.token, 'buyTerm', { n });
    ok(r.res.err && inkOf(u.uid) === ink0, `买 ${n} 台终端机被拒绝`);
  }
  for (const c of ['c9', '__proto__', 'constructor', null]) ok((await econ(u.token, 'buyCase', { c })).res.err && inkOf(u.uid) === ink0, `买不存在的武器箱 ${c} 被拒绝`);
  for (const l of ['0123456789abcdef', '__proto__', 'constructor', { a: 1 }]) ok((await econ(u.token, 'buy', { l })).res.err && inkOf(u.uid) === ink0, `编出来的挂单 ${JSON.stringify(l)} 买不了`);
  ok((await econ(u.token, 'cancel', { l: '0123456789abcdef' })).res.err, '撤不存在的挂单什么也不做');
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
  ok(r.state.v === C.VER && s.v === C.VER && !('cw' in s) && s.od.n === 0 && s.pw.n === 0, '换成新版：每周买箱的次数去掉，今天还能开 2 个', s);
  ok(s.cases.c2 === 3 && s.cases.c3 === 1 && s.cases.c7 === 0 && s.term === 1, '武器箱和终端机照旧');
  ok(s.inv.length === 2 && !s.lst.length && s.inv.some(x => x.k === 'ls_plum' && x.st === 12) && s.nid > 2, '以前卖给系统的挂单撤下，饰品（连斩数）退回库存', [s.inv, s.lst]);
  ok(s.hist[0].g === 'c2' && s.hist[0].n === 3 && !('c' in s.hist[0]) && s.hist[1].k === 'qf_p1', '第 2 版的买箱记录换成新的写法', s.hist);
  ok((await econ(u.token, 'open', { c: 'c2' })).res.ok && (await econ(u.token, 'open', { c: 'c2' })).res.ok && (await econ(u.token, 'open', { c: 'c2' })).res.err, '接着开：今天开 2 个，第 3 个等明天');
}

section('第 3 版的武库存档：卖给系统的挂单全部退回，武器箱和终端机的挂单也退回');
{
  T = nextNoon();
  const u = await newUser('legacy3');
  await econ(u.token, 'sync');
  const v3 = { v: 3, tags: 0, term: 0, tm: null, nid: 5, gift: 1, cases: { c1: 0, c2: 0, c3: 0, c4: 1, c5: 0, c6: 0, c7: 0 }, inv: [], via: ['qf_p1'], eq: {},
    lst: [{ l: 'L1', it: { i: 1, k: 'qf_p1', st: 3, n: '', t: T - 1e6, src: 'case' }, price: 50, t: T - 1e5, at: T + 1e9 }, { l: 'L2', g: 'c4', price: 200, t: T - 1e5, at: T + 1e9 }, { l: 'L3', g: 'term', price: 300, t: T - 1e5, at: T + 1e9 }],
    hist: [], bought: { d: C.day(T), ids: ['x'] } };
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ? WHERE uid = ?').run(JSON.stringify(v3), u.uid);
  const s = (await econ(u.token, 'sync')).state;
  ok(s.v === C.VER && !s.lst.length && s.inv.length === 1 && s.inv[0].st === 3 && s.cases.c4 === 2 && s.term === 1 && !('bought' in s), '饰品、武器箱、终端机都退回来，“今天买过哪几单”也去掉', s);
  ok(!row('SELECT COUNT(*) AS n FROM mkt WHERE seller = ?', u.uid).n, '旧挂单不会出现在玩家市场上');
}

section('不能套利：系统不定饰品的价、也不收购；墨锭只有对局、补给、星章和卖给别的玩家能拿到');
{
  const income = ['matchEnd', 'supply', 'star', 'sellDupes'];   // 规则里会加墨锭的动作（加上结算挂单与出售重复饰品）
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
  ok(!gained.length, '除了对局、补给、星章，没有哪个动作能凭空加墨锭（开箱、汰换、终端机、商店都只花不赚）', gained.slice(0, 3));
  const e = env(), s = rich(); s.tm = { t0: T, n: 1, o: C.termOffer(R) };
  C.run(s, 'termBuy', { n: 1 }, e);
  ok(e.ink <= 1000, '终端机只能花钱买下，不能反过来卖给它');
  ok(C.TERM.markup[0] >= 1.2 && C.TIERS.every(t => C.BASE[t] > 0), `终端机报价不低于基准价的 ${C.TERM.markup[0]} 倍`);
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
    [{ give: Array.from({ length: 51 }, () => ({ k: 'qf_p1' })) }, /最多/],
  ]);
  ok(!bad.length && ver() === v1 && inkOf(P.uid) === i1, '17 种乱填都不改（扣成负数、超上限、小数、不存在的箱子和饰品、库存里没有的）；有一项不对，整个请求都不改', bad);
  const it = stateOf(P.uid).inv[0], l = await econ(P.token, 'list', { i: it.i, price: 99 });
  const tl = await adm('POST', '/api/admin/adjust', { uid: P.uid, take: [it.i], why: '测试' });
  ok(l.res.ok && tl.status === 400 && /市场/.test(tl.error), '挂在玩家市场上的收不了（要等玩家撤下或者卖掉）', tl.error);
  await econ(P.token, 'cancel', { l: l.res.l });
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
  const c0 = await adm('GET', '/api/admin/cfg');
  ok(c0.ok && c0.id === 0 && !Object.keys(c0.cfg).length && c0.info.length === C.CFG_INFO.length && !c0.hist.length, '一开始全是默认值', c0.id);
  const bad = await badInputs('/api/admin/cfg', { why: '乱填测试' }, [
    [{ set: { bogus: 1 } }, /不认识/], [{ set: { constructor: 1 } }, /不认识/], [{ set: { 'price.c1': 0 } }, /之间/], [{ set: { 'price.c1': 'abc' } }, /数字/],
    [{ set: { openDay: 2.5 } }, /整数/], [{ set: { fee: 0.9 } }, /之间/], [{ set: { 'odds.mil': 0.6 } }, /加起来/], [{ set: { 'prem.gold': 0.5 } }, /加起来/],
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
  ok(C.COLS.c1.price === 280 && C.FEE === 0.15 && C.OPEN_DAY === 2 && Object.isFrozen(C.CFG_DEF) && Object.isFrozen(C.CFG_INFO[0]) && C.CFG_DEF['price.c1'] === 280, '规则核心里写死的默认值一个没变（在线改的只存在数据库里）');
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
    const r = await call('POST', '/api/profile', { profile: { ...profOf(u.uid), rk, netWins: w, netLosses: l }, ledger: { deltas: [], ev: 0 } }, u.token);
    if (!r.ok) throw new Error('profile ' + JSON.stringify(r));
    return u;
  };
  const a = await mk('lbAlpha', { season: 'S1', pts: 9000, placed: 5 }, 12, 3);
  await mk('lbBeta', { season: 'S1', pts: 99999, placed: 7 }, 30, 1);
  await mk('lbGamma', { season: 'S1', pts: 20000, placed: 3 }, 0, 2);
  await mk('lbDelta', { season: 'S0', pts: 24000, placed: 9 }, 5, 5);
  const bad = await mk('lbEvil', { season: 'S1', pts: 24000, placed: 9 }, 99, 0);
  await adm('POST', '/api/admin/ban', { uid: bad.uid, days: 2, why: '测试排行榜' });
  const rk = await call('GET', '/api/leaderboard?k=rank&s=S1', undefined, a.token, '8.8.1.1');
  const names = (rk.list || []).map(r => r.name);
  ok(rk.ok && names.includes('lbAlpha') && names.includes('lbBeta') && !names.includes('lbGamma') && !names.includes('lbDelta') && !names.includes('lbEvil'),
    '段位榜：本赛季打满 5 场的上榜；没打满、上赛季、被封的不上', names);
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
  ok(a3.status === 200, '命令行（tools/econ-admin.mjs，不带 Origin）：能用');
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

section('管理后台的查询：总览、找号、操作记录、饰品目录');
{
  const st = await adm('GET', '/api/admin/stats');
  ok(st.ok && st.users === row('SELECT COUNT(*) AS n FROM users').n && st.inkTotal === row('SELECT SUM(ink) AS n FROM econ').n && st.accounts === row('SELECT COUNT(*) AS n FROM econ').n, '总览：注册数、武库存档数、全服墨锭对得上', st);
  const f1 = await adm('GET', '/api/admin/find?q=gift');
  ok(f1.ok && f1.users.length === 2 && f1.users.every(u => u.username.startsWith('giftee')), '按昵称开头找', f1.users.map(u => u.username));
  const f2 = await adm('GET', '/api/admin/find?q=' + encodeURIComponent('%')), f3 = await adm('GET', '/api/admin/find?q=_');
  ok(f2.users.length === 0 && f3.users.length === 0, '搜 % 和 _ 不会变成通配符');
  ok((await adm('GET', '/api/admin/find')).users.length === 20, '不填就列最近动过的 20 个');
  const cat = await adm('GET', '/api/admin/catalog');
  ok(cat.ok && cat.items.length === Object.keys(C.ITEM).length && cat.cols.length === 8 && cat.tiers.length === 5 && cat.cfg.length === C.CFG_INFO.length && cat.items.every(x => C.charOf(x.k) === x.char && C.ITEM[x.k].col === x.col), `饰品目录：${cat.items.length} 款饰品、8 个武器箱、5 档品质、能改的数值`);
  const au = await adm('GET', '/api/admin/audit'), acts = new Set(au.rows.map(r => r.act));
  ok(au.ok && ['admin', 'admin_ban', 'pardon', 'admin_pw', 'gift_new', 'gift_off', 'code_new', 'code_off', 'cfg'].every(a => acts.has(a)) && au.rows.every(r => !!(parseDetail(r.detail).by)), '操作记录：九种管理员操作都在，每条都写着是谁', [...acts]);
  ok(au.rows.some(r => r.uid === '*' && r.act === 'cfg') && !acts.has('open') && !acts.has('ledger') && !acts.has('gift_got') && !acts.has('code_got'), '全服的记在“全服”名下；玩家自己的操作不混进来');
}

section('管理网页：Worker 的 /admin；浏览器只许跑网页里那一段脚本');
{
  const res = await worker.fetch(new Request('https://w.test/admin'), ENV, { waitUntil() {} });
  const html = await res.text(), csp = res.headers.get('Content-Security-Policy') || '', scriptSrc = (/script-src ([^;]+)/.exec(csp) || [])[1] || '';
  ok(res.status === 200 && /text\/html/.test(res.headers.get('Content-Type')) && res.headers.get('X-Frame-Options') === 'DENY' && /frame-ancestors 'none'/.test(csp) && /connect-src 'self'/.test(csp) && /default-src 'none'/.test(csp), '回一个网页：不许被嵌进别的网页，只许连自己', csp);
  ok(scriptSrc && !scriptSrc.includes('unsafe'), '脚本不许 unsafe-inline（页面里混进来的脚本、onclick 跑不了）', scriptSrc);
  ok(!html.includes(ADMIN) && res.headers.get('Cache-Control') === 'no-store', '网页里没有口令，也不让缓存');
  if (FILE.includes('bundle')) {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)].map(m => m[1]);
    const sha = scripts.length === 1 ? createHash('sha256').update(scripts[0], 'utf8').digest('base64') : '';
    ok(scripts.length === 1 && scriptSrc === `'sha256-${sha}'`, '打包好的网页：CSP 里的 sha256 和页面里那一段脚本对得上（网页能跑）', [scripts.length, scriptSrc]);
    const names = JSON.parse((/const NAMES = (\{.*?\});/.exec(scripts[0]) || [])[1] || '{}');
    ok(Object.keys(C.ITEM).every(k => names.skins && names.skins[k]) && C.HERO_IDS.every(hh => names.heroes && names.heroes[hh]), '每件饰品、每个侠客在网页里都有名字');
  } else ok(scriptSrc === "'none'", '没打包的 worker.js：回一个说明页，不跑任何脚本');
}

section('以前的绑定皮肤：老号第一次动武库时换成库存里的饰品（只换一次），能卖；之后建的号、之后报上来的不换；星座码每个号只领一次');
{
  T = nextNoon();
  const old = await newUser('bindold', { skins: ['qf_gold', 'ts_bronze', 'qf_p1'], equip: { qingfeng: 'qf_gold' } });
  ok(profOf(old.uid).skins.includes('qf_gold') && !profOf(old.uid).skins.includes('qf_p1'), '注册带上来的：原版皮肤留着（绑定），武库专属的不认');
  ENV.DB.raw.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(Date.UTC(2026, 9, 1), old.uid);   // 截止日之前建的号
  await econ(old.token, 'sync');
  const s1 = stateOf(old.uid), lg = s1.inv.filter(x => x.src === 'legacy');
  ok(lg.length === 2 && lg.every(x => x.st === -1 && s1.via.includes(x.k)) && ['qf_gold', 'ts_bronze'].every(k => lg.some(x => x.k === k)), '两款绑定皮肤各换成一件普通版饰品，记进 via', s1.inv);
  ok(profOf(old.uid).skins.includes('qf_gold') && profOf(old.uid).equip.qingfeng === 'qf_gold', '换完照样能穿，穿着的不变');
  ok(row("SELECT COUNT(*) AS n FROM econ_log WHERE uid = ? AND act = 'legacy'", old.uid).n === 1, '流水记了一笔 legacy');
  await econ(old.token, 'sync');
  ok(stateOf(old.uid).inv.length === 2, '再动武库不会再换（每个号只换一次）');
  const up = await call('POST', '/api/profile', { profile: { ...profOf(old.uid), skins: [...profOf(old.uid).skins, 'yh_sakura'] }, ledger: { deltas: [], ev: 0 } }, old.token);
  await econ(old.token, 'sync');
  ok(up.ok && profOf(old.uid).skins.includes('yh_sakura') && !stateOf(old.uid).inv.some(x => x.k === 'yh_sakura'), '换过以后网页再报上来的皮肤不进库存（服务器核对不了，只能穿不能卖）');
  const gold = stateOf(old.uid).inv.find(x => x.k === 'qf_gold');
  const L = await econ(old.token, 'list', { i: gold.i, price: 321 });
  ok(L.res && L.res.ok, '换来的饰品能挂到玩家市场', L.res);
  const buyer = await newUser('bindbuyer', { ink: 2000 });
  await econ(buyer.token, 'sync');
  const by = await econ(buyer.token, 'buy', { l: L.res.l, price: 321 });
  ok(by.res && by.res.ok && stateOf(buyer.uid).inv.some(x => x.k === 'qf_gold') && profOf(buyer.uid).skins.includes('qf_gold'), '别的玩家买到了，能穿', by.res);
  await econ(old.token, 'sync');
  ok(!profOf(old.uid).skins.includes('qf_gold') && !profOf(old.uid).equip.qingfeng, '卖掉以后原来的号就穿不了了（不会卖了还留着）');

  const fresh = await newUser('bindnew', { skins: ['lm_violet'] });
  ENV.DB.raw.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(Date.UTC(2026, 10, 1), fresh.uid);
  await econ(fresh.token, 'sync');
  ok(!stateOf(fresh.uid).inv.length && profOf(fresh.uid).skins.includes('lm_violet'), '截止日以后建的号不换：皮肤照样能穿，库存里没有');

  // 写在源码里的星座码已作废：领不到；以前领过的号，码送的饰品第一次动武库时收回
  const zk = Object.keys(C.ITEM).filter(k => C.ITEM[k].col === 'c8');
  const z = await newUser('zodone', { ink: 100 });
  await econ(z.token, 'sync');
  const zr = await econ(z.token, 'claimCode', { code: 'ZODIAC2026STAR' });
  ok(zr.status === 400 && zr.error === '兑换码无效或已过期' && !stateOf(z.uid).inv.some(x => zk.includes(x.k)), '公开过的星座码已作废：领不到', zr);
  // 按作废前的样子摆好一个领过的号：code_got 有记录，库存里 3 件码送的、1 件开箱开的，还有 1 件码送的挂在市场上
  const zv = await newUser('zodvoid', { ink: 100 });
  await econ(zv.token, 'sync');
  const seed = (uid, items, lst) => {
    const st = stateOf(uid);
    for (const it of items) { st.inv.push({ i: st.nid++, k: it.k, st: -1, n: '', t: T, src: it.src }); if (!st.via.includes(it.k)) st.via.push(it.k); }
    for (const L of lst) { const it = { i: st.nid++, k: L.k, st: -1, n: '', t: T, src: 'code' }; st.lst.push({ l: L.l, it, price: 500, t: T });   // 挂出去的那件和正常挂单一样，不在可穿的皮肤里
      ENV.DB.raw.prepare('INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)').run(L.l, uid, L.k, -1, JSON.stringify(it), 500, T); }
    const srv = JSON.parse(row('SELECT srv_json FROM econ WHERE uid = ?', uid).srv_json); delete srv.zv;
    ENV.DB.raw.prepare('UPDATE econ SET state_json = ?, srv_json = ? WHERE uid = ?').run(JSON.stringify(st), JSON.stringify(srv), uid);
    const pf = profOf(uid); pf.skins = Array.from(new Set([...(pf.skins || []), ...items.map(x => x.k)]));
    ENV.DB.raw.prepare('UPDATE users SET profile_json = ? WHERE id = ?').run(JSON.stringify(pf), uid);
  };
  const zl = 'abcdef0123456789';
  seed(zv.uid, [{ k: zk[0], src: 'code' }, { k: zk[1], src: 'code' }, { k: zk[2], src: 'code' }, { k: zk[3], src: 'case' }], [{ k: zk[4], l: zl }]);
  ENV.DB.raw.prepare('INSERT INTO code_got (code, uid, at) VALUES (?, ?, ?)').run('ZODIAC2026STAR', zv.uid, T);
  const zs0 = await econ(zv.token, 'sync');
  const zst = stateOf(zv.uid), zpf = profOf(zv.uid);
  ok(zs0.ok && !zst.inv.some(x => x.src === 'code' && zk.includes(x.k)) && zst.inv.some(x => x.k === zk[3] && x.src === 'case'), '领过的号：码送的星座饰品收回，开箱开的留着', zst.inv);
  ok(!zst.lst.some(L => L.l === zl) && row('SELECT state FROM mkt WHERE id = ?', zl).state === 2, '码送的饰品挂在市场上还没卖的：撤下来', zst.lst);
  ok(![zk[0], zk[1], zk[2], zk[4]].some(k => zpf.skins.includes(k)) && zpf.skins.includes(zk[3]), '收回的皮肤穿不了了，开箱的照样能穿', zpf.skins);
  const zlog = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'code_void'", zv.uid), zld = zlog ? parseDetail(zlog.detail) : {};
  ok(zld.code && zld.code[0] === 'ZODIAC2026STAR' && zld.inv && zld.inv.length === 3 && zld.lst && zld.lst[0] === zl, '收回记一条 code_void 流水', zld);
  await econ(zv.token, 'sync');
  ok(row("SELECT COUNT(*) AS n FROM econ_log WHERE uid = ? AND act = 'code_void'", zv.uid).n === 1 && JSON.parse(row('SELECT srv_json FROM econ WHERE uid = ?', zv.uid).srv_json).zv, '只收一次（记在 srv.zv）');
  // 没领过这个码的号：后台礼包码送的星座饰品（也是 src 'code'）不动
  const zn = await newUser('zodnone', { ink: 100 });
  await econ(zn.token, 'sync');
  seed(zn.uid, [{ k: zk[5], src: 'code' }], []);
  await econ(zn.token, 'sync');
  ok(stateOf(zn.uid).inv.some(x => x.k === zk[5] && x.src === 'code') && !row("SELECT 1 AS x FROM econ_log WHERE uid = ? AND act = 'code_void'", zn.uid), '没领过星座码的号：别的码送的星座饰品不动');
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

section('全服肉鸽 · 天道 Boss 的星座皮肤：服务器核对账号后写进 gift 表，下次动武库领到；游客、新号、伤害不够、被封的没有；每号每天一件，同时发、同时领都不多');
{
  const { RG } = globalThis.RenyingWorldSim;
  const zod = k => !!C.ITEM[k] && C.ITEM[k].col === 'c8';
  const Z1 = await newUser('rouge1'), Z2 = await newUser('rouge2'), Z3 = await newUser('rouge3'), ZB = await newUser('rougebad');
  for (const u of [Z1, Z2, Z3, ZB]) await econ(u.token, 'sync');
  T += (RG.MIN_AGE_H + 1) * 3600e3;
  const Zn = await newUser('rougenew'); await econ(Zn.token, 'sync');   // 刚注册的号
  await adm('POST', '/api/admin/ban', { uid: ZB.uid, days: 2, why: '测试全服肉鸽' });
  const ctx = { socks: new Set(), acceptWebSocket() {}, getWebSockets() { return []; } };
  const line = new WorldLine(ctx, ENV), sim = line.sim;
  const join = async (name, tok) => { const id = sim.join({ name }); if (tok) await line.auth(id, tok); sim.players.get(id).jies = RG.JIE; return id; };
  const p1 = await join('甲', Z1.token), p2 = await join('乙', Z2.token), p3 = await join('丙', Z3.token), pn = await join('新', Zn.token),
    pb = await join('坏', ZB.token), pg = await join('游客'), pf = await join('乱填', 'not-a-token');
  ok(sim.players.get(p1).uid === Z1.uid && sim.players.get(pn).uid === Zn.uid, '登录令牌核对成云端账号');
  ok(!sim.players.get(pb).uid && !sim.players.get(pg).uid && !sim.players.get(pf).uid, '被封的号、游客、乱填的令牌都不认账号');
  const win = async (hits) => {
    sim.run.jie = RG.JIE; sim.run.key = null; sim.run.wait = false; sim.startKey();
    const k = sim.run.key; sim.t += 4;
    for (let i = 0; i < 2000 && sim.run.key; i++) { sim.t += 1; for (const [id, d] of hits) sim.keyHit(id, k.seq, d); }
    const list = sim.rewards; sim.rewards = []; await line.pay(list); return { k, list };
  };
  const { list } = await win([[p1, 200], [p2, 200], [p3, 5], [pn, 200], [pg, 200], [pb, 200]]);
  ok(list.map(r => r.uid).sort().join() === [Z1.uid, Z2.uid].sort().join(), '只有伤害够份额、注册满 24 小时的云端账号够资格（伤害太少的、新号、游客、被封的没有）', list);
  const g1 = ENV.DB.raw.prepare("SELECT * FROM gift WHERE uid = ? AND by = 'rouge'").all(Z1.uid);
  ok(g1.length === 1 && zod(JSON.parse(g1[0].items_json).skin) && g1[0].ink === RG.INK, `gift 表里写了一件星座饰品 + ${RG.INK} 墨锭`, g1);
  ok(ENV.DB.raw.prepare("SELECT COUNT(*) AS n FROM gift WHERE by = 'rouge' AND uid IN (?, ?, ?)").get(Z3.uid, Zn.uid, ZB.uid).n === 0, '不够资格的号 gift 表里没有');
  ok(row("SELECT COUNT(*) AS n FROM econ_log WHERE uid = ? AND act = 'rouge_zod'", Z1.uid).n === 1, '发奖记进流水（rouge_zod）');
  const inv0 = stateOf(Z1.uid).inv.length, ink0 = inkOf(Z1.uid);
  const rs = await Promise.all(Array.from({ length: 6 }, () => econ(Z1.token, 'sync')));
  const st1 = stateOf(Z1.uid), mine = st1.inv.filter(x => x.src === 'rouge');
  ok(rs.every(r => r.ok) && rs.filter(r => r.gifts).length === 1 && mine.length === 1 && st1.inv.length === inv0 + 1 && inkOf(Z1.uid) === ink0 + RG.INK, '同时发 6 个请求：只领到一件星座饰品和一份墨锭', [mine, inkOf(Z1.uid) - ink0]);
  ok(zod(mine[0].k) && mine[0].k === JSON.parse(g1[0].items_json).skin, '领到的就是写进 gift 表的那一件');
  ok(rs.find(r => r.gifts).gifts[0].skin === mine[0].k, '回复里带着是哪一件（网页弹提示用）');
  ok(!(await econ(Z1.token, 'sync')).gifts && stateOf(Z1.uid).inv.filter(x => x.src === 'rouge').length === 1, '再动武库不会再领');
  // 同一天再赢一次、两条线同时发：都不多
  await win([[p1, 200], [p2, 200]]);
  await Promise.all([line.pay([{ uid: Z2.uid, dmg: 1, cyc: 9 }]), line.pay([{ uid: Z2.uid, dmg: 1, cyc: 9 }]), line.pay([{ uid: Z1.uid, dmg: 1, cyc: 9 }])]);
  const n1 = ENV.DB.raw.prepare("SELECT COUNT(*) AS n FROM gift WHERE uid = ? AND by = 'rouge'").get(Z1.uid).n, n2 = ENV.DB.raw.prepare("SELECT COUNT(*) AS n FROM gift WHERE uid = ? AND by = 'rouge'").get(Z2.uid).n;
  ok(n1 === RG.ZOD_PER_DAY && n2 === RG.ZOD_PER_DAY, `同一天再赢、几条线同时发：每号每天还是只有 ${RG.ZOD_PER_DAY} 件`, [n1, n2]);
  T += 86400e3;
  await line.pay([{ uid: Z1.uid, dmg: 1, cyc: 10 }]);
  const r2 = await econ(Z1.token, 'sync'), mine2 = stateOf(Z1.uid).inv.filter(x => x.src === 'rouge');
  ok(r2.gifts && r2.gifts.length === 1 && mine2.length === 2 && mine2[0].k !== mine2[1].k, '第二天再赢：再领一件，优先给还没有的款', mine2.map(x => x.k));
  // 伤害封顶：一个人狂报伤害也打不死，3 秒后每秒最多算 RG.KEY_DPS
  sim.run.jie = RG.JIE; sim.startKey();
  const k = sim.run.key; sim.t += 3.5;
  let dealt = 0; for (let i = 0; i < 50; i++) dealt += sim.keyHit(p1, k.seq, 99999);
  ok(dealt <= RG.KEY_DPS && k.hp > k.mh - RG.KEY_DPS - 1, `一个人一口气狂报伤害，最多只算 ${RG.KEY_DPS}（算了 ${Math.round(dealt)}）`);
  sim.endKey(false);
  ok(!sim.rewards.length, '没打死就没有奖励');
  // 伪造：gift 里的 skin 不是星座款的不认
  ENV.DB.raw.prepare("INSERT INTO gift (id, uid, ink, items_json, note, by, at, until, born) VALUES ('fake1', ?, 0, ?, 'x', 'rouge', ?, ?, ?)").run(Z2.uid, JSON.stringify({ skin: 'qf_p1' }), T, T + 86400e3, T);
  const r3 = await econ(Z2.token, 'sync');
  ok(!stateOf(Z2.uid).inv.some(x => x.k === 'qf_p1' && x.src === 'rouge') && stateOf(Z2.uid).inv.filter(x => x.src === 'rouge').length === 1, '不是星座武器箱的款不会当奖励发出去', r3.gifts);
}

section('玩家市场挂单到期：挂太久没卖出的自动撤下，饰品退回卖家；到期的买不了；同时挂的单数以服务器为准');
{
  T = nextNoon();
  const days = C.cv((await adm('GET', '/api/admin/cfg')).cfg, 'mktDays');
  ok(days >= 1 && days <= 90, `挂单挂 ${days} 天（默认 ${C.MKT_DAYS} 天，后台能改）`, days);
  const S = await newUser('xseller'), B = await newUser('xbuyer', { ink: 5000 });
  for (const x of [S, B]) await econ(x.token, 'sync');
  const [a, b, c] = grant(S.uid, [{ k: 'gc_wolf' }, { k: 'qf_p1', st: 3 }, { k: 'yh_p1' }]);
  await econ(S.token, 'sync');
  const l1 = await econ(S.token, 'list', { i: a.i, price: 100 });
  const l2 = await econ(S.token, 'list', { i: b.i, price: 200 });
  const l3 = await econ(S.token, 'list', { i: c.i, price: 50 });
  ok([l1, l2, l3].every(r => r.res.ok), '挂了 3 单');
  T += (days - 1) * 86400e3;
  const bought = await econ(B.token, 'buy', { l: l3.res.l });
  ok(bought.res.ok, `第 ${days - 1} 天还在卖，买得到`, bought.res);
  ok((await market(B.token, 'gc_wolf')).open.length === 1, '行情里还看得到');
  T += 2 * 86400e3;
  const m = await market(B.token, 'gc_wolf');
  ok(m.ok && !m.open.length && !(m.items && m.items.gc_wolf), '过了期限：行情里看不到了（卖家还没回来也一样）', m.open);
  const ink0 = inkOf(B.uid), late = await econ(B.token, 'buy', { l: l1.res.l });
  ok(late.res.err && /到期|撤下/.test(late.res.err) && inkOf(B.uid) === ink0 && mrow(l1.res.l).state !== 1, '到期的单买不了，墨锭不动', late.res);
  ENV.DB.raw.prepare('DELETE FROM mkt WHERE id = ?').run(l2.res.l);   // 这一单已经被清理掉了（撤下一周后会删）
  const sy = await econ(S.token, 'sync');
  const st = stateOf(S.uid);
  ok(mrow(l1.res.l).state === 2, '卖家回来：到期那一单标成撤下');
  ok(!st.lst.length && st.inv.some(x => x.i === a.i) && st.inv.some(x => x.i === b.i && x.st === 3), '到期的、表里已经找不到的都退回库存（斩数跟着回来）', st);
  ok(!st.inv.some(x => x.i === c.i) && sy.sold.length === 1 && sy.sold[0].k === 'yh_p1', '到期前卖掉的照常结账，不会退回', sy.sold);
  ok(sy.back && sy.back.length === 2 && profOf(S.uid).skins.includes('gc_wolf'), '告诉网页退回了 2 件，皮肤又能穿了', sy.back);
  const lg = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'sync' ORDER BY id DESC LIMIT 1", S.uid);
  ok(lg && parseDetail(lg.detail).b === 2, '流水里记下退回了几件', lg);
  const again = await econ(S.token, 'sync');
  ok(!again.back && stateOf(S.uid).inv.filter(x => x.i === a.i).length === 1, '只退一次，不会多出一件');
  // 挂单上限按服务器的市场表算：存档里的挂单对不上（比如旧存档覆盖了）也挂不出第 21 件
  const fake = Array.from({ length: C.LIST_MAX }, (_, i) => ('f' + String(i).padStart(15, '0')));
  for (const id of fake) ENV.DB.raw.prepare('INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)').run(id, S.uid, 'qf_p1', -1, JSON.stringify({ i: 90000, k: 'qf_p1', st: -1 }), 10, T);
  const over = await econ(S.token, 'list', { i: a.i, price: 10 });
  ok(over.res.err && /最多同时挂/.test(over.res.err) && stateOf(S.uid).inv.some(x => x.i === a.i), `市场表里已经有 ${C.LIST_MAX} 单在卖：存档里没挂也不让再挂`, over.res);
  const overD = await econ(S.token, 'listDupes');
  ok(overD.res.err, '一键挂重复的也一样', overD.res);
  ENV.DB.raw.prepare("DELETE FROM mkt WHERE id LIKE 'f%' AND seller = ?").run(S.uid);
  ok((await econ(S.token, 'list', { i: a.i, price: 10 })).res.ok, '腾出位置以后照常能挂');
}

section('找回饰品：管理后台按流水查出“拿到过、现在没有”的饰品，写明是哪一步没的；只有去向不明、管理员收走的能找回，找回一次');
{
  T = nextNoon();
  const R = await newUser('restoree'), Bx = await newUser('rbuyer', { ink: 5000 });
  for (const x of [R, Bx]) await econ(x.token, 'sync');
  const mil = C.COLS.c1.mil[0];
  const g = await adm('POST', '/api/admin/adjust', { uid: R.uid, give: [{ k: 'gc_wolf' }, { k: 'qf_p1', st: 4 }, { k: 'yh_p1' }, { k: 'ts_p1' }, { k: 'ts_p1' }, ...Array.from({ length: 10 }, () => ({ k: mil }))], why: '找回演练：先发东西' });
  ok(g.ok && g.given.length === 15, '发了 15 件', g.error);
  const [wolf, bamboo, yh, ts1, ts2] = g.given, mils = g.given.slice(5);
  // 正常没的：汰换掉、一键卖掉重复的、在玩家市场卖掉、管理员收走
  const tr = await econ(R.token, 'trade', { ids: mils.map(x => x.i) });
  ok(tr.res.ok, '汰换掉 10 件', tr.res);
  const lg = parseDetail(row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'trade' ORDER BY id DESC LIMIT 1", R.uid).detail);
  ok(Array.isArray(lg.rm) && lg.rm.length === 10 && Array.isArray(lg.ad) && lg.ad.length === 1, '流水里记下了这一步出去的 10 件、进来的 1 件', lg);
  const sd = await econ(R.token, 'sellDupes');
  ok(sd.res.ok && sd.res.count === 1, '一键卖掉 1 件重复的', sd.res);
  const li = await econ(R.token, 'list', { i: yh.i, price: 30 });
  await econ(Bx.token, 'buy', { l: li.res.l });
  await econ(R.token, 'sync');
  const tk = await adm('POST', '/api/admin/adjust', { uid: R.uid, take: [bamboo.i], why: '找回演练：误收' });
  ok(tk.ok, '管理员收走斩数版竹影', tk.error);
  // 异常：存档出错，狼皮直接没了（流水里没有它的去向）
  const s0 = stateOf(R.uid); s0.inv = s0.inv.filter(x => x.i !== wolf.i);
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ?, ver = ver + 1 WHERE uid = ?').run(JSON.stringify(s0), R.uid);
  ok(!stateOf(R.uid).inv.some(x => x.i === wolf.i), '演练：删掉一件（狼皮）');
  const L = await adm('GET', '/api/admin/lost?uid=' + R.uid);
  const by = i => L.items.find(x => x.i === i);
  ok(L.ok && by(wolf.i) && by(wolf.i).why === 'unknown' && by(wolf.i).can && by(wolf.i).k === 'gc_wolf', '狼皮：去向不明，可以找回', by(wolf.i));
  ok(by(bamboo.i) && by(bamboo.i).why === 'admin' && by(bamboo.i).can && by(bamboo.i).st === 4, '管理员收走的：写明是谁收的那一步，可以找回（斩数照旧是 4）', by(bamboo.i));
  ok(by(yh.i) && by(yh.i).why === 'sold' && !by(yh.i).can, '在玩家市场卖掉的：不能找回', by(yh.i));
  ok(mils.every(x => by(x.i) && by(x.i).why === 'trade' && !by(x.i).can), '汰换掉的 10 件：不能找回');
  const sold1 = [ts1, ts2].map(x => by(x.i)).filter(Boolean);
  ok(sold1.length === 1 && sold1[0].why === 'sellDupes' && !sold1[0].can, '一键卖掉的那件重复的：不能找回', sold1);
  ok(!by(ts1.i) !== !by(ts2.i) && !L.items.some(x => x.i === tr.res.item.i), '还在库存里的不列出来');
  ok((await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [wolf.i] })).status === 400, '不写原因不让找回');
  const bad1 = await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [yh.i], why: '想多要一件' });
  ok(bad1.status === 400 && /不能找回/.test(bad1.error), '卖掉的不让找回', bad1.error);
  const bad2 = await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [tr.res.item.i], why: '还在库存里' });
  ok(bad2.status === 400, '还在库存里的不让找回', bad2.error);
  const rs = await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [wolf.i, bamboo.i], why: '找回演练：存档出错丢的' });
  ok(rs.ok && rs.items.length === 2 && rs.items.every(x => x.from === x.to), '找回 2 件，用回原来的编号', rs);
  const st = stateOf(R.uid);
  ok(st.inv.some(x => x.i === wolf.i && x.k === 'gc_wolf' && x.src === 'restore') && st.inv.some(x => x.i === bamboo.i && x.st === 4), '狼皮、斩数版竹影（斩数 4）回到库存', st.inv.map(x => x.i));
  ok(profOf(R.uid).skins.includes('gc_wolf'), '皮肤又能穿了');
  const rl = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'restore' ORDER BY id DESC LIMIT 1", R.uid);
  ok(rl && parseDetail(rl.detail).why === '找回演练：存档出错丢的' && parseDetail(rl.detail).items.length === 2, '流水记下谁、为什么、找回了哪几件', rl);
  const twice = await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [wolf.i], why: '再找一次' });
  ok(twice.status === 400 && stateOf(R.uid).inv.filter(x => x.k === 'gc_wolf').length === 1, '同一件找回不了第二次', twice.error);
  const L2 = await adm('GET', '/api/admin/lost?uid=' + R.uid);
  ok(!L2.items.some(x => x.i === wolf.i || x.i === bamboo.i), '找回以后不再列为找不到');
  const aud = await adm('GET', '/api/admin/audit');
  ok(aud.ok && aud.rows.some(r => r.act === 'restore' && r.uid === R.uid), '操作记录里看得到这次找回', aud.rows && aud.rows.slice(0, 3));
}

section('管理员账号和角色：先登录换 30 分钟的管理令牌；四种角色按接口放行；停用、改密码马上踢下线；都记进操作记录');
{
  const login = (body, ip = '5.6.0.1') => call('POST', '/api/admin/login', body, undefined, ip);
  const s0 = await login({ password: ADMIN });
  ok(s0.ok && s0.token.startsWith('as_') && s0.who === 'admin' && s0.role === 'all' && s0.expiresIn === 1800, '用 ADMIN_SECRET 口令登录：拿到 30 分钟的管理令牌，角色是全部', s0);
  ok(!row('SELECT 1 AS x FROM admin_sessions WHERE token = ?', s0.token) && row("SELECT COUNT(*) AS n FROM admin_sessions WHERE token LIKE 'h1:%'").n >= 1, '数据库里只存管理令牌的哈希');
  const w0 = await adm('GET', '/api/admin/whoami', undefined, s0.token);
  ok(w0.ok && w0.who === 'admin' && w0.role === 'all', '用管理令牌调接口', w0);
  ok((await adm('GET', '/api/admin/whoami')).role === 'all', '命令行直接带 ADMIN_SECRET 照旧能用（角色是全部）');
  ok((await login({ password: 'wrong-pass-0000000000' }, '5.6.0.2')).status === 403, '口令不对：登录不了');

  const mk = (name, role, pw, tok = s0.token) => adm('POST', '/api/admin/admins', { name, role, password: pw, why: '建管理员' }, tok);
  ok((await adm('POST', '/api/admin/admins', { name: 'viewer', role: 'view', password: 'viewer-pass-0001' }, s0.token)).status === 400, '建管理员也要写原因');
  ok((await mk('viewer', 'view', 'short')).status === 400, '密码少于 12 位不收');
  ok((await mk('admin', 'view', 'viewer-pass-0001')).status === 400, '名字不能和 ADMIN_SECRET 口令的名字重');
  ok((await mk('boss', 'god', 'viewer-pass-0001')).status === 400, '不认识的角色不收');
  const c1 = await mk('viewer', 'view', 'viewer-pass-0001');
  await mk('banker', 'econ', 'banker-pass-0002'); await mk('judge', 'ban', 'judge-pass-00003'); await mk('chief', 'all', 'chief-pass-00004');
  ok(c1.ok && c1.created && row("SELECT COUNT(*) AS n FROM admins").n === 4, '建了四个管理员账号', c1);
  const a1 = row("SELECT * FROM admins WHERE name = 'viewer'");
  ok(a1.password_algo.startsWith('pbkdf2') && !a1.password_hash.includes('viewer-pass') && a1.created_by === 'admin', '密码用 PBKDF2 存，记着是谁建的', a1);
  const list = await adm('GET', '/api/admin/admins', undefined, s0.token);
  ok(list.ok && list.admins.length === 4 && list.admins.every(a => !('password_hash' in a) && !('salt' in a)), '列表里没有密码', list.admins);

  const L = {};
  for (const [n, pw] of [['viewer', 'viewer-pass-0001'], ['banker', 'banker-pass-0002'], ['judge', 'judge-pass-00003'], ['chief', 'chief-pass-00004']]) L[n] = await login({ name: n, password: pw });
  ok(['viewer', 'banker', 'judge', 'chief'].every(n => L[n].ok && L[n].who === n), '四个账号都能用名字和密码登录', Object.values(L).map(x => x.role));
  ok((await login({ name: 'VIEWER', password: 'viewer-pass-0001' })).who === 'viewer', '名字不分大小写');
  ok((await login({ name: 'viewer', password: 'banker-pass-0002' }, '5.6.0.3')).status === 403 && (await login({ name: 'nobody', password: 'viewer-pass-0001' }, '5.6.0.3')).status === 403, '密码不对、没有这个人：都登录不了');
  ok(row("SELECT last_login FROM admins WHERE name = 'judge'").last_login === T, '记下最近登录的时间');

  const vic = await newUser('roletest');
  const can = async (n, method, path, body) => (await adm(method, path, body, L[n].token)).status;
  const adj = { uid: vic.uid, ink: 5, why: '角色测试' };
  ok(await can('viewer', 'GET', '/api/admin/stats') === 200 && await can('viewer', 'GET', '/api/admin/econ?uid=' + vic.uid) === 200, '只能看：所有查询都能看');
  const v403 = await adm('POST', '/api/admin/adjust', adj, L.viewer.token);
  ok(v403.status === 403 && v403.role === 'view' && inkOf(vic.uid) === inkOf(vic.uid), '只能看：加墨锭被拒（403，说明缺什么角色）', v403);
  ok(await can('viewer', 'POST', '/api/admin/ban', { uid: vic.uid, days: 1, why: 'x' }) === 403 && await can('viewer', 'POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'all', why: 'x' }) === 403, '只能看：封号、改开关都不行');
  const ink0 = inkOf(vic.uid);
  ok(await can('banker', 'POST', '/api/admin/adjust', adj) === 200 && inkOf(vic.uid) === ink0 + 5, '经济：能加墨锭');
  ok(await can('banker', 'POST', '/api/admin/ban', { uid: vic.uid, days: 1, why: 'x' }) === 403, '经济：不能封号');
  ok(await can('judge', 'POST', '/api/admin/adjust', adj) === 403, '封禁和账号：不能加墨锭');
  ok(await can('judge', 'POST', '/api/admin/ban', { uid: vic.uid, days: 1, why: '角色测试' }) === 200 && await can('judge', 'POST', '/api/admin/pardon', { uid: vic.uid, why: '角色测试' }) === 200, '封禁和账号：能封号、解封');
  ok(await can('judge', 'POST', '/api/admin/password', { uid: vic.uid, password: 'judge-set-pass-1', why: '角色测试' }) === 200, '封禁和账号：能重设玩家密码');
  ok(await can('judge', 'POST', '/api/admin/password', { uid: 'Dev', password: 'judge-set-pass-1', create: true, why: '角色测试' }) === 403 && await can('judge', 'POST', '/api/admin/password', { uid: 'Newbie9', password: 'judge-set-pass-1', create: true, why: '角色测试' }) === 403, '封禁和账号：不能建号、不能动 Dev（库存不受限）');
  ok(await can('judge', 'POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'dev', why: 'x' }) === 403 && await can('banker', 'GET', '/api/admin/admins') === 403 && await can('judge', 'POST', '/api/admin/admins', { name: 'x1', role: 'all', password: 'xxxxxxxxxxxxxx', why: 'x' }) === 403, '功能开关、管理员账号只有「全部」能动');
  ok(await can('chief', 'POST', '/api/admin/adjust', adj) === 200 && await can('chief', 'GET', '/api/admin/admins') === 200, '全部：都能做');
  const byBanker = parseDetail(row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'admin' ORDER BY id LIMIT 1", vic.uid).detail);
  ok(byBanker.by === 'banker', '操作记录里记的是管理员账号的名字', byBanker);

  ok((await adm('POST', '/api/admin/admins', { name: 'chief', role: 'econ', why: '降自己' }, L.chief.token)).status === 400 && (await adm('POST', '/api/admin/admins', { name: 'chief', disabled: true, why: '停自己' }, L.chief.token)).status === 400, '不能给自己降角色、不能停用自己');
  const re = await adm('POST', '/api/admin/admins', { name: 'banker', role: 'view', why: '降级' }, L.chief.token);
  ok(re.ok && !re.created && (await adm('GET', '/api/admin/whoami', undefined, L.banker.token)).role === 'view', '改了角色：已经登录的马上按新角色算');
  ok(await can('banker', 'POST', '/api/admin/adjust', adj) === 403, '降成只能看以后不能加墨锭了');
  const pwc = await adm('POST', '/api/admin/admins', { name: 'judge', password: 'judge-new-pass-9', why: '换密码' }, L.chief.token);
  ok(pwc.ok && pwc.role === 'ban' && (await adm('GET', '/api/admin/whoami', undefined, L.judge.token)).status === 401, '改了密码：已经登录的马上失效（401），角色不变');
  ok((await login({ name: 'judge', password: 'judge-pass-00003' }, '5.6.0.4')).status === 403 && (await login({ name: 'judge', password: 'judge-new-pass-9' })).ok, '旧密码不能用了，新密码能登录');
  await adm('POST', '/api/admin/admins', { name: 'viewer', disabled: true, why: '离职' }, L.chief.token);
  ok((await adm('GET', '/api/admin/whoami', undefined, L.viewer.token)).status === 401 && (await login({ name: 'viewer', password: 'viewer-pass-0001' }, '5.6.0.5')).status === 403, '停用了：已经登录的失效，也登录不了');
  await adm('POST', '/api/admin/admins', { name: 'viewer', disabled: false, why: '回来了' }, L.chief.token);
  ok((await login({ name: 'viewer', password: 'viewer-pass-0001' })).ok, '重新启用以后又能登录');

  const out = await adm('POST', '/api/admin/logout', {}, L.chief.token);
  ok(out.ok && (await adm('GET', '/api/admin/whoami', undefined, L.chief.token)).status === 401, '退出以后管理令牌就没用了');
  const s1 = await login({ name: 'chief', password: 'chief-pass-00004' });
  T += 29 * 60000;
  ok((await adm('GET', '/api/admin/whoami', undefined, s1.token)).ok, '29 分钟时还能用');
  T += 2 * 60000;
  const exp = await adm('GET', '/api/admin/whoami', undefined, s1.token);
  ok(exp.status === 401 && /重新登录/.test(exp.error), '30 分钟过了：401，要重新登录', exp);
  ok((await adm('GET', '/api/admin/whoami', undefined, 'as_' + 'f'.repeat(64))).status === 401, '编造的管理令牌不行');

  const logs = ENV.DB.raw.prepare("SELECT act, detail FROM econ_log WHERE act IN ('adm_login', 'adm_acct') ORDER BY id").all().map(r => ({ act: r.act, ...parseDetail(r.detail) }));
  ok(logs.some(l => l.act === 'adm_login' && l.by === 'admin' && l.how === 'secret') && logs.some(l => l.act === 'adm_login' && l.by === 'judge' && l.how === 'account'), '每次登录都记进流水（口令登录、账号登录分开写）');
  ok(logs.some(l => l.act === 'adm_acct' && l.name === 'banker' && l.from === 'econ' && l.role === 'view' && l.by === 'chief') && logs.some(l => l.act === 'adm_acct' && l.name === 'judge' && l.pw === 1) && !logs.some(l => JSON.stringify(l).includes('judge-new-pass')), '改管理员账号记进流水（谁改的、从什么改成什么），不记密码');
  const audit = await adm('GET', '/api/admin/audit');
  ok(audit.ok && audit.rows.some(r => r.act === 'adm_acct') && audit.rows.some(r => r.act === 'adm_login'), '管理后台「操作记录」里看得到这些');
  const fails = [];
  for (let i = 0; i < 21; i++) fails.push((await login({ name: 'chief', password: 'guess-guess-' + i }, '5.6.9.9')).status);
  ok(fails.slice(0, 20).every(s => s === 403) && fails[20] === 429 && (await login({ name: 'chief', password: 'chief-pass-00004' }, '5.6.9.9')).status === 429, '登录试错 20 次也锁一小时，和口令一样', fails.slice(-3));
}

section('删除账号（软删除）：登录不了、不上榜、挂单看不到，数据一样不动；恢复后什么都不丢；批量封号、解封、删除、恢复；导出 CSV');
{
  T = nextNoon();
  const raw = (path, tok = ADMIN) => worker.fetch(new Request('https://w.test' + path, { headers: { Authorization: 'Bearer ' + tok, 'CF-Connecting-IP': '1.2.3.4' } }), ENV, { waitUntil() {} });
  const batch = (body, tok = ADMIN) => adm('POST', '/api/admin/batch', body, tok);
  const D = await newUser('delme');
  await econ(D.token, 'sync');
  const [x1] = grant(D.uid, [{ k: 'qf_p2' }, { k: 'gc_wolf', st: 3 }]);
  const lst = await econ(D.token, 'list', { i: x1.i, price: 77 });
  await call('POST', '/api/profile', { profile: { ...profOf(D.uid), netWins: 40, netLosses: 1 }, ledger: { deltas: [], ev: 0 } }, D.token);
  const snap = () => ({
    user: (({ deleted_at, ...r }) => r)(row('SELECT * FROM users WHERE id = ?', D.uid)),
    econ: row('SELECT * FROM econ WHERE uid = ?', D.uid),
    log: ENV.DB.raw.prepare("SELECT * FROM econ_log WHERE uid = ? AND act NOT IN ('acct_del', 'acct_restore') ORDER BY id").all(D.uid),
    mkt: ENV.DB.raw.prepare('SELECT * FROM mkt WHERE seller = ? ORDER BY id').all(D.uid),
  });
  const before = snap();
  ok(lst.res.ok && before.econ && before.log.length > 0 && before.mkt.length === 1, '准备：这个号有武库、流水、一单在卖、战绩', { mkt: before.mkt.length, log: before.log.length });
  const wins0 = await call('GET', '/api/leaderboard?k=wins', undefined, undefined, '8.8.2.1');
  ok(wins0.list.some(r => r.name === 'delme'), '删除前在战绩榜上');

  ok((await batch({ op: 'delete', uids: [D.uid] })).status === 400, '删除要写原因');
  const del = await batch({ op: 'delete', uids: [D.uid], why: '玩家要求删号' });
  ok(del.ok && del.done.length === 1 && row('SELECT deleted_at FROM users WHERE id = ?', D.uid).deleted_at === T, '删除：只记下删除时间', del);
  ok((await call('GET', '/api/profile', undefined, D.token)).status === 401 && !row('SELECT 1 AS x FROM sessions WHERE user_id = ?', D.uid), '删除以后已经登录的设备都退出了');
  const li = await call('POST', '/api/login', { username: 'delme', password: 'secret123' }, undefined, '8.8.2.2');
  ok(li.status === 403 && li.deleted === true && /删除/.test(li.error), '密码对了也登录不了，说明是删除了', li);
  ok(row("SELECT note FROM auth_log WHERE uid = ? AND act = 'login_fail' ORDER BY id DESC LIMIT 1", D.uid).note === 'deleted', '登录记录里写着是删除了的号');
  ok(/已被注册/.test((await call('POST', '/api/register', { username: 'delme', password: 'secret123' }, undefined, '8.8.2.3')).error), '昵称还占着：别人注册不了，恢复不会撞名');
  const wins1 = await call('GET', '/api/leaderboard?k=wins', undefined, undefined, '8.8.2.4');
  ok(!wins1.list.some(r => r.name === 'delme') && wins1.players === wins0.players - 1, '不上排行榜，玩家总数也不算它');
  const viewer = await newUser('mktlooker');
  const mq = await market(viewer.token, 'qf_p2');
  ok(mq.ok && mq.open.length === 0 && !mq.open.some(o => o.l === lst.res.l) && mrow(lst.res.l).state === 0, '挂的单别人看不到（表里还在，没动）');
  const st = await adm('GET', '/api/admin/stats');
  ok(st.deleted >= 1, '总览里数得到删除了的号', st.deleted);
  const fd = await adm('GET', '/api/admin/find?q=delme'), fdel = await adm('GET', '/api/admin/find?del=1');
  ok(fd.users[0].deleted_at === T && fdel.users.some(u => u.id === D.uid) && fdel.users.every(u => u.deleted_at > 0), '找号能看到删除时间，也能只看删除了的');
  ok((await adm('GET', '/api/admin/econ?uid=' + D.uid)).deletedAt === T, '账号详情写着删除了');
  ok((await batch({ op: 'delete', uids: [D.uid], why: '再删一次' })).skip[0].why === '已经删除了', '删过的再删：跳过，说明原因');
  const mid = snap();
  ok(JSON.stringify(mid) === JSON.stringify(before), '删除期间：账号、武库、流水、市场记录一个字都没变');

  T += 3600e3;
  const res = await batch({ op: 'restore', uids: [D.uid], why: '玩家回来了' });
  ok(res.ok && res.done.length === 1 && row('SELECT deleted_at FROM users WHERE id = ?', D.uid).deleted_at === 0, '恢复', res);
  ok(JSON.stringify(snap()) === JSON.stringify(before), '恢复以后数据和删除前一模一样，什么都没丢');
  const li2 = await call('POST', '/api/login', { username: 'delme', password: 'secret123' }, undefined, '8.8.2.5');
  ok(li2.ok && li2.uid === D.uid, '原来的密码照常登录');
  const s2 = await econ(li2.token, 'sync');
  ok(s2.ok && s2.state.inv.length === 1 && s2.state.lst.length === 1 && s2.ledger.ink === before.econ.ink, '武库、在卖的单、墨锭都还在', s2.state && s2.state.inv.length);
  const mq2 = await market(viewer.token, 'qf_p2');
  ok(mq2.open.some(o => o.l === lst.res.l), '挂的单又看得到了');
  ok((await call('GET', '/api/leaderboard?k=wins', undefined, undefined, '8.8.2.6')).list.some(r => r.name === 'delme'), '又上排行榜了');
  ok((await batch({ op: 'restore', uids: [D.uid], why: '再恢复' })).skip[0].why === '没有删除', '没删的恢复：跳过');
  const lg = ENV.DB.raw.prepare("SELECT act, detail FROM econ_log WHERE uid = ? AND act IN ('acct_del', 'acct_restore') ORDER BY id").all(D.uid).map(r => ({ act: r.act, ...parseDetail(r.detail) }));
  ok(lg.length === 2 && lg[0].by === 'admin' && lg[0].why === '玩家要求删号' && lg[1].since > 0, '删除、恢复各记一条流水（谁、原因、什么时候删的）', lg);
  const au = await adm('GET', '/api/admin/audit');
  ok(au.rows.some(r => r.act === 'acct_del' && r.uid === D.uid) && au.rows.some(r => r.act === 'acct_restore'), '「操作记录」里看得到');

  const us = [await newUser('sdbulk1'), await newUser('sdbulk2'), await newUser('sdbulk3')];
  const ids = us.map(u => u.uid);
  const bb = await batch({ op: 'ban', uids: [...ids, 'nobody-here', ids[0]], days: 2, why: '批量封号测试' });
  ok(bb.ok && bb.done.length === 3 && bb.skip.length === 1 && bb.skip[0].why === '没有这个账号', '批量封号：3 个号封上，没有的号跳过，重复的只算一次', bb);
  ok(ids.every(id => row('SELECT ban_until FROM sanctions WHERE uid = ?', id).ban_until === T + 2 * 86400e3), '每个号都封到两天后');
  ok((await econ(us[1].token, 'sync')).status === 403, '封了的号不能动武库');
  const bp = await batch({ op: 'pardon', uids: ids, why: '批量解封测试' });
  ok(bp.done.length === 3 && ids.every(id => row('SELECT ban_until, perm FROM sanctions WHERE uid = ?', id).ban_until === 0), '批量解封');
  const bperm = await batch({ op: 'ban', uids: [ids[2]], perm: true, why: '永久' });
  ok(bperm.ok && row('SELECT perm FROM sanctions WHERE uid = ?', ids[2]).perm === 1, '批量也能永久封');
  await batch({ op: 'pardon', uids: [ids[2]], why: '解开' });
  const bd = await batch({ op: 'delete', uids: ids, why: '批量删除测试' });
  ok(bd.done.length === 3 && ids.every(id => row('SELECT deleted_at FROM users WHERE id = ?', id).deleted_at > 0), '批量删除');
  ok((await batch({ op: 'restore', uids: ids, why: '批量恢复测试' })).done.length === 3 && ids.every(id => row('SELECT deleted_at FROM users WHERE id = ?', id).deleted_at === 0), '批量恢复');
  ok((await batch({ op: 'ban', uids: ids, why: '没写天数' })).status === 400 && (await batch({ op: 'nuke', uids: ids, why: 'x1' })).status === 400, '封号没写天数、不认识的操作：不收');
  ok((await batch({ op: 'pardon', uids: Array.from({ length: 101 }, (_, i) => 'u_' + i), why: '太多了' })).status === 400 && (await batch({ op: 'pardon', uids: [], why: '空的' })).status === 400, '一次 1 到 100 个');
  const vw = await call('POST', '/api/admin/login', { password: ADMIN }, undefined, '5.6.1.1');
  await adm('POST', '/api/admin/admins', { name: 'looker', role: 'view', password: 'looker-pass-0001', why: '测试' }, vw.token);
  await adm('POST', '/api/admin/admins', { name: 'judge2', role: 'ban', password: 'judge2-pass-0001', why: '测试' }, vw.token);
  const lk = await call('POST', '/api/admin/login', { name: 'looker', password: 'looker-pass-0001' }, undefined, '5.6.1.1');
  const jd = await call('POST', '/api/admin/login', { name: 'judge2', password: 'judge2-pass-0001' }, undefined, '5.6.1.1');
  ok((await batch({ op: 'delete', uids: [ids[0]], why: '只能看' }, lk.token)).status === 403, '只能看：批量操作不行');
  const jdel = await batch({ op: 'delete', uids: [ids[0], 'Dev'], why: '封禁和账号' }, jd.token);
  ok(jdel.done.length === 1 && jdel.skip.some(x => x.name === 'Dev' && /全部/.test(x.why)), '封禁和账号：能删普通号，删 Dev 要「全部」', jdel);
  await batch({ op: 'restore', uids: [ids[0]], why: '恢复' }, jd.token);

  legacyUser('u_csvformula1', '=HYPERLINK("x")', {});
  const ex = await raw('/api/admin/export');
  const bytes = new Uint8Array(await ex.clone().arrayBuffer()), csv = await ex.text(), lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  ok(ex.status === 200 && /text\/csv/.test(ex.headers.get('Content-Type')) && /attachment; filename="renying-users-\d{4}-\d\d-\d\d\.csv"/.test(ex.headers.get('Content-Disposition')) && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, '导出 CSV：是附件，开头有 BOM（Excel 打开中文不乱码）');
  ok(lines[0] === 'uid,username,created_at,updated_at,econ_at,ink,strikes,ban,deleted_at' && lines.length - 1 === row('SELECT COUNT(*) AS n FROM users').n, '第一行是表头，一个号一行', lines[0]);
  ok(lines.some(l => l.startsWith('u_csvformula1,"\'=HYPERLINK(""x"")"')), '= 开头的昵称前面加了 \'，Excel 不会当成公式；引号转义了', lines.find(l => l.startsWith('u_csvformula1')));
  ok(lines.find(l => l.startsWith(ids[2] + ',')).split(',')[6] === '0' && !lines.some(l => /secret|password|salt/i.test(l)), '没有密码、盐这些');
  await batch({ op: 'delete', uids: [ids[1]], why: '导出测试' });
  const ex2 = (await (await raw('/api/admin/export?del=1')).text()).replace(/^﻿/, '').trim().split('\r\n');
  ok(ex2.length - 1 === row('SELECT COUNT(*) AS n FROM users WHERE deleted_at > 0').n && ex2.slice(1).every(l => /Z$/.test(l)), 'del=1 只导出删除了的（最后一列是删除时间）');
  const ex3 = (await (await raw('/api/admin/export?q=sdbulk')).text()).replace(/^﻿/, '').trim().split('\r\n');
  ok(ex3.length === 4 && ex3.slice(1).every(l => /,sdbulk\d,/.test(l)), '按昵称开头导出', ex3.length);
  ok((await raw('/api/admin/export', lk.token)).status === 403, '只能看：不能导出');
  ok(row("SELECT COUNT(*) AS n FROM econ_log WHERE act = 'acct_export'").n === 3 && parseDetail(row("SELECT detail FROM econ_log WHERE act = 'acct_export' ORDER BY id DESC LIMIT 1").detail).n === 3, '每次导出记一条流水（导了几个）');
  await batch({ op: 'restore', uids: [ids[1]], why: '收尾' });
}

section('数据库迁移：cloudflare/migrations/ 按编号跑，记在 schema_migrations；空库、以前的库都能升到一样的结构；同时跑不重复；出错整个退回');
{
  const fresh = async () => (await import(new URL(FILE, ROOT).href + '?m=' + Math.random())).default;   // 新的模块 = 新的 Worker 实例
  const { MIGRATIONS } = await import(new URL('cloudflare/migrations.gen.js', ROOT));
  const hit1 = (w, env, ip = '6.6.6.' + Math.floor(Math.random() * 250)) => w.fetch(new Request('https://w.test/api/flags', { headers: { 'CF-Connecting-IP': ip } }), env, { waitUntil() {} });
  const cols = (db, t) => db.prepare(`SELECT name, type, "notnull" AS nn, dflt_value AS d, pk FROM pragma_table_info('${t}')`).all().map(r => [r.name, r.type, r.nn, r.d, r.pk].join('|')).sort();
  const tables = db => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  const indexes = db => db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  const tsql = (db, t) => db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(t).sql;
  const ref = new DatabaseSync(':memory:');
  ref.exec(readFileSync(new URL('cloudflare/schema.sql', ROOT), 'utf8'));
  const applied = db => db.prepare('SELECT id, name, sum FROM schema_migrations ORDER BY id').all().map(r => ({ ...r }));
  const sameAsRef = (db, label) => {
    const want = tables(ref), have = tables(db).filter(t => t !== 'schema_migrations');
    ok(JSON.stringify(want) === JSON.stringify(have), label + '：表和 cloudflare/schema.sql 一样', { missing: want.filter(t => !have.includes(t)), extra: have.filter(t => !want.includes(t)) });
    const diff = want.filter(t => have.includes(t) && JSON.stringify(cols(ref, t)) !== JSON.stringify(cols(db, t)));
    ok(!diff.length, label + '：每张表的列（类型、非空、默认值、主键）都一样', diff.map(t => ({ t, ref: cols(ref, t), db: cols(db, t) })));
    ok(JSON.stringify(indexes(ref)) === JSON.stringify(indexes(db)), label + '：索引一样', { ref: indexes(ref), db: indexes(db) });
    const checks = ['econ', 'mkt', 'sanctions'].filter(t => (tsql(db, t).match(/CHECK/g) || []).length !== (tsql(ref, t).match(/CHECK/g) || []).length);
    ok(!checks.length, label + '：武库存档、市场、处罚三张表带着 CHECK 约束', checks);
  };

  // 1. 空库
  const e1 = { DB: makeD1(), ADMIN_SECRET: ADMIN };
  e1.DB.raw.exec('PRAGMA foreign_keys = ON');   // D1 默认开着外键
  const r1 = await hit1(await fresh(), e1);
  const ap1 = applied(e1.DB.raw);
  ok(r1.status === 200 && ap1.length === MIGRATIONS.length && ap1.every((m, i) => m.id === i + 1 && m.name === MIGRATIONS[i].name && m.sum === MIGRATIONS[i].sum), '空库：第一次请求把迁移按编号全跑了，记在 schema_migrations', ap1.map(m => m.name));
  ok(MIGRATIONS.length >= 6 && MIGRATIONS.every((m, i) => /^\d{4}_[a-z0-9_]+$/.test(m.name) && +m.name.slice(0, 4) === i + 1), '迁移文件从 0001 连续编号', MIGRATIONS.map(m => m.name));
  sameAsRef(e1.DB.raw, '空库');
  const reg1 = await e1.DB.batch([e1.DB.prepare("INSERT INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES ('u1', '{}', '{}', 5, 0, 0)")]);
  const bad = sql => { try { e1.DB.raw.exec(sql); return false; } catch (e) { return /CHECK/i.test(e.message); } };
  ok(reg1 && bad("UPDATE econ SET ink = -1 WHERE uid = 'u1'") && bad("INSERT INTO mkt (id, seller, k, st, item_json, price, at, state) VALUES ('m1', 'u1', 'qf_p1', -1, '{}', 10, 0, 7)")
    && bad("INSERT INTO mkt (id, seller, k, st, item_json, price, at) VALUES ('m2', 'u1', 'qf_p1', -1, '{}', 0, 0)") && bad("INSERT INTO sanctions (uid, strikes) VALUES ('u1', -2)"),
    'CHECK 挡得住：负墨锭、不认识的挂单状态、0 标价、负的记过次数都存不进去');
  const r1b = await hit1(await fresh(), e1);
  ok(r1b.status === 200 && applied(e1.DB.raw).length === MIGRATIONS.length, '再来一个 Worker 实例：没有要跑的，不重跑');

  // 2. 迁移文件出现以前的库：以前的 Worker 启动时建的表（0001）和后来加的列（0002 ~ 0004），没有 schema_migrations；里面有数据
  const e2 = { DB: makeD1(), ADMIN_SECRET: ADMIN }, d2 = e2.DB.raw;
  d2.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS.slice(0, 4)) for (const sql of m.sql) { try { d2.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
  const pr = await (await fresh()).fetch(new Request('https://w.test/api/health'), e2, { waitUntil() {} });   // 健康检查不碰数据库
  ok(pr.status === 200 && !tables(d2).includes('schema_migrations'), '准备：一个老库（没有 schema_migrations）');
  d2.exec(`INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at) VALUES ('u_old1', 'oldtimer', 'h', 's', '{"name":"oldtimer"}', 1, 2);
    INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${'a'.repeat(64)}', 'u_old1', ${T}, ${T + 86400e3});
    INSERT INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES ('u_old1', '{"v":1}', '{}', 1234, 7, 3), ('u_neg', '{}', '{}', -5, 1, 3);
    INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, buyer, done_at, paid, tx) VALUES ('mk1', 'u_old1', 'qf_p1', -1, '{"i":1}', 50, 4, 0, NULL, NULL, 0, 't1'), ('mk2', 'u_old1', 'qf_p1', 3, '{"i":2}', 80, 5, 1, 'u_x', 6, 1, 't2'), ('mk3', 'u_old1', 'qf_p1', -1, '{"i":3}', 80, 5, 9, NULL, NULL, 2, NULL);
    INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES ('u_old1', 2, 99, 0, '[{"r":"x"}]', 8, 0);
    INSERT INTO econ_log (uid, at, act, ok, detail) VALUES ('u_old1', 9, 'sync', 1, '{}');`);
  const before2 = { econ: d2.prepare("SELECT * FROM econ WHERE uid = 'u_old1'").get(), mkt: d2.prepare("SELECT * FROM mkt WHERE id IN ('mk1', 'mk2') ORDER BY id").all(), sanc: d2.prepare('SELECT * FROM sanctions').all(), log: d2.prepare('SELECT * FROM econ_log').all(), users: d2.prepare('SELECT * FROM users').all() };
  const r2 = await hit1(await fresh(), e2);
  ok(r2.status === 200 && applied(d2).length === MIGRATIONS.length, '老库：第一次请求把迁移全跑完（以前加过的列跳过，不报错）', applied(d2).map(m => m.name));
  sameAsRef(d2, '老库');
  const after2 = { econ: d2.prepare("SELECT * FROM econ WHERE uid = 'u_old1'").get(), mkt: d2.prepare("SELECT * FROM mkt WHERE id IN ('mk1', 'mk2') ORDER BY id").all(), sanc: d2.prepare('SELECT * FROM sanctions').all(), log: d2.prepare('SELECT * FROM econ_log').all(), users: d2.prepare('SELECT * FROM users').all().map(({ deleted_at, ...r }) => r) };
  ok(JSON.stringify(after2) === JSON.stringify(before2), '老库的数据一行没丢、一个字没变（武库、市场、处罚、流水、账号）');
  ok(d2.prepare('SELECT deleted_at FROM users').get().deleted_at === 0, '新加的 deleted_at 列，老号都是 0（没删）');
  ok(d2.prepare('SELECT COUNT(*) AS n FROM sessions').get().n === 1, '重建三张表没有连带删掉登录（外键开着也没事）');
  ok(d2.prepare("SELECT ink FROM econ WHERE uid = 'u_neg'").get().ink === 0 && d2.prepare("SELECT state, paid FROM mkt WHERE id = 'mk3'").get().state === 2 && d2.prepare("SELECT paid FROM mkt WHERE id = 'mk3'").get().paid === 1, '不合规的老数据夹回范围里：负墨锭当 0、不认识的挂单状态当撤下');
  const pf = await (await fresh()).fetch(new Request('https://w.test/api/profile', { headers: { Authorization: 'Bearer ' + 'a'.repeat(64), 'CF-Connecting-IP': '6.6.7.1' } }), e2, { waitUntil() {} });
  ok(pf.status === 200 && (await pf.json()).uid === 'u_old1', '升级以后老号的登录照样能用');

  // 3. 更早的库：users 没有密码那两列，errs 没有耗时，sessions 没有设备
  const e3 = { DB: makeD1(), ADMIN_SECRET: ADMIN }, d3 = e3.DB.raw;
  d3.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, profile_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE errs (sig TEXT PRIMARY KEY, kind TEXT NOT NULL, msg TEXT NOT NULL, src TEXT NOT NULL, stack TEXT NOT NULL, meta TEXT NOT NULL, n INTEGER NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL);
    INSERT INTO users VALUES ('u_anc', 'ancient', 'h', 's', '{}', 1, 1);`);
  const r3 = await hit1(await fresh(), e3);
  ok(r3.status === 200 && applied(d3).length === MIGRATIONS.length, '更早的库：缺的列一个个补上');
  sameAsRef(d3, '更早的库');
  ok(d3.prepare('SELECT password_algo, deleted_at FROM users').get().password_algo === 'sha256-v1', '老号的密码存法记成 sha256-v1（下次登录换成 PBKDF2）');

  // 3b. 读不了表结构（万一 D1 不让用 pragma_table_info）：ALTER 单独试，已经有的列照样跳过
  const e3b = { DB: makeD1(), ADMIN_SECRET: ADMIN }, d3b = e3b.DB.raw, prep = e3b.DB.prepare;
  e3b.DB.prepare = sql => { if (/pragma_table_info/.test(sql)) throw new Error('not authorized'); return prep(sql); };
  for (const m of MIGRATIONS.slice(0, 4)) for (const sql of m.sql) { try { d3b.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
  const r3b = await hit1(await fresh(), e3b);
  ok(r3b.status === 200 && applied(d3b).length === MIGRATIONS.length, '读不了表结构也能升级（ALTER 单独试，重复的列跳过）');
  sameAsRef(d3b, '读不了表结构');

  // 4. 两个 Worker 实例同时碰到空库：每个迁移只跑一次，两个请求都成功
  const e4 = { DB: makeD1(), ADMIN_SECRET: ADMIN };
  const [wa, wb, wc] = [await fresh(), await fresh(), await fresh()];
  const rs = await Promise.all([hit1(wa, e4), hit1(wb, e4), hit1(wc, e4)]);
  ok(rs.every(r => r.status === 200) && applied(e4.DB.raw).length === MIGRATIONS.length, '三个实例同时跑：都成功，每个迁移只记一次', rs.map(r => r.status));
  sameAsRef(e4.DB.raw, '同时跑');

  // 5. 中途出错：整个迁移退回，什么都不改；修好以后下一次请求接着跑
  const e5 = { DB: makeD1(), ADMIN_SECRET: ADMIN }, d5 = e5.DB.raw;
  for (const m of MIGRATIONS.slice(0, 5)) for (const sql of m.sql) { try { d5.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
  d5.exec("INSERT INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES ('u5', '{}', '{}', 9, 0, 0); CREATE TABLE mkt_new (x INTEGER)");   // 占住 0006 要用的表名
  const w5 = await fresh(), warn0 = console.error, warn1 = console.warn;
  console.error = () => {}; console.warn = () => {};
  const r5 = await hit1(w5, e5);
  console.error = warn0; console.warn = warn1;
  ok(r5.status >= 500 && applied(d5).length === 5 && !applied(d5).some(m => m.id === 6), '0006 出错：这次请求报错，0001 ~ 0005 记上了，0006 没记', { status: r5.status, ap: applied(d5).map(m => m.id) });
  ok(!/CHECK/.test(tsql(d5, 'econ')) && tables(d5).includes('econ') && d5.prepare("SELECT ink FROM econ WHERE uid = 'u5'").get().ink === 9 && !tables(d5).includes('econ_new'), '0006 整个退回：econ 还是原来那张表，数据都在，没有留下半截');
  d5.exec('DROP TABLE mkt_new');
  const r5b = await hit1(w5, e5);
  ok(r5b.status === 200 && applied(d5).length === MIGRATIONS.length && /CHECK/.test(tsql(d5, 'econ')), '修好以后同一个实例下一次请求接着跑完');

  // 6. 跑过的文件又改了：不重跑，日志里提示
  e1.DB.raw.exec("UPDATE schema_migrations SET sum = 'changed' WHERE id = 1");
  const warns = [], ow = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  const r6 = await hit1(await fresh(), e1);
  console.warn = ow;
  ok(r6.status === 200 && warns.some(w => /0001_init/.test(w) && /新的迁移文件/.test(w)), '改过跑过的迁移文件：照常服务，日志提示要加新文件', warns);
}

section('联机 ICE 列表：没配 TURN 只回 STUN；配了就带上短时凭据；拿凭据失败也照样回 STUN');
{
  const realFetch = globalThis.fetch;
  const r0 = await call('GET', '/api/ice', undefined, null, '7.7.7.1');
  ok(r0.ok && r0.turn === false && r0.iceServers.length === 1 && r0.iceServers[0].urls.every(u => u.startsWith('stun:')), '没设 TURN 的 Secret：只有 STUN', r0);
  let asked = null;
  globalThis.fetch = async (url, opts) => {
    asked = { url: String(url), auth: opts.headers.Authorization, body: JSON.parse(opts.body) };
    return new Response(JSON.stringify({ iceServers: { urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u1', credential: 'c1' } }), { status: 201 });
  };
  ENV.TURN_KEY_ID = 'kid'; ENV.TURN_KEY_API_TOKEN = 'tok';
  const r1 = await call('GET', '/api/ice', undefined, null, '7.7.7.2');
  const t = r1.iceServers && r1.iceServers.find(x => x.username);
  ok(r1.turn === true && t && t.credential === 'c1' && t.urls.length === 2 && t.urls.every(u => /^turns?:/.test(u)), '设了 Secret：带上 TURN 地址和凭据（只留 turn/turns）', r1);
  ok(asked && asked.url.includes('/turn/keys/kid/credentials/generate') && asked.auth === 'Bearer tok' && asked.body.ttl > 0 && asked.body.ttl <= 86400, '用短时凭据：向 Cloudflare 要的是几小时就过期的', asked);
  globalThis.fetch = async () => new Response('boom', { status: 500 });
  const r2 = await call('GET', '/api/ice', undefined, null, '7.7.7.3');
  ok(r2.ok && r2.turn === false && r2.iceServers.length === 1, 'Cloudflare 那边出错：退回只有 STUN，不报错', r2);
  globalThis.fetch = async () => { throw new Error('offline'); };
  const r3 = await call('GET', '/api/ice', undefined, null, '7.7.7.3');
  ok(r3.ok && r3.turn === false, '连不上 Cloudflare：同样退回 STUN', r3);
  let n429 = 0; for (let i = 0; i < 62; i++) { const r = await call('GET', '/api/ice', undefined, null, '7.7.7.9'); if (r.status === 429) n429++; }
  ok(n429 === 2, '同一个 IP 一小时最多要 60 次', n429);
  globalThis.fetch = realFetch; delete ENV.TURN_KEY_ID; delete ENV.TURN_KEY_API_TOKEN;
}

console.log(`\n${pass} 项通过，${fail} 项失败`);
Date.now = realNow;
process.exit(fail ? 1 : 0);
