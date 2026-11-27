// ======================= 木人训练与对手行为栏 =======================
// 本文件：木人桩：练哪位侠客、木人的特性开关、对手行为栏（稻草人做什么，见 src/data/14-dummy.js）、几种练习的开局。
let trainSubTab = 'lesson';   // 训练场当前在哪一页（AI 观战页要借用顶上的「AI 境界」条）
function xiwuTrainingTab(name) {
  trainSubTab = name;
  const tabs = document.querySelectorAll('#xiwuTrainingTabs [data-training-tab]');
  const panes = document.querySelectorAll('#single [data-training-pane]');
  for (const tab of tabs) {
    const selected = tab.dataset.trainingTab === name;
    tab.classList.toggle('sel', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const pane of panes) pane.hidden = pane.dataset.trainingPane !== name;
  if (name === 'trials' && typeof renderComboTrialsPane === 'function') renderComboTrialsPane();
  if ($id('aiLvHome') && currentSingleTab === 'train') $id('aiLvHome').hidden = name !== 'watch';
}
if ($id('xiwuTrainingTabs')) {
  $id('xiwuTrainingTabs').addEventListener('click', e => {
    const tab = e.target.closest('button[data-training-tab]');
    if (!tab) return;
    xiwuTrainingTab(tab.dataset.trainingTab);
    SFX.slice();
  });
  $id('xiwuTrainingTabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...$id('xiwuTrainingTabs').querySelectorAll('[data-training-tab]')];
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  });
  xiwuTrainingTab('lesson');
}
let trainChar = 0, trainTargetMode = 'dummy', trainOppMode = 'dummy', trainAiLevel = 'normal';
const TRAIN_AI_INFO = {
  easy: '入门 · 延迟反应、极少格挡、2段轻击，零血量/伤害膨胀，适合熟悉出招与连段起点。',
  normal: '寻常 · 标准立回、40%格挡、3段连招与基础追击，零血量/伤害膨胀，适合常规对练。',
  hard: '劲敌 · 主动抓后摇、高频率招架、4段连招与起解压制，零血量/伤害膨胀，考验攻防转换。',
  impossible: '绝顶 · 极速反应、精准弹反与连招最大化确反，完全依托 AIBrain 策略而非数值堆砌。',
  god: '天道 · 满级神经策略、读招诱骗、无缝空战追击与极致心理博弈（纯机制强度，1.0×标准血攻）。',
};
function renderTrainConfig() {
  const oppSeg = $id('trainOppSeg');
  if (oppSeg) {
    for (const b of oppSeg.querySelectorAll('button[data-topp]')) {
      const on = b.dataset.topp === trainOppMode;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  const lvWrap = $id('trainAiLvWrap');
  if (lvWrap) lvWrap.classList.toggle('is-dim', trainOppMode !== 'ai');
  const lvSeg = $id('trainAiLvSeg');
  if (lvSeg) {
    for (const b of lvSeg.querySelectorAll('button[data-tlv]')) {
      const on = b.dataset.tlv === trainAiLevel;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  const desc = $id('trainAiDesc');
  if (desc) desc.textContent = trainOppMode === 'ai' ? (TRAIN_AI_INFO[trainAiLevel] || TRAIN_AI_INFO.normal) : '木人桩模式：可精确控制对手站桩、格挡、弹反、连段与受压闪避，并实时查看帧数差与判定框。';
}
if ($id('trainOppSeg')) {
  $id('trainOppSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-topp]');
    if (!b) return;
    trainOppMode = b.dataset.topp === 'ai' ? 'ai' : 'dummy';
    renderTrainConfig();
    SFX.slice();
  });
}
if ($id('trainAiLvSeg')) {
  $id('trainAiLvSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-tlv]');
    if (!b) return;
    trainAiLevel = b.dataset.tlv;
    trainOppMode = 'ai';
    renderTrainConfig();
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
const dummyBarAvail = () => M.mode === 'train' && !!B && !FOREST.on && !TUT && !REPLAY.on && M.phase !== 'end';
function dummyBarOn() { return DB.open; }
function applyTrainOpponent() {
  if (M.mode !== 'train' || !B) return;
  if (trainOppMode === 'ai') {
    const foeIdx = (trainChar + 1) % CHARS.length;
    if (B.dummy || B.chIdx !== foeIdx) {
      B.setChar(foeIdx);
      B.dummy = false;
      B.homeX = undefined;
      B.maxHp = B.hp = B.lagHp = Math.round(((B.ch.stat && B.ch.stat.hp) || 850) * ((BAL[B.ch.id] || {}).hp || 1));
    }
    B.ctrl = new AICtrl(trainAiLevel || 'normal');
    if (typeof B.ctrl.updateTactic === 'function') B.ctrl.updateTactic(B, A);
    M.level = trainAiLevel || 'normal';
  } else {
    if (!B.dummy) {
      B.setChar(0);
      B.dummy = true;
      B.maxHp = B.hp = B.lagHp = 300;
      B.look = { ...B.look, name: '木人桩' };
    }
    B.ctrl = new DummyCtrl({ ...dummyCfg });
    B.homeX = dummyCfg.fixed ? STAGE_W / 2 : undefined;
  }
  renderTrainConfig();
  dummyBarRender();
}
function dummyBarRender() {
  const acts = $id('dummyActs'); if (!acts) return;
  const c = dummyCfg, a = DUMMY_BY[c.act] || DUMMY_BY.stand, timed = a.k === 'do';
  const oppEl = $id('dummyBarOpp');
  if (oppEl) {
    const opts = [
      { k: 'dummy', n: '木人桩' },
      { k: 'ai:easy', n: 'AI·入门' },
      { k: 'ai:normal', n: 'AI·寻常' },
      { k: 'ai:hard', n: 'AI·劲敌' },
      { k: 'ai:impossible', n: 'AI·绝顶' },
      { k: 'ai:god', n: 'AI·天道' },
    ];
    const cur = trainOppMode === 'ai' ? `ai:${trainAiLevel}` : 'dummy';
    oppEl.innerHTML = opts.map(o => `<button type="button" data-dbopp="${o.k}" class="${o.k === cur ? 'sel' : ''}" aria-pressed="${o.k === cur}">${o.n}</button>`).join('');
  }
  acts.innerHTML = DUMMY_ACTS.map(x => `<button type="button" data-act="${x.id}" class="${x.id === c.act ? 'sel' : ''}" aria-pressed="${x.id === c.act}"${trainOppMode === 'ai' ? ' disabled' : ''}><b>${x.n}</b><span>${x.d}</span></button>`).join('');
  for (const b of $id('dummyRep').querySelectorAll('button')) { const on = (b.dataset.rep === '1') === c.rep; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); b.disabled = trainOppMode === 'ai'; }
  $id('dummyGap').innerHTML = DUMMY_GAPS.map(g => `<button type="button" data-gap="${g}" class="${g === c.gap ? 'sel' : ''}" aria-pressed="${g === c.gap}"${timed && trainOppMode !== 'ai' ? '' : ' disabled'}>${g} 秒</button>`).join('');
  $id('dummyFeats').innerHTML = Object.entries(DUMMY_FEATURES).map(([k, f]) => `<button type="button" data-feat="${k}" class="${c[k] ? 'sel' : ''}" aria-pressed="${!!c[k]}"><b>${f.name}</b><span>${f.desc}</span></button>`).join('');
  $id('dummyNote').textContent = trainOppMode === 'ai' ? (TRAIN_AI_INFO[trainAiLevel] || TRAIN_AI_INFO.normal) : (a.k === 'hold' ? '这个动作会一直保持，次数和间隔不用选' : a.k === 'react' ? '这个动作看时机反应，「只做一次」就是反应一次' : '');
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
// ---------- 训练场实时状态与机制解析面板 (#trainLab) ----------
let _tlabLastDraw = 0;
function trainLogEvent(kind, title, detail = '') {
  if (!Array.isArray(TRAIN.events)) TRAIN.events = [];
  TRAIN.events.unshift({ t: clock || 0, kind, title, detail });
  if (TRAIN.events.length > 8) TRAIN.events.length = 8;
}
function trainLabFullMeter() {
  if (M.mode !== 'train' || !A) return;
  A.meter = 100;
  A.skillCD = 0; A.skill2CD = 0; A.dashCD = 0; A.feintCD = 0; A.qiParryCD = 0; A.petCD = 0; A.iaidoCD = 0; A.grappleCD = 0;
  A.guard = A.maxGuard || 100;
  A.hp = A.lagHp = A.maxHp;
  if (A.ch && A.ch.id === 'moyu') A.ink = INK_MAX;
  if (A.ch && A.ch.passive === 'drunk') A.drunk = 100;
  if (A.ch && A.ch.fly) A.flyT = A.ch.fly;
  trainLogEvent('stance', '满怒清冷', '真元已满，技能与灵宠冷却已重置');
  SFX.slice && SFX.slice();
  _tlabLastDraw = 0;
  trainLabRender(true);
}
function trainLabReset() {
  if (M.mode !== 'train' || !A || !B) return;
  A.reset(STAGE_W / 2 - 180); A.face = 1; A.meter = 0;
  const isDummy = !!B.dummy;
  B.reset(isDummy && dummyCfg.fixed ? STAGE_W / 2 : STAGE_W / 2 + 120);
  B.face = -1; B.meter = 0;
  if (isDummy) { B.maxHp = B.hp = B.lagHp = 300; }
  if (typeof applyCombatLoadouts === 'function') applyCombatLoadouts();
  Object.assign(TRAIN, { total: 0, hits: [], best: 0, bestDmg: 0, lastHitDmg: 0, maxHitDmg: 0, hitCount: 0, parries: 0, breaks: 0, events: [], advantage: null, frameProbe: null, lastBadgeT: -99, lastBadgeMsg: '', lastPetT: -99, lastStanceT: -99 });
  for (const cu of comboUI) { cu.n = 0; cu.dmg = 0; cu.t = 0; }
  projs.length = 0;
  SFX.slice && SFX.slice();
  _tlabLastDraw = 0;
  trainLabRender(true);
}
function _tlabBuffs(f) {
  const list = [];
  if (!f) return list;
  const add = (cls, text) => list.push(`<span class="tlab-chip ${cls}">${text}</span>`);
  if ((f.armorT || 0) > 0) add('buff', `霸体 ${f.armorT.toFixed(1)}s${f.armorHits > 0 ? ` (${f.armorHits}次)` : ''}`);
  if ((f.invul || 0) > 0 && f.invul < 20) add('buff', `无敌 ${f.invul.toFixed(2)}s`);
  if ((f.parryT || 0) > 0 || (f.qiParryT || 0) > 0 || (f.thunderGuardT || 0) > 0) add('buff', '弹反架势中');
  if ((f.reflectT || 0) > 0) add('buff', `反弹 ${f.reflectT.toFixed(1)}s`);
  if ((f.buffT || 0) > 0) add('buff', `增伤 +50% (${f.buffT.toFixed(1)}s)`);
  if ((f.twinT || 0) > 0) add('buff', `双风强化 ${f.twinT.toFixed(1)}s`);
  if (f.stance === 1 && f.stanceUnlocked) add('buff', `二式 · ${(HERO_STANCES[f.ch.id] || {}).name || '切换态'}`);
  if (f.relicStanceUnlocked && (f.relicStance === 1 || f.relicStance === 2)) {
    const skMeta = f.skinKey && typeof SKINS !== 'undefined' && SKINS[f.skinKey];
    const r = skMeta && skMeta.relic;
    add('buff', f.relicStance === 1 ? `攻境 · ${(r && r.stanceAtk) || '破阵'}` : `守境 · ${(r && r.stanceDef) || '镇岳'}`);
  }
  if ((f.relicCounterT || 0) > 0) add('badge', `守境反击 +10% (${f.relicCounterT.toFixed(2)}s)`);
  if ((f.badgeLinkT || 0) > 0) add('badge', `连势追步 ${f.badgeLinkT.toFixed(2)}s`);
  if ((f.badgePressureT || 0) > 0) add('badge', `凝锋压迫 ${f.badgePressureT.toFixed(2)}s`);
  if ((f.badgeRiposteT || 0) > 0) add('badge', `回锋反击 ${f.badgeRiposteT.toFixed(2)}s`);
  if ((f.badgeBreakT || 0) > 0) add('badge', `破军追击 ${f.badgeBreakT.toFixed(2)}s`);
  if ((f.badgeAirSkillT || 0) > 0) add('badge', `凌空续招 ${f.badgeAirSkillT.toFixed(2)}s`);
  if ((f.badgeExitT || 0) > 0) add('badge', `追影退步 ${f.badgeExitT.toFixed(2)}s`);
  if ((f.badgeDashT || 0) > 0) add('badge', `闪避窗口 ${f.badgeDashT.toFixed(2)}s`);
  if ((f.shadowExecT || 0) > 0) add('badge', `影落破势就绪 [R] ${f.shadowExecT.toFixed(1)}s`);
  if ((f.stun || 0) > 0) add('debuff', `硬直 ${Math.round(f.stun / STEP)}F`);
  if ((f.slowT || 0) > 0 || (f.frostSlow || 0) > 0) add('debuff', `减速 ${Math.max(f.slowT || 0, f.frostSlow || 0).toFixed(1)}s`);
  if ((f.burnT || 0) > 0) add('debuff', `灼烧 ${f.burnT.toFixed(1)}s`);
  if ((f.defDebuffT || 0) > 0) add('debuff', `破甲 ${f.defDebuffT.toFixed(1)}s`);
  if ((f.acupointT || 0) > 0) add('debuff', `点穴封脉 ${f.acupointT.toFixed(1)}s`);
  if (f.rooted) add('debuff', '定身');
  if ((f.jailT || 0) > 0) add('debuff', `禁锢 ${f.jailT.toFixed(1)}s`);
  if ((f.veilT || 0) > 0) add('debuff', `蓬莱境 ${f.veilT.toFixed(1)}s`);
  if ((f.needleMark || 0) > 0) add('debuff', `雀芒 ×${f.needleMark}`);
  if ((f.shadowMarks || 0) > 0) add('debuff', `影印 ${f.shadowMarks}/25`);
  if ((f.fu || 0) > 0) add('debuff', `符印 ×${f.fu}`);
  return list;
}
function trainLabRender(force = false) {
  const panel = $id('trainLab'), body = $id('trainLabBody');
  if (!panel || !body || !A || !B) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && nowMs - _tlabLastDraw < 65) return;
  _tlabLastDraw = nowMs;
  const heroTitle = $id('trainLabHero'), oppTag = $id('trainLabOpp');
  if (heroTitle) heroTitle.textContent = `${A.ch.name} · ${cvT('训练状态')}`;
  if (oppTag) oppTag.textContent = B.dummy ? (B.ctrl instanceof DummyCtrl ? dummyActName(B.ctrl.cfg) : '木人桩') : `AI · ${LV_NAME[trainAiLevel] || trainAiLevel}`;
  const tab = TRAIN.labTab || 'status';
  const hpPct = Math.round(clamp(A.hp / Math.max(1, A.maxHp), 0, 1) * 100);
  const furyPct = Math.round(clamp((A.meter || 0) / 100, 0, 1) * 100);
  const gMax = Math.max(1, A.maxGuard || 100);
  const gPct = Math.round(clamp((A.guard || 0) / gMax, 0, 1) * 100);
  if (tab === 'status') {
    const cdCell = (lbl, val, readyTxt = '就绪') => {
      const rdy = !(val > 0.04);
      return `<div class="tlab-cd ${rdy ? 'ready' : 'cool'}"><span>${lbl}</span><b>${rdy ? readyTxt : val.toFixed(1) + 's'}</b></div>`;
    };
    const sk1Nm = (A.ch.skillName || 'Q 技能').slice(0, 4);
    const sk2Nm = (A.ch.skill2Name || 'R 特殊').slice(0, 4);
    const ultReady = (A.meter || 0) >= 100;
    const resRows = [];
    if (A.ch.id === 'moyu') resRows.push(`<div class="tlab-bar-row"><div class="tlab-bar-meta"><span>墨韵资源</span><b>${Math.round(A.ink || 0)} / ${INK_MAX}</b></div><div class="tlab-bar res"><i style="width:${Math.round(((A.ink || 0) / INK_MAX) * 100)}%"></i></div></div>`);
    if (A.ch.passive === 'drunk') resRows.push(`<div class="tlab-bar-row"><div class="tlab-bar-meta"><span>醉意 (+${Math.round((A.drunk || 0) * 0.5)}% 伤)</span><b>${Math.round(A.drunk || 0)} / 100</b></div><div class="tlab-bar res"><i style="width:${Math.round(A.drunk || 0)}%"></i></div></div>`);
    if (A.ch.passive === 'rhythm') resRows.push(`<div class="tlab-bar-row"><div class="tlab-bar-meta"><span>音律层数</span><b>${A.notes || 0} / 3</b></div><div class="tlab-bar res"><i style="width:${Math.round(((A.notes || 0) / 3) * 100)}%"></i></div></div>`);
    if (A.ch.passive === 'magnet') resRows.push(`<div class="tlab-kv"><span>当前磁极</span><b>${A.pol > 0 ? '⊕ 正极 (高伤斥力)' : '⊖ 负极 (吸附牵引)'}</b></div>`);
    if (A.ch.fly) resRows.push(`<div class="tlab-bar-row"><div class="tlab-bar-meta"><span>滞空气力</span><b>${(A.flyT || 0).toFixed(1)} / ${A.ch.fly}s</b></div><div class="tlab-bar res"><i style="width:${Math.round(clamp((A.flyT || 0) / A.ch.fly, 0, 1) * 100)}%"></i></div></div>`);
    if (A.ch.passive === 'mist') resRows.push(`<div class="tlab-kv"><span>场上雾身 / 敌方影印</span><b>${(A.clones || []).length} 身 · ${B.shadowMarks || 0}/25 印</b></div>`);
    const myChips = _tlabBuffs(A), foeChips = _tlabBuffs(B);
    body.innerHTML = `
      <div class="tlab-sec">
        <div class="tlab-sec-h"><span>我方核心状态 (${A.state})</span><span class="tlab-pill">${A.stance ? ((HERO_STANCES[A.ch.id] || {}).name || '二式') : '本式'}</span></div>
        <div class="tlab-bar-row"><div class="tlab-bar-meta"><span>气血 HP</span><b>${Math.round(A.hp)} / ${Math.round(A.maxHp)} (${hpPct}%)</b></div><div class="tlab-bar hp"><i style="width:${hpPct}%"></i></div></div>
        <div class="tlab-bar-row"><div class="tlab-bar-meta"><span>真元 / 怒气</span><b>${Math.round(A.meter || 0)} / 100${ultReady ? ' · 奥义就绪' : ''}</b></div><div class="tlab-bar fury"><i style="width:${furyPct}%"></i></div></div>
        <div class="tlab-bar-row"><div class="tlab-bar-meta"><span>架势 Guard</span><b>${Math.round(A.guard || 0)} / ${Math.round(gMax)} (${gPct}%)</b></div><div class="tlab-bar guard"><i style="width:${gPct}%"></i></div></div>
        ${resRows.join('')}
      </div>
      <div class="tlab-sec">
        <div class="tlab-sec-h"><span>招式与机动冷却</span></div>
        <div class="tlab-cd-grid">
          ${cdCell(`Q ${sk1Nm}`, A.skillCD || 0)}
          ${cdCell(`R ${sk2Nm}`, A.skill2CD || 0)}
          <div class="tlab-cd ${ultReady ? 'ready' : 'cool'}"><span>E 奥义</span><b>${ultReady ? '满气' : furyPct + '%'}</b></div>
          ${cdCell('腾空闪', A.dashCD || 0)}
          ${cdCell('C 虚招', A.feintCD || 0)}
          ${cdCell('F 弹反', A.qiParryCD || 0)}
          ${A.petId ? cdCell('V 灵宠', A.petCD || 0) : '<div class="tlab-cd"><span>V 灵宠</span><b>未携</b></div>'}
          ${cdCell('架势', A.stanceT || 0, A.stanceUnlocked ? '可切' : '未解')}
          ${A.relicStanceUnlocked ? cdCell(A.relicStance === 2 ? '守境 [M]' : '攻境 [M]', A.relicStanceCd || 0, '可切') : ''}
        </div>
      </div>
      <div class="tlab-sec">
        <div class="tlab-sec-h"><span>当前增益 / 减益</span></div>
        <div class="tlab-chips">${myChips.length ? myChips.join('') : '<span class="tlab-chip dim">无激活中的增益或减益</span>'}</div>
      </div>
      <div class="tlab-sec">
        <div class="tlab-sec-h"><span>对手状态 (${B.state})</span><span>HP ${Math.round(B.hp)}/${Math.round(B.maxHp)} · 架势 ${Math.round(B.guard || 0)}</span></div>
        <div class="tlab-chips">${foeChips.length ? foeChips.join('') : '<span class="tlab-chip dim">对手当前无异常状态</span>'}</div>
      </div>`;
  } else if (tab === 'loadout') {
    const bSpec = A.badgeId && COMBAT_BADGES[A.badgeId];
    const bTierNames = { silver: '白银阶', gold: '黄金阶', purpgold: '紫金阶' };
    const bTierIdx = A.badgeTier === 'purpgold' ? 2 : A.badgeTier === 'gold' ? 1 : 0;
    const bActiveWin = Math.max(A.badgeLinkT || 0, A.badgePressureT || 0, A.badgeRiposteT || 0, A.badgeBreakT || 0, A.badgeAirSkillT || 0, A.badgeExitT || 0);
    const bLive = (clock - (TRAIN.lastBadgeT || -99)) < 1.8 || bActiveWin > 0;
    const pSpec = A.petId && COMBAT_PETS[A.petId];
    const pTierNames = { basic: '初阶 1.0×', spirit: '灵阶 1.25×', immortal: '仙阶 1.55×' };
    const pLive = (clock - (TRAIN.lastPetT || -99)) < 1.8;
    const stSpec = HERO_STANCES[A.ch.id];
    const stLive = (clock - (TRAIN.lastStanceT || -99)) < 1.5;
    const sm = A.skillMod || { q: 'std', r: 'std', e: 'std' };
    const modDesc = (slot, key) => {
      const m = (SKILL_MODS && SKILL_MODS[key]) || { name: '本宗', cd: 1, dmg: 1, guard: 1 };
      const fx = key === 'swift' ? '冷却 -18%，伤害 -8%' : key === 'heavy' ? '伤害 +18%，破防 +25%，冷却 +16%' : '均衡标准参数';
      return `<div class="tlab-kv"><span>${slot.toUpperCase()} 招式流派 · <b>${m.name}</b></span><span>${fx}</span></div>`;
    };
    body.innerHTML = `
      <div class="tlab-sec${bLive ? ' is-live' : ''}">
        <div class="tlab-sec-h"><span>武学徽记 · ${bSpec ? `${bSpec.n} (${bTierNames[A.badgeTier] || '白银阶'})` : '未装配'}</span><span class="tlab-pill${bLive ? ' live' : ''}">${bSpec ? (bActiveWin > 0 ? `生效中 ${bActiveWin.toFixed(2)}s` : bLive ? (TRAIN.lastBadgeMsg || '已触发') : A.badgeId === 'ironwall' ? `格挡 ${A.badgeBlockCnt || 0}/3` : '待触发') : '未装配'}</span></div>
        ${bSpec ? `
          <p class="tlab-desc"><strong>触发条件：</strong>${bSpec.trigger}</p>
          <p class="tlab-desc"><strong>机制说明：</strong>${bSpec.effect}</p>
          <p class="tlab-desc"><strong>当前品阶效果：</strong>${(bSpec.tiers && bSpec.tiers[bTierIdx]) || bSpec.effect}</p>
        ` : '<p class="tlab-desc">当前侠客未装配徽记。前往「英雄」或「武库 → 徽记」即可一键装配并在训练场实时验证触发效果。</p>'}
      </div>
      <div class="tlab-sec${pLive ? ' is-live' : ''}">
        <div class="tlab-sec-h"><span>随行灵宠 · ${pSpec ? `${pSpec.n} (${pTierNames[A.petTier] || '初阶'})` : '未携带'}</span><span class="tlab-pill${pSpec && !(A.petCD > 0.05) ? ' live' : ''}">${pSpec ? ((A.petCD || 0) > 0.05 ? `冷却 ${A.petCD.toFixed(1)}s` : 'V 键就绪') : '未携带'}</span></div>
        ${pSpec ? `
          <p class="tlab-desc"><strong>常驻被动：</strong>${pSpec.passive || '随行协同增益'}</p>
          <p class="tlab-desc"><strong>主动秘技 [V]：</strong>${pSpec.active || '发动灵宠秘技'}</p>
          <p class="tlab-desc"><strong>触发方式：</strong>按 V 键释放（基础冷却 ${pSpec.cd}s，品阶越高倍率越高且冷却更短）。</p>
        ` : '<p class="tlab-desc">当前未携带灵宠。可在「武库 → 灵宠」收养并携宠出战，在训练场按 V 键实时观测效果。</p>'}
      </div>
      <div class="tlab-sec${stLive ? ' is-live' : ''}">
        <div class="tlab-sec-h"><span>架势与招式流派</span><span class="tlab-pill">${A.stance ? (stSpec ? stSpec.name : '二式') : '本式'}</span></div>
        <p class="tlab-desc"><strong>当前架势：</strong>${A.stance && stSpec ? `${stSpec.name} — ${stSpec.desc}` : `本式 — 标准均衡参数。${A.stanceUnlocked && stSpec ? `按架势键可随时切换「${stSpec.name}」：${stSpec.desc}` : '（累计 20 斩可解锁二式架势）'}`}</p>
        ${modDesc('q', sm.q)}${modDesc('r', sm.r)}${modDesc('e', sm.e)}
      </div>
      <div class="tlab-sec">
        <div class="tlab-sec-h"><span>侠客固有被动 · ${A.ch.passiveName || A.ch.passive || '门派心法'}</span></div>
        <p class="tlab-desc">${A.ch.passiveDesc || A.ch.desc || '该侠客拥有专属武器机制与门派连携特性。'}</p>
      </div>`;
  } else if (tab === 'stats') {
    const cu = comboUI[0] || { n: 0, dmg: 0, t: 0 };
    const dps = TRAIN.hits.reduce((acc, h) => acc + h[1], 0) / 5;
    const advTxt = TRAIN.advantage == null ? '—' : `${TRAIN.advantage >= 0 ? '+' : ''}${TRAIN.advantage}F`;
    const logs = (TRAIN.events || []).slice(0, 6);
    body.innerHTML = `
      <div class="tlab-sec">
        <div class="tlab-sec-h"><span>实时战斗统计</span><span class="tlab-pill">命中 ${TRAIN.hitCount || 0} 次</span></div>
        <div class="tlab-kv"><span>当前连击</span><b>${cu.t > 0 ? `${cu.n} 段 · ${Math.round(cu.dmg)} 伤` : '—'}</b></div>
        <div class="tlab-kv"><span>最高连击</span><b>${TRAIN.best || 0} 段 · ${Math.round(TRAIN.bestDmg || 0)} 伤</b></div>
        <div class="tlab-kv"><span>最近单次 / 单击峰值</span><b>${Math.round(TRAIN.lastHitDmg || 0)} / ${Math.round(TRAIN.maxHitDmg || 0)}</b></div>
        <div class="tlab-kv"><span>累计伤害 / 5s DPS</span><b>${Math.round(TRAIN.total || 0)} · ${dps.toFixed(1)}/s</b></div>
        <div class="tlab-kv"><span>帧优势 (Frame Adv)</span><b>${advTxt}</b></div>
        <div class="tlab-kv"><span>精准招架 / 破防次数</span><b>${TRAIN.parries || 0} 次 / ${TRAIN.breaks || 0} 次</b></div>
      </div>
      <div class="tlab-sec">
        <div class="tlab-sec-h"><span>实时机制触发记录</span></div>
        <div class="tlab-log">${logs.length ? logs.map(ev => `<div class="tlab-log-row k-${ev.kind}"><b>${ev.title} <small style="opacity:.6">(${ev.t.toFixed(1)}s)</small></b>${ev.detail ? `<span>${ev.detail}</span>` : ''}</div>`).join('') : '<span class="tlab-chip dim">施放招式、触发徽记/灵宠/招架/破防后将在此实时记录</span>'}</div>
      </div>`;
  } else {
    const st = A.ch.stat || {};
    body.innerHTML = `
      <div class="tlab-sec">
        <div class="tlab-sec-h"><span>${A.ch.name} · 核心战斗属性</span><span class="tlab-pill">${A.ch.title || '侠客'}</span></div>
        <div class="tlab-attr-grid">
          <div class="tlab-kv"><span>最大气血</span><b>${Math.round(A.maxHp)}</b></div>
          <div class="tlab-kv"><span>架势上限</span><b>${Math.round(A.maxGuard || 100)}</b></div>
          <div class="tlab-kv"><span>架势稳固</span><b>${((st.guardStab || 1)).toFixed(2)}×</b></div>
          <div class="tlab-kv"><span>格挡磨血</span><b>${Math.round(((st.guardChip || 0.12)) * 100)}%</b></div>
          <div class="tlab-kv"><span>体量权重</span><b>${((st.weight || 1)).toFixed(2)}</b></div>
          <div class="tlab-kv"><span>护甲减伤</span><b>${((st.defRating || 1)).toFixed(2)}×</b></div>
          <div class="tlab-kv"><span>抗硬直韧性</span><b>${((st.poise || 1)).toFixed(2)}×</b></div>
          <div class="tlab-kv"><span>移动速度</span><b>${((st.walk || 1)).toFixed(2)}×</b></div>
          <div class="tlab-kv"><span>出招速度</span><b>${((st.speed || 1)).toFixed(2)}×</b></div>
          <div class="tlab-kv"><span>攻击距离</span><b>${((st.reach || 1)).toFixed(2)}×</b></div>
          <div class="tlab-kv"><span>连段衰减</span><b>-${Math.round(((A.ch.scaling || 0.08)) * 100)}%/段</b></div>
          <div class="tlab-kv"><span>真元获取</span><b>${((A.ch.meterMul || 1)).toFixed(2)}×</b></div>
        </div>
      </div>
      <div class="tlab-sec">
        <div class="tlab-sec-h"><span>判定框图例（默认开启 · F1 切换）</span></div>
        <div class="tlab-chips">
          <span class="tlab-chip buff">绿框：受击框</span>
          <span class="tlab-chip buff">蓝框：无敌状态</span>
          <span class="tlab-chip badge">黄框：前摇帧</span>
          <span class="tlab-chip debuff">红框：活跃攻击帧</span>
          <span class="tlab-chip">青/橙框：飞行道具</span>
        </div>
        <p class="tlab-desc">按 <strong>${dummyBarKey()}</strong> 切换木人行为或 AI 境界，用右下角 <strong>Hz 滑块</strong> 与 <strong>推进 1 帧</strong> 精确观测招式帧差。</p>
      </div>`;
  }
}
function trainLabUpdate() {
  const panel = $id('trainLab');
  if (!panel) return;
  const active = M.mode === 'train' && !TUT && !FOREST.on && !REPLAY.on && M.phase !== 'end' && !currentScreen;
  const show = active && !!TRAIN.labOpen && !paused && !DB.open;
  panel.classList.toggle('hidden', !show);
  if (show) trainLabRender(false);
}
if ($id('trainLabTabs')) {
  $id('trainLabTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tltab]');
    if (!b) return;
    TRAIN.labTab = b.dataset.tltab;
    for (const x of $id('trainLabTabs').querySelectorAll('button[data-tltab]')) {
      const on = x === b;
      x.classList.toggle('sel', on);
      x.setAttribute('aria-selected', String(on));
    }
    _tlabLastDraw = 0;
    trainLabRender(true);
    SFX.slice && SFX.slice();
  });
}
if ($id('trainLabMin')) $id('trainLabMin').addEventListener('click', () => {
  TRAIN.labOpen = false;
  trainInspectRender();
  trainLabUpdate();
  refocusGame();
});
// 帧检查器只属于木人训练，频率按逻辑帧计；最高 120 Hz 即标准速度。
function trainInspectRender() {
  const rate = $id('trainHz'), value = $id('trainHzValue'), hitbox = $id('trainHitboxBtn'), pause = $id('trainPauseBtn'), advance = $id('trainStepBtn'), labBtn = $id('trainLabToggle');
  if (labBtn) { labBtn.setAttribute('aria-pressed', String(!!TRAIN.labOpen)); const lTxt = cvT(TRAIN.labOpen ? '状态面板：开' : '状态面板：关'); if (labBtn.textContent !== lTxt) labBtn.textContent = lTxt; }
  if (rate && rate.value !== String(TRAIN.inspectHz)) rate.value = String(TRAIN.inspectHz);
  if (value && value.textContent !== `${TRAIN.inspectHz} Hz`) value.textContent = `${TRAIN.inspectHz} Hz`;
  if (hitbox) { hitbox.setAttribute('aria-pressed', String(debugHitbox)); const label = cvT(`F1 判定框：${debugHitbox ? '开' : '关'}`); if (hitbox.textContent !== label) hitbox.textContent = label; }
  if (pause) { pause.setAttribute('aria-pressed', String(TRAIN.inspectPaused)); const label = cvT(TRAIN.inspectPaused ? '恢复时间' : '暂停时间'); if (pause.textContent !== label) pause.textContent = label; }
  if (advance && advance.textContent !== cvT('推进 1 帧')) advance.textContent = cvT('推进 1 帧');
  if (advance) advance.disabled = !TRAIN.inspectPaused || M.mode !== 'train' || paused || DB.open || !!currentScreen;
}
function trainInspectUpdate() {
  const panel = $id('trainInspect');
  if (!panel) return;
  const active = M.mode === 'train' && !REPLAY.on && M.phase !== 'end' && !currentScreen;
  panel.classList.toggle('hidden', !active || paused || DB.open);
  trainInspectRender();
  trainLabUpdate();
}
function trainInspectStep() {
  if (M.mode !== 'train' || !TRAIN.inspectPaused || paused || DB.open || REPLAY.on || currentScreen) return false;
  acc = 0; TRAIN.inspectAcc = 0;
  step();
  trainInspectRender();
  _tlabLastDraw = 0;
  trainLabRender(true);
  return true;
}
if ($id('trainInspect')) {
  if ($id('trainLabToggle')) $id('trainLabToggle').addEventListener('click', () => {
    if (M.mode !== 'train') return;
    TRAIN.labOpen = !TRAIN.labOpen;
    _tlabLastDraw = 0;
    trainInspectRender();
    trainLabUpdate();
    refocusGame();
  });
  if ($id('trainFullMeterBtn')) $id('trainFullMeterBtn').addEventListener('click', () => { trainLabFullMeter(); refocusGame(); });
  if ($id('trainResetBtn')) $id('trainResetBtn').addEventListener('click', () => { trainLabReset(); refocusGame(); });
  $id('trainHz').addEventListener('input', e => {
    TRAIN.inspectHz = Math.max(1, Math.min(120, Math.round(+e.target.value || 120)));
    TRAIN.inspectAcc = 0;
    trainInspectRender();
  });
  $id('trainHitboxBtn').addEventListener('click', () => {
    if (M.mode !== 'train') return;
    debugHitbox = !debugHitbox;
    trainInspectRender();
  });
  $id('trainPauseBtn').addEventListener('click', () => {
    if (M.mode !== 'train') return;
    TRAIN.inspectPaused = !TRAIN.inspectPaused;
    TRAIN.inspectAcc = 0;
    acc = 0;
    trainInspectRender();
  });
  $id('trainStepBtn').addEventListener('click', trainInspectStep);
}
if ($id('dummyBar')) {
  $id('dummyBar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.id === 'dummyBarClose') { dummyBarShow(false); return; }
    if (b.dataset.dbopp) {
      if (b.dataset.dbopp === 'dummy') { trainOppMode = 'dummy'; }
      else { trainOppMode = 'ai'; trainAiLevel = b.dataset.dbopp.split(':')[1] || 'normal'; }
      applyTrainOpponent();
      SFX.slice();
      return;
    }
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
  const foeIdx = trainOppMode === 'ai' ? ((trainChar + 1) % CHARS.length) : 0;
  startMatch('train', { ...dummyCfg }, [trainChar, foeIdx]);
  Object.assign(TRAIN, { total: 0, hits: [], best: 0, bestDmg: 0, lastHitDmg: 0, maxHitDmg: 0, hitCount: 0, parries: 0, breaks: 0, events: [], advantage: null, frameProbe: null, lastBadgeT: -99, lastBadgeMsg: '', lastPetT: -99, lastStanceT: -99, labOpen: true });
  _tlabLastDraw = 0;
  if (trainOppMode === 'ai') {
    B.dummy = false;
    B.ctrl = new AICtrl(trainAiLevel || 'normal');
    if (typeof B.ctrl.updateTactic === 'function') B.ctrl.updateTactic(B, A);
    B.maxHp = B.hp = B.lagHp = Math.round(((B.ch.stat && B.ch.stat.hp) || 850) * ((BAL[B.ch.id] || {}).hp || 1));
    M.level = trainAiLevel || 'normal';
    applySkins();
    A.x = STAGE_W / 2 - 200; B.x = STAGE_W / 2 + 200; B.homeX = undefined;
  } else {
    B.dummy = true; B.maxHp = B.hp = B.lagHp = 300; B.look = { ...B.look, name: '木人桩' };
    applySkins();
    A.x = STAGE_W / 2 - 160; B.x = dummyCfg.fixed ? STAGE_W / 2 : STAGE_W / 2 + 60; B.homeX = dummyCfg.fixed ? STAGE_W / 2 : undefined;
  }
}
// 木人试剑：木人桩直接开练；各模式的最高境界专项训练和正常开局一样先去点将台选人
function startTrainTarget(targetMode = trainTargetMode, isWatch = false) {
  if (targetMode === 'watch2v2') return isWatch ? startWatch2v2Draft() : bpStart('2v2', { subMode: 'pp_cc', level: 'god' });
  if (targetMode === 'cpu') return bpStart(isWatch ? 'cpuWatch' : 'cpu', { level: 'god' });   // 专项训练固定天道，不改玩家选好的电脑境界
  if (targetMode === 'tag3' || targetMode === 'chaos' || targetMode === 'mayhem') return bpStart(targetMode, { level: 'god', isWatch });
  bpStart('train', { targetMode: 'dummy', isWatch });
}
function startTraining(targetMode = 'dummy', isWatch = false, badgePreview = null) {
  if (targetMode !== 'dummy') return startTrainTarget(targetMode, isWatch);
  if (typeof trainChar !== 'number' || isNaN(trainChar) || trainChar < 0 || trainChar >= CHARS.length) {
    trainChar = 0;
  }
  window.BADGE_TRAINING_PREVIEW = badgePreview && COMBAT_BADGES[badgePreview.id]
    ? { id: badgePreview.id, tier: badgePreview.tier || 'silver' } : null;
  initAudio(); paused = false;
  M.watchAi = !!isWatch;
  startDummyTraining();
  if (isWatch) {
    A.ctrl = new AICtrl('god');
    say('训练场 · AI 演示连招', 1.4);
  } else if (trainOppMode === 'ai') {
    say(`训练场 · AI 实战对练 (${LV_NAME[trainAiLevel] || trainAiLevel})`, 1.5);
  } else say('木人试剑 · 开始训练', 1.4);
}
function startBadgeTrainingPreview(id, tier = 'silver') {
  if (!COMBAT_BADGES[id]) return;
  if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
  trainOppMode = 'dummy';
  const action = id === 'riposte' ? 'light' : id === 'breaker' ? 'block' : 'stand';
  Object.assign(dummyCfg, { act: action, rep: true, gap: 1, fixed: false, escape: false, infGuard: id !== 'breaker', autoHeal: true });
  renderDummyFeatures();
  singleSec('train');
  showScreen('single');
  xiwuTrainingTab('free');
  startTraining('dummy', false, { id, tier });
  say(`${cvT('徽记试招：')}${cvT(COMBAT_BADGES[id].trigger)}`, 3);
}
function openReviewTraining(heroId, focus) {
  const hero = CHARS.findIndex(c => c.id === heroId);
  if (hero >= 0) {
    trainChar = hero;
    if (typeof setMenuHero === 'function') setMenuHero(hero);
  }
  Object.assign(dummyCfg, focus === 'defense'
    ? { act: 'combo', escape: true, infGuard: true, autoHeal: true }
    : { act: 'stand', escape: false, infGuard: true, autoHeal: true });
  renderDummyFeatures();
  singleSec('train');
  showScreen('single');
  xiwuTrainingTab('scenario');
}
const trainBtnEl = $id('trainBtn');
if (trainBtnEl) trainBtnEl.addEventListener('click', () => {
  if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
  startTraining('dummy');
});
const trainPickBtnEl = $id('trainPickBtn');
if (trainPickBtnEl) trainPickBtnEl.addEventListener('click', () => bpStart('train', { targetMode: 'dummy' }));
const xiwuFullTutBtn = $id('xiwuFullTutBtn');
if (xiwuFullTutBtn) xiwuFullTutBtn.addEventListener('click', () => { initAudio(); startTutorial(true); });
const xiwuTrainingCpuBtn = $id('xiwuTrainingCpuBtn');
if (xiwuTrainingCpuBtn) xiwuTrainingCpuBtn.addEventListener('click', () => {
  singleSec('cpu');
  showScreen('single');
});
const xiwuDrillList = document.querySelector('.xiwu-drill-list');
if (xiwuDrillList) xiwuDrillList.addEventListener('click', e => {
  const b = e.target.closest('button[data-drill]');
  if (!b) return;
  if (b.dataset.drill === 'ai-sparring') {
    trainOppMode = 'ai';
    if (typeof pickLevel === 'string' && LV_NAME[pickLevel]) trainAiLevel = pickLevel;
    if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
    renderTrainConfig();
    SFX.slice();
    startTraining('dummy');
    return;
  }
  const drills = {
    combo: { act: 'stand', fixed: false, escape: false, infGuard: true, autoHeal: true },
    block: { act: 'block', fixed: false, escape: false, infGuard: true, autoHeal: true },
    parry: { act: 'parry', fixed: false, escape: false, infGuard: true, autoHeal: true },
    'combo-escape': { act: 'combo', fixed: false, escape: true, infGuard: true, autoHeal: true },
    'anti-air': { act: 'jump', fixed: false, escape: false, infGuard: true, autoHeal: true }
  };
  const preset = drills[b.dataset.drill];
  if (!preset) return;
  trainOppMode = 'dummy';
  Object.assign(dummyCfg, preset, { rep: true, gap: 1 });
  if (typeof menuHeroPick === 'function') trainChar = menuHeroPick();
  renderTrainConfig();
  renderDummyFeatures();
  SFX.slice();
  startTraining('dummy');
});
renderTrainConfig();
renderDummyFeatures();
