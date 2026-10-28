// ======================= 联机界面 =======================
function $id(id) { return document.getElementById(id); }

// ======================= 账号和排行榜 =======================
// ACC.token 只是当前账号的 uid（登录凭证只由 CloudSave 保管）。以前的联机房间服务器会往 renying-token 里写一份凭证，
// 现在没人读它了，开网页时顺手删掉，别让一份 30 天有效的凭证一直躺在本机
const ACC = { token: '', name: '', wins: 0, losses: 0 };
try { localStorage.removeItem('renying-token'); } catch (e) {}
function setAcc(j) {
  if (j && j.name) Object.assign(ACC, { name: j.name, wins: j.wins, losses: j.losses, cwins: j.cwins || 0, closses: j.closses || 0 });
  else { ACC.token = ''; ACC.name = ''; }
  const nk = (ACC.token || '') + '|' + ACC.name;
  if (nk !== setAcc.last) { setAcc.last = nk; adaptLoad(); }
  renderAcc();
}
function renderEvtCard() {
  const on = freeSkinEvent() && !OFFLINE_BUILD;
  $id('homeEvt').hidden = !on;
  if (on) $id('homeEvtLeft').textContent = `剩 ${freeSkinDaysLeft()} 天`;
}
$id('homeEvt').addEventListener('click', () => { initAudio(); openScreen('tasks'); });
function renderAcc() {
  renderTopNav(); renderEvtCard();
  const bar = $id('accBar');
  if (OFFLINE_BUILD) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const u = (window.CloudSave && CloudSave.getUser()) || (ACC.name ? ACC : null);
  const isCloud = window.CloudSave && CloudSave.hasValidConfig();
  const cloudBadge = isCloud
    ? '<span class="rk" style="background:rgba(70,211,234,.18);color:#46d3ea">云端已连</span>'
    : '<span class="rk" style="background:rgba(233,196,106,.15);color:#e9c46a">本地存档</span>';
  bar.innerHTML = u && u.name
    ? `<span class="who">${escapeHTML(u.name)}</span>${cloudBadge}<span class="ink">墨锭 ${PROF.ink || 0}</span><button class="ghost" id="accOpen">账号与云存档</button><button class="ghost" id="logoutBtn">退出</button>`
    : `<button class="ghost" id="accOpen">登录 / 注册</button>`;

  // 管理后台入口和全量备份只在云端的 Dev 号上显示（只是两个按钮，后台本身要管理口令；Dev 的存档、武库和别人一样）
  const actionBtns = $id('accActionBtns');
  if (actionBtns) {
    const isDev = isDevName(u);
    const devAdminBtn = $id('devAdminBtn');
    if (devAdminBtn) devAdminBtn.classList.toggle('hidden', !isDev);
    let expAll = $id('exportAllBtn');
    if (isDev) {
      if (!expAll) {
        expAll = document.createElement('button');
        expAll.id = 'exportAllBtn';
        expAll.className = 'ghost small';
        expAll.style.cssText = 'font-size:12px;padding:3px 10px;color:var(--gold)';
        expAll.title = '将本机所有账号与数据打包备份';
        expAll.textContent = '📦 备份所有账号';
        expAll.addEventListener('click', () => {
          if (window.CloudSave) {
            try {
              CloudSave.exportAllAccounts();
              toast('已成功打包备份本机所有账号');
            } catch (err) {
              uiConfirm(err.message, { alert: true });
            }
          }
        });
        actionBtns.appendChild(expAll);
      }
    } else {
      if (expAll) expAll.remove();
    }
  }
}
function isDevName(u) { return !!(u && u.isCloud && String(u.name || '').toLowerCase() === 'dev'); }   // 云端的 Dev 这个名字只能在管理后台建
function escapeHTML(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

if ($id('exportAccBtn')) {
  $id('exportAccBtn').addEventListener('click', () => {
    if (window.CloudSave) {
      CloudSave.exportCurrentAccount(PROF);
      toast('已成功导出当前账号存档');
    }
  });
}

function openAcc() {
  $id('accMsg').textContent = '';
  const u = window.CloudSave && CloudSave.getUser();
  if (u && u.name) $id('accName').value = u.name;
  const cfg = window.CloudSave && CloudSave.getConfig();
  if ($id('fbCfgIn') && cfg && cfg.projectId) $id('fbCfgIn').value = JSON.stringify(cfg, null, 2);
  menuCam.tz = 1.35;
  showScreen('acc');
  renderAccPage();
  if (!$id('accIn').classList.contains('hidden')) setTimeout(() => $id('accName').focus(), 50);
}
// 退出账号：先把存档传上云，再清掉本机记着的这个账号的东西，最后刷新网页，内存里的进度（关卡星、爬塔、皮肤装配……）
// 也一起清空，免得下一个登录的账号接着用上一个人的数据。
// 留下的只有本机设置（画面、语言、按键、新手引导、云端地址、设备号）、驿站的好友和聊天（按名字分开存，不会串）、
// 以及纯本地账号（没上云，数据只在这台机器上）的存档。云存档没传上去时也保留这个账号的本地副本，下次登录还能合并回去。
const LOGOUT_KEEP = ['renying-settings', 'renying-lang', 'renying-lang-chosen', 'renying-tut-seen', 'renying-tut-done', 'renying-1p-keys',
  'renying-custom-ice', 'renying-cloud-endpoint', 'renying-ac-device', 'renying-guest-name', 'renying-local-accounts'];
function clearLocalAccountData(user, synced) {
  let localNames = [], localUids = [];
  try { const la = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}'); localNames = Object.keys(la); localUids = Object.values(la).map(x => x && x.uid).filter(Boolean); } catch (e) {}
  const keepUnsynced = user && user.uid && !synced ? ['renying-prof-' + user.uid, 'renying-ledger-' + user.uid, 'renying-prog-' + user.uid, 'renying-sync-dirty-' + user.uid] : [];
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  for (const k of keys) {
    if (!k || !k.startsWith('renying-')) continue;
    if (LOGOUT_KEEP.includes(k) || k.startsWith('renying-social-') || keepUnsynced.includes(k)) continue;
    if (localUids.some(id => k.endsWith('-' + id)) || localNames.some(n => k.endsWith('-' + n))) continue;   // 本地账号的存档只有这一份
    try { localStorage.removeItem(k); } catch (e) {}
  }
}
// 同一个号在别的设备上新增的胜负、碎片：上传时服务器把总数带回来，这里加到当前存档上（不是覆盖：本机刚打的还在）
if (window.CloudSave && CloudSave.onProgress) CloudSave.onProgress(d => {
  for (const [k, x] of Object.entries(d)) {
    if (k === 'netWins' || k === 'netLosses') PROF[k] = Math.max(0, (PROF[k] || 0) + x);
    else if (k.startsWith('frags.')) { const h = k.slice(6); PROF.frags = PROF.frags || {}; PROF.frags[h] = Math.max(0, (PROF.frags[h] || 0) + x); if (!PROF.frags[h]) delete PROF.frags[h]; }
  }
  if ($id('acc').classList.contains('on')) renderAccPage();
});
let loggingOut = false;
// 同一个浏览器的别的标签页退出、换了号：这边的账号已经跟着换了，界面和存档要刷新网页才对得上。
// 正在对战、在武库里就等回到菜单再刷新，不打断
if (window.CloudSave && CloudSave.onOtherTab) CloudSave.onOtherTab(m => {
  if (loggingOut) return;
  toast(m.type === 'logout' ? '这个账号在别的标签页退出了，马上刷新' : '别的标签页换了账号，马上刷新');
  const go = () => { if (document.visibilityState === 'hidden' || MENU_SCREENS.includes(currentScreen) || ['langPrompt', 'codex', 'community', 'replays', 'tasks'].includes(currentScreen)) location.reload(); else setTimeout(go, 2000); };
  setTimeout(go, 1500);
});
// 服务器说登录失效（换令牌也不行）、被封、没有权限：每种只提示一次，详细的在账号页
const authErrSeen = new Set();
if (window.CloudSave && CloudSave.onAuthChange) CloudSave.onAuthChange(() => authErrSeen.clear());   // 重新登录以后再失效还要提示
if (window.CloudSave && CloudSave.onAuthError) CloudSave.onAuthError(e => {
  if (loggingOut) return;
  if (e.kind === 'banned' && typeof acRefresh === 'function') acRefresh();
  if (authErrSeen.has(e.kind)) return;
  authErrSeen.add(e.kind);
  toast(e.kind === 'expired' ? '登录已过期，请重新登录（进度先存在这台设备上，登录后补传）' : e.kind === 'banned' ? (e.error || '这个账号暂时被限制了') : (e.error || '没有权限做这件事'));
  renderTopNav();
  if ($id('acc').classList.contains('on')) renderAccSync();
});
async function doLogout() {
  loggingOut = true;
  const user = window.CloudSave ? CloudSave.getUser() : null;
  let synced = !(user && user.isCloud);
  if (window.CloudSave) {
    if (user && user.isCloud) {
      try { await CloudSave.syncNow(); const ss = CloudSave.getSyncState(); synced = !!(ss && ss.state === 'ok' && !ss.pending); } catch (e) { synced = false; }
    }
    await CloudSave.logout();
  }
  clearLocalAccountData(user, synced);
  try { sessionStorage.setItem('renying-logout-note', synced ? 'ok' : 'unsynced'); } catch (e) {}
  location.reload();
}
try {   // 刷新之后补上退出的提示
  const note = sessionStorage.getItem('renying-logout-note');
  if (note) { sessionStorage.removeItem('renying-logout-note'); setTimeout(() => toast(note === 'ok' ? '已退出账号，本机数据已清空' : '已退出账号。云存档这次没传上去，本机先留着这个账号的存档，下次登录会合并'), 800); }
} catch (e) {}
$id('accBar').addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'accOpen') openAcc();
  else if (id === 'lbBtn') openLeaderboard();
  else if (id === 'logoutBtn') doLogout();
});
// ---------- 账号页：登录后是个人名片 + 云存档状态 ----------
function agoText(t) {
  if (!t) return '还没有上传过';
  const d = Date.now() - t;
  if (d < 60000) return '刚刚';
  if (d < 3600000) return `${Math.floor(d / 60000)} 分钟前`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} 小时前`;
  return new Date(t).toLocaleString();
}
function curName() { const u = window.CloudSave && CloudSave.getUser(); return (u && u.name) || ACC.name || ''; }
function renderAccPage() {
  if (!$id('accDash')) return;
  const u = window.CloudSave && CloudSave.getUser(), name = curName();
  $id('accDash').classList.toggle('hidden', !name);
  $id('accIn').classList.toggle('hidden', !!name);
  $id('accFootNote').classList.toggle('hidden', !!name);
  if (!name) return;
  const s = rkState(), placed = rkPlaced(s), t = placed ? rkTier(s.pts) : null;
  $id('adAvatar').textContent = name.slice(0, 1);
  $id('adAvatar').style.setProperty('--tier', placed ? RK_TIERS[t.li].c1 : '#8a94a3');
  $id('adName').textContent = name;
  $id('adKind').textContent = isDevName(u) ? '开发者账号 · 云端同步' : u && u.isCloud ? '云端账号' : '本机账号';
  $id('adRank').textContent = placed ? `${t.label} · ${t.name} · ${t.pts.toLocaleString()} 分` : `定级赛 ${s.placed}/${RK.PLACE} · 估分 ～${Math.round(s.est).toLocaleString()}`;
  $id('adMedal').innerHTML = rkMedalFor(s, 96);
  const w = PROF.netWins || 0, l = PROF.netLosses || 0;
  const stats = [
    ['墨锭', (PROF.ink || 0).toLocaleString()],
    ['角色', `${CHARS.filter(c => ownsHero(c.id)).length} / ${CHARS.length}`],
    ['皮肤', String((PROF.skins || []).length)],
    ['联机战绩', `${w} 胜 ${l} 负`, w + l ? `胜率 ${Math.round(w / (w + l) * 100)}%` : ''],
    ['本赛季排位', `${s.w} 胜 ${s.l} 负`, rkSeason().pre ? '季前赛' : SEASON.name],
    ['赛季最高', s.peak ? rkTier(s.peak).label : '—', s.peak ? s.peak.toLocaleString() + ' 分' : ''],
  ];
  $id('adStats').innerHTML = stats.map(([k, v, sub]) => `<div class="ad-stat"><span>${k}</span><b>${escapeHTML(v)}</b>${sub ? `<small>${escapeHTML(sub)}</small>` : ''}</div>`).join('');
  renderAccSync();
  renderAccDevices();
}
// 登录的设备：云端账号才有；老服务器没有这个接口就整块不显示
async function renderAccDevices() {
  const box = $id('adDev'), u = window.CloudSave && CloudSave.getUser();
  if (!box) return;
  if (!(u && u.isCloud && CloudSave.devices)) { box.classList.add('hidden'); return; }
  let r;
  try { r = await CloudSave.devices(); } catch (e) { box.classList.add('hidden'); return; }
  const rows = (r.devices || []).slice().sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0)).map(d => `<div class="ad-dev-row"><b>${escapeHTML(d.label || '未知设备')}</b><span>${d.current ? '<i class="ad-dev-me">这台设备</i> · ' : ''}最近在用：${agoText(d.last_seen)}</span><button class="mm-cancel" type="button" data-dev="${escapeHTML(d.id)}" data-me="${d.current ? 1 : ''}">退出</button></div>`);
  if (r.legacy) rows.push(`<div class="ad-dev-row"><b>以前的登录</b><span>更新前登录的 ${r.legacy} 处，分不出是哪台设备</span><button class="mm-cancel" type="button" data-dev="legacy">退出</button></div>`);
  $id('adDevList').innerHTML = rows.join('') || '<div class="ad-dev-row"><span>只有这台设备</span></div>';
  box.classList.remove('hidden');
}
$id('adDevList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-dev]');
  if (!b) return;
  if (b.dataset.me) { doLogout(); return; }   // 退出这台：和点“退出登录”一样
  b.disabled = true;
  try { await CloudSave.logoutDevice(b.dataset.dev); toast('那台设备已退出登录'); } catch (err) { toast(err.message); }
  renderAccDevices();
});
$id('adDevAll').addEventListener('click', async () => {
  if (!await uiConfirm('所有登录过这个账号的设备都退出（包括这台）？\n别的设备上要重新登录才能用。', { ok: '全部退出', danger: true })) return;
  try { await CloudSave.logoutDevice('all'); } catch (err) { toast(err.message); return; }
  doLogout();
});
function renderAccSync() {
  if (!$id('adSyncT')) return;
  const st = window.CloudSave && CloudSave.getSyncState ? CloudSave.getSyncState() : { state: 'local' };
  const hasCloudCfg = window.CloudSave && CloudSave.hasValidConfig && CloudSave.hasValidConfig();
  const u = window.CloudSave && CloudSave.getUser();
  const isLocalUser = u && !u.isCloud;
  const localNote = !hasCloudCfg
    ? '当前未连接云端，进度保存在本机。如需跨设备同步，请点击下方【云端服务设置】或【导出当前存档】。'
    : '云端已连接，但当前为本机账号。点击【一键升级为云端账号】即可将进度上传到云端！';
  const M_ = {
    local: [hasCloudCfg ? '本机账号' : '本机存档', localNote],
    idle: ['已连接云端', '有新进度会自动上传'],
    ok: ['已同步', `上次上传：${agoText(st.at)}`],
    pending: ['等待上传', '有新进度，马上自动上传'],
    syncing: ['上传中…', ''],
    offline: ['断网中', '联网后自动补传，进度不会丢'],
    error: ['上传失败', st.err || ''],
    blocked: ['云端拒绝了存档', st.err || ''],
    expired: ['登录已过期', st.err || '请重新登录，登录后会自动补传'],
  }[st.state] || ['本机存档', ''];
  $id('adSyncDot').className = 'ad-dot s-' + st.state;
  $id('adSyncT').textContent = M_[0];
  $id('adSyncS').textContent = M_[1];
  $id('adSyncNow').classList.toggle('hidden', !st.cloud);
  $id('adPull').classList.toggle('hidden', !st.cloud);
  if ($id('adPromoteBtn')) $id('adPromoteBtn').classList.toggle('hidden', !(hasCloudCfg && isLocalUser));
  $id('adSyncNow').disabled = st.state === 'syncing';
}
$id('adSyncNow').addEventListener('click', async () => {
  $id('adMsg').textContent = '正在上传…';
  try { await CloudSave.syncNow(); $id('adMsg').textContent = '已上传到云端'; } catch (e) { $id('adMsg').textContent = e.message; }
});
if ($id('adPromoteBtn')) {
  $id('adPromoteBtn').addEventListener('click', async () => {
    let mockUsers = {};
    try { mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}'); } catch (e) {}
    const u = window.CloudSave && CloudSave.getUser();
    let pw = '';
    if (u && mockUsers[u.name] && mockUsers[u.name].pw) {
      try { pw = atob(mockUsers[u.name].pw); } catch (e) {}
    }
    if (!pw) {
      pw = await uiConfirm('请输入当前本地账号密码以同步升级至云端：', { input: { type: 'password', autocomplete: 'current-password' }, ok: '升级' }) || '';
    }
    if (!pw) return;
    $id('adMsg').textContent = '正在升级同步至云端…';
    try {
      const res = await CloudSave.promoteLocalToCloud(pw);
      ACC.token = res.uid;
      const loaded = await CloudSave.loadProfile();   // 换成服务器认的那份（墨锭以服务器为准）
      if (loaded) applyProfile(loaded);
      renderAccPage();
      $id('adMsg').textContent = '✅ 已成功升级为云端账号并同步！';
      toast('已成功升级为云端账号！');
    } catch (e) {
      $id('adMsg').textContent = '升级失败：' + e.message;
    }
  });
}
$id('adPull').addEventListener('click', async () => {
  if (!await uiConfirm('将云端与本地存档进行双向合并同步？\n（融合两端拥有的全部角色、皮肤、最高墨锭与战绩，绝不会丢失任何进度）', { ok: '合并同步' })) return;
  $id('adMsg').textContent = '正在双向合并同步…';
  try {
    const d = await CloudSave.pullNow();
    applyProfile(d);
    RKS = null;
    renderAccPage();
    $id('adMsg').textContent = '✅ 云端与本地已智能融合同步完成';
    toast('云端存档双向合并同步成功！');
  } catch (e) {
    $id('adMsg').textContent = e.message;
  }
});
$id('adLogout').addEventListener('click', () => doLogout());
if (window.CloudSave && CloudSave.onSyncChange) CloudSave.onSyncChange(() => { renderTopNav(); if ($id('acc').classList.contains('on')) renderAccSync(); });
setInterval(() => { if ($id('acc').classList.contains('on')) renderAccSync(); }, 20000);
async function doAcc(kind) {
  const name = $id('accName').value.trim(), pass = $id('accPass').value;
  if (!name || !pass) { $id('accMsg').textContent = '昵称与密码都得填'; return; }
  $id('accMsg').textContent = kind === 'login' ? '登录中…' : '注册中…';
  try {
    if (window.CloudSave) {
      const res = await (kind === 'login' ? CloudSave.login(name, pass) : CloudSave.register(name, pass));
      ACC.name = res.name;
      ACC.token = res.uid;
      PROF.guest = false;
      setAcc.last = ACC.token + '|' + ACC.name; adaptLoad();   // 电脑的自适应难度按账号存：换了号要读这个号自己的，不能把上一个人的带过来
      const loaded = await CloudSave.loadProfile();
      if (loaded) {
        applyProfile(loaded);
      } else {
        CloudSave.saveProfile(PROF, true);
      }
      renderAcc();
      $id('accPass').value = '';
      backToMenu();
      // 连不上云端时建的、登的是本机账号：照实说，别让玩家以为进度在云端
      if (res.note) toast(res.note, 6);
      else toast(kind === 'login' ? `欢迎归来，${res.name}！已载入存档` : `注册成功！大侠 ${res.name}，已开启专属存档`);
      return;
    }
    $id('accPass').value = '';
    backToMenu();
  } catch (err) {
    $id('accMsg').textContent = err.message;
  }
}
$id('loginBtn').addEventListener('click', () => doAcc('login'));
$id('regBtn').addEventListener('click', () => doAcc('register'));
$id('accPass').addEventListener('keydown', e => { if (e.key === 'Enter') doAcc('login'); });
$id('accBack').addEventListener('click', backToMenu);

// 管理后台在 Worker 的 /admin（查账号、调墨锭、发补偿、改经济数值），打开后输入管理口令
if ($id('devAdminBtn')) {
  $id('devAdminBtn').addEventListener('click', () => {
    const base = window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '';
    if (!base) { toast('还没有配置云端接口'); return; }
    window.open(base + '/admin', '_blank', 'noopener');
  });
}

if ($id('toggleCloudCfgBtn')) {
  $id('toggleCloudCfgBtn').addEventListener('click', () => {
    $id('cloudCfgBox').classList.toggle('hidden');
    if (!$id('cloudCfgBox').classList.contains('hidden') && $id('fbCfgIn')) {
      $id('fbCfgIn').value = (window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '');
    }
  });
}
if ($id('fbCfgSaveBtn')) {
  $id('fbCfgSaveBtn').addEventListener('click', () => {
    try {
      const val = $id('fbCfgIn').value.trim();
      let endpoint = val;
      if (val.startsWith('{')) {
        const parsed = JSON.parse(val);
        endpoint = parsed.endpoint || parsed.url || '';
      }
      if (window.CloudSave) {
        CloudSave.setConfig(endpoint);
      }
      toast('云端服务接口已更新！');
      $id('cloudCfgBox').classList.add('hidden');
      renderAcc();
    } catch (e) {
      uiConfirm('配置格式错误：' + e.message, { alert: true });
    }
  });
}
if ($id('fbCfgClearBtn')) {
  $id('fbCfgClearBtn').addEventListener('click', () => {
    if (window.CloudSave) CloudSave.setConfig(null);
    if ($id('fbCfgIn')) $id('fbCfgIn').value = '';
    toast('已恢复默认云端接口 (renying.evengao6688.workers.dev)');
    $id('cloudCfgBox').classList.add('hidden');
    renderAcc();
  });
}

// ======================= 老站数据继承与导入 =======================
const LEGACY_USERS = [{"id": 1, "name": "Luffy", "wins": 8, "losses": 8, "rating": 1035, "placed": 11, "ink": 1358, "owned": ["qingfeng", "yanling", "leiming", "tieshan"], "frags": {"yuehua": 12, "liuyun": 13, "lingshuang": 12, "moyu": 13, "feiying": 13}, "pity": 1, "spity": 1, "skins": ["ly_dusk", "yl_phoenix", "lm_violet", "qf_gold", "ts_obsidian", "ts_bronze"], "equip": {"yanling": "yl_phoenix", "qingfeng": "qf_gold"}}, {"id": 2, "name": "设计失败的草履虫", "wins": 11, "losses": 11, "rating": 1152, "placed": 17, "ink": 478, "owned": ["qingfeng", "leiming", "tieshan", "liuyun", "lingshuang"], "frags": {"yuehua": 15, "feiying": 22, "yanling": 15, "moyu": 15}, "pity": 1, "spity": 5, "skins": ["qf_gold", "lm_sun"], "equip": {"qingfeng": "qf_gold", "leiming": "lm_sun"}}, {"id": 3, "name": "tct33x7", "wins": 1, "losses": 1, "rating": 1103, "placed": 2, "ink": 650, "owned": ["qingfeng", "lingshuang", "leiming", "liuyun"], "frags": {"moyu": 4, "tieshan": 10, "yanling": 1}, "pity": 9, "spity": 0, "skins": [], "equip": {}}, {"id": 4, "name": "明媚的地球", "wins": 9, "losses": 4, "rating": 1093, "placed": 8, "ink": 44, "owned": ["qingfeng", "lingshuang", "liuyun", "feiying", "yuehua", "leiming", "tieshan", "yanling", "moyu"], "frags": {}, "pity": 0, "spity": 0, "skins": ["lm_violet", "ly_dusk", "yh_sakura", "lm_sun", "ly_sky", "fy_jade", "ts_obsidian", "ts_bronze", "my_cinnabar", "ls_plum"], "equip": {"leiming": "lm_sun", "tieshan": "ts_obsidian", "moyu": "my_cinnabar", "feiying": "fy_jade", "liuyun": "ly_sky"}}, {"id": 5, "name": "张涵", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 92, "owned": ["qingfeng", "lingshuang", "feiying", "yanling", "leiming", "tieshan"], "frags": {"liuyun": 24, "yuehua": 12, "moyu": 10}, "pity": 9, "spity": 1, "skins": ["ls_plum", "yl_phoenix", "qf_frost", "lm_sun", "fy_jade"], "equip": {"qingfeng": "qf_frost", "lingshuang": "ls_plum", "yanling": "yl_phoenix"}}, {"id": 6, "name": "Luffy_iMac", "wins": 1, "losses": 2, "rating": 1135, "placed": 1, "ink": 790, "owned": ["qingfeng", "lingshuang"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 7, "name": "cxt", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 50, "owned": ["qingfeng"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 8, "name": "cxy", "wins": 2, "losses": 1, "rating": 1134, "placed": 1, "ink": 300, "owned": ["qingfeng", "liuyun"], "frags": {"tieshan": 13, "lingshuang": 6, "leiming": 9, "yanling": 13, "yuehua": 7, "feiying": 9, "moyu": 6}, "pity": 0, "spity": 8, "skins": ["ly_dusk", "ly_sky", "qf_gold"], "equip": {"liuyun": "ly_sky", "qingfeng": "qf_gold"}}, {"id": 9, "name": "MoYu", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 690, "owned": ["qingfeng", "moyu"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 10, "name": "越来越挤的大巴", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 210, "owned": ["qingfeng", "moyu", "feiying"], "frags": {"leiming": 2, "liuyun": 7, "tieshan": 2, "lingshuang": 1}, "pity": 1, "spity": 0, "skins": [], "equip": {}}, {"id": 11, "name": "hanz", "wins": 1, "losses": 2, "rating": 1068, "placed": 3, "ink": 192, "owned": ["qingfeng", "lingshuang", "tieshan"], "frags": {"yuehua": 3, "leiming": 5, "liuyun": 4, "moyu": 5, "yanling": 3}, "pity": 9, "spity": 7, "skins": ["qf_frost"], "equip": {"qingfeng": "qf_frost"}}, {"id": 12, "name": "zmjjkk", "wins": 1, "losses": 2, "rating": 1100, "placed": 0, "ink": 770, "owned": ["qingfeng", "leiming"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 13, "name": "wqfnkjrnbjv", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 36, "owned": ["qingfeng", "moyu", "liuyun"], "frags": {"leiming": 8, "feiying": 1, "tieshan": 1, "yuehua": 2, "yanling": 1}, "pity": 2, "spity": 0, "skins": [], "equip": {}}, {"id": 14, "name": "Ger1m0", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 560, "owned": ["qingfeng", "lingshuang"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 15, "name": "AAAAAAAA风铃批发", "wins": 1, "losses": 0, "rating": 1127, "placed": 1, "ink": 280, "owned": ["qingfeng", "moyu"], "frags": {"liuyun": 4, "leiming": 9, "yuehua": 1, "feiying": 4, "tieshan": 1}, "pity": 3, "spity": 8, "skins": ["qf_frost"], "equip": {"qingfeng": "qf_frost"}}, {"id": 16, "name": "Hilbert", "wins": 7, "losses": 34, "rating": 963, "placed": 39, "ink": 344, "owned": ["qingfeng", "liuyun", "feiying", "yanling", "leiming", "tieshan", "moyu", "lingshuang", "yuehua"], "frags": {}, "pity": 11, "spity": 0, "skins": ["qf_gold", "lm_violet", "ly_dusk", "yl_raven", "fy_jade", "fy_blood", "qf_frost", "my_cinnabar", "ly_sky", "ts_obsidian", "yl_phoenix", "ts_bronze"], "equip": {"qingfeng": "qf_gold", "feiying": "fy_blood", "liuyun": "ly_dusk", "leiming": "lm_violet", "yanling": "yl_raven", "tieshan": "ts_obsidian", "moyu": "my_cinnabar"}}, {"id": 17, "name": "CJ", "wins": 7, "losses": 5, "rating": 1113, "placed": 12, "ink": 86, "owned": ["qingfeng", "feiying", "moyu", "lingshuang", "tieshan", "leiming"], "frags": {"yuehua": 13, "liuyun": 16, "yanling": 18}, "pity": 10, "spity": 15, "skins": ["qf_frost", "lm_sun"], "equip": {}}, {"id": 18, "name": "神明", "wins": 35, "losses": 13, "rating": 1204, "placed": 46, "ink": 28, "owned": ["qingfeng", "yanling", "tieshan", "liuyun", "feiying", "lingshuang", "leiming"], "frags": {"yuehua": 38, "moyu": 39}, "pity": 11, "spity": 1, "skins": ["qf_gold", "qf_frost", "yl_raven", "yl_phoenix", "ly_dusk", "ts_bronze", "lm_sun"], "equip": {"qingfeng": "qf_gold", "yanling": "yl_raven", "liuyun": "ly_dusk", "tieshan": "ts_bronze", "leiming": "lm_sun"}}, {"id": 19, "name": "duyiuiavuda", "wins": 0, "losses": 1, "rating": 1071, "placed": 1, "ink": 770, "owned": ["qingfeng", "feiying"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 20, "name": "青霜", "wins": 1, "losses": 0, "rating": 1142, "placed": 1, "ink": 1125, "owned": ["qingfeng", "moyu"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 21, "name": "111111", "wins": 0, "losses": 1, "rating": 1054, "placed": 1, "ink": 540, "owned": ["qingfeng", "lingshuang"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}];

let currentLegacyList = [];

function populateLegacyDropdown(list, selectedName) {
  const container = $id('importSelectArea');
  if (!container) return;
  currentLegacyList = list || [];
  if (!currentLegacyList.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('hidden');
  const target = (selectedName || (ACC.name || (window.CloudSave && CloudSave.getUser() ? CloudSave.getUser().name : ''))).toLowerCase();
  container.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <select id="legacyAccSelect" style="flex:1;min-width:0;padding:5px 8px;font-size:12px;background:rgba(0,0,0,0.5);color:var(--ink);border:1px solid var(--faint);border-radius:5px">
        <option value="">-- 选择导入包中的账号（共 ${currentLegacyList.length} 位） --</option>
        ${currentLegacyList.map(a => {
          const ownCount = (a.owned || []).length;
          const skinCount = (a.skins || []).length;
          const ink = a.ink || 0;
          const matchText = (a.wins || 0) + '胜' + (a.losses || 0) + '负';
          const isSel = (target && target === a.name.toLowerCase()) ? ' selected' : '';
          return `<option value="${escapeHTML(a.name)}"${isSel}>${escapeHTML(a.name)} (${ink}墨锭 · ${ownCount}英雄 · ${skinCount}皮肤 · ${matchText})</option>`;
        }).join('')}
      </select>
      <button class="go small" id="claimLegacyBtn" style="font-size:12px;padding:5px 12px;white-space:nowrap">导入此账号</button>
    </div>
  `;
  const claimBtn = $id('claimLegacyBtn');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => {
      const sel = $id('legacyAccSelect');
      const val = sel ? sel.value : '';
      if (!val) {
        if ($id('importMsg')) {
          $id('importMsg').style.color = '#ff6b6b';
          $id('importMsg').textContent = '请先在下拉菜单中选择一个账号';
        }
        return;
      }
      const found = currentLegacyList.find(a => a.name === val);
      if (!found) {
        if ($id('importMsg')) $id('importMsg').textContent = '未找到该账号信息';
        return;
      }
      claimLegacyAccount(found);
    });
  }
}

