// ======================= 键盘 =======================
window.addEventListener('keydown', e => {
  initAudio();
  if (e.code === 'KeyM') { muted = !muted; return; }
  if (e.code === 'Backquote' || e.code === 'F2') { NET_HUD = !NET_HUD; return; }
  if (e.code === 'F1') { debugHitbox = !debugHitbox; say(debugHitbox ? '判定框透视：开启' : '判定框透视：关闭', 0.8, 'go'); return; }
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
    const scr = e.target.closest('.scr');
    if ((scr && !scr.classList.contains('on')) || e.target.offsetParent === null) {
      try { e.target.blur(); } catch (err) {}
      refocusGame();
    } else {
      return;
    }
  }
  if (e.target && e.target.tagName === 'BUTTON' && M.mode !== 'demo' && !paused && !document.querySelector('.scr.on')) {
    try { e.target.blur(); } catch (err) {}
    refocusGame();
  }
  if (paused && document.getElementById('pause').classList.contains('on')) {
    if (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      paused = false;
      showScreen(null);
      refocusGame();
      return;
    }
  }
  if (document.getElementById('end') && document.getElementById('end').classList.contains('on')) {
    if (e.code === 'Escape') {
      e.preventDefault();
      toMenu();
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (isAiVsAi() || M.watchAi || M.mode === 'watch2v2') {
        toMenu();
        return;
      }
      const againBtn = document.getElementById('againBtn');
      if (againBtn && !againBtn.disabled && againBtn.style.display !== 'none') againBtn.click();
      return;
    }
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && M.mode !== 'demo' && M.mode !== 'net' && M.phase !== 'end') {
    paused = !paused; showScreen(paused ? 'pause' : null); if (!paused) refocusGame(); return;
  }
  if (M.mode === 'demo') return;
  if (M.mode === 'train' && /^Digit[1-6]$/.test(e.code) && B.ctrl instanceof DummyCtrl) {
    const featKeys = ['fixed', 'block', 'escape', 'counter', 'infGuard', 'autoHeal'];
    const idx = +e.code.slice(5) - 1;
    const feat = featKeys[idx];
    if (feat) {
      B.ctrl.cfg[feat] = !B.ctrl.cfg[feat];
      dummyCfg[feat] = B.ctrl.cfg[feat];
      if (feat === 'fixed') {
        if (B.ctrl.cfg.fixed) {
          B.x = B.homeX = STAGE_W / 2; B.y = 0; B.vx = B.vy = 0; B.state = 'idle'; B.t = 0; B.juggle = 0; B.comboHits = 0;
        } else {
          B.homeX = undefined;
        }
      }
      renderDummyFeatures();
      say(DUMMY_FEATURES[feat].name + (B.ctrl.cfg[feat] ? '：开启' : '：关闭'), 0.8, 'go');
    }
    return;
  }
  for (let p = 0; p < KEYS.length; p++) {
    const act = KEYS[p] ? KEYS[p][e.code] : null; if (!act) continue;
    e.preventDefault();
    let c = human[0];
    if (M.mode === 'pvp') {
      c = human[p] || human[0];
    } else if (M.mode === '2v2' || is2v2()) {
      if (M.subMode === 'pp_cc') {
        c = p === 1 ? human[1] : human[0];
      } else if (M.subMode === 'pp_pp') {
        c = human[p] || human[0];
      } else {
        c = human[0];
      }
    } else {
      c = (M.mode === 'cpu' || M.mode === 'net' || M.mode === 'tag3' || M.mode === 'tower') ? human[0] : (human[p] || human[0]);
    }
    if (act === 'atk') { if (!e.repeat) { c.held.atk = true; c.atkT = clock; c.press('light'); } continue; }
    if (act === 'jump') { c.held.jump = true; if (!e.repeat) c.press('jump'); continue; }
    if (act === 'left' || act === 'right' || act === 'down') { c.held[act] = true; if (act !== 'down') c.held.aim = act === 'left' ? -1 : 1; continue; }
    if (!e.repeat) c.press(act);
  }
});
window.addEventListener('keyup', e => {
  for (let p = 0; p < KEYS.length; p++) {
    const act = KEYS[p] ? KEYS[p][e.code] : null; if (!act) continue;
    let c = human[0];
    if (M.mode === 'pvp') {
      c = human[p] || human[0];
    } else if (M.mode === '2v2' || is2v2()) {
      if (M.subMode === 'pp_cc') {
        c = p === 1 ? human[1] : human[0];
      } else if (M.subMode === 'pp_pp') {
        c = human[p] || human[0];
      } else {
        c = human[0];
      }
    } else {
      c = (M.mode === 'cpu' || M.mode === 'net' || M.mode === 'tag3' || M.mode === 'tower') ? human[0] : (human[p] || human[0]);
    }
    if (act === 'left' || act === 'right' || act === 'down') c.held[act] = false;
    if (act === 'atk') c.held.atk = false;
    if (act === 'jump') c.held.jump = false;
  }
});
// 1P 鼠标：左键攻击（按住蓄力，松开释放），右键重斩
cv.addEventListener('mousedown', e => {
  refocusGame();
  initAudio();
  if (paused && M.mode !== 'demo' && M.phase !== 'end') {
    paused = false;
    showScreen(null);
    return;
  }
  if (M.mode === 'demo') return;
  e.preventDefault();
  const c = human[0];
  if (e.button === 0) { c.held.atk = true; c.atkT = clock; c.press('light'); }
  else if (e.button === 2) {   // 右键单点：腾空闪；按住左键时点右键：远程招式
    if (c.held.atk) { c.press('skill2'); c.atkT = clock + 1e6; delete c.buf.light; } else c.press('dash');
  }
});
cv.addEventListener('pointerdown', () => refocusGame());
window.addEventListener('mouseup', e => { if (e.button === 0) human[0].held.atk = false; });
cv.addEventListener('auxclick', e => e.preventDefault());
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('beforeunload', () => { saveTowerRun(); });
window.addEventListener('blur', () => {
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  if (M.mode !== 'demo' && M.mode !== 'net' && !isAiVsAi() && M.phase !== 'end' && !paused) {
    paused = true;
    showScreen('pause');
  }
});
let bgAiTimer = null;
function updateBgAiTicker() {
  if (typeof document === 'undefined') return;
  if (document.hidden && isAiVsAi() && !paused && M && M.phase === 'fight') {
    if (!bgAiTimer) {
      let lastBgTime = performance.now();
      bgAiTimer = setInterval(() => {
        if (!document.hidden || !isAiVsAi() || paused || (M && M.phase !== 'fight')) {
          clearInterval(bgAiTimer);
          bgAiTimer = null;
          return;
        }
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastBgTime) / 1000);
        lastBgTime = now;
        acc += dt * (slowmo > 0 ? 0.28 : 1);
        if (acc > STEP * 10) acc = STEP * 10;
        let n = 0;
        while (acc >= STEP && n < 10) {
          step();
          acc -= STEP;
          n++;
        }
        if (n >= 10) acc = 0;
      }, 50);
    }
  } else if (bgAiTimer) {
    clearInterval(bgAiTimer);
    bgAiTimer = null;
  }
}
document.addEventListener('visibilitychange', updateBgAiTicker);
window.addEventListener('focus', () => {
  human[0].clear(); human[1].clear();
  if (M.mode !== 'demo' && !paused && !document.querySelector('.scr.on')) {
    refocusGame();
  }
});
window.addEventListener('pointerdown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
  if (M.mode !== 'demo' && !paused && !document.querySelector('.scr.on')) {
    refocusGame();
  }
}, true);

// ======================= 启动 =======================
function resize() {
  const r = cv.getBoundingClientRect(); W = r.width || innerWidth; H = r.height || innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  // 画质：极高画质（high）采用完整原生物理像素，绝不进行像素降级或压缩
  const q = SETTINGS.quality;
  if (q === 'low') DPR = Math.min(window.devicePixelRatio || 1, 0.85);
  else if (q === 'mid') DPR = Math.min(window.devicePixelRatio || 1, 1.25);
  else DPR = Math.min(window.devicePixelRatio || 1, 2);
  DPR = Math.max(0.5, DPR);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);
resize();
startMatch('demo');
for (let i = 0; i < 4; i++) { animFighter(A); animFighter(B); }
requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
refocusGame();
window.addEventListener('load', () => refocusGame());
