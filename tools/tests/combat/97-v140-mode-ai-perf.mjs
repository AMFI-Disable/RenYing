export default [
  {
    name: 'v1.4.0: resetMatchState clears match-scoped flags and saga/train handlers exist',
    fn: `(() => {
      M.subMode = 'pp_cc';
      M.cujuFour = true; M.kothFour = true;
      M.party = { kind: 'sumo' };
      M.raidSquadSize = 3;
      M.inkZones = [{ x: 400, y: 0, r: 90, t: 10, max: 12, rgb: '10,10,10' }];
      resetMatchState();
      const cleared = !M.subMode && !M.cujuFour && !M.kothFour && !M.party && !M.raidSquadSize && M.inkZones.length === 0;
      const hasSagaRematch = !!(MODE_HANDLERS.saga && typeof MODE_HANDLERS.saga.rematch === 'function');
      const hasTrainMenu = !!(MODE_HANDLERS.train && typeof MODE_HANDLERS.train.toMenuScreen === 'function');
      if (!cleared) return { pass: false, error: 'resetMatchState did not clear all match-scoped flags' };
      if (!hasSagaRematch) return { pass: false, error: 'MODE_HANDLERS.saga.rematch missing' };
      if (!hasTrainMenu) return { pass: false, error: 'MODE_HANDLERS.train.toMenuScreen missing' };
      return { pass: true };
    })()`
  },
  {
    name: 'v1.4.0: ROOM_MODES exposes 2v2 cuju2v2/koth2v2 and mayhemOn supports quad/gauntlet',
    fn: `(() => {
      const c2 = ROOM_MODES.cuju2v2;
      const k2 = ROOM_MODES.koth2v2;
      if (!(c2 && c2.four && c2.rule === 'cuju')) return { pass: false, error: 'ROOM_MODES.cuju2v2 invalid' };
      if (!(k2 && k2.four && k2.rule === 'koth')) return { pass: false, error: 'ROOM_MODES.koth2v2 invalid' };
      M.mode = 'quad'; M.teamMutator = 'mayhem';
      const quadMayhem = mayhemOn();
      M.mode = 'gauntlet'; M.teamMutator = 'mayhem';
      const gauntMayhem = mayhemOn();
      M.teamMutator = 'normal';
      const gauntNormal = mayhemOn();
      if (!quadMayhem || !gauntMayhem || gauntNormal) return { pass: false, error: 'mayhemOn quad/gauntlet gating failed' };
      return { pass: true };
    })()`
  },
  {
    name: 'v1.4.0: AI aiRelayAndInk triggers 3v3 Bench Assist, Hot-Tag escape, and Living Ink clash',
    fn: `(() => {
      startTag3Match([0, 1, 2], [3, 4, 5], 'god');
      M.phase = 'fight';
      A.ctrl = new AICtrl('god');
      B.ctrl = new AICtrl('god');
      const brain = A.ctrl.brain;
      A.hp = A.maxHp * 0.2;
      A.meter = 50;
      A.x = 700; B.x = 900; A.y = 0; B.y = 0;
      A.state = 'idle'; B.state = 'idle';
      brain.relayInkNext = -9;
      brain.chance = () => true;
      const hotAct = brain.aiRelayAndInk(A, B, 200, 1);
      const hotDown = brain.holdDown > 0;
      if (!hotAct || !hotDown) return { pass: false, error: 'AI Hot-Tag failed at low HP' };
      A.hp = A.maxHp;
      A.meter = 40;
      brain.relayInkNext = -9;
      const astAct = brain.aiRelayAndInk(A, B, 200, 1);
      const astNotDown = brain.holdDown === 0;
      if (!astAct || !astNotDown) return { pass: false, error: 'AI Bench Assist failed' };
      M.mode = 'cpu';
      inkZoneInit();
      inkZoneSpawn(700, 0, 100, '20,20,30');
      B.state = 'attack';
      brain.relayInkNext = -9;
      const inkAct = brain.aiRelayAndInk(A, B, 120, 1);
      if (!inkAct) return { pass: false, error: 'AI Living Ink clash awareness failed' };
      return { pass: true };
    })()`
  }
];
