// Mobile / touch audit for RenYing.
// Emulates real touch devices, verifies the game actually switches to its touch path,
// measures the virtual stick + thumb pad (on-screen, hit-target size, overlaps), and
// drives them with synthetic touches to confirm they move and attack.
// Usage: node tools/touch-audit.mjs [outdir]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, openSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.RENYING_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium not found - set RENYING_CHROME=/path/to/chrome'); process.exit(1); }

const OUT = process.argv[2] || join(tmpdir(), 'renying-touch-audit');
const PORT = +(process.env.RENYING_CDP_PORT || 9375);
const GAME = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const MIN_TARGET = 40;          // px; below this a touch target is hard to hit
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
  `--user-data-dir=${OUT}/chrome`, '--window-size=844,390', 'about:blank',
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

const ev = async (expr, awaitPromise = false) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, S);
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const shot = async name => { const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, S);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, 'base64')); };

const results = [];
const problems = [];
const note = m => problems.push(m);

// horizontal overflow / clipping probe for a screen
const PROBE = `(() => {
  const scr = document.querySelector('.scr.on');
  const W = innerWidth, H = innerHeight, out = { vw: W, vh: H, screen: scr ? scr.id : null, offscreen: [], clipped: [], scrollX: [], needsScroll: false };
  const root = scr || document.body;
  out.needsScroll = scr ? scr.scrollHeight > scr.clientHeight + 2 : false;
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    const d = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : '');
    if (r.right > W + 1 || r.left < -1) out.offscreen.push({ el: d, l: Math.round(r.left), r: Math.round(r.right), text: (el.textContent||'').trim().slice(0,20) });
    const overX = el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0;
    if (overX && cs.overflowX === 'hidden') out.clipped.push({ el: d, sw: el.scrollWidth, cw: el.clientWidth });
    else if (overX && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) out.scrollX.push({ el: d, sw: el.scrollWidth, cw: el.clientWidth });
  }
  out.offscreen = out.offscreen.slice(0, 8); out.clipped = out.clipped.slice(0, 8); out.scrollX = out.scrollX.slice(0, 6);
  return out;
})()`;

async function setDevice(w, h, dpr) {
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: w, height: h, deviceScaleFactor: dpr, mobile: true, screenOrientation: { angle: h > w ? 0 : 90, type: h > w ? 'portraitPrimary' : 'landscapePrimary' } }, S);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, S);
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: false }, S);
}
async function load() {
  const l = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: GAME }, S);
  await Promise.race([l, sleep(10000)]);
  await sleep(1700);
}

// ---------------------------------------------------------------- portrait phones
async function portraitCheck(name, w, h, dpr) {
  await setDevice(w, h, dpr);
  await load();
  const r = await ev(`(() => {
    const rt = getComputedStyle(document.getElementById('rotateTip'));
    return { touch: TOUCH, bodyTouch: document.body.classList.contains('touchdev'),
             rotate: rt.display, rotateText: document.getElementById('rotateTip').textContent.trim(),
             touchUI: getComputedStyle(document.getElementById('touchUI')).display };
  })()`);
  await shot(`${name}-portrait`);
  const ok = r.touch && r.rotate === 'flex';
  console.log(`  ${name} portrait ${w}x${h}: TOUCH=${r.touch} body.touchdev=${r.bodyTouch} rotateTip="${r.rotate}" ("${r.rotateText}") -> ${ok ? 'PASS' : 'FAIL'}`);
  if (!r.touch) note(`${name}: game did not switch to its touch path under emulation`);
  if (r.rotate !== 'flex') note(`${name}: rotate tip not shown in portrait`);
  results.push({ name, mode: 'portrait', ok, ...r });
  return r;
}

