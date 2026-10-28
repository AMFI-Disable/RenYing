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
        A.y = 0; A.vy = 0; toNeutral(A);   // 站在地上放（离影的留影只能在地上用）
        A.skillCD = 0;
        startSkill(A, B, 1);
        if (A.state !== 'skill' && A.state !== 'attack') {
          return { pass: false, error: CHARS[ci].name + ' failed skill 1 activation' };
        }
        toNeutral(A);
        A.skill2CD = 0;
        const gate = SKILLS[A.ch.skill2].can;
        if (gate) {   // 有使用条件的技能（醉翁与民同乐要半壶酒，墨羽画符要 3 格墨水，离影渡影要场上有雾身）：条件不够时不能放，也不扣冷却
          A.drunk = 0; A.ink = 0; clearClones(A); startSkill(A, B, 2);
          if (A.state === 'skill' || A.skill2CD > 0) return { pass: false, error: CHARS[ci].name + ' skill 2 fired without meeting its condition' };
          A.drunk = 100; A.ink = 100; A.fu = 0;
          if (A.ch.clone) plantClone(A, A.x - 150);
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
    name: 'Lingque R (shadowdash) homes in: hits a far, fleeing or jumping target; only 腾空闪 dodges it',
    fn: `(() => {
      const run = (setup, perFrame) => {
        startMatch('train', 'stand', [CHAR_IDX.lingque, 0]);
        showScreen(null); paused = false; M.phase = 'fight';
        for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; f.breakCD = 0; f.needleMark = 0; }
        A.x = STAGE_W / 2 - 380; B.x = STAGE_W / 2 + 380; A.face = 1; B.face = -1;
        if (setup) setup();
        const hp0 = B.hp; A.skill2CD = 0; startSkill(A, B, 2);
        if (A.skill !== 'shadowdash') return { err: 'R did not start shadowdash: ' + A.skill };
        let hitAt = -1, maxGap = 0;
        for (let i = 0; i < 120 && A.state === 'skill'; i++) {
          if (perFrame) perFrame(i);
          step();
          if (hitAt < 0 && B.hp < hp0) hitAt = i;
        }
        return { hit: hitAt >= 0, hitAt, dist: Math.round(Math.abs(B.x - A.x)), lqState: A.state };
      };
      const far = run();
      if (!far.hit) return { pass: false, error: 'missed a standing target 760 px away: ' + JSON.stringify(far) };
      const flee = run(null, i => { if (B.state !== 'hitstun' && B.state !== 'launched') { B.x = Math.min(STAGE_W - WALL, B.x + 4); } });
      if (!flee.hit) return { pass: false, error: 'missed a target running away: ' + JSON.stringify(flee) };
      const jump = run(() => { B.state = 'air'; B.vy = -1100; B.y = -2; });
      if (!jump.hit) return { pass: false, error: 'missed a jumping target: ' + JSON.stringify(jump) };
      const side = run(null, i => { if (i === 24) { B.x = Math.max(WALL, A.x - 300); } });
      if (!side.hit) return { pass: false, error: 'did not turn around to a target that got behind it: ' + JSON.stringify(side) };
      const esc = run(null, i => { if (i === 10) { B.ctrl.buf.dash = clock; } });
      if (esc.hit) return { pass: false, error: '腾空闪 did not dodge the homing dash: ' + JSON.stringify(esc) };
      const late = run(null, i => { if (i === far.hitAt + 2) { B.ctrl.buf.dash = clock; } });
      if (!late.hit) return { pass: false, error: 'a 腾空闪 after the hit should not undo it: ' + JSON.stringify(late) };
      toMenu();
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
    name: 'Home page online count: total / in-match from the server, "unknown" when the server is unreachable',
    fn: `(() => {
      const txt = id => (document.getElementById(id) || {}).textContent || '';
      const keep = { srv: PRES.srv, at: PRES.at, fail: PRES.fail };
      PRES.srv = null; refreshOnline();
      if (!txt('homeOnlineCount').includes('未知') || !txt('netOnlineOverview').includes('未知')) return { pass: false, error: 'no server data should read 未知, got ' + txt('homeOnlineCount') };
      PRES.srv = { online: 7, playing: 2, waiting: 1 }; PRES.at = Date.now(); PRES.fail = 0; refreshOnline();
      if (txt('homeOnlineCount') !== '全服 7 人在线') return { pass: false, error: 'total wrong: ' + txt('homeOnlineCount') };
      if (txt('netOnlineOverview') !== '7 人在线 · 对局中 2 人 · 匹配中 1 人') return { pass: false, error: 'in-match wrong: ' + txt('netOnlineOverview') };
      PRES.fail = 2; refreshOnline();
      if (!txt('homeOnlineCount').includes('未知')) return { pass: false, error: 'two failed reports should read 未知' };
      PRES.fail = 0; PRES.at = Date.now() - 130e3; refreshOnline();
      if (!txt('homeOnlineCount').includes('未知')) return { pass: false, error: 'stale data should read 未知' };
      Object.assign(PRES, keep); refreshOnline();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'All heroes runtime maxHp, weight, reach, fly, and passives match hero settings',
    fn: `(() => {
      const expectedHp = {
        qingfeng: 870, feiying: 800, tieshan: 900, lingshuang: 815,
        liuyun: 840, leiming: 885, moyu: 825, yuehua: 780,
        yanling: 750, yuxiao: 775, zuixian: 885, gouchen: 835,
        lingque: 790, liying: 815
      };
      for (let ci = 0; ci < CHARS.length; ci++) {
        const ch = CHARS[ci];
        setChars(ci, (ci + 1) % CHARS.length);
        A.reset(200);
        const wantHp = Math.round(expectedHp[ch.id] * ((BAL[ch.id] || {}).hp || 1));   // 设定气血 × 强度调整（BAL）
        if (A.maxHp !== wantHp || A.hp !== wantHp) {
          return { pass: false, error: ch.name + ' maxHp mismatch: got ' + A.maxHp + ', expected ' + wantHp };
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
    name: 'Net 1v1 BP chooses 3 heroes per side (BP_ORDERS.trioSnake) and passes duo to rollStart for 3v3 tag relay',
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
  },
  {
    name: 'Stage mode (闯关斩妖) starts with both AI companions on the field',
    fn: `(() => {
      let err = null;
      try { startStage(0, 0, false, 0); } catch (e) { err = e.message; }
      if (err) { toMenu(); return { pass: false, error: 'startStage threw: ' + err }; }
      // 开局就带着要跨关记东西的秘卷（存气），而且之前从没开过一趟爬塔/肉鸽
      toMenu(); delete M.scRun; M.towerPerks = ['meter_bank'];
      try { startStage(0, 0, false, 0); } catch (e) { err = e.message; }
      if (err) { toMenu(); return { pass: false, error: 'startStage with 存气 threw: ' + err }; }
      const ok = M.mode === 'raid' && FOREST.on && !C.hidden && !D.hidden && C.chIdx === 2 && D.chIdx === 4
        && C.ctrl instanceof AICtrl && D.ctrl instanceof AICtrl;
      const info = 'mode=' + M.mode + ' forest=' + FOREST.on + ' C=' + C.chIdx + (C.hidden ? '(hidden)' : '') + ' D=' + D.chIdx + (D.hidden ? '(hidden)' : '');
      FOREST.on = false; toMenu();
      return ok ? { pass: true, error: null } : { pass: false, error: 'companions not set up: ' + info };
    })()`
  },
  {
    name: 'Multiplayer Co-op Roguelike (同袍肉鸽 · 众志破魔): Home-only entry, 6-skill 3-hero Boss (3x HP, 1.25x dmg), shared gains & Ink reward',
    fn: `(() => {
      const homeBtn = document.getElementById('homeRouge');
      const modalRouge = document.getElementById('modalRouge');
      if (!homeBtn || !modalRouge) {
        return { pass: false, error: '#homeRouge or #modalRouge missing in DOM' };
      }
      openRougeModal();
      if (modalRouge.classList.contains('hidden')) {
        return { pass: false, error: 'openRougeModal() did not open #modalRouge' };
      }
      closeRougeModal();
      startRaidMatch([0, 2, 3], 3);
      if (M.mode !== 'raid' || !isRaid()) {
        return { pass: false, error: 'startRaidMatch did not activate raid mode' };
      }
      if (sideFighters(0).length !== 3 || sideFighters(1).length !== 1 || sideFighters(1)[0] !== B) {
        return { pass: false, error: 'Raid teams should be 3 allies vs 1 Boss B' };
      }
      if (!B.bossHeroes || B.bossHeroes.length !== 3 || new Set(B.bossHeroes).size !== 3) {
        return { pass: false, error: 'Boss B must combine 3 distinct random characters: ' + JSON.stringify(B.bossHeroes) };
      }
      if (!B.bossSkills || B.bossSkills.length !== 6) {
        return { pass: false, error: 'Boss B must have 6 skills from 3 characters: ' + JSON.stringify(B.bossSkills) };
      }
      const baseHp = Math.round(CHARS[B.chIdx].stat.hp * ((BAL[CHARS[B.chIdx].id] || {}).hp || 1));
      if (B.maxHp !== Math.round(baseHp * 3.0)) {
        return { pass: false, error: 'Boss B should have 3x HP (' + Math.round(baseHp * 3.0) + '), got ' + B.maxHp };
      }
      if (B.bossDmgMul !== 1.25) {
        return { pass: false, error: 'Boss B should have 1.25x damage multiplier, got ' + B.bossDmgMul };
      }
      // Verify shared perks across all 3 squad members (A, C, D)
      if (!scIds(A).length || scIds(A).join(',') !== scIds(C).join(',') || scIds(A).join(',') !== scIds(D).join(',')) {
        return { pass: false, error: 'Allies A, C, D must share M.towerPerks' };
      }
      // Verify shared healing across allies（开局随机送的秘卷可能抽到「断情」：不能回血，这里去掉它，免得测试随机失败）
      M.towerPerks = M.towerPerks.filter(id => id !== 'no_heal');
      A.hp = 100; C.hp = 100; D.hp = 100;
      scHeal(A, 40);
      if (C.hp <= 100 || D.hp <= 100) {
        return { pass: false, error: 'scHeal on A did not share healing with teammates C and D' };
      }
      // Verify Boss victory grants generous Ink reward and announces it
      const inkBefore = PROF.ink || 0;
      B.hp = 0; M.koWinner = 0; endRound();
      const inkAfter = PROF.ink || 0;
      if (inkAfter - inkBefore < 600) {
        return { pass: false, error: 'Boss defeat did not award +600 Ink: before=' + inkBefore + ', after=' + inkAfter };
      }
      const subTxt = document.getElementById('endSub').textContent || '';
      if (!subTxt.includes('600') || !subTxt.includes('墨锭')) {
        return { pass: false, error: 'Victory screen did not announce Ink reward: ' + subTxt };
      }
      // Verify every hero has a dedicated story in HERO_FOREST_STORIES & CHAPTERS, and unified storyWaves -> Raid Boss works
      if (typeof HERO_FOREST_STORIES !== 'object' || CHAPTERS.length !== CHARS.length) {
        return { pass: false, error: 'Expected one CHAPTER per hero (' + CHARS.length + '), got ' + CHAPTERS.length };
      }
      for (const ch of CHARS) {
        const st = HERO_FOREST_STORIES[ch.id];
        if (!st || !st.title || !st.synopsis || !Array.isArray(st.waveDialogues) || st.waveDialogues.length < 4 || !st.bossIntro) {
          return { pass: false, error: 'Missing or incomplete story for hero: ' + ch.id };
        }
      }
      startRaidMatch([0, 2, 3], 3, { chapterIdx: 0, storyWaves: true });
      if (!FOREST.on || !FOREST.raidStory || !isRaid() || !FOREST.storyLine) {
        return { pass: false, error: 'Unified Raid Story Waves did not activate FOREST.on with storyLine in raid mode' };
      }
      // Transition from clearing small monsters to the 6-skill Chimera Boss climax
      stageClear();
      if (FOREST.on || B.hidden || !B.bossSkills || B.bossSkills.length !== 6) {
        return { pass: false, error: 'stageClear() in unified raidStory mode did not transition to 6-skill Chimera Boss' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'XuLiZhan (蓄力斩) mechanics: Partial charge (cs1) does not knock down; Blocked max charge (cs2) knocks down with reduced damage and quicker getup',
    fn: `(() => {
      startMatch('train', 'stand', [0, 1]);
      showScreen(null); paused = false; M.phase = 'fight';
      
      // 1. Partial charge (cs1): Opponent on ground takes damage & hitstun, but does NOT fall down (not launched or knockdown)
      toNeutral(A); toNeutral(B);
      A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
      A.y = 0; A.vy = 0; A.vx = 0; A.invul = 0;
      B.y = 0; B.vy = 0; B.vx = 0; B.invul = 0;
      A.hp = A.maxHp; B.hp = B.maxHp;
      startAttack(A, 'cs1');
      A.t = A.move.su + 0.01;
      tryHit(A, B, A.move);
      if (B.state === 'knockdown' || B.state === 'launched') {
        return { pass: false, error: 'Partial charge cs1 should NOT bring opponent to the ground, but state was ' + B.state };
      }
      if (B.hp >= B.maxHp) {
        return { pass: false, error: 'cs1 failed to deal damage' };
      }

      // 2. Max charge (cs2) unblocked: Deals full damage and brings opponent to the ground with normal getup duration (0.6s)
      toNeutral(A); toNeutral(B);
      A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
      A.y = 0; A.vy = 0; A.vx = 0; A.invul = 0;
      B.y = 0; B.vy = 0; B.vx = 0; B.invul = 0;
      B.hp = B.maxHp;
      startAttack(A, 'cs2');
      A.t = A.move.su + 0.01;
      tryHit(A, B, A.move);
      const unblockedDmg = B.maxHp - B.hp;
      if (B.state !== 'launched' && B.state !== 'knockdown') {
        return { pass: false, error: 'Unblocked cs2 should bring opponent to the ground, but state was ' + B.state };
      }
      if (B.quickGetup) {
        return { pass: false, error: 'Unblocked cs2 should have normal getup speed, not quickGetup' };
      }

      // 3. Max charge (cs2) when blocking: Brings opponent to ground (knockdown), deals less damage than non-blocked, and stands up quicker (0.22s)
      toNeutral(A); toNeutral(B);
      A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
      A.y = 0; A.vy = 0; A.vx = 0; A.invul = 0;
      B.y = 0; B.vy = 0; B.vx = 0; B.invul = 0;
      B.hp = B.maxHp;
      B.ctrl.held.down = true;
      B.state = 'block';
      startAttack(A, 'cs2');
      A.t = A.move.su + 0.01;
      tryHit(A, B, A.move);
      const blockedDmg = B.maxHp - B.hp;
      
      if (B.state !== 'knockdown') {
        return { pass: false, error: 'Blocked cs2 should bring opponent to the ground (knockdown), got ' + B.state };
      }
      if (blockedDmg >= unblockedDmg * 0.7) {
        return { pass: false, error: 'Blocked cs2 should deal less damage than unblocked: blocked=' + blockedDmg + ' vs unblocked=' + unblockedDmg };
      }
      if (!B.quickGetup || B.knockdownDur > 0.3) {
        return { pass: false, error: 'Blocked cs2 should set quickGetup / shorter knockdown duration: quickGetup=' + B.quickGetup + ', dur=' + B.knockdownDur };
      }

      // Verify that standing up occurs quicker than normal (0.6s)
      B.t = 0.23;
      updateFighter(B, A);
      if (B.state !== 'getup') {
        return { pass: false, error: 'Expected quick getup transition at t=0.23s, but state is ' + B.state };
      }

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Blocked cs2 rule only applies to cs2 itself: a later blockable hit or ult after a cs2 is not turned into a quick knockdown',
    fn: `(() => {
      startMatch('train', 'stand', [0, 1]);
      showScreen(null); paused = false; M.phase = 'fight';
      const setup = () => {
        toNeutral(A); toNeutral(B);
        A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
        A.y = B.y = 0; A.vy = B.vy = A.vx = B.vx = 0; A.invul = B.invul = 0;
        B.hp = B.maxHp; B.guard = B.maxGuard; B.quickGetup = false; delete B.knockdownDur;
        A.moveName = 'cs2';   // 刚放完一记蓄力斩：收招后 moveName 还留着
        B.ctrl.held.down = true; B.state = 'block';
      };
      // 1. 挡得住的暗器：应该是普通格挡
      setup();
      applyHit(A, B, { dmg: 20, kb: [200, 0], stun: 0.3, hs: 0.06, isProj: true }, [B.x, B.y - 60]);
      if (B.state !== 'blockstun' || B.quickGetup) { toMenu(); return { pass: false, error: 'blockable hit after cs2 became ' + B.state + (B.quickGetup ? ' (quickGetup)' : '') }; }
      // 2. 不可挡的大招：应该照常挑飞、打满伤害，而不是按挡住蓄力斩打 45% 再快速起身
      setup();
      const ult = { dmg: 75, kb: [480, -700], stun: 0.6, hs: 0.2, launch: true, unblockable: true, big: true, ult: true, noScale: true };
      applyHit(A, B, ult, [B.x, B.y - 60]);
      const ultDmg = B.maxHp - B.hp;
      if (B.state === 'knockdown' || B.quickGetup) { toMenu(); return { pass: false, error: 'unblockable ult after cs2 was treated as blocked cs2: state=' + B.state + ' dmg=' + ultDmg }; }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Counter hit (破) on a skill wind-up does not depend on the last normal attack being a down attack',
    fn: `(() => {
      startMatch('train', 'stand', [0, 1]);
      showScreen(null); paused = false; M.phase = 'fight';
      const hitSkillStartup = lastMove => {
        toNeutral(A); toNeutral(B);
        A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
        A.y = B.y = 0; A.vy = B.vy = A.vx = B.vx = 0; A.invul = B.invul = 0;
        B.hp = B.maxHp; B.comboHits = 0; B.armorT = 0;
        B.moveName = lastMove; B.state = 'skill'; B.skill = B.ch.skill; B.t = 0.05;   // 技能刚起手
        applyHit(A, B, { dmg: 20, kb: [200, -100], stun: 0.3, hs: 0.06 }, [B.x, B.y - 60]);
        return B.maxHp - B.hp;
      };
      const afterL1 = hitSkillStartup('l1'), afterDl = hitSkillStartup('dl');
      toMenu();
      if (Math.abs(afterL1 - afterDl) > 0.01) return { pass: false, error: 'skill wind-up counter damage differs by last attack: after l1=' + afterL1 + ' after dl=' + afterDl };
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 has three local variants (you + AI ally, two players vs two AIs, two vs two): each starts, ends and replays frame-for-frame',
    fn: `(() => {
      const snap = () => JSON.stringify([A, B, C, D].map(f => [f.chIdx, f.state, Math.round(f.x), Math.round(f.y), Math.round(f.hp * 10)]));
      const out = [];
      for (const sub of ['p_cc', 'pp_cc', 'pp_pp']) {
        toMenu();
        bpStart('2v2', { subMode: sub, level: 'hard' });
        if (BP.steps.length !== 6) return { pass: false, error: sub + ': 2v2 BP should have 6 steps, got ' + BP.steps.length };
        for (const i of [0, 1, 2, 3, 4, 5]) bpApply(i);
        currentScreen = 'bp'; bpFinish();
        if (M.mode !== '2v2' || M.subMode !== sub) return { pass: false, error: sub + ': started ' + M.mode + '/' + M.subMode };
        const ai = f => f.ctrl instanceof AICtrl;
        const want = { p_cc: [false, true, true, true], pp_cc: [false, true, false, true], pp_pp: [false, false, false, false] }[sub];
        const got = [A, B, C, D].map(ai);
        if (JSON.stringify(got) !== JSON.stringify(want)) return { pass: false, error: sub + ': who is AI (A B C D) = ' + got };
        if (sub === 'p_cc' && A.ctrl !== human[0]) return { pass: false, error: 'p_cc: you should control A' };
        if (!REC.on || !REC.meta || !REC.meta.four || REC.meta.sub !== sub) return { pass: false, error: sub + ': 2v2 match is not being recorded' };
        // 录像要记下谁是玩家：回放里大家都是普通操控，玩家不能被当成电脑去配合队友
        if (JSON.stringify(REC.meta.pl) !== JSON.stringify(want.map(x => !x))) return { pass: false, error: sub + ': recorded players (A B C D) = ' + REC.meta.pl };
        // 四人对战的 3P、4P 也是真人：选目标按玩家的规则
        if (sub === 'pp_pp' && [B, D].some(cpuTeamwork)) return { pass: false, error: 'pp_pp: 3P / 4P pick targets like the computer' };
        if (sub === 'p_cc' || sub === 'pp_pp') {
          const rm = { ...REC.meta, ev: [], skins: ['', '', '', ''], names: ['a', 'b'] };
          startReplay(rm);
          const pl = [A, B, C, D].map(f => !cpuTeamwork(f));
          REPLAY.on = false;
          if (JSON.stringify(pl) !== JSON.stringify(rm.pl)) return { pass: false, error: sub + ': in the replay players (A B C D) = ' + pl + ', recorded ' + rm.pl };
          toMenu(); bpStart('2v2', { subMode: sub, level: 'hard' }); for (const i of [0, 1, 2, 3, 4, 5]) bpApply(i); currentScreen = 'bp'; bpFinish();
        }
        // 让电脑代替玩家出手，打一段，记下每一帧的局面
        for (const f of [A, B, C, D]) if (!ai(f)) f.ctrl = new AICtrl('hard');
        // 代打的电脑会配合队友选目标；回放要照这个来，不然就是在测“玩家规则”和“电脑规则”不一样
        REC.meta.pl = [A, B, C, D].map(f => !cpuTeamwork(f));
        const frames = [];
        for (let i = 0; i < 1500; i++) { step(); if (i % 50 === 49) frames.push(snap()); }
        const m = { ...REC.meta, ev: REC.ev.slice(), skins: ['', '', '', ''], names: ['a', 'b'] };
        // 打到分出胜负，看能不能结算
        B.hp = D.hp = 0; M.koWinner = 0; M.wins = [1, 0];
        for (let i = 0; i < 600 && M.phase !== 'end'; i++) step();
        for (let i = 0; i < 600 && M.phase !== 'end'; i++) { B.hp = D.hp = 0; step(); }
        if (M.phase !== 'end') return { pass: false, error: sub + ': match did not end (phase ' + M.phase + ')' };
        startReplay(m);
        if (!is2v2() || C.hidden || D.hidden) return { pass: false, error: sub + ': replay is not shown as 2v2' };
        const again = [];
        for (let i = 0; i < 1500; i++) { replayFrame(); if (i % 50 === 49) again.push(snap()); }
        const bad = frames.findIndex((x, i) => x !== again[i]);
        if (bad >= 0) return { pass: false, error: sub + ': replay drifts at frame ' + (bad + 1) * 50 + ': ' + frames[bad] + ' vs ' + again[bad] };
        out.push(sub);
        REPLAY.on = false;
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Escape (腾空闪) state machine: rise / hover invulnerability, cooldown, landing lag, and what blocks it (cooldown, held, own ult, jail, drunk, not fighting)',
    fn: `(() => {
      startMatch('train', 'stand', [0, 1]);
      showScreen(null); paused = false; M.phase = 'fight';
      const reset = () => {
        toNeutral(A); A.x = STAGE_W / 2 - 200; A.y = 0; A.vx = A.vy = 0; A.invul = 0; A.escInvul = false; A.escMode = ''; A.airHover = 0;
        A.breakCD = 0; A.jailT = 0; A.drinkT = 0; A.hp = A.maxHp; A.stun = 0; A.rooted = false; A.airRecover = false; human[0].clear(); M.phase = 'fight';
      };
      const esc = () => { human[0].press('dash'); return tryEscape(A, B); };
      const cd = A.ch.escCD || BREAK_CD;
      // rise：从硬直里闪出来
      reset(); A.state = 'hitstun'; A.stun = 0.5; A.rooted = true;
      if (!esc()) return { pass: false, error: 'could not escape from hitstun' };
      if (A.escMode !== 'rise' || !A.escInvul || !(A.invul > 0) || A.state !== 'air' || A.rooted || A.stun) return { pass: false, error: 'rise escape state wrong: ' + JSON.stringify({ m: A.escMode, e: A.escInvul, i: A.invul, s: A.state, r: A.rooted }) };
      if (Math.abs(A.breakCD - cd) > 1e-9) return { pass: false, error: 'rise cooldown ' + A.breakCD + ' != escCD ' + cd };
      let landed = false;
      for (let i = 0; i < 240 && !landed; i++) { step(); if (A.onGround() && A.state === 'getup') landed = true; else if (!A.escInvul) return { pass: false, error: 'rise invulnerability ended in the air at frame ' + i }; }
      if (!landed || A.escInvul || A.invul > 0 || A.escMode) return { pass: false, error: 'landing did not end the escape with landing lag' };
      // 空中第三下被震飞（带受身）时闪：落地照样结束腾空闪，不会顶着腾空闪的无敌走受身那条路
      for (const mode of ['rise', 'hover']) {
        reset(); A.y = -200; A.state = 'launched'; A.airRecover = true; A.vy = -180;
        if (mode === 'rise') human[0].held.right = true;
        if (!esc() || A.escMode !== mode || A.airRecover) return { pass: false, error: mode + ' escape out of an air-recovery launch kept airRecover' };
        human[0].held.right = false;
        let ok = false;
        for (let i = 0; i < 300 && !ok; i++) { step(); ok = A.onGround() && A.state !== 'air'; }
        if (!ok || A.escInvul || A.invul > 0 || A.escMode) return { pass: false, error: mode + ' escape out of an air-recovery launch: landing kept the escape ' + JSON.stringify({ ok, e: A.escInvul, i: A.invul, m: A.escMode }) };
      }
      // rise 的无敌最长 ESC.riseMax 秒
      reset(); A.state = 'hitstun'; esc(); A.escT = ESC.riseMax - 0.001; escapeTick(A);
      if (A.escInvul) return { pass: false, error: 'rise invulnerability lasted past ESC.riseMax' };
      // 自己出手就结束无敌
      reset(); A.state = 'hitstun'; esc(); startAttack(A, 'a1');
      if (A.escInvul || A.invul > 0) return { pass: false, error: 'attacking out of an escape kept invulnerability' };
      // hover：空中不按方向
      reset(); A.y = -220; A.state = 'air';
      if (!esc() || A.escMode !== 'hover' || A.airHover !== ESC.hover || !(A.invul > 0)) return { pass: false, error: 'air escape did not hover: ' + A.escMode + ' ' + A.airHover };
      if (Math.abs(A.breakCD - Math.min(cd, ESC.hoverCdCap)) > 1e-9) return { pass: false, error: 'hover cooldown ' + A.breakCD };
      // 秘卷把悬停拉到 1.5 秒时，过了 riseMax 也还无敌，悬停结束才结束
      A.airHover = A.invul = 1.5; A.escT = ESC.riseMax + 0.05; escapeTick(A);
      if (!A.escInvul) return { pass: false, error: 'long hover lost invulnerability before the hover ended' };
      for (let i = 0; i < 200 && A.airHover > 0; i++) physics(A);
      if (A.escInvul || A.escMode) return { pass: false, error: 'hover end did not end the escape' };
      // 用不了的情况
      const blocked = [
        ['cd', () => { A.breakCD = 2; }], ['held', () => { A.state = 'held'; }], ['ult', () => { A.state = 'special'; }],
        ['jail', () => { A.jailT = 1; }], ['drink', () => { A.drinkT = 1; }], ['phase', () => { M.phase = 'ko'; }], ['dead', () => { A.hp = 0; }],
      ];
      for (const [why, set] of blocked) {
        reset(); A.state = 'hitstun'; set();
        if (escapeBlock(A) !== why) return { pass: false, error: 'expected escape to be blocked by ' + why + ', got ' + escapeBlock(A) };
        if (esc()) return { pass: false, error: 'escaped although blocked by ' + why };
      }
      reset(); toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    // 山河异境：每张图被选中的概率 = 得票 / 总票数，没人投票时一样；联机用种子算出的随机数两边相同
    name: 'Map vote odds follow the vote count',
    fn: `(() => {
      const near = (a, b) => Math.abs(a - b) < 1e-9;
      const o = mapOdds(['cliff', 'cliff', 'ice']);
      if (!near(o[MAP_POOL.indexOf('cliff')], 2 / 3) || !near(o[MAP_POOL.indexOf('ice')], 1 / 3)) return { pass: false, error: 'two votes to one should be 2/3 and 1/3, got ' + o };
      if (!mapOdds([null, null]).every(x => near(x, 1 / MAP_POOL.length))) return { pass: false, error: 'no votes should be equal odds' };
      if (mapPick(['ice'], 0.999) !== 'ice' || mapPick(['cliff'], 0) !== 'cliff') return { pass: false, error: 'a single vote must always win' };
      const n = { cliff: 0, ice: 0 };
      for (let s = 1; s <= 3000; s++) n[mapPick(['cliff', 'cliff', 'ice'], mapSeedRand(s * 7919))]++;
      if (Math.abs(n.cliff / 3000 - 2 / 3) > 0.04) return { pass: false, error: 'seeded picks should land near 2/3, got ' + n.cliff / 3000 };
      if (mapSeedRand(12345) !== mapSeedRand(12345)) return { pass: false, error: 'seeded random is not stable' };
      return { pass: true, error: null };
    })()`
  },
  {
    // 断崖台：自己走不下崖；被击飞越过崖边坠崖，扣 6% 气血（不会扣死）、弹回台上、途中无敌
    name: 'Cliffside: walking stops at the edge, a launched fighter falls and comes back',
    fn: `(() => {
      mapVote = 'cliff'; startMapsMode(0, 1, 'easy', true); M.phase = 'fight';
      if (M.map !== 'cliff' || STAGE_W !== MAPS.cliff.w) return { pass: false, error: 'map ' + M.map + ' width ' + STAGE_W };
      A.x = WALL + 1; A.y = 0; A.vx = -400; A.state = 'walk'; physics(A);
      if (A.x !== WALL || A.mapFalls) return { pass: false, error: 'walking should stop at the edge: x ' + A.x + ' falls ' + A.mapFalls };
      const hp0 = A.hp; A.x = WALL + 1; A.y = -60; A.vx = -700; A.vy = 0; A.state = 'launched'; physics(A);
      const lost = hp0 - A.hp;
      if (A.mapFalls !== 1 || lost !== Math.round(A.maxHp * MAPS.cliff.cliff.dmg)) return { pass: false, error: 'fall should cost ' + Math.round(A.maxHp * MAPS.cliff.cliff.dmg) + ', lost ' + lost };
      if (!(A.x >= WALL) || A.vx <= 0 || A.vy >= 0 || A.invul < 0.5) return { pass: false, error: 'should bounce back inward and up with invulnerability' };
      A.hp = 2; A.x = STAGE_W - WALL - 1; A.state = 'launched'; A.vx = 700; physics(A);
      if (A.hp !== 1) return { pass: false, error: 'a fall must never finish a fighter, hp ' + A.hp };
      A.x = WALL + 1; A.vx = -900; A.state = 'blockstun'; A.mapFalls = 0; physics(A);
      if (A.mapFalls) return { pass: false, error: 'blocking at the edge must not fall' };
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    // 寒潭冰面：冰上停得慢，越重滑得越远；冰外和其他模式照旧
    name: 'Frozen Pond: ice slows stopping, heavier fighters slide further, other modes unchanged',
    fn: `(() => {
      const slide = (ci, x) => { setChars(ci, (ci + 1) % CHARS.length); A.x = x; A.y = 0; A.vx = 500; A.vy = 0; A.state = 'hitstun'; A.t = 0; A.stun = 9; const x0 = A.x; for (let i = 0; i < 30; i++) physics(A); return A.x - x0; };
      const heavy = CHARS.findIndex(c => c.stat.weight >= 1.3), light = CHARS.findIndex(c => c.stat.weight <= 0.85);
      mapVote = 'ice'; startMapsMode(0, 1, 'easy', true); M.phase = 'fight';
      if (M.map !== 'ice') return { pass: false, error: 'map ' + M.map };
      const mid = STAGE_W / 2, onIce = slide(heavy, mid), offIce = slide(heavy, WALL + 100);
      if (!(onIce > offIce * 1.5)) return { pass: false, error: 'ice should slide further: ice ' + onIce + ' vs ground ' + offIce };
      const lightIce = slide(light, mid);
      if (!(onIce > lightIce)) return { pass: false, error: 'heavier should slide further: heavy ' + onIce + ' vs light ' + lightIce };
      startMatch('cpu', 'easy', [heavy, 1]); M.map = 'ice'; M.phase = 'fight';
      const cpuMid = slide(heavy, STAGE_W / 2);
      if (Math.abs(cpuMid - offIce) > 1e-6) return { pass: false, error: 'maps must not apply outside the maps mode: ' + cpuMid + ' vs ' + offIce };
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
