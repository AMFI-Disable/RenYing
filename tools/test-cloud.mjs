#!/usr/bin/env node
// RenYing Test Suite: Cloudflare Worker, Economy, Cloud Sync & Multiplayer
// Consolidates:
//   - predeploy-check.mjs (Wrangler TOML, Admin CSP, API smoke test)
//   - sync-test.mjs (Multi-device concurrent sync, deduplication, conflict resolution)
//   - world-test.mjs (WorldLine Durable Object open world simulation)
//   - econ-test.mjs (Economy, Armory, gacha, anti-abuse)
//
// Usage:
//   node tools/test-cloud.mjs            Run all cloud and backend tests (finishes ~20-30s)
//   node tools/test-cloud.mjs --bundle   Test against built cloudflare/worker.bundle.js
//   node tools/test-cloud.mjs --fast     Skip prolonged full-matrix tests

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const hasBundle = args.includes('--bundle');

async function runStep(name, cmd, cmdArgs = []) {
  const t0 = Date.now();
  process.stdout.write(`\n\x1b[36m▶ [Cloud Suite] ${name}...\x1b[0m\n`);
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
  console.log('  RenYing Cloud & Backend Suite (test-cloud.mjs)       ');
  console.log('======================================================');

  try {
    // 1. Predeploy & Wrangler Integrity
    await runStep('Pre-deploy & API Smoke Checks', 'tools/predeploy-check.mjs');

    // 2. Cloud Save & Device Sync
    const syncArgs = hasBundle ? ['--bundle'] : [];
    await runStep('Cloud Save Multi-Device Sync', 'tools/sync-test.mjs', syncArgs);

    // 3. Open World Durable Object Simulation
    await runStep('Open World Durable Object Simulation', 'tools/world-test.mjs');

    // 4. Economy & Armory System Checks
    const econArgs = hasBundle ? ['--bundle'] : [];
    await runStep('Economy & Armory System Verification', 'tools/econ-test.mjs', econArgs);

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
