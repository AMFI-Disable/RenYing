  async function pwHash(password) {
    const pw = String(password);
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ry_pw_v2|' + pw));
        return 'v2$' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {}
    return 'v2u$' + encodeURIComponent('ry_pw_v2|' + pw);   // 非加密降级，至少不会抛异常
  }
  function pwLegacy(password) {
    try { return btoa(String(password)); } catch (e) { return null; }
  }
  async function pwMatches(rec, password) {
    if (!rec || typeof rec !== 'object') return false;
    if (rec.pwv === 2) return rec.pw === await pwHash(password);
    const legacy = pwLegacy(password);
    return !!legacy && rec.pw === legacy;
  }
  // 本机账号表：坏了（存的时候空间满了被截断、老版本写的）当成空表，不让注册、登录直接抛 JSON 错误
  function localAccounts() {
    try { const v = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
  }
  // 本机账号按昵称找，不分大小写（云端的昵称也不分大小写，Abc 和 abc 是同一个号）
  function localKeyOf(table, name) {
    if (Object.prototype.hasOwnProperty.call(table, name)) return name;
    const low = String(name).toLowerCase();
    return Object.keys(table).find(k => k.toLowerCase() === low) || '';
  }
  // 和服务器一样不让用的昵称：像官方、开发者的，还有没登录时用的 guest / 游客
  const RESERVED_NAME = /^(dev|dev_master|admin|administrator|root|system|gm|official|staff|guest|官方|系统|管理员|开发者|开发组|客服|刃影官方|游客)$/i;
  function tempPassword() {
    const buf = new Uint8Array(9);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
    else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
    return Array.from(buf, b => PW_ALPHABET[b % PW_ALPHABET.length]).join('');
  }

  // 登录凭证：token 每个请求都带。新服务器发的只管 30 分钟，refresh 用来换新的，exp 是 token 什么时候过期（本机时间）。
  /* ---------- 5. 登录令牌（access + refresh） ---------- */
  // 老服务器、开关没开时只有 30 天的老式 token，没有 refresh
  const TOKEN_KEY = 'renying-cloud-token', REFRESH_KEY = 'renying-cloud-refresh', EXP_KEY = 'renying-cloud-exp';
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || (currentUser && currentUser.token) || '';
    } catch (e) {
      return '';
    }
  }
  function getRefresh() {
    try { return localStorage.getItem(REFRESH_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(tok) {
    try {
      if (tok) localStorage.setItem(TOKEN_KEY, tok);
      else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); localStorage.removeItem(EXP_KEY); }
    } catch (e) {}
    if (currentUser) currentUser.token = tok || '';
    if (!tok && refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  }
  // 登录、注册、换新令牌的回包：存好令牌；有 refresh 就记下过期时间，快到点时自己换
  function setSession(data) {
    setToken(data.token);
    try {
      if (data.refresh) {
        localStorage.setItem(REFRESH_KEY, data.refresh);
        localStorage.setItem(EXP_KEY, String(Date.now() + (+data.expiresIn || 1800) * 1000));
      } else { localStorage.removeItem(REFRESH_KEY); localStorage.removeItem(EXP_KEY); }
    } catch (e) {}
    scheduleRefresh();
  }
  let refreshTimer = null, refreshing = null;
  function tokenExp() {
    try { return +localStorage.getItem(EXP_KEY) || 0; } catch (e) { return 0; }
  }
  // token 还能用至少一分钟（老式 token 没有 exp，算一直能用，过期了靠 401 知道）
  function tokenFresh() {
    return !getRefresh() || tokenExp() - Date.now() > 60e3;
  }
  function scheduleRefresh() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (!getRefresh()) return;
    const wait = Math.min(Math.max(5e3, tokenExp() - Date.now() - 2 * 60e3), 2147483647);
    refreshTimer = setTimeout(() => { refreshTimer = null; refreshNow(false).then(ok => { if (ok) scheduleRefresh(); }); }, wait);
    if (refreshTimer && refreshTimer.unref) refreshTimer.unref();
  }
  // 用 refresh 换一套新的。force：服务器刚回了 401（used 是那次带的 token）。
  // 同一个网页同时只换一次；几个标签页抢着换时用 navigator.locks 排队，排到了先看看别的标签页是不是已经换好了。
  // 返回 true 表示现在手里的 token 能用了
  function refreshNow(force, used) {
    if (refreshing) return refreshing;
    const run = async () => {
      const r0 = getRefresh(), u = getUser();
      if (!r0 || !u || !hasValidConfig()) return false;
      if (force ? getToken() !== used : tokenFresh()) return true;   // 别的标签页已经换好了
      const post = async insist => {
        const res = await fetch(getEndpoint() + '/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(insist ? { refresh: r0, insist: true } : { refresh: r0 }) });
        return { status: res.status, data: await res.json().catch(() => ({})) };
      };
      let r;
      try {
        r = await post(false);
        // 409：上一个刚被换掉。多半是另一个标签页换的，它会把新的写进 localStorage；等一下还没有，就说明是被别人换的
        if (r.status === 409) {
          for (let i = 0; i < 6 && getRefresh() === r0; i++) await new Promise(ok => setTimeout(ok, 250));
          if (getRefresh() !== r0) return !!getRefresh();
          r = await post(true);
        }
      } catch (e) { return false; }   // 断网：留着，下次再换
      if (!getUser() || getUser().uid !== u.uid || getRefresh() !== r0) return false;   // 换的期间退出、换号了
      if (r.status === 200 && r.data.token) { setSession(r.data); return true; }
      if (r.status === 401) authLost(r.data.error);
      return false;
    };
    const go = (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) ? navigator.locks.request('renying-refresh', run) : run();
    refreshing = Promise.resolve(go).catch(() => false).finally(() => { refreshing = null; });
    return refreshing;
  }
  // 登录失效（refresh 也换不到了）：本机存档和待上传的都留着，重新登录后补传
  function authLost(msg) {
    try { localStorage.removeItem(REFRESH_KEY); localStorage.removeItem(EXP_KEY); } catch (e) {}
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    setSync({ state: 'expired', err: (msg || '登录已过期') + '，重新登录后会自动补传存档' });
  }
  // 以前登录拿到的老式 30 天 token：换成新的一套（服务器没开这个功能、老服务器就算了，照旧用）
  let upgraded = false;
  async function upgradeLegacy() {
    if (upgraded) return;
    upgraded = true;
    const u = getUser(), tok = getToken();
    if (!u || !u.isCloud || !tok || getRefresh() || !hasValidConfig()) return;
    try {
      const res = await fetch(getEndpoint() + '/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` }, body: '{}' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token && data.refresh && getUser() && getUser().uid === u.uid && getToken() === tok) setSession(data);
    } catch (e) {}
  }

  /* ---------- 6. 同步状态、本机镜像、多标签页 ---------- */
  function cloudActive() {
    const u = getUser();
    return !!(hasValidConfig() && u && u.isCloud && getToken());
  }

  function dirtyKey() {
    return 'renying-sync-dirty-' + (currentUser && currentUser.uid);
  }
  // 每个账号一份本地镜像。没有跨账号共享的键：新账号读不到上一个人的存档
  function profKey(uid) { return 'renying-prof-' + uid; }
  function readMirror(uid) {
    if (!uid) return null;
    try { const raw = localStorage.getItem(profKey(uid)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  // 旧版本把所有账号的镜像写在同一个键里：迁到当前账号名下，再删掉共享键
  function migrateLegacyCache() {
    try {
      const legacy = localStorage.getItem('renying-cloud-cache');
      if (!legacy) return;
      const u = getUser();
      if (!u || !u.uid) return;   // 没人登录：先留着，等有人登录再交给他，别直接删掉
      if (!localStorage.getItem(profKey(u.uid))) {
        JSON.parse(legacy);
        localStorage.setItem(profKey(u.uid), legacy);
      }
      localStorage.removeItem('renying-cloud-cache');
    } catch (e) {
      try { localStorage.removeItem('renying-cloud-cache'); } catch (e2) {}
    }
  }

  function setSync(patch) {
    Object.assign(sync, patch);
    try {
      if (sync.at && currentUser) {
        localStorage.setItem('renying-sync-at-' + currentUser.uid, String(sync.at));
      }
    } catch (e) {}
    const snap = getSyncState();
    syncListeners.forEach(fn => { try { fn(snap); } catch (e) {} });
  }

  function getSyncState() {
    let at = sync.at;
    if (!at && currentUser) {
      try { at = +localStorage.getItem('renying-sync-at-' + currentUser.uid) || 0; } catch (e) {}
    }
    let state = cloudActive() ? sync.state : 'local';
    if (state === 'local' && cloudActive()) state = at ? 'ok' : 'idle';
    return { state, at, err: sync.err, cloud: cloudActive(), pending: !!pendingData };
  }

  function onSyncChange(fn) {
    if (typeof fn === 'function') syncListeners.push(fn);
  }

  function onAuthChange(fn) {
    if (typeof fn === 'function') authListeners.push(fn);
  }

  // fromTab：是别的标签页登录、退出了，这边跟着变（不用再告诉别人）
  function notifyAuthChange(user, fromTab) {
    srvFlags = null;   // 换了人，开关可能不一样（只开 Dev 的），重新读
    if (typeof window !== 'undefined' && window.CloudSave) loadFlags();
    if (!fromTab) tellTabs(user && user.uid);
    authListeners.forEach(fn => {
      try { fn(user, !!fromTab); } catch (err) { console.warn('Auth listener error:', err); }
    });
  }

  /* ---------- 同一个浏览器的几个标签页 ----------
   * 登录凭证和当前账号都在 localStorage 里，几个标签页共用；但每个标签页的内存里还记着自己的“当前账号”和待上传的存档。
   * 一个标签页退出、换号以后，别的标签页要是还按内存里的旧账号上传，就会把旧账号的存档写进新登录的号里。
   * 所以：变了就用 BroadcastChannel 告诉别的标签页（没有它的浏览器靠 storage 事件），收到的一方丢掉内存里的旧状态，
   * 再通知游戏（onOtherTab），游戏回到菜单时刷新网页。 */
  const TAB_ID = rhex(8);
  const otherTabListeners = [];
  let tabChan = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      tabChan = new BroadcastChannel('renying-auth');
      tabChan.onmessage = e => { if (e.data && e.data.from !== TAB_ID) fromOtherTab(); };
    }
  } catch (e) { tabChan = null; }
  function tellTabs(uid) {
    try { if (tabChan) tabChan.postMessage({ from: TAB_ID, uid: uid || '' }); } catch (e) {}
  }
  function storedUid() {
    try { const o = JSON.parse(localStorage.getItem('renying-local-current') || 'null'); return (o && o.uid) || ''; } catch (e) { return ''; }
  }
  function fromOtherTab() {
    const mine = (currentUser && currentUser.uid) || '', now = storedUid();
    if (mine === now) return;   // 还是这个号（别的标签页只是换了一下令牌）
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    pendingData = null; pendingUid = null;   // 旧账号没传完的存档留在它自己的本机镜像里，下次登录那个号会补传
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    currentUser = null;
    const u = getUser();
    scheduleRefresh();
    setSync({ state: u && u.isCloud ? 'idle' : 'local', err: '' });
    const info = { type: now ? 'login' : 'logout', uid: now, was: mine };
    otherTabListeners.forEach(fn => { try { fn(info); } catch (err) { console.warn('other tab listener', err); } });
    notifyAuthChange(u, true);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', e => { if (e.key === 'renying-local-current' || e.key === null) fromOtherTab(); });
  }
  function onOtherTab(fn) { if (typeof fn === 'function') otherTabListeners.push(fn); }

  /* ---------- 401 / 403 统一处理 ----------
   * 401：令牌过期了，换一次（refreshNow）还不行就是登录失效：同步状态变成「登录过期」，本机存档留着。
   * 403：被封（带 ban）或者没有权限。两种都告诉游戏（onAuthError），游戏决定怎么提示。 */
  const authErrListeners = [];
  function onAuthError(fn) { if (typeof fn === 'function') authErrListeners.push(fn); }
  function authError(kind, data) {
    if (kind === 'expired') authLost(data && data.error);
    authErrListeners.forEach(fn => { try { fn({ kind, error: (data && data.error) || '', ban: data && data.ban }); } catch (err) { console.warn('auth error listener', err); } });
  }

  /* ---------- 7. 存档合并（本机和云端各有进度时取并集） ---------- */
