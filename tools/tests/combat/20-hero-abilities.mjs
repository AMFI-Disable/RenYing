// 战斗测试第 20 组：个别侠客的特殊技能：凌雀的换影、受击可放的技能、磁仙的磁极、千机的傀丸。
// 由 tools/tests/combat-test.mjs 按文件名顺序载入；每项 { name, fn }，fn 是在沙盒里执行的代码字符串，返回 { pass, error }。
// 找 bug 提示：测试失败时报的是 name，在本文件里搜这个 name 就能找到它的代码。
export default [
  {
    name: 'Selected ranged projectiles aim toward vertical targets and gently follow their movement while horizontal shots remain unchanged',
    fn: `(() => {
      startMatch('train', 'stand', [CHAR_IDX.qingfeng, 0]); showScreen(null); paused = false; M.phase = 'fight';
      for (const f of [A, B]) { toNeutral(f); f.invul = 0; f.hp = f.maxHp; }
      A.x = 300; A.y = 0; A.face = 1; B.x = 900; B.y = -250; B.vx = 0; B.vy = 0;
      projs.length = 0;
      spawnProj(A, { kind: 'test-aim', x: A.x + 20, y: -60, vx: 700, vy: 0, autoAim: true, life: 1, w: 12, h: 12, dmg: 0 });
      const aimed = projs[0], initialVy = aimed && aimed.vy;
      if (!aimed || !(initialVy < -100)) return { pass: false, error: 'auto-aim did not tilt toward an elevated target: ' + initialVy };
      B.y = 0; updateProjs();
      if (!(aimed.vy > initialVy)) return { pass: false, error: 'auto-aim did not smoothly follow the target height' };
      spawnProj(A, { kind: 'test-horizontal', x: A.x + 20, y: -60, vx: 700, vy: 0, life: 1, w: 12, h: 12, dmg: 0 });
      if (Math.abs(projs[1].vy) > 0.001) return { pass: false, error: 'a non-aimed horizontal projectile changed lanes' };
      toMenu(); return { pass: true, error: null };
    })()`
  },
  {
    name: 'Lingque R (shadowdash) feints & drifts back, homes non-stop on far/fleeing/jumping targets, wall- and cliff-edge-bounces, cannot be Just Guarded, and block stuns without knockdown',
    fn: `(() => {
      const run = (setup, perFrame, maxFrames = 150) => {
        startMatch('train', 'stand', [CHAR_IDX.lingque, 0]);
        showScreen(null); paused = false; M.phase = 'fight';
        for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; f.breakCD = 0; f.needleMark = 0; }
        A.x = STAGE_W / 2 - 380; B.x = STAGE_W / 2 + 380; A.face = 1; B.face = -1;
        if (setup) setup();
        const hp0 = B.hp; A.skill2CD = 0; startSkill(A, B, 2);
        if (A.skill !== 'shadowdash') return { err: 'R did not start shadowdash: ' + A.skill };
        let hitAt = -1, maxDrift = 0, sawDrift = false;
        for (let i = 0; i < maxFrames && A.state === 'skill'; i++) {
          if (perFrame) perFrame(i);
          step();
          if (A.sdDrifting || A.sdDrifted) sawDrift = true;
          if (A.sdDriftDist > maxDrift) maxDrift = A.sdDriftDist;
          if (hitAt < 0 && B.hp < hp0) hitAt = i;
        }
        return { hit: hitAt >= 0, hitAt, sawDrift, maxDrift, dist: Math.round(Math.abs(B.x - A.x)), lqState: A.state, bState: B.state, bHp: B.hp, hp0 };
      };
      // 1. Far target: approaches, drifts back (does not hit first pass), then tracks and hits
      const far = run();
      if (!far.hit) return { pass: false, error: 'missed standing target: ' + JSON.stringify(far) };
      if (!far.sawDrift || far.maxDrift < 200) return { pass: false, error: 'did not drift back properly: ' + JSON.stringify(far) };

      // 2. Fleeing target: pursues non-stop
      const flee = run(null, i => { if (B.state !== 'hitstun' && B.state !== 'launched') { B.x = Math.min(STAGE_W - WALL - 20, B.x + 5); } });
      if (!flee.hit) return { pass: false, error: 'missed a target running away: ' + JSON.stringify(flee) };

      // 3. Jumping target: homes into air / landing
      const jump = run(() => { B.state = 'air'; B.vy = -1100; B.y = -2; });
      if (!jump.hit) return { pass: false, error: 'missed a jumping target: ' + JSON.stringify(jump) };

      // 4. Target gets behind: turns around
      const side = run(null, i => { if (i === 24) { B.x = Math.max(WALL + 50, A.x - 300); } });
      if (!side.hit) return { pass: false, error: 'did not turn around: ' + JSON.stringify(side) };

      // 5. Wall test: A starting near wall or rushing into wall does not stop R
      const wallRun = run(() => { A.x = WALL + 20; A.face = -1; B.x = STAGE_W - WALL - 100; });
      if (!wallRun.hit) return { pass: false, error: 'R stopped at wall: ' + JSON.stringify(wallRun) };

      // 5b. Cliff edge (断崖台 has no walls): R cast at the edge facing away must bounce back in, not freeze at the edge
      for (const sd of [-1, 1]) for (const air of [false, true]) {
        startMapsMode(CHAR_IDX.lingque, 0, 'easy', false, 'cliff'); showScreen(null); paused = false; M.phase = 'fight';
        for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; }
        B.ctrl = new Ctrl();
        A.x = sd < 0 ? WALL + 20 : STAGE_W - WALL - 20; B.x = sd < 0 ? WALL + 400 : STAGE_W - WALL - 400;
        A.face = sd; B.face = -sd;
        if (air) { A.y = -150; A.state = 'air'; }
        const bHp = B.hp; A.skill2CD = 0; startSkill(A, B, 2);
        let n = 0; for (; n < 240 && A.state === 'skill'; n++) step();
        if (A.state === 'skill' || B.hp >= bHp) { const e = { side: sd, air, frames: n, state: A.state, x: Math.round(A.x), vx: Math.round(A.vx), bHp: B.hp }; M.map = null; return { pass: false, error: 'R froze at the cliff edge: ' + JSON.stringify(e) }; }
      }

      // 6. Block test: Blocking reduces damage, stops R, inflicts standing stun (not fall/knockdown), and cannot be Just Guarded
      startMatch('train', 'block', [CHAR_IDX.lingque, 0]);
      showScreen(null); paused = false; M.phase = 'fight';
      for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; f.breakCD = 0; }
      if (B.ctrl && B.ctrl.cfg) B.ctrl.cfg.act = 'block';
      A.x = STAGE_W / 2 - 200; B.x = STAGE_W / 2 + 200; A.face = 1; B.face = -1;
      A.skill2CD = 0; startSkill(A, B, 2);
      let blockedHit = false;
      const bHp0 = B.hp;
      for (let i = 0; i < 150 && A.state === 'skill'; i++) {
        B.ctrl.held.down = true;
        B.ctrl.held.left = false;
        B.ctrl.held.right = false;
        step();
        if (B.hp < bHp0) { blockedHit = true; break; }
      }
      if (!blockedHit) return { pass: false, error: 'R did not connect against blocking opponent' };
      const dmgTaken = bHp0 - B.hp;
      if (dmgTaken >= 30) return { pass: false, error: 'blocking did not reduce damage: dmg=' + dmgTaken };
      if (B.state !== 'hitstun') return { pass: false, error: 'blocked opponent was not stunned: state=' + B.state };
      if (B.y !== 0) return { pass: false, error: 'blocked opponent fell or launched: y=' + B.y };
      if (A.state === 'skill' && A.skPh === 1) return { pass: false, error: 'R was not stopped by block' };

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Breakout skills (受击可释放): Lei Ming Lei Kai, Tie Shan Quake, Yu Xiao Echo Wall can break out of hitstun, regular skills cannot, hard disables block it',
    fn: `(() => {
      // 1. Lei Ming (金刚雷铠 / stomp): Can break out of hitstun
      startMatch('train', 'stand', [0, CHAR_IDX.leiming]);
      showScreen(null); paused = false; M.phase = 'fight';
      for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; f.breakCD = 0; }
      B.state = 'hitstun'; B.t = 0; B.stun = 0.6; B.comboHits = 3; B.skill2CD = 0;
      B.ctrl.buf.skill2 = clock;
      step();
      if (B.state !== 'skill' || B.skill !== 'stomp' || !(B.thunderGuardT > 0)) {
        return { pass: false, error: 'Lei Ming Lei Kai did not break out of hitstun: state=' + B.state + ', skill=' + B.skill };
      }
      if (B.comboHits !== 0) return { pass: false, error: 'comboHits not reset on breakout' };

      // 2. Tie Shan (震地 / quake): Can break out of hitstun
      startMatch('train', 'stand', [0, CHAR_IDX.tieshan]);
      showScreen(null); paused = false; M.phase = 'fight';
      for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; f.breakCD = 0; }
      B.state = 'hitstun'; B.t = 0; B.stun = 0.6; B.comboHits = 2; B.skillCD = 0;
      B.ctrl.buf.skill = clock;
      step();
      if (B.state !== 'skill' || B.skill !== 'quake') {
        return { pass: false, error: 'Tie Shan Quake did not break out of hitstun: state=' + B.state + ', skill=' + B.skill };
      }

      // 3. Regular skill (Qing Feng 疾风斩 / gale): CANNOT break out of hitstun
      startMatch('train', 'stand', [1, CHAR_IDX.qingfeng]);
      showScreen(null); paused = false; M.phase = 'fight';
      for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; f.breakCD = 0; }
      B.state = 'hitstun'; B.t = 0; B.stun = 0.6; B.comboHits = 2; B.skillCD = 0;
      B.ctrl.buf.skill = clock;
      step();
      if (B.state === 'skill') {
        return { pass: false, error: 'Qing Feng gale broke out of hitstun when it lacks breakout flag' };
      }
      if (B.state !== 'hitstun') {
        return { pass: false, error: 'B did not remain in hitstun: state=' + B.state };
      }

      // 4. Hard disables (held / jail): Cannot break out even with Lei Kai ready
      startMatch('train', 'stand', [0, CHAR_IDX.leiming]);
      showScreen(null); paused = false; M.phase = 'fight';
      for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; f.breakCD = 0; }
      B.state = 'held'; B.t = 0; B.skill2CD = 0;
      B.ctrl.buf.skill2 = clock;
      step();
      if (B.state === 'skill') {
        return { pass: false, error: 'Lei Ming broke out while in held state' };
      }

      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Cixian (磁仙): seeded pole each round, Q swap clears R, ⊖ normals pull and demagnetize after 15, R blasts / pulls by distance, ult clamps',
    fn: `(() => {
      const setup = (pol, gap) => {
        startMatch('train', 'stand', [CHAR_IDX.cixian, 0]);
        showScreen(null); paused = false; M.phase = 'fight';
        for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; f.breakCD = 0; f.comboHits = 0; }
        A.x = STAGE_W / 2 - gap / 2; B.x = STAGE_W / 2 + gap / 2; A.face = 1; B.face = -1;
        A.pol = pol; A.mChain = 0; A.mT = 0; A.skillCD = 0; A.skill2CD = 0;
      };
      const run = (n, cond) => { for (let i = 0; i < n; i++) { step(); if (cond && cond()) return i; } return -1; };
      // 1. 极性：同一个种子抽到的一样，换种子两种都抽得到
      const roll = seed => { setChars(CHAR_IDX.cixian, 0); GRNG.s = seed; M.mode = 'cpu'; startRound(); return A.pol; };
      const seen = new Set();
      for (let sd = 1; sd <= 12; sd++) { const p1 = roll(sd * 7919), p2 = roll(sd * 7919); if (p1 !== p2) return { pass: false, error: 'same seed gave different poles' }; seen.add(p1); }
      if (!(seen.has(1) && seen.has(-1))) return { pass: false, error: 'pole roll never gave both poles: ' + [...seen] };
      // 2. Q：换极性、清零 R、不花出招时间、圈的动画计时
      setup(1, 300); A.skill2CD = 4; startSkill(A, B, 1);
      if (A.pol !== -1 || A.skill2CD !== 0 || A.state === 'skill' || !(A.polT > 0) || !(A.skillCD > 5)) return { pass: false, error: 'Q swap wrong: ' + JSON.stringify({ pol: A.pol, cd2: A.skill2CD, st: A.state, polT: A.polT, cd: A.skillCD }) };
      // 3. 负极普攻：打中往身边吸、四段循环；连中 15 下消磁（不再吸、推开），停手 1 秒恢复
      setup(-1, 150);
      let pulled = 0, hits = 0, last = B.hp, chainSeen = [];
      for (let i = 0; i < 900 && hits < 18; i++) {
        if (A.state === 'idle' || A.state === 'walk' || (A.state === 'attack' && A.hitConfirmed)) A.ctrl.press ? A.ctrl.press('light') : (A.ctrl.buf.light = clock);
        const bx = B.x; step();
        if (B.hp < last) { hits++; last = B.hp; chainSeen.push(A.mChain); if (hits <= 10 && B.vx < 0 && B.x <= bx + 1) pulled++; if (hits <= 10 && B.x - A.x < 110) B.x = A.x + 110; }   // 每下都从中距离打，才看得出吸
      }
      if (A.moves.l4.next.light !== 'l1') return { pass: false, error: 'l4 does not loop back to l1' };
      if (pulled < 5) return { pass: false, error: 'negative normals did not pull: ' + pulled + ' of ' + hits };
      if (!chainSeen.includes(MAG.chainCap) || A.mChain !== MAG.chainCap) return { pass: false, error: 'no demagnetize at 15: ' + chainSeen.join(',') };
      const mm = magHit(A, B, { ...A.moves.l1 });
      if (!(mm.kb[0] > 0) || !(mm.stun < A.moves.l1.stun)) return { pass: false, error: 'demagnetized hit still pulls or keeps full stun: ' + JSON.stringify(mm.kb) };
      toNeutral(A); A.mT = 0; run(Math.ceil(MAG.demagRest / STEP) + 10);
      if (A.mChain !== 0) return { pass: false, error: 'demagnetize did not recover after resting: ' + A.mChain };
      A.mChain = MAG.chainCap; A.skillCD = 0; startSkill(A, B, 1);
      if (A.mChain !== 0) return { pass: false, error: 'Q did not clear demagnetize' };
      // 4. 正极普攻：伤害更高、地上轻攻击击飞
      setup(1, 120); const pm = magHit(A, B, { ...A.moves.l1 });
      if (!(pm.dmg > A.moves.l1.dmg) || !pm.launch) return { pass: false, error: 'positive normal not stronger / not launching' };
      // 5. R 正极：弹开，越近越远
      const blast = gap => { setup(1, gap); startSkill(A, B, 2); run(40); return { vx: Math.abs(B.vx), st: B.state, dx: B.x - A.x, hit: B.hp < B.maxHp }; };
      const near = blast(70), far = blast(160);
      if (!near.hit || !far.hit) return { pass: false, error: 'R+ did not hit: ' + JSON.stringify([near, far]) };
      setup(1, 70); startSkill(A, B, 2); let nearV = 0; run(20, () => { nearV = Math.max(nearV, B.vx * Math.sign(B.x - A.x)); return false; });
      setup(1, 160); startSkill(A, B, 2); let farV = 0; run(20, () => { farV = Math.max(farV, B.vx * Math.sign(B.x - A.x)); return false; });
      if (!(nearV > farV && farV > 0)) return { pass: false, error: 'R+ should push away harder when closer: ' + nearV + ' vs ' + farV };
      // 6. R 负极：从 450 像素外吸到身前，定住 0.5 秒，不倒地
      setup(-1, 450); startSkill(A, B, 2);
      let rooted = -1; run(120, () => { if (B.rooted && B.state === 'hitstun') { rooted = clock; return true; } return false; });
      if (rooted < 0 || Math.abs(B.x - A.x) > 90 || B.y < -2) return { pass: false, error: 'R- did not pull in and root: ' + JSON.stringify({ d: B.x - A.x, st: B.state, y: B.y }) };
      if (Math.abs(B.stun - MAG.rMinusStun) > 0.01) return { pass: false, error: 'R- root time is ' + B.stun };
      let down = false; run(40, () => { if (['launched', 'knockdown'].includes(B.state)) down = true; return false; });
      if (down) return { pass: false, error: 'R- knocked the target down' };
      // 7. 大招：夹住、125 伤害、夹扁定身；对手无敌时夹不到
      setup(1, 400); A.meter = 100; B.hp = B.maxHp; const h0 = B.hp; startSpecial(A); run(200, () => A.state !== 'special');
      if (h0 - B.hp < 100 || !(B.squashT > 0 || B.state === 'hitstun')) return { pass: false, error: 'ult did not clamp: ' + JSON.stringify({ dmg: h0 - B.hp, st: B.state, sq: B.squashT }) };
      setup(1, 400); A.meter = 100; startSpecial(A); B.invul = 3; const h1 = B.hp; run(200, () => A.state !== 'special');
      if (B.hp < h1) return { pass: false, error: 'ult hit an invincible target' };
      if (B.state === 'held') return { pass: false, error: 'ult left the target held' };
      // 8. 断崖台：磁力直接挪人（负极 R、大招）也过不了崖边，不算坠崖
      mapVote = 'cliff'; startMapsMode(CHAR_IDX.cixian, 0, 'easy', true); M.phase = 'fight';
      if (M.map !== 'cliff') return { pass: false, error: 'map ' + M.map };
      B.state = 'held'; B.mapFalls = 0; magMove(B, WALL - 150);
      if (B.x !== WALL || B.mapFalls) return { pass: false, error: 'magnet moved a fighter past the cliff edge: ' + JSON.stringify({ x: B.x, falls: B.mapFalls }) };
      for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.invul = 0; }
      A.x = STAGE_W - WALL - 20; B.x = A.x - 420; A.face = -1; A.pol = -1; A.skill2CD = 0; B.mapFalls = 0; startSkill(A, B, 2);
      run(120, () => A.state !== 'skill');
      if (B.mapFalls || B.x < WALL || B.x > STAGE_W - WALL) return { pass: false, error: 'R- on the cliff map: ' + JSON.stringify({ x: B.x, falls: B.mapFalls }) };
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Qianji (千机): tether loop, attack redirection, breakout lash, and three-pass ultimate cap/reset',
    fn: `(() => {
      startMatch('train', 'stand', [CHAR_IDX.qianji, 0]);
      showScreen(null); paused = false; M.phase = 'fight';
      for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = 0; f.vy = 0; f.invul = 0; f.hp = f.maxHp; f.breakCD = 0; }
      A.x = STAGE_W / 2 - 320; B.x = STAGE_W / 2 + 280; A.face = 1; B.face = -1; projs.length = 0;
      A.skillCD = 0; startSkill(A, B, 1);
      for (let i = 0; i < 15; i++) step();
      let ball = projs.find(p => p.kind === 'ironball' && p.owner === A.idx && !p.dead);
      if (!ball || !ball.yoyo || ball.yoyoPhase !== 'loop') return { pass: false, error: 'Q did not create tethered loop ball' };
      A.skillCD = 0; toNeutral(A); startSkill(A, B, 1);
      if (A.state === 'skill' || projs.filter(p => p.kind === 'ironball' && p.owner === A.idx && !p.dead).length !== 1) return { pass: false, error: 'Q allowed duplicate owned balls' };

      let maxTether = 0;
      for (let i = 0; i < 300; i++) { step(); maxTether = Math.max(maxTether, Math.abs(ball.x - A.x)); }
      if ((ball.yoyoCycle || 0) < 1 || maxTether < STAGE_W * 0.34 || maxTether > STAGE_W || Math.abs(ball.vx) < 2000) return { pass: false, error: 'Loop failed to reach the map edge, return, or keep its faster speed: cycles=' + ball.yoyoCycle + ', distance=' + maxTether + ', vx=' + ball.vx };

      toNeutral(A); ball.x = A.x + 48; ball.y = A.y - 58; ball.yoyoPhase = 'staged'; ball.yoyoDir = -1; ball.vx = 0;
      startAttack(A, 'l1');
      for (let i = 0; i < 20; i++) step();
      if (ball.yoyoDir !== A.face || ball.yoyoBoostT <= 0) return { pass: false, error: 'Attack did not redirect and accelerate the tether ball' };

      toNeutral(A); ball.x = A.x + 60; ball.y = A.y - 58; A.face = 1;
      A.state = 'hitstun'; A.t = 0; A.stun = 0.6; A.comboHits = 3; A.skill2CD = 0; A.ctrl.buf.skill2 = clock;
      step();
      if (A.state !== 'skill' || A.skill !== 'ballspike' || ball.yoyoPhase !== 'lash') return { pass: false, error: 'R failed to lash and break out of hitstun' };
      for (let i = 0; i < 65; i++) step();
      if (ball.yoyoPhase !== 'loop' && ball.yoyoPhase !== 'lash') return { pass: false, error: 'R did not resume the Q loop' };

      toNeutral(A); A.hp = A.maxHp; B.hp = B.maxHp; A.meter = 100; A.skillCD = 9;
      ball.x = STAGE_W / 2; ball.y = B.y - 58; ball.yoyoDir = 1; ball.yoyoPhase = 'loop';
      startSpecial(A);
      let maxPasses = 0;
      for (let i = 0; i < 600 && A.state === 'special'; i++) { step(); maxPasses = Math.max(maxPasses, ball.yoyoPasses || 0); }
      const ultDamage = B.maxHp - B.hp;
      if (maxPasses < 3 || A.state === 'special' || ultDamage > 120 || A.skillCD > 0 || projs.some(p => p.kind === 'ironball' && p.owner === A.idx && !p.dead)) {
        return { pass: false, error: 'E did not complete three passes, cap damage, return the ball and reset Q: passes=' + maxPasses + ', damage=' + ultDamage + ', state=' + A.state + ', skillCD=' + A.skillCD };
      }

      A.meter = 100; A.skillCD = 5; startSpecial(A);
      for (let i = 0; i < 600 && A.state === 'special'; i++) step();
      if (A.state === 'special' || A.skillCD > 0 || projs.some(p => p.kind === 'ironball' && p.owner === A.idx && !p.dead)) return { pass: false, error: 'E could not summon, pass, and return a missing ball' };
      toMenu(); return { pass: true, error: null };
    })()`
  },
  {
    name: 'Qianji ball reaches map edges, scales damage with speed, strikes backs, drains posture, and respects guard-break protection',
    fn: `(() => {
      startMatch('train', 'stand', [CHAR_IDX.qianji, CHAR_IDX.tieshan]);
      showScreen(null); paused = false; M.phase = 'fight';
      for (const f of [A, B]) { toNeutral(f); f.y = 0; f.vx = f.vy = 0; f.invul = 0; f.ballGuardBreakT = 0; f.hp = f.maxHp; f.guard = f.maxGuard; }
      const left = WALL + 18; A.x = left + 26; A.face = -1; B.x = STAGE_W / 2; projs.length = 0;
      const ball = { kind: 'ironball', owner: A.idx, yoyo: true, yoyoPhase: 'loop', yoyoLeg: 'out', yoyoDir: -1, yoyoRange: 600, x: left + 4, y: -58, vx: -1800, vy: 0, g: 0, w: 36, h: 36, life: 999, age: 0, dmg: 24, hitCD: 0, yoyoHitAt: {} };
      projs.push(ball); updateProjs(); const wallReturned = ball.yoyoLeg === 'return' && ball.x === left;
      updateProjs(); const escapedWall = ball.x > left && ball.vx > 0;

      A.x = STAGE_W / 2 - 180; A.face = 1; B.x = STAGE_W / 2 + 180; B.y = 0; B.plat = -1; B.invul = 0; B.ballGuardBreakT = 0; B.state = 'idle'; B.guard = 100; B.hp = B.maxHp;
      applyHit(A, B, { dmg: 24, kb: [180, -120], stun: 0.24, hs: 0.06, guardDamage: 34, blockGuardDamage: 12, dir: 1 }, [B.x, B.y - 58]);
      const hitGuard = B.guard;
      B.state = 'block'; B.t = 0; B.blockT = 1; B.vx = 0; B.guard = 100; B.hp = B.maxHp; B.invul = 0; B.ballGuardBreakT = 0;
      applyHit(A, B, { dmg: 24, kb: [180, -120], stun: 0.24, hs: 0.06, guardDamage: 34, blockGuardDamage: 12, dir: 1 }, [B.x, B.y - 58]);
      const blockedGuard = B.guard;
      const frontBlockDamage = B.maxHp - B.hp;
      B.state = 'block'; B.t = 0; B.blockT = 1; B.vx = 0; B.guard = 100; B.hp = B.maxHp; B.invul = 0; B.ballGuardBreakT = 0; B.face = -1;
      ball.x = B.x + 16; ball.y = B.y - 58; ball.vx = -2300; ball.dmg = 24; ball.yoyoPhase = 'loop'; ball.yoyoHitAt = {}; ball.age = 2;
      resolveYoyoBallHits(ball, A, hurtbox(B));
      const backHitDamage = B.maxHp - B.hp, backBlockGuard = B.guard;
      B.state = 'idle'; B.t = 0; B.blockT = 1; B.vx = 0; B.guard = 100; B.hp = B.maxHp; B.invul = 0; B.ballGuardBreakT = 0;
      B.invul = 0.1; ball.x = B.x + 16; ball.y = B.y - 58; ball.vx = -1800; ball.dmg = 24; ball.yoyoHitAt = {}; ball.age = 2.5;
      resolveYoyoBallHits(ball, A, hurtbox(B));
      const standingInvulDamage = B.maxHp - B.hp;
      B.hp = B.maxHp; B.invul = 0;
      ball.x = B.x + 16; ball.y = B.y - 58; ball.vx = -900; ball.dmg = 24; ball.yoyoHitAt = {}; ball.age = 3;
      resolveYoyoBallHits(ball, A, hurtbox(B));
      const slowDamage = B.maxHp - B.hp;
      B.state = 'idle'; B.t = 0; B.blockT = 1; B.vx = 0; B.guard = 100; B.hp = B.maxHp; B.invul = 0; B.ballGuardBreakT = 0;
      ball.x = B.x + 16; ball.y = B.y - 58; ball.vx = -2500; ball.dmg = 24; ball.yoyoHitAt = {}; ball.age = 4;
      resolveYoyoBallHits(ball, A, hurtbox(B));
      const fastDamage = B.maxHp - B.hp;
      B.state = 'block'; B.t = 0; B.blockT = 1; B.vx = 0; B.guard = 1; B.hp = B.maxHp; B.invul = 0; B.ballGuardBreakT = 0;
      ball.x = B.x - 16; ball.y = B.y - 58; ball.vx = 2500; ball.yoyoPhase = 'loop'; ball.yoyoDir = 1; ball.yoyoHitAt = {}; ball.age = 2;
      const box = hurtbox(B); resolveYoyoBallHits(ball, A, box); const broke = B.guard === 0 && B.ballGuardBreakT >= 0.84;
      const hpAfterBreak = B.hp; resolveYoyoBallHits(ball, A, box); const protected = B.hp === hpAfterBreak;
      const ballGuardIndex = FK.indexOf('ballGuardBreakT'); A.ballGuardBreakT = 0.37;
      const rollbackState = ballGuardIndex >= 0 && snapF(A)[ballGuardIndex] === 0.37;
      toMenu();
      const ok = wallReturned && escapedWall && hitGuard <= 66 && blockedGuard <= 65 && backHitDamage > frontBlockDamage && backBlockGuard === 100 && standingInvulDamage > 0 && fastDamage > slowDamage && broke && protected && rollbackState;
      return { pass: ok, error: JSON.stringify({ wallReturned, escapedWall, hitGuard, blockedGuard, frontBlockDamage, backHitDamage, backBlockGuard, standingInvulDamage, slowDamage, fastDamage, broke, protected, rollbackState, guardTimer: B.ballGuardBreakT }) };
    })()`
  }
];
