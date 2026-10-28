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

// 本测试自己的伪随机数（不用 Math.random，好复现）
function rng(s) { return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return ((s >>> 0) % 1e6) / 1e6; }; }

function runCase(mode, chars, seed, frames, lag, duo) {
  now = 0;
  const box = [[], []];   // box[0]：房主发出的，box[1]：加入的人发出的
  const P = [makePeer(box[0]), makePeer(box[1])];
  // 让 Math.random 在两边各自不同：真机上就是这样，靠它算对局的地方一定会对不上
  P[0].Math.random = rng(seed * 7 + 1); P[1].Math.random = rng(seed * 7 + 2);
  P.forEach((w, i) => vm.runInContext(`NET.role = '${i ? 'client' : 'host'}'; NET.open = true; netRoomMode = '${mode}';`, w));
  const dice = [rng(seed * 13 + 3), rng(seed * 13 + 4)];
  const errs = [];
  const G = P.map(w => ({ human: vm.runInContext('human', w), rollTick: vm.runInContext('rollTick', w), onNetMsg: vm.runInContext('onNetMsg', w) }));
  for (const w of P) vm.runInContext(`rollStart(${JSON.stringify(chars)}, ${seed}${duo ? ', ' + JSON.stringify(duo) : ''});`, w);
  const wire = [[], []];
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
  }
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
const argF = process.argv.indexOf('--frames');
const FRAMES = argF > 0 ? +process.argv[argF + 1] : 3600;
const CASES = [
  ['normal', [0, 3]], ['normal', [5, 9]], ['normal', [2, 7]], ['normal', [10, 11]], ['normal', [4, 6]], ['normal', [1, 8]],
  ['normal', [12, 0]], ['normal', [7, 12]],
  ['normal', [2, 3], [[2, 5, 12], [3, 4, 7]]],   // 3v3 车轮：输一回合换下一人
  ['chaos', [3, 9]], ['mayhem', [6, 2]],
  ['pp_cc', [0, 3, 5, 9]], ['pp_pp', [2, 7, 4, 6]],
];
for (const [mode, ch, duo] of CASES) for (const lag of [1, 6]) {
  const r = runCase(mode, ch, SEED0 + ch[0] * 31 + lag, FRAMES, lag, duo);
  const ok = !r.errs.length && !r.diff.length;
  if (!ok) fail++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${mode} ${JSON.stringify(duo || ch)} 延迟${lag}帧  帧=${r.F} 回滚=${r.rollbacks} 校验不一致=${r.desyncs}  ${r.round}`);
  for (const e of r.errs) console.log('        报错 ' + e);
  for (const d of r.diff) console.log('        不一致 ' + d);
}
if (fail) { console.error(`\nFAIL: ${fail} 个联机用例两边不一致`); process.exit(1); }
console.log('\nPASS: 两边每一局都算得一模一样');
