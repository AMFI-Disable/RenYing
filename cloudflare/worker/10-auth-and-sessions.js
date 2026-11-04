
async function hasColumn(env, table, col) {
  try {
    const rows = (await env.DB.prepare('SELECT name FROM pragma_table_info(?)').bind(table).all()).results || [];
    return rows.some(r => String(r.name).toLowerCase() === col.toLowerCase());
  } catch (e) { return null; }
}
async function migrate(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sum TEXT NOT NULL, applied_at INTEGER NOT NULL)').run();
  const done = new Map(((await env.DB.prepare('SELECT id, sum FROM schema_migrations').all()).results || []).map(r => [r.id, r.sum]));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) {
      if (done.get(m.id) !== m.sum) console.warn(`迁移 ${m.name} 跑过以后又改了（sum ${done.get(m.id)} → ${m.sum}），不会重跑；要改表请加新的迁移文件`);
      continue;
    }
    const st = [env.DB.prepare('INSERT INTO schema_migrations (id, name, sum, applied_at) VALUES (?, ?, ?, ?)').bind(m.id, m.name, m.sum, Date.now())];
    for (const sql of m.sql) {
      const add = /^ALTER TABLE (\w+) ADD COLUMN (\w+)/i.exec(sql);
      const has = add ? await hasColumn(env, add[1], add[2]) : false;
      if (has) continue;   // 以前的 Worker 已经加过这一列
      if (has === null) {   // 读不了表结构：单独加一次，已经有了 SQLite 会说 duplicate column
        try { await env.DB.prepare(sql).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
        continue;
      }
      st.push(env.DB.prepare(sql));
    }
    try { await env.DB.batch(st); }
    catch (e) {
      // 别的实例同时在跑、已经跑完了这一个：算成功
      if (!(await env.DB.prepare('SELECT id FROM schema_migrations WHERE id = ?').bind(m.id).first())) throw e;
    }
  }
}
function ensureSchema(env) {
  if (!schemaReady) schemaReady = migrate(env).catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}

/* ---------- 密码 ----------
 * 新密码用 PBKDF2-SHA256 存，users.password_algo 记着是哪种（'pbkdf2-sha256:次数'）；以前的号是 'sha256-v1'（下面 hashPassword，只算一遍）。
 * 老号登录成功时顺手换成 PBKDF2，玩家什么都不用做。两种一直都认，所以开关 auth.pbkdf2 关掉只是新密码又用老办法存。
 * PW_ITER：免费版每个请求最多 10ms CPU。在 workerd 1.20261028 上量的（Intel Xeon，每种跑 15 次取最快）：
 *   1 万次 1.7ms，2 万次 2.9ms，3 万次 4.1ms，5 万次 6.7ms，10 万次 12.8ms；登录请求别的部分不到 1ms。
 * 取 2.5 万次（约 3ms），给慢一些的机器留出一倍多的余量。Cloudflare 不让超过 10 万次。 */
export const PW_ITER = 25000;
const PW_ALGO = 'pbkdf2-sha256:' + PW_ITER;
async function pbkdf2(password, salt, iter) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// 新密码要写进库的三样：hash、salt、algo（user 用来看开关是不是只开了 Dev）
async function makePassword(env, user, password, now) {
  const salt = randHex(16);
  if (await flagOn(env, 'auth.pbkdf2', user, now)) return { hash: await pbkdf2(password, salt, PW_ITER), salt, algo: PW_ALGO };
  return { hash: await hashPassword(password, salt), salt, algo: 'sha256-v1' };
}
// user 是 users 那一行（要有 password_hash、salt、password_algo）
async function checkPassword(user, password) {
  const m = /^pbkdf2-sha256:(\d+)$/.exec(String(user.password_algo || ''));
  if (m) {
    const n = +m[1];
    return n >= 1000 && n <= 100000 && sameStr(await pbkdf2(password, user.salt, n), user.password_hash);
  }
  return sameStr(await hashPassword(password, user.salt), user.password_hash);
}

