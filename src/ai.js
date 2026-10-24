// ======================= 电脑 AI（人机） =======================
// 这个文件在 game.js 之前加载，只定义数据和函数；用到的游戏变量（clock、projs、SKILLS……）都在调用时才读。
//   1. LEVELS        五个难度的“手速与见识”：反应多快、会不会确反、压起身、骗闪、避战……
//   2. AI_KIT        每个角色的技能该怎么用（什么时候放、打中后接什么）
//   3. 打法基因      每个角色可以训练的打法参数。天道与绝顶用 tools/ai-train.mjs 自我对弈进化出来的基因
//   4. 打击数据      tools/ai-framedata.mjs 实测的每招距离、出手时间、收招时间，存在 models/ai-brain.json
//   5. FoeModel      对局中记下对手的习惯：被连几下会闪、起身爱做什么、爱不爱挡
//   6. AIBrain       每帧决策：本能（受身、破连、格挡、精准招架、躲暗器）→ 战术（连招、确反、压起身、骗闪、立回、避战）

// ---------- 1. 难度 ----------
// react 看到对手出招到能反应的秒数   think 立回时多久想一次   block 看到来招时防住的几率   jg 精准招架几率
// punish 抓破绽几率   combo 一套最多打几下   cancel 连招取消接技能几率   tech 落地受身几率   breaker 腾空闪用得多好
// oki 压起身几率   bait 骗闪几率   read 记对手习惯的本事   lead 领先后避战   error 失误几率   skill 技能用得准不准
// ult 大招用得准不准   aggr 主动程度   genes 是否用训练出来的角色打法   matchup 是否按双方角色针对
const LEVELS = {
  easy: { react: [0.42, 0.7], think: [0.34, 0.62], block: 0.15, jg: 0, punish: 0.08, combo: 2, cancel: 0, tech: 0.1, breaker: 0.05, oki: 0, bait: 0, read: 0, lead: 0, error: 0.3, skill: 0.3, ult: 0.25, aggr: 0.42, genes: false, matchup: false },
  normal: { react: [0.26, 0.42], think: [0.2, 0.42], block: 0.4, jg: 0, punish: 0.3, combo: 3, cancel: 0.2, tech: 0.35, breaker: 0.3, oki: 0.15, bait: 0, read: 0, lead: 0, error: 0.15, skill: 0.55, ult: 0.5, aggr: 0.55, genes: false, matchup: false },
  hard: { react: [0.15, 0.25], think: [0.1, 0.24], block: 0.68, jg: 0.1, punish: 0.62, combo: 5, cancel: 0.55, tech: 0.7, breaker: 0.6, oki: 0.45, bait: 0.2, read: 0.3, lead: 0.4, error: 0.06, skill: 0.8, ult: 0.75, aggr: 0.68, genes: false, matchup: true },
  impossible: { react: [0.075, 0.13], think: [0.04, 0.1], block: 0.88, jg: 0.4, punish: 0.88, combo: 6, cancel: 0.85, tech: 0.92, breaker: 0.85, oki: 0.8, bait: 0.6, read: 0.7, lead: 0.8, error: 0.02, skill: 0.95, ult: 0.92, aggr: 0.78, genes: true, matchup: true },
  god: { react: [0.025, 0.05], think: [0.016, 0.04], block: 0.99, jg: 0.9, punish: 1, combo: 6, cancel: 1, tech: 1, breaker: 1, oki: 1, bait: 1, read: 1, lead: 1, error: 0, skill: 1, ult: 1, aggr: 0.85, genes: true, matchup: true },
};
const AI_LEVEL_KEYS = ['easy', 'normal', 'hard', 'impossible', 'god'];
// 个性化“宿敌”难度：在劲敌和绝顶之间按 k（0.55~1.45）插值
function aiBlendLevel(k) {
  const a = LEVELS.hard, b = LEVELS.impossible, t = Math.max(0, Math.min(1, (k - 0.55) / 0.9)), out = {};
  for (const key in a) {
    const x = a[key], y = b[key];
    out[key] = Array.isArray(x) ? [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t] : typeof x === 'number' ? x + (y - x) * t : t > 0.5 ? y : x;
  }
  return out;
}

// ---------- 2. 角色技能用法 ----------
// role：rush 冲过去打、proj 飞行道具、counter 架招、trap 陷阱、zone 范围、self 自身增益
// combo：打中后能否接在普攻连段后面取消出来   air：空中能用   anti：能打空中的人   follow：放完立刻接的动作
// use(me, foe, d, B)：额外的使用条件（B 是大脑，可读 B.frame 等）
const AI_KIT = {
  gale: { role: 'rush', combo: true, follow: 'swordqi' },
  swordqi: { role: 'proj', combo: true, anti: true },
  blink: { role: 'rush', combo: false, buff: true, use: (m, o, d) => d > 160 && o.state !== 'skill' },
  kunai: { role: 'proj', combo: true, air: true },
  quake: { role: 'zone', combo: true, groundOnly: true, use: (m, o) => o.onGround() },
  ironwall: { role: 'rush', combo: true, anti: true },
  backthrust: { role: 'rush', combo: true },
  spin: { role: 'zone', combo: true, reflect: true },
  windblade: { role: 'proj', combo: true, air: true },
  windstep: { role: 'rush', combo: false, air: true },
  thunderfist: { role: 'rush', combo: true },
  stomp: { role: 'counter', combo: false, reflect: true },
  inktrap: { role: 'trap', combo: false, use: (m) => !projs.some(p => p.kind === 'trap' && p.owner === m.idx) },
  inksplash: { role: 'self', combo: false, use: (m, o, d) => d > 300 && (m.fu || 0) < FU_MAX && (m.ink || 0) >= INK_COST * (FU_INK + 1) },
  mirror: { role: 'counter', combo: false },
  moonring: { role: 'proj', combo: true },
  dive: { role: 'rush', combo: true, air: true, anti: true },
  darts: { role: 'proj', combo: true, air: true },
  soundwave: { role: 'proj', combo: true, air: true, use: (m, o, d) => (m.notes || 0) >= 2 || d > 260 },
  echowall: { role: 'counter', combo: false, reflect: true },
  // 亭子落地前走开或腾空闪都能躲：等对手在收招/挨打/挡着（走不快）而且闪用掉了再放
  pavilion: { role: 'trap', combo: true, jail: true, use: (m, o, d, B) => ['attack', 'skill', 'charge', 'block', 'blockstun', 'hitstun', 'getup', 'special'].includes(o.state) && (o.breakCD > 0.45 || B.L.read < 0.6) },
  feast: { role: 'self', combo: false, use: (m, o, d) => (m.drunk || 0) >= 50 && d > 160 && m.hp < m.maxHp * 0.72 && o.hp > m.hp * 0.7 },
  hook: { role: 'proj', combo: true, pull: true },
  whirl: { role: 'zone', combo: true, reflect: true },
};
// 大招：hit 按打击数据判断打不打得到；sure(me, foe, d) 额外条件
const AI_ULT = {
  crescent: { contact: true }, shadows: { contact: true }, eightimm: { contact: true },
  avalanche: { steer: true, sure: (m, o) => o.onGround() || o.y > -80 },
  phoenix: { contact: true },
  timestop: { line: true },
  tornado: { far: true },
  thunder: { far: true },
  inkdragon: { far: true, sure: (m, o) => (m.fu || 0) >= 3 || o.hp < FU_BASE + FU_PER * (m.fu || 0) || m.hp < m.maxHp * 0.35 },
  featherstorm: { far: true },
  guangling: { far: true },
  shanshui: { far: true },
  skynet: { far: true },
  moonflow: { contact: true, heal: true, sure: (m, o, d) => d < 240 || m.hp < m.maxHp * 0.5 },
};

// ---------- 3. 打法基因 ----------
// 每个角色一组，取值范围 [最小, 最大, 默认]。训练时在范围里变异，挑胜率最高的留下。
const AI_GENE_DEF = {
  range: [0.7, 1.35, 1],      // 立回站位：相对“我够得着、对手够不着”的理想距离的倍率
  aggr: [0.15, 1, 0.6],       // 立回时主动出手的倾向
  poke: [0, 1, 0.5],          // 用轻击点人的比例（其余用蓄力、技能、跳入）
  charge: [0, 1, 0.3],        // 蓄力斩（破防、不可挡）的使用
  qn: [0, 1, 0.5],            // 立回时放 Q 的倾向
  rn: [0, 1, 0.5],            // 立回时放 R 的倾向
  cancel: [0, 1, 0.8],        // 连招中取消接技能的倾向
  cancelAt: [1, 4.99, 2],     // 连段第几下开始取消接技能
  jumpIn: [0, 0.6, 0.15],     // 跳入进攻
  antiAir: [0, 1, 0.6],       // 对空
  zone: [0, 1, 0.5],          // 拉开距离用远程压制（有远程技能的角色）
  breakAt: [1, 5.99, 3],      // 被连到第几下用腾空闪
  okiCharge: [0, 1, 0.35],    // 压起身时用蓄力（不可挡）的比例
  bait: [0, 1, 0.5],          // 骗闪倾向
  lead: [0.05, 0.6, 0.25],    // 血量领先多少开始避战
  ultSave: [0, 1, 0.3],       // 留着大招当无敌反打的倾向
  jg: [0, 1, 0.8],            // 用精准招架代替普通格挡的倾向
  back: [0, 1, 0.3],          // 立回中后撤诱招
  adapt: [0, 1.5, 1],         // 针对打法的力度（按双方角色特性调整，0 = 不针对）
};
const AI_GENE_KEYS = Object.keys(AI_GENE_DEF);
function aiDefaultGenes() { const g = {}; for (const k of AI_GENE_KEYS) g[k] = AI_GENE_DEF[k][2]; return g; }
// 训练好的数据：打包时写进 window.RENYING_AI_BRAIN；训练工具运行时会用 aiTuneReload 换一套
let AI_BRAIN = null;
function aiTuneReload() { AI_BRAIN = (typeof window !== 'undefined' && (window.RENYING_AI_TUNE || window.RENYING_AI_BRAIN)) || {}; }
function aiBrainData() { if (!AI_BRAIN) aiTuneReload(); return AI_BRAIN; }
function aiGenes(heroId) {
  const t = aiBrainData().genes, g = t && t[heroId];
  return g ? Object.assign(aiDefaultGenes(), g) : aiDefaultGenes();
}

