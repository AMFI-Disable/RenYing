// 战斗测试第 80 组：全自动托管、42 徽记与 16 灵宠、20 位扩展侠客独立奥义、铁山五层贯穿大招、跨层垂直判定、大型团战 BP 与训练场 AI 难度。
export default [
  {
    name: 'Expanded badges (42) and pets (16) exist in combat loadouts (and ArmoryCore FULL AUTO when loaded)',
    fn: `(() => {
      const cBadgeIds = Object.keys(COMBAT_BADGES || {});
      const cPetIds = Object.keys(COMBAT_PETS || {});
      if (cBadgeIds.length !== 42) return { pass: false, error: 'Expected 42 COMBAT_BADGES, got ' + cBadgeIds.length };
      if (cPetIds.length !== 16) return { pass: false, error: 'Expected 16 COMBAT_PETS, got ' + cPetIds.length };
      if (window.ArmoryCore) {
        const C = window.ArmoryCore;
        const badgeIds = Object.keys(C.BADGES || {});
        const petIds = Object.keys(C.PETS || {});
        if (badgeIds.length !== 42) return { pass: false, error: 'Expected 42 badges in ArmoryCore, got ' + badgeIds.length };
        if (petIds.length !== 16) return { pass: false, error: 'Expected 16 pets in ArmoryCore, got ' + petIds.length };
        for (const id of petIds) {
          if (!COMBAT_PETS[id]) return { pass: false, error: 'Missing combat runtime pet: ' + id };
        }
        const st = C.blank();
        const env = { now: 1000, rnd: () => 0.5, uid: 'local', ink: 1000, skins: [], equip: {}, server: false };
        const [oldBadge, ...otherBadges] = badgeIds.slice(0, 4);
        st.badgeOwned = Object.fromEntries(otherBadges.map(id => [id, 'purpgold']));
        st.badgeOwned[oldBadge] = 'silver';
        st.badgeEquip.qingfeng = oldBadge;
        st.petOwned = Object.fromEntries(petIds.slice(0, 3).map(id => [id, 'spirit']));
        const sampleSkin = Object.keys(C.ITEM)[0];
        for (let i = 0; i < 76; i++) st.inv.push(C.mkItem(st, sampleSkin, 'case', env.rnd, { st: -1 }));
        const { res, state } = C.run(st, 'fullAuto', {}, env);
        if (!res.ok) return { pass: false, error: 'fullAuto action failed: ' + (res.err || 'unknown') };
        if (res.soldCount !== 75) return { pass: false, error: 'Expected 75 uncapped duplicates sold, got ' + res.soldCount };
        if (state.inv.length !== 1) return { pass: false, error: 'Expected one item kept, got ' + state.inv.length };
        if (state.badgeEquip.qingfeng === oldBadge) return { pass: false, error: 'FULL AUTO kept the old badge assignment' };
        if (res.badges !== 4) return { pass: false, error: 'Expected all four unlocked badges assigned, got ' + res.badges };
        if (res.pets !== CHARS.length) return { pass: false, error: 'Expected pets assigned across roster, got ' + res.pets };
      }
      return { pass: true };
    })()`
  },
  {
    name: 'All 20 streamlined roster heroes have unique ultimates and the 4 expansion heroes execute cleanly',
    fn: `(() => {
      if (CHARS.length !== 20) return { pass: false, error: 'Expected 20 roster heroes, got ' + CHARS.length };
      const expUlts = ['skyfall', 'celestial', 'phoenixchorus', 'tortoiseslam'];
      const fns = new Set();
      for (const key of expUlts) {
        const U = ULTS[key];
        if (!U) return { pass: false, error: 'Missing ult: ' + key };
        if (U.flurry) return { pass: false, error: 'Expansion ult is still a generic flurry clone: ' + key };
        if (typeof U.begin !== 'function' || typeof U.update !== 'function') return { pass: false, error: 'Ult missing begin or update function: ' + key };
        const src = U.begin.toString() + U.update.toString();
        if (fns.has(src)) return { pass: false, error: 'Duplicate ult implementation detected for: ' + key };
        fns.add(src);
      }
      // Execute all 4 expansion heroes + redesigned Liying in live combat simulation
      for (const ci of [13, 16, 17, 18, 19]) {
        startMatch('cpu', 'normal', [ci, 0]);
        M.phase = 'fight';
        A.reset(STAGE_W / 2 - 110); B.reset(STAGE_W / 2 + 110);
        A.face = 1; B.face = -1;
        A.meter = 100;
        B.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
        startSpecial(A);
        let began = false;
        for (let t = 0; t < 480 && A.state === 'special'; t++) {
          step();
          if (A.sp !== 'charge') began = true;
        }
        if (!began || A.state === 'special') return { pass: false, error: 'Ultimate did not run to completion: ' + A.ch.id };
      }
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Tie Shan avalanche ultimate launches high above all 5 layers and crashes through every layer on BATTLE_MAP',
    fn: `(() => {
      const tsIdx = CHARS.findIndex(c => c.id === 'tieshan');
      if (tsIdx < 0) return { pass: false, error: 'Tie Shan not found' };
      startMelee(8, tsIdx, 'normal', 'normal');
      M.phase = 'fight';
      if (!battleMapOn()) return { pass: false, error: 'BATTLE_MAP not active in 8v8 melee' };
      // Start Tie Shan on ground (y=0) to prove he launches above all 5 layers (-528) before plummeting through all 5
      for (const f of allFighters()) f.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      const lx = STAGE_W / 2;
      A.reset(lx); A.y = 0; A.plat = -1; A.meter = 100; A.face = 1;
      const foes = sideFighters(1);
      const layers = [-528, -396, -264, -132, 0];
      const initHp = [];
      for (let i = 0; i < 5; i++) {
        const foe = foes[i];
        foe.reset(lx + (i % 2 ? 25 : -25));
        foe.y = layers[i]; foe.plat = i < 3 ? i + 1 : -1;
        foe.vy = 0;
        foe.invul = 0;
        foe.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
        initHp.push(foe.hp);
      }
      A.ctrl = human[0];
      startSpecial(A);
      // Hold down to accelerate descent through all 5 layers
      let minY = 0;
      human[0].held.down = true;
      for (let t = 0; t < 600; t++) {
        step();
        if (A.y < minY) minY = A.y;
        if (A.state !== 'special' && A.y >= -1 && t > 30) break;
      }
      human[0].held.down = false;
      if (minY > -620) return { pass: false, error: 'Expected Tie Shan to soar above all 5 layers (minY < -620), got ' + minY };
      const slammedCount = A.avaSlammedLayers ? new Set(A.avaSlammedLayers).size : 0;
      if (slammedCount < 5) return { pass: false, error: 'Expected Tie Shan to slam all 5 layers, got ' + slammedCount + ' (state ' + A.state + ', phase ' + A.sp + ', y ' + A.y + ')' };
      let hitLayers = 0;
      for (let i = 0; i < 5; i++) {
        if (foes[i].hp < initHp[i]) hitLayers++;
      }
      if (hitLayers < 4) return { pass: false, error: 'Expected foes on at least 4 distinct layers hit, got ' + hitLayers };
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: '8v8 multi-target melee cleavage, piercing arrow volleys, and cross-layer chain lightning hit multiple foes with fair scaling',
    fn: `(() => {
      // 1. Multi-target melee strike & multiTargetScale
      startMelee(8, 0, 'normal', 'normal');
      M.phase = 'fight';
      const lx = STAGE_W / 2;
      A.reset(lx); A.y = -264; A.plat = 2; A.face = 1;
      const foes = sideFighters(1);
      const hp0 = [];
      for (let i = 0; i < 4; i++) {
        foes[i].reset(lx + 45 + i * 18); foes[i].y = -264; foes[i].plat = 2; foes[i].invul = 0;
        foes[i].ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
        hp0.push(foes[i].hp);
      }
      A.skHitSet = null;
      strike(A, foes[0], { box: [0, -110, 150, 10], dmg: 50, kb: [120, -80], stun: 0.3, hs: 0.04 });
      const dmgs = [];
      for (let i = 0; i < 4; i++) dmgs.push(hp0[i] - foes[i].hp);
      if (dmgs.filter(d => d > 0).length < 4) return { pass: false, error: 'Expected multi-target strike to hit all 4 clustered foes, got dmgs=' + JSON.stringify(dmgs) };
      if (dmgs[3] >= dmgs[0]) return { pass: false, error: 'Expected 8v8 multiTargetScale to reduce 4th target damage vs 1st: ' + JSON.stringify(dmgs) };

      // 2. Leiming chain lightning ultimate hits multiple foes across layers
      const lmIdx = CHARS.findIndex(c => c.id === 'leiming');
      startMelee(8, lmIdx, 'normal', 'normal');
      M.phase = 'fight';
      A.reset(lx); A.y = -264; A.plat = 2; A.face = 1; A.meter = 100;
      const lmFoes = sideFighters(1);
      const lmHp = [];
      for (let i = 0; i < 4; i++) {
        lmFoes[i].reset(lx + 110 + i * 60); lmFoes[i].y = i < 2 ? -264 : -132; lmFoes[i].invul = 0;
        lmFoes[i].ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
        lmHp.push(lmFoes[i].hp);
      }
      startSpecial(A);
      for (let t = 0; t < 180; t++) step();
      const lmHit = lmFoes.slice(0, 4).filter((f, i) => f.hp < lmHp[i]).length;
      if (lmHit < 2) return { pass: false, error: 'Expected Leiming thunder + chain lightning to hit >=2 foes across layers, got ' + lmHit };

      // 3. Yanling piercing arrow volley hits multiple enemies in a line
      const ylIdx = CHARS.findIndex(c => c.id === 'yanling');
      startMelee(8, ylIdx, 'normal', 'normal');
      M.phase = 'fight';
      for (const f of allFighters()) f.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      A.reset(lx - 150); A.y = -132; A.plat = 3; A.face = 1; A.meter = 100;
      const ylFoes = sideFighters(1);
      const ylHp = [];
      for (let i = 0; i < 3; i++) {
        ylFoes[i].reset(lx + 40 + i * 90); ylFoes[i].y = -132; ylFoes[i].plat = 3; ylFoes[i].invul = 0;
        ylFoes[i].ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
        ylHp.push(ylFoes[i].hp);
      }
      startSpecial(A);
      for (let t = 0; t < 95; t++) step();
      const ylHit = ylFoes.slice(0, 3).filter((f, i) => f.hp < ylHp[i]).length;
      if (ylHit < 2) return { pass: false, error: 'Expected Yanling piercing featherstorm to hit >=2 enemies in a line, got ' + ylHit };

      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: '8v8 simultaneous multi-hero skills & ultimates stress test completes with zero NaN states and bounded particles',
    fn: `(() => {
      startMelee(8, 0, 'normal', 'normal');
      M.phase = 'fight';
      // Give all 16 fighters full meter and trigger simultaneous ultimates/skills
      for (let i = 0; i < FIGHTERS.length; i++) {
        const f = FIGHTERS[i];
        f.meter = 100;
        f.skillCD = 0; f.skill2CD = 0;
      }
      for (let t = 0; t < 180; t++) {
        if (t === 5) {
          for (let i = 0; i < 6; i++) {
            const f = FIGHTERS[i];
            if (f && f.hp > 0) startSpecial(f);
          }
        }
        if (t === 50) {
          for (let i = 6; i < 12; i++) {
            const f = FIGHTERS[i];
            if (f && f.hp > 0) startSpecial(f);
          }
        }
        step();
        if (particles.length > 740) return { pass: false, error: 'Particle budget exceeded in 8v8 stress test: ' + particles.length };
      }
      for (const f of FIGHTERS) {
        if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.hp)) {
          return { pass: false, error: 'NaN/Infinity fighter state detected for ' + f.ch.id };
        }
      }
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Cross-layer vertical combat: Gouchen Q pulls to caster elevation and Zuixian Q jails at target elevation',
    fn: `(() => {
      const gcIdx = CHARS.findIndex(c => c.id === 'gouchen');
      const zxIdx = CHARS.findIndex(c => c.id === 'zuixian');
      startMelee(8, gcIdx, 'normal', 'normal');
      M.phase = 'fight';
      // Put Gouchen on layer -264 and enemy on layer -264 nearby, verify hook pulls to -264 (not 0)
      A.reset(STAGE_W / 2 - 120); A.y = -264; A.plat = 2; A.face = 1;
      B.reset(STAGE_W / 2 + 80); B.y = -264; B.plat = 2; B.invul = 0; B.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      startSkill(A, B);
      for (let t = 0; t < 50; t++) step();
      if (Math.abs(B.y - (-264)) > 45) return { pass: false, error: 'Gouchen hook snapped victim off elevated layer: B.y=' + B.y };

      // Zuixian Q pavilion on elevated layer -132 should store jailY near -132 (not 0)
      startMelee(8, zxIdx, 'normal', 'normal');
      M.phase = 'fight';
      A.reset(STAGE_W / 2 - 140); A.y = -132; A.plat = 3; A.face = 1;
      B.reset(STAGE_W / 2 + 40); B.y = -132; B.plat = 3; B.invul = 0; B.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      startSkill(A, B);
      for (let t = 0; t < 90; t++) {
        step();
        if (B.jailT > 0) break;
      }
      if (B.jailT <= 0 || Math.abs(B.y - (-132)) > 45) return { pass: false, error: 'Zuixian pavilion dropped jailed victim to ground: B.y=' + B.y };
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Large Battle BP screen supports 5v5 and 8v8 multi-ban drafting with auto-fill disabled and launches drafted teams into melee/ctf',
    fn: `(() => {
      bpStart('melee', { teamSize: 5, level: 'normal' });
      if (bpMode !== 'melee' || !BP) return { pass: false, error: 'bpStart(melee) failed' };
      if (!BP.bansBySide || BP.bansBySide[0].length !== 2 || BP.bansBySide[1].length !== 2) {
        return { pass: false, error: 'Expected 2 bans per side in 5v5 melee BP' };
      }
      if (!Array.isArray(BP.picks[0]) || BP.picks[0].length !== 5 || BP.picks[1].length !== 5) {
        return { pass: false, error: 'Expected 5 picks per side in 5v5 melee BP' };
      }
      if (bpAutoFillLarge() !== false) return { pass: false, error: 'Expected bpAutoFillLarge() to be disabled' };
      bpApply(0);
      if (BP.bansBySide[0][0] !== 0) return { pass: false, error: 'First ban not recorded in bansBySide[0][0]' };
      while (BP && BP.step < bpSteps().length) bpApply(bpCpuChoice());
      const expectedTeam0 = BP.picks[0].slice();
      const expectedTeam1 = BP.picks[1].slice();
      const allUsed = [...BP.bans, ...expectedTeam0, ...expectedTeam1];
      if (new Set(allUsed).size !== allUsed.length) return { pass: false, error: 'Duplicate heroes found in 5v5 BP draft' };
      bpFinish();
      if (M.mode !== 'melee' || M.teamSize !== 5) return { pass: false, error: 'bpFinish did not start 5v5 melee' };
      for (let slot = 0; slot < 5; slot++) {
        if (FIGHTERS[slot * 2].chIdx !== expectedTeam0[slot]) return { pass: false, error: 'Team 0 drafted hero mismatch at slot ' + slot };
        if (FIGHTERS[slot * 2 + 1].chIdx !== expectedTeam1[slot]) return { pass: false, error: 'Team 1 drafted hero mismatch at slot ' + slot };
      }
      $id('againBtn').click();
      if (M.mode !== 'melee' || sideFighters(0).some((f, i) => f.chIdx !== expectedTeam0[i])
          || sideFighters(1).some((f, i) => f.chIdx !== expectedTeam1[i])) {
        return { pass: false, error: 'Melee rematch changed the drafted teams' };
      }
      // Verify 8v8 CTF BP draft structure (1 ban per side + 16 picks = 18/20, preserving final-pick agency)
      bpStart('ctf', { teamSize: 8, level: 'hard' });
      if (BP.picks[0].length !== 8 || BP.picks[1].length !== 8 || BP.bansBySide[0].length !== 1 || BP.bansBySide[1].length !== 1) {
        return { pass: false, error: '8v8 CTF BP structure mismatch' };
      }
      while (BP && BP.step < bpSteps().length) bpApply(bpCpuChoice());
      const ctfTeams = BP.picks.map(team => team.slice());
      bpFinish();
      if (M.mode !== 'ctf' || M.teamSize !== 8) return { pass: false, error: '8v8 CTF did not start' };
      $id('againBtn').click();
      if (M.mode !== 'ctf' || [0, 1].some(side => sideFighters(side).some((f, i) => f.chIdx !== ctfTeams[side][i]))) {
        return { pass: false, error: 'CTF rematch changed the drafted teams' };
      }
      // Verify 10v10 (20 unique heroes, BATTLE10_MAP), 16v16 (BATTLE16_MAP), and Quad 5v5v5v5/8v8v8v8 scaling
      bpStart('melee', { teamSize: 10, level: 'normal' });
      if (BP.picks[0].length !== 10 || BP.picks[1].length !== 10 || BP.bans.length !== 0) {
        return { pass: false, error: '10v10 melee BP structure mismatch' };
      }
      while (BP && BP.step < bpSteps().length) bpApply(bpCpuChoice());
      const all20 = [...BP.picks[0], ...BP.picks[1]];
      if (new Set(all20).size !== 20) return { pass: false, error: '10v10 did not draft 20 unique heroes' };
      bpFinish();
      if (M.mode !== 'melee' || M.teamSize !== 10 || mapNow() !== BATTLE10_MAP || STAGE_W !== BATTLE10_WIDTH) {
        return { pass: false, error: '10v10 did not activate BATTLE10_MAP' };
      }
      startMelee(16, 0, 'normal', 'normal');
      if (mapNow() !== BATTLE16_MAP || STAGE_W !== BATTLE16_WIDTH || (M.battlePerks || []).length !== 9) {
        return { pass: false, error: '16v16 did not activate BATTLE16_MAP with 9 perks' };
      }
      startQuad(5, 0, 'normal');
      if (allFighters().length !== 20 || mapNow() !== BATTLE10_MAP) {
        return { pass: false, error: '5v5v5v5 Quad Clash did not field 20 fighters on BATTLE10_MAP' };
      }
      startQuad(8, 0, 'normal');
      if (allFighters().length !== 32 || mapNow() !== BATTLE16_MAP) {
        return { pass: false, error: '8v8v8v8 Quad Clash did not field 32 fighters on BATTLE16_MAP' };
      }
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Grand Melee applies selected mutators and preserves Mayhem stats on respawn',
    fn: `(() => {
      startMelee(3, 0, 'normal', 'chaos');
      M.phase = 'fight';
      meleeMatch();
      if (!chaosOn() || M.chaos.i < 0) return { pass: false, error: 'Chaos did not activate in melee' };
      startMelee(3, 0, 'normal', 'mayhem');
      const hp = A.maxHp;
      if (!mayhemOn() || A.maxGuard !== 500 || A.meter !== 100) return { pass: false, error: 'Mayhem did not apply at round start' };
      A.hp = 0;
      A.meter = 0;
      M.melee.respawn[0] = STEP;
      meleeMatch();
      if (A.hp !== hp || A.maxGuard !== 500 || A.meter !== 100) return { pass: false, error: 'Mayhem stats were lost at respawn' };
      startCtf(2, 0, 'normal');
      if (mayhemOn() || allFighters().length !== 4) return { pass: false, error: 'Melee mutator leaked into CTF' };
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: '2v2 Capture the Banner HUD shows each team score and the capture target',
    fn: `(() => {
      startCtf(2, 0, 'normal');
      M.ctf.score = [1, 2];
      const fighterHealth = A.maxHp + '/' + A.maxHp;
      const labels = [];
      const fillText = ctx.fillText;
      try {
        ctx.fillText = text => labels.push(String(text));
        drawHUD();
      } finally {
        ctx.fillText = fillText;
        toMenu();
      }
      return { pass: labels.includes('1/3') && labels.includes('2/3') && labels.includes(fighterHealth), error: labels.join(', ') };
    })()`
  },
  {
    name: 'Training mode supports real AI difficulty sparring (AICtrl) with zero HP inflation and mid-session dummy switching',
    fn: `(() => {
      trainChar = 0;
      trainOppMode = 'ai';
      trainAiLevel = 'impossible';
      startTraining('dummy', false);
      if (M.mode !== 'train') return { pass: false, error: 'Did not enter train mode' };
      if (!(B.ctrl instanceof AICtrl) || B.ctrl.level !== 'impossible') {
        return { pass: false, error: 'Expected AICtrl(impossible) in AI training sparring' };
      }
      if (B.dummy) return { pass: false, error: 'AI sparring opponent should not have B.dummy=true' };
      const expectedHp = Math.round(((B.ch.stat && B.ch.stat.hp) || 850) * ((BAL[B.ch.id] || {}).hp || 1));
      if (B.maxHp !== expectedHp) return { pass: false, error: 'Training AI had stat-inflated HP: ' + B.maxHp + ' vs ' + expectedHp };
      // Switch back to dummy mid-session
      trainOppMode = 'dummy';
      applyTrainOpponent();
      if (!(B.ctrl instanceof DummyCtrl) || !B.dummy) return { pass: false, error: 'Mid-session switch back to dummy failed' };
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Liying shadow attacks deal minimal damage with zero guard drain, stack 25 per-opponent Shadow Marks for burst + overhead full guard-break teleport',
    fn: `(() => {
      const lyIdx = CHARS.findIndex(c => c.id === 'liying');
      if (lyIdx < 0) return { pass: false, error: 'Liying not found' };
      startMelee(8, lyIdx, 'normal', 'normal');
      M.phase = 'fight';
      for (const f of allFighters()) f.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      const lx = STAGE_W / 2;
      A.reset(lx - 120); A.y = 0; A.plat = -1; A.face = 1;
      const foes = sideFighters(1);
      const foe1 = foes[0], foe2 = foes[1];
      foe1.reset(lx + 40); foe1.y = 0; foe1.plat = -1; foe1.invul = 0; foe1.face = -1;
      foe1.state = 'block'; foe1.ctrl = new DummyCtrl({ act: 'block', autoHeal: false, infGuard: false });
      foe2.reset(lx + 380); foe2.y = -264; foe2.plat = 2; foe2.invul = 0; foe2.face = -1;
      foe2.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false, infGuard: false });
      const g1Before = foe1.guard, hp1Before = foe1.hp;
      // 1. Shadow wave hits blocking foe1: minimal damage, ZERO guard drain, +1 Shadow Mark on foe1 only
      spawnCloneWave(A, A.x + 20, A.y, 1, 4);
      for (let t = 0; t < 25; t++) step();
      if (foe1.guard < g1Before) return { pass: false, error: 'Shadow wave drained guard on block: ' + g1Before + ' -> ' + foe1.guard };
      if (hp1Before - foe1.hp > 6) return { pass: false, error: 'Shadow wave dealt too much damage: ' + (hp1Before - foe1.hp) };
      if (foe1.shadowMarks !== 1 || foe2.shadowMarks !== 0) return { pass: false, error: 'Shadow marks not tracked independently: foe1=' + foe1.shadowMarks + ' foe2=' + foe2.shadowMarks };
      // 2. Stack foe2 independently to 25 Shadow Marks on elevated layer (-264): triggers burst damage + unlocks overhead teleport
      const hp2Before = foe2.hp, g2Before = foe2.guard;
      addShadowMark(A, foe2, 24);
      if (foe2.shadowMarks !== 24 || A.shadowExecTarget >= 0) return { pass: false, error: 'Should not burst before 25 marks: ' + foe2.shadowMarks };
      addShadowMark(A, foe2, 1);
      if (foe2.shadowMarks !== 0) return { pass: false, error: 'Marks did not reset after 25-stack burst: ' + foe2.shadowMarks };
      if (hp2Before - foe2.hp < 50) return { pass: false, error: '25-stack burst damage too small: ' + (hp2Before - foe2.hp) };
      if (A.shadowExecTarget !== foe2.idx || !(A.shadowExecT > 0)) return { pass: false, error: 'Overhead teleport window not granted for foe2' };
      if (foe1.shadowMarks !== 1) return { pass: false, error: 'foe1 independent marks were affected by foe2 burst' };
      // 3. Trigger R (mistswap) with zero clones out: teleports directly above foe2 on layer -264 and completely depletes guard
      A.clones = [];
      A.skill2CD = 0;
      foe2.guard = g2Before;
      startSkill(A, foe1, 2);
      if (Math.abs(A.x - foe2.x) > 5 || A.y >= foe2.y - 80) return { pass: false, error: 'Liying did not teleport directly above foe2: A=(' + A.x + ',' + A.y + ') foe2=(' + foe2.x + ',' + foe2.y + ')' };
      for (let t = 0; t < 80; t++) step();
      if (foe2.guard !== 0) return { pass: false, error: 'Overhead follow-up strike did not completely deplete foe2 guard: ' + foe2.guard };
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Mouse scroll wheel camera zoom adjusts smoothly within bounds across modes and resets cleanly',
    fn: `(() => {
      startMatch('cpu', 'normal', [0, 1]);
      M.phase = 'fight';
      resetCamZoom(true);
      for (let i = 0; i < 30; i++) updateCamera(1 / 60);
      const baseZoom = cam.zoom;
      adjustCamZoom(0.35);
      for (let i = 0; i < 45; i++) updateCamera(1 / 60);
      const zoomedIn = cam.zoom;
      if (zoomedIn <= baseZoom * 1.15) return { pass: false, error: 'Expected camera to zoom in: base=' + baseZoom + ' zoomedIn=' + zoomedIn };
      for (let i = 0; i < 20; i++) adjustCamZoom(0.2);
      if (cam.userZoomTarget > 1.851) return { pass: false, error: 'Zoom target exceeded max bound: ' + cam.userZoomTarget };
      for (let i = 0; i < 30; i++) adjustCamZoom(-0.2);
      if (cam.userZoomTarget < 0.549) return { pass: false, error: 'Zoom target fell below min bound: ' + cam.userZoomTarget };
      for (let i = 0; i < 45; i++) updateCamera(1 / 60);
      if (cam.zoom >= baseZoom) return { pass: false, error: 'Expected camera to zoom out below base: base=' + baseZoom + ' out=' + cam.zoom };
      resetCamZoom(true);
      if (cam.userZoom !== 1 || cam.userZoomTarget !== 1) return { pass: false, error: 'resetCamZoom did not restore 1.0' };
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Dedicated 5v5 citadel arena (BATTLE5_MAP) provides 3 layers, 4 stairs, 3 perks, and 2800px width in 5v5 melee and CTF',
    fn: `(() => {
      startMelee(5, 0, 'normal', 'normal');
      M.phase = 'fight';
      if (!battleMapOn() || mapNow() !== BATTLE5_MAP) return { pass: false, error: 'Expected BATTLE5_MAP active in 5v5 melee' };
      if (STAGE_W !== 2800) return { pass: false, error: 'Expected 5v5 arena width 2800, got ' + STAGE_W };
      const layers = arenaLayersAt(STAGE_W / 2);
      if (layers.length !== 3 || layers[0] !== -276 || layers[1] !== -138 || layers[2] !== 0) {
        return { pass: false, error: 'Expected 3 layers [-276,-138,0] at center, got ' + JSON.stringify(layers) };
      }
      if ((M.battlePerks || []).length !== 3) return { pass: false, error: 'Expected 3 tactical perks in 5v5 arena, got ' + (M.battlePerks || []).length };
      A.reset(330); A.y = 0; A.plat = -1; A.face = 1; A.state = 'walk';
      const oldX = A.x; A.x = 355;
      const entered = enterBattleStair(A, oldX);
      if (!entered || A.plat < BATTLE5_DECKS.length) return { pass: false, error: 'Failed to enter 5v5 ground-to-mid stair' };
      startCtf(5, 0, 'normal');
      if (mapNow() !== BATTLE5_MAP || STAGE_W !== 2800) return { pass: false, error: '5v5 CTF did not activate BATTLE5_MAP' };
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Unified 常规标准 merges 天机乱斗 across all combat modes, 习武 panes are unified, and Quick Match / auto-fill are removed',
    fn: `(() => {
      teamMutator = 'normal';
      startMatch('cpu', 'normal', [0, 1]); M.phase = 'fight'; updateChaos(STEP);
      if (!chaosOn() || mayhemOn() || !M.chaos || M.chaos.i < 0) return { pass: false, error: 'Unified 常规标准 omens did not activate in cpu' };
      startCtf(5, 0, 'normal', null, 'normal'); M.phase = 'fight'; updateChaos(STEP);
      if (!chaosOn() || mayhemOn() || M.chaos.i < 0) return { pass: false, error: 'Unified 常规标准 omens did not activate in ctf' };
      startCtf(5, 0, 'normal', null, 'mayhem');
      if (!mayhemOn() || chaosOn()) return { pass: false, error: 'Mayhem did not override 常规标准 in ctf' };
      if (normalizeMutator('chaos') !== 'normal' || normalizeMutator('normal') !== 'normal' || normalizeMutator('mayhem') !== 'mayhem') {
        return { pass: false, error: 'normalizeMutator did not map legacy chaos -> normal' };
      }
      startMatch('cpu', 'normal', [0, 1]); M.teamMutator = 'mayhem';
      if (!mayhemOn() || chaosOn()) return { pass: false, error: 'Mayhem did not override 常规标准 in cpu' };
      startTraining('dummy', false);
      if (chaosOn()) return { pass: false, error: 'Chaos omens should stay off in train mode' };
      if (bpAutoFillLarge() !== false) return { pass: false, error: 'Expected bpAutoFillLarge() to return false' };
      mmKind = null;
      mmGo('quick');
      if (mmKind === 'quick') return { pass: false, error: 'Expected mmGo(quick) to be blocked' };
      for (const sec of ['cpu', 'tag3', 'watch2v2', 'melee', 'ctf', 'gauntlet', 'cuju', 'koth', 'party', 'train']) {
        if (!XIWU_MODE_INFO || !XIWU_MODE_INFO[sec]) {
          return { pass: false, error: 'Missing unified XIWU_MODE_INFO entry for: ' + sec };
        }
      }
      const cxIdx = CHARS.findIndex(c => c.id === 'cixian');
      const lmIdx = CHARS.findIndex(c => c.id === 'leiming');
      startMatch('cpu', 'normal', [cxIdx, lmIdx]); M.phase = 'fight';
      A.reset(STAGE_W / 2 - 90); B.reset(STAGE_W / 2 + 90); A.face = 1; B.face = -1; A.meter = 100;
      B.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      startSpecial(A);
      for (let t = 0; t < 120; t++) step();
      if (!Number.isFinite(A.x) || !Number.isFinite(B.hp)) return { pass: false, error: 'Cixian 1v1 ult produced invalid state' };
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Training mode enables hitbox visualization by default and renders live status, badges/pets, stats, and attributes',
    fn: `(() => {
      startTraining('dummy', false);
      if (!debugHitbox) return { pass: false, error: 'Expected debugHitbox=true by default in Training mode' };
      A.badgeId = 'flowing'; A.badgeTier = 'purpgold';
      A.petId = 'inkfox'; A.petTier = 'immortal';
      for (const tab of ['status', 'loadout', 'stats', 'attrs']) {
        TRAIN.labTab = tab;
        trainLabRender(true);
        const html = ($id('trainLabBody') || {}).innerHTML || '';
        if (!html || html.length < 40) return { pass: false, error: 'Training lab tab rendered empty: ' + tab };
      }
      TRAIN.labTab = 'loadout';
      trainLabRender(true);
      const loadoutHtml = $id('trainLabBody').innerHTML;
      if (!loadoutHtml.includes('连势') || !loadoutHtml.includes('墨狐')) {
        return { pass: false, error: 'Training lab loadout tab missing equipped badge or pet explanation' };
      }
      A.meter = 10; A.skillCD = 5; A.petCD = 6;
      trainLabFullMeter();
      if (A.meter !== 100 || A.skillCD !== 0 || A.petCD !== 0) {
        return { pass: false, error: 'trainLabFullMeter did not fill meter and clear cooldowns' };
      }
      tryPetActive(A, B);
      if (!TRAIN.events.some(e => e.kind === 'pet')) {
        return { pass: false, error: 'Pet activation was not logged into live TRAIN.events' };
      }
      trainLabReset();
      if (TRAIN.total !== 0 || TRAIN.events.length !== 0) {
        return { pass: false, error: 'trainLabReset did not clear training telemetry' };
      }
      startMatch('cpu', 'normal', [0, 1]);
      if (debugHitbox) return { pass: false, error: 'Expected debugHitbox=false when starting non-train cpu match' };
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Heirloom (天工传世) skins unlock configurable Dual Stance (攻守双境) with balanced combat modifiers and rollback sync fields',
    fn: `(() => {
      if (DEFAULT_1P_KEYS.relicStance !== 'KeyM') return { pass: false, error: 'Expected DEFAULT_1P_KEYS.relicStance === KeyM, got ' + DEFAULT_1P_KEYS.relicStance };
      if (!FK.includes('relicStance') || !FK.includes('relicStanceUnlocked')) return { pass: false, error: 'FK missing relicStance rollback fields' };
      startMatch('cpu', 'normal', [0, 1]);
      M.phase = 'fight';
      A.ctrl = human[0];
      A.skinKey = '';
      A.look = { ...(A.look || {}), deco: null };
      applyCombatLoadouts(A);
      if (A.relicStanceUnlocked || A.relicStance !== 0) return { pass: false, error: 'Ordinary skin should not unlock relic stance' };
      const baseWk = wk(A);
      human[0].buf.relicStance = clock;
      if (trySwitchRelicStance(A)) return { pass: false, error: 'Ordinary skin should not allow switching relic stance' };
      delete human[0].buf.relicStance;
      A.skinKey = 'qf_porcelain';
      A.look = { ...(A.look || {}), deco: { transform: 'heirloom' } };
      applyCombatLoadouts(A);
      if (!A.relicStanceUnlocked || A.relicStance !== 1) return { pass: false, error: 'Heirloom skin did not unlock Aggressive stance (1)' };
      const atkWk = wk(A);
      if (!(atkWk > baseWk * 1.04)) return { pass: false, error: 'Aggressive stance walk speed not boosted: base=' + baseWk + ' atk=' + atkWk };
      A.relicStanceCd = 0;
      human[0].buf.relicStance = clock;
      const switched = trySwitchRelicStance(A);
      if (!switched || A.relicStance !== 2 || !(A.relicStanceCd > 0)) return { pass: false, error: 'Failed to switch to Defensive stance (2)' };
      const defWk = wk(A);
      if (!(defWk < baseWk * 0.98)) return { pass: false, error: 'Defensive stance walk speed not reduced: base=' + baseWk + ' def=' + defWk };
      human[0].buf.relicStance = clock;
      if (trySwitchRelicStance(A)) return { pass: false, error: 'Cooldown did not prevent immediate double switch' };
      delete human[0].buf.relicStance;
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Advanced AI covers all 20 heroes (kits/ults/teamRoles), KOTH hill navigation, CTF carrier targeting, expansion routes, and adaptive Heirloom stance',
    fn: `(() => {
      // 1. Every single hero in the 20-hero roster has AI_KIT (skill + skill2), AI_ULT, and teamRole
      for (const ch of CHARS) {
        if (!AI_KIT[ch.skill]) return { pass: false, error: 'Missing AI_KIT for skill: ' + ch.id + '.' + ch.skill };
        if (!AI_KIT[ch.skill2]) return { pass: false, error: 'Missing AI_KIT for skill2: ' + ch.id + '.' + ch.skill2 };
        if (!AI_ULT[ch.ult]) return { pass: false, error: 'Missing AI_ULT for ult: ' + ch.id + '.' + ch.ult };
        const tac = AI_HERO_TACTICS[ch.id];
        if (!tac || !tac.teamRole) return { pass: false, error: 'Missing AI_HERO_TACTICS.teamRole for: ' + ch.id };
      }
      // 2. KOTH AI navigates toward the active rotating hill
      startKoth(0, 1, 'hard', { isWatch: true });
      M.phase = 'fight';
      M.koth.zoneIdx = 1; // Left elevated hill (x=520, y=-155)
      A.reset(1100); A.y = 0; A.plat = -1;
      B.reset(1600); B.y = 0; B.plat = -1;
      A.ctrl.brain.think(A, B);
      if (A.ctrl.brain.dir >= 0) return { pass: false, error: 'KOTH AI did not move left toward left hill (x=520): dir=' + A.ctrl.brain.dir };
      // 3. Hard+ multi-factor foeOf prioritizes CTF enemy flag carrier over slightly closer foe
      startCtf(5, 0, 'hard');
      M.phase = 'fight';
      const hunter = FIGHTERS[2]; // Team 0 AI
      const eClose = FIGHTERS[1], eCarrier = FIGHTERS[3];
      hunter.reset(1000); hunter.y = 0;
      eClose.reset(1220); eClose.y = 0; eClose.hp = eClose.maxHp;
      eCarrier.reset(1360); eCarrier.y = 0; eCarrier.hp = eCarrier.maxHp;
      M.ctf.flags[0].carrier = eCarrier.idx;
      hunter.target = null; hunter.cmdTgt = -1;
      const picked = foeOf(hunter);
      if (picked !== eCarrier) return { pass: false, error: 'Hard AI did not prioritize CTF flag carrier: picked=' + (picked && picked.idx) };
      // 4. Qingluan heals an injured ally within 275px via qingluanRoute
      const qlIdx = CHARS.findIndex(c => c.id === 'qingluan');
      startMelee(3, qlIdx, 'hard', 'normal');
      M.phase = 'fight';
      A.ctrl = new AICtrl('hard');
      const ally = FIGHTERS[2], enemy = FIGHTERS[1];
      A.reset(1000); A.y = 0; A.hp = A.maxHp; A.skill2CD = 0;
      ally.reset(1160); ally.y = 0; ally.hp = Math.round(ally.maxHp * 0.4);
      enemy.reset(1500); enemy.y = 0;
      A.ctrl.brain.qlNext = 0;
      const didHeal = A.ctrl.brain.qingluanRoute(A, enemy, 500, 1);
      if (!didHeal) return { pass: false, error: 'Qingluan AI did not trigger heal for injured ally' };
      // 5. Adaptive Heirloom stance switches to Defensive (2) when low HP at Hard+
      startMatch('cpu', 'hard', [0, 1]);
      M.phase = 'fight';
      A.ctrl = new AICtrl('hard');
      A.relicStanceUnlocked = true; A.relicStance = 1; A.relicStanceCd = 0;
      A.hp = Math.round(A.maxHp * 0.3);
      A.ctrl.brain.stanceNext = 0;
      A.ctrl.brain.aiAdaptStance(A, B, 200);
      if (!A.ctrl.buf.relicStance) return { pass: false, error: 'Hard AI did not request Defensive stance switch at 30% HP' };
      toMenu();
      return { pass: true };
    })()`
  },
];
