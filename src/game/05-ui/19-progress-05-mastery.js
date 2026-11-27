// ======================= 侠客连招试炼与专精成长系统 (#57) =======================
let COMBO_TRIALS = null;
function comboTrialsMap() {
  if (!COMBO_TRIALS || !Object.keys(COMBO_TRIALS).length) COMBO_TRIALS = buildComboTrials();
  return COMBO_TRIALS;
}
function heroTrials(heroId) {
  return (comboTrialsMap()[heroId] || []);
}

function masteryEnsureStore() {
  if (typeof PROF === 'undefined' || !PROF) return { mastery: {}, trials: {} };
  if (!PROF.mastery || typeof PROF.mastery !== 'object') PROF.mastery = {};
  if (!PROF.trials || typeof PROF.trials !== 'object') PROF.trials = {};
  return { mastery: PROF.mastery, trials: PROF.trials };
}

function masteryLevelForXp(xp) {
  const v = Math.max(0, Math.floor(+xp || 0));
  let lv = 1;
  for (let i = 0; i < MASTERY_LEVEL_XP.length; i++) {
    if (v >= MASTERY_LEVEL_XP[i]) lv = i + 1;
  }
  return lv;
}

function masteryInfo(heroId) {
  const { mastery, trials } = masteryEnsureStore();
  const rec = mastery[heroId] || { xp: 0, wins: 0, kos: 0 };
  const xp = Math.max(0, Math.floor(+rec.xp || 0));
  const level = masteryLevelForXp(xp);
  const curBase = MASTERY_LEVEL_XP[level - 1] || 0;
  const nextXp = level < MASTERY_LEVEL_XP.length ? MASTERY_LEVEL_XP[level] : MASTERY_LEVEL_XP[MASTERY_LEVEL_XP.length - 1];
  const progress = level >= MASTERY_LEVEL_XP.length ? 1 : clamp((xp - curBase) / Math.max(1, nextXp - curBase), 0, 1);
  const list = heroTrials(heroId);
  const trialsDone = list.filter(t => !!trials[t.id]).length;
  return {
    heroId,
    xp,
    level,
    title: MASTERY_TITLES[level - 1] || MASTERY_TITLES[0],
    nextXp,
    progress,
    wins: Math.max(0, Math.floor(+rec.wins || 0)),
    kos: Math.max(0, Math.floor(+rec.kos || 0)),
    trialsDone,
    trialsTotal: list.length,
  };
}

function masteryGrant(heroId, xpGain, opts = {}) {
  if (!heroId || !(xpGain > 0)) return null;
  const { mastery } = masteryEnsureStore();
  if (!mastery[heroId] || typeof mastery[heroId] !== 'object') mastery[heroId] = { xp: 0, wins: 0, kos: 0 };
  const rec = mastery[heroId];
  const prevLv = masteryLevelForXp(rec.xp);
  rec.xp = Math.max(0, Math.floor((+rec.xp || 0) + xpGain));
  if (opts.win) rec.wins = (+rec.wins || 0) + 1;
  if (opts.kos > 0) rec.kos = (+rec.kos || 0) + Math.floor(opts.kos);
  const nextLv = masteryLevelForXp(rec.xp);
  if (typeof saveProfile === 'function') saveProfile();
  if (nextLv > prevLv && typeof toast === 'function') {
    const ch = CHARS.find(c => c.id === heroId);
    toast(`${ch ? ch.name : heroId} 专精升至 Lv.${nextLv} · ${MASTERY_TITLES[nextLv - 1]}`);
  }
  return { prevLv, nextLv, leveledUp: nextLv > prevLv, info: masteryInfo(heroId) };
}

function masterySummary() {
  const { trials } = masteryEnsureStore();
  const rows = CHARS.map(c => ({ hero: c, ...masteryInfo(c.id) }));
  rows.sort((a, b) => b.level - a.level || b.xp - a.xp || b.trialsDone - a.trialsDone || a.hero.id.localeCompare(b.hero.id));
  const totalLevel = rows.reduce((s, r) => s + r.level, 0);
  const totalXp = rows.reduce((s, r) => s + r.xp, 0);
  const trialsTotal = CHARS.length * 3;
  const trialsDone = Object.keys(trials).filter(k => !!trials[k]).length;
  return { totalLevel, maxLevel: CHARS.length * MASTERY_LEVEL_XP.length, totalXp, trialsDone, trialsTotal, rows };
}

