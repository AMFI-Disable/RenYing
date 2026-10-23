// 无画面沙盒用的游戏代码：训练好的 AI 数据 + src/ai.js + src/game.js（和 tools/build.py 打包的顺序一样）
import { readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;

export function gameSource() {
  const brain = existsSync(ROOT + 'models/ai-brain.json') ? readFileSync(ROOT + 'models/ai-brain.json', 'utf8') : '{}';
  return `(typeof window !== 'undefined' ? window : globalThis).RENYING_AI_BRAIN = ${brain};\n`
    + readFileSync(ROOT + 'src/ai.js', 'utf8') + '\n' + readFileSync(ROOT + 'src/game.js', 'utf8');
}
