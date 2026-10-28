'use strict';
/* =====================================================================
   刃影 —— 江湖驿站（大厅、好友、私聊、群聊），不需要服务器
   ---------------------------------------------------------------------
   和联机对战一样借 PeerJS 的公共牵线服务器找人，消息在浏览器之间直接传。

   每个人：用“renying-u- + 名字的哈希”登记，别人按名字就能找到你。
   大厅：  谁先登记上 renying-hall-0 谁就是“大厅主持”，其他人都连到他，
           他负责转发大厅发言、记住最近的聊天、告诉大家谁在线。
           主持关了网页，大家稍等一下重新抢这个位置，抢到的人从自己本机记的聊天接着放。
           如果这个位置被一个连不上的主持占着（网页挂在后台、网络打不通），就换到
           renying-hall-1、-2、-3；主持在后面的位置时每 30 秒看一眼前面的位置能不能连上，
           能连上就带着大家搬回去，免得大厅分成两半。
   私聊、群聊：直接连对方。对方不在线时消息先存在自己这边，等对方上线自动补发，
           收到对方回执才算送达。

   本机存档（按账号分开）：好友、好友申请、群、每段聊天最近 200 条、还没送达的消息。
   ===================================================================== */
const SOC = {
  slot: 0, dead: {}, probeN: 0,  // 大厅用第几个位置；连不上的位置 → 上次失败的时间
  startAt: 0,
  ver: 1,
  me: '', uid: '', alt: false,   // alt：同一个账号在别的页面也开着，这边收不到私聊
  peer: null, hubPeer: null, hubConns: new Map(), hall: null,
  conns: new Map(),              // 名字 → 和这个人的直连
  online: [], hist: [],           // 大厅在线名单、大厅最近的聊天
  data: null, cur: 'hall', sess: 0, joinT: 0, tick: 0, lastSay: 0,
  state: 'off',                   // off / connecting / on
};
const SOC_MAX_CONV = 200, SOC_MAX_HALL = 150, SOC_TEXT = 200, SOC_SLOTS = 4;
function socHallId(s) { return 'renying-hall-' + (s == null ? SOC.slot : s); }

/* ---------- 名字与 id ---------- */
function socHash(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (const ch of String(s)) { const c = ch.codePointAt(0); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 2246822519) >>> 0; b = (b ^ (b >>> 13)) >>> 0; }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
const socUid = name => 'renying-u-' + socHash(name);
// 对方的 peer id 必须就是他名字算出来的那个（或同账号第二个页面的“id-随机后缀”），防止冒名
const socIdOk = (pid, name) => !!name && (pid === socUid(name) || String(pid).startsWith(socUid(name) + '-'));
function socGuest() {
  let n = '';
  try { n = localStorage.getItem('renying-guest-name') || ''; } catch (e) {}
  if (!/^游客\d{4}$/.test(n)) { n = '游客' + String(Math.floor(1000 + Math.random() * 9000)); try { localStorage.setItem('renying-guest-name', n); } catch (e) {} }
  return n;
}
const socWho = () => (typeof ACC !== 'undefined' && ACC.name) ? ACC.name : socGuest();
const socGuestNow = () => !(typeof ACC !== 'undefined' && ACC.name);
const socRid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const socClean = t => String(t || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, SOC_TEXT);

/* ---------- 本机存档 ---------- */
function socKey() { return 'renying-social-' + SOC.me; }
function socLoad() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(socKey()) || 'null'); } catch (e) {}
  d = d && typeof d === 'object' ? d : {};
  for (const k of ['friends', 'reqIn', 'reqOut', 'convs', 'groups', 'unread', 'outbox']) if (!d[k] || typeof d[k] !== 'object') d[k] = {};
  SOC.data = d;
  try { const h = JSON.parse(localStorage.getItem('renying-hall-cache') || '[]'); SOC.hist = Array.isArray(h) ? h.slice(-SOC_MAX_HALL) : []; } catch (e) { SOC.hist = []; }
}
let socSaveT = 0;
function socSave() {
  clearTimeout(socSaveT);
  socSaveT = setTimeout(() => {
    try { localStorage.setItem(socKey(), JSON.stringify(SOC.data)); } catch (e) {}
    try { localStorage.setItem('renying-hall-cache', JSON.stringify(SOC.hist.slice(-SOC_MAX_HALL))); } catch (e) {}
  }, 200);
}
function socConv(key) { return SOC.data.convs[key] || (SOC.data.convs[key] = []); }
function socPush(key, m) {
  const c = socConv(key);
  if (c.some(x => x.id === m.id)) return false;
  c.push(m); c.sort((a, b) => a.at - b.at);
  if (c.length > SOC_MAX_CONV) c.splice(0, c.length - SOC_MAX_CONV);
  if (key !== SOC.cur || !socVisible()) { if (m.from !== SOC.me) SOC.data.unread[key] = (SOC.data.unread[key] || 0) + 1; }
  socSave(); return true;
}

