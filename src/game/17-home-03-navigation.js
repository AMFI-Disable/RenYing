// ======================= 页面导航与首页交互 =======================
// 本文件：打开 / 返回页面（openScreen / backToMenu）、首页正中的展示侠客、顶部导航、首页的任务提示。
function updateXiwuSummary() {
  const info = $id('xiwuQuickInfo'); if (!info) return;
  const active = currentSingleTab;
  const mode = active === 'tag3' ? '3v3 车轮战' : '对战电脑';
  const rule = active === 'tag3' ? teamMutator : active;
  const ruleName = rule === 'chaos' ? '天机乱斗' : rule === 'mayhem' ? '通天神决' : '常规标准';
  const pieces = [CHARS[menuHeroPick()].name, LV_NAME[pickLevel] || pickLevel, mode, ruleName];
  info.textContent = pieces.map(x => typeof cvT === 'function' ? cvT(x) : x).join(' · ');
}
// 建页面和上屏分开：menuGo 先把页面建好（趁镜头推进时做，不占上屏那一帧），镜头到位再 showScreen
function openScreen(name, reveal = true) {
  if (OFFLINE_BUILD && name === 'netp') name = 'stage';
  if (name === 'watch2v2' || name === '2v2') return open2v2Hub(null, reveal);   // 2v2 只有一个入口：组队弹窗
  if (name === 'cpu' || name === 'tag3' || name === 'tower' || name === 'chaos' || name === 'stage' || name === 'saga' || name === 'train' || name === 'mayhem' || name === 'maps') {
    singleSec(name);
    if (reveal) showScreen('single');
    return 'single';
  }
  if (name === 'single') singleSec(null);
  if (name === 'tutorial') { startTutorial(); return null; }   // 开的是教学对局，没有页面要上屏
  if (name === 'tasks') renderTasks();
  if (name === 'replays') renderReplays();
  if (name === 'netp') renderRankLine();
  if (name === 'single') renderStages();
  if (name === 'settings') { settingsBack = 'menu'; buildSettings(); }
  if (name === 'codex') openCodex();
  if (name === 'community') openCommunity();
  if (name === 'armory' && typeof window.openArmory === 'function') window.openArmory();
  if (name === 'gboss') { renderGboss(); gbLoad(); gbFlush(); }
  if (reveal) showScreen(name);
  return name;
}
function backToMenu() { menuLock = false; $id('menu').classList.remove('hl-single', 'hl-netp'); showScreen('menu'); compMaybe(); }
// ---------- 首页正中的展示角色：脚下的「换侠客」换人，选人时也先指着他 ----------
let MENU_HERO = null, menuHeroId = -1;
function menuHeroPick() {   // 记住上次展示的角色；现在用不了就换成第一个能用的
  const av = availList();
  let id = null; try { id = localStorage.getItem('renying-hero'); } catch (e) {}
  const i = CHARS.findIndex(c => c.id === id);
  return av.includes(i) ? i : (av.length ? av[0] : 0);
}
function setMenuHero(ci) {
  try { localStorage.setItem('renying-hero', CHARS[ci].id); } catch (e) {}
  const k = mySkin(CHARS[ci].id);
  if (MENU_HERO && menuHeroId === ci && MENU_HERO.skinKey === k) return;
  const f = new Fighter(0); f.setChar(ci); f.look = skinLook(ci, k); f.skinKey = k; f.reset(0); f.face = 1;
  MENU_HERO = f; menuHeroId = ci;
  const sk = k && SKINS[k];   // 穿着皮肤时样子会变很多，名字写出来免得认不出是谁
  $id('heroName').innerHTML = escapeHTML(CHARS[ci].name) + (sk ? `<small>${escapeHTML(sk.name)}</small>` : '');
}
function heroQuickFight(lv, modeOverride) {
  if (menuLock || menuHeroId < 0) return;
  initAudio(); heroPickShow(false);
  if (lv) setPickLevel(lv);
  paused = false;
  // 首页已经选好角色和难度：不进点将台，直接开打，对手随机挑一个别的侠客
  const foes = CHARS.map((c, i) => i).filter(i => i !== menuHeroId);
  const foe = foes[Math.random() * foes.length | 0];
  netDropWaiting(); chatClear(); BP = null; bpMode = 'cpu'; bpCustomOpts = null;
  const quickMode = modeOverride || (currentScreen === 'single' ? currentSingleTab : 'cpu');
  showPop(null); showScreen(null);
  MSTAT.maxcombo = 0; MSTAT.ults = 0;
  if (quickMode === 'tag3') {
    const pool = CHARS.map((c, i) => i).filter(i => i !== menuHeroId).sort(() => Math.random() - 0.5);
    startTag3Match([menuHeroId, pool[0], pool[1]], [pool[2], pool[3], pool[4]], pickLevel);
  }
  else if (quickMode === 'chaos') startChaos(menuHeroId, foe, pickLevel);
  else if (quickMode === 'mayhem') startMayhem(menuHeroId, foe, pickLevel);
  else if (mapVote) startMapsMode(menuHeroId, foe, pickLevel, false, mapVote);
  else startMatch('cpu', pickLevel, [menuHeroId, foe]);
  M.quick = true;   // 「再来一局」也不进点将台
  applySkins();
}
function heroPickShow(on) {
  const el = $id('heroPick'); if (!el) return;
  if (on) {
    const av = availList(); ensurePortraits();
    el.style.gridTemplateColumns = `repeat(${Math.max(3, Math.min(6, av.length, Math.floor((innerWidth - 40) / 70)))}, 64px)`;   // 窄屏少摆几列，别出屏
    el.innerHTML = av.map(i => `<button type="button" data-i="${i}" class="${i === menuHeroId ? 'sel' : ''}"><img src="${PORTRAITS[i] || ''}" alt=""><span style="color:rgb(${CHARS[i].look.slash})">${CHARS[i].name}</span></button>`).join('');
  }
  el.hidden = !on;
  $id('heroSwap').setAttribute('aria-expanded', on);
  if (on) { const s = el.querySelector('button.sel') || el.querySelector('button'); if (s && typeof KBN !== 'undefined' && KBN.on) s.focus(); }
}
$id('heroSwap').addEventListener('click', e => { e.stopPropagation(); heroPickShow($id('heroPick').hidden); });
let heroRematchPending = false;
$id('heroPick').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]'); if (!b) return;
  e.stopPropagation(); setMenuHero(+b.dataset.i); heroPickShow(false); SFX.block && SFX.block();
  if (heroRematchPending) { heroRematchPending = false; heroQuickFight(null, currentSingleTab); }
});
document.addEventListener('click', e => { if (!e.target.closest('#homeSub')) { heroPickShow(false); heroRematchPending = false; } });
// 回放从设置里进：返回时回到设置
let replaysFrom = 'menu';
$id('setReplays').addEventListener('click', () => { replaysFrom = 'settings'; openScreen('replays'); });
$id('rpBack').addEventListener('click', () => {
  if (replaysFrom === 'settings') { replaysFrom = 'menu'; openScreen('settings'); }
  else if (replaysFrom === 'end') { replaysFrom = 'menu'; showScreen('end'); }
  else backToMenu();
});
$id('endHistoryBtn').addEventListener('click', () => { replaysFrom = 'end'; openScreen('replays'); });
$id('endChangeHeroBtn').addEventListener('click', () => {
  if (M.mode === 'tag3' && !M.watchAi) {
    tag3Repick();
    return;
  }
  if (['cpu', 'tag3', 'chaos', 'mayhem', 'maps'].includes(M.mode)) {
    currentSingleTab = M.mode;
    if (['normal', 'easy', 'hard', 'impossible', 'god'].includes(M.level)) setPickLevel(M.level);
    if (['normal', 'chaos', 'mayhem'].includes(M.teamMutator)) teamMutator = M.teamMutator;
    if (M.mode === 'maps' && MAPS[M.map]) setMapVote(M.map);
  }
  backToMenu();
  heroRematchPending = true;
  heroPickShow(true);
});
// ---------- 顶部导航 ----------
const NAV_SCREENS = ['menu', 'single', 'netp', 'codex', 'armory', 'tasks', 'community', 'replays', 'lb', 'acc', 'settings', 'help', 'welfare', 'gboss'];
function navTo(name) {
  initAudio();
  if (name === 'menu') { backToMenu(); return; }
  if (name === 'acc') { openAcc(); return; }
  if (name === 'qfx') { openQfx(); return; }
  if ($id('menu').classList.contains('on')) { menuGo(name); return; }   // 和卡片走同一条时间线，目的地一样感觉就一样
  if (MENU_SPOT[name] !== undefined) { menuCam.tx = MENU_SPOT[name]; menuCam.tz = 1.35; }
  openScreen(name);
}
for (const b of document.querySelectorAll('#topNav [data-nav]')) b.addEventListener('click', () => { if (b.dataset.nav === 'settings') secretSettingsClick(); SFX.slice && SFX.slice(); navTo(b.dataset.nav); });
$id('helpTut').addEventListener('click', () => startTutorial(true));   // 帮助里的是完整教学（十一步）
function renderTopNav() {
  const nav = $id('topNav');
  if (!nav) return;
  const name = curName();
  $id('tnInkN').textContent = (PROF.ink || 0).toLocaleString();
  $id('tnName').textContent = name || '未登录';
  if (name) {
    const s = rkState();
    $id('tnRank').textContent = rkPlaced(s) ? `${rkTier(s.pts).label} · ${rkTier(s.pts).name}` : `定级赛 ${s.placed}/${RK.PLACE}`;
    $id('tnMedal').innerHTML = rkMedalFor(s, 34);
  } else {
    $id('tnRank').textContent = '登录 / 注册';
    $id('tnMedal').innerHTML = rkMedalSVG(null, 34, { placed: 0 });
  }
  const st = window.CloudSave && CloudSave.getSyncState ? CloudSave.getSyncState() : { state: 'local' };
  $id('tnSync').className = 'tn-sync s-' + (name ? st.state : 'none');
  $id('tnSync').title = !name ? '' : { local: '本机存档', idle: '已连接云端', ok: '云端已同步', pending: '等待上传', syncing: '上传中', offline: '断网中，联网后补传', error: '上传失败', blocked: '云端拒绝了存档', expired: '登录已过期，请重新登录' }[st.state] || '';
}
function renderHome() {
  const sea = rkSeason();
  $id('homeSeason').textContent = sea.pre ? '季前赛' : SEASON.name;
  $id('homeSeasonTxt').textContent = sea.pre ? `第一赛季 ${fmtLeft(sea.left)} 后开启` : sea.over ? '赛季已结束' : `10.22 – 11.22 · 剩余 ${fmtLeft(sea.left)}`;
  renderHomeTasks();
  renderHomeReplays();
}
function renderHomeReplays() {
  const title = $id('homeReplayTitle'), sub = $id('homeReplaySub');
  if (!title || !sub || typeof rpList !== 'function') return;
  const list = rpList(), latest = list[0];
  title.textContent = latest ? cvT('最近一场') : cvT('查看战绩与回放');
  sub.textContent = latest ? `${rpSub(latest)} · ${list.length} ${cvT('条回放已保存')}` : cvT('最近 10 场保存在本机');
}
$id('homeReplays').addEventListener('click', () => navTo('replays'));
// 右边「今日任务」：做完几个、有几个能领（段位在顶栏账号按钮上，不再单独一张卡）
function renderHomeTasks() {
  const el = $id('homeTasks'); if (!el) return;
  if (PROF.guest || !curName()) { $id('homeTasksT').textContent = '登录后领每日任务'; $id('homeTasksS').textContent = '打对战、连击、赢一场都有墨锭'; return; }
  ensureClientTasks();
  const d = PROF.daily || [], done = d.filter(t => t.prog >= t.target).length, ready = d.filter(t => t.prog >= t.target && !t.claimed);
  $id('homeTasksT').textContent = `今日 ${done}/${d.length}` + (ready.length ? ` · 可领 ${ready.reduce((n, t) => n + t.reward, 0)} 墨锭` : '');
  $id('homeTasksS').textContent = ready.length ? '点开任务页领取' : done >= d.length ? '今天的都做完了' : '点开任务页看看';
}
$id('homeTasks').addEventListener('click', () => navTo('tasks'));
for (const b of document.querySelectorAll('#menu [data-go]')) {
  b.addEventListener('click', () => {
    if (menuLock) return;                                  // 连点只算一次
    if (b.dataset.go === 'qfx') { navTo('qfx'); return; }  // 青锋行是另一个网页，不走镜头推进
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 900);
    menuGo(b.dataset.go);
  });
}   // 悬停不再把镜头甩到两边：场景只跟着鼠标轻轻晃（见 renderMenu 里的 MENU_M）
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', backToMenu);

