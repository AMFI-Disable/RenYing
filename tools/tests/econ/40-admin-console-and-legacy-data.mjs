// 武库经济测试第 40 段：由 tools/tests/econ-test.mjs 按文件名顺序拼起来，和前面几段共用同一个本机 Worker 和数据库。
//
// 本段的小节（共 7 节，测试失败时按小节标题搜）：
//    1. 管理后台的查询：总览、找号、操作记录、饰品目录
//    2. 管理网页：Worker 的 /admin；浏览器只许跑网页里那一段脚本
//    3. 以前的绑定皮肤：老号第一次动武库时换成库存里的饰品（只换一次），能卖；之后建的号、之后报上来的不换；星座码每个号只领一次
//    4. 规则核心：冻结、坏存档自愈
//    5. 全服肉鸽 · 天道 Boss 的星座皮肤：服务器核对账号后写进 gift 表，下次动武库领到；游客、新号、伤害不够、被封的没有；每号每天一件，同时发、同时领都不多
//    6. 玩家市场挂单到期：挂太久没卖出的自动撤下，饰品退回卖家；到期的买不了；同时挂的单数以服务器为准
//    7. 找回饰品：管理后台按流水查出“拿到过、现在没有”的饰品，写明是哪一步没的；只有去向不明、管理员收走的能找回，找回一次
section('管理后台的查询：总览、找号、操作记录、饰品目录');
{
  const st = await adm('GET', '/api/admin/stats');
  ok(st.ok && st.users === row('SELECT COUNT(*) AS n FROM users').n && st.inkTotal === row('SELECT SUM(ink) AS n FROM econ').n && st.accounts === row('SELECT COUNT(*) AS n FROM econ').n, '总览：注册数、武库存档数、全服墨锭对得上', st);
  const f1 = await adm('GET', '/api/admin/find?q=gift');
  ok(f1.ok && f1.users.length === 2 && f1.users.every(u => u.username.startsWith('giftee')), '按昵称开头找', f1.users.map(u => u.username));
  const f2 = await adm('GET', '/api/admin/find?q=' + encodeURIComponent('%')), f3 = await adm('GET', '/api/admin/find?q=_');
  ok(f2.users.length === 0 && f3.users.length === 0, '搜 % 和 _ 不会变成通配符');
  ok((await adm('GET', '/api/admin/find')).users.length === 20, '不填就列最近动过的 20 个');
  const cat = await adm('GET', '/api/admin/catalog');
  ok(cat.ok && cat.items.length === Object.keys(C.ITEM).length && cat.cols.length === 8 && cat.tiers.length === 5 && cat.cfg.length === C.CFG_INFO.length && cat.items.every(x => C.charOf(x.k) === x.char && C.ITEM[x.k].col === x.col), `饰品目录：${cat.items.length} 款饰品、8 个武器箱、5 档品质、能改的数值`);
  const au = await adm('GET', '/api/admin/audit'), acts = new Set(au.rows.map(r => r.act));
  ok(au.ok && ['admin', 'admin_ban', 'pardon', 'admin_pw', 'gift_new', 'gift_off', 'code_new', 'code_off', 'cfg'].every(a => acts.has(a)) && au.rows.every(r => !!(parseDetail(r.detail).by)), '操作记录：九种管理员操作都在，每条都写着是谁', [...acts]);
  ok(au.rows.some(r => r.uid === '*' && r.act === 'cfg') && !acts.has('open') && !acts.has('ledger') && !acts.has('gift_got') && !acts.has('code_got'), '全服的记在“全服”名下；玩家自己的操作不混进来');

  // 错误报告与导出：测试客户端上报错误、查看错误、导出单文件调试日志 (JSON 和 Markdown)
  await call('POST', '/api/err', { k: 'client', msg: 'TypeError: test err', src: 'src/game.js:100', stack: 'Error at test', meta: { ver: 1, mode: 'local' } });
  const errView = await adm('GET', '/api/admin/errors');
  ok(errView.ok && errView.rows.length >= 1 && errView.rows.some(r => r.msg.includes('TypeError: test err')), '管理后台错误列表能看到上报的错误');

  const expJsonRes = await worker.fetch(new Request('https://w.test/api/admin/errors/export', { headers: { Authorization: 'Bearer ' + ADMIN } }), ENV, { waitUntil() {} });
  const expJson = await expJsonRes.json();
  ok(expJsonRes.status === 200 && expJson.report && expJson.report.scope.total_signatures >= 1 && expJson.errors.some(e => e.message.includes('TypeError: test err')), '导出调试文件 (JSON) 包含诊断概览与完整错误信息', expJson.report);

  const expMdRes = await worker.fetch(new Request('https://w.test/api/admin/errors/export?format=md', { headers: { Authorization: 'Bearer ' + ADMIN } }), ENV, { waitUntil() {} });
  const expMd = await expMdRes.text();
  ok(expMdRes.status === 200 && expMd.includes('# 刃影 (RenYing) 错误诊断报告') && expMd.includes('TypeError: test err'), '导出调试文件 (Markdown) 包含 Markdown 格式诊断报告');

  // 匿名游玩统计：不用登录；只认白名单里的事件；编号只存加盐哈希；管理网页能看到每天人数、新玩家留存和各模式局数
  {
    const bad = await call('POST', '/api/stats', { vid: 'x', ev: ['open'] });
    ok(!bad.ok, '匿名统计：编号格式不对就拒绝', bad);
    const s1 = await call('POST', '/api/stats', { vid: 'statsvid000000001', ev: ['open', 'm:cpu', 'm:cpu', 'm:hack', 'drop table', 'tut_start', 'tut_done'] }, null, '9.9.9.1');
    ok(s1.ok && s1.kept, '匿名统计：游客也能报', s1);
    const day = Math.floor((T + 8 * 3600e3) / 86400000);
    const cnt = k => (row('SELECT n FROM play_counts WHERE day = ? AND k = ?', day, k) || {}).n || 0;
    ok(cnt('open') === 1 && cnt('m:cpu') === 2 && cnt('tut_done') === 1 && !row("SELECT 1 AS x FROM play_counts WHERE k = 'm:hack' OR k = 'drop table'"), '匿名统计：白名单以外的事件不记', { open: cnt('open'), cpu: cnt('m:cpu') });
    ok(!row("SELECT 1 AS x FROM play_visitors WHERE vid = 'statsvid000000001'") && row('SELECT COUNT(*) AS n FROM play_visitors').n >= 1, '匿名统计：数据库里没有网页给的原始编号（只有加盐哈希）');
    const vid = row('SELECT vid FROM play_days WHERE day = ? LIMIT 1', day).vid;
    // 造一个“昨天第一次来、今天又来了”的玩家，看第 2 天留存
    ENV.DB.raw.prepare('INSERT INTO play_visitors (vid, first_day, last_day) VALUES (?, ?, ?)').run('cohortvid', day - 1, day);
    ENV.DB.raw.prepare('INSERT INTO play_days (day, vid) VALUES (?, ?), (?, ?)').run(day - 1, 'cohortvid', day, 'cohortvid');
    const ps = await adm('GET', '/api/admin/playstats?days=7');
    const y = ps.rows.find(r => r.day === day - 1), t = ps.rows.find(r => r.day === day);
    ok(ps.ok && ps.rows.length === 7 && y.fresh === 1 && y.back1 === 1 && y.back7 === null && t.players >= 2 && t.ev['m:cpu'] === 2 && t.back1 === null && !!vid, '管理网页游玩统计：每天人数、第 2 天留存、各模式局数', { y, t });
    let kept = 0;
    for (let i = 0; i < 125; i++) if ((await call('POST', '/api/stats', { vid: 'statsflood0000001', ev: ['open'] }, null, '9.9.9.2')).kept) kept++;
    ok(kept === 120, '匿名统计：同一个 IP 一小时最多记 120 次', kept);
  }

  // 统计 2.0：7日墨锭收支趋势、开箱分布、在线计数
  ok(Array.isArray(st.inkFlow7d) && st.inkFlow7d.length >= 1 && typeof st.caseCounts7d === 'object' && typeof st.online === 'number', '总览 2.0：包含 7 日墨锭收支趋势与 7 日开箱统计', st.inkFlow7d);

  // 玩家多列排序与筛选项
  const sortInk = await adm('GET', '/api/admin/find?sort=ink&dir=desc&limit=5');
  ok(sortInk.ok && sortInk.users.length >= 2 && sortInk.users[0].ink >= sortInk.users[1].ink, '玩家列表支持按墨锭降序排序');
  const sortName = await adm('GET', '/api/admin/find?sort=username&dir=asc&limit=5');
  ok(sortName.ok && sortName.users.length >= 2 && sortName.users[0].username.toLowerCase() <= sortName.users[1].username.toLowerCase(), '玩家列表支持按昵称升序排序');
  const fltAct = await adm('GET', '/api/admin/find?filter=active24h');
  ok(fltAct.ok && Array.isArray(fltAct.users), '玩家列表支持 24h 活跃筛选');

  // 错误单条删除与批量清理
  const targetSig = errView.rows[0].sig;
  const delErr = await adm('POST', '/api/admin/errors/delete', { sig: targetSig, why: '测试单条清除' });
  ok(delErr.ok && delErr.deleted === 1, '管理后台支持按签名删除单条错误记录', delErr);

  // 玩家单人快照导出、强制下线设备、清理历史流水
  const sampleUid = sortInk.users[0].id;
  const pExpRes = await worker.fetch(new Request('https://w.test/api/admin/player/export?uid=' + encodeURIComponent(sampleUid), { headers: { Authorization: 'Bearer ' + ADMIN } }), ENV, { waitUntil() {} });
  const pExp = await pExpRes.json();
  ok(pExpRes.status === 200 && pExp.user && pExp.user.id === sampleUid && Array.isArray(pExp.recent_log), '导出单个玩家完整 JSON 快照成功');
  const dropDev = await adm('POST', '/api/admin/player/devices/drop', { uid: sampleUid, dev: 'all', why: '测试踢下线' });
  ok(dropDev.ok, '强制踢下玩家设备会话成功');
  const clrHist = await adm('POST', '/api/admin/player/clear-history', { uid: sampleUid, kind: 'auth_log', why: '测试清理登录历史' });
  ok(clrHist.ok && typeof clrHist.deleted === 'number', '清理玩家指定历史记录成功');

  // 世界共斗与数据库维护接口
  const maint = await adm('GET', '/api/admin/maint');
  ok(maint.ok && maint.tables && Object.keys(maint.tables).length === 33 && maint.gboss && maint.chron, '世界与维护看板：返回全部 33 张数据表行数、天魔状态与岁史状态');
  const wAct1 = await adm('POST', '/api/admin/world/act', { op: 'gboss_hp', hp: 123456, maxHp: 500000, why: '测试调天魔血量' });
  ok(wAct1.ok && wAct1.gboss && wAct1.gboss.hp === 123456 && wAct1.gboss.max_hp === 500000, '世界调控：调整天魔血量成功', wAct1);
  const wAct2 = await adm('POST', '/api/admin/world/act', { op: 'gboss_reroll', why: '测试重随词缀' });
  ok(wAct2.ok && wAct2.gboss && wAct2.gboss.affix, '世界调控：重随天魔词缀成功');
  const wAct3 = await adm('POST', '/api/admin/world/act', { op: 'chron_advance', why: '测试推进岁史' });
  ok(wAct3.ok && wAct3.chron && wAct3.chron.node >= 1, '世界调控：推进全服岁史节点成功', wAct3);
  const pruneRes = await adm('POST', '/api/admin/maint/prune', { target: 'expired', why: '测试清理过期缓存' });
  ok(pruneRes.ok && typeof pruneRes.deleted === 'number', '数据库维护：清理过期数据表成功');

  // 审计日志按类型筛选与智能归档摘要 (adm_digest)
  const compactRes = await adm('POST', '/api/admin/audit/compact', { olderThanDays: 0, why: '测试按天智能归档管理记录' });
  ok(compactRes.ok && compactRes.compacted >= 5 && compactRes.days >= 1, '管理员操作记录智能归档：成功折叠多条记录为每日摘要', compactRes);
  const digestAudit = await adm('GET', '/api/admin/audit?act=adm_digest');
  ok(digestAudit.ok && digestAudit.rows.length >= 1 && digestAudit.rows[0].act === 'adm_digest' && parseDetail(digestAudit.rows[0].detail).n >= 5, '按 act=adm_digest 筛选可查到结构化每日归档摘要', digestAudit.rows[0]);

  // Filtering applies before pagination, even beyond the newest 200 records; paging must not delete history.
  const fixtureStart = row('SELECT COALESCE(MAX(id), 0) AS n FROM econ_log').n;
  const insertAudit = ENV.DB.raw.prepare("INSERT INTO econ_log (uid, at, act, ok, detail) VALUES ('*', ?, 'adm_login', 1, ?)");
  for (let i = 0; i < 205; i++) insertAudit.run(T + i, JSON.stringify({ by: i === 0 ? 'old-filter-test' : 'page-test', why: 'preserve this note' }));
  const firstPage = await adm('GET', '/api/admin/audit?act=adm_login&by=page-test');
  const secondPage = await adm('GET', '/api/admin/audit?act=adm_login&by=page-test&before=' + firstPage.nextBefore);
  const oldFiltered = await adm('GET', '/api/admin/audit?act=adm_login&by=old-filter-test');
  ok(firstPage.rows.length === 100 && secondPage.rows.length === 100 && firstPage.rows[99].id > secondPage.rows[0].id && oldFiltered.rows.length === 1 && parseDetail(oldFiltered.rows[0].detail).why === 'preserve this note', '审计历史按筛选条件分页，不丢失旧记录或原因');
  const groups = await adm('GET', '/api/admin/audit/groups?act=adm_login&by=page-test');
  const group = groups.groups[0];
  const groupRows = await adm('GET', '/api/admin/audit?act=adm_login&by=page-test&day=' + group.day + '&snapshot=' + groups.snapshot);
  const groupNext = await adm('GET', '/api/admin/audit?act=adm_login&by=page-test&day=' + group.day + '&snapshot=' + groups.snapshot + '&before=' + groupRows.nextBefore);
  ok(groups.groups.length === 1 && group.n === 204 && groupRows.rows.length === 100 && groupNext.rows.length === 100 && groupRows.rows[99].id > groupNext.rows[0].id && parseDetail(groupRows.rows[0].detail).why === 'preserve this note', '同一天同一类型跨全部记录合并，展开分页保留每条原因');
  ENV.DB.raw.prepare("INSERT INTO econ_log (uid, at, act, ok, detail) VALUES ('*', ?, 'future_admin_action', 1, ?)").run(T, JSON.stringify({ by: 'future-admin', why: 'new action' }));
  const future = await adm('GET', '/api/admin/audit/groups?act=future_admin_action');
  ok(future.groups.length === 1 && future.groups[0].n === 1, '带管理员身份的新操作类型也会自动合并');
  const older = insertAudit.run(T - 3 * 86400e3, JSON.stringify({ by: 'page-test', why: 'old timestamp' })).lastInsertRowid;
  const timed = await adm('GET', '/api/admin/audit?act=adm_login&by=page-test&order=time');
  const timedNext = await adm('GET', '/api/admin/audit?act=adm_login&by=page-test&order=time&before=' + timed.nextBefore + '&beforeAt=' + timed.nextBeforeAt);
  ok(timed.rows[0].id !== older && timed.rows[99].at > timedNext.rows[0].at && timed.rows[0].at > timed.rows[99].at, '操作记录按实际时间排序并分页，而不是按插入编号排序');
  ENV.DB.raw.prepare("INSERT INTO econ_log (uid, at, act, ok, detail) VALUES ('*', ?, 'admin', 1, 'not-json')").run(T);
  ENV.DB.raw.prepare("INSERT INTO econ_log (uid, at, act, ok, detail) VALUES ('*', ?, 'open', 1, ?)").run(T, JSON.stringify({ why: 'player action' }));
  const end = row('SELECT MAX(id) AS n FROM econ_log').n;
  let after = fixtureStart, total = 0, skipped = 0, batches = 0;
  do {
    const r = await adm('POST', '/api/admin/audit/reset-reasons', { after, snapshot: end, why: '测试恢复默认原因' });
    if (!r.ok) throw new Error('audit reset failed: ' + JSON.stringify(r));
    total += r.changed; skipped += r.skipped; batches++; after = r.nextAfter || 0;
  } while (after);
  const original = ENV.DB.raw.prepare("SELECT detail FROM econ_log WHERE id > ? AND id <= ? AND act = 'adm_login' ORDER BY id LIMIT 1").get(fixtureStart, end);
  const reset = parseDetail(original.detail);
  const untouched = row("SELECT detail FROM econ_log WHERE id > ? AND id <= ? AND act = 'open'", fixtureStart, end);
  ok(total === 207 && skipped === 1 && batches >= 3 && reset.why === '管理操作：管理员登录' && reset._auditReasonOriginal.value === 'preserve this note' && parseDetail(untouched.detail).why === 'player action', '恢复全部管理员原因时保留原始内容、跳过损坏的记录且不修改玩家流水', { total, skipped, batches, reset });
  const repeated = await adm('POST', '/api/admin/audit/reset-reasons', { after: fixtureStart, snapshot: end, why: '再次测试' });
  ok(repeated.ok && repeated.changed === 0 && parseDetail(ENV.DB.raw.prepare('SELECT detail FROM econ_log WHERE id = ?').get(fixtureStart + 1).detail)._auditReasonOriginal.value === 'preserve this note', '重复恢复不会覆盖原始原因', repeated);
  ENV.DB.raw.prepare('DELETE FROM econ_log WHERE id > ? AND id <= ?').run(fixtureStart, end);
}

