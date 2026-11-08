// ======================= 联机大厅 =======================
// 本文件：联机状态和延迟显示、房间规则和地图投票、复制邀请链接、匹配对战（mm*）、在线人数心跳（pres*）、
// 匿名游玩统计（stat*）、按房间号加入、从网址里读房间号。
function netStatus(t) { if ($id('netStatus')) $id('netStatus').textContent = t; }
setTimeout(renderAcc, 0);
function updateVerLine() {
  const el = $id('verLine');
  if (!el) return;
  const isEn = window.I18N && I18N.getLang() === 'en';
  const tag = TOY_BUILD ? (isEn ? ' Bilibili Edition' : ' B站版') : OFFLINE_BUILD ? (isEn ? ' Offline' : ' 离线版') : '';
  const pre = isEn ? `RenYing v${VERSION}${tag}　Created by: ` : `刃影 v${VERSION}${tag}　制作：`;
  const names = isEn ? 'Even, Luffy, Opus 5.5, Gemini 4 Argon' : 'Even、Luffy、Opus 5.5、Gemini 4 Argon';
  el.textContent = pre + names;
}
updateVerLine();
// 离线单文件版：全部皮肤可用，装备记在本机；在线版拥有完整成长与解锁
if (OFFLINE_BUILD) { PROF.skins = Object.keys(SKINS); try { PROF.equip = JSON.parse(localStorage.getItem('renying-equip') || '{}'); } catch (e) {} }
document.body.classList.toggle('offline', OFFLINE_BUILD);
if (OFFLINE_BUILD) {
  const mp = $id('mPlay'); mp.className = 'mcard right'; mp.setAttribute('data-kb-default', '');
  $id('mMatch').removeAttribute('data-kb-default');
  mp.innerHTML = '<span class="mk">习武</span><span class="ms">对战电脑 · 闯关 · 车轮战 · 木人桩</span>';
  const ts = document.querySelector('#tutask .sub'); if (ts) ts.textContent = '一分钟学会基本招式，再去挑战电脑与闯关。';
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
    for (const btn of document.querySelectorAll('#lobbyModesSeg button')) btn.disabled = false;   // 出了房间：规则又能自己选了
    return;
  }
  box.classList.remove('hidden');
  if (cols) cols.classList.add('hidden');
  roomWrapShow();
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
// 建房、加入、进了房间：露出下面的候战厅、状态和网络情况（平时收着，对战页只有那张 3v3 卡）
function roomWrapShow() { const w = $id('roomWrap'); if (w) w.classList.remove('hidden'); }

const netTeamMutator = () => !NET.isRanked && ['normal', 'pp_cc', 'pp_pp'].includes(netRoomMode) && ['chaos', 'mayhem'].includes(teamMutator) ? teamMutator : 'normal';
let netRoomMode = 'normal';   // 好友房的规则，见 src/data/10-modes.js 的 ROOM_MODES；快速匹配和排位固定 normal（3v3 车轮战）
const ROOM_RULE_NAMES = { normal: '3v3 车轮战', pp_cc: '2v2 · 两人打两电脑', pp_pp: '2v2 · 两人对两人', raid: '联机打魔首', chaos: '天机乱斗', mayhem: '通天神决', maps: '山河异境' };

const lobbyModesSegEl = $id('lobbyModesSeg');
if (lobbyModesSegEl) {
  lobbyModesSegEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b || !b.dataset.mode) return;
    if (NET.role === 'client') {   // 建房前谁都能选；进了房间只有房主能改
      toast('仅擂主可调整切磋模式');
      return;
    }
    setRoomModeUI(b.dataset.mode);
    if (NET.open && NET.role === 'host') send({ sys: 'room_rule', rule: netRoomMode, mut: netTeamMutator() });
    toast(`已设定切磋规则：${ROOM_RULE_NAMES[netRoomMode] || ROOM_RULE_NAMES.normal}`);
    SFX.slice();
  });
}