function masteryRecordMatch(w) {
  if (!A || !A.ch || M.mode === 'demo' || M.mode === 'train' || M.watchAi || (typeof isAiVsAi === 'function' && isAiVsAi()) || (typeof REPLAY !== 'undefined' && REPLAY.on)) return null;
  const myTeam = typeof localTeam === 'function' ? localTeam() : 0;
  const lf = typeof fighterByIdx === 'function' ? fighterByIdx(localIdx()) : A;
  if (!lf || !lf.ch) return null;
  const won = w === myTeam;
  const roundsWon = (M.wins && M.wins[myTeam]) ? M.wins[myTeam] : (won ? 1 : 0);
  const xp = (won ? 45 : 20) + roundsWon * 10;
  return masteryGrant(lf.ch.id, xp, { win: won, kos: roundsWon });
}

// ---------- 连招试炼实时追踪 ----------
const TRIAL_RUN = { active: false, heroId: '', trial: null, stepIdx: 0, done: false, lastState: '', lastMove: '' };

function trialHudRender() {
  const box = $id('trialHud');
  if (!box) return;
  const show = TRIAL_RUN.active && M.mode === 'train' && !(typeof currentScreen !== 'undefined' && currentScreen) && !paused;
  box.classList.toggle('hidden', !show);
  if (!show || !TRIAL_RUN.trial) return;
  const tr = TRIAL_RUN.trial;
  const ch = CHARS.find(c => c.id === tr.heroId);
  const stepsHtml = tr.steps.map((st, i) => {
    const cls = i < TRIAL_RUN.stepIdx || TRIAL_RUN.done ? 'is-done' : (i === TRIAL_RUN.stepIdx ? 'is-cur' : '');
    const lbl = (tr.stepLabels && tr.stepLabels[i]) || TRIAL_STEP_LABELS[st] || st;
    return `<span class="trial-step ${cls}">${i + 1}. ${escapeHTML(lbl)}</span>`;
  }).join('<span class="trial-arrow">→</span>');
  box.innerHTML = `<div class="trial-hud-head"><b>${escapeHTML(ch ? ch.name : tr.heroId)} · ${escapeHTML(tr.tierName)}试炼</b><span>${escapeHTML(tr.name)}</span><button type="button" class="ghost small" id="trialHudExit">${cvT('退出试炼')}</button></div><div class="trial-steps">${stepsHtml}</div><div class="trial-hud-foot">${TRIAL_RUN.done ? cvT('试炼已达成！可继续练习或返回选择下一阶。') : cvT('按顺序打出并命中招式即可完成试炼')}</div>`;
}

function startComboTrial(heroId, tierIdx = 0) {
  const list = heroTrials(heroId);
  const trial = list[tierIdx] || list[0];
  if (!trial) return false;
  const ci = CHARS.findIndex(c => c.id === heroId);
  if (ci < 0) return false;
  trainChar = ci;
  trainOppMode = 'dummy';
  Object.assign(dummyCfg, { act: 'stand', fixed: false, escape: false, infGuard: true, autoHeal: true });
  startTraining('dummy', false);
  if (trial.tier === 'master' && A) A.meter = 100;
  Object.assign(TRIAL_RUN, { active: true, heroId, trial, stepIdx: 0, done: false, lastState: '', lastMove: '' });
  trialHudRender();
  say(`${CHARS[ci].name} · ${trial.name}`, 1.8);
  return true;
}

function trialStop() {
  TRIAL_RUN.active = false;
  TRIAL_RUN.trial = null;
  TRIAL_RUN.stepIdx = 0;
  TRIAL_RUN.done = false;
  const box = $id('trialHud');
  if (box) box.classList.add('hidden');
}

