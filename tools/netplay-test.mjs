// 两台“电脑”联机对打的无画面测试：两个沙盒各跑一份游戏，中间用带延迟的假网线连起来，
// 双方随机乱按，最后比较两边算出来的对局是不是一模一样（回滚联机必须做到这一点）。
// 用法：node tools/netplay-test.mjs [--seed N]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { gameSource } from './ai-code.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const argSeed = process.argv.indexOf('--seed');
const SEED0 = argSeed > 0 ? +process.argv[argSeed + 1] : 1;
const NETJS = readFileSync(ROOT + 'src/net-p2p.js', 'utf8');
const GAME = new vm.Script(gameSource());
let now = 0;

function makePeer(outbox) {
  const noop = () => {};
  const grad = { addColorStop: noop };
  const ctx2d = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') ? () => grad : k === 'getImageData' ? () => ({ data: [] }) : noop, set: () => true });
  const el = () => ({
    getContext: () => ctx2d, getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0, right: 1440, bottom: 900 }),
    addEventListener: noop, removeEventListener: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: { setProperty: noop }, appendChild: noop, remove: noop, querySelector: () => null, querySelectorAll: () => [],
    setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop, dataset: {}, children: [], innerHTML: '', textContent: '', value: ''
  });
  const w = {
    innerWidth: 1440, innerHeight: 900, addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }),
    document: { getElementById: el, querySelectorAll: () => [], querySelector: el, createElement: el, addEventListener: noop, removeEventListener: noop, body: el(), documentElement: el() },
    location: { protocol: 'http:', hostname: '127.0.0.1', search: '', hash: '' },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    performance: { now: () => now }, navigator: { userAgent: 'node' },
    requestAnimationFrame: noop, console: { log: noop, warn: noop, error: noop },
    setTimeout: noop, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    AudioContext: class { createGain() { return { connect: noop }; } }, Audio: class { play() {} pause() {} },
    Math: Object.create(Math), Date
  };
  w.window = w; w.globalThis = w;
  vm.createContext(w);
  new vm.Script(NETJS).runInContext(w);
  GAME.runInContext(w);
  w.__out = outbox;
  vm.runInContext(`P2P.conn = { open: true, send: o => __out.push(JSON.stringify(o)) };`, w);
  return w;
}

