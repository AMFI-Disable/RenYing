// RenYing multiplayer regression harness.
// Drives TWO real browser tabs through the game's own networking paths and asserts
// they connect. Modes:
//   server  - LAN/dedicated server happy path (host creates room, client joins by code)
//   p2p     - real WebRTC/PeerJS happy path (public signalling server)
//   errtest - host a P2P room, then fire synthetic PeerJS errors at the host handler
//             and report uncaught exceptions + the status line it produced
// Usage: node renying-mp.mjs <mode|all> [outdir]
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, openSync } from 'node:fs';

import { existsSync } from 'node:fs';
const CHROME = process.env.RENYING_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium not found - set RENYING_CHROME=/path/to/chrome'); process.exit(1); }
const PORT = +(process.env.RENYING_CDP_PORT || 9355);
const GAME = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const OUT = process.argv[3] || join(tmpdir(), 'renying-net-test');
const MODE = process.argv[2] || 'all';
let TOKEN = '';
try { TOKEN = readFileSync(process.env.RENYING_TOKEN_FILE || '/tmp/renying-token.txt', 'utf8').trim(); } catch {}

mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/chrome.log`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.subs = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) { const k = `${m.method}|${m.sessionId || ''}`;
        for (const cb of (this.subs.get(k) || [])) cb(m.params);
        for (const cb of (this.subs.get(m.method) || [])) cb(m.params, m.sessionId); } }; }
  send(method, params = {}, sid) { const id = ++this.id;
    return new Promise((res, rej) => { this.pend.set(id, { res, rej });
      this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); }); }
  on(key, cb) { if (!this.subs.has(key)) this.subs.set(key, []); this.subs.get(key).push(cb); }
  once(key) { return new Promise(r => { const f = p => { r(p);
    this.subs.set(key, (this.subs.get(key) || []).filter(x => x !== f)); }; this.on(key, f); }); }
}

const logFd = openSync(LOG, 'w');
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${OUT}/chrome`, '--window-size=1280,800', 'about:blank',
], { stdio: ['ignore', logFd, logFd] });

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250);
  try { const m = readFileSync(LOG, 'utf8').match(/DevTools listening on (ws:\/\/\S+)/); if (m) wsUrl = m[1]; } catch {} }
if (!wsUrl) { console.error('no DevTools endpoint'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 10000); });
const cdp = new CDP(ws);
const exceptions = [];      // uncaught errors, per tab
const tabErrors = new Map();
cdp.on('Runtime.exceptionThrown', (p, sid) => {
  const t = p?.exceptionDetails?.exception?.description || p?.exceptionDetails?.text || 'unknown';
  exceptions.push({ sid, text: String(t).split('\n')[0] });
  tabErrors.set(sid, (tabErrors.get(sid) || 0) + 1);
});

const evalOn = async (sid, expression, awaitPromise = false) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sid);
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
async function nav(sid, url) {
  const loaded = cdp.once(`Page.loadEventFired|${sid}`);
  await cdp.send('Page.navigate', { url }, sid);
  await Promise.race([loaded, sleep(10000)]);
}
async function poll(sid, expr, ms = 20000, step = 400) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await evalOn(sid, expr)) return true; } catch {} await sleep(step); }
  return false;
}

const seed = netMode => `(() => {
  localStorage.setItem('renying-token', ${JSON.stringify(TOKEN)});
  localStorage.setItem('renying-tut-seen','1'); localStorage.setItem('renying-tut-done','1');
  localStorage.setItem('renying-net-mode', ${JSON.stringify(netMode)});
  localStorage.removeItem('renying-resume');
  localStorage.setItem('renying-settings', JSON.stringify({bloom:0,fps:0,shake:0,quality:'low',blur:false,vig:0,music:0,sfx:0,aim:true}));
})()`;

async function newTab(netMode) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  await nav(sessionId, GAME);
  await evalOn(sessionId, seed(netMode));
  await nav(sessionId, GAME);
  await sleep(1800);
  return sessionId;
}

const state = sid => `(() => ({ open: !!(typeof NET !== 'undefined' && NET.open), role: (typeof NET !== 'undefined' && NET.role) || null, names: (typeof NET !== 'undefined' && NET.names) || null,
  code: (document.getElementById('roomCode')||{}).textContent || '',
  status: (document.getElementById('netStatus')||{}).textContent || '',
  bp: !!document.querySelector('#bp.on'), mode: typeof currentNetMode !== 'undefined' ? currentNetMode : null,
  rtt: (typeof NET !== 'undefined' && NET.rtt) || null }))()`;

async function hostAndJoin(netMode, label) {
  const res = { label, ok: false, notes: [] };
  const A = await newTab(netMode), B = await newTab(netMode);
  await evalOn(A, `setNetMode(${JSON.stringify(netMode)}); netConnect(true)`);
  const got = await poll(A, `(document.getElementById('roomCode').textContent||'').trim().length === 4`, 50000);
  const code = await evalOn(A, `(document.getElementById('roomCode').textContent||'').trim()`);
  res.code = code; res.hostGotCode = got;
  if (!got) { res.notes.push('host never produced a 4-char room code'); res.hostState = await evalOn(A, state()); await shot(A, `${label}-host-fail`); return res; }
  await evalOn(B, `setNetMode(${JSON.stringify(netMode)}); netConnect(false, ${JSON.stringify(code)})`);
  const joinedB = await poll(B, `!!(typeof NET !== 'undefined' && NET.open)`, 60000);
  const joinedA = await poll(A, `!!(typeof NET !== 'undefined' && NET.open)`, 20000);
  res.hostOpen = joinedA; res.clientOpen = joinedB;
  res.hostState = await evalOn(A, state()); res.clientState = await evalOn(B, state());
  res.ok = joinedA && joinedB && res.hostState.role === 'host' && res.clientState.role === 'client';
  await shot(A, `${label}-host`); await shot(B, `${label}-client`);
  return res;
}
async function shot(sid, name) {
  try { const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
        writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, 'base64')); } catch {}
}

