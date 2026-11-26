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
      // 其余人开局分在各层楼上：挪到场边地面，别挡在这次测试的几个人中间
      for (const f of allFighters()) if (f !== A) { f.reset(f.idx % 2 ? STAGE_W - WALL - 40 - f.idx * 6 : WALL + 40 + f.idx * 6); f.y = 0; f.plat = -1; }
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
      // 只看勾陈和被勾的人：其余人不动，挪到场边地面
      for (const f of allFighters()) if (f !== A && f !== B) { f.ctrl = new Ctrl(); f.reset(f.idx % 2 ? STAGE_W - WALL - 40 - f.idx * 6 : WALL + 40 + f.idx * 6); f.y = 0; f.plat = -1; }
      // Put Gouchen on layer -264 and enemy on layer -264 nearby, verify hook pulls to -264 (not 0)
      A.reset(STAGE_W / 2 - 120); A.y = -264; A.plat = 2; A.face = 1;
      B.reset(STAGE_W / 2 + 80); B.y = -264; B.plat = 2; B.invul = 0; B.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      startSkill(A, B);
      for (let t = 0; t < 50; t++) step();
      if (Math.abs(B.y - (-264)) > 45) return { pass: false, error: 'Gouchen hook snapped victim off elevated layer: B.y=' + B.y };

      // Zuixian Q pavilion on elevated layer -132 should store jailY near -132 (not 0)
      startMelee(8, zxIdx, 'normal', 'normal');
      M.phase = 'fight';
      for (const f of allFighters()) if (f !== A && f !== B) { f.ctrl = new Ctrl(); f.reset(f.idx % 2 ? STAGE_W - WALL - 40 - f.idx * 6 : WALL + 40 + f.idx * 6); f.y = 0; f.plat = -1; }
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
      // 其余人开局分在各层楼上：挪到场边地面，别挡在这次测试的几个人中间
      for (const f of allFighters()) if (f !== A) { f.reset(f.idx % 2 ? STAGE_W - WALL - 40 - f.idx * 6 : WALL + 40 + f.idx * 6); f.y = 0; f.plat = -1; }
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
    name: 'Heirloom (天工传世) skins unlock configurable Dual Stance (攻守双境) across all 20 heroes with balanced modifiers, poses, keybinds, and respawn persistence',
    fn: `(() => {
      if (DEFAULT_1P_KEYS.relicStance !== 'KeyM') return { pass: false, error: 'Expected DEFAULT_1P_KEYS.relicStance === KeyM, got ' + DEFAULT_1P_KEYS.relicStance };
      if (KEYS[1].Semicolon !== 'relicStance' || KEYS[3].NumpadDecimal !== 'relicStance') return { pass: false, error: 'Missing 2P/4P relicStance keybinds' };
      if (!FK.includes('relicStance') || !FK.includes('relicStanceUnlocked') || !FK.includes('relicCounterT')) return { pass: false, error: 'FK missing relicStance rollback fields' };

      // 1. All 20 heroes have an heirloom skin that unlocks Dual Stance, toggles 1 <-> 2, and yields distinct Aggressive vs Defensive poses
      if (window.ArmoryCore && window.ArmoryCore.FULL) {
        for (const [k, d] of Object.entries(window.ArmoryCore.FULL)) {
          if (d && d.heirloom && !SKINS[k]) {
            SKINS[k] = { char: d.char, rarity: 'legend', name: d.name, cs: 'heirloom', heirloom: true, stOnly: !!d.stOnly, relic: d.relic ? { ...d.relic } : undefined, look: { ...d.look }, deco: JSON.parse(JSON.stringify(d.deco)), fx: { ...d.fx } };
          }
        }
      }
      const heirloomEntries = Object.entries(SKINS).filter(([, v]) => v && v.heirloom);
      if (heirloomEntries.length !== 20) return { pass: false, error: 'Expected 20 heirloom skins, got ' + heirloomEntries.length };
      startMatch('cpu', 'normal', [0, 1]);
      M.phase = 'fight';
      for (let ci = 0; ci < CHARS.length; ci++) {
        const ch = CHARS[ci];
        const pair = heirloomEntries.find(([, v]) => v.char === ch.id);
        if (!pair) return { pass: false, error: 'Missing heirloom skin for hero: ' + ch.id };
        A.setChar(ci);
        A.ctrl = human[0];
        A.skinKey = pair[0];
        A.look = skinLook(ci, pair[0]);
        applyCombatLoadouts(A);
        if (!A.relicStanceUnlocked || A.relicStance !== 1) return { pass: false, error: 'Heirloom did not unlock Aggressive (1) for ' + ch.id };
        A.state = 'idle';
        const atkPose = targetPose(A);
        const atkSw = atkPose.sw, atkNeckX = atkPose.neck[0];
        A.relicStanceCd = 0;
        human[0].buf.relicStance = clock;
        if (!trySwitchRelicStance(A) || A.relicStance !== 2) return { pass: false, error: 'Failed switch 1->2 for ' + ch.id };
        A.state = 'idle';
        const defPose = targetPose(A);
        if (Math.abs(atkSw - defPose.sw) < 0.2 || atkNeckX <= defPose.neck[0]) {
          return { pass: false, error: 'Aggressive and Defensive idle poses did not differ for ' + ch.id };
        }
        A.relicStanceCd = 0;
        human[0].buf.relicStance = clock;
        if (!trySwitchRelicStance(A) || A.relicStance !== 1) return { pass: false, error: 'Failed switch 2->1 for ' + ch.id };
      }

      // 2. Ordinary skin cannot switch; walk speed scales +6% (Aggressive) / -4% (Defensive); cooldown blocks double switch
      A.setChar(0); A.ctrl = human[0];
      A.skinKey = ''; A.look = skinLook(0, '');
      applyCombatLoadouts(A);
      if (A.relicStanceUnlocked || A.relicStance !== 0) return { pass: false, error: 'Ordinary skin should not unlock relic stance' };
      const baseWk = wk(A);
      human[0].buf.relicStance = clock;
      if (trySwitchRelicStance(A)) return { pass: false, error: 'Ordinary skin should not allow switching relic stance' };
      delete human[0].buf.relicStance;
      A.skinKey = 'qf_porcelain'; A.look = skinLook(0, 'qf_porcelain');
      applyCombatLoadouts(A);
      const atkWk = wk(A);
      if (!(atkWk > baseWk * 1.04)) return { pass: false, error: 'Aggressive stance walk speed not boosted: base=' + baseWk + ' atk=' + atkWk };
      A.relicStanceCd = 0; human[0].buf.relicStance = clock;
      if (!trySwitchRelicStance(A) || A.relicStance !== 2 || !(A.relicStanceCd > 0)) return { pass: false, error: 'Failed switch to Defensive (2)' };
      const defWk = wk(A);
      if (!(defWk < baseWk * 0.98)) return { pass: false, error: 'Defensive stance walk speed not reduced: base=' + baseWk + ' def=' + defWk };
      human[0].buf.relicStance = clock;
      if (trySwitchRelicStance(A)) return { pass: false, error: 'Cooldown did not prevent immediate double switch' };
      delete human[0].buf.relicStance;

      // 3. KeyM during active combat triggers relicStance and does NOT toggle mute
      const mutedBefore = muted;
      const evM = typeof KeyboardEvent === 'function'
        ? new KeyboardEvent('keydown', { code: 'KeyM', cancelable: true })
        : { type: 'keydown', code: 'KeyM', repeat: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, target: null };
      window.dispatchEvent(evM);
      if (muted !== mutedBefore) return { pass: false, error: 'KeyM hijacked mute during active combat' };
      if (human[0].buf.relicStance === undefined) return { pass: false, error: 'KeyM did not buffer relicStance in active combat' };
      delete human[0].buf.relicStance;

      // 4. Exact damage/armor/chip/meter/guard modifiers & anti-whiff-parry exploit verification
      const probeHit = (attStance, defStance, opts = {}) => {
        startMatch('cpu', 'normal', [0, 1]); M.phase = 'fight'; M.chaos = null; M.teamMutator = 'normal';
        A.reset(STAGE_W / 2 - 80); B.reset(STAGE_W / 2 + 80); A.face = 1; B.face = -1;
        A.invul = 0; B.invul = 0; A.meter = 0; B.meter = 0; A.comboHits = 0; B.comboHits = 0;
        A.relicStanceUnlocked = attStance > 0; A.relicStance = attStance; A.relicCounterT = opts.relicCounterT || 0; A.qiParryCD = opts.qiParryCD || 0;
        B.relicStanceUnlocked = defStance > 0; B.relicStance = defStance; B.armorT = opts.armor ? 1 : 0; B.armorHits = opts.armor ? 2 : 0;
        const hp0 = B.hp;
        applyHit(A, B, { dmg: 100, kb: [0, 0], stun: 0.2, hs: 0.04, noScale: true, chip: !!opts.chip }, [B.x, B.y - 60]);
        return { dmg: hp0 - B.hp, meter: A.meter };
      };
      const baseH = probeHit(0, 0);
      const atkH = probeHit(1, 0);
      const defH = probeHit(2, 0);
      const atkTaken = probeHit(0, 1);
      const defTaken = probeHit(0, 2);
      const whiffParryH = probeHit(2, 0, { qiParryCD: 3.8 });
      const verifiedCounterH = probeHit(2, 0, { relicCounterT: 1.0 });
      const armorBase = probeHit(0, 0, { armor: true });
      const armorAtk = probeHit(1, 0, { armor: true });
      const chipBase = probeHit(0, 0, { chip: true });
      const chipDef = probeHit(0, 2, { chip: true });
      if (Math.abs(atkH.dmg / baseH.dmg - 1.06) > 0.01) return { pass: false, error: 'Aggressive dmg dealt mismatch: ' + (atkH.dmg / baseH.dmg) };
      if (Math.abs(atkH.meter / baseH.meter - 1.10) > 0.01) return { pass: false, error: 'Aggressive meter gain mismatch: ' + (atkH.meter / baseH.meter) };
      if (Math.abs(defH.dmg / baseH.dmg - 0.94) > 0.01) return { pass: false, error: 'Defensive dmg dealt mismatch: ' + (defH.dmg / baseH.dmg) };
      if (Math.abs(atkTaken.dmg / baseH.dmg - 1.06) > 0.01) return { pass: false, error: 'Aggressive dmg taken mismatch: ' + (atkTaken.dmg / baseH.dmg) };
      if (Math.abs(defTaken.dmg / baseH.dmg - 0.93) > 0.01) return { pass: false, error: 'Defensive dmg taken mismatch: ' + (defTaken.dmg / baseH.dmg) };
      if (Math.abs(whiffParryH.dmg - defH.dmg) > 0.05) return { pass: false, error: 'Whiffed qiParry CD still granted Defensive counter bonus!' };
      if (Math.abs(verifiedCounterH.dmg / defH.dmg - 1.10) > 0.01) return { pass: false, error: 'Verified Defensive counter bonus mismatch: ' + (verifiedCounterH.dmg / defH.dmg) };
      if (Math.abs(armorAtk.dmg / armorBase.dmg - 1.06) > 0.01 || Math.abs(armorAtk.meter / armorBase.meter - 1.10) > 0.01) return { pass: false, error: 'Armor hit bypassed relic stance modifiers' };
      if (Math.abs(chipDef.dmg / chipBase.dmg - 0.93) > 0.01) return { pass: false, error: 'Chip hit bypassed relic stance modifiers' };

      // 5. Verified Just Guard & qiParry in Defensive stance grant relicCounterT
      startMatch('cpu', 'normal', [0, 1]); M.phase = 'fight';
      A.reset(STAGE_W / 2 - 80); B.reset(STAGE_W / 2 + 80); A.face = 1; B.face = -1;
      B.relicStanceUnlocked = true; B.relicStance = 2; B.relicCounterT = 0;
      B.state = 'block'; B.blockT = 0.03;
      applyHit(A, B, { dmg: 40, kb: [100, 0], stun: 0.2, hs: 0.04 }, [B.x, B.y - 60]);
      if (!(B.relicCounterT > 1.0)) return { pass: false, error: 'Just Guard in Defensive stance did not grant relicCounterT' };
      B.relicCounterT = 0; B.qiParryT = 0.15; B.state = 'idle';
      applyHit(A, B, { dmg: 40, kb: [100, 0], stun: 0.2, hs: 0.04 }, [B.x, B.y - 60]);
      if (!(B.relicCounterT > 1.0)) return { pass: false, error: 'qiParry in Defensive stance did not grant relicCounterT' };

      // 6. Respawn persistence across Melee, CTF, KOTH, and Quad Clash
      startMelee(3, 0, 'normal', 'normal'); M.phase = 'fight';
      A.skinKey = 'qf_porcelain'; A.look = skinLook(0, 'qf_porcelain'); applyCombatLoadouts(A);
      A.relicStance = 2; A.hp = 0; M.melee.respawn[0] = STEP; meleeMatch();
      if (!A.relicStanceUnlocked || A.relicStance !== 2) return { pass: false, error: 'Melee respawn lost Defensive stance: ' + A.relicStance };

      startCtf(3, 0, 'normal'); M.phase = 'fight';
      A.skinKey = 'qf_porcelain'; A.look = skinLook(0, 'qf_porcelain'); applyCombatLoadouts(A);
      A.relicStance = 2; A.hp = 0; M.ctf.respawn[0] = STEP; ctfMatch();
      if (!A.relicStanceUnlocked || A.relicStance !== 2) return { pass: false, error: 'CTF respawn lost Defensive stance: ' + A.relicStance };

      startKoth(0, 1, 'normal'); M.phase = 'fight';
      A.skinKey = 'qf_porcelain'; A.look = skinLook(0, 'qf_porcelain'); applyCombatLoadouts(A);
      A.relicStance = 2; kothRespawnFighter(A);
      if (!A.relicStanceUnlocked || A.relicStance !== 2) return { pass: false, error: 'KOTH respawn lost Defensive stance: ' + A.relicStance };

      startQuad(2, 0, 'normal'); M.phase = 'fight';
      A.skinKey = 'qf_porcelain'; A.look = skinLook(0, 'qf_porcelain'); applyCombatLoadouts(A);
      A.relicStance = 2; A.hp = 0; M.quad.respawn[0] = STEP; quadMatch();
      if (!A.relicStanceUnlocked || A.relicStance !== 2) return { pass: false, error: 'Quad respawn lost Defensive stance: ' + A.relicStance };

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
  {
    name: '20-hero hitbox/hurtbox scaling and multi-layer vertical isolation hold across all normal moves and layered skills',
    fn: `(() => {
      // 1. All 20 heroes have non-degenerate normal boxes, zero cross-layer bleed at dy=180, and hurtbox width/height scaled by stat.size
      for (let i = 0; i < CHARS.length; i++) {
        const ch = CHARS[i], mv = CHAR_MOVES[i];
        A.setChar(i); B.setChar(0);
        A.state = 'idle'; A.x = 600; A.y = 0; A.face = 1;
        const huA = hurtbox(A);
        const expW = 36 * (ch.stat.size || 1), expH = 112 * (ch.stat.size || 1);
        if (Math.abs((huA[2] - huA[0]) - expW) > 0.2 || Math.abs((huA[3] - huA[1]) - expH) > 0.2) {
          return { pass: false, error: 'Hurtbox scaling mismatch for ' + ch.id + ': ' + JSON.stringify(huA) };
        }
        B.state = 'idle'; B.x = 660; B.y = -180; B.face = -1;
        const huUp = hurtbox(B);
        for (const [k, m] of Object.entries(mv)) {
          if (!m || !m.box) continue;
          const hb = hitbox(A, m.box);
          if (!(hb[2] > hb[0] && hb[3] > hb[1])) return { pass: false, error: 'Degenerate hitbox on ' + ch.id + '.' + k };
          if (overlap(hb, huUp)) return { pass: false, error: 'Normal move cross-layer bleed on ' + ch.id + '.' + k };
        }
      }
      // 2. Multi-layer skill isolation on BATTLE_MAP (8v8):
      //    a) Tieshan ironwall does not hit foes 3 floors above (-396)
      const tsIdx = CHARS.findIndex(c => c.id === 'tieshan');
      startMelee(8, tsIdx, 'normal', 'normal'); M.phase = 'fight';
      for (const f of allFighters()) f.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      A.reset(STAGE_W / 2 - 40); A.y = 0; A.plat = -1; A.face = 1; A.skill2CD = 0;
      const upFoe = sideFighters(1)[0];
      upFoe.reset(STAGE_W / 2 + 20); upFoe.y = -396; upFoe.plat = 1; upFoe.invul = 0;
      const upHp0 = upFoe.hp;
      startSkill(A, upFoe, 2);
      for (let t = 0; t < 45; t++) { upFoe.y = -396; upFoe.vy = 0; step(); }
      if (upFoe.hp < upHp0) return { pass: false, error: 'Tieshan ironwall bled through 3 floors on BATTLE_MAP' };

      //    b) Qingfeng gale does not purge Moyu trap placed 2 floors below
      const qfIdx = CHARS.findIndex(c => c.id === 'qingfeng');
      startMelee(8, qfIdx, 'normal', 'normal'); M.phase = 'fight';
      for (const f of allFighters()) f.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      A.reset(STAGE_W / 2 - 80); A.y = -264; A.plat = 2; A.face = 1; A.skillCD = 0;
      const foe0 = sideFighters(1)[0];
      projs.length = 0;
      spawnProj(foe0, { kind: 'trap', x: STAGE_W / 2, y: -6, groundY: 0, vx: 0, w: 115, h: 28, life: 5, delay: 0, dmg: 35, kb: [0, 0], stun: 0.4, hs: 0.05, root: true, groundOnly: true });
      startSkill(A, foe0);
      for (let t = 0; t < 35; t++) { A.y = -264; A.vy = 0; step(); }
      const trapAlive = projs.some(p => p.kind === 'trap' && !p.dead);
      if (!trapAlive) return { pass: false, error: 'Qingfeng gale purged a Moyu trap on a different floor' };

      //    c) Zuixian pavilion dropped on ground (y=0) does not jail bystander 2 floors above (-264)
      const zxIdx = CHARS.findIndex(c => c.id === 'zuixian');
      startMelee(8, zxIdx, 'normal', 'normal'); M.phase = 'fight';
      for (const f of allFighters()) f.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
      const gFoe = sideFighters(1)[0], hiFoe = sideFighters(1)[1];
      A.reset(STAGE_W / 2 - 120); A.y = 0; A.plat = -1; A.face = 1; A.skillCD = 0;
      A.ctrl = human[0]; A.lockIdx = gFoe.idx;
      gFoe.reset(STAGE_W / 2); gFoe.y = 0; gFoe.plat = -1; gFoe.invul = 0;
      hiFoe.reset(STAGE_W / 2); hiFoe.y = -264; hiFoe.plat = 2; hiFoe.invul = 0;
      startSkill(A, gFoe);
      for (let t = 0; t < 75; t++) { hiFoe.y = -264; hiFoe.vy = 0; step(); }
      if (hiFoe.jailT > 0) return { pass: false, error: 'Zuixian ground pavilion jailed a bystander 2 floors above' };

      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: '32-player camera-frustum culling and adaptive LOD cull off-screen entities while keeping local player at LOD 0 and 1v1 unaffected',
    fn: `(() => {
      // 1. 1v1 leaves frustum culling inactive and LOD at 0
      startMatch('cpu', 'normal', [0, 1]); M.phase = 'fight';
      W = 1920; H = 1080; DPR = 1; cv.width = 1920; cv.height = 1080;
      step(); updateCamera(1 / 60); render();
      if (RENDER_CULL.active || RENDER_CULL.lod !== 0 || RENDER_CULL.culledFighters !== 0) {
        return { pass: false, error: 'Expected frustum culling off in 1v1: ' + JSON.stringify(RENDER_CULL) };
      }

      // 2. 16v16 (32 players) enables frustum culling + LOD 2, culls off-screen fighters/projectiles/particles, keeps local player LOD 0
      startMelee(16, 0, 'normal', 'normal'); M.phase = 'fight';
      for (let i = 0; i < 15; i++) step();
      updateCamera(1 / 60);
      // Place an off-screen projectile and particle far outside camera frustum
      const farX = cam.x > STAGE_W / 2 ? 120 : STAGE_W - 120;
      projs.push({ id: 99999, owner: 0, kind: 'qi', x: farX, y: -60, vx: 0, vy: 0, w: 40, h: 40, life: 1, age: 0, dmg: 10, delay: 0 });
      particles.push({ type: 'spark', x: farX, y: -60, vx: 0, vy: 0, life: 0.5, max: 0.5, rgb: '255,255,255', w: 2 });
      render();
      if (!RENDER_CULL.active || RENDER_CULL.lod !== 2) {
        return { pass: false, error: 'Expected active frustum culling with LOD 2 in 16v16: ' + JSON.stringify(RENDER_CULL) };
      }
      if (RENDER_CULL.totalFighters !== 32 || RENDER_CULL.culledFighters <= 0 || RENDER_CULL.visibleFighters >= 32) {
        return { pass: false, error: 'Expected off-screen fighters culled in 16v16: ' + JSON.stringify(RENDER_CULL) };
      }
      if (RENDER_CULL.culledProjs < 1 || RENDER_CULL.culledParticles < 1) {
        return { pass: false, error: 'Expected off-screen projectile and particle culled: ' + JSON.stringify(RENDER_CULL) };
      }
      if (fighterLod(A) !== 0) {
        return { pass: false, error: 'Expected local player A to remain at LOD 0, got ' + fighterLod(A) };
      }
      const farFoe = allFighters().find(f => f !== A && Math.abs(f.x - cam.x) > 400);
      if (farFoe && fighterLod(farFoe) !== 2) {
        return { pass: false, error: 'Expected distant 16v16 fighter at LOD 2, got ' + fighterLod(farFoe) };
      }
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Match Review 2.0 timeline, keyframe replay scrubbing (forward & backward), and RYRP2 Replay Codes work deterministically',
    fn: `(() => {
      // 1. Record a short local 1v1 match (300 frames = 2.5s)
      startMatch('cpu', 'normal', [0, 1]);
      M.phase = 'fight';
      recBegin('loc');
      for (let i = 0; i < 300; i++) {
        if (i === 40) human[0].held.right = true;
        if (i === 70) { human[0].held.right = false; human[0].held.atk = true; }
        if (i === 76) human[0].held.atk = false;
        step();
      }
      const saved = recSave(0);
      if (!saved || !saved.st0 || !Array.isArray(saved.ev)) return { pass: false, error: 'recSave did not produce valid replay' };

      // 2. Match Review 2.0 produces neutralScore, rounds, and timeline markers
      const rev = matchReviewData(saved);
      if (!rev || typeof rev.neutralScore !== 'number' || rev.neutralScore < 0 || rev.neutralScore > 100) {
        return { pass: false, error: 'Invalid Match Review 2.0 neutralScore: ' + JSON.stringify(rev && rev.neutralScore) };
      }
      if (!Array.isArray(rev.rounds) || rev.rounds.length < 1 || !Array.isArray(rev.timeline)) {
        return { pass: false, error: 'Match Review 2.0 missing rounds or timeline' };
      }

      // 3. Shareable Replay Code round-trip strips heavy tr rows and rejects malformed codes
      const code = rpEncodeCode(saved);
      if (!code.startsWith('RYRP2:')) return { pass: false, error: 'Replay code missing RYRP2: prefix' };
      const decoded = rpDecodeCode(code);
      if (!decoded || decoded.tr !== undefined || decoded.ch[0] !== 0 || decoded.ch[1] !== 1) {
        return { pass: false, error: 'Decoded replay code mismatch or did not strip tr' };
      }
      let rejectedBad = false;
      try { rpDecodeCode('INVALID:123'); } catch (e) { rejectedBad = true; }
      if (!rejectedBad) return { pass: false, error: 'rpDecodeCode accepted invalid replay code' };

      // 4. Keyframe replay scrubbing forward and backward restores deterministic state
      startReplay(decoded);
      if (!Array.isArray(REPLAY.keyframes) || REPLAY.keyframes.length < 1) {
        return { pass: false, error: 'startReplay did not capture frame-0 keyframe' };
      }
      replaySeek(260);
      if (REPLAY.totalFrame !== 260) return { pass: false, error: 'Forward seek did not reach frame 260: ' + REPLAY.totalFrame };
      const xAt260 = A.x, yAt260 = A.y;
      if (REPLAY.keyframes.length < 3) return { pass: false, error: 'Expected >=3 cached keyframes at frame 260 (0, 120, 240), got ' + REPLAY.keyframes.length };
      replaySeek(140);
      if (REPLAY.totalFrame !== 140) return { pass: false, error: 'Backward seek did not reach frame 140: ' + REPLAY.totalFrame };
      replaySeek(260);
      if (REPLAY.totalFrame !== 260 || Math.abs(A.x - xAt260) > 0.01 || Math.abs(A.y - yAt260) > 0.01) {
        return { pass: false, error: 'Seek back to 260 diverged: (' + A.x + ',' + A.y + ') vs (' + xAt260 + ',' + yAt260 + ')' };
      }
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Live Spectator HUD focus switcher/clean toggle and 8-slot Single-Elimination Tournament Bracket run end-to-end',
    fn: `(() => {
      // 1. Live Spectator HUD activates in AI watch mode, cycles fighter focus, and toggles clean mode
      startMatch('cpu', 'normal', [0, 1]);
      M.watchAi = true; M.phase = 'fight';
      A.ctrl = new AICtrl('normal'); B.ctrl = new AICtrl('normal');
      currentScreen = null;
      if (!spectatorHudAvail()) return { pass: false, error: 'spectatorHudAvail() returned false in watch mode' };
      const f1 = specHudCycleFocus(1);
      if (f1 !== 0) return { pass: false, error: 'Expected first focus cycle to index 0, got ' + f1 };
      const f2 = specHudCycleFocus(1);
      if (f2 !== 1) return { pass: false, error: 'Expected second focus cycle to index 1, got ' + f2 };
      const cleanOn = specHudToggleClean();
      if (!cleanOn || !SPEC_HUD.clean) return { pass: false, error: 'specHudToggleClean did not enable clean mode' };
      specHudToggleClean();
      specHudSetFocus(-1);

      // 2. 8-slot Tournament Bracket creates 8 unique heroes, plays/sims all 7 bouts, and crowns champion
      const ink0 = PROF.ink || 0;
      const t = tourCreate({ format: 'player', playerHero: 0, level: 'normal', seed: 42 });
      if (!t || t.entrants.length !== 8) return { pass: false, error: 'Expected 8 tournament entrants' };
      const uniqueHeroes = new Set(t.entrants.map(e => e.chIdx));
      if (uniqueHeroes.size !== 8) return { pass: false, error: 'Tournament entrants did not have 8 unique heroes' };
      // Play QF #1 (human entrant 0 vs entrant 7) and report human win
      if (!tourPlayMatch(0, 0, false) || !M.tournament || M.tournament.round !== 0) {
        return { pass: false, error: 'tourPlayMatch failed to launch QF #1' };
      }
      tourReportResult(0, 0, 0, [2, 0]);
      // Fast-sim remaining AI QFs (QF #2, #3, #4)
      const simmed = tourSimAllAi();
      if (simmed !== 3) return { pass: false, error: 'Expected 3 AI quarterfinals fast-simmed, got ' + simmed };
      // Semifinal 1 has human entrant 0; advance human to Grand Final and win
      tourReportResult(1, 0, 0, [2, 1]);
      tourSimMatch(1, 1);
      tourReportResult(2, 0, 0, [2, 0]);
      if (TOUR.champion !== 0) return { pass: false, error: 'Expected entrant 0 crowned champion, got ' + TOUR.champion };
      if ((PROF.ink || 0) < ink0 + 200) return { pass: false, error: 'Champion Ink reward (+200) not credited' };
      PROF.ink = ink0;
      M.tournament = null;
      toMenu();
      return { pass: true };
    })()`
  },
];
