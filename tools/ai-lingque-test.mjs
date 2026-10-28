#!/usr/bin/env node
// 凌雀 AI 测试：连段路线（飞梭挂印记 → 换影引爆 → 追击 / 大招续印记）按难度分得开。
//   node tools/ai-lingque-test.mjs            情景检查 + 每个难度对打统计
//   node tools/ai-lingque-test.mjs --n 4      每个难度每个对手打 4 场（默认 4：气血放大后低难度胜率接近 0，2 场样本太小会排不出先后）
import { makeEnv, HEROES } from './ai-arena.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +arg('n', 4), LQ = HEROES.indexOf('lingque'), OPP = HEROES.indexOf('qingfeng');
const env = await makeEnv();
let fails = 0;
const check = (ok, name, info = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); if (!ok) fails++; };

// ---------- 情景：摆好局面，让凌雀的大脑想一帧，看它按了什么 ----------
function scene(level, setup) {
  env.seed(7);
  env.startMatch('cpu', 'normal', [LQ, OPP], true);
  env.A.ctrl = new env.AICtrl(level); env.B.ctrl = new env.AICtrl(level);
  env.run('M.phase = "fight"; M.timer = 99;');
  const A = env.A, B = env.B, br = A.ctrl.brain;
  A.x = 600; B.x = 900; A.y = B.y = 0; A.vx = A.vy = B.vx = B.vy = 0;
  A.state = 'idle'; A.t = 1; A.skillCD = 0; A.skill2CD = 0; A.meter = 0; A.breakCD = 0; A.invul = 0;
  B.state = 'idle'; B.t = 1; B.needleMark = 0; B.breakCD = 0; B.invul = 0;
  setup(A, B, br);
  br.ev = B.state + ':'; br.evT = -10; br.next = 0; br.lqNext = 0;   // 已经看清对手在干什么
  const pressed = [];
  const orig = br.press.bind(br); br.press = (a, why) => { pressed.push(a); orig(a, why); };
  br.think(A, B);
  return pressed;
}
console.log('情景检查');
// 对手带印记、正在挨打（闪不了）：寻常以上都会换影引爆，入门不刻意打
for (const lv of ['normal', 'hard', 'impossible', 'god']) {
  let hit = 0;
  for (let k = 0; k < 20; k++) if (scene(lv, (A, B) => { B.state = 'hitstun'; B.stun = 0.6; B.needleMark = 3; }).includes('skill2')) hit++;
  check(hit >= 10, `${lv}：带印记、对手挨打时换影引爆`, `${hit}/20`);
}
{
  let hit = 0;
  for (let k = 0; k < 20; k++) if (scene('easy', (A, B) => { B.state = 'hitstun'; B.stun = 0.6; B.needleMark = 3; }).includes('skill2')) hit++;
  check(hit <= 12, 'easy：不会专门找引爆时机（交给通用打法）', `${hit}/20`);
}
// 对手站着、腾空闪还在、印记还长：劲敌以上先不放（等对手交闪），寻常照放
{
  const waitHard = scene('god', (A, B) => { B.needleMark = 3.2; B.breakCD = 0; }).includes('skill2');
  check(!waitHard, 'god：对手留着腾空闪时不急着放换影');
  let n = 0;
  for (let k = 0; k < 20; k++) if (scene('normal', (A, B) => { B.needleMark = 3.2; B.breakCD = 0; }).includes('skill2')) n++;
  check(n >= 8, 'normal：有印记就放（不会等闪）', `${n}/20`);
  const hurry = scene('god', (A, B) => { B.needleMark = 0.5; B.breakCD = 0; }).includes('skill2');
  check(hurry, 'god：印记快没了就不等，直接引爆');
}
// 刚引爆、对手被挑飞、换影已清零：有满气的绝顶 / 天道放大招续印记，劲敌直接换影追击，寻常不追
{
  const setup = (A, B, br) => { B.state = 'launched'; B.y = -120; B.vy = -300; br.lqBurst = 1e-9; A.meter = 100; };
  const g = []; for (let k = 0; k < 10; k++) g.push(scene('god', (A, B, br) => { setup(A, B, br); br.lqBurst = env.clock - 0.1; }));
  check(g.filter(p => p.includes('special')).length >= 8, 'god：引爆挑飞后用大招续印记', `${g.filter(p => p.includes('special')).length}/10`);
  const h = []; for (let k = 0; k < 10; k++) h.push(scene('hard', (A, B, br) => { setup(A, B, br); br.lqBurst = env.clock - 0.1; }));
  check(h.filter(p => p.includes('special')).length === 0 && h.filter(p => p.includes('skill2')).length >= 5, 'hard：引爆后换影追击、不会续大招', `追击 ${h.filter(p => p.includes('skill2')).length}/10`);
  const nm = []; for (let k = 0; k < 10; k++) nm.push(scene('normal', (A, B, br) => { setup(A, B, br); br.lqBurst = env.clock - 0.1; }));
  check(nm.filter(p => p.includes('skill2') || p.includes('special')).length === 0, 'normal：引爆后不会接追击');
}
// 没印记、对手站着不挡：去扔飞梭挂印记；对手在格挡就不扔
{
  let q = 0; for (let k = 0; k < 20; k++) if (scene('god', () => {}).includes('skill')) q++;
  check(q >= 15, 'god：没印记时扔飞梭挂印记', `${q}/20`);
  let qb = 0; for (let k = 0; k < 20; k++) if (scene('god', (A, B) => { B.state = 'block'; }).includes('skill')) qb++;
  check(qb === 0, 'god：对手在格挡时不扔飞梭', `${qb}/20`);
}

