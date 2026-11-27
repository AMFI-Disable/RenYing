// ======================= 页面、模式与境界控制 =======================
// 本文件：showScreen（切换页面的唯一入口）、选模式、电脑境界（难度）选择条、习武大厅和任务页的分页按钮。
// ======================= 界面按钮 =======================
let pickMode = 'net', pickLevel = 'normal';   // 可选境界：入门 寻常 劲敌 绝顶 天道（宿敌只留给万仞剑阁内部用）
// ======================= 页面生命周期与共享组件管理 (Page Lifecycle Manager) =======================
// 所有 26 个页面（.scr）的统一注册表：显式声明顶栏可见性、页面分组、进入/离开钩子，确保页面切换时自动清理浮层、弹窗与临时状态。
const SCREEN_IDS = [
  'menu', 'pause', 'end', 'replays', 'bp', 'mapBriefing', 'buffDraft',
  'acc', 'lb', 'single', 'netp', 'help', 'codex', 'settings', 'community',
  'welfare', 'armory', 'tasks', 'tutask', 'tutdone', 'forestEnd',
  'towerModal', 'tournament', 'langPrompt', 'gboss', 'sagaTalk'
];

function clearAllHumanInputs() {
  if (typeof human !== 'undefined' && Array.isArray(human)) {
    for (const h of human) {
      if (h && typeof h.clear === 'function') h.clear();
    }
  }
  if (typeof TAB_SCOREBOARD !== 'undefined') TAB_SCOREBOARD = false;
}

function isInMatchOverlayScreen(id) {
  if (!id || M.mode === 'demo') return false;
  if ((id === 'settings' || id === 'help') && typeof settingsBack !== 'undefined' && settingsBack === 'pause') return true;
  if (id === 'replays' && typeof replaysFrom !== 'undefined' && replaysFrom === 'end') return true;
  return false;
}

function cleanupTransientOverlays(targetId) {
  // 1. 关闭跨页可能残留的弹窗与浮层（仅保留目标页自身的合法元素）
  if (typeof closeAllUiModals === 'function') {
    closeAllUiModals();
  } else {
    for (const mid of ['modal2v2', 'modalRouge', 'modalWorld', 'rkInfo', 'rkReveal']) {
      const el = $id(mid);
      if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
    }
  }
  const hudModal = $id('hudCustomModal');
  if (hudModal && hudModal.style) hudModal.style.display = 'none';
  const tpModal = $id('worldTeleport');
  if (tpModal && !tpModal.classList.contains('hidden')) {
    if (typeof closeTeleportModal === 'function') closeTeleportModal();
    else tpModal.classList.add('hidden');
  }
  const kbHelpEl = $id('kbHelp');
  if (kbHelpEl && !kbHelpEl.hidden) kbHelpEl.hidden = true;
  if (targetId !== 'menu' && typeof heroPickShow === 'function') {
    try { heroPickShow(false); } catch (e) {}
  }
  if (targetId !== 'single') {
    const infoCard = $id('xiwuInfoCard');
    if (infoCard) infoCard.hidden = true;
  }
  if (targetId !== 'bp') {
    try { if (typeof showPop === 'function') showPop(null); } catch (e) {}
  }
  if (targetId !== 'armory') {
    const arM = $id('arModal'), arI = $id('arIns');
    if (arM && !arM.hidden && !(typeof REEL !== 'undefined' && REEL && REEL.on)) arM.hidden = true;
    if (arI && !arI.hidden) arI.hidden = true;
  }
  // 2. 当切到任意非对局页面（targetId != null）时，立即收起对局内专属工具栏与 HUD，防止穿透到菜单页
  if (targetId) {
    if (typeof teamCmdClose === 'function' && typeof teamCmdOpen === 'function' && teamCmdOpen()) teamCmdClose();
    if (typeof dummyBarShow === 'function' && typeof dummyBarOn === 'function' && dummyBarOn()) dummyBarShow(false);
    for (const hid of ['dummyBarBtn', 'trainLab', 'trainInspect', 'trialHud', 'specHud']) {
      const el = $id(hid);
      if (el) el.classList.add('hidden');
    }
    if (targetId !== 'pause') {
      const cap = $id('sfxCaption');
      if (cap) cap.classList.add('hidden');
    }
  }
}

