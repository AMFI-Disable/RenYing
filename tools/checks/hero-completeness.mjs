#!/usr/bin/env node
// 20 侠客完整度自动化门禁脚本（Issue #45 / #51）
// 强制校验：CHARGE_POSES 全覆盖、AIR_SKILL_POSE 全覆盖与 POSES 合法性、AI_KIT/AI_ULT/AI_HERO_TACTICS、
// ai-brain.json 精确 20 侠客一致、皮肤与天工传世皮肤覆盖、地图地利、英文名与上手文案、ai.range 与克制关系。
// 用法：node tools/checks/hero-completeness.mjs [--report] [--strict]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { makeEnv } from '../ai/ai-arena.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REPORT = process.argv.includes('--report');
const STRICT = process.argv.includes('--strict');
const wiki = readFileSync(ROOT + 'docs/wiki/heroes-and-combat.md', 'utf8');
const brain = JSON.parse(readFileSync(ROOT + 'src/models/ai-brain.json', 'utf8'));
const env = await makeEnv();

// 载入武库皮肤表，确保统计完整皮肤与天工传世（c14）覆盖
env.window.crypto = globalThis.crypto;
new vm.Script(readFileSync(ROOT + 'src/armory-core.js', 'utf8')).runInContext(env.window);
new vm.Script(readFileSync(ROOT + 'src/armory.js', 'utf8')).runInContext(env.window);

const data = env.run(`(() => ({
  heroes: HEROES.map(h => ({ id: h.id, en: h.en, name: h.char.name, skill: h.char.skill, skill2: h.char.skill2, ult: h.char.ult, ai: h.char.ai, beats: h.char.beats, weakTo: h.char.weakTo })),
  skins: Object.entries(SKINS).map(([k, s]) => ({ k, char: s.char, heirloom: !!(s.heirloom || (ArmoryCore.ITEM[k] && ArmoryCore.ITEM[k].col === 'c14')) })),
  maps: Object.entries(MAPS).map(([id, m]) => ({ id, fav: Object.keys(m.fav || {}) })),
  skills: Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.desc])),
  ults: Object.fromEntries(Object.entries(ULTS).map(([k, v]) => [k, v.desc])),
  poses: Object.keys(POSES || {}),
  chargePoses: typeof CHARGE_POSES !== 'undefined' ? CHARGE_POSES : {},
  airSkillPose: typeof AIR_SKILL_POSE !== 'undefined' ? AIR_SKILL_POSE : {},
  aiKit: typeof AI_KIT !== 'undefined' ? Object.keys(AI_KIT) : [],
  aiUlt: typeof AI_ULT !== 'undefined' ? Object.keys(AI_ULT) : [],
  aiTactics: typeof AI_HERO_TACTICS !== 'undefined' ? Object.keys(AI_HERO_TACTICS) : [],
  guides: typeof HERO_GUIDES !== 'undefined' ? HERO_GUIDES : {},
  copyEn: typeof UI_COPY_EN !== 'undefined' ? UI_COPY_EN : {},
}))()`);

const poseSet = new Set(data.poses);
const aiKitSet = new Set(data.aiKit);
const aiUltSet = new Set(data.aiUlt);
const aiTacticsSet = new Set(data.aiTactics);
const heroIdSet = new Set(data.heroes.map(h => h.id));

const skinCount = {};
const heirloomCount = {};
for (const s of data.skins) {
  skinCount[s.char] = (skinCount[s.char] || 0) + 1;
  if (s.heirloom) heirloomCount[s.char] = (heirloomCount[s.char] || 0) + 1;
}

let coreFails = 0;
let strictFails = 0;
const reportRows = [];
const globalFails = [];

// 校验 ai-brain.json 与当前 20 侠客严格一致（既不缺位，也不残留已移除侠客）
for (const bucket of ['frames', 'genes']) {
  const keys = Object.keys(brain[bucket] || {});
  const extra = keys.filter(k => !heroIdSet.has(k));
  const missing = [...heroIdSet].filter(k => !(k in (brain[bucket] || {})));
  if (extra.length) globalFails.push(`ai-brain.json.${bucket} 残留已移除侠客: ${extra.join(', ')}`);
  if (missing.length) globalFails.push(`ai-brain.json.${bucket} 缺失现役侠客: ${missing.join(', ')}`);
}
coreFails += globalFails.length;

