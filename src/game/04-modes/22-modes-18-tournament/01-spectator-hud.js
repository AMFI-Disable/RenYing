// ======================= 实时观战 HUD 与武林大会赛程 (#56) =======================
// 1. Live Spectator HUD & Read-Only Online Spectating
// 纯渲染、只读广播与镜头控制，不修改任何战斗物理、随机数或回滚状态。
const SPEC_HUD = { focusIdx: -1, clean: false, stage: false, lastDraw: 0, liveSpecs: 0, liveTitle: '', bcastAcc: 0 };
const TOUR_PERSIST_KEY = 'renying-tournament-active';
const SPEC_BCAST_INTERVAL = 1 / 20;   // 20Hz 被动只读快照广播，不干扰 120Hz 回滚输入通道

function spectatorHudAvail() {
  if (typeof currentScreen !== 'undefined' && currentScreen) return false;
  if (!M || M.phase === 'end' || M.mode === 'demo' || M.mode === 'train') return false;
  if (typeof FOREST !== 'undefined' && FOREST.on) return false;
  if (typeof WORLD !== 'undefined' && WORLD.on) return false;
  if (typeof NET !== 'undefined' && NET.spectating) return true;
  return !!(M.watchAi || (typeof isAiVsAi === 'function' && isAiVsAi()) || (typeof REPLAY !== 'undefined' && REPLAY.on) || (M.tournament && M.tournament.spectate));
}

function specHudSetFocus(idx) {
  SPEC_HUD.focusIdx = Number.isInteger(idx) && idx >= 0 ? idx : -1;
  SPEC_HUD.lastDraw = 0;
  specHudRender(true);
}

function specHudCycleFocus(dir = 1) {
  const active = allFighters().filter(f => !f.hidden && f.hp > 0);
  if (!active.length) { SPEC_HUD.focusIdx = -1; return -1; }
  const ids = [-1, ...active.map(f => f.idx)];
  const cur = ids.indexOf(SPEC_HUD.focusIdx);
  const next = ids[(cur + (dir >= 0 ? 1 : ids.length - 1)) % ids.length];
  specHudSetFocus(next);
  return next;
}

function specHudToggleClean() {
  SPEC_HUD.clean = !SPEC_HUD.clean;
  SPEC_HUD.lastDraw = 0;
  specHudRender(true);
  return SPEC_HUD.clean;
}
function specHudToggleStage() {
  SPEC_HUD.stage = !SPEC_HUD.stage;
  if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('spec-stage', SPEC_HUD.stage);
  SPEC_HUD.lastDraw = 0;
  specHudRender(true);
  return SPEC_HUD.stage;
}

// 房主被动向只读观战者广播当前画面快照（绝不修改任何战斗或 ROLL 状态）
function specBroadcastTick(dt) {
  if (typeof p2pSpecCount !== 'function' || typeof p2pSpecBroadcast !== 'function') return 0;
  const count = p2pSpecCount();
  SPEC_HUD.liveSpecs = count;
  if (count <= 0) { SPEC_HUD.bcastAcc = 0; return 0; }
  SPEC_HUD.bcastAcc += Math.max(0, +dt || 0);
  if (SPEC_HUD.bcastAcc < SPEC_BCAST_INTERVAL) return 0;
  SPEC_HUD.bcastAcc = 0;
  if (typeof snapshot !== 'function' || !A || !B) return 0;
  const payload = {
    sys: 'spec_frame',
    snap: snapshot(),
    ch: [A.chIdx | 0, B.chIdx | 0],
    names: (typeof NET !== 'undefined' && NET.names) || {},
    specs: count,
    label: (M.tournament && M.tournament.label) ? M.tournament.label : ''
  };
  return p2pSpecBroadcast(payload);
}

function specOnLiveReady(msg) {
  if (typeof NET === 'undefined') return false;
  NET.spectating = true;
  NET.open = true;
  NET.role = 'spectator';
  NET.names = (msg && msg.names) || {};
  SPEC_HUD.liveSpecs = Math.max(1, +(msg && msg.specs) || 1);
  SPEC_HUD.liveTitle = (msg && msg.code) ? `${cvT('联机观战')} #${msg.code}` : cvT('联机观战');
  if (typeof ROLL !== 'undefined') ROLL.on = false;
  if (typeof initAudio === 'function') initAudio();
  const ch = (msg && Array.isArray(msg.ch) && msg.ch.length >= 2) ? msg.ch : [0, 1];
  if (typeof setChars === 'function') setChars(ch[0], ch[1]);
  M.mode = 'net';
  M.watchAi = true;
  M.phase = 'fight';
  if (typeof showScreen === 'function') showScreen(null);
  SPEC_HUD.focusIdx = -1;
  specHudRender(true);
  if (typeof toast === 'function') toast('已进入只读实时观战席');
  return true;
}

