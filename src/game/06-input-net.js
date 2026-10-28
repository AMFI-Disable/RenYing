// ======================= 输入 =======================
let clock = 0;
class Ctrl {
  constructor() { this.held = { left: false, right: false, down: false, atk: false, jump: false }; this.atkT = 0; this.buf = {}; }
  press(a) { if (a === 'heavy') return; this.buf[a] = clock; if (this.rec) this.rec.push(a); }   // 重斩已取消
  consume(a) { const t = this.buf[a]; if (t !== undefined && clock - t <= BUF) { delete this.buf[a]; return true; } return false; }
  clear() { this.buf = {}; this.held.left = this.held.right = this.held.down = this.held.atk = this.held.jump = false; this.held.aim = 0; }
}
// 1P 攻击用鼠标（左键攻击/蓄力，右键重斩）或者 X 键（按住蓄力），其余用键盘；2P 全键盘
// X 不和 2P、3P、4P 的任何键重复，同一台电脑多人玩时也不打架
const DEFAULT_1P_KEYS = {
  left: 'KeyA', right: 'KeyD', jump: 'KeyW', jump2: 'Space', down: 'KeyS', atk: 'KeyX', dash: 'ShiftLeft', special: 'KeyE', skill: 'KeyQ', skill2: 'KeyR'
};
let custom1PKeys = { ...DEFAULT_1P_KEYS };
try {
  const savedKeys = JSON.parse(localStorage.getItem('renying-1p-keys') || '{}');
  if (savedKeys && typeof savedKeys === 'object') custom1PKeys = { ...DEFAULT_1P_KEYS, ...savedKeys };
} catch (e) {}
function keyLabel(code) {
  if (!code) return '无';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return '空格';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'Tab') return 'Tab';
  return code;
}
const KEYS = [
  {},
  { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'down', KeyK: 'atk', KeyJ: 'dash', KeyO: 'skill2', KeyI: 'special', KeyU: 'skill' },
  { KeyF: 'left', KeyH: 'right', KeyT: 'jump', KeyG: 'down', KeyC: 'atk', KeyV: 'dash', KeyB: 'skill', KeyN: 'skill2', KeyM: 'special' },
  { Numpad4: 'left', Numpad6: 'right', Numpad8: 'jump', Numpad5: 'down', Numpad1: 'atk', Numpad2: 'dash', Numpad7: 'skill', Numpad9: 'skill2', Numpad3: 'special' },
];
function applyCustomKeys() {
  KEYS[0] = {};
  for (const [act, code] of Object.entries(custom1PKeys)) {
    if (code) {
      const realAct = act === 'jump2' ? 'jump' : act;
      KEYS[0][code] = realAct;
    }
  }
}
applyCustomKeys();
const human = [new Ctrl(), new Ctrl(), new Ctrl(), new Ctrl()];

