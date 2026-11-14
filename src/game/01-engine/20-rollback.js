// ======================= 回滚联机（v2.6） =======================
// 两边都完整计算对战，每帧只交换按键。对方的按键没到就先猜“他还按着之前的键”，
// 真实按键到了发现猜错，就读出那一帧的存档，用正确的按键瞬间重算到现在。
const ROLL = { on: false, F: 0, D: 3, N: 240, MAXP: 40, snaps: [], loc: [], rem: [], used: [], remChg: {}, remLast: -1,
  lastRemH: 0, lastSentH: 0, locMax: -1, pend: Infinity, out: [], peerAdv: 0, skipT: 0, stall: 0, ckOut: null, ended: false,
  rollbacks: 0, rbFrames: 0, desyncs: 0, ctrls: null };
const EMPTY_IN = { h: 0, p: [] };
// 只影响画面的字段不进存档
const F_SKIP = new Set(['ch', 'moves', 'look', 'ctrl', 'trail', 'scarf', 'j', 'sk', 'move', 'ghosts', 'ghostT', 'lagHp', 'lagDelay', 'flash', 'walkPh', 'vox', 'voy', 'snap', 'rot', 'skinKey', 'target', 'flurryVictim']);
for (const k of Object.keys(SFX)) { const fn = SFX[k]; SFX[k] = (...a) => (RESIM ? undefined : fn(...a)); }
{ const m0 = metal; metal = (...a) => (RESIM ? undefined : m0(...a)); }
function fastClone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const len = v.length, out = new Array(len);
    for (let i = 0; i < len; i++) { const item = v[i]; out[i] = (item && typeof item === 'object') ? fastClone(item) : item; }
    return out;
  }
  const out = {};
  for (const k in v) { const val = v[k]; out[k] = (val && typeof val === 'object') ? fastClone(val) : val; }
  return out;
}
const jclone = v => fastClone(v);
function capF(f) {
  const o = {};
  for (const k in f) { if (F_SKIP.has(k)) continue; const v = f[k]; if (typeof v === 'function') continue; o[k] = v && typeof v === 'object' ? jclone(v) : v; }
  o.hasMove = !!f.move;
  o.tgt = f.target ? f.target.idx : -1;   // 2v2 锁定的目标会影响打谁，也得存（存成序号）
  return o;
}
function resF(f, o) {
  if (o.chIdx !== undefined && o.chIdx !== f.chIdx) f.setChar(o.chIdx);   // 回滚跨过了换人：先换回当时的角色
  for (const k in f) if (!F_SKIP.has(k) && !(k in o)) delete f[k];
  for (const k in o) { if (k === 'hasMove' || k === 'tgt') continue; const v = o[k]; f[k] = v && typeof v === 'object' ? jclone(v) : v; }
  f.move = o.hasMove && f.moveName ? f.moves[f.moveName] : null;
  f.target = o.tgt >= 0 ? fighterByIdx(o.tgt) : null;
}
// 电脑侠客的“脑子”也得进存档（2v2 联机里有电脑）：回滚重算时它得想出和第一次一模一样的招
// 它记着的人和飞行道具按序号存（不然存档会把整个对手连同对手的脑子一起拷一遍，还会绕圈），对位图的数字表照原样拷
const BRAIN_SKIP = new Set(['c', 'me', 'foe', 'L', 'debug', 'geneOverride']);
function brainOut(v) {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Fighter) return { __f: v.idx };
  if (v.isProj) return { __p: v.id };
  if (ArrayBuffer.isView(v)) return { __ta: Array.from(v) };
  if (Array.isArray(v)) return v.map(brainOut);
  const o = {}; for (const k in v) if (typeof v[k] !== 'function') o[k] = brainOut(v[k]); return o;
}
function brainIn(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(brainIn);
  if ('__f' in v) return fighterByIdx(v.__f);
  if ('__p' in v) return projs.find(q => q.id === v.__p) || { isProj: true, id: v.__p, gone: true };   // 那颗已经没了：留个同编号的空壳，谁都不等于它
  if ('__ta' in v) return Float32Array.from(v.__ta);
  const o = {}; for (const k in v) o[k] = brainIn(v[k]); return o;
}
function capBrain(br) {
  const o = {};
  for (const k in br) { if (BRAIN_SKIP.has(k) || typeof br[k] === 'function') continue; o[k] = brainOut(br[k]); }
  return o;
}
function resBrain(br, o) {
  for (const k in br) if (!BRAIN_SKIP.has(k) && typeof br[k] !== 'function' && !(k in o)) delete br[k];
  for (const k in o) { const v = brainIn(o[k]); if (k === 'model') Object.assign(br.model, v); else br[k] = v; }
}
function capC(c) { const o = { h: { ...c.held }, b: { ...c.buf }, a: c.atkT }; if (c.brain) o.br = capBrain(c.brain); return o; }
function resC(c, o) { c.held = { ...o.h }; c.buf = { ...o.b }; c.atkT = o.a; if (c.brain && o.br) resBrain(c.brain, o.br); }
// 2v2 联机时场上四个人、擂台机关都要进存档，1v1 只存两个人
function capState() {
  const fs = allFighters();
  const st = { clock, hitstop, superFreeze, so: superOwner ? superOwner.idx : -1, projSeq, rng: GRNG.s,
    f: fs.map(capF), projs: jclone(projs), decoys: jclone(decoys), M: jclone(M), c: fs.map(f => capC(f.ctrl)) };
  if (fs.length > 2) { const { scars, ...arena } = ARENA2V2; st.arena = jclone(arena); }   // 地上焦痕只是画面（颜色跟着各自看到的皮肤）
  return st;
}
function restState(st) {
  clock = st.clock; hitstop = st.hitstop; superFreeze = st.superFreeze; superOwner = st.so >= 0 ? fighterByIdx(st.so) : null;
  projSeq = st.projSeq; GRNG.s = st.rng;
  st.f.forEach((o, i) => resF(fighterByIdx(i), o));
  projs.length = 0; for (const q of jclone(st.projs)) projs.push(q);
  decoys.length = 0; for (const q of jclone(st.decoys)) decoys.push(q);
  for (const k of Object.keys(M)) delete M[k]; Object.assign(M, jclone(st.M));
  st.c.forEach((o, i) => resC(fighterByIdx(i).ctrl, o));
  if (st.arena) Object.assign(ARENA2V2, jclone(st.arena));
  if (isRaid()) raidBossSkills();
}
function hashState(st) {
  // sk 是画面上的骨架（残影里也带着），不算。键按名字排好再算：回滚时 resF 会删掉再补回字段，
  // 同一个状态在回滚过的一边和没回滚的一边键的先后不一样，不排序的话两边算出来不同，会被当成不同步
  const txt = JSON.stringify(st, (k, v) => k === 'sk' ? undefined : typeof v === 'number' ? Math.round(v * 1000) / 1000
    : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(q => [q, v[q]])) : v);
  let h = 2166136261; for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function inBits(h) { return (h.left ? 1 : 0) | (h.right ? 2 : 0) | (h.down ? 4 : 0) | (h.atk ? 8 : 0) | (h.jump ? 16 : 0) | (h.aim < 0 ? 32 : 0) | (h.aim ? 64 : 0); }
