#!/usr/bin/env node
// RenYing Test Suite: UI Panels, In-Game HUD, Touch Controls & Performance
// Consolidates:
//   - ui-audit.mjs (Panel clipping, font sizes, screen layout)
//   - hud-audit.mjs (Battle HUD layout & minimum text size)
//   - hud-overlap-audit.mjs (Battle HUD overlap and bounds check)
//   - kb-flow-test.mjs (Pure keyboard mode flow navigation)
//   - touch-audit.mjs (Mobile virtual stick & synthetic touch controls)
//   - perf-audit.mjs (Frame rate & memory performance against budget)
//   - firstload-audit.mjs (Cold load FCP, LCP, layout shift)
//
// Features:
//   - Auto-manages a background static http.server on port 8791 if not already running.
//   - Cleans up all spawned web server processes upon exit.
//
// Usage:
//   node tools/test-ui.mjs                  Default comprehensive UI audit (~30-40s)
//   node tools/test-ui.mjs --fast           Skip heavy stress/perf profiling

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const isFast = args.includes('--fast');

let serverProc = null;

async function checkPort(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/`, res => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServer(port = 8791) {
  const isUp = await checkPort(port);
  if (isUp) return;

  process.stdout.write(`Starting background http.server on port ${port}...\n`);
  serverProc = spawn('python3', ['-m', 'http.server', String(port)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false
  });

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 150));
    if (await checkPort(port)) {
      return;
    }
  }
  throw new Error(`Failed to start http.server on port ${port}`);
}

process.on('exit', () => {
  if (serverProc) {
    try { serverProc.kill('SIGTERM'); } catch {}
  }
});
process.on('SIGINT', () => process.exit(130));

async function runStep(name, cmd, cmdArgs = []) {
  const t0 = Date.now();
  process.stdout.write(`\n\x1b[36m▶ [UI Suite] ${name}...\x1b[0m\n`);
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
  console.log('  RenYing UI, HUD, Mobile & Perf Suite (test-ui.mjs)  ');
  console.log('======================================================');

  try {
    // 0. Ensure static web server is serving on 8791
    await ensureServer(8791);

    // 1. Panels & Layout Audit
    await runStep('UI Panel Layout & Typography Audit', 'tools/ui-audit.mjs', ['ci-ui', '1440', '900']);

    // 2. Battle HUD Text & Bounds Check
    await runStep('Battle HUD Text Readability Audit', 'tools/hud-audit.mjs', ['ci-hud', '1440', '900']);

    // 3. Battle HUD Overlap & Occlusion Check
    await runStep('Battle HUD Occlusion & Overlap Audit', 'tools/hud-overlap-audit.mjs', ['ci-hud-ov', '1440', '900', 'watch2v2']);

    // 4. Keyboard Navigation Flow
    await runStep('Pure Keyboard Navigation Flow Test', 'tools/kb-flow-test.mjs', ['ci-kb', '1440', '900']);

    // 5. Touch Controls Emulation
    await runStep('Mobile Virtual Controls & Touch Emulation', 'tools/touch-audit.mjs', ['ci-touch']);

    // 6. Performance & Cold Load (if not in fast mode)
    if (!isFast) {
      await runStep('Cold First-Load Performance Audit', 'tools/firstload-audit.mjs', ['ci-firstload', '2']);
      await runStep('FPS Frame Time & Memory Budget Audit', 'tools/perf-audit.mjs', ['ci-perf']);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\x1b[32m======================================================`);
    console.log(`  ALL UI & MOBILE AUDITS PASSED (${elapsed}s)`);
    console.log(`======================================================\x1b[0m\n`);
  } catch (err) {
    console.error(`\n\x1b[31mUI suite failed: ${err.message}\x1b[0m`);
    process.exit(1);
  } finally {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch {}
    }
  }
}

main();
