// ======================= 动作 =======================
function toNeutral(f) {
  f.move = null; f.sp = null; f.snap = false; f.skill = null; f.armorT = 0; f.parryT = 0; f.thunderGuardT = 0; f.rooted = false;
  f.state = f.onGround() ? 'idle' : 'air';
  if (f.onGround()) { f.juggle = 0; f.huiMaHits = 0; }
}
function startAttack(f, name) {
  endEscape(f);
  f.state = 'attack'; f.move = f.moves[name]; f.moveName = name; f.t = 0;
  if (f.ch.passive === 'armor' && HEAVY_MOVES.includes(name)) { f.armorT = f.move.su + f.move.ac; f.armorHits = 1; }
  if (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'armor') { f.armorT = Math.max(f.armorT, (f.move.su || 0.15) + (f.move.ac || 0.15)); f.armorHits = Math.max(f.armorHits, 1); }
  f.lunged = false; f.hitDone = false; f.hitConfirmed = false;
  const foe = foeOf(f), h = f.ctrl && f.ctrl.held, dir = h ? ((h.right ? 1 : 0) - (h.left ? 1 : 0)) : 0, a = dir || (h && h.aim);
  f.face = f.onGround() ? faceDir(f, foe) : ((a && !h.down && (SETTINGS.aim || !human.includes(f.ctrl))) ? a : f.face);
  if (scOn()) scFire(f, 'atk', foe, name);
}
function doJump(f, dir) {
  const jumpBonus = (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'jump') ? currentChaosMutation.val : 1;
  f.vy = (f.jumps === 0 ? -JUMP_V : -DJUMP_V) * (f.ch.stat.jump || 1) * jumpBonus; f.jumps++;
  f.vx = dir ? dir * wk(f) * 1.15 : f.vx * 0.5;
  f.state = 'air'; f.y = Math.min(f.y, -1);
  if (f.jumps >= 2) ring(f.x, f.y - 20, 36, f.look.slash, 0.35);
  dust(f.x, 0, 6); SFX.jump();
  if (scOn()) scFire(f, 'jump', foeOf(f));
}
function startDash(f, dir) {
  f.state = 'dash'; f.t = 0; f.dashDir = dir; f.vx = DASH_V * dir; f.vy = 0;
  f.invul = 0.13; f.dashCD = DODGE_CD;
  if (f.onGround()) dust(f.x - dir * 20, 0, 8);
  SFX.dash();
  if (scOn()) scFire(f, 'dash', foeOf(f));
}
function startSpecial(f) {
  endEscape(f);
  if (f.ch.passive === 'drunk') f.drunk = Math.min(100, (f.drunk || 0) + 30);
  f.face = faceDir(f, foeOf(f));
  f.meter = 0; f.state = 'special'; f.sp = 'charge'; f.t = 0; f.invul = 99; f.vx = 0; f.spFace = f.face;
  superFreeze = 0.5; superOwner = f; dimA = 1;
  flashA = 0.35; flashRGB = f.look.slash;
  const ultName = skinUltName(f) || ULTS[f.ch.ult].name;
  say(ultName, 0.9, 'super'); SFX.superOn();
  const ultPitch = f.ch.stat && f.ch.stat.weight > 1.1 ? 0.8 : 1.15;
  SFX.voiceUlt(ultPitch);
  if (CHAR_RARITY[f.ch.id] === 'legend') { ring(f.x, f.y - 60, 210, '233,196,106', 0.6); ring(f.x, f.y - 60, 150, f.look.slash, 0.5); flashRGB = '233,196,106'; }
  ring(f.x, f.y - 60, 120, f.look.slash, 0.5);
  if (scOn()) { scFire(f, 'ult', foeOf(f)); scFire(foeOf(f), 'foeUlt', f); }
  if (M.mode === 'mayhem') {
    shake = Math.max(shake, 32);
    flashA = 0.65;
    flashRGB = '255,225,120';
    ring(f.x, f.y - 60, 320, '255,215,80', 0.7);
    ring(f.x, f.y - 60, 480, f.look.slash, 0.65);
    slashLine(f.x, f.y - 60, 0, f.look.slash);
    slashLine(f.x, f.y - 60, Math.PI / 2, '255,240,180');
    slashLine(f.x, f.y - 60, rand(-0.7, 0.7), f.look.slash);
    for (let i = 0; i < 30; i++) {
      const a = rand(0, 6.28), v = rand(240, 720);
      addP({ type: 'spark', x: f.x, y: f.y - 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, max: 0.7, rgb: i % 2 === 0 ? '255,220,100' : f.look.slash, w: 3.2, drag: 2.5 });
    }
  }
}
function neutral(f, foe) {
  const c = f.ctrl, onG = f.onGround();
  if (onG && f.state !== 'victory') f.face = faceDir(f, foe);
  if (M.phase !== 'fight') {
    if (onG && f.state !== 'victory') { f.state = 'idle'; }
    f.vx = damp(f.vx, 0, 10, STEP);
    return;
  }
  const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
  if (onG) {
    if (f.meter >= 100 && c.consume('special')) return startSpecial(f);
    if (c.held.down) {
      if (c.consume('light')) return startAttack(f, 'dl');
      f.blockT = f.state === 'block' ? (f.blockT || 0) + STEP : 0;
      f.state = 'block'; f.face = Math.abs(foe.x - f.x) > 6 ? (foe.x >= f.x ? 1 : -1) : f.face; f.vx = damp(f.vx, dir * wk(f) * 0.3, 20, STEP); return;
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
    const sp = dir === f.face ? wk(f) : wk(f) * 0.78;
    f.vx = damp(f.vx, dir * sp, 16, STEP);
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
      if (f.skill2CD <= 0 && c.consume('skill2')) { f.airHover = 0; endEscape(f); return startSkill(f, foe, 2); }
      return;
    }
    if (c.consume('light')) return startAttack(f, 'a1');
    if (c.consume('heavy')) return startAttack(f, 'a2');
    if (f.jumps < (f.ch.jumps || 2) && c.consume('jump')) return doJump(f, dir);
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
  const m = f.move, c = f.ctrl, t = f.t;
  const act0 = m.su, act1 = m.su + m.ac;
  // 格挡更灵活：出招前段、或打完判定之后的收招，按住 S 都能立刻转成格挡（下蹲试探轻攻击 dl 不自取消）
  if (c.held.down && f.onGround() && M.phase === 'fight' && f.moveName !== 'dl' && (t < act0 * 0.6 || (t >= act1 && !f.hitConfirmed))) { toNeutral(f); f.state = 'block'; f.face = Math.abs(foe.x - f.x) > 6 ? (foe.x >= f.x ? 1 : -1) : f.face; return; }
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
  if (M.phase === 'fight' && /^l\d/.test(f.moveName) && f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
  if (M.phase === 'fight' && (t >= act0 + m.ac * 0.6 || (f.hitConfirmed && f.moveName === 'dl'))) {
    if (m.next.light && c.consume('light')) return startAttack(f, m.next.light);
    if (f.hitConfirmed && m.hitNext && m.hitNext.light && c.consume('light')) return startAttack(f, m.hitNext.light);
    if (m.next.heavy && c.consume('heavy')) return startAttack(f, m.next.heavy);
    if (f.hitConfirmed) {
      if (f.skillCD <= 0 && c.consume('skill')) return startSkill(f, foe);
      if (f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
      if (m.jumpCancel && c.consume('jump')) { f.jumps = 0; f.face = faceDir(f, foe); return doJump(f, f.face); }
    }
  }
  if (t >= act1 + m.rc) {
    toNeutral(f);
    if (c.held.down && f.onGround()) { f.state = 'block'; f.face = Math.abs(foe.x - f.x) > 6 ? (foe.x >= f.x ? 1 : -1) : f.face; }
  }
}
function endSpecial(f) {
  if (f.flurryVictim && f.flurryVictim.state === 'held') toNeutral(f.flurryVictim);
  f.flurryVictim = null;
  f.invul = 0;
  toNeutral(f);
}
const EIGHT_IMM = ['汉钟离', '吕洞宾', '张果老', '曹国舅', '铁拐李', '韩湘子', '何仙姑', '蓝采和'];
function specialUpdate(f, foe) {
  const t = f.t, U = ULTS[f.ch.ult];
  if (f.sp === 'charge') {
    if (t >= 0.42) {
      f.t = 0;
      if (U.flurry) { f.sp = 'dash'; f.vx = 1400 * f.face; SFX.dash(); }
      else U.begin(f, foe);
    }
    return;
  }
  if (!U.flurry) { U.update(f, foe); return; }
  const victim = (f.flurryVictim && !f.flurryVictim.hidden && f.flurryVictim.hp > 0) ? f.flurryVictim : foe;
  if (f.sp === 'dash') {
    if (!isClient() && foe.hp > 0 && foe.invul <= 0 && overlap(hitbox(f, [0, -118, 96, 0]), hurtbox(foe))) {
      f.sp = 'flurry'; f.t = 0; f.slashN = 0; f.vx = 0; f.flurryVictim = foe;
      foe.state = 'held'; foe.t = 0; foe.vx = 0; foe.vy = 0; foe.move = null; foe.skill = null; foe.sp = null; foe.y = Math.min(foe.y, -50);
      const ev = { e: 'hit', a: f.idx, d: foe.idx, x: foe.x, y: foe.y - 60, dmg: 9, hs: 0.12, nc: true };
      hitVisual(ev); netEmit(ev);
    } else if (t >= 0.26) { f.sp = 'miss'; f.t = 0; f.vx *= 0.25; }
  } else if (f.sp === 'miss') {
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
        decoys.push({ owner: f.idx, sk: f.sk, x0: f.x, y0: f.y, x: f.x, y: f.y, vx: rand(-40, 40), vy: rand(-30, 30), rot: 0, vr: 0, life: 0.35, landed: true, age: 0 });
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
      // 残月：最后一击把对手就近打倒，自己直接落地，不能再追击
      if (U.land) { f.y = 0; f.vy = 0; applyHit(f, victim, { ...FINAL, dmg: U.fin, kb: [260, 0], knock: true }, [victim.x, victim.y - 60]); }
      else applyHit(f, victim, { ...FINAL, dmg: U.fin }, [victim.x, victim.y - 60]);
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
          decoys.push({ owner: f.idx, sk: f.sk, x0: f.x + (k === 0 ? -40 : 40), y0: f.y, x: f.x + (k === 0 ? -40 : 40), y: f.y, vx: rand(-50, 50), vy: rand(-30, 30), rot: 0, vr: 0, life: 1.8, landed: true, age: 0 });
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
// ======================= 技能执行 =======================
function startSkill(f, foe, slot) {
  const id = slot === 2 ? f.ch.skill2 : f.ch.skill, S = SKILLS[id];
  if (!S) return;
  if (S.can && !S.can(f)) { if (f.idx === localIdx()) addP({ type: 'text', text: S.lack ? S.lack(f) : '还不能用', x: f.x, y: f.y - 120, life: 0.6, max: 0.6, rgb: '255,190,90' }); return; }
  endEscape(f);
  if (f.ch.passive === 'drunk' && !S.can) f.drunk = Math.min(100, (f.drunk || 0) + 30);   // 醉翁：放技能添酒
  f.state = 'skill'; f.skill = id; f.t = 0; f.skPh = 0; f.hitDone = false; f.move = null; f.skAir = !f.onGround();
  const cd = S.cd * (balOf(f).cd || 1);
  if (slot === 2) f.skill2CD = cd; else f.skillCD = cd;
  if (scOn()) scFire(f, 'skill', foe, slot || 1);
  f.face = faceDir(f, foe);   // 技能朝角色面向的方向放（电脑没有方向键，自动面向对手）
  const customNm = skinSkillName(f, slot);
  if (customNm && f.hp > 0 && M.phase === 'fight') {
    addP({ type: 'callout', text: customNm, x: f.x, y: f.y - 75, life: 0.65, max: 0.65, rgb: f.look.slash, scale: 1.5 });
  }
  if (M.mode === 'mayhem') {
    shake = Math.max(shake, 18);
    flashA = Math.max(flashA, 0.38);
    flashRGB = f.look.slash || '255,215,80';
    ring(f.x, f.y - 60, 160, f.look.slash || '255,215,80', 0.45);
    ring(f.x, f.y - 60, 260, '255,240,160', 0.5);
    slashLine(f.x, f.y - 60, rand(-0.8, 0.8), f.look.slash);
    for (let i = 0; i < 18; i++) {
      const a = rand(0, 6.28), v = rand(220, 580);
      addP({ type: 'spark', x: f.x, y: f.y - 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.55, max: 0.55, rgb: i % 2 === 0 ? '255,215,80' : f.look.slash, w: 2.8, drag: 2.8 });
    }
  }
  S.start(f, foe);
}
// 流云空中开扇：斜着俯冲，落地风爆，崩出一圈爆米花
function windDive(f, foe) {
  if (f.skPh === 10) {
    f.vx = f.face * 820; f.vy = Math.max(f.vy, 1750);
    for (let k = 0; k < 2; k++) addP({ type: 'spark', x: f.x - f.face * rand(10, 40), y: f.y - rand(10, 90), vx: -f.face * rand(120, 260), vy: -rand(300, 520), life: 0.3, max: 0.3, rgb: k ? f.look.slash : '255,255,255', w: 1.8, drag: 3 });
    if (f.y + f.vy * STEP >= 0 || f.t >= 0.7) {   // 下一帧就着地：在这帧炸开，免得落地判定先把技能收掉
      f.skPh = 11; f.t = 0; f.y = 0; f.vx = 0; f.vy = 0; f.hitDone = false; f.jumps = 0; f.airDash = 1;
      strike(f, foe, { box: [-130, -120, 130, 6], dmg: 24, kb: [240, -640], stun: 0.45, hs: 0.1, launch: true });
      for (let k = 0; k < 5; k++) spawnProj(f, { kind: 'popcorn', x: clamp(f.x + (k - 2) * 62, WALL, STAGE_W - WALL), y: -12, vx: 0, delay: 0.32 + k * 0.05, life: 0.62, w: 84, h: 76, dmg: 8, kb: [70, -140], stun: 0.22, hs: 0.03, unbreakable: true, noScale: true, seed: (clock * 5.1 + k * 1.7) % 6 });
      shake = Math.max(shake, 14); flashA = Math.max(flashA, 0.22); flashRGB = f.look.slash;
      ring(f.x, -10, 150, f.look.slash, 0.4); ring(f.x, -10, 95, '255,255,255', 0.3); dust(f.x, 0, 22);
      for (let k = 0; k < 22; k++) { const a = Math.PI + (k / 21) * Math.PI, v = rand(260, 620); addP({ type: 'spark', x: f.x, y: -8, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, life: 0.45, max: 0.45, rgb: k % 3 ? f.look.slash : '255,245,210', w: 2.6, drag: 2.4 }); }
      SFX.thud(); SFX.poof();
    }
  } else if (f.t >= 0.24) toNeutral(f);
}
// 技能的一次近身判定（每个阶段只会打中一次）
function strike(f, foe, spec) {
  if (f.hitDone) return false;
  const hb = hitbox(f, spec.box);
  if (hitDecoy(f, hb)) return false;
  const targets = is2v2() ? foesOf(f) : [foe];
  for (const tf of targets) {
    if (tf.invul > 0 || tf.hp <= 0 || !overlap(hb, hurtbox(tf))) continue;
    f.hitDone = true;
    const hu = hurtbox(tf);
    applyHit(f, tf, spec, [(Math.max(hb[0], hu[0]) + Math.min(hb[2], hu[2])) / 2, (Math.max(hb[1], hu[1]) + Math.min(hb[3], hu[3])) / 2]);
    return true;
  }
  return false;
}
// 月镜格开：对手硬直，自己准备反斩
function parry(def, att, pt) {
  if (scOn()) scFire(def, 'parry', att);
  def.parryT = 0; def.skPh = 2; def.t = 0; def.hitDone = false; def.invul = 0.35; def.face = att.x >= def.x ? 1 : -1;
  att.move = null; att.state = 'hitstun'; att.t = 0; att.stun = 0.55; att.vx = def.face * 120; att.skill = null;
  att.breakCD = Math.max(att.breakCD, 0.4);
  const ev = { e: 'parry', a: def.idx, x: pt[0], y: pt[1] };
  parryVisual(ev); netEmit(ev);
}
function parryVisual(ev) {
  const d = fighterByIdx(ev.a);
  ring(ev.x, ev.y, 110, '255,255,255', 0.35); ring(ev.x, ev.y, 60, d.look.slash, 0.3);
  slashLine(ev.x, ev.y, -0.6, d.look.slash); flashA = Math.max(flashA, 0.35); flashRGB = '255,255,255';
  hitstop = Math.max(hitstop, 0.14); shake = Math.max(shake, 10);
  camImpact(ev.x, ev.y, 0.26, 0.45);
  addP({ type: 'callout', text: '截', x: ev.x, y: ev.y - 70, life: 0.75, max: 0.75, rgb: '255,225,120', scale: 2.2 });
  SFX.block(); metal(1900, 0.8, 0.1);
}
// 雷鸣金刚雷铠招架：格挡近战或飞行道具，引落九天玄雷轰击敌首
function thunderGuardCounter(def, att, pt) {
  def.thunderGuardT = 0; def.armorT = 0; def.skPh = 1; def.t = 0; def.invul = 0.35;
  const target = att || foeOf(def);
  def.face = target.x >= def.x ? 1 : -1;
  shake = Math.max(shake, 14); flashA = Math.max(flashA, 0.28); flashRGB = '255,240,150';
  ring(def.x, def.y - 60, 130, '255,230,120', 0.4);
  ring(def.x, def.y - 60, 65, '255,255,255', 0.3);
  dust(def.x, 0, 16);
  camImpact(def.x, def.y - 60, 0.32, 0.50);
  SFX.parry(); SFX.thunder(); SFX.thunderHit(1.2);
  addP({ type: 'text', text: '⚡ 金刚雷铠 · 引雷天罚', x: def.x, y: def.y - 120, life: 0.85, max: 0.85, rgb: '255,230,120' });
  addP({ type: 'callout', text: '雷', x: def.x, y: def.y - 70, life: 0.75, max: 0.75, rgb: '255,230,120', scale: 2.2 });
  const strikeX = clamp(target.x, WALL + 20, STAGE_W - WALL - 20);
  spawnProj(def, { kind: 'bolt', x: strikeX, y: -210, vx: 0, w: 90, h: 460, life: 0.42, delay: 0.04, dmg: 50, kb: [0, -720], stun: 0.50, hs: 0.12, launch: true, unbreakable: true, small: true });
  const ev = { e: 'thunder_counter', a: def.idx, x: def.x, y: def.y - 60, tx: strikeX };
  netEmit(ev);
}
function thunderCounterVisual(ev) {
  ring(ev.x, ev.y, 130, '255,230,120', 0.4);
  ring(ev.x, ev.y, 65, '255,255,255', 0.3);
  flashA = Math.max(flashA, 0.28); flashRGB = '255,240,150';
  shake = Math.max(shake, 14);
  camImpact(ev.x, ev.y, 0.32, 0.50);
  addP({ type: 'callout', text: '雷', x: ev.x, y: ev.y - 70, life: 0.75, max: 0.75, rgb: '255,230,120', scale: 2.2 });
  SFX.thunder(); SFX.thunderHit(1.2);
}

// ======================= 飞行道具 =======================
const projs = [];
let projSeq = 0;
function spawnProj(f, o) {
  if (isClient()) return;   // 联机时由房主生成，加入方从快照同步
  if (scOn()) { o = { src: f.state === 'skill' ? f.skill : f.state === 'special' ? 'ult' : '', ...o }; scProj(f, o); }   // 秘卷：认得出是哪一招放的，也能改它
  if (M.mode === 'mayhem') {
    o = { ...o };
    if (o.dmg) o.dmg = Math.round(o.dmg * 2.5);
    if (o.w) o.w = Math.round(o.w * 1.8);
    if (o.h) o.h = Math.round(o.h * 1.8);
    ring(o.x, o.y, 110, f.look.slash || '255,215,80', 0.35);
  }
  projs.push(Object.assign({ id: ++projSeq, owner: f.idx, vy: 0, life: 1, age: 0, hits: 0, hitCD: 0, delay: 0, isProj: true }, o));
}
function projBox(p) { return [p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2]; }
function updateProjs() {
  for (const p of projs) {
    if (p.dead) continue;
    p.age += STEP; p.life -= STEP; p.hitCD -= STEP;
    const wasDelay = p.delay > 0;
    if (p.delay > 0) { p.delay -= STEP; if (p.delay <= 0 && p.kind === 'net') { shake = Math.max(shake, 18); dust(p.x, 0, 22); SFX.thud(); } if (p.delay <= 0 && p.kind === 'popcorn') { SFX.poof(); for (let k = 0; k < 9; k++) { const a = rand(0, 6.28), v = rand(80, 260); addP({ type: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.35, max: 0.35, rgb: k % 3 ? '255,240,200' : '255,200,90', w: 2.2, drag: 2 }); } } if (p.delay <= 0 && p.kind === 'bolt') { if (p.small) { dust(p.x, 0, 8); SFX.thunder(); flashA = Math.max(flashA, 0.1); flashRGB = '255,245,200'; } else boltFX(p); } continue; }
    if (p.g) p.vy += p.g * STEP;
    if (p.boomer && p.age > p.turn) {
      const o = fighterByIdx(p.owner), dx = o.x - p.x;
      p.vx = damp(p.vx, Math.sign(dx) * 860, 7, STEP); p.vy = damp(p.vy, (o.y - 65 - p.y) * 4, 7, STEP);
      if (Math.abs(dx) < 34 && p.age > p.turn + 0.15) { p.dead = true; continue; }
    }
    p.x += p.vx * STEP; p.y += p.vy * STEP;
    if (p.grow) { p.w += p.grow * STEP; p.h += p.grow * STEP; }
    if (p.lob && p.y >= -8) { p.dead = true; for (let i = 0; i < 10; i++) addP({ type: 'ink', x: p.x, y: -4, vx: rand(-160, 160), vy: rand(-200, -40), g: 1400, life: 0.5, max: 0.5, r: rand(2, 4), rgb: '15,15,22' }); continue; }
    if (p.kind === 'dragon' || p.kind === 'tornado' || p.kind === 'wind') { if (Math.random() < 0.6) addP({ type: 'ink', x: p.x - Math.sign(p.vx) * p.w * 0.4, y: p.y + rand(-p.h / 3, p.h / 3), vx: -p.vx * 0.1, vy: rand(-40, 40), life: 0.5, max: 0.5, r: rand(2, 5), rgb: p.kind === 'dragon' ? '20,20,28' : CHARS[fighterByIdx(p.owner).chIdx].look.slash }); }
    if (p.life <= 0 || p.x < -300 || p.x > STAGE_W + 300) { p.dead = true; continue; }
    if (p.fx || p.dmg <= 0) continue;
    const owner = fighterByIdx(p.owner), box = projBox(p);
    const candidates = isMulti() ? foesOf(owner) : [foeOf(owner)];
    let foe = candidates.find(ef => ef.hp > 0 && overlap(box, hurtbox(ef))) || candidates[0];
    // 斩弹：对手的刀砍中飞行道具就把它打散
    if (!p.unbreakable && foe.state === 'attack' && foe.move && foe.t >= foe.move.su && foe.t < foe.move.su + foe.move.ac && overlap(hitbox(foe, foe.move.box), box)) {
      p.dead = true; blockFX(p.x, p.y, foe.face); SFX.block();
      foe.meter = Math.min(100, foe.meter + 1.5);
      addP({ type: 'text', text: '斩', x: p.x, y: p.y - 30, life: 0.5, max: 0.5, rgb: foe.look.slash }); continue;
    }
    if (hitDecoyBox(box, p.owner)) { if (!p.pierce) p.dead = true; continue; }
    if (p.hitCD > 0 || foe.invul > 0 || foe.hp <= 0) continue;
    if ((p.groundOnly || p.kind === 'quake') && (foe.y < -16 || foe.flying)) continue;
    if (!overlap(box, hurtbox(foe))) continue;
    if (p.feast) {   // 与民同乐：砸中就得陪着喝
      p.dead = true;
      if (!isClient()) {
        foe.hp = Math.min(foe.maxHp, foe.hp + 50);
        foe.state = 'hitstun'; foe.t = 0; foe.stun = 1.5; foe.drinkT = 1.5; foe.vx = 0; foe.move = null; foe.skill = null; foe.sp = null; foe.rooted = true;
      }
      SFX.drink(); addP({ type: 'text', text: '与民同乐 · 干！', x: foe.x, y: foe.y - 130, life: 1.0, max: 1.0, rgb: '255,190,90' });
      addP({ type: 'text', text: '+50', x: foe.x, y: foe.y - 105, life: 0.8, max: 0.8, rgb: '130,230,140' });
      continue;
    }
    // 雷鸣金刚雷铠：消解飞行道具并降雷轰顶反制
    if (foe.state === 'skill' && foe.thunderGuardT > 0 && !p.ult) {
      p.dead = true;
      thunderGuardCounter(foe, owner, [p.x, p.y]);
      continue;
    }
    // 玉箫回音壁：把飞行道具原路弹回去
    if (foe.reflectT > 0 && !p.ult && !p.groundOnly && !['trap', 'bolt', 'quake', 'dragon', 'tornado', 'net', 'chord', 'pavilion', 'popcorn'].includes(p.kind)) {
      p.owner = foe.idx; p.vx = -p.vx || foe.face * 700; p.vy = -p.vy * 0.4; p.hits = 0; p.hitCD = 0.05; p.life = Math.max(p.life, 0.8);
      p.boomer = false; p.lob = false; p.g = 0; p.sk = true; p.hook = false;
      foe.notes = Math.min(3, (foe.notes || 0) + 1);
      ring(p.x, p.y, 60, foe.look.slash, 0.25); SFX.parry();
      addP({ type: 'text', text: '回音', x: p.x, y: p.y - 30, life: 0.6, max: 0.6, rgb: foe.look.slash }); continue;
    }
    // 霸体吃掉飞行道具
    if (foe.armorT > 0 && !p.ult) {
      p.dead = true; ring(p.x, p.y, 50, '255,215,120', 0.25); SFX.block();
      if (foe.ch.passive === 'armor') {
        foe.meter = Math.min(100, foe.meter + 3);
        foe.skillCD = Math.max(0, foe.skillCD - 0.3);
        foe.skill2CD = Math.max(0, foe.skill2CD - 0.3);
      }
      addP({ type: 'text', text: '霸体', x: foe.x, y: foe.y - 130, life: 0.6, max: 0.6, rgb: '255,215,120' }); continue;
    }
    p.dir = p.vx !== 0 ? Math.sign(p.vx) : (foe.x >= p.x ? 1 : -1); p.srcX = p.x - p.dir * 10;
    let hitM = p.lastBig && p.hits === (p.maxHits || 1) - 1 ? { ...p, kb: [420, -780], hs: 0.14, big: true } : p;
    if (p.kind === 'moonring') {
      const returning = p.boomer && p.age > p.turn;
      if (returning) {
        hitM = { ...p, dmg: 38, stun: 0.78, hs: 0.12, launch: true, kb: [180, -580], big: true };
        addP({ type: 'text', text: '背袭破防', x: foe.x, y: foe.y - 100, life: 0.8, max: 0.8, rgb: '230,200,255' });
      } else {
        hitM = { ...p, dmg: 28, stun: 0.25, hs: 0.04, launch: false, kb: [100, 0] };
      }
    } else if (p.kind === 'inkblob') {
      foe.slowT = 2.5;
      addP({ type: 'text', text: '墨迹遮目', x: foe.x, y: foe.y - 100, life: 0.9, max: 0.9, rgb: '160,160,190' });
    } else if (p.kind === 'note' && p.notes >= 3) {
      foe.slowT = 2.2;
      addP({ type: 'text', text: '绕梁 · 失律', x: foe.x, y: foe.y - 100, life: 0.9, max: 0.9, rgb: '150,240,200' });
    } else if (p.kind === 'spindle' || p.mark) {
      foe.needleMark = 3.5;
      addP({ type: 'text', text: '✦ 雀芒入体', x: foe.x, y: foe.y - 100, life: 0.8, max: 0.8, rgb: '235,110,210' });
    }
    applyHit(owner, foe, hitM, [clamp(foe.x, box[0], box[2]), clamp(foe.y - 60, box[1], box[3])]);
    const struck = foe.hp > 0 && (foe.state === 'hitstun' || foe.state === 'launched');
    if (p.burn && struck) { foe.burnT = 2; addP({ type: 'text', text: '酒火灼身', x: foe.x, y: foe.y - 110, life: 0.8, max: 0.8, rgb: '255,150,60' }); }
    if (p.jail && foe.hp > 0 && !isClient()) {   // 醉翁亭落下：留客 1.5 秒
      foe.jailT = 1.5; foe.jailX = clamp(foe.x, WALL + 30, STAGE_W - WALL - 30);
      shake = Math.max(shake, 12); dust(foe.x, 0, 16); SFX.thud();
      addP({ type: 'text', text: '醉翁亭 · 留客片刻', x: foe.x, y: foe.y - 290, life: 1.1, max: 1.1, rgb: '255,190,90' });
    }
    if (p.hook && struck && !isClient()) {   // 勾陈飞锤：扯链拽到身前
      foe.x = clamp(owner.x + owner.face * 72, WALL, STAGE_W - WALL); foe.y = 0; foe.vx = 0; foe.vy = 0;
      foe.state = 'hitstun'; foe.t = 0; foe.stun = Math.max(foe.stun || 0, 0.42); foe.hookedT = 1.2;
      dust(foe.x, 0, 6); SFX.heavy();
    }
    p.hits++; p.hitCD = p.rehit || 99;
    if (!p.pierce || p.hits >= (p.maxHits || 1)) p.dead = true;
  }
  // 双方远程弹道相撞相抵（Projectile Clashing）：两方飞射物在空中交错时互相抵消消散（排除地面震波、落雷、陷阱与结构物）
  const NO_CLASH = ['quake', 'bolt', 'trap', 'pavilion', 'chord', 'net', 'popcorn'];
  for (let i = 0; i < projs.length; i++) {
    const p1 = projs[i];
    if (p1.dead || p1.unbreakable || p1.ult || p1.dmg <= 0 || p1.groundOnly || NO_CLASH.includes(p1.kind)) continue;
    const b1 = projBox(p1);
    for (let j = i + 1; j < projs.length; j++) {
      const p2 = projs[j];
      if (p2.dead || p2.unbreakable || p2.ult || p2.dmg <= 0 || p1.owner === p2.owner || p2.groundOnly || NO_CLASH.includes(p2.kind)) continue;
      const b2 = projBox(p2);
      if (overlap(b1, b2)) {
        p1.dead = true; p2.dead = true;
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
        ring(cx, cy, 60, '255,220,130', 0.25);
        for (let k = 0; k < 5; k++) addP({ type: 'spark', x: cx, y: cy, vx: rand(-160, 160), vy: rand(-160, 160), rgb: '255,220,130', life: 0.18, max: 0.18 });
        SFX.block();
        addP({ type: 'text', text: '破', x: cx, y: cy - 20, life: 0.45, max: 0.45, rgb: '255,220,130' });
        break;
      }
    }
  }
  for (let i = projs.length - 1; i >= 0; i--) if (projs[i].dead) projs.splice(i, 1);
}
function boltFX(p) { shake = Math.max(shake, 10); flashA = Math.max(flashA, 0.35); flashRGB = '255,245,200'; dust(p.x, 0, 12); ring(p.x, 0, 90, '255,240,150', 0.3); SFX.thunder(); }
// 腾空闪：任何状态都能用（被大招锁住时除外）。解除硬直、倒地、定身，向上闪起；落地或自己出手之前无敌
const ESC_FX = { qingfeng: 'wind', feiying: 'smoke', tieshan: 'quake', lingshuang: 'wind', liuyun: 'wind', leiming: 'bolt', moyu: 'ink', yuehua: 'moon', yanling: 'wing', yuxiao: 'wind', zuixian: 'smoke', gouchen: 'smoke' };
function tryEscape(f, foe) {
  if (f.hp <= 0 || f.breakCD > 0 || M.phase !== 'fight' || ['held', 'special', 'victory'].includes(f.state) || f.jailT > 0 || f.drinkT > 0) return false;
  if (!f.ctrl.consume('dash')) return false;
  const noDir = !f.ctrl.held.left && !f.ctrl.held.right && !f.ctrl.held.down;
  const inAir = f.y < -15 || !f.onGround();
  if (inAir && noDir) {
    // 腾空·凌空凝势 (TengKong Air Freeze / Hover)
    f.breakCD = Math.min(f.ch.escCD || BREAK_CD, 4.5);
    f.state = 'air'; f.t = 0; f.move = null; f.skill = null; f.sp = null; f.rooted = false; f.stun = 0;
    f.vx = 0; f.vy = 0;
    f.airHover = 0.85;
    f.escInvul = true; f.escT = 0; f.invul = f.airHover;
    f.juggle = 0; f.comboHits = 0; f.spiked = false; f.bounced = false; f.jumps = 1; f.rot = 0; f.armorT = 0;
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
  f.vy = -1000 * (f.ch.id === 'yanling' ? 1.15 : f.ch.id === 'tieshan' ? 0.9 : 1); f.vx = away * 150; f.y = Math.min(f.y, -2);
  f.escInvul = true; f.escT = 0; f.invul = 99;
  f.juggle = 0; f.comboHits = 0; f.spiked = false; f.bounced = false; f.jumps = 1; f.rot = 0; f.armorT = 0;
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
function endEscape(f) { if (f.escInvul) { f.escInvul = false; f.invul = 0; } }
const decoys = [];
function breakOut(f, foe) {
  const away = f.x >= foe.x ? 1 : -1;
  f.breakCD = f.ch.escCD || BREAK_CD;
  decoys.push({ owner: f.idx, sk: f.sk, x0: f.x, y0: f.y, x: f.x, y: f.y, vx: f.vx * 0.4, vy: Math.min(f.vy, 0) * 0.5, rot: 0, vr: away * -3, life: 1.1, landed: f.y >= -1, age: 0 });
  smoke(f.x, f.y - 50, 16);
  f.x = clamp(f.x + away * 110, WALL, STAGE_W - WALL);
  const air = f.y < -1;
  f.state = air ? 'air' : 'idle'; f.t = 0; f.move = null;
  f.vx = 0; f.vy = air ? -220 : 0; f.invul = 0.4; f.rot = 0;
  f.juggle = 0; f.comboHits = 0; f.spiked = false; f.bounced = false; f.jumps = 1; f.airDash = 1; f.huiMaHits = 0;
  f.face = foe.x >= f.x ? 1 : -1;
  f.trail.length = 0; f.scarf = []; f.ghosts = [];
  f.j = {}; for (const k of JOINTS) f.j[k] = [...POSES.fall[k]]; f.j.sw = POSES.fall.sw;
  smoke(f.x, f.y - 50, 10);
  comboUI[foe.idx].t = Math.min(comboUI[foe.idx].t, 0.3);
  hitstop = Math.max(hitstop, 0.04);
  SFX.poof();
}
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
function hitDecoy(att, box) { if (hitDecoyBox(box, att.idx)) { att.hitDone = true; return true; } return false; }
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
function smoke(x, y, n) {
  for (let i = 0; i < n; i++) addP({ type: 'smoke', x: x + rand(-18, 18), y: y + rand(-30, 30), vx: rand(-90, 90), vy: rand(-90, 20), drag: 3, life: rand(0.4, 0.7), max: 0.7, r: rand(10, 22) });
}
function chargeUpdate(f, foe) {
  const c = f.ctrl;
  if (f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
  f.face = faceDir(f, foe);
  const full = f.t >= CHARGE_FULL;
  if (full && !f.chargeFull) {
    f.chargeFull = true; ring(f.x, f.y - 60, 95, f.look.slash, 0.35);
    flashA = Math.max(flashA, 0.12); flashRGB = f.look.slash; SFX.chargeFull();
  }
  // 光点向剑尖聚集
  if (f.sk && Math.random() < (full ? 0.9 : 0.5)) {
    const a = rand(0, Math.PI * 2), r = rand(45, 95);
    addP({ type: 'spark', x: f.sk.tip[0] + Math.cos(a) * r, y: f.sk.tip[1] + Math.sin(a) * r, vx: -Math.cos(a) * r * 5, vy: -Math.sin(a) * r * 5, life: 0.18, max: 0.18, rgb: f.look.slash, w: 1.6 });
  }
  if (M.phase !== 'fight') return toNeutral(f);
  const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
  f.vx = damp(f.vx, dir * wk(f) * 0.32, 10, STEP);
  f.walkPh += STEP * f.vx * f.face * 0.07;
  if (!c.held.atk) { f.chargeFull = false; startAttack(f, full ? 'cs2' : 'cs1'); }
}
// 顿帧、大招定格、被打飞倒地这些动不了的时候按下的技能先记着，能动了马上放，不会被吞掉
const HOLD_KEYS = ['skill', 'skill2', 'special'], HOLD_STATES = ['launched', 'knockdown', 'getup', 'hitstun', 'held'];
function holdBuf(f) {
  const c = f && f.ctrl; if (!c || !c.buf) return;
  const frozen = hitstop > 0 || superFreeze > 0, stuck = HOLD_STATES.includes(f.state);
  if (!frozen && !stuck) return;
  for (const a of frozen ? Object.keys(c.buf) : HOLD_KEYS) if (c.buf[a] !== undefined && clock - c.buf[a] <= BUF) c.buf[a] = clock;
}
function updateFighter(f, foe) {
  holdBuf(f);
  f.t += STEP;
  f.dashCD = Math.max(0, f.dashCD - STEP);
  f.breakCD = Math.max(0, f.breakCD - STEP);
  f.skill2CD = Math.max(0, f.skill2CD - STEP);
  if (f.ch.inkShot) f.ink = Math.min(INK_MAX, (f.ink || 0) + INK_REGEN * STEP);
  f.bbT = Math.max(0, (f.bbT || 0) - STEP); f.twinT = Math.max(0, (f.twinT || 0) - STEP);
  if (f.onGround()) f.diveChained = false;
  trySecondQ(f, foe);
  if (f.escInvul) { f.escT += STEP; if (f.escT > 1.1 || f.flying) endEscape(f); }
  if (tryEscape(f, foe)) { physics(f); return; }
  f.skillCD = Math.max(0, f.skillCD - STEP);
  f.flying = false;
  if (M.mode === 'mayhem') {
    f.skillCD = 0;
    f.skill2CD = 0;
    f.breakCD = 0;
    f.meter = 100;
    if (f.ch.fly) f.flyT = f.ch.fly;
    if (f.ink !== undefined) f.ink = INK_MAX;
    if (f.drunk !== undefined) f.drunk = 100;
    if (f.notes !== undefined) f.notes = 3;
  }
  if (f.dummy && (f.ctrl && f.ctrl.cfg ? f.ctrl.cfg.autoHeal : true) && f.sinceHit > 2 && f.hp < f.maxHp) f.hp = f.maxHp;
  if (f.dummy && f.ctrl && (f.ctrl.cfg ? f.ctrl.cfg.infGuard : true)) { f.guard = f.maxGuard || 100; f.guardBroken = false; }
  if (f.dummy && f.ctrl && (f.ctrl.cfg ? f.ctrl.cfg.fixed : f.ctrl.mode === 'fixed')) { f.vx = 0; f.vy = 0; f.y = 0; if (f.homeX === undefined) f.homeX = f.x; f.x = f.homeX; } else if (f.dummy) f.homeX = undefined;
  if (f.ch.fly && f.onGround()) f.flyT = Math.min(f.ch.fly, f.flyT + STEP * 0.9);
  f.armorT = Math.max(0, f.armorT - STEP);
  f.slowT = Math.max(0, (f.slowT || 0) - STEP);
  f.buffT = Math.max(0, f.buffT - STEP);
  f.reflectT = Math.max(0, (f.reflectT || 0) - STEP);
  f.hookedT = Math.max(0, (f.hookedT || 0) - STEP);
  if (f.veilT > 0) f.veilT = f.hp > 0 ? Math.max(0, f.veilT - STEP) : 0;
  if (f.ch.passive === 'drunk') f.drunk = Math.max(0, (f.drunk || 0) - STEP);
  if (f.drinkT > 0) f.drinkT = Math.max(0, f.drinkT - STEP);
  if (f.jailT > 0) {   // 醉翁亭：关在亭子里，原地挨打
    f.jailT = Math.max(0, f.jailT - STEP);
    if (f.hp <= 0) f.jailT = 0;
    else {
      f.x = f.jailX; f.y = 0; f.vx = f.vy = 0;
      if (f.jailT > 0) { f.state = 'hitstun'; f.stun = f.t + f.jailT; f.rooted = true; f.move = null; f.skill = null; f.sp = null; }
      else { f.state = 'hitstun'; f.t = 0; f.stun = 0.12; f.rooted = false; }
    }
  }
  // 玉箫被动：不打人也会慢慢攒音律（每 2.5 秒一枚）
  if (f.ch.passive === 'rhythm' && (f.notes || 0) < 3 && M.phase === 'fight') { f.noteT = (f.noteT || 0) + STEP; if (f.noteT >= 2.5) { f.noteT = 0; f.notes = (f.notes || 0) + 1; } }
  // 酒火灼身：每 0.5 秒掉 3 血，烧不死人
  if (f.burnT > 0) {
    const b0 = f.burnT; f.burnT = Math.max(0, f.burnT - STEP);
    if (Math.floor(b0 / 0.5) !== Math.floor(f.burnT / 0.5) && f.hp > 1 && M.phase === 'fight' && !isClient()) { f.hp = Math.max(1, f.hp - 3); f.sinceHit = 0; f.lagDelay = 0.5; }
    if (Math.random() < 0.3) addP({ type: 'spark', x: f.x + rand(-14, 14), y: f.y - rand(30, 100), vx: rand(-20, 20), vy: -rand(30, 80), life: 0.35, max: 0.35, rgb: '255,140,50' });
  }
  f.sinceBlock = (f.sinceBlock || 0) + STEP;
  if (f.state !== 'block' && f.state !== 'blockstun' && f.sinceBlock > 0.6) {
    const baseRegen = ((f.ch && f.ch.stat && f.ch.stat.guardRegen) || 26);
    // 现实武侠调息呼吸法：静止调息更快，体力消耗过半后调息变缓，移动/出招时调息减半
    const hpFactor = clamp(0.55 + 0.45 * (f.hp / f.maxHp), 0.55, 1.0);
    const stateBonus = (f.state === 'idle' && f.onGround()) ? 1.25 : (['walk', 'air'].includes(f.state) ? 0.8 : 0.5);
    const regen = baseRegen * hpFactor * stateBonus * STEP;
    f.guard = Math.min(f.maxGuard, (f.guard !== undefined ? f.guard : f.maxGuard) + regen);
  }
  if (f.state === 'skill' && f.skill === 'mirror') f.parryT = Math.max(0, f.parryT - STEP);
  if (f.state === 'skill' && f.skill === 'stomp') f.thunderGuardT = Math.max(0, (f.thunderGuardT || 0) - STEP);
  // 月华被动：3 秒没挨打缓慢回血
  f.sinceHit += STEP;
  if (f.ch.passive === 'regen' && M.phase === 'fight' && f.hp > 0 && f.hp < f.maxHp && f.sinceHit > 3 && f.regenLeft > 0) {
    const h = Math.min(8.0 * STEP, f.regenLeft); f.hp = Math.min(f.maxHp, f.hp + h); f.regenLeft -= h;
  }
  if (f.state !== 'special') f.invul = Math.max(0, f.invul - STEP);
  f.flash = Math.max(0, f.flash - STEP);
  switch (f.state) {
    case 'idle': case 'walk': case 'air': case 'block': neutral(f, foe); break;
    case 'attack': attackUpdate(f, foe); break;
    case 'dash':
      if (M.phase === 'fight' && f.t > 0.07) {
        if (f.ctrl.consume('light')) { startAttack(f, f.onGround() ? 'l3' : 'a1'); break; }
        if (f.ctrl.consume('heavy')) { startAttack(f, f.onGround() ? 'hv' : 'a2'); break; }
      }
      if (f.t >= DASH_T) { f.vx *= 0.35; toNeutral(f); }
      break;
    case 'hitstun':
      if (f.t >= f.stun) { f.comboHits = 0; toNeutral(f); }
      break;
    case 'blockstun':
      if (f.ctrl && f.ctrl.held && f.ctrl.held.down && Math.abs(foe.x - f.x) > 6) {
        f.face = foe.x >= f.x ? 1 : -1;
      }
      if (f.t >= f.stun) {
        if (!f.ctrl.held.down) {
          toNeutral(f);
          const c = f.ctrl;
          if (c && M.phase === 'fight') {
            const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
            if (f.meter >= 100 && c.consume('special')) { startSpecial(f); break; }
            if (f.skillCD <= 0 && c.consume('skill')) { startSkill(f, foe); break; }
            if (f.skill2CD <= 0 && c.consume('skill2')) { startSkill(f, foe, 2); break; }
            if (c.held.atk) {
              if (clock - c.atkT >= CHARGE_START) {
                delete c.buf.light;
                f.state = 'charge'; f.t = 0; f.chargeFull = false; SFX.charge(); break;
              }
            } else {
              if (c.consume('light')) { startAttack(f, 'l1'); break; }
            }
            if (c.consume('heavy')) { startAttack(f, 'hv'); break; }
            if (c.consume('jump')) { doJump(f, dir); break; }
          }
        } else {
          const c = f.ctrl;
          if (c && M.phase === 'fight') {
            if (c.consume('light')) { startAttack(f, 'dl'); break; }
          }
          f.state = 'block';
        }
      }
      break;
    case 'knockdown': {
      const kdDur = (f.knockdownDur !== undefined) ? f.knockdownDur : (f.quickGetup ? 0.22 : 0.6);
      if (f.t >= kdDur && f.hp > 0 && M.phase !== 'end') {
        f.state = 'getup'; f.t = 0; f.invul = 0.35; f.comboHits = 0; f.juggle = 0;
        if (f.quickGetup) f.quickGetupPhase = true;
        f.quickGetup = false; delete f.knockdownDur;
      }
      break;
    }
    case 'getup': {
      const getupDur = f.quickGetupPhase ? 0.16 : 0.3;
      if (f.t >= getupDur) {
        f.quickGetupPhase = false;
        if (f.ctrl && f.ctrl.held && f.ctrl.held.down) {
          f.state = 'block'; f.face = Math.abs(foe.x - f.x) > 6 ? (foe.x >= f.x ? 1 : -1) : f.face;
        } else {
          toNeutral(f);
        }
      }
      break;
    }
    case 'special': specialUpdate(f, foe); break;
    case 'charge': chargeUpdate(f, foe); break;
    case 'skill': if (SKILLS[f.skill]) SKILLS[f.skill].update(f, foe); else toNeutral(f); break;
    case 'launched': break;
    case 'held': if (f.t >= 1.25) toNeutral(f); break;
  }
  // 试炼/爬塔持续状态衰减（流血、寒霜减速、墨爆判定）
  if (f.bleedTicks > 0) {
    f.bleedTimer = (f.bleedTimer || 0) + STEP;
    if (f.bleedTimer >= 0.4) {
      f.bleedTimer = 0;
      f.bleedTicks--;
      const bDmg = Math.max(1, Math.round((f.bleedDmg || 6)));
      f.hp = Math.max(f.dummy ? 1 : 0, f.hp - bDmg);
      addP({ type: 'dmg', text: `${bDmg}`, x: f.x + rand(-15, 15), y: f.y - 70, vx: rand(-20, 20), vy: -120, g: 200, life: 0.65, max: 0.65, s: 0.75, rgb: '255,80,80', edge: '200,30,30' });
      for (let i = 0; i < 3; i++) addP({ type: 'spark', x: f.x, y: f.y - 50, vx: rand(-80, 80), vy: rand(-80, 50), life: 0.3, max: 0.3, rgb: '255,60,60' });
    }
  }
  if (f.frostSlow > 0) {
    f.frostSlow = Math.max(0, f.frostSlow - STEP);
    if (Math.random() < 0.25) addP({ type: 'spark', x: f.x + rand(-20, 20), y: f.y - rand(20, 80), vx: 0, vy: rand(-15, 15), life: 0.3, max: 0.3, rgb: '160,230,255' });
  }
  if (f.needleMark > 0) {
    f.needleMark = Math.max(0, f.needleMark - STEP);
    if (Math.random() < 0.2) addP({ type: 'spark', x: f.x + rand(-15, 15), y: f.y - rand(25, 75), vx: 0, vy: rand(-10, 10), life: 0.25, max: 0.25, rgb: '235,110,210' });
  }
  if (scOn()) scTick(f, foe);
  physics(f);
}
function physics(f) {
  const wasAir = f.y < 0 || f.vy < 0;
  let g = GRAV;
  if (f.airHover > 0) {
    f.airHover -= STEP;
    f.vx = 0; f.vy = 0; g = 0;
    if (Math.random() < 0.35) {
      addP({ type: 'spark', x: f.x + rand(-20, 20), y: f.y - rand(20, 70), vx: rand(-40, 40), vy: rand(-40, 40), life: 0.3, max: 0.3, rgb: f.look.slash });
    }
    if (f.airHover <= 0) endEscape(f);
  }
  if (f.flying) g = 0;
  if (f.state === 'dash' || f.state === 'held' || f.state === 'special' || f.airHover > 0) g = 0;
  else if (f.state === 'attack' && f.move.air) g *= 0.45;
  else if (f.state === 'skill' && f.skAir && SKILLS[f.skill] && !SKILLS[f.skill].air) g *= 0.45;   // 地面技能在空中放：和空中普攻一样下落变慢
  else if (f.state === 'launched') {
    const w = (f.ch && f.ch.stat && f.ch.stat.weight) || 1;
    g *= LAUNCH_GRAV * (1 + f.juggle * 0.12) * Math.min(1.25, Math.max(0.85, Math.pow(w, 0.35)));
  }
  const chaosGrav = (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'grav') ? currentChaosMutation.val : 1;
  if (wasAir) f.vy += g * chaosGrav * STEP;
  if (f.state === 'held') { f.vx = 0; f.vy = 0; }
  f.x += f.vx * STEP; f.y += f.vy * STEP;
  if (f.y >= 0) { f.y = 0; if (wasAir) onLand(f); if (f.vy > 0) f.vy = 0; }
  const onG = f.y >= 0;
  const slide = f.state === 'skill' && SKILLS[f.skill] && SKILLS[f.skill].nofric;
  const fw = (f.ch && f.ch.stat && f.ch.stat.weight) || 1;
  const dampK = clamp(8.5 * Math.pow(fw, 0.4), 6.5, 12);
  if (onG && !slide && !['walk', 'dash', 'idle', 'attack', 'charge'].includes(f.state)) f.vx = damp(f.vx, 0, dampK, STEP);
  if (onG && f.state === 'attack') f.vx = damp(f.vx, 0, f.lunged ? (dampK * 0.75) : (dampK * 1.5), STEP);
  if (f.x < WALL || f.x > STAGE_W - WALL) {
    const side = f.x < WALL ? -1 : 1;
    f.x = side < 0 ? WALL : STAGE_W - WALL;
    if (f.state === 'launched' && Math.abs(f.vx) > 350) {
      const isHardImpact = Math.abs(f.vx) > 480;
      f.vx *= isHardImpact ? -0.55 : -0.4;
      shake = Math.max(shake, isHardImpact ? 14 : 7);
      ring(f.x, f.y - 50, isHardImpact ? 90 : 50, '255,255,255', 0.35);
      SFX.thud();
      if (isHardImpact && !f.wallBounced) {
        f.wallBounced = true;
        f.vy = Math.min(f.vy, -220); // 弹墙向上微微浮空，提供连段追击窗口
        addP({ type: 'text', text: '撞墙震击', x: f.x + (side < 0 ? 40 : -40), y: f.y - 70, life: 0.6, max: 0.6, rgb: '255,220,160' });
        if (typeof ARENA_SPLATTERS !== 'undefined') {
          ARENA_SPLATTERS.push({ x: f.x, y: f.y - 50, rx: rand(18, 30), ry: rand(30, 55), rot: rand(-0.3, 0.3), life: 4.5, max: 4.5 });
          if (ARENA_SPLATTERS.length > 20) ARENA_SPLATTERS.shift();
        }
        for (let i = 0; i < 7; i++) {
          addP({ type: 'ink', x: f.x, y: f.y - rand(20, 80), vx: -side * rand(60, 220), vy: rand(-120, 40), g: 600, life: 0.5, max: 0.5, r: rand(2.5, 4.5), rgb: '18,18,24' });
        }
      }
    }
    else if (Math.sign(f.vx) === side) f.vx = 0;
  }
}
function onLand(f) {
  if (scOn()) scFire(f, 'land', foeOf(f), f.vy);
  f.wallBounced = false;
  if (f.airRecover) {
    f.airRecover = false;
    f.state = 'getup'; f.t = 0.15; f.vx *= 0.2; f.invul = 0.35; f.comboHits = 0; f.juggle = 0;
    dust(f.x, 0, 10); SFX.land();
    return;
  }
  if (f.escInvul) {   // 腾空闪落地：无敌结束，短暂落地硬直
    f.escInvul = false; f.invul = 0; f.jumps = 0; f.airDash = 1;
    f.state = 'getup'; f.t = 0.15; f.vx *= 0.3; dust(f.x, 0, 6); SFX.land();
    return;
  }
  if (f.state === 'launched') {
    if (f.spiked && !f.bounced) { f.vy = -560; f.bounced = true; f.y = -1; shake = Math.max(shake, 8); dust(f.x, 0, 14); ring(f.x, 0, 70, '255,255,255', 0.35); SFX.thud(); return; }

    // 落地受身翻滚判定（Tech Roll / Ukemi）：按闪避或跳跃瞬间滚身脱困
    const c = f.ctrl;
    const canTech = c && f.hp > 0 && !f.spiked && (c.consume('dash') || c.consume('jump') || (c.held && (c.held.dash || c.held.jump)));
    if (canTech) {
      const dir = (c.held && (c.held.left ? -1 : (c.held.right ? 1 : 0))) || -f.face;
      f.state = 'dash'; f.t = 0; f.face = -dir; f.vx = dir * 560;
      f.invul = 0.28; f.comboHits = 0; f.juggle = 0;
      dust(f.x, 0, 12); SFX.dash();
      addP({ type: 'text', text: '受身', x: f.x, y: f.y - 70, life: 0.55, max: 0.55, rgb: '170,230,255' });
      return;
    }

    f.state = 'knockdown'; f.t = 0; f.vx *= 0.3; f.invul = 99; f.rot = 0;
    dust(f.x, 0, 12); shake = Math.max(shake, 5); SFX.thud();
    return;
  }
  if (f.state === 'held') return;
  f.jumps = 0; f.airDash = 1;
  if (f.state === 'air' || (f.state === 'attack' && f.move.air)) {
    const isPlunge = f.state === 'attack' && (f.moveName === 'a2' || f.moveName === 'cs2') && !f.hitConfirmed;
    toNeutral(f);
    if (isPlunge) {
      // 真实格斗落地破绽（Whiff Landing Recovery）：重型千钧下砸落空时，有 0.12s 落地缓冲破绽
      f.vx *= 0.35;
      dust(f.x, 0, 10); SFX.land();
      shake = Math.max(shake, 4);
    } else {
      if (f.ctrl && f.ctrl.held && f.ctrl.held.down) { f.state = 'block'; f.face = Math.abs(foeOf(f).x - f.x) > 6 ? (foeOf(f).x >= f.x ? 1 : -1) : f.face; }
      dust(f.x, 0, 4); SFX.land();
    }
  }
  else if (f.state === 'dash') { /* 地面冲刺结束会自己转状态 */ }
}