function claimLegacyAccount(accData) {
  if (!accData) return;
  const name = accData.name;

  // 1. 英雄拥有集合并集
  const oldOwned = Array.isArray(PROF.owned) ? PROF.owned : ['qingfeng'];
  const newOwned = Array.isArray(accData.owned) ? accData.owned : ['qingfeng'];
  PROF.owned = Array.from(new Set([...oldOwned, ...newOwned]));

  // 2. 皮肤拥有集合并集
  const oldSkins = Array.isArray(PROF.skins) ? PROF.skins : [];
  const newSkins = Array.isArray(accData.skins) ? accData.skins : [];
  PROF.skins = Array.from(new Set([...oldSkins, ...newSkins]));

  // 3. 碎片最大值合并
  PROF.frags = PROF.frags || {};
  if (accData.frags && typeof accData.frags === 'object') {
    for (const [cid, cnt] of Object.entries(accData.frags)) {
      PROF.frags[cid] = Math.max(PROF.frags[cid] || 0, cnt || 0);
    }
  }

  // 4. 墨锭取更大值（未签名或老版存档施加合理保护上限）
  const incomingInk = Math.min(Math.max(0, accData.ink || 0), accData._sig ? 999999 : 5000);
  PROF.ink = Math.max(PROF.ink || 0, incomingInk);

  // 5. 保底次数合并
  PROF.pity = Math.max(PROF.pity || 0, accData.pity || 0);
  PROF.spity = Math.max(PROF.spity || 0, accData.spity || 0);

  // 6. 皮肤装配（严格仅保留已解锁的皮肤）
  const validSkins = new Set(PROF.skins || []);
  const rawEquip = Object.assign({}, accData.equip || {}, PROF.equip || {});
  PROF.equip = {};
  for (const [cid, sk] of Object.entries(rawEquip)) {
    if (sk && (validSkins.has(sk) || OFFLINE_BUILD || freeSkinEvent())) {
      PROF.equip[cid] = sk;
    }
  }
  try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (e) {}

  // 7. 战绩与排位
  PROF.netWins = Math.max(PROF.netWins || 0, accData.wins || 0);
  PROF.netLosses = Math.max(PROF.netLosses || 0, accData.losses || 0);
  if (accData.rating) PROF.rating = accData.rating;
  if (accData.placed) PROF.placed = Math.max(PROF.placed || 0, accData.placed || 0);

  // 8. 账号绑定
  if (!ACC.name) {
    ACC.name = name;
  }
  PROF.guest = false;

  // 9. 存储同步（本地镜像与云端）
  if (window.CloudSave) {
    CloudSave.saveProfile(PROF, true);
  }

  // 10. 刷新界面
  applyProfile(PROF);
  renderAcc();

  const msg = `已成功继承【${name}】！已解锁 ${PROF.owned.length} 位英雄、${PROF.skins.length} 款皮肤、${PROF.ink} 墨锭！`;
  if ($id('importMsg')) {
    $id('importMsg').style.color = '#46d3ea';
    $id('importMsg').textContent = msg;
  }
  toast(msg);
}

