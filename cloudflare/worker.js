/**
 * 刃影 Cloudflare Worker：云端账号、存档同步、武库经济、反作弊
 *
 * 部署：wrangler.toml 的 main 是 worker.bundle.js，由 python3 tools/build.py 生成（本文件 + src/armory-core.js
 *       拼成一个文件，在 Cloudflare 网页编辑器里整段粘贴也能用）。要绑定 D1 数据库 DB，表会自动建好。
 * 环境变量（Workers → Settings → Variables，选 Secret；不设也能跑，只是用不了管理接口）：
 *   ADMIN_SECRET      管理口令：管理网页（这个 Worker 的 /admin）和 node tools/econ-admin.mjs 都用它。
 *                     可以只写一个口令，也可以写成「名字:口令」、几个人用逗号隔开（比如 even:口令1,lnt:口令2），
 *                     这样流水里记得下是谁做的。口令用 openssl rand -hex 24 这种随机生成的长串，少于 16 位的不认
 *
 * 管理后台（/api/admin/*，要管理口令）：查账号和流水、加减墨锭、发或收武器箱 / 终端机 / 改名标签 / 饰品、封号解封、
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
 *   武库：开箱、终端机、商店、汰换、掉落、补给、星章都在这里用服务器的随机数和时钟算。
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
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
function corsOrigin(env, origin) {
  if (!origin) return '';
  const extra = String((env && env.CORS_ORIGINS) || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
  return CORS_ORIGINS.includes(origin) || extra.includes(origin) || DEV_ORIGIN.test(origin) ? origin : '';
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
    if (!r.ok) { console.error('turn creds', r.status); return out; }
    const d = await r.json();
    // 返回格式是 { iceServers: {...} } 或 { iceServers: [{...}] }，两种都认；只要带用户名和密码的 turn(s): 地址
    const list = (Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers]).filter(x => x && x.username && x.credential);
    const turn = list.map(x => ({ urls: (Array.isArray(x.urls) ? x.urls : [x.urls]).filter(u => /^turns?:/.test(u)), username: x.username, credential: x.credential })).filter(x => x.urls.length);
    if (turn.length) { out.iceServers.push(...turn); out.turn = true; out.ttl = ICE_TTL; }
  } catch (e) { console.error('turn creds', e); }
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
const CODE_LOCAL = ['LOCK', 'RELOCK', 'RENYING666', 'RENYING888', 'SWORD2026', 'MOYUGIFT', 'ZODIAC2026STAR'];
// 以前不进库存的“绑定”皮肤（关卡奖励、老账号带过来的）：这一天之前建的号，第一次动武库时一次性换成库存里的饰品，
// 之后能卖能汰换。之后建的号不换：网页报上来的皮肤服务器核对不了，换成能卖的饰品就等于能凭空变出墨锭
const LEGACY_CUTOFF = Date.UTC(2026, 9, 31);
// 写在游戏里的兑换码：源码公开，等于人人都能领，已全部作废（名字留在 CODE_LOCAL 里，后台也建不了同名的）
const CODE_BUILTIN = {};
// 作废以前领过的号：码送的饰品（src 'code'）在库存里的、挂在市场上还没卖出的，第一次动武库时收回（记在 srv.zv）
const CODE_VOID = { ZODIAC2026STAR: it => it && it.src === 'code' && !!C.ITEM[it.k] && C.ITEM[it.k].col === 'c8' };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, profile_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, password_algo TEXT NOT NULL DEFAULT 'sha256-v1', password_updated_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, dev TEXT NOT NULL DEFAULT '', FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, refresh TEXT NOT NULL UNIQUE, prev TEXT NOT NULL DEFAULT '', rotated_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', last_seen INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id)`,
  `CREATE TABLE IF NOT EXISTS refresh_used (h TEXT PRIMARY KEY, dev TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS admins (name TEXT PRIMARY KEY COLLATE NOCASE, role TEXT NOT NULL CHECK (role IN ('view', 'econ', 'ban', 'all')), password_hash TEXT NOT NULL, salt TEXT NOT NULL, password_algo TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, created_by TEXT NOT NULL, last_login INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, uid TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', act TEXT NOT NULL, ip TEXT NOT NULL DEFAULT '', dev TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS idx_auth_log_uid ON auth_log(uid, at)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_log_at ON auth_log(at)`,
  `CREATE TABLE IF NOT EXISTS econ (uid TEXT PRIMARY KEY, state_json TEXT NOT NULL, srv_json TEXT NOT NULL, ink INTEGER NOT NULL, ver INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS econ_nonce (uid TEXT NOT NULL, nonce TEXT NOT NULL, at INTEGER NOT NULL, res_json TEXT NOT NULL, PRIMARY KEY (uid, nonce))`,
  `CREATE TABLE IF NOT EXISTS econ_log (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, at INTEGER NOT NULL, act TEXT NOT NULL, ok INTEGER NOT NULL, ink0 INTEGER, ink1 INTEGER, detail TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_econ_log_uid ON econ_log (uid, at)`,
  `CREATE INDEX IF NOT EXISTS idx_econ_log_act ON econ_log (act, id)`,   // 管理后台查“管理员做过的事”用
  `CREATE TABLE IF NOT EXISTS sanctions (uid TEXT PRIMARY KEY, strikes INTEGER NOT NULL DEFAULT 0, ban_until INTEGER NOT NULL DEFAULT 0, perm INTEGER NOT NULL DEFAULT 0, log_json TEXT NOT NULL DEFAULT '[]', at INTEGER NOT NULL DEFAULT 0, pardon INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL)`,
  // 玩家市场：state 0 在卖、1 卖掉了、2 撤下了；paid 是卖家拿到钱没有；tx 是改它的那个请求（同一批写入靠它确认改成了）
  `CREATE TABLE IF NOT EXISTS mkt (id TEXT PRIMARY KEY, seller TEXT NOT NULL, k TEXT NOT NULL, st INTEGER NOT NULL, item_json TEXT NOT NULL, price INTEGER NOT NULL, at INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 0, buyer TEXT, done_at INTEGER, paid INTEGER NOT NULL DEFAULT 0, tx TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_k ON mkt (k, state, price)`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_seller ON mkt (seller, state, paid)`,
  `CREATE INDEX IF NOT EXISTS idx_mkt_done ON mkt (state, done_at)`,
  // 全服补偿：uid 是 '*' 发给所有人（只给 born 之前注册的号），否则只发给这一个号；领过的记在 gift_got
  `CREATE TABLE IF NOT EXISTS gift (id TEXT PRIMARY KEY, uid TEXT NOT NULL, ink INTEGER NOT NULL DEFAULT 0, items_json TEXT NOT NULL DEFAULT '{}', note TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL, until INTEGER NOT NULL, born INTEGER NOT NULL, off INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_gift_uid ON gift (uid, until)`,
  `CREATE TABLE IF NOT EXISTS gift_got (gid TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (gid, uid))`,
  // 兑换码：玩家在游戏里输入就领到里面的东西，每个号只领一次（code_got）；got 到了 uses 就领完了（CHECK 挡住多领），until 之后、off 是 1 都领不到
  `CREATE TABLE IF NOT EXISTS code (code TEXT PRIMARY KEY, ink INTEGER NOT NULL DEFAULT 0, items_json TEXT NOT NULL DEFAULT '{}', note TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL, until INTEGER NOT NULL, uses INTEGER NOT NULL, got INTEGER NOT NULL DEFAULT 0, off INTEGER NOT NULL DEFAULT 0, CHECK (got <= uses))`,
  `CREATE TABLE IF NOT EXISTS code_got (code TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (code, uid))`,
  // 在线改的经济数值：每改一次加一行，最后一行是现在用的（只存和默认值不一样的项）
  `CREATE TABLE IF NOT EXISTS cfg (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL, by TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL)`,
  // 在线人数：每个打开的网页（按标签页，刷新不算新人）每 30 秒报一次到；PRESENCE_WINDOW 内报过的算在线。ip 只存哈希
  `CREATE TABLE IF NOT EXISTS presence (sid TEXT PRIMARY KEY, ip TEXT NOT NULL, st TEXT NOT NULL, seen INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence (seen)`,
  // 天魔讨伐：每一代一行（hp 到 0 或 until 到了就 ended；killer 为空表示遁走了；paid 是奖励发了没有）；last / last_tx 是最近一次扣血扣了多少、是哪个请求
  `CREATE TABLE IF NOT EXISTS gboss (gen INTEGER PRIMARY KEY, hero TEXT NOT NULL, affix TEXT NOT NULL, max_hp INTEGER NOT NULL, hp INTEGER NOT NULL, started INTEGER NOT NULL, until INTEGER NOT NULL, ended INTEGER NOT NULL DEFAULT 0, killer TEXT, paid INTEGER NOT NULL DEFAULT 0, last INTEGER NOT NULL DEFAULT 0, last_tx TEXT)`,
  `CREATE TABLE IF NOT EXISTS gboss_hit (gen INTEGER NOT NULL, uid TEXT NOT NULL, dmg INTEGER NOT NULL, runs INTEGER NOT NULL, last INTEGER NOT NULL, PRIMARY KEY (gen, uid))`,
  // 一次出战一张票：done 是交过伤害没有，dmg 是最后算进去多少（天魔已经倒了就是 0），killed 是这一下打死的
  `CREATE TABLE IF NOT EXISTS gboss_try (id TEXT PRIMARY KEY, uid TEXT NOT NULL, gen INTEGER NOT NULL, started INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, tx TEXT, dmg INTEGER NOT NULL DEFAULT 0, killed INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_gboss_try_uid ON gboss_try (uid, started)`,
  `CREATE INDEX IF NOT EXISTS idx_gboss_try_done ON gboss_try (done, started)`,
  // 侠客列传的江湖足迹：node 是 n1 ~ n5（走完第几节）、c3（第 3 节的抉择）、end（结局），pick 是选了什么
  `CREATE TABLE IF NOT EXISTS saga_mark (hero TEXT NOT NULL, node TEXT NOT NULL, uid TEXT NOT NULL, pick TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (hero, node, uid))`,
  // 功能开关：mode 是 off（关）、dev（只对 Dev 账号开）、all（所有人开）；没有这一行就用代码里 FLAGS 写的默认值
  `CREATE TABLE IF NOT EXISTS flags (k TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('off', 'dev', 'all')), by TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL)`,
  // 错误记录：同一种错（kind + 消息 + 位置）合成一行，n 是出现了几次。kind：client 网页报上来的、server 服务器自己出的错、slow 慢请求。不存 IP、账号
  `CREATE TABLE IF NOT EXISTS errs (sig TEXT PRIMARY KEY, kind TEXT NOT NULL, msg TEXT NOT NULL, src TEXT NOT NULL, stack TEXT NOT NULL, meta TEXT NOT NULL, n INTEGER NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_errs_last ON errs (kind, last_at)`,
];
let schemaReady = null;
// 以前建的表后来加的列：已经有了 SQLite 会报 duplicate column，跳过就行
const SCHEMA_COLS = [
  `ALTER TABLE users ADD COLUMN password_algo TEXT NOT NULL DEFAULT 'sha256-v1'`,
  `ALTER TABLE users ADD COLUMN password_updated_at INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE errs ADD COLUMN ms INTEGER NOT NULL DEFAULT 0`,       // 慢请求：最慢一次多少毫秒
  `ALTER TABLE errs ADD COLUMN ms_sum INTEGER NOT NULL DEFAULT 0`,   // 慢请求：加起来多少毫秒（除以 n 是平均）
  `ALTER TABLE sessions ADD COLUMN dev TEXT NOT NULL DEFAULT ''`,
];
// 要等上面的列加好才能建的
const SCHEMA_POST = [
  `CREATE INDEX IF NOT EXISTS idx_sessions_dev ON sessions(dev)`,
];
function ensureSchema(env) {
  if (!schemaReady) schemaReady = (async () => {
    await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
    for (const sql of SCHEMA_COLS) {
      try { await env.DB.prepare(sql).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
    await env.DB.batch(SCHEMA_POST.map(s => env.DB.prepare(s)));
  })().catch(e => { schemaReady = null; throw e; });
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
  const r = await env.DB.prepare(`SELECT s.token AS stok, ${cols} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token IN (?1, ?2) AND s.expires_at > ?3 ORDER BY s.token = ?1 DESC LIMIT 1`)
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
  const d = await env.DB.prepare('SELECT d.id, d.user_id, u.username FROM devices d JOIN users u ON u.id = d.user_id WHERE d.refresh = ? AND d.expires_at > ?').bind(h, now).first();
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
  if (!used) return error('登录已过期，请重新登录', 401);
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
// 买、撤玩家市场上的一单时还要再带一条“那一单是被这个请求改掉的”（tx = [挂单编号, 请求标记]）：别人先买走了，这一批也什么都不写
const TXC = ' AND EXISTS (SELECT 1 FROM mkt WHERE id = ? AND tx = ?)';
// guard 只给 INSERT … SELECT、UPDATE … WHERE 后面接着用（cond 前面没有 AND）
const guard = (env, sql, binds, uid, ver, tx) => env.DB.prepare(`${sql} EXISTS (SELECT 1 FROM econ WHERE uid = ? AND ver = ?)${tx ? TXC : ''}`).bind(...binds, uid, ver, ...(tx || []));
const ins = (env, sql, binds, uid, ver, tx) => guard(env, sql + ' WHERE', binds, uid, ver, tx);
function userWrite(env, uid, prof, now, ver, tx) {
  return guard(env, 'UPDATE users SET profile_json = ?, updated_at = ? WHERE id = ? AND', [JSON.stringify(prof), now, uid], uid, ver, tx);
}
function econWrite(env, uid, ver, now, srv, ink, stateJson, tx) {
  return env.DB.prepare(`UPDATE econ SET state_json = ?, srv_json = ?, ink = ?, ver = ver + 1, updated_at = ? WHERE uid = ? AND ver = ?${tx ? TXC : ''}`)
    .bind(stateJson, JSON.stringify(srv), ink, now, uid, ver, ...(tx || []));
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

/* ---------- 全服补偿：开发组发的墨锭、武器箱、终端机、改名标签，玩家下次动武库时自动领 ---------- */
// 发给所有人的（uid = '*'）只给 born 之前注册的号，免得开小号来领；单发给某个号的不管注册时间。每个号每份只领一次
async function giftsFor(env, user, now) {
  return (await env.DB.prepare("SELECT id, ink, items_json, note FROM gift WHERE (uid = ? OR uid = '*') AND off = 0 AND at <= ? AND until > ? AND born > ? AND NOT EXISTS (SELECT 1 FROM gift_got x WHERE x.gid = gift.id AND x.uid = ?) ORDER BY at LIMIT 10")
    .bind(user.id, now, now, Math.floor(+user.created_at || 0), user.id).all()).results || [];
}
function giftItems(txt) {   // 一份补偿里的东西：{ cases: { c1: 2 }, term: 1, tags: 1 }，数都夹在 0 ~ 100；全服肉鸽发的还有 skin（只认星座武器箱的款）
  const o = parseObj(txt) || {}, cases = {};
  for (const c of C.CASES) { const n = Math.floor(+(o.cases && o.cases[c]) || 0); if (n > 0) cases[c] = Math.min(100, n); }
  const one = x => Math.max(0, Math.min(100, Math.floor(+x || 0)));
  const out = { cases, term: one(o.term), tags: one(o.tags) };
  if (typeof o.skin === 'string' && C.isItem(o.skin) && C.ITEM[o.skin].col === 'c8') out.skin = o.skin;
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
      // 每个号只领一次：领过以后卖掉、汰换掉的不再补（不然卖了再领就是凭空变墨锭）
      if (await env.DB.prepare('SELECT 1 FROM code_got WHERE code = ? AND uid = ?').bind(k, uid).first()) return error('这个兑换码你已经领过了');
      code = { code: k, ink: 0, cases: {}, term: 0, tags: 0, builtin: true, ...CODE_BUILTIN[k]() };
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
    const mkt = { id: randHex(8), ids: Array.from({ length: 20 }, () => randHex(8)), row: null, out: null, open: 0 };
    if ((act === 'buy' || act === 'cancel') && C.isLid(args.l)) {
      const r0 = await env.DB.prepare('SELECT id, seller, k, st, item_json, price, state, at FROM mkt WHERE id = ?').bind(args.l).first();
      if (r0) mkt.row = { id: r0.id, seller: r0.seller, k: r0.k, st: r0.st, price: r0.price, state: r0.state, item: parseObj(r0.item_json), expired: r0.state === 0 && r0.at < now - ttl };
    }
    if (act === 'list' || act === 'listDupes') mkt.open = ((await env.DB.prepare('SELECT COUNT(*) AS n FROM mkt WHERE seller = ? AND state = 0').bind(uid).first()) || {}).n || 0;
    // 存档里还挂着、市场上已经不在卖的（到期撤下、被撤下，或者那一单已经清理掉了）：这次退回库存。卖掉的不算，卖掉的走上面的结账
    const lst0 = (Array.isArray(eco.state.lst) ? eco.state.lst : []).filter(L => L && C.isLid(L.l)).slice(0, 40);
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
        if (it.skin) giftSkins.push(it.skin);
        got.push({ id: g.id, note: g.note, ink, ...it });
      }
      if (code) {   // 兑换码里的东西也先放进去
        ink0 += code.ink;
        for (const [c, n] of Object.entries(code.cases)) state0.cases[c] += n;
        state0.term += code.term; state0.tags += code.tags;
      }
    }
    const E = { now, rnd, uid, ink: ink0, skins: skins0.slice(), equip: fixEquip(cleanEquip(prof.equip), skins0), server: true, paid, back, mkt, cfg };
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
    for (const k of giftSkins) if (state0.inv.length < C.INV_MAX) C.addItem(state0, C.mkItem(state0, k, 'rouge', rnd, { st: -1 }), E);   // 全服肉鸽发的星座皮肤：放一件进库存，能卖能汰换
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
    delete p.armory; delete p.ledger;
    const quiet = QUIET.includes(act) && !out.sold.length && !out.back;
    // 流水里记下这一次进出库存的每一件（rm 出去的、ad 进来的，挂到市场上不算出去）：哪件饰品是哪一步没的，后台找回工具按这个查
    const moved = itemDiff(eco.state, st);
    const detail = logDetail({ a: args, r: res.err ? res.err : res.item ? itemRef(res.item) : res.gain || res.price || '', s: out.sold.length || undefined, b: out.back ? out.back.length : undefined, ...moved });
    // 买、撤：先把那一单从“在卖”改掉（只有它还在卖、版本号也没变才改得动），后面每一条都要看到这一改才生效
    const id = mo && (mo.buy || mo.cancel), tx = id ? [id, nonce.slice(0, 24) + '.' + attempt] : null;
    const stmts = [];
    if (mo && mo.buy) stmts.push(guard(env, 'UPDATE mkt SET state = 1, buyer = ?, done_at = ?, tx = ? WHERE id = ? AND state = 0 AND seller <> ? AND at >= ? AND', [uid, now, tx[1], id, uid, now - ttl], uid, ver));   // 到期的单买不了
    if (mo && mo.cancel) stmts.push(guard(env, 'UPDATE mkt SET state = 2, done_at = ?, tx = ? WHERE id = ? AND seller = ? AND state = 0 AND', [now, tx[1], id, uid], uid, ver));
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
      stmts.push(ins(env, `INSERT INTO code_got (code, uid, at) SELECT ?, ?, ?`, [code.code, uid, now], uid, ver, tx));
      if (!code.builtin) stmts.push(guard(env, 'UPDATE code SET got = got + 1 WHERE code = ? AND', [code.code], uid, ver, tx));
      stmts.push(ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [uid, now, 'code_got', 1, null, null, JSON.stringify({ code: code.code, note: code.note, ink: code.ink || undefined, cases: Object.keys(code.cases).length ? code.cases : undefined, term: code.term || undefined, tags: code.tags || undefined })], uid, ver, tx));
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
    return json({ ok: true, ...out, state: C.publicState(st), ledger: ledgerOut(eco, now), skinsAdd: add, skinsDel: del, equip: eq, cfg, gifts: got.length ? got.map(({ id, ...g }) => g) : undefined });
  }
  return error('服务器忙，请再试一次', 503);
}

