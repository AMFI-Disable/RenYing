'use strict';
/* =====================================================================
   刃影 —— 免服务器直连（WebRTC，PeerJS 负责牵线）
   ---------------------------------------------------------------------
   房主用“前缀 + 4 位房间码”在 PeerJS 的公共牵线服务器上登记，加入的人按房间码找到他，
   之后两个浏览器直接互发消息，不经过任何服务器。game.js 里的 send() 全走这里。

   握手：
     client → host  { sys: 'hello', v: 版本, name }
     host → client  { sys: 'ready', names, tiers }   版本不同时回 { sys: 'version', need }
     任何一方离开   { sys: 'left' }（关网页时也会尽量发）

   连接状态（P2P.state）：
     idle 没在连 → signal 正在连牵线服务器 → wait 房间码已登记、等人（房主）
     → ice 找到对方、正在打通直连 → open 直连已通
     → unstable 对方几秒没动静或 ICE 断了一下（浏览器会自己恢复），恢复了回到 open，等不回来就 closed

   想用自己的牵线服务器（比如局域网里跑 peerjs），在打开网页前设置
   window.RENYING_P2P = { host, port, path, secure }，会合并进 PeerJS 的选项。
   ===================================================================== */
const P2P = {
  prefix: 'renying-p2p-',
  lib: 'assets/peerjs.min.js',
  cdn: 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
  cdn2: 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  ice: [
    { urls: 'stun:stun.qq.com:3478' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
  remoteIce: null, remoteAt: 0, remoteTtl: 0, turn: false,   // 服务器下发的 ICE（有 TURN 时带短时凭据），见 p2pIce()
  peer: null, conn: null, sess: 0, timer: 0, tries: 0, loading: null,
  opened: false,   // 房主的房间码登记成功过（之后牵线服务器断了只重连，不关房间）
  lastRx: 0,       // 最后一次收到对方消息的时间
  openAt: 0,       // 这条直连打开的时间
  state: 'idle', stateAt: 0,   // 连接状态，见文件开头
  roomAt: 0,       // 房间最后一次空下来（登记成功或上一个人走了）的时间，等太久就过期
  graceUntil: 0,   // ICE 断了一下：到这个时间还没恢复就算断线
  drop: null,      // 当前直连的“断线”处理（心跳发现对方没了时调用）
  sigTries: 0,     // 和牵线服务器断开后已经重连了几次
  dropped: 0,      // 因为太大没发出去的消息数
};
// 只接受对方发来的这几种系统消息，其余忽略（防止被改过的网页乱发）
const P2P_SYS = {
  host: ['hello', 'left', 'match_finish', 'match_ack', 'ping', 'pong', 'rematch', 'room_rule'],
  client: ['ready', 'version', 'full', 'left', 'match_finish', 'match_ack', 'ping', 'pong', 'rematch', 'room_rule']
};
const P2P_SILENCE = 20000;   // 对方 20 秒没有任何消息就当作断线（双方每 2 秒互发心跳）
const P2P_T = {
  signal: 45000,     // 牵线服务器多久没回应算超时（建房、加入）
  ice: 15000,        // 房主这边：有人来了但多久还没打通直连
  unstable: 5000,    // 对方多久没动静先显示“网络不稳”
  grace: 8000,       // ICE 断了以后等它自己恢复的时间
  room: 30 * 60e3,   // 房间没人来，30 分钟后自动关闭（牵线服务器上的房间码也让出来）
  sigRetry: [2000, 4000, 8000, 16000, 30000],   // 和牵线服务器断开后的重连间隔，用完就放弃
};
const P2P_MAX = 60000;   // 单条消息最多多少字符：Safari、Firefox 的数据通道一条消息只保证 64KB，再大会整条丢掉甚至断线
function p2pState(s) {
  if (P2P.state === s) return;
  const was = P2P.state;
  P2P.state = s; P2P.stateAt = Date.now();
  if (typeof NET === 'undefined' || !NET.open || typeof netOverlay !== 'function') return;
  if (s === 'unstable') netOverlay('对方网络不稳，正在等待重连…');
  else if (was === 'unstable' && s === 'open') netOverlay('');
}

function p2pOptions() {
  let customIce = [];
  try {
    const saved = localStorage.getItem('renying-custom-ice');
    if (saved) customIce = JSON.parse(saved);
  } catch (e) {}
  const seen = new Set(), iceServers = [];
  for (const x of [...(Array.isArray(customIce) ? customIce : []), ...(window.RENYING_ICE || []), ...(P2P.remoteIce || []), ...P2P.ice]) {
    const k = JSON.stringify([x && x.urls, x && x.username]);
    if (x && x.urls && !seen.has(k)) { seen.add(k); iceServers.push(x); }
  }
  const userOpts = window.RENYING_P2P || {};
  const config = Object.assign({ iceServers }, userOpts.config || (userOpts.iceServers ? { iceServers: userOpts.iceServers } : {}));
  return Object.assign({ debug: 0 }, userOpts, { config });
}
// 建房、加入、匹配之前先问服务器要 ICE 列表（GET /api/ice）。服务器开了 TURN 时里面带中转地址和几小时就过期的凭据，
// 直连打不通的网络（校园网、公司网、对称 NAT）也能连上。拿不到（离线版、服务器没更新、网络慢）就只用上面固定的 STUN 列表
async function p2pIce() {
  const fresh = P2P.remoteIce && Date.now() - P2P.remoteAt < (P2P.turn ? P2P.remoteTtl * 500 : 3600e3);   // TURN 凭据过半就换新的
  if (fresh) return;
  const base = (window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '') || '';
  if (!base || typeof fetch !== 'function') return;
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const t = setTimeout(() => { if (ac) ac.abort(); }, 2500);   // 最多等 2.5 秒，别让建房卡住
  try {
    const r = await fetch(base + '/api/ice', ac ? { signal: ac.signal } : {});
    const d = r.ok ? await r.json() : null;
    if (d && Array.isArray(d.iceServers)) {
      P2P.remoteIce = d.iceServers.filter(x => x && x.urls);
      P2P.turn = !!d.turn; P2P.remoteTtl = +d.ttl || 0; P2P.remoteAt = Date.now();
    }
  } catch (e) {} finally { clearTimeout(t); }
}
// 直连打不通时的说明：服务器有没有给中转，说的话不一样
function p2pNoRouteText() {
  return P2P.turn
    ? '连接失败：直连和中转服务器都没打通。检查一下网络，或者换个网络（比如手机热点）再试'
    : '连接失败：你们的网络不允许点对点直连（校园网、公司网常见），现在也没有中转服务器可用。换个网络（比如手机热点）再试';
}
function p2pCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 去掉了容易看错的 0 O 1 I
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}
// PeerJS 先用本地的 assets/peerjs.min.js，加载失败再用 CDN
function p2pLoad() {
  if (typeof Peer !== 'undefined') return Promise.resolve(true);
  if (P2P.loading) return P2P.loading;
  const add = src => new Promise(ok => {
    const s = document.createElement('script');
    let done = false;
    const finish = val => { if (!done) { done = true; ok(val); } };
    s.src = src; s.async = true;
    s.onload = () => finish(typeof Peer !== 'undefined');
    s.onerror = () => finish(false);
    setTimeout(() => finish(typeof Peer !== 'undefined'), 4000);
    document.head.appendChild(s);
  });
  P2P.loading = add(P2P.lib)
    .then(ok => ok || add(P2P.cdn))
    .then(ok => ok || add(P2P.cdn2))
    .then(ok => { if (!ok) P2P.loading = null; return ok; });
  return P2P.loading;
}
// 对方发来的名字只留字母、数字、下划线和汉字（和服务器的昵称规则一样）
function p2pName(n, dflt) { return (String(n || '').match(/[\w\u4e00-\u9fff]/g) || []).join('').slice(0, 12) || dflt; }
function p2pOpen() { return !!(P2P.conn && P2P.conn.open); }
function p2pActive() { return !!(P2P.peer || P2P.conn); }
// 发出去返回 true。太大的消息不发（发了对方也收不全），记一笔
function p2pSend(o) {
  if (!p2pOpen()) return false;
  let n = 0;
  try { n = JSON.stringify(o).length; } catch (e) { return false; }
  if (n > P2P_MAX) { P2P.dropped++; console.warn('联机消息太大，没有发送：' + n + ' 字符'); return false; }
  try { P2P.conn.send(o); return true; } catch (e) { return false; }
}
// 主动离开：先把 left 发出去，过一会儿再关直连和牵线（立刻关的话 left 多半还没发出去，对方只能干等 20 秒）
function p2pBye() {
  const c = P2P.conn, p = P2P.peer;
  if (c && c.open) { try { c.send({ sys: 'left' }); } catch (e) {} }
  P2P.conn = P2P.peer = null; P2P.drop = null;
  p2pState('closed');
  if (c || p) setTimeout(() => { if (c) { try { c.close(); } catch (e) {} } if (p) { try { p.destroy(); } catch (e) {} } }, 300);
}
// 关掉当前的直连。sess 加一，旧连接迟到的事件就不会再影响新的房间
function p2pClose() {
  P2P.sess++; P2P.opened = false;
  clearTimeout(P2P.timer);
  P2P.graceUntil = 0; P2P.drop = null; P2P.sigTries = 0; P2P.roomAt = 0;
  p2pState('idle');
  const c = P2P.conn, p = P2P.peer;
  P2P.conn = P2P.peer = null;
  if (c) { try { c.close(); } catch (e) {} }
  if (p) { try { p.destroy(); } catch (e) {} }
  if (typeof updateNetDiagPath === 'function') updateNetDiagPath('');
}
function p2pErrorText(err) {
  const t = err && err.type;
  if (t === 'browser-incompatible') return '这个浏览器不支持直连，换最新的 Chrome、Edge 或 Safari 试试';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '连不上牵线服务器（PeerJS），检查一下网络，有的校园网会拦；换个网络（比如手机热点）再试';
  if (t === 'webrtc' || t === 'negotiation-failed') return p2pNoRouteText();
  return '直连出错：' + ((err && (err.message || err.type)) || '未知错误');
}
// 给一条数据通道挂上事件；sess 不对了说明已经换了房间，直接忽略。side 是自己这边（host / client）
// onIceFail：还没连通就确定打不通（ICE failed）时调用，不用干等超时
function p2pWire(conn, sess, side, onOpen, onData, onIceFail) {
  const live = () => sess === P2P.sess && conn === P2P.conn;
  p2pState('ice');
  conn.on('open', () => { if (live()) { P2P.lastRx = Date.now(); P2P.openAt = performance.now(); P2P.graceUntil = 0; p2pState('open'); onOpen(); } });
  conn.on('data', d => {
    if (!live()) return;
    if (typeof d === 'string' && d.length > P2P_MAX) return;   // 正常的网页不会发这么大的消息
    P2P.lastRx = Date.now();
    if (P2P.state === 'unstable' && !P2P.graceUntil) p2pState('open');
    let m = d;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
    if (!m || typeof m !== 'object') return;
    if (m.sys === 'ping') {
      try { conn.send({ sys: 'pong', t: m.t }); } catch (e) {}
      return;
    }
    if (m.sys === 'pong') {
      if (performance.now() - P2P.openAt < 3000) return;   // 刚连上那几秒两边都在搭选人界面，量出来的数会虚高
      const rtt = Math.round(performance.now() - m.t);
      if (typeof updateNetDiagRtt === 'function') updateNetDiagRtt(rtt);
      return;
    }
    if (m.sys === 'hb') return;
    if (m.sys === 'left') { NET.peerQuit = true; p2pState('closed'); }   // 对方主动离开（不是网络断了）
    if (m.sys !== undefined && !P2P_SYS[side].includes(m.sys)) return;
    onData(m);
  });
  const gone = () => {
    if (!live()) return;
    const wasOpen = NET.open;
    P2P.conn = null; P2P.drop = null; P2P.graceUntil = 0;
    try { conn.close(); } catch (e) {}   // 心跳判断断线时通道可能还“开着”，关掉免得两边各留半条
    if (!NET.leaving && wasOpen) { p2pState('closed'); onSys({ sys: 'left' }); }
    else if (NET.role === 'host' && !NET.open && P2P.opened) {
      p2pState('wait'); P2P.roomAt = Date.now();
      netStatus('刚才的人断开了。房间还开着，把上面的房间码告诉朋友，等他加入…');
    } else p2pState('closed');
  };
  P2P.drop = gone;
  conn.on('close', gone);
  conn.on('error', () => { if (!conn.open) gone(); });   // 连通以后的单条消息出错（比如太大）不算断线
  // ICE（打洞）状态：没连通前 failed 就是打不通，马上报；连通后 disconnected 先等它自己恢复，failed 或等太久才算断线
  const watchIce = n => {
    if (!live()) return;
    const pc = conn.peerConnection;
    if (!pc || !pc.addEventListener) { if (n < 40) setTimeout(() => watchIce(n + 1), 250); return; }   // PeerJS 收到对方的握手后才建它
    pc.addEventListener('iceconnectionstatechange', () => {
      if (!live()) return;
      const s = pc.iceConnectionState;
      if (!conn.open) { if (s === 'failed') { P2P.conn = null; P2P.drop = null; try { conn.close(); } catch (e) {} if (onIceFail) onIceFail(); } return; }
      if (s === 'disconnected') { if (!P2P.graceUntil) P2P.graceUntil = Date.now() + P2P_T.grace; p2pState('unstable'); }
      else if (s === 'failed') gone();
      else if (s === 'connected' || s === 'completed') { P2P.graceUntil = 0; if (P2P.state === 'unstable') p2pState('open'); }
    });
  };
  watchIce(0);
}
// 心跳与延迟测定：每 2 秒一次。对方几秒没动静先提示网络不稳，太久没动静（断网、合上电脑）或 ICE 断了恢复不了就算断线，不用一直干等。
// 房主的房间一直没人来，到时间就关掉
let lastP2pPingT = 0;
function p2pBeat() {
  const now = Date.now();
  if (P2P.state === 'wait' && !P2P.conn && P2P.roomAt && now - P2P.roomAt > P2P_T.room) {
    if (typeof netReset === 'function') netReset(); else p2pClose();
    if (typeof $id === 'function' && $id('roomCode')) $id('roomCode').textContent = '';
    netStatus('房间等了 30 分钟没人加入，已经自动关闭。想继续就重新建房');
    return;
  }
  if (!p2pOpen()) return;
  lastP2pPingT = performance.now();
  p2pSend({ sys: 'ping', t: lastP2pPingT });
  p2pPathCheck();
  if (!NET.open || NET.leaving) return;
  const quiet = now - P2P.lastRx;
  if (quiet > P2P_SILENCE || (P2P.graceUntil && now > P2P.graceUntil)) {
    if (P2P.drop) P2P.drop(); else { p2pState('closed'); onSys({ sys: 'left' }); }
    netStatus('对方的网络断开了，可以重新建房或加入');
  } else if (quiet > P2P_T.unstable) p2pState('unstable');
}
setInterval(p2pBeat, 2000);
// 和牵线服务器断开后按 2、4、8、16、30 秒的间隔重连（房间码不变），都失败就放弃
function p2pRelink(peer, live, ok) {
  const wait = P2P_T.sigRetry[P2P.sigTries++];
  if (wait === undefined) { netStatus('牵线服务器一直连不上，房间已关闭。检查一下网络后重新建房'); p2pClose(); return; }
  setTimeout(() => { if (live() && ok() && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } }, wait);
}
// 直连走的是哪条路、网络本身来回要多久。用的是 WebRTC 自己的统计，不含网页卡顿，延迟高时分得清是网络慢还是游戏慢
function p2pPublicIp(a) {
  a = String(a || '').toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(a)) {
    const [x, y] = a.split('.').map(Number);
    return !(x === 10 || x === 127 || (x === 172 && y >= 16 && y < 32) || (x === 192 && y === 168) || (x === 169 && y === 254));
  }
  return a.includes(':') && !/^(fe[89ab]|f[cd]|::1$)/.test(a);   // IPv6：去掉本机、链路本地和内网段
}
async function p2pPathCheck() {
  const conn = P2P.conn, pc = conn && conn.peerConnection;
  if (!conn || !conn.open || !pc || !pc.getStats) return;
  let st;
  try { st = await pc.getStats(); } catch (e) { return; }
  if (conn !== P2P.conn) return;
  let pair = null;
  st.forEach(r => { if (!pair && r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId); });
  if (!pair) st.forEach(r => { if (!pair && r.type === 'candidate-pair' && (r.selected || r.nominated) && r.state === 'succeeded') pair = r; });
  if (!pair) return;
  const l = st.get(pair.localCandidateId) || {}, r = st.get(pair.remoteCandidateId) || {};
  const sec = pair.currentRoundTripTime > 0 ? pair.currentRoundTripTime : pair.responsesReceived > 0 ? pair.totalRoundTripTime / pair.responsesReceived : 0;
  const kind = l.candidateType === 'relay' || r.candidateType === 'relay' ? 'relay'
    : l.candidateType === 'host' && r.candidateType === 'host' && !p2pPublicIp(l.address || l.ip) && !p2pPublicIp(r.address || r.ip) ? 'lan' : 'wan';
  if (typeof updateNetDiagPath === 'function') updateNetDiagPath(kind, Math.round(sec * 1000));
}

