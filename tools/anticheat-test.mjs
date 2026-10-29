#!/usr/bin/env node
// 反作弊“改伤害”这一条的测试（src/anticheat.js 的 acCheckHit / acTableSig）：
//   有秘卷的模式里正常叠满秘卷不能记过（以前上限不算秘卷，爬塔后期一下打出招式的一两百倍，误封过人）；
//   改了招式表、改了身上的计数照样记过。
//   node tools/anticheat-test.mjs
import { readFileSync } from 'node:fs';
import { makeEnv, HEROES } from './ai-arena.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
let fails = 0;
const check = (ok, name, info = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); if (!ok) fails++; };

async function env0(seed = 3) {
  const env = await makeEnv(); env.seed(seed);
  // 反作弊脚本接在游戏后面跑（网页里也是这个顺序）；记过只数次数，不真的弹窗、退回大厅
  env.run(readFileSync(ROOT + 'src/anticheat.js', 'utf8').replace("'use strict';", ''));
  env.run(`ACH.test = true; ACH.strikes = []; acStrike = r => { ACH.strikes.push(r); ACH.hits = 0; };`);
  return env;
}

// 1. 每一卷秘卷在最极端的战况下真打出来的倍数，都不超过反作弊从它代码里读出来的上限
{
  const env = await env0();
  const r = JSON.parse(env.run(`(() => {
    startTower(0, true); M.phase = 'fight';
    const bad = [];
    const ctxs = [];
    for (const proj of [false, true]) for (const ult of [false, true]) for (const skill of [false, true]) for (const light of [false, true]) for (const heavy of [false, true])
      for (const counter of [false, true]) for (const air of [false, true]) for (const low of [false, true]) ctxs.push({ proj, ult, skill, light, heavy, counter, air, low });
    const real = Math.random;   // 秘卷的几率（scRnd）单机时读 Math.random
    for (const s of SCROLLS.concat(BOSS_AFFIXES)) {
      if (!s.out) continue;
      const cap = acScOut(s);
      for (const roll of [0, 0.99]) for (const x of ctxs) {
        Math.random = () => roll;
        const f = A, o = B;
        f.sc = { fb: 0, sunder: 10, hunt: 20, crit: 1, ask: 1, linked: 1, wrT: 1, esT: 1, revT: 1, amb: 1, lastHit: clock - 0.5, lastK: x.light ? 'h' : 'l', opened: 0, lc: 0, markN: 0 };
        f.meter = 100; f.hp = x.low ? 1 : f.maxHp; f.maxHp = f.maxHp; f.vx = 5000; f.y = x.air ? -100 : 0; f.sinceHit = 99; f.ink = 100;
        o.hp = x.low ? 1 : o.maxHp; o.comboHits = 99; o.juggle = 99; o.face = Math.sign(o.x - f.x) || 1; o.meter = 100; o.state = x.air ? 'launched' : 'hitstun';
        o.rooted = true; o.frostSlow = 1; o.burnT = 1; o.bleedTicks = 3; o.sinceBlock = 0.5; o.hookedT = 1; o.x = STAGE_W - 50; f.x = o.x - 500;
        f.st = {}; o.st = { mark: 1 }; M.timer = 5; M.towerFloor = 1;
        const c = { f, o, m: { kb: [100, -100] }, ev: {}, dmg: 100, counter: x.counter, proj: x.proj, ult: x.ult, skill: x.skill, src: 'whirl', light: x.light, heavy: x.heavy, air: x.air };
        s.out(c);
        if (c.dmg / 100 > cap + 1e-9) { bad.push(s.id + ' ×' + (c.dmg / 100).toFixed(2) + ' > ' + cap); break; }
      }
    }
    Math.random = real;
    return JSON.stringify({ bad, n: SCROLLS.concat(BOSS_AFFIXES).filter(s => s.out).length });
  })()`));
  check(!r.bad.length, `反作弊读出的单卷增伤上限盖得住 ${r.n} 卷秘卷在极端战况下的真实倍数`, r.bad.join('，'));
}

