/* ---------------- 同袍肉鸽：两到四人一起闯同一张路线图 ----------------
   房主的网页说了算：路线、出敌、敌人的一举一动都在房主这边算，每秒十五次发给同袍；
   每个人只管自己的剑：自己砍中了敌人，把伤害报给房主；敌人的刀砍到谁，房主告诉谁，由那人自己的网页判定弹反、闪避。
   飞行物和地面预警每台都放一份，各自只算打没打中自己。
   直连走 PeerJS（和刃影同一套），房主用「前缀 + 4 位房间码」登记，同袍按房间码找过来。
   每多一位同袍：敌人气血 +35%（首领 +45%）、伤害 +6%，每拨多约两成人。 */
const COOP_V = 1, COOP_MAX = 4, COOP_PREFIX = 'qfx-coop-';
const COOP_ICE = [
  { urls: 'stun:stun.qq.com:3478' }, { urls: 'stun:stun.miwifi.com:3478' }, { urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];
/* 同袍的衣色：0 号是房主 */
const COOP_COLORS = [
  { robe: 0xeeebe4, coat: 0xd3e2dc, accent: 0xb3261e, jade: 0x7fd8b8 },
  { robe: 0x2f5d62, coat: 0x9cc7c0, accent: 0xe0b24a, jade: 0xf0e2b6 },
  { robe: 0x8a2c25, coat: 0xd9a48c, accent: 0x1c1a18, jade: 0xffd38a },
  { robe: 0x2b2a33, coat: 0x6f6a80, accent: 0x7fd8b8, jade: 0xb7a6ff },
];
const COOP_TAG = ['#e9dfc8', '#7fd8c8', '#ff8a6a', '#b7a6ff'];
const Net = {
  on: false, host: false, me: 0, code: '', started: false, peer: null, link: null, links: new Map(),
  players: [], ghosts: new Map(), byId: new Map(), nid: 1, sendT: 0, snapT: 0, tgt: null, ready: new Set(), votes: {}, mapAt: 0, revT: {},
};
const coopN = () => Net.on ? Math.max(1, Net.players.length) : 1;
const coopName = id => (Net.players.find(p => p.id === id) || {}).name || '同袍';
const coopSlot = id => Math.max(0, Net.players.findIndex(p => p.id === id));

/* ---------- 传输：PeerJS；调试时可换成同一浏览器里的 BroadcastChannel ---------- */
function coopLoadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
async function coopPeerLib() {
  if (window.Peer) return window.Peer;
  try { if (parent !== window && parent.Peer) return parent.Peer; } catch (_) {}
  for (const src of ['peerjs.min.js', 'assets/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js']) {
    try { await coopLoadScript(src); if (window.Peer) return window.Peer; } catch (_) {}
  }
  throw new Error('联机组件没加载上，检查一下网络');
}
/* 刃影的服务器能发中转（TURN）凭据：在刃影里打开时借来用，打不通直连的网络（校园网等）也能走中转 */
async function coopIce() {
  let base = ''; try { const cs = window.CloudSave || (parent !== window && parent.CloudSave); base = cs && cs.getEndpoint ? cs.getEndpoint() || '' : ''; } catch (_) {}
  if (!base || typeof fetch !== 'function') return COOP_ICE;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 2500);
  try { const r = await fetch(base + '/api/ice', { signal: ac.signal }), d = r.ok ? await r.json() : null; if (d && Array.isArray(d.iceServers) && d.iceServers.length) return d.iceServers.filter(x => x && x.urls).concat(COOP_ICE); } catch (_) {} finally { clearTimeout(t); }
  return COOP_ICE;
}
const coopPeerOpts = async () => { let u = window.QFX_P2P; try { u = u || (parent !== window && parent.RENYING_P2P); } catch (_) {} return Object.assign({ debug: 0, config: { iceServers: await coopIce() } }, u || {}); };
function coopWrap(c) {
  const L = { send: m => { try { if (c.open) c.send(m); } catch (_) {} }, close: () => { try { c.close(); } catch (_) {} }, onmsg: null, onclose: null, dead: false };
  const bye = () => { if (L.dead) return; L.dead = true; if (L.onclose) L.onclose(); };
  c.on('data', m => { if (m && typeof m === 'object' && L.onmsg) L.onmsg(m); }); c.on('close', bye); c.on('error', bye);
  return L;
}
const CoopPJ = {
  async host(code, onConn, done) {
    const P = await coopPeerLib(), peer = new P(COOP_PREFIX + code, await coopPeerOpts());
    peer.on('open', () => done(null)); peer.on('error', e => done(e && e.type === 'unavailable-id' ? 'taken' : (e && e.type) || 'error'));
    peer.on('connection', c => c.on('open', () => { if (c._qfx) return; c._qfx = 1; onConn(coopWrap(c)); }));   // 有的版本 open 会报两次
    return { close: () => { try { peer.destroy(); } catch (_) {} } };
  },
  async join(code, done) {
    const P = await coopPeerLib(), peer = new P(await coopPeerOpts()); let fin = false; const end = (e, L) => { if (fin) return; fin = true; done(e, L); };
    peer.on('error', e => end(e && e.type === 'peer-unavailable' ? 'nohost' : (e && e.type) || 'error'));
    peer.on('open', () => { const c = peer.connect(COOP_PREFIX + code, { reliable: true, serialization: 'json' }); c.on('open', () => end(null, coopWrap(c))); });
    setTimeout(() => end('timeout'), 20000);
    return { close: () => { try { peer.destroy(); } catch (_) {} } };
  },
};
const CoopBC = {
  async host(code, onConn, done) {
    const ch = new BroadcastChannel('qfxbc-' + code), links = new Map();
    ch.onmessage = ev => { const { from, to, m } = ev.data || {}; if (to !== 'H') return; let L = links.get(from);
      if (!L) { if (!m || m.t !== 'hello') return; L = { send: x => ch.postMessage({ from: 'H', to: from, m: x }), close() { ch.postMessage({ from: 'H', to: from, m: { t: 'bye' } }); }, onmsg: null, onclose: null }; links.set(from, L); onConn(L); }
      if (m.t === 'bye') { links.delete(from); if (L.onclose) L.onclose(); return; } if (L.onmsg) L.onmsg(m); };
    setTimeout(() => done(null), 0); return { close: () => ch.close() };
  },
  async join(code, done) {
    const id = 'c' + Math.random().toString(36).slice(2, 8), ch = new BroadcastChannel('qfxbc-' + code);
    const L = { send: m => ch.postMessage({ from: id, to: 'H', m }), close() { ch.postMessage({ from: id, to: 'H', m: { t: 'bye' } }); }, onmsg: null, onclose: null };
    ch.onmessage = ev => { const d = ev.data || {}; if (d.to !== id) return; if (d.m && d.m.t === 'bye') { if (L.onclose) L.onclose(); return; } if (L.onmsg) L.onmsg(d.m); };
    setTimeout(() => done(null, L), 0); return { close: () => ch.close() };
  },
};
const coopT = () => dbg('coopBC') ? CoopBC : CoopPJ;

