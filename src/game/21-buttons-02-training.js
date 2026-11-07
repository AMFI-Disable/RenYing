// ======================= 木人训练与对手行为栏 =======================
let trainChar = 0, trainTargetMode = 'dummy';
const trainModeSegEl = $id('trainModeSeg');
if (trainModeSegEl) {
  trainModeSegEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.tmode) return;
    trainTargetMode = b.dataset.tmode;
    for (const btn of trainModeSegEl.querySelectorAll('button')) btn.classList.toggle('sel', btn === b);
    SFX.slice();
  });
}
// 开练前的特性开关（练的时候在对手行为栏里也能改）
function renderDummyFeatures() {
  const el = $id('dummyFeatList');
  if (el) el.innerHTML = Object.entries(DUMMY_FEATURES).map(([k, feat]) => `<button type="button" class="dummy-feat-chip${dummyCfg[k] ? ' sel' : ''}" data-feat="${k}" aria-pressed="${!!dummyCfg[k]}"><b>${feat.name}</b><span>${feat.desc}</span></button>`).join('');
  dummyBarRender();
}
// 改一项特性：开练前改的是下一局，练着的时候连木人一起改
function dummyFeatToggle(k) {
  dummyCfg[k] = !dummyCfg[k];
  if (B && B.ctrl instanceof DummyCtrl) {
    B.ctrl.cfg[k] = dummyCfg[k];
    if (k === 'fixed') {
      if (dummyCfg.fixed) { B.x = B.homeX = STAGE_W / 2; B.y = 0; B.vx = B.vy = 0; B.state = 'idle'; B.t = 0; B.juggle = 0; B.comboHits = 0; }
      else B.homeX = undefined;
    }
  }
  renderDummyFeatures();
  SFX.slice();
}
const dummyFeatEl = $id('dummyFeatList');
if (dummyFeatEl) dummyFeatEl.addEventListener('click', e => { const b = e.target.closest('button[data-feat]'); if (b) dummyFeatToggle(b.dataset.feat); });