// ======================= 联机（公共部分） =======================
// 联机只有一种连法：浏览器之间用 WebRTC 直接连（PeerJS 只负责牵线），不需要自己的服务器，见 net-p2p.js。
// 房主叫 host（青锋那一边），加入的人叫 client。对战用“回滚联机”（见下面 ROLL 一节）：两边每帧只交换按键。
const NET = { role: null, open: false, remote: new Ctrl(), out: [], presses: [], presses2: [] };
const localIdx = () => M.mode === 'net' && NET.role === 'client' ? 1 : 0;
const localTeam = () => {
  if (M.mode === '2v2' || (typeof is2v2 === 'function' && is2v2())) {
    if (M.subMode === 'pp_cc' || (M.mode === 'net' && netRoomMode === 'pp_cc')) return 0;
    if (M.mode === 'net') return NET.role === 'client' ? 1 : 0;
    return 0;
  }
  return localIdx();
};
// NET.solo：对方中途掉线，这台接着把对局打完（见 netSolo），这时自己就是唯一算对局的一方
const isClient = () => M.mode === 'net' && NET.role === 'client' && !ROLL.on && !NET.solo;
function netEmit(ev) { if (M.mode === 'net' && NET.role === 'host' && !ROLL.on && !NET.solo) NET.out.push(ev); }
function netReset() {
  ROLL.on = false;
  if (typeof mmStop === 'function') mmStop();
  mmUI(null);
  NET.peerQuit = false; NET.solo = false;
  NET.matching = false; NET.hold = false;
  p2pClose();
  NET.open = false; NET.code = null; NET.out = []; NET.presses.length = 0; NET.remote.clear();
  if (typeof updateNetLobby === 'function') updateNetLobby(false);
  if ($id('copyCodeBtn')) $id('copyCodeBtn').classList.add('hidden');
  if ($id('postToComBtn')) $id('postToComBtn').classList.add('hidden');
}
// 主动离开：告诉对方不用等我
function netLeave() {
  NET.leaving = true;
  if (NET.isRanked && !NET.rkDone && rkOwner() && rkState().pending) {   // 排位打到一半自己走：判负
    NET.rkDone = true;
    const r = rkFinish(false, 'quit');
    if (r) toast(`中途离开排位赛，判负（${r.delta} 分）`);
  }
  p2pBye();
  netOverlay(''); netReset();
}
// 建房 / 加入（快速匹配和排位走 mmGo）
function netConnect(asHost, code) { netConnectP2P(asHost, code); }
function netOverlay(text) { const o = $id('netOv'); o.textContent = text; o.classList.toggle('on', !!text); }
function onSys(m) {
  if (m.sys === 'room' && m.matched) {
    NET.role = m.role; NET.matching = false; NET.isRanked = !!m.ranked; NET.rkDone = false;
    let targetRule = 'normal';
    if (m.mmKind === '2v2_coop') targetRule = 'pp_cc';
    else if (m.mmKind === '2v2_vs') targetRule = 'pp_pp';
    if (typeof setRoomModeUI === 'function') setRoomModeUI(targetRule);
    if (m.mmKind === '2v2_coop') netStatus('2v2 双人共斗同袍已就位！');
    else if (m.mmKind === '2v2_vs') netStatus('2v2 对手已找到！');
    else netStatus(m.ranked ? '排位对手已找到！' : '对手已找到！');
    SFX.chargeFull();
    return;
  }
  if (m.sys === 'room') {
    NET.role = m.role; NET.code = m.code;
    if (m.role === 'host') {
      $id('roomCode').textContent = m.code;
      if ($id('copyCodeBtn')) $id('copyCodeBtn').classList.remove('hidden');
      if ($id('postToComBtn')) $id('postToComBtn').classList.remove('hidden');
      updateNetLobby(true, (ACC && ACC.name) || '侠客 (房主)', '静候对手入局…', m.code, false);
      netStatus('房间已建好。把上面的房间码发给朋友，静候他入局…');
    } else {
      updateNetLobby(true, '擂主 (房主)', (ACC && ACC.name) || '侠士 (应战)', m.code, true);
      netStatus('入局成功，正在同步战局…');
    }
  } else if (m.sys === 'ready') {
    NET.names = m.names || {}; NET.tiers = m.tiers || {}; NET.open = true;
    updateNetLobby(true, (m.names && m.names.host) || '房主', (m.names && m.names.client) || '对手', NET.code, true);
    if (NET.role === 'host') send({ sys: 'room_rule', rule: netRoomMode });
    NET_MAPV.host = NET_MAPV.client = null; netMapVoteSend(); renderLobbyMaps();   // 新对手进房：两边重新互报自己的票
    onNetOpen();
  } else if (m.sys === 'map_vote') {
    netMapVoteRecv(m.v);
  } else if (m.sys === 'room_rule') {
    setRoomModeUI(m.rule);
    const nameMap = { normal: '标准论剑 (BO3)', chaos: '天机乱斗 (随机词条)', maps: '山河异境 (地图投票)', pp_cc: '双人共斗 (双人破阵 vs AI)', pp_pp: '四人切磋 (2v2 玩家对决)', raid: '同袍肉鸽 (并肩讨伐魔首)' };
    toast(`擂主已设定切磋规则：${nameMap[m.rule] || '标准论剑'}`);
  } else if (m.sys === 'rematch') {
    if (NET.isRanked) return;   // 排位赛没有再战：打完各自回去重新匹配
    if (m.action === 'ask') {
      say('对手请求再战一局！', 1.2, 'go');
      const again = $id('againBtn');
      if (again) again.textContent = '接受再战 (BO3)';
    } else if (m.action === 'repick') {
      say('重新选人切磋', 1.0, 'go');
      if (NET.role === 'host') bpStart('net');
    } else if (m.action === 'start') {
      if (NET.role === 'client') {
        // 房主直接开启同阵容再战，收到后等 rstart 或 round 同步
        say('再战开启！', 1.0, 'go');
      }
    }
  }
  else if (m.sys === 'result') {
    if (m.me) setAcc(m.me);
    const kind = m.ranked ? '排行榜' : '切磋战绩', pm = m.won ? '+1 胜' : '+1 负', pr = m.prog || {};
    if (pr.profile) applyProfile(pr.profile);
    let t = m.forfeit ? (m.won ? `对手中途离席，这场算你赢（${kind} ${pm}）` : `中途离席，判负（${kind} ${pm}）`) : `${kind} ${pm}`;
    if (m.rk && pr.rank) {
      const up = pr.promo ? (pr.before && pr.before.idx < 0 ? ' · 定级完成！' : ' · 晋级！') : '';
      t = `排位赛 ${pr.delta >= 0 ? '+' : ''}${pr.delta} 分 · ${pr.rank.label}${up}`;
      if (pr.promo) { say(pr.rank.tier || pr.rank.label, 1.4, 'super'); SFX.gong(); }
    }
    if (pr.gain) t += ` · +${pr.gain} 墨锭`;
    $id('endRank').textContent = t; NET.lastResult = t;
  }
  else if (m.sys === 'match_finish') {
    NET.consensus = NET.consensus || {};
    const localW = NET.consensus.localWinner;
    const duration = Date.now() - (NET.matchStartTime || Date.now());
    const hits = NET.matchHits || 0;
    const isQualifying = m.qualifying && (duration >= 15000 || hits >= 4);
    const agreed = localW !== undefined ? (localW === m.winner) : true;
    NET.consensus.agreed = agreed;
    NET.consensus.qualifying = isQualifying;
    NET.consensus.gotFinish = true;
    send({ sys: 'match_ack', matchId: m.matchId, winner: m.winner, agreed, qualifying: isQualifying });
    tryCommitNet(false);
  }
  else if (m.sys === 'match_ack') {
    NET.consensus = NET.consensus || {};
    NET.consensus.peerAgreed = !!m.agreed;
    NET.consensus.qualifying = NET.consensus.qualifying && !!m.qualifying;
    NET.consensus.gotAck = true;
    tryCommitNet(false);
  }
  else if (m.sys === 'left') netLost();
  else if (m.sys === 'full') { netStatus('这间房已经满员'); netReset(); }
  else if (m.sys === 'version') { netStatus(`你的版本与房主不同（房主是 ${m.need}），刷新网页再试`); netReset(); }
}
function send(o) { p2pSend(o); }
function onNetOpen() {
  netStatus('已连接');
  send({ pskin: mySkinMap() });
  initAudio();
  if (NET.role === 'host') bpStart('net');
  else netStatus('已连接，即刻选人…');
}
// 2v2、3v3 车轮打到一半对方掉线（房主掉线也一样）：留下的这台接过对局，自己当房主，
// 对方那边的人交给电脑，这一局接着打完。1v1、排位和同袍肉鸽还是照旧结束
function netSolo() {
  if (!ROLL.on || ROLL.ended || M.mode !== 'net' || M.phase === 'end' || NET.isRanked) return false;
  const def = roomDef();
  if (def.raid || !(def.four || M.duo)) return false;
  if (ROLL.pend < ROLL.F) rollResim();   // 先用已经收到的按键把猜错的帧改对
  const mine = NET.role === 'client' ? 1 : 0, wasHost = mine === 0;
  ROLL.slots[1 - mine].forEach(i => { fighterByIdx(i).ctrl = new AICtrl(M.level || 'god'); });
  ROLL.slots[mine].forEach((i, k) => { fighterByIdx(i).ctrl = human[k]; });
  human[0].rec = human[1].rec = null; NET.presses.length = 0; NET.presses2.length = 0;
  ROLL.on = false; REC.bad = true; NET.solo = true;
  NET.open = false; p2pClose();
  netOverlay('');
  const who = NET.peerQuit ? '离开了' : '掉线了';
  const msg = wasHost ? `对手${who}，对面的人改由电脑接手，这局接着打（不计入战绩）` : `房主${who}，这局由你接管，对面的人改由电脑接手（不计入战绩）`;
  toast(msg); netStatus(msg);
  NET.consensus = { committed: true };   // 没法和对方核对结果，不上报
  NET.lastResult = '';
  return true;
}
function netLost() {
  if (netSolo()) return;
  const was = M.mode === 'net' || bpMode === 'net';
  // 排位赛打到一半对方走了：对方主动离开算你赢，网络断开不计分
  let rkMsg = '';
  if (NET.isRanked && !NET.rkDone && rkState().pending) {
    NET.rkDone = true;
    if (NET.peerQuit) { const r = rkFinish(true, 'forfeit'); if (r) rkMsg = `对手中途离开，这场排位算你赢（${rkResultText(r)}）`; }
    else { rkClearPending(); rkMsg = '排位对局因网络中断，不计分'; }
  }
  netOverlay('');
  netReset();
  if (was) { toMenu(); selectMode('net'); }
  $id('roomCode').textContent = '';
  netStatus(rkMsg || '对局已中断（未完成，不扣分）。可重新建房或加入');
  if (rkMsg) toast(rkMsg);
  NET.lastResult = '';
}
// 状态快照：房主每帧发一次
const FK = ['x', 'y', 'vx', 'vy', 'face', 'hp', 'meter', 'state', 't', 'invul', 'dashCD', 'jumps', 'airDash', 'stun', 'juggle', 'comboHits',
  'spiked', 'bounced', 'sp', 'slashN', 'finalDone', 'spFace', 'dashDir', 'lunged', 'hitDone', 'hitConfirmed', 'chargeFull', 'moveName', 'rot', 'breakCD',
  'skillCD', 'skPh', 'armorT', 'armorHits', 'parryT', 'thunderGuardT', 'buffT', 'skill', 'regenLeft', 'sinceHit', 'spN', 'spPose', 'rooted', 'flyT', 'flying', 'skill2CD', 'escInvul', 'escMode', 'escT', 'bbX', 'bbT', 'twinT', 'diveAir', 'diveChained', 'ink', 'notes', 'noteT', 'drunk', 'reflectT', 'hookedT', 'burnT', 'breath', 'slowT', 'drinkT', 'jailT', 'jailX', 'avaFree', 'avaChain', 'fu', 'fuT', 'skAir'];
