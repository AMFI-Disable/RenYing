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
//   node tools/tests/test-ai.mjs                  Default fast AI sanity checks & TianDao matrix (~25-35s)
//   node tools/tests/test-ai.mjs --train          Run genetic policy training sweep
//   node tools/tests/test-ai.mjs --ladder         Generate cross-difficulty ladder benchmark
//   node tools/tests/test-ai.mjs --frames         Remeasure hit/recovery frame data into src/models/ai-brain.json
//   node tools/tests/test-ai.mjs --serial         Run the two default checks one after another
//
// 找 bug 提示：某一步失败时，单独运行它那一行的命令（见下面 main 里的路径和参数），输出更完整。

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const isSerial = args.includes('--serial');
const doTrain = args.includes('--train');
const doLadder = args.includes('--ladder');
const doFrames = args.includes('--frames');

// 跑一个测试脚本。buffered 为真时输出先收集起来、结束时整段打印（几个脚本同时跑时输出不会交错）
async function runStep(name, cmd, cmdArgs = [], { buffered = false } = {}) {
  const t0 = Date.now();
  const title = `\n\x1b[36m▶ [AI Suite] ${name}...\x1b[0m\n`;
  if (!buffered) process.stdout.write(title);
  return new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn('node', [path.join(ROOT, cmd), ...cmdArgs], { stdio: buffered ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    if (buffered) { p.stdout.on('data', d => chunks.push(d)); p.stderr.on('data', d => chunks.push(d)); }
    p.on('close', code => {
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      if (buffered) { process.stdout.write(title); process.stdout.write(Buffer.concat(chunks)); }
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

// 同时跑几个互不依赖的脚本；全部结束后有一个失败就抛出（另一个也会跑完、打印结果）。--serial 时一个一个跑
async function runParallel(steps) {
  if (isSerial) { for (const st of steps) await runStep(...st); return; }
  const results = await Promise.allSettled(steps.map(([name, cmd, cmdArgs = []]) => runStep(name, cmd, cmdArgs, { buffered: true })));
  const failed = results.find(r => r.status === 'rejected');
  if (failed) throw failed.reason;
}

async function main() {
  const start = Date.now();
  console.log('======================================================');
  console.log('  RenYing AI Simulation & Training Suite (test-ai.mjs) ');
  console.log('======================================================');

  try {
    if (doFrames) {
      await runStep('Re-measure Hit Frame Data', 'tools/ai/ai-framedata.mjs');
    }

    // 1. Hero AI Specific Behaviors (LingQue & Core Combo Logic)
    // 2. TianDao (God) Headless Arena Win Rate Matrix (Fast Benchmark)
    // 凌雀测试只用一个 CPU 核，天道对阵表用线程池占满其余的核：两者同时跑，结果都由固定种子决定，和先后无关
    await runParallel([
      ['Hero Combo & Difficulty Separation Test', 'tools/tests/ai-lingque-test.mjs', ['--n', '2']],
      ['TianDao Hero Win-Rate Matrix & Report', 'tools/ai/trainer.mjs', ['--n', '2', '--level', 'god']],
    ]);

    // Optional: Ladder Report
    if (doLadder) {
      await runStep('AI Ladder Benchmark', 'tools/ai/ai-ladder-report.mjs', ['--n', '2']);
    }

    // Optional: Self-Play Training
    if (doTrain) {
      await runStep('Genetic Self-Play Policy Training', 'tools/ai/ai-train.mjs', ['--stage', 'hero', '--sweeps', '1']);
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
