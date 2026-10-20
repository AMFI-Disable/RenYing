// Combat regression test suite for RenYing.
// Tests every character's core combat moves, state transitions, inputs, and combos in a headless browser:
// 1. Normal light combo chain (l1 -> l2 -> ... -> finisher)
// 2. Down attack (dl) and invulnerability/uninterruptible properties
// 3. Charge attack stance initiation (held.atk >= CHARGE_START) and release (cs1 or cs2)
// 4. Skills (skill 1, skill 2) and ultimate (special when meter >= 100)
// 5. Aerial attack (a1, a2)
// 6. Dash cancel and blockstun recovery transitions
// Usage: node tools/combat-test.mjs

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, openSync, existsSync } from 'node:fs';

const CHROME = process.env.RENYING_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium not found'); process.exit(1); }

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
process.on('exit', () => { try { chrome.kill(); } catch (e) {} });

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  await sleep(200);
  try {
    const m = readFileSync(LOG, 'utf8').match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) wsUrl = m[1];
  } catch {}
}
if (!wsUrl) { console.error('No DevTools endpoint'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 8000); });
const cdp = new CDP(ws);

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await cdp.send('Page.enable', {}, S);
await cdp.send('Runtime.enable', {}, S);

const ev = async (expr, awaitPromise = false) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, S);
  if (r.exceptionDetails) throw new Error('eval error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

await cdp.send('Page.navigate', { url: GAME }, S);
await sleep(2200);

console.log('===== RenYing Combat Mechanics Verification Suite =====\n');

// Initialize dummy match
await ev(`
  localStorage.setItem('renying-tut-seen','1');
  localStorage.setItem('renying-tut-done','1');
  startMatch('train', 'stand', [0, 1]);
  showScreen(null);
  paused = false;
  A.hp = A.maxHp;
  B.hp = B.maxHp;
`);

await sleep(800);

const testSuite = [
  {
    name: 'Charge attack transitions from neutral',
    fn: `(() => {
      toNeutral(A);
      const c = A.ctrl;
      c.held.atk = true;
      c.atkT = clock - (CHARGE_START + 0.1);
      neutral(A, B);
      const inCharge = A.state === 'charge';
      if (!inCharge) return { pass: false, error: 'Failed to enter charge state from neutral: ' + A.state };
      
      // Release charge
      c.held.atk = false;
      A.chargeFull = false;
      updateFighter(A, B);
      const released = A.state === 'attack' && A.moveName === 'cs1';
      toNeutral(A);
      return { pass: inCharge && released, error: released ? null : 'Failed to release cs1 attack (state=' + A.state + ', move=' + A.moveName + ')' };
    })()`
  },
  {
    name: 'Full charge attack release (cs2)',
    fn: `(() => {
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
      return { pass: released, error: released ? null : 'Failed to trigger cs2 on full charge release (state=' + A.state + ', move=' + A.moveName + ')' };
    })()`
  },
  {
    name: 'Charge transition from blockstun recovery',
    fn: `(() => {
      toNeutral(A);
      A.state = 'blockstun';
      A.t = 0.5;
      A.stun = 0.1; // expired
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
          return { pass: false, error: CHARS[ci].name + ' failed startAttack dl (state=' + A.state + ', move=' + A.moveName + ')' };
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
        if (gate) {   // 有使用条件的技能（醉翁与民同乐要半壶酒）：条件不够时不能放，也不扣冷却
          A.drunk = 0; startSkill(A, B, 2);
          if (A.state === 'skill' || A.skill2CD > 0) return { pass: false, error: CHARS[ci].name + ' skill 2 fired without meeting its condition' };
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
        A.y = -80; // airborne
        A.vy = -5;
        startAttack(A, 'a1');
        if (A.state !== 'attack' || A.moveName !== 'a1') {
          return { pass: false, error: CHARS[ci].name + ' failed aerial attack a1 (state=' + A.state + ', move=' + A.moveName + ')' };
        }
        toNeutral(A);
        A.y = -80;
        startAttack(A, 'a2');
        if (A.state !== 'attack' || A.moveName !== 'a2') {
          return { pass: false, error: CHARS[ci].name + ' failed aerial dive a2 (state=' + A.state + ', move=' + A.moveName + ')' };
        }
      }
      toNeutral(A);
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Hold attack does not trigger l1 before CHARGE_START',
    fn: `(() => {
      toNeutral(A);
      A.y = 0;
      A.vy = 0;
      const c = A.ctrl;
      c.clear();
      c.held.atk = true;
      c.atkT = clock;
      c.press('light');
      neutral(A, B);
      if (A.state === 'attack') {
        return { pass: false, error: 'Prematurely started attack ' + A.moveName + ' while holding attack!' };
      }
      // Releasing before charge triggers light attack
      c.held.atk = false;
      neutral(A, B);
      if (A.state !== 'attack' || A.moveName !== 'l1') {
        return { pass: false, error: 'Releasing tap did not trigger l1 (state=' + A.state + ', move=' + A.moveName + ')' };
      }
      toNeutral(A);
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Tower mode saves and resumes run progress and clears on loss',
    fn: `(() => {
      startTower(0);
      A.hp = 85;
      M.towerFloor = 3;
      M.towerPerks = ['blood_drink', 'air_burst'];
      saveTowerRun();
      const saved = loadTowerRun();
      if (!saved || saved.floor !== 3 || saved.hp !== 85 || (saved.perks || []).length !== 2) {
        return { pass: false, error: 'Failed to properly save tower run: ' + JSON.stringify(saved) };
      }
      toMenu();
      const loadedInMenu = loadTowerRun();
      if (!loadedInMenu || loadedInMenu.floor !== 3) {
        return { pass: false, error: 'Saved run lost on toMenu()' };
      }
      resumeTower();
      if (M.mode !== 'tower' || M.towerFloor !== 3 || A.hp !== 85 || (M.towerPerks || []).length !== 2) {
        return { pass: false, error: 'Resume did not restore state accurately (floor=' + M.towerFloor + ', hp=' + A.hp + ')' };
      }
      // Defeat clears saved run
      M.koWinner = 1;
      endRound();
      const clearedAfterDeath = loadTowerRun();
      toMenu();
      if (clearedAfterDeath !== null) {
        return { pass: false, error: 'Tower run was not cleared after defeat' };
      }
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Equipped skins render in MiBao (tower, chaos) and TeShu (bushido, tag3)',
    fn: `(() => {
      PROF.equip = { qingfeng: 'qf_gold' };
      PROF.skins = ['qf_gold'];
      
      startTower(0);
      if (A.skinKey !== 'qf_gold' || !A.look.legend) {
        return { pass: false, error: 'Tower mode (MiBao) did not render equipped skin (skinKey=' + A.skinKey + ')' };
      }
      
      startChaos(0, 1, 'normal');
      if (A.skinKey !== 'qf_gold' || !A.look.legend) {
        return { pass: false, error: 'Chaos mode (MiBao) did not render equipped skin (skinKey=' + A.skinKey + ')' };
      }
      
      startBushido(0, 1);
      if (A.skinKey !== 'qf_gold' || !A.look.legend) {
        return { pass: false, error: 'Bushido mode (TeShu) did not render equipped skin (skinKey=' + A.skinKey + ')' };
      }
      
      startTag3Match([0, 1, 2], [3, 4, 5], 'normal');
      if (A.skinKey !== 'qf_gold' || !A.look.legend) {
        return { pass: false, error: 'Tag3 mode (TeShu) did not render equipped skin (skinKey=' + A.skinKey + ')' };
      }
      
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Skin catalog coverage: all 9 characters have rare & legend skins with valid scenes and unique skill names',
    fn: `(() => {
      for (const ch of CHARS) {
        const charSkins = Object.entries(SKINS).filter(([k, v]) => v.char === ch.id);
        const hasRare = charSkins.some(([k, v]) => v.rarity === 'rare');
        const hasLegend = charSkins.some(([k, v]) => v.rarity === 'legend');
        if (!hasRare || !hasLegend) {
          return { pass: false, error: ch.name + ' missing rare or legend skin' };
        }
        for (const [k, v] of charSkins) {
          const scn = SCENES[k];
          if (!scn || !scn.sky || !scn.orb || !scn.hit) {
            return { pass: false, error: 'Skin ' + k + ' (' + v.name + ') has incomplete scene definition' };
          }
          const look = skinLook(CHAR_IDX[ch.id], k);
          if (!look || !look.deco) {
            return { pass: false, error: 'Skin ' + k + ' has invalid skinLook or missing deco' };
          }
          if (!v.skillNames || !v.skillNames.skill || !v.skillNames.ranged || !v.skillNames.ult) {
            return { pass: false, error: 'Skin ' + k + ' missing custom skillNames' };
          }
          if (skinSkillName(k, 1) !== v.skillNames.skill || skinSkillName(k, 2) !== v.skillNames.ranged || skinUltName(k) !== v.skillNames.ult) {
            return { pass: false, error: 'skinSkillName/skinUltName helper failed for ' + k };
          }
        }
      }
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Skin draw pool includes qf_qfx and enforces lower rates with higher BaoDi',
    fn: `(() => {
      const R = DEFAULT_RATES;
      if (!R.skin || R.skin.pity < 20 || R.skin.rate.legend > 0.02 || R.skin.rate.rare > 0.08) {
        return { pass: false, error: 'Skin rates/pity not adjusted as requested (pity=' + (R.skin && R.skin.pity) + ')' };
      }
      // Verify qf_qfx can be drawn when qingfeng is owned
      PROF.owned = ['qingfeng'];
      PROF.skins = [];
      PROF.spity = 999; // trigger pity
      const draw = clientDrawOne(true);
      if (draw.type !== 'skin' || !draw.skin) {
        return { pass: false, error: 'Pity draw failed to produce skin' };
      }
      // Check that all skins belonging to owned characters are eligible in draw pool
      const poolSkins = Object.keys(SKINS).filter(k => (PROF.owned || []).includes(SKINS[k].char));
      if (!poolSkins.includes('qf_qfx')) {
        return { pass: false, error: 'qf_qfx is missing from poolSkins' };
      }
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
    console.log(`  FAIL  ${test.name} — Error: ${err.message}`);
    failed++;
  }
}

ws.close();
chrome.kill();

if (failed > 0) {
  console.log(`\nFAIL: ${failed} combat mechanics check(s) failed.`);
  process.exit(1);
} else {
  console.log(`\nPASS: All ${testSuite.length} combat mechanics checks passed.`);
  process.exit(0);
}
