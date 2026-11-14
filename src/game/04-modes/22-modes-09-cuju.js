// ======================= 墨球蹴鞠：把墨球打进对方球门 =======================
// 本文件：墨球蹴鞠的规则、墨球的物理（旋转、带球、神扑、异象球场）、进球和开球、电脑踢球的思路（CujuAICtrl）、球场和比分的画法、模式卡上的按钮。
// 规则：两边各一个球门（A/C 守左门、B/D 守右门），场中一颗墨球。普攻和技能打中墨球就把它打飞，先达到制胜球数（默认 3 球）的一方赢；
//   到时间比分领先的一方赢，平分进「金球决胜」，谁先进球谁赢。不比气血：侠客挨打照样硬直、倒地，但气血一直是满的。
// 各侠客的技能自然变成不同的踢法：勾陈的飞锤勾住墨球拽回身前，磁仙负极吸球、正极把球弹飞，千机铁球/傀儡与离影分身可截球，铁山震地挑球，凌霜寒冰滑球，
//   格挡（↓）能挡下飞来的墨球（精准格挡触发神扑）。
// 状态全在 M.cuju 里（球的位置速度、比分、进球后的停顿），跟着 M 进回滚存档；物理只用固定步长，不用随机数。
// 找 bug 提示：球被打出去的方向和力度在 cujuHit；撞人、撞门框在 cujuBallStep；进球判定在 cujuGoalCheck；电脑在 CujuAICtrl.think。
const CUJU = {
  W: 2400,          // 球场宽度（含两边的墙）
  R: 24,            // 墨球默认半径
  G: 1500,          // 墨球的重力，比侠客轻一些，飘得更久
  GD: 110,          // 球门进深：墙到门柱的距离
  GH: 190,          // 球门高度（横梁下沿），比侠客高一截，跳起来够得着
  BAR: 14,          // 横梁厚度
  target: 3,        // 默认先进几球获胜
  time: 150,        // 一局多少秒
  pause: 2.2,       // 进球后停多久再开球
  floorE: 0.55,     // 落地弹性
  wallE: 0.62,      // 撞墙弹性
  maxV: 2300,       // 墨球最快速度
  roll: 1.6,        // 地上滚动的阻力：越大停得越快（轻击一脚大约滚四五百）
  ceil: -1150,      // 天顶
};
const CUJU_CHAOS_LIST = [
  { id: 'big', name: '巨型墨球' },
  { id: 'lowg', name: '轻功低重' },
  { id: 'fire', name: '烈焰疾球' },
  { id: 'fastmeter', name: '双倍蓄气' },
];
const cujuOn = () => M.mode === 'cuju' || !!(typeof netRoom === 'function' && netRoom() && netRoom().rule === 'cuju');
const cujuBall = () => (M.cuju && M.cuju.ball) || null;
const cujuTarget = () => (M.cuju && M.cuju.target) || M.cujuTarget || CUJU.target;
const cujuBallR = () => (M.cuju && M.cuju.chaos === 'big' ? 36 : CUJU.R);
const cujuSide = f => (f && f.idx % 2) || 0;               // 0 是 A/C 一边（守左门、攻右门），1 是 B/D 一边
const cujuAttackDir = f => cujuSide(f) === 0 ? 1 : -1;
const cujuFighters = () => (typeof allFighters === 'function' ? allFighters() : [A, B]);
const CUJU_TRAIL = [];   // 墨球的拖影：只是画面，不进存档

function cujuNewBall() {
  return { x: STAGE_W / 2, y: -320, vx: 0, vy: 0, spin: 0, spinV: 0, iced: 0, last: -1, cd: [0, 0, 0, 0], held: 0 };
}
function cujuPickChaos() {
  if (!M.cuju || !M.cujuChaos) return;
  const idx = (Math.abs((M.cuju.score[0] + M.cuju.score[1] + Math.round(M.timer || 0)) * 7 + (M.cuju.touches[0] || 0)) % CUJU_CHAOS_LIST.length);
  const chosen = CUJU_CHAOS_LIST[idx];
  M.cuju.chaos = chosen.id;
  M.cuju.chaosT = 25;
  if (!RESIM) say(`球场异象 · ${chosen.name}`, 1.4, 'big');
}
// 每回合（startRound）开局：摆好双方和墨球
function cujuRoundInit() {
  const target = M.cujuTarget || CUJU.target;
  if (!M.cuju) {
    M.cuju = {
      score: [0, 0], pause: 0, golden: false, target,
      touches: [0, 0, 0, 0], shots: [0, 0], saves: [0, 0],
      topSpeed: 0, lastGoalSpeed: 0, netRipple: [0, 0],
      lastGoal: -1, kick: 0, chaos: null, chaosT: 0,
    };
  }
  M.cuju.ball = cujuNewBall();
  M.cuju.pause = 0;
  if (is2v2()) {
    A.x = STAGE_W / 2 - 420; A.face = 1;
    C.x = STAGE_W / 2 - 220; C.face = 1;
    B.x = STAGE_W / 2 + 220; B.face = -1;
    D.x = STAGE_W / 2 + 420; D.face = -1;
  } else {
    A.x = STAGE_W / 2 - 300; A.face = 1;
    B.x = STAGE_W / 2 + 300; B.face = -1;
  }
  M.timer = M.cuju.golden ? 0 : CUJU.time;
  CUJU_TRAIL.length = 0;
  if (M.cujuChaos) cujuPickChaos();
}
// 进球后重新开球：侠客回到各自半场，气、极性和冷却保留，墨球从中圈落下
function cujuKickoff() {
  const cj = M.cuju;
  const spots = is2v2()
    ? [[A, STAGE_W / 2 - 420, 1], [C, STAGE_W / 2 - 220, 1], [B, STAGE_W / 2 + 220, -1], [D, STAGE_W / 2 + 420, -1]]
    : [[A, STAGE_W / 2 - 300, 1], [B, STAGE_W / 2 + 300, -1]];
  for (const [f, x, face] of spots) {
    if (!f || f.hidden) continue;
    const keep = { meter: f.meter, pol: f.pol, skillCD: f.skillCD, skill2CD: f.skill2CD, breakCD: f.breakCD, drunk: f.drunk, ink: f.ink, fu: f.fu, notes: f.notes };
    f.reset(x); Object.assign(f, keep); f.face = face;
    if (f.ctrl && f.ctrl.clear) f.ctrl.clear();
  }
  projs.length = 0; decoys.length = 0;
  cj.ball = cujuNewBall();
  cj.pause = 0; cj.kick = 0.6;
  CUJU_TRAIL.length = 0;
  if (!RESIM) { ring(STAGE_W / 2, -320, 80, '233,196,106', 0.4); SFX.gong(); }
}

