// English coverage audit for RenYing: opens every panel (and its tabs) with the English interface and
// lists any visible text that is still Chinese. Node built-ins only (global fetch + WebSocket), like ui-audit.mjs.
//
// 找 bug 提示：列出来的每一句，先在控制台跑 I18N.t('那句中文')。返回原文就是 src/data/30-ui-copy-*.js
// 缺这一句（带数字的要在 src/i18n.js 的 PATTERNS_EN 加模板）。单个汉字的印章、语言按钮「简体中文」不算。
// 用法：node tools/audits/en-coverage-audit.mjs [输出目录] [宽] [高]   （要先在 8791 端口起本地服务器）
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, openSync, readFileSync as readF, existsSync } from 'node:fs';

const CHROME = process.env.RENYING_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium not found - set RENYING_CHROME=/path/to/chrome'); process.exit(1); }
const URL = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const PORT = +(process.env.CDP_PORT || 9347);
const OUT = process.argv[2] || join(tmpdir(), 'renying-en-coverage');
const VW = +(process.argv[3] || 1440);
const VH = +(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/chrome.log`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// [名字, 打开面板的代码, 面板里要逐个点一遍的标签按钮（可选）]
const PANELS = [
  ['menu', `backToMenu()`],
  ['single', `openScreen('single')`, '#single [data-tab]'],
  ['netp', `openScreen('netp')`],
  ['help', `openScreen('help')`],
  ['codex', `openScreen('codex')`, '#cxTabs button'],
  ['settings', `openScreen('settings')`, '#stTabs button'],
  ['community', `openScreen('community')`],
  ['acc', `showScreen('acc')`],
  ['lb', `openLeaderboard()`],
  ['welfare', `openWelfare()`],
  ['replays', `openScreen('replays')`],
  ['tasks', `openScreen('tasks')`],
  ['armory', `openScreen('armory')`, '#arTabs button'],
  ['bp', `PROF.owned = CHARS.map(c => c.id); bpStart('cpu', { mapBriefed: true }); bpCpuT = 9999; bpApply(3); bpApply(6); bpCpuT = 9999; bpSel = 4; renderBP(); showScreen('bp');`],
  ['bpquick', `bpStart('tag3', { quickRelay: true }); bpApply(bpValidList()[0]); bpApply(bpValidList()[0]); bpSel = bpValidList()[0]; renderBP();`],
  ['endtag3', `M.map = 'ice'; startTag3Match([0,1,2], [3,4,5], 'normal'); M.teamIdx = [3,1]; M.wins = [1,3]; showEnd(1); showScreen('end');`],
  ['pause', `showScreen('pause')`],
  ['tutask', `showScreen('tutask')`],
];

// 还没有英文、先不算的地方（补上以后从这里删掉）：
//   侠客列传的剧情（每位侠客的来由、各节地名和节名、对白），src/data/heroes/*.js 的 saga
const KNOWN = ['.saga-motive', '.saga-nodes b', '#sagaTalk'];

// 页面上看得见、还带汉字的文本（文本节点和 title / placeholder / aria-label）
const PROBE = `(() => {
  const KNOWN = ${JSON.stringify(KNOWN)};
  const CJK = /[\u4e00-\u9fff]/;
  const seen = (el) => { if (!el.checkVisibility || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    for (let o = el, op = 1; o; o = o.parentElement) { op *= +getComputedStyle(o).opacity; if (op < 0.05) return false; }
    const r = el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; };
  const skip = (el, t) => t.length === 1 || t === '简体中文' || !!el.closest('svg, script, style, .no-i18n, ' + KNOWN.join(', '));
  const out = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const t = n.nodeValue.trim(), el = n.parentElement;
    if (!CJK.test(t) || !el || skip(el, t) || !seen(el)) continue;
    out.add(t);
  }
  for (const el of document.querySelectorAll('[title], [placeholder], [aria-label]')) for (const a of ['title', 'placeholder', 'aria-label']) {
    const v = (el.getAttribute(a) || '').trim();
    if (v && CJK.test(v) && !skip(el, v) && seen(el)) out.add('[' + a + '] ' + v);
  }
  return [...out];
})()`;

// ---------- CDP 小客户端：send 发命令等回包，once 等某个事件一次 ----------
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

// ---------- 启动无头 Chrome 并连上 ----------
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
await cdp.send('Runtime.evaluate', { expression: `(() => {
  localStorage.setItem('renying-lang', 'en');
  localStorage.setItem('renying-tut-seen', '1'); localStorage.setItem('renying-tut-done', '1');
  localStorage.setItem('renying-settings', JSON.stringify({ lang: 'en', music: 0, sfx: 0 }));
})()` }, S);
const loaded = cdp.once('Page.loadEventFired');
await cdp.send('Page.reload', {}, S);
await Promise.race([loaded, sleep(12000)]);
await sleep(2800);
const lang = (await cdp.send('Runtime.evaluate', { expression: `I18N.getLang()`, returnByValue: true }, S)).result.value;
if (lang !== 'en') { console.error(`English interface did not come up (lang=${lang})`); chrome.kill(); process.exit(1); }

const ev = async js => (await cdp.send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true }, S)).result.value;
const found = new Map();   // 文本 → 第一次在哪个面板看到
const note = (where, list) => { for (const t of list || []) if (!found.has(t)) found.set(t, where); };
for (const [name, js, tabs] of PANELS) {
  const err = await ev(`(async () => { try { ${js}; return ''; } catch (e) { return String(e && e.message || e); } })()`);
  if (err) { console.log(`${name}: could not open (${err})`); continue; }
  await sleep(700);
  note(name, await ev(PROBE));
  const n = tabs ? await ev(`document.querySelectorAll(${JSON.stringify(tabs)}).length`) : 0;
  for (let i = 0; i < n; i++) {
    await ev(`(() => { const b = document.querySelectorAll(${JSON.stringify(tabs)})[${i}]; if (b) b.click(); })()`);
    await sleep(450);
    note(`${name} tab ${i + 1}`, await ev(PROBE));
  }
}
ws.close(); chrome.kill();
const rows = [...found].map(([t, where]) => ({ where, text: t }));
writeFileSync(`${OUT}/en-coverage-${VW}x${VH}.json`, JSON.stringify(rows, null, 1));
if (rows.length) {
  console.log(`\nFAIL: ${rows.length} visible string(s) still in Chinese with the English interface:`);
  for (const r of rows) console.log(`  [${r.where}] ${r.text.length > 140 ? r.text.slice(0, 140) + '…' : r.text}`);
  process.exit(1);
}
console.log(`\nPASS: ${PANELS.length} panels and their tabs show no Chinese text in English mode.`);
process.exit(0);