function applyInput(c, inp) {
  const was = c.held.atk, b = inp.h;
  c.held.left = !!(b & 1); c.held.right = !!(b & 2); c.held.down = !!(b & 4); c.held.atk = !!(b & 8); c.held.jump = !!(b & 16);
  c.held.aim = (b & 64) ? ((b & 32) ? -1 : 1) : 0;
  if (c.held.atk && !was) c.atkT = clock;
  for (const a of inp.p) {
    if (a === 'skill2' && c.held.atk) { c.atkT = clock + 1e6; delete c.buf.light; }
    c.press(a);
  }
}
// 每台电脑操控哪几个人（fighter 序号）：[房主, 加入的人]。四人切磋一台电脑两个人（1P 键位和 2P 键位）
function netSlots() { return roomDef().slots.map(s => s.slice()); }
// 一帧的按键里拆出第 k 个人的：按住的键每人 8 位，按下的键第二个人带前缀 "2"
function slotInput(inp, k) {
  if (!k) return inp.p.some(a => a[0] === '2') ? { h: inp.h & 255, p: inp.p.filter(a => a[0] !== '2') } : (inp.h > 255 ? { h: inp.h & 255, p: inp.p } : inp);
  return { h: (inp.h >> 8) & 255, p: inp.p.filter(a => a[0] === '2').map(a => a.slice(1)) };
}
function localInput() {
  let h = inBits(human[0].held), pr = NET.presses.splice(0);
  if (ROLL.slots && ROLL.slots[NET.role === 'client' ? 1 : 0].length > 1) {
    h |= inBits(human[1].held) << 8;
    pr = pr.concat(NET.presses2.splice(0).map(a => '2' + a));
  } else NET.presses2.length = 0;
  return { h, p: pr };
}
function rollStart(ch, seed, duo, mv, map, mut, competitiveScrolls = null, loadouts = null) {
  if (typeof currentScreen !== 'undefined' && (currentScreen === 'buffDraft' || currentScreen === 'mapBriefing')) showScreen(null);   // 加入方：房主开打时收起通览和密卷页
  refocusGame();
  setChars(ch[0], ch[1]);
  if (ch && ch.length >= 4) { C.setChar(ch[2]); D.setChar(ch[3]); }
  setupNetMatch();
  M.combatLoadouts = Array.isArray(loadouts) ? loadouts : [combatLoadoutMap(), NET.peerLoadout || {}];
  M.competitiveScrolls = competitiveScrolls && typeof competitiveScrolls === 'object' ? competitiveScrolls : null;
  M.hasBuffs = !!(M.competitiveScrolls && Object.values(M.competitiveScrolls).some(team => Object.keys(team || {}).length));
  M.teamMutator = !NET.isRanked && ['normal', 'pp_cc', 'pp_pp'].includes(netRoomMode) && ['chaos', 'mayhem'].includes(mut) ? mut : 'normal';
  // 山河异境：房主在点将台上选好的图随开局发来（map）；同阵容再战没有点将台，就按两边的票和种子选
  if (MAPS[map]) M.map = map;
  else if (Array.isArray(mv) || roomDef().rule === 'maps') M.map = mapPick(mv, mapSeedRand(seed));
  if (Array.isArray(duo) && Array.isArray(duo[0]) && Array.isArray(duo[1])) M.duo = [duo[0].slice(0, 3), duo[1].slice(0, 3)];   // 各选 3 人（或 2 人），输一回合换下一人
  // 两边用同一套操控：玩家的人只听回滚记下的按键，其余的人（2v2 里）是两边各跑一份、一模一样的电脑
  ROLL.slots = netSlots(); ROLL.ctrls = [];
  for (const f of allFighters()) {
    if (ROLL.slots[0].includes(f.idx) || ROLL.slots[1].includes(f.idx)) { const c = new Ctrl(); c.net = true; ROLL.ctrls[f.idx] = c; f.ctrl = c; }
    else f.ctrl = new AICtrl(M.level || 'god');
  }
  human[0].clear(); human[1].clear(); NET.presses.length = 0; NET.presses2.length = 0; human[0].rec = NET.presses; human[1].rec = NET.presses2;
  for (const f of allFighters()) for (const k of ['moveName', 'lunged', 'hitConfirmed', 'chargeFull', 'homeX', 'dummy', 'spFace', 'spX', 'slashN', 'spinN', 'vox', 'voy']) delete f[k];
  clock = 0; projSeq = 0; GRNG.s = seed | 0;
  if (isRaid()) netRaidSetup();
  ROLL.lastMid = ROLL.mid;
  Object.assign(ROLL, { on: true, F: 0, snaps: [], loc: [], rem: [], used: [], remChg: {}, remLast: ROLL.D - 1, lastRemH: 0, lastSentH: 0,
    locMax: ROLL.D - 1, pend: Infinity, out: [], peerAdv: 0, skipT: 0, stall: 0, ckOut: null, ended: false, rollbacks: 0, rbFrames: 0, desyncs: 0, mid: seed | 0 });
  for (let f = 0; f < ROLL.D; f++) { ROLL.loc[f] = EMPTY_IN; ROLL.rem[f] = EMPTY_IN; }
  const early = (ROLL.early || []).filter(x => x.m === ROLL.mid); ROLL.early = [];   // 对方先开了这一局，早到的按键补上
  BP = null; showScreen(null); creditT = 0;
  recBegin('net');
  startRound();
  if (M.map && MAPS[M.map]) say(MAPS[M.map].n, 1.4, 'big', MAPS[M.map].d);
  applySkins(); MSTAT.maxcombo = 0; MSTAT.ults = 0; acc = 0;
  if (NET.role === 'host') send({ mstart: 1 });
  $id('endRank').textContent = '';
  for (const x of early) rollRecv(x);
}
function rollFrame(f) {
  const R = ROLL;
  R.snaps[f % R.N] = { f, st: capState() };
  const li = R.loc[f] || EMPTY_IN, ri = f <= R.remLast ? (R.rem[f] || { h: R.lastRemH, p: [] }) : { h: R.lastRemH, p: [] };
  R.used[f] = ri;
  const side = NET.role === 'client' ? 1 : 0;
  R.slots[side].forEach((idx, k) => applyInput(R.ctrls[idx], slotInput(li, k)));
  R.slots[1 - side].forEach((idx, k) => applyInput(R.ctrls[idx], slotInput(ri, k)));
  step();
}
function rollResim() {
  const R = ROLL, from = R.pend; R.pend = Infinity;
  const sn = R.snaps[from % R.N];
  if (!sn || sn.f !== from) { if (NET.role === 'host') rollSendSync(); else send({ rdesync: 1, m: R.mid }); return; }
  const fs = allFighters(), pre = fs.map(f => [f.x, f.y]);
  restState(sn.st);
  RESIM = true;
  try { for (let f = from; f < R.F; f++) rollFrame(f); } finally { RESIM = false; }
  R.rollbacks++; R.rbFrames += R.F - from;
  // 画面上从旧位置平滑滑到新位置
  fs.forEach((f, i) => { const dx = pre[i][0] - f.x, dy = pre[i][1] - f.y; if (Math.abs(dx) < 140 && Math.abs(dy) < 140) { f.vox = (f.vox || 0) + dx; f.voy = (f.voy || 0) + dy; } });
}
function rollAdvance() {
  const R = ROLL;
  if (NET.hold || R.ended) return false;
  if (R.F - R.remLast > R.MAXP) { R.stall += STEP; return false; }          // 对方的按键太久没到：等一等
  if (R.skipT > 0) R.skipT -= STEP;
  else if ((R.F - 1 - R.remLast) - R.peerAdv > 8) { R.skipT = 0.25; return false; }   // 比对方快太多：停一帧让他追上
  R.stall = 0;
  if (R.pend < R.F) rollResim();
  const fi = R.F + R.D;
  if (fi > R.locMax) {                                                      // 记录本地按键（D 帧后生效）
    if (secretEnabled) { const slot = R.slots[NET.role === 'client' ? 1 : 0][0]; secretThink(fighterByIdx(slot), true); }
    const { h, p: pr } = localInput();
    for (let x = R.locMax + 1; x < fi; x++) R.loc[x] = { h: R.lastSentH, p: [] };
    R.loc[fi] = { h, p: pr }; R.locMax = fi;
    if (h !== R.lastSentH || pr.length) { R.out.push([fi, h, ...pr]); R.lastSentH = h; }
  }
  rollFrame(R.F);
  R.F++;
  recNet();
  // 胜负只在两边按键都确认过的帧上结算
  const cf = Math.min(R.F, R.remLast + 1), cs = R.snaps[cf % R.N];
  if (!R.ended && cs && cs.f === cf && cs.st.M.phase === 'end') { R.ended = true; showEnd(cs.st.M.koWinner); }
  if (R.F % 60 === 0) { const f = Math.min(R.F - 30, R.remLast); const sn = R.snaps[f % R.N]; if (f > 0 && sn && sn.f === f) R.ckOut = [f, hashState(sn.st)]; }
  if (R.F % 600 === 0) for (const arr of [R.loc, R.rem, R.used]) for (let k = R.F - 1200; k < R.F - 600; k++) if (k >= 0) delete arr[k];
  return true;
}
function rollSend() {
  const R = ROLL, now = performance.now();
  if (!R.out.length && !R.ckOut && now - (R.lastSend || 0) < 33) return;
  R.lastSend = now;
  const msg = { ru: R.locMax, adv: R.F - 1 - R.remLast, m: R.mid };
  if (R.out.length) msg.ri = R.out.splice(0);
  if (R.ckOut) { msg.ck = R.ckOut; R.ckOut = null; }
  send(msg);
}
function rollTick(real) {
  const R = ROLL;
  acc += real * (slowmo > 0 ? 0.28 : 1) * cineSpeed();
  if (acc > STEP * 5) acc = STEP * 5;
  let n = 0;
  while (acc >= STEP && n < 5) { if (!rollAdvance()) { acc = 0; break; } acc -= STEP; n++; }
  if (n >= 5) acc = 0;
  if (R.pend < R.F && !NET.hold) rollResim();
  rollSend();
  if (R.stall > 0.35) { netOverlay('等待对手的网络…'); R.stallShown = true; }
  else if (R.stallShown) { netOverlay(''); R.stallShown = false; }
}
// 每局的消息都带着这一局的编号：上一局结算时还在发的旧消息不能算进新一局（否则新局的确认帧会被旧帧号顶上去，对面的按键全被丢掉）
const rollMine = msg => msg.m === undefined || msg.m === ROLL.mid;
function rollRecv(msg) {
  const R = ROLL;
  if (!rollMine(msg)) { if (msg.m !== R.lastMid) { (R.early = R.early || []).push(msg); if (R.early.length > 240) R.early.shift(); } return; }
  if (!R.on) return;
  if (msg.ri) for (const r of msg.ri) R.remChg[r[0]] = { h: r[1], p: r.slice(2) };
  for (let f = R.remLast + 1; f <= msg.ru; f++) {
    const c = R.remChg[f]; let inp;
    if (c) { inp = c; R.lastRemH = c.h; delete R.remChg[f]; } else inp = { h: R.lastRemH, p: [] };
    R.rem[f] = inp;
    if (f < R.F) { const u = R.used[f]; if (!u || u.h !== inp.h || inp.p.length) R.pend = Math.min(R.pend, f); }
  }
  if (msg.ru > R.remLast) R.remLast = msg.ru;
  recNet();
  if (msg.adv !== undefined) R.peerAdv = msg.adv;
  if (msg.ck) {   // 两边校验同一帧的状态
    const [f, h] = msg.ck, sn = R.snaps[f % R.N];
    if (sn && sn.f === f && f <= R.remLast && f < R.F && R.pend > f && hashState(sn.st) !== h) {
      R.desyncs++;
      if (NET.role === 'host') rollSendSync(); else send({ rdesync: 1, m: R.mid });
    }
  }
}
// 状态不一致时：房主把一帧“两边都确认过”的存档发给对方
function rollSendSync() {
  const R = ROLL, f = Math.min(R.F, R.remLast + 1), sn = R.snaps[f % R.N];
  const st = f === R.F ? capState() : (sn && sn.f === f ? sn.st : null);
  if (st) send({ rsync: { f, st, m: R.mid } });
}
function rollAdopt(p) {
  const R = ROLL; if (!R.on || !rollMine(p)) return;
  REC.bad = true;
  const target = R.F;
  restState(p.st); R.F = p.f; R.pend = Infinity;
  if (R.F < target) { RESIM = true; try { while (R.F < target) { rollFrame(R.F); R.F++; } } finally { RESIM = false; } }
}
