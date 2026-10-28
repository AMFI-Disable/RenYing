#!/usr/bin/env node
// Trainer：电脑对电脑（默认天道）的全角色互打（无画面、只算对战逻辑，比实时快很多），统计每个角色的胜率和对位胜率，
// 然后按胜率迭代出一份平衡建议（只写进 docs/trainer/，不改 src/data/heroes/ 里的 bal）。
//   node tools/trainer.mjs --n 20                       只测当前数值：每对角色 20 场（左右各一半）
//   node tools/trainer.mjs --n 20 --rounds 4            再迭代 4 轮平衡建议，最后用建议数值复测一次
//   node tools/trainer.mjs --n 20 --bal docs/trainer/proposal.json   直接测某份建议
//   node tools/trainer.mjs --n 20 --rounds 6 --level god,hard        几个难度一起算（每个难度各打一遍，胜率取平均）
// 结果：docs/trainer/report.md（给人看）、docs/trainer/results.json（原始数据）、docs/trainer/proposal.json（建议数值）
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import { Pool, HEROES, NAMES } from './ai-arena.mjs';
import { heroData } from './ai-code.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = Math.max(2, +arg('n', 20) & ~1), ROUNDS = +arg('rounds', 0), LEVELS = arg('level', 'god').split(','), LEVEL = LEVELS.join('+');
const OUT = (arg('out', 'docs/trainer').startsWith('/') ? '' : ROOT) + arg('out', 'docs/trainer') + '/';
const SEED = +arg('seed', 1);
// 每轮调整的力度：胜率每偏离 50% 一个百分点，倍率改 STEP 个百分点；单轮最多改 MAXSTEP；总倍率限制在 [LO, HI]
const STEP = +arg('step', 0.6), MAXSTEP = 0.1, LO = 0.6, HI = 1.4;
const H = HEROES.length;

// 读取当前的 BAL（src/data/heroes/ 里每位侠客的 bal），作为起点
const BASE = Object.fromEntries(heroData().map(h => [h.id, h.bal]));

// 所有对位：a 角色对 b 角色各 N 场，奇数场左右互换；种子固定，同一份数值重跑结果一样
function games(seed0 = SEED) {
  const g = []; let s = seed0 * 100000;
  for (const LV of LEVELS) for (let a = 0; a < H; a++) for (let b = 0; b < H; b++) {
    if (a === b) continue;   // 镜像对局一定是 50%，不用跑
    for (let k = 0; k < N; k++) {
      const seed = s++;
      g.push(k % 2 ? { a: b, b: a, la: LV, lb: LV, flip: 1, ha: a, hb: b, seed } : { a, b, la: LV, lb: LV, flip: 0, ha: a, hb: b, seed });
    }
  }
  return g;
}

// 跑一份数值：BAL 通过 AI_BAL 文件交给 worker（ai-arena.mjs 的 makeEnv 会读）
async function measure(bal, tag, seed0 = SEED) {
  mkdirSync(OUT, { recursive: true });
  const f = os.tmpdir() + '/renying-trainer-bal-' + process.pid + '-' + tag + '.json';
  writeFileSync(f, JSON.stringify(bal));
  process.env.AI_BAL = f;
  const pool = new Pool(+arg('workers', os.cpus().length));
  const t0 = Date.now(), res = await pool.run(games(seed0));
  pool.close();
  const W = Array.from({ length: H }, () => new Array(H).fill(0)), C = Array.from({ length: H }, () => new Array(H).fill(0));
  const LW = LEVELS.map(() => new Array(H).fill(0)), LC = LEVELS.map(() => new Array(H).fill(0));
  let draws = 0, steps = 0, leftWins = 0, decided = 0;
  for (const r of res) {
    const win = r.w === -1 ? 0.5 : (r.w === r.flip ? 1 : 0);   // ha 方的得分
    W[r.ha][r.hb] += win; C[r.ha][r.hb]++;
    const li = LEVELS.indexOf(r.la); LW[li][r.ha] += win; LC[li][r.ha]++;
    if (r.w === -1) draws++; else { decided++; if (r.w === 0) leftWins++; }
    steps += r.steps;
  }
  const mu = W.map((row, i) => row.map((w, j) => i === j ? 0.5 : w / C[i][j]));
  const wr = mu.map((row, i) => row.reduce((s, v, j) => s + (i === j ? 0 : v), 0) / (H - 1));
  const byLevel = LW.map((row, li) => row.map((w, i) => w / LC[li][i]));
  const sec = (Date.now() - t0) / 1000;
  console.log(`[${tag}] ${res.length} 场，${sec.toFixed(0)} 秒；` + wr.map((v, i) => `${NAMES[i]}${(v * 100).toFixed(0)}`).join(' '));
  return { tag, games: res.length, draws, leftWinRate: decided ? leftWins / decided : 0.5, avgSec: steps / res.length / 120, wallSec: sec, wr, mu, byLevel, bal };
}

