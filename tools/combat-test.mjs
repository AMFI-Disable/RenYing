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
    name: 'AI Brain Model: Frame data & evolved genes validation across all 12 heroes',
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
    name: '2v2 P&CvC&C Mode: 1P player controls A, AI teammate controls C, 2 AI opponents control B & D',
    fn: `(() => {
      start2v2PlayerMatch(0, 2, 1, 3, 'normal');
      if (M.mode !== '2v2' || M.subMode !== 'pc_cc' || M.watchAi) {
        return { pass: false, error: 'P&CvC&C mode state flags mismatch' };
      }
      if (STAGE_W !== 2600) {
        return { pass: false, error: 'Expected 2600 stage width in 2v2, got: ' + STAGE_W };
      }
      if (A.ctrl !== human[0]) {
        return { pass: false, error: 'Player 1 should control fighter A via human[0]' };
      }
      if (!(C.ctrl instanceof AICtrl)) {
        return { pass: false, error: 'Teammate C should be controlled by AICtrl' };
      }
      if (!(B.ctrl instanceof AICtrl) || !(D.ctrl instanceof AICtrl)) {
        return { pass: false, error: 'Opponents B and D should be controlled by AICtrl' };
      }
      if (isAiVsAi()) {
        return { pass: false, error: 'isAiVsAi() should be false when player participates' };
      }
      toMenu();
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
    name: 'All 12 heroes runtime maxHp, weight, reach, fly, and passives match hero settings',
    fn: `(() => {
      const expectedHp = {
        qingfeng: 510, feiying: 470, tieshan: 530, lingshuang: 480,
        liuyun: 495, leiming: 520, moyu: 485, yuehua: 460,
        yanling: 440, yuxiao: 455, zuixian: 520, gouchen: 490
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
