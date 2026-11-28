// ======================= 动作 =======================
// 本文件：侠客能做的所有动作。
//   1. 基本动作：回到中立、出普攻、跳、冲刺、放大招（startSpecial / specialUpdate）
//   2. 技能执行：startSkill、招架、雷鸣的反击
//   3. 飞行道具（projs）：生成、移动、碰撞
//   4. 腾空闪（ESC 状态机）和受击中可放的技能（tryBreakoutSkill）
//   5. 替身、傀丸（decoys / hitBall）
//   6. 雾身（离影）：留影、渡影、碎裂、跟随
//   7. 蓄力斩、按键缓冲，以及每帧总入口 updateFighter 和物理 physics / 落地 onLand
// 找 bug 提示：每位侠客每帧都走 updateFighter：先看 f.state 是什么，再看对应的分支。
// 格挡时面向谁：平时面向对手；墨球蹴鞠里面向墨球（扑救）
function blockFace(f, foe) {
  const ref = cujuOn() && M.cuju && M.cuju.ball ? M.cuju.ball : foe;
  return Math.abs(ref.x - f.x) > 6 ? (ref.x >= f.x ? 1 : -1) : f.face;
}
function toNeutral(f) {
  f.move = null; f.sp = null; f.snap = false; f.skill = null; f.armorT = 0; f.parryT = 0; f.thunderGuardT = 0; f.rooted = false;
  f.state = f.onGround() ? 'idle' : 'air';
  if (f.onGround()) { f.juggle = 0; f.huiMaHits = 0; }
}
function startAttack(f, name) {
  endEscape(f);
  f.state = 'attack'; f.move = typeof stanceMove === 'function' ? stanceMove(f, name) : f.moves[name]; f.moveName = name; f.t = 0;
  if ((f.ch.passive === 'armor' || f.ch.passive === 'shell') && HEAVY_MOVES.includes(name)) { f.armorT = f.move.su + f.move.ac; f.armorHits = 1; }
  if (chaosNow('armor')) { f.armorT = Math.max(f.armorT, (f.move.su || 0.15) + (f.move.ac || 0.15)); f.armorHits = Math.max(f.armorHits, 1); }
  f.lunged = false; f.hitDone = false; f.hitTargets = []; f.hitConfirmed = false;
  const foe = foeOf(f), h = f.ctrl && f.ctrl.held, dir = h ? ((h.right ? 1 : 0) - (h.left ? 1 : 0)) : 0, a = dir || (h && h.aim);
  f.face = f.onGround() ? faceDir(f, foe) : ((a && !h.down && (SETTINGS.aim || !human.includes(f.ctrl))) ? a : f.face);
  const heavy = name === 'hv' || name === 'cs1' || name === 'cs2';
  if (heavy && f.badgeId === 'riposte' && f.badgeRiposteT > 0) {
    f.move = { ...f.move, lunge: (f.move.lunge || 0) + (f.badgeTier === 'purpgold' ? 58 : 48) };
    f.badgeRiposteT = 0; showBadgeCue(f, 'riposte', true);
  } else if (heavy && f.badgeId === 'breaker' && f.badgeTier === 'purpgold' && f.badgeBreakT > 0) {
    f.move = { ...f.move, lunge: (f.move.lunge || 0) + 52 };
    f.badgeBreakT = 0; showBadgeCue(f, 'breaker', true);
  }
  if (scOn()) scFire(f, 'atk', foe, name);
}
function doJump(f, dir) {
  const jumpBonus = (chaosNow('jump') || { val: 1 }).val;
  f.vy = (f.jumps === 0 ? -JUMP_V : -DJUMP_V) * (f.ch.stat.jump || 1) * jumpBonus; f.jumps++;
  f.vx = dir ? dir * wk(f) * 1.15 : f.vx * 0.5;
  f.state = 'air'; f.y = Math.min(f.y, -1);
  if (f.jumps >= 2) ring(f.x, f.y - 20, 36, f.look.slash, 0.35);
  dust(f.x, f.y, 6); SFX.jump();
  if (scOn()) scFire(f, 'jump', foeOf(f));
}
function startDash(f, dir) {
  f.state = 'dash'; f.t = 0; f.dashDir = dir; f.vx = DASH_V * (f.badgeId === 'breaker' && f.badgeBreakT > 0 ? 1.12 : 1) * dir; f.vy = 0;
  if (f.badgeId === 'breaker' && f.badgeBreakT > 0) { f.badgeBreakT = 0; showBadgeCue(f, 'breakerDash', true); }
  if (f.badgeId === 'pursuit') f.badgeDashT = 1.0;
  f.invul = 0.13; f.dashCD = DODGE_CD;
  if (f.onGround()) dust(f.x - dir * 20, f.y, 8);
  SFX.dash();
  if (scOn()) scFire(f, 'dash', foeOf(f));
}
function startBadgeDash(f, dir, kind) {
  endEscape(f);
  f.state = 'dash'; f.t = 0; f.dashDir = dir; f.vx = DASH_V * (kind === 'flow' ? 0.62 : kind === 'air' ? 1 : 0.72) * dir; f.vy = 0;
  f.badgeDashT = 0; f.dashCD = DODGE_CD;
  f.invul = kind === 'exit' && f.badgeTier === 'purpgold' ? 0.08 : 0;
  if (f.onGround()) dust(f.x - dir * 16, 0, 6);
  ring(f.x, f.y - 50, 82, f.look.slash || '233,196,106', 0.24); SFX.dash();
  if (scOn()) scFire(f, 'dash', foeOf(f));
}
function startSpecial(f) {
  endEscape(f);
  if (f.ch.passive === 'drunk') f.drunk = Math.min(100, (f.drunk || 0) + 30);
  f.face = faceDir(f, foeOf(f));
  f.meter = 0; f.state = 'special'; f.sp = 'charge'; f.t = 0; f.invul = 99; f.vx = 0; f.spFace = f.face;
  const large = isLargeTeam();
  const isLocal = f.idx === localIdx();
  // 大型团战（3v3/5v5/8v8/16v16/四象）多人同时开大时跳过全屏定格，保证战场流畅不卡顿
  if (!large) { superFreeze = 0.5; superOwner = f; }
  if (!RESIM) {
    dimA = Math.max(dimA, large ? (isLocal ? 0.28 : 0.14) : 1);
    flashA = Math.max(flashA, large ? (isLocal ? 0.14 : 0.06) : 0.35);
    flashRGB = f.look.slash;
    const ultName = skinUltName(f) || ULTS[f.ch.ult].name;
    if (!large || isLocal) {
      say(ultName, large ? 0.65 : 0.9, 'super');
      SFX.superOn();
      const ultPitch = f.ch.stat && f.ch.stat.weight > 1.1 ? 0.8 : 1.15;
      SFX.voiceUlt(ultPitch);
    } else {
      addP({ type: 'callout', text: ultName, x: f.x, y: f.y - 125, life: 0.75, max: 0.75, rgb: f.look.slash || '233,196,106', scale: 1.55 });
    }
    if (CHAR_RARITY[f.ch.id] === 'legend') { ring(f.x, f.y - 60, large ? 150 : 210, '233,196,106', 0.45); ring(f.x, f.y - 60, large ? 105 : 150, f.look.slash, 0.4); if (!large || isLocal) flashRGB = '233,196,106'; }
    ring(f.x, f.y - 60, large ? 96 : 120, f.look.slash, 0.42);
  }
  if (scOn()) { scFire(f, 'ult', foeOf(f)); scFire(foeOf(f), 'foeUlt', f); }
  if (mayhemOn() && !RESIM) {
    shake = Math.max(shake, large ? (isLocal ? 10 : 5) : 32);
    flashA = Math.max(flashA, large ? (isLocal ? 0.16 : 0.08) : 0.65);
    if (!large || isLocal) flashRGB = '255,225,120';
    ring(f.x, f.y - 60, large ? 170 : 320, '255,215,80', large ? 0.42 : 0.7);
    if (!large) {
      ring(f.x, f.y - 60, 480, f.look.slash, 0.65);
      slashLine(f.x, f.y - 60, 0, f.look.slash);
      slashLine(f.x, f.y - 60, Math.PI / 2, '255,240,180');
      slashLine(f.x, f.y - 60, rand(-0.7, 0.7), f.look.slash);
    }
    const spN = large ? 10 : 30;
    for (let i = 0; i < spN; i++) {
      const a = rand(0, 6.28), v = rand(200, large ? 460 : 720);
      addP({ type: 'spark', x: f.x, y: f.y - 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: large ? 0.45 : 0.7, max: large ? 0.45 : 0.7, rgb: i % 2 === 0 ? '255,220,100' : f.look.slash, w: large ? 2.4 : 3.2, drag: 2.5 });
    }
  }
}
function neutral(f, foe) {
  const c = f.ctrl, onG = f.onGround();
  if (typeof trySwitchStance === 'function' && onG && trySwitchStance(f)) return;
  if (typeof trySwitchRelicStance === 'function' && onG && trySwitchRelicStance(f)) return;
  if (onG && f.state !== 'victory') f.face = faceDir(f, foe);
  if (M.phase !== 'fight') {
    if (onG && f.state !== 'victory') { f.state = 'idle'; }
    f.vx = damp(f.vx, 0, 10, STEP);
    return;
  }
  const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
  if (onG) {
    if (f.meter >= 100 && c.consume('special')) return startSpecial(f);
    if (canDropFromPlatform(f) && (c.consume('drop') || (c.held.down && c.consume('jump')))) return mapDrop(f);   // 站在可下穿高台上：双击 ↓ 或 ↓ + 跳落下去
    if (f.plat < 0 && c.buf.drop !== undefined) delete c.buf.drop;   // 主地面或不可下穿地面不缓冲下穿
    if (c.held.down) {
      if (c.consume('light')) return startAttack(f, 'dl');
      if (f.skill2CD <= 0 && (SKILLS[f.ch.skill2] || {}).free && c.consume('skill2')) return startSkill(f, foe, 2);   // 离影 ↓+R：换到最早的雾身
      f.blockT = f.state === 'block' ? (f.blockT || 0) + STEP : 0;
      f.state = 'block'; f.face = blockFace(f, foe); f.vx = damp(f.vx, dir * wk(f) * 0.3, 20, STEP); return;
    } else {
      f.blockT = 0;
    }
    if (c.held.atk) {
      // 按住时保持轻击缓冲不过期：短按（短于 CHARGE_START）松手仍然出轻击。
      // 否则按住 0.16（BUF）到 0.3（CHARGE_START）秒之间松手，轻击已过期、蓄力又没到，
      // 就会出现“按了攻击却没反应”的空档（触屏与鼠标点击都受影响）。
      c.buf.light = clock;
      if (clock - c.atkT >= CHARGE_START) {
        delete c.buf.light;
        f.state = 'charge'; f.t = 0; f.chargeFull = false; SFX.charge(); return;
      }
    } else {
      if (c.consume('light')) return startAttack(f, 'l1');
    }
    if (c.consume('heavy')) return startAttack(f, 'hv');
    if (c.consume('jump')) return doJump(f, dir);
    if (f.skillCD <= 0 && c.consume('skill')) return startSkill(f, foe);
    if (f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
    const sp = (dir === f.face ? wk(f) : wk(f) * 0.78) * mapWalk(f);
    f.vx = damp(f.vx, dir * sp, 16 * mapGrip(f), STEP);   // 冰面上起步、停下都慢
    f.state = Math.abs(f.vx) > 25 ? 'walk' : 'idle';
  } else {
    f.state = 'air';
    if (f.airHover > 0) {
      if (c.consume('light') || c.consume('heavy') || c.consume('down')) {
        f.airHover = 0; endEscape(f);
        f.invul = 0.25;
        startAttack(f, 'cs2');
        f.vy = 960;
        f.vx = f.face * 140;
        addP({ type: 'text', text: '⚡ 千钧下坠', x: f.x, y: f.y - 80, life: 0.6, max: 0.6, rgb: '255,220,120' });
        SFX.heavy();
        return;
      }
      if ((c.held.left || c.held.right) && c.consume('dash')) {
        f.airHover = 0; endEscape(f);
        f.state = 'dash'; f.t = 0;
        f.vx = (c.held.right ? 1 : -1) * 750;
        f.vy = 0;
        f.invul = 0.32;
        ring(f.x, f.y - 50, 110, f.look.slash, 0.3);
        dust(f.x, f.y, 8);
        SFX.dash();
        return;
      }
      if (f.skillCD <= 0 && c.consume('skill')) { f.airHover = 0; endEscape(f); return startSkill(f, foe); }
      if (f.skill2CD <= 0 && !(SKILLS[f.ch.skill2] || {}).free && c.consume('skill2')) { f.airHover = 0; endEscape(f); return startSkill(f, foe, 2); }
      return;
    }
    if (c.held.atk) {
      c.buf.light = clock;
      if (clock - c.atkT >= CHARGE_START) {
        delete c.buf.light;
        f.state = 'aircharge'; f.t = 0; f.chargeFull = false; f.vy = Math.min(f.vy, 40);
        if (!RESIM) { ring(f.x, f.y - 60, 62, f.look.slash, 0.28); SFX.charge(); }
        return;
      }
    } else {
      if (c.consume('light')) return startAttack(f, 'a1');
    }
    if (c.consume('heavy')) return startAttack(f, 'a2');
    const jumpLimit = (f.ch.jumps || 2) + (mapFavOn(f) && f.ch.id === 'liuyun' && M.map === 'cliff' ? 1 : 0);
    if (f.jumps < jumpLimit && c.consume('jump')) return doJump(f, dir);
    // 燕翎：空中按住跳跃就能飞（过了起跳最高点之后才开始）
    if (f.ch.fly && c.held.jump && f.flyT > 0 && f.vy > -120 && M.phase === 'fight') {
      f.flying = true; f.flyT -= STEP;
      f.vy = damp(f.vy, f.y < -230 ? 90 : -70, 8, STEP);
      f.vx = clamp(f.vx + dir * 2400 * STEP, -wk(f) * 1.4, wk(f) * 1.4);
      if (Math.random() < 0.3) addP({ type: 'spark', x: f.x - f.face * 18, y: f.y - 70, vx: -f.face * 60, vy: rand(20, 80), life: 0.3, max: 0.3, rgb: f.look.slash, w: 1.2 });
      return;
    }
    // 空中也能放 Q / R：效果和地上一样，动作换成空中的（见 AIR_SKILL_POSE）
    if (f.skillCD <= 0 && c.consume('skill')) return startSkill(f, foe);
    if (f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
    f.vx = clamp(f.vx + dir * 1700 * STEP, -wk(f) * 1.2, wk(f) * 1.2);
  }
}
function attackUpdate(f, foe) {
  const m = f.move, c = f.ctrl, t = f.t, cx = f.ch.cancel || CANCEL;   // 取消规则见 src/data/01-moves.js 的 CANCEL
  const act0 = m.su, act1 = m.su + m.ac;
  // 格挡更灵活：出招前段、或打完判定之后的收招，按住 S 都能立刻转成格挡（下蹲试探轻攻击 dl 不自取消）
  if (c.held.down && f.onGround() && M.phase === 'fight' && f.moveName !== 'dl' && (t < act0 * cx.blockEarly || (t >= act1 && !f.hitConfirmed))) { toNeutral(f); f.state = 'block'; f.face = blockFace(f, foe); return; }
  if (t >= act0 && !f.lunged) {
    f.lunged = true;
    if (f.ch.inkShot && /^l[1-5]$/.test(f.moveName) && f.ink >= INK_COST) {   // 墨羽：普攻甩出一团墨，按抛物线甩向身前（要有墨水）
      f.ink -= INK_COST;
      const T = 0.42, G = 1500, sx = f.x + f.face * 40, sy = f.y - 90;
      const tx = f.x + f.face * 220, ty = -60;   // 固定落在身前约 220 像素，不自动追着对手飞（远处要自己找角度）
      spawnProj(f, { kind: 'inkblob', x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy - 0.5 * G * T * T) / T, g: G, lob: true, w: 30, h: 30, life: 1.2, dmg: INK_DMG, kb: [80, 0], stun: 0.3, hs: 0.04, noScale: true });
    }
    if (f.ch.id === 'liuyun' && (f.moveName === 'cs1' || f.moveName === 'cs2')) {
      const n = f.moveName === 'cs2' ? 2 : 1, towardFoe = Math.sign(foe.x - f.x) === f.face;
      const dx = towardFoe ? (foe.x - f.x) : f.face * 300, dy = towardFoe ? ((foe.y - 60) - (f.y - 62)) : 0, a0 = Math.atan2(dy, dx);
      for (let k = 0; k < n; k++) {
        const a = a0 + (n === 2 ? (k ? 0.1 : -0.1) : 0);
        spawnProj(f, { kind: 'wind', x: f.x + Math.cos(a) * 40, y: f.y - 62, vx: Math.cos(a) * 1150, vy: Math.sin(a) * 1150, w: 56, h: 52, life: 1.2, dmg: 28, kb: [420, 0], stun: 0.5, hs: 0.08, knock: true, unbreakable: f.moveName === 'cs2' });
      }
    }
    if (m.track) {
      f.face = foe.x >= f.x ? 1 : -1;
      f.vx = f.face * clamp((Math.abs(foe.x - f.x) - 40) / 0.12, 150, 1300);
    } else if (!m.air) {
      const close = Math.abs(foe.x - f.x) < 70 && Math.sign(foe.x - f.x) === f.face;
      f.vx = (m.lunge || 0) * f.face * (close ? 0.35 : 1);
    }
    SFX[m.snd]();
  }
  if (t >= act0 && t < act1 && !f.hitDone) tryHit(f, foe, m);
  const free2 = (SKILLS[f.ch.skill2] || {}).free;   // free：只能从自由状态放，不能接在出招后面（离影的换影）
  if (M.phase === 'fight' && t >= act1 && t < act1 + m.rc) {
    if (f.badgeId === 'ascent' && f.badgeAirSkillT > 0 && !f.onGround() && f.airDash > 0 && c.consume('dash')) {
      const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0) || f.face;
      f.airDash--; f.badgeAirSkillT = 0; startBadgeDash(f, dir, 'air'); showBadgeCue(f, 'ascent', true); return;
    }
    if (f.badgeId === 'flowing' && f.badgeLinkT > 0 && c.consume('dash')) {
      const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0) || f.face;
      f.badgeLinkT = 0; startBadgeDash(f, dir, 'flow'); showBadgeCue(f, 'flowing', true); return;
    }
    if (f.badgeId === 'pursuit' && f.badgeExitT > 0 && c.consume('dash')) {
      const inputDir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0), dir = inputDir || -f.face;
      f.badgeExitT = 0; startBadgeDash(f, dir, 'exit'); showBadgeCue(f, 'pursuit', true); return;
    }
    const canBadgeSkill = f.badgeTier === 'purpgold' && f.hitConfirmed && (
      (f.badgeId === 'flowing' && f.badgeLinkT > 0) ||
      (f.badgeId === 'focus' && f.badgePressureT > 0) ||
      (f.badgeId === 'ascent' && f.badgeAirSkillT > 0 && !f.onGround() && !f.badgeAirSkillUsed)
    );
    if (canBadgeSkill) {
      let slot = 0;
      if (f.skillCD <= 0 && c.consume('skill')) slot = 1;
      else if (f.skill2CD <= 0 && !free2 && c.consume('skill2')) slot = 2;
      if (slot) {
        startSkill(f, foe, slot === 2 ? 2 : undefined);
        if (f.state === 'skill') {
          if (f.badgeId === 'flowing') f.badgeLinkT = 0;
          if (f.badgeId === 'focus') { f.badgePressureT = 0; f.badgePressureSkill = 1; }
          if (f.badgeId === 'ascent') { f.badgeAirSkillT = 0; f.badgeAirSkillUsed = 1; }
          showBadgeCue(f, f.badgeId, true); return;
        }
      }
    }
  }
  if (M.phase === 'fight' && cx.skill2FromLight && !free2 && /^l\d/.test(f.moveName) && f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
  if (M.phase === 'fight' && (t >= act0 + m.ac * cx.chainAt || (f.hitConfirmed && f.moveName === 'dl'))) {
    if (m.next.light && c.consume('light')) return startAttack(f, m.next.light);
    if (f.hitConfirmed && m.hitNext && m.hitNext.light && c.consume('light')) return startAttack(f, m.hitNext.light);
    if (m.next.heavy && c.consume('heavy')) return startAttack(f, m.next.heavy);
    if (f.hitConfirmed) {
      if (cx.skillOnHit && f.skillCD <= 0 && c.consume('skill')) return startSkill(f, foe);
      if (cx.skillOnHit && !free2 && f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
      if (m.jumpCancel && c.consume('jump')) { f.jumps = 0; f.face = faceDir(f, foe); return doJump(f, f.face); }
    }
  }
  if (t >= act1 + m.rc) {
    toNeutral(f);
    if (c.held.down && f.onGround()) { f.state = 'block'; f.face = blockFace(f, foe); }
  }
}
function endSpecial(f) {
  if (f.flurryVictim && f.flurryVictim.state === 'held') toNeutral(f.flurryVictim);
  f.flurryVictim = null;
  if (f.bwVictimIdx >= 0) {
    const bv = fighterByIdx(f.bwVictimIdx);
    if (bv && bv.state === 'held') toNeutral(bv);
    f.bwVictimIdx = -1;
  }
  f.invul = 0;
  toNeutral(f);
}
const EIGHT_IMM = ['汉钟离', '吕洞宾', '张果老', '曹国舅', '铁拐李', '韩湘子', '何仙姑', '蓝采和'];
function specialUpdate(f, foe) {
  const t = f.t, U = ULTS[f.ch.ult];
  if (f.sp === 'charge') {
    if (t >= 0.42) {
      f.t = 0;
      if (U.flurry) {
        f.sp = 'dash';
        const spd = U.dashSpd || (f.ch && (f.ch.id === 'qingfeng' || f.ch.id === 'feiying') ? 1750 : 1400);
        f.vx = spd * f.face;
        f.vy = 0;
        if (f.ch.ult === 'shadows' || U.airTrack) {
          const inAir = !foe.onGround() || airH(foe) > 15 || foe.y < -15;
          const maxDist = spd * (U.dashT || 0.28);
          const dx = foe.x - f.x, dy = (foe.y - 35) - f.y;
          const dist = Math.hypot(dx, dy);
          if (inAir && dist <= maxDist) {
            f.face = dx >= 0 ? 1 : -1;
            f.vx = (dx / Math.max(1, dist)) * spd;
            f.vy = (dy / Math.max(1, dist)) * spd;
          }
        }
        SFX.dash();
      }
      else U.begin(f, foe);
    }
    return;
  }
  if (!U.flurry) { U.update(f, foe); return; }
  const victim = (f.flurryVictim && !f.flurryVictim.hidden && f.flurryVictim.hp > 0) ? f.flurryVictim : foe;
  const spd = U.dashSpd || (f.ch && (f.ch.id === 'qingfeng' || f.ch.id === 'feiying') ? 1750 : 1400);
  const dashT = U.dashT || 0.28;
  const maxDist = spd * dashT;
  if (f.sp === 'dash') {
    const inAir = !foe.onGround() || airH(foe) > 15 || foe.y < -15;
    if (f.ch.ult === 'shadows' || U.airTrack) {
      const dx = foe.x - f.x, dy = (foe.y - 35) - f.y;
      const dist = Math.hypot(dx, dy);
      if (inAir && dist <= maxDist) {
        f.face = dx >= 0 ? 1 : -1;
        f.vx = damp(f.vx, (dx / Math.max(1, dist)) * spd, 14, STEP);
        f.vy = damp(f.vy, (dy / Math.max(1, dist)) * spd, 14, STEP);
        if (Math.random() < 0.4) smoke(f.x, f.y - 30, 4);
      } else {
        if (Math.abs(foe.x - f.x) > 20) f.vx = damp(f.vx, (foe.x >= f.x ? 1 : -1) * spd, 10, STEP);
        f.vy = damp(f.vy, 0, 10, STEP);
      }
    } else {
      if (Math.abs(foe.x - f.x) > 20) f.vx = damp(f.vx, (foe.x >= f.x ? 1 : -1) * spd, 10, STEP);
    }
    const dashHb = hitbox(f, [-14, -135, 106, 0]);
    const multiFoes = isMulti() ? foesOf(f) : [foe];
    const catchFoe = multiFoes.find(ef => ef && !ef.hidden && ef.hp > 0 && ef.invul <= 0 && (overlap(dashHb, hurtbox(ef)) || ((f.ch.ult === 'shadows' || U.airTrack) && (!ef.onGround() || airH(ef) > 15 || ef.y < -15) && Math.hypot(ef.x - f.x, (ef.y - 35) - f.y) <= 125)));
    if (!isClient() && catchFoe) {
      f.sp = 'flurry'; f.t = 0; f.slashN = 0; f.vx = 0; f.vy = 0; f.flurryVictim = catchFoe;
      foe = catchFoe;
      foe.state = 'held'; foe.t = 0; foe.vx = 0; foe.vy = 0; foe.move = null; foe.skill = null; foe.sp = null; foe.y = Math.min(foe.y, -50);
      const ev = { e: 'hit', a: f.idx, d: foe.idx, x: foe.x, y: foe.y - 60, dmg: 9, hs: 0.12, nc: true };
      hitVisual(ev); netEmit(ev);
    } else if (t >= dashT) { f.sp = 'miss'; f.t = 0; f.vx *= 0.25; f.vy = 0; }
  } else if (f.sp === 'miss') {
    if (f.y < 0) { f.vy += GRAV * STEP; if (f.y + f.vy * STEP >= 0) { f.y = 0; f.vy = 0; } }
    if (t >= 0.42) { f.invul = 0; toNeutral(f); }
  } else if (f.sp === 'flurry') {
    const n = Math.floor(t / U.iv);
    if (n > f.slashN - 1 && f.slashN < U.n) {
      const side = f.slashN % 2 ? 1 : -1;
      f.x = clamp(victim.x + side * grand(60, 90), WALL, STAGE_W - WALL);
      f.y = Math.min(0, victim.y + grand(-30, 30));
      f.face = victim.x >= f.x ? 1 : -1;
      f.snap = true; f.trail.length = 0;
      const ang = rand(0, Math.PI);
      slashLine(victim.x, victim.y - 55, ang, f.look.slash);
      if (f.ch.ult === 'shadows') {
        // 残影进回滚存档、会被打中（hitDecoy），飘的方向不能用 rand（两边的 Math.random 不一样），按刀数定
        decoys.push({ owner: f.idx, sk: f.sk, x0: f.x, y0: f.y, x: f.x, y: f.y, vx: side * 30, vy: (f.slashN % 3 - 1) * 20, rot: 0, vr: 0, life: 0.35, landed: true, age: 0 });
        smoke(f.x, f.y - 50, 6);
      } else if (f.ch.ult === 'crescent') {
        ring(victim.x, victim.y - 55, 75, '120,230,255', 0.22);
      } else if (f.ch.ult === 'eightimm') {
        addP({ type: 'text', text: EIGHT_IMM[f.slashN % 8], x: victim.x + (f.slashN % 2 ? 40 : -40), y: victim.y - 120 - (f.slashN % 3) * 14, life: 0.45, max: 0.45, rgb: '255,190,110' });
      }
      applyHit(f, victim, { ...SP_SLASH, dmg: U.slash }, [victim.x, victim.y - 55]);
      SFX.slice(); f.slashN++;
    }
    if (t >= U.iv * U.n + 0.06) {
      f.sp = 'final'; f.t = 0; f.snap = true; f.trail.length = 0;
      f.x = clamp(victim.x - f.spFace * 80, WALL, STAGE_W - WALL); f.face = f.spFace; f.y = Math.min(0, victim.y + 40);
    }
  } else if (f.sp === 'final') {
    if (t >= 0.07 && !f.finalDone) {
      f.finalDone = true; f.snap = false;
      // 残月：最后一击把对手就近打倒，落回当前层高，不能再追击
      if (U.land) { f.y = gndY(f); f.vy = 0; applyHit(f, victim, { ...FINAL, dmg: U.fin, kb: [260, 0], knock: true }, [victim.x, victim.y - 60]); }
      else applyHit(f, victim, { ...FINAL, dmg: U.fin }, [victim.x, victim.y - 60]);
      if (isMulti()) {
        strikeAoE(f, victim.x, victim.y - 55, 220, 150, { dmg: Math.round(U.fin * 0.72), kb: [280, -420], stun: 0.45, hs: 0.1, launch: true, ult: true, noScale: true, big: true }, [victim.idx]);
      }
      flashA = 0.6; flashRGB = f.ch.ult === 'shadows' ? '255,95,115' : '255,255,255'; shake = 22;
      for (let i = 0; i < (f.ch.ult === 'shadows' ? 4 : 3); i++) slashLine(victim.x, victim.y - 55, rand(-0.4, 0.4), f.look.slash);
      if (f.ch.ult === 'crescent') {
        f.skillCD = 0; f.skill2CD = 0; f.dashCD = 0;
        f.meter = Math.min(100, f.meter + 20);
        addP({ type: 'text', text: '🌙 剑气归元 · 瞬步重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '120,230,255' });
        SFX.chargeFull();
      } else if (f.ch.ult === 'shadows') {
        f.skillCD = 0; f.skill2CD = 0; f.dashCD = 0;
        for (let k = 0; k < 2; k++) {
          decoys.push({ owner: f.idx, sk: f.sk, x0: f.x + (k === 0 ? -40 : 40), y0: f.y, x: f.x + (k === 0 ? -40 : 40), y: f.y, vx: k === 0 ? -35 : 35, vy: -15, rot: 0, vr: 0, life: 1.8, landed: true, age: 0 });
          smoke(f.x + (k === 0 ? -40 : 40), f.y - 40, 8);
        }
        addP({ type: 'text', text: '🗡️ 影遁无形 · 苦无重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '255,95,115' });
        SFX.chargeFull();
      } else if (f.ch.ult === 'eightimm') {
        f.drunk = 100;
        addP({ type: 'text', text: '八仙醉 · 醉意满盈', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '255,170,90' });
        SFX.chargeFull();
      }
    }
    if (t >= 0.5) { f.finalDone = false; endSpecial(f); }
  }
}