function trialRecordAction(fighter, tag) {
  if (!TRIAL_RUN.active || TRIAL_RUN.done || !TRIAL_RUN.trial || fighter !== A) return false;
  const need = TRIAL_RUN.trial.steps[TRIAL_RUN.stepIdx];
  if (!need) return false;
  const match = (tag === need) || (need === 'light' && (tag === 'light' || tag === 'light3'));
  if (!match) return false;
  TRIAL_RUN.stepIdx++;
  if (typeof SFX !== 'undefined' && SFX.slice) SFX.slice();
  if (TRIAL_RUN.stepIdx >= TRIAL_RUN.trial.steps.length) {
    TRIAL_RUN.done = true;
    const { trials } = masteryEnsureStore();
    const firstClear = !trials[TRIAL_RUN.trial.id];
    trials[TRIAL_RUN.trial.id] = true;
    if (firstClear) {
      masteryGrant(TRIAL_RUN.heroId, TRIAL_RUN.trial.xp, {});
      if (typeof PROF !== 'undefined') {
        PROF.ink = (PROF.ink || 0) + TRIAL_RUN.trial.ink;
        if (typeof saveProfile === 'function') saveProfile();
      }
      if (typeof toast === 'function') toast(`连招试炼完成！专精 +${TRIAL_RUN.trial.xp} XP · 墨锭 +${TRIAL_RUN.trial.ink}`);
    } else if (typeof toast === 'function') {
      toast('连招试炼达成！');
    }
    if (typeof say === 'function') say('连招试炼达成！', 1.6);
    renderComboTrialsPane();
  }
  trialHudRender();
  return true;
}

function trialTickUpdate() {
  if (!TRIAL_RUN.active || M.mode !== 'train' || !A) {
    if ($id('trialHud') && !$id('trialHud').classList.contains('hidden')) $id('trialHud').classList.add('hidden');
    return;
  }
  // Observe live fighter state transitions to detect light, charge, air, skill, skill2, ult seamlessly
  const st = A.state || '';
  const mv = A.moveName || A.skill || A.sp || '';
  if (st !== TRIAL_RUN.lastState || mv !== TRIAL_RUN.lastMove) {
    TRIAL_RUN.lastState = st;
    TRIAL_RUN.lastMove = mv;
    if (st === 'attack') {
      if (mv === 'cs1' || mv === 'cs2') trialRecordAction(A, 'charge');
      else if (mv === 'a1' || mv === 'a2') trialRecordAction(A, 'air');
      else trialRecordAction(A, 'light');
    } else if (st === 'skill') {
      trialRecordAction(A, mv === A.ch.skill2 ? 'skill2' : 'skill');
    } else if (st === 'special') {
      trialRecordAction(A, 'ult');
    }
  }
  trialHudRender();
}

function renderComboTrialsPane() {
  const listEl = $id('trialList'), headEl = $id('trialHeroHead');
  if (!listEl) return;
  const ci = typeof menuHeroPick === 'function' ? menuHeroPick() : (trainChar || 0);
  const ch = CHARS[ci] || CHARS[0];
  const info = masteryInfo(ch.id);
  const { trials } = masteryEnsureStore();
  if (headEl) {
    headEl.innerHTML = `<b>${escapeHTML(ch.name)} · Lv.${info.level} ${escapeHTML(info.title)}</b><span>${cvT('试炼进度')} ${info.trialsDone}/${info.trialsTotal} · ${info.xp} XP</span>`;
  }
  const items = heroTrials(ch.id);
  listEl.innerHTML = items.map((tr, idx) => {
    const done = !!trials[tr.id];
    const stepsTxt = (tr.stepLabels || tr.steps).join(' → ');
    return `<div class="trial-card${done ? ' is-done' : ''}">
      <div class="trial-card-info">
        <div class="trial-card-top"><span class="trial-tier t-${tr.tier}">${escapeHTML(tr.tierName)}</span><b>${escapeHTML(tr.name)}</b>${done ? `<span class="trial-clear-tag">${cvT('已通关')}</span>` : ''}</div>
        <div class="trial-card-steps">${escapeHTML(stepsTxt)}</div>
        <div class="trial-card-rew">${cvT('首通奖励')}：+${tr.xp} XP · +${tr.ink} ${cvT('墨锭')}</div>
      </div>
      <button type="button" class="${done ? 'ghost' : 'go'} small" data-trial-hero="${ch.id}" data-trial-idx="${idx}">${cvT(done ? '重练' : '开始试炼')}</button>
    </div>`;
  }).join('');
}

if ($id('trialList')) {
  $id('trialList').addEventListener('click', e => {
    const b = e.target.closest('[data-trial-hero]');
    if (!b) return;
    startComboTrial(b.dataset.trialHero, +b.dataset.trialIdx || 0);
  });
}
if ($id('trialHud')) {
  $id('trialHud').addEventListener('click', e => {
    if (e.target.closest('#trialHudExit')) { trialStop(); }
  });
}
