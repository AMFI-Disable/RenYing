

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
