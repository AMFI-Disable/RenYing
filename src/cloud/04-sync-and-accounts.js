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

  // leaving 为真：网页正在关闭或切到后台，请求要带 keepalive，不然浏览器关页面时会把它掐掉
  async function doSync(leaving) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    syncHooks.forEach(fn => { try { fn(); } catch (e) { console.warn('before sync', e); } });
    const data = pendingData;
    if (!data || !cloudActive()) return;
    if (storedUid() !== getUser().uid) { fromOtherTab(); return; }   // 别的标签页刚换了号、这边还没收到通知：先跟上，不传
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
      progLoad(uid);
      const prog = PROG.seen !== null ? { deltas: PROG.un.slice(0, 60).map(x => ({ id: x.id, d: x.d })) } : undefined;
      const body = JSON.stringify({ profile: data, ledger, prog });
      const res = await api('/api/profile', {
        method: 'POST',
        body,
        // keepalive 的请求体最多 64KB，超过了浏览器会直接拒绝发送，所以只给小存档加
        ...(leaving === true && body.length < 60000 ? { keepalive: true } : {})
      });
      if (res && res.prog && getUser() && getUser().uid === uid) progAck(uid, res.prog);
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
      // 401 是登录过期：存档没问题，留着待上传的标记，重新登录后会补传
      if (code === 401) {
        setSync({ state: 'expired', err: '登录已过期，请重新登录，登录后会自动补传这次存档' });
        return;
      }
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

  function flush(leaving) {
    if (pendingData && cloudActive()) doSync(leaving === true);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => flush());
    window.addEventListener('offline', () => { if (pendingData) setSync({ state: 'offline' }); });
    window.addEventListener('pagehide', () => flush(true));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  }

  /* ---------- 11. 账号：注册、登录、退出、设备 ---------- */
  // 账号注册
  async function register(username, password, carryProf) {
    const name = String(username).trim();
    if (!name || name.length < 2) throw new Error('昵称至少需要 2 个字符');
    if (!password || password.length < 6) throw new Error('密码至少需要 6 个字符');
    if (RESERVED_NAME.test(name.replace(/\s+/g, ''))) throw new Error('这个昵称不能用，换一个吧');

    // 读取游客进度准备同步上云
    let initialProf = carryProf || null;   // 本机账号升级时带上它自己的存档；否则带游客进度
    try {
      const guestRaw = initialProf ? null : localStorage.getItem('renying-guest-profile');
      if (guestRaw) initialProf = JSON.parse(guestRaw);
    } catch (e) {}

    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          username: name,
          password: password,
          profile: initialProf ? toCloudData(initialProf) : null,
          rt: 1
        })
      });

      setSession(data);
      const userObj = {
        uid: data.uid,
        name: data.username,
        displayName: data.username,
        token: data.token,
        isCloud: true
      };
      currentUser = userObj;
      localStorage.setItem('renying-local-current', JSON.stringify(userObj));

      try {
        const mockUsers = localAccounts();
        mockUsers[data.username] = { uid: data.uid, name: data.username, pw: await pwHash(password), pwv: 2, isCloud: true, created: Date.now() };
        localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
      } catch (e) {}

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
      if (err && err.status >= 400 && err.status < 500 && err.status !== 404) throw err;   // 服务器回了话（昵称不能用、太频繁）：照实说，不偷偷建本机账号
      console.warn('Cloudflare Worker register failed, falling back to local account:', err);
      // 连不上服务器（断网、服务器出错）：先在这台设备上建本机账号，返回时带上说明，界面要照实告诉玩家
      const mockUsers = localAccounts();
      if (localKeyOf(mockUsers, name)) throw new Error('该昵称已在本机注册');
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
      return { ...userObj, note: hasValidConfig() ? '连不上云端服务器，账号先建在这台设备上：进度只存在这里，联网后可在账号页一键升级为云端账号' : '' };
    }
  }

  // 账号登录（支持已有本地账号无缝自动升级迁移至云端）
  async function login(username, password) {
    const name = String(username).trim();
    if (!name) throw new Error('请输入昵称');
    if (!password) throw new Error('请输入密码');

    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: name, password: password, rt: 1 })
      });

      setSession(data);
      const userObj = {
        uid: data.uid,
        name: data.username,
        displayName: data.username,
        token: data.token,
        isCloud: true
      };
      currentUser = userObj;
      localStorage.setItem('renying-local-current', JSON.stringify(userObj));

      try {
        const mockUsers = localAccounts();
        mockUsers[data.username] = { uid: data.uid, name: data.username, pw: await pwHash(password), pwv: 2, isCloud: true, lastLogin: Date.now() };
        localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
      } catch (e) {}

      if (data.profile) {
        adoptProfile(data.uid, data.profile, data.ledger);
        // 本机已有这个号的镜像就留着：里面可能有登录过期期间没传上去的进度，接下来 loadProfile 会和云端合并再补传
        if (!readMirror(data.uid)) try {
          localStorage.setItem(profKey(data.uid), JSON.stringify(data.profile));
        } catch (e) {}
      }

      setSync({ state: 'ok', at: Date.now(), err: '' });
      notifyAuthChange(currentUser);
      return userObj;
    } catch (err) {
      if (err && (err.need || err.deleted)) throw err;   // 要人机验证没过、云端号被删除了：照实说，不去登本机同名账号
      // 检查是否有本地历史账号
      const mockUsers = localAccounts();
      const localName = localKeyOf(mockUsers, name);
      const localU = localName ? mockUsers[localName] : null;
      const pwOk = await pwMatches(localU, password);
      if (localU && !pwOk && err && (err.isNetwork || /failed to fetch|network|load failed/i.test(err.message))) {
        throw new Error('密码不对');
      }
      if (!localU && err && (err.isNetwork || /failed to fetch|network|load failed/i.test(err.message))) {
        err.message = '无法连接到云端服务器，请检查网络连接；若需离线游玩请点击“注册”创建本机账号';
      }
      // 云端有这个昵称、密码却对不上（401）：本机同名账号是另一个号，登进去要说清楚，不然玩家以为在用云端那个
      const cloudHasName = err && err.status === 401;
      if (localU && pwOk) {
        if (localU.pwv !== 2) {   // 老记录：登录成功时顺手升级成散列
          localU.pw = await pwHash(password); localU.pwv = 2;
          mockUsers[localName] = localU;
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
              profile: localProf ? toCloudData(localProf) : null,
              rt: 1
            })
          });

          setSession(data);
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
          mockUsers[localName] = localU;
          localStorage.setItem('renying-local-accounts', JSON.stringify(mockUsers));
          localStorage.setItem('renying-local-current', JSON.stringify(userObj));
          setSync({ state: 'ok', at: Date.now(), err: '' });
          notifyAuthChange(currentUser);
          return userObj;
        } catch (regErr) {
          // 本地单机登录
          const userObj = { uid: localU.uid, name: localName, displayName: localName, isCloud: false };
          localStorage.setItem('renying-local-current', JSON.stringify(userObj));
          currentUser = userObj;
          notifyAuthChange(currentUser);
          const note = cloudHasName ? '已登录这台设备上的本机账号。云端也有一个叫这个名字的号，但密码不一样，两个号没有合并'
            : hasValidConfig() ? '连不上云端服务器，先登录这台设备上的本机账号，进度只存在这里' : '';
          return { ...userObj, note };
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

  // 登录过的设备（新式登录一个浏览器一台；以前的老式登录合成一条 legacy）
  async function devices() {
    if (!cloudActive()) { const e = new Error('当前是本地存档'); e.status = 0; throw e; }
    return api('/api/devices', { method: 'GET' });
  }
  // 退出一台设备：id 是设备编号、'legacy'（以前的老式登录）或 'all'（所有设备，连这台一起；之后要再调 logout 清本机）
  async function logoutDevice(id) {
    if (!cloudActive()) { const e = new Error('当前是本地存档'); e.status = 0; throw e; }
    return api('/api/devices', { method: 'POST', body: JSON.stringify(id === 'all' ? { all: true } : { id }) });
  }

  /* ---------- 12. 存档读写 ---------- */
  // 获取当前用户
  function getUser() {
    if (currentUser) {
      return {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.name || '大侠',
        isCloud: !!(currentUser.isCloud && currentUser.token),
        token: getToken() || currentUser.token
      };
    }
    try {
      const local = JSON.parse(localStorage.getItem('renying-local-current') || 'null');
      if (local && local.uid) {
        const token = getToken();
        const isCloud = !!(token && local.isCloud !== false);
        const { isDevMaster, ...rest } = local;
        currentUser = { ...rest, token, isCloud, displayName: local.name };
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
        // 游客存档是按云端字段白名单裁过的，里面没有 guest 这一项：读回来时补上。
        // 不补的话重载之后 applyProfile 会把它当成正式账号的存档，把游客标记（任务、补偿的门）一并清掉。
        const p = guest ? JSON.parse(guest) : null;
        if (p && typeof p === 'object') return { ...p, guest: true };
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
          // 胜负、碎片按账本算：服务器的数 + 本机还没报上去的增量（新版服务器才有 res.prog）
          const pv = progAdopt(u.uid, res.prog, local);
          if (pv) progPut(merged, pv);

          let hasDirty = false;
          try { hasDirty = !!localStorage.getItem(dirtyKey()); } catch (e) {}

          if (res.ledger) {
            // 对齐墨锭账本：仅在存在未同步的本机脏标记时补记差额，避免服务器封顶或跨设备消费后每次启动重复上传 (O2)
            ledgerLoad(u.uid);
            if (LEDGER.s === null) {
              LEDGER.s = res.ledger.ink; LEDGER.v = -1;
              if (hasDirty && local && Number.isFinite(+local.ink) && local.ink > res.ledger.ink) ledgerNote(u.uid, local.ink);
            } else if (hasDirty && LEDGER.un.length === 0 && local && Number.isFinite(+local.ink)) {
              ledgerNote(u.uid, local.ink);
            }
            adoptProfile(u.uid, merged, res.ledger);
          }

          // 合并后和云端那份不一样（本机多了角色、皮肤、关卡星、列传、碎片……），或者还有没报上去的墨锭，就补传
          const localChanged = (!!local && progressKey(merged) !== progressKey(cloudData)) ||
            (res.ledger ? LEDGER.un.length > 0 : (hasDirty && (merged.ink || 0) > (cloudData.ink || 0)));

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
    progNote(u.uid, dataToSave);          // 胜负、碎片的变化也记成一条
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
    if (sync.state === 'error' || sync.state === 'blocked' || sync.state === 'expired') throw new Error(sync.err || '云端拒绝了这次存档');
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
    const pv = progAdopt(uid, res.prog, local);
    if (pv) progPut(merged, pv);

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

  /* ---------- 13. 导出、导入、签名 ---------- */
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
    if (Array.isArray(data.owned) && !data.profile) data = { format: 'single-account', profile: data };   // 裸存档（只有 profile 本身）：按没签名的单账号文件处理
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
      // 导入会切换到这个账号（本机账号），界面要说清楚：name 是切过去的账号，note 是旧版备份的提醒
      return { uid, name, profile: p, note: weakNote };
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

    // 本机存档跟着注册一起交上去（墨锭服务器最多认 REG_INK_CAP），别等注册完再存：那时墨锭已经以服务器为准，本机的就丢了
    const res = await register(name, password, localProf && Object.keys(localProf).length ? localProf : null);
    return { success: true, uid: res.uid, name: res.name, isCloud: true };
  }

  /* ---------- 14. 启动与挂到全局 ---------- */
  function init() {
    migrateLegacyCache();
    dropDevSession();
    getUser();
    loadFlags();
    scheduleRefresh();
    upgradeLegacy();
  }
  // 以前的 Dev 有特殊处理：登录时塞满全角色、全皮肤、一百万墨锭，离线时还会降成本机的 dev_master 号，兑换码也能把任何号变成它。
  // 现在 Dev 和别人一样：本机的 dev_master 登录状态退出（它的本机存档留着不删），云端 Dev 去掉旧的标记、照常登录
  function dropDevSession() {
    try {
      const cur = JSON.parse(localStorage.getItem('renying-local-current') || 'null');
      if (!cur || typeof cur !== 'object') return;
      if (cur.uid === 'dev_master' || (cur.isDevMaster && !cur.isCloud)) { localStorage.removeItem('renying-local-current'); return; }
      if ('isDevMaster' in cur) { delete cur.isDevMaster; localStorage.setItem('renying-local-current', JSON.stringify(cur)); }
    } catch (e) {}
    try { sessionStorage.removeItem('renying-dev-unlock'); } catch (e) {}
  }

  dropDevSession();   // 网页一载入就做（init 不一定有人调），要赶在第一次 getUser() 之前

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
      onOtherTab,
      onAuthError,
      devices,
      logoutDevice,
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
      leaderboard,
      tournaments,
      publishTournament,
      onProgress,
      loadFlags,
      flag,
      computeProfileDigest,
      verifyProfileDigest,
      toCloudData,
      mergeProfiles,
      promoteLocalToCloud,
      isCloudAvailable: () => true,
      getEndpoint,
      setEndpoint,
      // 全服肉鸽进分线时带上的登录令牌（服务器用它认云端账号发奖励）；游客、本机账号是空的
      worldToken: () => { const u = getUser(); return u && u.isCloud ? (getToken() || '') : ''; },
      econ,
      market,
      gboss,
      chron,
      saga,
      sagaMark,
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