section('管理网页：Worker 的 /admin；浏览器只许跑网页里那一段脚本');
{
  const res = await worker.fetch(new Request('https://w.test/admin'), ENV, { waitUntil() {} });
  const html = await res.text(), csp = res.headers.get('Content-Security-Policy') || '', scriptSrc = (/script-src ([^;]+)/.exec(csp) || [])[1] || '';
  ok(res.status === 200 && /text\/html/.test(res.headers.get('Content-Type')) && res.headers.get('X-Frame-Options') === 'DENY' && /frame-ancestors 'none'/.test(csp) && /connect-src 'self'/.test(csp) && /default-src 'none'/.test(csp), '回一个网页：不许被嵌进别的网页，只许连自己', csp);
  ok(scriptSrc && !scriptSrc.includes('unsafe'), '脚本不许 unsafe-inline（页面里混进来的脚本、onclick 跑不了）', scriptSrc);
  ok(!html.includes(ADMIN) && res.headers.get('Cache-Control') === 'no-store', '网页里没有口令，也不让缓存');
  if (FILE.includes('bundle')) {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)].map(m => m[1]);
    const sha = scripts.length === 1 ? createHash('sha256').update(scripts[0], 'utf8').digest('base64') : '';
    ok(scripts.length === 1 && scriptSrc === `'sha256-${sha}'`, '打包好的网页：CSP 里的 sha256 和页面里那一段脚本对得上（网页能跑）', [scripts.length, scriptSrc]);
    const names = JSON.parse((/const NAMES = (\{.*?\});/.exec(scripts[0]) || [])[1] || '{}');
    ok(Object.keys(C.ITEM).every(k => names.skins && names.skins[k]) && C.HERO_IDS.every(hh => names.heroes && names.heroes[hh]), '每件饰品、每个侠客在网页里都有名字');
  } else ok(scriptSrc === "'none'", '没打包的 worker.js：回一个说明页，不跑任何脚本');
}