/* ---------- 连接 ---------- */
function socOpts() { return typeof p2pOptions === 'function' ? p2pOptions() : { debug: 0 }; }
function socStop() {
  SOC.sess++; clearTimeout(SOC.joinT);
  for (const c of SOC.conns.values()) { try { c.close(); } catch (e) {} }
  SOC.conns.clear();
  socHubStop();
  if (SOC.peer) { try { SOC.peer.destroy(); } catch (e) {} }
  SOC.peer = null; SOC.hall = null; SOC.probing = null; SOC.online = []; SOC.state = 'off';
}
function socStart() {
  const who = socWho();
  if (SOC.peer && SOC.me === who) return;
  socStop();
  SOC.me = who; SOC.uid = socUid(who); SOC.alt = false; SOC.cur = 'hall'; SOC.startAt = Date.now();
  socLoad();
  if (typeof Peer === 'undefined') { if (typeof p2pLoad === 'function') p2pLoad().then(ok => ok && socStart()); return; }
  socOpenPeer(SOC.uid);
}
function socOpenPeer(id) {
  const sess = ++SOC.sess;
  SOC.state = 'connecting'; socRenderStatus();
  let p;
  try { p = SOC.peer = new Peer(id, socOpts()); } catch (e) { SOC.state = 'off'; socRenderStatus(); return; }
  p.on('open', () => { if (sess !== SOC.sess) return; socJoinHall(); socFlushAll(); });
  p.on('connection', c => { if (sess === SOC.sess) socWireIn(c); });
  p.on('disconnected', () => { if (sess === SOC.sess && !p.destroyed) setTimeout(() => { try { if (sess === SOC.sess && p.disconnected && !p.destroyed) p.reconnect(); } catch (e) {} }, 3000); });
  p.on('error', err => {
    if (sess !== SOC.sess) return;
    const t = err && err.type, msg = String(err && err.message || '');
    if (t === 'unavailable-id' && !SOC.alt) {   // 同一个账号在别的页面开着：这边换个后缀，只逛大厅
      SOC.alt = true; try { p.destroy(); } catch (e) {}
      socOpenPeer(SOC.uid + '-' + Math.random().toString(36).slice(2, 7)); return;
    }
    if (t === 'peer-unavailable') {
      if (msg.includes(socHallId())) socClaimHall(sess);
      else for (const [n, c] of SOC.conns) if (msg.includes(c.peer)) { SOC.conns.delete(n); try { c.close(); } catch (e) {} }
      return;
    }
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') { SOC.state = 'connecting'; socRenderStatus(); }
  });
}
function socSend(c, o) { if (c && c.open) { try { c.send(o); return true; } catch (e) {} } return false; }
function socParse(d) { let m = d; if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return null; } } return m && typeof m === 'object' ? m : null; }

