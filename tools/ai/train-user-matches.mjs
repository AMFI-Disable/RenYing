#!/usr/bin/env node
// Audit exported anonymous match samples and train a held-out, offline action model.
// Dataset files must stay outside the repository; this tool prints aggregate metrics only.
import { readFileSync, writeFileSync } from 'node:fs';

const HEROES = ['qingfeng', 'feiying', 'tieshan', 'lingshuang', 'liuyun', 'leiming', 'moyu', 'yuehua', 'yanling', 'yuxiao', 'zuixian', 'gouchen', 'lingque', 'liying', 'cixian', 'qianji'];
const MODES = new Set(['cpu', 'net', '2v2', 'pvp', 'maps', 'tag3', 'chaos', 'mayhem', 'tower', 'saga', 'raid', 'stage', 'boss', 'world', 'qfx']);
const DIM = 19, ACTIONS = 13, BITS = 2 ** ACTIONS - 1;
const args = process.argv.slice(2), arg = (key) => { const i = args.indexOf('--' + key); return i < 0 ? '' : args[i + 1] || ''; };
const input = arg('input'), output = arg('output'), train = args.includes('--train');
if (!input || (train && !output)) {
  console.error('Usage: node tools/ai/train-user-matches.mjs --input /private/path/matches.jsonl [--train --output /private/path/candidate.json]');
  process.exit(2);
}

function readEpisodes(path) {
  const stats = { lines: 0, invalid: 0, unterminated: 0, accepted: 0 };
  const episodes = []; let rows = [], discarding = false;
  const flush = (terminal) => {
    if (!rows.length) return;
    if (terminal && rows.length <= 480 && rows.every(r => r.hero === rows[0].hero && r.mode === rows[0].mode && r.result === rows[0].result)) {
      episodes.push(rows); stats.accepted++;
    } else { stats.invalid++; if (!terminal) stats.unterminated++; }
    rows = [];
  };
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    stats.lines++;
    let r;
    try { r = JSON.parse(line); } catch { stats.invalid++; flush(false); discarding = true; continue; }
    const valid = r && HEROES.includes(r.hero) && Array.isArray(r.s) && r.s.length === DIM && r.s.every(v => Number.isFinite(v) && v >= -1 && v <= 1.2)
      && Number.isInteger(r.a) && r.a >= 0 && r.a <= BITS && Number.isFinite(r.r) && r.r >= -30 && r.r <= 30
      && (r.done === 0 || r.done === 1) && MODES.has(r.mode) && [-1, 0, 1].includes(r.result) && Number.isInteger(r.receivedDay);
    if (discarding) { if (r && r.done === 1) discarding = false; continue; }
    if (!valid) { stats.invalid++; flush(false); discarding = !(r && r.done === 1); continue; }
    rows.push({ hero: r.hero, s: r.s, a: r.a, mode: r.mode, result: r.result });
    if (r.done === 1) flush(true);
  }
  flush(false);
  return { episodes, stats };
}

function stableSplit(episodes) {
  // Every fifth bout, selected by a stable ordinal, is held out as a complete unit.
  return episodes.map((rows, i) => ({ rows, holdout: i % 5 === 0 }));
}
const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, x))));
function fit(rows) {
  const w = Array.from({ length: ACTIONS }, () => Array(DIM + 1).fill(0));
  const rate = 0.025, l2 = 0.0008, epochs = 45;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const order = epoch % 2 ? [...rows].reverse() : rows;
    for (const row of order) {
      for (let bit = 0; bit < ACTIONS; bit++) {
        const v = w[bit], p = sigmoid(v[DIM] + row.s.reduce((sum, x, i) => sum + x * v[i], 0));
        const error = ((row.a >> bit) & 1) - p;
        for (let i = 0; i < DIM; i++) v[i] += rate * (error * row.s[i] - l2 * v[i]);
        v[DIM] += rate * error;
      }
    }
  }
  return w;
}
function metrics(rows, weights) {
  if (!rows.length) return { samples: 0, logLoss: null, bitAccuracy: null, baselineLogLoss: null, baselineBitAccuracy: null };
  const positives = Array(ACTIONS).fill(0);
  for (const r of rows) for (let b = 0; b < ACTIONS; b++) positives[b] += (r.a >> b) & 1;
  const priors = positives.map(n => Math.max(0.005, Math.min(0.995, n / rows.length)));
  let loss = 0, correct = 0, baseLoss = 0, baseCorrect = 0;
  for (const r of rows) for (let b = 0; b < ACTIONS; b++) {
    const y = (r.a >> b) & 1, v = weights[b], p = sigmoid(v[DIM] + r.s.reduce((sum, x, i) => sum + x * v[i], 0)), bp = priors[b];
    loss -= y * Math.log(Math.max(1e-9, p)) + (1 - y) * Math.log(Math.max(1e-9, 1 - p));
    baseLoss -= y * Math.log(bp) + (1 - y) * Math.log(1 - bp);
    correct += (p >= 0.5) === !!y ? 1 : 0; baseCorrect += (bp >= 0.5) === !!y ? 1 : 0;
  }
  const count = rows.length * ACTIONS;
  return { samples: rows.length, logLoss: +(loss / count).toFixed(5), bitAccuracy: +(correct / count).toFixed(4), baselineLogLoss: +(baseLoss / count).toFixed(5), baselineBitAccuracy: +(baseCorrect / count).toFixed(4) };
}