section('以前的绑定皮肤：老号第一次动武库时换成库存里的饰品（只换一次），能卖；之后建的号、之后报上来的不换；星座码每个号只领一次');
{
  T = nextNoon();
  const old = await newUser('bindold', { skins: ['qf_gold', 'ts_bronze', 'qf_p1'], equip: { qingfeng: 'qf_gold' } });
  ok(profOf(old.uid).skins.includes('qf_gold') && !profOf(old.uid).skins.includes('qf_p1'), '注册带上来的：原版皮肤留着（绑定），武库专属的不认');
  ENV.DB.raw.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(Date.UTC(2026, 9, 1), old.uid);   // 截止日之前建的号
  await econ(old.token, 'sync');
  const s1 = stateOf(old.uid), lg = s1.inv.filter(x => x.src === 'legacy');
  ok(lg.length === 2 && lg.every(x => x.st === -1 && s1.via.includes(x.k)) && ['qf_gold', 'ts_bronze'].every(k => lg.some(x => x.k === k)), '两款绑定皮肤各换成一件普通版饰品，记进 via', s1.inv);
  ok(profOf(old.uid).skins.includes('qf_gold') && profOf(old.uid).equip.qingfeng === 'qf_gold', '换完照样能穿，穿着的不变');
  ok(row("SELECT COUNT(*) AS n FROM econ_log WHERE uid = ? AND act = 'legacy'", old.uid).n === 1, '流水记了一笔 legacy');
  await econ(old.token, 'sync');
  ok(stateOf(old.uid).inv.length === 2, '再动武库不会再换（每个号只换一次）');
  const up = await call('POST', '/api/profile', { profile: { ...profOf(old.uid), skins: [...profOf(old.uid).skins, 'yh_sakura'] }, ledger: { deltas: [], ev: 0 } }, old.token);
  await econ(old.token, 'sync');
  ok(up.ok && profOf(old.uid).skins.includes('yh_sakura') && !stateOf(old.uid).inv.some(x => x.k === 'yh_sakura'), '换过以后网页再报上来的皮肤不进库存（服务器核对不了，只能穿不能卖）');
  const gold = stateOf(old.uid).inv.find(x => x.k === 'qf_gold');
  const L = await econ(old.token, 'list', { i: gold.i, price: 321 });
  ok(L.res && L.res.ok, '换来的饰品能挂到玩家市场', L.res);
  const buyer = await newUser('bindbuyer', { ink: 2000 });
  await econ(buyer.token, 'sync');
  const by = await econ(buyer.token, 'buy', { l: L.res.l, price: 321 });
  ok(by.res && by.res.ok && stateOf(buyer.uid).inv.some(x => x.k === 'qf_gold') && profOf(buyer.uid).skins.includes('qf_gold'), '别的玩家买到了，能穿', by.res);
  await econ(old.token, 'sync');
  ok(!profOf(old.uid).skins.includes('qf_gold') && !profOf(old.uid).equip.qingfeng, '卖掉以后原来的号就穿不了了（不会卖了还留着）');

  const fresh = await newUser('bindnew', { skins: ['lm_violet'] });
  ENV.DB.raw.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(Date.UTC(2026, 10, 1), fresh.uid);
  await econ(fresh.token, 'sync');
  ok(!stateOf(fresh.uid).inv.length && profOf(fresh.uid).skins.includes('lm_violet'), '截止日以后建的号不换：皮肤照样能穿，库存里没有');

  // 写在源码里的星座码已作废：领不到；以前领过的号，码送的饰品第一次动武库时收回
  const zk = Object.keys(C.ITEM).filter(k => C.ITEM[k].col === 'c8');
  const z = await newUser('zodone', { ink: 100 });
  await econ(z.token, 'sync');
  const zr = await econ(z.token, 'claimCode', { code: 'ZODIAC2026STAR' });
  ok(zr.status === 400 && zr.error === '兑换码无效或已过期' && !stateOf(z.uid).inv.some(x => zk.includes(x.k)), '公开过的星座码已作废：领不到', zr);
  // 按作废前的样子摆好一个领过的号：code_got 有记录，库存里 3 件码送的、1 件开箱开的，还有 1 件码送的挂在市场上
  const zv = await newUser('zodvoid', { ink: 100 });
  await econ(zv.token, 'sync');
  const seed = (uid, items, lst) => {
    const st = stateOf(uid);
    for (const it of items) { st.inv.push({ i: st.nid++, k: it.k, st: -1, n: '', t: T, src: it.src }); if (!st.via.includes(it.k)) st.via.push(it.k); }
    for (const L of lst) { const it = { i: st.nid++, k: L.k, st: -1, n: '', t: T, src: 'code' }; st.lst.push({ l: L.l, it, price: 500, t: T });   // 挂出去的那件和正常挂单一样，不在可穿的皮肤里
      ENV.DB.raw.prepare('INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)').run(L.l, uid, L.k, -1, JSON.stringify(it), 500, T); }
    const srv = JSON.parse(row('SELECT srv_json FROM econ WHERE uid = ?', uid).srv_json); delete srv.zv;
    ENV.DB.raw.prepare('UPDATE econ SET state_json = ?, srv_json = ? WHERE uid = ?').run(JSON.stringify(st), JSON.stringify(srv), uid);
    const pf = profOf(uid); pf.skins = Array.from(new Set([...(pf.skins || []), ...items.map(x => x.k)]));
    ENV.DB.raw.prepare('UPDATE users SET profile_json = ? WHERE id = ?').run(JSON.stringify(pf), uid);
  };
  const zl = 'abcdef0123456789';
  seed(zv.uid, [{ k: zk[0], src: 'code' }, { k: zk[1], src: 'code' }, { k: zk[2], src: 'code' }, { k: zk[3], src: 'case' }], [{ k: zk[4], l: zl }]);
  ENV.DB.raw.prepare('INSERT INTO code_got (code, uid, at) VALUES (?, ?, ?)').run('ZODIAC2026STAR', zv.uid, T);
  const zs0 = await econ(zv.token, 'sync');
  const zst = stateOf(zv.uid), zpf = profOf(zv.uid);
  ok(zs0.ok && !zst.inv.some(x => x.src === 'code' && zk.includes(x.k)) && zst.inv.some(x => x.k === zk[3] && x.src === 'case'), '领过的号：码送的星座饰品收回，开箱开的留着', zst.inv);
  ok(!zst.lst.some(L => L.l === zl) && row('SELECT state FROM mkt WHERE id = ?', zl).state === 2, '码送的饰品挂在市场上还没卖的：撤下来', zst.lst);
  ok(![zk[0], zk[1], zk[2], zk[4]].some(k => zpf.skins.includes(k)) && zpf.skins.includes(zk[3]), '收回的皮肤穿不了了，开箱的照样能穿', zpf.skins);
  const zlog = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'code_void'", zv.uid), zld = zlog ? parseDetail(zlog.detail) : {};
  ok(zld.code && zld.code[0] === 'ZODIAC2026STAR' && zld.inv && zld.inv.length === 3 && zld.lst && zld.lst[0] === zl, '收回记一条 code_void 流水', zld);
  await econ(zv.token, 'sync');
  ok(row("SELECT COUNT(*) AS n FROM econ_log WHERE uid = ? AND act = 'code_void'", zv.uid).n === 1 && JSON.parse(row('SELECT srv_json FROM econ WHERE uid = ?', zv.uid).srv_json).zv, '只收一次（记在 srv.zv）');
  // 没领过这个码的号：后台礼包码送的星座饰品（也是 src 'code'）不动
  const zn = await newUser('zodnone', { ink: 100 });
  await econ(zn.token, 'sync');
  seed(zn.uid, [{ k: zk[5], src: 'code' }], []);
  await econ(zn.token, 'sync');
  ok(stateOf(zn.uid).inv.some(x => x.k === zk[5] && x.src === 'code') && !row("SELECT 1 AS x FROM econ_log WHERE uid = ? AND act = 'code_void'", zn.uid), '没领过星座码的号：别的码送的星座饰品不动');
}

