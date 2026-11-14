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
  cujuAimHook();
  updateProjs();
  cujuTick();   // 墨球蹴鞠：墨球的物理和进球（不在这个模式就什么都不做）
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
  const dx = (cujuOn() && M.cuju && M.cuju.ball ? M.cuju.ball.x : foe.x) - f.x;   // 墨球蹴鞠：不按方向键时面向墨球
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

