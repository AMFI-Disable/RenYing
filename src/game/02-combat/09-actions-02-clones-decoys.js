// ======================= 腾空闪状态机 =======================
// 按冲刺键（左键 + 右键）触发，有两种：
//   rise  地上或挨打时：解除硬直、倒地、定身，向后上方闪起。无敌到落地、自己出手、开始飞，最长 ESC.riseMax 秒；落地有 ESC.landLag 秒落地硬直
//   hover 在空中不按方向：原地凝住 ESC.hover 秒（秘卷「凌霄御风」1.5 秒），悬停期间无敌，悬停结束或自己出手就结束
// 用不了的情况都在 escapeBlock 里：冷却没好、被抓住（投技、扯链、大招锁定）、自己在放大招、被灌醉（挨一下就醒）。醉翁亭可用腾空闪脱困。
// 冷却：rise 用侠客的 escCD（没写就是 BREAK_CD），hover 最多 ESC.hoverCdCap 秒；秘卷「轻身」「如履薄冰」在 esc 时机改冷却
// 被月华太阴绝罚、被月镜格开会把冷却顶到一个下限（见 03-skills.js 的 mirror、本文件的 parry）
const ESC = { riseMax: 1.1, hover: 0.85, hoverCdCap: 4.5, landLag: 0.15, riseVy: 1000, riseVx: 150 };
function escapeBlock(f) {
  if (f.hp <= 0) return 'dead';
  if (M.phase !== 'fight') return 'phase';
  if (f.breakCD > 0) return 'cd';
  if (f.state === 'held') return 'held';
  if (f.state === 'special') return 'ult';
  if (f.state === 'victory') return 'victory';
  if (f.drinkT > 0) return 'drink';
  return '';
}
// 每帧：rise 的无敌最长 ESC.riseMax 秒，开始飞（燕翎）也结束；hover 的无敌跟着悬停走（physics 里悬停结束就 endEscape）
function escapeTick(f) {
  if (!f.escInvul) return;
  f.escT += STEP;
  if (f.flying || (f.escMode !== 'hover' && f.escT > ESC.riseMax)) endEscape(f);
}
const ESC_FX = { qingfeng: 'wind', feiying: 'smoke', tieshan: 'quake', lingshuang: 'wind', liuyun: 'wind', leiming: 'bolt', moyu: 'ink', yuehua: 'moon', yanling: 'wing', yuxiao: 'wind', zuixian: 'smoke', gouchen: 'smoke', cixian: 'bolt', qianji: 'smoke' };
function tryEscape(f, foe) {
  if (escapeBlock(f)) return false;
  if (!f.ctrl.consume('dash')) return false;
  // 亭中留客会在 updateFighter 后段把目标钉回 jailX。清除禁锢再执行闪身，
  // 避免脱困后的物理更新仍被旧的 jail 状态拉回原位。
  f.jailT = 0;
  const noDir = !f.ctrl.held.left && !f.ctrl.held.right && !f.ctrl.held.down;
  const inAir = airH(f) > 15 || !f.onGround();
  if (inAir && noDir) {
    // 腾空·凌空凝势 (TengKong Air Freeze / Hover)
    f.breakCD = Math.min(f.ch.escCD || BREAK_CD, ESC.hoverCdCap);
    f.state = 'air'; f.t = 0; f.move = null; f.skill = null; f.sp = null; f.rooted = false; f.stun = 0;
    f.vx = 0; f.vy = 0;
    f.airHover = ESC.hover;
    f.escInvul = true; f.escMode = 'hover'; f.escT = 0; f.invul = f.airHover;
    f.juggle = 0; f.comboHits = 0; f.spiked = false; f.bounced = false; f.jumps = 1; f.rot = 0; f.armorT = 0;
    f.airRecover = false;   // 腾空闪接管这次下落：不然落地会走受身那条路，腾空闪的无敌不会结束
    f.beaconT = 0.5;
    delete f.ctrl.buf.light; delete f.ctrl.buf.heavy; f.ctrl.atkT = clock + 1e6;
    comboUI[foe.idx].t = Math.min(comboUI[foe.idx].t, 0.3);
    if (scOn()) scFire(f, 'esc', foe, true);
    const c = f.look.slash;
    ring(f.x, f.y - 50, 150, c, 0.5); ring(f.x, f.y - 50, 80, '255,255,255', 0.35);
    for (let i = 0; i < 24; i++) {
      const a = rand(0, Math.PI * 2), v = rand(80, 260);
      addP({ type: 'spark', x: f.x, y: f.y - 50, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, rgb: c });
    }
    addP({ type: 'text', text: '✨ 腾空·凌空凝势', x: f.x, y: f.y - 100, life: 1.0, max: 1.0, rgb: '235,245,255' });
    SFX.escape();
    SFX.chargeFull();
    return true;
  }
  const away = f.x >= foe.x ? 1 : -1;
  f.breakCD = f.ch.escCD || BREAK_CD;
  f.state = 'air'; f.t = 0; f.move = null; f.skill = null; f.sp = null; f.rooted = false; f.stun = 0;
  f.vy = -ESC.riseVy * (f.ch.id === 'yanling' ? 1.15 : f.ch.id === 'tieshan' ? 0.9 : 1); f.vx = away * ESC.riseVx; f.y = Math.min(f.y, -2);
  f.escInvul = true; f.escMode = 'rise'; f.escT = 0; f.invul = 99;
  f.juggle = 0; f.comboHits = 0; f.spiked = false; f.bounced = false; f.jumps = 1; f.rot = 0; f.armorT = 0;
  f.airRecover = false;
  f.beaconT = 0.5;
  delete f.ctrl.buf.light; delete f.ctrl.buf.heavy; f.ctrl.atkT = clock + 1e6;   // 松开左键前不会开始蓄力
  comboUI[foe.idx].t = Math.min(comboUI[foe.idx].t, 0.3);
  if (scOn()) scFire(f, 'esc', foe, false);
  const kind = ESC_FX[f.ch.id] || 'wind', c = f.look.slash;
  ring(f.x, f.y - 50, 100, c, 0.35); ring(f.x, f.y - 50, 50, '255,255,255', 0.25);
  for (let i = 0; i < 20; i++) { const a = rand(Math.PI * 0.15, Math.PI * 0.85), v = rand(200, 600); addP({ type: kind === 'smoke' || kind === 'ink' ? 'ink' : 'spark', x: f.x + rand(-20, 20), y: f.y - rand(10, 80), vx: Math.cos(a) * v * (Math.random() < 0.5 ? 1 : -1), vy: Math.sin(a) * v * 0.6, g: kind === 'ink' ? 900 : 0, life: 0.4, max: 0.4, r: rand(2, 4), rgb: kind === 'ink' || kind === 'smoke' ? '20,18,30' : c, w: 1.8, drag: 5 }); }
  if (kind === 'quake') { dust(f.x, 0, 16); shake = Math.max(shake, 6); }
  if (kind === 'smoke' || kind === 'ink') smoke(f.x, f.y - 40, 12);
  if (kind === 'bolt') { flashA = Math.max(flashA, 0.15); flashRGB = c; }
  SFX.escape();
  return true;
}
function endEscape(f) { if (f.escInvul) { f.escInvul = false; f.invul = 0; } f.escMode = ''; }
// 绝境受击反击（Breakout Skill）：在硬直/受击/浮空状态下消耗带 breakout 标记的技能反制脱困
function tryBreakoutSkill(f, foe) {
  if (f.hp <= 0 || M.phase !== 'fight') return false;
  if (f.state === 'held' || f.jailT > 0 || f.drinkT > 0 || f.state === 'special' || f.state === 'victory') return false;
  const isVictim = f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'launched';
  if (!isVictim) return false;
  const c = f.ctrl;
  if (!c || !c.consume) return false;
  for (const slot of [2, 1]) {
    const id = slot === 2 ? f.ch.skill2 : f.ch.skill;
    const cd = slot === 2 ? f.skill2CD : f.skillCD;
    const key = slot === 2 ? 'skill2' : 'skill';
    const S = SKILLS[id];
    if (S && S.breakout && cd <= 0 && c.consume(key)) {
      if (S.can && !S.can(f)) {
        if (f.idx === localIdx()) addP({ type: 'text', text: S.lack ? S.lack(f) : '还不能用', x: f.x, y: f.y - 120, life: 0.6, max: 0.6, rgb: '255,190,90' });
        continue;
      }
      f.comboHits = 0; f.juggle = 0; f.spiked = false; f.bounced = false; f.airRecover = false;
      f.stun = 0; f.rooted = false; f.rot = 0;
      delete c.buf.light; delete c.buf.heavy; c.atkT = clock + 1e6;
      comboUI[foe.idx].t = Math.min(comboUI[foe.idx].t, 0.3);

      ring(f.x, f.y - 50, 110, f.look.slash || '255,230,120', 0.4);
      ring(f.x, f.y - 50, 60, '255,255,255', 0.3);
      for (let i = 0; i < 12; i++) {
        const a = rand(0, Math.PI * 2), v = rand(100, 260);
        addP({ type: 'spark', x: f.x, y: f.y - 50, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, max: 0.35, rgb: f.look.slash || '255,230,120' });
      }
      addP({ type: 'text', text: '⚡ 破势受击 · 绝境反击', x: f.x, y: f.y - 110, life: 0.9, max: 0.9, rgb: '255,230,120' });
      SFX.escape();

      startSkill(f, foe, slot);
      if (slot === 2) f.skill2CD += 1.5; else f.skillCD += 1.5;
      f.breakCD = Math.max(f.breakCD, 2.0);
      return true;
    }
  }
  return false;
}
const decoys = [];
function updateDecoys() {
  for (const d of decoys) {
    d.life -= STEP;
    d.age += STEP;
    if (d.landed) d.rot += ((d.vr > 0 ? 1.4 : -1.4) * clamp((d.age - 0.25) / 0.35, 0, 1) - d.rot) * 0.2;
    if (!d.landed) {
      d.vy += GRAV * LAUNCH_GRAV * STEP; d.x += d.vx * STEP; d.y += d.vy * STEP; d.rot += d.vr * STEP;
      if (d.y >= 0) { d.y = 0; d.landed = true; d.vx = 0; d.age = 0.4; dust(d.x, 0, 6); SFX.wood(); }
    }
    if (d.life <= 0 && !d.gone) { d.gone = true; smoke(d.x, d.y - 40, 12); }
  }
  for (let i = decoys.length - 1; i >= 0; i--) if (decoys[i].gone) decoys.splice(i, 1);
}
// 攻击先打到假人：假人碎掉，这一刀作废
function hitDecoy(att, box) { hitClones(box, att.idx); if (hitDecoyBox(box, att.idx)) { att.hitDone = true; return true; } return false; }
// 击打场上的玄铁傀丸（击球加速与角度传动机制）
function hitBall(att, box, m) {
  for (const p of projs) {
    if (p.dead || p.kind !== 'ironball' || p.owner !== att.idx || !p.yoyo) continue;
    const bBox = [p.x - 28, p.y - 28, p.x + 28, p.y + 28];
    if (overlap(box, bBox)) {
      att.hitDone = true;
      const isDl = att.moveName === 'dl';
      const isCs = att.moveName === 'cs1' || att.moveName === 'cs2';
      const isAir = att.moveName === 'a1' || att.moveName === 'a2';
      const dir = att.face || 1;
      p.resting = false; p.yoyoPhase = 'loop'; p.yoyoLeg = 'out'; p.yoyoDir = dir;
      p.yoyoBoostT = 0.9; p.yoyoDmgT = 0.9; p.yoyoHitAt = p.yoyoHitAt || {}; p.yoyoHitAt[att.idx] = p.age;
      p.hitCD = 0.08; p.rehit = 0.15; p.unbreakable = true; p.g = 0;
      if (isDl) {
        // 下攻击挑球：高抛弧线球
        p.vx = dir * 1750; p.vy = -120; p.speedTier = 2; p.dmg = 34;
      } else if (isAir) {
        // 空中扣杀：斜向砸地剧烈反弹
        p.vx = dir * 1800; p.vy = 140; p.speedTier = 2; p.dmg = 36;
      } else if (isCs) {
        // 蓄力斩爆轰：高速重炮，贯穿力极强
        const spd = att.moveName === 'cs2' ? 2400 : 2000;
        p.vx = dir * spd; p.vy = 0; p.speedTier = 3; p.dmg = att.moveName === 'cs2' ? 48 : 40;
        shake = Math.max(shake, att.moveName === 'cs2' ? 14 : 9);
      } else {
        // 普攻推打：平推强力传动加速
        p.vx = dir * Math.min(2100, Math.max(1500, Math.abs(p.vx) + 300));
        p.vy = 0; p.speedTier = 2; p.dmg = 34;
      }
      if (scHas(att, 'qj_geardrive')) { p.yoyoBoostT = 1.1; p.yoyoGearBoost = true; p.dmg = Math.min(52, p.dmg * 1.2); p.yoyoDmgT = 1.1; }
      else p.yoyoGearBoost = false;
      p.bounceCount = 0;
      ring(p.x, p.y, 65, att.look.slash || '235,165,70', 0.35);
      for (let i = 0; i < 7; i++) {
        const a = rand(0, Math.PI * 2), v = rand(120, 280);
        addP({ type: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rgb: att.look.slash || '235,165,70', life: 0.2, max: 0.2 });
      }
      SFX.ballHit(); SFX.block();
      addP({ type: 'text', text: '击丸 · 传动', x: p.x, y: p.y - 40, life: 0.6, max: 0.6, rgb: '255,215,110' });
      return true;
    }
  }
  return false;
}
function hitDecoyBox(box, attIdx) {
  for (const d of decoys) {
    if (d.gone || d.owner === attIdx) continue;
    if (overlap(box, [d.x - 22, d.y - 100, d.x + 22, d.y + 2])) {
      d.gone = true;
      smoke(d.x, d.y - 50, 10);
      for (let i = 0; i < 14; i++) { const a = rand(-Math.PI, 0), v = rand(150, 500); addP({ type: 'ink', x: d.x, y: d.y - 50, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1500, life: 0.7, max: 0.7, r: rand(2, 4), rgb: '176,138,90' }); }
      hitstop = Math.max(hitstop, 0.04); SFX.wood();
      return true;
    }
  }
  return false;
}
// ======================= 雾身（离影） =======================
// 雾身存在主人身上（f.clones = [{ id, x, y, p, t, hp, maxHp, sub }]，t 是已经存在了几秒），回滚存档跟着侠客一起存、一起回；全程不用随机数。
// 规则的数都在 char.clone（src/data/heroes/13-liying.js）：最多 10 个（含本体留影与子影），存在 life 秒，离本体超过 leash 像素自己散。
// 雾身拥有高额生命值（默认本体留影 120 HP，子影 60 HP），受到对手攻击扣除自身血量；归零碎裂时产生「碎影自爆」造成反噬并附带短暂削弱。
// 雾身随本体出招释放内功波动飞刃，虽伤害偏低但直透防御、加剧对手架势耐力流失。
// 渡影（R）只能瞬移至本体真身所留雾身（!c.sub），并获得 0.25 秒霸体；发动时全场进入 0.5 秒时空凝滞（0.5x 减速）。
const cloneBox = c => [c.x - 22, (c.y || 0) - 100, c.x + 22, (c.y || 0) + 2];
let swapFreezeTimer = 0;
function triggerSwapFreeze(f, dur = 0.5) {
  swapFreezeTimer = Math.max(swapFreezeTimer, dur);
  if (!RESIM) {
    flashA = Math.max(flashA, 0.15);
    flashRGB = f.look && f.look.slash ? f.look.slash : '127,214,224';
    ring(f.x, f.y - 50, 110, f.look.slash || '127,214,224', 0.4);
  }
}
function plantClone(f, x) {
  const C = f.ch.clone || { max: 10, life: 15, hp: 120, subHp: 60 };
  if (!f.clones) f.clones = [];

  // 若场上已存在雾身：现有雾身同步复制本体出刀并在身后留下一具较弱的子影（sub: true）
  const existing = f.clones.slice();
  const baseHp = C.hp || 120;
  const subHp = C.subHp || 60;

  // 本体留下主真身雾身（sub: false，可以被 R 渡影瞬移）
  while (f.clones.length >= C.max) cloneGone(f, f.clones[0], false);
  f.cloneN = (f.cloneN || 0) + 1;
  const mainClone = {
    id: f.cloneN,
    x: clamp(x, WALL, STAGE_W - WALL),
    y: f.plat >= 0 ? gndY(f) : 0,
    p: f.plat,
    t: 0,
    hp: baseHp,
    maxHp: baseHp,
    sub: false
  };
  f.clones.push(mainClone);
  if (!RESIM && f.sk) CLONE_SK[f.idx + ':' + mainClone.id] = { sk: JSON.parse(JSON.stringify(f.sk)), dx: mainClone.x - f.x };
  if (!RESIM) { smoke(mainClone.x, mainClone.y - 40, 6); ring(mainClone.x, mainClone.y - 10, 46, f.look.slash, 0.3); }

  // 现有雾身复制留影：出刀并在各自后方留下一具子影（sub: true，不可渡影，较弱）
  if (existing.length > 0) {
    for (const ec of existing) {
      if (f.clones.length >= C.max) break;
      // 产生子影攻击剑气
      spawnCloneWave(f, ec.x, ec.y, f.face, 30);
      f.cloneN = (f.cloneN || 0) + 1;
      const subX = clamp(ec.x - f.face * 65, WALL, STAGE_W - WALL);
      const subClone = {
        id: f.cloneN,
        x: subX,
        y: ec.y || 0,
        p: ec.p,
        t: 0,
        hp: subHp,
        maxHp: subHp,
        sub: true
      };
      f.clones.push(subClone);
      if (!RESIM && f.sk) CLONE_SK[f.idx + ':' + subClone.id] = { sk: JSON.parse(JSON.stringify(f.sk)), dx: subClone.x - f.x };
      if (!RESIM) { smoke(subClone.x, (subClone.y || 0) - 30, 4); ring(subClone.x, (subClone.y || 0) - 10, 32, f.look.slash, 0.25); }
    }
  }
}
function cloneGone(f, c, broken) {
  const i = f.clones ? f.clones.indexOf(c) : -1; if (i < 0) return;
  if (!RESIM) {
    const rec = CLONE_SK[f.idx + ':' + c.id];
    if (rec && rec.sk) {
      CLONE_FADES.push({ sk: rec.sk, x: c.x, y: c.y || 0, owner: f.idx, tint: f.look.slash, at: performance.now(), sub: !!c.sub });
      if (CLONE_FADES.length > 24) CLONE_FADES.splice(0, CLONE_FADES.length - 24);
    }
  }
  f.clones.splice(i, 1);
  delete CLONE_SK[f.idx + ':' + c.id];
  if (broken) {
    // 碎影爆炸与削弱反噬 (Shadow Explosion & Debuff)
    const C = f.ch.clone || {};
    const bx = c.x, by = (c.y || 0) - 50;
    const boomR = 140;
    for (const foe of foesOf(f)) {
      if (!foe || foe.hp <= 0 || foe.invul > 0) continue;
      if (Math.abs(foe.x - bx) <= boomR && Math.abs(foe.y - (c.y || 0)) <= 120) {
        // 自爆反噬伤害与虚弱 Debuff（削减防御评级与加速架势消耗）
        foe.guard = Math.max(0, (foe.guard !== undefined ? foe.guard : foe.maxGuard) - 22);
        foe.slowT = Math.max(foe.slowT || 0, 2.0);
        foe.defDebuffT = Math.max(foe.defDebuffT || 0, 3.5);
        if (foe.hp > 1) {
          const dmg = Math.round(18 * (f.ch.bal ? f.ch.bal.skill || 1 : 1));
          foe.hp = Math.max(1, foe.hp - dmg);
          foe.sinceHit = 0; foe.lagDelay = 0.4;
        }
        if (!RESIM) {
          addP({ type: 'text', text: '破影震煞', x: foe.x, y: foe.y - 120, life: 0.8, max: 0.8, rgb: '255,90,90' });
          for (let k = 0; k < 6; k++) addP({ type: 'spark', x: foe.x, y: foe.y - 60 + rand(-20, 20), vx: rand(-180, 180), vy: rand(-120, 60), rgb: '255,100,100', life: 0.3, max: 0.3, w: 2 });
        }
      }
    }
    if (!RESIM) {
      ring(bx, by, 95, '255,80,80', 0.4);
      shake = Math.max(shake, 8);
      SFX.heavy();
    }
  }
  if (RESIM) return;
  smoke(c.x, (c.y || 0) - 50, broken ? 14 : 7);
  if (broken) { addP({ type: 'text', text: '破影爆', x: c.x, y: (c.y || 0) - 120, life: 0.6, max: 0.6, rgb: f.look.slash }); SFX.poof(); }
}
function clearClones(f) { for (const c of (f.clones || []).slice()) cloneGone(f, c, false); }
function cloneTick(f) {
  if (f.swapFreezeT > 0) f.swapFreezeT = Math.max(0, f.swapFreezeT - STEP);
  if (!f.clones || !f.clones.length) return;
  const C = f.ch.clone || { life: 0, leash: 0 };
  for (const c of f.clones.slice()) {
    c.t += STEP;
    if (!['attack', 'skill', 'special'].includes(f.state)) c.echoHitKey = '';
    if (c.t >= C.life || (C.leash > 0 && Math.abs(c.x - f.x) > C.leash) || f.hp <= 0) cloneGone(f, c, false);
  }
}
// 生成波状行进内功波动飞刃（Wave-like projectile emitting from shadows）
function spawnCloneWave(f, srcX, srcY, dir, dmg = 12) {
  const C = f.ch.clone || {};
  const waveDmg = Math.round(dmg * ((f.ch.bal && f.ch.bal.normal) || 1));
  spawnProj(f, {
    kind: 'wind',
    x: srcX + dir * 28,
    y: (srcY || 0) - 55,
    vx: dir * 980,
    vy: 0,
    w: 58,
    h: 52,
    life: 0.55,
    dmg: waveDmg,
    kb: [120, 0],
    stun: 0.24,
    hs: 0.05,
    cloneEcho: true,
    isWave: true,
    guardBreakMul: C.waveGuardMul || 2.2,
    unbreakable: true
  });
}
// 离影出招时，雾身在各自位置重放判定并释放行进的内功波动飞刃；透破防御并加剧架势消耗
function echoCloneAttack(f, hb, m, phase = '') {
  if (!f.clones || !f.clones.length || f.ch.passive !== 'mist' || !hb || !m || m.cloneEcho) return;
  const key = [f.state, f.moveName || '', f.skill || '', f.skPh || 0, f.spN || 0, f.spinN || 0, f.mChain || 0, phase, m.name || ''].join(':');
  const targets = foesOf(f);
  const C = f.ch.clone || {};
  const baseDmg = C.waveDmg || 12;

  for (const c of f.clones) {
    if (c.echoHitKey === key) continue;
    c.echoHitKey = key;

    // 释放波状内功气刃
    const waveDir = Math.sign(f.face) || 1;
    const waveDmg = c.sub ? Math.round(baseDmg * 0.7) : baseDmg;
    spawnCloneWave(f, c.x, c.y, waveDir, waveDmg);

    const dx = c.x - f.x, dy = (c.y || 0) - f.y;
    const cb = [hb[0] + dx, hb[1] + dy, hb[2] + dx, hb[3] + dy];
    for (const target of targets) {
      if (!target || target.hp <= 0 || target.invul > 0) continue;
      const hu = hurtbox(target);
      if (!overlap(cb, hu)) continue;
      // 内功削防与架势重击：较低直接伤害，高额架势削减
      const mirrorDmg = Math.round((m.dmg || 0) * (c.sub ? 0.35 : 0.50));
      const mirror = {
        ...m,
        dmg: mirrorDmg,
        cloneEcho: true,
        guardBreakMul: C.waveGuardMul || 2.2,
        srcX: c.x,
        dir: Math.sign(target.x - c.x) || f.face
      };
      applyHit(f, target, mirror, [(Math.max(cb[0], hu[0]) + Math.min(cb[2], hu[2])) / 2, (Math.max(cb[1], hu[1]) + Math.min(cb[3], hu[3])) / 2]);
      break;
    }
  }
}
// 攻击框碰到对手的雾身：雾身承受伤害，高血量被打散后引爆；攻击本身不受影响
function hitClones(box, attIdx, attackDmg = 35) {
  const att = fighterByIdx(attIdx);
  for (const o of foesOf(att)) {
    if (!o.clones || !o.clones.length) continue;
    for (const c of o.clones.slice()) {
      if (!overlap(box, cloneBox(c))) continue;
      const dmg = Math.max(25, attackDmg || 35);
      c.hp = (c.hp !== undefined ? c.hp : 120) - dmg;
      if (!RESIM) {
        ring(c.x, (c.y || 0) - 50, 42, att.look.slash, 0.2);
        addP({ type: 'text', text: `-${dmg}`, x: c.x, y: (c.y || 0) - 95, life: 0.5, max: 0.5, rgb: '230,245,255' });
      }
      if (c.hp <= 0) {
        cloneGone(o, c, true);
        att.meter = Math.min(100, (att.meter || 0) + ((o.ch.clone || {}).breakMeter || 0));
        if (typeof mapFavOn === 'function' && mapFavOn(o)) {
          if (M.map === 'bamboo') {
            o.meter = Math.min(100, (o.meter || 0) + 12);
          } else if (M.map === 'wine' && att.hp > 0) {
            att.guard = Math.max(0, att.guard - 15);
            att.vx = -att.face * 180;
            if (!RESIM) addP({ type: 'text', text: '雾震', x: c.x, y: (c.y || 0) - 100, life: 0.6, max: 0.6, rgb: o.look.slash });
          }
        }
      }
    }
  }
}
// 按 R 时换到哪个雾身：只能传送至本体留下的真身雾身（!c.sub）
// 支持方向选择；若未指定方向或未匹配到，则随机或按最近距离拣选一个真身雾身
function steerClone(f, foe) {
  const primaryClones = (f.clones || []).filter(c => !c.sub);
  if (!primaryClones.length) return null;
  const h = (f.ctrl && f.ctrl.held) || {};
  if (h.down) return primaryClones[0];
  const dir = (h.right ? 1 : 0) - (h.left ? 1 : 0);
  if (dir) {
    let best = null;
    for (const c of primaryClones) {
      const d = (c.x - f.x) * dir;
      if (d > 1 && (!best || d < (best.x - f.x) * dir)) best = c;
    }
    if (best) return best;
  }
  return null;
}
function cloneMark(f, foe) {
  let best = null;
  // 高亮显示真身雾身中离对手最近的
  const primaryClones = (f.clones || []).filter(c => !c.sub);
  for (const c of primaryClones) if (!best || Math.abs(c.x - foe.x) < Math.abs(best.x - foe.x)) best = c;
  return best;
}
function pickClone(f, foe) {
  const primaryClones = (f.clones || []).filter(c => !c.sub);
  if (!primaryClones.length) return null;
  const steered = steerClone(f, foe);
  if (steered) return steered;
  // 未按方向选择：随机授予一个真身雾身（在真身列表中随机选择）
  const idx = Math.floor(grnd() * primaryClones.length);
  return primaryClones[idx] || primaryClones[0];
}
function smoke(x, y, n) {
  for (let i = 0; i < n; i++) addP({ type: 'smoke', x: x + rand(-18, 18), y: y + rand(-30, 30), vx: rand(-90, 90), vy: rand(-90, 20), drag: 3, life: rand(0.4, 0.7), max: 0.7, r: rand(10, 22) });
}