/* ---------- 收发 ---------- */
Net.send = m => { if (!Net.on) return; if (Net.host) Net.recv(0, m); else if (Net.link) Net.link.send(m); };   // 同袍 → 房主
Net.bcast = (m, skip) => { for (const [id, L] of Net.links) if (id !== skip) L.send(m); };                        // 房主 → 所有同袍
Net.sendTo = (id, m) => { if (id === Net.me) Net.onMsg(m); else { const L = Net.links.get(id); if (L) L.send(m); } };
Net.lobby = () => { const m = { t: 'lob', ps: Net.players, code: Net.code }; Net.bcast(m); coopLobbyUI(); };

/* 建房：随机四位房间码，被占了就换一个 */
async function coopHost() {
  coopLeave(); coopSaveName(); Net.host = true; Net.me = 0; Net.players = [{ id: 0, name: coopMyName() }]; coopMsg('正在登记房间……');
  for (let k = 0; k < 4; k++) {
    const code = String(randi(1000, 9999)); let err;
    try { Net.peer = await coopT().host(code, coopOnConn, e => { err = e; coopHostDone(code, e); }); } catch (e) { coopMsg(e.message || '建房失败'); Net.host = false; return; }
    await new Promise(r => setTimeout(r, 30)); if (err !== 'taken') return; Net.peer.close();
  }
}
function coopHostDone(code, e) {
  if (e === 'taken') return; if (e) { coopMsg('建房失败：' + e + '。换个网络再试试'); Net.on = false; Net.host = false; return; }
  Net.on = true; Net.code = code; coopBeatOn(); coopMsg('把房间码告诉同袍，人齐了点「开局」'); coopLobbyUI();
}
let coopNextId = 1;
function coopOnConn(L) {
  L.seen = performance.now();
  L.onmsg = m => {
    L.seen = performance.now();
    if (m.t === 'hello') {
      if (m.v !== COOP_V) { L.send({ t: 'deny', why: '版本不一致，双方都刷新一下网页' }); return; }
      if (Net.started) { L.send({ t: 'deny', why: '这一局已经开打了' }); return; }
      if (Net.players.length >= COOP_MAX) { L.send({ t: 'deny', why: '房间满了（最多四人）' }); return; }
      const id = coopNextId++; L.id = id; Net.links.set(id, L); Net.players.push({ id, name: String(m.name || '同袍').slice(0, 8) });
      L.send({ t: 'wel', id }); Net.lobby(); Snd.ui(); return;
    }
    if (L.id) Net.recv(L.id, m);
  };
  L.onclose = () => { if (!L.id) return; Net.links.delete(L.id); coopDrop(L.id); };
}
async function coopJoin(code) {
  code = String(code || '').replace(/\D/g, ''); if (code.length !== 4) { coopMsg('房间码是四位数字'); return; }
  coopLeave(); coopSaveName(); coopMsg('正在找房间……');
  try {
    Net.peer = await coopT().join(code, (e, L) => {
      if (e) { coopMsg(e === 'nohost' ? '没找到这个房间，核对一下房间码' : e === 'timeout' ? '连不上房主，可能是网络不通' : '加入失败：' + e); return; }
      Net.link = L; Net.code = code; Net.host = false; Net.on = true;
      Net.hostSeen = performance.now(); coopBeatOn();
      L.onmsg = m => { Net.hostSeen = performance.now(); Net.onMsg(m); }; L.onclose = () => coopLost();
      L.send({ t: 'hello', v: COOP_V, name: coopMyName() }); coopMsg('已连上，等房主开局');
    });
  } catch (e) { coopMsg(e.message || '加入失败'); }
}
function coopLeave() {
  if (Net.link) { Net.link.onclose = null; Net.link.close(); } for (const L of Net.links.values()) { L.onclose = null; L.close(); }
  if (Net.peer) Net.peer.close(); clearInterval(Net.hbI);
  for (const g of Net.ghosts.values()) ghostDrop(g); const h = $('coopHud'); if (h) h.hidden = true;
  Object.assign(Net, { on: false, host: false, me: 0, code: '', started: false, peer: null, link: null, links: new Map(), players: [], ghosts: new Map(), byId: new Map(), nid: 1, tgt: null, ready: new Set(), votes: {}, revT: {} });
  coopNextId = 1;
}
/* 心跳：两秒一次；十五秒没动静就当断了（关掉网页、断网时连接不一定会报） */
function coopBeatOn() { clearInterval(Net.hbI); Net.hbI = setInterval(coopBeat, 2000); }
function coopBeat() {
  if (!Net.on) return; const now = performance.now();
  if (Net.host) { Net.bcast({ t: 'hb' }); for (const [id, L] of [...Net.links]) if (now - (L.seen || now) > 15000) { L.onclose = null; L.close(); Net.links.delete(id); coopDrop(id); } }
  else { Net.send({ t: 'hb' }); if (now - (Net.hostSeen || now) > 15000) coopLost(); }
}
addEventListener('pagehide', () => { if (Net.on) coopLeave(); });
/* 有人走了：房主把他从名单里拿掉；房主走了，大家这一局就散了 */
function coopDrop(id) {
  Net.players = Net.players.filter(p => p.id !== id); const g = Net.ghosts.get(id); if (g) ghostDrop(g); Net.ghosts.delete(id); Net.ready.delete(id); delete Net.votes[id];
  Net.bcast({ t: 'gone', id }); Net.lobby(); if (Net.started) { UI.toast(`${coopNameOf(id)}离开了`, 2.4); coopMapInfo(); }
}
const coopNameOf = id => { const g = Net.ghosts.get(id); return g ? g.name : '同袍'; };
function coopLost() {
  const was = Net.started; coopLeave();
  if (was && G.state !== 'title' && G.state !== 'over') { Game.over(false); $('overS').textContent = '房主离开了，联机中断'; }
  else coopMsg('和房主断开了');
}

