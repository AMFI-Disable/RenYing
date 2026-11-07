// Combat regression & capabilities test suite for RenYing.
// Tests every character's core combat moves, state transitions, inputs, combos,
// custom game mode AI, 2v2 co-op skills, and watch modes.
//
// Dual-mode execution:
//   1. Attempts CDP / Headless Chrome if available.
//   2. Seamlessly falls back to fast, self-contained in-process VM simulation
//      if Chrome is absent or process spawning is restricted.
// Usage: node tools/tests/combat-test.mjs
//
// 文件结构：
//   1. 准备运行环境：有 Chrome 就用 CDP 跑真浏览器，没有就在 node:vm 沙盒里跑（initRunner）
//   2. 初始化对局（训练场、站桩木人）
//   3. 依次执行 tools/tests/combat/ 下各组测试，打印 PASS / FAIL
//   4. 汇总，有失败就退出码 1
//
// 找 bug 提示：FAIL 后面是测试名，去 tools/tests/combat/*.mjs 开头的目录里找；
// 测试代码跑在游戏的全局作用域里，可以直接用 A、B、M、startMatch 这些全局变量复现。

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, openSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { gameSource } from '../ai/ai-code.mjs';
import combatStates from './combat/10-combat-states.mjs';
import heroAbilities from './combat/20-hero-abilities.mjs';
import modesAndAi from './combat/30-modes-and-ai.mjs';
import rulesAndArenas from './combat/40-rules-and-arenas.mjs';
import teamsAndPreMatch from './combat/50-teams-and-pre-match.mjs';
import mapsTerrainAndMatchups from './combat/60-maps-terrain-and-matchups.mjs';

console.log('===== RenYing Combat Mechanics & AI Capabilities Suite =====\n');

// ---------- 1. 准备运行环境 ----------
// Try launching CDP Chrome, or initialize in-process sandbox
let ev = null;
let cleanup = () => {};

