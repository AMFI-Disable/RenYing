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
 * 所以这里的数只用来展示，不拿去发奖励。 */
const LB_N = 100, RK_PLACE = 3, RK_MIN = 1000, RK_MAX = 25000;
async function leaderboard(env, kind, season, me, now) {
  const notBanned = 'deleted_at = 0 AND id NOT IN (SELECT uid FROM sanctions WHERE perm = 1 OR ban_until > ?1)';
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
       AND json_extract(profile_json, '$.netWins') > 0 ORDER BY w DESC, l, updated_at LIMIT ?2`).bind(now, LB_N).all(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE deleted_at = 0').first(),
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
const r1 = v => Math.round(v * 10) / 10;