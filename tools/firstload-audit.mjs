// 首屏加载检查：每次用全新的浏览器资料夹（没有任何缓存）打开网页，记下首屏的网络请求和绘制时间。
//   node tools/firstload-audit.mjs [outdir] [runs]
//   RENYING_URL=…     换网址（默认 http://127.0.0.1:8791/，先在仓库根目录 python3 -m http.server 8791）
//   RENYING_CHROME=…  指定浏览器；RENYING_PROXY=http://host:port  浏览器走代理（沙盒里连 Google Fonts 用）
//   RENYING_BLOCK_FONTS=1  拦掉 Google Fonts，看连不上字体时首屏是什么样（只用后备字体）
//   RENYING_LANG=en  当作以前选过英文的玩家打开（先在本地存好语言设置）
// 报告：
//   FCP、LCP、CLS（布局跳动）、主菜单标题文字第一次画出来的时间、最后一个字体文件下载完的时间；
//   字体请求数和传输大小（字体 CSS、字体文件分开算）、失败的请求；
//   首屏有没有不该有的请求：音乐（.mp3）、青锋行、three.js、PeerJS；
//   每个已加载字体的 font-display：block / auto 会让文字先隐身（FOIT），swap / fallback / optional 不会。
// 只用 Node 自带的东西，和 ui-audit / perf-audit 一样直接连 Chrome 的调试接口。
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, openSync, existsSync, rmSync } from 'node:fs';

const CHROME = process.env.RENYING_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium not found - set RENYING_CHROME=/path/to/chrome'); process.exit(1); }
const URL = process.env.RENYING_URL || 'http://127.0.0.1:8791/';
const PORT = +(process.env.CDP_PORT || 9349);
const OUT = process.argv[2] || join(tmpdir(), 'renying-firstload-audit');
const RUNS = +(process.argv[3] || 3);
const SETTLE_MS = 6000;   // 打开后再等这么久：字体、图片都该到了
const VW = 1440, VH = 900;
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const kb = b => Math.round(b / 102.4) / 10;

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.subs = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) for (const f of this.subs.get(m.method) || []) f(m.params); }; }
  send(method, params = {}, sid) { const id = ++this.id;
    return new Promise((res, rej) => { this.pend.set(id, { res, rej });
      this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); }); }
  on(method, f) { if (!this.subs.has(method)) this.subs.set(method, []); this.subs.get(method).push(f); }
}

