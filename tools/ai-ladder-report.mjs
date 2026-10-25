#!/usr/bin/env node
// Benchmarks each AI difficulty tier against the next best difficulty tier:
//   - normal vs easy
//   - hard vs normal
//   - impossible vs hard
//   - god vs impossible
// and writes a Markdown report to docs/ai-ladder-benchmark.md.
// Usage:
//   node tools/ai-ladder-report.mjs [--n 2] [--out docs/ai-ladder-benchmark.md]
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { Pool, HEROES, NAMES, score, byHero } from './ai-arena.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +arg('n', 2); // games per hero pair (144 * N matches per tier comparison)
const OUT = arg('out', ROOT + 'docs/ai-ladder-benchmark.md');

const TIERS = [
  { id: 'easy',       zh: '入门 (Easy)' },
  { id: 'normal',     zh: '寻常 (Normal)' },
  { id: 'hard',       zh: '劲敌 (Hard)' },
  { id: 'impossible', zh: '绝顶 (Impossible)' },
  { id: 'god',        zh: '天道 (God)' },
];

// Adjacent difficulty matchups: higher tier vs next best (immediately below it)
const STEP_PAIRS = [
  { hi: TIERS[1], lo: TIERS[0], desc: '基础立回与适度格挡 vs 初学随机出招' },
  { hi: TIERS[2], lo: TIERS[1], desc: '确反、招式取消与克制微调 vs 标准立回' },
  { hi: TIERS[3], lo: TIERS[2], desc: '零空隙反应、压起身、骗闪与进化基因 vs 劲敌' },
  { hi: TIERS[4], lo: TIERS[3], desc: '天道极致预判、精准招架与完全体打法基因 vs 绝顶' },
];

function seededMatchupGames(la, lb, n, seed0 = 1000) {
  const g = [];
  let s = seed0;
  for (let a = 0; a < HEROES.length; a++) {
    for (let b = 0; b < HEROES.length; b++) {
      for (let k = 0; k < n; k++) {
        const seed = s++;
        if (k % 2 === 0) {
          g.push({ a, b, la, lb, flip: 0, ha: a, hb: b, seed });
        } else {
          g.push({ a: b, b: a, la: lb, lb: la, flip: 1, ha: a, hb: b, seed });
        }
      }
    }
  }
  return g;
}

const t0 = Date.now();
const pool = new Pool(os.cpus().length);
const stepResults = [];

console.log(`===== RenYing AI Difficulty Ladder Benchmark (n=${N}, ${144 * N} matches per tier step) =====\n`);

for (let i = 0; i < STEP_PAIRS.length; i++) {
  const pair = STEP_PAIRS[i];
  const games = seededMatchupGames(pair.hi.id, pair.lo.id, N, (i + 1) * 10000);
  const res = await pool.run(games);
  const winRate = score(res);
  const heroRates = byHero(res);
  const avgSec = res.reduce((acc, r) => acc + r.steps, 0) / res.length / 120;
  let wins = 0, losses = 0, draws = 0;
  for (const r of res) {
    if (r.w === -1) draws++;
    else if (r.w === r.flip) wins++;
    else losses++;
  }
  stepResults.push({ ...pair, winRate, heroRates, avgSec, total: res.length, wins, losses, draws });
  console.log(`  ${pair.hi.zh} vs ${pair.lo.zh}: ${(winRate * 100).toFixed(1)}% (${wins}W - ${losses}L - ${draws}D, avg ${avgSec.toFixed(1)}s)`);
}

pool.close();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const pct = v => `${(v * 100).toFixed(1)}%`;

const lines = [
  '# 刃影 AI 难度阶梯胜率报告 (AI Difficulty Ladder Benchmark)',
  '',
  '> 本报告由 `node tools/ai-ladder-report.mjs` 及 GitHub Actions (`ai-ladder-audit.yml`) 自动实测生成，记录每个 AI 难度等级对阵**下一级难度（Next Best Difficulty）**的全角色交叉对弈胜率。',
  '',
  `- **对局规模**: 每组相邻难度对阵 **${144 * N} 场**（12 × 12 全英雄交叉匹配，先手/后手各半，固定随机种子对齐）`,
  `- **总模拟场次**: **${144 * N * STEP_PAIRS.length} 场**（物理引擎 120Hz 完整帧模拟）`,
  '',
  '## 1. 相邻难度阶梯总胜率 (Tier vs. Next Best Tier)',
  '',
  '| 高阶难度 (Higher Tier) | 对阵下一级难度 (Next Best Tier) | 高阶胜率 (Win %) | 胜 / 负 / 平 (W-L-D) | 平均对局时长 | 核心能力跨度 |',
  '| :--- | :--- | :--- | :--- | :--- | :--- |',
];

for (const r of stepResults) {
  lines.push(`| **${r.hi.zh}** | ${r.lo.zh} | **${pct(r.winRate)}** | ${r.wins}W / ${r.losses}L / ${r.draws}D | ${r.avgSec.toFixed(1)}s | ${r.desc} |`);
}

lines.push(
  '',
  '## 2. 各英雄在相邻难度晋升中的胜率表现 (Per-Hero Win % vs. Next Best Tier)',
  '',
  '| 英雄 (Hero) | 寻常 vs 入门 | 劲敌 vs 寻常 | 绝顶 vs 劲敌 | 天道 vs 绝顶 | 四阶平均晋升胜率 |',
  '| :--- | :--- | :--- | :--- | :--- | :--- |'
);

for (let h = 0; h < HEROES.length; h++) {
  const c0 = stepResults[0].heroRates[h];
  const c1 = stepResults[1].heroRates[h];
  const c2 = stepResults[2].heroRates[h];
  const c3 = stepResults[3].heroRates[h];
  const avg = (c0 + c1 + c2 + c3) / 4;
  lines.push(`| **${NAMES[h]}** (\`${HEROES[h]}\`) | ${pct(c0)} | ${pct(c1)} | ${pct(c2)} | ${pct(c3)} | **${pct(avg)}** |`);
}

lines.push(
  '',
  '## 3. 本地复现与更新指令',
  '',
  '```bash',
  '# 运行相邻难度天梯实测并更新本 Markdown 报告',
  'node tools/ai-ladder-report.mjs --n 2',
  '```',
  ''
);

writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`\nReport written to ${OUT} (${elapsed}s)`);

// Fail gate if any higher difficulty fails to beat the difficulty below it (> 50%)
for (const r of stepResults) {
  if (r.winRate <= 0.5) {
    console.error(`FAIL: ${r.hi.id} did not beat ${r.lo.id} (win rate ${(r.winRate * 100).toFixed(1)}% <= 50%)`);
    process.exit(1);
  }
}
