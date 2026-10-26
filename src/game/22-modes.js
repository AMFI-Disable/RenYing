// ======================= 3v3 门派车轮战 =======================
let tag3Level = 'normal';

// 车轮战设置页只剩难度按钮：选人统一在点将台里做（各禁 1 选 3）
function renderTag3() {
  for (const x of document.querySelectorAll('#tag3Levels button')) x.classList.toggle('sel', x.dataset.lv === tag3Level);
}

function startTag3Match(pTeam, eTeam, lv, isWatch = false) {
  if (p2pActive()) netDropWaiting();
  refocusGame();
  human[0].rec = null;
  REC.on = false;

  M.mode = 'tag3';
  M.level = lv || tag3Level || 'normal';
  M.teams = [[...pTeam], [...eTeam]];
  M.teamIdx = [0, 0];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  M.duo = null;
  M.watchAi = !!isWatch;

  setChars(M.teams[0][0], M.teams[1][0]);
  A.ctrl = isWatch ? new AICtrl(M.level || 'god') : human[0];
  B.ctrl = new AICtrl(M.level || 'god');
  A.meter = B.meter = 0;
  human[0].clear(); human[1].clear();

  showScreen(null);
  startRound();
  if (isWatch) say('3v3 门派车轮战 · AI 群英观战', 1.4);
}

const tag3LevelsEl = document.getElementById('tag3Levels');
if (tag3LevelsEl) {
  tag3LevelsEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.lv) return;
    tag3Level = b.dataset.lv;
    for (const x of document.querySelectorAll('#tag3Levels button')) x.classList.toggle('sel', x === b);
    SFX.slice();
  });
}
const tag3StartBtn = document.getElementById('tag3StartBtn');
if (tag3StartBtn) {
  tag3StartBtn.addEventListener('click', () => {
    initAudio();
    paused = false;
    bpStart('tag3', { level: tag3Level, isWatch: false });
  });
}

// ======================= 问剑密卷 (肉鸽无尽试炼) =======================
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
  $id('towerTitle').textContent = '问剑悟道 · 秘卷三选一';
  const fb = document.getElementById('towerFloorBadge');
  if (fb) fb.textContent = `突破第 ${M.towerFloor} 层 · 顿悟秘卷`;
  showScreen('towerModal');
  if (M.watchAi) {
    setTimeout(() => {
      if (M.mode === 'tower' && M.watchAi && M.phase === 'perk') pickTowerPerk(picked[Math.floor(Math.random() * picked.length)].id);
    }, 1200);
  }
}

