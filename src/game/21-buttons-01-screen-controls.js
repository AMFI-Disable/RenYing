// ======================= 页面、模式与境界控制 =======================
// 本文件：showScreen（切换页面的唯一入口）、选模式、电脑境界（难度）选择条、习武大厅和任务页的分页按钮。
// ======================= 界面按钮 =======================
let pickMode = 'net', pickLevel = 'normal';   // 可选境界：入门 寻常 劲敌 绝顶 天道（宿敌只留给万仞剑阁内部用）
function showScreen(id) {
  if (!menuTransitionCompleting && currentScreen === 'menu' && id !== 'menu' && document.body.classList.contains('menu-handoff')) {
    delete $id('menu').dataset.phase; document.body.classList.remove('menu-handoff'); menuLock = false;
  }
  menuTransition++;
  const prev = currentScreen; currentScreen = id;
  for (const s of ['menu', 'pause', 'end', 'replays', 'bp', 'mapBriefing', 'buffDraft', 'acc', 'lb', 'single', 'netp', 'help', 'codex', 'settings', 'community', 'welfare', 'armory', 'tasks', 'tutask', 'tutdone', 'forestEnd', 'towerModal', 'langPrompt', 'gboss', 'sagaTalk']) document.getElementById(s) && document.getElementById(s).classList.toggle('on', s === id);
  if (id && $id(id)) $id(id).classList.add('scr-seen');   // 打开过的面板才排版，见 style.css 的 .scr-seen
  $id('accBar').classList.toggle('hidden', !MENU_SCREENS.includes(id));
  if (id !== 'settings') cancelKeyRebind();
  if (id !== 'bp') {
    try { showPop(null); } catch (e) {}
    if (typeof bpFinishTimer !== 'undefined' && bpFinishTimer) { clearTimeout(bpFinishTimer); bpFinishTimer = null; }
    if (prev === 'bp') { BP = null; watch2v2Bp = null; }
  }
  if (id === 'single') {
    if ($id('modal2v2') && $id('modal2v2').classList.contains('hidden')) levelBarTo(null);   // 2v2 弹窗借走的境界栏放回来
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
// ---------- 电脑境界：对电脑的各模式共用一条 ----------
// 论剑、3v3 车轮战、2v2、天机乱斗、通天神决、山河异境都用 pickLevel，选了记在 localStorage。
// 守关、列传、问剑密卷、开放世界、全服肉鸽有自己的难度曲线，不看它。
// 栏只有一条（#levels）：平时在单人页顶上，2v2 弹窗开着时挪进弹窗（levelBarTo）
const AI_LEVEL_KEY = 'renying-ai-level', AI_LEVEL_IDS = ['easy', 'normal', 'hard', 'impossible', 'god'];
const AI_LEVEL_MODES = ['cpu', 'tag3', 'chaos', 'mayhem', 'maps', '2v2'];
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
      const isCombat = ['cpu', 'tag3', 'watch2v2', 'chaos', 'mayhem'].includes(currentSingleTab);
      singleSec(isCombat ? currentSingleTab : 'cpu');
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
  teamMutator = b.dataset.mut;
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

if ($id('xiwuQuickGo')) $id('xiwuQuickGo').addEventListener('click', () => { if (menuHeroId < 0) setMenuHero(menuHeroPick()); heroQuickFight(); });