// ---------- 打中墨球 ----------
// tryHit（普攻）和 strike（近身技能）出手时都先问一下这里；打中墨球不算打中人，同一招还能接着打到对手
function cujuHit(f, hb, m) {
  if (!cujuOn() || !M.cuju || M.cuju.pause > 0 || M.phase !== 'fight') return false;
  const b = M.cuju.ball, R = cujuBallR();
  if (!b || b.cd[f.idx] > 0 || !overlap(hb, [b.x - R, b.y - R, b.x + R, b.y + R])) return false;
  const dir = m.dir || f.face || 1;
  const kb = m.kb || [0, 0], dmg = m.dmg || 10;
  const fireMul = M.cuju.chaos === 'fire' ? 1.18 : 1;
  let power = (330 + Math.abs(kb[0]) * 0.85 + dmg * 10) * fireMul;   // 轻击一脚六百上下，满蓄力斩一千五
  if (m.ult) power *= 1.25;
  let vy = kb[1] > 0 ? kb[1] * 0.9 : kb[1] * 0.85 - 220;            // 下砸的招把球往地上砸，其余的都带点弧线
  let spinV = dir * 6;
  const held = f.ctrl && f.ctrl.held;
  if (!f.onGround()) {
    // 空中击球：按住 ↓ 头槌下砸，否则凌空抽射
    if (held && held.down) { vy = Math.max(vy, 420); spinV = dir * 12; }
    else { power *= 1.12; vy = Math.min(vy, -180); spinV = dir * 10; }
  } else if (held && held.up) {
    // ↑ + 攻击：高弧度挑射越过防守
    power *= 0.86;
    vy = Math.min(vy, -760) - 160;
    spinV = -dir * 8;
  } else if (held && held.down) {
    // ↓ + 攻击：贴地抽射
    power *= 1.08;
    vy = -70;
    spinV = dir * 10;
  }
  // 侠客专属踢法加成
  const hid = f.ch && f.ch.id;
  if (hid === 'tieshan' && (kb[1] > 100 || f.state === 'skill')) {
    vy = Math.min(vy, -680);   // 铁山震地挑球，方便接空中抽射
  } else if (hid === 'lingshuang' && (f.state === 'skill' || f.state === 'special')) {
    b.iced = 2.2;              // 凌霜寒气附着：球在地上滑行更远
  } else if (hid === 'yuxiao' && (f.state === 'skill' || f.state === 'special')) {
    const goalY = -CUJU.GH * 0.5;
    vy = lerp(vy, (goalY - b.y) * 1.4, 0.35);
  }
  const maxV = M.cuju.chaos === 'fire' ? 2700 : CUJU.maxV;
  power = Math.min(power, maxV);
  if (power > 1200) spinV = dir * 14;
  b.vx = dir * power; b.vy = clamp(vy, -1500, 1500);
  b.spinV = spinV;
  b.last = f.idx; b.cd[f.idx] = 0.14; b.held = 0;
  M.cuju.touches[f.idx] = (M.cuju.touches[f.idx] || 0) + 1;
  const meterGain = M.cuju.chaos === 'fastmeter' ? 6 : 3;
  f.meter = Math.min(100, f.meter + meterGain);   // 踢球也聚气，不打人也能放大招
  const sp = Math.hypot(b.vx, b.vy);
  M.cuju.topSpeed = Math.max(M.cuju.topSpeed || 0, Math.round(sp));
  hitstop = Math.max(hitstop, power > 1300 ? 0.06 : 0.03);
  if (!RESIM) {
    const rgb = f.look.slash || '233,196,106';
    ring(b.x, b.y, power > 1300 ? 110 : 70, rgb, 0.3);
    for (let i = 0; i < 8; i++) { const a = rand(0, Math.PI * 2), v = rand(140, 360); addP({ type: 'ink', x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, life: 0.45, max: 0.45, r: rand(2, 4), rgb: '18,18,24' }); }
    SFX.ballHit();
    if (power > 1300) { shake = Math.max(shake, 9); addP({ type: 'text', text: '劲射', x: b.x, y: b.y - 50, life: 0.6, max: 0.6, rgb }); }
  }
  return true;
}
// 飞行道具碰到墨球：推着球走；勾陈的飞锤勾住墨球拽回身前；千机铁球轰击墨球
function cujuProjHits(b) {
  const R = cujuBallR(), box = [b.x - R, b.y - R, b.x + R, b.y + R];
  for (const p of projs) {
    if (p.dead || p.delay > 0 || p.cujuHit || !(p.dmg > 0) || !p.w || !p.h) continue;
    if (!overlap(projBox(p), box)) continue;
    const owner = fighterByIdx(p.owner);
    p.cujuHit = true;
    if (p.kind === 'hook' && owner) {
      const dir = Math.sign(owner.x - b.x) || -owner.face;
      b.vx = dir * 980; b.vy = -460; b.spinV = -dir * 6; p.dead = true;
      if (!RESIM) addP({ type: 'text', text: '勾球', x: b.x, y: b.y - 50, life: 0.6, max: 0.6, rgb: owner.look.slash });
    } else if (p.kind === 'ironball' && owner) {
      const dir = cujuAttackDir(owner);
      b.vx = dir * 1300; b.vy = -440; b.spinV = dir * 12;
      if (!RESIM) addP({ type: 'text', text: '傀儡轰球', x: b.x, y: b.y - 50, life: 0.6, max: 0.6, rgb: owner.look.slash });
    } else {
      const dir = Math.sign(p.vx || 0) || (owner ? owner.face : 1);
      const power = Math.min(920, 420 + p.dmg * 10);
      b.vx = dir * power; b.vy = Math.min(b.vy, -320); b.spinV = dir * 5;
    }
    b.last = p.owner; b.held = 0;
    M.cuju.topSpeed = Math.max(M.cuju.topSpeed || 0, Math.round(Math.hypot(b.vx, b.vy)));
    if (!RESIM) { ring(b.x, b.y, 60, owner ? owner.look.slash : '255,255,255', 0.25); SFX.ballHit(); }
  }
}
// 千机傀儡 & 离影分身截球
function cujuDeflectors(b) {
  const R = cujuBallR(), box = [b.x - R, b.y - R, b.x + R, b.y + R];
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 1050) return;
  for (const d of decoys) {
    if (!d || d.life <= 0) continue;
    const owner = fighterByIdx(d.owner);
    if (!owner || b.cd[owner.idx] > 0) continue;
    if (overlap([d.x - 24, (d.y || 0) - 90, d.x + 24, (d.y || 0) + 4], box)) {
      const dir = cujuAttackDir(owner);
      b.vx = dir * Math.max(760, sp * 0.9); b.vy = -360; b.last = owner.idx; b.cd[owner.idx] = 0.25;
      if (!RESIM) { ring(b.x, b.y, 65, owner.look.slash || '233,196,106', 0.25); addP({ type: 'text', text: '傀儡截球', x: b.x, y: b.y - 50, life: 0.5, max: 0.5, rgb: owner.look.slash }); SFX.ballHit(); }
      return;
    }
  }
  for (const f of cujuFighters()) {
    if (!f.clones || !f.clones.length || b.cd[f.idx] > 0) continue;
    for (const c of f.clones) {
      if (overlap(cloneBox(c), box)) {
        const dir = cujuAttackDir(f);
        b.vx = dir * Math.max(740, sp * 0.85); b.vy = -330; b.last = f.idx; b.cd[f.idx] = 0.25;
        if (!RESIM) { ring(b.x, b.y, 65, f.look.slash || '140,200,255', 0.25); addP({ type: 'text', text: '影截', x: b.x, y: b.y - 50, life: 0.5, max: 0.5, rgb: f.look.slash }); SFX.ballHit(); }
        return;
      }
    }
  }
}
// 磁仙：负极把墨球吸到身前（「磁极」吸得又快又远，平时身边也有一点吸力），正极「磁极」炸开时把球弹飞
function cujuMagnet(b) {
  for (const f of cujuFighters()) {
    if (!f.ch || f.ch.passive !== 'magnet') continue;
    const dx = f.x + f.face * 46 - b.x, dy = f.y - 40 - b.y, d = Math.hypot(dx, dy);
    if (f.state === 'skill' && f.skill === 'magfield' && f.skPh === 1) {
      if (f.magN > 0 && !f.cujuMag) {
        f.cujuMag = true;
        if (d < MAG.rPlusR * 1.6) {
          const dir = Math.sign(b.x - f.x) || f.face;
          b.vx = dir * 1650; b.vy = -620; b.last = f.idx; b.held = 0;
          if (!RESIM) { ring(b.x, b.y, 90, magRGB(1), 0.3); SFX.ballHit(); }
        }
      } else if (f.magN < 0 && d < MAG.rMinusRange && d > 8) {
        const v = clamp(2.2e7 / Math.max(60, d) ** 2, 500, 1500);
        b.vx = damp(b.vx, dx / d * v, 14, STEP); b.vy = damp(b.vy, dy / d * v, 14, STEP);
        b.last = f.idx;
      }
    } else {
      f.cujuMag = false;
      if (f.pol < 0 && d < 230 && d > 8 && f.state !== 'hitstun' && f.state !== 'launched') {   // 负极：身边的墨球慢慢靠过来，好控球
        b.vx += dx / d * 520 * STEP; b.vy += dy / d * 320 * STEP;
      }
    }
  }
}
// 墨球撞到侠客的身体：格挡就是扑救（精准格挡触发神扑，普通扑救掉一点架势），慢球带球过人，快球直接穿过去
function cujuBodies(b) {
  const R = cujuBallR();
  for (const f of cujuFighters()) {
    if (f.hidden || b.cd[f.idx] > 0) continue;
    const hu = hurtbox(f);
    const cx = clamp(b.x, hu[0], hu[2]), cy = clamp(b.y, hu[1], hu[3]);
    let nx = b.x - cx, ny = b.y - cy, d = Math.hypot(nx, ny);
    if (d >= R) continue;
    const speed = Math.hypot(b.vx, b.vy);
    const saving = (f.state === 'block' || f.state === 'blockstun') && f.onGround();
    if (!saving && speed > 900) continue;
    if (d < 0.01) { nx = Math.sign(b.x - f.x) || -f.face; ny = 0; d = 1; }
    nx /= d; ny /= d;
    b.x = cx + nx * R; b.y = Math.min(cy + ny * R, -R);
    if (saving) {
      const justParry = f.blockT <= 0.16 && speed > 800;
      if (justParry) {
        b.vx = f.face * Math.max(880, speed * 0.72); b.vy = -420;
        b.cd[f.idx] = 0.2; b.last = f.idx;
        f.meter = Math.min(100, f.meter + 15);
        M.cuju.saves[cujuSide(f)] = (M.cuju.saves[cujuSide(f)] || 0) + 1;
        if (!RESIM) { ring(b.x, b.y, 110, '140,220,255', 0.35); SFX.parry(); addP({ type: 'text', text: '神扑', x: b.x, y: b.y - 55, life: 0.85, max: 0.85, rgb: '140,240,255' }); }
      } else {
        b.vx = f.face * Math.max(320, Math.abs(b.vx) * 0.45); b.vy = -Math.max(240, Math.abs(b.vy) * 0.3);
        b.cd[f.idx] = 0.2; b.last = f.idx;
        f.guard = Math.max(0, (f.guard || 0) - (speed > 900 ? 14 : 6));
        if (speed > 650) M.cuju.saves[cujuSide(f)] = (M.cuju.saves[cujuSide(f)] || 0) + 1;
        if (!RESIM) { blockFX(b.x, b.y, f.face); SFX.block(); if (speed > 900) addP({ type: 'text', text: '扑救', x: b.x, y: b.y - 50, life: 0.7, max: 0.7, rgb: '140,220,255' }); }
      }
      continue;
    }
    // 顺畅带球：贴地慢球在身前移动时稳稳带在脚下
    if (f.onGround() && Math.abs(f.vx) > 40 && speed < 520 && -b.y < 85 && Math.sign(b.x - f.x) === f.face) {
      b.vx = damp(b.vx, f.vx * 1.08, 12, STEP);
      b.vy = Math.min(b.vy, -40);
      b.last = f.idx;
      continue;
    }
    const fvx = clamp(f.vx, -400, 400), fvy = clamp(f.vy, -400, 400);   // 冲刺、位移技能撞到球也只当是走路带了一下
    const rvx = b.vx - fvx, rvy = b.vy - fvy, dot = rvx * nx + rvy * ny;
    if (dot < 0) { b.vx -= 1.5 * dot * nx; b.vy -= 1.5 * dot * ny; }
    if (Math.sign(fvx) === Math.sign(nx)) b.vx += fvx * 0.25;   // 迎着球走才带一下，背着球走不把球往自家门里推
    const after = Math.hypot(b.vx, b.vy), cap = Math.max(850, speed);   // 碰到身体不会让球变得更快
    if (after > cap) { b.vx *= cap / after; b.vy *= cap / after; }
    if (ny > 0.5 && b.vy < 60) b.vy = 60;
    if (Math.abs(ny) < 0.5 && b.y > -R - 2) b.vy = Math.min(b.vy, -70);   // 贴地被人带着走：颠一下（碰到身体不算触球，进球记在最后出脚的人身上）
  }
}
// 圆和方块（横梁）相撞：推出去、按法线弹回
function cujuRect(b, r, e) {
  const R = cujuBallR(), cx = clamp(b.x, r[0], r[2]), cy = clamp(b.y, r[1], r[3]);
  let nx = b.x - cx, ny = b.y - cy; const d = Math.hypot(nx, ny);
  if (d >= R || d < 0.001) return false;
  nx /= d; ny /= d;
  b.x = cx + nx * R; b.y = cy + ny * R;
  const dot = b.vx * nx + b.vy * ny;
  if (dot < 0) { b.vx -= (1 + e) * dot * nx; b.vy -= (1 + e) * dot * ny; }
  return true;
}
const cujuBars = () => [[WALL, -CUJU.GH - CUJU.BAR, WALL + CUJU.GD, -CUJU.GH], [STAGE_W - WALL - CUJU.GD, -CUJU.GH - CUJU.BAR, STAGE_W - WALL, -CUJU.GH]];
function cujuBallStep(b) {
  const R = cujuBallR();
  const grav = M.cuju && M.cuju.chaos === 'lowg' ? 950 : CUJU.G;
  const maxV = M.cuju && M.cuju.chaos === 'fire' ? 2700 : CUJU.maxV;
  for (let i = 0; i < b.cd.length; i++) if (b.cd[i] > 0) b.cd[i] -= STEP;
  if (b.iced > 0) b.iced = Math.max(0, b.iced - STEP);
  b.vy += grav * STEP;
  b.vy += (b.spinV || 0) * b.vx * 0.00018 * STEP;   // 马格努斯旋球升力/下坠
  b.spinV = (b.spinV || 0) * (1 - 0.6 * STEP);
  b.vx *= 1 - 0.3 * STEP;   // 空气阻力
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > maxV) { b.vx *= maxV / sp; b.vy *= maxV / sp; }
  b.x += b.vx * STEP; b.y += b.vy * STEP;
  if (b.y > -R) {
    b.y = -R;
    if (b.vy > 150) { b.vy = -b.vy * CUJU.floorE; if (!RESIM && b.vy < -260) { dust(b.x, 0, 4); SFX.thud(); } }
    else b.vy = 0;
    const rollF = b.iced > 0 ? CUJU.roll * 0.35 : CUJU.roll;
    b.vx = damp(b.vx, 0, rollF, STEP);   // 地上滚：慢慢停下
  }
  if (b.y < CUJU.ceil) { b.y = CUJU.ceil; b.vy = Math.abs(b.vy) * 0.5; }
  if (b.x < WALL + R) { b.x = WALL + R; b.vx = Math.abs(b.vx) * CUJU.wallE; }
  if (b.x > STAGE_W - WALL - R) { b.x = STAGE_W - WALL - R; b.vx = -Math.abs(b.vx) * CUJU.wallE; }
  for (const bar of cujuBars()) {
    if (cujuRect(b, bar, 0.6) && !RESIM && sp > 400) {
      SFX.wood(); ring(b.x, b.y, 50, '255,230,180', 0.25);
      if (sp > 900) addP({ type: 'text', text: '横梁!', x: b.x, y: b.y - 40, life: 0.6, max: 0.6, rgb: '255,230,150' });
    }
  }
  b.spin += b.vx * STEP / R;
}
// 墨球整个越过门线、在横梁下面：进球。返回得分的一边（0 / 1），没进返回 -1
function cujuGoalCheck(b) {
  const R = cujuBallR();
  if (b.y < -CUJU.GH + R * 0.2) return -1;
  if (b.x < WALL + CUJU.GD - R) return 1;              // 左门（A/C 守）：B/D 一边得分
  if (b.x > STAGE_W - WALL - CUJU.GD + R) return 0;    // 右门（B/D 守）：A/C 一边得分
  return -1;
}
function cujuGoal(side) {
  const cj = M.cuju, b = cj.ball, scorer = b.last >= 0 ? fighterByIdx(b.last) : null;
  const sp = Math.round(Math.hypot(b.vx, b.vy));
  cj.score[side]++; cj.lastGoal = side; cj.pause = CUJU.pause;
  cj.lastGoalSpeed = sp;
  cj.topSpeed = Math.max(cj.topSpeed || 0, sp);
  cj.netRipple[1 - side] = 1;
  if (b.last >= 0 && cujuSide(scorer) === side) cj.shots[side]++;
  b.vx *= 0.25; b.vy *= 0.25;
  const own = scorer && cujuSide(scorer) !== side;
  hitstop = Math.max(hitstop, 0.12);
  if (!RESIM) {
    const gx = side === 0 ? STAGE_W - WALL - CUJU.GD / 2 : WALL + CUJU.GD / 2, rgb = side === 0 ? '143,240,255' : '255,138,112';
    shake = Math.max(shake, 16); flashA = Math.max(flashA, 0.35); flashRGB = rgb;
    ring(gx, -CUJU.GH / 2, 200, rgb, 0.6);
    for (let i = 0; i < 26; i++) { const a = rand(-Math.PI, 0), v = rand(200, 700); addP({ type: 'ink', x: gx, y: -CUJU.GH / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1200, life: 0.9, max: 0.9, r: rand(3, 6), rgb: '18,18,24' }); }
    SFX.gong(); SFX.heavy();
  }
  const win = cj.score[side] >= cujuTarget() || cj.golden;
  const sub = scorer ? `${scorer.look.name} · ${sp} 速` : `${sp} 速`;
  say(own ? '乌龙球' : '进球', 1.8, 'big', sub);
  if (win) cujuFinish(side);
}
function cujuFinish(w) {
  const cj = M.cuju;
  cj.pause = 99;
  M.phase = 'ko'; M.t = 0; M.koWinner = w;
}
// 每帧：updateMatch 的 fight 阶段交给这里（不按气血判胜负）
function cujuMatch() {
  const cj = M.cuju; if (!cj) return;
  if (cj.netRipple) {
    cj.netRipple[0] = Math.max(0, cj.netRipple[0] - STEP * 1.4);
    cj.netRipple[1] = Math.max(0, cj.netRipple[1] - STEP * 1.4);
  }
  if (cj.pause > 0) {
    cj.pause -= STEP;
    if (cj.pause <= 0 && M.phase === 'fight') cujuKickoff();
    return;
  }
  if (M.cujuChaos) {
    cj.chaosT = (cj.chaosT || 0) - STEP;
    if (cj.chaosT <= 0) cujuPickChaos();
  }
  if (cj.kick > 0) cj.kick -= STEP;
  if (cj.golden) return;
  M.timer = Math.max(0, M.timer - STEP);
  if (M.timer <= 0) {
    if (cj.score[0] !== cj.score[1]) { say('时间到', 1.2); cujuFinish(cj.score[0] > cj.score[1] ? 0 : 1); }
    else { cj.golden = true; sayNet('金球决胜', 1.6, 'big', 'gong'); }
  }
}
// step() 里在飞行道具之后调用：墨球的物理、撞人、进球；气血一直是满的
function cujuTick() {
  if (!cujuOn() || !M.cuju || !M.cuju.ball) return;
  for (const f of cujuFighters()) { f.hp = f.lagHp = f.maxHp; }
  if (M.phase === 'intro') return;
  const cj = M.cuju, b = cj.ball, R = cujuBallR();
  if (cj.pause > 0) {   // 进球以后：球留在网里慢慢停下
    b.vy += CUJU.G * STEP; b.x += b.vx * STEP; b.y = Math.min(-R, b.y + b.vy * STEP); if (b.y >= -R) b.vy = 0; b.vx = damp(b.vx, 0, 3, STEP);
    b.x = clamp(b.x, WALL + R, STAGE_W - WALL - R);
    return;
  }
  if (M.phase !== 'fight') return;
  if (cj.kick > 0 && b.y < -R) { b.vy = Math.min(b.vy, 260); }   // 开球：墨球缓缓落下
  cujuMagnet(b);
  cujuProjHits(b);
  cujuDeflectors(b);
  cujuBallStep(b);
  cujuBodies(b);
  const g = cujuGoalCheck(b);
  if (g >= 0) cujuGoal(g);
  if (!RESIM) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 700) { CUJU_TRAIL.push({ x: b.x, y: b.y, life: 0.22, max: 0.22, iced: b.iced > 0 }); if (CUJU_TRAIL.length > 40) CUJU_TRAIL.shift(); }
    for (const t of CUJU_TRAIL) t.life -= STEP;
    while (CUJU_TRAIL.length && CUJU_TRAIL[0].life <= 0) CUJU_TRAIL.shift();
  }
}
// 勾陈的飞锤：墨球在前方够得着时，链锤朝墨球甩（不朝对手）
function cujuAimHook() {
  if (!cujuOn() || !M.cuju || !M.cuju.ball) return;
  const b = M.cuju.ball;
  for (const p of projs) {
    if (p.kind !== 'hook' || p.cujuAimed || p.dead) continue;
    p.cujuAimed = true;
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), sp = Math.hypot(p.vx || 0, p.vy || 0);
    if (d < 560 && Math.sign(dx) === Math.sign(p.vx || 1) && sp > 0) { p.autoAim = false; p.vx = dx / d * sp; p.vy = dy / d * sp; p.life = Math.max(p.life, d / sp + 0.05); }
  }
}

