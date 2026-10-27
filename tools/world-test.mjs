// 江湖共斗 · 开放世界的服务器测试：用假的 WebSocket 跑 cloudflare/worker.bundle.js 里的 WorldLine（不用联网，不用 wrangler）
//   node tools/world-test.mjs
// 查：每线 40 人封顶、满了回 full；打招呼拿到编号和名单；视野外的人不发；伤害按距离和每秒上限封顶；
//     斩够数出妖王、打死后全线播报；服务器重启过会请网页重新打招呼；没人了停表
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import(path.join(root, 'cloudflare', 'worker.bundle.js'));
const { WorldLine } = mod;
const { WorldSim, WL } = globalThis.RenyingWorldSim;

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

class FakeSock {
  constructor() { this.out = []; this.closed = 0; this.att = null; }
  send(s) { if (this.closed) throw new Error('closed'); this.out.push(JSON.parse(s)); }
  close(code) { this.closed = code || 1000; }
  serializeAttachment(o) { this.att = JSON.parse(JSON.stringify(o)); }
  deserializeAttachment() { return this.att; }
  last(t) { for (let i = this.out.length - 1; i >= 0; i--) if (!t || this.out[i].t === t) return this.out[i]; return null; }
}
class FakeCtx {
  constructor() { this.socks = new Set(); }
  acceptWebSocket(s) { this.socks.add(s); }
  getWebSockets() { return [...this.socks].filter(s => !s.closed); }
}
// Worker 里的 WebSocketPair 和 101 响应在 Node 里没有：只在调用 fetch 时换成假的
async function connect(line, ctx, dobj) {
  const sock = new FakeSock();
  const RealResponse = globalThis.Response;
  globalThis.WebSocketPair = function () { return { 0: {}, 1: sock }; };
  globalThis.Response = class { constructor(body, o) { Object.assign(this, o || {}); } };
  try { await dobj.fetch({ url: `https://x/api/world/line/${line}`, headers: new Map([['Upgrade', 'websocket']]) }); }
  finally { globalThis.Response = RealResponse; }
  return sock;
}
const hi = (dobj, s, name, ch = 'qingfeng') => dobj.webSocketMessage(s, JSON.stringify({ t: 'hi', v: '1.0.0', name, ch }));
const st = (dobj, s, x, extra = {}) => dobj.webSocketMessage(s, JSON.stringify({ t: 's', x, y: 0, f: 1, st: 'idle', hp: 100, mh: 100, ...extra }));

// ---------- 一条线：40 人封顶 ----------
{
  const ctx = new FakeCtx(), dobj = new WorldLine(ctx, {});
  const socks = [];
  for (let i = 0; i < WL.CAP; i++) { const s = await connect(3, ctx, dobj); await hi(dobj, s, 'p' + i); socks.push(s); }
  ok(socks.every(s => s.last('w') && s.last('w').line === 3), `前 ${WL.CAP} 人都进了 3 线`);
  const extra = await connect(3, ctx, dobj);
  ok(extra.closed === 4001 && extra.last('full'), '第 41 人收到 full 并被关掉（网页会去下一线）');
  ok(new Set(socks.map(s => s.last('w').id)).size === WL.CAP, '每人编号不同');
  ok(socks[WL.CAP - 1].last('w').roster.length === WL.CAP, '最后进来的人拿到完整名单');
  clearInterval(dobj.timer); dobj.timer = 0;
}

// ---------- 视野、上报、伤害封顶 ----------
{
  const ctx = new FakeCtx(), dobj = new WorldLine(ctx, {});
  const a = await connect(1, ctx, dobj), b = await connect(1, ctx, dobj), c = await connect(1, ctx, dobj);
  await hi(dobj, a, '甲'); await hi(dobj, b, '乙', 'tieshan'); await hi(dobj, c, '丙');
  clearInterval(dobj.timer); dobj.timer = 0;
  await st(dobj, a, 500); await st(dobj, b, 700, { st: 'attack', mv: 'l1', tt: 0.05 }); await st(dobj, c, 7000);
  dobj.tick();
  const fa = a.last('k');
  ok(fa && fa.n === 3, '帧里有本线人数');
  ok(fa.p.length === 1 && fa.p[0][5] === 'attack' && fa.p[0][7] === 'l1', '甲只看到附近的乙，带着乙的动作');
  ok(!fa.p.some(p => p[1] > 5000), '远在魔窟的丙不发给甲');
  ok((fa.e || []).filter(e => e.t === 'j').length === 3, '新来的人广播给大家');
  const sim = dobj.sim;
  sim.mons.length = 0;
  sim.mons.push({ id: 999, key: 'blade', x: 520, y: 0, vx: 0, vy: 0, hp: 5000, mh: 5000, f: 1, cd: 9, wind: 0, act: null, stag: 0, home: 520, ph: 0, zi: 0, dk: 1, spd: 0, keep: 70 });
  sim.mons.push({ id: 998, key: 'blade', x: 3000, y: 0, vx: 0, vy: 0, hp: 50, mh: 50, f: 1, cd: 9, wind: 0, act: null, stag: 0, home: 3000, ph: 0, zi: 1, dk: 1, spd: 0, keep: 70 });
  const aid = a.last('w').id;
  ok(sim.hit(aid, 998, 30) === 0, '离得太远的妖物打不到');
  ok(sim.hit(aid, 999, 9999) === WL.HIT_MAX, `单次伤害封顶 ${WL.HIT_MAX}`);
  let burst = 0; for (let i = 0; i < 20; i++) burst += sim.hit(aid, 999, 150);
  ok(burst <= WL.BURST, `一口气连打封顶在攒着的额度内（${Math.round(burst)} ≤ ${WL.BURST}）`);
  sim.mons.push({ id: 997, key: 'archer', x: 560, y: 0, vx: 0, vy: 0, hp: 300, mh: 300, f: 1, cd: 9, wind: 0, act: null, stag: 0, home: 560, ph: 0, zi: 0, dk: 1, spd: 0, keep: 380 });
  sim.t += 5;   // 额度攒回来
  await dobj.webSocketMessage(a, JSON.stringify({ t: 's', x: 500, hp: 100, mh: 100, h: [[997, 50]] }));
  ok(sim.mons.find(m => m.id === 997).hp === 250, '位置上报里带的伤害会算');
  await st(dobj, a, 1e9, { st: '<script>', hp: -5 });
  const pa = sim.players.get(aid);
  ok(pa.x === WL.W && pa.st === 'idle' && pa.hp === 0, '乱填的位置、动作、血量会被夹住');
}

