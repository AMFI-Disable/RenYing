// ======================= 姿势动画 =======================
// 本文件：动画、特效和主循环。
//   1. 姿势动画：按状态挑目标姿势（targetPose），插值、反向运动学（ik）、骨架、围巾
//   2. 特效粒子：addP / hitFX / ring / dust，updateFX 每帧更新
//   3. 主循环：step（固定步长推进一帧逻辑）、镜头、simTick、后台标签页时用 Worker 计时
//   4. 青锋行入口、对战回放（录制、保存、播放）、青锋行奖励
//   5. frame / frameBody：浏览器每次刷新调用一次，按需要跑几步 step 再画一帧；自动画质（autoQualityTick）
// 找 bug 提示：逻辑只在 step 里推进（每步 STEP 秒），画面帧率高低不影响结果；卡顿时看 frameBody 一帧跑了几步。
// 空中放技能：地面姿势换成空中专属姿势（伤害判定不变）；没列出的收招姿势用下落姿势
const AIR_SKILL_POSE = {
  gale: { qf_charge: 'ak_gale0', qf_thrust: 'ak_gale1' },
  swordqi: { qf_charge: 'ak_swordqi0', qf_thrust: 'ak_swordqi1' },
  blink: { fy_seal: 'ak_blink0', dash: 'ak_blink1', fy_xslash: 'ak_blink2' },
  kunai: { fy_seal: 'ak_kunai0', fy_crouch: 'ak_kunai1' },
  quake: { ts_lift: 'ak_quake0', ts_slam: 'ak_quake1' },
  ironwall: { ts_shoulder: 'ak_ironwall0' },
  backthrust: { ls_stance: 'ak_backthrust0', ls_thrust: 'ak_backthrust1' },
  spin: { ls_stance: 'ak_spin0' },
  windblade: { ly_fanswipe: 'ak_windblade0', idle: 'ak_windblade1' },
  windstep: { ly_fanswipe: 'ak_windstep0', a2: 'ak_windstep1' },
  thunderfist: { lm_boxer: 'ak_thunderfist0', lm_jab: 'ak_thunderfist1' },
  stomp: { lm_boxer: 'ak_stomp0', ts_slam: 'ak_stomp1' },
  inktrap: { my_stroke: 'ak_inktrap0', my_paint: 'ak_inktrap1' },
  inksplash: { my_stroke: 'ak_inksplash0', my_paint: 'ak_inksplash1' },
  mirror: { yh_mirror: 'ak_mirror0', hva: 'ak_mirror1' },
  moonring: { yh_mirror: 'ak_moonring0', l2a: 'ak_moonring1' },
  dive: { jump: 'ak_dive0', yl_dive: 'ak_dive1' },
  darts: { yl_wings: 'ak_darts0', a1a: 'ak_darts1' },
  soundwave: { yx_play: 'ak_soundwave0', yx_push: 'ak_soundwave1' },
  echowall: { yx_play: 'ak_echowall0' },
  pavilion: { zx_sway: 'ak_pavilion0', gc_wind: 'ak_pavilion1' },
  feast: { gc_wind: 'ak_feast0', gc_throw: 'ak_feast1', zx_drink: 'ak_feast2' },
  hook: { gc_wind: 'ak_hook0', gc_throw: 'ak_hook1', gc_pull: 'ak_hook2' },
  whirl: { gc_spin: 'ak_whirl0', gc_throw: 'ak_whirl1' },
  spindle: { du_l1s: 'ak_spindle0', du_l1a: 'ak_spindle1' },
  shadowdash: { du_l1s: 'ak_shadowdash0', dash: 'ak_shadowdash1' },
  mistmark: { fy_seal: 'ak_mistmark0', l2a: 'ak_mistmark1' },
  mistswap: { fy_seal: 'ak_mistswap0', a2: 'ak_mistswap1', l3: 'ak_mistswap2' },
  polarswap: { idle: 'ak_polarswap0' },
  magfield: { lm_boxer: 'ak_magfield0', hva: 'ak_magfield1', yx_push: 'ak_magfield2' },
  throwball: { qf_charge: 'ak_throwball0', l1a: 'ak_throwball1' },
  ballspike: { fy_seal: 'ak_ballspike0' },
  flamehalberd: { qf_charge: 'ak_flamehalberd0', qf_thrust: 'ak_flamehalberd1' },
  blazering: { qf_charge: 'ak_blazering0', l3a: 'ak_blazering1' },
  starorb: { yx_play: 'ak_starorb0', yx_push: 'ak_starorb1' },
  gravwell: { yx_play: 'ak_gravwell0', yx_push: 'ak_gravwell1' },
  jadebreeze: { qf_charge: 'ak_jadebreeze0', ly_fanswipe: 'ak_jadebreeze1' },
  luanheal: { yh_mirror: 'ak_luanheal0', ly_fanswipe: 'ak_luanheal1' },
  shellbash: { ts_shoulder: 'ak_shellbash0', dash: 'ak_shellbash1' },
  earthfort: { ts_lift: 'ak_earthfort0', ts_slam: 'ak_earthfort1' }
};
const CHARGE_POSES = {
  qingfeng: 'qf_charge', feiying: 'fy_seal', tieshan: 'ts_lift', lingshuang: 'ls_stance', liuyun: 'ly_fanswipe', leiming: 'lm_boxer', moyu: 'my_stroke', yuehua: 'yh_lotus', yanling: 'yl_wings', yuxiao: 'yx_play', zuixian: 'zx_drink', gouchen: 'gc_wind', lingque: 'du_l1s', cixian: 'lm_boxer', qianji: 'qf_charge',
  chixiao: 'rk_l2s', xuanji: 'sg_l1s', qingluan: 'jf_l2s', xuanwu: 'bs_l1s', liying: 'ib_l1s'
};
const _TP_OUT = { sw: 0, k: 16, hip: [0, 0], neck: [0, 0], hf: [0, 0], hb: [0, 0], ff: [0, 0], fb: [0, 0] };
function targetPose(f) {
  const s = f.state;
  let p, k = 16, atkOvershoot = 0;
  if (s === 'attack' && f.move) {
    const m = f.move;
    const p0 = (m.p && POSES[m.p[0]]) || POSES.l1s, p1 = (m.p && POSES[m.p[1]]) || POSES.l1a;
    if (f.t < m.su) {
      p = p0; k = 32;
      atkOvershoot = -0.08; // 蓄势微收（Anticipation coil）
    } else if (f.t < m.su + m.ac) {
      p = p1; k = 74;
      const acProg = clamp((f.t - m.su) / Math.max(0.01, m.ac), 0, 1);
      atkOvershoot = Math.sin(acProg * Math.PI) * 0.14; // 爆发弹性超调（Spring overshoot）
    } else {
      p = p1; k = 15;
      atkOvershoot = -0.04; // 收招余韵缓冲（Follow-through settle）
    }
  } else if (s === 'special') {
    if (f.sp === 'charge') {
      p = POSES[CHARGE_POSES[f.ch.id] || 'sps']; k = 16;
    } else if (f.ch.ult === 'crescent') {
      const m = { dash: 'qf_thrust', miss: 'l3a', flurry: f.slashN % 2 ? 'l3a' : 'hva', final: 'a2a' };
      p = POSES[m[f.sp] || 'qf_thrust'] || POSES.spa; k = 60;
    } else if (f.ch.ult === 'shadows') {
      const m = { dash: 'fy_crouch', miss: 'l3a', flurry: f.slashN % 2 ? 'fy_xslash' : 'bdash', final: 'fy_xslash' };
      p = POSES[m[f.sp] || 'fy_crouch'] || POSES.spa; k = 60;
    } else if (f.ch.ult === 'eightimm') {
      const m = { dash: 'zx_roll', miss: 'zx_sway', flurry: f.slashN % 2 ? 'lm_jab' : 'zx_upper', final: 'zx_upper' };
      p = POSES[m[f.sp] || 'zx_roll'] || POSES.spa; k = 60;
    } else {
      p = POSES[f.spPose || 'spa'] || POSES.spa; k = 60;
    }
  } else if (s === 'skill') {
    const pr = SKILLS[f.skill] ? SKILLS[f.skill].pose(f) : ['idle', 14]; k = pr[1];
    let pn = pr[0];
    if (f.skAir && airH(f) > 4) pn = (AIR_SKILL_POSE[f.skill] || {})[pn] || (pn === 'idle' || pn === 'getup' ? 'fall' : pn);
    p = POSES[pn] || POSES.idle;
  } else if (s === 'dash') { p = POSES[f.dashDir === f.face ? 'dash' : 'bdash']; k = 30; }
  else if (s === 'air') { p = POSES[f.vy < 0 ? 'jump' : 'fall']; k = 14; }
  else if (s === 'block' || s === 'blockstun') { p = POSES.block; k = 30; }
  else if (s === 'stance') { p = (f.relicStance === 1 && (f.relicStanceT || 0) > 0) ? POSES.charge : POSES.block; k = 42; }
  else if (s === 'hitstun') { p = POSES.hurt; k = 34; }
  else if (s === 'launched' || s === 'held') { p = POSES.hurtAir; k = 22; }
  else if (s === 'knockdown') { p = POSES.lying; k = 16; }
  else if (s === 'getup') { p = POSES.getup; k = 14; }
  else if (s === 'victory') { p = POSES.victory; k = 6; }
  else if (s === 'charge' || s === 'aircharge') { p = POSES.charge; k = 18; }
  else p = POSES.idle;
  // 复用模块级缓冲区，避免 16 人 × 120Hz 每秒数万次短命数组分配
  const out = _TP_OUT;
  out.sw = p.sw + atkOvershoot * 0.85;
  out.k = k;
  for (let ji = 0; ji < JOINTS.length; ji++) {
    const j = JOINTS[ji], pj = p[j], oj = out[j];
    oj[0] = pj[0]; oj[1] = pj[1];
  }
  if (atkOvershoot !== 0) {
    out.hf[0] += (out.hf[0] - out.neck[0]) * atkOvershoot;
    out.hf[1] += (out.hf[1] - out.neck[1]) * atkOvershoot * 0.6;
    out.neck[0] += atkOvershoot * 14;
  }
  const hid = f.ch && f.ch.id, arch = f.ch && f.ch.archetype;
  if (s === 'idle' || s === 'victory') {
    const b = Math.sin(clock * 3.2 + f.idx) * 1.8;
    out.hip[1] += b; out.neck[1] += b * 1.35; out.hf[1] += b * 1.1; out.hb[1] += b * 0.9;
    out.sw += Math.sin(clock * 2.1 + f.idx) * 0.05;
    if (s === 'idle') {
      if (arch === 'assassin') { out.hip[1] += 5; out.neck[0] += 7; out.neck[1] += 6; out.hf[0] += 6; out.hb[0] -= 6; out.sw += 0.35; }
      else if (hid === 'xuanwu' || arch === 'tank') { out.hip[1] += 3; out.ff[0] += 4; out.fb[0] -= 4; out.hf[1] -= 4; out.sw -= 0.25; }
      else if (hid === 'qingluan') { const fl = Math.sin(clock * 2.6 + f.idx) * 3.5; out.hip[1] -= 4 + fl * 0.5; out.neck[1] -= 4 + fl * 0.5; out.hf[1] -= 8 + fl; out.hb[0] -= 8; }
      else if (hid === 'leiming') { out.hip[1] += 4; out.neck[0] += 8; out.hf[0] = 28; out.hf[1] = -76; out.hb[0] = 10; out.hb[1] = -74; out.sw = 0; }
      else if (hid === 'yuxiao') { out.hf[0] = 16; out.hf[1] = -82; out.hb[0] = 10; out.hb[1] = -82; out.sw = 1.25; }
      else if (hid === 'xuanji') { out.neck[0] -= 2; out.hf[1] -= 10; out.hb[0] -= 8; out.sw -= 0.4; }
    }
  } else if (s === 'walk') {
    const ph = f.walkPh, sn = Math.sin(ph), cs = Math.cos(ph);
    const stride = arch === 'assassin' ? 22 : (arch === 'tank' ? 14 : 18);
    const lift = arch === 'assassin' ? 15 : (arch === 'tank' ? 8 : 12);
    out.ff[0] = 4 + sn * stride; out.ff[1] = -Math.max(0, cs) * lift;
    out.fb[0] = -4 - sn * stride; out.fb[1] = -Math.max(0, -cs) * lift;
    if (arch === 'assassin') { out.neck[0] += 10; out.hip[1] += 4; }
    else if (arch === 'tank') { out.hip[1] += 2; out.neck[0] += 2; }
    const weight = clamp((f.ch && f.ch.stat && f.ch.stat.weight) || 1, 0.75, 1.4);
    const bob = -Math.abs(cs) * (2.8 + (1 - weight) * 2.2);
    out.hip[1] += bob; out.neck[1] += bob; out.hf[1] += bob - sn * 2.2; out.hb[1] += bob + sn * 2.2;
    const lean = f.vx * f.face > 0 ? 4.5 : -2.5;
    out.neck[0] += lean * (1.2 - weight * 0.2); out.hf[0] += lean * 0.5 - sn * 3; out.hb[0] += sn * 3;
  }
  if ((s === 'idle' || s === 'walk') && (f.relicStance === 1 || f.relicStance === 2)) {
    if (f.relicStance === 1) {
      out.neck[0] += 4.5; out.hf[0] += 4.5; out.hf[1] -= 3; out.sw += 0.22;
    } else {
      out.hip[1] += 3.5; out.neck[0] -= 3; out.hf[0] -= 3.5; out.hf[1] += 2; out.hb[0] += 4; out.sw -= 0.28;
    }
  }
  // Combat-feel poses are presentation only: weight changes how fighters brace and
  // recover visually, while the fixed-step hit timing and all combat values stay intact.
  const weight = clamp((f.ch && f.ch.stat && f.ch.stat.weight) || 1, 0.75, 1.4);
  if (s === 'attack' && f.move && f.t < f.move.su) {
    const brace = weight - 1;
    out.hip[1] += brace * 7;
    out.neck[0] -= brace * 5;
    out.ff[0] -= brace * 7;
    out.fb[0] += brace * 7;
    out.hb[0] -= brace * 4;
  } else if (s === 'hitstun') {
    const recoil = clamp((f.vx * f.face) / 700, -1, 1);
    const lightness = clamp(1.15 - weight, 0, 0.4);
    out.neck[0] -= recoil * (5 + lightness * 13);
    out.hf[0] -= recoil * (2 + lightness * 7);
    out.hb[0] -= recoil * (2 + lightness * 5);
    out.hip[1] += Math.abs(recoil) * (1 - lightness) * 3;
  } else if (s === 'block' || s === 'blockstun') {
    const brace = clamp(weight - 0.85, 0, 0.45);
    out.hip[1] += brace * 5;
    out.ff[0] -= brace * 5;
    out.fb[0] += brace * 5;
    out.hf[0] -= brace * 3;
  }
  // 醉翁's sway tells opponents when his wine-fueled evasive passive is active.
  if (f.ch && f.ch.passive === 'drunk' && (f.drunk || 0) >= 50 && ['idle', 'walk'].includes(s)) {
    const sway = Math.sin(clock * 7 + f.idx) * Math.min(1, (f.drunk - 45) / 35);
    out.neck[0] += sway * 3.5;
    out.hip[0] -= sway * 1.5;
  }
  if (f.flash > 0 && s === 'hitstun') { out.neck[0] -= 4; }
  if (s === 'charge' && f.t >= CHARGE_FULL) { out.hf[0] += rand(-1.2, 1.2); out.hf[1] += rand(-1.2, 1.2); }
  if (s === 'charge' && Math.abs(f.vx) > 8) {   // 蓄力小碎步
    const sn = Math.sin(f.walkPh);
    out.ff[0] = 22 + sn * 9; out.ff[1] = -Math.max(0, Math.cos(f.walkPh)) * 6;
    out.fb[0] = -26 - sn * 9; out.fb[1] = -Math.max(0, -Math.cos(f.walkPh)) * 6;
  }
  return out;
}
function animFighter(f) {
  if (f.state === 'walk' || (f.state === 'skill' && Math.abs(f.vx) > 20)) f.walkPh += STEP * f.vx * f.face * 0.055;
  const tp = targetPose(f);
  const a = f.snap ? 1 : 1 - Math.exp(-tp.k * STEP);
  for (let ji = 0; ji < JOINTS.length; ji++) {
    const j = JOINTS[ji], fj = f.j[j], tj = tp[j];
    fj[0] += (tj[0] - fj[0]) * a; fj[1] += (tj[1] - fj[1]) * a;
  }
  f.j.sw += (tp.sw - f.j.sw) * a;
  if (f.state === 'skill' && f.skill === 'spin') { f.j.sw = f.t * 26; f.j.hf[0] = 44; f.j.hf[1] = -72; }   // 枪在身前旋转
  if (f.snap && f.state === 'special' && f.sp !== 'final') f.snap = false;
  // 身体旋转（被击飞时翻滚）
  const rotT = f.state === 'launched' ? clamp(f.vy / 1600, -0.7, 0.7) * -1 : 0;
  f.rot += (rotT - f.rot) * (1 - Math.exp(-10 * STEP));
  f.sk = skeleton(f);
  // 剑光拖尾（原地压缩，避免每帧 O(N) shift 分配）
  const swinging = (f.state === 'attack' && f.move && f.t > f.move.su * 0.45 && f.t < f.move.su + f.move.ac + 0.05)
    || (f.state === 'special' && ['dash', 'flurry', 'final', 'thrusts', 'slam', 'sweep', 'rush'].includes(f.sp))
    || (f.state === 'skill' && (f.skPh === 1 || f.skPh === 2) && f.t < 0.22);
  const trail = f.trail;
  if (swinging) trail.push({ b: f.sk.bladeMid, t: f.sk.tip, h: f.sk.guard, life: 1 });
  const tDecay = STEP / 0.16;
  let tw = 0, tStart = trail.length > 28 ? trail.length - 28 : 0;
  for (let i = tStart; i < trail.length; i++) {
    const e = trail[i]; e.life -= tDecay;
    if (e.life > 0) trail[tw++] = e;
  }
  trail.length = tw;
  // 残影（原地压缩）
  f.ghostT -= STEP;
  const ghosts = f.ghosts;
  if ((f.escInvul || f.state === 'dash' || (f.state === 'special' && f.sp !== 'charge' && f.sp !== 'cast' && f.sp !== 'wave') || (f.state === 'skill' && f.skPh === 1 && SKILLS[f.skill] && SKILLS[f.skill].nofric)) && f.ghostT <= 0) {
    if (ghosts.length < 18) ghosts.push({ sk: f.sk, life: 1 });
    f.ghostT = 0.022;
  }
  const gDecay = STEP / 0.22;
  let gw = 0;
  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i]; g.life -= gDecay;
    if (g.life > 0) ghosts[gw++] = g;
  }
  ghosts.length = gw;
  updateScarf(f);
  if (f.lagDelay > 0) f.lagDelay -= STEP; else f.lagHp = damp(f.lagHp, f.hp, 6, STEP);
}
// 两段骨骼反向运动学：给定起点、终点和两段长度，求中间关节
function ik(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  d = Math.max(d, 0.01);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = Math.atan2(dy, dx) + a * bend;
  return [[ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1], [ax + dx, ay + dy]];
}
function skeleton(f) {
  const j = f.j;
  const hip = j.hip, neck = j.neck;
  const tx = neck[0] - hip[0], ty = neck[1] - hip[1], tl = Math.hypot(tx, ty) || 1;
  const head = [neck[0] + tx / tl * 13.5, neck[1] + ty / tl * 13.5];
  const sh = [neck[0] - tx / tl * 5, neck[1] - ty / tl * 5];
  // 动态肩部扭转（Shoulder Twist）：随出招角度前送后收，增强挥砍与出拳立体感
  const twist = clamp((j.hf[0] - j.hb[0]) / 45, -1, 1) * 3.2;
  const shF = [sh[0] + twist, sh[1] - Math.abs(twist) * 0.25];
  const shB = [sh[0] - twist, sh[1] + Math.abs(twist) * 0.25];
  const [ef, hf] = ik(shF[0], shF[1], j.hf[0], j.hf[1], 21, 21, 1);
  const [eb, hb] = ik(shB[0], shB[1], j.hb[0], j.hb[1], 21, 21, 1);
  const [kf, ff] = ik(hip[0], hip[1], j.ff[0], j.ff[1], 26, 27, -1);
  const [kb, fb] = ik(hip[0], hip[1], j.fb[0], j.fb[1], 26, 27, -1);
  const dx = Math.cos(j.sw), dy = Math.sin(j.sw);
  const guard = [hf[0] + dx * 2, hf[1] + dy * 2], hilt = [hf[0] - dx * 9, hf[1] - dy * 9];
  const wl = f.wlen || 54;
  const mid = [hf[0] + dx * wl * 0.37, hf[1] + dy * wl * 0.37], tip = [hf[0] + dx * wl, hf[1] + dy * wl];
  const cr = Math.cos(f.rot), sr = Math.sin(f.rot);
  const T = p => {
    const rx = p[0] - hip[0], ry = p[1] - hip[1];
    const x = hip[0] + rx * cr - ry * sr, y = hip[1] + rx * sr + ry * cr;
    return [f.x + (f.vox || 0) + x * f.face, f.y + (f.voy || 0) + y];
  };
  return { hip: T(hip), neck: T(neck), head: T(head), sh: T(sh), shF: T(shF), shB: T(shB), ef: T(ef), hf: T(hf), eb: T(eb), hb: T(hb),
    kf: T(kf), ff: T(ff), kb: T(kb), fb: T(fb), hilt: T(hilt), guard: T(guard), bladeMid: T(mid), tip: T(tip), face: f.face, pol: f.pol || 0 };
}
function updateScarf(f) {
  const sk = f.sk, N = 9, SEG = 7.5;
  const anchor = [sk.neck[0] - f.face * 3, sk.neck[1] + 3];
  if (!f.scarf.length) for (let i = 0; i < N; i++) f.scarf.push({ x: anchor[0] - f.face * i * SEG, y: anchor[1], px: anchor[0] - f.face * i * SEG, py: anchor[1] });
  const wind = Math.sin(clock * 2.3 + f.idx * 2) * 0.05 - 0.04;
  for (let i = 1; i < N; i++) {
    const p = f.scarf[i], vx = (p.x - p.px) * 0.94, vy = (p.y - p.py) * 0.94;
    p.px = p.x; p.py = p.y;
    p.x += vx + wind + Math.sin(clock * 7 + i) * 0.04; p.y += vy + 0.035;
  }
  f.scarf[0].x = anchor[0]; f.scarf[0].y = anchor[1];
  for (let it = 0; it < 3; it++) for (let i = 1; i < N; i++) {
    const a = f.scarf[i - 1], b = f.scarf[i];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = (d - SEG) / d;
    b.x -= dx * k; b.y -= dy * k;
  }
}

