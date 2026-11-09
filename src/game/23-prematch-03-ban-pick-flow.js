// ======================= 禁选、选人和开局流程 =======================
// 本文件：点将台的流程：开始（bpStart）、合法性检查（bpValid）、执行一步（bpApply）、结束开局（bpFinish / launchBpMatch）、电脑的选择、倒计时。
// 找 bug 提示：联机时每一步都要两边一致，bpApply 是唯一改点将状态的地方。
function bpStart(mode, customOpts = null) {
  currentPreMatch = null;
  customOpts = { ...(customOpts || {}) };
  if (BP_BRIEFING_MODES.has(mode) && !customOpts.mapBriefed && !customOpts.quickRelay && !skipInteractiveDraft()) {
    customOpts.mapId = briefingMapId(mode, customOpts);
    customOpts.mapBriefed = true;
    if (mode === 'net' && NET.role === 'host') send({ mbrief: { mapId: customOpts.mapId } });
    showMapBriefing(customOpts.mapId, () => {
      if (currentScreen === 'mapBriefing') bpStart(mode, customOpts);
    });
    return;
  }
  if (bpFinishTimer) { clearTimeout(bpFinishTimer); bpFinishTimer = null; }
  if (isLocalBp(mode)) netDropWaiting();
  watch2v2Bp = null;   // 进入任何常规禁选都先取消可能残留的 2v2 禁选
  ensurePortraits(); chatClear();
  bpMode = mode;
  bpCustomOpts = customOpts;
  // 顺序和每边选几个人都按模式表来（src/data/10-modes.js、11-bp-orders.js）
  const md = bpModeDef(mode);
  const squad = customOpts && customOpts.squadSize === 2 ? 2 : 3;
  const steps = BP_ORDERS[mode === 'tag3' && customOpts.quickRelay ? 'trioQuick' : (md.squadBp && md.squadBp[squad]) || md.bp].map(st => st.slice());
  const bans = steps.some(st => st[1] === 'ban') ? [-1, -1] : [];
  const count = side => steps.filter(st => st[0] === side && st[1] === 'pick').length;
  const picks = md.team ? [count(0), count(1)].map(n => Array(n).fill(-1)) : [0, 1].filter(count).map(() => -1);

  BP = {
    step: 0,
    steps,
    bans,
    picks,
    t: BP_TIME,
    avail: [availList(), mode === 'net' ? (NET.peerAvail || null) : null]
  };
  BP.mapId = MAPS[customOpts.mapId] ? customOpts.mapId : briefingMapId(mode, customOpts);
  BP.matchSeed = Number.isInteger(customOpts.matchSeed) ? customOpts.matchSeed : null;
  if (['cpu', 'cpuWatch', 'chaos', 'mayhem', 'maps', 'tag3', '2v2'].includes(mode) || (mode === 'net' && !md.raid)) {
    BP.preMatch = preMatchCreate(BP.mapId, BP.matchSeed === null ? (Math.random() * 0x100000000) >>> 0 : BP.matchSeed >>> 0);
  }
  // Online map and scroll candidates share the match seed sent in the BP state.
  bpSel = -1; bpCpuT = BP_CPU_DELAY;
  showScreen('bp'); renderBP();
  if (mode === 'net') send({ bps: BP });
}
function bpValid(i) {
  if (!BP || BP.step >= bpSteps().length || i < 0 || i >= CHARS.length) return false;
  if (Array.isArray(BP.bans) && BP.bans.includes(i)) return false;
  const stepDef = bpSteps()[BP.step];
  if (!stepDef) return false;
  if (stepDef[1] === 'ban' && isMultiPickBP() && [...BP.picks[0], ...BP.picks[1]].includes(i)) return false;   // 已经选定的人不能禁
  if (stepDef[1] === 'pick') {
    if (isMultiPickBP()) {
      const allPicked = [...(BP.picks[0] || []), ...(BP.picks[1] || [])];
      if (allPicked.includes(i)) return false;
    } else if (Array.isArray(BP.picks) && BP.picks.includes(i)) {
      return false;
    }
  }
  if (stepDef[1] === 'pick') {
    const av = BP.avail && BP.avail[stepDef[0]];
    const currentBans = Array.isArray(BP.bans) ? BP.bans : [];
    const currentPicks = isMultiPickBP() ? [...(BP.picks[0] || []), ...(BP.picks[1] || [])] : (Array.isArray(BP.picks) ? BP.picks : []);
    if (av && av.length && av.some(k => !currentBans.includes(k) && !currentPicks.includes(k)) && !av.includes(i)) return false;
  }
  return true;
}
const bpValidList = () => CHARS.map((c, i) => i).filter(bpValid);   // 这一步还能点的角色
function bpApply(i) {
  if (!BP || BP.step >= bpSteps().length) return;
  if (!bpValid(i)) {
    const fallback = bpValidList()[0];
    if (fallback !== undefined) i = fallback;
    else return;
  }
  const [side, type] = bpSteps()[BP.step];
  if (type === 'ban') {
    BP.bans[side] = i;
  } else {
    if (isMultiPickBP()) {
      const slots = BP.picks[side];
      const emptyIdx = slots.findIndex(v => v < 0);
      if (emptyIdx >= 0) slots[emptyIdx] = i;
      else slots[slots.length - 1] = i;
    } else if (Array.isArray(BP.picks)) {
      BP.picks[side] = i;
    }
  }
  BP.step++; BP.t = BP_TIME; bpSel = -1; bpCpuT = BP_CPU_DELAY;
  if (BP.preMatch && BP.step >= bpSteps().length) preMatchSetPicks(BP.preMatch, BP.picks);
  if (type === 'ban') SFX.thud(); else { SFX.block(); }
  if (bpMode === 'net') send({ bps: BP });
  renderBP();
  if (bpMode === 'tag3' && bpCustomOpts && bpCustomOpts.quickRelay && side === 0 && BP.step === 3) {
    while (BP && BP.step < bpSteps().length && bpValidList().length) bpApply(bpCpuChoice());
  }
  if (BP.step >= bpSteps().length) {
    if (bpFinishTimer) clearTimeout(bpFinishTimer);
    bpFinishTimer = setTimeout(bpFinish, bpMode === 'tag3' && bpCustomOpts && bpCustomOpts.quickRelay ? 0 : 1100);
  }
}
function bpFinish() {
  bpFinishTimer = null;
  if (currentScreen !== 'bp' || !BP || BP.step < bpSteps().length) return;
  showPop(null);
  const picks = JSON.parse(JSON.stringify(BP.picks));
  const bans = Array.isArray(BP.bans) ? BP.bans.filter(x => x >= 0) : [];
  const mode = bpMode;
  const opts = bpCustomOpts || {};
  const mapId = BP.mapId;   // 通览时定好的地图；联机开局也复用这个 id
  currentPreMatch = BP.preMatch || null;
  if (currentPreMatch && !currentPreMatch.candidates[0].length && !preMatchSetPicks(currentPreMatch, picks)) currentPreMatch = null;
  if ((mode === 'tag3' || mode === '2v2') && MAPS[mapId]) M.map = mapId;
  BP = null;
  bpCustomOpts = null;
  showScreen(null);
  MSTAT.maxcombo = 0; MSTAT.ults = 0;
  if (currentPreMatch && mode === 'net') {
    if (NET.role !== 'host') return; // The host starts the shared draft; the client waits for its authoritative state.
    const matchSeed = Number.isInteger(opts.matchSeed) ? opts.matchSeed : ((Math.random() * 0x7fffffff) | 0);
    const complete = state => {
      const competitiveScrolls = competitiveScrollMap(state);
      const is2v2Net = !!roomDef().four, raidNet = !!roomDef().raid;
      const duo = !is2v2Net && !raidNet && Array.isArray(picks[0]) ? picks : null;
      const flatCh = raidNet ? [picks[0][0], picks[0][0], picks[1][0], picks[0][1]]
        : is2v2Net && Array.isArray(picks[0]) ? [picks[0][0], picks[1][0], picks[0][1], picks[1][1]]
        : (duo ? [duo[0][0], duo[1][0]] : picks);
      const mv = netMapVotes(), mut = netTeamMutator();
      const loadouts = [typeof armoryCombatLoadoutMap === 'function' ? armoryCombatLoadoutMap() : {}, NET.peerLoadout || {}];
      const start = { ch: flatCh, seed: matchSeed, duo, mv, map: mapId, mut, competitiveScrolls, loadouts };
      send({ rstart: start });
      rollStart(flatCh, matchSeed, duo, mv, mapId, mut, competitiveScrolls, loadouts);
    };
    onlineCompetitiveDraft = { state: currentPreMatch, onComplete: complete, remoteDeadline: Date.now() + COMPETITIVE_DRAFT_SECONDS * Math.max(1, currentPreMatch.picks[1].length), finishing: false };
    competitiveDraftStart(currentPreMatch, mode, opts, complete, true);
    return;
  }
  const launch = state => launchBpMatch(mode, opts, picks, bans, mapId, state);
  if (currentPreMatch) {
    competitiveDraftStart(currentPreMatch, mode, opts, launch, false);
    return;
  }
  launch(null);
}
function launchBpMatch(mode, opts, picks, bans, mapId, preMatch) {
  if (MAPS[mapId]) M.map = mapId;
  if (preMatch) {
    M.competitiveScrolls = competitiveScrollMap(preMatch);
    M.hasBuffs = Object.values(M.competitiveScrolls).some(team => Object.keys(team).length > 0);
  } else { M.hasBuffs = false; M.competitiveScrolls = null; }
  if (mode === 'cpu') {
    startMatch('cpu', opts.level || pickLevel, picks);
  } else if (mode === 'cpuWatch') {
    startMatch('cpu', opts.level || pickLevel || 'god', picks, true);
  } else if (mode === 'net') {
    if (NET.role === 'host') {
      const seed = Number.isInteger(opts.matchSeed) ? opts.matchSeed : ((Math.random() * 2147483647) | 0);
      const is2v2Net = !!roomDef().four, raidNet = !!roomDef().raid;
      const duo = !is2v2Net && !raidNet && Array.isArray(picks[0]) ? picks : null;
      // 同袍肉鸽：A 房主、C 好友、D 房主替电脑同袍选的；B 先放房主的人占位，开打时换成魔首
      const flatCh = raidNet ? [picks[0][0], picks[0][0], picks[1][0], picks[0][1]]
        : is2v2Net && Array.isArray(picks[0]) ? [picks[0][0], picks[1][0], picks[0][1], picks[1][1]]
        : (duo ? [duo[0][0], duo[1][0]] : picks);
      const mv = netMapVotes();   // 山河异境：两边的票（别的房间规则用不上）
      const mut = netTeamMutator();
      const competitiveScrolls = preMatch ? competitiveScrollMap(preMatch) : null;
      const loadouts = [typeof armoryCombatLoadoutMap === 'function' ? armoryCombatLoadoutMap() : {}, NET.peerLoadout || {}];
      send({ rstart: duo ? { ch: flatCh, seed, duo, mv, map: mapId, mut, competitiveScrolls, loadouts } : { ch: flatCh, seed, mv, map: mapId, mut, competitiveScrolls, loadouts } });
      rollStart(flatCh, seed, duo, mv, mapId, mut, competitiveScrolls, loadouts);
    }
  } else if (mode === 'chaos') {
    startChaos(picks[0], picks[1], opts.level || pickLevel, !!opts.isWatch);
  } else if (mode === 'mayhem') {
    startMayhem(picks[0], picks[1], opts.level || pickLevel, !!opts.isWatch);
  } else if (mode === 'maps') {
    startMapsMode(picks[0], picks[1], opts.level || pickLevel, !!opts.isWatch, mapId);
  } else if (mode === 'tag3') {
    startTag3Match(picks[0], picks[1], opts.level || pickLevel, !!opts.isWatch);
    M.bans = bans;
  } else if (mode === 'tower') {
    startTower(picks[0], !!opts.isWatch);
  } else if (mode === 'stage') {
    startStage(opts.stageCh !== undefined ? opts.stageCh : stageCh, opts.stageL !== undefined ? opts.stageL : (STAGE ? STAGE.l : 1), !!opts.isWatch, picks[0]);
  } else if (mode === 'train') {
    trainChar = picks[0];
    startTraining('dummy', !!opts.isWatch);   // 点将台里的「木人试剑」只会是木人桩，专项训练在 startTrainTarget 里直接去对应模式的点将台
  } else if (mode === 'world') {
    worldStart(picks[0]);
  } else if (mode === 'raid') {
    startRaidMatch(picks[0], opts.squadSize || (picks[0] ? picks[0].length : 3), opts);
  } else if (mode === '2v2') {
    if (opts.subMode === 'pp_pp') start2v2LocalVs(picks[0][0], picks[0][1], picks[1][0], picks[1][1]);
    else start2v2LocalCoop(picks[0][0], picks[0][1], picks[1][0], picks[1][1], opts.level || 'normal', opts.subMode === 'p_cc');
    M.bans = bans;
  }
  applySkins();
}
// 电脑选人：禁掉一个随机角色；选人时六成概率挑 beats 里写着你这位侠客的角色
function bpCpuChoice() {
  const valid = bpValidList();
  if (!valid.length) {
    // 终极保底：任何未禁未选的角色
    for (let i = 0; i < CHARS.length; i++) {
      if (bpValid(i)) return i;
    }
    return 0;
  }
  if (pickLevel === 'adaptive') {
    const fav = adaptFav(), type = bpSteps()[BP.step][1];
    if (type === 'ban' && fav.best >= 0 && valid.includes(fav.best)) return fav.best;       // 禁你胜率最高的
    if (type === 'pick' && fav.most >= 0 && valid.includes(fav.most)) return fav.most;      // 用你最常用的
  }
  if (bpSteps()[BP.step][1] === 'pick') {
    let enemyHero = -1;
    if (Array.isArray(BP.picks)) {
      if (typeof BP.picks[0] === 'number' && BP.picks[0] >= 0) enemyHero = BP.picks[0];
      else if (Array.isArray(BP.picks[0]) && BP.picks[0].length) enemyHero = BP.picks[0][0];
    }
    if (enemyHero >= 0 && Math.random() < 0.6) {
      const mine = CHARS[enemyHero] && CHARS[enemyHero].id;
      if (mine) {
        const counters = valid.filter(i => CHARS[i] && CHARS[i].beats && CHARS[i].beats.includes(mine));
        if (counters.length) return counters[Math.random() * counters.length | 0];
      }
    }
  }
  return valid[Math.random() * valid.length | 0];
}
function bpTick(dt) {
  if (bpMode === 'watch2v2') { bpTickWatch2v2(dt); return; }
  if (!BP || BP.step >= bpSteps().length || !document.getElementById('bp').classList.contains('on') || NET.hold) return;
  BP.t = Math.max(0, BP.t - dt);
  document.getElementById('bpTime').textContent = `${Math.ceil(BP.t)} 秒`;
  document.getElementById('bpTime').classList.toggle('urgent', BP.t <= 8);
  if (!bpAuth()) return;
  const side = bpSteps()[BP.step][0];
  const isWatch = bpMode === 'cpuWatch' || (bpCustomOpts && bpCustomOpts.isWatch);
  const isCpuTurn = isWatch || !isMyTurnBP();
  if (isCpuTurn && bpMode !== 'net' && !isLocalBothHumanBP()) {
    bpCpuT -= dt;
    if (bpCpuT <= 0 || BP.t <= 0) {
      const choice = bpCpuChoice();
      bpApply(choice);
    }
    return;
  }
  if (BP.t <= 0) {
    const v = bpValidList();
    const chosen = bpSel >= 0 && bpValid(bpSel) && isMyTurnBP() ? bpSel : (v.length ? v[Math.random() * v.length | 0] : 0);
    bpApply(chosen);
  }
}