// ---------------------------------------------------------------- landscape phone
async function landscapeCheck(name, w, h, dpr) {
  await setDevice(w, h, dpr);
  await load();
  const env = await ev(`(() => {
    const rt = getComputedStyle(document.getElementById('rotateTip'));
    const key = document.querySelector('.keyonly'), tch = document.querySelector('.touchonly');
    const mcard = document.querySelector('.mcard .ms');
    return { touch: TOUCH, rotate: rt.display,
      keyonly: key ? getComputedStyle(key).display : null, touchonly: tch ? getComputedStyle(tch).display : null,
      mcH1: getComputedStyle(document.querySelector('.mtitle h1')).fontSize,
      mcSub: mcard ? getComputedStyle(mcard).fontSize : null, vh: innerHeight };
  })()`);
  console.log(`  ${name} landscape ${w}x${h}: TOUCH=${env.touch} rotateTip=${env.rotate} keyonly=${env.keyonly} touchonly=${env.touchonly} title=${env.mcH1} subtitle=${env.mcSub}`);
  if (env.rotate !== 'none') note(`${name}: rotate tip still visible in landscape`);
  if (env.keyonly !== 'none') note(`${name}: keyboard-only help not hidden on touch device`);
  if (env.touchonly !== 'block') note(`${name}: touch-specific help not shown`);

  // panels at phone size
  const panels = ['menu', 'single', 'help', 'codex', 'settings'];
  for (const p of panels) {
    await ev(`(() => { ${p === 'menu' ? 'backToMenu()' : `openScreen('${p}')`} })()`);
    await sleep(700);
    const a = await ev(PROBE);
    await shot(`${name}-${p}`);
    const bad = a.offscreen.length + a.clipped.length;
    console.log(`     panel ${p}: offscreen=${a.offscreen.length} clipped=${a.clipped.length} scrollX=${a.scrollX.length} needsScroll=${a.needsScroll}`);
    for (const o of a.offscreen) note(`${name}/${p}: offscreen ${o.el} "${o.text}" (${o.l}..${o.r} of ${a.vw})`);
    for (const c of a.clipped) note(`${name}/${p}: clipped ${c.el} (${c.sw}>${c.cw})`);
    results.push({ name, mode: 'panel', panel: p, bad, scrolls: a.needsScroll });
  }

  // in-match touch controls
  await ev(`(async () => { startMatch('cpu','normal',[0,2]); showScreen(null); paused=false;
    await new Promise(r=>setTimeout(r,900));
    window.__atk = 0; const o = window.startAttack; window.startAttack = function(...a){ window.__atk++; return o.apply(this, a); };
  })()`, true);
  await sleep(1200);
  await ev(`M.phase='fight'; M.timer=40; A.hp=A.maxHp; B.hp=B.maxHp;`);
  const ui = await ev(`(() => {
    const W = innerWidth, H = innerHeight;
    const els = [...document.querySelectorAll('#touchUI .tbtn, #tStick')];
    const vis = els.filter(e => !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none');
    const items = vis.map(e => { const r = e.getBoundingClientRect();
      return { id: e.id || e.className, a: e.dataset.a || '', w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; });
    const off = items.filter(i => i.l < 0 || i.t < 0 || i.r > W || i.b > H);
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (ox > 2 && oy > 2) overlaps.push(a.id + ' ∩ ' + b.id + ' (' + ox + 'x' + oy + ')');
    }
    return { shown: getComputedStyle(document.getElementById('touchUI')).display, count: items.length, items, off, overlaps,
             minW: Math.min(...items.map(i => i.w)), minH: Math.min(...items.map(i => i.h)), vw: W, vh: H };
  })()`);
  console.log(`  ${name} in-match touch UI: shown=${ui.shown} controls=${ui.count} minSize=${ui.minW}x${ui.minH} offscreen=${ui.off.length} overlaps=${ui.overlaps.length}`);
  if (ui.shown === 'none') note(`${name}: touch controls hidden during a match`);
  for (const o of ui.off) note(`${name}: touch control ${o.id} off-screen (${o.l},${o.t}..${o.r},${o.b} of ${ui.vw}x${ui.vh})`);
  for (const ov of ui.overlaps) note(`${name}: touch controls overlap: ${ov}`);
  const small = ui.items.filter(i => (i.w < MIN_TARGET || i.h < MIN_TARGET));
  for (const s of small) note(`${name}: touch target ${s.id} is ${s.w}x${s.h} (< ${MIN_TARGET}px)`);
  await shot(`${name}-inmatch`);

  // Interaction is measured in training mode: a standing dummy never knocks the player
  // back, so measured movement reflects stick input rather than incoming damage.
  await ev(`(async () => { startMatch('train','stand',[0,2]); showScreen(null); paused=false;
    await new Promise(r=>setTimeout(r,900));
    window.__atk = 0; const o = window.startAttack; window.startAttack = function(...a){ window.__atk++; return o.apply(this, a); };
  })()`, true);
  await sleep(900);
  await ev(`M.phase='fight'; A.hp=A.maxHp; A.state='idle'; A.vx=0;`);
  const items2 = await ev(`[...document.querySelectorAll('#touchUI .tbtn, #tStick')]
    .filter(e => !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none')
    .map(e => { const r = e.getBoundingClientRect();
      return { id: e.id || e.className, a: e.dataset.a || '', w: Math.round(r.width), h: Math.round(r.height),
               l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; })`);

  // drive the stick: drag right, the fighter should move right
  const stick = items2.find(i => i.id === 'tStick');
  if (stick) {
    const cx = (stick.l + stick.r) / 2, cy = (stick.t + stick.b) / 2;
    await ev(`window.__x0 = A.x; window.__face0 = A.face; A.state='idle'; A.vx=0;`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] }, S);
    await sleep(80);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 45, y: cy, id: 1 }] }, S);
    await sleep(420);
    const drag = await ev(`({ dx: Math.round((A.x - window.__x0) * 100) / 100, heldRight: human[0].held.right, aim: human[0].held.aim, vx: Math.round(A.vx) })`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, S);
    const ok = drag.heldRight === true && drag.vx > 0;
    console.log(`  ${name} stick drag right: held.right=${drag.heldRight} aim=${drag.aim} vx=${drag.vx} moved=${drag.dx}px -> ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) note(`${name}: virtual stick drag did not drive the fighter (held.right=${drag.heldRight}, vx=${drag.vx})`);
    results.push({ name, mode: 'stick', ok, ...drag });
    await shot(`${name}-stick-drag`);
  }
  // tap the attack button
  const atk = items2.find(i => i.a === 'atk');
  if (atk) {
    const cx = (atk.l + atk.r) / 2, cy = (atk.t + atk.b) / 2;
    await ev(`window.__atk = 0; A.state='idle';`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 2 }] }, S);
    await sleep(160);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, S);
    await sleep(220);
    const n = await ev(`window.__atk`);
    const ok = n > 0;
    console.log(`  ${name} attack button tap: startAttack calls=${n} -> ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) note(`${name}: tapping the attack button did not start an attack`);
    results.push({ name, mode: 'attack', ok, calls: n });
  }
}

console.log(`\n===== touch / mobile audit (min touch target ${MIN_TARGET}px) =====`);
await portraitCheck('phone', 390, 844, 3);
await portraitCheck('tablet', 768, 1024, 2);
await landscapeCheck('phone', 844, 390, 3);
writeFileSync(`${OUT}/touch-results.json`, JSON.stringify({ results, problems }, null, 1));

console.log('\n===== problems =====');
console.log(problems.length ? problems.map(p => '  ' + p).join('\n') : '  none');
ws.close(); chrome.kill();
if (problems.length) { console.log(`\nFAIL: ${problems.length} issue(s)`); process.exit(1); }
console.log('\nPASS: touch path activates, controls fit and respond, no clipping.');
process.exit(0);
