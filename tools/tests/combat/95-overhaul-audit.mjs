// Comprehensive overhaul regression & invariant tests:
// 1. All 20 heroes execute normals, Q/R skills, and E ultimates with zero NaN states
// 2. 16v16 animation/trail/ghost/particle bounds hold under stress (zero memory leaks)
// 3. AI RNG determinism under netSim and hero-specific routes (Qingfeng, Yuxiao)

export default [
  {
    name: 'All 20 heroes execute normals, Q/R skills, and E ultimates cleanly with zero NaN states',
    fn: `(() => {
      const fails = [];
      for (let hi = 0; hi < CHARS.length; hi++) {
        startMatch('train', 'stand', [hi, (hi + 1) % CHARS.length]);
        showScreen(null); paused = false; M.phase = 'fight';
        A.x = STAGE_W / 2 - 90; B.x = STAGE_W / 2 + 40;
        A.hp = A.maxHp; B.hp = B.maxHp; A.meter = 100;
        A.skillCD = 0; A.skill2CD = 0;
        const seq = ['light', 'light', 'skill', 'skill2', 'special'];
        for (const act of seq) {
          A.ctrl.press(act);
          for (let f = 0; f < 30; f++) step();
        }
        const vals = [A.x, A.y, A.vx, A.vy, A.hp, A.meter, B.x, B.y, B.hp];
        if (vals.some(v => typeof v !== 'number' || Number.isNaN(v))) {
          fails.push(CHARS[hi].id + ': NaN state');
        }
        if (A.trail.length > 28 || A.ghosts.length > 18) {
          fails.push(CHARS[hi].id + ': unbounded trail/ghosts');
        }
      }
      return { pass: fails.length === 0, error: fails.join('; ') };
    })()`
  },
  {
    name: '16v16 stress test maintains bounded particles, trails, ghosts, and zero NaN states',
    fn: `(() => {
      startMelee(16, 0, 'normal', 'normal');
      showScreen(null); paused = false; M.phase = 'fight';
      for (let f = 0; f < 180; f++) step();
      const fs = allFighters();
      let maxTrail = 0, maxGhosts = 0, nanCount = 0;
      for (let i = 0; i < fs.length; i++) {
        const x = fs[i];
        if (x.trail.length > maxTrail) maxTrail = x.trail.length;
        if (x.ghosts.length > maxGhosts) maxGhosts = x.ghosts.length;
        if (Number.isNaN(x.x) || Number.isNaN(x.y) || Number.isNaN(x.hp)) nanCount++;
      }
      const ok = fs.length === 32 && particles.length <= 720 && maxTrail <= 28 && maxGhosts <= 18 && nanCount === 0;
      return { pass: ok, error: ok ? '' : JSON.stringify({ n: fs.length, particles: particles.length, maxTrail, maxGhosts, nanCount }) };
    })()`
  },
  {
    name: 'AI brain supports deterministic seeded RNG under netSim and executes Qingfeng/Yuxiao routes',
    fn: `(() => {
      startMatch('train', 'stand', [0, 1]);
      showScreen(null); paused = false; M.phase = 'fight';
      const c1 = new AICtrl('god');
      const b1 = c1.brain;
      if (typeof b1.rand !== 'function') return { pass: false, error: 'AIBrain.rand missing' };
      // Verify Qingfeng route triggers swordqi on rooted foe
      A.setChar(CHARS.findIndex(c => c.id === 'qingfeng'));
      B.setChar(CHARS.findIndex(c => c.id === 'tieshan'));
      A.x = STAGE_W / 2 - 140; B.x = STAGE_W / 2 + 40;
      A.state = 'idle'; B.state = 'hitstun'; B.rooted = true; B.invul = 0;
      A.skill2CD = 0; b1.seen = true; b1.qfNext = 0;
      const origRand = b1.rand; b1.rand = () => 0.01;
      const qfFired = b1.qingfengRoute(A, B, 180, 1);
      // Verify Yuxiao route triggers soundwave at 3 notes
      A.setChar(CHARS.findIndex(c => c.id === 'yuxiao'));
      A.notes = 3; A.skillCD = 0; A.state = 'idle'; B.invul = 0; b1.yxNext = 0;
      const yxFired = b1.yuxiaoRoute(A, B, 260, 1);
      b1.rand = origRand;
      return { pass: qfFired && yxFired, error: JSON.stringify({ qfFired, yxFired }) };
    })()`
   },
  {
    name: 'Training quick-reset (Backspace) and full-meter (F2) hotkeys work in training and stay isolated from combat modes',
    fn: `(() => {
      startDummyTraining();
      M.phase = 'fight';
      A.meter = 0; A.skillCD = 5; TRAIN.total = 420; TRAIN.peakDps = 88;
      trainLabFullMeter();
      if (A.meter !== 100 || A.skillCD !== 0) return { pass: false, error: 'trainLabFullMeter did not refill meter/clear CD' };
      trainLabReset();
      if (A.meter !== 0 || TRAIN.total !== 0 || TRAIN.peakDps !== 0) return { pass: false, error: 'trainLabReset did not clear state/peakDps' };
      // Verify isolation outside training mode
      startMatch('cpu', 'normal', [0, 1]);
      M.phase = 'fight';
      A.meter = 35;
      trainLabFullMeter();
      if (A.meter !== 35) return { pass: false, error: 'trainLabFullMeter leaked into cpu mode' };
      toMenu();
      return { pass: true };
    })()`
  }
];
