#!/usr/bin/env node
/**
 * Game Mode Meta & Hero Tier Analysis Generator for RenYing.
 *
 * Runs headless simulations tailored to each specific game mode:
 *   - 1v1 CPU (cpu)
 *   - 2v2 Arena (watch2v2)
 *   - Chaos Mode / Mutations (chaos)
 *   - Mayhem Mode / 10x Meter (mayhem)
 *   - Tag3 Mode / 3v3 Relays (tag3)
 *
 * Generates what is strong, what is weak, hero tiers (S/A/B/C), and matchup matrices.
 *
 * Usage:
 *   node tools/gamemode-meta.mjs --mode watch2v2
 *   node tools/gamemode-meta.mjs --all
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

function getNodeBin() {
  if (process.execPath && existsSync(process.execPath)) return process.execPath;
  if (process.argv[0] && existsSync(process.argv[0])) return process.argv[0];
  const candidates = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return 'node';
}

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const targetMode = getArg('mode', 'cpu');
const runAll = args.includes('--all');
const MODES = ['cpu', 'watch2v2', 'chaos', 'mayhem', 'tag3'];

mkdirSync('data/meta', { recursive: true });

const MODE_TITLES = {
  cpu: '1v1 CPU Duel',
  chaos: 'Chaos Mutation Arena',
  mayhem: 'Mayhem Mode (10x Meter)',
  watch2v2: '2v2 Team Battle',
  tag3: '3v3 Tag Relay'
};

function runMetaForMode(mode) {
  const displayTitle = MODE_TITLES[mode] || mode.toUpperCase();
  console.log(`\n======================================================`);
  console.log(`>>> Analyzing Meta for Game Mode: [ ${displayTitle} ]`);
  console.log(`======================================================`);
  try {
    execSync(`"${getNodeBin()}" tools/cvc-sim.mjs --mode ${mode} --meta --matches 66`, { stdio: 'inherit' });
    const src = `data/meta_${mode}.json`;
    const dest = `data/meta/${mode}.json`;
    if (existsSync(src)) {
      writeFileSync(dest, readFileSync(src, 'utf8'), 'utf8');
    }
  } catch (err) {
    console.error(`Failed to generate meta for ${mode}:`, err.message);
  }
}

if (runAll) {
  for (const m of MODES) {
    runMetaForMode(m);
  }
  console.log(`\n[Complete] Generated meta dossiers for all 6 game modes in data/meta/`);
} else {
  runMetaForMode(targetMode);
}
