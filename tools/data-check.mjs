#!/usr/bin/env node
// 构建时检查 src/data/ 的数据表：必填字段、不认识的字段、编号唯一、引用的东西存在。有一处不对就退出码 1，tools/build.py 会停下来。
//   node tools/data-check.mjs
// 加一张新表：在下面 TABLES 里加一项 { name, check(t, env, err) }，name 是表的全局名字。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dataFiles } from './ai-code.mjs';
import { makeEnv } from './ai-arena.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const errors = [];
const err = (where, msg) => errors.push(`${where}：${msg}`);

// ---------- 通用的形状检查 ----------
// spec 的写法：'str' 非空字符串、'num' 数字、'pos' 正数、'int' 整数、'bool'、'arr' 数组、'obj' 对象、'any'；
// 字段名后面带 ? 是选填。spec 里没写的字段算写错（多半是拼错了字段名）。
const TYPES = {
  str: v => typeof v === 'string' && v.length > 0, num: v => typeof v === 'number' && isFinite(v), pos: v => typeof v === 'number' && v > 0,
  int: v => Number.isInteger(v), bool: v => typeof v === 'boolean', arr: Array.isArray, obj: v => !!v && typeof v === 'object' && !Array.isArray(v), any: () => true,
};
function shape(where, o, spec) {
  if (!TYPES.obj(o)) { err(where, '应该是一个对象 { … }'); return false; }
  const known = new Set();
  for (const [k0, t] of Object.entries(spec)) {
    const opt = k0.endsWith('?'), k = opt ? k0.slice(0, -1) : k0;
    known.add(k);
    if (!(k in o)) { if (!opt) err(where, `少了必填字段 ${k}`); continue; }
    if (!TYPES[t](o[k])) err(where, `${k} 应该是 ${t}，现在是 ${JSON.stringify(o[k])}`);
  }
  for (const k of Object.keys(o)) if (!known.has(k)) err(where, `不认识的字段 ${k}（拼错了？）`);
  return true;
}
const unique = (where, list, what) => {
  const seen = new Set();
  for (const v of list) { if (seen.has(v)) err(where, `${what} ${v} 重复了`); seen.add(v); }
};
const line = (where, l) => { if (!Array.isArray(l) || l.length !== 2 || typeof l[0] !== 'string' || !TYPES.str(l[1])) err(where, `对话一行要写成 [说话的人, 话]，现在是 ${JSON.stringify(l)}`); };
const lines = (where, ls) => { if (!Array.isArray(ls) || !ls.length) err(where, '要有至少一行对话'); else ls.forEach((l, i) => line(`${where}[${i}]`, l)); };

// ---------- 侠客 ----------
const STAT = { hp: 'pos', walk: 'pos', speed: 'pos', dmg: 'pos', reach: 'pos', swing: 'pos', jump: 'pos', weight: 'pos', defRating: 'pos', guardMax: 'pos', guardStab: 'pos', guardChip: 'num', guardRegen: 'pos', poise: 'pos', size: 'pos' };
const LOOK = { body: 'str', shade: 'str', outline: 'str', outlineA: 'num', scarf: 'str', slash: 'str', blade: 'str', head: 'str', weapon: 'str' };
const CHAR = { id: 'str', name: 'str', role: 'str', diff: 'int', escCD: 'pos', skill: 'str', skill2: 'str', ult: 'str', passive: 'str', passiveName: 'str', passiveDesc: 'str',
  stat: 'obj', look: 'obj', ai: 'obj', beats: 'arr', weakTo: 'arr', 'meterMul?': 'pos', 'hitFeel?': 'pos', 'moveMods?': 'obj', 'jumps?': 'int', 'fly?': 'pos', 'scaling?': 'num', 'inkShot?': 'bool' };
const FOREST = { hero: 'str', heroName: 'str', title: 'str', place: 'str', synopsis: 'str', stageNames: 'arr', waveDialogues: 'arr', bossIntro: 'str' };
const FIGHT = { foe: 'str', lv: 'str', goal: 'str', 'time?': 'pos', 'hp?': 'pos', 'foeHp?': 'pos', 'mySc?': 'arr', 'foeSc?': 'arr' };

