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
const CODE_LOCAL = ['LOCK', 'RELOCK', 'RENYING666', 'RENYING888', 'SWORD2026', 'MOYUGIFT', 'ZODIAC2026STAR'];
// 以前不进库存的“绑定”皮肤（关卡奖励、老账号带过来的）：这一天之前建的号，第一次动武库时一次性换成库存里的饰品，
// 之后能卖能熔铸。之后建的号不换：网页报上来的皮肤服务器核对不了，换成能卖的饰品就等于能凭空变出墨锭
const LEGACY_CUTOFF = Date.UTC(2026, 9, 31);
// 写在游戏里的兑换码：源码公开，等于人人都能领，已全部作废（名字留在 CODE_LOCAL 里，后台也建不了同名的）
const CODE_BUILTIN = {};
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
// 这一列已经有了吗（读不了表结构时返回 null，由调用的地方单独试一次 ALTER）