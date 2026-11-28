// Mode switch audit: start every local mode, quit from the pause menu and check that nothing
// from the old match leaks into the next screen or the next match.
// Checks, per mode:
//   1. Pause -> Quit lands on the screen the mode belongs to (its hall tab, or the home page).
//   2. No in-match overlay (training bars, frame inspector, trial HUD, spectator HUD, tutorial box,
//      commander panel, replay bar, captions) is still visible after quitting.
//   3. Match-scoped state is cleared: M.mode is back to 'demo', the terrain map and the run's
//      scrolls are gone, so the next mode starts clean.
//   4. In-match overlays that belong to another mode never show (the training frame inspector
//      must stay hidden in the tutorial).
// Usage: node tools/audits/mode-switch-audit.mjs [outdir] [w] [h]
// Exit code 1 when any check fails.
//
// 找 bug 提示：每个模式一行；FAIL 后面写着是哪一步不对（回错了页面、哪个浮层没收、哪个状态没清）。
// 新加一个本机模式：在下面 CASES 里加一行开局表达式和退出后该回到的页面。
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, openSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.RENYING_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium not found - set RENYING_CHROME=/path/to/chrome'); process.exit(1); }
const OUT = process.argv[2] || join(tmpdir(), 'renying-mode-switch');
const VW = +(process.argv[3] || 1440), VH = +(process.argv[4] || 900);
const PORT = +(process.env.RENYING_CDP_PORT || 9397);
const GAME = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/chrome.log`;

// ---------- CDP 小客户端：send 发命令等回包，once 等某个事件一次 ----------
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

// ---------- 启动无头 Chrome 并连上 ----------
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


await load();
await ev(`localStorage.setItem('renying-tut-seen','1'); localStorage.setItem('renying-tut-done','1');
  localStorage.setItem('renying-settings', JSON.stringify({bloom:1,fps:0,shake:1,quality:'auto',blur:true,vig:1,music:0,sfx:0,aim:true}));`);
await load();

// [name, start expression, expected screen after Pause -> Quit, expected hall tab (single only)]
const CASES = [
  ['cpu', `startMatch('cpu', 'normal', [0, 2])`, 'menu'],
  ['train', `startTraining('dummy')`, 'single'],
  ['tag3', `startTag3Match([0, 1, 2], [3, 4, 5], 'normal')`, 'single', 'tag3'],
  ['chaos', `startChaos(0, 2, 'normal')`, 'single', 'chaos'],
  ['mayhem', `startMayhem(0, 2, 'normal')`, 'single', 'mayhem'],
  ['maps', `startMapsMode(0, 2, 'normal', false, Object.keys(MAPS)[1])`, 'menu'],
  ['local2v2', `start2v2LocalCoop(0, 2, 1, 3, 'normal')`, 'netp'],
  ['raid', `startRaidMatch([0, 2, 3], 3)`, 'menu'],
  ['cuju', `startCuju(0, 2, 'normal', {})`, 'single', 'cuju'],
  ['koth', `startKoth(0, 2, 'normal', { four: true })`, 'single', 'koth'],
  ['party', `startParty(0, 2, 'normal', {})`, 'single', 'party'],
  ['bastion', `startBastion(0, 2, 'normal', {})`, 'single', 'bastion'],
  ['melee', `startMelee(5, 0, 'normal')`, 'single', 'melee'],
  ['ctf', `startCtf(4, 0, 'normal')`, 'single', 'ctf'],
  ['gauntlet', `startGauntlet(0, 'normal')`, 'single', 'gauntlet'],
  ['quad', `startQuad(4, 0, 'normal')`, 'single', 'quad'],
  ['tower', `startTower(0)`, 'single'],
  ['stage', `startStage(0, 0)`, 'menu'],
];
const MATCH_OVERLAYS = ['dummyBarBtn', 'dummyBar', 'trainLab', 'trainInspect', 'trialHud', 'specHud', 'tutBox', 'teamCmdPanel', 'rpBar', 'sfxCaption'];
const visibleOverlays = `(() => {
  const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('.hidden,[hidden]'); };
  return ${JSON.stringify(MATCH_OVERLAYS)}.filter(id => vis(document.getElementById(id)));
})()`;
const fails = [];
const check = (name, ok, msg) => { if (!ok) fails.push(`${name}: ${msg}`); };

for (const [name, start, wantScr, wantTab] of CASES) {
  await ev(`toMenu(true)`); await sleep(400);
  await ev(`showScreen(null); ${start}`);
  await sleep(1200);
  // seed leftovers the old code forgot to clear, so the audit also fails if the cleanup regresses
  await ev(`M.towerPerks = (M.towerPerks && M.towerPerks.length) ? M.towerPerks : [Object.keys(SC_BY)[0]]`);
  await ev(`clearAllHumanInputs(); paused = true; showScreen('pause')`); await sleep(200);
  await ev(`document.getElementById('quitBtn').click()`); await sleep(700);
  const s = await ev(`({ scr: currentScreen, tab: currentSingleTab, mode: M.mode, map: M.map, perks: (M.towerPerks || []).length, foe: (M.foeScrolls || []).length, subMode: M.subMode, cujuFour: !!M.cujuFour, kothFour: !!M.kothFour, party: M.party, raidSz: M.raidSquadSize || 0, leaks: ${visibleOverlays} })`);
  check(name, s.scr === wantScr, `quit went to #${s.scr}, expected #${wantScr}`);
  if (wantTab) check(name, s.tab === wantTab, `quit opened the ${s.tab} tab, expected ${wantTab}`);
  check(name, s.mode === 'demo', `M.mode is still ${s.mode}`);
  check(name, !s.map, `terrain map ${s.map} carried over`);
  check(name, !s.perks && !s.foe, `${s.perks + s.foe} scroll(s) carried over`);
  check(name, !s.subMode && !s.cujuFour && !s.kothFour && !s.party && !s.raidSz, `match-scoped flags leaked: subMode=${s.subMode} cuju4=${s.cujuFour} koth4=${s.kothFour} party=${s.party} raid=${s.raidSz}`);
  check(name, !s.leaks.length, `overlays still visible: ${s.leaks.join(', ')}`);
  console.log(`  ${fails.some(f => f.startsWith(name + ':')) ? 'FAIL' : 'ok  '} ${name.padEnd(9)} -> #${s.scr}${s.scr === 'single' ? ' / ' + s.tab : ''}`);
}

