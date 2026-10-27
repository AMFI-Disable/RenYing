#!/usr/bin/env node
// 人机强度测试场：在无画面的沙盒里跑电脑对电脑，统计胜率。
//   node tools/ai-arena.mjs --a god --b impossible --n 4          每对角色各打 n 场（双方左右各一半）
//   node tools/ai-arena.mjs --ladder --n 4                         各难度两两对打
//   AI_BAL=bal.json node tools/ai-arena.mjs --a hard --b hard       先按文件改平衡系数再打（调平衡用）
// 也被 tools/ai-train.mjs 当作库使用（runPool）。
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { gameJs } from './ai-code.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

export async function makeEnv(tuneFile) {
  const vm = await import('node:vm');
  const noop = () => {};
  // 沙盒用自己的 Math，随机数可以设种子：训练时冠军和挑战者用同一串随机数打同样的对局，比较更准
  let rng = Math.random;
  const SMath = Object.create(Math); SMath.random = () => rng();
  const grad = { addColorStop: noop };
  const ctx2d = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') ? () => grad : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop, set: () => true });
  const el = () => ({
    getContext: () => ctx2d, getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0, right: 1440, bottom: 900 }),
    addEventListener: noop, removeEventListener: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: { setProperty: noop }, appendChild: noop, remove: noop, querySelector: () => null, querySelectorAll: () => [],
    setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop, dataset: {}, children: [], innerHTML: '', textContent: '', value: ''
  });
  const sb = {
    window: { innerWidth: 1440, innerHeight: 900, addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }) },
    document: { getElementById: el, querySelectorAll: () => [], querySelector: el, createElement: el, addEventListener: noop, removeEventListener: noop, body: el(), documentElement: el() },
    location: { protocol: 'http:', hostname: '127.0.0.1', search: '', hash: '' },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    performance: { now: () => Date.now() }, navigator: { userAgent: 'node' },
    requestAnimationFrame: noop, console: { log: noop, warn: noop, error: noop },
    setTimeout: noop, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    AudioContext: class { createGain() { return { connect: noop }; } }, Audio: class { play() {} pause() {} },
    matchMedia: () => ({ matches: false }), innerWidth: 1440, innerHeight: 900, Math: SMath, Date
  };
  const w = sb.window; w.window = w; Object.assign(w, sb); w.globalThis = w;
  if (existsSync(ROOT + 'models/ai-brain.json')) w.RENYING_AI_BRAIN = JSON.parse(readFileSync(ROOT + 'models/ai-brain.json', 'utf8'));
  if (tuneFile && existsSync(tuneFile)) w.RENYING_AI_TUNE = JSON.parse(readFileSync(tuneFile, 'utf8'));
  vm.createContext(w);
  new vm.Script(readFileSync(ROOT + 'src/net-p2p.js', 'utf8')).runInContext(w);
  new vm.Script(readFileSync(ROOT + 'src/ai.js', 'utf8'), { filename: 'ai.js' }).runInContext(w);
  new vm.Script(gameJs(), { filename: 'game.js' }).runInContext(w);
  // 试改平衡（AI_BAL=文件路径，{ "tieshan": { "normal": 0.9, "hp": 0.95 } }，写法和 game.js 的 BAL 一样）：调平衡时不用改 game.js 就能比较
  if (process.env.AI_BAL) new vm.Script(`for (const [id, s] of Object.entries(${readFileSync(process.env.AI_BAL, 'utf8')})) if (BAL[id]) Object.assign(BAL[id], s);`).runInContext(w);
  // 试改机制（AI_EXP=文件路径）：在沙盒里先跑一段代码（比如包一层 applyHit / spawnProj），不用改游戏就能比较规则改动
  if (process.env.TWEAKS) w.__TWEAKS = process.env.TWEAKS.split(',');
  if (process.env.AI_EXP) new vm.Script(readFileSync(process.env.AI_EXP, 'utf8'), { filename: 'exp.js' }).runInContext(w);
  // 另一版 AI 的快照（AI_SNAP=文件路径，'snap:god' 这样写），用来对比改动前后
  if (process.env.AI_SNAP) new vm.Script('window.SnapBrain = (function () {\n' + readFileSync(process.env.AI_SNAP, 'utf8') + '\nreturn AIBrain; })();', { filename: 'snap.js' }).runInContext(w);
  const env = new vm.Script(`({ CHARS, CHAR_MOVES, SKILLS, ULTS, M, AICtrl, LEVELS, Ctrl, projs, decoys, STEP, get clock() { return clock; }, get A() { return A; }, get B() { return B; },
    startMatch: (...a) => startMatch(...a), get SnapBrain() { return window.SnapBrain; }, step: () => step(), setTune: t => { window.RENYING_AI_TUNE = t; if (typeof aiTuneReload === 'function') aiTuneReload(); } })`).runInContext(w);
  for (const k of ['addP', 'ring', 'dust', 'spark', 'say', 'smoke']) if (typeof w[k] === 'function') w[k] = noop;
  env.run = code => new vm.Script(code).runInContext(w);
  env.window = w;
  env.seed = s => {
    if (s === undefined || s === null) { rng = Math.random; return; }
    let a = s >>> 0;
    env.run('GRNG.s = ' + ((s * 7919) | 0) + '; clock = 0;');
    rng = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  // 和回滚联机重算一样只算对战逻辑、不算画面（对战结果完全相同，快很多）
  if (!process.env.AI_FULL) new vm.Script('RESIM = true;').runInContext(w);
  return env;
}

