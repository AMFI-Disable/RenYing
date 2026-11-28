// 32-Player Frame-Time Performance Budget Gate (v1.4.0)
// Usage: node tools/tests/perf-budget.mjs
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { gameSource } from '../ai/ai-code.mjs';

const FRAMES = 240;
const BUDGET_MS = Number(process.env.RENYING_PERF_BUDGET_MS || 12.0);

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

vm.runInContext(`
  startMelee(16, 0, 'hard');
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

console.log(`32-player perf budget: ${report.fighters} fighters, ${FRAMES} frames in ${elapsed.toFixed(1)} ms (${avgMs.toFixed(3)} ms/frame, budget <= ${BUDGET_MS} ms/frame, maxParticles=${report.maxP}, maxInkZones=${report.maxInk}, nan=${report.nanCount})`);

if (report.fighters !== 32) {
  console.error(`FAIL: expected 32 fighters, got ${report.fighters}`);
  process.exit(1);
}
if (report.nanCount > 0) {
  console.error(`FAIL: ${report.nanCount} fighter(s) produced NaN coordinates or HP`);
  process.exit(1);
}
if (report.maxInk > 12) {
  console.error(`FAIL: Living Ink zones exceeded 12-zone cap (${report.maxInk})`);
  process.exit(1);
}
if (avgMs > BUDGET_MS) {
  console.error(`FAIL: average frame time ${avgMs.toFixed(3)} ms exceeded budget ${BUDGET_MS} ms`);
  process.exit(1);
}
console.log('PASS: 32-player frame-time and memory-bound budget satisfied.');
process.exit(0);
