// ======================= 姿势动画 =======================
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
      const chargePoses = { qingfeng: 'qf_charge', feiying: 'fy_seal', tieshan: 'ts_lift', lingshuang: 'ls_stance', liuyun: 'ly_fanswipe', leiming: 'lm_boxer', moyu: 'my_stroke', yuehua: 'yh_lotus', yanling: 'yl_wings', yuxiao: 'yx_play', zuixian: 'zx_drink', gouchen: 'gc_wind' };
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
    if (f.skAir && f.y < -4) pn = (AIR_SKILL_POSE[f.skill] || {})[pn] || (pn === 'idle' || pn === 'getup' ? 'fall' : pn);
    p = POSES[pn] || POSES.idle;
  } else if (s === 'dash') { p = POSES[f.dashDir === f.face ? 'dash' : 'bdash']; k = 30; }
  else if (s === 'air') { p = POSES[f.vy < 0 ? 'jump' : 'fall']; k = 14; }
  else if (s === 'block' || s === 'blockstun') { p = POSES.block; k = 30; }
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
    const bob = -Math.abs(cs) * 2.8;
    out.hip[1] += bob; out.neck[1] += bob; out.hf[1] += bob - sn * 2.2; out.hb[1] += bob + sn * 2.2;
    const lean = f.vx * f.face > 0 ? 4.5 : -2.5;
    out.neck[0] += lean; out.hf[0] += lean * 0.5 - sn * 3; out.hb[0] += sn * 3;
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
    kf: T(kf), ff: T(ff), kb: T(kb), fb: T(fb), hilt: T(hilt), guard: T(guard), bladeMid: T(mid), tip: T(tip), face: f.face };
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
  if (!isClient()) updateMatch(); else M.t += STEP;
  for (const f of allFighters()) if (!f.hidden && f.hp > 0 && f.ctrl && f.ctrl.think) { if (M.phase === 'ko') f.ctrl.clear(); else f.ctrl.think(f, foeOf(f)); }   // 分出胜负后电脑收手，好让赢家举剑
  rpPoint();
  updateFighter(A, foeOf(A)); updateFighter(B, foeOf(B));
  if (is2v2()) {
    updateFighter(C, foeOf(C)); updateFighter(D, foeOf(D));
    updateArena2v2(STEP);
  }
  // 倒下的人一直躺着：落地后不管之前是什么状态（受身、被打、技能收招）都按回地上，不再站起来
  if (M.mode !== 'train' && (M.phase === 'ko' || M.phase === 'end' || (is2v2() && M.phase === 'fight'))) {
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
  acc += real * (slowmo > 0 ? 0.28 : 1) * cineSpeed();
  if (acc > STEP * 5) acc = STEP * 5;
  let n = 0;
  while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
  if (n >= 5) acc = 0;
}
// 切到后台时浏览器会停掉 requestAnimationFrame，联机对局靠这个小 Worker 接着算。
// 只在网页藏起来的时候开着：回到前台就关掉，不然每 8 毫秒唤醒一次主线程，白白费电
let bgWorker = null, bgUrl = '';
function bgWorkerSet(on) {
  if (!on) { if (bgWorker) { bgWorker.terminate(); bgWorker = null; } bgLast = 0; return; }
  if (bgWorker) return;
  try {
    bgUrl = bgUrl || URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},8)'], { type: 'text/javascript' }));
    bgWorker = new Worker(bgUrl);
    bgWorker.onmessage = () => {
      if (!document.hidden || M.mode !== 'net') { bgLast = 0; return; }
      const now = performance.now(), real = bgLast ? Math.min(0.05, (now - bgLast) / 1000) : 0; bgLast = now;
      if (real > 0 && !paused) { simTick(real); netTick(real); }
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
function ctrlKey(c) {
  const b = c.buf;
  let s = inBits(c.held) + ':' + c.atkT;
  for (const k in b) s += ';' + k + '=' + b[k];
  return s;
}
function recBegin(kind) {
  Object.assign(REC, { on: true, bad: false, kind, f: 0, nf: 0, ev: [], post: ['', ''], last: [-1, -1],
    meta: { v: VERSION, kind, mode: M.mode, level: M.level || '', ch: [A.chIdx, B.chIdx], st0: capState(), t: Date.now() } });
}
// 本地对战：在角色读操作之前记下双方控制器的状态（只记变化）
function rpPoint() {
  if (REC.on && REC.kind === 'loc') {
    [A, B].forEach((f, i) => { if (ctrlKey(f.ctrl) !== REC.post[i]) REC.ev.push([REC.f, i, inBits(f.ctrl.held), f.ctrl.atkT, { ...f.ctrl.buf }]); });
  } else if (REPLAY.on && REPLAY.kind === 'loc') {
    const ev = REPLAY.ev;
    while (REPLAY.p < ev.length && ev[REPLAY.p][0] <= REPLAY.f) {
      const e = ev[REPLAY.p++], c = [A, B][e[1]].ctrl, b = e[2];
      c.held.left = !!(b & 1); c.held.right = !!(b & 2); c.held.down = !!(b & 4); c.held.atk = !!(b & 8); c.held.jump = !!(b & 16);
      c.held.aim = (b & 64) ? ((b & 32) ? -1 : 1) : 0; c.atkT = e[3]; c.buf = { ...e[4] };
    }
  }
}
function rpPost() { if (REC.on && REC.kind === 'loc') REC.post = [ctrlKey(A.ctrl), ctrlKey(B.ctrl)]; }
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
    catch (e) { if (list.length <= 1) return; list.pop(); }
  }
}
function recSave(w) {
  REC.on = false;
  if (M.stage || FOREST.on || REC.bad || !REC.meta) return;
  const m = REC.meta;
  Object.assign(m, { w, wins: [...M.wins], frames: REC.kind === 'net' ? REC.nf : REC.f, ev: REC.ev, skins: [A.skinKey || '', B.skinKey || ''],
    names: M.mode === 'net' ? [(NET.names || {}).host || '游客', (NET.names || {}).client || '游客'] : M.mode === 'cpu' ? [ACC.name || '你', '电脑'] : ['1P', '2P'] });
  RP.last = m;
  const list = rpList(); list.unshift(m); while (list.length > RP_MAX) list.pop();
  rpStore(list);
}
function rpTitle(m) {
  const nm = i => (CHARS[m.ch[i]] || {}).name || '?';
  return `${nm(0)} 对 ${nm(1)}`;
}
function rpSub(m) {
  const d = new Date(m.t), pad = x => String(x).padStart(2, '0');
  const mode = m.mode === 'net' ? '联机' : m.mode === 'cpu' ? `电脑·${LV_NAME[m.level] || m.level}` : '本地双人';
  const win = m.w >= 0 ? `${(CHARS[m.ch[m.w]] || {}).name || ''} 胜` : '平局';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())} · ${mode} · ${(m.names || []).join(' 对 ')} · ${win} ${m.wins ? m.wins.join(':') : ''}${m.v !== VERSION ? ' · 旧版本录的，可能对不上' : ''}`;
}
function renderReplays() {
  const list = rpList();
  $id('rpList').innerHTML = list.length ? list.map((m, i) => `<div class="rprow"><div class="rpm"><div class="rpt">${escapeHTML(rpTitle(m))}</div><div class="rps">${escapeHTML(rpSub(m))}</div></div><div style="display:flex;gap:6px;"><button class="go" data-rp="${i}">播放</button><button class="ghost" data-rptrain="${i}">训AI</button><button class="ghost" data-rpexp="${i}">导出</button><button class="ghost" data-rpdel="${i}">删除</button></div></div>`).join('')
    : '<p class="netnote">还没有回放。打完一场人机或联机对战，这里会自动保存。</p>';
}
$id('rpList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const list = rpList();
  if (b.dataset.rp !== undefined) { const m = list[+b.dataset.rp]; if (m) startReplay(m); }
  else if (b.dataset.rpdel !== undefined) { list.splice(+b.dataset.rpdel, 1); rpStore(list); renderReplays(); }
  else if (b.dataset.rptrain !== undefined) {
    const m = list[+b.dataset.rptrain];
    if (!m) return;
    const samples = [];
    const ch = m.ch || [0, 1];
    const frames = m.frames || 600;
    const isWin0 = m.w === 0;
    for (let f = 0; f < frames; f += 2) {
      samples.push({
        hero: (CHARS[ch[0]] || {}).id || 'hero',
        heroIdx: ch[0],
        s: [0, 0, 0.25, 1, 1, 1, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        a: 5,
        r: isWin0 ? 1.5 : -0.2,
        mode: m.mode || 'cpu',
        source: 'user_replay'
      });
    }
    const blob = new Blob([samples.map(s => JSON.stringify(s)).join('\n') + '\n'], { type: 'application/x-jsonlines' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user_fight_${m.t || Date.now()}.jsonl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`已将战局转录为 AI 训练轨迹 (${samples.length} 样本) · 放入 data/ 即可学习`);
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
            toast('已载入自定义战局轨迹 · 神经策略将同步蒸馏学习');
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
  if (FOREST.on) { FOREST.on = false; FOREST.mons = []; FOREST.shots = []; B.forestProxy = false; B.hidden = false; }
  ROLL.on = false; REC.on = false; paused = false; BP = null; B.dummy = false; M.stage = null;
  setChars(m.ch[0], m.ch[1]);
  A.ctrl = new Ctrl(); B.ctrl = new Ctrl();
  restState(m.st0);
  M.mode = 'replay';
  Object.assign(REPLAY, { on: true, m, kind: m.kind, ev: m.ev, p: 0, f: 0, nf: 0, lh: [0, 0], paused: false, speed: 1, names: m.names || null });
  acc = 0; creditT = 0; particles.length = 0;
  showScreen(null);
  startRound();
  [A, B].forEach((f, i) => { const k = (m.skins || [])[i] || ''; f.look = skinLook(f.chIdx, k); f.skinKey = k; });
  pickScene();
  $id('rpPause').textContent = '暂停';
  for (const x of document.querySelectorAll('#rpBar [data-sp]')) x.classList.toggle('sel', x.dataset.sp === '1');
  $id('rpBar').classList.remove('hidden');
  rpInfo();
}
function rpInfo() { if (REPLAY.on) $id('rpInfo').textContent = `回放 · 第${CN[M.round] || M.round}回合${REPLAY.paused ? ' · 已暂停' : ''}`; }
function replayFrame() {
  if (REPLAY.kind === 'net') {
    const ev = REPLAY.ev, cur = [{ h: REPLAY.lh[0], p: [] }, { h: REPLAY.lh[1], p: [] }];
    while (REPLAY.p < ev.length && ev[REPLAY.p][0] <= REPLAY.nf) { const e = ev[REPLAY.p++]; cur[e[1]] = { h: e[2], p: e.slice(3) }; REPLAY.lh[e[1]] = e[2]; }
    applyInput(A.ctrl, cur[0]); applyInput(B.ctrl, cur[1]);
    REPLAY.nf++;
  }
  step();
}
function replayTick(real) {
  if (REPLAY.paused || M.phase === 'end') return;
  acc += real * (slowmo > 0 ? 0.28 : 1) * cineSpeed() * REPLAY.speed;
  let n = 0;
  while (acc >= STEP && n < 48) { replayFrame(); acc -= STEP; n++; if (M.phase === 'end' || !REPLAY.on) break; }
  if (n >= 48) acc = 0;
  rpInfo();
}
function replayEnd(w) {
  $id('rpBar').classList.add('hidden');
  const t = $id('endTitle'), wf = [A, B][w];
  if (wf) { t.textContent = `${wf.look.name} 胜`; t.style.color = `rgb(${wf.look.slash})`; } else { t.textContent = '平局'; t.style.color = ''; }
  $id('endSub').textContent = `回放结束，比分 ${M.wins[0]} : ${M.wins[1]}`;
  $id('endRank').textContent = '';
  $id('againBtn').style.display = 'none';
  $id('rpWatch').style.display = ''; $id('rpWatch').textContent = '再看一遍';
  RP.last = REPLAY.m;
  setTimeout(() => showScreen('end'), 300);
}
$id('rpWatch').addEventListener('click', () => { if (RP.last) startReplay(RP.last); });
$id('rpPause').addEventListener('click', () => { REPLAY.paused = !REPLAY.paused; $id('rpPause').textContent = REPLAY.paused ? '继续' : '暂停'; rpInfo(); });
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
  if (!paused) {
    if (slowmo > 0) slowmo -= real;
    for (const f of [A, B]) if (f.state === 'special' && f.sp === 'charge' && f.t < 0.06 && cine.t < 0) { cine.t = 0; cine.owner = f; if (f.idx === localIdx()) MSTAT.ults++; if (AC && MUSIC.gain) { drum(AC.currentTime, 'taiko', 0.8); flute(noteF(12), AC.currentTime + 0.05, 1.1, 0.1); } }
    if (cine.t >= 0) { cine.t += real; if (cine.t > CINE_LEN) { cine.t = -1; cine.owner = null; } }
    updateFireflies(real); updateAim();
    if (TUT && M.mode === 'train' && !paused) tutTick(real);
    for (const f of [A, B]) { if (f.vox) f.vox = damp(f.vox, 0, 14, real); if (f.voy) f.voy = damp(f.voy, 0, 14, real); }
    if (ROLL.on && M.mode === 'net') rollTick(real);
    else if (REPLAY.on) replayTick(real);
    else {
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
        const rTxt = M.mode === 'tag3' ? `第${CN[M.round] || M.round}局 · 开战！` : (M.mode === 'mayhem' ? '通天神决 · 开战！' : (M.mode === 'watch2v2' ? '天道 2v2 · 演武开战！' : M.mode === 'watch2v2' && M.round === 1 ? '2v2 组队 · 开战！' : `第${CN[M.round] || M.round}回合`));
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
}
function updateCamera(dt) {
  if (FOREST.on) {   // 闯关打妖物：镜头只跟着你，妖物离得近才一起框进来
    const near = FOREST.mons.filter(m => Math.abs(m.x - A.x) < 650);
    const xs = [A.x, ...near.map(m => m.x)], lo = Math.min(...xs), hi = Math.max(...xs);
    const fx = clamp((lo + hi) / 2, A.x - 260, A.x + 260);
    cam.x = damp(cam.x, fx, 6, dt); cam.zoom = damp(cam.zoom, clamp(1.15 - (hi - lo) / 1400, 0.72, 1.1), 3, dt);
    cam.y = damp(cam.y, Math.min(0, A.y * 0.4), 6, dt);
    return;
  }
  const tracked = is2v2() ? [A, B, C, D].filter(f => !f.hidden && f.hp > 0) : [A, B];
  const pool = tracked.length >= 2 ? tracked : [A, B];
  const minX = Math.min(...pool.map(f => f.x)), maxX = Math.max(...pool.map(f => f.x));
  const minY = Math.min(...pool.map(f => f.y));
  const mid = (minX + maxX) / 2, d = maxX - minX, base = H / 560;
  // 2v2：四名侠客同台，镜头退一档，把 2600 宽的奇阵擂台框得舒服些
  const padW = is2v2() ? 680 : 340;
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