// 老办法（sha256-v1）：加盐 SHA-256 算一遍
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + ':' + password + ':renying_sword_salt_2026');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 登录令牌在数据库里只存它的 SHA-256（前面加 h1:），库被拖走也拿不到能用的令牌。
// 以前存的是原文：查的时候两种都认，原文那行用到一次就改成哈希，玩家不用重新登录。
// 原文令牌一定是 64 位十六进制；别的样子（比如把库里的 h1:… 拿来当令牌）不按原文查。
async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const tokenKey = async token => 'h1:' + await sha256Hex(token);
const PLAIN_TOKEN = /^[0-9a-f]{64}$/;
// 按令牌找登录记录（cols 是要的 users 列）；找到的还是原文、开关又开着，就顺手换成哈希
async function sessionOf(env, token, cols, now) {
  if (!token || token.length > 128) return null;
  const key = await tokenKey(token);
  const r = await env.DB.prepare(`SELECT s.token AS stok, ${cols} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token IN (?1, ?2) AND s.expires_at > ?3 AND u.deleted_at = 0 ORDER BY s.token = ?1 DESC LIMIT 1`)
    .bind(key, PLAIN_TOKEN.test(token) ? token : key, now).first();
  if (r && r.stok !== key && await flagOn(env, 'auth.token_hash', r, now)) await env.DB.prepare('UPDATE sessions SET token = ?1 WHERE token = ?2').bind(key, token).run();
  return r;
}
// 新登录：写一行 sessions，返回给玩家的令牌原文。dev 是这个令牌属于哪台设备（老式的 30 天令牌没有）
async function newSession(env, user, now, dev = '', ttl = REFRESH_TTL) {
  const token = generateToken();
  const stored = (await flagOn(env, 'auth.token_hash', user, now)) ? await tokenKey(token) : token;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at, dev) VALUES (?, ?, ?, ?, ?)').bind(stored, user.id, now, now + ttl, dev).run();
  return token;
}

/* ---------- 短效令牌 + 续期令牌（开关 auth.refresh）----------
 * 登录拿到两样：token（30 分钟就过期，每个请求都带）和 refresh（只用来换新的，30 天没用就过期）。
 * 一台设备（一个浏览器）一行 devices，refresh 只存哈希。每换一次，旧的 refresh 记进 refresh_used 就作废了。
 * 作废的 refresh 又被拿来用，说明它被人偷了（或者是两个标签页同时换）：
 *   刚换完 1 分钟内拿上一个来换，回 409，网页去 localStorage 里读别的标签页换好的那个；
 *   别的情况（或者网页说读到的还是这个，insist）就把这台设备整组退出：它的 refresh 和所有令牌都不能用了，偷的人和本人都得重新登录。
 * 网页登录时带 rt: 1 才发这一套；老网页、开关关着时还是发老式的 30 天令牌。老式令牌拿到 /api/refresh 能换成新的一套。 */
const ACCESS_TTL = 30 * 60e3, REFRESH_TTL = 30 * 24 * 3600e3, REFRESH_RACE = 60e3;
// 设备名：只留系统和浏览器（不存完整的 User-Agent）
function deviceLabel(request) {
  const ua = String(request.headers.get('User-Agent') || '');
  const os = /iPhone|iPod/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ') || '未知设备';
}
async function newDevice(env, user, now, request) {
  const id = 'd_' + randHex(8), refresh = generateToken();
  await env.DB.prepare('INSERT INTO devices (id, user_id, refresh, created_at, expires_at, label, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, await tokenKey(refresh), now, now + REFRESH_TTL, deviceLabel(request), now).run();
  const token = await newSession(env, user, now, id, ACCESS_TTL);
  return { token, refresh, expiresIn: ACCESS_TTL / 1000, device: id };
}
// 登录、注册发哪种令牌：网页说它会续期（rt: 1）、开关也开着，就发短效 + 续期；不然发老式的 30 天令牌
async function issueLogin(env, user, now, request, body) {
  if (body && body.rt === 1 && await flagOn(env, 'auth.refresh', user, now)) return newDevice(env, user, now, request);
  return { token: await newSession(env, user, now) };
}
// 整台设备退出：refresh 和它发过的令牌一起删
function dropDevice(env, id) {
  return env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE dev = ?').bind(id),
    env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id),
  ]);
}
/* ---------- 登录记录 ----------
 * 注册、登录（成功、密码不对、没有这个号、被锁住）、退出、退出别的设备、续期令牌被偷用、管理员重设密码，各记一条，留 90 天。
 * IP 只存 HMAC 后的前 16 位：同一个 IP 看得出是同一个，倒推不出 IP（key 是 Worker 变量 LOG_SALT，没设就用固定的）。
 * 记不上不影响登录本身。管理后台「登录记录」按账号查。 */