// ---------- 4. 打击数据 ----------
// 每招：min/max 打得到的距离（对手身宽为 1 时），hit 按键到打中的秒数，dur 打空后多久能再动，blockable 能否格挡，adv 被挡后自己比对手早动多少秒
const AI_FRAME_DEFAULT = { min: 0, max: 0, hit: 0.3, dmg: 0, dur: 0.6, move: 0, blockable: true, adv: -0.2 };
function aiFrame(f, key) {
  const t = aiBrainData().frames, F = t && t[f.ch.id];
  if (F && F[key]) return F[key];
  // 没测过（比如直接打开 src）：普攻按招式表估算，技能当作打不到
  if (key === 'l1' || key === 'dl') { const m = f.moves[key]; return { min: 0, max: m.box[2] + 18, hit: m.su, dmg: m.dmg, dur: m.su + m.ac + m.rc, blockable: true, adv: -0.13 }; }
  return AI_FRAME_DEFAULT;
}
// 在距离 d 上按下这一招，几秒后打中（按实测表插值；没有表就用中位数）
function aiHitTime(F, d) {
  const h = F && F.ht;
  if (!h) return F ? F.hit : 0.3;
  const i = Math.max(0, Math.min(h.length - 1, Math.round((d - 20) / 20)));
  if (h[i]) return h[i];
  for (let k = 1; k < 6; k++) { if (h[i - k]) return h[i - k]; if (h[i + k]) return h[i + k]; }
  return F.hit;
}
// 这一招打在对手的架势上会削掉多少（和 applyHit 的算法一致）
function aiGuardLoss(att, def, dmg, gbMul) {
  const mr = Math.max(0.45, Math.min(2.5, ((att.ch.stat && att.ch.stat.weight) || 1) / ((def.ch.stat && def.ch.stat.weight) || 1)));
  return dmg * 1.5 * Math.sqrt(mr) * (gbMul || 1) / ((def.ch.stat && def.ch.stat.guardStab) || 1);
}
// 这一招在当前距离上打不打得到（按对手体型修正身宽）
function aiInRange(F, d, foe, slack = 0) {
  if (!F || F.max <= 0) return false;
  const w = 18 * ((foe && foe.size) || 1) - 18;
  return d >= F.min - slack && d <= F.max + w + slack;
}

// ---------- 5. 对手习惯 ----------
class FoeModel {
  constructor() {
    this.escHits = 3; this.escN = 0;        // 对手平均被连到第几下用腾空闪
    this.escRate = 0.5;                       // 被连时腾空闪的几率
    this.wake = { block: 1, attack: 1, escape: 1, skill: 1 };   // 起身选择次数
    this.blockRate = 0.5;                     // 我出手时对手挡住的比例
    this.jumpRate = 0.2;                      // 立回时对手跳的频率
    this.aggr = 0.5;                          // 对手主动出手的频率
    this.projRate = 0.3;
  }
  ema(k, v, a = 0.15) { this[k] += (v - this[k]) * a; }
  wakeTop() { let best = 'block', n = -1; for (const k in this.wake) if (this.wake[k] > n) { n = this.wake[k]; best = k; } return best; }
}

// ---------- 6. 大脑 ----------
const AI_FREE = ['idle', 'walk', 'block'];
const AI_ACT_KEYS = ['l1', 'dl', 'cs1', 'cs2', 'air', 'skill', 'skill2', 'special'];
const AI_ACT_REL = { l1: 1, dl: 0.75, cs1: 0.5, cs2: 0.4, air: 0.5 };   // 可靠程度：蓄力和跳入太好躲
const AI_HURT = ['hitstun', 'launched', 'knockdown', 'held'];
class AIBrain {
  constructor(ctrl, level) {
    this.c = ctrl;
    this.level = level;
    // level 可以是难度名，也可以是 { base: 'god', genes: {...} }（训练时给某一方换一套基因）
    if (level && typeof level === 'object' && level.base) { this.L = LEVELS[level.base] || LEVELS.god; this.geneOverride = level.genes; }
    else this.L = typeof level === 'object' ? level : (LEVELS[level] || LEVELS.normal);
    this.model = new FoeModel();
    this.heroId = null;
    this.g = aiDefaultGenes();
    this.next = 0; this.dir = 0; this.holdDown = 0; this.holdAtk = 0; this.queue = [];
    this.ev = ''; this.evT = 0; this.evReact = 0.2;   // 对手当前动作从什么时候开始、我多久能看出来
    this.defT = -1; this.defKey = '';                 // 这一招已经决定好怎么防
    this.mode = 'neutral'; this.modeT = 0;            // neutral 立回、keep 避战、bait 骗闪等闪、oki 压起身
    this.lastFoeState = ''; this.foeComboAtEsc = 0; this.myHitsInCombo = 0;
    this.chainT = 0; this.wakeWatch = false; this.okiPlan = null; this.baitX = 0;
    this.attacks = 0; this.blocked = 0;
  }
  // 新的一局：清掉这局的临时状态，对手习惯留着
  newRound() {
    this.queue.length = 0; this.dir = 0; this.holdDown = 0; this.holdAtk = 0; this.next = 0;
    this.mode = 'neutral'; this.okiPlan = null; this.defKey = ''; this.projKey = null; this.afterBlock = false; this.techRoll = undefined;
  }
  // ----- 输出 -----
  press(a, why) {
    // 按轻击 = 点按：如果正按着准备蓄力，先松手（不然轻击会被蓄力吞掉）
    if (a === 'light' && this.holdAtk > 0 && this.me && this.me.state !== 'charge') { this.holdAtk = 0; this.c.held.atk = false; }
    // 按住下（格挡）时跳和技能都出不来：先松开
    if (a === 'jump' || a === 'skill' || a === 'skill2') { this.holdDown = 0; this.c.held.down = false; }
    this.c.press(a);
    if (this.debug) { const st = (new Error().stack || '').split('\n')[2] || ''; this.debug.push([clock, a, why || (st.match(/AIBrain\.(\w+)/) || [])[1] || '']); }
  }
  // 计划一串按键：[按键, 几秒后, 'hit'（只在对手被打中/被定住时才按）]
  plan(list) { this.queue = list.map(([a, dt, cond]) => ({ at: clock + dt, a, cond })); }
  stopAll() { this.queue.length = 0; this.holdAtk = 0; this.c.held.atk = false; }
  chance(p) { return Math.random() < p; }
  err() { return this.L.error > 0 && Math.random() < this.L.error; }

  think(me, foe) {
    if (!foe || !me.ch || !foe.ch) return;
    if (this.heroId !== me.ch.id) { this.heroId = me.ch.id; this.g = this.geneOverride ? Object.assign(aiDefaultGenes(), this.geneOverride) : this.L.genes ? aiGenes(me.ch.id) : aiDefaultGenes(); }
    const c = this.c;
    if (me.veilT > 0) return this.blind(me);
    this.watch(me, foe);
    this.holdDown = Math.max(0, this.holdDown - STEP);
    const d = Math.abs(foe.x - me.x), to = Math.sign(foe.x - me.x) || 1;
    this.d = d; this.to = to; this.me = me; this.foe = foe;
    this.jumpHeld = false;

    // 本能：按优先级，处理了就不再往下想（会打断计划好的按键）；没事才按计划出招、想战术
    if (!this.reflex(me, foe, d, to)) {
      while (this.queue.length && this.queue[0].at <= clock) {
        const q = this.queue.shift(), a = q.a;
        if (q.cond === 'hit' && !(AI_HURT.includes(foe.state) || foe.jailT > 0 || foe.rooted)) { this.queue.length = 0; break; }
        if (a === 'chargeStart') { this.holdAtk = 9; this.chargeT0 = clock; c.atkT = clock - CHARGE_START + 0.001; }
        else if (a === 'chargeEnd') this.holdAtk = 0;
        else this.press(a, 'plan');
      }
      this.tactic(me, foe, d, to);
    }

    // 往后退快撞墙了：跳过对手头顶
    if (this.dir === -to && ((this.dir < 0 && me.x < WALL + 120) || (this.dir > 0 && me.x > STAGE_W - WALL - 120)) && me.onGround() && AI_FREE.includes(me.state)) {
      if (this.mode === 'keep' || this.chance(0.5)) { this.dir = to; if (!this.queue.length && this.chance(0.08)) this.plan([['jump', 0], ['jump', 0.22]]); }
    }
    if (me.state === 'special' && me.ch.ult === 'avalanche') this.steerAvalanche(me, foe);
    if (this.holdAtk > 0 && me.state !== 'charge' && clock - (this.chargeT0 || 0) > 0.42) this.holdAtk = 0;   // 蓄力被打断了：松手
    c.held.down = this.holdDown > 0;
    c.held.atk = this.holdAtk > 0;
    if (!c.held.atk && this.holdAtk <= 0) c.atkT = clock + 1e6;
    c.held.jump = this.jumpHeld || !!(me.ch.fly && clock < (this.flyUntil || 0));
    c.held.left = this.dir < 0; c.held.right = this.dir > 0;
  }

  // ----- 感知：对手换动作时记下时间；我要过 react 秒才“看得见” -----
  watch(me, foe) {
    const key = foe.state + ':' + (foe.moveName && foe.state === 'attack' ? foe.moveName : foe.skill || foe.sp || '');
    if (key !== this.ev) {
      this.prevEv = this.ev; this.ev = key; this.evT = clock;
      this.evReact = rand(this.L.react[0], this.L.react[1]);
      this.skillD0 = Math.abs(foe.x - me.x);
      this.onFoeEvent(me, foe);
    }
    this.seen = clock - this.evT >= this.evReact;
    this.since = clock - this.evT;
  }
  // 记对手习惯
  onFoeEvent(me, foe) {
    const M_ = this.model, prev = this.prevEv || '';
    if (foe.escInvul && foe.state === 'air' && /^(hitstun|launched|knockdown)/.test(prev)) {
      M_.escN++; M_.escHits += ((foe.lastComboHits || this.myHitsInCombo || 2) - M_.escHits) * 0.35;
    }
    if (/^getup/.test(prev)) {
      const k = foe.escInvul ? 'escape' : foe.state === 'block' ? 'block' : foe.state === 'attack' || foe.state === 'charge' ? 'attack' : foe.state === 'skill' || foe.state === 'special' ? 'skill' : null;
      if (k) { for (const w in M_.wake) M_.wake[w] *= 0.8; M_.wake[k]++; }   // 旧习惯逐渐淡忘：对手中途换打法也能跟上
    }
    if (foe.state === 'air' && !foe.escInvul && /^(idle|walk)/.test(prev)) M_.ema('jumpRate', 1, 0.1);
    else if (foe.state === 'attack' || foe.state === 'skill') M_.ema('aggr', 1, 0.08);
    if (foe.state === 'skill' && AI_KIT[foe.skill] && AI_KIT[foe.skill].role === 'proj') M_.ema('projRate', 1, 0.1);
  }