/* ---------- 房主收到同袍的消息 ---------- */
Net.recv = (id, m) => {
  const g = Net.ghosts.get(id);
  switch (m.t) {
    case 'p': m.id = id; if (id) { ghostState(id, m); Net.bcast(m, id); } return;
    case 'dmg': { const e = Net.byId.get(m.id); if (!e) return; coopAs(g, () => dmgLocal(e, m.d, { crit: !!m.c, kx: m.kx || 0, kz: m.kz || 0, poise: m.po || 1, cls: m.cl })); return; }
    case 'pry': { const e = Net.byId.get(m.id); if (e) coopAs(g, () => parryLocal(e)); return; }
    case 'stt': { const e = Net.byId.get(m.id); if (!e || e.state === 'dead') return; if (m.s) e.slowT = Math.max(e.slowT, m.s); if (m.b) { e.burnT = Math.max(e.burnT, m.b); e.burnDps = Math.max(e.burnDps, m.bd || 0); } return; }
    case 'rdy': Net.ready.add(id); coopMapInfo(); return;
    case 'vote': Net.votes[id] = m.n; coopMapInfo(); return;
    case 'rev': if (m.to === Net.me) coopRevived(coopNameOf(id)); else Net.sendTo(m.to, { t: 'rev', by: id }); return;
  }
};
/* ---------- 同袍收到房主（或房主自己转来）的消息 ---------- */
Net.onMsg = m => {
  switch (m.t) {
    case 'wel': Net.me = m.id; return;
    case 'deny': coopMsg(m.why); coopLeave(); return;
    case 'lob': Net.players = m.ps; Net.code = m.code; coopLobbyUI(); return;
    case 'gone': { const g = Net.ghosts.get(m.id); if (g) ghostDrop(g); Net.ghosts.delete(m.id); return; }
    case 'start': coopStart(m); return;
    case 'P': case 'p': if (m.id !== Net.me) ghostState(m.id, m); return;
    case 'S': coopSnap(m); return;
    case 'sp': coopSpawn(m); return;
    case 'k': { const e = Net.byId.get(m.id); if (e && e.state !== 'dead') { e.revived = true; Net.applying = true; try { killEnemy(e); } finally { Net.applying = false; } } return; }
    case 'pj': { const src = Net.byId.get(m.s); spawnProj({ kind: m.k, x: m.x, y: m.y, z: m.z, vx: m.vx, vz: m.vz, yaw: m.yw, life: m.l, dmg: m.d, enemy: true, turn: m.tu, src, dart: m.dt, tgt: m.tg }); return; }
    case 'hz': G.hazards.push({ x: m.x, z: m.z, r: m.r, delay: m.de, t: 0, dur: m.du, dmg: m.d, tele: null, kind: m.k, nid: 1 }); return;
    case 'hurt': { const e = Net.byId.get(m.s); hurtLocal(m.d, m.x, m.z, { knock: m.k, src: e, parry: m.p ? undefined : false, proj: !!m.pr }); return; }
    case 'rev': coopRevived(coopNameOf(m.by)); return;
    case 'go': coopGo(m); return;
    case 'fight': coopFight(m); return;
    case 'won': if (Run.node && G.state !== 'title' && G.state !== 'over' && !G.rlDoneT && !G.clearT) { coopReviveAll(); runWon(); } return;
    case 'chap': coopChapter(m); return;
    case 'over': if (G.state !== 'over' && G.state !== 'title') Game.over(false); return;
  }
};
/* 房主替某位同袍做事：把「玩家」暂时换成他（位置、状态），敌人的刀就落在他身上 */
const _sv = {};
function coopIn(g) {
  Object.assign(_sv, { pos: Pl.pos, vel: Pl.vel, state: Pl.state, st: Pl.st, iframe: Pl.iframe, yaw: Pl.yaw, speedN: Pl.speedN, lock: Pl.lock });
  Pl.pos = g.pos; Pl.vel = g.vel; Pl.state = g.state; Pl.st = g.pst; Pl.iframe = g.ifr; Pl.yaw = g.yaw; Pl.speedN = g.speedN; Net.tgt = g;
}
function coopOut() { const lock = Pl.lock; Object.assign(Pl, _sv); if (lock === null) Pl.lock = null; Net.tgt = null; }
function coopAs(g, f) { if (!g) return f(); coopIn(g); try { return f(); } finally { coopOut(); } }

/* ---------- 拦截：伤害、弹反、挨打都绕一道 ---------- */
const hurtLocal = hurtPlayer, dmgLocal = damageEnemy, parryLocal = parriedBy, pdmgLocal = playerDamage, projLocal = spawnProj;
hurtPlayer = function (dmg, sx, sz, o = {}) {
  const g = Net.tgt; if (!g) return hurtLocal(dmg, sx, sz, o);
  if (g.state === 'dead') return false;
  Net.sendTo(g.id, { t: 'hurt', d: dmg, x: sx, z: sz, k: o.knock, p: o.parry === false ? 0 : 1, s: o.src && o.src.nid, pr: o.proj ? 1 : 0 }); return true;
};
damageEnemy = function (e, dmg, o = {}) {
  if (!Net.on || Net.host || Net.applying || !e.nid) return dmgLocal(e, dmg, o);
  if (e.state === 'dead' || e.state === 'spawn' && e.st < .25) return false;
  Net.send({ t: 'dmg', id: e.nid, d: Math.round(dmg * 10) / 10, c: o.crit ? 1 : 0, kx: o.kx, kz: o.kz, po: o.poise, cl: o.cls });
  // 先在本机报个数、闪一下；真正的气血以房主为准
  const d = Math.max(1, Math.round(dmg * (e.stun > 0 ? 1.3 : 1))); e.hp = Math.max(1, e.hp - d); e.flash = 1;
  FX.num({ x: e.pos.x, y: e.hitY + .7, z: e.pos.z }, '' + d, o.crit ? 'crit' : (o.cls || ''), o.crit ? 1 : .8);
  return true;
};
parriedBy = function (e) {
  if (!Net.on || Net.host || !e.nid) return parryLocal(e);
  Net.send({ t: 'pry', id: e.nid }); return !(e.boss || e.cfg.poise > 4);
};
playerDamage = function (e, mult, o) {
  if (!Net.on || Net.host || !e.nid) return pdmgLocal(e, mult, o);
  const s0 = e.slowT, b0 = e.burnT, r = pdmgLocal(e, mult, o);
  if (r && (e.slowT > s0 || e.burnT > b0)) Net.send({ t: 'stt', id: e.nid, s: e.slowT > s0 ? e.slowT : 0, b: e.burnT > b0 ? e.burnT : 0, bd: e.burnDps });
  return r;
};
/* 敌人的飞行物记下是冲谁去的：追踪弹在每台网页上都追同一个人 */
spawnProj = function (o) { const p = projLocal(o); if (Net.on && Net.host && p.enemy && p.tgt === undefined) p.tgt = Net.tgt ? Net.tgt.id : Net.me; return p; };
function coopAim(p) { if (Net.on && p.tgt !== undefined && p.tgt !== Net.me) { const g = Net.ghosts.get(p.tgt); if (g && g.state !== 'dead') return g.pos; } return Pl.pos; }

