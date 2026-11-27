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

// ---------- 连招试炼无缝进阶追踪（自动发奖、自动进下一阶、错招/超时即时反馈、单一退出按钮） ----------
const TRIAL_LINK_WINDOW = 2.8;        // 相邻招式最大衔接时间（秒）
const TRIAL_AUTO_ADVANCE_MS = 1300;   // 完成后自动进入下一阶的过渡时间（毫秒）

const TRIAL_RUN = {
  active: false,
  heroId: '',
  tierIdx: 0,
  trial: null,
  stepIdx: 0,
  done: false,
  allCleared: false,
  lastState: '',
  lastMove: '',
  lastMoveT: 0,
  lastSkillSlot: 'skill',
  actionSeq: 0,
  lastRecordedSeq: -1,
  lastRecordedTag: '',
  lastStepAt: 0,
  windowLeft: 1,
  autoTimer: 0,
  feedback: { kind: 'idle', text: '' },
};

function trialClearAutoTimer() {
  if (TRIAL_RUN.autoTimer) {
    clearTimeout(TRIAL_RUN.autoTimer);
    TRIAL_RUN.autoTimer = 0;
  }
}

function trialActiveStanceLabel(f) {
  if (!f || !f.ch) return '';
  const parts = [];
  if (f.stance === 1 && f.stanceUnlocked && typeof HERO_STANCES !== 'undefined' && HERO_STANCES[f.ch.id]) {
    parts.push(HERO_STANCES[f.ch.id].name);
  } else {
    parts.push(cvT('本式'));
  }
  if (f.relicStanceUnlocked && (f.relicStance === 1 || f.relicStance === 2)) {
    parts.push(cvT(f.relicStance === 2 ? '守境' : '攻境'));
  }
  return parts.join(' · ');
}

function trialPrepareArenaForTier(trial) {
  if (!A || !B || !trial) return;
  A.reset(STAGE_W / 2 - 150); A.face = 1;
  A.skillCD = 0; A.skill2CD = 0; A.dashCD = 0;
  const wantFull = trial.tier === 'master' || (typeof TRAIN_PRE !== 'undefined' && TRAIN_PRE.trialFullMeter);
  A.meter = wantFull ? 100 : Math.max(A.meter || 0, 40);
  if (typeof applyTrainStanceAndConditions === 'function' && typeof TRAIN_PRE !== 'undefined') {
    applyTrainStanceAndConditions(A, { stance: TRAIN_PRE.stance, fullMeter: wantFull, showHitbox: TRAIN_PRE.trialHitbox });
  }
  B.reset(STAGE_W / 2 + 80); B.face = -1;
  B.maxHp = B.hp = B.lagHp = 300;
  if (typeof projs !== 'undefined' && Array.isArray(projs)) projs.length = 0;
}

function trialStepLabel(trial, idx, fallbackTag) {
  if (trial && trial.stepLabels && trial.stepLabels[idx]) return trial.stepLabels[idx];
  const tag = fallbackTag || (trial && trial.steps && trial.steps[idx]) || '';
  return TRIAL_STEP_LABELS[tag] || tag;
}

