// ======================= 判定 =======================
// 本文件：攻击判定和打中之后的结算。
//   hitbox / hurtbox：攻击框和受击框；tryHit：这一帧有没有打中；predictHit：给 AI 用的"现在出手打不打得到"
//   applyHit：打中以后的一切（伤害、格挡、破防、击退、挑飞、顿帧、加气、秘卷效果）
//   fighterDown / hitStopOf / hitVisual：倒地、顿帧长短、打击特效；pushApart：两人别重叠
// 找 bug 提示：训练场里按 F1 打开判定框透视（debugHitbox）能直接看到框；伤害数字不对就在 applyHit 里按顺序看各个倍率。
function hitbox(f, b) {
  const x0 = f.x + f.face * b[0], x1 = f.x + f.face * b[2];
  const y0 = f.y + b[1], y1 = f.y + b[3];
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}
function hurtbox(f) {
  const s = f.size || 1;
  if (f.state === 'knockdown') return [f.x - 40 * s, f.y - 20 * s, f.x + 40 * s, f.y];
  if (f.state === 'launched' || f.state === 'held') return [f.x - 28 * s, f.y - 92 * s, f.x + 28 * s, f.y + 4];
  if (f.state === 'block' || f.state === 'blockstun' || f.state === 'getup') return [f.x - 18 * s, f.y - 92 * s, f.x + 18 * s, f.y];
  return [f.x - 18 * s, f.y - 112 * s, f.x + 18 * s, f.y];
}
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// 命中带来的短暂无敌（挑飞保护、倒地保护、浮空脱离）只防「打出这一下的人」。
// 多人对局里别的对手照样能打到：以前这类无敌把所有人都挡在外面，围攻时看起来只有一个人的伤害生效。
// 闪避、大招这类自己带来的无敌不受影响，仍然防所有人。
function markHitInvul(def, att) {
  def.hitInvulBy = att ? att.idx : -1;
  def.hitInvulEnd = clock + def.invul;
}
function invulVs(def, att) {
  if (!(def.invul > 0)) return false;
  if (!att || def.hitInvulBy === undefined || def.hitInvulBy < 0 || att.idx === def.hitInvulBy || !isMulti()) return true;
  // 剩下的无敌不超过命中给的那一份，才算命中无敌；之后叠上更长的无敌（闪避、大招）照常防所有人
  return def.invul > (def.hitInvulEnd - clock) + 0.03;
}

// 多目标伤害衰减：1v1 与 2v2 保持 100% 原始平衡；大型团战（>=6人）同时命中多敌时平滑递减避免瞬间团灭
function multiTargetScale(hitIndex) {
  if (hitIndex <= 0) return 1;
  const total = typeof allFighters === 'function' ? allFighters().length : 2;
  if (total < 6) return 1;
  return Math.max(0.68, 1 - hitIndex * 0.1);
}

// 统一矩形判定框多目标检索（支持 1v1 / 2v2 / 3v3 / 5v5 / 8v8 及跨层垂直判定）
function findTargetsInBox(f, hb, opts) {
  const o = opts || {};
  const list = isMulti() ? foesOf(f) : [foeOf(f)];
  const out = [];
  for (const ef of list) {
    if (!ef || ef.hidden || ef.hp <= 0) continue;
    if (!o.ignoreInvul && invulVs(ef, f)) continue;
    if (o.exclude && o.exclude.includes(ef.idx)) continue;
    if (!overlap(hb, hurtbox(ef))) continue;
    out.push(ef);
  }
  out.sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y));
  return out;
}