/* ---------- 同袍的身影 ---------- */
function nameTag(name, slot) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const g = cv.getContext('2d');
  g.font = '600 34px "Noto Serif SC", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(name, 128, 32); g.fillStyle = COOP_TAG[slot % 4]; g.fillText(name, 128, 32);
  // 用一块面片当名牌（每帧转向镜头）
  const s = new T.Mesh(new T.PlaneGeometry(1.6, .4), new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), depthWrite: false, transparent: true, fog: false, toneMapped: false })); s.position.y = 2.2; s.renderOrder = 9; return s;
}
function ghostMake(id) {
  const slot = coopSlot(id), c = COOP_COLORS[slot % 4], rig = makeHero({ colors: { robe: c.robe, coat: c.coat, skin: 0xe9c2a6, hair: 0x15110e, pants: 0xe2ddd2, boots: 0x22201e, accent: c.accent, jade: c.jade, silver: 0xd8dde2, sheath: 0x1c2b2c } });
  rig.setRim(.42, .3, .2); GFX.scene.add(rig.root); const name = coopName(id), tag = nameTag(name, slot); rig.root.add(tag);
  const g = { id, name, slot, rig, tag, pos: new V3(0, 0, 9), vel: new V3(), net: null, yaw: PI, state: 'free', pst: 0, ifr: 0, speedN: 0, hp: 1, mhp: 1, anim: null, deadT: 0, trail: new Trail(0xc8dcea, .2, .8), seen: 0 };
  Net.ghosts.set(id, g); return g;
}
function ghostDrop(g) { GFX.scene.remove(g.rig.root); g.rig.dispose(); g.tag.geometry.dispose(); g.tag.material.map.dispose(); g.tag.material.dispose(); g.trail.dispose(); }
function ghostState(id, m) {
  if (!Net.started) return; const g = Net.ghosts.get(id) || ghostMake(id);
  if (!g.net) g.pos.set(m.x, 0, m.z); g.net = m; g.seen = performance.now();
  g.vel.set(m.vx || 0, 0, m.vz || 0); g.state = m.st; g.pst = m.ps || 0; g.ifr = m.i ? .2 : 0; g.speedN = m.s || 0; g.busy = !!m.bz; g.hp = m.hp; g.mhp = m.mh; g.lv = m.lv;
}
const _gb = new V3(), _gt = new V3();
function ghostTick(g, dt) {
  const m = g.net; if (!m) return; const vis = G.state !== 'title';
  g.rig.root.visible = vis; if (!vis) return;
  const k = 1 - Math.exp(-14 * dt); if (Math.hypot(m.x - g.pos.x, m.z - g.pos.z) > 5) g.pos.set(m.x, 0, m.z); else { g.pos.x += (m.x - g.pos.x) * k; g.pos.z += (m.z - g.pos.z) * k; }
  g.yaw = dampAng(g.yaw, m.y, 16, dt); g.rig.root.position.copy(g.pos); g.rig.root.rotation.y = g.yaw;
  g.tag.quaternion.copy(g.rig.root.quaternion).invert().multiply(GFX.camera.quaternion);
  if (g.state === 'dead') g.deadT += dt; else g.deadT = 0;
  const a = m.a ? { name: m.a[0], u: m.a[1], w: m.a[2], a: m.a[3] } : null, back = !!m.b;
  animHuman(g.rig, dt, G.t, { speed: m.sp || 0, action: a && HA[a.name] ? a : null, rate: m.r || 14, hurt: g.state === 'hurt' ? .7 : 0, fall: g.state === 'dead' ? smooth(g.deadT / .7) : 0,
    pose: P => { if (back) setHand(P, -.36, .98, -.1, -.1, .94, -.33); else setHand(P, -.36, .93, .14, -.28, -.52, .8); } });
  g.rig.setGlow(g.state === 'hurt' ? .6 : 0, .05, .05); g.tag.material.opacity = g.state === 'dead' ? .5 : 1;
  if (a && a.u > (a.w || 0) * .9 && a.u < (a.a || 1) + .05) { g.rig.bladePts(_gb, _gt); g.trail.push(_gb, _gt); } g.trail.update(dt);
}

