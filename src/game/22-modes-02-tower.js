// ======================= 问剑密卷 (肉鸽无尽试炼) =======================
// 本文件：问剑密卷（无尽爬塔）：存档 / 读档 / 继续、每层之间选秘卷（showTowerPerkModal）、下一层。秘卷本身在 22-scrolls.js。
// 秘卷的目录和效果都在 22-scrolls.js；这里是爬塔的流程：开局、过层抽卷、存档续玩
const TOWER_SAVE_KEY = 'renying-tower-run';

function saveTowerRun() {
  if (M.mode === 'tower' && M.phase !== 'end' && A && A.hp > 0) {
    const run = {
      hero: M.towerHero !== undefined ? M.towerHero : towerHero,
      floor: M.towerFloor || 1,
      perks: M.towerPerks ? [...M.towerPerks] : [],
      run: M.scRun || {},
      hp: Math.max(1, Math.min(A.maxHp || 100, A.hp)),
      maxHp: A.maxHp || 100
    };
    try { localStorage.setItem(TOWER_SAVE_KEY, JSON.stringify(run)); } catch (e) {}
  }
}

function loadTowerRun() {
  try {
    const raw = localStorage.getItem(TOWER_SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw);
    if (run && typeof run === 'object' && typeof run.floor === 'number' && run.floor >= 1) return run;
  } catch (e) {}
  return null;
}

function clearTowerRun() {
  try { localStorage.removeItem(TOWER_SAVE_KEY); } catch (e) {}
}

let towerHero = 0;
function renderTower() {
  const badge = document.getElementById('towerRecordBadge');
  if (badge) badge.textContent = `最高通关：第 ${PROF.towerMaxFloor || 1} 层`;
  const resumeBtn = document.getElementById('towerResumeBtn');
  const savedRun = loadTowerRun();
  if (resumeBtn) {
    if (savedRun && savedRun.floor >= 1) {
      const heroName = (CHARS[savedRun.hero] && CHARS[savedRun.hero].name) || '侠客';
      resumeBtn.textContent = `继续试炼（${heroName} · 第 ${savedRun.floor} 层）`;
      resumeBtn.style.display = 'inline-block';
    } else {
      resumeBtn.style.display = 'none';
    }
  }
}

function startTower(heroIdx, isWatch = false) {
  clearTowerRun();
  initAudio();
  paused = false;
  towerHero = heroIdx !== undefined ? heroIdx : towerHero;
  M.mode = 'tower';
  M.towerFloor = 1;
  M.towerPerks = []; M.foeScrolls = []; M.scRun = {};
  M.towerHero = towerHero;
  M.round = 1;
  M.wins = [0, 0];
  M.level = 'easy';
  M.stage = null;
  M.watchAi = !!isWatch;
  let foeIdx = Math.floor(Math.random() * CHARS.length);
  if (foeIdx === towerHero) foeIdx = (foeIdx + 1) % CHARS.length;
  setChars(towerHero, foeIdx);
  A.ctrl = isWatch ? new AICtrl('god') : human[0];
  B.ctrl = new AICtrl('easy');
  A.meter = B.meter = 0;
  human[0].clear(); human[1].clear();
  showScreen(null);
  startRound();
  if (!isWatch) saveTowerRun();
  say(isWatch ? '问剑密卷 · 天道爬塔观战' : '问剑密卷 · 第 1 层', 1.4);
}

function resumeTower() {
  const run = loadTowerRun();
  if (!run) { bpStart('tower', { isWatch: false }); return; }   // 没有存档就和「开启新试炼」一样先去点将台选人
  initAudio();
  paused = false;
  towerHero = run.hero !== undefined ? run.hero : towerHero;
  M.mode = 'tower';
  M.towerFloor = run.floor || 1;
  M.towerPerks = (run.perks || []).filter(id => SC_BY[id]); M.foeScrolls = []; M.scRun = run.run && typeof run.run === 'object' ? { ...run.run } : {};
  M.towerHero = towerHero;
  M.round = 1;
  M.wins = [0, 0];
  let lv = 'easy';
  if (M.towerFloor >= 12) lv = 'impossible';
  else if (M.towerFloor >= 8) lv = 'adaptive';
  else if (M.towerFloor >= 5) lv = 'hard';
  else if (M.towerFloor >= 3) lv = 'normal';
  M.level = lv;
  M.stage = null;
  let foeIdx = Math.floor(Math.random() * CHARS.length);
  if (foeIdx === towerHero) foeIdx = (foeIdx + 1) % CHARS.length;
  setChars(towerHero, foeIdx);
  A.ctrl = human[0];
  B.ctrl = new AICtrl(lv);
  human[0].clear(); human[1].clear();
  showScreen(null);
  startRound();
  if (typeof run.hp === 'number' && run.hp > 0) {
    A.hp = Math.min(A.maxHp, run.hp);
    A.lagHp = A.hp;
  }
  saveTowerRun();
  say(`问剑密卷 · 继续第 ${M.towerFloor} 层`, 1.4);
}

