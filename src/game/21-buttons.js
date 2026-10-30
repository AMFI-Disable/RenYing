// ======================= 界面按钮 =======================
let pickMode = 'net', pickLevel = 'normal';   // 可选境界：入门 寻常 劲敌 绝顶 天道（宿敌只留给万仞剑阁内部用）
function showScreen(id) {
  const prev = currentScreen; currentScreen = id;
  for (const s of ['menu', 'pause', 'end', 'replays', 'bp', 'acc', 'lb', 'single', 'netp', 'help', 'codex', 'settings', 'community', 'welfare', 'armory', 'tasks', 'tutask', 'tutdone', 'forestEnd', 'towerModal', 'langPrompt', 'gboss', 'sagaTalk']) document.getElementById(s) && document.getElementById(s).classList.toggle('on', s === id);
  if (id && $id(id)) $id(id).classList.add('scr-seen');   // 打开过的面板才排版，见 style.css 的 .scr-seen
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
let trainChar = 0, trainTargetMode = 'dummy';
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
// opt.title 是标题；opt.html 是调用方自己拼好（名字已转义）的正文，带墨锭图标、加粗这些，给了就不用 msg。
// opt.input 给了就多一个输入框（代替 prompt()）：{ type, placeholder, autocomplete }，返回输入的字，取消返回 null。
// opt.alert 为真就只有一个「知道了」（代替 alert()），选中它，关掉都返回 true。
function uiConfirm(msg, opt = {}) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'ui-confirm'; wrap.setAttribute('role', 'alertdialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'uiConfirmMsg');
    const io = opt.input;
    wrap.innerHTML = `<div class="ui-confirm-box">${opt.title ? `<h3>${escapeHTML(opt.title)}</h3>` : ''}<p id="uiConfirmMsg"></p>${io ? `<input class="ui-confirm-in" aria-labelledby="uiConfirmMsg" type="${io.type === 'password' ? 'password' : 'text'}" autocomplete="${escapeHTML(io.autocomplete || 'off')}" placeholder="${escapeHTML(io.placeholder || '')}">` : ''}<div class="row">
      ${opt.alert ? '' : `<button type="button" class="ghost" data-v="0">${escapeHTML(opt.cancel || '取消')}</button>`}
      <button type="button" class="go${opt.danger ? ' danger' : ''}" data-v="1">${escapeHTML(opt.ok || (opt.alert ? '知道了' : '确定'))}</button></div></div>`;
    if (opt.html) wrap.querySelector('p').innerHTML = opt.html; else wrap.querySelector('p').textContent = msg;
    const inp = wrap.querySelector('.ui-confirm-in');
    const done = v => {
      const out = opt.alert || (inp ? (v ? inp.value : null) : v);
      wrap.remove(); window.removeEventListener('keydown', key, true);
      try { if (prev && prev.isConnected) prev.focus({ preventScroll: true }); } catch (e) {}
      resolve(out);
    };
    const key = e => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); }
      else if (inp && document.activeElement === inp && (e.code === 'Enter' || e.code === 'NumpadEnter') && !e.isComposing) { e.preventDefault(); e.stopImmediatePropagation(); done(true); }
      else if (e.code === 'Tab') {   // 焦点只在弹窗里转（输入框和按钮）
        e.preventDefault(); e.stopImmediatePropagation();
        const bs = [...wrap.querySelectorAll('input, button')], i = bs.indexOf(document.activeElement);
        bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus();
      }
    };
    wrap.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) done(b.dataset.v === '1'); else if (e.target === wrap) done(false); });
    window.addEventListener('keydown', key, true);
    document.body.appendChild(wrap);
    (inp || wrap.querySelector('button[data-v="0"]') || wrap.querySelector('button[data-v="1"]')).focus({ preventScroll: true });
  });
}
// 弹窗焦点：弹窗一出来就把焦点放进去（读屏和键盘都从弹窗里开始），关掉以后回到打开它的那个按钮
const UI_DIALOGS = ['rkInfo', 'rkReveal', 'modal2v2', 'modalRouge', 'modalWorld', 'arModal', 'arIns'];
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
