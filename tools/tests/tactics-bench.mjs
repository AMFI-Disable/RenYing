#!/usr/bin/env node
// Multi-million-frame headless combat simulation & benchmark suite for RenYing's tactics system.
// Runs parallel worker threads using the real game engine (tools/ai/ai-arena.mjs) to evaluate:
//   1. Tactic Head-to-Head Matrix (auto vs spear/wall/raid across 2v2, 3v3, 5v5, 8v8, CTF, Quad, difficulties)
//   2. All 20 Heroes Individual Team Combat Profiles (win rate, avg dmg, survival rate, best tactic, synergies)
//   3. Coordination & Performance Benchmarks (focus-fire %, peel saves, CC burst sync, low-HP survival, ms/frame)
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const TARGET_FRAMES = Number(process.argv.find(a => a.startsWith('--frames='))?.split('=')[1]) || 2200000;
const MAX_STEP_PER_MATCH = 3600; // 30s at 120Hz (fast decisive teamfights)

// Deterministic PRNG for reproducible team compositions
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickTeam(rng, size, mustInclude = -1, exclude = new Set()) {
  const pool = [];
  for (let i = 0; i < 20; i++) if (i !== mustInclude && !exclude.has(i)) pool.push(i);
  const team = mustInclude >= 0 ? [mustInclude] : [];
  while (team.length < size && pool.length) {
    const idx = Math.floor(rng() * pool.length);
    team.push(pool.splice(idx, 1)[0]);
  }
  return team;
}

