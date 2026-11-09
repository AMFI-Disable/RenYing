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
  shadowdash: { du_l1s: 'ak_shadowdash0', dash: 'ak_shadowdash1' }
};
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
      const chargePoses = { qingfeng: 'qf_charge', feiying: 'fy_seal', tieshan: 'ts_lift', lingshuang: 'ls_stance', liuyun: 'ly_fanswipe', leiming: 'lm_boxer', moyu: 'my_stroke', yuehua: 'yh_lotus', yanling: 'yl_wings', yuxiao: 'yx_play', zuixian: 'zx_drink', gouchen: 'gc_wind', cixian: 'lm_boxer', qianji: 'qf_charge' };
      p = POSES[chargePoses[f.ch.id] || 'sps']; k = 16;
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
  else if (s === 'block' || s === 'blockstun' || s === 'stance') { p = POSES.block; k = s === 'stance' ? 42 : 30; }
  else if (s === 'hitstun') { p = POSES.hurt; k = 34; }
  else if (s === 'launched' || s === 'held') { p = POSES.hurtAir; k = 22; }
  else if (s === 'knockdown') { p = POSES.lying; k = 16; }
  else if (s === 'getup') { p = POSES.getup; k = 14; }
  else if (s === 'victory') { p = POSES.victory; k = 6; }
  else if (s === 'charge') { p = POSES.charge; k = 18; }
  else p = POSES.idle;
  // 复制一份，再加上呼吸、走步与三段攻击弹性超调动画
  const out = { sw: p.sw + atkOvershoot * 0.85, k };
  for (const j of JOINTS) out[j] = [p[j][0], p[j][1]];
  if (atkOvershoot !== 0) {
    out.hf[0] += (out.hf[0] - out.neck[0]) * atkOvershoot;
    out.hf[1] += (out.hf[1] - out.neck[1]) * atkOvershoot * 0.6;
    out.neck[0] += atkOvershoot * 14;
  }
  if (s === 'idle' || s === 'victory') {
    const b = Math.sin(clock * 3.2 + f.idx) * 1.8;
    out.hip[1] += b; out.neck[1] += b * 1.35; out.hf[1] += b * 1.1; out.hb[1] += b * 0.9;
    out.sw += Math.sin(clock * 2.1 + f.idx) * 0.05;
  } else if (s === 'walk') {
    const ph = f.walkPh, sn = Math.sin(ph), cs = Math.cos(ph);
    out.ff = [4 + sn * 18, -Math.max(0, cs) * 12];
    out.fb = [-4 - sn * 18, -Math.max(0, -cs) * 12];
    const weight = clamp((f.ch && f.ch.stat && f.ch.stat.weight) || 1, 0.75, 1.4);
    const bob = -Math.abs(cs) * (2.8 + (1 - weight) * 2.2);
    out.hip[1] += bob; out.neck[1] += bob; out.hf[1] += bob - sn * 2.2; out.hb[1] += bob + sn * 2.2;
    const lean = f.vx * f.face > 0 ? 4.5 : -2.5;
    out.neck[0] += lean * (1.2 - weight * 0.2); out.hf[0] += lean * 0.5 - sn * 3; out.hb[0] += sn * 3;
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
    out.ff = [22 + sn * 9, -Math.max(0, Math.cos(f.walkPh)) * 6];
    out.fb = [-26 - sn * 9, -Math.max(0, -Math.cos(f.walkPh)) * 6];
  }
  return out;
}
function animFighter(f) {
  if (f.state === 'walk' || (f.state === 'skill' && Math.abs(f.vx) > 20)) f.walkPh += STEP * f.vx * f.face * 0.055;
  const tp = targetPose(f);
  const a = f.snap ? 1 : 1 - Math.exp(-tp.k * STEP);
  for (const j of JOINTS) { f.j[j][0] += (tp[j][0] - f.j[j][0]) * a; f.j[j][1] += (tp[j][1] - f.j[j][1]) * a; }
  f.j.sw += (tp.sw - f.j.sw) * a;
  if (f.state === 'skill' && f.skill === 'spin') { f.j.sw = f.t * 26; f.j.hf = [44, -72]; }   // 枪在身前旋转
  if (f.snap && f.state === 'special' && f.sp !== 'final') f.snap = false;
  // 身体旋转（被击飞时翻滚）
  const rotT = f.state === 'launched' ? clamp(f.vy / 1600, -0.7, 0.7) * -1 : 0;
  f.rot += (rotT - f.rot) * (1 - Math.exp(-10 * STEP));
  f.sk = skeleton(f);
  // 剑光拖尾
  const swinging = (f.state === 'attack' && f.move && f.t > f.move.su * 0.45 && f.t < f.move.su + f.move.ac + 0.05)
    || (f.state === 'special' && ['dash', 'flurry', 'final', 'thrusts', 'slam', 'sweep', 'rush'].includes(f.sp))
    || (f.state === 'skill' && (f.skPh === 1 || f.skPh === 2) && f.t < 0.22);
  if (swinging) f.trail.push({ b: f.sk.bladeMid, t: f.sk.tip, h: f.sk.guard, life: 1 });
  for (const e of f.trail) e.life -= STEP / 0.16;
  while (f.trail.length && f.trail[0].life <= 0) f.trail.shift();
  if (f.trail.length > 28) f.trail.shift();
  // 残影
  f.ghostT -= STEP;
  if ((f.escInvul || f.state === 'dash' || (f.state === 'special' && f.sp !== 'charge' && f.sp !== 'cast' && f.sp !== 'wave') || (f.state === 'skill' && f.skPh === 1 && SKILLS[f.skill] && SKILLS[f.skill].nofric)) && f.ghostT <= 0) { f.ghosts.push({ sk: f.sk, life: 1 }); f.ghostT = 0.022; }
  for (const g of f.ghosts) g.life -= STEP / 0.22;
  while (f.ghosts.length && f.ghosts[0].life <= 0) f.ghosts.shift();
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
function addP(p) { if (!RESIM && particles.length < 600) particles.push(p); }
function hitFX(x, y, power, rgb, face) {
  addP({ type: 'flash', x, y, r: 26 * power, life: 0.1, max: 0.1, rgb: '255,255,255' });
  ring(x, y, 46 * power, rgb, 0.22);
  const n = Math.round(10 + 8 * power);
  for (let i = 0; i < n; i++) {
    const a = (face > 0 ? 0 : Math.PI) + rand(-1.1, 1.1) + (Math.random() < 0.25 ? Math.PI : 0), s = rand(350, 1000) * power;
    addP({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.12, 0.3), max: 0.3, rgb: Math.random() < 0.4 ? '255,255,255' : rgb, w: rand(1.5, 3) * power, drag: 6 });
  }
  for (let i = 0; i < 6 * power; i++) {
    const a = rand(-Math.PI, 0), s = rand(80, 300);
    addP({ type: 'ink', x, y, vx: Math.cos(a) * s + face * 120, vy: Math.sin(a) * s, g: 1400, life: rand(0.4, 0.8), max: 0.8, r: rand(2, 4.5), rgb });
  }
}
function blockFX(x, y, face) {
  ring(x, y, 34, '160,200,255', 0.18);
  for (let i = 0; i < 12; i++) {
    const a = (face > 0 ? Math.PI : 0) + rand(-1.3, 1.3), s = rand(250, 700);
    addP({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, g: 900, life: rand(0.15, 0.35), max: 0.35, rgb: Math.random() < 0.5 ? '255,240,200' : '170,210,255', w: 1.6, drag: 3 });
  }
}
function ring(x, y, r, rgb, life) { addP({ type: 'ring', x, y, r, life, max: life, rgb }); }
function dust(x, y, n) {
  for (let i = 0; i < n; i++) addP({ type: 'dust', x: x + rand(-16, 16), y: y - rand(0, 6), vx: rand(-140, 140), vy: rand(-80, -10), life: rand(0.3, 0.6), max: 0.6, r: rand(6, 14), drag: 4 });
}
function slashLine(x, y, ang, rgb) { addP({ type: 'slash', x, y, ang, len: 420, life: 0.28, max: 0.28, rgb }); }
function updateFX(dt) {
  for (const p of particles) {
    p.life -= dt;
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

// ======================= 主循环 =======================
function step() {
  if (M.mode === 'net' && NET.hold) return;
  if (REC.on && REC.kind === 'loc') REC.f++;
  if (REPLAY.on) REPLAY.f++;
  clock += STEP;
  if (M.mode === 'demo') { updateFX(STEP); return; }   // 主界面：没有对战
  if (hitstop > 0) { hitstop -= STEP; if (!RESIM) updateFX(STEP * 0.3); return; }
  if (superFreeze > 0) {
    superFreeze -= STEP;
    rpPoint(); updateFighter(superOwner, foeOf(superOwner)); rpPost(); if (!RESIM) { animFighter(superOwner); updateFX(STEP); }
    return;
  }
  if (M.worldKey) worldKeyStep();   // 全服肉鸽的关键战：伤害交给服务器（22-world.js）
  if (M.mode === 'world') worldUpdate(); else if (!isClient()) updateMatch(); else M.t += STEP;
  // 多人对局：每帧开头所有人先选一次目标（foeOf 会记住目标）。以前只有电脑在想招时选，回放里没人想招，目标换得晚一帧就走样了
  if (isMulti() && M.phase !== 'ko') for (const f of allFighters()) if (!f.hidden && f.hp > 0) foeOf(f);
  if (!ROLL.on && !REPLAY.on) { const player = allFighters().find(f => f.ctrl === human[0]); if (player) secretThink(player); }
  for (const f of allFighters()) if (!f.hidden && f.hp > 0 && f.ctrl && f.ctrl.think) { if (M.phase === 'ko') f.ctrl.clear(); else f.ctrl.think(f, foeOf(f)); }   // 分出胜负后电脑收手，好让赢家举剑
  rpPoint();
  updateFighter(A, foeOf(A)); updateFighter(B, foeOf(B));
  if (isMulti()) {
    if (!C.hidden) updateFighter(C, foeOf(C));
    if (!D.hidden) updateFighter(D, foeOf(D));
    updateArena2v2(STEP);
  }
  if (M.mode === 'train' && TRAIN.frameProbe && !RESIM) {
    const p = TRAIN.frameProbe, ready = f => ['idle', 'walk', 'air', 'block'].includes(f.state);
    if (p.attacker === null && ready(A)) p.attacker = clock;
    if (p.defender === null && ready(B)) p.defender = clock;
    if (p.attacker !== null && p.defender !== null) { TRAIN.advantage = Math.round((p.defender - p.attacker) / STEP); TRAIN.frameProbe = null; }
  }
  mapTick(STEP);   // 山河异境：风、天雷、酒雾（不在山河异境就什么都不做）
  // 倒下的人一直躺着：落地后不管之前是什么状态（受身、被打、技能收招）都按回地上，不再站起来
  if (M.mode !== 'train' && (M.phase === 'ko' || M.phase === 'end' || (isMulti() && M.phase === 'fight'))) {
    for (const f of allFighters()) {
      if (!f.hidden && f.hp <= 0 && f.onGround() && f.state !== 'knockdown' && f.state !== 'launched') {
        f.state = 'knockdown'; f.t = 0; f.vx *= 0.5; f.invul = 99; f.move = null; f.skill = null; f.airRecover = false; f.escInvul = false;
      }
    }
  }
  rpPost();
  pushApart();
  if (!RESIM) { for (const f of allFighters()) if (!f.hidden) animFighter(f); }
  updateDecoys();
  updateProjs();
  trSample();
  if (FOREST.on) forestUpdate();
  if (!RESIM) updateFX(STEP);
  if (!RESIM) for (const p of petals) {
    p.x += (p.vx + Math.sin(clock + p.ph) * 20) * STEP; p.y += p.vy * STEP; p.r += STEP * 2;
    if (p.y > 30) { p.y = rand(-800, -500); p.x = rand(cam.x - 900, cam.x + 900); }
  }
  if (!RESIM) for (const c of comboUI) c.t -= STEP;
}
const cam = { x: STAGE_W / 2, y: 0, zoom: 1 };
let camPunch = { zoom: 0, x: STAGE_W / 2, y: 0, t: 0, maxT: 0 };
function camImpact(x, y, zoomBoost, duration) {
  if (M.mode === 'watch2v2') zoomBoost *= 0.6;
  if (camPunch.t <= 0 || zoomBoost >= camPunch.zoom) {
    camPunch.zoom = zoomBoost;
    camPunch.x = x !== undefined ? x : cam.x;
    camPunch.y = y !== undefined ? y : 0;
    camPunch.t = duration;
    camPunch.maxT = duration;
  }
}
let acc = 0, last = performance.now(), FPS = 0, fpsN = 0, fpsT = 0;
let lastDraw = 0, bgLast = 0;
// 鼠标朝向：角色面朝鼠标所在的一侧（按住防御时仍然自动面向对手）
// 朝向：默认面向自己的方向（A 朝左，D 朝右）；开启自动面向对手时才自动转向对手
function updateAim() {
  for (let i = 0; i < human.length; i++) {
    const h = human[i];
    if (!h) continue;
    if (!SETTINGS.aim || M.mode === 'demo') h.held.aim = 0;
    else if (h.held.left && !h.held.right) h.held.aim = -1;
    else if (h.held.right && !h.held.left) h.held.aim = 1;
    else if (!h.held.aim) {
      const f = [A, B, C, D].find(x => x && x.ctrl === h);
      h.held.aim = (f && f.face) ? f.face : (i % 2 === 0 ? 1 : -1);
    }
  }
}
function faceDir(f, foe) {
  const h = f.ctrl && f.ctrl.held;
  const dir = h ? ((h.right ? 1 : 0) - (h.left ? 1 : 0)) : 0;
  const a = dir || (h && h.aim);
  const on = a && !h.down && (SETTINGS.aim || !human.includes(f.ctrl));   // 对手的设置由对手那边决定
  if (on) return a;
  if (h && !h.down && human.includes(f.ctrl) && SETTINGS.aim) return f.face;
  const dx = foe.x - f.x;
  return Math.abs(dx) > 3 ? (dx > 0 ? 1 : -1) : f.face;
}
function simTick(real) {
  if (ROLL.on && M.mode === 'net') return rollTick(real);
  if (slowmo > 0) slowmo -= real;
  if (REPLAY.on) return replayTick(real);
  if (trainingInspectTick(real)) return;
  acc += real * (slowmo > 0 ? 0.28 : 1) * cineSpeed();
  if (acc > STEP * 5) acc = STEP * 5;
  let n = 0;
  while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
  if (n >= 5) acc = 0;
}
function trainingInspectTick(real) {
  if (M.mode !== 'train') return false;
  if (TRAIN.inspectPaused) { TRAIN.inspectAcc = 0; acc = 0; return true; }
  const hz = Math.max(1, Math.min(120, Math.round(TRAIN.inspectHz || 120)));
  if (hz >= 120) { TRAIN.inspectAcc = 0; return false; }
  TRAIN.inspectAcc += real * hz;
  let n = 0;
  while (TRAIN.inspectAcc >= 1 && n < 5) { step(); TRAIN.inspectAcc -= 1; n++; }
  if (n >= 5) TRAIN.inspectAcc = 0;
  acc = 0;
  return true;
}
// 切到后台时浏览器会停掉 requestAnimationFrame，联机对局靠这个小 Worker 接着算。
// 只在网页藏起来的时候开着：回到前台就关掉，不然每 8 毫秒唤醒一次主线程，白白费电
function backgroundLocalActive() {
  return SETTINGS.backgroundPlay === true && M.mode !== 'net' && M.mode !== 'demo' && !REPLAY.on && !isAiVsAi() && !paused && !EXT.on && !document.querySelector('.scr.on');
}
let bgWorker = null, bgUrl = '';
function bgWorkerSet(on) {
  if (!on) { if (bgWorker) { bgWorker.terminate(); bgWorker = null; } bgLast = 0; return; }
  if (bgWorker) return;
  try {
    bgUrl = bgUrl || URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},8)'], { type: 'text/javascript' }));
    bgWorker = new Worker(bgUrl);
    bgWorker.onmessage = () => {
      if (!document.hidden || (M.mode !== 'net' && !backgroundLocalActive())) { bgLast = 0; return; }
      const now = performance.now(), real = bgLast ? Math.min(0.05, (now - bgLast) / 1000) : 0; bgLast = now;
      if (real > 0 && !paused) { simTick(real); if (M.mode === 'net') netTick(real); }
    };
  } catch (e) { bgWorker = null; }
}
document.addEventListener('visibilitychange', () => bgWorkerSet(document.hidden));
if (document.hidden) bgWorkerSet(true);
// ======================= 青锋行：同一个文件里的第二个游戏（放在独立的 iframe 里运行，两边互不干扰） =======================
const EXT = { on: false, url: '' };
function openQfx() {
  initAudio();
  if (!EXT.url) {
    const qfxEl = $id('qfxData'), raw = qfxEl ? qfxEl.textContent.trim() : '';
    if (raw) {
      const bin = atob(raw), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      EXT.url = URL.createObjectURL(new Blob([u8], { type: 'text/html;charset=utf-8' }));
    } else {
      EXT.url = 'assets/qingfengxing.html';
    }
  }
  const fr = $id('extFrame');
  fr.src = EXT.url; $id('extGame').classList.remove('hidden'); EXT.on = true;
  try { if (AC) AC.suspend(); } catch (e) {}
  fr.onload = () => { try { fr.focus(); fr.contentWindow.focus(); } catch (e) {} };
}
function closeQfx() {
  EXT.on = false; $id('extFrame').src = 'about:blank'; $id('extGame').classList.add('hidden');
  try { if (AC) AC.resume(); } catch (e) {}
}
$id('extBack').addEventListener('click', closeQfx);

