// ======================= 首页切换与习武大厅 =======================
// 本文件：首页各个页面之间的切换动画（menuGo）、电脑难度说明、习武大厅的分页（singleSec），以及暂时下架的模式（SHELVED_MODES）。
// 有自己顶栏（标题 + 返回）的页面不显示右上角账号栏，免得返回按钮和登录/退出叠在一起
const MENU_SCREENS = ['menu', 'single', 'netp', 'help', 'settings', 'acc', 'lb', 'welfare', 'gboss'];
// 首页动效：一次按压只走一条时间线 —— 镜头推进、首页散场、新页面入场都在这里排好
const MENU_DOLLY = 520;                 // 推进镜头的时长，和 CSS 里 .scr 的交接收尾对齐
let menuLock = false;                   // 按下之后锁住悬停和连点，回到首页才解锁
let menuEntered = false;                // 首页入场动画是否已经播过
let menuTransition = 0, menuTransitionCompleting = false;
let currentScreen = 'menu';             // showScreen 当前显示的是哪一页（null = 在对局里）
const prefersReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// 主界面按钮：悬停时镜头平移到对应场景，点击后推进镜头再打开页面
function menuGo(name) {
  if (menuLock) return;                 // 已经出发了：忽略连点和二次点击
  menuLock = true;
  const transition = ++menuTransition;
  initAudio();
  const spot = MENU_SPOT[name];
  const root = $id('menu');
  if (spot !== undefined) { menuCam.tx = spot * 1.05; menuCam.tz = 1.9; }
  root.classList.remove('hl-single', 'hl-netp');   // 出发了就收掉悬停态，别让两张卡一个亮一个暗地退场
  delete root.dataset.enter;                       // 入场还没播完就点了：直接切到退场
  root.dataset.phase = spot !== undefined ? 'out' : 'out-fast';
  document.body.classList.add('menu-handoff');
  let target = null;
  try { target = openScreen(name, false); }   // 先把页面建好，等镜头推到位再上屏
  catch (err) {                               // 建页出错也要把首页放回来，别让它停在全透明的状态
    console.error('刃影：打开页面出错', err);
    menuLock = false;
    delete root.dataset.phase;
    document.body.classList.remove('menu-handoff');
    return;
  }
  if (!target) {                        // 教程直接在场上开讲，没有要上屏的页面
    menuLock = false;
    delete root.dataset.phase;
    document.body.classList.remove('menu-handoff');
    return;
  }
  setTimeout(() => {
    if (transition !== menuTransition) return;
    delete root.dataset.phase;
    // A modal can start a draft before the home transition finishes. Never replace that newer screen.
    if (currentScreen !== 'menu') { menuLock = false; document.body.classList.remove('menu-handoff'); return; }
    menuTransitionCompleting = true;
    try { showScreen(target); } finally { menuTransitionCompleting = false; }
    const completed = menuTransition;
    setTimeout(() => { if (menuTransition === completed) document.body.classList.remove('menu-handoff'); }, 320);
  }, prefersReduced() ? 0 : (spot !== undefined ? MENU_DOLLY : 220));
}
// AI_PROFILES（每档难度的标签、介绍、关键词）从 src/data/20-levels.js 来，见 src/game/01-core.js
function updateAIBrief() {
  const lv = pickLevel || 'normal';
  const p = AI_PROFILES[lv] || AI_PROFILES.normal;
  const badgeEl = $id('aiBadge');
  if (badgeEl) {
    badgeEl.textContent = p.badge;
    badgeEl.style.borderColor = p.badgeCol;
    badgeEl.style.color = p.badgeCol;
  }
  const descEl = $id('aiDesc');
  if (descEl) descEl.textContent = p.desc;
  const traitsEl = $id('aiTraits');
  if (traitsEl) traitsEl.innerHTML = p.traits.map(t => `<span class="trait-chip">${t}</span>`).join('');
  const adaptEl = $id('adaptLine');
  if (adaptEl) {
    adaptEl.style.display = 'none';
  }
}

