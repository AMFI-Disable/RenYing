// ======================= 键盘 =======================
// 本文件：全局键盘事件（对局里的按键、F1 判定框、暂停……）、切到后台时要不要暂停，以及游戏启动（resize 和最后的初始化）。
// 注意：这是 src/game/ 里倒数第二个文件，启动代码要在前面所有定义都就绪以后才跑。
let TAB_SCOREBOARD = false;
window.addEventListener('keydown', e => {
  initAudio();
  const inTextInput = !!(e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT'));
  const mBoundInCombat = M.mode !== 'demo' && !paused && !document.querySelector('.scr.on') && !!(KEYS[0] && KEYS[0].KeyM);
  if (e.code === 'KeyM' && !inTextInput && (e.altKey || e.ctrlKey || !mBoundInCombat)) { muted = !muted; return; }
  if (typeof EXT !== 'undefined' && EXT && EXT.on) return;
  if (typeof bastion2dActive === 'function' && bastion2dActive()) return;
  if (e.code === 'Backquote' || e.code === 'F2') { NET_HUD = !NET_HUD; return; }
  if (e.code === 'F1') {
    if ((M.mode === 'train' && !REPLAY.on) || (M.mode === 'replay' && REPLAY.on && M.phase !== 'end')) {
      e.preventDefault(); e.stopImmediatePropagation(); debugHitbox = !debugHitbox;
      if (M.mode === 'train') trainInspectRender(); else replayInspectRender();
      say(debugHitbox ? '判定框透视：开启' : '判定框透视：关闭', 0.8, 'go');
    } else debugHitbox = false;
    return;
  }
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
    const scr = typeof e.target.closest === 'function' ? e.target.closest('.scr') : null;
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
  const onBtn = (scr) => !!(e.target && e.target.tagName === 'BUTTON' && typeof e.target.closest === 'function' && e.target.closest('#' + scr));   // 键盘选中了页上某个按钮：Enter / 空格按它，不走快捷键
  const pauseEl = document.getElementById('pause');
  const settingsEl = document.getElementById('settings');
  const helpEl = document.getElementById('help');
  const endEl = document.getElementById('end');
  if (paused && helpEl && helpEl.classList.contains('on') && e.code === 'Escape') {
    if (e.repeat) return;
    e.preventDefault(); e.stopImmediatePropagation();
    showScreen(settingsBack === 'pause' ? 'settings' : 'pause');
    return;
  }
  if (paused && settingsEl && settingsEl.classList.contains('on') && e.code === 'Escape') {
    if (e.repeat) return;
    e.preventDefault(); e.stopImmediatePropagation();
    showScreen('pause');
    return;
  }
  if (paused && pauseEl && pauseEl.classList.contains('on')) {
    if (e.code === 'KeyP' || e.code === 'Escape' || ((e.code === 'Space' || e.code === 'Enter') && !onBtn('pause'))) {
      if (e.repeat) return;
      e.preventDefault(); e.stopImmediatePropagation();
      paused = false;
      showScreen(null);
      refocusGame();
      return;
    }
  }
  if (endEl && endEl.classList.contains('on')) {
    if (e.code === 'Escape') {
      if (e.repeat) return;
      e.preventDefault(); e.stopImmediatePropagation();
      toMenu();
      return;
    }
    if ((e.code === 'Space' || e.code === 'Enter') && !onBtn('end')) {
      if (e.repeat) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (isAiVsAi() || M.watchAi || M.mode === 'watch2v2') {
        toMenu();
        return;
      }
      const againBtn = document.getElementById('againBtn');
      if (againBtn && !againBtn.disabled && againBtn.style.display !== 'none') againBtn.click();
      return;
    }
  }
  // 优先关闭最上层浮层弹窗（对手行为栏 / 世界传送 / HUD 定制 / 战队指挥面板），避免 Esc 直接穿透触发暂停
  if (e.code === 'Escape' && !e.repeat) {
    const hudModal = document.getElementById('hudCustomModal');
    if (hudModal && hudModal.style && hudModal.style.display && hudModal.style.display !== 'none') {
      e.preventDefault(); e.stopImmediatePropagation();
      hudModal.style.display = 'none';
      return;
    }
    const tpModal = document.getElementById('worldTeleport');
    if (tpModal && tpModal.parentNode && !tpModal.classList.contains('hidden')) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (typeof closeTeleportModal === 'function') closeTeleportModal();
      else tpModal.classList.add('hidden');
      return;
    }
    if (typeof dummyBarOn === 'function' && dummyBarOn()) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (typeof dummyBarShow === 'function') dummyBarShow(false);
      return;
    }
    if (typeof teamCmdOpen === 'function' && teamCmdOpen()) {
      e.preventDefault(); e.stopImmediatePropagation();
      teamCmdClose();
      return;
    }
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat && !currentScreen && !document.querySelector('.scr.on') && M.mode !== 'demo' && M.mode !== 'net' && !['end', 'perk', 'draft', 'talk'].includes(M.phase)) {   // 仅在纯对局画面响应暂停；抽秘卷、剧情对话、菜单页不弹暂停
    e.preventDefault(); e.stopImmediatePropagation();
    if (REPLAY.on) {
      const rpPause = document.getElementById('rpPause');
      if (rpPause) rpPause.click();
      return;
    }
    if (e.code === 'Escape' && typeof TRIAL_RUN !== 'undefined' && TRIAL_RUN.active && typeof trialLeaveTest === 'function') {
      trialLeaveTest();
      return;
    }
    if (typeof teamCmdClose === 'function') teamCmdClose();
    if (typeof clearAllHumanInputs === 'function') clearAllHumanInputs();
    paused = !paused;
    showScreen(paused ? 'pause' : null);
    if (!paused) refocusGame();
    return;
  }
  // 非纯对局状态（演示、暂停、菜单/弹窗/结算页打开、对手行为栏打开）不向战斗控制器泄漏按键
  if (M.mode === 'demo' || paused) return;
  if (currentScreen && currentScreen !== 'menu') return;
  if (currentScreen === 'menu' && M.phase !== 'fight') return;
  if (dummyBarOn()) return;   // 对手行为栏开着：方向键、回车给栏用（26-kbnav.js），不进对局
  if (typeof bastionOn === 'function' && bastionOn() && !M.bastionPvp && !e.repeat) {
    if (e.code === 'KeyT' && typeof bastionTpToAlly === 'function') { e.preventDefault(); bastionTpToAlly(); return; }
    if (e.code === 'KeyV' && typeof bastionFireSos === 'function') { e.preventDefault(); bastionFireSos(); return; }
    if (e.code === 'KeyG' && typeof bastionCastCompanionSkill === 'function') { e.preventDefault(); bastionCastCompanionSkill(); return; }
    if (e.code === 'KeyB' && typeof bastionToggleArmory === 'function') { e.preventDefault(); bastionToggleArmory(); return; }
  }
  if ((e.code === 'Tab' || (KEYS[0] && KEYS[0][e.code] === 'scoreboard')) && typeof teamCmdEligible === 'function' && teamCmdEligible()) {
    e.preventDefault();
    if (!e.repeat) toggleTeamCmdPanel();
    return;
  }
  if (KEYS[0] && KEYS[0][e.code] === 'scoreboard') {
    e.preventDefault();
    TAB_SCOREBOARD = true;
    return;
  }
  for (let p = 0; p < KEYS.length; p++) {
    const act = KEYS[p] ? KEYS[p][e.code] : null; if (!act || act === 'scoreboard') continue;
    e.preventDefault();
    let c = human[0];
    if (M.mode === 'pvp') {
      c = human[p] || human[0];
    } else if (isRaid()) {
      if (p === 1 && !C.hidden) { if (C.ctrl !== human[1]) C.ctrl = human[1]; c = human[1]; }
      else if (p === 2 && !D.hidden && human[2]) { if (D.ctrl !== human[2]) D.ctrl = human[2]; c = human[2]; }
      else c = human[0];
    } else if (M.mode === 'ctf' || M.mode === 'gauntlet') {
      c = human[0];
    } else if (is2v2()) {
      if (M.subMode === 'pp_cc') {
        c = p === 1 && M.mode !== 'net' ? human[1] : human[0];   // 联机共斗一台电脑只有一个人，方向键也算 1P
      } else if (M.subMode === 'pp_pp') {
        c = human[p] || human[0];
      } else {
        c = human[0];
      }
    } else {
      c = (M.mode === 'cpu' || M.mode === 'net' || M.mode === 'tag3' || M.mode === 'tower' || (typeof isLargeTeam === 'function' && isLargeTeam()) || (M.mode === 'cuju' && !M.cujuPvp) || (M.mode === 'koth' && !M.kothPvp) || (M.mode === 'party' && !M.partyPvp) || (M.mode === 'bastion' && !M.bastionPvp)) ? human[0] : (human[p] || human[0]);
    }
    if (p > 0 && c === human[0] && KEYS[0]?.[e.code]) continue;
    if (c === human[0] && typeof secretNoteHumanInput === 'function') secretNoteHumanInput(act, true);
    if (act === 'orderFocus' || act === 'orderProtect' || act === 'orderSpread' || act === 'orderAuto') {
      if (!e.repeat && typeof teamCmdEligible === 'function' && teamCmdEligible()) {
        c.press(act);
        if (typeof teamCmdOpen === 'function' && teamCmdOpen()) {
          const tMap = { orderFocus: 'spear', orderProtect: 'wall', orderSpread: 'raid', orderAuto: 'auto' };
          if (typeof teamCmdSetTactic === 'function') teamCmdSetTactic(tMap[act]);
        }
      }
      continue;
    }
    if (act === 'atk') { if (!e.repeat) { c.held.atk = true; c.atkT = clock; c.press('light'); } continue; }
    if (act === 'jump') { c.held.jump = true; if (!e.repeat) c.press('jump'); continue; }
    if (act === 'left' || act === 'right' || act === 'down') {
      c.held[act] = true;
      if (act === 'down') { if (!e.repeat) c.tapDown(); }
      else c.held.aim = act === 'left' ? -1 : 1;
      continue;
    }
    if (!e.repeat) c.press(act);
  }
});
window.addEventListener('keyup', e => {
  if ((e.code === 'Tab' || (KEYS[0] && KEYS[0][e.code] === 'scoreboard')) && typeof teamCmdEligible === 'function' && teamCmdEligible()) { return; }
  if (KEYS[0] && KEYS[0][e.code] === 'scoreboard') {
    TAB_SCOREBOARD = false;
    return;
  }
  for (let p = 0; p < KEYS.length; p++) {
    const act = KEYS[p] ? KEYS[p][e.code] : null; if (!act || act === 'scoreboard') continue;
    let c = human[0];
    if (M.mode === 'pvp') {
      c = human[p] || human[0];
    } else if (isRaid()) {
      c = (p === 1 && !C.hidden) ? human[1] : (p === 2 && !D.hidden && human[2]) ? human[2] : human[0];
    } else if (M.mode === 'ctf' || M.mode === 'gauntlet') {
      c = human[0];
    } else if (is2v2()) {
      if (M.subMode === 'pp_cc') {
        c = p === 1 && M.mode !== 'net' ? human[1] : human[0];   // 联机共斗一台电脑只有一个人，方向键也算 1P
      } else if (M.subMode === 'pp_pp') {
        c = human[p] || human[0];
      } else {
        c = human[0];
      }
    } else {
      c = (M.mode === 'cpu' || M.mode === 'net' || M.mode === 'tag3' || M.mode === 'tower' || (typeof isLargeTeam === 'function' && isLargeTeam()) || (M.mode === 'cuju' && !M.cujuPvp) || (M.mode === 'koth' && !M.kothPvp) || (M.mode === 'party' && !M.partyPvp) || (M.mode === 'bastion' && !M.bastionPvp)) ? human[0] : (human[p] || human[0]);
    }
    if (p > 0 && c === human[0] && KEYS[0]?.[e.code]) continue;
    if (c === human[0] && typeof secretNoteHumanInput === 'function') secretNoteHumanInput(act, false);
    if (act === 'left' || act === 'right' || act === 'down') {
      c.held[act] = false;
      if (c.held.left && !c.held.right) c.held.aim = -1;
      else if (c.held.right && !c.held.left) c.held.aim = 1;
    }
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
  if (SETTINGS.kbOnly === true) return;   // 纯键盘模式：鼠标不出招，1P 只用键盘的攻击键
  const c = human[0];
  if (e.button === 0) { if (typeof secretNoteHumanInput === 'function') secretNoteHumanInput('atk', true); c.held.atk = true; c.atkT = clock; c.press('light'); }
  else if (e.button === 2) {   // 右键单点：腾空闪；按住左键时点右键：远程招式
    if (typeof secretNoteHumanInput === 'function') secretNoteHumanInput('dash', true);
    if (c.held.atk) { c.press('skill2'); c.atkT = clock + 1e6; delete c.buf.light; } else c.press('dash');
  }
});
cv.addEventListener('pointerdown', () => refocusGame());
window.addEventListener('mouseup', e => { if (e.button === 0) { if (typeof secretNoteHumanInput === 'function') secretNoteHumanInput('atk', false); human[0].held.atk = false; } });
cv.addEventListener('wheel', e => {
  if (M.mode === 'demo' || paused || EXT.on || (typeof bastion2dActive === 'function' && bastion2dActive())) return;
  if (document.querySelector('.scr.on')) return;
  if ((typeof teamCmdOpen === 'function' && teamCmdOpen()) || (typeof dummyBarOn === 'function' && dummyBarOn())) return;
  if (document.querySelector('.world-teleport:not(.hidden), .hud-custom-modal[style*="flex"]')) return;
  e.preventDefault();
  const scale = e.deltaMode === 1 ? 0.05 : (e.deltaMode === 2 ? 0.16 : 0.0014);
  const delta = clamp(-e.deltaY * scale, -0.18, 0.18);
  if (Math.abs(delta) > 0.001 && typeof adjustCamZoom === 'function') adjustCamZoom(delta);
}, { passive: false });
cv.addEventListener('auxclick', e => {
  e.preventDefault();
  if (e.button === 1 && M.mode !== 'demo' && !paused && !document.querySelector('.scr.on') && typeof resetCamZoom === 'function') {
    resetCamZoom(false);
  }
});
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('beforeunload', () => { if (!loggingOut) saveTowerRun(); });   // 退出账号刷新时不能把上一个人的爬塔又存回去
function shouldPauseOnBlur() {
  return M.mode !== 'demo' && M.mode !== 'net' && !isAiVsAi() && SETTINGS.backgroundPlay !== true && M.phase !== 'end' && !paused;
}
window.addEventListener('blur', () => {
  TAB_SCOREBOARD = false;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  if (shouldPauseOnBlur()) {
    paused = true;
    showScreen('pause');
  }
});
let bgAiTimer = null;
function updateBgAiTicker() {
  if (typeof document === 'undefined') return;
  if (document.hidden && ((isAiVsAi() && !paused && M && M.phase === 'fight') || (!bgWorker && backgroundLocalActive()))) {
    if (!bgAiTimer) {
      let lastBgTime = performance.now();
      bgAiTimer = setInterval(() => {
        if (!document.hidden || !((isAiVsAi() && !paused && M && M.phase === 'fight') || (!bgWorker && backgroundLocalActive()))) {
          clearInterval(bgAiTimer);
          bgAiTimer = null;
          return;
        }
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastBgTime) / 1000);
        lastBgTime = now;
        if (!isAiVsAi()) { simTick(dt); return; }
        acc += dt * GAME_SPEED * (slowmo > 0 ? 0.28 : 1);
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
  if (e.target && e.target.closest && e.target.closest('#trainLab, #teamCmdPanel, #dummyBar, #trainInspect, #rpBar, .world-teleport, .hud-custom-modal')) return;
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
setMenuHero(menuHeroPick());
startMatch('demo');
for (let i = 0; i < 4; i++) { animFighter(A); animFighter(B); }
requestAnimationFrame(t => { last = t; requestAnimationFrame(ft => { frame(ft); requestAnimationFrame(() => { if (window.RYBoot) window.RYBoot.done(); }); }); });   // 第一帧画好再收起启动画面（src/page.html 的 #boot）
refocusGame();
window.addEventListener('load', () => refocusGame());