const SCREEN_LIFECYCLE = {
  menu: {
    onEnter(prev) {
      menuLock = false;
      const el = $id('menu');
      if (el) {
        delete el.dataset.phase;
        el.classList.remove('hl-single', 'hl-netp');
      }
      document.body.classList.remove('menu-handoff');
      for (const b of document.querySelectorAll('#menu .mcard.pressed')) b.classList.remove('pressed');
      menuCam.tx = 0; menuCam.tz = 1;
      if (typeof renderHome === 'function') renderHome();
      if (typeof setMenuHero === 'function' && typeof menuHeroPick === 'function') setMenuHero(menuHeroPick());
      const play = !menuEntered || prev === null;
      if (el) {
        if (play && typeof prefersReduced === 'function' && !prefersReduced()) {
          delete el.dataset.enter;
          if (!menuEntered) el.dataset.enter = 'run';
          else requestAnimationFrame(() => requestAnimationFrame(() => { if (el.classList.contains('on')) el.dataset.enter = 'run'; }));
        } else delete el.dataset.enter;
      }
      menuEntered = true;
    },
    onLeave() {
      if (typeof heroPickShow === 'function') heroPickShow(false);
    }
  },
  single: {
    onEnter() {
      if ($id('modal2v2') && $id('modal2v2').classList.contains('hidden')) levelBarTo(null);
      if (typeof singleSec === 'function') singleSec(currentSingleTab || 'cpu');
    },
    onLeave() {
      const infoCard = $id('xiwuInfoCard');
      if (infoCard) infoCard.hidden = true;
    }
  },
  netp: {
    onEnter() { if (typeof renderLobby === 'function') renderLobby(); }
  },
  codex: {
    onEnter() {
      if ($id('cxTabs') && !$id('cxTabs').children.length && typeof openCodex === 'function') openCodex();
    }
  },
  settings: {
    onEnter() {
      const setRp = $id('setReplays');
      if (setRp) setRp.hidden = settingsBack !== 'menu';
    },
    onLeave() {
      if (typeof cancelKeyRebind === 'function') cancelKeyRebind();
    }
  },
  acc: {
    onEnter() { if (typeof renderAccPage === 'function') renderAccPage(); }
  },
  bp: {
    onLeave() {
      if (typeof bpFinishTimer !== 'undefined' && bpFinishTimer) { clearTimeout(bpFinishTimer); bpFinishTimer = null; }
      BP = null; watch2v2Bp = null;
    }
  },
  tournament: {
    onLeave(next) {
      if (next !== null && typeof tourCancelAuto === 'function') tourCancelAuto();
    }
  },
  pause: {
    onEnter() {
      clearAllHumanInputs();
    }
  }
};

