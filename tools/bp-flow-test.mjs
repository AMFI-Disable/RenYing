// Headless UI audit for RenYing: screenshots every panel + measures layout problems.
// Node built-ins only (global fetch + WebSocket). Attaches via the browser-level CDP
// WebSocket (the /json HTTP endpoint is unreachable in this sandbox).
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, openSync, readFileSync as readF } from 'node:fs';

import { existsSync } from 'node:fs';
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
const ONLY = process.argv[5] ? process.argv[5].split(',') : null;
let TOKEN = '';
try { TOKEN = readF(process.env.RENYING_TOKEN_FILE || '/tmp/renying-token.txt', 'utf8').trim(); } catch {}


mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/chrome.log`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HELPERS = `
window.__bpDemo = () => { bpMode='cpu'; ensurePortraits();
  BP = { step: 2, bans: [3, 6], picks: [0, -1], t: 18, avail: [[0,1,2,3,7],[0,2,4,5,8]] };
  showScreen('bp'); renderBP(); };
window.__endDemo = () => {
  const t = document.getElementById('endTitle');
  t.textContent = '青锋 胜'; t.style.color = 'rgb(120,230,255)';
  document.getElementById('endSub').textContent = '月下无敌手';
  document.getElementById('endRank').textContent = '+40 墨锭 · 有任务可领奖了';
  const a = document.getElementById('againBtn'); a.textContent = '再战'; a.disabled = false;
  const w = document.getElementById('rpWatch'); w.style.display = ''; w.textContent = '看回放';
  showScreen('end'); };
window.__forestDemo = () => {
  document.getElementById('feWave').textContent = '1.3 破关';
  document.getElementById('feStars').textContent = '★★☆';
  document.getElementById('feInfo').innerHTML = '残存生命 62%，共击退 18 只妖物<br><span style="font-size:13px">余 60% 以上三星，30% 以上两星</span>';
  document.getElementById('feNext').style.display = ''; showScreen('forestEnd'); };
window.__tutdoneDemo = () => {
  document.getElementById('tutReward').innerHTML = '该会的都会了。去找电脑或是同学，过几招吧。<br>奖励 <b style="color:#e9c46a">300 墨锭</b>，去武库买个武器箱试试手气吧！';
  showScreen('tutdone'); };