async function netConnectP2P(asHost, code) {
  netReset();
  NET.isRanked = false; NET.leaving = false; NET.base = null; NET.role = asHost ? 'host' : 'client';
  $id('roomCode').textContent = '';
  netStatus(asHost ? '正在建房…' : `正在加入房间 ${code}…`);
  const sess = P2P.sess;
  const [ok] = await Promise.all([p2pLoad(), p2pIce()]);
  if (sess !== P2P.sess) return;                       // 等待加载时又点了别的
  if (!ok) { netStatus('直连组件加载失败，检查一下网络后再试'); return; }
  if (asHost) { P2P.tries = 0; p2pHost(sess); } else p2pJoin(sess, code);
}

// ---------- 房主：登记房间码，等人来 ----------
function p2pHost(sess) {
  const code = p2pCode();
  let peer;
  try { peer = P2P.peer = new Peer(P2P.prefix + code.toLowerCase(), p2pOptions()); }
  catch (e) { netStatus(p2pErrorText(e)); return; }
  const live = () => sess === P2P.sess && peer === P2P.peer;
  p2pState('signal');
  let t1 = setTimeout(() => {
    if (live() && !P2P.opened) {
      netStatus('正在连接公网信令服务器生成房间码…（网络较慢时请稍候，无需本地服务）');
    }
  }, 2500);
  let t2 = setTimeout(() => {
    if (live() && !P2P.opened) {
      netStatus('正在穿透公网网络节点分配房间码，请稍候…');
    }
  }, 9000);
  clearTimeout(P2P.timer);
  P2P.timer = setTimeout(() => {
    if (live() && !P2P.opened) {
      netStatus('连接公网信令服务器超时，请检查网络后重新点击【建房】重试');
      p2pClose();
    }
  }, P2P_T.signal);
  peer.on('open', () => {
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(P2P.timer);
    if (!live()) return;
    P2P.opened = true; P2P.sigTries = 0;
    if (!P2P.conn) { p2pState('wait'); if (!P2P.roomAt) P2P.roomAt = Date.now(); }
    onSys({ sys: 'room', role: 'host', code });        // 显示房间码（重连成功也会再来一次，房间码不变）
  });
  peer.on('connection', conn => {
    if (!live()) return;
    if (p2pOpen()) {                                    // 已经有人了
      conn.on('open', () => { try { conn.send({ sys: 'full' }); } catch (e) {} setTimeout(() => { try { conn.close(); } catch (e) {} }, 400); });
      return;
    }
    if (P2P.conn) { const old = P2P.conn; P2P.conn = null; try { old.close(); } catch (e) {} }   // 上一个人还没连通：多半是他在重试，换成新的
    P2P.conn = conn;
    clearTimeout(P2P.timer);
    const noRoute = () => { if (!live()) return; p2pState('wait'); P2P.roomAt = Date.now(); netStatus(p2pNoRouteText() + '。房间还开着，可以让他再试一次'); };
    P2P.timer = setTimeout(() => {                      // 有人来了但 15 秒还没连通：多半是网络不允许直连
      if (live() && P2P.conn === conn && !conn.open) { P2P.conn = null; P2P.drop = null; try { conn.close(); } catch (e) {} noRoute(); }
    }, P2P_T.ice);
    p2pWire(conn, sess, 'host', () => { clearTimeout(P2P.timer); netStatus('对手已连入，正在核对版本…'); }, m => {
      if (m.sys === 'hello') {
        if (m.v !== VERSION) {
          try { conn.send({ sys: 'version', need: VERSION }); } catch (e) {}
          setTimeout(() => { try { conn.close(); } catch (e) {} }, 400);
          P2P.conn = null; P2P.drop = null; p2pState('wait'); P2P.roomAt = Date.now();
          netStatus(`对手使用旧版本（${m.v || '未知'}）加入，已拒绝。房间仍处于等候中`);
          return;
        }
        const ready = { sys: 'ready', names: { host: (ACC && ACC.name) || '房主', client: p2pName(m.name, '对手') }, tiers: {} };
        conn.send(ready);
        onSys(ready);
        return;
      }
      if (m.sys) onSys(m); else onNetMsg(m);
    }, () => { clearTimeout(P2P.timer); noRoute(); });
  });
  // 和牵线服务器断开：还没开打就按间隔重新登记（房间码不变）；已经直连上了就不用管
  const relink = () => p2pRelink(peer, live, () => !NET.open);
  peer.on('disconnected', () => { if (live() && !NET.open) { netStatus('和牵线服务器断开了，正在重连，房间码不变…'); relink(); } });
  peer.on('error', err => {
    clearTimeout(t1); clearTimeout(t2);                 // 别让“正在连接…”的提示盖掉真正的错误
    clearTimeout(P2P.timer);
    if (!live()) return;
    if (!P2P.opened) {                                  // 房间还没建好
      if (err.type === 'unavailable-id' && P2P.tries++ < 5) {   // 房间码撞了：换一个
        try { peer.destroy(); } catch (e) {}
        P2P.peer = null;
        return p2pHost(sess);
      }
      netStatus(p2pErrorText(err));
      p2pClose();
      return;
    }
    if (NET.open) return;                               // 已经直连上了，牵线服务器的问题不影响对战
    if (err.type === 'webrtc' || err.type === 'negotiation-failed') { netStatus(p2pNoRouteText() + '。房间还开着，可以让他再试一次'); return; }
    netStatus('和牵线服务器断开了，正在重连，房间码不变…');
    relink();
  });
}