  // ======================= 本能反应 =======================
  reflex(me, foe, d, to) {
    const L = this.L, g = this.g;
    // 记连段：对手被我连了几下
    if (AI_FREE.includes(me.state) || me.state === 'attack' || me.state === 'air') this.hpBeforeCombo = me.hp;
    if (AI_HURT.includes(foe.state)) this.myHitsInCombo = foe.comboHits || this.myHitsInCombo; else if (AI_FREE.includes(foe.state)) this.myHitsInCombo = 0;
    if (foe.comboHits) foe.lastComboHits = foe.comboHits;

    // 1. 被打飞：要么腾空闪破连，要么按住跳落地受身
    if (me.state === 'launched' || me.state === 'hitstun' || me.state === 'knockdown') {
      this.dir = 0; this.stopAll();
      if (this.shouldBreak(me, foe)) { this.press('dash'); return true; }
      if (me.state === 'launched' && !me.spiked && this.chance(L.tech * 0.25 + (this.techRoll === undefined ? 0 : 0))) this.techRoll = true;
      if (me.state === 'launched') {
        if (this.techRoll === undefined) this.techRoll = Math.random() < L.tech;
        this.jumpHeld = this.techRoll && me.vy > 0 && me.y > -140;
        this.dir = this.techRoll ? (this.mode === 'keep' || this.chance(0.5) ? -to : to) : 0;
      }
      if (me.state === 'knockdown') { if (!this.wasDown) this.downId = (this.downId || 0) + 1; this.planWakeup(me, foe); }
      this.wasDown = me.state === 'knockdown';
      return true;
    }
    this.techRoll = undefined;
    if (me.state === 'getup') { this.planWakeup(me, foe); return true; }
    if (me.state === 'held' || me.state === 'special') return true;

    // 2. 腾空闪在空中：落地点躲开对手
    if (me.escInvul && !me.onGround()) { this.dir = foe.state === 'attack' || this.mode === 'keep' ? -to : (this.chance(0.5) ? to : -to); return true; }

    // 3. 防守：对手出招 / 飞行道具 / 陷阱
    if (this.defend(me, foe, d, to)) return true;

    // 4. 墨羽墨阵：对手踩上就引爆
    if (me.ch.skill === 'inktrap' && me.skillCD <= 0) {
      const p = projs.find(q => q.kind === 'trap' && q.owner === me.idx && !q.dead && q.delay <= 0);
      if (p && foe.invul <= 0 && Math.abs(foe.x - p.x) < 90 && foe.y > -120 && this.seen) { this.press('skill'); }
    }
    // 5. 绯影影遁后：1.5 秒内打不中就影归
    return false;
  }

  // 该不该用腾空闪破连（breaker 越高越会算）
  shouldBreak(me, foe) {
    const L = this.L, g = this.g;
    if (me.breakCD > 0 || me.jailT > 0 || me.drinkT > 0 || me.t < 0.06) return false;
    if (this.err()) return false;
    const hits = me.comboHits || 0;
    // 低难度：被连多了随机闪
    if (L.breaker < 0.5) return hits >= 3 && Math.random() < L.breaker * 0.04;
    // 对手大招锁定中闪不了；对手大招放出来了就闪
    if (foe.state === 'special') return Math.random() < L.breaker * 0.5;
    // 对手骗闪：对手停手在等我闪 → 先忍
    const foeWaiting = AI_FREE.includes(foe.state) && Math.abs(foe.x - me.x) > 90;
    if (foeWaiting && me.state !== 'launched' && L.read > 0.5) return false;
    // 被禁锢/重击/破防：伤害会很大，马上闪
    const danger = me.rooted || (me.state === 'hitstun' && me.stun - me.t > 0.5) || foe.buffT > 0 || (foe.ch.passive === 'bind' && me.hookedT > 0);
    if (danger && hits >= 1) return true;
    if (me.state === 'knockdown') return foe.state === 'charge' || (foe.meter >= 100 && L.breaker > 0.8 && me.t > 0.4);   // 压起身：对手在蓄不可挡的力或等着放大招
    const at = Math.max(1, Math.floor(g.breakAt)), lost = (this.hpBeforeCombo || me.hp) - me.hp;
    if (hits >= at && lost >= 30) return me.hp < me.maxHp * 0.5 || hits >= at + 1 || Math.random() < L.breaker * 0.6;
    return false;
  }

  // 起身：倒地时预先决定起身做什么（格挡 / 腾空闪 / 反打 / 后滚）
  planWakeup(me, foe) {
    const L = this.L;
    this.holdAtk = 0; this.dir = 0;
    // 每次倒地只掷一次骰子：这次起身打算怎么办（低难度不会每帧都“想起来”）
    if (!this.wake || this.wake.id !== this.downId) {
      this.wake = { id: this.downId, esc: Math.random() < L.breaker, ult: Math.random() < L.ult * this.g.ultSave, counter: Math.random() < L.skill * 0.7, block: Math.random() < L.block * 0.9 };
    }
    const W = this.wake, foeNear = Math.abs(foe.x - me.x) < 260;
    // 对手在蓄不可挡的力或放大招 → 起身闪
    if (W.esc && me.breakCD <= 0 && (foe.state === 'charge' || foe.state === 'special') && foeNear) { this.press('dash'); return; }
    // 有大招：被压起身时用大招无敌反打
    if (W.ult && me.state === 'getup' && me.meter >= 100 && foeNear && (foe.state === 'attack' || foe.state === 'charge')) { this.press('special'); return; }
    // 架招型角色：起身架招
    const q = AI_KIT[me.ch.skill], r = AI_KIT[me.ch.skill2];
    if (W.counter && me.state === 'getup' && foeNear && foe.state === 'attack') {
      if (q && q.role === 'counter' && me.skillCD <= 0) { this.press('skill'); return; }
      if (r && r.role === 'counter' && me.skill2CD <= 0) { this.press('skill2'); return; }
    }
    // 默认：起身按住格挡（低难度有时不挡）
    if (W.block && (foeNear || me.state === 'getup')) this.holdDown = 0.25;
  }


  // ======================= 防守 =======================
  defend(me, foe, d, to) {
    const L = this.L, g = this.g;
    // free：能做任何事；canBlock：至少能转成格挡（出招前段按住格挡可以收招）
    const free = me.onGround() && AI_FREE.includes(me.state);
    const canBlock = free || (me.onGround() && me.state === 'attack' && me.move && me.t < me.move.su * 0.6 && me.moveName !== 'dl');
    const inAir = !me.onGround();
    // 对手的近身招 / 技能 / 大招
    const th = this.threat(me, foe, d);
    if (th) {
      if (!this.seen && L.react[0] > 0.03) return th.t < 0.02 && this.holdDown > 0;   // 还没反应过来：保持原样
      if (this.defKey !== this.ev) { this.defKey = this.ev; this.defRoll = Math.random(); this.defPlan = this.chooseDefense(me, foe, d, to, th, free); }
      else if (th.kind === 'charge') this.defPlan = this.chooseDefense(me, foe, d, to, th, free);   // 蓄力每帧重算：越蓄越危险
      const p = this.defPlan;
      if (!p) return false;
      if (!free && p.how !== 'block' && p.how !== 'jg' && p.how !== 'escape' && p.how !== 'ult') return canBlock ? this.runDefense(me, foe, d, to, th, { how: 'block' }, canBlock) : false;
      return this.runDefense(me, foe, d, to, th, p, canBlock);
    }
    if (this.defKey && !th) this.defKey = '';
    // 对手开着持续的范围技（枪旋、旋锤、雷铠……）：别往里走，等它转完
    if (foe.state === 'skill' && AI_KIT[foe.skill] && (AI_KIT[foe.skill].role === 'zone' || AI_KIT[foe.skill].role === 'counter') && this.seen) {
      const F = aiFrame(foe, foe.skill === foe.ch.skill2 ? 'skill2' : 'skill'), left = F.dur - this.since, reach = Math.max(F.max, 150) + 30;
      if (left > 0.05 && d < reach && foe.skill !== 'mirror') {
        this.stopAll();
        if (canBlock && d < reach - 40 && AI_KIT[foe.skill].role === 'zone') { this.holdDown = Math.max(this.holdDown, 0.1); this.dir = -to; }
        else this.dir = -to;
        return true;
      }
    }
    // 飞行道具
    const pr = this.incomingProj(me);
    if (pr) {
      if (this.projKey !== pr.p) { this.projKey = pr.p; this.projPlan = Math.random() < L.block ? this.chooseProjDefense(me, foe, pr) : 'none'; }
      const p = this.projPlan;
      if (p === 'block' && canBlock) { this.holdDown = Math.max(this.holdDown, 0.12); this.dir = 0; this.stopAll(); return true; }
      if (p === 'jump' && me.onGround() && free) { this.stopAll(); this.press('jump'); this.dir = this.mode === 'keep' ? -to : to; return true; }
      if (p === 'escape' && me.breakCD <= 0) { this.stopAll(); this.press('dash'); return true; }
      if (p === 'reflect' || p === 'clash') {
        const sl = p === 'reflect' ? this.reflectSlot(me) : this.projSlot(me);
        if (sl && free) { this.stopAll(); this.press(sl); return true; }
        if (me.state === 'skill') return true;   // 已经在放了
        this.projPlan = 'block';
      }
    } else this.projKey = null;
    // 地上的雷印、墨阵、亭子、爆米花：走开
    const zone = this.dangerZone(me);
    if (zone && zone.stuck && zone.delay < 0.1 && me.breakCD <= 0 && L.breaker > 0.5) { this.stopAll(); this.press('dash'); return true; }
    if (zone && (me.onGround() || zone.kind === 'bolt')) {
      if (Math.random() < L.block + 0.1) { this.dir = me.x >= zone.x ? 1 : -1; if (zone.kind === 'trap' && free && Math.abs(zone.x - me.x) < 70) this.press('jump'); return zone.urgent && canBlock; }
    }
    return false;
  }

