#!/usr/bin/env node
// Focused coverage for hero profiles, scroll drafting, health tactics and mode adaptation.
import { makeEnv } from '../ai/ai-arena.mjs';

const env = await makeEnv();
const result = JSON.parse(env.run(`JSON.stringify((() => {
  const ids = CHARS.map(c => c.id);
  const profiles = ids.every(id => !!AI_HERO_TACTICS[id]);
  const signature = aiChooseScroll('liying', ['li_mist_cut', 'iron_skin']) === 'li_mist_cut';
  const build = aiChooseScroll('qingfeng', ['crescendo', 'iron_skin'], ['double_strike']) === 'crescendo';
  const me = { idx: 0, ch: { id: 'qingfeng', skill: 'gale', skill2: 'swordqi' }, hp: 20, maxHp: 100, meter: 0, sc: {} };
  const foe = { hp: 70, maxHp: 100, state: 'idle' };
  M.mode = 'cpu'; M.towerPerks = []; M.chaos = { i: -1, t: 0 };
  const lowRisk = aiModeActionWeight(me, foe, 'cs2', 250);
  me.hp = 80;
  const healthyRisk = aiModeActionWeight(me, foe, 'cs2', 250);
  const hpTactic = lowRisk < healthyRisk;
  M.mode = 'chaos'; M.chaos = { i: 70, t: 0 };
  const chaosSkill = aiModeActionWeight(me, foe, 'skill', 250);
  M.mode = 'cpu'; M.chaos = { i: -1, t: 0 };
  const baseSkill = aiModeActionWeight(me, foe, 'skill', 250);
  const chaosAdaptation = chaosSkill > baseSkill;
  const bigMe = { fu: 0, maxHp: 3000, hp: 1000, skill2CD: 0 };
  const bigFoe = { maxHp: 3000, hp: 500, invul: 0, needleMark: 0 };
  const normalFoe = { maxHp: 800, hp: 500, invul: 0, needleMark: 0 };
  const mayhemThreshold = AI_ULT.needlestorm.sure(bigMe, bigFoe) && !AI_ULT.needlestorm.sure(bigMe, normalFoe);
  return { heroCount: ids.length, profiles, signature, build, hpTactic, chaosAdaptation, mayhemThreshold };
})())`));

const checks = [
  ['all 16 heroes have tactical profiles', result.heroCount === 16 && result.profiles],
  ['tower AI favors its hero signature scroll', result.signature],
  ['tower AI builds around owned scroll synergies', result.build],
  ['low health reduces commitment to slow risky attacks', result.hpTactic],
  ['chaos cooldown mutation changes action priorities', result.chaosAdaptation],
  ['mayhem ultimate thresholds scale with max health', result.mayhemThreshold],
];
let failed = 0;
for (const [label, pass] of checks) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) failed++; }
console.log(failed ? `FAIL: ${failed} AI tactic checks failed` : 'PASS: AI tactic checks passed');
process.exit(failed ? 1 : 0);