// ---------- 加入：按房间码找到房主 ----------
function p2pJoin(sess, code) {
  code = String(code || '').trim().toUpperCase();
  let peer;
  try { peer = P2P.peer = new Peer(p2pOptions()); }
  catch (e) { netStatus(p2pErrorText(e)); return; }
  const live = () => sess === P2P.sess && peer === P2P.peer;
  const fail = text => { if (!live()) return; netStatus(text); p2pClose(); };
  p2pState('signal');
  let t1 = setTimeout(() => {
    if (live() && !NET.open) {
      netStatus(`正在连接信令服务器寻找房间 ${code}…（网络较慢时请稍候）`);
    }
  }, 2500);
  let t2 = setTimeout(() => {
    if (live() && !NET.open) {
      netStatus(`正在与房主建立点对点直连隧道（STUN 节点穿透中）…`);
    }
  }, 9000);
  clearTimeout(P2P.timer);
  P2P.timer = setTimeout(() => {
    if (live() && !NET.open) fail(P2P.conn && P2P.conn.peerConnection && P2P.conn.peerConnection.iceConnectionState === 'failed'
      ? p2pNoRouteText()   // 找到房主了，但网络打不通
      : `连接超时：确认房间码 ${code} 没错且房主还在等候。若网络较慢可稍后再试一次`);
  }, P2P_T.signal);
  peer.on('open', () => {
    clearTimeout(t1);
    clearTimeout(t2);
    if (!live()) return;
    const conn = P2P.conn = peer.connect(P2P.prefix + code.toLowerCase(), { reliable: true, serialization: 'json' });
    p2pWire(conn, sess, 'client', () => {
      clearTimeout(P2P.timer);
      NET.role = 'client';
      onSys({ sys: 'room', role: 'client', code });
      conn.send({ sys: 'hello', v: VERSION, name: (ACC && ACC.name) || '' });
    }, m => {
      if (m.sys === 'ready') { clearTimeout(P2P.timer); m.names = { host: p2pName(m.names && m.names.host, '房主'), client: p2pName(m.names && m.names.client, '对手') }; m.tiers = {}; }
      if (m.sys) onSys(m); else onNetMsg(m);
    }, () => { clearTimeout(P2P.timer); fail(p2pNoRouteText()); });
  });
  peer.on('error', err => {
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(P2P.timer);
    if (!live()) return;
    if (NET.open && err.type !== 'peer-unavailable') return;
    fail(err.type === 'peer-unavailable' ? `找不到房间 ${code}：请核对房间码，并确认房主网页仍在开启等候` : p2pErrorText(err));
  });
}