// 胜率高的角色整体削（伤害和气血一起乘同一个系数，招式手感不变），胜率低的整体加强
// 后面几轮力度逐渐变小（每轮 ×DECAY），不然强弱会来回摆
const DECAY = +arg('decay', 0.75);
function adjust(bal, wr, r) {
  const next = JSON.parse(JSON.stringify(bal)), k = Math.pow(DECAY, r - 1);
  HEROES.forEach((id, i) => {
    const d = Math.max(-MAXSTEP, Math.min(MAXSTEP, (0.5 - wr[i]) * STEP * k));
    const b = next[id], f = 1 + d;
    for (const k of ['normal', 'skill', 'ult', 'hp']) b[k] = Math.round(Math.max(LO, Math.min(HI, b[k] * f)) * 1000) / 1000;
  });
  return next;
}

const pct = v => (v * 100).toFixed(1) + '%';
const spread = wr => [Math.min(...wr), Math.max(...wr)];
const sd = wr => Math.sqrt(wr.reduce((s, v) => s + (v - 0.5) ** 2, 0) / wr.length);
// 每个格子 N 场，95% 误差大约 ±1/√N
const ci = n => 1.96 * Math.sqrt(0.25 / n);

function matrixMd(m) {
  const cell = v => { const p = Math.round(v * 100); return p >= 65 ? `**${p}**` : p <= 35 ? `_${p}_` : `${p}`; };
  let s = '| 行打列 | ' + NAMES.join(' | ') + ' |\n|' + ' :-- |'.repeat(H + 1) + '\n';
  m.mu.forEach((row, i) => { s += `| **${NAMES[i]}** | ` + row.map((v, j) => i === j ? '—' : cell(v)).join(' | ') + ' |\n'; });
  return s;
}
function worstMd(m, k = 10) {
  const list = [];
  for (let i = 0; i < H; i++) for (let j = i + 1; j < H; j++) { const v = (m.mu[i][j] + 1 - m.mu[j][i]) / 2; list.push([Math.abs(v - 0.5), i, j, v]); }
  list.sort((x, y) => y[0] - x[0]);
  return list.slice(0, k).map(([, i, j, v]) => v >= 0.5 ? `- ${NAMES[i]} 克 ${NAMES[j]}：${pct(v)}` : `- ${NAMES[j]} 克 ${NAMES[i]}：${pct(1 - v)}`).join('\n');
}

