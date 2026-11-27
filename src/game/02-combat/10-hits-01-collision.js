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
  if (f.state === 'knockdown') return [f.x - 44 * s, f.y - 48 * s, f.x + 44 * s, f.y];   // 躺着的人框高一点，站着的普攻也能补到刀
  if (f.state === 'launched' || f.state === 'held') return [f.x - 28 * s, f.y - 92 * s, f.x + 28 * s, f.y + 4];
  if (f.state === 'block' || f.state === 'blockstun' || f.state === 'getup') return [f.x - 18 * s, f.y - 92 * s, f.x + 18 * s, f.y];
  return [f.x - 18 * s, f.y - 112 * s, f.x + 18 * s, f.y];
}
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// 命中带来的短暂无敌（挑飞保护、格挡卸力）只防「打出这一下的人」。
//   1v1 照旧写进 def.invul；多人对局记在 def.hitGuard[打的人]，别的对手照样能打，电脑队友看 def.invul 也不会以为他无敌而不出手。
//   以前这里只记一个人：谁最后打中谁就「接管」了保护，前一个人反而打不到，围攻时看起来只有一个人的伤害生效。
// 闪避、大招这类自己带来的无敌不受影响，仍然防所有人。
function hitInvul(def, att, dur) {
  if (isMulti() && att && att !== def) { (def.hitGuard || (def.hitGuard = {}))[att.idx] = clock + dur; return; }
  def.invul = dur;
}
// 倒地追击：被打倒、被摔在地上的人以前整段倒地都无敌，现在能补刀，但有上限，免得一直压着打。
//   mul：补刀伤害倍率；solo：1v1 每次倒地最多挨几下；team：多人对局每次倒地最多挨几下（每个对手各一下）
//   补刀不会把人重新打飞、也不重置倒地时间，起身照常。格挡满蓄力斩被压倒的「快速起身」不能补刀。
const OTG = { mul: 0.7, solo: 1, team: 3 };
function otgOpen(def, att) {
  if (def.state !== 'knockdown' || !(def.hp > 0) || def.escInvul || def.quickGetup || def.quickGetupPhase) return false;
  if (typeof cujuOn === 'function' && cujuOn()) return false;   // 墨球蹴鞠不比气血，倒地照旧整段无敌，大家去抢球
  const by = def.otgBy || [];
  if (!isMulti()) return by.length < OTG.solo;
  return by.length < OTG.team && !(att && by.includes(att.idx));
}
// 对这个出手的人来说还剩多少秒无敌（0 就是打得到）。电脑出手前也看这个
function invulLeft(def, att) {
  const g = att && def.hitGuard ? def.hitGuard[att.idx] : 0;
  const own = g > clock ? g - clock : 0;
  if (def.state === 'knockdown' && otgOpen(def, att)) return own;
  return Math.max(own, def.invul > 0 ? def.invul : 0);
}
function invulVs(def, att) { return invulLeft(def, att) > 0; }

// 多目标伤害衰减：1v1 与 2v2 保持 100% 原始平衡；大型团战（>=6人）同时命中多敌时平滑递减避免瞬间团灭
function multiTargetScale(hitIndex) {
  if (hitIndex <= 0) return 1;
  const total = typeof allFighters === 'function' ? allFighters().length : 2;
  if (total < 6) return 1;
  return Math.max(0.68, 1 - hitIndex * 0.1);
}

