// ======================= 手机和平板：触屏操作 =======================
const TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);   // 主要靠手指操作的设备（手机、平板）
const TUI = { stick: null, stickUp: false, jumpHeld: false };
function touchHeldJump() { human[0].held.jump = TUI.stickUp || TUI.jumpHeld; }
function touchUIUpdate() {
  if (!TOUCH) return;
  const inFight = ['cpu', 'pvp', 'net', 'train', 'tag3', '2v2', 'watch2v2', 'tower', 'chaos', 'mayhem', 'maps', 'cuju', 'saga', 'raid'].includes(M.mode) && !paused && !document.querySelector('.scr.on');
  document.documentElement.classList.toggle('touch-game-active', inFight);
  document.body.classList.toggle('touch-game-active', inFight);
  $id('touchUI').classList.toggle('hidden', !inFight);
  if (!inFight) return;
  const me = [A, B][localIdx()];
  document.querySelector('.tult').classList.toggle('ready', !!me && me.meter >= 100);
  $id('tPause').classList.toggle('hidden', M.mode === 'net');
  $id('tDummy').classList.toggle('hidden', !(M.mode === 'train' && !FOREST.on && !TUT));
}
if (TOUCH) {
  document.body.classList.add('touchdev');
  const preventGameplayZoom = e => {
    if (document.body.classList.contains('touch-game-active')) e.preventDefault();
  };
  // Safari may ignore viewport zoom limits; block its native gestures only during a match.
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) preventGameplayZoom(e);
  }, { capture: true, passive: false });
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    window.addEventListener(type, preventGameplayZoom, { passive: false });
  for (const b of document.querySelectorAll('#touchUI [data-a]')) {
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); initAudio(); haptic(12); try { b.setPointerCapture(e.pointerId); } catch (err) {} b.classList.add('on');
      if (secretEnabled) return;
      const c = human[0], a = b.dataset.a;
      if (a === 'atk') { c.held.atk = true; c.atkT = clock; c.press('light'); }
      else if (a === 'jump') { TUI.jumpHeld = true; touchHeldJump(); c.press('jump'); }
      else if (a === 'skill2') { if (c.held.atk) { c.atkT = clock + 1e6; delete c.buf.light; } c.press('skill2'); }
      else c.press(a);
    });
    const up = e => {
      b.classList.remove('on'); if (secretEnabled) return; const c = human[0], a = b.dataset.a;
      if (a === 'atk') c.held.atk = false;
      if (a === 'jump') { TUI.jumpHeld = false; touchHeldJump(); }
    };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  const st = $id('tStick'), kn = $id('tKnob');
  const move = e => {
    if (secretEnabled) return;
    const r = st.getBoundingClientRect(), R0 = r.width / 2;
    let dx = e.clientX - (r.left + R0), dy = e.clientY - (r.top + R0); const l = Math.hypot(dx, dy);
    if (l > R0) { dx *= R0 / l; dy *= R0 / l; }
    kn.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R0, ny = dy / R0, h = human[0].held;
    h.left = nx < -0.35; h.right = nx > 0.35; if (h.left) h.aim = -1; if (h.right) h.aim = 1;
    h.down = ny > 0.55 && Math.abs(nx) < 0.8;
    const upNow = ny < -0.6 && Math.abs(nx) < 0.8;
    if (upNow && !TUI.stickUp) human[0].press('jump');
    TUI.stickUp = upNow; touchHeldJump();
  };
  st.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); TUI.stick = e.pointerId; try { st.setPointerCapture(e.pointerId); } catch (err) {} move(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === TUI.stick) move(e); });
  const end = e => { if (e.pointerId !== TUI.stick) return; TUI.stick = null; kn.style.transform = ''; if (secretEnabled) return; const h = human[0].held; h.left = h.right = h.down = false; TUI.stickUp = false; touchHeldJump(); };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  $id('tPause').addEventListener('click', () => { if (M.mode !== 'net' && M.phase !== 'end') { paused = true; showScreen('pause'); } });
  $id('tDummy').addEventListener('click', () => dummyBarShow(true));   // 打开对手行为栏（21-buttons-02-training.js）
  document.addEventListener('touchstart', () => initAudio(), { passive: true });
}

