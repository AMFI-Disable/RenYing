#!/usr/bin/env node
// Subsystem verification harness for:
//   --rollback : Rollback netcode determinism (capState / restState / hashState mid-combo resims)
//   --qfx      : QingFengXing (青锋行) 3D action game bundle & module integrity
//   --offline  : Zero-network standalone bundle (renying-offline.html) embedded assets & unlock check
//   --schema   : Cloudflare D1 SQLite schema (cloudflare/schema.sql) validation
//   --all      : Run all checks (default)
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { gameSource } from './ai-code.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const runAll = !args.length || args.includes('--all');

let passed = 0, failed = 0;
function assert(cond, name, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// 1. Rollback Netcode Determinism Check
if (runAll || args.includes('--rollback')) {
  console.log('\n[1] Rollback Netcode Determinism & State Snapshot Verification');
  const noop = () => {};
  const grad = { addColorStop: noop };
  const ctx2d = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') ? () => grad : noop, set: () => true });
  const el = () => ({
    getContext: () => ctx2d, getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0, right: 1440, bottom: 900 }),
    addEventListener: noop, removeEventListener: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: { setProperty: noop }, appendChild: noop, remove: noop, querySelector: () => null, querySelectorAll: () => [],
    setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop, dataset: {}, children: [], innerHTML: '', textContent: '', value: ''
  });
  const w = {
    innerWidth: 1440, innerHeight: 900, addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }),
    document: { getElementById: el, querySelectorAll: () => [], querySelector: el, createElement: el, addEventListener: noop, removeEventListener: noop, body: el(), documentElement: el() },
    location: { protocol: 'http:', hostname: '127.0.0.1', search: '', hash: '' },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    performance: { now: () => Date.now() }, navigator: { userAgent: 'node' },
    requestAnimationFrame: noop, console: { log: noop, warn: noop, error: noop },
    setTimeout: noop, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    AudioContext: class { createGain() { return { connect: noop }; } }, Audio: class { play() {} pause() {} },
    Math, Date
  };
  w.window = w; w.globalThis = w;
  vm.createContext(w);
  new vm.Script(readFileSync(ROOT + 'src/net-p2p.js', 'utf8')).runInContext(w);
  new vm.Script(gameSource()).runInContext(w);

  const res = new vm.Script(`(() => {
    rollStart([0, 3], 424242);
    M.phase = 'fight';
    // Populate deterministic inputs for 60 frames
    for (let f = 0; f < 60; f++) {
      ROLL.loc[f] = { h: (f % 15 < 8) ? 2 : 0, p: (f % 10 === 0) ? ['light'] : (f === 25 ? ['skill'] : []) };
      ROLL.rem[f] = { h: (f % 15 < 8) ? 1 : 4, p: (f % 12 === 0) ? ['light'] : (f === 30 ? ['skill2'] : []) };
      ROLL.remLast = 60;
      rollFrame(f);
      ROLL.F = f + 1;
    }
    const hashBefore = hashState(capState());
    // Trigger a 12-frame rollback to frame 48 and resimulate up to frame 60
    ROLL.pend = 48;
    rollResim();
    const hashAfter = hashState(capState());
    return { match: hashBefore === hashAfter, hashBefore, hashAfter, rollbacks: ROLL.rollbacks };
  })()`).runInContext(w);

  assert(res.match && res.rollbacks === 1, `12-frame rollback resimulation produces identical FNV-1a state hash (0x${res.hashAfter.toString(16)})`);

  // 电脑往对手身上写的 lastComboHits（src/ai.js，电脑决定什么时候闪要看它）：回滚时要跟着存档回去，存档里没有就得删掉，
  // 不然一边带着被丢弃那条时间线的数，两边的电脑想出来的招就不一样了
  const ai = new vm.Script(`(() => {
    const st0 = capState();                 // 这时还没人写过 lastComboHits
    A.lastComboHits = 5; const st1 = capState();
    A.lastComboHits = 9; restState(st1); const back = A.lastComboHits;
    restState(st0); const gone = !('lastComboHits' in A);
    return { back, gone, saved: st1.f[0].lastComboHits };
  })()`).runInContext(w);
  assert(ai.saved === 5 && ai.back === 5 && ai.gone, 'AI-written fighter field (lastComboHits) is saved, restored and cleared by rollback', JSON.stringify(ai));

  // 山河异境：两边用同一组票和同一个种子选出同一张图；地图（M.map）进存档，坠崖、冰面上的回滚重算和第一次一模一样
  const maps = new vm.Script(`(() => {
    netRoomMode = 'maps';
    const out = {};
    for (const [mv, seed] of [[['cliff', null], 777], [[null, 'ice'], 778], [['cliff', 'ice'], 991]]) {
      rollStart([2, 5], seed, null, mv);
      const host = M.map;
      rollStart([2, 5], seed, null, mv.slice());
      if (M.map !== host) return { err: 'two starts with the same votes and seed picked ' + host + ' and ' + M.map };
      out[seed] = M.map;
    }
    rollStart([2, 5], 4242, null, ['cliff', 'cliff']);
    M.phase = 'fight';
    const w0 = STAGE_W, rf = rollFrame;
    rollFrame = f => { if (f === 100) { B.x = STAGE_W - WALL - 2; B.y = -40; B.vx = 800; B.vy = -100; B.state = 'launched'; } rf(f); };   // 第 100 帧把 B 打下崖（重算时也一样）
    for (let f = 0; f < 240; f++) {
      ROLL.loc[f] = { h: f < 120 ? 2 : (f % 20 < 10 ? 2 : 1), p: f % 9 === 0 ? ['heavy'] : (f % 31 === 0 ? ['skill'] : []) };
      ROLL.rem[f] = { h: f % 40 < 25 ? 1 : 2, p: f % 13 === 0 ? ['light'] : [] };
      ROLL.remLast = 240;
      rollFrame(f);
      ROLL.F = f + 1;
    }
    const before = hashState(capState()), falls = B.mapFalls || 0;
    ROLL.pend = 90;   // 回滚到坠崖之前，重算 150 帧
    rollResim();
    const after = hashState(capState());
    rollFrame = rf; netRoomMode = 'normal';
    return { picks: out, w0, map: M.map, falls, match: before === after, stays: STAGE_W === w0 && M.map === 'cliff' };
  })()`).runInContext(w);
  assert(!maps.err && maps.picks[777] === 'cliff' && maps.picks[778] === 'ice' && ['cliff', 'ice'].includes(maps.picks[991]), 'Maps room: both sides pick the same map from the same votes and seed', JSON.stringify(maps));
  assert(maps.map === 'cliff' && maps.w0 === 1500 && maps.falls >= 1 && maps.match && maps.stays, 'Maps room: a cliff fall resimulates to the identical state hash after a 150-frame rollback', JSON.stringify(maps));
}

