'use strict';
/* =====================================================================
   刃影 —— 免服务器直连（WebRTC，PeerJS 负责牵线）
   ---------------------------------------------------------------------
   房主用“前缀 + 4 位房间码”在 PeerJS 的公共牵线服务器上登记，加入的人按房间码找到他，
   之后两个浏览器直接互发消息，不经过任何服务器。消息格式和 server.py 转发的完全一样，
   所以选人、回滚对战、聊天都不用改，只是 send() 走这里。

   握手：
     client → host  { sys: 'hello', v: 版本, name }
     host → client  { sys: 'ready', names, tiers }   版本不同时回 { sys: 'version', need }
     任何一方离开   { sys: 'left' }（关网页时也会尽量发）

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
  peer: null, conn: null, sess: 0, timer: 0, tries: 0, loading: null,
  opened: false,   // 房主的房间码登记成功过（之后牵线服务器断了只重连，不关房间）
  lastRx: 0,       // 最后一次收到对方消息的时间
};
// 只接受对方发来的这几种系统消息，其余忽略（防止被改过的网页乱发）
const P2P_SYS = {
  host: ['hello', 'left', 'match_finish', 'match_ack'],
  client: ['ready', 'version', 'full', 'left', 'match_finish', 'match_ack']
};
const P2P_SILENCE = 20000;   // 对方 20 秒没有任何消息就当作断线（双方每 2 秒互发心跳）

function p2pOptions() {
  return Object.assign({ debug: 0, config: { iceServers: P2P.ice } }, window.RENYING_P2P || {});
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
function p2pSend(o) { if (p2pOpen()) { try { P2P.conn.send(o); } catch (e) {} } }
// 关掉当前的直连。sess 加一，旧连接迟到的事件就不会再影响新的房间
function p2pClose() {
  P2P.sess++; P2P.opened = false;
  clearTimeout(P2P.timer);
  const c = P2P.conn, p = P2P.peer;
  P2P.conn = P2P.peer = null;
  if (c) { try { c.close(); } catch (e) {} }
  if (p) { try { p.destroy(); } catch (e) {} }
}
function p2pErrorText(err) {
  const t = err && err.type;
  if (t === 'browser-incompatible') return '这个浏览器不支持直连，换最新的 Chrome、Edge 或 Safari 试试';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '连不上直连的牵线服务器，检查一下网络（有的校园网会拦），或者改用联机服务器';
  if (t === 'webrtc') return '直连建立失败，可能是网络不允许点对点连接，换个网络或改用联机服务器';
  return '直连出错：' + ((err && (err.message || err.type)) || '未知错误');
}
// 给一条数据通道挂上事件；sess 不对了说明已经换了房间，直接忽略。side 是自己这边（host / client）
function p2pWire(conn, sess, side, onOpen, onData) {
  const live = () => sess === P2P.sess && conn === P2P.conn;
  conn.on('open', () => { if (live()) { P2P.lastRx = Date.now(); onOpen(); } });
  conn.on('data', d => {
    if (!live()) return;
    P2P.lastRx = Date.now();
    let m = d;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
    if (!m || typeof m !== 'object' || m.sys === 'hb') return;
    if (m.sys !== undefined && !P2P_SYS[side].includes(m.sys)) return;
    onData(m);
  });
  const gone = () => {
    if (!live()) return;
    const wasOpen = NET.open;
    P2P.conn = null;
    if (!NET.leaving && wasOpen) onSys({ sys: 'left' });
    else if (NET.role === 'host' && !NET.open) netStatus('刚才的人断开了。房间还开着，把上面的房间码告诉朋友，等他加入…');
  };
  conn.on('close', gone);
  conn.on('error', () => { if (!conn.open) gone(); });   // 连通以后的单条消息出错（比如太大）不算断线
}
// 心跳：每 2 秒发一次；对方太久没动静（断网、合上电脑）就结束对战，不用一直干等
setInterval(() => {
  if (!p2pOpen()) return;
  p2pSend({ sys: 'hb' });
  if (NET.open && !NET.leaving && Date.now() - P2P.lastRx > P2P_SILENCE) {
    onSys({ sys: 'left' });
    netStatus('对方的网络断开了，可以重新建房或加入');
  }
}, 2000);

async function netConnectP2P(asHost, code) {
  netReset();
  NET.isRanked = false; NET.leaving = false; NET.base = null; NET.role = asHost ? 'host' : 'client';
  $id('roomCode').textContent = '';
  netStatus(asHost ? '正在建房…' : `正在加入房间 ${code}…`);
  const sess = P2P.sess;
  const ok = await p2pLoad();
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
  }, 45000);
  peer.on('open', () => {
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(P2P.timer);
    if (!live()) return;
    P2P.opened = true;
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
    P2P.timer = setTimeout(() => {                      // 有人来了但 15 秒还没连通：多半是网络不允许直连
      if (live() && P2P.conn === conn && !conn.open) { P2P.conn = null; try { conn.close(); } catch (e) {} netStatus('朋友连不进来：你们的网络可能不允许点对点直连。房间还开着，可以让他再试一次'); }
    }, 15000);
    p2pWire(conn, sess, 'host', () => { clearTimeout(P2P.timer); netStatus('对手已连入，正在核对版本…'); }, m => {
      if (m.sys === 'hello') {
        if (m.v !== VERSION) {
          try { conn.send({ sys: 'version', need: VERSION }); } catch (e) {}
          setTimeout(() => { try { conn.close(); } catch (e) {} }, 400);
          P2P.conn = null;
          netStatus(`对手使用旧版本（${m.v || '未知'}）加入，已拒绝。房间仍处于等候中`);
          return;
        }
        const ready = { sys: 'ready', names: { host: (ACC && ACC.name) || '房主', client: p2pName(m.name, '对手') }, tiers: {} };
        conn.send(ready);
        onSys(ready);
        return;
      }
      if (m.sys) onSys(m); else onNetMsg(m);
    });
  });
  // 和牵线服务器断开：还没开打就过两秒重新登记（房间码不变）；已经直连上了就不用管
  const relink = () => setTimeout(() => {
    if (live() && !NET.open && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} }
  }, 2000);
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
    if (err.type === 'webrtc' || err.type === 'negotiation-failed') { netStatus('对手连接建立未成功（可能受到网络防火墙限制）。房间还开着，可以让他再试一次'); return; }
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
    if (live() && !NET.open) fail(`连接超时：确认房间码 ${code} 没错且房主还在等候。若网络较慢可稍后再试一次`);
  }, 45000);
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
    });
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

// 关网页或切到别的应用被系统关掉时，尽量告诉对方
window.addEventListener('pagehide', () => { if (p2pOpen()) p2pSend({ sys: 'left' }); });
