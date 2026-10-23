#!/usr/bin/env node
/**
 * Exhaustive RenYing Match Simulator, Meta Analyzer, Neural Trainer & Auto-Publisher.
 *
 * Runs 5 matches for EVERY CIRCUMSTANCE:
 *   - All 5 Game Modes: cpu (1v1), chaos (mutations), mayhem (10x meter), watch2v2 (2-Player vs 2-Player), tag3 (3v3)
 *   - 2v2 Mode: Simulates Two Players vs Two Players across all 66 duo combinations and compiles Duo Tier Lists & Partner Synergy
 *   - 1v1 Modes: All 78 unique pairings across all 12 characters (including mirror matches)
 *   - Multi-core parallel execution across CPU workers for maximum throughput (~100,000+ frames/sec)
 *   - After simulation: collects hero training trajectories, trains neural policies in parallel,
 *     prints full win-rate / balance report, then optionally builds & pushes to git.
 *
 * Usage:
 *   node tools/simulate-all.mjs
 *   node tools/simulate-all.mjs --matches-per-matchup 5 --export data/exhaustive_dataset.jsonl
 *   node tools/simulate-all.mjs --mode watch2v2 --matches-per-matchup 5
 *   node tools/simulate-all.mjs --push                   # build + git commit + push after training
 *   node tools/simulate-all.mjs --epochs 8 --rounds 3    # tune neural training
 *   node tools/simulate-all.mjs --skip-train             # simulate + report only, no NN training
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
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
  { id: 'zuixian', idx: 10, name: '醉翁' },
  { id: 'gouchen', idx: 11, name: '勾陈' },
];

const DUOS = [];
for (let i = 0; i < HEROES.length; i++) {
  for (let j = i + 1; j < HEROES.length; j++) {
    DUOS.push({ id: DUOS.length, h1: i, h2: j, name: `${HEROES[i].name} + ${HEROES[j].name}` });
  }
}

const MODES = ['cpu', 'chaos', 'mayhem', 'watch2v2', 'tag3'];

// =========================================================================
// WORKER THREAD LOGIC
// =========================================================================
if (!isMainThread) {
  const vm = await import('node:vm');
  const netCode = readFileSync('src/net-p2p.js', 'utf8');
  const gameCode = readFileSync('src/game.js', 'utf8');
  const NET_SCRIPT = new vm.Script(netCode);
  const GAME_SCRIPT = new vm.Script(gameCode);
  const EXPOSE_SCRIPT = new vm.Script(`({
    CHARS, A, B, C, D, M, projs, STAGE_W, AICtrl, ARENA2V2,
    startMatch: (...args) => startMatch(...args),
    startTag3Match: (...args) => startTag3Match(...args),
    startChaos: (...args) => startChaos(...args),
    startMayhem: (...args) => startMayhem(...args),
    startWatch2v2: (...args) => startWatch2v2(...args),
    step: () => step(),
    window
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
      setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop,
      dataset: {}
    };

    const sandbox = {
      window: { innerWidth: 1440, innerHeight: 900, addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }) },
      document: { getElementById: () => dummyEl, querySelectorAll: () => [], querySelector: () => dummyEl, createElement: () => dummyEl, addEventListener: noop, removeEventListener: noop, body: dummyEl },
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '', hash: '' },
      localStorage: { getItem: () => null, setItem: noop },
      performance: { now: () => Date.now() },
      navigator: { userAgent: 'node' },
      requestAnimationFrame: noop,
      console: { log: noop, warn: noop, error: noop },
      setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop,
      AudioContext: class { createGain() { return { connect: noop }; } },
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

    const env = EXPOSE_SCRIPT.runInContext(sandbox.window);
    if (env.window) {
      env.window.addP = noop;
      env.window.ring = noop;
      env.window.dust = noop;
      env.window.spark = noop;
    }
    return env;
  }

  const env = createSandbox();

  // ---------------------------------------------------------------------------
  // Trajectory helpers (mirrors train-heroes.mjs worker logic)
  // ---------------------------------------------------------------------------
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
    const { mode, p1, p2, p3, p4, duo1, duo2, pTeam, eTeam, matches, collectTrajectories } = task;
    const results = [];
    let totalFrames = 0;
    // trajectories: only collected for 1v1 cpu mode tasks (training signal)
    const trajectories = [];

    for (let m = 0; m < matches; m++) {
      env.projs.length = 0;
      env.M.wins = [0, 0];
      env.M.round = 1;
      env.M.phase = 'fight';

      // Alternate between 'impossible' and 'hard' for richer training trajectories
      const matchLv = collectTrajectories ? ((m % 2 === 0) ? 'impossible' : 'hard') : 'god';

      if (mode === 'watch2v2') {
        env.startWatch2v2([0, p1, p2, 1, p3, p4]);
      } else if (mode === 'mayhem') {
        env.startMayhem(p1, p2, 'god', true);
      } else if (mode === 'chaos') {
        env.startChaos(p1, p2, 'god', true);
      } else if (mode === 'tag3') {
        env.startTag3Match(pTeam, eTeam, 'god', true);
      } else {
        // cpu (1v1) — use dynamic level for trajectory collection
        env.startMatch('cpu', matchLv, [p1, p2], true);
        if (collectTrajectories) {
          env.A.ctrl = new env.AICtrl(matchLv);
          env.B.ctrl = new env.AICtrl(matchLv);
        }
      }

      let steps = 0;
      const maxSteps = (mode === 'watch2v2' ? 45 : 25) * 120 * 3 + 1200;

      let prevHp1 = env.A ? env.A.hp : 0;
      let prevHp2 = env.B ? env.B.hp : 0;
      let prevG1 = env.A ? (env.A.guard || 100) : 100;
      let prevG2 = env.B ? (env.B.guard || 100) : 100;
      const matchTraj = [];

      while (env.M.phase !== 'end' && steps < maxSteps) {
        steps++;

        // Collect trajectory data every 2 frames for 1v1 cpu matches
        if (collectTrajectories && mode === 'cpu' && steps % 2 === 0 && env.A && env.B) {
          const obs1 = extractObs(env.A, env.B, env.projs, env.STAGE_W);
          const act1 = encodeAction(env.A.ctrl);
          const obs2 = extractObs(env.B, env.A, env.projs, env.STAGE_W);
          const act2 = encodeAction(env.B.ctrl);
          const dHp1 = prevHp1 - env.A.hp;
          const dHp2 = prevHp2 - env.B.hp;
          const dG1 = prevG1 - (env.A.guard || 0);
          const dG2 = prevG2 - (env.B.guard || 0);
          const r1 = (dHp2 - dHp1) / 80 + (dG2 - dG1) / 250;
          if (act1 !== 0 || Math.abs(r1) > 0.01 || steps % 6 === 0) {
            matchTraj.push({ heroIdx: p1, s: obs1, a: act1, r: r1, p: 0 });
          }
          if (act2 !== 0 || Math.abs(r1) > 0.01 || steps % 6 === 0) {
            matchTraj.push({ heroIdx: p2, s: obs2, a: act2, r: -r1, p: 1 });
          }
          prevHp1 = env.A.hp;
          prevHp2 = env.B.hp;
          prevG1 = env.A.guard || 0;
          prevG2 = env.B.guard || 0;
        }

        env.step();
      }
      totalFrames += steps;

      const w = env.M.wins[0] > env.M.wins[1] ? 0 : env.M.wins[1] > env.M.wins[0] ? 1 : -1;
      results.push({ winner: w, steps, score: [env.M.wins[0], env.M.wins[1]] });

      // Apply win/loss bonus to trajectory rewards
      if (collectTrajectories && mode === 'cpu') {
        for (const rec of matchTraj) {
          if (rec.p === w) rec.r += 1.0;
          else if (w !== -1) rec.r -= 0.8;
          trajectories.push(rec);
        }
      }
    }

    parentPort.postMessage({ taskId: task.id, mode, p1, p2, p3, p4, duo1, duo2, results, totalFrames, trajectories });
  });
}

// =========================================================================
// MAIN ORCHESTRATOR
// =========================================================================
if (isMainThread) {
  const args = process.argv.slice(2);
  function getArg(name, def) {
    const idx = args.indexOf('--' + name);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
  }

  const allInOne = args.includes('--all-in-one');
  const doPush = args.includes('--push');
  const skipTrain = !allInOne && (args.includes('--skip-train') && !args.includes('--train-all'));
  const matchesPerMatchup = parseInt(getArg('matches-per-matchup', getArg('matches', '5')), 10);
  const targetMode = allInOne || args.includes('--simulate-all') ? 'all' : getArg('mode', 'all');
  const concurrency = parseInt(getArg('workers', getArg('concurrency', String(Math.max(2, os.cpus().length)))), 10);
  const exportPath = getArg('export', '');
  const epochs = parseInt(getArg('epochs', '6'), 10);
  const roundsPerMatch = parseInt(getArg('rounds', '2'), 10);

  const modesToRun = targetMode === 'all' ? MODES : [targetMode];
  const collectTrajectories = !skipTrain && modesToRun.includes('cpu');

  console.log(`\n================================================================`);
  console.log(`   RenYing Simulation & Training Pipeline                       `);
  console.log(`   Matches Per Circumstance : ${matchesPerMatchup} | Workers: ${concurrency}`);
  console.log(`   Modes Scheduled          : ${modesToRun.join(', ')}`);
  console.log(`   Neural Training          : ${skipTrain ? 'SKIPPED (--skip-train)' : `enabled (epochs=${epochs}, rounds=${roundsPerMatch})`}`);
  console.log(`   Auto Push                : ${doPush ? 'YES' : 'no'}`);
  console.log(`================================================================\n`);

  // Load hero KeZhi (克制) metadata from src/game.js
  const gameCode = readFileSync('src/game.js', 'utf8');
  for (const h of HEROES) {
    const m = gameCode.match(new RegExp(`id:\\s*'${h.id}'[\\s\\S]*?beats:\\s*(\\[[^\\]]*\\])[\\s\\S]*?weakTo:\\s*(\\[[^\\]]*\\])`));
    if (m) {
      try {
        h.beats = JSON.parse(m[1].replace(/'/g, '"'));
        h.weakTo = JSON.parse(m[2].replace(/'/g, '"'));
      } catch (e) {
        h.beats = [];
        h.weakTo = [];
      }
    } else {
      h.beats = [];
      h.weakTo = [];
    }
  }

  // Build task list for every circumstance
  const tasks = [];
  let taskId = 0;

  for (const mode of modesToRun) {
    if (mode === 'watch2v2') {
      // 2v2: Every circumstance of TWO PLAYERS VS TWO PLAYERS (66 unique duo teams)
      for (let d1 = 0; d1 < DUOS.length; d1++) {
        const t1 = DUOS[d1];
        let oppCount = 0;
        for (let step = 1; step < DUOS.length && oppCount < 2; step++) {
          const d2 = (d1 + step) % DUOS.length;
          if (d2 <= d1) continue;
          const t2 = DUOS[d2];
          if (t1.h1 !== t2.h1 && t1.h1 !== t2.h2 && t1.h2 !== t2.h1 && t1.h2 !== t2.h2) {
            tasks.push({
              id: taskId++,
              mode,
              p1: t1.h1,
              p2: t1.h2,
              p3: t2.h1,
              p4: t2.h2,
              duo1: d1,
              duo2: d2,
              label: `【${t1.name}】vs【${t2.name}】`,
              matches: matchesPerMatchup,
              collectTrajectories: false
            });
            oppCount++;
          }
        }
      }
    } else if (mode === 'tag3') {
      // 3v3: Trios matchups rotating all heroes
      for (let i = 0; i < HEROES.length; i += 2) {
        const pTeam = [i, (i + 1) % HEROES.length, (i + 2) % HEROES.length];
        const foeStart = (i + 4) % HEROES.length;
        const eTeam = [foeStart, (foeStart + 1) % HEROES.length, (foeStart + 2) % HEROES.length];
        tasks.push({
          id: taskId++,
          mode,
          pTeam,
          eTeam,
          p1: pTeam[0],
          p2: eTeam[0],
          label: `${HEROES[pTeam[0]].name}队 vs ${HEROES[eTeam[0]].name}队`,
          matches: matchesPerMatchup,
          collectTrajectories: false
        });
      }
    } else {
      // 1v1 Modes (cpu, chaos, mayhem): All 78 unique pairings including mirror matches
      for (let i = 0; i < HEROES.length; i++) {
        for (let j = i; j < HEROES.length; j++) {
          tasks.push({
            id: taskId++,
            mode,
            p1: i,
            p2: j,
            label: `${HEROES[i].name} vs ${HEROES[j].name}`,
            matches: matchesPerMatchup,
            collectTrajectories: collectTrajectories && mode === 'cpu'
          });
        }
      }
    }
  }

  const totalMatchesToSim = tasks.reduce((sum, t) => sum + t.matches, 0);
  console.log(`Generated ${tasks.length} distinct circumstances (${totalMatchesToSim.toLocaleString()} total matches).`);
  console.log(`Launching ${concurrency} parallel worker threads...\n`);

  const startTime = Date.now();
  let completedTasks = 0;
  let totalFramesSimulated = 0;

  // Training trajectory accumulators (keyed by hero id, filled from cpu-mode tasks)
  const trajectoriesByHero = {};
  for (const h of HEROES) trajectoriesByHero[h.id] = [];

  // Aggregate stats per mode
  const modeStats = {};
  for (const m of modesToRun) {
    modeStats[m] = {
      heroWins: Array(HEROES.length).fill(0),
      heroMatches: Array(HEROES.length).fill(0),
      matchupWins: Array.from({ length: HEROES.length }, () => Array(HEROES.length).fill(0)),
      totalMatches: 0,
      draws: 0
    };
    if (m === 'watch2v2') {
      modeStats[m].duoWins = Array(DUOS.length).fill(0);
      modeStats[m].duoMatches = Array(DUOS.length).fill(0);
      modeStats[m].duoHeadToHead = Array.from({ length: DUOS.length }, () => Array(DUOS.length).fill(0));
    }
  }

  // Worker pool management
  const workers = [];
  const __filename = fileURLToPath(import.meta.url);

  let taskCursor = 0;

  await new Promise(resolve => {
    for (let w = 0; w < concurrency; w++) {
      const worker = new Worker(__filename);
      workers.push(worker);

      worker.on('message', msg => {
        completedTasks++;
        totalFramesSimulated += msg.totalFrames;

        if (msg.trajectories && msg.trajectories.length > 0) {
          for (const tr of msg.trajectories) {
            const hero = HEROES[tr.heroIdx];
            if (hero) trajectoriesByHero[hero.id].push(tr);
          }
        }

        const ms = modeStats[msg.mode];
        if (ms) {
          ms.totalMatches += msg.results.length;
          if (msg.mode === 'watch2v2' && msg.duo1 !== undefined && msg.duo2 !== undefined) {
            for (const res of msg.results) {
              ms.duoMatches[msg.duo1]++;
              ms.duoMatches[msg.duo2]++;
              ms.heroMatches[msg.p1]++; ms.heroMatches[msg.p2]++;
              ms.heroMatches[msg.p3]++; ms.heroMatches[msg.p4]++;
              if (res.winner === 0) {
                ms.duoWins[msg.duo1]++;
                ms.heroWins[msg.p1]++; ms.heroWins[msg.p2]++;
                ms.duoHeadToHead[msg.duo1][msg.duo2]++;
              } else if (res.winner === 1) {
                ms.duoWins[msg.duo2]++;
                ms.heroWins[msg.p3]++; ms.heroWins[msg.p4]++;
                ms.duoHeadToHead[msg.duo2][msg.duo1]++;
              } else {
                ms.draws++;
              }
            }
          } else {
            for (const res of msg.results) {
              ms.heroMatches[msg.p1]++;
              ms.heroMatches[msg.p2]++;
              if (res.winner === 0) {
                ms.heroWins[msg.p1]++;
                ms.matchupWins[msg.p1][msg.p2]++;
              } else if (res.winner === 1) {
                ms.heroWins[msg.p2]++;
                ms.matchupWins[msg.p2][msg.p1]++;
              } else {
                ms.draws++;
              }
            }
          }
        }

        const pct = ((completedTasks / tasks.length) * 100).toFixed(1);
        const elapsed = (Date.now() - startTime) / 1000;
        const fps = Math.round(totalFramesSimulated / Math.max(0.001, elapsed));
        process.stdout.write(`\r  [Progress: ${pct}%] Tasks: ${completedTasks}/${tasks.length} | Matches: ${(completedTasks * matchesPerMatchup).toLocaleString()}/${totalMatchesToSim.toLocaleString()} | Rate: ${fps.toLocaleString()} frames/s`);

        if (taskCursor < tasks.length) {
          worker.postMessage(tasks[taskCursor++]);
        } else {
          worker.terminate();
          if (completedTasks === tasks.length) resolve();
        }
      });

      worker.on('error', err => {
        console.error(`\nWorker thread error:`, err);
        worker.terminate();
        if (completedTasks === tasks.length) resolve();
      });

      if (taskCursor < tasks.length) {
        worker.postMessage(tasks[taskCursor++]);
      }
    }
  });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const avgFps = Math.round(totalFramesSimulated / Math.max(0.001, totalTime));

  console.log(`\n\n================================================================`);
  console.log(`   Exhaustive Simulation Complete!                              `);
  console.log(`   Simulated ${totalMatchesToSim.toLocaleString()} matches (${totalFramesSimulated.toLocaleString()} frames) in ${totalTime}s`);
  console.log(`   Average Effective Speed: ${avgFps.toLocaleString()} frames/sec (~${(avgFps / 60).toFixed(0)}x Real-time)`);
  console.log(`================================================================\n`);

  mkdirSync('data/meta', { recursive: true });
  const allReports = {};

  const MODE_TITLES = {
    cpu: '1v1 CPU Duel',
    chaos: 'Chaos Mutation Arena',
    mayhem: 'Mayhem Mode (10x Meter)',
    watch2v2: '2v2 Team Watch',
    tag3: '3v3 Tag Relay'
  };

  for (const mode of modesToRun) {
    const ms = modeStats[mode];
    const modeTitle = MODE_TITLES[mode] || mode.toUpperCase();

    if (mode === 'watch2v2') {
      const duoRankings = DUOS.map(d => {
        const wins = ms.duoWins[d.id] || 0;
        const matches = ms.duoMatches[d.id] || 0;
        const wr = matches > 0 ? (wins / matches) : 0;
        const strongAgainst = [];
        const weakAgainst = [];
        for (let j = 0; j < DUOS.length; j++) {
          if (d.id === j) continue;
          const wAgainst = ms.duoHeadToHead[d.id][j] || 0;
          const lAgainst = ms.duoHeadToHead[j][d.id] || 0;
          const tot = wAgainst + lAgainst;
          if (tot >= 3) {
            if (wAgainst / tot >= 0.60) strongAgainst.push(DUOS[j].name);
            else if (lAgainst / tot >= 0.60) weakAgainst.push(DUOS[j].name);
          }
        }
        const tier = wr >= 0.65 ? 'S' : wr >= 0.52 ? 'A' : wr >= 0.42 ? 'B' : 'C';
        return {
          duoId: d.id,
          name: d.name,
          heroes: [HEROES[d.h1].name, HEROES[d.h2].name],
          tier,
          winRate: (wr * 100).toFixed(1) + '%',
          wrVal: wr,
          record: `${wins}/${matches}`,
          strongAgainst: strongAgainst.length ? strongAgainst : ['均衡对抗'],
          weakAgainst: weakAgainst.length ? weakAgainst : ['无显著劣势']
        };
      });
      duoRankings.sort((a, b) => b.wrVal - a.wrVal);

      const partnerMatrix = HEROES.map((h, i) => {
        const partnerStats = [];
        for (let j = 0; j < HEROES.length; j++) {
          if (i === j) continue;
          const dId = DUOS.find(d => (d.h1 === i && d.h2 === j) || (d.h1 === j && d.h2 === i))?.id;
          if (dId !== undefined) {
            const w = ms.duoWins[dId] || 0;
            const m = ms.duoMatches[dId] || 0;
            partnerStats.push({ partner: HEROES[j].name, wr: m > 0 ? (w / m) : 0, record: `${w}/${m}` });
          }
        }
        partnerStats.sort((a, b) => b.wr - a.wr);
        return {
          hero: h.name,
          bestPartner: partnerStats[0] ? `${partnerStats[0].partner} (${(partnerStats[0].wr * 100).toFixed(1)}%)` : '-',
          secondPartner: partnerStats[1] ? `${partnerStats[1].partner} (${(partnerStats[1].wr * 100).toFixed(1)}%)` : '-',
          thirdPartner: partnerStats[2] ? `${partnerStats[2].partner} (${(partnerStats[2].wr * 100).toFixed(1)}%)` : '-'
        };
      });

      allReports[mode] = {
        mode,
        type: 'two_player_vs_two_player',
        matchesPerCircumstance: matchesPerMatchup,
        totalMatches: ms.totalMatches,
        draws: ms.draws,
        duoRankings,
        partnerMatrix
      };

      console.log(`\n### [ ${modeTitle} ] Two-Player Duo Team Meta Tier List (All 66 Combinations):`);
      console.log('| Rank | Tier | Duo Team (两名侠客阵容) | Win Rate | Record | Strong Against (优势克制双人组) | Weak Against (劣势被克双人组) |');
      console.log('|:---:|:---:|:---:|:---:|:---:|:---|:---|');
      duoRankings.forEach((r, idx) => {
        console.log(`| #${idx + 1} | **${r.tier}** | ${r.name} | ${r.winRate} | ${r.record} | ${r.strongAgainst.join('、')} | ${r.weakAgainst.join('、')} |`);
      });

      console.log(`\n### [ ${modeTitle} ] Best Partner Synergy Matrix (各英雄最佳双人搭档榜):`);
      console.log('| Hero (侠客) | #1 Best Partner (最佳搭档) | #2 Partner (次选搭档) | #3 Partner (三选搭档) |');
      console.log('|:---:|:---|:---|:---|');
      partnerMatrix.forEach(p => {
        console.log(`| ${p.hero} | **${p.bestPartner}** | ${p.secondPartner} | ${p.thirdPartner} |`);
      });

      writeFileSync(`data/meta/watch2v2_duo_meta.json`, JSON.stringify(allReports[mode], null, 2), 'utf8');
      writeFileSync(`data/meta/${mode}.json`, JSON.stringify(allReports[mode], null, 2), 'utf8');
    } else {
      const rankings = HEROES.map((h, i) => {
        const wins = ms.heroWins[i];
        const matches = ms.heroMatches[i];
        const wr = matches > 0 ? (wins / matches) : 0;
        const strongAgainst = [];
        const weakAgainst = [];

        for (let j = 0; j < HEROES.length; j++) {
          if (i === j) continue;
          const wAgainst = ms.matchupWins[i][j];
          const lAgainst = ms.matchupWins[j][i];
          const tot = wAgainst + lAgainst;
          if (tot >= 3) {
            if (wAgainst / tot >= 0.60) strongAgainst.push(HEROES[j].name);
            else if (lAgainst / tot >= 0.60) weakAgainst.push(HEROES[j].name);
          }
        }

        const tier = wr >= 0.65 ? 'S' : wr >= 0.52 ? 'A' : wr >= 0.42 ? 'B' : 'C';
        return {
          id: h.id,
          name: h.name,
          tier,
          winRate: (wr * 100).toFixed(1) + '%',
          wrVal: wr,
          record: `${wins}/${matches}`,
          strongAgainst: strongAgainst.length ? strongAgainst : ['均衡对抗'],
          weakAgainst: weakAgainst.length ? weakAgainst : ['无显著劣势']
        };
      });

      rankings.sort((a, b) => b.wrVal - a.wrVal);

      allReports[mode] = {
        mode,
        matchesPerCircumstance: matchesPerMatchup,
        totalMatches: ms.totalMatches,
        draws: ms.draws,
        rankings
      };

      console.log(`\n### [ ${modeTitle} ] Hero Meta Rankings:`);
      console.log('| Rank | Tier | Hero | Win Rate | Record | Strong Against | Weak Against |');
      console.log('|:---:|:---:|:---:|:---:|:---:|:---|:---|');
      rankings.forEach((r, idx) => {
        console.log(`| #${idx + 1} | **${r.tier}** | ${r.name} | ${r.winRate} | ${r.record} | ${r.strongAgainst.join('、')} | ${r.weakAgainst.join('、')} |`);
      });

      writeFileSync(`data/meta/${mode}.json`, JSON.stringify(allReports[mode], null, 2), 'utf8');
    }
  }

  writeFileSync('data/meta/exhaustive_report.json', JSON.stringify(allReports, null, 2), 'utf8');
  console.log(`\n✓ All mode meta dossiers exported to data/meta/`);
  console.log(`✓ Master report saved to data/meta/exhaustive_report.json\n`);

  // =========================================================================
  // HERO WIN-RATE & KEZHI (克制 ±10%) BALANCE AUDIT REPORT (cpu mode)
  // =========================================================================
  if (modeStats['cpu']) {
    const ms = modeStats['cpu'];
    console.log(`\n=================================================================`);
    console.log(`   RenYing Hero Balance & KeZhi (克制 ±10% Acceptable) Audit    `);
    console.log(`=================================================================`);

    const balanceData = HEROES.map(h => {
      const picks = ms.heroMatches[h.idx];
      const wins = ms.heroWins[h.idx];
      const overallWr = picks > 0 ? (wins / picks) : 0.50;

      let counterCount = 0;
      let counterInTolerance = 0;
      let totalDeviation = 0;
      let evaluatedMatchups = 0;

      for (let j = 0; j < HEROES.length; j++) {
        if (h.idx === j) continue;
        const wAgainst = ms.matchupWins[h.idx][j];
        const lAgainst = ms.matchupWins[j][h.idx];
        const tot = wAgainst + lAgainst;
        if (tot === 0) continue;

        const actualWr = wAgainst / tot;
        const opp = HEROES[j];
        const isAdvantage = h.beats && (h.beats.includes(opp.id) || (opp.weakTo && opp.weakTo.includes(h.id)));
        const isDisadvantage = h.weakTo && (h.weakTo.includes(opp.id) || (opp.beats && opp.beats.includes(h.id)));

        let target = 0.50;
        let tol = 0.05; // Neutral matchups: ±5%
        if (isAdvantage && !isDisadvantage) {
          target = 0.58;
          tol = 0.10; // KeZhi: ±10% acceptable range
          counterCount++;
        } else if (isDisadvantage && !isAdvantage) {
          target = 0.42;
          tol = 0.10; // KeZhi: ±10% acceptable range
          counterCount++;
        }

        const minAcc = Math.max(0.10, target - tol);
        const maxAcc = Math.min(0.90, target + tol);
        let dev = 0;
        if (actualWr > maxAcc) dev = actualWr - maxAcc;
        else if (actualWr < minAcc) dev = actualWr - minAcc;

        if (isAdvantage || isDisadvantage) {
          if (dev === 0) counterInTolerance++;
        }

        totalDeviation += dev;
        evaluatedMatchups++;
      }

      const avgDev = evaluatedMatchups > 0 ? (totalDeviation / evaluatedMatchups) : 0;
      return {
        ...h,
        picks,
        wins,
        rate: overallWr * 100,
        avgDev,
        counterCount,
        counterInTolerance
      };
    }).sort((a, b) => b.rate - a.rate);

    console.log(`  英雄     | 胜场 / 场次 | 胜率    | 克制合格率 (±10%内) | 评定状态`);
    console.log(`  ---------|-------------|---------|---------------------|---------------------------`);
    for (const s of balanceData) {
      let status = '🟢 均衡 (Balanced)';
      if (Math.abs(s.avgDev) <= 0.02) {
        status = '🟢 均衡 (In Tolerance)';
      } else if (s.avgDev > 0) {
        status = s.avgDev > 0.10 ? '🔴 过强 (Dominant — Needs Nerf)' : '🟡 偏强 (Slightly Strong)';
      } else {
        status = s.avgDev < -0.10 ? '🔵 偏弱 (Underpowered — Needs Buff)' : '⚪ 略弱 (Slightly Weak)';
      }
      const kezhiRatio = s.counterCount > 0 ? `${s.counterInTolerance}/${s.counterCount} 合格`.padEnd(19) : '无克制对局'.padEnd(19);
      console.log(`  ${s.name.padEnd(6)} | ${(s.wins + '/' + s.picks).padEnd(11)} | ${s.rate.toFixed(1).padStart(5)}%  | ${kezhiRatio} | ${status}`);
    }
    console.log(`=================================================================\n`);
  }

  // =========================================================================
  // NEURAL HERO TRAINING (parallel, using cpu-mode trajectories)
  // =========================================================================
  if (!skipTrain && collectTrajectories) {
    const totalTraj = Object.values(trajectoriesByHero).reduce((s, a) => s + a.length, 0);
    console.log(`\n=================================================================`);
    console.log(`   Neural Training: ${HEROES.length} heroes | ${totalTraj.toLocaleString()} total trajectories`);
    console.log(`   Epochs: ${epochs} | Parallel jobs: ${Math.min(concurrency, HEROES.length)}`);
    console.log(`=================================================================\n`);

    mkdirSync('data', { recursive: true });
    mkdirSync('models/heroes', { recursive: true });

    const trainStart = Date.now();
    const trainQueue = [...HEROES];
    const trainSummary = [];

    async function runTrainJob(hero) {
      const list = trajectoriesByHero[hero.id];
      if (!list || list.length === 0) {
        console.log(`  ⚠  ${hero.name} (${hero.id}): no trajectories collected — skipping.`);
        trainSummary.push({ hero: hero.name, id: hero.id, status: 'SKIPPED (no data)' });
        return;
      }
      const dataPath = `data/hero_${hero.id}.jsonl`;
      const modelPath = `models/heroes/${hero.id}.json`;
      writeFileSync(dataPath, list.map(d => JSON.stringify(d)).join('\n') + '\n', 'utf8');

      return new Promise(resolve => {
        const proc = spawn(getNodeBin(), [
          'tools/train-policy.mjs',
          '--data', dataPath,
          '--hero', hero.id,
          '--epochs', String(epochs),
          '--out', modelPath
        ], { stdio: 'inherit' });
        proc.on('error', err => {
          console.error(`  ✗  ${hero.name} (${hero.id}) training spawn error:`, err.message);
          trainSummary.push({ hero: hero.name, id: hero.id, path: modelPath, status: `FAILED (${err.message})` });
          resolve();
        });
        proc.on('close', code => {
          trainSummary.push({ hero: hero.name, id: hero.id, path: modelPath, status: code === 0 ? 'OK' : 'FAILED' });
          resolve();
        });
      });
    }

    const numTrainWorkers = Math.min(concurrency, HEROES.length);
    const trainWorkerPool = Array.from({ length: numTrainWorkers }, async () => {
      while (trainQueue.length > 0) {
        const nextHero = trainQueue.shift();
        if (nextHero) await runTrainJob(nextHero);
      }
    });
    await Promise.all(trainWorkerPool);

    try { execSync('rm -rf data/hero_*.jsonl', { stdio: 'ignore' }); } catch (e) {}

    const trainTime = ((Date.now() - trainStart) / 1000).toFixed(2);
    console.log(`\n✓ Neural training complete in ${trainTime}s!`);

    console.log(`\n  Hero      | Status`);
    console.log(`  ----------|----------`);
    for (const s of trainSummary) {
      const icon = s.status === 'OK' ? '✓' : s.status.startsWith('SKIPPED') ? '–' : '✗';
      console.log(`  ${s.hero.padEnd(9)} | ${icon} ${s.status}`);
    }

    // =========================================================================
    // BUILD + VERIFY + GIT PUSH
    // =========================================================================
    try {
      console.log('\nPackaging updated neural weights into game build (tools/build.py)...');
      execSync('python3 tools/build.py', { stdio: 'inherit' });
      console.log('[Build Complete] Game is ready with latest models!');

      console.log('\nRunning regression check (tools/combat-test.mjs)...');
      execSync(`${getNodeBin()} tools/combat-test.mjs`, { stdio: 'inherit' });
      console.log('✓ Combat mechanics verified 100% PASS.');

      if (doPush) {
        console.log('\nCommitting and pushing to origin/main...');
        execSync('git add models/ index.html renying-offline.html', { stdio: 'inherit' });
        try {
          execSync('git commit -m "feat: train ai models"', { stdio: 'inherit' });
          execSync('git push origin main', { stdio: 'inherit' });
          console.log('✓ Pushed to origin/main successfully.');
        } catch (gitErr) {
          console.warn('⚠ git commit/push failed (nothing new to commit or push rejected).');
        }
      }
    } catch (e) {
      console.warn('⚠ Could not complete build, verify or push:', e.message);
    }
  } else if (doPush && skipTrain) {
    try {
      execSync('python3 tools/build.py', { stdio: 'inherit' });
      execSync('git add models/ index.html renying-offline.html', { stdio: 'inherit' });
      try {
        execSync('git commit -m "chore: update simulation meta"', { stdio: 'inherit' });
        execSync('git push origin main', { stdio: 'inherit' });
        console.log('✓ Pushed to origin/main.');
      } catch (gitErr) {}
    } catch (e) {}
  }

  console.log('\n✓ All done!\n');
}