section('规则核心：冻结、坏存档自愈');
{
  'use strict';
  let threw = false;
  try { C.ODDS.gold = 1; } catch (e) { threw = true; }
  try { C.COLS.c7.odds.gold = 1; C.COLS.c7.price = 1; } catch (e) { threw = true; }
  ok(C.ODDS.gold === 0.018 && C.COLS.c7.odds.gold === 0.08 && C.COLS.c7.price === 1000 && C.OPEN_DAY === 5 && (C.PREM_DAY === 3 || C.PREM_WEEK === 3), '概率表、箱子价钱、每天和每周能开几个都改不动' + (threw ? '（严格模式下会报错）' : ''));
  const s = C.normalize({ v: 1, jade: '1e9', keys: 'x', term: -5, cw: { w: 0, n: 99 }, od: { d: 0, n: 99 }, pd: { d: 0, n: 99 }, pw: { w: 'x', n: -3 },
    inv: [{ i: 1, k: 'qf_p1', f: 9, p: -3, st: 5 }, { i: 1, k: 'qf_p1', st: 2 }, { i: 2, k: 'nope' }, { i: 3, k: 'qf_p2', st: -7 }, null],
    lst: [{ l: 'L5', it: { i: 1, k: 'qf_p1' }, price: -1 }], eq: { qingfeng: 77 }, op: { earned: 5, spent: 99 }, evil: 1,
    tm: { t0: T, n: 99, o: { k: 'nope', price: 1 } } }, { now: T, uid: 'x' });
  ok(s.inv.length === 2 && s.inv[0].st === 5 && !('f' in s.inv[0]) && s.inv[1].st === -1, '坏饰品被修正、重复编号和假饰品被丢掉', s.inv);
  ok(s.term === 0 && !('keys' in s) && !('jade' in s) && s.lst.length === 0 && !s.eq.qingfeng && s.op.spent <= s.op.earned && !('evil' in s), '负数、乱填的钥匙、重复的挂单、穿着不存在的饰品、多余字段都被清掉', s);
  ok(s.tm === null && C.openLeft(s, 'c1') === C.OPEN_DAY && (C.openLeft(s, 'c7') === C.PREM_DAY || C.openLeft(s, 'c7') === 3) && !('cw' in s), '假的货郎报价作废；乱填的开箱次数换天、换周就重置', [s.tm, s.od, s.pd, s.pw]);
  const t2 = C.normalize({ tm: { t0: T, n: 99, o: { k: 'qf_p1', st: 3, price: -9 } } }, { now: T, uid: 'x' });
  ok(t2.tm && t2.tm.n === C.TERM.offers && t2.tm.o.price >= 1, '货郎报到第几件、价格都夹在范围里', t2.tm);
  ok(s.nid > 3, '新编号不会和已有的撞');
}