function pickTowerPerk(perkId) {
  if (!M.towerPerks) M.towerPerks = [];
  if (M.phase !== 'perk' || !SC_BY[perkId]) return;
  M.towerPerks.push(perkId);
  const p = SC_BY[perkId];
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

const CHAOS_MUTATIONS = [
  { id: "chaos_1", name: "「疾风·天罡」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 天罡北斗，刚劲无俦" },
  { id: "chaos_2", name: "「疾风·地煞」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 地煞幽冥，出奇制胜" },
  { id: "chaos_3", name: "「疾风·青龙」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 青龙出海，威动乾坤" },
  { id: "chaos_4", name: "「疾风·白虎」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 白虎啸风，势不可挡" },
  { id: "chaos_5", name: "「疾风·朱雀」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 朱雀振羽，生生不息" },
  { id: "chaos_6", name: "「疾风·玄武」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 玄武镇岳，坚固磐石" },
  { id: "chaos_7", name: "「疾风·破晓」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 破晓晨光，势如长虹" },
  { id: "chaos_8", name: "「疾风·残月」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 孤月映水，来去无痕" },
  { id: "chaos_9", name: "「疾风·奔雷」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_10", name: "「疾风·离火」", icon: "🌪️", type: "spd", val: 1.45, desc: "身法迅疾，移动速度提升45% · 炽火焚天，烽烟万里" },
  { id: "chaos_11", name: "「迅影·天罡」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 天罡北斗，刚劲无俦" },
  { id: "chaos_12", name: "「迅影·地煞」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 地煞幽冥，出奇制胜" },
  { id: "chaos_13", name: "「迅影·青龙」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 青龙出海，威动乾坤" },
  { id: "chaos_14", name: "「迅影·白虎」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 白虎啸风，势不可挡" },
  { id: "chaos_15", name: "「迅影·朱雀」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 朱雀振羽，生生不息" },
  { id: "chaos_16", name: "「迅影·玄武」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 玄武镇岳，坚固磐石" },
  { id: "chaos_17", name: "「迅影·破晓」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 破晓晨光，势如长虹" },
  { id: "chaos_18", name: "「迅影·残月」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 孤月映水，来去无痕" },
  { id: "chaos_19", name: "「迅影·奔雷」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_20", name: "「迅影·离火」", icon: "⚡", type: "dash_cd", val: 0.4, desc: "轻功拔群，冲刺冷却缩减60% · 炽火焚天，烽烟万里" },
  { id: "chaos_21", name: "「千钧·天罡」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 天罡北斗，刚劲无俦" },
  { id: "chaos_22", name: "「千钧·地煞」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 地煞幽冥，出奇制胜" },
  { id: "chaos_23", name: "「千钧·青龙」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 青龙出海，威动乾坤" },
  { id: "chaos_24", name: "「千钧·白虎」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 白虎啸风，势不可挡" },
  { id: "chaos_25", name: "「千钧·朱雀」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 朱雀振羽，生生不息" },
  { id: "chaos_26", name: "「千钧·玄武」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 玄武镇岳，坚固磐石" },
  { id: "chaos_27", name: "「千钧·破晓」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 破晓晨光，势如长虹" },
  { id: "chaos_28", name: "「千钧·残月」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 孤月映水，来去无痕" },
  { id: "chaos_29", name: "「千钧·奔雷」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_30", name: "「千钧·离火」", icon: "💥", type: "dmg", val: 1.4, desc: "力拔千钧，招式伤害提升40% · 炽火焚天，烽烟万里" },
  { id: "chaos_31", name: "「重浪·天罡」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 天罡北斗，刚劲无俦" },
  { id: "chaos_32", name: "「重浪·地煞」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 地煞幽冥，出奇制胜" },
  { id: "chaos_33", name: "「重浪·青龙」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 青龙出海，威动乾坤" },
  { id: "chaos_34", name: "「重浪·白虎」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 白虎啸风，势不可挡" },
  { id: "chaos_35", name: "「重浪·朱雀」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 朱雀振羽，生生不息" },
  { id: "chaos_36", name: "「重浪·玄武」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 玄武镇岳，坚固磐石" },
  { id: "chaos_37", name: "「重浪·破晓」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 破晓晨光，势如长虹" },
  { id: "chaos_38", name: "「重浪·残月」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 孤月映水，来去无痕" },
  { id: "chaos_39", name: "「重浪·奔雷」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_40", name: "「重浪·离火」", icon: "🌊", type: "kb", val: 2.0, desc: "惊涛裂岸，攻击击退力提升100% · 炽火焚天，烽烟万里" },
  { id: "chaos_41", name: "「踏虚·天罡」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 天罡北斗，刚劲无俦" },
  { id: "chaos_42", name: "「踏虚·地煞」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 地煞幽冥，出奇制胜" },
  { id: "chaos_43", name: "「踏虚·青龙」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 青龙出海，威动乾坤" },
  { id: "chaos_44", name: "「踏虚·白虎」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 白虎啸风，势不可挡" },
  { id: "chaos_45", name: "「踏虚·朱雀」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 朱雀振羽，生生不息" },
  { id: "chaos_46", name: "「踏虚·玄武」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 玄武镇岳，坚固磐石" },
  { id: "chaos_47", name: "「踏虚·破晓」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 破晓晨光，势如长虹" },
  { id: "chaos_48", name: "「踏虚·残月」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 孤月映水，来去无痕" },
  { id: "chaos_49", name: "「踏虚·奔雷」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 狂雷贯顶，迅若闪电" },
  { id: "chaos_50", name: "「踏虚·离火」", icon: "🪶", type: "grav", val: 0.5, desc: "御风凌虚，重力减半滞空延长 · 炽火焚天，烽烟万里" },
  { id: "chaos_51", name: "「凌霄·天罡」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 天罡北斗，刚劲无俦" },
  { id: "chaos_52", name: "「凌霄·地煞」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 地煞幽冥，出奇制胜" },
  { id: "chaos_53", name: "「凌霄·青龙」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 青龙出海，威动乾坤" },
  { id: "chaos_54", name: "「凌霄·白虎」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 白虎啸风，势不可挡" },
  { id: "chaos_55", name: "「凌霄·朱雀」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 朱雀振羽，生生不息" },
  { id: "chaos_56", name: "「凌霄·玄武」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 玄武镇岳，坚固磐石" },
  { id: "chaos_57", name: "「凌霄·破晓」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 破晓晨光，势如长虹" },
  { id: "chaos_58", name: "「凌霄·残月」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 孤月映水，来去无痕" },
  { id: "chaos_59", name: "「凌霄·奔雷」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_60", name: "「凌霄·离火」", icon: "🕊️", type: "jump", val: 1.45, desc: "凌云蹑虚，起跳高度提升45% · 炽火焚天，烽烟万里" },
  { id: "chaos_61", name: "「狂涌·天罡」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 天罡北斗，刚劲无俦" },
  { id: "chaos_62", name: "「狂涌·地煞」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 地煞幽冥，出奇制胜" },
  { id: "chaos_63", name: "「狂涌·青龙」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 青龙出海，威动乾坤" },
  { id: "chaos_64", name: "「狂涌·白虎」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 白虎啸风，势不可挡" },
  { id: "chaos_65", name: "「狂涌·朱雀」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 朱雀振羽，生生不息" },
  { id: "chaos_66", name: "「狂涌·玄武」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 玄武镇岳，坚固磐石" },
  { id: "chaos_67", name: "「狂涌·破晓」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 破晓晨光，势如长虹" },
  { id: "chaos_68", name: "「狂涌·残月」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 孤月映水，来去无痕" },
  { id: "chaos_69", name: "「狂涌·奔雷」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 狂雷贯顶，迅若闪电" },
  { id: "chaos_70", name: "「狂涌·离火」", icon: "🔥", type: "meter_gain", val: 2.0, desc: "真气狂涌，聚气速度翻倍 · 炽火焚天，烽烟万里" },
  { id: "chaos_71", name: "「神通·天罡」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 天罡北斗，刚劲无俦" },
  { id: "chaos_72", name: "「神通·地煞」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 地煞幽冥，出奇制胜" },
  { id: "chaos_73", name: "「神通·青龙」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 青龙出海，威动乾坤" },
  { id: "chaos_74", name: "「神通·白虎」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 白虎啸风，势不可挡" },
  { id: "chaos_75", name: "「神通·朱雀」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 朱雀振羽，生生不息" },
  { id: "chaos_76", name: "「神通·玄武」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 玄武镇岳，坚固磐石" },
  { id: "chaos_77", name: "「神通·破晓」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 破晓晨光，势如长虹" },
  { id: "chaos_78", name: "「神通·残月」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 孤月映水，来去无痕" },
  { id: "chaos_79", name: "「神通·奔雷」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_80", name: "「神通·离火」", icon: "✨", type: "cd", val: 0.4, desc: "招意通灵，技能冷却缩减60% · 炽火焚天，烽烟万里" },
  { id: "chaos_81", name: "「霸体·天罡」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 天罡北斗，刚劲无俦" },
  { id: "chaos_82", name: "「霸体·地煞」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 地煞幽冥，出奇制胜" },
  { id: "chaos_83", name: "「霸体·青龙」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 青龙出海，威动乾坤" },
  { id: "chaos_84", name: "「霸体·白虎」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 白虎啸风，势不可挡" },
  { id: "chaos_85", name: "「霸体·朱雀」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 朱雀振羽，生生不息" },
  { id: "chaos_86", name: "「霸体·玄武」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 玄武镇岳，坚固磐石" },
  { id: "chaos_87", name: "「霸体·破晓」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 破晓晨光，势如长虹" },
  { id: "chaos_88", name: "「霸体·残月」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 孤月映水，来去无痕" },
  { id: "chaos_89", name: "「霸体·奔雷」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 狂雷贯顶，迅若闪电" },
  { id: "chaos_90", name: "「霸体·离火」", icon: "🛡️", type: "armor", val: 1, desc: "金石铸身，出招附带强韧霸体 · 炽火焚天，烽烟万里" },
  { id: "chaos_91", name: "「金刚·天罡」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 天罡北斗，刚劲无俦" },
  { id: "chaos_92", name: "「金刚·地煞」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 地煞幽冥，出奇制胜" },
  { id: "chaos_93", name: "「金刚·青龙」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 青龙出海，威动乾坤" },
  { id: "chaos_94", name: "「金刚·白虎」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 白虎啸风，势不可挡" },
  { id: "chaos_95", name: "「金刚·朱雀」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 朱雀振羽，生生不息" },
  { id: "chaos_96", name: "「金刚·玄武」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 玄武镇岳，坚固磐石" },
  { id: "chaos_97", name: "「金刚·破晓」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 破晓晨光，势如长虹" },
  { id: "chaos_98", name: "「金刚·残月」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 孤月映水，来去无痕" },
  { id: "chaos_99", name: "「金刚·奔雷」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 狂雷贯顶，迅若闪电" },
  { id: "chaos_100", name: "「金刚·离火」", icon: "🔔", type: "guard_stab", val: 2.0, desc: "不动如山，架势防御强度翻倍 · 炽火焚天，烽烟万里" },
  { id: "chaos_101", name: "「血煞·天罡」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 天罡北斗，刚劲无俦" },
  { id: "chaos_102", name: "「血煞·地煞」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 地煞幽冥，出奇制胜" },
  { id: "chaos_103", name: "「血煞·青龙」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 青龙出海，威动乾坤" },
  { id: "chaos_104", name: "「血煞·白虎」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 白虎啸风，势不可挡" },
  { id: "chaos_105", name: "「血煞·朱雀」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 朱雀振羽，生生不息" },
  { id: "chaos_106", name: "「血煞·玄武」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 玄武镇岳，坚固磐石" },
  { id: "chaos_107", name: "「血煞·破晓」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 破晓晨光，势如长虹" },
  { id: "chaos_108", name: "「血煞·残月」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 孤月映水，来去无痕" },
  { id: "chaos_109", name: "「血煞·奔雷」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_110", name: "「血煞·离火」", icon: "🩸", type: "vamp", val: 0.25, desc: "饮血淬锋，命中吸血25% · 炽火焚天，烽烟万里" },
  { id: "chaos_111", name: "「破军·天罡」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 天罡北斗，刚劲无俦" },
  { id: "chaos_112", name: "「破军·地煞」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 地煞幽冥，出奇制胜" },
  { id: "chaos_113", name: "「破军·青龙」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 青龙出海，威动乾坤" },
  { id: "chaos_114", name: "「破军·白虎」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 白虎啸风，势不可挡" },
  { id: "chaos_115", name: "「破军·朱雀」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 朱雀振羽，生生不息" },
  { id: "chaos_116", name: "「破军·玄武」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 玄武镇岳，坚固磐石" },
  { id: "chaos_117", name: "「破军·破晓」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 破晓晨光，势如长虹" },
  { id: "chaos_118", name: "「破军·残月」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 孤月映水，来去无痕" },
  { id: "chaos_119", name: "「破军·奔雷」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 狂雷贯顶，迅若闪电" },
  { id: "chaos_120", name: "「破军·离火」", icon: "🗡️", type: "crit", val: 1.5, desc: "锋芒毕露，破招破防暴伤提升50% · 炽火焚天，烽烟万里" },
];

let chaosP1 = 0, chaosP2 = 1, chaosLevel = 'normal';
let currentChaosMutation = null;
let chaosTimer = 0;

function rollChaosMutation() {
  const mut = CHAOS_MUTATIONS[Math.floor(Math.random() * CHAOS_MUTATIONS.length)];
  currentChaosMutation = mut;
  chaosTimer = 0;
  flashA = Math.max(flashA, 0.3);
  flashRGB = '233,196,106';
  shake = Math.max(shake, 8);
  SFX.gong();
  say('天机异变 · ' + mut.name, 1.8, 'big', mut.desc);
  if (typeof addP === 'function' && typeof A !== 'undefined') {
    addP({ type: 'text', text: mut.icon + ' ' + mut.name, x: STAGE_W / 2, y: -160, life: 1.8, max: 1.8, rgb: '233,196,106' });
  }
  return mut;
}

function updateChaos(dt) {
  if (M.mode !== 'chaos' || M.phase !== 'fight') return;
  chaosTimer += dt;
  if (!currentChaosMutation || chaosTimer >= CHAOS_INTERVAL) {
    rollChaosMutation();
  }
}

function renderChaos() {
  const lvs = document.querySelectorAll('#chaosLevels button');
  lvs.forEach(b => {
    b.classList.toggle('sel', b.dataset.lv === chaosLevel);
    b.onclick = () => {
      chaosLevel = b.dataset.lv;
      lvs.forEach(x => x.classList.toggle('sel', x === b));
      SFX.slice();
    };
  });
}

function startChaos(p1, p2, lv, isWatch = false) {
  initAudio();
  paused = false;
  chaosP1 = p1 !== undefined ? p1 : chaosP1;
  chaosP2 = p2 !== undefined ? p2 : chaosP2;
  chaosLevel = lv !== undefined ? lv : chaosLevel;
  M.mode = 'chaos';
  M.level = chaosLevel;
  M.round = 1;
  M.wins = [0, 0];
  M.stage = null;
  M.watchAi = !!isWatch;
  currentChaosMutation = null;
  chaosTimer = 0;
  setChars(chaosP1, chaosP2);
  A.ctrl = isWatch ? new AICtrl(chaosLevel || 'god') : human[0];
  B.ctrl = new AICtrl(chaosLevel || 'god');
  A.meter = B.meter = 0;
  human[0].clear(); human[1].clear();
  showScreen(null);
  startRound();
  say(isWatch ? '天机乱斗 · 乾坤异变观战' : '天机乱斗 · 乾坤异变', 1.4);
  rollChaosMutation();
}

const towerStartBtn = document.getElementById('towerStartBtn');
if (towerStartBtn) towerStartBtn.addEventListener('click', () => {
  bpStart('tower', { isWatch: false });
});

const towerResumeBtn = document.getElementById('towerResumeBtn');
if (towerResumeBtn) towerResumeBtn.addEventListener('click', () => resumeTower());

const chaosStartBtn = document.getElementById('chaosStartBtn');
if (chaosStartBtn) chaosStartBtn.addEventListener('click', () => {
  bpStart('chaos', { level: chaosLevel, isWatch: false });
});

const chaosWatchBtn = document.getElementById('chaosWatchBtn');
if (chaosWatchBtn) chaosWatchBtn.addEventListener('click', () => {
  bpStart('chaos', { level: chaosLevel || 'god', isWatch: true });
});

let mayhemP1 = 0, mayhemP2 = 1, mayhemLevel = 'hard';
function renderMayhem() {
  const lvs = document.querySelectorAll('#mayhemLevels button');
  lvs.forEach(b => {
    b.classList.toggle('sel', b.dataset.lv === mayhemLevel);
    b.onclick = () => {
      mayhemLevel = b.dataset.lv;
      lvs.forEach(x => x.classList.toggle('sel', x === b));
      SFX.slice();
    };
  });
}

function startMayhem(p1, p2, lv, isWatch = false) {
  initAudio();
  paused = false;
  mayhemP1 = p1 !== undefined ? p1 : mayhemP1;
  mayhemP2 = p2 !== undefined ? p2 : mayhemP2;
  mayhemLevel = lv !== undefined ? lv : mayhemLevel;
  M.mode = 'mayhem';
  M.level = mayhemLevel;
  M.round = 1;
  M.wins = [0, 0];
  M.stage = null;
  M.watchAi = !!isWatch;
  setChars(mayhemP1, mayhemP2);
  A.ctrl = isWatch ? new AICtrl(mayhemLevel || 'god') : human[0];
  B.ctrl = new AICtrl(mayhemLevel || 'god');
  A.meter = B.meter = 100;
  human[0].clear(); human[1].clear();
  showScreen(null);
  startRound();
  say(isWatch ? '通天神决 · 神魔 AI 观战' : '通天神决 · 大显神通', 1.4);
}

const mayhemStartBtn = document.getElementById('mayhemStartBtn');
if (mayhemStartBtn) mayhemStartBtn.addEventListener('click', () => {
  bpStart('mayhem', { level: mayhemLevel, isWatch: false });
});

const mayhemWatchBtn = document.getElementById('mayhemWatchBtn');
if (mayhemWatchBtn) mayhemWatchBtn.addEventListener('click', () => {
  bpStart('mayhem', { level: mayhemLevel || 'god', isWatch: true });
});

const cpuWatchBtn = document.getElementById('cpuWatchBtn');
if (cpuWatchBtn) cpuWatchBtn.addEventListener('click', () => {
  initAudio();
  paused = false;
  bpStart('cpuWatch');
});

const tag3WatchBtn = document.getElementById('tag3WatchBtn');
if (tag3WatchBtn) tag3WatchBtn.addEventListener('click', () => {
  bpStart('tag3', { level: tag3Level || 'god', isWatch: true });
});

// ======================= 2v2 天道演武观战 (Watch AI vs AI 2v2) =======================
// watch2v2Draft: [ban1, team1_p1, team1_p2, ban2, team2_p1, team2_p2] -> 6 个完全不重复的英雄索引
let watch2v2Draft = [3, 0, 1, 6, 2, 7];

// 2v2 的竞技标准蛇形禁选顺序（Snake Draft Order）：
// 步骤：[0队禁, 1队禁, 0队首选, 1队首选, 1队次选(连选), 0队次选(终选)]
// 先选方拥有首选优势，后选方享有二连选（Pick 2 & Pick 3）的战术组合权，杜绝先选方全包不公。
const WATCH2V2_TEAMS = ['苍龙', '赤凤'];
const WATCH2V2_STEPS_ORDER = [
  { team: 0, type: 'ban', slot: 0, label: '苍龙禁' },
  { team: 1, type: 'ban', slot: 0, label: '赤凤禁' },
  { team: 0, type: 'pick', slot: 0, label: '苍龙先锋' },
  { team: 1, type: 'pick', slot: 0, label: '赤凤先锋' },
  { team: 1, type: 'pick', slot: 1, label: '赤凤次锋' },
  { team: 0, type: 'pick', slot: 1, label: '苍龙次锋' },
];
const WATCH2V2_STEP_DELAY = 0.75;     // 每一步停留 0.75 秒，足够看清 AI 的出手顺序
const WATCH2V2_FINISH_DELAY = 1.15;   // 禁选完成后留一点时间给玩家看清最终阵容
let watch2v2Bp = null;                // 2v2 专属禁选状态；1v1 仍然使用 BP / bpMode，互不干扰

function renderWatch2v2() {
  ensurePortraits();
  const el = document.getElementById('watch2v2Slots');
  if (!el) return;
  el.innerHTML = WATCH2V2_STEPS_ORDER.map((s, idx) => {
    const isBan = s.type === 'ban';
    const teamCol = s.team === 0 ? '#46d3ea' : '#ffb142';
    const badgeBg = isBan ? '#b8392e' : (s.team === 0 ? 'rgba(70,211,234,.22)' : 'rgba(255,177,66,.2)');
    return `<div style="position:relative;padding:10px 8px 12px;border-radius:12px;border:1px solid ${isBan ? 'rgba(255,90,90,.5)' : 'rgba(255,255,255,.16)'};background:${isBan ? 'rgba(60,12,18,.35)' : 'rgba(255,255,255,.04)'};text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px">
      <span style="font-family:var(--title);font-size:12px;padding:1px 8px;border-radius:4px;background:${badgeBg};color:#fbeee0;letter-spacing:1px">第 ${idx + 1} 步</span>
      <span style="font-family:var(--title);font-size:20px;line-height:1.1;color:${isBan ? '#ff8a8a' : teamCol}">${s.label}</span>
      <span style="font-size:12px;color:var(--dim);white-space:nowrap">${WATCH2V2_TEAMS[s.team]}队 · ${isBan ? '禁用侠客' : '挑选侠客'}</span>
    </div>`;
  }).join('');
}

// 进入 2v2 禁选：切到 #bp 选人界面，由 bpTick 驱动的天道 AI 逐步完成 6 手禁选。
function startWatch2v2Draft() {
  initAudio();
  ensurePortraits();
  chatClear();
  BP = null;
  watch2v2Bp = {
    step: 0,
    bans: [-1, -1],
    picks: [[-1, -1], [-1, -1]],
    draft: [-1, -1, -1, -1, -1, -1],
    last: -1,
    t: WATCH2V2_STEP_DELAY,
  };
  bpMode = 'watch2v2';
  bpSel = -1; bpHover = -1;
  showScreen('bp');
  renderBP();
}

// 天道 AI 的选人逻辑：禁选永远从“未被禁、未被选”的侠客里挑，保证 6 个席位互不重复；
// 选人时优先拿能克制敌方已选阵容的侠客，禁用时优先封掉能克制自家已选阵容的侠客。
function watch2v2AiChoice(step) {
  const st = watch2v2Bp;
  const used = new Set();
  for (const b of st.bans) if (b >= 0) used.add(b);
  for (const side of st.picks) for (const i of side) if (i >= 0) used.add(i);
  const avail = CHARS.map((_, i) => i).filter(i => !used.has(i));
  if (!avail.length) return 0;
  if (step.type === 'pick') {
    // 打分选人：克制对面 +3、被对面克制 -2.5、和队友招式定位互补（近身配远程）+1.5，再加一点随机避免每局同一套
    const foes = st.picks[1 - step.team].filter(i => i >= 0).map(i => CHARS[i]);
    const mates = st.picks[step.team].filter(i => i >= 0).map(i => CHARS[i]);
    const role = ch => (typeof AI_KIT !== 'undefined' && AI_KIT[ch.skill] && AI_KIT[ch.skill].role) || 'rush';
    const ranged = r => r === 'proj' || r === 'trap' || r === 'zone';
    let best = avail[0], bestS = -Infinity;
    for (const i of avail) {
      const ch = CHARS[i];
      let s = Math.random() * 1.6;
      for (const f of foes) {
        if ((ch.beats || []).includes(f.id)) s += 3;
        if ((f.beats || []).includes(ch.id)) s -= 2.5;
      }
      for (const m of mates) if (ranged(role(m)) !== ranged(role(ch))) s += 1.5;
      if (s > bestS) { bestS = s; best = i; }
    }
    return best;
  } else {
    const mine = st.picks[step.team].filter(i => i >= 0).map(i => CHARS[i].id);
    if (mine.length) {
      const threats = avail.filter(i => mine.some(id => (CHARS[i].beats || []).includes(id)));
      if (threats.length && Math.random() < 0.7) return threats[(Math.random() * threats.length) | 0];
    }
  }
  return avail[(Math.random() * avail.length) | 0];
}

function watch2v2ApplyStep() {
  const st = watch2v2Bp;
  const step = WATCH2V2_STEPS_ORDER[st.step];
  const i = watch2v2AiChoice(step);
  st.draft[st.step] = i;
  if (step.type === 'ban') {
    st.bans[step.team] = i;
    SFX.thud();
  } else {
    const slots = st.picks[step.team];
    const slotIdx = step.slot !== undefined ? step.slot : slots.findIndex(v => v < 0);
    slots[slotIdx < 0 ? slots.length - 1 : slotIdx] = i;
    SFX.block();
  }
  st.last = i;
  st.step++;
  st.t = st.step >= WATCH2V2_STEPS_ORDER.length ? WATCH2V2_FINISH_DELAY : WATCH2V2_STEP_DELAY;
  bpSel = i;
  renderBP();
}

function bpTickWatch2v2(dt) {
  const st = watch2v2Bp;
  if (!st) return;
  const scr = $id('bp');
  if (!scr || !scr.classList.contains('on')) { watch2v2Bp = null; return; }
  st.t -= dt;
  if (st.t > 0) return;
  if (st.step >= WATCH2V2_STEPS_ORDER.length) {
    const draft = st.draft.slice();
    watch2v2Bp = null;
    showPop(null);
    startWatch2v2(draft);
    return;
  }
  watch2v2ApplyStep();
}

// 2v2 禁选界面的绘制：沿用 #bp 的骨架（双方席位 / 中央步骤 / 英雄网格 / 详情 / 招式速览 / 底栏），
// 只把槽位扩成每队 1 禁 2 选，并把操作全部交给 AI。
function renderBPWatch2v2() {
  const st = watch2v2Bp;
  if (!st) return;
  const total = WATCH2V2_STEPS_ORDER.length;
  const done = st.step >= total;
  const step = done ? null : WATCH2V2_STEPS_ORDER[st.step];
  const teamCol = sd => (sd === 0 ? 'var(--p1)' : 'var(--p2)');
  const active = sd => !done && step.team === sd;
  $id('bpChat').classList.add('hidden');
  // 步骤名里已经带上了队名（苍龙禁 / 赤凤先锋），标题不再重复一遍
  const stepTeam = done ? '' : WATCH2V2_TEAMS[step.team];
  $id('bpStep').innerHTML = (done ? '禁选完成 · 演武即将开始'
    : (step.label.startsWith(stepTeam) ? step.label : `${stepTeam} · ${step.label}`))
    + `<span class="bpcount">${done ? `6 / ${total} 步` : `第 ${st.step + 1} / ${total} 步`}</span>`;
  $id('bpStep').style.color = done ? 'var(--gold)' : teamCol(step.team);
  $id('bpTime').textContent = done ? '' : (st.last >= 0 ? `上一手 · ${CHARS[st.last].name}` : '天道 AI 演算中');
  $id('bpTime').classList.remove('urgent');
  for (const sd of [0, 1]) {
    const banActive = active(sd) && step.type === 'ban';
    const pickActive = active(sd) && step.type === 'pick';
    const pickNum = pickActive ? st.picks[sd].filter(i => i >= 0).length : -1;
    const slot = (idx, kind, on, lab) => `<div class="slot2 ${kind}${on ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${lab}${CHARS[idx].name}</span>` : lab}</div>`;
    const slotsHtml = slot(st.bans[sd], 'ban', banActive, '禁 ')
      + slot(st.picks[sd][0], 'pick', pickActive && pickNum === 0, '选1 ')
      + slot(st.picks[sd][1], 'pick', pickActive && pickNum === 1, '选2 ');
    $id('bpS' + sd).innerHTML = `<div class="who" style="color:${teamCol(sd)}">${WATCH2V2_TEAMS[sd]}队${active(sd) ? ' · 行动中' : ''}</div>
      <div class="slots">${slotsHtml}</div>`;
  }
  $id('bpGrid').innerHTML = CHARS.map((c, i) => {
    const banned = st.bans.includes(i);
    const pickedBy = st.picks.findIndex(p => p.includes(i));
    const isLast = st.last === i;
    const tag = banned ? '<span class="tag">禁</span>'
      : pickedBy >= 0 ? `<span class="tag p" style="background:${pickedBy === 0 ? '#2b6f86' : '#8a5a1e'}">${WATCH2V2_TEAMS[pickedBy]}</span>` : '';
    const state = banned ? '，已禁用' : pickedBy >= 0 ? `，已被${WATCH2V2_TEAMS[pickedBy]}队选择` : '，等待天道 AI 选择';
    return `<button class="bpcard${banned ? ' banned' : ''}${pickedBy >= 0 ? ' picked' : ''}${isLast ? ' sel' : ''}" data-i="${i}" type="button" aria-label="${c.name}，${c.role}${state}" aria-disabled="true"${isLast ? ' style="opacity:1"' : ''}>
      ${tag}<img src="${PORTRAITS[i] || ''}" alt=""><div class="nm" style="color:rgb(${c.look.slash})">${c.name}</div><div class="rl">${c.role}</div></button>`;
  }).join('');
  const show = bpHover >= 0 ? bpHover : (st.last >= 0 ? st.last : 0);
  setDetail(show);
  const goB = $id('bpGo');
  goB.disabled = true;
  goB.textContent = done ? '演武即将开始…' : '天道 AI 自动禁选';
}

// 禁选结束后按 [苍龙禁, 赤凤禁, 苍龙先, 赤凤先, 赤凤次, 苍龙次] 的阵容真正开打。
function startWatch2v2(draft) {
  if (p2pActive()) netDropWaiting();
  initAudio();
  refocusGame();
  paused = false;
  human[0].rec = null;
  REC.on = false;
  if (Array.isArray(draft) && draft.length === 6) watch2v2Draft = [...draft];
  const [ban0, ban1, t1a, t2a, t2b, t1b] = watch2v2Draft;
  M.mode = 'watch2v2';
  M.watchAi = true;
  M.level = 'god';
  M.bans = [ban0, ban1];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  A.setChar(t1a); C.setChar(t1b);
  B.setChar(t2a); D.setChar(t2b);
  A.ctrl = new AICtrl('god'); C.ctrl = new AICtrl('god');
  B.ctrl = new AICtrl('god'); D.ctrl = new AICtrl('god');
  A.meter = B.meter = C.meter = D.meter = 35;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  showScreen(null);
  startRound();
  say(`天道 2v2 · 禁选 ${CHARS[ban0].name} & ${CHARS[ban1].name}`, 1.4);
}

const watch2v2StartBtn = document.getElementById('watch2v2StartBtn');
if (watch2v2StartBtn) watch2v2StartBtn.addEventListener('click', () => startWatch2v2Draft());

// ======================= 2v2 演武与组队 (P&CvC&C, P&PvC&C, P&PvP&P) =======================
let solo2v2Level = 'normal';   // 对战页 2v2「单人出战」选的电脑境界

function start2v2PlayerMatch(p1 = 0, mate = 2, foe1 = 1, foe2 = 3, level = 'normal') {
  if (p2pActive()) netDropWaiting();
  initAudio(); refocusGame(); paused = false; human[0].rec = null; REC.on = false;
  M.mode = '2v2';
  M.subMode = 'pc_cc';
  M.watchAi = false;
  M.level = level;
  M.bans = [];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  A.setChar(p1); C.setChar(mate);
  B.setChar(foe1); D.setChar(foe2);
  A.ctrl = human[0];
  C.ctrl = new AICtrl(level);
  B.ctrl = new AICtrl(level);
  D.ctrl = new AICtrl(level);
  A.meter = B.meter = C.meter = D.meter = 35;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  showScreen(null);
  startRound();
  say(`2v2 组队 · 【${CHARS[p1].name} + ${CHARS[mate].name}】开战！`, 1.4);
}

function start2v2LocalCoop(p1 = 0, p2 = 2, foe1 = 1, foe2 = 3, level = 'normal') {
  if (p2pActive()) netDropWaiting();
  initAudio(); refocusGame(); paused = false; human[0].rec = null; REC.on = false;
  M.mode = '2v2';
  M.subMode = 'pp_cc';
  M.watchAi = false;
  M.level = level;
  M.bans = [];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  A.setChar(p1); C.setChar(p2);
  B.setChar(foe1); D.setChar(foe2);
  A.ctrl = human[0]; // 1P
  C.ctrl = human[1]; // 2P
  B.ctrl = new AICtrl(level);
  D.ctrl = new AICtrl(level);
  A.meter = B.meter = C.meter = D.meter = 35;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  showScreen(null);
  startRound();
  say(`双人共斗 · 【${CHARS[p1].name} & ${CHARS[p2].name}】同心破天道！`, 1.4);
}

function start2v2LocalVs(p1 = 0, p2 = 2, p3 = 1, p4 = 3) {
  if (p2pActive()) netDropWaiting();
  initAudio(); refocusGame(); paused = false; human[0].rec = null; REC.on = false;
  M.mode = '2v2';
  M.subMode = 'pp_pp';
  M.watchAi = false;
  M.level = 'god';
  M.bans = [];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  A.setChar(p1); C.setChar(p2);
  B.setChar(p3); D.setChar(p4);
  A.ctrl = human[0]; // 1P
  C.ctrl = human[1]; // 2P
  B.ctrl = human[2] || new AICtrl('god'); // 3P
  D.ctrl = human[3] || new AICtrl('god'); // 4P
  A.meter = B.meter = C.meter = D.meter = 35;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  showScreen(null);
  startRound();
  say(`2v2 四人对决 · 苍龙 vs 赤凤！`, 1.4);
}

// 联机大厅 2v2 弹窗交互
let active2v2ModalMode = 'pp_cc';
function open2v2Modal(mode) {
  active2v2ModalMode = mode;
  const modal = document.getElementById('modal2v2');
  if (!modal) return;
  modal.classList.remove('hidden');
  const t = document.getElementById('modal2v2Title');
  const desc = document.getElementById('modal2v2Desc');
  const ldesc = document.getElementById('modal2v2LocalDesc');
  const solo = mode === 'pc_cc', opts = document.getElementById('modal2v2Options'), soloEl = document.getElementById('modal2v2Solo');
  if (opts) opts.hidden = solo;
  if (soloEl) soloEl.hidden = !solo;
  modal.classList.toggle('solo', solo);
  if (solo) {
    if (t) t.textContent = '2v2 单人出战 · 人机协同 (你 + 电脑队友 vs 双电脑)';
    if (desc) desc.textContent = '你操控一位侠客，再配一位电脑队友，对阵两位电脑。选好电脑的境界，进点将台禁选：';
    for (const b of document.querySelectorAll('#solo2v2Levels button[data-lv]')) b.classList.toggle('sel', b.dataset.lv === solo2v2Level);
  } else if (mode === 'pp_cc') {
    if (t) t.textContent = '2v2 双人破阵 · 模式选择 (双人同袍 vs 双天道)';
    if (desc) desc.textContent = '双人成行，同队迎战两名天道 AI 宗师！选择加入方式：';
    if (ldesc) ldesc.textContent = '同台电脑双人合作（1P: WASD+鼠标/J，2P: 方向键+K）。';
  } else {
    if (t) t.textContent = '2v2 四方争锋 · 模式选择 (2位玩家 vs 2位玩家)';
    if (desc) desc.textContent = '两队四名侠客，同台竞技对决！选择加入方式：';
    if (ldesc) ldesc.textContent = '同台电脑四人对决（1P/2P 苍龙队，3P/4P 赤凤队）。';
  }
}

// 单人模式 2v2 演武子模式与境界状态
let single2v2SubMode = 'pc_cc'; // 'pc_cc' (单人出战), 'pp_cc' (双人同袍), 'pp_pp' (四人切磋), 'watch' (天道观战)
let single2v2Level = 'normal';

function renderSingle2v2() {
  const modesEl = document.getElementById('single2v2Modes');
  if (modesEl) {
    const btns = {
      pc_cc: document.getElementById('single2v2SoloBtn'),
      pp_cc: document.getElementById('single2v2LocalCoopBtn'),
      pp_pp: document.getElementById('single2v2LocalVsBtn'),
      watch: document.getElementById('single2v2WatchTabBtn')
    };
    for (const [k, btn] of Object.entries(btns)) {
      if (btn) {
        btn.classList.toggle('sel', single2v2SubMode === k);
        btn.style.borderColor = single2v2SubMode === k ? 'var(--gold)' : 'rgba(255,255,255,0.12)';
        btn.style.background = single2v2SubMode === k ? 'rgba(233,196,106,0.12)' : 'rgba(255,255,255,0.04)';
      }
    }
  }
  const lvWrap = document.getElementById('single2v2LevelWrap');
  if (lvWrap) {
    lvWrap.style.display = (single2v2SubMode === 'pc_cc' || single2v2SubMode === 'pp_cc') ? 'block' : 'none';
    for (const b of document.querySelectorAll('#single2v2Levels button[data-lv]')) {
      b.classList.toggle('sel', b.dataset.lv === single2v2Level);
    }
  }
  const watchSteps = document.getElementById('single2v2WatchSteps');
  if (watchSteps) {
    watchSteps.style.display = single2v2SubMode === 'watch' ? 'block' : 'none';
    if (single2v2SubMode === 'watch') renderWatch2v2();
  }
  const actBtn = document.getElementById('single2v2ActionBtn');
  if (actBtn) {
    if (single2v2SubMode === 'watch') {
      actBtn.textContent = '开启天道 2v2 演武 · 纯观战 (4机对决)';
      actBtn.className = 'go btn-watch';
    } else if (single2v2SubMode === 'pc_cc') {
      actBtn.textContent = '单人出战 · 进入 2v2 点将台';
      actBtn.className = 'go';
    } else if (single2v2SubMode === 'pp_cc') {
      actBtn.textContent = '双人破阵 · 进入本地同袍点将台';
      actBtn.className = 'go';
    } else {
      actBtn.textContent = '四人切磋 · 进入本地四方点将台';
      actBtn.className = 'go';
    }
  }
}

// 绑定单人页 2v2 交互事件
const single2v2SoloBtn = document.getElementById('single2v2SoloBtn');
if (single2v2SoloBtn) single2v2SoloBtn.addEventListener('click', () => { single2v2SubMode = 'pc_cc'; renderSingle2v2(); SFX.slice(); });
const single2v2LocalCoopBtn = document.getElementById('single2v2LocalCoopBtn');
if (single2v2LocalCoopBtn) single2v2LocalCoopBtn.addEventListener('click', () => { single2v2SubMode = 'pp_cc'; renderSingle2v2(); SFX.slice(); });
const single2v2LocalVsBtn = document.getElementById('single2v2LocalVsBtn');
if (single2v2LocalVsBtn) single2v2LocalVsBtn.addEventListener('click', () => { single2v2SubMode = 'pp_pp'; renderSingle2v2(); SFX.slice(); });
const single2v2WatchTabBtn = document.getElementById('single2v2WatchTabBtn');
if (single2v2WatchTabBtn) single2v2WatchTabBtn.addEventListener('click', () => { single2v2SubMode = 'watch'; renderSingle2v2(); SFX.slice(); });

const single2v2LevelsEl = document.getElementById('single2v2Levels');
if (single2v2LevelsEl) {
  single2v2LevelsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-lv]');
    if (!b) return;
    single2v2Level = b.dataset.lv;
    renderSingle2v2();
    SFX.slice();
  });
}

const single2v2ActionBtn = document.getElementById('single2v2ActionBtn');
if (single2v2ActionBtn) {
  single2v2ActionBtn.addEventListener('click', () => {
    initAudio();
    paused = false;
    if (single2v2SubMode === 'watch') {
      startWatch2v2Draft();
    } else {
      bpStart('2v2', { subMode: single2v2SubMode, level: single2v2Level });
    }
  });
}

const mm2v2LobbyRoomBtn = document.getElementById('mm2v2LobbyRoomBtn');
if (mm2v2LobbyRoomBtn) {
  mm2v2LobbyRoomBtn.addEventListener('click', () => {
    netRoomMode = 'pp_cc';
    setRoomModeUI(netRoomMode);
    if ($id('roomWrap')) {
      $id('roomWrap').classList.remove('hidden');
      $id('mmRoomBtn').classList.add('sel');
    }
    const hb = $id('hostBtn');
    if (hb) hb.click();
    toast('已进入 2v2 联机房间');
  });
}

const mm2v2CoopBtn = document.getElementById('mm2v2CoopBtn');
if (mm2v2CoopBtn) mm2v2CoopBtn.addEventListener('click', () => open2v2Modal('pp_cc'));

const mm2v2VsBtn = document.getElementById('mm2v2VsBtn');
if (mm2v2VsBtn) mm2v2VsBtn.addEventListener('click', () => open2v2Modal('pp_pp'));

const modal2v2Close = document.getElementById('modal2v2Close');
if (modal2v2Close) modal2v2Close.addEventListener('click', () => {
  const modal = document.getElementById('modal2v2');
  if (modal) modal.classList.add('hidden');
});

const btn2v2GoMatch = document.getElementById('btn2v2GoMatch');
if (btn2v2GoMatch) {
  btn2v2GoMatch.addEventListener('click', () => {
    const modal = document.getElementById('modal2v2');
    if (modal) modal.classList.add('hidden');
    mmGo(active2v2ModalMode === 'pp_cc' ? '2v2_coop' : '2v2_vs');
  });
}

const btn2v2GoWatch = document.getElementById('btn2v2GoWatch');
if (btn2v2GoWatch) {
  btn2v2GoWatch.addEventListener('click', () => {
    const modal = document.getElementById('modal2v2');
    if (modal) modal.classList.add('hidden');
    startWatch2v2Draft();
  });
}

const btn2v2GoOnline = document.getElementById('btn2v2GoOnline');
if (btn2v2GoOnline) {
  btn2v2GoOnline.addEventListener('click', () => {
    const modal = document.getElementById('modal2v2');
    if (modal) modal.classList.add('hidden');
    netRoomMode = active2v2ModalMode;
    setRoomModeUI(netRoomMode);
    if ($id('roomWrap')) {
      $id('roomWrap').classList.remove('hidden');
      $id('mmRoomBtn').classList.add('sel');
    }
    const hb = $id('hostBtn');
    if (hb) hb.click();
    toast(`已创建 ${active2v2ModalMode === 'pp_cc' ? '双人共斗' : '2v2 组队'} 房间，请将 4 位密令分享给好友`);
  });
}

const btn2v2GoLocal = document.getElementById('btn2v2GoLocal');
if (btn2v2GoLocal) {
  btn2v2GoLocal.addEventListener('click', () => {
    const modal = document.getElementById('modal2v2');
    if (modal) modal.classList.add('hidden');
    bpStart('2v2', { subMode: active2v2ModalMode || 'pp_cc', level: 'normal' });
  });
}

function go() { initAudio(); paused = false; bpStart('cpu'); }
document.getElementById('goBtn').addEventListener('click', go);
const cpuTutBtn = document.getElementById('cpuTutBtn');
if (cpuTutBtn) cpuTutBtn.addEventListener('click', () => { initAudio(); startTutorial(); });
document.getElementById('againBtn').addEventListener('click', () => {
  if (M.mode === 'boss') { M.mode = 'demo'; openGboss(); startMatch('demo'); return; }   // 天魔讨伐：回讨伐页看结果
  if (isAiVsAi() || M.watchAi || (M.mode === 'watch2v2' && M.watchAi)) return;
  if (M.mode === 'net' && NET.isRanked) return;   // 排位赛没有再来一场
  if (M.mode === 'net') {
    if (!NET.open) {
      toast('网络已断开');
      return;
    }
    if (NET.role === 'host') {
      const duo = M.duo ? JSON.parse(JSON.stringify(M.duo)) : null;   // 各选 2 人的对局：同阵容再战，从各自第一人打起
      const picks = (netRoomMode === 'pp_cc' || netRoomMode === 'pp_pp') ? [A.chIdx, B.chIdx, C.chIdx, D.chIdx] : duo ? [duo[0][0], duo[1][0]] : [A.chIdx, B.chIdx];
      const seed = (Math.random() * 2147483647) | 0;
      send({ sys: 'rematch', action: 'start' });
      send({ rstart: duo ? { ch: picks, seed, duo } : { ch: picks, seed } });
      rollStart(picks, seed, duo);
    } else {
      send({ sys: 'rematch', action: 'ask' });
      toast('已向房主发送再战请求');
    }
    return;
  }
  if (M.mode === '2v2' || (M.mode === 'watch2v2' && !M.watchAi)) {
    bpStart('2v2', { subMode: M.subMode || 'pc_cc', level: M.level || 'normal' });
    return;
  }
  if (M.mode === 'watch2v2') {
    startWatch2v2Draft();
    return;
  }
  if (M.mode === 'mayhem') {
    bpStart('mayhem', { level: mayhemLevel, isWatch: false });
    return;
  }
  if (M.mode === 'tag3') {
    bpStart('tag3', { level: tag3Level, isWatch: false });
    return;
  }
  if (M.mode === 'tower') {
    bpStart('tower', { isWatch: false });
    return;
  }
  if (M.mode === 'chaos') {
    bpStart('chaos', { level: chaosLevel, isWatch: false });
    return;
  }
  if (M.mode === 'cpu' && M.quick) {   // 从首页直接开打的：同一个角色、同一个难度，换个随机对手再来
    menuLock = false;
    heroQuickFight(M.level);
    return;
  }
  bpStart('cpu');
});

const netRepickBtnEl = document.getElementById('netRepickBtn');
if (netRepickBtnEl) {
  netRepickBtnEl.addEventListener('click', () => {
    if (M.mode !== 'net' || !NET.open) return;
    if (NET.role === 'host') {
      send({ sys: 'rematch', action: 'repick' });
      bpStart('net');
    } else {
      send({ sys: 'rematch', action: 'repick' });
      toast('已请求重新选人');
    }
  });
}
document.getElementById('resumeBtn').addEventListener('click', () => { paused = false; showScreen(null); refocusGame(); });
document.getElementById('pause').addEventListener('click', e => {
  if (e.target === document.getElementById('pause')) {
    paused = false;
    showScreen(null);
    refocusGame();
  }
});
function toMenu() {
  ROLL.on = false; REC.on = false;
  if (REPLAY.on) { REPLAY.on = false; $id('rpBar').classList.add('hidden'); }
  if (FOREST.on) { FOREST.on = false; FOREST.mons = []; FOREST.shots = []; B.forestProxy = false; B.hidden = false; }
  M.stage = null;
  if (TUT) endTutorial();
  paused = false; BP = null; watch2v2Bp = null; B.dummy = false; if (M.mode === 'net' || bpMode === 'net') netLeave(); bpMode = 'cpu';
  const prevMode = M.mode;
  if (prevMode === 'tower') saveTowerRun();
  if (prevMode === 'boss') gbossQuit();   // 打到一半退出：已经打出的伤害照样交
  M.mode = 'demo';
  if (prevMode === 'boss') openGboss();
  else if (prevMode === 'tag3' || prevMode === 'tower' || prevMode === 'chaos' || prevMode === 'mayhem' || prevMode === 'watch2v2') {
    singleSec(prevMode);
    showScreen('single');
  } else {
    showScreen('menu');
  }
  if (prevMode !== 'demo') startMatch('demo');   // 首页背景那场比武本来就还在打，别重新摆一次
}
document.getElementById('quitBtn').addEventListener('click', toMenu);
document.getElementById('menuBtn').addEventListener('click', toMenu);

// ======================= 选人时聊天和表情 =======================
const FACE = (inner, fill = '#f4ead5') => `<svg viewBox="0 0 48 48"><circle cx="24" cy="25" r="19" fill="${fill}" stroke="#1a1426" stroke-width="2.6"/>${inner}</svg>`;
const SEAL = (a, b) => `<svg viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="4" fill="#b8392e" transform="rotate(-4 24 24)"/><rect x="9" y="9" width="30" height="30" rx="2" fill="none" stroke="rgba(255,240,225,.6)" stroke-width="1.4" transform="rotate(-4 24 24)"/><text x="24" y="23" font-family="Ma Shan Zheng, STKaiti, KaiTi, serif" font-size="15" fill="#fbeee0" text-anchor="middle">${a}</text><text x="24" y="38" font-family="Ma Shan Zheng, STKaiti, KaiTi, serif" font-size="15" fill="#fbeee0" text-anchor="middle">${b}</text></svg>`;
const K = 'stroke="#1a1426" stroke-width="2.4" fill="none" stroke-linecap="round"';
const EMOTES = [
  { id: 'hi', name: '你好', svg: FACE(`<path d="M15 23q3-4 6 0M27 23q3-4 6 0" ${K}/><path d="M17 31q7 6 14 0" ${K}/><circle cx="13" cy="29" r="3" fill="#f2a1a1"/><circle cx="35" cy="29" r="3" fill="#f2a1a1"/>`) },
  { id: 'haha', name: '哈哈', svg: FACE(`<path d="M14 22q4-5 7 0M27 22q4-5 7 0" ${K}/><path d="M15 28h18q-2 11-9 11t-9-11z" fill="#7a1f2a" stroke="#1a1426" stroke-width="2"/><path d="M11 20q-3 6 1 8" stroke="#6fc3ff" stroke-width="3" fill="none" stroke-linecap="round"/>`) },
  { id: 'cry', name: '呜呜', svg: FACE(`<path d="M15 22h6M27 22h6" ${K}/><path d="M18 24v13M30 24v13" stroke="#6fc3ff" stroke-width="3.2" stroke-linecap="round"/><path d="M19 35q5-4 10 0" ${K}/>`) },
  { id: 'angry', name: '生气', svg: FACE(`<path d="M14 18l8 4M34 18l-8 4" ${K}/><circle cx="19" cy="25" r="2.2" fill="#1a1426"/><circle cx="29" cy="25" r="2.2" fill="#1a1426"/><path d="M17 35q7-5 14 0" ${K}/><path d="M35 9l3 3m0-3l-3 3" stroke="#b8392e" stroke-width="2.4" stroke-linecap="round"/>`, '#ffc7b8') },
  { id: 'shock', name: '震惊', svg: FACE(`<circle cx="18" cy="23" r="4.5" fill="#fff" stroke="#1a1426" stroke-width="2"/><circle cx="30" cy="23" r="4.5" fill="#fff" stroke="#1a1426" stroke-width="2"/><circle cx="18" cy="23" r="1.6" fill="#1a1426"/><circle cx="30" cy="23" r="1.6" fill="#1a1426"/><ellipse cx="24" cy="34" rx="3.5" ry="4.5" fill="#1a1426"/>`) },
  { id: 'cool', name: '淡定', svg: FACE(`<path d="M11 21h26v3q-1 5-6 5t-6-5h-2q-1 5-6 5t-6-5z" fill="#1a1426"/><path d="M19 34q7 3 11-2" ${K}/>`) },
  { id: 'fight', name: '来战', svg: SEAL('来', '战') },
  { id: 'gg', name: '好局', svg: SEAL('好', '局') },
  { id: 'bow', name: '承让', svg: SEAL('承', '让') },
];
const EMO = Object.fromEntries(EMOTES.map(e => [e.id, e]));
let chatLastT = 0;
function chatClear() { $id('chatLog').innerHTML = ''; for (const b of document.querySelectorAll('.bubble')) b.remove(); }
function chatAdd(side, c) {
  const log = $id('chatLog'), mine = side === bpMySide();
  const who = mine ? '你' : bpSideName(side), col = side === 0 ? 'var(--p1)' : 'var(--p2)';
  const body = c.k === 'e' && EMO[c.v] ? `<span class="emo" title="${EMO[c.v].name}">${EMO[c.v].svg}</span>` : `<span>${escapeHTML(String(c.v).slice(0, 40))}</span>`;
  const ln = document.createElement('div'); ln.className = 'ln';
  ln.innerHTML = `<span class="who" style="color:${col}">${escapeHTML(who)}</span>${body}`;
  log.appendChild(ln); log.scrollTop = log.scrollHeight;
  const box = $id('bpS' + side); if (!box) return;
  for (const b of box.querySelectorAll('.bubble')) b.remove();
  const bb = document.createElement('div'); bb.className = 'bubble'; bb.innerHTML = body; box.appendChild(bb);
  setTimeout(() => bb.remove(), 3200);
}
function chatSend(c) {
  if (bpMode !== 'net' || !NET.open) return;
  const now = performance.now(); if (now - chatLastT < 700) return; chatLastT = now;
  send({ chat: c }); chatAdd(bpMySide(), c); sTone(700, 900, 0.08, 0.04);
}
function chatRecv(c) {
  if (!c || (c.k !== 't' && c.k !== 'e')) return;
  chatAdd(1 - bpMySide(), c); sTone(900, 700, 0.1, 0.05);
}
$id('emoBar').innerHTML = EMOTES.map(e => `<button data-e="${e.id}" title="${e.name}" aria-label="${e.name}">${e.svg}</button>`).join('');
$id('emoBar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) chatSend({ k: 'e', v: b.dataset.e }); });
function chatSendText() { const v = $id('chatIn').value.trim(); if (!v) return; $id('chatIn').value = ''; chatSend({ k: 't', v: v.slice(0, 40) }); }
$id('chatSend').addEventListener('click', chatSendText);
$id('chatIn').addEventListener('keydown', e => { if (e.key === 'Enter') chatSendText(); });

// ======================= 禁用与选人 =======================
// 顺序：1P 禁用 → 2P 禁用 → 1P 选人 → 2P 选人。联机时由房主记录结果并同步。
const BP_STEPS = [[0, 'ban'], [1, 'ban'], [0, 'pick'], [1, 'pick']];
const BP_DUO_STEPS = [[0, 'ban'], [1, 'ban'], [0, 'pick'], [1, 'pick'], [1, 'pick'], [0, 'pick']];   // 联机对战：各禁 1 人、各选 2 人
const bpSteps = () => (BP && BP.steps) || BP_STEPS;
const isMultiPickBP = () => !!(BP && Array.isArray(BP.picks) && Array.isArray(BP.picks[0]));
const isLocalBothHumanBP = () => bpMode === '2v2' && !!(bpCustomOpts && bpCustomOpts.subMode === 'pp_pp');
const isMyTurnBP = () => {
  if (!BP || BP.step >= bpSteps().length) return false;
  const isWatch = bpMode === 'cpuWatch' || (bpCustomOpts && bpCustomOpts.isWatch);
  if (isWatch) return false;
  if (isLocalBothHumanBP()) return true;
  return bpSteps()[BP.step][0] === bpMySide();
};
let BP = null, bpMode = 'cpu', bpSel = -1, bpHover = -1, bpCpuT = 0, bpCustomOpts = null;
const PORTRAITS = [];
