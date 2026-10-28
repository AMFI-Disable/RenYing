// 云端存档客户端的回归测试：不需要浏览器、不需要联网、不依赖任何 npm 包。
//   node tools/cloud-test.mjs
// 覆盖：存档按账号隔离、防抖中的存档不会换账号写入、服务器拒绝时不再无限重试、
//       本机账号的中文密码、导出签名覆盖所有字段。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'cloud.js');

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + extra : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 假 Cloudflare Worker ----------
function makeWorker() {
  const users = new Map();   // username -> { uid, password, profile }
  const posts = [];          // 每次 POST /api/profile
  const state = { nextStatus: 0, token: '', down: false };   // down：注册、登录都回 500（服务器出错）
  const json = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj });
  const uidOf = tok => String(tok).replace(/^Bearer /, '').replace('tok_', '');
  const byUid = uid => [...users.entries()].find(([, v]) => v.uid === uid);
  async function fetch(url, opts = {}) {
    const route = String(url).replace(/^https?:\/\/[^/]+/, '');
    const method = (opts.method || 'GET').toUpperCase();
    const auth = (opts.headers && opts.headers.Authorization) || '';
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (state.down && (route === '/api/register' || route === '/api/login')) return json({ error: '服务器内部错误' }, 500);
    if (route === '/api/register' && method === 'POST') {
      if (users.has(body.username)) return json({ error: '该昵称已注册' }, 400);
      const uid = 'u' + users.size;
      users.set(body.username, { uid, password: body.password, profile: body.profile || null });
      state.token = 'tok_' + uid;
      return json({ token: state.token, uid, username: body.username, profile: body.profile });
    }
    if (route === '/api/login' && method === 'POST') {
      const rec = users.get(body.username);
      if (!rec || rec.password !== body.password) return json({ error: '昵称或密码不对' }, 401);
      state.token = 'tok_' + rec.uid;
      return json({ token: state.token, uid: rec.uid, username: body.username, profile: rec.profile });
    }
    if (route === '/api/profile' && method === 'POST') {
      if (state.nextStatus) {
        const status = state.nextStatus; state.nextStatus = 0;
        posts.push({ status, keepalive: !!opts.keepalive });
        return json({ error: '服务器拒绝' }, status);
      }
      const uid = uidOf(auth);
      const rec = byUid(uid);
      posts.push({ uid, ink: body.profile && body.profile.ink, stars: body.profile && body.profile.stageStars, keepalive: !!opts.keepalive });
      if (rec) rec[1].profile = body.profile;
      const acks = body.ledger && Array.isArray(body.ledger.deltas) ? body.ledger.deltas.map(d => d.id) : [];
      return json({ ok: true, updatedAt: Date.now(), ledger: { ink: body.profile && body.profile.ink, ver: 1, acks } });
    }
    if (route === '/api/profile' && method === 'GET') {
      const rec = byUid(uidOf(auth));
      if (!rec) return json({ error: '未登录' }, 401);
      return json({ profile: rec[1].profile, ledger: { ink: (rec[1].profile || {}).ink || 0, ver: 1, acks: [] } });
    }
    if (route === '/api/logout') return json({ ok: true });
    if (route === '/api/flags') {
      if (state.flagsDown) return json({ error: '服务器内部错误' }, 500);
      return json({ ok: true, flags: { 'x.page': uidOf(auth) === 'u0' } });   // 只对 u0 开，看缓存是不是按账号分开
    }
    return json({ error: 'not found' }, 404);
  }
  return { fetch, posts, state, users };
}

// ---------- 最小的浏览器外壳 ----------
function makeEnv(worker) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  const g = {
    console: { log: console.log, warn: process.env.CT_DEBUG ? console.warn : () => {}, error: console.error },
    setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { onLine: true, userAgent: 'cloud-test' },
    localStorage,
    fetch: worker.fetch,
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder,
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    document: {
      readyState: 'complete',
      visibilityState: 'visible',
      addEventListener: () => {},
      createElement: () => ({ click: () => {}, style: {}, set href(v) {}, set download(v) {} }),
      body: { appendChild: () => {}, removeChild: () => {} },
    },
  };
  g.listeners = {};
  g.addEventListener = (type, fn) => { (g.listeners[type] = g.listeners[type] || []).push(fn); };
  g.removeEventListener = () => {};
  g.window = g;
  g.self = g;
  g.globalThis = g;
  return { g, store };
}

