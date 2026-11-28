function tryTacticalKeys(f, foe) {
  const c = f && f.ctrl;
  if (!c || M.phase !== 'fight' || f.hp <= 0) return false;
  if (c.consume('beacon')) {
    f.beaconT = 1.4;
    if (f.idx === localIdx()) camFocusPingT = 1.2;
    if (!RESIM) {
      ring(f.x, f.y - 56, 120, '233,196,106', 0.42);
      addP({ type: 'text', text: '我在此', x: f.x, y: f.y - 128, life: 0.85, max: 0.85, rgb: '255,235,140' });
    }
  }
  if (c.consume('lock')) {
    const foes = foesOf(f).filter(e => !e.hidden && e.hp > 0);
    if (foes.length) {
      const curI = foes.findIndex(e => e.idx === f.lockIdx);
      const next = foes[(curI + 1) % foes.length];
      f.lockIdx = next.idx;
      f.target = next;
      if (!RESIM) {
        ring(next.x, next.y - 60, 75, '255,95,85', 0.32);
        addP({ type: 'text', text: `锁定 · ${next.look.name}`, x: next.x, y: next.y - 118, life: 0.75, max: 0.75, rgb: '255,140,120' });
      }
    }
  }
  if (M.cmd) cmdHandleKeys(f, c);
  else if (typeof teamCmdEligible === 'function' && teamCmdEligible() && f.idx < 2 && !cpuTeamwork(f)) {
    if (c.consume('orderFocus')) {
      M.squadOrders[fighterTeam(f)] = 'focus';
      if (!RESIM) addP({ type: 'text', text: `${cvT('令')} · ${cvT('锋矢')}（${cvT('集火突击')}）`, x: f.x, y: f.y - 132, life: 0.9, max: 0.9, rgb: '255,165,100' });
    } else if (c.consume('orderProtect')) {
      M.squadOrders[fighterTeam(f)] = 'protect';
      if (!RESIM) addP({ type: 'text', text: `${cvT('令')} · ${cvT('铁壁')}（${cvT('抱团固守')}）`, x: f.x, y: f.y - 132, life: 0.9, max: 0.9, rgb: '130,220,255' });
    } else if (c.consume('orderSpread')) {
      M.squadOrders[fighterTeam(f)] = 'spread';
      if (!RESIM) addP({ type: 'text', text: `${cvT('令')} · ${cvT('游袭')}（${cvT('分散缠斗')}）`, x: f.x, y: f.y - 132, life: 0.9, max: 0.9, rgb: '140,240,180' });
    } else if (c.consume('orderAuto')) {
      M.squadOrders[fighterTeam(f)] = 'auto';
      if (!RESIM) addP({ type: 'text', text: `${cvT('令')} · ${cvT('智策')}（${cvT('智能自适应')}）`, x: f.x, y: f.y - 132, life: 0.9, max: 0.9, rgb: '233,196,106' });
    }
  }
  if (f.rallyCD <= 0 && c.consume('rally')) {
    f.rallyCD = 6.0;
    for (const mate of sideFighters(fighterTeam(f))) {
      if (!mate.hidden && mate.hp > 0 && Math.abs(mate.x - f.x) < 620) {
        mate.guard = Math.min(mate.maxGuard || 100, (mate.guard || 0) + 12);
      }
    }
    if (!RESIM) {
      ring(f.x, f.y - 56, 145, '233,196,106', 0.45);
      addP({ type: 'text', text: '战意号令!', x: f.x, y: f.y - 122, life: 0.85, max: 0.85, rgb: '255,220,130' });
      SFX.gong ? SFX.gong() : SFX.dash();
    }
  }
  if (f.petCD <= 0 && c.consume('pet')) {
    if (typeof tryPetActive === 'function' && tryPetActive(f, foe)) {
      // handled by pet system
    } else {
      f.petCD = 5.5;
      f.meter = Math.min(100, (f.meter || 0) + 8);
      if (!RESIM) {
        ring(f.x, f.y - 58, 92, '140,230,255', 0.34);
        addP({ type: 'text', text: '墨灵聚气', x: f.x, y: f.y - 114, life: 0.7, max: 0.7, rgb: '160,235,255' });
      }
    }
  }
  const canFeint = ['idle', 'walk', 'air', 'block', 'charge', 'aircharge'].includes(f.state)
    || (f.state === 'attack' && f.move && f.t >= (f.move.su + f.move.ac) * 0.7);
  if (canFeint && f.feintCD <= 0 && c.consume('feint')) {
    const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0) || f.face;
    endEscape(f);
    f.move = null; f.skill = null; f.state = 'dash'; f.t = 0; f.dashDir = dir;
    f.vx = DASH_V * 0.88 * dir; f.vy = f.onGround() ? 0 : Math.min(f.vy, -80);
    f.invul = Math.max(f.invul, 0.2); f.feintCD = 2.2;
    if (!RESIM) {
      ring(f.x, f.y - 48, 72, '175,235,255', 0.26);
      addP({ type: 'text', text: '虚招翻滚', x: f.x, y: f.y - 102, life: 0.6, max: 0.6, rgb: '175,235,255' });
      SFX.dash();
    }
    return true;
  }
  if (['idle', 'walk', 'block'].includes(f.state) && f.onGround() && f.qiParryCD <= 0 && c.consume('parry')) {
    f.qiParryT = 0.24; f.qiParryCD = 3.0; f.state = 'block'; f.t = 0; f.vx *= 0.2; f.face = blockFace(f, foe);
    if (!RESIM) {
      ring(f.x, f.y - 58, 86, '255,220,115', 0.3);
      addP({ type: 'text', text: '聚气架势', x: f.x, y: f.y - 108, life: 0.55, max: 0.55, rgb: '255,225,130' });
    }
    return true;
  }
  const canMartial = ['idle', 'walk', 'air'].includes(f.state);
  // U：重击劈斩（破防压迫，空中为下劈）
  if (canMartial && c.consume('heavyStrike')) {
    f.face = (c.held.right ? 1 : c.held.left ? -1 : f.face);
    startAttack(f, f.onGround() ? 'hv' : 'a2');
    return true;
  }
  // I：下段扫腿（快起手下盘踢击，扰乱重心）
  if (canMartial && f.onGround() && c.consume('lowKick')) {
    f.face = (c.held.right ? 1 : c.held.left ? -1 : f.face);
    startAttack(f, 'dl');
    if (typeof RYPhysics !== 'undefined' && RYPhysics.Balance && foe && Math.abs(foe.x - f.x) < 120) {
      RYPhysics.Balance.applyTripTorque && RYPhysics.Balance.applyTripTorque(foe, f.face * 26);
    }
    return true;
  }
  // O：居合斩穴（高速拔刀突刺 + 点穴封脉）
  if (canMartial && (f.iaidoCD || 0) <= 0 && c.consume('iaido')) {
    f.face = (c.held.right ? 1 : c.held.left ? -1 : f.face);
    f.iaidoCD = 3.2;
    f.vx = f.face * 540;
    startAttack(f, f.onGround() ? 'cs1' : 'a1');
    if (foe && Math.abs(foe.x - f.x) < 220 && Math.abs(foe.y - f.y) < 100) {
      foe.acupointT = Math.max(foe.acupointT || 0, 2.4);
      if (typeof RYPhysics !== 'undefined' && RYPhysics.IaidoAcupoint && RYPhysics.IaidoAcupoint.strikeAcupoint) {
        RYPhysics.IaidoAcupoint.strikeAcupoint(f, foe, { height: c.held.jump ? 'high' : c.held.down ? 'low' : 'mid' });
      }
    }
    if (!RESIM) {
      ring(f.x, f.y - 58, 96, '255,140,245', 0.32);
      addP({ type: 'text', text: '居合斩穴!', x: f.x, y: f.y - 116, life: 0.72, max: 0.72, rgb: '255,160,245' });
      SFX.slice && SFX.slice();
    }
    return true;
  }
  // H：擒拿投技（近身破防擒拿抛摔）
  if (canMartial && f.onGround() && (f.grappleCD || 0) <= 0 && c.consume('grapple')) {
    f.grappleCD = 3.5;
    const tFoe = foe && foe.hp > 0 && Math.abs(foe.x - f.x) < 115 && Math.abs(foe.y - f.y) < 85 ? foe : null;
    if (tFoe) {
      const throwDir = c.held.left ? -1 : c.held.right ? 1 : f.face;
      tFoe.vx = throwDir * 440;
      tFoe.vy = c.held.jump ? -560 : -340;
      tFoe.state = 'launched'; tFoe.t = 0; tFoe.stun = 0.55;
      tFoe.hp = Math.max(1, tFoe.hp - Math.round(28 * (f.ch.stat.dmg || 1)));
      if (typeof RYPhysics !== 'undefined' && RYPhysics.Grapple && RYPhysics.Grapple.executeThrow) {
        RYPhysics.Grapple.executeThrow(f, tFoe, c.held.jump ? 'sky' : throwDir !== f.face ? 'back' : 'forward');
      }
      if (!RESIM) {
        ring(tFoe.x, tFoe.y - 52, 90, '255,195,110', 0.34);
        addP({ type: 'text', text: '擒拿破防!', x: tFoe.x, y: tFoe.y - 114, life: 0.75, max: 0.75, rgb: '255,205,120' });
        SFX.heavy && SFX.heavy();
      }
    } else if (!RESIM) {
      addP({ type: 'text', text: '擒拿', x: f.x, y: f.y - 98, life: 0.45, max: 0.45, rgb: '210,205,190' });
    }
    f.vx = f.face * 180;
    return true;
  }
  return false;
}
// 顿帧、大招定格、被打飞倒地这些动不了的时候按下的技能先记着，能动了马上放，不会被吞掉
const HOLD_KEYS = ['skill', 'skill2', 'special'], HOLD_STATES = ['launched', 'knockdown', 'getup', 'hitstun', 'held'];
function holdBuf(f) {
  const c = f && f.ctrl; if (!c || !c.buf) return;
  const frozen = hitstop > 0 || superFreeze > 0, stuck = HOLD_STATES.includes(f.state);
  if (!frozen && !stuck) return;
  for (const a of frozen ? Object.keys(c.buf) : HOLD_KEYS) if (c.buf[a] !== undefined && clock - c.buf[a] <= BUF) c.buf[a] = clock;
}
function updateFighter(f, foe) {
  holdBuf(f);
  f.t += STEP;
  f.dashCD = Math.max(0, f.dashCD - STEP);
  f.stanceT = Math.max(0, (f.stanceT || 0) - STEP);
  f.relicStanceT = Math.max(0, (f.relicStanceT || 0) - STEP);
  f.relicStanceCd = Math.max(0, (f.relicStanceCd || 0) - STEP);
  f.relicCounterT = Math.max(0, (f.relicCounterT || 0) - STEP);
  f.feintCD = Math.max(0, (f.feintCD || 0) - STEP);
  f.qiParryCD = Math.max(0, (f.qiParryCD || 0) - STEP);
  f.qiParryT = Math.max(0, (f.qiParryT || 0) - STEP);
  f.petCD = Math.max(0, (f.petCD || 0) - STEP);
  f.rallyCD = Math.max(0, (f.rallyCD || 0) - STEP);
  f.iaidoCD = Math.max(0, (f.iaidoCD || 0) - STEP);
  f.grappleCD = Math.max(0, (f.grappleCD || 0) - STEP);
  f.acupointT = Math.max(0, (f.acupointT || 0) - STEP);
  if (typeof RYPhysics !== 'undefined' && RYPhysics.stepFighter) RYPhysics.stepFighter(f, STEP, { foe, fighters: allFighters(), isPrimaryFighter: f === A });
  f.badgeDashT = Math.max(0, (f.badgeDashT || 0) - STEP);
  for (const key of ['badgeLinkT', 'badgePressureT', 'badgeRiposteT', 'badgeBreakT', 'badgeAirSkillT', 'badgeExitT', 'ballGuardBreakT']) f[key] = Math.max(0, (f[key] || 0) - STEP);
  f.breakCD = Math.max(0, f.breakCD - STEP);
  f.skill2CD = Math.max(0, f.skill2CD - STEP);
  if (f.ch.inkShot) f.ink = Math.min(INK_MAX, (f.ink || 0) + INK_REGEN * STEP);
  f.bbT = Math.max(0, (f.bbT || 0) - STEP); f.twinT = Math.max(0, (f.twinT || 0) - STEP);
  if (f.onGround()) f.diveChained = false;
  trySecondQ(f, foe);
  escapeTick(f);
  cloneTick(f);
  if (tryEscape(f, foe)) { physics(f); return; }
  if (tryBreakoutSkill(f, foe)) { physics(f); return; }
  if (tryTacticalKeys(f, foe)) { physics(f); return; }
  f.skillCD = Math.max(0, f.skillCD - STEP);
  f.flying = false;
  if (mayhemOn()) {
    f.skillCD = 0;
    f.skill2CD = 0;
    f.breakCD = 0;
    f.meter = 100;
    if (f.ch.fly) f.flyT = f.ch.fly;
    if (f.ink !== undefined) f.ink = INK_MAX;
    if (f.drunk !== undefined) f.drunk = 100;
    if (f.notes !== undefined) f.notes = 3;
  }
  if (f.dummy && (f.ctrl && f.ctrl.cfg ? f.ctrl.cfg.autoHeal : true) && f.sinceHit > 2 && f.hp < f.maxHp) f.hp = f.maxHp;
  if (M.mode === 'train' && !f.dummy && typeof dummyCfg !== 'undefined' && dummyCfg.autoHeal && (f.hp <= 0 || (f.sinceHit > 2.4 && f.hp < f.maxHp))) {
    f.hp = f.maxHp;
    if (f.state === 'knockdown' && f.hp >= f.maxHp) f.t = Math.max(f.t, 0.35);
  }
  if (f.dummy && f.ctrl && (f.ctrl.cfg ? f.ctrl.cfg.infGuard : true)) { f.guard = f.maxGuard || 100; f.guardBroken = false; }
  if (f.dummy && f.ctrl && (f.ctrl.cfg ? f.ctrl.cfg.fixed : f.ctrl.mode === 'fixed')) { f.vx = 0; f.vy = 0; f.y = 0; if (f.homeX === undefined) f.homeX = f.x; f.x = f.homeX; } else if (f.dummy) f.homeX = undefined;
  if (f.ch.fly && f.onGround()) f.flyT = Math.min(f.ch.fly, f.flyT + STEP * 0.9);
  f.armorT = Math.max(0, f.armorT - STEP);
  f.slowT = Math.max(0, (f.slowT || 0) - STEP);
  f.defDebuffT = Math.max(0, (f.defDebuffT || 0) - STEP);
  f.buffT = Math.max(0, f.buffT - STEP);
  f.reflectT = Math.max(0, (f.reflectT || 0) - STEP);
  f.hookedT = Math.max(0, (f.hookedT || 0) - STEP);
  if (f.squashT > 0) f.squashT = Math.max(0, f.squashT - STEP);   // 被磁仙大招夹扁
  if (f.ch.passive === 'magnet') magTick(f);
  if (f.veilT > 0) f.veilT = f.hp > 0 ? Math.max(0, f.veilT - STEP) : 0;
  if (f.ch.passive === 'drunk') f.drunk = Math.max(0, (f.drunk || 0) - STEP);
  if (f.drinkT > 0) f.drinkT = Math.max(0, f.drinkT - STEP);
  if (f.jailT > 0) {   // 醉翁亭：关在亭子里，保持原层高原地挨打
    f.jailT = Math.max(0, f.jailT - STEP);
    if (f.hp <= 0) f.jailT = 0;
    else {
      f.x = f.jailX; f.y = f.jailY !== undefined ? f.jailY : gndY(f); if (f.jailPlat !== undefined) f.plat = f.jailPlat; f.vx = f.vy = 0;
      if (f.jailT > 0) { f.state = 'hitstun'; f.stun = f.t + f.jailT; f.rooted = true; f.move = null; f.skill = null; f.sp = null; }
      else { f.state = 'hitstun'; f.t = 0; f.stun = 0.12; f.rooted = false; }
    }
  }
  // 玉箫被动：不打人也会慢慢攒音律（每 2.5 秒一枚）
  if (f.ch.passive === 'rhythm' && (f.notes || 0) < 3 && M.phase === 'fight') { f.noteT = (f.noteT || 0) + STEP; if (f.noteT >= 2.5) { f.noteT = 0; f.notes = (f.notes || 0) + 1; } }
  // 酒火灼身：每 0.5 秒掉 3 血，烧不死人
  if (f.burnT > 0) {
    const b0 = f.burnT; f.burnT = Math.max(0, f.burnT - STEP);
    if (Math.floor(b0 / 0.5) !== Math.floor(f.burnT / 0.5) && f.hp > 1 && M.phase === 'fight' && !isClient()) { f.hp = Math.max(1, f.hp - 3); f.sinceHit = 0; f.lagDelay = 0.5; }
    if (Math.random() < 0.3) addP({ type: 'spark', x: f.x + rand(-14, 14), y: f.y - rand(30, 100), vx: rand(-20, 20), vy: -rand(30, 80), life: 0.35, max: 0.35, rgb: '255,140,50' });
  }
  f.sinceBlock = (f.sinceBlock || 0) + STEP;
  if (f.state !== 'block' && f.state !== 'blockstun' && f.sinceBlock > 0.6) {
    const baseRegen = ((f.ch && f.ch.stat && f.ch.stat.guardRegen) || 26);
    // 现实武侠调息呼吸法：静止调息更快，体力消耗过半后调息变缓，移动/出招时调息减半
    const hpFactor = clamp(0.55 + 0.45 * (f.hp / f.maxHp), 0.55, 1.0);
    const stateBonus = (f.state === 'idle' && f.onGround()) ? 1.25 : (['walk', 'air'].includes(f.state) ? 0.8 : 0.5);
    const stanceRegen = f.stance && f.stanceUnlocked && ['tieshan', 'yuehua'].includes(f.ch.id) ? 1.2 : 1;
    const relicRegen = f.relicStance === 2 ? 1.22 : 1;
    const regen = baseRegen * hpFactor * stateBonus * stanceRegen * relicRegen * STEP;
    f.guard = Math.min(f.maxGuard, (f.guard !== undefined ? f.guard : f.maxGuard) + regen);
  }
  if (f.state === 'skill' && f.skill === 'mirror') f.parryT = Math.max(0, f.parryT - STEP);
  if (f.state === 'skill' && f.skill === 'stomp') f.thunderGuardT = Math.max(0, (f.thunderGuardT || 0) - STEP);
  // 月华被动：3 秒没挨打缓慢回血
  f.sinceHit += STEP;
  if (f.ch.passive === 'regen' && M.phase === 'fight' && f.hp > 0 && f.hp < f.maxHp && f.sinceHit > 3 && f.regenLeft > 0) {
    const h = Math.min(13.5 * HERO_HP_SCALE * STEP, f.regenLeft); f.hp = Math.min(f.maxHp, f.hp + h); f.regenLeft -= h;
  }
  if (f.state !== 'special') f.invul = Math.max(0, f.invul - STEP);
  f.flash = Math.max(0, f.flash - STEP);
  if (f.beaconT > 0) f.beaconT = Math.max(0, f.beaconT - STEP);
  switch (f.state) {
    case 'idle': case 'walk': case 'air': case 'block': neutral(f, foe); break;
    case 'stance': if (f.stanceT <= 0) toNeutral(f); else { f.vx = damp(f.vx, 0, 12, STEP); } break;
    case 'attack': attackUpdate(f, foe); break;
    case 'dash':
      if (M.phase === 'fight' && f.t > 0.07) {
        if (f.ctrl.consume('light')) { startAttack(f, f.onGround() ? 'l3' : 'a1'); break; }
        if (f.ctrl.consume('heavy')) { startAttack(f, f.onGround() ? 'hv' : 'a2'); break; }
      }
      if (f.t >= DASH_T) { const ice = mapGrip(f) < 1 && mapNow().ice; f.vx *= ice ? ice.dash : 0.35; toNeutral(f); }   // 冰上闪步收尾还滑着
      break;
    case 'hitstun':
      if (f.t >= f.stun) { f.comboHits = 0; toNeutral(f); }
      break;
    case 'blockstun':
      if (f.ctrl && f.ctrl.held && f.ctrl.held.down && Math.abs(foe.x - f.x) > 6) {
        f.face = foe.x >= f.x ? 1 : -1;
      }
      if (f.t >= f.stun) {
        if (!f.ctrl.held.down) {
          toNeutral(f);
          const c = f.ctrl;
          if (c && M.phase === 'fight') {
            const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
            if (f.meter >= 100 && c.consume('special')) { startSpecial(f); break; }
            if (f.skillCD <= 0 && c.consume('skill')) { startSkill(f, foe); break; }
            if (f.skill2CD <= 0 && c.consume('skill2')) { startSkill(f, foe, 2); break; }
            if (c.held.atk) {
              if (clock - c.atkT >= CHARGE_START) {
                delete c.buf.light;
                f.state = 'charge'; f.t = 0; f.chargeFull = false; SFX.charge(); break;
              }
            } else {
              if (c.consume('light')) { startAttack(f, 'l1'); break; }
            }
            if (c.consume('heavy')) { startAttack(f, 'hv'); break; }
            if (c.consume('jump')) { doJump(f, dir); break; }
          }
        } else {
          const c = f.ctrl;
          if (c && M.phase === 'fight') {
            if (c.consume('light')) { startAttack(f, 'dl'); break; }
          }
          f.state = 'block';
        }
      }
      break;
    case 'knockdown': {
      const kdDur = (f.knockdownDur != null) ? f.knockdownDur : (f.quickGetup ? 0.22 : 0.6);
      if (f.t >= kdDur && f.hp > 0 && M.phase !== 'end') {
        f.state = 'getup'; f.t = 0; f.invul = 0.35; f.comboHits = 0; f.juggle = 0; f.otgBy = [];
        if (f.quickGetup) f.quickGetupPhase = true;
        f.quickGetup = false; delete f.knockdownDur;
        f.beaconT = 0.5;
      }
      break;
    }
    case 'getup': {
      const getupDur = f.quickGetupPhase ? 0.16 : 0.3;
      if (f.t >= getupDur) {
        f.quickGetupPhase = false;
        if (f.ctrl && f.ctrl.held && f.ctrl.held.down) {
          f.state = 'block'; f.face = blockFace(f, foe);
        } else {
          toNeutral(f);
        }
      }
      break;
    }
    case 'special': specialUpdate(f, foe); break;
    case 'charge': chargeUpdate(f, foe); break;
    case 'aircharge': airChargeUpdate(f, foe); break;
    case 'skill': if (SKILLS[f.skill]) SKILLS[f.skill].update(f, foe); else toNeutral(f); break;
    case 'launched': break;
    case 'held': if (f.t >= 1.25) toNeutral(f); break;
  }
  // 试炼/爬塔持续状态衰减（流血、寒霜减速、墨爆判定）
  if (f.bleedTicks > 0) {
    f.bleedTimer = (f.bleedTimer || 0) + STEP;
    if (f.bleedTimer >= 0.4) {
      f.bleedTimer = 0;
      f.bleedTicks--;
      const bDmg = Math.max(1, Math.round((f.bleedDmg || 6)));
      f.hp = Math.max(f.dummy ? 1 : 0, f.hp - bDmg);
      addP({ type: 'dmg', text: `${bDmg}`, x: f.x + rand(-15, 15), y: f.y - 70, vx: rand(-20, 20), vy: -120, g: 200, life: 0.65, max: 0.65, s: 0.75, rgb: '255,80,80', edge: '200,30,30' });
      for (let i = 0; i < 3; i++) addP({ type: 'spark', x: f.x, y: f.y - 50, vx: rand(-80, 80), vy: rand(-80, 50), life: 0.3, max: 0.3, rgb: '255,60,60' });
    }
  }
  if (f.frostSlow > 0) {
    f.frostSlow = Math.max(0, f.frostSlow - STEP);
    if (Math.random() < 0.25) addP({ type: 'spark', x: f.x + rand(-20, 20), y: f.y - rand(20, 80), vx: 0, vy: rand(-15, 15), life: 0.3, max: 0.3, rgb: '160,230,255' });
  }
  if (f.needleMark > 0) {
    if (f.needleMarkT !== undefined && f.needleMarkT > 0) {
      f.needleMarkT = Math.max(0, f.needleMarkT - STEP);
      if (f.needleMarkT <= 0) { f.needleMark = 0; f.needleMarkT = 0; }
    } else {
      f.needleMark = Math.max(0, f.needleMark - STEP);
    }
    if (Math.random() < 0.2) addP({ type: 'spark', x: f.x + rand(-15, 15), y: f.y - rand(25, 75), vx: 0, vy: rand(-10, 10), life: 0.25, max: 0.25, rgb: '235,110,210' });
  }
  if (f.shadowMarkT > 0) {
    f.shadowMarkT = Math.max(0, f.shadowMarkT - STEP);
    if (f.shadowMarkT <= 0) { f.shadowMarks = 0; f.shadowMarkT = 0; }
  }
  if (f.shadowExecT > 0) {
    f.shadowExecT = Math.max(0, f.shadowExecT - STEP);
    if (f.shadowExecT <= 0) { f.shadowExecTarget = -1; f.shadowExecT = 0; }
  }
  if (scOn()) scTick(f, foe);
  physics(f);
}
function physics(f) {
  mapPlatKeep(f);
  if (f.dropT > 0) f.dropT = Math.max(0, f.dropT - STEP);
  const wasAir = (f.y < 0 && f.plat < 0) || f.vy < 0;   // 站在平台上不算在空中
  let g = GRAV;
  if (f.airHover > 0) {
    f.airHover -= STEP;
    f.vx = 0; f.vy = 0; g = 0;
    if (Math.random() < 0.35) {
      addP({ type: 'spark', x: f.x + rand(-20, 20), y: f.y - rand(20, 70), vx: rand(-40, 40), vy: rand(-40, 40), life: 0.3, max: 0.3, rgb: f.look.slash });
    }
    if (f.airHover <= 0) endEscape(f);
  }
  if (f.flying) g = 0;
  if (f.state === 'dash' || f.state === 'held' || f.state === 'special' || f.airHover > 0) g = 0;
  else if (f.state === 'aircharge') g *= 0.22;
  else if (f.state === 'attack' && f.move.air) g *= 0.45;
  else if (f.state === 'skill' && f.skAir && SKILLS[f.skill] && !SKILLS[f.skill].air) g *= 0.45;   // 地面技能在空中放：和空中普攻一样下落变慢
  else if (f.state === 'launched') {
    const w = (f.ch && f.ch.stat && f.ch.stat.weight) || 1;
    g *= LAUNCH_GRAV * (1 + f.juggle * 0.12) * Math.min(1.25, Math.max(0.85, Math.pow(w, 0.35)));
  }
  const chaosGrav = (chaosNow('grav') || { val: 1 }).val;
  if (wasAir) f.vy += g * chaosGrav * STEP;
  if (f.state === 'held') { f.vx = 0; f.vy = 0; }
  const oldX = f.x, oldY = f.y;
  f.x += f.vx * STEP; f.y += f.vy * STEP;
  if (enterBattleStair(f, oldX)) f.vy = 0;
  if (f.y >= 0) { f.y = 0; f.plat = -1; if (wasAir) onLand(f); if (f.vy > 0) f.vy = 0; }
  else mapPlatLand(f, oldY, wasAir);   // 山河异境的平台
  const onG = f.y >= 0 || f.plat >= 0;
  const slide = f.state === 'skill' && SKILLS[f.skill] && SKILLS[f.skill].nofric;
  const fw = (f.ch && f.ch.stat && f.ch.stat.weight) || 1;
  const dampK = clamp(8.5 * Math.pow(fw, 0.4), 6.5, 12) * mapGrip(f);
  if (onG && !slide && !['walk', 'dash', 'idle', 'attack', 'charge'].includes(f.state)) f.vx = damp(f.vx, 0, dampK, STEP);
  if (onG && f.state === 'attack') f.vx = damp(f.vx, 0, f.lunged ? (dampK * 0.75) : (dampK * 1.5), STEP);
  mapWind(f, onG);
  const cliff = (mapNow() || {}).cliff;
  if (cliff) mapEdge(f, cliff);   // 断崖台：两侧是崖边，没有墙可撞
  else if (f.x < WALL || f.x > STAGE_W - WALL) {
    const side = f.x < WALL ? -1 : 1;
    f.x = side < 0 ? WALL : STAGE_W - WALL;
    if (f.state === 'launched' && Math.abs(f.vx) > 350 && !(mapNow() || {}).nobounce) {   // 皇城飞檐两侧没有红柱：不弹墙
      const isHardImpact = Math.abs(f.vx) > 480;
      f.vx *= isHardImpact ? -0.55 : -0.4;
      shake = Math.max(shake, isHardImpact ? 14 : 7);
      ring(f.x, f.y - 50, isHardImpact ? 90 : 50, '255,255,255', 0.35);
      SFX.thud();
      if (isHardImpact && !f.wallBounced) {
        f.wallBounced = true;
        f.vy = Math.min(f.vy, -220); // 弹墙向上微微浮空，提供连段追击窗口
        addP({ type: 'text', text: '撞墙震击', x: f.x + (side < 0 ? 40 : -40), y: f.y - 70, life: 0.6, max: 0.6, rgb: '255,220,160' });
        if (typeof ARENA_SPLATTERS !== 'undefined') {
          ARENA_SPLATTERS.push({ x: f.x, y: f.y - 50, rx: rand(18, 30), ry: rand(30, 55), rot: rand(-0.3, 0.3), life: 4.5, max: 4.5 });
          if (ARENA_SPLATTERS.length > 20) ARENA_SPLATTERS.shift();
        }
        for (let i = 0; i < 7; i++) {
          addP({ type: 'ink', x: f.x, y: f.y - rand(20, 80), vx: -side * rand(60, 220), vy: rand(-120, 40), g: 600, life: 0.5, max: 0.5, r: rand(2.5, 4.5), rgb: '18,18,24' });
        }
      }
    }
    else if (f.state === 'skill' && f.skill === 'shadowdash') {
      // 凌雀「移形换影」触墙不中断、不卡死停滞：沿墙借力反弹回场内
      f.vx = -side * Math.max(360, Math.abs(f.vx) * 0.85);
      if (f.y >= 0 && f.vy > 0) f.vy = -160;
    }
    else if (Math.sign(f.vx) === side) f.vx = 0;
  }
}
function onLand(f) {
  f.badgeAirUsed = 0; f.badgeAirSkillUsed = 0; f.badgeAirSkillT = 0;
  if (scOn()) scFire(f, 'land', foeOf(f), f.vy);
  f.wallBounced = false;
  if (f.airRecover) {
    f.airRecover = false;
    f.state = 'getup'; f.t = 0.15; f.vx *= 0.2; f.invul = 0.35; f.comboHits = 0; f.juggle = 0;
    f.beaconT = 0.5;
    dust(f.x, f.y, 10); SFX.land();
    return;
  }
  if (f.escInvul) {   // 腾空闪落地：无敌结束，短暂落地硬直
    endEscape(f); f.jumps = 0; f.airDash = 1;
    f.state = 'getup'; f.t = ESC.landLag; f.vx *= 0.3; dust(f.x, f.y, 6); SFX.land();
    return;
  }
  if (f.state === 'launched') {
    if (f.spiked && !f.bounced) { const ly = gndY(f); f.vy = -560; f.bounced = true; f.y = ly - 1; shake = Math.max(shake, 8); dust(f.x, ly, 14); ring(f.x, ly, 70, '255,255,255', 0.35); SFX.thud(); return; }

    // 落地受身翻滚判定（Tech Roll / Ukemi）：按闪避或跳跃瞬间滚身脱困
    const c = f.ctrl;
    const canTech = c && f.hp > 0 && !f.spiked && (c.consume('dash') || c.consume('jump') || (c.held && (c.held.dash || c.held.jump)));
    if (canTech) {
      const dir = (c.held && (c.held.left ? -1 : (c.held.right ? 1 : 0))) || -f.face;
      f.state = 'dash'; f.t = 0; f.face = -dir; f.vx = dir * 560;
      f.invul = 0.28; f.comboHits = 0; f.juggle = 0;
      f.beaconT = 0.5;
      dust(f.x, f.y, 12); SFX.dash();
      addP({ type: 'text', text: '受身', x: f.x, y: f.y - 70, life: 0.55, max: 0.55, rgb: '170,230,255' });
      return;
    }

    f.state = 'knockdown'; f.t = 0; f.vx *= 0.3; f.invul = 99; f.rot = 0; f.otgBy = [];   // 倒地整段无敌，但留出几下补刀（otgOpen）
    dust(f.x, f.y, 12); shake = Math.max(shake, 5); SFX.thud();
    return;
  }
  if (f.state === 'held') return;
  f.jumps = 0; f.airDash = 1; f.airCharged = false;
  if (f.state === 'aircharge') {
    f.state = 'charge';
    dust(f.x, f.y, 5); SFX.land();
    return;
  }
  if (f.state === 'air' || (f.state === 'attack' && f.move.air)) {
    const isPlunge = f.state === 'attack' && (f.moveName === 'a2' || f.moveName === 'cs2') && !f.hitConfirmed;
    toNeutral(f);
    if (isPlunge) {
      f.vx *= 0.35;
      dust(f.x, f.y, 10); SFX.land();
      shake = Math.max(shake, 4);
    } else {
      if (f.ctrl && f.ctrl.held && f.ctrl.held.down) { f.state = 'block'; f.face = Math.abs(foeOf(f).x - f.x) > 6 ? (foeOf(f).x >= f.x ? 1 : -1) : f.face; }
      dust(f.x, f.y, 4); SFX.land();
    }
  }
  else if (f.state === 'dash') { /* 地面冲刺结束会自己转状态 */ }
}