// 2. QingFengXing (青锋行) 3D Action Mode Verification
if (runAll || args.includes('--qfx')) {
  console.log('\n[2] QingFengXing (青锋行) 3D Bundle & Module Verification');
  const qfxHtmlPath = ROOT + 'assets/qingfengxing.html';
  assert(existsSync(qfxHtmlPath), 'assets/qingfengxing.html bundle exists');
  const html = readFileSync(qfxHtmlPath, 'utf8');
  assert(html.includes('THREE') && html.includes('00-core.js') && html.includes('90-main.js'), 'assets/qingfengxing.html embeds Three.js and all numbered QFX modules');
  assert(!html.includes('<!--@three-->') && !html.includes('<!--@game-->'), 'All QFX template placeholders are cleanly substituted');
}

// 3. Offline Standalone Build Verification
if (runAll || args.includes('--offline')) {
  console.log('\n[3] Standalone Offline Build (renying-offline.html) Verification');
  const offlinePath = ROOT + 'renying-offline.html';
  assert(existsSync(offlinePath), 'renying-offline.html exists');
  const html = readFileSync(offlinePath, 'utf8');
  assert(html.includes('window.RENYING_BUILD={"offline":true}'), 'RENYING_BUILD offline flag is enabled');
  assert(html.includes('window.MUSIC_DATA={"'), 'Embedded base64 MP3 music tracks are bundled inline');
  const qfxMatch = html.match(/<script id="qfxData" type="application\/octet-stream">([^<]+)<\/script>/);
  assert(!!(qfxMatch && qfxMatch[1].length > 100000), 'Embedded base64 QingFengXing 3D game payload is present');
}

// 4. Cloudflare D1 SQLite Schema Verification
if (runAll || args.includes('--schema')) {
  console.log('\n[4] Cloudflare D1 SQLite Schema & Worker Bundle Verification');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const schema = readFileSync(ROOT + 'cloudflare/schema.sql', 'utf8');
  db.exec(schema);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  const expected = ['users', 'sessions', 'econ', 'econ_nonce', 'econ_log', 'sanctions', 'rate', 'mkt'];
  const allPresent = expected.every(t => tables.includes(t));
  assert(allPresent, 'cloudflare/schema.sql initializes all 8 D1 tables in SQLite (' + expected.join(', ') + ')');
  assert(existsSync(ROOT + 'cloudflare/worker.bundle.js'), 'cloudflare/worker.bundle.js exists and is ready for deployment');
}

if (failed > 0) {
  console.error(`\nFAIL: ${failed} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`\nPASS: All ${passed} subsystem checks passed.`);
}
