// 性能预算检查：用无头 Chromium 打开网页，量三样东西，超过 tools/perf-budget.json 的预算就失败。
//   1. 首页加载：不带缓存打开网页，到主菜单显示出来用了多久（跑几次取中位数）；
//   2. 面板切换：打开每个常用面板，到下一帧画出来用了多久（每个面板几次取中位数，报最慢的那个）；
//   3. 对局帧率：电脑对电脑观战 1v1 和 2v2 各看几秒，量平均帧率和 95% 的帧间隔。
// 用法（先在仓库根目录开本地服务器：python3 -m http.server 8791）：
//   node tools/perf-audit.mjs [outdir]
//   RENYING_URL=…  换网址；RENYING_CHROME=…  指定浏览器；PERF_BUDGET_SCALE=1.5  把预算整体放宽（慢机器上用）
// 只用 Node 自带的东西（fetch、WebSocket），和 ui-audit / hud-audit 一样直接连 Chrome 的调试接口。
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, openSync, existsSync } from 'node:fs';

const CHROME = process.env.RENYING_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium not found - set RENYING_CHROME=/path/to/chrome'); process.exit(1); }
const URL = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const PORT = +(process.env.CDP_PORT || 9347);
const OUT = process.argv[2] || join(tmpdir(), 'renying-perf-audit');
const VW = 1440, VH = 900;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = JSON.parse(readFileSync(join(ROOT, 'tools', 'perf-budget.json'), 'utf8'));
const SCALE = +(process.env.PERF_BUDGET_SCALE || 1) || 1;
const LOADS = 3, SWITCHES = 3, WATCH_MS = 5000;

mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/chrome.log`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.events = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method && this.events.has(m.method)) { this.events.get(m.method)(m.params); } }; }
  send(method, params = {}, sid) { const id = ++this.id;
    return new Promise((res, rej) => { this.pend.set(id, { res, rej });
      this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); }); }
  once(method) { return new Promise(r => this.events.set(method, p => { this.events.delete(method); r(p); })); }
}

const logFd = openSync(LOG, 'w');
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${OUT}/chrome`, `--window-size=${VW},${VH}`, 'about:blank',
], { stdio: ['ignore', logFd, logFd] });
process.on('exit', () => { try { chrome.kill(); } catch (e) {} });

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250);
  try { const m = readFileSync(LOG, 'utf8').match(/DevTools listening on (ws:\/\/\S+)/); if (m) wsUrl = m[1]; } catch {} }
if (!wsUrl) { console.error('Chrome never reported a DevTools endpoint'); chrome.kill(); process.exit(1); }
const ws = new WebSocket(wsUrl);
ws.onclose = e => { console.error('CDP socket closed:', e.code, e.reason); process.exit(1); };
await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws open timeout')), 10000); });
const cdp = new CDP(ws);

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await cdp.send('Page.enable', {}, S);
await cdp.send('Runtime.enable', {}, S);
await cdp.send('Network.enable', {}, S);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false }, S);

const ev = async (expr, awaitPromise = false) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, S);
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
async function nav(url) { const l = cdp.once('Page.loadEventFired'); await cdp.send('Page.navigate', { url }, S); await Promise.race([l, sleep(20000)]); }

