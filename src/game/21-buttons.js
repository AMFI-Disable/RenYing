// ======================= 界面按钮 =======================
let pickMode = 'net', pickLevel = 'normal';   // 可选境界：入门 寻常 劲敌 绝顶 天道（宿敌只留给万仞剑阁内部用）
function showScreen(id) {
  const prev = currentScreen; currentScreen = id;
  for (const s of ['menu', 'pause', 'end', 'replays', 'bp', 'acc', 'lb', 'single', 'netp', 'help', 'codex', 'settings', 'community', 'welfare', 'armory', 'tasks', 'tutask', 'tutdone', 'forestEnd', 'towerModal', 'langPrompt', 'gboss', 'sagaTalk']) document.getElementById(s) && document.getElementById(s).classList.toggle('on', s === id);
  $id('accBar').classList.toggle('hidden', !MENU_SCREENS.includes(id));
  if (id !== 'settings') cancelKeyRebind();
  if (id !== 'bp') {
    try { showPop(null); } catch (e) {}
    if (typeof bpFinishTimer !== 'undefined' && bpFinishTimer) { clearTimeout(bpFinishTimer); bpFinishTimer = null; }
    if (prev === 'bp') { BP = null; watch2v2Bp = null; }
  }
  if (id === 'single') {
    singleSec(currentSingleTab || 'cpu');
  }
  if (id === 'codex' && $id('cxTabs') && !$id('cxTabs').children.length) {
    openCodex();
  }
  if (id === 'menu') {
    menuLock = false;                                   // 不管从哪条路回家，都要解锁
    delete $id('menu').dataset.phase;
    document.body.classList.remove('menu-handoff');
    $id('menu').classList.remove('hl-single', 'hl-netp');   // 走之前留下的悬停态别带回家
    for (const b of document.querySelectorAll('#menu .mcard.pressed')) b.classList.remove('pressed');
    menuCam.tx = 0; menuCam.tz = 1;
  }
  if (id === 'netp') renderLobby();
  const nav = NAV_SCREENS.includes(id);   // 离线版也用顶栏（离线用不到的按钮由 body.offline 藏起来）
  $id('topNav').classList.toggle('hidden', !nav);
  document.body.classList.toggle('has-nav', nav);
  if (nav) {
    for (const b of document.querySelectorAll('#topNav .tn-tabs [data-nav]')) b.classList.toggle('sel', b.dataset.nav === id);
    renderTopNav();
  }
  if (id === 'menu') {
    renderHome(); setMenuHero(menuHeroPick());
    // 入场只在冷启动和从对局退回时播；设置/任务之间来回属于同一次浏览，不再重放
    const el = $id('menu'), play = !menuEntered || prev === null;
    if (play && !prefersReduced()) {
      delete el.dataset.enter;
      if (!menuEntered) el.dataset.enter = 'run';          // 首帧就播，避免先亮一下再入场
      else requestAnimationFrame(() => requestAnimationFrame(() => { if (el.classList.contains('on')) el.dataset.enter = 'run'; }));
    } else delete el.dataset.enter;
    menuEntered = true;
  }
  if (id === 'settings') $id('setReplays').hidden = settingsBack !== 'menu';
  if (id === 'acc') renderAccPage();
  if (!id) {
    refocusGame();
  } else if (document.activeElement && !document.activeElement.closest('#' + id)) {
    try { document.activeElement.blur(); } catch (e) {}
  }
}
function selectMode(mode) {
  pickMode = mode;
  if (mode === 'net') { menuCam.tx = MENU_SPOT.netp; menuCam.tz = 1.9; showScreen('netp'); }
}
const levelsEl = document.getElementById('levels');
if (levelsEl) {
  levelsEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.lv) return;
    pickLevel = b.dataset.lv;
    for (const x of document.querySelectorAll('#levels button')) x.classList.toggle('sel', x === b);
    updateAIBrief();
    SFX.slice();
  });
}
const singleCatTabsEl = document.getElementById('singleCatTabs');
if (singleCatTabsEl) {
  singleCatTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.cat) return;
    const cat = b.dataset.cat;
    // 找到该类别下的第一个模式
    const firstTabBtn = document.querySelector(`#singleTabs button[data-cat="${cat}"]`);
    if (firstTabBtn && firstTabBtn.dataset.tab) {
      singleSec(firstTabBtn.dataset.tab);
    } else {
      setSingleCat(cat);
    }
    SFX.slice();
  });
}
const singleTabsEl = document.getElementById('singleTabs');
if (singleTabsEl) {
  singleTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.tab) return;
    if (b.dataset.tab === 'watch2v2') { open2v2Modal(); SFX.slice(); return; }   // 离线版的 2v2 入口：打开组队弹窗，不换页
    singleSec(b.dataset.tab);
    SFX.slice();
  });
}
const taskTabsEl = document.getElementById('taskTabs');
if (taskTabsEl) {
  taskTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.ttab) return;
    const ttab = b.dataset.ttab;
    for (const btn of document.querySelectorAll('#taskTabs button')) btn.classList.toggle('sel', btn === b);
    if ($id('taskTabQuests')) $id('taskTabQuests').style.display = ttab === 'quests' ? '' : 'none';
    if ($id('taskTabRedeem')) $id('taskTabRedeem').style.display = ttab === 'redeem' ? '' : 'none';
    if ($id('taskTabGuide')) $id('taskTabGuide').style.display = ttab === 'guide' ? '' : 'none';
    const scr = $id('tasks');
    if (scr) scr.scrollTop = 0;
    SFX.slice();
  });
}
let trainChar = 0, dummyMode = 'stand', trainTargetMode = 'dummy';
const trainModeSegEl = $id('trainModeSeg');
if (trainModeSegEl) {
  trainModeSegEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.tmode) return;
    trainTargetMode = b.dataset.tmode;
    for (const btn of trainModeSegEl.querySelectorAll('button')) btn.classList.toggle('sel', btn === b);
    const dfWrap = $id('dummyFeatWrap');
    if (dfWrap) dfWrap.style.display = trainTargetMode === 'dummy' ? 'block' : 'none';
    SFX.slice();
  });
}
function renderDummyFeatures() {
  const el = $id('dummyFeatList');
  if (!el) return;
  el.innerHTML = Object.entries(DUMMY_FEATURES).map(([k, feat], idx) => {
    const on = !!dummyCfg[k];
    return `<button type="button" class="dummy-feat-chip${on ? ' sel' : ''}" data-feat="${k}" style="padding:6px 12px;border-radius:18px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:all .2s;background:${on ? 'rgba(233,196,106,0.22)' : 'rgba(255,255,255,0.06)'};border:1px solid ${on ? '#e9c46a' : 'rgba(255,255,255,0.18)'};color:${on ? '#f4ecd8' : 'rgba(239,232,216,0.65)'}">
      <span style="font-weight:700;color:${on ? '#e9c46a' : 'rgba(255,255,255,0.4)'}">${idx + 1}.</span>
      <span>${feat.name}</span>
      <span style="font-size:12px;opacity:0.75;margin-left:2px">(${feat.desc})</span>
    </button>`;
  }).join('');
}
const dummyFeatEl = $id('dummyFeatList');
if (dummyFeatEl) {
  dummyFeatEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.feat) return;
    const k = b.dataset.feat;
    dummyCfg[k] = !dummyCfg[k];
    if (B && B.ctrl instanceof DummyCtrl) {
      B.ctrl.cfg[k] = dummyCfg[k];
      if (k === 'fixed') {
        if (dummyCfg.fixed) {
          B.x = B.homeX = STAGE_W / 2; B.y = 0; B.vx = B.vy = 0; B.state = 'idle'; B.t = 0; B.juggle = 0; B.comboHits = 0;
        } else {
          B.homeX = undefined;
        }
      }
    }
    renderDummyFeatures();
    SFX.slice();
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
  Object.assign(TRAIN, { total: 0, hits: [], best: 0, bestDmg: 0 });
  B.dummy = true; B.maxHp = B.hp = B.lagHp = 300; B.look = { ...B.look, name: '木人桩' };
  applySkins();
  A.x = STAGE_W / 2 - 160; B.x = dummyCfg.fixed ? STAGE_W / 2 : STAGE_W / 2 + 60; B.homeX = dummyCfg.fixed ? STAGE_W / 2 : undefined;
}
// 木人试剑：木人桩直接开练；各模式的最高境界专项训练和正常开局一样先去点将台选人
function startTrainTarget(targetMode = trainTargetMode, isWatch = false) {
  if (targetMode === 'watch2v2') return isWatch ? startWatch2v2Draft() : bpStart('2v2', { subMode: 'pp_cc', level: 'god' });
  if (targetMode === 'cpu') { pickLevel = 'god'; return bpStart(isWatch ? 'cpuWatch' : 'cpu'); }
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
  }
}
const trainBtnEl = $id('trainBtn');
if (trainBtnEl) trainBtnEl.addEventListener('click', () => startTrainTarget(trainTargetMode, false));
renderDummyFeatures();

