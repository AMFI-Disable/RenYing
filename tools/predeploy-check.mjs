// 部署前检查：上线 Worker 之前在本机（和 CI 里）跑一遍，不联网、不碰线上数据库、不依赖任何 npm 包。
//   node tools/predeploy-check.mjs            测打包好的 cloudflare/worker.bundle.js（部署的就是它）
//   node tools/predeploy-check.mjs --source   测 cloudflare/worker.js（没有管理网页，跳过 CSP 那一段）
// 覆盖：
//   1. cloudflare/wrangler.toml：main 指向的文件在、compatibility_date 格式对、生产 database_id 不是占位、
//      migrations_dir 在、迁移文件按 0001_xxx.sql 编号且不重号；
//   2. 管理网页 /admin 的安全头：CSP 只放行一段 sha256 对得上的脚本，没有 unsafe-inline / unsafe-eval，
//      页面里没有 onclick 这种行内事件、没有外链脚本；
//   3. 关键接口冒烟测试（Worker 在本机跑，D1 用 node:sqlite 模拟）：健康检查、注册、登录、读写存档、
//      管理口令、退出后旧 token 失效、未知路径 404、OPTIONS 预检、没有开放世界绑定时回 503 而不是崩掉、网页报错的收集和脱敏、
//      统一的错误格式和请求编号、服务器错误和慢请求的记录。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CF = path.join(ROOT, 'cloudflare');
const SOURCE = process.argv.includes('--source');
const FILE = path.join(CF, SOURCE ? 'worker.js' : 'worker.bundle.js');

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + extra : '')); }
};
const section = t => console.log('\n' + t);

/* ---------- 1. wrangler.toml ---------- */
section('wrangler.toml');
const toml = fs.readFileSync(path.join(CF, 'wrangler.toml'), 'utf8');
// 只取第一个 [env.*] 之前的部分：那是生产配置
const prod = toml.split(/^\[+env\./m)[0];
const val = (src, key) => { const m = src.match(new RegExp('^' + key + '\\s*=\\s*"([^"]*)"', 'm')); return m ? m[1] : null; };
const main = val(prod, 'main');
ok(main && fs.existsSync(path.join(CF, main)), 'main 指向的文件存在', main);
ok(/^\d{4}-\d{2}-\d{2}$/.test(val(prod, 'compatibility_date') || ''), 'compatibility_date 是 YYYY-MM-DD', val(prod, 'compatibility_date'));
const dbId = val(prod, 'database_id');
ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(dbId || '') && !/^0{8}-/.test(dbId), '生产 database_id 是真实的 id，不是占位', dbId);
ok(/^\[observability\]\s*\nenabled\s*=\s*true/m.test(prod), '生产打开了 [observability]');
const migDir = val(prod, 'migrations_dir');
const migPath = migDir && path.join(CF, migDir);
ok(migPath && fs.statSync(migPath, { throwIfNoEntry: false })?.isDirectory(), 'migrations_dir 目录存在', migDir);
if (migPath && fs.existsSync(migPath)) {
  const sql = fs.readdirSync(migPath).filter(f => f.endsWith('.sql')).sort();
  ok(sql.every(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)), '迁移文件名是 0001_xxx.sql', sql.join(', '));
  const nums = sql.map(f => +f.slice(0, 4));
  ok(nums.every((n, i) => n === i + 1), '迁移编号从 0001 连续、不重号', nums.join(', '));
}