`;

const PANELS = [
  ['menu', `backToMenu()`], ['single', `openScreen('single')`], ['cpu', `openScreen('cpu')`],
  ['stage', `openScreen('stage')`], ['train', `openScreen('train')`], ['netp', `openScreen('netp')`],
  ['help', `openScreen('help')`], ['codex', `openScreen('codex')`], ['settings', `openScreen('settings')`],
  ['community', `openScreen('community')`], ['acc', `showScreen('acc')`], ['lb', `openLeaderboard()`],
  ['welfare', `openWelfare()`], ['replays', `openScreen('replays')`],
  ['tasks', `openScreen('tasks')`], ['bp', `PROF.owned = CHARS.map(c => c.id); bpStart('cpu'); bpCpuT = 9999; bpApply(3); bpApply(6); bpCpuT = 9999; bpSel = 4; renderBP(); showScreen('bp');`], ['pause', `showScreen('pause')`],
  ['end', `__endDemo()`], ['forestEnd', `__forestDemo()`], ['tutask', `showScreen('tutask')`],
  ['tutdone', `__tutdoneDemo()`], ['armory', `openScreen('armory')`],
];

const PROBE = `(() => {
  const desc = el => { let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.');
    return s; };
  const scr = document.querySelector('.scr.on');
  if (!scr) return { panel: '(none)', error: 'no .scr.on' };
  const W = innerWidth, H = innerHeight;
  const out = { panel: scr.id, vw: W, vh: H, panelScroll: scr.scrollHeight, panelClient: scr.clientHeight,
                needsScroll: scr.scrollHeight > scr.clientHeight + 2, probs: [], tiny: [], scrollX: [] };
  const seen = new Set();
  for (const el of scr.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    const key = desc(el);
    const overY = el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0;
    if (overY && cs.overflowY === 'hidden' && el.clientHeight > 12) {
      if (!seen.has('y'+key)) { seen.add('y'+key); out.probs.push({ kind:'clipY', el:key, sh:el.scrollHeight, ch:el.clientHeight,
        text:(el.textContent||'').trim().slice(0,26) }); } }
    const overX = el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0;
    if (overX && cs.overflowX === 'hidden') {
      if (!seen.has('x'+key)) { seen.add('x'+key); out.probs.push({ kind:'clipX', el:key, sw:el.scrollWidth, cw:el.clientWidth,
        text:(el.textContent||'').trim().slice(0,26) }); } }
    else if (overX && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) {
      if (!seen.has('s'+key)) { seen.add('s'+key); out.scrollX.push({ el:key, sw:el.scrollWidth, cw:el.clientWidth,
        text:(el.textContent||'').trim().slice(0,24).replace(/\s+/g,' ') }); } }
    if (r.right > W + 1 || r.left < -1) {
      if (!seen.has('o'+key)) { seen.add('o'+key); out.probs.push({ kind:'offscreenX', el:key,
        left:Math.round(r.left), right:Math.round(r.right), text:(el.textContent||'').trim().slice(0,26) }); } }
    // element spilling out of its own parent box (e.g. a segmented control too wide for its grid cell)
    if (cs.position !== 'absolute' && cs.position !== 'fixed' && el.parentElement) {
      const pr = el.parentElement.getBoundingClientRect();
      const pcs = getComputedStyle(el.parentElement);
      if (pcs.overflowX === 'visible' && pr.width > 0 && r.right - pr.right > 4 && !seen.has('p'+key)) {
        seen.add('p'+key); out.probs.push({ kind:'parentOverflow', el:key,
          over:Math.round(r.right - pr.right), text:(el.textContent||'').trim().slice(0,26) }); } }
    const hasText = el.children.length === 0 && (el.textContent||'').trim().length > 0;
    if (hasText) { const fs = parseFloat(cs.fontSize);
      if (fs < 12) out.tiny.push({ el:key, fs, text:(el.textContent||'').trim().slice(0,22) }); }
  }
  if (scr.id === 'bp') {   // composition checks for the draft screen
    const contentH = box => { const r = box.getBoundingClientRect(); let m = 0;
      for (const e of box.querySelectorAll('*')) {
        if (e.children.length) continue;           // leaves only: a stretched grid child reports the box height
        const b = e.getBoundingClientRect().bottom - r.top; if (b > m) m = b; }
      return Math.round(m); };
    const band = sel => { const e = document.querySelector(sel); if (!e) return null; const h = e.getBoundingClientRect().height;
      return { box: Math.round(h), content: contentH(e), ratio: h ? +(contentH(e) / h).toFixed(2) : null }; };
    const cards = [...document.querySelectorAll('.bpcard')], rows = new Map();
    for (const c of cards) { const t = Math.round(c.getBoundingClientRect().top); if (!rows.has(t)) rows.set(t, []); rows.get(t).push(c); }
    const rowList = [...rows.values()], cols = rowList[0] ? rowList[0].length : 0, last = rowList[rowList.length - 1] || [];
    const gr = document.querySelector('.bpgrid').getBoundingClientRect(), lr = last.map(c => c.getBoundingClientRect());
    const leftGap = lr.length ? Math.min(...lr.map(r => r.left)) - gr.left : 0;
    const rightGap = lr.length ? gr.right - Math.max(...lr.map(r => r.right)) : 0;
    const go = document.getElementById('bpGo').getBoundingClientRect();
    const bpw = document.querySelector('.bpw').getBoundingClientRect();
    out.bp = { cards: cards.length, perRow: cols, rows: rowList.length, partialLastRow: cards.length % cols !== 0,
      lastRowCentered: Math.abs(leftGap - rightGap) <= 14, gaps: [Math.round(leftGap), Math.round(rightGap)],
      dossier: band('.bpdetail'), deck: band('#bpMoveDeck'),
      goVisible: go.bottom <= innerHeight && go.top >= 0, goTop: Math.round(go.top),
      fillRatio: +(scr.scrollHeight / innerHeight).toFixed(2),
      gridSpan: Math.round(gr.width), panelContent: Math.round(bpw.width - 40) };
  }
  out.tiny = out.tiny.slice(0,10); out.probs = out.probs.slice(0,25); out.scrollX = out.scrollX.slice(0,8);
  return out; })()`;

// Wait for the panel to stop moving before measuring it: a pending portrait decode or a
// still-running entrance animation makes the same build measure differently run to run
// (an empty .bpdetail reads as "mostly empty" and an un-finished .mtitle slide reads as
// "off-screen"). Finite animations only — the pulsing slots loop forever on purpose.
const SETTLE = `(() => new Promise(res => {
  const imgs = [...document.images].filter(i => !i.complete && i.loading !== 'lazy');
  const anims = (document.getAnimations ? document.getAnimations() : []).filter(a => {
    if (a.playState !== 'running') return false;
    const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
    return !!t && t.iterations !== Infinity;
  });
  const waits = [
    ...imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })),
    ...anims.map(a => a.finished.catch(() => {}))
  ];
  if (!waits.length) return res(true);
  Promise.race([Promise.all(waits).then(() => true), new Promise(r => setTimeout(() => r(false), 1200))]).then(res);
}))()`;

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
  await check('2v2 draft survives the home transition', `(async () => { localStorage.setItem('renying-tut-seen','1'); localStorage.setItem('renying-tut-done','1'); showScreen('menu'); menuGo('2v2'); document.getElementById('btn2v2GoLocal').click(); await new Promise(r => setTimeout(r, 1700)); return { ok: currentScreen === 'bp' && bpMode === '2v2' && !!BP && document.querySelectorAll('#bpGrid .bpcard').length === CHARS.length, screen: currentScreen }; })()`);
  for (const mode of ['p_cc','pp_cc','pp_pp']) await check('local draft ' + mode, `(() => { showScreen('single'); open2v2Modal('${mode}'); document.getElementById('btn2v2GoLocal').click(); return {ok: currentScreen === 'bp' && bpMode === '2v2' && !!BP && document.querySelectorAll('#bpGrid .bpcard').length === CHARS.length}; })()`);
  await check('English draft fits without horizontal overflow', `(() => { I18N.setLang('en'); bpStart('2v2', {subMode:'pp_cc'}); const w = document.querySelector('#bp .bpw'); return {ok: w.scrollWidth <= w.clientWidth + 2, scroll: w.scrollWidth, width: w.clientWidth}; })()`);
  await check('2v2 AI draft', `(() => { showScreen('single'); open2v2Modal(); document.getElementById('btn2v2GoWatch').click(); return {ok: currentScreen === 'bp' && bpMode === 'watch2v2' && !!watch2v2Bp && document.querySelectorAll('#bpGrid .bpcard').length === CHARS.length}; })()`);
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
  await check('offline styles and draft without remote fonts', `(() => { const css = [...document.styleSheets].find(s => !s.href); showScreen('single'); open2v2Modal('pp_cc'); document.getElementById('btn2v2GoLocal').click(); return {ok: !!css && css.cssRules.length > 100 && currentScreen === 'bp' && !!BP && document.querySelectorAll('#bpGrid .bpcard').length === CHARS.length}; })()`);

  if (pageErrors.length) throw new Error('Uncaught browser errors: ' + pageErrors.join(' | '));
  console.log('PASS browser draft and stylesheet checks');
} finally { ws.onclose = null; ws.close(); chrome.kill(); }
