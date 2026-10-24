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
const PORT = +(process.env.CDP_PORT || 9345);
const OUT = process.argv[2] || join(tmpdir(), 'renying-ui-audit');
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
  `--user-data-dir=${OUT}/chrome`, `--window-size=${VW},${VH}`, URL,
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
await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false }, S);

const seed = `(() => {
  localStorage.setItem('renying-token', ${JSON.stringify(TOKEN)});
  localStorage.setItem('renying-tut-seen','1'); localStorage.setItem('renying-tut-done','1');
  localStorage.setItem('renying-net-mode','server');
  localStorage.setItem('renying-settings', JSON.stringify({bloom:1,fps:0,shake:1.4,quality:'auto',blur:true,vig:1,music:0,sfx:0,aim:true}));
})()`;
await cdp.send('Runtime.evaluate', { expression: seed }, S);
const loaded = cdp.once('Page.loadEventFired');
await cdp.send('Page.reload', {}, S);
await Promise.race([loaded, sleep(12000)]);
await sleep(2800);
await cdp.send('Runtime.evaluate', { expression: HELPERS }, S);
await sleep(300);

const audit = [];
for (const [name, js] of PANELS) {
  if (ONLY && !ONLY.includes(name)) continue;
  await cdp.send('Runtime.evaluate', { expression: `(async () => { ${js} })()`, awaitPromise: true }, S);
  if (process.env.RENYING_EXTRA_JS) {   // audit a panel in a specific state, e.g. a different codex character
    await cdp.send('Runtime.evaluate', { expression: process.env.RENYING_EXTRA_JS }, S); await sleep(300); }
  await sleep(name === 'menu' ? 400 : 950);
  const r = await cdp.send('Runtime.evaluate', { expression: PROBE, returnByValue: true }, S);
  audit.push(r.result.value);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, S);
  writeFileSync(`${OUT}/${VW}x${VH}-${name}.png`, Buffer.from(shot.data, 'base64'));
}
writeFileSync(`${OUT}/audit-${VW}x${VH}.json`, JSON.stringify(audit, null, 1));

console.log(`\n================ ${VW}x${VH} ================`);
for (const a of audit) {
  if (!a || a.error) { console.log(`${(a?.panel||'?').padEnd(11)} ERROR ${a?.error||''}`); continue; }
  const flags = [];
  if (a.needsScroll) flags.push(`SCROLLS ${a.panelScroll}>${a.panelClient}`);
  if (a.probs.length) flags.push(`${a.probs.length} overflow`);
  if (a.tiny.length) flags.push(`${a.tiny.filter(t=>t.fs<11.5).length} tiny`);
  console.log(`${a.panel.padEnd(11)} ${flags.length ? flags.join(' | ') : 'ok'}`);
  for (const p of a.probs) console.log(`     [${p.kind}] ${p.el} ${p.sw?`sw${p.sw}/cw${p.cw}`:''}${p.right?` L${p.left}/R${p.right}`:''} "${p.text}"`);
  for (const t of a.tiny) if (t.fs < 11.5) console.log(`     [font ${t.fs}px] ${t.el} "${t.text}"`);
  for (const x of (a.scrollX || [])) console.log(`     note: ${x.el} scrolls horizontally (${x.sw}>${x.cw}) "${x.text}"`);
  if (a.bp) { const b = a.bp;
    console.log(`     composition: ${b.cards} cards, ${b.rows} row(s) of ${b.perRow}${b.partialLastRow ? ` (last row centred=${b.lastRowCentered}, gaps ${b.gaps})` : ' (no orphan row)'}`
      + ` | dossier ${b.dossier.content}/${b.dossier.box}px (${b.dossier.ratio}) | deck ${b.deck.content}/${b.deck.box}px (${b.deck.ratio})`
      + ` | button y=${b.goTop} visible=${b.goVisible} | fill ${b.fillRatio} | grid ${b.gridSpan}/${b.panelContent}px`); }
}
const STRICT = !!process.env.RENYING_STRICT;
// Composition gate: asserted at desktop sizes, where the draft must fit one screen and look deliberate.
const compProblems = [];
for (const a of audit) {
  if (!a || !a.bp || a.vw < 1200 || a.vh < 800) continue;
  const b = a.bp;
  if (a.needsScroll) compProblems.push(`draft needs scrolling (${a.panelScroll}px of content in ${a.panelClient}px)`);
  if (b.partialLastRow && !b.lastRowCentered) compProblems.push(`hero grid leaves an orphan row piled to the left (gaps ${b.gaps})`);
  for (const [n, v] of [['dossier', b.dossier], ['move deck', b.deck]]) if (v.ratio < 0.6) compProblems.push(`${n} panel is mostly empty (${v.content}px of content in a ${v.box}px box)`);
  if (!b.goVisible) compProblems.push(`confirm button is below the fold (y=${b.goTop})`);
  if (b.fillRatio < 0.85) compProblems.push(`draft fills only ${Math.round(b.fillRatio * 100)}% of the screen`);
  if (b.gridSpan < b.panelContent * 0.95) compProblems.push(`hero grid is narrower than the panel (${b.gridSpan} of ${b.panelContent}px)`);
}
const defects = audit.filter(a => a && !a.error && (a.probs.length || a.tiny.length));
const scrollers = audit.filter(a => a && a.needsScroll);
ws.close(); chrome.kill();
if (compProblems.length) { console.log('\nFAIL (composition):'); for (const c of compProblems) console.log('  - ' + c); process.exit(1); }
if (defects.length) { console.log(`\nFAIL: ${defects.length} panel(s) with clipped/off-screen/small text: ${defects.map(d => d.panel).join(', ')}`); process.exit(1); }
if (STRICT && scrollers.length) { console.log(`\nFAIL (strict): ${scrollers.length} panel(s) need scrolling: ${scrollers.map(d => d.panel).join(', ')}`); process.exit(1); }
console.log(`\nPASS: ${audit.length} panels, no clipping, no sub-12px text${STRICT ? ', none need scrolling' : ''}.`);
process.exit(0);