// 模式大厅（#single）：所有玩法分类摆放，sec 为空时打开上次那一格，否则打开指定那一格的面板
let currentSingleTab = 'cpu', teamMutator = 'normal';
const XIWU_PRESET_KEY = 'renying-xiwu-presets', XIWU_PRESET_MODES = ['cpu', 'tag3', 'chaos', 'mayhem', 'maps'];
function xiwuPresetList() {
  try {
    const p = JSON.parse(localStorage.getItem(XIWU_PRESET_KEY) || '[]');
    return Array.isArray(p) ? p.filter(x => x && typeof x.id === 'string' && XIWU_PRESET_MODES.includes(x.mode) && CHARS.some(c => c.id === x.hero) && ['easy', 'normal', 'hard', 'impossible', 'god'].includes(x.level) && ['normal', 'chaos', 'mayhem'].includes(x.mutator) && (!x.map || MAPS[x.map])).slice(0, 4) : [];
  } catch (e) { return []; }
}
function xiwuPresetRender(selected = '') {
  const select = $id('xiwuPresetSelect'), remove = $id('xiwuPresetDelete');
  if (!select || !remove) return;
  const list = xiwuPresetList();
  select.innerHTML = `<option value="">${cvT('读取或保存方案')}</option>` + list.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('');
  select.value = list.some(p => p.id === selected) ? selected : '';
  remove.disabled = !select.value;
}
function xiwuPresetSave() {
  const list = xiwuPresetList();
  if (list.length >= 4) { toast('最多保存 4 个常用方案'); return; }
  const hero = CHARS[menuHeroPick()];
  const p = { id: `p-${Date.now().toString(36)}`, name: `${cvT('方案')} ${list.length + 1}`, hero: hero.id, mode: currentSingleTab, level: pickLevel || 'normal', mutator: teamMutator || 'normal', map: mapVote || '' };
  list.push(p);
  try { localStorage.setItem(XIWU_PRESET_KEY, JSON.stringify(list)); xiwuPresetRender(p.id); toast('常用方案已保存'); }
  catch (e) { toast('本机空间不足，方案未保存'); }
}
function xiwuPresetLoad(id) {
  const p = xiwuPresetList().find(x => x.id === id); if (!p) return;
  const hero = CHARS.findIndex(c => c.id === p.hero);
  if (hero >= 0 && typeof setMenuHero === 'function') setMenuHero(hero);
  if (typeof setPickLevel === 'function') setPickLevel(p.level);
  teamMutator = p.mutator;
  if (typeof setMapVote === 'function') setMapVote(p.map || null);
  singleSec(p.mode);
  if (p.mode === 'maps' && typeof renderMaps === 'function') renderMaps();
  xiwuPresetRender(p.id);
  toast('已载入常用方案');
}
$id('xiwuPresetSave').addEventListener('click', xiwuPresetSave);
$id('xiwuPresetSelect').addEventListener('change', e => { xiwuPresetLoad(e.target.value); });
$id('xiwuPresetDelete').addEventListener('click', () => {
  const id = $id('xiwuPresetSelect').value; if (!id) return;
  const list = xiwuPresetList().filter(p => p.id !== id);
  try { localStorage.setItem(XIWU_PRESET_KEY, JSON.stringify(list)); } catch (e) {}
  xiwuPresetRender(); toast('常用方案已删除');
});
xiwuPresetRender();
// 暂时收起来的模式：只藏入口，代码和存档都不动。以后想放出来，把名字从这张表里删掉就行。
// 守关在离线版里是主要内容（离线版没有联机），所以离线版照旧留着。天机乱斗、通天神决已经是对战里的「战场异变」选项，山河异境的图在联机里投票选。
const SHELVED_MODES = OFFLINE_BUILD ? ['tower'] : ['stage', 'tower'];
const modeShelved = m => SHELVED_MODES.includes(m);
for (const m of SHELVED_MODES) {
  const b = document.querySelector(`#singleTabs button[data-tab="${m}"]`);
  if (b) { b.style.display = 'none'; b.setAttribute('aria-hidden', 'true'); b.tabIndex = -1; }
}

