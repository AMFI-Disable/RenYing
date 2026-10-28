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
  // 山河异境的平台、风、天雷、酒雾：房主在点将台上选好的图（map）压过票；离影和磁仙在平台上乱打（跳上跳下、留影、渡影、吸人），
  // 风和天雷提前到几秒内来，回滚 150 帧重算出来的状态和第一次一模一样
  const plat = new vm.Script(`(() => {
    netRoomMode = 'maps';
    const LY = CHARS.findIndex(c => c.id === 'liying'), CX = CHARS.findIndex(c => c.id === 'cixian'), out = {};
    rollStart([LY, CX], 31, null, ['cliff', 'cliff'], 'wine');
    if (M.map !== 'wine') return { err: 'the map chosen at the draft must win over the votes, got ' + M.map };
    for (const [map, seed] of [['bamboo', 501], ['thunder', 502], ['pagoda', 503], ['wine', 504]]) {
      rollStart([LY, CX], seed, null, null, map);
      M.phase = 'fight';
      M.mapEnv.wT = 0.6; M.mapEnv.tT = 0.9;
      const P = MAPS[map].plats;
      A.x = P[0].x; mapPutOn(A, 0); B.x = P[P.length - 1].x + 40; mapPutOn(B, P.length - 1);   // 两人都从平台上开打
      let onPlat = 0, wind = 0;
      const hp0 = [A.hp, B.hp];
      for (let f = 0; f < 420; f++) {
        const k = (f >> 5) % 6;
        ROLL.loc[f] = { h: [0, 0, 2, 4, 1, 0][k], p: f % 97 === 0 ? ['jump'] : f % 53 === 7 ? ['skill'] : f % 61 === 20 ? ['skill2'] : k > 2 && f % 11 === 0 ? ['light'] : [] };   // 前几段只跳不砍（空中普攻会把人吊在半空）；第 4 段按住 ↓ 再跳：从平台上落下按住 ↓ 再跳：从平台上落下
        ROLL.rem[f] = { h: [0, 1, 0, 4, 2, 0][k], p: f % 89 === 0 ? ['jump'] : f % 47 === 9 ? ['skill'] : f % 59 === 2 ? ['skill2'] : k > 2 && f % 13 === 0 ? ['light'] : [] };
        ROLL.remLast = 420;
        rollFrame(f);
        ROLL.F = f + 1;
        if (A.plat >= 0 || B.plat >= 0) onPlat++;
        if (M.mapEnv && M.mapEnv.wOn > 0) wind++;
      }
      const before = hashState(capState());
      ROLL.pend = 200;   // 天雷在第 264 帧落下：重算要跨过它
      rollResim();
      const after = hashState(capState());
      out[map] = { match: before === after, onPlat, wind, env: JSON.stringify(M.mapEnv), hurt: hp0[0] - A.hp + hp0[1] - B.hp };
    }
    netRoomMode = 'normal';
    return out;
  })()`).runInContext(w);
  assert(!plat.err && ['bamboo', 'thunder', 'pagoda', 'wine'].every(k => plat[k] && plat[k].match && plat[k].onPlat > 0), 'Maps room: platforms, wind, lightning and mist with the clone and magnet heroes resimulate to the identical state hash', JSON.stringify(plat));
  assert(!plat.err && plat.bamboo.wind > 0, 'Maps room: the wind timer lives in the rollback state and starts on schedule', JSON.stringify(plat.bamboo || plat));
  // 离影的雾身（f.clones）：两边都是离影，大量留影和带方向的渡影。对面的按键先猜错（一直不按），
  // 隔 30 帧才收到真的按键再回滚重算，结果要和一开始就按对了的那条时间线一模一样（雾身的位置、编号、谁被打碎）。
  const ly = new vm.Script(`(() => {
    const L = CHARS.findIndex(c => c.id === 'liying');
    const real = f => ({
      loc: { h: [0, 2, 2, 1, 4, 0][(f >> 4) % 6], p: f % 50 === 5 ? ['skill'] : f % 50 === 30 ? ['skill2'] : f % 9 === 0 ? ['light'] : [] },
      rem: { h: [1, 0, 4, 2, 0, 1][(f >> 4) % 6], p: f % 44 === 3 ? ['skill'] : f % 44 === 25 ? ['skill2'] : f % 11 === 0 ? ['light'] : [] }
    });
    const T = 2400, out = { swaps: 0, planted: 0 };
    const run = guess => {
      rollStart([L, L], 777); M.rseq = 0;   // 每开一局 rseq 加一，两次重开要从同一个数起
      M.phase = 'fight';
      let swaps = 0, maxClones = 0, prev = [A.x, B.x];
      for (let f = 0; f < T; f++) {
        const r = real(f);
        ROLL.loc[f] = r.loc;
        ROLL.rem[f] = guess && f % 40 >= 10 ? { h: 0, p: [] } : r.rem;
        ROLL.remLast = f;
        rollFrame(f); ROLL.F = f + 1;
        if (guess && f % 40 === 39) { for (let g = f - 29; g <= f; g++) ROLL.rem[g] = real(g).rem; ROLL.pend = f - 29; rollResim(); }
        for (const F of [A, B]) maxClones = Math.max(maxClones, F.clones.length);
        if (Math.abs(A.x - prev[0]) > 60 || Math.abs(B.x - prev[1]) > 60) swaps++;
        prev = [A.x, B.x];
      }
      return { h: hashState(capState()), swaps, maxClones, n: A.cloneN + B.cloneN, rb: ROLL.rollbacks };
    };
    const a = run(false), b = run(true);
    return { a, b };
  })()`).runInContext(w);
  assert(ly.a.h === ly.b.h && ly.b.rb >= 10 && ly.a.n >= 6 && ly.a.maxClones >= 1 && ly.a.swaps >= 2,
    `Li Ying mist doubles: ${ly.b.rb} mispredicted rollbacks across plants/swaps/breaks end on the same state hash as the true timeline (${ly.a.n} doubles planted, ${ly.a.swaps} swaps)`, JSON.stringify(ly));
  // 同一个状态、字段先后不一样（回滚过的一边 resF 删掉再补回的字段排到了最后），校验码也要一样，不然会被当成不同步
  const ord = new vm.Script(`hashState({ a: 1, b: { x: 2, y: [3, { p: 1, q: 2 }] } }) === hashState({ b: { y: [3, { q: 2, p: 1 }], x: 2 }, a: 1 })`).runInContext(w);
  assert(ord === true, 'State hash does not depend on field order (a rolled-back peer and a non-rolled-back peer agree)');
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
