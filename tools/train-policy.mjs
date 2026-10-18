#!/usr/bin/env node
/**
 * Train a lightweight Neural Network policy on RenYing CvC Trajectories without external heavy dependencies.
 *
 * Implements a 2-layer MLP (Multi-Layer Perceptron):
 * Input (25) -> Dense (64, ReLU) -> Dense (32, ReLU) -> Output (10, Softmax)
 * Trained with Cross-Entropy Loss & Adam Optimizer.
 *
 * Exports trained weights to a lightweight JSON model format:
 * `models/renying_ai_v1.json` (< 50 KB)
 *
 * Usage:
 *   node tools/train-policy.mjs --data data/cvc_dataset.jsonl --epochs 10 --out models/renying_ai_v1.json
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
const dataPath = getArg('data', 'data/cvc_dataset.jsonl');
const epochs = parseInt(getArg('epochs', '8'), 10);
const outPath = getArg('out', 'models/renying_ai_v1.json');
const lr = parseFloat(getArg('lr', '0.003'));

if (!existsSync(dataPath)) {
  console.error(`Error: Dataset not found at ${dataPath}. Run: node tools/cvc-sim.mjs --matches 10 --export ${dataPath}`);
  process.exit(1);
}

// 1. Load Dataset
console.log(`Loading dataset from ${dataPath}...`);
const samples = [];
const fileStream = createReadStream(dataPath);
const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const d = JSON.parse(line);
    // filter positive reward transitions or all transitions
    samples.push({ s: d.s, a: d.a, r: d.r });
  } catch (e) {}
}
console.log(`Loaded ${samples.length.toLocaleString()} training transitions.`);

if (samples.length === 0) {
  console.error('No samples found in dataset.');
  process.exit(1);
}

// Model Architecture: 25 -> 64 -> 32 -> 10
const IN_DIM = 25;
const H1_DIM = 64;
const H2_DIM = 32;
const OUT_DIM = 10;

function randMatrix(rows, cols, scale = 0.1) {
  const m = [];
  for (let i = 0; i < rows; i++) {
    const row = new Float32Array(cols);
    for (let j = 0; j < cols; j++) row[j] = (Math.random() * 2 - 1) * Math.sqrt(2 / rows) * scale;
    m.push(row);
  }
  return m;
}

const W1 = randMatrix(IN_DIM, H1_DIM, 1.0);
const b1 = new Float32Array(H1_DIM);
const W2 = randMatrix(H1_DIM, H2_DIM, 1.0);
const b2 = new Float32Array(H2_DIM);
const W3 = randMatrix(H2_DIM, OUT_DIM, 1.0);
const b3 = new Float32Array(OUT_DIM);

// Adam state
const mW1 = randMatrix(IN_DIM, H1_DIM, 0), vW1 = randMatrix(IN_DIM, H1_DIM, 0);
const mb1 = new Float32Array(H1_DIM), vb1 = new Float32Array(H1_DIM);
const mW2 = randMatrix(H1_DIM, H2_DIM, 0), vW2 = randMatrix(H1_DIM, H2_DIM, 0);
const mb2 = new Float32Array(H2_DIM), vb2 = new Float32Array(H2_DIM);
const mW3 = randMatrix(H2_DIM, OUT_DIM, 0), vW3 = randMatrix(H2_DIM, OUT_DIM, 0);
const mb3 = new Float32Array(OUT_DIM), vb3 = new Float32Array(OUT_DIM);

let tStep = 0;
function adam(param, grad, m, v, lr = 0.003, b1 = 0.9, b2 = 0.999, eps = 1e-8) {
  m = b1 * m + (1 - b1) * grad;
  v = b2 * v + (1 - b2) * grad * grad;
  const mHat = m / (1 - Math.pow(b1, tStep));
  const vHat = v / (1 - Math.pow(b2, tStep));
  return [param - lr * mHat / (Math.sqrt(vHat) + eps), m, v];
}

console.log(`\n======================================================`);
console.log(`   Training RenYing Neural Policy (Supervised BC)   `);
console.log(`   Input: ${IN_DIM} -> Hidden: ${H1_DIM} -> Hidden: ${H2_DIM} -> Action: ${OUT_DIM}`);
console.log(`   Epochs: ${epochs} | Samples: ${samples.length}`);
console.log(`======================================================\n`);

const BATCH_SIZE = 64;

for (let ep = 1; ep <= epochs; ep++) {
  // Shuffle samples
  for (let i = samples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [samples[i], samples[j]] = [samples[j], samples[i]];
  }

  let totalLoss = 0;
  let correct = 0;
  let batches = 0;

  for (let b = 0; b < samples.length; b += BATCH_SIZE) {
    tStep++;
    const batch = samples.slice(b, b + BATCH_SIZE);
    if (!batch.length) continue;

    // Gradients
    const gW1 = randMatrix(IN_DIM, H1_DIM, 0);
    const gb1 = new Float32Array(H1_DIM);
    const gW2 = randMatrix(H1_DIM, H2_DIM, 0);
    const gb2 = new Float32Array(H2_DIM);
    const gW3 = randMatrix(H2_DIM, OUT_DIM, 0);
    const gb3 = new Float32Array(OUT_DIM);

    for (const item of batch) {
      const x = item.s;
      const targetA = item.a;

      // Layer 1
      const h1 = new Float32Array(H1_DIM);
      for (let j = 0; j < H1_DIM; j++) {
        let sum = b1[j];
        for (let i = 0; i < IN_DIM; i++) sum += x[i] * W1[i][j];
        h1[j] = Math.max(0, sum); // ReLU
      }

      // Layer 2
      const h2 = new Float32Array(H2_DIM);
      for (let j = 0; j < H2_DIM; j++) {
        let sum = b2[j];
        for (let i = 0; i < H1_DIM; i++) sum += h1[i] * W2[i][j];
        h2[j] = Math.max(0, sum); // ReLU
      }

      // Layer 3 (Logits)
      const logits = new Float32Array(OUT_DIM);
      let maxLogit = -Infinity;
      for (let j = 0; j < OUT_DIM; j++) {
        let sum = b3[j];
        for (let i = 0; i < H2_DIM; i++) sum += h2[i] * W3[i][j];
        logits[j] = sum;
        if (sum > maxLogit) maxLogit = sum;
      }

      // Softmax
      let expSum = 0;
      const probs = new Float32Array(OUT_DIM);
      for (let j = 0; j < OUT_DIM; j++) {
        probs[j] = Math.exp(logits[j] - maxLogit);
        expSum += probs[j];
      }
      for (let j = 0; j < OUT_DIM; j++) probs[j] /= (expSum || 1);

      // Cross entropy loss
      const loss = -Math.log(Math.max(1e-7, probs[targetA]));
      totalLoss += loss;

      // Accuracy check
      let predA = 0, bestP = -1;
      for (let j = 0; j < OUT_DIM; j++) {
        if (probs[j] > bestP) { bestP = probs[j]; predA = j; }
      }
      if (predA === targetA) correct++;

      // Backpropagation
      // Output gradient: dL/dLogit = p_i - y_i
      const dLogits = new Float32Array(OUT_DIM);
      for (let j = 0; j < OUT_DIM; j++) {
        dLogits[j] = probs[j] - (j === targetA ? 1 : 0);
        gb3[j] += dLogits[j];
        for (let i = 0; i < H2_DIM; i++) gW3[i][j] += h2[i] * dLogits[j];
      }

      // Layer 2 gradient
      const dh2 = new Float32Array(H2_DIM);
      for (let i = 0; i < H2_DIM; i++) {
        let sum = 0;
        for (let j = 0; j < OUT_DIM; j++) sum += dLogits[j] * W3[i][j];
        dh2[i] = h2[i] > 0 ? sum : 0; // ReLU derivative
        gb2[i] += dh2[i];
        for (let k = 0; k < H1_DIM; k++) gW2[k][i] += h1[k] * dh2[i];
      }

      // Layer 1 gradient
      const dh1 = new Float32Array(H1_DIM);
      for (let i = 0; i < H1_DIM; i++) {
        let sum = 0;
        for (let j = 0; j < H2_DIM; j++) sum += dh2[j] * W2[i][j];
        dh1[i] = h1[i] > 0 ? sum : 0; // ReLU derivative
        gb1[i] += dh1[i];
        for (let k = 0; k < IN_DIM; k++) gW1[k][i] += x[k] * dh1[i];
      }
    }

    // Apply Adam Optimizer
    const n = batch.length;
    for (let j = 0; j < OUT_DIM; j++) {
      [b3[j], mb3[j], vb3[j]] = adam(b3[j], gb3[j] / n, mb3[j], vb3[j], lr);
      for (let i = 0; i < H2_DIM; i++) {
        [W3[i][j], mW3[i][j], vW3[i][j]] = adam(W3[i][j], gW3[i][j] / n, mW3[i][j], vW3[i][j], lr);
      }
    }
    for (let j = 0; j < H2_DIM; j++) {
      [b2[j], mb2[j], vb2[j]] = adam(b2[j], gb2[j] / n, mb2[j], vb2[j], lr);
      for (let i = 0; i < H1_DIM; i++) {
        [W2[i][j], mW2[i][j], vW2[i][j]] = adam(W2[i][j], gW2[i][j] / n, mW2[i][j], vW2[i][j], lr);
      }
    }
    for (let j = 0; j < H1_DIM; j++) {
      [b1[j], mb1[j], vb1[j]] = adam(b1[j], gb1[j] / n, mb1[j], vb1[j], lr);
      for (let i = 0; i < IN_DIM; i++) {
        [W1[i][j], mW1[i][j], vW1[i][j]] = adam(W1[i][j], gW1[i][j] / n, mW1[i][j], vW1[i][j], lr);
      }
    }
    batches++;
  }

  const avgLoss = (totalLoss / samples.length).toFixed(4);
  const acc = ((correct / samples.length) * 100).toFixed(2);
  console.log(`  Epoch [${ep}/${epochs}] -> Loss: ${avgLoss} | Accuracy: ${acc}%`);
}

// 4. Export Model Weights
const modelOutput = {
  version: 'renying_ai_v1',
  arch: { in: IN_DIM, h1: H1_DIM, h2: H2_DIM, out: OUT_DIM },
  weights: {
    W1: W1.map(row => Array.from(row)),
    b1: Array.from(b1),
    W2: W2.map(row => Array.from(row)),
    b2: Array.from(b2),
    W3: W3.map(row => Array.from(row)),
    b3: Array.from(b3)
  },
  actions: ['idle', 'left', 'right', 'down', 'jump', 'atk', 'skill1', 'skill2', 'dash', 'special']
};

const dir = dirname(outPath);
if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
const outStr = JSON.stringify(modelOutput);
writeFileSync(outPath, outStr, 'utf8');

console.log(`\n[Saved] Model weights saved to ${outPath} (${(outStr.length / 1024).toFixed(1)} KB)`);
console.log(`======================================================\n`);
