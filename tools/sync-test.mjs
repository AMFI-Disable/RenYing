// 云存档“两边新增加起来”的端到端测试：本机把 cloudflare/worker.js 跑起来（D1 用 node:sqlite 模拟），
// 再开几台“设备”（各自一份 localStorage、各自一份 src/cloud.js），走真实的注册、登录、存档、加载。
// 覆盖：两台设备各自新增的胜负、碎片在云端加起来；重试、刷新、重新登录、断线重连都不重复加；
//       老存档第一次对账不丢也不多；换号不串；老版本服务器照旧能用；关卡星、侠客、列传、排位按规则合并。
// 用法：node tools/sync-test.mjs           （Node 22 以上，不用装任何包）
//       node tools/sync-test.mjs --bundle  测打包好的 cloudflare/worker.bundle.js
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url);
const FILE = process.argv.includes('--bundle') ? 'cloudflare/worker.bundle.js' : 'cloudflare/worker.js';
const { default: worker } = await import(new URL(FILE, ROOT));
const CLOUD_JS = fs.readFileSync(new URL('src/cloud.js', ROOT), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  →  ' + JSON.stringify(extra).slice(0, 300) : '')); }
};
const section = t => console.log('\n' + t);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- D1：和 econ-test 一样用 node:sqlite ---------- */
function makeD1() {
  const db = new DatabaseSync(':memory:');
  const exec1 = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params).map(r => ({ ...r })), success: true, meta: { changes: 0 } };
    const info = st.run(...params);
    return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  };
  class Stmt {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...p) { return new Stmt(this.sql, p.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)); }
    async first(col) { const r = exec1(this.sql, this.params).results[0]; return r ? (col ? r[col] : r) : null; }
    async all() { return exec1(this.sql, this.params); }
    async run() { return exec1(this.sql, this.params); }
  }
  return {
    raw: db,
    prepare: sql => new Stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map(s => exec1(s.sql, s.params)); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const ENV = { DB: makeD1(), ADMIN_SECRET: 'admin-pass-0123456789' };
const row = (sql, ...p) => ENV.DB.raw.prepare(sql).get(...p);
const cloudProf = name => JSON.parse(row('SELECT profile_json FROM users WHERE username = ?', name).profile_json);

/* ---------- 网络：所有设备共用一个 Worker；可以断网、可以“服务器做完了但回包丢了”、可以假装是老版本服务器 ---------- */
const NET = { down: false, loseReply: 0, oldServer: false, posts: 0, refresh: 0 };
let ipN = 0;
async function netFetch(url, opts = {}) {
  if (NET.down) throw new TypeError('Failed to fetch');
  const u = new URL(String(url));
  const headers = { ...(opts.headers || {}), 'CF-Connecting-IP': '10.0.' + (ipN++ % 250) + '.1' };
  const req = new Request('https://w.test' + u.pathname + u.search, { method: opts.method || 'GET', headers, body: opts.body });
  if (u.pathname === '/api/profile' && (opts.method || 'GET') === 'POST') NET.posts++;
  if (u.pathname === '/api/refresh') NET.refresh++;
  const res = await worker.fetch(req, ENV, { waitUntil() {} });
  if (NET.loseReply > 0 && u.pathname === '/api/profile' && opts.method === 'POST') { NET.loseReply--; throw new TypeError('connection reset'); }
  if (!NET.oldServer) return res;
  const j = await res.json().catch(() => ({}));
  delete j.prog;   // 老版本服务器不认识 prog
  return new Response(JSON.stringify(j), { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

/* ---------- 一台设备：一份 localStorage；reload() 换一份新的 cloud.js，存储不变（等于刷新网页） ---------- */
function makeDevice(label, store = new Map()) {   // 传同一个 store：同一个浏览器的两个标签页
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  const dev = { label, store, CS: null, PROF: null, heard: [] };
  dev.reload = () => {
    const g = {
      console: { log: console.log, warn: () => {}, error: console.error },
      setTimeout, clearTimeout, setInterval, clearInterval,
      navigator: { onLine: true, userAgent: 'sync-test' },
      localStorage, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      fetch: netFetch, crypto: globalThis.crypto, TextEncoder, TextDecoder,
      Blob: class {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
      btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
      document: { readyState: 'complete', visibilityState: 'visible', addEventListener() {}, createElement: () => ({}), body: { appendChild() {}, removeChild() {} } },
      addEventListener() {}, removeEventListener() {},
    };
    g.window = g; g.self = g; g.globalThis = g;
    vm.runInContext(CLOUD_JS, vm.createContext(g), { filename: 'cloud.js' });
    dev.CS = g.CloudSave;
    dev.CS.setConfig({ endpoint: 'https://w.test' });
    // 和游戏里 24-account.js 一样：别的设备加的，加到当前存档上
    if (dev.CS.onProgress) dev.CS.onProgress(d => {
      dev.heard.push(d);
      if (!dev.PROF) return;
      for (const [k, x] of Object.entries(d)) {
        if (k === 'netWins' || k === 'netLosses') dev.PROF[k] = Math.max(0, (dev.PROF[k] || 0) + x);
        else { const h = k.slice(6); dev.PROF.frags = dev.PROF.frags || {}; dev.PROF.frags[h] = Math.max(0, (dev.PROF.frags[h] || 0) + x); }
      }
    });
    return dev;
  };
  // 和游戏一样：载入存档，当成当前的 PROF
  dev.load = async () => { dev.PROF = JSON.parse(JSON.stringify(await dev.CS.loadProfile())); await sleep(1300); return dev.PROF; };
  // 改一下当前存档再存（立刻上传），等上传结束
  dev.play = async fn => { fn(dev.PROF); dev.CS.saveProfile(dev.PROF, true); await sleep(30); return dev.PROF; };
  return dev.reload();
}
const wins = p => p.netWins || 0;

/* ======================================================================= */
section('两台设备各自新增的胜负、碎片，在云端加起来（不是取大的、也不是后传的覆盖）');
const A = makeDevice('A'), B = makeDevice('B');
await A.CS.register('Sam', 'sampass123');
await A.load();
await A.play(p => { p.netWins = 2; });
ok(cloudProf('Sam').netWins === 2, 'A 赢了 2 场，云端是 2', cloudProf('Sam').netWins);
await B.CS.login('Sam', 'sampass123');
await B.load();
ok(wins(B.PROF) === 2, 'B 登录同一个号，看到 2');
await A.play(p => { p.netWins += 3; p.netLosses = 1; });
await B.play(p => { p.netWins += 4; p.frags = { moyu: 5 }; });
let c = cloudProf('Sam');
ok(c.netWins === 9 && c.netLosses === 1 && c.frags.moyu === 5, 'A 又赢 3 输 1、B 又赢 4 拿 5 个碎片：云端 9 胜 1 负 5 碎片（2 + 3 + 4）', [c.netWins, c.netLosses, c.frags]);
ok(wins(B.PROF) === 9, 'B 上传时服务器带回总数：A 那 3 场加到 B 当前的存档上（不用刷新）', B.PROF.netWins);
await A.load();
ok(wins(A.PROF) === 9 && A.PROF.netLosses === 1 && (A.PROF.frags || {}).moyu === 5, 'A 再加载也是 9 胜 1 负 5 碎片', A.PROF);
await A.play(p => { p.frags.moyu -= 2; });
ok(cloudProf('Sam').frags.moyu === 3, '花掉 2 个碎片也按增量记：5 - 2 = 3', cloudProf('Sam').frags);

section('重复同步不重复加：回包丢了重试、刷新网页、重新登录、断线重连');
NET.loseReply = 1;
await A.play(p => { p.netWins += 1; });
ok(cloudProf('Sam').netWins === 10, '服务器记上了，但回包丢了', cloudProf('Sam').netWins);
await sleep(2200);   // 客户端 2 秒后自动重试同一条
ok(cloudProf('Sam').netWins === 10, '重试同一条：服务器认得编号，不再加（还是 10）', cloudProf('Sam').netWins);
A.reload(); await A.load();
ok(wins(A.PROF) === 10, '刷新网页：显示 10，没有把记过的那条再算一遍', A.PROF.netWins);
await A.play(p => { p.netWins += 0; });
ok(cloudProf('Sam').netWins === 10, '刷新后再存一次：云端还是 10');
NET.down = true;
await A.play(p => { p.netWins += 2; });
ok(cloudProf('Sam').netWins === 10, '断网时又赢 2 场：先记在本机', cloudProf('Sam').netWins);
A.reload(); await A.load();
ok(wins(A.PROF) === 12, '断网中刷新：本机显示 12（10 + 没报的 2）', A.PROF.netWins);
NET.down = false;
A.reload(); await A.load();
ok(cloudProf('Sam').netWins === 12 && wins(A.PROF) === 12, '联网后再加载：补传那 2 场，云端 12，只加了一次', [cloudProf('Sam').netWins, A.PROF.netWins]);
A.reload(); await A.load(); A.reload(); await A.load();
ok(cloudProf('Sam').netWins === 12, '连着刷新两次：还是 12');
await A.CS.logout();
await A.CS.login('Sam', 'sampass123'); await A.load();
ok(cloudProf('Sam').netWins === 12 && wins(A.PROF) === 12, '退出再登录：还是 12', [cloudProf('Sam').netWins, A.PROF.netWins]);
await B.load();
ok(wins(B.PROF) === 12, 'B 加载：12');

section('老存档第一次走新逻辑：不丢、不多，只把本机多出来的补上去');
NET.oldServer = true;   // 先用“老版本服务器”造一个老号：云端 10 胜，存档按绝对数存
const O1 = makeDevice('O1');
await O1.CS.register('Old', 'oldpass123'); await O1.load();
await O1.play(p => { p.netWins = 10; p.frags = { yanling: 4 }; });
ok(cloudProf('Old').netWins === 10, '老服务器：绝对数，云端 10');
ok(!O1.store.has('renying-prog-' + O1.CS.getUser().uid) || JSON.parse(O1.store.get('renying-prog-' + O1.CS.getUser().uid)).seen === null, '老服务器不回 prog：网页不建账本，照旧传绝对数');
await O1.play(p => { p.netWins = 12; });   // 本机又赢 2 场，还是老服务器
const O2 = makeDevice('O2');
await O2.CS.login('Old', 'oldpass123'); await O2.load();
O2.store.set('renying-prof-' + O2.CS.getUser().uid, JSON.stringify({ ...O2.PROF, netWins: 8 }));   // O2 的本机镜像比较旧：8
NET.oldServer = false;   // 服务器升级
O1.reload(); await O1.load();
ok(wins(O1.PROF) === 12 && cloudProf('Old').netWins === 12, 'O1 第一次对账：本机 12、云端 12，不多不少', [O1.PROF.netWins, cloudProf('Old').netWins]);
O2.reload(); await O2.load();
ok(wins(O2.PROF) === 12 && cloudProf('Old').netWins === 12, 'O2 本机只有旧的 8：不会把云端减成 8，也不会加成 20', [O2.PROF.netWins, cloudProf('Old').netWins]);
await O1.play(p => { p.netWins += 1; });
await O2.play(p => { p.netWins += 1; });
ok(cloudProf('Old').netWins === 14, '之后两边各赢 1：14', cloudProf('Old').netWins);
const O3 = makeDevice('O3');   // 迁移时本机比云端多：多出来的补上去
await O3.CS.login('Old', 'oldpass123');
O3.store.set('renying-prof-' + O3.CS.getUser().uid, JSON.stringify({ name: 'Old', netWins: 20, frags: { yanling: 4 } }));
await O3.load();
ok(cloudProf('Old').netWins === 20 && wins(O3.PROF) === 20, '本机老镜像 20 > 云端 14：第一次对账补到 20（只加差的 6）', [cloudProf('Old').netWins, O3.PROF.netWins]);
O3.reload(); await O3.load();
ok(cloudProf('Old').netWins === 20, '再加载：不会再补一次', cloudProf('Old').netWins);

section('换号不串：A 号没报的增量不会进 B 号');
const S = makeDevice('S');
await S.CS.register('Xia', 'xiapass123'); await S.load();
NET.down = true;
await S.play(p => { p.netWins = 50; });
NET.down = false;
await S.CS.logout();
await S.CS.register('Yu', 'yupass1234'); await S.load();
await S.play(p => { p.netWins += 1; });
ok(cloudProf('Yu').netWins === 1 && cloudProf('Xia').netWins === 0, 'Xia 断网赢的 50 场不会记到 Yu 头上（Yu 1、Xia 还没传是 0）', [cloudProf('Yu').netWins, cloudProf('Xia').netWins]);
await S.CS.logout();
await S.CS.login('Xia', 'xiapass123'); await S.load();
ok(cloudProf('Xia').netWins === 50 && cloudProf('Yu').netWins === 1, '换回 Xia：那 50 场补传到 Xia 自己身上', [cloudProf('Xia').netWins, cloudProf('Yu').netWins]);

section('不是计数的进度按确定的规则合并：关卡星、侠客、列传取两边的，排位取新的');
await A.play(p => { p.stageStars = { s1: 3 }; p.owned = ['qingfeng', 'moyu']; p.saga = { moyu: { r: 0, s: 2, f: '', c: 0, e: [], t: 1 } }; p.rk = { season: 'S1', pts: 3000, at: 100, owner: 'Sam' }; });
await B.play(p => { p.stageStars = { s2: 2 }; p.owned = ['qingfeng', 'yanling']; p.saga = { yanling: { r: 1, s: 5, f: 'a', c: 0, e: ['good'], t: 2 } }; p.rk = { season: 'S1', pts: 2000, at: 50, owner: 'Sam' }; });
c = cloudProf('Sam');
ok(c.stageStars.s1 === 3 && c.stageStars.s2 === 2, 'A 的 s1、B 的 s2 都在（B 后传，没把 A 的盖掉）', c.stageStars);
ok(['qingfeng', 'moyu', 'yanling'].every(h => c.owned.includes(h)), '两边的侠客都在', c.owned);
ok(c.saga.moyu && c.saga.yanling && c.saga.yanling.e.includes('good'), '两边的列传进度都在', Object.keys(c.saga));
ok(c.rk.pts === 3000, '排位：B 传的那份更旧（at 小），云端留 A 的', c.rk);
ok(c.netWins === 12, '胜场在这期间没被绝对数覆盖：还是 12', c.netWins);

section('短效令牌 + 续期令牌：过期了网页自己换，几个标签页一起换也不掉线；偷来的续期令牌一用，这台设备整组退出');
const admin = (path, body) => worker.fetch(new Request('https://w.test' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ENV.ADMIN_SECRET, 'CF-Connecting-IP': '10.8.0.1' }, body: JSON.stringify(body) }), ENV).then(r => r.json());
const L = makeDevice('L');
await L.CS.register('Lao', 'laopass123'); await L.load();   // 开关没开：老式令牌
const legacyTok = L.store.get('renying-cloud-token');
ok(legacyTok && !L.store.has('renying-cloud-refresh'), '开关没开：老式 30 天令牌，没有续期令牌');
ok((await admin('/api/admin/flags', { k: 'auth.refresh', mode: 'all', why: '测试' })).ok, '开关改成所有人');
L.reload(); L.CS.init(); await sleep(50);
ok(L.store.has('renying-cloud-refresh') && L.store.get('renying-cloud-token') !== legacyTok, '刷新网页：老令牌自动换成新的一套，不用重新登录');
await L.load(); await L.play(p => { p.netWins = 3; });
ok(cloudProf('Lao').netWins === 3, '换完照常存档', cloudProf('Lao').netWins);
const R = makeDevice('R');
await R.CS.register('Ren', 'renpass123'); await R.load();
const r0 = R.store.get('renying-cloud-refresh'), t0 = R.store.get('renying-cloud-token');
ok(r0 && t0 && +R.store.get('renying-cloud-exp') - Date.now() > 29 * 60e3, '新登录：30 分钟的令牌加续期令牌');
ENV.DB.raw.prepare("UPDATE sessions SET expires_at = 1 WHERE user_id = (SELECT id FROM users WHERE username = 'Ren')").run();   // 令牌在服务器那边过期了，网页还不知道
NET.refresh = 0;
await R.play(p => { p.netWins = 5; });
await sleep(50);
ok(cloudProf('Ren').netWins === 5 && NET.refresh === 1 && R.store.get('renying-cloud-token') !== t0 && R.store.get('renying-cloud-refresh') !== r0, '存档时服务器回 401：网页换一次令牌再传，进度没丢', [cloudProf('Ren').netWins, NET.refresh]);
ok(R.CS.getSyncState().state === 'ok', '同步状态是正常，不是“登录过期”', R.CS.getSyncState());
R.store.set('renying-cloud-exp', String(Date.now() + 20e3));   // 快过期了
NET.refresh = 0;
const r1 = R.store.get('renying-cloud-refresh');
await R.play(p => { p.netWins += 1; });
await sleep(50);
ok(NET.refresh === 1 && R.store.get('renying-cloud-refresh') !== r1 && cloudProf('Ren').netWins === 6, '快过期时：先换再传，不等 401', NET.refresh);
// 同一个浏览器两个标签页（共用 localStorage）同时发现过期
const R2 = makeDevice('R2', R.store);
await R2.load();
ENV.DB.raw.prepare("UPDATE sessions SET expires_at = 1 WHERE user_id = (SELECT id FROM users WHERE username = 'Ren')").run();
R.store.set('renying-cloud-exp', '1');
NET.refresh = 0;
await Promise.all([R.play(p => { p.netWins += 1; }), R2.play(p => { p.frags = { moyu: 2 }; })]);
await sleep(1500);
const dRen = row("SELECT COUNT(*) AS n FROM devices d JOIN users u ON u.id = d.user_id WHERE u.username = 'Ren'").n;
ok(cloudProf('Ren').netWins === 7 && (cloudProf('Ren').frags || {}).moyu === 2, '两个标签页同时换令牌：两边的存档都传上去了', [cloudProf('Ren').netWins, cloudProf('Ren').frags, NET.refresh]);
ok(dRen === 1 && R.CS.getSyncState().state !== 'expired' && R2.CS.getSyncState().state !== 'expired', '没有被当成偷用：设备还在，两个标签页都没掉线', [dRen, R.CS.getSyncState().state, R2.CS.getSyncState().state]);
// 有人偷走了续期令牌：本人先换了，偷的人再拿旧的来用
const stolen = R.store.get('renying-cloud-refresh');
ENV.DB.raw.prepare("UPDATE sessions SET expires_at = 1 WHERE user_id = (SELECT id FROM users WHERE username = 'Ren')").run();
await R.play(p => { p.netWins += 1; });
await sleep(50);
ok(cloudProf('Ren').netWins === 8 && R.store.get('renying-cloud-refresh') !== stolen, '本人照常用，令牌换过了');
const thief = await worker.fetch(new Request('https://w.test/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '6.6.6.6' }, body: JSON.stringify({ refresh: stolen, insist: true }) }), ENV).then(r => r.json());
ok(!thief.ok && thief.reused, '偷的人拿旧的来换：不给，这台设备整组退出', thief);
await R.play(p => { p.netWins += 1; });
await sleep(50);
ok(R.CS.getSyncState().state === 'expired' && !R.store.has('renying-cloud-refresh') && cloudProf('Ren').netWins === 8, '本人下次存档：提示登录过期，进度留在本机等重新登录', [R.CS.getSyncState(), cloudProf('Ren').netWins]);
await R.CS.login('Ren', 'renpass123'); await R.load();
await sleep(1500);
ok(cloudProf('Ren').netWins === 9 && wins(R.PROF) === 9, '重新登录：没传上去的那 1 场补传了', [cloudProf('Ren').netWins, R.PROF.netWins]);
await R.CS.logout();
ok(!R.store.has('renying-cloud-refresh') && !R.store.has('renying-cloud-token') && !R.store.has('renying-cloud-exp'), '退出登录：令牌和续期令牌都清掉');
await admin('/api/admin/flags', { k: 'auth.refresh', mode: 'dev', why: '测试完回到默认' });

section('乱报的增量：编号不对、键不认识、一次加太多，都不认');
const tok = A.CS.getUser().token;
const bad = await worker.fetch(new Request('https://w.test/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, 'CF-Connecting-IP': '10.9.9.9' },
  body: JSON.stringify({ profile: { netWins: 999999 }, prog: { deltas: [{ id: 'nothex!', d: { netWins: 5 } }, { id: 'abcdef01', d: { ink: 5000, rating: 9, 'frags.<x>': 3 } }, { id: 'abcdef02', d: { netWins: 99999 } }] } }) }), ENV);
const bj = await bad.json();
c = cloudProf('Sam');
ok(bad.status === 200 && c.netWins === 12 && !('<x>' in (c.frags || {})), '都没加上，报上来的绝对数 999999 也不认', [c.netWins, bj.prog]);

console.log(`\n${pass} 项通过，${fail} 项失败`);
process.exit(fail ? 1 : 0);
