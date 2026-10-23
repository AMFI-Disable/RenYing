#!/usr/bin/env node
// 天道训练：自我对弈调打法基因（AI 训练 AI）。
// 一局胜负的随机性很大，单个基因对胜率的影响通常只有几个百分点，所以每次比较都用几百上千场、
// 同一组随机种子（对局条件相同），并且要复核通过才接受。分两段：
//   1. 共用段（--stage global）：一组基因所有角色共用。候选和现任冠军用全部 12 个角色对打（左右各半），
//      数据量是单个角色的 12 倍，先把大方向（主动程度、蓄力多少、骗闪……）定下来。
//   2. 角色段（--stage hero）：每个角色在共用结果上单独微调。候选用这个角色、对手是全部 12 个角色的现任冠军，
//      和“冠军用这个角色”在同一批种子上比。
// 搜索方法：逐个基因往上、往下各试一步；变好了（且复核通过）就留下并保持步长，否则步长减半。
//   node tools/ai-train.mjs --stage global --sweeps 2
//   node tools/ai-train.mjs --stage hero --sweeps 1 --heroes qingfeng,feiying --genes aggr,charge
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import { Pool, HEROES, NAMES, score } from './ai-arena.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const BRAIN = ROOT + 'models/ai-brain.json';
const LOG = ROOT + 'models/ai-train-log.txt';
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const STAGE = arg('stage', 'global'), SWEEPS = +arg('sweeps', 2), LEVEL = arg('level', 'god');
const ONLY = arg('heroes') ? arg('heroes').split(',') : HEROES;
// 每次比较的场数（每对角色左右各 REP 场）与接受门槛（胜率差）
const REP = +arg('rep', STAGE === 'global' ? 4 : 12), GAIN = +arg('gain', STAGE === 'global' ? 0.02 : 0.03);

// 基因的取值范围（和 src/ai.js 的 AI_GENE_DEF 一致）
const src = readFileSync(ROOT + 'src/ai.js', 'utf8'), i0 = src.indexOf('const AI_GENE_DEF = {');
const DEF = Function('"use strict";return (' + src.slice(i0 + 'const AI_GENE_DEF = '.length, src.indexOf('};', i0) + 1) + ')')();
const KEYS = arg('genes') ? arg('genes').split(',') : Object.keys(DEF);
const brain = existsSync(BRAIN) ? JSON.parse(readFileSync(BRAIN, 'utf8')) : {};
const champ = {};
for (const h of HEROES) { champ[h] = {}; for (const k of Object.keys(DEF)) champ[h][k] = brain.genes && brain.genes[h] && brain.genes[h][k] !== undefined ? brain.genes[h][k] : DEF[k][2]; }
const save = () => { brain.genes = champ; brain.trainedAt = new Date().toISOString(); brain.level = LEVEL; delete brain.sigma; writeFileSync(BRAIN, JSON.stringify(brain)); };
const log = line => { console.log(line); appendFileSync(LOG, line + '\n'); };
const pool = new Pool(os.cpus().length);
const lv = genes => ({ base: LEVEL, genes });
const clampG = (k, v) => Math.round(Math.min(DEF[k][1], Math.max(DEF[k][0], v)) * 1000) / 1000;
let seedBase = +arg('seed', 1);