// 统一椭圆/圆形范围多目标检索（适配震波、雷暴、箭雨爆炸等五层战场 AoE）
function findTargetsInRadius(f, cx, cy, rx, ry, opts) {
  const o = opts || {};
  const rY = ry || rx;
  const list = isMulti() ? foesOf(f) : [foeOf(f)];
  const out = [];
  for (const ef of list) {
    if (!ef || ef.hidden || ef.hp <= 0) continue;
    if (!o.ignoreInvul && invulVs(ef, f)) continue;
    if (o.exclude && o.exclude.includes(ef.idx)) continue;
    const hu = hurtbox(ef);
    const nx = clamp(cx, hu[0], hu[2]), ny = clamp(cy, hu[1], hu[3]);
    const dx = (nx - cx) / Math.max(1, rx), dy = (ny - cy) / Math.max(1, rY);
    if (dx * dx + dy * dy <= 1) out.push(ef);
  }
  out.sort((a, b) => Math.hypot(a.x - cx, (a.y - 55) - cy) - Math.hypot(b.x - cx, (b.y - 55) - cy));
  return out;
}

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
      const hb = hitbox(f, f.move.box);
      ctx.strokeStyle = isAct ? 'rgba(255, 45, 65, 0.95)' : isStart ? 'rgba(255, 195, 50, 0.85)' : 'rgba(80, 160, 255, 0.75)';
      ctx.fillStyle = isAct ? 'rgba(255, 45, 65, 0.28)' : isStart ? 'rgba(255, 195, 50, 0.12)' : 'rgba(80, 160, 255, 0.12)';
      ctx.fillRect(hb[0], hb[1], hb[2] - hb[0], hb[3] - hb[1]);
      ctx.strokeRect(hb[0], hb[1], hb[2] - hb[0], hb[3] - hb[1]);

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = isAct ? '#ff4055' : isStart ? '#ffc040' : '#60b0ff';
      ctx.textAlign = 'center';
      const frameTxt = isAct ? `活跃帧 [${Math.round((f.t - su) / STEP)}/${Math.round(ac / STEP)}F]` : isStart ? `前摇 [${Math.round(f.t / STEP)}/${Math.round(su / STEP)}F]` : `收招 [${Math.round((f.t - su - ac) / STEP)}/${Math.round(rec / STEP)}F]`;
      ctx.fillText(frameTxt, (hb[0] + hb[2]) / 2, hb[1] - 8);
    }

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    let advText = '';
    const other = foeOf ? foeOf(f) : null;
    if (other && f.state === 'attack' && f.move) {
      const remainingAtk = Math.max(0, (f.move.su || 0.04) + (f.move.ac || 0.08) + (f.move.rec || 0.18) - f.t);
      const foeStun = other.stun || 0;
      const advFrames = Math.round((foeStun - remainingAtk) / STEP);
      advText = advFrames >= 0 ? ` +${advFrames}F 优势` : ` ${advFrames}F 劣势`;
    }
    const stDesc = `${f.state}${f.stun > 0 ? ` (硬直 ${Math.round(f.stun / STEP)}F)` : ''}${advText}`;
    ctx.fillStyle = advText.includes('+') ? '#70ff90' : advText.includes('-') ? '#ff7070' : '#efe8d8';
    ctx.fillText(stDesc, f.x, f.y - 125 * (f.size || 1));
  }
  ctx.restore();
}
function tryHit(f, foe, m) {
  const hb = hitbox(f, m.box);
  if (hitBall(f, hb, m)) return;
  cujuHit(f, hb, m);
  hitClones(hb, f.idx, m.dmg);
  if (hitDecoy(f, hb)) return;
  echoCloneAttack(f, hb, m, 'basic');
  const hitSet = f.hitTargets || (f.hitTargets = []);
  const targets = isMulti()
    ? findTargetsInBox(f, hb, { exclude: hitSet })
    : (foe && foe.invul <= 0 && foe.hp > 0 && !hitSet.includes(foe.idx) && overlap(hb, hurtbox(foe)) ? [foe] : []);
  if (!targets.length) return;
  const primary = targets[0];

  // 真实物理拼刀截击机制（Dynamic Blade Clash）：活跃攻击帧相撞，按两方武器动能与体量动态判定弹刀与压制
  if (!m.isProj && !m.ult && !m.unblockable && primary.state === 'attack' && primary.move && primary.move.box && !primary.hitDone) {
    const foeSu = primary.move.su || 0.04, foeAc = primary.move.ac || 0.08;
    if (primary.t >= foeSu && primary.t <= foeSu + foeAc) {
      const foeHb = hitbox(primary, primary.move.box);
      if (overlap(hb, foeHb)) {
        const cx = (hb[0] + hb[2] + foeHb[0] + foeHb[2]) / 4;
        const cy = (hb[1] + hb[3] + foeHb[1] + foeHb[3]) / 4;
        const fWeight = (f.ch && f.ch.stat && f.ch.stat.weight) || 1;
        const foeWeight = (primary.ch && primary.ch.stat && primary.ch.stat.weight) || 1;
        const fSpeed = (f.ch && f.ch.stat && f.ch.stat.speed) || 1;
        const foeSpeed = (primary.ch && primary.ch.stat && primary.ch.stat.speed) || 1;
        const e1 = fWeight * Math.pow((m.dmg || 15) / Math.max(0.5, fSpeed), 1.15);
        const e2 = foeWeight * Math.pow((primary.move.dmg || 15) / Math.max(0.5, foeSpeed), 1.15);
        const eRatio = e1 / Math.max(0.1, e2);

        if (eRatio >= 2.2) {
          primary.hitDone = true;
          primary.state = 'hitstun'; primary.t = 0; primary.stun = 0.32; primary.vx = -primary.face * 260;
          f.vx *= 0.5;
          shake = Math.max(shake, 12); SFX.heavy(); SFX.parry(); haptic([20, 30, 20]);
          ring(cx, cy, 170, '255,200,90', 0.45);
          for (let i = 0; i < 9; i++) addP({ type: 'spark', x: cx, y: cy, vx: rand(-320, 320), vy: rand(-320, 320), rgb: '255,200,90', life: 0.25, max: 0.25 });
          addP({ type: 'text', text: '⚡ 破势荡刃', x: cx, y: cy - 40, life: 0.7, max: 0.7, rgb: '255,210,100' });
          return;
        } else if (eRatio <= 0.45) {
          f.hitDone = true;
          f.state = 'hitstun'; f.t = 0; f.stun = 0.32; f.vx = -f.face * 260;
          primary.vx *= 0.5;
          shake = Math.max(shake, 12); SFX.heavy(); SFX.parry(); haptic([20, 30, 20]);
          ring(cx, cy, 170, '255,200,90', 0.45);
          for (let i = 0; i < 9; i++) addP({ type: 'spark', x: cx, y: cy, vx: rand(-320, 320), vy: rand(-320, 320), rgb: '255,200,90', life: 0.25, max: 0.25 });
          addP({ type: 'text', text: '⚡ 破势荡刃', x: cx, y: cy - 40, life: 0.7, max: 0.7, rgb: '255,210,100' });
          return;
        } else {
          f.hitDone = true; primary.hitDone = true;
          f.vx = -f.face * clamp(210 / Math.sqrt(fWeight), 130, 280);
          primary.vx = -primary.face * clamp(210 / Math.sqrt(foeWeight), 130, 280);
          f.t = Math.max(f.t, (m.su || 0.04) + (m.ac || 0.08));
          primary.t = Math.max(primary.t, foeSu + foeAc);
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

  for (let i = 0; i < targets.length; i++) {
    const tf = targets[i];
    hitSet.push(tf.idx);
    const hu = hurtbox(tf);
    const px = (Math.max(hb[0], hu[0]) + Math.min(hb[2], hu[2])) / 2, py = (Math.max(hb[1], hu[1]) + Math.min(hb[3], hu[3])) / 2;
    const mul = multiTargetScale(hitSet.length - 1);
    const hitM = mul < 1 ? { ...m, dmg: Math.round(m.dmg * mul * 10) / 10 } : m;
    applyHit(f, tf, hitM, [px, py]);
  }
  if (!isMulti()) f.hitDone = true;
}
const predicted = [];
function predictHit(att, def, m, pt) {
  if (att.idx !== localIdx() || m.isProj) return;
  const holdingBlock = !!(def.ctrl && def.ctrl.held && def.ctrl.held.down);
  const wasBlocking = ((def.state === 'block' || def.state === 'blockstun') || (holdingBlock && ['idle', 'walk'].includes(def.state))) && def.onGround();
  const sx = m.srcX !== undefined ? m.srcX : att.x, fx = m.dir || att.face;
  const isCs2 = !!(m && m.name === 'cs2');
  if (wasBlocking && (!m.unblockable || isCs2)) {
    const atkDir = Math.sign(sx - def.x) || -fx || def.face;
    def.face = atkDir;
  }
  const isBlockedCs2 = isCs2 && wasBlocking;
  const blocking = wasBlocking && !m.unblockable && !isBlockedCs2;
  hitVisual({ e: 'hit', a: att.idx, d: def.idx, x: pt[0], y: pt[1], dmg: isBlockedCs2 ? m.dmg * 0.45 : m.dmg, hs: m.hs, big: !!m.big, blk: blocking || isBlockedCs2, blockedCs2: isBlockedCs2, f: fx, nc: true });
  predicted.push(performance.now());
}
