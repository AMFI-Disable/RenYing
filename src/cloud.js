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

  // 账号注册
  async function register(username, password) {
    const name = String(username).trim();
    if (!name || name.length < 2) throw new Error('昵称至少需要 2 个字符');
    if (!password || password.length < 6) throw new Error('密码至少需要 6 个字符');

    if (hasValidConfig() && fbAuth && fbDb) {
      const email = toEmail(name);
      const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
      currentUser = cred.user;
      if (currentUser.updateProfile) {
        try { await currentUser.updateProfile({ displayName: name }); } catch (e) {}
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
    return { uid, name, isCloud: false };
  }

  // 账号登录
  async function login(username, password) {
    const name = String(username).trim();
    if (!name) throw new Error('请输入昵称或邮箱');
    if (!password) throw new Error('请输入密码');

    if (hasValidConfig() && fbAuth) {
      const email = toEmail(name);
      const cred = await fbAuth.signInWithEmailAndPassword(email, password);
      currentUser = cred.user;
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
      return {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || '大侠',
        isCloud: hasValidConfig() && !!fbDb
      };
    }
    try {
      const local = JSON.parse(localStorage.getItem('renying-local-current') || 'null');
      if (local && local.uid) {
        currentUser = { uid: local.uid, displayName: local.name };
        return { ...local, isCloud: false };
      }
    } catch (e) {}
    return null;
  }

  // 加载云端档案
  async function loadProfile() {
    const u = getUser();
    if (!u) return null;

    if (hasValidConfig() && fbDb && currentUser && !currentUser.uid.startsWith('local_')) {
      try {
        const snap = await fbDb.collection('users').doc(currentUser.uid).get();
        if (snap.exists) {
          const data = snap.data();
          // 本地缓存备份
          try { localStorage.setItem('renying-cloud-cache', JSON.stringify(data)); } catch (e) {}
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
    if (!u) return;

    const dataToSave = {
      name: u.name || prof.name || '大侠',
      ink: Math.max(0, Math.floor(prof.ink || 0)),
      owned: Array.isArray(prof.owned) ? Array.from(new Set(prof.owned)) : ['qingfeng'],
      frags: prof.frags || {},
      pity: Math.max(0, Math.floor(prof.pity || 0)),
      spity: Math.max(0, Math.floor(prof.spity || 0)),
      skins: Array.isArray(prof.skins) ? prof.skins : [],
      equip: prof.equip || {},
      netWins: Math.max(0, Math.floor(prof.netWins || 0)),
      netLosses: Math.max(0, Math.floor(prof.netLosses || 0)),
      online10Unlocked: !!prof.online10Unlocked,
      stageStars: prof.stageStars || {},
      qfx: Math.max(0, Math.floor(prof.qfx || 0)),
      updatedAt: Date.now()
    };

    // 立即写入本地镜像
    try {
      localStorage.setItem('renying-cloud-cache', JSON.stringify(dataToSave));
      localStorage.setItem('renying-prof-' + u.uid, JSON.stringify(dataToSave));
    } catch (e) {}

    if (!hasValidConfig() || !fbDb || !currentUser || currentUser.uid.startsWith('local_')) {
      return;
    }

    const doSync = async () => {
      try {
        await fbDb.collection('users').doc(currentUser.uid).set(dataToSave, { merge: true });
      } catch (err) {
        console.warn('Sync profile to Firestore failed:', err);
      }
    };

    if (immediate) {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      doSync();
    } else {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(doSync, 1500);
    }
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

  // 导出当前账号存档 (.json)
  function exportCurrentAccount(prof) {
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
    const payload = {
      app: 'renying',
      format: 'single-account',
      version: 1,
      exportedAt: new Date().toISOString(),
      account: {
        uid: (u && u.uid) || ('local_' + Date.now()),
        name: name
      },
      profile: {
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
      }
    };
    const safeName = String(name).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') || 'player';
    triggerDownload(`renying-account-${safeName}.json`, JSON.stringify(payload, null, 2));
    return payload;
  }

  // 打包导出当前浏览器所有本地账号存档 (.json)
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
      version: 1,
      exportedAt: new Date().toISOString(),
      count: accounts.length,
      accounts: accounts
    };
    triggerDownload('renying-all-accounts-backup.json', JSON.stringify(payload, null, 2));
    return payload;
  }

  // 导入账号数据（支持单个存档、全备份、老站导出文件）
  function importAccountData(data) {
    if (!data || typeof data !== 'object') throw new Error('无效的存档文件数据');

    // 格式 1: 单账号导出格式
    if (data.format === 'single-account' && data.profile) {
      const p = data.profile;
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

    // 格式 3: 裸 Profile 格式 (具有 ink 和 owned)
    if (Array.isArray(data.owned)) {
      const name = data.name || '大侠';
      const uid = 'local_' + Date.now();
      let mockUsers = {};
      try { mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}'); } catch (e) {}
      mockUsers[name] = { uid, name, pw: btoa('123456'), created: Date.now() };
      localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
      localStorage.setItem('renying-local-current', JSON.stringify({ uid, name }));
      localStorage.setItem('renying-prof-' + uid, JSON.stringify(data));
      localStorage.setItem('renying-cloud-cache', JSON.stringify(data));
      currentUser = { uid, displayName: name };
      saveProfile(data, true);
      return { success: true, count: 1, profile: data, name };
    }

    throw new Error('未识别的文件格式');
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
      onAuthChange,
      exportCurrentAccount,
      exportAllAccounts,
      importAccountData
    };

    // 页面加载完成后尝试初始化
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
