function initArena2v2() {
  ARENA2V2.geysers = [{ x: 460, cd: 0 }, { x: STAGE_W - 460, cd: 0 }];
  ARENA2V2.altarTimer = 4.0;
  ARENA2V2.orb = { active: false, kind: 0, y: -55 };
  ARENA2V2.hazardTimer = 7.0;
  ARENA2V2.scars = [];
}
function updateArena2v2(dt) {
  if (M.phase !== 'fight') return;
  for (const g of ARENA2V2.geysers) {
    if (g.cd > 0) g.cd = Math.max(0, g.cd - dt);
    else {
      for (const f of allFighters()) {
        if (f.hidden || f.hp <= 0 || f.state === 'special' || f.state === 'knockdown') continue;
        if (Math.abs(f.x - g.x) < 46 && f.y > -45) {
          g.cd = 4.2;
          f.vy = -1040;
          f.y = Math.min(f.y, -4);
          f.state = 'air';
          f.jumps = 0;
          f.airDash = 1;
          f.skillCD = Math.max(0, f.skillCD - 1.5);
          ring(g.x, -10, 130, '120,245,215', 0.4);
          for (let k = 0; k < 14; k++) addP({ type: 'spark', x: g.x + rand(-28, 28), y: -rand(5, 60), vx: rand(-80, 80), vy: -rand(180, 420), life: 0.55, max: 0.55, rgb: '120,245,215', w: 2.2 });
          addP({ type: 'text', text: '🌪️ 御风灵泉 · 凌空', x: f.x, y: f.y - 110, life: 0.9, max: 0.9, rgb: '120,245,215' });
          SFX.dash();
          break;
        }
      }
    }
  }
  const cx = STAGE_W / 2;
  if (!ARENA2V2.orb.active) {
    ARENA2V2.altarTimer -= dt;
    if (ARENA2V2.altarTimer <= 0) {
      ARENA2V2.orb.active = true;
      ARENA2V2.orb.kind = (grnd() * 3) | 0;   // 影响对局结果，联机两边要算得一样：用对局随机数
      const names = ['🔥 朱雀神火 · 破军', '🌕 太阴灵丹 · 固本', '⚡ 紫微星魄 · 满怒'];
      const cols = ['255,120,70', '120,245,190', '190,140,255'];
      ring(cx, -65, 180, cols[ARENA2V2.orb.kind], 0.5);
      addP({ type: 'text', text: '剑坛赐福：' + names[ARENA2V2.orb.kind], x: cx, y: -150, life: 1.3, max: 1.3, rgb: cols[ARENA2V2.orb.kind] });
    }
  } else {
    for (const f of allFighters()) {
      if (f.hidden || f.hp <= 0) continue;
      if (Math.abs(f.x - cx) < 56 && Math.abs((f.y - 50) - (-60)) < 65) {
        const k = ARENA2V2.orb.kind;
        ARENA2V2.orb.active = false;
        ARENA2V2.altarTimer = 8.5;
        const shareList = (isRaid() && fighterTeam(f) === 0) ? sideFighters(0).filter(m => m.hp > 0) : [f];
        for (const mf of shareList) {
          if (k === 0) {
            mf.buffT = 4.5; mf.skillCD = 0; mf.skill2CD = 0;
            ring(mf.x, mf.y - 55, 170, '255,120,70', 0.45);
            addP({ type: 'text', text: shareList.length > 1 ? '🔥 同袍共享 · 朱雀狂暴' : '🔥 朱雀战魂 · 狂暴破招', x: mf.x, y: mf.y - 125, life: 1.1, max: 1.1, rgb: '255,130,80' });
          } else if (k === 1) {
            mf.hp = Math.min(mf.maxHp, mf.hp + Math.round(75 * HERO_HP_SCALE));
            mf.lagHp = Math.max(mf.lagHp, mf.hp);
            mf.guard = Math.min(mf.maxGuard, (mf.guard || 0) + 25);
            ring(mf.x, mf.y - 55, 170, '120,245,190', 0.45);
            addP({ type: 'text', text: shareList.length > 1 ? `🌕 同袍共享 · 灵丹 +${Math.round(75 * HERO_HP_SCALE)}` : `🌕 太阴灵丹 +${Math.round(75 * HERO_HP_SCALE)}`, x: mf.x, y: mf.y - 125, life: 1.1, max: 1.1, rgb: '120,245,190' });
          } else {
            mf.meter = 100; mf.armorT = 2.2; mf.armorHits = 3;
            ring(mf.x, mf.y - 55, 170, '190,140,255', 0.45);
            addP({ type: 'text', text: shareList.length > 1 ? '⚡ 同袍共享 · 绝技满盈' : '⚡ 紫微星魄 · 绝技满盈', x: mf.x, y: mf.y - 125, life: 1.1, max: 1.1, rgb: '195,145,255' });
          }
        }
        SFX.parry();
        break;
      }
    }
  }
  ARENA2V2.hazardTimer -= dt;
  if (ARENA2V2.hazardTimer <= 0) {
    ARENA2V2.hazardTimer = 11.5;
    const alive = allFighters().filter(f => !f.hidden && f.hp > 0);
    for (const t of alive) {
      const hx = clamp(t.x + (grnd() * 180 - 90), WALL + 80, STAGE_W - WALL - 80);
      ring(hx, -4, 95, '255,215,90', 0.5);
      addP({ type: 'text', text: '⚡ 天劫落雷', x: hx, y: -95, life: 0.65, max: 0.65, rgb: '255,220,100' });
      const foeSetter = foesOf(t)[0] || A;
      spawnProj(foeSetter, { kind: 'bolt', x: hx, y: -360, vx: 0, w: 68, h: 720, life: 0.72, delay: 0.52, dmg: 38, stun: 0.45, hs: 0.1, kb: [160, -480], launch: true, unblockable: false });
    }
  }
}