// ---------- 对手行为栏：木人桩里选稻草人做什么 ----------
// 打开时游戏暂停，关上接着练。鼠标、触屏直接点；键盘 Tab 打开（Tab 被改成了出招键就用 F4），方向键挑、回车选、Esc 关。
// 选了动作马上生效：「一直重复」每隔「间隔」秒做一次，「只做一次」做完就站着。
const DB = { open: false, paused: false };
const dummyBarKey = () => (Object.values(custom1PKeys).includes('Tab') ? 'F4' : 'Tab');
const dummyBarAvail = () => M.mode === 'train' && !!B && B.ctrl instanceof DummyCtrl && !FOREST.on && !TUT && !REPLAY.on && M.phase !== 'end';
function dummyBarOn() { return DB.open; }
function dummyBarRender() {
  const acts = $id('dummyActs'); if (!acts) return;
  const c = dummyCfg, a = DUMMY_BY[c.act] || DUMMY_BY.stand, timed = a.k === 'do';
  acts.innerHTML = DUMMY_ACTS.map(x => `<button type="button" data-act="${x.id}" class="${x.id === c.act ? 'sel' : ''}" aria-pressed="${x.id === c.act}"><b>${x.n}</b><span>${x.d}</span></button>`).join('');
  for (const b of $id('dummyRep').querySelectorAll('button')) { const on = (b.dataset.rep === '1') === c.rep; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); }
  $id('dummyGap').innerHTML = DUMMY_GAPS.map(g => `<button type="button" data-gap="${g}" class="${g === c.gap ? 'sel' : ''}" aria-pressed="${g === c.gap}"${timed ? '' : ' disabled'}>${g} 秒</button>`).join('');
  $id('dummyFeats').innerHTML = Object.entries(DUMMY_FEATURES).map(([k, f]) => `<button type="button" data-feat="${k}" class="${c[k] ? 'sel' : ''}" aria-pressed="${!!c[k]}"><b>${f.name}</b><span>${f.desc}</span></button>`).join('');
  $id('dummyNote').textContent = a.k === 'hold' ? '这个动作会一直保持，次数和间隔不用选' : a.k === 'react' ? '这个动作看时机反应，「只做一次」就是反应一次' : '';
  $id('dummyBarKey').textContent = TOUCH ? '' : `${dummyBarKey()} 打开 · Esc 关闭`;
}
// 把栏里的选择交给木人（换动作、再选一次都从头开始）
function dummyApply() {
  if (B && B.ctrl instanceof DummyCtrl) B.ctrl.setCfg(dummyCfg);
  dummyBarRender();
}
function dummyBarShow(on) {
  const el = $id('dummyBar'); if (!el) return;
  if (on && !dummyBarAvail()) return;
  if (on === DB.open) return;
  DB.open = on;
  el.classList.toggle('hidden', !on);
  if (on) {
    DB.paused = !paused; paused = true;
    for (const h of human) if (h && h.clear) h.clear();   // 别把开栏前按着的方向键带进去
    dummyBarRender();
    const sel = el.querySelector('.db-acts button.sel');
    if (sel) { try { sel.focus({ preventScroll: true }); } catch (e) { sel.focus(); } }
  } else {
    if (DB.paused) paused = false;
    DB.paused = false;
    refocusGame();
  }
  SFX.slice();
}
// 每帧：开练时露出按钮，不在木人桩了就收起来
function dummyBarUpdate() {
  const ok = dummyBarAvail(), btn = $id('dummyBarBtn');
  if (btn) btn.classList.toggle('hidden', !ok || DB.open || !!document.querySelector('.scr.on'));
  if (DB.open && !ok) dummyBarShow(false);
}
if ($id('dummyBar')) {
  $id('dummyBar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.id === 'dummyBarClose') { dummyBarShow(false); return; }
    if (b.dataset.act) { dummyCfg.act = b.dataset.act; dummyApply(); SFX.slice(); }
    else if (b.dataset.rep) { dummyCfg.rep = b.dataset.rep === '1'; dummyApply(); SFX.slice(); }
    else if (b.dataset.gap) { dummyCfg.gap = +b.dataset.gap; dummyApply(); SFX.slice(); }
    else if (b.dataset.feat) dummyFeatToggle(b.dataset.feat);
    const k = b.dataset.act ? `[data-act="${b.dataset.act}"]` : b.dataset.rep ? `[data-rep="${b.dataset.rep}"]` : b.dataset.gap ? `[data-gap="${b.dataset.gap}"]` : b.dataset.feat ? `[data-feat="${b.dataset.feat}"]` : '';
    const again = k && $id('dummyBar').querySelector(k);   // 栏重画了：焦点放回刚点的那个
    if (again && document.activeElement !== again) { try { again.focus({ preventScroll: true }); } catch (err) {} }
  });
  $id('dummyBarBtn').addEventListener('click', () => dummyBarShow(true));
  // 比对局按键（25-keyboard-boot.js）先收到：Tab（或 F4）开关栏；栏开着时 Esc 关栏，别的键交给纯键盘导航（26-kbnav.js）
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (DB.open && (e.code === 'Escape' || (e.code === dummyBarKey() && dummyBarKey() !== 'Tab'))) { e.preventDefault(); e.stopImmediatePropagation(); dummyBarShow(false); return; }
    if (!DB.open && e.code === dummyBarKey() && !e.repeat && dummyBarAvail() && !paused && !document.querySelector('.scr.on')) {
      e.preventDefault(); e.stopImmediatePropagation(); if (typeof kbnOn === 'function' && e.isTrusted) kbnOn(); dummyBarShow(true);
    }
  });
}
function startDummyTraining() {
  if (typeof trainChar !== 'number' || isNaN(trainChar) || trainChar < 0 || trainChar >= CHARS.length) {
    trainChar = 0;
  }
  FOREST.on = false; B.forestProxy = false; B.hidden = false;
  initAudio(); paused = false;
  showScreen(null);
  startMatch('train', { ...dummyCfg }, [trainChar, 0]);
  Object.assign(TRAIN, { total: 0, hits: [], best: 0, bestDmg: 0, advantage: null, frameProbe: null });
  B.dummy = true; B.maxHp = B.hp = B.lagHp = 300; B.look = { ...B.look, name: '木人桩' };
  applySkins();
  A.x = STAGE_W / 2 - 160; B.x = dummyCfg.fixed ? STAGE_W / 2 : STAGE_W / 2 + 60; B.homeX = dummyCfg.fixed ? STAGE_W / 2 : undefined;
}
// 木人试剑：木人桩直接开练；各模式的最高境界专项训练和正常开局一样先去点将台选人
function startTrainTarget(targetMode = trainTargetMode, isWatch = false) {
  if (targetMode === 'watch2v2') return isWatch ? startWatch2v2Draft() : bpStart('2v2', { subMode: 'pp_cc', level: 'god' });
  if (targetMode === 'cpu') return bpStart(isWatch ? 'cpuWatch' : 'cpu', { level: 'god' });   // 专项训练固定天道，不改玩家选好的电脑境界
  if (targetMode === 'tag3' || targetMode === 'chaos' || targetMode === 'mayhem') return bpStart(targetMode, { level: 'god', isWatch });
  bpStart('train', { targetMode: 'dummy', isWatch });
}
function startTraining(targetMode = 'dummy', isWatch = false) {
  if (targetMode !== 'dummy') return startTrainTarget(targetMode, isWatch);
  if (typeof trainChar !== 'number' || isNaN(trainChar) || trainChar < 0 || trainChar >= CHARS.length) {
    trainChar = 0;
  }
  initAudio(); paused = false;
  M.watchAi = !!isWatch;
  startDummyTraining();
  if (isWatch) {
    A.ctrl = new AICtrl('god');
    say('木人试剑 · AI 演示连招', 1.4);
  } else say('木人试剑 · 开始训练', 1.4);
}
const trainBtnEl = $id('trainBtn');
if (trainBtnEl) trainBtnEl.addEventListener('click', () => {
  if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
  startTraining('dummy');
});
const xiwuFullTutBtn = $id('xiwuFullTutBtn');
if (xiwuFullTutBtn) xiwuFullTutBtn.addEventListener('click', () => { initAudio(); startTutorial(true); });
const xiwuTrainingCpuBtn = $id('xiwuTrainingCpuBtn');
if (xiwuTrainingCpuBtn) xiwuTrainingCpuBtn.addEventListener('click', () => {
  singleSec('cpu');
  showScreen('single');
});
const xiwuDrillList = document.querySelector('.xiwu-drill-list');
if (xiwuDrillList) xiwuDrillList.addEventListener('click', e => {
  const b = e.target.closest('button[data-drill]');
  if (!b) return;
  const drills = {
    combo: { act: 'stand', fixed: false, escape: false, infGuard: true, autoHeal: true },
    block: { act: 'block', fixed: false, escape: false, infGuard: true, autoHeal: true },
    parry: { act: 'parry', fixed: false, escape: false, infGuard: true, autoHeal: true },
    'combo-escape': { act: 'combo', fixed: false, escape: true, infGuard: true, autoHeal: true }
  };
  const preset = drills[b.dataset.drill];
  if (!preset) return;
  Object.assign(dummyCfg, preset, { rep: true, gap: 1 });
  if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
  renderDummyFeatures();
  SFX.slice();
  startTraining('dummy');
});
renderDummyFeatures();
