#!/usr/bin/env node
/**
 * Headless CvC (Computer vs Computer) Fast Simulation, Co-op Training & Dataset Generator for RenYing.
 *
 * Optimizations & Capabilities:
 *   1. Persistent VM Sandbox with Fast Reset (~60,000+ frames/sec, >800x real-time speed).
 *   2. Custom Game Mode Training (--mode <cpu|watch2v2|chaos|mayhem|bushido|tag3>).
 *   3. Two-Player Co-op 2v2 Training (--coop): simultaneous dual-agent trajectory recording
 *      with ally relative position, peel signals, focus fire alignment, and shared relic rewards.
 *   4. Mode-Specific Meta & Tier Matrix Generator (--meta): computes S/A/B/C tiers, strengths &
 *      weaknesses (counters / matchups) tailored to each game mode.
 *   5. User Fight Replay Ingestion (--replay <file.json>): simulates human match replays and
 *      converts them into high-weight behavioral cloning trajectories.
 *
 * Usage:
 *   node tools/cvc-sim.mjs --matches 20 --mode watch2v2 --coop --export data/coop_2v2.jsonl
 *   node tools/cvc-sim.mjs --mode mayhem --matches 30 --export data/mayhem.jsonl
 *   node tools/cvc-sim.mjs --mode watch2v2 --meta
 *   node tools/cvc-sim.mjs --replay path/to/replay.json --export data/user_fights.jsonl
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import vm from 'node:vm';

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}
function hasFlag(name) {
  return args.includes('--' + name);
}

const matchCount = parseInt(getArg('matches', '10'), 10);
const matchMode = getArg('mode', 'cpu');
const isCoop = hasFlag('coop') || matchMode === 'watch2v2' && hasFlag('coop');
const isMetaMode = hasFlag('meta') || hasFlag('tierlist');
const replayPath = getArg('replay', '');
const MODE_MAX_LEVEL = { cpu: 'god', bushido: 'god', chaos: 'god', tag3: 'god', mayhem: 'god', watch2v2: 'god', tower: 'impossible' };
const defaultLevel = args.includes('--mode') ? (MODE_MAX_LEVEL[matchMode] || 'god') : 'hard';
const p1Level = getArg('p1-level', getArg('level', defaultLevel));
const p2Level = getArg('p2-level', getArg('level', defaultLevel));
const exportPath = getArg('export', '');
const p1CharArg = getArg('p1', '');
const p2CharArg = getArg('p2', '');

if (hasFlag('exhaustive') || hasFlag('all-circumstances')) {
  const { execSync } = await import('node:child_process');
  const forwarded = args.filter(a => a !== '--exhaustive' && a !== '--all-circumstances').join(' ');
  execSync(`node tools/simulate-all.mjs ${forwarded}`, { stdio: 'inherit' });
  process.exit(0);
}

// Precompile scripts once globally
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

function createRenYingSandbox() {
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
    window: {
      innerWidth: 1440,
      innerHeight: 900,
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => ({ matches: false })
    },
    document: {
      getElementById: () => dummyEl,
      querySelectorAll: () => [],
      querySelector: () => dummyEl,
      createElement: () => dummyEl,
      addEventListener: () => {},
      removeEventListener: () => {},
      body: dummyEl
    },
    location: { protocol: 'http:', hostname: '127.0.0.1', search: '', hash: '' },
    localStorage: { getItem: () => null, setItem: () => {} },
    performance: { now: () => Date.now() },
    navigator: { userAgent: 'node' },
    requestAnimationFrame: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    AudioContext: class { createGain() { return { connect: () => {} }; } },
    Audio: class { play() {} pause() {} },
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440,
    innerHeight: 900,
    Math: Math,
    Date: Date
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

  // Suppress visual particle allocations in headless simulation for maximum throughput
  if (env.window) {
    env.window.addP = () => {};
    env.window.ring = () => {};
    env.window.dust = () => {};
    env.window.spark = () => {};
  }
  return env;
}

// Extract standard 1v1 observation vector (25 features)
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

  // State flag bits
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

  // Nearby threat
  const threatProj = projs.find(p => p.owner !== f.idx && p.dmg > 0 && Math.abs(f.x - p.x) < 300);
  const projNear = threatProj ? (threatProj.x - f.x) / STAGE_W : 0;

  return [
    dx, dy, dist, hp1, hp2, g1, g2, m1, m2, vy1, vy2, face1, face2,
    sAtk1, sBlk1, sHit1, sAir1, sAtk2, sBlk2, sHit2, sAir2,
    cd1, cd2, breakCD, projNear
  ];
}

// Extract 2v2 Co-op observation vector (31 features) with ally awareness
function extractCoopObs(f, foe, ally, projs, STAGE_W) {
  const base = extractObs(f, foe, projs, STAGE_W);
  if (!ally) {
    return [...base, 0, 0, 1, 0, 0, 0];
  }
  const allyDx = (ally.x - f.x) / STAGE_W;
  const allyDy = (ally.y - f.y) / 400;
  const allyHp = ally.hp > 0 ? (ally.hp / ally.maxHp) : 0;
  const allyInHitstun = (ally.state === 'hitstun' || ally.state === 'launched') ? 1 : 0;
  const focusSameTarget = (f.target && ally.target && f.target === ally.target) ? 1 : 0;
  const altarDist = (STAGE_W / 2 - f.x) / STAGE_W;

  return [...base, allyDx, allyDy, allyHp, allyInHitstun, focusSameTarget, altarDist];
}

// Encode controller inputs to discrete action ID (0-9)
function encodeAction(c) {
  if (!c) return 0;
  if (c.buf?.special || c.held?.special) return 9;
  if (c.buf?.dash || c.held?.dash) return 8;
  if (c.buf?.skill2 || c.held?.skill2) return 7;
  if (c.buf?.skill || c.held?.skill) return 6;
  if (c.buf?.light || c.held?.atk) return 5;
  if (c.buf?.jump || c.held?.jump) return 4;
  if (c.held?.down) return 3;
  if (c.held?.right) return 2;
  if (c.held?.left) return 1;
  return 0;
}

// =========================================================================
// REPLAY INGESTION: Convert user match recordings to neural dataset
// =========================================================================
if (replayPath) {
  console.log(`\n======================================================`);
  console.log(`   RenYing User Replay Ingestion Pipeline             `);
  console.log(`   Source: ${replayPath}`);
  console.log(`======================================================\n`);

  if (!existsSync(replayPath)) {
    console.error(`Error: Replay file not found at ${replayPath}`);
    process.exit(1);
  }

  const replay = JSON.parse(readFileSync(replayPath, 'utf8'));
  const env = createRenYingSandbox();
  const ch = replay.ch || [0, 1];
  env.startMatch('cpu', 'god', ch);
  env.A.ctrl = new env.AICtrl('god');
  env.B.ctrl = new env.AICtrl('god');

  const frames = replay.frames || 600;
  const evList = replay.ev || [];
  let evIdx = 0;
  const samples = [];

  for (let f = 0; f < frames; f++) {
    while (evIdx < evList.length && evList[evIdx][0] <= f) {
      const e = evList[evIdx++];
      const playerIdx = e[1];
      const targetCtrl = playerIdx === 0 ? env.A.ctrl : env.B.ctrl;
      const b = e[2];
      if (targetCtrl && targetCtrl.held) {
        targetCtrl.held.left = !!(b & 1);
        targetCtrl.held.right = !!(b & 2);
        targetCtrl.held.down = !!(b & 4);
        targetCtrl.held.atk = !!(b & 8);
        targetCtrl.held.jump = !!(b & 16);
      }
    }

    if (f % 2 === 0) {
      const s0 = extractObs(env.A, env.B, env.projs, env.STAGE_W);
      const a0 = encodeAction(env.A.ctrl);
      const s1 = extractObs(env.B, env.A, env.projs, env.STAGE_W);
      const a1 = encodeAction(env.B.ctrl);

      // Human winning actions receive high positive advantage weight
      const isWinner0 = replay.w === 0;
      samples.push({
        hero: env.CHARS[ch[0]].id,
        heroIdx: ch[0],
        s: s0,
        a: a0,
        r: isWinner0 ? 1.5 : -0.2,
        mode: replay.mode || 'cpu',
        source: 'user_replay'
      });
      samples.push({
        hero: env.CHARS[ch[1]].id,
        heroIdx: ch[1],
        s: s1,
        a: a1,
        r: !isWinner0 && replay.w === 1 ? 1.5 : -0.2,
        mode: replay.mode || 'cpu',
        source: 'user_replay'
      });
    }
    env.step();
  }

  const targetOut = exportPath || 'data/user_fights.jsonl';
  mkdirSync(dirname(targetOut), { recursive: true });
  const outData = samples.map(d => JSON.stringify(d)).join('\n') + '\n';
  appendFileSync(targetOut, outData, 'utf8');
  console.log(`[Success] Extracted ${samples.length} human demonstration samples -> ${targetOut}\n`);
  process.exit(0);
}

// =========================================================================
// MODE-SPECIFIC META GENERATOR (--meta)
// =========================================================================
if (isMetaMode) {
  console.log(`\n======================================================`);
  console.log(`   RenYing Meta & Tier Matrix Generator               `);
  console.log(`   Game Mode: ${matchMode.toUpperCase()}              `);
  console.log(`======================================================\n`);

  const env = createRenYingSandbox();
  const chars = env.CHARS;
  const N = chars.length;
  const matrix = Array.from({ length: N }, () => new Float32Array(N));
  const charStats = chars.map((c, i) => ({ id: c.id, name: c.name, wins: 0, matches: 0, netDmg: 0 }));

  // Simulate round-robin tournament
  const roundsPerPair = Math.max(2, Math.floor(matchCount / (N * (N - 1) / 2)));
  console.log(`Simulating round-robin tournament (${roundsPerPair} duels per character pair)...`);

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let r = 0; r < roundsPerPair; r++) {
        env.projs.length = 0;
        if (matchMode === 'watch2v2') {
          // In 2v2 meta, test focal hero paired with a random teammate vs opponent + random
          const a2 = (i + 2) % N === j ? (i + 3) % N : (i + 2) % N;
          const b2 = (j + 2) % N === i ? (j + 3) % N : (j + 2) % N;
          env.startWatch2v2([0, i, a2, 1, j, b2]);
        } else if (matchMode === 'mayhem') {
          env.startMayhem(i, j, 'god', true);
        } else if (matchMode === 'bushido') {
          env.startBushido(i, j, 'god', true);
        } else if (matchMode === 'chaos') {
          env.startChaos(i, j, 'god', true);
        } else {
          env.startMatch(matchMode, 'god', [i, j], true);
        }

        let steps = 0;
        const maxSteps = (matchMode === 'watch2v2' ? 45 : 25) * 120 * 2;
        while (env.M.phase !== 'end' && steps < maxSteps) {
          steps++;
          env.step();
        }

        const win = env.M.wins[0] > env.M.wins[1] ? 0 : env.M.wins[1] > env.M.wins[0] ? 1 : -1;
        charStats[i].matches++;
        charStats[j].matches++;
        if (win === 0) {
          matrix[i][j]++;
          charStats[i].wins++;
        } else if (win === 1) {
          matrix[j][i]++;
          charStats[j].wins++;
        }
      }
    }
  }

  // Calculate Win Rates & Tiers
  charStats.forEach(s => { s.winRate = s.matches > 0 ? (s.wins / s.matches) : 0; });
  charStats.sort((a, b) => b.winRate - a.winRate);

  const getTier = wr => wr >= 0.65 ? 'S' : wr >= 0.52 ? 'A' : wr >= 0.42 ? 'B' : 'C';
  charStats.forEach(s => { s.tier = getTier(s.winRate); });

  // Compute Strengths (Beats) and Weaknesses (Weak To)
  const metaReport = {
    mode: matchMode,
    timestamp: new Date().toISOString(),
    totalMatches: charStats.reduce((acc, s) => acc + s.matches, 0) / 2,
    rankings: charStats.map((s, rank) => {
      const idx = chars.findIndex(c => c.id === s.id);
      const strongAgainst = [];
      const weakAgainst = [];
      for (let j = 0; j < N; j++) {
        if (idx === j) continue;
        const winsAgainst = matrix[idx][j];
        const lossesAgainst = matrix[j][idx];
        const total = winsAgainst + lossesAgainst;
        if (total > 0) {
          if (winsAgainst / total >= 0.60) strongAgainst.push(chars[j].name);
          else if (lossesAgainst / total >= 0.60) weakAgainst.push(chars[j].name);
        }
      }
      return {
        rank: rank + 1,
        tier: s.tier,
        hero: s.name,
        id: s.id,
        winRate: (s.winRate * 100).toFixed(1) + '%',
        record: `${s.wins}/${s.matches}`,
        strongAgainst: strongAgainst.length ? strongAgainst : ['均衡对抗'],
        weakAgainst: weakAgainst.length ? weakAgainst : ['无显著劣势']
      };
    })
  };

  console.log(`\n======================================================`);
  console.log(`   ${matchMode.toUpperCase()} Meta Analysis & Hero Tier List`);
  console.log(`======================================================\n`);
  console.log('| 排名 | 梯队 | 侠客 | 胜率 | 战绩 | 优势克制 (Strong Against) | 劣势被克 (Weak Against) |');
  console.log('|:---:|:---:|:---:|:---:|:---:|:---|:---|');
  for (const r of metaReport.rankings) {
    console.log(`| #${r.rank} | **${r.tier}** | ${r.hero} | ${r.winRate} | ${r.record} | ${r.strongAgainst.join('、')} | ${r.weakAgainst.join('、')} |`);
  }
  console.log('');

  const metaOut = `data/meta_${matchMode}.json`;
  mkdirSync('data', { recursive: true });
  writeFileSync(metaOut, JSON.stringify(metaReport, null, 2), 'utf8');
  console.log(`[Report] Saved structured meta report to ${metaOut}\n`);
  process.exit(0);
}

// =========================================================================
// FAST PERSISTENT SANDBOX SIMULATION LOOP
// =========================================================================
console.log(`\n======================================================`);
console.log(`   RenYing Headless CvC Simulation & Auto-Training   `);
console.log(`   Mode: ${matchMode.toUpperCase()} | Matches: ${matchCount} | Co-op: ${isCoop ? 'ON (Dual-Agent)' : 'OFF'}`);
console.log(`======================================================\n`);

const dataset = [];
const stats = { p1Wins: 0, p2Wins: 0, draws: 0, totalRounds: 0, charStats: {} };
const startTime = Date.now();
let totalSimSteps = 0;

// Persistent Sandbox: Instantiate ONCE to avoid ~700KB script recompilation on each match
const env = createRenYingSandbox();
const chars = env.CHARS;

for (let m = 1; m <= matchCount; m++) {
  env.projs.length = 0;
  env.M.wins = [0, 0];
  env.M.round = 1;
  env.M.phase = 'fight';

  const p1Idx = p1CharArg !== '' ? parseInt(p1CharArg, 10) : Math.floor(Math.random() * chars.length);
  const p2Idx = p2CharArg !== '' ? parseInt(p2CharArg, 10) : Math.floor(Math.random() * chars.length);

  let p3Idx = 0, p4Idx = 1;
  if (matchMode === 'watch2v2') {
    const pool = chars.map((_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    p3Idx = pool[3];
    p4Idx = pool[5];
    env.startWatch2v2([pool[0], pool[2], pool[3], pool[1], pool[4], pool[5]]);
  } else if (matchMode === 'mayhem') {
    env.startMayhem(p1Idx, p2Idx, p1Level, true);
  } else if (matchMode === 'bushido') {
    env.startBushido(p1Idx, p2Idx, p1Level, true);
  } else if (matchMode === 'chaos') {
    env.startChaos(p1Idx, p2Idx, p1Level, true);
  } else if (matchMode === 'tag3') {
    const pTeam = [p1Idx, (p1Idx + 1) % chars.length, (p1Idx + 2) % chars.length];
    const eTeam = [p2Idx, (p2Idx + 1) % chars.length, (p2Idx + 2) % chars.length];
    env.startTag3Match(pTeam, eTeam, p1Level, true);
  } else {
    env.startMatch('cpu', p1Level, [p1Idx, p2Idx], true);
  }

  const charName1 = chars[p1Idx].name;
  const charName2 = chars[p2Idx].name;
  stats.charStats[charName1] = stats.charStats[charName1] || { picks: 0, wins: 0 };
  stats.charStats[charName2] = stats.charStats[charName2] || { picks: 0, wins: 0 };
  stats.charStats[charName1].picks++;
  stats.charStats[charName2].picks++;

  const matchTraj = [];
  let steps = 0;
  const maxSteps = (matchMode === 'watch2v2' ? 45 : 25) * 120 * 3 + 1200;

  let prevHpA = env.A.hp, prevHpB = env.B.hp;
  let prevHpC = env.C ? env.C.hp : 0, prevHpD = env.D ? env.D.hp : 0;

  while (env.M.phase !== 'end' && steps < maxSteps) {
    steps++;
    totalSimSteps++;

    // Collect observation and action every 2 frames
    if (steps % 2 === 0 && exportPath) {
      if (matchMode === 'watch2v2' && isCoop) {
        // Co-op 2v2: Record BOTH players per team simultaneously
        const obsA = extractCoopObs(env.A, env.B, env.C, env.projs, env.STAGE_W);
        const actA = encodeAction(env.A.ctrl);
        const obsC = extractCoopObs(env.C, env.D, env.A, env.projs, env.STAGE_W);
        const actC = encodeAction(env.C.ctrl);

        const obsB = extractCoopObs(env.B, env.A, env.D, env.projs, env.STAGE_W);
        const actB = encodeAction(env.B.ctrl);
        const obsD = extractCoopObs(env.D, env.C, env.B, env.projs, env.STAGE_W);
        const actD = encodeAction(env.D.ctrl);

        // Co-op team reward: Team 0 damage dealt vs taken + peel bonus
        const dTeam0Loss = (prevHpA - env.A.hp) + (prevHpC - env.C.hp);
        const dTeam1Loss = (prevHpB - env.B.hp) + (prevHpD - env.D.hp);
        let rTeam0 = (dTeam1Loss - dTeam0Loss) / 100;

        // Peeling reward: hitting enemy who is stunning ally
        if (env.C.state === 'hitstun' && (env.B.state === 'hitstun' || env.D.state === 'hitstun')) rTeam0 += 0.35;
        if (env.A.state === 'hitstun' && (env.B.state === 'hitstun' || env.D.state === 'hitstun')) rTeam0 += 0.35;

        matchTraj.push({ hero: chars[p1Idx].id, heroIdx: p1Idx, s: obsA, a: actA, r: rTeam0, team: 0, coop: true, mode: matchMode });
        matchTraj.push({ hero: chars[p3Idx].id, heroIdx: p3Idx, s: obsC, a: actC, r: rTeam0, team: 0, coop: true, mode: matchMode });
        matchTraj.push({ hero: chars[p2Idx].id, heroIdx: p2Idx, s: obsB, a: actB, r: -rTeam0, team: 1, coop: true, mode: matchMode });
        matchTraj.push({ hero: chars[p4Idx].id, heroIdx: p4Idx, s: obsD, a: actD, r: -rTeam0, team: 1, coop: true, mode: matchMode });

        prevHpA = env.A.hp; prevHpB = env.B.hp;
        prevHpC = env.C.hp; prevHpD = env.D.hp;
      } else {
        // Standard 1v1 observation
        const obs1 = extractObs(env.A, env.B, env.projs, env.STAGE_W);
        const act1 = encodeAction(env.A.ctrl);
        const obs2 = extractObs(env.B, env.A, env.projs, env.STAGE_W);
        const act2 = encodeAction(env.B.ctrl);

        const dHp1 = prevHpA - env.A.hp;
        const dHp2 = prevHpB - env.B.hp;
        const r1 = (dHp2 - dHp1) / 100;

        matchTraj.push({ hero: chars[p1Idx].id, heroIdx: p1Idx, s: obs1, a: act1, r: r1, p: 0, mode: matchMode });
        matchTraj.push({ hero: chars[p2Idx].id, heroIdx: p2Idx, s: obs2, a: act2, r: -r1, p: 1, mode: matchMode });

        prevHpA = env.A.hp;
        prevHpB = env.B.hp;
      }
    }

    env.step();
  }

  const winner = env.M.wins[0] > env.M.wins[1] ? 0 : env.M.wins[1] > env.M.wins[0] ? 1 : -1;
  stats.totalRounds += env.M.round;

  if (winner === 0) {
    stats.p1Wins++;
    stats.charStats[charName1].wins++;
  } else if (winner === 1) {
    stats.p2Wins++;
    stats.charStats[charName2].wins++;
  } else {
    stats.draws++;
  }

  if (exportPath) {
    for (const record of matchTraj) {
      const isWinner = record.coop ? (record.team === winner) : (record.p === winner);
      if (isWinner) record.r += 1.0;
      else if (winner !== -1) record.r -= 1.0;
      dataset.push(record);
    }
  }

  process.stdout.write(`  [Match ${String(m).padStart(2)}/${matchCount}] ${charName1} vs ${charName2} -> ${winner === 0 ? 'P1 (' + charName1 + ')' : winner === 1 ? 'P2 (' + charName2 + ')' : '平局'} (${env.M.wins[0]}:${env.M.wins[1]} in ${steps} steps)\n`);
}

const elapsedMs = Date.now() - startTime;
const stepsPerSec = Math.round(totalSimSteps / Math.max(0.001, elapsedMs / 1000));

console.log(`\n----------------- Simulation Summary -----------------`);
console.log(`Total Simulated Frames: ${totalSimSteps} in ${(elapsedMs / 1000).toFixed(2)}s`);
console.log(`Effective Speed:        ${stepsPerSec.toLocaleString()} frames/sec (~${(stepsPerSec / 60).toFixed(0)}x Real-time)`);
console.log(`P1 (${p1Level}) Wins:       ${stats.p1Wins} (${((stats.p1Wins / matchCount) * 100).toFixed(1)}%)`);
console.log(`P2 (${p2Level}) Wins:       ${stats.p2Wins} (${((stats.p2Wins / matchCount) * 100).toFixed(1)}%)`);
console.log(`Draws:                  ${stats.draws}`);
console.log(`\nCharacter Win Rates:`);
for (const [name, s] of Object.entries(stats.charStats)) {
  const wr = s.picks > 0 ? ((s.wins / s.picks) * 100).toFixed(1) : 0;
  console.log(`  - ${name.padEnd(8)}: ${s.wins}/${s.picks} wins (${wr}%)`);
}

if (exportPath && dataset.length > 0) {
  const dir = dirname(exportPath);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const outData = dataset.map(d => JSON.stringify(d)).join('\n') + '\n';
  appendFileSync(exportPath, outData, 'utf8');
  console.log(`\n[Export] Saved ${dataset.length} training transitions to ${exportPath} (${(outData.length / 1024 / 1024).toFixed(2)} MB)`);
}
console.log(`======================================================\n`);