function showScreen(id) {
  if (!menuTransitionCompleting && currentScreen === 'menu' && id !== 'menu' && document.body.classList.contains('menu-handoff')) {
    const mEl = $id('menu');
    if (mEl) delete mEl.dataset.phase;
    document.body.classList.remove('menu-handoff');
    menuLock = false;
  }
  menuTransition++;
  const prev = currentScreen;
  if (prev && prev !== id && SCREEN_LIFECYCLE[prev] && SCREEN_LIFECYCLE[prev].onLeave) {
    try { SCREEN_LIFECYCLE[prev].onLeave(id); } catch (e) {}
  }
  currentScreen = id;
  for (const s of SCREEN_IDS) {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('on', s === id);
  }
  if (id && $id(id)) $id(id).classList.add('scr-seen');   // 打开过的面板才排版，见 style.css 的 .scr-seen
  if (id !== 'settings' && typeof cancelKeyRebind === 'function') cancelKeyRebind();
  cleanupTransientOverlays(id);

  const inMatchOverlay = isInMatchOverlayScreen(id);
  const nav = !!(id && typeof NAV_SCREENS !== 'undefined' && NAV_SCREENS.includes(id) && !inMatchOverlay);
  const topNavEl = $id('topNav');
  if (topNavEl) topNavEl.classList.toggle('hidden', !nav);
  document.body.classList.toggle('has-nav', nav);
  if (document.documentElement) document.documentElement.classList.toggle('boot-en', false);
  // 顶栏已展示完整账号名片与墨锭，避免 #accBar 与 #topNav 在右上角重叠
  const accBarEl = $id('accBar');
  if (accBarEl) accBarEl.classList.toggle('hidden', nav || !MENU_SCREENS.includes(id) || inMatchOverlay);
  if (nav) {
    for (const b of document.querySelectorAll('#topNav .tn-tabs [data-nav]')) b.classList.toggle('sel', b.dataset.nav === id);
    if (typeof renderTopNav === 'function') renderTopNav();
  }

  if (id && SCREEN_LIFECYCLE[id] && SCREEN_LIFECYCLE[id].onEnter) {
    try { SCREEN_LIFECYCLE[id].onEnter(prev); } catch (e) {}
  }
  if (typeof bastionSyncHUD === 'function') {
    try { bastionSyncHUD(); } catch (e) {}
  }
  if (!id) {
    if (typeof refocusGame === 'function') refocusGame();
  } else {
    const ae = document.activeElement;
    if (ae && typeof ae.closest === 'function' && !ae.closest('#' + id)) {
      try { ae.blur(); } catch (e) {}
    }
  }
}
function selectMode(mode) {
  pickMode = mode;
  if (mode === 'net') { menuCam.tx = MENU_SPOT.netp; menuCam.tz = 1.9; showScreen('netp'); }
}
// ---------- 电脑境界：对电脑的各模式共用一条 ----------
// 论剑、3v3 车轮战、2v2、天机乱斗、通天神决、山河异境都用 pickLevel，选了记在 localStorage。
// 守关、列传、问剑密卷、开放世界、全服肉鸽有自己的难度曲线，不看它。
// 栏只有一条（#levels）：平时在单人页顶上，2v2 弹窗开着时挪进弹窗（levelBarTo）
const AI_LEVEL_KEY = 'renying-ai-level', AI_LEVEL_IDS = ['easy', 'normal', 'hard', 'impossible', 'god'];
const AI_LEVEL_MODES = ['cpu', 'tag3', 'chaos', 'mayhem', 'maps', '2v2', 'bastion'];
function setPickLevel(lv, save = true) {
  if (!AI_LEVEL_IDS.includes(lv)) return;
  pickLevel = lv;
  if (save) try { localStorage.setItem(AI_LEVEL_KEY, lv); } catch (e) {}
  for (const x of document.querySelectorAll('#levels button[data-lv]')) { const on = x.dataset.lv === lv; x.classList.toggle('sel', on); x.setAttribute('aria-pressed', on); }
  updateAIBrief();
  if (typeof updateXiwuSummary === 'function') updateXiwuSummary();
}
// 打开网页时读回来。以前各模式的境界各记各的、关掉网页就忘了；第一次用新版时，从最近一场对电脑的录像里取当时的境界
function loadPickLevel() {
  let lv = null;
  try { lv = localStorage.getItem(AI_LEVEL_KEY); } catch (e) {}
  if (AI_LEVEL_IDS.includes(lv)) return setPickLevel(lv, false);
  let t = -1; lv = null;
  for (const r of rpList()) {
    const m = r && (r.meta || r);
    if (m && AI_LEVEL_MODES.includes(m.mode) && AI_LEVEL_IDS.includes(m.level) && (+m.t || 0) > t) { t = +m.t || 0; lv = m.level; }
  }
  setPickLevel(lv || 'normal', !!lv);
}
// 以前每个模式各有一个境界变量，现在都是 pickLevel 的别名：老代码和测试照样能读能写
for (const k of ['tag3Level', 'chaosLevel', 'mayhemLevel', 'mapsLevel', 'm2Level']) Object.defineProperty(globalThis, k, { get: () => pickLevel, set: v => setPickLevel(v), configurable: true });
// 把那一条栏放进 host（null 放回单人页顶上）
function levelBarTo(host) {
  const bar = $id('levels'), home = $id('aiLvBar'); if (!bar || !home) return;
  const to = host || home;
  if (bar.parentNode !== to) to.appendChild(bar);
}
const levelsEl = document.getElementById('levels');
if (levelsEl) {
  levelsEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.lv) return;
    setPickLevel(b.dataset.lv);
    SFX.slice();
  });
}
loadPickLevel();
const xiwuCatTabsEl = document.getElementById('xiwuCatTabs');
if (xiwuCatTabsEl) {
  xiwuCatTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-cat]');
    if (!b) return;
    SFX.slice();
    const cat = b.dataset.cat;
    if (cat === 'combat') {
      const isCombat = ['cpu', 'tag3', 'watch2v2', 'cuju', 'koth', 'party', 'tournament', 'chaos', 'mayhem'].includes(currentSingleTab);
      singleSec(isCombat ? currentSingleTab : 'cpu');
    } else if (cat === 'large') {
      singleSec(XIWU_LARGE_MODES.includes(currentSingleTab) ? currentSingleTab : 'melee');
    } else if (cat === 'training') {
      singleSec('train');
    } else if (cat === 'story') {
      const isStory = ['stage', 'saga', 'tower'].includes(currentSingleTab);
      singleSec(isStory ? currentSingleTab : 'stage');
    }
  });
}

const xiwuMutatorEl = $id('mutatorPills');
if (xiwuMutatorEl) xiwuMutatorEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-mut]'); if (!b) return;
  SFX.slice();
  teamMutator = b.dataset.mut === 'mayhem' ? 'mayhem' : 'normal';
  singleSec(currentSingleTab || 'cpu');
});
const singleTabsEl = document.getElementById('singleTabs');
if (singleTabsEl) {
  singleTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    SFX.slice();
    // 不在大厅里打开面板的几格：开放世界、全服肉鸽开各自的弹窗，联机对战去对战页
    if (b.dataset.act === 'world') { openWorldModal(); return; }
    if (b.dataset.act === 'rouge') { openRougeModal(); return; }
    if (b.dataset.act === 'netp') { navTo('netp'); return; }
    if (!b.dataset.tab) return;
    singleSec(b.dataset.tab);
    if (b.dataset.tab === 'watch2v2') render2v2Inline();
    const pane = document.querySelector(`#single [data-sec~="${b.dataset.tab}"]`);   // 面板在格子下面：滚过去让人看见
    if (pane && pane.scrollIntoView) try { pane.scrollIntoView({ block: 'nearest', behavior: prefersReduced() ? 'auto' : 'smooth' }); } catch (err) {}
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

// 已移除随机对手即刻开战，所有对战统一经由点将台自主选人