async function boot() {
  const worker = makeWorker();
  const { g, store } = makeEnv(worker);
  const ctx = vm.createContext(g);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'cloud.js' });
  await sleep(20);
  return { CloudSave: g.CloudSave, worker, store, g };
}

const { CloudSave, worker, store, g } = await boot();
CloudSave.setConfig({ endpoint: 'https://example.test' });

console.log('per-account mirrors (no shared cache key)');
ok(store.get('renying-cloud-cache') === undefined, 'boot leaves no shared cache key');
await CloudSave.register('Alice', 'alicepass1');
await sleep(20);
CloudSave.saveProfile({ name: 'Alice', ink: 4321, owned: ['qingfeng', 'moyu'], skins: [], frags: {}, equip: {} }, true);
await sleep(40);
const aliceUid = CloudSave.getUser().uid;
ok(store.get('renying-prof-' + aliceUid) !== undefined, 'the active account has its own mirror');
ok(store.get('renying-cloud-cache') === undefined, 'saving creates no shared cache key');
await CloudSave.logout();
await sleep(20);
await CloudSave.register('Bob', 'bobpass12');
await sleep(20);
const bobProfile = await CloudSave.loadProfile();
ok(!bobProfile || bobProfile.ink !== 4321, 'a new account does not inherit the previous one\'s ink', bobProfile && bobProfile.ink);
ok(!(bobProfile && (bobProfile.owned || []).includes('moyu')), 'a new account does not inherit the previous roster');

console.log('\na pending save belongs to one account');
await CloudSave.logout();
await sleep(10);
await CloudSave.login('Alice', 'alicepass1');
await sleep(20);
const before = worker.posts.length;
CloudSave.saveProfile({ name: 'Alice', ink: 9999, owned: ['qingfeng'], skins: [], frags: {}, equip: {} }, false);
await CloudSave.logout();
await sleep(10);
await CloudSave.register('Carol', 'carolpass1');
await sleep(20);
await sleep(1400);
const carolUid = CloudSave.getUser().uid;
ok(!worker.posts.slice(before).some(p => p.uid === carolUid), 'nothing is written to the next account');
ok(!worker.posts.slice(before).some(p => p.ink === 9999), 'the stale payload is dropped, not replayed');

console.log('\na refusal is not retried forever');
const attemptsBefore = worker.posts.length;
worker.state.nextStatus = 403;
CloudSave.saveProfile({ name: 'Carol', ink: 123, owned: ['qingfeng'], skins: [], frags: {}, equip: {} }, true);
await sleep(80);
ok(CloudSave.getSyncState().state === 'blocked', 'a 4xx refusal reports blocked', CloudSave.getSyncState().state);
ok(store.get('renying-sync-dirty-' + carolUid) === undefined, 'the dirty marker is cleared');
await sleep(1400);
ok(worker.posts.slice(attemptsBefore).filter(p => p.status === 403).length === 1, 'exactly one attempt, no retry storm');
worker.state.nextStatus = 429;
CloudSave.saveProfile({ name: 'Carol', ink: 124, owned: ['qingfeng'], skins: [], frags: {}, equip: {} }, true);
await sleep(80);
ok(CloudSave.getSyncState().state === 'error', '429 is still retried', CloudSave.getSyncState().state);

console.log('\nclosing the page still sends the last save');
await sleep(1600);   // 让上面 429 的重试先跑完
worker.state.nextStatus = 0;
const leaveBefore = worker.posts.length;
CloudSave.saveProfile({ name: 'Carol', ink: 130, owned: ['qingfeng'], skins: [], frags: {}, equip: {} }, false);
g.listeners.pagehide.forEach(fn => fn());
await sleep(40);
const leavePosts = worker.posts.slice(leaveBefore);
ok(leavePosts.length === 1 && leavePosts[0].keepalive, 'pagehide flushes the debounced save with keepalive', JSON.stringify(leavePosts));
const normalBefore = worker.posts.length;
CloudSave.saveProfile({ name: 'Carol', ink: 131, owned: ['qingfeng'], skins: [], frags: {}, equip: {} }, true);
await sleep(40);
ok(worker.posts.slice(normalBefore).every(p => !p.keepalive), 'an ordinary save does not use keepalive');