// ======================= 对战回放 =======================
// 对战的逻辑完全由“开场状态 + 每一帧双方的操作”决定，所以只记操作，回放时重新算一遍
const RP_KEY = 'renying-replays', RP_MAX = 10;
// 训AI 用的真实轨迹：录这一局时每 TR_EVERY 帧采一条「状态 + 双方操作」，一局最多留 TR_PER_MATCH 条。
// 以前这里导出的是写死的常量数组（同一个假状态、同一个动作、奖励只看输赢），拿这种数据训练只会学到乱按。
const TR_KEY = 'renying-train-set', TR_SET_MAX = 4000, TR_EVERY = 4, TR_LEGACY_EVERY = 6, TR_PER_MATCH = 3600;

function ctrlKey(c) {
  const b = c.buf;
  let s = inBits(c.held) + ':' + c.atkT;
  for (const k in b) s += ';' + k + '=' + b[k];
  return s;
}
function recBegin(kind) {
  M.reviewReady = false;
  Object.assign(REC, { on: true, bad: false, kind, f: 0, nf: 0, ev: [], tr: [], trStart: null, post: ['', ''], last: [-1, -1],
    meta: { v: VERSION, kind, mode: M.mode, playerSide: localIdx(), trainSlots: kind === 'net' ? [...((ROLL.slots || [])[localIdx()] || [])] : allFighters().filter(f => human.includes(f.ctrl)).map(f => [A, B, C, D].indexOf(f)), mapActive: !!mapNow(), level: M.level || '', ch: [A.chIdx, B.chIdx], trEvery: TR_EVERY, st0: capState(), t: Date.now() } });
  if (M.hasBuffs && M.competitiveScrolls) REC.meta.competitiveScrolls = JSON.parse(JSON.stringify(M.competitiveScrolls));
  // pl：哪几个人按玩家的规则选目标。回放里大家都是普通 Ctrl，不记的话玩家会被当成电脑去配合队友，回放就走样了
  if (kind === 'loc' && is2v2()) { Object.assign(REC.meta, { four: true, sub: M.subMode || '', ch4: [A.chIdx, B.chIdx, C.chIdx, D.chIdx], pl: [A, B, C, D].map(f => !cpuTeamwork(f)) }); REC.post = ['', '', '', '']; }
  if (kind === 'loc' && M.mode === 'raid') { Object.assign(REC.meta, { raid: true, four: true, sub: 'local', ch4: [A.chIdx, B.chIdx, C.chIdx, D.chIdx], raidSquadSize: M.raidSquadSize || 3, raidWave: M.raidWave || 1 }); REC.post = ['', '', '', '']; }
  if (kind === 'loc' && M.mode === 'tag3') Object.assign(REC.meta, { tag3: true, teams: jclone(M.teams || []), teamIdx: [...(M.teamIdx || [0, 0])], round: M.round || 1, mutator: M.teamMutator || 'normal' });
  if (kind === 'loc' && M.mode === 'tower') Object.assign(REC.meta, { towerFloor: M.towerFloor || 1, scrolls: [...(M.towerPerks || [])] });
  if (kind === 'loc' && M.mode === 'saga' && typeof SG !== 'undefined') Object.assign(REC.meta, { chapter: SG.hero || '', chapterNode: SG.node || 0 });
  // 联机：按键是按“每台电脑”记的（一台可能管两个人），回放时要知道每台电脑管哪几个人；2v2 里没人管的是电脑，回放时照样让它想
  if (kind === 'net') {
    Object.assign(REC.meta, { slots: ROLL.slots.map(s => s.slice()), room: netRoomMode, ranked: !!NET.isRanked });   // 房间规则也记下：回放时按它判断 2v2、同袍肉鸽、神决
    if (isRaid()) REC.meta.raidWave = M.raidWave || 1;
    if (allFighters().length > 2 || isRaid()) Object.assign(REC.meta, { four: is2v2(), raid: isRaid(), sub: netRoomMode, ch4: [A.chIdx, B.chIdx, C.chIdx, D.chIdx] });
  }
}
// 本地回放要记的人：1v1 是 A、B，2v2 四个人都记（顺序 A B C D，和 fighterByIdx 一样）
const rpFighters = m => (m && (m.four || m.raid)) ? [A, B, C, D] : [A, B];   // 同袍肉鸽：A、C、D 打魔首 B（两人队时 D 藏着）
// 本地对战：在角色读操作之前记下双方控制器的状态（只记变化）
function rpPoint() {
  if (REC.on && REC.kind === 'loc') {
    rpFighters(REC.meta).forEach((f, i) => { if (ctrlKey(f.ctrl) !== REC.post[i]) REC.ev.push([REC.f, i, inBits(f.ctrl.held), f.ctrl.atkT, { ...f.ctrl.buf }]); });
  } else if (REPLAY.on && REPLAY.kind === 'loc') {
    const ev = REPLAY.ev;
    while (REPLAY.p < ev.length && ev[REPLAY.p][0] <= REPLAY.f) {
      const e = ev[REPLAY.p++], c = rpFighters(REPLAY.m)[e[1]].ctrl, b = e[2];
      c.held.left = !!(b & 1); c.held.right = !!(b & 2); c.held.down = !!(b & 4); c.held.atk = !!(b & 8); c.held.jump = !!(b & 16);
      c.held.aim = (b & 64) ? ((b & 32) ? -1 : 1) : 0; c.atkT = e[3]; c.buf = { ...e[4] };
    }
  }
}
function rpPost() { if (REC.on && REC.kind === 'loc') REC.post = rpFighters(REC.meta).map(f => ctrlKey(f.ctrl)); }
// 联机：只记两边都确认过的帧
function recNet() {
  if (!REC.on || REC.kind !== 'net') return;
  const R = ROLL, me = localIdx(), upto = Math.min(R.F, R.remLast + 1);
  while (REC.nf < upto) {
    const f = REC.nf++, li = R.loc[f] || EMPTY_IN, ri = R.rem[f] || EMPTY_IN, ins = me === 0 ? [li, ri] : [ri, li];
    ins.forEach((x, i) => { if (x.h !== REC.last[i] || x.p.length) { REC.ev.push([f, i, x.h, ...x.p]); REC.last[i] = x.h; } });
  }
}
function rpList() { try { const l = JSON.parse(localStorage.getItem(RP_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function rpStore(list) {
  for (;;) {
    try { localStorage.setItem(RP_KEY, JSON.stringify(list)); return; }
    catch (e) {
      // 空间不够：先丢最旧的训练轨迹（几十 KB 一条），再丢最旧的整场回放
      const fat = list.find(m => m && Array.isArray(m.tr) && m.tr.length);
      if (fat) { delete fat.tr; continue; }
      if (list.length <= 1) return;
      list.pop();
    }
  }
}
// 一帧的状态特征（18 维：血量、护甲、内力、奥义槽、站位、朝向、滞空、硬直、正对与否）。
// 数值全部来自这一局真实的角色对象，不是编的。
function trFeat(f, o) {
  const r3 = v => Math.round(v * 100) / 100;
  return [
    r3(f.hp / (f.maxHp || 1)), r3(o.hp / (o.maxHp || 1)),
    r3((f.guard || 0) / (f.maxGuard || 100)), r3((o.guard || 0) / (o.maxGuard || 100)),
    r3((f.ink || 0) / (INK_MAX || 1)), r3((o.ink || 0) / (INK_MAX || 1)),
    r3((f.meter || 0) / 100), r3((o.meter || 0) / 100),
    r3(f.x / STAGE_W), r3(o.x / STAGE_W),
    r3(f.y / 400), r3(o.y / 400),
    f.face || 0, o.face || 0,
    f.onGround() ? 1 : 0, o.onGround() ? 1 : 0,
    r3(Math.min(1, (f.stun || 0) / 30)), r3(Math.min(1, (o.stun || 0) / 30)),
    f.face === (o.x > f.x ? 1 : -1) ? 1 : 0
  ];
}
function trActionBits(c) {
  const held = inBits(c.held), buf = c.buf || {};
  return held | (buf.dash !== undefined ? 1 << 7 : 0) | (buf.special !== undefined ? 1 << 8 : 0)
    | (buf.skill !== undefined ? 1 << 9 : 0) | (buf.skill2 !== undefined ? 1 << 10 : 0)
    | (buf.drop !== undefined ? 1 << 11 : 0) | (buf.heavy !== undefined ? 1 << 12 : 0);
}
function trSample() {
  if (RESIM || !REC.on || REC.bad || !REC.meta || !A || !B || A.hidden || B.hidden) return;   // RESIM 是回滚重算，同一帧会再走一遍
  if (REPLAY.on) return;   // 看回放不重复上传
  const tf = REC.kind === 'net' && typeof ROLL !== 'undefined' ? ROLL.F : REC.f;
  if (tf % TR_EVERY) return;
  if (!A.ctrl || !B.ctrl) return;
  // 前 28 项保持旧训练轨迹兼容；末尾为每名本机玩家记录其自身视角的状态与输入。
  const players = [];
  for (const slot of REC.meta.trainSlots || []) {
    const f = [A, B, C, D][slot];
    if (!f || f.hidden || !f.ctrl) continue;
    const side = sideFighters(0).includes(f) ? 0 : 1;
    const foes = sideFighters(1 - side).filter(o => !o.hidden);
    if (!foes.length) continue;
    const foe = foes.reduce((best, o) => Math.hypot(o.x - f.x, o.y - f.y) < Math.hypot(best.x - f.x, best.y - f.y) ? o : best, foes[0]);
    players.push([slot, trFeat(f, foe), trActionBits(f.ctrl)]);
  }
  REC.tr.push([...trFeat(A, B), trActionBits(A.ctrl), trActionBits(B.ctrl), A.state || 'idle', A.moveName || A.skill || A.sp || '', A.escInvul ? 1 : 0, B.state || 'idle', B.moveName || B.skill || B.sp || '', B.escInvul ? 1 : 0, players]);
  if (REC.trStart === null) REC.trStart = tf;
  if (REC.tr.length > TR_PER_MATCH) { REC.tr.shift(); REC.trStart += TR_EVERY; }
}
// 样本记录的格式：s 是 19 维状态，a 是玩家这一帧按住的键（位掩码），r 由血量/护甲变化和胜负算出来。
const TR_STATE_DIM = 19;
function trEpisodes(m) {
  const rows = Array.isArray(m && m.tr) ? m.tr : [], slots = Array.isArray(m && m.trainSlots) && m.trainSlots.length ? m.trainSlots : [m && m.kind === 'net' ? Math.max(0, Math.min(1, +m.playerSide || 0)) : 0];
  const episodes = [];
  for (const slot of slots) {
    const side = m && m.raid ? 0 : m && m.four ? (slot === 0 || slot === 2 ? 0 : 1) : slot;
    const chars = m && Array.isArray(m.ch4) ? m.ch4 : (Array.isArray(m && m.ch) ? m.ch : [0, 1]);
    const heroIdx = chars[slot] || 0, out = [];
    let prev = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length < TR_STATE_DIM + 2) continue;
      const entry = Array.isArray(row[27]) ? row[27].find(p => Array.isArray(p) && p[0] === slot) : null;
      let s, a;
      if (entry && Array.isArray(entry[1]) && entry[1].length === TR_STATE_DIM) { s = entry[1].slice(); a = entry[2]; }
      else if (slot < 2) {
        s = row.slice(0, TR_STATE_DIM); a = row[TR_STATE_DIM + slot];
        if (slot === 1) {
          for (const [x, y] of [[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[14,15],[16,17]]) [s[x], s[y]] = [s[y], s[x]];
          [s[12], s[13]] = [-s[13], -s[12]]; s[18] = 1 - s[18];
        }
      } else continue;
      let r = 0;
      if (prev) r = ((prev[0] - s[0]) - (prev[1] - s[1])) * 10 + ((prev[2] - s[2]) - (prev[3] - s[3])) * 2;
      prev = s;
      out.push({ hero: (CHARS[heroIdx] || {}).id || 'hero', heroIdx, s, a, r: Math.round(r * 1000) / 1000, mode: m.mode || 'cpu', frame: Array.isArray(m.trFrames) && Number.isFinite(+m.trFrames[i]) ? +m.trFrames[i] : (+m.trStart || 0) + i * (+m.trEvery || TR_LEGACY_EVERY), source: 'user_replay' });
    }
    if (out.length) {
      const last = out[out.length - 1], winner = m.w === -1 ? -1 : side ? 1 - m.w : m.w;
      last.r = Math.round((last.r + (winner === 0 ? 1 : winner === 1 ? -1 : 0)) * 1000) / 1000;
      last.done = 1; episodes.push({ slot, side, rows: out });
    }
  }
  return episodes;
}
function trSet() { try { const l = JSON.parse(localStorage.getItem(TR_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function trSetSave(list) {
  try { localStorage.setItem(TR_KEY, JSON.stringify(list.slice(-TR_SET_MAX))); return true; } catch (e) { return false; }
}
function trDownload(rows, name) {
  if (!rows.length) return false;
  const blob = new Blob([rows.map(s => JSON.stringify(s)).join('\n') + '\n'], { type: 'application/x-jsonlines' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
// 逐行解析训练集文件：一行一个样本，坏行跳过并报行号（返回 { added, bad, total }）
function trImportText(txt) {
  const rows = [], bad = [];
  String(txt || '').split(/\r?\n/).forEach((line, i) => {
    const t2 = line.trim();
    if (!t2) return;
    try {
      const o = JSON.parse(t2);
      if (!o || !Array.isArray(o.s) || o.s.length < 8 || typeof o.a !== 'number') throw new Error('bad');
      rows.push(o);
    } catch (e) { bad.push(i + 1); }
  });
  if (!rows.length) return { added: 0, bad, total: trSet().length };
  const set = trSet().concat(rows);
  return { added: rows.length, bad, total: Math.min(set.length, TR_SET_MAX), ok: trSetSave(set) };
}
function recSave(w) {
  REC.on = false;
  if (REC.bad || !REC.meta) return;
  const m = REC.meta;
  Object.assign(m, { w, wins: [...M.wins], frames: REC.kind === 'net' ? REC.nf : REC.f, ev: REC.ev, tr: REC.tr, trStart: REC.trStart, stats: M.combatStats ? M.combatStats.map(s => ({ ...s })) : null, skins: rpFighters(m).map(f => f.skinKey || ''),
    names: M.mode === 'net' ? rpNetNames(m)
      : m.raid ? [sideFighters(0).map(f => f.look.name).join(' · '), (M.raidBoss && M.raidBoss.heroNames || []).join('·') || B.look.name]
        : m.four ? ({ p_cc: [ACC.name || '你', '电脑'], pp_cc: ['1P · 2P', '电脑'], pp_pp: ['1P · 2P', '3P · 4P'] }[m.sub] || ['苍龙', '赤凤']) : M.mode === 'cpu' ? [ACC.name || '你', '电脑'] : ['1P', '2P'] });
  if (RP.run && RP.run.mode === M.mode) {
    RP.run.segments.push(m);
    if (typeof aiTrainMatch === 'function') aiTrainMatch(m, M.worldKey ? 'world' : undefined);
    const replay = rpRunReplay(RP.run, w);
    RP.last = replay;
    M.reviewReady = true;
    rpRunStore(replay);
    REC.meta = null;
    return replay;
  }
  RP.last = m;
  M.reviewReady = true;
  const list = rpList(); list.unshift(m); while (list.length > RP_MAX) list.pop();
  rpStore(list);
  if (typeof aiTrainMatch === 'function') aiTrainMatch(m, M.worldKey ? 'world' : undefined);
  return m;
}
function rpRunBegin(mode) {
  RP.run = { id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, mode, segments: [] };
}
function rpRunStore(replay) {
  const list = rpList(), prior = list.findIndex(x => x && x.runId === replay.runId);
  if (prior >= 0) list.splice(prior, 1);
  list.unshift(replay); while (list.length > RP_MAX) list.pop();
  rpStore(list);
}
function rpRunReplay(run, winner) {
  const segments = run.segments || [], first = segments[0] || {}, last = segments[segments.length - 1] || first;
  const totalFrames = segments.reduce((n, s) => n + Math.max(0, +s.frames || 0), 0);
  const rows = [], trFrames = [];
  let frameOffset = 0;
  for (const s of segments) {
    const segmentRows = Array.isArray(s.tr) ? s.tr : [];
    segmentRows.forEach((row, i) => { rows.push(row); trFrames.push(frameOffset + (+s.trStart || 0) + i * (+s.trEvery || TR_LEGACY_EVERY)); });
    frameOffset += Math.max(0, +s.frames || 0);
  }
  const stats = Array.from({ length: 4 }, (_, i) => segments.reduce((sum, s) => {
    const x = s.stats && s.stats[i] || {};
    sum.damage += +x.damage || 0; sum.combo = Math.max(sum.combo, +x.combo || 0);
    sum.breaks += +x.breaks || 0; sum.falls += +x.falls || 0;
    return sum;
  }, { damage: 0, combo: 0, breaks: 0, falls: 0 }));
  return { ...last, ...first, runId: run.id, segments, st0: first.st0, ev: [], tr: rows, trFrames, trStart: 0,
    w: winner, frames: totalFrames, stats: run.mode === 'tag3' && last.stats ? last.stats : stats, skins: first.skins || [], names: last.names || first.names,
    wins: last.wins || first.wins, towerFloor: last.towerFloor || first.towerFloor,
    raidWave: last.raidWave || first.raidWave, round: segments.length };
}
function matchReviewData(m) {
  if (!m || !['cpu', 'net', '2v2', 'pvp', 'maps', 'tag3', 'chaos', 'mayhem', 'tower', 'saga', 'raid'].includes(m.mode) || (!Array.isArray(m.stats) && !(Array.isArray(m.tr) && m.tr.length))) return null;
  const team = !!(m.four || m.raid), side = m.raid || ['p_cc', 'pp_cc'].includes(m.sub) ? 0 : m.playerSide === 1 ? 1 : 0;
  const ownIdx = m.raid ? [0, 2, 3] : m.four ? (side === 0 ? [0, 2] : [1, 3]) : [side];
  const foeIdx = m.raid ? [1] : m.four ? (side === 0 ? [1, 3] : [0, 2]) : [side ^ 1];
  const sumStats = ids => ids.reduce((sum, i) => {
    const s = (m.stats || [])[i] || {};
    sum.damage += Math.max(0, +s.damage || 0); sum.combo = Math.max(sum.combo, +s.combo || 0);
    sum.breaks += Math.max(0, +s.breaks || 0); sum.falls += Math.max(0, +s.falls || 0);
    return sum;
  }, { damage: 0, combo: 0, breaks: 0, falls: 0 });
  const own = sumStats(ownIdx), foe = sumStats(foeIdx);
  const dealt = Math.max(0, +own.damage || 0), taken = Math.max(0, +foe.damage || 0), combo = Math.max(0, +own.combo || 0), breaks = Math.max(0, +own.breaks || 0), falls = Math.max(0, +own.falls || 0);
  const samples = (team ? [] : Array.isArray(m.tr) ? m.tr : []).map((row, index) => ({ row, index })).filter(({ row }) => Array.isArray(row) && row.length >= 21 && row.slice(0, 19).every(Number.isFinite));
  const rows = samples.map(sample => sample.row);
  const playerIdx = (m.ch4 || m.ch || [])[m.raid ? 0 : m.four ? ownIdx[0] : side] ?? (m.ch || [])[side] ?? (m.ch || [])[0] ?? 0;
  const foePlayerIdx = (m.ch4 || m.ch || [])[foeIdx[0]] ?? (m.ch || [])[side ^ 1] ?? 0;
  const hero = CHARS[playerIdx] || {}, opponent = CHARS[foePlayerIdx] || {}, heroFrames = aiBrainData().frames && aiBrainData().frames[hero.id] || {};
  const rowFrame = i => { const index = samples[i].index; return Array.isArray(m.trFrames) && Number.isFinite(+m.trFrames[index]) ? +m.trFrames[index] : (+m.trStart || 0) + index * (+m.trEvery || TR_LEGACY_EVERY); };
  let attacks = 0, far = 0, misfaced = 0, farFrame = null, misfacedFrame = null;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const r = rows[rowIndex];
    const ownBits = +r[19 + side] || 0;
    if (!(ownBits & 8)) continue;
    attacks++;
    const ownX = r[side ? 9 : 8], foeX = r[side ? 8 : 9];
    const frame = rowFrame(rowIndex);
    if (Math.abs(ownX - foeX) > 0.2) { far++; if (farFrame === null) farFrame = frame; }
    const ownFace = r[side ? 13 : 12], toward = foeX > ownX ? 1 : -1;
    if (ownFace !== toward) { misfaced++; if (misfacedFrame === null) misfacedFrame = frame; }
  }
  const strengths = [], errors = [], next = [], moments = [];
  if (dealt > taken && dealt > 0) strengths.push(`伤害交换占优：造成 ${Math.round(dealt)}，承受 ${Math.round(taken)}。`);
  if (combo >= 3) strengths.push(`最长连击：${combo} 段。`);
  if (breaks > 0) strengths.push(`成功破防：${breaks} 次。`);
  if (!strengths.length) strengths.push('对局统计已保存，可在回放中复核攻防交换。');
  const sampleFrame = rowFrame;
  for (let i = 1; i < rows.length; i++) {
    if (samples[i].index !== samples[i - 1].index + 1) continue;
    const prev = rows[i - 1], cur = rows[i], atk = (+prev[19 + side] || 0) & 8 || (+cur[19 + side] || 0) & 8;
    const ownHp = side ? 1 : 0, foeHp = side ? 0 : 1;
    const foeLoss = prev[foeHp] - cur[foeHp], ownLoss = prev[ownHp] - cur[ownHp];
    if (atk && foeLoss > 0.005 && ownLoss <= 0.005) {
      moments.push({ frame: sampleFrame(i), text: '有利交换片段：对手气血下降，你没有同时失血。' });
      break;
    }
  }
  for (let i = 1; i < rows.length; i++) {
    if (samples[i].index !== samples[i - 1].index + 1) continue;
    const prev = rows[i - 1], cur = rows[i], ownAt = side ? 24 : 21, foeAt = side ? 21 : 24;
    if (cur.length < 27 || prev.length < 27) break;
    const escapedFromHit = ['hitstun', 'launched', 'knockdown'].includes(prev[ownAt]) && cur[ownAt + 2] === 1;
    if (escapedFromHit) {
      moments.push({ frame: sampleFrame(i), text: '脱身时机：你在受压后成功使用了腾空闪。' });
      break;
    }
  }
  for (let i = 1; i < rows.length; i++) {
    if (samples[i].index !== samples[i - 1].index + 1) continue;
    const prev = rows[i - 1], cur = rows[i], ownAt = side ? 24 : 21, foeAt = side ? 21 : 24;
    if (cur.length < 27 || prev.length < 27) break;
    const foeActing = ['attack', 'skill', 'special'].includes(prev[foeAt]) || ['attack', 'skill', 'special'].includes(cur[foeAt]);
    const ownGuarding = ['block', 'blockstun'].includes(cur[ownAt]);
    const ownHp = side ? 1 : 0;
    if (foeActing && ownGuarding && prev[ownHp] - cur[ownHp] <= 0.005) {
      moments.push({ frame: sampleFrame(i), text: '防守成功：你挡住了对手的进攻，没有在这段交换中掉血。' });
      break;
    }
  }
  const quickRange = +(heroFrames.l1 && heroFrames.l1.max) || 100;
  for (let i = 1; i < rows.length; i++) {
    if (samples[i].index !== samples[i - 1].index + 1) continue;
    const prev = rows[i - 1], cur = rows[i], ownAt = side ? 24 : 21, foeAt = side ? 21 : 24;
    if (cur.length < 27 || prev.length < 27) break;
    const foeStun = cur[side ? 16 : 17] || 0, ownIdle = ['idle', 'block', 'air'].includes(cur[ownAt]);
    const ownAttack = ((+cur[19 + side] || 0) & 8) !== 0;
    const distance = Math.abs(cur[side ? 9 : 8] - cur[side ? 8 : 9]) * STAGE_W;
    if (foeStun >= 0.2 && ownIdle && !ownAttack && distance <= quickRange * 1.15) {
      moments.push({ frame: sampleFrame(i), text: '可能的追击窗口：对手仍处于硬直，双方距离接近你的快速普攻范围。' });
      break;
    }
  }
  if (taken > dealt * 1.2 && taken > 0) {
    errors.push('承受伤害明显高于输出，交换中还可以减少硬吃招式。');
    next.push('先练习格挡与腾空闪，等对手招式结束后再反击。');
  }
  if (attacks >= 8 && far / attacks >= 0.25) {
    const pct = Math.round(far / attacks * 100);
    errors.push(`约 ${pct}% 的攻击输入发生在较远距离，可能有部分出手够不到对手。`);
    if (farFrame !== null) moments.push({ frame: farFrame, text: '远距离出手：攻击输入发生时双方相距较远。' });
    next.push('把回放频率调到 1 Hz 并打开判定框，确认攻击范围覆盖对手后再出手。');
  }
  if (attacks >= 8 && misfaced / attacks >= 0.2) {
    const pct = Math.round(misfaced / attacks * 100);
    errors.push(`约 ${pct}% 的攻击输入发生时没有正对对手。`);
    if (misfacedFrame !== null) moments.push({ frame: misfacedFrame, text: '朝向检查：攻击输入发生时没有正对对手。' });
    next.push('起手前确认朝向，必要时先用方向键调整再攻击。');
  }
  const ownQ = SKILLS[hero.skill] || {}, ownR = SKILLS[hero.skill2] || {}, foeQ = SKILLS[opponent.skill] || {}, foeR = SKILLS[opponent.skill2] || {};
  const matchup = hero.id && opponent.id ? {
    hero: hero.name || '', heroId: hero.id, opponent: opponent.name || '', opponentId: opponent.id,
    ownMove: ownR.name || ownQ.name || '', foeMove: foeR.name || foeQ.name || '',
    choice: attacks >= 6 && far / attacks > 0.3 && ownR.name ? 'ranged' : misfaced / Math.max(1, attacks) > 0.2 ? 'face' : 'defense',
    ownChoice: attacks >= 6 && far / attacks > 0.3 && ownR.name ? (ownR.name || '') : (ownQ.name || ownR.name || '')
  } : null;
  if (falls > 0) { errors.push(`本局坠崖 ${falls} 次，边缘位置需要更早回到场地中央。`); next.push('把对手引向场地内侧，自己靠近边缘时优先撤回安全位置。'); }
  if (!errors.length) errors.push('现有数据未发现明显的远距离出手或失衡交换。');
  if (!next.length) next.push('用慢放和判定框复核命中后的硬直窗口，再练习一套稳定的追击。');
  const context = { hero: hero.name || '', heroId: hero.id || '', mode: m.mode || '', level: m.level || '' };
  const focus = falls > 0 ? 'edge' : taken > dealt * 1.2 && taken > 0 ? 'defense' : misfaced / Math.max(1, attacks) >= 0.2 ? 'facing' : 'range';
  const evidence = rows.length < 12 ? 'limited' : rows.length < 60 ? 'sampled' : 'strong';
  const duration = Math.max(0, +m.frames || 0), closeFinish = m.w !== -1 && (m.w === side ? taken > dealt * 0.62 : dealt > taken * 0.62);
  const practiceSignal = falls > 0 || combo >= 3 || taken > dealt * 1.2 || (attacks >= 8 && (far / attacks >= 0.25 || misfaced / attacks >= 0.2));
  const worthwhile = duration >= 120 * 12 && (practiceSignal || closeFinish);
  const reviewReason = falls > 0 ? 'edge' : closeFinish ? 'close' : combo >= 5 ? 'combo' : 'decision';
  return { dealt: Math.round(dealt), taken: Math.round(taken), combo, breaks, rows: rows.length, team, context, matchup, focus, evidence, worthwhile, reviewReason, strengths, errors, next, moments: moments.slice(0, 4) };
}
function endReviewShow(m) {
  const btn = $id('endReviewBtn'), panel = $id('endReview');
  if (!btn || !panel) return;
  const review = matchReviewData(m);
  btn.classList.toggle('hidden', !review);
  btn.setAttribute('aria-expanded', String(!!review));
  panel.classList.toggle('hidden', !review);
  if (!review) { panel.innerHTML = ''; return; }
  const list = items => `<ul>${items.map(s => `<li>${escapeHTML(reviewCopy(s))}</li>`).join('')}</ul>`;
  const moments = review.moments.length ? `<section class="end-review-block end-review-moments"><h4>${cvT('关键时刻')}</h4><ul>${review.moments.map(x => `<li><button type="button" class="end-review-jump" data-review-frame="${Math.max(0, Math.floor(x.frame))}">${cvT('回放')} ${formatReviewTime(x.frame)} · ${escapeHTML(cvT(x.text))}</button></li>`).join('')}</ul></section>` : '';
  const context = review.context && review.context.hero ? `<p class="end-review-context">${escapeHTML(cvT(review.context.hero))} · ${cvT(review.context.mode === 'net' ? '联机对局' : review.context.mode === 'cpu' ? '人机对局' : '本地对局')}${review.context.level ? ` · ${escapeHTML(cvT(LV_NAME[review.context.level] || review.context.level))}` : ''}</p>` : '';
  const evidenceText = review.evidence === 'limited' ? '样本较少，建议先当作线索' : review.evidence === 'sampled' ? '依据录像抽样帧与统计' : '录像抽样较充分';
  if (review.worthwhile) btn.textContent = cvT('建议复盘 · AI 复盘'); else btn.textContent = cvT('AI 复盘');
  const matchup = review.matchup ? `<section class="end-review-block"><h4>${cvT('本局对阵建议')}</h4><p>「${escapeHTML(cvT(review.matchup.hero))}」${cvT('迎战')}「${escapeHTML(cvT(review.matchup.opponent))}」 · ${cvT('关注对方')}「${escapeHTML(cvT(review.matchup.foeMove))}」${cvT('；建议选择')}「${escapeHTML(cvT(review.matchup.ownChoice))}」${cvT(review.matchup.choice === 'ranged' ? '保持距离牵制并趁收招接近。' : review.matchup.choice === 'face' ? '校正朝向后起手。' : '先防守脱身，再抓收招反击。')}</p></section>` : '';
  const worth = review.worthwhile ? `<p class="end-review-note"><strong>${cvT('这局值得复盘')}</strong> · ${cvT(review.reviewReason === 'edge' ? '坠崖说明边缘决策值得重看。' : review.reviewReason === 'close' ? '胜负接近，重看关键交换能找到改变结果的选择。' : review.reviewReason === 'combo' ? '本局出现长连段，可以重看起手和追击选择。' : '录像中发现可练习的决策点。')}</p>` : '';
  panel.innerHTML = `<h3>${cvT('本局 AI 复盘')}</h3>${context}${worth}<p class="end-review-note">${cvT(evidenceText)} · ${cvT('分析结合双方侠客、技能、站位与输入，给出可复核的战术选择建议。')}</p><div class="end-review-stats"><span>${cvT(review.team ? '团队造成伤害' : '造成伤害')} ${review.dealt}</span><span>${cvT(review.team ? '团队承受伤害' : '承受伤害')} ${review.taken}</span><span>${cvT('最长连击')} ${review.combo}</span><span>${cvT('破防次数')} ${review.breaks}</span>${review.rows ? `<span>${cvT('分析帧数')} ${review.rows}</span>` : ''}</div><div class="end-review-grid"><section class="end-review-block"><h4>${cvT('做得好')}</h4>${list(review.strengths)}</section><section class="end-review-block"><h4>${cvT('可改进')}</h4>${list(review.errors)}</section><section class="end-review-block"><h4>${cvT('下一步')}</h4>${list(review.next)}</section>${matchup}${moments}</div><p class="end-review-note">${cvT('关键时刻来自录像中的抽样状态与输入，点击可跳到对应回放帧。')}</p><div class="row end-review-actions"><button class="ghost" type="button" data-review-practice="${escapeHTML(review.context.heroId)}" data-review-focus="${review.focus}">${cvT('用这位侠客去练习')}</button><span>${cvT('这份复盘有帮助吗？')}</span><button class="ghost" type="button" data-review-vote="yes">${cvT('有帮助')}</button><button class="ghost" type="button" data-review-vote="no">${cvT('没帮助')}</button></div>`;
}
function reviewCopy(value) {
  const s = String(value || '');
  let m;
  if ((m = s.match(/^伤害交换占优：造成 (\d+)，承受 (\d+)。$/))) return `${cvT('伤害交换占优')}: ${cvT('造成伤害')} ${m[1]}, ${cvT('承受伤害')} ${m[2]}.`;
  if ((m = s.match(/^最长连击：(\d+) 段。$/))) return `${cvT('最长连击')}: ${m[1]}.`;
  if ((m = s.match(/^约 (\d+)% 的攻击输入发生在较远距离，可能有部分出手够不到对手。$/))) return `${m[1]}% of attack inputs were made from too far away to reach the opponent.`;
  if ((m = s.match(/^约 (\d+)% 的攻击输入发生时没有正对对手。$/))) return `${m[1]}% of attack inputs were made while facing away from the opponent.`;
  if ((m = s.match(/^本局坠崖 (\d+) 次，边缘位置需要更早回到场地中央。$/))) return `${cvT('坠崖')}: ${m[1]}. Move back toward the center sooner near an edge.`;
  return cvT(s);
}
function formatReviewTime(frame) {
  const seconds = Math.floor(Math.max(0, +frame || 0) / 120);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function replayJump(m, frame) {
  startReplay(m);
  const target = Math.max(0, Math.min(Math.floor(+frame || 0), Math.max(0, (m.frames || 0) - 1)));
  REPLAY.paused = true;
  $id('rpPause').textContent = cvT('继续');
  const advance = () => {
    if (!REPLAY.on) return;
    let count = 0;
    while (REPLAY.totalFrame < target && M.phase !== 'end' && count++ < 480) replayFrame();
    if (REPLAY.totalFrame < target && M.phase !== 'end') { setTimeout(advance, 0); return; }
    REPLAY.paused = true;
    REPLAY.frameAcc = 0;
    $id('rpPause').textContent = cvT('继续');
    rpInfo();
  };
  setTimeout(advance, 0);
}
$id('endReview').addEventListener('click', e => {
  const vote = e.target.closest('[data-review-vote]');
  if (vote) {
    if (typeof STATQ !== 'undefined' && !STATQ.reviewVote) {
      STATQ.reviewVote = vote.dataset.reviewVote;
      if (typeof statEv === 'function') statEv(vote.dataset.reviewVote === 'yes' ? 'review_yes' : 'review_no');
      for (const b of $id('endReview').querySelectorAll('[data-review-vote]')) b.disabled = true;
      vote.textContent = cvT('已收到反馈');
    }
    return;
  }
  const jump = e.target.closest('[data-review-frame]');
  if (jump && RP.last) replayJump(RP.last, +jump.dataset.reviewFrame);
  const practice = e.target.closest('[data-review-practice]');
  if (practice && typeof openReviewTraining === 'function') openReviewTraining(practice.dataset.reviewHero || practice.dataset.reviewPractice, practice.dataset.reviewFocus);
});
$id('endReviewBtn').addEventListener('click', () => {
  const panel = $id('endReview'), btn = $id('endReviewBtn'), open = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', String(open));
});
// 联机录像两队的名字：双人共斗是两个人一队打电脑，其余是房主一队、加入的人一队
function rpNetNames(m) {
  const h = (NET.names || {}).host || '游客', c = (NET.names || {}).client || '游客';
  return m.raid ? [h + ' · ' + c, '魔首'] : m.four && m.sub === 'pp_cc' ? [h + ' · ' + c, '电脑'] : [h, c];
}
function rpTitle(m) {
  if (m.raid && Array.isArray(m.names)) return `${m.names[0]} 对 ${m.names[1]}`;
  const nm = i => (CHARS[(m.ch4 || m.ch)[i]] || {}).name || '?';
  return m.four ? `${nm(0)} · ${nm(2)} 对 ${nm(1)} · ${nm(3)}` : `${nm(0)} 对 ${nm(1)}`;
}
function rpSub(m) {
  const d = new Date(m.t), pad = x => String(x).padStart(2, '0');
  const mode = replayModeTag(m);
  const win = m.w >= 0 ? `${m.four ? (m.names || [])[m.w] || '' : (CHARS[m.ch[m.w]] || {}).name || ''} 胜` : '平局';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())} · ${mode} · ${(m.names || []).join(' 对 ')} · ${win} ${m.wins ? m.wins.join(':') : ''}${m.v !== VERSION ? ' · 旧版本录的，可能对不上' : ''}`;
}
function replayModeTag(m) {
  const mutator = m.st0 && m.st0.M && m.st0.M.teamMutator;
  const mutatorTag = mutator === 'chaos' ? ` · ${cvT('天机乱斗')}` : mutator === 'mayhem' ? ` · ${cvT('通天神决')}` : '';
  if (m.raid) return `${cvT(m.kind === 'net' ? '联机同袍肉鸽' : '本地同袍肉鸽')} · ${cvT('第')} ${m.raidWave || 1}${m.runId ? ` · ${cvT('全程')} ${m.segments.length} ${cvT('劫')}` : ''}`;
  if (m.mode === 'mayhem' || m.room === 'mayhem') return cvT(m.mode === 'net' ? '联机通天神决' : '通天神决');
  if (m.mode === 'net') return m.ranked ? cvT('排位赛') : m.four ? `${cvT('联机2v2')} · ${cvT(m.sub === 'pp_pp' ? '四人对决' : m.sub === 'pp_cc' ? '双人共斗' : '携手共斗')}` : `${cvT('联机')} · ${cvT(m.room === 'chaos' ? '天机乱斗' : m.room === 'mayhem' ? '通天神决' : '标准对战')}`;
  if (m.mode === 'cpu') return `${cvT('人机')} · ${cvT(LV_NAME[m.level] || m.level || '')}`;
  if (m.mode === 'pvp') return cvT('本地双人');
  if (m.mode === '2v2') return `${cvT('2v2')} · ${cvT({ p_cc: '携手共斗', pp_cc: '双人共斗', pp_pp: '四人对决' }[m.sub] || '组队')}${mutatorTag}`;
  if (m.mode === 'maps') return `${cvT('山河异境')} · ${cvT((MAPS[m.st0 && m.st0.M && m.st0.M.map] || {}).n || '')}`;
  if (m.mode === 'tag3') return `${cvT('门派车轮战')} · ${m.runId ? `${m.segments.length} ${cvT('局全程')}` : `${cvT('第')} ${m.round || 1}`}${mutatorTag}`;
  if (m.mode === 'chaos') return cvT('天机乱斗');
  if (m.mode === 'tower') return `${cvT('万仞剑阁')} · ${cvT('第')} ${m.towerFloor || 1}${m.runId ? ` · ${cvT('全程')} ${m.segments.length} ${cvT('层')}` : ''}`;
  if (m.mode === 'saga') return `${cvT('侠客列传')} · ${cvT(CHARS.find(c => c.id === m.chapter)?.name || '')} · ${cvT('第')} ${(m.chapterNode || 0) + 1}`;
  return cvT('本地对战');
}
function renderReplays() {
  const list = rpList(), setN = trSet().length;
  // 训练集是本机攒下来的样本（导入的 .jsonl 并在这里），能整包导出、也能清掉
  const trRow = setN ? `<div class="rprow"><div class="rpm"><div class="rpt">训练集</div><div class="rps">${setN} 个样本</div></div><div style="display:flex;gap:6px;"><button class="ghost" data-trdl="1">导出</button><button class="ghost" data-trclear="1">清空</button></div></div>` : '';
  $id('rpList').innerHTML = (list.length ? list.map((m, i) => `<div class="rprow"><div class="rpm"><div class="rpt">${escapeHTML(rpTitle(m))}</div><div class="rps">${escapeHTML(rpSub(m))}</div></div><div style="display:flex;gap:6px;"><button class="go" data-rp="${i}">播放</button><button class="ghost" data-rptrain="${i}">训AI</button><button class="ghost" data-rpexp="${i}">导出</button><button class="ghost" data-rpdel="${i}">删除</button></div></div>`).join('')
    : uiState('empty', '还没有回放。完成一场支持录像的战斗后，回放会自动保存在这里。')) + trRow;
}
$id('rpList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const list = rpList();
  if (b.dataset.trdl !== undefined) {
    const set = trSet();
    if (trDownload(set, `renying-train-set_${Date.now()}.jsonl`)) toast(`已导出训练集：${set.length} 个样本`);
    return;
  }
  if (b.dataset.trclear !== undefined) {
    try { localStorage.removeItem(TR_KEY); } catch (e) {}
    renderReplays(); toast('训练集已清空');
    return;
  }
  if (b.dataset.rp !== undefined) { const m = list[+b.dataset.rp]; if (m) startReplay(m); }
  else if (b.dataset.rpdel !== undefined) { list.splice(+b.dataset.rpdel, 1); rpStore(list); renderReplays(); }
  else if (b.dataset.rptrain !== undefined) {
    const m = list[+b.dataset.rptrain];
    if (!m) return;
    const samples = trSamples(m);
    if (!samples.length) {
      // 老版本录的回放、或从别处导入的回放里没有逐帧状态：说清楚，别再造一份假的出来
      toast('这局没有采集到逐帧状态（旧版本录的或导入的回放），没法生成训练轨迹');
      return;
    }
    if (trDownload(samples, `user_fight_${m.t || Date.now()}.jsonl`)) {
      toast(`已导出这一局的真实轨迹：${samples.length} 个样本（s = 19 维状态，a = 按键位掩码，r = 本帧回血/掉血与终局胜负）`);
    }
  }
  else if (b.dataset.rpexp !== undefined) {
    const m = list[+b.dataset.rpexp];
    if (!m) return;
    const blob = new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RenYing-Replay-${m.t || Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('录像已导出');
  }
});
if ($id('rpTrainUploadBtn')) {
  $id('rpTrainUploadBtn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,.jsonl,application/json';
    inp.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const txt = evt.target.result;
          if (file.name.endsWith('.jsonl')) {
            // 逐行真的读进来，并进训练集；坏行报数字，不再只是弹个提示然后把文件丢掉
            const r = trImportText(txt);
            if (!r.added) throw new Error(r.bad.length ? `没有可用的样本（第 ${r.bad.slice(0, 3).join('、')} 行格式不对）` : '文件里没有样本');
            if (r.ok === false) throw new Error('本机空间不够，训练集没存下');
            renderReplays();
            toast(`已加入 ${r.added} 个样本${r.bad.length ? `（跳过 ${r.bad.length} 行格式不对的）` : ''} · 训练集共 ${r.total} 个`);
          } else {
            const m = JSON.parse(txt);
            if (!m || !Array.isArray(m.ch)) throw new Error('无效战局录像');
            const list = rpList();
            list.unshift(m);
            while (list.length > RP_MAX) list.pop();
            rpStore(list);
            renderReplays();
            toast('战局已成功导入！点击「训AI」即可生成训练数据集');
          }
        } catch (err) {
          toast(err.message || '战局上传失败');
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  });
}
if ($id('rpImportBtn')) {
  $id('rpImportBtn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const m = JSON.parse(evt.target.result);
          if (!m || !m.ev || !m.st0 || !Array.isArray(m.ch)) {
            throw new Error('录像文件格式不正确');
          }
          const list = rpList();
          list.unshift(m);
          while (list.length > RP_MAX) list.pop();
          rpStore(list);
          renderReplays();
          toast('录像导入成功');
        } catch (err) {
          toast(err.message || '录像解析失败');
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  });
}
function startReplay(m) {
  if (!m || !m.ev || !m.st0) return;
  debugHitbox = false;
  if (FOREST.on) { FOREST.on = false; FOREST.mons = []; FOREST.shots = []; B.forestProxy = false; B.hidden = false; }
  ROLL.on = false; REC.on = false; paused = false; BP = null; B.dummy = false; M.stage = null;
  Object.assign(REPLAY, { on: true, m, totalFrame: 0, segmentIndex: 0, segments: Array.isArray(m.segments) && m.segments.length ? m.segments : [m], paused: false, speed: 1, hz: 120, frameAcc: 0 });
  replayLoadSegment(REPLAY.segments[0]);
  acc = 0; creditT = 0; particles.length = 0;
  pickScene();
  $id('rpPause').textContent = '暂停';
  for (const x of document.querySelectorAll('#rpBar [data-sp]')) x.classList.toggle('sel', x.dataset.sp === '1');
  replayInspectRender();
  $id('rpBar').classList.remove('hidden');
  rpInfo();
}
function replayLoadSegment(m) {
  ROLL.on = false; REC.on = false; M.stage = null;
  setChars(m.ch[0], m.ch[1]);
  if (m.ch4) { C.setChar(m.ch4[2]); D.setChar(m.ch4[3]); }
  const net = m.kind === 'net', mine = new Set(net ? rpSlots(m).flat() : []);
  for (const f of rpFighters(m)) {
    f.ctrl = net && !mine.has(f.idx) ? new AICtrl(m.level || 'god') : new Ctrl();
    if (net && mine.has(f.idx)) f.ctrl.net = true;
  }
  if (!net && m.four && Array.isArray(m.pl)) rpFighters(m).forEach((f, i) => { if (m.pl[i]) f.ctrl.net = true; });
  restState(m.st0);
  M.mode = 'replay';
  M.competitiveScrolls = m.competitiveScrolls && typeof m.competitiveScrolls === 'object' ? JSON.parse(JSON.stringify(m.competitiveScrolls)) : null;
  M.hasBuffs = !!(M.competitiveScrolls && Object.values(M.competitiveScrolls).some(team => Object.keys(team || {}).length));
  Object.assign(REPLAY, { kind: m.kind, seg: m, ev: m.ev || [], p: 0, f: 0, nf: 0, lh: [0, 0] });
  if (isRaid()) raidBossSkills();
  showScreen(null);
  startRound();
  rpFighters(m).forEach((f, i) => { const k = (m.skins || [])[i] || ''; f.look = skinLook(f.chIdx, k); f.skinKey = k; });
}
function rpInfo() {
  if (REPLAY.on) {
    const segments = REPLAY.segments || [], progress = segments.length > 1 ? ` · 第 ${REPLAY.segmentIndex + 1}/${segments.length} 段` : '';
    $id('rpInfo').textContent = cvT(`回放 · 第${M.round}回合${progress}${REPLAY.paused ? ' · 已暂停' : ''} · F1 判定框`);
  }
  replayInspectRender();
}
function replayInspectRender() {
  const rate = $id('rpHz'), value = $id('rpHzValue'), hitbox = $id('rpHitbox'), advance = $id('rpStep');
  if (rate && rate.value !== String(REPLAY.hz || 120)) rate.value = String(REPLAY.hz || 120);
  if (value && value.textContent !== `${REPLAY.hz || 120} Hz`) value.textContent = `${REPLAY.hz || 120} Hz`;
  if (hitbox) {
    hitbox.setAttribute('aria-pressed', String(debugHitbox));
    const label = cvT(`F1 判定框：${debugHitbox ? '开' : '关'}`);
    if (hitbox.textContent !== label) hitbox.textContent = label;
  }
  if (advance) advance.disabled = !REPLAY.on || !REPLAY.paused || M.phase === 'end';
}
// 联机录像里每台电脑管哪几个人（fighter 序号）；以前的录像没记，那时只有 1v1：房主 A、加入的人 B
const rpSlots = m => (m && Array.isArray(m.slots) && m.slots.length === 2) ? m.slots : [[0], [1]];
function replayFrame() {
  if (REPLAY.kind === 'net') {
    const ev = REPLAY.ev, cur = [{ h: REPLAY.lh[0], p: [] }, { h: REPLAY.lh[1], p: [] }];
    while (REPLAY.p < ev.length && ev[REPLAY.p][0] <= REPLAY.nf) { const e = ev[REPLAY.p++]; cur[e[1]] = { h: e[2], p: e.slice(3) }; REPLAY.lh[e[1]] = e[2]; }
    rpSlots(REPLAY.m).forEach((slot, side) => slot.forEach((idx, k) => applyInput(fighterByIdx(idx).ctrl, slotInput(cur[side], k))));
    REPLAY.nf++;
  }
  step();
  REPLAY.totalFrame = (REPLAY.totalFrame || 0) + 1;
  const replayFrameNo = REPLAY.kind === 'net' ? REPLAY.nf : REPLAY.f;
  const seg = REPLAY.seg || REPLAY.m;
  if (REPLAY.on && M.phase !== 'end' && +seg.frames > 0 && replayFrameNo >= +seg.frames) replayEnd(REPLAY.m.w);
}
function replayTick(real) {
  if (REPLAY.paused || M.phase === 'end') return;
  REPLAY.frameAcc += real * Math.max(1, Math.min(120, REPLAY.hz || 120)) * REPLAY.speed;
  let n = 0;
  while (REPLAY.frameAcc >= 1 && n < 48) { replayFrame(); REPLAY.frameAcc -= 1; n++; if (M.phase === 'end' || !REPLAY.on) break; }
  if (n >= 48) REPLAY.frameAcc = 0;
  rpInfo();
}
function replayStep() {
  if (!REPLAY.on || !REPLAY.paused || M.phase === 'end') return false;
  REPLAY.frameAcc = 0;
  replayFrame();
  replayInspectRender();
  return true;
}
function replayEnd(w) {
  if (REPLAY.segmentIndex + 1 < (REPLAY.segments || []).length) {
    REPLAY.segmentIndex++;
    replayLoadSegment(REPLAY.segments[REPLAY.segmentIndex]);
    rpInfo();
    return;
  }
  M.phase = 'end'; REPLAY.paused = true;
  $id('rpBar').classList.add('hidden');
  const t = $id('endTitle'), wf = [A, B][w], mate = REPLAY.m && REPLAY.m.four ? [C, D][w] : null;
  if (wf) { t.textContent = `${wf.look.name}${mate ? ' · ' + mate.look.name : ''} 胜`; t.style.color = `rgb(${wf.look.slash})`; } else { t.textContent = '平局'; t.style.color = ''; }
  $id('endSub').textContent = `回放结束，比分 ${M.wins[0]} : ${M.wins[1]}`;
  $id('endRank').textContent = '';
  $id('againBtn').style.display = 'none';
  $id('rpWatch').style.display = ''; $id('rpWatch').textContent = '再看一遍';
  $id('endChangeHeroBtn').classList.add('hidden');
  $id('endRelayTeams').classList.add('hidden');
  $id('endHistoryBtn').classList.toggle('hidden', !rpList().length);
  RP.last = REPLAY.m;
  endReviewShow(REPLAY.m);
  setTimeout(() => showScreen('end'), 300);
}
$id('rpWatch').addEventListener('click', () => { if (RP.last) startReplay(RP.last); });
$id('rpPause').addEventListener('click', () => { REPLAY.paused = !REPLAY.paused; $id('rpPause').textContent = cvT(REPLAY.paused ? '继续' : '暂停'); rpInfo(); });
$id('rpHz').addEventListener('input', e => { REPLAY.hz = Math.max(1, Math.min(120, Math.round(+e.target.value || 120))); REPLAY.frameAcc = 0; replayInspectRender(); });
$id('rpHitbox').addEventListener('click', () => { if (!REPLAY.on || M.phase === 'end') return; debugHitbox = !debugHitbox; replayInspectRender(); });
$id('rpStep').addEventListener('click', replayStep);
$id('rpExit').addEventListener('click', toMenu);
for (const b of document.querySelectorAll('#rpBar [data-sp]')) b.addEventListener('click', () => {
  REPLAY.speed = +b.dataset.sp;
  for (const x of document.querySelectorAll('#rpBar [data-sp]')) x.classList.toggle('sel', x === b);
});
window.addEventListener('keydown', e => { if (REPLAY.on && e.code === 'Space' && M.phase !== 'end') { e.preventDefault(); e.stopImmediatePropagation(); $id('rpPause').click(); } }, true);

// ======================= 青锋行打通：每破一章的首领，在刃影领奖励（青锋行发来 3、6、10，依次是第一、二、三章） =======================
const QFX_REW = [[3, 200, ''], [6, 300, ''], [10, 500, 'qf_qfx']];
const QFX = { busy: false };
function qfxBest() { try { return +localStorage.getItem('renying-qfx') || 0; } catch (e) { return 0; } }
function extToast(msg, dur = 4.5) {
  const el = $id('extToast'); if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(extToast.t); extToast.t = setTimeout(() => el.classList.remove('on'), dur * 1000);
}
function qfxNotify(msg) { if (EXT.on) extToast(msg); else toast(msg); }
function qfxCleared(n) {
  if (n > qfxBest()) try { localStorage.setItem('renying-qfx', String(n)); } catch (e) {}
  const r = QFX_REW.find(x => x[0] === n);
  const chName = { 3: '山门', 6: '竹林', 10: '剑冢' }[n];
  if (r) extToast(`${chName}已破！`);
}
window.addEventListener('message', e => {
  const fr = $id('extFrame'); if (!fr || e.source !== fr.contentWindow) return;
  const d = e.data; if (d && d.qfx === 'wave') qfxCleared(d.n | 0);
});
// 主循环：无论这一帧里哪里出错，都保证下一帧照常运行（不会让游戏“卡死”）
// 画质自动降一档：玩家没在设置里手动选过画质时，对局里（不算首页演示、观战、暂停）累计约 6 秒不到 40 帧，
// 就降一档（极高 → 中 → 低）并提示一句。手动选过画质就再也不动；帧率上限设成 30 的也不动。
const AUTOQ = { slowT: 0, n: 0, t0: 0, fps: 60 };
function autoQualityTick(now) {
  // 自己按真实时间数帧：FPS 那个数用的是封顶 0.04 秒的帧间隔，真卡到几帧的时候它还显示 25
  if (!AUTOQ.t0) AUTOQ.t0 = now;
  AUTOQ.n++;
  const span = now - AUTOQ.t0;
  if (span < 1000) return;
  AUTOQ.fps = AUTOQ.n * 1000 / span; AUTOQ.n = 0; AUTOQ.t0 = now;
  if ((navigator.webdriver && !window.__autoQTest) || SETTINGS.qualityChosen || SETTINGS.quality === 'low' || SETTINGS.fps < 60
    || M.mode === 'demo' || M.watchAi || paused || document.hidden || span > 5000) { AUTOQ.slowT = 0; return; }
  if (AUTOQ.fps < 40) AUTOQ.slowT += span / 1000; else AUTOQ.slowT = Math.max(0, AUTOQ.slowT - span / 500);
  if (AUTOQ.slowT < 6) return;
  AUTOQ.slowT = 0;
  SETTINGS.quality = SETTINGS.quality === 'high' ? 'mid' : 'low'; SETTINGS.qualityAuto = true;
  saveSettings(); resize();
  toast(SETTINGS.quality === 'mid' ? '画面有点卡，已自动调成中画质（可在设置里改回）' : '画面还是卡，已自动调成低画质（可在设置里改回）');
}
function frame(now) {
  if (EXT.on) { last = now; requestAnimationFrame(frame); return; }   // 正在玩青锋行：刃影这边不画也不算
  try { frameBody(now); }
  catch (e) { frame.errs = (frame.errs || 0) + 1; if (frame.errs <= 3) console.error('刃影：这一帧出错了，已跳过', e); }
  requestAnimationFrame(frame);
}
function frameBody(now) {
  const targetFps = [144, 120, 60, 30].includes(SETTINGS.fps) ? SETTINGS.fps : 144;
  const targetInterval = 1000 / targetFps;
  const elapsed = now - lastDraw;
  if (elapsed < targetInterval - 3) return;
  lastDraw = now - (elapsed % targetInterval);
  const real = Math.min(0.04, (now - last) / 1000); last = now; menuDt = real;
  fpsN++; fpsT += real; if (fpsT >= 0.5) { FPS = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  autoQualityTick(now);
  if (!paused) {
    if (slowmo > 0) slowmo -= real;
    if (typeof swapFreezeTimer !== 'undefined' && swapFreezeTimer > 0) swapFreezeTimer = Math.max(0, swapFreezeTimer - real);
    for (const f of [A, B]) if (f.state === 'special' && f.sp === 'charge' && f.t < 0.06 && cine.t < 0) { cine.t = 0; cine.owner = f; if (f.idx === localIdx()) MSTAT.ults++; if (AC && MUSIC.gain) { drum(AC.currentTime, 'taiko', 0.8); flute(noteF(12), AC.currentTime + 0.05, 1.1, 0.1); } }
    if (cine.t >= 0) { cine.t += real; if (cine.t > CINE_LEN) { cine.t = -1; cine.owner = null; } }
    updateFireflies(real); updateAim();
    if (TUT && M.mode === 'train' && !paused) tutTick(real);
    for (const f of [A, B]) { if (f.vox) f.vox = damp(f.vox, 0, 14, real); if (f.voy) f.voy = damp(f.voy, 0, 14, real); }
    if (document.hidden && backgroundLocalActive() && (bgWorker || bgAiTimer)) { /* background ticker owns local simulation */ }
    else if (ROLL.on && M.mode === 'net') rollTick(real);
    else if (REPLAY.on) replayTick(real);
    else if (!trainingInspectTick(real)) {
      acc += real * (slowmo > 0 ? 0.28 : 1) * cineSpeed();
      if (acc > STEP * 5) acc = STEP * 5;
      let n = 0;
      while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
      if (n >= 5) acc = 0;
    }
    shake = damp(shake, 0, 10, real);
    shakeDirX = damp(shakeDirX, 0, 14, real);
    shakeDirY = damp(shakeDirY, 0, 14, real);
    flashA = damp(flashA, 0, 8, real);
    dimA = damp(dimA, (superFreeze > 0 || (A.state === 'special' || B.state === 'special')) ? 1 : 0, 10, real);
    if (announce) {
      announce.t += real;
      if (announce.t >= announce.dur) {
        announce = announceQueue.length > 0 ? announceQueue.shift() : null;
      }
    } else if (announceQueue.length > 0) {
      announce = announceQueue.shift();
    }
    if (creditT > 0) {
      creditT -= real;
      if (creditT <= 0 && creditPending) {
        creditPending = false;
        const rTxt = isRaid() ? `同袍肉鸽 · 第 ${M.raidWave || 1} 重魔劫！` : (M.mode === 'tag3' ? `第${CN[M.round] || M.round}局 · 开战！` : (M.mode === 'mayhem' ? '通天神决 · 开战！' : (M.mode === 'watch2v2' ? '天道 2v2 · 演武开战！' : `第${CN[M.round] || M.round}回合`)));
        say(rTxt, 1.1);
        SFX.gong();
      }
    }
    updateCamera(real);
  }
  bpTick(real);
  musicSet(musicMode());
  netTick(real);
  render();
  touchUIUpdate();
  dummyBarUpdate();
  trainInspectUpdate();
}
function updateCamera(dt) {
  if (WORLD.on) { worldCamera(dt); return; }
  if (FOREST.on) {   // 闯关打妖物：镜头框住同袍小队与附近的妖物
    const allies = sideFighters(0).filter(f => !f.hidden && f.hp > 0);
    const allyXs = allies.length ? allies.map(f => f.x) : [A.x];
    const near = FOREST.mons.filter(m => Math.abs(m.x - A.x) < 750);
    const xs = [...allyXs, ...near.map(m => m.x)], lo = Math.min(...xs), hi = Math.max(...xs);
    const fx = clamp((lo + hi) / 2, A.x - 320, A.x + 320);
    cam.x = damp(cam.x, fx, 6, dt); cam.zoom = damp(cam.zoom, clamp(1.12 - (hi - lo) / 1600, 0.64, 1.05), 3, dt);
    cam.y = damp(cam.y, Math.min(0, A.y * 0.4), 6, dt);
    return;
  }
  const tracked = isMulti() ? [A, B, C, D].filter(f => !f.hidden && f.hp > 0) : [A, B];
  const pool = tracked.length >= 2 ? tracked : [A, B];
  const minX = Math.min(...pool.map(f => f.x)), maxX = Math.max(...pool.map(f => f.x));
  const minY = Math.min(...pool.map(f => f.y));
  const mid = (minX + maxX) / 2, d = maxX - minX, base = H / 560;
  // 2v2 / 同袍肉鸽：多名侠客同台，镜头退一档，把 2600 宽的奇阵擂台框得舒服些
  const padW = isMulti() ? 680 : 340;
  const fitW = W / ((d + padW) * base);
  const top = -minY + 170;
  const fitH = (H * 0.74) / (Math.max(250, top) * base);
  const fit = Math.max(0.28, Math.min(fitW, fitH));
  let focus = mid, zoomMul = superFreeze > 0 ? 1.1 : 1;
  if (camPunch.t > 0) {
    camPunch.t = Math.max(0, camPunch.t - dt);
    const k = camPunch.maxT > 0 ? (camPunch.t / camPunch.maxT) : 0;
    const ease = Math.sin(k * Math.PI * 0.5);
    zoomMul *= 1 + camPunch.zoom * ease;
    focus = lerp(focus, camPunch.x, 0.65 * ease);
  }
  const lf = allFighters()[localIdx()];
  if (lf && lf.state === 'charge' && M.mode !== 'demo' && !is2v2()) {
    const lv = clamp(lf.t / CHARGE_FULL, 0, 1); zoomMul *= 1 + 0.24 * lv; focus = lerp(mid, lf.x, 0.4 * lv);
  }
  const ce = cineEnv();
  if (ce > 0 && cine.owner) { zoomMul *= 1 + 0.4 * ce; focus = lerp(focus, cine.owner.x, 0.6 * ce); }
  const minZoom = is2v2() ? 0.4 : 0.6;
  // 1v1 用原本的曲线；2v2 基准更小（近身也会留出擂台与灯火），并压低上限
  const wantBase = is2v2() ? clamp(1.08 - d / 2600, minZoom, 1.0) : clamp(1.42 - d / 1000, minZoom, 1.35);
  // 2v2 再压一个上限，近身缠斗时也不回到 1.0+ 的贴脸视角（1v1 不设上限，保持原曲线）
  const maxZoom = is2v2() ? 0.70 : Infinity;
  let want = Math.min(wantBase * zoomMul, fit, maxZoom);
  const pf = paperFX();
  if (pf) { want = lerp(want, W / ((STAGE_W + 220) * base), pf.a); focus = lerp(focus, STAGE_W / 2, pf.a); }   // 宣纸：镜头拉远，整张图一览无余
  cam.zoom = damp(cam.zoom, want, want < cam.zoom ? 12 : (ce > 0 ? 9 : 3), dt);
  cam.zoom = Math.min(cam.zoom, fit, maxZoom);
  cam.y = damp(cam.y, Math.min(0, minY * 0.35), 4, dt);
  cam.x = damp(cam.x, focus, 8, dt);
  const vw = W / worldScale();
  cam.x = vw >= STAGE_W + 200 ? STAGE_W / 2 : clamp(cam.x, vw / 2 - 100, STAGE_W + 100 - vw / 2);
  const lo = maxX - vw / 2 + 60, hi = minX + vw / 2 - 60;
  if (lo <= hi) cam.x = clamp(cam.x, lo, hi); else cam.x = mid;
}
const worldScale = () => (H / 560) * cam.zoom;
// 墨羽大招「符阵」：整张图化作宣纸。返回放符的人和 0~1 的浓淡
function paperFX() {
  const f = allFighters().find(x => x && x.state === 'special' && x.ch.ult === 'inkdragon');
  if (!f) return null;
  return { f, a: clamp(f.t / 0.25, 0, 1) * (f.hitDone ? clamp(((f.fuT || 0.95) + 0.5 - f.t) / 0.25, 0, 1) : 1) };
}