function showTowerPerkModal() {
  const modal = document.getElementById('towerModal');
  const choicesEl = document.getElementById('towerChoices');
  if (!modal || !choicesEl) {
    nextTowerFloor();
    return;
  }
  modal.classList.remove('has-5-choices');
  choicesEl.classList.remove('choices-5');
  const picked = scDraw(A.ch.id, M.towerPerks || [], 3);
  if (!picked.length) { nextTowerFloor(); return; }   // 这个侠客能拿的秘卷全拿完了
  const reso = scResoLines(M.towerPerks || []);
  choicesEl.innerHTML = picked.map(p => `<div class="tower-perk-card${p.r === 'x' ? ' cursed' : p.r === 'l' ? ' legend' : ''}" data-perk="${p.id}">
      <div class="tp-icon">${scIcon(p)}</div>
      <div class="tp-name">「${p.n}」</div>
      ${scTag(p)}
      <div class="tp-desc">${p.d}</div>
      <button class="go small tp-pick" type="button">顿悟秘卷</button>
    </div>`).join('') + `<p class="tp-owned">已领悟 ${(M.towerPerks || []).length} 卷${reso.length ? ' · ' + reso.join(' · ') : ''}</p>`;
  choicesEl.querySelectorAll('.tower-perk-card').forEach(card => {
    card.addEventListener('click', () => pickTowerPerk(card.dataset.perk));
  });
  $id('towerTitle').textContent = isRaid() ? '同袍肉鸽 · 全队共享秘卷三选一' : '问剑悟道 · 秘卷三选一';
  const fb = document.getElementById('towerFloorBadge');
  if (fb) fb.textContent = isRaid() ? `讨伐第 ${M.raidWave || 1} 劫大捷 · 全员共享秘卷增益` : `突破第 ${M.towerFloor} 层 · 顿悟秘卷`;
  showScreen('towerModal');
  if (M.watchAi) {
    setTimeout(() => {
      if (M.mode === 'tower' && M.watchAi && M.phase === 'perk') {
        const choice = typeof aiChooseScroll === 'function' ? aiChooseScroll(A.ch.id, picked, M.towerPerks || []) : picked[0];
        if (choice) pickTowerPerk(choice.id);
      }
    }, 1200);
  }
}

function pickTowerPerk(perkId) {
  if (!M.towerPerks) M.towerPerks = [];
  if (M.phase !== 'perk' || !SC_BY[perkId]) return;
  M.towerPerks.push(perkId);
  const p = SC_BY[perkId];
  if (isRaid()) {
    say(`全队共享领悟「${p.n}」`, 1.2);
    nextRaidWave();
    return;
  }
  say(`领悟「${p.n}」`, 1.2);
  nextTowerFloor();
}

function nextTowerFloor() {
  paused = false;
  M.phase = 'intro';
  M.towerFloor = (M.towerFloor || 1) + 1;
  PROF.towerMaxFloor = Math.max(PROF.towerMaxFloor || 0, M.towerFloor);
  saveProfile();
  showScreen(null);
  let nextFoe = Math.floor(Math.random() * CHARS.length);
  if (nextFoe === A.chIdx && CHARS.length > 1) nextFoe = (nextFoe + 1) % CHARS.length;
  B.setChar(nextFoe);
  // 难度提升只提升 AI 应对逻辑，不提升血量数值！
  let lv = 'easy';
  if (M.towerFloor >= 12) lv = 'impossible';
  else if (M.towerFloor >= 8) lv = 'adaptive';
  else if (M.towerFloor >= 5) lv = 'hard';
  else if (M.towerFloor >= 3) lv = 'normal';
  M.level = lv;
  if (M.watchAi) A.ctrl = new AICtrl('god');
  B.ctrl = new AICtrl(lv);
  startRound();   // 每层满血开打（和其他 1v1 一样）；秘卷的开局效果在 startRound 里生效
  if (!M.watchAi) saveTowerRun();
  say(M.watchAi ? `天道爬塔 · 第 ${M.towerFloor} 层` : `万仞剑阁 · 第 ${M.towerFloor} 层`, 1.4);
}
