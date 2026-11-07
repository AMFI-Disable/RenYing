// 武库经济 + 反作弊的服务器测试：在本机把 cloudflare/worker.js 跑起来（D1 用 node:sqlite 模拟），
// 正常流程走一遍，再按作弊的路数打一遍：改墨锭、伪造皮肤、重放请求、并发双花（同一件同时卖、同一单同时买、买和撤撞上）、
// 乱填参数、刷开箱次数、刷货郎、乱报斩数、刷对局奖励、爆破密码……
// 全服肉鸽的星座皮肤：服务器写 gift 表、下次动武库领到；游客、新号、伤害不够的没有；每号每天一件；同时领、同时发都不会多。
// 还有管理后台：管理口令、加减墨锭和东西、封号解封、全服补偿、兑换码、在线改经济数值、管理网页。
// 用法：node tools/tests/econ-test.mjs           （Node 22 以上，不用装任何包）
//       node tools/tests/econ-test.mjs --bundle  测打包好的 cloudflare/worker.bundle.js（真正部署上去的那个文件）
//
// 这一段是公共准备，后面 10-、20-… 各段都直接用这里定义的东西：
//   T（测试里的"现在"，往后拨就能跨天）、ENV（假 D1 + 管理口令）、call / econ / market（发请求）、
//   newUser / grant（造号、发东西）、row / inkOf / stateOf / itemOf（直接查数据库核对）、ok / section（记结果）
// 下面 import 和 ROOT 里带两条下划线的两个字符串是占位，由 tools/tests/econ-test.mjs 拼接时换成真实路径（只换第一次出现的，注释里别再写它们）。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gameJs } from '__AI_CODE_URL__';

const ROOT = new URL('__ROOT_URL__');
let T = Date.UTC(2026, 9, 23, 4, 0, 0);   // 测试里的“现在”，可以随意往后拨
const realNow = Date.now;
Date.now = () => T;

const FILE = process.argv.includes('--bundle') ? 'cloudflare/worker.bundle.js' : 'cloudflare/worker.js';
const { default: worker, WorldLine, FLAGS, PW_ITER } = await import(new URL(FILE, ROOT));
const C = globalThis.ArmoryCore;

/* ---------- 用 node:sqlite 模拟 D1（接口和 Cloudflare 的一样：prepare/bind/first/all/run/batch） ---------- */
// ---------- 假 D1：用 node:sqlite 的内存数据库，接口和 Cloudflare D1 一样（prepare / bind / first / all / run / batch） ----------
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

// ---------- 发请求和查数据库的小工具 ----------
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