/* ---------- 大厅：连主持；没人主持就自己当 ---------- */
function socJoinHall() {
  const sess = SOC.sess, p = SOC.peer;
  if (!p || p.destroyed || p.disconnected || (SOC.hall && SOC.hall.open)) return;
  clearTimeout(SOC.joinT);
  let c;
  if (SOC.hubPeer && SOC.hubPeer.open) {   // 自己就是主持：本机直接接上，不走网络
    const pair = socLoopPair(p.id);
    c = pair[0]; socHubWire(pair[1]);
    setTimeout(() => c.emit('open'), 0);
  } else {
    try { c = p.connect(socHallId(), { reliable: true, metadata: { name: SOC.me } }); } catch (e) { return; }
  }
  SOC.hall = c;
  const giveUp = setTimeout(() => {
    if (sess !== SOC.sess || SOC.hall !== c || c.open) return;
    try { c.close(); } catch (e) {}
    SOC.dead[SOC.slot] = Date.now();   // 这个位置有人登记了却连不上（或者根本没人）：先试着自己占，占不到就换下一个
    socClaimHall(sess);
  }, 9000);
  c.on('open', () => {
    clearTimeout(giveUp);
    if (sess !== SOC.sess || SOC.hall !== c) return;
    SOC.hallRx = Date.now();
    const last = SOC.hist.length ? SOC.hist[SOC.hist.length - 1].at : 0;
    socSend(c, { t: 'hi', v: SOC.ver, name: SOC.me, since: last });
  });
  c.on('data', d => { if (sess === SOC.sess && SOC.hall === c) { SOC.hallRx = Date.now(); socHallRx(socParse(d)); } });
  c.on('close', () => { clearTimeout(giveUp); socHallLost(c); });
}
// 主持走了（关网页时直连往往要等很久才报断开，所以也靠心跳判断）：错开时间重新找
function socHallLost(c) {
  if (SOC.hall !== c) return;
  try { c.close(); } catch (e) {}
  SOC.hall = null; SOC.online = []; SOC.state = 'connecting'; socRenderAll(); socPresence();
  clearTimeout(SOC.joinT);
  SOC.joinT = setTimeout(() => socJoinHall(), 600 + Math.random() * 2400);
}
function socClaimHall(sess) {
  if (sess !== SOC.sess || SOC.hubPeer) return;
  let hp;
  try { hp = SOC.hubPeer = new Peer(socHallId(), socOpts()); } catch (e) { SOC.hubPeer = null; return; }
  hp.on('open', () => { if (sess !== SOC.sess || SOC.hubPeer !== hp) return; SOC.hubHist = SOC.hist.slice(-SOC_MAX_HALL); setTimeout(socJoinHall, 50); });
  hp.on('connection', c => { if (SOC.hubPeer === hp) socHubWire(c); });
  hp.on('disconnected', () => {   // 和牵线服务器断了：先试着要回这个 id，被别人占了就让位
    if (SOC.hubPeer !== hp) return;
    setTimeout(() => { try { if (SOC.hubPeer === hp && hp.disconnected && !hp.destroyed) hp.reconnect(); } catch (e) {} }, 1500);
  });
  hp.on('error', err => {
    if (SOC.hubPeer !== hp) return;
    const t = err && err.type;
    if (t === 'unavailable-id') {   // 别人先抢到了：去连他；刚才就是连他连不上，换下一个位置
      socHubStop();
      if (sess !== SOC.sess) return;
      const stuck = Date.now() - (SOC.dead[SOC.slot] || 0) < 30000;
      if (stuck) socNextSlot();
      SOC.joinT = setTimeout(socJoinHall, (stuck ? 100 : 300) + Math.random() * 900);
    }
  });
}
function socNextSlot() {
  for (let i = 1; i <= SOC_SLOTS; i++) {
    const s = (SOC.slot + i) % SOC_SLOTS;
    if (Date.now() - (SOC.dead[s] || 0) > 60000) { SOC.slot = s; return; }
  }
  SOC.dead = {}; SOC.slot = (SOC.slot + 1) % SOC_SLOTS;   // 全都试过了：从头再来
}
// 主持在后面的位置上：轮流看前面的位置有没有活着的大厅，有就带大家搬过去
function socProbe() {
  const p = SOC.peer, hp = SOC.hubPeer;
  if (!p || !p.open || !hp || !hp.open || SOC.slot === 0 || SOC.probing) return;
  const s = SOC.probeN++ % SOC.slot;
  let c;
  try { c = p.connect(socHallId(s), { reliable: true, metadata: { probe: 1 } }); } catch (e) { return; }
  SOC.probing = c;
  const end = () => { if (SOC.probing === c) SOC.probing = null; try { c.close(); } catch (e) {} };
  const to = setTimeout(end, 8000);
  c.on('open', () => {
    clearTimeout(to); end();
    if (SOC.hubPeer !== hp) return;
    socHubCast({ t: 'move', slot: s });
    setTimeout(() => { if (SOC.hubPeer === hp) socHubStop(); }, 300);
  });
  c.on('error', () => {});
}
// 本机两头直接相连的“假连接”，接口和 PeerJS 的 DataConnection 一样用
function socLoopPair(id) {
  const mk = () => ({
    open: false, peer: id, h: {},
    on(e, f) { (this.h[e] || (this.h[e] = [])).push(f); return this; },
    emit(e, a) { if (e === 'open') this.open = true; for (const f of this.h[e] || []) { try { f(a); } catch (err) {} } },
    send(d) { const o = this.other, j = JSON.stringify(d); if (this.open) setTimeout(() => { if (o.open) o.emit('data', j); }, 0); },
    close() { if (!this.open && !this.other.open) return; const o = this.other; this.open = false; o.open = false; setTimeout(() => { this.emit('close'); o.emit('close'); }, 0); },
  });
  const a = mk(), b = mk(); a.other = b; b.other = a; b.open = true;
  return [a, b];
}
function socHubStop() {
  const hp = SOC.hubPeer; SOC.hubPeer = null;
  for (const c of SOC.hubConns.keys()) { try { c.close(); } catch (e) {} }
  SOC.hubConns.clear();
  if (hp) { try { hp.destroy(); } catch (e) {} }
}
// 主持每 5 秒清一次 15 秒没动静的人
function socHubSweep() {
  let gone = false;
  for (const [c, x] of SOC.hubConns) if (Date.now() - x.rx > 15000) { SOC.hubConns.delete(c); try { c.close(); } catch (e) {} if (x.name) gone = true; }
  if (gone) socHubCast({ t: 'online', online: socHubOnline() });
}
function socHubOnline() { return [...new Set([...SOC.hubConns.values()].filter(x => x.name).map(x => x.name))]; }
function socHubCast(o) { for (const [c, x] of SOC.hubConns) if (x.name) socSend(c, o); }
function socHubWire(c) {
  const st = { name: '', last: 0, burst: 0, rx: Date.now() };
  SOC.hubConns.set(c, st);
  const kick = setTimeout(() => { if (!st.name) { try { c.close(); } catch (e) {} } }, 15000);
  c.on('data', d => {
    const m = socParse(d); if (!m) return;
    st.rx = Date.now();
    if (m.t === 'ping') { socSend(c, { t: 'pong' }); return; }
    if (m.t === 'hi') {
      const name = typeof p2pName === 'function' ? p2pName(m.name, '') : String(m.name || '').slice(0, 12);
      if (!name || !socIdOk(c.peer, name)) { try { c.close(); } catch (e) {} return; }
      clearTimeout(kick); st.name = name;
      const since = +m.since || 0;
      socSend(c, { t: 'welcome', v: SOC.ver, hist: SOC.hubHist.filter(x => x.at > since).slice(-100), online: socHubOnline() });
      socHubCast({ t: 'online', online: socHubOnline() });
      return;
    }
    if (!st.name) return;
    if (m.t === 'say') {
      const now = Date.now(), text = socClean(m.text);
      if (!text) return;
      st.burst = Math.max(0, st.burst - (now - st.last) / 1500) + 1; st.last = now;   // 每 1.5 秒回一格，连发超过 5 条就吞掉
      if (st.burst > 5) return;
      const msg = { id: socRid(), from: st.name, text, at: now };
      SOC.hubHist.push(msg); if (SOC.hubHist.length > SOC_MAX_HALL) SOC.hubHist.splice(0, SOC.hubHist.length - SOC_MAX_HALL);
      socHubCast({ t: 'msg', m: msg });
    }
  });
  c.on('close', () => { clearTimeout(kick); const had = st.name; SOC.hubConns.delete(c); if (had) socHubCast({ t: 'online', online: socHubOnline() }); });
  c.on('error', () => {});
}
// 大厅名单一变就让首页的人数立刻跟着变：以前要等 5 秒一次的定时刷新，别人进来半天还显示 1
function socPresence() { try { if (typeof refreshOnline === 'function') refreshOnline(); } catch (e) {} }
function socHallRx(m) {
  if (!m) return;
  if (m.t === 'welcome') {
    SOC.state = 'on'; delete SOC.dead[SOC.slot];
    for (const x of (Array.isArray(m.hist) ? m.hist : [])) socHallAdd(x, true);
    SOC.online = Array.isArray(m.online) ? m.online.slice(0, 500) : [];
    socSave(); socRenderAll(); socFlushAll(); socPresence(); return;
  }
  if (m.t === 'bye') { socHallLost(SOC.hall); return; }
  if (m.t === 'move') { const s = +m.slot; if (s >= 0 && s < SOC_SLOTS && s !== SOC.slot) { SOC.slot = s; delete SOC.dead[s]; socHallLost(SOC.hall); } return; }
  if (m.t === 'online') { SOC.online = Array.isArray(m.online) ? m.online.slice(0, 500) : []; socRenderList(); socRenderHead(); socFlushAll(); socPresence(); return; }
  if (m.t === 'msg' && m.m) {
    if (socHallAdd(m.m)) { socSave(); if (SOC.cur === 'hall') socRenderLog(true); }
  }
}
function socHallAdd(x, quiet) {
  if (!x || typeof x !== 'object' || !x.id || SOC.hist.some(h => h.id === x.id)) return false;
  const m = { id: String(x.id).slice(0, 24), from: String(x.from || '').slice(0, 12), text: socClean(x.text), at: +x.at || Date.now() };
  if (!m.from || !m.text) return false;
  SOC.hist.push(m); SOC.hist.sort((a, b) => a.at - b.at);
  if (SOC.hist.length > SOC_MAX_HALL) SOC.hist.splice(0, SOC.hist.length - SOC_MAX_HALL);
  if (!quiet && (SOC.cur !== 'hall' || !socVisible()) && m.from !== SOC.me) SOC.data.unread.hall = Math.min(99, (SOC.data.unread.hall || 0) + 1);
  return true;
}
function socHallSay(text) {
  text = socClean(text);
  if (!text) return false;
  if (!socSend(SOC.hall, { t: 'say', text })) { toast('大厅还没连上，稍等一下再发'); return false; }
  return true;
}

