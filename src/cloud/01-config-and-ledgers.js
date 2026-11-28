// 刃影 云端账号与同步模块 (Cloudflare Workers + D1 Serverless)
// 提供云端账号注册、登录、自动同步以及断网本地降级机制
//
// 文件结构（都在一个立即执行函数里，最后挂到 window.CloudSave）：
//   1. 服务器地址与配置      getEndpoint / setEndpoint / getConfig
//   2. 墨锭账本、进度计数账本  本机先记、服务器确认后再删（ledger* / prog*）
//   3. 反作弊认的入账         只有武库能拿到记账入口（inkGrantKey）
//   4. 本机账号密码           pwHash 等
//   5. 登录令牌               access token + refresh token，快过期前自动续
//   6. 同步状态与多标签页      cloudActive、setSync、同一浏览器几个标签页互相通知
//   7. 存档合并               toCloudData / mergeProfiles（本机和云端各有进度时取并集）
//   8. 人机验证与 api()       所有请求都走 api()：带令牌、401 自动续一次、要验证时弹 Turnstile
//   9. 各个接口               econ、market、gboss、flags、排行榜、列传、反作弊
//  10. 同步                  doSync / flush（关网页前也会尽量推一次）
//  11. 账号                  注册、登录、退出、设备列表
//  12. 存档读写              loadProfile / saveProfile / syncNow / pullNow
//  13. 导出导入与签名         导出文件带签名，导入时校验
//  14. 启动与挂到全局
// 找 bug 提示：同步不上先看 getSyncState() 和浏览器网络面板里 /api/ 的返回；
//   墨锭对不上看 LEDGER（本机还没被服务器记上的在 LEDGER.un）；登录掉线看 refreshNow 和 authLost。
//   服务器那一头在 cloudflare/worker/ 里。


  /* ---------- 1. 服务器地址与配置 ---------- */
  const DEFAULT_ENDPOINT = 'https://renying.evengao6688.workers.dev';

  function getEndpoint() {
    if (typeof window !== 'undefined' && window.RENYING_CLOUD_API) {
      return String(window.RENYING_CLOUD_API).replace(/\/+$/, '');
    }
    try {
      const saved = localStorage.getItem('renying-cloud-endpoint');
      if (saved) return String(saved).replace(/\/+$/, '');
    } catch (e) {}
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      if (/\.workers\.dev$/i.test(window.location.hostname)) return window.location.origin;
    }
    return DEFAULT_ENDPOINT;
  }

  function setEndpoint(url) {
    try {
      if (url && typeof url === 'string' && url.trim()) {
        localStorage.setItem('renying-cloud-endpoint', url.trim().replace(/\/+$/, ''));
      } else {
        localStorage.removeItem('renying-cloud-endpoint');
      }
    } catch (e) {}
  }

  function getConfig() {
    return {
      endpoint: getEndpoint(),
      provider: 'Cloudflare Workers + D1'
    };
  }

  function setConfig(cfg) {
    if (cfg && typeof cfg === 'object' && cfg.endpoint) {
      setEndpoint(cfg.endpoint);
    } else if (typeof cfg === 'string') {
      setEndpoint(cfg);
    }
  }

  function hasValidConfig() {
    return !!getEndpoint();
  }

  let currentUser = null;
  const authListeners = [];
  const syncListeners = [];
  let saveTimer = null;
  let pendingData = null;
  let pendingUid = null;      // 这条待上传的存档属于哪个账号
  let retryN = 0;

  // sync state: local, idle, pending, syncing, ok, offline, error, blocked（服务器拒收）, expired（登录过期）
  const sync = { state: 'local', at: 0, err: '' };

  /* ---------- 墨锭账本 ----------
     新版服务器上墨锭以服务器为准。本机赚的、花的（打赢电脑、任务、关卡星）记成一条条带编号的“待上报”，
     同步存档时一起报上去，服务器每条只记一次（收入每天有上限）；回执里有的编号就划掉。
     显示的墨锭 = 服务器记的数 + 还没被记上的那几条。武库的买卖由服务器直接算，回包里带着新的数。 */
  const LEDGER = { uid: '', s: null, v: -1, un: [] };
  const ledgerKey = uid => 'renying-ledger-' + uid;
  const rhex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
  function ledgerLoad(uid) {
    if (LEDGER.uid === uid) return LEDGER;
    let o = null;
    try { o = JSON.parse(localStorage.getItem(ledgerKey(uid)) || 'null'); } catch (e) {}
    LEDGER.uid = uid;
    LEDGER.s = o && typeof o.s === 'number' ? o.s : null;
    LEDGER.v = o && typeof o.v === 'number' ? o.v : -1;
    LEDGER.un = o && Array.isArray(o.un) ? o.un.filter(x => x && typeof x.id === 'string' && Number.isFinite(x.d) && Number.isFinite(x.t)) : [];
    return LEDGER;
  }
  function ledgerSave() { try { localStorage.setItem(ledgerKey(LEDGER.uid), JSON.stringify({ s: LEDGER.s, v: LEDGER.v, un: LEDGER.un })); } catch (e) {} }
  const pendSum = () => LEDGER.un.reduce((a, x) => a + x.d, 0);
  // 本机墨锭和账本对不上的部分，记成一条待上报（服务器还没给过账本时什么都不做：老服务器不认）
  function ledgerNote(uid, ink) {
    ledgerLoad(uid);
    if (LEDGER.s === null || !Number.isFinite(+ink)) return;
    const d = Math.floor(+ink) - LEDGER.s - pendSum();
    if (d) { LEDGER.un.push({ id: rhex(8), d, t: Date.now() }); ledgerSave(); }
  }
  // 反作弊撤回凭空多出来的墨锭：since 之后记下的几条收入整条作废，另记一条“撤回”报给服务器
  // （服务器上已经记过的按当时认的数扣回，还没到的以后到了也不记；花销撤不了）。返回撤回后该显示的墨锭，没东西可撤就返回 null
  function ledgerRevert(amount, since) {
    const u = getUser();
    if (!u || !u.isCloud) return null;
    ledgerLoad(u.uid);
    if (LEDGER.s === null) return null;
    let left = Math.floor(+amount) || 0;
    const ids = [];
    for (let i = LEDGER.un.length - 1; i >= 0 && left > 0; i--) {
      const x = LEDGER.un[i];
      if (x.t < since) break;
      if (x.d > 0 && !x.r) { ids.push(x.id); left -= x.d; LEDGER.un.splice(i, 1); }
    }
    if (!ids.length) return null;
    LEDGER.un.push({ id: rhex(8), d: 0, t: Date.now(), r: ids });
    ledgerSave();
    return Math.max(0, LEDGER.s + pendSum());
  }
  // 收到服务器的账本：先把本机刚变的记成一条，再划掉服务器已经记上的，返回现在该显示的墨锭
  function ledgerSync(L, curInk) {
    const u = getUser();
    if (!u || !L || typeof L.ink !== 'number') return curInk;
    if (curInk !== null && curInk !== undefined) ledgerNote(u.uid, curInk);
    ledgerLoad(u.uid);
    const acks = new Set(Array.isArray(L.acks) ? L.acks : []), now = Date.now();
    LEDGER.un = LEDGER.un.filter(x => !acks.has(x.id) && now - x.t < 10 * 86400e3);
    if (L.ver >= LEDGER.v || LEDGER.s === null) { LEDGER.s = L.ink; LEDGER.v = L.ver; }
    ledgerSave();
    return Math.max(0, LEDGER.s + pendSum());
  }
  const ledgerListeners = [], syncHooks = [];

  /* ---------- 进度计数账本（胜场、负场、侠客碎片） ----------
     和墨锭账本一个思路：两台设备各自新增的要加起来，所以不传“现在是几”，传“比上次多了几”。
     seen：上次记账时本机存档里的数；每次存档把 (现在 - seen) 记成一条带编号的增量，seen 跟上。
     s：服务器认的数；un：还没被服务器记上的增量。显示的数 = s + un 的合计。
     服务器每个编号只加一次，所以重试、刷新、断线重连、两台设备同时报都不会重复加。
     seen 为 null 表示这个号在这台设备上还没和新版服务器对过账（第一次加载时建，见 progAdopt）；
     服务器是老版本时一直是 null，存档照旧传绝对数。 */
  const PROG = { uid: '', seen: null, s: null, un: [] };
  const progKey = uid => 'renying-prog-' + uid;
  const progListeners = [];
  const PROG_KEY = /^(netWins|netLosses|frags\.[a-z]{2,16})$/;
  function progLoad(uid) {
    if (PROG.uid === uid) return PROG;
    let o = null;
    try { o = JSON.parse(localStorage.getItem(progKey(uid)) || 'null'); } catch (e) {}
    const map = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
    PROG.uid = uid; PROG.dropped = new Set(); PROG.seen = map(o && o.seen); PROG.s = map(o && o.s);
    PROG.un = o && Array.isArray(o.un) ? o.un.filter(x => x && typeof x.id === 'string' && x.d && typeof x.d === 'object' && Number.isFinite(x.t)) : [];
    return PROG;
  }
  // 存的时候把本机别的标签页新记的条目也并进来（按编号），免得两个标签页互相覆盖掉对方还没报的增量
  function progSave() {
    try {
      const o = JSON.parse(localStorage.getItem(progKey(PROG.uid)) || 'null'), have = new Set(PROG.un.map(x => x.id)), dropped = PROG.dropped || new Set();
      if (o && Array.isArray(o.un)) for (const x of o.un) if (x && typeof x.id === 'string' && !have.has(x.id) && !dropped.has(x.id) && x.d && Number.isFinite(x.t)) PROG.un.push(x);
    } catch (e) {}
    try { localStorage.setItem(progKey(PROG.uid), JSON.stringify({ seen: PROG.seen, s: PROG.s, un: PROG.un })); } catch (e) {}
  }
  const progNum = x => Math.max(0, Math.floor(+x || 0));
  // 存档里要记账的那几个数，摊平成 { netWins, netLosses, 'frags.moyu' … }
  function progFlat(p) {
    const v = { netWins: progNum(p && p.netWins), netLosses: progNum(p && p.netLosses) };
    if (p && p.frags && typeof p.frags === 'object') for (const [h, n] of Object.entries(p.frags)) if (PROG_KEY.test('frags.' + h) && progNum(n)) v['frags.' + h] = progNum(n);
    return v;
  }
  function progPend() {
    const t = {};
    for (const x of PROG.un) for (const [k, d] of Object.entries(x.d)) t[k] = (t[k] || 0) + (Math.trunc(+d) || 0);
    return t;
  }
  function progView() {
    const v = { ...(PROG.s || {}) };
    for (const [k, d] of Object.entries(progPend())) v[k] = Math.max(0, (v[k] || 0) + d);
    return v;
  }
  // 把摊平的数写回存档（碎片整个换掉，0 的不留）
  function progPut(p, v) {
    p.netWins = v.netWins || 0; p.netLosses = v.netLosses || 0;
    const frags = {};
    for (const [k, n] of Object.entries(v)) if (k.startsWith('frags.') && n > 0) frags[k.slice(6)] = n;
    p.frags = frags;
    return p;
  }
  // 存档时：本机比上次多（少）了的，记成一条
  function progNote(uid, prof) {
    progLoad(uid);
    if (PROG.seen === null) return;
    const cur = progFlat(prof), d = {};
    for (const k of new Set([...Object.keys(cur), ...Object.keys(PROG.seen)])) {
      const x = (cur[k] || 0) - (PROG.seen[k] || 0);
      if (x > 0 || (k.startsWith('frags.') && x < 0)) d[k] = x;
    }
    if (Object.keys(d).length) {
      PROG.un.push({ id: rhex(8), d, t: Date.now() });
      for (const [k, n] of Object.entries(cur)) PROG.seen[k] = Math.max(PROG.seen[k] || 0, n);
      progSave();
    }
  }
  // 划掉服务器已经记上的；acks 只是“记过了”，不会让数变
  function progDrop(acks) {
    const set = new Set(Array.isArray(acks) ? acks : []), now = Date.now(), gone = [];
    PROG.dropped = PROG.dropped || new Set();
    PROG.un = PROG.un.filter(x => { const keep = !set.has(x.id) && now - x.t < 10 * 86400e3; if (!keep) { PROG.dropped.add(x.id); if (set.has(x.id)) gone.push(x); } return keep; });
    return gone;
  }
  // 加载、登录时：拿服务器的数和本机没报的增量对账，返回该显示的数（服务器不支持时返回 null）
  function progAdopt(uid, P, local) {
    if (!P || !P.vals || typeof P.vals !== 'object') return null;
    progLoad(uid);
    progDrop(P.acks);
    if (PROG.seen === null) {
      // 第一次在这台设备上对账：之前没有基线，分不清本机的数里哪些已经传过。为了不丢进度也不重复加，
      // 只把本机比云端多出来的部分记成一条增量（只加不减）；以后每次都按增量走
      PROG.s = { ...P.vals };
      PROG.un.forEach(x => PROG.dropped.add(x.id));
      PROG.un = [];
      if (local) {
        const L = progFlat(local), d = {};
        for (const [k, n] of Object.entries(L)) if (n > (P.vals[k] || 0)) d[k] = n - (P.vals[k] || 0);
        if (Object.keys(d).length) PROG.un.push({ id: rhex(8), d, t: Date.now(), m: 1 });
      }
    } else {
      PROG.s = { ...P.vals };
    }
    PROG.seen = progView();
    progSave();
    return PROG.seen;
  }
  // 上传成功时：服务器回了新的数和记过的编号。新的数里除了本机这几条以外多出来的，是别的设备加的，告诉游戏一起加上
  function progAck(uid, P) {
    if (!P || !P.vals) return;
    progLoad(uid);
    if (PROG.seen === null) return;
    const old = PROG.s || {}, mine = {};
    for (const x of progDrop(P.acks)) for (const [k, d] of Object.entries(x.d)) mine[k] = (mine[k] || 0) + (Math.trunc(+d) || 0);
    const other = {};
    for (const k of new Set([...Object.keys(old), ...Object.keys(P.vals), ...Object.keys(mine)])) {
      const x = (P.vals[k] || 0) - (old[k] || 0) - (mine[k] || 0);
      if (x) other[k] = x;
    }
    PROG.s = { ...P.vals };
    if (Object.keys(other).length && progListeners.length) {
      progListeners.forEach(fn => { try { fn(other); } catch (e) { console.warn('progress listener', e); } });
      for (const [k, x] of Object.entries(other)) PROG.seen[k] = Math.max(0, (PROG.seen[k] || 0) + x);
    }
    progSave();
  }
  // 游戏登记：别的设备新增的胜负、碎片（一个 { netWins: +2 … } 的增量），请加到当前存档上
  function onProgress(fn) { if (typeof fn === 'function') progListeners.push(fn); }
  function onLedger(fn) { if (typeof fn === 'function') ledgerListeners.push(fn); }
  // 每次把账本报上去之前先叫一遍（反作弊在这里先对一下墨锭，凭空多出来的那条就不会被报上去）
  function onBeforeSync(fn) { if (typeof fn === 'function') syncHooks.push(fn); }

  /* ---------- 反作弊只认这里记过的入账 ----------
     服务器确认的、武库本机结算的墨锭会先记一笔，反作弊看到墨锭涨了先来这里对账，对得上的不算作弊。
     记账的入口只交给第一个来要的（武库，网页一打开就要走了），控制台里拿不到。 */
  const GRANTS = [];
  let grantGiven = false;
  function grantAdd(n) { n = Math.floor(+n || 0); if (n > 0) GRANTS.push([Date.now(), n]); }
  function grantTake(n) {
    const now = Date.now();
    let got = 0;
    while (GRANTS.length && got < n) {
      const g = GRANTS[0];
      if (now - g[0] > 15000) { GRANTS.shift(); continue; }
      const t = Math.min(g[1], n - got);
      g[1] -= t; got += t;
      if (!g[1]) GRANTS.shift();
    }
    return got;
  }
  function inkGrantKey() { if (grantGiven) return null; grantGiven = true; return grantAdd; }

  /* ---------- 4. 本机账号密码 ---------- */
  /* 本机账号的密码散列。
     旧版本用 btoa() 存密码：密码里有中文或任何非 Latin-1 字符就抛 InvalidCharacterError，
     账号根本建不起来。这里改成 SHA-256（拿不到 crypto.subtle 时退到 UTF-8 安全的编码），
     并能识别旧的 btoa 记录，登录成功后就地升级。 */
  const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