if ($id('toggleImportBoxBtn')) {
  $id('toggleImportBoxBtn').addEventListener('click', () => {
    $id('importBox').classList.toggle('hidden');
    $id('toggleImportBoxBtn').textContent = $id('importBox').classList.contains('hidden') ? '📜 存档导入与继承' : '收起导入设置';
  });
}

if ($id('importFileInput')) {
  $id('importFileInput').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const d = JSON.parse(ev.target.result);

        // 格式 A: 单账号导出格式或裸 Profile
        if (d.format === 'single-account' || (d.profile && d.account) || Array.isArray(d.owned)) {
          if (!window.CloudSave) throw new Error('存档系统未就绪');
          const res = await CloudSave.importAccountData(d);
          ACC.name = res.name;
          ACC.token = res.uid;
          PROF.guest = false;
          setAcc.last = ACC.token + '|' + ACC.name; adaptLoad();
          applyProfile(res.profile);
          renderAcc();
          if ($id('importFileStatus')) $id('importFileStatus').textContent = `已成功导入【${res.name}】`;
          // 导入就是切换到这个账号（本机账号），要说出来；旧版备份只校验了一部分，也要说
          const sw = `已切换到导入的本机账号【${res.name}】`;
          if ($id('importMsg')) {
            $id('importMsg').style.color = res.note ? '#e9c46a' : '#46d3ea';
            $id('importMsg').textContent = `${sw}：${(res.profile.owned || ['qingfeng']).length} 位英雄、${res.profile.ink || 0} 墨锭。${res.note ? res.note + '。' : ''}`;
          }
          toast(`${sw}${res.note ? '（' + res.note + '）' : ''}`, 5);
          return;
        }

        // 格式 B: 全账号打包备份格式
        if (d.format === 'all-accounts-backup' && Array.isArray(d.accounts)) {
          if (!window.CloudSave) throw new Error('存档系统未就绪');
          const res = { name: '', profile: null };   // 全备份包在这里逐个写本机，不需要走单账号导入
          const list = d.accounts.map(item => {
            const a = item.account || {};
            const p = item.profile || {};
            return {
              id: a.uid,
              name: a.name,
              wins: p.netWins || 0,
              losses: p.netLosses || 0,
              rating: p.rating || 1100,
              placed: p.placed || 0,
              ink: p.ink || 0,
              owned: p.owned || ['qingfeng'],
              frags: p.frags || {},
              pity: p.pity || 0,
              spity: p.spity || 0,
              skins: p.skins || [],
              equip: p.equip || {}
            };
          });
          populateLegacyDropdown(list);
          if (res.name && res.profile) {
            ACC.name = res.name;
            PROF.guest = false;
            applyProfile(res.profile);
            renderAcc();
          }
          if ($id('importFileStatus')) $id('importFileStatus').textContent = `已载入全备份包（共 ${list.length} 个账号）`;
          if ($id('importMsg')) {
            $id('importMsg').style.color = '#e9c46a';
            $id('importMsg').textContent = `成功恢复 ${list.length} 个账号，请在下拉框选择切换！`;
          }
          toast(`成功恢复 ${list.length} 个账号`);
          return;
        }

        // 格式 C: 老站 SQLite 导出文件 (users + profiles)
        const users = d.users || [];
        const profiles = d.profiles || [];
        if (!Array.isArray(users) || !users.length) throw new Error('导出文件中未发现有效玩家用户数据');

        const profById = {};
        for (const p of profiles) {
          if (p && p.user_id) profById[p.user_id] = p;
        }

        const list = users.map(u => {
          const p = profById[u.id] || {};
          const pdata = (p.data && typeof p.data === 'object') ? p.data : (typeof p.data === 'string' ? JSON.parse(p.data || '{}') : {});
          return {
            id: u.id,
            name: u.name,
            wins: u.wins || 0,
            losses: u.losses || 0,
            rating: p.rating || 1100,
            placed: p.placed || 0,
            ink: pdata.ink || 50,
            owned: pdata.owned || ['qingfeng'],
            frags: pdata.frags || {},
            pity: pdata.pity || 0,
            spity: pdata.spity || 0,
            skins: pdata.skins || [],
            equip: pdata.equip || {}
          };
        });

        populateLegacyDropdown(list);
        if ($id('importFileStatus')) $id('importFileStatus').textContent = `已读取 ${file.name}（${list.length} 个账号）`;
        if ($id('importMsg')) {
          $id('importMsg').style.color = '#e9c46a';
          $id('importMsg').textContent = `文件解析成功！请在下拉框中选择要继承的账号后点击【一键继承】`;
        }
        toast(`成功载入 ${list.length} 个账号数据`);
      } catch (err) {
        if ($id('importMsg')) {
          $id('importMsg').style.color = '#ff6b6b';
          $id('importMsg').textContent = '导入失败：' + err.message;
        }
        uiConfirm('文件解析失败：' + err.message, { alert: true });
      }
    };
    reader.readAsText(file);
  });
}

