#!/usr/bin/env node
/**
 * Headless CvC (Computer vs Computer) Fast Simulation & Dataset Generator for RenYing.
 *
 * Runs headless simulations at ~25,000 steps/sec (400x real-time speed) without opening any browser.
 * Extracts (State, Action, Reward, NextState) trajectories for training neural models.
 *
 * Usage:
 *   node tools/cvc-sim.mjs --matches 10 --level hard --export data/cvc_dataset.jsonl
 *   node tools/cvc-sim.mjs --matches 50 --summary
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import vm from 'node:vm';

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}
const matchCount = parseInt(getArg('matches', '10'), 10);
const matchMode = getArg('mode', 'cpu');
const MODE_MAX_LEVEL = { cpu: 'god', bushido: 'god', chaos: 'god', tag3: 'god', tower: 'impossible' };
const defaultLevel = args.includes('--mode') ? (MODE_MAX_LEVEL[matchMode] || 'god') : 'hard';
const p1Level = getArg('p1-level', getArg('level', defaultLevel));
const p2Level = getArg('p2-level', getArg('level', defaultLevel));
const exportPath = getArg('export', '');
const p1CharArg = getArg('p1', '');
const p2CharArg = getArg('p2', '');

// Precompile scripts once globally to avoid reparsing ~700KB on every match
const netCode = readFileSync('src/net-p2p.js', 'utf8');
const gameCode = readFileSync('src/game.js', 'utf8');
const NET_SCRIPT = new vm.Script(netCode);
const GAME_SCRIPT = new vm.Script(gameCode);
const EXPOSE_SCRIPT = new vm.Script(`({
  CHARS, A, B, M, projs, STAGE_W, AICtrl,
  startMatch: (...args) => startMatch(...args),
  step: () => step()
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

  // Expose consts and functions declared at script top-level
  return EXPOSE_SCRIPT.runInContext(sandbox.window);
}

// Extract normalized numerical feature vector from game state for fighter `f` vs `foe`
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

// Encode controller inputs to discrete action ID
function encodeAction(c) {
  // Actions: 0:idle, 1:left, 2:right, 3:down/block, 4:jump, 5:atk/light, 6:skill1, 7:skill2, 8:dash, 9:special
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

console.log(`\n======================================================`);
console.log(`   RenYing Headless CvC Simulation & Auto-Training   `);
console.log(`   Matches: ${matchCount} | P1 Level: ${p1Level} | P2 Level: ${p2Level}`);
console.log(`======================================================\n`);

const dataset = [];
const stats = {
  p1Wins: 0,
  p2Wins: 0,
  draws: 0,
  totalRounds: 0,
  charStats: {}
};

const startTime = Date.now();
let totalSimSteps = 0;

for (let m = 1; m <= matchCount; m++) {
  const env = createRenYingSandbox();
  const chars = env.CHARS;
  const p1Idx = p1CharArg !== '' ? parseInt(p1CharArg, 10) : Math.floor(Math.random() * chars.length);
  const p2Idx = p2CharArg !== '' ? parseInt(p2CharArg, 10) : Math.floor(Math.random() * chars.length);

  env.startMatch(matchMode, p1Level, [p1Idx, p2Idx]);
  env.M.mode = matchMode;
  if (matchMode === 'bushido') {
    env.A.maxHp = env.A.hp = env.A.lagHp = 1;
    env.B.maxHp = env.B.hp = env.B.lagHp = 1;
  } else if (matchMode === 'chaos') {
    env.currentChaosMutation = null;
    env.chaosTimer = 0;
  }
  env.A.ctrl = new env.AICtrl(p1Level);
  env.B.ctrl = new env.AICtrl(p2Level);

  const charName1 = chars[p1Idx].name;
  const charName2 = chars[p2Idx].name;
  stats.charStats[charName1] = stats.charStats[charName1] || { picks: 0, wins: 0, dmgDealt: 0 };
  stats.charStats[charName2] = stats.charStats[charName2] || { picks: 0, wins: 0, dmgDealt: 0 };
  stats.charStats[charName1].picks++;
  stats.charStats[charName2].picks++;

  const matchTraj = [];
  let steps = 0;
  const maxSteps = 25 * 60 * 3 + 600; // max 3 rounds @ 60fps

  let prevHp1 = env.A.hp;
  let prevHp2 = env.B.hp;

  while (env.M.phase !== 'end' && steps < maxSteps) {
    steps++;
    totalSimSteps++;

    // Collect observation and action every 2 frames (30Hz decision rate)
    if (steps % 2 === 0 && exportPath) {
      const obs1 = extractObs(env.A, env.B, env.projs, env.STAGE_W);
      const act1 = encodeAction(env.A.ctrl);
      const obs2 = extractObs(env.B, env.A, env.projs, env.STAGE_W);
      const act2 = encodeAction(env.B.ctrl);

      const dHp1 = prevHp1 - env.A.hp;
      const dHp2 = prevHp2 - env.B.hp;
      const r1 = (dHp2 - dHp1) / 100;

      matchTraj.push({
        hero: chars[p1Idx].id,
        heroIdx: p1Idx,
        s: obs1,
        a: act1,
        r: r1,
        p: 0
      });
      matchTraj.push({
        hero: chars[p2Idx].id,
        heroIdx: p2Idx,
        s: obs2,
        a: act2,
        r: -r1,
        p: 1
      });

      prevHp1 = env.A.hp;
      prevHp2 = env.B.hp;
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

  // Label final outcome reward
  if (exportPath) {
    for (const record of matchTraj) {
      if (record.p === winner) record.r += 1.0;
      else if (winner !== -1) record.r -= 1.0;
      dataset.push(record);
    }
  }

  process.stdout.write(`  [Match ${String(m).padStart(2)}/${matchCount}] ${charName1} vs ${charName2} -> ${winner === 0 ? 'P1 (' + charName1 + ')' : winner === 1 ? 'P2 (' + charName2 + ')' : '平局'} (Score: ${env.M.wins[0]}:${env.M.wins[1]} in ${steps} steps)\n`);
}

const elapsedMs = Date.now() - startTime;
const stepsPerSec = Math.round(totalSimSteps / (elapsedMs / 1000));

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