  // 对手这一招会不会打到我：返回 { t 距打中的秒数, end 判定结束的秒数, blockable, melee, ult, kind }
  threat(me, foe, d) {
    if (foe.hp <= 0) return null;
    if (foe.state === 'attack' && foe.move) {
      const m = foe.move, tA = m.su - foe.t, tE = m.su + m.ac - foe.t;
      if (tE < 0) return null;
      const reach = m.box[2] + 18 * (me.size || 1) + (m.lunge || 0) * m.ac * 0.8 + (m.track ? 160 : 0) + 10;
      const facing = Math.sign(me.x - foe.x) === foe.face || d < 30;
      if (!facing || d > reach) return null;
      if (m.air && foe.y < -150 && me.onGround()) return null;
      return { t: Math.max(0, tA), end: tE, blockable: !m.unblockable, melee: true, kind: 'attack', dmg: m.dmg };
    }
    if (foe.state === 'charge') {
      // 蓄力：松手就是 cs1（可挡）或蓄满 cs2（不可挡、冲得远）
      const full = foe.t >= CHARGE_FULL - 0.1, F = aiFrame(foe, full ? 'cs2' : 'cs1');
      if (d > F.max + 40) return null;
      return { t: full ? 0.06 : Math.max(0.05, CHARGE_FULL - foe.t), end: 0.25, blockable: !full, melee: true, kind: 'charge', dmg: F.dmg };
    }
    if (foe.state === 'skill' && foe.skill) {
      const slot = foe.skill === foe.ch.skill2 ? 'skill2' : 'skill', F = aiFrame(foe, slot), K = AI_KIT[foe.skill] || {};
      if (K.role === 'counter' || K.role === 'self' || F.max <= 0) return null;
      if (K.role === 'proj' || K.role === 'trap') return null;   // 飞行道具出手后按道具处理
      if (!aiInRange(F, d, me, 40)) return null;
      const tA = aiHitTime(F, this.skillD0 || d) - this.since;
      if (tA < -0.35) return null;
      return { t: Math.max(0, tA), end: tA + 0.25, blockable: F.blockable !== false, melee: !K.groundOnly, kind: 'skill', dmg: F.dmg, groundOnly: !!K.groundOnly, gb: foe.skill === 'ironwall' ? 1.5 : 1 };
    }
    if (foe.state === 'special' && (foe.sp === 'charge' || foe.sp === 'dash' || foe.sp === 'leap' || foe.sp === 'rush' || foe.sp === 'stop')) {
      const U = AI_ULT[foe.ch.ult] || {}, F = aiFrame(foe, 'special');
      if (U.contact && d > F.max + 80) return null;
      return { t: Math.max(0, aiHitTime(F, this.skillD0 || d) - this.since), end: 0.6, blockable: F.blockable !== false && !U.far, melee: !!U.contact, kind: 'ult', dmg: F.dmg || 80 };
    }
    return null;
  }

  // 选防法：精准招架 / 格挡 / 架招 / 抢先出手 / 后撤 / 跳 / 腾空闪 / 大招反打
  chooseDefense(me, foe, d, to, th, free) {
    const L = this.L, g = this.g;
    if (this.defRoll > L.block || (L.error > 0 && this.defRoll < L.error * L.block)) return null;
    if (th.kind === 'charge') return this.chargeDefense(me, foe, d, to, free);
    const myQ = AI_KIT[me.ch.skill] || {}, myR = AI_KIT[me.ch.skill2] || {};
    // 月华月镜 / 雷鸣雷铠：近身来招直接架
    if (th.melee && !th.ult && L.skill > 0.5) {
      if (myQ.role === 'counter' && me.skillCD <= 0 && free) return { how: 'counter', slot: 'skill' };
      if (myR.role === 'counter' && me.skill2CD <= 0 && free && me.ch.skill2 !== 'echowall') return { how: 'counter', slot: 'skill2' };
    }
    // 地波：跳过去最好（还能落地反打）
    if (th.groundOnly && me.onGround()) return { how: 'jump' };
    if (!th.blockable) {
      // 不可挡：躲不开就闪或大招无敌
      if (me.meter >= 100 && L.ult > 0.7 && th.dmg >= 60 && me.state !== 'skill') return { how: 'ult' };
      if (me.breakCD <= 0) return { how: 'escape' };
      return { how: th.t > 0.2 ? 'back' : 'block' };
    }
    // 抢先出手：我的最快一招比对手先打到
    if (free && th.kind === 'attack' && L.punish > 0.6) {
      const f1 = aiFrame(me, 'l1'), fd = aiFrame(me, 'dl');
      if (aiInRange(fd, d, foe) && fd.hit < th.t - 0.02 && Math.random() < 0.5 * L.punish) return { how: 'interrupt', key: 'dl' };
      if (aiInRange(f1, d, foe) && f1.hit < th.t - 0.02 && Math.random() < 0.5 * L.punish) return { how: 'interrupt', key: 'l1' };
    }
    // 这一下会把架势打崩：别硬挡，闪开或跳开
    if (L.breaker > 0.6 && th.dmg > 20 && (me.guard || 100) <= aiGuardLoss(foe, me, th.dmg, th.gb) + 4) {
      if (me.breakCD <= 0) return { how: 'escape' };
      const anti = th.kind === 'skill' && AI_KIT[foe.skill] && AI_KIT[foe.skill].anti;
      return th.kind === 'skill' && !anti && th.t > 0.12 ? { how: 'jump' } : { how: 'back' };
    }
    if (th.kind === 'ult' && me.breakCD <= 0 && L.breaker > 0.6) return { how: 'escape' };
    // 精准招架：按住格挡的时机掐在打中前 0.09 秒以内
    if (!th.melee) return { how: 'block' };
    if (L.jg > 0 && Math.random() < L.jg * (0.4 + 0.6 * g.jg)) return { how: 'jg', lead: rand(0.015, 0.065 + 0.04 * (1 - L.jg)) };
    return { how: 'block' };
  }
  // 对手在蓄力：蓄满就是不可挡、冲得很远（约 350）、出手只要 0.04 秒的冲斩，看见出手再躲来不及。
  // 所以趁没蓄满：够得着就先打断；来得及就退出冲斩范围；退不开（墙角）就在蓄满前一刻闪或跳
  chargeDefense(me, foe, d, to, free) {
    const left = CHARGE_FULL - foe.t, F2 = aiFrame(foe, 'cs2');
    if (free && left > 0.04) {
      let best = null;
      for (const k of ['dl', 'l1']) { const F = aiFrame(me, k); if (aiInRange(F, d, foe) && F.hit < left - 0.02 && (!best || F.dmg > best.dmg)) best = { key: k, dmg: F.dmg }; }
      if (best && this.L.punish > 0.5) return { how: 'interrupt', key: best.key };
    }
    const out = F2.max + 40 - d;
    if (out <= 0) return { how: 'hold' };
    const wallBehind = to > 0 ? me.x - WALL < out + 20 : STAGE_W - WALL - me.x < out + 20;
    if (!wallBehind && out / wk(me) < left + 0.12) return { how: 'back' };
    if (left > 0.06) return { how: 'back' };
    if (me.breakCD <= 0 && this.L.breaker > 0.5) return { how: 'escape' };
    // 闪不了：跳起来会被冲斩挑飞（冲斩打得到半空），只能抢在它出手前打一下
    const f1 = aiFrame(me, 'l1');
    return free && aiInRange(f1, d, foe) ? { how: 'interrupt', key: 'l1' } : { how: 'back' };
  }
  runDefense(me, foe, d, to, th, p, free) {
    switch (p.how) {
      case 'hold': this.dir = d < aiFrame(foe, 'cs2').max + 80 ? -to : 0; this.holdDown = 0; return true;
      case 'counter': if (free) { this.stopAll(); this.press(p.slot); } return true;
      case 'jump': if (me.onGround() && free) { this.stopAll(); this.press('jump'); this.dir = -to; } return true;
      case 'back': this.stopAll(); this.dir = -to; this.holdDown = 0; return true;
      case 'escape': if (th.t < 0.12 || th.kind === 'charge') { this.stopAll(); this.press('dash'); } return true;
      case 'ult': if (me.meter >= 100 && th.t < 0.3) { this.stopAll(); this.press('special'); } else if (me.breakCD <= 0 && th.t < 0.1) this.press('dash'); return true;
      case 'interrupt': if (free) { this.stopAll(); if (p.key === 'dl') { this.holdDown = 0.06; this.press('light'); } else { this.holdDown = 0; this.press('light'); } p.how = 'block'; } return true;
      case 'jg':
        if (!free && me.state !== 'blockstun') return false;
        this.stopAll(); this.dir = 0;
        // 太早按住会超过精准窗口：先松开，最后一刻再按
        if (th.t > p.lead) { if (me.state === 'block' && (me.blockT || 0) > 0.02) this.holdDown = 0; else this.holdDown = 0; return true; }
        this.holdDown = Math.max(this.holdDown, th.end + 0.12);
        return true;
      case 'block':
        if (!free && me.state !== 'blockstun') return false;
        this.stopAll(); this.dir = 0; this.holdDown = Math.max(this.holdDown, th.end + 0.1);
        return true;
    }
    return false;
  }

  // 朝我飞来的暗器：返回 { p, t 多久到, unblockable, ground }
  incomingProj(me) {
    let best = null;
    for (const p of projs) {
      if (p.dead || p.fx || p.dmg <= 0 || (p.owner % 2) === (me.idx % 2) || p.kind === 'trap') continue;
      if (p.delay > 0) continue;
      const dx = me.x - p.x, vx = p.vx || 0;
      if (Math.abs(dx) > 520) continue;
      let t;
      if (Math.abs(vx) < 1) { if (Math.abs(dx) > (p.w || 40) / 2 + 30) continue; t = 0; }
      else { if (Math.sign(dx) !== Math.sign(vx)) continue; t = Math.max(0, (Math.abs(dx) - (p.w || 40) / 2 - 18) / Math.abs(vx)); }
      if (t > 0.45) continue;
      const py = p.y + (p.vy || 0) * t + (p.g ? 0.5 * p.g * t * t : 0);
      if (py < me.y - 112 - (p.h || 40) / 2 - 10 || py > me.y + 20 + (p.h || 40) / 2) continue;
      if (!best || t < best.t) best = { p, t, unblockable: !!p.unblockable || !!p.ult, ground: !!p.groundOnly };
    }
    return best;
  }
  chooseProjDefense(me, foe, pr) {
    const L = this.L;
    const rs = this.reflectSlot(me);
    if (rs && L.skill > 0.6 && !pr.p.ult) return 'reflect';
    if (pr.ground) return 'jump';
    // 不可挡：能闪就闪；从天上落下的（亭子、雷）跳也躲不开，交给“走开”；横着飞的才跳
    if (pr.unblockable) return me.breakCD <= 0 && pr.t < 0.2 ? 'escape' : (pr.p.vx ? 'jump' : 'none');
    if (!me.onGround()) return 'none';
    // 有剑气类能对消的远程招，且对手离得远：对消
    const ps = this.projSlot(me);
    if (ps && L.skill > 0.85 && pr.t > 0.12 && Math.random() < 0.3) return 'clash';
    if (this.L.matchup && this.matchup(me, foe).rush && Math.abs(foe.x - me.x) > 300 && Math.random() < 0.4 * this.g.adapt) return 'jump';   // 被远程压：跳过去拉近
    return 'block';   // 半空挡不了，对手的大招和下一发暗器专打跳起来的人
  }
  reflectSlot(me) {
    const q = AI_KIT[me.ch.skill], r = AI_KIT[me.ch.skill2];
    if (q && q.reflect && me.skillCD <= 0) return 'skill';
    if (r && r.reflect && me.skill2CD <= 0) return 'skill2';
    return null;
  }
  projSlot(me) {
    const q = AI_KIT[me.ch.skill], r = AI_KIT[me.ch.skill2];
    if (q && q.role === 'proj' && me.skillCD <= 0) return 'skill';
    if (r && r.role === 'proj' && me.skill2CD <= 0) return 'skill2';
    return null;
  }
  dangerZone(me) {
    for (const p of projs) {
      if (p.dead || (p.owner % 2) === (me.idx % 2) || p.dmg <= 0) continue;
      const half = (p.w || 60) / 2 + 22;
      if (Math.abs(p.x - me.x) > half) continue;
      // 从天上落下、还没落地的（雷、亭子、天网、琴音）：走得出去就走，走不出去就在落地前闪
      const stuck = p.delay > 0 && (half - Math.abs(p.x - me.x)) / wk(me) > p.delay;
      if ((p.kind === 'bolt' || p.kind === 'pavilion' || p.kind === 'net') && p.delay > 0) return { x: p.x, kind: p.kind, urgent: true, stuck, delay: p.delay };
      if (p.kind === 'trap') return { x: p.x, kind: 'trap', urgent: false };
      if (p.kind === 'popcorn' || p.kind === 'chord') return { x: p.x, kind: p.kind, urgent: p.delay > 0, stuck, delay: p.delay };
    }
    return null;
  }

