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
  if (route === 'GET /api/admin/catalog') {   // 管理网页用：武器箱、每档品质的名字和颜色、每件饰品在哪个箱子哪一档、能改的经济数值
    return json({ ok: true, tiers: C.TIERS.map(t => ({ id: t, n: C.TIER[t].n, c: C.TIER[t].c })),
      cols: C.CASES.map(c => ({ id: c, name: C.COLS[c].name, prem: !!C.COLS[c].prem })),
      items: Object.keys(C.ITEM).map(k => ({ k, col: C.ITEM[k].col, tier: C.ITEM[k].tier, char: C.charOf(k) })), cfg: C.CFG_INFO });
  }
  if (route === 'GET /api/admin/stats') {   // 总览与深度数据统计
    await cfgNow(env, now);
    const one = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
    const [users, fresh, eco, open, deals, banned, gone, inkFlow, opens24, signups, inkFlow7, caseOpens, pres] = await Promise.all([
      one('SELECT COUNT(*) AS n FROM users WHERE deleted_at = 0'),
      one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - DAY_MS),
      one('SELECT COUNT(*) AS n, COALESCE(SUM(ink), 0) AS ink FROM econ'),
      one('SELECT COUNT(*) AS n FROM mkt WHERE state = 0'),
      one('SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS v FROM mkt WHERE state = 1 AND done_at > ?', now - DAY_MS),
      one('SELECT COUNT(*) AS n FROM sanctions WHERE perm = 1 OR ban_until > ?', now),
      one('SELECT COUNT(*) AS n FROM users WHERE deleted_at > 0'),
      one("SELECT COALESCE(SUM(CASE WHEN ink1 > ink0 THEN ink1 - ink0 ELSE 0 END), 0) AS inkIn, COALESCE(SUM(CASE WHEN ink0 > ink1 THEN ink0 - ink1 ELSE 0 END), 0) AS inkOut FROM econ_log WHERE at > ?", now - DAY_MS),
      one("SELECT COALESCE(SUM(CASE WHEN act = 'open' THEN 1 WHEN json_valid(detail) THEN COALESCE(json_extract(detail, '$.n'), 0) ELSE 0 END), 0) AS n FROM econ_log WHERE act IN ('open', 'openAll') AND ok = 1 AND at > ?", now - DAY_MS),
      env.DB.prepare("SELECT CAST((created_at / 86400000) AS INTEGER) AS d, COUNT(*) AS n FROM users WHERE created_at > ? GROUP BY d ORDER BY d").bind(now - 7 * DAY_MS).all(),
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
    let total = 0, rows = [];
    if (key) {
      const prefix = escKey + '%', substr = '%' + escKey + '%';
      const w = `(u.username LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.id = ? OR u.id LIKE ? ESCAPE '\\')${del ? ' AND u.deleted_at > 0' : ''}${fltCond}`;
      const tot = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w}`).bind(prefix, substr, key, prefix).first();
      total = (tot && tot.n) || 0;
      const orderClause = sortSql || `(u.username = ?) DESC, (u.username LIKE ? ESCAPE '\\') DESC, length(u.username), u.username`;
      const binds = sortSql ? [prefix, substr, key, prefix, limit, offset] : [prefix, substr, key, prefix, key, prefix, limit, offset];
      rows = (await env.DB.prepare(`SELECT ${cols} FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w} ORDER BY ${orderClause} LIMIT ? OFFSET ?`)
        .bind(...binds).all()).results || [];
    } else if (del) {
      const w = `u.deleted_at > 0${fltCond}`;
      const tot = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w}`).first();
      total = (tot && tot.n) || 0;
      rows = (await env.DB.prepare(`SELECT ${cols} FROM users u LEFT JOIN econ e ON e.uid = u.id LEFT JOIN sanctions s ON s.uid = u.id WHERE ${w} ORDER BY ${sortSql || 'u.deleted_at DESC'} LIMIT ? OFFSET ?`).bind(limit, offset).all()).results || [];
    } else {
      const w = `1=1${fltCond}`;
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
    const key = q('q'), del = q('del'), where = [], args = [];
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