// ---------- 对打统计：每个难度的凌雀打劲敌难度的所有角色（对手固定，只比凌雀自己），数引爆次数和胜率 ----------
console.log('\n对打统计（凌雀对劲敌难度的每个角色各 ' + N + ' 场）');
const stats = {};
let seed = 900;
for (const lv of ['easy', 'normal', 'hard', 'impossible', 'god']) {
  let det = 0, chain = 0, ultX = 0, wins = 0, games = 0;
  for (let o = 0; o < HEROES.length; o++) {
    if (o === LQ) continue;
    for (let k = 0; k < N; k++) {
      const flip = k % 2;
      env.seed(seed++);
      env.startMatch('cpu', 'normal', flip ? [o, LQ] : [LQ, o], true);
      (flip ? env.B : env.A).ctrl = new env.AICtrl(lv); (flip ? env.A : env.B).ctrl = new env.AICtrl('hard');
      const me = flip ? env.B : env.A, br = me.ctrl.brain; br.debug = [];
      let s = 0, prevCD = 0, lastDet = -9;
      while (env.M.phase !== 'end' && s < 120 * 60 * 6) {
        env.step(); s++;
        // 换影冷却在放换影的途中被清零 = 这一下引爆了印记
        if (me.state === 'skill' && me.skill === 'shadowdash' && prevCD > 0 && me.skill2CD === 0) { det++; if (env.clock - lastDet < 4) chain++; lastDet = env.clock; }
        prevCD = me.skill2CD;
      }
      ultX += br.debug.filter(([, a, why]) => a === 'special' && why === 'lingque').length;   // 引爆后用大招续印记
      const [w0, w1] = env.M.wins; wins += (flip ? w1 > w0 : w0 > w1) ? 1 : 0; games++;
    }
  }
  stats[lv] = { det: det / games, chain: chain / games, ultX: ultX / games, wr: wins / games };
  console.log(`  ${lv.padEnd(10)} 每场引爆 ${stats[lv].det.toFixed(2)} 次，4 秒内连续引爆 ${stats[lv].chain.toFixed(2)} 次，引爆后大招续印记 ${stats[lv].ultX.toFixed(2)} 次，胜率 ${(stats[lv].wr * 100).toFixed(0)}%`);
}
check(stats.god.det > stats.easy.det && stats.hard.det > stats.easy.det, '引爆次数：劲敌、天道都比入门多');
check(stats.god.wr > stats.normal.wr && stats.normal.wr > stats.easy.wr, '胜率随难度上升（入门 < 寻常 < 天道）');
check(stats.god.ultX > 0 && stats.hard.ultX === 0 && stats.normal.ultX === 0, '只有绝顶 / 天道会用大招续第二轮印记');
console.log(fails ? `\nFAIL: ${fails} 项没通过` : '\nPASS: 凌雀 AI 检查全部通过');
process.exit(fails ? 1 : 0);