/* ---------- 敌人：房主照常算，同袍只摆姿势 ---------- */
const COOP_ST = ['spawn', 'idle', 'chase', 'windup', 'active', 'recover', 'stagger', 'down', 'dead', 'return'];
function coopPickTarget(e) {
  // 盯住一个人，隔一会儿看看有没有更近的（近了三成才换），倒下的不打
  e.tgtT = (e.tgtT || 0) - 1; const cur = e.tgtId === undefined ? null : e.tgtId;
  // 正在挑机缘、暂停的人先不打
  const alive = id => { if (id === Net.me) return Pl.state !== 'dead' && G.state === 'playing'; const g = Net.ghosts.get(id); return !!(g && g.net && g.state !== 'dead' && !g.busy); };
  const pos = id => id === Net.me ? Pl.pos : Net.ghosts.get(id).pos;
  if (cur === null || !alive(cur) || e.tgtT <= 0) {
    e.tgtT = 45; let best = alive(Net.me) ? Net.me : null, bd = best === null ? 1e9 : Math.hypot(Pl.pos.x - e.pos.x, Pl.pos.z - e.pos.z);
    if (cur !== null && alive(cur)) { best = cur; bd = Math.hypot(pos(cur).x - e.pos.x, pos(cur).z - e.pos.z) * .7; }
    for (const g of Net.ghosts.values()) { if (!alive(g.id)) continue; const d = Math.hypot(g.pos.x - e.pos.x, g.pos.z - e.pos.z); if (d < bd) { bd = d; best = g.id; } }
    e.tgtId = best === null ? Net.me : best;
  }
  return e.tgtId === Net.me ? null : Net.ghosts.get(e.tgtId);
}
function coopEnemies(dt) {
  if (!Net.on || !Net.started) { for (let i = G.enemies.length - 1; i >= 0; i--) if (!updateEnemy(G.enemies[i], dt, G.t)) G.enemies.splice(i, 1); return; }
  if (!Net.host) { for (let i = G.enemies.length - 1; i >= 0; i--) if (!puppetEnemy(G.enemies[i], dt, G.t)) { Net.byId.delete(G.enemies[i].nid); G.enemies.splice(i, 1); } return; }
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i], g = e.state === 'dead' ? null : coopPickTarget(e);
    const ok = g ? coopAs(g, () => updateEnemy(e, dt, G.t)) : updateEnemy(e, dt, G.t);
    if (!ok) { if (e.nid && !e.nk) Net.bcast({ t: 'k', id: e.nid }); Net.byId.delete(e.nid); G.enemies.splice(i, 1); }
  }
}
/* 房主：新出的敌人、飞行物、地面预警，倒下的敌人，按帧广播；敌人的位置姿态每秒十五次 */
function coopHostSync(dt) {
  for (const e of G.enemies) {
    if (!e.nid) { e.nid = Net.nid++; Net.byId.set(e.nid, e); Net.bcast({ t: 'sp', id: e.nid, ty: e.type, x: e.pos.x, z: e.pos.z, y: e.yaw, el: e.elite ? 1 : 0, lv: e.lv, hp: e.hp, mh: e.maxHp, dk: e.dmgK, cl: e.clone ? 1 : 0, nm: e.name }); }
    if (e.state === 'dead' && !e.nk) { e.nk = true; Net.bcast({ t: 'k', id: e.nid }); }
  }
  for (const p of G.projs) if (p.enemy && !p.nid) { p.nid = 1; Net.bcast({ t: 'pj', k: p.kind, x: p.x, y: p.y, z: p.z, vx: p.vx, vz: p.vz, yw: p.yaw, l: p.life, d: p.dmg, tu: p.turn, s: p.src && p.src.nid, dt: p.dart, tg: p.tgt }); }
  for (const h of G.hazards) if (!h.nid) { h.nid = 1; Net.bcast({ t: 'hz', x: h.x, z: h.z, r: h.r, de: h.delay - h.t, du: h.dur, d: h.dmg, k: h.kind }); }
  Net.snapT -= dt; if (Net.snapT > 0) return; Net.snapT = 1 / 15;
  const E = []; const r1 = v => Math.round(v * 100) / 100;
  for (const e of G.enemies) { if (!e.nid) continue; E.push([e.nid, r1(e.pos.x), r1(e.pos.z), r1(e.yaw), COOP_ST.indexOf(e.state), r1(e.st), e.atkI ?? -1, r1(e.wind || 0), Math.round(e.hp), r1(Math.max(0, e.stun)), e.phase || 1, r1(e.poiseD || 0), e.tx !== undefined ? r1(e.tx) : null, e.tz !== undefined ? r1(e.tz) : null, r1(e.stagger || 0), r1(e.jumpY || 0)]); }
  Net.bcast({ t: 'S', e: E });
}
function coopSpawn(m) {
  if (G.state === 'title' || Net.byId.has(m.id)) return;
  const e = spawnEnemy(m.ty, m.x, m.z, { elite: !!m.el, lv: m.lv }); e.nid = m.id; Net.byId.set(m.id, e);
  e.maxHp = m.mh; e.hp = m.hp; e.dmgK = m.dk; e.yaw = m.y; if (m.nm) e.name = m.nm; if (m.cl) { e.clone = true; e.life = 1e9; }
  e.net = { x: m.x, z: m.z, y: m.y };
}
function coopSnap(m) {
  for (const r of m.e) {
    const e = Net.byId.get(r[0]); if (!e) continue; e.net = { x: r[1], z: r[2], y: r[3] };
    const st = COOP_ST[r[4]] || 'chase';
    if (e.state === 'dead') continue;
    if (st !== e.state && !(st === 'dead')) {
      const prev = e.state; e.state = st; e.st = r[5];
      if (st === 'windup' || st === 'active' || st === 'recover') { const a = e.cfg.atks[r[6]]; if (a) { if (e.atk !== a || prev !== st) { e.atk = a; e.atkI = r[6]; } e.wind = r[7] || a.wind; e.rec = a.rec; } }
      if (st === 'windup') { e.teleMade = false; e.glinted = false; }
      if (st === 'active') coopActFx(e, r[12], r[13]);
      if (st === 'down') FX.num({ x: e.pos.x, y: e.hitY + 1.2, z: e.pos.z }, '未死', 'word', 1);
    }
    if (st === 'stagger') e.stagger = r[14];
    e.hp = Math.min(e.hp, r[8]); if (r[8] > e.hp + 1 && (st === 'return' || st === 'down' || st === 'idle')) e.hp = r[8]; if (Math.abs(e.hp - r[8]) > e.maxHp * .1) e.hp = r[8];
    const stun0 = e.stun; e.stun = r[9]; if (stun0 <= 0 && e.stun > .5) { FX.num({ x: e.pos.x, y: e.hitY + 1.3, z: e.pos.z }, '破绽', 'word', 1.2); Snd.clang(); }
    if (r[10] > (e.phase || 1)) { const P = (PHASES[e.type] || [])[e.pi || 0]; e.pi = (e.pi || 0) + 1; if (P && P.banner) UI.banner(P.banner[0], P.banner[1], 'red'); FX.ring(e.pos, 1, 12, 0xff2a1a, .8); Snd.gong(); }
    e.phase = r[10]; e.poiseD = r[11];
  }
}
/* 出手那一下的声音和刀光（伤害由房主判） */
function coopActFx(e, tx, tz) {
  const a = e.atk; if (!a) return; const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw); if (e.tele && a.kind !== 'leap') e.tele = null;
  if (a.kind === 'melee') { Snd.swing(e.cfg.mass > 2 ? 1 : 0); if (a.anim === 'sweepRL' || a.anim === 'sweepLR') FX.slash({ x: e.pos.x, y: e.hitY, z: e.pos.z, yaw: e.yaw, dir: a.anim === 'sweepRL' ? 1 : -1, roll: a.anim === 'sweepRL' ? .1 : -.3, r: a.shape.r * .98, arc: a.shape.arc, color: 0xff5a32, dur: .2, inten: 1.2 }); }
  else if (a.kind === 'dash') { Snd.swing(1); FX.slash({ x: e.pos.x + fx * 3, y: 1.3, z: e.pos.z + fz * 3, yaw: e.yaw, roll: PI / 2, r: 7, arc: .5, inner: .05, color: 0xff3a22, dur: .3, inten: 2 }); }
  else if (a.kind === 'pounce' || a.kind === 'spin') Snd.swing(0);
  else if (a.kind === 'leap' && tx !== null) { e.lx = e.pos.x; e.lz = e.pos.z; e.tx = tx; e.tz = tz; e.tele = FX.telegraph({ type: 'circle', x: tx, z: tz, r: a.r, dur: a.act }); Snd.swing(1); }
  else if (a.kind === 'shoot') { if (a.dart) Snd.swing(0); else Snd.bow(); }
  else if (a.kind === 'cast' || a.kind === 'rain') Snd.cast();
  else if (a.kind === 'summon') { UI.banner('喽啰何在', '', 'red'); Snd.gong(); }
}
/* 同袍这边的敌人：位置跟着房主走，动作按房主给的状态和进度放 */
function puppetEnemy(e, dt, t) {
  const c = e.cfg, rig = e.rig; e.st += dt; e.flash = Math.max(0, e.flash - Math.max(dt, .004) * 9); e.stun -= dt;
  let speed = 0, action = null, rate = 14, rootY = c.float ? c.float + Math.sin(t * 2 + rig.phase) * .12 : 0, fall = 0, hurt = 0, glow = 0, trail = false;
  if (e.net && e.state !== 'dead') {
    const ox = e.pos.x, oz = e.pos.z, k = 1 - Math.exp(-12 * dt);
    if (Math.hypot(e.net.x - ox, e.net.z - oz) > 6) e.pos.set(e.net.x, 0, e.net.z); else { e.pos.x += (e.net.x - ox) * k; e.pos.z += (e.net.z - oz) * k; }
    e.yaw = dampAng(e.yaw, e.net.y, 14, dt); e.spdS = damp(e.spdS || 0, Math.hypot(e.pos.x - ox, e.pos.z - oz) / Math.max(dt, 1e-3), 8, dt);
  }
  const a = e.atk;
  if (e.state === 'spawn') { const q = sat(e.st / .7); rootY += -2.0 * (1 - easeOut(q)) * rig.root.scale.x; }
  else if (e.state === 'dead') {
    e.deadT += dt; fall = smooth(e.deadT / .45); if (e.deadT > .9) rig.setOpacity(sat(1 - (e.deadT - .9) / .7)); rootY -= Math.max(0, e.deadT - .9) * .5;
    if (e.deadT > 1.6) { GFX.scene.remove(rig.root); rig.dispose(); if (e.trail) e.trail.dispose(); return false; }
  }
  else if (e.state === 'down') { fall = e.st < 1.9 ? smooth(e.st / .35) : 1 - smooth((e.st - 1.9) / .5); rate = 20; }
  else if (e.state === 'stagger') { hurt = sat(1 - e.st / Math.max(.3, e.stagger || .5)) * .8 + .2; rate = 24; }
  else if (a && (e.state === 'windup' || e.state === 'active' || e.state === 'recover')) {
    const tot = e.wind + a.act + a.rec, w = e.wind / tot, aa = (e.wind + a.act) / tot;
    if (e.state === 'windup') {
      const u0 = e.st / e.wind; action = { name: a.anim, u: Math.min(e.st / tot, w), w, a: aa }; glow = smooth(Math.min(1, u0)); rate = 22;
      if (a.tele && !e.teleMade && u0 >= .25 && a.kind === 'melee') { e.teleMade = true; e.tele = makeTele(e, a, Math.max(.1, e.wind * .75)); }
      if (e.tele && a.kind === 'melee' && u0 < .72 && e.tele.mesh) { e.tele.mesh.rotation.y = e.yaw; if (a.shape.t === 'circle') { e.tele.mesh.position.x = e.pos.x + Math.sin(e.yaw) * a.shape.off; e.tele.mesh.position.z = e.pos.z + Math.cos(e.yaw) * a.shape.off; } else { e.tele.mesh.position.x = e.pos.x; e.tele.mesh.position.z = e.pos.z; } }
      if (!e.glinted && e.wind - e.st <= .3 && GLINT.has(a.kind)) { e.glinted = true; const ub = unblockable(a); if (rig.bladeLen) rig.bladePts(_eb, _et); else _et.set(e.pos.x + Math.sin(e.yaw) * .7, e.hitY + .1, e.pos.z + Math.cos(e.yaw) * .7); FX.glint(_et, ub ? 0xff2a1a : 0xdff2ff, (ub ? 1.9 : 1.35) * (e.boss ? 1.4 : 1)); if (ub) Snd.danger(); else Snd.glint(); }
      if ((a.kind === 'cast' || a.kind === 'rain' || a.kind === 'waves') && Math.random() < .6) FX.wisp({ x: e.pos.x, y: e.hitY + .6, z: e.pos.z }, a.kind === 'cast' && !e.boss ? 0xb46cff : 0xff3a22, 1, 1.5);
    } else if (e.state === 'active') {
      action = { name: a.anim, u: Math.min(aa, (e.wind + e.st) / tot), w, a: aa }; rate = 32; trail = true; glow = .6; const q = sat(e.st / a.act);
      if (a.kind === 'leap') rootY += Math.sin(PI * q) * 4.5; else if (a.kind === 'pounce') rootY += Math.sin(PI * q) * .9; else if (a.kind === 'spin') action = { name: 'whirl', u: 0 };
      if (a.kind === 'leap' && q >= 1 && !e.didHit) { e.didHit = true; FX.ring(e.pos, 1, a.r + 1, 0xffa060, .5); FX.dust(e.pos, 30, 2); Cam.shake = Math.max(Cam.shake, .5); Snd.boom(); }
      if (a.quake && !e.fxDone && e.st >= a.act * .5) { e.fxDone = true; const p = { x: e.pos.x + Math.sin(e.yaw) * a.shape.off, z: e.pos.z + Math.cos(e.yaw) * a.shape.off }; FX.ring(p, .5, a.shape.r + .5, 0xffa060, .4); FX.dust(p, 18, 1.4); Cam.shake = Math.max(Cam.shake, .3); Snd.boom(); }
    } else { action = { name: a.kind === 'spin' ? 'slam' : a.anim, u: Math.min(1, (e.wind + a.act + e.st) / tot), w, a: aa }; rate = 12; e.didHit = false; e.fxDone = false; }
  }
  else speed = (e.spdS || 0) / (rig.kind === 'wolf' ? 6 : 4.5);
  e.speedN = speed; rig.root.position.set(e.pos.x, 0, e.pos.z); rig.root.rotation.y = e.yaw;
  foeTick(e, dt);
  if (rig.animate) rig.animate(dt, t, { speed, action: a && (e.state === 'windup' || e.state === 'active' || e.state === 'recover') ? action || { u: 1, w: .3, a: .6 } : null, hurt, fall, rootY });
  else animHuman(rig, dt, t, { speed, action: action && HA[action.name] ? action : null, rate, hurt, fall, rootY });
  const f = e.flash, st = e.stun > 0 ? .25 + Math.sin(t * 14) * .1 : 0, fr = e.frozeT > 0 ? .9 : e.slowT > 0 ? .12 : 0;
  rig.setGlow(f * .15 + glow * .05 + st * .3, f * .12 + st * .24 + fr * .5, f * .1 + st * .06 + fr);
  if (e.elite) { rig.setRim(.9, .6, .15); if (Math.random() < .15) FX.wisp({ x: e.pos.x, y: e.hitY, z: e.pos.z }, 0xffc040, 1, .6); } else rig.setRim(.3 + glow * 1.1, .2, .14);
  if (e.trail) { if (trail && e.state === 'active') { rig.bladePts(_eb, _et); e.trail.push(_eb, _et); } e.trail.update(dt); }
  e.slowT = Math.max(0, (e.slowT || 0) - dt); e.frozeT = Math.max(0, (e.frozeT || 0) - dt);
  return true;
}

