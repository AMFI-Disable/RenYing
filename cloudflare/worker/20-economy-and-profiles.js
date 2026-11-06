
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
      // 每个号只领一次：领过以后卖掉、熔铸掉的不再补（不然卖了再领就是凭空变墨锭）
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
    const mkt = { id: randHex(8), ids: act === 'listDupes' ? Array.from({ length: C.LIST_BATCH }, () => randHex(8)) : null, row: null, out: null };
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
      if (code) {   // 兑换码里的东西也先放进去
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
    const detail = logDetail({ a: args, r: res.err ? res.err : res.item ? itemRef(res.item) : res.gain || res.price || '', n: act === 'openAll' && res.items ? res.items.length : undefined, cases: act === 'openAll' ? res.cases : undefined, s: out.sold.length || undefined, b: out.back ? out.back.length : undefined, ...moved });
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
 * 没有 prog 的存档（老版本网页）：报上来的绝对数不认，计数留在服务器上那份（不然能把进度退回去重新领）。 */
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
      if (!PG_KEY.test(k) || !Number.isFinite(n) || n === 0 || Math.abs(n) > PG_STEP || (n < 0 && !k.startsWith('frags.'))) continue;
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
// 口令对的话给出是谁：「名字:口令」里的名字；只写了一个口令就是 admin