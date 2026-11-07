// 战斗测试第 50 组：2v2 本机三种组合、腾空闪的状态机、隐藏的会话控制、组队规则变体、开打前秘卷候选。
// 由 tools/tests/combat-test.mjs 按文件名顺序载入；每项 { name, fn }，fn 是在沙盒里执行的代码字符串，返回 { pass, error }。
// 找 bug 提示：测试失败时报的是 name，在本文件里搜这个 name 就能找到它的代码。
export default [
  {
    name: '2v2 has three local variants (you + AI ally, two players vs two AIs, two vs two): each starts, ends and replays frame-for-frame',
    fn: `(() => {
      const snap = () => JSON.stringify([A, B, C, D].map(f => [f.chIdx, f.state, Math.round(f.x), Math.round(f.y), Math.round(f.hp * 10)]));
      const out = [];
      for (const sub of ['p_cc', 'pp_cc', 'pp_pp']) {
        toMenu();
        const terrain = { p_cc: 'ice', pp_cc: 'bamboo', pp_pp: 'thunder' }[sub];
        M.map = terrain;
        bpStart('2v2', { subMode: sub, level: 'hard' });
        if (BP.steps.length !== 6) return { pass: false, error: sub + ': 2v2 BP should have 6 steps, got ' + BP.steps.length };
        for (const i of [0, 1, 2, 3, 4, 5]) bpApply(i);
        currentScreen = 'bp'; bpFinish();
        if (M.mode !== '2v2' || M.subMode !== sub) return { pass: false, error: sub + ': started ' + M.mode + '/' + M.subMode };
        if (M.map !== terrain || !mapNow() || !M.mapEnv || !REC.meta.mapActive) return { pass: false, error: sub + ': selected terrain not active or recorded' };
        const ai = f => f.ctrl instanceof AICtrl;
        const want = { p_cc: [false, true, true, true], pp_cc: [false, true, false, true], pp_pp: [false, false, false, false] }[sub];
        const got = [A, B, C, D].map(ai);
        if (JSON.stringify(got) !== JSON.stringify(want)) return { pass: false, error: sub + ': who is AI (A B C D) = ' + got };
        if (sub === 'p_cc' && A.ctrl !== human[0]) return { pass: false, error: 'p_cc: you should control A' };
        if (!REC.on || !REC.meta || !REC.meta.four || REC.meta.sub !== sub) return { pass: false, error: sub + ': 2v2 match is not being recorded' };
        // 录像要记下谁是玩家：回放里大家都是普通操控，玩家不能被当成电脑去配合队友
        if (JSON.stringify(REC.meta.pl) !== JSON.stringify(want.map(x => !x))) return { pass: false, error: sub + ': recorded players (A B C D) = ' + REC.meta.pl };
        // 四人对战的 3P、4P 也是真人：选目标按玩家的规则
        if (sub === 'pp_pp' && [B, D].some(cpuTeamwork)) return { pass: false, error: 'pp_pp: 3P / 4P pick targets like the computer' };
        if (sub === 'p_cc' || sub === 'pp_pp') {
          const rm = { ...REC.meta, ev: [], skins: ['', '', '', ''], names: ['a', 'b'] };
          startReplay(rm);
          const pl = [A, B, C, D].map(f => !cpuTeamwork(f));
          REPLAY.on = false;
          if (JSON.stringify(pl) !== JSON.stringify(rm.pl)) return { pass: false, error: sub + ': in the replay players (A B C D) = ' + pl + ', recorded ' + rm.pl };
          toMenu(); M.map = terrain; bpStart('2v2', { subMode: sub, level: 'hard' }); for (const i of [0, 1, 2, 3, 4, 5]) bpApply(i); currentScreen = 'bp'; bpFinish();
        }
        // 让电脑代替玩家出手，打一段，记下每一帧的局面
        for (const f of [A, B, C, D]) if (!ai(f)) f.ctrl = new AICtrl('hard');
        // 代打的电脑会配合队友选目标；回放要照这个来，不然就是在测“玩家规则”和“电脑规则”不一样
        REC.meta.pl = [A, B, C, D].map(f => !cpuTeamwork(f));
        const frames = [];
        for (let i = 0; i < 1800; i++) { step(); if (i % 50 === 49) frames.push(snap()); }
        const m = { ...REC.meta, ev: REC.ev.slice(), skins: ['', '', '', ''], names: ['a', 'b'] };
        // 打到分出胜负，看能不能结算
        B.hp = D.hp = 0; M.koWinner = 0; M.wins = [1, 0];
        for (let i = 0; i < 600 && M.phase !== 'end'; i++) step();
        for (let i = 0; i < 600 && M.phase !== 'end'; i++) { B.hp = D.hp = 0; step(); }
        if (M.phase !== 'end') return { pass: false, error: sub + ': match did not end (phase ' + M.phase + ')' };
        startReplay(m);
        if (!is2v2() || C.hidden || D.hidden) return { pass: false, error: sub + ': replay is not shown as 2v2' };
        const again = [];
        for (let i = 0; i < 1800; i++) { replayFrame(); if (i % 50 === 49) again.push(snap()); }
        const bad = frames.findIndex((x, i) => x !== again[i]);
        if (bad >= 0) return { pass: false, error: sub + ': replay drifts at frame ' + (bad + 1) * 50 + ': ' + frames[bad] + ' vs ' + again[bad] };
        out.push(sub);
        REPLAY.on = false;
      }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Escape (腾空闪) state machine: rise / hover invulnerability, cooldown, landing lag, and what blocks it (cooldown, held, own ult, drunk, not fighting)',
    fn: `(() => {
      startMatch('train', 'stand', [0, 1]);
      showScreen(null); paused = false; M.phase = 'fight';
      const reset = () => {
        toNeutral(A); A.x = STAGE_W / 2 - 200; A.y = 0; A.vx = A.vy = 0; A.invul = 0; A.escInvul = false; A.escMode = ''; A.airHover = 0;
        A.breakCD = 0; A.jailT = 0; A.drinkT = 0; A.hp = A.maxHp; A.stun = 0; A.rooted = false; A.airRecover = false; human[0].clear(); M.phase = 'fight';
      };
      const esc = () => { human[0].press('dash'); return tryEscape(A, B); };
      const cd = A.ch.escCD || BREAK_CD;
      // rise：从硬直里闪出来
      reset(); A.state = 'hitstun'; A.stun = 0.5; A.rooted = true;
      if (!esc()) return { pass: false, error: 'could not escape from hitstun' };
      if (A.escMode !== 'rise' || !A.escInvul || !(A.invul > 0) || A.state !== 'air' || A.rooted || A.stun) return { pass: false, error: 'rise escape state wrong: ' + JSON.stringify({ m: A.escMode, e: A.escInvul, i: A.invul, s: A.state, r: A.rooted }) };
      if (Math.abs(A.breakCD - cd) > 1e-9) return { pass: false, error: 'rise cooldown ' + A.breakCD + ' != escCD ' + cd };
      let landed = false;
      for (let i = 0; i < 240 && !landed; i++) { step(); if (A.onGround() && A.state === 'getup') landed = true; else if (!A.escInvul) return { pass: false, error: 'rise invulnerability ended in the air at frame ' + i }; }
      if (!landed || A.escInvul || A.invul > 0 || A.escMode) return { pass: false, error: 'landing did not end the escape with landing lag' };
      // 空中第三下被震飞（带受身）时闪：落地照样结束腾空闪，不会顶着腾空闪的无敌走受身那条路
      for (const mode of ['rise', 'hover']) {
        reset(); A.y = -200; A.state = 'launched'; A.airRecover = true; A.vy = -180;
        if (mode === 'rise') human[0].held.right = true;
        if (!esc() || A.escMode !== mode || A.airRecover) return { pass: false, error: mode + ' escape out of an air-recovery launch kept airRecover' };
        human[0].held.right = false;
        let ok = false;
        for (let i = 0; i < 300 && !ok; i++) { step(); ok = A.onGround() && A.state !== 'air'; }
        if (!ok || A.escInvul || A.invul > 0 || A.escMode) return { pass: false, error: mode + ' escape out of an air-recovery launch: landing kept the escape ' + JSON.stringify({ ok, e: A.escInvul, i: A.invul, m: A.escMode }) };
      }
      // rise 的无敌最长 ESC.riseMax 秒
      reset(); A.state = 'hitstun'; esc(); A.escT = ESC.riseMax - 0.001; escapeTick(A);
      if (A.escInvul) return { pass: false, error: 'rise invulnerability lasted past ESC.riseMax' };
      // 自己出手就结束无敌
      reset(); A.state = 'hitstun'; esc(); startAttack(A, 'a1');
      if (A.escInvul || A.invul > 0) return { pass: false, error: 'attacking out of an escape kept invulnerability' };
      // hover：空中不按方向
      reset(); A.y = -220; A.state = 'air';
      if (!esc() || A.escMode !== 'hover' || A.airHover !== ESC.hover || !(A.invul > 0)) return { pass: false, error: 'air escape did not hover: ' + A.escMode + ' ' + A.airHover };
      if (Math.abs(A.breakCD - Math.min(cd, ESC.hoverCdCap)) > 1e-9) return { pass: false, error: 'hover cooldown ' + A.breakCD };
      // 秘卷把悬停拉到 1.5 秒时，过了 riseMax 也还无敌，悬停结束才结束
      A.airHover = A.invul = 1.5; A.escT = ESC.riseMax + 0.05; escapeTick(A);
      if (!A.escInvul) return { pass: false, error: 'long hover lost invulnerability before the hover ended' };
      for (let i = 0; i < 200 && A.airHover > 0; i++) physics(A);
      if (A.escInvul || A.escMode) return { pass: false, error: 'hover end did not end the escape' };
      // 醉翁亭禁锢可以被腾空闪解除；后续更新不能把角色拉回亭子里的旧位置。
      reset(); A.state = 'hitstun'; A.stun = 1.5; A.rooted = true; A.jailT = 1.5; A.jailX = A.x;
      const pavilionX = A.jailX;
      if (escapeBlock(A)) return { pass: false, error: 'pavilion jail blocked Aerial Flash' };
      if (!esc() || A.jailT !== 0 || A.escMode !== 'rise' || A.rooted || A.state !== 'air') return { pass: false, error: 'Aerial Flash did not clear pavilion jail' };
      step();
      if (A.jailT !== 0 || A.state !== 'air' || A.rooted || A.x === pavilionX) return { pass: false, error: 'escaped fighter was snapped back or remained stuck: ' + JSON.stringify({ x: A.x, pavilionX, jailT: A.jailT, state: A.state, rooted: A.rooted }) };
      // 用不了的情况
      const blocked = [
        ['cd', () => { A.breakCD = 2; }], ['held', () => { A.state = 'held'; }], ['ult', () => { A.state = 'special'; }],
        ['drink', () => { A.drinkT = 1; }], ['phase', () => { M.phase = 'ko'; }], ['dead', () => { A.hp = 0; }],
      ];
      for (const [why, set] of blocked) {
        reset(); A.state = 'hitstun'; set();
        if (escapeBlock(A) !== why) return { pass: false, error: 'expected escape to be blocked by ' + why + ', got ' + escapeBlock(A) };
        if (esc()) return { pass: false, error: 'escaped although blocked by ' + why };
      }
      reset(); toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Hidden session control unlocks after twelve settings clicks and drives the player',
    fn: `(() => {
      secretEnabled = false; secretSettingsClicks = 0; secretBrain = null;
      for (let i = 0; i < 11; i++) secretSettingsClick();
      if (secretEnabled) return { pass: false, error: 'unlocked too early' };
      secretSettingsClick();
      if (!secretEnabled) return { pass: false, error: 'did not unlock on click 12' };
      startMatch('cpu', 'normal', [0, 1]); M.phase = 'fight';
      if (!secretBrain || secretBrain.lvKey !== 'god' || A.ctrl !== human[0]) return { pass: false, error: 'player controller or AI difficulty incorrect' };
      let calls = 0; secretBrain.think = (me, foe) => { calls++; human[0].press('light'); foe.lastComboHits = 42; };
      B.lastComboHits = 7; secretThink(A, true);
      if (calls !== 1 || B.lastComboHits !== 7 || human[0].buf.light === undefined) return { pass: false, error: 'input or rollback state incorrect' };
      secretEnabled = false; secretSettingsClicks = 0; secretBrain = null; human[0].clear(); toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Team mutators apply to both team formats and reset between matches',
    fn: `(() => {
      teamMutator = 'mayhem'; startTag3Match([0,2,4], [1,3,5], 'normal');
      if (!mayhemOn() || A.maxHp < 5000 || B.maxHp < 5000) return { pass: false, error: 'tag mayhem did not initialize' };
      teamMutator = 'chaos'; start2v2LocalCoop(0,2,1,3,'normal', true);
      if (!chaosOn() || mayhemOn() || !M.chaos) return { pass: false, error: '2v2 chaos did not initialize' };
      teamMutator = 'mayhem'; start2v2LocalCoop(0,2,1,3,'normal', true);
      if (![A,B,C,D].every(f => f.maxHp > 5000)) return { pass: false, error: 'mayhem did not initialize all four fighters' };
      teamMutator = 'normal'; startTag3Match([0,2,4], [1,3,5], 'normal');
      if (mayhemOn() || chaosOn()) return { pass: false, error: 'mutator leaked' };
      toMenu(); return { pass: true, error: null };
    })()`
  },
  {
    // 山河异境：每张图被选中的概率 = 得票 / 总票数，没人投票时一样；联机用种子算出的随机数两边相同
    name: 'Pre-match state produces deterministic hero-specific scroll candidates and validates choices',
    fn: `(() => {
      const a = preMatchCreate('ice', 123), b = preMatchCreate('ice', 123);
      if (!preMatchSetPicks(a, [[0, 1], [2]]) || !preMatchSetPicks(b, [[0, 1], [2]])) return { pass: false, error: 'valid picks rejected' };
      if (JSON.stringify(a) !== JSON.stringify(b)) return { pass: false, error: 'candidates are not deterministic' };
      if (a.mapId !== 'ice' || a.candidates[0][0].length !== 5) return { pass: false, error: 'map or candidates missing' };
      if ([...a.candidates[0][0], ...a.candidates[1][0]].includes('meter_bank')) return { pass: false, error: 'tower-only scroll entered competitive draft' };
      if (!a.candidates[0][0].includes(a.recommendations[0][0])) return { pass: false, error: 'recommendation is outside the candidate list' };
      const id = a.candidates[0][0][0];
      if (preMatchSelect(a, 0, 0, 'invalid') || preMatchSelect(a, 5, 0, id)) return { pass: false, error: 'invalid selection accepted' };
      if (!preMatchSelect(a, 0, 0, id) || a.selections[0][0] !== id || a.selections[0][1] !== null) return { pass: false, error: 'selection assigned to wrong hero' };
      const before = JSON.stringify(a);
      if (preMatchSetPicks(a, [[-1], [1]]) || JSON.stringify(a) !== before) return { pass: false, error: 'invalid picks changed state' };
      return { pass: true, error: null };
    })()`
  },
];
