  function toCloudData(prof) {
    const p = prof || {};
    return {
      name: String(p.name || '侠客').slice(0, 24),
      ink: Math.max(0, Math.floor(p.ink || 0)),
      owned: Array.isArray(p.owned) && p.owned.length ? Array.from(new Set(p.owned)) : ['qingfeng'],
      frags: (p.frags && typeof p.frags === 'object') ? p.frags : {},
      pity: Math.max(0, Math.floor(p.pity || 0)),
      spity: Math.max(0, Math.floor(p.spity || 0)),
      skins: Array.isArray(p.skins) ? Array.from(new Set(p.skins)) : [],
      equip: (p.equip && typeof p.equip === 'object') ? p.equip : {},
      netWins: Math.max(0, Math.floor(p.netWins || 0)),
      netLosses: Math.max(0, Math.floor(p.netLosses || 0)),
      online10Unlocked: !!p.online10Unlocked,
      stageStars: (p.stageStars && typeof p.stageStars === 'object') ? p.stageStars : {},
      qfx: Math.max(0, Math.floor(p.qfx || 0)),
      rating: typeof p.rating === 'number' ? p.rating : 1100,
      placed: typeof p.placed === 'number' ? p.placed : 0,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
      ...(p.rk && typeof p.rk === 'object' ? { rk: JSON.parse(JSON.stringify(p.rk)) } : {}),
      ...(p.saga && typeof p.saga === 'object' ? { saga: cleanSaga(p.saga) } : {}),
      ...(p.armory && typeof p.armory === 'object' ? { armory: p.armory } : {})
    };
  }

  // 侠客列传的进度：每位侠客一份 { r 重走次数, s 走完几节, f 抉择, c 打赢还没选, e 拿到的结局, t 时间 }
  function cleanSaga(v) {
    const out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    for (const [h, r] of Object.entries(v)) {
      if (!/^[a-z]{2,16}$/.test(h) || !r || typeof r !== 'object') continue;
      out[h] = { r: Math.max(0, Math.min(1e6, Math.floor(+r.r || 0))), s: Math.max(0, Math.min(20, Math.floor(+r.s || 0))), f: /^[a-z0-9_]{0,16}$/.test(r.f || '') ? (r.f || '') : '', c: r.c ? 1 : 0,
        e: Array.isArray(r.e) ? Array.from(new Set(r.e.filter(x => typeof x === 'string' && /^[a-z0-9_]{1,16}$/.test(x)))).slice(0, 8) : [], t: Math.max(0, +r.t || 0) };
    }
    return out;
  }
  // 两份存档的列传进度：每位侠客取重走次数多的、再取走得远的（一样远取新的），结局合在一起
  function mergeSaga(a, b) {
    const A = cleanSaga(a), B = cleanSaga(b), out = {};
    for (const h of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const x = A[h], y = B[h];
      if (!x || !y) { out[h] = x || y; continue; }
      const win = x.r !== y.r ? (x.r > y.r ? x : y) : x.s !== y.s ? (x.s > y.s ? x : y) : (x.t >= y.t ? x : y);
      out[h] = { ...win, e: Array.from(new Set([...x.e, ...y.e])) };
    }
    return out;
  }

  // 比较两份存档的进度用：墨锭走账本、时间和名字不算；对象按键排序，字符串数组不看顺序
  function progressKey(p) {
    const o = toCloudData(p);
    delete o.ink; delete o.updatedAt; delete o.name; delete o.armory;
    const canon = v => Array.isArray(v) ? (v.every(x => typeof x !== 'object') ? v.slice().sort() : v.map(canon))
      : v && typeof v === 'object' ? Object.keys(v).sort().reduce((a, k) => (a[k] = canon(v[k]), a), {}) : v;
    return JSON.stringify(canon(o));
  }

  // 双向合并两个存档（保留双方拥有的全部角色/皮肤，墨锭/碎片/星级/战绩取最优，绝不丢弃任何进度）
  function mergeProfiles(p1, p2) {
    if (!p1 && !p2) return null;
    if (!p1) return toCloudData(p2);
    if (!p2) return toCloudData(p1);

    const owned = Array.from(new Set([...(p1.owned || ['qingfeng']), ...(p2.owned || ['qingfeng'])]));
    const skins = Array.from(new Set([...(p1.skins || []), ...(p2.skins || [])]));

    const frags = {};
    for (const [k, v] of Object.entries(p1.frags || {})) frags[k] = Math.max(frags[k] || 0, Math.floor(+v || 0));
    for (const [k, v] of Object.entries(p2.frags || {})) frags[k] = Math.max(frags[k] || 0, Math.floor(+v || 0));

    const stageStars = {};
    for (const [k, v] of Object.entries(p1.stageStars || {})) stageStars[k] = Math.max(stageStars[k] || 0, Math.floor(+v || 0));
    for (const [k, v] of Object.entries(p2.stageStars || {})) stageStars[k] = Math.max(stageStars[k] || 0, Math.floor(+v || 0));

    // 装备装束：优先保留较新更新者的装备，若没有则取另一方
    const newer = (p1.updatedAt || 0) >= (p2.updatedAt || 0) ? p1 : p2;
    const older = newer === p1 ? p2 : p1;
    const equip = Object.assign({}, older.equip || {}, newer.equip || {});
    // 清理未拥有的皮肤装备
    const ownedSkinSet = new Set(skins);
    for (const [cid, sk] of Object.entries(equip)) {
      if (sk && !ownedSkinSet.has(sk)) delete equip[cid];
    }

    const merged = {
      name: (newer.name && newer.name !== '侠客') ? newer.name : (older.name || '大侠'),
      ink: Math.max(Math.floor(+p1.ink || 0), Math.floor(+p2.ink || 0)),
      owned,
      frags,
      pity: Math.max(Math.floor(+p1.pity || 0), Math.floor(+p2.pity || 0)),
      spity: Math.max(Math.floor(+p1.spity || 0), Math.floor(+p2.spity || 0)),
      skins,
      equip,
      // These counters are server-owned increments, not independent snapshots.
      // progAdopt() reconciles local increments; taking max here can create a
      // loss without its matching win when two devices have different totals.
      netWins: Math.floor(+p2.netWins || 0),
      netLosses: Math.floor(+p2.netLosses || 0),
      rating: Math.max(Math.floor(+p1.rating || 1100), Math.floor(+p2.rating || 1100)),
      placed: Math.max(Math.floor(+p1.placed || 0), Math.floor(+p2.placed || 0)),
      stageStars,
      qfx: Math.max(Math.floor(+p1.qfx || 0), Math.floor(+p2.qfx || 0)),
      online10Unlocked: !!(p1.online10Unlocked || p2.online10Unlocked),
      ...(p1.saga || p2.saga ? { saga: mergeSaga(p1.saga, p2.saga) } : {}),
      updatedAt: Math.max(typeof p1.updatedAt === 'number' ? p1.updatedAt : 0, typeof p2.updatedAt === 'number' ? p2.updatedAt : 0, Date.now())
    };

    if (p1.rk || p2.rk) {
      merged.rk = Object.assign({}, (older.rk && typeof older.rk === 'object') ? older.rk : {}, (newer.rk && typeof newer.rk === 'object') ? newer.rk : {});
    }
    if (p1.armory || p2.armory) {
      merged.armory = newer.armory || older.armory;
    }

    return merged;
  }

  /* ---------- 8. 人机验证与 api()：所有请求都走这里 ---------- */
  // 核心 HTTP 异步请求封装
  // 人机验证：服务器回 need: 'turnstile' 时弹一个框（Cloudflare Turnstile），拿到结果再重发。
  // site key 跟着 /api/flags 下来；服务器没开人机验证时它是空的，这一段什么都不做。玩家点取消就算没过
  let tsKey = '', tsLoading = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!tsLoading) tsLoading = new Promise((ok, bad) => {
      const sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      sc.async = true;
      sc.onload = () => (window.turnstile ? ok(window.turnstile) : bad(new Error('人机验证加载不出来')));
      sc.onerror = () => { tsLoading = null; bad(new Error('人机验证加载不出来，检查一下网络')); };
      document.head.appendChild(sc);
    });
    return tsLoading;
  }
  async function turnstileToken() {
    if (!tsKey) await loadFlags();
    if (!tsKey || typeof document === 'undefined') return '';
    const ts = await loadTurnstile();
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'ry-turnstile';
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(5,8,14,.72);display:flex;align-items:center;justify-content:center';
      box.innerHTML = '<div style="background:#111824;border:1px solid rgba(255,255,255,.14);padding:18px 20px;border-radius:10px;text-align:center;color:#ece8e1;font:14px/1.6 system-ui,sans-serif">'
        + '<p style="margin:0 0 10px">先确认一下你不是机器人</p><div data-ts></div>'
        + '<button type="button" data-ts-x style="margin-top:10px;background:none;border:1px solid rgba(255,255,255,.3);color:inherit;padding:4px 14px;border-radius:6px;cursor:pointer;font:inherit">取消</button></div>';
      document.body.appendChild(box);
      let id = null, over = false;
      const done = t => {
        if (over) return;
        over = true;
        try { if (id !== null) ts.remove(id); } catch (e) {}
        box.remove();
        resolve(t || '');
      };
      box.querySelector('[data-ts-x]').addEventListener('click', () => done(''));
      try {
        id = ts.render(box.querySelector('[data-ts]'), { sitekey: tsKey, callback: t => done(t), 'error-callback': () => done(''), 'expired-callback': () => done('') });
      } catch (e) { done(''); }
    });
  }

  async function api(path, options = {}, retried, verified) {
    const base = getEndpoint();
    const url = base + path;
    const authed = !/^\/api\/(login|register|refresh)$/.test(path);
    const quiet = path === '/api/logout';   // 退出时 401 很正常，不算登录过期
    // token 快过期了先换（网页关闭时发的 keepalive 来不及，直接发）
    if (authed && !options.keepalive && !tokenFresh()) await refreshNow(false);
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };
    let res, data = {};
    try {
      res = await fetch(url, { ...options, headers });
      data = await res.json().catch(() => ({}));
    } catch (netErr) {
      const msg = netErr && netErr.message ? String(netErr.message) : '';
      const isFetchErr = netErr && (netErr.name === 'TypeError' || /failed to fetch|network|load failed/i.test(msg));
      const err = new Error(isFetchErr ? '无法连接到云端服务器，请检查网络连接或接口配置' : (msg || '网络请求失败'));
      err.status = 0;
      err.isNetwork = true;
      err.cause = netErr;
      throw err;
    }
    // 401：token 过期了。有 refresh 就换一次再试一次
    if (res.status === 401 && authed && token && !retried && !options.keepalive && getRefresh() && await refreshNow(true, token)) return api(path, options, true);
    // 要人机验证（注册、输错几次后的登录）：弹框，过了带上结果重发一次
    if (res.status === 400 && data.need === 'turnstile' && !authed && !verified && options.body) {
      const t = await turnstileToken().catch(() => '');
      if (t) {
        let b = {};
        try { b = JSON.parse(options.body); } catch (e) {}
        return api(path, { ...options, body: JSON.stringify({ ...b, turnstile: t }) }, retried, true);
      }
    }
    if (authed && token && !quiet && getToken() === token) {
      if (res.status === 401) authError('expired', data);
      else if (res.status === 403) authError(data.ban ? 'banned' : 'forbidden', data);
    }
    if (!res.ok) {
      const err = new Error(data.error || `请求失败 (${res.status})`);
      err.status = res.status;
      if (data.ban) err.ban = data.ban;
      if (data.need) err.need = data.need;
      if (data.deleted) err.deleted = true;
      throw err;
    }
    return data;
  }

  // 武库的每个动作都交给服务器算。每次带一个随机编号：网络断了用同一个编号重试，服务器只执行一次
  /* ---------- 9. 各个接口（武库、市场、全服 boss、开关、排行榜、列传、反作弊） ---------- */
  async function econ(act, args) {
    const u = getUser();
    if (!cloudActive() || !u) { const e = new Error('当前是本地存档'); e.status = 0; throw e; }
    const nonce = rhex(16);
    let renewed = false;
    for (let i = 0; i < 3; i++) {
      let res = null, data = {};
      if (!tokenFresh()) await refreshNow(false);
      const tok = getToken();
      try {
        res = await fetch(getEndpoint() + '/api/econ', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
          body: JSON.stringify({ act, args: args || {}, nonce })
        });
        data = await res.json().catch(() => ({}));
      } catch (e) {
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      if (!getUser() || getUser().uid !== u.uid) { const e = new Error('账号已切换'); e.status = 409; throw e; }
      // token 过期：换一次再用同一个编号重发（服务器只会执行一次）
      if (res.status === 401 && !renewed && getRefresh()) { renewed = true; if (await refreshNow(true, tok)) { i--; continue; } }
      if (getToken() === tok && (res.status === 401 || res.status === 403)) authError(res.status === 401 ? 'expired' : data.ban ? 'banned' : 'forbidden', data);
      if (!res.ok) { const e = new Error(data.error || `请求失败 (${res.status})`); e.status = res.status; if (data.ban) e.ban = data.ban; throw e; }
      return data;
    }
    const e = new Error('连不上服务器，等联网了再试'); e.status = 0; e.net = true; throw e;
  }
  // 玩家市场：不带 k 是每一款在卖几件、最低多少、最近成交；带 k 是这一款在卖的每一单和成交记录
  async function market(k) {
    if (!cloudActive() || !getUser()) { const e = new Error('当前是本地存档'); e.status = 0; throw e; }
    return api('/api/market' + (k ? '?k=' + encodeURIComponent(k) : ''), { method: 'GET' });
  }
  // 天魔讨伐：不带 body 是看天魔（不登录也能看）；start 领出战票、hit 交伤害要云端账号
  async function gboss(act, body) {
    if (act && (!cloudActive() || !getUser())) { const e = new Error('登录云端账号才能出战'); e.status = 401; throw e; }
    return api('/api/gboss' + (act ? '/' + act : ''), act ? { method: 'POST', body: JSON.stringify(body || {}) } : { method: 'GET' });
  }
  // 全服肉鸽 · 江湖长卷：不带 act 是看全服进度（不登录也能看，登录了附上自己的秘卷和能领几节）；claim 领奖要云端账号
  async function chron(act) {
    if (act && (!cloudActive() || !getUser())) { const e = new Error('登录云端账号才能领长卷奖励'); e.status = 401; throw e; }
    return api('/api/world/chron' + (act ? '/' + act : ''), act ? { method: 'POST', body: '{}' } : { method: 'GET' });
  }
  // 功能开关：服务器管理后台按功能打开 / 关上（可以只对 Dev 账号开）。开局、登录、退出时读一次；
  // 读不到（断网、老版本服务器）就用上次读到的；从来没读到过就全当关着，和没有这个开关时一模一样
  const FLAG_CACHE_KEY = 'renying-srvflags';
  let srvFlags = null;
  function flagCache() {
    if (srvFlags) return srvFlags;
    try { const o = JSON.parse(localStorage.getItem(FLAG_CACHE_KEY) || 'null'); const u = getUser(); if (o && o.flags && o.uid === ((u && u.uid) || '')) srvFlags = o.flags; } catch (e) {}
    return srvFlags || {};
  }
  async function loadFlags() {
    const u = getUser(), uid = (u && u.uid) || '';
    try {
      const r = await api('/api/flags', { method: 'GET' });
      if (r && typeof r.turnstile === 'string') tsKey = r.turnstile;
      if (r && r.flags && typeof r.flags === 'object') {
        srvFlags = r.flags;
        try { localStorage.setItem(FLAG_CACHE_KEY, JSON.stringify({ uid, flags: r.flags })); } catch (e) {}
      }
    } catch (e) {}
    return flagCache();
  }
  function flag(k) { return flagCache()[k] === true; }

  // 排行榜（不用登录）：k 支持 rank（段位/历史赛季）、wins、tag3、duo、gboss
  async function leaderboard(k, season) {
    return api('/api/leaderboard?k=' + encodeURIComponent(k) + (season ? '&s=' + encodeURIComponent(season) : ''), { method: 'GET' });
  }
  // 持久化公开锦标赛：公开读取（60 秒缓存）+ 云端账号发布
  async function tournaments() { return api('/api/tournaments', { method: 'GET' }); }
  async function publishTournament(body) {
    if (!cloudActive() || !getUser()) { const e = new Error('当前是本地存档，登录后可发布公开赛程'); e.status = 0; throw e; }
    return api('/api/tournaments', { method: 'POST', body: JSON.stringify(body || {}) });
  }
  // 侠客列传的江湖足迹：看一条路上大家走到哪、选了什么（不用登录）；云端账号走完一节记一笔
  async function saga(hero) { return api('/api/saga?hero=' + encodeURIComponent(hero), { method: 'GET' }); }
  async function sagaMark(body) {
    if (!cloudActive() || !getUser()) { const e = new Error('当前是本地存档'); e.status = 0; throw e; }
    return api('/api/saga', { method: 'POST', body: JSON.stringify(body || {}) });
  }
  async function flushNow() { if (pendingData && cloudActive()) await doSync(); }
  // 反作弊记录（服务器那份只能往上加）
  async function acGet() { if (!cloudActive()) return null; const r = await api('/api/ac', { method: 'GET' }); return r && r.rec ? r : null; }
  async function acReport(reason) { if (!cloudActive()) return null; const r = await api('/api/ac', { method: 'POST', body: JSON.stringify({ reason: String(reason || '').slice(0, 60) }) }); return r && r.rec ? r : null; }
  /* ---------- 10. 同步 ---------- */
  // 服务器回来的存档：墨锭按账本算（加上本机还没被记上的那几条）