console.log('\nan expired session keeps the save for after re-login');
const starsProf = { name: 'Carol', ink: 131, owned: ['qingfeng'], skins: [], frags: {}, equip: {}, stageStars: { s1: 3, s2: 2 } };
worker.state.nextStatus = 401;
CloudSave.saveProfile(starsProf, true);
await sleep(60);
ok(CloudSave.getSyncState().state === 'expired', 'a 401 reports expired, not blocked', CloudSave.getSyncState().state);
ok(store.get('renying-sync-dirty-' + carolUid) !== undefined, 'the dirty marker is kept');
await sleep(1400);
ok(worker.posts.slice(-1)[0].status === 401, 'and it is not retried in a loop');
await CloudSave.login('Carol', 'carolpass1');
const relogBefore = worker.posts.length;
const reloaded = await CloudSave.loadProfile();
ok(reloaded && reloaded.stageStars && reloaded.stageStars.s2 === 2, 'logging back in keeps the unsynced stage stars', reloaded && JSON.stringify(reloaded.stageStars));
await sleep(1200);
ok(worker.posts.slice(relogBefore).some(p => p.stars && p.stars.s2 === 2), 'and uploads them', JSON.stringify(worker.posts.slice(relogBefore)));

console.log('\nloading an up-to-date profile does not upload again');
await sleep(200);
const quietBefore = worker.posts.length;
await CloudSave.loadProfile();
await sleep(1200);
ok(worker.posts.length === quietBefore, 'no write when nothing changed', worker.posts.length - quietBefore);
const offlineStars = JSON.parse(store.get('renying-prof-' + carolUid));
offlineStars.stageStars = { ...offlineStars.stageStars, s3: 1 };
store.set('renying-prof-' + carolUid, JSON.stringify(offlineStars));
const starBefore = worker.posts.length;
await CloudSave.loadProfile();
await sleep(1200);
ok(worker.posts.slice(starBefore).some(p => p.stars && p.stars.s3 === 1), 'a stage star earned offline is uploaded on load');

console.log('\nlocal accounts accept non-Latin-1 passwords');
await CloudSave.logout();
await sleep(10);
const realFetch = g.fetch;
g.fetch = () => Promise.reject(new Error('offline'));      // 服务器连不上：走本机账号
let regErr = null;
try { await CloudSave.register('侠客', '密码123456'); } catch (e) { regErr = e; }
ok(!regErr, 'registering with a Chinese password succeeds', regErr && regErr.message);
await CloudSave.logout();
await sleep(10);
const login = await CloudSave.login('侠客', '密码123456').catch(e => ({ error: e }));
ok(login && login.name === '侠客', 'and the same password logs back in');
const records = JSON.parse(store.get('renying-local-accounts') || '{}');
ok(records['侠客'] && String(records['侠客'].pw).startsWith('v2$'), 'the password is stored as a v2 hash, not base64');
g.fetch = realFetch;

console.log('\nexport signatures cover the whole profile');
const base = { name: 'A', ink: 100, owned: ['qingfeng'], skins: [], frags: { moyu: 3 }, equip: {}, netWins: 1, netLosses: 0, stageStars: { s1: 3 }, qfx: 5 };
const sig = await CloudSave.computeProfileDigest(base);
ok(!!sig, 'a signature is produced when WebCrypto is available');
ok(sig !== await CloudSave.computeProfileDigest({ ...base, stageStars: { s1: 1 } }), 'tampering stageStars invalidates it');
ok(sig !== await CloudSave.computeProfileDigest({ ...base, frags: { moyu: 99 } }), 'tampering fragments invalidates it');
ok(await CloudSave.verifyProfileDigest({ profile: base, _sig: sig }) === 'ok', 'a good signature verifies');
ok(await CloudSave.verifyProfileDigest({ profile: { ...base, stageStars: { s1: 1 } }, _sig: sig }) === 'tampered', 'a tampered file is rejected');
ok(await CloudSave.verifyProfileDigest({ profile: base }) === 'unsigned', 'an unsigned file is reported as unsigned');

