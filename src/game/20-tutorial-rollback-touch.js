// ======================= 新手教学 =======================
// 在木人桩里一步一步教，每一步都检测你是不是真的做到了
let TUT = null;
function stunA() { A.state = 'hitstun'; A.t = 0; A.stun = 3; A.vx = 0; A.flash = 0.1; A.comboHits = 3; }
const TUT_STEPS = [
  { t: '移动身法', d: '按 A、D 左右走动，熟悉侠客的立回步法。', ok: () => Math.abs(A.x - TUT.x0) > 260 },
  { t: '起跳与滞空', d: '按 W 或空格起跳，身在半空再按一次，便是二段跳。', ok: () => A.jumps >= 2 },
  { t: '地面五段连段', d: '贴近稻草人连续点按左键打满五段（L1~L5）；末段强力挑飞击退对手。', ok: () => TUT.hit.l5 },
  { t: '破势蓄力斩', d: '按住左键蓄力，待寒芒一闪、剑鸣铮铮时松手。蓄满的一斩为霸体不可挡，能强行破防！', ok: () => TUT.hit.cs2 },
  { t: '挑飞追空打击', d: '将对手打飞或跃起后，在空中点左键（空斩 A1），再点一下下砸（A2），实现空中追打追击。', ok: () => A.state === 'attack' && /^a[12]$/.test(A.moveName) },
  { t: '远程暗器 / 剑气', d: '按住左键再点右键（或直接按 R）。各派武学各异，青锋可挥出疾速剑气。', ok: () => A.skill2CD > 0 },
  { t: '核心门派技能', d: '按 Q 施展专属门派武学。青锋的「疾风斩」附带位移穿透与破防。', ok: () => A.skillCD > 0 },
  { t: '严密格挡', d: '稻草人会朝你连发风刃，按住 S 挡下两次！记得面朝来袭方向。', ok: () => TUT.blocks >= 2, setup: () => { TUT.shotT = 0.5; } },
  { t: '精准弹刀 (招架)', d: '在近身来袭瞬间（受击前 0.09 秒内）轻按 S，即可触发「精准招架」，完全不掉架势且反震硬直！', ok: () => (TUT.justGuards || 0) >= 1, setup: () => { TUT.parryShotT = 0.6; } },
  { t: '绝境腾空闪', d: '受到硬直连击陷入绝境时，按右键（或左 Shift）引爆真气触发「腾空闪」逃脱并获短暂无敌！', ok: () => A.escInvul, setup: () => { A.breakCD = 0; stunA(); } },
  { t: '真元爆发 · 绝招', d: '怒气已为你灌满！按 E 释放震撼全场的天地绝技！', ok: () => A.state === 'special', setup: () => { A.meter = 100; } },
];
function startTutorial() {
  try { localStorage.setItem('renying-tut-seen', '1'); } catch (e) {}
  trainChar = 0; dummyMode = 'stand';
  startTraining('dummy');
  B.x = STAGE_W / 2 + 220; A.x = STAGE_W / 2 - 220;
  TUT = { step: -1, wait: 0, x0: A.x, hit: {}, blocks: 0, justGuards: 0, prev: '', shotT: 0, parryShotT: 0 };
  tutNext();
  $id('tutBox').classList.remove('hidden');
}
const TUT_TOUCH = [
  '拨动左摇杆，左右走动熟悉身法。',
  '向上推摇杆或点「跳」；在半空中再点一次触发二段跳。',
  '贴近稻草人，连点「攻击」打满五段连击。',
  '按住「攻击」蓄力，待寒芒闪耀与剑鸣时松手，劈出霸体破防斩！',
  '起跳后在空中点「攻击」，随后再点下砸完成追空！',
  '点击「远程」放出远程武学，青锋施展远程剑气。',
  '点击「技能」施展专属门派武学，穿透对手。',
  '稻草人放风刃袭来，摇杆下推防御挡下两次。',
  '在受到攻击瞬间快速下拉摇杆，触发「精准招架」反震对手！',
  '受到攻击陷入僵直时，点「闪」腾空闪逃脱危局！',
  '真元已蓄满，点击发光的「大招」释放天地绝技！'
];
function tutNext() {
  TUT.step++; TUT.wait = 0; TUT.hit = {}; TUT.x0 = A.x;
  const st = TUT_STEPS[TUT.step];
  if (!st) return tutFinish();
  $id('tutBox').classList.remove('ok');
  $id('tutN').textContent = `新手演武教学 ${TUT.step + 1} / ${TUT_STEPS.length}`;
  $id('tutT').textContent = st.t; $id('tutD').textContent = TOUCH ? TUT_TOUCH[TUT.step] : st.d;
  if (st.setup) st.setup();
}
function tutTick(dt) {
  const st = TUT_STEPS[TUT.step]; if (!st) return;
  A.hp = A.maxHp; A.breakCD = TUT.step === 9 ? 0 : A.breakCD;
  if (A.state === 'attack' && A.hitConfirmed) TUT.hit[A.moveName] = true;
  if (A.state === 'blockstun' && TUT.prev !== 'blockstun') TUT.blocks++;
  TUT.prev = A.state;
  // 教学第8步：风刃防御
  if (TUT.step === 7 && !TUT.wait) {
    TUT.shotT -= dt;
    if (TUT.shotT <= 0) {
      TUT.shotT = 1.6; const dir = A.x >= B.x ? 1 : -1;
      spawnProj(B, { kind: 'wind', x: B.x + dir * 40, y: B.y - 62, vx: dir * 620, w: 56, h: 52, life: 2.4, dmg: 2, kb: [160, 0], stun: 0.3, hs: 0.04 });
    }
  }
  // 教学第9步：近战出招诱导精准招架
  if (TUT.step === 8 && !TUT.wait) {
    TUT.parryShotT = (TUT.parryShotT || 0) - dt;
    if (TUT.parryShotT <= 0 && B.state === 'idle') {
      TUT.parryShotT = 2.0;
      B.x = A.x + (A.face === 1 ? 75 : -75);
      B.face = -A.face;
      startAttack(B, 'l1');
    }
  }
  if (TUT.step === 9 && !TUT.wait && !A.escInvul && A.onGround() && A.state !== 'hitstun' && A.state !== 'getup') stunA();
  if (TUT.wait) { TUT.wait -= dt; if (TUT.wait <= 0) tutNext(); return; }
  if (st.ok()) { TUT.wait = 1; $id('tutBox').classList.add('ok'); SFX.chargeFull(); }
}
function updateTutBtn() {
  let done = false; try { done = !!localStorage.getItem('renying-tut-done'); } catch (e) {}
  if (!PROF.guest && PROF.tutorial) done = true;
  const b = document.querySelector('#menu [data-go="tutorial"]'); if (b) b.style.display = done ? 'none' : '';
}
async function tutFinish() {
  try { localStorage.setItem('renying-tut-done', '1'); } catch (e) {}
  updateTutBtn();
  $id('tutBox').classList.add('hidden');
  let msg = '该会的都会了。去找电脑或是同学，过几招吧。';
  if (!PROF.guest) {
    if (!PROF.tutorial) {
      PROF.tutorial = 1; saveFlag('tutorial', 1);
      PROF.ink = (PROF.ink || 0) + 300;
      if (window.CloudSave) CloudSave.saveProfile(PROF);
      applyProfile(PROF);
      msg += '<br>奖励 <b style="color:#e9c46a">300 墨锭</b>，去武库买个武器箱试试手气吧！';
    }
  } else {
    msg += '<br>登录之后再走一遍教学，可领 300 墨锭。';
  }
  $id('tutReward').innerHTML = msg;
  TUT = null; paused = true; showScreen('tutdone'); SFX.gong();
}
function endTutorial() { TUT = null; $id('tutBox').classList.add('hidden'); }
$id('tutMenu').addEventListener('click', () => { paused = false; toMenu(); });
$id('tutStay').addEventListener('click', () => { paused = false; showScreen(null); });
$id('tutYes').addEventListener('click', () => startTutorial());
$id('tutNo').addEventListener('click', () => { try { localStorage.setItem('renying-tut-seen', '1'); } catch (e) {} backToMenu(); });
// 初次进入游戏语言偏好引导弹窗
let langPromptDone = false;
try {
  langPromptDone = !!localStorage.getItem('renying-lang-chosen');
} catch (e) {}