const results = [];
if (MODE === 'server' || MODE === 'all') {
  console.log('\n--- LAN/server mode: host creates, client joins by code ---');
  try { const r = await hostAndJoin('server', 'server'); results.push(r);
    console.log(`  code=${r.code} hostOpen=${r.hostOpen} clientOpen=${r.clientOpen} roles=${r.hostState?.role}/${r.clientState?.role} bp=${r.hostState?.bp} -> ${r.ok ? 'PASS' : 'FAIL'}`);
    if (r.notes.length) console.log('  notes:', r.notes.join('; '));
  } catch (e) { console.log('  ERROR', e.message); results.push({ label: 'server', ok: false, error: e.message }); }
}
if (MODE === 'p2p' || MODE === 'all') {
  console.log('\n--- WebRTC P2P mode: real PeerJS cloud signalling ---');
  try { const r = await hostAndJoin('p2p', 'p2p'); results.push(r);
    console.log(`  code=${r.code} hostOpen=${r.hostOpen} clientOpen=${r.clientOpen} roles=${r.hostState?.role}/${r.clientState?.role} bp=${r.hostState?.bp} -> ${r.ok ? 'PASS' : 'FAIL'}`);
    if (r.notes.length) console.log('  notes:', r.notes.join('; '));
  } catch (e) { console.log('  ERROR', e.message); results.push({ label: 'p2p', ok: false, error: e.message }); }
}
if (MODE === 'errtest' || MODE === 'all') {
  console.log('\n--- P2P host error-handler test (the sigTimer bug) ---');
  const A = await newTab('p2p');
  const before = tabErrors.get(A) || 0, exBefore = exceptions.length;
  await evalOn(A, `setNetMode('p2p'); netConnect(true)`);
  const got = await poll(A, `(document.getElementById('roomCode').textContent||'').trim().length === 4`, 50000);
  console.log(`  hosted=${got} code=${await evalOn(A, `(document.getElementById('roomCode').textContent||'').trim()`)}`);
  // 1) webrtc error -> should set a status line, not throw
  const pre = await evalOn(A, `document.getElementById('netStatus').textContent`);
  await evalOn(A, `(() => { window.__emitErr = null; try { P2P.peer.emit('error', { type: 'webrtc' }); } catch (e) { window.__emitErr = String(e); } })()`);
  await sleep(500);
  const post = await evalOn(A, `document.getElementById('netStatus').textContent`);
  const exAfterWebrtc = exceptions.length;
  const emitErr = await evalOn(A, `window.__emitErr`);
  console.log(`  webrtc-error: status "${pre}" -> "${post}"  | threw: ${emitErr || 'no'}  | new uncaught exceptions=${exAfterWebrtc - exBefore}`);
  const webrtcHandled = post !== pre && !/给.{0,4}服务器|端口/.test(post);
  // 2) unavailable-id -> should regenerate the room code
  const code1 = await evalOn(A, `(document.getElementById('roomCode').textContent||'').trim()`);
  await evalOn(A, `(() => { window.__emitErr2 = null; try { P2P.opened = false; P2P.tries = 0; P2P.peer.emit('error', { type: 'unavailable-id' }); } catch (e) { window.__emitErr2 = String(e); } })()`);
  const rehosted = await poll(A, `(document.getElementById('roomCode').textContent||'').trim().length === 4 && (document.getElementById('roomCode').textContent||'').trim() !== ${JSON.stringify(code1)}`, 30000);
  const code2 = await evalOn(A, `(document.getElementById('roomCode').textContent||'').trim()`);
  const emitErr2 = await evalOn(A, `window.__emitErr2`);
  console.log(`  unavailable-id: code ${code1} -> ${code2} (retry ${rehosted ? 're-hosted' : 'DID NOT run'}) | threw: ${emitErr2 || 'no'}`);
  console.log(`  total uncaught exceptions in this tab: ${(tabErrors.get(A) || 0) - before}`);
  results.push({ label: 'errtest', hosted: got, webrtcStatusChanged: post !== pre, webrtcHandled, threw: !!(await evalOn(A, `window.__emitErr`)),
                 rehosted, exceptions: (tabErrors.get(A) || 0) - before, code1, code2 });
  await shot(A, 'errtest');
}

console.log('\n=== uncaught exceptions across all tabs ===');
if (!exceptions.length) console.log('  none');
for (const e of exceptions.slice(0, 6)) console.log(`  ${e.text}`);
writeFileSync(`${OUT}/mp-results.json`, JSON.stringify({ results, exceptions }, null, 1));
const pass = results.filter(r => r.ok || (r.label === 'errtest' && r.webrtcHandled && r.rehosted && r.exceptions === 0)).length;
console.log(`\nsummary: ${pass}/${results.length} checks fully passing`);
ws.close(); chrome.kill();
const failed = results.filter(r => !(r.ok || (r.label === 'errtest' && r.webrtcHandled && r.rehosted && !r.threw)));
if (failed.length) { console.log(`FAIL: ${failed.map(f => f.label).join(', ')}`); process.exit(1); }
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
console.log('PASS: multiplayer OK'); process.exit(0);
