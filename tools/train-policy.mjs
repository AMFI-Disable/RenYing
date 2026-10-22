#!/usr/bin/env node
/**
 * Train a lightweight Neural Network policy on RenYing Trajectories & User Fights.
 *
 * Capabilities & Optimizations:
 *   - Custom Game Mode Policy Training (--mode <cpu|watch2v2|chaos|mayhem|tag3>).
 *   - 2v2 Co-op Dual-Agent Training (--coop): trains 31-dim state policy with ally awareness.
 *   - User Fight Learning (--user-data data/user_fights.jsonl): distills human combat tricks.
 *   - High-throughput buffer reuse, vectorized batch Adam optimizer, Cosine Annealing LR.
 *   - Compact 4-decimal quantized weights (< 25 KB JSON format).
 *
 * Usage:
 *   node tools/train-policy.mjs --data data/cvc_dataset.jsonl --epochs 10 --out models/renying_ai_v1.json
 *   node tools/train-policy.mjs --data data/coop_2v2.jsonl --coop --mode watch2v2 --out models/renying_ai_coop_2v2.json
 *   node tools/train-policy.mjs --data data/cvc_dataset.jsonl --user-data data/user_fights.jsonl --epochs 8
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import readline from 'node:readline';
import { createReadStream } from 'node:fs';

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}
function hasFlag(name) {
  return args.includes('--' + name);
}

const dataPath = getArg('data', 'data/cvc_dataset.jsonl');
const userDataPath = getArg('user-data', 'data/user_fights.jsonl');
const epochs = parseInt(getArg('epochs', '8'), 10);
const outPath = getArg('out', 'models/renying_ai_v1.json');
const baseLr = parseFloat(getArg('lr', '0.0035'));
const targetHero = getArg('hero', '');
const targetMode = getArg('mode', '');
const isCoop = hasFlag('coop') || targetMode === 'watch2v2' && hasFlag('coop');

const IN_DIM = isCoop ? 31 : 25;
const H1_DIM = 64;
const H2_DIM = 32;
const OUT_DIM = 10;

// 1. Load Datasets (Synthetic CvC + User Fight Demonstrations)
const samples = [];

async function loadDatasetFile(path, isUserFight = false) {
  if (!existsSync(path)) return 0;
  const fileStream = createReadStream(path);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let count = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (targetHero && d.hero && d.hero !== targetHero) continue;
      if (targetMode && d.mode && d.mode !== targetMode) continue;
      if (isCoop && !d.coop && d.s.length < 31) continue;

      const sArr = new Float32Array(IN_DIM);
      const srcS = d.s || [];
      for (let i = 0; i < Math.min(IN_DIM, srcS.length); i++) sArr[i] = srcS[i];

      // Human winning actions in user fights get higher positive advantage weight (+1.5x)
      const baseR = +d.r || 0;
      const weightBonus = isUserFight ? 1.5 : (d.coop ? 1.2 : 1.0);

      samples.push({
        s: sArr,
        a: d.a | 0,
        r: baseR * weightBonus,
        isUser: isUserFight
      });
      count++;
    } catch (e) {}
  }
  return count;
}

const cvcCount = await loadDatasetFile(dataPath, false);
const userCount = await loadDatasetFile(userDataPath, true);

if (samples.length === 0) {
  console.error(`No training samples found in ${dataPath} or ${userDataPath}.`);
  console.error(`Generate samples via: node tools/cvc-sim.mjs --matches 10 --export ${dataPath}`);
  process.exit(1);
}

console.log(`[Dataset] Loaded ${samples.length} total samples (CvC: ${cvcCount}, Human Fights: ${userCount})`);
if (targetMode) console.log(`[Filter] Training policy specifically for Game Mode: [ ${targetMode.toUpperCase()} ]`);
if (isCoop) console.log(`[Architecture] Co-op 2v2 Mode Enabled (Input Dim: ${IN_DIM} with ally spatial features)`);

function randMatrix(rows, cols, scale = 0.1) {
  const m = [];
  for (let i = 0; i < rows; i++) {
    const row = new Float32Array(cols);
    for (let j = 0; j < cols; j++) row[j] = (Math.random() * 2 - 1) * Math.sqrt(2 / rows) * scale;
    m.push(row);
  }
  return m;
}

let W1 = randMatrix(IN_DIM, H1_DIM, 1.0);
let b1 = new Float32Array(H1_DIM);
let W2 = randMatrix(H1_DIM, H2_DIM, 1.0);
let b2 = new Float32Array(H2_DIM);
let W3 = randMatrix(H2_DIM, OUT_DIM, 1.0);
let b3 = new Float32Array(OUT_DIM);

// Warm-start if compatible weights exist
if (existsSync(outPath)) {
  try {
    const existing = JSON.parse(readFileSync(outPath, 'utf8'));
    if (existing.weights && existing.arch && existing.arch.in === IN_DIM && existing.arch.out === OUT_DIM) {
      W1 = existing.weights.W1.map(row => new Float32Array(row));
      b1 = new Float32Array(existing.weights.b1);
      W2 = existing.weights.W2.map(row => new Float32Array(row));
      b2 = new Float32Array(existing.weights.b2);
      W3 = existing.weights.W3.map(row => new Float32Array(row));
      b3 = new Float32Array(existing.weights.b3);
      console.log(`[Warm-Start] Loaded existing model weights from ${outPath}`);
    }
  } catch (e) {}
}

// Adam optimizer state
const mW1 = randMatrix(IN_DIM, H1_DIM, 0), vW1 = randMatrix(IN_DIM, H1_DIM, 0);
const mb1 = new Float32Array(H1_DIM), vb1 = new Float32Array(H1_DIM);
const mW2 = randMatrix(H1_DIM, H2_DIM, 0), vW2 = randMatrix(H1_DIM, H2_DIM, 0);
const mb2 = new Float32Array(H2_DIM), vb2 = new Float32Array(H2_DIM);
const mW3 = randMatrix(H2_DIM, OUT_DIM, 0), vW3 = randMatrix(H2_DIM, OUT_DIM, 0);
const mb3 = new Float32Array(OUT_DIM), vb3 = new Float32Array(OUT_DIM);

// Pre-allocated gradient and activation buffers
const gW1 = randMatrix(IN_DIM, H1_DIM, 0);
const gb1 = new Float32Array(H1_DIM);
const gW2 = randMatrix(H1_DIM, H2_DIM, 0);
const gb2 = new Float32Array(H2_DIM);
const gW3 = randMatrix(H2_DIM, OUT_DIM, 0);
const gb3 = new Float32Array(OUT_DIM);

const h1 = new Float32Array(H1_DIM);
const h2 = new Float32Array(H2_DIM);
const logits = new Float32Array(OUT_DIM);
const probs = new Float32Array(OUT_DIM);
const dLogits = new Float32Array(OUT_DIM);
const dh2 = new Float32Array(H2_DIM);
const dh1 = new Float32Array(H1_DIM);

let tStep = 0;
function adamStep(W, gW, mW, vW, rows, cols, invN, lr, b1c, b2c) {
  for (let i = 0; i < rows; i++) {
    const wi = W[i], gi = gW[i], mi = mW[i], vi = vW[i];
    for (let j = 0; j < cols; j++) {
      const grad = gi[j] * invN;
      const m = 0.9 * mi[j] + 0.1 * grad;
      const v = 0.999 * vi[j] + 0.001 * grad * grad;
      mi[j] = m; vi[j] = v;
      wi[j] -= lr * (m * b1c) / (Math.sqrt(v * b2c) + 1e-8);
    }
  }
}

function adamVec(b, gb, mb, vb, len, invN, lr, b1c, b2c) {
  for (let j = 0; j < len; j++) {
    const grad = gb[j] * invN;
    const m = 0.9 * mb[j] + 0.1 * grad;
    const v = 0.999 * vb[j] + 0.001 * grad * grad;
    mb[j] = m; vb[j] = v;
    b[j] -= lr * (m * b1c) / (Math.sqrt(v * b2c) + 1e-8);
  }
}

const BATCH_SIZE = 64;
const indices = new Int32Array(samples.length);
for (let i = 0; i < samples.length; i++) indices[i] = i;

const startTime = Date.now();

for (let ep = 1; ep <= epochs; ep++) {
  const lr = baseLr * (0.15 + 0.85 * 0.5 * (1 + Math.cos(Math.PI * (ep - 1) / Math.max(1, epochs))));

  for (let i = indices.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
  }

  let totalLoss = 0;
  let correct = 0;

  for (let b = 0; b < indices.length; b += BATCH_SIZE) {
    tStep++;
    const end = Math.min(b + BATCH_SIZE, indices.length);
    for (let i = 0; i < IN_DIM; i++) gW1[i].fill(0);
    gb1.fill(0);
    for (let i = 0; i < H1_DIM; i++) gW2[i].fill(0);
    gb2.fill(0);
    for (let i = 0; i < H2_DIM; i++) gW3[i].fill(0);
    gb3.fill(0);

    let effectiveBatchWeight = 0;

    for (let idx = b; idx < end; idx++) {
      const item = samples[indices[idx]];
      const x = item.s;
      const targetA = Math.max(0, Math.min(OUT_DIM - 1, item.a));
      const weight = Math.max(0.15, Math.min(4.5, Math.exp((item.r || 0) * 0.85)));
      effectiveBatchWeight += weight;

      // Forward Layer 1
      for (let j = 0; j < H1_DIM; j++) h1[j] = b1[j];
      for (let i = 0; i < IN_DIM; i++) {
        const xi = x[i];
        if (xi === 0) continue;
        const wRow = W1[i];
        for (let j = 0; j < H1_DIM; j++) h1[j] += xi * wRow[j];
      }
      for (let j = 0; j < H1_DIM; j++) if (h1[j] < 0) h1[j] = 0;

      // Forward Layer 2
      for (let j = 0; j < H2_DIM; j++) h2[j] = b2[j];
      for (let i = 0; i < H1_DIM; i++) {
        const h1i = h1[i];
        if (h1i === 0) continue;
        const wRow = W2[i];
        for (let j = 0; j < H2_DIM; j++) h2[j] += h1i * wRow[j];
      }
      for (let j = 0; j < H2_DIM; j++) if (h2[j] < 0) h2[j] = 0;

      // Forward Layer 3 (Logits)
      let maxLogit = -Infinity;
      for (let j = 0; j < OUT_DIM; j++) {
        let sum = b3[j];
        for (let i = 0; i < H2_DIM; i++) sum += h2[i] * W3[i][j];
        logits[j] = sum;
        if (sum > maxLogit) maxLogit = sum;
      }

      // Softmax
      let expSum = 0;
      for (let j = 0; j < OUT_DIM; j++) {
        const val = Math.exp(logits[j] - maxLogit);
        probs[j] = val;
        expSum += val;
      }
      const invExp = 1 / (expSum || 1);
      let predA = 0, bestP = -1;
      for (let j = 0; j < OUT_DIM; j++) {
        const p = probs[j] * invExp;
        probs[j] = p;
        if (p > bestP) { bestP = p; predA = j; }
      }

      totalLoss += -Math.log(Math.max(1e-7, probs[targetA])) * weight;
      if (predA === targetA) correct++;

      // Backprop Layer 3
      for (let j = 0; j < OUT_DIM; j++) {
        const grad = (probs[j] - (j === targetA ? 1 : 0)) * weight;
        dLogits[j] = grad;
        gb3[j] += grad;
      }
      for (let i = 0; i < H2_DIM; i++) {
        const h2i = h2[i];
        if (h2i === 0) { dh2[i] = 0; continue; }
        const gwRow = gW3[i], wRow = W3[i];
        let sum = 0;
        for (let j = 0; j < OUT_DIM; j++) {
          const dl = dLogits[j];
          gwRow[j] += h2i * dl;
          sum += dl * wRow[j];
        }
        dh2[i] = sum;
        gb2[i] += sum;
      }

      // Backprop Layer 2 & 1
      for (let i = 0; i < H1_DIM; i++) {
        const h1i = h1[i];
        if (h1i === 0) { dh1[i] = 0; continue; }
        const gwRow = gW2[i], wRow = W2[i];
        let sum = 0;
        for (let j = 0; j < H2_DIM; j++) {
          const d2 = dh2[j];
          if (d2 === 0) continue;
          gwRow[j] += h1i * d2;
          sum += d2 * wRow[j];
        }
        dh1[i] = sum;
        gb1[i] += sum;
      }
      for (let i = 0; i < IN_DIM; i++) {
        const xi = x[i];
        if (xi === 0) continue;
        const gwRow = gW1[i];
        for (let j = 0; j < H1_DIM; j++) {
          const d1 = dh1[j];
          if (d1 !== 0) gwRow[j] += xi * d1;
        }
      }
    }

    const invN = 1 / (effectiveBatchWeight || (end - b));
    const b1c = 1 / (1 - Math.pow(0.9, tStep));
    const b2c = 1 / (1 - Math.pow(0.999, tStep));
    adamVec(b3, gb3, mb3, vb3, OUT_DIM, invN, lr, b1c, b2c);
    adamStep(W3, gW3, mW3, vW3, H2_DIM, OUT_DIM, invN, lr, b1c, b2c);
    adamVec(b2, gb2, mb2, vb2, H2_DIM, invN, lr, b1c, b2c);
    adamStep(W2, gW2, mW2, vW2, H1_DIM, H2_DIM, invN, lr, b1c, b2c);
    adamVec(b1, gb1, mb1, vb1, H1_DIM, invN, lr, b1c, b2c);
    adamStep(W1, gW1, mW1, vW1, IN_DIM, H1_DIM, invN, lr, b1c, b2c);
  }

  if (ep === 1 || ep === epochs || ep % 2 === 0) {
    const avgLoss = (totalLoss / samples.length).toFixed(4);
    const acc = ((correct / samples.length) * 100).toFixed(2);
    console.log(`  [${targetHero || targetMode || 'policy'}] Epoch ${ep}/${epochs} -> Loss: ${avgLoss} | Accuracy: ${acc}%`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`\n[Training Complete] Finished ${epochs} epochs in ${elapsed}s`);

// Quantize float to 4 decimal places
const q4 = v => Math.round(v * 10000) / 10000;
const qArr = arr => Array.from(arr, q4);

const modelOutput = {
  version: 'renying_ai_v2',
  hero: targetHero || 'all',
  mode: targetMode || 'general',
  coop: isCoop,
  arch: { in: IN_DIM, h1: H1_DIM, h2: H2_DIM, out: OUT_DIM },
  weights: {
    W1: W1.map(qArr),
    b1: qArr(b1),
    W2: W2.map(qArr),
    b2: qArr(b2),
    W3: W3.map(qArr),
    b3: qArr(b3)
  },
  actions: ['idle', 'left', 'right', 'down', 'jump', 'atk', 'skill1', 'skill2', 'dash', 'special']
};

const dir = dirname(outPath);
if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
const outStr = JSON.stringify(modelOutput);
writeFileSync(outPath, outStr, 'utf8');
console.log(`  ✓ Saved ${outPath} (${(outStr.length / 1024).toFixed(1)} KB)\n`);
