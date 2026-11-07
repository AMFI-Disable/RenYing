#!/usr/bin/env node
// RenYing Test Suite: Cloudflare Worker, Economy, Cloud Sync & Multiplayer
// Consolidates:
//   - predeploy-check.mjs (Wrangler TOML, Admin CSP, API smoke test)
//   - sync-test.mjs (Multi-device concurrent sync, deduplication, conflict resolution)
//   - world-test.mjs (WorldLine Durable Object open world simulation)
//   - econ-test.mjs (Economy, Armory, gacha, anti-abuse)
//
// Usage:
//   node tools/tests/test-cloud.mjs            Run all cloud and backend tests (finishes ~20-30s)
//   node tools/tests/test-cloud.mjs --bundle   Test against built cloudflare/worker.bundle.js
//   node tools/tests/test-cloud.mjs --fast     Skip prolonged full-matrix tests
//   node tools/tests/test-cloud.mjs --serial   Run the scripts one after another
//
// 找 bug 提示：某一步失败时，单独运行它那一行的命令（见下面 main 里的路径和参数），输出更完整。

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const isSerial = args.includes('--serial');
const hasBundle = args.includes('--bundle');

// 跑一个测试脚本。buffered 为真时输出先收集起来、结束时整段打印（几个脚本同时跑时输出不会交错）
async function runStep(name, cmd, cmdArgs = [], { buffered = false } = {}) {
  const t0 = Date.now();
  const title = `\n\x1b[36m▶ [Cloud Suite] ${name}...\x1b[0m\n`;
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
  console.log('  RenYing Cloud & Backend Suite (test-cloud.mjs)       ');
  console.log('======================================================');

  try {
    // 1. Predeploy & Wrangler Integrity
    await runStep('Pre-deploy & API Smoke Checks', 'tools/tests/predeploy-check.mjs');

    // 2. Cloud Save & Device Sync
    // 3. Open World Durable Object Simulation
    // 4. Economy & Armory System Checks
    // 三个脚本各自在内存里起一份 Worker 和数据库，互不影响；同步测试大部分时间在等客户端的定时器，所以同时跑
    const syncArgs = hasBundle ? ['--bundle'] : [];
    const econArgs = hasBundle ? ['--bundle'] : [];
    await runParallel([
      ['Cloud Save Multi-Device Sync', 'tools/tests/sync-test.mjs', syncArgs],
      ['Open World Durable Object Simulation', 'tools/tests/world-test.mjs'],
      ['Economy & Armory System Verification', 'tools/tests/econ-test.mjs', econArgs],
    ]);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\x1b[32m======================================================`);
    console.log(`  ALL CLOUD & BACKEND CHECKS PASSED (${elapsed}s)`);
    console.log(`======================================================\x1b[0m\n`);
  } catch (err) {
    console.error(`\n\x1b[31mCloud suite failed: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
