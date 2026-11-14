// ======================= 电脑 AI =======================
// 本文件：电脑 AI 的控制器和单机剧情玩法。
//   1. 自适应难度（ADAPT）：按你最近的胜负微调电脑强度
//   2. 斩妖列传（FOREST / 关卡 / 小怪）：选关、刷波、小怪出招、过关结算、画面和 HUD
//   3. 木人桩的稻草人（DummyCtrl / DUMMY_JOBS）：按 src/data/14-dummy.js 的设定行动
//   4. AICtrl：把 src/ai.js 的大脑接到一位侠客身上（每帧问大脑要按键）
// 找 bug 提示：电脑行为不对，先在 src/ai.js 里找；这里只负责"把想法变成按键"。
// 难度、打法和大脑都在 src/ai.js
// 个性化电脑：以困难为基础，按你对它的输赢自动调强弱；禁你胜率最高的角色，用你最常用的角色
const ADAPT = { s: 1, use: {}, win: {} };
function adaptKey() { return 'renying-adapt' + (ACC && ACC.name ? '-' + ACC.name : ''); }
function adaptLoad() { try { Object.assign(ADAPT, { s: 1, use: {}, win: {} }, JSON.parse(localStorage.getItem(adaptKey()) || '{}')); } catch (e) {} adaptLevel(); }
function adaptSave() { try { localStorage.setItem(adaptKey(), JSON.stringify(ADAPT)); } catch (e) {} }
function adaptLevel() {
  const k = clamp(ADAPT.s, 0.55, 1.45);
  LEVELS.adaptive = aiBlendLevel(k);
  const el = document.getElementById('adaptLine');
  if (el) { const fav = adaptFav(); el.textContent = `宿敌：如今强度 ${Math.round(k * 100)}%${fav.best >= 0 ? `，必禁你的${CHARS[fav.best].name}` : ''}${fav.most >= 0 ? `，惯用你的${CHARS[fav.most].name}` : ''}`; }
}
function adaptFav() {   // 你最常用的角色、胜率最高的角色（至少打过 3 场）
  let most = -1, best = -1, mu = 0, bw = -1;
  CHARS.forEach((c, i) => {
    const u = ADAPT.use[c.id] || 0, w = ADAPT.win[c.id] || 0;
    if (u > mu) { mu = u; most = i; }
    if (u >= 3 && w / u > bw) { bw = w / u; best = i; }
  });
  return { most, best: best >= 0 ? best : most };
}
function adaptRecord(won) {   // 每场打完：记录你用的角色和输赢；宿敌按输赢调强弱
  const me = [A, B][localIdx()];
  ADAPT.use[me.ch.id] = (ADAPT.use[me.ch.id] || 0) + 1;
  if (won) ADAPT.win[me.ch.id] = (ADAPT.win[me.ch.id] || 0) + 1;
  if (M.level === 'adaptive') ADAPT.s = clamp(ADAPT.s + (won ? 0.07 : -0.07), 0.55, 1.45);
  adaptSave(); adaptLevel();
}
// 进阶技巧：每个角色独有的实战招式联动与进阶操作
const ADV = {
  qingfeng: '疾风斩直击穿身得手后，立时重置剑气冷却，可瞬间接出弧月剑气连招。',
  tieshan: '震地直击得手后，瞬时回涌 30 点架势耐力，并削减铁壁冲 2.5 秒冷却。',
  feiying: '影遁之后 1.5 秒内再按 Q——影归，瞬息退回遁走前的位置。',
  liuyun: '风刃一次扇出两道；开扇冲过去撒下的爆米花半秒后会炸。',
  leiming: '雷闪贴地冲拳命中对手，立时重置金刚雷铠冷却，可瞬间转守为攻。',
  lingshuang: '回马枪得手后，枪旋余下的冷却减半。',
  moyu: '墨阵尚在场时再按 Q——引爆，阵中之敌受 25 伤害，被墨浪掀飞。',
  yuehua: '月镜格开一击后，月轮立时冷却完毕，可顺势再放一轮。',
  yanling: '自空中起手的俯冲一旦命中，此技立时冷却完毕，落地前可再冲一次（每次落地前只刷新一次）。',
  yuxiao: '回音壁可将暗器、剑气、风刃原路弹回，每弹回一次额外积攒一枚音律。',
  zuixian: '酒过半壶可触发两成近战闪避，并可掷坛施展与民同乐回春80血且压制对手。',
  gouchen: '飞锤拽敌至身前附加 1.2 秒 25% 震魄易伤，立时衔接旋锤连砸。',
  lingque: '锦梭穿云标记敌身后，幽影掠步可循印瞬身突袭并刷新连段。',
  liying: '先留影再出手：只按 R 渡到离对手最近的雾身，按住 ← / → 再按 R 去那一边，按住 ↓ 去最早的那个。',
  cixian: 'Q 换极性会清零 R：正极 R 把人弹开，换成负极马上再 R 把人吸回来；负极普攻连到 15 下会消磁，停手 1 秒或换一下极性就好。',
  qianji: '金丝回环持续往返，普攻与蓄力可以改向加速；R 穿丝急袭选择球与对手同线时释放，也可受击解控；E 机轮三穿在对手受击、闪避冷却或残血时发动。',
};
function trySecondQ(f, foe) {
  if (f.skillCD <= 0 || M.phase !== 'fight' || !['idle', 'walk', 'air'].includes(f.state)) return false;
  const c = f.ctrl;
  if (f.ch.id === 'moyu') {
    const p = projs.find(q => q.kind === 'trap' && q.owner === f.idx && !q.dead);
    if (!p || !c.consume('skill')) return false;
    p.dead = true; ring(p.x, -20, 95, '30,30,40', 0.3); SFX.thud();
    for (let i = 0; i < 14; i++) addP({ type: 'ink', x: p.x + rand(-40, 40), y: -6, vx: rand(-200, 200), vy: rand(-420, -120), g: 1200, life: 0.6, max: 0.6, r: rand(2, 4), rgb: '15,15,22' });
    if (foe.invul <= 0 && foe.hp > 0 && Math.abs(foe.x - p.x) < 95 && foe.y > -130)
      applyHit(f, foe, { dmg: 25, kb: [120, -460], stun: 0.45, hs: 0.08, launch: true, noScale: true, dir: foe.x >= p.x ? 1 : -1 }, [foe.x, foe.y - 40]);
    return false;
  }
  if (f.ch.id === 'feiying' && f.bbT > 0 && c.consume('skill')) {
    smoke(f.x, f.y - 50, 10); f.x = f.bbX; f.bbT = 0; f.trail.length = 0; f.scarf = []; smoke(f.x, f.y - 50, 8); SFX.poof();
  }
  return false;
}
// 木人桩：稻草人做什么（对手行为栏选的动作）加几项特性。动作表、特性表在 src/data/14-dummy.js，这里是每个动作怎么做。
// dummyCfg 是栏里现在选的：act 动作、rep 一直做（false 只做一次）、gap 两次之间隔几秒，其余是特性开关
let dummyCfg = { act: 'stand', rep: true, gap: 1, fixed: false, escape: false, infGuard: true, autoHeal: true };
const DUMMY_BY = Object.fromEntries(DUMMY_ACTS.map(a => [a.id, a]));
const DUMMY_RANDOM = DUMMY_ACTS.filter(a => a.k === 'do' && a.id !== 'random').map(a => a.id);   // 「随机」从这些里抽
const dummyActName = c => { const a = DUMMY_BY[c.act] || DUMMY_BY.stand; return a.k === 'do' && !c.rep ? `${a.n}（只做一次）` : a.n; };
// 以前的写法（startMatch('train', 'stand') 和旧的 block / counter 开关）照样认
function dummyNorm(o) {
  const c = { ...dummyCfg, ...(o && typeof o === 'object' ? o : {}) };
  if (typeof o === 'string') { if (o === 'fixed') c.fixed = true; else if (o === 'escape') c.escape = true; c.act = o === 'block' ? 'block' : 'stand'; }
  if (o && typeof o === 'object' && !o.act) c.act = o.counter ? 'counter' : o.block ? 'block' : 'stand';
  if (!DUMMY_BY[c.act]) c.act = 'stand';
  c.rep = c.rep !== false; c.gap = DUMMY_GAPS.includes(+c.gap) ? +c.gap : 1;
  delete c.block; delete c.counter;
  return c;
}
// 一个动作拆成几步，每一步 (ctrl, me, foe, J) 做完返回 true 才走下一步；J.t 是这一步开始了多久
const dj = {
  near: r => (c, me, foe, J) => {   // 走到对手身边（钉在原地就原地出手）
    const dx = foe.x - me.x;
    if (c.cfg.fixed || Math.abs(dx) <= r || J.t > 1.6) return true;
    c.held[dx > 0 ? 'right' : 'left'] = true; return false;
  },
  press: (a, prep) => (c, me, foe) => { if (prep) prep(me, foe); c.press(a); return true; },
  wait: d => (c, me, foe, J) => J.t >= d,
  idle: (c, me, foe, J) => J.t > 0.08 && (me.onGround() && ['idle', 'walk', 'block'].includes(me.state)) || J.t > 3,
  // 远程：自己有飞行道具技能就放那一招（冷却直接转好），没有就甩一道风刃
  shoot: (c, me, foe) => {
    const proj = slot => { const id = slot === 2 ? me.ch.skill2 : me.ch.skill; return typeof AI_KIT !== 'undefined' && AI_KIT[id] && AI_KIT[id].role === 'proj'; };
    const slot = proj(1) ? 1 : proj(2) ? 2 : 0;
    if (slot === 1) { me.skillCD = 0; c.press('skill'); }
    else if (slot === 2) { me.skill2CD = 0; c.press('skill2'); }
    else { const dir = foe.x >= me.x ? 1 : -1; spawnProj(me, { kind: 'wind', x: me.x + dir * 40, y: me.y - 62, vx: dir * 620, w: 56, h: 52, life: 2.4, dmg: 4, kb: [160, 0], stun: 0.3, hs: 0.04 }); }
    return true;
  },
};
const DUMMY_JOBS = {
  light: [dj.near(110), dj.press('light'), dj.idle],
  ranged: [dj.shoot, dj.idle],
  jump: [dj.press('jump'), dj.idle],
  djump: [dj.press('jump'), dj.wait(0.24), dj.press('jump'), dj.idle],
  dash: [dj.press('dash', me => { me.breakCD = 0; }), dj.idle],
  skill: [dj.press('skill', me => { me.skillCD = 0; }), dj.idle],
  skill2: [dj.press('skill2', me => { me.skill2CD = 0; }), dj.idle],
  ult: [dj.press('special', me => { me.meter = 100; }), dj.idle],
  combo: [dj.near(100), dj.press('light'), dj.wait(0.14), dj.press('light'), dj.wait(0.14), dj.press('light'), dj.wait(0.14), dj.press('light'), dj.wait(0.14), dj.press('light'),
    dj.wait(0.2), dj.press('skill', me => { me.skillCD = 0; }), dj.idle],
};

