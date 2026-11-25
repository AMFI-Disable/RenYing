// ======================= 联机界面 =======================
// 本文件（名字叫 profile，内容是账号相关的界面）：账号状态、登录 / 注册 / 退出、账号页（设备、同步）、老站数据继承、排行榜。
// 找 bug 提示：账号的网络请求都在 src/cloud.js（CloudSave），这里只管界面和调用。
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
    const isFetch = err && (err.isNetwork || /failed to fetch|network|load failed/i.test(err.message));
    $id('accMsg').textContent = (err && err.message) ? err.message : (isFetch ? '无法连接到云端服务器，请检查网络或稍后重试' : '操作失败');
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