// The tutorial borrows the training dummy; training-only tools must not show over it.
await ev(`toMenu(true)`); await sleep(400);
await ev(`showScreen(null); startTutorial()`); await sleep(1200);
const tut = await ev(visibleOverlays);
const tutLeaks = tut.filter(id => id !== 'tutBox');
check('tutorial', !tutLeaks.length, `training tools visible over the tutorial: ${tutLeaks.join(', ')}`);
console.log(`  ${tutLeaks.length ? 'FAIL' : 'ok  '} tutorial  -> overlays [${tut.join(', ')}]`);

// A terrain map picked in one mode must not decide the arena of the next relay / 2v2 match.
await ev(`toMenu(true)`); await sleep(300);
await ev(`showScreen(null); startMapsMode(0, 2, 'normal', false, 'ice')`); await sleep(600);
await ev(`toMenu(true)`); await sleep(300);
await ev(`showScreen(null); start2v2LocalCoop(0, 2, 1, 3, 'normal')`); await sleep(400);
const draws = await ev(`(() => { const s = new Set(); for (let i = 0; i < 40; i++) { toMenu(true); showScreen(null); start2v2LocalCoop(0, 2, 1, 3, 'normal'); s.add(M.map); } return [...s]; })()`);
check('map-carry', draws.length > 1, `2v2 always used ${draws.join(', ')} after a terrain match`);
console.log(`  ${draws.length > 1 ? 'ok  ' : 'FAIL'} map-carry -> 2v2 maps seen [${draws.join(', ')}]`);
await ev(`toMenu(true)`);

console.log(`\n===== Mode switch audit (${VW}x${VH}) =====`);
if (fails.length) { for (const f of fails) console.log('  FAIL ' + f); console.log(`\nFAIL: ${fails.length} problem(s)`); process.exit(1); }
console.log(`PASS: ${CASES.length} modes quit cleanly, tutorial and next-match state are isolated`);
process.exit(0);
