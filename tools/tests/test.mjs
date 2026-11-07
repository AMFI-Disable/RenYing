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
//   node tools/tests/test.mjs                  Default all-in-one test run with auto-build (< 120s)
//   node tools/tests/test.mjs --full           Run every test including full-length UI simulations
//   node tools/tests/test.mjs --git            Run suite + full Git lifecycle (rebase, commit, push)
//   node tools/tests/test.mjs --train          Run suite + genetic policy training sweep
//   node tools/tests/test.mjs --serial         Run the AI and Cloud suites one after another (old behaviour)
//
// 文件结构：
//   1. 找 Python、解析参数
//   2. 跑子进程的小工具（直接输出 / 先收集输出再一次打印）
//   3. --git：拉取、提交、推送
//   4. 入口：打包 → 战斗套件 → AI 套件和云端套件（默认同时跑）
//
// 提速：AI 套件（约 100 秒）和云端套件（约 75 秒，大部分时间在等客户端的防抖定时器）互不依赖，
// 默认同时跑，两边的输出各自收集起来，跑完一个就整段打印一个，不会混在一起。

import { spawn, spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// ---------- 1. 找 Python、解析参数 ----------

// 打包脚本要 Python 3.10+。Windows 上没有 python3 这个名字（应用商店的 python3.exe 只是个占位符），
// 所以挨个试一遍，挑真能跑的那个；一个都没有就报一句清楚的出错，而不是 spawn 一个不存在的命令
function findPython() {
  for (const cmd of ['python3', 'python', 'py']) {
    const probe = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0 && String(probe.stdout).trim() === '3') return cmd;
  }
  return null;
}
const PYTHON = findPython();

const args = process.argv.slice(2);
const isFull = args.includes('--full');
const isGit = args.includes('--git');
const doTrain = args.includes('--train');
const isSerial = args.includes('--serial');

// ---------- 2. 跑子进程的小工具 ----------

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

// 和 runStep 一样，但输出先收集起来，结束时一次打印：两个套件同时跑时输出不会交错。
// 成功或失败的提示和 runStep 一字不差；失败时同样 reject。
async function runStepBuffered(name, cmd, cmdArgs = []) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', d => chunks.push(d));
    p.stderr.on('data', d => chunks.push(d));
    p.on('close', code => {
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`\n\x1b[35m▶ [Master Suite] ${name}...\x1b[0m\n`);
      process.stdout.write(Buffer.concat(chunks));
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

// ---------- 3. --git：拉取、提交、推送 ----------
// 注意：这里会 git add -A 并用固定的提交信息提交，只在确定工作区里全是要提交的东西时才用 --git。
async function handleGitLifecycle() {
  console.log('\n\x1b[36m======================================================');
  console.log('  Executing Git Lifecycle Check (tools/tests/test.mjs)       ');
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

// ---------- 4. 入口 ----------
async function main() {
  const masterStart = Date.now();
  console.log('======================================================');
  console.log('      RenYing Unified Master Runner (test.mjs)        ');
  console.log('======================================================');

  try {
    // Step 1: Automated Build Synchronization
    if (!PYTHON) throw new Error('找不到 Python 3（试过 python3、python、py），网页没法重新生成');
    await runStep('Build Synchronization (build.py)', PYTHON, ['tools/build.py']);

    // Step 2: Combat & Netcode Suite
    const combatArgs = isFull ? [] : ['--fast'];
    await runStep('Combat, Netcode & Mechanics Suite', 'node', ['tools/tests/test-combat.mjs', ...combatArgs]);

    // Step 3 + 4: AI Simulation & Training Suite, Cloud & Backend Suite
    const aiArgs = doTrain ? ['--train'] : [];
    const aiStep = ['AI Behaviors & TianDao Matchup Suite', 'node', ['tools/tests/test-ai.mjs', ...aiArgs]];
    const cloudStep = ['Cloud, Economy & Worker Suite', 'node', ['tools/tests/test-cloud.mjs']];
    if (isSerial) {
      await runStep(...aiStep);
      await runStep(...cloudStep);
    } else {
      // 两个都跑完再判断：一个失败了也让另一个跑完，把两边的结果都打出来
      const results = await Promise.allSettled([runStepBuffered(...aiStep), runStepBuffered(...cloudStep)]);
      const failed = results.find(r => r.status === 'rejected');
      if (failed) throw failed.reason;
    }

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
