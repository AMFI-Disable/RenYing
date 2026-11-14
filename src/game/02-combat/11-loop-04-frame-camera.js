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
        const rTxt = isRaid() ? `同袍肉鸽 · 第 ${M.raidWave || 1} 重魔劫！` : (M.mode === 'tag3' ? `第${CN[M.round] || M.round}局 · 开战！` : (M.mode === 'mayhem' ? '通天神决 · 开战！' : M.mode === 'cuju' ? '墨球蹴鞠 · 开球' : (M.mode === 'watch2v2' ? '天道 2v2 · 演武开战！' : `第${CN[M.round] || M.round}回合`)));
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
  const pool = cujuOn() && M.cuju && M.cuju.ball ? [...allFighters(), M.cuju.ball] : (tracked.length >= 2 ? tracked : [A, B]);   // 墨球蹴鞠：镜头也框住墨球
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
  const minZoom = is2v2() ? 0.4 : cujuOn() ? 0.5 : 0.6;
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