function checkFight(where, f, env, ids) {
  if (!shape(where, f, FIGHT)) return;
  if (!ids.includes(f.foe)) err(where, `对手 ${f.foe} 不是侠客`);
  if (!(f.lv in env.LEVELS)) err(where, `电脑难度 ${f.lv} 不存在（可选：${Object.keys(env.LEVELS).join(' ')}）`);
  if (!(f.goal in env.SAGA_GOAL)) err(where, `胜利条件 ${f.goal} 不存在（可选：${Object.keys(env.SAGA_GOAL).join(' ')}）`);
  if (f.goal !== 'ko' && !f.time) err(where, `胜利条件 ${f.goal} 要写 time 秒数`);
  for (const k of ['mySc', 'foeSc']) for (const s of f[k] || []) if (!env.SC_BY[s]) err(where, `${k} 里的秘卷 ${s} 不存在`);
}
function checkSaga(where, s, env, ids) {
  if (!shape(where, s, { title: 'str', motive: 'str', nodes: 'arr' })) return;
  if (s.nodes.length !== 5) { err(where, `nodes 要正好 5 节，现在 ${s.nodes.length} 节`); return; }
  let choice = null;
  s.nodes.slice(0, 4).forEach((n, i) => {
    const w = `${where}.nodes[${i}]`;
    if (!shape(w, n, { place: 'str', name: 'str', fight: 'obj', pre: 'arr', post: 'arr', 'choice?': 'obj' })) return;
    checkFight(w + '.fight', n.fight, env, ids); lines(w + '.pre', n.pre); lines(w + '.post', n.post);
    if (n.choice) {
      if (choice) err(w, '只能有一节写 choice 抉择');
      choice = n.choice;
      if (shape(w + '.choice', n.choice, { q: 'str', opts: 'arr' })) {
        if (n.choice.opts.length !== 2) err(w + '.choice', 'opts 要正好两个选项');
        n.choice.opts.forEach((o, j) => { if (shape(`${w}.choice.opts[${j}]`, o, { t: 'str', f: 'str', say: 'arr' })) lines(`${w}.choice.opts[${j}].say`, o.say); });
        unique(w + '.choice', n.choice.opts.map(o => o.f), '抉择 flag');
      }
    }
  });
  if (!choice) { err(where, '前四节里要有一节写 choice 抉择'); return; }
  const w = `${where}.nodes[4]`, n = s.nodes[4], flags = choice.opts.map(o => o.f);
  if (!shape(w, n, { place: 'str', name: 'str', pre: 'any', fight: 'any', 'post?': 'any', end: 'obj' })) return;
  // 第 5 节的 pre / fight / post 可以不分抉择，也可以写成 { flag: 内容 }；end 一定按抉择分
  const byFlag = (k, each) => {
    const v = n[k];
    if (v === undefined) return;
    if (!TYPES.obj(v) || (k === 'fight' && 'foe' in v)) return each(`${w}.${k}`, v);
    for (const f of flags) if (!(f in v)) err(`${w}.${k}`, `少了抉择 ${f} 的那一份`);
    for (const [f, x] of Object.entries(v)) {
      if (flags.includes(f)) each(`${w}.${k}.${f}`, x);
      else err(`${w}.${k}`, `${f} 不对应任何抉择（抉择是 ${flags.join(' / ')}）`);
    }
  };
  byFlag('pre', lines); byFlag('post', lines); byFlag('fight', (x, f) => checkFight(x, f, env, ids));
  for (const f of flags) if (!(f in n.end)) err(`${w}.end`, `少了抉择 ${f} 的结局`);
  for (const [f, e] of Object.entries(n.end)) {
    if (!flags.includes(f)) err(`${w}.end`, `结局 ${f} 不对应任何抉择（抉择是 ${flags.join(' / ')}）`);
    if (shape(`${w}.end.${f}`, e, { title: 'str', text: 'arr' })) lines(`${w}.end.${f}.text`, e.text);
  }
}
function checkHeroes(env) {
  // 每个文件单独跑一遍，看它登记了哪位侠客，好对上文件名
  const ctx = vm.createContext({});
  const byFile = [];
  for (const p of dataFiles()) {
    new vm.Script(readFileSync(ROOT + p, 'utf8'), { filename: p }).runInContext(ctx);
    if (!p.startsWith('src/data/heroes/')) continue;
    const n = vm.runInContext('HEROES.length', ctx);
    byFile.push([p, n]);
  }
  const H = vm.runInContext('HEROES', ctx), ids = H.map(h => h.id);
  let prev = 0;
  byFile.forEach(([p, n], i) => {
    const m = p.match(/heroes\/(\d\d)-([a-z0-9]+)\.js$/);
    if (n - prev !== 1) err(p, `一个文件要正好 defHero 一次，这里是 ${n - prev} 次`);
    else if (!m || +m[1] !== i || m[2] !== H[n - 1].id) err(p, `文件名应该是 ${String(i).padStart(2, '0')}-${H[n - 1].id}.js（编号按顺序从 00 排，后面跟 id）`);
    prev = n;
  });
  unique('src/data/heroes', ids, 'id');
  unique('src/data/heroes', H.map(h => h.skin), 'skin 前缀');
  unique('src/data/heroes', H.map(h => h.char && h.char.name), '名字');
  const prefix = Object.fromEntries([...readFileSync(ROOT + 'src/armory-core.js', 'utf8').match(/const PREFIX = \{([^}]*)\}/)[1].matchAll(/([a-z]{2}): '([a-z]+)'/g)].map(m => [m[1], m[2]]));
  H.forEach((h, i) => {
    const w = `src/data/heroes/${String(i).padStart(2, '0')}-${h.id}.js`;
    if (!shape(w, h, { id: 'str', skin: 'str', en: 'str', bal: 'obj', char: 'obj', forest: 'obj', saga: 'obj' })) return;
    if (!/^[a-z]+$/.test(h.id)) err(w, `id 只能用小写英文字母，现在是 ${h.id}`);
    if (!/^[a-z]{2}$/.test(h.skin)) err(w, `skin 前缀要两个小写字母，现在是 ${h.skin}`);
    else if (prefix[h.skin] !== h.id) err(w, `skin 前缀 ${h.skin} 在 src/armory-core.js 的 PREFIX 里对应的是 ${prefix[h.skin] || '（没有）'}，应该是 ${h.id}`);
    shape(w + ' bal', h.bal, { normal: 'pos', skill: 'pos', ult: 'pos', cd: 'pos', hp: 'pos' });
    const c = h.char;
    if (shape(w + ' char', c, CHAR)) {
      shape(w + ' char.stat', c.stat, STAT);
      shape(w + ' char.look', c.look, LOOK);
      if (shape(w + ' char.ai', c.ai, { range: 'arr' }) && !(c.ai.range.length === 2 && c.ai.range.every(TYPES.pos) && c.ai.range[0] < c.ai.range[1])) err(w + ' char.ai', 'range 要写成 [近, 远]');
      if (!(c.diff >= 1 && c.diff <= 3)) err(w + ' char', `diff 上手难度是 1~3，现在是 ${c.diff}`);
      for (const k of ['skill', 'skill2']) if (!env.SKILLS[c[k]]) err(w + ' char', `${k} 技能 ${c[k]} 在 SKILLS 里没有`);
      if (!env.ULTS[c.ult]) err(w + ' char', `大招 ${c.ult} 在 ULTS 里没有`);
      if (!(c.look.weapon in env.WEAPON_LEN)) err(w + ' char.look', `兵器 ${c.look.weapon} 在 WEAPON_LEN 里没有`);
      for (const k of ['beats', 'weakTo']) for (const o of c[k]) if (!ids.includes(o) || o === h.id) err(w + ' char', `${k} 里的 ${o} 不是别的侠客`);
      for (const [mv, mod] of Object.entries(c.moveMods || {})) if (!env.MOVES[mv] && !(mod && mod.p)) err(w + ' char.moveMods', `${mv} 不是已有招式（新招式要写 p 动作）`);
    }
    const f = h.forest;
    if (shape(w + ' forest', f, FOREST)) {
      if (f.stageNames.length !== 5 || !f.stageNames.every(TYPES.str)) err(w + ' forest', 'stageNames 要正好 5 个关卡名');
      if (f.waveDialogues.length !== 4 || !f.waveDialogues.every(TYPES.str)) err(w + ' forest', 'waveDialogues 要正好 4 句台词');
    }
    checkSaga(w + ' saga', h.saga, env, ids);
  });
  // 皮肤：<前缀>_xxx 的皮肤要属于这个前缀的侠客
  const bySkin = Object.fromEntries(H.map(h => [h.skin, h.id]));
  for (const [k, s] of Object.entries(env.SKINS)) {
    const owner = bySkin[k.split('_')[0]];
    if (owner && s.char !== owner) err('src/game/19-progress.js SKINS', `${k} 的前缀是 ${owner} 的，但 char 写的是 ${s.char}`);
  }
}