// ---------- 电脑踢球 ----------
// 不用论剑的电脑：它只会盯着对手打。这里按境界调反应快慢、出脚准不准、会不会扑救、凌空抽射与协防
const CUJU_AI = {
  easy:       { react: 0.28, look: 0.12, behind: 70, reach: 95,  atkP: 0.55, skillP: 0.08, ultP: 0.2, save: 0,   tackle: 0.04, dash: 0.05 },
  normal:     { react: 0.17, look: 0.2,  behind: 58, reach: 105, atkP: 0.75, skillP: 0.16, ultP: 0.4, save: 0.4, tackle: 0.1,  dash: 0.12 },
  hard:       { react: 0.11, look: 0.26, behind: 52, reach: 110, atkP: 0.88, skillP: 0.26, ultP: 0.6, save: 0.7, tackle: 0.16, dash: 0.2 },
  impossible: { react: 0.075, look: 0.3, behind: 50, reach: 112, atkP: 0.95, skillP: 0.34, ultP: 0.8, save: 0.85, tackle: 0.2, dash: 0.25 },
  god:        { react: 0.055, look: 0.32, behind: 48, reach: 115, atkP: 1,   skillP: 0.4,  ultP: 0.9, save: 0.95, tackle: 0.24, dash: 0.3 },
};
class CujuAICtrl extends Ctrl {
  constructor(level) { super(); this.level = CUJU_AI[level] ? level : 'normal'; this.L = CUJU_AI[this.level]; this.wait = 0; }
  updateTactic() {}
  think(me, foe) {
    const cj = M.cuju, h = this.held, L = this.L;
    if (!cj || !cj.ball || cj.pause > 0 || M.phase !== 'fight') { this.clear(); return; }
    this.wait -= STEP;
    if (this.wait > 0) return;   // 反应间隔里保持上一次的按键
    this.wait = L.react * (0.7 + Math.random() * 0.6);
    const b = cj.ball, d = cujuAttackDir(me), R = cujuBallR();
    const t = L.look, px = clamp(b.x + b.vx * t, WALL + 40, STAGE_W - WALL - 40);
    const py = Math.min(-R, b.y + b.vy * t + 0.5 * CUJU.G * t * t);
    const rel = (px - me.x) * d;          // 墨球在我进攻方向的前面（正）还是身后（负）
    const ownGoalX = d > 0 ? WALL + CUJU.GD : STAGE_W - WALL - CUJU.GD;
    const hgt = -py, near = Math.abs(b.x - me.x);
    h.left = h.right = h.down = h.up = h.atk = false;
    let move = 0, face = d;

    // 扑救与回防：球快速飞向我家球门，支持低球扑救与高球跳拦
    const incoming = (b.x - me.x) * d > 0 && b.vx * d < -380;
    if (incoming && Math.abs(b.x - me.x) < 260 && Math.abs(me.x - ownGoalX) < 760 && Math.random() < L.save) {
      if (hgt < 150 && me.onGround()) { h.down = true; h.aim = d; return; }
      if (hgt >= 130 && hgt < 245 && me.onGround()) { this.press('jump'); h.aim = d; return; }
    }

    // 2v2 协同站位：如果同队队友离球更近且我在后方，适度守在禁区前策应
    let tx = px - d * L.behind;
    if (is2v2() && typeof sideFighters === 'function') {
      const mates = sideFighters(cujuSide(me)).filter(m => m !== me && !m.hidden);
      if (mates.length && Math.abs(mates[0].x - b.x) + 60 < near) {
        tx = clamp(ownGoalX + d * 360, WALL + 160, STAGE_W - WALL - 160);
      }
    }

    let rush = L.dash;
    if (rel < -10) {   // 球在身后：绕过去。靠近自家门线或慢球贴地就跳过，免得乌龙
      tx = clamp(px - d * (L.behind + 40), WALL + 55, STAGE_W - WALL - 55);
      if (near < 130 && me.onGround() && hgt < 120 && Math.abs(b.vx) < 420) this.press('jump');
      if (b.vx * d < -200 || (b.x - ownGoalX) * d < 200) rush = L.dash * 3;
    }
    const dx = tx - me.x;
    if (Math.abs(dx) > 16) move = Math.sign(dx);
    if (move) face = move;
    if (Math.abs(dx) > 300 && me.dashCD <= 0 && Math.random() < rush) this.press('dash');

    // 出脚：球在前面够得着；高难 AI 会在空旷中场蓄力劲射或迎高球跳起凌空抽射
    const ballFront = (b.x - me.x) * d, ready = ballFront > -14 && ballFront < L.reach;
    if (ready && hgt < 150 && Math.random() < L.atkP) {
      move = 0; face = d;
      if ((this.level === 'hard' || this.level === 'impossible' || this.level === 'god') && Math.abs(foe.x - me.x) > 320 && Math.abs(b.vx) < 300 && Math.random() < 0.22) {
        h.atk = true;   // 蓄力打一脚劲射
      } else {
        if (Math.abs(me.x - ownGoalX) < 380) h.up = true;   // 门前解围踢高球
        this.press('light');
      }
    } else if (ready && hgt >= 140 && hgt < 340 && me.onGround() && near < 120) {
      this.press('jump'); face = d;
    } else if (!me.onGround() && near < 115 && Math.abs(b.y - (me.y - 60)) < 95 && Math.random() < L.atkP) {
      face = d; this.press('light');
    }
    // 抢断：对手比我离球近、就在我面前
    const foeFront = (foe.x - me.x) * face;
    if (foeFront > 0 && foeFront < 95 && Math.abs(foe.x - b.x) < Math.abs(me.x - b.x) && Math.random() < L.tackle) this.press('light');
    this.useSkills(me, b, d, ballFront, hgt);
    if (move > 0) h.right = true; else if (move < 0) h.left = true;
    h.aim = face;
  }
  useSkills(me, b, d, ballFront, hgt) {
    const L = this.L, dist = Math.hypot(b.x - me.x, b.y - (me.y - 50)), id = me.ch.id;
    const toBall = Math.sign(b.x - me.x) || d;
    if (me.meter >= 100 && ballFront > 0 && ballFront < 200 && hgt < 200 && Math.random() < L.ultP * 0.3) { this.held.aim = d; this.press('special'); return; }
    if (id === 'gouchen') {   // 飞锤：球离得远、往前甩就够得着时，把球勾回身前
      if (me.skillCD <= 0 && dist > 230 && dist < 520 && Math.random() < L.skillP * 2) { this.held.aim = toBall; this.held.left = toBall < 0; this.held.right = toBall > 0; this.press('skill'); }
      return;
    }
    if (id === 'cixian') {   // 负极把球吸过来，正极贴身把球弹出去
      if (me.pol < 0 && me.skill2CD <= 0 && dist > 160 && dist < 560 && Math.random() < L.skillP * 2) this.press('skill2');
      else if (me.pol > 0 && me.skill2CD <= 0 && ballFront > 0 && ballFront < 150 && Math.random() < L.skillP * 2) { this.held.aim = d; this.press('skill2'); }
      else if (me.pol > 0 && dist > 300 && me.skillCD <= 0 && Math.random() < L.skillP) this.press('skill');
      return;
    }
    if (ballFront > 0 && ballFront < 170 && hgt < 170 && Math.random() < L.skillP) this.press(Math.random() < 0.5 || me.skill2CD > 0 ? (me.skillCD <= 0 ? 'skill' : 'skill2') : 'skill2');
  }
}