/* ---------- 2 和 3 要把 Worker 跑起来：D1 用 node:sqlite ---------- */
function makeD1() {
  const db = new DatabaseSync(':memory:');
  const exec1 = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params).map(r => ({ ...r })), success: true, meta: { changes: 0 } };
    const info = st.run(...params);
    return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  };
  class Stmt {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...p) { return new Stmt(this.sql, p.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)); }
    async first(col) { const r = exec1(this.sql, this.params).results[0]; return r ? (col ? r[col] : r) : null; }
    async all() { return exec1(this.sql, this.params); }
    async run() { return exec1(this.sql, this.params); }
  }
  return {
    prepare: sql => new Stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map(s => exec1(s.sql, s.params)); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async exec(sql) { db.exec(sql); return { count: 1 }; },
  };
}
const ADMIN = 'predeploy-admin-0123456789abcdef';
const ENV = { DB: makeD1(), ADMIN_SECRET: ADMIN };   // 故意不给 WORLD：线上没部署开放世界时也不能崩
const { default: worker } = await import(pathToFileURL(FILE));
let ipN = 0;
const pend = [];   // Worker 交给 ctx.waitUntil 的活（记慢请求、记服务器错误）：查结果前先等它们做完
const settle = async () => { while (pend.length) await Promise.all(pend.splice(0)); };
async function call(method, route, { body, token, headers = {}, env = ENV } = {}) {
  const h = { 'CF-Connecting-IP': '10.7.0.' + (ipN++ % 250), ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://w.test' + route, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil(p) { pend.push(p); } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json };
}

/* ---------- 2. 管理网页的 CSP ---------- */
section('管理网页 /admin');
{
  const r = await call('GET', '/admin');
  const csp = r.headers.get('Content-Security-Policy') || '';
  ok(r.status === 200 && /text\/html/.test(r.headers.get('Content-Type') || ''), '/admin 回 200 网页', r.status);
  ok(r.headers.get('X-Frame-Options') === 'DENY' && /frame-ancestors 'none'/.test(csp), '不许被别的网页用 iframe 嵌进去');
  ok(/default-src 'none'/.test(csp) && /base-uri 'none'/.test(csp) && /form-action 'none'/.test(csp), "CSP 默认全关（default-src / base-uri / form-action 'none'）");
  ok(!/unsafe-inline/.test((csp.match(/script-src[^;]*/) || [''])[0]) && !/unsafe-eval/.test(csp), 'script-src 没有 unsafe-inline / unsafe-eval');
  ok(r.headers.get('Cache-Control') === 'no-store', '管理网页不进缓存');
  if (SOURCE) {
    ok(/script-src 'none'/.test(csp), "直接跑 worker.js 时没有管理网页，script-src 是 'none'");
  } else {
    const shas = [...csp.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)].map(m => m[1]);
    const scripts = [...r.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)];
    ok(shas.length === 1, 'CSP 正好放行一段脚本', shas.length);
    ok(scripts.length === 1 && (r.text.match(/<script\b/gi) || []).length === 1, '网页里正好一段 <script>', scripts.length);
    ok(scripts.length === 1 && !scripts[0][1].trim(), '<script> 不带属性（没有 src 外链）', scripts[0] && scripts[0][1]);
    const real = scripts.length === 1 ? crypto.createHash('sha256').update(scripts[0][2], 'utf8').digest('base64') : '';
    ok(shas[0] === real, '脚本的 sha256 和 CSP 里的一致（改了 admin.html 要重新 python3 tools/build.py）');
    const noScript = r.text.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, '');
    ok(!/<[^>]+\son[a-z]+\s*=/i.test(noScript), '没有 onclick 这种行内事件（CSP 会拦，写了也不会生效）');
    ok(!/javascript:/i.test(noScript), '没有 javascript: 链接');
  }
}