function specApplyLiveFrame(msg) {
  if (typeof NET === 'undefined' || !NET.spectating || !msg || !msg.snap) return false;
  if (typeof msg.specs === 'number') SPEC_HUD.liveSpecs = Math.max(1, msg.specs | 0);
  if (msg.label) SPEC_HUD.liveTitle = msg.label;
  if (Array.isArray(msg.ch) && msg.ch.length >= 2 && (A.chIdx !== msg.ch[0] || B.chIdx !== msg.ch[1])) {
    if (typeof setChars === 'function') setChars(msg.ch[0], msg.ch[1]);
  }
  if (typeof applySnapshot === 'function') applySnapshot(msg.snap, true);
  specHudRender(false);
  return true;
}

function specExitLive(reason) {
  SPEC_HUD.liveSpecs = 0;
  SPEC_HUD.liveTitle = '';
  SPEC_HUD.focusIdx = -1;
  SPEC_HUD.clean = false;
  if (typeof netReset === 'function') netReset();
  if (typeof toMenu === 'function') toMenu();
  if (reason && typeof toast === 'function') toast(reason);
  if (reason && typeof netStatus === 'function') netStatus(reason);
}

function specHudRender(force = false) {
  const el = $id('specHud');
  if (!el) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && nowMs - SPEC_HUD.lastDraw < 110) return;
  SPEC_HUD.lastDraw = nowMs;
  const active = allFighters().filter(f => !f.hidden);
  const titleEl = $id('specTitle'), countEl = $id('specCount'), pillsEl = $id('specFighters'), tickerEl = $id('specTicker'), cleanBtn = $id('specCleanBtn'), exitBtn = $id('specExitBtn');
  const isLiveNet = !!(typeof NET !== 'undefined' && NET.spectating);
  if (titleEl) {
    const tag = (isLiveNet && SPEC_HUD.liveTitle) ? SPEC_HUD.liveTitle
      : (M.tournament && M.tournament.label) ? M.tournament.label
      : (typeof REPLAY !== 'undefined' && REPLAY.on) ? cvT('回放观战')
      : cvT('实时观战');
    titleEl.textContent = tag;
  }
  if (countEl) {
    const sc = isLiveNet ? Math.max(1, SPEC_HUD.liveSpecs || 1) : (typeof p2pSpecCount === 'function' ? p2pSpecCount() : 0);
    countEl.classList.toggle('hidden', sc <= 0);
    if (sc > 0) countEl.textContent = `${sc} ${cvT('观战中')}`;
  }
  if (exitBtn) exitBtn.classList.toggle('hidden', !isLiveNet);
  const stageBtn = $id('specStageBtn');
  if (stageBtn) {
    stageBtn.setAttribute('aria-pressed', String(SPEC_HUD.stage));
    stageBtn.textContent = cvT(SPEC_HUD.stage ? '退出大屏' : '大屏模式');
  }
  if (cleanBtn) {
    cleanBtn.setAttribute('aria-pressed', String(SPEC_HUD.clean));
    cleanBtn.textContent = cvT(SPEC_HUD.clean ? '恢复完整界面' : '纯净直转');
  }
  el.classList.toggle('is-clean', !!SPEC_HUD.clean);
  if (pillsEl) {
    const autoBtn = `<button type="button" class="spec-pill${SPEC_HUD.focusIdx < 0 ? ' sel' : ''}" data-spec-focus="-1">${cvT('自动镜头')}</button>`;
    const fighterBtns = active.slice(0, 8).map(f => {
      const hpPct = Math.round(clamp(f.hp / Math.max(1, f.maxHp), 0, 1) * 100);
      const metPct = Math.round(clamp((f.meter || 0) / 100, 0, 1) * 100);
      const sel = SPEC_HUD.focusIdx === f.idx ? ' sel' : '';
      const ko = f.hp <= 0 ? ' is-ko' : '';
      return `<button type="button" class="spec-pill${sel}${ko}" data-spec-focus="${f.idx}"><b>${escapeHTML(cvT(f.look ? f.look.name : f.ch.name))}</b><span>${hpPct}% · ${metPct}气</span></button>`;
    }).join('');
    pillsEl.innerHTML = autoBtn + fighterBtns;
  }
  if (tickerEl) {
    const extra = [];
    if (Array.isArray(M.inkZones) && M.inkZones.length) extra.push(`${cvT('残墨')} ${M.inkZones.length}/12`);
    if (M.mode === 'tag3' && M.tag3Assist && Array.isArray(M.tag3Assist.cd)) {
      const cd0 = M.tag3Assist.cd[0] > 0.1 ? `${Math.ceil(M.tag3Assist.cd[0])}s` : cvT('就绪');
      const cd1 = M.tag3Assist.cd[1] > 0.1 ? `${Math.ceil(M.tag3Assist.cd[1])}s` : cvT('就绪');
      extra.push(`${cvT('援')} ${cd0}/${cd1}`);
    }
    const synActive = active.some(f => f && f.synTag && (clock - f.synTag.t) < 2.4);
    if (synActive) extra.push(cvT('武学共鸣'));
    const suffix = extra.length ? `  |  ${extra.join(' · ')}` : '';
    if (SPEC_HUD.focusIdx < 0 && active.length >= 2) {
      const fmtSide = f => {
        const st = (M.combatStats && M.combatStats[f.idx]) || {};
        const gPct = Math.round(clamp((f.guard || 0) / Math.max(1, f.maxGuard || 100), 0, 1) * 100);
        const fn = cvT(f.look ? f.look.name : f.ch.name);
        return `${fn} (${cvT('架势')}${gPct}% · ${cvT('伤害')}${Math.round(+st.damage || 0)} · ${cvT('连击')}${+st.combo || 0})`;
      };
      tickerEl.textContent = `${fmtSide(active[0])}  VS  ${fmtSide(active[1])}${suffix}`;
    } else {
      const focusF = SPEC_HUD.focusIdx >= 0 ? fighterByIdx(SPEC_HUD.focusIdx) : active[0];
      const st = M.combatStats && focusF ? (M.combatStats[focusF.idx] || {}) : {};
      const dmg = Math.round(+st.damage || 0), maxC = +st.combo || 0, brk = +st.breaks || 0;
      const gPct = focusF ? Math.round(clamp((focusF.guard || 0) / Math.max(1, focusF.maxGuard || 100), 0, 1) * 100) : 0;
      const fname = focusF ? cvT(focusF.look ? focusF.look.name : focusF.ch.name) : '—';
      tickerEl.textContent = `${fname} · ${cvT('架势')} ${gPct}% · ${cvT('伤害')} ${dmg} · ${cvT('最长连击')} ${maxC} · ${cvT('破防')} ${brk}${suffix}`;
    }
  }
}