// ---------- 匹配对战 / 排位赛：同样不要服务器，靠牵线服务器上的“占座”排队 ----------
// 每个池子按大段位分成几段（快速匹配只有一段），每段有几个座位，座位就是一个固定的 PeerJS id：
//   前缀 + mm-<版本>-<池>-<段>-<座>
// 找对手的人先占一个空座坐下（被占了牵线服务器会回 unavailable-id，就换下一个座）；
// 坐下以后每隔几秒去敲“编号比自己小”的座位的门（只往小的敲，两个人就不会同时敲对方）。
// 敲开了就由座位的主人当房主，敲门的人加入，之后和房间对战一模一样（选人、回滚对战）。
// 配对成功后房主马上和牵线服务器断开，把座位让给后面的人，已经建立的直连不受影响。
const MM = { on: false, kind: '', t0: 0, peer: null, myId: '', band: 0, timer: 0, busy: false, tries: 0, avoid: null };
const MM_AVOID = 10 * 60 * 1000;   // 排位不跟刚打过的人连着再打：10 分钟内不再配到同一个人
function mmAvoided(uid) { return !!(uid && MM.kind === 'ranked' && MM.avoid && MM.avoid.uid === uid && Date.now() < MM.avoid.until); }
const MM_SEATS = 3;          // 每段几个座位
const MM_BANDS = 5;          // 排位按大段位分段：D C B A S
const MM_PROBE = 3000;       // 多久去敲一轮门
function mmPool() {
  if (MM.kind === 'ranked') return 'r';
  if (MM.kind === '2v2_coop') return '2c';
  if (MM.kind === '2v2_vs') return '2v';
  return 'q';
}
function mmSeatId(band, seat) { return `${P2P.prefix}mm-${String(VERSION).replace(/\W/g, '')}-${mmPool()}-${band}-${seat}`; }
// 等得越久，能接受的段位差越大：先只找同段，10 秒后放宽到相邻一段，25 秒后放宽到两段
function mmSpan() { if (MM.kind !== 'ranked') return 0; const s = (Date.now() - MM.t0) / 1000; return s < 10 ? 0 : s < 25 ? 1 : 2; }
function mmInfo() { return MM.kind === 'ranked' && typeof rkMatchInfo === 'function' ? rkMatchInfo() : null; }
function mmStop() {
  MM.on = false; MM.busy = false;
  clearTimeout(MM.timer);
  if (MM.peer && MM.peer !== P2P.peer) { try { MM.peer.destroy(); } catch (e) {} }
  MM.peer = null;
}
async function mmStart(kind) {
  netReset();
  NET.leaving = false; NET.base = null; NET.matching = true; NET.isRanked = kind === 'ranked';
  NET.oppRk = null;
  Object.assign(MM, { on: true, kind, t0: Date.now(), busy: false, tries: 0 });
  MM.band = kind === 'ranked' && typeof rkMatchInfo === 'function' ? rkMatchInfo().band : 0;
  if (typeof mmUI === 'function') mmUI(kind);
  const sess = P2P.sess;
  const [ok] = await Promise.all([p2pLoad(), p2pIce()]);
  if (sess !== P2P.sess || !MM.on) return;
  if (!ok) { netStatus('直连组件加载失败，检查一下网络后再试'); netReset(); return; }
  mmSit(sess, 0);
}
// 占座：从 0 号座开始找空的
function mmSit(sess, seat) {
  if (sess !== P2P.sess || !MM.on) return;
  if (seat >= MM_SEATS) {                      // 这一段的座位都满了（很少见）：不占座，只去敲门
    return mmSitAs(sess, null);
  }
  mmSitAs(sess, mmSeatId(MM.band, seat), seat);
}
function mmSitAs(sess, id, seat) {
  let peer;
  try { peer = id ? new Peer(id, p2pOptions()) : new Peer(p2pOptions()); }
  catch (e) { netStatus(p2pErrorText(e)); netReset(); return; }
  P2P.peer = MM.peer = peer;
  const live = () => sess === P2P.sess && peer === P2P.peer;
  let opened = false;
  clearTimeout(P2P.timer);
  P2P.timer = setTimeout(() => { if (live() && !opened) { netStatus('连接牵线服务器超时，请检查网络后重试'); netReset(); } }, 30000);
  peer.on('open', realId => {
    if (!live()) return;
    opened = true; clearTimeout(P2P.timer);
    MM.myId = realId;
    mmProbeLoop(sess, peer);
  });
  peer.on('connection', conn => mmIncoming(sess, peer, conn));
  peer.on('disconnected', () => {             // 和牵线服务器断了：还在排队就重连（座位号不变）
    if (live() && MM.on && !peer.destroyed) setTimeout(() => { if (live() && MM.on && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } }, 1500);
  });
  peer.on('error', err => {
    if (!live()) return;
    if (err.type === 'peer-unavailable') { if (MM.onMiss) MM.onMiss(); return; }   // 敲的座位没人
    if (!opened && err.type === 'unavailable-id') {   // 座位被人占了：换下一个
      try { peer.destroy(); } catch (e) {}
      P2P.peer = MM.peer = null;
      return mmSit(sess, (seat || 0) + 1);
    }
    if (NET.open) return;
    if (!opened) { netStatus(p2pErrorText(err)); netReset(); return; }
    if (MM.onMiss && (err.type === 'webrtc' || err.type === 'negotiation-failed')) MM.onMiss();
  });
}
// 有人来敲门：看看是不是合适的对手
function mmIncoming(sess, peer, conn) {
  const live = () => sess === P2P.sess && peer === P2P.peer;
  const refuse = () => { conn.on('open', () => { try { conn.send({ sys: 'full' }); } catch (e) {} setTimeout(() => { try { conn.close(); } catch (e) {} }, 400); }); };
  if (!live() || !MM.on || MM.busy || P2P.conn) return refuse();
  MM.busy = true;
  P2P.conn = conn;
  const drop = () => { if (P2P.conn === conn) P2P.conn = null; MM.busy = false; try { conn.close(); } catch (e) {} };
  const t = setTimeout(() => { if (live() && P2P.conn === conn && !NET.open) drop(); }, 20000);   // 和敲门那边一样，网络慢时也等得到
  p2pWire(conn, sess, 'host', () => {}, m => {
    if (m.sys === 'hello') {
      const mine = mmInfo(), theirs = m.mm || {};
      const fit = m.v === VERSION && theirs.kind === MM.kind &&
        (MM.kind !== 'ranked' || (mine && Math.abs((theirs.band | 0) - mine.band) <= 2 && !(mine.uid && theirs.uid && mine.uid === theirs.uid) && !mmAvoided(theirs.uid)));
      if (!fit) { try { conn.send({ sys: 'full' }); } catch (e) {} clearTimeout(t); setTimeout(drop, 300); return; }
      clearTimeout(t);
      NET.role = 'host';
      NET.oppRk = theirs.rk || null; NET.oppUid = theirs.uid || '';
      const ready = { sys: 'ready', names: { host: (ACC && ACC.name) || '房主', client: p2pName(m.name, '对手') }, tiers: {}, mm: { kind: MM.kind, rk: mine ? mine.rk : null, uid: mine ? mine.uid : '' } };
      conn.send(ready);
      mmMatched(peer, 'host');
      onSys(ready);
      return;
    }
    if (m.sys) onSys(m); else onNetMsg(m);
  });
}
// 每隔几秒去敲一轮门：只敲编号比自己小的座位，同段优先，等久了再往相邻的段找
function mmTargets() {
  const span = mmSpan(), out = [];
  const bands = [MM.band];
  for (let d = 1; d <= span; d++) { if (MM.band - d >= 0) bands.push(MM.band - d); if (MM.band + d < MM_BANDS) bands.push(MM.band + d); }
  for (const b of (MM.kind === 'ranked' ? bands : [0])) for (let s = 0; s < MM_SEATS; s++) {
    const id = mmSeatId(b, s);
    if (id < MM.myId || !MM.myId.startsWith(P2P.prefix + 'mm-')) out.push(id);   // 没占到座位的人可以敲所有的门
  }
  return out;
}
async function mmProbeLoop(sess, peer) {
  const live = () => sess === P2P.sess && peer === P2P.peer && MM.on;
  while (live()) {
    for (const id of mmTargets()) {
      if (!live() || NET.open) return;
      if (MM.busy) break;                       // 正有人在敲我的门，这一轮先不出去敲
      const r = await mmKnock(sess, peer, id);
      if (r === 'matched' || !live()) return;
    }
    if (typeof mmTick === 'function') mmTick();
    await new Promise(ok => { MM.timer = setTimeout(ok, MM_PROBE + Math.random() * 800); });
  }
}
function mmKnock(sess, peer, id) {
  return new Promise(done => {
    let over = false;
    const conn = peer.connect(id, { reliable: true, serialization: 'json' });
    const finish = r => {
      if (over) return; over = true;
      clearTimeout(t); MM.onMiss = null;
      if (r !== 'matched') { if (P2P.conn === conn) P2P.conn = null; if (MM.busy && MM.knocking === conn) MM.busy = false; try { conn.close(); } catch (e) {} }
      MM.knocking = null;
      done(r);
    };
    // 座位上的人没回应（多半已经走了）5 秒就换下一个；回应了只是网络慢、还在连（来回 800ms 时要六七秒），最多等到 20 秒。
    // 以前一律 5 秒就放弃：网络慢时房主那边刚回“ready”就被挂断，房主以为配上了、退出了排队，两边都匹配不上
    const t0 = Date.now();
    let t = setTimeout(function wait() {
      const s = conn.peerConnection && conn.peerConnection.iceConnectionState;
      if (Date.now() - t0 < 20000 && (conn.open || s === 'checking' || s === 'connected' || s === 'completed')) { t = setTimeout(wait, 1000); return; }
      finish('timeout');
    }, 5000);
    MM.onMiss = () => finish('empty');
    if (MM.busy || P2P.conn) return finish('busy');
    MM.busy = true; MM.knocking = conn; P2P.conn = conn;
    p2pWire(conn, sess, 'client', () => {
      const mine = mmInfo();
      conn.send({ sys: 'hello', v: VERSION, name: (ACC && ACC.name) || '', mm: { kind: MM.kind, band: mine ? mine.band : 0, uid: mine ? mine.uid : '', rk: mine ? mine.rk : null } });
    }, m => {
      if (over && m.sys !== 'ready' && P2P.conn === conn) { if (m.sys) onSys(m); else onNetMsg(m); return; }
      if (m.sys === 'full' || m.sys === 'version') return finish('full');
      if (m.sys === 'ready') {
        if (!m.mm || m.mm.kind !== MM.kind || mmAvoided(m.mm.uid)) return finish('full');
        NET.role = 'client';
        NET.oppRk = m.mm.rk || null; NET.oppUid = m.mm.uid || '';
        m.names = { host: p2pName(m.names && m.names.host, '房主'), client: p2pName(m.names && m.names.client, '对手') }; m.tiers = {};
        finish('matched');
        mmMatched(peer, 'client');
        onSys(m);
        return;
      }
      if (m.sys) onSys(m); else onNetMsg(m);
    });
  });
}
// 配对成功：停止排队，房主把座位让出来
function mmMatched(peer, role) {
  const kind = MM.kind;
  if (kind === 'ranked' && NET.oppUid) MM.avoid = { uid: NET.oppUid, until: Date.now() + MM_AVOID };
  MM.on = false; MM.busy = false; clearTimeout(MM.timer); MM.peer = null;
  NET.matching = false;
  if (typeof mmUI === 'function') mmUI(null);
  onSys({ sys: 'room', matched: true, role, ranked: kind === 'ranked', mmKind: kind });
  setTimeout(() => { try { if (!peer.destroyed && !peer.disconnected) peer.disconnect(); } catch (e) {} }, 600);
}

// 关网页或切到别的应用被系统关掉时，尽量告诉对方
window.addEventListener('pagehide', () => { if (p2pOpen()) p2pSend({ sys: 'left' }); });