// 联机录像在一台新的“电脑”上放一遍，在记下的那几帧和原局比：位置、血量、电脑的想法都得一模一样
function replayDiff(m, checks) {
  const w = makePeer([]);
  w.Math.random = rng(99);   // 放录像的这台随机数和对局时都不一样
  vm.runInContext(`netRoomMode = 'normal'; startReplay(${JSON.stringify(m)});`, w);
  const strip = j => { const o = JSON.parse(j); delete o.M.mode; return JSON.stringify(o); };
  let k = 0;
  for (const [f, want] of checks) {
    if (f > m.frames) break;
    while (k < f) { vm.runInContext('replayFrame()', w); k++; }
    const got = vm.runInContext('JSON.stringify(capState())', w);
    if (strip(STJSON(JSON.parse(got))) !== strip(want)) {
      const a = JSON.parse(strip(want)), b = JSON.parse(strip(STJSON(JSON.parse(got)))), out = [];
      const walk = (x, y, p) => { if (out.length > 2) return; if (x && y && typeof x === 'object' && typeof y === 'object') { for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[key], y[key], p + '.' + key); } else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${p} 原局=${JSON.stringify(x)} 回放=${JSON.stringify(y)}`); };
      walk(a, b, '');
      return `第 ${f} 帧：${out.join('；')}`;
    }
  }
  // 同袍肉鸽的录像放到打赢魔首：看录像不能发墨锭
  if (m.raid) {
    const r = JSON.parse(vm.runInContext(`(() => { const i0 = PROF.ink || 0; B.hp = 0; M.koWinner = 0; endRound(); return JSON.stringify({ raid: isRaid(), gain: (PROF.ink || 0) - i0 }); })()`, w));
    if (!r.raid || r.gain) return `同袍肉鸽录像：规则=${r.raid}，放到打赢多了 ${r.gain} 墨锭`;
  }
  return '';
}

// 本测试自己的伪随机数（不用 Math.random，好复现）
function rng(s) { return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return ((s >>> 0) % 1e6) / 1e6; }; }

// 这几种房间的联机录像要能原样放出来（以前神决和同袍肉鸽回放时不认房间规则：神决的十倍气血、魔首都没了）
const REPLAY_OK = ['normal', 'chaos', 'mayhem', 'maps', 'pp_cc', 'pp_pp', 'raid'];
const STJSON = st => JSON.stringify(st, (k, v) => k === 'sk' ? undefined : typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
function runCase(mode, chars, seed, frames, lag, duo, mv) {
  now = 0;
  const box = [[], []];   // box[0]：房主发出的，box[1]：加入的人发出的
  const P = [makePeer(box[0]), makePeer(box[1])];
  // 让 Math.random 在两边各自不同：真机上就是这样，靠它算对局的地方一定会对不上
  P[0].Math.random = rng(seed * 7 + 1); P[1].Math.random = rng(seed * 7 + 2);
  P.forEach((w, i) => vm.runInContext(`NET.role = '${i ? 'client' : 'host'}'; NET.open = true; netRoomMode = '${mode}';`, w));
  const dice = [rng(seed * 13 + 3), rng(seed * 13 + 4)];
  const errs = [];
  const G = P.map(w => ({ human: vm.runInContext('human', w), rollTick: vm.runInContext('rollTick', w), onNetMsg: vm.runInContext('onNetMsg', w) }));
  for (const w of P) vm.runInContext(`rollStart(${JSON.stringify(chars)}, ${seed}, ${JSON.stringify(duo || null)}, ${JSON.stringify(mv || null)});`, w);   // mv：山河异境两边的票
  const wire = [[], []], checks = [];
  const PRESS = ['light', 'jump', 'dash', 'skill', 'skill2', 'special'];
  for (let t = 0; t < frames + 600; t++) {
    now += 1000 / 60;
    for (let i = 0; i < 2; i++) {
      const w = P[i], d = dice[i];
      if (t < frames) {
        const h = G[i].human[0].held;
        if (d() < 0.15) { h.left = d() < 0.4; h.right = !h.left && d() < 0.5; h.down = d() < 0.1; h.atk = d() < 0.3; h.jump = d() < 0.1; }
        if (d() < 0.12) G[i].human[0].press(PRESS[(d() * PRESS.length) | 0]);
      } else G[i].human[0].clear();
      try {
        if (vm.runInContext('ROLL.F', w) < frames + 300) G[i].rollTick(1 / 60);
        else vm.runInContext('if (ROLL.pend < ROLL.F) rollResim(); rollSend();', w);
      } catch (e) { if (errs.length < 4) errs.push(`${i ? 'client' : 'host'} @${t}: ${e.stack.split('\n').slice(0, 2).join(' | ')}`); }
      while (box[i].length) wire[i].push([t + lag, box[i].shift()]);
    }
    for (let i = 0; i < 2; i++) while (wire[i].length && wire[i][0][0] <= t) G[1 - i].onNetMsg(JSON.parse(wire[i].shift()[1]));
    // 回放对照：每 300 帧记下房主这边一帧两边都确认过的状态
    if (t % 300 === 299) { const x = vm.runInContext(`(() => { const f = Math.min(ROLL.F, ROLL.remLast + 1) - 1, sn = ROLL.snaps[f % ROLL.N]; return sn && sn.f === f && ROLL.pend > f ? [f, sn.st] : null; })()`, P[0]); if (x) checks.push([x[0], STJSON(x[1])]); }
  }
  const rp = REPLAY_OK.includes(mode) && replayDiff(JSON.parse(vm.runInContext('recNet(); JSON.stringify({ ...REC.meta, ev: REC.ev, frames: REC.nf })', P[0])), checks);
  // 两边停的帧可能差一两帧：比较双方都确认过的同一帧存档（和游戏里自己校验用的是同一份）
  const info = P.map(w => JSON.parse(vm.runInContext('JSON.stringify({ F: ROLL.F, last: ROLL.remLast, desyncs: ROLL.desyncs, rollbacks: ROLL.rollbacks, n: allFighters().length })', w)));
  const f = Math.min(...info.map(x => Math.min(x.F, x.last + 1))) - 1;
  const [h, c] = P.map(w => JSON.parse(vm.runInContext(`(() => { const sn = ROLL.snaps[${f} % ROLL.N]; return sn && sn.f === ${f} ? JSON.stringify(sn.st) : 'null'; })()`, w),
    (k, v) => k === 'sk' ? undefined : typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
  const diff = [];
  if (!h || !c) diff.push(`第 ${f} 帧的存档不见了`);
  const walk = (a, b, path) => {
    if (diff.length > 8) return;
    if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], path + '.' + k); }
    else if (JSON.stringify(a) !== JSON.stringify(b)) diff.push(`${path}: 房主=${JSON.stringify(a)} 对方=${JSON.stringify(b)}`);
  };
  if (h && c) walk(h, c, '');
  // 中途校验对不上也算失败：游戏会让房主发存档纠正，玩家看到的是角色突然一闪
  if (info[0].desyncs || info[1].desyncs) diff.push(`对局中校验对不上 ${info[0].desyncs}/${info[1].desyncs} 次`);
  if (rp) diff.push('回放和原局不一样：' + rp);
  // 天机乱斗：两边都抽到了同一条异变，而且两边都在生效（以前只有房主抽，效果只认本地模式）
  if (mode === 'chaos') {
    const on = P.map(w => vm.runInContext('JSON.stringify({ i: M.chaos ? M.chaos.i : -1, live: typeof chaosNow === "function" ? !!chaosNow() : false })', w)).map(JSON.parse);
    if (!(h && h.M.chaos && h.M.chaos.i >= 0) || !on.every(x => x.live && x.i === on[0].i)) diff.push('天机乱斗的异变没有在两边一起生效：' + JSON.stringify(on));
  }
  // 山河异境：两边选到同一张图，而且两边的地形都在生效
  if (mode === 'maps') {
    const on = P.map(w => vm.runInContext('JSON.stringify({ map: M.map, live: !!mapNow(), w: STAGE_W })', w)).map(JSON.parse);
    if (!on[0].map || !on.every(x => x.live && x.map === on[0].map && x.w === on[0].w)) diff.push('山河异境的地图两边不一样或没生效：' + JSON.stringify(on));
  }
  return { errs, diff, F: info.map(x => x.F), desyncs: info.map(x => x.desyncs), rollbacks: info.map(x => x.rollbacks), fighters: info[0].n, frame: f, round: h && h.M ? `第${h.M.round}回合 比分${h.M.wins} ${h.M.phase}` : '' };
}

let fail = 0;
// 建房前问服务器要的 ICE 列表：有 TURN 就带上；服务器连不上就只用网页里固定的 STUN
{
  const w = makePeer([]);
  const run = code => vm.runInContext(code, w);
  w.CloudSave = { getEndpoint: () => 'https://w.test' };
  w.fetch = async () => ({ ok: true, json: async () => ({ ok: true, turn: true, ttl: 21600, iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:t.test:3478'], username: 'u', credential: 'c' }] }) });
  await run('p2pIce()');
  const a = run('JSON.stringify(p2pOptions().config.iceServers)');
  const list = JSON.parse(a), turns = list.filter(x => x.username);
  const okA = turns.length === 1 && list.length === run('P2P.ice.length') + 2 && run('P2P.turn') === true;
  w.fetch = async () => { throw new Error('offline'); };
  run('P2P.remoteIce = null; P2P.turn = false;');
  await run('p2pIce()');
  const b = JSON.parse(run('JSON.stringify(p2pOptions().config.iceServers)'));
  const okB = b.length === run('P2P.ice.length') && !b.some(x => x.username) && /中转/.test(run('p2pNoRouteText()'));
  if (!okA || !okB) fail++;
  console.log(`${okA && okB ? '  PASS' : '  FAIL'}  ICE 列表：服务器给了 TURN 就加上（${turns.length} 条），连不上就只用固定 STUN（${b.length} 条）`);
}
// 同袍肉鸽 · 好友联机：房间规则要一直是 raid（以前被改回了双人共斗），点将完开的是三人打魔首
{
  const w = makePeer([]);
  const run = code => vm.runInContext(code, w);
  const r = JSON.parse(run(`(() => {
    NET.role = 'host'; NET.open = true; setRoomModeUI('raid');
    const rule = netRoomMode;
    bpStart('net');
    const order = JSON.stringify(BP.steps);
    for (const i of [4, 7, 9]) bpApply(i);
    currentScreen = 'bp'; bpFinish();
    const ink0 = PROF.ink || 0;
    const r = { rule, order, raid: isRaid(), slots: JSON.stringify(ROLL.slots), A: A.chIdx, C: C.chIdx, D: D.chIdx, boss: (B.bossSkills || []).length, bossHp: B.maxHp, heroes: M.raidBoss && M.raidBoss.heroes.length };
    B.hp = 0; M.koWinner = 0; endRound();
    r.endPhase = M.phase; r.paidEarly = (PROF.ink || 0) - ink0;
    showEnd(0); showEnd(0);
    r.paid = (PROF.ink || 0) - ink0;
    return JSON.stringify(r);
  })()`));
  const ok = r.rule === 'raid' && r.order === JSON.stringify([[0, 'pick'], [1, 'pick'], [0, 'pick']]) && r.raid && r.slots === '[[0],[2]]'
    && r.A === 4 && r.C === 7 && r.D === 9 && r.boss === 6 && r.heroes === 3 && r.endPhase === 'end' && r.paidEarly === 0 && r.paid === 600;
  if (!ok) fail++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  同袍肉鸽 · 好友联机：规则 ${r.rule}，A/C/D=${r.A}/${r.C}/${r.D}，魔首 ${r.boss} 技 ${r.bossHp} 血，确认打完才发墨锭（先 ${r.paidEarly}，后 ${r.paid}）`);
}
// 连接状态机（不用真的网络：假的数据通道和 ICE 事件）
{
  const w = makePeer([]);
  const run = code => vm.runInContext(code, w);
  run(`globalThis.fakeConn = () => { const h = {}, ph = {};
    return { open: false, sent: [], on(e, f) { (h[e] = h[e] || []).push(f); }, emit(e, x) { (h[e] || []).forEach(f => f(x)); },
      send(o) { this.sent.push(o); }, close() { this.open = false; },
      peerConnection: { iceConnectionState: 'new', addEventListener(e, f) { (ph[e] = ph[e] || []).push(f); },
        to(s) { this.iceConnectionState = s; (ph.iceconnectionstatechange || []).forEach(f => f()); } } }; };
    globalThis.lefts = 0; const s0 = onSys; onSys = m => { if (m.sys === 'left') lefts++; else s0(m); };`);
  const checks = [];
  const ok = (name, v) => { checks.push([name, !!v]); };
  // 消息大小上限
  const n0 = w.__out.length;
  ok('太大的消息不发', run(`p2pSend({ big: 'x'.repeat(70000) })`) === false && w.__out.length === n0 && run('P2P.dropped') === 1);
  ok('正常的消息照发', run(`p2pSend({ ru: 1 })`) === true && w.__out.length === n0 + 1);
  // 还没连通就 ICE failed：马上报打不通，不用等 45 秒
  run(`P2P.conn = fakeConn(); globalThis.iceFail = 0; p2pWire(P2P.conn, P2P.sess, 'client', () => {}, () => {}, () => iceFail++); P2P.conn.peerConnection.to('failed');`);
  ok('没连通时 ICE 失败立刻报', run('iceFail') === 1 && run('P2P.conn') === null);
  // 连通以后：ICE 断一下先等，恢复了回到 open；超过宽限还没恢复就算断线
  run(`NET.open = true; NET.leaving = false; P2P.conn = fakeConn(); globalThis.c1 = P2P.conn; p2pWire(c1, P2P.sess, 'client', () => {}, () => {}); c1.open = true; c1.emit('open');`);
  ok('连通后状态是 open', run('P2P.state') === 'open');
  run(`c1.peerConnection.to('disconnected')`);
  ok('ICE 断一下：网络不稳、先不判断线', run('P2P.state') === 'unstable' && run('lefts') === 0 && run('P2P.graceUntil') > 0);
  run(`c1.peerConnection.to('connected')`);
  ok('ICE 自己恢复：回到 open', run('P2P.state') === 'open' && run('P2P.graceUntil') === 0);
  run(`c1.peerConnection.to('disconnected'); P2P.graceUntil = Date.now() - 1; p2pBeat();`);
  ok('宽限期过了还没恢复：算断线', run('lefts') === 1 && run('P2P.conn') === null && run('P2P.state') === 'closed');
  // 心跳：5 秒没动静提示网络不稳，收到消息恢复；20 秒没动静算断线
  run(`NET.open = true; P2P.conn = fakeConn(); globalThis.c2 = P2P.conn; p2pWire(c2, P2P.sess, 'host', () => {}, () => {}); c2.open = true; c2.emit('open');
    P2P.lastRx = Date.now() - 6000; p2pBeat();`);
  ok('心跳：5 秒没动静是网络不稳', run('P2P.state') === 'unstable' && run('lefts') === 1 && run('c2.sent.some(m => m.sys === "ping")'));
  run(`c2.emit('data', { sys: 'pong', t: 0 })`);
  ok('心跳：又收到消息就恢复', run('P2P.state') === 'open');
  run(`P2P.lastRx = Date.now() - 21000; p2pBeat();`);
  ok('心跳：20 秒没动静算断线', run('lefts') === 2 && run('P2P.conn') === null);
  // 主动离开：先发 left 再关；对方收到 left 记成“主动离开”
  run(`NET.open = true; P2P.conn = fakeConn(); globalThis.c3 = P2P.conn; p2pWire(c3, P2P.sess, 'host', () => {}, m => { if (m.sys) onSys(m); }); c3.open = true; c3.emit('open'); NET.peerQuit = false; c3.emit('data', { sys: 'left' });`);
  ok('收到 left：记成主动离开', run('NET.peerQuit') === true && run('lefts') === 3);
  run(`P2P.conn = fakeConn(); globalThis.c4 = P2P.conn; c4.open = true; p2pBye();`);
  ok('自己离开：先把 left 发出去', run('c4.sent.some(m => m.sys === "left")') && run('P2P.conn') === null);
  // 房间过期：没人来的房间 30 分钟后关掉
  run(`P2P.conn = null; P2P.opened = true; p2pState('wait'); P2P.roomAt = Date.now() - 31 * 60e3; p2pBeat();`);
  ok('没人来的房间 30 分钟后关闭', run('P2P.state') === 'idle' && run('P2P.opened') === false);
  run(`p2pState('wait'); P2P.roomAt = Date.now() - 10 * 60e3; p2pBeat();`);
  ok('10 分钟的房间还开着', run('P2P.state') === 'wait');
  const bad = checks.filter(x => !x[1]);
  if (bad.length) fail++;
  console.log(`${bad.length ? '  FAIL' : '  PASS'}  连接状态机：${checks.length} 项（大小上限、ICE 失败和恢复、心跳、离开、房间过期）`);
  for (const [n] of bad) console.log('        没通过 ' + n);
}

// 本地天机乱斗照旧：开打就抽一条异变，15 秒换一条，效果只在乱斗里生效
{
  const w = makePeer([]);
  const r = JSON.parse(vm.runInContext(`(() => { startChaos(0, 1, 'normal', true); M.phase = 'fight'; let rolls = M.chaos.i >= 0 ? 1 : 0;
    for (let i = 0; i < Math.round(31 / STEP); i++) { updateChaos(STEP); if (M.chaos.t === 0) rolls++; }
    const live = !!chaosNow(); M.mode = 'cpu'; const off = !chaosNow();
    return JSON.stringify({ rolls, live, off }); })()`, w));
  const ok = r.rolls === 3 && r.live && r.off;
  if (!ok) fail++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  本地天机乱斗：31 秒里抽了 ${r.rolls} 次异变（开打一次，之后每 15 秒一次），只在乱斗里生效`);
  if (!ok) console.log('        ' + JSON.stringify(r));
}

// 2v2、3v3 打到一半对方掉线（房主掉线也算）：留下的这台接着打完，对方的人交给电脑
function runDrop(mode, chars, duo, dropper, seed) {
  now = 0;
  const box = [[], []];
  const P = [makePeer(box[0]), makePeer(box[1])];
  P[0].Math.random = rng(seed * 7 + 1); P[1].Math.random = rng(seed * 7 + 2);
  P.forEach((w, i) => vm.runInContext(`NET.role = '${i ? 'client' : 'host'}'; NET.open = true; netRoomMode = '${mode}';`, w));
  for (const w of P) vm.runInContext(`rollStart(${JSON.stringify(chars)}, ${seed}${duo ? ', ' + JSON.stringify(duo) : ''});`, w);
  const G = P.map(w => ({ human: vm.runInContext('human', w), onNetMsg: vm.runInContext('onNetMsg', w) }));
  const d = rng(seed * 13 + 5), wire = [[], []], errs = [], keep = 1 - dropper, PRESS = ['light', 'jump', 'dash', 'skill', 'skill2', 'special'];
  const W = P[keep];
  let dropped = false, clock0 = 0, t = 0;
  for (; t < 30000; t++) {
    now += 1000 / 60;
    if (t === 900) {   // 断线：掉线那台从此消失，留下那台的直连报“对方走了”
      dropped = true;
      clock0 = vm.runInContext('clock', W);
      try { vm.runInContext(`onSys({ sys: 'left' })`, W); } catch (e) { errs.push('断线时 ' + e.stack.split('\n').slice(0, 2).join(' | ')); }
    }
    for (let i = 0; i < 2; i++) {
      if (dropped && i === dropper) continue;
      const h = G[i].human[0].held;
      if (d() < 0.15) { h.left = d() < 0.4; h.right = !h.left && d() < 0.5; h.atk = d() < 0.3; h.jump = d() < 0.1; }
      if (d() < 0.12) G[i].human[0].press(PRESS[(d() * PRESS.length) | 0]);
      try { vm.runInContext('simTick(1 / 60)', P[i]); } catch (e) { if (errs.length < 4) errs.push(`${i ? 'client' : 'host'} @${t}: ${e.stack.split('\n').slice(0, 2).join(' | ')}`); }
      while (box[i].length) { const m = box[i].shift(); if (!dropped) wire[i].push([t + 2, m]); }
    }
    if (!dropped) for (let i = 0; i < 2; i++) while (wire[i].length && wire[i][0][0] <= t) G[1 - i].onNetMsg(JSON.parse(wire[i].shift()[1]));
    if (dropped && vm.runInContext('M.phase', W) === 'end') break;
  }
  const r = JSON.parse(vm.runInContext(`JSON.stringify({ mode: M.mode, roll: ROLL.on, solo: !!NET.solo, phase: M.phase, wins: M.wins, clock,
    ai: ROLL.slots[${dropper}].map(i => fighterByIdx(i).ctrl instanceof AICtrl), mine: ROLL.slots[${keep}].map((i, k) => fighterByIdx(i).ctrl === human[k]) })`, W));
  r.errs = errs; r.after = r.clock - clock0; r.frames = t;
  return r;
}
{
  const DROPS = [['pp_cc', [0, 3, 5, 9]], ['pp_pp', [2, 7, 4, 6]], ['normal', [2, 3], [[2, 5, 12], [3, 4, 7]]]];
  for (const [mode, ch, duo] of DROPS) for (const dropper of [0, 1]) {
    const r = runDrop(mode, ch, duo, dropper, SEED0 + ch[0] * 17 + dropper);
    const ok = !r.errs.length && r.mode === 'net' && !r.roll && r.solo && r.ai.every(Boolean) && r.mine.every(Boolean) && r.after > 20 && r.phase === 'end';
    if (!ok) fail++;
    console.log(`${ok ? '  PASS' : '  FAIL'}  ${mode} ${duo ? '3v3 车轮' : JSON.stringify(ch)} ${dropper ? '加入的人' : '房主'}掉线：${r.mode === 'net' && r.solo ? `留下的人接着打了 ${r.after.toFixed(0)} 秒` : '留下的人被送回了大厅'}，${r.phase === 'end' ? '打完了' : '没打完'}（${r.phase}，比分 ${r.wins}）`);
    for (const e of r.errs) console.log('        报错 ' + e);
    if (!ok) console.log('        ' + JSON.stringify(r));
  }
  // 1v1 还是照旧：对方掉线就结束回到大厅
  const w = makePeer([]);
  vm.runInContext(`NET.role = 'client'; NET.open = true; netRoomMode = 'normal'; rollStart([0, 3], 9); for (let i = 0; i < 300; i++) { ROLL.remLast = ROLL.F + 2; rollTick(1 / 60); } onSys({ sys: 'left' });`, w);
  const one = JSON.parse(vm.runInContext('JSON.stringify({ mode: M.mode, roll: ROLL.on, solo: !!NET.solo })', w));
  const ok1 = one.mode !== 'net' && !one.roll && !one.solo;
  if (!ok1) fail++;
  console.log(`${ok1 ? '  PASS' : '  FAIL'}  1v1 对方掉线：照旧结束对局（${JSON.stringify(one)}）`);
}

const argF = process.argv.indexOf('--frames');
const FRAMES = argF > 0 ? +process.argv[argF + 1] : 3600;
const CASES = [
  ['normal', [0, 3]], ['normal', [5, 9]], ['normal', [2, 7]], ['normal', [10, 11]], ['normal', [4, 6]], ['normal', [1, 8]],
  ['normal', [12, 0]], ['normal', [7, 12]],
  ['normal', [13, 0]], ['normal', [13, 13]], ['normal', [12, 13]],   // 离影：雾身的留、换、碎都要两边算得一样
  ['normal', [2, 3], [[2, 5, 12], [3, 4, 7]]],   // 3v3 车轮：输一回合换下一人
  ['chaos', [3, 9]], ['mayhem', [6, 2]],
  ['maps', [3, 8], null, ['cliff', null]], ['maps', [9, 2], null, ['ice', 'ice']], ['maps', [6, 1], null, ['cliff', 'ice']],   // 山河异境：两边的票随开局发
  ['pp_cc', [0, 3, 5, 9]], ['pp_cc', [13, 3, 5, 13]], ['pp_pp', [2, 7, 4, 6]],
  ['raid', [1, 1, 4, 8]], ['raid', [11, 11, 6, 2]],   // 同袍肉鸽：房主 A、好友 C、电脑同袍 D 打魔首 B（魔首和秘卷两边按种子抽）
];
for (const [mode, ch, duo, mv] of CASES) for (const lag of [1, 6]) {
  const r = runCase(mode, ch, SEED0 + ch[0] * 31 + lag, FRAMES, lag, duo, mv);
  const ok = !r.errs.length && !r.diff.length;
  if (!ok) fail++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${mode} ${JSON.stringify(duo || ch)}${mv ? ' ' + JSON.stringify(mv) : ''} 延迟${lag}帧${REPLAY_OK.includes(mode) ? '（含回放）' : ''}  帧=${r.F} 回滚=${r.rollbacks} 校验不一致=${r.desyncs}  ${r.round}`);
  for (const e of r.errs) console.log('        报错 ' + e);
  for (const d of r.diff) console.log('        不一致 ' + d);
}
if (fail) { console.error(`\nFAIL: ${fail} 个联机用例两边不一致`); process.exit(1); }
console.log('\nPASS: 两边每一局都算得一模一样');
