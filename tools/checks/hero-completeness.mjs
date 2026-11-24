#!/usr/bin/env node
// 新角色完整度检查脚本（Issue #45）
// 检查每位角色的：皮肤覆盖、地图地利、英文名与技能/上手文案、Wiki 覆盖、AI 参数（ai.range）与克制关系（beats / weakTo）。
// 用法：node tools/checks/hero-completeness.mjs [--report] [--strict]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { makeEnv } from '../ai/ai-arena.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REPORT = process.argv.includes('--report');
const STRICT = process.argv.includes('--strict');
const wiki = readFileSync(ROOT + 'docs/wiki/heroes-and-combat.md', 'utf8');
const env = await makeEnv();

// 载入武库皮肤表，确保统计完整 172 款皮肤
env.window.crypto = globalThis.crypto;
new vm.Script(readFileSync(ROOT + 'src/armory-core.js', 'utf8')).runInContext(env.window);
new vm.Script(readFileSync(ROOT + 'src/armory.js', 'utf8')).runInContext(env.window);

const data = env.run(`(() => ({
  heroes: HEROES.map(h => ({ id: h.id, en: h.en, name: h.char.name, skill: h.char.skill, skill2: h.char.skill2, ult: h.char.ult, ai: h.char.ai, beats: h.char.beats, weakTo: h.char.weakTo })),
  skins: Object.values(SKINS).map(s => s.char),
  maps: Object.entries(MAPS).map(([id, m]) => ({ id, fav: Object.keys(m.fav || {}) })),
  skills: Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.desc])),
  ults: Object.fromEntries(Object.entries(ULTS).map(([k, v]) => [k, v.desc])),
  guides: typeof HERO_GUIDES !== 'undefined' ? HERO_GUIDES : {},
  copyEn: typeof UI_COPY_EN !== 'undefined' ? UI_COPY_EN : {},
}))()`);

const skinCount = {};
for (const c of data.skins) skinCount[c] = (skinCount[c] || 0) + 1;

let coreFails = 0;
let strictFails = 0;
const reportRows = [];

for (const h of data.heroes) {
  const missCore = [];
  const missTrack = [];
  if (!h.en) missCore.push('缺英文名');
  const gd = data.guides[h.id];
  if (!gd || !gd.tip || !gd.combo) missCore.push('缺上手打法');
  else if (!data.copyEn[gd.tip] || !data.copyEn[gd.combo]) missCore.push('缺上手英文');
  if (!h.ai || !Array.isArray(h.ai.range) || h.ai.range.length !== 2) missCore.push('缺 ai.range');
  if (!Array.isArray(h.beats) || !h.beats.length || !Array.isArray(h.weakTo) || !h.weakTo.length) missCore.push('缺克制关系');

  if (!skinCount[h.id]) missTrack.push('无皮肤');
  const skillMiss = [data.skills[h.skill], data.skills[h.skill2], data.ults[h.ult]].filter(d => d && !data.copyEn[d]).length;
  if (skillMiss) missTrack.push(`缺技能英文(${skillMiss})`);
  const hasMapFav = data.maps.some(m => m.fav.includes(h.id));
  if (!hasMapFav) missTrack.push('缺地图地利');
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
  for (const r of reportRows) console.error(' ', r);
  process.exit(1);
}
console.log(`英雄完整度检查通过（${data.heroes.length} 位角色；待补内容清单见 --report，共 ${strictFails} 位有历史待补项）`);
