

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

/* ---------- 匿名游玩统计 ----------
 * 网页每次打开、走新手教学、开一局时报一下（POST /api/stats，不用登录，游客也算）。
 * 不存名字、账号、邮箱、IP：网页在本机存一个随机编号（renying-anon-id），服务器加盐再算一次哈希才存，只用来去重和算留存。
 * 设置里可以关掉；离线版不报。管理网页「游玩统计」看：每天多少人、新玩家第 2 天 / 第 7 天还回不回来、各模式开了多少局、教学走到哪。
 * 每个 IP 一小时最多 120 次、全服一小时最多 20000 次，多出来的直接丢（统计不能把数据库写爆）。 */
const STAT_EVENTS = ['open', 'tut_start', 'tut_done', 'tut_skip'];
const STAT_MODES = ['cpu', 'tag3', 'tower', 'chaos', 'mayhem', 'maps', '2v2', 'watch2v2', 'saga', 'stage', 'train', 'raid', 'world', 'boss', 'net', 'netrk', 'pvp', 'replay', 'qfx'];
const statKeyOk = k => typeof k === 'string' && (STAT_EVENTS.includes(k) || (k.startsWith('m:') && STAT_MODES.includes(k.slice(2))));
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

/* ---------- 天魔讨伐：全服一起打一只天魔 ----------
 * 打架在各自的网页里打（90 秒，天魔倒下会再站起来），打完把造成的伤害交上来，扣在全服同一只天魔的血上。
 * 出战先领票（gboss_try），交伤害时把这张票改成“交过了”、扣天魔的血、记个人伤害放在同一批写入里：同一张票重交、
 * 网络重试、刷新后补交都只算一次；两个人同时打出最后一下，只有一个扣得动（hp > 0 才扣），另一个记 0。
 * 伤害上限：一张票最多 GB_TRY_MAX，而且不超过 (出战到现在的秒数 - 3) × GB_DPS。票一小时内不交就作废。
 * 一代天魔活 GB_LIFE，到时没打死就遁走；结束后按伤害发奖励（写进 gift 表，玩家下次动武库自动领），再出下一代。 */