// 无画面沙盒用的游戏代码：训练好的 AI 数据 + src/ai.js + src/data/ + src/game/（和 tools/build.py 打包的顺序一样）
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;

const numbered = dir => readdirSync(ROOT + dir).filter(n => /^\d\d-[a-z0-9-]+\.js$/.test(n)).sort().map(n => dir + '/' + n);
const isDir = p => statSync(ROOT + p).isDirectory();

// 数据表在 src/data/（本层的文件在前，再是 heroes/ 这样的子目录），和 tools/build.py 的 data_parts() 一样
export function dataFiles() {
  const subs = readdirSync(ROOT + 'src/data').filter(d => isDir('src/data/' + d)).sort();
  return [...numbered('src/data'), ...subs.flatMap(d => numbered('src/data/' + d))];
}

// 游戏主体：先是 src/data/ 的数据表，再是 src/game/ 下按文件名的编号顺序拼起来的原来整个 game.js
export function gameJs() {
  return [...dataFiles(), ...numbered('src/game')].map(p => readFileSync(ROOT + p, 'utf8')).join('');
}

// 只读侠客数据表（不跑游戏）：返回 HEROES，每项是 { id, skin, en, bal, char, forest, saga }
export function heroData() {
  return Function(dataFiles().map(p => readFileSync(ROOT + p, 'utf8')).join('\n') + '\nreturn HEROES;')();
}

export function gameSource() {
  const brain = existsSync(ROOT + 'models/ai-brain.json') ? readFileSync(ROOT + 'models/ai-brain.json', 'utf8') : '{}';
  return `(typeof window !== 'undefined' ? window : globalThis).RENYING_AI_BRAIN = ${brain};\n`
    + readFileSync(ROOT + 'src/ai.js', 'utf8') + '\n' + gameJs();
}