const AUTH_LOG_DAYS = 90;
const AUTH_ACTS = ['register', 'login', 'login_fail', 'logout', 'device_out', 'device_all', 'refresh_reuse', 'pw_admin'];
async function authIp(env, ip) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(String(env.LOG_SALT || 'renying-auth-log')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(ip || '')));
  return Array.from(new Uint8Array(sig).slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function authLog(env, request, act, o = {}) {
  try {
    await env.DB.prepare('INSERT INTO auth_log (at, uid, name, act, ip, dev, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(Date.now(), o.uid || '', String(o.name || '').slice(0, 24), act, await authIp(env, clientIp(request)), o.dev || '', String(o.note || '').slice(0, 100)).run();
  } catch (e) { console.warn('auth_log', e && e.message); }
}

/* ---------- 人机验证（Cloudflare Turnstile）----------
 * Worker 里设了 TURNSTILE_SITEKEY（变量）和 TURNSTILE_SECRET（Secret）两样、开关 auth.turnstile 也开着才生效，不然整段跳过。
 * 注册每次都要过；登录在同一个昵称 15 分钟内输错 3 次、或者同一个 IP 输错 10 次以后才要。
 * 没带验证结果时回 400 和 need: 'turnstile'（不算进注册次数），网页弹出验证框，过了再带着结果重发一次。
 * 验证服务器连不上就当没通过（宁可让人等一下再试，也不放机器人进来）。 */
async function turnstileOn(env, user, now) {
  return !!(env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY) && flagOn(env, 'auth.turnstile', user, now);
}
async function turnstileOk(env, token, ip) {
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }) });
    const j = await r.json();
    return j && j.success === true;
  } catch (e) { return false; }
}
const needTurnstile = msg => error(msg || '请先完成人机验证', 400, { need: 'turnstile' });

async function handleRefresh(env, request, body, now) {
  const refresh = String(body.refresh || '');
  if (!refresh) {   // 老式的 30 天令牌换成新的一套（换完老令牌就删掉）
    const token = getBearerToken(request);
    const r = await sessionOf(env, token, 'u.id AS id, u.username AS username, s.dev AS dev', now);
    if (!r || r.dev) return error('登录已过期，请重新登录', 401);
    if (!(await flagOn(env, 'auth.refresh', r, now))) return error('服务器还没开这个功能', 400);
    const out = await newDevice(env, r, now, request);
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(r.stok).run();
    return json({ ok: true, ...out });
  }
  if (refresh.length > 128) return error('登录已过期，请重新登录', 401);
  const h = await tokenKey(refresh);
  const d = await env.DB.prepare('SELECT d.id, d.user_id, u.username FROM devices d JOIN users u ON u.id = d.user_id WHERE d.refresh = ? AND d.expires_at > ? AND u.deleted_at = 0').bind(h, now).first();
  if (d) {
    const next = generateToken(), nh = await tokenKey(next);
    const up = await env.DB.prepare('UPDATE devices SET refresh = ?, prev = ?, rotated_at = ?, expires_at = ?, last_seen = ? WHERE id = ? AND refresh = ?')
      .bind(nh, h, now, now + REFRESH_TTL, now, d.id, h).run();
    if (!up.meta || !up.meta.changes) return error('别的标签页刚换过，读一下新的', 409, { race: true });
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO refresh_used (h, dev, at) VALUES (?, ?, ?)').bind(h, d.id, now),
      env.DB.prepare('DELETE FROM sessions WHERE dev = ? AND expires_at < ?').bind(d.id, now),
    ]);
    const token = await newSession(env, { id: d.user_id, username: d.username }, now, d.id, ACCESS_TTL);
    return json({ ok: true, token, refresh: next, expiresIn: ACCESS_TTL / 1000, device: d.id });
  }
  const used = await env.DB.prepare('SELECT dev FROM refresh_used WHERE h = ?').bind(h).first();
  if (!used) {
    // A concurrent rotation may have updated devices before recording refresh_used.
    const pending = await env.DB.prepare('SELECT rotated_at FROM devices WHERE prev = ? AND expires_at > ?').bind(h, now).first();
    if (pending && now - pending.rotated_at < REFRESH_RACE && body.insist !== true) return error('别的标签页刚换过，读一下新的', 409, { race: true });
    return error('登录已过期，请重新登录', 401);
  }
  const cur = await env.DB.prepare('SELECT id, user_id, prev, rotated_at FROM devices WHERE id = ?').bind(used.dev).first();
  if (!cur) return error('登录已过期，请重新登录', 401);
  if (cur.prev === h && now - cur.rotated_at < REFRESH_RACE && body.insist !== true) return error('别的标签页刚换过，读一下新的', 409, { race: true });
  await dropDevice(env, cur.id);   // 作废的 refresh 又来了：这台设备整组退出
  await authLog(env, request, 'refresh_reuse', { uid: cur.user_id, dev: cur.id, note: body.insist === true ? '网页说本机没有更新的' : '' });
  return error('这个账号在这台设备上的登录已失效，请重新登录', 401, { reused: true });
}

// Generate crypto-secure token
function generateToken() {
  return randHex(32);
}
function randHex(nBytes) {
  const bytes = new Uint8Array(nBytes);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 服务器的随机数（开箱、终端机、掉落、斩数都用它，客户端碰不到）
function rnd() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0] * 2097152 + (a[1] >>> 11)) / 9007199254740992;
}

