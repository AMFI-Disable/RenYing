// ======================= 技能执行 =======================
function startSkill(f, foe, slot) {
  const id = slot === 2 ? f.ch.skill2 : f.ch.skill, S = SKILLS[id];
  if (!S) return;
  if (S.can && !S.can(f)) { if (f.idx === localIdx()) addP({ type: 'text', text: S.lack ? S.lack(f) : '还不能用', x: f.x, y: f.y - 120, life: 0.6, max: 0.6, rgb: '255,190,90' }); return; }
  endEscape(f);
  if (f.ch.passive === 'drunk' && !S.can) f.drunk = Math.min(100, (f.drunk || 0) + 30);   // 醉翁：放技能添酒
  if (f.ch.passive === 'soothe') {
    for (const ally of allFighters()) {
      if (ally === f || ally.hidden || ally.team !== f.team || ally.hp <= 0) continue;
      if (Math.hypot(ally.x - f.x, ally.y - f.y) <= 320) {
        ally.guard = Math.min(ally.maxGuard || 100, (ally.guard || 0) + 14);
        ally.slowT = 0;
        if (!RESIM) ring(ally.x, ally.y - 54, 64, '82,240,200', 0.25);
      }
    }
  }
  f.state = 'skill'; f.skill = id; f.t = 0; f.skPh = 0; f.hitDone = false; f.skHitSet = []; f.move = null; f.skAir = !f.onGround();
  const smod = typeof skillModFor === 'function' ? skillModFor(f, slot) : { cd: 1 };
  const petCdMul = f.petId === 'mechfinch' ? (1 - 0.08 * (PET_TIER_MUL[f.petTier] || 1)) : 1;
  const cd = S.cd * (balOf(f).cd || 1) * smod.cd * petCdMul;
  if (slot === 2) f.skill2CD = cd; else f.skillCD = cd;
  if (scOn()) scFire(f, 'skill', foe, slot || 1);
  f.face = faceDir(f, foe);   // 技能朝角色面向的方向放（电脑没有方向键，自动面向对手）
  const customNm = skinSkillName(f, slot);
  if (customNm && f.hp > 0 && M.phase === 'fight') {
    addP({ type: 'callout', text: customNm, x: f.x, y: f.y - 75, life: 0.65, max: 0.65, rgb: f.look.slash, scale: 1.5 });
  }
  if (mayhemOn()) {
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
    let landY = 0, landPlat = -1;
    const ps = typeof mapPlats === 'function' ? (mapPlats() || []) : [];
    for (let i = 0; i < ps.length; i++) {
      const P = ps[i], py = platformY(P, f.x);
      if (Math.abs(f.x - P.x) <= P.w / 2 && f.y <= py && f.y + f.vy * STEP >= py) { landY = py; landPlat = i; break; }
    }
    if (landPlat >= 0 || f.y + f.vy * STEP >= 0 || f.t >= 0.7) {   // 下一帧落到平台或地面：在该层炸开
      f.skPh = 11; f.t = 0; f.y = landPlat >= 0 ? landY : (f.y + f.vy * STEP >= 0 ? 0 : f.y); f.plat = landPlat; f.vx = 0; f.vy = 0; f.hitDone = false; f.jumps = 0; f.airDash = 1;
      strike(f, foe, { box: [-130, -120, 130, 6], dmg: 24, kb: [240, -640], stun: 0.45, hs: 0.1, launch: true });
      for (let k = 0; k < 5; k++) spawnProj(f, { kind: 'popcorn', x: clamp(f.x + (k - 2) * 62, WALL, STAGE_W - WALL), y: f.y - 12, groundY: f.y, vx: 0, delay: 0.32 + k * 0.05, life: 0.62, w: 84, h: 76, dmg: 8, kb: [70, -140], stun: 0.22, hs: 0.03, unbreakable: true, noScale: true, seed: (clock * 5.1 + k * 1.7) % 6 });
      shake = Math.max(shake, 14); flashA = Math.max(flashA, 0.22); flashRGB = f.look.slash;
      ring(f.x, f.y - 10, 150, f.look.slash, 0.4); ring(f.x, f.y - 10, 95, '255,255,255', 0.3); dust(f.x, f.y, 22);
      for (let k = 0; k < 22; k++) { const a = Math.PI + (k / 21) * Math.PI, v = rand(260, 620); addP({ type: 'spark', x: f.x, y: -8, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, life: 0.45, max: 0.45, rgb: k % 3 ? f.look.slash : '255,245,210', w: 2.6, drag: 2.4 }); }
      SFX.thud(); SFX.poof();
    }
  } else if (f.t >= 0.24) toNeutral(f);
}
// 技能近身判定（支持 1v1 / 2v2 / 8v8 多目标同时命中与跨层垂直判定）
function strike(f, foe, spec) {
  if (f.hitDone) return false;
  const rangeScale = 1.15 * (typeof mapSkillReach === 'function' ? mapSkillReach(f) : 1);
  const rangeBox = (f.state === 'skill' || spec.ult) && !spec.noRangeBoost
    ? spec.box.map((v, i) => i === 0 || i === 2 ? v * rangeScale : v)
    : spec.box;
  const hb = hitbox(f, rangeBox);
  cujuHit(f, hb, spec);
  hitClones(hb, f.idx, spec.dmg);
  if (hitDecoy(f, hb)) return false;
  echoCloneAttack(f, hb, { ...spec, skill: true }, 'skill');
  const targets = isMulti()
    ? findTargetsInBox(f, hb, { ignoreInvul: !!spec.ignoreInvul })
    : (foe && (!foe.invul || spec.ignoreInvul) && foe.hp > 0 && overlap(hb, hurtbox(foe)) ? [foe] : []);
  if (!targets.length) return false;
  f.hitDone = true;
  const limit = spec.single ? 1 : targets.length;
  for (let i = 0; i < limit; i++) {
    const tf = targets[i];
    const hu = hurtbox(tf);
    const mul = multiTargetScale(i);
    const hitSpec = mul < 1 ? { ...spec, dmg: Math.round(spec.dmg * mul * 10) / 10 } : spec;
    applyHit(f, tf, hitSpec, [(Math.max(hb[0], hu[0]) + Math.min(hb[2], hu[2])) / 2, (Math.max(hb[1], hu[1]) + Math.min(hb[3], hu[3])) / 2]);
  }
  return true;
}
// 统一范围（圆形/椭圆）技能与奥义判定（自动适配五层垂直高度与 8v8 多目标衰减）
function strikeAoE(f, cx, cy, rx, ry, spec, exclude) {
  if (exclude && !Array.isArray(exclude)) exclude = exclude.idx !== undefined ? [exclude.idx] : [];   // 磁仙大招传过来的是一个侠客而不是编号数组
  const targets = findTargetsInRadius(f, cx, cy, rx, ry || rx, { ignoreInvul: !!spec.ignoreInvul, exclude });
  if (!targets.length) return 0;
  for (let i = 0; i < targets.length; i++) {
    const tf = targets[i];
    const mul = multiTargetScale(i);
    const dir = tf.x >= cx ? 1 : -1;
    const hitSpec = { ...spec, dir, srcX: cx, dmg: mul < 1 ? Math.round(spec.dmg * mul * 10) / 10 : spec.dmg };
    applyHit(f, tf, hitSpec, [tf.x, tf.y - 55]);
  }
  return targets.length;
}
// 月镜格开：对手硬直，自己准备反斩
function parry(def, att, pt) {
  if (scOn()) scFire(def, 'parry', att);
  if (def.relicStance === 2) def.relicCounterT = Math.max(def.relicCounterT || 0, 1.25);
  def.parryT = 0; def.skPh = 2; def.t = 0; def.hitDone = false; def.invul = 0.35; def.face = att.x >= def.x ? 1 : -1;
  att.move = null; att.state = 'hitstun'; att.t = 0; att.stun = 0.55; att.vx = def.face * 120; att.skill = null;
  att.breakCD = Math.max(att.breakCD, 0.4);
  const ev = { e: 'parry', a: def.idx, x: pt[0], y: pt[1] };
  parryVisual(ev); netEmit(ev);
}
function parryVisual(ev) {
  const d = fighterByIdx(ev.a), large = isLargeTeam();
  ring(ev.x, ev.y, 110, '255,255,255', 0.35); ring(ev.x, ev.y, 60, d.look.slash, 0.3);
  slashLine(ev.x, ev.y, -0.6, d.look.slash); flashA = Math.max(flashA, large ? 0.1 : 0.35); flashRGB = '255,255,255';
  hitstop = Math.max(hitstop, large ? 0.04 : 0.14); shake = Math.max(shake, large ? 5 : 10);
  camImpact(ev.x, ev.y, 0.26, 0.45);
  addP({ type: 'callout', text: '截', x: ev.x, y: ev.y - 70, life: 0.75, max: 0.75, rgb: '255,225,120', scale: 2.2 });
  SFX.block(); metal(1900, 0.8, 0.1);
}
// 雷鸣金刚雷铠招架：近身攻击引落天雷
function thunderGuardCounter(def, att, pt) {
  if (def.relicStance === 2) def.relicCounterT = Math.max(def.relicCounterT || 0, 1.25);
  def.thunderGuardT = 0; def.armorT = 0; def.skPh = 1; def.t = 0; def.invul = 0.35;
  const target = att || foeOf(def);
  def.face = target.x >= def.x ? 1 : -1;
  shake = Math.max(shake, 14); flashA = Math.max(flashA, 0.28); flashRGB = '255,240,150';
  ring(def.x, def.y - 60, 130, '255,230,120', 0.4);
  ring(def.x, def.y - 60, 65, '255,255,255', 0.3);
  dust(def.x, def.y, 16);
  camImpact(def.x, def.y - 60, 0.32, 0.50);
  SFX.parry(); SFX.thunder(); SFX.thunderHit(1.2);
  addP({ type: 'text', text: '⚡ 金刚雷铠 · 引雷天罚', x: def.x, y: def.y - 120, life: 0.85, max: 0.85, rgb: '255,230,120' });
  addP({ type: 'callout', text: '雷', x: def.x, y: def.y - 70, life: 0.75, max: 0.75, rgb: '255,230,120', scale: 2.2 });
  const strikeX = clamp(target.x, WALL + 20, STAGE_W - WALL - 20), gy = target.y;
  spawnProj(def, { kind: 'bolt', x: strikeX, y: gy - 210, groundY: gy, vx: 0, w: 96, h: 460, life: 0.42, delay: 0.04, dmg: 50, kb: [0, -720], stun: 0.50, hs: 0.12, launch: true, quickGetup: true, unbreakable: true, small: true, chain: 2, chainRange: 320 });
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
// 空中蓄力：滞空缓降并聚气，松手释放空中蓄力斩（满蓄为下砸破防斩）；落地无缝转地面蓄力
function airChargeUpdate(f, foe) {
  const c = f.ctrl;
  if (f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
  if (M.phase !== 'fight') return toNeutral(f);
  f.face = faceDir(f, foe);
  const full = f.t >= CHARGE_FULL;
  if (full && !f.chargeFull) {
    f.chargeFull = true;
    if (!RESIM) { ring(f.x, f.y - 60, 102, f.look.slash, 0.35); flashA = Math.max(flashA, 0.12); flashRGB = f.look.slash; SFX.chargeFull(); }
  }
  if (!RESIM && f.sk && Math.random() < (full ? 0.9 : 0.55)) {
    const a = rand(0, Math.PI * 2), r = rand(40, 88);
    addP({ type: 'spark', x: f.sk.tip[0] + Math.cos(a) * r, y: f.sk.tip[1] + Math.sin(a) * r, vx: -Math.cos(a) * r * 5, vy: -Math.sin(a) * r * 5, life: 0.18, max: 0.18, rgb: f.look.slash, w: 1.6 });
  }
  const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
  f.vx = damp(f.vx, dir * wk(f) * 0.45, 8, STEP);
  f.vy = damp(f.vy, 55, 10, STEP);
  if (!c.held.atk || f.t >= CHARGE_FULL + 0.65) {
    f.chargeFull = false;
    f.airCharged = true;
    startAttack(f, full ? 'cs2' : 'cs1');
    f.vy = full ? 520 : -110;
    f.vx = f.face * (full ? 160 : 210);
    if (!RESIM) {
      addP({ type: 'text', text: full ? '凌空重斩' : '御空蓄斩', x: f.x, y: f.y - 102, life: 0.65, max: 0.65, rgb: f.look.slash || '255,220,120' });
      ring(f.x, f.y - 56, full ? 105 : 75, f.look.slash, 0.28);
    }
  }
}
// 扩展键位战斗与战术动作（C 虚招翻滚、F 聚气弹反、V 灵宠秘技、G 切换锁定、B 归位自标、T 战意号令、1/2/3 战队指令）