function trialHudRender() {
  const box = $id('trialHud');
  if (!box) return;
  const show = TRIAL_RUN.active && M.mode === 'train' && !(typeof currentScreen !== 'undefined' && currentScreen) && !paused;
  box.classList.toggle('hidden', !show);
  if (!show || !TRIAL_RUN.trial) return;
  const tr = TRIAL_RUN.trial;
  const list = heroTrials(TRIAL_RUN.heroId);
  const ch = CHARS.find(c => c.id === tr.heroId);
  const info = masteryInfo(tr.heroId);
  const stanceTag = trialActiveStanceLabel(A);
  const stepsHtml = tr.steps.map((st, i) => {
    const cls = i < TRIAL_RUN.stepIdx || TRIAL_RUN.done ? 'is-done' : (i === TRIAL_RUN.stepIdx ? 'is-cur' : '');
    const lbl = trialStepLabel(tr, i, st);
    return `<span class="trial-step ${cls}">${i < TRIAL_RUN.stepIdx || TRIAL_RUN.done ? '✓ ' : `${i + 1}. `}${escapeHTML(lbl)}</span>`;
  }).join('<span class="trial-arrow">→</span>');
  const timingPct = TRIAL_RUN.stepIdx > 0 && !TRIAL_RUN.done ? Math.round(clamp(TRIAL_RUN.windowLeft, 0, 1) * 100) : 0;
  const fb = TRIAL_RUN.feedback || { kind: 'idle', text: '' };
  const footText = fb.text || (TRIAL_RUN.done
    ? cvT('试炼已达成！')
    : `${cvT('按顺序打出招式即可自动进阶')} · ${cvT('下一步')}：${trialStepLabel(tr, TRIAL_RUN.stepIdx)}`);
  box.innerHTML = `<div class="trial-hud-head">
    <div class="trial-hud-meta">
      <b>${escapeHTML(ch ? ch.name : tr.heroId)}</b>
      <span class="trial-tier t-${tr.tier}">${escapeHTML(tr.tierName)} ${TRIAL_RUN.tierIdx + 1}/${list.length}</span>
      <span class="trial-hud-xp">Lv.${info.level} · ${info.xp} XP</span>
      ${stanceTag ? `<span class="trial-hud-stance">${escapeHTML(stanceTag)}</span>` : ''}
    </div>
    <button type="button" class="trial-leave-btn" id="trialLeaveBtn">${cvT('离开测试')}</button>
  </div>
  <div class="trial-steps">${stepsHtml}</div>
  ${timingPct > 0 ? `<div class="trial-timer-bar" aria-hidden="true"><i style="width:${timingPct}%"></i></div>` : ''}
  <div class="trial-hud-foot is-${fb.kind || 'idle'}">${escapeHTML(footText)}</div>`;
}

function startComboTrial(heroId, tierIdx = 0) {
  trialClearAutoTimer();
  const list = heroTrials(heroId);
  const idx = clamp(tierIdx | 0, 0, Math.max(0, list.length - 1));
  const trial = list[idx];
  if (!trial) return false;
  const ci = CHARS.findIndex(c => c.id === heroId);
  if (ci < 0) return false;
  trainChar = ci;
  trainOppMode = 'dummy';
  Object.assign(dummyCfg, { act: 'stand', fixed: false, escape: false, infGuard: true, autoHeal: true });
  if (M.mode !== 'train' || !A || A.chIdx !== ci || !B || !B.dummy) {
    startTraining('dummy', false);
  }
  trialPrepareArenaForTier(trial);
  Object.assign(TRIAL_RUN, {
    active: true,
    heroId,
    tierIdx: idx,
    trial,
    stepIdx: 0,
    done: false,
    allCleared: false,
    lastState: A ? (A.state || '') : '',
    lastMove: A ? (A.moveName || A.skill || A.sp || '') : '',
    lastSkillSlot: 'skill',
    actionSeq: 0,
    lastRecordedSeq: -1,
    lastRecordedTag: '',
    lastStepAt: clock || 0,
    windowLeft: 1,
    feedback: { kind: 'idle', text: `${cvT('当前目标')}：${trial.name}` },
  });
  if (typeof trainInspectUpdate === 'function') trainInspectUpdate();
  if (typeof dummyBarUpdate === 'function') dummyBarUpdate();
  trialHudRender();
  say(`${CHARS[ci].name} · ${trial.tierName} ${idx + 1}/${list.length}`, 1.4);
  return true;
}

