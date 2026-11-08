// 战斗测试第 40 组：通用规则：侠客属性和被动、回血、瞄准方向、联机点将、闯关和同袍肉鸽的开局、蓄力斩被挡和破招。
// 由 tools/tests/combat-test.mjs 按文件名顺序载入；每项 { name, fn }，fn 是在沙盒里执行的代码字符串，返回 { pass, error }。
// 找 bug 提示：测试失败时报的是 name，在本文件里搜这个 name 就能找到它的代码。
export default [
  {
    name: 'All heroes runtime maxHp, weight, reach, fly, and passives match hero settings',
    fn: `(() => {
      const expectedHp = {
        qingfeng: 870, feiying: 800, tieshan: 900, lingshuang: 815,
        liuyun: 840, leiming: 885, moyu: 825, yuehua: 780,
        yanling: 750, yuxiao: 775, zuixian: 885, gouchen: 835,
        lingque: 790, liying: 815, cixian: 815, qianji: 830
      };
      for (let ci = 0; ci < CHARS.length; ci++) {
        const ch = CHARS[ci];
        setChars(ci, (ci + 1) % CHARS.length);
        A.reset(200);
        const wantHp = Math.round(expectedHp[ch.id] * ((BAL[ch.id] || {}).hp || 1) * HERO_HP_SCALE);   // 设定气血 × 强度调整 × 全局气血系数
        if (A.maxHp !== wantHp || A.hp !== wantHp) {
          return { pass: false, error: ch.name + ' maxHp mismatch: got ' + A.maxHp + ', expected ' + wantHp };
        }
      }
      if (CHARS[2].stat.weight !== 1.35) return { pass: false, error: 'TieShan weight mismatch' };
      if (CHARS[3].stat.weight !== 1.05) return { pass: false, error: 'LingShuang weight mismatch' };
      if (CHARS[6].stat.weight !== 1.10) return { pass: false, error: 'MoYu weight mismatch' };
      if (CHARS[8].fly !== 1.2) return { pass: false, error: 'YanLing fly duration mismatch' };
      if (CHARS[10].stat.reach !== 0.86) return { pass: false, error: 'ZuiXian reach mismatch' };
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Combat audit coverage and proportional health recovery',
    fn: `(() => {
      const moveNames = ['l1', 'l2', 'l3', 'l4', 'l5', 'hv', 'cs1', 'cs2', 'a1', 'a2', 'dl'];
      for (let ci = 0; ci < CHARS.length; ci++) {
        setChars(ci, (ci + 1) % CHARS.length);
        for (const name of new Set([...moveNames, ...Object.keys(A.moves)])) {
          const m = A.moves[name];
          if (!m || !Number.isFinite(m.dmg) || !Number.isFinite(m.stun) || !Number.isFinite(m.su) || !Number.isFinite(m.ac) || !Number.isFinite(m.rc)) {
            return { pass: false, error: CHARS[ci].name + ' has incomplete attack data for ' + name };
          }
        }
        if (!SKILLS[A.ch.skill] || !SKILLS[A.ch.skill2] || !ULTS[A.ch.ult]) {
          return { pass: false, error: CHARS[ci].name + ' is missing an audited skill or ultimate' };
        }
      }
      if (HERO_HP_SCALE !== 1.35 || CARRY_HEAL !== Math.round(135 * HERO_HP_SCALE) || LAST_STAND_HEAL !== Math.round(125 * HERO_HP_SCALE)) {
        return { pass: false, error: 'HP, tag carry, and last-stand healing must retain their chosen proportions' };
      }
      A.reset(200);
      if (A.regenLeft !== Math.round(135 * HERO_HP_SCALE)) return { pass: false, error: 'Yuehua recovery pool is not scaled to the new HP pool' };
      return { pass: true, error: null };
    })()`,
  },
  {
    name: 'Manual aim default: Attacks, skills, and XuLiZhan (cs1/cs2) aim in player direction away from opponent',
    fn: `(() => {
      if (SETTINGS.aim !== true) return { pass: false, error: 'Expected SETTINGS.aim default to be true (manual aim by A/D)' };
      startMatch('train', 'stand', [0, 1]);
      M.phase = 'fight';
      A.x = 700; B.x = 1000; // Opponent B is to the right (+1)
      const c = A.ctrl;
      c.held.left = false; c.held.right = false; c.held.down = false;
      c.held.aim = -1; // Player aims left (-1), away from opponent B

      // 1. Normal attack aims in player direction (-1)
      toNeutral(A);
      startAttack(A, 'l1');
      if (A.face !== -1) return { pass: false, error: 'Normal attack l1 snapped to opponent instead of manual aim (-1)' };

      // 2. Skill aims in player direction (-1)
      toNeutral(A);
      A.skillCD = 0;
      startSkill(A, B, 1);
      if (A.face !== -1) return { pass: false, error: 'Skill 1 snapped to opponent instead of manual aim (-1)' };

      // 3. XuLiZhan (cs1 & cs2) aims and lunges away from opponent (-1)
      toNeutral(A);
      A.x = 700;
      c.held.atk = true;
      c.atkT = clock - (CHARGE_START + 0.1);
      neutral(A, B);
      A.t = CHARGE_FULL + 0.1;
      A.chargeFull = true;
      c.held.atk = false;
      updateFighter(A, B); // releases cs2
      if (A.moveName !== 'cs2' || A.face !== -1) {
        return { pass: false, error: 'XuLiZhan cs2 failed to keep manual aim (-1): move=' + A.moveName + ', face=' + A.face };
      }
      for (let i = 0; i < 8; i++) updateFighter(A, B);
      if (!(A.vx < -500)) {
        return { pass: false, error: 'XuLiZhan cs2 did not lunge away from opponent (vx=' + A.vx + ')' };
      }
      toNeutral(A);
      c.held.aim = 1;
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Net 1v1 BP chooses 3 heroes per side (BP_ORDERS.trioSnake) and passes duo to rollStart for 3v3 tag relay',
    fn: `(() => {
      const prevRole = NET.role, prevRoomMode = netRoomMode;
      NET.role = 'host';
      netRoomMode = 'normal';
      bpStart('net');
      if (!BP || BP.steps.length !== 8 || BP.picks[0].length !== 3 || BP.picks[1].length !== 3) {
        return { pass: false, error: 'Net 1v1 BP did not initialize 8-step 3-pick draft' };
      }
      // Execute all 8 steps (2 bans + 6 picks)
      const seq = [0, 1, 2, 3, 4, 5, 6, 7];
      for (const ch of seq) bpApply(ch);
      if (BP.step !== 8 || BP.picks[0].join(',') !== '2,5,6' || BP.picks[1].join(',') !== '3,4,7') {
        return { pass: false, error: 'Net 1v1 BP snake picks mismatch: ' + JSON.stringify(BP.picks) };
      }
      currentScreen = 'bp';
      bpFinish();
      if (!M.duo || M.duo[0].join(',') !== '2,5,6' || M.duo[1].join(',') !== '3,4,7') {
        return { pass: false, error: 'bpFinish(net) did not pass 3-hero duo to rollStart: ' + JSON.stringify(M.duo) };
      }
      if (A.chIdx !== 2 || B.chIdx !== 3) {
        return { pass: false, error: 'Initial fighters mismatch: ' + A.chIdx + ' vs ' + B.chIdx };
      }
      // Simulate Round 1 win for Side 0 -> Side 1 relays to 2nd hero (4)
      A.hp = 100; B.hp = 0; M.koWinner = 0; endRound();
      if (B.chIdx !== 4 || A.chIdx !== 2 || M.phase === 'end') {
        return { pass: false, error: 'Net 1v1 failed to relay to 2nd hero after Round 1: B=' + B.chIdx };
      }
      // Simulate Round 2 win for Side 0 -> Side 1 relays to 3rd hero (7)
      A.hp = 80; B.hp = 0; M.koWinner = 0; endRound();
      if (B.chIdx !== 7 || A.chIdx !== 2 || M.phase === 'end') {
        return { pass: false, error: 'Net 1v1 failed to relay to 3rd hero after Round 2: B=' + B.chIdx };
      }
      // Simulate Round 3 win for Side 0 -> Match ends after all 3 heroes defeated
      A.hp = 60; B.hp = 0; M.koWinner = 0; endRound();
      if (M.phase !== 'end' || M.wins[0] !== 3) {
        return { pass: false, error: 'Net 1v1 did not end after defeating all 3 heroes: phase=' + M.phase + ', wins=' + M.wins };
      }
      NET.role = prevRole;
      netRoomMode = prevRoomMode;
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Stage mode (闯关斩妖) starts with both AI companions on the field',
    fn: `(() => {
      let err = null;
      try { startStage(0, 0, false, 0); } catch (e) { err = e.message; }
      if (err) { toMenu(); return { pass: false, error: 'startStage threw: ' + err }; }
      // 开局就带着要跨关记东西的秘卷（存气），而且之前从没开过一趟爬塔/肉鸽
      toMenu(); delete M.scRun; M.towerPerks = ['meter_bank'];
      try { startStage(0, 0, false, 0); } catch (e) { err = e.message; }
      if (err) { toMenu(); return { pass: false, error: 'startStage with 存气 threw: ' + err }; }
      const ok = M.mode === 'raid' && FOREST.on && !C.hidden && !D.hidden && C.chIdx === 2 && D.chIdx === 4
        && C.ctrl instanceof AICtrl && D.ctrl instanceof AICtrl;
      const info = 'mode=' + M.mode + ' forest=' + FOREST.on + ' C=' + C.chIdx + (C.hidden ? '(hidden)' : '') + ' D=' + D.chIdx + (D.hidden ? '(hidden)' : '');
      FOREST.on = false; toMenu();
      return ok ? { pass: true, error: null } : { pass: false, error: 'companions not set up: ' + info };
    })()`
  },
  {
    name: 'Multiplayer Co-op Roguelike (同袍肉鸽 · 众志破魔): hub-tile entry, 6-skill 3-hero Boss (3x HP, 1.25x dmg), shared gains & Ink reward',
    fn: `(() => {
      const homeBtn = document.querySelector('#singleTabs [data-act="rouge"]');   // 模式大厅里的「全服肉鸽」格子
      const modalRouge = document.getElementById('modalRouge');
      if (!homeBtn || !modalRouge) {
        return { pass: false, error: 'hub rouge tile or #modalRouge missing in DOM' };
      }
      openRougeModal();
      if (modalRouge.classList.contains('hidden')) {
        return { pass: false, error: 'openRougeModal() did not open #modalRouge' };
      }
      closeRougeModal();
      startRaidMatch([0, 2, 3], 3);
      if (M.mode !== 'raid' || !isRaid()) {
        return { pass: false, error: 'startRaidMatch did not activate raid mode' };
      }
      if (sideFighters(0).length !== 3 || sideFighters(1).length !== 1 || sideFighters(1)[0] !== B) {
        return { pass: false, error: 'Raid teams should be 3 allies vs 1 Boss B' };
      }
      if (!B.bossHeroes || B.bossHeroes.length !== 3 || new Set(B.bossHeroes).size !== 3) {
        return { pass: false, error: 'Boss B must combine 3 distinct random characters: ' + JSON.stringify(B.bossHeroes) };
      }
      if (!B.bossSkills || B.bossSkills.length !== 6) {
        return { pass: false, error: 'Boss B must have 6 skills from 3 characters: ' + JSON.stringify(B.bossSkills) };
      }
      const baseHp = Math.round(CHARS[B.chIdx].stat.hp * ((BAL[CHARS[B.chIdx].id] || {}).hp || 1) * HERO_HP_SCALE);
      if (B.maxHp !== Math.round(baseHp * 3.0)) {
        return { pass: false, error: 'Boss B should have 3x HP (' + Math.round(baseHp * 3.0) + '), got ' + B.maxHp };
      }
      if (B.bossDmgMul !== 1.25) {
        return { pass: false, error: 'Boss B should have 1.25x damage multiplier, got ' + B.bossDmgMul };
      }
      // Verify shared perks across all 3 squad members (A, C, D)
      if (!scIds(A).length || scIds(A).join(',') !== scIds(C).join(',') || scIds(A).join(',') !== scIds(D).join(',')) {
        return { pass: false, error: 'Allies A, C, D must share M.towerPerks' };
      }
      // Verify shared healing across allies（开局随机送的秘卷可能抽到「断情」：不能回血，这里去掉它，免得测试随机失败）
      M.towerPerks = M.towerPerks.filter(id => id !== 'no_heal');
      A.hp = 100; C.hp = 100; D.hp = 100;
      scHeal(A, 40);
      if (C.hp <= 100 || D.hp <= 100) {
        return { pass: false, error: 'scHeal on A did not share healing with teammates C and D' };
      }
      // Verify Boss victory grants generous Ink reward and announces it
      const inkBefore = PROF.ink || 0;
      B.hp = 0; M.koWinner = 0; endRound();
      const inkAfter = PROF.ink || 0;
      if (inkAfter - inkBefore < 600) {
        return { pass: false, error: 'Boss defeat did not award +600 Ink: before=' + inkBefore + ', after=' + inkAfter };
      }
      const subTxt = document.getElementById('endSub').textContent || '';
      if (!subTxt.includes('600') || !subTxt.includes('墨锭')) {
        return { pass: false, error: 'Victory screen did not announce Ink reward: ' + subTxt };
      }
      // Verify every hero has a dedicated story in HERO_FOREST_STORIES & CHAPTERS, and unified storyWaves -> Raid Boss works
      if (typeof HERO_FOREST_STORIES !== 'object' || CHAPTERS.length !== CHARS.length) {
        return { pass: false, error: 'Expected one CHAPTER per hero (' + CHARS.length + '), got ' + CHAPTERS.length };
      }
      for (const ch of CHARS) {
        const st = HERO_FOREST_STORIES[ch.id];
        if (!st || !st.title || !st.synopsis || !Array.isArray(st.waveDialogues) || st.waveDialogues.length < 4 || !st.bossIntro) {
          return { pass: false, error: 'Missing or incomplete story for hero: ' + ch.id };
        }
      }
      startRaidMatch([0, 2, 3], 3, { chapterIdx: 0, storyWaves: true });
      if (!FOREST.on || !FOREST.raidStory || !isRaid() || !FOREST.storyLine) {
        return { pass: false, error: 'Unified Raid Story Waves did not activate FOREST.on with storyLine in raid mode' };
      }
      // Transition from clearing small monsters to the 6-skill Chimera Boss climax
      stageClear();
      if (FOREST.on || B.hidden || !B.bossSkills || B.bossSkills.length !== 6) {
        return { pass: false, error: 'stageClear() in unified raidStory mode did not transition to 6-skill Chimera Boss' };
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'XuLiZhan (蓄力斩) mechanics: Partial charge (cs1) does not knock down; Blocked max charge (cs2) knocks down with reduced damage and quicker getup',
    fn: `(() => {
      startMatch('train', 'stand', [0, 1]);
      showScreen(null); paused = false; M.phase = 'fight';

      // 1. Partial charge (cs1): Opponent on ground takes damage & hitstun, but does NOT fall down (not launched or knockdown)
      toNeutral(A); toNeutral(B);
      A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
      A.y = 0; A.vy = 0; A.vx = 0; A.invul = 0;
      B.y = 0; B.vy = 0; B.vx = 0; B.invul = 0;
      A.hp = A.maxHp; B.hp = B.maxHp;
      startAttack(A, 'cs1');
      A.t = A.move.su + 0.01;
      tryHit(A, B, A.move);
      if (B.state === 'knockdown' || B.state === 'launched') {
        return { pass: false, error: 'Partial charge cs1 should NOT bring opponent to the ground, but state was ' + B.state };
      }
      if (B.hp >= B.maxHp) {
        return { pass: false, error: 'cs1 failed to deal damage' };
      }

      // 2. Max charge (cs2) unblocked: Deals full damage and brings opponent to the ground with normal getup duration (0.6s)
      toNeutral(A); toNeutral(B);
      A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
      A.y = 0; A.vy = 0; A.vx = 0; A.invul = 0;
      B.y = 0; B.vy = 0; B.vx = 0; B.invul = 0;
      B.hp = B.maxHp;
      startAttack(A, 'cs2');
      A.t = A.move.su + 0.01;
      tryHit(A, B, A.move);
      const unblockedDmg = B.maxHp - B.hp;
      if (B.state !== 'launched' && B.state !== 'knockdown') {
        return { pass: false, error: 'Unblocked cs2 should bring opponent to the ground, but state was ' + B.state };
      }
      if (B.quickGetup) {
        return { pass: false, error: 'Unblocked cs2 should have normal getup speed, not quickGetup' };
      }

      // 3. Max charge (cs2) when blocking: Brings opponent to ground (knockdown), deals less damage than non-blocked, and stands up quicker (0.22s)
      toNeutral(A); toNeutral(B);
      A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
      A.y = 0; A.vy = 0; A.vx = 0; A.invul = 0;
      B.y = 0; B.vy = 0; B.vx = 0; B.invul = 0;
      B.hp = B.maxHp;
      B.ctrl.held.down = true;
      B.state = 'block';
      startAttack(A, 'cs2');
      A.t = A.move.su + 0.01;
      tryHit(A, B, A.move);
      const blockedDmg = B.maxHp - B.hp;

      if (B.state !== 'knockdown') {
        return { pass: false, error: 'Blocked cs2 should bring opponent to the ground (knockdown), got ' + B.state };
      }
      if (blockedDmg >= unblockedDmg * 0.7) {
        return { pass: false, error: 'Blocked cs2 should deal less damage than unblocked: blocked=' + blockedDmg + ' vs unblocked=' + unblockedDmg };
      }
      if (!B.quickGetup || B.knockdownDur > 0.3) {
        return { pass: false, error: 'Blocked cs2 should set quickGetup / shorter knockdown duration: quickGetup=' + B.quickGetup + ', dur=' + B.knockdownDur };
      }

      // Verify that standing up occurs quicker than normal (0.6s)
      B.t = 0.23;
      updateFighter(B, A);
      if (B.state !== 'getup') {
        return { pass: false, error: 'Expected quick getup transition at t=0.23s, but state is ' + B.state };
      }

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Blocked cs2 rule only applies to cs2 itself: a later blockable hit or ult after a cs2 is not turned into a quick knockdown',
    fn: `(() => {
      startMatch('train', 'stand', [0, 1]);
      showScreen(null); paused = false; M.phase = 'fight';
      const setup = () => {
        toNeutral(A); toNeutral(B);
        A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
        A.y = B.y = 0; A.vy = B.vy = A.vx = B.vx = 0; A.invul = B.invul = 0;
        B.hp = B.maxHp; B.guard = B.maxGuard; B.quickGetup = false; delete B.knockdownDur;
        A.moveName = 'cs2';   // 刚放完一记蓄力斩：收招后 moveName 还留着
        B.ctrl.held.down = true; B.state = 'block';
      };
      // 1. 挡得住的暗器：应该是普通格挡
      setup();
      applyHit(A, B, { dmg: 20, kb: [200, 0], stun: 0.3, hs: 0.06, isProj: true }, [B.x, B.y - 60]);
      if (B.state !== 'blockstun' || B.quickGetup) { toMenu(); return { pass: false, error: 'blockable hit after cs2 became ' + B.state + (B.quickGetup ? ' (quickGetup)' : '') }; }
      // 2. 不可挡的大招：应该照常挑飞、打满伤害，而不是按挡住蓄力斩打 45% 再快速起身
      setup();
      const ult = { dmg: 75, kb: [480, -700], stun: 0.6, hs: 0.2, launch: true, unblockable: true, big: true, ult: true, noScale: true };
      applyHit(A, B, ult, [B.x, B.y - 60]);
      const ultDmg = B.maxHp - B.hp;
      if (B.state === 'knockdown' || B.quickGetup) { toMenu(); return { pass: false, error: 'unblockable ult after cs2 was treated as blocked cs2: state=' + B.state + ' dmg=' + ultDmg }; }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Counter hit (破) on a skill wind-up does not depend on the last normal attack being a down attack',
    fn: `(() => {
      startMatch('train', 'stand', [0, 1]);
      showScreen(null); paused = false; M.phase = 'fight';
      const hitSkillStartup = lastMove => {
        toNeutral(A); toNeutral(B);
        A.x = STAGE_W / 2 - 40; B.x = STAGE_W / 2 + 40; A.face = 1; B.face = -1;
        A.y = B.y = 0; A.vy = B.vy = A.vx = B.vx = 0; A.invul = B.invul = 0;
        B.hp = B.maxHp; B.comboHits = 0; B.armorT = 0;
        B.moveName = lastMove; B.state = 'skill'; B.skill = B.ch.skill; B.t = 0.05;   // 技能刚起手
        applyHit(A, B, { dmg: 20, kb: [200, -100], stun: 0.3, hs: 0.06 }, [B.x, B.y - 60]);
        return B.maxHp - B.hp;
      };
      const afterL1 = hitSkillStartup('l1'), afterDl = hitSkillStartup('dl');
      toMenu();
      if (Math.abs(afterL1 - afterDl) > 0.01) return { pass: false, error: 'skill wind-up counter damage differs by last attack: after l1=' + afterL1 + ' after dl=' + afterDl };
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Team terrain is active and replay preserves both new and legacy terrain rules',
    fn: `(() => {
      for (const mode of ['2v2', 'watch2v2', 'tag3']) for (const id of MAP_POOL) {
        M.mode = mode; M.map = id;
        if (mapNow() !== MAPS[id]) return { pass: false, error: mode + ' did not activate ' + id };
      }
      M.mode = 'replay'; M.map = 'ice'; REPLAY.on = true;
      REPLAY.m = { mode: '2v2', kind: 'loc', mapActive: true };
      if (mapNow() !== MAPS.ice) return { pass: false, error: 'new team replay lost its terrain' };
      REPLAY.m.mapActive = false;
      if (mapNow()) return { pass: false, error: 'flat recording gained terrain' };
      delete REPLAY.m.mapActive;
      if (mapNow()) return { pass: false, error: 'legacy team replay gained terrain' };
      REPLAY.m.mode = 'maps';
      if (mapNow() !== MAPS.ice) return { pass: false, error: 'legacy terrain replay lost its map' };
      REPLAY.on = false; toMenu(); return { pass: true, error: null };
    })()`
  },
  {
    name: 'Training simulation runs at integer Hz, pauses, and never slows normal fights',
    fn: `(() => {
      REPLAY.on = false; ROLL.on = false; paused = false; slowmo = 0; hitstop = 0; acc = 0; cine.t = -1; swapFreezeTimer = 0;
      startMatch('train', 'stand', [0, 1]); M.phase = 'fight';
      showScreen(null); DB.open = false; DB.paused = false;
      TRAIN.inspectHz = 1; TRAIN.inspectAcc = 0; TRAIN.inspectPaused = false;
      let before = clock;
      simTick(0.5);
      if (clock !== before) return { pass: false, error: '1 Hz advanced before a full second elapsed' };
      simTick(0.5);
      if (Math.abs((clock - before) - STEP) > 1e-9) return { pass: false, error: '1 Hz did not advance exactly one 1/120-second simulation frame' };
      TRAIN.inspectPaused = true; before = clock;
      simTick(0.5);
      if (clock !== before) return { pass: false, error: 'paused training continued advancing' };
      const stepped = trainInspectStep();
      if (!stepped || Math.abs((clock - before) - STEP) > 1e-9) return { pass: false, error: 'single-step did not advance exactly one simulation frame' };
      TRAIN.inspectPaused = false;
      before = clock;
      if (trainInspectStep() || clock !== before) return { pass: false, error: 'single-step worked while the training clock was running' };
      debugHitbox = true;
      startMatch('cpu', 'normal', [0, 1]); M.phase = 'fight';
      if (debugHitbox || TRAIN.inspectHz !== 120 || TRAIN.inspectPaused) return { pass: false, error: 'starting a fight carried training tools into the match' };
      TRAIN.inspectHz = 1; acc = 0; before = clock;
      simTick(STEP);
      if (Math.abs((clock - before) - STEP) > 1e-9) return { pass: false, error: 'training Hz setting slowed a normal fight' };
      toMenu(); return { pass: true, error: null };
    })()`
  },
  {
    name: 'AI match review identifies strengths, spacing and facing issues from saved match data',
    fn: `(() => {
      const rows = Array.from({ length: 8 }, () => {
        const r = Array(21).fill(0); r[0] = 0.8; r[1] = 0.7; r[8] = 0.1; r[9] = 0.5; r[12] = -1; r[19] = 8; return r;
      });
      rows[3][1] = 0.6;
      const report = matchReviewData({ mode: 'cpu', playerSide: 0, stats: [{ damage: 120, combo: 5, breaks: 1, falls: 0 }, { damage: 80 }], tr: rows, trStart: 120 });
      if (!report || report.strengths.length < 2 || !report.errors.some(x => x.includes('100%')) || report.next.length < 2) {
        return { pass: false, error: 'AI review did not explain measured strengths and actionable spacing/facing errors' };
      }
      const goodMoment = report.moments.find(x => x.text.includes('有利交换'));
      const spacingMoment = report.moments.find(x => x.text.includes('远距离出手'));
      if (!goodMoment || goodMoment.frame !== 138 || !spacingMoment || spacingMoment.frame !== 120) {
        return { pass: false, error: 'AI review moments did not retain evidence frame timestamps' };
      }
      const flowRows = Array.from({ length: 4 }, () => {
        const r = Array(27).fill(0); r[0] = 0.8; r[1] = 0.8; r[8] = 0.25; r[9] = 0.3; r[19] = 0; r[20] = 8; r[21] = 'hitstun'; r[24] = 'attack'; return r;
      });
      flowRows[1][21] = 'air'; flowRows[1][23] = 1;
      flowRows[2][21] = 'block';
      flowRows[3][21] = 'idle'; flowRows[3][24] = 'hitstun'; flowRows[3][17] = 0.5;
      const flow = matchReviewData({ mode: 'cpu', playerSide: 0, ch: [0, 1], stats: [{ damage: 50 }, { damage: 30 }], tr: flowRows, trStart: 60 });
      if (!flow || !flow.moments.some(x => x.text.includes('脱身时机')) || !flow.moments.some(x => x.text.includes('防守成功')) || !flow.moments.some(x => x.text.includes('追击窗口')) || flow.context.heroId !== 'qingfeng') {
        return { pass: false, error: 'AI review missed escape, safe block, follow-up or hero context evidence' };
      }
      const team = matchReviewData({ mode: 'net', four: true, sub: 'pp_cc', playerSide: 1, stats: [{ damage: 100 }, { damage: 90 }, { damage: 40 }, { damage: 20 }] });
      if (!team || !team.team || team.dealt !== 140 || team.taken !== 110) return { pass: false, error: 'AI review did not aggregate team performance correctly' };
      for (const mode of ['maps', 'tag3', 'chaos', 'mayhem', 'tower', 'saga', 'raid']) {
        if (!matchReviewData({ mode, stats: [{ damage: 20 }, { damage: 10 }] })) return { pass: false, error: 'AI review does not support ' + mode + ' match recaps' };
      }
      const variant = replayModeTag({ mode: '2v2', sub: 'pp_cc', st0: { M: { teamMutator: 'chaos' } } });
      if (!variant.includes('双人共斗') || !variant.includes('天机乱斗')) return { pass: false, error: 'replay list does not label the 2v2 variant and mutator' };
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Replay rate controls advance exact 120 Hz simulation frames and support single stepping',
    fn: `(() => {
      REPLAY.on = false; ROLL.on = false; paused = false; slowmo = 0; hitstop = 0; acc = 0; cine.t = -1; swapFreezeTimer = 0;
      startMatch('cpu', 'normal', [0, 1]); M.phase = 'fight'; showScreen(null);
      M.mode = 'replay'; Object.assign(REPLAY, { on: true, paused: false, kind: 'loc', ev: [], m: {}, f: 0, p: 0, nf: 0, frameAcc: 0, hz: 1, speed: 1 });
      let before = clock;
      replayTick(0.5);
      if (REPLAY.f !== 0 || clock !== before) return { pass: false, error: '1 Hz replay advanced before one second elapsed' };
      replayTick(0.5);
      if (REPLAY.f !== 1 || Math.abs((clock - before) - STEP) > 1e-9) return { pass: false, error: '1 Hz replay did not advance exactly one simulation frame per second' };
      REPLAY.paused = true; before = clock;
      if (!replayStep() || Math.abs((clock - before) - STEP) > 1e-9) return { pass: false, error: 'paused replay did not step exactly one simulation frame' };
      REPLAY.on = false; toMenu(); return { pass: true, error: null };
    })()`
  },
];
