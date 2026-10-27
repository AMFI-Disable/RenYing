// 江湖共斗 · 开放世界的服务器测试：用假的 WebSocket 跑 cloudflare/worker.bundle.js 里的 WorldLine（不用联网，不用 wrangler）
//   node tools/world-test.mjs
// 全服肉鸽：投票选秘卷全线同步、中途进来的人拿到同一套秘卷、真人不够 3 位打天道车轮战、够了开天道 Boss、Boss 伤害封顶、谁能拿星座皮肤、进度存档
// 查：每线 40 人封顶、满了回 full；打招呼拿到编号和名单；视野外的人不发；伤害按距离和每秒上限封顶；
//     斩够数出妖王、打死后全线播报；服务器重启过会请网页重新打招呼；没人了停表
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import(path.join(root, 'cloudflare', 'worker.bundle.js'));
const { WorldLine } = mod;
const { WorldSim, WL, RG } = globalThis.RenyingWorldSim;
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
  const u = new WorldSim(); u.loadRun({ ...saved, at: Date.now() - RG.EMPTY_RESET - 1000 });
  ok(u.run.cyc === 1 && u.run.perks.length === 0, '空了太久的存档不认，从头开始');
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
  again.emptyAt = Date.now() - RG.EMPTY_RESET - 1;
  await again.webSocketClose(b); b.closed = 1000;
  const c = await connect(5, ctx, again); await hi(again, c, '乙'); clearInterval(again.timer); again.timer = 0;
  ok(again.sim.run.perks.length === 0 && again.sim.run.jie === 1, '整条线空了超过 10 分钟再有人来：从头开始');
}

console.log(fails ? `\n${fails} 项没过` : '\n开放世界服务器测试全部通过');
process.exit(fails ? 1 : 0);
