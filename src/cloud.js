// 刃影 云端单账号存储与同步模块 (Google Firebase Auth + Cloud Firestore)
// 提供云端账号注册、登录、自动同步以及断网本地降级机制

(function() {
  'use strict';

  // 默认配置（可通过 window.FIREBASE_CONFIG 覆盖，或在游戏内通过 localStorage 配置）
  const DEFAULT_CONFIG = {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  };

  let fbApp = null;
  let fbAuth = null;
  let fbDb = null;
  let currentUser = null;
  let authListeners = [];
  let saveTimer = null;
  // 云端规则还没更新、不认识排位字段 rk 时，去掉它再存一次，以后这个会话里就不再带上
  let rkBlocked = false;

  // ---------- 云同步状态：本机先存、再上传；失败自动重试，关网页前没传完的下次打开补传 ----------
  // state: local（没连云端，只存本机） idle（连上云端，还没传过） pending（等待上传） syncing（上传中） ok（已同步） offline（断网，联网后自动补传） error（失败）
  const sync = { state: 'local', at: 0, err: '' };
  const syncListeners = [];
  let pendingData = null, retryN = 0;
  function cloudActive() { return !!(hasValidConfig() && fbDb && currentUser && currentUser.uid !== 'dev_master' && !String(currentUser.uid).startsWith('local_')); }
  function dirtyKey() { return 'renying-sync-dirty-' + (currentUser && currentUser.uid); }
  function setSync(patch) {
    Object.assign(sync, patch);
    try { if (sync.at) localStorage.setItem('renying-sync-at-' + (currentUser && currentUser.uid), String(sync.at)); } catch (e) {}
    const snap = getSyncState();
    syncListeners.forEach(fn => { try { fn(snap); } catch (e) {} });
  }
  function getSyncState() {
    let at = sync.at;
    if (!at && currentUser) { try { at = +localStorage.getItem('renying-sync-at-' + currentUser.uid) || 0; } catch (e) {} }
    let state = cloudActive() ? sync.state : 'local';
    if (state === 'local' && cloudActive()) state = at ? 'ok' : 'idle';   // 连上了云端但这次还没传过
    return { state, at, err: sync.err, cloud: cloudActive(), pending: !!pendingData };
  }
  function onSyncChange(fn) { if (typeof fn === 'function') syncListeners.push(fn); }
  async function writeDoc(data) {
    try {
      await fbDb.collection('users').doc(currentUser.uid).set(data, { merge: true });
    } catch (err) {
      if (data.rk && err && err.code === 'permission-denied') {   // 规则还不认识 rk：去掉再试一次
        rkBlocked = true;
        delete data.rk;
        await fbDb.collection('users').doc(currentUser.uid).set(data, { merge: true });
        return;
      }
      throw err;
    }
  }
  async function doSync() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const data = pendingData;
    if (!data || !cloudActive()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setSync({ state: 'offline' }); return; }
    setSync({ state: 'syncing' });
    try {
      await writeDoc(data);
      if (pendingData === data) {
        pendingData = null;
        try { localStorage.removeItem(dirtyKey()); } catch (e) {}
      }
      retryN = 0;
      setSync({ state: pendingData ? 'pending' : 'ok', at: Date.now(), err: '' });
      if (pendingData) saveTimer = setTimeout(doSync, 800);
    } catch (err) {
      console.warn('Sync profile to Firestore failed:', err);
      if (err && err.code === 'permission-denied') {   // 云端校验不通过，重试也没用：本机数据还在，提示一下
        if (pendingData === data) pendingData = null;
        setSync({ state: 'error', err: '云端拒绝了这次存档（单次变化超出了云端的校验范围），本机存档不受影响' });
        return;
      }
      retryN++;
      const wait = [2, 5, 15, 30, 60][Math.min(retryN, 5) - 1] * 1000;
      setSync({ state: 'error', err: `上传失败，${Math.round(wait / 1000)} 秒后自动重试` });
      saveTimer = setTimeout(doSync, wait);
    }
  }
  // 立刻把还没上传的存档传上去（切到后台、关网页、恢复联网时）
  function flush() { if (pendingData && cloudActive()) doSync(); }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', flush);
    window.addEventListener('offline', () => { if (pendingData) setSync({ state: 'offline' }); });
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  function getConfig() {
    if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId) {
      return window.FIREBASE_CONFIG;
    }
    try {
      const saved = localStorage.getItem('renying-firebase-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.projectId) return parsed;
      }
    } catch (e) {}
    return DEFAULT_CONFIG;
  }

  function setConfig(cfg) {
    try {
      if (cfg && cfg.projectId) {
        localStorage.setItem('renying-firebase-config', JSON.stringify(cfg));
      } else {
        localStorage.removeItem('renying-firebase-config');
      }
    } catch (e) {}
    fbApp = fbAuth = fbDb = null;
    init();
  }

  function hasValidConfig() {
    const cfg = getConfig();
    return !!(cfg && cfg.projectId && cfg.apiKey);
  }

  function toEmail(nameOrEmail) {
    const s = String(nameOrEmail).trim();
    if (s.includes('@')) return s;
    // 中文或特殊字符通过 base64 / safe encode 转换成标准邮箱格式
    let encoded = '';
    try {
      encoded = btoa(encodeURIComponent(s)).replace(/=/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    } catch (e) {
      encoded = 'u_' + Date.now();
    }
    return `ry_${encoded}@renying.game`;
  }

  function init() {
    const cfg = getConfig();
    if (window.firebase && cfg.projectId && cfg.apiKey) {
      try {
        if (!firebase.apps || !firebase.apps.length) {
          fbApp = firebase.initializeApp(cfg);
        } else {
          fbApp = firebase.app();
        }
        fbAuth = firebase.auth();
        fbDb = firebase.firestore();

        fbAuth.onAuthStateChanged(user => {
          currentUser = user;
          authListeners.forEach(fn => {
            try { fn(user); } catch (err) { console.warn('Auth listener error:', err); }
          });
        });
      } catch (err) {
        console.warn('Firebase init error, fallback to local storage:', err);
        fbApp = fbAuth = fbDb = null;
      }
    }
  }

  const DEV_ALL_CHARS = ['qingfeng', 'yanling', 'leiming', 'tieshan', 'liuyun', 'lingshuang', 'moyu', 'feiying', 'yuehua', 'yuxiao', 'zuixian', 'gouchen'];
  const DEV_ALL_SKINS = [
    'qf_frost', 'qf_gold', 'qf_abyss', 'qf_qfx',
    'fy_jade', 'fy_blood', 'fy_phantom',
    'ts_bronze', 'ts_obsidian', 'ts_crimson',
    'ls_plum', 'ls_aurora', 'ls_dragon',
    'ly_dusk', 'ly_sky', 'ly_bamboo',
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
      name: String(p.name || 'Dev').slice(0, 24),
      ink: Math.max(0, Math.floor(p.ink || 0)),
      owned: Array.isArray(p.owned) && p.owned.length ? Array.from(new Set(p.owned)) : DEV_ALL_CHARS.slice(),
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
      updatedAt: Date.now(),
      ...(p.rk && typeof p.rk === 'object' && !rkBlocked ? { rk: JSON.parse(JSON.stringify(p.rk)) } : {})
    };
  }

  // Dev 开发者账号处理：支持直接在 Google Cloud Firestore 写入与读取真实数据（无自动作弊全解锁脚本）
  async function loginDev(password) {
    if (btoa(password) !== 'SUFNQURFVkJSTw==') {
      throw new Error('昵称或密码不对');
    }

    // 尝试在 Google Cloud (Firebase Auth + Cloud Firestore) 登录 Dev 真实账号
    if (hasValidConfig() && fbAuth && fbDb) {
      try {
        const email = toEmail('Dev');
        let cred = null;
        try {
          cred = await fbAuth.signInWithEmailAndPassword(email, password);
        } catch (authErr) {
          if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-login-credentials') {
            cred = await fbAuth.createUserWithEmailAndPassword(email, password);
          } else {
            throw authErr;
          }
        }

        currentUser = cred.user;
        currentUser.isDevMaster = true;
        if (currentUser.updateProfile) {
          try { await currentUser.updateProfile({ displayName: 'Dev' }); } catch (e) {}
        }

        // 读取云端已有的真实数据；如果云端文档不存在，才初始化基础存档，绝不强制覆盖作弊数据
        const docRef = fbDb.collection('users').doc(currentUser.uid);
        const snap = await docRef.get();
        let devProf = null;
        if (snap.exists) {
          devProf = snap.data();
        } else {
          // 查看本地是否有已有 Dev 存档镜像
          let cached = null;
          try {
            cached = JSON.parse(localStorage.getItem('renying-prof-' + currentUser.uid) || localStorage.getItem('renying-prof-dev_master') || 'null');
          } catch (e) {}
          devProf = cached || {
            name: 'Dev',
            ink: 500,
            owned: ['qingfeng'],
            frags: {},
            pity: 0,
            spity: 0,
            skins: [],
            equip: {},
            netWins: 0,
            netLosses: 0,
            rating: 1100,
            placed: 0,
            online10Unlocked: false,
            stageStars: {},
            qfx: 0,
            updatedAt: Date.now()
          };
          await docRef.set(toCloudData(devProf), { merge: true });
        }

        // 写入本地缓存镜像
        try {
          localStorage.setItem('renying-prof-' + currentUser.uid, JSON.stringify(devProf));
          localStorage.setItem('renying-cloud-cache', JSON.stringify(devProf));
          localStorage.setItem('renying-local-current', JSON.stringify({ uid: currentUser.uid, name: 'Dev', isDevMaster: true }));
          const mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}');
          mockUsers['Dev'] = { uid: currentUser.uid, name: 'Dev', pw: 'SUFNQURFVkJSTw==', isDevMaster: true, created: Date.now() };
          localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
        } catch (e) {}

        return {
          uid: currentUser.uid,
          name: 'Dev',
          email: email,
          isCloud: true,
          isDevMaster: true
        };
      } catch (cloudErr) {
        console.warn('Google Cloud / Firebase Dev 登录同步异常，安全降级至本地模式:', cloudErr);
      }
    }

    // 本地降级模拟
    const uid = 'dev_master';
    let devProf = null;
    try {
      devProf = JSON.parse(localStorage.getItem('renying-prof-' + uid) || 'null');
    } catch (e) {}
    if (!devProf) {
      devProf = {
        name: 'Dev',
        ink: 500,
        owned: ['qingfeng'],
        frags: {},
        pity: 0,
        spity: 0,
        skins: [],
        equip: {},
        netWins: 0,
        netLosses: 0,
        rating: 1100,
        placed: 0,
        online10Unlocked: false,
        stageStars: {},
        qfx: 0,
        updatedAt: Date.now()
      };
    }
    try {
      localStorage.setItem('renying-prof-' + uid, JSON.stringify(devProf));
      localStorage.setItem('renying-cloud-cache', JSON.stringify(devProf));
      localStorage.setItem('renying-local-current', JSON.stringify({ uid, name: 'Dev', isDevMaster: true }));
      const mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}');
      mockUsers['Dev'] = { uid, name: 'Dev', pw: 'SUFNQURFVkJSTw==', isDevMaster: true, created: Date.now() };
      localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
    } catch (e) {}
    currentUser = { uid, displayName: 'Dev', isDevMaster: true };
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

    if (hasValidConfig() && fbAuth && fbDb) {
      const email = toEmail(name);
      let cred = null;
      try {
        cred = await fbAuth.createUserWithEmailAndPassword(email, password);
      } catch (authErr) {
        if (authErr.code === 'auth/email-already-in-use') {
          throw new Error('该昵称已在云端注册，请直接点击“登录”');
        } else if (authErr.code === 'auth/unauthorized-domain') {
          throw new Error('当前域名未获 Firebase 授权，请在控制台添加此域名');
        } else if (authErr.code === 'auth/operation-not-allowed') {
          throw new Error('Firebase 未启用电子邮件/密码登录方式');
        } else {
          throw new Error('云端注册失败: ' + (authErr.message || authErr.code));
        }
      }
      currentUser = cred.user;
      if (currentUser.updateProfile) {
        try { await currentUser.updateProfile({ displayName: name }); } catch (e) {}
      }

      // 继承游客进度上传至云端
      let initialProf = null;
      try {
        const guestRaw = localStorage.getItem('renying-guest-profile');
        if (guestRaw) initialProf = JSON.parse(guestRaw);
      } catch (e) {}
      if (initialProf) {
        initialProf.name = name;
        await fbDb.collection('users').doc(currentUser.uid).set(toCloudData(initialProf), { merge: true });
        try {
          localStorage.setItem('renying-prof-' + currentUser.uid, JSON.stringify(initialProf));
          localStorage.setItem('renying-cloud-cache', JSON.stringify(initialProf));
          localStorage.removeItem('renying-guest-profile');
        } catch (e) {}
      }
      return {
        uid: currentUser.uid,
        name: name,
        email: email,
        isCloud: true
      };
    }

    // 本地降级模拟
    const mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}');
    if (mockUsers[name]) throw new Error('该昵称已在本机注册');
    const uid = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    mockUsers[name] = { uid, name, pw: btoa(password), created: Date.now() };
    localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
    localStorage.setItem('renying-local-current', JSON.stringify({ uid, name }));
    currentUser = { uid, displayName: name };

    try {
      const guestRaw = localStorage.getItem('renying-guest-profile');
      if (guestRaw) {
        const guestProf = JSON.parse(guestRaw);
        if (guestProf) {
          guestProf.name = name;
          localStorage.setItem('renying-prof-' + uid, JSON.stringify(guestProf));
          localStorage.setItem('renying-cloud-cache', JSON.stringify(guestProf));
          localStorage.removeItem('renying-guest-profile');
        }
      }
    } catch (e) {}

    return { uid, name, isCloud: false };
  }

  // 账号登录（支持已有本地账号无缝自动升级迁移至云端）
  async function login(username, password) {
    const name = String(username).trim();
    if (!name) throw new Error('请输入昵称或邮箱');
    if (!password) throw new Error('请输入密码');

    if (name.toLowerCase() === 'dev') {
      return await loginDev(password);
    }

    if (hasValidConfig() && fbAuth && fbDb) {
      const email = toEmail(name);
      let cred = null;
      try {
        cred = await fbAuth.signInWithEmailAndPassword(email, password);
      } catch (authErr) {
        // 检查该用户是否已有本地已注册账号需自动升级至云端
        let mockUsers = {};
        try { mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}'); } catch (e) {}
        const localU = mockUsers[name];
        if ((authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-login-credentials') && localU && localU.pw === btoa(password)) {
          // 本地老账号自动在 Firebase Auth 注册云端对应身份
          try {
            cred = await fbAuth.createUserWithEmailAndPassword(email, password);
            currentUser = cred.user;
            if (currentUser.updateProfile) {
              try { await currentUser.updateProfile({ displayName: name }); } catch (e) {}
            }
            // 将本地老存档迁移到 Cloud Firestore
            let localProf = null;
            try {
              const pStr = localStorage.getItem('renying-prof-' + localU.uid) || localStorage.getItem('renying-cloud-cache');
              if (pStr) localProf = JSON.parse(pStr);
            } catch (e) {}
            if (localProf) {
              localProf.name = name;
              await fbDb.collection('users').doc(currentUser.uid).set(toCloudData(localProf), { merge: true });
              localStorage.setItem('renying-prof-' + currentUser.uid, JSON.stringify(localProf));
              localStorage.setItem('renying-cloud-cache', JSON.stringify(localProf));
            }
            localU.uid = currentUser.uid;
            localU.migratedToCloud = true;
            mockUsers[name] = localU;
            localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
            localStorage.setItem('renying-local-current', JSON.stringify({ uid: currentUser.uid, name: name }));
            return { uid: currentUser.uid, name: name, email: email, isCloud: true, migrated: true };
          } catch (migrateErr) {
            console.warn('Auto migration error:', migrateErr);
            throw new Error('本地账号升级至云端失败: ' + (migrateErr.message || migrateErr.code));
          }
        } else if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-login-credentials') {
          throw new Error('昵称或密码不对');
        } else if (authErr.code === 'auth/user-not-found') {
          throw new Error('未找到该账号，请先点击“注册”');
        } else if (authErr.code === 'auth/unauthorized-domain') {
          throw new Error('当前域名未获 Firebase 授权，请在控制台添加此域名');
        } else {
          throw new Error('云端登录失败: ' + (authErr.message || authErr.code));
        }
      }
      currentUser = cred.user;
      localStorage.setItem('renying-local-current', JSON.stringify({ uid: currentUser.uid, name: currentUser.displayName || name }));
      return {
        uid: currentUser.uid,
        name: currentUser.displayName || name,
        email: email,
        isCloud: true
      };
    }

    // 本地降级模拟
    const mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}');
    const u = mockUsers[name];
    if (!u || u.pw !== btoa(password)) throw new Error('昵称或密码不对');
    localStorage.setItem('renying-local-current', JSON.stringify({ uid: u.uid, name: u.name }));
    currentUser = { uid: u.uid, displayName: u.name };
    return { uid: u.uid, name: u.name, isCloud: false };
  }

  // 将当前本地账号升级/上传至云端 Firebase Auth + Cloud Firestore
  async function promoteLocalToCloud(password) {
    if (!hasValidConfig() || !fbAuth || !fbDb) {
      throw new Error('未配置或未连通 Firebase，请在下方【云存档设置】填入配置');
    }
    const u = getUser();
    if (!u) throw new Error('当前未登录任何账号');
    if (u.isCloud) return { success: true, alreadyCloud: true, uid: u.uid };

    const name = u.name;
    const email = toEmail(name);
    let cred = null;
    try {
      cred = await fbAuth.signInWithEmailAndPassword(email, password);
    } catch (authErr) {
      if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-login-credentials') {
        cred = await fbAuth.createUserWithEmailAndPassword(email, password);
      } else {
        throw authErr;
      }
    }

    currentUser = cred.user;
    if (u.isDevMaster) currentUser.isDevMaster = true;
    if (currentUser.updateProfile) {
      try { await currentUser.updateProfile({ displayName: name }); } catch (e) {}
    }

    // 读取本地当前存档并上传
    let localProf = null;
    try {
      localProf = JSON.parse(localStorage.getItem('renying-prof-' + u.uid) || localStorage.getItem('renying-cloud-cache') || '{}');
    } catch (e) {}
    const cloudData = toCloudData(localProf);
    cloudData.name = name;
    await fbDb.collection('users').doc(currentUser.uid).set(cloudData, { merge: true });

    // 更新本地账号映射
    try {
      let mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}');
      if (mockUsers[name]) {
        mockUsers[name].uid = currentUser.uid;
        mockUsers[name].migratedToCloud = true;
        localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
      }
      localStorage.setItem('renying-prof-' + currentUser.uid, JSON.stringify(cloudData));
      localStorage.setItem('renying-cloud-cache', JSON.stringify(cloudData));
      localStorage.setItem('renying-local-current', JSON.stringify({ uid: currentUser.uid, name: name, isDevMaster: !!u.isDevMaster }));
    } catch (e) {}

    setSync({ state: 'ok', at: Date.now(), err: '' });
    return { success: true, uid: currentUser.uid, name: name, isCloud: true };
  }

  // 退出登录
  async function logout() {
    if (fbAuth && currentUser) {
      try { await fbAuth.signOut(); } catch (e) {}
    }
    currentUser = null;
    try { localStorage.removeItem('renying-local-current'); } catch (e) {}
  }

  // 获取当前用户
  function getUser() {
    if (currentUser) {
      const isDev = !!currentUser.isDevMaster;
      return {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || '大侠',
        isCloud: hasValidConfig() && !!fbDb && currentUser.uid !== 'dev_master' && !currentUser.uid.startsWith('local_'),
        isDevMaster: isDev
      };
    }
    try {
      const local = JSON.parse(localStorage.getItem('renying-local-current') || 'null');
      if (local && local.uid) {
        const isDev = !!local.isDevMaster;
        currentUser = { uid: local.uid, displayName: local.name, isDevMaster: isDev };
        return { ...local, isCloud: false, isDevMaster: isDev };
      }
    } catch (e) {}
    return null;
  }

  // 加载云端档案
  async function loadProfile() {
    const u = getUser();
    if (!u) {
      try {
        const guest = localStorage.getItem('renying-guest-profile');
        if (guest) return JSON.parse(guest);
      } catch (e) {}
      return null;
    }

    if (hasValidConfig() && fbDb && currentUser && currentUser.uid !== 'dev_master' && !currentUser.uid.startsWith('local_')) {
      try {
        const snap = await fbDb.collection('users').doc(currentUser.uid).get();
        if (snap.exists) {
          const data = snap.data();
          // 上次关网页前有没传完的本机存档，而且比云端新：用本机的，并补传上去
          let local = null, dirty = 0;
          try { dirty = +localStorage.getItem(dirtyKey()) || 0; local = JSON.parse(localStorage.getItem('renying-prof-' + currentUser.uid) || 'null'); } catch (e) {}
          const cloudAt = typeof data.updatedAt === 'number' ? data.updatedAt : (data.updatedAt && data.updatedAt.toMillis ? data.updatedAt.toMillis() : 0);
          if (dirty && local && (local.updatedAt || 0) > cloudAt) {
            saveProfile(local, true);
            return local;
          }
          try {
            localStorage.removeItem(dirtyKey());
            localStorage.setItem('renying-cloud-cache', JSON.stringify(data));
            localStorage.setItem('renying-prof-' + currentUser.uid, JSON.stringify(data));
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

    if (!cloudActive()) { setSync({ state: 'local' }); return; }

    pendingData = dataToSave;
    try { localStorage.setItem(dirtyKey(), String(dataToSave.updatedAt)); } catch (e) {}
    if (sync.state !== 'syncing') setSync({ state: 'pending' });
    if (saveTimer) clearTimeout(saveTimer);
    if (immediate) doSync();
    else saveTimer = setTimeout(doSync, 1500);
  }

  // 手动“立即上传”：把本机最新的存档传一遍
  async function syncNow() {
    if (!cloudActive()) throw new Error('当前是本地存档，没有连接云端');
    if (!pendingData) {
      let local = null;
      try { local = JSON.parse(localStorage.getItem('renying-prof-' + currentUser.uid) || 'null'); } catch (e) {}
      if (!local) throw new Error('本机没有可上传的存档');
      pendingData = Object.assign(toCloudData(local), { name: getUser().name, updatedAt: Date.now() });
    }
    await doSync();
    if (sync.state === 'error') throw new Error(sync.err);
  }
  // 手动“从云端拉取”：以云端为准覆盖本机
  async function pullNow() {
    if (!cloudActive()) throw new Error('当前是本地存档，没有连接云端');
    const snap = await fbDb.collection('users').doc(currentUser.uid).get();
    if (!snap.exists) throw new Error('云端还没有这个账号的存档');
    const data = snap.data();
    pendingData = null;
    try {
      localStorage.removeItem(dirtyKey());
      localStorage.setItem('renying-cloud-cache', JSON.stringify(data));
      localStorage.setItem('renying-prof-' + currentUser.uid, JSON.stringify(data));
    } catch (e) {}
    setSync({ state: 'ok', at: Date.now(), err: '' });
    return data;
  }

  function onAuthChange(fn) {
    if (typeof fn === 'function') authListeners.push(fn);
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

  // 计算存档防篡改数字校验和 (SHA-256 Digest)
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

  // 导出当前账号存档 (.json)
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
    const profData = {
      name: name,
      ink: Math.max(0, Math.floor(activeProf.ink || 0)),
      owned: Array.isArray(activeProf.owned) ? Array.from(new Set(activeProf.owned)) : ['qingfeng'],
      frags: activeProf.frags || {},
      pity: Math.max(0, Math.floor(activeProf.pity || 0)),
      spity: Math.max(0, Math.floor(activeProf.spity || 0)),
      skins: Array.isArray(activeProf.skins) ? Array.from(new Set(activeProf.skins)) : [],
      equip: activeProf.equip || {},
      netWins: Math.max(0, Math.floor(activeProf.netWins || 0)),
      netLosses: Math.max(0, Math.floor(activeProf.netLosses || 0)),
      online10Unlocked: !!activeProf.online10Unlocked,
      stageStars: activeProf.stageStars || {},
      qfx: Math.max(0, Math.floor(activeProf.qfx || 0)),
      rating: activeProf.rating || 1100,
      placed: activeProf.placed || 0
    };
    const sig = await computeProfileDigest(profData);
    const payload = {
      app: 'renying',
      format: 'single-account',
      version: 1,
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

  // 打包导出当前浏览器所有本地账号存档 (.json)（仅管理员）
  function exportAllAccounts() {
    const u = getUser();
    const isDev = !!(u && u.isDevMaster);
    if (!isDev) {
      throw new Error('只有管理员可导出全量账号备份');
    }
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
      version: 1,
      exportedAt: new Date().toISOString(),
      count: accounts.length,
      accounts: accounts
    };
    triggerDownload('renying-all-accounts-backup.json', JSON.stringify(payload, null, 2));
    return payload;
  }

  // 导入账号数据（支持单个存档、全备份、老站导出文件）
  async function importAccountData(data) {
    if (!data || typeof data !== 'object') throw new Error('无效的存档文件数据');

    // 格式 1: 单账号导出格式
    if (data.format === 'single-account' && data.profile) {
      const isSigValid = await verifyProfileDigest(data);
      if (isSigValid === false) {
        throw new Error('⚠️ 存档校验和不匹配：该备份文件已被外部修改，已拒绝导入以保障账号安全');
      }
      const p = data.profile;
      // 若无签名（历史遗留老版本存档），对墨锭和胜场施加安全上限，防止注入巨量墨锭
      if (isSigValid === null) {
        p.ink = Math.min(Math.max(0, Math.floor(p.ink || 0)), 3000);
        p.netWins = Math.min(Math.max(0, Math.floor(p.netWins || 0)), 100);
      }
      const u = data.account || { uid: 'local_' + Date.now(), name: p.name || '大侠' };
      const name = p.name || u.name || '大侠';
      const uid = u.uid || ('local_' + Date.now());

      // 写入本地账号库
      let mockUsers = {};
      try { mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}'); } catch (e) {}
      mockUsers[name] = { uid, name, pw: btoa('123456'), created: Date.now() };
      localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
      localStorage.setItem('renying-local-current', JSON.stringify({ uid, name }));
      localStorage.setItem('renying-prof-' + uid, JSON.stringify(p));
      localStorage.setItem('renying-cloud-cache', JSON.stringify(p));

      currentUser = { uid, displayName: name };
      saveProfile(p, true);
      return { success: true, count: 1, profile: p, name };
    }

    // 格式 2: 全部账号备份格式
    if (data.format === 'all-accounts-backup' && Array.isArray(data.accounts)) {
      let mockUsers = {};
      try { mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}'); } catch (e) {}
      let lastProf = null, lastName = '';
      for (const item of data.accounts) {
        if (!item || !item.account) continue;
        const name = item.account.name;
        const uid = item.account.uid || ('local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
        mockUsers[name] = { ...item.account, uid, name };
        if (item.profile) {
          localStorage.setItem('renying-prof-' + uid, JSON.stringify(item.profile));
          lastProf = item.profile;
          lastName = name;
        }
      }
      localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
      if (lastProf && lastName) {
        const uid = mockUsers[lastName].uid;
        localStorage.setItem('renying-local-current', JSON.stringify({ uid, name: lastName }));
        localStorage.setItem('renying-cloud-cache', JSON.stringify(lastProf));
        currentUser = { uid, displayName: lastName };
        saveProfile(lastProf, true);
      }
      return { success: true, count: data.accounts.length, profile: lastProf, name: lastName };
    }

    // 格式 3: 裸 Profile 格式 (具有 ink 和 owned，无签名的裸 JSON 文件)
    if (Array.isArray(data.owned)) {
      const p = { ...data };
      // 无防伪签名的裸数据必须施加安全上限，防止直接伪造 99999 墨锭或全解锁英雄
      p.ink = Math.min(Math.max(0, Math.floor(p.ink || 0)), 1000);
      p.netWins = Math.min(Math.max(0, Math.floor(p.netWins || 0)), 50);
      const name = p.name || '大侠';
      const uid = 'local_' + Date.now();
      let mockUsers = {};
      try { mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}'); } catch (e) {}
      mockUsers[name] = { uid, name, pw: btoa('123456'), created: Date.now() };
      localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
      localStorage.setItem('renying-local-current', JSON.stringify({ uid, name }));
      localStorage.setItem('renying-prof-' + uid, JSON.stringify(p));
      localStorage.setItem('renying-cloud-cache', JSON.stringify(p));
      currentUser = { uid, displayName: name };
      saveProfile(p, true);
      return { success: true, count: 1, profile: p, name };
    }

    throw new Error('未识别的文件格式');
  }

  // 一键将当前 Dev 账号全量解锁写入 Google Cloud
  async function unlockAllOnCloud() {
    const devProf = makeDevProfile();
    const cloudData = toCloudData(devProf);
    const u = getUser();
    const uid = (currentUser && currentUser.uid) || (u && u.uid) || 'dev_master';

    // 缓存本地镜像
    try {
      localStorage.setItem('renying-prof-' + uid, JSON.stringify(devProf));
      localStorage.setItem('renying-cloud-cache', JSON.stringify(devProf));
      if (u) {
        localStorage.setItem('renying-local-current', JSON.stringify({ uid, name: u.name || 'Dev', isDevMaster: true }));
      }
    } catch (e) {}

    if (hasValidConfig() && fbDb && currentUser && currentUser.uid !== 'dev_master' && !currentUser.uid.startsWith('local_')) {
      await fbDb.collection('users').doc(currentUser.uid).set(cloudData, { merge: true });
      return { success: true, isCloud: true, data: devProf };
    }
    return { success: true, isCloud: false, data: devProf };
  }

  // 读写 Google Cloud Firestore 任意文档
  async function getCloudDocument(collectionName, docId) {
    if (!hasValidConfig() || !fbDb) throw new Error('未配置或未连通 Google Cloud Firestore');
    const col = collectionName || 'users';
    const id = docId || (currentUser && currentUser.uid);
    if (!id) throw new Error('缺少文档 ID');
    const snap = await fbDb.collection(col).doc(id).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  async function setCloudDocument(collectionName, docId, data) {
    if (!hasValidConfig() || !fbDb) throw new Error('未配置或未连通 Google Cloud Firestore');
    const col = collectionName || 'users';
    const id = docId || (currentUser && currentUser.uid);
    if (!id) throw new Error('缺少文档 ID');
    if (!data || typeof data !== 'object') throw new Error('数据必须是有效 JSON 对象');

    const sanitized = toCloudData(data);
    await fbDb.collection(col).doc(id).set(sanitized, { merge: true });

    // 同步到本地镜像
    try {
      localStorage.setItem('renying-cloud-cache', JSON.stringify(sanitized));
      localStorage.setItem('renying-prof-' + id, JSON.stringify(sanitized));
    } catch (e) {}

    return sanitized;
  }

  // 初始化
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
      unlockAllOnCloud,
      getCloudDocument,
      promoteLocalToCloud,
      isCloudAvailable: () => !!(hasValidConfig() && fbAuth && fbDb),
      getDb: () => fbDb,
      getAuth: () => fbAuth
    };

    // 页面加载完成后尝试初始化
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