function trialAdvanceNext() {
  trialClearAutoTimer();
  if (!TRIAL_RUN.active || !TRIAL_RUN.heroId) return false;
  const list = heroTrials(TRIAL_RUN.heroId);
  const nextIdx = TRIAL_RUN.tierIdx + 1;
  if (nextIdx >= list.length) {
    TRIAL_RUN.allCleared = true;
    const info = masteryInfo(TRIAL_RUN.heroId);
    TRIAL_RUN.feedback = {
      kind: 'allclear',
      text: `${cvT('全部连招试炼已通关')}！Lv.${info.level} (${info.xp} XP) · ${cvT('点击「离开测试」返回训练场')}`,
    };
    trialHudRender();
    return false;
  }
  const nextTrial = list[nextIdx];
  trialPrepareArenaForTier(nextTrial);
  Object.assign(TRIAL_RUN, {
    tierIdx: nextIdx,
    trial: nextTrial,
    stepIdx: 0,
    done: false,
    allCleared: false,
    lastState: A ? (A.state || '') : '',
    lastMove: A ? (A.moveName || A.skill || A.sp || '') : '',
    lastSkillSlot: 'skill',
    actionSeq: 0,
    lastRecordedSeq: -1,
    lastRecordedTag: '',
    lastStepAt: clock || 0,
    windowLeft: 1,
    feedback: { kind: 'idle', text: `${cvT('已自动进入下一阶')}：${nextTrial.name}` },
  });
  trialHudRender();
  if (typeof say === 'function') say(`${nextTrial.tierName}试炼 · ${nextTrial.name}`, 1.4);
  return true;
}

function trialStop() {
  trialClearAutoTimer();
  TRIAL_RUN.active = false;
  TRIAL_RUN.trial = null;
  TRIAL_RUN.tierIdx = 0;
  TRIAL_RUN.stepIdx = 0;
  TRIAL_RUN.done = false;
  TRIAL_RUN.allCleared = false;
  TRIAL_RUN.feedback = { kind: 'idle', text: '' };
  const box = $id('trialHud');
  if (box) box.classList.add('hidden');
}

function trialLeaveTest() {
  trialStop();
  if (typeof toMenu === 'function') toMenu();
  if (typeof singleSec === 'function') singleSec('train');
  if (typeof showScreen === 'function') showScreen('single');
  if (typeof xiwuTrainingTab === 'function') xiwuTrainingTab('trials');
  renderComboTrialsPane();
}

function trialIsUtilitySkill(fighter, slot) {
  if (!fighter || !fighter.ch || typeof SKILLS === 'undefined') return false;
  const id = slot === 'skill2' ? fighter.ch.skill2 : fighter.ch.skill;
  const sk = SKILLS[id];
  if (!sk) return false;
  const hasDmg = (sk.dmg || 0) > 0 || (sk.proj && (sk.proj.dmg || 0) > 0) || (Array.isArray(sk.hits) && sk.hits.length > 0);
  const utilTypes = ['parry', 'counter', 'buff', 'drink', 'polarity', 'swap', 'clone', 'dash', 'blink', 'veil', 'stance', 'heal'];
  return !hasDmg && (utilTypes.includes(sk.kind) || utilTypes.includes(id) || /parry|counter|buff|drink|swap|clone|pol|veil|heal/i.test(id));
}

function trialClassifyHit(att, m) {
  if ((m && m.ult) || (att && att.state === 'special')) return 'ult';
  if (att && att.state === 'skill') return att.skill === att.ch.skill2 ? 'skill2' : 'skill';
  if (m && m.isProj) return m.skillSlot || TRIAL_RUN.lastSkillSlot || 'skill2';
  if (att && att.state === 'attack') {
    const mv = att.moveName || '';
    if (mv === 'cs1' || mv === 'cs2') return 'charge';
    if (mv === 'a1' || mv === 'a2') return 'air';
    return 'light';
  }
  if (m && m.skill) return TRIAL_RUN.lastSkillSlot || 'skill';
  return 'light';
}

