// Keep the historical command stable while loading the shared-state economy scenarios in order.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const partsDir = resolve(here, 'econ');
const parts = readdirSync(partsDir)
  .filter(name => /^\d\d-[a-z0-9-]+\.mjs$/.test(name))
  .sort()
  .map(name => readFileSync(resolve(partsDir, name), 'utf8'));
const source = parts.join('\n')
  .replace("'__AI_CODE_URL__'", JSON.stringify(pathToFileURL(resolve(here, '../ai/ai-code.mjs')).href))
  .replace("'__ROOT_URL__'", JSON.stringify(pathToFileURL(repoRoot + '/').href));

if (!source.includes('new URL(' + JSON.stringify(pathToFileURL(repoRoot + '/').href) + ')')) {
  throw new Error('Economy test setup did not receive the repository URL');
}

await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