/* ---------- 进度计数（胜场、负场、侠客碎片）：和墨锭一样按条记账 ----------
 * 两台设备各自打了几局，云端要的是两边新增的加起来，不是谁大要谁、也不是后传的覆盖先传的。
 * 所以网页把“这次比上次多了几”记成一条条带编号的增量（prog.deltas），服务器每条只加一次（编号记在 srv.pg），
 * 存档里报上来的绝对数不认。网页重试、刷新后重报、两台设备同时报，都不会重复加。
 * 老版本网页没有 prog：照旧用它报的绝对数（等它刷新成新网页就走账了）。 */
const PG_KEY = /^(netWins|netLosses|frags\.[a-z]{2,16})$/, PG_MAX = 1e6, PG_STEP = 10000, PG_KEEP = 10 * DAY_MS;
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
  for (const e of (Array.isArray(deltas) ? deltas : []).slice(0, 60)) {
    if (!e || typeof e.id !== 'string' || !/^[0-9a-f]{8,32}$/.test(e.id) || !e.d || typeof e.d !== 'object') continue;
    if (pg[e.id]) { acks.push(e.id); continue; }
    for (const [k, d] of Object.entries(e.d)) {
      const n = Math.trunc(+d);
      if (!PG_KEY.test(k) || !Number.isFinite(n) || Math.abs(n) > PG_STEP) continue;
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
  for (const src of [stored.stageStars, inc.stageStars]) if (src && typeof src === 'object' && !Array.isArray(src)) for (const [k, v] of Object.entries(src)) if (/^[\w-]{1,32}$/.test(k)) stars[k] = Math.max(stars[k] || 0, Math.max(0, Math.min(3, Math.floor(+v || 0))));
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
    // 计数走增量账；其余进度和服务器上那份按确定的规则合并，不让后到的一份把另一台设备的进度盖掉
    let pgAcks = [];
    if (prog) {
      const vals = pgVals(stored);
      pgAcks = pgApply(eco.srv, vals, prog.deltas, now);
      pgPut(p, vals);
      Object.assign(p, mergeStored(stored, incoming));
    }
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
// 注册时带上来的存档（游客进度、本机老账号）：墨锭有上限，武库专属皮肤不认。不管叫什么昵称都一样
function cleanInitial(prof) {
  const p = { ...prof };
  delete p.armory; delete p.ledger;
  p.ink = Math.min(clampInk(p.ink), REG_INK_CAP);
  p.skins = cleanSkins(p.skins).filter(k => !C.CS_KEYS.includes(k));
  p.equip = fixEquip(cleanEquip(p.equip), p.skins);
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
    const open = (await env.DB.prepare('SELECT id, st, price, at, seller = ? AS mine FROM mkt WHERE k = ? AND state = 0 AND at >= ? ORDER BY price, at LIMIT 80').bind(uid, k, now - mktTtl()).all()).results || [];
    const deals = (await env.DB.prepare('SELECT st, price, done_at AS at FROM mkt WHERE k = ? AND state = 1 ORDER BY done_at DESC LIMIT 120').bind(k).all()).results || [];
    return json({ ok: true, now, k, open: open.map(r => ({ l: r.id, st: r.st, price: r.price, at: r.at, mine: !!r.mine })), deals: deals.map(r => ({ st: r.st, price: r.price, at: r.at })) });
  }
  // 每一款：在卖几件、最低多少（普通版 n / lo，斩数版 sn / slo），最近一次成交（last / slast），30 天成交几次（d）
  const open = (await env.DB.prepare('SELECT k, st >= 0 AS s, COUNT(*) AS n, MIN(price) AS lo FROM mkt WHERE state = 0 AND at >= ? GROUP BY k, st >= 0').bind(now - mktTtl()).all()).results || [];
  const deals = (await env.DB.prepare('SELECT k, st >= 0 AS s, price FROM mkt WHERE state = 1 AND done_at > ? ORDER BY done_at DESC LIMIT 3000').bind(now - 30 * DAY_MS).all()).results || [];
  const items = {}, of = k => items[k] || (items[k] = { n: 0, lo: 0, sn: 0, slo: 0, last: 0, slast: 0, d: 0 });
  for (const r of open) { if (!C.isItem(r.k)) continue; const x = of(r.k); if (r.s) { x.sn = r.n; x.slo = r.lo; } else { x.n = r.n; x.lo = r.lo; } }
  for (const r of deals) { if (!C.isItem(r.k)) continue; const x = of(r.k); x.d++; if (r.s) x.slast = x.slast || r.price; else x.last = x.last || r.price; }
  return json({ ok: true, now, items });
}

/* ---------- 管理后台（/api/admin/*，要管理口令，见文件开头；网页版在这个 Worker 的 /admin） ---------- */
// 口令对的话给出是谁：「名字:口令」里的名字；只写了一个口令就是 admin
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
 * 管理网页先登录（POST /api/admin/login）换一个 30 分钟的管理令牌（as_ 开头），网页只放在内存里，刷新、过期就要重新登录。
 * 两种登录：管理员账号（名字 + 密码，存在 admins 表，密码和玩家一样用 PBKDF2），或者 ADMIN_SECRET 里的口令（角色是“全部”，
 * 用来建第一批管理员账号；命令行 tools/econ-admin.mjs 也还是直接带口令）。
 * 角色：view 只能看；econ 还能改墨锭、补偿、兑换码、经济数值、找回饰品；ban 还能封号、解封、重设玩家密码；all 什么都能做（功能开关、管理员账号）。
 * 每次登录、每次改管理员账号都记进 econ_log，和别的管理操作一样在「操作记录」里看得到。 */
const ADMIN_TTL = 30 * 60e3;
const ADMIN_ROLES = ['view', 'econ', 'ban', 'all'];
const ADMIN_ROLE_NAME = { view: '只能看', econ: '经济', ban: '封禁和账号', all: '全部' };
// 不写在这里的：GET 是 view，POST 是 all（管理员账号列表也只给 all 看）
const ADMIN_NEED = {
  'POST /api/admin/adjust': 'econ', 'POST /api/admin/restore': 'econ', 'POST /api/admin/gift': 'econ', 'POST /api/admin/gift/off': 'econ',
  'POST /api/admin/code': 'econ', 'POST /api/admin/code/off': 'econ', 'POST /api/admin/cfg': 'econ', 'POST /api/admin/cfg/undo': 'econ',
  'POST /api/admin/ban': 'ban', 'POST /api/admin/pardon': 'ban', 'POST /api/admin/password': 'ban',
  'POST /api/admin/logout': 'view', 'GET /api/admin/admins': 'all',
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
const ADJ_INK = 1000000, ADJ_N = 1000;   // 一次最多加减这么多墨锭、这么多个箱子 / 终端机 / 标签

// 改一个玩家：墨锭、武器箱、终端机、改名标签加减，发饰品、收饰品，一次请求里的几样要么一起改成、要么都不改。
// 和玩家自己的操作走同一套带版本号的写入：玩家正好在开箱也不会互相覆盖。收走的皮肤记进 gone，旧存档加不回来
async function adminAdjust(env, u, body, who, why, now) {
  const dInk = intIn(body.ink, -ADJ_INK, ADJ_INK), dTerm = intIn(body.term, -ADJ_N, ADJ_N), dTags = intIn(body.tags, -ADJ_N, ADJ_N);
  if (dInk === null) return error(`墨锭一次最多加减 ${ADJ_INK}，要填整数`);
  if (dTerm === null || dTags === null) return error(`终端机、改名标签一次最多加减 ${ADJ_N} 个，要填整数`);
  const cases = {};
  for (const [c, v] of Object.entries(isPlain(body.cases) ? body.cases : {})) {
    const n = intIn(v, -ADJ_N, ADJ_N);
    if (!C.CASES.includes(c) || n === null) return error(`武器箱 ${c} 不对：要是 ${C.CASES.join(' / ')}，一次最多加减 ${ADJ_N} 个`);
    if (n) cases[c] = n;
  }
  const give = Array.isArray(body.give) ? body.give : [], take = Array.isArray(body.take) ? body.take : [];
  if (give.length > 50 || take.length > 200) return error('一次最多发 50 件、收 200 件');
  const gv = [];
  for (const g of give) {
    const k = isPlain(g) ? String(g.k || '') : String(g || ''), st = isPlain(g) && g.st !== undefined && g.st !== null && g.st !== '' && +g.st >= 0 ? intIn(g.st, 0, 1e7) : -1;
    if (!C.isItem(k)) return error(`没有这件饰品：${k}`);
    if (st === null) return error('斩数要是 0 到 10000000 的整数');
    gv.push({ k, st });
  }
  const tk = take.map(Number);
  if (tk.some(i => !Number.isInteger(i) || i < 1)) return error('要收的饰品编号不对');
  if (!dInk && !dTerm && !dTags && !Object.keys(cases).length && !gv.length && !tk.length) return error('什么都没填，没有要改的');
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
    if (s.term + dTerm < 0) return error(`这个号只有 ${s.term} 台终端机`);
    if (s.tags + dTags < 0) return error(`这个号只有 ${s.tags} 张改名标签`);
    s.term += dTerm; s.tags += dTags;
    const given = gv.map(g => C.addItem(s, C.mkItem(s, g.k, 'admin', rnd, { st: g.st }), E)), taken = [];
    for (const i of tk) {
      if (s.lst.some(L => L.it.i === i)) return error(`第 ${i} 号饰品挂在玩家市场上，要等玩家撤下或者卖掉才能收`);
      const it = C.dropItem(s, i, E);
      if (!it) return error(`库存里没有第 ${i} 号饰品`);
      taken.push(it);
    }
    const bad = [E.ink, s.tags, s.term, ...Object.values(s.cases)].find(v => !Number.isSafeInteger(v) || v < 0 || v > 1e12);
    if (bad !== undefined) return error('算出来的数不对，没有改');
    const add = E.skins.filter(k => !skins0.includes(k)), del = skins0.filter(k => !E.skins.includes(k));
    const ver = eco.ver, srv = eco.srv;
    for (const k of del) srv.gone[k] = [ver + 1, now];
    for (const k of add) delete srv.gone[k];
    pruneGone(srv, now);
    const p = { ...prof, ink: E.ink, skins: E.skins, equip: E.equip, updatedAt: now };
    delete p.armory; delete p.ledger;
    const detail = JSON.stringify({ by: who, why, ink: dInk || undefined, cases: Object.keys(cases).length ? cases : undefined, term: dTerm || undefined, tags: dTags || undefined,
      give: given.length ? given.map(itemRef) : undefined, take: taken.length ? taken.map(itemRef) : undefined });
    const results = await env.DB.batch([
      ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [u.id, now, 'admin', 1, eco.ink, E.ink, detail.slice(0, 2000)], u.id, ver),
      userWrite(env, u.id, p, now, ver),
      econWrite(env, u.id, ver, now, srv, E.ink, JSON.stringify(s)),
    ]);
    if (!(results[results.length - 1].meta && results[results.length - 1].meta.changes === 1)) continue;   // 玩家刚好也在动：重读再改
    return json({ ok: true, uid: u.id, ink: E.ink, cases: s.cases, term: s.term, tags: s.tags, given, taken });
  }
  return error('服务器忙，请再试一次', 503);
}

