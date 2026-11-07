// 武库经济测试第 50 段：由 tools/tests/econ-test.mjs 按文件名顺序拼起来，和前面几段共用同一个本机 Worker 和数据库。
//
// 本段的小节（共 5 节，测试失败时按小节标题搜）：
//    1. 管理员账号和角色：先登录换 1 小时的管理令牌；四种角色按接口放行；停用、改密码马上踢下线；都记进操作记录
//    2. 删除账号（软删除）：登录不了、不上榜、挂单看不到，数据一样不动；恢复后什么都不丢；批量封号、解封、删除、恢复；导出 CSV
//    3. 数据库迁移：cloudflare/migrations/ 按编号跑，记在 schema_migrations；空库、以前的库都能升到一样的结构；同时跑不重复；出错整个退回
//    4. 一次性、按天按周的奖励：领没领过记在服务器上，换设备、退出再登录、清本机都领不到第二次
//    5. 联机 ICE 列表：没配 TURN 只回 STUN；配了就带上短时凭据；拿凭据失败也照样回 STUN
section('管理员账号和角色：先登录换 1 小时的管理令牌；四种角色按接口放行；停用、改密码马上踢下线；都记进操作记录');
{
  const login = (body, ip = '5.6.0.1') => call('POST', '/api/admin/login', body, undefined, ip);
  const s0 = await login({ password: ADMIN });
  ok(s0.ok && s0.token.startsWith('as_') && s0.who === 'admin' && s0.role === 'all' && s0.expiresIn === 3600, '用 ADMIN_SECRET 口令登录：拿到 1 小时的管理令牌，角色是全部', s0);
  ok(!row('SELECT 1 AS x FROM admin_sessions WHERE token = ?', s0.token) && row("SELECT COUNT(*) AS n FROM admin_sessions WHERE token LIKE 'h1:%'").n >= 1, '数据库里只存管理令牌的哈希');
  const w0 = await adm('GET', '/api/admin/whoami', undefined, s0.token);
  ok(w0.ok && w0.who === 'admin' && w0.role === 'all', '用管理令牌调接口', w0);
  ok((await adm('GET', '/api/admin/whoami')).role === 'all', '命令行直接带 ADMIN_SECRET 照旧能用（角色是全部）');
  ok((await login({ password: 'wrong-pass-0000000000' }, '5.6.0.2')).status === 403, '口令不对：登录不了');

  const mk = (name, role, pw, tok = s0.token) => adm('POST', '/api/admin/admins', { name, role, password: pw, why: '建管理员' }, tok);
  ok((await adm('POST', '/api/admin/admins', { name: 'viewer', role: 'view', password: 'viewer-pass-0001' }, s0.token)).status === 400, '建管理员也要写原因');
  ok((await mk('viewer', 'view', 'short')).status === 400, '密码少于 12 位不收');
  ok((await mk('admin', 'view', 'viewer-pass-0001')).status === 400, '名字不能和 ADMIN_SECRET 口令的名字重');
  ok((await mk('boss', 'god', 'viewer-pass-0001')).status === 400, '不认识的角色不收');
  const c1 = await mk('viewer', 'view', 'viewer-pass-0001');
  await mk('banker', 'econ', 'banker-pass-0002'); await mk('judge', 'ban', 'judge-pass-00003'); await mk('chief', 'all', 'chief-pass-00004');
  ok(c1.ok && c1.created && row("SELECT COUNT(*) AS n FROM admins").n === 4, '建了四个管理员账号', c1);
  const a1 = row("SELECT * FROM admins WHERE name = 'viewer'");
  ok(a1.password_algo.startsWith('pbkdf2') && !a1.password_hash.includes('viewer-pass') && a1.created_by === 'admin', '密码用 PBKDF2 存，记着是谁建的', a1);
  const list = await adm('GET', '/api/admin/admins', undefined, s0.token);
  ok(list.ok && list.admins.length === 4 && list.admins.every(a => !('password_hash' in a) && !('salt' in a)), '列表里没有密码', list.admins);

  const L = {};
  for (const [n, pw] of [['viewer', 'viewer-pass-0001'], ['banker', 'banker-pass-0002'], ['judge', 'judge-pass-00003'], ['chief', 'chief-pass-00004']]) L[n] = await login({ name: n, password: pw });
  ok(['viewer', 'banker', 'judge', 'chief'].every(n => L[n].ok && L[n].who === n), '四个账号都能用名字和密码登录', Object.values(L).map(x => x.role));
  ok((await login({ name: 'VIEWER', password: 'viewer-pass-0001' })).who === 'viewer', '名字不分大小写');
  ok((await login({ name: 'viewer', password: 'banker-pass-0002' }, '5.6.0.3')).status === 403 && (await login({ name: 'nobody', password: 'viewer-pass-0001' }, '5.6.0.3')).status === 403, '密码不对、没有这个人：都登录不了');
  ok(row("SELECT last_login FROM admins WHERE name = 'judge'").last_login === T, '记下最近登录的时间');

  const vic = await newUser('roletest');
  const can = async (n, method, path, body) => (await adm(method, path, body, L[n].token)).status;
  const adj = { uid: vic.uid, ink: 5, why: '角色测试' };
  ok(await can('viewer', 'POST', '/api/admin/audit/reset-reasons', { why: '角色测试' }) === 403 && await can('banker', 'POST', '/api/admin/audit/reset-reasons', { why: '角色测试' }) === 403, '只有全部权限的管理员能恢复默认原因');
  ok(await can('viewer', 'GET', '/api/admin/stats') === 200 && await can('viewer', 'GET', '/api/admin/econ?uid=' + vic.uid) === 200, '只能看：所有查询都能看');
  const v403 = await adm('POST', '/api/admin/adjust', adj, L.viewer.token);
  ok(v403.status === 403 && v403.role === 'view' && inkOf(vic.uid) === inkOf(vic.uid), '只能看：加墨锭被拒（403，说明缺什么角色）', v403);
  ok(await can('viewer', 'POST', '/api/admin/ban', { uid: vic.uid, days: 1, why: 'x' }) === 403 && await can('viewer', 'POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'all', why: 'x' }) === 403, '只能看：封号、改开关都不行');
  const ink0 = inkOf(vic.uid);
  ok(await can('banker', 'POST', '/api/admin/adjust', adj) === 200 && inkOf(vic.uid) === ink0 + 5, '经济：能加墨锭');
  ok(await can('banker', 'POST', '/api/admin/ban', { uid: vic.uid, days: 1, why: 'x' }) === 403, '经济：不能封号');
  ok(await can('judge', 'POST', '/api/admin/adjust', adj) === 403, '封禁和账号：不能加墨锭');
  ok(await can('judge', 'POST', '/api/admin/ban', { uid: vic.uid, days: 1, why: '角色测试' }) === 200 && await can('judge', 'POST', '/api/admin/pardon', { uid: vic.uid, why: '角色测试' }) === 200, '封禁和账号：能封号、解封');
  ok(await can('judge', 'POST', '/api/admin/password', { uid: vic.uid, password: 'judge-set-pass-1', why: '角色测试' }) === 200, '封禁和账号：能重设玩家密码');
  ok(await can('judge', 'POST', '/api/admin/password', { uid: 'Dev', password: 'judge-set-pass-1', create: true, why: '角色测试' }) === 403 && await can('judge', 'POST', '/api/admin/password', { uid: 'Newbie9', password: 'judge-set-pass-1', create: true, why: '角色测试' }) === 403, '封禁和账号：不能建号、不能动 Dev（库存不受限）');
  ok(await can('judge', 'POST', '/api/admin/flags', { k: 'auth.refresh', mode: 'dev', why: 'x' }) === 403 && await can('banker', 'GET', '/api/admin/admins') === 403 && await can('judge', 'POST', '/api/admin/admins', { name: 'x1', role: 'all', password: 'xxxxxxxxxxxxxx', why: 'x' }) === 403, '功能开关、管理员账号只有「全部」能动');
  ok(await can('chief', 'POST', '/api/admin/adjust', adj) === 200 && await can('chief', 'GET', '/api/admin/admins') === 200, '全部：都能做');
  const byBanker = parseDetail(row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'admin' ORDER BY id LIMIT 1", vic.uid).detail);
  ok(byBanker.by === 'banker', '操作记录里记的是管理员账号的名字', byBanker);

  ok((await adm('POST', '/api/admin/admins', { name: 'chief', role: 'econ', why: '降自己' }, L.chief.token)).status === 400 && (await adm('POST', '/api/admin/admins', { name: 'chief', disabled: true, why: '停自己' }, L.chief.token)).status === 400, '不能给自己降角色、不能停用自己');
  const re = await adm('POST', '/api/admin/admins', { name: 'banker', role: 'view', why: '降级' }, L.chief.token);
  ok(re.ok && !re.created && (await adm('GET', '/api/admin/whoami', undefined, L.banker.token)).role === 'view', '改了角色：已经登录的马上按新角色算');
  ok(await can('banker', 'POST', '/api/admin/adjust', adj) === 403, '降成只能看以后不能加墨锭了');
  const pwc = await adm('POST', '/api/admin/admins', { name: 'judge', password: 'judge-new-pass-9', why: '换密码' }, L.chief.token);
  ok(pwc.ok && pwc.role === 'ban' && (await adm('GET', '/api/admin/whoami', undefined, L.judge.token)).status === 401, '改了密码：已经登录的马上失效（401），角色不变');
  ok((await login({ name: 'judge', password: 'judge-pass-00003' }, '5.6.0.4')).status === 403 && (await login({ name: 'judge', password: 'judge-new-pass-9' })).ok, '旧密码不能用了，新密码能登录');
  await adm('POST', '/api/admin/admins', { name: 'viewer', disabled: true, why: '离职' }, L.chief.token);
  ok((await adm('GET', '/api/admin/whoami', undefined, L.viewer.token)).status === 401 && (await login({ name: 'viewer', password: 'viewer-pass-0001' }, '5.6.0.5')).status === 403, '停用了：已经登录的失效，也登录不了');
  await adm('POST', '/api/admin/admins', { name: 'viewer', disabled: false, why: '回来了' }, L.chief.token);
  ok((await login({ name: 'viewer', password: 'viewer-pass-0001' })).ok, '重新启用以后又能登录');

  const out = await adm('POST', '/api/admin/logout', {}, L.chief.token);
  ok(out.ok && (await adm('GET', '/api/admin/whoami', undefined, L.chief.token)).status === 401, '退出以后管理令牌就没用了');
  const s1 = await login({ name: 'chief', password: 'chief-pass-00004' });
  T += 59 * 60000;
  ok((await adm('GET', '/api/admin/whoami', undefined, s1.token)).ok, '59 分钟时还能用');
  T += 2 * 60000;
  const exp = await adm('GET', '/api/admin/whoami', undefined, s1.token);
  ok(exp.status === 401 && /重新登录/.test(exp.error), '1 小时过了：401，要重新登录', exp);
  ok((await adm('GET', '/api/admin/whoami', undefined, 'as_' + 'f'.repeat(64))).status === 401, '编造的管理令牌不行');

  const logs = ENV.DB.raw.prepare("SELECT act, detail FROM econ_log WHERE act IN ('adm_login', 'adm_acct') ORDER BY id").all().map(r => ({ act: r.act, ...parseDetail(r.detail) }));
  ok(logs.some(l => l.act === 'adm_login' && l.by === 'admin' && l.how === 'secret') && logs.some(l => l.act === 'adm_login' && l.by === 'judge' && l.how === 'account'), '每次登录都记进流水（口令登录、账号登录分开写）');
  ok(logs.some(l => l.act === 'adm_acct' && l.name === 'banker' && l.from === 'econ' && l.role === 'view' && l.by === 'chief') && logs.some(l => l.act === 'adm_acct' && l.name === 'judge' && l.pw === 1) && !logs.some(l => JSON.stringify(l).includes('judge-new-pass')), '改管理员账号记进流水（谁改的、从什么改成什么），不记密码');
  const audit = await adm('GET', '/api/admin/audit');
  ok(audit.ok && audit.rows.some(r => r.act === 'adm_acct') && audit.rows.some(r => r.act === 'adm_login'), '管理后台「操作记录」里看得到这些');
  const fails = [];
  for (let i = 0; i < 21; i++) fails.push((await login({ name: 'chief', password: 'guess-guess-' + i }, '5.6.9.9')).status);
  ok(fails.slice(0, 20).every(s => s === 403) && fails[20] === 429 && (await login({ name: 'chief', password: 'chief-pass-00004' }, '5.6.9.9')).status === 429, '登录试错 20 次也锁一小时，和口令一样', fails.slice(-3));
}

section('删除账号（软删除）：登录不了、不上榜、挂单看不到，数据一样不动；恢复后什么都不丢；批量封号、解封、删除、恢复；导出 CSV');
{
  T = nextNoon();
  const raw = (path, tok = ADMIN) => worker.fetch(new Request('https://w.test' + path, { headers: { Authorization: 'Bearer ' + tok, 'CF-Connecting-IP': '1.2.3.4' } }), ENV, { waitUntil() {} });
  const batch = (body, tok = ADMIN) => adm('POST', '/api/admin/batch', body, tok);
  const D = await newUser('delme');
  await econ(D.token, 'sync');
  const [x1] = grant(D.uid, [{ k: 'qf_p2' }, { k: 'gc_wolf', st: 3 }]);
  const lst = await econ(D.token, 'list', { i: x1.i, price: 77 });
  await call('POST', '/api/profile', { profile: profOf(D.uid), ledger: { deltas: [], ev: 0 }, prog: { deltas: [{ id: 'de1e7e0001', d: { netWins: 40, netLosses: 1 } }] } }, D.token);
  const snap = () => ({
    user: (({ deleted_at, ...r }) => r)(row('SELECT * FROM users WHERE id = ?', D.uid)),
    econ: row('SELECT * FROM econ WHERE uid = ?', D.uid),
    log: ENV.DB.raw.prepare("SELECT * FROM econ_log WHERE uid = ? AND act NOT IN ('acct_del', 'acct_restore') ORDER BY id").all(D.uid),
    mkt: ENV.DB.raw.prepare('SELECT * FROM mkt WHERE seller = ? ORDER BY id').all(D.uid),
  });
  const before = snap();
  ok(lst.res.ok && before.econ && before.log.length > 0 && before.mkt.length === 1, '准备：这个号有武库、流水、一单在卖、战绩', { mkt: before.mkt.length, log: before.log.length });
  const wins0 = await call('GET', '/api/leaderboard?k=wins', undefined, undefined, '8.8.2.1');
  ok(wins0.list.some(r => r.name === 'delme'), '删除前在战绩榜上');

  ok((await batch({ op: 'delete', uids: [D.uid] })).status === 400, '删除要写原因');
  const del = await batch({ op: 'delete', uids: [D.uid], why: '玩家要求删号' });
  ok(del.ok && del.done.length === 1 && row('SELECT deleted_at FROM users WHERE id = ?', D.uid).deleted_at === T, '删除：只记下删除时间', del);
  ok((await call('GET', '/api/profile', undefined, D.token)).status === 401 && !row('SELECT 1 AS x FROM sessions WHERE user_id = ?', D.uid), '删除以后已经登录的设备都退出了');
  const li = await call('POST', '/api/login', { username: 'delme', password: 'secret123' }, undefined, '8.8.2.2');
  ok(li.status === 403 && li.deleted === true && /删除/.test(li.error), '密码对了也登录不了，说明是删除了', li);
  ok(row("SELECT note FROM auth_log WHERE uid = ? AND act = 'login_fail' ORDER BY id DESC LIMIT 1", D.uid).note === 'deleted', '登录记录里写着是删除了的号');
  ok(/已被注册/.test((await call('POST', '/api/register', { username: 'delme', password: 'secret123' }, undefined, '8.8.2.3')).error), '昵称还占着：别人注册不了，恢复不会撞名');
  const wins1 = await call('GET', '/api/leaderboard?k=wins', undefined, undefined, '8.8.2.4');
  ok(!wins1.list.some(r => r.name === 'delme') && wins1.players === wins0.players - 1, '不上排行榜，玩家总数也不算它');
  const viewer = await newUser('mktlooker');
  const mq = await market(viewer.token, 'qf_p2');
  ok(mq.ok && mq.open.length === 0 && !mq.open.some(o => o.l === lst.res.l) && mrow(lst.res.l).state === 0, '挂的单别人看不到（表里还在，没动）');
  const st = await adm('GET', '/api/admin/stats');
  ok(st.deleted >= 1, '总览里数得到删除了的号', st.deleted);
  const fd = await adm('GET', '/api/admin/find?q=delme'), fdel = await adm('GET', '/api/admin/find?del=1');
  ok(fd.users[0].deleted_at === T && fdel.users.some(u => u.id === D.uid) && fdel.users.every(u => u.deleted_at > 0), '找号能看到删除时间，也能只看删除了的');
  ok((await adm('GET', '/api/admin/econ?uid=' + D.uid)).deletedAt === T, '账号详情写着删除了');
  ok((await batch({ op: 'delete', uids: [D.uid], why: '再删一次' })).skip[0].why === '已经删除了', '删过的再删：跳过，说明原因');
  const mid = snap();
  ok(JSON.stringify(mid) === JSON.stringify(before), '删除期间：账号、武库、流水、市场记录一个字都没变');

  T += 3600e3;
  const res = await batch({ op: 'restore', uids: [D.uid], why: '玩家回来了' });
  ok(res.ok && res.done.length === 1 && row('SELECT deleted_at FROM users WHERE id = ?', D.uid).deleted_at === 0, '恢复', res);
  ok(JSON.stringify(snap()) === JSON.stringify(before), '恢复以后数据和删除前一模一样，什么都没丢');
  const li2 = await call('POST', '/api/login', { username: 'delme', password: 'secret123' }, undefined, '8.8.2.5');
  ok(li2.ok && li2.uid === D.uid, '原来的密码照常登录');
  const s2 = await econ(li2.token, 'sync');
  ok(s2.ok && s2.state.inv.length === 1 && s2.state.lst.length === 1 && s2.ledger.ink === before.econ.ink, '武库、在卖的单、墨锭都还在', s2.state && s2.state.inv.length);
  const mq2 = await market(viewer.token, 'qf_p2');
  ok(mq2.open.some(o => o.l === lst.res.l), '挂的单又看得到了');
  ok((await call('GET', '/api/leaderboard?k=wins', undefined, undefined, '8.8.2.6')).list.some(r => r.name === 'delme'), '又上排行榜了');
  ok((await batch({ op: 'restore', uids: [D.uid], why: '再恢复' })).skip[0].why === '没有删除', '没删的恢复：跳过');
  const lg = ENV.DB.raw.prepare("SELECT act, detail FROM econ_log WHERE uid = ? AND act IN ('acct_del', 'acct_restore') ORDER BY id").all(D.uid).map(r => ({ act: r.act, ...parseDetail(r.detail) }));
  ok(lg.length === 2 && lg[0].by === 'admin' && lg[0].why === '玩家要求删号' && lg[1].since > 0, '删除、恢复各记一条流水（谁、原因、什么时候删的）', lg);
  const au = await adm('GET', '/api/admin/audit');
  ok(au.rows.some(r => r.act === 'acct_del' && r.uid === D.uid) && au.rows.some(r => r.act === 'acct_restore'), '「操作记录」里看得到');

  const us = [await newUser('sdbulk1'), await newUser('sdbulk2'), await newUser('sdbulk3')];
  const ids = us.map(u => u.uid);
  const bb = await batch({ op: 'ban', uids: [...ids, 'nobody-here', ids[0]], days: 2, why: '批量封号测试' });
  ok(bb.ok && bb.done.length === 3 && bb.skip.length === 1 && bb.skip[0].why === '没有这个账号', '批量封号：3 个号封上，没有的号跳过，重复的只算一次', bb);
  ok(ids.every(id => row('SELECT ban_until FROM sanctions WHERE uid = ?', id).ban_until === T + 2 * 86400e3), '每个号都封到两天后');
  ok((await econ(us[1].token, 'sync')).status === 403, '封了的号不能动武库');
  const bp = await batch({ op: 'pardon', uids: ids, why: '批量解封测试' });
  ok(bp.done.length === 3 && ids.every(id => row('SELECT ban_until, perm FROM sanctions WHERE uid = ?', id).ban_until === 0), '批量解封');
  const bperm = await batch({ op: 'ban', uids: [ids[2]], perm: true, why: '永久' });
  ok(bperm.ok && row('SELECT perm FROM sanctions WHERE uid = ?', ids[2]).perm === 1, '批量也能永久封');
  await batch({ op: 'pardon', uids: [ids[2]], why: '解开' });
  const bd = await batch({ op: 'delete', uids: ids, why: '批量删除测试' });
  ok(bd.done.length === 3 && ids.every(id => row('SELECT deleted_at FROM users WHERE id = ?', id).deleted_at > 0), '批量删除');
  ok((await batch({ op: 'restore', uids: ids, why: '批量恢复测试' })).done.length === 3 && ids.every(id => row('SELECT deleted_at FROM users WHERE id = ?', id).deleted_at === 0), '批量恢复');
  ok((await batch({ op: 'ban', uids: ids, why: '没写天数' })).status === 400 && (await batch({ op: 'nuke', uids: ids, why: 'x1' })).status === 400, '封号没写天数、不认识的操作：不收');
  ok((await batch({ op: 'pardon', uids: Array.from({ length: 101 }, (_, i) => 'u_' + i), why: '太多了' })).status === 400 && (await batch({ op: 'pardon', uids: [], why: '空的' })).status === 400, '一次 1 到 100 个');
  const vw = await call('POST', '/api/admin/login', { password: ADMIN }, undefined, '5.6.1.1');
  await adm('POST', '/api/admin/admins', { name: 'looker', role: 'view', password: 'looker-pass-0001', why: '测试' }, vw.token);
  await adm('POST', '/api/admin/admins', { name: 'judge2', role: 'ban', password: 'judge2-pass-0001', why: '测试' }, vw.token);
  const lk = await call('POST', '/api/admin/login', { name: 'looker', password: 'looker-pass-0001' }, undefined, '5.6.1.1');
  const jd = await call('POST', '/api/admin/login', { name: 'judge2', password: 'judge2-pass-0001' }, undefined, '5.6.1.1');
  ok((await batch({ op: 'delete', uids: [ids[0]], why: '只能看' }, lk.token)).status === 403, '只能看：批量操作不行');
  const jdel = await batch({ op: 'delete', uids: [ids[0], 'Dev'], why: '封禁和账号' }, jd.token);
  ok(jdel.done.length === 1 && jdel.skip.some(x => x.name === 'Dev' && /全部/.test(x.why)), '封禁和账号：能删普通号，删 Dev 要「全部」', jdel);
  await batch({ op: 'restore', uids: [ids[0]], why: '恢复' }, jd.token);

  legacyUser('u_csvformula1', '=HYPERLINK("x")', {});
  const ex = await raw('/api/admin/export');
  const bytes = new Uint8Array(await ex.clone().arrayBuffer()), csv = await ex.text(), lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  ok(ex.status === 200 && /text\/csv/.test(ex.headers.get('Content-Type')) && /attachment; filename="renying-users-\d{4}-\d\d-\d\d\.csv"/.test(ex.headers.get('Content-Disposition')) && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, '导出 CSV：是附件，开头有 BOM（Excel 打开中文不乱码）');
  ok(lines[0] === 'uid,username,created_at,updated_at,econ_at,ink,strikes,ban,deleted_at' && lines.length - 1 === row('SELECT COUNT(*) AS n FROM users').n, '第一行是表头，一个号一行', lines[0]);
  ok(lines.some(l => l.startsWith('u_csvformula1,"\'=HYPERLINK(""x"")"')), '= 开头的昵称前面加了 \'，Excel 不会当成公式；引号转义了', lines.find(l => l.startsWith('u_csvformula1')));
  ok(lines.find(l => l.startsWith(ids[2] + ',')).split(',')[6] === '0' && !lines.some(l => /secret|password|salt/i.test(l)), '没有密码、盐这些');
  await batch({ op: 'delete', uids: [ids[1]], why: '导出测试' });
  const ex2 = (await (await raw('/api/admin/export?del=1')).text()).replace(/^﻿/, '').trim().split('\r\n');
  ok(ex2.length - 1 === row('SELECT COUNT(*) AS n FROM users WHERE deleted_at > 0').n && ex2.slice(1).every(l => /Z$/.test(l)), 'del=1 只导出删除了的（最后一列是删除时间）');
  const ex3 = (await (await raw('/api/admin/export?q=sdbulk')).text()).replace(/^﻿/, '').trim().split('\r\n');
  ok(ex3.length === 4 && ex3.slice(1).every(l => /,sdbulk\d,/.test(l)), '按昵称开头导出', ex3.length);
  ok((await raw('/api/admin/export', lk.token)).status === 403, '只能看：不能导出');
  ok(row("SELECT COUNT(*) AS n FROM econ_log WHERE act = 'acct_export'").n === 3 && parseDetail(row("SELECT detail FROM econ_log WHERE act = 'acct_export' ORDER BY id DESC LIMIT 1").detail).n === 3, '每次导出记一条流水（导了几个）');
  await batch({ op: 'restore', uids: [ids[1]], why: '收尾' });
}

section('数据库迁移：cloudflare/migrations/ 按编号跑，记在 schema_migrations；空库、以前的库都能升到一样的结构；同时跑不重复；出错整个退回');
{
  const fresh = async () => (await import(new URL(FILE, ROOT).href + '?m=' + Math.random())).default;   // 新的模块 = 新的 Worker 实例
  const { MIGRATIONS } = await import(new URL('cloudflare/migrations.gen.js', ROOT));
  const hit1 = (w, env, ip = '6.6.6.' + Math.floor(Math.random() * 250)) => w.fetch(new Request('https://w.test/api/flags', { headers: { 'CF-Connecting-IP': ip } }), env, { waitUntil() {} });
  const cols = (db, t) => db.prepare(`SELECT name, type, "notnull" AS nn, dflt_value AS d, pk FROM pragma_table_info('${t}')`).all().map(r => [r.name, r.type, r.nn, r.d, r.pk].join('|')).sort();
  const tables = db => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  const indexes = db => db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  const tsql = (db, t) => db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(t).sql;
  const ref = new DatabaseSync(':memory:');
  ref.exec(readFileSync(new URL('cloudflare/schema.sql', ROOT), 'utf8'));
  const applied = db => db.prepare('SELECT id, name, sum FROM schema_migrations ORDER BY id').all().map(r => ({ ...r }));
  const sameAsRef = (db, label) => {
    const want = tables(ref), have = tables(db).filter(t => t !== 'schema_migrations');
    ok(JSON.stringify(want) === JSON.stringify(have), label + '：表和 cloudflare/schema.sql 一样', { missing: want.filter(t => !have.includes(t)), extra: have.filter(t => !want.includes(t)) });
    const diff = want.filter(t => have.includes(t) && JSON.stringify(cols(ref, t)) !== JSON.stringify(cols(db, t)));
    ok(!diff.length, label + '：每张表的列（类型、非空、默认值、主键）都一样', diff.map(t => ({ t, ref: cols(ref, t), db: cols(db, t) })));
    ok(JSON.stringify(indexes(ref)) === JSON.stringify(indexes(db)), label + '：索引一样', { ref: indexes(ref), db: indexes(db) });
    const checks = ['econ', 'mkt', 'sanctions'].filter(t => (tsql(db, t).match(/CHECK/g) || []).length !== (tsql(ref, t).match(/CHECK/g) || []).length);
    ok(!checks.length, label + '：武库存档、市场、处罚三张表带着 CHECK 约束', checks);
  };

  // 1. 空库
  const e1 = { DB: makeD1(), ADMIN_SECRET: ADMIN };
  e1.DB.raw.exec('PRAGMA foreign_keys = ON');   // D1 默认开着外键
  const r1 = await hit1(await fresh(), e1);
  const ap1 = applied(e1.DB.raw);
  ok(r1.status === 200 && ap1.length === MIGRATIONS.length && ap1.every((m, i) => m.id === i + 1 && m.name === MIGRATIONS[i].name && m.sum === MIGRATIONS[i].sum), '空库：第一次请求把迁移按编号全跑了，记在 schema_migrations', ap1.map(m => m.name));
  ok(MIGRATIONS.length >= 6 && MIGRATIONS.every((m, i) => /^\d{4}_[a-z0-9_]+$/.test(m.name) && +m.name.slice(0, 4) === i + 1), '迁移文件从 0001 连续编号', MIGRATIONS.map(m => m.name));
  sameAsRef(e1.DB.raw, '空库');
  const reg1 = await e1.DB.batch([e1.DB.prepare("INSERT INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES ('u1', '{}', '{}', 5, 0, 0)")]);
  const bad = sql => { try { e1.DB.raw.exec(sql); return false; } catch (e) { return /CHECK/i.test(e.message); } };
  ok(reg1 && bad("UPDATE econ SET ink = -1 WHERE uid = 'u1'") && bad("INSERT INTO mkt (id, seller, k, st, item_json, price, at, state) VALUES ('m1', 'u1', 'qf_p1', -1, '{}', 10, 0, 7)")
    && bad("INSERT INTO mkt (id, seller, k, st, item_json, price, at) VALUES ('m2', 'u1', 'qf_p1', -1, '{}', 0, 0)") && bad("INSERT INTO sanctions (uid, strikes) VALUES ('u1', -2)"),
    'CHECK 挡得住：负墨锭、不认识的挂单状态、0 标价、负的记过次数都存不进去');
  const r1b = await hit1(await fresh(), e1);
  ok(r1b.status === 200 && applied(e1.DB.raw).length === MIGRATIONS.length, '再来一个 Worker 实例：没有要跑的，不重跑');

  // 2. 迁移文件出现以前的库：以前的 Worker 启动时建的表（0001）和后来加的列（0002 ~ 0004），没有 schema_migrations；里面有数据
  const e2 = { DB: makeD1(), ADMIN_SECRET: ADMIN }, d2 = e2.DB.raw;
  d2.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS.slice(0, 4)) for (const sql of m.sql) { try { d2.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
  const pr = await (await fresh()).fetch(new Request('https://w.test/api/health'), e2, { waitUntil() {} });   // 健康检查不碰数据库
  ok(pr.status === 200 && !tables(d2).includes('schema_migrations'), '准备：一个老库（没有 schema_migrations）');
  d2.exec(`INSERT INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at) VALUES ('u_old1', 'oldtimer', 'h', 's', '{"name":"oldtimer"}', 1, 2);
    INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ('${'a'.repeat(64)}', 'u_old1', ${T}, ${T + 86400e3});
    INSERT INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES ('u_old1', '{"v":1}', '{}', 1234, 7, 3), ('u_neg', '{}', '{}', -5, 1, 3);
    INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, buyer, done_at, paid, tx) VALUES ('mk1', 'u_old1', 'qf_p1', -1, '{"i":1}', 50, 4, 0, NULL, NULL, 0, 't1'), ('mk2', 'u_old1', 'qf_p1', 3, '{"i":2}', 80, 5, 1, 'u_x', 6, 1, 't2'), ('mk3', 'u_old1', 'qf_p1', -1, '{"i":3}', 80, 5, 9, NULL, NULL, 2, NULL);
    INSERT INTO sanctions (uid, strikes, ban_until, perm, log_json, at, pardon) VALUES ('u_old1', 2, 99, 0, '[{"r":"x"}]', 8, 0);
    INSERT INTO econ_log (uid, at, act, ok, detail) VALUES ('u_old1', 9, 'sync', 1, '{}');`);
  const before2 = { econ: d2.prepare("SELECT * FROM econ WHERE uid = 'u_old1'").get(), mkt: d2.prepare("SELECT * FROM mkt WHERE id IN ('mk1', 'mk2') ORDER BY id").all(), sanc: d2.prepare('SELECT * FROM sanctions').all(), log: d2.prepare('SELECT * FROM econ_log').all(), users: d2.prepare('SELECT * FROM users').all() };
  const rnd = Math.random; Math.random = () => 0.5;   // 2% 的请求会顺手清理过期的流水和挂单，这里的老数据时间戳很早，别让它被清掉
  const r2 = await hit1(await fresh(), e2, '6.6.6.2').finally(() => { Math.random = rnd; });
  ok(r2.status === 200 && applied(d2).length === MIGRATIONS.length, '老库：第一次请求把迁移全跑完（以前加过的列跳过，不报错）', applied(d2).map(m => m.name));
  sameAsRef(d2, '老库');
  const after2 = { econ: d2.prepare("SELECT * FROM econ WHERE uid = 'u_old1'").get(), mkt: d2.prepare("SELECT * FROM mkt WHERE id IN ('mk1', 'mk2') ORDER BY id").all(), sanc: d2.prepare('SELECT * FROM sanctions').all(), log: d2.prepare('SELECT * FROM econ_log').all(), users: d2.prepare('SELECT * FROM users').all().map(({ deleted_at, ...r }) => r) };
  ok(JSON.stringify(after2) === JSON.stringify(before2), '老库的数据一行没丢、一个字没变（武库、市场、处罚、流水、账号）');
  ok(d2.prepare('SELECT deleted_at FROM users').get().deleted_at === 0, '新加的 deleted_at 列，老号都是 0（没删）');
  ok(d2.prepare('SELECT COUNT(*) AS n FROM sessions').get().n === 1, '重建三张表没有连带删掉登录（外键开着也没事）');
  ok(d2.prepare("SELECT ink FROM econ WHERE uid = 'u_neg'").get().ink === 0 && d2.prepare("SELECT state, paid FROM mkt WHERE id = 'mk3'").get().state === 2 && d2.prepare("SELECT paid FROM mkt WHERE id = 'mk3'").get().paid === 1, '不合规的老数据夹回范围里：负墨锭当 0、不认识的挂单状态当撤下');
  const pf = await (await fresh()).fetch(new Request('https://w.test/api/profile', { headers: { Authorization: 'Bearer ' + 'a'.repeat(64), 'CF-Connecting-IP': '6.6.7.1' } }), e2, { waitUntil() {} });
  ok(pf.status === 200 && (await pf.json()).uid === 'u_old1', '升级以后老号的登录照样能用');

  // 3. 更早的库：users 没有密码那两列，errs 没有耗时，sessions 没有设备
  const e3 = { DB: makeD1(), ADMIN_SECRET: ADMIN }, d3 = e3.DB.raw;
  d3.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, profile_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE errs (sig TEXT PRIMARY KEY, kind TEXT NOT NULL, msg TEXT NOT NULL, src TEXT NOT NULL, stack TEXT NOT NULL, meta TEXT NOT NULL, n INTEGER NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL);
    INSERT INTO users VALUES ('u_anc', 'ancient', 'h', 's', '{}', 1, 1);`);
  const r3 = await hit1(await fresh(), e3);
  ok(r3.status === 200 && applied(d3).length === MIGRATIONS.length, '更早的库：缺的列一个个补上');
  sameAsRef(d3, '更早的库');
  ok(d3.prepare('SELECT password_algo, deleted_at FROM users').get().password_algo === 'sha256-v1', '老号的密码存法记成 sha256-v1（下次登录换成 PBKDF2）');

  // 3b. 读不了表结构（万一 D1 不让用 pragma_table_info）：ALTER 单独试，已经有的列照样跳过
  const e3b = { DB: makeD1(), ADMIN_SECRET: ADMIN }, d3b = e3b.DB.raw, prep = e3b.DB.prepare;
  e3b.DB.prepare = sql => { if (/pragma_table_info/.test(sql)) throw new Error('not authorized'); return prep(sql); };
  for (const m of MIGRATIONS.slice(0, 4)) for (const sql of m.sql) { try { d3b.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
  const r3b = await hit1(await fresh(), e3b);
  ok(r3b.status === 200 && applied(d3b).length === MIGRATIONS.length, '读不了表结构也能升级（ALTER 单独试，重复的列跳过）');
  sameAsRef(d3b, '读不了表结构');

  // 4. 两个 Worker 实例同时碰到空库：每个迁移只跑一次，两个请求都成功
  const e4 = { DB: makeD1(), ADMIN_SECRET: ADMIN };
  const [wa, wb, wc] = [await fresh(), await fresh(), await fresh()];
  const rs = await Promise.all([hit1(wa, e4), hit1(wb, e4), hit1(wc, e4)]);
  ok(rs.every(r => r.status === 200) && applied(e4.DB.raw).length === MIGRATIONS.length, '三个实例同时跑：都成功，每个迁移只记一次', rs.map(r => r.status));
  sameAsRef(e4.DB.raw, '同时跑');

  // 5. 中途出错：整个迁移退回，什么都不改；修好以后下一次请求接着跑
  const e5 = { DB: makeD1(), ADMIN_SECRET: ADMIN }, d5 = e5.DB.raw;
  for (const m of MIGRATIONS.slice(0, 5)) for (const sql of m.sql) { try { d5.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
  d5.exec("INSERT INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES ('u5', '{}', '{}', 9, 0, 0); CREATE TABLE mkt_new (x INTEGER)");   // 占住 0006 要用的表名
  const w5 = await fresh(), warn0 = console.error, warn1 = console.warn;
  console.error = () => {}; console.warn = () => {};
  const r5 = await hit1(w5, e5);
  console.error = warn0; console.warn = warn1;
  ok(r5.status >= 500 && applied(d5).length === 5 && !applied(d5).some(m => m.id === 6), '0006 出错：这次请求报错，0001 ~ 0005 记上了，0006 没记', { status: r5.status, ap: applied(d5).map(m => m.id) });
  ok(!/CHECK/.test(tsql(d5, 'econ')) && tables(d5).includes('econ') && d5.prepare("SELECT ink FROM econ WHERE uid = 'u5'").get().ink === 9 && !tables(d5).includes('econ_new'), '0006 整个退回：econ 还是原来那张表，数据都在，没有留下半截');
  d5.exec('DROP TABLE mkt_new');
  const r5b = await hit1(w5, e5);
  ok(r5b.status === 200 && applied(d5).length === MIGRATIONS.length && /CHECK/.test(tsql(d5, 'econ')), '修好以后同一个实例下一次请求接着跑完');

  // 6. 跑过的文件又改了：不重跑，日志里提示
  e1.DB.raw.exec("UPDATE schema_migrations SET sum = 'changed' WHERE id = 1");
  const warns = [], ow = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  const r6 = await hit1(await fresh(), e1);
  console.warn = ow;
  ok(r6.status === 200 && warns.some(w => /0001_init/.test(w) && /新的迁移文件/.test(w)), '改过跑过的迁移文件：照常服务，日志提示要加新文件', warns);
}

section('一次性、按天按周的奖励：领没领过记在服务器上，换设备、退出再登录、清本机都领不到第二次');
{
  T = nextNoon();
  const u = await newUser('farmer', { ink: 100, stageStars: { '1.2': 3 }, saga: { qingfeng: { r: 0, s: 5, f: 'a', c: 0, e: ['a'], t: 1 }, tieshan: { r: 0, s: 2, f: '', c: 0, e: [], t: 1 } } });
  // Registration no longer imports untrusted progress; seed this fixture through the
  // server-side profile row so the reward-accounting assertions remain meaningful.
  const farmerProfile = profOf(u.uid);
  farmerProfile.stageStars = { '1.2': 3 };
  farmerProfile.saga = { qingfeng: { r: 0, s: 5, f: 'a', c: 0, e: ['a'], t: 1 }, tieshan: { r: 0, s: 2, f: '', c: 0, e: [], t: 1 } };
  ENV.DB.raw.prepare('UPDATE users SET profile_json = ? WHERE id = ?').run(JSON.stringify(farmerProfile), u.uid);
  const inkOf = async tok => (await call('GET', '/api/profile', undefined, tok)).ledger.ink;
  const ink0 = await inkOf(u.token);
  const t0 = await econ(u.token, 'task', { id: 'd1' });
  ok(t0.res && t0.res.err === '任务还没完成', '每日任务：没打过服务器认的对局，领不了', t0.res);
  ok(await playMatches(u.token, 1) === 1, '打一局服务器认的对局');
  const t1 = await econ(u.token, 'task', { id: 'd1' });
  ok(t1.res && t1.res.ok && t1.res.gain === 30 && t1.ledger.ink === ink0 + 30, '领到 30，墨锭是服务器发的', [t1.res, t1.ledger && t1.ledger.ink]);
  ok(t1.state.rw.dc.includes('d1') && C.taskView(t1.state, T).find(x => x.id === 'd1').claimed, '领取记录在服务器的武库存档里');
  const li = await call('POST', '/api/login', { username: 'farmer', password: 'secret123' }, undefined, '9.8.7.6');
  const t2 = await econ(li.token, 'task', { id: 'd1' });
  ok(t2.res && t2.res.err === '已经领过了' && t2.ledger.ink === ink0 + 30, '退出再登录（换一台设备，本机什么都没有）：已经领过了', t2.res);
  ok((await econ(li.token, 'task', { id: 'w1' })).res.err === '任务还没完成' && (await econ(li.token, 'task', { id: 'zz' })).res.err === '没有这个任务', '周任务没打够不给；没有的任务不认');
  T = nextNoon();
  ok((await econ(li.token, 'task', { id: 'd1' })).res.err === '任务还没完成', '第二天：进度清零，要重新打');
  await playMatches(li.token, 1);
  ok((await econ(li.token, 'task', { id: 'd1' })).res.gain === 30, '第二天打完再领一次');
  const tu = [await econ(u.token, 'tut'), await econ(li.token, 'tut')];
  ok(tu[0].res.gain === C.RW.tut && tu[1].res.err === '已经领过了', '新手教程：每个号一次', tu.map(x => x.res));
  const st = [await econ(u.token, 'stars', { id: '1.1', n: 2 }), await econ(u.token, 'stars', { id: '1.1', n: 2 }), await econ(li.token, 'stars', { id: '1.1', n: 3 }), await econ(u.token, 'stars', { id: '1.2', n: 3 }), await econ(u.token, 'stars', { id: '99.1', n: 3 }), await econ(u.token, 'stars', { id: '1.6', n: 3 })];
  ok(st[0].res.gain === 60 && st[1].res.gain === 0 && st[2].res.gain === 30, '关卡星：每颗只给一次，拿到更多星补差', st.slice(0, 3).map(x => x.res));
  ok(st[3].res.gain === 0, '注册时存档里已经有的星（1.2 三星）当成领过了', st[3].res);
  ok(st[4].res.err === '没有这一关' && st[5].res.err === '没有这一关', '编出来的关卡不认（一位侠客一章、每章 5 关）', [st[4].res, st[5].res]);
  const sg = [await econ(u.token, 'saga', { h: 'cixian', n: 1 }), await econ(u.token, 'saga', { h: 'cixian', n: 1 }), await econ(li.token, 'saga', { h: 'cixian', n: 5, end: 'bell' }),
    await econ(u.token, 'saga', { h: 'cixian', n: 2 }), await econ(u.token, 'saga', { h: 'cixian', n: 5, end: 'needle' }), await econ(u.token, 'saga', { h: 'cixian', n: 5, end: 'third' }), await econ(u.token, 'saga', { h: 'cixian', n: 5, end: 'bell' })];
  ok(sg[0].res.gain === 40 && sg[1].res.gain === 0, '列传：每节第一次走完给 40，重走、刷新回来再走都不给', sg.slice(0, 2).map(x => x.res));
  ok(sg[2].res.gain === 190 && sg[3].res.gain === 0, '第一个结局：这一节 40 + 结局 150；拿到结局以后再走的节不给', [sg[2].res, sg[3].res]);
  ok(sg[4].res.gain === 150 && sg[5].res.gain === 0 && sg[6].res.gain === 0, '第二个结局再给 150；编出来的第三个、拿过的都不给', sg.slice(4).map(x => x.res));
  const sd = [await econ(u.token, 'saga', { h: 'qingfeng', n: 3 }), await econ(u.token, 'saga', { h: 'tieshan', n: 2 }), await econ(u.token, 'saga', { h: 'tieshan', n: 3 })];
  ok(sd[0].res.gain === 0 && sd[1].res.gain === 0 && sd[2].res.gain === 40, '注册时存档里已有的列传进度当成领过了（走完的那部全不给；走到第 2 节的从第 3 节给）', sd.map(x => x.res));
  // 清掉本机进度再传一份旧存档（不带 prog）：关卡星、列传、胜场都退不回去
  const before = profOf(u.uid);
  await call('POST', '/api/profile', { profile: { ...before, stageStars: {}, saga: {}, netWins: 0 }, ledger: { deltas: [], ev: 0 } }, u.token);
  const after = profOf(u.uid);
  ok(after.stageStars['1.2'] === 3 && after.saga.qingfeng && after.saga.qingfeng.e.includes('a'), '传一份清空的旧存档：关卡星、列传进度不会被退回去', [before.stageStars, after.stageStars, before.saga && Object.keys(before.saga)]);
  const pr = await call('POST', '/api/profile', { profile: { ...after, netWins: 999 } }, u.token);
  ok(pr.ok && profOf(u.uid).netWins === (before.netWins || 0), '不带 prog 报的胜场绝对数不认', profOf(u.uid).netWins);
  ok(await inkOf(u.token) === ink0 + 30 + 30 + C.RW.tut + 90 + 40 + 190 + 150 + 40, '前后加起来的墨锭一分不多', await inkOf(u.token));
  // 规则核心：活动任务、系统补偿只在活动期间，每个号一次
  const env = now => ({ now, rnd: C.rng(1), uid: 'ev', ink: 0, skins: [], equip: {}, server: true });
  const inEv = C.EVENT.start + 86400e3, after2 = C.EVENT.end + 1;
  let s = C.blank();
  for (let i = 0; i < 3; i++) { const e = env(inEv + i * 60e3); s = C.run(s, 'matchStart', { mode: 'cpu' }, e).state; const e2 = env(inEv + i * 60e3 + 30e3); s = C.run(s, 'matchEnd', { ctx: { mode: 'cpu', level: 'easy', char: 'qingfeng', win: false } }, e2).state; }
  const ev1 = env(inEv + 1e6), r1 = C.run(s, 'task', { id: 'e1000' }, ev1), ev2 = env(inEv + 2e6), r2 = C.run(r1.state, 'task', { id: 'e1000' }, ev2);
  ok(r1.res.gain === 1000 && ev1.ink === 1000 && r2.res.err === '已经领过了', '活动任务：活动期间打满 3 局人机，领一次', [r1.res, r2.res]);
  ok(C.run(s, 'task', { id: 'e1000' }, env(after2)).res.err === '活动已经结束了' && !C.taskView(s, after2).some(x => x.id === 'e1000'), '活动结束后领不了，也不显示');
  const c1 = env(inEv), cr = C.run(C.blank(), 'comp', {}, c1), c2 = C.run(cr.state, 'comp', {}, env(inEv));
  ok(cr.res.gain === C.RW.comp && c1.ink === C.RW.comp && c2.res.err === '已经领过了' && C.run(C.blank(), 'comp', {}, env(after2)).res.err === '补偿已经结束了', '系统补偿：活动期间每个号一次', [cr.res, c2.res]);
}

section('联机 ICE 列表：没配 TURN 只回 STUN；配了就带上短时凭据；拿凭据失败也照样回 STUN');
{
  const realFetch = globalThis.fetch;
  const r0 = await call('GET', '/api/ice', undefined, null, '7.7.7.1');
  ok(r0.ok && r0.turn === false && r0.iceServers.length === 1 && r0.iceServers[0].urls.every(u => u.startsWith('stun:')), '没设 TURN 的 Secret：只有 STUN', r0);
  let asked = null;
  globalThis.fetch = async (url, opts) => {
    asked = { url: String(url), auth: opts.headers.Authorization, body: JSON.parse(opts.body) };
    return new Response(JSON.stringify({ iceServers: { urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u1', credential: 'c1' } }), { status: 201 });
  };
  ENV.TURN_KEY_ID = 'kid'; ENV.TURN_KEY_API_TOKEN = 'tok';
  const r1 = await call('GET', '/api/ice', undefined, null, '7.7.7.2');
  const t = r1.iceServers && r1.iceServers.find(x => x.username);
  ok(r1.turn === true && t && t.credential === 'c1' && t.urls.length === 2 && t.urls.every(u => /^turns?:/.test(u)), '设了 Secret：带上 TURN 地址和凭据（只留 turn/turns）', r1);
  ok(asked && asked.url.includes('/turn/keys/kid/credentials/generate') && asked.auth === 'Bearer tok' && asked.body.ttl > 0 && asked.body.ttl <= 86400, '用短时凭据：向 Cloudflare 要的是几小时就过期的', asked);
  globalThis.fetch = async () => new Response('boom', { status: 500 });
  const r2 = await call('GET', '/api/ice', undefined, null, '7.7.7.3');
  ok(r2.ok && r2.turn === false && r2.iceServers.length === 1, 'Cloudflare 那边出错：退回只有 STUN，不报错', r2);
  globalThis.fetch = async () => { throw new Error('offline'); };
  const r3 = await call('GET', '/api/ice', undefined, null, '7.7.7.3');
  ok(r3.ok && r3.turn === false, '连不上 Cloudflare：同样退回 STUN', r3);
  globalThis.fetch = realFetch; delete ENV.TURN_KEY_ID; delete ENV.TURN_KEY_API_TOKEN;
  let n429 = 0; for (let i = 0; i < 62; i++) { const r = await call('GET', '/api/ice', undefined, null, '7.7.7.9'); if (r.status === 429) n429++; }
  ok(n429 === 2, '同一个 IP 一小时最多要 60 次', n429);
}

console.log(`\n${pass} 项通过，${fail} 项失败`);
Date.now = realNow;
process.exit(fail ? 1 : 0);
