// 点将台和样式的浏览器检查：用无头 Chrome 打开网页，跑一串断言（不截图）：
//   远程字体加载不到时样式照常、主页切换、2v2 点将、各种本机点将、英文点将不横向溢出、
//   排位定级、一键开箱的每日 / 每周额度，最后再打开离线版 renying-offline.html 查一遍。
//   node tools/audits/bp-flow-test.mjs [outdir] [宽] [高]        需要先在仓库根目录起 8791 端口的本机服务器
// 只用 Node 自带的 fetch 和 WebSocket，通过浏览器级的 CDP WebSocket 连上（这个沙盒里 /json 接口连不上）。
//
// 文件结构：1. 找 Chrome、读参数  2. CDP 小客户端  3. 启动 Chrome 并连上  4. 打开网页，逐条 check()
// 找 bug 提示：失败时报 "标签: 返回值"，标签就是 check() 的第一个参数，返回值里的 stage 指出卡在哪一步。
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, openSync, readFileSync as readF } from 'node:fs';

import { existsSync } from 'node:fs';
// ---------- 1. 找 Chrome、读参数 ----------
const CHROME = process.env.RENYING_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium not found - set RENYING_CHROME=/path/to/chrome'); process.exit(1); }
const URL = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const PORT = +(process.env.CDP_PORT || 9433);
const OUT = process.argv[2] || join(tmpdir(), 'renying-bp-flow');
const VW = +(process.argv[3] || 1440);
const VH = +(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/chrome.log`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 2. CDP 小客户端：send 发命令等回包，once 等某个事件一次 ----------
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

// ---------- 3. 启动 Chrome 并连上 ----------
const logFd = openSync(LOG, 'w');
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${OUT}/chrome`, `--window-size=${VW},${VH}`, 'about:blank',
], { stdio: ['ignore', logFd, logFd] });
process.on('exit', () => { try { chrome.kill(); } catch (e) {} });

// read the browser-level ws endpoint out of the log (no HTTP dependency)
let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  await sleep(250);
  try { const m = readF(LOG, 'utf8').match(/DevTools listening on (ws:\/\/\S+)/); if (m) wsUrl = m[1]; } catch {}
}
if (!wsUrl) { console.error('Chrome never reported a DevTools endpoint'); chrome.kill(); process.exit(1); }
console.log('attached:', wsUrl.replace(/\/devtools\/browser\/.*/, '/devtools/browser/…'));

const ws = new WebSocket(wsUrl);
ws.onclose = e => { console.error('CDP socket closed:', e.code, e.reason); process.exit(1); };
await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws open timeout')), 10000); });
const cdp = new CDP(ws);

let pageId = null;
for (let i = 0; i < 40 && !pageId; i++) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  pageId = targetInfos.find(t => t.type === 'page')?.targetId;
  if (!pageId) await sleep(250);
}
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: pageId, flatten: true });
const S = sessionId;
await cdp.send('Page.enable', {}, S);
await cdp.send('Runtime.enable', {}, S);
const pageErrors = [];
cdp.events.set('Runtime.exceptionThrown', p => pageErrors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false }, S);


