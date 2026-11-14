// 无画面沙盒用的游戏代码：训练好的 AI 数据 + src/ai.js + src/data/ + src/game/（和 tools/build.py 打包的顺序一样）
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';

import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// 两位数字开头的文件按文件名排序：拼接顺序必须和 tools/build.py 一致，否则沙盒里的游戏和网页里的不一样
const numbered = dir => readdirSync(ROOT + dir).filter(n => /^\d\d-[a-z0-9-]+\.js$/.test(n)).sort().map(n => dir + '/' + n);
const isDir = p => statSync(ROOT + p).isDirectory();

// 数据表在 src/data/（本层的文件在前，再是 heroes/ 这样的子目录），和 tools/build.py 的 data_parts() 一样
export function dataFiles() {
  const subs = readdirSync(ROOT + 'src/data').filter(d => isDir('src/data/' + d)).sort();
  return [...numbered('src/data'), ...subs.flatMap(d => numbered('src/data/' + d))];
}

// 游戏主体：先是 src/data/ 的数据表，再是 src/game/（含各分层子目录）下按文件名的编号顺序拼起来的原来整个 game.js
export function gameFiles() {
  const subs = readdirSync(ROOT + 'src/game').filter(d => isDir('src/game/' + d)).sort();
  const items = [
    ...numbered('src/game').map(p => ({ name: p.split('/').pop(), path: p })),
    ...subs.flatMap(d => numbered('src/game/' + d).map(p => ({ name: p.split('/').pop(), path: p }))),
  ];
  items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return items.map(x => x.path);
}

export function gameJs() {
  return [...dataFiles(), ...gameFiles()].map(p => readFileSync(ROOT + p, 'utf8')).join('');
}

// 只读侠客数据表（不跑游戏）：返回 HEROES，每项是 { id, skin, en, bal, char, forest, saga }
export function heroData() {
  return Function(dataFiles().map(p => readFileSync(ROOT + p, 'utf8')).join('\n') + '\nreturn HEROES;')();
}

// 只读电脑难度表（不跑游戏）：返回 DIFFICULTIES，每项是 { id, name, ai | blend, badge, badgeCol, desc, traits, foeHp, reward }
export function levelData() {
  return Function(dataFiles().map(p => readFileSync(ROOT + p, 'utf8')).join('\n') + '\nreturn DIFFICULTIES;')();
}

export function gameSource() {
  const brain = existsSync(ROOT + 'src/models/ai-brain.json') ? readFileSync(ROOT + 'src/models/ai-brain.json', 'utf8') : '{}';
  return `(typeof window !== 'undefined' ? window : globalThis).RENYING_AI_BRAIN = ${brain};\n`
    + readFileSync(ROOT + 'src/ai.js', 'utf8') + '\n' + gameJs();
}
