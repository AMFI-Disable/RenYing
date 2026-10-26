// 无画面沙盒用的游戏代码：训练好的 AI 数据 + src/ai.js + src/game/（和 tools/build.py 打包的顺序一样）
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;

// 游戏主体拆在 src/game/ 下，按文件名的编号顺序拼起来就是原来的整个 game.js
export function gameJs() {
  return readdirSync(ROOT + 'src/game').filter(n => /^\d\d-[a-z0-9-]+\.js$/.test(n)).sort().map(n => readFileSync(ROOT + 'src/game/' + n, 'utf8')).join('');
}

export function gameSource() {
  const brain = existsSync(ROOT + 'models/ai-brain.json') ? readFileSync(ROOT + 'models/ai-brain.json', 'utf8') : '{}';
  return `(typeof window !== 'undefined' ? window : globalThis).RENYING_AI_BRAIN = ${brain};\n`
    + readFileSync(ROOT + 'src/ai.js', 'utf8') + '\n' + gameJs();
}