await cdp.send('Network.enable', {}, S);
await cdp.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] }, S);
// ---------- 4. 打开网页，逐条检查 ----------
async function loadGame(url) {
  await cdp.send('Page.navigate', { url }, S);
  for (let i = 0; i < 100; i++) {
    const r = await cdp.send('Runtime.evaluate', { expression: `location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && typeof showScreen === 'function'`, returnByValue: true }, S);
    if (r.result?.value) return;
    await sleep(200);
  }
  throw new Error('Game did not finish loading: ' + url);
}
await loadGame(URL);
// Let the first-run language and tutorial prompts finish their startup timers.
await sleep(1800);
async function check(label, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) throw new Error(label + ': ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  if (!r.result.value?.ok) throw new Error(label + ': ' + JSON.stringify(r.result.value));
  console.log('PASS ' + label);
}
try {
  await check('styles work without remote fonts', `(() => { const css = [...document.styleSheets].find(s => !s.href); const body = getComputedStyle(document.body); return { ok: !!css && css.cssRules.length > 100 && body.backgroundColor === 'rgb(10, 11, 28)' && body.fontFamily.length > 0 }; })()`);
  await check('home navigation completes', `(async () => { showScreen('menu'); menuGo('single'); await new Promise(r => setTimeout(r, 900)); return {ok: currentScreen === 'single'}; })()`);
  await check('2v2 draft survives the home transition', `(async () => { localStorage.setItem('renying-tut-seen','1'); localStorage.setItem('renying-tut-done','1'); showScreen('menu'); menuGo('2v2'); document.getElementById('btn2v2GoLocal').click(); const until = Date.now() + 3500; while (Date.now() < until && currentScreen !== 'bp') { if (currentScreen === 'mapBriefing' && document.getElementById('mbContinueBtn')) document.getElementById('mbContinueBtn').click(); await new Promise(r => setTimeout(r, 100)); } return { ok: currentScreen === 'bp' && bpMode === '2v2' && !!BP && document.querySelectorAll('#bpGrid .bpcard').length === CHARS.length, screen: currentScreen }; })()`);
  for (const mode of ['p_cc','pp_cc','pp_pp']) await check('local draft ' + mode, `(async () => { showScreen('single'); open2v2Modal('${mode}'); document.getElementById('btn2v2GoLocal').click(); const until = Date.now() + 3500; while (Date.now() < until && currentScreen !== 'bp') { if (currentScreen === 'mapBriefing' && document.getElementById('mbContinueBtn')) document.getElementById('mbContinueBtn').click(); await new Promise(r => setTimeout(r, 100)); } return {ok: currentScreen === 'bp' && bpMode === '2v2' && !!BP && document.querySelectorAll('#bpGrid .bpcard').length === CHARS.length}; })()`);
  await check('English draft fits without horizontal overflow', `(() => { I18N.setLang('en'); bpStart('2v2', {subMode:'pp_cc'}); const w = document.querySelector('#bp .bpw'); return {ok: w.scrollWidth <= w.clientWidth + 2, scroll: w.scrollWidth, width: w.clientWidth}; })()`);
  await check('2v2 AI draft', `(async () => { showScreen('single'); open2v2Modal(); document.getElementById('btn2v2GoWatch').click(); const until = Date.now() + 3500; while (Date.now() < until && currentScreen !== 'bp') { if (currentScreen === 'mapBriefing' && document.getElementById('mbContinueBtn')) document.getElementById('mbContinueBtn').click(); await new Promise(r => setTimeout(r, 100)); } return {ok: currentScreen === 'bp' && bpMode === 'watch2v2' && !!watch2v2Bp && document.querySelectorAll('#bpGrid .bpcard').length === CHARS.length}; })()`);
  await check('three-match placement migrates existing estimates', `(() => { RKS_KEY = 'renying-rk-' + rkOwner(); PROF.rk = null; RKS = {season: rkSeason().id, placed: 3, pts: 0, est: 7800, peak: 0}; const s = rkState(); return {ok: RK.PLACE === 3 && rkPlaced(s) && s.pts === 7800 && s.peak === 7800}; })()`);
  await check('bulk opening respects shared daily and weekly limits', `(async () => {
    CloudSave.getUser = () => ({uid:'bulk-test', isCloud:false}); PROF.guest = false; PROF.armory = null;
    const s = PROF.armory; delete s.sig; s.cases.c1 = 8; s.cases.c2 = 2; s.cases.c7 = 5; s.cases.c8 = 2;
    const raw = JSON.stringify(s), uid = 'bulk-test', salt = 'ry-armory|v1|';
    s.sig = ArmoryCore.hash32(salt + uid + '|' + raw).toString(36) + ArmoryCore.hash32(raw + '|' + uid + salt).toString(36);
    PROF.armory = s; showScreen('armory'); await openArmory('cases');
    const button = document.querySelector('[data-open-all]');
    if (!button || button.disabled) return {ok:false, stage:'button'};
    button.click();
    for (let i = 0; i < 200 && !document.getElementById('arBulkDone'); i++) await new Promise(r => setTimeout(r, 50));
    const out = PROF.armory;
    return {ok: !!document.getElementById('arBulkDone') && out.cases.c1 === 3 && out.cases.c2 === 2 && out.cases.c7 === 2 && out.cases.c8 === 1 && out.inv.length === 9, cases:out.cases, items:out.inv.length};
  })()`);
  await loadGame(URL.replace(/[^/]*$/, 'renying-offline.html'));
  await check('offline styles and draft without remote fonts', `(async () => { const css = [...document.styleSheets].find(s => !s.href); showScreen('single'); open2v2Modal('pp_cc'); document.getElementById('btn2v2GoLocal').click(); const until = Date.now() + 3500; while (Date.now() < until && currentScreen !== 'bp') { if (currentScreen === 'mapBriefing' && document.getElementById('mbContinueBtn')) document.getElementById('mbContinueBtn').click(); await new Promise(r => setTimeout(r, 100)); } return {ok: !!css && css.cssRules.length > 100 && currentScreen === 'bp' && !!BP && document.querySelectorAll('#bpGrid .bpcard').length === CHARS.length}; })()`);

  if (pageErrors.length) throw new Error('Uncaught browser errors: ' + pageErrors.join(' | '));
  console.log('PASS browser draft and stylesheet checks');
} finally { ws.onclose = null; ws.close(); chrome.kill(); }