// ======================= 确定性空间分桶（32 人同屏碰撞/判定优化） =======================
// 仅在 >= 6 名同屏侠客时启用，1v1 / 2v2 / 同袍肉鸽走原路径保持 100% 字节级兼容。
// 所有桶按 f.idx 升序填入，查询结果以距离 + idx 次序排序，确保回滚与回放完全确定。
const SPATIAL_CELL = 128;
const SPATIAL_OFFSET = 512;
const SPATIAL_BUCKETS = 48;
const SPATIAL_HURT_PAD = 88;
const SPATIAL = {
  buckets: Array.from({ length: SPATIAL_BUCKETS }, () => []),
  activeCells: [],
  dirty: true,
  ver: -1,
};
function spatialCell(x) {
  const c = ((x + SPATIAL_OFFSET) * (1 / SPATIAL_CELL)) | 0;
  return c < 0 ? 0 : c >= SPATIAL_BUCKETS ? SPATIAL_BUCKETS - 1 : c;
}
function spatialInvalidate() {
  SPATIAL.dirty = true;
}
function spatialEnsure() {
  if (!SPATIAL.dirty && _afCacheVer === SPATIAL.ver) return SPATIAL;
  const all = allFighters(), n = all.length;
  const active = SPATIAL.activeCells, buckets = SPATIAL.buckets;
  for (let i = 0; i < active.length; i++) buckets[active[i]].length = 0;
  active.length = 0;
  for (let i = 0; i < n; i++) {
    const f = all[i];
    if (f.hidden) continue;
    const c = spatialCell(f.x);
    const b = buckets[c];
    if (!b.length) active.push(c);
    b.push(f);
  }
  SPATIAL.dirty = false;
  SPATIAL.ver = _afCacheVer;
  return SPATIAL;
}
const _spatialCand = [];
function spatialFoesInXRange(f, minX, maxX, out) {
  const dst = out || _spatialCand;
  dst.length = 0;
  if (!isMulti()) {
    const e = foeOf(f);
    if (e && !e.hidden && e.hp > 0) dst.push(e);
    return dst;
  }
  const all = allFighters();
  if (all.length < 6) {
    const foes = foesOf(f);
    for (let i = 0; i < foes.length; i++) {
      const e = foes[i];
      if (e && !e.hidden && e.hp > 0) dst.push(e);
    }
    return dst;
  }
  spatialEnsure();
  const myTeam = fighterTeam(f);
  const c0 = spatialCell(minX - SPATIAL_HURT_PAD), c1 = spatialCell(maxX + SPATIAL_HURT_PAD);
  const buckets = SPATIAL.buckets;
  for (let c = c0; c <= c1; c++) {
    const b = buckets[c];
    for (let i = 0; i < b.length; i++) {
      const e = b[i];
      if (e.hp > 0 && fighterTeam(e) !== myTeam) dst.push(e);
    }
  }
  if (dst.length > 1) dst.sort((a, b) => a.idx - b.idx);
  return dst;
}

// 统一矩形判定框多目标检索（支持 1v1 / 2v2 / 3v3 / 5v5 / 8v8 / 16v16 / 四象 4 队及跨层垂直判定）
function findTargetsInBox(f, hb, opts) {
  const o = opts || {};
  const multi = isMulti();
  const out = [];
  if (multi && allFighters().length >= 6) {
    spatialEnsure();
    const myTeam = fighterTeam(f);
    const c0 = spatialCell(hb[0] - SPATIAL_HURT_PAD), c1 = spatialCell(hb[2] + SPATIAL_HURT_PAD);
    const buckets = SPATIAL.buckets, excl = o.exclude, ign = o.ignoreInvul;
    for (let c = c0; c <= c1; c++) {
      const b = buckets[c];
      for (let i = 0; i < b.length; i++) {
        const ef = b[i];
        if (ef.hp <= 0 || fighterTeam(ef) === myTeam) continue;
        if (!ign && invulVs(ef, f)) continue;
        if (excl && excl.includes(ef.idx)) continue;
        if (!overlap(hb, hurtbox(ef))) continue;
        out.push(ef);
      }
    }
  } else {
    const list = multi ? foesOf(f) : [foeOf(f)];
    for (let i = 0; i < list.length; i++) {
      const ef = list[i];
      if (!ef || ef.hidden || ef.hp <= 0) continue;
      if (!o.ignoreInvul && invulVs(ef, f)) continue;
      if (o.exclude && o.exclude.includes(ef.idx)) continue;
      if (!overlap(hb, hurtbox(ef))) continue;
      out.push(ef);
    }
  }
  if (out.length > 1) {
    const fx = f.x, fy = f.y;
    out.sort((a, b) => {
      const da = (a.x - fx) * (a.x - fx) + (a.y - fy) * (a.y - fy);
      const db = (b.x - fx) * (b.x - fx) + (b.y - fy) * (b.y - fy);
      return da - db || a.idx - b.idx;
    });
  }
  return out;
}