// 每次打开网页之前都装上：网页脚本全部跑完（DOMContentLoaded）、主菜单（#menu.scr.on）显示出来之后画出的第一帧，记进 window.__menuAt
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const check = () => {
    const m = document.getElementById('menu');
    if (document.readyState !== 'loading' && m && m.classList.contains('on') && !window.__menuAt) requestAnimationFrame(() => { window.__menuAt = window.__menuAt || performance.now(); });
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('DOMContentLoaded', check);
})();` }, S);

// 先打开一次写好设置（跳过教程、关掉音乐），后面才开始计时
await nav(URL);
await ev(`localStorage.setItem('renying-tut-seen','1'); localStorage.setItem('renying-tut-done','1');
  localStorage.setItem('renying-settings', JSON.stringify({bloom:1,fps:0,shake:1,quality:'auto',blur:true,vig:1,music:0,sfx:0,aim:true}));`);

const result = { when: new Date().toISOString(), url: URL, scale: SCALE, load: {}, panels: {}, match: {} };

/* ---------- 1. 首页加载（不带缓存） ---------- */
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, S);
const loads = [];
for (let i = 0; i < LOADS; i++) {
  await nav(URL);
  let t = null;
  for (let k = 0; k < 200 && !t; k++) { await sleep(100); t = await ev('window.__menuAt || null'); }
  const nav0 = await ev(`(() => { const n = performance.getEntriesByType('navigation')[0];
    return n ? { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), bytes: n.transferSize } : null; })()`);
  loads.push({ menu: t ? Math.round(t) : null, ...nav0 });
}
await cdp.send('Network.setCacheDisabled', { cacheDisabled: false }, S);
result.load = { runs: loads, menuMs: median(loads.map(l => l.menu ?? 1e9)), dclMs: median(loads.map(l => l.dcl)), loadMs: median(loads.map(l => l.load)) };
await sleep(1500);

/* ---------- 2. 面板切换 ---------- */
const PANELS = [
  ['single', `openScreen('single')`], ['cpu', `openScreen('cpu')`], ['netp', `openScreen('netp')`],
  ['codex', `openScreen('codex')`], ['settings', `openScreen('settings')`], ['community', `openScreen('community')`],
  ['tasks', `openScreen('tasks')`], ['armory', `openScreen('armory')`], ['help', `openScreen('help')`],
];
for (const [name, js] of PANELS) {
  const runs = [];
  for (let i = 0; i < SWITCHES; i++) {
    await ev(`backToMenu()`); await sleep(250);
    runs.push(await ev(`new Promise(res => { const t0 = performance.now(); ${js};
      requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t0)))); })`, true));
    await sleep(250);
  }
  result.panels[name] = { runs, ms: median(runs) };
}
await ev(`backToMenu()`); await sleep(500);

/* ---------- 3. 对局帧率（电脑对电脑观战） ---------- */
const FPS_PROBE = `new Promise(res => {
  const gaps = []; let last = performance.now(); const t0 = last;
  const step = now => { gaps.push(now - last); last = now;
    if (now - t0 < ${WATCH_MS}) requestAnimationFrame(step);
    else { gaps.sort((a, b) => a - b);
      res({ frames: gaps.length, fps: Math.round(gaps.length / ((now - t0) / 1000) * 10) / 10,
        p95: Math.round(gaps[Math.floor(gaps.length * 0.95)] * 10) / 10, worst: Math.round(gaps[gaps.length - 1]) }); } };
  requestAnimationFrame(step); })`;
const MATCHES = [
  ['watch1v1', `startMatch('cpu','normal',[0,2],true); showScreen(null); paused=false;`],
  ['watch2v2', `startWatch2v2(); showScreen(null); paused=false;`],
];
for (const [name, js] of MATCHES) {
  await ev(`(() => { ${js} })()`);
  await sleep(2500);   // 开场动画过去，进入正式对打
  result.match[name] = await ev(FPS_PROBE, true);
  await ev(`try { backToMenu(); } catch (e) {}`); await sleep(800);
}

/* ---------- 和预算比 ---------- */
const checks = [];
const over = (label, value, budget, unit) => checks.push({ label, value, budget: Math.round(budget * 10) / 10, unit, ok: value <= budget });
const under = (label, value, budget, unit) => checks.push({ label, value, budget: Math.round(budget * 10) / 10, unit, ok: value >= budget, min: true });
over('首页加载到主菜单', result.load.menuMs, BUDGET.load.menuMs * SCALE, 'ms');
const slowest = Object.entries(result.panels).sort((a, b) => b[1].ms - a[1].ms)[0];
for (const [name, p] of Object.entries(result.panels)) over(`面板切换 ${name}`, p.ms, (BUDGET.panels[name] ?? BUDGET.panels.default) * SCALE, 'ms');
for (const [name, m] of Object.entries(result.match)) {
  const b = BUDGET.match[name];
  under(`${name} 平均帧率`, m.fps, b.fps / SCALE, 'fps');
  over(`${name} 95% 帧间隔`, m.p95, b.p95Ms * SCALE, 'ms');
}
result.checks = checks;
writeFileSync(`${OUT}/perf-${VW}x${VH}.json`, JSON.stringify(result, null, 1));

console.log(`\n================ 性能预算 ${VW}x${VH}${SCALE !== 1 ? `（预算放宽 ${SCALE} 倍）` : ''} ================`);
console.log(`首页：主菜单 ${result.load.menuMs} ms，DOMContentLoaded ${result.load.dclMs} ms，load ${result.load.loadMs} ms（${LOADS} 次中位数，不带缓存）`);
console.log(`最慢的面板：${slowest[0]} ${slowest[1].ms} ms`);
for (const [name, m] of Object.entries(result.match)) console.log(`${name}：${m.fps} fps，95% 帧间隔 ${m.p95} ms，最长一帧 ${m.worst} ms`);
console.log('');
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label.padEnd(20)} ${String(c.value).padStart(7)} ${c.unit}  预算 ${c.min ? '≥' : '≤'} ${c.budget} ${c.unit}`);
const bad = checks.filter(c => !c.ok);
console.log(`\n${checks.length - bad.length} 项在预算内，${bad.length} 项超出`);
for (const c of bad) console.log(`::error::性能预算超出：${c.label} ${c.value} ${c.unit}（预算 ${c.min ? '≥' : '≤'} ${c.budget} ${c.unit}）`);
chrome.kill();
process.exit(bad.length ? 1 : 0);
