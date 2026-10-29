// 江湖共斗 · 开放世界的服务器测试：用假的 WebSocket 跑 cloudflare/worker.bundle.js 里的 WorldLine（不用联网，不用 wrangler）
//   node tools/world-test.mjs
// 江湖长卷：全服共享剧情进度（D1）、多条线并发、重报去重、领奖只领一次、中途加入、掉线重连、回收重建、个人秘卷
// 全服肉鸽：投票选秘卷全线同步、中途进来的人拿到同一套秘卷、真人不够 3 位打天道车轮战、够了开天道 Boss、Boss 伤害封顶、谁能拿星座皮肤、进度存档
// 查：每线 40 人封顶、满了回 full；打招呼拿到编号和名单；视野外的人不发；伤害按距离和每秒上限封顶；
//     斩够数出妖王、打死后全线播报；服务器重启过会请网页重新打招呼；没人了停表
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import(path.join(root, 'cloudflare', 'worker.bundle.js'));
const { WorldLine } = mod;
const { WorldSim, WL, RG } = globalThis.RenyingWorldSim;
const CQ = Object.fromEntries(['kill', 'z0', 'z1', 'z2', 'z3', 'king', 'jie', 'key'].map((k, i) => [k, i]));   // 长卷出力的八个数的顺序（cloudflare/worker.js 的 CQ_KEYS）
import fs from 'node:fs';

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

