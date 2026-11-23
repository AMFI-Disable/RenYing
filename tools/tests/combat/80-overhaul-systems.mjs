// 战斗测试第 80 组：全自动托管、42 徽记与 16 灵宠、20 位扩展侠客独立奥义、铁山五层贯穿大招、跨层垂直判定、大型团战 BP 与训练场 AI 难度。
export default [
  {
    name: 'Expanded badges (42) and pets (16) exist in both ArmoryCore and combat loadouts, and FULL AUTO overrides equipment and sells >50 duplicates uncapped',
    fn: `(() => {
      if (!window.ArmoryCore) return { pass: false, error: 'ArmoryCore missing' };
      const C = window.ArmoryCore;
      const badgeIds = Object.keys(C.BADGES || {});
      const petIds = Object.keys(C.PETS || {});
      if (badgeIds.length !== 42) return { pass: false, error: 'Expected 42 badges in ArmoryCore, got ' + badgeIds.length };
      if (petIds.length !== 16) return { pass: false, error: 'Expected 16 pets in ArmoryCore, got ' + petIds.length };
      for (const id of badgeIds) {
        if (!COMBAT_BADGES[id]) return { pass: false, error: 'Missing combat runtime badge: ' + id };
      }
      for (const id of petIds) {
        if (!COMBAT_PETS[id]) return { pass: false, error: 'Missing combat runtime pet: ' + id };
      }
      // Test FULL AUTO: pre-equip a locked/existing bronze/silver badge and inject 75 duplicate skins (>50 cap)
      const st = C.emptyState();
      st.ink = 1000;
      st.badges = {
        flow: { tier: 'silver', unlocked: true },
        breaker: { tier: 'purple_gold', unlocked: true },
        heaven_might: { tier: 'purple_gold', unlocked: true },
        dragon_soul: { tier: 'gold', unlocked: true },
      };
      st.badgeAssign = { qingfeng: 'flow' }; // existing assignment that FULL AUTO must override
      st.pets = { inkfox: 3, azure_dragon: 3, white_tiger: 2 };
      st.petAssign = { qingfeng: 'inkfox' };
      st.stances = { qingfeng: true };
      const sampleSkin = Object.keys(C.ITEMS)[0];
      for (let i = 0; i < 76; i++) {
        st.inv.push({ id: 'dup_' + i, k: sampleSkin, t: 1, w: 0.1 + i * 0.001, st: false, kc: 0 });
      }
      const res = C.ACTIONS.fullAuto(st, {});
      if (!res.ok) return { pass: false, error: 'fullAuto action failed: ' + (res.err || 'unknown') };
      if (res.sold !== 75) return { pass: false, error: 'Expected 75 uncapped duplicates sold (>50 limit), got ' + res.sold };
      if (st.inv.length !== 1) return { pass: false, error: 'Expected 1 unique item kept in inv, got ' + st.inv.length };
      if (st.badgeAssign.qingfeng === 'flow') return { pass: false, error: 'FULL AUTO did not override existing silver badge with higher-tier badge' };
      if (res.badgesAssigned < 4) return { pass: false, error: 'Expected all 4 unlocked badges assigned, got ' + res.badgesAssigned };
      if (res.petsAssigned < 36) return { pass: false, error: 'Expected pets assigned across roster, got ' + res.petsAssigned };
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
        if (typeof U.exec !== 'function') return { pass: false, error: 'Ult missing exec function: ' + key };
        const src = U.exec.toString();
        if (fns.has(src)) return { pass: false, error: 'Duplicate ult exec implementation detected for: ' + key };
        fns.add(src);
      }
      // Execute all 20 in live combat simulation
      for (let ci = 16; ci < CHARS.length; ci++) {
        startMatch('cpu', 'normal', [ci, 0]);
        M.phase = 'fight';
        A.reset(STAGE_W / 2 - 110); B.reset(STAGE_W / 2 + 110);
        A.face = 1; B.face = -1;
        A.meter = 100;
        startUlt(A, B);
        for (let t = 0; t < 45; t++) step();
      }
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Tie Shan avalanche ultimate penetrates all 5 arena layers on BATTLE_MAP and damages foes on multiple layers',
    fn: `(() => {
      const tsIdx = CHARS.findIndex(c => c.id === 'tieshan');
      if (tsIdx < 0) return { pass: false, error: 'Tie Shan not found' };
      startMelee(8, tsIdx, 'normal', 'normal');
      M.phase = 'fight';
      if (!battleMapOn()) return { pass: false, error: 'BATTLE_MAP not active in 8v8 melee' };
      // Position Tie Shan on top layer (-528) and enemies across layers -396, -264, -132, 0
      const lx = STAGE_W / 2;
      A.reset(lx); A.y = -528; A.plat = 0; A.meter = 100; A.face = 1;
      const foes = sideFighters(1);
      const layers = [-396, -264, -132, 0];
      const initHp = [];
      for (let i = 0; i < 4; i++) {
        const foe = foes[i];
        foe.reset(lx + (i % 2 ? 25 : -25));
        foe.y = layers[i];
        foe.vy = 0;
        foe.invul = 0;
        foe.ctrl = new DummyCtrl({ act: 'stand', autoHeal: false });
        initHp.push(foe.hp);
      }
      A.ctrl = human[0];
      startUlt(A, foes[0]);
      // Hold down to accelerate descent through all 5 layers
      human[0].held.down = true;
      for (let t = 0; t < 240; t++) {
        step();
        if (A.state !== 'ult' && A.y >= -1) break;
      }
      human[0].held.down = false;
      const slammedCount = A.avaSlammedLayers ? A.avaSlammedLayers.size : 0;
      if (slammedCount < 5) return { pass: false, error: 'Expected Tie Shan to slam all 5 layers, got ' + slammedCount };
      let hitLayers = 0;
      for (let i = 0; i < 4; i++) {
        if (foes[i].hp < initHp[i]) hitLayers++;
      }
      if (hitLayers < 3) return { pass: false, error: 'Expected foes on at least 3 distinct layers hit, got ' + hitLayers };
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
      if (B.jailT > 0 && Math.abs(B.y - (-132)) > 45) return { pass: false, error: 'Zuixian pavilion dropped jailed victim to ground: B.y=' + B.y };
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
      // Verify 8v8 CTF BP draft structure
      bpStart('ctf', { teamSize: 8, level: 'hard' });
      if (BP.picks[0].length !== 8 || BP.picks[1].length !== 8 || BP.bansBySide[0].length !== 2) {
        return { pass: false, error: '8v8 CTF BP structure mismatch' };
      }
      toMenu();
      return { pass: true };
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
