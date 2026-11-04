
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