// Multi-Mode & 32-Player Frame-Time Performance Budget Gate (v1.4.0 / v1.5.0)
// Usage: node tools/tests/perf-budget.mjs [--multi] [--json]
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { gameSource } from '../ai/ai-code.mjs';

const ARGS = new Set(process.argv.slice(2));
const MULTI = ARGS.has('--multi');
const AS_JSON = ARGS.has('--json');
const FRAMES = 240;
const BUDGET_32_MS = Number(process.env.RENYING_PERF_BUDGET_MS || 12.0);

const dummyEl = {
  getContext: () => new Proxy({
    fillRect: () => {}, clearRect: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
    stroke: () => {}, moveTo: () => {}, lineTo: () => {}, save: () => {}, restore: () => {},
    translate: () => {}, scale: () => {}, rotate: () => {}, measureText: () => ({ width: 10 }),
    fillText: () => {}, strokeText: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} })
  }, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(?:stroke|fill|clip|ellipse|round|rect|quad|bezier|close|arc|set|draw|transform)/.test(k) ? () => {} : undefined)) }),
  getBoundingClientRect: () => ({ width: 1440, height: 900, left: 0, top: 0, right: 1440, bottom: 900 }),
  addEventListener: () => {}, removeEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  style: {}, appendChild: () => {}, remove: () => {},
  querySelector: () => null, querySelectorAll: () => [],
  dataset: {}, getAttribute: () => null, setAttribute: () => {}, closest: () => null
};
const elCache = {};
const getEl = id => (elCache[id] || (elCache[id] = Object.assign({}, dummyEl, { id, textContent: '', innerHTML: '', style: {} })));
const sandbox = {
  window: { innerWidth: 1440, innerHeight: 900, addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ matches: false }) },
  document: { getElementById: getEl, querySelectorAll: () => [], querySelector: () => null, createElement: () => dummyEl, addEventListener: () => {}, removeEventListener: () => {}, body: dummyEl },
  location: { protocol: 'http:', hostname: '127.0.0.1', search: '', hash: '' },
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } },
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

new vm.Script(readFileSync('src/armory-core.js', 'utf8')).runInContext(sandbox.window);
new vm.Script(readFileSync('src/net-p2p.js', 'utf8')).runInContext(sandbox.window);
new vm.Script(gameSource()).runInContext(sandbox.window);

function runScenario({ id, label, setup, expectedFighters, budgetMs }) {
  vm.runInContext(`${setup}
    M.phase = 'fight';
    for (const f of allFighters()) {
      if (!f.hidden) f.ctrl = new AICtrl('hard');
    }
    for (let i = 0; i < 30; i++) step();
  `, sandbox.window);

  const t0 = performance.now();
  const report = vm.runInContext(`(() => {
    let maxP = 0, maxInk = 0, nanCount = 0;
    for (let i = 0; i < ${FRAMES}; i++) {
      step();
      if (particles.length > maxP) maxP = particles.length;
      if (Array.isArray(M.inkZones) && M.inkZones.length > maxInk) maxInk = M.inkZones.length;
    }
    for (const f of allFighters()) {
      if (Number.isNaN(f.x) || Number.isNaN(f.y) || Number.isNaN(f.hp)) nanCount++;
    }
    return { fighters: allFighters().length, maxP, maxInk, nanCount };
  })()`, sandbox.window);
  const elapsed = performance.now() - t0;
  const avgMs = elapsed / FRAMES;
  const pass = report.fighters === expectedFighters && report.nanCount === 0 && report.maxInk <= 12 && avgMs <= budgetMs;
  return { id, label, frames: FRAMES, fighters: report.fighters, expectedFighters, elapsedMs: +elapsed.toFixed(1), avgMs: +avgMs.toFixed(3), budgetMs, maxParticles: report.maxP, maxInkZones: report.maxInk, nanCount: report.nanCount, pass };
}

const scenarios = MULTI ? [
  { id: '1v1', label: '1v1 CPU', setup: `startMatch('cpu', 0, 1, 'hard');`, expectedFighters: 2, budgetMs: 3.0 },
  { id: 'tag3', label: '3v3 Relay', setup: `startTag3Match([0, 1, 2], [3, 4, 5], 'hard');`, expectedFighters: 2, budgetMs: 3.0 },
  { id: '16v16', label: '32-player 16v16', setup: `startMelee(16, 0, 'hard');`, expectedFighters: 32, budgetMs: BUDGET_32_MS }
] : [
  { id: '16v16', label: '32-player perf budget', setup: `startMelee(16, 0, 'hard');`, expectedFighters: 32, budgetMs: BUDGET_32_MS }
];

const results = scenarios.map(runScenario);
const allPass = results.every(r => r.pass);

if (AS_JSON) {
  console.log(JSON.stringify({ ok: allPass, results }, null, 2));
} else {
  for (const r of results) {
    console.log(`${r.label}: ${r.fighters} fighters, ${r.frames} frames in ${r.elapsedMs.toFixed(1)} ms (${r.avgMs.toFixed(3)} ms/frame, budget <= ${r.budgetMs} ms/frame, maxParticles=${r.maxParticles}, maxInkZones=${r.maxInkZones}, nan=${r.nanCount})`);
  }
  if (allPass) console.log(MULTI ? 'PASS: All multi-mode frame-time and memory-bound budgets satisfied.' : 'PASS: 32-player frame-time and memory-bound budget satisfied.');
  else console.error('FAIL: One or more performance budgets failed.');
}
process.exit(allPass ? 0 : 1);