/* ---------- 私聊、群聊：直连 + 发件箱 ---------- */
function socWireIn(c) {
  const name = typeof p2pName === 'function' ? p2pName(c.metadata && c.metadata.name, '') : '';
  if (!name || !socIdOk(c.peer, name) || name === SOC.me) { setTimeout(() => { try { c.close(); } catch (e) {} }, 100); return; }
  const old = SOC.conns.get(name);
  SOC.conns.set(name, c);
  if (old && old !== c) { try { old.close(); } catch (e) {} }
  socWire(c, name);
}
function socWire(c, name) {
  const sess = SOC.sess;
  c._t = c._t || Date.now();
  c.on('open', () => { if (sess === SOC.sess) socFlush(name); });
  c.on('data', d => { if (sess === SOC.sess) { c._rx = Date.now(); socRx(name, socParse(d)); } });
  c.on('close', () => { if (SOC.conns.get(name) === c) SOC.conns.delete(name); });
  c.on('error', () => {});
  if (c.open) socFlush(name);
}
function socConnTo(name) {
  const old = SOC.conns.get(name);
  if (old && (old.open || Date.now() - (old._t || 0) < 10000)) return old;
  if (!SOC.peer || SOC.peer.destroyed || SOC.peer.disconnected || SOC.alt) return null;
  let c;
  try { c = SOC.peer.connect(socUid(name), { reliable: true, metadata: { name: SOC.me } }); } catch (e) { return null; }
  c._t = Date.now();
  SOC.conns.set(name, c); socWire(c, name);
  return c;
}
// 存进发件箱再试着发；对方回 ack 才删
function socQueue(to, pkt) {
  if (!to || to === SOC.me) return;
  pkt.id = pkt.id || socRid(); pkt.from = SOC.me; pkt.v = SOC.ver;
  (SOC.data.outbox[to] = SOC.data.outbox[to] || []).push(pkt);
  if (SOC.data.outbox[to].length > 300) SOC.data.outbox[to].splice(0, SOC.data.outbox[to].length - 300);
  socSave(); socFlush(to);
}
function socFlush(to) {
  const box = SOC.data && SOC.data.outbox[to];
  if (!box || !box.length) return;
  const c = SOC.conns.get(to);
  if (c && c.open) {
    // 发过却 20 秒没回音：这条直连多半已经断了，换一条
    if (box.some(p => p._s && Date.now() - p._s > 20000) && Date.now() - (c._rx || c._t || 0) > 20000) { SOC.conns.delete(to); try { c.close(); } catch (e) {} if (SOC.online.includes(to)) socConnTo(to); return; }
    for (const p of box) { if (!p._s) p._s = Date.now(); socSend(c, p); }
    return;
  }
  // 只在对方在线（大厅名单里有他）时才去连，免得一直敲门
  if (SOC.online.includes(to)) socConnTo(to);
}
function socFlushAll() { if (SOC.data) for (const n of Object.keys(SOC.data.outbox)) socFlush(n); }
function socRx(name, m) {
  if (!m || !m.t) return;
  const D = SOC.data, c = SOC.conns.get(name);
  if (m.t === 'ack') {
    const ids = new Set(Array.isArray(m.ids) ? m.ids : []);
    if (D.outbox[name]) { D.outbox[name] = D.outbox[name].filter(p => !ids.has(p.id)); if (!D.outbox[name].length) delete D.outbox[name]; }
    for (const k of Object.keys(D.convs)) for (const x of D.convs[k]) if (ids.has(x.id) && x.from === SOC.me) x.ok = 1;
    socSave(); socRenderLog(false); return;
  }
  const ack = () => socSend(c, { t: 'ack', ids: [m.id] });
  if (!m.id) return;
  const id = String(m.id).slice(0, 24), at = Math.min(Date.now(), +m.at || Date.now());
  let changed = false, note = '';
  if (m.t === 'freq') {
    if (D.friends[name]) socQueue(name, { t: 'facc' });           // 已经是好友了（比如对方清了存档）：直接回同意
    else if (D.reqOut[name]) { delete D.reqOut[name]; D.friends[name] = { since: Date.now() }; socQueue(name, { t: 'facc' }); note = `你和 ${name} 成为好友了`; }
    else if (!D.reqIn[name]) { D.reqIn[name] = at; note = `${name} 想加你为好友`; }
    changed = true;
  } else if (m.t === 'facc') {
    if (D.reqOut[name] || !D.friends[name]) { delete D.reqOut[name]; delete D.reqIn[name]; D.friends[name] = { since: Date.now() }; note = `${name} 通过了你的好友申请`; changed = true; }
  } else if (m.t === 'fdel') {
    delete D.friends[name]; delete D.reqIn[name]; delete D.reqOut[name]; changed = true;
  } else if (m.t === 'dm') {
    if (D.friends[name]) {
      const text = socClean(m.text);
      if (text && socPush('u:' + name, { id, from: name, text, at })) { changed = true; note = `${name}：${text}`; }
    }
  } else if (m.t === 'ginv' || m.t === 'gupd') {
    const g = m.g || {}, gid = String(g.id || '').slice(0, 24);
    const members = [...new Set((Array.isArray(g.members) ? g.members : []).map(x => p2pName(x, '')).filter(Boolean))].slice(0, 30);
    if (gid && members.includes(name) && members.includes(SOC.me)) {
      const cur = D.groups[gid];
      if (!cur && m.t === 'ginv' && D.friends[name]) {             // 只接受好友拉的群
        D.groups[gid] = { name: socClean(g.name).slice(0, 16) || '群聊', members, owner: p2pName(g.owner, name) };
        socPush('g:' + gid, { id, from: '', sys: 1, text: `${name} 把你拉进了群`, at });
        note = `${name} 把你拉进了群「${D.groups[gid].name}」`; changed = true;
      } else if (cur && cur.members.includes(name)) {
        cur.members = [...new Set(cur.members.concat(members))].slice(0, 30);
        changed = true;
      }
    }
  } else if (m.t === 'gleave') {
    const g = D.groups[String(m.gid || '')];
    if (g && g.members.includes(name)) { g.members = g.members.filter(x => x !== name); socPush('g:' + m.gid, { id, from: '', sys: 1, text: `${name} 退出了群`, at }); changed = true; }
  } else if (m.t === 'gmsg') {
    const gid = String(m.gid || ''), g = D.groups[gid];
    if (g && g.members.includes(name)) {
      const text = socClean(m.text);
      if (text && socPush('g:' + gid, { id, from: name, text, at })) { changed = true; note = `${name}@${g.name}：${text}`; }
    }
  }
  ack();
  if (changed) { socSave(); socRenderAll(); }
  if (note && !socVisible()) { toast(note.length > 40 ? note.slice(0, 40) + '…' : note); if (typeof SFX !== 'undefined' && SFX.ui) SFX.ui(); }
}

