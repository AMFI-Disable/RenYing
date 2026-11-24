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
    name: 'All 20 expansion hero ultimates are unique non-flurry implementations and execute cleanly',
    fn: `(() => {
      const expUlts = [
        'skyfall', 'thicket', 'celestial', 'maelstrom', 'eclipsecleave',
        'phoenixchorus', 'tortoiseslam', 'infernorush', 'ninestrike', 'skywarddance',
        'heavenbreaker', 'abyssscroll', 'wintertorrent', 'roctempest', 'nightmarecut',
        'spiritdomain', 'conquerorslam', 'bellharmony', 'endlessblade', 'grandpainting'
      ];
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
      // Execute all 20 in live combat simulation
      for (let ci = 16; ci < CHARS.length; ci++) {
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
      A.reset(lx - 150); A.y = -132; A.plat = 3; A.face = 1; A.meter = 100;
      const ylFoes = sideFighters(1);
      const ylHp = [];
      for (let i = 0; i < 3; i++) {
        ylFoes[i].reset(lx + 40 + i * 90); ylFoes[i].y = -132; ylFoes[i].invul = 0;
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
    name: 'Large Battle BP screen supports 5v5 and 8v8 multi-ban drafting, auto-fill, and launches drafted teams into melee/ctf',
    fn: `(() => {
      bpStart('melee', { teamSize: 5, level: 'normal' });
      if (bpMode !== 'melee' || !BP) return { pass: false, error: 'bpStart(melee) failed' };
      if (!BP.bansBySide || BP.bansBySide[0].length !== 2 || BP.bansBySide[1].length !== 2) {
        return { pass: false, error: 'Expected 2 bans per side in 5v5 melee BP' };
      }
      if (!Array.isArray(BP.picks[0]) || BP.picks[0].length !== 5 || BP.picks[1].length !== 5) {
        return { pass: false, error: 'Expected 5 picks per side in 5v5 melee BP' };
      }
      // Player picks first ban manually, then uses bpAutoFillLarge
      bpApply(0);
      if (BP.bansBySide[0][0] !== 0) return { pass: false, error: 'First ban not recorded in bansBySide[0][0]' };
      bpAutoFillLarge();
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
      // Verify 8v8 CTF BP draft structure
      bpStart('ctf', { teamSize: 8, level: 'hard' });
      if (BP.picks[0].length !== 8 || BP.picks[1].length !== 8 || BP.bansBySide[0].length !== 2) {
        return { pass: false, error: '8v8 CTF BP structure mismatch' };
      }
      bpAutoFillLarge();
      const ctfTeams = BP.picks.map(team => team.slice());
      bpFinish();
      if (M.mode !== 'ctf' || M.teamSize !== 8) return { pass: false, error: '8v8 CTF did not start' };
      $id('againBtn').click();
      if (M.mode !== 'ctf' || [0, 1].some(side => sideFighters(side).some((f, i) => f.chIdx !== ctfTeams[side][i]))) {
        return { pass: false, error: 'CTF rematch changed the drafted teams' };
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
];
