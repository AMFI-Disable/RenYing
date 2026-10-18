#!/usr/bin/env node
/**
 * High-Performance Hero-Specific Auto-Training Pipeline for RenYing.
 *
 * Features:
 *   1. Multi-threaded worker pool for parallel match simulations (saturates multi-core CPUs).
 *   2. In-memory trajectory collection to minimize disk I/O and process spawn overhead.
 *   3. Global round-robin matchup matrix for balance auditing (win rates, matchup matrices, balance flags).
 *   4. Advantage-weighted training for God Mode AI models (higher weight on winning trades/counters).
 *   5. Auto-packaging via tools/build.py.
 *
 * Usage:
 *   node tools/train-heroes.mjs [--rounds 2] [--epochs 5] [--concurrency 8] [--hero qingfeng] [--check-balance]
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

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
// WORKER THREAD LOGIC: Executes a batch of matches headlessly in a worker
// =========================================================================
if (!isMainThread) {
  const vm = await import('node:vm');
  const netCode = readFileSync('src/net-p2p.js', 'utf8');
  const gameCode = readFileSync('src/game.js', 'utf8');
  const NET_SCRIPT = new vm.Script(netCode);
  const GAME_SCRIPT = new vm.Script(gameCode);
  const EXPOSE_SCRIPT = new vm.Script(`({
    CHARS, A, B, M, projs, STAGE_W, AICtrl,
    startMatch: (...args) => startMatch(...args),
    step: () => step()
  })`);

  function createSandbox() {
    const dummyEl = {
      getContext: () => ({
        fillRect: () => {}, clearRect: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
        stroke: () => {}, moveTo: () => {}, lineTo: () => {}, save: () => {}, restore: () => {},
        translate: () => {}, scale: () => {}, rotate: () => {}, measureText: () => ({ width: 10 }),
        fillText: () => {}, strokeText: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
      }),
      getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0, right: 1440, bottom: 900 }),
      addEventListener: () => {},
      removeEventListener: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      style: {},
      appendChild: () => {},
      remove: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    };

    const sandbox = {
      window: { innerWidth: 1440, innerHeight: 900, addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ matches: false }) },
      document: { getElementById: () => dummyEl, querySelectorAll: () => [], querySelector: () => dummyEl, createElement: () => dummyEl, addEventListener: () => {}, removeEventListener: () => {}, body: dummyEl },
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '', hash: '' },
      localStorage: { getItem: () => null, setItem: () => {} },
      performance: { now: () => Date.now() },
      navigator: { userAgent: 'node' },
      requestAnimationFrame: () => {},
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: () => 0, clearInterval: () => {},
      AudioContext: class { createGain() { return { connect: () => {} }; } },
      Audio: class { play() {} pause() {} },
      matchMedia: () => ({ matches: false }),
      innerWidth: 1440, innerHeight: 900, Math, Date
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
    const threatProj = projs.find(p => p.owner !== f.idx && p.dmg > 0 && Math.abs(f.x - p.x) < 300);
    const projNear = threatProj ? (threatProj.x - f.x) / STAGE_W : 0;
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
      const env = createSandbox();
      env.startMatch('cpu', level, [p1Idx, p2Idx]);
      env.M.mode = 'cpu';
      env.A.ctrl = new env.AICtrl(level);
      env.B.ctrl = new env.AICtrl(level);

      let steps = 0;
      const maxSteps = 25 * 60 * 3 + 600;
      let prevHp1 = env.A.hp;
      let prevHp2 = env.B.hp;
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
          const r1 = (dHp2 - dHp1) / 100;

          matchTraj.push({ heroIdx: p1Idx, s: obs1, a: act1, r: r1, p: 0 });
          matchTraj.push({ heroIdx: p2Idx, s: obs2, a: act2, r: -r1, p: 1 });
          prevHp1 = env.A.hp;
          prevHp2 = env.B.hp;
        }
        env.step();
      }

      const winner = env.M.wins[0] > env.M.wins[1] ? 0 : env.M.wins[1] > env.M.wins[0] ? 1 : -1;
      for (const rec of matchTraj) {
        if (rec.p === winner) rec.r += 1.0;
        else if (winner !== -1) rec.r -= 1.0;
        trajectories.push(rec);
      }
      results.push({ p1Idx, p2Idx, winner, score: [env.M.wins[0], env.M.wins[1]], steps });
    }

    parentPort.postMessage({ results, trajectories });
  });
}

// =========================================================================
// MAIN THREAD LOGIC: Coordinates task queue, balance audit, and model training
// =========================================================================
if (isMainThread) {
  const args = process.argv.slice(2);
  function getArg(name, def) {
    const idx = args.indexOf('--' + name);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
  }

  const roundsPerMatch = parseInt(getArg('rounds', '2'), 10);
  const epochs = parseInt(getArg('epochs', '5'), 10);
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
  console.log(`   Workers       : ${numWorkers} parallel workers (${os.cpus().length} CPUs detected)`);
  console.log(`   Rounds/Matchup: ${roundsPerMatch} | Epochs: ${epochs}`);
  console.log(`=================================================================\n`);

  // Build tasks: all matchup combinations
  const tasks = [];
  if (singleHero) {
    const h = targetList[0];
    for (const opp of HEROES) {
      tasks.push({ p1Idx: h.idx, p2Idx: opp.idx, rounds: roundsPerMatch, level: 'hard' });
    }
  } else {
    // Full round-robin
    for (let i = 0; i < HEROES.length; i++) {
      for (let j = i; j < HEROES.length; j++) {
        tasks.push({ p1Idx: i, p2Idx: j, rounds: roundsPerMatch, level: 'hard' });
      }
    }
  }

  console.log(`Simulating ${tasks.length} matchup jobs across ${numWorkers} worker threads...`);
  const tStart = Date.now();

  const trajectoriesByHero = {};
  for (const h of HEROES) trajectoriesByHero[h.id] = [];

  // Matchup balance stats
  const balanceMatrix = Array.from({ length: HEROES.length }, () => Array(HEROES.length).fill(0));
  const pickCounts = Array(HEROES.length).fill(0);
  const winCounts = Array(HEROES.length).fill(0);
  let totalMatchesRun = 0;

  // Run worker pool
  const workers = [];
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
        const task = tasks[taskIdx++];
        worker.postMessage(task);
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
          const heroId = HEROES[tr.heroIdx].id;
          trajectoriesByHero[heroId].push(tr);
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
      workers.push(worker);
    }

    const count = Math.min(numWorkers, tasks.length);
    for (let w = 0; w < count; w++) spawnWorker();
  });

  const simTime = ((Date.now() - tStart) / 1000).toFixed(2);
  console.log(`\n✓ Simulations complete in ${simTime}s (${totalMatchesRun} total matches)!`);

  // =========================================================================
  // BALANCE AUDIT REPORT
  // =========================================================================
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
  // TRAIN GOD MODE NEURAL MODELS FOR TARGET HEROES
  // =========================================================================
  const summary = [];
  for (const hero of targetList) {
    const list = trajectoriesByHero[hero.id];
    console.log(`>>> [Hero: ${hero.name} (${hero.id})] Training with ${list.length.toLocaleString()} simulated transitions...`);
    const dataPath = `data/hero_${hero.id}.jsonl`;
    const modelPath = `models/heroes/${hero.id}.json`;

    // Dump dataset
    writeFileSync(dataPath, list.map(d => JSON.stringify(d)).join('\n') + '\n', 'utf8');

    try {
      execSync(`node tools/train-policy.mjs --data ${dataPath} --hero ${hero.id} --epochs ${epochs} --out ${modelPath}`, { stdio: 'inherit' });
      summary.push({ hero: hero.name, id: hero.id, path: modelPath, status: 'OK' });
    } catch (e) {
      console.error(`Failed training for ${hero.name}:`, e.message);
      summary.push({ hero: hero.name, id: hero.id, status: 'FAILED' });
    }
  }

  // Clean temporary datasets
  try {
    execSync('rm -rf data/*.jsonl', { stdio: 'ignore' });
  } catch (e) {}

  console.log(`\n=================================================================`);
  console.log(`   Hero Training Summary                                         `);
  console.log(`=================================================================`);
  for (const s of summary) {
    console.log(`  - ${s.hero.padEnd(6)} (${s.id.padEnd(10)}) -> ${s.status === 'OK' ? s.path : 'FAILED'}`);
  }
  console.log(`=================================================================\n`);

  // Auto build game
  try {
    console.log('Packaging updated neural weights into game build (tools/build.py)...');
    execSync('python3 tools/build.py', { stdio: 'inherit' });
    console.log('[Build Complete] The game is immediately ready with latest trained AI models!');

    if (doPush) {
      console.log('Auto-pushing updated models and builds to git repository...');
      execSync('git add models/ index.html renying-offline.html', { stdio: 'inherit' });
      try {
        execSync('git commit -m "feat: auto update models"', { stdio: 'inherit' });
        execSync('git push origin main', { stdio: 'inherit' });
        console.log('[Git Push Complete] Trained models successfully pushed to origin/main!');
      } catch (gitErr) {
        console.log('No new changes to commit or push already up to date.');
      }
    }
  } catch (e) {
    console.warn('Could not complete build or push:', e.message);
  }
}
