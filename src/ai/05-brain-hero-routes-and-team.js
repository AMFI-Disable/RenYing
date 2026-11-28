// ======================= 电脑 AI：侠客专属连段路线与多人团战协同 =======================
Object.assign(AIBrain.prototype, {
  // ----- 凌雀的连段路线 -----
  // 印记（雀芒，5 秒）由飞梭和大招挂上；带印记时换影穿刺会引爆、挑空，并把换影冷却清零，所以能接第二次换影追击。
  // 难度越高会的越多：寻常只会“有印记就引爆”；劲敌会等对手闪不了再引爆、引爆后接换影追击；
  // 绝顶 / 天道再用大招（全场必中、重新挂印记、清零换影）续上第二轮引爆，并且会等对手先把腾空闪交掉。
  // 离影的渡影：只从自由状态放（和规则一样）。选雾身靠方向键：dir 为 0 去高亮的那个（离对手最近），否则去那一边最近的
  // 简单 / 入门不会渡影；寻常偶尔；劲敌以上按下面两条规则。平衡交给 Trainer 再调
  liyingRoute(me, foe, d, to) {
    const L = this.L, cs = me.clones || [];
    if (!cs.length || me.skill2CD > 0 || !['idle', 'walk', 'air', 'block'].includes(me.state) || foe.hp <= 0 || !this.seen) return false;
    if (clock < (this.lyNext || 0) || L.combo < 3) return false;
    const go = c => {   // 去雾身 c：先定好方向，pickClone 在这一帧按方向键选
      const mark = cloneMark(me, foe);
      this.stopAll(); this.dir = c === mark ? 0 : Math.sign(c.x - me.x) || 0; this.holdDown = 0;
      this.press('skill2', 'liying'); this.lyNext = clock + 0.6; return true;
    };
    const open = ['attack', 'skill', 'charge', 'special'].includes(foe.state) && foe.t > 0.12 && Math.abs(foe.vx) < 400;
    // 1. 对手出招落空 / 收招：去他身后、离他 220 像素以内的雾身
    if (open) {
      const behind = cs.find(c => Math.sign(c.x - foe.x) === Math.sign(foe.x - me.x) && Math.abs(c.x - foe.x) < 220);
      if (behind && pickCloneDir(me, foe, behind) && Math.random() < L.skill * (L.read >= 0.7 ? 0.9 : 0.5)) return go(behind);
    }
    // 2. 残血、对手贴身：去离对手最远的雾身
    if (me.hp < me.maxHp * 0.35 && d < 180 && L.read >= 0.3) {
      let far = null; for (const c of cs) if (!far || Math.abs(c.x - foe.x) > Math.abs(far.x - foe.x)) far = c;
      if (far && Math.abs(far.x - foe.x) > 320 && pickCloneDir(me, foe, far) && Math.random() < L.skill * 0.6) return go(far);
    }
    return false;
  },
  // 磁仙：负极 R 是 0.16 秒起手、挡不住的远程吸人（560 像素内），吸到身前定住；Q 换极性会把 R 冷却清零。
  // 负极打法最好：吸人 → 负极长连（劲敌约 8 下，天道连到消磁前）；绝顶 / 天道连完从命中取消成 Q 换正极，下一下正极普攻挑飞收尾，
  // Q 好了再换回负极。入门交给通用打法（AI_KIT 的 polarswap 规则）
  cixianRoute(me, foe, d, to) {
    const L = this.L;
    if (L.combo < 3 || foe.hp <= 0) return false;
    const rReady = me.skill2CD <= 0, qReady = me.skillCD <= 0, roll = p => Math.random() < p;
    // 1. 正极（负极长连收尾换过去的）：Q 一好就换回负极，负极才能吸人、长连
    if (me.pol > 0 && qReady && roll(L.skill)) { this.stopAll(); this.press('skill', 'cixian'); return true; }
    if (me.pol > 0) return false;
    const free = AI_FREE.includes(me.state) || me.state === 'air';
    if (!free || aiInv(foe, me) > 0 || !this.seen || clock < (this.cxNext || 0)) return false;
    // 2. 负极、R 好了、对手在吸得到的距离：吸过来（挡不住），接负极长连
    const counter = foe.state === 'skill' && AI_KIT[foe.skill] && AI_KIT[foe.skill].role === 'counter';
    if (rReady && me.onGround() && d > 120 && d < MAG.rMinusRange - 40 && Math.abs(foe.y - me.y) < 220 && !counter && roll(L.skill)) {
      this.stopAll(); this.press('skill2', 'cixian'); this.cxNext = clock + 0.5; return true;
    }
    return false;
  },
  // 赤霄：先以焰戟突进挂【灼烧】触发被动增伤减冷却，再近身烈环挑飞收割
  chixiaoRoute(me, foe, d, to) {
    const L = this.L, free = AI_FREE.includes(me.state) && me.onGround();
    if (!free || foe.hp <= 0 || foe.invul > 0 || !this.seen || L.combo < 3 || clock < (this.cx2Next || 0)) return false;
    const burning = (foe.burnT || 0) > 0.2;
    if (burning && me.skill2CD <= 0 && d < 135 && Math.abs(foe.y - me.y) < 120 && this.chance(L.skill)) {
      this.stopAll(); this.press('skill2', 'chixiao'); this.cx2Next = clock + 0.45; return true;
    }
    if (!burning && me.skillCD <= 0 && d > 110 && d < 350 && Math.abs(foe.y - me.y) < 100 && foe.state !== 'block' && this.chance(L.skill * 0.85)) {
      this.stopAll(); this.press('skill', 'chixiao'); this.afterSkill(me, 'skill'); this.cx2Next = clock + 0.55; return true;
    }
    return false;
  },
  // 玄机：中距离星漩引力拉人起手，远距离星枢自导压制
  xuanjiRoute(me, foe, d, to) {
    const L = this.L, free = AI_FREE.includes(me.state) && me.onGround();
    if (!free || foe.hp <= 0 || foe.invul > 0 || !this.seen || L.combo < 3 || clock < (this.xjNext || 0)) return false;
    if (me.skill2CD <= 0 && d > 85 && d < 235 && Math.abs(foe.y - me.y) < 120 && (foe.onGround() || foe.y > -80) && this.chance(L.skill * 0.85)) {
      this.stopAll(); this.press('skill2', 'xuanji'); this.afterSkill(me, 'skill2'); this.xjNext = clock + 0.55; return true;
    }
    if (me.skillCD <= 0 && d > 250 && d < 660 && this.chance(L.skill * 0.7)) {
      this.stopAll(); this.press('skill', 'xuanji'); this.xjNext = clock + 0.5; return true;
    }
    return false;
  },
  // 青鸾：团队治疗优先，主动靠近残血队友释放鸾羽，同时以翠风减速风筝近身之敌
  qingluanRoute(me, foe, d, to) {
    const L = this.L, free = AI_FREE.includes(me.state) && me.onGround();
    if (!free || foe.hp <= 0 || clock < (this.qlNext || 0)) return false;
    const allies = (typeof isMulti === 'function' && isMulti() && typeof sideFighters === 'function' && typeof fighterTeam === 'function')
      ? sideFighters(fighterTeam(me)).filter(a => a !== me && !a.hidden && a.hp > 0) : [];
    const hurtAlly = allies.find(a => a.hp < a.maxHp * 0.62 && Math.abs(a.y - me.y) < 120 && Math.abs(a.x - me.x) < 275);
    if (me.skill2CD <= 0 && (me.hp < me.maxHp * 0.66 || hurtAlly) && (L.read >= 0.3 || this.chance(Math.max(0.55, L.skill)))) {
      this.stopAll(); this.press('skill2', 'qingluan_heal'); this.qlNext = clock + 0.8; return true;
    }
    if (L.read >= 0.3 && me.skill2CD <= 0 && allies.length && d > 200) {
      const farHurt = allies.find(a => a.hp < a.maxHp * 0.55 && Math.abs(a.y - me.y) < 120 && Math.abs(a.x - me.x) >= 275 && Math.abs(a.x - me.x) < 620);
      if (farHurt) { this.dir = Math.sign(farHurt.x - me.x); return true; }
    }
    if (L.combo >= 3 && me.skillCD <= 0 && d > 140 && d < 460 && foe.invul <= 0 && this.chance(L.skill * 0.72)) {
      this.stopAll(); this.press('skill', 'qingluan_kite'); this.qlNext = clock + 0.5; return true;
    }
    return false;
  },
  // 玄武：霸体龟甲冲撞强换招、玄壁回架势破防震地
  xuanwuRoute(me, foe, d, to) {
    const L = this.L, free = AI_FREE.includes(me.state) && me.onGround();
    if (!free || foe.hp <= 0 || foe.invul > 0 || !this.seen || L.combo < 3 || clock < (this.xwNext || 0)) return false;
    if (me.skill2CD <= 0 && d < 185 && (foe.state === 'block' || (me.guard || 0) < (me.maxGuard || 100) * 0.55 || foe.state === 'attack') && this.chance(L.skill * 0.85)) {
      this.stopAll(); this.press('skill2', 'xuanwu_fort'); this.xwNext = clock + 0.65; return true;
    }
    if (me.skillCD <= 0 && d > 95 && d < 320 && ['attack', 'charge', 'walk', 'idle'].includes(foe.state) && this.chance(L.skill * 0.78)) {
      this.stopAll(); this.press('skill', 'xuanwu_bash'); this.afterSkill(me, 'skill'); this.xwNext = clock + 0.6; return true;
    }
    return false;
  },
  // 器灵双境自适应切换：血线/架势危急或被围攻切【守境】(2)，压制/追击/破防切【攻境】(1)
  aiAdaptStance(me, foe, d) {
    if (!me.relicStanceUnlocked || (me.relicStanceCd || 0) > 0 || !me.onGround() || !AI_FREE.includes(me.state)) return;
    if (this.L.read < 0.3 || clock < (this.stanceNext || 0)) return;
    let foesNear = 0, alliesNear = 0;
    if (typeof isMulti === 'function' && isMulti() && typeof foesOf === 'function' && typeof sideFighters === 'function') {
      for (const e of foesOf(me)) if (!e.hidden && e.hp > 0 && Math.abs(e.x - me.x) < 300 && Math.abs(e.y - me.y) < 120) foesNear++;
      for (const a of sideFighters(fighterTeam(me))) if (a !== me && !a.hidden && a.hp > 0 && Math.abs(a.x - me.x) < 340 && Math.abs(a.y - me.y) < 120) alliesNear++;
    }
    const lowSelf = me.hp < me.maxHp * 0.42 || (me.guard || 100) < (me.maxGuard || 100) * 0.38 || (foesNear >= 2 && alliesNear === 0);
    const pressAdv = foe.hp < foe.maxHp * 0.38 || AI_HURT.includes(foe.state) || (foe.guard || 100) < 32 || (me.hp > foe.hp * 1.15 && me.hp > me.maxHp * 0.55);
    const want = lowSelf ? 2 : pressAdv ? 1 : me.relicStance;
    if (want && want !== me.relicStance) {
      this.press('relicStance', 'stance_adapt');
      this.stanceNext = clock + 1.4;
    }
  },
  // 地图与模式目标感知：天雷免疫、灵坛争锋占点、山河断崖与平台、大型分层战场全增益与跳层伏击
  aiMapObjectives(me, foe, d, to) {
    const mp = typeof mapNow === 'function' ? mapNow() : null;
    const env = M.mapEnv;
    // 1. 天雷预警躲避（雷鸣、勾陈在雷泽有主场免疫，无需躲避）
    if (mp && mp.thunder && env && env.tWarn > 0 && me.invul <= 0 && !me.escInvul && !['special', 'held'].includes(me.state)) {
      const thunderImmune = mp.id === 'thunder' && Array.isArray(mp.fav) && mp.fav.includes(me.ch.id);
      if (!thunderImmune && Math.abs(me.x - mp.thunder.x * STAGE_W) < mp.thunder.r + 40 && AI_FREE.includes(me.state) && (me.y < -60 || (this.L.read >= 0.3 && env.tWarn < 0.45))) {
        this.dir = me.x < mp.thunder.x * STAGE_W ? -1 : 1;
        this.jumpHeld = false;
      }
    }
    // 2. 断崖地图：远离悬崖外沿；高难度主动把残血/靠近崖边的对手往外推
    if (mp && mp.cliff && me.onGround() && AI_FREE.includes(me.state)) {
      const edge = Math.min(me.x - WALL, STAGE_W - WALL - me.x), out = me.x < STAGE_W / 2 ? -1 : 1;
      if (edge < 170 && this.dir === out) {
        if (clock > (this.cliffT || 0)) { this.cliffT = clock + 0.5; this.cliffGo = this.chance(0.5 + 0.5 * this.L.read); }
        this.dir = this.cliffGo ? -out : 0;
      }
      if (edge < 120 && to === -out && d < 240 && !this.queue.length && this.chance(0.06)) { this.dir = to; this.plan([['jump', 0], ['jump', 0.22]]); }
    }
    // 3. 灵坛争锋（KOTH）：主动前往并争夺轮转灵坛（含高台跳上与下落）
    if (typeof kothOn === 'function' && kothOn() && M.koth && typeof KOTH !== 'undefined' && AI_FREE.includes(me.state) && !this.queue.length && !this.holdDown && !this.holdAtk) {
      const z = KOTH.zones[M.koth.zoneIdx];
      if (z) {
        const inHill = Math.abs(me.x - z.x) <= KOTH.zoneR * 0.85 && Math.abs(me.y - z.y) <= 85;
        const myTeam = typeof fighterTeam === 'function' ? fighterTeam(me) : (me.idx % 2);
        const needHill = !inHill && (M.koth.holder !== myTeam || M.koth.contested || d > 260);
        if (needHill && (this.L.read >= 0.3 || this.chance(0.45))) {
          const dxZ = z.x - me.x, dyZ = z.y - me.y;
          if (Math.abs(dxZ) > 45) this.dir = Math.sign(dxZ);
          if (me.onGround()) {
            if (dyZ < -45 && Math.abs(dxZ) < 220 && this.chance(0.09 + 0.08 * this.L.read)) { this.dir = Math.sign(dxZ) || to; this.plan([['jump', 0], ['jump', 0.22]]); }
            else if (dyZ > 45 && me.plat >= 0 && this.chance(0.12)) this.press('drop', 'koth_drop');
          }
          return;
        }
      }
    }
    // 4. 山河异境平台导航
    if (typeof mapPlats === 'function' && mapPlats() && me.onGround() && AI_FREE.includes(me.state) && !this.queue.length) {
      const dx = Math.abs(foe.x - me.x);
      if (me.plat >= 0 && foe.plat !== me.plat && foe.y > me.y + 40 && dx < 360 && this.chance(0.05)) this.press('drop');
      else if (foe.plat >= 0 && foe.plat !== me.plat && foe.y < me.y - 40 && dx < 240 && this.chance(0.04)) { this.dir = to; this.plan([['jump', 0], ['jump', 0.22]]); }
    }
    // 5. 多层战场（3v3–16v16 / 夺旗 / 四象）：全图增益扫描、夺旗目标导航与高打低快落伏击
    if (typeof battleMapOn === 'function' && battleMapOn() && AI_FREE.includes(me.state) && !this.queue.length && !this.holdDown && !this.holdAtk) {
      let perkGoal = null;
      if ((!ctfOn || !ctfOn()) && Array.isArray(M.battlePerks) && d > 260) {
        let bestScore = Infinity;
        for (const p of M.battlePerks) {
          if (!p || p.cooldown > 0) continue;
          const dist = Math.abs(p.x - me.x) + Math.abs(p.y - me.y) * 1.6;
          if (dist > 760) continue;
          let weight = 1;
          if (p.kind === 'hp' && me.hp < me.maxHp * 0.72) weight = 0.55;
          else if (p.kind === 'meter' && me.meter < 80) weight = 0.7;
          else if (p.kind === 'dmg') weight = 0.78;
          const sc = dist * weight;
          if (sc < bestScore) { bestScore = sc; perkGoal = p; }
        }
      }
      const goal = (typeof ctfObjective === 'function' ? ctfObjective(me, foe) : null) || perkGoal;
      const targetY = goal ? goal.y : foe.y;
      // 高打低快速落层伏击（无需绕行楼梯）
      if (this.L.read >= 0.3 && me.onGround() && me.y < -40 && targetY > me.y + 75 && Math.abs((goal ? goal.x : foe.x) - me.x) < 280 && this.chance(0.14)) {
        this.press('drop', 'battle_drop');
        return;
      }
      const stair = typeof battleStairTarget === 'function' ? battleStairTarget(me, targetY) : null;
      if (stair !== null) this.dir = Math.sign(stair - me.x);
      else if (goal && Math.abs(goal.x - me.x) > 35) this.dir = Math.sign(goal.x - me.x);
    }
  },
  // 多人团战协同战术：受围攻撤退靠拢队友、刺客/游斗双面夹击、远程/辅助后排站位、残架势压制破防
  aiTeamTactics(me, foe, d, to) {
    if (typeof isMulti !== 'function' || !isMulti() || (typeof isRaid === 'function' && isRaid())) return false;
    if (this.L.read < 0.3 || !me.onGround() || !AI_FREE.includes(me.state)) return false;
    const myTeam = typeof fighterTeam === 'function' ? fighterTeam(me) : (me.idx % 2);
    const allies = typeof sideFighters === 'function' ? sideFighters(myTeam).filter(a => a !== me && !a.hidden && a.hp > 0) : [];
    const foes = typeof foesOf === 'function' ? foesOf(me).filter(e => !e.hidden && e.hp > 0) : [];
    if (!allies.length) return false;
    const sameFloor = (a, b) => Math.abs(a.y - b.y) < 120;
    let foesNear = 0, alliesNear = 0, nearAlly = null, nearAllyD = Infinity;
    for (const e of foes) if (sameFloor(e, me) && Math.abs(e.x - me.x) < 320) foesNear++;
    for (const a of allies) {
      const da = Math.abs(a.x - me.x) + Math.abs(a.y - me.y) * 1.5;
      if (sameFloor(a, me) && Math.abs(a.x - me.x) < 360) alliesNear++;
      if (da < nearAllyD) { nearAllyD = da; nearAlly = a; }
    }
    // 1. 孤立受围攻且血量不健康：向最近队友靠拢
    if (foesNear >= 2 && alliesNear === 0 && me.hp < me.maxHp * 0.65 && nearAlly && nearAllyD > 200) {
      this.dir = Math.sign(nearAlly.x - me.x) || -to;
      return true;
    }
    const prof = aiHeroTactic(me.ch.id), role = prof.teamRole || 'skirmisher';
    // 2. 远程/辅助职业：前排队友正在贴身牵制目标时保持后排安全输出距离
    if ((role === 'zoner' || role === 'support') && d < 250) {
      const frontAlly = allies.find(a => sameFloor(a, foe) && Math.abs(a.x - foe.x) < 210 && ['vanguard', 'skirmisher'].includes(aiHeroTactic(a.ch.id).teamRole));
      if (frontAlly && this.chance(0.55)) { this.dir = -to; return true; }
    }
    // 3. 刺客/游斗职业：队友已在一侧压制目标时，结合游袭/包抄权重跳越夹击形成左右包抄
    const cmT = typeof squadAiMod === 'function' ? squadAiMod(me, foe, d) : null;
    const flankP = 0.18 * this.L.read * (cmT && cmT.flankBias ? Math.max(0.6, cmT.flankBias) : 1);
    if ((role === 'assassin' || role === 'skirmisher' || (cmT && cmT.flankBias > 1.0)) && d > 70 && d < 230 && !this.queue.length && clock > (this.flankCd || 0)) {
      const sameSideAlly = allies.find(a => sameFloor(a, foe) && Math.abs(a.x - foe.x) < 190 && Math.sign(a.x - foe.x) === Math.sign(me.x - foe.x));
      if (sameSideAlly && this.chance(Math.min(0.65, flankP))) {
        this.dir = to; this.plan([['jump', 0], ['light', 0.42]]); this.flankCd = clock + 2.2; return true;
      }
    }
    // 4. 目标架势见底且在近身距离：果断施压破防
    if ((foe.guard || 100) < 30 && d < 200 && this.L.punish >= 0.5 && foe.state === 'block' && this.chance(0.45)) {
      this.startCharge(me, foe, d, 'cs2'); return true;
    }
    return false;
  },
  lingqueRoute(me, foe, d, to) {
    const L = this.L, free = AI_FREE.includes(me.state) || me.state === 'air';
    if (!free || foe.hp <= 0 || aiInv(foe, me) > 0 || !this.seen) return false;
    if (clock < (this.lqNext || 0)) return false;
    const mark = foe.needleMark || 0, rReady = me.skill2CD <= 0, qReady = me.skillCD <= 0;
    const markTime = (foe.needleMarkT !== undefined && foe.needleMarkT > 0) ? foe.needleMarkT : mark;
    const fly = d / SD_SPD + 0.1 + (SD_DRIFT_MAX / SD_DRIFT_SPD + 0.12);   // 换影起手 + 飞到对手身边 + 第一次近身漂移回拉再扑回来
    const stuck = AI_HURT.includes(foe.state) || foe.jailT > 0 || foe.rooted;   // 对手正在挨打，闪不了也挡不了
    const canEsc = foe.breakCD <= fly && !stuck;                  // 对手的腾空闪能躲开换影
    const roll = p => Math.random() < p;
    const act = (k, wait = 0.25) => { this.stopAll(); this.press(k, 'lingque'); this.lqNext = clock + wait; return true; };
    if (L.combo < 3) return false;                               // 入门：不会刻意打连段，交给通用打法
    // 0. 换影穿刺被挡也会把人定住 0.45 秒（强袭定身）：贴身接普攻
    if (foe.state === 'hitstun' && foe.rooted && me.onGround() && d < aiFrame(me, 'l1').max + 15 && clock - (this.lqDash || -9) < 1.2 && roll(L.punish)) return act('light', 0.15);
    // 1. 对手被换影引爆挑飞、换影刚清零：大招再挂一层印记（续下一轮），没气就直接换影追击
    if (rReady && foe.state === 'launched' && this.lqBurst && clock - this.lqBurst < 0.9) {
      if (me.meter >= 100 && L.ult >= 0.9 && roll(L.ult)) { this.lqBurst = 0; return act('special', 1.2); }
      if (L.combo >= 5 && roll(L.skill)) { this.lqBurst = 0; return act('skill2', 0.4); }
    }
    // 2. 有印记、换影好了：引爆
    if (mark > 0 && markTime > fly + 0.05 && rReady && d < 700) {
      const hurry = markTime < fly + 0.6;                             // 印记快没了，不等了
      if (L.read >= 0.3 && canEsc && !hurry) {
        // 劲敌以上：对手还留着腾空闪就先不放，等它交掉闪（绝顶 / 天道往前压逼闪，劲敌只是等）
        if (L.read >= 0.7) this.dir = d > 160 ? to : 0;
        this.lqHold = clock + 0.1;                                // 通用打法这一下也别放换影
        return false;
      }
      if (roll(Math.max(0.5, L.skill))) return act('skill2', 0.12);
    }
    // 3. 没印记：飞梭去挂。对手正在挨打、收招或者不在格挡时才扔（被挡住挂不上）
    if (qReady && mark <= 0 && me.onGround() && d > 60 && d < 460 && foe.y > -90) {
      const open = stuck || ['attack', 'skill', 'charge', 'getup', 'idle', 'walk'].includes(foe.state);
      if (open && foe.state !== 'block' && roll(L.skill * (L.read >= 0.3 ? 1 : 0.6))) return act('skill', 0.35);
    }
    return false;
  },

  // ----- 铁山山崩：空中对准对手落下 -----
  steerAvalanche(me, foe) {
    this.dir = Math.abs(me.x - foe.x) > 30 ? Math.sign(foe.x - me.x) : 0;
    if (Math.abs(me.x - foe.x) < 70 && me.t > 0.2) this.holdDown = 0.3;
  },

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
  },

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
      const ranged = r => r === 'proj' || r === 'trap';
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
      if (near && nd < 280 && Math.abs(me.x - near.x) < aiFrame(me, 'l1').max + 90 && dAltar <= nd + 70) {
        this.dir = Math.sign(near.x - me.x) || to;
        if (Math.abs(me.x - near.x) <= aiFrame(me, 'l1').max) this.press('light');
        return true;
      }
      if (want && dAltar < nd + 140) {
        const mateRush = mate && mate.hp > 0 && Math.abs(mate.x - cx) < dAltar && (orb.kind !== 1 || mate.hp < me.hp);
        if (!mateRush) { this.dir = Math.sign(cx - me.x) || to; if (dAltar < 48 && me.onGround()) this.press('jump'); return true; }
      }
    }
    if (ARENA2V2.geysers && (me.skillCD > 2.2 || me.skill2CD > 2.2)) {
      for (const gy of ARENA2V2.geysers) if (gy.cd <= 0 && Math.abs(me.x - gy.x) < 180 && Math.abs(me.x - gy.x) > 30 && Math.random() < 0.35) { this.dir = Math.sign(gy.x - me.x); return true; }
    }
    return false;
  },
});