// ---------- 妖王：斩够数出现，打死全线播报 ----------
{
  const s = new WorldSim(() => 0.5);
  const ids = [s.join({ name: '甲' }), s.join({ name: '乙' })];
  for (const id of ids) s.state(id, { x: 6900, hp: 100, mh: 100 });
  s.sinceBoss = WL.BOSS_EVERY; s.step(0.1);
  ok(!!s.boss && s.boss.mh === 1500 + 600 * 2, '斩够数后魔窟出妖王，血量随人数变');
  ok(s.takeEvents().some(e => e.t === 'bs' && e.all), '妖王现世全线播报');
  for (let k = 0; k < 400 && s.boss; k++) { s.t += 0.5; for (const id of ids) { s.state(id, { x: 6900, hp: 100, mh: 100 }); s.hit(id, s.boss && s.boss.id, 150); } s.step(0.1); }
  const ev = s.takeEvents().find(e => e.t === 'bk');
  ok(!s.boss && ev && ev.top.length === 2, '妖王被打死，输出榜有两人');
  const a = new WorldSim(); const id = a.join({ name: 'x' }); a.state(id, { x: 6900, hp: 100, mh: 100 }); a.sinceBoss = WL.BOSS_EVERY; a.step(0.1);
  for (let k = 0; k < WL.BOSS_LIFE * 10 + 5; k++) { a.players.get(id).seen = a.t; a.step(0.1); }
  ok(!a.boss && a.takeEvents().some(e => e.t === 'bg'), `${WL.BOSS_LIFE} 秒没打死就遁走`);
}

// ---------- 妖物会出招，攻击只发给附近的人 ----------
{
  const s = new WorldSim(() => 0.3);
  const near = s.join({ name: '近' }), far = s.join({ name: '远' });
  s.state(near, { x: 800, hp: 100, mh: 100 }); s.state(far, { x: 7500, hp: 100, mh: 100 });
  s.mons.push({ id: 7, key: 'blade', x: 860, y: 0, vx: 0, vy: 0, hp: 40, mh: 40, f: -1, cd: 0, wind: 0, act: null, stag: 0, home: 860, ph: 0, zi: 0, dk: 1, spd: 150, keep: 70 });
  let atk = null;
  for (let k = 0; k < 20 && !atk; k++) { s.players.get(near).seen = s.players.get(far).seen = s.t; s.step(0.1); atk = s.events.find(e => e.t === 'a' && e.m === 7); }
  ok(atk && atk.k === 'blade', '刀鬼贴身后会挥刀');
  ok(s.wants(near, atk) && !s.wants(far, atk), '挥刀只发给附近的人');
  ok(s.mons.every(m => m.x >= WL.ZONES[m.zi].a && m.x <= WL.ZONES[m.zi].b), '妖物不会追出自己那一段');
}

// ---------- 服务器重启、断线、停表 ----------
{
  const ctx = new FakeCtx(), dobj = new WorldLine(ctx, {});
  const a = await connect(2, ctx, dobj); await hi(dobj, a, '甲');
  clearInterval(dobj.timer); dobj.timer = 0;
  const fresh = new WorldLine(ctx, {});   // 被回收后重新建出来：内存里没有这个人了
  await st(fresh, a, 300);
  ok(a.last().t === 're', '服务器重启过：请网页重新打招呼');
  await hi(fresh, a, '甲');
  ok(a.last('w') && fresh.sim.players.size === 1, '重新打招呼后回到线上');
  clearInterval(fresh.timer); fresh.timer = 0;
  await fresh.webSocketClose(a); a.closed = 1000;
  ok(fresh.sim.players.size === 0, '断线就离开分线');
  fresh.ensureTimer(); fresh.tick();
  ok(fresh.timer === 0, '没人了停表（让 Durable Object 休眠，不计时长）');
  let spam = 0; const b = await connect(2, ctx, fresh); await hi(fresh, b, '乙'); clearInterval(fresh.timer); fresh.timer = 0;
  const bid = b.last('w').id, before = fresh.sim.players.get(bid).seen;
  for (let i = 0; i < 60; i++) { fresh.sim.t += 0.001; await st(fresh, b, 100 + i); }
  spam = fresh.sim.players.get(bid).x;
  ok(spam < 100 + 30 && before >= 0, '一秒内发太多条的多余部分直接丢掉');
}

console.log(fails ? `\n${fails} 项没过` : '\n开放世界服务器测试全部通过');
process.exit(fails ? 1 : 0);
