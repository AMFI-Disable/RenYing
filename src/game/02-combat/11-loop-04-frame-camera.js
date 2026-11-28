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
  if (EXT.on || (typeof bastion2dActive === 'function' && bastion2dActive())) { last = now; requestAnimationFrame(frame); return; }   // 正在玩青锋行或天枢守境：刃影这边不画也不算
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
    const large = isLargeTeam();
    if (slowmo > 0) slowmo -= real;
    if (typeof swapFreezeTimer !== 'undefined' && swapFreezeTimer > 0) swapFreezeTimer = Math.max(0, swapFreezeTimer - real);
    for (const f of allFighters()) if (!f.hidden && f.state === 'special' && f.sp === 'charge' && f.t < 0.06) {
      if (f.idx === localIdx() && f._ultStatClock !== clock) { f._ultStatClock = clock; MSTAT.ults++; }
      if (!large && cine.t < 0) { cine.t = 0; cine.owner = f; if (AC && MUSIC.gain) { drum(AC.currentTime, 'taiko', 0.8); flute(noteF(12), AC.currentTime + 0.05, 1.1, 0.1); } }
    }
    if (large && cine.t >= 0) { cine.t = -1; cine.owner = null; }
    if (cine.t >= 0) { cine.t += real; if (cine.t > CINE_LEN) { cine.t = -1; cine.owner = null; } }
    updateFireflies(real); updateAim();
    if (TUT && M.mode === 'train' && !paused) tutTick(real);
    for (const f of allFighters()) { if (f.vox) f.vox = damp(f.vox, 0, 14, real); if (f.voy) f.voy = damp(f.voy, 0, 14, real); }
    if (document.hidden && backgroundLocalActive() && (bgWorker || bgAiTimer)) { /* background ticker owns local simulation */ }
    else if (ROLL.on && M.mode === 'net') rollTick(real);
    else if (REPLAY.on) replayTick(real);
    else if (!trainingInspectTick(real)) {
      acc += real * GAME_SPEED * (slowmo > 0 ? 0.28 : 1) * cineSpeed();
      if (acc > STEP * 5) acc = STEP * 5;
      let n = 0;
      while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
      if (n >= 5) acc = 0;
    }
    if (large) {
      if (shake > 9) shake = 9;
      if (flashA > 0.18) flashA = 0.18;
    }
    shake = damp(shake, 0, large ? 16 : 10, real);
    shakeDirX = damp(shakeDirX, 0, large ? 18 : 14, real);
    shakeDirY = damp(shakeDirY, 0, large ? 18 : 14, real);
    flashA = damp(flashA, 0, large ? 16 : 8, real);
    const anyUlt = superFreeze > 0 || allFighters().some(f => !f.hidden && f.state === 'special');
    dimA = damp(dimA, anyUlt ? (large ? 0.2 : 1) : 0, large ? 14 : 10, real);
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
        const rTxt = isRaid() ? `同袍肉鸽 · 第 ${M.raidWave || 1} 重魔劫！` : (M.mode === 'melee' ? `群雄会战 · ${M.teamSize || 5}v${M.teamSize || 5} 开战！` : M.mode === 'ctf' ? '夺旗争锋 · 开战！' : M.mode === 'gauntlet' ? '无尽试炼 · 开战！' : M.mode === 'tag3' ? `第${CN[M.round] || M.round}局 · 开战！` : (M.mode === 'mayhem' ? '通天神决 · 开战！' : M.mode === 'cuju' ? '墨球蹴鞠 · 开球' : (M.mode === 'watch2v2' ? '天道 2v2 · 演武开战！' : `第${CN[M.round] || M.round}回合`)));
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
  if (typeof specHudUpdate === 'function') specHudUpdate();
  if (typeof trialTickUpdate === 'function') trialTickUpdate();
}
function updateCamera(dt) {
  cam.userZoom = damp(cam.userZoom || 1, cam.userZoomTarget || 1, 10, dt);
  if (cam.userZoomT > 0) cam.userZoomT = Math.max(0, cam.userZoomT - dt);
  const uz = cam.userZoom || 1;
  if (WORLD.on) { worldCamera(dt); return; }
  if (camFocusPingT > 0) camFocusPingT = Math.max(0, camFocusPingT - dt);
  if (FOREST.on) {   // 闯关打妖物：镜头框住同袍小队与附近的妖物
    const allies = sideFighters(0).filter(f => !f.hidden && f.hp > 0);
    const allyXs = allies.length ? allies.map(f => f.x) : [A.x];
    const near = FOREST.mons.filter(m => Math.abs(m.x - A.x) < 750);
    const xs = [...allyXs, ...near.map(m => m.x)], lo = Math.min(...xs), hi = Math.max(...xs);
    const fx = clamp((lo + hi) / 2, A.x - 320, A.x + 320);
    cam.x = damp(cam.x, fx, 6, dt); cam.zoom = damp(cam.zoom, clamp(clamp(1.12 - (hi - lo) / 1600, 0.64, 1.05) * uz, 0.42, 1.65), 3, dt);
    cam.y = damp(cam.y, Math.min(0, A.y * 0.4), 6, dt);
    return;
  }
  // 大型团战（3v3 ~ 8v8）：以玩家自己和附近 950px 内的战友/敌人为中心取景，不把人物缩成蚂蚁
  if (isLargeTeam()) {
    const specF = (typeof SPEC_HUD !== 'undefined' && SPEC_HUD.focusIdx >= 0 && typeof spectatorHudAvail === 'function' && spectatorHudAvail()) ? fighterByIdx(SPEC_HUD.focusIdx) : null;
    const lf = (specF && !specF.hidden && specF.hp > 0) ? specF : fighterByIdx(localIdx());
    const fs = allFighters();
    let anchor = (lf && !lf.hidden && lf.hp > 0) ? lf : null;
    if (!anchor) {
      for (let i = 0; i < fs.length; i++) if (!fs[i].hidden && fs[i].hp > 0) { anchor = fs[i]; break; }
      if (!anchor) anchor = A;
    }
    let minX = anchor.x, maxX = anchor.x, minY = anchor.y;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (f.hidden || f.hp <= 0 || Math.abs(f.x - anchor.x) >= 950) continue;
      if (f.x < minX) minX = f.x;
      if (f.x > maxX) maxX = f.x;
      if (f.y < minY) minY = f.y;
    }
    const d = maxX - minX;
    let focus = camFocusPingT > 0 ? anchor.x : lerp(anchor.x, (minX + maxX) / 2, 0.35);
    const baseZoom = camFocusPingT > 0 ? 0.82 : clamp(0.84 - d / 2600, 0.54, 0.80);
    const layeredCap = battleMapOn() ? (M.teamSize === 5 ? 0.74 : 0.66) : baseZoom;
    const wantZoom = clamp(Math.min(baseZoom, layeredCap) * uz, 0.36, 1.5);
    cam.zoom = damp(cam.zoom, wantZoom, camFocusPingT > 0 ? 10 : 5, dt);
    const wantY = battleMapOn() ? (M.teamSize === 5 ? Math.min(-42, anchor.y * 0.46 - 26) : Math.min(-75, anchor.y * 0.42 - 42)) : Math.min(0, minY * 0.32);
    cam.y = damp(cam.y, wantY, 5, dt);
    cam.x = damp(cam.x, focus, camFocusPingT > 0 ? 14 : 7, dt);
    const vw = W / worldScale();
    cam.x = vw >= STAGE_W + 200 ? STAGE_W / 2 : clamp(cam.x, vw / 2 - 100, STAGE_W + 100 - vw / 2);
    return;
  }
  let minX = Infinity, maxX = -Infinity, minY = 0;
  if (cujuOn() && M.cuju && M.cuju.ball) {
    const fs = allFighters();
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (f.x < minX) minX = f.x;
      if (f.x > maxX) maxX = f.x;
      if (f.y < minY) minY = f.y;
    }
    const b = M.cuju.ball;
    if (b.x < minX) minX = b.x;
    if (b.x > maxX) maxX = b.x;
    if (b.y < minY) minY = b.y;
  } else if (isMulti()) {
    const fs = allFighters();
    let cnt = 0;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (f.hidden || f.hp <= 0) continue;
      cnt++;
      if (f.x < minX) minX = f.x;
      if (f.x > maxX) maxX = f.x;
      if (f.y < minY) minY = f.y;
    }
    if (cnt < 2) { minX = Math.min(A.x, B.x); maxX = Math.max(A.x, B.x); minY = Math.min(0, A.y, B.y); }
  } else {
    minX = Math.min(A.x, B.x); maxX = Math.max(A.x, B.x); minY = Math.min(0, A.y, B.y);
  }
  const mid = (minX + maxX) / 2, d = maxX - minX, base = H / 560;
  // 2v2 / 同袍肉鸽：多名侠客同台，镜头退一档，把 2600 宽的奇阵擂台框得舒服些
  const padW = isMulti() ? 680 : 340;
  const fitW = W / ((d + padW) * base);
  const top = -minY + 170;
  const fitH = (H * 0.74) / (Math.max(250, top) * base);
  const fit = Math.max(0.28, Math.min(fitW, fitH));
  let focus = mid, zoomMul = superFreeze > 0 ? 1.1 : 1;
  const specFocus = (typeof SPEC_HUD !== 'undefined' && SPEC_HUD.focusIdx >= 0 && typeof spectatorHudAvail === 'function' && spectatorHudAvail()) ? fighterByIdx(SPEC_HUD.focusIdx) : null;
  if (specFocus && !specFocus.hidden && specFocus.hp > 0) { focus = lerp(mid, specFocus.x, 0.72); zoomMul *= 1.12; }
  if (camPunch.t > 0) {
    camPunch.t = Math.max(0, camPunch.t - dt);
    const k = camPunch.maxT > 0 ? (camPunch.t / camPunch.maxT) : 0;
    const ease = Math.sin(k * Math.PI * 0.5);
    zoomMul *= 1 + camPunch.zoom * ease;
    focus = lerp(focus, camPunch.x, 0.65 * ease);
  }
  const lf = fighterByIdx(localIdx());
  if (lf && (lf.state === 'charge' || lf.state === 'aircharge') && M.mode !== 'demo' && !is2v2()) {
    const lv = clamp(lf.t / CHARGE_FULL, 0, 1); zoomMul *= 1 + 0.24 * lv; focus = lerp(mid, lf.x, 0.4 * lv);
  }
  if (lf && camFocusPingT > 0) focus = lerp(focus, lf.x, 0.65);
  const ce = cineEnv();
  if (ce > 0 && cine.owner) { zoomMul *= 1 + 0.4 * ce; focus = lerp(focus, cine.owner.x, 0.6 * ce); }
  const minZoom = is2v2() ? 0.4 : cujuOn() ? 0.5 : 0.6;
  // 1v1 用原本的曲线；2v2 基准更小（近身也会留出擂台与灯火），并压低上限
  const wantBase = is2v2() ? clamp(1.08 - d / 2600, minZoom, 1.0) : clamp(1.42 - d / 1000, minZoom, 1.35);
  // 2v2 再压一个上限，近身缠斗时也不回到 1.0+ 的贴脸视角（1v1 不设上限，保持原曲线）
  const maxZoom = is2v2() ? 0.70 : Infinity;
  const userZoomedIn = uz > 1.01;
  let want = clamp(Math.min(wantBase * zoomMul, fit, maxZoom) * uz, 0.32, userZoomedIn ? 1.85 : maxZoom);
  const pf = paperFX();
  if (pf) { want = lerp(want, W / ((STAGE_W + 220) * base), pf.a); focus = lerp(focus, STAGE_W / 2, pf.a); }   // 宣纸：镜头拉远，整张图一览无余
  cam.zoom = damp(cam.zoom, want, want < cam.zoom ? 12 : (ce > 0 ? 9 : 4), dt);
  if (!userZoomedIn) cam.zoom = Math.min(cam.zoom, fit, maxZoom);
  cam.y = damp(cam.y, Math.min(0, minY * 0.35), 4, dt);
  cam.x = damp(cam.x, focus, 8, dt);
  const vw = W / worldScale();
  cam.x = vw >= STAGE_W + 200 ? STAGE_W / 2 : clamp(cam.x, vw / 2 - 100, STAGE_W + 100 - vw / 2);
  if (!userZoomedIn) {
    const lo = maxX - vw / 2 + 60, hi = minX + vw / 2 - 60;
    if (lo <= hi) cam.x = clamp(cam.x, lo, hi); else cam.x = mid;
  } else if (lf && !lf.hidden && lf.hp > 0 && d > vw - 120) {
    cam.x = clamp(lerp(cam.x, lf.x, 0.35), vw / 2 - 100, STAGE_W + 100 - vw / 2);
  }
}
const worldScale = () => (H / 560) * cam.zoom;
// 墨羽大招「符阵」：整张图化作宣纸。返回放符的人和 0~1 的浓淡
function paperFX() {
  if (isLargeTeam()) return null;
  const f = allFighters().find(x => x && x.state === 'special' && x.ch.ult === 'inkdragon');
  if (!f) return null;
  return { f, a: clamp(f.t / 0.25, 0, 1) * (f.hitDone ? clamp(((f.fuT || 0.95) + 0.5 - f.t) / 0.25, 0, 1) : 1) };
}