// ---------- 山河异境的地图（src/data/12-maps.js）----------
// 这一局在哪张图记在 M.map，跟着 M 进回滚存档和录像（st0），两边、回放里都一样。普通对战、排位没有 M.map，就是原来的平地
const mayhemOn = () => M.mode === 'mayhem' || (M.mode === 'replay' && REPLAY.on && REPLAY.m && REPLAY.m.mode === 'mayhem') || ((M.mode === 'tag3' || M.mode === '2v2' || M.mode === 'watch2v2' || M.mode === 'replay' || M.mode === 'net') && M.teamMutator === 'mayhem') || (netRoom() || {}).rule === 'mayhem';
const mapsOn = () => {
  if (M.mode === 'replay' && REPLAY.on) {
    const m = REPLAY.m || {};
    // Old recordings predate terrain in local team modes and must retain their original physics.
    return !!M.map && (typeof m.mapActive === 'boolean' ? m.mapActive : m.mode === 'maps' || m.kind === 'net');
  }
  return M.mode === 'maps' || (!!M.map && (M.mode === 'net' || M.mode === 'tag3' || M.mode === '2v2' || M.mode === 'watch2v2'));
};
const mapNow = () => (typeof kothOn === 'function' && kothOn()) ? KOTH_MAP : (typeof partyOn === 'function' && partyOn() && M.party && M.party.kind === 'sumo') ? PARTY_SUMO_MAP : ((mapsOn() && M.map && MAPS[M.map]) || null);
// 按票数选图：votes 是每位玩家投的地图 id（没投是 null），r 是 0~1 的随机数。没人投票时每张图一样
function mapOdds(votes) {
  const n = MAP_POOL.map(id => (votes || []).filter(v => v === id).length), sum = n.reduce((a, b) => a + b, 0);
  return MAP_POOL.map((id, i) => sum ? n[i] / sum : 1 / MAP_POOL.length);
}
function mapPick(votes, r) {
  const odds = mapOdds(votes);
  let acc = 0;
  for (let i = 0; i < odds.length; i++) { acc += odds[i]; if (r < acc) return MAP_POOL[i]; }
  return MAP_POOL[odds.length - 1];
}
// 联机用对局种子算出选图的随机数：两边种子一样，选出来的图就一样；不动对局随机数（GRNG），后面的对局照旧
const mapSeedRand = seed => (Math.imul((seed | 0) ^ 0x5bd1e995, 2654435761) >>> 0) / 4294967296;
function rollMap(seed = null) {
  const r = (seed !== null && seed !== undefined) ? mapSeedRand(seed) : Math.random();
  const idx = Math.floor(r * MAP_POOL.length) % MAP_POOL.length;
  return MAP_POOL[idx] || MAP_POOL[0];
}
// 脚下的抓地力：1 是普通地面；站在冰面上小于 1，越重越小（滑得越远），地利侠客有个下限。平台上不是冰面
function mapGrip(f) {
  const mp = mapNow(), ice = mp && mp.ice;
  if (!ice || f.y < 0) return 1;
  const u = f.x / STAGE_W;
  if (u < ice.from || u > ice.to) return 1;
  const w = (f.ch && f.ch.stat && f.ch.stat.weight) || 1, g = clamp(ice.grip / Math.pow(w, 0.9), 0.15, 0.6);
  const sure = ice.sure && ice.sure[f.ch.id] ? Math.max(g, ice.sure[f.ch.id]) : g;
  return mapScrollOn(f, 'shuang') ? Math.min(1, sure * 1.2) : sure;   // 寒系秘卷能在冰面上稳住身形
}
const mapIceX = () => { const ice = (mapNow() || {}).ice; return ice ? [ice.from * STAGE_W, ice.to * STAGE_W] : null; };
// 断崖台的崖边（代替两侧的墙）：自己走、跳、闪都过不去；被击飞，或硬直中被打得很快，越过崖边就坠崖：
// 扣一点气血（不会扣死）、弹回同一侧的崖边，弹回途中无敌。雾身越过崖边怎么处理留给离影自己定（传进来的 f 只要有 x、vx）
function mapEdge(f, cl) {
  if (f.x >= WALL && f.x <= STAGE_W - WALL) return;
  const side = f.x < WALL ? -1 : 1;
  const fav = mapFavOn(f);
  // 燕翎（地利）：羽行御风，坠崖伤害减半；勾陈/磁仙/凌霜对手更容易受制，流云空中不易失足
  let pushThresh = cl.push || 320;
  const flung = f.state === 'launched' || ((f.state === 'hitstun' || f.state === 'knockdown') && Math.abs(f.vx) > pushThresh);
  f.x = side < 0 ? WALL : STAGE_W - WALL;
  if (!flung || f.hp <= 0) {
    // 凌雀「移形换影」撞到崖边和撞墙一样借力弹回场内；只把速度清零的话它会贴在崖边一直冲、出不了招
    if (f.state === 'skill' && f.skill === 'shadowdash' && f.hp > 0) { f.vx = -side * Math.max(360, Math.abs(f.vx) * 0.85); if (f.y >= 0 && f.vy > 0) f.vy = -160; }
    else if (Math.sign(f.vx) === side) f.vx = 0;
    return;
  }
  if (cl.ko) {
    f.hp = 0;
    f.state = 'launched'; f.t = 0; f.vy = cl.vy || -520; f.vx = side * 120; f.invul = 99;
    f.mapFalls = (f.mapFalls || 0) + 1;
    if (M.combatStats && M.combatStats[f.idx]) M.combatStats[f.idx].falls++;
    if (RESIM) return;
    shake = Math.max(shake, 10); SFX.thud(); SFX.cliffFall();
    ring(f.x, f.y - 40, 90, '255,140,120', 0.45);
    addP({ type: 'text', text: '坠崖出局', x: f.x - side * 40, y: f.y - 110, life: 0.9, max: 0.9, rgb: '255,150,120' });
    return;
  }
  const dmgMul = (fav && f.ch.id === 'yanling') ? 0.5 : 1;
  const dmg = Math.round(f.maxHp * (cl.dmg || 0.06) * dmgMul);
  f.hp = Math.max(1, f.hp - dmg);
  f.x -= side * (cl.back || 30); f.y = Math.min(f.y, -40); f.vy = cl.vy || -820; f.vx = -side * 120;
  f.state = 'launched'; f.t = 0; f.invul = Math.max(f.invul || 0, cl.invul || 0.9);
  f.comboHits = 0; f.juggle = 0; f.spiked = false; f.bounced = false; f.wallBounced = true;
  f.mapFalls = (f.mapFalls || 0) + 1;
  if (M.combatStats && M.combatStats[f.idx]) M.combatStats[f.idx].falls++;
  if (RESIM) return;
  shake = Math.max(shake, 10); SFX.thud(); SFX.cliffFall();
  for (let i = 0; i < 12; i++) addP({ type: 'ink', x: f.x + rand(-30, 30), y: rand(-25, 15), vx: rand(-40, 40), vy: rand(30, 140), life: 0.7, max: 0.7, r: rand(3, 8), rgb: '40,45,60' });
  ring(f.x, f.y - 40, 90, '170,200,255', 0.4);
  for (let i = 0; i < 10; i++) addP({ type: 'spark', x: f.x + rand(-20, 20), y: rand(-30, 10), vx: -side * rand(40, 200), vy: -rand(120, 420), life: 0.5, max: 0.5, rgb: '190,210,255', w: 2 });
  addP({ type: 'text', text: '坠崖 -' + dmg, x: f.x - side * 40, y: f.y - 110, life: 0.9, max: 0.9, rgb: '190,210,255' });
}
// ---------- 平台：能站上去的台子（MAPS[..].plats）----------
// 站在哪个平台上记在侠客的 plat（序号，-1 是地上或空中），跟着侠客进回滚存档。站在平台上算「在地上」（onGround），
// 只是脚下那一层不是 0 而是台面高度：要知道离脚下多高用 airH，不要直接看 y
let mapPlatCache = null;
const mapPlats = () => {
  const mp = mapNow(), ps = mp && mp.plats;
  if (!ps) { mapPlatCache = null; return null; }
  if (!mapPlatCache || mapPlatCache.map !== mp || mapPlatCache.width !== STAGE_W) {
    mapPlatCache = { map: mp, width: STAGE_W, plats: ps.map(P => P.u === undefined ? P : { ...P, x: P.u * STAGE_W }) };
  }
  return mapPlatCache.plats;
};
function gndY(f) { const P = f.plat >= 0 && (mapPlats() || [])[f.plat]; return P ? P.y : 0; }
const airH = f => gndY(f) - f.y;
// 把人放到他现在的 x 上：plat 那个平台在脚下就站上去，不然回到地面（瞬移、被吸过来以后用）
function mapPutOn(f, plat) {
  const P = plat >= 0 && (mapPlats() || [])[plat];
  if (P && Math.abs(f.x - P.x) <= P.w / 2) { f.y = P.y; f.plat = plat; } else { f.y = 0; f.plat = -1; }
}
// 物理开头：往上跳了、被挪走了（y 对不上），就不算站在平台上了
function mapPlatKeep(f) {
  if (f.plat < 0) return;
  const P = (mapPlats() || [])[f.plat];
  if (!P || f.vy < 0 || Math.abs(f.y - P.y) > 0.5) f.plat = -1;
}
// 物理移动以后：走出台边就掉下去；往下落经过台面就站上去（从下往上跳是穿过去的，刚按 ↓ + 跳落下的那一小段也穿过去）
function mapPlatLand(f, oldY, wasAir) {
  const ps = mapPlats(); if (!ps) return;
  if (f.plat >= 0) {
    const P = ps[f.plat];
    if (Math.abs(f.x - P.x) > P.w / 2) f.plat = -1; else { f.y = P.y; if (f.vy > 0) f.vy = 0; }
    return;
  }
  if (f.vy <= 0 || f.dropT > 0 || f.state === 'held') return;
  for (let i = 0; i < ps.length; i++) {
    const P = ps[i];
    if (Math.abs(f.x - P.x) <= P.w / 2 && oldY <= P.y && f.y >= P.y) {
      f.y = P.y; f.plat = i;
      if (wasAir) onLand(f);
      if (f.vy > 0) f.vy = 0;
      return;
    }
  }
}
// 站在平台上按住 ↓ 再跳（电脑按 drop）：落下去，这一小段穿过平台
function mapDrop(f) {
  f.plat = -1; f.dropT = 0.25; f.y += 2; f.vy = Math.max(f.vy, 160); f.state = 'air';
}

