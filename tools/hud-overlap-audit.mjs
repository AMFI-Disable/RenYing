// HUD overlap / clipping audit for the canvas HUD.
// Canvas text is not in the DOM, so this wraps CanvasRenderingContext2D.fillText/fillRect
// at runtime (no source changes) and records the boxes the HUD actually paints, then
// reports text boxes that overlap each other or run off the canvas.
// Intended for the crowded 2v2 (watch2v2) HUD, works for any mode.
// Usage: node tools/hud-overlap-audit.mjs [outdir] [w] [h] [mode]
//   mode: watch2v2 (default) | cpu | mayhem
// Exit code 1 when an overlap or an off-canvas box is found.
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
const OUT = process.argv[2] || join(tmpdir(), 'renying-hud-overlap');
const VW = +(process.argv[3] || 1440), VH = +(process.argv[4] || 900);
const MODE = process.argv[5] || 'watch2v2';
const PORT = +(process.env.RENYING_CDP_PORT || 9395);
const GAME = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const BAND = 230;              // only inspect the top band, where the HUD lives
const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/chrome.log`;

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.subs = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) for (const cb of (this.subs.get(m.method) || [])) cb(m.params, m.sessionId); }; }
  send(method, params = {}, sid) { const id = ++this.id;
    return new Promise((res, rej) => { this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); }); }
  on(k, cb) { if (!this.subs.has(k)) this.subs.set(k, []); this.subs.get(k).push(cb); }
  once(k) { return new Promise(r => { const f = p => { r(p); this.subs.set(k, this.subs.get(k).filter(x => x !== f)); }; this.on(k, f); }); }
}

const logFd = openSync(LOG, 'w');
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox',
  '--disable-dev-shm-usage', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-timer-throttling', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  `--user-data-dir=${OUT}/chrome`, `--window-size=${VW},${VH}`, 'about:blank'], { stdio: ['ignore', logFd, logFd] });
process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250);
  try { const m = readFileSync(LOG, 'utf8').match(/DevTools listening on (ws:\/\/\S+)/); if (m) wsUrl = m[1]; } catch (e) {} }
if (!wsUrl) { console.error('no DevTools endpoint'); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 10000); });
const cdp = new CDP(ws);
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await cdp.send('Page.enable', {}, S);
await cdp.send('Runtime.enable', {}, S);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false }, S);
const ev = async expr => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, S);
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const load = async () => { const l = cdp.once('Page.loadEventFired'); await cdp.send('Page.navigate', { url: GAME }, S);
  await Promise.race([l, sleep(9000)]); await sleep(1800); };

await load();
await ev(`localStorage.setItem('renying-tut-seen','1'); localStorage.setItem('renying-tut-done','1');
  localStorage.setItem('renying-settings', JSON.stringify({bloom:1,fps:0,shake:1,quality:'auto',blur:true,vig:1,music:0,sfx:0,aim:true}));`);
await load();

// Record what the HUD paints, with the text baseline/align applied so boxes are real.
await ev(`(() => {
  window.__hudBoxes = []; window.__hudSeq = 0;
  const P = CanvasRenderingContext2D.prototype;
  if (P.__patched) return;
  P.__patched = true;
  const ft = P.fillText, fr = P.fillRect;
  P.fillText = function (text, x, y) {
    try {
      const s = String(text);
      if (s.trim()) {
        const m = this.measureText(s);
        const w = m.width || 0;
        const asc = m.actualBoundingBoxAscent || 9, des = m.actualBoundingBoxDescent || 3;
        const h = asc + des;
        const al = this.textAlign, bl = this.textBaseline;
        const lx0 = al === 'center' ? x - w / 2 : (al === 'right' || al === 'end') ? x - w : x;
        const ly0 = bl === 'middle' ? y - h / 2 : bl === 'top' ? y : y - h;
        // map local coordinates through the current transform: announce/world text is drawn
        // under translate+scale, so recording raw x/y reports a bogus off-canvas box
        const tm = this.getTransform ? this.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        const x0 = tm.a * lx0 + tm.c * ly0 + tm.e;
        const y0 = tm.b * lx0 + tm.d * ly0 + tm.f;
        const sw = Math.abs(tm.a) * w + Math.abs(tm.c) * h;
        const sh = Math.abs(tm.b) * w + Math.abs(tm.d) * h;
        if (y0 < ${BAND} && y0 > -40) window.__hudBoxes.push({ t: s, x: Math.round(x0), y: Math.round(y0), w: Math.round(sw), h: Math.round(sh), sc: +(Math.sqrt(Math.abs(tm.a * tm.d - tm.b * tm.c))).toFixed(2), seq: ++window.__hudSeq });
      }
    } catch (e) {}
    return ft.apply(this, arguments);
  };
  P.fillRect = function (x, y, w, h) {
    try {
      const tm = this.getTransform ? this.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      const X = tm.a * x + tm.c * y + tm.e, Y = tm.b * x + tm.d * y + tm.f;
      const Wd = Math.abs(tm.a) * w + Math.abs(tm.c) * h, Hd = Math.abs(tm.b) * w + Math.abs(tm.d) * h;
      if (Y < ${BAND} && Wd > 24 && Wd < 1000 && Hd > 2 && Hd < 60) window.__hudBoxes.push({ t: '', x: Math.round(X), y: Math.round(Y), w: Math.round(Wd), h: Math.round(Hd), rect: 1, sc: +(Math.sqrt(Math.abs(tm.a * tm.d - tm.b * tm.c))).toFixed(2), seq: ++window.__hudSeq });
    } catch (e) {}
    return fr.apply(this, arguments);
  };
})()`);

await ev(MODE === 'watch2v2' ? `startWatch2v2()` : `startMatch('cpu','normal',[0,2])`);
await sleep(2200);                       // let the intro finish and the HUD settle
await ev(`window.__hudBoxes = []`);
await sleep(700);                        // ~1s of frames
const raw = await ev(`window.__hudBoxes.slice()`);

// dedupe identical repeated paints (same glyphs at the same place each frame)
// Keep only the layer the HUD is drawn on: animated announce/world text is painted under a
// non-1 scale and, sampled across frames, shows up as many boxes of the same string at
// slightly different sizes (which would look like dozens of self-overlaps).
const scaleCount = new Map();
for (const b of raw) { const k = b.sc === undefined ? 1 : b.sc; scaleCount.set(k, (scaleCount.get(k) || 0) + 1); }
let modalScale = 1, best = -1;
for (const [k, n] of scaleCount) if (n > best) { best = n; modalScale = k; }
const sameLayer = raw.filter(b => Math.abs((b.sc === undefined ? 1 : b.sc) - modalScale) < 0.05);
const seen = new Map();
for (const b of sameLayer) { const k = `${b.t}|${b.x}|${b.y}|${b.w}|${b.h}`; if (!seen.has(k)) seen.set(k, b); }
// Collapse multi-pass draws of one label (shadow/outline + fill, or the same announce text at
// scale 1.0 on two passes): same string whose centres sit within a few px is one label.
const kept = [];
const cx = b => b.x + b.w / 2, cy = b => b.y + b.h / 2;
for (const b of [...seen.values()]) {
  if (b.t && kept.some(k => k.t === b.t && Math.hypot(cx(k) - cx(b), cy(k) - cy(b)) < 8)) continue;
  kept.push(b);
}
const boxes = kept;
console.log(`  draw scales seen: ${[...scaleCount.entries()].map(([k, n]) => k + 'x' + n).join(', ')} -> using ${modalScale}`);
const texts = boxes.filter(b => b.t);
const area = b => Math.max(1, b.w) * Math.max(1, b.h);
const inter = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
};

const overlaps = [], occluded = [], crowded = [];
for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
  const a = texts[i], b = texts[j];
  if (a.t === b.t && a.x === b.x && a.y === b.y) continue;
  const ov = inter(a, b) / Math.min(area(a), area(b));
  if (ov > 0.15) overlaps.push({ a: a.t, b: b.t, aBox: [a.x, a.y, a.w, a.h], bBox: [b.x, b.y, b.w, b.h], pct: Math.round(ov * 100) });
  // labels sharing horizontal space that almost touch read as one smear
  const xo = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const gap = a.y < b.y ? b.y - (a.y + a.h) : a.y - (b.y + b.h);
  if (xo > Math.min(a.w, b.w) * 0.3 && gap >= -1 && gap < 3) crowded.push({ a: a.t, b: b.t, gap });
}
// a HUD bar painted after a label, covering most of it, hides the label
for (const t of texts) for (const r of boxes) {
  if (!r.rect || r.seq < t.seq) continue;
  const ov = inter(t, r) / area(t);
  if (ov > 0.40) occluded.push({ t: t.t, tBox: [t.x, t.y, t.w, t.h], barBox: [r.x, r.y, r.w, r.h], pct: Math.round(ov * 100) });
}
const offscreen = texts.filter(b => b.x < -2 || b.y < -2 || b.x + b.w > VW + 2 || b.y + b.h > VH + 2);
const bars = boxes.filter(b => b.rect);

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, S);
writeFileSync(`${OUT}/${VW}x${VH}-${MODE}.png`, Buffer.from(shot.data, 'base64'));

console.log(`\n===== HUD overlap audit (${MODE}, ${VW}x${VH}) =====`);
console.log(`  painted boxes in the top ${BAND}px: ${boxes.length} (${texts.length} text, ${bars.length} bars)`);
if (overlaps.length) {
  console.log(`  OVERLAPPING TEXT: ${overlaps.length}`);
  for (const o of overlaps.slice(0, 12)) console.log(`    "${o.a}" ${JSON.stringify(o.aBox)}  x  "${o.b}" ${JSON.stringify(o.bBox)}  (${o.pct}% of the smaller)`);
} else console.log('  overlapping text: none');
if (occluded.length) { console.log(`  LABELS PAINTED OVER BY A HUD BAR: ${occluded.length}`);
  const seeno = new Set();
  for (const o of occluded) { const k = o.t + o.barBox.join(','); if (seeno.has(k)) continue; seeno.add(k);
    console.log(`    "${o.t}" ${JSON.stringify(o.tBox)} hidden ${o.pct}% by bar ${JSON.stringify(o.barBox)}`); }
} else console.log('  labels covered by a bar: none');
if (crowded.length) { console.log(`  note: ${crowded.length} label pair(s) touch with <3px gap`);
  for (const c of crowded.slice(0, 6)) console.log(`    "${c.a}" ~ "${c.b}" (gap ${c.gap}px)`); }
if (offscreen.length) { console.log(`  OFF-CANVAS TEXT: ${offscreen.length}`);
  for (const o of offscreen.slice(0, 8)) console.log(`    "${o.t}" at [${o.x},${o.y}] ${o.w}x${o.h}`); }
else console.log('  off-canvas text: none');
writeFileSync(`${OUT}/${VW}x${VH}-${MODE}.json`, JSON.stringify({ boxes, overlaps, occluded, crowded, offscreen }, null, 1));
if (overlaps.length || occluded.length || offscreen.length) { console.log(`\nFAIL: ${overlaps.length} overlap(s), ${occluded.length} occluded label(s), ${offscreen.length} off-canvas`); process.exit(1); }
console.log(`\nPASS: no overlapping HUD text, nothing off-canvas at ${VW}x${VH}`);
process.exit(0);