function singleSec(sec) {
  if (sec && modeShelved(sec)) sec = 'saga';   // 收起来的模式（从旧链接、图鉴、结算页回来）：改去侠客列传
  const active = sec || currentSingleTab || 'cpu';
  currentSingleTab = active;

  const isStory = ['stage', 'saga', 'tower'].includes(active);
  const activeCat = active === 'train' ? 'training' : isStory ? 'story' : 'combat';

  for (const b of document.querySelectorAll('#xiwuCatTabs button')) {
    const on = b.dataset.cat === activeCat;
    b.classList.toggle('sel', on);
    b.setAttribute('aria-selected', on);
  }
  for (const g of document.querySelectorAll('#singleTabs [data-cat-group]')) {
    g.style.display = g.dataset.catGroup === activeCat ? '' : 'none';
  }

  for (const b of document.querySelectorAll('#singleTabs button[data-tab]')) {
    b.classList.toggle('sel', b.dataset.tab === active);
  }
  for (const p of document.querySelectorAll('#mutatorPills button')) {
    const on = p.dataset.mut === (teamMutator || 'normal');
    p.classList.toggle('sel', on); p.setAttribute('aria-pressed', String(on));
  }
  for (const el of document.querySelectorAll('#single [data-sec]')) {
    const secs = el.dataset.sec.split(' ');
    el.style.display = secs.includes(active) ? '' : 'none';
  }
  const duel = ['cpu', 'chaos', 'mayhem', 'tag3', 'watch2v2'].includes(active);
  if ($id('aiLvHome')) $id('aiLvHome').hidden = !['cpu', 'chaos', 'mayhem', 'tag3', 'watch2v2', 'maps', 'cuju', 'koth', 'party'].includes(active);
  if ($id('xiwuQuickCard')) $id('xiwuQuickCard').hidden = !duel;
  const mutators = $id('mutatorPills');
  if (mutators && mutators.parentElement) mutators.parentElement.hidden = !duel;
  updateXiwuSummary();
  const scr = $id('single');
  if (scr && !sec) scr.scrollTop = 0;
  $id('singleT').textContent = '习武';
  const subEl = $id('singleSub');
  if (subEl) {
    const subs = {
      cpu: '选择 AI 难度与对手境界，在实战对局中锤炼招式攻防',
      tag3: '挑选三位豪杰排定出战顺序，胜者保留残血守擂，直至一方全灭！',
      watch2v2: '两人一组默契配合，可带电脑同袍或同屏对决！',
      tower: '挑选本命侠客登临万仞剑阁，突破层层守关者，顿悟三选一武林秘卷！',
      chaos: '天机莫测，乾坤逆转！每隔十五息随机降临百种异象秘法加持',
      stage: '六大篇章逐级挑战，斩妖除魔，迎战守关宗师',
      saga: '每位侠客自己的故事：五节、一个抉择、两个结局',
      train: '在训练场学习招式、自由练习木人桩，或进行专项情景训练',
      mayhem: '通天彻地神魔狂战！十倍真元气血，全技能绝技无冷却狂暴轰炸！',
      maps: '换一处战场：投票选地图，断崖、冰面都会改变侠客的打法',
      cuju: '不比气血比进球：用普攻和技能把墨球打进对方球门，先进三球获胜',
      koth: '占领灵坛先达 100% 获胜，阵亡或落崖 2.5 秒无限复活！',
      party: '五局三胜趣味百戏：传火折、断崖推手、飞球乱舞轮换上阵'
    };
    subEl.textContent = subs[active] || '挑选离线玩法，潜心修习剑术招式';
  }
  if (typeof updateMapChipsUI === 'function') updateMapChipsUI();
  if (active === 'tag3') renderTag3();
  else if (active === 'saga') renderSaga();
  else if (active === 'tower') renderTower();
  else if (active === 'chaos') renderChaos();
  else if (active === 'stage') renderStages();
  else if (active === 'train') renderDummyFeatures();
  else if (active === 'mayhem') renderMayhem();
  else if (active === 'maps') renderMaps();
  else if (active === 'cpu') updateAIBrief();
}

