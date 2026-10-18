#!/usr/bin/env node
/**
 * Hero-Specific Auto-Training Pipeline for RenYing.
 *
 * Runs specialized simulation rounds for each hero, training dedicated neural models:
 *   - models/heroes/qingfeng.json
 *   - models/heroes/feiying.json
 *   - models/heroes/tieshan.json
 *   - models/heroes/lingshuang.json
 *   - models/heroes/liuyun.json
 *   - models/heroes/leiming.json
 *   - models/heroes/moyu.json
 *   - models/heroes/yuehua.json
 *   - models/heroes/yanling.json
 *
 * Usage:
 *   node tools/train-heroes.mjs [--matches-per-hero 6] [--epochs 5] [--hero qingfeng]
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const matchesPerHero = parseInt(getArg('matches-per-hero', '6'), 10);
const epochs = parseInt(getArg('epochs', '5'), 10);
const singleHero = getArg('hero', '');

const HEROES = [
  { id: 'qingfeng', idx: 0, name: '青锋' },
  { id: 'feiying', idx: 1, name: '绯影' },
  { id: 'tieshan', idx: 2, name: '铁山' },
  { id: 'lingshuang', idx: 3, name: '凌霜' },
  { id: 'liuyun', idx: 4, name: '流云' },
  { id: 'leiming', idx: 5, name: '雷鸣' },
  { id: 'moyu', idx: 6, name: '墨羽' },
  { id: 'yuehua', idx: 7, name: '月华' },
  { id: 'yanling', idx: 8, name: '燕翎' },
];

const targetList = singleHero ? HEROES.filter(h => h.id === singleHero) : HEROES;
if (!targetList.length) {
  console.error(`Hero '${singleHero}' not found. Available heroes: ${HEROES.map(h => h.id).join(', ')}`);
  process.exit(1);
}

mkdirSync('data', { recursive: true });
mkdirSync('models/heroes', { recursive: true });

console.log(`\n========================================================`);
console.log(`   RenYing Hero-Specific Neural Policy Training         `);
console.log(`   Target Heroes: ${targetList.map(h => h.name + '(' + h.id + ')').join(', ')}`);
console.log(`   Matches per hero: ${matchesPerHero} | Epochs: ${epochs}`);
console.log(`========================================================\n`);

const summary = [];

for (const hero of targetList) {
  console.log(`\n>>> [Hero: ${hero.name} (${hero.id})] Generating Specialized CvC Data...`);
  const dataPath = `data/hero_${hero.id}.jsonl`;
  const modelPath = `models/heroes/${hero.id}.json`;

  try {
    // Run CvC matches where P1 is locked to the specific hero, facing diverse opponents
    execSync(`node tools/cvc-sim.mjs --matches ${matchesPerHero} --p1 ${hero.idx} --p1-level hard --p2-level hard --export ${dataPath}`, { stdio: 'inherit' });
    
    // Train policy specifically for this hero
    console.log(`>>> [Hero: ${hero.name}] Training neural policy...`);
    execSync(`node tools/train-policy.mjs --data ${dataPath} --hero ${hero.id} --epochs ${epochs} --out ${modelPath}`, { stdio: 'inherit' });
    
    summary.push({ hero: hero.name, id: hero.id, path: modelPath, status: 'OK' });
  } catch (e) {
    console.error(`Failed training for ${hero.name}:`, e.message);
    summary.push({ hero: hero.name, id: hero.id, status: 'FAILED' });
  }
}

// Clean up temporary dataset files to keep the disk clean
try {
  execSync('rm -rf data/*.jsonl', { stdio: 'ignore' });
} catch (e) {}

console.log(`\n========================================================`);
console.log(`   Hero Training Summary                               `);
console.log(`========================================================`);
for (const s of summary) {
  console.log(`  - ${s.hero.padEnd(6)} (${s.id.padEnd(10)}) -> ${s.status === 'OK' ? s.path : 'FAILED'}`);
}
console.log(`========================================================\n`);