// 在网页任何脚本之前装上：记 LCP、CLS，以及主菜单标题（h1）第一次有字画出来的时间
const PROBE = `(() => {
  window.__fl = { lcp: 0, cls: 0, titleAt: null, shifts: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__fl.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__fl.cls += e.value;
    window.__fl.shifts.push({ t: Math.round(e.startTime), v: Math.round(e.value * 10000) / 10000, nodes: (e.sources || []).map(s => s.node ? (s.node.id ? '#' + s.node.id : (s.node.className && typeof s.node.className === 'string' ? '.' + s.node.className.trim().split(/\\s+/)[0] : s.node.nodeName)) : '?').slice(0, 4) }); } }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  const tick = () => {
    const h = document.querySelector('#menu h1');
    if (h) { const r = h.getBoundingClientRect(), cs = getComputedStyle(h);
      if (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (h.textContent || '').trim()) { window.__fl.titleAt = performance.now(); return; } }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

async function oneRun(i) {
  const dir = `${OUT}/chrome-${i}`;
  rmSync(dir, { recursive: true, force: true });
  const LOG = `${OUT}/chrome-${i}.log`;
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${dir}`, `--window-size=${VW},${VH}`, 'about:blank'];
  if (process.env.RENYING_PROXY) args.push(`--proxy-server=${process.env.RENYING_PROXY}`);
  const chrome = spawn(CHROME, args, { stdio: ['ignore', openSync(LOG, 'w'), openSync(LOG, 'a')] });
  try {
    let wsUrl = null;
    for (let k = 0; k < 80 && !wsUrl; k++) { await sleep(250);
      try { const m = readFileSync(LOG, 'utf8').match(/DevTools listening on (ws:\/\/\S+)/); if (m) wsUrl = m[1]; } catch {} }
    if (!wsUrl) throw new Error('Chrome never reported a DevTools endpoint');
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws open timeout')), 10000); });
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const reqs = new Map();
    cdp.on('Network.requestWillBeSent', p => { if (!reqs.has(p.requestId)) reqs.set(p.requestId, { url: p.request.url, type: p.type, t0: p.timestamp }); });
    cdp.on('Network.responseReceived', p => { const r = reqs.get(p.requestId); if (r) { r.status = p.response.status; r.type = p.type; r.cache = p.response.headers['cache-control'] || p.response.headers['Cache-Control'] || ''; } });
    cdp.on('Network.loadingFinished', p => { const r = reqs.get(p.requestId); if (r) { r.bytes = p.encodedDataLength; r.t1 = p.timestamp; } });
    cdp.on('Network.loadingFailed', p => { const r = reqs.get(p.requestId); if (r) { r.failed = p.errorText; r.t1 = p.timestamp; } });
    await cdp.send('Network.enable', {}, S);
    if (process.env.RENYING_BLOCK_FONTS) await cdp.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] }, S);
    await cdp.send('Page.enable', {}, S);
    await cdp.send('Runtime.enable', {}, S);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false }, S);
    if (process.env.RENYING_LANG === 'en') await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (location.protocol.startsWith('http')) { localStorage.setItem('renying-lang', 'en'); localStorage.setItem('renying-lang-chosen', '1'); localStorage.setItem('renying-settings', JSON.stringify({ lang: 'en' })); } } catch (e) {}` }, S);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE }, S);
    await cdp.send('Page.navigate', { url: URL }, S);
    await sleep(SETTLE_MS);
    const ev = async expr => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const page = await ev(`(async () => {
      const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime ?? null;
      const n = performance.getEntriesByType('navigation')[0];
      const faces = [...document.fonts].map(f => ({ family: f.family.replace(/"/g, ''), weight: f.weight, style: f.style, display: f.display, status: f.status }));
      const fam = {};
      for (const f of faces) { const k = f.family + ' ' + f.weight; fam[k] = fam[k] || { faces: 0, loaded: 0, display: new Set() }; fam[k].faces++; if (f.status === 'loaded') fam[k].loaded++; fam[k].display.add(f.display); }
      for (const k in fam) fam[k].display = [...fam[k].display].join('/');
      return { fcp, lcp: window.__fl.lcp, cls: Math.round(window.__fl.cls * 10000) / 10000, shifts: window.__fl.shifts, titleAt: window.__fl.titleAt,
        dcl: n ? n.domContentLoadedEventEnd : null, load: n ? n.loadEventEnd : null,
        faces: faces.length, facesLoaded: faces.filter(f => f.status === 'loaded').length,
        blocking: faces.filter(f => f.status !== 'unloaded' && (f.display === 'block' || f.display === 'auto')).map(f => f.family + ' ' + f.weight),
        families: fam };
    })()`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, S);
    writeFileSync(`${OUT}/run-${i}.png`, Buffer.from(shot.data, 'base64'));
    ws.close();
    const list = [...reqs.values()].filter(r => !r.url.startsWith('data:'));
    const isFontCss = r => /fonts\.googleapis\.com\/css/.test(r.url) || (r.type === 'Stylesheet' && /font/i.test(r.url));
    const isFont = r => r.type === 'Font' || /\.(woff2?|ttf|otf)(\?|$)/.test(r.url);
    const sum = a => a.reduce((s, r) => s + (r.bytes || 0), 0);
    const fontCss = list.filter(isFontCss), fonts = list.filter(isFont);
    // 最后一个字体文件下载完的时间：从网页本身的请求发出算起（网络事件的时间戳）；没有字体文件就是 null
    const doc = list.find(r => r.type === 'Document');
    const fontEnds = fonts.filter(r => r.t1).map(r => r.t1);
    const fontsReadyAt = doc && fontEnds.length ? Math.round((Math.max(...fontEnds) - doc.t0) * 1000) : null;
    return {
      ...page, fontsReadyAt,
      requests: list.length, bytes: sum(list),
      fontCss: { n: fontCss.length, bytes: sum(fontCss) }, fontFiles: { n: fonts.length, bytes: sum(fonts) },
      failed: list.filter(r => r.failed || r.status >= 400).map(r => `${r.failed || r.status} ${r.url.slice(0, 100)}`),
      music: list.filter(r => /\.mp3(\?|$)|assets\/music\//.test(r.url)).map(r => r.url),
      deferred: list.filter(r => /qingfengxing|three\.min\.js|peerjs/.test(r.url)).map(r => r.url),
      list: list.map(r => ({ url: r.url.slice(0, 160), type: r.type, status: r.status, bytes: r.bytes, ms: r.t1 && r.t0 ? Math.round((r.t1 - r.t0) * 1000) : null, cache: r.cache, failed: r.failed })),
    };
  } finally { chrome.kill(); await sleep(300); }
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await oneRun(i));
const m = k => median(runs.map(r => typeof k === 'function' ? k(r) : r[k]));
const summary = {
  when: new Date().toISOString(), url: URL, runs: RUNS,
  fcpMs: m('fcp'), lcpMs: m('lcp'), titleMs: m('titleAt'), dclMs: m('dcl'), loadMs: m('load'), fontsReadyMs: m('fontsReadyAt'), cls: m('cls'),
  requests: m('requests'), kb: kb(m('bytes')),
  fontCss: { n: m(r => r.fontCss.n), kb: kb(m(r => r.fontCss.bytes)) }, fontFiles: { n: m(r => r.fontFiles.n), kb: kb(m(r => r.fontFiles.bytes)) },
  faces: m('faces'), facesLoaded: m('facesLoaded'),
  blockingFaces: [...new Set(runs.flatMap(r => r.blocking))],
  failed: [...new Set(runs.flatMap(r => r.failed))],
  music: [...new Set(runs.flatMap(r => r.music))], deferred: [...new Set(runs.flatMap(r => r.deferred))],
  families: runs[runs.length - 1].families,
};
writeFileSync(`${OUT}/firstload.json`, JSON.stringify({ summary, runs }, null, 1));

const r1 = v => v == null ? '—' : Math.round(v);
console.log(`\n================ 首屏加载（${RUNS} 次中位数，无缓存） ================`);
console.log(`FCP ${r1(summary.fcpMs)} ms · LCP ${r1(summary.lcpMs)} ms · 标题文字出现 ${r1(summary.titleMs)} ms · DOMContentLoaded ${r1(summary.dclMs)} ms · load ${r1(summary.loadMs)} ms`);
console.log(`字体文件全部下完 ${r1(summary.fontsReadyMs)} ms · 布局跳动 CLS ${summary.cls}`);
for (const sh of runs[runs.length - 1].shifts) console.log(`  布局跳动 ${sh.t} ms：${sh.v}（${sh.nodes.join('、')}）`);
console.log(`请求 ${summary.requests} 个，共 ${summary.kb} KB；字体 CSS ${summary.fontCss.n} 个 ${summary.fontCss.kb} KB；字体文件 ${summary.fontFiles.n} 个 ${summary.fontFiles.kb} KB`);
console.log(`@font-face ${summary.faces} 个，已加载 ${summary.facesLoaded} 个`);
for (const [k, v] of Object.entries(summary.families)) console.log(`  ${k.padEnd(20)} ${String(v.loaded).padStart(3)}/${v.faces} 个分片已加载，font-display: ${v.display}`);
console.log(`会让文字隐身（FOIT）的字体：${summary.blockingFaces.length ? summary.blockingFaces.join('，') : '没有'}`);
console.log(`失败的请求：${summary.failed.length ? summary.failed.join('；') : '没有'}`);
console.log(`首屏音乐请求：${summary.music.length ? summary.music.join('，') : '没有'}`);
console.log(`首屏青锋行 / three.js / PeerJS 请求：${summary.deferred.length ? summary.deferred.join('，') : '没有'}`);

// 只拦确定的问题：字体会隐身、首屏就去下音乐或青锋行。时间和体积受网络影响，只报告不判失败
const bad = [];
if (summary.blockingFaces.length) bad.push('有 font-display 为 block / auto 的字体，文字会先隐身：' + summary.blockingFaces.join('，'));
if (summary.music.length) bad.push('首屏不该请求音乐：' + summary.music.join('，'));
if (summary.deferred.length) bad.push('首屏不该请求青锋行 / three.js / PeerJS：' + summary.deferred.join('，'));
for (const b of bad) console.log('::error::' + b);
console.log(bad.length ? `\n${bad.length} 项问题` : '\n首屏没有 FOIT，没有多余的音乐 / 青锋行请求');
process.exit(bad.length ? 1 : 0);
