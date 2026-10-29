#!/usr/bin/env node
// RenYing Test Suite: AI Simulation, Arena Matchups, Combos & Genetic Training
// Consolidates:
//   - ai-lingque-test.mjs (Hero AI combo & difficulty separation assertions)
//   - trainer.mjs & trainer-why.mjs (God/TianDao win rate matrix calculation)
//   - ai-ladder-report.mjs (Cross-difficulty benchmark)
//   - ai-train.mjs (Self-play genetic policy training)
//   - ai-framedata.mjs (Automated frame data measurement)
//
// Usage:
//   node tools/test-ai.mjs                  Default fast AI sanity checks & TianDao matrix (~25-35s)
//   node tools/test-ai.mjs --train          Run genetic policy training sweep
//   node tools/test-ai.mjs --ladder         Generate cross-difficulty ladder benchmark
//   node tools/test-ai.mjs --frames         Remeasure hit/recovery frame data into models/ai-brain.json

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const doTrain = args.includes('--train');
const doLadder = args.includes('--ladder');
const doFrames = args.includes('--frames');

async function runStep(name, cmd, cmdArgs = []) {
  const t0 = Date.now();
  process.stdout.write(`\n\x1b[36m▶ [AI Suite] ${name}...\x1b[0m\n`);
  return new Promise((resolve, reject) => {
    const p = spawn('node', [path.join(ROOT, cmd), ...cmdArgs], { stdio: 'inherit' });
    p.on('close', code => {
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`\x1b[32m✔ ${name} passed (${sec}s)\x1b[0m`);
        resolve();
      } else {
        console.error(`\x1b[31m✘ ${name} failed with exit code ${code} (${sec}s)\x1b[0m`);
        reject(new Error(`${name} failed`));
      }
    });
  });
}

async function main() {
  const start = Date.now();
  console.log('======================================================');
  console.log('  RenYing AI Simulation & Training Suite (test-ai.mjs) ');
  console.log('======================================================');

  try {
    if (doFrames) {
      await runStep('Re-measure Hit Frame Data', 'tools/ai-framedata.mjs');
    }

    // 1. Hero AI Specific Behaviors (LingQue & Core Combo Logic)
    await runStep('Hero Combo & Difficulty Separation Test', 'tools/ai-lingque-test.mjs', ['--n', '2']);

    // 2. TianDao (God) Headless Arena Win Rate Matrix (Fast Benchmark)
    await runStep('TianDao Hero Win-Rate Matrix & Report', 'tools/trainer.mjs', ['--n', '2', '--level', 'god']);

    // Optional: Ladder Report
    if (doLadder) {
      await runStep('AI Ladder Benchmark', 'tools/ai-ladder-report.mjs', ['--n', '2']);
    }

    // Optional: Self-Play Training
    if (doTrain) {
      await runStep('Genetic Self-Play Policy Training', 'tools/ai-train.mjs', ['--stage', 'hero', '--sweeps', '1']);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\x1b[32m======================================================`);
    console.log(`  ALL AI CHECKS COMPLETED SUCCESSFULLY (${elapsed}s)`);
    console.log(`======================================================\x1b[0m\n`);
  } catch (err) {
    console.error(`\n\x1b[31mAI suite failed: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
