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
    name: 'Badge effects only trigger on their matching combat actions',
    fn: `(() => {
      A.setChar(0); A.badgeId = 'focus'; A.badgeTier = 'silver'; A.moveName = 'cs2'; A.meter = 0;
      applyCombatBadgeHit(A, B, { name: 'cs2' }, { dd: 20 }); const charged = A.meter;
      A.meter = 0; applyCombatBadgeHit(A, B, { name: 'cs2' }, { dd: 20, blk: true }); const blocked = A.meter;
      B.badgeId = 'riposte'; B.badgeTier = 'silver'; B.maxGuard = 100; B.guard = 50;
      applyCombatBadgeGuard(B, { justGuard: true }); const parry = B.guard;
      A.badgeId = 'breaker'; A.badgeTier = 'gold'; A.meter = 0; applyCombatBadgeBreak(A, { guardBreak: true }); const breaker = A.meter;
      return { pass: charged === 1.2 && blocked === 0 && parry > 50 && breaker === 3, error: JSON.stringify({ charged, blocked, parry, breaker }) };
    })()`
  },
  {
    name: 'Stance and badge fields are included in authoritative network snapshots',
    fn: `(() => {
      const fields = ['stance', 'stanceUnlocked', 'stanceT', 'badgeId', 'badgeTier', 'badgeDashT'];
      const synced = fields.every(k => FK.includes(k));
      A.stance = 1; A.stanceUnlocked = true; A.badgeId = 'flowing'; A.badgeTier = 'gold';
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