let lbKind = 'rank', lbTok = 0;
$id('lbTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { lbKind = b.dataset.k; openLeaderboard(); } });
// 排行榜：读取中、空榜、出错都用通用的 uiState 画在表格的位置上；说明文字只在有人上榜时显示
function lbShow(sub, state, rows) {
  $id('lbSub').textContent = sub; $id('lbSub').hidden = !sub;
  $id('lbState').innerHTML = state; $id('lbTable').innerHTML = rows;
}
async function openLeaderboard() {
  menuCam.tz = 1.35; showScreen('lb');
  const tok = ++lbTok, kind = lbKind;
  for (const b of $id('lbTabs').children) b.classList.toggle('sel', b.dataset.k === kind);
  lbShow('', uiState('loading', '正在读取排行榜…'), '');
  const fail = err => { if (tok === lbTok) lbShow('', uiState('error', (err && err.message) || '排行榜暂时读不到，稍后再试'), ''); };
  if (kind === 'rank') {
    // 以前这里请求的是网页自己所在网站的 /api/ranklb，GitHub Pages 上没有这个接口，榜单永远“读取失败”；现在走云端 Worker
    try {
      const j = await CloudSave.leaderboard('rank', rkSeason().id);
      if (tok !== lbTok) return;   // 读的时候换了标签：这份结果不要了
      if (!j.list.length) { lbShow('', uiState('empty', '还没有人完成定级赛。排位赛打满 5 场就能上榜！'), ''); return; }
      lbShow(`本赛季打满 ${RK.PLACE} 场定级赛后上榜。段位从低到高：${RK_TIERS.map(t => t.l + ' ' + t.n).join('、')}`, '',
        '<tr><th>名次</th><th>昵称</th><th>段位</th><th class="n">段位分</th></tr>' + j.list.map((r, i) =>
        `<tr class="${i < 3 ? 'top' + (i + 1) : ''}${r.me ? ' me' : ''}"><td class="rk">${i + 1}</td><td>${escapeHTML(r.name)}${r.me ? '（你）' : ''}</td><td>${escapeHTML(rkTier(r.pts).label + ' · ' + rkTier(r.pts).name)}</td><td class="n">${r.pts}</td></tr>`).join(''));
    } catch (err) { fail(err); }
    return;
  }
  try {
    const j = await CloudSave.leaderboard('wins');
    if (tok !== lbTok) return;
    if (!j.list.length) { lbShow('', uiState('empty', '还没有人打过联机——去赢下第一场吧！'), ''); return; }
    lbShow(`已注册玩家 ${j.players} 位，按联机胜场排`, '', '<tr><th>名次</th><th>昵称</th><th class="n">胜</th><th class="n">负</th><th class="n">胜率</th></tr>' + j.list.map((r, i) => {
      const g = r.wins + r.losses, rate = g ? Math.round(r.wins / g * 100) + '%' : '-';
      return `<tr class="${i < 3 ? 'top' + (i + 1) : ''}${r.me ? ' me' : ''}"><td class="rk">${i + 1}</td><td>${escapeHTML(r.name)}${r.me ? '（你）' : ''}</td><td class="n">${r.wins}</td><td class="n">${r.losses}</td><td class="n">${rate}</td></tr>`;
    }).join(''));
  } catch (err) { fail(err); }
}
$id('lbBack').addEventListener('click', backToMenu);
adaptLoad();

// 检查云端/本地已有登录并载入存档
if (window.CloudSave) {
  const cu = CloudSave.getUser();
  if (cu && cu.name) {
    ACC.name = cu.name;
    ACC.token = cu.uid;
    PROF.guest = false;
    CloudSave.loadProfile().then(p => {
      if (p) applyProfile(p);
      else CloudSave.saveProfile(PROF, true);
      renderAcc();
    }).catch(() => {});
  } else {
    PROF.guest = !OFFLINE_BUILD;   // 没登录就是游客：身份看账号，不看存档里那个会丢的标记（离线单文件版没有账号，不算游客）
    CloudSave.loadProfile().then(p => {
      if (p) applyProfile(p);
      renderAcc();
    }).catch(() => {});
  }
}

renderAcc();
function netStatus(t) { if ($id('netStatus')) $id('netStatus').textContent = t; }
setTimeout(renderAcc, 0);
if ($id('verLine')) $id('verLine').textContent = `刃影 v${VERSION}${TOY_BUILD ? ' B站版' : OFFLINE_BUILD ? ' 离线版' : ''}　制作：Even、Luffy、半闲`;
// 离线单文件版：全部皮肤可用，装备记在本机；在线版拥有完整成长与解锁
if (OFFLINE_BUILD) { PROF.skins = Object.keys(SKINS); try { PROF.equip = JSON.parse(localStorage.getItem('renying-equip') || '{}'); } catch (e) {} }
document.body.classList.toggle('offline', OFFLINE_BUILD);
if (OFFLINE_BUILD) {
  $id('mSingle').innerHTML = '<span class="mk">对战电脑</span><span class="ms">和电脑过招，难度可选</span>';
  $id('mNet').innerHTML = '<span class="mk">闯关模式</span><span class="ms">六章三十关，一关一关打上去</span>';
  const ts = document.querySelector('#tutask .sub'); if (ts) ts.textContent = '两分钟学会基本招式，再去挑战电脑与闯关。';
}
function updateNetDiagRtt(ms) {
  if (typeof ms !== 'number' || isNaN(ms)) return;
  const dot = $id('diagRttDot'), val = $id('diagRttVal');
  if (val) val.textContent = `${ms}ms`;
  if (dot) {
    dot.className = 'diag-dot' + (ms > 200 ? ' bad' : ms > 90 ? ' warn' : '');
  }
  const lping = $id('lobbyPingText');
  if (lping) {
    lping.textContent = `延迟 ${ms}ms`;
    lping.style.color = ms > 200 ? 'var(--cinnabar)' : ms > 90 ? 'var(--gold)' : 'var(--jade)';
  }
}
// 直连走的是哪条路、网络本身来回多久（net-p2p.js 每 2 秒报一次，kind 为空表示断开了）。网络本身就慢时提醒一次，免得以为是游戏卡
let netSlowN = 0, netSlowTold = false;
function updateNetDiagPath(kind, ms) {
  const el = $id('diagProtoVal');
  if (!kind) { netSlowN = 0; netSlowTold = false; if (el) el.textContent = 'WebRTC P2P'; return; }
  const name = kind === 'lan' ? '同一网络直连' : kind === 'relay' ? '中转' : '公网直连';
  if (el) el.textContent = ms > 0 ? `${name} · 网络 ${ms}ms` : name;
  netSlowN = ms >= 250 ? netSlowN + 1 : 0;
  if (netSlowN >= 2 && !netSlowTold) {
    netSlowTold = true;
    netStatus(`你们之间的网络本身来回就要 ${ms}ms，游戏自己只多几十毫秒。开着 VPN 或加速器的话，关掉或改成规则模式再试；离得很远、用手机热点也会慢`);
    toast(`网络本身就要 ${ms}ms，开着 VPN 或加速器的话关掉再试`);
  }
}
window.updateNetDiagRtt = updateNetDiagRtt;

function updateNetLobby(active, hostName, peerName, roomCode, peerReady) {
  const box = $id('netLobbyBox'), cols = $id('netCols');
  if (!box) return;
  if (!active) {
    box.classList.add('hidden');
    if (cols) cols.classList.remove('hidden');
    return;
  }
  box.classList.remove('hidden');
  if (cols) cols.classList.add('hidden');
  if ($id('roomWrap')) { $id('roomWrap').classList.remove('hidden'); $id('mmRoomBtn').classList.add('sel'); }
  if ($id('lobbyRoomBadge')) $id('lobbyRoomBadge').textContent = `房间密令：${roomCode || '----'}`;
  if ($id('lobbyHostName')) $id('lobbyHostName').textContent = hostName || '擂主 (房主)';
  if ($id('lobbyPeerName')) $id('lobbyPeerName').textContent = peerName || (NET.role === 'host' ? '静候应战者入局…' : '正在连线…');
  if ($id('lobbyHostState')) $id('lobbyHostState').textContent = '● 设擂就绪';
  if ($id('lobbyPeerState')) {
    $id('lobbyPeerState').textContent = peerReady ? '● 应战就绪' : (NET.role === 'host' ? '○ 等待加入' : '○ 连接中');
    $id('lobbyPeerState').style.color = peerReady ? '#2bd49a' : 'var(--dim)';
  }
}
window.updateNetLobby = updateNetLobby;

let netRoomMode = 'normal';   // 'normal' (BO3), 'chaos' (天机乱斗)

const lobbyModesSegEl = $id('lobbyModesSeg');
if (lobbyModesSegEl) {
  lobbyModesSegEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b || !b.dataset.mode) return;
    if (NET.role !== 'host') {
      toast('仅擂主可调整切磋模式');
      return;
    }
    netRoomMode = b.dataset.mode;
    for (const btn of lobbyModesSegEl.querySelectorAll('button')) btn.classList.toggle('sel', btn === b);
    send({ sys: 'room_rule', rule: netRoomMode });
    const nameMap = { normal: '标准论剑 (BO3)', chaos: '天机乱斗 (随机词条)', pp_cc: '双人共斗 (双人破阵 vs AI)', pp_pp: '四人切磋 (2v2 玩家对决)' };
    toast(`已设定切磋规则：${nameMap[netRoomMode] || '标准论剑'}`);
    SFX.slice();
  });
}