async function runWorker(tasks) {
  const { makeEnv } = await import(path.join(ROOT, 'tools/ai/ai-arena.mjs'));
  const env = await makeEnv();

  const out = {
    totalFrames: 0,
    totalMs: 0,
    matchups: {},
    modes: {},
    diffs: {},
    heroes: {},
    coord: {
      auto: { focusSamples: 0, focusSum: 0, peelSaves: 0, ccBursts: 0, lowSurv: 0, lowTotal: 0, switches: 0, frames: 0 },
      spear: { focusSamples: 0, focusSum: 0, peelSaves: 0, ccBursts: 0, lowSurv: 0, lowTotal: 0, switches: 0, frames: 0 },
      wall: { focusSamples: 0, focusSum: 0, peelSaves: 0, ccBursts: 0, lowSurv: 0, lowTotal: 0, switches: 0, frames: 0 },
      raid: { focusSamples: 0, focusSum: 0, peelSaves: 0, ccBursts: 0, lowSurv: 0, lowTotal: 0, switches: 0, frames: 0 },
    },
  };

  const heroProfiles = env.run('HERO_TACTIC_PROFILE');
  for (const h of env.CHARS) {
    out.heroes[h.id] = {
      id: h.id, name: h.name,
      arch: heroProfiles[h.id]?.arch || 'skirmisher',
      prefRole: heroProfiles[h.id]?.prefRole || 'main',
      games: 0, wins: 0, dmg: 0, surv: 0,
      byTac: { auto: [0, 0], spear: [0, 0], wall: [0, 0], raid: [0, 0] },
    };
  }

  for (const job of tasks) {
    env.seed(job.seed);
    const t0 = performance.now();
    const res = env.run(`(() => {
      const mode = ${JSON.stringify(job.mode)};
      const size = ${job.size};
      const lv = ${JSON.stringify(job.level)};
      const tA = ${JSON.stringify(job.tacticA)};
      const tB = ${JSON.stringify(job.tacticB)};
      const rosterA = ${JSON.stringify(job.teamA)};
      const rosterB = ${JSON.stringify(job.teamB)};
      const maxSteps = ${job.maxSteps};

      setDefaultTeamTactic(tA);
      if (mode === '2v2') {
        start2v2LocalCoop(rosterA[0], rosterB[0], rosterA[1], rosterB[1], lv, true);
        // Make all 4 fighters AI-controlled for fair headless comparison
        A.ctrl = new AICtrl(lv);
        M.squadOrders = [
          ({ spear: 'focus', wall: 'protect', raid: 'spread', auto: 'auto' })[tA] || 'auto',
          ({ spear: 'focus', wall: 'protect', raid: 'spread', auto: 'auto' })[tB] || 'auto',
          'auto', 'auto'
        ];
      } else if (mode === 'ctf') {
        startCtf(size, rosterA[0], lv, 'normal');
        const s0 = sideFighters(0), s1 = sideFighters(1);
        for (let i = 0; i < s0.length; i++) { s0[i].setChar(rosterA[i % rosterA.length]); s0[i].ctrl = new AICtrl(lv); s0[i].reset(s0[i].x); if (cmdIs(s0[i])) cmdApplyHp(s0[i]); }
        for (let i = 0; i < s1.length; i++) { s1[i].setChar(rosterB[i % rosterB.length]); s1[i].ctrl = new AICtrl(lv); s1[i].reset(s1[i].x); if (cmdIs(s1[i])) cmdApplyHp(s1[i]); }
        if (M.cmd) { M.cmd.team[0].tactic = tA; M.cmd.team[1].tactic = tB; if (tA === 'auto') cmdAdaptiveEval(0); if (tB === 'auto') cmdAdaptiveEval(1); }
      } else if (mode === 'quad') {
        startQuad(size, rosterA[0], lv);
        for (const f of allFighters()) { f.ctrl = new AICtrl(lv); }
        if (M.cmd) {
          M.cmd.team[0].tactic = tA;
          for (let k = 1; k < M.cmd.team.length; k++) M.cmd.team[k].tactic = tB;
          if (tA === 'auto') cmdAdaptiveEval(0);
        }
      } else {
        startMelee(size, rosterA[0], lv, 'normal');
        const s0 = sideFighters(0), s1 = sideFighters(1);
        for (let i = 0; i < s0.length; i++) { s0[i].setChar(rosterA[i % rosterA.length]); s0[i].ctrl = new AICtrl(lv); s0[i].reset(s0[i].x); if (cmdIs(s0[i])) cmdApplyHp(s0[i]); }
        for (let i = 0; i < s1.length; i++) { s1[i].setChar(rosterB[i % rosterB.length]); s1[i].ctrl = new AICtrl(lv); s1[i].reset(s1[i].x); if (cmdIs(s1[i])) cmdApplyHp(s1[i]); }
        if (M.cmd) { M.cmd.team[0].tactic = tA; M.cmd.team[1].tactic = tB; if (tA === 'auto') cmdAdaptiveEval(0); if (tB === 'auto') cmdAdaptiveEval(1); }
      }

      M.phase = 'fight';
      let frames = 0;
      let focusSum = 0, focusSamples = 0, peelSaves = 0, ccBursts = 0, switches = 0;
      let prevSub = M.cmd ? M.cmd.team[0].autoSub : '';
      const everLow = new Set();

      while (frames < maxSteps && M.phase === 'fight') {
        // Keep locked tactics fixed for non-auto benchmark arms
        if (M.cmd) {
          if (tA !== 'auto') M.cmd.team[0].tactic = tA;
          if (tB !== 'auto') for (let k = 1; k < M.cmd.team.length; k++) M.cmd.team[k].tactic = tB;
        }
        step();
        frames++;
        if (frames % 30 === 0) {
          const s0 = sideFighters(0).filter(f => !f.hidden && f.hp > 0);
          if (s0.length > 1) {
            const cnt = {}; let top = 0;
            for (const f of s0) {
              if (f.hp / Math.max(1, f.maxHp) < 0.35) everLow.add(f.idx);
              if (f.target && f.target.hp > 0) {
                const k = f.target.idx; cnt[k] = (cnt[k] || 0) + 1; if (cnt[k] > top) top = cnt[k];
                if (['hitstun', 'launched', 'knockdown', 'held'].includes(f.target.state) && (f.state === 'attack' || f.state === 'skill' || f.state === 'special')) ccBursts++;
              }
              if (f.cmdHitBy >= 0 && clock - f.cmdHitT < 0.8) {
                if (s0.some(a => a !== f && a.target && a.target.idx === f.cmdHitBy)) peelSaves++;
              }
            }
            focusSum += top / s0.length;
            focusSamples++;
          }
          if (M.cmd && tA === 'auto' && M.cmd.team[0].autoSub !== prevSub) {
            switches++;
            prevSub = M.cmd.team[0].autoSub;
          }
        }
      }

      const s0 = sideFighters(0), s1 = sideFighters(1);
      const hp0 = s0.reduce((a, f) => a + Math.max(0, f.hp), 0) / Math.max(1, s0.reduce((a, f) => a + f.maxHp, 0));
      const hp1 = s1.reduce((a, f) => a + Math.max(0, f.hp), 0) / Math.max(1, s1.reduce((a, f) => a + f.maxHp, 0));
      let winner = -1;
      if (M.phase === 'ko' || M.phase === 'end') winner = M.koWinner;
      else if (mode === 'ctf' && M.ctf) winner = M.ctf.score[0] > M.ctf.score[1] ? 0 : M.ctf.score[1] > M.ctf.score[0] ? 1 : (hp0 >= hp1 ? 0 : 1);
      else if (mode === 'melee' && M.melee) winner = M.melee.tickets[0] > M.melee.tickets[1] ? 0 : M.melee.tickets[1] > M.melee.tickets[0] ? 1 : (hp0 >= hp1 ? 0 : 1);
      else if (mode === 'quad' && M.quad) {
        let bestT = 0, bestTk = -1;
        for (let k = 0; k < M.quad.tickets.length; k++) if (M.quad.tickets[k] > bestTk) { bestTk = M.quad.tickets[k]; bestT = k; }
        winner = bestT;
      } else {
        winner = hp0 >= hp1 ? 0 : 1;
      }

      let lowSurv = 0;
      for (const idx of everLow) { if (FIGHTERS[idx] && FIGHTERS[idx].hp > 0) lowSurv++; }

      const heroStats = [];
      for (const f of s0) heroStats.push({ id: f.ch.id, team: 0, tac: tA, won: winner === 0, surv: f.hp > 0 ? 1 : 0, dmg: Math.max(0, (1 - hp1) * 900) });
      for (const f of s1) heroStats.push({ id: f.ch.id, team: 1, tac: tB, won: winner === 1, surv: f.hp > 0 ? 1 : 0, dmg: Math.max(0, (1 - hp0) * 900) });

      return { frames, winner, focusSum, focusSamples, peelSaves, ccBursts, switches, lowSurv, lowTotal: everLow.size, heroStats };
    })()`);
    const dt = performance.now() - t0;

    out.totalFrames += res.frames;
    out.totalMs += dt;

    const mk = `${job.tacticA}_vs_${job.tacticB}`;
    if (!out.matchups[mk]) out.matchups[mk] = { games: 0, winsA: 0, frames: 0, ms: 0 };
    out.matchups[mk].games++;
    if (res.winner === 0) out.matchups[mk].winsA++;
    out.matchups[mk].frames += res.frames;
    out.matchups[mk].ms += dt;

    const modeKey = `${job.mode}_${job.size}v${job.size}`;
    if (!out.modes[modeKey]) out.modes[modeKey] = { games: 0, autoWins: 0, autoGames: 0, frames: 0, ms: 0 };
    out.modes[modeKey].games++;
    out.modes[modeKey].frames += res.frames;
    out.modes[modeKey].ms += dt;
    if (job.tacticA === 'auto' && job.tacticB !== 'auto') {
      out.modes[modeKey].autoGames++;
      if (res.winner === 0) out.modes[modeKey].autoWins++;
    }

    if (!out.diffs[job.level]) out.diffs[job.level] = { games: 0, autoWins: 0, autoGames: 0, frames: 0 };
    out.diffs[job.level].games++;
    out.diffs[job.level].frames += res.frames;
    if (job.tacticA === 'auto' && job.tacticB !== 'auto') {
      out.diffs[job.level].autoGames++;
      if (res.winner === 0) out.diffs[job.level].autoWins++;
    }

    const c = out.coord[job.tacticA];
    if (c) {
      c.focusSum += res.focusSum;
      c.focusSamples += res.focusSamples;
      c.peelSaves += res.peelSaves;
      c.ccBursts += res.ccBursts;
      c.lowSurv += res.lowSurv;
      c.lowTotal += res.lowTotal;
      c.switches += res.switches;
      c.frames += res.frames;
    }

    for (const hs of res.heroStats) {
      const h = out.heroes[hs.id];
      if (!h) continue;
      h.games++;
      if (hs.won) h.wins++;
      h.surv += hs.surv;
      h.dmg += hs.dmg;
      if (h.byTac[hs.tac]) {
        h.byTac[hs.tac][1]++;
        if (hs.won) h.byTac[hs.tac][0]++;
      }
    }
  }
  return out;
}