/* ---------- 每帧：发自己的状态、画同袍、扶人 ---------- */
function coopTick(dt, rdt) {
  if (!Net.on || !Net.started) return;
  if (Net.host) coopHostSync(dt);
  Net.sendT -= rdt;
  if (Net.sendT <= 0) {
    Net.sendT = 1 / 20; const ao = Pl.animO || {}, a = ao.a, r2 = v => Math.round(v * 1000) / 1000;
    const m = { t: 'p', x: r2(Pl.pos.x), z: r2(Pl.pos.z), y: r2(Pl.yaw), sp: r2(ao.s || 0), s: r2(Pl.speedN || 0), st: Pl.state, ps: r2(Pl.st || 0), i: Pl.iframe > 0 ? 1 : 0, vx: r2(Pl.vel.x), vz: r2(Pl.vel.z),
      hp: Math.ceil(Pl.hp), mh: Pl.maxHp, lv: Pl.lv, a: a ? [a.name, r2(a.u || 0), r2(a.w || 0), r2(a.a || 1)] : 0, r: ao.r || 14, b: ao.b ? 1 : 0, bz: G.state !== 'playing' ? 1 : 0 };
    if (Net.host) { m.id = 0; Net.bcast(m); } else Net.send(m);
  }
  for (const g of Net.ghosts.values()) ghostTick(g, rdt);
  Net.hudT = (Net.hudT || 0) - rdt; if (Net.hudT <= 0) { Net.hudT = .25; coopHud(); }
  // 倒下的同袍：站到他身边两秒半就扶起来
  if (Pl.state !== 'dead' && G.state === 'playing') for (const g of Net.ghosts.values()) {
    if (g.state !== 'dead') { Net.revT[g.id] = 0; continue; }
    const near = Math.hypot(g.pos.x - Pl.pos.x, g.pos.z - Pl.pos.z) < 2.4; Net.revT[g.id] = near ? (Net.revT[g.id] || 0) + dt : 0;
    if (near && Math.floor((Net.revT[g.id] - dt) * 2) !== Math.floor(Net.revT[g.id] * 2)) UI.toast(`正在扶起${g.name} · ${Math.min(100, Math.round(Net.revT[g.id] / 2.5 * 100))}%`, .8);
    if (Net.revT[g.id] >= 2.5) { Net.revT[g.id] = -9; Net.send({ t: 'rev', to: g.id }); FX.pillar(g.pos, 0x8be0a0, 4); Snd.level(); }
  }
  // 房主：全都倒了，这一局就结束
  if (Net.host && Pl.state === 'dead' && G.state === 'playing' && [...Net.ghosts.values()].every(g => g.state === 'dead' || !g.net) && G.deathT > 2.4) { Net.bcast({ t: 'over' }); Game.over(false); }
}
/* 左上角：同袍的气血 */
function coopHud() {
  const el = $('coopHud'), gs = [...Net.ghosts.values()].filter(g => g.net); el.hidden = !gs.length; if (!gs.length) return;
  el.innerHTML = gs.map(g => `<div class="${g.state === 'dead' ? 'down' : ''}"><span style="color:${COOP_TAG[g.slot % 4]}">${g.name}${g.state === 'dead' ? ' · 倒地' : g.busy ? ' · 挑机缘' : ''}</span><i><b style="width:${Math.round(sat((g.hp || 0) / (g.mhp || 1)) * 100)}%"></b></i></div>`).join('');
}
function coopAnyAlive() { return Pl.state !== 'dead' || [...Net.ghosts.values()].some(g => g.net && g.state !== 'dead'); }
/* 自己倒下：画面发灰，等人扶或者等这一处打完 */
function coopDeadTick(rdt) {
  G.deathT += rdt; GFX.final.uniforms.uGray.value = Math.min(.75, G.deathT / 1.5); G.slowT = 0; G.enemyTS = 1;
  if (G.deathT - rdt <= .6 && G.deathT > .6) { UI.banner('力竭倒地', '同袍站到身边能扶你起来 · 这一处打完也会醒', 'red'); }
}
function coopRevive(k) {
  if (Pl.state !== 'dead') return; Pl.state = 'free'; Pl.st = 0; Pl.deadT = 0; Pl.hp = Math.max(1, Math.round(Pl.maxHp * k)); Pl.iframe = 2; G.deathT = 0; GFX.final.uniforms.uGray.value = 0;
  FX.pillar(Pl.pos, 0x8be0a0, 6); FX.ring(Pl.pos, .5, 5, 0x8be0a0, .5); Snd.level();
}
function coopRevived(by) { if (Pl.state !== 'dead') return; coopRevive(.35); UI.banner('起身', `${by}把你扶了起来`, 'gold'); }
function coopReviveAll() { if (Pl.state === 'dead') { coopRevive(.3); UI.toast('缓过一口气 · 气血三成', 2); } }
/* 同袍那边只跑两个计时：一章打完的过场、一处打完的结算 */
function coopClientStage(dt) {
  if (G.clearT > 0) { G.clearT -= dt; if (G.clearT <= 0) Game.chapterClear(); return; }
  if (G.rlDoneT > 0) { G.rlDoneT -= dt; if (G.rlDoneT <= 0) Run.afterFight(); }
}