// 比较两个字符串，花的时间和内容无关（防止一位一位试出口令）
function sameStr(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

// Extract bearer token from Authorization header
function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

// Authenticate session from token
async function authenticate(env, request) {
  const token = getBearerToken(request), now = Date.now();
  const r = await sessionOf(env, token, 'u.id AS id, u.username AS username, u.profile_json AS profile_json, u.created_at AS created_at, s.dev AS dev, (SELECT last_seen FROM devices WHERE id = s.dev) AS dseen', now);
  if (!r) return null;
  const { stok, dev, dseen, ...user } = r;
  // 设备列表里的“最近在用”：5 分钟最多记一次，别每个请求都写库
  if (dev && now - (dseen || 0) > 5 * 60e3) await env.DB.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').bind(now, dev).run();
  return { token, user, dev: dev || '' };
}

async function readBody(request) {
  const txt = await request.text().catch(() => '');
  if (txt.length > BODY_MAX) return null;
  try { const v = JSON.parse(txt || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
}

/* ---------- 限速：同一个键在一段时间里最多几次 ---------- */
async function hit(env, k, limit, windowMs, now) {
  const r = await env.DB.prepare(
    'INSERT INTO rate (k, n, reset) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN rate.reset <= ?3 THEN 1 ELSE rate.n + 1 END, reset = CASE WHEN rate.reset <= ?3 THEN ?2 ELSE rate.reset END RETURNING n'
  ).bind(k, now + windowMs, now).first();
  return (r ? r.n : 1) <= limit;
}
async function peek(env, k, now) {
  const r = await env.DB.prepare('SELECT n, reset FROM rate WHERE k = ?').bind(k).first();
  return r && r.reset > now ? r.n : 0;
}
const clientIp = request => (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown').split(',')[0].trim().slice(0, 64);

/* ---------- 处罚：第一次警告，第二次封 1 天，第三次永久 ---------- */
async function sanctionOf(env, uid) {
  const r = await env.DB.prepare('SELECT strikes, ban_until, perm, log_json, at, pardon FROM sanctions WHERE uid = ?').bind(uid).first();
  let log = [];
  try { log = r ? JSON.parse(r.log_json) : []; } catch (e) {}
  return { strikes: r ? r.strikes : 0, banUntil: r ? r.ban_until : 0, perm: !!(r && r.perm), log: Array.isArray(log) ? log : [], at: r ? r.at : 0, pardon: r ? r.pardon : 0 };
}
const isBanned = (rec, now) => rec.perm || rec.banUntil > now;
async function banOf(env, uid, now) {
  const rec = await sanctionOf(env, uid);
  return isBanned(rec, now) ? rec : null;
}
function banned(rec) {
  return error(rec.perm ? '账号已被永久封禁，如有异议请联系作者' : '账号封禁中，解封后才能同步存档和交易', 403, { ban: { perm: rec.perm, banUntil: rec.banUntil, strikes: rec.strikes } });
}
async function strike(env, uid, reason, now, src) {
  const rec = await sanctionOf(env, uid);
  rec.strikes += 1; rec.at = now;
  rec.log = rec.log.concat({ r: String(reason).slice(0, 60), at: now, src }).slice(-20);
  if (rec.strikes === 2) rec.banUntil = Math.max(rec.banUntil, now + BAN_MS);
  if (rec.strikes >= 3) rec.perm = true;
  await env.DB.prepare(
    'INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0) ON CONFLICT(uid) DO UPDATE SET strikes = ?2, ban_until = ?3, perm = ?4, log_json = ?5, at = ?6'
  ).bind(uid, rec.strikes, rec.banUntil, rec.perm ? 1 : 0, JSON.stringify(rec.log), now).run();
  await logRow(env, uid, now, 'strike', 1, null, null, `${src}:${reason}`);
  return rec;
}

/* ---------- 流水账 ---------- */
function logStmt(env, uid, now, act, ok, ink0, ink1, detail) {
  return env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(uid, now, act, ok ? 1 : 0, ink0, ink1, String(detail || '').slice(0, 400));
}
function logRow(...a) { return logStmt(...a).run(); }

/* ---------- 存档 ---------- */
function parseProfile(txt, name) {
  let p = null;
  try { p = JSON.parse(txt); } catch (e) {}
  if (!p || typeof p !== 'object' || Array.isArray(p)) p = { name, ink: 100, owned: ['qingfeng'] };
  return p;
}
function cleanSkins(a) {
  return Array.isArray(a) ? Array.from(new Set(a.filter(k => typeof k === 'string' && SKIN_RE.test(k)))).slice(0, 300) : [];
}