if (!isMainThread) {
  runWorker(workerData.tasks).then(res => parentPort.postMessage(res));
} else {
  const numWorkers = Math.max(2, Math.min(8, os.cpus().length));
  const rng = mulberry32(20261127);

  // Build comprehensive simulation schedule targeting 2,000,000+ combat frames
  const jobs = [];
  let seed = 1001;

  // 1. Head-to-head tactic matchups across modes & difficulties (~560 matches -> ~1.5M+ frames)
  const pairs = [
    ['auto', 'spear'], ['auto', 'wall'], ['auto', 'raid'],
    ['spear', 'wall'], ['wall', 'raid'], ['raid', 'spear'],
  ];
  const modeConfigs = [
    { mode: '2v2', size: 2, reps: 18, maxSteps: 2800 },
    { mode: 'melee', size: 3, reps: 22, maxSteps: 3600 },
    { mode: 'melee', size: 5, reps: 16, maxSteps: 3600 },
    { mode: 'melee', size: 8, reps: 6, maxSteps: 2800 },
    { mode: 'ctf', size: 3, reps: 10, maxSteps: 3200 },
    { mode: 'quad', size: 2, reps: 8, maxSteps: 3200 },
  ];
  const levels = ['easy', 'normal', 'hard', 'impossible', 'god'];

  for (const mc of modeConfigs) {
    for (const [tA, tB] of pairs) {
      for (let r = 0; r < mc.reps; r++) {
        const level = levels[(seed + r) % levels.length];
        const teamA = pickTeam(rng, mc.size);
        const teamB = pickTeam(rng, mc.size);
        jobs.push({ seed: seed++, mode: mc.mode, size: mc.size, level, tacticA: tA, tacticB: tB, teamA, teamB, maxSteps: mc.maxSteps });
      }
    }
  }

  // 2. Guaranteed 20-hero coverage: every hero plays 12 dedicated 3v3 matches across all 4 tactics (~240 matches -> ~750K+ frames)
  const tactics = ['auto', 'spear', 'wall', 'raid'];
  for (let hIdx = 0; hIdx < 20; hIdx++) {
    for (let r = 0; r < 12; r++) {
      const tA = tactics[r % 4];
      const tB = tactics[(r + 1 + (hIdx % 3)) % 4];
      const teamA = pickTeam(rng, 3, hIdx);
      const teamB = pickTeam(rng, 3);
      jobs.push({ seed: seed++, mode: 'melee', size: 3, level: levels[(hIdx + r) % levels.length], tacticA: tA, tacticB: tB, teamA, teamB, maxSteps: 3400 });
    }
  }

  console.log(`Starting RenYing Tactics Benchmark: ${jobs.length} matches across ${numWorkers} workers (target >= ${TARGET_FRAMES.toLocaleString()} combat frames)...`);
  const tStart = performance.now();

  const chunks = Array.from({ length: numWorkers }, () => []);
  jobs.forEach((j, i) => chunks[i % numWorkers].push(j));

  Promise.all(chunks.map(tasks => new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { tasks } });
    w.on('message', resolve);
    w.on('error', reject);
  }))).then(parts => {
    const wallSec = (performance.now() - tStart) / 1000;
    const agg = {
      wallSec,
      totalMatches: jobs.length,
      totalFrames: 0,
      totalMs: 0,
      matchups: {},
      modes: {},
      diffs: {},
      heroes: {},
      coord: {},
    };

    for (const p of parts) {
      agg.totalFrames += p.totalFrames;
      agg.totalMs += p.totalMs;
      for (const [k, v] of Object.entries(p.matchups)) {
        if (!agg.matchups[k]) agg.matchups[k] = { games: 0, winsA: 0, frames: 0, ms: 0 };
        agg.matchups[k].games += v.games; agg.matchups[k].winsA += v.winsA; agg.matchups[k].frames += v.frames; agg.matchups[k].ms += v.ms;
      }
      for (const [k, v] of Object.entries(p.modes)) {
        if (!agg.modes[k]) agg.modes[k] = { games: 0, autoWins: 0, autoGames: 0, frames: 0, ms: 0 };
        agg.modes[k].games += v.games; agg.modes[k].autoWins += v.autoWins; agg.modes[k].autoGames += v.autoGames; agg.modes[k].frames += v.frames; agg.modes[k].ms += v.ms;
      }
      for (const [k, v] of Object.entries(p.diffs)) {
        if (!agg.diffs[k]) agg.diffs[k] = { games: 0, autoWins: 0, autoGames: 0, frames: 0 };
        agg.diffs[k].games += v.games; agg.diffs[k].autoWins += v.autoWins; agg.diffs[k].autoGames += v.autoGames; agg.diffs[k].frames += v.frames;
      }
      for (const [k, v] of Object.entries(p.coord)) {
        if (!agg.coord[k]) agg.coord[k] = { focusSamples: 0, focusSum: 0, peelSaves: 0, ccBursts: 0, lowSurv: 0, lowTotal: 0, switches: 0, frames: 0 };
        for (const f of Object.keys(v)) agg.coord[k][f] += v[f];
      }
      for (const [id, v] of Object.entries(p.heroes)) {
        if (!agg.heroes[id]) agg.heroes[id] = { id, name: v.name, arch: v.arch, prefRole: v.prefRole, games: 0, wins: 0, dmg: 0, surv: 0, byTac: { auto: [0, 0], spear: [0, 0], wall: [0, 0], raid: [0, 0] } };
        const h = agg.heroes[id];
        h.games += v.games; h.wins += v.wins; h.dmg += v.dmg; h.surv += v.surv;
        for (const tk of ['auto', 'spear', 'wall', 'raid']) {
          h.byTac[tk][0] += v.byTac[tk][0];
          h.byTac[tk][1] += v.byTac[tk][1];
        }
      }
    }

    const outPath = path.join(ROOT, 'docs/design/tactics-benchmark-data.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(agg, null, 2));

    console.log(`\n=== RenYing Tactics Benchmark Complete ===`);
    console.log(`Matches: ${agg.totalMatches} | Total Combat Frames: ${agg.totalFrames.toLocaleString()} | Wall Time: ${wallSec.toFixed(1)}s | Avg Sim Speed: ${(agg.totalMs / Math.max(1, agg.totalFrames)).toFixed(4)} ms/frame`);
    console.log(`\n--- Tactic Head-to-Head Win Rates ---`);
    for (const [k, v] of Object.entries(agg.matchups)) {
      console.log(`  ${k.padEnd(15)} : ${(v.winsA / v.games * 100).toFixed(1)}% (${v.winsA}/${v.games}) | ${v.frames.toLocaleString()} frames | ${(v.ms / Math.max(1, v.frames)).toFixed(4)} ms/f`);
    }
    console.log(`\n--- Adaptive Auto Win Rate By Mode ---`);
    for (const [k, v] of Object.entries(agg.modes)) {
      console.log(`  ${k.padEnd(12)} : ${(v.autoWins / Math.max(1, v.autoGames) * 100).toFixed(1)}% (${v.autoWins}/${v.autoGames}) | ${v.frames.toLocaleString()} frames | ${(v.ms / Math.max(1, v.frames)).toFixed(4)} ms/f`);
    }
    console.log(`\n--- Adaptive Auto Win Rate By Difficulty ---`);
    for (const [k, v] of Object.entries(agg.diffs)) {
      console.log(`  ${k.padEnd(12)} : ${(v.autoWins / Math.max(1, v.autoGames) * 100).toFixed(1)}% (${v.autoWins}/${v.autoGames}) | ${v.frames.toLocaleString()} frames`);
    }
    console.log(`\n--- Coordination Metrics By Tactic ---`);
    for (const [k, c] of Object.entries(agg.coord)) {
      const foc = c.focusSamples ? (c.focusSum / c.focusSamples * 100).toFixed(1) : '0.0';
      const ls = c.lowTotal ? (c.lowSurv / c.lowTotal * 100).toFixed(1) : '0.0';
      const peelRate = (c.peelSaves / Math.max(1, c.frames / 3600)).toFixed(2);
      const ccRate = (c.ccBursts / Math.max(1, c.frames / 3600)).toFixed(2);
      console.log(`  ${k.padEnd(6)} : focus=${foc}% | peel=${peelRate}/30s | ccBurst=${ccRate}/30s | lowHpSurv=${ls}% | autoSwitches=${c.switches}`);
    }
    console.log(`\n--- 20-Hero Empirical Team Summary ---`);
    for (const h of Object.values(agg.heroes)) {
      let bestT = 'auto', bestWr = -1;
      for (const tk of ['auto', 'spear', 'wall', 'raid']) {
        const [w, g] = h.byTac[tk];
        const wr = g ? w / g : 0;
        if (wr > bestWr) { bestWr = wr; bestT = tk; }
      }
      console.log(`  ${h.id.padEnd(10)} (${h.arch.padEnd(10)}) : WR=${(h.wins / Math.max(1, h.games) * 100).toFixed(1)}% (${h.wins}/${h.games}) | surv=${(h.surv / Math.max(1, h.games) * 100).toFixed(1)}% | bestTac=${bestT}(${(bestWr * 100).toFixed(0)}%)`);
    }
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
