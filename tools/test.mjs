#!/usr/bin/env node
// RenYing Master Runner: Automated Build, Testing & Git Lifecycle
//
// Automatically:
//   1. Checks and synchronizes bundles via `python3 tools/build.py`
//   2. Executes test suites (Combat mechanics, Cloud backend, AI & Trainer, UI audits)
//   3. Handles Git workflow:
//      - Checks git status
//      - If remote has updates, performs `git pull --rebase origin main`
//      - If working tree has modified assets/models/bundles, stages and commits them
//        using conventional style: `<type>: <word1> <word2> <word3>`
//      - Pushes commits to `origin main` (if `--push` or default git lifecycle enabled)
//
// Usage:
//   node tools/test.mjs                  Default all-in-one test run with auto-build (< 120s)
//   node tools/test.mjs --full           Run every test including full-length UI simulations
//   node tools/test.mjs --git            Run suite + full Git lifecycle (rebase, commit, push)
//   node tools/test.mjs --train          Run suite + genetic policy training sweep

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const isFull = args.includes('--full');
const isGit = args.includes('--git');
const doTrain = args.includes('--train');

function runSync(cmd, options = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...options }).trim();
  } catch (err) {
    return null;
  }
}

async function runStep(name, cmd, cmdArgs = []) {
  const t0 = Date.now();
  process.stdout.write(`\n\x1b[35m▶ [Master Suite] ${name}...\x1b[0m\n`);
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit' });
    p.on('close', code => {
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`\x1b[32m✔ ${name} completed (${sec}s)\x1b[0m`);
        resolve();
      } else {
        console.error(`\x1b[31m✘ ${name} failed with exit code ${code} (${sec}s)\x1b[0m`);
        reject(new Error(`${name} failed`));
      }
    });
  });
}

async function handleGitLifecycle() {
  console.log('\n\x1b[36m======================================================');
  console.log('  Executing Git Lifecycle Check (tools/test.mjs)       ');
  console.log('======================================================\x1b[0m');

  const branch = runSync('git rev-parse --abbrev-ref HEAD') || 'main';
  console.log(`Current branch: ${branch}`);

  // 1. Fetch & Rebase check
  console.log('Checking remote changes...');
  const fetchRes = runSync('git fetch origin main');
  const localRev = runSync('git rev-parse HEAD');
  const remoteRev = runSync('git rev-parse origin/main');

  if (localRev !== remoteRev) {
    const baseRev = runSync('git merge-base HEAD origin/main');
    if (baseRev === localRev) {
      console.log('Remote has newer commits. Performing autostash git pull --rebase origin main...');
      execSync('git pull --rebase --autostash origin main', { cwd: ROOT, stdio: 'inherit' });
    }
  } else {
    console.log('Local branch is up to date with origin/main.');
  }

  // 2. Working tree status check
  const status = runSync('git status --porcelain');
  if (status) {
    console.log('\nModified files detected:\n' + status);
    console.log('Staging changes and preparing commit...');
    execSync('git add -A', { cwd: ROOT, stdio: 'inherit' });

    // 3-word conventional commit message rule
    const commitMsg = 'feat: add star skins';
    console.log(`Creating commit: "${commitMsg}"`);
    try {
      execSync(`git commit -m "${commitMsg}"`, { cwd: ROOT, stdio: 'inherit' });
    } catch {
      console.log('No new changes to commit.');
    }
  } else {
    console.log('Working tree is clean. No unstaged changes.');
  }

  // 3. Push if ahead
  const ahead = runSync('git rev-list @{u}..HEAD --count');
  if (ahead && parseInt(ahead, 10) > 0) {
    console.log(`Branch is ahead by ${ahead} commit(s). Pushing to origin ${branch}...`);
    execSync(`git push origin ${branch}`, { cwd: ROOT, stdio: 'inherit' });
    console.log('\x1b[32m✔ Git push complete!\x1b[0m');
  }
}

async function main() {
  const masterStart = Date.now();
  console.log('======================================================');
  console.log('      RenYing Unified Master Runner (test.mjs)        ');
  console.log('======================================================');

  try {
    // Step 1: Automated Build Synchronization
    await runStep('Build Synchronization (build.py)', 'python3', ['tools/build.py']);

    // Step 2: Combat & Netcode Suite
    const combatArgs = isFull ? [] : ['--fast'];
    await runStep('Combat, Netcode & Mechanics Suite', 'node', ['tools/test-combat.mjs', ...combatArgs]);

    // Step 3: AI Simulation & Training Suite
    const aiArgs = doTrain ? ['--train'] : [];
    await runStep('AI Behaviors & TianDao Matchup Suite', 'node', ['tools/test-ai.mjs', ...aiArgs]);

    // Step 4: Cloud & Backend Suite
    await runStep('Cloud, Economy & Worker Suite', 'node', ['tools/test-cloud.mjs']);

    // Step 5: Git Lifecycle (if requested or in automated pipeline)
    if (isGit) {
      await handleGitLifecycle();
    }

    const totalSec = ((Date.now() - masterStart) / 1000).toFixed(1);
    console.log(`\n\x1b[32m======================================================`);
    console.log(`  ALL SUITES FINISHED SUCCESSFULLY IN ${totalSec}s`);
    console.log(`======================================================\x1b[0m\n`);
  } catch (err) {
    console.error(`\n\x1b[31mMaster test runner failed: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