// 同步数据用数组而不是对象，体积小一半多
function snapF(f) { return FK.map(k => f[k] === undefined ? null : r2(f[k])); }
// 被打的状态：这些一定听房主的
const VICTIM = ['hitstun', 'launched', 'knockdown', 'getup', 'held', 'blockstun'];
function applyF(f, arr, exact) {
  const o = {}; FK.forEach((k, i) => { o[k] = arr[i]; });
  const mine = !exact && f.idx === localIdx();
  if (mine && !VICTIM.includes(o.state) && !VICTIM.includes(f.state) && Math.abs(o.x - f.x) < 90 && Math.abs(o.y - f.y) < 90) {
    // 自己的角色：按键立刻生效，只同步血量、气和少量位置修正，不把自己拉回旧位置
    f.hp = o.hp; f.meter = o.meter; f.comboHits = o.comboHits; f.juggle = o.juggle; f.breakCD = o.breakCD;
    f.x += (o.x - f.x) * 0.08;
    return;
  }
  const ox = f.x, oy = f.y;
  for (const k of FK) f[k] = o[k];
  // 平滑修正：位置按房主的来，但画面上从旧位置慢慢滑过去（不影响判定）
  if (!exact && Math.abs(o.x - ox) < 90 && Math.abs(o.y - oy) < 90) { f.vox = (f.vox || 0) + ox - o.x; f.voy = (f.voy || 0) + oy - o.y; }
  else { f.vox = 0; f.voy = 0; }
  f.move = f.state === 'attack' && f.moveName ? f.moves[f.moveName] : null;
}
function snapshot() {
  return { f: [snapF(A), snapF(B)], m: [M.phase, M.t, M.round, M.wins, M.timer, M.koWinner], g: [r2(superFreeze), superOwner ? superOwner.idx : -1], p: projs.map(q => { const o = {}; for (const k in q) o[k] = r2(q[k]); return o; }) };
}
function applySnapshot(sn, exact) {
  applyF(A, sn.f[0], exact); applyF(B, sn.f[1], exact);
  [M.phase, M.t, M.round, M.wins, M.timer, M.koWinner] = sn.m;
  superFreeze = sn.g[0]; superOwner = sn.g[1] >= 0 ? [A, B][sn.g[1]] : null;
  if (superFreeze > 0 && !superOwner) superFreeze = 0;
  if (sn.p) { projs.length = 0; for (const q of sn.p) projs.push(q); }
}
function onNetMsg(msg) {
  if (msg.mstart || msg.report) return;
  if (msg.ru !== undefined) { rollRecv(msg); return; }
  if (msg.rstart) { rollStart(msg.rstart.ch, msg.rstart.seed, msg.rstart.duo, msg.rstart.mv); return; }
  if (msg.rsync) { rollAdopt(msg.rsync); return; }
  if (msg.rdesync) { if (NET.role === 'host' && rollMine(msg)) rollSendSync(); return; }
  if (msg.pg !== undefined) { send({ po: msg.pg }); return; }
  if (msg.po !== undefined) { const r = performance.now() - msg.po; NET.rtt = NET.rtt ? NET.rtt * 0.7 + r * 0.3 : r; return; }
  if (msg.chat) { chatRecv(msg.chat); return; }
  if (msg.i) {
    const c = NET.remote, h = msg.i.h, wasAtk = c.held.atk;
    c.held.left = !!(h & 1); c.held.right = !!(h & 2); c.held.down = !!(h & 4); c.held.atk = !!(h & 8); c.held.jump = !!(h & 16); c.held.aim = (h & 64) ? ((h & 32) ? -1 : 1) : 0;
    if (c.held.atk && !wasAtk) c.atkT = clock;
    for (const a of msg.i.p) c.press(a);
  }
  if (msg.ev) for (const ev of msg.ev) playEvent(ev);
  if (msg.bps && NET.role === 'client') {
    if (!BP || BP.step !== msg.bps.step) bpSel = -1; BP = msg.bps; bpMode = 'net'; ensurePortraits(); if (BP.step < bpSteps().length) showScreen('bp'); renderBP();
    if (!BP.avail || !BP.avail[1]) send({ avail: availList() });
  }
  if (msg.avail && NET.role === 'host') { NET.peerAvail = msg.avail; if (BP && BP.avail) { BP.avail[1] = msg.avail; send({ bps: BP }); renderBP(); } }
  if (msg.pskin) NET.peerSkins = msg.pskin;
  if (msg.bp !== undefined && NET.role === 'host' && BP && BP.step < bpSteps().length && bpSteps()[BP.step][0] === 1) bpApply(msg.bp);
  if (msg.s && NET.role === 'client' && M.mode === 'net') applySnapshot(msg.s);
}
function playEvent(ev) {
  if (ev.e === 'hit') {
    const now = performance.now();
    while (predicted.length && now - predicted[0] > 400) predicted.shift();
    if (ev.a === localIdx() && predicted.length && !ev.ko) { predicted.shift(); hitVisual(ev, true); }
    else hitVisual(ev);
  }
  else if (ev.e === 'parry') parryVisual(ev);
  else if (ev.e === 'thunder_counter') thunderCounterVisual(ev);
  else if (ev.e === 'say') { say(ev.text, ev.dur, ev.style); if (ev.snd) SFX[ev.snd](); }
  else if (ev.e === 'round') {
    if (ev.ch) setChars(ev.ch[0], ev.ch[1]);
    if (M.mode !== 'net') { setupNetMatch(); MSTAT.maxcombo = 0; MSTAT.ults = 0; }
    applySkins();
    if (ev.r === 1) { send({ mstart: 1 }); $id('endRank').textContent = ''; }
    BP = null; showScreen(null);
    M.round = ev.r; M.wins = ev.w; startRound();
  } else if (ev.e === 'end') {
    M.wins = ev.wins; M.phase = 'end'; showEnd(ev.w);
  }
}
function netTick(dt) {
  // 排队时每 4 秒告诉服务器“我还在”，不然等久了会被当成掉线清出队列
  if (M.mode !== 'net' && bpMode !== 'net') return;
  if (!NET.open) return;
  NET.pingAcc = (NET.pingAcc || 0) + dt;
  if (NET.pingAcc >= 1) { NET.pingAcc = 0; const now = performance.now(); send({ pg: now }); }   // 只量和对手之间的延迟：联机是点对点，没有服务器可量
  if (M.mode !== 'net' || NET.hold || ROLL.on) return;
  const h = human[0].held;
  const hb = (h.left ? 1 : 0) | (h.right ? 2 : 0) | (h.down ? 4 : 0) | (h.atk ? 8 : 0) | (h.jump ? 16 : 0) | (h.aim < 0 ? 32 : 0) | (h.aim ? 64 : 0);
  NET.snapAcc = (NET.snapAcc || 0) + dt; NET.keepAcc = (NET.keepAcc || 0) + dt;
  const msg = {};
  if (hb !== NET.lastH || NET.presses.length || NET.keepAcc > 0.5) { msg.i = { h: hb, p: NET.presses.splice(0) }; NET.lastH = hb; NET.keepAcc = 0; }
  if (NET.role === 'host') {
    if (NET.snapAcc >= 1 / 60) { NET.snapAcc = 0; msg.s = snapshot(); }
    if (NET.out.length) msg.ev = NET.out.splice(0);
  }
  if (msg.i || msg.s || msg.ev) send(msg);
}
const r2 = v => typeof v === 'number' ? Math.round(v * 100) / 100 : v;
function setupNetMatch() {
  M.mode = 'net'; M.wins = [0, 0]; M.round = 1; M.carry = null; M.duo = null; M.map = null; A.meter = B.meter = 0; NET.solo = false;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  NET.remote.clear(); NET.presses.length = 0; human[0].rec = NET.presses;
  if (netRoomMode === 'pp_cc' || netRoomMode === 'raid') {
    M.subMode = netRoomMode;
    M.level = 'god';
    M.watchAi = false;
    if (netRoomMode === 'raid') { M.raidSquadSize = 3; C.hidden = D.hidden = B.hidden = false; }   // 魔首和开局秘卷要两边一样，在 rollStart 里按种子定（netRaidSetup）
    if (NET.role === 'host') {
      A.ctrl = human[0];
      C.ctrl = NET.remote;
    } else {
      A.ctrl = NET.remote;
      C.ctrl = human[0];
    }
    B.ctrl = new AICtrl('god');
    D.ctrl = new AICtrl('god');
    if (!B.ch) B.setChar(1);
    if (!D.ch) D.setChar(3);
  } else if (netRoomMode === 'pp_pp') {
    M.subMode = 'pp_pp';
    M.watchAi = false;
    if (NET.role === 'host') {
      A.ctrl = human[0];
      C.ctrl = human[1] || new AICtrl('god');
      B.ctrl = NET.remote;
      D.ctrl = new AICtrl('god');
    } else {
      A.ctrl = NET.remote;
      C.ctrl = new AICtrl('god');
      B.ctrl = human[0];
      D.ctrl = human[1] || new AICtrl('god');
    }
    if (!C.ch) C.setChar((A.chIdx + 2) % CHARS.length);
    if (!D.ch) D.setChar((B.chIdx + 2) % CHARS.length);
  } else {
    M.subMode = null;
    A.ctrl = NET.role === 'host' ? human[0] : NET.remote;
    B.ctrl = NET.role === 'host' ? NET.remote : human[0];
  }
  NET.matchStartTime = Date.now();
  NET.matchHits = 0;
  NET.matchId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  NET.consensus = { agreed: false, peerAgreed: false, qualifying: true, committed: false, pendingReport: false };
  rkBegin();
}

