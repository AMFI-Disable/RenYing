// 战斗测试第 60 组：地图：投票概率、悬崖、冰面、平台、竹林风和雷坛、主场加成，以及雾身 / 磁极侠客在平台上的表现。
// 由 tools/tests/combat-test.mjs 按文件名顺序载入；每项 { name, fn }，fn 是在沙盒里执行的代码字符串，返回 { pass, error }。
// 找 bug 提示：测试失败时报的是 name，在本文件里搜这个 name 就能找到它的代码。
export default [
  {
    name: 'Map vote odds follow the vote count',
    fn: `(() => {
      const near = (a, b) => Math.abs(a - b) < 1e-9;
      const o = mapOdds(['cliff', 'cliff', 'ice']);
      if (!near(o[MAP_POOL.indexOf('cliff')], 2 / 3) || !near(o[MAP_POOL.indexOf('ice')], 1 / 3)) return { pass: false, error: 'two votes to one should be 2/3 and 1/3, got ' + o };
      if (!mapOdds([null, null]).every(x => near(x, 1 / MAP_POOL.length))) return { pass: false, error: 'no votes should be equal odds' };
      if (mapPick(['ice'], 0.999) !== 'ice' || mapPick(['cliff'], 0) !== 'cliff') return { pass: false, error: 'a single vote must always win' };
      const n = { cliff: 0, ice: 0 };
      for (let s = 1; s <= 3000; s++) n[mapPick(['cliff', 'cliff', 'ice'], mapSeedRand(s * 7919))]++;
      if (Math.abs(n.cliff / 3000 - 2 / 3) > 0.04) return { pass: false, error: 'seeded picks should land near 2/3, got ' + n.cliff / 3000 };
      if (mapSeedRand(12345) !== mapSeedRand(12345)) return { pass: false, error: 'seeded random is not stable' };
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'Terrain, scroll affinities, common Q/R reach and clone fade are connected',
    fn: `(() => {
      // Normalized platforms retain their position in wider team arenas.
      M.mode = '2v2'; M.map = 'thunder'; STAGE_W = 2600;
      const altar = mapPlats()[0];
      if (Math.abs(altar.x - STAGE_W * MAPS.thunder.thunder.x) > 1e-6) return { pass: false, error: 'thunder altar is misaligned: ' + altar.x };

      // Frost scrolls improve grip on ice and ink scrolls improve guard recovery in wine mist.
      M.hasBuffs = true; M.heroBuffs = [['frost_lock'], []]; M.mode = '2v2'; M.map = 'ice'; STAGE_W = 1800;
      A.x = STAGE_W / 2; A.y = 0; A.ch = CHARS[CHAR_IDX.tieshan];
      const baseGrip = clamp(MAPS.ice.ice.grip / Math.pow(A.ch.stat.weight || 1, 0.9), 0.15, 0.6);
      if (mapGrip(A) <= baseGrip) return { pass: false, error: 'frost scroll should improve ice traction' };
      M.heroBuffs = [['ink_resonance'], []]; M.map = 'wine'; M.mapEnv = { wT: 0, wOn: 0, wDir: 1, wN: 0, tT: 0, tWarn: 0 }; M.phase = 'fight'; A.ch = CHARS[CHAR_IDX.qingfeng];
      A.x = STAGE_W / 2; A.y = 0; A.plat = -1; A.guard = 0; mapTick(1);
      if (Math.abs(A.guard - MAPS.wine.fog.guard * 1.15) > 1e-9) return { pass: false, error: 'ink scroll should improve wine-mist guard recovery: ' + A.guard };

      // Skill melee hitboxes and horizontal skill/ultimate projectiles receive the same 15% reach increase.
      M.hasBuffs = false; M.mode = 'train'; M.map = null; startMatch('train', 'stand', [CHAR_IDX.qingfeng, CHAR_IDX.tieshan]);
      showScreen(null); paused = false; M.phase = 'fight'; toNeutral(A); toNeutral(B);
      A.state = 'skill'; A.hitDone = false; A.face = 1; A.x = 300; B.x = 416; B.y = 0; B.invul = 0; B.hp = B.maxHp;
      const hp = B.hp; strike(A, B, { box: [0, -100, 100, 0], dmg: 10, kb: [0, 0], stun: 0.1, hs: 0 });
      if (B.hp >= hp) { toMenu(); return { pass: false, error: 'the skill hitbox did not gain reach' }; }
      projs.length = 0; A.state = 'skill'; spawnProj(A, { kind: 'test', x: A.x, y: -50, vx: 500, life: 1, w: 10, h: 10, dmg: 1 });
      if (Math.abs(projs[0].life - 1.15) > 1e-9) { toMenu(); return { pass: false, error: 'skill projectile reach should be 1.15x: ' + projs[0].life }; }
      projs.length = 0;

      // Removing a clone creates only a visual fade snapshot, never simulation state.
      A.clones = []; plantClone(A, A.x); const clone = A.clones[0], fades = CLONE_FADES.length;
      cloneGone(A, clone, false);
      if (CLONE_FADES.length !== fades + 1 || A.clones.length) { toMenu(); return { pass: false, error: 'clone removal should enqueue a fade and remove the live clone' }; }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    // 断崖台：自己走不下崖；被击飞越过崖边坠崖，扣 6% 气血（不会扣死）、弹回台上、途中无敌
    name: 'Cliffside: walking stops at the edge, a launched fighter falls and comes back',
    fn: `(() => {
      mapVote = 'cliff'; startMapsMode(0, 1, 'easy', true); M.phase = 'fight';
      if (M.map !== 'cliff' || STAGE_W !== MAPS.cliff.w) return { pass: false, error: 'map ' + M.map + ' width ' + STAGE_W };
      A.x = WALL + 1; A.y = 0; A.vx = -400; A.state = 'walk'; physics(A);
      if (A.x !== WALL || A.mapFalls) return { pass: false, error: 'walking should stop at the edge: x ' + A.x + ' falls ' + A.mapFalls };
      const hp0 = A.hp; A.x = WALL + 1; A.y = -60; A.vx = -700; A.vy = 0; A.state = 'launched'; physics(A);
      const lost = hp0 - A.hp;
      if (A.mapFalls !== 1 || lost !== Math.round(A.maxHp * MAPS.cliff.cliff.dmg)) return { pass: false, error: 'fall should cost ' + Math.round(A.maxHp * MAPS.cliff.cliff.dmg) + ', lost ' + lost };
      if (!(A.x >= WALL) || A.vx <= 0 || A.vy >= 0 || A.invul < 0.5) return { pass: false, error: 'should bounce back inward and up with invulnerability' };
      A.hp = 2; A.x = STAGE_W - WALL - 1; A.state = 'launched'; A.vx = 700; physics(A);
      if (A.hp !== 1) return { pass: false, error: 'a fall must never finish a fighter, hp ' + A.hp };
      A.x = WALL + 1; A.vx = -900; A.state = 'blockstun'; A.mapFalls = 0; physics(A);
      if (A.mapFalls) return { pass: false, error: 'blocking at the edge must not fall' };
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    // 寒潭冰面：冰上停得慢，越重滑得越远；冰外和其他模式照旧
    name: 'Frozen Pond: ice slows stopping, heavier fighters slide further, other modes unchanged',
    fn: `(() => {
      const slide = (ci, x) => { setChars(ci, (ci + 1) % CHARS.length); A.x = x; A.y = 0; A.vx = 500; A.vy = 0; A.state = 'hitstun'; A.t = 0; A.stun = 9; const x0 = A.x; for (let i = 0; i < 30; i++) physics(A); return A.x - x0; };
      const sure = MAPS.ice.ice.sure || {};   // 地利侠客冰上站得稳，比的是普通侠客
      const heavy = CHARS.findIndex(c => c.stat.weight >= 1.3 && !sure[c.id]), light = CHARS.findIndex(c => c.stat.weight <= 0.85 && !sure[c.id]);
      mapVote = 'ice'; startMapsMode(0, 1, 'easy', true); M.phase = 'fight';
      if (M.map !== 'ice') return { pass: false, error: 'map ' + M.map };
      const mid = STAGE_W / 2, onIce = slide(heavy, mid), offIce = slide(heavy, WALL + 100);
      if (!(onIce > offIce * 1.5)) return { pass: false, error: 'ice should slide further: ice ' + onIce + ' vs ground ' + offIce };
      const lightIce = slide(light, mid);
      if (!(onIce > lightIce)) return { pass: false, error: 'heavier should slide further: heavy ' + onIce + ' vs light ' + lightIce };
      startMatch('cpu', 'easy', [heavy, 1]); M.map = 'ice'; M.phase = 'fight';
      const cpuMid = slide(heavy, STAGE_W / 2);
      if (Math.abs(cpuMid - offIce) > 1e-6) return { pass: false, error: 'maps must not apply outside the maps mode: ' + cpuMid + ' vs ' + offIce };
      startMapsMode(0, 1, 'easy', true, 'ice'); M.phase = 'fight';
      const ts = CHAR_IDX.tieshan, tsIce = slide(ts, mid), tsOff = slide(ts, WALL + 100);
      if (!(tsIce < onIce && tsIce < tsOff * 1.2)) return { pass: false, error: 'Tie Shan (home ground) should barely slide: ice ' + tsIce + ' vs ground ' + tsOff };
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    // 平台：从上面落下来站得住，站着不往下掉；从下面跳上去会穿过台面再落在上面；↓ + 跳落下去；走出台边掉下去；别的模式没有平台
    name: 'Map platforms: land from above, jump through from below, drop with down + jump, walk off the edge',
    fn: `(() => {
      startMapsMode(0, 1, 'easy', true, 'bamboo'); M.phase = 'fight';
      if (M.map !== 'bamboo') return { pass: false, error: 'the map picked at the draft must be used, got ' + M.map };
      const P = MAPS.bamboo.plats[0], run = (n, f = A) => { for (let i = 0; i < n; i++) physics(f); };
      A.x = P.x; A.y = P.y - 60; A.vx = 0; A.vy = 200; A.state = 'air'; A.plat = -1;
      run(40);
      if (A.plat !== 0 || A.y !== P.y || !A.onGround()) return { pass: false, error: 'should land on the platform: ' + JSON.stringify({ y: A.y, plat: A.plat }) };
      toNeutral(A); run(120);
      if (A.y !== P.y || A.plat !== 0) return { pass: false, error: 'standing on a platform must not sink: y ' + A.y };
      if (airH(A) !== 0) return { pass: false, error: 'airH on a platform should be 0, got ' + airH(A) };
      A.y = 0; A.plat = -1; A.vy = -JUMP_V; A.state = 'air';
      let crossed = false;
      for (let i = 0; i < 200 && !(A.plat === 0); i++) { physics(A); if (A.vy < 0 && A.y < P.y) crossed = true; }
      if (!crossed || A.plat !== 0) return { pass: false, error: 'a jump from below should pass through and land on top' };
      toNeutral(A); A.ctrl = human[0]; human[0].clear(); human[0].held.down = true; human[0].press('jump');
      neutral(A, B); human[0].held.down = false;
      if (A.plat !== -1 || !(A.dropT > 0)) return { pass: false, error: 'down + jump should drop through' };
      run(120);
      if (A.y !== 0) return { pass: false, error: 'dropping should fall all the way to the ground, y ' + A.y };
      A.x = P.x + P.w / 2 - 2; A.vx = 0; mapPutOn(A, 0); toNeutral(A); A.vx = 400; A.state = 'walk'; run(60);
      if (A.plat !== -1 || A.y !== 0) return { pass: false, error: 'walking off the edge should fall: ' + JSON.stringify({ y: A.y, plat: A.plat }) };
      startMatch('cpu', 'easy', [0, 1]); M.map = 'bamboo'; M.phase = 'fight';
      A.x = P.x; A.y = P.y - 60; A.vy = 200; A.state = 'air'; A.plat = -1; run(60);
      if (A.y !== 0 || A.plat !== -1) return { pass: false, error: 'other modes must not have platforms: y ' + A.y };
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    // 风和天雷：计时在 M.mapEnv；风推人、推飞行道具（青锋地利多推一倍）；天雷劈坛上的人（不会劈死），雷鸣地利不怕还回气；地上的人不劈
    name: 'Bamboo wind and Thunder Altar lightning: timed in the match state, home-ground heroes resist',
    fn: `(() => {
      startMapsMode(0, 1, 'easy', true, 'bamboo'); M.phase = 'fight';
      const E = M.mapEnv; E.wT = STEP / 2; mapTick(STEP);
      if (!(E.wOn > 0) || Math.abs(E.wDir) !== 1) return { pass: false, error: 'wind should start: ' + JSON.stringify(E) };
      setChars(CHAR_IDX.lingshuang, 1); A.x = 900; A.y = -200; A.vx = 0; A.vy = 0; A.state = 'air'; A.plat = -1; physics(A);
      if (Math.sign(A.vx) !== E.wDir) return { pass: false, error: 'wind should push fighters in the air: vx ' + A.vx };
      const shot = o => { const p = { owner: o.idx, x: 900, y: -60, vx: 600 * E.wDir, vy: 0 }; const x0 = p.x; mapWindProj(p); return Math.abs(p.x - x0); };
      const plain = shot(A); setChars(CHAR_IDX.qingfeng, 1); const fav = shot(A);
      if (!(plain > 0) || Math.abs(fav - plain * 2) > 1e-9) return { pass: false, error: 'tailwind boost ' + plain + ', Qing Feng ' + fav };
      startMapsMode(CHAR_IDX.liuyun, CHAR_IDX.leiming, 'easy', true, 'thunder'); M.phase = 'fight';
      const T = MAPS.thunder.thunder, P = MAPS.thunder.plats[0], E2 = M.mapEnv;
      A.x = P.x; mapPutOn(A, 0); toNeutral(A); A.invul = 0;
      B.x = P.x + 40; mapPutOn(B, 0); toNeutral(B); B.invul = 0; B.meter = 0;
      const ground = C.hidden ? null : C;
      const hpA = A.hp, hpB = B.hp;
      E2.tT = STEP / 2; mapTick(STEP);
      if (!(E2.tWarn > 0) || A.hp !== hpA) return { pass: false, error: 'lightning should warn first' };
      for (let i = 0; i < 400 && E2.tWarn > 0; i++) mapTick(STEP);
      if (A.hp !== hpA - T.dmg || A.state !== 'launched' || A.plat !== -1) return { pass: false, error: 'a fighter on the altar should be struck: ' + JSON.stringify({ lost: hpA - A.hp, st: A.state }) };
      if (B.hp !== hpB || B.meter !== 35 || !(B.thunderGuardT > 0)) return { pass: false, error: 'Lei Ming should be immune and gain meter: ' + JSON.stringify({ lost: hpB - B.hp, meter: B.meter }) };
      if (Math.abs(E2.tT - T.every) > 1e-9) return { pass: false, error: 'the next strike should be ' + T.every + 's away' };
      A.x = P.x; A.y = 0; A.plat = -1; toNeutral(A); A.invul = 0; A.hp = 5; E2.tWarn = STEP / 2; mapTick(STEP);
      if (A.hp !== 5) return { pass: false, error: 'someone on the ground under the altar must not be struck' };
      A.x = P.x; mapPutOn(A, 0); toNeutral(A); E2.tWarn = STEP / 2; mapTick(STEP);
      if (A.hp !== 1) return { pass: false, error: 'lightning must never finish a fighter, hp ' + A.hp };
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    // 醉翁墨阁的酒雾回定力（墨羽地利快一倍、醉翁地利涨醉意）；皇城飞檐不弹墙；绯影地利在飞檐上走得快
    name: 'Wine mist, palace eaves and the other home-ground bonuses',
    fn: `(() => {
      startMapsMode(CHAR_IDX.tieshan, CHAR_IDX.moyu, 'easy', true, 'wine'); M.phase = 'fight';
      const fog = MAPS.wine.fog, mid = STAGE_W / 2;
      for (const f of [A, B]) { f.x = mid; f.y = 0; f.plat = -1; f.guard = 10; }
      B.x = mid + 60; mapTick(1);
      if (Math.abs(A.guard - (10 + fog.guard)) > 1e-9 || Math.abs(B.guard - (10 + fog.guard * 2)) > 1e-9) return { pass: false, error: 'mist guard regen: ' + A.guard + ' / ' + B.guard };
      A.x = WALL + 50; A.guard = 10; mapTick(1);
      if (A.guard !== 10) return { pass: false, error: 'outside the mist there is no regen' };
      setChars(CHAR_IDX.zuixian, CHAR_IDX.moyu); A.x = mid; A.drunk = 0; mapTick(1);
      if (!(A.drunk >= 12 - 1e-9)) return { pass: false, error: 'Zui Weng should get drunk in the mist: ' + A.drunk };
      startMapsMode(CHAR_IDX.feiying, 1, 'easy', true, 'pagoda'); M.phase = 'fight';
      A.x = STAGE_W - WALL - 1; A.y = -80; A.vx = 700; A.vy = 0; A.state = 'launched'; A.plat = -1; physics(A);
      if (A.vx < 0) return { pass: false, error: 'the eaves have no pillars to bounce off: vx ' + A.vx };
      const P = MAPS.pagoda.plats[1];
      A.x = P.x; mapPutOn(A, 1); toNeutral(A);
      if (mapWalk(A) !== 1.15) return { pass: false, error: 'Fei Ying should walk faster on the eaves' };
      A.y = 0; A.plat = -1;
      if (mapWalk(A) !== 1) return { pass: false, error: 'the bonus is only on the eaves' };
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    // 离影的雾身留在平台上：位置记着那一层，渡影回去站在平台上；万影归一瞬移到平台上的对手身前。磁仙在平台上吸人，吸到自己那一层
    name: 'Clone and magnet heroes on platforms',
    fn: `(() => {
      const LY = CHAR_IDX.liying, CX = CHAR_IDX.cixian;
      startMapsMode(LY, CX, 'easy', true, 'pagoda'); M.phase = 'fight';
      const P = MAPS.pagoda.plats[0];
      A.x = P.x; mapPutOn(A, 0); toNeutral(A); A.clones = [];
      plantClone(A, A.x);
      const c = A.clones[0];
      if (!c || c.y !== P.y || c.p !== 0) return { pass: false, error: 'the clone should stand on the platform: ' + JSON.stringify(c) };
      if (cloneBox(c)[3] !== P.y + 2) return { pass: false, error: 'clone hurtbox should sit on the platform' };
      A.x = 900; A.y = 0; A.plat = -1; toNeutral(A);
      A.state = 'skill'; A.skill = 'mistswap'; A.skPh = 0; A.t = A.ch.clone.swapSeal; A.swapId = c.id;
      SKILLS.mistswap.update(A, B);
      if (A.x !== P.x || A.y !== P.y || A.plat !== 0) return { pass: false, error: 'swapping to a platform clone should land on it: ' + JSON.stringify({ x: A.x, y: A.y, plat: A.plat }) };
      physics(A);
      if (A.y !== P.y || A.plat !== 0) return { pass: false, error: 'should stay on the platform after the swap' };
      const Q = MAPS.pagoda.plats[2];
      B.x = Q.x; mapPutOn(B, 2); toNeutral(B);
      A.clones = []; A.state = 'special'; A.sp = 'cast'; A.spN = 0; A.t = 0.46;
      ULTS.mistarray.update(A, B);
      if (A.plat !== 2 || A.y !== Q.y) return { pass: false, error: 'the ult should blink onto the platform of the foe: ' + JSON.stringify({ y: A.y, plat: A.plat }) };
      startMapsMode(CX, 1, 'easy', true, 'pagoda'); M.phase = 'fight';
      A.x = P.x - 60; mapPutOn(A, 0); toNeutral(A); A.face = 1; A.pol = -1;
      B.x = P.x + 200; B.y = 0; B.plat = -1; toNeutral(B); B.invul = 0;
      const hp0 = B.hp;
      A.state = 'skill'; A.skill = 'magfield'; A.magN = -1; A.magTg = -1; A.skPh = 0; A.t = 0; A.hitDone = false;
      for (let i = 0; i < 200 && A.state === 'skill'; i++) { A.t += STEP; SKILLS.magfield.update(A, B); }
      if (!(B.hp < hp0)) return { pass: false, error: 'the pull should land' };
      if (B.plat !== 0 || B.y !== P.y) return { pass: false, error: 'pulled onto the platform of the caster: ' + JSON.stringify({ x: B.x, y: B.y, plat: B.plat }) };
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    // 离影渡影：路过的敌人挨一刀（约 95，打飞）；不在路上的不挨。磁仙正极普攻、正极 R 伤害比负极高很多
    name: 'LiYing swap path damage and CiXian polarity damage',
    fn: `(() => {
      startMatch('train', 'stand', [CHAR_IDX.liying, CHAR_IDX.qingfeng]);
      showScreen(null); paused = false; M.phase = 'fight';
      const swap = bx => {
        toNeutral(A); toNeutral(B); A.clones = []; A.x = 300; A.y = 0; A.plat = -1; A.face = 1;
        B.x = bx; B.y = 0; B.plat = -1; B.invul = 0; B.hp = B.maxHp; B.comboHits = 0;
        plantClone(A, 900); const c = A.clones[A.clones.length - 1];
        A.state = 'skill'; A.skill = 'mistswap'; A.skPh = 0; A.t = A.ch.clone.swapSeal; A.swapId = c.id;
        SKILLS.mistswap.update(A, B);
        return B.maxHp - B.hp;
      };
      const on = swap(600), off = swap(1400);
      if (A.x !== 900) { toMenu(); return { pass: false, error: 'the swap should still land on the clone' }; }
      if (on < 90 || on > 105) { toMenu(); return { pass: false, error: 'a foe on the path should take about 95, got ' + on }; }
      if (off !== 0) { toMenu(); return { pass: false, error: 'a foe off the path should take nothing, got ' + off }; }
      if (MAG.plusDmg < 1.8 || MAG.rPlusDmg < 75 || !(MAG.minusDmg > 0.55 && MAG.minusDmg < 0.7)) { toMenu(); return { pass: false, error: 'cixian polarity damage: ' + JSON.stringify(MAG) }; }
      toMenu();
      return { pass: true, error: null };
    })()`
  },
  {
    name: 'QingFeng and FeiYing ultimate travel distance (1.25x) and FeiYing aerial tracking',
    fn: `(() => {
      // 1. 青锋残月：突进速度 1750，总突进距离达到原版（280px）的 1.25 倍（约 350px）
      startMatch('train', 'stand', [CHAR_IDX.qingfeng, CHAR_IDX.tieshan]);
      showScreen(null); paused = false; M.phase = 'fight';
      toNeutral(A); toNeutral(B);
      A.x = 200; A.y = 0; A.face = 1; B.x = 2000; B.y = 0;
      A.meter = 100; startSpecial(A);
      const qfStart = A.x;
      for (let i = 0; i < 150 && A.state === 'special'; i++) step();
      const qfDist = A.x - qfStart;
      if (qfDist < 340 || qfDist > 365) { toMenu(); return { pass: false, error: 'QingFeng ult travel distance should be ~350px (1.25x of 280px), got ' + Math.round(qfDist) }; }
      toMenu();

      // 2. 绯影千影：空中追猎——对手在空中且在突进射程内（如 332px），绯影腾空追猎并触发千影
      startMatch('train', 'stand', [CHAR_IDX.feiying, CHAR_IDX.tieshan]);
      showScreen(null); paused = false; M.phase = 'fight';
      toNeutral(A); toNeutral(B);
      A.x = 300; A.y = 0; A.face = 1;
      B.x = 580; B.y = -180; B.state = 'launched'; B.invul = 0; B.vy = 0;
      A.meter = 100; startSpecial(A);
      let trackedAir = false;
      for (let i = 0; i < 150 && A.state === 'special' && A.sp !== 'flurry'; i++) {
        if (A.vy < -200 && A.y < -30) trackedAir = true;
        step();
      }
      if (!trackedAir) { toMenu(); return { pass: false, error: 'FeiYing ult should track upward towards airborne opponent' }; }
      if (A.sp !== 'flurry') { toMenu(); return { pass: false, error: 'FeiYing ult should reach airborne opponent and enter flurry, got ' + A.sp }; }
      toMenu();
      return { pass: true, error: null };
    })()`
  }
];