/* ---------- 操作 ---------- */
function socAddFriend(raw) {
  if (socGuestNow()) { toast('登录后才能加好友'); return; }
  const name = p2pName(raw, '');
  const D = SOC.data;
  if (!name) { toast('输入对方的名字'); return; }
  if (name === SOC.me) { toast('不能加自己'); return; }
  if (D.friends[name]) { socOpen('u:' + name); return; }
  if (D.reqIn[name]) { socAccept(name); return; }
  D.reqOut[name] = Date.now();
  socQueue(name, { t: 'freq' });
  toast(SOC.online.includes(name) ? `已向 ${name} 发出好友申请` : `已发出申请，${name} 上线后会收到`);
  socRenderAll();
}
// 搜人：输入的每个字名字里都要有（不分先后），连在一起出现的排前面
function socNamePool() {
  const D = SOC.data || { friends: {}, reqIn: {}, reqOut: {}, convs: {}, groups: {} }, set = new Set(SOC.online);
  for (const m of SOC.hist) set.add(m.from);
  for (const n of [...Object.keys(D.friends), ...Object.keys(D.reqIn), ...Object.keys(D.reqOut)]) set.add(n);
  for (const k of Object.keys(D.convs)) if (k.startsWith('u:')) set.add(k.slice(2));
  for (const g of Object.values(D.groups)) for (const n of g.members || []) set.add(n);
  if (typeof LEGACY_USERS !== 'undefined') for (const u of LEGACY_USERS) set.add(u.name);
  set.delete(SOC.me); set.delete('');
  return [...set];
}
function socSearch(q) {
  q = String(q || '').trim().toLowerCase();
  const chars = [...new Set([...q].filter(ch => ch.trim()))];
  if (!chars.length) return [];
  const on = new Set(SOC.online);
  return socNamePool().filter(n => { const l = n.toLowerCase(); return chars.every(ch => l.includes(ch)); })
    .sort((a, b) => (b.toLowerCase().includes(q) - a.toLowerCase().includes(q)) || (on.has(b) - on.has(a)) || a.length - b.length || a.localeCompare(b, 'zh'))
    .slice(0, 8);
}
function socRenderFind() {
  const el = $id('socFind'); if (!el) return;
  const q = $id('socAddIn').value.trim(), res = SOC.data ? socSearch(q) : [];
  el.hidden = !q;
  if (!q) { el.innerHTML = ''; return; }
  const D = SOC.data, on = new Set(SOC.online);
  el.innerHTML = res.length ? res.map(n => {
    const tag = D.friends[n] ? '好友' : D.reqOut[n] ? '已申请' : D.reqIn[n] ? '想加你' : on.has(n) ? '在线' : '';
    const btn = D.friends[n] ? '聊天' : D.reqIn[n] ? '同意' : D.reqOut[n] ? '' : '加好友';
    return `<div class="soc-fr"><span class="soc-on${on.has(n) ? ' y' : ''}"></span><b>${escapeHTML(n)}</b>${tag ? `<small>${tag}</small>` : ''}${btn ? `<button type="button" class="go small" data-fadd="${escapeHTML(n)}">${btn}</button>` : ''}</div>`;
  }).join('') : uiState('empty', `没找到名字里同时有「${q}」这几个字的人，按回车按全名加`, 'soc-empty');
}
function socAddTyped() {
  const q = $id('socAddIn').value.trim(); if (!q) return;
  const res = socSearch(q), exact = res.find(n => n.toLowerCase() === q.toLowerCase());
  socAddFriend(exact || (res.length === 1 ? res[0] : q));
  $id('socAddIn').value = ''; socRenderFind();
}
function socAccept(name) {
  const D = SOC.data;
  delete D.reqIn[name]; D.friends[name] = { since: Date.now() };
  socQueue(name, { t: 'facc' }); socSave(); socOpen('u:' + name);
}
function socDecline(name) { delete SOC.data.reqIn[name]; socSave(); socRenderAll(); }
async function socRemoveFriend(name) {
  if (!await uiConfirm(`删除好友 ${name}？聊天记录也会一起清掉。`, { ok: '删除', danger: true })) return;
  const D = SOC.data;
  delete D.friends[name]; delete D.convs['u:' + name]; delete D.unread['u:' + name];
  D.outbox[name] = (D.outbox[name] || []).filter(p => p.t !== 'dm');
  socQueue(name, { t: 'fdel' });
  socOpen('hall');
}
function socMakeGroup() {
  if (socGuestNow()) { toast('登录后才能建群'); return; }
  const fs = Object.keys(SOC.data.friends);
  if (!fs.length) { toast('先加几个好友再建群'); return; }
  socPick('建群：选几个好友', fs, [], true, (picked, gname) => {
    if (!picked.length) return;
    const gid = 'g' + socRid(), members = [SOC.me, ...picked];
    const g = SOC.data.groups[gid] = { name: gname || members.slice(0, 3).join('、').slice(0, 16), members, owner: SOC.me };
    socPush('g:' + gid, { id: socRid(), from: '', sys: 1, text: '群建好了，邀请已发出', at: Date.now() });
    for (const n of picked) socQueue(n, { t: 'ginv', g: { id: gid, name: g.name, members, owner: SOC.me } });
    socOpen('g:' + gid);
  });
}
function socInvite(gid) {
  const g = SOC.data.groups[gid]; if (!g) return;
  const fs = Object.keys(SOC.data.friends).filter(n => !g.members.includes(n));
  if (!fs.length) { toast('好友都已经在群里了'); return; }
  socPick('拉好友进群', fs, [], false, picked => {
    if (!picked.length) return;
    const old = g.members.slice();
    g.members = [...new Set(g.members.concat(picked))].slice(0, 30);
    const pkt = () => ({ g: { id: gid, name: g.name, members: g.members, owner: g.owner } });
    for (const n of picked) socQueue(n, Object.assign({ t: 'ginv' }, pkt()));
    for (const n of old) if (n !== SOC.me) socQueue(n, Object.assign({ t: 'gupd' }, pkt()));
    socPush('g:' + gid, { id: socRid(), from: '', sys: 1, text: `你邀请了 ${picked.join('、')}`, at: Date.now() });
    socRenderAll();
  });
}
async function socLeave(gid) {
  const g = SOC.data.groups[gid]; if (!g) return;
  if (!await uiConfirm(`退出群「${g.name}」？`, { ok: '退出', danger: true })) return;
  if (!SOC.data.groups[gid]) return;   // 确认框开着的时候群可能已经没了
  for (const n of g.members) if (n !== SOC.me) socQueue(n, { t: 'gleave', gid });
  delete SOC.data.groups[gid]; delete SOC.data.convs['g:' + gid]; delete SOC.data.unread['g:' + gid];
  socOpen('hall');
}
function socSendCur(text) {
  text = socClean(text);
  if (!text) return false;
  const k = SOC.cur;
  if (k === 'hall') return socHallSay(text);
  const now = Date.now();
  if (now - SOC.lastSay < 350) return false;
  SOC.lastSay = now;
  const id = socRid();
  if (k.startsWith('u:')) {
    const to = k.slice(2);
    if (!SOC.data.friends[to]) { toast('对方已经不是你的好友了'); return false; }
    socPush(k, { id, from: SOC.me, text, at: now });
    socQueue(to, { t: 'dm', id, text, at: now });
  } else {
    const gid = k.slice(2), g = SOC.data.groups[gid]; if (!g) return false;
    socPush(k, { id, from: SOC.me, text, at: now, ok: 1 });
    for (const n of g.members) if (n !== SOC.me) socQueue(n, { t: 'gmsg', gid, id, text, at: now });
  }
  socRenderLog(true); socRenderList();
  return true;
}