function setRoomModeUI(rule) {
  netRoomMode = rule || 'normal';
  if (lobbyModesSegEl) {
    for (const btn of lobbyModesSegEl.querySelectorAll('button')) {
      btn.classList.toggle('sel', btn.dataset.mode === netRoomMode);
      btn.disabled = NET.role !== 'host';
    }
  }
}

if ($id('lobbyCancelBtn')) $id('lobbyCancelBtn').addEventListener('click', () => {
  netLeave();
  updateNetLobby(false);
  netStatus('已退出武林擂台');
});

function copyRoomInvite() {
  const code = (NET.code || ($id('roomCode') && $id('roomCode').textContent) || '').trim();
  if (!code) return;
  const isWeb = /^https?:$/.test(location.protocol);
  const link = isWeb ? (location.origin + location.pathname + '?room=' + code) : '';
  const text = link ? `【刃影 · 月下一决】房间码：${code}\n点此链接直接入局：${link}` : code;
  const doFeedback = (ok) => {
    const btn = $id('copyCodeBtn');
    if (btn) {
      const orig = btn.dataset.orig || (btn.dataset.orig = btn.textContent);
      btn.textContent = ok ? '已复制房间码与链接！' : '复制失败，请手动记下';
      btn.style.color = ok ? 'var(--jade)' : 'var(--cinnabar)';
      btn.style.borderColor = ok ? 'var(--jade)' : 'var(--cinnabar)';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 1800);
    }
    netStatus(ok ? '已复制！把 4 位房间码或链接发给同学，静候他入局' : '复制失败，房间码为：' + code);
  };
  const fallbackCopy = (txt) => {
    try {
      const t = document.createElement('textarea');
      t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const res = document.execCommand('copy');
      document.body.removeChild(t);
      return res;
    } catch (e) { return false; }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => doFeedback(true)).catch(() => {
      fallbackCopy(text) ? doFeedback(true) : doFeedback(false);
    });
  } else {
    fallbackCopy(text) ? doFeedback(true) : doFeedback(false);
  }
}