section('全服肉鸽 · 天道 Boss 的星座皮肤：服务器核对账号后写进 gift 表，下次动武库领到；游客、新号、伤害不够、被封的没有；每号每天一件，同时发、同时领都不多');
{
  const { RG } = globalThis.RenyingWorldSim;
  const zod = k => !!C.ITEM[k] && C.ITEM[k].col === 'c8';
  const Z1 = await newUser('rouge1'), Z2 = await newUser('rouge2'), Z3 = await newUser('rouge3'), ZB = await newUser('rougebad');
  for (const u of [Z1, Z2, Z3, ZB]) await econ(u.token, 'sync');
  T += (RG.MIN_AGE_H + 1) * 3600e3;
  const Zn = await newUser('rougenew'); await econ(Zn.token, 'sync');   // 刚注册的号
  await adm('POST', '/api/admin/ban', { uid: ZB.uid, days: 2, why: '测试全服肉鸽' });
  const ctx = { socks: new Set(), acceptWebSocket() {}, getWebSockets() { return []; } };
  const line = new WorldLine(ctx, ENV), sim = line.sim;
  const join = async (name, tok) => { const id = sim.join({ name }); if (tok) await line.auth(id, tok); sim.players.get(id).jies = RG.JIE; return id; };
  const p1 = await join('甲', Z1.token), p2 = await join('乙', Z2.token), p3 = await join('丙', Z3.token), pn = await join('新', Zn.token),
    pb = await join('坏', ZB.token), pg = await join('游客'), pf = await join('乱填', 'not-a-token');
  ok(sim.players.get(p1).uid === Z1.uid && sim.players.get(pn).uid === Zn.uid, '登录令牌核对成云端账号');
  ok(!sim.players.get(pb).uid && !sim.players.get(pg).uid && !sim.players.get(pf).uid, '被封的号、游客、乱填的令牌都不认账号');
  const win = async (hits) => {
    sim.run.jie = RG.JIE; sim.run.key = null; sim.run.wait = false; sim.startKey();
    const k = sim.run.key; sim.t += 4;
    for (let i = 0; i < 2000 && sim.run.key; i++) { sim.t += 1; for (const [id, d] of hits) sim.keyHit(id, k.seq, d); }
    const list = sim.rewards; sim.rewards = []; await line.pay(list); return { k, list };
  };
  const { list } = await win([[p1, 200], [p2, 200], [p3, 5], [pn, 200], [pg, 200], [pb, 200]]);
  ok(list.map(r => r.uid).sort().join() === [Z1.uid, Z2.uid].sort().join(), '只有伤害够份额、注册满 24 小时的云端账号够资格（伤害太少的、新号、游客、被封的没有）', list);
  const g1 = ENV.DB.raw.prepare("SELECT * FROM gift WHERE uid = ? AND by = 'rouge'").all(Z1.uid);
  ok(g1.length === 1 && zod(JSON.parse(g1[0].items_json).skin) && g1[0].ink === RG.INK, `gift 表里写了一件星座饰品 + ${RG.INK} 墨锭`, g1);
  ok(ENV.DB.raw.prepare("SELECT COUNT(*) AS n FROM gift WHERE by = 'rouge' AND uid IN (?, ?, ?)").get(Z3.uid, Zn.uid, ZB.uid).n === 0, '不够资格的号 gift 表里没有');
  ok(row("SELECT COUNT(*) AS n FROM econ_log WHERE uid = ? AND act = 'rouge_zod'", Z1.uid).n === 1, '发奖记进流水（rouge_zod）');
  const inv0 = stateOf(Z1.uid).inv.length, ink0 = inkOf(Z1.uid);
  const rs = await Promise.all(Array.from({ length: 6 }, () => econ(Z1.token, 'sync')));
  const st1 = stateOf(Z1.uid), mine = st1.inv.filter(x => x.src === 'rouge');
  ok(rs.every(r => r.ok) && rs.filter(r => r.gifts).length === 1 && mine.length === 1 && st1.inv.length === inv0 + 1 && inkOf(Z1.uid) === ink0 + RG.INK, '同时发 6 个请求：只领到一件星座饰品和一份墨锭', [mine, inkOf(Z1.uid) - ink0]);
  ok(zod(mine[0].k) && mine[0].k === JSON.parse(g1[0].items_json).skin, '领到的就是写进 gift 表的那一件');
  ok(rs.find(r => r.gifts).gifts[0].skin === mine[0].k, '回复里带着是哪一件（网页弹提示用）');
  ok(!(await econ(Z1.token, 'sync')).gifts && stateOf(Z1.uid).inv.filter(x => x.src === 'rouge').length === 1, '再动武库不会再领');
  // 同一天再赢一次、两条线同时发：都不多
  await win([[p1, 200], [p2, 200]]);
  await Promise.all([line.pay([{ uid: Z2.uid, dmg: 1, cyc: 9 }]), line.pay([{ uid: Z2.uid, dmg: 1, cyc: 9 }]), line.pay([{ uid: Z1.uid, dmg: 1, cyc: 9 }])]);
  const n1 = ENV.DB.raw.prepare("SELECT COUNT(*) AS n FROM gift WHERE uid = ? AND by = 'rouge'").get(Z1.uid).n, n2 = ENV.DB.raw.prepare("SELECT COUNT(*) AS n FROM gift WHERE uid = ? AND by = 'rouge'").get(Z2.uid).n;
  ok(n1 === RG.ZOD_PER_DAY && n2 === RG.ZOD_PER_DAY, `同一天再赢、几条线同时发：每号每天还是只有 ${RG.ZOD_PER_DAY} 件`, [n1, n2]);
  T += 86400e3;
  await line.pay([{ uid: Z1.uid, dmg: 1, cyc: 10 }]);
  const r2 = await econ(Z1.token, 'sync'), mine2 = stateOf(Z1.uid).inv.filter(x => x.src === 'rouge');
  ok(r2.gifts && r2.gifts.length === 1 && mine2.length === 2 && mine2[0].k !== mine2[1].k, '第二天再赢：再领一件，优先给还没有的款', mine2.map(x => x.k));
  // 伤害封顶：一个人狂报伤害也打不死，3 秒后每秒最多算 RG.KEY_DPS
  sim.run.jie = RG.JIE; sim.startKey();
  const k = sim.run.key; sim.t += 3.5;
  let dealt = 0; for (let i = 0; i < 50; i++) dealt += sim.keyHit(p1, k.seq, 99999);
  ok(dealt <= RG.KEY_DPS && k.hp > k.mh - RG.KEY_DPS - 1, `一个人一口气狂报伤害，最多只算 ${RG.KEY_DPS}（算了 ${Math.round(dealt)}）`);
  sim.endKey(false);
  ok(!sim.rewards.length, '没打死就没有奖励');
  // 伪造：gift 里的 skin 不是星座款的不认
  ENV.DB.raw.prepare("INSERT INTO gift (id, uid, ink, items_json, note, by, at, until, born) VALUES ('fake1', ?, 0, ?, 'x', 'rouge', ?, ?, ?)").run(Z2.uid, JSON.stringify({ skin: 'qf_p1' }), T, T + 86400e3, T);
  const r3 = await econ(Z2.token, 'sync');
  ok(!stateOf(Z2.uid).inv.some(x => x.k === 'qf_p1' && x.src === 'rouge') && stateOf(Z2.uid).inv.filter(x => x.src === 'rouge').length === 1, '不是星座武器箱的款不会当奖励发出去', r3.gifts);
}

