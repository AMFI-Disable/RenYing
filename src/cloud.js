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
  let pendingUid = null;      // 这条待上传的存档属于哪个账号
  let retryN = 0;

  // sync state: local, idle, pending, syncing, ok, offline, error
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

  /* 本机账号的密码散列。
     旧版本用 btoa() 存密码：密码里有中文或任何非 Latin-1 字符就抛 InvalidCharacterError，
     账号根本建不起来。这里改成 SHA-256（拿不到 crypto.subtle 时退到 UTF-8 安全的编码），
     并能识别旧的 btoa 记录，登录成功后就地升级。 */
  const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
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
  function tempPassword() {
    const buf = new Uint8Array(9);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
    else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
    return Array.from(buf, b => PW_ALPHABET[b % PW_ALPHABET.length]).join('');
  }

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
      if (u && u.uid && !localStorage.getItem(profKey(u.uid))) {
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

  function notifyAuthChange(user) {
    authListeners.forEach(fn => {
      try { fn(user); } catch (err) { console.warn('Auth listener error:', err); }
    });
  }

  const DEV_ALL_CHARS = ['qingfeng', 'yanling', 'leiming', 'tieshan', 'liuyun', 'lingshuang', 'moyu', 'feiying', 'yuehua', 'yuxiao', 'zuixian', 'gouchen', 'lingque'];
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
    'yx_snow', 'zx_amber', 'gc_crimson',
    'lq_silk', 'lq_sparrow'
  ];

  function makeDevProfile() {
    return {
      name: 'Dev',
      ink: 99999,
      owned: DEV_ALL_CHARS.slice(),
      frags: {
        qingfeng: 99, yanling: 99, leiming: 99, tieshan: 99,
        liuyun: 99, lingshuang: 99, moyu: 99, feiying: 99, yuehua: 99,
        yuxiao: 99, zuixian: 99, gouchen: 99, lingque: 99
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
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
      ...(p.rk && typeof p.rk === 'object' ? { rk: JSON.parse(JSON.stringify(p.rk)) } : {}),
      ...(p.armory && typeof p.armory === 'object' ? { armory: p.armory } : (typeof window !== 'undefined' && typeof window.getDevArmoryState === 'function' ? { armory: window.getDevArmoryState() } : {}))
    };
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
      netWins: Math.max(Math.floor(+p1.netWins || 0), Math.floor(+p2.netWins || 0)),
      netLosses: Math.max(Math.floor(+p1.netLosses || 0), Math.floor(+p2.netLosses || 0)),
      rating: Math.max(Math.floor(+p1.rating || 1100), Math.floor(+p2.rating || 1100)),
      placed: Math.max(Math.floor(+p1.placed || 0), Math.floor(+p2.placed || 0)),
      stageStars,
      qfx: Math.max(Math.floor(+p1.qfx || 0), Math.floor(+p2.qfx || 0)),
      online10Unlocked: !!(p1.online10Unlocked || p2.online10Unlocked),
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
      const err = new Error(data.error || `请求失败 (${res.status})`);
      err.status = res.status;
      if (data.ban) err.ban = data.ban;
      throw err;
    }
    return data;
  }

  // 武库的每个动作都交给服务器算。每次带一个随机编号：网络断了用同一个编号重试，服务器只执行一次
  async function econ(act, args) {
    const u = getUser();
    if (!cloudActive() || !u) { const e = new Error('当前是本地存档'); e.status = 0; throw e; }
    const nonce = rhex(16);
    for (let i = 0; i < 3; i++) {
      let res = null, data = {};
      try {
        res = await fetch(getEndpoint() + '/api/econ', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body: JSON.stringify({ act, args: args || {}, nonce })
        });
        data = await res.json().catch(() => ({}));
      } catch (e) {
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      if (!getUser() || getUser().uid !== u.uid) { const e = new Error('账号已切换'); e.status = 409; throw e; }
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
  async function flushNow() { if (pendingData && cloudActive()) await doSync(); }
  // 反作弊记录（服务器那份只能往上加）
  async function acGet() { if (!cloudActive()) return null; const r = await api('/api/ac', { method: 'GET' }); return r && r.rec ? r : null; }
  async function acReport(reason) { if (!cloudActive()) return null; const r = await api('/api/ac', { method: 'POST', body: JSON.stringify({ reason: String(reason || '').slice(0, 60) }) }); return r && r.rec ? r : null; }
  // 服务器回来的存档：墨锭按账本算（加上本机还没被记上的那几条）
  function adoptProfile(uid, profile, L) {
    if (!profile || !L) return profile;
    ledgerLoad(uid);
    const acks = new Set(Array.isArray(L.acks) ? L.acks : []), now = Date.now();
    LEDGER.un = LEDGER.un.filter(x => !acks.has(x.id) && now - x.t < 10 * 86400e3);
    if (L.ver >= LEDGER.v || LEDGER.s === null) { LEDGER.s = L.ink; LEDGER.v = L.ver; }
    ledgerSave();
    profile.ink = Math.max(0, LEDGER.s + pendSum());
    return profile;
  }

  async function doSync() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    syncHooks.forEach(fn => { try { fn(); } catch (e) { console.warn('before sync', e); } });
    const data = pendingData;
    if (!data || !cloudActive()) return;
    if (pendingUid && pendingUid !== getUser().uid) {   // 存档不属于当前账号了：丢弃，绝不写进别人的档
      pendingData = null; pendingUid = null;
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSync({ state: 'offline' });
      return;
    }
    setSync({ state: 'syncing' });
    const uid = getUser().uid;
    ledgerLoad(uid);
    const ledger = LEDGER.s !== null ? { deltas: LEDGER.un.slice(0, 60).map(x => x.r ? { id: x.id, d: 0, r: x.r } : { id: x.id, d: x.d }), ev: LEDGER.v } : undefined;
    try {
      const res = await api('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ profile: data, ledger })
      });
      if (res && res.ledger && getUser() && getUser().uid === uid) {
        ledgerListeners.forEach(fn => { try { fn(res.ledger, res.fix || null, res.capped || 0, res.owed || 0); } catch (e) { console.warn('ledger listener', e); } });
      }
      if (pendingData === data) {
        pendingData = null; pendingUid = null;
        try { localStorage.removeItem(dirtyKey()); } catch (e) {}
      }
      retryN = 0;
      setSync({ state: pendingData ? 'pending' : 'ok', at: res.updatedAt || Date.now(), err: '' });
      if (pendingData) saveTimer = setTimeout(doSync, 800);
    } catch (err) {
      console.warn('Sync profile to Cloudflare failed:', err);
      const code = err && err.status;
      // 4xx 是服务器明确拒绝（存档无效、被封、请求体太大）：重试多少次都一样，别无限重试
      if (code && code >= 400 && code < 500 && code !== 429) {
        if (pendingData === data) { pendingData = null; pendingUid = null; }
        try { localStorage.removeItem(dirtyKey()); } catch (e) {}
        setSync({ state: 'blocked', err: (err.message || '云端拒绝了这次存档') + '，本机存档不受影响，可先导出备份' });
        return;
      }
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

  // 开发者账号处理：Dev 和别的账号一样用云端的密码登录（网页里不存 Dev 的密码）。
  // 云端的 Dev 号别人注册不了，没有的话在管理后台建；密码也只能在管理后台重设
  async function loginDev(password) {
    try {
      let data = null;
      try {
        data = await api('/api/login', {
          method: 'POST',
          body: JSON.stringify({ username: 'Dev', password })
        });
      } catch (err) {
        if (err && err.status === 404) {
          const e = new Error('云端还没有 Dev 账号，请先在管理后台建一个');
          e.status = 404;
          throw e;
        }
        throw err;
      }

      setToken(data.token);
      const userObj = {
        uid: data.uid,
        name: 'Dev',
        displayName: 'Dev',
        token: data.token,
        isCloud: true,
        isDevMaster: true
      };
      currentUser = userObj;
      try {
        localStorage.setItem('renying-local-current', JSON.stringify(userObj));
      } catch (e) {}

      let devProf = null;
      if (data.profile) {
        devProf = adoptProfile(data.uid, data.profile, data.ledger);
      } else {
        devProf = makeDevProfile();
      }
      // 保证 Dev 开发者账号拥有全角色全皮肤等基础特权
      const baseDev = makeDevProfile();
      devProf.owned = Array.from(new Set([...(devProf.owned || []), ...baseDev.owned]));
      devProf.skins = Array.from(new Set([...(devProf.skins || []), ...baseDev.skins]));
      devProf.ink = Math.max(devProf.ink || 0, baseDev.ink);
      devProf.online10Unlocked = true;

      try {
        localStorage.setItem(profKey(data.uid), JSON.stringify(devProf));
      } catch (e) {}

      setSync({ state: 'ok', at: Date.now(), err: '' });
      notifyAuthChange(currentUser);
      return userObj;
    } catch (netErr) {
      if (netErr && netErr.status) throw netErr;   // 服务器回了话（密码不对、试错太多、没有这个号）：照实说
      console.warn('Dev cloud login failed, falling back to local dev account:', netErr);
      const uid = 'dev_master';
      let devProf = null;
      try {
        devProf = JSON.parse(localStorage.getItem('renying-prof-' + uid) || 'null');
      } catch (e) {}
      if (!devProf) {
        devProf = makeDevProfile();
      }
      try {
        localStorage.setItem(profKey(uid), JSON.stringify(devProf));
        localStorage.setItem('renying-local-current', JSON.stringify({ uid, name: 'Dev', isDevMaster: true, isCloud: false }));
      } catch (e) {}
      currentUser = { uid, displayName: 'Dev', name: 'Dev', isDevMaster: true, isCloud: false };
      notifyAuthChange(currentUser);
      return { uid, name: 'Dev', isCloud: false, isDevMaster: true };
    }
  }

  // 账号注册
  async function register(username, password) {
    const name = String(username).trim();
    if (!name || name.length < 2) throw new Error('昵称至少需要 2 个字符');
    if (!password || password.length < 6) throw new Error('密码至少需要 6 个字符');

    if (name.toLowerCase() === 'dev') {
      try { return await loginDev(password); }
      catch (e) { throw e && e.status === 401 ? new Error('该昵称已被使用') : e; }
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
        adoptProfile(data.uid, data.profile, data.ledger);
        try {
          localStorage.setItem(profKey(data.uid), JSON.stringify(data.profile));
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
      const rndBuf = new Uint8Array(4);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(rndBuf);
      else for (let i = 0; i < 4; i++) rndBuf[i] = (Math.random() * 256) | 0;
      const rndHex = Array.from(rndBuf, b => b.toString(16).padStart(2, '0')).join('');
      const uid = 'local_' + Date.now() + '_' + rndHex;
      mockUsers[name] = { uid, name, pw: await pwHash(password), pwv: 2, created: Date.now() };
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
        adoptProfile(data.uid, data.profile, data.ledger);
        try {
          localStorage.setItem(profKey(data.uid), JSON.stringify(data.profile));
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
      const pwOk = await pwMatches(localU, password);
      if (localU && pwOk) {
        if (localU.pwv !== 2) {   // 老记录：登录成功时顺手升级成散列
          localU.pw = await pwHash(password); localU.pwv = 2;
          mockUsers[name] = localU;
          try { localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers)); } catch (e) {}
        }
        // 本地老账号自动在云端注册并同步
        try {
          let localProf = null;
          try {
            localProf = readMirror(localU.uid);
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
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    pendingData = null; pendingUid = null;   // 防抖中的存档不能落到下一个登录的账号里
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
          const cloudData = res.profile;
          let local = null;
          try {
            local = JSON.parse(localStorage.getItem('renying-prof-' + u.uid) || 'null');
          } catch (e) {}

          // 自动双向合并云端和本地数据，绝不破坏覆盖
          const merged = mergeProfiles(local, cloudData);

          if (res.ledger) {
            // 对齐墨锭账本
            ledgerLoad(u.uid);
            if (LEDGER.s === null) { LEDGER.s = res.ledger.ink; LEDGER.v = -1; }
            if (local && local.ink) ledgerNote(u.uid, local.ink);
            adoptProfile(u.uid, merged, res.ledger);
          }

          // 如果合并后产生了新增角色/皮肤/星级/战绩，自动补传同步上云
          const localChanged = !local ||
            (merged.owned || []).length > (cloudData.owned || []).length ||
            (merged.skins || []).length > (cloudData.skins || []).length ||
            (merged.ink || 0) > (cloudData.ink || 0);

          try {
            localStorage.removeItem(dirtyKey());
            localStorage.setItem(profKey(u.uid), JSON.stringify(merged));
          } catch (e) {}

          if (localChanged) {
            setTimeout(() => saveProfile(merged, true), 1000);
          } else if (!pendingData) {
            setSync({ state: 'ok', at: Date.now(), err: '' });
          }

          return merged;
        }
      } catch (err) {
        console.warn('Load cloud profile error, reading local cache:', err);
      }
    }

    // 只读本账号的本地镜像：绝不回退到公共缓存，那等于把别人的存档当成自己的
    const localProf = readMirror(u.uid);
    if (localProf) return localProf;
    return null;
  }

  // 保存云端档案（支持防抖节流）
  function saveProfile(prof, immediate) {
    const u = getUser();
    const dataToSave = toCloudData(prof);
    if (u && u.name) dataToSave.name = u.name;

    if (!u) {
      try { localStorage.setItem('renying-guest-profile', JSON.stringify(dataToSave)); } catch (e) {}
      return;
    }

    // 立即写入本账号的本地镜像
    try { localStorage.setItem(profKey(u.uid), JSON.stringify(dataToSave)); } catch (e) {}

    if (!cloudActive()) {
      setSync({ state: 'local' });
      return;
    }

    ledgerNote(u.uid, dataToSave.ink);   // 这次存档里墨锭的变化记成一条待上报
    pendingData = dataToSave; pendingUid = u.uid;
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
      const local = readMirror(getUser().uid);
      if (!local) throw new Error('本机没有可上传的存档');
      pendingData = Object.assign(toCloudData(local), { name: getUser().name, updatedAt: Date.now() });
      pendingUid = getUser().uid;
    }
    await doSync();
    if (sync.state === 'error' || sync.state === 'blocked') throw new Error(sync.err || '云端拒绝了这次存档');
  }

  // 手动“双向同步合并”（从云端拉取并与本地智能融合）
  async function pullNow() {
    if (!cloudActive()) throw new Error('当前是本地存档，未连接云端');
    const res = await api('/api/profile', { method: 'GET' });
    if (!res || !res.profile) throw new Error('云端还没有这个账号的存档');
    const cloudData = res.profile;

    let local = null;
    const uid = getUser().uid;
    try {
      local = JSON.parse(localStorage.getItem('renying-prof-' + uid) || 'null');
    } catch (e) {}

    // 智能双向合并，保留本地与云端两边各自的新增资产
    const merged = mergeProfiles(local, cloudData);

    adoptProfile(uid, merged, res.ledger);
    pendingData = null; pendingUid = null;

    try {
      localStorage.removeItem(dirtyKey());
      localStorage.setItem(profKey(uid), JSON.stringify(merged));
    } catch (e) {}

    // 将融合后的完整成果回写至云端，保持双端一致
    saveProfile(merged, true);
    setSync({ state: 'ok', at: Date.now(), err: '' });
    return merged;
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
  // 存档里所有会进云端的字段都参与签名；v1 只签了六个字段（星级、碎片、装备都能改而不被发现）
  const SIGNED_KEYS = ['name', 'ink', 'owned', 'frags', 'pity', 'spity', 'skins', 'equip',
    'netWins', 'netLosses', 'rating', 'placed', 'online10Unlocked', 'stageStars', 'qfx', 'rk'];
  function canonicalProfile(p) {
    const norm = v => {
      if (Array.isArray(v)) return v.map(norm);
      if (v && typeof v === 'object') return Object.keys(v).sort().map(k => [k, norm(v[k])]);
      return v === undefined ? null : v;
    };
    return JSON.stringify(SIGNED_KEYS.map(k => [k, norm(p[k])]));
  }
  async function computeProfileDigest(p, salt = 'ry_sword_auth_2026') {
    if (!p) return '';
    const raw = `RY_V2|${canonicalProfile(p)}|${salt}`;
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // 没有 crypto.subtle（http 页面）就算不出真签名：返回空串，让调用方明确地“不声称已校验”
    return '';
  }
  // v1（旧导出）的签名只覆盖六个字段；用于识别老文件，不作为安全依据
  async function computeLegacyDigest(p, salt = 'ry_sword_auth_2026') {
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
        const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
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

  /* 校验结果：'ok' 校验通过 / 'tampered' 被改过 / 'weak' 只对得上旧版弱签名 / 'unsigned' 没有签名 */
  async function verifyProfileDigest(data) {
    if (!data || typeof data !== 'object') return 'unsigned';
    const p = data.profile || data;
    const sig = data._sig || (data.profile && data.profile._sig);
    if (!sig) return 'unsigned';
    const expected = await computeProfileDigest(p);
    if (expected && expected === sig) return 'ok';
    const legacy = await computeLegacyDigest(p);
    if (legacy && legacy === sig) return 'weak';
    return expected ? 'tampered' : 'weak';
  }

  // 导出单账号存档
  async function exportCurrentAccount(prof) {
    const u = getUser();
    let activeProf = prof;
    if (!activeProf) activeProf = (u && readMirror(u.uid)) || {};
    const name = (u && u.name) || activeProf.name || '大侠';
    const profData = toCloudData(activeProf);
    profData.name = name;
    const sig = await computeProfileDigest(profData);
    if (!sig) {
      // http 页面拿不到 WebCrypto：老代码会在这里悄悄写一个 32 位弱签名，看起来像校验过
      throw new Error('当前页面无法安全签名（需要 https 或 localhost）。请用 https 打开后再导出，否则备份文件无法校验');
    }
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
      _sig: sig,
      _alg: 'sha256-v2'   // 老文件没有这个字段：只对得上 v1 弱签名的会被标成“旧版弱校验”
    };
    const safeName = String(name).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') || 'player';
    triggerDownload(`renying-account-${safeName}.json`, JSON.stringify(payload, null, 2));
    return payload;
  }

  // 导出全部本地账号
  async function exportAllAccounts() {
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
      accounts.push({ account: u, profile: prof, _sig: prof ? await computeProfileDigest(prof) : '' });
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
      const sigState = await verifyProfileDigest(data);
      if (sigState === 'tampered') {
        throw new Error('⚠️ 存档校验和不匹配：该备份文件已被外部篡改');
      }
      // 'weak'：只对得上旧版（只签六个字段）的签名。可以导入，但别假装它是完整校验过的
      const weakNote = sigState === 'weak' ? '旧版备份：只有墨锭与胜负经过校验' : '';
      const p = data.profile;
      const uid = (data.account && data.account.uid) || ('imported_' + Date.now());
      const name = (data.account && data.account.name) || p.name || '大侠';
      localStorage.setItem(profKey(uid), JSON.stringify(p));
      localStorage.setItem('renying-local-current', JSON.stringify({ uid, name, isCloud: false }));
      currentUser = { uid, name, displayName: name, isCloud: false };
      notifyAuthChange(currentUser);
      if (cloudActive()) {
        saveProfile(p, true);
      }
      p._importNote = weakNote;
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
      localProf = readMirror(u.uid) || {};
    } catch (e) {}

    const res = await register(name, password);
    if (localProf) {
      saveProfile(localProf, true);
    }
    return { success: true, uid: res.uid, name: res.name, isCloud: true };
  }

  function init() {
    migrateLegacyCache();
    getUser();
    // 离线时降成本地 dev_master 的 Dev，联网后重新登录一次就回到云端（网页里不存 Dev 的密码，没法自动登录）
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
      mergeProfiles,
      promoteLocalToCloud,
      isCloudAvailable: () => true,
      getEndpoint,
      setEndpoint,
      econ,
      market,
      flushNow,
      acGet,
      acReport,
      ledgerSync,
      ledgerRevert,
      onLedger,
      onBeforeSync,
      inkGrantKey,
      inkGrantTake: grantTake
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