if ($id('copyCodeBtn')) $id('copyCodeBtn').addEventListener('click', copyRoomInvite);
if ($id('roomCode')) $id('roomCode').addEventListener('click', copyRoomInvite);
$id('hostBtn').addEventListener('click', () => { initAudio(); netConnect(true); });
// ---------- 对战大厅：匹配对战 / 排位赛（免服务器） ----------
let mmKind = null;
function mmUI(kind) {
  mmKind = kind || null;
  const box = $id('mmSearch');
  if (!box) return;
  box.classList.toggle('hidden', !kind);
  $id('mmQuickBtn').textContent = kind === 'quick' ? '匹配中…' : '开始匹配';
  $id('mmRankBtn').textContent = kind === 'ranked' ? '排位中…' : '开始排位';
  $id('mmQuickBtn').disabled = $id('mmRankBtn').disabled = !!kind;
  $id('mmQuickCard').classList.toggle('searching', kind === 'quick');
  $id('mmRankCard').classList.toggle('searching', kind === 'ranked');
  const c2v2 = $id('mm2v2Card');
  if (c2v2) c2v2.classList.toggle('searching', kind === '2v2_coop' || kind === '2v2_vs');
  const tp = document.querySelector('#topNav .tn-play');
  if (tp) { tp.classList.toggle('searching', !!kind); tp.textContent = kind ? (kind === 'ranked' ? '排位中' : '匹配中') : '对战'; }
  if (kind) {
    let title = '匹配对战 · 正在寻找对手';
    if (kind === 'ranked') title = '排位赛 · 正在寻找对手';
    else if (kind === '2v2_coop') title = '2v2 双人共斗 · 正在全服寻找同袍队友与天道对手';
    else if (kind === '2v2_vs') title = '2v2 组队切磋 · 正在全服匹配队友与对手';
    $id('mmSearchTitle').textContent = title;
    mmTick();
  }
}
function mmTick() {
  if (!mmKind || typeof MM === 'undefined' || !MM.on) return;
  const t = Math.floor((Date.now() - MM.t0) / 1000);
  let sub = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  if (mmKind === 'ranked') {
    const span = mmSpan(), L = RK_TIERS.map(x => x.l), b = MM.band;
    const lo = L[Math.max(0, b - span)], hi = L[Math.min(4, b + span)];
    sub += ` · 匹配范围 ${lo === hi ? lo + ' 段' : lo + '–' + hi + ' 段'}`;
  } else sub += ' · 全服随机';
  $id('mmSearchSub').textContent = sub;
}
setInterval(mmTick, 1000);
setInterval(() => { if ($id('netp').classList.contains('on') && !mmKind) renderLobby(); }, 30000);
function mmGo(kind) {
  initAudio();
  if (kind === 'ranked' && !rkOwner()) { netStatus('排位赛需先登录（右上角）'); toast('排位赛需先登录'); return; }
  if (kind === 'ranked') rkCheckPending();
  mmStart(kind);
  let statusTxt = '匹配对战：正在全服寻找对手…';
  if (kind === 'ranked') statusTxt = `排位赛：${rkLabel()}`;
  else if (kind === '2v2_coop') statusTxt = '2v2 双人共斗：正在全服寻找队友与对手…';
  else if (kind === '2v2_vs') statusTxt = '2v2 组队切磋：正在全服匹配队友与对手…';
  netStatus(statusTxt);
}
$id('mmQuickBtn').addEventListener('click', () => mmGo('quick'));
$id('mmRankBtn').addEventListener('click', () => mmGo('ranked'));
$id('mmCancelBtn').addEventListener('click', () => { netReset(); netStatus('已取消'); });
$id('mmRoomBtn').addEventListener('click', () => {
  const w = $id('roomWrap'), open = w.classList.toggle('hidden') === false;
  $id('mmRoomBtn').setAttribute('aria-expanded', String(open));
  $id('mmRoomBtn').classList.toggle('sel', open);
});
$id('mmRankInfoBtn').addEventListener('click', () => {
  renderRankInfo();
  const sea = rkSeason();
  $id('rkInfoSeason').textContent = sea.pre ? `季前赛 · 第一赛季 10 月 22 日开启` : `${SEASON.name} · 10.22 – 11.22${sea.over ? ' · 已结束' : ' · 剩余 ' + fmtLeft(sea.left)}`;
  $id('rkInfo').classList.remove('hidden');
});
$id('rkInfoClose').addEventListener('click', () => $id('rkInfo').classList.add('hidden'));
$id('rkInfo').addEventListener('click', e => { if (e.target === $id('rkInfo')) $id('rkInfo').classList.add('hidden'); });
setTimeout(() => { try { rkCheckPending(); } catch (e) {} }, 2500);
// 在线情况：多少局在打、多少人在匹配、首页全服在线人数
// 人数有两个来源，谁大用谁：
//   1. 云端到场表：每个标签页 30 秒报一次，90 秒内报过的算在线。算所有开着网页的人，
//      但只有自己那一报成功时才拿得到新数字，所以它慢。
//   2. 江湖驿站的大厅名单：浏览器之间直连，谁进来谁出去立刻广播，秒级。只算连得上大厅的人。
// 以前两个来源都没数时用 Math.max(1, …) 兜底，于是人再多、只要自己那一报没拿到就显示“1 人”。
// 现在没数就显示“—”；大厅接得上时靠它秒级同步、云端 30 秒一报就够；大厅接不上才加密到 10 秒，
// 补上“别人进来了”这件事（大厅被防火墙挡掉、或者 WebRTC 连不上别人时就是这条路）。
const PRES = { sid: '', srv: null, at: 0, busy: false, fail: 0, last: 0, timer: 0, again: false, burst: 0 };
function presSid() {
  if (PRES.sid) return PRES.sid;
  try { PRES.sid = sessionStorage.getItem('renying-presence-sid') || ''; } catch (e) {}
  if (!/^[a-z0-9]{12,40}$/.test(PRES.sid)) {
    PRES.sid = Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(36).padStart(2, '0')).join('').slice(0, 20);
    try { sessionStorage.setItem('renying-presence-sid', PRES.sid); } catch (e) {}
  }
  return PRES.sid;
}
// 换过网络（手机切流量、VPN 开关、IPv6 地址轮换）之后云端会认为这个 sid 是别人顶替的，
// 一直回“sid 不对”。这时换个 sid 重新登记，不然这个标签页再也不会出现在在线人数里。
function presRotateSid() {
  PRES.sid = '';
  try { sessionStorage.removeItem('renying-presence-sid'); } catch (e) {}
  return presSid();
}
const presUrl = () => (window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '') + '/api/presence';
// 对局中：正在打任何一局（联机、开放世界、人机、爬塔……都算），回到主菜单或打完停在结算页就不算；排队匹配算 queue
const presState = () => (M.mode !== 'demo' && M.phase !== 'end') ? 'match' : (mmKind ? 'queue' : 'menu');
const presLive = () => typeof SOC !== 'undefined' && SOC.state === 'on';
// 大厅直连能秒级推名单，这时候云端 30 秒一报就够；网页挂后台没人看，60 秒保个到场就行；
// 连续几次报不上去（云端挂了、额度用完了）也别硬刷，退到 60 秒。
function presGap() {
  if (typeof document !== 'undefined' && document.hidden) return 60000;
  if (PRES.fail >= 3) return 60000;
  if (presLive()) return 30000;
  // 刚发现人数变过（有人进来了/走了）：接着 30 秒加密到 3 秒，抓住紧接着跟进来的人；
  // 平时不这么报，不然一天的请求额度几下就用光了。
  if (PRES.burst > Date.now()) return 3000;
  return 10000;
}
function presSchedule(ms) { clearTimeout(PRES.timer); PRES.timer = setTimeout(() => presBeat(), ms); }
async function presBeat(again) {
  if (PRES.busy) { PRES.again = true; return; }
  PRES.busy = true; PRES.last = Date.now();
  // 以前没有超时：一条请求卡住，busy 就一直开着，后面的心跳全被吞掉，人数停在旧值上
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const cut = ctl ? setTimeout(() => { try { ctl.abort(); } catch (e) {} }, 8000) : 0;
  let rotate = false;
  try {
    // text/plain 不用先发 OPTIONS 预检，关网页时的 sendBeacon 也是这个格式
    const r = await fetch(presUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ sid: presSid(), st: presState() }), signal: ctl ? ctl.signal : undefined });
    const d = await r.json().catch(() => null);
    if (r.ok && d && typeof d.online === 'number') {
      if (PRES.srv && d.online !== PRES.srv.online) PRES.burst = Date.now() + 30000;   // 人数刚变过：加密一轮
      PRES.srv = d; PRES.at = Date.now(); PRES.fail = 0;
    }
    else if (d && !d.ok && d.error === 'sid 不对') rotate = true;
    else PRES.fail++;
  } catch (e) { PRES.fail++; }
  clearTimeout(cut);
  PRES.busy = false;
  if (rotate && !again) { presRotateSid(); return presBeat(true); }
  refreshOnline();
  if (PRES.again) { PRES.again = false; presSchedule(500); } else presSchedule(presGap());
}
// 有“可能变了”的事就立刻报一次（切回窗口、对局状态变了、别人进出大厅），最多每 2 秒一次
function presKick() {
  if (PRES.busy) { PRES.again = true; return; }
  const wait = 2000 - (Date.now() - PRES.last);
  if (wait > 0) { presSchedule(wait); return; }
  presBeat();
}
function presBye() {
  try { if (navigator.sendBeacon) navigator.sendBeacon(presUrl(), new Blob([JSON.stringify({ sid: presSid(), bye: true })], { type: 'text/plain' })); } catch (e) {}
}
window.addEventListener('pagehide', presBye);
// 首页和联机页的人数：总在线 / 对局中 / 匹配中 都以云端的统计为准。
// 云端连不上（断网、两次没报成功、两分钟没有新数）就写「未知」，不拿本机或大厅的零碎数字凑一个假数。
function onlineNow() {
  const fresh = PRES.srv && Date.now() - PRES.at < 120e3 && PRES.fail < 2 && !(typeof navigator !== 'undefined' && navigator.onLine === false);
  if (!fresh) return null;
  const hall = (typeof SOC !== 'undefined' && SOC.online) ? SOC.online.length : 0;   // 大厅那边只可能少算：比云端多就说明云端那一报还没到
  const s = PRES.srv;
  return { total: Math.max(s.online || 0, hall), playing: s.playing || 0, waiting: s.waiting || 0 };
}
function refreshOnline() {
  const o = onlineNow(), set = (id, t) => { const el = $id(id); if (el && el.textContent !== t) el.textContent = t; };
  const pill = $id('homeOnlinePill'); if (pill) pill.classList.toggle('online-unknown', !o);   // 不知道人数时绿点变灰
  if (!o) {
    set('netOnlineOverview', '在线人数未知 · 连不上服务器');
    set('homeOnlineCount', '全服在线人数未知');
    return;
  }
  const parts = [`对局中 ${o.playing} 人`]; if (o.waiting) parts.push(`匹配中 ${o.waiting} 人`);
  set('netOnlineOverview', `${o.total} 人在线 · ` + parts.join(' · '));
  set('homeOnlineCount', `全服 ${o.total} 人在线`);
}
setInterval(refreshOnline, 1000);
setTimeout(refreshOnline, 300);
setTimeout(() => presBeat(), 1200);
// 进了对局、进了匹配、回到菜单：状态变了就立刻报一次，别等下一个 30 秒
let presSt = '';
setInterval(() => { const st = presState(); if (st !== presSt) { presSt = st; presKick(); } }, 2000);
// 切回窗口、从后台回来：立刻要一次最新数字（这也是“两个人各开一个窗口”时最常用的场景）
['focus', 'pageshow', 'online'].forEach(ev => window.addEventListener(ev, () => { presKick(); refreshOnline(); }));
window.addEventListener('offline', refreshOnline);   // 断网：马上改成「未知」
document.addEventListener('visibilitychange', () => { if (!document.hidden) presKick(); else presSchedule(presGap()); refreshOnline(); });
function joinByCode() {
  initAudio();
  const code = $id('codeIn').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) return netStatus('房间码是 4 位');
  netConnect(false, code);
}
$id('joinBtn').addEventListener('click', joinByCode);
$id('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') joinByCode(); });
function checkUrlRoom() {
  try {
    const p = new URLSearchParams(location.search);
    const rm = (p.get('room') || p.get('code') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (p.has('room') || p.has('code')) {   // 邀请码只用一次：从地址栏拿掉，刷新页面就不会再去加入已经散掉的房间
      p.delete('room'); p.delete('code');
      const qs = p.toString();
      try { history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (e) {}
    }
    if (rm.length === 4) {
      if ($id('codeIn')) $id('codeIn').value = rm;
      openScreen('netp');
      netStatus(`检测到邀请房间码 ${rm}，正在自动加入…`);
      setTimeout(() => {
        if ($id('codeIn') && $id('codeIn').value === rm && !NET.open && !(typeof p2pActive === 'function' && p2pActive())) {
          joinByCode();
        }
      }, 600);
    }
  } catch (e) {}
}
setTimeout(checkUrlRoom, 300);