/* ---------- 路线：房主择路，同袍只能提建议 ---------- */
const runGo = Run.go.bind(Run), runFight = Run.fight.bind(Run), runWon = Run.won.bind(Run), runShowMap = Run.showMap.bind(Run), runSave = Run.save.bind(Run), runEvent = Run.event.bind(Run), runNext = Run.nextChapter.bind(Run), runTip = Run.tip.bind(Run);
Run.save = function () { if (!Net.on) runSave(); };
const coopWait = () => Net.players.filter(p => p.id !== 0 && !Net.ready.has(p.id)).map(p => p.name);
Run.go = function (id) {
  if (!Net.on) return runGo(id);
  if (G.state !== 'rlmap' || !this.reach().includes(id)) return;
  if (!Net.host) { Net.send({ t: 'vote', n: id }); Net.myVote = id; coopMapInfo(); Snd.ui(); return; }
  const wait = coopWait();
  if (wait.length && performance.now() - Net.mapAt < 25000) { UI.toast(`等${wait.join('、')}回到路线图（25 秒后可以先走）`, 2.4); return; }
  const n = this.map.nodes[id], m = { t: 'go', n: id }; if (n.t === 'event') m.ev = coopPickEv();
  Run.forceEv = m.ev; Net.ready.clear(); Net.votes = {}; Net.bcast(m); runGo(id);
};
function coopPickEv() { const seen = Run.seenEv || new Set(), pool = EVENTS.filter(e => !seen.has(e.id) && (!e.ch || e.ch.includes(Run.ch))); return pick(pool.length ? pool : EVENTS).id; }
/* 同袍：跟着房主走。遇上战斗就等房主那边开打的消息 */
function coopGo(m) {
  if (G.state === 'title' || G.state === 'over') return;
  for (const id of ['levelup', 'shop', 'event', 'rlmap', 'interlude']) $(id).hidden = true;
  const n = Run.map.nodes[m.n]; Run.forceEv = m.ev; Net.myVote = null;
  if (n.t === 'fight' || n.t === 'elite' || n.t === 'boss') { Run.at = m.n; Run.path.push(m.n); Run.step++; Run.node = n; G.state = 'coopwait'; return; }
  G.state = 'rlmap'; runGo(m.n);
}
Run.fight = function (n, waves) {
  if (!Net.on) return runFight(n, waves);
  if (Net.host) {
    const k = coopN() - 1; waves = (waves || genWaves(this.ch, n.r, n.t)).map(w => { const o = { ...w }; if (k > 0) for (const t in w) { if (ET[t].boss) continue; for (let i = 0; i < w[t]; i++) if (Math.random() < .2 * k) o[t]++; } return o; });
    Net.bcast({ t: 'fight', n: n.id, nt: n.t, w: waves, b: this.bounty || null }); runFight(n, waves); G.cap += 2 * k; G.maxTokens += k; return;
  }
  runFight(n, waves); G.queue = [];
};
function coopFight(m) {
  for (const id of ['levelup', 'shop', 'event', 'rlmap', 'interlude']) $(id).hidden = true;
  clearField(); const base = Run.map.nodes[m.n] || Run.node; Run.node = base; Run.bounty = m.b;
  Run.fight({ ...base, t: m.nt }, m.w);
}
Run.won = function () { if (Net.on && Net.host) { Net.bcast({ t: 'won' }); coopReviveAll(); } return runWon(); };
Run.event = function () {
  if (!Net.on || !Run.forceEv) return runEvent();
  const e = EVENTS.find(x => x.id === Run.forceEv) || pick(EVENTS); (this.seenEv || (this.seenEv = new Set())).add(e.id); Run.forceEv = null;
  const opts = e.opts.map(o => { const d = typeof o.d === 'function' ? o.d() : o.d; return o.fight && !Net.host ? { ...o, d: d + '（这一项由房主定夺）', ok: () => false } : { ...o, d }; });
  this.panel(e.t, Net.host ? '奇遇 · 同袍各选各的' : '奇遇 · 同袍各选各的', e.d, opts);
};
Run.nextChapter = function () {
  if (!Net.on) return runNext();
  if (!Net.host) { UI.toast('等房主启程', 1.8); $('btnIlGo').textContent = '等房主启程'; return; }
  this.ch++; this.map = genMap(); this.at = -1; this.path = []; this.node = null; Net.ready.clear(); Net.bcast({ t: 'chap', ch: this.ch, map: this.map }); Game.enterChapter(this.ch);
};
function coopChapter(m) {
  if (G.state === 'title' || G.state === 'over') return; $('btnIlGo').textContent = '启程';
  Run.ch = m.ch; Run.map = m.map; Run.at = -1; Run.path = []; Run.node = null; Game.enterChapter(m.ch);
}
Run.showMap = function () {
  runShowMap(); if (!Net.on) return;
  Net.mapAt = performance.now(); if (!Net.host) Net.send({ t: 'rdy', at: Run.at }); coopMapInfo();
};
Run.tip = function (n) { runTip(n); if (Net.on && !n) $('rmTip').textContent = Net.host ? '你是房主：由你择路，同袍的建议显示在下面' : '由房主择路 · 点一处可以给房主提个建议'; };
function coopMapInfo() {
  const el = $('rmCoop'); if (!el) return; el.hidden = !Net.on; $('btnRmLeave').textContent = Net.on ? '退出联机' : '暂离 · 已存档'; if (!Net.on || G.state !== 'rlmap') return;
  const ns = Run.map.nodes, lines = Net.players.map(p => {
    const me = p.id === Net.me, ok = p.id === 0 || Net.ready.has(p.id) || me, v = p.id === Net.me ? Net.myVote : Net.votes[p.id];
    return `<span style="color:${COOP_TAG[coopSlot(p.id) % 4]}">${p.name}${p.id === 0 ? '（房主）' : ''}</span>${Net.host ? (ok ? ' 已到' : ' 还在路上') : ''}${v !== undefined && v !== null && ns[v] ? ' · 想走' + NODE[ns[v].t].n : ''}`;
  });
  el.innerHTML = lines.join('<br>');
  // 同袍想走的那一处，在图上描一圈
  const want = new Set(Object.values(Net.votes).concat(Net.myVote ?? []));
  for (const g of document.querySelectorAll('#rmSvg .nd')) g.classList.toggle('voted', want.has(+g.dataset.n));
}