// ---------- 找回饰品：按流水查“拿到过、现在库存和挂单里都没有”的饰品，管理员确认后放回去 ----------
// 正常的去向（汰换掉、一键卖掉重复的、在玩家市场卖掉）只列出来，不能找回（找回就是凭空多一件）；
// 去向不明的（某一步操作里突然没了、旧流水没记去向）和管理员收走的可以找回。找回过的会标出来，不能再找回第二次
const LOST_WHY = { trade: '汰换掉了', sellDupes: '一键卖掉了重复的', sold: '在玩家市场卖掉了', admin: '管理员收走了' };
const parseItemRef = t => { const m = /^([a-z]{2}_[a-z0-9]+)#(\d+)( st(\d+)?)?$/.exec(String(t)); return m && C.isItem(m[1]) ? { k: m[1], i: +m[2], st: m[3] ? +(m[4] || 0) : -1, n: m[4] !== undefined } : null; };   // 老流水只记了 st，没有斩数
async function lostItems(env, uid) {
  const row = await env.DB.prepare('SELECT state_json FROM econ WHERE uid = ?').bind(uid).first();
  const st = parseObj(row && row.state_json) || C.blank(), here = new Set();
  for (const it of Array.isArray(st.inv) ? st.inv : []) if (it) here.add(+it.i);
  for (const L of Array.isArray(st.lst) ? st.lst : []) if (L && L.it) here.add(+L.it.i);
  const sold = new Set();
  for (const r of (await env.DB.prepare('SELECT item_json FROM mkt WHERE seller = ? AND state = 1').bind(uid).all()).results || []) { const it = parseObj(r.item_json); if (it) sold.add(+it.i); }
  const log = (await env.DB.prepare('SELECT at, act, ok, detail FROM econ_log WHERE uid = ? ORDER BY id LIMIT 20000').bind(uid).all()).results || [];
  const seen = new Map();
  const one = (x, fresh) => { let o = seen.get(x.i); if (!o) seen.set(x.i, o = { i: x.i, k: x.k, st: x.st }); else if (fresh || x.n) { o.k = x.k; o.st = x.st; } return o; };   // 记了斩数的以最近一次为准；老流水没记斩数，以拿到时的为准
  const got = (t, r) => { const x = parseItemRef(t); if (x) { const o = one(x, true); if (!o.got) o.got = { at: r.at, act: r.act }; } };
  const gone = (t, r, why) => { const x = typeof t === 'number' ? seen.get(t) : parseItemRef(t); if (!x) return; const o = one(x); o.gone = { at: r.at, act: r.act, why }; o.restored = null; };
  for (const r of log) {
    const d = parseObj(r.detail); if (!d) continue;
    if (r.act === 'restore') { for (const x of Array.isArray(d.items) ? d.items : []) { const o = seen.get(+x.from); if (o) o.restored = { at: r.at, to: x.to }; } for (const t of d.ad || []) got(t, r); continue; }
    if (r.act === 'admin') { for (const t of d.give || []) got(t, r); for (const t of d.take || []) gone(t, r, 'admin'); continue; }
    if (!r.ok && !d.rm && !d.ad) continue;
    if (typeof d.r === 'string') got(d.r, r);   // 开箱、汰换、终端机、买到的那一件
    for (const t of Array.isArray(d.ad) ? d.ad : []) got(t, r);
    for (const t of Array.isArray(d.rm) ? d.rm : []) gone(t, r);
    if (r.act === 'trade' && r.ok && !d.rm && d.a && Array.isArray(d.a.ids)) for (const i of d.a.ids) gone(+i, r);   // 旧流水没记进出：汰换按参数里的编号算
  }
  const out = [];
  for (const o of seen.values()) {
    if (here.has(o.i)) continue;
    const g = o.gone, why = o.restored ? 'restored' : sold.has(o.i) ? 'sold' : g && g.why === 'admin' ? 'admin' : g && LOST_WHY[g.act] ? g.act : g ? 'odd' : 'unknown';
    out.push({ i: o.i, k: o.k, st: o.st, got: o.got || null, gone: g || null, why, can: ['admin', 'odd', 'unknown'].includes(why) });
  }
  out.sort((a, b) => ((b.gone && b.gone.at) || 0) - ((a.gone && a.gone.at) || 0) || b.i - a.i);
  return out.slice(0, 300);
}
async function adminRestore(env, u, body, who, why, now) {
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number))] : [];
  if (!ids.length || ids.length > 50 || ids.some(i => !Number.isInteger(i) || i < 1)) return error('要找回的饰品编号不对（一次最多 50 件）');
  const lost = new Map((await lostItems(env, u.id)).map(x => [x.i, x]));
  for (const i of ids) {
    const x = lost.get(i);
    if (!x) return error(`第 ${i} 号饰品不在“找不到的饰品”里（可能还在库存里，或者流水里没有它）`);
    if (!x.can) return error(`第 ${i} 号饰品${x.why === 'restored' ? '已经找回过了' : LOST_WHY[x.why] || '是正常没的'}，不能找回`);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const urow = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(u.id).first();
    const prof = parseProfile(urow ? urow.profile_json : '', u.username);
    const eco = await loadEcon(env, u.id, prof, now);
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
    const detail = JSON.stringify({ by: who, why, items, ad: items.map(x => itemRef({ k: x.k, i: x.to, st: x.st })) });
    const results = await env.DB.batch([
      ins(env, 'INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) SELECT ?, ?, ?, ?, ?, ?, ?', [u.id, now, 'restore', 1, eco.ink, E.ink, detail.slice(0, 2000)], u.id, ver),
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

async function handleAdmin(env, request, path, now, ip) {
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
  const findUser = key => key ? env.DB.prepare('SELECT id, username, created_at FROM users WHERE id = ? OR username = ?').bind(key, key).first() : null;
  const bundleIn = (noun, eg) => {   // 补偿、兑换码里的东西：墨锭、每种武器箱、终端机、改名标签，还有给玩家看的说明
    const ink = intIn(body.ink, 0, ADJ_INK), term = intIn(body.term, 0, 100), tags = intIn(body.tags, 0, 100);
    if (ink === null) return { err: `墨锭要填 0 到 ${ADJ_INK} 的整数` };
    if (term === null || tags === null) return { err: '终端机、改名标签每份最多 100 个' };
    const cases = {};
    for (const [c, v] of Object.entries(isPlain(body.cases) ? body.cases : {})) {
      const n = intIn(v, 0, 100);
      if (!C.CASES.includes(c) || n === null) return { err: `武器箱 ${c} 不对：每份每种最多 100 个` };
      if (n) cases[c] = n;
    }
    if (!ink && !term && !tags && !Object.keys(cases).length) return { err: noun + '里什么都没有' };
    const note = String(body.note || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60);
    if (note.length < 2) return { err: `要写给玩家看的说明（至少 2 个字），比如「${eg}」` };
    return { ink, cases, term, tags, note };
  };
  const bundleLog = b => ({ ink: b.ink || undefined, cases: Object.keys(b.cases).length ? b.cases : undefined, term: b.term || undefined, tags: b.tags || undefined });
  const route = (post ? 'POST ' : 'GET ') + path;
  const need = ADMIN_NEED[route] || (post ? 'all' : 'view');
  if (!adminCan(role, need)) return error(`你的管理员角色（${ADMIN_ROLE_NAME[role]}）不能做这件事，要「${ADMIN_ROLE_NAME[need]}」`, 403, { role });

  if (route === 'GET /api/admin/whoami') return json({ ok: true, who, role, now });
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
  if (route === 'GET /api/admin/catalog') {   // 管理网页用：武器箱、每档品质的名字和颜色、每件饰品在哪个箱子哪一档、能改的经济数值
    return json({ ok: true, tiers: C.TIERS.map(t => ({ id: t, n: C.TIER[t].n, c: C.TIER[t].c })),
      cols: C.CASES.map(c => ({ id: c, name: C.COLS[c].name, prem: !!C.COLS[c].prem })),
      items: Object.keys(C.ITEM).map(k => ({ k, col: C.ITEM[k].col, tier: C.ITEM[k].tier, char: C.charOf(k) })), cfg: C.CFG_INFO });
  }
  if (route === 'GET /api/admin/stats') {   // 总览
    await cfgNow(env, now);
    const one = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
    const [users, fresh, eco, open, deals, banned] = await Promise.all([
      one('SELECT COUNT(*) AS n FROM users'), one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - DAY_MS),
      one('SELECT COUNT(*) AS n, COALESCE(SUM(ink), 0) AS ink FROM econ'), one('SELECT COUNT(*) AS n FROM mkt WHERE state = 0'),
      one('SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS v FROM mkt WHERE state = 1 AND done_at > ?', now - DAY_MS),
      one('SELECT COUNT(*) AS n FROM sanctions WHERE perm = 1 OR ban_until > ?', now),
    ]);
    return json({ ok: true, who, now, users: users.n, newToday: fresh.n, accounts: eco.n, inkTotal: eco.ink, open: open.n, deals24: deals.n, dealInk24: deals.v, banned: banned.n, cfgId: CFG_CACHE.id });
  }
  if (route === 'GET /api/admin/errors') {   // 错误记录：最近出现的在前；kind 不填就全部
    const kind = q('kind'), days = Math.max(1, Math.min(30, +q('days') || 7));
    const rows = (await env.DB.prepare(
      `SELECT sig, kind, msg, src, stack, meta, n, first_at, last_at, ms, ms_sum FROM errs WHERE last_at > ?1 ${kind ? 'AND kind = ?2' : ''} ORDER BY last_at DESC LIMIT 200`
    ).bind(...(kind ? [now - days * DAY_MS, kind] : [now - days * DAY_MS])).all()).results || [];
    return json({ ok: true, days, rows });
  }
  if (route === 'GET /api/admin/find') {   // 按昵称开头找号；不填就列最近动过的
    const key = q('q'), like = key.replace(/[\\%_]/g, m => '\\' + m) + '%';
    const rows = key
      ? await env.DB.prepare("SELECT u.id, u.username, u.created_at, e.ink, e.updated_at FROM users u LEFT JOIN econ e ON e.uid = u.id WHERE u.username LIKE ? ESCAPE '\\' OR u.id = ? ORDER BY length(u.username), u.username LIMIT 20").bind(like, key).all()
      : await env.DB.prepare('SELECT u.id, u.username, u.created_at, e.ink, e.updated_at FROM users u LEFT JOIN econ e ON e.uid = u.id ORDER BY COALESCE(e.updated_at, u.updated_at) DESC LIMIT 20').all();
    return json({ ok: true, users: rows.results || [] });
  }
  if (route === 'GET /api/admin/econ') {   // 一个号的武库存档、处罚、流水、市场记录
    const u = await findUser(q('uid'));
    if (!u) return error('没有这个账号', 404);
    const row = await env.DB.prepare('SELECT state_json, ink, ver, updated_at FROM econ WHERE uid = ?').bind(u.id).first();
    const log = await env.DB.prepare('SELECT at, act, ok, ink0, ink1, detail FROM econ_log WHERE uid = ? ORDER BY id DESC LIMIT 100').bind(u.id).all();
    const mk = await env.DB.prepare('SELECT id, seller, buyer, k, st, price, at, state, done_at, paid FROM mkt WHERE seller = ? OR buyer = ? ORDER BY at DESC LIMIT 60').bind(u.id, u.id).all();
    const pr = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(u.id).first();
    const p = parseProfile(pr ? pr.profile_json : '', u.username);
    return json({ ok: true, uid: u.id, username: u.username, createdAt: u.created_at, econ: row ? { ink: row.ink, ver: row.ver, at: row.updated_at, state: parseObj(row.state_json) } : null,
      profile: { rating: p.rating, placed: p.placed, netWins: p.netWins, netLosses: p.netLosses, skins: cleanSkins(p.skins).length, updatedAt: p.updatedAt },
      sanction: await sanctionOf(env, u.id), log: log.results || [], mkt: mk.results || [] });
  }
  if (route === 'GET /api/admin/audit') {   // 管理员做过的事（谁、什么时候、改了谁、为什么）
    const rows = await env.DB.prepare("SELECT l.at, l.uid, u.username, l.act, l.ink0, l.ink1, l.detail FROM econ_log l LEFT JOIN users u ON u.id = l.uid WHERE l.act IN ('admin', 'restore', 'admin_ban', 'pardon', 'admin_pw', 'gift_new', 'gift_off', 'code_new', 'code_off', 'cfg', 'flag', 'adm_login', 'adm_acct') ORDER BY l.id DESC LIMIT 100").all();
    return json({ ok: true, rows: rows.results || [] });
  }
  if (route === 'POST /api/admin/adjust') {
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    return needWhy() || await adminAdjust(env, u, body, who, why, now);
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
    const rec = await sanctionOf(env, u.id);
    const until = perm ? rec.banUntil : Math.max(rec.banUntil, now + days * DAY_MS), log = rec.log.concat({ r: why.slice(0, 60), at: now, src: 'admin:' + who }).slice(-20);
    await env.DB.prepare('INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0) ON CONFLICT(uid) DO UPDATE SET ban_until = ?3, perm = ?4, log_json = ?5, at = ?6')
      .bind(u.id, rec.strikes, until, perm || rec.perm ? 1 : 0, JSON.stringify(log), now).run();
    await logRow(env, u.id, now, 'admin_ban', 1, null, null, JSON.stringify({ by: who, why, days: perm ? 'perm' : days }));
    return json({ ok: true, uid: u.id, banUntil: until, perm: perm || rec.perm });
  }
  if (route === 'POST /api/admin/pardon') {   // 解封，清空处罚记录（玩家刷新网页后生效）
    const u = await findUser(String(body.uid || '').trim());
    if (!u) return error('没有这个账号', 404);
    const note = why || String(body.note || '').trim().slice(0, 100);
    await env.DB.prepare("INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES (?1, 0, 0, 0, '[]', ?2, ?2) ON CONFLICT(uid) DO UPDATE SET strikes = 0, ban_until = 0, perm = 0, log_json = '[]', at = ?2, pardon = ?2").bind(u.id, now).run();
    await logRow(env, u.id, now, 'pardon', 1, null, null, JSON.stringify({ by: who, why: note }));
    return json({ ok: true, uid: u.id });
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
      .bind(id, uid, b.ink, JSON.stringify({ cases: b.cases, term: b.term, tags: b.tags }), b.note, who, now, until, born).run();
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
        .bind(k, b.ink, JSON.stringify({ cases: b.cases, term: b.term, tags: b.tags }), b.note, who, now, until, uses).run();
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
  return error('Not found', 404);
}

// 管理网页：python3 tools/build.py 打包时把 cloudflare/admin.html 和它那段脚本的 sha256 放进来（直接跑 worker.js 时是空的）。
// 浏览器只许跑 sha256 对得上的那一段脚本：页面里就算混进了别的脚本、onclick 这种，也跑不起来
const ADMIN_PAGE = { html: '', sha: '' };
function adminPage() {
  const html = ADMIN_PAGE.html || '<!doctype html><meta charset="utf-8"><title>刃影管理后台</title><p>管理网页在打包好的 cloudflare/worker.bundle.js 里，先运行 python3 tools/build.py。</p>';
  const script = ADMIN_PAGE.sha ? `'sha256-${ADMIN_PAGE.sha}'` : "'none'";
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; script-src ${script}; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
}

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
  return json({ ok: true, online: (c && c.online) || 0, playing: (c && c.playing) || 0, waiting: (c && c.waiting) || 0, every: 30 });
}

/* ---------- 天魔讨伐：全服一起打一只天魔 ----------
 * 打架在各自的网页里打（90 秒，天魔倒下会再站起来），打完把造成的伤害交上来，扣在全服同一只天魔的血上。
 * 出战先领票（gboss_try），交伤害时把这张票改成“交过了”、扣天魔的血、记个人伤害放在同一批写入里：同一张票重交、
 * 网络重试、刷新后补交都只算一次；两个人同时打出最后一下，只有一个扣得动（hp > 0 才扣），另一个记 0。
 * 伤害上限：一张票最多 GB_TRY_MAX，而且不超过 (出战到现在的秒数 - 3) × GB_DPS。票一小时内不交就作废。
 * 一代天魔活 GB_LIFE，到时没打死就遁走；结束后按伤害发奖励（写进 gift 表，玩家下次动武库自动领），再出下一代。 */
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
 * 所以这里的数只用来展示，不拿去发奖励。 */
const LB_N = 100, RK_PLACE = 5, RK_MIN = 1000, RK_MAX = 25000;
async function leaderboard(env, kind, season, me, now) {
  const notBanned = 'id NOT IN (SELECT uid FROM sanctions WHERE perm = 1 OR ban_until > ?1)';
  if (kind === 'rank') {
    if (!/^S\d{1,3}$/.test(season)) return { ok: true, kind, list: [] };
    const rows = (await env.DB.prepare(
      `SELECT id, username, json_extract(profile_json, '$.rk.pts') AS pts FROM users WHERE ${notBanned}
       AND json_extract(profile_json, '$.rk.season') = ?2 AND json_extract(profile_json, '$.rk.placed') >= ?3
       ORDER BY pts DESC, updated_at LIMIT ?4`).bind(now, season, RK_PLACE, LB_N).all()).results || [];
    return { ok: true, kind, list: rows.map(r => ({ name: r.username, pts: Math.max(RK_MIN, Math.min(RK_MAX, Math.round(+r.pts || 0))), me: r.id === me })) };
  }
  const [rows, cnt] = await Promise.all([
    env.DB.prepare(
      `SELECT id, username, json_extract(profile_json, '$.netWins') AS w, json_extract(profile_json, '$.netLosses') AS l FROM users WHERE ${notBanned}
       AND json_extract(profile_json, '$.netWins') > 0 ORDER BY w DESC, l, updated_at LIMIT ?2`).bind(now, LB_N).all(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(),
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

/* ---------- 江湖共斗 · 开放世界（/api/world/line/N，WebSocket） ----------
   一条分线 = 一个 Durable Object（WorldLine）。妖物和妖王由服务器每秒模拟 10 次；每位侠客只在自己的网页里模拟，
   服务器只收「我在哪、在做什么、打中了哪只妖物多少伤害」，伤害按距离和每秒上限封顶，改网页也刷不动。
   妖物出招时广播一条攻击，打没打中由挨打的那个网页自己判定（跟斩妖列传里一样能格挡、能闪）。
   每线最多 WL.CAP 人，满了网页自动去下一线，线数不设上限；每次只发视野内（左右 WL.AOI）最近的 WL.NEAR 位侠客。
   免费额度：网页发上来的消息 20 条算一次请求，发下去的不算；没人时停掉定时器，Durable Object 自动休眠不计时。 */
const WL = {
  CAP: 40, W: 8000, WALL: 60, TICK: 100, AOI: 2000, NEAR: 24, AGGRO: 700, IDLE: 15e3,
  HIT_MAX: 160, HIT_RANGE: 420, DPS: 320, BURST: 900,   // 单次伤害上限、离妖物多远还算打得到、每秒伤害上限和攒着的上限
  BOSS_EVERY: 40, BOSS_LIFE: 360,                         // 全线每斩 40 只妖物，魔窟里出一次妖王；6 分钟没打死就遁走
  ZONES: [
    { a: 60, b: 2000, hp: 1, dk: 1, keys: ['blade', 'archer', 'owl'] },                          // 竹林
    { a: 2000, b: 4000, hp: 1.5, dk: 1.25, keys: ['blade', 'archer', 'owl', 'binder'] },         // 古道
    { a: 4000, b: 6000, hp: 2.2, dk: 1.5, keys: ['blade', 'archer', 'binder', 'caster'] },       // 山寨
    { a: 6000, b: 7940, hp: 3, dk: 1.8, keys: ['blade', 'archer', 'owl', 'binder', 'caster'] },  // 魔窟
  ],
  MON: { blade: { hp: 40, spd: 150, keep: 70 }, archer: { hp: 30, spd: 120, keep: 380 }, binder: { hp: 34, spd: 90, keep: 260 }, caster: { hp: 32, spd: 100, keep: 320 }, owl: { hp: 24, spd: 220, keep: 0 } },
};
/* 全服肉鸽：每条分线一份共享进程。一轮 RG.JIE 劫，每劫全线斩够妖物后投票选一卷秘卷，全线共享；第 RG.JIE 劫斩够后进关键战。
   关键战：线上真人（按账号去重，游客按连接）够 RG.BOSS_MIN 人打天道 Boss（每人在自己网页里打同一只融魂魔首，血量全线共享，
   以服务器为准）。打赢了，够资格的云端账号由服务器写进 gift 表发一件随机星座皮肤（下次动武库自动领）。
   奖励相关的数都在 RG 里，改这里就行。 */
const RG = {
  JIE: 5, VOTE_T: 15, PERK_MAX: 8, EMPTY_RESET: 10 * 60e3,
  NEED0: 20, NEED_PER: 5, NEED_MAX: 150, CYC_HP: 0.15, CYC_HP_MAX: 3,   // 每劫要斩几只：20 + 每人 5 只；每过一轮妖物血量 +15%
  BOSS_MIN: 3, BOSS_HP: 1500, BOSS_T: 180,                              // 几个真人打 Boss、Boss 每人份的血、限时（秒）
  TRIO_T: 420,                                                          // 真人不够时改打 3 位天道 AI 的车轮战，限时（秒）
  KEY_DPS: 90, KEY_HIT_MAX: 600,                                        // 关键战伤害封顶：开战秒数 × 每秒上限，一次最多交多少
  ZOD_PER_DAY: 1, MIN_AGE_H: 24, MIN_JIE: 3, MIN_SHARE: 0.25, INK: 200, // 星座皮肤：每号每天几件、注册满几小时、这一轮至少在场几劫、伤害至少平均份额的几成、附带墨锭
  // 可以抽到的秘卷：src/game/22-scrolls.js 里不分侠客的凡品、精品、绝品（tools/world-test.mjs 会核对这些编号都还在）
  PERKS: ['ink_resonance', 'storm_wrath', 'air_burst', 'ink_blade', 'first_blood', 'executioner', 'giant_slayer', 'crescendo', 'heavy_hand', 'needle_rain', 'counter_master', 'backstab', 'sniper', 'brawler', 'momentum', 'crit_eye', 'lethal_rhythm', 'sunder', 'double_strike', 'shockwave', 'ult_amp', 'piercing_wind', 'golden_bell', 'parry_refresh', 'iron_skin', 'thorns', 'last_stand', 'guard_wall', 'retaliation', 'second_wind', 'evasion', 'stone_stance', 'aegis', 'counter_guard', 'jg_window', 'meditation', 'bulwark', 'proj_ward', 'ult_resist', 'after_armor', 'lifeline', 'recoil_guard', 'thunder_dash', 'sky_master', 'swift_feet', 'phantom_step', 'jump_guard', 'dash_strike', 'aerial_ace', 'feather_fall', 'jg_blink', 'wind_runner', 'dash_cd', 'slipstream', 'air_reset', 'ground_slam', 'escape_meter', 'sidestep', 'light_cdr', 'skill_echo', 'haste', 'ult_cdr', 'alternate', 'break_reset', 'hurt_cdr', 'full_meter_cdr', 'low_hp_haste', 'patient_power', 'jg_escape', 'combo_cdr', 'link_skill', 'opening_haste', 'cd_shield', 'flow_combo', 'meter_start', 'meter_block', 'meter_drain', 'meter_heal', 'ult_refund', 'meter_power', 'jg_meter', 'meter_shield', 'overflow', 'meter_bank', 'foe_meter_cut', 'ult_heal', 'guard_regen', 'fury', 'full_hp', 'berserker', 'far_reach', 'wall_pin', 'clutch', 'opener', 'untouched', 'juggler', 'low_leech', 'stance_switch', 'stun_bonus', 'block_punish', 'full_meter_foe', 'odd_even', 'heat', 'frost_lock', 'bleed_rend', 'venom', 'virulent', 'ignite', 'wildfire', 'shatter', 'hemorrhage', 'marked_prey', 'static', 'weaken', 'expose', 'root_strike', 'plague', 'cauterize', 'toxic_guard', 'frost_aura', 'chill_proj', 'frost_armor', 'deep_freeze', 'chain_lightning', 'thunder_mark', 'overcharge', 'storm_guard', 'charge_break', 'proj_absorb', 'listen_wind', 'skill_heal', 'guard_crush', 'after_skill_light', 'pressure', 'escape_strike', 'jg_heal'],
};
const rgNew = () => ({ cyc: 1, jie: 1, got: 0, need: RG.NEED0, perks: [], vote: null, key: null, seq: 0 });
const ZOD_KEYS = () => Object.keys(C.ITEM).filter(k => C.ITEM[k].col === 'c8');
const wlNum = (v, lo, hi, d = 0) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
const wlStr = v => (typeof v === 'string' && /^[a-z0-9_]{0,16}$/i.test(v) ? v : '');
const wlName = (v, id) => (String(v || '').match(/[\w\u4e00-\u9fff]/g) || []).join('').slice(0, 12) || `游侠${id}`;   // 没登录的显示成「游侠 + 编号」，好分清
const r1 = v => Math.round(v * 10) / 10;

class WorldSim {
  constructor(rnd = Math.random) {
    this.rnd = rnd; this.t = 0; this.players = new Map(); this.mons = []; this.nid = 1; this.mid = 1;
    this.kills = 0; this.sinceBoss = 0; this.boss = null; this.spawnT = 0; this.events = [];
    this.run = rgNew(); this.rewards = []; this.dirty = false;
  }
  get count() { return this.players.size; }
  join(meta) {
    if (this.players.size >= WL.CAP) return 0;
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
      this.boss = null; this.sinceBoss = 0;
    } else {
      this.sinceBoss++;
      this.events.push({ t: 'x', m: m.id, by: p.id, x: m.x });
      const R = this.run;
      if (!R.vote && !R.key && R.got < R.need) { R.got++; if (R.got >= R.need) this.jieDone(); }
    }
  }
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
    };
  }
  /* ---------- 全服肉鸽的共享进程 ---------- */
  real() { return new Set([...this.players.values()].map(p => p.uid || 'g' + p.id)).size; }
  needOf() { return Math.min(RG.NEED_MAX, RG.NEED0 + RG.NEED_PER * this.players.size); }
  rgView(id) {
    const R = this.run, v = R.vote, k = R.key, me = this.players.get(id);
    return {
      c: R.cyc, j: R.jie, g: R.got, nd: R.need, pk: R.perks, n: this.real(),
      v: v ? { o: v.opts, u: Math.max(0, Math.ceil(v.until - this.t)), n: v.opts.map((_, i) => Object.values(v.votes).filter(x => x === i).length), my: v.votes[id] === undefined ? -1 : v.votes[id] } : null,
      k: k ? { kind: k.kind, s: k.seq, h: k.heroes, hp: Math.ceil(k.hp), mh: k.mh, u: Math.max(0, Math.ceil(k.until - this.t)), my: me ? Math.round(me.keyDmg) : 0 } : null,
    };
  }
  // 这一劫斩够了：在场的人都记一劫；还没到最后一劫就投票选秘卷，到了就开关键战
  jieDone() {
    const R = this.run;
    for (const p of this.players.values()) p.jies++;
    if (R.jie < RG.JIE) this.startVote(); else this.startKey();
    this.dirty = true;
  }
  startVote() {
    const pool = RG.PERKS.filter(id => !this.run.perks.includes(id)), opts = [];
    while (opts.length < 3 && pool.length) opts.push(pool.splice((this.rnd() * pool.length) | 0, 1)[0]);
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
    this.events.push({ t: 'rp', pick, perks: R.perks, j: R.jie, all: true });
    this.dirty = true;
  }
  // 最后一劫斩完开关键战：线上真人够 RG.BOSS_MIN 位打天道 Boss（血量全线共享，赢了发星座皮肤）；
  // 不够就各自打一场 3v3 车轮战，对面是 3 位天道 AI（不发皮肤）。两种打完秘卷都保留，进下一轮
  startKey() {
    const R = this.run, n = this.real(), boss = n >= RG.BOSS_MIN;
    const bag = C.HERO_IDS.slice(), heroes = [];
    while (heroes.length < 3) heroes.push(bag.splice((this.rnd() * bag.length) | 0, 1)[0]);
    const mh = boss ? RG.BOSS_HP * n : 0, T = boss ? RG.BOSS_T : RG.TRIO_T;
    R.key = { kind: boss ? 'boss' : 'trio', seq: ++R.seq, heroes, mh, hp: mh, t0: this.t, until: this.t + T, dmg: {}, in: {}, rep: {} };
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
    R.key = null; R.cyc++; R.jie = 1; R.got = 0; R.need = this.needOf();   // 秘卷保留，下一轮
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
  saveRun() { const R = this.run; return { cyc: R.cyc, jie: R.jie, got: R.got, need: R.need, perks: R.perks.slice(), seq: R.seq, at: Date.now() }; }
  loadRun(o) {
    if (!o || Date.now() - (+o.at || 0) > RG.EMPTY_RESET) return;
    const R = this.run;
    R.cyc = wlNum(o.cyc, 1, 1e6, 1) | 0; R.jie = wlNum(o.jie, 1, RG.JIE, 1) | 0; R.got = wlNum(o.got, 0, RG.NEED_MAX, 0) | 0; R.need = wlNum(o.need, 1, RG.NEED_MAX, RG.NEED0) | 0;
    if (R.got >= R.need) R.got = R.need - 1;   // 存档时正在打关键战（关键战不存）：再斩一只就重开
    R.perks = Array.isArray(o.perks) ? o.perks.filter(id => RG.PERKS.includes(id)).slice(-RG.PERK_MAX) : []; R.seq = wlNum(o.seq, 0, 1e9, 0) | 0;
  }
  // 这一拍的事件谁该收到：全线播报的人人都收，其余只发给附近的侠客
  takeEvents() { const e = this.events; this.events = []; return e; }
  wants(id, ev) { const me = this.players.get(id); return !!me && (ev.all || ev.x === undefined || Math.abs(ev.x - me.x) <= WL.AOI + 300); }
}

export class WorldLine {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sim = new WorldSim(); this.timer = 0; this.emptyAt = 0;
    if (ctx.storage && ctx.blockConcurrencyWhile) ctx.blockConcurrencyWhile(async () => { try { this.sim.loadRun(await ctx.storage.get('run')); } catch (e) {} });
  }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const line = wlNum(new URL(request.url).pathname.split('/').pop(), 1, 9999, 1) | 0;
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ line, id: 0 });
    if (this.ctx.getWebSockets().length > WL.CAP) { this.send(server, { t: 'full', line }); server.close(4001, 'full'); }
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
      if (a.id && sim.players.has(a.id)) { ws.serializeAttachment(a); return; }
      const id = sim.join(o);
      if (!id) { this.send(ws, { t: 'full', line: a.line }); ws.close(4001, 'full'); return; }
      if (sim.players.size === 1 && this.emptyAt && Date.now() - this.emptyAt > RG.EMPTY_RESET) sim.run = rgNew();   // 整条线空了很久：进度清零
      a.id = id; ws.serializeAttachment(a);
      if (o.tk && this.env && this.env.DB) this.auth(id, String(o.tk).slice(0, 200));
      const roster = [...sim.players.values()].map(p => sim.meta(p));
      this.send(ws, { t: 'w', id, line: a.line, cap: WL.CAP, w: WL.W, roster });
      sim.events.push({ t: 'j', p: sim.meta(sim.players.get(id)), all: true });
      this.ensureTimer();
      return;
    }
    ws.serializeAttachment(a);
    if (!a.id || !sim.players.has(a.id)) { this.send(ws, { t: 're' }); return; }   // 服务器重启过：请网页重新打个招呼
    if (o.t === 's') sim.state(a.id, o);   // 位置和这一拍打出的伤害一起上报（h: [[妖物编号, 伤害], ...]），省一半消息
    if ((o.t === 's' || o.t === 'h') && Array.isArray(o.h)) for (const h of o.h.slice(0, 12)) if (Array.isArray(h)) sim.hit(a.id, +h[0], +h[1]);
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
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment(); if (!a || !a.id) continue;
      if (!sim.players.has(a.id)) { this.send(ws, { t: 're' }); continue; }
      const fr = sim.frameFor(a.id), mine = evs.filter(e => sim.wants(a.id, e));
      if (mine.length) fr.e = mine;
      this.send(ws, fr);
    }
    if (!sim.players.size) { clearInterval(this.timer); this.timer = 0; this.emptyAt = Date.now(); if (this.ctx.storage) this.ctx.storage.put('run', sim.saveRun()).catch(() => {}); }   // 没人了：停表，让它休眠
  }
}
globalThis.RenyingWorldSim = { WorldSim, WL, RG };

export default {
  fetch: withCors,
};

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
        const n = Math.max(1, Math.min(9999, +wm[1] || 1));
        return env.WORLD.get(env.WORLD.idFromName('line-' + n)).fetch(request);
      }

      // 1. Health & ping check
      if (path === '/' || path === '/health' || path === '/api/health') {
        return json({ ok: true, name: 'RenYing Cloud API', time: now, econ: C.VER });
      }
      if (path === '/admin' || path === '/admin/') return adminPage();

      await ensureSchema(env);
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
        const initialProf = cleanInitial((body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)) ? body.profile : newProfile(username, now));
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
          'SELECT id, username, password_hash, salt, password_algo, profile_json FROM users WHERE username = ?'
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

      // 6. 武库：开箱、买卖、汰换……
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
