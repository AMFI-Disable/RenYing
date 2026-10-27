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
import { gameSource } from './ai-code.mjs';

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
        if (gate) {   // 有使用条件的技能（醉翁与民同乐要半壶酒，墨羽画符要 3 格墨水）：条件不够时不能放，也不扣冷却
          A.drunk = 0; A.ink = 0; startSkill(A, B, 2);
          if (A.state === 'skill' || A.skill2CD > 0) return { pass: false, error: CHARS[ci].name + ' skill 2 fired without meeting its condition' };
          A.drunk = 100; A.ink = 100; A.fu = 0;
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
    name: 'Supported 5 game modes correspond to appropriate AI levels and configs',
    fn: `(() => {
      // 1. 1v1 CPU
      startMatch('cpu', 'god', [0, 1], true);
      if (M.mode !== 'cpu' || !M.watchAi || B.ctrl.level !== 'god' || STAGE_W !== 1800) {
        return { pass: false, error: '1v1 CPU watch mode setup mismatch' };
      }

      // 2. Chaos Mode
      startChaos(0, 1, 'god', true);
      if (M.mode !== 'chaos' || !M.watchAi || M.level !== 'god') {
        return { pass: false, error: 'Chaos mode watch setup failed' };
      }

      // 3. Tag3 Mode (3v3 relay)
      startTag3Match([0, 1, 2], [3, 4, 5], 'god', true);
      if (M.mode !== 'tag3' || !M.watchAi || (M.teams[0] || []).length !== 3) {
        return { pass: false, error: 'Tag3 mode 3-hero squad watch setup failed' };
      }

      // 3b. 人机 1v1：每回合双方满血
      startMatch('cpu', 'normal', [0, 2]);
      A.hp = 50; B.hp = 0; M.koWinner = 0; endRound();
      if (A.hp !== A.maxHp || B.hp !== B.maxHp || A.chIdx !== 0 || B.chIdx !== 2) {
        return { pass: false, error: 'CPU 1v1 should restore full HP each round: ' + [A.hp, A.maxHp, B.hp, B.maxHp].join('/') };
      }

      // 3c. 联机三人车轮接力：输一回合的一方换下一名侠客满血上，赢的人带血 +CARRY_HEAL，三人都倒才算输
      startMatch('cpu', 'god', [[0, 1, 4], [2, 3, 5]], true); M.mode = 'net';
      if (!M.duo || A.chIdx !== 0 || B.chIdx !== 2) {
        return { pass: false, error: 'Duo match should start with the first picks' };
      }
      A.hp = 50; B.hp = 0; M.koWinner = 0; endRound();
      if (B.chIdx !== 3 || B.hp !== B.maxHp || A.chIdx !== 0 || A.hp !== Math.min(A.maxHp, 50 + CARRY_HEAL)) {
        return { pass: false, error: 'Duo relay 1 mismatch: ' + [A.chIdx, A.hp, B.chIdx, B.hp, B.maxHp].join('/') };
      }
      A.hp = 0; B.hp = 30; M.koWinner = 1; endRound();
      if (A.chIdx !== 1 || A.hp !== A.maxHp || B.chIdx !== 3 || B.hp !== Math.min(B.maxHp, 30 + CARRY_HEAL) || M.phase === 'end') {
        return { pass: false, error: 'Duo relay 2 mismatch: ' + [A.chIdx, A.hp, B.chIdx, B.hp, M.phase].join('/') };
      }
      A.hp = 0; B.hp = 40; M.koWinner = 1; endRound();
      if (A.chIdx !== 4 || A.hp !== A.maxHp || B.chIdx !== 3 || B.hp !== Math.min(B.maxHp, 40 + CARRY_HEAL) || M.phase === 'end') {
        return { pass: false, error: 'Duo relay 3 mismatch: ' + [A.chIdx, A.hp, B.chIdx, B.hp, M.phase].join('/') };
      }
      A.hp = 0; B.hp = 20; M.koWinner = 1; endRound();
      if (M.phase !== 'end' || M.wins[1] !== 3) {
        return { pass: false, error: 'Duo 3v3 tag match should end after 3 wins: ' + [M.phase, M.wins].join('/') };
      }
      M.mode = 'cpu';

      // 4. Mayhem Mode (10x meter / instant cooldowns)
      startMayhem(0, 1, 'god', true);
      if (M.mode !== 'mayhem' || !M.watchAi || A.meter !== 100 || B.meter !== 100) {
        return { pass: false, error: 'Mayhem mode 100% meter watch setup failed' };
      }

      // 5. 2v2 Watch Mode (4 TianDao God bots, 2600 stage)
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
      A.ctrl.brain.queue.length = 0;
      A.ctrl.brain.next = clock - 0.1;
      A.ctrl.think(A, foeOf(A));

      if (A.ctrl.brain.dir !== 1) {
        return { pass: false, error: 'Injured AI failed to navigate towards LingDan relic at altar (dir=' + A.ctrl.brain.dir + ')' };
      }

      // Scenario 2: Opponent approaches altar -> AI positions to contest and block
      ARENA2V2.orb.active = true;
      ARENA2V2.orb.kind = 0;
      A.hp = A.maxHp;
      A.x = cx - 70;
      C.x = cx - 500;
      B.x = cx - 180;
      B.face = 1;
      A.face = -1;
      A.ctrl.brain.queue.length = 0;
      A.ctrl.brain.next = clock - 0.1;
      A.ctrl.think(A, B);

      if (A.ctrl.brain.dir !== -1 && !A.ctrl.brain.queue.length) {
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
  },
  {
    name: '2v2 Two Players vs Two Players: All circumstances duo initialization & team assignment',
    fn: `(() => {
      // Test distinct duo combinations
      const testDuoPairs = [
        [[0, 2], [1, 3]],
        [[4, 5], [6, 7]],
        [[8, 9], [10, 11]]
      ];
      for (const [duoA, duoB] of testDuoPairs) {
        startWatch2v2([0, 1, duoA[0], duoB[0], duoB[1], duoA[1]]);
        if (M.mode !== 'watch2v2' || STAGE_W !== 2600) {
          return { pass: false, error: 'Failed 2v2 stage initialization for duos' };
        }
        if (A.idx !== 0 || C.idx !== 2 || B.idx !== 1 || D.idx !== 3) {
          return { pass: false, error: 'Fighter index team mismatch in 2v2 duo' };
        }
        if (A.ch.id !== CHARS[duoA[0]].id || C.ch.id !== CHARS[duoA[1]].id) {
          return { pass: false, error: 'Team 0 duo hero mismatch' };
        }
        if (B.ch.id !== CHARS[duoB[0]].id || D.ch.id !== CHARS[duoB[1]].id) {
          return { pass: false, error: 'Team 1 duo hero mismatch' };
        }
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 AI: every fighter is driven by the AI brain and the fight goes on',
    fn: `(() => {
      startWatch2v2([0, 0, 2, 1, 1, 3]);
      for (const f of [A, B, C, D]) if (!(f.ctrl && f.ctrl.brain instanceof AIBrain)) return { pass: false, error: 'fighter without AIBrain' };
      const hp0 = A.hp + B.hp + C.hp + D.hp;
      for (let i = 0; i < 120 * 20; i++) step();
      const hp1 = A.hp + B.hp + C.hp + D.hp;
      toMenu();
      if (!(hp1 < hp0)) return { pass: false, error: 'no damage dealt in 20 s of 2v2' };
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 Elimination: Full match resolution awarding victory to surviving 2-player team',
    fn: `(() => {
      startWatch2v2([0, 0, 2, 1, 1, 3]);
      M.phase = 'fight';
      M.wins = [0, 0];
      // Eliminate both Team 1 fighters
      B.hp = 0; B.state = 'lying';
      D.hp = 0; D.state = 'lying';
      A.hp = 200; C.hp = 250;
      step(); // triggers KO transition
      const enteredKo = (M.phase === 'ko' && M.koWinner === 0);
      if (!enteredKo) return { pass: false, error: 'Failed to transition to KO phase for Team 0 victory: ' + M.phase };
      // Step past KO celebratory delay (2.8s = ~340 steps)
      for (let s = 0; s < 360; s++) {
        step();
      }
      const roundResolved = M.wins[0] >= 1 || M.phase === 'roundEnd' || M.phase === 'intro';
      toMenu();
      return { pass: enteredKo && roundResolved, error: roundResolved ? null : 'Failed to finalize round resolution after KO' };
    })()`
  },
  {
    name: '2v2 Single KO Survival: One fighter dying does not trigger KO when teammate is alive',
    fn: `(() => {
      // Test player 2v2 modes: pp_cc, pp_pp
      for (const mode of ['pp_cc', 'pp_pp']) {
        if (mode === 'pp_cc') start2v2LocalCoop(0, 2, 1, 3, 'normal');
        else start2v2LocalVs(0, 2, 1, 3);

        M.phase = 'fight';
        M.wins = [0, 0];
        // 背水加成每个 fighter 每场只给一次，所以先清掉上一轮模式留下的标记；
        // 另外加成给的是"立刻满怒气"，AI 下一步就可能把怒气放掉，所以要在这之前读。
        M.flags = M.flags || {};
        delete M.flags['buff_' + D.idx];
        D.meter = 0;
        // Team 1: Kill B only, D is still healthy
        B.hp = 0;
        D.hp = 250;
        A.hp = 200;
        C.hp = 200;

        // Simulate combat hit triggering on B
        applyHit(A, B, { dmg: 50, kb: [200, -200], stun: 0.3 }, [B.x, B.y - 40]);
        const buffed = !!M.flags['buff_' + D.idx];
        const meterNow = D.meter;   // step() 之前读：AI 可能马上把怒气用在绝招上
        step();

        // Must remain in fight phase because teammate D is alive
        if (M.phase !== 'fight') {
          toMenu();
          return { pass: false, error: 'Premature KO triggered when teammate was still alive in ' + mode + ': phase=' + M.phase };
        }
        if (!buffed || meterNow !== 100) {
          toMenu();
          return { pass: false, error: 'Surviving teammate did not receive last stand meter buff in ' + mode + ': meter=' + meterNow + ', buff=' + buffed };
        }

        // Now kill the remaining teammate D
        D.hp = 0;
        applyHit(A, D, { dmg: 50, kb: [200, -200], stun: 0.3 }, [D.x, D.y - 40]);
        step();

        if (M.phase !== 'ko' || M.koWinner !== 0) {
          toMenu();
          return { pass: false, error: 'Expected Team 0 KO victory after both Team 1 fighters defeated in ' + mode + ': phase=' + M.phase + ', winner=' + M.koWinner };
        }
        toMenu();
      }
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'AI Brain Model: Frame data & evolved genes validation across all heroes',
    fn: `(() => {
      const brain = typeof window !== 'undefined' ? window.RENYING_AI_BRAIN : null;
      if (!brain || !brain.frames || !brain.genes) {
        return { pass: false, error: 'window.RENYING_AI_BRAIN missing frames or genes' };
      }
      for (const ch of CHARS) {
        if (!brain.frames[ch.id] || !brain.frames[ch.id].l1) {
          return { pass: false, error: 'Missing frame data for hero: ' + ch.id };
        }
        if (!brain.genes[ch.id] || typeof brain.genes[ch.id].aggr !== 'number') {
          return { pass: false, error: 'Missing evolved genes for hero: ' + ch.id };
        }
      }
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 is only P&PvC&C or P&PvP&P: the player + AI teammate mode is gone, 2v2 runs on the 2600 arena',
    fn: `(() => {
      if (typeof start2v2PlayerMatch !== 'undefined') return { pass: false, error: 'player + AI teammate 2v2 (pc_cc) should be removed' };
      for (const sub of ['pp_cc', 'pp_pp']) {
        if (sub === 'pp_cc') start2v2LocalCoop(0, 2, 1, 3, 'normal'); else start2v2LocalVs(0, 2, 1, 3);
        if (STAGE_W !== 2600) return { pass: false, error: 'Expected 2600 stage width in 2v2 ' + sub + ', got: ' + STAGE_W };
        if (A.ctrl !== human[0] || C.ctrl !== human[1]) return { pass: false, error: sub + ': 1P and 2P should control A and C' };
        if (isAiVsAi()) return { pass: false, error: sub + ': isAiVsAi() should be false when players participate' };
        toMenu();
      }
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 P&PvC&C Mode: 1P controls A, 2P controls C, 2 AI opponents on Team 1',
    fn: `(() => {
      start2v2LocalCoop(0, 2, 1, 3, 'normal');
      if (M.mode !== '2v2' || M.subMode !== 'pp_cc') {
        return { pass: false, error: 'P&PvC&C mode state flags mismatch' };
      }
      if (A.ctrl !== human[0] || C.ctrl !== human[1]) {
        return { pass: false, error: '1P and 2P controllers not bound to A and C' };
      }
      if (!(B.ctrl instanceof AICtrl) || !(D.ctrl instanceof AICtrl)) {
        return { pass: false, error: 'Opponents B and D should be AICtrl' };
      }
      if (localTeam() !== 0) {
        return { pass: false, error: 'Both players in P&PvC&C co-op should be on Team 0' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 P&PvP&P Mode: 4-Player setup across two teams on 2600 stage',
    fn: `(() => {
      start2v2LocalVs(0, 2, 1, 3);
      if (M.mode !== '2v2' || M.subMode !== 'pp_pp') {
        return { pass: false, error: 'P&PvP&P mode state flags mismatch' };
      }
      if (STAGE_W !== 2600) {
        return { pass: false, error: 'Expected 2600 stage width in 2v2' };
      }
      if (A.ctrl !== human[0] || C.ctrl !== human[1]) {
        return { pass: false, error: '1P and 2P not bound to Team 0 (A & C)' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Home page live online count display updates correctly',
    fn: `(() => {
      refreshOnline();
      const el = document.getElementById('homeOnlineCount');
      if (!el || !el.textContent || !el.textContent.includes('人在线')) {
        return { pass: false, error: 'homeOnlineCount element missing or not populated' };
      }
      const cardEl = document.getElementById('homeOnlineCardNum');
      if (!cardEl || !cardEl.textContent || !cardEl.textContent.includes('位侠士在线')) {
        return { pass: false, error: 'homeOnlineCardNum element missing or not populated' };
      }
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'All heroes runtime maxHp, weight, reach, fly, and passives match hero settings',
    fn: `(() => {
      const expectedHp = {
        qingfeng: 510, feiying: 470, tieshan: 530, lingshuang: 480,
        liuyun: 495, leiming: 520, moyu: 485, yuehua: 460,
        yanling: 440, yuxiao: 455, zuixian: 520, gouchen: 490,
        lingque: 465
      };
      for (let ci = 0; ci < CHARS.length; ci++) {
        const ch = CHARS[ci];
        setChars(ci, (ci + 1) % CHARS.length);
        A.reset(200);
        if (A.maxHp !== expectedHp[ch.id] || A.hp !== expectedHp[ch.id]) {
          return { pass: false, error: ch.name + ' maxHp mismatch: got ' + A.maxHp + ', expected ' + expectedHp[ch.id] };
        }
      }
      if (CHARS[2].stat.weight !== 1.35) return { pass: false, error: 'TieShan weight mismatch' };
      if (CHARS[3].stat.weight !== 1.05) return { pass: false, error: 'LingShuang weight mismatch' };
      if (CHARS[6].stat.weight !== 1.10) return { pass: false, error: 'MoYu weight mismatch' };
      if (CHARS[8].fly !== 1.2) return { pass: false, error: 'YanLing fly duration mismatch' };
      if (CHARS[10].stat.reach !== 0.86) return { pass: false, error: 'ZuiXian reach mismatch' };
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Manual aim default: Attacks, skills, and XuLiZhan (cs1/cs2) aim in player direction away from opponent',
    fn: `(() => {
      if (SETTINGS.aim !== true) return { pass: false, error: 'Expected SETTINGS.aim default to be true (manual aim by A/D)' };
      startMatch('train', 'stand', [0, 1]);
      M.phase = 'fight';
      A.x = 700; B.x = 1000; // Opponent B is to the right (+1)
      const c = A.ctrl;
      c.held.left = false; c.held.right = false; c.held.down = false;
      c.held.aim = -1; // Player aims left (-1), away from opponent B

      // 1. Normal attack aims in player direction (-1)
      toNeutral(A);
      startAttack(A, 'l1');
      if (A.face !== -1) return { pass: false, error: 'Normal attack l1 snapped to opponent instead of manual aim (-1)' };

      // 2. Skill aims in player direction (-1)
      toNeutral(A);
      A.skillCD = 0;
      startSkill(A, B, 1);
      if (A.face !== -1) return { pass: false, error: 'Skill 1 snapped to opponent instead of manual aim (-1)' };

      // 3. XuLiZhan (cs1 & cs2) aims and lunges away from opponent (-1)
      toNeutral(A);
      A.x = 700;
      c.held.atk = true;
      c.atkT = clock - (CHARGE_START + 0.1);
      neutral(A, B);
      A.t = CHARGE_FULL + 0.1;
      A.chargeFull = true;
      c.held.atk = false;
      updateFighter(A, B); // releases cs2
      if (A.moveName !== 'cs2' || A.face !== -1) {
        return { pass: false, error: 'XuLiZhan cs2 failed to keep manual aim (-1): move=' + A.moveName + ', face=' + A.face };
      }
      for (let i = 0; i < 8; i++) updateFighter(A, B);
      if (!(A.vx < -500)) {
        return { pass: false, error: 'XuLiZhan cs2 did not lunge away from opponent (vx=' + A.vx + ')' };
      }
      toNeutral(A);
      c.held.aim = 1;
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Net 1v1 BP chooses 3 heroes per side (BP_TAG3_STEPS) and passes duo to rollStart for 3v3 tag relay',
    fn: `(() => {
      const prevRole = NET.role, prevRoomMode = netRoomMode;
      NET.role = 'host';
      netRoomMode = 'normal';
      bpStart('net');
      if (!BP || BP.steps.length !== 8 || BP.picks[0].length !== 3 || BP.picks[1].length !== 3) {
        return { pass: false, error: 'Net 1v1 BP did not initialize 8-step 3-pick draft' };
      }
      // Execute all 8 steps (2 bans + 6 picks)
      const seq = [0, 1, 2, 3, 4, 5, 6, 7];
      for (const ch of seq) bpApply(ch);
      if (BP.step !== 8 || BP.picks[0].join(',') !== '2,5,6' || BP.picks[1].join(',') !== '3,4,7') {
        return { pass: false, error: 'Net 1v1 BP snake picks mismatch: ' + JSON.stringify(BP.picks) };
      }
      currentScreen = 'bp';
      bpFinish();
      if (!M.duo || M.duo[0].join(',') !== '2,5,6' || M.duo[1].join(',') !== '3,4,7') {
        return { pass: false, error: 'bpFinish(net) did not pass 3-hero duo to rollStart: ' + JSON.stringify(M.duo) };
      }
      if (A.chIdx !== 2 || B.chIdx !== 3) {
        return { pass: false, error: 'Initial fighters mismatch: ' + A.chIdx + ' vs ' + B.chIdx };
      }
      // Simulate Round 1 win for Side 0 -> Side 1 relays to 2nd hero (4)
      A.hp = 100; B.hp = 0; M.koWinner = 0; endRound();
      if (B.chIdx !== 4 || A.chIdx !== 2 || M.phase === 'end') {
        return { pass: false, error: 'Net 1v1 failed to relay to 2nd hero after Round 1: B=' + B.chIdx };
      }
      // Simulate Round 2 win for Side 0 -> Side 1 relays to 3rd hero (7)
      A.hp = 80; B.hp = 0; M.koWinner = 0; endRound();
      if (B.chIdx !== 7 || A.chIdx !== 2 || M.phase === 'end') {
        return { pass: false, error: 'Net 1v1 failed to relay to 3rd hero after Round 2: B=' + B.chIdx };
      }
      // Simulate Round 3 win for Side 0 -> Match ends after all 3 heroes defeated
      A.hp = 60; B.hp = 0; M.koWinner = 0; endRound();
      if (M.phase !== 'end' || M.wins[0] !== 3) {
        return { pass: false, error: 'Net 1v1 did not end after defeating all 3 heroes: phase=' + M.phase + ', wins=' + M.wins };
      }
      NET.role = prevRole;
      netRoomMode = prevRoomMode;
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