function specHudUpdate() {
  const el = $id('specHud');
  if (!el) return;
  const on = spectatorHudAvail();
  el.classList.toggle('hidden', !on);
  if (!on) {
    if (SPEC_HUD.focusIdx >= 0) SPEC_HUD.focusIdx = -1;
    if (SPEC_HUD.clean) SPEC_HUD.clean = false;
    return;
  }
  specHudRender(false);
}

if ($id('specHud')) {
  $id('specHud').addEventListener('click', e => {
    const btn = e.target.closest('[data-spec-focus]');
    if (btn) { specHudSetFocus(+btn.dataset.specFocus); return; }
    if (e.target.closest('#specCleanBtn')) { specHudToggleClean(); return; }
    if (e.target.closest('#specPrevBtn')) { specHudCycleFocus(-1); return; }
    if (e.target.closest('#specNextBtn')) { specHudCycleFocus(1); return; }
    if (e.target.closest('#specExitBtn')) { specExitLive('已退出实时观战'); return; }
  });
}

window.addEventListener('keydown', e => {
  if (!spectatorHudAvail() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'F2') { e.preventDefault(); specHudToggleClean(); }
  else if (e.code === 'BracketLeft') { e.preventDefault(); specHudCycleFocus(-1); }
  else if (e.code === 'BracketRight') { e.preventDefault(); specHudCycleFocus(1); }
});

// 2. 武林大会单败淘汰赛（支持 4 / 8 / 16 人签表、标准/随机种子、自动推进、本地/联机与可分享战绩码）
let TOUR = null;
let tourFormat = 'player';
let tourSize = 8;
let tourSeedMode = 'standard';
let tourAutoTimer = 0;
const TOUR_SIZES = [4, 8, 16];
const TOUR_ROUND_NAMES = ['八强赛', '半决赛', '总决赛'];