// ---------- 开局 ----------
// pvp：同一台电脑两个人（1P 键盘鼠标、2P 方向键 + K）；four：2v2 四人踢球；isWatch：两个电脑踢给你看
function startCuju(p1, p2, lv, opts = {}) {
  initAudio();
  paused = false;
  const four = !!opts.four || (Array.isArray(p1) && Array.isArray(p2));
  const pvp = !!opts.pvp, watch = !!opts.isWatch && !pvp;
  M.mode = 'cuju';
  M.level = lv || pickLevel || 'normal';
  M.round = 1; M.wins = [0, 0]; M.carry = null; M.stage = null; M.duo = null; M.map = null; M.quick = false;
  M.watchAi = watch; M.cujuPvp = pvp; M.cujuFour = four;
  M.cujuTarget = [3, 5, 7].includes(Number(opts.target)) ? Number(opts.target) : cujuPickTarget;
  M.cujuChaos = opts.chaos !== undefined ? !!opts.chaos : cujuChaosOpt;
  M.teamMutator = 'normal';
  M.cuju = null;
  if (four) {
    const t0 = Array.isArray(p1) ? p1 : [p1, (p1 + 1) % CHARS.length];
    const t1 = Array.isArray(p2) ? p2 : [p2, (p2 + 1) % CHARS.length];
    setChars(t0[0], t1[0], t0[1], t1[1]);
    A.ctrl = watch ? new CujuAICtrl(M.level === 'easy' ? 'normal' : M.level) : human[0];
    C.ctrl = new CujuAICtrl(M.level === 'easy' ? 'normal' : M.level);
    B.ctrl = pvp ? human[1] : new CujuAICtrl(M.level);
    D.ctrl = new CujuAICtrl(M.level);
    A.meter = B.meter = C.meter = D.meter = 0;
  } else {
    setChars(p1, p2);
    A.ctrl = watch ? new CujuAICtrl(M.level === 'easy' ? 'normal' : M.level) : human[0];
    B.ctrl = pvp ? human[1] : new CujuAICtrl(M.level);
    A.meter = B.meter = 0;
  }
  human[0].clear(); human[1].clear();
  showScreen(null);
  REC.on = false;
  startRound();
  say(four ? '2v2 墨球蹴鞠' : '墨球蹴鞠', 1.4, 'big', `先进${cujuTarget()}球获胜`);
}
let cujuPickTarget = CUJU.target;
let cujuChaosOpt = false;
const cujuTargetSeg = document.getElementById('cujuTargetSeg');
if (cujuTargetSeg) {
  cujuTargetSeg.addEventListener('click', e => {
    const b = e.target.closest('button[data-target]');
    if (!b) return;
    cujuPickTarget = Number(b.dataset.target) || 3;
    cujuTargetSeg.querySelectorAll('button[data-target]').forEach(btn => btn.classList.toggle('sel', Number(btn.dataset.target) === cujuPickTarget));
  });
}
const cujuChaosChk = document.getElementById('cujuChaosChk');
if (cujuChaosChk) cujuChaosChk.addEventListener('change', () => { cujuChaosOpt = !!cujuChaosChk.checked; });
const cujuOptsNow = (extra = {}) => ({ level: pickLevel, target: cujuPickTarget, chaos: cujuChaosOpt, ...extra });
const cujuStartBtn = document.getElementById('cujuStartBtn');
if (cujuStartBtn) cujuStartBtn.addEventListener('click', () => bpStart('cuju', cujuOptsNow()));
const cuju2v2Btn = document.getElementById('cuju2v2Btn');
if (cuju2v2Btn) cuju2v2Btn.addEventListener('click', () => bpStart('cuju2v2', cujuOptsNow({ four: true })));
const cujuPvpBtn = document.getElementById('cujuPvpBtn');
if (cujuPvpBtn) cujuPvpBtn.addEventListener('click', () => bpStart('cuju', cujuOptsNow({ pvp: true })));
const cujuWatchBtn = document.getElementById('cujuWatchBtn');
if (cujuWatchBtn) cujuWatchBtn.addEventListener('click', () => bpStart('cuju', cujuOptsNow({ level: pickLevel || 'god', isWatch: true })));

