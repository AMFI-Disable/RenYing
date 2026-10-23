// 刃影 云端账号与同步模块 (Cloudflare Workers + D1 Serverless)
// 提供云端账号注册、登录、自动同步以及断网本地降级机制

(function() {
  'use strict';

  const DEFAULT_ENDPOINT = 'https://renying.evengao6688.workers.dev';

  function getEndpoint() {
    if (typeof window !== 'undefined' && window.RENYING_CLOUD_API) {
      return String(window.RENYING_CLOUD_API).replace(/\/+$/, '');
    }
    try {
      const saved = localStorage.getItem('renying-cloud-endpoint');
      if (saved) return String(saved).replace(/\/+$/, '');
    } catch (e) {}
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
  let retryN = 0;

  // sync state: local, idle, pending, syncing, ok, offline, error
  const sync = { state: 'local', at: 0, err: '' };

  function getToken() {
    try {
      return localStorage.getItem('renying-cloud-token') || (currentUser && currentUser.token) || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(tok) {
    try {
      if (tok) localStorage.setItem('renying-cloud-token', tok);
      else localStorage.removeItem('renying-cloud-token');
    } catch (e) {}
  }

  function cloudActive() {
    const u = getUser();
    return !!(hasValidConfig() && u && u.isCloud && getToken());
  }

  function dirtyKey() {
    return 'renying-sync-dirty-' + (currentUser && currentUser.uid);
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

  function notifyAuthChange(user) {
    authListeners.forEach(fn => {
      try { fn(user); } catch (err) { console.warn('Auth listener error:', err); }
    });
  }

  const DEV_ALL_CHARS = ['qingfeng', 'yanling', 'leiming', 'tieshan', 'liuyun', 'lingshuang', 'moyu', 'feiying', 'yuehua', 'yuxiao', 'zuixian', 'gouchen'];
  const DEV_ALL_SKINS = [
    'qf_frost', 'qf_gold', 'qf_abyss', 'qf_qfx',
    'fy_jade', 'fy_blood', 'fy_phantom',
    'ts_bronze', 'ts_obsidian', 'ts_crimson',
    'ls_plum', 'ls_aurora', 'ls_dragon',
    'ly_dusk', 'ly_sky', 'ly_bamboo', 'ly_fox',
    'lm_violet', 'lm_sun', 'lm_asura',
    'my_cinnabar', 'my_gold', 'my_celestial',
    'yh_sakura', 'yh_eclipse', 'yh_solstice',
    'yl_raven', 'yl_phoenix', 'yl_blizzard',
    'yx_snow', 'zx_amber', 'gc_crimson'
  ];

  function makeDevProfile() {
    return {
      name: 'Dev',
      ink: 99999,
      owned: DEV_ALL_CHARS.slice(),
      frags: {
        qingfeng: 99, yanling: 99, leiming: 99, tieshan: 99,
        liuyun: 99, lingshuang: 99, moyu: 99, feiying: 99, yuehua: 99,
        yuxiao: 99, zuixian: 99, gouchen: 99
      },
      pity: 0,
      spity: 0,
      skins: DEV_ALL_SKINS.slice(),
      equip: {},
      netWins: 99,
      netLosses: 0,
      rating: 2000,
      placed: 10,
      online10Unlocked: true,
      stageStars: { s1: 3, s2: 3, s3: 3, s4: 3, s5: 3, s6: 3, s7: 3, s8: 3, s9: 3, s10: 3 },
      qfx: 99,
      updatedAt: Date.now()
    };
  }

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
      updatedAt: Date.now(),
      ...(p.rk && typeof p.rk === 'object' ? { rk: JSON.parse(JSON.stringify(p.rk)) } : {})
    };
  }

  // 核心 HTTP 异步请求封装
  async function api(path, options = {}) {
    const base = getEndpoint();
    const url = base + path;
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `请求失败 (${res.status})`);
    }
    return data;
  }

  async function doSync() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const data = pendingData;
    if (!data || !cloudActive()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSync({ state: 'offline' });
      return;
    }
    setSync({ state: 'syncing' });
    try {
      const res = await api('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ profile: data })
      });
      if (pendingData === data) {
        pendingData = null;
        try { localStorage.removeItem(dirtyKey()); } catch (e) {}
      }
      retryN = 0;
      setSync({ state: pendingData ? 'pending' : 'ok', at: res.updatedAt || Date.now(), err: '' });
      if (pendingData) saveTimer = setTimeout(doSync, 800);
    } catch (err) {
      console.warn('Sync profile to Cloudflare failed:', err);
      retryN++;
      const wait = [2, 5, 15, 30, 60][Math.min(retryN, 5) - 1] * 1000;
      setSync({ state: 'error', err: `上传失败，${Math.round(wait / 1000)} 秒后自动重试` });
      saveTimer = setTimeout(doSync, wait);
    }
  }

  function flush() {
    if (pendingData && cloudActive()) doSync();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', flush);
    window.addEventListener('offline', () => { if (pendingData) setSync({ state: 'offline' }); });
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  // 开发者账号处理
  async function loginDev(password) {
    if (btoa(password) !== 'SUFNQURFVkJSTw==') {
      throw new Error('昵称或密码不对');
    }
    const uid = 'dev_master';
    let devProf = null;
    try {
      devProf = JSON.parse(localStorage.getItem('renying-prof-' + uid) || 'null');
    } catch (e) {}
    if (!devProf) {
      devProf = makeDevProfile();
    }
    try {
      localStorage.setItem('renying-prof-' + uid, JSON.stringify(devProf));
      localStorage.setItem('renying-cloud-cache', JSON.stringify(devProf));
      localStorage.setItem('renying-local-current', JSON.stringify({ uid, name: 'Dev', isDevMaster: true, isCloud: false }));
    } catch (e) {}
    currentUser = { uid, displayName: 'Dev', name: 'Dev', isDevMaster: true, isCloud: false };
    notifyAuthChange(currentUser);
    return { uid, name: 'Dev', isCloud: false, isDevMaster: true };
  }

  // 账号注册
  async function register(username, password) {
    const name = String(username).trim();
    if (!name || name.length < 2) throw new Error('昵称至少需要 2 个字符');
    if (!password || password.length < 6) throw new Error('密码至少需要 6 个字符');

    if (name.toLowerCase() === 'dev') {
      if (btoa(password) !== 'SUFNQURFVkJSTw==') throw new Error('该昵称已被使用');
      return await loginDev(password);
    }

    // 读取游客进度准备同步上云
    let initialProf = null;
    try {
      const guestRaw = localStorage.getItem('renying-guest-profile');
      if (guestRaw) initialProf = JSON.parse(guestRaw);
    } catch (e) {}

    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          username: name,
          password: password,
          profile: initialProf ? toCloudData(initialProf) : null
        })
      });

      setToken(data.token);
      const userObj = {
        uid: data.uid,
        name: data.username,
        displayName: data.username,
        token: data.token,
        isCloud: true
      };
      currentUser = userObj;
      localStorage.setItem('renying-local-current', JSON.stringify(userObj));

      if (data.profile) {
        try {
          localStorage.setItem('renying-prof-' + data.uid, JSON.stringify(data.profile));
          localStorage.setItem('renying-cloud-cache', JSON.stringify(data.profile));
          localStorage.removeItem('renying-guest-profile');
        } catch (e) {}
      }

      setSync({ state: 'ok', at: Date.now(), err: '' });
      notifyAuthChange(currentUser);
      return userObj;
    } catch (err) {
      if (err.message && err.message.includes('已') && err.message.includes('注册')) {
        throw err;
      }
      console.warn('Cloudflare Worker register failed, falling back to local account:', err);
      // 本地降级模拟
      const mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}');
      if (mockUsers[name]) throw new Error('该昵称已在本机注册');
      const uid = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      mockUsers[name] = { uid, name, pw: btoa(password), created: Date.now() };
      localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
      const userObj = { uid, name, displayName: name, isCloud: false };
      localStorage.setItem('renying-local-current', JSON.stringify(userObj));
      currentUser = userObj;
      notifyAuthChange(currentUser);
      return userObj;
    }
  }

  // 账号登录（支持已有本地账号无缝自动升级迁移至云端）
  async function login(username, password) {
    const name = String(username).trim();
    if (!name) throw new Error('请输入昵称');
    if (!password) throw new Error('请输入密码');

    if (name.toLowerCase() === 'dev') {
      return await loginDev(password);
    }

    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: name, password: password })
      });

      setToken(data.token);
      const userObj = {
        uid: data.uid,
        name: data.username,
        displayName: data.username,
        token: data.token,
        isCloud: true
      };
      currentUser = userObj;
      localStorage.setItem('renying-local-current', JSON.stringify(userObj));

      if (data.profile) {
        try {
          localStorage.setItem('renying-prof-' + data.uid, JSON.stringify(data.profile));
          localStorage.setItem('renying-cloud-cache', JSON.stringify(data.profile));
        } catch (e) {}
      }

      setSync({ state: 'ok', at: Date.now(), err: '' });
      notifyAuthChange(currentUser);
      return userObj;
    } catch (err) {
      // 检查是否有本地历史账号
      let mockUsers = {};
      try { mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}'); } catch (e) {}
      const localU = mockUsers[name];
      if (localU && localU.pw === btoa(password)) {
        // 本地老账号自动在云端注册并同步
        try {
          let localProf = null;
          try {
            const pStr = localStorage.getItem('renying-prof-' + localU.uid) || localStorage.getItem('renying-cloud-cache');
            if (pStr) localProf = JSON.parse(pStr);
          } catch (e) {}

          const data = await api('/api/register', {
            method: 'POST',
            body: JSON.stringify({
              username: name,
              password: password,
              profile: localProf ? toCloudData(localProf) : null
            })
          });

          setToken(data.token);
          const userObj = {
            uid: data.uid,
            name: data.username,
            displayName: data.username,
            token: data.token,
            isCloud: true,
            migrated: true
          };
          currentUser = userObj;
          localU.uid = data.uid;
          localU.migratedToCloud = true;
          mockUsers[name] = localU;
          localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
          localStorage.setItem('renying-local-current', JSON.stringify(userObj));
          setSync({ state: 'ok', at: Date.now(), err: '' });
          notifyAuthChange(currentUser);
          return userObj;
        } catch (regErr) {
          // 本地单机登录
          const userObj = { uid: localU.uid, name, displayName: name, isCloud: false };
          localStorage.setItem('renying-local-current', JSON.stringify(userObj));
          currentUser = userObj;
          notifyAuthChange(currentUser);
          return userObj;
        }
      }
      throw err;
    }
  }

  // 退出登录
  async function logout() {
    try {
      await api('/api/logout', { method: 'POST' }).catch(() => {});
    } catch (e) {}
    setToken('');
    currentUser = null;
    try { localStorage.removeItem('renying-local-current'); } catch (e) {}
    notifyAuthChange(null);
  }

  // 获取当前用户
  function getUser() {
    if (currentUser) {
      const isDev = !!currentUser.isDevMaster;
      return {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.name || '大侠',
        isCloud: !!(currentUser.isCloud && currentUser.token),
        isDevMaster: isDev,
        token: currentUser.token || getToken()
      };
    }
    try {
      const local = JSON.parse(localStorage.getItem('renying-local-current') || 'null');
      if (local && local.uid) {
        const token = getToken();
        const isCloud = !!(token && local.isCloud !== false);
        const isDev = !!local.isDevMaster;
        currentUser = { ...local, token, isCloud, displayName: local.name, isDevMaster: isDev };
        return currentUser;
      }
    } catch (e) {}
    return null;
  }

  // 加载档案（优先云端，支持本地离线降级）
  async function loadProfile() {
    const u = getUser();
    if (!u) {
      try {
        const guest = localStorage.getItem('renying-guest-profile');
        if (guest) return JSON.parse(guest);
      } catch (e) {}
      return null;
    }

    if (cloudActive()) {
      try {
        const res = await api('/api/profile', { method: 'GET' });
        if (res && res.profile) {
          const data = res.profile;
          // 若本地在离线时有未同步的新存档且更新时间更晚，优先以本地为准并补传
          let local = null, dirty = 0;
          try {
            dirty = +localStorage.getItem(dirtyKey()) || 0;
            local = JSON.parse(localStorage.getItem('renying-prof-' + u.uid) || 'null');
          } catch (e) {}
          const cloudAt = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
          if (dirty && local && (local.updatedAt || 0) > cloudAt) {
            saveProfile(local, true);
            return local;
          }
          try {
            localStorage.removeItem(dirtyKey());
            localStorage.setItem('renying-cloud-cache', JSON.stringify(data));
            localStorage.setItem('renying-prof-' + u.uid, JSON.stringify(data));
          } catch (e) {}
          if (!pendingData) setSync({ state: 'ok', at: Date.now(), err: '' });
          return data;
        }
      } catch (err) {
        console.warn('Load cloud profile error, reading local cache:', err);
      }
    }

    // 读取本地镜像缓存
    try {
      const cached = localStorage.getItem('renying-cloud-cache');
      if (cached) return JSON.parse(cached);
      const localProf = localStorage.getItem('renying-prof-' + u.uid);
      if (localProf) return JSON.parse(localProf);
    } catch (e) {}
    return null;
  }

  // 保存云端档案（支持防抖节流）
  function saveProfile(prof, immediate) {
    const u = getUser();
    const dataToSave = toCloudData(prof);
    if (u && u.name) dataToSave.name = u.name;

    if (!u) {
      try {
        localStorage.setItem('renying-guest-profile', JSON.stringify(dataToSave));
        localStorage.setItem('renying-cloud-cache', JSON.stringify(dataToSave));
      } catch (e) {}
      return;
    }

    // 立即写入本地镜像
    try {
      localStorage.setItem('renying-cloud-cache', JSON.stringify(dataToSave));
      localStorage.setItem('renying-prof-' + u.uid, JSON.stringify(dataToSave));
    } catch (e) {}

    if (!cloudActive()) {
      setSync({ state: 'local' });
      return;
    }

    pendingData = dataToSave;
    try { localStorage.setItem(dirtyKey(), String(dataToSave.updatedAt)); } catch (e) {}
    if (sync.state !== 'syncing') setSync({ state: 'pending' });
    if (saveTimer) clearTimeout(saveTimer);
    if (immediate) doSync();
    else saveTimer = setTimeout(doSync, 1200);
  }

  // 手动“立即上传”
  async function syncNow() {
    if (!cloudActive()) throw new Error('当前是本地存档，未连接云端');
    if (!pendingData) {
      let local = null;
      try { local = JSON.parse(localStorage.getItem('renying-prof-' + getUser().uid) || 'null'); } catch (e) {}
      if (!local) throw new Error('本机没有可上传的存档');
      pendingData = Object.assign(toCloudData(local), { name: getUser().name, updatedAt: Date.now() });
    }
    await doSync();
    if (sync.state === 'error') throw new Error(sync.err);
  }

  // 手动“从云端拉取”
  async function pullNow() {
    if (!cloudActive()) throw new Error('当前是本地存档，未连接云端');
    const res = await api('/api/profile', { method: 'GET' });
    if (!res || !res.profile) throw new Error('云端还没有这个账号的存档');
    const data = res.profile;
    pendingData = null;
    const uid = getUser().uid;
    try {
      localStorage.removeItem(dirtyKey());
      localStorage.setItem('renying-cloud-cache', JSON.stringify(data));
      localStorage.setItem('renying-prof-' + uid, JSON.stringify(data));
    } catch (e) {}
    setSync({ state: 'ok', at: Date.now(), err: '' });
    return data;
  }

  // 触发浏览器原生文件下载
  function triggerDownload(filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // 计算存档数字校验和 (SHA-256 Digest)
  async function computeProfileDigest(p, salt = 'ry_sword_auth_2026') {
    if (!p) return '';
    const ink = Math.floor(p.ink || 0);
    const wins = Math.floor(p.netWins || 0);
    const losses = Math.floor(p.netLosses || 0);
    const name = String(p.name || '').trim();
    const owned = Array.isArray(p.owned) ? p.owned.slice().sort().join(',') : 'qingfeng';
    const skins = Array.isArray(p.skins) ? p.skins.slice().sort().join(',') : '';
    const raw = `RY_V1|${name}|${ink}|${owned}|${skins}|${wins}|${losses}|${salt}`;
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
        const enc = new TextEncoder().encode(raw);
        const hashBuf = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {}
    let h1 = 0x811c9dc5, h2 = 0x27d4eb2f;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 0x01000193);
      h2 = Math.imul(h2 ^ ch, 0x5bd1e995);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  async function verifyProfileDigest(data) {
    if (!data || typeof data !== 'object') return false;
    const p = data.profile || data;
    const sig = data._sig || (data.profile && data.profile._sig);
    if (!sig) return null;
    const expected = await computeProfileDigest(p);
    return expected === sig;
  }

  // 导出单账号存档
  async function exportCurrentAccount(prof) {
    const u = getUser();
    let activeProf = prof;
    if (!activeProf) {
      try {
        activeProf = JSON.parse(localStorage.getItem('renying-cloud-cache') || '{}');
      } catch (e) {
        activeProf = {};
      }
    }
    const name = (u && u.name) || activeProf.name || '大侠';
    const profData = toCloudData(activeProf);
    profData.name = name;
    const sig = await computeProfileDigest(profData);
    const payload = {
      app: 'renying',
      format: 'single-account',
      version: 2,
      exportedAt: new Date().toISOString(),
      account: {
        uid: (u && u.uid) || ('local_' + Date.now()),
        name: name
      },
      profile: profData,
      _sig: sig
    };
    const safeName = String(name).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') || 'player';
    triggerDownload(`renying-account-${safeName}.json`, JSON.stringify(payload, null, 2));
    return payload;
  }

  // 导出全部本地账号
  function exportAllAccounts() {
    let mockUsers = {};
    try {
      mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}');
    } catch (e) {}
    const accounts = [];
    for (const [name, u] of Object.entries(mockUsers)) {
      let prof = null;
      try {
        const profRaw = localStorage.getItem('renying-prof-' + u.uid);
        if (profRaw) prof = JSON.parse(profRaw);
      } catch (e) {}
      accounts.push({ account: u, profile: prof });
    }
    const payload = {
      app: 'renying',
      format: 'all-accounts-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      count: accounts.length,
      accounts: accounts
    };
    triggerDownload('renying-all-accounts-backup.json', JSON.stringify(payload, null, 2));
    return payload;
  }

  // 导入账号数据
  async function importAccountData(data) {
    if (!data || typeof data !== 'object') throw new Error('无效的存档文件数据');
    if (data.format === 'single-account' && data.profile) {
      const isSigValid = await verifyProfileDigest(data);
      if (isSigValid === false) {
        throw new Error('⚠️ 存档校验和不匹配：该备份文件已被外部篡改');
      }
      const p = data.profile;
      const uid = (data.account && data.account.uid) || ('imported_' + Date.now());
      const name = (data.account && data.account.name) || p.name || '大侠';
      localStorage.setItem('renying-prof-' + uid, JSON.stringify(p));
      localStorage.setItem('renying-cloud-cache', JSON.stringify(p));
      localStorage.setItem('renying-local-current', JSON.stringify({ uid, name, isCloud: false }));
      currentUser = { uid, name, displayName: name, isCloud: false };
      notifyAuthChange(currentUser);
      if (cloudActive()) {
        saveProfile(p, true);
      }
      return p;
    }
    throw new Error('不支持的文件格式');
  }

  // 本地账号升级为云端账号
  async function promoteLocalToCloud(password) {
    const u = getUser();
    if (!u) throw new Error('当前未登录任何账号');
    if (u.isCloud && getToken()) return { success: true, alreadyCloud: true, uid: u.uid };

    const name = u.name;
    let localProf = null;
    try {
      localProf = JSON.parse(localStorage.getItem('renying-prof-' + u.uid) || localStorage.getItem('renying-cloud-cache') || '{}');
    } catch (e) {}

    const res = await register(name, password);
    if (localProf) {
      saveProfile(localProf, true);
    }
    return { success: true, uid: res.uid, name: res.name, isCloud: true };
  }

  function init() {
    getUser();
  }

  // 挂载到全局
  if (typeof window !== 'undefined') {
    window.CloudSave = {
      init,
      getConfig,
      setConfig,
      hasValidConfig,
      register,
      login,
      logout,
      getUser,
      loadProfile,
      saveProfile,
      syncNow,
      pullNow,
      getSyncState,
      onSyncChange,
      onAuthChange,
      exportCurrentAccount,
      exportAllAccounts,
      importAccountData,
      computeProfileDigest,
      verifyProfileDigest,
      makeDevProfile,
      toCloudData,
      promoteLocalToCloud,
      isCloudAvailable: () => true,
      getEndpoint,
      setEndpoint
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
