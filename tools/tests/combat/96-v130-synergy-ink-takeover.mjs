// v1.3.0 Regression Suite: 3v3 Bench Assist & Hot-Tag, 8 Cross-Hero Synergies,
// Living Ink Battlefield (`残墨`/`墨爆`), and Interactive Replay Takeover Drills.

export default [
  {
    name: 'v1.3.0: 3v3 Relay Bench Assist executes cleanly across all 20 heroes with rollback determinism',
    fn: `(() => {
      for (let ci = 0; ci < CHARS.length; ci++) {
        const opp = (ci + 1) % CHARS.length;
        const next = (ci + 2) % CHARS.length;
        startTag3Match([ci, next, opp], [opp, ci, next], 'normal', false);
        M.phase = 'fight';
        A.x = STAGE_W / 2 - 90; B.x = STAGE_W / 2 + 90; A.y = 0; B.y = 0; A.face = 1; B.face = -1;
        A.meter = 60; B.invul = 0;
        const ok = tryTag3Assist(A, B, false);
        if (!ok) return { pass: false, error: 'assist failed for bench hero ' + CHARS[next].id };
        if (Math.round(A.meter) !== 35) return { pass: false, error: 'meter not deducted: ' + A.meter };
        if (M.tag3Assist.cd[0] < 13.9) return { pass: false, error: 'assist CD not set' };
        if (!Number.isFinite(A.hp) || !Number.isFinite(B.hp) || !Number.isFinite(B.vx)) {
          return { pass: false, error: 'NaN state after assist for ' + CHARS[next].id };
        }
      }
      // Verify Hot-Tag Relay Swap swaps team slots, enforces 2.5s lock, and round-trips rollback snapshot
      startTag3Match([0, 2, 4], [1, 3, 5], 'normal', false);
      M.phase = 'fight';
      A.x = STAGE_W / 2 - 70; B.x = STAGE_W / 2 + 70; A.face = 1; B.invul = 0; A.meter = 80;
      const snapBefore = capState();
      const swapped = tryTag3Assist(A, B, true);
      if (!swapped) return { pass: false, error: 'hot-tag swap failed' };
      if (A.chIdx !== 2 || M.teams[0][0] !== 2 || M.teams[0][1] !== 0) return { pass: false, error: 'hot-tag did not swap roster slots' };
      if (Math.round(A.meter) !== 45) return { pass: false, error: 'hot-tag meter cost mismatch: ' + A.meter };
      if (tryTag3Assist(A, B, true)) return { pass: false, error: 'hot-tag lockout not enforced' };
      restState(snapBefore);
      if (A.chIdx !== 0 || M.teams[0][0] !== 0) return { pass: false, error: 'rollback restore failed after hot-tag' };
      return { pass: true };
    })()`
  },
  {
    name: 'v1.3.0: All 8 Cross-Hero Synergies trigger in 2v2 and stay disabled in 1v1',
    fn: `(() => {
      // 1v1 guard: must NEVER trigger
      startMatch('cpu', 'normal', [0, 1]);
      M.phase = 'fight';
      B.synTag = { heroId: 'chixiao', team: 0, attIdx: 2, t: clock };
      const r1v1 = checkCrossHeroSynergy(A, B, { dmg: 20 }, [B.x, B.y - 50]);
      if (r1v1) return { pass: false, error: 'synergy triggered in 1v1' };

      // 2v2: test every one of the 8 synergy definitions
      const pairs = [
        ['chixiao', 'liuyun', 'flame_cyclone'],
        ['moyu', 'leiming', 'conductive_ink'],
        ['lingshuang', 'tieshan', 'frost_shatter'],
        ['yuxiao', 'yuehua', 'harmonic_echo'],
        ['feiying', 'gouchen', 'shadow_hook'],
        ['liuyun', 'yanling', 'gale_feather'],
        ['tieshan', 'qingluan', 'iron_aegis'],
        ['lingque', 'qianji', 'silk_resonance'],
      ];
      for (const [idA, idC, expectedId] of pairs) {
        const iA = CHARS.findIndex(c => c.id === idA);
        const iC = CHARS.findIndex(c => c.id === idC);
        M.mode = '2v2'; M.subMode = 'p_cc';
        startRound();
        M.phase = 'fight';
        A.setChar(iA); C.setChar(iC); B.setChar(0); D.setChar(1);
        C.hidden = false; D.hidden = false;
        B.hp = B.maxHp; B.synTag = null; B.synCd = 0;
        checkCrossHeroSynergy(A, B, { dmg: 18 }, [B.x, B.y - 50]);
        const hpBefore = B.hp;
        const trig = checkCrossHeroSynergy(C, B, { dmg: 18 }, [B.x, B.y - 50]);
        if (!trig || trig.id !== expectedId) {
          return { pass: false, error: 'expected ' + expectedId + ' for ' + idA + '+' + idC + ', got ' + JSON.stringify(trig) };
        }
        if (!(B.hp < hpBefore)) return { pass: false, error: expectedId + ' dealt no bonus damage' };
        // Cooldown guard: immediate second hit should not re-trigger
        B.synTag = { heroId: idA, team: 0, attIdx: A.idx, t: clock };
        const dup = checkCrossHeroSynergy(C, B, { dmg: 18 }, [B.x, B.y - 50]);
        if (dup) return { pass: false, error: expectedId + ' bypassed 3.5s per-target cooldown' };
      }
      return { pass: true };
    })()`
  },
  {
    name: 'v1.3.0: Living Ink Battlefield caps at 12 zones, triggers Calligraphy Flash on clash, and round-trips rollback',
    fn: `(() => {
      startMatch('cpu', 'normal', [0, 1]);
      M.phase = 'fight';
      for (let i = 0; i < 18; i++) inkZoneSpawn(300 + i * 40, 0, 52, '30,35,55', 'heavy');
      if (M.inkZones.length !== 12) return { pass: false, error: 'inkZones not capped at 12: ' + M.inkZones.length };
      const snap = capState();
      const targetX = M.inkZones[M.inkZones.length - 1].x;
      A.x = targetX - 20; B.x = targetX + 20; A.y = 0; B.y = 0; A.meter = 10; B.meter = 10;
      projs.push({ id: 9991, owner: 0, x: targetX + 30, y: -40, vx: 100, vy: 0, w: 20, h: 20, dmg: 10, life: 2 });
      const flashed = inkZoneOnClash(targetX, -40, A, B);
      if (!flashed) return { pass: false, error: 'inkZoneOnClash did not trigger Calligraphy Flash inside ink' };
      if (A.meter < 18 || B.meter < 18) return { pass: false, error: 'Calligraphy Flash did not grant +8 meter' };
      if (projs.some(p => p.id === 9991)) return { pass: false, error: 'Calligraphy Flash did not clear nearby projectile' };
      if ((M.inkFlashCount || 0) < 1) return { pass: false, error: 'inkFlashCount not incremented' };
      restState(snap);
      if (M.inkZones.length !== 12 || (M.inkFlashCount || 0) !== 0) return { pass: false, error: 'rollback restore of M.inkZones failed' };
      return { pass: true };
    })()`
  },
  {
    name: 'v1.3.0: Interactive Replay Takeover clones keyframe, resets deterministically, and exits cleanly',
    fn: `(() => {
      startMatch('cpu', 'normal', [0, 1]);
      M.phase = 'fight';
      for (let i = 0; i < 30; i++) step();
      const rec = recSave(0);
      if (!rec || !rec.st0) return { pass: false, error: 'failed to record replay' };
      startReplay(rec);
      for (let i = 0; i < 10; i++) replayFrame();
      const frameBefore = REPLAY.totalFrame;
      const okStart = replayStartTakeover(0);
      if (!okStart || !REPLAY_TAKEOVER.active || M.mode !== 'train' || REPLAY.on) {
        return { pass: false, error: 'replayStartTakeover failed to enter drill mode' };
      }
      const ax0 = A.x;
      for (let i = 0; i < 20; i++) step();
      const okReset = replayTakeoverReset();
      if (!okReset || Math.abs(A.x - ax0) > 0.01) {
        return { pass: false, error: 'replayTakeoverReset did not restore exact fighter position' };
      }
      const okExit = replayTakeoverExit();
      if (!okExit || REPLAY_TAKEOVER.active || !REPLAY.on || REPLAY.totalFrame !== frameBefore) {
        return { pass: false, error: 'replayTakeoverExit did not cleanly restore replay at frame ' + frameBefore };
      }
      REPLAY.on = false;
      return { pass: true };
    })()`
  },
];