// ---------- 模式和点将台顺序 ----------
function checkModes(env) {
  const { BP_ORDERS, MODES, ROOM_MODES, MODE_DEFAULT } = env;
  for (const [k, o] of Object.entries(BP_ORDERS)) {
    const w = `src/data/11-bp-orders.js ${k}`;
    if (!Array.isArray(o) || !o.length) { err(w, '要至少一步'); continue; }
    o.forEach((st, i) => { if (!Array.isArray(st) || st.length !== 2 || ![0, 1].includes(st[0]) || !['ban', 'pick'].includes(st[1])) err(w, `第 ${i + 1} 步要写成 [0 或 1, 'ban' 或 'pick']，现在是 ${JSON.stringify(st)}`); });
    for (const s of [0, 1]) if (o.filter(st => st[0] === s && st[1] === 'ban').length > 1) err(w, `第 ${s} 边最多禁 1 人`);
    if (!o.some(st => st[1] === 'pick')) err(w, '至少要选一个人');
  }
  const order = (w, md) => {
    if (!BP_ORDERS[md.bp]) err(w, `点将台顺序 ${md.bp} 在 BP_ORDERS 里没有`);
    for (const [n, b] of Object.entries(md.squadBp || {})) if (!BP_ORDERS[b]) err(w, `squadBp ${n} 人的顺序 ${b} 在 BP_ORDERS 里没有`);
    if (md.sides && !(md.sides.length === 2 && md.sides.every(TYPES.str))) err(w, 'sides 要写两边的名字');
  };
  const MODE = { bp: 'str', 'squadBp?': 'obj', 'team?': 'bool', 'local?': 'bool', 'sides?': 'arr', 'us?': 'str', 'foe?': 'str' };
  for (const [k, md] of Object.entries({ ...MODES, '(MODE_DEFAULT)': MODE_DEFAULT })) {
    const w = `src/data/10-modes.js MODES.${k}`;
    if (shape(w, md, MODE)) order(w, md);
  }
  if (MODES.net) err('src/data/10-modes.js MODES', 'net 是联机，规则写在 ROOM_MODES 里');
  if (!ROOM_MODES.normal) err('src/data/10-modes.js ROOM_MODES', '要有 normal（房间规则不认识时用它）');
  for (const [k, md] of Object.entries(ROOM_MODES)) {
    const w = `src/data/10-modes.js ROOM_MODES.${k}`;
    if (!shape(w, md, { ...MODE, slots: 'arr', 'four?': 'bool', 'raid?': 'bool', 'rule?': 'str' })) continue;
    order(w, md);
    if (md.local) err(w, '联机房间不能写 local');
    if (md.rule && !['chaos', 'mayhem'].includes(md.rule)) err(w, `rule 只能是 chaos 或 mayhem，现在是 ${md.rule}`);
    const ok = md.slots.length === 2 && md.slots.every(s => Array.isArray(s) && s.length && s.every(i => [0, 1, 2, 3].includes(i)));
    if (!ok) { err(w, 'slots 要写成 [[房主控制的编号…], [加入的人控制的编号…]]，编号 0~3'); continue; }
    unique(w + ' slots', md.slots.flat(), '侠客编号');
    if (!md.four && !md.raid && md.slots.flat().some(i => i > 1)) err(w, '不是四人模式（four）或同袍肉鸽（raid）就只能控制 0 和 1');
    if (md.raid && md.slots.flat().includes(1)) err(w, '同袍肉鸽里 1 号（B）是魔首，玩家不能控制');
  }
}

