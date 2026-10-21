// Combat regression & capabilities test suite for RenYing.
// Tests every character's core combat moves, state transitions, inputs, combos,
// custom game mode AI, 2v2 co-op skills, and watch modes.
//
// Dual-mode execution:
//   1. Attempts CDP / Headless Chrome if available.
//   2. Seamlessly falls back to fast, self-contained in-process VM simulation
//      if Chrome is absent or process spawning is restricted.
// Usage: node tools/combat-test.mjs

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, openSync, existsSync } from 'node:fs';
import vm from 'node:vm';

console.log('===== RenYing Combat Mechanics & AI Capabilities Suite =====\n');

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

  if (CHROME && !forceHeadless) {
    try {
      const PORT = +(process.env.RENYING_CDP_PORT || 9377);
      const GAME = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
      const OUT = join(tmpdir(), 'renying-combat-test');
      mkdirSync(OUT, { recursive: true });
      const LOG = `${OUT}/chrome.log`;
      const sleep = ms => new Promise(r => setTimeout(r, ms));

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
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        await cdp.send('Page.enable', {}, S);
        await cdp.send('Runtime.enable', {}, S);

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
  const gameCode = readFileSync('src/game.js', 'utf8');
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

  const sandbox = {
    window: { innerWidth: 1440, innerHeight: 900, addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ matches: false }) },
    document: { getElementById: () => dummyEl, querySelectorAll: () => [], querySelector: () => dummyEl, createElement: () => dummyEl, addEventListener: () => {}, removeEventListener: () => {}, body: dummyEl },
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

// Initialize test state
await ev(`
  localStorage.setItem('renying-tut-seen','1');
  localStorage.setItem('renying-tut-done','1');
  startMatch('train', 'stand', [0, 1]);
  showScreen(null);
  paused = false;
  M.phase = 'fight';
  A.hp = A.maxHp;
  B.hp = B.maxHp;
`);

const testSuite = [
  {
    name: 'Charge attack transitions from neutral',
    fn: `(() => {
      M.phase = 'fight';
      toNeutral(A);
      const c = A.ctrl;
      c.held.atk = true;
      c.atkT = clock - (CHARGE_START + 0.1);
      neutral(A, B);
      const inCharge = A.state === 'charge';
      if (!inCharge) return { pass: false, error: 'Failed to enter charge state from neutral: ' + A.state };
      c.held.atk = false;
      A.chargeFull = false;
      updateFighter(A, B);
      const released = A.state === 'attack' && A.moveName === 'cs1';
      toNeutral(A);
      return { pass: inCharge && released, error: released ? null : 'Failed to release cs1 attack' };
    })()`
  },
  {
    name: 'Full charge attack release (cs2)',
    fn: `(() => {
      M.phase = 'fight';
      toNeutral(A);
      const c = A.ctrl;
      c.held.atk = true;
      c.atkT = clock - (CHARGE_START + 0.1);
      neutral(A, B);
      A.t = CHARGE_FULL + 0.1;
      A.chargeFull = true;
      c.held.atk = false;
      updateFighter(A, B);
      const released = A.state === 'attack' && A.moveName === 'cs2';
      toNeutral(A);
      return { pass: released, error: released ? null : 'Failed to trigger cs2 on full charge release' };
    })()`
  },
  {
    name: 'Charge transition from blockstun recovery',
    fn: `(() => {
      M.phase = 'fight';
      toNeutral(A);
      A.state = 'blockstun';
      A.t = 0.5;
      A.stun = 0.1;
      const c = A.ctrl;
      c.held.atk = true;
      c.atkT = clock - (CHARGE_START + 0.1);
      updateFighter(A, B);
      const inCharge = A.state === 'charge';
      toNeutral(A);
      return { pass: inCharge, error: inCharge ? null : 'Failed to transition to charge from blockstun recovery' };
    })()`
  },
  {
    name: 'Down attack (dl) exists and is executable for all characters',
    fn: `(() => {
      for (let ci = 0; ci < CHARS.length; ci++) {
        setChars(ci, (ci + 1) % CHARS.length);
        toNeutral(A);
        const m = A.moves.dl;
        if (!m) return { pass: false, error: CHARS[ci].name + ' missing dl move' };
        startAttack(A, 'dl');
        if (A.state !== 'attack' || A.moveName !== 'dl') {
          return { pass: false, error: CHARS[ci].name + ' failed startAttack dl' };
        }
      }
      toNeutral(A);
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'All characters normal attack chain (l1 -> l2/next)',
    fn: `(() => {
      for (let ci = 0; ci < CHARS.length; ci++) {
        setChars(ci, (ci + 1) % CHARS.length);
        toNeutral(A);
        startAttack(A, 'l1');
        if (A.state !== 'attack' || A.moveName !== 'l1') {
          return { pass: false, error: CHARS[ci].name + ' failed to execute l1' };
        }
        const m1 = A.moves.l1;
        if (!m1 || !m1.next || !m1.next.light) {
          return { pass: false, error: CHARS[ci].name + ' l1 has no next light move' };
        }
      }
      toNeutral(A);
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'All characters skills (skill1, skill2) and ult activation',
    fn: `(() => {
      for (let ci = 0; ci < CHARS.length; ci++) {
        setChars(ci, (ci + 1) % CHARS.length);
        toNeutral(A);
        A.skillCD = 0;
        startSkill(A, B, 1);
        if (A.state !== 'skill' && A.state !== 'attack') {
          return { pass: false, error: CHARS[ci].name + ' failed skill 1 activation' };
        }
        toNeutral(A);
        A.skill2CD = 0;
        const gate = SKILLS[A.ch.skill2].can;
        if (gate) {
          A.drunk = 0; startSkill(A, B, 2);
          if (A.state === 'skill' || A.skill2CD > 0) return { pass: false, error: CHARS[ci].name + ' skill 2 fired without meeting condition' };
          A.drunk = 100;
        }
        startSkill(A, B, 2);
        if (A.state !== 'skill' && A.state !== 'attack') {
          return { pass: false, error: CHARS[ci].name + ' failed skill 2 activation' };
        }
        toNeutral(A);
        A.meter = 100;
        startSpecial(A);
        if (A.state !== 'special') {
          return { pass: false, error: CHARS[ci].name + ' failed ult activation with full meter' };
        }
      }
      toNeutral(A);
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Air attacks (a1, a2) execution for all characters',
    fn: `(() => {
      for (let ci = 0; ci < CHARS.length; ci++) {
        setChars(ci, (ci + 1) % CHARS.length);
        toNeutral(A);
        A.y = -80;
        A.vy = -5;
        startAttack(A, 'a1');
        if (A.state !== 'attack' || A.moveName !== 'a1') {
          return { pass: false, error: CHARS[ci].name + ' failed aerial attack a1' };
        }
        toNeutral(A);
        A.y = -80;
        startAttack(A, 'a2');
        if (A.state !== 'attack' || A.moveName !== 'a2') {
          return { pass: false, error: CHARS[ci].name + ' failed aerial dive a2' };
        }
      }
      toNeutral(A);
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Supported 6 game modes correspond to appropriate AI levels and configs',
    fn: `(() => {
      // 1. 1v1 CPU
      startMatch('cpu', 'god', [0, 1], true);
      if (M.mode !== 'cpu' || !M.watchAi || B.ctrl.level !== 'god' || STAGE_W !== 1800) {
        return { pass: false, error: '1v1 CPU watch mode setup mismatch' };
      }

      // 2. One-Hit Mode (1-HP lethality)
      startBushido(0, 1, 'god', true);
      if (M.mode !== 'bushido' || !M.watchAi || A.maxHp !== 1 || B.maxHp !== 1) {
        return { pass: false, error: 'One-Hit mode 1-HP lethality watch setup failed' };
      }

      // 3. Chaos Mode
      startChaos(0, 1, 'god', true);
      if (M.mode !== 'chaos' || !M.watchAi || M.level !== 'god') {
        return { pass: false, error: 'Chaos mode watch setup failed' };
      }

      // 4. Tag3 Mode (3v3 relay)
      startTag3Match([0, 1, 2], [3, 4, 5], 'god', true);
      if (M.mode !== 'tag3' || !M.watchAi || (M.teams[0] || []).length !== 3) {
        return { pass: false, error: 'Tag3 mode 3-hero squad watch setup failed' };
      }

      // 5. Mayhem Mode (10x meter / instant cooldowns)
      startMayhem(0, 1, 'god', true);
      if (M.mode !== 'mayhem' || !M.watchAi || A.meter !== 100 || B.meter !== 100) {
        return { pass: false, error: 'Mayhem mode 100% meter watch setup failed' };
      }

      // 6. 2v2 Watch Mode (4 TianDao God bots, 2600 stage)
      startWatch2v2([0, 1, 2, 3, 4, 5]);
      if (M.mode !== 'watch2v2' || !M.watchAi || STAGE_W !== 2600 || !A.ctrl || !B.ctrl || !C.ctrl || !D.ctrl) {
        return { pass: false, error: 'Watch2v2 mode 4-bot TianDao setup failed' };
      }

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '1v1 Watch Mode transitions onto authentic Ban & Pick (#bp) screen',
    fn: `(() => {
      bpStart('cpuWatch');
      if (bpMode !== 'cpuWatch' || !BP || BP.step !== 0) {
        return { pass: false, error: 'bpStart(cpuWatch) failed to initialize BP state' };
      }
      if (!isAiVsAi()) {
        return { pass: false, error: 'isAiVsAi() should be true during cpuWatch BP' };
      }
      // Simulate 4 steps of AI drafting
      for (let s = 0; s < 4; s++) {
        const choice = bpCpuChoice();
        if (choice < 0 || choice >= CHARS.length) {
          return { pass: false, error: 'bpCpuChoice() returned invalid hero idx: ' + choice };
        }
        bpApply(choice);
      }
      if (BP.step !== 4 || BP.bans[0] < 0 || BP.bans[1] < 0 || BP.picks[0] < 0 || BP.picks[1] < 0) {
        return { pass: false, error: 'cpuWatch BP failed to complete 4-step draft' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'isAiVsAi() prevents window blur pausing in all watch modes',
    fn: `(() => {
      // Normal 1v1 PvC should pause on blur
      startMatch('cpu', 'normal', [0, 1], false);
      if (isAiVsAi()) return { pass: false, error: 'PvC should not be isAiVsAi' };

      // 1v1 Watch mode should NOT pause
      startMatch('cpu', 'god', [0, 1], true);
      if (!isAiVsAi()) return { pass: false, error: 'cpu watch should be isAiVsAi' };

      // 2v2 Watch mode should NOT pause
      startWatch2v2([0, 1, 2, 3, 4, 5]);
      if (!isAiVsAi()) return { pass: false, error: 'watch2v2 should be isAiVsAi' };

      // Mayhem watch mode should NOT pause
      startMayhem(0, 1, 'god', true);
      if (!isAiVsAi()) return { pass: false, error: 'mayhem watch should be isAiVsAi' };

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 AI evaluates LingDan / Altar Buff site contesting and opponent denial',
    fn: `(() => {
      startWatch2v2([0, 1, 2, 3, 4, 5]);
      M.phase = 'fight';
      const cx = STAGE_W / 2;

      // Scenario 1: Active LingDan relic with wounded fighter -> AI seeks LingDan
      ARENA2V2.orb.active = true;
      ARENA2V2.orb.kind = 1; // 太阴灵丹
      A.hp = 120;
      A.x = cx - 220;
      A.face = 1;
      B.x = cx + 500;
      D.x = cx + 600;
      A.ctrl.queue = [];
      A.ctrl.next = clock - 0.1;
      A.ctrl.think(A, foeOf(A));

      if (A.ctrl.dir !== 1) {
        return { pass: false, error: 'Injured AI failed to navigate towards LingDan relic at altar (dir=' + A.ctrl.dir + ')' };
      }

      // Scenario 2: Opponent approaches altar -> AI positions to contest and block
      ARENA2V2.orb.active = true;
      ARENA2V2.orb.kind = 0;
      A.hp = A.maxHp;
      A.x = cx - 70;
      B.x = cx - 180;
      B.face = 1;
      A.face = -1;
      A.ctrl.queue = [];
      A.ctrl.next = clock - 0.1;
      A.ctrl.think(A, B);

      if (A.ctrl.dir !== -1 && !A.ctrl.queue.length) {
        return { pass: false, error: 'AI failed to intercept or block opponent approaching altar relic' };
      }

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 Co-op: Both fighters on each team act in parallel without freezing',
    fn: `(() => {
      startWatch2v2([0, 1, 2, 3, 4, 5]);
      M.phase = 'fight';
      for (let s = 0; s < 120; s++) {
        step();
      }
      if (A.state === 'held' || B.state === 'held' || C.state === 'held' || D.state === 'held') {
        return { pass: false, error: 'Fighter stuck in held state during 2v2 co-op combat' };
      }
      if (A.hp <= 0 && C.hp <= 0 && B.hp <= 0 && D.hp <= 0) {
        return { pass: false, error: 'All 4 fighters died prematurely' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  }
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

cleanup();

if (failed > 0) {
  console.log(`\nFAIL: ${failed} combat mechanics check(s) failed.`);
  process.exit(1);
} else {
  console.log(`\nPASS: All ${testSuite.length} combat mechanics checks passed.`);
  process.exit(0);
}
