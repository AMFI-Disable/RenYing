// Canvas HUD audit for RenYing.
// Instruments CanvasRenderingContext2D.fillText, drives a real match through many
// states, and reports every label the HUD draws with its font size and position.
// Flags text under the legibility floor. Off-canvas positions are reported as a NOTE only:
// world-space text (floating combat numbers, monster names) is drawn under the camera
// transform, so its recorded x/y are world coordinates, not screen coordinates.
// Usage: node tools/hud-audit.mjs [outdir] [width] [height]
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

const OUT = process.argv[2] || join(tmpdir(), 'renying-hud-audit');
const VW = +(process.argv[3] || 1440), VH = +(process.argv[4] || 900);
const PORT = +(process.env.RENYING_CDP_PORT || 9365);
const GAME = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const FLOOR = +(process.env.RENYING_TEXT_FLOOR || 12);
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

const ev = async (expr, awaitPromise = false) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, S);
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
async function nav(url) { const l = cdp.once('Page.loadEventFired'); await cdp.send('Page.navigate', { url }, S); await Promise.race([l, sleep(10000)]); }

await nav(GAME);
await ev(`localStorage.setItem('renying-tut-seen','1'); localStorage.setItem('renying-tut-done','1');
  localStorage.setItem('renying-settings', JSON.stringify({bloom:0,fps:0,shake:0,quality:'low',blur:false,vig:0,music:0,sfx:0,aim:true}));`);
await nav(GAME);
await sleep(2200);

// record every fillText on the main canvas
await ev(`(() => {
  window.__texts = [];
  const proto = CanvasRenderingContext2D.prototype, orig = proto.fillText;
  if (!proto.__patched) {
    proto.fillText = function (t, x, y, ...rest) {
      try {
        const size = parseFloat((this.font.match(/([0-9.]+)px/) || [0, 0])[1]) || 0;
        window.__texts.push({ t: String(t).slice(0, 28), size: Math.round(size * 10) / 10, x: Math.round(x), y: Math.round(y),
          canvas: this.canvas && this.canvas.id || '(offscreen)', w: Math.round(this.measureText(String(t)).width) });
      } catch (e) {}
      return orig.call(this, t, x, y, ...rest);
    };
    proto.__patched = true;
  }
})()`);

const STATES = {
  match: [
    ['fighting', `M.phase='fight'; M.ot=false; M.timer=42; A.hp=A.maxHp; B.hp=B.maxHp; A.meter=0; B.meter=0; comboUI[0].t=0; comboUI[1].t=0; A.guard=A.maxGuard||100; B.guard=B.maxGuard||100;`],
    ['low-health', `A.hp=A.maxHp*0.12; B.hp=B.maxHp*0.42;`],
    ['guard-low', `A.guard=(A.maxGuard||100)*0.14; B.guard=(B.maxGuard||100)*0.58;`],
    ['guard-break', `A.guard=0;`],
    ['meter-full', `A.meter=100; B.meter=100;`],
    ['combo', `comboUI[0]={n:7,dmg:126,t:1.3}; comboUI[1]={n:3,dmg:44,t:1.3}; B.hp=B.maxHp*0.5;`],
    ['overtime', `M.ot=true; M.timer=8.4;`],
    ['ko', `B.hp=0; M.phase='ko'; M.koWinner=0; M.t=0.1; say('斩',1.6,'ko');`],
  ],
  train: [['training-hud', `M.phase='fight'; comboUI[0]={n:4,dmg:52,t:1.2};`]],
  forest: [['campaign-hud', ``]],
};

const report = [];
async function scene(name, setup, states) {
  await ev(`(async () => { ${setup} })()`, true);
  await sleep(1600);
  for (const [label, js] of states) {
    if (js) await ev(`(() => { ${js} })()`);
    await sleep(420);
    await ev(`window.__texts = []`);
    await sleep(260);                       // let a few frames record
    const texts = await ev(`window.__texts.slice(0, 400)`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, S);
    writeFileSync(`${OUT}/${VW}x${VH}-${name}-${label}.png`, Buffer.from(shot.data, 'base64'));
    const main = texts.filter(t => t.canvas === 'c');
    const small = main.filter(t => t.size > 0 && t.size < FLOOR);
    const off = main.filter(t => t.x < -2 || t.x > VW + 2 || t.y < -2 || t.y > VH + 2);
    const uniq = [...new Map(small.map(t => [t.t + '|' + t.size, t])).values()];
    report.push({ scene: name, state: label, labels: main.length, small: uniq, offscreen: off.slice(0, 5) });
    const distinct = [...new Map(main.map(t => [t.t.replace(/[0-9]+$/, '#') + '|' + t.size, t])).values()];
    if (process.env.RENYING_DUMP) {
      console.log(`  ${name}/${label}: ${main.length} labels; distinct: ` +
        distinct.slice(0, 26).map(u => `${u.t.replace(/[0-9]+$/, '#')}@${u.size}`).join(' · '));
    } else {
      const worst = uniq.length ? `  <-- ${uniq.map(u => `${u.t}@${u.size}px`).slice(0, 4).join(', ')}` : '';
      console.log(`  ${name}/${label}: ${main.length} labels drawn${worst}`);
    }
  }
}

console.log(`\n===== canvas HUD audit @ ${VW}x${VH} (legibility floor ${FLOOR}px) =====`);
await scene('match', `startMatch('cpu','normal',[0,2]); showScreen(null); paused=false; await new Promise(r=>setTimeout(r,900));`, STATES.match);
await scene('train', `startMatch('train','stand',[0,2]); showScreen(null); paused=false; await new Promise(r=>setTimeout(r,900));`, STATES.train);
await scene('forest', `startStage(0,0); showScreen(null); paused=false; await new Promise(r=>setTimeout(r,900));`, STATES.forest);

let bad = 0;
console.log('\n===== labels below the legibility floor =====');
for (const r of report) for (const u of r.small) { bad++; console.log(`  ${r.scene}/${r.state}: "${u.t}" ${u.size}px at (${u.x},${u.y})`); }
if (!bad) console.log('  none');
const offs = report.flatMap(r => r.offscreen.map(o => `${r.scene}/${r.state}: "${o.t}" at (${o.x},${o.y})`));
console.log('\n===== note: text at off-screen coordinates (world-space text, informational) =====');
console.log(offs.length ? `  ${offs.length} items, e.g. ` + offs.slice(0, 3).map(o => o.trim()).join(' | ') : '  none');
writeFileSync(`${OUT}/hud-audit-${VW}x${VH}.json`, JSON.stringify(report, null, 1));

ws.close(); chrome.kill();
if (bad) { console.log(`\nFAIL: ${bad} HUD label(s) under ${FLOOR}px`); process.exit(1); }
console.log(`\nPASS: no canvas text under ${FLOOR}px.`);
process.exit(0);
