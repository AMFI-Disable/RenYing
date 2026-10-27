// ======================= 联机界面 =======================
function $id(id) { return document.getElementById(id); }

// ======================= 账号和排行榜 =======================
const ACC = { token: '', name: '', wins: 0, losses: 0 };
try { ACC.token = localStorage.getItem('renying-token') || ''; } catch (e) {}
async function api(path, body) {
  const hd = ACC.token ? { Authorization: 'Bearer ' + ACC.token } : {};
  const opt = body ? { method: 'POST', headers: { ...hd, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: hd };
  const r = await fetch(path, opt);
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.err || '服务器出错了');
  return j;
}
function setAcc(j) {
  if (j && j.name) { Object.assign(ACC, { name: j.name, wins: j.wins, losses: j.losses, cwins: j.cwins || 0, closses: j.closses || 0 }); if (j.token) ACC.token = j.token; }
  else { ACC.token = ''; ACC.name = ''; }
  try { if (ACC.token) localStorage.setItem('renying-token', ACC.token); else localStorage.removeItem('renying-token'); } catch (e) {}
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

  // 开发者专享：全量备份与管理后台入口仅向 Dev 账号开放（后台本身要管理口令）
  const actionBtns = $id('accActionBtns');
  if (actionBtns) {
    const isDev = !!(u && u.isDevMaster);
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
              alert(err.message);
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
  const keepUnsynced = user && user.uid && !synced ? ['renying-prof-' + user.uid, 'renying-ledger-' + user.uid, 'renying-sync-dirty-' + user.uid] : [];
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  for (const k of keys) {
    if (!k || !k.startsWith('renying-')) continue;
    if (LOGOUT_KEEP.includes(k) || k.startsWith('renying-social-') || keepUnsynced.includes(k)) continue;
    if (localUids.some(id => k.endsWith('-' + id)) || localNames.some(n => k.endsWith('-' + n))) continue;   // 本地账号的存档只有这一份
    try { localStorage.removeItem(k); } catch (e) {}
  }
}
let loggingOut = false;
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
  $id('adKind').textContent = u && u.isDevMaster ? (u.isCloud ? '开发者账号 · 云端同步' : '开发者账号 · 本地模式') : u && u.isCloud ? '云端账号' : '本机账号';
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
}
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
      pw = prompt('请输入当前本地账号密码以同步升级至云端：') || '';
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
  if (!confirm('将云端与本地存档进行双向合并同步？\n（融合两端拥有的全部角色、皮肤、最高墨锭与战绩，绝不会丢失任何进度）')) return;
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
      const loaded = await CloudSave.loadProfile();
      if (loaded) {
        applyProfile(loaded);
      } else {
        CloudSave.saveProfile(PROF, true);
      }
      renderAcc();
    }
    $id('accPass').value = '';
    backToMenu();
    toast(kind === 'login' ? `欢迎归来，${name}！已载入存档` : `注册成功！大侠 ${name}，已开启专属存档`);
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
      alert('配置格式错误：' + e.message);
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
    if (sk && (validSkins.has(sk) || OFFLINE_BUILD || DEV_SESSION_UNLOCKED || freeSkinEvent())) {
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
          PROF.guest = false;
          applyProfile(res.profile);
          renderAcc();
          if ($id('importFileStatus')) $id('importFileStatus').textContent = `已成功导入【${res.name}】`;
          if ($id('importMsg')) {
            $id('importMsg').style.color = '#46d3ea';
            $id('importMsg').textContent = `成功恢复账号【${res.name}】！拥有 ${res.profile.owned ? res.profile.owned.length : 1} 位英雄、${res.profile.ink || 0} 墨锭！`;
          }
          toast(`成功恢复账号【${res.name}】！`);
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
        alert('文件解析失败：' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

let lbKind = 'rank';
$id('lbTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { lbKind = b.dataset.k; openLeaderboard(); } });
async function openLeaderboard() {
  menuCam.tz = 1.35; showScreen('lb'); $id('lbSub').textContent = '加载中…'; $id('lbTable').innerHTML = '';
  for (const b of $id('lbTabs').children) b.classList.toggle('sel', b.dataset.k === lbKind);
  if (lbKind === 'rank') {
    try {
      const j = await api('/api/ranklb');
      $id('lbSub').textContent = j.list.length ? '打满 5 场定级赛后上榜。段位从低到高：砺锋、出鞘、破竹、惊鸿、踏月、刃影' : '还没有人完成定级赛。排位赛打满 5 场就能上榜！';
      $id('lbTable').innerHTML = j.list.length ? '<tr><th>名次</th><th>昵称</th><th>段位</th><th class="n">等级分</th></tr>' + j.list.map((r, i) =>
        `<tr class="${i < 3 ? 'top' + (i + 1) : ''}${r.me ? ' me' : ''}"><td class="rk">${i + 1}</td><td>${escapeHTML(r.name)}${r.me ? '（你）' : ''}</td><td>${r.label}</td><td class="n">${r.rating}</td></tr>`).join('') : '';
    } catch (err) { $id('lbSub').textContent = '读取失败：' + err.message; }
    return;
  }
  try {
    const j = await api('/api/leaderboard');
    if (j.me) setAcc(j.me);
    $id('lbSub').textContent = j.list.length ? `已注册玩家 ${j.players} 位。正式：双方皆登录；切磋：对手为游客` : '还没有人打过联机——去赢下第一场吧！';
    $id('lbTable').innerHTML = j.list.length ? '<tr><th>名次</th><th>昵称</th><th class="n">胜</th><th class="n">负</th><th class="n">胜率</th><th class="n">切磋</th></tr>' + j.list.map((r, i) => {
      const g = r.wins + r.losses, rate = g ? Math.round(r.wins / g * 100) + '%' : '-';
      return `<tr class="${i < 3 ? 'top' + (i + 1) : ''}${r.me ? ' me' : ''}"><td class="rk">${i + 1}</td><td>${escapeHTML(r.name)}${r.me ? '（你）' : ''}</td><td class="n">${r.wins}</td><td class="n">${r.losses}</td><td class="n">${rate}</td><td class="n" style="color:var(--dim)">${r.cwins} 胜 ${r.closses} 负</td></tr>`;
    }).join('') : '';
  } catch (err) { $id('lbSub').textContent = '读取失败：' + err.message; }
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
    CloudSave.loadProfile().then(p => {
      if (p) applyProfile(p);
      renderAcc();
    }).catch(() => {});
  }
}

renderAcc();
function netStatus(t) { if ($id('netStatus')) $id('netStatus').textContent = t; }
setTimeout(renderAcc, 0);
if ($id('verLine')) $id('verLine').textContent = `刃影 v${VERSION}${TOY_BUILD ? ' B站版' : OFFLINE_BUILD ? ' 离线版' : ''}　Created by Even, Luffy, and Opus 5.5`;
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
// 在线人数：以云端的到场记录为准（每个标签页 30 秒报一次，刷新还是同一个人）。大厅名单是浏览器之间直连的，
// 连不上别人（有的防火墙、网络挡 WebRTC）就只能看到自己，以前人数会一直停在 1；云端连不上时才退回用大厅名单。
const PRES = { sid: '', srv: null, at: 0, busy: false };
function presSid() {
  if (PRES.sid) return PRES.sid;
  try { PRES.sid = sessionStorage.getItem('renying-presence-sid') || ''; } catch (e) {}
  if (!/^[a-z0-9]{12,40}$/.test(PRES.sid)) {
    PRES.sid = Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(36).padStart(2, '0')).join('').slice(0, 20);
    try { sessionStorage.setItem('renying-presence-sid', PRES.sid); } catch (e) {}
  }
  return PRES.sid;
}
const presUrl = () => (window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '') + '/api/presence';
const presState = () => (M.mode === 'net' && M.phase !== 'end') ? 'match' : (mmKind ? 'queue' : 'menu');
async function presBeat() {
  if (PRES.busy || !window.CloudSave) return;
  PRES.busy = true;
  try {
    // text/plain 不用先发 OPTIONS 预检，关网页时的 sendBeacon 也是这个格式
    const r = await fetch(presUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ sid: presSid(), st: presState() }) });
    const d = await r.json().catch(() => null);
    if (r.ok && d && typeof d.online === 'number') { PRES.srv = d; PRES.at = Date.now(); }
  } catch (e) {}
  PRES.busy = false;
  refreshOnline();
}
function presBye() {
  try { if (navigator.sendBeacon) navigator.sendBeacon(presUrl(), new Blob([JSON.stringify({ sid: presSid(), bye: true })], { type: 'text/plain' })); } catch (e) {}
}
window.addEventListener('pagehide', presBye);
function refreshOnline() {
  const hall = (typeof SOC !== 'undefined' && SOC.online) ? SOC.online.length : 0;
  const srv = PRES.srv && Date.now() - PRES.at < 120e3 ? PRES.srv : null;   // 两分钟没报成功就当云端暂时连不上
  const count = Math.max(srv ? srv.online : 0, hall);
  const h = srv ? { playing: Math.ceil((srv.playing || 0) / 2), waiting: srv.waiting || 0 } : null;   // 一局联机两个人都报 match
  const total = Math.max(1, count);
  const parts = [];
  if (h && h.playing) parts.push(`${h.playing} 局对战`);
  if (h && h.waiting) parts.push(`${h.waiting} 人匹配`);
  if ($id('netOnlineOverview')) $id('netOnlineOverview').textContent = parts.length ? `${total} 人在线 · ` + parts.join(' · ') : `${total} 人在线 · 全网连线`;
  if ($id('homeOnlineCount')) $id('homeOnlineCount').textContent = `全服 ${total} 人在线`;
  if ($id('homeOnlineCardNum')) $id('homeOnlineCardNum').textContent = `${total} 位侠士在线`;
  if ($id('homeOnlineCardSub')) $id('homeOnlineCardSub').textContent = (h && h.playing) ? `正在进行 ${h.playing} 局对战` : '全服连线待命中 · 随时开战';
}
setInterval(refreshOnline, 5000); setTimeout(refreshOnline, 300);
setInterval(presBeat, 30000); setTimeout(presBeat, 1200);
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

