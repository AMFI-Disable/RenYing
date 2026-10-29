#!/usr/bin/env node
// RenYing Test Suite: Combat, Physics, Netcode, Anticheat & Balance Regression
// Consolidates:
//   - combat-test.mjs (Mechanics, combos, skills, 2v2 modes, maps)
//   - rollback-test.mjs (Deterministic state snapshots, rollbacks, fast-forward)
//   - netplay-test.mjs (P2P protocol, room state, packet loss / lag)
//   - anticheat-test.mjs (Damage cap bounds, memory tampering detection)
//   - data-check.mjs (Static table validation)
//   - frame-data.mjs (Hero frame timing sanity checks)
//
// Usage:
//   node tools/test-combat.mjs            Run all checks (finishes ~20-30s)
//   node tools/test-combat.mjs --fast     Skip prolonged netplay stress tests

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const isFast = args.includes('--fast');

async function runStep(name, cmd, cmdArgs = []) {
  const t0 = Date.now();
  process.stdout.write(`\n\x1b[36m▶ [Combat Suite] ${name}...\x1b[0m\n`);
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
  console.log('  RenYing Combat & Mechanics Suite (test-combat.mjs)  ');
  console.log('======================================================');

  try {
    // 1. Data and Frame Consistency
    await runStep('Static Data Integrity Check', 'tools/data-check.mjs');
    await runStep('Frame Data Benchmark Verification', 'tools/frame-data.mjs', ['--check']);

    // 2. Combat Engine & Mechanics
    await runStep('Combat Mechanics & AI Capabilities', 'tools/combat-test.mjs', ['--sim']);

    // 3. Rollback & Anticheat
    await runStep('Rollback Determinism & State Snapshots', 'tools/rollback-test.mjs', ['--rollback']);
    await runStep('Anticheat & Rate-Limit Safeguards', 'tools/anticheat-test.mjs');

    // 4. Netplay Network Simulation
    if (!isFast) {
      await runStep('Netplay P2P Protocol & Stress Simulation', 'tools/netplay-test.mjs');
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\x1b[32m======================================================`);
    console.log(`  ALL COMBAT & NETCODE CHECKS PASSED (${elapsed}s)`);
    console.log(`======================================================\x1b[0m\n`);
  } catch (err) {
    console.error(`\n\x1b[31mCombat suite failed: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