// ---------- 地利侠客（MAPS[..].fav）、风、天雷、酒雾 ----------
const mapFavOn = f => !!(f && f.ch && ((mapNow() || {}).fav || {})[f.ch.id]);
const mapScrollOn = (f, school) => !!(typeof scOn === 'function' && scOn() && f && f.ch && typeof scCount === 'function' && scCount(f, school) > 0);
const mapSkillReach = f => {
  const mp = mapNow();
  if (!mp || !mapFavOn(f)) return 1;
  if (mp === MAPS.cliff && f.ch.id === 'gouchen' && f.skill === 'hook') return 1.2;
  if (mp !== MAPS.pagoda) return 1;
  if (f.ch.id === 'yuxiao' && f.plat >= 0) return 1.2;
  if (f.ch.id === 'liuyun' && f.y < -15) return 1.15;
  return 1;
};
const mapMagRange = (f, range) => {
  const mp = mapNow(), env = M.mapEnv;
  return mp && mp.thunder && env && env.tWarn > 0 && mapFavOn(f) && f.ch.id === 'cixian' ? range * 1.25 : range;
};
// 绯影的地利：站在飞檐上走得快 15%；寒潭冰面上疾行突进提速
const mapWalk = f => {
  if (!mapFavOn(f)) return 1;
  if (f.plat >= 0 && f.ch.id === 'feiying') return 1.15;
  if (M.map === 'ice' && f.ch.id === 'feiying') return 1.15;
  if (M.map === 'ice' && f.ch.id === 'qingfeng') return 1.15;
  return 1;
};
// 风：空中、走路、闪步的人被往风向推；燕翎（地利）顺风推一倍、逆风不推
function mapWind(f, onG) {
  const E = M.mapEnv, W = (mapNow() || {}).wind;
  if (!E || !W || E.wOn <= 0 || (onG && f.state !== 'dash' && f.state !== 'walk')) return;
  let push = W.push;
  if (f.ch.id === 'yanling' && mapFavOn(f)) push = Math.sign(f.vx) === E.wDir ? W.push * 2 : 0;
  f.vx += E.wDir * push * STEP;
}
// 顺风的飞行道具多飞一段；青锋/流云/墨羽（地利）顺风额外加成
function mapWindProj(p) {
  const E = M.mapEnv, W = (mapNow() || {}).wind;
  if (!E || !W || E.wOn <= 0 || Math.sign(p.vx) !== E.wDir) return;
  const o = fighterByIdx(p.owner);
  let k = 1;
  if (o && mapFavOn(o)) {
    if (o.ch.id === 'qingfeng') k = 2;
    else if (o.ch.id === 'liuyun' || o.ch.id === 'moyu') k = 1.3;
  }
  if (o && mapScrollOn(o, 'feng')) k *= 1.15;
  p.x += E.wDir * W.proj * k * STEP;
}
// 天雷劈下：离落点不到 r、脚离地面高过 60 的人。无敌、大招、被抓着、正在吸人的不劈（免得留下半截动作）
function mapThunder(T) {
  const tx = T.x * STAGE_W;
  for (const f of allFighters()) {
    if (f.hidden || f.hp <= 0 || Math.abs(f.x - tx) >= T.r || f.y > -60) continue;
    if (mapFavOn(f) && (f.ch.id === 'leiming' || f.ch.id === 'gouchen')) {
      if (f.ch.id === 'leiming') { f.meter = Math.min(100, (f.meter || 0) + 35); f.thunderGuardT = Math.max(f.thunderGuardT || 0, 3); }
      if (!RESIM) addP({ type: 'text', text: '引雷淬体', x: f.x, y: f.y - 120, life: 1, max: 1, rgb: '255,230,120' });
      continue;
    }
    if (f.invul > 0 || f.escInvul || f.state === 'special' || f.state === 'held' || (f.magTg !== undefined && f.magTg >= 0)) continue;
    let thunderDmg = T.dmg;
    if (mapFavOn(f) && f.ch.id === 'yuehua') thunderDmg = Math.round(thunderDmg * 0.5);
    toNeutral(f);
    f.hp = Math.max(1, f.hp - thunderDmg);
    f.vy = T.vy; f.vx = (Math.sign(f.x - tx) || 1) * 200; f.plat = -1;
    f.state = 'launched'; f.t = 0; f.comboHits = 0; f.juggle = 0; f.spiked = false; f.bounced = false;
    if (!RESIM) addP({ type: 'text', text: '天雷 -' + thunderDmg, x: f.x, y: f.y - 110, life: 0.9, max: 0.9, rgb: '255,210,90' });
  }
  if (RESIM) return;
  ring(tx, -120, 160, '255,230,120', 0.5); shake = Math.max(shake, 18); flashA = Math.max(flashA, 0.45); flashRGB = '255,240,150';
  for (let i = 0; i < 18; i++) addP({ type: 'spark', x: tx + rand(-90, 90), y: -120, vx: rand(-260, 260), vy: rand(-350, 100), life: 0.4, max: 0.4, rgb: '255,225,120', w: 3 });
  SFX.thunder(); SFX.thunderHit(1.2); SFX.terrainLightning();
}
// 每一步（step 里，侠客都动完以后）：风和天雷的计时、酒雾、地利特性增益
function mapTick(dt) {
  const mp = mapNow(), E = M.mapEnv;
  if (!mp || !E || M.phase !== 'fight') return;
  if (mp.wind) {
    if (E.wOn > 0) { E.wOn -= dt; if (E.wOn <= 0) { E.wOn = 0; E.wT = mp.wind.every; } }
    else if ((E.wT -= dt) <= 0) {
      E.wOn = mp.wind.last; E.wDir = (E.wN + M.round) % 2 ? -1 : 1; E.wN++;   // 东西风轮流，每回合换一个起头
      if (!RESIM) { addP({ type: 'text', text: E.wDir > 0 ? '疾风 · 东风' : '疾风 · 西风', x: STAGE_W / 2, y: -230, life: 1.2, max: 1.2, rgb: '140,245,190' }); SFX.dash(); }
    }
  }
  if (mp.thunder) {
    const T = mp.thunder;
    if (E.tWarn > 0) {
      E.tWarn -= dt;
      if (E.tWarn <= 0) { E.tWarn = 0; E.tT = T.every; mapThunder(T); }
      // 玉箫（地利）：天雷预警石坛回响，音律充能提速
      for (const f of allFighters()) {
        if (!f.hidden && f.hp > 0 && mapFavOn(f) && f.ch.id === 'yuxiao' && (f.notes || 0) < 3) {
          f.noteT = (f.noteT || 0) + dt * 0.5;
          if (f.noteT >= 2.5) { f.noteT = 0; f.notes = (f.notes || 0) + 1; }
        }
      }
    } else if ((E.tT -= dt) <= 0) {
      E.tWarn = T.warn;
      if (!RESIM) addP({ type: 'text', text: '天雷将至', x: T.x * STAGE_W, y: -260, life: 1.2, max: 1.2, rgb: '255,220,100' });
    }
  }
  for (const f of allFighters()) {
    if (f.hidden || f.hp <= 0) continue;
    if (!RESIM && mp.ice && mapGrip(f) < 1 && Math.abs(f.vx) > 140 && Math.random() < 0.12) {
      if (Math.random() < 0.04) SFX.iceSlide();
      addP({ type: 'spark', x: f.x, y: f.y - 3, vx: -f.vx * 0.2 + rand(-30, 30), vy: rand(-55, -10), life: 0.3, max: 0.3, rgb: '180,225,255', w: 2 });
    }
    if (mp.fog && f.y >= 0) {
      const u = f.x / STAGE_W;
      if (u >= mp.fog.from && u <= mp.fog.to) {
        const fav = mapFavOn(f);
        if (f.guard < f.maxGuard) f.guard = Math.min(f.maxGuard, f.guard + mp.fog.guard * (fav && f.ch.id === 'moyu' ? 2 : 1) * (mapScrollOn(f, 'mo') ? 1.15 : 1) * dt);
        if (fav && f.ch.id === 'zuixian') f.drunk = Math.min(100, (f.drunk || 0) + 12 * dt);
        if (fav && f.ch.id === 'yuehua' && f.sinceHit > 2 && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + 6 * HERO_HP_SCALE * dt);
        if (fav && f.ch.id === 'qianji') {
          if (f.skillCD > 0) f.skillCD = Math.max(0, f.skillCD - 0.2 * dt);
          if (f.skill2CD > 0) f.skill2CD = Math.max(0, f.skill2CD - 0.2 * dt);
        }
      }
    }
    if (f.plat >= 0 && mapFavOn(f)) {
      if (f.ch.id === 'lingque' && f.skill2CD > 0) f.skill2CD = Math.max(0, f.skill2CD - 0.3 * dt);
      if (f.ch.id === 'qianji' && f.skillCD > 0) f.skillCD = Math.max(0, f.skillCD - 0.15 * dt);
    }
    if (f.plat >= 0 && mapScrollOn(f, 'ying') && f.guard < f.maxGuard) f.guard = Math.min(f.maxGuard, f.guard + 1.5 * dt);
  }
}

const CN = ['', '一', '二', '三', '四', '五'];
let hitstop = 0, slowmo = 0, superFreeze = 0, superOwner = null, shake = 0, flashA = 0, flashRGB = '255,255,255', dimA = 0, paused = false;
let shakeDirX = 0, shakeDirY = 0; // 方向性屏幕震动向量 (Directional screen shake)
let debugHitbox = false;          // 仅训练场：判定框与帧优势实时透视 (F1 切换)
let announce = null;
const announceQueue = [];
const comboUI = [{ n: 0, dmg: 0, t: 0 }, { n: 0, dmg: 0, t: 0 }, { n: 0, dmg: 0, t: 0 }, { n: 0, dmg: 0, t: 0 }];

// 开场署名（停留时长 CREDIT 在 01-core.js）
let creditT = 0, creditPending = false;
