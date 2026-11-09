// Combat regression tests for unlockable stances, badge triggers, and synchronized loadout state.
export default [
  {
    name: 'Every hero has a distinct alternate stance profile',
    fn: `(() => {
      const missing = CHARS.map(c => c.id).filter(id => !HERO_STANCES[id]);
      const unchanged = CHARS.filter((c, i) => {
        A.setChar(i); A.stance = 0; A.stanceUnlocked = true;
        const base = A.moves.hv, alt = stanceMove(A, 'hv');
        return !alt || JSON.stringify(alt) !== JSON.stringify(base);
      }).map(c => c.id);
      return { pass: !missing.length && !unchanged.length, error: JSON.stringify({ missing, unchanged }) };
    })()`
  },
  {
    name: 'Stance switching is deterministic, costs no meter, and has commitment',
    fn: `(() => {
      M.phase = 'fight'; A.setChar(0); A.reset(400); A.ctrl = new Ctrl(); A.stanceUnlocked = true; A.stance = 0; A.meter = 37;
      A.ctrl.press('stance'); const switched = trySwitchStance(A);
      const okSwitch = switched && A.stance === 1 && A.state === 'stance' && A.stanceT >= 0.17 && A.meter === 37;
      A.reset(400); A.stanceUnlocked = false; A.stance = 0; A.ctrl = new Ctrl(); A.ctrl.press('stance');
      const locked = !trySwitchStance(A) && A.stance === 0;
      M.phase = 'intro';
      return { pass: okSwitch && locked, error: JSON.stringify({ okSwitch, locked, state: A.state, meter: A.meter }) };
    })()`
  },
  {
    name: 'Playstyle badges open only their qualifying windows without resource payouts',
    fn: `(() => {
      A.setChar(0); B.setChar(1); A.reset(400); B.reset(800); A.meter = 41;
      const near = (x, y) => Math.abs(x - y) < 1e-9;
      A.badgeId = 'flowing'; A.badgeTier = 'silver'; A.moveName = 'l3'; B.comboHits = 3;
      applyCombatBadgeHit(A, B, { name: 'l3' }, { dd: 20 }); const flow = A.badgeLinkT;
      A.badgeLinkT = 0; A.badgeTier = 'gold'; applyCombatBadgeHit(A, B, { name: 'l3' }, { dd: 20 }); const flowGold = A.badgeLinkT;
      A.badgeTier = 'purpgold'; applyCombatBadgeHit(A, B, { name: 'l3' }, { dd: 20 }); const flowPurple = A.badgeLinkT;
      A.badgeId = 'focus'; A.badgeTier = 'silver'; A.moveName = 'cs2';
      applyCombatBadgeHit(A, B, { name: 'cs2' }, { dd: 20 }); const pressure = A.badgePressureT;
      const push = { vx: 500 }; applyCombatBadgeBlock(A, push); const reduced = push.vx;
      const pressureUsed = A.badgePressureT === 0;
      A.badgeTier = 'purpgold'; A.moveName = 'cs1'; applyCombatBadgeHit(A, B, { name: 'cs1' }, { dd: 20 });
      A.badgePressureT = 0; A.badgePressureSkill = 1; const skillPush = { vx: 500 }; applyCombatBadgeBlock(A, skillPush);
      const skillPressure = skillPush.vx;
      A.badgeId = 'riposte'; A.badgeTier = 'silver'; applyCombatBadgeGuard(A, { justGuard: true }); const riposte = A.badgeRiposteT;
      A.badgeTier = 'gold'; applyCombatBadgeGuard(A, { justGuard: true }); const riposteGold = A.badgeRiposteT;
      A.badgeId = 'breaker'; A.badgeTier = 'silver'; A.dashCD = 3; applyCombatBadgeBreak(A, { guardBreak: true }); const breaker = A.badgeBreakT;
      A.setChar(0); A.badgeId = 'ascent'; A.badgeTier = 'silver'; A.y = -50; A.airDash = 0; A.moveName = 'a1';
      applyCombatBadgeHit(A, B, { name: 'a1' }, { dd: 20 }); const airDash = A.airDash, airUsed = A.badgeAirUsed, airWindow = A.badgeAirSkillT;
      A.airDash = 0; applyCombatBadgeHit(A, B, { name: 'a1' }, { dd: 20 }); const airOneUse = A.airDash === 0;
      A.badgeId = 'pursuit'; A.badgeTier = 'gold'; A.badgeDashT = 1; A.moveName = 'l1';
      applyCombatBadgeHit(A, B, { name: 'l1' }, { dd: 20 }); const exit = A.badgeExitT, dashSpent = A.badgeDashT;
      A.meter = 41;
      const ok = near(flow, 0.65) && near(flowGold, 0.7475) && near(flowPurple, 0.845) && near(pressure, 0.8) && near(reduced, 360) && pressureUsed && near(skillPressure, 360) && near(riposte, 0.65) && near(riposteGold, 0.7475) && near(breaker, 0.8) && A.dashCD === 0 && airDash === 1 && airUsed === 1 && near(airWindow, 0.75) && airOneUse && near(exit, 0.7475) && dashSpent === 0 && A.meter === 41;
      return { pass: ok, error: JSON.stringify({ flow, flowGold, flowPurple, pressure, reduced, pressureUsed, skillPressure, riposte, riposteGold, breaker, airDash, airUsed, airWindow, airOneUse, exit, dashSpent, meter: A.meter }) };
    })()`
  },
  {
    name: 'Badge follow-ups consume once, expire, and show visible cues',
    fn: `(() => {
      M.phase = 'fight'; A.setChar(0); B.setChar(1); A.reset(400); B.reset(800); A.ctrl = new Ctrl(); A.ctrl.press('dash');
      A.badgeId = 'flowing'; A.badgeTier = 'silver'; A.badgeLinkT = 0.65; A.state = 'attack'; A.moveName = 'l1'; A.move = A.moves.l1; A.t = A.move.su + A.move.ac + 0.01; A.hitConfirmed = true;
      attackUpdate(A, B); const flowConsumed = A.badgeLinkT === 0 && A.state === 'dash';
      A.badgeId = 'breaker'; A.badgeTier = 'silver'; A.badgeBreakT = 0.8; A.dashCD = 0; startDash(A, 1); const breakConsumed = A.badgeBreakT === 0 && A.vx > DASH_V;
      A.badgeId = 'riposte'; A.badgeTier = 'purpgold'; A.badgeRiposteT = 0.845; const baseLunge = A.moves.hv.lunge || 0; startAttack(A, 'hv'); const riposteConsumed = A.badgeRiposteT === 0 && A.move.lunge === baseLunge + 58;
      A.badgeId = 'pursuit'; A.badgeTier = 'purpgold'; A.badgeExitT = 0.845; A.state = 'attack'; A.moveName = 'l1'; A.move = A.moves.l1; A.t = A.move.su + A.move.ac + 0.01; A.hitConfirmed = true; A.ctrl = new Ctrl(); A.ctrl.press('dash');
      attackUpdate(A, B); const exitConsumed = A.badgeExitT === 0 && A.invul === 0.08;
      const skillCancel = (id, field, tier = 'purpgold') => {
        A.reset(400); A.ctrl = new Ctrl(); A.ctrl.press('skill'); A.badgeId = id; A.badgeTier = tier; A[field] = 0.845;
        A.state = 'attack'; A.moveName = 'l1'; A.move = A.moves.l1; A.t = A.move.su + A.move.ac + 0.01; A.hitConfirmed = true; A.skillCD = 0; A.skill2CD = 0;
        if (id === 'ascent') A.y = -40;
        attackUpdate(A, B);
        return A.state === 'skill' && (id === 'focus' ? A.badgePressureSkill === 1 && A.badgePressureT === 0 : A[field] === 0);
      };
      const flowSkill = skillCancel('flowing', 'badgeLinkT'), focusSkill = skillCancel('focus', 'badgePressureT'), airSkill = skillCancel('ascent', 'badgeAirSkillT');
      A.reset(400); A.badgeId = 'breaker'; A.badgeTier = 'purpgold'; A.badgeBreakT = 1.04; const breakerLunge = A.moves.hv.lunge || 0; startAttack(A, 'hv'); const breakerHeavy = A.badgeBreakT === 0 && A.move.lunge === breakerLunge + 52;
      A.badgeLinkT = 0.005; A.state = 'idle'; A.t = 0; A.ctrl = new Ctrl(); updateFighter(A, B); const expired = A.badgeLinkT === 0;
      const oldAddP = addP; let cue = ''; addP = p => { if (p && p.type === 'text') cue = p.text; };
      A.badgeId = 'flowing'; showBadgeCue(A, 'flowing'); addP = oldAddP;
      const visible = cue === '连势 · 追步窗口'; M.phase = 'intro';
      return { pass: flowConsumed && breakConsumed && riposteConsumed && exitConsumed && flowSkill && focusSkill && airSkill && breakerHeavy && expired && visible, error: JSON.stringify({ flowConsumed, breakConsumed, riposteConsumed, exitConsumed, flowSkill, focusSkill, airSkill, breakerHeavy, expired, cue }) };
    })()`
  },
  {
    name: 'Stance and badge fields are included in authoritative network snapshots',
    fn: `(() => {
      const fields = ['stance', 'stanceUnlocked', 'stanceT', 'badgeId', 'badgeTier', 'badgeDashT', 'badgeLinkT', 'badgePressureT', 'badgePressureSkill', 'badgeRiposteT', 'badgeBreakT', 'badgeAirSkillT', 'badgeExitT', 'badgeAirUsed', 'badgeAirSkillUsed'];
      const synced = fields.every(k => FK.includes(k));
      A.stance = 1; A.stanceUnlocked = true; A.badgeId = 'flowing'; A.badgeTier = 'gold';
      for (const k of fields.slice(6)) A[k] = k.endsWith('Used') || k.endsWith('Skill') ? 1 : 0.37;
      const packed = snapF(A), idx = fields.map(k => FK.indexOf(k));
      const roundTrip = fields.every((k, i) => packed[idx[i]] === A[k]);
      return { pass: synced && roundTrip, error: JSON.stringify({ synced, roundTrip }) };
    })()`
  },
  {
    name: 'CPU opponents do not inherit the player account loadout',
    fn: `(() => {
      M.mode = 'cpu'; M.watchAi = false; M.combatLoadouts = null;
      window.armoryCombatLoadoutMap = () => ({ qingfeng: { unlocked: true, stance: 1, badge: 'focus', tier: 'gold' } });
      A.setChar(0); B.setChar(0); A.ctrl = human[0]; B.ctrl = new AICtrl('normal');
      applyCombatLoadouts();
      const own = A.stanceUnlocked && A.badgeId === 'focus' && A.badgeTier === 'gold';
      const enemy = !B.stanceUnlocked && !B.badgeId;
      delete window.armoryCombatLoadoutMap; M.mode = 'train';
      return { pass: own && enemy, error: JSON.stringify({ own, enemy, A: A.badgeId, B: B.badgeId }) };
    })()`
  },
  {
    name: 'Replays restore their recorded loadouts and keep old recordings loadout-free',
    fn: `(() => {
      M.mode = 'replay'; REPLAY.on = true; REPLAY.m = {}; REPLAY.seg = { loadouts: [
        { unlocked: true, stance: 1, badge: 'focus', tier: 'gold' }, {}
      ] };
      A.setChar(0); B.setChar(0); applyCombatLoadouts();
      const restored = A.stance === 1 && A.badgeId === 'focus' && A.badgeTier === 'gold' && !B.stanceUnlocked;
      REPLAY.seg = {}; applyCombatLoadouts();
      const legacy = !A.stanceUnlocked && !A.badgeId;
      REPLAY.on = false; REPLAY.m = null; REPLAY.seg = null; M.mode = 'train';
      return { pass: restored && legacy, error: JSON.stringify({ restored, legacy }) };
    })()`
  }
];