// 统一椭圆/圆形范围多目标检索（适配震波、雷暴、箭雨爆炸等五层战场 AoE）
function findTargetsInRadius(f, cx, cy, rx, ry, opts) {
  const o = opts || {};
  const rY = ry || rx;
  const invRx = 1 / Math.max(1, rx), invRy = 1 / Math.max(1, rY);
  const multi = isMulti();
  const out = [];
  if (multi && allFighters().length >= 6) {
    spatialEnsure();
    const myTeam = fighterTeam(f);
    const c0 = spatialCell(cx - rx - SPATIAL_HURT_PAD), c1 = spatialCell(cx + rx + SPATIAL_HURT_PAD);
    const buckets = SPATIAL.buckets, excl = o.exclude, ign = o.ignoreInvul;
    for (let c = c0; c <= c1; c++) {
      const b = buckets[c];
      for (let i = 0; i < b.length; i++) {
        const ef = b[i];
        if (ef.hp <= 0 || fighterTeam(ef) === myTeam) continue;
        if (!ign && invulVs(ef, f)) continue;
        if (excl && excl.includes(ef.idx)) continue;
        const hu = hurtbox(ef);
        const nx = clamp(cx, hu[0], hu[2]), ny = clamp(cy, hu[1], hu[3]);
        const dx = (nx - cx) * invRx, dy = (ny - cy) * invRy;
        if (dx * dx + dy * dy <= 1) out.push(ef);
      }
    }
  } else {
    const list = multi ? foesOf(f) : [foeOf(f)];
    for (let i = 0; i < list.length; i++) {
      const ef = list[i];
      if (!ef || ef.hidden || ef.hp <= 0) continue;
      if (!o.ignoreInvul && invulVs(ef, f)) continue;
      if (o.exclude && o.exclude.includes(ef.idx)) continue;
      const hu = hurtbox(ef);
      const nx = clamp(cx, hu[0], hu[2]), ny = clamp(cy, hu[1], hu[3]);
      const dx = (nx - cx) * invRx, dy = (ny - cy) * invRy;
      if (dx * dx + dy * dy <= 1) out.push(ef);
    }
  }
  if (out.length > 1) {
    out.sort((a, b) => {
      const da = (a.x - cx) * (a.x - cx) + (a.y - 55 - cy) * (a.y - 55 - cy);
      const db = (b.x - cx) * (b.x - cx) + (b.y - 55 - cy) * (b.y - 55 - cy);
      return da - db || a.idx - b.idx;
    });
  }
  return out;
}