// ---------- 画面 ----------
// 球门：画在侠客后面（drawProjs 那一层）；墨球画在侠客前面
function drawCujuField() {
  if (!cujuOn() || !M.cuju) return;
  const GD = CUJU.GD, GH = CUJU.GH;
  ctx.save();
  // 中线和中圈
  ctx.strokeStyle = 'rgba(239,232,216,0.16)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(STAGE_W / 2, 0); ctx.lineTo(STAGE_W / 2, -14); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(STAGE_W / 2, 0, 150, 14, 0, 0, Math.PI * 2); ctx.stroke();
  for (const side of [0, 1]) {
    const x0 = side === 0 ? WALL : STAGE_W - WALL - GD, x1 = x0 + GD, post = side === 0 ? x1 : x0, back = side === 0 ? x0 : x1;
    const rgb = side === 0 ? '143,240,255' : '255,138,112';
    const ripple = (M.cuju.netRipple && M.cuju.netRipple[side]) || 0;
    const flash = M.cuju.pause > 0 && M.cuju.lastGoal === 1 - side ? 0.25 + 0.2 * Math.sin(clock * 18) : 0;
    ctx.fillStyle = `rgba(${rgb},${0.07 + flash})`; ctx.fillRect(x0, -GH, GD, GH);
    // 网：细墨线织成的格子，进球时网面震荡波纹
    ctx.strokeStyle = `rgba(239,232,216,${0.22 + ripple * 0.3})`; ctx.lineWidth = 1 + ripple * 0.8;
    ctx.beginPath();
    for (let yy = -GH + 26; yy < 0; yy += 26) {
      const wave = ripple ? Math.sin(clock * 28 + yy * 0.08) * 10 * ripple : 0;
      ctx.moveTo(x0, yy); ctx.lineTo(x1, yy + wave);
    }
    for (let xx = x0 + 24; xx < x1; xx += 24) {
      const wave = ripple ? Math.cos(clock * 24 + xx * 0.08) * 8 * ripple : 0;
      ctx.moveTo(xx + wave, -GH); ctx.lineTo(xx, 0);
    }
    ctx.stroke();
    // 门柱和横梁：朱漆木杆
    ctx.fillStyle = '#3a1712'; ctx.fillRect(post - 6, -GH - CUJU.BAR, 12, GH + CUJU.BAR);
    ctx.fillStyle = '#b8321e'; ctx.fillRect(post - 4, -GH - CUJU.BAR + 2, 8, GH + CUJU.BAR - 2);
    ctx.fillStyle = '#3a1712'; ctx.fillRect(Math.min(back, post), -GH - CUJU.BAR, GD, CUJU.BAR);
    ctx.fillStyle = '#b8321e'; ctx.fillRect(Math.min(back, post), -GH - CUJU.BAR + 3, GD, CUJU.BAR - 6);
    ctx.fillStyle = `rgba(${rgb},0.9)`; ctx.fillRect(post - 5, -GH - CUJU.BAR - 30, 10, 30);   // 门柱顶上的小旗
    ctx.beginPath(); ctx.moveTo(post, -GH - CUJU.BAR - 30); ctx.lineTo(post + (side === 0 ? 34 : -34), -GH - CUJU.BAR - 21); ctx.lineTo(post, -GH - CUJU.BAR - 12); ctx.closePath(); ctx.fill();
    // 门线
    ctx.strokeStyle = `rgba(${rgb},0.55)`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(post, 2); ctx.lineTo(post, -2); ctx.moveTo(x0, 1); ctx.lineTo(x1, 1); ctx.stroke();
  }
  ctx.restore();
}
function drawCujuBall() {
  if (!cujuOn() || !M.cuju || !M.cuju.ball) return;
  const b = M.cuju.ball, R = cujuBallR();
  ctx.save();
  // 地上的影子：越高越淡越小
  const hk = clamp(1 - (-b.y - R) / 600, 0.25, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * hk})`;
  ctx.beginPath(); ctx.ellipse(b.x, 2, R * 1.1 * hk + 4, 6 * hk + 1, 0, 0, Math.PI * 2); ctx.fill();
  for (const t of CUJU_TRAIL) {
    const a = clamp(t.life / t.max, 0, 1);
    ctx.fillStyle = t.iced ? `rgba(140,220,255,${0.35 * a})` : `rgba(18,18,24,${0.3 * a})`;
    ctx.beginPath(); ctx.arc(t.x, t.y, R * (0.5 + 0.5 * a), 0, Math.PI * 2); ctx.fill();
  }
  // 墨球：深墨色的圆，一道金边（冰球青边、火球赤边），几笔旋转的墨纹
  const g = ctx.createRadialGradient(b.x - R * 0.35, b.y - R * 0.4, 2, b.x, b.y, R);
  g.addColorStop(0, b.iced > 0 ? '#7ad7f0' : '#5a5560'); g.addColorStop(0.55, '#1b1a22'); g.addColorStop(1, '#07070b');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = b.iced > 0 ? 'rgba(140,230,255,0.9)' : (M.cuju.chaos === 'fire' ? 'rgba(255,120,80,0.9)' : 'rgba(233,196,106,0.85)');
  ctx.lineWidth = 2; ctx.stroke();
  ctx.translate(b.x, b.y); ctx.rotate(b.spin);
  ctx.strokeStyle = 'rgba(239,232,216,0.55)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.rotate(Math.PI * 2 / 3);
    ctx.beginPath(); ctx.arc(R * 0.32, 0, R * 0.5, -1.1, 1.1); ctx.stroke();
  }
  ctx.restore();
}
// 比分：画在血条的位置（墨球蹴鞠不显示血条）
function drawCujuScore(cx, top, bh, gap) {
  const cj = M.cuju; if (!cj) return;
  const target = cujuTarget();
  ctx.save();
  ctx.textBaseline = 'middle';
  for (const side of [0, 1]) {
    const rgb = side === 0 ? '143,240,255' : '255,138,112', out = side === 0 ? -1 : 1;
    // 大字比分紧挨着中间的计时，往外是 target 个进球墨点
    ctx.font = `700 ${Math.round(bh * 2.4)}px ${BODY_FONT}`;
    ctx.textAlign = side === 0 ? 'right' : 'left';
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
    const nx = cx + out * (gap + 4);
    ctx.fillText(String(cj.score[side]), nx, top + bh / 2 + 2);
    ctx.shadowBlur = 0;
    const r = Math.max(6, bh * 0.56), start = gap + 4 + bh * 1.8 + 14;
    for (let k = 0; k < target; k++) {
      const px = cx + out * (start + r + k * (r * 2 + 8)), py = top + bh / 2;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = k < cj.score[side] ? `rgb(${rgb})` : 'rgba(0,0,0,0.45)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(${rgb},0.8)`; ctx.stroke();
    }
  }
  if (cj.golden) {
    ctx.font = `${Math.max(12, Math.round(bh * 0.9))}px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#e9c46a';
    ctx.fillText(cvT('金球决胜'), cx, top + bh * 2.2);
  } else if (cj.chaos) {
    const cDef = CUJU_CHAOS_LIST.find(x => x.id === cj.chaos);
    if (cDef) {
      ctx.font = `${Math.max(11, Math.round(bh * 0.78))}px ${BODY_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(233,196,106,0.9)';
      ctx.fillText(cvT(`异象 · ${cDef.name}`), cx, top + bh * 2.2);
    }
  }
  // 墨球飞出画面顶上：顶上标一个小三角
  const b = cj.ball;
  if (b) {
    const sc = worldScale(), sy = groundY() + b.y * sc;
    if (sy < 0) {
      const sx = clamp(W / 2 + (b.x - cam.x) * sc, 20, W - 20);
      ctx.fillStyle = 'rgba(233,196,106,0.9)';
      ctx.beginPath(); ctx.moveTo(sx, top + bh * 3.4); ctx.lineTo(sx - 9, top + bh * 3.4 + 14); ctx.lineTo(sx + 9, top + bh * 3.4 + 14); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}
