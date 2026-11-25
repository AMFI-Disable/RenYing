/**
 * 刃影 Cloudflare Worker：云端账号、存档同步、武库经济、反作弊
 *
 * 部署：wrangler.toml 的 main 是 worker.bundle.js，由 python3 tools/build.py 生成（本文件 + src/armory-core.js
 *       拼成一个文件，在 Cloudflare 网页编辑器里整段粘贴也能用）。要绑定 D1 数据库 DB，表结构在 cloudflare/migrations/，第一次请求时自动跑完。
 * 环境变量（Workers → Settings → Variables，选 Secret；不设也能跑，只是用不了管理接口）：
 *   ADMIN_SECRET      管理口令：管理网页（这个 Worker 的 /admin）和 node tools/admin/econ-admin.mjs 都用它。
 *                     可以只写一个口令，也可以写成「名字:口令」、几个人用逗号隔开（比如 even:口令1,lnt:口令2），
 *                     这样流水里记得下是谁做的。口令用 openssl rand -hex 24 这种随机生成的长串，少于 16 位的不认
 *
 * 管理后台（/api/admin/*，要管理口令）：查账号和流水、加减墨锭、发或收武器箱 / 货郎 / 改名标签 / 饰品、封号解封、
 *   全服补偿（玩家下次动武库时自动领）、在线改经济数值（价格、爆率、每天能开几个、手续费、掉落、每天认多少本机收入）。
 *   每一笔都要写原因，记进 econ_log（全服的操作记在 uid = '*' 名下）。没有“dev 账号”这种特殊昵称：开发者也是普通账号
 *
 * 天魔讨伐（/api/gboss）：全服一起打同一只天魔。血量、谁打了多少、谁斩杀的都只存在服务器上；每次出战先领一张票，
 *   打完交一次伤害（同一张票重交只算一次，伤害按出战时长封顶）。击败或天魔遁走后按伤害发奖励（走全服补偿那一套），
 *   然后换下一代。
 *
 * 江湖共斗 · 开放世界（/api/world/line/N，WebSocket）：一条分线一个 Durable Object（WorldLine，wrangler.toml 里的 WORLD 绑定），
 *   服务器模拟妖物和妖王、转发附近侠客的位置；每线 40 人，满了网页自动去下一线，总人数不设上限。不用 D1。
 *
 * 侠客列传的江湖足迹（/api/saga）：云端账号走完一节、做了抉择、看到结局各记一笔（每个号每节只算一次，重走会改成新的选择），
 *   列传页按侠客汇总成人数和比例。只存侠客、第几节、选了什么，不存别的。
 *
 * 防作弊（和钱有关的都在服务器上算，客户端只负责显示）：
 *   武库：开箱、货郎、商店、熔铸、掉落、补给、星章都在这里用服务器的随机数和时钟算。
 *         存档带版本号，同时到的两个请求只有一个能改成（另一个重读再算，防双花）；每个请求带一次性编号，网络重试
 *         不会重复执行；对局奖励要开局领票、打够时间、每天有上限。
 *   玩家市场：只有玩家之间买卖饰品（mkt 表），标价玩家自己定。买、撤同一单时，先把那一单从“在卖”改掉，
 *         同一批写入里的其他语句都要看到这一改才生效：同时买同一件只有一个人买到，买和撤撞上只成一个。
 *         卖家的钱等卖家下次动武库时结（和卖家的存档一起写，只结一次）。
 *   墨锭：服务器记账。武库里赚的花的由服务器直接算；客户端本地赚的（打赢电脑、任务、关卡星）按条上报，
 *         每条带编号只记一次；每天先认 1500，每打完一局服务器认可的对局再多认 80，最多 6000；一次报几万的记进流水给管理员查。
 *   皮肤：武库专属的 29 款只认库存里真有的；卖掉之后，旧存档也覆盖不回来。没有充值，也没有别的货币。
 *   其他：每个账号、每个 IP 限速；登录失败太多次暂时锁定；注册带上来的存档墨锭有上限；被封期间不能写存档和交易。
 */
import '../src/armory-core.js';
import { MIGRATIONS } from './migrations.gen.js';
import '../src/data/13-chron.js';

const C = globalThis.ArmoryCore;

/* ---------- 跨域（CORS）----------
 * 只有游戏网页（GitHub Pages）和本机开发（localhost、127.0.0.1）能从浏览器里调接口；要加别的网址，在 Worker 的变量 CORS_ORIGINS 里写，逗号分开。
 * 离线版（双击打开，Origin 是 null）本来就不连服务器，不放行。命令行、curl 这种不带 Origin 的照常处理（跨域只管浏览器）。
 * /api/admin/* 只给这个 Worker 自己的 /admin 网页用：从来不带跨域头，带着别的网站的 Origin 来的直接 403。 */
const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
const CORS_ORIGINS = ['https://amfi-disable.github.io'];
const GITHUB_IO_ORIGIN = /^https:\/\/[a-z0-9_-]+\.github\.io$/i;
const CF_HOST_ORIGIN = /^https:\/\/[a-z0-9_-]+(\.[a-z0-9_-]+)*\.(workers\.dev|pages\.dev)$/i;
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}|[a-z0-9_-]+\.local)(:\d{1,5})?$/i;
function corsOrigin(env, origin) {
  if (!origin) return '';
  const extra = String((env && env.CORS_ORIGINS) || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
  return CORS_ORIGINS.includes(origin) || extra.includes(origin) || GITHUB_IO_ORIGIN.test(origin) || CF_HOST_ORIGIN.test(origin) || DEV_ORIGIN.test(origin) ? origin : '';
}
async function withCors(request, env, ctx) {
  const url = new URL(request.url), origin = request.headers.get('Origin') || '';
  const rid = reqId(), t0 = Date.now();
  if (url.pathname.startsWith('/api/admin/')) {
    if (origin && origin !== url.origin) return error('管理接口只能从管理网页用', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    return tagged(await route(request, env, ctx, rid), request, url, env, ctx, rid, t0);
  }
  const allow = corsOrigin(env, origin);
  const res = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env, ctx, rid);
  if (res.status === 101 || res.webSocket) return res;
  const out = tagged(res, request, url, env, ctx, rid, t0);
  out.headers.append('Vary', 'Origin');
  if (allow) {
    out.headers.set('Access-Control-Allow-Origin', allow);
    for (const [k, v] of Object.entries(CORS_HEADERS)) out.headers.set(k, v);
  }
  return out;
}

/* ---------- 请求编号、慢请求 ----------
 * 每个回应都带 X-Request-Id（8 位），服务器出错时错误信息里也带上，玩家报问题时说这个编号就能在「错误」页找到。
 * 超过 SLOW_MS 的请求按“方法 + 路径”合成一行记进 errs（kind = slow），记最慢一次和总耗时。
 * Workers 里 Date.now() 只在等网络、等数据库之后才往前走，量出来的正好是花在 D1 和外部请求上的时间。 */
const SLOW_MS = 1000;
const reqId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
function tagged(res, request, url, env, ctx, rid, t0) {
  if (res.status === 101 || res.webSocket) return res;
  const out = new Response(res.body, res);
  out.headers.set('X-Request-Id', rid);
  const ms = Date.now() - t0;
  if (ms >= SLOW_MS && env.DB) {
    const p = errRecord(env, 'slow', { msg: request.method + ' ' + url.pathname.replace(/\d+/g, ':n'), meta: { status: res.status, rid }, ms }, Date.now()).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  }
  return out;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

// 出错时的回应都是这个样子：{ ok: false, error: 给人看的话, code: 给程序看的类别, ...extra }
const ERR_CODE = { 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 413: 'too_large',
  426: 'upgrade_required', 429: 'rate_limited', 500: 'internal', 503: 'unavailable' };
function error(message, status = 400, extra) {
  return json({ ok: false, error: message, code: ERR_CODE[status] || (status >= 500 ? 'internal' : 'bad_request'), ...(extra || {}) }, status);
}

const ICE_STUN = ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'];
const ICE_TTL = 6 * 3600;   // TURN 凭据的有效期（秒）：够打完一晚上，过期了网页下次建房会重新要
async function iceServers(env) {
  const out = { ok: true, iceServers: [{ urls: ICE_STUN }], turn: false };
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return out;
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: ICE_TTL }),
    });
    if (!r.ok) { console.warn('turn creds', r.status); return out; }
    const d = await r.json();
    // 返回格式是 { iceServers: {...} } 或 { iceServers: [{...}] }，两种都认；只要带用户名和密码的 turn(s): 地址
    const list = (Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers]).filter(x => x && x.username && x.credential);
    const turn = list.map(x => ({ urls: (Array.isArray(x.urls) ? x.urls : [x.urls]).filter(u => /^turns?:/.test(u)), username: x.username, credential: x.credential })).filter(x => x.urls.length);
    if (turn.length) { out.iceServers.push(...turn); out.turn = true; out.ttl = ICE_TTL; }
  } catch (e) { console.warn('turn creds', (e && e.message) || e); }
  return out;
}

const DAY_MS = 86400e3;
// 客户端上报的墨锭收入（打电脑、任务、关卡星这些都在本机算）：服务器看不见本机发生了什么，只能限量。
// 每天先认 1500；每打完一局服务器认可的对局（开局领了票、打够了时间），当天再多认 80；最多 6000。这三个数可以在线改
// （规则核心 C.CFG_INFO 里的 ink.base / ink.match / ink.cap）。
// 只在控制台里改数的人一天最多多拿 1500；正常玩家打得越多额度越高。超出额度的先记着（单条不超过 INK_OWE_ONE 的才记，
// 最多记 INK_OWE_MAX），之后哪天额度有空余就补上，所以新手一天里领了好几样一次性奖励也不会丢。
const INK_OWE_ONE = 2500, INK_OWE_MAX = 4000;
const INK_IMPORT_CAP = 100000;   // 第一次建账：老存档里的墨锭最多认这么多
const REG_INK_CAP = 5000;        // 注册时带上来的游客 / 本机存档，墨锭最多认这么多
const INK_SPIKE = 50000;         // 一条上报超过这么多，记下来给管理员看（导入老账号也可能这样，所以不自动封）
const BODY_MAX = 300000;
const SKIN_RE = /^[a-z0-9_]{1,24}$/;
const BAN_MS = 24 * 3600e3;
const CODE_USES = 100000;              // 一个兑换码最多让这么多个号领
const RDM_MAX = 10, RDM_IP_MAX = 30;   // 一小时里输错这么多次兑换码就先锁一小时（每个号、每个 IP）
// 游戏里写死的几个码（src/game.js 的 redeemCode 先认它们）：服务器上不建同名的，不然玩家永远领不到
const CODE_LOCAL = ['LOCK', 'RELOCK', 'RENYING666', 'RENYING888', 'SWORD2026', 'MOYUGIFT', 'ZODIAC2026STAR', C.UNIVERSAL_PROMO_CODE, C.HEIRLOOM_PROMO_CODE];
// 以前不进库存的“绑定”皮肤（关卡奖励、老账号带过来的）：这一天之前建的号，第一次动武库时一次性换成库存里的饰品，
// 之后能卖能熔铸。之后建的号不换：网页报上来的皮肤服务器核对不了，换成能卖的饰品就等于能凭空变出墨锭
const LEGACY_CUTOFF = Date.UTC(2026, 9, 31);
// 全服通用解锁码与天工传世专属典藏码：由服务器核验，不重复发放
const CODE_BUILTIN = {
  [C.UNIVERSAL_PROMO_CODE]: () => ({
    note: '全服全内容解锁礼',
    promoAll: true,
    ink: C.UNIVERSAL_PROMO_INK,
    cases: Object.fromEntries(C.CASES.map(c => [c, C.UNIVERSAL_PROMO_CASES])),
    term: 10,
    tags: 10,
    sigils: 100,
  }),
  [C.HEIRLOOM_PROMO_CODE]: () => ({
    note: '天工传世 · 器灵典藏全集',
    heirloomPromo: true,
    ink: 0,
    cases: {},
    term: 0,
    tags: 0,
  }),
};
// 作废以前领过的号：码送的饰品（src 'code'）在库存里的、挂在市场上还没卖出的，第一次动武库时收回（记在 srv.zv）
const CODE_VOID = { ZODIAC2026STAR: it => it && it.src === 'code' && !!C.ITEM[it.k] && C.ITEM[it.k].col === 'c8' };

/* ---------- 数据库迁移 ----------
 * 表结构都在 cloudflare/migrations/0001_xxx.sql 里（python3 tools/build.py 拆成 migrations.gen.js，打包进 worker.bundle.js）。
 * 每个 Worker 实例第一次收到请求时：建 schema_migrations（跑过哪些），把没跑过的按编号一个一个跑。
 * 一个迁移是一个 batch（D1 里就是一个事务）：第一句先往 schema_migrations 插这一行，两个实例同时跑，后到的插不进去、整个退回，
 * 再读一次发现别人跑完了就接着往下；中途出错也是整个退回，什么都不改，这次请求报错，下次请求再试。
 * 迁移文件出现以前的库：表都在（0001 全是 IF NOT EXISTS），以前加过的列也在，所以 ALTER TABLE … ADD COLUMN 遇到已经有的列就跳过这一句。
 * 跑过的文件不要再改（改了会在日志里提示 sum 对不上），要改表就加一个新文件。 */
let schemaReady = null;
// 这一列已经有了吗（读不了表结构时返回 null，由调用的地方单独试一次 ALTER）// ===========================================================================
// 账号和会话：建表 / 迁移、密码、登录令牌、登录记录、人机验证、限速、处罚、流水、存档解析
// ===========================================================================
// 本文件和 cloudflare/worker/ 下其他编号文件按编号拼成 cloudflare/worker.js（共用一个作用域，函数互相直接调用）。
//
// 文件结构：
//   1. 数据库迁移（migrate / ensureSchema：Worker 第一次收到请求时把没跑过的迁移按编号跑完）
//   2. 密码：PBKDF2 加盐哈希，次数 PW_ITER；老格式的密码登录成功时顺手升级
//   3. 会话：短效令牌 + 续期令牌、登录设备
//   4. 登录记录、人机验证（Turnstile）、续期
//   5. 随机数、常量时间比较、取 Bearer 令牌、认证、读请求体
//   6. 限速（hit / peek）、处罚（警告 → 封 1 天 → 永久）
//   7. 流水账、存档解析
//
// 找 bug 提示：登录问题先查管理后台的「登录记录」（authLog 写的 act 字段）；
// 限速的键都写成 '前缀:ip' 或 '前缀:昵称'，在这里搜前缀就能找到是谁限的。
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

// 服务器的随机数（开箱、货郎、掉落、斩数都用它，客户端碰不到）
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
}// ===========================================================================
// 武库经济和存档：墨锭账本、皮肤库存、在线经济数值、功能开关、补偿和兑换码、武库动作、进度计数、存档同步、玩家市场
// ===========================================================================
// 规则：所有涉及墨锭和饰品的计算都在服务器上做，客户端只报"想做什么"（handleEcon 的 act）。
// 武库的数值和规则表来自 src/armory-core.js（打包时嵌进来，变量名 C），浏览器和服务器用同一份。
//
// 文件结构：
//   1. 读写经济存档：loadEcon / overlay / applyDeltas（按条记账，带版本号防并发覆盖）
//   2. 在线经济数值（cfgNow）、功能开关（FLAGS / flagOn）
//   3. 全服补偿、兑换码
//   4. 武库动作（handleEcon：开箱、买卖、熔铸……）
//   5. 进度计数（胜负场、侠客碎片：pg*）、列传进度合并
//   6. 存档同步（handleProfilePost / profileOut）
//   7. 玩家市场（handleMarket）
//
// 找 bug 提示：墨锭对不上时查 log 表的流水（ink0 → ink1）；写库失败多半是版本号冲突（guard 的 WHERE ver = ?），
// 客户端会重试。改这里的规则前先跑 node tools/tests/econ-test.mjs。
function cleanEquip(e) {
  const o = {};
  if (e && typeof e === 'object' && !Array.isArray(e)) for (const [c, k] of Object.entries(e)) if (SKIN_RE.test(c) && typeof k === 'string' && (k === '' || SKIN_RE.test(k))) o[c] = k;
  return o;
}
const clampInk = (x, hi = 1e9) => Math.max(0, Math.min(hi, Math.floor(+x || 0)));
function srvBlank() { return { ap: {}, rv: {}, ed: 0, en: 0, ow: 0, gone: {} }; }
function parseObj(txt) { try { const v = JSON.parse(txt); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (e) { return null; } }

// 这个账号的武库和墨锭账本；第一次用时按老存档建账
async function loadEcon(env, uid, prof, now) {
  const sel = () => env.DB.prepare('SELECT state_json, srv_json, ink, ver FROM econ WHERE uid = ?').bind(uid).first();
  let row = await sel();
  if (!row) {
    const ink0 = clampInk(prof.ink), ink = Math.min(ink0, INK_IMPORT_CAP);
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES (?, ?, ?, ?, 0, ?)')
      .bind(uid, JSON.stringify(C.blank()), JSON.stringify(srvBlank()), ink, now).run();
    if (ins.meta && ins.meta.changes) await logRow(env, uid, now, 'open_account', 1, ink0, ink, ink < ink0 ? '老存档墨锭超过上限，按上限建账' : '');
    row = await sel();
  }
  const state = parseObj(row.state_json) || C.blank();
  return { state, stateJson: row.state_json, srv: Object.assign(srvBlank(), parseObj(row.srv_json) || {}), ink: row.ink, ver: row.ver };
}

// 能穿的皮肤：武库专属的只认库存里真有的；武库刚收走的，旧存档也加不回来
function mergeSkins(list, st, srv, ev) {
  const via = new Set(Array.isArray(st.via) ? st.via : []), out = [];
  for (const k of cleanSkins(list)) {
    if (C.CS_KEYS.includes(k) && !via.has(k)) continue;
    const g = srv.gone[k];
    if (g && !(ev >= g[0]) && !via.has(k)) continue;
    out.push(k);
  }
  for (const k of via) if (!out.includes(k)) out.push(k);
  return out;
}
function fixEquip(eq, skins) {
  const o = { ...eq };
  for (const [c, k] of Object.entries(o)) if (k && C.CS_KEYS.includes(k) && !skins.includes(k)) delete o[c];
  return o;
}
function overlay(prof, eco) {
  const p = { ...prof };
  delete p.armory; delete p.ledger;
  p.ink = eco.ink;
  p.skins = mergeSkins(p.skins, eco.state, eco.srv, eco.ver);
  p.equip = fixEquip(cleanEquip(p.equip), p.skins);
  if (eco && eco.state && eco.state.promoAll) {
    p.owned = Array.from(new Set([...(Array.isArray(p.owned) ? p.owned : []), ...C.HERO_IDS]));
  }
  return p;
}
// 给客户端的账本：服务器上的墨锭、版本号、最近记过的上报编号（客户端据此把已经记过的条目划掉）
function ledgerOut(eco, now) {
  const acks = Object.entries(eco.srv.ap).filter(([, v]) => now - v[0] < 3 * DAY_MS).sort((a, b) => b[1][0] - a[1][0]).slice(0, 200).map(([id]) => id);
  return { ink: eco.ink, ver: eco.ver, acks };
}
// 今天认多少本机收入：基础额度 + 今天服务器认可的对局数 × 每局额度（三个数都可以在线改）
function inkAllow(eco, day, cfg) {
  const dm = eco.state && eco.state.dm, n = dm && dm.d === day ? Math.max(0, Math.min(C.MATCH_DAY_CAP, Math.floor(+dm.n || 0))) : 0;
  return Math.min(C.cv(cfg, 'ink.cap'), C.cv(cfg, 'ink.base') + C.cv(cfg, 'ink.match') * n);
}
// 客户端本地赚的墨锭：每条只记一次，收入每天有额度，花掉的照扣。
// srv.ap 记着每条的 [到达时间, 认了多少收入, 其中先记着多少]；srv.rv 是“撤回”点名了、但还没到的收入编号
const LID = /^[0-9a-z]{8,32}$/;
function applyDeltas(eco, deltas, now, cfg) {
  const day = C.day(now), srv = eco.srv, allow = inkAllow(eco, day, cfg);
  if (srv.ed !== day) { srv.ed = day; srv.en = 0; }
  srv.ow = Math.max(0, Math.min(INK_OWE_MAX, Math.floor(+srv.ow || 0)));
  if (!srv.rv || typeof srv.rv !== 'object') srv.rv = {};
  let capped = 0, forged = 0, n = 0, paid = 0, revoked = 0;
  for (const x of deltas.slice(0, 80)) {
    if (!x || typeof x.id !== 'string' || !LID.test(x.id) || srv.ap[x.id]) continue;
    if (Array.isArray(x.r)) {   // 撤回（本机反作弊抓到凭空多出来的墨锭）：点名的几条收入作废。只能扣，不能退花销
      for (const rid of x.r.slice(0, 40)) {
        if (typeof rid !== 'string' || !LID.test(rid)) continue;
        const a = srv.ap[rid];
        if (!a) { srv.rv[rid] = now; continue; }   // 还没到：到了以后收入不记
        const g = Math.max(0, Math.floor(+a[1] || 0)), q = Math.max(0, Math.floor(+a[2] || 0));
        eco.ink = Math.max(0, eco.ink - g); srv.ow = Math.max(0, srv.ow - q); revoked += g;
        srv.ap[rid] = [a[0], 0, 0];
      }
      srv.ap[x.id] = [now, 0, 0]; n++;
      continue;
    }
    let d = Math.trunc(+x.d);
    if (!Number.isFinite(d)) d = 0;
    d = Math.max(-1e9, Math.min(1e9, d));
    if (d > 0 && srv.rv[x.id]) { delete srv.rv[x.id]; srv.ap[x.id] = [now, 0, 0]; n++; continue; }
    let q = 0;
    if (d > 0) {
      if (d > INK_SPIKE) forged = Math.max(forged, d);
      const g = Math.min(d, Math.max(0, allow - srv.en)), rest = d - g;
      srv.en += g;
      if (rest > 0) { capped += rest; if (d <= INK_OWE_ONE) { q = Math.min(rest, INK_OWE_MAX - srv.ow); srv.ow += q; } }
      d = g;
    }
    eco.ink = Math.max(0, eco.ink + d);
    srv.ap[x.id] = [now, Math.max(0, d), q];
    n++;
  }
  // 以前超出额度记下的：今天额度还有空余就补上，按先来后到记到各条名下（以后撤回这条时一起扣回）
  const pay = Math.min(srv.ow, Math.max(0, allow - srv.en));
  if (pay > 0) {
    srv.ow -= pay; srv.en += pay; eco.ink += pay; paid = pay;
    let left = pay;
    for (const [id, a] of Object.entries(srv.ap).filter(([, a]) => Array.isArray(a) && a[2] > 0).sort((x, y) => x[1][0] - y[1][0])) {
      if (left <= 0) break;
      const t = Math.min(a[2], left);
      srv.ap[id] = [a[0], a[1] + t, a[2] - t]; left -= t;
    }
  }
  const ids = Object.entries(srv.ap).filter(([, v]) => Array.isArray(v) && now - v[0] < 14 * DAY_MS).sort((a, b) => b[1][0] - a[1][0]).slice(0, 600);
  srv.ap = Object.fromEntries(ids);
  srv.rv = Object.fromEntries(Object.entries(srv.rv).filter(([, t]) => now - t < 14 * DAY_MS).sort((a, b) => a[1] - b[1]).slice(-200));
  return { capped, forged, n, paid, owed: srv.ow, allow, revoked };
}
function pruneGone(srv, now) {
  srv.gone = Object.fromEntries(Object.entries(srv.gone).filter(([, v]) => Array.isArray(v) && now - v[1] < 30 * DAY_MS).slice(-200));
}
// 一批写入里的每一条都带上“版本号还是读出来时那个”：中间被别的请求改过，这一批就什么都不写，重读再算。
// 买、撤玩家市场上的一单时还要再带一条“那一单是被这个请求改掉的”（tx = [挂单编号, 请求标记]）；
// 批量撤单变现（fullAuto）时 tx = { seller: uid, tag: 请求标记, n: 数量 }，核对被本请求改掉的挂单数完全一致才落库
const TXC = ' AND EXISTS (SELECT 1 FROM mkt WHERE id = ? AND tx = ?)';
const TXM = ' AND (SELECT COUNT(*) FROM mkt WHERE seller = ? AND tx = ?) = ?';
const txSql = tx => !tx ? '' : Array.isArray(tx) ? TXC : TXM;
const txBinds = tx => !tx ? [] : Array.isArray(tx) ? tx : [tx.seller, tx.tag, tx.n];
// guard 只给 INSERT … SELECT、UPDATE … WHERE 后面接着用（cond 前面没有 AND）
const guard = (env, sql, binds, uid, ver, tx) => env.DB.prepare(`${sql} EXISTS (SELECT 1 FROM econ WHERE uid = ? AND ver = ?)${txSql(tx)}`).bind(...binds, uid, ver, ...txBinds(tx));
const ins = (env, sql, binds, uid, ver, tx) => guard(env, sql + ' WHERE', binds, uid, ver, tx);
function userWrite(env, uid, prof, now, ver, tx) {
  return guard(env, 'UPDATE users SET profile_json = ?, updated_at = ? WHERE id = ? AND', [JSON.stringify(prof), now, uid], uid, ver, tx);
}
function econWrite(env, uid, ver, now, srv, ink, stateJson, tx) {
  return env.DB.prepare(`UPDATE econ SET state_json = ?, srv_json = ?, ink = ?, ver = ver + 1, updated_at = ? WHERE uid = ? AND ver = ?${txSql(tx)}`)
    .bind(stateJson, JSON.stringify(srv), ink, now, uid, ver, ...txBinds(tx));
}

/* ---------- 在线改的经济数值（管理员用 /api/admin/cfg 改，cfg 表的最后一行是现在用的） ---------- */
// 每个 Worker 实例最多 30 秒重读一次：改完半分钟内各处都换成新的。读出来的再过一遍检查，坏了就当没改
let CFG_CACHE = { at: 0, id: 0, cfg: {} };
async function cfgNow(env, now) {
  if (CFG_CACHE.at && now - CFG_CACHE.at < 30e3 && now >= CFG_CACHE.at) return CFG_CACHE.cfg;
  const r = await env.DB.prepare('SELECT id, json FROM cfg ORDER BY id DESC LIMIT 1').first();
  const c = r ? C.cleanCfg(parseObj(r.json) || {}) : { cfg: {} };
  CFG_CACHE = { at: now, id: r ? r.id : 0, cfg: c.cfg || {} };
  return CFG_CACHE.cfg;
}

/* ---------- 功能开关 ----------
 * 大改动先做成开关，管理后台（/admin 的「功能开关」）按功能打开或关上，可以先只对 Dev 账号开，有问题一键关回去。
 * 不做按百分比放量。登记表在下面 FLAGS：[默认值, 说明, 网页要不要知道]。网页开局读 GET /api/flags，只拿得到“网页要知道”的那些。
 * 数据库里只存改过的；每个 Worker 实例最多 30 秒重读一次。 */
export const FLAGS = {
  'auth.turnstile': ['all', '注册、输错几次后的登录要过人机验证（Worker 里没设 TURNSTILE_SITEKEY 和 TURNSTILE_SECRET 时不管开没开都跳过）', false],
  'auth.refresh': ['dev', '登录令牌 30 分钟过期，网页用续期令牌自己换新的；偷来的续期令牌一用，整台设备退出（关掉：发老式的 30 天令牌，已经发出去的照样能用）', false],
  'auth.pbkdf2': ['all', '新密码用 PBKDF2 存，老号登录成功时换成 PBKDF2（关掉：新密码用老办法存；两种照样都认）', false],
  'auth.token_hash': ['all', '新登录的令牌在数据库里只存哈希，旧的用到时换成哈希（关掉：新令牌存原文；两种照样都认）', false],
};
const FLAG_MODES = ['off', 'dev', 'all'];
let FLAG_CACHE = { db: null, at: 0, rows: {} };
async function flagRows(env, now) {
  const c = FLAG_CACHE;
  if (c.db === env.DB && c.at && now - c.at < 30e3 && now >= c.at) return c.rows;
  const rows = {};
  for (const r of (await env.DB.prepare('SELECT k, mode, by, note, at FROM flags').all()).results || []) rows[r.k] = r;
  FLAG_CACHE = { db: env.DB, at: now, rows };
  return rows;
}
const isDevUser = user => !!user && String(user.username || '').toLowerCase() === 'dev';
function flagMode(rows, k) { const r = rows[k]; return r && FLAG_MODES.includes(r.mode) ? r.mode : (FLAGS[k] ? FLAGS[k][0] : 'off'); }
// 这个开关对这个人开没开（user 可以是空：游客）
async function flagOn(env, k, user, now) {
  const m = flagMode(await flagRows(env, now), k);
  return m === 'all' || (m === 'dev' && isDevUser(user));
}
async function flagsFor(env, user, now) {
  const rows = await flagRows(env, now), out = {};
  for (const [k, [, , client]] of Object.entries(FLAGS)) if (client) { const m = flagMode(rows, k); out[k] = m === 'all' || (m === 'dev' && isDevUser(user)); }
  return out;
}

/* ---------- 全服补偿：开发组发的墨锭、武器箱、货郎、改名标签，玩家下次动武库时自动领 ---------- */
// 发给所有人的（uid = '*'）只给 born 之前注册的号，免得开小号来领；单发给某个号的不管注册时间。每个号每份只领一次
async function giftsFor(env, user, now) {
  return (await env.DB.prepare("SELECT id, ink, items_json, note FROM gift WHERE (uid = ? OR uid = '*') AND off = 0 AND at <= ? AND until > ? AND born > ? AND NOT EXISTS (SELECT 1 FROM gift_got x WHERE x.gid = gift.id AND x.uid = ?) ORDER BY at LIMIT 10")
    .bind(user.id, now, now, Math.floor(+user.created_at || 0), user.id).all()).results || [];
}
function giftItems(txt) {   // 一份补偿里的东西：{ cases: { c1: 2 }, term: 1, tags: 1, skins: [{ k, st }] }，数都夹在 0 ~ 100；全服肉鸽发的还有 skin（只认星座武器箱的款）
  const o = parseObj(txt) || {}, cases = {};
  for (const c of C.CASES) { const n = Math.floor(+(o.cases && o.cases[c]) || 0); if (n > 0) cases[c] = Math.min(100, n); }
  const one = x => Math.max(0, Math.min(100, Math.floor(+x || 0)));
  const out = { cases, term: one(o.term), tags: one(o.tags), skins: [] };
  if (typeof o.skin === 'string' && C.isItem(o.skin) && C.ITEM[o.skin].col === 'c8') out.skin = o.skin;
  if (Array.isArray(o.skins)) {
    out.skins = o.skins.map(x => {
      const k = typeof x === 'string' ? x : (x && x.k);
      if (!C.isItem(k)) return null;
      const st = x && x.st !== undefined ? (x.st >= 0 ? Math.floor(+x.st || 0) : -1) : -1;
      return { k, st };
    }).filter(Boolean).slice(0, 20);
  }
  return out;
}

/* ---------- 兑换码：管理后台建，玩家在游戏里输入，服务器核对后和补偿一样放进存档和墨锭 ---------- */
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 不用 0 O 1 I L，免得玩家看错
const codeKey = x => { const k = String(x || '').trim().toUpperCase(); return /^[A-Z0-9]{4,20}$/.test(k) ? k : ''; };
function randCode(n = 10) {   // 只收 248（31 的 8 倍）以下的字节，每个字符出现的机会一样
  let out = '';
  while (out.length < n) for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < 248 && out.length < n) out += CODE_ABC[b % 31];
  return out;
}

/* ---------- 武库：所有动作都在服务器上算 ---------- */
// 流水里的一件饰品：「qf_p1#12 st3」（编号 12，斩数版，斩数 3；老流水只写 st）
const itemRef = it => `${it.k}#${it.i}${+it.st >= 0 ? ' st' + (+it.st | 0) : ''}`;   // 带斩数，找回时能还原
// 一次操作前后库存里少了哪几件、多了哪几件（库存加挂单一起算：挂上市场、撤回来都不算进出）
function itemDiff(a, b) {
  const ids = x => { const m = new Map(); for (const it of Array.isArray(x && x.inv) ? x.inv : []) if (it && Number.isInteger(+it.i)) m.set(+it.i, it);
    for (const L of Array.isArray(x && x.lst) ? x.lst : []) if (L && L.it && Number.isInteger(+L.it.i)) m.set(+L.it.i, L.it); return m; };
  const m0 = ids(a), m1 = ids(b);
  const rm = [...m0.values()].filter(it => !m1.has(+it.i)).map(itemRef), ad = [...m1.values()].filter(it => !m0.has(+it.i)).map(itemRef);
  return { rm: rm.length ? rm : undefined, ad: ad.length ? ad : undefined };
}
// 流水的 detail 最多 2000 字：放不下的话进出清单只留前面几件，另记总数（rmN、adN），保证存下来的还是完整的 JSON
function logDetail(d) {
  const n = k => Array.isArray(d[k]) ? d[k].length : undefined;
  let txt = JSON.stringify(d);
  for (const keep of [60, 20, 5, 0]) {
    if (txt.length <= 2000) return txt;
    const o = { ...d };
    for (const k of ['rm', 'ad']) if (Array.isArray(d[k]) && d[k].length > keep) { o[k] = d[k].slice(0, keep); o[k + 'N'] = d[k].length; }
    if (!keep) o.a = undefined;   // 参数也太长：不记参数
    txt = JSON.stringify(o);
  }
  return txt.length <= 2000 ? txt : JSON.stringify({ r: String(d.r).slice(0, 200), rmN: n('rm'), adN: n('ad') });
}
const QUIET = ['sync', 'matchStart', 'claimCode'];   // 太频繁的动作不进流水账（有成交的除外）；兑换码另记一条 code_got
async function handleEcon(env, auth, body, now, ip) {
  const uid = auth.user.id;
  const act = String(body.act || ''), nonce = String(body.nonce || '');
  const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? body.args : {};
  if (!C.ACTIONS.includes(act)) return error('不认识的操作');
  if (!/^[0-9a-f]{16,64}$/.test(nonce)) return error('请求格式不对');
  if (JSON.stringify(args).length > 4000) return error('请求太大', 413);
  const ban = await banOf(env, uid, now);
  if (ban) return banned(ban);
  if (!(await hit(env, 'econ:' + uid, 90, 60e3, now))) return error('操作太快了，歇一会儿再试', 429);
  if (!(await hit(env, 'econday:' + uid, 4000, DAY_MS, now))) return error('今天的操作次数用完了，明天再来', 429);
  const cfg = await cfgNow(env, now);
  const freshProfile = async () => {
    const r = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(uid).first();
    return parseProfile(r ? r.profile_json : '', auth.user.username);
  };
  // 同一个编号已经做过：直接把上次的结果给它（网络重试不会开两次箱）
  const seen = await env.DB.prepare('SELECT res_json FROM econ_nonce WHERE uid = ? AND nonce = ?').bind(uid, nonce).first();
  if (seen) {
    const eco = await loadEcon(env, uid, await freshProfile(), now);
    return json({ ok: true, ...JSON.parse(seen.res_json), state: C.publicState(C.normalize(eco.state, { now, uid })), ledger: ledgerOut(eco, now), cfg, replay: true });
  }
  // 兑换码：先核对（输错的记一次，一小时里错太多就先锁住），对的话下面和补偿一起放进存档
  let code = null;
  if (act === 'claimCode') {
    if ((await peek(env, 'rdm:' + uid, now)) >= RDM_MAX || (await peek(env, 'rdmip:' + ip, now)) >= RDM_IP_MAX) return error('兑换码输错太多次了，一小时后再试', 429);
    const k = codeKey(args.code);
    if (k && CODE_BUILTIN[k]) {
      // 每个号只领一次资源；全服通用解锁码与天工传世典藏码若已领过，则在后续有新内容更新时补齐新增项（不重发资源、不补卖掉的旧饰品）
      const alreadyGot = !!(await env.DB.prepare('SELECT 1 FROM code_got WHERE code = ? AND uid = ?').bind(k, uid).first());
      const def = CODE_BUILTIN[k]();
      if (alreadyGot && !def.promoAll && !def.heirloomPromo) return error('这个兑换码你已经领过了');
      code = { code: k, ink: 0, cases: {}, term: 0, tags: 0, builtin: true, alreadyGot, ...def };
    }
    const row = code ? null : k ? await env.DB.prepare('SELECT code, ink, items_json, note, until, uses, got, off, EXISTS (SELECT 1 FROM code_got x WHERE x.code = code.code AND x.uid = ?) AS mine FROM code WHERE code = ?').bind(uid, k).first() : null;
    if (code) { /* 游戏里自带的码，上面已经核对过 */ }
    else if (!row || row.off || row.until <= now) {
      await hit(env, 'rdm:' + uid, 1e9, 3600e3, now);
      await hit(env, 'rdmip:' + ip, 1e9, 3600e3, now);
      return error('兑换码无效或已过期');
    }
    else {
      if (row.mine) return error('这个兑换码你已经领过了');
      if (row.got >= row.uses) return error('这个兑换码已经被领完了');
      code = { code: row.code, note: row.note, ink: clampInk(row.ink, 1e6), ...giftItems(row.items_json) };
    }
  }
  // 自己挂了太久没卖出的单：先撤下（只改还在卖的那几单；同一刻被别人买走的照常算卖掉）。饰品在下面退回库存
  const ttl = C.cv(cfg, 'mktDays') * DAY_MS;
  await env.DB.prepare('UPDATE mkt SET state = 2, done_at = ? WHERE seller = ? AND state = 0 AND at < ?').bind(now, uid, now - ttl).run();
  for (let attempt = 0; attempt < 5; attempt++) {
    const prof = await freshProfile();
    const eco = await loadEcon(env, uid, prof, now);
    const skins0 = mergeSkins(prof.skins, eco.state, eco.srv, eco.ver);
    // 玩家市场：自己挂的单被别人买走、钱还没结的，这次一起结；买、撤的话把那一单现在的样子交给规则核心
    const paid = (await env.DB.prepare('SELECT id, k, st, price, done_at AS at FROM mkt WHERE seller = ? AND state = 1 AND paid = 0 ORDER BY done_at LIMIT 40').bind(uid).all()).results || [];
    const dupeNeed = act === 'listDupes' ? Math.max(C.LIST_BATCH, Math.min(2000, C.dupePlan(eco.state).items.length)) : 0;
    const openMarketIds = act === 'fullAuto' ? new Set(((await env.DB.prepare('SELECT id FROM mkt WHERE seller = ? AND state = 0').bind(uid).all()).results || []).map(r => r.id)) : null;
    const mkt = { id: randHex(8), ids: act === 'listDupes' ? Array.from({ length: dupeNeed }, () => randHex(8)) : null, openIds: openMarketIds, row: null, out: null };
    if ((act === 'buy' || act === 'cancel') && C.isLid(args.l)) {
      const r0 = await env.DB.prepare('SELECT id, seller, k, st, item_json, price, state, at FROM mkt WHERE id = ?').bind(args.l).first();
      if (r0) mkt.row = { id: r0.id, seller: r0.seller, k: r0.k, st: r0.st, price: r0.price, state: r0.state, item: parseObj(r0.item_json), expired: r0.state === 0 && r0.at < now - ttl };
    }
    // 存档里还挂着、市场上已经不在卖的（到期撤下、被撤下，或者那一单已经清理掉了）：这次退回库存。卖掉的不算，卖掉的走上面的结账
    // 挂单不设上限：每次只核对最早挂的 LIST_CHECK 单（快到期的先核对），剩下的下次操作接着核对，一次请求读的行数不会跟着挂单数涨
    const lst0 = (Array.isArray(eco.state.lst) ? eco.state.lst : []).filter(L => L && C.isLid(L.l)).sort((a, b) => (+a.t || 0) - (+b.t || 0)).slice(0, C.LIST_CHECK);
    let back = [];
    if (lst0.length) {
      const rows = (await env.DB.prepare(`SELECT id, state FROM mkt WHERE id IN (${lst0.map(() => '?').join(', ')})`).bind(...lst0.map(L => L.l)).all()).results || [];
      const stOf = new Map(rows.map(r => [r.id, r.state]));
      back = lst0.filter(L => !stOf.has(L.l) || stOf.get(L.l) === 2).map(L => L.l);
    }
    // 开发组发的补偿：先放进存档和墨锭，再做这次的动作（动作没做成也照样领到）
    const gifts = await giftsFor(env, auth.user, now), got = [];
    let state0 = eco.state, ink0 = eco.ink;
    const giftSkins = [];
    if (gifts.length || code) {
      state0 = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid });
      for (const g of gifts) {
        const it = giftItems(g.items_json), ink = clampInk(g.ink, 1e6);
        ink0 += ink;
        for (const [c, n] of Object.entries(it.cases)) state0.cases[c] += n;
        state0.term += it.term; state0.tags += it.tags;
        if (it.skin) giftSkins.push({ k: it.skin, st: -1, src: 'rouge' });
        if (Array.isArray(it.skins)) for (const sk of it.skins) giftSkins.push({ ...sk, src: 'gift' });
        got.push({ id: g.id, note: g.note, ink, ...it });
      }
      if (code && !code.promoAll) {   // 普通兑换码里的东西先放进去（全服通用解锁码走下面的 C.applyPromoAll）
        ink0 += code.ink;
        for (const [c, n] of Object.entries(code.cases)) state0.cases[c] += n;
        state0.term += code.term; state0.tags += code.tags;
        if (code.skin) giftSkins.push({ k: code.skin, st: -1, src: 'code' });
        if (Array.isArray(code.skins)) for (const sk of code.skins) giftSkins.push({ ...sk, src: 'code' });
      }
    }
    const E = { now, rnd, uid, ink: ink0, skins: skins0.slice(), equip: fixEquip(cleanEquip(prof.equip), skins0), server: true, paid, back, mkt, cfg };
    // 领奖记录第一次建：服务器存档里已有的关卡星、列传进度当成领过了（见 armory-core 的 rwClean）
    if (!(eco.state && eco.state.rw && eco.state.rw.seeded)) E.seed = { ss: prof.stageStars, sg: prof.saga };
    // 绑定皮肤换成饰品（每个号只做一次，记在 srv.lg）：库存里没有这一款的放一件普通版，并记进 via，卖掉最后一件就穿不了，和开箱得到的一样
    let legacy = null;
    if (!eco.srv.lg && Math.floor(+auth.user.created_at || 0) < LEGACY_CUTOFF) {
      legacy = skins0.filter(k => C.isItem(k) && !eco.state.inv.some(x => x.k === k) && !(eco.state.via || []).includes(k));
      if (legacy.length) {
        if (state0 === eco.state) state0 = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid });
        for (const k of legacy) { C.addItem(state0, C.mkItem(state0, k, 'legacy', rnd, { st: -1 }), E); if (!state0.via.includes(k)) state0.via.push(k); }
      }
    }
    // 作废的兑换码：领过的号把码送的饰品收回。已经被别人买走的不追（买家是花墨锭买的）
    let voided = null;
    if (!eco.srv.zv) {
      for (const [k, isV] of Object.entries(CODE_VOID)) {
        if (!(await env.DB.prepare('SELECT 1 FROM code_got WHERE code = ? AND uid = ?').bind(k, uid).first())) continue;
        if (state0 === eco.state) state0 = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid });
        voided = voided || { code: [], inv: [], lst: [] };
        voided.code.push(k);
        for (const it of state0.inv.filter(isV)) { C.dropItem(state0, it.i, E); voided.inv.push(it.k); }
        const open = new Set(((await env.DB.prepare('SELECT id FROM mkt WHERE seller = ? AND state = 0').bind(uid).all()).results || []).map(r => r.id));
        state0.lst = state0.lst.filter(L => { if (!isV(L.it) || !open.has(L.l)) return true; voided.lst.push(L.l); return false; });
      }
    }
    for (const sk of giftSkins) {
      const k = typeof sk === 'string' ? sk : (sk && sk.k), st = sk && sk.st !== undefined ? sk.st : -1;
      const src = (sk && sk.src) || (C.ITEM[k] && C.ITEM[k].col === 'c8' ? 'rouge' : 'gift');
      if (state0.inv.length < C.INV_MAX && C.isItem(k)) {
        C.addItem(state0, C.mkItem(state0, k, src, rnd, { st }), E);
      }
    }   // 全服肉鸽发的星座皮肤：放一件进库存，能卖能熔铸
    if (code && code.heirloomPromo) {
      const hrRes = C.applyHeirloomPromo(state0, E);
      if (code.alreadyGot && !hrRes.changed) return error('这个兑换码你已经领过了');
      code.n = hrRes.added;
      code.synced = !!code.alreadyGot;
    } else if (code && code.promoAll) {
      const promoRes = C.applyPromoAll(state0, E, { firstClaim: !code.alreadyGot && !state0.promoAll });
      if (code.alreadyGot && !promoRes.changed) return error('这个兑换码你已经领过了');
      code.n = promoRes.addedSkins;
      code.synced = !!code.alreadyGot;
      if (code.alreadyGot) { code.ink = 0; code.cases = {}; code.term = 0; code.tags = 0; code.sigils = 0; }
    } else if (state0 && state0.promoAll) {
      // 已激活全服全内容解锁的账号：后续版本新增的侠客、饰品、徽记、灵宠与招式流派自动同步补齐（不重复发放已有饰品与一次性资源）
      const needSync = Object.keys(C.ITEM).some(k => !(state0.promoKeys || []).includes(k))
        || Object.keys(C.BADGES).some(b => !state0.badgeOwned || state0.badgeOwned[b] !== 'purpgold')
        || Object.keys(C.PETS).some(p => !state0.petOwned || state0.petOwned[p] !== 'immortal')
        || C.HERO_IDS.some(h => !state0.heroKOs || (state0.heroKOs[h] || 0) < 300);
      if (needSync) {
        if (state0 === eco.state) state0 = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid });
        C.applyPromoAll(state0, E, { firstClaim: false });
      }
    }
    if (code && code.items) {   // 兑换码送的饰品：库存里没有这一款的才放一件进去（普通版）
      let n = 0;
      for (const k of code.items) if (C.isItem(k) && !state0.inv.some(x => x.k === k) && state0.inv.length < C.INV_MAX) { C.addItem(state0, C.mkItem(state0, k, 'code', rnd, { st: -1 }), E); n++; }
      code.n = n;
    }
    const equip0 = { ...E.equip };
    const r = C.run(state0, act, args, E);
    const res = r.res || {}, st = r.state, stJson = JSON.stringify(st);
    const add = E.skins.filter(k => !skins0.includes(k)), del = skins0.filter(k => !E.skins.includes(k));
    const eq = {};
    for (const c of new Set([...Object.keys(equip0), ...Object.keys(E.equip)])) if (equip0[c] !== E.equip[c]) eq[c] = E.equip[c] === undefined ? null : E.equip[c];
    const out = { res, sold: r.sold || [] };
    if (r.back && r.back.length) out.back = r.back.map(({ k, st }) => ({ k, st }));
    if (code) { const { items, builtin, ...c } = code; out.code = c; }
    // 最后一道保险：算出来的数不对劲（不是整数、是负数、大得离谱）就整个作废，记下来查
    const bad = [E.ink, st.tags, st.term, ...Object.values(st.cases), ...st.inv.map(x => x.st + 1)].find(v => !Number.isSafeInteger(v) || v < 0 || v > 1e12);   // 斩数 -1 是普通版
    if (bad !== undefined || st.inv.length > C.INV_MAX) {
      await logRow(env, uid, now, 'invariant', 0, eco.ink, null, JSON.stringify({ act, args, bad }).slice(0, 400));
      return error('操作失败，已记录', 500);
    }
    const mo = mkt.out, settled = E.settled || [];
    if (!legacy && !code && !out.sold.length && !out.back && !mo && !(voided && voided.lst.length) && E.ink === eco.ink && stJson === eco.stateJson && !add.length && !del.length && !Object.keys(eq).length) {
      return json({ ok: true, ...out, state: C.publicState(st), ledger: ledgerOut(eco, now), skinsAdd: [], skinsDel: [], equip: {}, cfg });   // 什么都没变：不用写
    }
    const ver = eco.ver, srv = eco.srv;
    if (legacy) srv.lg = now;
    if (!srv.zv) srv.zv = now;   // 走到这里说明作废那一步已经做过（领过的号收回了，没领过的不用再查）
    for (const k of del) srv.gone[k] = [ver + 1, now];
    for (const k of add) delete srv.gone[k];
    pruneGone(srv, now);
    const p = { ...prof, ink: E.ink, skins: E.skins, equip: E.equip, updatedAt: now };
    if (st.promoAll) p.owned = Array.from(new Set([...(Array.isArray(prof.owned) ? prof.owned : []), ...C.HERO_IDS]));
    delete p.armory; delete p.ledger;
    const quiet = QUIET.includes(act) && !out.sold.length && !out.back;
    // 流水里记下这一次进出库存的每一件（rm 出去的、ad 进来的，挂到市场上不算出去）：哪件饰品是哪一步没的，后台找回工具按这个查
    const moved = itemDiff(eco.state, st);
    const detail = logDetail({ a: args, r: res.err ? res.err : res.item ? itemRef(res.item) : res.gain || res.price || '', n: (act === 'openAll' || act === 'termOpenAll') && res.items ? res.items.length : undefined, cases: act === 'openAll' ? res.cases : undefined, soldMarket: act === 'fullAuto' ? res.soldMarketCount || undefined : undefined, s: out.sold.length || undefined, b: out.back ? out.back.length : undefined, ...moved });
    // 买、撤：先把那一单从“在卖”改掉（只有它还在卖、版本号也没变才改得动），后面每一条都要看到这一改才生效
    const id = mo && (mo.buy || mo.cancel);
    const cancelMany = mo && Array.isArray(mo.cancelMany) && mo.cancelMany.length ? mo.cancelMany : null;
    const txTag = nonce.slice(0, 24) + '.' + attempt;
    const tx = id ? [id, txTag] : cancelMany ? { seller: uid, tag: txTag, n: cancelMany.length } : null;
    const stmts = [];
    if (mo && mo.buy) stmts.push(guard(env, 'UPDATE mkt SET state = 1, buyer = ?, done_at = ?, tx = ? WHERE id = ? AND state = 0 AND seller <> ? AND at >= ? AND', [uid, now, txTag, id, uid, now - ttl], uid, ver));   // 到期的单买不了
    if (mo && mo.cancel) stmts.push(guard(env, 'UPDATE mkt SET state = 2, done_at = ?, tx = ? WHERE id = ? AND seller = ? AND state = 0 AND', [now, txTag, id, uid], uid, ver));
    if (cancelMany) {
      // 每批最多 40 单（D1 单语句 100 绑定参数上限），整批全处于在售状态才标记为已撤下，避免并发成交造成重复发奖或物品丢失
      for (let ci = 0; ci < cancelMany.length; ci += 40) {
        const chunk = cancelMany.slice(ci, ci + 40);
        const ph = chunk.map(() => '?').join(', ');
        stmts.push(env.DB.prepare(`UPDATE mkt SET state = 2, done_at = ?, tx = ? WHERE seller = ? AND state = 0 AND id IN (${ph}) AND EXISTS (SELECT 1 FROM econ WHERE uid = ? AND ver = ?) AND (SELECT COUNT(*) FROM mkt WHERE seller = ? AND state = 0 AND id IN (${ph})) = ?`)
          .bind(now, txTag, uid, ...chunk, uid, ver, uid, ...chunk, chunk.length));
      }
    }
    if (mo && mo.list) {
      const L = mo.list;
      stmts.push(ins(env, 'INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) SELECT ?, ?, ?, ?, ?, ?, ?, 0, 0', [L.l, uid, L.it.k, L.it.st, JSON.stringify(L.it), L.price, now], uid, ver));
    }
    if (mo && Array.isArray(mo.lists)) {
      for (const L of mo.lists) {
        stmts.push(ins(env, 'INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) SELECT ?, ?, ?, ?, ?, ?, ?, 0, 0', [L.l, uid, L.it.k, L.it.st, JSON.stringify(L.it), L.price, now], uid, ver));
      }
    }
    if (settled.length) stmts.push(guard(env, `UPDATE mkt SET paid = 1 WHERE seller = ? AND state = 1 AND paid = 0 AND id IN (${settled.map(() => '?').join(', ')}) AND`, [uid, ...settled], uid, ver, tx));
    for (const g of got) {   // 补偿：记下领过了（同一份同时领两次，只有一次写得进去）；流水记成 gift_got（gift 是新手礼）
      stmts.push(ins(env, 'INSERT INTO gift_got (gid, uid, at) SELECT ?, ?, ?', [g.id, uid, now], uid, ver, tx));
      stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'gift_got', 1, null, null, JSON.stringify({ id: g.id, note: g.note, ink: g.ink || undefined, cases: Object.keys(g.cases).length ? g.cases : undefined, term: g.term || undefined, tags: g.tags || undefined })], uid, ver, tx));
    }
    stmts.push(ins(env, 'INSERT INTO econ_nonce (uid, nonce, at, res_json) SELECT ?, ?, ?, ?', [uid, nonce, now, JSON.stringify(out)], uid, ver, tx));
    if (code) {   // 兑换码：记下这个号领过了、这个码又被领走一份（领满了 CHECK 让这一批整个作废）；流水记成 code_got
      if (!code.alreadyGot) stmts.push(ins(env, `INSERT INTO code_got (code, uid, at) SELECT ?, ?, ?`, [code.code, uid, now], uid, ver, tx));
      if (!code.builtin) stmts.push(guard(env, 'UPDATE code SET got = got + 1 WHERE code = ? AND', [code.code], uid, ver, tx));
      stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'code_got', 1, null, null, JSON.stringify({ code: code.code, note: code.note, promoAll: code.promoAll || undefined, synced: code.synced || undefined, n: code.n || undefined, ink: code.ink || undefined, cases: Object.keys(code.cases).length ? code.cases : undefined, term: code.term || undefined, tags: code.tags || undefined })], uid, ver, tx));
    }
    if (voided) {   // 作废兑换码收回的挂单：还在卖的撤下来；同一刻被别人买走的不受影响，钱照常结给卖家
      for (const l of voided.lst) stmts.push(guard(env, 'UPDATE mkt SET state = 2, done_at = ? WHERE id = ? AND seller = ? AND state = 0 AND', [now, l, uid], uid, ver, tx));
      stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'code_void', 1, null, null, JSON.stringify(voided).slice(0, 400)], uid, ver, tx));
    }
    if (legacy && legacy.length) stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'legacy', 1, null, null, JSON.stringify({ k: legacy }).slice(0, 400)], uid, ver, tx));
    if (!quiet) stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, act, res.err ? 0 : 1, eco.ink, E.ink, detail], uid, ver, tx));
    stmts.push(userWrite(env, uid, p, now, ver, tx));
    stmts.push(econWrite(env, uid, ver, now, srv, E.ink, stJson, tx));
    let results;
    try { results = await env.DB.batch(stmts); }
    catch (e) {
      const m = String(e && e.message || e);
      if (/econ_nonce/.test(m)) continue;   // 同一个编号的请求正好同时到：重来一遍会走上面“已经做过”
      if (/UNIQUE/.test(m) && mo && mo.list) continue;   // 挂单编号撞上了（几乎不可能）：换一个再来
      if (/gift_got/.test(m)) continue;   // 这份补偿刚被同一个号的另一个请求领走了：重读再算
      if (code && /code_got/.test(m)) return error('这个兑换码你已经领过了');   // 同一个号的另一个请求刚领走
      if (code && /CHECK constraint/i.test(m)) return error('这个兑换码已经被领完了');   // 最后几份刚被别人领走
      throw e;
    }
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;   // 版本冲突：别的请求先改了，重读再算
    eco.ink = E.ink; eco.ver = ver + 1;
    return json({ ok: true, ...out, state: C.publicState(st), ledger: ledgerOut(eco, now), skinsAdd: add, skinsDel: del, equip: eq, owned: st.promoAll ? p.owned : undefined, cfg, gifts: got.length ? got.map(({ id, ...g }) => g) : undefined });
  }
  return error('服务器忙，请再试一次', 503);
}

/* ---------- 进度计数（胜场、负场、侠客碎片）：和墨锭一样按条记账 ----------
 * 两台设备各自打了几局，云端要的是两边新增的加起来，不是谁大要谁、也不是后传的覆盖先传的。
 * 所以网页把“这次比上次多了几”记成一条条带编号的增量（prog.deltas），服务器每条只加一次（编号记在 srv.pg），
 * 存档里报上来的绝对数不认。网页重试、刷新后重报、两台设备同时报，都不会重复加。
 * 没有 prog 的存档（老版本网页）：报上来的绝对数不认，计数留在服务器上那份（不然能把进度退回去重新领）。 */
const PG_KEY = /^(netWins|netLosses|frags\.[a-z]{2,16})$/, PG_MAX = 1e6, PG_STEP = 10000, PG_KEEP = 10 * DAY_MS;
// 联机胜负场一天最多认 PG_NET_DAY 场（胜 + 负，按北京时间算一天）。一局 3v3 车轮战要好几分钟，一天打不了这么多；
// 以前每条增量最多能加 10000，改过请求的人一下就把胜场榜刷到 9999。超出的部分照样划掉（网页不会一直重报），只是不加。
const PG_NET_DAY = 60;
function clampPg(x) { return Math.max(0, Math.min(PG_MAX, Math.floor(+x || 0))); }
function pgVals(p) {
  const v = { netWins: clampPg(p.netWins), netLosses: clampPg(p.netLosses) };
  if (p.frags && typeof p.frags === 'object' && !Array.isArray(p.frags)) for (const [h, n] of Object.entries(p.frags)) if (PG_KEY.test('frags.' + h) && clampPg(n)) v['frags.' + h] = clampPg(n);
  return v;
}
function pgPut(p, v) {
  p.netWins = v.netWins || 0; p.netLosses = v.netLosses || 0;
  const frags = {};
  for (const [k, n] of Object.entries(v)) if (k.startsWith('frags.') && n > 0) frags[k.slice(6)] = n;
  p.frags = frags;
}
// 把还没记过的增量加到 vals 上；返回这次请求里所有已经记过的编号（新记的和以前记过的都算，网页据此划掉）
function pgApply(srv, vals, deltas, now) {
  const pg = srv.pg && typeof srv.pg === 'object' && !Array.isArray(srv.pg) ? srv.pg : (srv.pg = {});
  const acks = [];
  const day = Math.floor((now + 8 * 3600e3) / DAY_MS);
  const nd = srv.pgNet && typeof srv.pgNet === 'object' && srv.pgNet.d === day ? srv.pgNet : (srv.pgNet = { d: day, n: 0 });
  for (const e of (Array.isArray(deltas) ? deltas : []).slice(0, 60)) {
    if (!e || typeof e.id !== 'string' || !/^[0-9a-f]{8,32}$/.test(e.id) || !e.d || typeof e.d !== 'object') continue;
    if (pg[e.id]) { acks.push(e.id); continue; }
    for (const [k, d] of Object.entries(e.d)) {
      const n = Math.trunc(+d);
      if (!PG_KEY.test(k) || !Number.isFinite(n) || n === 0 || Math.abs(n) > PG_STEP || (n < 0 && !k.startsWith('frags.'))) continue;
      if (k === 'netWins' || k === 'netLosses') {
        const ok = Math.max(0, Math.min(n, PG_NET_DAY - nd.n));
        nd.n += ok;
        if (ok) vals[k] = clampPg((vals[k] || 0) + ok);
        continue;
      }
      vals[k] = clampPg((vals[k] || 0) + n);
    }
    pg[e.id] = now; acks.push(e.id);
  }
  for (const [id, at] of Object.entries(pg)) if (now - at > PG_KEEP) delete pg[id];
  const ids = Object.keys(pg);
  if (ids.length > 3000) ids.sort((a, b) => pg[a] - pg[b]).slice(0, ids.length - 3000).forEach(id => delete pg[id]);
  return acks;
}
// 给网页的计数：现在的数，和最近 10 天记过的编号（网页刷新后据此划掉已经记上的，不会把它们再算一遍）
function pgOut(prof, srv, now) {
  const pg = srv.pg && typeof srv.pg === 'object' ? srv.pg : {};
  const acks = Object.keys(pg).filter(id => now - pg[id] <= PG_KEEP).sort((a, b) => pg[b] - pg[a]).slice(0, 500);
  return { vals: pgVals(prof), acks };
}
// 存档里不是计数的部分，两份怎么合（确定的规则，谁先到谁后到结果都一样）：
//   侠客：两边有的都算；关卡星、青锋行最高波数：每一项取较高的（这是“最好成绩”，不是累计量）；
//   列传：每位侠客取重走次数多的、再取走得远的，结局合在一起；排位：按 at 取新的那份；online10Unlocked：有一边解锁就算
function mergeStored(stored, inc) {
  const out = {};
  const own = new Set([...(Array.isArray(stored.owned) ? stored.owned : []), ...(Array.isArray(inc.owned) ? inc.owned : [])].filter(h => typeof h === 'string' && /^[a-z]{2,16}$/.test(h)));
  out.owned = own.size ? [...own] : ['qingfeng'];
  const stars = {};
  for (const src of [stored.stageStars, inc.stageStars]) if (src && typeof src === 'object' && !Array.isArray(src)) for (const [k, v] of Object.entries(src)) if (/^[\w.-]{1,32}$/.test(k)) stars[k] = Math.max(stars[k] || 0, Math.max(0, Math.min(3, Math.floor(+v || 0))));
  out.stageStars = stars;
  out.qfx = Math.max(clampPg(stored.qfx), clampPg(inc.qfx));
  out.online10Unlocked = !!(stored.online10Unlocked || inc.online10Unlocked);
  if (stored.saga || inc.saga) out.saga = mergeSagaSrv(stored.saga, inc.saga);
  const sr = stored.rk && typeof stored.rk === 'object' ? stored.rk : null, ir = inc.rk && typeof inc.rk === 'object' ? inc.rk : null;
  if (sr || ir) out.rk = !ir ? sr : !sr ? ir : ((+sr.at || 0) > (+ir.at || 0) ? sr : ir);
  return out;
}
function cleanSagaSrv(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [h, r] of Object.entries(v)) {
    if (!/^[a-z]{2,16}$/.test(h) || !r || typeof r !== 'object') continue;
    out[h] = { r: Math.max(0, Math.min(1e6, Math.floor(+r.r || 0))), s: Math.max(0, Math.min(20, Math.floor(+r.s || 0))), f: /^[a-z0-9_]{0,16}$/.test(r.f || '') ? (r.f || '') : '', c: r.c ? 1 : 0,
      e: Array.isArray(r.e) ? Array.from(new Set(r.e.filter(x => typeof x === 'string' && /^[a-z0-9_]{1,16}$/.test(x)))).slice(0, 8) : [], t: Math.max(0, +r.t || 0) };
  }
  return out;
}
function mergeSagaSrv(a, b) {
  const A = cleanSagaSrv(a), B = cleanSagaSrv(b), out = {};
  for (const h of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = A[h], y = B[h];
    if (!x || !y) { out[h] = x || y; continue; }
    const win = x.r !== y.r ? (x.r > y.r ? x : y) : x.s !== y.s ? (x.s > y.s ? x : y) : (x.t >= y.t ? x : y);
    out[h] = { ...win, e: Array.from(new Set([...x.e, ...y.e])) };
  }
  return out;
}

/* ---------- 存档同步：墨锭走账本，皮肤以武库库存为准 ---------- */
async function handleProfilePost(env, auth, body, now) {
  const uid = auth.user.id;
  const ban = await banOf(env, uid, now);
  if (ban) return banned(ban);
  if (!(await hit(env, 'prof:' + uid, 40, 60e3, now))) return error('同步太频繁了，稍后自动重试', 429);
  const incoming = body.profile || body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return error('无效的存档数据');
  const ledger = body.ledger && typeof body.ledger === 'object' && Array.isArray(body.ledger.deltas) ? body.ledger : null;
  const prog = body.prog && typeof body.prog === 'object' && Array.isArray(body.prog.deltas) ? body.prog : null;
  const cfg = await cfgNow(env, now);
  for (let attempt = 0; attempt < 5; attempt++) {
    const urow = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(uid).first();
    const stored = parseProfile(urow ? urow.profile_json : '', auth.user.username);
    const eco = await loadEcon(env, uid, stored, now);
    const ink0 = eco.ink, ver = eco.ver;
    const p = { ...incoming };
    delete p.armory; delete p.ledger; delete p.prog;
    p.name = auth.user.username;
    p.updatedAt = now;
    // 计数走增量账；其余进度和服务器上那份按确定的规则合并，不让后到的一份把另一台设备的进度盖掉。
    // 不带 prog 的存档（老网页，或者改过的请求）也一样合并：报上来的绝对数不认，不然清掉本机存档再传一份旧的，就能把关卡星、列传、胜场退回去重新领
    let pgAcks = [];
    const vals = pgVals(stored);
    if (prog) pgAcks = pgApply(eco.srv, vals, prog.deltas, now);
    pgPut(p, vals);
    Object.assign(p, mergeStored(stored, incoming));
    // 老版本网页没有账本：拿它报的数和服务器上的差当作一条上报（一样有每日上限）
    const deltas = ledger ? ledger.deltas : [{ id: 'abs' + now.toString(36) + Math.floor(rnd() * 1e9).toString(36), d: clampInk(p.ink) - eco.ink }];
    const { capped, forged, paid, owed, allow, revoked } = applyDeltas(eco, deltas, now, cfg);
    p.ink = eco.ink;
    const sent = cleanSkins(p.skins), ev = ledger ? Math.floor(+ledger.ev) : -1;
    p.skins = mergeSkins(sent, eco.state, eco.srv, Number.isFinite(ev) ? ev : -1);
    p.equip = fixEquip(cleanEquip(p.equip), p.skins);
    const fix = { skinsAdd: p.skins.filter(k => !sent.includes(k)), skinsDel: sent.filter(k => !p.skins.includes(k)) };
    const stmts = [userWrite(env, uid, p, now, ver)];
    if (eco.ink !== ink0 || capped) stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, forged ? 'ink_spike' : 'ledger', 1, ink0, eco.ink, [capped ? `超过今天的额度 ${allow}，没认 ${capped}` : '', paid ? `补上以前记下的 ${paid}` : '', owed ? `还记着 ${owed}` : '', forged ? `一条上报 ${forged}` : '', revoked ? `反作弊撤回 ${revoked}` : ''].filter(Boolean).join('；')], uid, ver));
    stmts.push(econWrite(env, uid, ver, now, eco.srv, eco.ink, eco.stateJson));
    const results = await env.DB.batch(stmts);
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;
    eco.ver = ver + 1;
    return json({ ok: true, updatedAt: now, ledger: ledgerOut(eco, now), capped, owed, fix: fix.skinsAdd.length || fix.skinsDel.length ? fix : undefined, prog: prog ? { vals: pgVals(p), acks: pgAcks } : undefined });
  }
  return error('服务器忙，请稍后再试', 503);
}

// 新账号的默认存档（注册时没带存档、管理后台建号）
const newProfile = (name, now) => ({ name, ink: 100, owned: ['qingfeng'], frags: {}, pity: 0, spity: 0, skins: [], equip: {}, netWins: 0, netLosses: 0, rating: 1100, placed: 0, stageStars: {}, updatedAt: now });
// 注册时只接收墨锭和普通饰品；竞争数据、解锁、碎片和关卡进度都必须从服务器产生
function cleanInitial(prof, name, now) {
  const p = newProfile(name, now);
  p.ink = Math.min(clampInk(prof && prof.ink), REG_INK_CAP);
  p.skins = cleanSkins(prof && prof.skins).filter(k => !C.CS_KEYS.includes(k));
  p.equip = fixEquip(cleanEquip(prof && prof.equip), p.skins);
  return p;
}
// 不让注册的昵称：像是官方、开发者的。云端的 Dev 账号和别人一样按规则记账，只是这个名字只能在管理后台建、
// 重设密码（POST /api/admin/password），别人注册不了
// guest、游客：没登录时网页里的进度、任务都记在这个名字下面，注册成真账号会和没登录的状态串在一起
const RESERVED = /^(dev|dev_master|admin|administrator|root|system|gm|official|staff|guest|官方|系统|管理员|开发者|开发组|客服|刃影官方|游客)$/i;
async function profileOut(env, user, now) {
  const prof = parseProfile(user.profile_json, user.username);
  const eco = await loadEcon(env, user.id, prof, now);
  return { profile: overlay(prof, eco), ledger: ledgerOut(eco, now), prog: pgOut(prof, eco.srv, now) };
}

/* ---------- 玩家市场：看谁在卖什么、最近成交多少（挂单、买、撤都走 /api/econ） ---------- */
// 不给卖家是谁：只告诉看的人哪几单是他自己挂的
const mktTtl = () => C.cv(CFG_CACHE.cfg, 'mktDays') * DAY_MS;   // 挂单挂几天（管理员在线改过就按改过的）
async function handleMarket(env, uid, k, now) {
  await cfgNow(env, now);
  if (k) {
    if (!C.isItem(k)) return error('没有这件饰品', 404);
    const open = (await env.DB.prepare('SELECT id, st, price, at, seller = ? AS mine FROM mkt WHERE k = ? AND state = 0 AND at >= ? AND seller NOT IN (SELECT id FROM users WHERE deleted_at > 0) ORDER BY price, at LIMIT 80').bind(uid, k, now - mktTtl()).all()).results || [];
    const deals = (await env.DB.prepare('SELECT st, price, done_at AS at FROM mkt WHERE k = ? AND state = 1 ORDER BY done_at DESC LIMIT 120').bind(k).all()).results || [];
    return json({ ok: true, now, k, open: open.map(r => ({ l: r.id, st: r.st, price: r.price, at: r.at, mine: !!r.mine })), deals: deals.map(r => ({ st: r.st, price: r.price, at: r.at })) });
  }
  // 每一款：在卖几件、最低多少（普通版 n / lo，斩数版 sn / slo），最近一次成交（last / slast），30 天成交几次（d）
  const open = (await env.DB.prepare('SELECT k, st >= 0 AS s, COUNT(*) AS n, MIN(price) AS lo FROM mkt WHERE state = 0 AND at >= ? AND seller NOT IN (SELECT id FROM users WHERE deleted_at > 0) GROUP BY k, st >= 0').bind(now - mktTtl()).all()).results || [];
  const deals = (await env.DB.prepare('SELECT k, st >= 0 AS s, price FROM mkt WHERE state = 1 AND done_at > ? ORDER BY done_at DESC LIMIT 3000').bind(now - 30 * DAY_MS).all()).results || [];
  const items = {}, of = k => items[k] || (items[k] = { n: 0, lo: 0, sn: 0, slo: 0, last: 0, slast: 0, d: 0 });
  for (const r of open) { if (!C.isItem(r.k)) continue; const x = of(r.k); if (r.s) { x.sn = r.n; x.slo = r.lo; } else { x.n = r.n; x.lo = r.lo; } }
  for (const r of deals) { if (!C.isItem(r.k)) continue; const x = of(r.k); x.d++; if (r.s) x.slast = x.slast || r.price; else x.last = x.last || r.price; }
  return json({ ok: true, now, items });
}

/* ---------- 管理后台（/api/admin/*，要管理口令，见文件开头；网页版在这个 Worker 的 /admin） ---------- */
// 口令对的话给出是谁：「名字:口令」里的名字；只写了一个口令就是 admin// ===========================================================================
// 管理后台的公共部分：管理员身份和角色、登录、加减墨锭和东西、找回饰品、经济数值的存取
// ===========================================================================
// 文件结构：
//   1. 管理员身份：ADMIN_SECRET 里的口令（可写成「名字:口令」）或管理员账号登录换来的短效令牌
//   2. 角色和权限：adminCan（view 谁都能看；其他按角色放行）
//   3. 改号：adminAdjust（墨锭、武器箱、货郎、改名标签、发 / 收饰品）
//   4. 找回饰品：lostItems / adminRestore
//   5. 经济数值：cfgRow / cfgSave
//
// 找 bug 提示：所有管理操作都会带上管理员名字（who）和原因（why）写进流水，审计页按这两个字段查。
const ADMIN_MIN = 16;   // 管理口令至少 16 位：设成 123456 这种短的不认，免得被人猜中
function adminOf(env, request) {
  const tok = getBearerToken(request) || '', raw = String(env.ADMIN_SECRET || '').trim();
  if (!raw || tok.length < ADMIN_MIN || tok.length > 256) return '';
  let who = sameStr(tok, raw) ? 'admin' : '';   // 只写了一个口令（口令里带冒号、逗号也认）
  if (raw.includes(':')) for (const part of raw.split(/[,\n]/)) {
    const i = part.indexOf(':'), name = part.slice(0, i).trim(), sec = part.slice(i + 1).trim();
    if (i > 0 && sec && sameStr(tok, sec) && !who) who = name.slice(0, 20);
  }
  return who;
}
/* ---------- 管理员账号和角色 ----------
 * 管理网页先登录（POST /api/admin/login）换一个 1 小时的管理令牌（as_ 开头），网页只放在内存里，刷新、过期就要重新登录。
 * 两种登录：管理员账号（名字 + 密码，存在 admins 表，密码和玩家一样用 PBKDF2），或者 ADMIN_SECRET 里的口令（角色是“全部”，
 * 用来建第一批管理员账号；命令行 tools/admin/econ-admin.mjs 也还是直接带口令）。
 * 角色：view 只能看；econ 还能改墨锭、补偿、兑换码、经济数值、找回饰品；ban 还能封号、解封、重设玩家密码；all 什么都能做（功能开关、管理员账号）。
 * 每次登录、每次改管理员账号都记进 econ_log，和别的管理操作一样在「操作记录」里看得到。 */
const ADMIN_TTL = 60 * 60e3;
const ADMIN_ROLES = ['view', 'econ', 'ban', 'all'];
const ADMIN_ROLE_NAME = { view: '只能看', econ: '经济', ban: '封禁和账号', all: '全部' };
// 不写在这里的：GET 是 view，POST 是 all（管理员账号列表也只给 all 看）
const ADMIN_NEED = {
  'POST /api/admin/adjust': 'econ', 'POST /api/admin/restore': 'econ', 'POST /api/admin/gift': 'econ', 'POST /api/admin/gift/off': 'econ',
  'GET /api/admin/lost/scan': 'econ',
  'POST /api/admin/code': 'econ', 'POST /api/admin/code/off': 'econ', 'POST /api/admin/cfg': 'econ', 'POST /api/admin/cfg/undo': 'econ', 'POST /api/admin/mkt/cancel': 'econ',
  'POST /api/admin/ban': 'ban', 'POST /api/admin/pardon': 'ban', 'POST /api/admin/password': 'ban', 'POST /api/admin/batch': 'ban', 'GET /api/admin/export': 'ban',
  'POST /api/admin/player/devices/drop': 'ban', 'POST /api/admin/player/clear-history': 'ban', 'GET /api/admin/player/export': 'ban',
  'POST /api/admin/errors/delete': 'ban', 'POST /api/admin/audit/compact': 'all', 'POST /api/admin/maint/prune': 'all', 'POST /api/admin/world/act': 'all',
  'POST /api/admin/audit/reset-reasons': 'all',
  'GET /api/admin/ai-players': 'view', 'POST /api/admin/ai-players/update': 'econ',
  'POST /api/admin/logout': 'view', 'POST /api/admin/refresh': 'view', 'GET /api/admin/admins': 'all',
};
const adminCan = (role, need) => role === 'all' || need === 'view' || role === need;
// ADMIN_SECRET 里写了名字的那些（只要名字）
function secretNames(env) {
  const raw = String(env.ADMIN_SECRET || '');
  return raw.includes(':') ? raw.split(/[,\n]/).map(p => p.slice(0, Math.max(0, p.indexOf(':'))).trim().toLowerCase()).filter(Boolean) : [];
}
// 这次请求是哪个管理员：{ who, role }；管理令牌过期、被停用是 { expired: true }；都不是就 null
async function adminAuth(env, request, now) {
  const tok = getBearerToken(request) || '';
  if (tok.startsWith('as_')) {
    if (tok.length > 80) return null;
    const r = await env.DB.prepare('SELECT s.name, COALESCE(a.role, s.role) AS role, s.expires_at, a.disabled FROM admin_sessions s LEFT JOIN admins a ON a.name = s.name WHERE s.token = ?').bind(await tokenKey(tok)).first();
    if (!r || r.expires_at <= now || r.disabled) return { expired: true };
    return { who: r.name, role: ADMIN_ROLES.includes(r.role) ? r.role : 'view', tok };
  }
  const who = adminOf(env, request);
  return who ? { who, role: 'all' } : null;
}
async function adminLogin(env, request, now, ip) {
  if ((await peek(env, 'admf:' + ip, now)) >= 20) return error('管理口令试错太多次了，一小时后再试', 429);
  const body = await readBody(request);
  if (!body) return error('请求太大', 413);
  const name = String(body.name || '').trim().slice(0, 20), pw = String(body.password || '');
  let who = '', role = '';
  if (name) {
    const a = await env.DB.prepare('SELECT name, role, password_hash, salt, password_algo, disabled FROM admins WHERE name = ?').bind(name).first();
    if (a && !a.disabled && pw.length <= 128 && await checkPassword(a, pw)) { who = a.name; role = a.role; }
  } else {
    const fake = new Request(request.url, { headers: { Authorization: 'Bearer ' + pw } });
    who = adminOf(env, fake); role = who ? 'all' : '';
  }
  if (!who) {
    await hit(env, 'admf:' + ip, 1e9, 3600e3, now);
    return error(name ? '名字或密码不对（或者这个管理员账号停用了）' : '口令不对', 403);
  }
  const token = 'as_' + randHex(32);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO admin_sessions (token, name, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await tokenKey(token), who, role, now, now + ADMIN_TTL),
    env.DB.prepare('UPDATE admins SET last_login = ? WHERE name = ?').bind(now, who),
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(now),
  ]);
  await logRow(env, '*', now, 'adm_login', 1, null, null, JSON.stringify({ by: who, role, how: name ? 'account' : 'secret' }));
  return json({ ok: true, token, who, role, expiresIn: ADMIN_TTL / 1000 });
}

const isPlain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const intIn = (v, lo, hi) => {   // 是整数、在范围里就给这个数，不然给 null；没填当 0
  if (v === undefined || v === null || v === '') return 0;
  const x = typeof v === 'number' ? v : typeof v === 'string' ? +v.trim() : NaN;
  return Number.isInteger(x) && x >= lo && x <= hi ? x : null;
};
const ADJ_INK = 1000000, ADJ_N = 1000;   // 一次最多加减这么多墨锭、这么多个箱子 / 货郎 / 标签
const ADMIN_GIVE_MAX = Object.keys(C.ITEM).length;

// 改一个玩家：墨锭、武器箱、货郎、改名标签加减，发饰品、收饰品，一次请求里的几样要么一起改成、要么都不改。
// 和玩家自己的操作走同一套带版本号的写入：玩家正好在开箱也不会互相覆盖。收走的皮肤记进 gone，旧存档加不回来
async function adminAdjust(env, u, body, who, why, now) {
  const dInk = intIn(body.ink, -ADJ_INK, ADJ_INK), dTerm = intIn(body.term, -ADJ_N, ADJ_N), dTags = intIn(body.tags, -ADJ_N, ADJ_N);
  const dSigils = body.sigils !== undefined ? intIn(body.sigils, -ADJ_N, ADJ_N) : 0;
  if (dInk === null) return error(`墨锭一次最多加减 ${ADJ_INK}，要填整数`);
  if (dTerm === null || dTags === null || dSigils === null) return error(`货郎、改名标签、徽记碎片一次最多加减 ${ADJ_N} 个，要填整数`);
  const cases = {};
  for (const [c, v] of Object.entries(isPlain(body.cases) ? body.cases : {})) {
    const n = intIn(v, -ADJ_N, ADJ_N);
    if (!C.CASES.includes(c) || n === null) return error(`武器箱 ${c} 不对：要是 ${C.CASES.join(' / ')}，一次最多加减 ${ADJ_N} 个`);
    if (n) cases[c] = n;
  }
  const give = Array.isArray(body.give) ? body.give : [], take = Array.isArray(body.take) ? body.take : [];
  if (give.length > ADMIN_GIVE_MAX || take.length > 200) return error(`一次最多发 ${ADMIN_GIVE_MAX} 件、收 200 件`);
  const gv = [];
  for (const g of give) {
    const k = isPlain(g) ? String(g.k || '') : String(g || ''), st = isPlain(g) && g.st !== undefined && g.st !== null && g.st !== '' && +g.st >= 0 ? intIn(g.st, 0, 1e7) : -1;
    if (!C.isItem(k)) return error(`没有这件饰品：${k}`);
    if (st === null) return error('斩数要是 0 到 10000000 的整数');
    gv.push({ k, st });
  }
  const tk = take.map(Number);
  if (tk.some(i => !Number.isInteger(i) || i < 1)) return error('要收的饰品编号不对');
  const badgesPatch = isPlain(body.badges) ? body.badges : null;
  const petsPatch = isPlain(body.pets) ? body.pets : null;
  const petEqPatch = isPlain(body.petEquip) ? body.petEquip : null;
  const badgeEqPatch = isPlain(body.badgeEquip) ? body.badgeEquip : null;
  const stancesPatch = isPlain(body.stances) ? body.stances : null;
  const skillsPatch = isPlain(body.skills) ? body.skills : null;
  const unlockAll = !!body.unlockAll;
  const hasLoadoutPatch = !!(dSigils || badgesPatch || petsPatch || petEqPatch || badgeEqPatch || stancesPatch || skillsPatch || unlockAll);
  if (!dInk && !dTerm && !dTags && !Object.keys(cases).length && !gv.length && !tk.length && !hasLoadoutPatch) return error('什么都没填，没有要改的');
  for (let attempt = 0; attempt < 5; attempt++) {
    const urow = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(u.id).first();
    const prof = parseProfile(urow ? urow.profile_json : '', u.username);
    const eco = await loadEcon(env, u.id, prof, now);
    const s = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid: u.id });
    const skins0 = mergeSkins(prof.skins, eco.state, eco.srv, eco.ver);
    const E = { now, rnd, uid: u.id, ink: eco.ink + dInk, skins: skins0.slice(), equip: fixEquip(cleanEquip(prof.equip), skins0), server: true };
    if (E.ink < 0) return error(`这个号只有 ${eco.ink} 墨锭，扣不了 ${-dInk}`);
    for (const [c, n] of Object.entries(cases)) {
      if (s.cases[c] + n < 0) return error(`这个号只有 ${s.cases[c]} 个${C.COLS[c].name}武器箱，扣不了 ${-n} 个`);
      s.cases[c] += n;
    }
    if (s.term + dTerm < 0) return error(`这个号只有 ${s.term} 台货郎`);
    if (s.tags + dTags < 0) return error(`这个号只有 ${s.tags} 张改名标签`);
    if ((s.badgeSigils || 0) + dSigils < 0) return error(`这个号只有 ${s.badgeSigils || 0} 枚徽记碎片`);
    s.term += dTerm; s.tags += dTags; s.badgeSigils = (s.badgeSigils || 0) + dSigils;
    if (unlockAll) {
      s.badgeGift = 1;
      for (const id of Object.keys(C.BADGES)) s.badgeOwned[id] = 'purpgold';
      for (const id of Object.keys(C.PETS)) s.petOwned[id] = 'immortal';
      for (const h of C.HERO_IDS) {
        s.heroKOs[h] = Math.max(s.heroKOs[h] || 0, 20);
        s.skillUnlocks[h] = { q: ['swift', 'heavy'], r: ['swift', 'heavy'], e: ['swift', 'heavy'] };
      }
    }
    if (badgesPatch) {
      for (const [id, tier] of Object.entries(badgesPatch)) {
        if (!C.own(C.BADGES, id)) return error(`没有这枚徽记：${id}`);
        if (!tier) { delete s.badgeOwned[id]; for (const h of Object.keys(s.badgeEquip)) if (s.badgeEquip[h] === id) delete s.badgeEquip[h]; }
        else if (C.own(C.BADGE_TIER, tier)) { s.badgeOwned[id] = tier; s.badgeGift = 1; }
        else return error(`徽记阶位不对：${tier}`);
      }
    }
    if (petsPatch) {
      for (const [id, tier] of Object.entries(petsPatch)) {
        if (!C.own(C.PETS, id)) return error(`没有这只灵宠：${id}`);
        if (!tier) { delete s.petOwned[id]; for (const h of Object.keys(s.petEquip)) if (s.petEquip[h] === id) delete s.petEquip[h]; }
        else if (C.own(C.PET_TIER, tier)) s.petOwned[id] = tier;
        else return error(`灵宠阶位不对：${tier}`);
      }
    }
    if (petEqPatch) {
      for (const [h, id] of Object.entries(petEqPatch)) {
        if (!C.HERO_IDS.includes(h)) return error(`没有这位侠客：${h}`);
        if (!id) delete s.petEquip[h];
        else if (C.own(C.PETS, id)) { if (!s.petOwned[id]) s.petOwned[id] = 'basic'; s.petEquip[h] = id; }
        else return error(`没有这只灵宠：${id}`);
      }
    }
    if (badgeEqPatch) {
      for (const [h, id] of Object.entries(badgeEqPatch)) {
        if (!C.HERO_IDS.includes(h)) return error(`没有这位侠客：${h}`);
        for (const k of Object.keys(s.badgeEquip)) if (k === h || (id && s.badgeEquip[k] === id)) delete s.badgeEquip[k];
        if (id) {
          if (!C.own(C.BADGES, id)) return error(`没有这枚徽记：${id}`);
          if (!s.badgeOwned[id]) { s.badgeOwned[id] = 'silver'; s.badgeGift = 1; }
          s.badgeEquip[h] = id;
        }
      }
    }
    if (stancesPatch) {
      for (const [h, st] of Object.entries(stancesPatch)) {
        if (!C.HERO_IDS.includes(h)) return error(`没有这位侠客：${h}`);
        const v = +st ? 1 : 0;
        if (v) s.heroKOs[h] = Math.max(s.heroKOs[h] || 0, 20);
        s.stances[h] = v;
      }
    }
    if (skillsPatch) {
      for (const [h, slots] of Object.entries(skillsPatch)) {
        if (!C.HERO_IDS.includes(h) || !isPlain(slots)) return error(`侠客招式配置不对：${h}`);
        if (!s.skillUnlocks[h]) s.skillUnlocks[h] = {};
        if (!s.skillLoadout[h]) s.skillLoadout[h] = {};
        for (const [sl, v] of Object.entries(slots)) {
          if (!C.SKILL_SLOTS.includes(sl) || !C.own(C.SKILL_VARIANTS, v)) return error(`招式槽位或流派不对：${sl}=${v}`);
          if (v !== 'std') {
            const cur = s.skillUnlocks[h][sl] || [];
            if (!cur.includes(v)) s.skillUnlocks[h][sl] = [...cur, v];
          }
          s.skillLoadout[h][sl] = v;
        }
      }
    }
    const given = gv.map(g => C.addItem(s, C.mkItem(s, g.k, 'admin', rnd, { st: g.st }), E)), taken = [];
    for (const i of tk) {
      if (s.lst.some(L => L.it.i === i)) return error(`第 ${i} 号饰品挂在玩家市场上，要等玩家撤下或者卖掉才能收`);
      const it = C.dropItem(s, i, E);
      if (!it) return error(`库存里没有第 ${i} 号饰品`);
      taken.push(it);
    }
    const bad = [E.ink, s.tags, s.term, s.badgeSigils, ...Object.values(s.cases)].find(v => !Number.isSafeInteger(v) || v < 0 || v > 1e12);
    if (bad !== undefined) return error('算出来的数不对，没有改');
    const add = E.skins.filter(k => !skins0.includes(k)), del = skins0.filter(k => !E.skins.includes(k));
    const ver = eco.ver, srv = eco.srv;
    for (const k of del) srv.gone[k] = [ver + 1, now];
    for (const k of add) delete srv.gone[k];
    pruneGone(srv, now);
    const p = { ...prof, ink: E.ink, skins: E.skins, equip: E.equip, updatedAt: now };
    delete p.armory; delete p.ledger;
    const detail = JSON.stringify({ by: who, why, ink: dInk || undefined, cases: Object.keys(cases).length ? cases : undefined, term: dTerm || undefined, tags: dTags || undefined,
      sigils: dSigils || undefined, unlockAll: unlockAll || undefined,
      badges: badgesPatch || undefined, pets: petsPatch || undefined, petEquip: petEqPatch || undefined, badgeEquip: badgeEqPatch || undefined, stances: stancesPatch || undefined, skills: skillsPatch || undefined,
      give: given.length ? given.map(itemRef) : undefined, take: taken.length ? taken.map(itemRef) : undefined });
    const results = await env.DB.batch([
      ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [u.id, now, 'admin', 1, eco.ink, E.ink, detail.slice(0, 12000)], u.id, ver),
      userWrite(env, u.id, p, now, ver),
      econWrite(env, u.id, ver, now, srv, E.ink, JSON.stringify(s)),
    ]);
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;   // 玩家刚好也在动：重读再改
    return json({ ok: true, uid: u.id, ink: E.ink, cases: s.cases, term: s.term, tags: s.tags, badgeSigils: s.badgeSigils, badgeOwned: s.badgeOwned, petOwned: s.petOwned, petEquip: s.petEquip, badgeEquip: s.badgeEquip, stances: s.stances, skillLoadout: s.skillLoadout, given, taken });
  }
  return error('服务器忙，请再试一次', 503);
}

// ---------- 找回饰品：按流水查“拿到过、现在库存和挂单里都没有”的饰品，管理员确认后放回去 ----------
// 正常的去向（熔铸掉、一键卖掉重复的、在玩家市场卖掉）只列出来，不能找回（找回就是凭空多一件）；
// 去向不明的（某一步操作里突然没了、旧流水没记去向）和管理员收走的可以找回。找回过的会标出来，不能再找回第二次
const LOST_WHY = { trade: '熔铸掉了', sellDupes: '一键卖掉了重复的', sold: '在玩家市场卖掉了', admin: '管理员收走了' };
const parseItemRef = t => { const m = /^([a-z]{2}_[a-z0-9]+)#(\d+)( st(\d+)?)?$/.exec(String(t)); return m && C.isItem(m[1]) ? { k: m[1], i: +m[2], st: m[3] ? +(m[4] || 0) : -1, n: m[4] !== undefined } : null; };   // 老流水只记了 st，没有斩数
async function lostItems(env, uid, all = false) {
  const row = await env.DB.prepare('SELECT state_json FROM econ WHERE uid = ?').bind(uid).first();
  const st = parseObj(row && row.state_json) || C.blank(), here = new Set();
  for (const it of Array.isArray(st.inv) ? st.inv : []) if (it) here.add(+it.i);
  for (const L of Array.isArray(st.lst) ? st.lst : []) if (L && L.it) here.add(+L.it.i);
  const sold = new Set();
  for (const r of (await env.DB.prepare('SELECT item_json FROM mkt WHERE seller = ? AND state = 1').bind(uid).all()).results || []) { const it = parseObj(r.item_json); if (it) sold.add(+it.i); }
  const log = []; let after = 0;
  for (;;) {
    const page = (await env.DB.prepare('SELECT id, at, act, ok, detail FROM econ_log WHERE uid = ? AND id > ? ORDER BY id LIMIT 5000').bind(uid, after).all()).results || [];
    log.push(...page);
    if (page.length < 5000) break;
    after = page[page.length - 1].id;
  }
  const seen = new Map();
  const one = (x, fresh) => { let o = seen.get(x.i); if (!o) seen.set(x.i, o = { i: x.i, k: x.k, st: x.st }); else if (fresh || x.n) { o.k = x.k; o.st = x.st; } return o; };   // 记了斩数的以最近一次为准；老流水没记斩数，以拿到时的为准
  const got = (t, r) => { const x = parseItemRef(t); if (x) { const o = one(x, true); if (!o.got) o.got = { at: r.at, act: r.act }; } };
  const gone = (t, r, why) => { const x = typeof t === 'number' ? seen.get(t) : parseItemRef(t); if (!x) return; const o = one(x); o.gone = { at: r.at, act: r.act, why }; o.restored = null; };
  for (const r of log) {
    const d = parseObj(r.detail); if (!d) continue;
    if (r.act === 'restore') { for (const x of Array.isArray(d.items) ? d.items : []) { const o = seen.get(+x.from); if (o) o.restored = { at: r.at, to: x.to }; } for (const t of d.ad || []) got(t, r); continue; }
    if (r.act === 'admin') { for (const t of d.give || []) got(t, r); for (const t of d.take || []) gone(t, r, 'admin'); continue; }
    if (!r.ok && !d.rm && !d.ad) continue;
    if (typeof d.r === 'string') got(d.r, r);   // 开箱、熔铸、货郎、买到的那一件
    for (const t of Array.isArray(d.ad) ? d.ad : []) got(t, r);
    for (const t of Array.isArray(d.rm) ? d.rm : []) gone(t, r);
    if (r.act === 'trade' && r.ok && !d.rm && d.a && Array.isArray(d.a.ids)) for (const i of d.a.ids) gone(+i, r);   // 旧流水没记进出：熔铸按参数里的编号算
  }
  const out = [];
  for (const o of seen.values()) {
    if (here.has(o.i)) continue;
    const g = o.gone, why = o.restored ? 'restored' : sold.has(o.i) ? 'sold' : g && g.why === 'admin' ? 'admin' : g && LOST_WHY[g.act] ? g.act : g ? 'odd' : 'unknown';
    out.push({ i: o.i, k: o.k, st: o.st, got: o.got || null, gone: g || null, why, can: ['admin', 'odd', 'unknown'].includes(why) });
  }
  out.sort((a, b) => ((b.gone && b.gone.at) || 0) - ((a.gone && a.gone.at) || 0) || b.i - a.i);
  return all ? out : out.slice(0, 300);
}
async function adminRestore(env, u, body, who, why, now) {
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number))] : [];
  if (!ids.length || ids.length > 50 || ids.some(i => !Number.isInteger(i) || i < 1)) return error('要找回的饰品编号不对（一次最多 50 件）');
  for (let attempt = 0; attempt < 5; attempt++) {
    const urow = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(u.id).first();
    const prof = parseProfile(urow ? urow.profile_json : '', u.username);
    const eco = await loadEcon(env, u.id, prof, now);
    const lost = new Map((await lostItems(env, u.id, true)).map(x => [x.i, x]));
    for (const i of ids) {
      const x = lost.get(i);
      if (!x) return error(`第 ${i} 号饰品不在“找不到的饰品”里（可能还在库存里，或者流水里没有它）`);
      if (!x.can) return error(`第 ${i} 号饰品${x.why === 'restored' ? '已经找回过了' : LOST_WHY[x.why] || '是正常没的'}，不能找回`);
      if (body.onlyUnknown === true && x.why !== 'unknown') return error(`第 ${i} 号饰品的去向已改变，请重新扫描`);
    }
    const s = C.normalize(JSON.parse(JSON.stringify(eco.state)), { now, uid: u.id });
    const skins0 = mergeSkins(prof.skins, eco.state, eco.srv, eco.ver);
    const E = { now, rnd, uid: u.id, ink: eco.ink, skins: skins0.slice(), equip: fixEquip(cleanEquip(prof.equip), skins0), server: true };
    const taken = new Set([...s.inv.map(x => x.i), ...s.lst.map(L => L.it.i)]), items = [];
    for (const i of ids) {
      const x = lost.get(i), to = taken.has(i) ? s.nid++ : i;   // 原来的编号空着就用原来的，流水里好对上
      taken.add(to); s.nid = Math.max(s.nid, to + 1);
      C.addItem(s, { i: to, k: x.k, st: x.st, n: '', t: now, src: 'restore' }, E);
      items.push({ from: i, to, k: x.k, st: x.st });
    }
    const add = E.skins.filter(k => !skins0.includes(k)), ver = eco.ver, srv = eco.srv;
    for (const k of add) delete srv.gone[k];
    const p = { ...prof, ink: E.ink, skins: E.skins, equip: E.equip, updatedAt: now };
    delete p.armory; delete p.ledger;
    const logs = [];
    for (let i = 0; i < items.length; i += 10) {
      const chunk = items.slice(i, i + 10);
      const detail = JSON.stringify({ by: who, why, items: chunk, ad: chunk.map(x => itemRef({ k: x.k, i: x.to, st: x.st })) });
      logs.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [u.id, now, 'restore', 1, eco.ink, E.ink, detail], u.id, ver));
    }
    const results = await env.DB.batch([
      ...logs,
      userWrite(env, u.id, p, now, ver),
      econWrite(env, u.id, ver, now, srv, E.ink, JSON.stringify(s)),
    ]);
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;   // 玩家刚好也在动：重读再改
    return json({ ok: true, uid: u.id, items });
  }
  return error('服务器忙，请再试一次', 503);
}

async function cfgRow(env, id) {
  const r = id ? await env.DB.prepare('SELECT id, json, by, note, at FROM cfg WHERE id = ?').bind(id).first()
    : await env.DB.prepare('SELECT id, json, by, note, at FROM cfg ORDER BY id DESC LIMIT 1').first();
  return r ? { id: r.id, cfg: parseObj(r.json) || {}, by: r.by, note: r.note, at: r.at } : null;
}
async function cfgSave(env, cfg, who, why, now) {   // 存成新的一版，这个实例马上换成新的
  const r = await env.DB.prepare('INSERT INTO cfg (json, by, note, at) VALUES (?, ?, ?, ?)').bind(JSON.stringify(cfg), who, why, now).run();
  const id = r.meta && r.meta.last_row_id ? Number(r.meta.last_row_id) : ((await cfgRow(env)) || {}).id || 0;
  CFG_CACHE = { at: now, id, cfg };
  return id;
}
const sameCfg = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
// ===========================================================================
// 管理后台的接口：/api/admin/*（网页版 /admin 和 tools/admin/econ-admin.mjs 都走这里）
// ===========================================================================
// handleAdmin 是一长串「if (route === 'METHOD /api/admin/xxx')」，按功能分成下面几段：
//   1. 登录和权限：口令试错限速、取管理员身份、按角色放行（ADMIN_NEED 在 30-admin-helpers.js）
//   2. 管理员账号：whoami / refresh / logout / admins
//   3. 查询：饰品目录、总览统计、游玩统计、错误记录（查看 / 删除 / 导出）
//   4. 找号和单个号的详情：find / econ
//   5. 管理操作审计：audit（分组、列表、重置原因、归档）
//   6. 改号：adjust、找回饰品、封号 / 解封、批量、导出、重设密码
//   7. 补偿和兑换码：gift / code
//   8. 经济数值、登录记录、功能开关：cfg / authlog / flags
//   9. 玩家维护：踢设备、清历史、撤挂单、导出存档
//  10. 数据库维护和全服活动：maint / world/act
//  最后：管理网页本身（adminPage，打包时把 cloudflare/admin.html 嵌进来）
//
// 找 bug 提示：每个接口都以 route 字符串开头，直接搜 'POST /api/admin/xxx' 就能找到；
// 改了东西的接口都会写一条流水（log 表），出问题时先在管理后台的「操作记录」里看当时的参数。


async function handleAdmin(env, request, path, now, ip) {
  // ---------- 1. 登录和权限 ----------
  if (path === '/api/admin/login' && request.method === 'POST') return adminLogin(env, request, now, ip);
  if ((await peek(env, 'admf:' + ip, now)) >= 20) return error('管理口令试错太多次了，一小时后再试', 429);
  const me = await adminAuth(env, request, now);
  if (me && me.expired) return error('管理登录过期了，请重新登录', 401);
  if (!me) { await hit(env, 'admf:' + ip, 1e9, 3600e3, now); return error('没有权限', 403); }
  const who = me.who, role = me.role;
  const url = new URL(request.url), q = k => String(url.searchParams.get(k) || '').trim().slice(0, 64);
  const post = request.method === 'POST', body = post ? (await readBody(request)) : {};
  if (!body) return error('请求太大', 413);
  const why = String(body.why || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
  const needWhy = () => why.length >= 2 ? null : error('要写上原因（至少 2 个字），会记进流水');
  const findUser = key => key ? env.DB.prepare('SELECT id, username, created_at, deleted_at FROM users WHERE id = ? OR username = ?').bind(key, key).first() : null;
  // 封号、解封（单个和批量共用）
  const banUser = async (u, perm, days) => {
    const rec = await sanctionOf(env, u.id);
    const until = perm ? rec.banUntil : Math.max(rec.banUntil, now + days * DAY_MS), log = rec.log.concat({ r: why.slice(0, 60), at: now, src: 'admin:' + who }).slice(-20);
    await env.DB.prepare('INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0) ON CONFLICT(uid) DO UPDATE SET ban_until = ?3, perm = ?4, log_json = ?5, at = ?6')
      .bind(u.id, rec.strikes, until, perm || rec.perm ? 1 : 0, JSON.stringify(log), now).run();
    await logRow(env, u.id, now, 'admin_ban', 1, null, null, JSON.stringify({ by: who, why, days: perm ? 'perm' : days }));
    return { banUntil: until, perm: perm || rec.perm };
  };
  const pardonUser = async (u, note) => {
    await env.DB.prepare("INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES (?1, 0, 0, 0, '[]', ?2, ?2) ON CONFLICT(uid) DO UPDATE SET strikes = 0, ban_until = 0, perm = 0, log_json = '[]', at = ?2, pardon = ?2").bind(u.id, now).run();
    await logRow(env, u.id, now, 'pardon', 1, null, null, JSON.stringify({ by: who, why: note }));
  };
  const bundleIn = (noun, eg) => {   // 补偿、兑换码里的东西：墨锭、每种武器箱、货郎、改名标签，还有饰品和给玩家看的说明
    const ink = intIn(body.ink, 0, ADJ_INK), term = intIn(body.term, 0, 100), tags = intIn(body.tags, 0, 100);
    if (ink === null) return { err: `墨锭要填 0 到 ${ADJ_INK} 的整数` };
    if (term === null || tags === null) return { err: '货郎、改名标签每份最多 100 个' };
    const cases = {};
    for (const [c, v] of Object.entries(isPlain(body.cases) ? body.cases : {})) {
      const n = intIn(v, 0, 100);
      if (!C.CASES.includes(c) || n === null) return { err: `武器箱 ${c} 不对：每份每种最多 100 个` };
      if (n) cases[c] = n;
    }
    const skins = [];
    const rawSkins = Array.isArray(body.skins) ? body.skins : Array.isArray(body.give) ? body.give : [];
    for (const item of rawSkins) {
      const k = typeof item === 'string' ? item : (item && item.k);
      if (!C.isItem(k)) return { err: `不认识的饰品：${k}` };
      const st = item && item.st !== undefined ? (item.st >= 0 ? Math.floor(+item.st || 0) : -1) : -1;
      skins.push({ k, st });
    }
    if (skins.length > 20) return { err: '每份最多附带 20 件饰品' };
    if (!ink && !term && !tags && !Object.keys(cases).length && !skins.length) return { err: noun + '里什么都没有' };
    const note = String(body.note || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60);
    if (note.length < 2) return { err: `要写给玩家看的说明（至少 2 个字），比如「${eg}」` };
    return { ink, cases, term, tags, skins, note };
  };
  const bundleLog = b => ({ ink: b.ink || undefined, cases: Object.keys(b.cases).length ? b.cases : undefined, term: b.term || undefined, tags: b.tags || undefined, skins: (b.skins && b.skins.length) ? b.skins : undefined });
  const route = (post ? 'POST ' : 'GET ') + path;
  const need = ADMIN_NEED[route] || (post ? 'all' : 'view');
  if (!adminCan(role, need)) return error(`你的管理员角色（${ADMIN_ROLE_NAME[role]}）不能做这件事，要「${ADMIN_ROLE_NAME[need]}」`, 403, { role });

  // ---------- 2. 管理员账号 ----------
  if (route === 'GET /api/admin/whoami') return json({ ok: true, who, role, now });
  if (route === 'GET /api/admin/ai-training/export') {
    const after = Math.max(0, Number(q('after')) || 0), limit = Math.max(1, Math.min(20, Number(q('limit')) || 10));
    return json(await aiTrainingExport(env, after, limit));
  }
  if (route === 'POST /api/admin/refresh') {
    if (me.tok && me.tok.startsWith('as_')) {
      await env.DB.prepare('UPDATE admin_sessions SET expires_at = ? WHERE token = ?').bind(now + ADMIN_TTL, await tokenKey(me.tok)).run();
    }
    return json({ ok: true, who, role, expiresIn: ADMIN_TTL / 1000, now });
  }
  if (route === 'POST /api/admin/logout') {
    if (me.tok) await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(await tokenKey(me.tok)).run();
    return json({ ok: true });
  }
  if (route === 'GET /api/admin/admins') {   // 管理员账号（不含密码）；ADMIN_SECRET 里写了名字的也列出来（只有名字）
    const rows = (await env.DB.prepare('SELECT name, role, disabled, created_at, created_by, last_login FROM admins ORDER BY created_at').all()).results || [];
    return json({ ok: true, admins: rows, secrets: secretNames(env) });
  }
  if (route === 'POST /api/admin/admins') {   // 建管理员账号，或者改它的角色、密码、停用 / 启用
    const w = needWhy(); if (w) return w;
    const name = String(body.name || '').trim();
    if (!/^[A-Za-z0-9_\-\u4e00-\u9fa5]{2,20}$/.test(name)) return error('名字要 2 到 20 个字（字母、数字、汉字、_、-）');
    if (name.toLowerCase() === 'admin' || secretNames(env).includes(name.toLowerCase())) return error('这个名字是 ADMIN_SECRET 口令用的，换一个');
    const old = await env.DB.prepare('SELECT name, role, disabled FROM admins WHERE name = ?').bind(name).first();
    const r = body.role === undefined && old ? old.role : String(body.role || '');
    if (!ADMIN_ROLES.includes(r)) return error('角色要是 view（只能看）、econ（经济）、ban（封禁和账号）或 all（全部）');
    const pw = body.password === undefined ? '' : String(body.password);
    if ((!old || pw) && (pw.length < 12 || pw.length > 128)) return error('密码要 12 到 128 位');
    const off = body.disabled === undefined ? (old ? old.disabled : 0) : (body.disabled ? 1 : 0);
    if (old && old.name.toLowerCase() === who.toLowerCase() && (off || r !== 'all')) return error('不能停用自己、也不能给自己降角色');
    const salt = randHex(16), hash = pw ? await pbkdf2(pw, salt, PW_ITER) : '';
    const st = [];
    if (!old) st.push(env.DB.prepare('INSERT INTO admins (name, role, password_hash, salt, password_algo, disabled, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(name, r, hash, salt, PW_ALGO, off, now, who));
    else if (pw) st.push(env.DB.prepare('UPDATE admins SET role = ?, disabled = ?, password_hash = ?, salt = ?, password_algo = ? WHERE name = ?').bind(r, off, hash, salt, PW_ALGO, name));
    else st.push(env.DB.prepare('UPDATE admins SET role = ?, disabled = ? WHERE name = ?').bind(r, off, name));
    if (old && (pw || off)) st.push(env.DB.prepare('DELETE FROM admin_sessions WHERE name = ?').bind(name));   // 改了密码、停用了：已经登录的马上失效
    await env.DB.batch(st);
    await logRow(env, '*', now, 'adm_acct', 1, null, null, JSON.stringify({ by: who, why, name, role: r, from: old ? old.role : undefined, disabled: off || undefined, pw: pw ? 1 : undefined, created: old ? undefined : 1 }));
    return json({ ok: true, name, role: r, disabled: off, created: !old });
  }
  // ---------- 3. 查询：目录、统计、错误记录 ----------
  if (route === 'GET /api/admin/catalog') {   // 管理网页用：武器箱、品质、饰品、侠客、徽记、灵宠、招式流派与经济数值
    return json({ ok: true, tiers: C.TIERS.map(t => ({ id: t, n: C.TIER[t].n, c: C.TIER[t].c })),
      cols: C.CASES.map(c => ({ id: c, name: C.COLS[c].name, prem: !!C.COLS[c].prem, themed: !!C.COLS[c].themed })),
      items: Object.keys(C.ITEM).map(k => ({ k, col: C.ITEM[k].col, tier: C.ITEM[k].tier, char: C.charOf(k) })),
      heroes: C.HERO_IDS, badges: C.BADGES, pets: C.PETS, skillVariants: C.SKILL_VARIANTS, cfg: C.CFG_INFO });
  }
  if (route === 'GET /api/admin/banner') {
    const row = await env.DB.prepare("SELECT note, by, at FROM flags WHERE k = '__banner__'").first();
    let banner = null;
    try { banner = row && row.note ? JSON.parse(row.note) : null; } catch (e) {}
    return json({ ok: true, banner, by: row ? row.by : '', at: row ? row.at : 0 });
  }
  if (route === 'POST /api/admin/banner') {
    const w = needWhy(); if (w) return w;
    const tag = String(body.tag || '').trim().slice(0, 24);
    const title = String(body.title || '').trim().slice(0, 80);
    const items = Array.isArray(body.items) ? body.items.slice(0, 6).map(x => ({ k: String((x && x.k) || '').trim().slice(0, 24), v: String((x && x.v) || '').trim().slice(0, 90) })).filter(x => x.k || x.v) : [];
    const payload = title ? JSON.stringify({ tag: tag || '最新大更新', title, items }) : '';
    await env.DB.prepare("INSERT INTO flags (k, mode, by, note, at) VALUES ('__banner__', 'all', ?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET by = ?1, note = ?2, at = ?3").bind(who, payload, now).run();
    await logRow(env, '*', now, 'flag', 1, null, null, JSON.stringify({ by: who, why, k: '__banner__', title: title || '(reset)' }));
    return json({ ok: true, banner: payload ? JSON.parse(payload) : null });
  }
  if (route === 'GET /api/admin/stats') {   // 总览与深度数据统计
    await cfgNow(env, now);
    const one = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
    const [users, fresh, eco, open, deals, banned, gone, inkFlow, opens24, signups, inkFlow7, caseOpens, pres] = await Promise.all([
      one("SELECT COUNT(*) AS n FROM users WHERE deleted_at = 0 AND COALESCE(password_algo, '') != 'ai-bot-locked'"),
      one("SELECT COUNT(*) AS n FROM users WHERE created_at > ? AND COALESCE(password_algo, '') != 'ai-bot-locked'", now - DAY_MS),
      one("SELECT COUNT(*) AS n, COALESCE(SUM(e.ink), 0) AS ink FROM econ e LEFT JOIN users u ON u.id = e.uid WHERE COALESCE(u.password_algo, '') != 'ai-bot-locked'"),
      one('SELECT COUNT(*) AS n FROM mkt WHERE state = 0'),
      one('SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS v FROM mkt WHERE state = 1 AND done_at > ?', now - DAY_MS),
      one('SELECT COUNT(*) AS n FROM sanctions WHERE perm = 1 OR ban_until > ?', now),
      one("SELECT COUNT(*) AS n FROM users WHERE deleted_at > 0 AND COALESCE(password_algo, '') != 'ai-bot-locked'"),
      one("SELECT COALESCE(SUM(CASE WHEN ink1 > ink0 THEN ink1 - ink0 ELSE 0 END), 0) AS inkIn, COALESCE(SUM(CASE WHEN ink0 > ink1 THEN ink0 - ink1 ELSE 0 END), 0) AS inkOut FROM econ_log WHERE at > ?", now - DAY_MS),
      one("SELECT COALESCE(SUM(CASE WHEN act = 'open' THEN 1 WHEN json_valid(detail) THEN COALESCE(json_extract(detail, '$.n'), 0) ELSE 0 END), 0) AS n FROM econ_log WHERE act IN ('open', 'openAll') AND ok = 1 AND at > ?", now - DAY_MS),
      env.DB.prepare("SELECT CAST((created_at / 86400000) AS INTEGER) AS d, COUNT(*) AS n FROM users WHERE created_at > ? AND COALESCE(password_algo, '') != 'ai-bot-locked' GROUP BY d ORDER BY d").bind(now - 7 * DAY_MS).all(),
      env.DB.prepare("SELECT CAST((at / 86400000) AS INTEGER) AS d, COALESCE(SUM(CASE WHEN ink1 > ink0 THEN ink1 - ink0 ELSE 0 END), 0) AS inkIn, COALESCE(SUM(CASE WHEN ink0 > ink1 THEN ink0 - ink1 ELSE 0 END), 0) AS inkOut FROM econ_log WHERE at > ? GROUP BY d ORDER BY d").bind(now - 7 * DAY_MS).all(),
      env.DB.prepare("SELECT detail FROM econ_log WHERE act IN ('open', 'openAll') AND ok = 1 AND at > ? LIMIT 1000").bind(now - 7 * DAY_MS).all(),
      one("SELECT COUNT(*) AS online, COALESCE(SUM(st = 'match'), 0) AS playing, COALESCE(SUM(st = 'queue'), 0) AS waiting FROM presence WHERE seen > ?", now - PRESENCE_WINDOW),
    ]);
    const signups7d = (signups && signups.results || []).map(r => r.n);
    const inkFlow7d = (inkFlow7 && inkFlow7.results || []).map(r => ({ d: r.d, inkIn: r.inkIn || 0, inkOut: r.inkOut || 0 }));
    const caseCounts = {};
    for (const r of (caseOpens && caseOpens.results || [])) {
      const d = parseObj(r.detail);
      const c = d && d.a && d.a.c;
      if (c) caseCounts[c] = (caseCounts[c] || 0) + 1;
      for (const [id, count] of Object.entries(d && d.cases || {})) if (C.CASES.includes(id)) caseCounts[id] = (caseCounts[id] || 0) + count;
    }
    return json({
      ok: true, who, now,
      users: users.n, newToday: fresh.n, accounts: eco.n, inkTotal: eco.ink,
      open: open.n, deals24: deals.n, dealInk24: deals.v, banned: banned.n, deleted: gone.n,
      inkIn24: (inkFlow && inkFlow.inkIn) || 0,
      inkOut24: (inkFlow && inkFlow.inkOut) || 0,
      open24: (opens24 && opens24.n) || 0,
      signups7d,
      inkFlow7d,
      caseCounts7d: caseCounts,
      online: (pres && pres.online) || 0,
      playing: (pres && pres.playing) || 0,
      waiting: (pres && pres.waiting) || 0,
      cfgId: CFG_CACHE.id,
    });
  }
  if (route === 'GET /api/admin/playstats') {   // 匿名游玩统计：每天人数、新玩家留存、各模式开局数、新手教学
    return json(await playStatsReport(env, now, Math.max(7, Math.min(90, +q('days') || 30))));
  }
  if (route === 'GET /api/admin/errors') {   // 错误记录：最近出现的在前；kind 不填就全部
    const kind = q('kind'), days = Math.max(1, Math.min(30, +q('days') || 7));
    const rows = (await env.DB.prepare(
      `SELECT sig, kind, msg, src, stack, meta, n, first_at, last_at, ms, ms_sum FROM errs WHERE last_at > ?1 ${kind ? 'AND kind = ?2' : ''} ORDER BY last_at DESC LIMIT 200`
    ).bind(...(kind ? [now - days * DAY_MS, kind] : [now - days * DAY_MS])).all()).results || [];
    return json({ ok: true, days, rows });
  }
  if (route === 'POST /api/admin/errors/delete') {   // 清理 / 删除错误日志（按 sig、按类别 kind、按天数 olderThanDays、或全部 all）
    const w = needWhy(); if (w) return w;
    const sig = String(body.sig || '').trim();
    const kind = String(body.kind || '').trim();
    const older = intIn(body.olderThanDays, 0, 365);
    let res;
    if (sig) {
      res = await env.DB.prepare('DELETE FROM errs WHERE sig = ?').bind(sig).run();
    } else if (kind && ['client', 'server', 'slow'].includes(kind)) {
      res = older ? await env.DB.prepare('DELETE FROM errs WHERE kind = ? AND last_at < ?').bind(kind, now - older * DAY_MS).run()
                  : await env.DB.prepare('DELETE FROM errs WHERE kind = ?').bind(kind).run();
    } else if (older && older > 0) {
      res = await env.DB.prepare('DELETE FROM errs WHERE last_at < ?').bind(now - older * DAY_MS).run();
    } else if (body.all === true) {
      res = await env.DB.prepare('DELETE FROM errs').run();
    } else {
      return error('请指定要清理的错误签名、类别或天数');
    }
    const deleted = (res && res.meta && res.meta.changes) || 0;
    await logRow(env, '*', now, 'err_clean', 1, null, null, JSON.stringify({ by: who, why, sig: sig || undefined, kind: kind || undefined, older: older || undefined, all: body.all || undefined, deleted }));
    return json({ ok: true, deleted });
  }
  if (route === 'GET /api/admin/errors/export' || (route === 'GET /api/admin/errors' && q('export') === '1')) {   // 导出全部错误单文件，供 Agent 诊断调试
    const kind = q('kind'), days = q('days') !== null && q('days') !== '' ? Math.max(0, Math.min(365, +q('days') || 0)) : 30;
    const format = (q('format') || 'json').toLowerCase();
    const where = [], args = [];
    if (days > 0) {
      where.push('last_at > ?');
      args.push(now - days * DAY_MS);
    }
    if (kind) {
      where.push('kind = ?');
      args.push(kind);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = (await env.DB.prepare(
      `SELECT sig, kind, msg, src, stack, meta, n, first_at, last_at, ms, ms_sum FROM errs ${whereSql} ORDER BY last_at DESC LIMIT 5000`
    ).bind(...args).all()).results || [];

    let totalOccurrences = 0;
    const kindCounts = { client: { types: 0, occurrences: 0 }, server: { types: 0, occurrences: 0 }, slow: { types: 0, occurrences: 0 } };
    const items = rows.map(r => {
      let metaObj = {};
      try { metaObj = JSON.parse(r.meta) || {}; } catch (e) { metaObj = { raw: r.meta }; }
      const occurrences = Math.max(1, r.n || 1);
      totalOccurrences += occurrences;
      if (kindCounts[r.kind]) {
        kindCounts[r.kind].types++;
        kindCounts[r.kind].occurrences += occurrences;
      }
      const avgMs = r.ms_sum && occurrences ? Math.round(r.ms_sum / occurrences) : 0;
      return {
        signature: r.sig,
        kind: r.kind,
        message: r.msg,
        source: r.src || '',
        occurrences,
        first_seen: new Date(r.first_at).toISOString(),
        last_seen: new Date(r.last_at).toISOString(),
        first_at_ms: r.first_at,
        last_at_ms: r.last_at,
        timing: {
          max_ms: r.ms || 0,
          avg_ms: avgMs,
          sum_ms: r.ms_sum || 0,
        },
        meta: metaObj,
        stack: r.stack || '',
      };
    });

    const dateStr = new Date(now).toISOString().slice(0, 10);
    await logRow(env, '*', now, 'err_export', 1, null, null, JSON.stringify({ by: who, kind: kind || undefined, days, format, n: rows.length }));

    if (format === 'md' || format === 'markdown') {
      const lines = [
        '# 刃影 (RenYing) 错误诊断报告 (Agent Debug Report)',
        '',
        `> 生成时间: ${new Date(now).toISOString()} | 操作管理员: ${who} | 检索范围: ${days > 0 ? `最近 ${days} 天` : '全部历史'} | 来源过滤: ${kind || '全部 (client, server, slow)'}`,
        '',
        '## 1. 概览 (Summary)',
        `- **不同错误种类 (Signatures)**: ${rows.length}`,
        `- **累计发生总次数 (Total Occurrences)**: ${totalOccurrences}`,
        '- **按类别分布**:',
        `  - 网页客户端 (client): ${kindCounts.client.types} 种 / ${kindCounts.client.occurrences} 次`,
        `  - 服务器异常 (server): ${kindCounts.server.types} 种 / ${kindCounts.server.occurrences} 次`,
        `  - 慢请求 (slow): ${kindCounts.slow.types} 种 / ${kindCounts.slow.occurrences} 次`,
        '',
        '## 2. 错误详情列表 (Error Details)',
        '',
      ];
      if (!items.length) {
        lines.push('_所选时间范围和过滤条件下无错误记录。_');
      } else {
        items.forEach((item, idx) => {
          lines.push(`### #${idx + 1} [${item.kind.toUpperCase()}] ${item.message}`);
          lines.push(`- **Signature**: \`${item.signature}\``);
          lines.push(`- **Source**: \`${item.source || '—'}\``);
          lines.push(`- **频次**: 发生 ${item.occurrences} 次 (首次: ${item.first_seen} | 最近: ${item.last_seen})`);
          if (item.timing.max_ms > 0) {
            lines.push(`- **耗时**: 最慢 ${item.timing.max_ms}ms | 平均 ${item.timing.avg_ms}ms`);
          }
          if (Object.keys(item.meta).length) {
            lines.push(`- **上下文元数据 (Meta)**: \`${JSON.stringify(item.meta)}\``);
          }
          if (item.stack) {
            lines.push('', '**调用栈 (Stack Trace)**:', '```', item.stack, '```');
          }
          lines.push('');
        });
      }
      return new Response(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="renying-errors-debug-${dateStr}.md"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const payload = {
      report: {
        title: '刃影 (RenYing) 错误诊断导出文件 (Agent Debug Export)',
        generated_at: new Date(now).toISOString(),
        generated_ms: now,
        exported_by: who,
        scope: {
          days,
          kind: kind || 'all',
          total_signatures: rows.length,
          total_occurrences: totalOccurrences,
          breakdown: kindCounts,
        },
        instruction_for_agent: '本文件汇集了刃影 (RenYing) 的客户端运行报错 (client)、服务端未捕获异常 (server) 以及慢请求 (slow)。请重点检查 occurrences 较高或 last_seen 较新的项，结合 source 位置、meta 上下文 (浏览器、屏幕、游戏模式、版本号) 以及 stack 调用栈进行根因排查。',
      },
      errors: items,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="renying-errors-debug-${dateStr}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  // ---------- 4. 找号和单个号的详情 ----------
  if (route === 'GET /api/admin/find') {   // 按昵称或账号找号；支持子串、账号ID、状态筛选、多维排序与分页
    const key = q('q').trim(), escKey = key.replace(/[\\%_]/g, m => '\\' + m), del = q('del') === '1', flt = q('filter');
    const sort = q('sort') || '', dir = q('dir') === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.max(1, Math.min(100, parseInt(q('limit')) || 20));
    const offset = Math.max(0, parseInt(q('offset')) || 0);
    const cols = 'u.id, u.username, u.created_at, u.deleted_at, e.ink, COALESCE(e.updated_at, u.updated_at) AS updated_at, COALESCE(s.strikes, 0) AS strikes, COALESCE(s.perm, 0) AS perm, COALESCE(s.ban_until, 0) AS ban_until';
    const fltCond = flt === 'banned' ? ` AND (s.perm = 1 OR s.ban_until > ${now})`
      : flt === 'wealth' ? ' AND e.ink >= 10000'
      : flt === 'flagged' ? ' AND s.strikes > 0'
      : flt === 'active24h' ? ` AND COALESCE(e.updated_at, u.updated_at) > ${now - DAY_MS}`
      : '';
    const sortSql = sort === 'ink' ? `COALESCE(e.ink, -1) ${dir}, u.created_at DESC`
      : sort === 'created' ? `u.created_at ${dir}`
      : sort === 'strikes' ? `COALESCE(s.strikes, 0) ${dir}, COALESCE(e.updated_at, u.updated_at) DESC`
      : sort === 'username' ? `u.username ${dir}`
      : sort === 'updated' ? `COALESCE(e.updated_at, u.updated_at) ${dir}`
      : '';
    const humanOnly = "COALESCE(u.password_algo, '') != 'ai-bot-locked'";
    let total = 0, rows = [];
    if (key) {
      const prefix = escKey + '%', substr = '%' + escKey + '%';
      const w = `${humanOnly} AND (u.username LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.id = ? OR u.id LIKE ? ESCAPE '\\')${del ? ' AND u.deleted_at > 0' : ''}${fltCond}`;
      const tot = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w}`).bind(prefix, substr, key, prefix).first();
      total = (tot && tot.n) || 0;
      const orderClause = sortSql || `(u.username = ?) DESC, (u.username LIKE ? ESCAPE '\\') DESC, length(u.username), u.username`;
      const binds = sortSql ? [prefix, substr, key, prefix, limit, offset] : [prefix, substr, key, prefix, key, prefix, limit, offset];
      rows = (await env.DB.prepare(`SELECT ${cols} FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w} ORDER BY ${orderClause} LIMIT ? OFFSET ?`)
        .bind(...binds).all()).results || [];
    } else if (del) {
      const w = `${humanOnly} AND u.deleted_at > 0${fltCond}`;
      const tot = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w}`).first();
      total = (tot && tot.n) || 0;
      rows = (await env.DB.prepare(`SELECT ${cols} FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w} ORDER BY ${sortSql || 'u.deleted_at DESC'} LIMIT ? OFFSET ?`).bind(limit, offset).all()).results || [];
    } else {
      const w = `${humanOnly}${fltCond}`;
      const tot = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w}`).first();
      total = (tot && tot.n) || 0;
      rows = (await env.DB.prepare(`SELECT ${cols} FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w} ORDER BY ${sortSql || 'COALESCE(e.updated_at, u.updated_at) DESC'} LIMIT ? OFFSET ?`).bind(limit, offset).all()).results || [];
    }
    return json({ ok: true, users: rows, total, limit, offset });
  }
  if (route === 'GET /api/admin/econ') {   // 一个号的武库存档、处罚、流水、市场记录、登录设备
    const u = await findUser(q('uid'));
    if (!u) return error('没有这个账号', 404);
    const [row, log, mk, pr, devs, legacySess] = await Promise.all([
      env.DB.prepare('SELECT state_json, ink, ver, updated_at FROM econ WHERE uid = ?').bind(u.id).first(),
      env.DB.prepare('SELECT id, at, act, ok, ink0, ink1, detail FROM econ_log WHERE uid = ? ORDER BY id DESC LIMIT 100').bind(u.id).all(),
      env.DB.prepare('SELECT id, seller, buyer, k, st, price, at, state, done_at, paid FROM mkt WHERE seller = ? OR buyer = ? ORDER BY at DESC LIMIT 60').bind(u.id, u.id).all(),
      env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(u.id).first(),
      env.DB.prepare('SELECT id, label, created_at, last_seen, expires_at FROM devices WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC').bind(u.id, now).all(),
      env.DB.prepare("SELECT COUNT(*) AS n, MAX(created_at) AS last FROM sessions WHERE user_id = ? AND dev = '' AND expires_at > ?").bind(u.id, now).first(),
    ]);
    const p = parseProfile(pr ? pr.profile_json : '', u.username);
    return json({ ok: true, uid: u.id, username: u.username, createdAt: u.created_at, deletedAt: u.deleted_at || 0, econ: row ? { ink: row.ink, ver: row.ver, at: row.updated_at, state: parseObj(row.state_json) } : null,
      profile: { rating: p.rating, placed: p.placed, netWins: p.netWins, netLosses: p.netLosses, skins: cleanSkins(p.skins).length, updatedAt: p.updatedAt },
      devices: (devs && devs.results) || [],
      legacySessions: (legacySess && legacySess.n) || 0,
      sanction: await sanctionOf(env, u.id), log: log.results || [], mkt: mk.results || [] });
  }
  // ---------- 5. 管理操作审计 ----------
  const auditActions = "'admin', 'restore', 'admin_ban', 'pardon', 'admin_pw', 'gift_new', 'gift_off', 'code_new', 'code_off', 'cfg', 'flag', 'adm_login', 'adm_acct', 'acct_del', 'acct_restore', 'acct_export', 'err_export', 'err_clean', 'adm_digest', 'maint_prune', 'world_act', 'dev_drop', 'hist_clear', 'mkt_cancel', 'audit_reason_reset'";
  // Future administrator actions are also shown when their audit detail identifies the actor.
  const auditWhere = `(l.act IN (${auditActions}) OR CASE WHEN json_valid(l.detail) THEN json_type(l.detail, '$.by') = 'text' ELSE 0 END)`;
  if (route === 'GET /api/admin/audit/groups') {
    const act = q('act'), by = q('by').toLowerCase(), before = Number(q('before')), requested = Number(q('snapshot'));
    const latest = await env.DB.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM econ_log').first();
    const snapshot = Number.isSafeInteger(requested) && requested > 0 ? requested : (latest && latest.id || 0);
    const cursor = Number.isSafeInteger(before) && before > 0 ? before : 0;
    const rows = (await env.DB.prepare(`SELECT strftime('%Y-%m-%d', l.at / 1000, 'unixepoch', '+8 hours') AS day, l.act, COUNT(*) AS n, MAX(l.id) AS last_id FROM econ_log l WHERE ${auditWhere} AND l.id <= ? AND (? = '' OR l.act = ?) AND (? = '' OR instr(lower(CASE WHEN json_valid(l.detail) THEN coalesce(json_extract(l.detail, '$.by'), '') ELSE '' END), ?) > 0) GROUP BY day, l.act HAVING (? = 0 OR MAX(l.id) < ?) ORDER BY last_id DESC LIMIT 101`).bind(snapshot, act, act, by, by, cursor, cursor).all()).results || [];
    const page = rows.slice(0, 100);
    return json({ ok: true, groups: page, snapshot, nextBefore: rows.length > 100 ? page[page.length - 1].last_id : null });
  }
  if (route === 'GET /api/admin/audit') {   // 管理员做过的事（谁、什么时候、改了谁、为什么），支持按类型或管理员筛选
    const actFilter = q('act'), byFilter = q('by').trim().toLowerCase();
    const before = Number(q('before'));
    const day = q('day'), snapshot = Number(q('snapshot'));
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return error('日期格式不对');
    const dayStart = day ? Date.parse(day + 'T00:00:00+08:00') : 0;
    if (day && !Number.isFinite(dayStart)) return error('日期格式不对');
    const cursor = Number.isSafeInteger(before) && before > 0 ? before : 0, ceiling = Number.isSafeInteger(snapshot) && snapshot > 0 ? snapshot : 0;
    const byTime = q('order') === 'time', rawAt = Number(q('beforeAt'));
    const beforeAt = Number.isSafeInteger(rawAt) && rawAt > 0 && cursor ? rawAt : 0;
    const paging = byTime ? 'AND (? = 0 OR l.at < ? OR (l.at = ? AND l.id < ?))' : 'AND (? = 0 OR l.id < ?)';
    const pagingArgs = byTime ? [beforeAt, beforeAt, beforeAt, cursor] : [cursor, cursor];
    const rows = (await env.DB.prepare(`SELECT l.id, l.at, l.uid, u.username, l.act, l.ink0, l.ink1, l.detail FROM econ_log l LEFT JOIN users u ON u.id = l.uid WHERE ${auditWhere} AND (? = '' OR l.act = ?) AND (? = '' OR instr(lower(CASE WHEN json_valid(l.detail) THEN coalesce(json_extract(l.detail, '$.by'), '') ELSE '' END), ?) > 0) ${paging} AND (? = 0 OR l.id <= ?) AND (? = '' OR (l.at >= ? AND l.at < ?)) ORDER BY ${byTime ? 'l.at DESC, l.id DESC' : 'l.id DESC'} LIMIT 101`)
      .bind(actFilter, actFilter, byFilter, byFilter, ...pagingArgs, ceiling, ceiling, day, dayStart, dayStart + DAY_MS).all()).results || [];
    const more = rows.length > 100;
    const page = rows.slice(0, 100);
    return json({ ok: true, rows: page, nextBefore: more ? page[page.length - 1].id : null, nextBeforeAt: more && byTime ? page[page.length - 1].at : null });
  }
  if (route === 'POST /api/admin/audit/reset-reasons') {
    const w = needWhy(); if (w) return w;
    const labels = { admin: '管理员调整', restore: '找回饰品', admin_ban: '封号', pardon: '解封', admin_pw: '重设密码', gift_new: '发补偿', gift_off: '停发补偿', code_new: '建兑换码', code_off: '停用兑换码', cfg: '改经济数值', flag: '改功能开关', adm_login: '管理员登录', adm_acct: '改管理员账号', acct_del: '删除账号', acct_restore: '恢复账号', acct_export: '导出账号', err_export: '导出错误日志', err_clean: '清理错误日志', adm_digest: '智能归档摘要', maint_prune: '数据库清理', world_act: '世界进度调控', dev_drop: '强制下线设备', hist_clear: '清理玩家历史', mkt_cancel: '强制撤下挂单', audit_reason_reset: '恢复默认原因' };
    const after = Number(body.after || 0), requested = Number(body.snapshot || 0);
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(requested) || requested < 0) return error('分页参数不对');
    const latest = requested ? null : await env.DB.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM econ_log').first();
    const snapshot = requested || (latest && latest.id) || 0;
    const rows = (await env.DB.prepare(`SELECT l.id, l.act, l.detail FROM econ_log l WHERE ${auditWhere} AND l.id > ? AND l.id <= ? ORDER BY l.id LIMIT 101`).bind(after, snapshot).all()).results || [];
    const page = rows.slice(0, 100), updates = []; let skipped = 0;
    for (const r of page) {
      const detail = parseObj(r.detail);
      if (!detail) { skipped++; continue; }
      const def = ('管理操作：' + (labels[r.act] || r.act)).slice(0, 100);
      if (detail.why === def) continue;
      if (!Object.prototype.hasOwnProperty.call(detail, '_auditReasonOriginal')) detail._auditReasonOriginal = { present: Object.prototype.hasOwnProperty.call(detail, 'why'), value: detail.why };
      detail.why = def;
      updates.push(env.DB.prepare('UPDATE econ_log SET detail = ? WHERE id = ? AND detail = ?').bind(JSON.stringify(detail), r.id, r.detail));
    }
    const results = updates.length ? await env.DB.batch(updates) : [];
    const changed = results.reduce((n, r) => n + (r.meta && r.meta.changes || 0), 0), conflicts = updates.length - changed;
    await logRow(env, '*', now, 'audit_reason_reset', 1, null, null, JSON.stringify({ by: who, why, changed, skipped, conflicts, after, snapshot }));
    return json({ ok: true, changed, skipped, conflicts, snapshot, nextAfter: rows.length > 100 ? page[page.length - 1].id : null });
  }
  if (route === 'POST /api/admin/audit/compact') {   // 智能审计归档与自动摘要：将冗余的管理员日志合并为结构化摘要 (adm_digest)
    const w = needWhy(); if (w) return w;
    const mode = String(body.mode || 'routine');   // 'routine' (合并登录/导出/巡检/调控等常规日志) 或 'all' (合并所有历史管理日志)
    const rawDays = body.olderThanDays !== undefined ? body.olderThanDays : body.keepDays;
    const keepDays = rawDays !== undefined ? Math.max(0, Math.min(365, +rawDays || 0)) : 0;
    const cutoff = keepDays > 0 ? now - keepDays * DAY_MS : now + 1000;
    const targetActs = mode === 'all'
      ? ['adm_login', 'acct_export', 'err_export', 'err_clean', 'maint_prune', 'world_act', 'dev_drop', 'hist_clear', 'mkt_cancel', 'admin', 'restore', 'admin_ban', 'pardon', 'admin_pw', 'gift_new', 'gift_off', 'code_new', 'code_off', 'cfg', 'flag', 'acct_del', 'acct_restore']
      : ['adm_login', 'acct_export', 'err_export', 'err_clean', 'maint_prune', 'world_act', 'dev_drop', 'hist_clear', 'mkt_cancel'];
    const placeholders = targetActs.map(() => '?').join(',');
    const rawRows = (await env.DB.prepare(
      `SELECT id, uid, at, act, ink0, ink1, detail FROM econ_log WHERE act IN (${placeholders}) AND at <= ? ORDER BY at ASC LIMIT 2000`
    ).bind(...targetActs, cutoff).all()).results || [];

    if (rawRows.length < 2) {
      return json({ ok: true, compacted: 0, digests: 0, days: 0, msg: '可合并的日志不足 2 条，无需归档' });
    }

    // 按自然日 (UTC 天) 分组检测并生成智能摘要
    const groups = new Map();
    for (const r of rawRows) {
      const dayKey = new Date(r.at).toISOString().slice(0, 10);
      if (!groups.has(dayKey)) groups.set(dayKey, []);
      groups.get(dayKey).push(r);
    }

    const stmts = [];
    let totalCompacted = 0, digestCount = 0;
    for (const [dayKey, list] of groups.entries()) {
      if (list.length < 2 && groups.size > 1) continue;   // 单条且有多天时不单独合并
      const actors = {}, acts = {};
      let netInk = 0, inkOps = 0;
      const highlights = [];
      for (const r of list) {
        const d = parseObj(r.detail) || {};
        const actor = d.by || 'system';
        actors[actor] = (actors[actor] || 0) + 1;
        acts[r.act] = (acts[r.act] || 0) + 1;
        if (r.ink0 !== null && r.ink1 !== null && r.ink0 !== undefined && r.ink1 !== undefined) {
          netInk += (r.ink1 - r.ink0);
          inkOps++;
        }
        if (['admin_ban', 'pardon', 'gift_new', 'code_new', 'cfg', 'flag', 'acct_del'].includes(r.act) && highlights.length < 8) {
          highlights.push(`${actor}:${r.act}${d.why ? '(' + d.why.slice(0, 20) + ')' : ''}`);
        }
      }
      const fromAt = list[0].at, toAt = list[list.length - 1].at;
      const summaryParts = [];
      for (const [k, cnt] of Object.entries(acts)) summaryParts.push(`${k}×${cnt}`);
      const digestDetail = JSON.stringify({
        by: who,
        why,
        day: dayKey,
        n: list.length,
        fromAt,
        toAt,
        actors,
        acts,
        netInk: inkOps ? netInk : undefined,
        highlights: highlights.length ? highlights : undefined,
        summary: `${dayKey} 归档 ${list.length} 条记录（${summaryParts.join('、')}）`,
      });
      const ids = list.map(x => x.id);
      // 分批删除归档原记录并插入摘要行
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        stmts.push(env.DB.prepare(`DELETE FROM econ_log WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk));
      }
      stmts.push(env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?, ?, ?, 1, NULL, NULL, ?)')
        .bind('*', toAt, 'adm_digest', digestDetail.slice(0, 1000)));
      totalCompacted += list.length;
      digestCount++;
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, compacted: totalCompacted, digests: digestCount, days: digestCount });
  }
  // ---------- 6. 改号：加减、找回、封号、批量、导出、重设密码 ----------
  if (route === 'POST /api/admin/adjust') {
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    return needWhy() || await adminAdjust(env, u, body, who, why, now);
  }
  if (route === 'GET /api/admin/lost/scan') {
    // Read-only, bounded pages; only items with evidence of acquisition and no recorded departure.
    const accounts = (await env.DB.prepare('SELECT u.id, u.username FROM users u JOIN econ e ON e.uid = u.id WHERE u.deleted_at = 0 AND u.id > ? ORDER BY u.id LIMIT 11').bind(q('after')).all()).results || [];
    const page = accounts.slice(0, 10), matches = [];
    for (const u of page) {
      const ids = (await lostItems(env, u.id, true)).filter(x => x.why === 'unknown' && x.can).map(x => x.i);
      if (ids.length) matches.push({ uid: u.id, username: u.username, ids });
    }
    return json({ ok: true, scanned: page.length, matches, next: accounts.length > 10 ? page[page.length - 1].id : null });
  }
  if (route === 'GET /api/admin/lost') {   // 找回饰品：这个号拿到过、现在没有的饰品，各自是哪一步没的
    const u = await findUser(q('uid'));
    if (!u) return error('没有这个账号', 404);
    return json({ ok: true, uid: u.id, username: u.username, items: await lostItems(env, u.id) });
  }
  if (route === 'POST /api/admin/restore') {   // 把找不到的饰品放回库存（只认去向不明、管理员收走的）
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    return needWhy() || await adminRestore(env, u, body, who, why, now);
  }
  if (route === 'POST /api/admin/ban') {   // 封几天或者永久；解封用 pardon
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    const w = needWhy(); if (w) return w;
    const perm = body.perm === true, days = intIn(body.days, 1, 3650);
    if (!perm && !days) return error('封几天要填 1 到 3650 的整数，永久封号选永久');
    return json({ ok: true, uid: u.id, ...(await banUser(u, perm, days)) });
  }
  if (route === 'POST /api/admin/pardon') {   // 解封，清空处罚记录（玩家刷新网页后生效）
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    await pardonUser(u, why || String(body.note || '').trim().slice(0, 100));
    return json({ ok: true, uid: u.id });
  }
  /* 批量：op 是 delete（删除）、restore（恢复）、ban（封号，带 days 或 perm）、pardon（解封），uids 一次最多 100 个。
   * 删除只是把 users.deleted_at 记成现在、退出这个号所有的登录：存档、武库、流水、市场记录一样不动，恢复就是改回 0，什么都不丢。
   * 删了的号登录不了、不上排行榜、挂的单别人看不到（到期照常撤下，恢复后退回），昵称还占着（别人注册不了，恢复不会撞名）。
   * 删除、恢复 Dev 要「全部」角色。每个号各记一条流水；做不了的（没有这个号、已经删了…）放在 skip 里说明，不影响别的。 */
  if (route === 'POST /api/admin/batch') {
    const w = needWhy(); if (w) return w;
    const op = String(body.op || '');
    if (!['delete', 'restore', 'ban', 'pardon'].includes(op)) return error('op 要是 delete、restore、ban 或 pardon');
    const keys = [...new Set((Array.isArray(body.uids) ? body.uids : []).map(x => String(x || '').trim().slice(0, 40)).filter(Boolean))];
    if (!keys.length || keys.length > 100) return error('一次选 1 到 100 个号');
    const perm = body.perm === true, days = intIn(body.days, 1, 3650);
    if (op === 'ban' && !perm && !days) return error('封几天要填 1 到 3650 的整数，永久封号选永久');
    const done = [], skip = [];
    for (const key of keys) {
      const u = await findUser(key);
      if (!u) { skip.push({ uid: key, why: '没有这个账号' }); continue; }
      if ((op === 'delete' || op === 'restore') && isDevUser(u) && role !== 'all') { skip.push({ uid: u.id, name: u.username, why: '删除、恢复 Dev 要「全部」角色' }); continue; }
      if (op === 'delete') {
        if (u.deleted_at) { skip.push({ uid: u.id, name: u.username, why: '已经删除了' }); continue; }
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at = 0').bind(now, u.id),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
          env.DB.prepare('DELETE FROM devices WHERE user_id = ?').bind(u.id),
        ]);
        await logRow(env, u.id, now, 'acct_del', 1, null, null, JSON.stringify({ by: who, why }));
      } else if (op === 'restore') {
        if (!u.deleted_at) { skip.push({ uid: u.id, name: u.username, why: '没有删除' }); continue; }
        await env.DB.prepare('UPDATE users SET deleted_at = 0 WHERE id = ?').bind(u.id).run();
        await logRow(env, u.id, now, 'acct_restore', 1, null, null, JSON.stringify({ by: who, why, since: u.deleted_at }));
      } else if (op === 'ban') await banUser(u, perm, days);
      else await pardonUser(u, why);
      done.push({ uid: u.id, name: u.username });
    }
    return json({ ok: true, op, done, skip });
  }
  /* 导出 CSV：q 和找号一样（昵称开头或编号，不填就全部），del=1 只要删除了的，del=0 只要没删的；最多 5000 行。
   * 开头带 BOM，Excel 打开中文不乱码；= + - @ 开头的格子前面加 '，Excel 不会当成公式。每次导出记一条流水 */
  if (route === 'GET /api/admin/export') {
    const key = q('q'), del = q('del'), where = ["COALESCE(u.password_algo, '') != 'ai-bot-locked'"], args = [];
    if (key) { where.push("(u.username LIKE ? ESCAPE '\\' OR u.id = ?)"); args.push(key.replace(/[\\%_]/g, m => '\\' + m) + '%', key); }
    if (del === '1') where.push('u.deleted_at > 0');
    if (del === '0') where.push('u.deleted_at = 0');
    const rows = (await env.DB.prepare(`SELECT u.id, u.username, u.created_at, u.updated_at, u.deleted_at, e.ink, e.updated_at AS econ_at, s.perm, s.ban_until, s.strikes FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.created_at LIMIT 5000`).bind(...args).all()).results || [];
    const iso = t => t ? new Date(t).toISOString() : '';
    const cell = v => { let t = String(v === null || v === undefined ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const lines = [['uid', 'username', 'created_at', 'updated_at', 'econ_at', 'ink', 'strikes', 'ban', 'deleted_at'].join(',')];
    for (const r of rows) lines.push([r.id, r.username, iso(r.created_at), iso(r.updated_at), iso(r.econ_at), r.ink === null ? '' : r.ink, r.strikes || 0, r.perm ? 'perm' : r.ban_until > now ? iso(r.ban_until) : '', iso(r.deleted_at)].map(cell).join(','));
    await logRow(env, '*', now, 'acct_export', 1, null, null, JSON.stringify({ by: who, q: key || undefined, del: del || undefined, n: rows.length }));
    return new Response('\ufeff' + lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="renying-users-${new Date(now).toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  }
  if (route === 'POST /api/admin/password') {   // 重设密码（新密码由管理员给，至少 12 位），这个号在别处的登录全部退出。create 为 true 时没有这个号就新建：dev 这类保留的昵称只能这样建
    const w = needWhy(); if (w) return w;
    const key = String(body.uid || '').trim(), pw = String(body.password || '');
    if (pw.length < 12 || pw.length > 128) return error('新密码要 12 到 128 位');
    let u = await findUser(key), created = false;
    // Dev 的库存不受限，建号、改它的密码只给「全部」
    if (role !== 'all' && (u ? isDevUser(u) : body.create === true)) return error('建号、改 Dev 的密码要「全部」角色', 403, { role });
    const pwr = await makePassword(env, u || { username: key }, pw, now);
    if (!u) {
      if (body.create !== true) return error('没有这个账号', 404);
      if (key.length < 2 || key.length > 20 || /^u_/i.test(key) || /[\u0000-\u001f\u007f<>]/.test(key)) return error('新账号的昵称要 2 到 20 个字，不能用 u_ 开头');
      u = { id: 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), username: key };
      await env.DB.prepare('INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at, password_algo, password_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(u.id, key, pwr.hash, pwr.salt, JSON.stringify(newProfile(key, now)), now, now, pwr.algo, now).run();
      created = true;
    } else {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, password_algo = ?, password_updated_at = ?, updated_at = ? WHERE id = ?').bind(pwr.hash, pwr.salt, pwr.algo, now, now, u.id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
        env.DB.prepare('DELETE FROM devices WHERE user_id = ?').bind(u.id),
        env.DB.prepare('DELETE FROM rate WHERE k = ?').bind('lf:' + String(u.username).toLowerCase().slice(0, 40)),
      ]);
    }
    await logRow(env, u.id, now, 'admin_pw', 1, null, null, JSON.stringify({ by: who, why, created: created || undefined }));
    await authLog(env, request, 'pw_admin', { uid: u.id, name: u.username, note: who });
    return json({ ok: true, uid: u.id, username: u.username, created });
  }
  // ---------- 7. 补偿和兑换码 ----------
  if (route === 'GET /api/admin/gifts') {
    const rows = await env.DB.prepare('SELECT g.id, g.uid, u.username, g.ink, g.items_json, g.note, g.by, g.at, g.until, g.born, g.off, (SELECT COUNT(*) FROM gift_got x WHERE x.gid = g.id) AS got FROM gift g LEFT JOIN users u ON u.id = g.uid ORDER BY g.at DESC LIMIT 50').all();
    return json({ ok: true, now, gifts: (rows.results || []).map(r => ({ ...r, items: giftItems(r.items_json), items_json: undefined })) });
  }
  if (route === 'POST /api/admin/gift') {   // 发补偿：to 是 all（所有人）或者一个号
    const to = String(body.to || 'all').trim();
    let uid = '*';
    if (to !== 'all' && to !== '*') { const u = await findUser(to); if (!u) return error('没有这个账号', 404); uid = u.id; }
    const b = bundleIn('补偿', '服务器维护补偿'), days = intIn(body.days === undefined ? 14 : body.days, 1, 90);
    if (b.err) return error(b.err);
    if (!days) return error('有效天数要填 1 到 90');
    const id = randHex(8), until = now + days * DAY_MS, born = uid === '*' && !body.newToo ? now : until;
    await env.DB.prepare('INSERT INTO gift (id, uid, ink, items_json, note, by, at, until, born, off) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
      .bind(id, uid, b.ink, JSON.stringify({ cases: b.cases, term: b.term, tags: b.tags, skins: b.skins }), b.note, who, now, until, born).run();
    await logRow(env, uid, now, 'gift_new', 1, null, null, JSON.stringify({ by: who, why: why || b.note, id, ...bundleLog(b), days, newToo: uid === '*' ? !!body.newToo : undefined }));
    return json({ ok: true, id, until });
  }
  if (route === 'POST /api/admin/gift/off') {   // 停发：还没领的就领不到了，已经领了的不收回
    const g = await env.DB.prepare('SELECT id, uid FROM gift WHERE id = ?').bind(String(body.id || '')).first();
    if (!g) return error('没有这份补偿', 404);
    const w = needWhy(); if (w) return w;
    await env.DB.prepare('UPDATE gift SET off = 1 WHERE id = ?').bind(g.id).run();
    await logRow(env, g.uid, now, 'gift_off', 1, null, null, JSON.stringify({ by: who, why, id: g.id }));
    return json({ ok: true });
  }
  if (route === 'GET /api/admin/codes') {
    const rows = await env.DB.prepare('SELECT code, ink, items_json, note, by, at, until, uses, got, off FROM code ORDER BY at DESC LIMIT 50').all();
    return json({ ok: true, now, codes: (rows.results || []).map(r => ({ ...r, items: giftItems(r.items_json), items_json: undefined })) });
  }
  if (route === 'POST /api/admin/code') {   // 建兑换码：code 不填就随机生成 10 位；uses 是最多几个号能领，每个号一次
    const b = bundleIn('兑换码', '新春礼包');
    if (b.err) return error(b.err);
    const uses = intIn(body.uses === undefined ? 100 : body.uses, 1, CODE_USES), days = intIn(body.days === undefined ? 14 : body.days, 1, 90);
    if (!uses) return error(`最多几个号能领要填 1 到 ${CODE_USES}`);
    if (!days) return error('有效天数要填 1 到 90');
    const raw = String(body.code || '').trim(), k = raw ? codeKey(raw) : randCode();
    if (!k) return error('兑换码只能用 4 到 20 位英文字母和数字');
    if (CODE_LOCAL.includes(k)) return error('游戏里已经有这个码了，换一个');
    const until = now + days * DAY_MS;
    try {
      await env.DB.prepare('INSERT INTO code (code, ink, items_json, note, by, at, until, uses, got, off) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)')
        .bind(k, b.ink, JSON.stringify({ cases: b.cases, term: b.term, tags: b.tags, skins: b.skins }), b.note, who, now, until, uses).run();
    } catch (e) {
      if (/UNIQUE|PRIMARY/i.test(String(e && e.message || e))) return error('已经有这个兑换码了，换一个', 409);
      throw e;
    }
    await logRow(env, '*', now, 'code_new', 1, null, null, JSON.stringify({ by: who, why: why || b.note, code: k, ...bundleLog(b), uses, days }));
    return json({ ok: true, code: k, until });
  }
  if (route === 'POST /api/admin/code/off') {   // 停用：还没领的就领不到了，已经领了的不收回
    const k = codeKey(body.code), c = k ? await env.DB.prepare('SELECT code FROM code WHERE code = ?').bind(k).first() : null;
    if (!c) return error('没有这个兑换码', 404);
    const w = needWhy(); if (w) return w;
    await env.DB.prepare('UPDATE code SET off = 1 WHERE code = ?').bind(c.code).run();
    await logRow(env, '*', now, 'code_off', 1, null, null, JSON.stringify({ by: who, why, code: c.code }));
    return json({ ok: true });
  }
  // ---------- 8. 经济数值、登录记录、功能开关 ----------
  if (route === 'GET /api/admin/cfg') {   // 现在的经济数值、每一项的范围和说明、最近改过的 30 版
    const cur = await cfgRow(env), hist = await env.DB.prepare('SELECT id, json, by, note, at FROM cfg ORDER BY id DESC LIMIT 30').all();
    return json({ ok: true, id: cur ? cur.id : 0, cfg: cur ? cur.cfg : {}, info: C.CFG_INFO, hist: (hist.results || []).map(r => ({ id: r.id, by: r.by, note: r.note, at: r.at, cfg: parseObj(r.json) || {} })) });
  }
  if (route === 'GET /api/admin/authlog') {   // 登录记录：q 是昵称或账号编号（不填就是全部最近的），act 只看某一种
    const key = q('q'), act = q('act'), u = key ? await findUser(key) : null;
    const where = [], args = [];
    if (u) { where.push("(l.uid = ? OR (l.uid = '' AND l.name = ? COLLATE NOCASE))"); args.push(u.id, u.username); }   // 没有这个号时输的昵称也算上
    else if (key) { where.push('l.name = ? COLLATE NOCASE'); args.push(key); }
    if (AUTH_ACTS.includes(act)) { where.push('l.act = ?'); args.push(act); }
    const rows = (await env.DB.prepare(`SELECT l.id, l.at, l.uid, l.name, u.username, l.act, l.ip, l.dev, l.note FROM auth_log l LEFT JOIN users u ON u.id = l.uid ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.id DESC LIMIT 200`).bind(...args).all()).results || [];
    return json({ ok: true, uid: u ? u.id : '', rows });
  }
  if (route === 'GET /api/admin/flags') {   // 所有登记过的开关：现在是什么、默认是什么、谁什么时候改的
    const rows = await flagRows(env, 0);
    return json({ ok: true, flags: Object.entries(FLAGS).map(([k, [def, desc, client]]) => ({ k, mode: flagMode(rows, k), def, desc, client: !!client, by: rows[k] ? rows[k].by : '', note: rows[k] ? rows[k].note : '', at: rows[k] ? rows[k].at : 0 })) });
  }
  if (route === 'POST /api/admin/flags') {   // k 是开关名，mode 是 off / dev / all
    const w = needWhy(); if (w) return w;
    const k = String(body.k || ''), mode = String(body.mode || '');
    if (!FLAGS[k]) return error('没有这个开关');
    if (!FLAG_MODES.includes(mode)) return error('mode 要是 off（关）、dev（只开 Dev 账号）或 all（所有人）');
    const before = flagMode(await flagRows(env, 0), k);
    await env.DB.prepare('INSERT INTO flags (k, mode, by, note, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(k) DO UPDATE SET mode = ?2, by = ?3, note = ?4, at = ?5').bind(k, mode, who, why, now).run();
    FLAG_CACHE = { db: null, at: 0, rows: {} };
    await logRow(env, '*', now, 'flag', 1, null, null, JSON.stringify({ by: who, why, k, from: before, to: mode }));
    return json({ ok: true, k, mode });
  }
  if (route === 'POST /api/admin/cfg') {   // set 里写要改的项；填 null 回到默认值
    const w = needWhy(); if (w) return w;
    if (!isPlain(body.set) || !Object.keys(body.set).length) return error('没写要改哪一项');
    const cur = await cfgRow(env), merged = { ...(cur ? cur.cfg : {}) };
    for (const [k, v] of Object.entries(body.set)) { if (v === null || v === '') delete merged[k]; else merged[k] = v; }
    const c = C.cleanCfg(merged);
    if (c.err) return error(c.err);
    if (sameCfg(c.cfg, cur ? cur.cfg : {})) return error('和现在的一样，没有要改的');
    const id = await cfgSave(env, c.cfg, who, why, now);
    await logRow(env, '*', now, 'cfg', 1, null, null, JSON.stringify({ by: who, why, id, set: body.set }).slice(0, 400));
    return json({ ok: true, id, cfg: c.cfg });
  }
  if (route === 'POST /api/admin/cfg/undo') {   // 退回到以前的某一版（to 填 0 就是全部回到默认值），存成新的一版
    const w = needWhy(); if (w) return w;
    const to = intIn(body.to, 0, 1e12);
    if (to === null) return error('要退回到第几版？');
    const old = to ? await cfgRow(env, to) : { cfg: {} };
    if (!old) return error('没有这一版', 404);
    const c = C.cleanCfg(old.cfg), cur = await cfgRow(env);
    if (c.err) return error('那一版的数值现在用不了：' + c.err);
    if (sameCfg(c.cfg, cur ? cur.cfg : {})) return error('现在用的就是这一版');
    const id = await cfgSave(env, c.cfg, who, (to ? `退回到第 ${to} 版：` : '全部回到默认值：') + why, now);
    await logRow(env, '*', now, 'cfg', 1, null, null, JSON.stringify({ by: who, why, id, undo: to }));
    return json({ ok: true, id, cfg: c.cfg });
  }
  // ---------- 9. 玩家维护 ----------
  if (route === 'POST /api/admin/player/devices/drop') {   // 强制退出玩家的指定设备或全部设备
    const w = needWhy(); if (w) return w;
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    const devId = String(body.dev || '').trim();
    if (devId && devId !== 'all') {
      await dropDevice(env, devId);
    } else {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
        env.DB.prepare('DELETE FROM devices WHERE user_id = ?').bind(u.id),
      ]);
    }
    await logRow(env, u.id, now, 'dev_drop', 1, null, null, JSON.stringify({ by: who, why, dev: devId || 'all' }));
    return json({ ok: true, uid: u.id, dev: devId || 'all' });
  }
  if (route === 'POST /api/admin/player/clear-history') {   // 清理玩家的处罚记过历史、流水记录或登录记录
    const w = needWhy(); if (w) return w;
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    const kind = String(body.kind || '');
    if (!['sanctions', 'econ_log', 'auth_log'].includes(kind)) return error('kind 要是 sanctions、econ_log 或 auth_log');
    let deleted = 0;
    if (kind === 'sanctions') {
      const r = await env.DB.prepare("UPDATE sanctions SET strikes = 0, log_json = '[]' WHERE uid = ?").bind(u.id).run();
      deleted = (r && r.meta && r.meta.changes) || 0;
    } else if (kind === 'econ_log') {
      const r = await env.DB.prepare('DELETE FROM econ_log WHERE uid = ?').bind(u.id).run();
      deleted = (r && r.meta && r.meta.changes) || 0;
    } else if (kind === 'auth_log') {
      const r = await env.DB.prepare('DELETE FROM auth_log WHERE uid = ? OR name = ? COLLATE NOCASE').bind(u.id, u.username).run();
      deleted = (r && r.meta && r.meta.changes) || 0;
    }
    await logRow(env, u.id, now, 'hist_clear', 1, null, null, JSON.stringify({ by: who, why, kind, deleted }));
    return json({ ok: true, uid: u.id, kind, deleted });
  }
  if (route === 'POST /api/admin/mkt/cancel') {   // 强制撤下玩家市场上的挂单（退回卖家下次同步）
    const w = needWhy(); if (w) return w;
    const lid = String(body.id || '').trim();
    const m = lid ? await env.DB.prepare('SELECT id, seller, k, st, price, state FROM mkt WHERE id = ?').bind(lid).first() : null;
    if (!m) return error('找不到这一单', 404);
    if (m.state !== 0) return error('这一单已经不是在卖状态了');
    await env.DB.prepare('UPDATE mkt SET state = 2, done_at = ? WHERE id = ? AND state = 0').bind(now, lid).run();
    await logRow(env, m.seller, now, 'mkt_cancel', 1, null, null, JSON.stringify({ by: who, why, id: lid, k: m.k, price: m.price }));
    return json({ ok: true, id: lid });
  }
  if (route === 'GET /api/admin/player/export') {   // 导出单个玩家的完整存档快照 JSON（供本地复现与调试）
    const u = await findUser(q('uid'));
    if (!u) return error('没有这个账号', 404);
    const [urow, erow, srow, mrows, lrows] = await Promise.all([
      env.DB.prepare('SELECT id, username, profile_json, created_at, updated_at, deleted_at FROM users WHERE id = ?').bind(u.id).first(),
      env.DB.prepare('SELECT state_json, srv_json, ink, ver, updated_at FROM econ WHERE uid = ?').bind(u.id).first(),
      sanctionOf(env, u.id),
      env.DB.prepare('SELECT id, seller, buyer, k, st, price, at, state, done_at, paid FROM mkt WHERE seller = ? OR buyer = ? ORDER BY at DESC LIMIT 100').bind(u.id, u.id).all(),
      env.DB.prepare('SELECT id, at, act, ok, ink0, ink1, detail FROM econ_log WHERE uid = ? ORDER BY id DESC LIMIT 200').bind(u.id).all(),
    ]);
    const snap = {
      exported_at: new Date(now).toISOString(),
      exported_by: who,
      user: {
        id: u.id,
        username: u.username,
        created_at: urow ? urow.created_at : 0,
        updated_at: urow ? urow.updated_at : 0,
        deleted_at: urow ? urow.deleted_at : 0,
        profile: urow ? parseObj(urow.profile_json) : null,
      },
      econ: erow ? {
        ink: erow.ink,
        ver: erow.ver,
        updated_at: erow.updated_at,
        state: parseObj(erow.state_json),
        srv: parseObj(erow.srv_json),
      } : null,
      sanction: srow,
      market: (mrows && mrows.results) || [],
      recent_log: (lrows && lrows.results) || [],
    };
    const dateStr = new Date(now).toISOString().slice(0, 10);
    return new Response(JSON.stringify(snap, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="renying-player-${u.id}-${dateStr}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  // ---------- 10. 数据库维护和全服活动 ----------
  if (route === 'GET /api/admin/maint') {   // 数据库各表行数统计与天魔 / 江湖长卷实时监控
    const one = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
    const tableNames = ['users', 'sessions', 'devices', 'refresh_used', 'econ', 'econ_nonce', 'econ_log', 'sanctions', 'rate', 'mkt', 'gift', 'gift_got', 'code', 'code_got', 'cfg', 'presence', 'flags', 'auth_log', 'admins', 'admin_sessions', 'errs', 'gboss', 'gboss_hit', 'gboss_try', 'saga_mark', 'chron', 'chron_done', 'chron_part', 'chron_claim', 'chron_rep', 'play_visitors', 'play_days', 'play_counts'];
    const counts = {};
    await Promise.all(tableNames.map(async t => {
      try {
        const r = await one(`SELECT COUNT(*) AS n FROM ${t}`);
        counts[t] = (r && r.n) || 0;
      } catch (e) { counts[t] = 0; }
    }));
    const b = await gbNow(env, now);
    const gb = await gbState(env, b, null, now);
    const cq = await chronGet(env, null);
    const curNode = cq.s && cq.s.node < CQ.N ? cqNode(cq.s.node) : null;
    return json({
      ok: true,
      now,
      tables: counts,
      gboss: gb,
      chron: { ...cq, curNode },
    });
  }
  if (route === 'POST /api/admin/maint/prune') {   // 手动清理数据库过期或历史冗余数据
    const w = needWhy(); if (w) return w;
    const target = String(body.target || 'expired');
    let deleted = 0;
    if (target === 'expired') {
      await cleanup(env, now);
      deleted = 1;
    } else if (target === 'econ_nonce') {
      const r = await env.DB.prepare('DELETE FROM econ_nonce').run();
      deleted = (r && r.meta && r.meta.changes) || 0;
    } else if (target === 'rate') {
      const r = await env.DB.prepare('DELETE FROM rate').run();
      deleted = (r && r.meta && r.meta.changes) || 0;
    } else if (target === 'presence') {
      const r = await env.DB.prepare('DELETE FROM presence WHERE seen < ?').bind(now - PRESENCE_WINDOW).run();
      deleted = (r && r.meta && r.meta.changes) || 0;
    } else if (target === 'auth_log_30d') {
      const r = await env.DB.prepare('DELETE FROM auth_log WHERE at < ?').bind(now - 30 * DAY_MS).run();
      deleted = (r && r.meta && r.meta.changes) || 0;
    } else if (target === 'econ_log_player_30d') {
      const r = await env.DB.prepare("DELETE FROM econ_log WHERE uid != '*' AND at < ? AND act IN ('sync', 'ledger', 'matchStart', 'matchEnd', 'equip', 'unequip')").bind(now - 30 * DAY_MS).run();
      deleted = (r && r.meta && r.meta.changes) || 0;
    } else {
      return error('不支持的清理项');
    }
    await logRow(env, '*', now, 'maint_prune', 1, null, null, JSON.stringify({ by: who, why, target, deleted }));
    return json({ ok: true, target, deleted });
  }
  if (route === 'POST /api/admin/world/act') {   // 调整全服天魔讨伐或全服肉鸽长卷进度
    const w = needWhy(); if (w) return w;
    const op = String(body.op || '');
    const b = await gbNow(env, now);
    if (op === 'gboss_hp') {
      const hp = intIn(body.hp, 1, 100000000);
      if (!hp) return error('血量要填 1 到 100,000,000 的整数');
      const maxHp = intIn(body.maxHp, hp, 100000000) || Math.max(hp, b.max_hp);
      await env.DB.prepare('UPDATE gboss SET hp = ?, max_hp = ? WHERE gen = ?').bind(hp, maxHp, b.gen).run();
      await logRow(env, '*', now, 'world_act', 1, null, null, JSON.stringify({ by: who, why, op, gen: b.gen, hp, maxHp }));
    } else if (op === 'gboss_reroll') {
      const bag = GB_AFFIX.slice(), affix = [];
      for (let n = Math.min(4, 2 + Math.floor((b.gen - 1) / 4)); n > 0; n--) affix.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]);
      await env.DB.prepare('UPDATE gboss SET affix = ? WHERE gen = ?').bind(affix.join(','), b.gen).run();
      await logRow(env, '*', now, 'world_act', 1, null, null, JSON.stringify({ by: who, why, op, gen: b.gen, affix: affix.join(',') }));
    } else if (op === 'gboss_next') {
      await env.DB.prepare('UPDATE gboss SET ended = ? WHERE gen = ? AND ended = 0').bind(now, b.gen).run();
      const b2 = await gbLatest(env);
      if (b2 && b2.ended && !b2.paid) await gbSettle(env, b2, now);
      await logRow(env, '*', now, 'world_act', 1, null, null, JSON.stringify({ by: who, why, op, gen: b.gen }));
    } else if (op === 'chron_advance') {
      const s = await chronRead(env);
      if (!s || s.node >= CQ.N) return error('全服长卷已经全部通关了');
      await env.DB.prepare('UPDATE chron SET got = need, at = ? WHERE id = 1 AND node = ?').bind(now, s.node).run();
      const s2 = await chronRead(env);
      await chronAdvance(env, s2, 0, now);
      await logRow(env, '*', now, 'world_act', 1, null, null, JSON.stringify({ by: who, why, op, node: s.node + 1 }));
    } else {
      return error('不支持的操作');
    }
    return json({ ok: true, op, gboss: await gbNow(env, now), chron: await chronRead(env) });
  }
  if (path === '/api/admin/ai-players' && request.method === 'GET') {
    return json(await aiAdminList(env, now));
  }
  if (path === '/api/admin/ai-players/update' && request.method === 'POST') {
    const ew = needWhy(); if (ew) return ew;
    const res = await aiAdminUpdate(env, body, who, why, now);
    if (res instanceof Response) return res;
    return json(res);
  }
  return error('Not found', 404);
}

// 管理网页：python3 tools/build.py 打包时把 cloudflare/admin.html 和它那段脚本的 sha256 放进来（直接跑 worker.js 时是空的）。
// 浏览器只许跑 sha256 对得上的那一段脚本：页面里就算混进了别的脚本、onclick 这种，也跑不起来
// ---------- 管理网页：内容和脚本哈希由 tools/build.py 打包时填进来（下面这一行的写法不能改，打包脚本按原样查找） ----------
const ADMIN_PAGE = { html: '', sha: '' };
function adminPage() {
  const html = ADMIN_PAGE.html || '<!doctype html><meta charset="utf-8"><title>刃影管理后台</title><p>管理网页在打包好的 cloudflare/worker.bundle.js 里，先运行 python3 tools/build.py。</p>';
  const script = ADMIN_PAGE.sha ? `'sha256-${ADMIN_PAGE.sha}'` : "'none'";
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; script-src ${script}; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
}
// ===========================================================================
// 维护和统计：定期清理旧数据、错误记录、在线人数、匿名游玩统计
// ===========================================================================
// 文件结构：
//   1. cleanup：删过期的错误、限速、会话等记录（每张表留多久写在每一行后面）
//   2. 错误记录：网页报上来的错误先去掉个人信息（errScrub），按签名合并计数
//   3. 在线人数：每个访客按 IP 的哈希记一次心跳
//   4. 匿名游玩统计：不存名字、账号、IP，只记每天人数、留存、各模式开局数
async function cleanup(env, now) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM errs WHERE last_at < ?').bind(now - 30 * DAY_MS),                              // 错误记录留 30 天
    env.DB.prepare('DELETE FROM econ_nonce WHERE at < ?').bind(now - 2 * DAY_MS),
    env.DB.prepare('DELETE FROM rate WHERE reset < ?').bind(now - DAY_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('UPDATE mkt SET state = 2, done_at = ? WHERE state = 0 AND at < ?').bind(now, now - mktTtl()),   // 到期没卖出的撤下；饰品在卖家下次动武库时退回
    env.DB.prepare('DELETE FROM mkt WHERE state = 2 AND done_at < ?').bind(now - 7 * DAY_MS),               // 撤下的单留一周（删了也没关系：存档里还挂着、表里找不到的一样退回）
    env.DB.prepare('DELETE FROM devices WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM refresh_used WHERE at < ?').bind(now - REFRESH_TTL),
    env.DB.prepare('DELETE FROM auth_log WHERE at < ?').bind(now - AUTH_LOG_DAYS * DAY_MS),
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM mkt WHERE state = 1 AND paid = 1 AND done_at < ?').bind(now - 120 * DAY_MS),   // 成交记录留四个月（价格走势用）
    env.DB.prepare('DELETE FROM presence WHERE seen < ?').bind(now - 10 * 60e3),
    env.DB.prepare('DELETE FROM gboss_try WHERE started < ?').bind(now - 7 * DAY_MS),
    env.DB.prepare('DELETE FROM chron_rep WHERE at < ?').bind(now - 2 * DAY_MS),                         // 分线上报的去重编号：重报只会在几分钟里，留两天够了
    env.DB.prepare('DELETE FROM play_days WHERE day < ?').bind(Math.floor((now + 8 * 3600e3) / DAY_MS) - 120),   // 匿名统计每天来过谁：留 120 天（够算留存）
    env.DB.prepare('DELETE FROM ai_training_matches WHERE received_at < ?').bind(now - 180 * DAY_MS),             // AI 对局训练样本留 180 天
  ]);
}

/* ---------- 错误记录 ----------
 * 网页出了没接住的错，src/errlog.js 脱敏以后报到 POST /api/err；这里再洗一遍（不信网页），同一种错合成一行计数。
 * 每个 IP 一小时最多 30 条，全服一小时最多 2000 条，多出来的直接丢（错误记录不能把数据库写爆）。管理网页「错误」页看。
 * 服务器自己没接住的错（kind = server）和慢请求（kind = slow）也记在这里。 */
const ERR_KINDS = ['client'];
function errScrub(s, cap) {
  return String(s == null ? '' : s)
    .replace(/(?:https?|file|blob):\/\/[^\s)'"]*?([^/\s)'"?#]*)(?:[?#][^\s)'":]*)?(?=[\s)'":]|$)/g, (m, f) => f || '(url)')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '*@*')
    .replace(/\b(?:[0-9a-f]{20,}|[A-Za-z0-9_-]{32,})\b/g, '*')
    .replace(/\d{6,}/g, '*')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .slice(0, cap);
}
async function errRecord(env, kind, e, now) {
  const msg = errScrub(e.msg, 300) || '未知错误', src = errScrub(e.src, 200), stack = errScrub(e.stack, 1500);
  const meta = {};
  for (const [k, v] of Object.entries(isPlain(e.meta) ? e.meta : {}).slice(0, 12)) {
    if (/^[a-z]{1,8}$/i.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) meta[k] = typeof v === 'string' ? (kind === 'client' ? errScrub(v, 60) : v.slice(0, 60)) : v;   // 网页报的才要洗，服务器自己记的（请求编号这种）原样留
  }
  const sig = (await sha256Hex(kind + '|' + msg + '|' + src)).slice(0, 32), ms = Math.max(0, Math.round(+e.ms || 0));
  await ensureSchema(env);
  await env.DB.prepare(
    'INSERT INTO errs (sig, kind, msg, src, stack, meta, n, first_at, last_at, ms, ms_sum) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7, ?8, ?8) ' +
    'ON CONFLICT(sig) DO UPDATE SET n = errs.n + 1, last_at = ?7, meta = ?6, stack = CASE WHEN ?5 = \'\' THEN errs.stack ELSE ?5 END, ms = MAX(errs.ms, ?8), ms_sum = errs.ms_sum + ?8'
  ).bind(sig, kind, msg, src, stack, JSON.stringify(meta), now, ms).run();
}
async function errReport(env, request, ip, now) {
  const txt = await request.text().catch(() => '');
  if (txt.length > 8000) return error('请求太大', 413);
  if (!(await hit(env, 'err:' + ip, 30, 3600e3, now)) || !(await hit(env, 'err:*', 2000, 3600e3, now))) return json({ ok: true, kept: false });
  const body = parseObj(txt);
  if (!body || !ERR_KINDS.includes(body.k) || typeof body.msg !== 'string') return error('格式不对');
  await errRecord(env, body.k, body, now);
  return json({ ok: true, kept: true });
}

/* ---------- 在线人数 ----------
 * 大厅名单靠浏览器之间直连，连不上别人的网页（有的防火墙、网络会挡 WebRTC）就只能看到自己，所以人数以这里为准。
 * 每个标签页带一个随机 sid（存在 sessionStorage，刷新还是同一个），30 秒报一次状态：menu 在逛、queue 在匹配、match 在联机对战。
 * 关网页时发 bye 立刻下线。同一个 IP 最多算 PRESENCE_PER_IP 个，防止有人刷人数（同一个校园网、家里几台机器都还够用）。 */
const PRESENCE_WINDOW = 90e3, PRESENCE_PER_IP = 16, PRESENCE_ST = ['menu', 'queue', 'match'];
async function ipTag(ip) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('renying-presence:' + ip));
  return Array.from(new Uint8Array(d).slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function presence(env, body, ip, now) {
  const sid = String(body.sid || '');
  if (!/^[a-z0-9]{12,40}$/.test(sid)) return error('sid 不对');
  const tag = await ipTag(ip);
  if (body.bye) {
    await env.DB.prepare('DELETE FROM presence WHERE sid = ? AND ip = ?').bind(sid, tag).run();
  } else {
    const st = PRESENCE_ST.includes(body.st) ? body.st : 'menu';
    const mine = await env.DB.prepare('SELECT (SELECT ip FROM presence WHERE sid = ?1) AS owner, (SELECT COUNT(*) FROM presence WHERE ip = ?2 AND seen > ?3) AS n').bind(sid, tag, now - PRESENCE_WINDOW).first();
    if (mine && mine.owner && mine.owner !== tag) return error('sid 不对');   // 别人的 sid：不让顶替
    if ((mine && mine.owner) || !mine || mine.n < PRESENCE_PER_IP) {
      await env.DB.prepare('INSERT INTO presence (sid, ip, st, seen) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(sid) DO UPDATE SET st = ?3, seen = ?4').bind(sid, tag, st, now).run();
    }
  }
  const c = await env.DB.prepare("SELECT COUNT(*) AS online, SUM(st = 'match') AS playing, SUM(st = 'queue') AS waiting FROM presence WHERE seen > ?").bind(now - PRESENCE_WINDOW).first();
  const humanOnline = (c && c.online) || 0, humanPlaying = (c && c.playing) || 0, humanWaiting = (c && c.waiting) || 0;
  const ai = typeof aiPresenceCounts === 'function' ? await aiPresenceCounts(env, now) : { aiOnline: 0, aiPlaying: 0, aiWaiting: 0, aiQuickmatch: 0, aiRanked: 0, aiTraining: 0, aiResting: 0, aiOffline: 0 };
  return json({
    ok: true,
    online: humanOnline + ai.aiOnline,
    playing: humanPlaying + ai.aiPlaying,
    waiting: humanWaiting + ai.aiWaiting,
    humanOnline,
    humanPlaying,
    humanWaiting,
    aiOnline: ai.aiOnline,
    aiPlaying: ai.aiPlaying,
    aiWaiting: ai.aiWaiting,
    aiQuickmatch: ai.aiQuickmatch || 0,
    aiRanked: ai.aiRanked || 0,
    aiTraining: ai.aiTraining || 0,
    aiResting: ai.aiResting || 0,
    aiOffline: ai.aiOffline || 0,
    every: 30
  });
}

/* ---------- 匿名游玩统计 ----------
 * 网页每次打开、走新手教学、开一局时报一下（POST /api/stats，不用登录，游客也算）。
 * 不存名字、账号、邮箱、IP：网页在本机存一个随机编号（renying-anon-id），服务器加盐再算一次哈希才存，只用来去重和算留存。
 * 设置里可以关掉；离线版不报。管理网页「游玩统计」看：每天人数和留存、模式结果与时长、侠客和地图胜负、排队区间、提前离场、断线和复盘评价。
 * 每个 IP 一小时最多 120 次、全服一小时最多 20000 次，多出来的直接丢（统计不能把数据库写爆）。 */
const STAT_EVENTS = ['open', 'tut_start', 'tut_done', 'tut_skip', 'disconnect', 'rematch', 'review_yes', 'review_no'];
const STAT_MODES = ['cpu', 'tag3', 'tower', 'chaos', 'mayhem', 'maps', '2v2', 'watch2v2', 'saga', 'stage', 'train', 'raid', 'world', 'boss', 'net', 'netrk', 'pvp', 'replay', 'qfx'];
const STAT_MAPS = ['cliff', 'ice', 'bamboo', 'thunder', 'pagoda', 'wine'];
const statKeyOk = k => {
  if (typeof k !== 'string' || k.length > 64) return false;
  if (STAT_EVENTS.includes(k)) return true;
  const p = k.split(':');
  if (p[0] === 'm') return p.length === 2 && STAT_MODES.includes(p[1]);
  if (p[0] === 'out') return p.length === 3 && STAT_MODES.includes(p[1]) && ['w', 'l', 'd'].includes(p[2]);
  if (p[0] === 'dur') return p.length === 3 && STAT_MODES.includes(p[1]) && /^[0-4]$/.test(p[2]);
  if (p[0] === 'quit') return p.length === 2 && STAT_MODES.includes(p[1]);
  if (p[0] === 'queue') return p.length === 2 && (/^[0-4]$/.test(p[1]) || p[1] === 'cancel');
  if (p[0] === 'h') return p.length === 3 && C.HERO_IDS.includes(p[1]) && ['w', 'l', 'd'].includes(p[2]);
  if (p[0] === 'map') return p.length === 3 && STAT_MAPS.includes(p[1]) && ['w', 'l', 'd'].includes(p[2]);
  return false;
};
const statDay = now => Math.floor((now + 8 * 3600e3) / DAY_MS);   // 北京时间的第几天：学校的一天按北京时间算
async function statVid(raw) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('renying-stats:' + raw));
  return Array.from(new Uint8Array(d).slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function playStats(env, body, ip, now) {
  const raw = String(body.vid || '');
  if (!/^[a-z0-9]{12,40}$/.test(raw)) return error('编号不对');
  const tag = await ipTag(ip);
  if (!(await hit(env, 'st:' + tag, 120, 3600e3, now)) || !(await hit(env, 'st:*', 20000, 3600e3, now))) return json({ ok: true, kept: false });
  const ev = (Array.isArray(body.ev) ? body.ev : []).slice(0, 30).filter(statKeyOk);
  const day = statDay(now), vid = await statVid(raw);
  const counts = {};
  for (const k of ev) counts[k] = Math.min(10, (counts[k] || 0) + 1);   // 同一批里同一件事最多算 10 次
  const st = [
    env.DB.prepare('INSERT INTO play_visitors (vid, first_day, last_day) VALUES (?1, ?2, ?2) ON CONFLICT(vid) DO UPDATE SET last_day = MAX(last_day, ?2)').bind(vid, day),
    env.DB.prepare('INSERT OR IGNORE INTO play_days (day, vid) VALUES (?, ?)').bind(day, vid),
  ];
  for (const [k, n] of Object.entries(counts)) st.push(env.DB.prepare('INSERT INTO play_counts (day, k, n) VALUES (?1, ?2, ?3) ON CONFLICT(day, k) DO UPDATE SET n = n + ?3').bind(day, k, n));
  await env.DB.batch(st);
  return json({ ok: true, kept: true });
}
// 管理网页用：最近 days 天每天的人数、新玩家、留存、各件事的次数
async function playStatsReport(env, now, days) {
  const today = statDay(now), from = today - days + 1;
  const [dau, cohort, counts, total] = await Promise.all([
    env.DB.prepare('SELECT day, COUNT(*) AS n FROM play_days WHERE day >= ? GROUP BY day').bind(from).all(),
    env.DB.prepare(
      'SELECT v.first_day AS day, COUNT(*) AS n, ' +
      'SUM(EXISTS (SELECT 1 FROM play_days p WHERE p.vid = v.vid AND p.day = v.first_day + 1)) AS r1, ' +
      'SUM(EXISTS (SELECT 1 FROM play_days p WHERE p.vid = v.vid AND p.day = v.first_day + 7)) AS r7 ' +
      'FROM play_visitors v WHERE v.first_day >= ? GROUP BY v.first_day').bind(from).all(),
    env.DB.prepare('SELECT day, k, n FROM play_counts WHERE day >= ?').bind(from).all(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM play_visitors').first(),
  ]);
  const rows = {};
  const row = d => rows[d] || (rows[d] = { day: d, date: new Date(d * DAY_MS).toISOString().slice(0, 10), players: 0, fresh: 0, back1: null, back7: null, ev: {} });
  for (let d = from; d <= today; d++) row(d);
  for (const r of dau.results || []) row(r.day).players = r.n;
  for (const r of cohort.results || []) {
    const o = row(r.day); o.fresh = r.n;
    o.back1 = r.day + 1 <= today ? (r.r1 || 0) : null;   // 还没到第 2 天的不算（显示成空）
    o.back7 = r.day + 7 <= today ? (r.r7 || 0) : null;
  }
  for (const r of counts.results || []) row(r.day).ev[r.k] = r.n;
  return { ok: true, days, today: row(today).date, visitors: (total && total.n) || 0, rows: Object.values(rows).sort((a, b) => b.day - a.day), modes: STAT_MODES };
}

/* ---------- 匿名 AI 对局样本 ----------
 * 网页只上传状态、按键、奖励和游戏模式；不接收回放、昵称、账号、皮肤或客户端时间。
 * 每个 IP 每天最多 120 局、全服每天最多 20000 局，样本保留 180 天；管理员可分页导出 JSONL。 */
const AI_TRAIN_MODES = ['cpu', 'net', '2v2', 'pvp', 'maps', 'tag3', 'chaos', 'mayhem', 'tower', 'saga', 'raid', 'stage', 'boss', 'world', 'qfx'];
function cleanAiRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 480) return null;
  const clean = [];
  for (const row of rows) {
    if (!isPlain(row) || !C.HERO_IDS.includes(row.hero) || !Array.isArray(row.s) || row.s.length !== 19 || !row.s.every(v => Number.isFinite(v) && v >= -1 && v <= 1.2)) return null;
    const a = intIn(row.a, 0, 8191), reward = +row.r, done = intIn(row.done, 0, 1);
    if (a === null || done === null || !Number.isFinite(reward) || reward < -30 || reward > 30) return null;
    clean.push({ hero: row.hero, s: row.s.map(v => Math.round(v * 10000) / 10000), a, r: Math.round(reward * 1000) / 1000, done });
  }
  if (clean[clean.length - 1].done !== 1) return null;
  return clean;
}
async function aiTrainingIngest(env, body, ip, now) {
  const id = String(body.id || ''), mode = String(body.mode || '');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) return error('对局编号不对');
  if (!AI_TRAIN_MODES.includes(mode) || ![-1, 0, 1].includes(body.result)) return error('对局信息不完整');
  const rows = cleanAiRows(body.rows);
  if (!rows) return error('训练样本格式不对');
  const tag = await ipTag(ip);
  if (!(await hit(env, 'ait:' + tag, 120, DAY_MS, now)) || !(await hit(env, 'ait:*', 20000, DAY_MS, now))) return json({ ok: true, kept: false, limited: true });
  const res = await env.DB.prepare('INSERT OR IGNORE INTO ai_training_matches (id, mode, result, rows_json, received_at) VALUES (?, ?, ?, ?, ?)').bind(id, mode, body.result, JSON.stringify(rows), now).run();
  return json({ ok: true, kept: !!(res && res.meta && res.meta.changes), duplicate: !(res && res.meta && res.meta.changes) });
}
async function aiTrainingExport(env, after, limit) {
  const rows = (await env.DB.prepare('SELECT rowid AS seq, mode, result, rows_json, received_at FROM ai_training_matches WHERE rowid > ? ORDER BY rowid LIMIT ?').bind(after, limit).all()).results || [];
  const data = [];
  for (const row of rows) {
    let samples = [];
    try { samples = JSON.parse(row.rows_json); } catch (e) {}
    for (const s of samples) data.push({ ...s, mode: row.mode, result: row.result, receivedDay: Math.floor(row.received_at / DAY_MS) });
  }
  return { ok: true, count: rows.length, next: rows.length ? rows[rows.length - 1].seq : after, samples: data };
}

/* ---------- 天魔讨伐：全服一起打一只天魔 ----------
 * 打架在各自的网页里打（90 秒，天魔倒下会再站起来），打完把造成的伤害交上来，扣在全服同一只天魔的血上。
 * 出战先领票（gboss_try），交伤害时把这张票改成“交过了”、扣天魔的血、记个人伤害放在同一批写入里：同一张票重交、
 * 网络重试、刷新后补交都只算一次；两个人同时打出最后一下，只有一个扣得动（hp > 0 才扣），另一个记 0。
 * 伤害上限：一张票最多 GB_TRY_MAX，而且不超过 (出战到现在的秒数 - 3) × GB_DPS。票一小时内不交就作废。
 * 一代天魔活 GB_LIFE，到时没打死就遁走；结束后按伤害发奖励（写进 gift 表，玩家下次动武库自动领），再出下一代。 */
// ===========================================================================
// 持久化 AI 玩家系统：500 个独立 AI 账号、UTC+8 个体作息与昼夜周期（约 75~155 人动态在线）、
// 会话与休息节律、高比例 AI 专属匹配/排位、模式/侠客/流派偏好、长期行为演化、
// 受保护的市场参与、真人与 AI 严格区分及管理接口
// ===========================================================================
const AI_USERNAMES_500 = [
  // 1-100（保留既有 100 位 AI 昵称与身份兼容）
  '6767', '看见你', '不吃香菜', '别打我', 'xiaoming9', 'kk0812', '0419', '晚安玛卡巴卡', 'linyi7', 'yz_07',
  '8823', '吃口西瓜', 'chen77', '就打一把', 'k792', '再打一局就睡', 'skycn', 'momo酱', 'm0x3', '菜鸟报道',
  'zerok', '阿泽', '9527x', '路过打酱油', 'nova23', '小安', 'a2048', '喝杯奶茶', 'kuro7', '南风',
  'zz77', '熬夜冠军', 'momo123', '北城', 'q1314', '随便玩玩', 'yukis', '晚星', 'x404', '手有点抖',
  'leogg', '半夏', 'n886', '明天再练', 'ace08', '微凉', 'v587', '小透明', 'dusk99', '念安',
  's2333', '摸鱼达人', 'kai2026', '青禾', '刚下课', 'ren05', '云起', '网有点卡', 'mingz', '初见',
  '请多指教', 'su777', '旧梦', '今天不想上班', 'han42', '长风', '不想起名字', 'yu01', '孤舟', '打完吃饭',
  'qi99', '暮色', '睡前一把', 'fengx', '青衫', '点错了', '阿宁', '竹影', '慢慢打', '阿澈',
  '墨染', '发呆中', '小满', '寒鸦', '我试试', '知秋', '惊鸿', '拾光', '远山', '望舒',
  '落雪', '晴岚', '松间', '江枫', '渔火', '清欢', '岁安', '长安客', '渡口', '听雨',
  // 101-200（日常搞笑 / 游戏实况 / 饮品美食风格）
  '可乐加冰', '起早好难', '今天吃啥', '摸鱼小能手', '困死了', '别抢人头', '稳住能赢', '再来亿把', '有点东西', '手滑了',
  '卡成PPT', '橘子汽水', '柠檬不酸', '西瓜霜', '抹茶拿铁', '芋泥波波', '冰美式续命', '脆脆鲨', '小熊软糖', '芝士焗饭',
  '烤冷面加蛋', '煎饼果子', '螺蛳粉真香', '奶茶三分糖', '深夜放毒', '早睡早起', '失眠选手', '周末不上班', '放假倒计时', '作业没写完',
  '体育生路过', '网吧五连坐', '宿舍断电了', '外卖到了', '我先撤了', '别追我呀', '救救孩子', '轻点打', '放过我吧', '我是人机吗',
  '键盘冒烟', '鼠标没电', '手感火热', '今天必胜', '连败终结者', '上分好难', '掉段专家', '守门员', '混分巨兽', '躺赢选手',
  '带带我', '大佬求带', '萌新求饶', '刚入坑', '回坑老登', '养老玩家', '佛系对决', '快乐就完事', '输赢无所谓', '纯路人',
  '吃瓜群众', '前排围观', '瓜子饮料', '小板凳', '干饭人', '炫完这顿', '饿了先下', '泡面好了', '加根火腿', '多放香菜',
  '不吃葱姜', '微辣就行', '特辣挑战', '甜豆腐脑', '咸粽子党', '冰阔落', '旺仔牛奶', '椰树椰汁', '蜜桃乌龙', '生椰拿铁',
  '芝士莓莓', '杨枝甘露', '烧仙草', '双皮奶', '蛋挞真香', '菠萝包', '小笼包', '生煎包', '锅贴', '牛肉面加肉',
  '黄焖鸡', '沙县大酒店', '兰州拉面', '重庆小面', '热干面', '肠粉加蛋', '叉烧饭', '煲仔饭', '麻辣烫', '火锅底料',
  // 201-300（英文 / 拼音 / 数字混合现代网名）
  'keke99', 'milo07', 'zhao88', 'li_0421', 'ryan_x', 'yuki_cn', 'saki23', 'neo_01', 'jay996', 'chen_k',
  'wuyi77', 'lin_09', 'xu_2025', 'he_08', 'zhou_y', 'tang_03', 'deng_x', 'peng_9', 'luo_05', 'gu_777',
  'song_cn', 'han_02', 'wei_88', 'xie_06', 'pan_11', 'du_404', 'cao_23', 'yuan_9', 'tian_07', 'ren_66',
  'jiang_x', 'fan_01', 'fang_88', 'shi_09', 'yao_24', 'tan_77', 'liao_5', 'zou_03', 'xiong_9', 'jin_04',
  'lu_777', 'hao_12', 'kong_x', 'bai_08', 'cui_21', 'kang_6', 'mao_05', 'qiu_99', 'qin_07', 'meng_x',
  '1024', '2077', '31415', '7788', '9960', '5201', '1314x', '0808', '1122', '6688x',
  '4399x', '7777a', '0019', '2333x', '8080', '9090', '1999x', '2004k', '2006y', '2008z',
  '0512', '0721', '0918', '1001', '1225', '0601', '0314', '0815', '0909', '0214',
  '3690', '4567', '5678', '8910', '2468', '1357', '7410', '8520', '9630', '1470',
  'alex_z', 'eric09', 'max77', 'leo_04', 'sam_cn', 'tony8', 'vivi22', 'lulu06', 'nana_k', 'coco91',
  // 301-400（文艺 / 治愈 / 简短自然中文昵称）
  '等风来', '雾散了', '星河滚烫', '人间理想', '山河故人', '月色真美', '晚风温柔', '落日余晖', '海边吹风', '云端漫步',
  '南巷清风', '北岛微光', '西楼听雪', '东篱采菊', '长安不夜', '江南烟雨', '白茶清欢', '素年锦时', '浮生若梦', '浅夏微凉',
  '初秋晚风', '冬日暖阳', '春山可望', '明月几时', '清风徐来', '水波不兴', '山月不知', '林深见鹿', '海蓝见鲸', '梦醒见你',
  '温柔本身', '心动频率', '浪漫至死', '星辰大海', '日落大道', '橘色海面', '粉红晚霞', '蓝调时刻', '凌晨三点', '四月樱花',
  '五月微风', '六月蝉鸣', '七月流火', '八月桂花', '九月开学', '十月金秋', '十一月雪', '十二月诗', '阿宇', '阿轩',
  '阿然', '阿乐', '阿阳', '阿杰', '阿豪', '阿凯', '阿俊', '阿明', '阿亮', '阿伟',
  '小七', '小九', '小十', '小鱼', '小鹿', '小猫', '小狗', '小熊', '小兔', '小鸟',
  '大白', '大橘', '大黑', '大黄', '团子', '丸子', '布丁', '泡芙', '麻薯', '奶盖',
  '豆包', '汤圆', '年糕', '月饼', '粽子', '饺子', '包子', '馒头', '花卷', '油条',
  '豆浆', '米粥', '小菜', '花生', '瓜子', '核桃', '杏仁', '腰果', '碧根果', '夏威夷果',
  // 401-500（武侠意境 / 现代二次元 / 酷炫短ID混合）
  '一剑封喉', '无影脚', '铁布衫', '金钟罩', '凌波微步', '降龙掌', '独孤求败', '东方不败', '风清扬', '令狐冲',
  '白衣卿相', '青衣剑客', '红尘客栈', '醉卧沙场', '笑傲江湖', '侠客行', '仗剑天涯', '踏雪无痕', '御剑乘风', '剑指苍穹',
  '破晓之光', '暗夜行者', '极光掠影', '风暴之眼', '雷霆万钧', '烈焰焚天', '寒冰射手', '影流之主', '疾风剑豪', '无双剑姬',
  'zoe_98', 'mia_03', 'ivy_77', 'eva_05', 'ada_19', 'ray_88', 'ben_07', 'dan_42', 'ian_11', 'jay_06',
  'kyle_x', 'owen9', 'luke_z', 'mark7', 'paul_c', 'carl_8', 'alan_0', 'adam_3', 'noah_5', 'liam_2',
  'chichi', 'dudu99', 'fafa88', 'gugu07', 'haha23', 'jiji01', 'kaka77', 'lala05', 'mama_x', 'nini08',
  'pipi66', 'qiqi12', 'ruru09', 'sisi04', 'titi11', 'vava22', 'wawa33', 'xixi44', 'yaya55', 'zizi66',
  '阿离', '阿瑶', '阿昭', '阿辞', '阿许', '阿言', '阿默', '阿白', '阿青', '阿墨',
  '听风吟', '看云卷', '观沧海', '望星空', '赏明月', '品香茗', '抚古琴', '吹玉笛', '绘丹青', '书狂草',
  '不负韶华', '未来可期', '来日方长', '平安喜乐', '万事胜意', '岁岁年年', '朝朝暮暮', '星光不负', '山海可平', '江湖再见',
];

const AI_BEHAVIORS = ['aggressive', 'balanced', 'defensive', 'tactical'];
const AI_STATUSES = ['offline', 'resting', 'menu', 'queue', 'match', 'training', 'market'];
const AI_ONLINE_STATUSES = ['menu', 'queue', 'match', 'training', 'market'];
const AI_CHRONOTYPES = ['early_bird', 'daytime', 'student', 'evening', 'night_owl', 'casual'];
const AI_MODES = ['quickmatch', 'ranked', '1v1', '2v2', 'tag3', 'melee', 'ctf', 'raid', 'train'];
const AI_MOODS = ['focused', 'relaxed', 'competitive', 'exploratory'];
const AI_MARKET_MAX_SPENT = 2500;
const AI_MARKET_MAX_LIST = 3;
const AI_TOTAL_COUNT = AI_USERNAMES_500.length;
let AI_LAST_TICK = 0;

// 每种作息类型的基础活动时段（UTC+8 北京时间，支持跨午夜如 [21.0, 26.8]）与会话/休息时长范围（分钟）
const AI_CHRONO_CFG = {
  early_bird: { windows: [[6.2, 10.5], [13.5, 16.0], [19.0, 21.0]], sessionMin: [22, 60], restMin: [45, 150], weekendBoost: 1.08 },
  daytime:    { windows: [[9.5, 12.8], [14.0, 18.0], [20.0, 22.0]], sessionMin: [20, 55], restMin: [40, 130], weekendBoost: 1.12 },
  student:    { windows: [[12.0, 13.5], [17.2, 22.8]],              sessionMin: [28, 78], restMin: [35, 120], weekendBoost: 1.24 },
  evening:    { windows: [[12.1, 13.4], [18.8, 23.8]],              sessionMin: [32, 88], restMin: [30, 110], weekendBoost: 1.18 },
  night_owl:  { windows: [[15.0, 17.5], [21.0, 27.5], [0.5, 5.2]],  sessionMin: [35, 95], restMin: [35, 135], weekendBoost: 1.15 },
  casual:     { windows: [[10.5, 12.2], [15.5, 17.5], [19.8, 22.2]],sessionMin: [16, 44], restMin: [55, 180], weekendBoost: 1.20 },
};

const AI_DEFAULT_HERO_POOL = [
  'qingfeng', 'feiying', 'tieshan', 'lingshuang', 'liuyun', 'leiming', 'moyu', 'yuehua',
  'yanling', 'yuxiao', 'zuixian', 'gouchen', 'lingque', 'liying', 'cixian', 'qianji',
  'chixiao', 'xuanji', 'qingluan', 'xuanwu',
];

function safeJson(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function aiHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

async function aiBatchChunked(env, stmts, chunkSize = 50) {
  for (let i = 0; i < stmts.length; i += chunkSize) {
    await env.DB.batch(stmts.slice(i, i + chunkSize));
  }
}

// 为 500 位 AI 生成各具特色的种子配置（保留 ai_01..ai_100 兼容旧库，扩展至 ai_500）
const AI_CHRONO_RING = [
  'evening', 'early_bird', 'student', 'daytime', 'casual', 'night_owl',
  'evening', 'student', 'night_owl', 'daytime', 'evening', 'early_bird',
  'student', 'casual', 'night_owl', 'evening', 'daytime', 'night_owl',
  'early_bird', 'student',
];

const AI_PLAYER_SEEDS = AI_USERNAMES_500.map((username, i) => {
  const uid = i < 9 ? `ai_0${i + 1}` : `ai_${i + 1}`;
  const behavior = AI_BEHAVIORS[Math.floor(aiHash(uid + ':beh') * AI_BEHAVIORS.length)];
  const chronotype = AI_CHRONO_RING[i % AI_CHRONO_RING.length];
  const activity = Math.round((0.46 + aiHash(uid + ':act0') * 0.44) * 100) / 100;
  // 每位 AI 都有高比例的 匹配 (quickmatch) / 排位 (ranked) 倾向，再搭配 1~2 个其他个人偏好模式
  const extraModes = ['1v1', '2v2', 'tag3', 'melee', 'ctf', 'raid', 'train'];
  const m1 = extraModes[Math.floor(aiHash(uid + ':m1') * extraModes.length)];
  const m2 = extraModes[Math.floor(aiHash(uid + ':m2') * extraModes.length)];
  const modes = i % 3 === 0
    ? ['ranked', 'quickmatch', m1]
    : i % 3 === 1
      ? ['quickmatch', 'ranked', m1]
      : ['quickmatch', 'ranked', m1, m2];
  const uniqueModes = [...new Set(modes)];
  const heroes = [];
  for (let k = 0; k < 3; k++) {
    const h = AI_DEFAULT_HERO_POOL[Math.floor(aiHash(`${uid}:h:${k}`) * AI_DEFAULT_HERO_POOL.length)];
    if (!heroes.includes(h)) heroes.push(h);
  }
  return [uid, username, behavior, activity, chronotype, uniqueModes, heroes];
});

function aiBeijingClock(now) {
  const bjMs = now + 8 * 3600e3;
  const day = Math.floor(bjMs / DAY_MS);
  const d = new Date(bjMs);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const dow = d.getUTCDay();
  const isWeekend = dow === 0 || dow === 6;
  const hourFloat = hour + minute / 60;
  const phase = hour < 6 ? 'late_night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening_peak';
  return { day, dow, hour, minute, hourFloat, isWeekend, phase };
}

function aiDayCycleFactor(hourFloat) {
  if (hourFloat >= 19 && hourFloat < 23.5) return 1.0;
  if (hourFloat >= 12 && hourFloat < 14) return 0.80;
  if (hourFloat >= 14 && hourFloat < 19) return 0.76;
  if (hourFloat >= 8 && hourFloat < 12) return 0.62;
  if (hourFloat >= 6 && hourFloat < 8) return 0.45;
  if (hourFloat >= 23.5 || hourFloat < 1.5) return 0.56;
  return 0.34;
}

// 按 UTC+8 昼夜节律动态计算 500 账号池的目标在线人数（整体稳定在约 75~155 人，昼夜自然起伏，绝不全部同时在线）
function aiTargetOnlineCount(bj, activeCount) {
  const h = bj.hourFloat;
  let base;
  if (h >= 2 && h < 6) base = 82;         // 深夜低谷：约 78~86 人（夜猫子为主）
  else if (h >= 6 && h < 9) base = 96;    // 清晨渐起：约 92~100 人
  else if (h >= 9 && h < 12) base = 112;  // 上午活跃：约 108~116 人
  else if (h >= 12 && h < 14) base = 124; // 午间小峰：约 120~128 人
  else if (h >= 14 && h < 18) base = 118; // 午后平稳：约 114~122 人
  else if (h >= 18 && h < 23.2) base = 142; // 晚间高峰：约 138~148 人
  else base = 104;                        // 午夜回落：约 100~108 人
  if (bj.isWeekend) base += 6;
  // 按 15 分钟刻度加 ±4 人的自然微幅波动，避免数字死板不变
  const wave = Math.round((aiHash(`wave:${bj.day}:${Math.floor(h * 4)}`) - 0.5) * 8);
  return Math.max(0, Math.min(activeCount, Math.max(70, Math.min(160, base + wave))));
}

function aiBuildSchedule(uid, chronotype, seedIdx) {
  const cfg = AI_CHRONO_CFG[chronotype] || AI_CHRONO_CFG.evening;
  const baseOffset = (aiHash(uid + ':off') - 0.5) * 1.1; // ±33 分钟个体固定偏移
  const windows = cfg.windows.map(([s, e]) => [
    Math.round((s + baseOffset) * 100) / 100,
    Math.round((e + baseOffset) * 100) / 100
  ]);
  const sMin = cfg.sessionMin[0] + Math.round(aiHash(uid + ':smin') * 8);
  const sMax = cfg.sessionMin[1] + Math.round(aiHash(uid + ':smax') * 12);
  const rMin = cfg.restMin[0] + Math.round(aiHash(uid + ':rmin') * 12);
  const rMax = cfg.restMin[1] + Math.round(aiHash(uid + ':rmax') * 25);
  const marketCooldownMin = 25 + Math.round(aiHash(uid + ':mkt:' + seedIdx) * 95);
  return { windows, sessionMin: [sMin, sMax], restMin: [rMin, rMax], marketCooldownMin };
}

function aiBuildPrefs(modes, heroes, profile, uid) {
  const validHeroes = (Array.isArray(heroes) ? heroes : []).filter(h => !C.HERO_IDS || C.HERO_IDS.includes(h));
  const heroPool = validHeroes.length ? validHeroes : ['qingfeng', 'feiying', 'tieshan'];
  const validModes = (Array.isArray(modes) ? modes : []).filter(m => AI_MODES.includes(m));
  const modePool = validModes.length ? validModes : ['quickmatch', 'ranked', '1v1'];
  const trainBias = Math.round((0.08 + aiHash(uid + ':tb') * 0.12) * 100) / 100;
  const marketBias = Math.round((0.04 + aiHash(uid + ':mb') * 0.08) * 100) / 100;
  const rankedBias = Math.round((0.35 + aiHash(uid + ':rb') * 0.35) * 100) / 100;
  return { modes: modePool, heroes: heroPool, style: profile, trainBias, marketBias, rankedBias };
}

function aiBuildEvolution(heroes, day, uid) {
  const mastery = {};
  for (let i = 0; i < heroes.length; i++) mastery[heroes[i]] = 10 + Math.round(aiHash(uid + ':m:' + i) * 20);
  return {
    experience: Math.round(aiHash(uid + ':xp') * 40),
    mood: AI_MOODS[Math.floor(aiHash(uid + ':mood') * AI_MOODS.length)],
    winStreak: 0,
    recentForm: 0.5,
    heroMastery: mastery,
    styleDrift: 0,
    lastEvolvedDay: day,
  };
}

function aiInScheduleWindow(schedule, bj, uid) {
  const wins = (schedule && Array.isArray(schedule.windows) && schedule.windows.length)
    ? schedule.windows
    : AI_CHRONO_CFG.evening.windows;
  const dailyDrift = (aiHash(`${uid}:drift:${bj.day}`) - 0.5) * 0.85;
  const weekendExt = bj.isWeekend ? 0.8 : 0;
  const h = bj.hourFloat;
  for (const [rawS, rawE] of wins) {
    const s = rawS + dailyDrift - (bj.isWeekend ? 0.3 : 0);
    const e = rawE + dailyDrift + weekendExt;
    if (e <= 24) {
      if (h >= s && h <= e) return true;
    } else {
      if (h >= s || h <= (e - 24)) return true;
    }
  }
  return false;
}

function aiPickWeightedHero(prefs, evo, rndVal) {
  const heroes = (prefs && Array.isArray(prefs.heroes) && prefs.heroes.length) ? prefs.heroes : ['qingfeng'];
  const mastery = (evo && evo.heroMastery) || {};
  if (evo && evo.mood === 'exploratory' && rndVal > 0.78 && C.HERO_IDS && C.HERO_IDS.length) {
    return C.HERO_IDS[Math.floor(rndVal * C.HERO_IDS.length) % C.HERO_IDS.length];
  }
  let total = 0;
  const weights = heroes.map(h => {
    const w = 10 + (mastery[h] || 0);
    total += w;
    return w;
  });
  let r = rndVal * total;
  for (let i = 0; i < heroes.length; i++) {
    r -= weights[i];
    if (r <= 0) return heroes[i];
  }
  return heroes[0];
}

// 优先选择 AI 专属「匹配 (quickmatch)」与「排位 (ranked)」，兼顾少量其他偏好模式
function aiPickMode(prefs, evo, matchmakingEnabled, rndVal) {
  const modes = (prefs && Array.isArray(prefs.modes) && prefs.modes.length) ? prefs.modes : ['quickmatch', 'ranked', '1v1'];
  const matchModes = modes.filter(m => m !== 'train');
  if (!matchmakingEnabled || !matchModes.length) return 'train';
  const rankedP = (prefs && typeof prefs.rankedBias === 'number' ? prefs.rankedBias : 0.45) + (evo && evo.mood === 'competitive' ? 0.12 : 0);
  if (rndVal < Math.min(0.50, rankedP * 0.82)) return 'ranked';
  if (rndVal < 0.84) return 'quickmatch';
  const others = matchModes.filter(m => m !== 'ranked' && m !== 'quickmatch');
  if (others.length) return others[Math.floor(rndVal * others.length) % others.length];
  return rndVal < 0.5 ? 'ranked' : 'quickmatch';
}

function aiEvolveDaily(row, prefs, evo, day) {
  const nextEvo = {
    experience: (evo && evo.experience) || 0,
    mood: (evo && evo.mood) || 'focused',
    winStreak: (evo && evo.winStreak) || 0,
    recentForm: (evo && typeof evo.recentForm === 'number') ? evo.recentForm : 0.5,
    heroMastery: { ...((evo && evo.heroMastery) || {}) },
    styleDrift: (evo && evo.styleDrift) || 0,
    lastEvolvedDay: day,
  };
  const rMood = aiHash(`${row.uid}:mood:${day}`);
  nextEvo.mood = AI_MOODS[Math.floor(rMood * AI_MOODS.length) % AI_MOODS.length];
  const deltaAct = (aiHash(`${row.uid}:act:${day}`) - 0.5) * 0.08;
  const nextActivity = Math.round(Math.min(0.95, Math.max(0.35, (row.activity_level || 0.65) + deltaAct)) * 100) / 100;
  nextEvo.styleDrift = (nextEvo.styleDrift || 0) + 1;
  let nextProfile = row.behavior_profile;
  if (nextEvo.styleDrift >= 8 && aiHash(`${row.uid}:style:${day}`) < 0.35) {
    nextEvo.styleDrift = 0;
    const alt = AI_BEHAVIORS.filter(b => b !== row.behavior_profile);
    nextProfile = alt[Math.floor(aiHash(`${row.uid}:stylepick:${day}`) * alt.length) % alt.length];
  }
  return { evo: nextEvo, activity: nextActivity, profile: nextProfile };
}

function aiRefPrice(itemKey) {
  const it = C.ITEM && C.ITEM[itemKey];
  if (!it) return 240;
  const tierBase = { mil: 60, res: 140, cla: 320, cov: 760, gold: 1800 };
  return tierBase[it.tier] || 240;
}

async function ensureAiPlayers(env, now) {
  const existing = await env.DB.prepare('SELECT uid, username, status, chronotype, schedule_json, prefs_json, evolution_json, session_until FROM ai_players').all();
  const rows = (existing && existing.results) || [];
  const byUid = Object.fromEntries(rows.map(r => [r.uid, r]));
  const bj = aiBeijingClock(now);
  const targetOnline = aiTargetOnlineCount(bj, AI_TOTAL_COUNT);
  let onlineAssigned = rows.filter(r => AI_ONLINE_STATUSES.includes(r.status) && r.session_until > now).length;
  const stmts = [];
  const sampleKeys = Object.keys(C.ITEM || {}).slice(0, 16);
  const needRename = AI_PLAYER_SEEDS.some(([uid, uname]) => byUid[uid] && byUid[uid].username !== uname);
  let humanNames = null;
  if (needRename || rows.length < AI_TOTAL_COUNT) {
    const hRows = (await env.DB.prepare("SELECT LOWER(username) AS u FROM users WHERE password_algo != 'ai-bot-locked'").all()).results || [];
    humanNames = new Set(hRows.map(x => x.u));
  }

  for (let i = 0; i < AI_PLAYER_SEEDS.length; i++) {
    const [uid, baseUsername, profile, activity, chronotype, modes, heroes] = AI_PLAYER_SEEDS[i];
    const username = (humanNames && humanNames.has(baseUsername.toLowerCase())) ? `${baseUsername}_${i + 1}` : baseUsername;
    const schedule = aiBuildSchedule(uid, chronotype, i);
    const prefs = aiBuildPrefs(modes, heroes, profile, uid);
    const evo = aiBuildEvolution(prefs.heroes, bj.day, uid);
    const cur = byUid[uid];
    if (!cur) {
      const inWin = aiInScheduleWindow(schedule, bj, uid);
      const initR = aiHash(`${uid}:init:${bj.day}:${bj.hour}`);
      let initStatus = 'offline', sessionUntil = 0, restUntil = 0, curMode = '', curHero = '';
      // 仅在目标在线人数范围内初始化在线状态，避免 500 个 AI 同时上线
      if (onlineAssigned < targetOnline && ((inWin && initR < 0.72) || initR < 0.16)) {
        onlineAssigned++;
        const sLen = Math.max(8, Math.round((schedule.sessionMin[0] + aiHash(uid + ':slen0') * (schedule.sessionMin[1] - schedule.sessionMin[0])) * (0.35 + aiHash(uid + ':srem0') * 0.65)));
        sessionUntil = now + sLen * 60e3;
        curHero = prefs.heroes[0] || 'qingfeng';
        if (initR < 0.48) { initStatus = 'match'; curMode = aiPickMode(prefs, evo, true, initR); }
        else if (initR < 0.72) { initStatus = 'queue'; curMode = aiPickMode(prefs, evo, true, initR); }
        else if (initR < 0.84) { initStatus = 'training'; curMode = 'train'; }
        else { initStatus = 'menu'; }
      } else if (initR < 0.30) {
        initStatus = 'resting';
        const rLen = schedule.restMin[0] + Math.round(aiHash(uid + ':rlen0') * (schedule.restMin[1] - schedule.restMin[0]));
        restUntil = now + rLen * 60e3;
      }
      const nextMarketAt = now + Math.round((12 + aiHash(uid + ':mk0') * schedule.marketCooldownMin) * 60e3);
      const items = [];
      if (sampleKeys.length) {
        const k = sampleKeys[i % sampleKeys.length];
        items.push({ id: `ai_it_${i}_1`, k, st: i % 4 === 0 ? 1 : 0, fl: 0.25, src: 'ai_seed', at: now });
      }
      const econState = JSON.stringify({ items, cases: {}, term: 0, tags: 0, eq: {} });
      const profJson = JSON.stringify({ name: username, isAi: true, behavior: profile, chronotype, owned: prefs.heroes, netWins: 4 + (i % 15), netLosses: 3 + (i % 12) });
      stmts.push(
        env.DB.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at, password_algo, password_updated_at, deleted_at) VALUES (?1, ?2, 'ai-bot-locked', 'ai-locked', ?3, ?4, ?4, 'ai-bot-locked', ?4, 0)")
          .bind(uid, username, profJson, now),
        env.DB.prepare("INSERT OR IGNORE INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES (?1, ?2, '{}', ?3, 1, ?4)")
          .bind(uid, econState, 1200 + (i % 5) * 300, now),
        env.DB.prepare('INSERT OR IGNORE INTO ai_players (uid, username, active, activity_level, behavior_profile, matchmaking_enabled, market_enabled, status, chronotype, schedule_json, prefs_json, evolution_json, current_mode, current_hero, session_until, rest_until, next_market_at, sessions_today, matches_today, training_today, last_active_at, daily_spent, daily_listed, daily_reset_day, updated_at) VALUES (?1, ?2, 1, ?3, ?4, 1, 1, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 0, 0, ?16, 0, 0, ?17, ?16)')
          .bind(uid, username, activity, profile, initStatus, chronotype, JSON.stringify(schedule), JSON.stringify(prefs), JSON.stringify(evo), curMode, curHero, sessionUntil, restUntil, nextMarketAt, AI_ONLINE_STATUSES.includes(initStatus) ? 1 : 0, now, bj.day)
      );
    } else {
      if (cur.username !== username && (!humanNames || !humanNames.has(username.toLowerCase()))) {
        const profJson = JSON.stringify({ name: username, isAi: true, behavior: profile, chronotype, owned: prefs.heroes, netWins: 4 + (i % 15), netLosses: 3 + (i % 12) });
        stmts.push(
          env.DB.prepare('UPDATE ai_players SET username = ?1, updated_at = ?2 WHERE uid = ?3').bind(username, now, uid),
          env.DB.prepare("UPDATE users SET username = ?1, profile_json = ?2, updated_at = ?3 WHERE id = ?4 AND password_algo = 'ai-bot-locked'").bind(username, profJson, now, uid)
        );
      }
      if (!cur.schedule_json || cur.schedule_json === '{}' || !cur.prefs_json || cur.prefs_json === '{}' || (AI_ONLINE_STATUSES.includes(cur.status) && !cur.session_until)) {
        // 从旧版迁移过来的 AI 账号：补齐作息与会话计时，并立即分散上下线状态，彻底修复“全部同时在线”
        const inWin = aiInScheduleWindow(schedule, bj, uid);
        const initR = aiHash(`${uid}:mig:${bj.day}:${bj.hour}`);
        let nextStatus = 'offline', sessUntil = 0, restUntil = 0;
        if (onlineAssigned < targetOnline && inWin && initR < 0.65) {
          onlineAssigned++;
          nextStatus = cur.status && AI_ONLINE_STATUSES.includes(cur.status) ? cur.status : 'menu';
          const sLen = Math.max(8, Math.round((schedule.sessionMin[0] + aiHash(uid + ':slenm') * (schedule.sessionMin[1] - schedule.sessionMin[0])) * 0.6));
          sessUntil = now + sLen * 60e3;
        } else if (initR < 0.35) {
          nextStatus = 'resting';
          restUntil = now + (schedule.restMin[0] + Math.round(initR * 60)) * 60e3;
        }
        stmts.push(
          env.DB.prepare('UPDATE ai_players SET status = ?1, chronotype = ?2, schedule_json = ?3, prefs_json = ?4, evolution_json = ?5, session_until = ?6, rest_until = ?7, next_market_at = ?8, updated_at = ?9 WHERE uid = ?10')
            .bind(nextStatus, chronotype, JSON.stringify(schedule), JSON.stringify(prefs), JSON.stringify(evo), sessUntil, restUntil, now + schedule.marketCooldownMin * 60e3, now, uid)
        );
      }
    }
  }
  if (stmts.length) await aiBatchChunked(env, stmts, 50);
}

async function aiPresenceCounts(env, now) {
  try {
    await ensureAiPlayers(env, now);
    if (now - AI_LAST_TICK > 60e3) {
      AI_LAST_TICK = now;
      await aiTickSimulation(env, now, { market: true });
    }
    const r = await env.DB.prepare(
      "SELECT " +
      "COUNT(*) AS aiTotal, " +
      "SUM(CASE WHEN active = 1 AND status IN ('menu','queue','match','training','market') THEN 1 ELSE 0 END) AS aiOnline, " +
      "SUM(CASE WHEN active = 1 AND status = 'match' AND matchmaking_enabled = 1 THEN 1 ELSE 0 END) AS aiPlaying, " +
      "SUM(CASE WHEN active = 1 AND status = 'queue' AND matchmaking_enabled = 1 THEN 1 ELSE 0 END) AS aiWaiting, " +
      "SUM(CASE WHEN active = 1 AND status IN ('queue','match') AND current_mode = 'quickmatch' THEN 1 ELSE 0 END) AS aiQuickmatch, " +
      "SUM(CASE WHEN active = 1 AND status IN ('queue','match') AND current_mode = 'ranked' THEN 1 ELSE 0 END) AS aiRanked, " +
      "SUM(CASE WHEN active = 1 AND status = 'training' THEN 1 ELSE 0 END) AS aiTraining, " +
      "SUM(CASE WHEN active = 1 AND status = 'market' THEN 1 ELSE 0 END) AS aiMarket, " +
      "SUM(CASE WHEN active = 1 AND status = 'resting' THEN 1 ELSE 0 END) AS aiResting, " +
      "SUM(CASE WHEN active = 0 OR status = 'offline' THEN 1 ELSE 0 END) AS aiOffline, " +
      "SUM(matches_today) AS matchesToday, " +
      "SUM(training_today) AS trainingToday " +
      "FROM ai_players"
    ).first();
    const bj = aiBeijingClock(now);
    return {
      aiTotal: (r && r.aiTotal) || 0,
      aiOnline: (r && r.aiOnline) || 0,
      aiPlaying: (r && r.aiPlaying) || 0,
      aiWaiting: (r && r.aiWaiting) || 0,
      aiQuickmatch: (r && r.aiQuickmatch) || 0,
      aiRanked: (r && r.aiRanked) || 0,
      aiTraining: (r && r.aiTraining) || 0,
      aiMarket: (r && r.aiMarket) || 0,
      aiResting: (r && r.aiResting) || 0,
      aiOffline: (r && r.aiOffline) || 0,
      matchesToday: (r && r.matchesToday) || 0,
      trainingToday: (r && r.trainingToday) || 0,
      dayPhase: bj.phase,
      beijingHour: bj.hour,
      beijingMinute: bj.minute,
    };
  } catch (e) {
    return { aiTotal: 0, aiOnline: 0, aiPlaying: 0, aiWaiting: 0, aiQuickmatch: 0, aiRanked: 0, aiTraining: 0, aiMarket: 0, aiResting: 0, aiOffline: 0, matchesToday: 0, trainingToday: 0, dayPhase: 'evening_peak', beijingHour: 20, beijingMinute: 0 };
  }
}

async function aiTickSimulation(env, now, opts = {}) {
  await ensureAiPlayers(env, now);
  const simNow = Number.isFinite(opts.simNow) ? opts.simNow : now;
  const bj = aiBeijingClock(simNow);
  const dayFactor = aiDayCycleFactor(bj.hourFloat);
  const minuteBucket = Math.floor(simNow / 60e3);
  const rows = (await env.DB.prepare('SELECT * FROM ai_players ORDER BY uid').all()).results || [];
  const activeCount = rows.filter(r => r.active === 1).length;
  const targetOnline = aiTargetOnlineCount(bj, activeCount);
  const stmts = [];
  const marketEligibleUids = [];

  // 第一阶段：按每个 AI 的个体作息、会话剩余时长、休息时长计算自然在线/休息/离线状态
  const plans = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const seed = AI_PLAYER_SEEDS.find(x => x[0] === r.uid) || AI_PLAYER_SEEDS[i % AI_PLAYER_SEEDS.length];
    const chrono = AI_CHRONOTYPES.includes(r.chronotype) ? r.chronotype : (seed[4] || 'evening');
    const schedule = safeJson(r.schedule_json, null) || aiBuildSchedule(r.uid, chrono, i);
    const prefs = safeJson(r.prefs_json, null) || aiBuildPrefs(seed[5], seed[6], r.behavior_profile, r.uid);
    let evo = safeJson(r.evolution_json, null) || aiBuildEvolution(prefs.heroes, bj.day, r.uid);

    const reset = r.daily_reset_day !== bj.day;
    let activity = r.activity_level;
    let profile = r.behavior_profile;
    let dailySpent = reset ? 0 : (r.daily_spent || 0);
    let dailyListed = reset ? 0 : (r.daily_listed || 0);
    let sessionsToday = reset ? 0 : (r.sessions_today || 0);
    let matchesToday = reset ? 0 : (r.matches_today || 0);
    let trainingToday = reset ? 0 : (r.training_today || 0);

    if (reset || (evo.lastEvolvedDay || 0) < bj.day) {
      const ev = aiEvolveDaily(r, prefs, evo, bj.day);
      evo = ev.evo;
      activity = ev.activity;
      profile = ev.profile;
    }

    if (r.active !== 1) {
      plans.push({
        uid: r.uid, active: false, status: 'offline', activity, profile, evo, currentMode: '', currentHero: '',
        sessionUntil: 0, restUntil: 0, nextMarketAt: r.next_market_at || 0,
        sessionsToday, matchesToday, trainingToday, dailySpent, dailyListed,
        matchmakingEnabled: r.matchmaking_enabled === 1, marketEnabled: false,
        prefs, schedule, inWindow: false, wantMatch: false, rndA: 1, rndB: 0.5, rndC: 0.5, rndD: 0.5,
      });
      continue;
    }

    const inWindow = aiInScheduleWindow(schedule, bj, r.uid);
    const rndA = aiHash(`${r.uid}:a:${minuteBucket}`);
    const rndB = aiHash(`${r.uid}:b:${minuteBucket}`);
    const rndC = aiHash(`${r.uid}:c:${minuteBucket}`);
    const rndD = aiHash(`${r.uid}:d:${minuteBucket}`);
    const cCfg = AI_CHRONO_CFG[chrono] || AI_CHRONO_CFG.evening;
    const wkMul = bj.isWeekend ? cCfg.weekendBoost : 1;

    let status = r.status || 'offline';
    let sessionUntil = r.session_until || 0;
    let restUntil = r.rest_until || 0;
    let nextMarketAt = r.next_market_at || (simNow + (schedule.marketCooldownMin || 45) * 60e3);
    let currentMode = r.current_mode || '';
    let currentHero = r.current_hero || '';

    const wasOnline = AI_ONLINE_STATUSES.includes(status);

    if (status === 'resting' && restUntil > simNow) {
      status = 'resting';
      currentMode = '';
      currentHero = '';
    } else if (wasOnline && ((sessionUntil > 0 && simNow >= sessionUntil) || (!sessionUntil) || (!inWindow && rndA < 0.72))) {
      // 会话自然结束或已离开活跃作息窗口 -> 休息或离线
      const rSpan = Math.max(15, (schedule.restMin[1] || 130) - (schedule.restMin[0] || 35));
      const restMins = (schedule.restMin[0] || 35) + Math.round(rndB * rSpan);
      status = inWindow ? 'resting' : 'offline';
      sessionUntil = 0;
      restUntil = status === 'resting' ? simNow + restMins * 60e3 : 0;
      currentMode = '';
      currentHero = '';
    } else if (!wasOnline) {
      // 离线或休息结束：在作息窗口内自然决定是否登录开启新会话
      const loginChance = inWindow
        ? Math.min(0.42, activity * (0.20 + 0.25 * dayFactor) * wkMul)
        : Math.min(0.05, activity * dayFactor * 0.06);
      if (rndA < loginChance) {
        const sSpan = Math.max(12, (schedule.sessionMin[1] || 75) - (schedule.sessionMin[0] || 20));
        const sessMins = (schedule.sessionMin[0] || 20) + Math.round(rndB * sSpan);
        sessionUntil = simNow + sessMins * 60e3;
        restUntil = 0;
        sessionsToday++;
        status = 'menu';
      } else {
        status = inWindow && status === 'resting' ? 'resting' : 'offline';
        sessionUntil = 0;
        if (status === 'offline') restUntil = 0;
        currentMode = '';
        currentHero = '';
      }
    }

    plans.push({
      uid: r.uid, active: true, prevStatus: r.status, status, activity, profile, evo, currentMode, currentHero,
      sessionUntil, restUntil, nextMarketAt,
      sessionsToday, matchesToday, trainingToday, dailySpent, dailyListed,
      matchmakingEnabled: r.matchmaking_enabled === 1, marketEnabled: r.market_enabled === 1,
      prefs, schedule, inWindow, wantMatch: false, rndA, rndB, rndC, rndD,
    });
  }

  // 第二阶段：柔和的人数节律调节（将同时在线 AI 稳定在 UTC+8 目标区间约 75~155 人，避免全员同时在线或全员离线）
  const onlineList = plans.filter(p => p.active && AI_ONLINE_STATUSES.includes(p.status));
  const minBand = Math.max(0, targetOnline - 6);
  const maxBand = Math.min(activeCount, targetOnline + 6);

  if (onlineList.length > maxBand) {
    // 优先让不在活跃窗口内、或会话即将结束的 AI 自然进入休息/离线
    onlineList.sort((a, b) => (a.inWindow === b.inWindow ? (a.sessionUntil - b.sessionUntil) : (a.inWindow ? 1 : -1)));
    let excess = onlineList.length - targetOnline;
    for (const p of onlineList) {
      if (excess <= 0) break;
      const rSpan = Math.max(15, (p.schedule.restMin[1] || 130) - (p.schedule.restMin[0] || 35));
      p.status = p.inWindow ? 'resting' : 'offline';
      p.sessionUntil = 0;
      p.restUntil = p.status === 'resting' ? simNow + ((p.schedule.restMin[0] || 35) + Math.round(p.rndB * rSpan)) * 60e3 : 0;
      p.currentMode = '';
      p.currentHero = '';
      excess--;
    }
  } else if (onlineList.length < minBand) {
    // 优先唤醒当前处于作息窗口内且未处于强制休息期的 AI 登录上线
    const candidates = plans
      .filter(p => p.active && !AI_ONLINE_STATUSES.includes(p.status) && !(p.status === 'resting' && p.restUntil > simNow))
      .sort((a, b) => {
        if (a.inWindow !== b.inWindow) return a.inWindow ? -1 : 1;
        return (b.activity + b.rndA * 0.4) - (a.activity + a.rndA * 0.4);
      });
    let need = targetOnline - onlineList.length;
    for (const p of candidates) {
      if (need <= 0) break;
      const sSpan = Math.max(12, (p.schedule.sessionMin[1] || 75) - (p.schedule.sessionMin[0] || 20));
      const sessMins = (p.schedule.sessionMin[0] || 20) + Math.round(p.rndB * sSpan);
      p.status = 'menu';
      p.sessionUntil = simNow + sessMins * 60e3;
      p.restUntil = 0;
      p.sessionsToday++;
      need--;
    }
  }

  // 第三阶段：为当前在线的 AI 分配活动（大幅提高 AI 专属匹配与排位比例，其余分布于习武训练、市场与大厅）
  for (const p of plans) {
    if (!p.active || !AI_ONLINE_STATUSES.includes(p.status)) continue;

    if (p.prevStatus === 'match' && p.rndC < 0.48) {
      p.matchesToday++;
      p.evo.experience = (p.evo.experience || 0) + 2;
      const won = p.rndB < (0.42 + p.activity * 0.18);
      p.evo.winStreak = won ? (p.evo.winStreak || 0) + 1 : 0;
      p.evo.recentForm = Math.round(((p.evo.recentForm || 0.5) * 0.8 + (won ? 1 : 0) * 0.2) * 100) / 100;
      if (p.currentHero) p.evo.heroMastery[p.currentHero] = Math.min(999, (p.evo.heroMastery[p.currentHero] || 10) + (won ? 3 : 1));
    } else if (p.prevStatus === 'training' && p.rndC < 0.52) {
      p.trainingToday++;
      p.evo.experience = (p.evo.experience || 0) + 1;
      if (p.currentHero) p.evo.heroMastery[p.currentHero] = Math.min(999, (p.evo.heroMastery[p.currentHero] || 10) + 2);
    }

    const hero = aiPickWeightedHero(p.prefs, p.evo, p.rndB);
    const marketDue = p.marketEnabled && simNow >= p.nextMarketAt;
    const marketP = marketDue ? Math.min(0.12, (p.prefs.marketBias || 0.05) + 0.04) : 0;
    const trainP = Math.min(0.14, (p.prefs.trainBias || 0.09) + (p.evo.mood === 'exploratory' ? 0.03 : 0));
    const matchP = p.matchmakingEnabled ? 0.76 : 0;

    if (marketDue && p.rndD < marketP) {
      p.status = 'market';
      p.currentMode = 'market';
      p.currentHero = hero;
      const cdMin = Math.max(25, Math.round((p.schedule.marketCooldownMin || 55) * (0.65 + p.rndC * 0.75)));
      p.nextMarketAt = simNow + cdMin * 60e3;
      marketEligibleUids.push(p.uid);
    } else if (p.rndD < marketP + trainP) {
      p.status = 'training';
      p.currentMode = 'train';
      p.currentHero = hero;
    } else if (p.matchmakingEnabled && p.rndD < marketP + trainP + matchP) {
      p.wantMatch = true;
      p.status = 'queue';
      p.currentMode = aiPickMode(p.prefs, p.evo, true, p.rndC);
      p.currentHero = hero;
    } else {
      p.status = 'menu';
      p.currentMode = '';
      p.currentHero = hero;
    }
  }

  // AI 专属匹配与排位配对：严格只在 wantMatch === true 的 AI 之间成对开局，保留约 20~25% 在队列中模拟真实匹配等待
  const matchSeekers = plans.filter(p => p.wantMatch && p.matchmakingEnabled);
  const targetMatches = Math.floor((matchSeekers.length * 0.76) / 2) * 2;
  for (let i = 0; i < targetMatches; i++) {
    matchSeekers[i].status = 'match';
    if (i % 2 === 1) matchSeekers[i].currentMode = matchSeekers[i - 1].currentMode;
  }

  const rowMap = Object.fromEntries(rows.map(x => [x.uid, x]));
  for (const p of plans) {
    stmts.push(
      env.DB.prepare(
        'UPDATE ai_players SET status = ?1, activity_level = ?2, behavior_profile = ?3, evolution_json = ?4, current_mode = ?5, current_hero = ?6, session_until = ?7, rest_until = ?8, next_market_at = ?9, sessions_today = ?10, matches_today = ?11, training_today = ?12, last_active_at = ?13, daily_spent = ?14, daily_listed = ?15, daily_reset_day = ?16, updated_at = ?17 WHERE uid = ?18'
      ).bind(
        p.status, p.activity, p.profile, JSON.stringify(p.evo), p.currentMode, p.currentHero,
        p.sessionUntil, p.restUntil, p.nextMarketAt,
        p.sessionsToday, p.matchesToday, p.trainingToday,
        AI_ONLINE_STATUSES.includes(p.status) ? simNow : (rowMap[p.uid]?.last_active_at || 0),
        p.dailySpent, p.dailyListed, bj.day, now, p.uid
      )
    );
  }
  if (stmts.length) await aiBatchChunked(env, stmts, 50);
  if (opts.market !== false) {
    await aiMarketStep(env, now, bj.day, opts.forceMarket ? null : marketEligibleUids);
  }
}

// AI 市场参与与防操纵护栏：仅在自然间隔到期时参与，严格限制价格区间（0.75x~1.25x 参考价）、禁止自买自卖、限制每日成交额与挂单数
async function aiMarketStep(env, now, day, eligibleUids = null) {
  let aiRows = (await env.DB.prepare("SELECT a.*, e.ink, e.state_json, e.ver FROM ai_players a JOIN econ e ON e.uid = a.uid WHERE a.active = 1 AND a.market_enabled = 1 AND a.status IN ('menu','queue','match','training','market')").all()).results || [];
  if (Array.isArray(eligibleUids)) {
    if (!eligibleUids.length) return;
    const set = new Set(eligibleUids);
    aiRows = aiRows.filter(r => set.has(r.uid));
  }
  if (!aiRows.length) return;
  let actions = 0;
  const activeOrders = (await env.DB.prepare('SELECT * FROM mkt WHERE state = 0 ORDER BY at ASC LIMIT 20').all()).results || [];
  for (const ord of activeOrders) {
    if (actions >= 2) break;
    const ref = aiRefPrice(ord.k);
    if (ord.price < Math.round(ref * 0.75) || ord.price > Math.round(ref * 1.25)) continue;
    const buyer = aiRows.find(b => b.uid !== ord.seller && (b.daily_reset_day !== day ? 0 : b.daily_spent) + ord.price <= AI_MARKET_MAX_SPENT && b.ink >= ord.price);
    if (!buyer) continue;
    const st = safeJson(buyer.state_json, { items: [] });
    if (!Array.isArray(st.items)) st.items = [];
    const item = safeJson(ord.item_json, null);
    if (!item || !item.k) continue;
    const txId = 'ai_mkt_' + uid(8);
    const updOrd = await env.DB.prepare('UPDATE mkt SET state = 1, buyer = ?1, done_at = ?2, tx = ?3 WHERE id = ?4 AND state = 0').bind(buyer.uid, now, txId, ord.id).run();
    if (!updOrd || !updOrd.meta || !updOrd.meta.changes) continue;
    st.items.push({ ...item, src: 'ai_mkt', at: now });
    const newInk = buyer.ink - ord.price;
    const newSpent = (buyer.daily_reset_day !== day ? 0 : buyer.daily_spent) + ord.price;
    await env.DB.batch([
      env.DB.prepare('UPDATE econ SET ink = ?1, state_json = ?2, ver = ver + 1, updated_at = ?3 WHERE uid = ?4 AND ver = ?5').bind(newInk, JSON.stringify(st), now, buyer.uid, buyer.ver),
      env.DB.prepare('UPDATE ai_players SET daily_spent = ?1, daily_reset_day = ?2, updated_at = ?3 WHERE uid = ?4').bind(newSpent, day, now, buyer.uid),
      env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6)').bind(buyer.uid, now, 'ai_mkt_buy', buyer.ink, newInk, JSON.stringify({ order: ord.id, k: ord.k, price: ord.price }))
    ]);
    actions++;
  }
  for (const seller of aiRows) {
    if (actions >= 3) break;
    const listedToday = seller.daily_reset_day !== day ? 0 : seller.daily_listed;
    if (listedToday >= AI_MARKET_MAX_LIST) continue;
    const st = safeJson(seller.state_json, { items: [] });
    if (!Array.isArray(st.items) || st.items.length < 2) continue;
    const idx = st.items.findIndex(it => it && it.k && C.ITEM && C.ITEM[it.k]);
    if (idx < 0) continue;
    const [picked] = st.items.splice(idx, 1);
    const ref = aiRefPrice(picked.k);
    const priceJitter = 0.94 + aiHash(`${seller.uid}:list:${day}:${listedToday}`) * 0.16;
    const listPrice = Math.max(20, Math.round(ref * priceJitter));
    const mktId = 'aim_' + uid(10);
    await env.DB.batch([
      env.DB.prepare('UPDATE econ SET state_json = ?1, ver = ver + 1, updated_at = ?2 WHERE uid = ?3 AND ver = ?4').bind(JSON.stringify(st), now, seller.uid, seller.ver),
      env.DB.prepare('INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0)').bind(mktId, seller.uid, picked.k, picked.st || 0, JSON.stringify(picked), listPrice, now),
      env.DB.prepare('UPDATE ai_players SET daily_listed = ?1, daily_reset_day = ?2, updated_at = ?3 WHERE uid = ?4').bind(listedToday + 1, day, now, seller.uid),
      env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?1, ?2, ?3, 1, ?4, ?4, ?5)').bind(seller.uid, now, 'ai_mkt_list', seller.ink, JSON.stringify({ order: mktId, k: picked.k, price: listPrice }))
    ]);
    actions++;
  }
}

async function aiAdminList(env, now) {
  await ensureAiPlayers(env, now);
  const rows = (await env.DB.prepare('SELECT a.*, COALESCE(e.ink, 0) AS ink, e.state_json FROM ai_players a LEFT JOIN econ e ON e.uid = a.uid ORDER BY LENGTH(a.uid) ASC, a.uid ASC').all()).results || [];
  const train = await env.DB.prepare('SELECT COUNT(*) AS samples FROM ai_training_matches').first();
  const hRow = await env.DB.prepare("SELECT COUNT(*) AS online, SUM(st = 'match') AS playing, SUM(st = 'queue') AS waiting FROM presence WHERE seen > ?").bind(now - PRESENCE_WINDOW).first();
  const list = rows.map(r => {
    const st = safeJson(r.state_json, { items: [] });
    const schedule = safeJson(r.schedule_json, {});
    const prefs = safeJson(r.prefs_json, {});
    const evolution = safeJson(r.evolution_json, {});
    return {
      uid: r.uid,
      username: r.username,
      active: r.active === 1,
      activityLevel: r.activity_level,
      behaviorProfile: r.behavior_profile,
      chronotype: r.chronotype || 'evening',
      schedule,
      prefs,
      evolution,
      currentMode: r.current_mode || '',
      currentHero: r.current_hero || '',
      sessionUntil: r.session_until || 0,
      restUntil: r.rest_until || 0,
      nextMarketAt: r.next_market_at || 0,
      sessionsToday: r.sessions_today || 0,
      matchesToday: r.matches_today || 0,
      trainingToday: r.training_today || 0,
      matchmakingEnabled: r.matchmaking_enabled === 1,
      marketEnabled: r.market_enabled === 1,
      status: r.status,
      ink: r.ink || 0,
      itemCount: Array.isArray(st.items) ? st.items.length : 0,
      dailySpent: r.daily_spent || 0,
      dailyListed: r.daily_listed || 0,
      lastActiveAt: r.last_active_at || 0,
    };
  });
  const counts = await aiPresenceCounts(env, now);
  const humanCounts = {
    humanOnline: (hRow && hRow.online) || 0,
    humanPlaying: (hRow && hRow.playing) || 0,
    humanWaiting: (hRow && hRow.waiting) || 0,
  };
  return { ok: true, list, total: list.length, counts, humanCounts, trainingSamples: (train && train.samples) || 0, maxDailySpent: AI_MARKET_MAX_SPENT, maxDailyListed: AI_MARKET_MAX_LIST };
}

async function aiAdminUpdate(env, body, who, why, now) {
  await ensureAiPlayers(env, now);
  if (body.tick) {
    let simNow = now;
    if (body.simHour !== undefined && body.simHour !== '' && body.simHour !== null) {
      const h = Number(body.simHour);
      if (!Number.isFinite(h) || h < 0 || h >= 24) return error('模拟小时范围 0~23.99');
      const bjDayStart = Math.floor((now + 8 * 3600e3) / DAY_MS) * DAY_MS - 8 * 3600e3;
      simNow = bjDayStart + Math.round(h * 3600e3);
    }
    await aiTickSimulation(env, now, { simNow, market: !!body.withMarket, forceMarket: !!body.withMarket });
    await logRow(env, 'ai_system', now, 'admin_ai_tick', 1, null, null, JSON.stringify({ by: who, why, withMarket: !!body.withMarket, simHour: body.simHour ?? null }));
    return await aiAdminList(env, simNow);
  }
  const targetUid = String(body.uid || '').trim();
  const row = await env.DB.prepare('SELECT a.*, COALESCE(e.ink, 0) AS ink FROM ai_players a LEFT JOIN econ e ON e.uid = a.uid WHERE a.uid = ?').bind(targetUid).first();
  if (!row) return error('找不到这个 AI 玩家', 404);
  const active = body.active !== undefined ? (body.active ? 1 : 0) : row.active;
  const activity = body.activityLevel !== undefined ? Math.min(1, Math.max(0, Number(body.activityLevel))) : row.activity_level;
  if (!Number.isFinite(activity)) return error('活跃度范围 0~1');
  const profile = body.behaviorProfile !== undefined ? String(body.behaviorProfile) : row.behavior_profile;
  if (!AI_BEHAVIORS.includes(profile)) return error('行为流派不对');
  const chronotype = body.chronotype !== undefined ? String(body.chronotype) : (row.chronotype || 'evening');
  if (!AI_CHRONOTYPES.includes(chronotype)) return error('作息类型不对');
  const mm = body.matchmakingEnabled !== undefined ? (body.matchmakingEnabled ? 1 : 0) : row.matchmaking_enabled;
  const mkt = body.marketEnabled !== undefined ? (body.marketEnabled ? 1 : 0) : row.market_enabled;
  const status = body.status !== undefined ? String(body.status) : row.status;
  if (!AI_STATUSES.includes(status)) return error('状态不对');

  let scheduleJson = row.schedule_json || '{}';
  if (body.chronotype !== undefined && body.chronotype !== row.chronotype) {
    scheduleJson = JSON.stringify(aiBuildSchedule(targetUid, chronotype, 0));
  }
  const curPrefs = safeJson(row.prefs_json, { modes: ['quickmatch', 'ranked', '1v1'], heroes: ['qingfeng'], style: profile });
  curPrefs.style = profile;
  if (Array.isArray(body.preferredModes)) {
    const cleanM = body.preferredModes.map(String).filter(m => AI_MODES.includes(m)).slice(0, 5);
    if (cleanM.length) curPrefs.modes = cleanM;
  }
  if (Array.isArray(body.preferredHeroes)) {
    const cleanH = body.preferredHeroes.map(String).filter(h => !C.HERO_IDS || C.HERO_IDS.includes(h)).slice(0, 6);
    if (cleanH.length) curPrefs.heroes = cleanH;
  }

  const stmts = [
    env.DB.prepare('UPDATE ai_players SET active = ?1, activity_level = ?2, behavior_profile = ?3, chronotype = ?4, schedule_json = ?5, prefs_json = ?6, matchmaking_enabled = ?7, market_enabled = ?8, status = ?9, updated_at = ?10 WHERE uid = ?11')
      .bind(active, activity, profile, chronotype, scheduleJson, JSON.stringify(curPrefs), mm, mkt, status, now, targetUid),
    env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?1, ?2, ?3, 1, ?4, ?4, ?5)')
      .bind(targetUid, now, 'admin_ai_cfg', row.ink, JSON.stringify({ by: who, why, active, activity, profile, chronotype, mm, mkt, status }))
  ];
  if (body.inkDelta !== undefined && Number.isFinite(Number(body.inkDelta)) && Number(body.inkDelta) !== 0) {
    const delta = Math.trunc(Number(body.inkDelta));
    const nextInk = Math.max(0, (row.ink || 0) + delta);
    stmts.push(env.DB.prepare('UPDATE econ SET ink = ?1, ver = ver + 1, updated_at = ?2 WHERE uid = ?3').bind(nextInk, now, targetUid));
  }
  await env.DB.batch(stmts);
  return await aiAdminList(env, now);
}
// ===========================================================================
// 全服玩法：天魔讨伐、排行榜、侠客列传的江湖足迹、全服肉鸽 · 江湖长卷、开放世界的公共小工具
// ===========================================================================
// 文件结构：
//   1. 天魔讨伐（gb*）：全服一起打一只天魔，按伤害结算
//   2. 排行榜（leaderboard）
//   3. 江湖足迹（sagaFoot / sagaMarkPost）
//   4. 江湖长卷（chron*）：全服共享剧情进度，存在 D1 的 chron 表
//   5. 开放世界用到的小工具（rg* / cq* / wl*），给 70-world-simulation.js 用
//
// 找 bug 提示：天魔的血量和刷新周期是文件开头的 GB_* 常量；长卷的节点表来自 src/data/13-chron.js。
const GB_TRY_MAX = 9000, GB_DPS = 110, GB_LIFE = 3 * DAY_MS, GB_TICKET = 3600e3, GB_HP0 = 30000;
const GB_AFFIX = ['bx_enrage', 'bx_thunder', 'bx_regen', 'bx_thorns', 'bx_armor', 'bx_frost', 'bx_venom', 'bx_haste'];
const gbLatest = env => env.DB.prepare('SELECT * FROM gboss ORDER BY gen DESC LIMIT 1').first();
function gbNext(prev, now) {
  const gen = prev ? prev.gen + 1 : 1;
  const heroes = C.HERO_IDS.filter(h => !prev || h !== prev.hero);
  const hero = heroes[Math.floor(rnd() * heroes.length)];
  const bag = GB_AFFIX.slice(), affix = [];
  for (let n = Math.min(4, 2 + Math.floor((gen - 1) / 4)); n > 0; n--) affix.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]);
  // 上一代打死了就更硬一点，遁走了就弱一点
  const hp = !prev ? GB_HP0 : prev.killer ? Math.min(300000, Math.round(prev.max_hp * 1.2)) : Math.max(15000, Math.round(prev.max_hp * 0.8));
  return env => env.DB.prepare('INSERT OR IGNORE INTO gboss (gen, hero, affix, max_hp, hp, started, until) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(gen, hero, affix.join(','), hp, hp, now, now + GB_LIFE);
}
// 结束了的那一代发奖励、出下一代。可以重复跑：奖励的编号是固定的（INSERT OR IGNORE），下一代也只插得进一次
async function gbSettle(env, b, now) {
  const rows = (await env.DB.prepare('SELECT uid, dmg FROM gboss_hit WHERE gen = ? AND dmg > 0 ORDER BY dmg DESC').bind(b.gen).all()).results || [];
  const kill = !!b.killer, stmts = [];
  rows.forEach((r, i) => {
    const share = Math.min(1, r.dmg / b.max_hp);
    let ink = kill ? 120 + Math.min(880, Math.round(3000 * share)) : 60 + Math.min(440, Math.round(1500 * share));
    const killer = kill && r.uid === b.killer;
    if (killer) ink += 300;
    const items = kill && (i < 3 || killer) ? { cases: { [C.CASES[Math.floor(rnd() * C.CASES.length)]]: 1 } } : {};
    const note = kill ? `天魔讨伐 · 第 ${b.gen} 代被斩杀${killer ? ' · 斩杀一击' : i < 3 ? ` · 伤害第 ${i + 1}` : ''}` : `天魔讨伐 · 第 ${b.gen} 代遁走 · 参战奖励`;
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO gift (id, uid, ink, items_json, note, by, at, until, born) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(`gb${b.gen}_${r.uid}`, r.uid, ink, JSON.stringify(items), note, 'gboss', now, now + 30 * DAY_MS, now));
  });
  stmts.push(gbNext(b, now)(env));
  stmts.push(env.DB.prepare('UPDATE gboss SET paid = 1 WHERE gen = ?').bind(b.gen));
  stmts.push(logStmt(env, '*', now, 'gboss_end', 1, null, null, JSON.stringify({ gen: b.gen, killer: b.killer || null, players: rows.length })));
  await env.DB.batch(stmts);
}
// 现在这一代：没有就建第一代；到时没打死的算遁走；结束了还没发奖励的补发
async function gbNow(env, now) {
  let b = await gbLatest(env);
  if (!b) { await gbNext(null, now)(env).run(); b = await gbLatest(env); }
  if (!b.ended && b.until <= now) {
    await env.DB.prepare('UPDATE gboss SET ended = ? WHERE gen = ? AND ended = 0').bind(now, b.gen).run();
    b = await gbLatest(env);
  }
  if (b.ended && !b.paid) { await gbSettle(env, b, now); b = await gbLatest(env); }
  return b;
}
async function gbState(env, b, uid, now) {
  const [top, cnt, me, kills, last, feed, live] = await Promise.all([
    env.DB.prepare('SELECT u.username AS name, h.dmg, h.runs FROM gboss_hit h LEFT JOIN users u ON u.id = h.uid WHERE h.gen = ? ORDER BY h.dmg DESC LIMIT 8').bind(b.gen).all(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM gboss_hit WHERE gen = ?').bind(b.gen).first(),
    uid ? env.DB.prepare('SELECT dmg, runs FROM gboss_hit WHERE gen = ? AND uid = ?').bind(b.gen, uid).first() : null,
    env.DB.prepare('SELECT COUNT(*) AS n FROM gboss WHERE killer IS NOT NULL').first(),
    env.DB.prepare('SELECT g.gen, g.hero, g.max_hp, g.ended, u.username AS killer, g.killer IS NOT NULL AS killed FROM gboss g LEFT JOIN users u ON u.id = g.killer WHERE g.gen = ?').bind(b.gen - 1).first(),
    env.DB.prepare('SELECT u.username AS name, t.dmg, t.done AS at, t.killed FROM gboss_try t LEFT JOIN users u ON u.id = t.uid WHERE t.gen = ? AND t.done > 0 AND t.dmg > 0 ORDER BY t.done DESC LIMIT 6').bind(b.gen).all(),
    env.DB.prepare('SELECT COUNT(DISTINCT uid) AS n FROM gboss_try WHERE done = 0 AND started > ?').bind(now - 150e3).first(),
  ]);
  const name = x => x || '已注销的侠客';
  return {
    ok: true, now,
    boss: { gen: b.gen, hero: b.hero, affix: b.affix.split(',').filter(Boolean), maxHp: b.max_hp, hp: b.hp, started: b.started, until: b.until, ended: b.ended },
    kills: (kills && kills.n) || 0,
    players: (cnt && cnt.n) || 0,
    fighting: (live && live.n) || 0,
    top: ((top && top.results) || []).map(r => ({ name: name(r.name), dmg: r.dmg, runs: r.runs })),
    feed: ((feed && feed.results) || []).map(r => ({ name: name(r.name), dmg: r.dmg, at: r.at, killed: !!r.killed })),
    me: uid ? { dmg: (me && me.dmg) || 0, runs: (me && me.runs) || 0 } : null,
    last: last ? { gen: last.gen, hero: last.hero, maxHp: last.max_hp, ended: last.ended, killed: !!last.killed, killer: last.killed ? name(last.killer) : null } : null,
    rules: { fight: 90, tryMax: GB_TRY_MAX, life: GB_LIFE },
  };
}
async function gbStart(env, auth, now) {
  const uid = auth.user.id;
  const ban = await banOf(env, uid, now);
  if (ban) return banned(ban);
  if (!(await hit(env, 'gbs:' + uid, 1, 15e3, now))) return error('刚出战过，稍等几秒再来', 429);
  if (!(await hit(env, 'gbd:' + uid, 40, DAY_MS, now))) return error('今天已经讨伐很多次了，明天再来', 429);
  const b = await gbNow(env, now);
  const id = randHex(10);
  await env.DB.prepare('INSERT INTO gboss_try (id, uid, gen, started) VALUES (?, ?, ?, ?)').bind(id, uid, b.gen, now).run();
  return json({ ...(await gbState(env, b, uid, now)), ticket: id });
}
async function gbHit(env, auth, body, now) {
  const uid = auth.user.id, id = String(body.id || '');
  if (!/^[0-9a-f]{20}$/.test(id)) return error('出战记录不对');
  if (!(await hit(env, 'gbh:' + uid, 30, 60e3, now))) return error('交得太快了，稍等再试', 429);
  const t = await env.DB.prepare('SELECT * FROM gboss_try WHERE id = ? AND uid = ?').bind(id, uid).first();
  if (!t) return error('找不到这次出战', 404);
  const done = async (extra) => {
    const t2 = await env.DB.prepare('SELECT dmg, killed, gen FROM gboss_try WHERE id = ?').bind(id).first();
    const b = await gbNow(env, now);
    return json({ ...(await gbState(env, b, uid, now)), credited: t2.dmg, killed: !!t2.killed, tryGen: t2.gen, ...extra });
  };
  if (t.done) return await done({ dup: true });
  const asked = Math.max(0, Math.floor(+body.dmg || 0));
  const late = now - t.started > GB_TICKET;
  const cap = late ? 0 : Math.max(0, Math.min(GB_TRY_MAX, Math.floor((now - t.started - 3000) / 1000 * GB_DPS)));
  const dmg = Math.min(asked, cap);
  const tx = randHex(8);
  const stmts = [env.DB.prepare('UPDATE gboss_try SET done = ?, tx = ? WHERE id = ? AND uid = ? AND done = 0').bind(now, tx, id, uid)];
  if (dmg > 0) {
    // 只有刚才那一句改成了（tx 对得上），下面几句才生效；天魔已经倒了 / 遁走了 / 换代了就一句都不生效，这次记 0
    stmts.push(env.DB.prepare(`UPDATE gboss SET last = MIN(hp, ?1), last_tx = ?2, killer = CASE WHEN hp <= ?1 THEN ?3 ELSE killer END,
        ended = CASE WHEN hp <= ?1 THEN ?4 ELSE 0 END, hp = MAX(0, hp - ?1)
        WHERE gen = ?5 AND hp > 0 AND ended = 0 AND until > ?4 AND EXISTS (SELECT 1 FROM gboss_try WHERE id = ?6 AND tx = ?2)`).bind(dmg, tx, uid, now, t.gen, id));
    stmts.push(env.DB.prepare(`INSERT INTO gboss_hit (gen, uid, dmg, runs, last) SELECT ?1, ?2, last, 1, ?3 FROM gboss WHERE gen = ?1 AND last_tx = ?4
        ON CONFLICT(gen, uid) DO UPDATE SET dmg = gboss_hit.dmg + excluded.dmg, runs = gboss_hit.runs + 1, last = excluded.last`).bind(t.gen, uid, now, tx));
    stmts.push(env.DB.prepare(`UPDATE gboss_try SET dmg = COALESCE((SELECT last FROM gboss WHERE gen = ?1 AND last_tx = ?2), 0),
        killed = COALESCE((SELECT hp = 0 FROM gboss WHERE gen = ?1 AND last_tx = ?2), 0) WHERE id = ?3 AND tx = ?2`).bind(t.gen, tx, id));
  }
  await env.DB.batch(stmts);
  if (asked > cap) await logRow(env, uid, now, 'gboss_cap', 1, null, null, JSON.stringify({ id, asked, cap, gen: t.gen }));
  return await done({ capped: asked > cap, late });
}

/* ---------- 排行榜 ----------
 * 段位分、胜负场都是玩家自己的网页算好存进存档的（rk、netWins / netLosses），服务器只负责排序和挡掉被封的号，
 * 所以这里的数只用来展示，不拿去发奖励。
 * 胜场榜挡掉明显是改出来的数：胜场到了 LB_WIN_FAKE（游戏开服才一个多月，没人打得到），或者一场没输却赢了 LB_WIN_CLEAN 场以上。
 * 这些号不封、存档不动，只是不上榜；真要处理用管理网页封号。 */
const LB_N = 100, RK_PLACE = 3, RK_MIN = 1000, RK_MAX = 25000, LB_WIN_FAKE = 1000, LB_WIN_CLEAN = 30;
async function leaderboard(env, kind, season, me, now) {
  const notBanned = "deleted_at = 0 AND COALESCE(password_algo, '') != 'ai-bot-locked' AND id NOT IN (SELECT uid FROM sanctions WHERE perm = 1 OR ban_until > ?1)";
  if (kind === 'rank') {
    if (!/^S\d{1,3}$/.test(season)) return { ok: true, kind, list: [] };
    const rows = (await env.DB.prepare(
      `SELECT id, username, CASE WHEN COALESCE(json_extract(profile_json, '$.rk.pts'), 0) > 0 THEN json_extract(profile_json, '$.rk.pts') ELSE json_extract(profile_json, '$.rk.est') END AS pts FROM users WHERE ${notBanned}
       AND json_extract(profile_json, '$.rk.season') = ?2 AND json_extract(profile_json, '$.rk.placed') >= ?3
       ORDER BY pts DESC, updated_at LIMIT ?4`).bind(now, season, RK_PLACE, LB_N).all()).results || [];
    return { ok: true, kind, list: rows.map(r => ({ name: r.username, pts: Math.max(RK_MIN, Math.min(RK_MAX, Math.round(+r.pts || 0))), me: r.id === me })) };
  }
  const [rows, cnt] = await Promise.all([
    env.DB.prepare(
      `SELECT id, username, json_extract(profile_json, '$.netWins') AS w, json_extract(profile_json, '$.netLosses') AS l FROM users WHERE ${notBanned}
       AND json_extract(profile_json, '$.netWins') > 0 AND json_extract(profile_json, '$.netWins') < ?3
       AND NOT (COALESCE(json_extract(profile_json, '$.netLosses'), 0) = 0 AND json_extract(profile_json, '$.netWins') > ?4)
       ORDER BY w DESC, l, updated_at LIMIT ?2`).bind(now, LB_N, LB_WIN_FAKE, LB_WIN_CLEAN).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE deleted_at = 0 AND COALESCE(password_algo, '') != 'ai-bot-locked'").first(),
  ]);
  const n = v => Math.max(0, Math.min(1e6, Math.floor(+v || 0)));
  return { ok: true, kind, players: (cnt && cnt.n) || 0, list: (rows.results || []).map(r => ({ name: r.username, wins: n(r.w), losses: n(r.l), me: r.id === me })) };
}

/* ---------- 侠客列传：江湖足迹 ---------- */
async function sagaFoot(env, hero) {
  const [rows, recent] = await Promise.all([
    env.DB.prepare('SELECT node, pick, COUNT(*) AS n FROM saga_mark WHERE hero = ? GROUP BY node, pick').bind(hero).all(),
    env.DB.prepare("SELECT u.username AS name, m.pick, m.at FROM saga_mark m JOIN users u ON u.id = m.uid WHERE m.hero = ? AND m.node = 'end' ORDER BY m.at DESC LIMIT 5").bind(hero).all(),
  ]);
  const nodes = {};
  for (const r of (rows && rows.results) || []) {
    const x = nodes[r.node] || (nodes[r.node] = { n: 0, picks: {} });
    x.n += r.n; x.picks[r.pick] = r.n;
  }
  return { ok: true, hero, nodes, recent: ((recent && recent.results) || []).map(r => ({ name: r.name, pick: r.pick, at: r.at })) };
}
async function sagaMarkPost(env, auth, body, now) {
  const hero = String(body.hero || ''), node = String(body.node || ''), pick = String(body.pick || '');
  if (!C.HERO_IDS.includes(hero) || !/^(n[1-9]|c[1-9]|end)$/.test(node) || !/^[a-z0-9_]{1,16}$/.test(pick)) return error('记录格式不对');
  if (!(await hit(env, 'saga:' + auth.user.id, 120, 3600e3, now))) return error('记得太频繁了', 429);
  await env.DB.prepare('INSERT INTO saga_mark (hero, node, uid, pick, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(hero, node, uid) DO UPDATE SET pick = ?4, at = ?5')
    .bind(hero, node, auth.user.id, pick, now).run();
  return json({ ok: true });
}

/* ---------- 全服肉鸽 · 江湖长卷：全服共享的剧情进度（D1 的 chron 表，节点表在 src/data/13-chron.js） ----------
 * 分线（WorldLine）报出力：chronReport 一个 batch 就是一个事务——先插这次上报的编号（chron_rep，重发的插不进去），
 * 后面每一句都要求「这个编号是这一次插进去的」（nonce 对得上）才生效，所以同一次上报重发多少遍都只算一次。
 * 出力只算进全服当前这一节：每个号在这一节出了多少力记进 chron_part，全服完成数 got 往上加、最多加到 need。
 * 够数了 chronAdvance 推到下一节：UPDATE … WHERE node = 这一节 AND got >= need，几条线同时推只有一条推得动，进度只进一节、只会往前走。
 * 完成的节写进 chron_done（墨锭、秘卷按 13-chron.js 当时算好），玩家调 /api/world/chron/claim 自己领。 */
const CQ_COLS = 'node, got, need, g, v';
const cqAmt = base => `CASE g ${CQ_KEYS.map((k, i) => `WHEN '${k}' THEN ?${base + i}`).join(' ')} ELSE 0 END`;   // 按全服当前这一节的目标，取出力里对应的那个数
async function chronRead(env) {
  await ensureSchema(env);
  return await env.DB.prepare(`SELECT ${CQ_COLS} FROM chron WHERE id = 1`).first();
}
async function chronReport(env, line, out, now) {
  await ensureSchema(env);
  const DB = env.DB, nonce = randHex(8), num = n => Math.max(0, Math.min(1e6, Math.floor(+n) || 0));
  const mine = 'EXISTS (SELECT 1 FROM chron_rep WHERE rid = ?1 AND nonce = ?2)', amt = cqAmt(3);   // ?1 编号、?2 nonce、?3 ~ ?10 八个数
  const st = [DB.prepare('INSERT OR IGNORE INTO chron_rep (rid, nonce, at) VALUES (?, ?, ?)').bind(String(out.rid).slice(0, 64), nonce, now)];
  for (const [uid, v] of Object.entries(out.by || {}).slice(0, CQ_T.MAX_UID)) {
    st.push(DB.prepare(`INSERT INTO chron_part (node, uid, amt) SELECT node, ?11, ${amt} FROM chron WHERE id = 1 AND node < ?12 AND ${amt} > 0 AND ${mine} ON CONFLICT(node, uid) DO UPDATE SET amt = amt + excluded.amt`)
      .bind(String(out.rid).slice(0, 64), nonce, ...CQ_KEYS.map((_, i) => num(v[i])), String(uid), CQ.N));
  }
  st.push(DB.prepare(`UPDATE chron SET got = MIN(need, got + ${amt}), at = ?11 WHERE id = 1 AND node < ?12 AND ${mine}`)
    .bind(String(out.rid).slice(0, 64), nonce, ...CQ_KEYS.map((_, i) => num(out.v[i])), now, CQ.N));
  st.push(DB.prepare(`SELECT ${CQ_COLS} FROM chron WHERE id = 1`));
  const res = await DB.batch(st);
  return chronAdvance(env, (res[res.length - 1].results || [])[0], line, now);
}
// 这一节够数了：推到下一节，写下完成记录。别的线已经推过了就什么都不改（WHERE node = 这一节）
async function chronAdvance(env, s, line, now) {
  const DB = env.DB;
  for (let k = 0; k < 3 && s && s.node < CQ.N && s.got >= s.need; k++) {
    const cur = cqNode(s.node), nx = cqNode(s.node + 1);
    const res = await DB.batch([
      DB.prepare('UPDATE chron SET node = node + 1, got = 0, need = ?, g = ?, v = v + 1, at = ? WHERE id = 1 AND node = ? AND got >= need').bind(nx ? nx.need : 1, nx ? nx.key : 'done', now, s.node),
      DB.prepare('INSERT OR IGNORE INTO chron_done (node, at, line, ink, mj) SELECT ?1, ?2, ?3, ?4, ?5 WHERE (SELECT node FROM chron WHERE id = 1) > ?1').bind(s.node, now, line | 0, cur.ink, cur.mj ? cqMj(cur.i) : ''),
      DB.prepare(`SELECT ${CQ_COLS} FROM chron WHERE id = 1`),
    ]);
    s = (res[2].results || [])[0];
  }
  return s;
}
// 我在长卷里拿到的个人秘卷（新的在前，不重复）、还有几节能领
async function chronMine(env, uid) {
  const [mj, todo] = await env.DB.batch([
    env.DB.prepare("SELECT d.mj AS mj FROM chron_claim c JOIN chron_done d ON d.node = c.node WHERE c.uid = ? AND d.mj != '' ORDER BY c.node DESC LIMIT 300").bind(uid),
    env.DB.prepare('SELECT COUNT(*) AS n FROM chron_part p JOIN chron_done d ON d.node = p.node WHERE p.uid = ?1 AND p.amt > 0 AND NOT EXISTS (SELECT 1 FROM chron_claim c WHERE c.node = p.node AND c.uid = ?1)').bind(uid),
  ]);
  return { mj: [...new Set((mj.results || []).map(r => r.mj).filter(id => RG.PERKS.includes(id)))], todo: ((todo.results || [])[0] || {}).n || 0 };
}
async function chronGet(env, uid) {
  const s = await chronRead(env);
  const done = (await env.DB.prepare('SELECT node, at, line FROM chron_done ORDER BY node DESC LIMIT 5').all()).results || [];
  return { ok: true, n: CQ.N, s: s || null, done, mine: uid ? await chronMine(env, uid) : null };
}
// 领奖：出过力、已经完成、还没领过的节一次领完（最多 500 节，多的下次再领）。主键 (node, uid) 挡住重复领，几个网页同时点也只领一次；
// 墨锭合成一份 gift（编号跟着这一次领取走，下次动武库时自动到账），秘卷记在 chron_claim 里（进关键战时带上）
async function chronClaim(env, auth, now) {
  const uid = auth.user.id, DB = env.DB;
  const ban = await banOf(env, uid, now);
  if (ban) return banned(ban);
  if (!(await hit(env, 'cqc:' + uid, 20, 60e3, now))) return error('领得太快了，歇一会儿再试', 429);
  await ensureSchema(env);
  const cn = randHex(8);
  const res = await DB.batch([
    DB.prepare('INSERT OR IGNORE INTO chron_claim (node, uid, cn, at) SELECT d.node, ?1, ?2, ?3 FROM chron_done d JOIN chron_part p ON p.node = d.node AND p.uid = ?1 WHERE p.amt > 0 AND NOT EXISTS (SELECT 1 FROM chron_claim c WHERE c.node = d.node AND c.uid = ?1) ORDER BY d.node LIMIT 500').bind(uid, cn, now),
    DB.prepare("INSERT OR IGNORE INTO gift (id, uid, ink, items_json, note, by, at, until, born) SELECT 'cq' || ?2 || '_' || ?1, ?1, SUM(d.ink), '{}', ?4, 'chron', ?3, ?5, ?3 + 1 FROM chron_claim c JOIN chron_done d ON d.node = c.node WHERE c.uid = ?1 AND c.cn = ?2 GROUP BY c.uid HAVING COUNT(*) > 0 AND SUM(d.ink) > 0")
      .bind(uid, cn, now, '全服肉鸽 · 江湖长卷奖励', now + 30 * DAY_MS),
    DB.prepare('SELECT c.node AS node, d.ink AS ink, d.mj AS mj FROM chron_claim c JOIN chron_done d ON d.node = c.node WHERE c.uid = ? AND c.cn = ? ORDER BY c.node').bind(uid, cn),
  ]);
  const rows = res[2].results || [], ink = rows.reduce((a, r) => a + (+r.ink || 0), 0), mj = rows.map(r => r.mj).filter(Boolean);
  if (rows.length) await logRow(env, uid, now, 'chron_claim', 1, null, null, JSON.stringify({ n: rows.length, from: rows[0].node, to: rows[rows.length - 1].node, ink, mj }));
  return json({ ok: true, got: rows.length, ink, mj, mine: await chronMine(env, uid) });
}

/* ---------- 江湖共斗 · 开放世界（/api/world/line/N，WebSocket） ----------
   一条分线 = 一个 Durable Object（WorldLine）。妖物和妖王由服务器每秒模拟 10 次；每位侠客只在自己的网页里模拟，
   服务器只收「我在哪、在做什么、打中了哪只妖物多少伤害」，伤害按距离和每秒上限封顶，改网页也刷不动。
   妖物出招时广播一条攻击，打没打中由挨打的那个网页自己判定（跟斩妖列传里一样能格挡、能闪）。
   每线最多 WL.CAP 人，满了网页自动去下一线，线数不设上限；每次只发视野内（左右 WL.AOI）最近的 WL.NEAR 位侠客。
   免费额度：网页发上来的消息 20 条算一次请求，发下去的不算；没人时停掉定时器，Durable Object 自动休眠不计时。 */
const WL = {
  CAP: 40, W: 24000, WALL: 60, TICK: 100, AOI: 2000, NEAR: 24, AGGRO: 700, IDLE: 15e3,
  HIT_MAX: 160, HIT_RANGE: 420, DPS: 320, BURST: 900,   // 单次伤害上限、离妖物多远还算打得到、每秒伤害上限和攒着的上限
  BOSS_EVERY: 40, BOSS_LIFE: 360,                         // 全线每斩 40 只妖物，魔窟里出一次妖王；6 分钟没打死就遁走
  ZONES: [
    { a: 60, b: 2000, hp: 1, dk: 1, keys: ['blade', 'archer', 'owl'] },                          // 竹林
    { a: 2000, b: 4000, hp: 1.5, dk: 1.25, keys: ['blade', 'archer', 'owl', 'binder'] },         // 古道
    { a: 4000, b: 6000, hp: 2.2, dk: 1.5, keys: ['blade', 'archer', 'binder', 'caster'] },       // 山寨
    { a: 6000, b: 8000, hp: 3, dk: 1.8, keys: ['blade', 'archer', 'owl', 'binder', 'caster'] },  // 魔窟
    { a: 8000, b: 12000, hp: 3.5, dk: 2.0, keys: ['blade', 'archer', 'owl', 'binder', 'caster'] }, // 荒村
    { a: 12000, b: 16000, hp: 4.2, dk: 2.3, keys: ['blade', 'binder', 'caster'] },                // 寒渊
    { a: 16000, b: 20000, hp: 5.0, dk: 2.6, keys: ['archer', 'owl', 'caster'] },                 // 绝峰
    { a: 20000, b: 23940, hp: 6.0, dk: 3.0, keys: ['blade', 'archer', 'owl', 'binder', 'caster'] }, // 祭坛
  ],
  MON: { blade: { hp: 40, spd: 150, keep: 70 }, archer: { hp: 30, spd: 120, keep: 380 }, binder: { hp: 34, spd: 90, keep: 260 }, caster: { hp: 32, spd: 100, keep: 320 }, owl: { hp: 24, spd: 220, keep: 0 } },
};
/* 全服肉鸽：每条分线一份共享进程。一轮 RG.JIE 劫，每劫全线斩够妖物后投票选一卷秘卷，全线共享；第 RG.JIE 劫斩够后进关键战。
   关键战：线上真人（按账号去重，游客按连接）够 RG.BOSS_MIN 人打天道 Boss（每人在自己网页里打同一只融魂魔首，血量全线共享，
   以服务器为准）。打赢了，够资格的云端账号由服务器写进 gift 表发一件随机星座皮肤（下次动武库自动领）。
   奖励相关的数都在 RG 里，改这里就行。 */
const RG = {
  JIE: 5, VOTE_T: 15, PERK_MAX: 24, TOTAL_STORIES: 1080,
  NEED0: 20, NEED_PER: 5, NEED_MAX: 150, CYC_HP: 0.15, CYC_HP_MAX: 3,   // 每劫要斩几只：20 + 每人 5 只；每过一轮妖物血量 +15%
  BOSS_MIN: 3, BOSS_HP: 1500, BOSS_T: 180,                              // 几个真人打 Boss、Boss 每人份的血、限时（秒）
  TRIO_T: 420,                                                          // 真人不够时改打 3 位天道 AI 的车轮战，限时（秒）
  KEY_DPS: 90, KEY_HIT_MAX: 600,                                        // 关键战伤害封顶：开战秒数 × 每秒上限，一次最多交多少
  ZOD_PER_DAY: 1, MIN_AGE_H: 24, MIN_JIE: 3, MIN_SHARE: 0.25, INK: 200, // 星座皮肤：每号每天几件、注册满几小时、这一轮至少在场几劫、伤害至少平均份额的几成、附带墨锭
  // 可以抽到的秘卷：src/game/22-scrolls.js 里不分侠客的凡品、精品、绝品（tools/tests/world-test.mjs 会核对这些编号都还在）
  PERKS: ['ink_resonance', 'storm_wrath', 'air_burst', 'ink_blade', 'first_blood', 'executioner', 'giant_slayer', 'crescendo', 'heavy_hand', 'needle_rain', 'counter_master', 'backstab', 'sniper', 'brawler', 'momentum', 'crit_eye', 'lethal_rhythm', 'sunder', 'double_strike', 'shockwave', 'ult_amp', 'piercing_wind', 'golden_bell', 'parry_refresh', 'iron_skin', 'thorns', 'last_stand', 'guard_wall', 'retaliation', 'second_wind', 'evasion', 'stone_stance', 'aegis', 'counter_guard', 'jg_window', 'meditation', 'bulwark', 'proj_ward', 'ult_resist', 'after_armor', 'lifeline', 'recoil_guard', 'thunder_dash', 'sky_master', 'swift_feet', 'phantom_step', 'jump_guard', 'dash_strike', 'aerial_ace', 'feather_fall', 'jg_blink', 'wind_runner', 'dash_cd', 'slipstream', 'air_reset', 'ground_slam', 'escape_meter', 'sidestep', 'light_cdr', 'skill_echo', 'haste', 'ult_cdr', 'alternate', 'break_reset', 'hurt_cdr', 'full_meter_cdr', 'low_hp_haste', 'patient_power', 'jg_escape', 'combo_cdr', 'link_skill', 'opening_haste', 'cd_shield', 'flow_combo', 'meter_start', 'meter_block', 'meter_drain', 'meter_heal', 'ult_refund', 'meter_power', 'jg_meter', 'meter_shield', 'overflow', 'meter_bank', 'foe_meter_cut', 'ult_heal', 'guard_regen', 'fury', 'full_hp', 'berserker', 'far_reach', 'wall_pin', 'clutch', 'opener', 'untouched', 'juggler', 'low_leech', 'stance_switch', 'stun_bonus', 'block_punish', 'full_meter_foe', 'odd_even', 'heat', 'frost_lock', 'bleed_rend', 'venom', 'virulent', 'ignite', 'wildfire', 'shatter', 'hemorrhage', 'marked_prey', 'static', 'weaken', 'expose', 'root_strike', 'plague', 'cauterize', 'toxic_guard', 'frost_aura', 'chill_proj', 'frost_armor', 'deep_freeze', 'chain_lightning', 'thunder_mark', 'overcharge', 'storm_guard', 'charge_break', 'proj_absorb', 'listen_wind', 'skill_heal', 'guard_crush', 'after_skill_light', 'pressure', 'escape_strike', 'jg_heal'],
};
const RG_STORY_PREFIX = ['风起', '月落', '雪漫', '雷动', '剑啸', '残阳', '雾锁', '夜伏', '血染', '霜降', '影潜', '寒夜', '破晓', '云涌', '铁马', '金戈', '碧血', '幽冥', '赤霄', '孤鸿', '裂地', '踏碎', '断空', '伏虎', '屠龙', '定海', '惊蛰', '白露', '玄冰', '炎狱', '万象', '千重', '渡劫', '问道', '归墟', '封魔', '诛邪', '荡寇', '斩魄', '镇魂'];
const RG_STORY_PLACES = ['竹林', '古道', '山寨', '魔窟', '荒村', '寒渊', '绝峰', '祭坛', '剑冢', '黑水', '落雁坡', '断魂桥', '望月阁', '幽冥谷', '藏剑阁', '百妖窟', '流沙城', '苍梧峰', '洗剑池', '锁妖塔', '青玉坛', '万劫谷', '天机崖', '凌霄顶', '无妄海', '九幽殿', '赤水滩', '孤竹亭', '伏魔殿', '寒晶洞', '烈火峡', '紫竹林'];
const RG_STORY_OBJS = ['平妖乱', '破妖阵', '斩妖魁', '护灵脉', '寻古印', '渡险关', '诛凶灵', '定天道'];
function rgStory(num) {
  num = Math.max(1, (num | 0) || 1);
  if (typeof cqNode === 'function' && typeof CQ !== 'undefined' && num <= CQ.N) {
    const node = cqNode(num - 1);
    if (node) {
      const chName = (CQ.CH[node.ch] && CQ.CH[node.ch].n) || '江湖长卷';
      return {
        num,
        name: `第 ${num} 回 · ${chName}`,
        lore: `${node.t}。${node.line}`,
        need: node.need,
      };
    }
  }
  const p = RG_STORY_PREFIX[(num * 17) % RG_STORY_PREFIX.length];
  const l = RG_STORY_PLACES[(num * 31) % RG_STORY_PLACES.length];
  const o = RG_STORY_OBJS[(num * 13) % RG_STORY_OBJS.length];
  return {
    num,
    name: `第 ${num} 回 · ${p}${l}`,
    lore: `侠客们齐聚${l}，携手同心${o}。`,
    need: 20 + (num % 20) * 3,
  };
}
const rgNew = () => ({ cyc: 1, jie: 1, got: 0, need: RG.NEED0, perks: [], vote: null, key: null, seq: 0, story: 1, totalStories: RG.TOTAL_STORIES });
/* 全服肉鸽 · 江湖长卷：全服共享的剧情线（节点表在 src/data/13-chron.js）。全服只有一份进度，在 D1 的 chron 表里，只会往前走：
   每条线把攒着的出力（斩妖、各段斩妖、妖王、劫、关键战告捷）每 CQ_T.REP 秒报一次（chronReport），够这一节了就推到下一节（chronAdvance，
   只有 node 还是这一节的那一下推得动，几条线同时够数也只进一节）。同一次上报重发只算一次（chron_rep）。
   奖励不在分线上发：玩家调 /api/world/chron/claim 领自己出过力、完成了、还没领过的节（chron_claim 主键挡住重复领），掉线、换线以后照样补领。 */
const { CHRON: CQ, chronNode: cqNode } = globalThis.RenyingChron;
const CQ_KEYS = ['kill', 'z0', 'z1', 'z2', 'z3', 'king', 'jie', 'key'];
const CQ_T = { REP: 20, READ: 10, MAX_UID: 60 };   // 多久报一次出力、没出力时多久看一次全服进度（秒）、一次最多报几个账号
const cqVec = () => CQ_KEYS.map(() => 0);
const cqMj = i => RG.PERKS[(i * 37 + 11) % RG.PERKS.length];   // 第 i 节的秘卷（每 CQ.MJ_EVERY 节一卷）：按节数定，谁领都一样
const ZOD_KEYS = () => Object.keys(C.ITEM).filter(k => C.ITEM[k].col === 'c8');
const wlNum = (v, lo, hi, d = 0) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
const wlStr = v => (typeof v === 'string' && /^[a-z0-9_]{0,16}$/i.test(v) ? v : '');
const wlName = (v, id) => (String(v || '').match(/[\w\u4e00-\u9fff]/g) || []).join('').slice(0, 12) || `游侠${id}`;   // 没登录的显示成「游侠 + 编号」，好分清
const r1 = v => Math.round(v * 10) / 10;// ===========================================================================
// 江湖共斗 · 开放世界：一条线的模拟（WorldSim）和它的 Durable Object 外壳（WorldLine）
// ===========================================================================
// WorldSim 只管逻辑，不碰网络和数据库，可以在测试里直接驱动（tools/tests/world-test.mjs）：
//   玩家进出和上报、妖物刷新 / 行动 / 攻击、妖王、伤害封顶、全服肉鸽的投票和车轮战、进度存档。
// WorldLine 是 Cloudflare Durable Object：管 WebSocket 连接、认证、定时 tick，把 WorldSim 的事件发给附近的玩家，
// 打完结算时写 D1。
//
// 找 bug 提示：服务器上的时间是 WorldSim.t（秒），只在 step(dt) 里往前走；复现时在测试里固定 rnd，手动 step。
class WorldSim {
  constructor(rnd = Math.random) {
    this.rnd = rnd; this.t = 0; this.players = new Map(); this.mons = []; this.nid = 1; this.mid = 1;
    this.kills = 0; this.sinceBoss = 0; this.boss = null; this.spawnT = 0; this.events = [];
    this.run = rgNew(); this.rewards = []; this.dirty = false; this.line = 0;
    this.cq = { v: cqVec(), by: {} }; this.chron = null;   // 江湖长卷：还没报上去的出力；全服进度（分线从 D1 读来的）
  }
  get count() { return this.players.size; }
  // ---------- 玩家：进出、认证、上报位置和状态、打妖物 ----------
  join(meta) {
    if (this.line > 0 && this.players.size >= WL.CAP) return 0;
    const id = this.nid++;
    const ch = C.HERO_IDS.includes(meta && meta.ch) ? meta.ch : 'qingfeng';
    const skin = typeof (meta && meta.skin) === 'string' && /^[a-z]{2}_[a-z0-9]{1,20}$/.test(meta.skin) ? meta.skin : '';
    this.players.set(id, { id, name: wlName(meta && meta.name, id), ch, skin, x: 200 + this.rnd() * 400, y: 0, vx: 0, f: 1, st: 'idle', tt: 0, mv: '', sk: '', sp: '', ph: 0,
      hp: 100, mh: 100, seen: this.t, budget: WL.BURST, bt: this.t, uid: '', born: 0, jies: 0, inKey: false, keyIn: 0, keyDmg: 0 });
    return id;
  }
  // 登录令牌核对成云端账号以后：记下 uid 和注册时间（发奖励用）。同一个号开两个网页只算一个真人
  setAuth(id, uid, born) { const p = this.players.get(id); if (p) { p.uid = String(uid || ''); p.born = +born || 0; } }
  leave(id) {
    this.players.delete(id); if (this.boss && this.boss.dmg) delete this.boss.dmg[id];
    const v = this.run.vote; if (v) delete v.votes[id];
  }
  meta(p) { return [p.id, p.name, p.ch, p.skin]; }
  state(id, s) {
    const p = this.players.get(id); if (!p || !s) return false;
    p.x = wlNum(s.x, 0, WL.W, p.x); p.y = wlNum(s.y, -3000, 0, 0); p.vx = wlNum(s.vx, -3000, 3000); p.f = s.f < 0 ? -1 : 1;
    p.st = wlStr(s.st) || 'idle'; p.tt = wlNum(s.tt, 0, 60); p.mv = wlStr(s.mv); p.sk = wlStr(s.sk); p.sp = wlStr(s.sp); p.ph = wlNum(s.ph, 0, 9) | 0;
    p.mh = wlNum(s.mh, 1, 9999, 100); p.hp = wlNum(s.hp, 0, p.mh, p.mh);
    p.inKey = !!(s.kf && this.run.key);   // 在打关键战：妖物不追他
    if (p.inKey) this.run.key.in[id] = 1;
    if (C.HERO_IDS.includes(s.ch) && s.ch !== p.ch) { p.ch = s.ch; p.skin = ''; this.events.push({ t: 'j', p: this.meta(p), x: p.x }); }
    p.seen = this.t;
    return true;
  }
  // 侠客说自己打中了哪只妖物：要离得够近，伤害单次封顶，再按每秒上限扣掉攒着的额度
  hit(id, mid, d) {
    const p = this.players.get(id); d = +d;
    if (!p || !(d > 0)) return 0;
    const m = (this.boss && this.boss.id === mid) ? this.boss : this.mons.find(q => q.id === mid);
    if (!m || m.hp <= 0 || Math.abs(p.x - m.x) > WL.HIT_RANGE + (m.boss ? 160 : 0)) return 0;
    p.budget = Math.min(WL.BURST, p.budget + (this.t - p.bt) * WL.DPS); p.bt = this.t;
    d = Math.min(d, WL.HIT_MAX, p.budget); if (d <= 0) return 0;
    p.budget -= d; m.hp -= d;
    if (m.boss) m.dmg[id] = (m.dmg[id] || 0) + d;
    else { m.stag = Math.max(m.stag, 0.3); m.wind = 0; m.act = null; m.vx = (m.x >= p.x ? 1 : -1) * 140; }
    if (m.hp <= 0) this.kill(m, p);
    return d;
  }
  kill(m, p) {
    m.hp = 0; this.kills++;
    if (m.boss) {
      const top = Object.entries(m.dmg).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([pid, n]) => [(this.players.get(+pid) || { name: '已离开的侠客' }).name, Math.round(n)]);
      this.events.push({ t: 'bk', by: p.name, top, all: true });
      this.cqAdd('king', Object.keys(m.dmg).map(pid => (this.players.get(+pid) || {}).uid));
      this.boss = null; this.sinceBoss = 0;
    } else {
      this.sinceBoss++;
      this.events.push({ t: 'x', m: m.id, by: p.id, x: m.x });
      this.cqAdd('kill', [p.uid]); this.cqAdd('z' + m.zi, [p.uid]);
      const R = this.run;
      if (!R.vote && !R.key && R.got < R.need) { R.got++; if (R.got >= R.need) this.jieDone(); }
    }
  }
  // ---------- 妖物：按区域刷新、妖王、找目标、每步行动和出招 ----------
  zoneOf(x) { const i = WL.ZONES.findIndex(z => x < z.b); return i < 0 ? WL.ZONES.length - 1 : i; }
  spawn() {
    const want = Math.min(70, 10 + 3 * this.players.size);
    if (this.mons.length >= want) return;
    // 哪一段有人就多刷在哪一段，没人的地方也留几只
    const w = WL.ZONES.map(() => 1);
    for (const p of this.players.values()) w[this.zoneOf(p.x)] += 2;
    let r = this.rnd() * w.reduce((s, v) => s + v, 0), zi = 0;
    while (zi < w.length - 1 && r >= w[zi]) { r -= w[zi]; zi++; }
    const z = WL.ZONES[zi], key = z.keys[(this.rnd() * z.keys.length) | 0], T = WL.MON[key];
    let x = 0;
    for (let k = 0; k < 5; k++) {   // 别刷在侠客脸上
      x = z.a + 80 + this.rnd() * (z.b - z.a - 160);
      let near = false; for (const p of this.players.values()) if (Math.abs(p.x - x) < 450) near = true;
      if (!near) break;
    }
    const hp = Math.round(T.hp * z.hp * Math.min(RG.CYC_HP_MAX, 1 + RG.CYC_HP * (this.run.cyc - 1)));
    this.mons.push({ id: this.mid++, key, x, y: key === 'owl' ? -230 : 0, vx: 0, vy: 0, hp, mh: hp, f: 1, cd: 1 + this.rnd(), wind: 0, act: null, stag: 0,
      home: x, ph: this.rnd() * 6, zi, dk: z.dk, spd: T.spd, keep: T.keep });
  }
  spawnBoss() {
    const hp = 1500 + 600 * this.players.size, x = 6970;
    this.boss = { id: this.mid++, key: 'king', boss: true, x, y: 0, vx: 0, hp, mh: hp, f: -1, cd: 2.5, wind: 0, act: null, life: WL.BOSS_LIFE, dmg: {}, dk: 2, zi: 3 };
    this.events.push({ t: 'bs', all: true });
  }
  target(x, range) {
    let best = null, bd = range;
    for (const p of this.players.values()) { const d = Math.abs(p.x - x); if (p.hp > 0 && !p.inKey && d < bd) { bd = d; best = p; } }
    return best;
  }
  step(dt) {
    this.t += dt;
    for (const p of [...this.players.values()]) if (this.t - p.seen > WL.IDLE / 1000) this.leave(p.id);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.players.size && !this.run.key) { this.spawn(); this.spawnT = 0.5; }
    this.rgStep();
    if (!this.boss && this.sinceBoss >= WL.BOSS_EVERY && this.players.size) this.spawnBoss();
    for (const m of this.mons) this.monStep(m, dt);
    this.mons = this.mons.filter(m => m.hp > 0);
    if (this.boss) this.bossStep(this.boss, dt);
  }
  monStep(m, dt) {
    m.ph += dt;
    const tgt = this.target(m.x, WL.AGGRO), dx = tgt ? tgt.x - m.x : m.home - m.x, d = Math.abs(dx), dir = Math.sign(dx) || m.f;
    if (m.stag > 0) { m.stag -= dt; m.vx *= 0.7; }
    else if (m.key === 'owl') {
      if (m.act === 'dive') { m.x += m.vx * dt; m.y += m.vy * dt; if (m.y > -30 || m.y < -320) { m.act = null; m.vx = 0; m.vy = 0; m.y = Math.min(-40, m.y); } }
      else {
        const tx = (tgt ? tgt.x : m.home) + Math.sin(m.ph * 0.8) * 200;
        m.vx = Math.max(-m.spd, Math.min(m.spd, (tx - m.x) * 2)); m.y += (-230 - m.y) * Math.min(1, 3 * dt); m.f = dir;
        if (m.wind > 0) { m.wind -= dt; m.vx *= 0.3; if (m.wind <= 0 && tgt) { const ty = tgt.y - 60 - m.y, l = Math.hypot(dx, ty) || 1; m.vx = dx / l * 760; m.vy = ty / l * 760; m.act = 'dive'; this.attack(m, { k: 'dive', vx: r1(m.vx), vy: r1(m.vy) }); } }
        else if (tgt && (m.cd -= dt) <= 0) { m.wind = 0.45; m.cd = 2.6 + this.rnd(); }
      }
    } else if (m.wind > 0) {
      m.wind -= dt; m.vx *= 0.5;
      if (m.wind <= 0) {
        if (m.key === 'blade') this.attack(m, { k: 'blade' });
        if (m.key === 'archer') this.attack(m, { k: 'shot', vx: m.f * 620 });
        if (m.key === 'binder') this.attack(m, { k: 'trap', at: r1(m.mark), delay: 0.8 });
        if (m.key === 'caster') this.attack(m, { k: 'fire', at: r1(m.mark), delay: 0.9 });
      }
    } else {
      m.f = dir;
      const want = !tgt ? (d > 60 ? dir * 0.35 : 0) : m.key === 'blade' ? (d > m.keep ? dir : 0) : (d > m.keep + 60 ? dir : d < m.keep - 60 ? -dir : 0);
      m.vx += (want * m.spd - m.vx) * Math.min(1, 6 * dt);
      if (tgt && (m.cd -= dt) <= 0 && (m.key !== 'blade' || d < 110) && d < 600) {
        m.wind = { blade: 0.5, archer: 0.4, binder: 0.5, caster: 0.5 }[m.key]; m.cd = { blade: 2.2, archer: 2.8, binder: 4.5, caster: 4.5 }[m.key] * (0.8 + 0.4 * this.rnd());
        m.mark = tgt.x;
      }
    }
    if (m.act !== 'dive') m.x += m.vx * dt;
    const z = WL.ZONES[m.zi];   // 妖物守着自己那一段，不会追出去
    m.x = Math.max(z.a, Math.min(z.b, m.x));
  }
  bossStep(b, dt) {
    b.life -= dt;
    if (b.life <= 0) { this.boss = null; this.sinceBoss = 0; this.events.push({ t: 'bg', all: true }); return; }
    const tgt = this.target(b.x, 1400);
    if (b.act === 'charge') {
      b.x += b.vx * dt; b.ct -= dt;
      if (b.ct <= 0 || b.x < 6000 || b.x > 7940) { b.act = null; b.vx = 0; b.x = Math.max(6000, Math.min(7940, b.x)); }
      return;
    }
    if (b.wind > 0) {
      b.wind -= dt;
      if (b.wind <= 0) {
        if (b.act === 'slam') this.attack(b, { k: 'slam', r: 300 });
        if (b.act === 'rain') for (const p of this.players.values()) if (p.hp > 0 && Math.abs(p.x - b.x) < 1400) this.attack(b, { k: 'fire', at: r1(p.x), delay: 0.9 });
        if (b.act === 'chargeW') { b.act = 'charge'; b.ct = 0.7; b.vx = b.f * 900; this.attack(b, { k: 'charge', vx: b.vx, len: 0.7 }); return; }
        b.act = null;
      }
      return;
    }
    if (!tgt) { b.vx = 0; return; }
    const dx = tgt.x - b.x; b.f = Math.sign(dx) || b.f;
    b.vx = Math.abs(dx) > 200 ? b.f * 110 : 0; b.x = Math.max(6000, Math.min(7940, b.x + b.vx * dt));
    if ((b.cd -= dt) <= 0) {
      const r = this.rnd();
      if (Math.abs(dx) < 320 && r < 0.5) { b.act = 'slam'; b.wind = 0.9; }
      else if (r < 0.75) { b.act = 'chargeW'; b.wind = 0.6; }
      else { b.act = 'rain'; b.wind = 0.7; }
      b.cd = 2.6 + this.rnd() * 1.2;
      this.events.push({ t: 'bw', a: b.act, x: r1(b.x), f: b.f, w: b.wind });
    }
  }
  attack(m, o) { this.events.push({ t: 'a', m: m.id, x: r1(m.x), y: r1(m.y), f: m.f, dk: m.dk, ...o }); }
  // 发给一位侠客的一帧：附近的侠客、附近的妖物、妖王（全线都看得到血条）
  // ---------- 发给某个玩家的一帧：只带他附近的玩家和妖物 ----------
  frameFor(id) {
    const me = this.players.get(id); if (!me) return null;
    const ps = [];
    for (const p of this.players.values()) if (p.id !== id && Math.abs(p.x - me.x) <= WL.AOI) ps.push(p);
    if (ps.length > WL.NEAR) { ps.sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x)); ps.length = WL.NEAR; }
    const b = this.boss;
    return {
      t: 'k', n: this.players.size, kills: this.kills, nb: Math.max(0, WL.BOSS_EVERY - this.sinceBoss),
      p: ps.map(p => [p.id, r1(p.x), r1(p.y), r1(p.vx), p.f, p.st, r1(p.tt), p.mv, p.sk, p.sp, p.ph, Math.round(p.hp), Math.round(p.mh)]),
      m: this.mons.filter(m => Math.abs(m.x - me.x) <= WL.AOI + 300).map(m => [m.id, m.key, r1(m.x), r1(m.y), Math.ceil(m.hp), m.mh, m.f, m.wind > 0 || m.act === 'dive' ? 1 : 0, m.zi]),
      b: b ? [b.id, r1(b.x), Math.ceil(b.hp), b.mh, b.f, b.act || '', Math.round(b.life)] : null,
      r: this.rgView(id),
      u: [...this.players.values()].filter(p => p.id !== id).map(p => [p.id, Math.round(p.x), Math.round(p.y), this.zoneOf(p.x)]),
      q: this.cqView(),
    };
  }
  /* ---------- 全服肉鸽的共享进程 ---------- */
  // ---------- 全服肉鸽：人数、投票选秘卷、天道车轮战（key*）、结算、进度存档 ----------
  real() { return new Set([...this.players.values()].map(p => p.uid || 'g' + p.id)).size; }
  needOf() { return Math.min(RG.NEED_MAX, RG.NEED0 + RG.NEED_PER * this.players.size); }
  rgView(id) {
    const R = this.run, v = R.vote, k = R.key, me = this.players.get(id);
    const st = rgStory(R.story || 1);
    return {
      c: R.cyc, j: R.jie, g: R.got, nd: R.need, pk: R.perks, n: this.real(),
      story: R.story || 1, totalStories: R.totalStories || RG.TOTAL_STORIES,
      stName: st.name, stLore: st.lore,
      v: v ? { o: v.opts, u: Math.max(0, Math.ceil(v.until - this.t)), n: v.opts.map((_, i) => Object.values(v.votes).filter(x => x === i).length), my: v.votes[id] === undefined ? -1 : v.votes[id] } : null,
      k: k ? { kind: k.kind, s: k.seq, h: k.heroes, hp: Math.ceil(k.hp), mh: k.mh, u: Math.max(0, Math.ceil(k.until - this.t)), my: me ? Math.round(me.keyDmg) : 0 } : null,
    };
  }
  // 这一劫斩够了：在场的人都记一劫；还没到最后一劫就投票选秘卷，到了就开关键战
  jieDone() {
    const R = this.run;
    for (const p of this.players.values()) p.jies++;
    this.cqAdd('jie', [...this.players.values()].map(p => p.uid));
    const st = rgStory(R.story || 1);
    this.events.push({ t: 'story_clear', story: R.story || 1, name: st.name, all: true });
    if (R.jie < RG.JIE) this.startVote(); else this.startKey();
    this.dirty = true;
  }
  startVote() {
    const pool = RG.PERKS.filter(id => !this.run.perks.includes(id)), opts = [];
    const source = pool.length >= 3 ? pool : RG.PERKS.slice();
    while (opts.length < 3 && source.length) opts.push(source.splice((this.rnd() * source.length) | 0, 1)[0]);
    this.run.vote = { opts, until: this.t + RG.VOTE_T, votes: {} };
    this.events.push({ t: 'rv', all: true });
  }
  vote(id, i) {
    const v = this.run.vote; i = +i;
    if (!v || !this.players.has(id) || !(i >= 0 && i < v.opts.length) || (i | 0) !== i) return false;
    v.votes[id] = i;
    if (Object.keys(v.votes).length >= this.players.size) v.until = Math.min(v.until, this.t);   // 人都投了就不用等
    return true;
  }
  endVote() {
    const R = this.run, v = R.vote, cnt = v.opts.map((_, i) => Object.values(v.votes).filter(x => x === i).length);
    const top = Math.max(...cnt), best = cnt.map((n, i) => n === top ? i : -1).filter(i => i >= 0);
    const pick = v.opts[best[(this.rnd() * best.length) | 0]];
    if (R.perks.length >= RG.PERK_MAX) R.perks.shift();   // 满了：最早的那卷让位
    R.perks.push(pick);
    R.vote = null; R.jie++; R.got = 0; R.need = this.needOf();
    R.story = (R.story || 1) + 1;
    if (R.story > (R.totalStories || RG.TOTAL_STORIES)) R.story = 1;
    const nextSt = rgStory(R.story);
    this.events.push({ t: 'rp', pick, perks: R.perks, j: R.jie, story: R.story, stName: nextSt.name, all: true });
    this.dirty = true;
  }
  // 最后一劫斩完开关键战：线上真人够 RG.BOSS_MIN 位打天道 Boss（血量全线共享，赢了发星座皮肤）；
  // 不够就各自打一场 3v3 车轮战，对面是 3 位天道 AI（不发皮肤）。两种打完秘卷都保留，进下一轮
  startKey() {
    const R = this.run, n = this.real(), boss = n >= RG.BOSS_MIN;
    const bag = C.HERO_IDS.slice(), heroes = [];
    while (heroes.length < 3) heroes.push(bag.splice((this.rnd() * bag.length) | 0, 1)[0]);
    const mh = boss ? RG.BOSS_HP * n : 0, T = boss ? RG.BOSS_T : RG.TRIO_T;
    R.key = { kind: boss ? 'boss' : 'trio', seq: ++R.seq, heroes, mh, hp: mh, t0: this.t, until: this.t + T, dmg: {}, in: {}, rep: {}, uids: {} };
    for (const p of this.players.values()) { p.keyDmg = 0; p.keyIn = this.t; }
    this.mons.length = 0; this.boss = null;
    this.events.push({ t: 'ks', kind: R.key.kind, all: true });
    this.dirty = true;
  }
  // 车轮战打完了：网页报输赢。进过场的人都报了（走了的不等）就收场，有一个人赢了就算赢
  keyReport(id, seq, w) {
    const k = this.run.key;
    if (!k || k.kind !== 'trio' || k.seq !== +seq || !this.players.has(id) || id in k.rep) return false;
    k.rep[id] = w ? 1 : 0; k.in[id] = 1;
    if (w && this.players.get(id).uid) k.uids[this.players.get(id).uid] = 1;   // 车轮战：赢下来的人算出力
    const left = Object.keys(k.in).filter(x => this.players.has(+x) && !(x in k.rep));
    if (!left.length) this.endKey(Object.values(k.rep).some(Boolean));
    return true;
  }
  // 关键战里交伤害：要是这一场、开战（或进场）三秒后才算，总数不超过 (进场秒数 - 3) × 每秒上限
  keyHit(id, seq, d) {
    const k = this.run.key, p = this.players.get(id); d = +d;
    if (!k || k.kind !== 'boss' || k.seq !== +seq || !p || !(d > 0) || k.hp <= 0) return 0;
    if (!p.keyIn || p.keyIn < k.t0) { p.keyIn = this.t; p.keyDmg = 0; }   // 中途进来的从进来那一刻算
    const cap = Math.max(0, (this.t - p.keyIn - 3) * RG.KEY_DPS) - p.keyDmg;
    d = Math.min(d, RG.KEY_HIT_MAX, cap); if (d <= 0) return 0;
    p.keyDmg += d; k.hp -= d;
    const who = p.uid || 'g' + p.id; k.dmg[who] = (k.dmg[who] || 0) + d;
    if (p.uid) k.uids[p.uid] = 1;
    if (k.hp <= 0) this.endKey(true);
    return d;
  }
  endKey(win) {
    const R = this.run, k = R.key; if (!k) return;
    k.hp = Math.max(0, k.hp);
    let top = [];
    if (k.kind === 'boss') {
      top = Object.entries(k.dmg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => {
        const p = [...this.players.values()].find(q => (q.uid || 'g' + q.id) === w); return [p ? p.name : '已离开的侠客', Math.round(n)];
      });
      if (win) this.payout(k);
    } else top = Object.entries(k.rep).filter(([, w]) => w).slice(0, 5).map(([id]) => { const p = this.players.get(+id); return [p ? p.name : '已离开的侠客', 1]; });
    this.events.push({ t: 'ke', kind: k.kind, win: !!win, top, all: true });
    if (win) this.cqAdd('key', Object.keys(k.uids || {}));
    R.key = null; R.cyc++; R.jie = 1; R.got = 0; R.need = this.needOf();   // 秘卷保留，下一轮
    R.story = (R.story || 1) + 1;
    if (R.story > (R.totalStories || RG.TOTAL_STORIES)) R.story = 1;
    for (const p of this.players.values()) { p.jies = 0; p.keyDmg = 0; }
    this.dirty = true;
  }
  // 谁能拿星座皮肤：云端账号、注册满 RG.MIN_AGE_H 小时、这一轮在场至少 RG.MIN_JIE 劫、伤害至少平均份额的 RG.MIN_SHARE。
  // 每号每天只发 RG.ZOD_PER_DAY 件由写 gift 表时的编号保证（见 rgPay）
  payout(k) {
    const now = Date.now(), parts = Object.keys(k.dmg).length || 1, fair = k.mh / parts, seen = new Set();
    for (const p of this.players.values()) {
      if (!p.uid || seen.has(p.uid)) continue;
      const dmg = k.dmg[p.uid] || 0;
      if (now - p.born < RG.MIN_AGE_H * 3600e3 || p.jies < RG.MIN_JIE || dmg < fair * RG.MIN_SHARE) continue;
      seen.add(p.uid); this.rewards.push({ uid: p.uid, dmg: Math.round(dmg), cyc: this.run.cyc });
    }
  }
  rgStep() {
    const R = this.run;
    if (R.vote && this.t >= R.vote.until) this.endVote();
    const k = R.key;
    if (k && k.kind === 'trio' && Object.keys(k.rep).length && Object.keys(k.in).every(x => x in k.rep || !this.players.has(+x))) this.endKey(Object.values(k.rep).some(Boolean));   // 没报的人走了
    else if (k && this.t >= k.until) this.endKey(false);
  }
  // 存进 Durable Object 存储 / 从存储读回来（关键战不存：重启就算这一场没打完）
  saveRun() { const R = this.run; return { cyc: R.cyc, jie: R.jie, got: R.got, need: R.need, perks: R.perks.slice(), seq: R.seq, story: R.story || 1, totalStories: R.totalStories || RG.TOTAL_STORIES, at: Date.now() }; }
  loadRun(o) {
    if (!o || typeof o !== 'object') return;   // 空了多久都接着上次的进度（以前空了 10 分钟会清零，新来的人不该把进度打回去）
    const R = this.run;
    R.cyc = wlNum(o.cyc, 1, 1e6, 1) | 0; R.jie = wlNum(o.jie, 1, RG.JIE, 1) | 0; R.got = wlNum(o.got, 0, RG.NEED_MAX, 0) | 0; R.need = wlNum(o.need, 1, RG.NEED_MAX, RG.NEED0) | 0;
    R.story = wlNum(o.story, 1, RG.TOTAL_STORIES, 1) | 0;
    R.totalStories = RG.TOTAL_STORIES;
    if (R.got >= R.need) R.got = R.need - 1;   // 存档时正在打关键战（关键战不存）：再斩一只就重开
    R.perks = Array.isArray(o.perks) ? o.perks.filter(id => RG.PERKS.includes(id)).slice(-RG.PERK_MAX) : []; R.seq = wlNum(o.seq, 0, 1e9, 0) | 0;
  }
  /* ---------- 江湖长卷：这条线的出力 ---------- */
  // 记一笔出力：全线 +1，在场出过力的每个云端账号各 +1（同一个号只算一次；游客推进度，不领奖）
  // ---------- 江湖长卷的贡献队列：攒下来的击杀记录，由 WorldLine 定时写进 D1 ----------
  cqAdd(key, uids) {
    const i = CQ_KEYS.indexOf(key); if (i < 0) return;
    this.cq.v[i]++;
    for (const u of new Set(uids)) if (u) (this.cq.by[u] || (this.cq.by[u] = cqVec()))[i]++;
  }
  cqPending() { return this.cq.v.some(n => n > 0); }
  // 拿走攒着的出力去上报（报失败了由 WorldLine 留着原样重报，见 cqSync）
  cqTake() { const o = this.cq; this.cq = { v: cqVec(), by: {} }; return o; }
  // 这条线攒着的出力里，算进全服当前这一节的有多少
  cqMine(s) { const i = s ? CQ_KEYS.indexOf(s.g) : -1; return i < 0 ? 0 : this.cq.v[i] + (this.cqFly ? this.cqFly.v[i] : 0); }
  // 加上这条线还没报上去的，够这一节了就该马上报
  cqDue() { const s = this.chron; return !!s && s.node < CQ.N && this.cqMine(s) > 0 && s.got + this.cqMine(s) >= s.need; }
  // 新的全服进度（从 D1 读到的）：往前走了就全线播报，旧的（比手上的还早）不认
  cqSet(s) {
    if (!s || !(s.node >= 0)) return;
    const old = this.chron;
    if (old && (s.v < old.v || (s.v === old.v && s.got < old.got))) return;   // 进度只会往前走
    this.chron = { node: s.node | 0, got: s.got | 0, need: s.need | 0, g: String(s.g || ''), v: s.v | 0 };
    if (old && s.node > old.node) this.events.push({ t: 'qa', from: old.node, i: s.node, all: true });
  }
  // 帧里的全服进度：第几节、完成了多少（加上本线还没报上去的，不超过要的数）
  cqView() {
    const s = this.chron; if (!s) return null;
    return { i: s.node, g: Math.min(s.need, s.got + this.cqMine(s)), nd: s.need, v: s.v };
  }
  // 这一拍的事件谁该收到：全线播报的人人都收，其余只发给附近的侠客
  // ---------- 事件：这一步产生的广播，wants 决定某个玩家要不要收到 ----------
  takeEvents() { const e = this.events; this.events = []; return e; }
  wants(id, ev) { const me = this.players.get(id); return !!me && (ev.all || ev.x === undefined || Math.abs(ev.x - me.x) <= WL.AOI + 300); }
}

// ===========================================================================
// WorldLine：Durable Object 外壳（WebSocket、认证、定时 tick、写 D1）
// ===========================================================================
export class WorldLine {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sim = new WorldSim(); this.timer = 0; this.line = 0;
    this.cqAt = 0; this.cqReadAt = 0; this.cqBusy = null;   // 江湖长卷：上次报出力、上次读全服进度的时间（毫秒），正在跑的那一次
    if (ctx.storage && ctx.blockConcurrencyWhile) ctx.blockConcurrencyWhile(async () => { try { this.sim.loadRun(await ctx.storage.get('run')); } catch (e) {} });
  }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const line = wlNum(new URL(request.url).pathname.split('/').pop(), 0, 9999, 0) | 0;
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ line, id: 0 }); this.line = line; this.sim.line = line;
    if (line > 0 && this.ctx.getWebSockets().length > WL.CAP) { this.send(server, { t: 'full', line }); server.close(4001, 'full'); }
    return new Response(null, { status: 101, webSocket: client });
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) {} }
  sockOf(id) { for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a && a.id === id) return ws; } return null; }
  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 2000) return;
    let o; try { o = JSON.parse(data); } catch (e) { return; }
    if (!o || typeof o !== 'object') return;
    const a = ws.deserializeAttachment() || { line: 1, id: 0 }, sim = this.sim;
    const now = Date.now();   // 一个连接每秒最多认 25 条，多的直接丢
    if (now - (a.rt || 0) > 1000) { a.rt = now; a.rn = 0; }
    if (++a.rn > 25) { ws.serializeAttachment(a); return; }
    if (o.t === 'hi') {
      this.sim.line = a.line;
      if (a.id && sim.players.has(a.id)) { ws.serializeAttachment(a); return; }
      const id = sim.join(o);
      if (!id) { this.send(ws, { t: 'full', line: a.line }); ws.close(4001, 'full'); return; }
      a.id = id; ws.serializeAttachment(a);
      if (o.tk && this.env && this.env.DB) this.auth(id, String(o.tk).slice(0, 200));
      const roster = [...sim.players.values()].map(p => sim.meta(p));
      this.send(ws, { t: 'w', id, line: a.line, cap: WL.CAP, w: WL.W, roster });
      sim.events.push({ t: 'j', p: sim.meta(sim.players.get(id)), all: true });
      this.ensureTimer();
      this.cqSync(false);   // 有人进来：读一次全服进度，新来的、重连的人马上看到现在推到哪了
      return;
    }
    ws.serializeAttachment(a);
    if (!a.id || !sim.players.has(a.id)) { this.send(ws, { t: 're' }); return; }   // 服务器重启过：请网页重新打个招呼
    if (o.t === 's') sim.state(a.id, o);   // 位置和这一拍打出的伤害一起上报（h: [[妖物编号, 伤害], ...]），省一半消息
    if ((o.t === 's' || o.t === 'h') && Array.isArray(o.h)) for (const h of o.h.slice(0, 12)) if (Array.isArray(h)) sim.hit(a.id, +h[0], +h[1]);
    if (o.t === 'tp') {
      const me = sim.players.get(a.id);
      if (me) {
        if (o.to) {
          const tgt = sim.players.get(+o.to);
          if (tgt) { me.x = wlNum(tgt.x + (tgt.f > 0 ? -60 : 60), 60, WL.W - 60, me.x); me.y = tgt.y; sim.events.push({ t: 'tp', id: a.id, to: +o.to, x: me.x }); }
        } else if (Number.isFinite(o.x)) {
          me.x = wlNum(o.x, 60, WL.W - 60, me.x);
        }
      }
    }
    if (o.t === 'v') sim.vote(a.id, o.i);
    if (o.t === 'kd') sim.keyHit(a.id, o.s, o.d);
    if (o.t === 'kr') sim.keyReport(a.id, o.s, o.w);
  }
  // 登录令牌 → 云端账号（和 HTTP 接口同一张 sessions 表）；被封的号不认
  async auth(id, tk) {
    try {
      const now = Date.now();
      const r = await sessionOf(this.env, String(tk || ''), 'u.id AS id, u.username AS username, u.created_at AS created_at', now);
      if (r && !(await banOf(this.env, r.id, now))) this.sim.setAuth(id, r.id, r.created_at);
    } catch (e) {}
  }
  // 发星座皮肤：写进 gift 表（玩家下次动武库时自动领，走 C.addItem，和开箱拿到的一样）。
  // 编号是「rz + 北京日期 + 第几件 + uid」，INSERT OR IGNORE：同一天重复写、并发写都只有 RG.ZOD_PER_DAY 件
  async pay(list) {
    const env = this.env; if (!env || !env.DB) return;
    const now = Date.now(), day = C.day(now), all = ZOD_KEYS();
    for (const w of list) {
      try {
        const have = await env.DB.prepare("SELECT COUNT(*) AS n FROM gift WHERE uid = ? AND id LIKE ?").bind(w.uid, `rz${day}_%`).first();
        const n = (have && have.n) || 0; if (n >= RG.ZOD_PER_DAY) continue;
        const e = await env.DB.prepare('SELECT state_json FROM econ WHERE uid = ?').bind(w.uid).first();
        const own = new Set(((parseObj(e && e.state_json) || {}).inv || []).map(x => x && x.k));
        const fresh = all.filter(k => !own.has(k)), pool = fresh.length ? fresh : all, k = pool[Math.floor(rnd() * pool.length)];
        await env.DB.batch([
          env.DB.prepare('INSERT OR IGNORE INTO gift (id, uid, ink, items_json, note, by, at, until, born) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(`rz${day}_${n}_${w.uid}`, w.uid, RG.INK, JSON.stringify({ skin: k }), `全服肉鸽 · 天道 Boss 讨伐大捷`, 'rouge', now, now + 30 * DAY_MS, now),
          logStmt(env, w.uid, now, 'rouge_zod', 1, null, null, JSON.stringify({ k, dmg: w.dmg, cyc: w.cyc })),
        ]);
      } catch (e) { console.error('rouge pay', e); }
    }
  }
  async webSocketClose(ws) { this.drop(ws); }
  async webSocketError(ws) { this.drop(ws); }
  drop(ws) {
    const a = ws.deserializeAttachment();
    if (a && a.id && this.sim.players.has(a.id)) { this.sim.leave(a.id); this.sim.events.push({ t: 'l', id: a.id, all: true }); }
  }
  ensureTimer() { if (!this.timer) this.timer = setInterval(() => this.tick(), WL.TICK); }
  tick() {
    const sim = this.sim;
    sim.step(WL.TICK / 1000);
    const evs = sim.takeEvents();
    if (sim.rewards.length) { const list = sim.rewards; sim.rewards = []; this.paying = this.pay(list); }
    if (sim.dirty && this.ctx.storage) { sim.dirty = false; this.ctx.storage.put('run', sim.saveRun()).catch(() => {}); }
    const now = Date.now();   // 江湖长卷：有出力每 CQ_T.REP 秒报一次（够这一节了马上报），没有就每 CQ_T.READ 秒看一次全服进度
    if ((sim.cqPending() || this.cqRetry) && (sim.cqDue() || now - this.cqAt >= CQ_T.REP * 1000)) this.cqSync(true);
    else if (now - this.cqReadAt >= CQ_T.READ * 1000) this.cqSync(false);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment(); if (!a || !a.id) continue;
      if (!sim.players.has(a.id)) { this.send(ws, { t: 're' }); continue; }
      const fr = sim.frameFor(a.id), mine = evs.filter(e => sim.wants(a.id, e));
      if (mine.length) fr.e = mine;
      this.send(ws, fr);
    }
    if (!sim.players.size) {   // 没人了：停表，让它休眠；攒着的出力先报上去
      clearInterval(this.timer); this.timer = 0;
      if (this.ctx.storage) this.ctx.storage.put('run', sim.saveRun()).catch(() => {});
      if (sim.cqPending() || this.cqRetry) this.cqSync(true);
    }
  }
  // 江湖长卷：报出力（report）或者只读全服进度。同一时间只跑一次；报失败了出力放回去，下次用同一个编号重报（服务器只认一次）
  cqSync(report) {
    const env = this.env, sim = this.sim;
    if (this.cqBusy || !env || !env.DB) return this.cqBusy;
    const now = Date.now(); this.cqReadAt = now;
    let out = null;
    if (report) { this.cqAt = now; out = sim.cqFly = this.cqRetry || { ...sim.cqTake(), rid: `l${this.line}_${now.toString(36)}_${randHex(4)}` }; this.cqRetry = null; }
    this.cqBusy = (async () => {
      try {
        sim.cqSet(out ? await chronReport(env, this.line, out, now) : await chronRead(env));
        if (out) sim.cqFly = null;
      } catch (e) {
        if (out) { this.cqRetry = out; sim.cqFly = out; }   // 不知道成没成：留着同一个编号下次重报
        console.error('chron sync', e);
      } finally { this.cqBusy = null; }
      if (!sim.players.size && sim.cqPending() && !this.cqRetry) this.cqSync(true);   // 人走光的时候正好在报：剩下的也报掉（失败了就不再追，免得空转）
    })();
    return this.cqBusy;
  }
}
globalThis.RenyingWorldSim = { WorldSim, WL, RG, rgStory };

export default {
  fetch: withCors,
};// ===========================================================================
// 请求入口：按路径分发到各个处理函数
// ===========================================================================
// route() 里按顺序判断路径：健康检查和管理网页 → ICE → 注册 / 登录 → 存档 → 武库 / 市场 → 反作弊 →
// 管理接口 → 错误上报 → 在线人数 / 游玩统计 → 天魔 → 列传 → 长卷 → 功能开关 → 排行榜 → 退出 / 设备 / 续期。
// 每个分支前面的注释写了要不要登录和限速规则。
//
// 找 bug 提示：接口报 500 时，回包里有请求编号（rid），去管理后台的错误记录里按编号搜。
async function route(request, env, ctx, rid = reqId()) {
    if (!env.DB) {
      return error('D1 Database binding "DB" is missing in Worker configuration.', 500);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const now = Date.now();

    try {
      // 江湖共斗 · 开放世界：交给这一线的 Durable Object（不碰 D1）。没部署 WORLD 绑定时回 503，网页会提示服务器还没更新
      const wm = path.match(/^\/api\/world\/line\/(\d{1,4})$/);
      if (wm) {
        if (!env.WORLD) return error('开放世界还没部署', 503);
        if (request.headers.get('Upgrade') !== 'websocket') return json({ ok: true, world: true, cap: WL.CAP });
        const n = Math.max(0, Math.min(9999, +wm[1] || 0));
        return env.WORLD.get(env.WORLD.idFromName('line-' + n)).fetch(request);
      }

      // 1. Health & ping check
      if (path === '/' || path === '/health' || path === '/api/health') {
        return json({ ok: true, name: 'RenYing Cloud API', time: now, econ: C.VER });
      }
      if (path === '/admin' || path === '/admin/') return adminPage();

      await ensureSchema(env);
      if (path === '/api/banner' && request.method === 'GET') {
        const row = await env.DB.prepare("SELECT note FROM flags WHERE k = '__banner__'").first();
        let banner = null;
        try { banner = row && row.note ? JSON.parse(row.note) : null; } catch (e) {}
        return json({ ok: true, banner });
      }
      if (Math.random() < 0.02) {
        const p = cleanup(env, now).catch(() => {});
        if (ctx && ctx.waitUntil) ctx.waitUntil(p);
      }
      const ip = clientIp(request);

      // 联机打洞用的 ICE 列表：平时只有 STUN；Even 在 Cloudflare 开了 TURN 并设好 TURN_KEY_ID / TURN_KEY_API_TOKEN 两个 Secret 后，
      // 每次给一份几小时就过期的 TURN 凭据（直连打不通时走中转）。拿 TURN 失败也照样回 STUN，网页不会因此连不上
      if (path === '/api/ice' && request.method === 'GET') {
        if (!(await hit(env, 'ice:' + ip, 60, 3600e3, now))) return error('请求太频繁了，过一会儿再试', 429);
        return json(await iceServers(env));
      }

      // 2. Register
      if (path === '/api/register' && request.method === 'POST') {
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        const ts = await turnstileOn(env, null, now);
        if (ts && !body.turnstile) return needTurnstile();
        if (!(await hit(env, 'reg:' + ip, 6, 3600e3, now))) return error('注册太频繁了，过一会儿再试', 429);
        if (ts && !(await turnstileOk(env, body.turnstile, ip))) return needTurnstile('人机验证没通过，再试一次');
        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (!username || username.length < 2) {
          return error('昵称至少需要 2 个字符');
        }
        if (username.length > 20) {
          return error('昵称不能超过 20 个字符');
        }
        if (!password || password.length < 6) {
          return error('密码至少需要 6 个字符');
        }
        if (password.length > 128) {
          return error('密码太长了');
        }
        if (RESERVED.test(username.replace(/\s+/g, ''))) {
          return error('这个昵称不能用，换一个吧');
        }

        // Check if user already exists
        const existing = await env.DB.prepare(
          'SELECT id FROM users WHERE username = ?'
        ).bind(username).first();

        if (existing) {
          return error('该昵称已被注册，请直接点击“登录”');
        }

        const userId = 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const pwr = await makePassword(env, { username }, password, now);

        // Default or initial guest profile
        const initialProf = cleanInitial((body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)) ? body.profile : {}, username, now);
        initialProf.name = username;
        initialProf.updatedAt = now;

        try {
          await env.DB.prepare(
            'INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at, password_algo, password_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(userId, username, pwr.hash, pwr.salt, JSON.stringify(initialProf), now, now, pwr.algo, now).run();
        } catch (e) {
          // 两个人同时注册同一个昵称：上面的查询都没查到，后到的那个在这里撞上唯一约束
          if (/UNIQUE/i.test(String(e && e.message))) return error('该昵称已被注册，请直接点击“登录”');
          throw e;
        }

        const tok = await issueLogin(env, { id: userId, username }, now, request, body);
        await authLog(env, request, 'register', { uid: userId, name: username, dev: tok.device });

        const out = await profileOut(env, { id: userId, username, profile_json: JSON.stringify(initialProf) }, now);
        return json({
          ok: true,
          uid: userId,
          username,
          ...tok,
          profile: out.profile,
          ledger: out.ledger,
          prog: out.prog
        });
      }

      // 3. Login（同一个昵称 15 分钟内输错 8 次、同一个 IP 输错 40 次，就先锁 15 分钟）
      if (path === '/api/login' && request.method === 'POST') {
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        if (!username || !password) {
          return error('请输入昵称和密码');
        }
        const nameKey = 'lf:' + username.toLowerCase().slice(0, 40), ipKey = 'lfip:' + ip;
        if ((await peek(env, nameKey, now)) >= 8 || (await peek(env, ipKey, now)) >= 40) {
          await authLog(env, request, 'login_fail', { name: username, note: 'locked' });
          return error('密码输错太多次了，请 15 分钟后再试', 429);
        }
        const fail = async () => { await hit(env, nameKey, 1e9, 15 * 60e3, now); await hit(env, ipKey, 1e9, 15 * 60e3, now); };
        // 输错过几次：先过人机验证再说
        if (((await peek(env, nameKey, now)) >= 3 || (await peek(env, ipKey, now)) >= 10) && await turnstileOn(env, null, now)) {
          if (!body.turnstile) return needTurnstile('输错好几次了，先完成人机验证');
          if (!(await turnstileOk(env, body.turnstile, ip))) return needTurnstile('人机验证没通过，再试一次');
        }

        const user = await env.DB.prepare(
          'SELECT id, username, password_hash, salt, password_algo, profile_json, deleted_at FROM users WHERE username = ?'
        ).bind(username).first();

        if (!user) {
          await hit(env, ipKey, 1e9, 15 * 60e3, now);
          await authLog(env, request, 'login_fail', { name: username, note: 'noacct' });
          return error('未找到该账号，请先点击“注册”', 404);
        }

        if (!(await checkPassword(user, password))) {
          await fail();
          await authLog(env, request, 'login_fail', { uid: user.id, name: username, note: 'pw' });
          return error('昵称或密码不对', 401);
        }
        if (user.deleted_at) {   // 管理后台删除的号：密码对了也不让登录（数据都还在，管理员恢复以后照常用）
          await authLog(env, request, 'login_fail', { uid: user.id, name: username, note: 'deleted' });
          return error('这个账号已经删除了，要恢复请联系开发组', 403, { deleted: true });
        }
        await env.DB.prepare('DELETE FROM rate WHERE k = ?').bind(nameKey).run();
        // 老办法存的密码（或者次数比现在少）：趁着知道原文换成现在的。WHERE 带上旧 hash：这期间管理员刚重设过就不覆盖
        if (user.password_algo !== PW_ALGO && await flagOn(env, 'auth.pbkdf2', user, now)) {
          const pwr = await makePassword(env, user, password, now);
          await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, password_algo = ?, password_updated_at = ? WHERE id = ? AND password_hash = ?')
            .bind(pwr.hash, pwr.salt, pwr.algo, now, user.id, user.password_hash).run();
        }

        const tok = await issueLogin(env, user, now, request, body);
        await authLog(env, request, 'login', { uid: user.id, name: user.username, dev: tok.device });

        const out = await profileOut(env, user, now);
        return json({
          ok: true,
          uid: user.id,
          username: user.username,
          ...tok,
          profile: out.profile,
          ledger: out.ledger,
          prog: out.prog
        });
      }

      // 4. Get Profile
      if (path === '/api/profile' && request.method === 'GET') {
        const auth = await authenticate(env, request);
        if (!auth) {
          return error('未登录或登录已过期，请重新登录', 401);
        }
        const out = await profileOut(env, auth.user, now);
        return json({
          ok: true,
          uid: auth.user.id,
          username: auth.user.username,
          profile: out.profile,
          ledger: out.ledger,
          prog: out.prog
        });
      }

      // 5. Update Profile (Sync)
      if (path === '/api/profile' && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) {
          return error('未登录或登录已过期，请重新登录', 401);
        }
        const body = await readBody(request);
        if (!body) return error('存档太大', 413);
        return await handleProfilePost(env, auth, body, now);
      }

      // 6. 武库：开箱、买卖、熔铸……
      if (path === '/api/econ' && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) return error('未登录或登录已过期，请重新登录', 401);
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await handleEcon(env, auth, body, now, ip);
      }

      // 7. 玩家市场：看在卖的、最近成交（挂单、买、撤走上面的 /api/econ）
      if (path === '/api/market' && request.method === 'GET') {
        const auth = await authenticate(env, request);
        if (!auth) return error('未登录或登录已过期，请重新登录', 401);
        if (!(await hit(env, 'mkt:' + auth.user.id, 60, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        return await handleMarket(env, auth.user.id, String(url.searchParams.get('k') || '').slice(0, 24), now);
      }

      // 8. 反作弊记录：客户端查自己的处罚；客户端抓到作弊时上报（只能往上加，10 分钟最多记一次）
      if (path === '/api/ac') {
        const auth = await authenticate(env, request);
        if (!auth) return error('未登录或登录已过期，请重新登录', 401);
        if (request.method === 'GET') return json({ ok: true, rec: await sanctionOf(env, auth.user.id), now });
        if (request.method === 'POST') {
          const body = await readBody(request) || {};
          const rec = await sanctionOf(env, auth.user.id);
          if (now - rec.at < 10 * 60e3) return json({ ok: true, rec, now });
          return json({ ok: true, rec: await strike(env, auth.user.id, String(body.reason || '客户端检测到作弊').slice(0, 60), now, 'client'), now });
        }
      }

      if (path.startsWith('/api/admin/')) return await handleAdmin(env, request, path, now, ip);

      // 网页报上来的错误（不用登录）
      if (path === '/api/err' && request.method === 'POST') return await errReport(env, request, ip, now);

      // 10. 在线人数（不用登录，游客也算）
      if (path === '/api/presence' && request.method === 'POST') {
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await presence(env, body, ip, now);
      }

      // 10b. 匿名游玩统计（不用登录，游客也算；不存名字、账号、IP）
      if (path === '/api/stats' && request.method === 'POST') {
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await playStats(env, body, ip, now);
      }
      if (path === '/api/ai-training' && request.method === 'POST') {
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await aiTrainingIngest(env, body, ip, now);
      }

      // 11. 天魔讨伐：看天魔不用登录；出战、交伤害要云端账号
      if (path === '/api/gboss' && request.method === 'GET') {
        if (!(await hit(env, 'gbg:' + ip, 120, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        const auth = await authenticate(env, request);
        return json(await gbState(env, await gbNow(env, now), auth && auth.user.id, now));
      }
      if ((path === '/api/gboss/start' || path === '/api/gboss/hit') && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) return error('登录云端账号才能出战', 401);
        if (path === '/api/gboss/start') return await gbStart(env, auth, now);
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await gbHit(env, auth, body, now);
      }

      // 12. 侠客列传的江湖足迹：看不用登录，记要云端账号
      if (path === '/api/saga' && request.method === 'GET') {
        if (!(await hit(env, 'sgg:' + ip, 120, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        const hero = String(url.searchParams.get('hero') || '');
        if (!C.HERO_IDS.includes(hero)) return error('没有这位侠客');
        return json(await sagaFoot(env, hero));
      }
      if (path === '/api/saga' && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) return error('未登录或登录已过期，请重新登录', 401);
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await sagaMarkPost(env, auth, body, now);
      }

      // 13. 全服肉鸽 · 江湖长卷：看全服进度不用登录（带登录凭证时附上自己的秘卷和能领几节）；领奖要云端账号
      if (path === '/api/world/chron' && request.method === 'GET') {
        if (!(await hit(env, 'cqg:' + ip, 60, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        const auth = await authenticate(env, request);
        return json(await chronGet(env, auth && auth.user.id));
      }
      if (path === '/api/world/chron/claim' && request.method === 'POST') {
        const auth = await authenticate(env, request);
        if (!auth) return error('登录云端账号才能领长卷奖励', 401);
        return await chronClaim(env, auth, now);
      }

      // 14. 功能开关（不用登录；带登录凭证时 Dev 账号能看到“只开 Dev”的）
      if (path === '/api/flags' && request.method === 'GET') {
        if (!(await hit(env, 'flg:' + ip, 60, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        const auth = await authenticate(env, request);
        const user = auth && auth.user;
        return json({ ok: true, flags: await flagsFor(env, user, now), turnstile: (await turnstileOn(env, user, now)) ? String(env.TURNSTILE_SITEKEY) : '' });
      }

      // 13. 排行榜（不用登录）：段位榜是这个赛季打满定级赛的，按段位分排；战绩榜按联机胜场排。被封的号不上榜
      if (path === '/api/leaderboard' && request.method === 'GET') {
        if (!(await hit(env, 'lbg:' + ip, 30, 60e3, now))) return error('刷新太快了，歇一会儿再试', 429);
        const auth = await authenticate(env, request);
        const kind = url.searchParams.get('k') === 'wins' ? 'wins' : 'rank';
        return json(await leaderboard(env, kind, String(url.searchParams.get('s') || ''), auth && auth.user.id, now));
      }

      // 9. Logout
      if (path === '/api/logout' && request.method === 'POST') {
        const token = getBearerToken(request);
        if (token) {   // 这台设备整组退出（它的 refresh 也作废）；老式令牌只删这一个
          const r = await sessionOf(env, token, 'u.id AS id, s.dev AS dev', now);
          if (r && r.dev) await dropDevice(env, r.dev);
          if (r) await authLog(env, request, 'logout', { uid: r.id, dev: r.dev });
          await env.DB.prepare('DELETE FROM sessions WHERE token IN (?, ?)').bind(await tokenKey(token), PLAIN_TOKEN.test(token) ? token : '-').run();
        }
        return json({ ok: true });
      }

      // 登录过的设备：GET 列出来；POST 退出一台（id）、以前的老式登录（id: 'legacy'）或者全部（all: true，连这台一起）
      if (path === '/api/devices') {
        const auth = await authenticate(env, request);
        if (!auth) return error('未登录或登录已过期，请重新登录', 401);
        const uid = auth.user.id;
        if (request.method === 'GET') {
          const rows = (await env.DB.prepare('SELECT id, label, created_at, last_seen FROM devices WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC LIMIT 50').bind(uid, now).all()).results || [];
          const legacy = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND dev = '' AND expires_at > ?").bind(uid, now).first('n');
          return json({ ok: true, current: auth.dev, legacy: legacy || 0, devices: rows.map(d => ({ ...d, current: d.id === auth.dev })) });
        }
        if (request.method === 'POST') {
          const body = await readBody(request);
          if (!body) return error('请求太大', 413);
          if (body.all === true) {
            await env.DB.batch([
              env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid),
              env.DB.prepare('DELETE FROM devices WHERE user_id = ?').bind(uid),
            ]);
            await authLog(env, request, 'device_all', { uid, dev: auth.dev });
            return json({ ok: true, all: true });
          }
          const id = String(body.id || '');
          if (id === 'legacy') {
            await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND dev = ''").bind(uid).run();
            await authLog(env, request, 'device_out', { uid, dev: auth.dev, note: 'legacy' });
            return json({ ok: true, id });
          }
          const d = await env.DB.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').bind(id, uid).first();
          if (!d) return error('没有这台设备', 404);
          await dropDevice(env, d.id);
          await authLog(env, request, 'device_out', { uid, dev: auth.dev, note: d.id });
          return json({ ok: true, id: d.id, current: d.id === auth.dev });
        }
      }

      // 用续期令牌换一套新的（见 handleRefresh）
      if (path === '/api/refresh' && request.method === 'POST') {
        if (!(await hit(env, 'rfs:' + ip, 60, 60e3, now))) return error('请求太频繁，稍后再试', 429);
        const body = await readBody(request);
        if (!body) return error('请求太大', 413);
        return await handleRefresh(env, request, body, now);
      }

      return error('Not found', 404);
    } catch (err) {
      console.error('Worker error:', rid, err);
      const p = errRecord(env, 'server', { msg: (err && (err.message || err.name)) || String(err), src: request.method + ' ' + path.replace(/\d+/g, ':n'), stack: err && err.stack, meta: { rid } }, Date.now()).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(p);
      return error(`服务器内部错误（编号 ${rid}）`, 500, { rid });
    }
}