const XIWU_MODE_INFO = {
  cpu: { title: '对战电脑 · 玩法说明', body: '标准三局两胜（BO3）1v1 对决。先在上方选好电脑境界与战场异变，点击「进入选人」或「即刻开战」即可开打；也可观战 AI 对决或开启新手教学。' },
  tag3: { title: '3v3 车轮战 · 玩法说明', body: '双方各选三名侠客并排定先锋、中坚、大将顺序。每局胜者保留残血小幅调息迎战下一位对手，先把对方三将全数击破的一方获胜。' },
  watch2v2: { title: '2v2 组队 · 玩法说明', body: '四人同屏大场地混战（2600px 宽）。支持「你 + 电脑队友」、本地双人打两电脑、本地四人互打，以及全 AI 天道演武观战。' },
  cuju: { title: '墨球蹴鞠 · 玩法说明', body: '双方不扣气血，比谁先把墨球打进对方球门（默认先 3 球，可选 5/7 球）。普攻与技能可抽射/挑射墨球，格挡可扑救，精准格挡触发神扑！' },
  koth: { title: '灵坛争锋 · 玩法说明', body: '三层断崖高台上每 18 秒轮流激活灵坛。站入无人争抢的灵坛即可累积占领进度，先达 100% 获胜；阵亡或被打落悬崖后 2.5 秒重返战场。' },
  party: { title: '江湖百戏 · 玩法说明', body: '五局三胜趣味小游戏轮换：第一局「传火折」（击中对手把 9 秒火折传出去，归零即炸）、第二局「断崖推手」（0 伤害但 2.6 倍击退，推落悬崖即胜）、第三局「飞球乱舞」（格挡弹反飞球，砸中即出局）。' },
  train: { title: '训练场 · 玩法说明', body: '包含招式教学、木人桩自由练习（可看判定框、帧数差与回放）、以及防反/连段等专项情景训练。' },
  stage: { title: '守关挑战 · 玩法说明', body: '十三侠客专属六章三十关斩妖除魔路线。每关击败首领积累星级与墨锭，最终章迎战六技融魂魔首。' },
  saga: { title: '侠客列传 · 玩法说明', body: '每位侠客独立的五节剧情篇章，在关键节点做出抉择可解锁不同结局与专属秘闻。' },
  tower: { title: '问剑密卷 · 玩法说明', body: '无尽爬塔肉鸽试炼：每层获胜后三选一武林秘卷叠加词条，守关 AI 境界随层数递进。' },
};
let xiwuInfoKey = '';
function showXiwuModeInfo(key) {
  const card = $id('xiwuInfoCard'), t = $id('xiwuInfoTitle'), b = $id('xiwuInfoBody');
  const info = XIWU_MODE_INFO[key];
  if (!card || !t || !b || !info) return;
  if (!card.hidden && xiwuInfoKey === key) { card.hidden = true; xiwuInfoKey = ''; return; }
  xiwuInfoKey = key;
  t.textContent = info.title;
  b.textContent = info.body;
  card.hidden = false;
}
if ($id('xiwuInfoClose')) $id('xiwuInfoClose').addEventListener('click', () => { $id('xiwuInfoCard').hidden = true; xiwuInfoKey = ''; });
for (const btn of document.querySelectorAll('.mode-info-btn[data-mode-info]')) {
  const trigger = e => {
    e.stopPropagation();
    e.preventDefault();
    showXiwuModeInfo(btn.dataset.modeInfo);
  };
  btn.addEventListener('click', trigger);
  btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') trigger(e); });
}