// 以后的表在这里加一项（表还没写进 src/data/ 时会跳过）
// ---------- 界面文案（中文 → 英文） ----------
// 键、值都要是非空字符串；同一句中文写了两遍的话，后一行会悄悄盖掉前一行，所以按源码逐行查重
function checkUiCopy(env) {
  const where = 'src/data/30-ui-copy.js';
  const t = env.UI_COPY_EN;
  if (!TYPES.obj(t)) { err(where, 'UI_COPY_EN 应该是一个对象 { 中文: 英文 }'); return; }
  for (const [k, v] of Object.entries(t)) {
    if (!TYPES.str(k) || k !== k.trim()) err(where, `键 ${JSON.stringify(k)} 要是非空、首尾没有空白的中文原文`);
    if (!TYPES.str(v)) err(where, `「${k}」的译文应该是非空字符串，现在是 ${JSON.stringify(v)}`);
  }
  const keys = [];
  for (const m of readFileSync(ROOT + where, 'utf8').matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:/gm)) keys.push(JSON.parse(m[1]));
  unique(where, keys, '键');
}

const TABLES = [
  { name: 'HEROES', check: checkHeroes },
  { name: 'BP_ORDERS', check: checkModes },
  { name: 'UI_COPY_EN', check: checkUiCopy },
];

const env = await makeEnv();
const get = name => env.run(`typeof ${name} === 'undefined' ? undefined : ${name}`);
const refs = Object.fromEntries(['LEVELS', 'SAGA_GOAL', 'SC_BY', 'SKILLS', 'ULTS', 'WEAPON_LEN', 'MOVES', 'SKINS', 'BP_ORDERS', 'MODES', 'ROOM_MODES', 'MODE_DEFAULT', 'UI_COPY_EN'].map(k => [k, get(k)]));
for (const t of TABLES) if (get(t.name) !== undefined) t.check(refs);
if (errors.length) {
  console.log(`src/data/ 的数据表有 ${errors.length} 处不对：`);
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
}
console.log('数据表检查通过');
