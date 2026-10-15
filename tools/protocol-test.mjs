// Protocol-level hardening tests for server.py.
// Talks raw WebSockets to the matchmaking server (no browser needed) and checks the
// client-trust properties:
//   1. normal peer relay still works
//   2. the chat rate limit cannot be bypassed by reordering JSON keys
//   3. a peer cannot forge a server ("sys") message to its opponent
//   4. a player who claims a win and then leaves is not believed
// Usage: node tools/protocol-test.mjs   (needs server.py running, RENYING_HTTP to override)
import { readFileSync } from 'node:fs';

const HTTP = process.env.RENYING_HTTP || 'http://127.0.0.1:8791';
const WS = HTTP.replace(/^http/, 'ws');
const VERSION = (readFileSync(new URL('../src/game.js', import.meta.url), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1] || '0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, body, token) {
  const hd = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  const r = await fetch(HTTP + path, { method: body ? 'POST' : 'GET', headers: hd, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${j.err || r.status}`);
  return j;
}
const account = async tag => {
  const name = `pt${tag}${Math.random().toString(36).slice(2, 7)}`;
  const j = await api('/api/register', { name, pass: 'protocol-test-1' });
  return { name, token: j.token };
};
function open(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.msgs = [];
    ws.onmessage = e => { try { ws.msgs.push(JSON.parse(e.data)); } catch { ws.msgs.push(e.data); } };
    ws.onopen = () => res(ws);
    ws.onerror = () => rej(new Error('ws error'));
    setTimeout(() => rej(new Error('ws open timeout')), 8000);
  });
}
const waitFor = async (ws, pred, ms = 6000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const hit = ws.msgs.find(pred); if (hit) return hit; await sleep(60); }
  return null;
};
const send = (ws, o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o));

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// A host and a client, both logged in so match results are delivered to them.
async function room() {
  const a = await account('a'), b = await account('b');
  const A = await open(`${WS}/ws?create=1&v=${VERSION}&t=${encodeURIComponent(a.token)}`);
  const code = (await waitFor(A, m => m && m.sys === 'room'))?.code;
  if (!code) throw new Error('host never got a room code');
  const B = await open(`${WS}/ws?join=${code}&v=${VERSION}&t=${encodeURIComponent(b.token)}`);
  await waitFor(B, m => m && m.sys === 'room');
  await waitFor(A, m => m && m.sys === 'ready');
  await waitFor(B, m => m && m.sys === 'ready');
  return { A, B, code, a, b };
}

console.log(`\n===== server protocol hardening tests (${HTTP}, version ${VERSION}) =====`);

// ---------- 1. normal relay works (must keep working) ----------
{
  const { A, B } = await room();
  A.msgs = []; B.msgs = [];
  send(A, { pskin: { qingfeng: 'qf_gold' } });
  const got = await waitFor(B, m => m && m.pskin);
  check('peer relay still works', !!got, got ? `B received pskin=${JSON.stringify(got.pskin)}` : 'B never received the message');
  A.close(); B.close(); await sleep(150);
}

// ---------- 2. chat rate limit vs JSON key order ----------
{
  const { A, B } = await room();
  A.msgs = []; B.msgs = [];
  for (let i = 0; i < 15; i++) send(A, `{"n":${i},"chat":{"k":"t","v":"flood ${i}"}}`);   // leading key = the old bypass
  await sleep(1200);
  const delivered = B.msgs.filter(m => m && m.chat).length;
  check('chat rate limit cannot be bypassed by key order', delivered <= 12, `opponent received ${delivered} of 15 rapid messages (limit is 12 per 10s)`);
  A.close(); B.close(); await sleep(150);
}

// ---------- 3. a peer cannot forge a server message ----------
{
  const { A, B } = await room();
  A.msgs = []; B.msgs = [];
  send(A, { sys: 'forged-by-peer' });
  send(A, { pskin: { qingfeng: 'qf_gold' } });     // sentinel: proves the relay is alive
  const alive = await waitFor(B, m => m && m.pskin);
  const forged = B.msgs.filter(m => m && m.sys === 'forged-by-peer').length;
  check('peer cannot forge a server (sys) message', forged === 0 && !!alive,
        `forged messages delivered=${forged}; relay sentinel delivered=${!!alive}`);
  A.close(); B.close(); await sleep(150);
}

// ---------- 4. claim-a-win-then-leave is not believed ----------
{
  const { A, B } = await room();
  A.msgs = []; B.msgs = [];
  send(A, { mstart: 1 });
  await sleep(150);
  send(A, { report: 'host' });                    // host claims it won
  await sleep(150);
  send(A, { bye: 1 });                            // ...then walks away
  A.close();
  const res = await waitFor(B, m => m && m.sys === 'result', 8000);
  const pass = !!res && res.won === true && res.forfeit === true;
  check('claiming a win then leaving counts as a forfeit loss', pass,
        res ? `survivor told won=${res.won} forfeit=${res.forfeit} (expected won=true forfeit=true)` : 'no result message reached the survivor');
  B.close(); await sleep(150);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${failed.length ? 'FAIL' : 'PASS'}: ${results.length - failed.length}/${results.length} protocol checks`);
process.exit(failed.length ? 1 : 0);