// ======================= 特效 =======================
const particles = [];
const ESSENTIAL_P = { dmg: 1, callout: 1, text: 1, ring: 1, slash: 1, lightning: 1, beam: 1, flash: 1 };
function addP(p) {
  if (RESIM) return;
  const essential = !!ESSENTIAL_P[p.type];
  const crowd = typeof allFighters === 'function' ? allFighters().length : 2;
  if (!essential) {
    const softCap = crowd >= 10 ? 220 : crowd >= 6 ? 320 : 480;
    if (particles.length >= softCap) return;
    if (crowd >= 10 && particles.length > 140 && Math.random() < 0.45) return;
  }
  if (particles.length < 720) particles.push(p);
}
function hitFX(x, y, power, rgb, face) {
  addP({ type: 'flash', x, y, r: 26 * power, life: 0.1, max: 0.1, rgb: '255,255,255' });
  ring(x, y, 46 * power, rgb, 0.22);
  const crowd = typeof allFighters === 'function' ? allFighters().length : 2;
  const density = crowd >= 10 ? 0.55 : crowd >= 6 ? 0.75 : 1;
  const n = Math.max(4, Math.round((10 + 8 * power) * density));
  for (let i = 0; i < n; i++) {
    const a = (face > 0 ? 0 : Math.PI) + rand(-1.1, 1.1) + (Math.random() < 0.25 ? Math.PI : 0), s = rand(350, 1000) * power;
    addP({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.12, 0.3), max: 0.3, rgb: Math.random() < 0.4 ? '255,255,255' : rgb, w: rand(1.5, 3) * power, drag: 6 });
  }
  const inkN = Math.max(2, Math.round(6 * power * density));
  for (let i = 0; i < inkN; i++) {
    const a = rand(-Math.PI, 0), s = rand(80, 300);
    addP({ type: 'ink', x, y, vx: Math.cos(a) * s + face * 120, vy: Math.sin(a) * s, g: 1400, life: rand(0.4, 0.8), max: 0.8, r: rand(2, 4.5), rgb });
  }
}
function blockFX(x, y, face) {
  ring(x, y, 34, '160,200,255', 0.18);
  for (let i = 0; i < 10; i++) {
    const a = (face > 0 ? Math.PI : 0) + rand(-1.3, 1.3), s = rand(250, 700);
    addP({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, g: 900, life: rand(0.15, 0.35), max: 0.35, rgb: Math.random() < 0.5 ? '255,240,200' : '170,210,255', w: 1.6, drag: 3 });
  }
}
function ring(x, y, r, rgb, life) { addP({ type: 'ring', x, y, r, life, max: life, rgb }); }
function dust(x, y, n) {
  const crowd = typeof allFighters === 'function' ? allFighters().length : 2;
  const count = crowd >= 10 ? Math.max(2, Math.round(n * 0.55)) : n;
  for (let i = 0; i < count; i++) addP({ type: 'dust', x: x + rand(-16, 16), y: y - rand(0, 6), vx: rand(-140, 140), vy: rand(-80, -10), life: rand(0.3, 0.6), max: 0.6, r: rand(6, 14), drag: 4 });
}
function slashLine(x, y, ang, rgb) { addP({ type: 'slash', x, y, ang, len: 420, life: 0.28, max: 0.28, rgb }); }
function lightningArc(x1, y1, x2, y2, rgb = '255,240,150', w = 2.8, life = 0.24) {
  addP({ type: 'lightning', x: x1, y: y1, x2, y2, rgb, w, life, max: life });
}
function debrisBurst(x, y, n = 10, rgb = '135,115,98') {
  const crowd = typeof allFighters === 'function' ? allFighters().length : 2;
  const count = crowd >= 10 ? Math.max(4, Math.round(n * 0.65)) : n;
  for (let i = 0; i < count; i++) {
    addP({ type: 'debris', x: x + rand(-36, 36), y: y - rand(4, 24), vx: rand(-340, 340), vy: rand(-540, -140), g: 1650, rot: rand(0, 6.28), vr: rand(-12, 12), r: rand(4, 10), life: rand(0.45, 0.85), max: 0.85, rgb });
  }
}
function updateFX(dt) {
  for (const p of particles) {
    p.life -= dt;
    if (p.vr) p.rot = (p.rot || 0) + p.vr * dt;
    if (p.vx !== undefined) {
      if (p.drag) { p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt); }
      if (p.g) p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'ink' && p.y > 0) { p.y = 0; p.vx *= 0.3; p.vy = 0; p.g = 0; }
    }
  }
  let w = 0;
  for (let r = 0; r < particles.length; r++) {
    if (particles[r].life > 0) particles[w++] = particles[r];
  }
  particles.length = w;
}
// 背景飘落的叶子
const petals = Array.from({ length: 46 }, () => ({ x: rand(0, STAGE_W), y: rand(-700, 0), vx: rand(-40, -10), vy: rand(20, 55), r: rand(0, 6), s: rand(2.5, 4.5), ph: rand(0, 6) }));