// 共用段：候选基因给所有角色，对现任冠军（各角色自己的冠军基因），每对角色左右各半共 rep 场 → 候选方胜率
async function evalGlobal(k, v, rep) {
  const g = [], s0 = (seedBase += 100000);
  for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) for (let r = 0; r < rep; r++) {
    const ca = lv({ ...champ[HEROES[a]], [k]: v }), cb = lv(champ[HEROES[b]]), s = s0 + a * 1000 + b * 20 + r;
    g.push(r % 2 ? { a: b, b: a, la: cb, lb: ca, flip: 1, seed: s } : { a, b, la: ca, lb: cb, flip: 0, seed: s });
  }
  return score(await pool.run(g));
}
// 角色段：这个角色用 genes，对全部 12 个角色的冠军，左右各 rep 场；同一批种子
function heroGames(hi, genes, rep, s0) {
  const g = [];
  for (let o = 0; o < 12; o++) for (let r = 0; r < rep; r++) {
    const s = s0 + o * 100 + r * 2;
    g.push({ a: hi, b: o, la: lv(genes), lb: lv(champ[HEROES[o]]), flip: 0, seed: s });
    g.push({ a: o, b: hi, la: lv(champ[HEROES[o]]), lb: lv(genes), flip: 1, seed: s + 1 });
  }
  return g;
}
async function evalHeroPair(hi, cand, rep) {   // 返回 [候选胜率, 冠军胜率]，同一批种子
  const s0 = (seedBase += 100000);
  const [rc, rb] = await Promise.all([pool.run(heroGames(hi, cand, rep, s0)), pool.run(heroGames(hi, champ[HEROES[hi]], rep, s0))]);
  return [score(rc), score(rb)];
}

log(`\n== 训练 ${new Date().toISOString()}  阶段 ${STAGE}  轮数 ${SWEEPS}  每次 ${STAGE === 'global' ? 144 * REP : 24 * REP} 场  门槛 +${(GAIN * 100).toFixed(1)}% ==`);
const step = {}; for (const k of KEYS) step[k] = (DEF[k][1] - DEF[k][0]) * 0.25;
for (let sw = 1; sw <= SWEEPS; sw++) {
  for (const k of KEYS) {
    const t0 = Date.now();
    if (STAGE === 'global') {
      const cur = champ[HEROES[0]][k];
      let took = null;
      for (const dir of [1, -1]) {
        const v = clampG(k, cur + dir * step[k]);
        if (v === cur) continue;
        const w = await evalGlobal(k, v, REP);
        if (w < 0.5 + GAIN) { log(`  ${k} ${cur}→${v}  ${(w * 100).toFixed(1)}%  不要`); continue; }
        const w2 = await evalGlobal(k, v, REP);   // 复核：新种子再打一遍
        const ok = (w + w2) / 2 >= 0.5 + GAIN * 0.75;
        log(`  ${k} ${cur}→${v}  ${(w * 100).toFixed(1)}% 复核 ${(w2 * 100).toFixed(1)}%  ${ok ? '接受' : '不要'}`);
        if (ok) { took = v; break; }
      }
      if (took !== null) { for (const h of HEROES) champ[h][k] = took; save(); } else step[k] /= 2;
      log(`第 ${sw} 轮 ${k}（${((Date.now() - t0) / 1000).toFixed(0)} 秒）= ${champ[HEROES[0]][k]}`);
    } else {
      const lines = [];
      for (const h of ONLY) {
        const hi = HEROES.indexOf(h), cur = champ[h][k];
        let took = null;
        for (const dir of [1, -1]) {
          const v = clampG(k, cur + dir * step[k]);
          if (v === cur) continue;
          const cand = { ...champ[h], [k]: v };
          const [wc, wb] = await evalHeroPair(hi, cand, REP);
          if (wc - wb < GAIN) continue;
          const [wc2, wb2] = await evalHeroPair(hi, cand, REP);   // 复核
          if ((wc - wb + wc2 - wb2) / 2 >= GAIN * 0.75) { took = { v, d: (wc - wb + wc2 - wb2) / 2 }; break; }
        }
        if (took) { champ[h][k] = took.v; save(); lines.push(`${NAMES[hi]} ${cur}→${took.v}(+${(took.d * 100).toFixed(1)}%)`); }
      }
      if (!lines.length) step[k] /= 2;
      log(`第 ${sw} 轮 ${k}（${((Date.now() - t0) / 1000).toFixed(0)} 秒）${lines.length ? lines.join('  ') : '没有角色变'}`);
    }
  }
}
save();
pool.close();
log('训练结束，基因已写入 models/ai-brain.json');