class DummyCtrl extends Ctrl {
  constructor(modeOrCfg) {
    super();
    this.cfg = dummyNorm(modeOrCfg);
    this.mode = typeof modeOrCfg === 'string' ? modeOrCfg : 'custom';
    this.restart();
  }
  // 换了动作（或者再选一次同一个）：从头来，稍等一下再出手，好看清
  restart() { this.job = null; this.step = 0; this.J = { t: 0 }; this.wait = 0.6; this.done = false; this.prev = ''; this.soon = false; this.walkT = 0; this.walkDir = 1; }
  setCfg(o) { this.cfg = dummyNorm(o); this.restart(); }
  think(me, foe) {
    const c = this.cfg, a = DUMMY_BY[c.act] || DUMMY_BY.stand, h = this.held;
    h.left = h.right = false; h.down = c.act === 'block';
    if (c.escape && me.breakCD <= 0 && (me.state === 'launched' || (me.state === 'hitstun' && me.comboHits >= 4)) && me.t > 0.08) this.press('dash');
    if (c.act === 'walk') {   // 来回走：每 1.2 秒掉头，走到场边也掉头
      this.walkT += STEP;
      if (this.walkT > 1.2 || (this.walkDir < 0 && me.x < WALL + 120) || (this.walkDir > 0 && me.x > STAGE_W - WALL - 120)) { this.walkT = 0; this.walkDir = -this.walkDir; }
      h[this.walkDir > 0 ? 'right' : 'left'] = true;
    }
    if (a.k === 'react') this.react(me, foe, c);
    else if (a.k === 'do') this.doJob(me, foe, c);
    this.prev = me.state;
  }
  // 看时机反应：只做一次的话，反应过一次就停
  react(me, foe, c) {
    if (this.done) return;
    let did = false;
    if (c.act === 'parry') {   // 对手的招快打到了（出招点前 0.06 秒到招式结束）才按住格挡，招一过就松开：每一下都是精准招架
      const m = foe.state === 'attack' && foe.move;
      const soon = m && Math.abs(foe.x - me.x) < 260 && foe.t >= m.su - 0.06 && foe.t < m.su + m.ac;
      this.held.down = !!soon;
      did = this.soon && !soon; this.soon = !!soon;   // 一招过去了算招架过一次
    } else if (c.act === 'counter') {   // 挨打、被格挡的硬直一结束就还手
      if ((this.prev === 'hitstun' || this.prev === 'blockstun') && me.state !== this.prev && me.hp > 0) { this.press('light'); did = true; }
    } else if (c.act === 'wakeup') {   // 起身那一下出刀（一直按着，起来的第一刻就出）
      if (me.state === 'getup') this.press('light');
      if (this.prev === 'getup' && me.state !== 'getup') did = true;
    }
    if (did && !c.rep) this.done = true;
  }
  // 每隔 gap 秒做一次（只做一次就做完停下）；正在挨打、在空中就先等
  doJob(me, foe, c) {
    if (!this.job) {
      if (this.done) return;
      const free = me.onGround() && ['idle', 'walk', 'block'].includes(me.state);
      if (free) this.wait -= STEP;
      if (this.wait > 0 || !free) return;
      const id = c.act === 'random' ? DUMMY_RANDOM[Math.floor(grnd() * DUMMY_RANDOM.length)] : c.act;
      this.job = DUMMY_JOBS[id]; this.jobId = id; this.step = 0; this.J = { t: 0 };
    }
    const J = this.J;
    while (this.job && this.step < this.job.length) {
      if (!this.job[this.step](this, me, foe, J)) { J.t += STEP; return; }
      this.step++; J.t = 0;
    }
    this.job = null; this.wait = c.gap;
    if (!c.rep) this.done = true;
  }
}
const TRAIN = { total: 0, hits: [], best: 0, bestDmg: 0, inspectHz: 120, inspectAcc: 0, inspectPaused: false };