function makeCtrl(env, lv) {
  if (typeof lv === 'string' && lv.startsWith('snap:')) {
    const c = new env.Ctrl(), b = new env.SnapBrain(c, lv.slice(5));
    c.brain = b; c.think = (me, foe) => b.think(me, foe); c.updateTactic = () => b.newRound && b.newRound();
    return c;
  }
  return new env.AICtrl(lv);
}
// 一场三局两胜：返回 0（左赢）/1（右赢）/-1（平）及耗时
function playMatch(env, ha, hb, la, lb, seed) {
  env.seed(seed);
  env.startMatch('cpu', 'normal', [ha, hb], true);
  env.A.ctrl = makeCtrl(env, la); env.B.ctrl = makeCtrl(env, lb);
  let steps = 0;
  const max = 120 * 60 * 6;
  while (env.M.phase !== 'end' && steps < max) { env.step(); steps++; }
  const [w0, w1] = env.M.wins;
  // margin：左边视角的净胜（局数差 + 最后一局剩余血量比差），给训练当连续的打分
  const margin = (w0 - w1) / 2 + (Math.max(0, env.A.hp) / env.A.maxHp - Math.max(0, env.B.hp) / env.B.maxHp) / 2;
  return { w: w0 > w1 ? 0 : w1 > w0 ? 1 : -1, steps, margin };
}

if (!isMainThread) {
  const env = await makeEnv(workerData.tuneFile);
  parentPort.on('message', job => {
    if (job.tune !== undefined) env.setTune(job.tune);
    const res = [];
    for (const g of job.games) {
      const r = playMatch(env, g.a, g.b, g.la, g.lb, g.seed);
      res.push({ ...g, w: r.w, steps: r.steps, margin: r.margin });
    }
    parentPort.postMessage({ id: job.id, res });
  });
}

