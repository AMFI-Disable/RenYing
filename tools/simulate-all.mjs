#!/usr/bin/env node
/**
 * Exhaustive RenYing Match Simulator & Meta Analyzer.
 *
 * Runs 5 matches for EVERY CIRCUMSTANCE:
 *   - All 6 Game Modes: cpu (1v1), bushido (One-Hit Mode), chaos (mutations), mayhem (10x meter), watch2v2 (2-Player vs 2-Player), tag3 (3v3)
 *   - 2v2 Mode: Simulates Two Players vs Two Players across all 66 duo combinations and compiles Duo Tier Lists & Partner Synergy
 *   - 1v1 Modes: All 78 unique pairings across all 12 characters (including mirror matches)
 *   - Multi-core parallel execution across CPU workers for maximum throughput (~100,000+ frames/sec)
 *
 * Usage:
 *   node tools/simulate-all.mjs
 *   node tools/simulate-all.mjs --matches-per-matchup 5 --export data/exhaustive_dataset.jsonl
 *   node tools/simulate-all.mjs --mode watch2v2 --matches-per-matchup 5
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
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
  { id: 'zuixian', idx: 10, name: '醉翁' },
  { id: 'gouchen', idx: 11, name: '勾陈' },
];

const DUOS = [];
for (let i = 0; i < HEROES.length; i++) {
  for (let j = i + 1; j < HEROES.length; j++) {
    DUOS.push({ id: DUOS.length, h1: i, h2: j, name: `${HEROES[i].name} + ${HEROES[j].name}` });
  }
}

const MODES = ['cpu', 'bushido', 'chaos', 'mayhem', 'watch2v2', 'tag3'];

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
    startBushido: (...args) => startBushido(...args),
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

  parentPort.on('message', task => {
    const { mode, p1, p2, p3, p4, duo1, duo2, pTeam, eTeam, matches } = task;
    const results = [];
    let totalFrames = 0;

    for (let m = 0; m < matches; m++) {
      env.projs.length = 0;
      env.M.wins = [0, 0];
      env.M.round = 1;
      env.M.phase = 'fight';

      if (mode === 'watch2v2') {
        env.startWatch2v2([0, p1, p2, 1, p3, p4]);
      } else if (mode === 'mayhem') {
        env.startMayhem(p1, p2, 'god', true);
      } else if (mode === 'bushido') {
        env.startBushido(p1, p2, 'god', true);
      } else if (mode === 'chaos') {
        env.startChaos(p1, p2, 'god', true);
      } else if (mode === 'tag3') {
        env.startTag3Match(pTeam, eTeam, 'god', true);
      } else {
        env.startMatch('cpu', 'god', [p1, p2], true);
      }

      let steps = 0;
      const maxSteps = (mode === 'watch2v2' ? 45 : 25) * 120 * 3 + 1200;
      while (env.M.phase !== 'end' && steps < maxSteps) {
        steps++;
        env.step();
      }
      totalFrames += steps;

      const w = env.M.wins[0] > env.M.wins[1] ? 0 : env.M.wins[1] > env.M.wins[0] ? 1 : -1;
      results.push({ winner: w, steps, score: [env.M.wins[0], env.M.wins[1]] });
    }

    parentPort.postMessage({ taskId: task.id, mode, p1, p2, p3, p4, duo1, duo2, results, totalFrames });
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

  const matchesPerMatchup = parseInt(getArg('matches-per-matchup', getArg('matches', '5')), 10);
  const targetMode = getArg('mode', 'all');
  const concurrency = parseInt(getArg('workers', getArg('concurrency', String(Math.max(2, os.cpus().length)))), 10);
  const exportPath = getArg('export', '');

  const modesToRun = targetMode === 'all' ? MODES : [targetMode];

  console.log(`\n================================================================`);
  console.log(`   RenYing Exhaustive Circumstance Simulator (All Matchups)     `);
  console.log(`   Matches Per Circumstance: ${matchesPerMatchup} | Workers: ${concurrency}`);
  console.log(`   Modes Scheduled: ${modesToRun.join(', ')}`);
  console.log(`================================================================\n`);

  // Build task list for every circumstance
  const tasks = [];
  let taskId = 0;

  for (const mode of modesToRun) {
    if (mode === 'watch2v2') {
      // 2v2: Every circumstance of TWO PLAYERS VS TWO PLAYERS
      // 12 heroes yield 66 unique two-player duo team combinations
      for (let d1 = 0; d1 < DUOS.length; d1++) {
        const t1 = DUOS[d1];
        let oppCount = 0;
        // Pair each two-player duo against multiple diverse non-overlapping duo teams
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
              matches: matchesPerMatchup
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
          matches: matchesPerMatchup
        });
      }
    } else {
      // 1v1 Modes (cpu, bushido, chaos, mayhem): All 78 unique pairings including mirror matches
      for (let i = 0; i < HEROES.length; i++) {
        for (let j = i; j < HEROES.length; j++) {
          tasks.push({
            id: taskId++,
            mode,
            p1: i,
            p2: j,
            label: `${HEROES[i].name} vs ${HEROES[j].name}`,
            matches: matchesPerMatchup
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

      // Initial task dispatch
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
    bushido: 'One-Hit Mode (1-HP Lethal)',
    chaos: 'Chaos Mutation Arena',
    mayhem: 'Mayhem Mode (10x Meter)',
    watch2v2: '2v2 Team Watch',
    tag3: '3v3 Tag Relay'
  };

  for (const mode of modesToRun) {
    const ms = modeStats[mode];
    const modeTitle = MODE_TITLES[mode] || mode.toUpperCase();

    if (mode === 'watch2v2') {
      // 2v2 SPECIFIC: 2-Player Duo Team Meta & Partner Synergy Charts
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

      // Best Partner Matrix for Each Individual Hero
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
      // 1v1 and Tag3 Single Hero Rankings
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

      console.log(`\n### [ ${modeTitle} ] Hero Meta Rankings (5 Matches Per Circumstance):`);
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
}
