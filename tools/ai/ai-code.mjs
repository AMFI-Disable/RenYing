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

function walkGameJs(dir, relPrefix = []) {
  const out = [];
  for (const name of readdirSync(ROOT + dir).sort()) {
    const full = dir + '/' + name;
    if (isDir(full)) {
      out.push(...walkGameJs(full, [...relPrefix, name]));
    } else if (/^[a-z0-9-]+\.js$/.test(name)) {
      const parts = [...relPrefix, name];
      const key = parts.length >= 2 && /^(01-engine|02-combat|03-render|04-modes|05-ui)$/.test(parts[0])
        ? parts.slice(1).join('/')
        : parts.join('/');
      out.push({ key, path: full });
    }
  }
  return out;
}

// 游戏主体：先是 src/data/ 的数据表，再是 src/game/（含多层子目录）按编号路径排好的文件
export function gameFiles() {
  const items = walkGameJs('src/game');
  items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
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
