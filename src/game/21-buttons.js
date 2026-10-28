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


// ======================= 通用界面组件：空 / 出错 / 加载状态、确认框、弹窗焦点 =======================
// 空列表、连不上、正在加载：各页统一用 uiState 画，读屏软件能听到（出错用 alert，其余用 status）。
// 文字单独放一个节点，中英文切换按原句整句对得上。extra 是额外的 class，用来保留各页原来的位置写法。
function uiState(kind, text, extra = '') {
  const role = kind === 'error' ? 'alert' : 'status';
  return `<div class="ui-state ui-${kind}${extra ? ' ' + extra : ''}" role="${role}"${kind === 'loading' ? ' aria-busy="true"' : ''}><i class="ui-state-ic" aria-hidden="true"></i><span>${escapeHTML(text)}</span></div>`;
}
// 确认框：代替浏览器自带的 confirm()（那个框不跟游戏的样式，手机上还会把全屏顶掉）。
// 返回 Promise<boolean>。默认选中「取消」，Esc、点遮罩都算取消；Enter 按下当前选中的按钮。
function uiConfirm(msg, opt = {}) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'ui-confirm'; wrap.setAttribute('role', 'alertdialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'uiConfirmMsg');
    wrap.innerHTML = `<div class="ui-confirm-box"><p id="uiConfirmMsg"></p><div class="row">
      <button type="button" class="ghost" data-v="0">${escapeHTML(opt.cancel || '取消')}</button>
      <button type="button" class="go${opt.danger ? ' danger' : ''}" data-v="1">${escapeHTML(opt.ok || '确定')}</button></div></div>`;
    wrap.querySelector('p').textContent = msg;
    const done = v => {
      wrap.remove(); window.removeEventListener('keydown', key, true);
      try { if (prev && prev.isConnected) prev.focus({ preventScroll: true }); } catch (e) {}
      resolve(v);
    };
    const key = e => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); }
      else if (e.code === 'Tab') {   // 焦点只在两个按钮之间转
        e.preventDefault(); e.stopImmediatePropagation();
        const bs = [...wrap.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
        bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus();
      }
    };
    wrap.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) done(b.dataset.v === '1'); else if (e.target === wrap) done(false); });
    window.addEventListener('keydown', key, true);
    document.body.appendChild(wrap);
    wrap.querySelector('button[data-v="0"]').focus({ preventScroll: true });
  });
}
// 弹窗焦点：弹窗一出来就把焦点放进去（读屏和键盘都从弹窗里开始），关掉以后回到打开它的那个按钮
const UI_DIALOGS = ['rkInfo', 'rkReveal', 'modal2v2', 'modalRouge', 'arModal', 'arIns'];
const uiDlgOpen = el => el.isConnected && !el.hidden && !el.classList.contains('hidden');
const uiDlgPrev = new Map();
function uiDlgWatch(el) {
  if (!el || typeof el.hasAttribute !== 'function' || typeof MutationObserver !== 'function') return;   // 测试用的简化页面没有这些：直接跳过
  if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
  if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
  let was = uiDlgOpen(el);
  new MutationObserver(() => {
    const now = uiDlgOpen(el); if (now === was) return; was = now;
    if (now) {
      uiDlgPrev.set(el, document.activeElement);
      requestAnimationFrame(() => {   // 等内容画好再找按钮
        if (!uiDlgOpen(el) || el.contains(document.activeElement)) return;
        const t = el.querySelector('[data-kb-default]') || el.querySelector('button:not([disabled]), [href], input, select, textarea') || el;
        try { t.focus({ preventScroll: true }); } catch (e) {}
      });
    } else {
      const p = uiDlgPrev.get(el); uiDlgPrev.delete(el);
      if (p && p.isConnected && (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement))) { try { p.focus({ preventScroll: true }); } catch (e) {} }
    }
  }).observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
}
for (const id of UI_DIALOGS) uiDlgWatch($id(id));