async function initRunner() {
  const CHROME = process.env.RENYING_CHROME || [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(p => existsSync(p));

  const forceHeadless = process.argv.includes('--headless') || process.argv.includes('--sim');
  const preferChrome = process.argv.includes('--chrome') || !!process.env.RENYING_USE_CHROME;

  if (CHROME && !forceHeadless && preferChrome) {
    try {
      const PORT = +(process.env.RENYING_CDP_PORT || 9377);
      const GAME = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      // Verify game server is accessible before launching Chrome; otherwise use in-process sandbox
      const serverAlive = await fetch(GAME, { method: 'HEAD', signal: AbortSignal.timeout(1000) })
        .then(r => r.ok || r.status < 500)
        .catch(() => false);

      if (!serverAlive) {
        throw new Error('Local game server is not running on ' + GAME);
      }

      const OUT = join(tmpdir(), 'renying-combat-test');
      mkdirSync(OUT, { recursive: true });
      const LOG = `${OUT}/chrome.log`;

      class CDP {
        constructor(ws) {
          this.ws = ws; this.id = 0; this.pend = new Map();
          ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && this.pend.has(m.id)) {
              const { res, rej } = this.pend.get(m.id);
              this.pend.delete(m.id);
              m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
            }
          };
        }
        send(method, params = {}, sid) {
          const id = ++this.id;
          return new Promise((res, rej) => {
            this.pend.set(id, { res, rej });
            this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params }));
          });
        }
      }

      const logFd = openSync(LOG, 'w');
      const chrome = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', '--mute-audio', '--no-first-run', '--no-default-browser-check',
        `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
        `--user-data-dir=${OUT}/chrome`, 'about:blank',
      ], { stdio: ['ignore', logFd, logFd] });

      let wsUrl = null;
      for (let i = 0; i < 40 && !wsUrl; i++) {
        await sleep(150);
        try {
          const m = readFileSync(LOG, 'utf8').match(/DevTools listening on (ws:\/\/\S+)/);
          if (m) wsUrl = m[1];
        } catch {}
      }

      if (wsUrl) {
        const ws = new WebSocket(wsUrl);
        await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 4000); });
        const cdp = new CDP(ws);
        const { targetId } = await cdp.send('Target.createTarget', { url: GAME });
        const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        await cdp.send('Page.enable', {}, S);
        await cdp.send('Runtime.enable', {}, S);
        await sleep(1500);

        ev = async (expr) => {
          const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
          if (r.exceptionDetails) throw new Error('eval error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
          return r.result.value;
        };
        cleanup = () => { try { ws.close(); chrome.kill(); } catch (e) {} };
        console.log('[Runner] Connected via Chrome CDP.');
        return;
      }
    } catch (e) {
      // Fallback to in-process sandbox
    }
  }

  // Fast In-Process Sandbox Fallback
  console.log('[Runner] Executing in high-speed in-process sandbox.');
  const netCode = readFileSync('src/net-p2p.js', 'utf8');
  const gameCode = gameSource();
  const dummyEl = {
    getContext: () => ({
      fillRect: () => {}, clearRect: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
      stroke: () => {}, moveTo: () => {}, lineTo: () => {}, save: () => {}, restore: () => {},
      translate: () => {}, scale: () => {}, rotate: () => {}, measureText: () => ({ width: 10 }),
      fillText: () => {}, strokeText: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} })
    }),
    getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0, right: 1440, bottom: 900 }),
    addEventListener: () => {}, removeEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    style: {}, appendChild: () => {}, remove: () => {},
    querySelector: () => null, querySelectorAll: () => [],
    dataset: {}, getAttribute: () => null, setAttribute: () => {}, closest: () => null
  };

  const elCache = {};
  const getEl = id => {
    if (!elCache[id]) {
      elCache[id] = Object.assign({}, dummyEl, {
        id, textContent: '', innerHTML: '', style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }
      });
    }
    return elCache[id];
  };

  const sandbox = {
    window: { innerWidth: 1440, innerHeight: 900, addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ matches: false }) },
    document: { getElementById: id => getEl(id), querySelectorAll: () => [], querySelector: () => dummyEl, createElement: () => dummyEl, addEventListener: () => {}, removeEventListener: () => {}, body: dummyEl },
    location: { protocol: 'http:', hostname: '127.0.0.1', search: '', hash: '' },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); }
    },
    performance: { now: () => Date.now() },
    navigator: { userAgent: 'node' },
    requestAnimationFrame: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    AudioContext: class { createGain() { return { connect: () => {} }; } },
    Audio: class { play() {} pause() {} },
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440, innerHeight: 900, Math, Date
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  sandbox.window.location = sandbox.location;
  sandbox.globalThis = sandbox.window;
  Object.assign(sandbox.window, sandbox);
  vm.createContext(sandbox.window);

  new vm.Script(netCode).runInContext(sandbox.window);
  new vm.Script(gameCode).runInContext(sandbox.window);

  ev = async (expr) => {
    return vm.runInContext(expr, sandbox.window);
  };
}

await initRunner();

// ---------- 2. 初始化对局 ----------
// Initialize test state
await ev(`(() => {
  try {
    localStorage.setItem('renying-tut-seen','1');
    localStorage.setItem('renying-tut-done','1');
  } catch (e) {}
  startMatch('train', 'stand', [0, 1]);
  showScreen(null);
  paused = false;
  M.phase = 'fight';
  A.hp = A.maxHp;
  B.hp = B.maxHp;
})()`);

// ---------- 3. 依次执行各组测试 ----------
const testSuite = [
  ...combatStates,
  ...heroAbilities,
  ...modesAndAi,
  ...rulesAndArenas,
  ...teamsAndPreMatch,
  ...mapsTerrainAndMatchups,
];

let failed = 0;
for (const test of testSuite) {
  try {
    const res = await ev(test.fn);
    if (res.pass) {
      console.log(`  PASS  ${test.name}`);
    } else {
      console.log(`  FAIL  ${test.name} — ${res.error}`);
      failed++;
    }
  } catch (err) {
    console.log(`  FAIL  ${test.name} — Error: ${err.message}\n${err.stack}`);
    failed++;
  }
}

// ---------- 4. 汇总 ----------
cleanup();

if (failed > 0) {
  console.log(`\nFAIL: ${failed} combat mechanics check(s) failed.`);
  process.exit(1);
} else {
  console.log(`\nPASS: All ${testSuite.length} combat mechanics checks passed.`);
  process.exit(0);
}
