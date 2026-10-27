#!/usr/bin/env node
// Trainer 诊断：一个角色对其他所有角色打一批，统计伤害从哪来（哪一招打出多少）、挨打时自己在干什么。
// 用来找 AI 的毛病：某一招占了大半伤害、挨打时大多在“走路/发呆”而不是格挡，多半是对面的 AI 不会应对这一招。
//   node tools/trainer-why.mjs --hero moyu --n 10 --level god,hard
import { makeEnv, HEROES, NAMES } from './ai-arena.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const HERO = HEROES.indexOf(arg('hero', 'moyu')), N = +arg('n', 10), LEVELS = arg('level', 'god,hard').split(',');
if (HERO < 0) { console.error('没有这个角色：' + arg('hero')); process.exit(1); }
const env = await makeEnv();
// 记账：每次真的掉血，按“谁打的 / 哪一招 / 挨打的人当时在干什么”记下来
env.window.__log = [];
env.run(`(() => { const orig = applyHit; applyHit = function (att, def, m, pt) {
  const hp0 = def.hp, st = def.state, src = m.isProj ? 'proj:' + (m.kind || '?') : m.ult ? 'ult:' + att.ch.ult : att.state === 'skill' ? 'skill:' + att.skill : att.state === 'attack' ? 'atk:' + att.moveName : att.state === 'special' ? 'ult:' + att.ch.ult : att.state;
  const r = orig.apply(this, arguments);
  if (def.hp < hp0) window.__log.push({ a: att.ch.id, d: def.ch.id, src, st, dmg: hp0 - Math.max(0, def.hp) });
  return r; }; })();`);

const dealt = {}, taken = {}, takenSt = {}, perOpp = {}, dealtSt = {};
let wins = 0, games = 0;
const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
let seed = 5000;
for (const lv of LEVELS) for (let o = 0; o < HEROES.length; o++) {
  if (o === HERO) continue;
  for (let k = 0; k < N; k++) {
    const flip = k % 2, ha = flip ? o : HERO, hb = flip ? HERO : o;
    env.seed(seed++);
    env.startMatch('cpu', 'normal', [ha, hb], true);
    env.A.ctrl = new env.AICtrl(lv); env.B.ctrl = new env.AICtrl(lv);
    env.window.__log.length = 0;
    let steps = 0;
    while (env.M.phase !== 'end' && steps < 120 * 60 * 6) { env.step(); steps++; }
    const [w0, w1] = env.M.wins, won = flip ? w1 > w0 : w0 > w1;
    wins += won ? 1 : 0; games++;
    const po = perOpp[o] = perOpp[o] || { w: 0, n: 0 }; po.n++; po.w += won ? 1 : 0;
    const me = HEROES[HERO];
    for (const e of env.window.__log) {
      if (e.a === me && e.d !== me) { add(dealt, e.src, e.dmg); add(dealtSt[e.src] = dealtSt[e.src] || {}, e.st, e.dmg); }
      else if (e.d === me) { add(taken, NAMES[HEROES.indexOf(e.a)] + ' ' + e.src, e.dmg); add(takenSt, e.st, e.dmg); }
    }
  }
}
const tot = o => Object.values(o).reduce((a, b) => a + b, 0);
const show = (title, o, k = 12) => {
  const t = tot(o); console.log(`\n${title}（共 ${t.toFixed(0)}，每场 ${(t / games).toFixed(0)}）`);
  Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).forEach(([s, v]) => console.log(`  ${(v / t * 100).toFixed(1).padStart(5)}%  ${s}`));
};
console.log(`${NAMES[HERO]}：${games} 场（${LEVELS.join('、')}），胜率 ${(wins / games * 100).toFixed(1)}%`);
console.log('  对各角色：' + Object.entries(perOpp).map(([o, p]) => `${NAMES[o]}${Math.round(p.w / p.n * 100)}`).join(' '));
show(`${NAMES[HERO]} 打出的伤害来自`, dealt);
show(`${NAMES[HERO]} 挨的伤害来自`, taken);
show(`${NAMES[HERO]} 挨打时自己的状态`, takenSt, 8);
// 主要伤害来源打中对手时，对手在干什么（走路/发呆被打中多，说明对手 AI 不会躲或挡这一招）
console.log(`\n${NAMES[HERO]} 前 5 个伤害来源打中时，对手的状态`);
Object.entries(dealt).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([s]) => {
  const o = dealtSt[s], t = tot(o);
  console.log(`  ${s}：` + Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${(v / t * 100).toFixed(0)}%`).join('，'));
});