console.log('\nsign-up and sign-in fallbacks say what they did');
const isErr = e => !!e && typeof e.message === 'string' && !e.uid;   // vm 里抛出来的 Error 不是这边的 Error，instanceof 不成立
await CloudSave.logout();
const rsv = await CloudSave.register('Guest', 'guestpass1').catch(e => e);
ok(isErr(rsv) && /不能用/.test(rsv.message), 'the nickname guest is refused before anything is created', rsv && rsv.message);
const rsv2 = await CloudSave.register('游 客', 'guestpass1').catch(e => e);
ok(isErr(rsv2) && /不能用/.test(rsv2.message), 'and so is 游客, spaces or not');
worker.state.down = true;
const down = await CloudSave.register('Dora', 'dorapass1');
ok(down && !down.isCloud && /连不上云端/.test(down.note || ''), 'a 500 on sign-up gives a local account and says so', JSON.stringify(down));
await CloudSave.logout();
const dup = await CloudSave.register('DORA', 'dorapass1').catch(e => e);
ok(isErr(dup) && /本机注册/.test(dup.message), 'local nicknames are not case-sensitive (DORA = Dora)', dup && dup.message);
const back = await CloudSave.login('dora', 'dorapass1').catch(e => e);
ok(back && back.name === 'Dora' && /本机账号/.test(back.note || ''), 'signing in as dora reaches the local Dora account', JSON.stringify(back));
await CloudSave.logout();
worker.state.down = false;
const mismatch = await CloudSave.login('Alice', 'wrong-but-local').catch(e => e);
ok(isErr(mismatch), 'a wrong cloud password with no local account still fails');
store.set('renying-local-accounts', '{"broken');
worker.state.down = true;
const afterCorrupt = await CloudSave.register('Erin', 'erinpass1').catch(e => e);
worker.state.down = false;
ok(!(isErr(afterCorrupt) && afterCorrupt.name === 'SyntaxError'), 'a corrupted local account table does not crash sign-up', afterCorrupt && afterCorrupt.message);
await CloudSave.logout();

console.log('\nimporting a backup says which account it switched to');
const bk = { format: 'single-account', account: { uid: 'local_x', name: 'Fay' }, profile: { ...base, name: 'Fay' } };
bk._sig = await CloudSave.computeProfileDigest(bk.profile);
const imp = await CloudSave.importAccountData(bk);
ok(imp && imp.name === 'Fay' && imp.profile && imp.profile.ink === 100 && imp.note === '', 'import returns the account name and its profile', JSON.stringify(imp));
ok(CloudSave.getUser() && CloudSave.getUser().name === 'Fay', 'and that account is now the current one');
const bare = await CloudSave.importAccountData({ ...base, name: 'Gus' }).catch(e => e);
ok(bare && bare.profile && bare.name === 'Gus', 'a bare profile file is accepted, as the import screen promises', bare && bare.message);
await CloudSave.logout();

console.log('\nthe old shared cache is not thrown away while nobody is signed in');
store.set('renying-cloud-cache', JSON.stringify({ ink: 1 }));
CloudSave.init();
ok(store.get('renying-cloud-cache') !== undefined, 'signed out: the legacy cache is kept');

console.log('\nfeature flags from the server');
await CloudSave.logout();
await sleep(20);
ok(CloudSave.flag('x.page') === false && CloudSave.flag('nope') === false, 'signed out: flags are off');
await CloudSave.login('Alice', 'alicepass1');
await sleep(30);
ok(CloudSave.getUser().uid === 'u0' && CloudSave.flag('x.page') === true, 'signing in reloads the flags for that account');
worker.state.flagsDown = true;
await CloudSave.loadFlags();
ok(CloudSave.flag('x.page') === true, 'a failed refresh keeps the last known flags');
await CloudSave.logout();
await sleep(30);
ok(CloudSave.flag('x.page') === false, 'another account (signed out) does not inherit them from the cache');
worker.state.flagsDown = false;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
