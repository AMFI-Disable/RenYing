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