// 电脑：按键都由 src/ai.js 里的 AIBrain 决定，这里只是接到操作上；各侠客针对特定模式与变体的专属调优可注册进 HERO_AI_REGISTRY
const HERO_AI_REGISTRY = {};
function registerHeroAI(heroId, mode = '*', variant = '*', spec = {}) {
  HERO_AI_REGISTRY[`${heroId}:${mode}:${variant}`] = spec;
}
function resolveHeroAI(heroId, mode = '*', variant = '*') {
  return HERO_AI_REGISTRY[`${heroId}:${mode}:${variant}`]
    || HERO_AI_REGISTRY[`${heroId}:${mode}:*`]
    || HERO_AI_REGISTRY[`${heroId}:*:${variant}`]
    || HERO_AI_REGISTRY[`${heroId}:*:*`]
    || null;
}
function aiVariantNow() {
  if (typeof is2v2 === 'function' && is2v2()) return '2v2';
  if ((typeof chaosOn === 'function' && chaosOn()) || (typeof M !== 'undefined' && M.cujuChaos)) return 'chaos';
  if (typeof mayhemOn === 'function' && mayhemOn()) return 'mayhem';
  return '1v1';
}

class AICtrl extends Ctrl {
  constructor(level) { super(); this.level = level; this.brain = new AIBrain(this, level); this.L = this.brain.L; }
  updateTactic() { this.brain.newRound(); }
  think(me, foe) {
    // 联机回滚时两边各跑一份电脑，必须掷出同样的骰子：想招这一下借用对局随机数（会进存档），想完换回来。
    // 放联机录像时也一样，电脑才会想出和当时一模一样的招
    const run = () => {
      const ov = me && me.ch ? resolveHeroAI(me.ch.id, typeof M !== 'undefined' ? M.mode : '*', aiVariantNow()) : null;
      if (ov && typeof ov.onThink === 'function' && ov.onThink(this, me, foe)) return;
      this.brain.think(me, foe);
    };
    if (!netSim()) return run();
    const r0 = Math.random; Math.random = grnd;
    try { run(); } finally { Math.random = r0; }
  }
}

