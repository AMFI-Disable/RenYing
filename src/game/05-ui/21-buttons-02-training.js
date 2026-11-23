// ======================= 木人训练与对手行为栏 =======================
// 本文件：木人桩：练哪位侠客、木人的特性开关、对手行为栏（稻草人做什么，见 src/data/14-dummy.js）、几种练习的开局。
function xiwuTrainingTab(name) {
  const tabs = document.querySelectorAll('#xiwuTrainingTabs [data-training-tab]');
  const panes = document.querySelectorAll('#single [data-training-pane]');
  for (const tab of tabs) {
    const selected = tab.dataset.trainingTab === name;
    tab.classList.toggle('sel', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const pane of panes) pane.hidden = pane.dataset.trainingPane !== name;
}
if ($id('xiwuTrainingTabs')) {
  $id('xiwuTrainingTabs').addEventListener('click', e => {
    const tab = e.target.closest('button[data-training-tab]');
    if (!tab) return;
    xiwuTrainingTab(tab.dataset.trainingTab);
    SFX.slice();
  });
  $id('xiwuTrainingTabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...$id('xiwuTrainingTabs').querySelectorAll('[data-training-tab]')];
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  });
  xiwuTrainingTab('lesson');
}
let trainChar = 0, trainTargetMode = 'dummy', trainOppMode = 'dummy', trainAiLevel = 'normal';
const TRAIN_AI_INFO = {
  easy: '入门 · 延迟反应、极少格挡、2段轻击，零血量/伤害膨胀，适合熟悉出招与连段起点。',
  normal: '寻常 · 标准立回、40%格挡、3段连招与基础追击，零血量/伤害膨胀，适合常规对练。',
  hard: '劲敌 · 主动抓后摇、高频率招架、4段连招与起解压制，零血量/伤害膨胀，考验攻防转换。',
  impossible: '绝顶 · 极速反应、精准弹反与连招最大化确反，完全依托 AIBrain 策略而非数值堆砌。',
  god: '天道 · 满级神经策略、读招诱骗、无缝空战追击与极致心理博弈（纯机制强度，1.0×标准血攻）。',
};
function renderTrainConfig() {
  const oppSeg = $id('trainOppSeg');
  if (oppSeg) {
    for (const b of oppSeg.querySelectorAll('button[data-topp]')) {
      const on = b.dataset.topp === trainOppMode;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  const lvWrap = $id('trainAiLvWrap');
  if (lvWrap) lvWrap.classList.toggle('is-dim', trainOppMode !== 'ai');
  const lvSeg = $id('trainAiLvSeg');
  if (lvSeg) {
    for (const b of lvSeg.querySelectorAll('button[data-tlv]')) {
      const on = b.dataset.tlv === trainAiLevel;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  const desc = $id('trainAiDesc');
  if (desc) desc.textContent = trainOppMode === 'ai' ? (TRAIN_AI_INFO[trainAiLevel] || TRAIN_AI_INFO.normal) : '木人桩模式：可精确控制对手站桩、格挡、弹反、连段与受压闪避，并实时查看帧数差与判定框。';
}
if ($id('trainOppSeg')) {
  $id('trainOppSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-topp]');
    if (!b) return;
    trainOppMode = b.dataset.topp === 'ai' ? 'ai' : 'dummy';
    renderTrainConfig();
    SFX.slice();
  });
}
if ($id('trainAiLvSeg')) {
  $id('trainAiLvSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-tlv]');
    if (!b) return;
    trainAiLevel = b.dataset.tlv;
    trainOppMode = 'ai';
    renderTrainConfig();
    SFX.slice();
  });
}
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
const dummyBarAvail = () => M.mode === 'train' && !!B && !FOREST.on && !TUT && !REPLAY.on && M.phase !== 'end';
function dummyBarOn() { return DB.open; }
function applyTrainOpponent() {
  if (M.mode !== 'train' || !B) return;
  if (trainOppMode === 'ai') {
    const foeIdx = (trainChar + 1) % CHARS.length;
    if (B.dummy || B.chIdx !== foeIdx) {
      B.setChar(foeIdx);
      B.dummy = false;
      B.homeX = undefined;
      B.maxHp = B.hp = B.lagHp = Math.round(((B.ch.stat && B.ch.stat.hp) || 850) * ((BAL[B.ch.id] || {}).hp || 1));
    }
    B.ctrl = new AICtrl(trainAiLevel || 'normal');
    if (typeof B.ctrl.updateTactic === 'function') B.ctrl.updateTactic(B, A);
    M.level = trainAiLevel || 'normal';
  } else {
    if (!B.dummy) {
      B.setChar(0);
      B.dummy = true;
      B.maxHp = B.hp = B.lagHp = 300;
      B.look = { ...B.look, name: '木人桩' };
    }
    B.ctrl = new DummyCtrl({ ...dummyCfg });
    B.homeX = dummyCfg.fixed ? STAGE_W / 2 : undefined;
  }
  renderTrainConfig();
  dummyBarRender();
}
function dummyBarRender() {
  const acts = $id('dummyActs'); if (!acts) return;
  const c = dummyCfg, a = DUMMY_BY[c.act] || DUMMY_BY.stand, timed = a.k === 'do';
  const oppEl = $id('dummyBarOpp');
  if (oppEl) {
    const opts = [
      { k: 'dummy', n: '木人桩' },
      { k: 'ai:easy', n: 'AI·入门' },
      { k: 'ai:normal', n: 'AI·寻常' },
      { k: 'ai:hard', n: 'AI·劲敌' },
      { k: 'ai:impossible', n: 'AI·绝顶' },
      { k: 'ai:god', n: 'AI·天道' },
    ];
    const cur = trainOppMode === 'ai' ? `ai:${trainAiLevel}` : 'dummy';
    oppEl.innerHTML = opts.map(o => `<button type="button" data-dbopp="${o.k}" class="${o.k === cur ? 'sel' : ''}" aria-pressed="${o.k === cur}">${o.n}</button>`).join('');
  }
  acts.innerHTML = DUMMY_ACTS.map(x => `<button type="button" data-act="${x.id}" class="${x.id === c.act ? 'sel' : ''}" aria-pressed="${x.id === c.act}"${trainOppMode === 'ai' ? ' disabled' : ''}><b>${x.n}</b><span>${x.d}</span></button>`).join('');
  for (const b of $id('dummyRep').querySelectorAll('button')) { const on = (b.dataset.rep === '1') === c.rep; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); b.disabled = trainOppMode === 'ai'; }
  $id('dummyGap').innerHTML = DUMMY_GAPS.map(g => `<button type="button" data-gap="${g}" class="${g === c.gap ? 'sel' : ''}" aria-pressed="${g === c.gap}"${timed && trainOppMode !== 'ai' ? '' : ' disabled'}>${g} 秒</button>`).join('');
  $id('dummyFeats').innerHTML = Object.entries(DUMMY_FEATURES).map(([k, f]) => `<button type="button" data-feat="${k}" class="${c[k] ? 'sel' : ''}" aria-pressed="${!!c[k]}"><b>${f.name}</b><span>${f.desc}</span></button>`).join('');
  $id('dummyNote').textContent = trainOppMode === 'ai' ? (TRAIN_AI_INFO[trainAiLevel] || TRAIN_AI_INFO.normal) : (a.k === 'hold' ? '这个动作会一直保持，次数和间隔不用选' : a.k === 'react' ? '这个动作看时机反应，「只做一次」就是反应一次' : '');
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
// 帧检查器只属于木人训练，频率按逻辑帧计；最高 120 Hz 即标准速度。
function trainInspectRender() {
  const rate = $id('trainHz'), value = $id('trainHzValue'), hitbox = $id('trainHitboxBtn'), pause = $id('trainPauseBtn'), advance = $id('trainStepBtn');
  if (rate && rate.value !== String(TRAIN.inspectHz)) rate.value = String(TRAIN.inspectHz);
  if (value && value.textContent !== `${TRAIN.inspectHz} Hz`) value.textContent = `${TRAIN.inspectHz} Hz`;
  if (hitbox) { hitbox.setAttribute('aria-pressed', String(debugHitbox)); const label = cvT(`F1 判定框：${debugHitbox ? '开' : '关'}`); if (hitbox.textContent !== label) hitbox.textContent = label; }
  if (pause) { pause.setAttribute('aria-pressed', String(TRAIN.inspectPaused)); const label = cvT(TRAIN.inspectPaused ? '恢复时间' : '暂停时间'); if (pause.textContent !== label) pause.textContent = label; }
  if (advance && advance.textContent !== cvT('推进 1 帧')) advance.textContent = cvT('推进 1 帧');
  if (advance) advance.disabled = !TRAIN.inspectPaused || M.mode !== 'train' || paused || DB.open || !!currentScreen;
}
function trainInspectUpdate() {
  const panel = $id('trainInspect');
  if (!panel) return;
  const active = M.mode === 'train' && !REPLAY.on && M.phase !== 'end' && !currentScreen;
  panel.classList.toggle('hidden', !active || paused || DB.open);
  trainInspectRender();
}
function trainInspectStep() {
  if (M.mode !== 'train' || !TRAIN.inspectPaused || paused || DB.open || REPLAY.on || currentScreen) return false;
  acc = 0; TRAIN.inspectAcc = 0;
  step();
  trainInspectRender();
  return true;
}
if ($id('trainInspect')) {
  $id('trainHz').addEventListener('input', e => {
    TRAIN.inspectHz = Math.max(1, Math.min(120, Math.round(+e.target.value || 120)));
    TRAIN.inspectAcc = 0;
    trainInspectRender();
  });
  $id('trainHitboxBtn').addEventListener('click', () => {
    if (M.mode !== 'train') return;
    debugHitbox = !debugHitbox;
    trainInspectRender();
  });
  $id('trainPauseBtn').addEventListener('click', () => {
    if (M.mode !== 'train') return;
    TRAIN.inspectPaused = !TRAIN.inspectPaused;
    TRAIN.inspectAcc = 0;
    acc = 0;
    trainInspectRender();
  });
  $id('trainStepBtn').addEventListener('click', trainInspectStep);
}
if ($id('dummyBar')) {
  $id('dummyBar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.id === 'dummyBarClose') { dummyBarShow(false); return; }
    if (b.dataset.dbopp) {
      if (b.dataset.dbopp === 'dummy') { trainOppMode = 'dummy'; }
      else { trainOppMode = 'ai'; trainAiLevel = b.dataset.dbopp.split(':')[1] || 'normal'; }
      applyTrainOpponent();
      SFX.slice();
      return;
    }
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
  const foeIdx = trainOppMode === 'ai' ? ((trainChar + 1) % CHARS.length) : 0;
  startMatch('train', { ...dummyCfg }, [trainChar, foeIdx]);
  Object.assign(TRAIN, { total: 0, hits: [], best: 0, bestDmg: 0, advantage: null, frameProbe: null });
  if (trainOppMode === 'ai') {
    B.dummy = false;
    B.ctrl = new AICtrl(trainAiLevel || 'normal');
    if (typeof B.ctrl.updateTactic === 'function') B.ctrl.updateTactic(B, A);
    B.maxHp = B.hp = B.lagHp = Math.round(((B.ch.stat && B.ch.stat.hp) || 850) * ((BAL[B.ch.id] || {}).hp || 1));
    M.level = trainAiLevel || 'normal';
    applySkins();
    A.x = STAGE_W / 2 - 200; B.x = STAGE_W / 2 + 200; B.homeX = undefined;
  } else {
    B.dummy = true; B.maxHp = B.hp = B.lagHp = 300; B.look = { ...B.look, name: '木人桩' };
    applySkins();
    A.x = STAGE_W / 2 - 160; B.x = dummyCfg.fixed ? STAGE_W / 2 : STAGE_W / 2 + 60; B.homeX = dummyCfg.fixed ? STAGE_W / 2 : undefined;
  }
}
// 木人试剑：木人桩直接开练；各模式的最高境界专项训练和正常开局一样先去点将台选人
function startTrainTarget(targetMode = trainTargetMode, isWatch = false) {
  if (targetMode === 'watch2v2') return isWatch ? startWatch2v2Draft() : bpStart('2v2', { subMode: 'pp_cc', level: 'god' });
  if (targetMode === 'cpu') return bpStart(isWatch ? 'cpuWatch' : 'cpu', { level: 'god' });   // 专项训练固定天道，不改玩家选好的电脑境界
  if (targetMode === 'tag3' || targetMode === 'chaos' || targetMode === 'mayhem') return bpStart(targetMode, { level: 'god', isWatch });
  bpStart('train', { targetMode: 'dummy', isWatch });
}
function startTraining(targetMode = 'dummy', isWatch = false, badgePreview = null) {
  if (targetMode !== 'dummy') return startTrainTarget(targetMode, isWatch);
  if (typeof trainChar !== 'number' || isNaN(trainChar) || trainChar < 0 || trainChar >= CHARS.length) {
    trainChar = 0;
  }
  window.BADGE_TRAINING_PREVIEW = badgePreview && COMBAT_BADGES[badgePreview.id]
    ? { id: badgePreview.id, tier: badgePreview.tier || 'silver' } : null;
  initAudio(); paused = false;
  M.watchAi = !!isWatch;
  startDummyTraining();
  if (isWatch) {
    A.ctrl = new AICtrl('god');
    say('训练场 · AI 演示连招', 1.4);
  } else if (trainOppMode === 'ai') {
    say(`训练场 · AI 实战对练 (${LV_NAME[trainAiLevel] || trainAiLevel})`, 1.5);
  } else say('木人试剑 · 开始训练', 1.4);
}
function startBadgeTrainingPreview(id, tier = 'silver') {
  if (!COMBAT_BADGES[id]) return;
  if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
  trainOppMode = 'dummy';
  const action = id === 'riposte' ? 'light' : id === 'breaker' ? 'block' : 'stand';
  Object.assign(dummyCfg, { act: action, rep: true, gap: 1, fixed: false, escape: false, infGuard: id !== 'breaker', autoHeal: true });
  renderDummyFeatures();
  singleSec('train');
  showScreen('single');
  xiwuTrainingTab('free');
  startTraining('dummy', false, { id, tier });
  say(`${cvT('徽记试招：')}${cvT(COMBAT_BADGES[id].trigger)}`, 3);
}
function openReviewTraining(heroId, focus) {
  const hero = CHARS.findIndex(c => c.id === heroId);
  if (hero >= 0) {
    trainChar = hero;
    if (typeof setMenuHero === 'function') setMenuHero(hero);
  }
  Object.assign(dummyCfg, focus === 'defense'
    ? { act: 'combo', escape: true, infGuard: true, autoHeal: true }
    : { act: 'stand', escape: false, infGuard: true, autoHeal: true });
  renderDummyFeatures();
  singleSec('train');
  showScreen('single');
  xiwuTrainingTab('scenario');
}
const trainBtnEl = $id('trainBtn');
if (trainBtnEl) trainBtnEl.addEventListener('click', () => {
  if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
  startTraining('dummy');
});
const trainPickBtnEl = $id('trainPickBtn');
if (trainPickBtnEl) trainPickBtnEl.addEventListener('click', () => bpStart('train', { targetMode: 'dummy' }));
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
  if (b.dataset.drill === 'ai-sparring') {
    trainOppMode = 'ai';
    if (typeof pickLevel === 'string' && LV_NAME[pickLevel]) trainAiLevel = pickLevel;
    if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
    renderTrainConfig();
    SFX.slice();
    startTraining('dummy');
    return;
  }
  const drills = {
    combo: { act: 'stand', fixed: false, escape: false, infGuard: true, autoHeal: true },
    block: { act: 'block', fixed: false, escape: false, infGuard: true, autoHeal: true },
    parry: { act: 'parry', fixed: false, escape: false, infGuard: true, autoHeal: true },
    'combo-escape': { act: 'combo', fixed: false, escape: true, infGuard: true, autoHeal: true },
    'anti-air': { act: 'jump', fixed: false, escape: false, infGuard: true, autoHeal: true }
  };
  const preset = drills[b.dataset.drill];
  if (!preset) return;
  trainOppMode = 'dummy';
  Object.assign(dummyCfg, preset, { rep: true, gap: 1 });
  if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
  renderTrainConfig();
  renderDummyFeatures();
  SFX.slice();
  startTraining('dummy');
});
renderTrainConfig();
renderDummyFeatures();