for (const h of data.heroes) {
  const missCore = [];
  const missTrack = [];
  if (!h.en) missCore.push('缺英文名');
  const gd = data.guides[h.id];
  if (!gd || !gd.tip || !gd.combo) missCore.push('缺上手打法');
  else if (!data.copyEn[gd.tip] || !data.copyEn[gd.combo]) missCore.push('缺上手英文');
  if (!h.ai || !Array.isArray(h.ai.range) || h.ai.range.length !== 2) missCore.push('缺 ai.range');
  if (!Array.isArray(h.beats) || !h.beats.length || !Array.isArray(h.weakTo) || !h.weakTo.length) missCore.push('缺克制关系');

  // 姿势完整度门禁（Issue #51）
  const cp = data.chargePoses[h.id];
  if (!cp || !poseSet.has(cp)) missCore.push('缺 CHARGE_POSES');
  for (const sk of [h.skill, h.skill2]) {
    const map = data.airSkillPose[sk];
    if (!map || !Object.keys(map).length) missCore.push(`缺 AIR_SKILL_POSE(${sk})`);
    else {
      const bad = Object.values(map).filter(p => !poseSet.has(p));
      if (bad.length) missCore.push(`无效空中姿势(${sk}:${bad.join(',')})`);
    }
  }

  // AI 策略覆盖门禁
  for (const sk of [h.skill, h.skill2]) {
    if (!aiKitSet.has(sk)) missCore.push(`缺 AI_KIT(${sk})`);
  }
  if (!aiUltSet.has(h.ult)) missCore.push(`缺 AI_ULT(${h.ult})`);
  if (!aiTacticsSet.has(h.id)) missCore.push('缺 AI_HERO_TACTICS');

  // 皮肤与地图地利覆盖门禁
  if (!skinCount[h.id]) missCore.push('无皮肤');
  if (!heirloomCount[h.id]) missCore.push('缺天工传世皮肤');
  const hasMapFav = data.maps.some(m => m.fav.includes(h.id));
  if (!hasMapFav) missCore.push('缺地图地利');

  // 历史文案与 Wiki 追踪项
  const skillMiss = [data.skills[h.skill], data.skills[h.skill2], data.ults[h.ult]].filter(d => d && !data.copyEn[d]).length;
  if (skillMiss) missTrack.push(`缺技能英文(${skillMiss})`);
  const inWiki = wiki.includes(h.name) || wiki.includes(h.id);
  if (!inWiki) missTrack.push('缺 Wiki');

  if (missCore.length) coreFails++;
  if (missCore.length || missTrack.length) strictFails++;
  const allMiss = [...missCore, ...missTrack];
  if (REPORT || allMiss.length) {
    reportRows.push(`| ${h.name} (\`${h.id}\`) | ${skinCount[h.id] || 0} | ${hasMapFav ? '✓' : '缺失'} | ${inWiki ? '✓' : '缺失'} | ${allMiss.length ? allMiss.join('、') : '完整'} |`);
  }
}

if (REPORT) {
  console.log('| 侠客 | 皮肤数 | 地图地利 | Wiki | 状态 |');
  console.log('|---|---:|:---:|:---:|---|');
  for (const r of reportRows) console.log(r);
}

if (coreFails > 0 || (STRICT && strictFails > 0)) {
  console.error(`英雄完整度检查失败：${coreFails} 核心缺失，${strictFails} 总计待补`);
  for (const g of globalFails) console.error(' ', g);
  for (const r of reportRows) console.error(' ', r);
  process.exit(1);
}
console.log(`英雄完整度检查通过（${data.heroes.length} 位角色：姿势/空中技能/AI策略/模型/皮肤/地利全通过；历史文案待补见 --report，共 ${strictFails} 位）`);