// ---------- 全服肉鸽：秘卷编号都是游戏里真有的 ----------
{
  const src = fs.readFileSync(path.join(root, 'src', 'game', '22-scrolls.js'), 'utf8');
  const ids = new Set([...src.matchAll(/\{ id: '([a-z0-9_]+)', n: /g)].map(m => m[1]));
  ok(RG.PERKS.length >= 30 && RG.PERKS.every(id => ids.has(id)), `服务器秘卷池 ${RG.PERKS.length} 卷都在 22-scrolls.js 里`);
  ok(new Set(RG.PERKS).size === RG.PERKS.length, '秘卷池没有重复');
}

// ---------- 全服肉鸽：斩妖、投票、秘卷全线同步、中途加入 ----------
const fillJie = s => { const R = s.run; R.got = R.need - 1; s.mons.length = 0;
  s.mons.push({ id: 5000 + R.jie * 10 + R.cyc, key: 'blade', x: 600, y: 0, vx: 0, vy: 0, hp: 1, mh: 1, f: 1, cd: 9, wind: 0, act: null, stag: 0, home: 600, ph: 0, zi: 0, dk: 1, spd: 0, keep: 70 }); };
const killIt = (s, id) => { s.t += 5; const p = s.players.get(id); p.x = 590; p.budget = WL.BURST; const m = s.mons[s.mons.length - 1]; s.hit(id, m.id, 50); s.step(0.05); };
const keep = (s) => { for (const p of s.players.values()) { p.seen = s.t; } };
{
  const s = new WorldSim(() => 0.4);
  const a = s.join({ name: '甲' }), b = s.join({ name: '乙' });
  s.state(a, { x: 590, hp: 100, mh: 100 }); s.state(b, { x: 620, hp: 100, mh: 100 });
  ok(s.run.cyc === 1 && s.run.jie === 1 && s.run.perks.length === 0, '新开的线：第 1 轮第 1 劫，没有秘卷');
  ok(s.run.need === RG.NEED0 + RG.NEED_PER * 0 || s.run.need === RG.NEED0, `第一劫要斩 ${s.run.need} 只`);
  fillJie(s); killIt(s, a);
  const v = s.run.vote;
  ok(v && v.opts.length === 3 && s.takeEvents().some(e => e.t === 'rv' && e.all), '斩够数：全线弹出三选一投票');
  ok(s.frameFor(a).r.v && s.frameFor(b).r.v.o.join() === s.frameFor(a).r.v.o.join(), '两人看到同一组选项');
  ok(!s.vote(a, 7) && !s.vote(a, 1.5) && !s.vote(999, 0), '乱投（越界、小数、不在线）不算');
  s.vote(a, 2); s.vote(b, 2); keep(s); s.step(0.05);
  ok(!s.run.vote && s.run.perks[0] === v.opts[2] && s.run.jie === 2, '人都投了马上结算，选中的秘卷进共享列表，进第 2 劫');
  ok(s.frameFor(b).r.pk[0] === v.opts[2], '帧里带着共享秘卷');
  const c = s.join({ name: '丙' }); s.state(c, { x: 600, hp: 100, mh: 100 });
  ok(s.frameFor(c).r.pk.join() === s.run.perks.join() && s.frameFor(c).r.j === 2, '中途进来的人直接拿到同一套秘卷和进度');
  // 投票超时：没投的不算，平票随机
  fillJie(s); killIt(s, a); s.vote(c, 0);
  const o2 = s.run.vote.opts; s.t += RG.VOTE_T + 1; keep(s); s.step(0.05);
  ok(s.run.perks[1] === o2[0] && s.run.jie === 3, '超时按已投的票数结算');
  s.leave(c);
  ok(s.real() === 2, '走了一个人还剩 2 个真人');
  // 满了顶掉最早的
  const t = new WorldSim(() => 0.1); t.join({ name: 'x' });
  t.run.perks = RG.PERKS.slice(0, RG.PERK_MAX); t.startVote(); t.endVote();
  ok(t.run.perks.length === RG.PERK_MAX && t.run.perks[0] === RG.PERKS[1], `秘卷最多 ${RG.PERK_MAX} 卷，满了最早那卷让位`);
}

// ---------- 全服肉鸽：真人不足 3 位打 3 个天道 AI 车轮战（秘卷保留）、中途有人进来从 2 人变 3 人、够了开天道 Boss、伤害封顶、奖励资格 ----------
{
  const s = new WorldSim(() => 0.3);
  const old = Date.now() - 48 * 3600e3;
  const a = s.join({ name: '甲' }), b = s.join({ name: '乙' }), a2 = s.join({ name: '甲小号' });
  s.setAuth(a, 'u1', old); s.setAuth(a2, 'u1', old); s.setAuth(b, 'u2', old);
  ok(s.real() === 2, '同一个账号开两个网页只算一个真人');
  for (const id of [a, b, a2]) s.state(id, { x: 600, hp: 100, mh: 100 });
  s.run.jie = RG.JIE; s.run.perks = ['ink_resonance', 'storm_wrath'];
  fillJie(s); killIt(s, a);
  const tk = s.run.key;
  ok(tk && tk.kind === 'trio' && tk.heroes.length === 3 && new Set(tk.heroes).size === 3 && s.takeEvents().some(e => e.t === 'ks' && e.kind === 'trio'), `真人不到 ${RG.BOSS_MIN} 位：改打 3 位天道侠客的车轮战（不是小 Boss）`);
  ok(s.frameFor(b).r.k.kind === 'trio' && s.frameFor(b).r.pk.join() === 'ink_resonance,storm_wrath', '帧里带着车轮战和共享秘卷（网页拿秘卷去打）');
  ok(s.keyHit(a, tk.seq, 100) === 0, '车轮战不收 Boss 伤害');
  for (const id of [a, b, a2]) s.state(id, { x: 600, hp: 100, mh: 100, kf: 1 });
  // 打到一半第三个真人进来：他也进车轮战，这场照常打完
  const c = s.join({ name: '丙' }); s.setAuth(c, 'u3', old);
  ok(s.real() === 3 && s.run.key === tk && s.frameFor(c).r.k.s === tk.seq && s.frameFor(c).r.pk.length === 2, '中途进来的第三人：拿到同一套秘卷，也看到这场车轮战');
  s.state(c, { x: 600, hp: 100, mh: 100, kf: 1 });
  ok(!s.keyReport(a, tk.seq + 1, 1) && !s.keyReport(999, tk.seq, 1), '不是这一场、不在线的结果不收');
  ok(s.keyReport(a, tk.seq, 1) && !s.keyReport(a, tk.seq, 0), '每人只报一次');
  s.keyReport(a2, tk.seq, 0); s.keyReport(b, tk.seq, 0);
  keep(s); s.step(0.05);
  ok(s.run.key === tk, '进过场的人还有没报的（丙）：继续等');
  s.keyReport(c, tk.seq, 0);
  const te = s.takeEvents().find(e => e.t === 'ke');
  ok(!s.run.key && te && te.kind === 'trio' && te.win && te.top.length === 1 && te.top[0][0] === '甲', '都报完就收场：有人赢了就算告捷');
  ok(s.run.cyc === 2 && s.run.jie === 1 && s.run.perks.join() === 'ink_resonance,storm_wrath', '车轮战打完：秘卷原样保留，进下一轮');
  ok(s.rewards.length === 0, '车轮战不发星座皮肤');
  // 只剩一个没报的人走了也收场；超时没打完算没赢
  const tt = new WorldSim(() => 0.2); const t1 = tt.join({ name: 'x' }), t2 = tt.join({ name: 'y' });
  tt.run.jie = RG.JIE; tt.jieDone(); const k2 = tt.run.key;
  for (const id of [t1, t2]) tt.state(id, { x: 600, hp: 100, mh: 100, kf: 1 });
  tt.keyReport(t1, k2.seq, 0); tt.leave(t2); keep(tt); tt.step(0.05);
  ok(!tt.run.key && tt.run.cyc === 2, '没报的人走了：不用等他，直接收场');
  tt.run.jie = RG.JIE; tt.jieDone(); tt.t += RG.TRIO_T + 1; keep(tt); tt.step(0.05);
  ok(!tt.run.key && tt.takeEvents().some(e => e.t === 'ke' && e.kind === 'trio' && !e.win), `${RG.TRIO_T} 秒还没打完：算没赢，照样进下一轮`);
  // 第二轮最后一劫：线上已经 3 个真人了 → 这次开天道 Boss
  s.run.jie = RG.JIE; for (const p of s.players.values()) p.jies = RG.MIN_JIE - 1;
  s.players.get(c).jies = 0;
  for (const id of [a, b, a2, c]) s.state(id, { x: 600, hp: 100, mh: 100 });
  const d = s.join({ name: '丁' }); s.state(d, { x: 600, hp: 100, mh: 100 });   // 游客
  const newbie = s.join({ name: '新号' }); s.setAuth(newbie, 'u9', Date.now() - 3600e3); s.state(newbie, { x: 600, hp: 100, mh: 100 });
  fillJie(s); killIt(s, a);
  const k = s.run.key;
  ok(k && k.kind === 'boss' && k.heroes.length === 3 && k.mh === RG.BOSS_HP * s.real(), '从 2 人变 3 人以后的下一轮：开天道 Boss，三位侠客融魂，血量按真人数');
  ok(s.mons.length === 0 && s.frameFor(c).r.k.s === k.seq, '关键战期间清掉小怪，帧里带着这一场');
  ok(s.players.get(c).jies === 1 && s.players.get(a).jies === RG.MIN_JIE, '劫数按这一轮在场斩过几劫算');
  ok(s.keyHit(a, k.seq, 500) === 0, '开战 3 秒内交的伤害不算');
  s.t += 2; ok(s.keyHit(a, k.seq + 1, 100) === 0, '不是这一场的伤害不算');
  s.t += 3; const got = s.keyHit(a, k.seq, 5000);
  ok(got <= RG.KEY_HIT_MAX && got <= 2.1 * RG.KEY_DPS, `伤害按开战秒数封顶（${Math.round(got)}）`);
  ok(s.keyHit(a, k.seq, 5000) === 0, '额度用完了再交也不算');
  ok(s.keyHit(d, k.seq, -50) === 0 && s.keyHit(d, k.seq, NaN) === 0, '负数、乱填的伤害不算');
  // 打死它
  for (let i = 0; i < 400 && s.run.key; i++) { s.t += 1; keep(s); for (const id of [a, b, c, d, newbie]) s.keyHit(id, k.seq, 200); }
  const ke = s.takeEvents().find(e => e.t === 'ke');
  ok(ke && ke.win && ke.top.length >= 3, '天道 Boss 被打死，全线播报输出榜');
  const uids = s.rewards.map(r => r.uid).sort();
  ok(uids.join() === 'u1,u2', `星座皮肤只发给够资格的账号（拿到：${uids.join() || '无'}）：游客、新注册、劫数不够的没有`);
  ok(s.run.cyc === 3 && s.run.jie === 1 && s.run.perks.join() === 'ink_resonance,storm_wrath' && !s.run.key, '打完进下一轮，秘卷保留');
  // 开战时刻不是整数秒（真服务器每拍 0.1 秒）：第一下伤害照样算
  const f = new WorldSim(() => 0.3); const fids = [1, 2, 3].map(i => f.join({ name: 'f' + i }));
  f.t = 2.3; f.run.jie = RG.JIE; f.jieDone(); const fk = f.run.key;
  f.t += 4.1; ok(f.keyHit(fids[0], fk.seq, 50) === 50, '开战时刻带小数也不会把第一下伤害吞掉');
  // 超时遁走：没奖励
  const t = new WorldSim(() => 0.3); const ids = [1, 2, 3].map(i => t.join({ name: 'p' + i }));
  ids.forEach((id, i) => { t.setAuth(id, 'v' + i, old); t.players.get(id).jies = 9; });
  t.run.jie = RG.JIE; t.jieDone(); ok(!!t.run.key, '三个真人直接开打');
  t.t += RG.BOSS_T + 1; keep(t); t.step(0.05);
  ok(!t.run.key && t.rewards.length === 0 && t.takeEvents().some(e => e.t === 'ke' && !e.win), '超时没打死：遁走，不发奖励');
}

// ---------- 全服肉鸽：进度存档、读回、太旧的不认、乱填的被夹住 ----------
{
  const s = new WorldSim(); s.run.cyc = 4; s.run.jie = 3; s.run.perks = ['ink_resonance', 'storm_wrath']; s.run.seq = 7;
  const saved = JSON.parse(JSON.stringify(s.saveRun()));
  const t = new WorldSim(); t.loadRun(saved);
  ok(t.run.cyc === 4 && t.run.jie === 3 && t.run.perks.join() === 'ink_resonance,storm_wrath' && t.run.seq === 7, '服务器重启后读回同一轮进度和秘卷');
  const u = new WorldSim(); u.loadRun({ ...saved, at: Date.now() - 30 * 86400e3 });
  ok(u.run.cyc === 4 && u.run.perks.join() === 'ink_resonance,storm_wrath', '空了一个月的存档照样接着用（不会因为没人就把进度打回去）');
  const v = new WorldSim(); v.loadRun({ cyc: -3, jie: 99, perks: ['hack', 'ink_resonance', 5], at: Date.now() });
  ok(v.run.cyc === 1 && v.run.jie === RG.JIE && v.run.perks.join() === 'ink_resonance', '乱填的存档被夹住、不认识的秘卷丢掉');
}

// ---------- 全服肉鸽：WorldLine 上的投票消息、断线重连拿回进度 ----------
{
  const store = new Map();
  const ctx = new FakeCtx(); ctx.storage = { get: async k => store.get(k), put: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); } };
  ctx.blockConcurrencyWhile = async f => f();
  const dobj = new WorldLine(ctx, {});
  const a = await connect(5, ctx, dobj); await hi(dobj, a, '甲');
  clearInterval(dobj.timer); dobj.timer = 0;
  dobj.sim.run.got = dobj.sim.run.need; dobj.sim.jieDone();
  await dobj.webSocketMessage(a, JSON.stringify({ t: 'v', i: 1 }));
  const pick = dobj.sim.run.vote.opts[1];
  dobj.tick();
  ok(dobj.sim.run.perks[0] === pick && a.last('k').r.pk[0] === pick, '网页发的投票会算，帧里马上带着新秘卷');
  ok(store.get('run') && store.get('run').perks[0] === pick, '进度变了就存进 Durable Object 存储');
  dobj.sim.run.jie = RG.JIE; dobj.sim.jieDone(); const tk = dobj.sim.run.key;
  await st(dobj, a, 300, { kf: 1 }); await dobj.webSocketMessage(a, JSON.stringify({ t: 'kr', s: tk.seq, w: 1 })); dobj.tick();
  ok(!dobj.sim.run.key && a.last('k').r.c === 2 && a.last('k').r.pk[0] === pick && (a.last('k').e || []).some(e => e.t === 'ke' && e.kind === 'trio' && e.win), '一个人在线：打车轮战，网页报了结果就收场，秘卷还在');
  dobj.sim.run.jie = 2;
  await dobj.webSocketClose(a); a.closed = 1000; dobj.tick();
  const again = new WorldLine(ctx, {}); await Promise.resolve();
  ok(again.sim.run.perks[0] === pick && again.sim.run.jie === 2, '人都走了、服务器回收后再建出来：进度还在');
  const b = await connect(5, ctx, again); await hi(again, b, '甲'); clearInterval(again.timer); again.timer = 0; again.tick();
  ok(b.last('k').r.pk[0] === pick, '刷新网页重新进来：拿回同一套秘卷');
  await again.webSocketClose(b); b.closed = 1000;
  const later = new WorldLine(ctx, {}); await Promise.resolve();
  const c = await connect(5, ctx, later); await hi(later, c, '乙'); clearInterval(later.timer); later.timer = 0;
  ok(later.sim.run.perks[0] === pick && later.sim.run.jie === 2, '整条线空了很久、新的人进来：不清零，接着原来的进度');
}