/* ---------- 界面 ---------- */
const socVisible = () => !!($id('community') && $id('community').classList.contains('on') && !document.hidden);
function socFmt(text) {
  return escapeHTML(text).replace(/\[e:([a-z]+)\]/g, (m, id) => EMO[id] ? `<span class="emo" title="${EMO[id].name}">${EMO[id].svg}</span>` : m);
}
function socTime(at) {
  const d = new Date(at), now = new Date(), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === now.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
function socUnreadTotal() {
  if (!SOC.data) return 0;
  let n = Object.keys(SOC.data.reqIn).length;
  for (const k in SOC.data.unread) if (k !== 'hall') n += SOC.data.unread[k] || 0;
  return n;
}
function socRenderBadge() {
  const n = socUnreadTotal();
  for (const b of document.querySelectorAll('[data-nav="community"], #menu [data-go="community"]')) {
    let s = b.querySelector('.soc-dot');
    if (!n) { if (s) s.remove(); continue; }
    if (!s) { s = document.createElement('span'); s.className = 'soc-dot'; b.appendChild(s); }
    s.textContent = n > 99 ? '99+' : n;
  }
}
function socStateText() {
  if (SOC.state === 'on') return `${SOC.online.length} 人在线`;
  if (SOC.state !== 'connecting') return '未连接';
  const p = SOC.peer;
  if (p && p.open) return SOC.slot ? `正在换大厅（${SOC.slot + 1} 号）…` : '正在进大厅…';
  return Date.now() - SOC.startAt > 12000 ? '连不上牵线服务器，检查网络' : '连接中…';
}
function socRenderStatus() {
  const el = $id('socStatus'); if (!el) return;
  el.className = 'soc-status ' + (SOC.state === 'on' ? 'on' : SOC.state === 'connecting' && Date.now() - SOC.startAt > 12000 && !(SOC.peer && SOC.peer.open) ? 'bad' : '');
  el.textContent = socStateText();
}
function socItem(key, label, sub, dot, extra) {
  const un = SOC.data.unread[key] || 0;
  return `<button type="button" class="soc-it${SOC.cur === key ? ' sel' : ''}" data-k="${escapeHTML(key)}">${dot !== undefined ? `<i class="soc-on${dot ? ' y' : ''}"></i>` : ''}<span class="soc-n"><b>${escapeHTML(label)}</b>${sub ? `<small>${escapeHTML(sub)}</small>` : ''}</span>${extra || ''}${un ? `<em>${un > 99 ? '99+' : un}</em>` : ''}</button>`;
}
function socLastText(key) {
  const c = SOC.data.convs[key]; if (!c || !c.length) return '';
  const m = c[c.length - 1]; return (m.sys ? '' : m.from === SOC.me ? '我：' : key.startsWith('g:') ? m.from + '：' : '') + m.text.replace(/\[e:[a-z]+\]/g, '[表情]');
}
function socRenderList() {
  const el = $id('socList'); if (!el || !SOC.data) return;
  const D = SOC.data, on = new Set(SOC.online);
  let h = socItem('hall', '江湖大厅', socStateText());
  const reqs = Object.keys(D.reqIn);
  if (reqs.length) h += `<div class="soc-sec">好友申请</div>` + reqs.map(n => `<div class="soc-req"><span>${escapeHTML(n)}</span><button type="button" class="go small" data-acc="${escapeHTML(n)}">同意</button><button type="button" class="ghost small" data-dec="${escapeHTML(n)}">忽略</button></div>`).join('');
  const fs = Object.keys(D.friends).sort((a, b) => (on.has(b) - on.has(a)) || a.localeCompare(b, 'zh'));
  h += `<div class="soc-sec">好友 <span>${fs.length}</span></div>`;
  h += fs.length ? fs.map(n => socItem('u:' + n, n, socLastText('u:' + n) || (on.has(n) ? '在线' : '离线'), on.has(n))).join('') : uiState('empty', socGuestNow() ? '登录后可以加好友' : '还没有好友，在下面输入名字添加', 'soc-empty');
  const out = Object.keys(D.reqOut);
  if (out.length) h += out.map(n => `<div class="soc-wait">${escapeHTML(n)} <small>等对方通过</small></div>`).join('');
  const gs = Object.keys(D.groups);
  h += `<div class="soc-sec">群聊 <span>${gs.length}</span></div>`;
  h += gs.length ? gs.map(g => socItem('g:' + g, D.groups[g].name, socLastText('g:' + g) || `${D.groups[g].members.length} 人`)).join('') : uiState('empty', '还没有群', 'soc-empty');
  el.innerHTML = h;
  socRenderBadge();
}
function socRenderHead() {
  const el = $id('socHead'); if (!el || !SOC.data) return;
  const k = SOC.cur, on = new Set(SOC.online);
  if (k === 'hall') {
    el.innerHTML = `<b>江湖大厅</b><small>所有在线玩家都能看到，点名字可以加好友</small>`;
  } else if (k.startsWith('u:')) {
    const n = k.slice(2), pend = (SOC.data.outbox[n] || []).filter(p => p.t === 'dm').length;
    el.innerHTML = `<b>${escapeHTML(n)}</b><small>${on.has(n) ? '在线' : '离线'}${pend ? ` · ${pend} 条等对方上线后送达` : ''}</small><span class="soc-acts"><button type="button" class="ghost small" data-act="unfriend">删除好友</button></span>`;
  } else {
    const g = SOC.data.groups[k.slice(2)];
    if (!g) { socOpen('hall'); return; }
    el.innerHTML = `<b>${escapeHTML(g.name)}</b><small>${g.members.map(n => (n === SOC.me ? '我' : n) + (n !== SOC.me && on.has(n) ? '·在线' : '')).map(escapeHTML).join('、')}</small><span class="soc-acts"><button type="button" class="ghost small" data-act="invite">拉人</button><button type="button" class="ghost small" data-act="leave">退群</button></span>`;
  }
  const inp = $id('comIn');
  if (inp) {
    const off = k === 'hall' && SOC.state !== 'on';
    inp.placeholder = off ? '正在连接大厅…' : k === 'hall' ? '在大厅说点什么（回车发送）' : k.startsWith('u:') ? `发给 ${k.slice(2)}（回车发送）` : '发到群里（回车发送）';
  }
}
function socRenderLog(keepBottom) {
  const log = $id('comLog'); if (!log || !SOC.data) return;
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
  const k = SOC.cur, list = k === 'hall' ? SOC.hist : (SOC.data.convs[k] || []);
  const fr = SOC.data.friends, guest = socGuestNow();
  if (!list.length) {
    log.innerHTML = k === 'hall' && SOC.state !== 'on' ? uiState('loading', '正在连接大厅…', 'soc-none') : uiState('empty', k === 'hall' ? '大厅里还没人说话，来说第一句吧' : '还没有消息，打个招呼吧', 'soc-none');
  } else {
    log.innerHTML = list.map(m => {
      if (m.sys) return `<div class="cm sys">${escapeHTML(m.text)}<span class="ct">${socTime(m.at)}</span></div>`;
      const mine = m.from === SOC.me;
      const add = k === 'hall' && !mine && !guest && !fr[m.from] && !/^游客\d{4}$/.test(m.from) ? `<button type="button" class="soc-add" data-add="${escapeHTML(m.from)}">+好友</button>` : '';
      const st = mine && k.startsWith('u:') ? (m.ok ? '' : '<span class="soc-pend" title="对方上线后送达">未送达</span>') : '';
      return `<div class="cm${mine ? ' me' : ''}"><div class="cm-head"><span class="cn">${escapeHTML(mine ? '我' : m.from)}${add}</span><span class="ct">${st}${socTime(m.at)}</span></div><div class="cm-body">${socFmt(m.text)}</div></div>`;
    }).join('');
  }
  if (!keepBottom || atBottom || keepBottom === 'force') log.scrollTop = log.scrollHeight;
}
function socRenderAll() { if (!SOC.data) return; socRenderStatus(); socRenderList(); if ($id('socHead')) { socRenderHead(); socRenderLog(true); } }
function socOpen(key) {
  SOC.cur = key;
  if (SOC.data) { delete SOC.data.unread[key]; socSave(); }
  socRenderStatus(); socRenderList(); socRenderHead(); socRenderLog('force');
  const box = $id('community'); if (box) box.classList.add('soc-chat');
}
// 选好友的小窗：建群和拉人共用
function socPick(title, names, sel, askName, done) {
  const wrap = document.createElement('div'); wrap.className = 'soc-pick';
  wrap.innerHTML = `<div class="soc-pk"><h3>${escapeHTML(title)}</h3>${askName ? '<input class="soc-gname" maxlength="16" placeholder="群名（可不填）">' : ''}<div class="soc-pl">${names.map(n => `<label><input type="checkbox" value="${escapeHTML(n)}"${sel.includes(n) ? ' checked' : ''}> ${escapeHTML(n)}${SOC.online.includes(n) ? ' <small>在线</small>' : ''}</label>`).join('')}</div><div class="row"><button type="button" class="ghost small" data-x>取消</button><button type="button" class="go small" data-ok>确定</button></div></div>`;
  $id('community').appendChild(wrap);
  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.closest('[data-x]')) { wrap.remove(); return; }
    if (e.target.closest('[data-ok]')) {
      const picked = [...wrap.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
      const gn = askName ? socClean(wrap.querySelector('.soc-gname').value).slice(0, 16) : '';
      wrap.remove(); done(picked, gn);
    }
  });
}
function openCommunity() {
  if (!$id('comEmo').innerHTML) $id('comEmo').innerHTML = EMOTES.map(e => `<button data-e="${e.id}" title="${e.name}" aria-label="${e.name}">${e.svg}</button>`).join('');
  socStart();
  $id('socAddIn').disabled = socGuestNow(); $id('socAddBtn').disabled = socGuestNow(); $id('socGroupBtn').disabled = socGuestNow();
  $id('socAddIn').placeholder = socGuestNow() ? '登录后可以加好友' : '输入几个字搜人加好友';
  socOpen(SOC.cur || 'hall');
  $id('community').classList.remove('soc-chat');
}
function postRoomToCommunity() {
  const code = (NET.code || ($id('roomCode') && $id('roomCode').textContent) || '').trim();
  if (!code) { toast('请先设擂建房生成房间码'); return; }
  if (socHallSay(`【约战】房间码「${code}」，来切磋！[e:fight]`)) toast('房间码已发到江湖大厅');
}