function trialOnHit(att, def, m, opts = {}) {
  if (!TRIAL_RUN.active || TRIAL_RUN.done || !TRIAL_RUN.trial || att !== A || def !== B) return false;
  if (opts.blocked) {
    TRIAL_RUN.feedback = { kind: 'mistake', text: cvT('对手格挡了该招，请未格挡命中') };
    trialHudRender();
    return false;
  }
  const tag = trialClassifyHit(att, m);
  const seq = TRIAL_RUN.actionSeq;
  if (seq === TRIAL_RUN.lastRecordedSeq && tag === TRIAL_RUN.lastRecordedTag) return false;
  const tr = TRIAL_RUN.trial;
  const need = tr.steps[TRIAL_RUN.stepIdx];
  const prevStep = TRIAL_RUN.stepIdx > 0 ? tr.steps[TRIAL_RUN.stepIdx - 1] : '';
  if (tag === 'light' && need !== 'light' && prevStep === 'light' && TRIAL_RUN.stepIdx > 0) {
    TRIAL_RUN.lastStepAt = typeof clock === 'number' ? clock : TRIAL_RUN.lastStepAt;
    TRIAL_RUN.windowLeft = 1;
    TRIAL_RUN.lastRecordedSeq = seq;
    TRIAL_RUN.lastRecordedTag = tag;
    trialHudRender();
    return true;
  }
  return trialRecordAction(att, tag, { seq, hitConfirmed: true });
}

function trialRecordAction(fighter, tag, opts = {}) {
  if (!TRIAL_RUN.active || TRIAL_RUN.done || !TRIAL_RUN.trial || fighter !== A) return false;
  const tr = TRIAL_RUN.trial;
  const need = tr.steps[TRIAL_RUN.stepIdx];
  if (!need) return false;
  const nowT = typeof clock === 'number' ? clock : 0;
  const elapsed = TRIAL_RUN.stepIdx > 0 ? Math.max(0, nowT - (TRIAL_RUN.lastStepAt || nowT)) : 0;
  if (TRIAL_RUN.stepIdx > 0 && elapsed > TRIAL_LINK_WINDOW) {
    TRIAL_RUN.stepIdx = 0;
    TRIAL_RUN.windowLeft = 1;
    TRIAL_RUN.feedback = { kind: 'timeout', text: `${cvT('衔接超时')}（>${TRIAL_LINK_WINDOW.toFixed(1)}s）· ${cvT('请加快节奏重新起手')}` };
    trialHudRender();
    return false;
  }
  const match = (tag === need) || (need === 'light' && (tag === 'light' || tag === 'light3'));
  if (!match) {
    const gotLabel = TRIAL_STEP_LABELS[tag] || tag;
    const needLabel = trialStepLabel(tr, TRIAL_RUN.stepIdx, need);
    const wasMid = TRIAL_RUN.stepIdx > 0;
    TRIAL_RUN.stepIdx = 0;
    TRIAL_RUN.windowLeft = 1;
    TRIAL_RUN.lastRecordedSeq = opts.seq !== undefined ? opts.seq : TRIAL_RUN.actionSeq;
    TRIAL_RUN.lastRecordedTag = tag;
    TRIAL_RUN.feedback = {
      kind: 'mistake',
      text: wasMid
        ? `${cvT('招式有误')}：${gotLabel} ≠ ${needLabel}（${cvT('已重置，请重新起手')}）`
        : `${cvT('起手有误')}：${gotLabel}，${cvT('请先打出')} ${needLabel}`,
    };
    trialHudRender();
    return false;
  }
  const landedLabel = trialStepLabel(tr, TRIAL_RUN.stepIdx, need);
  TRIAL_RUN.stepIdx++;
  TRIAL_RUN.lastStepAt = nowT;
  TRIAL_RUN.windowLeft = 1;
  TRIAL_RUN.lastRecordedSeq = opts.seq !== undefined ? opts.seq : TRIAL_RUN.actionSeq;
  TRIAL_RUN.lastRecordedTag = tag;
  if (typeof SFX !== 'undefined' && SFX.slice) SFX.slice();

  if (TRIAL_RUN.stepIdx >= tr.steps.length) {
    TRIAL_RUN.done = true;
    const { trials } = masteryEnsureStore();
    const firstClear = !trials[tr.id];
    trials[tr.id] = true;
    if (firstClear) {
      masteryGrant(TRIAL_RUN.heroId, tr.xp, {});
      if (typeof PROF !== 'undefined') {
        PROF.ink = (PROF.ink || 0) + tr.ink;
        if (typeof saveProfile === 'function') saveProfile();
      }
    }
    const list = heroTrials(TRIAL_RUN.heroId);
    const hasNext = TRIAL_RUN.tierIdx + 1 < list.length;
    const rewardNote = firstClear ? `+${tr.xp} XP · +${tr.ink} ${cvT('墨锭')}` : cvT('已通关（不重复计奖）');
    TRIAL_RUN.feedback = {
      kind: hasNext ? 'clear' : 'allclear',
      text: hasNext
        ? `${cvT('连招达成')}！${rewardNote} · ${cvT('即将自动进入下一阶')}…`
        : `${cvT('全部连招试炼已通关')}！${rewardNote}`,
    };
    if (typeof toast === 'function') {
      toast(firstClear ? `连招试炼完成！专精 +${tr.xp} XP · 墨锭 +${tr.ink}` : '连招试炼达成！');
    }
    if (typeof say === 'function') say('连招试炼达成！', 1.2);
    renderComboTrialsPane();
    if (hasNext) {
      trialClearAutoTimer();
      TRIAL_RUN.autoTimer = setTimeout(() => {
        TRIAL_RUN.autoTimer = 0;
        trialAdvanceNext();
      }, TRIAL_AUTO_ADVANCE_MS);
    } else {
      TRIAL_RUN.allCleared = true;
    }
  } else {
    const nextLabel = trialStepLabel(tr, TRIAL_RUN.stepIdx);
    const timingStr = elapsed > 0.01 ? ` (${elapsed.toFixed(2)}s)` : '';
    TRIAL_RUN.feedback = {
      kind: 'hit',
      text: `${cvT('命中')}：${landedLabel}${timingStr} → ${cvT('下一步')}：${nextLabel}`,
    };
  }
  trialHudRender();
  return true;
}