// 调试模式判定框与帧优势透视 (Hitbox & Frame Advantage Overlay)
function drawHitboxOverlay(fighters) {
  const hc = !!(typeof SETTINGS !== 'undefined' && SETTINGS.highContrastHitbox);
  ctx.save();
  const drawBox = (x, y, w, h, stroke, fill, dash) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    if (hc) {
      ctx.setLineDash([]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
      ctx.strokeRect(x, y, w, h);
    }
    ctx.setLineDash(hc && dash ? dash : []);
    ctx.lineWidth = hc ? 2.8 : 1.5;
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  };
  for (const f of fighters) {
    if (!f || f.hidden || f.hp <= 0) continue;
    // 1. 受击框 (Hurtbox) - 绿色 / 无敌蓝色（高对比模式使用青色虚线 + 黑色描边）
    const hu = hurtbox(f);
    const huStroke = hc
      ? (f.invul > 0 ? '#ffffff' : '#00f5d4')
      : (f.invul > 0 ? 'rgba(120, 200, 255, 0.85)' : 'rgba(80, 240, 120, 0.85)');
    const huFill = hc
      ? (f.invul > 0 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 245, 212, 0.22)')
      : (f.invul > 0 ? 'rgba(120, 200, 255, 0.15)' : 'rgba(80, 240, 120, 0.15)');
    drawBox(hu[0], hu[1], hu[2] - hu[0], hu[3] - hu[1], huStroke, huFill, [8, 4]);

    // 2. 攻击框 (Hitbox) - 前摇黄色 / 活跃帧红色 / 后摇收招蓝色
    if (f.state === 'attack' && f.move && f.move.box) {
      const su = f.move.su || 0.04, ac = f.move.ac || 0.08, rec = (f.move.rec !== undefined ? f.move.rec : 0.18);
      const isStart = f.t < su;
      const isAct = f.t >= su && f.t < su + ac;
      const hb = hitbox(f, f.move.box);
      const hbStroke = hc
        ? (isAct ? '#ff2a6d' : isStart ? '#ffd60a' : '#38bdf8')
        : (isAct ? 'rgba(255, 45, 65, 0.95)' : isStart ? 'rgba(255, 195, 50, 0.85)' : 'rgba(80, 160, 255, 0.75)');
      const hbFill = hc
        ? (isAct ? 'rgba(255, 42, 109, 0.34)' : isStart ? 'rgba(255, 214, 10, 0.22)' : 'rgba(56, 189, 248, 0.2)')
        : (isAct ? 'rgba(255, 45, 65, 0.28)' : isStart ? 'rgba(255, 195, 50, 0.12)' : 'rgba(80, 160, 255, 0.12)');
      drawBox(hb[0], hb[1], hb[2] - hb[0], hb[3] - hb[1], hbStroke, hbFill, isAct ? [] : isStart ? [4, 4] : [12, 4, 3, 4]);

      ctx.font = hc ? 'bold 13px monospace' : 'bold 12px monospace';
      ctx.textAlign = 'center';
      const frameTxt = isAct ? `活跃帧 [${Math.round((f.t - su) / STEP)}/${Math.round(ac / STEP)}F]` : isStart ? `前摇 [${Math.round(f.t / STEP)}/${Math.round(su / STEP)}F]` : `收招 [${Math.round((f.t - su - ac) / STEP)}/${Math.round(rec / STEP)}F]`;
      const tx = (hb[0] + hb[2]) / 2, ty = hb[1] - 8;
      if (hc) {
        const tw = ctx.measureText(frameTxt).width + 10;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
        ctx.fillRect(tx - tw / 2, ty - 13, tw, 16);
      }
      ctx.fillStyle = isAct ? '#ff4055' : isStart ? '#ffd60a' : '#60c0ff';
      ctx.fillText(frameTxt, tx, ty);
    }

    ctx.font = hc ? 'bold 13px monospace' : 'bold 12px monospace';
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
    const sy = f.y - 125 * (f.size || 1);
    if (hc) {
      const sw = ctx.measureText(stDesc).width + 10;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
      ctx.fillRect(f.x - sw / 2, sy - 13, sw, 16);
    }
    ctx.fillStyle = advText.includes('+') ? '#70ff90' : advText.includes('-') ? '#ff7070' : '#efe8d8';
    ctx.fillText(stDesc, f.x, sy);
  }
  // 3. 飞行道具判定框 (Projectile Hitboxes)
  if (typeof projs !== 'undefined' && Array.isArray(projs)) {
    for (const p of projs) {
      if (!p || !p.w || !p.h) continue;
      const x0 = p.x - p.w / 2, y0 = p.y - p.h / 2;
      const pStroke = hc
        ? (p.owner === 0 ? '#56b4e9' : '#e69f00')
        : (p.owner === 0 ? 'rgba(80, 235, 255, 0.92)' : 'rgba(255, 145, 70, 0.92)');
      const pFill = hc
        ? (p.owner === 0 ? 'rgba(86, 180, 233, 0.28)' : 'rgba(230, 159, 0, 0.28)')
        : (p.owner === 0 ? 'rgba(80, 235, 255, 0.2)' : 'rgba(255, 145, 70, 0.2)');
      drawBox(x0, y0, p.w, p.h, pStroke, pFill, [6, 3]);
    }
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
    : (foe && !invulVs(foe, f) && foe.hp > 0 && !hitSet.includes(foe.idx) && overlap(hb, hurtbox(foe)) ? [foe] : []);
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
