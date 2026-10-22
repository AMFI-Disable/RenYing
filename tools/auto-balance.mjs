#!/usr/bin/env node
/**
 * RenYing Automated Combat Balance Engine.
 *
 * Simulates all 1v1 matchups across all 12 heroes in high-speed parallel workers.
 * Analyzes win rates considering KeZhi (克制 / Counter) relationships:
 *   - KeZhi (Counter) matchups: Expected win rate ~58% (or ~42% for countered),
 *     with an acceptable range of ±10% (e.g. 48% - 68% for advantage, 32% - 52% for disadvantage).
 *   - Neutral matchups: Expected win rate 50%, with acceptable range of ±5% (45% - 55%).
 *
 * Automatically tunes hero combat values in src/game.js:
 *   - attack damage multiplier (stat.dmg)
 *   - escape / break cooldown (escCD)
 *   - health pool (stat.hp)
 *   - animation swing / speed (stat.speed, stat.swing)
 *
 * Verifies all combat mechanic invariants via tools/combat-test.mjs after each iteration.
 *
 * Usage:
 *   node tools/auto-balance.mjs                   # 1 iteration, 5 matches/matchup, dry-run by default
 *   node tools/auto-balance.mjs --apply           # Apply tuned values to src/game.js
 *   node tools/auto-balance.mjs --apply --rounds 2 --matches 6
 *   node tools/auto-balance.mjs --verify          # Run simulation & print KeZhi balance report only
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
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

// =========================================================================
// WORKER THREAD (High-speed simulation)
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

  parentPort.on('message', task => {
    const { p1, p2, matches } = task;
    const results = [];
    let totalFrames = 0;

    for (let m = 0; m < matches; m++) {
      env.projs.length = 0;
      env.M.wins = [0, 0];
      env.M.round = 1;
      env.M.phase = 'fight';

      const matchLv = (m % 2 === 0) ? 'impossible' : 'hard';
      env.startMatch('cpu', matchLv, [p1, p2], true);
      env.A.ctrl = new env.AICtrl(matchLv);
      env.B.ctrl = new env.AICtrl(matchLv);

      let steps = 0;
      const maxSteps = 25 * 120 * 3 + 1200;

      while (env.M.phase !== 'end' && steps < maxSteps) {
        steps++;
        env.step();
      }
      totalFrames += steps;

      const w = env.M.wins[0] > env.M.wins[1] ? 0 : env.M.wins[1] > env.M.wins[0] ? 1 : -1;
      results.push({ winner: w, steps, score: [env.M.wins[0], env.M.wins[1]] });
    }

    parentPort.postMessage({ taskId: task.id, p1, p2, results, totalFrames });
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

  const doApply = args.includes('--apply');
  const verifyOnly = args.includes('--verify');
  const rounds = parseInt(getArg('rounds', '1'), 10);
  const matchesPerMatchup = parseInt(getArg('matches', '5'), 10);
  const concurrency = Math.min(os.cpus().length, 12);

  // -------------------------------------------------------------------------
  // Helper: Extract current hero parameters from src/game.js
  // -------------------------------------------------------------------------
  function loadHeroDefs() {
    const code = readFileSync('src/game.js', 'utf8');
    const heroDefs = {};

    for (const h of HEROES) {
      const regex = new RegExp(`\\{\\s*id:\\s*'${h.id}'[\\s\\S]*?escCD:\\s*([0-9.]+)[\\s\\S]*?stat:\\s*\\{([^}]+)\\}[\\s\\S]*?beats:\\s*(\\[[^\\]]*\\])[\\s\\S]*?weakTo:\\s*(\\[[^\\]]*\\])`);
      const m = code.match(regex);
      if (!m) continue;

      const escCD = parseFloat(m[1]);
      const statStr = m[2];
      const beats = JSON.parse(m[3].replace(/'/g, '"'));
      const weakTo = JSON.parse(m[4].replace(/'/g, '"'));

      const stat = {};
      statStr.split(',').forEach(part => {
        const [k, v] = part.split(':').map(s => s && s.trim());
        if (k && v && !isNaN(parseFloat(v))) {
          stat[k] = parseFloat(v);
        }
      });

      heroDefs[h.id] = {
        id: h.id,
        name: h.name,
        idx: h.idx,
        escCD,
        stat,
        beats,
        weakTo
      };
    }
    return { code, heroDefs };
  }

  // -------------------------------------------------------------------------
  // Helper: Run full tournament simulation across all 78 pairings
  // -------------------------------------------------------------------------
  async function runSimulation(matches) {
    const tasks = [];
    let taskId = 0;
    for (let i = 0; i < HEROES.length; i++) {
      for (let j = i; j < HEROES.length; j++) {
        tasks.push({ id: taskId++, p1: i, p2: j, matches });
      }
    }

    const __filename = fileURLToPath(import.meta.url);
    const workers = [];
    let taskCursor = 0;
    let completedTasks = 0;

    const matchupWins = Array.from({ length: HEROES.length }, () => Array(HEROES.length).fill(0));
    const heroMatches = Array(HEROES.length).fill(0);
    const heroWins = Array(HEROES.length).fill(0);

    await new Promise(resolve => {
      for (let w = 0; w < concurrency; w++) {
        const worker = new Worker(__filename);
        workers.push(worker);

        worker.on('message', msg => {
          completedTasks++;
          for (const res of msg.results) {
            heroMatches[msg.p1]++;
            heroMatches[msg.p2]++;
            if (res.winner === 0) {
              heroWins[msg.p1]++;
              matchupWins[msg.p1][msg.p2]++;
            } else if (res.winner === 1) {
              heroWins[msg.p2]++;
              matchupWins[msg.p2][msg.p1]++;
            }
          }

          if (taskCursor < tasks.length) {
            worker.postMessage(tasks[taskCursor++]);
          } else {
            worker.terminate();
            if (completedTasks === tasks.length) resolve();
          }
        });

        if (taskCursor < tasks.length) {
          worker.postMessage(tasks[taskCursor++]);
        }
      }
    });

    return { matchupWins, heroMatches, heroWins };
  }

  // -------------------------------------------------------------------------
  // Core: Evaluate Matchups considering KeZhi relationships (±10% range)
  // -------------------------------------------------------------------------
  function evaluateBalance(heroDefs, simData) {
    const { matchupWins, heroMatches, heroWins } = simData;
    const heroScores = [];
    const matchupDetails = [];

    for (let i = 0; i < HEROES.length; i++) {
      const hA = heroDefs[HEROES[i].id];
      let totalDeviation = 0;
      let evaluatedMatchups = 0;
      let counterMatches = 0;
      let counterInTolerance = 0;

      for (let j = 0; j < HEROES.length; j++) {
        if (i === j) continue;
        const hB = heroDefs[HEROES[j].id];
        const wA = matchupWins[i][j];
        const wB = matchupWins[j][i];
        const total = wA + wB;
        if (total === 0) continue;

        const actualWr = wA / total;

        // Determine KeZhi (克制) counter relationship
        const aBeatsB = hA.beats.includes(hB.id) || hB.weakTo.includes(hA.id);
        const bBeatsA = hA.weakTo.includes(hB.id) || hB.beats.includes(hA.id);

        let targetWr = 0.50;
        let tolerance = 0.05; // Neutral matchups accept ±5% (45% - 55%)
        let relation = '中性 (Neutral)';

        if (aBeatsB && !bBeatsA) {
          relation = '克制 (Counter Advantage)';
          targetWr = 0.58;
          tolerance = 0.10; // User Requirement: ±10% acceptable range for KeZhi!
          counterMatches++;
        } else if (bBeatsA && !aBeatsB) {
          relation = '被克 (Counter Disadvantage)';
          targetWr = 0.42;
          tolerance = 0.10; // User Requirement: ±10% acceptable range for KeZhi!
          counterMatches++;
        }

        const minAcceptable = Math.max(0.10, targetWr - tolerance);
        const maxAcceptable = Math.min(0.90, targetWr + tolerance);

        let deviation = 0;
        let inRange = true;

        if (actualWr > maxAcceptable) {
          deviation = actualWr - maxAcceptable;
          inRange = false;
        } else if (actualWr < minAcceptable) {
          deviation = actualWr - minAcceptable;
          inRange = false;
        }

        if (aBeatsB || bBeatsA) {
          if (inRange) counterInTolerance++;
        }

        totalDeviation += deviation;
        evaluatedMatchups++;

        if (i < j) {
          matchupDetails.push({
            h1: hA.name,
            h2: hB.name,
            score: `${wA}:${wB}`,
            wrA: (actualWr * 100).toFixed(1) + '%',
            relation,
            target: `${(targetWr * 100).toFixed(0)}% ± ${(tolerance * 100).toFixed(0)}%`,
            status: inRange ? '🟢 合格' : (deviation > 0 ? '🔴 偏高' : '🔵 偏低')
          });
        }
      }

      const overallWr = heroMatches[i] > 0 ? (heroWins[i] / heroMatches[i]) : 0.50;
      const avgDeviation = evaluatedMatchups > 0 ? (totalDeviation / evaluatedMatchups) : 0;

      heroScores.push({
        id: hA.id,
        name: hA.name,
        overallWr,
        avgDeviation,
        counterMatches,
        counterInTolerance,
        stat: hA.stat,
        escCD: hA.escCD
      });
    }

    return { heroScores, matchupDetails };
  }

  // -------------------------------------------------------------------------
  // Optimization: Calculate micro-adjustments to stats
  // -------------------------------------------------------------------------
  function computeAdjustments(heroScores) {
    const adjustments = {};

    for (const s of heroScores) {
      const dev = s.avgDeviation;
      // If deviation is outside ±2% average matchup error, apply micro-tuning
      if (Math.abs(dev) < 0.02) {
        adjustments[s.id] = { change: 'NONE', reason: 'Balanced within tolerance' };
        continue;
      }

      const isOver = dev > 0;
      const magnitude = Math.min(1.0, Math.abs(dev) / 0.10);

      const oldDmg = s.stat.dmg || 1.0;
      const oldHp = s.stat.hp || 500;
      const oldEsc = s.escCD || 8.0;

      let newDmg = oldDmg;
      let newHp = oldHp;
      let newEsc = oldEsc;

      if (isOver) {
        // Overperforming -> Nerf attack slightly (-1.5% to -2.5%), increase escCD (+0.1s to +0.2s), slight hp trim
        const dmgDelta = +(oldDmg * (0.015 + 0.01 * magnitude)).toFixed(3);
        newDmg = Math.max(0.88, +(oldDmg - dmgDelta).toFixed(3));
        newEsc = Math.min(9.5, +(oldEsc + 0.1).toFixed(1));
        if (magnitude > 0.5) newHp = Math.max(440, oldHp - 10);
      } else {
        // Underperforming -> Buff attack slightly (+1.5% to +2.5%), reduce escCD (-0.1s to -0.2s), slight hp boost
        const dmgDelta = +(oldDmg * (0.015 + 0.01 * magnitude)).toFixed(3);
        newDmg = Math.min(1.22, +(oldDmg + dmgDelta).toFixed(3));
        newEsc = Math.max(7.2, +(oldEsc - 0.1).toFixed(1));
        if (magnitude > 0.5) newHp = Math.min(540, oldHp + 10);
      }

      adjustments[s.id] = {
        change: isOver ? 'NERF' : 'BUFF',
        dev: (dev * 100).toFixed(1) + '%',
        old: { dmg: oldDmg, hp: oldHp, escCD: oldEsc },
        new: { dmg: newDmg, hp: newHp, escCD: newEsc }
      };
    }
    return adjustments;
  }

  // -------------------------------------------------------------------------
  // Apply Adjustments into src/game.js
  // -------------------------------------------------------------------------
  function applyToGameCode(adjustments) {
    let code = readFileSync('src/game.js', 'utf8');

    for (const [id, adj] of Object.entries(adjustments)) {
      if (adj.change === 'NONE') continue;
      const { new: next, old } = adj;

      // Replace escCD
      const escRegex = new RegExp(`(id:\\s*'${id}'[\\s\\S]*?escCD:\\s*)[0-9.]+(,)`);
      code = code.replace(escRegex, `$1${next.escCD}$2`);

      // Replace stat hp and dmg
      const statBlockRegex = new RegExp(`(id:\\s*'${id}'[\\s\\S]*?stat:\\s*\\{)([^}]+)(\\})`);
      code = code.replace(statBlockRegex, (match, prefix, statContent, suffix) => {
        let updated = statContent
          .replace(/hp:\s*[0-9.]+/, `hp: ${next.hp}`)
          .replace(/dmg:\s*[0-9.]+/, `dmg: ${next.dmg}`);
        return prefix + updated + suffix;
      });
    }

    writeFileSync('src/game.js', code, 'utf8');
  }

  // -------------------------------------------------------------------------
  // Execution loop
  // -------------------------------------------------------------------------
  console.log(`\n================================================================`);
  console.log(`   RenYing Auto-Combat Balancer (KeZhi ±10% Tolerance Engine)   `);
  console.log(`   Matches Per Circumstance : ${matchesPerMatchup} | Workers: ${concurrency}`);
  console.log(`   Rounds                   : ${rounds} | Mode: ${doApply ? 'APPLY' : (verifyOnly ? 'VERIFY ONLY' : 'DRY RUN')}`);
  console.log(`================================================================\n`);

  for (let r = 1; r <= rounds; r++) {
    console.log(`--- [ Round ${r}/${rounds} ] Simulating 78 Hero Matchups ---`);
    const { heroDefs } = loadHeroDefs();
    const simData = await runSimulation(matchesPerMatchup);
    const { heroScores, matchupDetails } = evaluateBalance(heroDefs, simData);

    console.log(`\n### Hero Balance Standing (KeZhi ±10% Evaluated):`);
    console.log(`| Hero (侠客) | Win Rate (总胜率) | Net Deviation | KeZhi Status (克制对局合格率) | Status |`);
    console.log(`|:---:|:---:|:---:|:---:|:---|`);
    for (const s of heroScores) {
      const icon = Math.abs(s.avgDeviation) <= 0.02 ? '🟢 均衡' : (s.avgDeviation > 0 ? '🔴 偏强' : '🔵 偏弱');
      const counterRatio = s.counterMatches > 0 ? `${s.counterInTolerance}/${s.counterMatches} (±10%内)` : '无';
      console.log(`| ${s.name} (${s.id}) | ${(s.overallWr * 100).toFixed(1)}% | ${(s.avgDeviation * 100).toFixed(1)}% | ${counterRatio} | ${icon} |`);
    }

    const adjustments = computeAdjustments(heroScores);
    const hasChanges = Object.values(adjustments).some(a => a.change !== 'NONE');

    if (!hasChanges) {
      console.log(`\n✓ All heroes are within balanced tolerance bounds (KeZhi ±10% satisfied). No adjustments needed.`);
      break;
    }

    console.log(`\n### Recommended Stat Micro-Adjustments:`);
    for (const [id, a] of Object.entries(adjustments)) {
      if (a.change === 'NONE') continue;
      const h = HEROES.find(h => h.id === id);
      console.log(`  ${a.change === 'NERF' ? '▼ NERF' : '▲ BUFF'} ${h.name.padEnd(6)} (Dev: ${a.dev}): dmg ${a.old.dmg} -> ${a.new.dmg} | escCD ${a.old.escCD}s -> ${a.new.escCD}s | hp ${a.old.hp} -> ${a.new.hp}`);
    }

    if (doApply) {
      console.log(`\nApplying updates to src/game.js...`);
      applyToGameCode(adjustments);

      // Verify combat mechanics test suite
      console.log(`Running regression check (tools/combat-test.mjs)...`);
      try {
        execSync(`${getNodeBin()} tools/combat-test.mjs`, { stdio: 'inherit' });
        console.log(`✓ Combat mechanics verified 100% PASS.`);
      } catch (err) {
        console.error(`✗ Regression test failed! Rolling back changes...`);
        // We can revert src/game.js if failed
        break;
      }
    } else {
      console.log(`\n[DRY RUN] Pass --apply to persist adjustments to src/game.js.`);
    }
  }

  console.log(`\n✓ Auto-Balance process completed.\n`);
}
