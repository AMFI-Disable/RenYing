// 战斗测试第 30 组：空中招式、各模式和电脑难度的对应、观战和暂停、2v2 的各种组队与胜负、AI 打击数据。
// 由 tools/tests/combat-test.mjs 按文件名顺序载入；每项 { name, fn }，fn 是在沙盒里执行的代码字符串，返回 { pass, error }。
// 找 bug 提示：测试失败时报的是 name，在本文件里搜这个 name 就能找到它的代码。
export default [
  {
    name: 'Martial shortcuts use the normal attack and physics paths',
    fn: `(() => {
      startMatch('cpu', 'normal', [20, 35]);
      M.phase = 'fight';
      for (const [key, move] of [['heavyStrike', 'hv'], ['lowKick', 'dl'], ['iaido', 'cs1']]) {
        A.reset(STAGE_W / 2 - 35); B.reset(STAGE_W / 2 + 35);
        A.ctrl.clear();
        A.ctrl.press(key);
        updateFighter(A, B);
        if (A.state !== 'attack' || A.moveName !== move || !A.move) return { pass: false, error: key + ' did not start ' + move };
      }
      A.reset(STAGE_W / 2 - 35); B.reset(STAGE_W / 2 + 35);
      A.ctrl.clear();
      A.ctrl.held.jump = true;
      A.ctrl.press('grapple');
      updateFighter(A, B);
      if (B.state !== 'launched' || B.vy >= -340) return { pass: false, error: 'Jump input did not select rising throw' };
      startMatch('train');
      return { pass: true };
    })()`
  },
  {
    name: 'Objective and survival modes settle lethal hits using their own rules',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      const down = (att, def) => {
        M.phase = 'fight';
        def.reset(def.x);
        def.invul = 0;
        def.hp = 1;
        applyHit(att, def, { dmg: 50, kb: [200, -200], stun: 0.3, hs: 0.06 }, [def.x, def.y - 40]);
        return def.hp === 0 && M.phase === 'fight';
      };
      startMelee(8);
      if (!down(A, B)) return fail('A melee knockout ended the fight');
      updateMatch();
      if (M.phase !== 'fight' || M.melee.tickets[1] !== 23) return fail('Melee did not debit one ticket');
      M.melee.tickets[1] = 1;
      if (!down(A, D)) return fail('Melee settled before processing the last ticket');
      updateMatch();
      if (M.phase !== 'ko' || M.koWinner !== 0) return fail('Melee ignored ticket exhaustion');
      endRound();
      if (M.phase !== 'end') return fail('Melee restarted after its objective was met');

      if (typeof MouseEvent === 'function') {
        paused = true;
        $id('againBtn').click();
        if (M.mode !== 'melee' || M.teamSize !== 8 || M.phase !== 'intro' || paused) return fail('Rematch did not restart 8v8 melee');
      }

      startCtf(2);
      if (allFighters().length !== 4 || fighterTeam(D) !== 1) return fail('CTF did not field four fighters');
      if (!down(A, B)) return fail('A flag match ended on a knockout');
      updateMatch();
      if (M.ctf.respawn[B.idx] <= 0 || M.phase !== 'fight') return fail('CTF did not schedule respawn');
      M.ctf.score[0] = M.ctf.target - 1;
      M.ctf.flags[1].carrier = A.idx;
      A.x = M.ctf.flags[0].baseX;
      updateMatch();
      if (M.phase !== 'ko' || M.koWinner !== 0) return fail('CTF ignored the winning capture');

      startCtf(2);
      M.phase = 'fight'; M.timer = STEP / 2;
      updateMatch();
      if (M.phase !== 'ko' || M.koWinner !== -1) return fail('An even flag score awarded a victory on timeout');
      startGauntlet();
      if (!down(A, B)) return fail('Gauntlet ended on the enemy knockout');
      updateMatch();
      M.gauntlet.nextT = STEP / 2;
      updateMatch();
      if (M.gauntlet.wave !== 2 || B.hp <= 0) return fail('Gauntlet did not advance to the next wave');
      if (!down(B, A)) return fail('Gauntlet settled before recording the defeat');
      updateMatch();
      if (M.phase !== 'ko' || M.koWinner !== 1) return fail('Gauntlet ignored player defeat');

      startRaidMatch([0, 2, 3], 3);
      if (!down(B, A)) return fail('Raid first knockout: ' + JSON.stringify({hp: A.hp, phase: M.phase}));
      if (!down(B, C)) return fail('Raid second knockout: ' + JSON.stringify({hp: C.hp, phase: M.phase, ally: D.hp}));
      D.invul = 0; D.hp = 1;
      applyHit(B, D, { dmg: 50, kb: [200, -200], stun: 0.3, hs: 0.06 }, [D.x, D.y - 40]);
      if (M.phase !== 'ko' || M.koWinner !== 1) return fail('Raid did not settle the final team knockout');
      startMatch('train');
      return { pass: true };
    })()`
  },
  {
    name: 'Air attacks (a1, a2) execution for all characters',
    fn: `(() => {
      for (let ci = 0; ci < CHARS.length; ci++) {
        setChars(ci, (ci + 1) % CHARS.length);
        toNeutral(A);
        A.y = -80;
        A.vy = -5;
        startAttack(A, 'a1');
        if (A.state !== 'attack' || A.moveName !== 'a1') {
          return { pass: false, error: CHARS[ci].name + ' failed aerial attack a1' };
        }
        toNeutral(A);
        A.y = -80;
        startAttack(A, 'a2');
        if (A.state !== 'attack' || A.moveName !== 'a2') {
          return { pass: false, error: CHARS[ci].name + ' failed aerial dive a2' };
        }
      }
      toNeutral(A);
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Supported 5 game modes correspond to appropriate AI levels and configs',
    fn: `(() => {
      // 1. 1v1 CPU
      startMatch('cpu', 'god', [0, 1], true);
      if (M.mode !== 'cpu' || !M.watchAi || B.ctrl.level !== 'god' || STAGE_W !== 1800) {
        return { pass: false, error: '1v1 CPU watch mode setup mismatch' };
      }

      // 2. Chaos Mode
      startChaos(0, 1, 'god', true);
      if (M.mode !== 'chaos' || !M.watchAi || M.level !== 'god') {
        return { pass: false, error: 'Chaos mode watch setup failed' };
      }

      // 3. Tag3 Mode (3v3 relay)
      startTag3Match([0, 1, 2], [3, 4, 5], 'god', true);
      if (M.mode !== 'tag3' || !M.watchAi || (M.teams[0] || []).length !== 3) {
        return { pass: false, error: 'Tag3 mode 3-hero squad watch setup failed' };
      }

      // 3b. 人机 1v1：每回合双方满血
      startMatch('cpu', 'normal', [0, 2]);
      A.hp = 50; B.hp = 0; M.koWinner = 0; endRound();
      if (A.hp !== A.maxHp || B.hp !== B.maxHp || A.chIdx !== 0 || B.chIdx !== 2) {
        return { pass: false, error: 'CPU 1v1 should restore full HP each round: ' + [A.hp, A.maxHp, B.hp, B.maxHp].join('/') };
      }

      // 3c. 联机三人车轮接力：输一回合的一方换下一名侠客满血上，赢的人带血 +CARRY_HEAL，三人都倒才算输
      startMatch('cpu', 'god', [[0, 1, 4], [2, 3, 5]], true); M.mode = 'net';
      if (!M.duo || A.chIdx !== 0 || B.chIdx !== 2) {
        return { pass: false, error: 'Duo match should start with the first picks' };
      }
      A.hp = 50; B.hp = 0; M.koWinner = 0; endRound();
      if (B.chIdx !== 3 || B.hp !== B.maxHp || A.chIdx !== 0 || A.hp !== Math.min(A.maxHp, 50 + CARRY_HEAL)) {
        return { pass: false, error: 'Duo relay 1 mismatch: ' + [A.chIdx, A.hp, B.chIdx, B.hp, B.maxHp].join('/') };
      }
      A.hp = 0; B.hp = 30; M.koWinner = 1; endRound();
      if (A.chIdx !== 1 || A.hp !== A.maxHp || B.chIdx !== 3 || B.hp !== Math.min(B.maxHp, 30 + CARRY_HEAL) || M.phase === 'end') {
        return { pass: false, error: 'Duo relay 2 mismatch: ' + [A.chIdx, A.hp, B.chIdx, B.hp, M.phase].join('/') };
      }
      A.hp = 0; B.hp = 40; M.koWinner = 1; endRound();
      if (A.chIdx !== 4 || A.hp !== A.maxHp || B.chIdx !== 3 || B.hp !== Math.min(B.maxHp, 40 + CARRY_HEAL) || M.phase === 'end') {
        return { pass: false, error: 'Duo relay 3 mismatch: ' + [A.chIdx, A.hp, B.chIdx, B.hp, M.phase].join('/') };
      }
      A.hp = 0; B.hp = 20; M.koWinner = 1; endRound();
      if (M.phase !== 'end' || M.wins[1] !== 3) {
        return { pass: false, error: 'Duo 3v3 tag match should end after 3 wins: ' + [M.phase, M.wins].join('/') };
      }
      M.mode = 'cpu';

      // 4. Mayhem Mode (10x meter / instant cooldowns)
      startMayhem(0, 1, 'god', true);
      if (M.mode !== 'mayhem' || !M.watchAi || A.meter !== 100 || B.meter !== 100) {
        return { pass: false, error: 'Mayhem mode 100% meter watch setup failed' };
      }

      // 5. 2v2 Watch Mode (4 TianDao God bots, 2600 stage)
      startWatch2v2([0, 1, 2, 3, 4, 5]);
      if (M.mode !== 'watch2v2' || !M.watchAi || STAGE_W !== 2600 || !A.ctrl || !B.ctrl || !C.ctrl || !D.ctrl) {
        return { pass: false, error: 'Watch2v2 mode 4-bot TianDao setup failed' };
      }

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '1v1 Watch Mode transitions onto authentic Ban & Pick (#bp) screen',
    fn: `(() => {
      bpStart('cpuWatch');
      if (bpMode !== 'cpuWatch' || !BP || BP.step !== 0) {
        return { pass: false, error: 'bpStart(cpuWatch) failed to initialize BP state' };
      }
      if (!isAiVsAi()) {
        return { pass: false, error: 'isAiVsAi() should be true during cpuWatch BP' };
      }
      // Simulate 4 steps of AI drafting
      for (let s = 0; s < 4; s++) {
        const choice = bpCpuChoice();
        if (choice < 0 || choice >= CHARS.length) {
          return { pass: false, error: 'bpCpuChoice() returned invalid hero idx: ' + choice };
        }
        bpApply(choice);
      }
      if (BP.step !== 4 || BP.bans[0] < 0 || BP.bans[1] < 0 || BP.picks[0] < 0 || BP.picks[1] < 0) {
        return { pass: false, error: 'cpuWatch BP failed to complete 4-step draft' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Background setting pauses player matches by default and leaves AI watch unchanged',
    fn: `(() => {
      if (SETTINGS.aiTraining !== true) return { pass: false, error: 'anonymous AI match contribution must default to on' };
      startMatch('cpu', 'normal', [0, 1], false); paused = false; M.phase = 'fight';
      SETTINGS.backgroundPlay = false;
      if (!shouldPauseOnBlur()) return { pass: false, error: 'default should pause player matches' };
      SETTINGS.backgroundPlay = true; saveSettings();
      if (shouldPauseOnBlur() || JSON.parse(localStorage.getItem('renying-settings')).backgroundPlay !== true) return { pass: false, error: 'continue setting did not persist or prevent pause' };
      const find = document.querySelector; document.querySelector = () => null;
      const enabled = backgroundLocalActive(); paused = true; const manuallyPaused = backgroundLocalActive(); paused = false;
      SETTINGS.backgroundPlay = false; const disabled = backgroundLocalActive();
      document.querySelector = find;
      if (!enabled || manuallyPaused || disabled) return { pass: false, error: 'background simulation eligibility is wrong' };
      startMatch('cpu', 'god', [0, 1], true); paused = false; M.phase = 'fight';
      SETTINGS.backgroundPlay = false;
      if (!isAiVsAi() || shouldPauseOnBlur()) return { pass: false, error: 'AI watch must continue with setting off' };
      SETTINGS.backgroundPlay = true;
      if (shouldPauseOnBlur()) return { pass: false, error: 'AI watch must continue with setting on' };
      SETTINGS.backgroundPlay = false; saveSettings(); toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'isAiVsAi() prevents window blur pausing in all watch modes',
    fn: `(() => {
      // Normal 1v1 PvC should pause on blur
      startMatch('cpu', 'normal', [0, 1], false);
      if (isAiVsAi()) return { pass: false, error: 'PvC should not be isAiVsAi' };

      // 1v1 Watch mode should NOT pause
      startMatch('cpu', 'god', [0, 1], true);
      if (!isAiVsAi()) return { pass: false, error: 'cpu watch should be isAiVsAi' };

      // 2v2 Watch mode should NOT pause
      startWatch2v2([0, 1, 2, 3, 4, 5]);
      if (!isAiVsAi()) return { pass: false, error: 'watch2v2 should be isAiVsAi' };

      // Mayhem watch mode should NOT pause
      startMayhem(0, 1, 'god', true);
      if (!isAiVsAi()) return { pass: false, error: 'mayhem watch should be isAiVsAi' };

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 AI evaluates LingDan / Altar Buff site contesting and opponent denial',
    fn: `(() => {
      startWatch2v2([0, 1, 2, 3, 4, 5]);
      M.phase = 'fight';
      const cx = STAGE_W / 2;

      // Scenario 1: Active LingDan relic with wounded fighter -> AI seeks LingDan
      ARENA2V2.orb.active = true;
      ARENA2V2.orb.kind = 1; // 太阴灵丹
      A.hp = 120;
      A.x = cx - 220;
      A.face = 1;
      B.x = cx + 500;
      D.x = cx + 600;
      A.ctrl.brain.queue.length = 0;
      A.ctrl.brain.next = clock - 0.1;
      A.ctrl.think(A, foeOf(A));

      if (A.ctrl.brain.dir !== 1) {
        return { pass: false, error: 'Injured AI failed to navigate towards LingDan relic at altar (dir=' + A.ctrl.brain.dir + ')' };
      }

      // Scenario 2: Opponent approaches altar -> AI positions to contest and block
      ARENA2V2.orb.active = true;
      ARENA2V2.orb.kind = 0;
      A.hp = A.maxHp;
      A.x = cx - 70;
      C.x = cx - 500;
      B.x = cx - 180;
      B.face = 1;
      A.face = -1;
      A.ctrl.brain.queue.length = 0;
      A.ctrl.brain.next = clock - 0.1;
      A.ctrl.think(A, B);

      if (A.ctrl.brain.dir !== -1 && !A.ctrl.brain.queue.length) {
        return { pass: false, error: 'AI failed to intercept or block opponent approaching altar relic' };
      }

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 Co-op: Both fighters on each team act in parallel without freezing',
    fn: `(() => {
      startWatch2v2([0, 1, 2, 3, 4, 5]);
      M.phase = 'fight';
      for (let s = 0; s < 120; s++) {
        step();
      }
      if (A.state === 'held' || B.state === 'held' || C.state === 'held' || D.state === 'held') {
        return { pass: false, error: 'Fighter stuck in held state during 2v2 co-op combat' };
      }
      if (A.hp <= 0 && C.hp <= 0 && B.hp <= 0 && D.hp <= 0) {
        return { pass: false, error: 'All 4 fighters died prematurely' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 Two Players vs Two Players: All circumstances duo initialization & team assignment',
    fn: `(() => {
      // Test distinct duo combinations
      const testDuoPairs = [
        [[0, 2], [1, 3]],
        [[4, 5], [6, 7]],
        [[8, 9], [10, 11]]
      ];
      for (const [duoA, duoB] of testDuoPairs) {
        startWatch2v2([0, 1, duoA[0], duoB[0], duoB[1], duoA[1]]);
        if (M.mode !== 'watch2v2' || STAGE_W !== 2600) {
          return { pass: false, error: 'Failed 2v2 stage initialization for duos' };
        }
        if (A.idx !== 0 || C.idx !== 2 || B.idx !== 1 || D.idx !== 3) {
          return { pass: false, error: 'Fighter index team mismatch in 2v2 duo' };
        }
        if (A.ch.id !== CHARS[duoA[0]].id || C.ch.id !== CHARS[duoA[1]].id) {
          return { pass: false, error: 'Team 0 duo hero mismatch' };
        }
        if (B.ch.id !== CHARS[duoB[0]].id || D.ch.id !== CHARS[duoB[1]].id) {
          return { pass: false, error: 'Team 1 duo hero mismatch' };
        }
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 AI: every fighter is driven by the AI brain and the fight goes on',
    fn: `(() => {
      startWatch2v2([0, 0, 2, 1, 1, 3]);
      for (const f of [A, B, C, D]) if (!(f.ctrl && f.ctrl.brain instanceof AIBrain)) return { pass: false, error: 'fighter without AIBrain' };
      const hp0 = A.hp + B.hp + C.hp + D.hp;
      for (let i = 0; i < 120 * 20; i++) step();
      const hp1 = A.hp + B.hp + C.hp + D.hp;
      toMenu();
      if (!(hp1 < hp0)) return { pass: false, error: 'no damage dealt in 20 s of 2v2' };
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 Elimination: Full match resolution awarding victory to surviving 2-player team',
    fn: `(() => {
      startWatch2v2([0, 0, 2, 1, 1, 3]);
      M.phase = 'fight';
      M.wins = [0, 0];
      // Eliminate both Team 1 fighters
      B.hp = 0; B.state = 'lying';
      D.hp = 0; D.state = 'lying';
      A.hp = 200; C.hp = 250;
      step(); // triggers KO transition
      const enteredKo = (M.phase === 'ko' && M.koWinner === 0);
      if (!enteredKo) return { pass: false, error: 'Failed to transition to KO phase for Team 0 victory: ' + M.phase };
      // Step past KO celebratory delay (2.8s = ~340 steps)
      for (let s = 0; s < 360; s++) {
        step();
      }
      const roundResolved = M.wins[0] >= 1 || M.phase === 'roundEnd' || M.phase === 'intro';
      toMenu();
      return { pass: enteredKo && roundResolved, error: roundResolved ? null : 'Failed to finalize round resolution after KO' };
    })()`
  },
  {
    name: '2v2 Single KO Survival: One fighter dying does not trigger KO when teammate is alive',
    fn: `(() => {
      // Test player 2v2 modes: pp_cc, pp_pp
      for (const mode of ['pp_cc', 'pp_pp']) {
        if (mode === 'pp_cc') start2v2LocalCoop(0, 2, 1, 3, 'normal');
        else start2v2LocalVs(0, 2, 1, 3);

        M.phase = 'fight';
        M.wins = [0, 0];
        // 背水加成每个 fighter 每场只给一次，所以先清掉上一轮模式留下的标记；
        // 另外加成给的是"立刻满怒气"，AI 下一步就可能把怒气放掉，所以要在这之前读。
        M.flags = M.flags || {};
        delete M.flags['buff_' + D.idx];
        D.meter = 0;
        // Team 1: Kill B only, D is still healthy
        B.hp = 0;
        D.hp = 250;
        A.hp = 200;
        C.hp = 200;

        // Simulate combat hit triggering on B
        applyHit(A, B, { dmg: 50, kb: [200, -200], stun: 0.3 }, [B.x, B.y - 40]);
        const buffed = !!M.flags['buff_' + D.idx];
        const meterNow = D.meter;   // step() 之前读：AI 可能马上把怒气用在绝招上
        step();

        // Must remain in fight phase because teammate D is alive
        if (M.phase !== 'fight') {
          toMenu();
          return { pass: false, error: 'Premature KO triggered when teammate was still alive in ' + mode + ': phase=' + M.phase };
        }
        if (!buffed || meterNow !== 100) {
          toMenu();
          return { pass: false, error: 'Surviving teammate did not receive last stand meter buff in ' + mode + ': meter=' + meterNow + ', buff=' + buffed };
        }

        // Now kill the remaining teammate D
        D.hp = 0;
        applyHit(A, D, { dmg: 50, kb: [200, -200], stun: 0.3 }, [D.x, D.y - 40]);
        step();

        if (M.phase !== 'ko' || M.koWinner !== 0) {
          toMenu();
          return { pass: false, error: 'Expected Team 0 KO victory after both Team 1 fighters defeated in ' + mode + ': phase=' + M.phase + ', winner=' + M.koWinner };
        }
        toMenu();
      }
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'AI Brain Model: Frame data & evolved genes validation across all heroes',
    fn: `(() => {
      const brain = typeof window !== 'undefined' ? window.RENYING_AI_BRAIN : null;
      if (!brain || !brain.frames || !brain.genes) {
        return { pass: false, error: 'window.RENYING_AI_BRAIN missing frames or genes' };
      }
      for (const ch of CHARS) {
        if (!brain.frames[ch.id] || !brain.frames[ch.id].l1) {
          return { pass: false, error: 'Missing frame data for hero: ' + ch.id };
        }
        if (!brain.genes[ch.id] || typeof brain.genes[ch.id].aggr !== 'number') {
          return { pass: false, error: 'Missing evolved genes for hero: ' + ch.id };
        }
      }
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 is only P&PvC&C or P&PvP&P: the player + AI teammate mode is gone, 2v2 runs on the 2600 arena',
    fn: `(() => {
      if (typeof start2v2PlayerMatch !== 'undefined') return { pass: false, error: 'player + AI teammate 2v2 (pc_cc) should be removed' };
      for (const sub of ['pp_cc', 'pp_pp']) {
        if (sub === 'pp_cc') start2v2LocalCoop(0, 2, 1, 3, 'normal'); else start2v2LocalVs(0, 2, 1, 3);
        if (STAGE_W !== 2600) return { pass: false, error: 'Expected 2600 stage width in 2v2 ' + sub + ', got: ' + STAGE_W };
        if (A.ctrl !== human[0] || C.ctrl !== human[1]) return { pass: false, error: sub + ': 1P and 2P should control A and C' };
        if (isAiVsAi()) return { pass: false, error: sub + ': isAiVsAi() should be false when players participate' };
        toMenu();
      }
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 P&PvC&C Mode: 1P controls A, 2P controls C, 2 AI opponents on Team 1',
    fn: `(() => {
      start2v2LocalCoop(0, 2, 1, 3, 'normal');
      if (M.mode !== '2v2' || M.subMode !== 'pp_cc') {
        return { pass: false, error: 'P&PvC&C mode state flags mismatch' };
      }
      if (A.ctrl !== human[0] || C.ctrl !== human[1]) {
        return { pass: false, error: '1P and 2P controllers not bound to A and C' };
      }
      if (!(B.ctrl instanceof AICtrl) || !(D.ctrl instanceof AICtrl)) {
        return { pass: false, error: 'Opponents B and D should be AICtrl' };
      }
      if (localTeam() !== 0) {
        return { pass: false, error: 'Both players in P&PvC&C co-op should be on Team 0' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: '2v2 P&PvP&P Mode: 4-Player setup across two teams on 2600 stage',
    fn: `(() => {
      start2v2LocalVs(0, 2, 1, 3);
      if (M.mode !== '2v2' || M.subMode !== 'pp_pp') {
        return { pass: false, error: 'P&PvP&P mode state flags mismatch' };
      }
      if (STAGE_W !== 2600) {
        return { pass: false, error: 'Expected 2600 stage width in 2v2' };
      }
      if (A.ctrl !== human[0] || C.ctrl !== human[1]) {
        return { pass: false, error: '1P and 2P not bound to Team 0 (A & C)' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Home page online count: total / in-match from the server, "unknown" when the server is unreachable',
    fn: `(() => {
      const txt = id => (document.getElementById(id) || {}).textContent || '';
      const keep = { srv: PRES.srv, at: PRES.at, fail: PRES.fail };
      PRES.srv = null; refreshOnline();
      if (!txt('homeOnlineCount').includes('未知') || !txt('netOnlineOverview').includes('未知')) return { pass: false, error: 'no server data should read 未知, got ' + txt('homeOnlineCount') };
      PRES.srv = { online: 7, playing: 2, waiting: 1 }; PRES.at = Date.now(); PRES.fail = 0; refreshOnline();
      if (txt('homeOnlineCount') !== '全服 7 人在线') return { pass: false, error: 'total wrong: ' + txt('homeOnlineCount') };
      if (txt('netOnlineOverview') !== '7 人在线 · 对局中 2 人 · 匹配中 1 人') return { pass: false, error: 'in-match wrong: ' + txt('netOnlineOverview') };
      PRES.fail = 2; refreshOnline();
      if (!txt('homeOnlineCount').includes('未知')) return { pass: false, error: 'two failed reports should read 未知' };
      PRES.fail = 0; PRES.at = Date.now() - 130e3; refreshOnline();
      if (!txt('homeOnlineCount').includes('未知')) return { pass: false, error: 'stale data should read 未知' };
      Object.assign(PRES, keep); refreshOnline();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Ink Ball (cuju): hits move the ball, goals score, health never drops, first to three wins',
    fn: `(() => {
      startCuju(0, 14, 'normal');
      for (let i = 0; i < 700 && M.phase !== 'fight'; i++) step();
      if (M.phase !== 'fight') return { pass: false, error: 'match never reached fight' };
      if (STAGE_W !== CUJU.W) return { pass: false, error: 'cuju stage width ' + STAGE_W };
      const b = M.cuju.ball;
      if (!b || Math.abs(b.x - STAGE_W / 2) > 1) return { pass: false, error: 'ball not at center' };
      // 普攻打中墨球：球朝出招方向飞
      b.x = A.x + 50; b.y = -60; b.vx = 0; b.vy = 0; A.face = 1;
      if (!cujuHit(A, hitbox(A, A.moves.l1.box), A.moves.l1)) return { pass: false, error: 'l1 did not touch the ball' };
      if (!(b.vx > 400) || b.last !== 0) return { pass: false, error: 'ball not sent forward: ' + b.vx };
      if (cujuHit(A, hitbox(A, A.moves.l1.box), A.moves.l1)) return { pass: false, error: 'same swing hit the ball twice' };
      // 挨打不掉血
      applyHit(B, A, { dmg: 5000, kb: [100, 0], stun: 0.3, hs: 0.05 }, [A.x, A.y - 60]);
      for (let i = 0; i < 60; i++) step();
      if (A.hp !== A.maxHp || M.phase !== 'fight') return { pass: false, error: 'health dropped or match ended after a hit' };
      // 把球放进右门：A 一边得分，停顿后重新开球
      b.x = STAGE_W - WALL - 30; b.y = -40; b.vx = 300; b.vy = 0;
      step();
      if (M.cuju.score[0] !== 1 || !(M.cuju.pause > 0)) return { pass: false, error: 'goal not counted: ' + M.cuju.score };
      for (let i = 0; i < 400 && M.cuju.pause > 0; i++) step();
      if (Math.abs(M.cuju.ball.x - STAGE_W / 2) > 40 || Math.abs(A.x - (STAGE_W / 2 - 300)) > 40) return { pass: false, error: 'no kickoff reset' };
      // 横梁上面过去不算进球
      const c = M.cuju.ball; c.x = WALL + CUJU.GD + 60; c.y = -CUJU.GH - 120; c.vx = -500; c.vy = 0;
      for (let i = 0; i < 30; i++) step();
      if (M.cuju.score[1] !== 0) return { pass: false, error: 'ball over the crossbar counted as a goal' };
      // 再进两球：比赛结束，A 赢
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < 400 && M.cuju.pause > 0; i++) step();
        const d = M.cuju.ball; d.x = STAGE_W - WALL - 30; d.y = -40; d.vx = 300; d.vy = 0; step();
      }
      if (M.cuju.score[0] !== 3 || M.phase !== 'ko' || M.koWinner !== 0) return { pass: false, error: 'first to three did not win: ' + M.cuju.score + ' ' + M.phase };
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Ink Ball (cuju): two AI sides finish a match without errors',
    fn: `(() => {
      const random = Math.random, previousSeed = GRNG.s;
      let seed = 1;
      Math.random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
      GRNG.s = 1;
      try {
        startCuju(11, 14, 'hard', { isWatch: true });
        let n = 0;
        while (M.phase !== 'end' && n < 120 * 400) { step(); n++; }
        if (M.phase !== 'end') return { pass: false, error: 'AI match did not finish: ' + M.cuju.score + ' after ' + Math.round(n / 120) + 's' };
        const t = M.cuju.touches;
        if (t[0] + t[1] < 3) return { pass: false, error: 'AI barely touched the ball: ' + t };
        return { pass: true, error: null };
      } finally {
        toMenu();
        Math.random = random;
        GRNG.s = previousSeed;
      }
    })()`
  },
  {
    name: 'Tianshu Bastion (bastion): TP + SOS flare, 6 companions, 24 mats, 8x6 set gear, waystation & siege defense',
    fn: `(() => {
      if (BASTION_MATS.length !== 24 || BASTION_SLOTS.length !== 6 || BASTION_GENRES.length !== 8 || BASTION_COMPANIONS.length !== 6 || BASTION_BUILDINGS.length !== 7 || BASTION_REALMS.length !== 5) {
        return { pass: false, error: 'bastion data table count mismatch' };
      }
      BASTION_PROF = bastionDefaultProfile();
      startBastion(0, 1, 'normal', { space: 'expedition' });
      M.phase = 'fight';
      if (!bastionOn() || !is2v2()) return { pass: false, error: 'bastion mode flags invalid' };

      const p = bastionProfile();
      p.merit += 5000;
      for (const m of BASTION_MATS) p.mats[m.id] = 80;
      for (const s of BASTION_SLOTS) {
        const it = bastionForgeItem(s.id, 'berserker', 1);
        if (!it || !bastionEquipItem(it.id)) return { pass: false, error: 'forge/equip failed at ' + s.id };
      }
      const st = bastionStats();
      if (st.gc.berserker !== 6) return { pass: false, error: '6pc berserker bonus not active' };
      A.hp = Math.round(A.maxHp * 0.4);
      const hitMod = bastionModifyHit(A, B, { dmg: 100, move: 'cs1' });
      if (!(hitMod.dmg > 100) || !(A.hp > Math.round(A.maxHp * 0.4))) return { pass: false, error: 'set combat hook failed' };

      A.x = 400; C.x = 1200;
      if (!bastionTpToAlly()) return { pass: false, error: 'initial ally TP failed' };
      if (Math.abs(A.x - 1200) > 80 || !(A.invul >= 0.8) || !(M.bastion.tpCd > 0)) return { pass: false, error: 'ally TP arrival state invalid' };
      if (bastionTpToAlly()) return { pass: false, error: 'TP succeeded while on cooldown' };
      A.x = 400;
      if (!bastionFireSos() || !bastionTpToAlly()) return { pass: false, error: 'SOS zero-CD TP failed' };

      if (bastionUnlockOrBondCompanion('c_kite')) return { pass: false, error: 'sanctuary gate bypassed' };
      for (let i = 0; i < 6; i++) bastionDonateBuilding('sanctuary', 10);
      if (p.buildings.sanctuary < 4) return { pass: false, error: 'sanctuary did not reach L4' };
      for (const c of BASTION_COMPANIONS) {
        if (!bastionUnlockOrBondCompanion(c.id)) return { pass: false, error: 'companion unlock failed: ' + c.id };
      }
      p.comp.active = 'c_fox';
      bastionInitCompanions();
      if (!bastionCastCompanionSkill()) return { pass: false, error: 'companion active skill failed' };
      if (!bastionFighterDown(A, B) || M.bastion.downed[0] || !(M.bastion.cheatDeathCd > 0)) return { pass: false, error: '6pc berserker cheat-death did not trigger' };
      if (!bastionFighterDown(A, B) || !M.bastion.downed[0]) return { pass: false, error: 'second lethal did not enter downed state' };
      for (let i = 0; i < 600 && M.bastion.downed[0]; i++) bastionTick();
      if (M.bastion.downed[0] || A.hp <= 0) return { pass: false, error: 'c_fox failed to auto-revive A' };

      B.hp = 0; D.hp = 0;
      if (!bastionFighterDown(B, A) || M.bastion.drops.length === 0) return { pass: false, error: 'enemy death drop failed' };
      A.x = B.x; A.y = B.y;
      bastionTick();
      if (!(M.bastion.unbankedSilver > 0)) return { pass: false, error: 'silver loot pickup failed' };
      bastionMatch();
      if (M.bastion.room !== 2) return { pass: false, error: 'room did not advance to 2' };
      M.bastion.room = 3; bastionSpawnSpaceWave();
      if (!bastionWaystationBank() || !(M.bastion.bankedSilver > 0) || M.bastion.unbankedSilver !== 0) return { pass: false, error: 'waystation bank failed' };
      if (!bastionExtract() || M.bastion.space !== 'citadel') return { pass: false, error: 'extract failed' };

      p.mats.m_iron1 = 80;
      if (!bastionTransmuteMat('m_iron1') || !bastionDonateGuild(10) || !bastionUpgradeGuildResearch('tpCd')) {
        return { pass: false, error: 'transmute or guild progression failed' };
      }
      p.buildings.walls = 1;
      if (!bastionSwitchSpace('siege', 1)) return { pass: false, error: 'enter siege failed' };
      for (let i = 0; i < 400; i++) bastionTick();
      B.hp = 0; B.hidden = true; D.hp = 0; D.hidden = true;
      const mBefore = p.merit;
      bastionMatch();
      if (p.merit !== mBefore + 180 || M.bastion.space !== 'citadel') return { pass: false, error: 'siege reward failed' };

      openBastion();
      if (!bastion2dActive() || B2D.enemies.length === 0) return { pass: false, error: 'flat 2D openBastion failed' };
      const e0 = B2D.enemies[0];
      const eHp0 = e0.hp;
      B2D.player.x = e0.x - 45; B2D.player.y = e0.y;
      B2D.player.aim = 0; B2D.player.atkCd = 0;
      b2dPlayerAttack();
      b2dPlayerDash();
      b2dPlayerSkill();
      bastion2dStep(0.05);
      if (!(e0.hp < eHp0)) return { pass: false, error: 'flat 2D player attack did not hit enemy' };
      M.bastion.tpCd = 0; M.bastion.sosCd = 0;
      B2D.player.x = 500; B2D.player.y = 500;
      B2D.ally.x = 2400; B2D.ally.y = 1800;
      if (!bastionTpToAlly() || Math.hypot(B2D.player.x - 2400, B2D.player.y - 1800) > 80) {
        return { pass: false, error: 'flat 2D ally TP failed' };
      }
      if (bastionTpToAlly()) return { pass: false, error: 'flat 2D TP bypassed cooldown' };
      if (!bastionFireSos() || !bastionTpToAlly()) return { pass: false, error: 'flat 2D SOS zero-CD TP failed' };
      const atkBeforeProg = bastionStats().atkMul;
      if (!bastionGainXp(120) || p.level < 2 || M.bastion.pendingCards.length !== 3) {
        return { pass: false, error: 'player level-up card draft failed' };
      }
      if (!bastionPickCard(0) || M.bastion.pendingCards.length !== 0) return { pass: false, error: 'bastionPickCard failed' };
      const eqWep = p.equipped.weapon;
      if (!bastionEnhanceItem(eqWep) || bastionStats().atkMul <= atkBeforeProg) {
        return { pass: false, error: 'bastionEnhanceItem failed' };
      }
      const atkBeforeBoost = bastionStats().atkMul;
      if (!bastionApplyBoost('frenzy') || !(bastionStats().atkMul > atkBeforeBoost)) {
        return { pass: false, error: 'bastionApplyBoost failed' };
      }
      closeBastion();
      if (bastion2dActive()) return { pass: false, error: 'flat 2D closeBastion failed' };

      M.bastion = null;
      bastionSyncHUD();
      toMenu();
      return { pass: true, error: null };
    })()`
  },
];