const { episodes, stats } = readEpisodes(input);
const split = stableSplit(episodes), coverage = { modes: {}, results: { win: 0, loss: 0, draw: 0 } };
for (const ep of episodes) {
  const { mode, result } = ep[0]; coverage.modes[mode] = (coverage.modes[mode] || 0) + 1;
  coverage.results[result === 0 ? 'win' : result === 1 ? 'loss' : 'draw']++;
}
const report = { samples: episodes.reduce((n, ep) => n + ep.length, 0), bouts: episodes.length, invalidLinesOrBouts: stats.invalid, unterminatedBouts: stats.unterminated, coverage, split: { trainBouts: split.filter(e => !e.holdout).length, holdoutBouts: split.filter(e => e.holdout).length }, heroes: {}, readiness: 'collect more real matches' };
const candidate = { format: 'renying-user-action-model-v1', source: 'offline-anonymous-match-export', stateDimensions: DIM, actionBits: ACTIONS, heroes: {} };
let eligible = 0;
for (const hero of HEROES) {
  const heroEpisodes = split.filter(e => e.rows[0].hero === hero);
  const trainRows = heroEpisodes.filter(e => !e.holdout).flatMap(e => e.rows), heldRows = heroEpisodes.filter(e => e.holdout).flatMap(e => e.rows);
  const model = trainRows.length ? fit(trainRows) : Array.from({ length: ACTIONS }, () => Array(DIM + 1).fill(0));
  const result = metrics(heldRows, model);
  const trainBouts = heroEpisodes.filter(e => !e.holdout).length, holdoutBouts = heroEpisodes.filter(e => e.holdout).length;
  const improvement = result.logLoss === null ? null : (result.baselineLogLoss - result.logLoss) / result.baselineLogLoss;
  const ready = trainBouts >= 20 && holdoutBouts >= 5 && trainRows.length >= 500 && result.logLoss !== null && improvement >= 0.02 && result.bitAccuracy >= result.baselineBitAccuracy;
  report.heroes[hero] = { trainBouts, holdoutBouts, trainSamples: trainRows.length, heldout: result, heldoutLogLossImprovement: improvement === null ? null : +improvement.toFixed(4), eligibleForCandidate: ready };
  if (ready) { eligible++; candidate.heroes[hero] = { weights: model.map(row => row.map(v => +v.toFixed(6))), heldoutLogLoss: result.logLoss, baselineLogLoss: result.baselineLogLoss, holdoutBouts }; }
}
report.readiness = eligible ? `candidate ready for ${eligible} hero${eligible === 1 ? '' : 'es'}; manual game-play review still required` : 'collect more real matches or improve held-out results';
console.log(JSON.stringify(report, null, 2));
if (train) {
  if (!eligible) { console.error('No hero passed minimum data and held-out improvement gates; no candidate was written.'); process.exitCode = 3; }
  else { candidate.minimumGate = { trainBoutsPerHero: 20, holdoutBoutsPerHero: 5, trainSamplesPerHero: 500, relativeLogLossImprovement: 0.02, bitAccuracyMustNotRegress: true }; writeFileSync(output, JSON.stringify(candidate, null, 2) + '\n', { mode: 0o600 }); console.error(`Candidate written outside the repository path supplied by --output (${eligible} heroes). It is not installed as the live AI model.`); }
}