export class Pool {
  constructor(n = os.cpus().length, tuneFile) {
    this.workers = []; this.idle = []; this.q = []; this.cb = new Map(); this.seq = 0;
    for (let i = 0; i < n; i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { tuneFile } });
      w.on('message', m => { const f = this.cb.get(m.id); this.cb.delete(m.id); this.idle.push(w); this.pump(); f(m.res); });
      w.on('error', e => { console.error('worker error', e); process.exit(1); });
      this.workers.push(w); this.idle.push(w);
    }
  }
  pump() { while (this.idle.length && this.q.length) { const w = this.idle.pop(), j = this.q.shift(); w.postMessage(j.msg); } }
  run(games, tune) {   // games 分片并行
    const chunks = [], per = Math.max(1, Math.ceil(games.length / (this.workers.length * 3)));
    for (let i = 0; i < games.length; i += per) chunks.push(games.slice(i, i + per));
    return Promise.all(chunks.map(c => new Promise(res => { const id = ++this.seq; this.cb.set(id, res); this.q.push({ msg: { id, games: c, tune } }); this.pump(); }))).then(r => r.flat());
  }
  close() { for (const w of this.workers) w.terminate(); }
}

export const HEROES = ['qingfeng', 'feiying', 'tieshan', 'lingshuang', 'liuyun', 'leiming', 'moyu', 'yuehua', 'yanling', 'yuxiao', 'zuixian', 'gouchen', 'lingque'];
export const NAMES = ['青锋', '绯影', '铁山', '凌霜', '流云', '雷鸣', '墨羽', '月华', '燕翎', '玉箫', '醉翁', '勾陈', '凌雀'];

// 每个角色对每个角色：la 用 a 角色、lb 用 b 角色，左右互换各一半
export function matchupGames(la, lb, n, heroes = HEROES.map((_, i) => i)) {
  const g = [];
  for (const a of heroes) for (const b of HEROES.map((_, i) => i))
    for (let k = 0; k < n; k++) g.push(k % 2 ? { a: b, b: a, la: lb, lb: la, flip: 1, ha: a, hb: b } : { a, b, la, lb, flip: 0, ha: a, hb: b });
  return g;
}
export function score(res) {   // 返回 la 方的胜率（平局算半）
  let s = 0; for (const r of res) s += r.w === -1 ? 0.5 : (r.w === r.flip ? 1 : 0); return s / res.length;
}
export function byHero(res) {
  const out = HEROES.map(() => ({ w: 0, n: 0 }));
  for (const r of res) { const win = r.w === -1 ? 0.5 : (r.w === r.flip ? 1 : 0); out[r.ha].w += win; out[r.ha].n++; }
  return out.map(o => o.n ? o.w / o.n : NaN);
}

const isMain = isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const n = +arg('n', 2), pool = new Pool(+arg('workers', os.cpus().length), arg('tune'));
  const t0 = Date.now();
  if (args.includes('--ladder')) {
    const lv = (arg('levels', 'easy,normal,hard,impossible,god')).split(',');
    for (let i = 0; i < lv.length; i++) for (let j = i + 1; j < lv.length; j++) {
      const res = await pool.run(matchupGames(lv[j], lv[i], n));
      console.log(`${lv[j]} vs ${lv[i]}: ${(score(res) * 100).toFixed(1)}%  (${res.length} 场)`);
    }
  } else {
    const la = arg('a', 'god'), lb = arg('b', 'impossible');
    const only = arg('heroes') ? arg('heroes').split(',').map(Number) : undefined;
    const res = await pool.run(matchupGames(la, lb, n, only));
    const steps = res.reduce((s, r) => s + r.steps, 0);
    console.log(`${la} vs ${lb}: ${(score(res) * 100).toFixed(1)}%  (${res.length} 场, 平均 ${(steps / res.length / 120).toFixed(0)} 秒/场)`);
    byHero(res).forEach((v, i) => { if (!isNaN(v)) console.log(`  ${NAMES[i]} ${(v * 100).toFixed(0)}%`); });
    if (only) for (const h of only) {   // 指定角色时再按对手拆开
      const row = HEROES.map((_, j) => { const rs = res.filter(r => h === r.ha && r.hb === j); return rs.length ? (score(rs) * 100).toFixed(0) : '-'; });
      console.log(`  ${NAMES[h]} 对各角色: ` + row.map((v, j) => NAMES[j] + v).join(' '));
    }
  }
  console.log(`用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  pool.close();
}
