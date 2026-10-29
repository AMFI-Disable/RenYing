#!/usr/bin/env node
// 反作弊“改伤害”这一条的测试（src/anticheat.js 的 acCheckHit / acTableSig / acCodeTick）：
//   单下伤害超限只记录、不记过（以前记过，秘卷、模式一叠误封过人）：正常叠满秘卷连记录都不该有，改了身上的计数要留下记录；
//   改了招式表、换了伤害函数照样记过。
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
  env.run(`ACH.test = true; ACH.strikes = []; acStrike = r => { ACH.strikes.push(r); };
    ACH.reported = []; window.ERR = { report: (e, x) => { ACH.reported.push([e.message, x]); return true; } };`);
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
    return JSON.stringify({ perks: M.towerPerks.length, strikes: ACH.strikes, sus: (ACH.suspect || []).length, worst: Math.round(worst), oldRule, sig: acTableSig() === s0 });
  })()`));
  check(!r.strikes.length && !r.sus && r.worst > 12 && r.oldRule >= 2 && r.sig,
    `${hero} 爬塔带 ${r.perks} 卷秘卷：最大一下是招式伤害的 ${r.worst} 倍，旧规则会判 ${r.oldRule} 次超限，现在不记过也不留可疑记录；数值表签名没变`, JSON.stringify(r));
}

// 3. 真改伤害的：改身上计数的留下可疑记录（不记过）；改表、换函数的记过
{
  // 秘卷之外凭空多出来的倍数：带着破甲等 8 卷（爬塔中段的量），把破甲层数从最多 10 层改成 10 万层。
  // 秘卷叠得越多上限越宽，几十卷时这种改法就藏得住了：本机这层只管不误封，真正的账在服务器上
  const env = await env0(4);
  const r = JSON.parse(env.run(`(() => {
    startTower(0, true); M.towerPerks = ['sunder', 'crit_eye', 'first_blood', 'backstab', 'opener', 'crescendo', 'glass_cannon', 'executioner']; for (const f of allFighters()) f.sc = null; scRoundStart(); B.maxHp *= 1000; B.hp = B.maxHp;
    for (let i = 0; i < 120 * 60 && !(ACH.suspect || []).length && M.phase !== 'end'; i++) { A.sc.sunder = 1e5; step(); A.hp = Math.max(A.hp, A.maxHp * 0.5); }
    return JSON.stringify({ strikes: ACH.strikes, sus: ACH.suspect || [], rep: ACH.reported, local: JSON.parse(localStorage.getItem('renying-ac-suspect') || '[]').length });
  })()`));
  check(!r.strikes.length && r.sus.length === 1 && r.sus[0].dmg > r.sus[0].cap && r.sus[0].mode === 'tower' && r.rep.length === 1 && /只记录/.test(r.rep[0][0]) && r.rep[0][1].dmg === r.sus[0].dmg,
    '带 8 卷秘卷时把破甲层数改大：一下超出秘卷能给的上限，不记过，留一条可疑记录并上报', JSON.stringify(r).slice(0, 400));
}
{
  // 没有秘卷的普通对局：醉翁的醉意改成 10 万
  const env = await env0(6);
  const r = JSON.parse(env.run(`(() => {
    const Z = CHARS.findIndex(c => c.id === 'zuixian');
    startMatch('cpu', 'hard', [Z, 0], true); showScreen(null); paused = false; M.phase = 'fight'; B.maxHp *= 1000; B.hp = B.maxHp;
    for (let i = 0; i < 120 * 60 && M.phase !== 'end'; i++) { A.drunk = 1e5; step(); A.hp = A.maxHp; }
    return JSON.stringify({ strikes: ACH.strikes, sus: (ACH.suspect || []).length, rep: ACH.reported.length, banned: !!(ACH.rec && acBanned(ACH.rec)) });
  })()`));
  check(!r.strikes.length && !r.banned && r.sus === 1 && r.rep === 1, '普通对局把醉意改到 10 万：一回合里多下超限，只留一条记录、报一次，不记过不封号', JSON.stringify(r));
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
{
  // 换掉伤害函数：下一次检查记过，并换回原来的
  const env = await env0(7);
  const r = JSON.parse(env.run(`(() => {
    startMatch('cpu', 'hard', [0, 3], true);
    const real = applyHit; applyHit = function (att, def, m, pt) { return real.call(this, att, def, { ...m, dmg: (m.dmg || 0) * 10 }, pt); };
    acCodeTick();
    return JSON.stringify({ strikes: ACH.strikes, back: applyHit === real });
  })()`));
  check(r.strikes.length === 1 && /伤害计算被篡改/.test(r.strikes[0]) && r.back, '换掉伤害函数：记过，函数换回原来的', JSON.stringify(r));
}

// 4. 联机房间（M.mode 是 'net'）按房间规则放宽：天机、神决、同袍肉鸽和本机同一档，普通房间不放宽
{
  const env = await env0(8);
  const r = JSON.parse(env.run(`(() => {
    const out = {};
    for (const room of ['normal', 'chaos', 'mayhem', 'raid']) {
      NET.role = 'host'; NET.open = true; netRoomMode = room;
      rollStart(room === 'raid' ? [0, 1, 3, 4] : [0, 3], 11);
      out[room] = Math.round(acHitCap(A, B, { dmg: 20 }) / (20 * 12) / acScMul(A, B));
    }
    for (const mode of ['chaos', 'mayhem']) { (mode === 'chaos' ? startChaos : startMayhem)(0, 3, 'god', true); out['local_' + mode] = Math.round(acHitCap(A, B, { dmg: 20 }) / (20 * 12)); }
    return JSON.stringify(out);
  })()`));
  check(r.normal === 1 && r.chaos === 6 && r.mayhem === 6 && r.raid === 6 && r.local_chaos === 6 && r.local_mayhem === 6,
    '联机天机、神决、同袍肉鸽房间和本机一样放宽 6 倍，普通房间不放宽', JSON.stringify(r));
}

if (fails) { console.error(`\nFAIL: ${fails} 项反作弊检查没过`); process.exit(1); }
console.log('\nPASS: 反作弊“改伤害”检查全部通过');