const LVZH = { easy: '入门', normal: '寻常', hard: '劲敌', impossible: '绝顶', god: '天道' }, lvName = l => LVZH[l] || l;
function report(base, rounds, final, check) {
  const order = HEROES.map((_, i) => i).sort((a, b) => base.wr[b] - base.wr[a]);
  const f = final || base, [lo0, hi0] = spread(base.wr), [lo1, hi1] = spread(f.wr);
  let md = `# Trainer：天道互打胜率与平衡建议\n\n`;
  md += `> 由 \`node tools/trainer.mjs --n ${N}${ROUNDS ? ' --rounds ' + ROUNDS : ''}${LEVELS.join() !== 'god' ? ' --level ' + LEVELS.join() : ''}\` 自动生成（${new Date().toISOString().slice(0, 10)}）。双方同一难度（${LEVELS.map(lvName).join('、')}${LEVELS.length > 1 ? '，各打一遍，胜率取平均' : ''}），同一套打法基因（models/ai-brain.json）。`;
  md += `每个难度每对角色 ${N} 场（左右各半，固定种子可复现），镜像不打，共 ${base.games} 场三局两胜；每个对位格子的 95% 误差约 ±${(ci(N) * 100).toFixed(0)} 个百分点，每个角色总胜率约 ±${(ci(N * (H - 1) * LEVELS.length) * 100).toFixed(1)}。\n\n`;
  md += `> 平衡建议**没有**改进游戏，只在 \`docs/trainer/proposal.json\` 里。要试玩，按下面「怎么用这份建议」操作。\n\n`;
  md += `## 1. 当前数值下各角色胜率\n\n平均每场 ${base.avgSec.toFixed(0)} 秒（游戏内时间），平局 ${base.draws} 场，左边先手方赢 ${pct(base.leftWinRate)}。\n\n`;
  const multi = LEVELS.length > 1, lvCols = m => multi ? LEVELS.map((_, li) => ` ${pct(m.byLevel[li][0])} |`) : [];
  const lvHead = (t) => multi ? LEVELS.map(l => ` ${t}${lvName(l)} |`).join('') : '';
  md += `| 排名 | 角色 | 当前胜率 |${lvHead('当前·')}${final ? ' 建议数值后 |' + lvHead('建议后·') + (check ? ' 换种子复核 |' : '') + ' 建议倍率（伤害=气血） |' : ''}\n|` + ' :-- |'.repeat(3 + (multi ? LEVELS.length : 0) + (final ? 2 + (multi ? LEVELS.length : 0) + (check ? 1 : 0) : 0)) + '\n';
  const lvOf = (m, i) => multi ? LEVELS.map((_, li) => ` ${pct(m.byLevel[li][i])} |`).join('') : '';
  order.forEach((i, r) => {
    const id = HEROES[i], fb = final && final.bal[id], fx = fb ? fb.hp / (BASE[id].hp || 1) : 1;
    md += `| ${r + 1} | ${NAMES[i]} (\`${id}\`) | ${pct(base.wr[i])} |${lvOf(base, i)}${final ? ` ${pct(final.wr[i])} |${lvOf(final, i)}${check ? ` ${pct(check.wr[i])} |` : ''} ×${fx.toFixed(3)} ${fx > 1.005 ? '加强' : fx < 0.995 ? '削弱' : '不变'} |` : ''}\n`;
  });
  md += `\n胜率范围 ${pct(lo0)} ~ ${pct(hi0)}（离 50% 的均方差 ${pct(sd(base.wr))}）`;
  if (final) md += `；按建议改完 ${pct(lo1)} ~ ${pct(hi1)}（均方差 ${pct(sd(final.wr))}）`;
  if (check) { const [a, b] = spread(check.wr); md += `；换一组随机种子复核建议数值 ${pct(a)} ~ ${pct(b)}（均方差 ${pct(sd(check.wr))}，这是没参与调整的新对局，比上一个数更可信）`; }
  md += `。\n\n## 2. 对位胜率（当前数值，行角色打列角色的胜率 %，≥65 加粗，≤35 斜体）\n\n` + matrixMd(base);
  md += `\n### 最一边倒的对位\n\n` + worstMd(base) + '\n';
  if (rounds.length) {
    md += `\n## 3. 平衡迭代过程\n\n每轮：胜率每高出 50% 一个百分点，这个角色的伤害和气血就一起乘 (1 − ${STEP / 100})（第 r 轮再乘 ${DECAY}^(r−1)，越往后改得越细，免得来回摆），单轮最多 ±${MAXSTEP * 100}%，总倍率限制在 ${LO}~${HI}。伤害和气血一起动，招式手感、连段和出招速度都不变，只改“打多疼、多耐打”。\n\n`;
    md += `| 轮 | 胜率范围 | 均方差 |\n| :-- | :-- | :-- |\n| 0（当前） | ${pct(lo0)} ~ ${pct(hi0)} | ${pct(sd(base.wr))} |\n`;
    rounds.forEach((m, k) => { const [a, b] = spread(m.wr); md += `| ${k + 1} | ${pct(a)} ~ ${pct(b)} | ${pct(sd(m.wr))} |\n`; });
    if (final) md += `\n### 按建议改完后的对位胜率\n\n` + matrixMd(final) + `\n### 改完后仍然最一边倒的对位\n\n` + worstMd(final) + '\n';
  }
  md += `\n## ${rounds.length ? 4 : 3}. 怎么用这份建议\n\n只在本地试，不影响游戏：\n\n`;
  md += '```bash\nAI_BAL=docs/trainer/proposal.json node tools/ai-arena.mjs --a god --b god --n 10\nAI_BAL=docs/trainer/proposal.json node tools/ai-arena.mjs --a hard --b hard --n 10\n```\n\n';
  md += `确定要用，就把 \`docs/trainer/proposal.json\` 里每个角色的 normal / skill / ult / hp 抄进 \`src/data/heroes/\` 里各自文件的 \`bal\`，再运行 \`python3 tools/build.py\` 重新生成页面。\n\n`;
  md += `注意：这是电脑对电脑的结果，AI 打法和真人不一样（比如 AI 招架反应很快），真人对战的强弱可能不同；数值建议适合当参考起点，最好再结合玩家反馈。\n`;
  return md;
}

let bal = arg('bal') ? JSON.parse(readFileSync(ROOT + arg('bal'), 'utf8')) : JSON.parse(JSON.stringify(BASE));
for (const id of HEROES) bal[id] = { ...BASE[id], ...(bal[id] || {}) };
const base = await measure(bal, 'base');
const rounds = []; let cur = base, final = null;
for (let r = 1; r <= ROUNDS; r++) {
  bal = adjust(bal, cur.wr, r);
  cur = await measure(bal, 'r' + r);
  rounds.push(cur);
}
if (ROUNDS) {
  // 最终建议：取胜率最平均（均方差最小）的那一轮的数值
  final = rounds.reduce((a, b) => sd(b.wr) < sd(a.wr) ? b : a);
  writeFileSync(OUT + 'proposal.json', JSON.stringify(final.bal, null, 2) + '\n');
}
// 复核：建议数值在一组没用来调整的新种子上再测一次（选“最平均的一轮”本身会挑到运气好的那组对局）
const check = final && arg('check', '1') !== '0' ? await measure(final.bal, 'check', SEED + 1000) : null;
const strip = m => m && { ...m, wr: m.wr.map(v => +v.toFixed(4)), mu: m.mu.map(r => r.map(v => +v.toFixed(4))) };
writeFileSync(OUT + 'results.json', JSON.stringify({ heroes: HEROES, names: NAMES, n: N, level: LEVEL, seed: SEED, base: strip(base), rounds: rounds.map(strip), final: final && final.tag, check: strip(check) }, null, 1) + '\n');
writeFileSync(OUT + 'report.md', report(base, rounds, final, check));
console.log('写好了 ' + OUT + 'report.md');