$id('comSend').addEventListener('click', () => { if (socSendCur($id('comIn').value)) $id('comIn').value = ''; });
$id('comIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { if (socSendCur($id('comIn').value)) $id('comIn').value = ''; } });
$id('comEmo').addEventListener('click', e => { const b = e.target.closest('button'); if (b) socSendCur(`[e:${b.dataset.e}]`); });
$id('socList').addEventListener('click', e => {
  const a = e.target.closest('[data-acc]'), d = e.target.closest('[data-dec]'), it = e.target.closest('[data-k]');
  if (a) socAccept(a.dataset.acc); else if (d) socDecline(d.dataset.dec); else if (it) socOpen(it.dataset.k);
});
$id('comLog').addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) socAddFriend(b.dataset.add); });
$id('socHead').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const k = SOC.cur;
  if (b.dataset.act === 'unfriend') socRemoveFriend(k.slice(2));
  else if (b.dataset.act === 'invite') socInvite(k.slice(2));
  else if (b.dataset.act === 'leave') socLeave(k.slice(2));
});
$id('socAddBtn').addEventListener('click', socAddTyped);
$id('socAddIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) socAddTyped(); else if (e.key === 'Escape') { $id('socAddIn').value = ''; socRenderFind(); } });
$id('socAddIn').addEventListener('input', socRenderFind);
$id('socFind').addEventListener('click', e => { const b = e.target.closest('[data-fadd]'); if (b) { socAddFriend(b.dataset.fadd); $id('socAddIn').value = ''; socRenderFind(); } });
$id('socGroupBtn').addEventListener('click', socMakeGroup);
$id('socBackList').addEventListener('click', () => $id('community').classList.remove('soc-chat'));
if ($id('postToComBtn')) $id('postToComBtn').addEventListener('click', postRoomToCommunity);

// 打开游戏就挂上线（这样好友能看到你在线、消息能送到）；换账号时重连
if (!(window.RENYING_BUILD && window.RENYING_BUILD.offline)) {
  setTimeout(socStart, 2500);
  setInterval(() => {
    const p = SOC.peer, t = ++SOC.tick;
    // 打架的时候以前是整段 return：一进对局就不发心跳，15 秒后被主持从名单里清掉，
    // 别人看在线人数就只剩自己（“明明一堆人在打，却显示 1 人”）。现在只停掉重连、聊天，
    // 心跳和名单清理照做——一个 ping 几十字节，不影响手感。
    const busy = typeof M !== 'undefined' && M && M.phase === 'fight' && !socVisible();
    if (!busy) {
      if ((p && SOC.me !== socWho()) || ((!p || p.destroyed) && t % 15 === 0)) socStart();
      else if (p && t % 5 === 0) {   // 断网恢复后自己重连、重新进大厅
        if (p.disconnected && !p.destroyed) { try { p.reconnect(); } catch (e) {} }
        else if (p.open && !(SOC.hall && SOC.hall.open) && !SOC.hubPeer) socJoinHall();
      }
    }
    if (SOC.hall && SOC.hall.open) { if (Date.now() - (SOC.hallRx || 0) > 12000) socHallLost(SOC.hall); else if (t % 2 === 0) socSend(SOC.hall, { t: 'ping' }); }
    if (SOC.hubPeer && t % 3 === 0) socHubSweep();
    if (busy) return;
    if (SOC.hubPeer && SOC.slot && t % 15 === 0) socProbe();
    if (SOC.state !== 'on' && SOC.data) { socRenderStatus(); if (t % 3 === 0) socRenderList(); }
    if (SOC.data && t % 10 === 0) socFlushAll();
    if (SOC.data) socRenderBadge();
  }, 2000);
  // 关网页时：主持先跟大家道别（大家马上重新找主持），再把 id 还给牵线服务器
  window.addEventListener('pagehide', () => {
    if (SOC.hubPeer) socHubCast({ t: 'bye' });
    setTimeout(() => { try { socHubStop(); if (SOC.peer) SOC.peer.destroy(); } catch (e) {} }, 0);
  });
  document.addEventListener('visibilitychange', () => { if (socVisible() && SOC.data) { delete SOC.data.unread[SOC.cur]; socRenderList(); } });
}
