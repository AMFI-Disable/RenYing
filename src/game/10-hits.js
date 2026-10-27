// ======================= 判定 =======================
function hitbox(f, b) {
  const x0 = f.x + f.face * b[0], x1 = f.x + f.face * b[2];
  return [Math.min(x0, x1), f.y + b[1], Math.max(x0, x1), f.y + b[3]];
}
function hurtbox(f) {
  const s = f.size || 1;
  if (f.state === 'knockdown') return [f.x - 40 * s, f.y - 20 * s, f.x + 40 * s, f.y];
  if (f.state === 'launched' || f.state === 'held') return [f.x - 28 * s, f.y - 92 * s, f.x + 28 * s, f.y + 4];
  if (f.state === 'block' || f.state === 'blockstun' || f.state === 'getup') return [f.x - 18 * s, f.y - 92 * s, f.x + 18 * s, f.y];
  return [f.x - 18 * s, f.y - 112 * s, f.x + 18 * s, f.y];
}
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// 调试模式判定框与帧优势透视 (Hitbox & Frame Advantage Overlay)
function drawHitboxOverlay(fighters) {
  ctx.save();
  for (const f of fighters) {
    if (!f || f.hidden || f.hp <= 0) continue;
    // 1. 受击框 (Hurtbox) - 绿色 / 无敌蓝色
    const hu = hurtbox(f);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = f.invul > 0 ? 'rgba(120, 200, 255, 0.85)' : 'rgba(80, 240, 120, 0.85)';
    ctx.fillStyle = f.invul > 0 ? 'rgba(120, 200, 255, 0.15)' : 'rgba(80, 240, 120, 0.15)';
    ctx.fillRect(hu[0], hu[1], hu[2] - hu[0], hu[3] - hu[1]);
    ctx.strokeRect(hu[0], hu[1], hu[2] - hu[0], hu[3] - hu[1]);

    // 2. 攻击框 (Hitbox) - 前摇黄色 / 活跃帧红色 / 后摇收招蓝色
    if (f.state === 'attack' && f.move && f.move.box) {
      const su = f.move.su || 0.04, ac = f.move.ac || 0.08, rec = (f.move.rec !== undefined ? f.move.rec : 0.18);
      const isStart = f.t < su;
      const isAct = f.t >= su && f.t < su + ac;
      const isRec = f.t >= su + ac;
      const hb = hitbox(f, f.move.box);
      ctx.strokeStyle = isAct ? 'rgba(255, 45, 65, 0.95)' : isStart ? 'rgba(255, 195, 50, 0.85)' : 'rgba(80, 160, 255, 0.75)';
      ctx.fillStyle = isAct ? 'rgba(255, 45, 65, 0.28)' : isStart ? 'rgba(255, 195, 50, 0.12)' : 'rgba(80, 160, 255, 0.12)';
      ctx.fillRect(hb[0], hb[1], hb[2] - hb[0], hb[3] - hb[1]);
      ctx.strokeRect(hb[0], hb[1], hb[2] - hb[0], hb[3] - hb[1]);

      // 实时帧数据显示与阶段标识
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = isAct ? '#ff4055' : isStart ? '#ffc040' : '#60b0ff';
      ctx.textAlign = 'center';
      const frameTxt = isAct ? `活跃帧 [${Math.round((f.t - su) * 60)}/${Math.round(ac * 60)}F]` : isStart ? `前摇 [${Math.round(f.t * 60)}/${Math.round(su * 60)}F]` : `收招 [${Math.round((f.t - su - ac) * 60)}/${Math.round(rec * 60)}F]`;
      ctx.fillText(frameTxt, (hb[0] + hb[2]) / 2, hb[1] - 8);
    }

    // 角色状态、硬直与帧优势实时透视 (Frame Advantage)
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    let advText = '';
    const other = foeOf ? foeOf(f) : null;
    if (other && f.state === 'attack' && f.move) {
      const remainingAtk = Math.max(0, (f.move.su || 0.04) + (f.move.ac || 0.08) + (f.move.rec || 0.18) - f.t);
      const foeStun = other.stun || 0;
      const advFrames = Math.round((foeStun - remainingAtk) * 60);
      advText = advFrames >= 0 ? ` +${advFrames}F 优势` : ` ${advFrames}F 劣势`;
    }
    const stDesc = `${f.state}${f.stun > 0 ? ` (硬直 ${(f.stun * 60).toFixed(0)}F)` : ''}${advText}`;
    ctx.fillStyle = advText.includes('+') ? '#70ff90' : advText.includes('-') ? '#ff7070' : '#efe8d8';
    ctx.fillText(stDesc, f.x, f.y - 125 * (f.size || 1));
  }
  ctx.restore();
}
function tryHit(f, foe, m) {
  const hb = hitbox(f, m.box);
  if (hitDecoy(f, hb)) return;
  if (isMulti()) {
    const matchTarget = foesOf(f).find(ef => ef.invul <= 0 && ef.hp > 0 && overlap(hb, hurtbox(ef)));
    if (matchTarget) foe = matchTarget;
  }
  if (foe.invul > 0 || foe.hp <= 0) return;
  const hu = hurtbox(foe);
  if (!overlap(hb, hu)) return;

  // 真实物理拼刀截击机制（Dynamic Blade Clash）：活跃攻击帧相撞，按两方武器动能与体量动态判定弹刀与压制
  if (!m.isProj && !m.ult && !m.unblockable && foe.state === 'attack' && foe.move && foe.move.box && !foe.hitDone) {
    const foeSu = foe.move.su || 0.04, foeAc = foe.move.ac || 0.08;
    if (foe.t >= foeSu && foe.t <= foeSu + foeAc) {
      const foeHb = hitbox(foe, foe.move.box);
      if (overlap(hb, foeHb)) {
        const cx = (hb[0] + hb[2] + foeHb[0] + foeHb[2]) / 4;
        const cy = (hb[1] + hb[3] + foeHb[1] + foeHb[3]) / 4;
        const fWeight = (f.ch && f.ch.stat && f.ch.stat.weight) || 1;
        const foeWeight = (foe.ch && foe.ch.stat && foe.ch.stat.weight) || 1;
        // 招式冲击动能 E = 0.5 * Mass * (Dmg / Speed)^1.2
        const fSpeed = (f.ch && f.ch.stat && f.ch.stat.speed) || 1;
        const foeSpeed = (foe.ch && foe.ch.stat && foe.ch.stat.speed) || 1;
        const e1 = fWeight * Math.pow((m.dmg || 15) / Math.max(0.5, fSpeed), 1.15);
        const e2 = foeWeight * Math.pow((foe.move.dmg || 15) / Math.max(0.5, foeSpeed), 1.15);
        const eRatio = e1 / Math.max(0.1, e2);

        if (eRatio >= 2.2) {
          // 重武器完全压制轻武器：轻武器被强力荡开，重攻击完成穿透
          foe.hitDone = true;
          foe.state = 'hitstun'; foe.t = 0; foe.stun = 0.32; foe.vx = -foe.face * 260;
          f.vx *= 0.5;
          shake = Math.max(shake, 12); SFX.heavy(); SFX.parry(); haptic([20, 30, 20]);
          ring(cx, cy, 170, '255,200,90', 0.45);
          for (let i = 0; i < 9; i++) addP({ type: 'spark', x: cx, y: cy, vx: rand(-320, 320), vy: rand(-320, 320), rgb: '255,200,90', life: 0.25, max: 0.25 });
          addP({ type: 'text', text: '⚡ 破势荡刃', x: cx, y: cy - 40, life: 0.7, max: 0.7, rgb: '255,210,100' });
          return;
        } else if (eRatio <= 0.45) {
          // 对手重武器完全压制我方轻武器
          f.hitDone = true;
          f.state = 'hitstun'; f.t = 0; f.stun = 0.32; f.vx = -f.face * 260;
          foe.vx *= 0.5;
          shake = Math.max(shake, 12); SFX.heavy(); SFX.parry(); haptic([20, 30, 20]);
          ring(cx, cy, 170, '255,200,90', 0.45);
          for (let i = 0; i < 9; i++) addP({ type: 'spark', x: cx, y: cy, vx: rand(-320, 320), vy: rand(-320, 320), rgb: '255,200,90', life: 0.25, max: 0.25 });
          addP({ type: 'text', text: '⚡ 破势荡刃', x: cx, y: cy - 40, life: 0.7, max: 0.7, rgb: '255,210,100' });
          return;
        } else {
          // 均势拼刀：基于冲量定理按质量反弹
          f.hitDone = true; foe.hitDone = true;
          f.vx = -f.face * clamp(210 / Math.sqrt(fWeight), 130, 280);
          foe.vx = -foe.face * clamp(210 / Math.sqrt(foeWeight), 130, 280);
          f.t = Math.max(f.t, foeSu + foeAc);
          foe.t = Math.max(foe.t, foeSu + foeAc);
          SFX.parry(); haptic([15, 25, 15]);
          shake = Math.max(shake, 8);
          ring(cx, cy, 140, '255,225,120', 0.35);
          for (let i = 0; i < 7; i++) addP({ type: 'spark', x: cx, y: cy, vx: rand(-260, 260), vy: rand(-260, 260), rgb: '255,220,120', life: 0.22, max: 0.22 });
          addP({ type: 'text', text: '⚔️ 拼刀', x: cx, y: cy - 40, life: 0.6, max: 0.6, rgb: '255,225,120' });
          return;
        }
      }
    }
  }

  f.hitDone = true;
  const px = (Math.max(hb[0], hu[0]) + Math.min(hb[2], hu[2])) / 2, py = (Math.max(hb[1], hu[1]) + Math.min(hb[3], hu[3])) / 2;
  applyHit(f, foe, m, [px, py]);
}
const predicted = [];
function predictHit(att, def, m, pt) {
  if (att.idx !== localIdx() || m.isProj) return;
  const holdingBlock = !!(def.ctrl && def.ctrl.held && def.ctrl.held.down);
  const wasBlocking = ((def.state === 'block' || def.state === 'blockstun') || (holdingBlock && ['idle', 'walk'].includes(def.state))) && def.onGround();
  const sx = m.srcX !== undefined ? m.srcX : att.x, fx = m.dir || att.face;
  if (wasBlocking && !m.unblockable) {
    const atkDir = Math.sign(sx - def.x) || -fx || def.face;
    def.face = atkDir;
  }
  const blocking = wasBlocking && !m.unblockable;
  hitVisual({ e: 'hit', a: att.idx, d: def.idx, x: pt[0], y: pt[1], dmg: m.dmg, hs: m.hs, big: !!m.big, blk: blocking, f: fx, nc: true });
  predicted.push(performance.now());
}
function applyHit(att, def, m, pt) {
  if (M.mode === 'net') NET.matchHits = (NET.matchHits || 0) + 1;
  if (def.forestProxy) { forestHit(att, m, pt); return; }
  if (def.worldProxy) { worldHit(att, m, pt); return; }   // 开放世界：打到的是服务器上的妖物，见 22-world.js
  if (M.ot && M.phase === 'fight' && m.dmg) m = { ...m, dmg: m.dmg * OT_DMG };   // 加时赛：伤害翻倍
  if (def.jailT > 0) m = { ...m, launch: false, spike: false, knock: false, kb: [0, 0] };   // 关在醉翁亭里的人打不飞
  def.drinkT = 0;
  if (isClient()) { predictHit(att, def, m, pt); return; }   // 联机时由房主判定；加入方先播放自己出手的效果
  const fx = m.dir || att.face, sx = m.srcX !== undefined ? m.srcX : att.x;
  // 醉仙被动：醉意过半，两成几率闪开近身攻击
  if (def.ch.passive === 'drunk' && (def.drunk || 0) >= 50 && !m.isProj && !m.ult && !m.unblockable && !m.hold && ['idle', 'walk', 'air'].includes(def.state) && grnd() < 0.2) {
    def.invul = Math.max(def.invul, 0.2); def.vx = fx * 320; def.drunk = Math.max(0, def.drunk - 10);
    addP({ type: 'text', text: '醉里乾坤', x: def.x, y: def.y - 110, life: 0.7, max: 0.7, rgb: '255,170,90' });
    smoke(def.x, def.y - 50, 4); SFX.dash();
    return;
  }
  // 月镜：格开近身攻击并反斩（飞行道具和大招无效）
  if (def.state === 'skill' && def.parryT > 0 && !m.isProj && !m.ult) { parry(def, att, pt); def.skill2CD = 0; return; }
  // 雷鸣：金刚雷铠招架反击（吸收近战攻击并引动天雷反制敌首）
  if (def.state === 'skill' && def.thunderGuardT > 0 && !m.ult) {
    thunderGuardCounter(def, att, pt);
    return;
  }
  const holdingBlock = !!(def.ctrl && def.ctrl.held && def.ctrl.held.down);
  const wasBlocking = ((def.state === 'block' || def.state === 'blockstun') || (holdingBlock && ['idle', 'walk'].includes(def.state))) && def.onGround();
  if (wasBlocking && !m.unblockable) {
    const atkDir = Math.sign(sx - def.x) || -fx || def.face;
    def.face = atkDir;
  }
  const blocking = wasBlocking && !m.unblockable;
  const ev = { e: 'hit', a: att.idx, d: def.idx, x: pt[0], y: pt[1], dmg: m.dmg, hs: m.hs, big: !!m.big, wb: wasBlocking && !!m.big, blk: blocking, f: fx };
  const mm = att.ch.meterMul || 1;

  // 体量压制与动量碰撞比 (Kinetic Impact Ratio)
  const attWeight = (att.ch && att.ch.stat && att.ch.stat.weight) || 1;
  const defWeight = (def.ch && def.ch.stat && def.ch.stat.weight) || 1;
  const massRatio = clamp(attWeight / defWeight, 0.45, 2.5);

  if (blocking) {
    // 精准招架（Just Guard / Perfect Parry）：在受击前 0.09s 内按下格挡
    const isJustGuard = !m.isProj && !m.unblockable && (def.blockT !== undefined && def.blockT <= (scOn() ? scJG(def) : 0.09));
    if (isJustGuard) {
      if (scOn()) scFire(def, 'blk', att, true, m);
      def.guard = Math.min(def.maxGuard, (def.guard !== undefined ? def.guard : def.maxGuard) + 12);
      def.state = 'blockstun'; def.t = 0; def.stun = 0.05;
      def.vx = fx * 80;
      if (!m.isProj) {
        att.state = 'hitstun'; att.t = 0; att.stun = 0.18; att.vx = -att.face * 180;
      }
      SFX.parry();
      haptic([20, 30, 20]);
      shake = Math.max(shake, 6);
      ring(pt[0], pt[1], 130, '120,230,255', 0.4);
      for (let i = 0; i < 6; i++) addP({ type: 'spark', x: pt[0], y: pt[1], vx: rand(-240, 240), vy: rand(-240, 240), rgb: '120,230,255', life: 0.22, max: 0.22 });
      addP({ type: 'text', text: '🛡️ 精准招架', x: def.x, y: def.y - 110, life: 0.9, max: 0.9, rgb: '120,230,255' });
      ev.justGuard = true;
      if (typeof TUT !== 'undefined' && TUT && def.idx === 0) TUT.justGuards = (TUT.justGuards || 0) + 1;
      hitVisual(ev); netEmit(ev);
      return;
    }
    const chipFrac = (def.ch && def.ch.stat && def.ch.stat.guardChip) || 0.12;
    const bm = scOn() ? scBlockMod(att, def, m) : null;   // 秘卷改格挡磨血、削架势
    def.hp = Math.max(1, def.hp - m.dmg * chipFrac * (bm ? bm.chip : 1));

    // 消耗架势耐力（Guard Posture）：重体量/高威能打小体量，架势消耗倍增
    let guardLoss = (m.dmg * 1.5 * Math.sqrt(massRatio) * (m.guardBreakMul || (m.big ? 1.35 : 1)) * (bm ? bm.guardMul : 1)) / ((def.ch && def.ch.stat && def.ch.stat.guardStab) || 1);
    if (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'guard_stab') guardLoss *= currentChaosMutation.val;
    if (def.dummy && def.ctrl && (def.ctrl.cfg ? def.ctrl.cfg.infGuard : true)) {
      guardLoss = 0;
      def.guard = def.maxGuard || 100;
    } else {
      def.guard = Math.max(0, (def.guard !== undefined ? def.guard : def.maxGuard) - guardLoss);
    }
    def.sinceBlock = 0;

    // 破防崩势判定（Guard Break）
    if (def.guard <= 0 && scOn() && scAny(def, 'brk', att)) { hitVisual(ev); netEmit(ev); return; }   // 秘卷「卸力」：这次不崩
    if (def.guard <= 0) {
      def.guard = 0;
      if (scOn()) scFire(att, 'gb', def);
      def.state = 'hitstun'; def.t = 0; def.stun = 0.85; def.rooted = true;
      def.vx = fx * 140;
      shake = 18; flashA = 0.4; flashRGB = '255,100,80';
      ring(def.x, def.y - 60, 160, '255,120,80', 0.45);
      addP({ type: 'text', text: '💥 破防崩势', x: def.x, y: def.y - 110, life: 1.2, max: 1.2, rgb: '255,120,80' });
      SFX.heavy();
      haptic(45);
      ev.guardBreak = true;
      hitVisual(ev); netEmit(ev);
      return;
    }

    def.state = 'blockstun'; def.t = 0;
    def.stun = (0.08 + m.hs * 0.7) * ((def.ch && def.ch.stat && def.ch.stat.poise) || 1);
    const isDefFixed = def.dummy && def.ctrl && (def.ctrl.cfg ? def.ctrl.cfg.fixed : def.ctrl.mode === 'fixed');
    def.vx = isDefFixed ? 0 : fx * (180 + Math.abs(m.kb[0]) * 0.35) * Math.sqrt(massRatio);
    if (isDefFixed) { def.vy = 0; def.y = 0; }
    if (!m.isProj) att.vx -= att.face * (120 / Math.sqrt(massRatio));
    att.meter = Math.min(100, att.meter + 0.6 * mm); def.meter = Math.min(100, def.meter + 1.5);
    if (scOn()) scFire(def, 'blk', att, false, m);
    hitVisual(ev); netEmit(ev);
    return;
  }
  // 霸体：普通攻击打不断，减伤 20%（只吃 80% 伤害）
  const defRating = (def.ch && def.ch.stat && def.ch.stat.defRating) || 1;
  if (def.armorT > 0 && !m.launch && !m.unblockable && !m.hold && !m.root && def.hp - m.dmg * 0.80 > 0) {
    const dmg = (m.dmg * 0.80) / defRating;
    def.hp -= dmg; def.sinceHit = 0; def.lagDelay = 0.5;
    if (--def.armorHits <= 0) def.armorT = 0;
    if (!m.ult) att.meter = Math.min(100, att.meter + m.dmg * 0.16 * mm);
    def.meter = Math.min(100, def.meter + m.dmg * 0.14);
    if (def.ch.passive === 'armor') {
      def.meter = Math.min(100, def.meter + 2.5);
      def.skillCD = Math.max(0, def.skillCD - 0.4);
      def.skill2CD = Math.max(0, def.skill2CD - 0.4);
      ring(def.x, def.y - 60, 90, '255,200,120', 0.25);
    }
    ev.armor = true; ev.dd = dmg;
    hitVisual(ev); netEmit(ev);
    return;
  }
  if (m.chip) {   // 只掉血：不会硬直、不会飞起
    const chipDmg = m.dmg / defRating;
    def.hp = Math.max(def.dummy ? 1 : 0, def.hp - chipDmg); def.sinceHit = 0; def.lagDelay = 0.5; def.flash = 0.08;
    ev.dd = chipDmg; ev.nc = true; ev.cn = def.comboHits;
    if (def.hp <= 0 && M.phase === 'fight') {
      def.state = 'launched'; def.vy = -520; def.vx = fx * 400; def.y = Math.min(def.y, -1);
      fighterDown(def, att, ev);
    }
    hitVisual(ev); netEmit(ev); return;
  }
  def.sinceHit = 0;
  if (!m.noStun || def.hp <= 0) {
    def.armorT = 0; def.parryT = 0;
    if (def.state === 'skill') {
      if (def.t < 0.12) { if (def.skill === def.ch.skill2) def.skill2CD = 0; else def.skillCD = 0; }
      def.skill = null;
    }
  }
  def.comboHits++;
  const isCounter = !m.isProj && def.moveName !== 'dl' && ((def.state === 'attack' && def.move && def.t < (def.move.su || 0.15)) || (def.state === 'skill' && def.t < 0.2));
  const scale = m.noScale ? 1 : Math.max(0.35, 1 - (att.ch.scaling || 0.08) * (def.comboHits - 1));
  let dmg = (m.dmg * scale * balDmg(att, m)) / defRating;
  if (isCounter) {
    ev.counter = true;
    const critMul = (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'crit') ? currentChaosMutation.val : 1.2;
    dmg *= critMul;
    ev.big = true;
  }
  if (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'dmg') {
    dmg *= currentChaosMutation.val;
  }
  if (M.mode === 'mayhem') {
    dmg *= (m.ult ? 5.2 : (m.skill || m.isProj ? 4.5 : 3.8));
  }
  if (isRaid() && att === B && att.bossDmgMul) {
    dmg *= att.bossDmgMul;   // 融魂首领伤害小幅提高 (1.25x)
  }
  // 现实相向冲锋迎击动能加成（Relative Velocity Impact）：双方相向冲锋或飞冲碰撞时，伤害自然放大 5%~25%
  if (!m.isProj && !m.ult) {
    const vAtt = att.vx * att.face; // 朝向正向速度
    const vDef = -def.vx * att.face; // 迎面撞向攻击者的速度
    const relativeV = Math.max(0, vAtt + vDef);
    if (relativeV > 320) {
      const vBonus = clamp((relativeV - 320) / 1600, 0, 0.25);
      dmg *= (1 + vBonus);
      if (vBonus >= 0.12 && !isClient()) {
        addP({ type: 'text', text: '迎锋破阵', x: pt[0], y: pt[1] - 48, life: 0.55, max: 0.55, rgb: '255,230,130' });
      }
    }
  }
  if (att.buffT > 0 && !m.isProj) { dmg *= 1.5; att.buffT = 0; ev.big = true; }
  if (att.ch.passive === 'drunk') dmg *= 1 + (att.drunk || 0) * 0.005;
  if (att.ch.passive === 'bind' && def.hookedT > 0 && !m.ult) { dmg *= 1.25; ev.big = true; }
  if (att.ch.passive === 'rhythm' && !m.isProj && !m.ult && att.state === 'attack') att.notes = Math.min(3, (att.notes || 0) + 1);
  if (att.ch.passive === 'drunk' && !m.ult) att.drunk = Math.min(100, (att.drunk || 0) + 4);
  if (att.ch.passive === 'needlemark' && (m.isProj || m.mark)) {
    def.needleMark = 3.5;
  }
  // 墨羽被动：墨韵护体（Ink Barrier）—— 当墨羽墨水 >= 25 时，受击消耗 12 墨水抵消 20% 伤害并激荡墨雾
  if (def.ch && def.ch.id === 'moyu' && (def.ink || 0) >= 25 && !m.hold && dmg > 8) {
    def.ink = Math.max(0, def.ink - 12);
    dmg *= 0.80;
    if (!RESIM) {
      smoke(def.x, def.y - 50, 4);
      addP({ type: 'text', text: '墨韵护体 -20%', x: def.x, y: def.y - 110, life: 0.65, max: 0.65, rgb: '160,160,190' });
    }
  }
  // 凌霜枪尖机制：最远端枪尖命中增伤且大幅挑空，贴身过近被压制削伤
  if (att.ch.passive === 'tip' && !m.isProj && !m.ult) {
    const dist = Math.abs(def.x - att.x);
    if (dist >= 142) {
      dmg *= 1.25; m = { ...m, launch: true }; ev.big = true;
      ring(pt[0], pt[1], 100, '170,220,255', 0.35);
      camImpact(pt[0], pt[1], 0.22, 0.35);
      SFX.frostHit(1.1);
      addP({ type: 'text', text: '枪尖', x: pt[0], y: pt[1] - 40, life: 0.5, max: 0.5, rgb: '170,220,255' });
    } else if (dist < 72) {
      dmg *= 0.38; m = { ...m, launch: false };
      addP({ type: 'text', text: '贴身', x: pt[0], y: pt[1] - 30, life: 0.4, max: 0.4, rgb: '160,170,190' });
    }
  }
  // 问剑密卷（爬塔、天魔讨伐）：秘卷改伤害、闪避、保命，都在 22-scrolls.js
  let scPre = null;
  if (scOn()) {
    scPre = scDamage(att, def, m, ev, dmg, isCounter);
    if (scPre.cancel) { if (!scPre.dodged) { ev.dd = 0; hitVisual(ev); netEmit(ev); } return; }
    dmg = scPre.dmg; m = scPre.m;
  }

  {
    if (m.exact) dmg = m.dmg;
    def.hp = Math.max(m.hold ? 1 : 0, def.hp - dmg);
    if (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'vamp' && att.hp > 0 && !m.chip) {
      const leech = Math.round(dmg * currentChaosMutation.val);
      if (leech > 0) {
        att.hp = Math.min(att.maxHp, att.hp + leech);
        att.lagHp = Math.min(att.maxHp, att.lagHp + leech);
        addP({ type: 'text', text: `+${leech} 🩸`, x: att.x, y: att.y - 120, life: 0.7, max: 0.7, rgb: '255,100,100' });
      }
    }
  }
  if (def.dummy) def.hp = Math.max(1, def.hp);
  if (scPre) scAfterHit(att, def, m, ev, dmg, isCounter, scPre);
  att.hitConfirmed = true;
  const chaosMeterMul = (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'meter_gain') ? currentChaosMutation.val : 1;
  if (!m.ult) att.meter = Math.min(100, att.meter + m.dmg * 0.18 * mm * chaosMeterMul);
  def.meter = Math.min(100, def.meter + m.dmg * (m.isProj ? 0.08 : 0.14));
  if (!m.noStun || def.hp <= 0) def.move = null;
  if (m.noStun && def.hp > 0) { /* 不僵直：只掉血，对手手上的动作照常 */ }
  else if (m.knock && def.hp > 0) { def.state = 'launched'; def.t = 0; def.vx = m.kb[0] * fx * 0.5 * Math.sqrt(massRatio); def.vy = -300; def.y = Math.min(def.y, -1); def.invul = 1.5; def.spiked = false; def.juggle = 0; ev.knock = true; }
  else if (m.root && def.hp > 0) { def.state = 'hitstun'; def.t = 0; def.stun = m.stun; def.vx = 0; def.rooted = true; ev.root = true; }
  else if (m.hold) { def.state = 'held'; }
  else {
    const air = def.y < -2 || def.state === 'launched' || def.state === 'held';
    if (m.launch || air || def.hp <= 0) {
      def.juggle++;
      if (def.juggle >= 3 && def.hp > 0) {
        // 空中连段平衡：连续浮空受击最多 3 次，随后震飞受身脱离以安全重立
        def.state = 'launched'; def.t = 0;
        def.vx = fx * 560 * Math.min(1.4, Math.max(0.7, Math.sqrt(massRatio)));
        def.vy = -180;
        def.invul = 0.65;
        def.spiked = false;
        def.airRecover = true;
        def.juggle = 0;
        addP({ type: 'text', text: '💨 浮空脱离', x: def.x, y: def.y - 80, life: 0.8, max: 0.8, rgb: '200,230,255' });
        ring(def.x, def.y - 50, 140, '200,230,255', 0.35);
      } else {
        const js = Math.max(0.45, 1 - 0.1 * (def.juggle - 1));
        def.state = 'launched'; def.t = 0;
        const chaosKb = (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'kb') ? currentChaosMutation.val : 1;
        def.vx = m.kb[0] * fx * Math.min(1.4, Math.max(0.7, Math.sqrt(massRatio))) * chaosKb;
        const baseVy = m.spike ? m.kb[1] : (m.kb[1] === 0 ? -320 * js : m.kb[1] * js);
        def.vy = baseVy * (m.spike ? 1 : Math.min(1.25, Math.max(0.82, 1 / Math.cbrt(defWeight))));
        def.spiked = !!m.spike; if (!m.spike) def.bounced = def.bounced && air;
        def.y = Math.min(def.y, -1);
      }
    } else {
      const comboDecay = m.noScale ? 1 : Math.max(0.48, 1 - 0.075 * (def.comboHits - 1));
      const hitStunDur = m.stun * comboDecay * ((def.ch && def.ch.stat && def.ch.stat.poise) || 1) * Math.min(1.22, Math.max(0.85, Math.pow(massRatio, 0.25)));
      const kbMul = m.noScale ? 1 : Math.min(1.45, 1 + 0.05 * (def.comboHits - 1));
      const chaosKb = (M.mode === 'chaos' && currentChaosMutation && currentChaosMutation.type === 'kb') ? currentChaosMutation.val : 1;
      def.state = 'hitstun'; def.t = 0; def.stun = hitStunDur; def.vx = m.kb[0] * fx * kbMul * Math.min(1.4, Math.max(0.7, Math.sqrt(massRatio))) * chaosKb;
    }
  }
  if (def.dummy && def.ctrl && (def.ctrl.cfg ? def.ctrl.cfg.fixed : def.ctrl.mode === 'fixed') && def.hp > 0) { def.state = 'hitstun'; def.t = 0; def.stun = 0.2; def.vx = 0; def.vy = 0; def.y = 0; def.juggle = 0; def.invul = 0; }
  if (att.y < -2 && att.state === 'attack') att.vy = Math.min(att.vy, -170);
  ev.cn = def.comboHits; ev.dd = dmg;
  if (def.hp <= 0 && M.phase === 'fight') {
    def.vx = fx * 480; def.vy = Math.min(def.vy, -520); def.state = 'launched'; def.y = Math.min(def.y, -1);
    fighterDown(def, att, ev);
  }
  hitVisual(ev); netEmit(ev);
}
// 有人被打倒：1v1 直接判这回合；2v2 队友还站着时只是倒下一人，队友进入「孤军奋战」（数值见 01-core.js）
function fighterDown(def, att, ev) {
  if (is2v2()) {
    const mate = def === A ? C : def === C ? A : def === B ? D : B;
    if (mate && !mate.hidden && mate.hp > 0) {
      def.invul = 99;
      if (!M.flags['buff_' + mate.idx]) {
        M.flags['buff_' + mate.idx] = true;
        mate.meter = LAST_STAND_METER; mate.buffT = LAST_STAND_T; mate.hp = Math.min(mate.maxHp, mate.hp + LAST_STAND_HEAL); mate.lagHp = Math.max(mate.lagHp, mate.hp);
        addP({ type: 'callout', text: '击破', x: def.x, y: def.y - 80, life: 0.9, max: 0.9, rgb: att.look.slash, scale: 2.2 });
        addP({ type: 'text', text: '🔥 孤军奋战 · 怒气满盈', x: mate.x, y: mate.y - 125, life: 1.2, max: 1.2, rgb: '255,210,80' });
      }
      return;
    }
  }
  M.phase = 'ko'; M.t = 0; M.koWinner = is2v2() ? att.idx % 2 : att.idx; ev.ko = true;
}
// 命中的顿帧会影响对战（顿帧里谁都不动），回滚重算和第一次算必须一模一样：两条路都只走这一个函数
function hitStopOf(ev, att) {
  if (ev.guardBreak) { hitstop = Math.max(hitstop, 0.22); return; }
  if (ev.blk) { hitstop = ev.hs * 0.7; return; }
  if (ev.armor) { hitstop = Math.max(hitstop, ev.hs * 0.6); return; }
  if (ev.counter) hitstop = Math.max(hitstop, 0.18);
  hitstop = Math.max(hitstop, ev.hs * (att.ch.hitFeel || 1));
  if (ev.ko) hitstop = 0.28;
}
// 命中的画面和声音（联机时两边都会播放）
function hitVisual(ev, quiet) {
  const att = fighterByIdx(ev.a), def = fighterByIdx(ev.d);
  if (RESIM) { hitStopOf(ev, att); return; }   // 重算：只保留影响对战的顿帧
  if (!quiet) hitStopOf(ev, att);
  if (quiet) {   // 效果已经提前播过了，只更新连击数
    if (!ev.blk && !ev.armor && !ev.nc) { const cu = comboUI[ev.a]; if (cu.t <= 0 || ev.cn === 1) { cu.n = 0; cu.dmg = 0; } cu.n = ev.cn; cu.dmg += ev.dd; cu.t = 1.4; }
    def.lagDelay = 0.5; return;
  }
  if (ev.guardBreak) {
    shake = Math.max(shake, 18); flashA = Math.max(flashA, 0.4); flashRGB = '255,100,80';
    ring(ev.x, ev.y, 160, '255,120,80', 0.45);
    addP({ type: 'text', text: '💥 破防崩势', x: def.x, y: def.y - 110, life: 1.2, max: 1.2, rgb: '255,120,80' });
    SFX.heavy();
    return;
  }
  if (ev.wb) { ring(ev.x, ev.y, 80, '255,255,255', 0.3); SFX.block(); }
  const fdir = ev.f || att.face;
  if (ev.blk) {
    shake = Math.max(shake, 3);
    blockFX(ev.x, ev.y, fdir); SFX.block();
    return;
  }
  if (ev.armor) {
    def.flash = 0.06; def.lagDelay = 0.5; shake = Math.max(shake, 4);
    ring(ev.x, ev.y, 46, '255,215,120', 0.22); blockFX(ev.x, ev.y, fdir); SFX.block();
    addP({ type: 'text', text: '霸体', x: def.x, y: def.y - 130 * def.size, life: 0.55, max: 0.55, rgb: '255,215,120' });
    return;
  }
  if (ev.counter && !quiet) {
    flashA = Math.max(flashA, 0.38); flashRGB = '255,60,50'; shake = Math.max(shake, 14);
    camImpact(ev.x, ev.y, 0.24, 0.40);
    addP({ type: 'callout', text: '破', x: ev.x, y: ev.y - 85, life: 0.75, max: 0.75, rgb: '255,75,55', scale: 2.4 });
    ring(ev.x, ev.y, 65, '255,75,55', 0.28);
  }
  if (!ev.nc) {
    const cu = comboUI[ev.a];
    if (cu.t <= 0 || ev.cn === 1) { cu.n = 0; cu.dmg = 0; }
    cu.n = ev.cn; cu.dmg += ev.dd; cu.t = 1.4;
  }
  def.flash = 0.09; def.lagDelay = 0.5;
  const feel = att.ch.hitFeel || 1;                 // 卡肉感：重武器停顿更久
  shake = Math.max(shake, ev.hs * 80 * feel);
  // 方向性震颤：沿攻击朝向施加反冲冲量
  shakeDirX = fdir * Math.min(18, ev.hs * 60 * feel);
  shakeDirY = ev.y < -60 ? -Math.min(12, ev.hs * 35 * feel) : Math.min(12, ev.hs * 35 * feel);
  if (ev.dmg >= 8) cam.zoom *= 1 + 0.015 * feel;      // 重击时镜头轻微一顿
  hitFX(ev.x, ev.y, clamp(ev.dmg / 8, 0.5, 1.8), att.look.slash, fdir);
  if (!quiet && is2v2() && (ev.big || ev.ult || ev.dmg >= 14) && ARENA2V2.scars) {   // 地面焦痕只属于 2v2 擂台，1v1 打人不该在脚下留圈
    ARENA2V2.scars.push({ x: ev.x, r: ev.ult ? 62 : 44, life: 4.0, max: 4.0, rgb: att.look.slash || '255,215,120' });
    if (ARENA2V2.scars.length > 18) ARENA2V2.scars.shift();
  }
  if (ev.a === localIdx() && ev.cn) MSTAT.maxcombo = Math.max(MSTAT.maxcombo, ev.cn);
  { const atk = fighterByIdx(ev.a), rt = atk && CHAR_RARITY[atk.ch.id];   // 稀有度越高，命中特效越华丽
    if (atk && !ev.blk && !quiet && rt === 'rare') ring(ev.x, ev.y, 46, atk.look.slash, 0.18);
    else if (atk && !ev.blk && !quiet && rt === 'legend') {
      ring(ev.x, ev.y, 72, atk.look.slash, 0.24); ring(ev.x, ev.y, 34, '255,240,200', 0.18);
      for (let i = 0; i < 8; i++) {
        const a = rand(0, 6.28), v = rand(150, 380);
        addP(atk.ch.id === 'moyu' ? { type: 'ink', x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, life: 0.5, max: 0.5, r: rand(2, 4), rgb: '15,15,22' }
          : { type: 'spark', x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4, max: 0.4, rgb: atk.ch.id === 'yuehua' ? '235,228,255' : '222,236,255', w: 1.6, drag: 4 });
      }
    } }
  if (!ev.blk && !quiet && fighterByIdx(ev.a)) skinHitFX(fighterByIdx(ev.a), ev);
  if (M.mode === 'mayhem' && !quiet) {
    shake = Math.max(shake, 24);
    flashA = Math.max(flashA, 0.55);
    flashRGB = att.look.slash || '255,215,80';
    ring(ev.x, ev.y, 160, att.look.slash || '255,215,80', 0.42);
    ring(ev.x, ev.y, 280, '255,240,160', 0.5);
    slashLine(ev.x, ev.y, rand(-0.8, 0.8), att.look.slash);
    slashLine(ev.x, ev.y, rand(-0.8, 0.8), '255,240,160');
    if (ev.big || ev.ult) {
      slashLine(ev.x, ev.y, rand(-0.8, 0.8), '255,60,60');
      ring(ev.x, ev.y, 380, '255,220,80', 0.6);
    }
    for (let i = 0; i < 28; i++) {
      const a = rand(0, 6.28), v = rand(280, 720);
      addP({ type: 'spark', x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.65, max: 0.65, rgb: i % 2 === 0 ? '255,215,80' : att.look.slash, w: 3.5, drag: 2.6 });
    }
  }
  if (!quiet && (ev.dd || 0) > 0) {   // 伤害数字：从命中点弹出来往上飘，越重越大
    const dd = Math.round(ev.dd * 10) / 10, big = dd >= 8;
    addP({ type: 'dmg', text: String(dd), x: ev.x + rand(-22, 22), y: ev.y - 20 - ((ev.cn || 0) % 3) * 16, vx: rand(-60, 60), vy: -150, g: 260, life: 0.85, max: 0.85,
      s: ev.blk ? 0.62 : clamp(0.72 + dd / 20, 0.75, 1.25), rgb: ev.blk ? '170,180,200' : big ? '255,210,90' : '255,250,240', edge: fighterByIdx(ev.a) ? fighterByIdx(ev.a).look.slash : '255,255,255' });
  }
  if (M.mode === 'train' && ev.d === 1) { TRAIN.total += ev.dd || 0; TRAIN.hits.push([clock, ev.dd || 0]); }
  if (ev.root) { for (let i = 0; i < 14; i++) addP({ type: 'ink', x: def.x + rand(-30, 30), y: -rand(0, 30), vx: rand(-60, 60), vy: rand(-200, -40), g: 900, life: 0.7, max: 0.7, r: rand(2, 5), rgb: '15,15,22' }); addP({ type: 'text', text: '定', x: def.x, y: def.y - 130, life: 0.8, max: 0.8, rgb: '210,210,230' }); }
  SFX.hit(Math.min(1.2, 0.5 + ev.dmg / 12));
  if (!ev.blk) {
    const elem = ev.elem || (att && (
      att.ch.id === 'leiming' ? 'thunder' :
      att.ch.id === 'lingshuang' ? 'frost' :
      att.ch.id === 'liuyun' ? 'wind' :
      att.ch.id === 'moyu' ? 'ink' :
      (att.ch.id === 'zuixian' && (ev.burn || (att.drunk || 0) >= 30)) ? 'fire' : null
    ));
    if (elem && SFX[elem + 'Hit']) {
      SFX[elem + 'Hit'](Math.min(1.4, 0.55 + ev.dmg / 12));
    }
  }
  if (ev.big) { slashLine(ev.x, ev.y, rand(-0.35, 0.35), att.look.slash); flashA = Math.max(flashA, 0.35); flashRGB = att.look.slash; }
  if (ev.dd && ev.dd >= 15 && !ev.blk) {
    const pitch = att && att.ch && att.ch.stat && att.ch.stat.weight > 1.1 ? 0.85 : 1.1;
    if (Math.random() < 0.45) SFX.voiceHurt(pitch);
  }
  if (ev.ko) {
    slowmo = 1.3; shake = 26; flashA = 0.7; flashRGB = '255,255,255';
    camImpact(ev.x, ev.y, 0.42, 1.4);
    say('斩', 1.6, 'ko'); SFX.ko(); SFX.voiceHurt(0.75);
  }
}
function pushApart() {
  if (B.hidden) return;
  const skip = f => f.hidden || f.hp <= 0 || ['dash', 'special', 'launched', 'knockdown', 'held'].includes(f.state) || (f.state === 'skill' && SKILLS[f.skill] && SKILLS[f.skill].pass);
  const list = allFighters();
  for (let i = 0; i < list.length; i++) {
    const f1 = list[i];
    if (skip(f1)) continue;
    for (let j = i + 1; j < list.length; j++) {
      const f2 = list[j];
      if (skip(f2) || Math.abs(f1.y - f2.y) > 90) continue;
      const dx = f2.x - f1.x, ov = 38 - Math.abs(dx);
      if (ov > 0) {
        const s = dx === 0 ? f1.face : Math.sign(dx);
        f1.x = clamp(f1.x - s * ov / 2, WALL, STAGE_W - WALL);
        f2.x = clamp(f2.x + s * ov / 2, WALL, STAGE_W - WALL);
        if (Math.abs(f2.x - f1.x) < 38) { if (f1.x <= WALL + 1) f2.x = f1.x + 38; else if (f2.x >= STAGE_W - WALL - 1) f1.x = f2.x - 38; }
      }
    }
  }
}