  // ======================= 战术 =======================
  tactic(me, foe, d, to) {
    const L = this.L;
    // 自己正在出招：连段、取消、蓄力
    if (me.state === 'attack') return this.inAttack(me, foe, d, to);
    if (me.state === 'charge') return this.inCharge(me, foe, d, to);
    if (me.state === 'skill') { this.dir = (me.skill === 'spin' || me.skill === 'whirl') ? to : 0; return; }
    if (me.state === 'blockstun') { this.holdDown = Math.max(this.holdDown, 0.05); this.afterBlock = true; return; }
    if (me.state === 'dash') return;
    if (this.holdAtk > 0 && AI_FREE.includes(me.state) && clock - (this.chargeT0 || 0) < 0.42) return;   // 正在按住攻击等着进蓄力
    // 刚挡完一招：确反
    if (this.afterBlock && AI_FREE.includes(me.state)) { this.afterBlock = false; if (this.punish(me, foe, d, to, true)) return; }

    // 对手关在醉翁亭里（动不了、打不飞）：冲过去一直普攻，能打多少打多少
    if (foe.jailT > 0.1 && foe.hp > 0 && AI_FREE.includes(me.state) && me.onGround()) return this.beatJailed(me, foe, d, to);
    // 局势
    this.updateMode(me, foe, d);
    // 抓破绽（对手收招、落地、被打僵直）
    if (this.punish(me, foe, d, to, false)) return;
    // 压起身 / 骗闪等落地
    if (this.mode === 'oki') return this.oki(me, foe, d, to);
    if (this.mode === 'bait') return this.baitWait(me, foe, d, to);
    // 空中
    if (!me.onGround()) return this.inAir(me, foe, d, to);
    if (clock < this.next || this.queue.length || this.holdDown > 0.05) return;
    this.next = clock + rand(L.think[0], L.think[1]);
    if (this.mode === 'keep') return this.keepAway(me, foe, d, to);
    this.neutral(me, foe, d, to);
  }

  // 局势判断：避战 / 压起身 / 骗闪 / 立回
  updateMode(me, foe, d) {
    const L = this.L, g = this.g;
    const mine = me.hp / me.maxHp, theirs = foe.hp / foe.maxHp, lead = mine - theirs;
    const late = M.ot || M.timer < 22;
    if (this.mode === 'bait') {
      const over = foe.breakCD > 0 && !foe.escInvul && foe.onGround();   // 对手闪用掉了、已经落地
      if (!over && clock - this.modeT < 1.2 && !(AI_FREE.includes(foe.state) && clock - this.modeT > 0.45)) return;
    }
    if ((foe.state === 'knockdown' || (foe.state === 'getup' && foe.invul > 0) || (foe.state === 'launched' && foe.vy > 0 && foe.y > -160)) && Math.random() < (this.mode === 'oki' ? 1 : L.oki)) { if (this.mode !== 'oki') { this.mode = 'oki'; this.modeT = clock; this.okiPlan = null; } return; }
    if (this.mode === 'oki' && (foe.state === 'getup' || foe.state === 'knockdown' || foe.state === 'launched')) return;
    if (L.lead > 0 && lead > g.lead && (late || lead > g.lead + 0.25) && Math.random() < L.lead && !(typeof is2v2 === 'function' && is2v2())) { this.mode = 'keep'; return; }
    this.mode = 'neutral';
  }

