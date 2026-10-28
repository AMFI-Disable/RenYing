#!/usr/bin/env node
// 帧数表：每位侠客的普攻（前摇 / 判定 / 后摇）和 Q / 右键 / 大招（第一下打中在第几帧、整招多少帧能动），1 帧 = 1/60 秒。
// 普攻直接读招式表（src/data/01-moves.js 的 MOVES 按侠客 stat 和 moveMods 算好的 CHAR_MOVES）；技能和大招在无画面沙盒里放一遍量出来。
//   node tools/frame-data.mjs           重新量，写 docs/frame-data.json（基准）和 docs/frame-data.md（给人看）
//   node tools/frame-data.mjs --check   重新量，和 docs/frame-data.json 比，有一格不一样就列出来并退出码 1（改手感前后对比用）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { makeEnv } from './ai-arena.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const JSON_OUT = ROOT + 'docs/frame-data.json', MD_OUT = ROOT + 'docs/frame-data.md';
const check = process.argv.includes('--check');
const MOVE_KEYS = ['l1', 'l2', 'l3', 'l4', 'l5', 'hv', 'cs1', 'cs2', 'a1', 'a2', 'dl'];

const env = await makeEnv();
env.seed(1);
const data = JSON.parse(env.run(`(() => {
  const fr = s => Math.round(s * 60 * 10) / 10;
  const out = [];
  for (let i = 0; i < CHARS.length; i++) {
    const ch = CHARS[i], mv = CHAR_MOVES[i], row = { id: ch.id, name: ch.name, moves: {}, skills: {} };
    for (const k of ${JSON.stringify(MOVE_KEYS)}) {
      const m = mv[k];
      // leiming 的 l5 接 l6：连段里有的招都列出来
      if (m) row.moves[k] = [fr(m.su), fr(m.ac), fr(m.rc)];
    }
    if (mv.l6 && ch.moveMods && ch.moveMods.l6) row.moves.l6 = [fr(mv.l6.su), fr(mv.l6.ac), fr(mv.l6.rc)];
    for (const slot of ['skill', 'skill2', 'ult']) {
      startMatch('train', 'stand', [i, (i + 1) % CHARS.length]);
      showScreen(null); paused = false; M.phase = 'fight'; M.t = 0;
      toNeutral(A); toNeutral(B);
      A.x = STAGE_W / 2 - 60; B.x = STAGE_W / 2 + 60; A.face = 1; B.face = -1; A.y = B.y = 0; A.vx = A.vy = B.vx = B.vy = 0;
      A.skillCD = A.skill2CD = 0; A.meter = 100; A.drunk = 100; A.ink = INK_MAX; A.notes = 3; A.fu = 0;
      B.hp = B.maxHp; B.invul = 0; hitstop = 0; superFreeze = 0; projs.length = 0;
      if (slot === 'ult') startSpecial(A); else startSkill(A, B, slot === 'skill2' ? 2 : undefined);
      const want = slot === 'ult' ? 'special' : 'skill';
      if (A.state !== want) { row.skills[slot] = null; continue; }
      const hp0 = B.hp; let first = -1, end = -1;
      // 顿帧、大招定格不算时间：只数真正往前走的帧
      for (let n = 0, f = 0; n < 60 * 12 && end < 0; n++) {
        const frozen = hitstop > 0 || superFreeze > 0;
        step(); if (!frozen) f++;
        if (first < 0 && B.hp < hp0) first = f;
        if (A.state !== want && A.state !== 'attack') end = f;
        B.hp = Math.max(B.hp, 1);
      }
      row.skills[slot] = { id: slot === 'ult' ? ch.ult : ch[slot], hit: first, total: end };
    }
    out.push(row);
  }
  toMenu();
  return JSON.stringify(out);
})()`));

const md = ['# 帧数表', '', '由 `node tools/frame-data.mjs` 生成，1 帧 = 1/60 秒。改招式或技能的时间后重新生成；`--check` 用来确认手感没变。', '',
  '## 普攻：前摇 / 判定 / 后摇（帧）', '', '| 侠客 | ' + MOVE_KEYS.join(' | ') + ' |', '|' + ' --- |'.repeat(MOVE_KEYS.length + 1)];
for (const r of data) md.push(`| ${r.name} | ` + MOVE_KEYS.map(k => r.moves[k] ? r.moves[k].join(' / ') : '-').join(' | ') + ' |');
md.push('', '## 技能和大招：第一下打中 / 整招结束（帧，-1 是这样放没打中站在身前的木桩）', '', '| 侠客 | Q | 右键 | 大招 |', '| --- | --- | --- | --- |');
const cell = s => s ? `${s.id} ${s.hit} / ${s.total}` : '-';
for (const r of data) md.push(`| ${r.name} | ${cell(r.skills.skill)} | ${cell(r.skills.skill2)} | ${cell(r.skills.ult)} |`);
md.push('');

if (check) {
  if (!existsSync(JSON_OUT)) { console.log('还没有 docs/frame-data.json，先不带 --check 跑一遍'); process.exit(1); }
  const base = JSON.parse(readFileSync(JSON_OUT, 'utf8')), diff = [];
  const walk = (a, b, p) => {
    if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p + '.' + k); }
    else if (JSON.stringify(a) !== JSON.stringify(b)) diff.push(`${p}：原来 ${JSON.stringify(a)}，现在 ${JSON.stringify(b)}`);
  };
  // 按名字对齐：新加或删掉的侠客也要报出来（按下标比会漏掉多出来的那一位）
  const now = new Map(data.map(r => [r.name, r])), was = new Set(base.map(r => r.name));
  for (const r of base) if (now.has(r.name)) walk(r, now.get(r.name), r.name); else diff.push(`${r.name}：基准里有，现在没有了`);
  for (const r of data) if (!was.has(r.name)) diff.push(`${r.name}：新侠客，基准里还没有（不带 --check 重新生成）`);
  if (diff.length) { console.log(`帧数和 docs/frame-data.json 不一样（${diff.length} 处）：`); for (const d of diff.slice(0, 40)) console.log('  ' + d); process.exit(1); }
  console.log(`帧数和基准一致（${data.length} 位侠客）`);
} else {
  writeFileSync(JSON_OUT, JSON.stringify(data, null, 1) + '\n');
  writeFileSync(MD_OUT, md.join('\n'));
  console.log(`已写 docs/frame-data.json 和 docs/frame-data.md（${data.length} 位侠客）`);
}