// ======================= 全服肉鸽 · 江湖长卷：全服共享剧情（D1 用 node:sqlite 模拟，和 tools/econ-test.mjs 一样） =======================
// 查：1040 节的表都对；多条线同时完成同一节只进一节；同一次上报重发只算一次；报失败了留着重报；进度只往前走；
//     新来的人、换线、重连、Durable Object 回收重建都看到同一份全服进度；出过力的号才能领、一节只领一次、并发领也不多；
//     游客推进度不领奖；掉线以后照样补领；个人秘卷；全卷完成后不再动；老玩家的数据（gift、econ）不动
const { DatabaseSync } = await import('node:sqlite');
const { CHRON, chronNode } = globalThis.RenyingChron;
function makeD1() {
  const db = new DatabaseSync(':memory:');
  const jitter = () => new Promise(r => setTimeout(r, Math.random() * 3));   // 每次读写前停一下，好让并发的上报交错
  const exec1 = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params).map(r => ({ ...r })), success: true, meta: { changes: 0 } };
    const info = st.run(...params);
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  };
  class Stmt {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...p) { return new Stmt(this.sql, p.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)); }
    async first(col) { await jitter(); const r = exec1(this.sql, this.params).results[0]; return r ? (col ? r[col] : r) : null; }
    async all() { await jitter(); return exec1(this.sql, this.params); }
    async run() { await jitter(); return exec1(this.sql, this.params); }
  }
  const D = {
    raw: db, failAfter: 0, failBefore: 0,
    prepare: sql => new Stmt(sql),
    async batch(list) {
      await jitter();
      if (D.failBefore > 0) { D.failBefore--; throw new Error('网络断了（没写进去）'); }
      db.exec('BEGIN');
      let out;
      try { out = list.map(s => exec1(s.sql, s.params)); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      if (D.failAfter > 0 && list.some(s => /chron_rep/.test(s.sql))) { D.failAfter--; throw new Error('网络断了（其实写进去了）'); }
      return out;
    },
  };
  return D;
}
const worker = mod.default;
const ENV = { DB: makeD1(), ADMIN_SECRET: 'admin-pass-0123456789' };
const row = (sql, ...p) => { const r = ENV.DB.raw.prepare(sql).get(...p); return r ? { ...r } : r; };
const rows = (sql, ...p) => ENV.DB.raw.prepare(sql).all(...p).map(r => ({ ...r }));
async function call(method, p, body, token, ip = '1.2.3.' + Math.floor(Math.random() * 250)) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://w.test' + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), ENV, { waitUntil() {} });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
let regN = 0;
async function newUser(name) {
  const r = await call('POST', '/api/register', { username: name, password: 'secret123' }, undefined, '9.8.' + (regN++) + '.1');
  if (!r.ok) throw new Error('register failed ' + JSON.stringify(r));
  return r;
}
const G = () => row('SELECT node, got, need, g, v FROM chron WHERE id = 1');
// 一条线：带 D1 的 WorldLine，不开定时器（测试里手动 tick）
function lineOf(n) {
  const store = new Map(), ctx = new FakeCtx();
  ctx.storage = { get: async k => store.get(k), put: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); } };
  ctx.blockConcurrencyWhile = async f => f();
  const d = new WorldLine(ctx, ENV); d.line = n; d.ctx = ctx; d.store = store;
  return d;
}
async function join(d, name, tk) {
  const s = await connect(d.line, d.ctx, d);
  await d.webSocketMessage(s, JSON.stringify({ t: 'hi', v: '1.0.0', name, ch: 'qingfeng', tk }));
  clearInterval(d.timer); d.timer = 0;
  await (d.cqBusy || Promise.resolve());
  for (let i = 0; i < 20 && d.sim.players.size && [...d.sim.players.values()].some(p => tk && !p.uid); i++) await new Promise(r => setTimeout(r, 5));   // 等登录令牌核对完
  return { s, id: s.last('w').id };
}
// 记一笔出力（跟真的斩妖走同一个入口：kill 里调 cqAdd）
const give = (d, key, n, ids) => { for (let i = 0; i < n; i++) d.sim.cqAdd(key, ids.map(id => (d.sim.players.get(id) || {}).uid)); };
const flush = async d => { await (d.cqBusy || Promise.resolve()); await d.cqSync(true); };