/* ---------- 3. 关键接口冒烟测试 ---------- */
section('关键接口');
{
  const h = await call('GET', '/api/health');
  ok(h.status === 200 && h.json && h.json.ok === true, '/api/health 正常', h.text.slice(0, 120));

  const pre = await call('OPTIONS', '/api/profile', { headers: { Origin: 'https://amfi-disable.github.io', 'Access-Control-Request-Method': 'POST' } });
  ok(pre.status === 204 && pre.headers.get('Access-Control-Allow-Origin'), 'OPTIONS 预检回 204 并带 CORS 头', pre.status);

  ok((await call('GET', '/api/nope')).status === 404, '未知路径回 404');
  const world = await call('GET', '/api/world/line/1');
  ok(world.status === 503, '没有开放世界绑定时 /api/world 回 503（不崩）', world.status);

  const user = 'smoke' + Date.now().toString(36).slice(-6), pw = 'smoke-pass-123';
  const reg = await call('POST', '/api/register', { body: { username: user, password: pw } });
  ok(reg.status === 200 && reg.json && reg.json.token, '注册新账号', reg.text.slice(0, 160));
  ok((await call('POST', '/api/register', { body: { username: user, password: pw } })).status === 400, '同名不能再注册');

  ok((await call('POST', '/api/login', { body: { username: user, password: 'wrong-pass-0' } })).status === 401, '密码错误回 401');
  const login = await call('POST', '/api/login', { body: { username: user, password: pw } });
  const tok = login.json && login.json.token;
  ok(login.status === 200 && tok, '登录拿到 token', login.text.slice(0, 160));

  ok((await call('GET', '/api/profile')).status === 401, '不带 token 读存档回 401');
  const got = await call('GET', '/api/profile', { token: tok });
  ok(got.status === 200 && got.json && got.json.username === user, '带 token 读到自己的存档', got.text.slice(0, 160));
  const prof = { ...(got.json && got.json.profile || {}), predeployMark: 1 };
  const put = await call('POST', '/api/profile', { token: tok, body: { profile: prof } });
  ok(put.status === 200 && put.json && put.json.ok !== false, '写存档成功', put.text.slice(0, 160));

  ok((await call('GET', '/api/leaderboard')).status === 200, '排行榜能读');
  ok((await call('GET', '/api/admin/whoami')).status >= 400, '不带管理口令进不了管理接口');
  ok((await call('GET', '/api/admin/whoami', { token: 'x'.repeat(32) })).status >= 400, '错的管理口令进不了管理接口');
  const who = await call('GET', '/api/admin/whoami', { token: ADMIN });
  ok(who.status === 200 && who.json && who.json.who === 'admin', '对的管理口令能进管理接口', who.text.slice(0, 120));
  const stats = await call('GET', '/api/admin/stats', { token: ADMIN });
  ok(stats.status === 200 && stats.json && stats.json.ok, '管理总览能读', stats.text.slice(0, 120));

  // 网页报错：text/plain 发上来（不用预检），脱敏后同一种错合成一行计数，管理网页能查到
  const errBody = { k: 'client', msg: 'boom at https://x.test/p?token=abc for a@b.com key 0123456789abcdef0123456789', src: 'https://x.test/index.html?v=3:12:5', stack: 'Error: boom\n at f (https://x.test/index.html?v=3:12:5)', meta: { scr: 'armory', ver: '1.0.0', nick: 'x'.repeat(200), 'bad key': 1 } };
  const sendErr = b => worker.fetch(new Request('https://w.test/api/err', { method: 'POST', headers: { 'CF-Connecting-IP': '10.9.0.1', 'Content-Type': 'text/plain' }, body: typeof b === 'string' ? b : JSON.stringify(b) }), ENV, { waitUntil() {} });
  const e1 = await sendErr(errBody), e2 = await sendErr(errBody);
  ok(e1.status === 200 && e2.status === 200, '网页报错能收下', e1.status);
  ok((await sendErr({ k: 'nope', msg: 'x' })).status === 400, '不认识的错误来源回 400');
  ok((await sendErr('x'.repeat(9000))).status === 413, '太大的报错回 413');
  const errs = await call('GET', '/api/admin/errors', { token: ADMIN });
  const row = errs.json && errs.json.rows && errs.json.rows[0];
  ok(errs.status === 200 && errs.json.rows.length === 1 && row.n === 2, '管理网页查得到，同一种错合成一行计了 2 次', errs.text.slice(0, 200));
  ok(row && !/token=|abc|a@b\.com|0123456789abcdef|x\.test|\?v=/.test(row.msg + row.src + row.stack) && /index\.html:12:5/.test(row.src), '存下来的已经脱敏（网址只留文件名、去掉参数、邮箱、长串）', row && row.msg + ' | ' + row.src);
  const meta = row ? JSON.parse(row.meta) : {};
  ok(meta.scr === 'armory' && meta.nick.length <= 60 && !('bad key' in meta), '附带信息只留短字段', row && row.meta);
  ok((await call('GET', '/api/admin/errors')).status >= 400, '不带管理口令看不了错误');

  // 统一的错误格式：{ ok: false, error, code }，每个回应都带请求编号
  const nf = await call('GET', '/api/nope'), na = await call('GET', '/api/profile');
  ok(nf.json && nf.json.ok === false && nf.json.code === 'not_found' && typeof nf.json.error === 'string', '404 的格式是 { ok: false, error, code: not_found }', nf.text);
  ok(na.json && na.json.code === 'unauthorized', '401 的 code 是 unauthorized', na.text);
  ok(/^[0-9a-f]{8}$/.test(nf.headers.get('X-Request-Id') || '') && /^[0-9a-f]{8}$/.test((await call('GET', '/api/health')).headers.get('X-Request-Id') || ''), '每个回应都带 X-Request-Id');
  // 服务器自己出错：回 500 带编号，错误页查得到同一个编号
  const brokenDB = { ...ENV.DB, prepare: sql => { if (/FROM users WHERE username/.test(sql)) throw new Error('模拟数据库坏了'); return ENV.DB.prepare(sql); } };
  const boom = await call('POST', '/api/login', { body: { username: user, password: pw }, env: { ...ENV, DB: brokenDB } });
  await settle();
  ok(boom.status === 500 && boom.json.code === 'internal' && boom.json.rid && boom.json.error.includes(boom.json.rid) && boom.headers.get('X-Request-Id') === boom.json.rid, '服务器出错回 500，错误信息里带请求编号', boom.text);
  const se = await call('GET', '/api/admin/errors?kind=server', { token: ADMIN });
  const srow = se.json && se.json.rows[0];
  ok(srow && srow.msg === '模拟数据库坏了' && srow.src === 'POST /api/login' && JSON.parse(srow.meta).rid === boom.json.rid, '服务器错误记进「错误」页，按编号找得到', se.text.slice(0, 200));
  // 慢请求：超过 1 秒的按“方法 + 路径”合成一行，记最慢一次
  const slowDB = { ...ENV.DB, prepare: sql => { const st = ENV.DB.prepare(sql); if (!/FROM users u|ORDER BY/.test(sql)) return st; const wrap = s0 => ({ bind: (...a) => wrap(s0.bind(...a)), first: async c => { await new Promise(r => setTimeout(r, 1100)); return s0.first(c); }, all: async () => { await new Promise(r => setTimeout(r, 1100)); return s0.all(); }, run: () => s0.run(), sql: s0.sql, params: s0.params }); return wrap(st); } };
  const slow = await call('GET', '/api/leaderboard?k=wins', { env: { ...ENV, DB: slowDB } });
  await call('GET', '/api/leaderboard?k=wins');   // 快的那次不记
  await settle();
  const sl = await call('GET', '/api/admin/errors?kind=slow', { token: ADMIN });
  const lrow = sl.json && sl.json.rows.find(r => r.msg === 'GET /api/leaderboard');
  ok(slow.status === 200 && lrow && lrow.n === 1 && lrow.ms >= 1000 && lrow.ms_sum === lrow.ms, '慢请求记进「错误」页（最慢多少毫秒）', sl.text.slice(0, 200));
  ok(sl.json && sl.json.rows.every(r => r.kind === 'slow'), '错误页能只看一类');

  ok((await call('POST', '/api/logout', { token: tok })).status === 200, '退出登录');
  ok((await call('GET', '/api/profile', { token: tok })).status === 401, '退出后旧 token 失效');
}

console.log(`\n${pass} 项通过，${fail} 项失败（${path.relative(ROOT, FILE)}）`);
process.exit(fail ? 1 : 0);
