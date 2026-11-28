const AI_HURT = ['hitstun', 'launched', 'knockdown', 'held'];
class AIBrain {
  constructor(ctrl, level) {
    this.c = ctrl;
    this.level = level;
    // level 可以是难度名，也可以是 { base: 'god', genes: {...} }（训练时给某一方换一套基因）
    if (level && typeof level === 'object' && level.base) { this.L = LEVELS[level.base] || LEVELS.god; this.geneOverride = level.genes; }
    else this.L = typeof level === 'object' ? level : (LEVELS[level] || LEVELS.normal);
    this.lvKey = typeof level === 'string' ? level : '';
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
    this.dirHoldT = 0; this.lastDir = 0;
  }
  // 新的一局：清掉这局的临时状态，对手习惯留着
  newRound() {
    this.queue.length = 0; this.dir = 0; this.holdDown = 0; this.holdAtk = 0; this.next = 0;
    this.dirHoldT = 0; this.lastDir = 0;
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
    if (this.heroId !== me.ch.id) { this.heroId = me.ch.id; this.g = this.geneOverride ? Object.assign(aiDefaultGenes(), this.geneOverride) : this.L.genes ? aiGenes(me.ch.id, this.lvKey) : aiDefaultGenes(); }
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
      if (!this.qianjiBat(me, foe)) this.tactic(me, foe, d, to);
    }

    this.aiAdaptStance(me, foe, d);
    this.aiMapObjectives(me, foe, d, to);