  // ----- 连段：打中就接下一下；到时机取消接技能；对手有闪就骗 -----
  inAttack(me, foe, d, to) {
    const L = this.L, g = this.g, m = me.move;
    if (!m) return;
    const t = me.t, act0 = m.su, act1 = m.su + m.ac;
    const confirm = me.hitConfirmed;
    // 打空/被挡：后段按住格挡收招（被挡后安全一点）
    if (t >= act1 && !confirm && !m.next.light) { if (Math.random() < L.block * 0.5) this.holdDown = 0.15; return; }
    if (t < act0 + m.ac * 0.6) return;
    const hits = foe.comboHits || 0;
    if (foe.jailT > 0 && foe.hp > 0) { if (m.next.light) this.press('light'); return; }   // 关在亭子里：普攻一路打到底
    if (confirm) {
      // 骗闪：对手腾空闪好了，而且以前在第 k 下会闪 → 停手等他闪
      if (this.shouldBait(me, foe, hits)) { this.mode = 'bait'; this.modeT = clock; this.holdDown = 0.2; return; }
      // 取消接技能
      if (hits >= Math.floor(g.cancelAt) || !m.next.light) {
        const sk = this.pickComboSkill(me, foe, d);
        if (sk && Math.random() < L.cancel * (0.3 + 0.7 * g.cancel)) { this.press(sk); this.afterSkill(me, sk); return; }
      }
      // 大招接在连段里（贴身型）：普攻不能直接取消成大招，等收招前一刻按（缓冲会接上）
      if (me.meter >= 100 && act1 + m.rc - t < 0.12 && this.ultWouldHit(me, foe, d, true) && Math.random() < L.ult * (1 - g.ultSave * 0.5)) { this.press('special'); return; }
      if (m.next.light && hits < L.combo + (this.err() ? -1 : 0)) { this.press('light'); return; }
      // 挑飞后追击：跳起来空中再打
      if (m.launch && L.combo >= 5 && foe.juggle < 2 && Math.random() < L.punish) { this.plan([['jump', 0.02], ['light', 0.22], ['light', 0.42]]); return; }
      return;
    }
    // 被挡：连段继续（对手按住格挡时，连段压架势）或停手
    if (foe.state === 'blockstun' || foe.state === 'block') {
      this.attacks++; this.blocked++;
      const guardLow = (foe.guard || 100) < 35;
      if (m.next.light && (guardLow || Math.random() < 0.35 * L.aggr) && hits < 4) this.press('light');
      else if (Math.random() < L.block * 0.7) this.holdDown = 0.2;
    }
  }
  inCharge(me, foe, d, to) {
    // 蓄力：到预定时间松手；对手冲上来先松手打 cs1
    this.dir = d > 140 ? to : 0;
    const full = me.t >= CHARGE_FULL, F = aiFrame(me, full ? 'cs2' : 'cs1');
    const threatened = foe.state === 'attack' && d < 160;
    if ((full && (this.chargeTo === 'cs2' || this.chargeTo === undefined)) || (!full && threatened && aiInRange(aiFrame(me, 'cs1'), d, foe))) {
      if (aiInRange(F, d, foe, 10) || me.t > CHARGE_FULL + 0.6 || threatened) this.holdAtk = 0;
    }
    if (this.chargeTo === 'cs1' && me.t >= 0.12 && aiInRange(F, d, foe, 5)) this.holdAtk = 0;
    if (me.t > 2.2) this.holdAtk = 0;
  }
  // 连段收尾用哪个技能（打得到、冷却好了、伤害最高）
  pickComboSkill(me, foe, d) {
    let best = null, bd = 0;
    for (const slot of ['skill', 'skill2']) {
      const id = slot === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id];
      if (!K || !K.combo || (slot === 'skill' ? me.skillCD : me.skill2CD) > 0) continue;
      const S = SKILLS[id]; if (S.can && !S.can(me)) continue;
      if (K.use && !K.use(me, foe, d, this)) continue;
      const F = aiFrame(me, slot);
      if (!aiInRange(F, d, foe, 15)) continue;
      if (K.groundOnly && !foe.onGround()) continue;
      if (F.dmg > bd) { bd = F.dmg; best = slot; }
    }
    return best;
  }
  afterSkill(me, slot) {
    const id = slot === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id];
    if (!K) return;
    // 技能打中后的追击（只在真的打中时才按）
    if (id === 'gale') this.plan([['skill2', 0.42, 'hit']]);   // 疾风斩中了剑气立刻好：接剑气
    else if (id === 'blink') this.plan([['light', 0.5], ['light', 0.68, 'hit'], ['light', 0.86, 'hit']]);   // 影遁后下一击加伤
    else if (id === 'hook') this.plan([['light', 0.44, 'hit'], ['light', 0.6, 'hit'], ['light', 0.76, 'hit']]);
    else if (id === 'thunderfist') this.plan([['light', 0.44, 'hit'], ['light', 0.6, 'hit']]);
  }
  shouldBait(me, foe, hits) {
    const L = this.L, g = this.g;
    if (L.bait <= 0 || foe.breakCD > 0 || foe.ch.id === undefined) return false;
    const k = Math.max(1, Math.round(this.model.escN ? this.model.escHits : 3));
    return hits >= k - 1 && hits >= 1 && Math.random() < L.bait * g.bait * (this.model.escN ? 0.9 : 0.35);
  }

  // ----- 抓破绽 -----
  punish(me, foe, d, to, afterBlock) {
    const L = this.L;
    if (!AI_FREE.includes(me.state) || !me.onGround()) return false;
    if (foe.invul > 0.02 || foe.hp <= 0) return false;
    let window = -1;   // 对手还要多久才能动
    if (afterBlock && foe.state === 'attack' && foe.move) window = foe.move.su + foe.move.ac + foe.move.rc - foe.t;
    else if (foe.state === 'attack' && foe.move && foe.t > foe.move.su + foe.move.ac && !foe.hitConfirmed) window = foe.move.su + foe.move.ac + foe.move.rc - foe.t;
    else if (foe.state === 'skill' && this.seen) {
      const slot = foe.skill === foe.ch.skill2 ? 'skill2' : 'skill', F = aiFrame(foe, slot), K = AI_KIT[foe.skill] || {};
      const left = F.dur - this.since;
      if (K.role === 'counter') { const active = (foe.parryT || 0) > 0 || (foe.thunderGuardT || 0) > 0 || (foe.reflectT || 0) > 0; if (active) return this.respectCounter(me, foe, d, to); window = left; }
      else if (F.hit < this.since) window = left;
    } else if (foe.state === 'getup' && foe.escInvul === false && foe.t >= 0.15) window = 0.3 - foe.t;
    else if (foe.state === 'hitstun' && !afterBlock) window = foe.stun - foe.t;
    else if (foe.state === 'special' && foe.sp === 'miss') window = 0.42 - foe.t;
    else if (foe.jailT > 0) window = foe.jailT;
    if (window <= 0) return false;
    if (!afterBlock && !this.seen && foe.state !== 'hitstun' && !(foe.jailT > 0)) return false;
    if (Math.random() > L.punish && !(foe.jailT > 0)) return false;
    // 选能在窗口内打到、伤害最高的一招
    const opts = this.punishOptions(me, foe, d, window);
    if (!opts) {
      // 打不到：往前走近一点，下次再抓
      if (window > 0.25 && d > 60) this.dir = to;
      return false;
    }
    this.stopAll();
    this.attacks++;
    if (opts === 'special') this.press('special');
    else if (opts === 'skill' || opts === 'skill2') { this.press(opts); this.afterSkill(me, opts); }
    else if (opts === 'dl') { this.holdDown = 0.05; this.press('light'); }
    else { this.holdDown = 0; this.press('light'); }
    return true;
  }
  punishOptions(me, foe, d, window) {
    let best = null, bv = 0;
    const consider = (key, F, v) => { if (aiInRange(F, d, foe, 5) && F.hit < window + 0.02 && v > bv) { bv = v; best = key; } };
    if (me.meter >= 100 && this.ultWouldHit(me, foe, d, false)) consider('special', aiFrame(me, 'special'), aiFrame(me, 'special').dmg * 1.2);
    for (const slot of ['skill', 'skill2']) {
      const id = slot === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id];
      if (!K || (slot === 'skill' ? me.skillCD : me.skill2CD) > 0 || K.role === 'counter' || K.role === 'self') continue;
      const S = SKILLS[id]; if (S.can && !S.can(me)) continue;
      if (K.use && !K.use(me, foe, d, this)) continue;
      if (K.groundOnly && !foe.onGround()) continue;
      consider(slot, aiFrame(me, slot), aiFrame(me, slot).dmg);
    }
    const f1 = aiFrame(me, 'l1');
    consider('l1', f1, f1.dmg * 3.2);   // 轻击能接一整套
    consider('dl', aiFrame(me, 'dl'), aiFrame(me, 'dl').dmg * 3);
    return best;
  }
  beatJailed(me, foe, d, to) {
    const F = aiFrame(me, 'l1');
    this.queue.length = 0; this.holdDown = 0;
    if (aiInRange(F, d, foe, -6)) { this.dir = 0; this.press('light', 'jail'); }
    else this.dir = to;
  }
  // 对手开着架招（月镜、雷铠、回音壁）：别打进去，等它收招
  respectCounter(me, foe, d, to) {
    this.stopAll();
    if (foe.skill === 'echowall') { if (d < 140) this.dir = -to; return true; }
    if (d < 200) this.dir = -to; else this.dir = 0;
    return true;
  }

  // ----- 压起身 -----
  oki(me, foe, d, to) {
    const L = this.L, g = this.g;
    // 对手还在空中/倒地：先决定这次怎么压
    if (!this.okiPlan) {
      const m = this.model, escReady = foe.breakCD <= 0, top = m.wakeTop();
      let how = 'meaty';
      if (escReady && L.bait > 0.3 && (top === 'escape' || Math.random() < g.bait * 0.4 * L.bait)) how = 'bait';
      else if (foe.meter >= 100 && L.read > 0.6 && Math.random() < 0.5) how = 'bait';   // 对手可能大招无敌反打：等一下
      else if (top === 'block' && L.read > 0.3 && Math.random() < 0.3 + 0.5 * g.okiCharge) how = 'charge';
      else if (Math.random() < g.okiCharge * 0.5 * L.oki) how = 'charge';
      this.okiPlan = { how, t0: clock };
    }
    const P = this.okiPlan;
    // 对手起来了 / 闪走了：结束
    if (foe.escInvul) { this.mode = 'bait'; this.modeT = clock; return; }
    if (!(foe.state === 'knockdown' || foe.state === 'getup' || foe.state === 'launched')) { this.mode = 'neutral'; this.okiPlan = null; return; }
    // 对手倒地还剩多久能挨打（倒地 0.6 秒 + 起身无敌 0.35 秒）
    const vuln = foe.state === 'knockdown' ? Math.max(0, 0.6 - foe.t) + 0.35 : foe.state === 'getup' ? foe.invul : 1.0;
    if (P.how === 'bait') {
      // 站在对手够不着的地方挡着，等他起身乱动或闪
      const want = 230;
      this.dir = d < want - 30 ? -to : d > want + 40 ? to : 0;
      if (vuln < 0.15) this.holdDown = 0.3;
      return;
    }
    if (P.how === 'charge') {
      const F = aiFrame(me, 'cs2'), lead = F.hit;   // 按下到打中的总秒数
      const want = (F.min + F.max) / 2;
      if (me.state !== 'charge') {
        this.dir = d > F.max - 20 ? to : d < F.min + 10 ? -to : 0;
        if (vuln <= lead + 0.05 && vuln > lead - 0.25 && aiInRange(F, d, foe, -10)) this.startCharge(me, foe, d, 'cs2');
        else if (vuln < lead - 0.25) { P.how = 'meaty'; }
      }
      return;
    }
    // 掐时机的普攻：判定刚好落在起身无敌结束那一刻
    const F = aiFrame(me, 'l1');
    const want = Math.max(F.min, F.max - 25);
    this.dir = d > want + 10 ? to : d < want - 30 ? -to : 0;
    if (vuln <= F.hit + 0.01 && aiInRange(F, d, foe)) { this.dir = 0; this.press('light'); this.okiPlan.done = true; }
  }
  // 骗闪：停手后等对手闪，看他落地点去接
  baitWait(me, foe, d, to) {
    const L = this.L;
    if (foe.escInvul && !foe.onGround()) {
      // 预判落地点
      const land = foe.x + foe.vx * Math.max(0.1, (-foe.y) / Math.max(200, foe.vy > 0 ? foe.vy : 400));
      const want = clamp(land - to * 70, WALL, STAGE_W - WALL);
      this.dir = Math.abs(me.x - want) > 25 ? Math.sign(want - me.x) : 0;
      this.holdDown = 0;
      return;
    }
    // 对手刚闪完落地（0.15 秒落地硬直）
    if (foe.state === 'getup' && !foe.invul) { this.mode = 'neutral'; this.punish(me, foe, d, to, false); return; }
    if (clock - this.modeT > 1.0 && !foe.escInvul) { this.mode = 'neutral'; return; }
    this.holdDown = Math.max(this.holdDown, 0.08); this.dir = 0;
  }

  // ----- 空中 -----
  inAir(me, foe, d, to) {
    const L = this.L;
    this.dir = to;
    if (me.state !== 'air') return;
    // 空中技能（俯冲、翎羽、飞镖、风刃……）
    for (const slot of ['skill', 'skill2']) {
      const id = slot === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id];
      if (!K || !K.air || (slot === 'skill' ? me.skillCD : me.skill2CD) > 0) continue;
      if (K.role === 'rush' && d < 360 && d > 60 && foe.y > me.y && Math.random() < L.skill * 0.25) { this.press(slot); return; }
      if (K.role === 'proj' && d > 140 && Math.random() < L.skill * 0.06 * (0.5 + this.g.zone)) { this.press(slot); return; }
    }
    // 空中普攻：落到对手头上时出手
    const a1 = me.moves.a1;
    if (Math.abs(foe.x - me.x) < a1.box[2] + 20 && foe.y - me.y < 130 && foe.y - me.y > -40 && Math.random() < L.aggr * 0.5) this.press('light');
    // 燕翎：低空就飞起来
    if (me.ch.fly && me.vy > -100 && me.y > -120 && d > 220 && Math.random() < 0.05) this.flyUntil = clock + rand(0.3, 0.9);
  }

  // ----- 立回 -----
  // 一招在距离 d 上的“威胁值”：伤害 × 可靠程度 ÷ 出手时间（越快越痛越高）；冷却没好、没气、没墨就打折
  actValue(f, opp, key, d) {
    let F = aiFrame(f, key);
    if (key === 'l1' && f.ch.inkShot && (f.ink || 0) < INK_COST) F = { min: 0, max: f.moves.l1.box[2] + 18, hit: f.moves.l1.su, dmg: f.moves.l1.dmg, ht: null };
    if (!aiInRange(F, d, opp)) return 0;
    let rel = AI_ACT_REL[key] || 1;
    if (key === 'skill' || key === 'skill2') {
      const id = key === 'skill' ? f.ch.skill : f.ch.skill2, K = AI_KIT[id] || {}, cd = key === 'skill' ? f.skillCD : f.skill2CD;
      if (K.role === 'counter' || K.role === 'self') return 0;
      rel = cd <= 0 ? 1 : cd < 0.8 ? 0.5 : 0.05;
      if (K.groundOnly && !opp.onGround()) rel *= 0.2;
    } else if (key === 'special') { if (f.meter < 100) return 0; rel = 0.8; }
    return F.dmg * rel / (0.2 + aiHitTime(F, d));
  }
  // 针对打法：按双方角色特性（每换一个对手算一次），高难度才用
  //   rush 对手有远程我没有 → 贴身；kite 我有远程对手没有 → 放风筝
  //   对手的架招/反弹/对空技能冷却好了 → 不往里送近身招/飞行道具/跳入
  //   对手比我快、比我手长 → 不在中距离耗，抓他出手的破绽
  matchup(me, foe) {
    if (this.mu && this.mu.me === me.ch.id && this.mu.foe === foe.ch.id) return this.mu;
    const kit = f => [AI_KIT[f.ch.skill] || {}, AI_KIT[f.ch.skill2] || {}];
    const [fq, fr] = kit(foe);
    const reach = f => Math.max(aiFrame(f, 'l1').max, aiFrame(f, 'dl').max);
    const slotOf = test => test(fq) ? 'skill' : test(fr) ? 'skill2' : null;
    const mu = {
      me: me.ch.id, foe: foe.ch.id,
      meZone: this.hasZoning(me), foeZone: this.hasZoning(foe),
      counter: slotOf(k => k.role === 'counter'), reflect: slotOf(k => !!k.reflect), anti: slotOf(k => !!k.anti),
      reachEdge: reach(me) - reach(foe), speedEdge: me.ch.stat.walk - foe.ch.stat.walk,
      heavy: (foe.ch.stat.guardStab || 1) >= 1.25, fly: !!foe.ch.fly,
    };
    mu.rush = mu.foeZone && !mu.meZone;
    mu.kite = mu.meZone && !mu.foeZone;
    return this.mu = mu;
  }
  // 对手某个技能现在能不能用
  ready(f, slot) { return !!slot && (slot === 'skill' ? f.skillCD : f.skill2CD) <= 0.15; }
  // 针对打法给每一招的倍率
  muWeight(me, foe, key, d) {
    if (!this.L.matchup) return 1;
    const mu = this.matchup(me, foe);
    let w = 1;
    const id = key === 'skill' ? me.ch.skill : key === 'skill2' ? me.ch.skill2 : null, K = id ? AI_KIT[id] || {} : {};
    const melee = key === 'l1' || key === 'dl' || key === 'cs1' || (id && K.role === 'rush');
    if (melee && this.ready(foe, mu.counter) && d < 200) w *= 0.35;                  // 架招好了：别把近身招送上去
    if (id && K.role === 'proj' && this.ready(foe, mu.reflect) && d < 520) w *= 0.3;   // 反弹好了：别丢暗器
    if (key === 'air' && (this.ready(foe, mu.anti) || mu.fly)) w *= 0.3;              // 对空好了：别跳
    if (key === 'cs2' && mu.heavy) w *= 1.3;                                           // 架势稳的对手：多用不可挡
    if (mu.rush && (key === 'air' || (id && K.role === 'rush'))) w *= 1.3;
    if (mu.kite && id && K.role === 'proj') w *= 1.3;
    return Math.max(0.05, 1 + (w - 1) * this.g.adapt);
  }
  // 对位图：每 20 像素一格，记下我和对手在每个距离上最大的威胁值；隔一会儿重算（冷却会变）
  matchupMap(me, foe) {
    if (this.map && clock - this.map.t < 0.35 && this.map.foe === foe) return this.map;
    const n = 46, mine = new Float32Array(n), theirs = new Float32Array(n);
    const g = this.g, keys = AI_ACT_KEYS;
    for (let i = 0; i < n; i++) {
      const d = 20 + i * 20;
      let a = 0, b = 0;
      for (const k of keys) {
        const w = k === 'l1' || k === 'dl' ? 0.6 + g.poke : k === 'cs1' || k === 'cs2' ? 0.3 + g.charge : k === 'skill' ? 0.5 + g.qn : k === 'skill2' ? 0.5 + g.rn : k === 'air' ? 0.3 + g.jumpIn : 1;
        a = Math.max(a, this.actValue(me, foe, k, d) * w);
        b = Math.max(b, this.actValue(foe, me, k, d));
      }
      mine[i] = a; theirs[i] = b;
    }
    // 理想距离：我的威胁减对手的威胁最大的地方（aggr 越高越看重自己的威胁）
    let best = 0, bv = -1e9;
    const aw = 0.5 + this.g.aggr, cw = this.L.matchup ? 1 - 0.5 * this.g.aggr : 0.3;
    for (let i = 0; i < n; i++) {
      const v = mine[i] * aw - theirs[i] * cw - (i > 22 ? (i - 22) * 2 : 0);
      if (v > bv) { bv = v; best = i; }
    }
    let want = (20 + best * 20) * this.g.range;
    if (this.L.matchup) {
      const mu = this.matchup(me, foe);
      const a = Math.min(1, this.g.adapt);
      if (mu.rush) want *= 1 - 0.2 * a;
      if (mu.kite) want = Math.max(want, want + (340 - want) * a);
      if (this.ready(foe, mu.counter) && want < 220) want += 50 * a;   // 站在架招够不着的地方等它先动
    }
    this.map = { t: clock, foe, mine, theirs, want };
    return this.map;
  }

  // ----- 立回：按对位图站位，在合适的时候出最划算的一招 -----
  neutral(me, foe, d, to) {
    const L = this.L, g = this.g;
    this.dir = 0;
    if (this.err()) { this.dir = Math.random() < 0.5 ? to : -to; if (Math.random() < 0.3) this.press('light'); return; }
    if (this.watch2v2(me, foe, d, to)) return;
    // 假动作（绝顶/天道）：贴近半步骗对手出手或乱闪，再退开等它收招
    if (this.feint && clock < this.feint.end) { this.dir = clock < this.feint.turn ? to : -to; return; }
    if (L.bait >= 0.6 && me.onGround() && (!this.feint || clock > this.feint.end + 2.5)
      && d < aiFrame(me, 'l1').max + 110 && d > aiFrame(me, 'l1').max - 10 && Math.random() < 0.05 * L.bait) {
      this.feint = { turn: clock + 0.14, end: clock + 0.34 }; this.dir = to; return;
    }
    // 大招：确定打得到就放
    if (me.meter >= 100 && this.ultWouldHit(me, foe, d, false) && Math.random() < L.ult * (1 - g.ultSave * 0.6)) { this.press('special'); return; }
    // 低难度：技能乱放
    if (Math.random() > L.skill && Math.random() < 0.12) {
      const slot = Math.random() < 0.5 ? 'skill' : 'skill2';
      if ((slot === 'skill' ? me.skillCD : me.skill2CD) <= 0) { this.press(slot); return; }
    }
    // 自身增益类技能（画符、与民同乐）
    for (const slot of ['skill', 'skill2']) {
      const id = slot === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id];
      if (K && K.role === 'self' && (slot === 'skill' ? me.skillCD : me.skill2CD) <= 0 && (!SKILLS[id].can || SKILLS[id].can(me)) && K.use && K.use(me, foe, d, this) && Math.random() < L.skill) { this.press(slot); return; }
    }
    // 对空
    if (!foe.onGround() && foe.state !== 'launched' && !foe.escInvul && this.antiAir(me, foe, d, to)) return;
    // 对手在蓄力：蓄满就是不可挡的冲斩，离开它的距离
    if (foe.state === 'charge') { const F = aiFrame(foe, 'cs2'); if (d < F.max + 60) { this.dir = -to; return; } }
    const map = this.matchupMap(me, foe), i = Math.max(0, Math.min(45, Math.round((d - 20) / 20)));
    // 选这个距离上最划算的出手
    let bestKey = null, bv = 0;
    for (const k of AI_ACT_KEYS) {
      if (k === 'special') continue;
      let v = this.actValue(me, foe, k, d);
      if (v <= 0) continue;
      if (k === 'skill' || k === 'skill2') {
        const id = k === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id] || {};
        if ((k === 'skill' ? me.skillCD : me.skill2CD) > 0) continue;
        if (SKILLS[id].can && !SKILLS[id].can(me)) continue;
        if (K.use && !K.use(me, foe, d, this)) continue;
        if (K.role === 'proj' && foe.state === 'skill' && AI_KIT[foe.skill] && AI_KIT[foe.skill].reflect) continue;
        if (K.jail) v *= 2;
        if (K.role === 'proj') v *= 0.5 + g.zone;
        v *= k === 'skill' ? 0.5 + g.qn : 0.5 + g.rn;
      } else if (k === 'cs1' || k === 'cs2') v *= (0.25 + g.charge) * (k === 'cs2' && this.model.blockRate > 0.55 ? 1.5 : 1);
      else if (k === 'air') v *= g.jumpIn;
      else v *= 0.6 + g.poke;
      v *= this.muWeight(me, foe, k, d);
      // 对手在挡：可挡的招打上去只削架势
      const F = aiFrame(me, k);
      if (F.blockable !== false && (foe.state === 'block' || foe.state === 'blockstun')) v *= (foe.guard || 100) < 40 ? 0.9 : 0.35;
      // 对手开着架招：近身招别打进去
      if (foe.state === 'skill' && AI_KIT[foe.skill] && AI_KIT[foe.skill].role === 'counter' && k !== 'cs2') v *= 0.05;
      if (v > bv) { bv = v; bestKey = k; }
    }
    // 出不出手：威胁值够高、而且时机合适（对手在走动/收招，没在无敌）
    // 动态风险收益修正（Risk-Reward & Adaptive Neutral Evaluation）：
    // 若血量劣势，增加险招权重（不可挡蓄力 / 强抓破绽）；若血量领先，打稳抓确反
    const hpRatio = (me.hp / Math.max(1, me.maxHp)) - (foe.hp / Math.max(1, foe.maxHp));
    const riskMod = hpRatio < -0.2 ? 1.25 : hpRatio > 0.25 ? 0.85 : 1.0;
    const aggr = Math.min(1, L.aggr * (0.45 + g.aggr) * riskMod);
    const foeBusy = foe.state === 'walk' || (foe.state === 'attack' && foe.t > foe.move.su) || foe.state === 'air';
    const go = bestKey && foe.invul <= 0.05 && Math.random() < aggr * (foeBusy ? 1 : 0.7) && bv > 18 * (1.2 - aggr);
    if (go) { this.attacks++; return this.doAct(me, foe, d, to, bestKey); }
    // 站位：往理想距离走，偶尔后撤诱招、原地格挡
    const want = map.want;
    if (d > want + 25) this.dir = to;
    else if (d < want - 30) this.dir = -to;
    else if (Math.random() < g.back * 0.4) this.dir = -to;
    else if (map.theirs[i] > map.mine[i] && Math.random() < L.block * 0.4) this.holdDown = 0.15;
    else this.dir = Math.random() < 0.35 ? to : Math.random() < 0.5 ? -to : 0;
    // 假动作：出手一半转格挡，骗对手出招或闪
    if (L.bait > 0.5 && d < aiFrame(me, 'l1').max + 40 && Math.random() < 0.06 * g.bait && this.model.aggr > 0.4) { this.press('light', 'feint'); this.holdDown = 0.08; }
  }
  doAct(me, foe, d, to, key) {
    switch (key) {
      case 'l1': this.holdDown = 0; this.press('light'); return;
      case 'dl': this.holdDown = 0.05; this.press('light'); return;
      case 'cs1': case 'cs2': this.startCharge(me, foe, d, key); return;
      case 'air': this.dir = to; this.plan([['jump', 0], ['light', 0.58]]); return;
      default: this.press(key); this.afterSkill(me, key);
    }
  }
  // 对空：有对空技能就用；没有就算好落点用地面轻击，打不到就挡
  // 进阶空气动力拦截计算（Kinematic Trajectory Interception）
  antiAir(me, foe, d, to) {
    const L = this.L, g = this.g;
    if (d > 340 || Math.random() > L.punish * (0.3 + g.antiAir)) return false;

    // 1. 优先对空技反制（若对手在空中下落或扑来）
    for (const slot of ['skill', 'skill2']) {
      const id = slot === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id];
      if (K && K.anti && (slot === 'skill' ? me.skillCD : me.skill2CD) <= 0) {
        const F = aiFrame(me, slot);
        const tHit = F.hit || 0.12;
        const predY = foe.y + foe.vy * tHit + 0.5 * GRAV * (foe.state === 'launched' ? 0.6 : 1) * tHit * tHit;
        const predX = foe.x + (foe.vx || 0) * tHit;
        const predD = Math.abs(predX - me.x);
        if (predD <= (F.max || 220) + 25 && predY > -160 && predY < -20) {
          this.press(slot); return true;
        }
      }
    }

    // 2. 预测物理抛物线落点与最佳截击帧（Parabolic Arc Extrapolation）
    const F = aiFrame(me, 'l1'), t = F.hit || 0.08;
    const gEff = GRAV * (foe.state === 'launched' ? 0.6 : 1);
    const fy = foe.y + foe.vy * t + 0.5 * gEff * t * t;
    const fx = foe.x + (foe.vx || 0) * t;
    const predDist = Math.abs(fx - me.x);

    // 抓下落/跳入顶点（提前挥刀拦截打出 Counter-hit）
    if ((foe.vy >= -80 || fy > -120) && fy < 10 && predDist <= F.max + 15) {
      if (Math.sign(fx - me.x) !== me.face && (fx - me.x) !== 0) {
        this.dir = Math.sign(fx - me.x);
      }
      this.press('light');
      return true;
    }

    // 3. 凌霜长枪外侧30%枪尖判定（Tip spacing control）
    if (me.ch.id === 'lingshuang') {
      const tipMin = F.max * 0.72, tipMax = F.max * 0.98;
      if (predDist < tipMin) { this.dir = -to; }
      else if (predDist > tipMax) { this.dir = to; }
    }

    // 4. 来势汹汹且不在截击范围：立回格挡 / 闪避
    if (predDist < 220 && foe.vy > 60 && fy > -140) {
      if (L.block > 0.6 && Math.random() < L.block) {
        this.holdDown = 0.22; return true;
      }
    }
    return false;
  }
  startCharge(me, foe, d, kind) {
    this.chargeTo = kind;
    // 低难度蓄力前先顿一下（破绽/预兆），让新手看得出、躲得开
    if (this.L.error >= 0.15) { this.dir = 0; this.plan([['chargeStart', 0.16 + this.L.error * 0.5]]); return; }
    this.holdAtk = 9; this.chargeT0 = clock; this.c.atkT = clock - 0.001;
  }
  hasZoning(f) {
    const q = AI_KIT[f.ch.skill], r = AI_KIT[f.ch.skill2];
    return (q && q.role === 'proj') || (r && r.role === 'proj') || !!f.ch.inkShot;
  }
  ultWouldHit(me, foe, d, inCombo) {
    const U = AI_ULT[me.ch.ult] || {}, F = aiFrame(me, 'special');
    if (foe.invul > 0.1 || foe.hp <= 0) return false;
    if (U.sure && !U.sure(me, foe, d)) return false;
    if (U.heal) return true;
    // 对手腾空闪好了：全屏大招可能被闪掉，等对手闪用掉或被定住再放
    const stuck = AI_HURT.includes(foe.state) || foe.state === 'getup' || foe.jailT > 0 || foe.rooted || (foe.state === 'attack' && foe.t > foe.move.su) || foe.state === 'skill';
    if (U.contact) return aiInRange(F, d, foe, -10) && (stuck || this.L.ult < 0.9 || foe.breakCD > 0.5);
    if (!aiInRange(F, d, foe, 0)) return false;
    return stuck || foe.breakCD > 1.5 || this.L.ult < 0.9;
  }

  // ----- 避战：血量领先时拉开距离、只挡不攻、远程骚扰 -----
  keepAway(me, foe, d, to) {
    const L = this.L;
    const far = 420;
    if (d < far) this.dir = -to; else this.dir = 0;
    if (d < 200 && foe.state === 'attack') this.holdDown = 0.25;
    if (this.hasZoning(me) && Math.random() < 0.4) { const ps = this.projSlot(me); if (ps && d > 200) { this.press(ps); return; } if (me.ch.inkShot && (me.ink || 0) > 40 && d > 200) { this.press('light'); return; } }
    // 被逼到墙角：跳过去
    const cornered = (me.x < WALL + 140 && to > 0) || (me.x > STAGE_W - WALL - 140 && to < 0);
    if (cornered && d < 260 && me.onGround()) { this.dir = to; this.plan([['jump', 0], ['jump', 0.24]]); }
  }

  // ----- 铁山山崩：空中对准对手落下 -----
  steerAvalanche(me, foe) {
    this.dir = Math.abs(me.x - foe.x) > 30 ? Math.sign(foe.x - me.x) : 0;
    if (Math.abs(me.x - foe.x) < 70 && me.t > 0.2) this.holdDown = 0.3;
  }

  // ----- 被醉翁困在蓬莱境里：看不见，只能乱走乱挡 -----
  blind(me) {
    const c = this.c;
    if ((me.state === 'launched' || (me.state === 'hitstun' && me.comboHits >= 3)) && me.breakCD <= 0 && me.t > 0.1 && Math.random() < this.L.block * 0.012) this.press('dash');
    while (this.queue.length && this.queue[0].at <= clock) { const a = this.queue.shift().a; if (a !== 'chargeStart' && a !== 'chargeEnd' && a !== 'flyStart') this.press(a); }
    this.holdDown = Math.max(0, this.holdDown - STEP);
    if (clock >= this.next && !this.queue.length && this.holdDown <= 0) {
      this.next = clock + rand(0.3, 0.7);
      const r = Math.random();
      this.dir = Math.random() < 0.5 ? -1 : 1;
      if (r < 0.3) this.plan([['light', 0], ['light', 0.2]]);
      else if (r < 0.5) { this.dir = 0; this.holdDown = rand(0.4, 0.9); }
      else if (r < 0.58) this.plan([['jump', 0]]);
      else if (r < 0.64 && me.skillCD <= 0) this.plan([['skill', 0]]);
      else if (r < 0.75) this.dir = 0;
    }
    this.holdAtk = 0;
    c.held.down = this.holdDown > 0; c.held.atk = false; c.held.jump = false;
    c.held.left = this.dir < 0; c.held.right = this.dir > 0;
  }

  // ----- 2v2 天道演武：抢剑坛赐福、阻截对手、借灵泉减冷却 -----
  watch2v2(me, foe, d, to) {
    if (!(typeof is2v2 === 'function' && is2v2()) || typeof ARENA2V2 === 'undefined') return false;
    const cx = STAGE_W / 2, orb = ARENA2V2.orb;
    // 天劫落雷：地上出现预警圈就走出去（反应受境界影响）
    if (typeof projs !== 'undefined' && Math.random() < 0.3 + 0.7 * this.L.read) {
      for (const p of projs) if (p.kind === 'bolt' && (p.delay || 0) > 0 && Math.abs(p.x - me.x) < (p.w || 68) / 2 + 30) { this.dir = me.x < p.x ? -1 : 1; return true; }
    }
    // 站位分工：远程侠客在近战队友缠住敌人时，退到后排放招，不挤进人堆
    {
      const mateF = (me.idx === 0 ? C : me.idx === 2 ? A : me.idx === 1 ? D : B);
      const role = k => (AI_KIT[k] && AI_KIT[k].role) || 'rush';
      const ranged = r => r === 'proj' || r === 'trap' || r === 'zone';
      if (mateF && mateF.hp > 0 && !mateF.hidden && ranged(role(me.ch.skill)) && !ranged(role(mateF.ch.skill))
        && Math.abs(mateF.x - foe.x) < 220 && d < 240 && me.onGround() && me.hp < foe.hp * 1.3 && Math.random() < 0.45) {
        this.dir = -to; return true;
      }
    }
    if (orb && orb.active) {
      const dAltar = Math.abs(me.x - cx);
      const mate = (me.idx % 2 === 0) ? (me.idx === 0 ? C : A) : (me.idx === 1 ? D : B);
      let near = null, nd = 9999;
      for (const e of foesOf(me)) if (!e.hidden && e.hp > 0) { const v = Math.abs(e.x - cx); if (v < nd) { nd = v; near = e; } }
      const wantHeal = orb.kind === 1 && (me.hp < me.maxHp * 0.75 || (mate && mate.hp <= 0));
      const want = orb.kind !== 1 || wantHeal;
      if (near && nd < 280 && Math.abs(me.x - near.x) < aiFrame(me, 'l1').max + 90 && dAltar <= nd + 70) { this.dir = Math.sign(near.x - me.x) || to; return false; }   // 阻截：交给立回去打
      if (want && dAltar < nd + 140) {
        const mateRush = mate && mate.hp > 0 && Math.abs(mate.x - cx) < dAltar && (orb.kind !== 1 || mate.hp < me.hp);
        if (!mateRush) { this.dir = Math.sign(cx - me.x) || to; if (dAltar < 48 && me.onGround()) this.press('jump'); return true; }
      }
    }
    if (ARENA2V2.geysers && (me.skillCD > 2.2 || me.skill2CD > 2.2)) {
      for (const gy of ARENA2V2.geysers) if (gy.cd <= 0 && Math.abs(me.x - gy.x) < 180 && Math.abs(me.x - gy.x) > 30 && Math.random() < 0.35) { this.dir = Math.sign(gy.x - me.x); return true; }
    }
    return false;
  }
}