section('玩家市场挂单到期：挂太久没卖出的自动撤下，饰品退回卖家；到期的买不了；同时挂的单数以服务器为准');
{
  T = nextNoon();
  const days = C.cv((await adm('GET', '/api/admin/cfg')).cfg, 'mktDays');
  ok(days >= 1 && days <= 90, `挂单挂 ${days} 天（默认 ${C.MKT_DAYS} 天，后台能改）`, days);
  const S = await newUser('xseller'), B = await newUser('xbuyer', { ink: 5000 });
  for (const x of [S, B]) await econ(x.token, 'sync');
  const [a, b, c] = grant(S.uid, [{ k: 'gc_wolf' }, { k: 'qf_p1', st: 3 }, { k: 'yh_p1' }]);
  await econ(S.token, 'sync');
  const l1 = await econ(S.token, 'list', { i: a.i, price: 100 });
  const l2 = await econ(S.token, 'list', { i: b.i, price: 200 });
  const l3 = await econ(S.token, 'list', { i: c.i, price: 50 });
  ok([l1, l2, l3].every(r => r.res.ok), '挂了 3 单');
  T += (days - 1) * 86400e3;
  const bought = await econ(B.token, 'buy', { l: l3.res.l });
  ok(bought.res.ok, `第 ${days - 1} 天还在卖，买得到`, bought.res);
  ok((await market(B.token, 'gc_wolf')).open.length === 1, '行情里还看得到');
  T += 2 * 86400e3;
  const m = await market(B.token, 'gc_wolf');
  ok(m.ok && !m.open.length && !(m.items && m.items.gc_wolf), '过了期限：行情里看不到了（卖家还没回来也一样）', m.open);
  const ink0 = inkOf(B.uid), late = await econ(B.token, 'buy', { l: l1.res.l });
  ok(late.res.err && /到期|撤下/.test(late.res.err) && inkOf(B.uid) === ink0 && mrow(l1.res.l).state !== 1, '到期的单买不了，墨锭不动', late.res);
  ENV.DB.raw.prepare('DELETE FROM mkt WHERE id = ?').run(l2.res.l);   // 这一单已经被清理掉了（撤下一周后会删）
  const sy = await econ(S.token, 'sync');
  const st = stateOf(S.uid);
  ok(mrow(l1.res.l).state === 2, '卖家回来：到期那一单标成撤下');
  ok(!st.lst.length && st.inv.some(x => x.i === a.i) && st.inv.some(x => x.i === b.i && x.st === 3), '到期的、表里已经找不到的都退回库存（斩数跟着回来）', st);
  ok(!st.inv.some(x => x.i === c.i) && sy.sold.length === 1 && sy.sold[0].k === 'yh_p1', '到期前卖掉的照常结账，不会退回', sy.sold);
  ok(sy.back && sy.back.length === 2 && profOf(S.uid).skins.includes('gc_wolf'), '告诉网页退回了 2 件，皮肤又能穿了', sy.back);
  const lg = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'sync' ORDER BY id DESC LIMIT 1", S.uid);
  ok(lg && parseDetail(lg.detail).b === 2, '流水里记下退回了几件', lg);
  const again = await econ(S.token, 'sync');
  ok(!again.back && stateOf(S.uid).inv.filter(x => x.i === a.i).length === 1, '只退一次，不会多出一件');
  // 挂单不设上限：服务器市场表里已经有一堆在卖的，也照样能再挂
  const fake = Array.from({ length: 30 }, (_, i) => ('f' + String(i).padStart(15, '0')));
  for (const id of fake) ENV.DB.raw.prepare('INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)').run(id, S.uid, 'qf_p1', -1, JSON.stringify({ i: 90000, k: 'qf_p1', st: -1 }), 10, T);
  const over = await econ(S.token, 'list', { i: a.i, price: 10 });
  ok(over.res.ok && !stateOf(S.uid).inv.some(x => x.i === a.i), '市场表里已经有 30 单在卖：照样能再挂', over.res);
  ENV.DB.raw.prepare("DELETE FROM mkt WHERE id LIKE 'f%' AND seller = ?").run(S.uid);
  // 挂得很多：一键挂牌一次最多挂 LIST_BATCH 件；到期以后每次操作最多核对、退回 LIST_CHECK 单，剩下的下次接着退，一件都不丢
  const D = await newUser('manylist');
  await econ(D.token, 'sync');
  grant(D.uid, Array.from({ length: 2 * C.LIST_BATCH + 1 }, () => ({ k: 'ts_p1' })));
  const d1 = await econ(D.token, 'listDupes'), d2 = await econ(D.token, 'listDupes');
  ok(d1.res.ok && d1.res.count === C.LIST_BATCH && d1.res.skipped === C.LIST_BATCH && d2.res.ok && d2.res.count === C.LIST_BATCH, `一键挂牌一次挂 ${C.LIST_BATCH} 件，再点一次挂剩下的`, [d1.res, d2.res]);
  ok(stateOf(D.uid).lst.length === 2 * C.LIST_BATCH && row('SELECT COUNT(*) AS n FROM mkt WHERE seller = ? AND state = 0', D.uid).n === 2 * C.LIST_BATCH, `一共挂着 ${2 * C.LIST_BATCH} 单，存档和市场表对得上`);
  T += (days + 1) * 86400e3;
  const b1 = await econ(D.token, 'sync'), left1 = stateOf(D.uid).lst.length;
  ok(b1.back && b1.back.length === C.LIST_CHECK && left1 === 2 * C.LIST_BATCH - C.LIST_CHECK, `全部到期：这次先退回 ${C.LIST_CHECK} 件`, b1.back && b1.back.length);
  const b2 = await econ(D.token, 'sync'), sD = stateOf(D.uid);
  ok(b2.back && b2.back.length === left1 && !sD.lst.length && sD.inv.length === 2 * C.LIST_BATCH + 1, '下一次把剩下的也退回，库存一件不少', [b2.back && b2.back.length, sD.inv.length]);
}

