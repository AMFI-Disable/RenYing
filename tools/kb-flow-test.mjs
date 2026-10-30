// Keyboard-only end-to-end flow test for RenYing.
// A fresh player who never touches the mouse: language prompt -> tutorial prompt -> home ->
// single mode -> draft (pick a fighter) -> a real match against the computer -> results -> home.
// Every step is driven by trusted key events through DevTools (arrow keys / Tab to move the
// selection ring, Enter to press, Esc to go back, A/D/X to fight). A pointer listener fails the
// run if any mouse or touch event reaches the page.
// --maps runs the same flow through the Terrain Clash mode instead (special tab -> vote for a map -> start).
// --dummy runs the training dummy instead: train tab -> start -> draft, then Tab opens the dummy action bar, the arrows
// pick an action and Enter takes it, Esc closes the bar and the dummy has to do it; the old digit keys must do nothing.
// Usage: node tools/kb-flow-test.mjs [outdir] [width] [height] [--en] [--maps | --dummy]
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, openSync, existsSync } from 'node:fs';

const CHROME = process.env.RENYING_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium not found - set RENYING_CHROME=/path/to/chrome'); process.exit(1); }

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const EN = process.argv.includes('--en');
const MAPS_FLOW = process.argv.includes('--maps');
const DUMMY_FLOW = process.argv.includes('--dummy');
const OUT = args[0] || join(tmpdir(), 'renying-kb-flow');
const VW = +(args[1] || 1440), VH = +(args[2] || 900);
const PORT = +(process.env.RENYING_CDP_PORT || 9385);
const GAME = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const MATCH_LIMIT = +(process.env.RENYING_KB_MATCH_S || 300);   // a full best-of-three can run 3 x (50 s + overtime)
mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/chrome.log`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.subs = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) for (const cb of (this.subs.get(m.method) || [])) cb(m.params, m.sessionId); }; }
  send(method, params = {}, sid) { const id = ++this.id;
    return new Promise((res, rej) => { this.pend.set(id, { res, rej });
      this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); }); }
  on(k, cb) { if (!this.subs.has(k)) this.subs.set(k, []); this.subs.get(k).push(cb); }
  once(k) { return new Promise(r => { const f = p => { r(p); this.subs.set(k, this.subs.get(k).filter(x => x !== f)); }; this.on(k, f); }); }
}

const logFd = openSync(LOG, 'w');
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${OUT}/chrome`, `--window-size=${VW},${VH}`, 'about:blank',
], { stdio: ['ignore', logFd, logFd] });
process.on('exit', () => { try { chrome.kill(); } catch (e) {} });

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250);
  try { const m = readFileSync(LOG, 'utf8').match(/DevTools listening on (ws:\/\/\S+)/); if (m) wsUrl = m[1]; } catch {} }
if (!wsUrl) { console.error('no DevTools endpoint'); chrome.kill(); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 10000); });
const cdp = new CDP(ws);

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await cdp.send('Page.enable', {}, S);
await cdp.send('Runtime.enable', {}, S);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false }, S);
const errors = [];
cdp.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));

const ev = async (expr, awaitPromise = false) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, S);
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
async function nav(url) { const l = cdp.once('Page.loadEventFired'); await cdp.send('Page.navigate', { url }, S); await Promise.race([l, sleep(10000)]); }
const shot = async name => { const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, S);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, 'base64')); };

// ---- trusted key events ----
const KEYDEF = {
  ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
  Enter: ['Enter', 13, '\r'], Escape: ['Escape', 27], Tab: ['Tab', 9],
  KeyA: ['a', 65, 'a'], KeyD: ['d', 68, 'd'], KeyW: ['w', 87, 'w'], KeyX: ['x', 88, 'x'], KeyQ: ['q', 81, 'q'], KeyE: ['e', 69, 'e'], Digit1: ['1', 49, '1'], Digit2: ['2', 50, '2'],
};
async function keyDown(code) {
  const [key, vk, text] = KEYDEF[code];
  await cdp.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(text ? { text, unmodifiedText: text } : {}) }, S);
}
async function keyUp(code) {
  const [key, vk] = KEYDEF[code];
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, S);
}
async function press(code, hold = 30) { await keyDown(code); await sleep(hold); await keyUp(code); await sleep(70); }

