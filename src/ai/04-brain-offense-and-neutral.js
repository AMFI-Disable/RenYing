// ======================= 电脑 AI：进攻、连段、压起身与立回 =======================
Object.assign(AIBrain.prototype, {
  // ======================= 战术 =======================
  tactic(me, foe, d, to) {
    const L = this.L;
    // 凌雀：换影途中印记没了 = 刚引爆（不管是哪段打法放的换影），记下时间给追击用
    if (me.ch.id === 'lingque') { const mk = foe.needleMark || 0; if (me.state === 'skill' && me.skill === 'shadowdash' && this.lqMark > 0 && mk <= 0) this.lqBurst = clock; this.lqMark = mk; }
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
    // 青锋 / 玉箫 / 凌雀 / 离影 / 磁仙 / 赤霄 / 玄机 / 青鸾 / 玄武：侠客专属连段与团队战术
    if (me.ch.id === 'qingfeng' && this.qingfengRoute(me, foe, d, to)) return;
    if (me.ch.id === 'yuxiao' && this.yuxiaoRoute(me, foe, d, to)) return;
    if (me.ch.id === 'lingque' && me.state === 'skill' && me.skill === 'shadowdash') this.lqDash = clock;
    if (me.ch.id === 'lingque' && this.lingqueRoute(me, foe, d, to)) return;
    // 离影：对手打空 / 收招时渡到他身后的雾身反打；残血被压时渡到离对手最远的雾身拉开
    if (me.ch.id === 'liying' && this.liyingRoute(me, foe, d, to)) return;
    // 磁仙：负极 R 远远吸过来 → 负极普攻长连 → Q 换正极挑飞收尾 → Q 好了换回负极
    if (me.ch.id === 'cixian' && this.cixianRoute(me, foe, d, to)) return;
    // 赤霄 / 玄机 / 青鸾 / 玄武：四位新锐侠客专属连段与团队战术
    if (me.ch.id === 'chixiao' && this.chixiaoRoute(me, foe, d, to)) return;
    if (me.ch.id === 'xuanji' && this.xuanjiRoute(me, foe, d, to)) return;
    if (me.ch.id === 'qingluan' && this.qingluanRoute(me, foe, d, to)) return;
    if (me.ch.id === 'xuanwu' && this.xuanwuRoute(me, foe, d, to)) return;
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
  },

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
  },

  // ----- 连段：打中就接下一下；到时机取消接技能；对手有闪就骗 -----
  inAttack(me, foe, d, to) {
    const L = this.L, g = this.g, m = me.move;
    if (!m) return;
    const t = me.t, act0 = m.su, act1 = m.su + m.ac;
    const confirm = me.hitConfirmed;
    // 记对手挡不挡：每一刀只记一次（连段里的后几刀不算，那是对手已经在挨打）
    const blockedNow = foe.state === 'blockstun' || (foe.state === 'block' && t >= act1);
    if ((confirm || blockedNow) && Math.abs((clock - t) - (this.judgedT || -9)) > 0.03) {
      this.judgedT = clock - t;
      if (blockedNow) { this.model.ema('blockRate', 1, 0.2); this.attacks++; this.blocked++; }
      else if ((foe.comboHits || 0) <= 1) this.model.ema('blockRate', 0, 0.2);
    }
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
      // 磁仙负极：普攻四段循环能一直连到消磁前一下；连满了换正极（Q 能从命中取消），下一下正极普攻挑飞
      if (me.ch.passive === 'magnet' && me.pol < 0 && L.combo >= 3) {
        const cap = Math.min(MAG.chainCap - 1, Math.round(L.combo + 8 * L.read));
        if (m.next.light && (me.mChain || 0) < cap && hits < cap + 2) { this.press('light'); return; }
        if (L.read >= 0.7 && me.skillCD <= 0 && Math.random() < L.skill) { this.press('skill', 'cixian'); return; }
      }
      if (m.next.light && hits < L.combo + (this.err() ? -1 : 0)) { this.press('light'); return; }
      // 挑飞后追击：跳起来空中再打
      if (m.launch && L.combo >= 5 && foe.juggle < 2 && Math.random() < L.punish) { this.jugT = clock + 1.6; return; }   // 追击交给 juggle()：等对手落到够得着的高度再出手
      return;
    }
    // 被挡：连段继续（对手按住格挡时，连段压架势）或停手
    if (foe.state === 'blockstun' || foe.state === 'block') {
      // 下一刀就能把架势打崩：一定接着打（崩了有 0.85 秒白打）
      const nx = m.next.light && me.moves[m.next.light], willBreak = nx && L.punish >= 0.3 && (foe.guard || 100) <= aiGuardLoss(me, foe, nx.dmg, nx.big ? 1.35 : 1) + 2;
      const guardLow = (foe.guard || 100) < 35 || willBreak;
      if (m.next.light && (guardLow || Math.random() < 0.35 * L.aggr) && hits < 4) this.press('light');
      else if (Math.random() < L.block * 0.7) this.holdDown = 0.2;
    }
  },
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
  },
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
  },
  afterSkill(me, slot) {
    const id = slot === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id];
    if (!K) return;
    // 技能打中后的追击（只在真的打中时才按）
    if (id === 'gale') this.plan([['skill2', 0.42, 'hit']]);   // 疾风斩中了剑气立刻好：接剑气
    else if (id === 'blink') this.plan([['light', 0.5], ['light', 0.68, 'hit'], ['light', 0.86, 'hit']]);   // 影遁后下一击加伤
    else if (id === 'hook') this.plan([['light', 0.44, 'hit'], ['light', 0.6, 'hit'], ['light', 0.76, 'hit']]);
    else if (id === 'thunderfist') this.plan([['light', 0.44, 'hit'], ['light', 0.6, 'hit']]);
    else if (id === 'spindle' && this.L.combo >= 3) this.plan([['skill2', 0.3, 'hit'], ['skill2', 0.45, 'hit']]);   // 飞梭挂上印记：换影引爆（寻常以上）
    else if (id === 'flamehalberd' && this.L.combo >= 3) this.plan([['light', 0.36, 'hit'], ['skill2', 0.54, 'hit']]);   // 赤霄焰戟挂灼烧接烈环
    else if (id === 'gravwell' && this.L.combo >= 3) this.plan([['light', 0.34, 'hit'], ['light', 0.52, 'hit']]);   // 玄机星漩拉近接普攻
    else if (id === 'shellbash' && this.L.combo >= 3) this.plan([['light', 0.36, 'hit']]);   // 玄武冲撞接重击
  },
  shouldBait(me, foe, hits) {
    const L = this.L, g = this.g;
    if (L.bait <= 0 || foe.breakCD > 0 || foe.ch.id === undefined) return false;
    const k = Math.max(1, Math.round(this.model.escN ? this.model.escHits : 3));
    return hits >= k - 1 && hits >= 1 && Math.random() < L.bait * g.bait * (this.model.escN ? 0.9 : 0.35);
  },

  // ----- 挑飞后追击：走到落点下面，算好对手落进刀口的那一刻再出手（以前按固定节奏跳起来挥两刀，几乎全空） -----
  juggle(me, foe, d, to) {
    if (clock > (this.jugT || 0) || foe.state !== 'launched' || aiInv(foe, me) > 0.02 || foe.hp <= 0 || (foe.juggle || 0) >= 2) return false;
    const land = aiLandTime(foe);
    let best = null, bv = 0;
    const tryKey = (key, v) => {
      const F = aiFrame(me, key); if (F.max <= 0) return;
      const T = aiHitTime(F, d), p = aiPredict(foe, T);
      // 地面招的刀口大约到头顶：对手脚底落到 100 像素以内才够得着；也不能等他落地（倒地有无敌）
      if (T < land - 0.03 && p.y > -100 && aiInRange(F, Math.abs(p.x - me.x), foe, -6) && v > bv) { bv = v; best = key; }
    };
    tryKey('l1', aiFrame(me, 'l1').dmg * 3);
    for (const slot of ['skill', 'skill2']) {
      const id = slot === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id];
      if (!K || !K.combo || K.groundOnly || K.role === 'proj' || (slot === 'skill' ? me.skillCD : me.skill2CD) > 0) continue;
      if ((SKILLS[id].can && !SKILLS[id].can(me)) || (K.use && !K.use(me, foe, d, this))) continue;
      tryKey(slot, aiFrame(me, slot).dmg);
    }
    this.holdDown = 0;
    if (best) {
      this.stopAll(); this.dir = 0; this.jugT = 0;
      if (best === 'l1') this.press('light', 'juggle'); else { this.press(best, 'juggle'); this.afterSkill(me, best); }
      return true;
    }
    // 还够不着：走到落点前面一个刀口的位置等
    const px = aiPredict(foe, Math.max(0.05, land - aiFrame(me, 'l1').hit)).x, want = Math.max(30, aiFrame(me, 'l1').max - 30);
    const gap = Math.abs(px - me.x);
    this.dir = gap > want + 12 ? Math.sign(px - me.x) : gap < want - 40 ? -Math.sign(px - me.x) : 0;
    return true;
  },

  // ----- 抓破绽 -----
  punish(me, foe, d, to, afterBlock) {
    const L = this.L;
    if (!AI_FREE.includes(me.state) || !me.onGround()) return false;
    if (this.juggle(me, foe, d, to)) return true;
    if (aiInv(foe, me) > 0.02 || foe.hp <= 0) return false;
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
  },
  punishOptions(me, foe, d, window) {
    let best = null, bv = 0;
    // 按这个距离上的实际出手时间算，并且看打中那一刻对手滑到 / 飞到哪了（挨打后退、冲刺技能收招时人还在动）
    const high = !foe.onGround() && foe.y < -100;
    const consider = (key, F, v) => {
      const T = aiHitTime(F, d);
      if (T >= window + 0.02 || !aiInRange(F, d, foe, 5)) return;
      const p = aiPredict(foe, T);
      if (!aiInRange(F, Math.abs(p.x - me.x), foe, 5)) return;
      if ((key === 'l1' || key === 'dl') && (high || p.y < -100)) return;   // 地面普攻够不着半空的人
      if (v > bv) { bv = v; best = key; }
    };
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
  },
  beatJailed(me, foe, d, to) {
    const F = aiFrame(me, 'l1');
    this.queue.length = 0; this.holdDown = 0;
    if (aiInRange(F, d, foe, -6)) { this.dir = 0; this.press('light', 'jail'); }
    else this.dir = to;
  },
  // 对手开着架招（月镜、雷铠、回音壁）：别打进去，等它收招
  respectCounter(me, foe, d, to) {
    this.stopAll();
    if (foe.skill === 'echowall') { if (d < 140) this.dir = -to; return true; }
    if (d < 200) this.dir = -to; else this.dir = 0;
    return true;
  },

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
    // 倒地还能补一刀（多人对局里每人一刀）：够得着就先补
    if (foe.state === 'knockdown' && foe.t > 0.05 && aiInv(foe, me) <= 0) {
      const F0 = aiFrame(me, 'l1');
      this.dir = d > F0.max - 10 ? to : d < F0.min ? -to : 0;
      if (aiInRange(F0, d, foe)) { this.dir = 0; this.press('light'); }
      return;
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
  },
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
  },

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
    const a1 = me.moves.a1, T = a1.su + a1.ac * 0.5, pm = aiPredict(me, T), pf = aiPredict(foe, T);
    const dx = Math.abs(pf.x - pm.x), dy = pf.y - pm.y, reach = a1.box[2] + 18 * (foe.size || 1) - 8;
    // 低难度出手时机不准（提前或拖后），高难度算好双方落点再挥
    const slop = (1 - L.skill) * 70;
    if (dx < reach + slop && dy < 112 + a1.box[3] - 6 + slop && dy > a1.box[1] + 6 - slop && aiInv(foe, me) <= 0.05 && Math.random() < 0.25 + 0.75 * L.aggr) this.press('light');
    // 燕翎：低空就飞起来
    if (me.ch.fly && me.vy > -100 && me.y > -120 && d > 220 && Math.random() < 0.05) this.flyUntil = clock + rand(0.3, 0.9);
  },

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
    return F.dmg * rel / (0.2 + aiHitTime(F, d)) * aiModeActionWeight(f, opp, key, d);
  },
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
  },
  // 对手某个技能现在能不能用
  ready(f, slot) { return !!slot && (slot === 'skill' ? f.skillCD : f.skill2CD) <= 0.15; },
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
  },
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
    want = Math.max(58, want);   // 保持健康近战间距，避免近战 AI 反复顶撞对手身体
    this.map = { t: clock, foe, mine, theirs, want };
    return this.map;
  },

  // ----- 立回：按对位图站位，在合适的时候出最划算的一招 -----
  neutral(me, foe, d, to) {
    const L = this.L, g = this.g;
    this.dir = 0;
    // 失误：像人一样的失误——差一点够不着就急着挥刀、或者犹豫着多走半步；不会隔着半个场地对空气出招
    if (this.err()) {
      this.stepDir = Math.random() < 0.5 ? to : -to; this.stepT = clock + rand(0.2, 0.45); this.dir = this.stepDir;
      if (d < aiFrame(me, 'l1').max * 1.7 + 30 && Math.random() < 0.3) this.press('light');
      return;
    }
    if (this.watch2v2(me, foe, d, to)) return;
    if (this.aiTeamTactics(me, foe, d, to)) return;
    const cm = typeof squadAiMod === 'function' ? squadAiMod(me, foe, d) : (M.cmd ? cmdAiMod(me, foe, d) : null);   // 战队指挥战术与阵型：适用于 2v2、3v3–16v16 团战、夺旗、四象
    if (cm && cm.retreat && !this.holdAtk) {
      this.dir = cm.dir || -to;
      if (d < 170 && (foe.state === 'attack' || foe.state === 'skill')) this.holdDown = Math.max(this.holdDown, 0.18);
      return;
    }
    if (cm && cm.dir && !this.holdDown && !this.holdAtk) { this.dir = cm.dir; return; }
    // 假动作（绝顶/天道）：贴近半步骗对手出手或乱闪，再退开等它收招
    if (this.feint && clock < this.feint.end) { this.dir = clock < this.feint.turn ? to : -to; return; }
    if (L.bait >= 0.6 && me.onGround() && (!this.feint || clock > this.feint.end + 2.5)
      && d < aiFrame(me, 'l1').max + 110 && d > aiFrame(me, 'l1').max - 10 && Math.random() < 0.05 * L.bait) {
      this.feint = { turn: clock + 0.14, end: clock + 0.34 }; this.dir = to; return;
    }
    // 大招：确定打得到就放（结合团队战术 ultMul 与集火受控协同）
    const isMayhem = M.mode === 'mayhem' || (typeof mayhemOn === 'function' && mayhemOn());
    const ultWeight = aiModeActionWeight(me, foe, 'special', d) * (isMayhem ? 1.2 : 1) * (cm && cm.ultMul ? cm.ultMul : 1);
    if (me.meter >= 100 && this.ultWouldHit(me, foe, d, false) && Math.random() < Math.min(1, L.ult * (1 - g.ultSave * 0.6) * ultWeight)) { this.press('special'); return; }
    // 低难度：技能乱放
    if (Math.random() > L.skill && Math.random() < 0.12) {
      const slot = Math.random() < 0.5 ? 'skill' : 'skill2', F = aiFrame(me, slot);
      // 乱放也要像样：打人的技能至少离得不太远才会手痒按出来（以前隔着全场也放）
      const role = (AI_KIT[slot === 'skill' ? me.ch.skill : me.ch.skill2] || {}).role;
      const plausible = F.max > 0 ? d < F.max * 1.5 + 60 : role === 'counter' ? d < 220 && L.skill < 0.7 : true;   // 架招：新手才会离着老远空架
      if ((slot === 'skill' ? me.skillCD : me.skill2CD) <= 0 && plausible) { this.press(slot); return; }
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
    // 暗器已经在路上：出招到一半会被打断的就先不出（劲敌以上才看得这么远）
    const flying = L.read >= 0.3 ? this.incomingProj(me, 0.8) : null;
    for (const k of AI_ACT_KEYS) {
      if (k === 'special') continue;
      let v = this.actValue(me, foe, k, d);
      if (v <= 0) continue;
      if (flying && (k === 'cs1' || k === 'cs2' || aiHitTime(aiFrame(me, k), d) > flying.t - 0.03)) continue;
      if (k === 'skill' || k === 'skill2') {
        const id = k === 'skill' ? me.ch.skill : me.ch.skill2, K = AI_KIT[id] || {};
        if ((k === 'skill' ? me.skillCD : me.skill2CD) > 0) continue;
        if (SKILLS[id].can && !SKILLS[id].can(me)) continue;
        if (K.use && !K.use(me, foe, d, this)) continue;
        if (K.role === 'proj' && foe.state === 'skill' && AI_KIT[foe.skill] && AI_KIT[foe.skill].reflect) continue;
        if (K.jail) v *= 2;
        if (K.role === 'proj') v *= 0.5 + g.zone;
        v *= (k === 'skill' ? 0.5 + g.qn : 0.5 + g.rn) * (cm && cm.skillMul ? cm.skillMul : 1);
      } else if (k === 'cs1' || k === 'cs2') {
        v *= (0.25 + g.charge) * (k === 'cs2' && this.habit('blockRate', 0.5) > 0.55 ? 1.5 : 1);
        // 蓄力要先按住 0.3 秒：对手一伸手就打得到的距离上别起手（会被打断，松手还会漏出一记空挥）。越会玩的越讲究
        const foeReach = Math.max(aiFrame(foe, 'l1').max, aiFrame(foe, 'dl').max) + 18 * (me.size || 1) - 18;
        if (AI_FREE.includes(foe.state) && d < foeReach + 70) v *= 1 - 0.85 * L.skill;
        // 蓄力时挡不了：对手手里有现成的暗器就别蓄（会被远远打断）
        const fq = AI_KIT[foe.ch.skill] || {}, fr = AI_KIT[foe.ch.skill2] || {};
        if (AI_FREE.includes(foe.state) && (foe.ch.inkShot || (fq.role === 'proj' && foe.skillCD <= 0.6) || (fr.role === 'proj' && foe.skill2CD <= 0.6))) v *= 1 - 0.8 * L.skill;
        if (this.habit('aggr', 0.5) > 0.65) v *= 0.7;        // 对手爱抢攻：少蓄力
        if (this.habit('jumpRate', 0.2) > 0.45) v *= 0.7;    // 对手爱跳：蓄力冲斩容易被跳过
      }
      else if (k === 'air') v *= g.jumpIn;
      else v *= 0.6 + g.poke;
      v *= this.muWeight(me, foe, k, d);
      // 对手在挡：可挡的招打上去只削架势
      const F = aiFrame(me, k);
      // 风险：被挡后收招慢（对手一刀就能确反）的技能，对爱挡的对手少用；被挡后还占先手的技能，对爱挡的对手多用来压制。越会玩的越讲究
      if ((k === 'skill' || k === 'skill2') && F.blockable !== false && typeof F.adv === 'number' && AI_FREE.includes(foe.state)) {
        const pBlock = this.habit('blockRate', 0.5), foeFast = Math.min(aiFrame(foe, 'l1').hit, aiFrame(foe, 'dl').hit || 9);
        if (F.adv < -(foeFast + 0.03)) v *= 1 - 0.7 * pBlock * L.punish;
        else if (F.adv > 0.1) v *= 1 + 0.3 * pBlock * L.punish;
      }
      if (F.blockable !== false && (foe.state === 'block' || foe.state === 'blockstun')) v *= (foe.guard || 100) < 40 ? 0.9 : 0.35;
      // 对手开着架招：近身招别打进去
      if (foe.state === 'skill' && AI_KIT[foe.skill] && AI_KIT[foe.skill].role === 'counter' && k !== 'cs2') v *= 0.05;
      if (v > bv) { bv = v; bestKey = k; }
    }
    // 出不出手：威胁值够高、而且时机合适（对手在走动/收招，没在无敌）
    // 动态风险收益修正（Risk-Reward & Adaptive Neutral Evaluation）：
    // 若血量劣势，增加险招权重（不可挡蓄力 / 强抓破绽）；若血量领先，打稳抓确反
    const hpRatio = (me.hp / Math.max(1, me.maxHp)) - (foe.hp / Math.max(1, foe.maxHp));
    // 时间快到了还落后：必须抢攻（时间到按血量判负）；领先就稳着打
    const rushing = L.lead > 0 && hpRatio < -0.03 && !M.ot && M.timer < 18;
    const riskMod = rushing ? 1.6 : hpRatio < -0.2 ? 1.25 : hpRatio > 0.25 ? 0.85 : 1.0;
    const aggr = Math.min(1, L.aggr * (0.45 + g.aggr) * riskMod * (cm ? cm.aggr : 1));
    const foeBusy = foe.state === 'walk' || (foe.state === 'attack' && foe.t > foe.move.su) || foe.state === 'air';
    const go = bestKey && aiInv(foe, me) <= 0.05 && Math.random() < aggr * (foeBusy ? 1 : 0.7) && bv > 18 * (1.2 - aggr);
    if (go) { this.attacks++; return this.doAct(me, foe, d, to, bestKey); }
    // 站位：往理想距离走，偶尔后撤诱招、原地格挡
    const profile = aiHeroTactic(me.ch.id);
    let want = map.want * profile.range * (cm ? cm.range : 1);
    if (rushing) want *= 0.8;
    const arena = typeof mapNow === 'function' ? mapNow() : null, env = M.mapEnv;
    if (arena && arena.ice && typeof mapGrip === 'function' && mapGrip(me) < 1) want *= 1.04;
    if (arena && arena.wind && env && env.wOn > 0 && Math.sign(env.wDir) === to) want += Math.min(45, arena.wind.push * 0.08);
    const guardPct = me.guard / Math.max(1, me.maxGuard), hpPct = me.hp / Math.max(1, me.maxHp);
    if (arena && arena.fog && (guardPct < 0.45 || (hpPct < 0.55 && aiScrollIds(me).some(id => id === 'meditation' || id === 'second_wind')))) {
      const fog = arena.fog, u = me.x / STAGE_W;
      if (u < fog.from || u > fog.to) { const center = (fog.from + fog.to) * STAGE_W / 2; this.dir = Math.sign(center - me.x); return; }
    }
    // 站位的小碎步要走完一步再换（0.16~0.45 秒）：以前每次思考都重掷方向，高难度一秒来回抖七八次
    if (d > want + 25) { this.dir = to; this.stepT = 0; }
    else if (d < want - 30) { this.dir = -to; this.stepT = 0; }
    else if (clock < (this.stepT || 0)) this.dir = this.stepDir || 0;
    else {
      if (Math.random() < g.back * 0.4) this.stepDir = -to;
      else if (map.theirs[i] > map.mine[i] && Math.random() < L.block * 0.4 + (cm ? cm.block : 0)) { this.stepDir = 0; this.holdDown = 0.15; }
      else this.stepDir = Math.random() < 0.35 ? to : Math.random() < 0.5 ? -to : 0;
      this.stepT = clock + rand(0.16, 0.45);
      this.dir = this.stepDir;
    }
    // 假动作：出手一半转格挡，骗对手出招或闪
    if (L.bait > 0.5 && d < aiFrame(me, 'l1').max + 40 && Math.random() < 0.06 * g.bait && this.model.aggr > 0.4) { this.press('light', 'feint'); this.holdDown = 0.08; }
  },
  doAct(me, foe, d, to, key) {
    switch (key) {
      case 'l1': this.holdDown = 0; this.press('light'); return;
      case 'dl': this.holdDown = 0.05; this.press('light'); return;
      case 'cs1': case 'cs2': this.startCharge(me, foe, d, key); return;
      case 'air': this.dir = to; this.plan([['jump', 0], ['light', 0.58]]); return;
      default: this.press(key); this.afterSkill(me, key);
    }
  },
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
  },
  startCharge(me, foe, d, kind) {
    this.chargeTo = kind;
    // 低难度蓄力前先顿一下（破绽/预兆），让新手看得出、躲得开
    if (this.L.error >= 0.15) { this.dir = 0; this.plan([['chargeStart', 0.16 + this.L.error * 0.5]]); return; }
    this.holdAtk = 9; this.chargeT0 = clock; this.c.atkT = clock - 0.001;
  },
  hasZoning(f) {
    const q = AI_KIT[f.ch.skill], r = AI_KIT[f.ch.skill2];
    return (q && q.role === 'proj') || (r && r.role === 'proj') || !!f.ch.inkShot;
  },
  ultWouldHit(me, foe, d, inCombo) {
    const U = AI_ULT[me.ch.ult] || {}, F = aiFrame(me, 'special');
    if (aiInv(foe, me) > 0.1 || foe.hp <= 0) return false;
    if (U.sure && !U.sure(me, foe, d)) return false;
    if (U.heal) return true;
    // 对手腾空闪好了：全屏大招可能被闪掉，等对手闪用掉或被定住再放
    const stuck = AI_HURT.includes(foe.state) || foe.state === 'getup' || foe.jailT > 0 || foe.rooted || (foe.state === 'attack' && foe.t > foe.move.su) || foe.state === 'skill';
    if (U.contact) return aiInRange(F, d, foe, -10) && (stuck || this.L.ult < 0.9 || foe.breakCD > 0.5);
    if (!aiInRange(F, d, foe, 0)) return false;
    return stuck || foe.breakCD > 1.5 || this.L.ult < 0.9;
  },

  // ----- 避战：血量领先时拉开距离、只挡不攻、远程骚扰 -----
  keepAway(me, foe, d, to) {
    const L = this.L;
    const far = 420;
    if (d < far) this.dir = -to; else this.dir = 0;
    if (d < 200 && foe.state === 'attack') this.holdDown = 0.25;
    if (this.hasZoning(me) && Math.random() < 0.4) { const ps = this.projSlot(me); if (ps && d > 200 && aiInRange(aiFrame(me, ps), d, foe)) { this.press(ps); return; } if (me.ch.inkShot && (me.ink || 0) > 40 && d > 200) { this.press('light'); return; } }
    // 被逼到墙角：跳过去
    const cornered = (me.x < WALL + 140 && to > 0) || (me.x > STAGE_W - WALL - 140 && to < 0);
    if (cornered && d < 260 && me.onGround()) { this.dir = to; this.plan([['jump', 0], ['jump', 0.24]]); }
  },

  // ----- 躲山崩：模拟铁山下落算出落地时间，原地起跳的高度在 0.1~0.6 秒之间都超过 80 像素 -----
  dodgeAvalanche(me, foe, to, free) {
    if (this.avaKey !== this.ev) { this.avaKey = this.ev; this.avaRoll = Math.random(); }
    if (this.avaRoll > this.L.block) return false;   // 这次没看出来该跳
    let y = foe.y, vy = foe.vy, t = 0;
    const fast = Math.abs(me.x - foe.x) < 90 && foe.t > 0.18;   // 铁山对准了会按下加速
    while (t < 1.5 && !(t > 0.15 - foe.t && y >= 0)) { if (fast && vy > -300) vy += 1400 * STEP; vy += GRAV * STEP; y += vy * STEP; t += STEP; }
    this.stopAll(); this.holdDown = 0;
    if (!me.onGround()) { this.dir = -to; return true; }   // 已经在空中：别落下来
    if (free && t < 0.5 && t > 0.14) { this.press('jump'); this.dir = -to; return true; }
    if (t <= 0.14 && me.breakCD <= 0) { this.press('dash'); return true; }
    this.dir = -to;   // 还早：先往外走，等时机再跳
    return true;
  },
});
