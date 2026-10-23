#!/usr/bin/env node
// 实测每个角色每一招的“打击数据”：打得到的距离、几秒后打中、打空要多久才能再动、被挡后谁先动。
// 结果写进 models/ai-brain.json 的 frames 字段，电脑 AI 按这张表判断“这一招现在打不打得到、打完安不安全”。
//   node tools/ai-framedata.mjs            重新测量并写入
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { makeEnv, HEROES, NAMES } from './ai-arena.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = ROOT + 'models/ai-brain.json';
const env = await makeEnv();
const F_ = { get A() { return env.A; }, get B() { return env.B; } };
const T = env.STEP;

// 动作脚本：[秒, 操作]；操作 'p:x' 按一下，'h:x' 按住，'u:x' 松开
const ACTIONS = {
  l1: [[0, 'p:light']],
  dl: [[0, 'h:down'], [0, 'p:light'], [0.2, 'u:down']],
  cs1: [[0, 'h:atk'], [0.48, 'u:atk']],
  cs2: [[0, 'h:atk'], [1.12, 'u:atk']],
  air: [[0, 'h:right'], [0, 'p:jump'], [0.12, 'u:right'], [0.6, 'p:light']],
  skill: [[0, 'p:skill']],
  skill2: [[0, 'p:skill2']],
  special: [[0, 'p:special']],
};
const NEUTRAL = new Set(['idle', 'walk', 'block']);

class Script extends env.Ctrl {
  constructor(plan) { super(); this.plan = plan.map(([t, a]) => ({ t, a })); this.t0 = env.clock; }
  think() {
    const t = env.clock - this.t0;
    while (this.plan.length && this.plan[0].t <= t + 1e-9) {
      const [k, a] = this.plan.shift().a.split(':');
      if (k === 'p') this.press(a); else if (a === 'atk') { this.held.atk = k === 'h'; if (k === 'h') this.atkT = env.clock; } else this.held[a] = k === 'h';
    }
  }
}
class Idle extends env.Ctrl { constructor(block) { super(); this.held.down = !!block; } think() {} }

function setup(h, d, block, action) {
  env.startMatch('cpu', 'normal', [h, 0], true);
  env.projs.length = 0; env.decoys.length = 0;
  env.M.phase = 'fight'; env.M.t = 0; env.M.timer = 99;
  F_.A.reset(900 - d / 2); F_.B.reset(900 + d / 2);
  F_.A.face = 1; F_.B.face = -1;
  F_.A.meter = 100; F_.A.skillCD = 0; F_.A.skill2CD = 0; F_.A.breakCD = 0;
  if (F_.A.ch.passive === 'drunk') F_.A.drunk = 100;   // 醉翁：与民同乐要半壶酒
  if (F_.A.ch.inkShot) { F_.A.ink = 100; F_.A.fu = 3; }
  if (F_.A.ch.passive === 'rhythm') F_.A.notes = 0;
  F_.A.ctrl = new Script(ACTIONS[action]); F_.B.ctrl = new Idle(block);
}
// 跑一段：返回第一次打中的时间、总伤害、自己恢复可动的时间、对手恢复可动的时间
function run(h, d, block, action, maxT = 2.6) {
  setup(h, d, block, action);
  const hp0 = F_.B.hp, ax0 = F_.A.x;
  let tHit = -1, tFree = -1, foeFree = -1, started = false, hitSeen = false;
  for (let i = 0; i < maxT / T; i++) {
    env.step();
    const t = (i + 1) * T;
    if (!started && !NEUTRAL.has(F_.A.state)) started = true;
    const struck = F_.B.hp < hp0 - 0.01 || ['hitstun', 'launched', 'blockstun', 'knockdown', 'held'].includes(F_.B.state);
    if (tHit < 0 && struck) { tHit = t; hitSeen = true; }
    if (started && tFree < 0 && NEUTRAL.has(F_.A.state) && F_.A.onGround() && t > 0.05) tFree = t;
    if (hitSeen && foeFree < 0 && !['hitstun', 'launched', 'blockstun', 'knockdown', 'held', 'getup'].includes(F_.B.state)) foeFree = t;
    if (tFree > 0 && (foeFree > 0 || !hitSeen) && t > 1.0) break;
  }
  return { tHit, dmg: hp0 - F_.B.hp, tFree, foeFree, move: F_.A.x - ax0 };
}

const r1 = v => Math.round(v * 1000) / 1000;
const frames = {};
for (let h = 0; h < HEROES.length; h++) {
  const F = frames[HEROES[h]] = {};
  for (const action of Object.keys(ACTIONS)) {
    const hits = [], times = [], dmgs = [], ht = [];
    for (let d = 20; d <= 900; d += 10) {
      const r = run(h, d, false, action), ok = r.tHit > 0 && r.dmg > 0.5;
      if (ok) { hits.push(d); times.push(r.tHit); dmgs.push(r.dmg); }
      if (d % 20 === 0) ht.push(ok ? r1(r.tHit) : 0);   // 每 20 像素记一次打中要几秒（0 是打不到）
    }
    const whiff = run(h, 1600, false, action);
    // 被挡：在最适合的距离上让对手一直按住防御
    let blk = null;
    if (hits.length) {
      const dBest = hits[Math.floor(hits.length / 2)];
      const b = run(h, dBest, true, action), u = run(h, dBest, false, action);
      blk = { chip: r1(b.dmg), blockable: b.dmg < u.dmg * 0.5, adv: b.foeFree > 0 && b.tFree > 0 ? r1(b.foeFree - b.tFree) : null };
    }
    const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0;
    F[action] = hits.length ? {
      min: hits[0], max: hits[hits.length - 1], hit: r1(med(times)), dmg: Math.round(med(dmgs)),
      dur: r1(whiff.tFree > 0 ? whiff.tFree : 1), move: Math.round(whiff.move), ...(blk || {}), ht,
    } : { min: 0, max: 0, hit: 0, dmg: 0, dur: r1(whiff.tFree > 0 ? whiff.tFree : 1), move: Math.round(whiff.move) };
  }
  console.log(NAMES[h], Object.entries(F).map(([k, v]) => `${k}:${v.min}-${v.max}@${v.hit}s/${v.dmg}伤/${v.dur}s${v.blockable === false ? '不可挡' : ''}${v.adv != null ? ' 挡后' + v.adv : ''}`).join('  '));
}
const brain = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
brain.frames = frames;
writeFileSync(OUT, JSON.stringify(brain));
console.log('已写入', OUT);