function setRoomModeUI(rule) {
  netRoomMode = ROOM_MODES[rule] ? rule : 'normal';
  if (lobbyModesSegEl) {
    for (const btn of lobbyModesSegEl.querySelectorAll('button')) {
      btn.classList.toggle('sel', btn.dataset.mode === netRoomMode);
      btn.setAttribute('aria-pressed', btn.dataset.mode === netRoomMode);
      btn.disabled = NET.role === 'client' && NET.open;
    }
  }
  if ($id('roomRuleNow')) $id('roomRuleNow').textContent = ROOM_RULE_NAMES[netRoomMode] || ROOM_RULE_NAMES.normal;
  if (netRoomMode !== 'normal' && $id('roomMore')) $id('roomMore').open = true;   // 选的是别的规则：把折叠打开，让人看得见
  renderLobbyMaps();
  renderLobbyMutator();
}
function renderLobbyMutator() {
  const el = $id('lobbyMutator'); if (!el) return;
  el.hidden = NET.isRanked || !['normal', 'pp_cc', 'pp_pp'].includes(netRoomMode);
  for (const b of el.querySelectorAll('button')) { b.disabled = NET.role === 'client' && NET.open; b.classList.toggle('sel', b.dataset.mut === netTeamMutator()); b.setAttribute('aria-pressed', String(b.dataset.mut === netTeamMutator())); }
}
if ($id('lobbyMutator')) $id('lobbyMutator').addEventListener('click', e => {
  const b = e.target.closest('button[data-mut]'); if (!b || (NET.role === 'client' && NET.open)) return;
  teamMutator = ['chaos', 'mayhem'].includes(b.dataset.mut) ? b.dataset.mut : 'normal';
  renderLobbyMutator(); if (NET.open && NET.role === 'host') send({ sys: 'room_rule', rule: netRoomMode, mut: netTeamMutator() });
});
// 山河异境的联机投票：两边各一票（默认是自己在单人页上投的那张），改票时发给对面；房主开局时把两票一起发出去
const NET_MAPV = { host: null, client: null };
const netMapVotes = () => !NET.isRanked && (netRoomMode === 'normal' || netRoomMode === 'maps') ? [NET_MAPV.host, NET_MAPV.client] : undefined;
function netMapVoteSend() {
  NET_MAPV[NET.role === 'client' ? 'client' : 'host'] = mapVote;
  if (NET.open) send({ sys: 'map_vote', v: mapVote });
}
function netMapVoteRecv(v) {
  NET_MAPV[NET.role === 'client' ? 'host' : 'client'] = MAPS[v] ? v : null;
  renderLobbyMaps();
}
function renderLobbyMaps() {
  const wrap = $id('lobbyMapVote');
  if (!wrap) return;
  const on = !NET.isRanked && (netRoomMode === 'normal' || netRoomMode === 'maps');
  wrap.classList.toggle('hidden', !on);
  if (!on) return;
  NET_MAPV[NET.role === 'client' ? 'client' : 'host'] = mapVote;
  mapVoteCards($id('lobbyMapCards'), [NET_MAPV.host, NET_MAPV.client], mapVote, id => { setMapVote(mapVote === id ? null : id); netMapVoteSend(); renderLobbyMaps(); });
  const random = $id('lobbyMapRandom');
  if (random) random.setAttribute('aria-pressed', String(!mapVote));
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
$id('hostBtn').addEventListener('click', () => { initAudio(); roomWrapShow(); netConnect(true); });
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
  else if (kind === '2v2_vs') statusTxt = '2v2 组队切磋：正在全服匹配一位对手（双方各带一名电脑队友）…';
  netStatus(statusTxt);
}
$id('mmQuickBtn').addEventListener('click', () => mmGo('quick'));
$id('mmRankBtn').addEventListener('click', () => mmGo('ranked'));
$id('mmCancelBtn').addEventListener('click', () => { netReset(); netStatus('已取消'); });
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
// ---------- 匿名游玩统计（服务器 POST /api/stats，管理网页「游玩统计」看） ----------
// 只报几件事：打开网页、新手教学开始 / 走完 / 跳过、开了哪个模式的一局。不带名字、账号、邮箱；
// 编号是这台浏览器自己随机生成的（renying-anon-id），服务器再加盐哈希一次才存。设置里「匿名统计」可以关；离线版不报。
const STATQ = { q: [], timer: 0, skip: false };
function statId() {
  let id = '';
  try { id = localStorage.getItem('renying-anon-id') || ''; } catch (e) {}
  if (!/^[a-z0-9]{12,40}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(36).padStart(2, '0')).join('').slice(0, 20);
    try { localStorage.setItem('renying-anon-id', id); } catch (e) {}
  }
  return id;
}
const statUrl = () => (window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '') + '/api/stats';
const statOn = () => !OFFLINE_BUILD && SETTINGS.stats !== false && !!(window.CloudSave && CloudSave.getEndpoint && CloudSave.getEndpoint());
function statEv(k) {
  if (!statOn()) return;
  STATQ.q.push(k);
  if (STATQ.q.length >= 20) statFlush();
  else if (!STATQ.timer) STATQ.timer = setTimeout(statFlush, 15000);   // 攒 15 秒一起报，少发请求
}
function statFlush(beacon) {
  clearTimeout(STATQ.timer); STATQ.timer = 0;
  if (!STATQ.q.length || !statOn()) { STATQ.q.length = 0; return; }
  const body = JSON.stringify({ vid: statId(), ev: STATQ.q.splice(0, 30) });
  try {
    if (beacon && navigator.sendBeacon) navigator.sendBeacon(statUrl(), new Blob([body], { type: 'text/plain' }));
    else fetch(statUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {});
  } catch (e) {}
}
// 一局开始（第一回合、比分 0:0）：记是哪个模式。重算回滚、首页演示、新手教学不算
function statMatch() {
  if (typeof RESIM !== 'undefined' && RESIM) return;
  if (STATQ.skip || M.mode === 'demo' || TUT || M.round !== 1 || M.wins[0] || M.wins[1]) return;
  let k = M.mode;
  if (k === 'net' && NET.isRanked) k = 'netrk';
  else if (k === 'cpu' && typeof FOREST !== 'undefined' && FOREST.on) k = 'stage';
  statEv('m:' + k);
}
// 匿名对局训练上传：只发战斗状态与按键样本，不发回放、姓名、账号、皮肤或精确时间。
const AIQ_KEY = 'renying-ai-match-queue', AIQ_MAX = 30;
const aiTrainOn = () => !OFFLINE_BUILD && SETTINGS.aiTraining !== false && !!(window.CloudSave && CloudSave.getEndpoint && CloudSave.getEndpoint());
const aiTrainUrl = () => (window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '') + '/api/ai-training';
function aiTrainQueue() { try { const q = JSON.parse(localStorage.getItem(AIQ_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; } }
function aiTrainClearQueue() { try { localStorage.removeItem(AIQ_KEY); } catch (e) {} }
function aiTrainMatch(m, modeOverride) {
  if (!aiTrainOn() || !m || !Array.isArray(m.tr) || !m.tr.length || m.w === undefined || m.mode === 'demo' || m.mode === 'train') return;
  const matches = Array.isArray(m.segments) && m.segments.length ? m.segments : [m], q = aiTrainQueue();
  for (const part of matches) {
    if (!part || !Array.isArray(part.tr) || !part.tr.length || part.w === undefined) continue;
    let rows;
    try { rows = trSamples(part).map(x => ({ hero: x.hero, s: x.s, a: x.a, r: x.r, done: x.done ? 1 : 0 })); } catch (e) { continue; }
    if (!rows.length) continue;
    const result = part.w === -1 ? -1 : part.kind === 'net' && part.playerSide === 1 ? 1 - part.w : part.w;
    q.push({ id: crypto.randomUUID(), mode: String(modeOverride || part.mode || m.mode || 'cpu'), result, rows });
  }
  if (!q.length) return;
  try { localStorage.setItem(AIQ_KEY, JSON.stringify(q.slice(-AIQ_MAX))); } catch (e) { return; }
  aiTrainFlush();
}
let aiTrainBusy = false;
async function aiTrainFlush() {
  if (aiTrainBusy || !aiTrainOn() || !navigator.onLine) return;
  aiTrainBusy = true;
  try {
    let q = aiTrainQueue();
    while (q.length && aiTrainOn() && navigator.onLine) {
      const r = await fetch(aiTrainUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(q[0]), keepalive: true });
      if (!r.ok) break;
      const ack = await r.json();
      if (!ack || !ack.ok || ack.limited) break;
      q.shift();
      try { localStorage.setItem(AIQ_KEY, JSON.stringify(q)); } catch (e) { break; }
    }
  } catch (e) {} finally { aiTrainBusy = false; }
}
window.addEventListener('online', aiTrainFlush);
setTimeout(aiTrainFlush, 5000);
setInterval(aiTrainFlush, 60000);
window.addEventListener('pagehide', () => statFlush(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) statFlush(true); });
setTimeout(() => { statEv('open'); statFlush(); }, 3000);   // 打开网页：等云端地址准备好再报
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
  roomWrapShow();
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


if ($id('lobbyMapRandom')) $id('lobbyMapRandom').addEventListener('click', () => { setMapVote(null); netMapVoteSend(); renderLobbyMaps(); });
