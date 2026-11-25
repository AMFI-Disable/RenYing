// 战斗测试第 90 组：16v16 群雄会战、四象争锋（4v4v4v4）、团战统帅指挥系统（战术、相克、任务、电脑统帅）。
// 由 tools/tests/combat-test.mjs 按文件名顺序载入；每项 { name, fn }，fn 是在沙盒里执行的代码字符串，返回 { pass, error }。
// 找 bug 提示：测试失败时报的是 name，在本文件里搜这个 name 就能找到它的代码；游戏代码在 src/game/04-modes/22-modes-16-quad.js 和 22-modes-17-command.js。
export default [
  {
    name: '16v16 melee fields 32 fighters in two teams of 16, runs stably, and respects the ticket rules',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startMelee(16, 0, 'normal', 'normal');
      if (allFighters().length !== 32) return fail('Expected 32 visible fighters, got ' + allFighters().length);
      if (sideFighters(0).length !== 16 || sideFighters(1).length !== 16) return fail('Teams are not 16 and 16');
      if (STAGE_W < 5000) return fail('16v16 arena is too small: ' + STAGE_W);
      if (M.melee.tickets[0] !== 48 || M.melee.tickets[1] !== 48) return fail('Expected 48 tickets per team');
      if (new Set(allFighters().map(f => f.chIdx)).size < 30) return fail('Quick 16v16 reuses too many heroes');
      M.phase = 'fight';
      for (let i = 0; i < 600; i++) step();
      for (const f of allFighters()) {
        if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.hp)) return fail('NaN state on fighter ' + f.idx);
        if (f.x < 0 || f.x > STAGE_W) return fail('Fighter ' + f.idx + ' left the arena: ' + f.x);
      }
      if (projs.length > 400 || particles.length > 4000) return fail('Unbounded effects: ' + projs.length + ' projectiles, ' + particles.length + ' particles');
      const t0 = Date.now();
      for (let i = 0; i < 240; i++) step();
      const ms = (Date.now() - t0) / 240;
      globalThis.__ms16 = ms;
      if (ms > 12) return fail('A 16v16 simulation step takes ' + ms.toFixed(2) + ' ms (limit 12 ms for 120 Hz headroom)');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: '16v16 draft: 1 ban and 16 picks per side from 34 distinct heroes, launched into melee and rematched with the same teams',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      bpStart('melee', { teamSize: 16, level: 'normal' });
      if (!BP || BP.bansBySide[0].length !== 1 || BP.bansBySide[1].length !== 1) return fail('Expected one ban per side');
      if (BP.picks[0].length !== 16 || BP.picks[1].length !== 16) return fail('Expected 16 picks per side');
      while (BP && BP.step < bpSteps().length) bpApply(bpCpuChoice());
      const all = [...BP.bans, ...BP.picks[0], ...BP.picks[1]];
      if (all.some(x => x < 0) || new Set(all).size !== 34) return fail('The 16v16 draft did not end with 34 distinct heroes');
      const teams = BP.picks.map(t => t.slice());
      bpFinish();
      if (M.mode !== 'melee' || M.teamSize !== 16) return fail('bpFinish did not start 16v16');
      for (const side of [0, 1]) if (sideFighters(side).some((f, i) => f.chIdx !== teams[side][i])) return fail('Drafted heroes were not placed on team ' + side);
      $id('againBtn').click();
      if (M.mode !== 'melee' || M.teamSize !== 16 || sideFighters(1).some((f, i) => f.chIdx !== teams[1][i])) return fail('Rematch changed the 16v16 teams');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: '4v4v4v4 Quad Clash: four teams, per-team foes, corner spawns on two layers, ticket knockouts and last-team-standing ranking',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startQuad(4, 0, 'normal');
      if (M.mode !== 'quad' || allFighters().length !== 16) return fail('Quad did not field 16 fighters');
      if (teamCount() !== 4) return fail('teamCount is ' + teamCount());
      for (let t = 0; t < 4; t++) if (sideFighters(t).length !== 4) return fail('Team ' + t + ' does not have 4 fighters');
      if (fighterTeam(FIGHTERS[5]) !== 1 || fighterTeam(FIGHTERS[10]) !== 2 || fighterTeam(FIGHTERS[15]) !== 3) return fail('fighterTeam does not use idx % 4');
      const foes = foesOf(A);
      if (foes.length !== 12 || foes.some(e => fighterTeam(e) === 0)) return fail('Foes of A must be the 12 fighters of the three other teams');
      if (!battleMapOn()) return fail('Quad should use the layered battle map');
      const tops = allFighters().filter(f => f.y < -300).length;
      if (tops !== 8) return fail('Two teams (8 fighters) should start on the top deck, got ' + tops);
      if (new Set(M.quadSpots).size !== 4) return fail('Spawn spots are not a permutation');
      M.phase = 'fight';
      for (let i = 0; i < 480; i++) step();
      for (const f of allFighters()) if (!Number.isFinite(f.x) || !Number.isFinite(f.hp)) return fail('NaN on fighter ' + f.idx);
      // 同队的人打不到同队：把 B 队的人排在 A 旁边，A 的攻击框不能命中 B 队的任何人以外的队友
      const mate = FIGHTERS[4];
      if (findTargetsInBox(A, [mate.x - 50, mate.y - 120, mate.x + 50, mate.y], {}).includes(mate)) return fail('A teammate is hittable');
      // 兵力：打倒一个扣一点
      const before = M.quad.tickets[2];
      const victim = FIGHTERS[10]; victim.invul = 0; victim.hp = 1;
      applyHit(A, victim, { dmg: 50, kb: [100, -100], stun: 0.3, hs: 0.05 }, [victim.x, victim.y - 40]);
      updateMatch();
      if (M.phase !== 'fight' || M.quad.tickets[2] !== before - 1) return fail('Quad did not debit one ticket');
      // 把三方的兵力清零并打倒全部：只剩你这一队
      for (const t of [1, 2, 3]) { M.quad.tickets[t] = 0; for (const f of sideFighters(t)) f.hp = 0; }
      updateMatch();
      if (M.phase !== 'ko' || M.koWinner !== 0) return fail('The last team standing did not win');
      endRound();
      if (M.phase !== 'end') return fail('Quad did not end');
      if (M.quad.rank[0] !== 0) return fail('Ranking is wrong');
      // 全军覆没：你这队没了，立刻结束，名次里没有你的第一
      startQuad(4, 0, 'normal'); M.phase = 'fight';
      M.quad.tickets[0] = 0; for (const f of sideFighters(0)) f.hp = 0;
      updateMatch();
      if (M.phase !== 'ko' || M.koWinner === 0) return fail('Losing the whole team did not end the match with another winner');
      // 时间到：兵力多的赢
      startQuad(4, 0, 'normal'); M.phase = 'fight';
      M.quad.tickets = [5, 9, 7, 3]; M.timer = 0.001;
      updateMatch();
      if (M.phase !== 'ko' || M.koWinner !== 1) return fail('Time-up did not rank by tickets, winner ' + M.koWinner);
      endRound();
      $id('againBtn').click();
      if (M.mode !== 'quad') return fail('Rematch did not restart quad');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Quad ranking screen, team HUD and identity colours render without errors and never show the enemy tactic',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startQuad(4, 0, 'normal'); M.phase = 'fight';
      for (let i = 0; i < 60; i++) step();
      drawHUDQuad(20, W / 2); drawLargeMiniMap(20, W / 2); drawLocalCard(); drawCmdPanel(); drawQuadField();
      TAB_SCOREBOARD = true; drawTabScoreboard(); TAB_SCOREBOARD = false;
      for (const f of allFighters()) { const r = idRole(f); if (f !== A && fighterTeam(f) !== 0 && (!r || r.kind !== 'foe' || r.rgb !== QUAD_TEAMS[fighterTeam(f)].rgb)) return fail('Foe ' + f.idx + ' is not coloured by its team'); }
      M.phase = 'ko'; M.koWinner = 2; M.quad.rank = quadRanking(); quadShowEnd(2);
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Commander: each team gets one commander with +35% HP (yours is you), AI commanders are random, and the bonus survives respawn',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startMelee(8, 0, 'normal', 'normal');
      if (!M.cmd || M.cmd.team.length !== 2) return fail('No commander state in 8v8 melee');
      if (M.cmd.team[0].cmdr !== A.idx || !cmdIs(A)) return fail('The player must command their own team');
      const aiC = FIGHTERS[M.cmd.team[1].cmdr];
      if (!aiC || fighterTeam(aiC) !== 1 || human.includes(aiC.ctrl)) return fail('Enemy commander must be a computer fighter of team 1');
      const base = Math.round(aiC.ch.stat.hp * ((BAL[aiC.ch.id] || {}).hp || 1) * HERO_HP_SCALE);
      if (aiC.maxHp !== Math.round(base * CMD_HP_BONUS)) return fail('Commander HP bonus missing: ' + aiC.maxHp + ' vs ' + base);
      if (cmdTacticOf(0) !== null) return fail('The player team must start with no tactic');
      if (!CMD_TACTICS[cmdTacticOf(1)] && cmdTacticOf(1) !== 'spear') return fail('The computer team must start with a tactic');
      const seen = new Set();
      for (let k = 0; k < 40; k++) { startMelee(8, 0, 'normal', 'normal'); seen.add(M.cmd.team[1].cmdr); }
      if (seen.size < 3) return fail('Enemy commander is not random: ' + seen.size + ' distinct picks in 40 rounds');
      startMelee(8, 0, 'normal', 'normal'); M.phase = 'fight';
      const c = FIGHTERS[M.cmd.team[1].cmdr];
      c.hp = 0; updateMatch();
      c.hp = 0; for (let i = 0; i < 400; i++) { M.melee.respawn[c.idx] -= 0.01; updateMatch(); if (c.hp > 0) break; }
      if (c.hp <= 0) return fail('Commander did not respawn');
      const base2 = Math.round(c.ch.stat.hp * ((BAL[c.ch.id] || {}).hp || 1) * HERO_HP_SCALE);
      if (c.maxHp !== Math.round(base2 * CMD_HP_BONUS)) return fail('Commander lost the HP bonus after respawn');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Commander keys: 1/2/3 pick spear/wall/raid, Tab cycles, a fallen commander pauses the tactic, enemy tactics stay hidden',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startMelee(8, 0, 'normal', 'normal'); M.phase = 'fight';
      const keyed = (key, want) => { A.ctrl.press(key); updateFighter(A, foeOf(A)); return cmdTacticOf(0) === want; };
      if (!keyed('orderFocus', 'spear')) return fail('1 did not select spear');
      if (!keyed('orderProtect', 'wall')) return fail('2 did not select wall');
      if (!keyed('orderSpread', 'raid')) return fail('3 did not select raid');
      cmdCycleTactic(); if (cmdTacticOf(0) !== 'spear') return fail('Tab did not cycle raid -> spear');
      cmdCycleTactic(); if (cmdTacticOf(0) !== 'wall') return fail('Tab did not cycle spear -> wall');
      if (M.squadOrders[0] !== 'auto') return fail('Old squad orders must not be used while a commander exists');
      A.hp = 0;
      if (cmdTacticOf(0) !== null) return fail('A fallen commander must pause the tactic');
      A.hp = A.maxHp;
      // 战术牌只显示自己的战术：画一帧，不能抛错
      drawCmdPanel();
      // Tab 键开启/关闭交互式战队指挥面板，并可配置战术、阵型、集火与角色
      cmdTabDown();
      if (!teamCmdOpen()) return fail('Tab did not open the interactive team command panel');
      teamCmdSetTactic('raid');
      if (cmdTacticOf(0) !== 'raid') return fail('Command panel did not switch tactic to raid');
      teamCmdSetFormation('escort');
      if (M.teamFormation[0] !== 'escort') return fail('Command panel did not set formation');
      const enemy = sideFighters(1)[0];
      teamCmdSetFocus(enemy.idx);
      if (M.teamFocus[0] !== enemy.idx) return fail('Command panel did not set focus target');
      cmdTabDown();
      if (teamCmdOpen()) return fail('Second Tab press did not close the team command panel');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Tactic counters: spear beats wall, wall beats raid, raid beats spear (+18% / -12%), commander down removes the bonus',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startMelee(8, 0, 'normal', 'normal'); M.phase = 'fight';
      const a = FIGHTERS[2], b = FIGHTERS[3];
      const mul = (ta, tb) => { M.cmd.team[0].tactic = ta; M.cmd.team[1].tactic = tb; return cmdDmgMul(a, b); };
      const near = (x, y) => Math.abs(x - y) < 1e-9;
      if (!near(mul('spear', 'wall'), 1.05 * 0.93 * CMD_BEAT_MUL)) return fail('spear vs wall');
      if (!near(mul('wall', 'raid'), CMD_BEAT_MUL)) return fail('wall vs raid');
      if (!near(mul('raid', 'spear'), CMD_BEAT_MUL)) return fail('raid vs spear');
      if (!near(mul('wall', 'spear'), CMD_BEATEN_MUL)) return fail('wall vs spear');
      if (!near(mul('raid', 'wall'), CMD_BEATEN_MUL * 0.93)) return fail('raid vs wall');
      if (!near(mul('spear', 'raid'), 1.05 * CMD_BEATEN_MUL)) return fail('spear vs raid');
      if (!near(mul('wall', 'wall'), 0.93)) return fail('wall vs wall');
      if (!near(mul(null, 'raid'), 1)) return fail('no tactic must be neutral');
      // 真的打一下，伤害乘数起效
      M.cmd.team[0].tactic = 'raid'; M.cmd.team[1].tactic = 'spear';
      b.reset(b.x); b.invul = 0; const hp0 = b.hp;
      const hit = { dmg: 100, kb: [0, 0], stun: 0.1, hs: 0.02 };
      applyHit(a, b, hit, [b.x, b.y - 40]);
      const lost = hp0 - b.hp;
      b.reset(b.x); b.invul = 0; M.cmd.team[0].tactic = null; M.cmd.team[1].tactic = null;
      const hp1 = b.hp; applyHit(a, b, hit, [b.x, b.y - 40]);
      const plain = hp1 - b.hp;
      if (!(lost > plain * 1.1)) return fail('A countering hit must do clearly more damage: ' + lost + ' vs ' + plain);
      // 统帅倒下 → 双方都没有克制
      M.cmd.team[0].tactic = 'raid'; M.cmd.team[1].tactic = 'spear';
      FIGHTERS[M.cmd.team[1].cmdr].hp = 0;
      if (!near(cmdDmgMul(a, b), 1.0)) return fail('Fallen enemy commander should remove the counter bonus');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Tactics visibly change the computer teammates: spear focuses one foe, raid spreads over many, wall holds near the commander',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startMelee(8, 0, 'normal', 'normal'); M.phase = 'fight';
      const mates = sideFighters(0).filter(f => f !== A);
      const spread = tac => {
        M.cmd.team[0].tactic = tac;
        for (const f of mates) { f.cmdTgt = -1; f.cmdTgtT = 0; }
        for (let i = 0; i < 90; i++) { foeOf(A); for (const f of mates) f.hp > 0 && foeOf(f); cmdTick(); clock += STEP; }
        const counts = {};
        for (const f of mates) if (f.target) counts[f.target.idx] = (counts[f.target.idx] || 0) + 1;
        return { distinct: Object.keys(counts).length, top: Math.max(...Object.values(counts)) };
      };
      const sp = spread('spear'), rd = spread('raid');
      if (sp.top < Math.ceil(mates.length * 0.5)) return fail('Spear should put at least half the team on one target, top=' + sp.top);
      if (rd.distinct <= sp.distinct) return fail('Raid should use more distinct targets than spear: ' + rd.distinct + ' vs ' + sp.distinct);
      // 铁壁：电脑队友离统帅太远会往统帅身边收
      M.cmd.team[0].tactic = 'wall';
      const far = mates[0]; far.reset(A.x + 900); far.face = -1;
      for (const e of sideFighters(1)) e.reset(STAGE_W - WALL - 60);
      const cm = cmdAiMod(far, foeOf(far), 900);
      if (!cm || cm.dir !== -1) return fail('Wall teammates must walk back toward the commander');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Roles: Y selects a teammate, N cycles main/lure/peel, peel targets whoever is hitting an ally, main follows the commander lock',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startMelee(8, 0, 'normal', 'normal'); M.phase = 'fight';
      const mates = sideFighters(0).filter(f => f !== A);
      cmdSelectNext(0); if (M.cmd.sel !== mates[0].idx) return fail('Y did not select the first teammate');
      cmdRoleCycle(0); if (cmdRoleOf(mates[0]) !== 'main') return fail('First N should assign main');
      cmdRoleCycle(0); if (cmdRoleOf(mates[0]) !== 'lure') return fail('Second N should assign lure');
      cmdRoleCycle(0); if (cmdRoleOf(mates[0]) !== 'peel') return fail('Third N should assign peel');
      cmdRoleCycle(0); if (cmdRoleOf(mates[0]) !== 'auto' && M.cmd.role[mates[0].idx] !== 0) return fail('Fourth N should return to free');
      for (let i = 0; i < mates.length; i++) cmdSelectNext(0);
      if (M.cmd.sel !== -1) return fail('Y did not wrap back to the whole team');
      cmdRoleCycle(0);
      if (!mates.every(m => cmdRoleOf(m) === 'main')) return fail('N on the whole team did not apply to everyone');
      // 破连：队友被人打，peel 的人就去打那个敌人
      M.cmd.role.fill(0); M.cmd.team[0].tactic = 'wall';
      const victim = mates[0], helper = mates[1], bully = FIGHTERS[1];
      M.cmd.role[helper.idx] = 3;
      victim.cmdHitBy = bully.idx; victim.cmdHitT = clock;
      const dist = (x, y) => Math.abs(x.x - y.x);
      helper.cmdTgt = -1; helper.cmdTgtT = 0;
      const picked = cmdPickTarget(helper, foesOf(helper), dist);
      if (picked !== bully) return fail('Peel did not go after the foe hitting the ally');
      // 主攻：统帅锁定了谁就打谁
      const lockTo = FIGHTERS[7];
      A.lockIdx = lockTo.idx; A.target = lockTo;
      M.cmd.role[helper.idx] = 1; helper.cmdTgt = -1; helper.cmdTgtT = 0;
      if (cmdPickTarget(helper, foesOf(helper), dist) !== lockTo) return fail('Main did not follow the commander lock');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Computer commanders watch the other teams (focus / spread / huddle) and pick the counter tactic, better at higher levels',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startQuad(4, 0, 'god'); M.phase = 'fight';
      const C = M.cmd;
      if (!C || C.team.length !== 4) return fail('Quad needs four commanders');
      if (new Set(C.team.map(T => T.cmdr)).size !== 4) return fail('Commanders are not four different fighters');
      const aiTeam = 1;
      const set = (t, o) => { Object.assign(C.team[t].obs, o); };
      let right = 0;
      const trials = 200;
      for (const [guessObs, beaten] of [[{ focus: 0.8, spread: 200, n: 4 }, 'spear'], [{ focus: 0.1, spread: 900, n: 4 }, 'raid'], [{ focus: 0.1, spread: 80, n: 4 }, 'wall']]) {
        for (let i = 0; i < trials; i++) {
          for (const t of [0, 2, 3]) set(t, { n: 0, cx: 99999 });
          set(0, { ...guessObs, n: 4, cx: C.team[aiTeam].obs.cx + 100 });
          C.team[aiTeam].obs.n = 4; C.team[aiTeam].dealt = 0; C.team[aiTeam].taken = 1;
          C.team[aiTeam].tactic = null;
          cmdAiEval(aiTeam);
          if (cmdTacticOf(aiTeam) === CMD_BEATEN_BY[beaten]) right++;
        }
      }
      const acc = right / (trials * 3);
      if (acc < 0.6) return fail('A god-level commander should counter correctly most of the time: ' + acc.toFixed(2));
      startQuad(4, 0, 'easy');
      let right2 = 0;
      for (const [guessObs, beaten] of [[{ focus: 0.8, spread: 200, n: 4 }, 'spear'], [{ focus: 0.1, spread: 900, n: 4 }, 'raid'], [{ focus: 0.1, spread: 80, n: 4 }, 'wall']]) {
        for (let i = 0; i < trials; i++) {
          const D = M.cmd;
          for (const t of [0, 2, 3]) Object.assign(D.team[t].obs, { n: 0, cx: 99999 });
          Object.assign(D.team[0].obs, { ...guessObs, n: 4, cx: D.team[aiTeam].obs.cx + 100 });
          D.team[aiTeam].obs.n = 4; D.team[aiTeam].dealt = 0; D.team[aiTeam].taken = 1; D.team[aiTeam].tactic = null;
          cmdAiEval(aiTeam);
          if (cmdTacticOf(aiTeam) === CMD_BEATEN_BY[beaten]) right2++;
        }
      }
      if (!(right2 / (trials * 3) < acc)) return fail('A lower level should read the enemy worse');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Commander system stays out of the way in 1v1, 2v2, raid and training (no commander state, old squad orders still work)',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startMatch('cpu', 'normal', [0, 1]);
      if (M.cmd) return fail('1v1 must not have commanders');
      start2v2LocalCoop(0, 1, 2, 3, 'normal', true); M.phase = 'fight';
      if (M.cmd) return fail('2v2 must not have commanders');
      A.ctrl.press('orderFocus'); updateFighter(A, foeOf(A));
      if (M.squadOrders[0] !== 'focus') return fail('Old squad order 1 stopped working in 2v2');
      // 2v2 中 Tab 指挥面板也可用，且 AI 队友执行集火目标与阵型指令
      if (!teamCmdEligible()) return fail('2v2 with AI teammate must allow team command panel');
      toggleTeamCmdPanel(true);
      if (!teamCmdOpen()) return fail('Team command panel did not open in 2v2');
      const e2 = sideFighters(1)[1];
      teamCmdSetFocus(e2.idx);
      teamCmdSetFormation('escort');
      const ally = sideFighters(0).find(f => f !== A);
      if (foeOf(ally) !== e2) return fail('2v2 AI teammate did not honor explicit focus target');
      ally.x = A.x + 500; e2.x = A.x + 900;
      const sm = squadAiMod(ally, e2, 400);
      if (!sm || sm.dir !== -1) return fail('2v2 AI teammate did not honor escort formation');
      toggleTeamCmdPanel(false);
      if (teamCount() !== 2) return fail('2v2 must have two teams');
      startMatch('train'); if (M.cmd) return fail('Training must not have commanders');
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'BP in 3v3/5v5/8v8/16v16 only gives human bans and their own first pick while AI rapidly auto-picks the rest',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      for (const sz of [3, 5, 8, 16]) {
        bpStart('melee', { teamSize: sz, level: 'normal' });
        const steps = bpSteps();
        let humanBans = 0, humanPicks = 0;
        for (let i = 0; i < steps.length; i++) {
          BP.step = i;
          if (isMyTurnBP()) {
            if (steps[i][1] === 'ban') humanBans++;
            else humanPicks++;
          }
        }
        if (humanBans !== BP.bansBySide[0].length) return fail(sz + 'v' + sz + ' human ban turns mismatch: ' + humanBans);
        if (humanPicks !== 1) return fail(sz + 'v' + sz + ' human should only pick 1 hero, got ' + humanPicks);
        if (bpCpuDelayForStep() > 0.15) return fail(sz + 'v' + sz + ' AI pick delay too slow: ' + bpCpuDelayForStep());
      }
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'In-match Settings overlay stays in the match without returning to home, and 12-click secret AI keeps human inputs and 1/2/3 usable',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      startMelee(5, 0, 'normal', 'normal'); M.phase = 'fight';
      paused = true;
      showScreen('pause');
      settingsBack = 'pause';
      openScreen('settings');
      if (settingsBack !== 'pause') return fail('openScreen(settings) overwrote settingsBack during match');
      if (currentScreen !== 'settings') return fail('openScreen(settings) did not open settings');
      if (M.mode !== 'melee' || M.phase !== 'fight') return fail('Opening settings reset the active match');
      $id('setDone').click();
      if (currentScreen !== 'pause') return fail('Closing settings mid-match did not return to pause screen: ' + currentScreen);
      if (M.mode !== 'melee') return fail('Closing settings mid-match terminated the match');
      paused = false; showScreen(null);
      // 12-click secretEnabled: human combat input + 1/2/3 tactical options remain fully functional
      secretEnabled = true;
      secretNoteHumanInput('atk', true);
      if (!secretHumanActive()) return fail('Human combat input did not take priority over secret AI');
      secretNoteHumanInput('atk', false);
      A.ctrl.press('orderFocus');
      updateFighter(A, foeOf(A));
      if (cmdTacticOf(0) !== 'spear') return fail('Tactical option 1 failed while secretEnabled is active');
      A.ctrl.press('orderProtect');
      updateFighter(A, foeOf(A));
      if (cmdTacticOf(0) !== 'wall') return fail('Tactical option 2 failed while secretEnabled is active');
      A.ctrl.press('orderSpread');
      updateFighter(A, foeOf(A));
      if (cmdTacticOf(0) !== 'raid') return fail('Tactical option 3 failed while secretEnabled is active');
      secretEnabled = false;
      toMenu();
      return { pass: true };
    })()`
  },
  {
    name: 'Large-battle simultaneous ultimates (5v5, 8v8, 16v16) stay smooth with zero superFreeze, bounded hitstop/flash/shake, and no fullscreen paperFX hijack',
    fn: `(() => {
      const fail = error => ({ pass: false, error });
      for (const sz of [5, 8, 16]) {
        startMelee(sz, 0, 'normal', 'normal');
        M.phase = 'fight';
        const fs = allFighters();
        const casters = fs.slice(0, Math.min(6, fs.length));
        for (const f of casters) {
          f.meter = 100;
          startSpecial(f);
          if (superFreeze !== 0) return fail(sz + 'v' + sz + ': startSpecial set superFreeze=' + superFreeze);
        }
        let maxHs = 0;
        for (let i = 0; i < 180; i++) {
          step();
          if (superFreeze > 0) return fail(sz + 'v' + sz + ': superFreeze became ' + superFreeze + ' during simultaneous ults');
          if (hitstop > maxHs) maxHs = hitstop;
        }
        if (maxHs > 0.065) return fail(sz + 'v' + sz + ': hitstop exceeded large-battle cap: ' + maxHs);
        if (paperFX() !== null) return fail(sz + 'v' + sz + ': paperFX must be disabled in large-team battles');
        for (const f of fs) {
          if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.hp)) return fail(sz + 'v' + sz + ': NaN state on fighter ' + f.idx);
        }
      }
      toMenu();
      return { pass: true };
    })()`
  },
];