function trialTickUpdate() {
  if (!TRIAL_RUN.active || M.mode !== 'train' || !A) {
    if ($id('trialHud') && !$id('trialHud').classList.contains('hidden')) $id('trialHud').classList.add('hidden');
    return;
  }
  if (TRIAL_RUN.stepIdx > 0 && !TRIAL_RUN.done && TRIAL_RUN.trial) {
    const elapsed = Math.max(0, (clock || 0) - (TRIAL_RUN.lastStepAt || 0));
    TRIAL_RUN.windowLeft = clamp(1 - elapsed / TRIAL_LINK_WINDOW, 0, 1);
    if (elapsed > TRIAL_LINK_WINDOW) {
      TRIAL_RUN.stepIdx = 0;
      TRIAL_RUN.windowLeft = 1;
      TRIAL_RUN.lastRecordedSeq = -1;
      TRIAL_RUN.lastRecordedTag = '';
      TRIAL_RUN.feedback = {
        kind: 'timeout',
        text: `${cvT('衔接超时')}（>${TRIAL_LINK_WINDOW.toFixed(1)}s）· ${cvT('请加快节奏重新起手')}`,
      };
    }
  }
  const st = A.state || '';
  const mv = st === 'attack' ? (A.moveName || '') : st === 'skill' ? (A.skill || '') : st === 'special' ? (A.sp || 'ult') : '';
  const curT = typeof A.t === 'number' ? A.t : 0;
  const restartedMove = (st === 'attack' || st === 'skill' || st === 'special') && st === TRIAL_RUN.lastState && mv === TRIAL_RUN.lastMove && curT < TRIAL_RUN.lastMoveT;
  if (st !== TRIAL_RUN.lastState || mv !== TRIAL_RUN.lastMove || restartedMove) {
    TRIAL_RUN.lastState = st;
    TRIAL_RUN.lastMove = mv;
    if (st === 'attack' || st === 'skill' || st === 'special') {
      TRIAL_RUN.actionSeq++;
      if (st === 'skill') {
        const slot = mv === A.ch.skill2 ? 'skill2' : 'skill';
        TRIAL_RUN.lastSkillSlot = slot;
        if (trialIsUtilitySkill(A, slot)) {
          trialRecordAction(A, slot, { seq: TRIAL_RUN.actionSeq, utility: true });
        }
      }
    }
  }
  TRIAL_RUN.lastMoveT = curT;
  trialHudRender();
}