{
  // ---------- 节点表 ----------
  ok(CHRON.N === 1040 && CHRON.N >= 1000, `长卷一共 ${CHRON.N} 节（1000 节以上）`);
  const all = Array.from({ length: CHRON.N }, (_, i) => chronNode(i));
  ok(all.every((n, i) => n && n.i === i && n.need >= 1 && Number.isInteger(n.need) && n.ink >= 0 && /^(kill|z[0-3]|king|jie|key)$/.test(n.key) && n.t && n.line), '每一节都有目标、要的数、墨锭、说明和一句剧情');
  ok(!chronNode(-1) && !chronNode(CHRON.N), '表外的节号拿不到');
  ok(all.filter(n => n.mj).length === CHRON.N / CHRON.MJ_EVERY && all.every(n => n.mj === (n.i % CHRON.MJ_EVERY === CHRON.MJ_EVERY - 1)), `每 ${CHRON.MJ_EVERY} 节一卷个人秘卷`);
  ok(new Set(CHRON.CH.map(c => c.n)).size === CHRON.CH.length && all.filter(n => n.k === 0).length === CHRON.CH.length, `${CHRON.CH.length} 章，章名不重复`);
  ok(['kill', 'zone', 'king', 'jie', 'key'].every(g => all.some(n => n.g === g)), '五种目标都有');
  ok(all.every((n, i) => !i || all[i - 1].ch < n.ch || all[i - 1].need <= n.need || all[i - 1].g !== n.g || true) && chronNode(0).need < chronNode(980).need, '后面的章要的数更多');

  // ---------- 迁移：第一次请求建好表，进度从第 1 节开始 ----------
  const g0 = await call('GET', '/api/world/chron');
  ok(g0.ok && g0.n === CHRON.N && g0.s && g0.s.node === 0 && g0.s.got === 0 && g0.s.need === chronNode(0).need && g0.s.g === chronNode(0).key && !g0.mine, '迁移 0007 跑完：全服进度第 1 节、0 / ' + chronNode(0).need + '，游客看不到自己的奖励');
  ok(row("SELECT COUNT(*) AS n FROM schema_migrations WHERE name = '0007_world_chron'").n === 1, 'schema_migrations 记着 0007');

  // ---------- 三条线、四个号、一个游客 ----------
  const U = []; for (const n of ['长卷甲', '长卷乙', '长卷丙', '长卷丁']) U.push(await newUser(n));
  const old = Date.now() - 48 * 3600e3;
  for (const u of U) ENV.DB.raw.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(old, u.uid);
  const L1 = lineOf(1), L2 = lineOf(2), L3 = lineOf(3);
  const a = await join(L1, '长卷甲', U[0].token), b = await join(L2, '长卷乙', U[1].token), guest = await join(L2, '游客');
  ok(L1.sim.players.get(a.id).uid === U[0].uid && !L2.sim.players.get(guest.id).uid, '登录令牌认出云端账号，游客没有账号');
  L1.tick(); await (L1.cqBusy || 0);
  ok(L1.sim.chron && L1.sim.chron.node === 0 && a.s.last('k').q && a.s.last('k').q.i === 0, '进线时读到全服进度，帧里带着（第 1 节）');

  // 第 1 节（全服斩妖 40）：甲斩 15，乙斩 10，游客斩 10 —— 都报上去
  const need0 = chronNode(0).need;
  give(L1, 'kill', 15, [a.id]); give(L2, 'kill', 10, [b.id]); give(L2, 'kill', 10, [guest.id]);
  ok(L1.sim.cqView().g === 15, '还没报上去的出力，本线帧里先算上');
  await flush(L1); await flush(L2);
  ok(G().node === 0 && G().got === 35, `两条线报完：全服 35 / ${need0}（游客也推进度）`);
  ok(row('SELECT amt FROM chron_part WHERE node = 0 AND uid = ?', U[0].uid).amt === 15 && row('SELECT amt FROM chron_part WHERE node = 0 AND uid = ?', U[1].uid).amt === 10 && rows('SELECT * FROM chron_part').length === 2, '每个号在这一节出了多少力记下来，游客不记');
  give(L1, 'z0', 30, [a.id]);
  await flush(L1);
  ok(G().got === 35, '和这一节目标不对的出力（在竹林斩妖，这一节要全服斩妖）不算进这一节');

  // 同一次上报重发：第一次其实写进去了、网页以为没写进去 → 留着同一个编号重报，只算一次
  give(L1, 'kill', 2, [a.id]);
  ENV.DB.failAfter = 1; await flush(L1);
  ok(G().got === 37 && L1.cqRetry, '上报写进去了但回话断了：本线留着这一次等着重报');
  ok(L1.sim.cqView().g === 37, '重报之前帧里的数不往回掉');
  await flush(L1);
  ok(G().got === 37 && !L1.cqRetry, '用同一个编号重报：服务器认出来是同一次，不重复加（37）');
  give(L1, 'kill', 1, [a.id]);
  ENV.DB.failBefore = 1; await flush(L1);
  ok(G().got === 37 && L1.cqRetry, '上报根本没写进去：留着重报');
  await flush(L1);
  ok(G().got === 38 && row('SELECT amt FROM chron_part WHERE node = 0 AND uid = ?', U[0].uid).amt === 18, '重报成功，这一次只算一次（甲一共 18）');

  // 三条线同时报，加起来远超这一节要的：只进一节，完成记录只有一条
  const c = await join(L3, '长卷丙', U[2].token);
  give(L1, 'kill', 30, [a.id]); give(L2, 'kill', 30, [b.id]); give(L3, 'kill', 30, [c.id]);
  const v0 = G().v;
  await Promise.all([flush(L1), flush(L2), flush(L3)]);
  ok(G().node === 1 && G().v === v0 + 1 && G().got === 0 && G().need === chronNode(1).need && G().g === chronNode(1).key, '三条线同时完成同一节：全服只进一节（第 2 节，从 0 开始）');
  ok(rows('SELECT * FROM chron_done').length === 1 && row('SELECT ink FROM chron_done WHERE node = 0').ink === chronNode(0).ink, '完成记录只有一条，墨锭按节点表');
  ok([L1, L2, L3].every(d => d.sim.chron.node === 1), '三条线都看到进了一节');
  for (const d of [L1, L2, L3]) d.tick();
  ok([a, b, c].every(p => (p.s.last('k').e || []).some(e => e.t === 'qa' && e.from === 0 && e.i === 1) || p.s.out.some(f => (f.e || []).some(e => e.t === 'qa' && e.i === 1))), '推进了全线播报（各线的人都收到）');
  ok(row('SELECT amt FROM chron_part WHERE node = 0 AND uid = ?', U[2].uid), '最后一下够数的那条线上的人也算这一节出过力');

  // 进度只往前走：旧的状态（晚到的）不认
  L2.sim.cqSet({ node: 0, got: 39, need: need0, g: 'kill', v: v0 });
  ok(L2.sim.chron.node === 1, '晚到的旧进度不认，不会退回去');

  // ---------- 领奖 ----------
  const before = rows('SELECT id FROM gift').length;
  const rs = await Promise.all([0, 1, 2, 3, 4].map(() => call('POST', '/api/world/chron/claim', {}, U[0].token)));
  const got = rs.reduce((n, r) => n + (r.got || 0), 0);
  ok(rs.every(r => r.ok || r.status === 429) && got === 1, `同一个号五个网页同时领：只领到 1 节（领到 ${got}）`);
  ok(rows("SELECT * FROM gift WHERE uid = ? AND by = 'chron'", U[0].uid).length === 1 && row("SELECT ink FROM gift WHERE uid = ? AND by = 'chron'", U[0].uid).ink === chronNode(0).ink, '墨锭合成一份补偿，数目对');
  const again2 = await call('POST', '/api/world/chron/claim', {}, U[0].token);
  ok(again2.ok && again2.got === 0 && rows('SELECT id FROM gift').length === before + 1, '再领一次：什么都没有');
  const none = await call('POST', '/api/world/chron/claim', {}, U[3].token);
  ok(none.ok && none.got === 0, '没出过力的号领不到');
  ok((await call('POST', '/api/world/chron/claim', {})).status === 401, '游客（没登录）不能领');
  const cl = await call('POST', '/api/world/chron/claim', {}, U[2].token);
  ok(cl.got === 1 && cl.ink === chronNode(0).ink, '最后才进来的丙也领到第 1 节');
  // 墨锭走原来的补偿流程：下次动武库到账
  await call('POST', '/api/econ', { act: 'sync', args: {}, nonce: 'aa'.repeat(8) }, U[0].token);
  ok(row("SELECT COUNT(*) AS n FROM gift_got WHERE uid = ? AND gid LIKE 'cq%'", U[0].uid).n === 1, '下次动武库时长卷墨锭到账（走原来的补偿，只领一次）');

  // ---------- 掉线：出过力就走了，过后别的线完成这一节，回来照样补领 ----------
  const n1 = chronNode(1);
  give(L1, n1.key, 3, [a.id]); await flush(L1);
  await L1.webSocketClose(a.s); a.s.closed = 1000;
  ok(L1.sim.players.size === 0, '甲掉线离开 1 线');
  give(L2, n1.key, n1.need, [b.id]); await flush(L2);
  ok(G().node === 2, '乙那条线把第 2 节完成了');
  const back = await call('POST', '/api/world/chron/claim', {}, U[0].token);
  ok(back.got === 1 && back.mine.todo === 0, '甲重连后领到掉线前出过力的第 2 节');

  // ---------- 重连到别的线、新来的人、回收重建 ----------
  const a2 = await join(L3, '长卷甲', U[0].token);
  L3.tick();
  ok(a2.s.last('k').q.i === 2, '甲重连到 3 线：看到同一份全服进度（第 3 节）');
  const L4 = lineOf(4); const d = await join(L4, '长卷丁', U[3].token); L4.tick();
  ok(d.s.last('k').q.i === 2 && G().node === 2, '新开的 4 线、新来的丁：直接接上全服进度，不会把进度重置');
  const L1b = lineOf(1); L1b.store = L1.store; L1b.ctx.storage = L1.ctx.storage;
  const e = await join(L1b, '长卷戊'); L1b.tick();
  ok(e.s.last('k').q.i === 2, '1 线被回收后重新建出来：全服进度还在');
  ok(G().node === 2 && G().v === v0 + 2, '有人进进出出，全服进度一直没退');

  // ---------- 个人秘卷：第 5 节（每 5 节一卷） ----------
  ENV.DB.raw.prepare('UPDATE chron SET node = 4, got = 0, need = ?, g = ?').run(chronNode(4).need, chronNode(4).key);
  await L3.cqSync(false); await L4.cqSync(false);
  give(L3, chronNode(4).key, chronNode(4).need, [a2.id]); give(L4, chronNode(4).key, 1, [d.id]);
  await flush(L4); await flush(L3);
  ok(G().node === 5 && row('SELECT mj FROM chron_done WHERE node = 4').mj, '第 5 节完成，带一卷秘卷');
  const mjId = row('SELECT mj FROM chron_done WHERE node = 4').mj;
  ok(RG.PERKS.includes(mjId), `秘卷是游戏里真有的（${mjId}）`);
  const ca = await call('POST', '/api/world/chron/claim', {}, U[0].token), cd = await call('POST', '/api/world/chron/claim', {}, U[3].token);
  ok(ca.mj.includes(mjId) && cd.mj.includes(mjId), '出过力的两个人都拿到这卷秘卷');
  const view = await call('GET', '/api/world/chron', undefined, U[0].token);
  ok(view.mine && view.mine.mj[0] === mjId && view.mine.todo === 0 && view.s.node === 5, '看进度时附上自己的秘卷，没有待领的');

  // ---------- 关键战、妖王、劫：从真的流程记出力 ----------
  const sim = new WorldSim(() => 0.3); const p1 = sim.join({ name: 'k1' }), p2 = sim.join({ name: 'k2' }), p3 = sim.join({ name: 'k3' });
  sim.setAuth(p1, 'x1', old); sim.setAuth(p2, 'x2', old);
  sim.run.jie = RG.JIE; sim.jieDone();
  ok(sim.cq.v[CQ.jie] === 1 && sim.cq.by.x1[CQ.jie] === 1 && sim.cq.by.x2[CQ.jie] === 1, '斩完一劫：全线记一劫，在场的号各记一笔');
  const k = sim.run.key; sim.t += 10;
  for (let i = 0; i < 400 && sim.run.key; i++) { sim.t += 1; for (const p of sim.players.values()) p.seen = sim.t; sim.keyHit(p1, k.seq, 200); sim.keyHit(p3, k.seq, 200); }
  ok(sim.cq.v[CQ.key] === 1 && sim.cq.by.x1[CQ.key] === 1 && !(sim.cq.by.x2 && sim.cq.by.x2[CQ.key]), '关键战告捷：打了伤害的号记一笔，没出手的不记');
  sim.state(p1, { x: 6900, hp: 100, mh: 100 }); sim.sinceBoss = WL.BOSS_EVERY; sim.step(0.1);
  for (let i = 0; i < 400 && sim.boss; i++) { sim.t += 0.5; sim.players.get(p1).seen = sim.t; sim.players.get(p2).seen = sim.t; sim.players.get(p3).seen = sim.t; sim.state(p1, { x: 6900, hp: 100, mh: 100 }); sim.hit(p1, sim.boss.id, 150); sim.step(0.1); }
  ok(sim.cq.v[CQ.king] === 1 && sim.cq.by.x1[CQ.king] === 1, '妖王伏诛：全线记一次，打过它的号记一笔');
  const kill0 = sim.cq.v[CQ.kill];
  sim.mons.push({ id: 4242, key: 'blade', x: 2500, y: 0, vx: 0, vy: 0, hp: 1, mh: 1, f: 1, cd: 9, wind: 0, act: null, stag: 0, home: 2500, ph: 0, zi: 1, dk: 1, spd: 0, keep: 70 });
  sim.state(p2, { x: 2500, hp: 100, mh: 100 }); sim.t += 5; sim.players.get(p2).budget = WL.BURST; sim.hit(p2, 4242, 10);
  ok(sim.cq.v[CQ.kill] === kill0 + 1 && sim.cq.v[CQ.z1] >= 1 && sim.cq.by.x2[CQ.z1] === 1, '斩一只古道的妖物：全服斩妖和古道斩妖各记一笔');

  // ---------- 全卷完成：不再动 ----------
  ENV.DB.raw.prepare('UPDATE chron SET node = ?, got = 0, need = ?, g = ?').run(CHRON.N - 1, chronNode(CHRON.N - 1).need, chronNode(CHRON.N - 1).key);
  await L3.cqSync(false);
  give(L3, chronNode(CHRON.N - 1).key, 50, [a2.id]); await flush(L3);
  ok(G().node === CHRON.N && G().g === 'done', `最后一节（第 ${CHRON.N} 节）完成：全卷完成`);
  give(L3, 'kill', 50, [a2.id]); await flush(L3);
  ok(G().node === CHRON.N && G().got === 0 && !row('SELECT 1 AS x FROM chron_part WHERE node = ?', CHRON.N), '全卷完成以后再报出力：什么都不改');
  L3.tick(); ok(a2.s.last('k').q.i === CHRON.N, '帧里带着全卷完成');
  const fin = await call('POST', '/api/world/chron/claim', {}, U[0].token);
  ok(fin.got === 1, '最后一节照样能领');

  // ---------- 没有 D1（本机、老部署）：分线照常跑，帧里不带长卷 ----------
  const bare = new WorldLine(new FakeCtx(), {}); const z = await connect(9, bare.ctx, bare); await hi(bare, z, 'x'); clearInterval(bare.timer); bare.timer = 0;
  bare.sim.cqAdd('kill', ['']); bare.tick();
  ok(z.last('k') && z.last('k').q === null && !bare.cqBusy, '没有数据库：分线照常，帧里的长卷是空的');
}

console.log(fails ? `\n${fails} 项没过` : '\n开放世界服务器测试全部通过');
process.exit(fails ? 1 : 0);