// ---- checks ----
const steps = [];
let failed = false;
function ok(name, pass, detail = '') {
  steps.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) failed = true;
  return pass;
}
async function finish() {
  const pointer = await ev('window.__ptr || []').catch(() => []);
  ok('no mouse or touch event reached the page', pointer.length === 0, pointer.slice(0, 5).join(', '));
  ok('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  writeFileSync(`${OUT}/kb-flow.json`, JSON.stringify({ viewport: [VW, VH], lang: EN ? 'en' : 'zh', steps, errors }, null, 2));
  console.log(`\n${failed ? 'FAILED' : 'OK'}: ${steps.filter(s => s.pass).length}/${steps.length} checks  (${OUT}/kb-flow.json)`);
  chrome.kill(); process.exit(failed ? 1 : 0);
}
async function fatal(name, detail) { ok(name, false, detail); await shot('fail-' + name.replace(/\W+/g, '-')).catch(() => {}); await finish(); }

const screenOn = () => ev(`(() => { const s = [...document.querySelectorAll('.scr.on')].pop(); return s ? s.id : null; })()`);
async function waitScreen(want, ms = 8000) {
  const t0 = Date.now(); let cur;
  while (Date.now() - t0 < ms) { cur = await screenOn(); if (want.includes(cur)) return cur; await sleep(100); }
  return cur;
}
// Walk the selection ring to `sel` with arrow keys only (Tab as a fallback when the arrows stall), then press Enter.
const RECTS = `(sel) => {
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
  const t = document.querySelector(sel), a = document.activeElement;
  return { t: t ? box(t) : null, a: a && a !== document.body ? box(a) : null, hit: !!t && a === t, ring: document.getElementById('kbRing').classList.contains('on'),
    disabled: !!(t && t.disabled), label: a && a !== document.body ? (a.id || a.className || a.tagName) : '' };
}`;
// `sel` may be a list: the first one that is actually shown wins (narrow layouts hide some home entries)
async function shownSel(sel) {
  for (const q of [].concat(sel)) if (await ev(`(() => { const e = document.querySelector(${JSON.stringify(q)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && !e.closest('[hidden], .hidden'); })()`)) return q;
  return [].concat(sel)[0];
}
async function reach(sel, maxSteps = 60) {
  sel = await shownSel(sel);
  let last = null, stall = 0;
  for (let i = 0; i < maxSteps; i++) {
    const s = await ev(`(${RECTS})(${JSON.stringify(sel)})`);
    if (!s.t) return { ok: false, why: `${sel} not on the page` };
    if (s.hit) return { ok: true, ring: s.ring, keys: i };
    let code;
    if (!s.a || stall >= 2) code = 'Tab';
    else {
      const dx = s.t.x - s.a.x, dy = s.t.y - s.a.y;
      const vert = Math.abs(dy) > Math.max(s.a.h, s.t.h) / 2;
      code = vert ? (dy > 0 ? 'ArrowDown' : 'ArrowUp') : (dx > 0 ? 'ArrowRight' : 'ArrowLeft');
    }
    const key = JSON.stringify([s.a, code]);
    stall = key === last ? stall + 1 : 0; last = key;
    await press(code);
  }
  return { ok: false, why: `ring never reached ${sel} in ${maxSteps} keys` };
}
async function activate(name, sel, next, ms = 8000) {
  const r = await reach(sel);
  if (!r.ok) return fatal(name, r.why);
  await press('Enter');
  const got = next ? await waitScreen([].concat(next), ms) : null;
  if (next && ![].concat(next).includes(got)) return fatal(name, `Enter on ${sel}: expected screen ${next}, got ${got}`);
  ok(name, true, `${r.keys} keys${r.ring ? ', ring shown' : ''}`);
}

const CJK = /[\u4e00-\u9fff]/;
const SINGLE = ['#mSingle', '#topNav [data-nav="single"]'];   // home entry, or the top bar on short screens

// ---- fresh player ----
await nav(GAME);
await ev(`localStorage.clear(); localStorage.setItem('renying-settings', JSON.stringify({bloom:0,fps:0,shake:0,quality:'low',blur:false,vig:0,music:0,sfx:0,aim:true}));`);
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__ptr = [];
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'wheel', 'contextmenu'])
    addEventListener(t, e => { if (e.isTrusted) window.__ptr.push(t); }, true);
  addEventListener('click', e => { if (e.isTrusted && e.detail > 0) window.__ptr.push('click'); }, true);` }, S);
await nav(GAME);
await sleep(1600);

// 1. first-run prompts
let scr = await waitScreen(['langPrompt', 'tutask', 'menu'], 6000);
if (scr === 'langPrompt') await activate('language prompt', EN ? '#lpPickEn' : '#lpPickZh', ['tutask', 'menu']);
scr = await waitScreen(['tutask', 'menu'], 3000);
if (scr === 'tutask') await activate('skip tutorial prompt', '#tutNo', 'menu');
ok('home screen', (await screenOn()) === 'menu');
await shot('01-home');

// 2. Esc from a sub page returns home, then into single mode for real
await activate('open single mode', SINGLE, 'single');
await press('Escape');
ok('Esc returns home', (await waitScreen(['menu'], 3000)) === 'menu');
await activate('reopen single mode', SINGLE, 'single');
if (MAPS_FLOW) {
  await activate('special modes tab', '#singleCatTabs [data-cat="special"]');
  await activate('terrain clash tab', '#singleTabs [data-tab="maps"]');
  ok('terrain clash pane shown', await ev(`!!document.querySelector('[data-sec="maps"]') && document.querySelector('[data-sec="maps"]').style.display !== 'none'`));
  if (await ev(`!!document.querySelector('#mapVote .map-card.sel')`)) await activate('take back an old vote', '#mapVote .map-card.sel');
  await activate('vote for Frozen Pond', '#mapVote [data-map="ice"]');
  ok('vote counted', await ev(`mapVote === 'ice' && !!document.querySelector('#mapVote [data-map="ice"].sel')`), await ev(`document.querySelector('#mapVote [data-map="ice"] .map-v').textContent`));
  await activate('choose easy', '#mapsLevels [data-lv="easy"]');
  await shot('02-maps');
  await activate('start terrain clash', '#mapsStartBtn', 'bp');
} else if (DUMMY_FLOW) {
  await activate('training tab', '#singleTabs [data-tab="train"]');
  await activate('training dummy', '#trainModeSeg [data-tmode="dummy"]');
  await shot('02-train');
  await activate('start the training dummy', '#trainBtn', 'bp');
} else {
  await activate('choose easy', '#levels [data-lv="easy"]');
  ok('easy selected', await ev(`!!document.querySelector('#levels [data-lv="easy"].sel')`));
  await shot('02-single');
  await activate('start against the computer', '#goBtn', 'bp');
}

// 3. draft: walk the grid, pick a fighter, confirm (bans and picks alike)
await sleep(500);
// the Terrain Clash draft names the map and marks its home-ground heroes; every other draft hides that line
const banner = await ev(`(() => { const b = $id('bpMap'); return { on: !!b && !b.classList.contains('hidden') && b.offsetHeight > 0, t: b ? b.textContent : '', fav: document.querySelectorAll('#bpGrid .bpcard.fav').length, want: BP && MAPS[BP.mapId] ? Object.keys(MAPS[BP.mapId].fav || {}).length : -1, map: BP && BP.mapId }; })()`);
if (MAPS_FLOW) {
  ok('draft banner shows the voted map', banner.on && banner.map === 'ice' && banner.fav === banner.want, JSON.stringify(banner));
  if (EN) ok('draft banner in English', !CJK.test(banner.t), banner.t);
} else ok('no map banner outside Terrain Clash', !banner.on && banner.fav === 0, JSON.stringify(banner));
let picks = 0;
for (let round = 0; round < 8; round++) {
  if ((await screenOn()) !== 'bp') break;
  const st = await ev(`({ my: !!BP && BP.step < bpSteps().length && bpSteps()[BP.step][0] === bpMySide(), go: !$id('bpGo').disabled, step: $id('bpStep').textContent })`);
  if (!st.my) { await sleep(400); continue; }
  const card = await ev(`(() => { const cs = [...document.querySelectorAll('#bpGrid .bpcard:not([aria-disabled])')]; const c = cs[(${picks} * 5 + 2) % Math.max(1, cs.length)]; if (!c) return null; c.setAttribute('data-kbtest', '1'); return '[data-kbtest="1"]'; })()`);
  if (!card) await fatal('draft card', 'no selectable card');
  const r = await reach(card);
  await ev(`document.querySelectorAll('[data-kbtest]').forEach(e => e.removeAttribute('data-kbtest'))`);
  if (!r.ok) await fatal('draft card', r.why);
  await press('Enter');
  await sleep(250);
  if (await ev(`$id('bpGo').disabled`)) await fatal('draft card', `Enter on a card did not enable confirm (step: ${st.step})`);
  if (EN && picks === 0) { const t = await ev(`$id('bpGo').textContent`); ok('draft confirm button in English', !CJK.test(t), t); }
  if (picks === 0) await shot('03-draft');
  await activate(`draft pick ${++picks}`, '#bpGo');
  await sleep(700);
}
const inMatch = await waitScreen([null], 15000);
if (inMatch !== null) await fatal('match starts', `still on screen ${inMatch}`);
ok('draft finished', picks > 0, `${picks} picks`);
ok('match starts', await ev(`typeof M !== 'undefined' && !!A && !!B`), await ev(`M.mode`));
if (MAPS_FLOW) ok('match is on the voted map', await ev(`M.mode === 'maps' && M.map === 'ice' && !!mapNow()`), await ev(`M.mode + ' ' + M.map`));
ok('selection ring hidden in the match', await ev(`!document.getElementById('kbRing').classList.contains('on')`));
if (DUMMY_FLOW) await dummyFlow();

// --dummy: the action bar, driven by keys only
async function dummyFlow() {
  ok('training dummy match', await ev(`M.mode === 'train' && B.ctrl instanceof DummyCtrl`), await ev(`M.mode`));
  for (let i = 0; i < 40 && (await ev(`M.phase`)) !== 'fight'; i++) await sleep(150);
  const cfg0 = await ev(`JSON.stringify(dummyCfg)`);
  await press('Digit1'); await press('Digit2'); await sleep(200);
  ok('digit keys no longer change the dummy', (await ev(`JSON.stringify(dummyCfg)`)) === cfg0 && !(await ev(`dummyBarOn()`)), await ev(`JSON.stringify(dummyCfg)`));
  const key = await ev(`dummyBarKey()`);
  await press(key); await sleep(250);
  ok(`${key} opens the action bar and pauses`, await ev(`dummyBarOn() && paused && !$id('dummyBar').classList.contains('hidden') && !document.querySelector('.scr.on')`));
  ok('selected action has focus', await ev(`document.activeElement && document.activeElement.matches('#dummyActs button.sel')`), await ev(`document.activeElement ? document.activeElement.textContent : ''`));
  await activate('pick combo', '#dummyActs [data-act="combo"]');
  ok('combo picked', await ev(`dummyCfg.act === 'combo' && B.ctrl.cfg.act === 'combo' && !!document.querySelector('#dummyActs [data-act="combo"].sel')`), await ev(`dummyCfg.act`));
  await activate('pick once', '#dummyRep [data-rep="0"]');
  ok('once picked', await ev(`dummyCfg.rep === false && B.ctrl.cfg.rep === false`));
  await activate('pick a 2 s interval', '#dummyGap [data-gap="2"]');
  ok('interval picked', await ev(`dummyCfg.gap === 2 && B.ctrl.cfg.gap === 2`));
  await shot('04-dummy-bar');
  if (EN) {
    const left = await ev(`(() => { const out = [], w = document.createTreeWalker($id('dummyBar'), NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (t && /[\u4e00-\u9fff]/.test(t)) out.push(t); } return out; })()`);
    ok('action bar in English', left.length === 0, left.slice(0, 4).join(' | '));
  }
  await press('Escape'); await sleep(250);
  ok('Esc closes the bar and the fight goes on', await ev(`!dummyBarOn() && !paused && $id('dummyBar').classList.contains('hidden') && !document.querySelector('.scr.on')`), await ev(`([...document.querySelectorAll('.scr.on')].pop() || {}).id || ''`));
  await ev(`(() => { window.__dst = new Set(); const f = () => { window.__dst.add(B.state); if (window.__dst) requestAnimationFrame(f); }; f(); })()`);
  await sleep(4000);
  const seen = await ev(`[...window.__dst]`);
  ok('dummy does the combo', seen.includes('attack') || seen.includes('skill'), seen.join(','));
  ok('once means it stops afterwards', await ev(`B.ctrl.done === true`));
  // and choose again with the bar button's own key once more: block, which holds
  await press(key); await sleep(250);
  await activate('pick block', '#dummyActs [data-act="block"]');
  ok('interval is off for a held action', await ev(`[...document.querySelectorAll('#dummyGap button')].every(b => b.disabled)`));
  await press('Escape'); await sleep(600);
  ok('dummy holds its guard', await ev(`B.ctrl.held.down === true`));
  const hud = await ev(`$id('dummyBarBtn').textContent`);
  if (EN) ok('action button in English', !CJK.test(hud), hud);
  await finish();
}

// 4. fight with the 1P keyboard keys only: walk at the opponent, attack, jump now and then
const t0 = Date.now(); let held = null, hits = 0, shotMid = false;
while (Date.now() - t0 < MATCH_LIMIT * 1000) {
  const g = await ev(`({ scr: ([...document.querySelectorAll('.scr.on')].pop() || {}).id || null, phase: M.phase, ax: A.x, bx: B.x, bhp: B.hp, round: M.round, wins: M.wins.slice() })`);
  if (g.scr === 'end') break;
  if (g.scr === 'pause') { await fatal('match', 'game paused itself'); }
  if (g.phase === 'fight') {
    const want = Math.abs(g.bx - g.ax) > 70 ? (g.bx > g.ax ? 'KeyD' : 'KeyA') : null;
    if (want !== held) { if (held) await keyUp(held); if (want) await keyDown(want); held = want; }
    await press('KeyX', 40); hits++;
    if (hits % 9 === 0) await press('KeyW', 40);
    if (hits % 13 === 0) await press('KeyQ', 40);
    if (!shotMid && hits > 20) { await shot('04-match'); shotMid = true; }
  } else { if (held) { await keyUp(held); held = null; } await sleep(150); }
}
if (held) await keyUp(held);
if ((await waitScreen(['end'], 15000)) !== 'end') await fatal('results screen', `no results after ${MATCH_LIMIT}s`);
const res = await ev(`({ title: $id('endTitle') ? $id('endTitle').textContent : '', sub: $id('endSub') ? $id('endSub').textContent : '', wins: M.wins.slice() })`);
ok('results screen', true, `${res.title} ${res.wins.join(':')} after ${Math.round((Date.now() - t0) / 1000)}s`);
await sleep(900);
await shot('05-results');
if (EN) {   // 结算页上看得见的字（印章图标里的单字除外）都该是英文
  const left = await ev(`(() => { const out = [], w = document.createTreeWalker($id('end'), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (t && /[\u4e00-\u9fff]/.test(t) && n.parentElement.offsetParent !== null && !n.parentElement.closest('.sic')) out.push(t); }
    return out; })()`);
  ok('results screen in English', left.length === 0, left.slice(0, 4).join(' | '));
}

// 5. back home from the results screen
await activate('back to home', '#menuBtn', 'menu');
await sleep(400);
ok('home buttons reachable again', (await reach(SINGLE)).ok);
await shot('06-home-again');
await finish();