function renderComboTrialsPane() {
  const listEl = $id('trialList'), headEl = $id('trialHeroHead'), pickEl = $id('trialHeroSelect');
  if (!listEl) return;
  const ci = typeof menuHeroPick === 'function' ? menuHeroPick() : (trainChar || 0);
  const ch = CHARS[ci] || CHARS[0];
  const info = masteryInfo(ch.id);
  const { trials } = masteryEnsureStore();
  if (pickEl) {
    pickEl.innerHTML = CHARS.map((c, idx) => {
      const m = masteryInfo(c.id);
      const sel = idx === ci ? ' sel' : '';
      const all = m.trialsDone >= m.trialsTotal ? ' is-all' : '';
      return `<button type="button" class="trial-hero-pill${sel}${all}" data-trial-pick="${idx}" aria-pressed="${idx === ci}"><b>${escapeHTML(c.name)}</b><small>${m.trialsDone}/${m.trialsTotal}</small></button>`;
    }).join('');
  }
  const items = heroTrials(ch.id);
  const nextUnclearIdx = items.findIndex(t => !trials[t.id]);
  const launchIdx = nextUnclearIdx >= 0 ? nextUnclearIdx : 0;
  if (headEl) {
    const pct = Math.round(info.progress * 100);
    headEl.innerHTML = `<div class="trial-head-left">
      <b>${escapeHTML(ch.name)} · Lv.${info.level} ${escapeHTML(info.title)}</b>
      <span class="trial-head-meta">${cvT('试炼进度')} ${info.trialsDone}/${info.trialsTotal} · ${info.xp}/${info.nextXp} XP</span>
      <div class="trial-xp-track"><i style="width:${pct}%"></i></div>
    </div>
    <button type="button" class="go small" data-trial-hero="${ch.id}" data-trial-idx="${launchIdx}">${cvT(nextUnclearIdx >= 0 ? '开始连招测试' : '重温全部连招')}</button>`;
  }
  listEl.innerHTML = items.map((tr, idx) => {
    const done = !!trials[tr.id];
    const isNext = idx === nextUnclearIdx;
    const stepsTxt = (tr.stepLabels || tr.steps).join(' → ');
    return `<div class="trial-card${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}">
      <div class="trial-card-info">
        <div class="trial-card-top"><span class="trial-tier t-${tr.tier}">${escapeHTML(tr.tierName)}</span><b>${escapeHTML(tr.name)}</b>${done ? `<span class="trial-clear-tag">${cvT('已通关')}</span>` : ''}</div>
        <div class="trial-card-steps">${escapeHTML(stepsTxt)}</div>
        <div class="trial-card-rew">${done ? cvT('首通奖励已领取') : `${cvT('首通奖励')}：+${tr.xp} XP · +${tr.ink} ${cvT('墨锭')}`}</div>
      </div>
      <button type="button" class="${done ? 'ghost' : 'go'} small" data-trial-hero="${ch.id}" data-trial-idx="${idx}">${cvT(done ? '重练' : '开始试炼')}</button>
    </div>`;
  }).join('');
}

if ($id('trialHeroSelect')) {
  $id('trialHeroSelect').addEventListener('click', e => {
    const b = e.target.closest('[data-trial-pick]');
    if (!b) return;
    const idx = +b.dataset.trialPick;
    if (Number.isInteger(idx) && idx >= 0 && idx < CHARS.length) {
      trainChar = idx;
      if (typeof setMenuHero === 'function') setMenuHero(idx);
      renderComboTrialsPane();
      SFX.slice && SFX.slice();
    }
  });
}
if ($id('trialHeroHead')) {
  $id('trialHeroHead').addEventListener('click', e => {
    const b = e.target.closest('[data-trial-hero]');
    if (!b) return;
    startComboTrial(b.dataset.trialHero, +b.dataset.trialIdx || 0);
  });
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
    if (e.target.closest('#trialLeaveBtn')) { trialLeaveTest(); }
  });
}