    // 往后退快撞墙了：跳过对手头顶
    if (this.dir === -to && ((this.dir < 0 && me.x < WALL + 120) || (this.dir > 0 && me.x > STAGE_W - WALL - 120)) && me.onGround() && AI_FREE.includes(me.state)) {
      // 这个决定要保持一小会儿：以前每帧重掷，贴墙时会左右抖
      if (clock > (this.wallT || 0)) { this.wallT = clock + 0.5; this.wallGo = this.mode === 'keep' || this.chance(0.5); }
      if (this.wallGo) { this.dir = to; if (!this.queue.length && this.chance(0.08)) this.plan([['jump', 0], ['jump', 0.22]]); }
    }
    // 防止 AI 贴脸死顶对手：已在近身接触距离且未准备脱困时停止继续向对手怀里顶撞
    if (d < 44 && this.dir === to && me.onGround() && AI_FREE.includes(me.state) && !this.queue.length && !this.holdDown && !this.holdAtk) {
      const cornered = (me.x < WALL + 120 && to > 0) || (me.x > STAGE_W - WALL - 120 && to < 0);
      if (!cornered) this.dir = 0;
    }
    if (me.state === 'special' && me.ch.ult === 'avalanche') this.steerAvalanche(me, foe);
    if (this.holdAtk > 0 && me.state !== 'charge' && clock - (this.chargeT0 || 0) > 0.42) this.holdAtk = 0;   // 蓄力被打断了：松手
    c.held.down = this.holdDown > 0;
    c.held.atk = this.holdAtk > 0;
    if (!c.held.atk && this.holdAtk <= 0) c.atkT = clock + 1e6;
    c.held.jump = this.jumpHeld || !!(me.ch.fly && clock < (this.flyUntil || 0));
    const jumped = this._hx !== undefined && (Math.abs(me.x - this._hx) >= 80 || (foe && this._hfx !== undefined && Math.abs(foe.x - this._hfx) >= 80));
    this._hx = me.x; this._hfx = foe ? foe.x : me.x;
    if (jumped) { this.dirHoldT = 0; this.lastDir = this.dir; }
    else {
      this.dirHoldT = Math.max(0, (this.dirHoldT || 0) - STEP);
      if (this.dir !== 0 && this.lastDir !== 0 && this.dir * this.lastDir < 0 && this.dirHoldT > 0 && AI_FREE.includes(me.state) && !this.queue.length) {
        this.dir = this.lastDir;
      } else if (this.dir !== this.lastDir) {
        this.lastDir = this.dir;
        if (this.dir !== 0) this.dirHoldT = 0.14;
      }
    }
    c.held.left = this.dir < 0; c.held.right = this.dir > 0;
  }
  qianjiBat(me, foe) {
    if (me.ch.id !== 'qianji' || !['idle', 'walk', 'air', 'block'].includes(me.state)) return false;
    const ball = projs.find(p => p.kind === 'ironball' && p.owner === me.idx && p.yoyo && !p.dead && p.yoyoPhase === 'loop');
    if (!ball || Math.hypot(ball.x - me.x, ball.y - (me.y - 58)) > 104) return false;
    if (Math.abs(foe.y - (ball.y + 58)) > 180 || Math.abs(foe.x - ball.x) > 520) return false;
    if (this.chance(0.78 * Math.max(0.35, this.L.aggr))) { this.stopAll(); this.press('light', 'qianji_ball_bat'); }
    return true;
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
    // 习惯会淡忘：每秒往回落一点（以前只增不减，打久了每个对手都被当成又爱跳又爱抢攻）
    if (clock - (this.modelT || 0) >= 1 || clock < (this.modelT || 0)) {
      this.modelT = clock;
      const M_ = this.model;
      M_.ema('jumpRate', 0, 0.05); M_.ema('projRate', 0, 0.04);
      if (AI_FREE.includes(foe.state)) M_.ema('aggr', 0, 0.07);
    }
  }
  // 我对对手习惯的把握：按难度的「见识」打折（入门、寻常不记习惯，一律当普通对手）
  habit(k, base) { return base + (this.model[k] - base) * this.L.read; }
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
      if (this.shouldBreakoutSkill(me, foe)) return true;
      if (me.state === 'launched' && !me.spiked && this.chance(L.tech * 0.25 + (this.techRoll === undefined ? 0 : 0))) this.techRoll = true;
      if (me.state === 'launched') {
        if (this.techRoll === undefined) { this.techRoll = Math.random() < L.tech; this.techSide = this.mode === 'keep' || this.chance(0.5) ? -1 : 1; }
        this.jumpHeld = this.techRoll && me.vy > 0 && me.y > -140;
        this.dir = this.techRoll ? (this.techSide || -1) * to : 0;
      }
      if (me.state === 'knockdown') { if (!this.wasDown) this.downId = (this.downId || 0) + 1; this.planWakeup(me, foe); }
      this.wasDown = me.state === 'knockdown';
      return true;
    }
    this.techRoll = undefined;
    if (me.state === 'getup') { this.planWakeup(me, foe); return true; }
    if (me.state === 'held' || me.state === 'special') return true;

    // 2. 腾空闪在空中：落地点躲开对手
    if (me.escInvul && !me.onGround()) {
      if (!this.escSide) this.escSide = this.chance(0.5) ? 1 : -1;   // 一次腾空闪只选一次落点方向
      this.dir = foe.state === 'attack' || this.mode === 'keep' ? -to : this.escSide * to;
      if (L.read >= 0.3) this.escapeLanding(me, foe, to);   // 劲敌以上：挑落点，别落在对手刀口上
      return true;
    }
    this.escSide = 0;

    // 3. 防守：对手出招 / 飞行道具 / 陷阱
    if (this.defend(me, foe, d, to)) return true;
    if (this.defendOthers(me, foe)) return true;

    // 4. 墨羽墨阵：对手踩上就引爆
    if (me.ch.skill === 'inktrap' && me.skillCD <= 0) {
      const p = projs.find(q => q.kind === 'trap' && q.owner === me.idx && !q.dead && q.delay <= 0);
      if (p && aiInv(foe, me) <= 0 && Math.abs(foe.x - p.x) < 90 && foe.y > -120 && this.seen) { this.press('skill'); }
    }
    // 5. 绯影影遁后：1.5 秒内打不中就影归
    return false;
  }

  // 腾空闪落地有 0.15 秒硬直，落在对手身边就是白送一套。往两边飘各能落到哪、对手追过来还差多远，挑远的那边；
  // 绝顶 / 天道：实在甩不开，快落地时空中出一刀（出招会结束腾空闪，落地就没有硬直，能马上格挡）
  escapeLanding(me, foe, to) {
    const T = aiLandTime(me), span = wk(me) * 1.2 * T * 0.75, chase = wk(foe) * Math.max(0, T - 0.1);
    const gap = x => Math.max(0, Math.abs(clamp(x, WALL, STAGE_W - WALL) - foe.x) - (AI_FREE.includes(foe.state) ? chase : 0));
    const gl = gap(me.x - span), gr = gap(me.x + span);
    if (Math.abs(gl - gr) > 20) this.dir = gr > gl ? 1 : -1; else this.dir = -to;
    const a1 = me.moves.a1, danger = Math.max(aiFrame(foe, 'l1').max, aiFrame(foe, 'dl').max) + 40;
    if (this.L.read >= 0.7 && me.escMode !== 'hover' && me.vy > 0 && me.y > -(a1.su + a1.ac) * me.vy - 30 && me.y < -30
      && Math.max(gl, gr) < danger && Math.abs(foe.x - me.x) < a1.box[2] + 30 && aiInv(foe, me) <= 0 && foe.onGround()) {
      this.dir = to; this.press('light', 'escLand');
    }
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
    // 对手满气：腾空闪留给大招（大招起手时还能闪），小连段先吃着；已经掉了三成血或者快死了就别省了
    if (L.read >= 0.7 && foe.meter >= 100 && lost < me.maxHp * 0.3 && me.hp > me.maxHp * 0.3) return false;
    if (hits >= at && lost >= 30) return me.hp < me.maxHp * 0.5 || hits >= at + 1 || Math.random() < L.breaker * 0.6;
    return false;
  }

  // 该不该用受击可释放技能破连反击（雷铠、震地、回音壁、渡影）
  shouldBreakoutSkill(me, foe) {
    if (me.state !== 'hitstun' && me.state !== 'launched') return false;
    if (me.jailT > 0 || me.drinkT > 0 || me.t < 0.06) return false;
    for (const slot of [2, 1]) {
      const id = slot === 2 ? me.ch.skill2 : me.ch.skill;
      const cd = slot === 2 ? me.skill2CD : me.skillCD;
      const S = SKILLS[id];
      if (S && S.breakout && cd <= 0 && (!S.can || S.can(me))) {
        if ((me.comboHits || 0) >= 2 || me.hp < me.maxHp * 0.5) {
          this.press(slot === 2 ? 'skill2' : 'skill');
          return true;
        }
      }
    }
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
    // 铁山山崩：落地那一刻离地 80 像素以上就砸不到，算好落地时间起跳（来不及就腾空闪）
    if (foe.state === 'special' && foe.sp === 'leap' && foe.ch.ult === 'avalanche' && this.seen) return this.dodgeAvalanche(me, foe, to, free);
    // 对手的近身招 / 技能 / 大招
    const th = this.threat(me, foe, d);
    if (th) {
      if (!this.seen && L.react[0] > 0.03) return th.t < 0.02 && this.holdDown > 0;   // 还没反应过来：保持原样
      if (this.defKey !== this.ev) { this.defKey = this.ev; this.defRoll = Math.random(); this.defPlan = this.chooseDefense(me, foe, d, to, th, free); }
      else if (th.kind === 'charge') this.defPlan = this.chooseDefense(me, foe, d, to, th, free);   // 蓄力每帧重算：越蓄越危险
      const p = this.defPlan;
      if (!p) return false;
      if (!free && p.how !== 'block' && p.how !== 'jg' && p.how !== 'escape' && p.how !== 'ult' && p.how !== 'commit') return canBlock ? this.runDefense(me, foe, d, to, th, { how: 'block' }, canBlock) : false;
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

  // 2v2 / 首领战：没盯着的那个敌人出招打过来也要防（以前只看自己的目标，被另一个人从旁边打是白挨）。
  // 余光看人慢一点（反应时间 ×1.3）；只管近身招、技能和大招，飞行道具本来就是全场一起看的
  defendOthers(me, foe) {
    if (typeof isMulti !== 'function' || !isMulti() || typeof foesOf !== 'function') return false;
    let other = null, od = 1e9;
    for (const e of foesOf(me)) { if (e === foe || e.hidden || e.hp <= 0) continue; const dd = Math.abs(e.x - me.x); if (dd < od) { od = dd; other = e; } }
    if (!other || od > 700) { this.ev2 = ''; return false; }
    const key = other.idx + ':' + other.state + ':' + (other.moveName && other.state === 'attack' ? other.moveName : other.skill || other.sp || '');
    if (key !== this.ev2) { this.ev2 = key; this.evT2 = clock; this.evReact2 = rand(this.L.react[0], this.L.react[1]) * 1.3; this.skillD02 = od; }
    // 借用看主目标的那套判断：先换上这个人的观察记录，判断完再换回去
    const keep = [this.ev, this.since, this.seen, this.skillD0, this.defKey, this.defPlan, this.defRoll];
    this.ev = 'o:' + key; this.since = clock - this.evT2; this.seen = this.since >= this.evReact2; this.skillD0 = this.skillD02;
    this.defKey = this.defKey2 || ''; this.defPlan = this.defPlan2 || null; this.defRoll = this.defRoll2 || 0;
    let done = false;
    const free = me.onGround() && AI_FREE.includes(me.state);
    const canBlock = free || (me.onGround() && me.state === 'attack' && me.move && me.t < me.move.su * 0.6 && me.moveName !== 'dl');
    const to2 = Math.sign(other.x - me.x) || 1, th = this.threat(me, other, od);
    if (th && this.seen) {
      if (this.defKey !== this.ev) { this.defKey = this.ev; this.defRoll = Math.random(); this.defPlan = this.chooseDefense(me, other, od, to2, th, free); }
      else if (th.kind === 'charge') this.defPlan = this.chooseDefense(me, other, od, to2, th, free);
      const p = this.defPlan;
      if (p) done = !free && !['block', 'jg', 'escape', 'ult', 'commit'].includes(p.how) ? (canBlock ? this.runDefense(me, other, od, to2, th, { how: 'block' }, canBlock) : false) : this.runDefense(me, other, od, to2, th, p, canBlock);
    } else if (!th) this.defKey = '';
    this.defKey2 = this.defKey; this.defPlan2 = this.defPlan; this.defRoll2 = this.defRoll;
    [this.ev, this.since, this.seen, this.skillD0, this.defKey, this.defPlan, this.defRoll] = keep;
    return done;
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
    // 跑不出蓄满冲斩的范围、腾空闪也没好：迎上去，赶在蓄满前打断（以前只会站着“挡”一个挡不住的招）
    if (free && me.breakCD > left && left > 0.15) {
      const f1 = aiFrame(me, 'l1'), close = Math.max(0, d - f1.max + 10) / wk(me);
      if (out / wk(me) >= left + 0.12 && close + f1.hit < left - 0.04) return { how: 'approach' };
    }
    // 后退只有正常走速的 78%。半蓄冲斩（可挡）的范围里别背对着走：先挡着；出了半蓄范围、来得及走出满蓄范围就退
    const wallBehind = to > 0 ? me.x - WALL < out + 20 : STAGE_W - WALL - me.x < out + 20;
    // 半蓄冲斩松手后 0.1 秒内就到：反应够快（天道）的边退边看，松手了再挡；反应慢的在半蓄范围里先挡着，
    // 等对手蓄过了一小半（多半是要蓄满）、再不走就走不出去时才转身退
    const inCs1 = d < aiFrame(foe, 'cs1').max + 30, tOut = out / (wk(me) * 0.78), fast = this.L.react[1] <= 0.06;
    if (!wallBehind && tOut < left - 0.05 && (!inCs1 || fast || foe.t > 0.25)) return { how: 'back' };
    if (left > 0.1) return inCs1 && free && !fast && foe.t <= 0.25 ? { how: 'block' } : { how: 'back' };
    if (me.breakCD <= 0 && this.L.breaker > 0.5) return { how: 'escape' };
    // 闪不了：挡住满蓄只吃 45% 伤害（会被压倒、快速起身），比转身挨一整下再被挑飞强
    return { how: 'block' };
  }
  runDefense(me, foe, d, to, th, p, free) {
    switch (p.how) {
      case 'hold': this.dir = d < aiFrame(foe, 'cs2').max + 80 ? -to : 0; this.holdDown = 0; return true;
      case 'counter': if (free) { this.stopAll(); this.press(p.slot); } return true;
      case 'jump': if (me.onGround() && free) { this.stopAll(); this.press('jump'); this.dir = -to; } return true;
      case 'back': this.stopAll(); this.dir = -to; this.holdDown = 0; return true;
      case 'approach': this.stopAll(); this.dir = to; this.holdDown = 0; return true;
      case 'escape': if (th.t < 0.12 || th.kind === 'charge') { this.stopAll(); this.press('dash'); } return true;
      case 'ult': if (me.meter >= 100 && th.t < 0.3) { this.stopAll(); this.press('special'); } else if (me.breakCD <= 0 && th.t < 0.1) this.press('dash'); return true;
      case 'interrupt':
        // 抢先出手要把这一下打完：以前按完下一帧就转格挡，出招前段被格挡收掉，等于从来没抢成
        if (free && AI_FREE.includes(me.state)) { this.stopAll(); if (p.key === 'dl') { this.holdDown = 0.06; this.press('light'); } else { this.holdDown = 0; this.press('light'); } p.how = 'commit'; p.until = clock + aiFrame(me, p.key).hit + 0.08; return true; }
        p.how = 'block'; return this.runDefense(me, foe, d, to, th, p, free);
      case 'commit':
        if (clock > p.until || (me.state !== 'attack' && clock > p.until - aiFrame(me, p.key).hit + 0.03)) { p.how = 'block'; return this.runDefense(me, foe, d, to, th, p, free); }
        return me.state !== 'attack';   // 出手了就交给连段逻辑（打中了接着打）
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
  incomingProj(me, horizon = 0.45) {
    let best = null;
    for (const p of projs) {
      const sameTeam = typeof fighterTeam === 'function' ? fighterTeam(fighterByIdx(p.owner)) === fighterTeam(me) : (p.owner % 2) === (me.idx % 2);
      if (p.dead || p.fx || p.dmg <= 0 || sameTeam || p.kind === 'trap') continue;
      if (p.delay > 0) continue;
      const dx = me.x - p.x, vx = p.vx || 0;
      if (Math.abs(dx) > 520) continue;
      let t;
      if (Math.abs(vx) < 1) { if (Math.abs(dx) > (p.w || 40) / 2 + 30) continue; t = 0; }
      else { if (Math.sign(dx) !== Math.sign(vx)) continue; t = Math.max(0, (Math.abs(dx) - (p.w || 40) / 2 - 18) / Math.abs(vx)); }
      if (t > horizon) continue;
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
      const sameTeam = typeof fighterTeam === 'function' ? fighterTeam(fighterByIdx(p.owner)) === fighterTeam(me) : (p.owner % 2) === (me.idx % 2);
      if (p.dead || sameTeam || p.dmg <= 0) continue;
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

}