function chooseLang(l) {
  try { localStorage.setItem('renying-lang-chosen', '1'); } catch (e) {}
  langPromptDone = true;
  SETTINGS.lang = l;
  saveSettings();
  if (window.I18N) window.I18N.setLang(l);
  backToMenu();
  let seen = false; try { seen = !!localStorage.getItem('renying-tut-seen'); } catch (err) {}
  if (!seen && $id('menu').classList.contains('on')) showScreen('tutask');
}

if ($id('lpPickZh')) $id('lpPickZh').addEventListener('click', () => chooseLang('zh'));
if ($id('lpPickEn')) $id('lpPickEn').addEventListener('click', () => chooseLang('en'));
if ($id('tnLangBtn')) $id('tnLangBtn').addEventListener('click', () => {
  const next = (window.I18N && window.I18N.getLang() === 'en') ? 'zh' : 'en';
  SETTINGS.lang = next;
  saveSettings();
  if (window.I18N) window.I18N.setLang(next);
  toast(next === 'en' ? 'Switched to English mode' : '已切换至中文模式');
});

setTimeout(() => { if ($id('menu').classList.contains('on')) showScreen('menu'); }, 0);   // 一打开就和点返回回来的首页一个样子（顶栏在、底栏不变）
setTimeout(() => {
  if (!langPromptDone && $id('menu').classList.contains('on')) {
    showScreen('langPrompt');
    return;
  }
  let seen = false; try { seen = !!localStorage.getItem('renying-tut-seen'); } catch (e) {}
  if (!seen && $id('menu').classList.contains('on')) showScreen('tutask');
}, 1000);

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
function rollStart(ch, seed, duo, mv, map) {
  refocusGame();
  setChars(ch[0], ch[1]);
  if (ch && ch.length >= 4) { C.setChar(ch[2]); D.setChar(ch[3]); }
  setupNetMatch();
  // 山河异境：房主在点将台上选好的图随开局发来（map）；同阵容再战没有点将台，就按两边的票和种子选
  if (roomDef().rule === 'maps') M.map = MAP_POOL.includes(map) ? map : mapPick(Array.isArray(mv) ? mv : [], mapSeedRand(seed));
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
// ======================= 手机和平板：触屏操作 =======================
const TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);   // 主要靠手指操作的设备（手机、平板）
const TUI = { stick: null, stickUp: false, jumpHeld: false };
function touchHeldJump() { human[0].held.jump = TUI.stickUp || TUI.jumpHeld; }
function touchUIUpdate() {
  if (!TOUCH) return;
  const inFight = (M.mode === 'cpu' || M.mode === 'net' || M.mode === 'train' || M.mode === 'tag3') && !paused && !document.querySelector('.scr.on');
  $id('touchUI').classList.toggle('hidden', !inFight);
  if (!inFight) return;
  const me = [A, B][localIdx()];
  document.querySelector('.tult').classList.toggle('ready', !!me && me.meter >= 100);
  $id('tPause').classList.toggle('hidden', M.mode === 'net');
  $id('tDummy').classList.toggle('hidden', !(M.mode === 'train' && !FOREST.on && !TUT));
}
if (TOUCH) {
  document.body.classList.add('touchdev');
  for (const b of document.querySelectorAll('#touchUI [data-a]')) {
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); initAudio(); haptic(12); try { b.setPointerCapture(e.pointerId); } catch (err) {} b.classList.add('on');
      const c = human[0], a = b.dataset.a;
      if (a === 'atk') { c.held.atk = true; c.atkT = clock; c.press('light'); }
      else if (a === 'jump') { TUI.jumpHeld = true; touchHeldJump(); c.press('jump'); }
      else if (a === 'skill2') { if (c.held.atk) { c.atkT = clock + 1e6; delete c.buf.light; } c.press('skill2'); }
      else c.press(a);
    });
    const up = e => {
      b.classList.remove('on'); const c = human[0], a = b.dataset.a;
      if (a === 'atk') c.held.atk = false;
      if (a === 'jump') { TUI.jumpHeld = false; touchHeldJump(); }
    };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  const st = $id('tStick'), kn = $id('tKnob');
  const move = e => {
    const r = st.getBoundingClientRect(), R0 = r.width / 2;
    let dx = e.clientX - (r.left + R0), dy = e.clientY - (r.top + R0); const l = Math.hypot(dx, dy);
    if (l > R0) { dx *= R0 / l; dy *= R0 / l; }
    kn.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R0, ny = dy / R0, h = human[0].held;
    h.left = nx < -0.35; h.right = nx > 0.35; if (h.left) h.aim = -1; if (h.right) h.aim = 1;
    h.down = ny > 0.55 && Math.abs(nx) < 0.8;
    const upNow = ny < -0.6 && Math.abs(nx) < 0.8;
    if (upNow && !TUI.stickUp) human[0].press('jump');
    TUI.stickUp = upNow; touchHeldJump();
  };
  st.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); TUI.stick = e.pointerId; try { st.setPointerCapture(e.pointerId); } catch (err) {} move(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === TUI.stick) move(e); });
  const end = e => { if (e.pointerId !== TUI.stick) return; TUI.stick = null; kn.style.transform = ''; const h = human[0].held; h.left = h.right = h.down = false; TUI.stickUp = false; touchHeldJump(); };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  $id('tPause').addEventListener('click', () => { if (M.mode !== 'net' && M.phase !== 'end') { paused = true; showScreen('pause'); } });
  $id('tDummy').addEventListener('click', () => {
    if (!(B.ctrl instanceof DummyCtrl)) return;
    const presets = [
      { name: '自由试剑', cfg: { fixed: false, block: false, escape: false, counter: false, infGuard: true, autoHeal: true } },
      { name: '钉在原地', cfg: { fixed: true, block: false, escape: false, counter: false, infGuard: true, autoHeal: true } },
      { name: '一味死守', cfg: { fixed: false, block: true, escape: false, counter: false, infGuard: true, autoHeal: true } },
      { name: '受身腾空', cfg: { fixed: false, block: false, escape: true, counter: false, infGuard: true, autoHeal: true } },
      { name: '防守反击', cfg: { fixed: false, block: true, escape: true, counter: true, infGuard: true, autoHeal: true } }
    ];
    let curIdx = presets.findIndex(p => Object.keys(p.cfg).every(k => p.cfg[k] === B.ctrl.cfg[k]));
    const nextP = presets[(curIdx + 1) % presets.length];
    B.ctrl.cfg = { ...nextP.cfg };
    dummyCfg = { ...B.ctrl.cfg };
    if (B.ctrl.cfg.fixed) {
      B.x = B.homeX = STAGE_W / 2; B.y = 0; B.vx = B.vy = 0; B.state = 'idle'; B.t = 0; B.juggle = 0; B.comboHits = 0;
    } else {
      B.homeX = undefined;
    }
    renderDummyFeatures();
    say('木人：' + nextP.name, 0.8, 'go');
  });
  document.addEventListener('touchstart', () => initAudio(), { passive: true });
}

