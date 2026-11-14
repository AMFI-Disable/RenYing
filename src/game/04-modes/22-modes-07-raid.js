// ======================= 同袍肉鸽 · 十三侠客斩妖列传（打小怪剧情 + 肉鸽秘卷 + 六技魔首合一多人模式） =======================
// 本文件：同袍肉鸽（几位侠客一起打小怪剧情和魔首）：抽魔首、魔首的技能、开局、联机同步、下一波、组队弹窗；
// 文件后半段还绑定了一批页面按钮（go / toMenu 等），搜按钮的 id 就能找到。
let rougeSquadSize = 3;   // 固定三人一队（不再让玩家选两人还是三人）：本机 2P / 3P 随时按键接手，没人的位置电脑同袍顶上
let rougeStoryChapter = 0;
let rougePhaseMode = 'story';   // 'story': 先打小怪剧情波次再战六技魔首；'boss': 直接迎战六技魔首
let pendingRaidBoss = null;
function rollRaidBoss(wave = 1, fixed = null) {   // fixed：指定三名侠客（全服肉鸽由服务器定，全线同一只）
  const pool = CHARS.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  const heroes = Array.isArray(fixed) && fixed.length >= 3 ? fixed.slice(0, 3) : pool.slice(0, 3);
  const skills = [];
  const ults = [];
  for (const hIdx of heroes) {
    const c = CHARS[hIdx];
    if (c.skill && !skills.includes(c.skill)) skills.push(c.skill);
    if (c.skill2 && !skills.includes(c.skill2)) skills.push(c.skill2);
    if (c.ult && !ults.includes(c.ult)) ults.push(c.ult);
  }
  return {
    wave,
    heroes,
    heroNames: heroes.map(i => CHARS[i].name),
    skills,
    skillNames: skills.map(id => (SKILLS[id] && SKILLS[id].name) || id),
    ults
  };
}
function applyRaidBossToB() {
  if (!M.raidBoss || !Array.isArray(M.raidBoss.heroes) || M.raidBoss.heroes.length < 3) {
    M.raidBoss = rollRaidBoss(M.raidWave || 1);
  }
  const rb = M.raidBoss;
  const h1 = rb.heroes[0], h2 = rb.heroes[1], h3 = rb.heroes[2];
  B.setChar(h1);
  // 浅拷贝 ch，不改动全局 CHARS（保证反作弊签名一致），挂载 3 名随机侠客的 6 项绝技
  B.ch = {
    ...CHARS[h1],
    skill: rb.skills[0],
    skill2: rb.skills[1],
    ult: rb.ults[0]
  };
  B.bossHeroes = [...rb.heroes];
  B.bossSkills = [...rb.skills];
  B.bossUlts = [...rb.ults];
  B.bossSkillCursor = 0;
  B.bossRotTimer = 2.4;
  // 三倍气血（波次递进额外微增）+ 1.25 倍伤害 + 霸王体魄
  const waveMul = 1 + ((M.raidWave || 1) - 1) * 0.15;
  B.maxHp = Math.round(B.maxHp * 3.0 * waveMul);
  B.hp = B.lagHp = B.maxHp;
  B.bossDmgMul = 1.25;
  B.size = 1.18;
  B.maxGuard = 220;
  B.guard = 220;
  B.meter = 45;
  B.ink = INK_MAX;
  B.drunk = 65;
  B.look = {
    ...B.look,
    name: `${CHARS[h1].name}·${CHARS[h2].name}·${CHARS[h3].name} 融魂魔首`
  };
}
function updateRaidBoss(dt) {
  if (!isRaid() || B.hp <= 0 || !B.bossSkills || B.bossSkills.length < 6) return;
  B.ink = INK_MAX;
  B.drunk = Math.max(B.drunk || 0, 60);
  B.bossRotTimer = (B.bossRotTimer || 2.4) - dt;
  if (B.bossRotTimer <= 0 && B.state !== 'skill' && B.state !== 'special') {
    B.bossRotTimer = 2.6;
    B.bossSkillCursor = ((B.bossSkillCursor || 0) + 2) % 6;
  }
  raidBossSkills();
}
// 魔首当前用哪两招、哪个大招：B.ch 不进回滚存档，所以每帧（和回滚恢复后）都按存档里的游标重新对上
function raidBossSkills() {
  if (!B.bossSkills || B.bossSkills.length < 6 || !B.ch) return;
  const c = B.bossSkillCursor || 0;
  B.ch.skill = B.bossSkills[c];
  B.ch.skill2 = B.bossSkills[(c + 1) % 6];
  if (B.bossUlts && B.bossUlts.length) B.ch.ult = B.bossUlts[(c >> 1) % B.bossUlts.length];
}
function startRaidMatch(squadPicks, squadSize = 3, opts = null) {
  if (p2pActive()) netDropWaiting();
  initAudio(); refocusGame(); paused = false; human[0].rec = null; REC.on = false;
  const sq = squadSize === 2 ? 2 : 3;
  const picks = Array.isArray(squadPicks) && squadPicks.length >= sq ? squadPicks.slice(0, sq) : [0, 2, 3].slice(0, sq);
  const chIdx = (opts && opts.chapterIdx !== undefined) ? opts.chapterIdx : (CHAPTERS.findIndex(c => c.hero === CHARS[picks[0]].id));
  const validCh = chIdx >= 0 ? chIdx : (rougeStoryChapter || 0);
  const chObj = CHAPTERS[validCh] || CHAPTERS[0];
  const story = HERO_FOREST_STORIES[chObj.hero] || HERO_FOREST_STORIES[CHARS[picks[0]].id] || HERO_FOREST_STORIES.qingfeng;
  M.mode = 'raid';
  M.raidSquadSize = sq;
  M.raidWave = 1;
  M.raidInkEarned = 0;
  M.raidLastReward = 600;
  M.raidConsoled = false;
  M.raidStoryHero = story.hero;
  M.raidStoryChapter = validCh;
  M.raidStory = story;
  M.raidBoss = pendingRaidBoss || rollRaidBoss(1);
  pendingRaidBoss = null;
  // 开局即赠送 2 卷全队共享的随机秘卷，全员共享增益
  const initPerks = scDraw(CHARS[picks[0]].id, [], 2).map(s => s.id);
  M.towerPerks = initPerks;
  M.foeScrolls = ['bx_armor', 'bx_haste'];
  M.scRun = {};
  M.watchAi = false;
  M.level = 'god';
  M.bans = [];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  A.setChar(picks[0]);
  C.setChar(picks[1] !== undefined ? picks[1] : ((picks[0] + 1) % CHARS.length));
  if (sq >= 3) D.setChar(picks[2] !== undefined ? picks[2] : ((picks[0] + 2) % CHARS.length));
  A.ctrl = human[0];
  // 2P / 3P 默认由高配合度天道同袍协战，本机第 2/3 名玩家随时按键即可无缝接管！
  C.ctrl = new AICtrl('god');
  D.ctrl = new AICtrl('god');
  B.ctrl = new AICtrl('god');
  A.meter = C.meter = D.meter = 45;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  showScreen(null);
  if (opts && opts.storyWaves) {
    // 先进入该侠客的斩妖剧情波次（2~3 人同屏打小怪 + 每波感悟共享肉鸽秘卷），清完小怪无缝迎战六技融魂魔首！
    const S = STAGE = stageInfo(validCh, 0);
    startRound();
    const initLine = (story.waveDialogues && story.waveDialogues[0]) || story.synopsis;
    Object.assign(FOREST, {
      on: true, mons: [], shots: [], spawnT: 0.9, kills: {}, total: 0, t: 0, hurtT: 9, wave: 0, toSpawn: [], breakT: 1.2,
      over: false, overT: 0, shown: false, prot: S.K.prot, result: null,
      storyTitle: `${story.title} · ${S.stgName}`,
      storyLine: initLine,
      raidStory: true
    });
    B.forestProxy = true; B.hidden = true; B.x = STAGE_W / 2 + 360; B.invul = 99;
    M.phase = 'fight';
    say(`${story.title} · 同袍斩妖开启`, 1.5, 'big', initLine);
    return;
  }
  FOREST.on = false; B.forestProxy = false; B.hidden = false;
  rpRunBegin('raid');
  recBegin('loc');
  startRound();
  const perkNames = initPerks.map(id => SC_BY[id] ? `「${SC_BY[id].n}」` : '').filter(Boolean).join('、');
  say(`${story.title} · 决战【${M.raidBoss.heroNames.join('·')}】`, 1.5, 'big', story.bossIntro || (perkNames ? `全队共享秘卷：${perkNames}` : '全员收益共享'));
}
// 联机同袍肉鸽：魔首是谁、开局送哪两卷秘卷，两边按同一个种子抽（各自的 Math.random 会抽得不一样）
function netRaidSetup() {
  const rnd = Math.random; Math.random = grnd;
  try { M.raidBoss = rollRaidBoss(1); M.towerPerks = scDraw(A.ch.id, [], 2).map(s => s.id); } finally { Math.random = rnd; }
  Object.assign(M, { raidSquadSize: 3, raidWave: 1, raidInkEarned: 0, raidLastReward: 600, raidConsoled: false, raidPaid: false,
    foeScrolls: ['bx_armor', 'bx_haste'], scRun: {}, level: 'god', bans: [], stage: null });
  FOREST.on = false; B.forestProxy = false; B.hidden = false;
}
function nextRaidWave() {
  paused = false;
  M.phase = 'intro';
  M.raidWave = (M.raidWave || 1) + 1;
  M.raidConsoled = false;
  M.wins = [0, 0];
  M.round = 1;
  M.raidBoss = rollRaidBoss(M.raidWave);
  showScreen(null);
  B.ctrl = new AICtrl('god');
  recBegin('loc');
  startRound();
  const lastPerkId = (M.towerPerks || [])[M.towerPerks.length - 1];
  const pName = lastPerkId && SC_BY[lastPerkId] ? `全员共享「${SC_BY[lastPerkId].n}」` : '全队秘卷共鸣';
  say(`同袍肉鸽 · 第 ${M.raidWave} 劫【${M.raidBoss.heroNames.join('·')}】`, 1.5, 'big', pName);
}
function renderRougeModal() {
  if (!pendingRaidBoss) pendingRaidBoss = rollRaidBoss(1);
  for (const b of document.querySelectorAll('#rougePhaseSeg button')) {
    b.classList.toggle('sel', b.dataset.ph === rougePhaseMode);
  }
  const tabsEl = $id('rougeStoryTabs');
  if (tabsEl && typeof CHAPTERS !== 'undefined') {
    tabsEl.innerHTML = CHAPTERS.map((ch, idx) => {
      const st = HERO_FOREST_STORIES[ch.hero];
      return `<button type="button" data-ch="${idx}" class="${idx === rougeStoryChapter ? 'sel' : ''}">${st ? st.heroName : ch.name}</button>`;
    }).join('');
  }
  const sBox = $id('rougeStoryBox');
  if (sBox && typeof CHAPTERS !== 'undefined') {
    const ch = CHAPTERS[rougeStoryChapter] || CHAPTERS[0];
    const st = HERO_FOREST_STORIES[ch.hero] || HERO_FOREST_STORIES.qingfeng;
    sBox.innerHTML = `
      <b>📖 ${st.title}（${st.place} · 五幕斩妖列传）</b>
      <div>${st.synopsis}</div>
      <div style="margin-top:4px;color:#7fe0b0;font-size:12px">章节流程：${st.stageNames.slice(0, 4).join(' → ')}（同袍斩小怪+每波共享秘卷） → <b>终幕【${st.stageNames[4]}】迎战六技魔首</b></div>
    `;
  }
  const box = $id('rougeBossPreview');
  if (box) {
    const rb = pendingRaidBoss;
    const chips = rb.skills.map((skId, idx) => {
      const sk = SKILLS[skId];
      const hName = rb.heroNames[(idx / 2) | 0] || '';
      return `<div class="mr-skill-chip"><b>${hName}</b>${sk ? sk.name : skId}</div>`;
    }).join('');
    box.innerHTML = `
      <div class="mr-boss-head">
        <span class="mr-boss-title">👹 终幕六技融魂魔首：${rb.heroNames.join(' · ')}</span>
        <div class="mr-boss-tags">
          <span class="mr-boss-tag">300% 气血 (3x HP)</span>
          <span class="mr-boss-tag">125% 伤害</span>
          <span class="mr-boss-tag gold">讨伐大捷全员共享：+600 墨锭</span>
        </div>
      </div>
      <div class="mr-skills-grid">${chips}</div>
    `;
  }
}
function openRougeModal(chIdx) {
  if (typeof chIdx === 'number' && chIdx >= 0 && chIdx < CHAPTERS.length) rougeStoryChapter = chIdx;
  if (!pendingRaidBoss) pendingRaidBoss = rollRaidBoss(1);
  const m = $id('modalRouge');
  if (m) m.classList.remove('hidden');
  renderRougeModal();
}
function closeRougeModal() {
  const m = $id('modalRouge');
  if (m) m.classList.add('hidden');
}
if ($id('modalRougeClose')) {
  $id('modalRougeClose').addEventListener('click', closeRougeModal);
}
if ($id('rougeStoryTabs')) {
  $id('rougeStoryTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-ch]'); if (!b) return;
    rougeStoryChapter = +b.dataset.ch || 0;
    SFX.slice(); renderRougeModal();
  });
}
if ($id('rougePhaseSeg')) {
  $id('rougePhaseSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-ph]'); if (!b) return;
    rougePhaseMode = b.dataset.ph === 'boss' ? 'boss' : 'story';
    SFX.slice(); renderRougeModal();
  });
}
if ($id('btnRougeReroll')) {
  $id('btnRougeReroll').addEventListener('click', () => {
    pendingRaidBoss = rollRaidBoss(1);
    SFX.slice(); renderRougeModal();
  });
}
if ($id('btnRougeGoLocal')) {
  $id('btnRougeGoLocal').addEventListener('click', () => {
    closeRougeModal();
    bpStart('raid', { squadSize: rougeSquadSize, chapterIdx: rougeStoryChapter, storyWaves: rougePhaseMode === 'story' });
  });
}
if ($id('btnRougeGoMatch')) {
  $id('btnRougeGoMatch').addEventListener('click', () => {
    closeRougeModal();
    worldEnter(0);
    toast('已踏入全服肉鸽江湖分线，按 [T] 键可随时瞬移至同道身旁！');
  });
}
if ($id('btnRougeGoOnline')) {
  $id('btnRougeGoOnline').addEventListener('click', () => {
    closeRougeModal();
    if (!$id('netp').classList.contains('on')) openScreen('netp');
    setRoomModeUI('raid');
    const hb = $id('hostBtn');
    if (hb) hb.click();
    toast('已建好同袍肉鸽共斗房间，把房间号发给好友即可并肩讨伐魔首！');
  });
}

function go() {
  initAudio(); paused = false;
  if (mapVote) bpStart('maps', { level: pickLevel, isWatch: false });
  else bpStart('cpu');
}
document.getElementById('goBtn').addEventListener('click', go);