// 2. 爬塔里叠满秘卷，天道电脑打几分钟：一下打出招式的上百倍也不记过；以前的规则（招式伤害 ×12）会记过
const ALL = `SCROLLS.filter(s => !s.h && s.out).map(s => s.id)`;
for (const [hero, seed] of [['qingfeng', 3], ['moyu', 9], ['liying', 5]]) {
  const env = await env0(seed);
  const r = JSON.parse(env.run(`(() => {
    const s0 = acTableSig();
    startTower(CHARS.findIndex(c => c.id === '${hero}'), true);
    M.towerPerks = ${ALL}; for (const f of allFighters()) f.sc = null;
    scRoundStart(); B.maxHp *= 100; B.hp = B.maxHp;
    let worst = 0, oldRule = 0;
    const orig = applyHit;
    applyHit = function (att, def, m) { const b = def && def.hp, r = orig.apply(this, arguments);
      if (att === A && typeof b === 'number') { const d = b - def.hp, base = m.dmgAbs !== undefined ? m.dmgAbs : (m.dmg || 0); worst = Math.max(worst, d / Math.max(base, 20)); if (d > 150 && d > Math.max(base, 20) * 12) oldRule++; }
      return r; };
    for (let i = 0; i < 120 * 150 && M.phase !== 'end'; i++) { step(); A.hp = Math.max(A.hp, A.maxHp * 0.5); }
    applyHit = orig;
    return JSON.stringify({ perks: M.towerPerks.length, strikes: ACH.strikes, worst: Math.round(worst), oldRule, sig: acTableSig() === s0 });
  })()`));
  check(!r.strikes.length && r.worst > 12 && r.oldRule >= 2 && r.sig,
    `${hero} 爬塔带 ${r.perks} 卷秘卷：最大一下是招式伤害的 ${r.worst} 倍，旧规则会判 ${r.oldRule} 次超限，现在不记过；数值表签名没变`, JSON.stringify(r));
}

// 3. 真改伤害的照样拦得住
{
  // 秘卷之外凭空多出来的倍数：带着破甲等 8 卷（爬塔中段的量），把破甲层数从最多 10 层改成 10 万层。
  // 秘卷叠得越多上限越宽，几十卷时这种改法就藏得住了：本机这层只管不误封，真正的账在服务器上
  const env = await env0(4);
  const r = JSON.parse(env.run(`(() => {
    startTower(0, true); M.towerPerks = ['sunder', 'crit_eye', 'first_blood', 'backstab', 'opener', 'crescendo', 'glass_cannon', 'executioner']; for (const f of allFighters()) f.sc = null; scRoundStart(); B.maxHp *= 1000; B.hp = B.maxHp;
    for (let i = 0; i < 120 * 60 && ACH.strikes.length === 0 && M.phase !== 'end'; i++) { A.sc.sunder = 1e5; step(); A.hp = Math.max(A.hp, A.maxHp * 0.5); }
    return JSON.stringify({ strikes: ACH.strikes });
  })()`));
  check(r.strikes.length >= 1 && /远超招式上限/.test(r.strikes[0]), '带 8 卷秘卷时把破甲层数改大：一下的伤害超出秘卷能给的上限，记过', JSON.stringify(r));
}
{
  // 没有秘卷的普通对局：醉翁的醉意改成 10 万
  const env = await env0(6);
  const r = JSON.parse(env.run(`(() => {
    const Z = CHARS.findIndex(c => c.id === 'zuixian');
    startMatch('cpu', 'hard', [Z, 0], true); showScreen(null); paused = false; M.phase = 'fight'; B.maxHp *= 1000; B.hp = B.maxHp;
    for (let i = 0; i < 120 * 60 && ACH.strikes.length === 0 && M.phase !== 'end'; i++) { A.drunk = 1e5; step(); A.hp = A.maxHp; }
    return JSON.stringify({ strikes: ACH.strikes });
  })()`));
  check(r.strikes.length >= 1 && /远超招式上限/.test(r.strikes[0]), '普通对局把醉意改到 10 万：一下打出的伤害超限，记过', JSON.stringify(r));
}
{
  // 改招式表：普攻伤害 ×10，三秒一次的数值表检查发现被改过（哪个模式、带不带秘卷都一样）
  const env = await env0(7);
  const r = JSON.parse(env.run(`(() => {
    startTower(0, true); M.towerPerks = ${ALL}; scRoundStart();
    acCodeTick(); const clean = ACH.strikes.length;
    for (const o of CHAR_MOVES) for (const k of Object.keys(o)) if (o[k].dmg) o[k].dmg *= 10;
    acCodeTick();
    return JSON.stringify({ clean, strikes: ACH.strikes });
  })()`));
  check(r.clean === 0 && r.strikes.length === 1 && /招式伤害数值被篡改/.test(r.strikes[0]), '叠满秘卷时数值表检查不误报；改了招式伤害立刻记过', JSON.stringify(r));
}

if (fails) { console.error(`\nFAIL: ${fails} 项反作弊检查没过`); process.exit(1); }
console.log('\nPASS: 反作弊“改伤害”检查全部通过');