/* ---------- 大厅 ---------- */
const coopMyName = () => (($('coopName') && $('coopName').value.trim()) || Save.load().coopName || '无名侠客').slice(0, 8);
function coopSaveName() { const v = $('coopName').value.trim().slice(0, 8); if (v) { Save.load().coopName = v; Save.write(); } }
function coopMsg(s) { const el = $('coopMsg'); if (el) el.textContent = s; }
function coopShow() {
  hideAll(); $('coop').hidden = false; $('coopName').value = Save.load().coopName || ''; coopLobbyUI();
}
function coopLobbyUI() {
  const room = Net.on && Net.code; $('coopRoom').hidden = !room; $('coopPre').hidden = !!room; $('btnCoopGo').hidden = !(Net.on && Net.host);
  if (!room) return; $('coopCodeT').textContent = Net.code;
  $('coopList').innerHTML = Net.players.map(p => `<span style="border-color:${COOP_TAG[coopSlot(p.id) % 4]};color:${COOP_TAG[coopSlot(p.id) % 4]}">${p.name}${p.id === 0 ? ' · 房主' : ''}${p.id === Net.me ? ' · 你' : ''}</span>`).join('');
  $('btnCoopGo').textContent = `开局 · ${Net.players.length} 人`;
}
/* 房主开局：把第一章的路线图发给大家，各自带着自己藏经阁的修为上路 */
function coopGoAll() {
  if (!Net.on || !Net.host || Net.started) return;
  const asc = 0; Run.begin(asc); const m = { t: 'start', asc, map: Run.map, ps: Net.players }; Net.bcast(m); coopStart(m);
}
function coopStart(m) {
  Net.started = true; Net.players = m.ps || Net.players; Snd.init(); $('coop').hidden = true;
  resetGame(); Run.begin(m.asc || 0); Run.map = m.map; applyMetaStart(); Net.ready.clear(); Net.votes = {};
  Game.enterChapter(0);
}
/* 清场时顺手清掉编号 */
const clearLocal = clearField;
clearField = function () { clearLocal(); Net.byId.clear(); };
/* 出生点按座次错开一点 */
const placeLocal = placePlayer;
placePlayer = function () { placeLocal(); if (Net.on && Net.started) { const s = coopSlot(Net.me); Pl.pos.x += (s - (coopN() - 1) / 2) * 1.8; Cam.look.set(Pl.pos.x, 1.5, Pl.pos.z); } };
/* 难度：每多一人，敌人气血 +35%（首领 +45%），伤害 +6% */
const spawnLocal = spawnEnemy;
spawnEnemy = function (type, x, z, o) {
  const e = spawnLocal(type, x, z, o); const k = coopN() - 1;
  if (Net.on && Net.host && Net.started && k > 0) { e.maxHp = Math.round(e.maxHp * (1 + (e.boss ? .45 : .35) * k)); e.hp = e.maxHp; e.dmgK *= 1 + .06 * k; }
  return e;
};