section('找回饰品：管理后台按流水查出“拿到过、现在没有”的饰品，写明是哪一步没的；只有去向不明、管理员收走的能找回，找回一次');
{
  T = nextNoon();
  const R = await newUser('restoree'), Bx = await newUser('rbuyer', { ink: 5000 });
  for (const x of [R, Bx]) await econ(x.token, 'sync');
  const mil = C.COLS.c1.mil[0];
  const g = await adm('POST', '/api/admin/adjust', { uid: R.uid, give: [{ k: 'gc_wolf' }, { k: 'qf_p1', st: 4 }, { k: 'yh_p1' }, { k: 'ts_p1' }, { k: 'ts_p1' }, ...Array.from({ length: 10 }, () => ({ k: mil }))], why: '找回演练：先发东西' });
  ok(g.ok && g.given.length === 15, '发了 15 件', g.error);
  const [wolf, bamboo, yh, ts1, ts2] = g.given, mils = g.given.slice(5);
  // 正常没的：熔铸掉、一键卖掉重复的、在玩家市场卖掉、管理员收走
  const tr = await econ(R.token, 'trade', { ids: mils.map(x => x.i) });
  ok(tr.res.ok, '熔铸掉 10 件', tr.res);
  const lg = parseDetail(row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'trade' ORDER BY id DESC LIMIT 1", R.uid).detail);
  ok(Array.isArray(lg.rm) && lg.rm.length === 10 && Array.isArray(lg.ad) && lg.ad.length === 1, '流水里记下了这一步出去的 10 件、进来的 1 件', lg);
  const sd = await econ(R.token, 'sellDupes');
  ok(sd.res.ok && sd.res.count === 1, '一键卖掉 1 件重复的', sd.res);
  const li = await econ(R.token, 'list', { i: yh.i, price: 30 });
  await econ(Bx.token, 'buy', { l: li.res.l });
  await econ(R.token, 'sync');
  const tk = await adm('POST', '/api/admin/adjust', { uid: R.uid, take: [bamboo.i], why: '找回演练：误收' });
  ok(tk.ok, '管理员收走斩数版竹影', tk.error);
  // 异常：存档出错，狼皮直接没了（流水里没有它的去向）
  const s0 = stateOf(R.uid); s0.inv = s0.inv.filter(x => x.i !== wolf.i);
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ?, ver = ver + 1 WHERE uid = ?').run(JSON.stringify(s0), R.uid);
  ok(!stateOf(R.uid).inv.some(x => x.i === wolf.i), '演练：删掉一件（狼皮）');
  const L = await adm('GET', '/api/admin/lost?uid=' + R.uid);
  const by = i => L.items.find(x => x.i === i);
  ok(L.ok && by(wolf.i) && by(wolf.i).why === 'unknown' && by(wolf.i).can && by(wolf.i).k === 'gc_wolf', '狼皮：去向不明，可以找回', by(wolf.i));
  const previous = row('SELECT u.id FROM users u JOIN econ e ON e.uid = u.id WHERE u.deleted_at = 0 AND u.id < ? ORDER BY u.id DESC LIMIT 1', R.uid);
  const scan = await adm('GET', '/api/admin/lost/scan' + (previous ? '?after=' + encodeURIComponent(previous.id) : ''));
  const found = scan.matches.find(x => x.uid === R.uid);
  ok(found && found.ids.includes(wolf.i) && !found.ids.includes(bamboo.i) && !found.ids.includes(yh.i), '全服扫描只找获得记录存在但去向不明的饰品', found);
  ok((await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [bamboo.i], onlyUnknown: true, why: '全服恢复测试' })).status === 400, '全服恢复不会发回管理员收走的饰品');
  ok(by(bamboo.i) && by(bamboo.i).why === 'admin' && by(bamboo.i).can && by(bamboo.i).st === 4, '管理员收走的：写明是谁收的那一步，可以找回（斩数照旧是 4）', by(bamboo.i));
  ok(by(yh.i) && by(yh.i).why === 'sold' && !by(yh.i).can, '在玩家市场卖掉的：不能找回', by(yh.i));
  ok(mils.every(x => by(x.i) && by(x.i).why === 'trade' && !by(x.i).can), '熔铸掉的 10 件：不能找回');
  const sold1 = [ts1, ts2].map(x => by(x.i)).filter(Boolean);
  ok(sold1.length === 1 && sold1[0].why === 'sellDupes' && !sold1[0].can, '一键卖掉的那件重复的：不能找回', sold1);
  ok(!by(ts1.i) !== !by(ts2.i) && !L.items.some(x => x.i === tr.res.item.i), '还在库存里的不列出来');
  ok((await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [wolf.i] })).status === 400, '不写原因不让找回');
  const bad1 = await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [yh.i], why: '想多要一件' });
  ok(bad1.status === 400 && /不能找回/.test(bad1.error), '卖掉的不让找回', bad1.error);
  const bad2 = await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [tr.res.item.i], why: '还在库存里' });
  ok(bad2.status === 400, '还在库存里的不让找回', bad2.error);
  const rs = await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [wolf.i, bamboo.i], why: '找回演练：存档出错丢的' });
  ok(rs.ok && rs.items.length === 2 && rs.items.every(x => x.from === x.to), '找回 2 件，用回原来的编号', rs);
  const st = stateOf(R.uid);
  ok(st.inv.some(x => x.i === wolf.i && x.k === 'gc_wolf' && x.src === 'restore') && st.inv.some(x => x.i === bamboo.i && x.st === 4), '狼皮、斩数版竹影（斩数 4）回到库存', st.inv.map(x => x.i));
  ok(profOf(R.uid).skins.includes('gc_wolf'), '皮肤又能穿了');
  const rl = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'restore' ORDER BY id DESC LIMIT 1", R.uid);
  ok(rl && parseDetail(rl.detail).why === '找回演练：存档出错丢的' && parseDetail(rl.detail).items.length === 2, '流水记下谁、为什么、找回了哪几件', rl);
  const twice = await adm('POST', '/api/admin/restore', { uid: R.uid, ids: [wolf.i], why: '再找一次' });
  ok(twice.status === 400 && stateOf(R.uid).inv.filter(x => x.k === 'gc_wolf').length === 1, '同一件找回不了第二次', twice.error);
  const L2 = await adm('GET', '/api/admin/lost?uid=' + R.uid);
  ok(!L2.items.some(x => x.i === wolf.i || x.i === bamboo.i), '找回以后不再列为找不到');
  const extra = await adm('POST', '/api/admin/adjust', { uid: R.uid, give: [{ k: 'gc_wolf' }], why: '并发找回测试' });
  const missing = extra.given[0], broken = stateOf(R.uid); broken.inv = broken.inv.filter(x => x.i !== missing.i);
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ?, ver = ver + 1 WHERE uid = ?').run(JSON.stringify(broken), R.uid);
  const concurrent = await Promise.all([1, 2].map(() => adm('POST', '/api/admin/restore', { uid: R.uid, ids: [missing.i], onlyUnknown: true, why: '并发找回测试' })));
  ok(concurrent.filter(x => x.ok).length === 1 && stateOf(R.uid).inv.filter(x => x.i === missing.i).length === 1, '同时找回同一件饰品只会发放一次', concurrent);
  const aud = await adm('GET', '/api/admin/audit');
  ok(aud.ok && aud.rows.some(r => r.act === 'restore' && r.uid === R.uid), '操作记录里看得到这次找回', aud.rows && aud.rows.slice(0, 3));
}
