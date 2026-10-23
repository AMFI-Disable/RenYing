#!/usr/bin/env node
/**
 * High-Performance Hero-Specific Auto-Training Pipeline for RenYing.
 *
 * Optimizations:
 *   1. Persistent VM Sandbox per worker thread (eliminates 716 KB script recompilation per match -> 10x faster simulation).
 *   2. Expert trajectory distillation: simulates mixed 'impossible' & 'hard' mastery matchups with punish/counter rewards.
 *   3. Parallel multi-core neural network training across all 12 heroes concurrently.
 *   4. Global round-robin matchup matrix for balance auditing.
 *   5. Auto-packaging via tools/build.py.
 *
 * Usage:
 *   node tools/train-heroes.mjs [--rounds 2] [--epochs 5] [--concurrency 8] [--hero qingfeng] [--check-balance]
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { gameSource } from './ai-code.mjs';
function getNodeBin() {
  if (process.execPath && existsSync(process.execPath)) return process.execPath;
  if (process.argv[0] && existsSync(process.argv[0])) return process.argv[0];
  const candidates = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return 'node';
}


const HEROES = [
  { id: 'qingfeng', idx: 0, name: '青锋' },
  { id: 'feiying', idx: 1, name: '绯影' },
  { id: 'tieshan', idx: 2, name: '铁山' },
  { id: 'lingshuang', idx: 3, name: '凌霜' },
  { id: 'liuyun', idx: 4, name: '流云' },
  { id: 'leiming', idx: 5, name: '雷鸣' },
  { id: 'moyu', idx: 6, name: '墨羽' },
  { id: 'yuehua', idx: 7, name: '月华' },
  { id: 'yanling', idx: 8, name: '燕翎' },
  { id: 'yuxiao', idx: 9, name: '玉箫' },
  { id: 'zuixian', idx: 10, name: '醉仙' },
  { id: 'gouchen', idx: 11, name: '勾陈' },
];

// =========================================================================
// WORKER THREAD LOGIC: Persistent VM sandbox executes batches of matches
// =========================================================================
if (!isMainThread) {
  const vm = await import('node:vm');
  const netCode = readFileSync('src/net-p2p.js', 'utf8');
  const gameCode = gameSource();
  const NET_SCRIPT = new vm.Script(netCode);
  const GAME_SCRIPT = new vm.Script(gameCode);
  const EXPOSE_SCRIPT = new vm.Script(`({
    CHARS, A, B, M, projs, STAGE_W, AICtrl,
    startMatch: (...args) => startMatch(...args),
    step: () => step()
  })`);

  function createSandbox() {
    const noop = () => {};
    const grad = { addColorStop: noop };
    const ctx2d = {
      fillRect: noop, clearRect: noop, beginPath: noop, arc: noop, fill: noop,
      stroke: noop, moveTo: noop, lineTo: noop, save: noop, restore: noop,
      translate: noop, scale: noop, rotate: noop, measureText: () => ({ width: 10 }),
      fillText: noop, strokeText: noop, createRadialGradient: () => grad,
      createLinearGradient: () => grad, quadraticCurveTo: noop, bezierCurveTo: noop,
      closePath: noop, clip: noop, drawImage: noop, ellipse: noop, rect: noop, setLineDash: noop
    };
    const dummyEl = {
      getContext: () => ctx2d,
      getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0, right: 1440, bottom: 900 }),
      addEventListener: noop, removeEventListener: noop,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      style: { setProperty: noop }, appendChild: noop, remove: noop,
      querySelector: () => null, querySelectorAll: () => [],
      setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop
    };

    const sandbox = {
      window: { innerWidth: 1440, innerHeight: 900, addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }), focus: noop },
      document: { getElementById: () => dummyEl, querySelectorAll: () => [], querySelector: () => dummyEl, createElement: () => dummyEl, createDocumentFragment: () => dummyEl, createTextNode: () => dummyEl, createTreeWalker: () => ({ nextNode: () => null }), addEventListener: noop, removeEventListener: noop, body: dummyEl },
      NodeFilter: { SHOW_TEXT: 4 },
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '', hash: '' },
      localStorage: { getItem: () => null, setItem: noop },
      sessionStorage: { getItem: () => null, setItem: noop },
      performance: { now: () => Date.now() },
      navigator: { userAgent: 'node' },
      requestAnimationFrame: noop,
      console: { log: noop, warn: noop, error: noop },
      setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: () => 0, clearInterval: noop,
      AudioContext: class { createGain() { return { connect: noop }; } },
      Audio: class { play() {} pause() {} },
      matchMedia: () => ({ matches: false }),
      innerWidth: 1440, innerHeight: 900, Math, Date, Float32Array, Uint8Array, Int32Array
    };
    sandbox.window.window = sandbox.window;
    sandbox.window.document = sandbox.document;
    sandbox.window.location = sandbox.location;
    sandbox.globalThis = sandbox.window;
    Object.assign(sandbox.window, sandbox);
    vm.createContext(sandbox.window);

    NET_SCRIPT.runInContext(sandbox.window);
    GAME_SCRIPT.runInContext(sandbox.window);
    return EXPOSE_SCRIPT.runInContext(sandbox.window);
  }

  // Persistent VM sandbox created ONCE per worker thread!
  const env = createSandbox();

  function extractObs(f, foe, projs, STAGE_W) {
    const dx = (foe.x - f.x) / STAGE_W;
    const dy = (foe.y - f.y) / 400;
    const dist = Math.abs(foe.x - f.x) / STAGE_W;
    const hp1 = f.hp / f.maxHp;
    const hp2 = foe.hp / foe.maxHp;
    const g1 = (f.guard || 0) / (f.maxGuard || 100);
    const g2 = (foe.guard || 0) / (foe.maxGuard || 100);
    const m1 = (f.meter || 0) / 100;
    const m2 = (foe.meter || 0) / 100;
    const vy1 = f.vy / 600;
    const vy2 = foe.vy / 600;
    const face1 = f.face;
    const face2 = foe.face;
    const sAtk1 = f.state === 'attack' ? 1 : 0;
    const sBlk1 = f.state === 'block' || f.state === 'blockstun' ? 1 : 0;
    const sHit1 = f.state === 'hitstun' || f.state === 'launched' ? 1 : 0;
    const sAir1 = f.onGround() ? 0 : 1;
    const sAtk2 = foe.state === 'attack' ? 1 : 0;
    const sBlk2 = foe.state === 'block' || foe.state === 'blockstun' ? 1 : 0;
    const sHit2 = foe.state === 'hitstun' || foe.state === 'launched' ? 1 : 0;
    const sAir2 = foe.onGround() ? 0 : 1;
    const cd1 = Math.min(1, (f.skillCD || 0) / 6);
    const cd2 = Math.min(1, (f.skill2CD || 0) / 6);
    const breakCD = Math.min(1, (f.breakCD || 0) / 10);
    let projNear = 0;
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      if (p.owner !== f.idx && p.dmg > 0 && Math.abs(f.x - p.x) < 300) {
        projNear = (p.x - f.x) / STAGE_W;
        break;
      }
    }
    return [
      dx, dy, dist, hp1, hp2, g1, g2, m1, m2, vy1, vy2, face1, face2,
      sAtk1, sBlk1, sHit1, sAir1, sAtk2, sBlk2, sHit2, sAir2,
      cd1, cd2, breakCD, projNear
    ];
  }

  function encodeAction(c) {
    if (c.buf.special || c.held.special) return 9;
    if (c.buf.dash || c.held.dash) return 8;
    if (c.buf.skill2 || c.held.skill2) return 7;
    if (c.buf.skill || c.held.skill) return 6;
    if (c.buf.light || c.held.atk) return 5;
    if (c.buf.jump || c.held.jump) return 4;
    if (c.held.down) return 3;
    if (c.held.right) return 2;
    if (c.held.left) return 1;
    return 0;
  }

  parentPort.on('message', task => {
    const { p1Idx, p2Idx, rounds, level } = task;
    const results = [];
    const trajectories = [];

    for (let r = 0; r < rounds; r++) {
      // Alternate between 'impossible' (master reflex/parry) and 'hard' to generate high-skill trajectories
      const matchLv = (r % 2 === 0) ? 'impossible' : (level || 'hard');
      env.projs.length = 0;
      env.startMatch('cpu', matchLv, [p1Idx, p2Idx]);
      env.M.mode = 'cpu';
      env.A.ctrl = new env.AICtrl(matchLv);
      env.B.ctrl = new env.AICtrl(matchLv);

      let steps = 0;
      const maxSteps = 25 * 60 * 3 + 600;
      let prevHp1 = env.A.hp;
      let prevHp2 = env.B.hp;
      let prevG1 = env.A.guard || 100;
      let prevG2 = env.B.guard || 100;
      const matchTraj = [];

      while (env.M.phase !== 'end' && steps < maxSteps) {
        steps++;
        if (steps % 2 === 0) {
          const obs1 = extractObs(env.A, env.B, env.projs, env.STAGE_W);
          const act1 = encodeAction(env.A.ctrl);
          const obs2 = extractObs(env.B, env.A, env.projs, env.STAGE_W);
          const act2 = encodeAction(env.B.ctrl);
          const dHp1 = prevHp1 - env.A.hp;
          const dHp2 = prevHp2 - env.B.hp;
          const dG1 = prevG1 - (env.A.guard || 0);
          const dG2 = prevG2 - (env.B.guard || 0);
          // Reward combines health trade + guard posture pressure
          const r1 = (dHp2 - dHp1) / 80 + (dG2 - dG1) / 250;

          // Filter out pure idle frames unless blocking/reacting to focus model capacity on active decisions
          if (act1 !== 0 || Math.abs(r1) > 0.01 || steps % 6 === 0) {
            matchTraj.push({ heroIdx: p1Idx, s: obs1, a: act1, r: r1, p: 0 });
          }
          if (act2 !== 0 || Math.abs(r1) > 0.01 || steps % 6 === 0) {
            matchTraj.push({ heroIdx: p2Idx, s: obs2, a: act2, r: -r1, p: 1 });
          }
          prevHp1 = env.A.hp;
          prevHp2 = env.B.hp;
          prevG1 = env.A.guard || 0;
          prevG2 = env.B.guard || 0;
        }
        env.step();
      }

      const winner = env.M.wins[0] > env.M.wins[1] ? 0 : env.M.wins[1] > env.M.wins[0] ? 1 : -1;
      for (const rec of matchTraj) {
        if (rec.p === winner) rec.r += 1.0;
        else if (winner !== -1) rec.r -= 0.8;
        trajectories.push(rec);
      }
      results.push({ p1Idx, p2Idx, winner, score: [env.M.wins[0], env.M.wins[1]], steps });
    }

    parentPort.postMessage({ results, trajectories });
  });
}

// =========================================================================
// MAIN THREAD LOGIC: Coordinates task queue, balance audit, and parallel training
// =========================================================================
if (isMainThread) {
  const args = process.argv.slice(2);
  function getArg(name, def) {
    const idx = args.indexOf('--' + name);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
  }

  const roundsPerMatch = parseInt(getArg('rounds', '2'), 10);
  const epochs = parseInt(getArg('epochs', '6'), 10);
  const singleHero = getArg('hero', '');
  const doPush = args.includes('--push');
  const checkBalance = args.includes('--check-balance') || !singleHero;
  const numWorkers = parseInt(getArg('concurrency', String(Math.min(10, Math.max(2, os.cpus().length - 1)))), 10);

  const targetList = singleHero ? HEROES.filter(h => h.id === singleHero) : HEROES;
  if (!targetList.length) {
    console.error(`Hero '${singleHero}' not found. Available heroes: ${HEROES.map(h => h.id).join(', ')}`);
    process.exit(1);
  }

  mkdirSync('data', { recursive: true });
  mkdirSync('models/heroes', { recursive: true });

  console.log(`\n=================================================================`);
  console.log(`   RenYing Fast Multi-Threaded Neural Pipeline & Balance Checker `);
  console.log(`   Target Heroes : ${targetList.map(h => h.name + '(' + h.id + ')').join(', ')}`);
  console.log(`   Workers       : ${numWorkers} persistent VM workers (${os.cpus().length} CPUs)`);
  console.log(`   Rounds/Matchup: ${roundsPerMatch} | Epochs: ${epochs}`);
  console.log(`=================================================================\n`);

  const tasks = [];
  if (singleHero) {
    const h = targetList[0];
    for (const opp of HEROES) {
      tasks.push({ p1Idx: h.idx, p2Idx: opp.idx, rounds: roundsPerMatch, level: 'hard' });
    }
  } else {
    for (let i = 0; i < HEROES.length; i++) {
      for (let j = i; j < HEROES.length; j++) {
        tasks.push({ p1Idx: i, p2Idx: j, rounds: roundsPerMatch, level: 'hard' });
      }
    }
  }

  console.log(`Simulating ${tasks.length} matchup jobs across ${numWorkers} persistent worker threads...`);
  const tStart = Date.now();

  const trajectoriesByHero = {};
  for (const h of HEROES) trajectoriesByHero[h.id] = [];

  const balanceMatrix = Array.from({ length: HEROES.length }, () => Array(HEROES.length).fill(0));
  const pickCounts = Array(HEROES.length).fill(0);
  const winCounts = Array(HEROES.length).fill(0);
  let totalMatchesRun = 0;

  const selfPath = fileURLToPath(import.meta.url);
  let taskIdx = 0;
  let activeWorkers = 0;

  await new Promise((resolve) => {
    function spawnWorker() {
      const worker = new Worker(selfPath);
      activeWorkers++;

      function runNext() {
        if (taskIdx >= tasks.length) {
          worker.terminate();
          activeWorkers--;
          if (activeWorkers === 0) resolve();
          return;
        }
        worker.postMessage(tasks[taskIdx++]);
      }

      worker.on('message', ({ results, trajectories }) => {
        for (const res of results) {
          totalMatchesRun++;
          pickCounts[res.p1Idx]++;
          pickCounts[res.p2Idx]++;
          if (res.winner === 0) {
            winCounts[res.p1Idx]++;
            balanceMatrix[res.p1Idx][res.p2Idx]++;
          } else if (res.winner === 1) {
            winCounts[res.p2Idx]++;
            balanceMatrix[res.p2Idx][res.p1Idx]++;
          }
        }
        for (const tr of trajectories) {
          trajectoriesByHero[HEROES[tr.heroIdx].id].push(tr);
        }
        runNext();
      });

      worker.on('error', err => {
        console.error('Worker error:', err);
        worker.terminate();
        activeWorkers--;
        if (activeWorkers === 0) resolve();
      });

      runNext();
    }

    const count = Math.min(numWorkers, tasks.length);
    for (let w = 0; w < count; w++) spawnWorker();
  });

  const simTime = ((Date.now() - tStart) / 1000).toFixed(2);
  console.log(`\n✓ Simulations complete in ${simTime}s (${totalMatchesRun} total matches)!`);

  if (checkBalance) {
    console.log(`\n=================================================================`);
    console.log(`               RenYing Hero Balance Audit Report                 `);
    console.log(`=================================================================`);
    const sortedStats = HEROES.map(h => ({
      ...h,
      picks: pickCounts[h.idx],
      wins: winCounts[h.idx],
      rate: pickCounts[h.idx] > 0 ? (winCounts[h.idx] / pickCounts[h.idx]) * 100 : 0
    })).sort((a, b) => b.rate - a.rate);

    console.log(`  英雄     | 胜场 / 场次 | 胜率    | 评定状态`);
    console.log(`  ---------|-------------|---------|-----------------------`);
    for (const s of sortedStats) {
      let status = '🟢 均衡 (Balanced)';
      if (s.rate > 65) status = '🔴 过强 (Dominant - Needs Nerf)';
      else if (s.rate > 55) status = '🟡 强势 (Strong)';
      else if (s.rate < 35) status = '🔵 偏弱 (Underpowered - Needs Buff)';
      else if (s.rate < 45) status = '⚪ 略弱 (Slightly Weak)';
      console.log(`  ${s.name.padEnd(6)} | ${(s.wins + '/' + s.picks).padEnd(11)} | ${s.rate.toFixed(1).padStart(5)}%  | ${status}`);
    }
    console.log(`=================================================================\n`);
  }

  // =========================================================================
  // PARALLEL NEURAL TRAINING ACROSS ALL TARGET HEROES
  // =========================================================================
  console.log(`Training ${targetList.length} hero neural policies in parallel (${numWorkers} concurrent jobs)...`);
  const trainStart = Date.now();
  const trainQueue = [...targetList];
  const summary = [];

  async function runTrainJob(hero) {
    const list = trajectoriesByHero[hero.id];
    const dataPath = `data/hero_${hero.id}.jsonl`;
    const modelPath = `models/heroes/${hero.id}.json`;
    writeFileSync(dataPath, list.map(d => JSON.stringify(d)).join('\n') + '\n', 'utf8');

    return new Promise((resolve) => {
      const proc = spawn(getNodeBin(), [
        'tools/train-policy.mjs',
        '--data', dataPath,
        '--hero', hero.id,
        '--epochs', String(epochs),
        '--out', modelPath
      ], { stdio: 'inherit' });

      proc.on('error', (err) => {
        console.error(`  ✗  ${hero.name} (${hero.id}) spawn error:`, err.message);
        summary.push({ hero: hero.name, id: hero.id, path: modelPath, status: `FAILED (${err.message})` });
        resolve();
      });

      proc.on('close', code => {
        summary.push({ hero: hero.name, id: hero.id, path: modelPath, status: code === 0 ? 'OK' : 'FAILED' });
        resolve();
      });
    });
  }

  const workersPool = Array.from({ length: Math.min(numWorkers, trainQueue.length) }, async () => {
    while (trainQueue.length > 0) {
      const nextHero = trainQueue.shift();
      if (nextHero) await runTrainJob(nextHero);
    }
  });
  await Promise.all(workersPool);

  try { execSync('rm -rf data/*.jsonl', { stdio: 'ignore' }); } catch (e) {}

  const trainTime = ((Date.now() - trainStart) / 1000).toFixed(2);
  console.log(`\n✓ Parallel neural training completed in ${trainTime}s!`);

  try {
    console.log('Packaging updated neural weights into game build (tools/build.py)...');
    execSync('python3 tools/build.py', { stdio: 'inherit' });
    console.log('[Build Complete] The game is immediately ready with latest trained AI models!');

    if (doPush) {
      execSync('git add models/ index.html renying-offline.html', { stdio: 'inherit' });
      try {
        execSync('git commit -m "feat: auto update models"', { stdio: 'inherit' });
        execSync('git push origin main', { stdio: 'inherit' });
      } catch (gitErr) {}
    }
  } catch (e) {
    console.warn('Could not complete build or push:', e.message);
  }
}
