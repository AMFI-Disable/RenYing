function showEnd(w) {
  if (REPLAY.on) { replayEnd(w); return; }
  if (typeof statMatchEnd === 'function') statMatchEnd(w);
  if (M.worldKey) {
    if (REC.on) recSave(w);
    worldKeyRound(w); return;
  }
  let reviewRecord = REC.on ? recSave(w) : (M.reviewReady ? RP.last : null);
  if (RP.run && RP.run.mode === M.mode) {
    if (M.mode === 'raid' && w === 0) reviewRecord = RP.last || reviewRecord;
    else { reviewRecord = RP.run.segments.length ? rpRunReplay(RP.run, w) : reviewRecord; RP.run = null; RP.last = reviewRecord; }
    if (reviewRecord && reviewRecord.runId) rpRunStore(reviewRecord);
  }
  if (typeof endReviewShow === 'function') endReviewShow(reviewRecord);
  if (M.mode === 'tag3') { $id('endReview').classList.add('hidden'); $id('endReviewBtn').setAttribute('aria-expanded', 'false'); }
  const stats = M.combatStats && M.combatStats[localIdx()];
  const card = $id('endCombatCard');
  if (card) card.textContent = stats ? `${cvT('总伤害')} ${Math.round(stats.damage)} · ${cvT('最长连击')} ${stats.combo} · ${cvT('破防次数')} ${stats.breaks} · ${cvT('坠崖')} ${stats.falls}` : '';
  const relayTeams = $id('endRelayTeams');
  relayTeams.classList.toggle('hidden', M.mode !== 'tag3' || !Array.isArray(M.teams));
  if (M.mode === 'tag3' && Array.isArray(M.teams)) {
    relayTeams.textContent = M.teams.map((team, side) => `${cvT(side === 0 ? '我方出战顺序' : '对方出战顺序')}: ${team.map((i, slot) => `${cvT((CHARS[i] || {}).name || '')}${slot < (M.teamIdx[side] || 0) ? cvT('（已击败）') : ''}`).join(' → ')}`).join('  |  ');
  } else relayTeams.textContent = '';
  taskMatchEnd(w);
  $id('endKicker').textContent = '';
  $id('endRk').innerHTML = ''; $id('endRk').classList.add('hidden');
  $id('netRepickBtn').classList.add('hidden');   // 「换人再战」只给联机局；上一局是联机时别带到肉鸽、剑阁、车轮战的结算里
  $id('againBtn').style.display = (isAiVsAi() || M.watchAi || (M.mode === 'watch2v2' && M.watchAi)) ? 'none' : ''; $id('rpWatch').style.display = RP.last ? '' : 'none'; $id('rpWatch').textContent = '看回放';
  $id('endChangeHeroBtn').classList.toggle('hidden', !['cpu', 'tag3', 'chaos', 'mayhem', 'maps'].includes(M.mode) || !!M.watchAi);
  $id('endChangeHeroBtn').textContent = cvT(M.mode === 'tag3' ? '更换队伍再战' : '换侠客再战');
  $id('endHistoryBtn').classList.toggle('hidden', !RP.last);
  if (cujuOn()) {   // 墨球蹴鞠：只看比分与球场数据，不发墨锭
    const cj = M.cuju || { score: [0, 0] }, watch = !!M.watchAi, pvp = !!M.cujuPvp, net = M.mode === 'net';
    const mySide = net && NET.role === 'client' ? 1 : 0, iWon = w === mySide;
    if (card) {
      const touches = cj.touches || [0, 0, 0, 0], shots = cj.shots || [0, 0], saves = cj.saves || [0, 0];
      const t0 = (touches[0] || 0) + (touches[2] || 0), t1 = (touches[1] || 0) + (touches[3] || 0);
      card.innerHTML = `<div class="end-stat-grid"><span>${cvT('触球')} ${t0} : ${t1}</span><span>${cvT('破门')} ${shots[0] || 0} : ${shots[1] || 0}</span><span>${cvT('扑救')} ${saves[0] || 0} : ${saves[1] || 0}</span><span>${cvT('最快球速')} ${Math.round(cj.topSpeed || 0)}</span></div>`;
    }
    playSting(watch || pvp || iWon ? 'victory' : 'defeat');
    const winLabel = is2v2()
      ? (w === 0 ? `${A.look.name} · ${C.look.name}` : `${B.look.name} · ${D.look.name}`)
      : ([A, B][w] || A).look.name;
    inkTitle(winLabel, !(watch || pvp) && !iWon);
    $id('endKicker').textContent = is2v2() ? '2v2 墨球蹴鞠' : '墨球蹴鞠';
    $id('endSub').textContent = `比分 ${cj.score[0]} : ${cj.score[1]}`;
    $id('endRank').textContent = cj.golden ? '金球决胜' : net ? '好友联机蹴鞠' : watch ? '电脑对踢' : pvp ? '本地双人' : iWon ? '一脚定乾坤' : '再练练脚法';
    const again = $id('againBtn');
    again.style.display = watch ? 'none' : ''; again.disabled = false; again.textContent = '再踢一场';
    if (net && NET.open) $id('netRepickBtn').classList.remove('hidden');
    setTimeout(() => showScreen('end'), 300);
    return;
  }
  if (M.stage) {
    const win = w === 0;
    M.stage = null;
    setTimeout(() => stageShowEnd(win, win ? (M.wins[1] === 0 ? 3 : 2) : 0, `比分 ${M.wins[0]} : ${M.wins[1]}${win ? '<br><span style="font-size:13px">2 : 0 三星，2 : 1 两星</span>' : '，再磨一磨剑'}`), 300);
    return;
  }
  if (M.mode === 'watch2v2' || M.mode === '2v2') {
    const isWatch = !!M.watchAi;
    const win = w === 0;
    const myTeam = typeof localTeam === 'function' ? localTeam() : 0;
    const iWon = w === myTeam;
    playSting(isWatch ? 'victory' : (iWon ? 'victory' : 'defeat'));
    const t = document.getElementById('endTitle');
    if (isWatch) {
      inkTitle(win ? `${A.look.name} · ${C.look.name}` : `${B.look.name} · ${D.look.name}`, false);
      const banStr = (M.bans && M.bans.length === 2 && CHARS[M.bans[0]] && CHARS[M.bans[1]]) ? `（本局禁选：${CHARS[M.bans[0]].name}、${CHARS[M.bans[1]].name}）` : '';
      document.getElementById('endSub').textContent = `2v2 天道演武决出胜负，比分 ${M.wins[0]} : ${M.wins[1]} ${banStr}`;
      $id('endRank').textContent = '四位天道神境 AI 倾力交锋';
      const again = document.getElementById('againBtn');
      again.style.display = 'none';
    } else {
      inkTitle(win ? `${A.look.name} · ${C.look.name}` : `${B.look.name} · ${D.look.name}`, !iWon);
      const modeNames = { p_cc: '2v2 携手共斗', pp_cc: '2v2 双人共斗', pp_pp: '2v2 四人对决' };
      const modeName = modeNames[M.subMode] || '2v2 组队演武';
      document.getElementById('endSub').textContent = `${modeName} · ${iWon ? '凯旋大捷！' : '惜败，择日再战！'} 比分 ${M.wins[0]} : ${M.wins[1]}`;
      $id('endRank').textContent = iWon ? '双雄合璧，克敌制胜' : '胜败乃兵家常事';
      const again = document.getElementById('againBtn');
      again.style.display = '';
      again.disabled = false;
      again.textContent = '再战一局';
    }
    setTimeout(() => showScreen('end'), 300);
    return;
  }
  if (M.mode === 'tag3') {
    const win = w === 0;
    if (win) {
      PROF.ink = (PROF.ink || 0) + 60;
      saveProfile();
    }
    playSting(win ? 'victory' : 'defeat');
    const t = document.getElementById('endTitle');
    t.className = '';   // 上一局留下的毛笔大字样式会把这行长标题撑出屏幕
    t.textContent = win ? '门派车轮战 · 大捷！' : '门派车轮战 · 惜败';
    t.style.color = win ? 'var(--gold)' : 'rgb(255,107,107)';
    document.getElementById('endSub').textContent = win ? `三阵连克，斩获 60 墨锭！（击破比分 ${M.wins[0]} : ${M.wins[1]}）` : `胜败乃兵家常事，重整旗鼓再战（击破比分 ${M.wins[0]} : ${M.wins[1]}）`;
    $id('endRank').textContent = win ? '已击破敌方全员侠客' : '敌方阵线技高一筹';
    const again = document.getElementById('againBtn');
    if (isAiVsAi() || M.watchAi) { again.style.display = 'none'; }
    else { again.style.display = ''; again.disabled = false; again.textContent = cvT('原阵容再战'); }
    setTimeout(() => showScreen('end'), 300);
    return;
  }
  if (isRaid()) {
    const win = w === 0;
    playSting(win ? 'victory' : 'defeat');
    const wave = M.raidWave || 1;
    const rewardInk = win ? (M.raidLastReward || 600) : 120;
    if (win && M.mode === 'net' && !M.raidPaid) { M.raidPaid = true; raidPay(rewardInk); }
    if (!win && !M.raidConsoled) {
      M.raidConsoled = true;
      PROF.ink = (PROF.ink || 0) + rewardInk;
      saveProfile();
      toast(`同袍肉鸽虽败犹荣 · 全员共享抚恤 +${rewardInk} 墨锭`);
    }
    const squadNames = sideFighters(0).map(f => f.look.name).join(' · ');
    const bossNames = (M.raidBoss && M.raidBoss.heroNames) ? M.raidBoss.heroNames.join('·') : B.look.name;
    $id('endKicker').textContent = `同袍肉鸽 · 第 ${wave} 重魔劫 · 全员收益共享`;
    inkTitle(win ? `${squadNames}` : `${bossNames} 融魂首领`, !win);
    const perkCount = (M.towerPerks || []).length;
    document.getElementById('endSub').textContent = win
      ? `🎉 讨伐大捷！全员共享斩获 +${rewardInk} 墨锭（累计收获 ${M.raidInkEarned || rewardInk} 墨锭 · 全队共鸣 ${perkCount} 卷秘卷）`
      : `惜败于六技融魂首领【${bossNames}】！全员仍获共享赏金 +${rewardInk} 墨锭（本趟累计 ${M.raidInkEarned || rewardInk} 墨锭）`;
    $id('endRank').textContent = win
      ? `已击破拥有 300% 气血、125% 伤害与六项绝技的融魂魔首！点击下方顿悟全队共享秘卷，迎战下一尊魔首`
      : `融魂首领身负三侠六技、三倍气血，召集 2–3 名精锐同袍善用闪避与合击定能破敌！`;
    const again = document.getElementById('againBtn');
    again.style.display = '';
    again.disabled = false;
    again.textContent = M.mode === 'net' ? '再战一场' : (win ? '顿悟共享秘卷 · 迎战下一魔首' : '重整旗鼓 · 再战同袍肉鸽');   // 联机的再战是两边重新点将
    setTimeout(() => showScreen('end'), 300);
    return;
  }
  if (M.mode === 'tower') {
    const win = w === 0;
    playSting(win ? 'victory' : 'defeat');
    const t = document.getElementById('endTitle');
    t.className = '';   // 上一局留下的毛笔大字样式会把这行长标题撑出屏幕
    t.textContent = win ? '剑阁大捷！' : '试炼止步';
    t.style.color = win ? 'var(--gold)' : 'rgb(255,107,107)';
    document.getElementById('endSub').textContent = `止步于万仞剑阁第 ${M.towerFloor} 层，共领悟 ${(M.towerPerks || []).length} 卷武林秘籍！`;
    $id('endRank').textContent = `最高纪录：第 ${Math.max(PROF.towerMaxFloor || 0, M.towerFloor)} 层`;
    const again = document.getElementById('againBtn');
    again.disabled = false; again.textContent = '重登剑阁';
    setTimeout(() => showScreen('end'), 300);
    return;
  }
  if (w >= 0) playSting(w === localTeam() ? 'victory' : 'defeat');
  if (M.mode === 'net') {
    const duration = Date.now() - (NET.matchStartTime || Date.now());
    const hits = NET.matchHits || 0;
    const isQualifying = duration >= 15000 || hits >= 4;
    NET.consensus = NET.consensus || {};
    NET.consensus.localWinner = w;
    NET.consensus.myTeam = localTeam();   // 结算可能在离开房间以后才落下（等对方确认最多 5 秒），那时 M.mode 已经不是 net，先记下自己是哪一边
    NET.consensus.qualifying = isQualifying;
    send({
      sys: 'match_finish',
      matchId: NET.matchId || '',
      winner: w,
      duration,
      hits,
      qualifying: isQualifying
    });
    send({ report: w === 0 ? 'host' : 'client' });
  }
  if (M.mode === 'cpu' || M.mode === 'net') adaptRecord(w === localTeam());
  $id('endRank').textContent = NET.forfeitResult || (M.mode === 'net' && !ACC.name ? '登录后，胜负会计入排行榜' : '');
  reportProgress(w);
  const t = document.getElementById('endTitle');
  const wf = [A, B][w];
  const lost = w >= 0 && w !== localTeam() && !(M.mode === 'pvp' || isAiVsAi() || M.watchAi);
  if (w < 0) { t.textContent = '平手'; t.className = ''; t.style.color = ''; }
  else inkTitle(wf.look.name, lost);
  document.getElementById('endSub').textContent = M.mode === 'cpu' ? (w === 0 ? '月下无敌手' : '再磨一磨剑')
    : M.mode === 'net' ? `${w === localTeam() ? '你赢了' : '你输了'}，比分 ${M.wins[0]} : ${M.wins[1]}` : `比分 ${M.wins[0]} : ${M.wins[1]}`;
  const again = document.getElementById('againBtn');
  const repickBtn = document.getElementById('netRepickBtn');
  if (repickBtn) repickBtn.classList.toggle('hidden', M.mode !== 'net');
  if (isAiVsAi() || M.watchAi || M.mode === 'watch2v2') {
    again.style.display = 'none';
  } else if (M.mode === 'net' && NET.isRanked) {   // 排位赛没有再来一场：打完回大厅，想打就重新排
    again.style.display = 'none';
    if (repickBtn) repickBtn.classList.add('hidden');
  } else if (M.mode === 'net') {
    again.style.display = '';
    again.disabled = false;
    again.textContent = '再战一局 (BO3)';
  } else {
    again.style.display = '';
    again.disabled = false;
    again.textContent = '再战';
  }
  setTimeout(() => showScreen('end'), 300);
}
function raidPay(gain) {
  PROF.ink = (PROF.ink || 0) + gain;
  saveProfile();
  toast(`🎉 众志破魔大捷！全员共享丰厚悬赏 +${gain} 墨锭！`);
}
function endRound() {
  const w = M.koWinner;
  if (w >= 0) M.wins[w]++;
  if (REC.on && (M.mode === 'tag3' || M.mode === 'saga' || (M.mode === 'tower' && w === 0) || (M.mode === 'raid' && RP.run && RP.run.mode === 'raid'))) recSave(w);
  if (M.mode === 'boss') { gbossFinish(w < 0 ? 'time' : 'down'); return; }
  if (M.worldKey && M.worldKey.kind === 'boss') { worldKeyRound(w); return; }   // 全服肉鸽的天道 Boss：结果和奖励都以服务器为准，这里不加墨锭（车轮战照常换人，打完在 showEnd 里交出去）
  if (M.mode === 'saga') { sagaEnd(w); return; }
  if (cujuOn()) { M.phase = 'end'; showEnd(w); return; }   // 墨球蹴鞠只有一局
  if (isRaid()) {
    if (w === 0) {
      for (const f of sideFighters(0)) scFire(f, 'clear');
      const wave = M.raidWave || 1;
      const gain = 600 + (wave - 1) * 200;
      M.raidLastReward = gain;
      M.raidInkEarned = (M.raidInkEarned || 0) + gain;
      if (!ROLL.on && !REPLAY.on) raidPay(gain);   // 联机时这一帧还可能被回滚改掉：等两边都确认打完（showEnd）再发墨锭；看录像不发
    }
    M.phase = 'end';
    if (!ROLL.on) showEnd(w);   // 联机由回滚确认这一帧之后统一弹结算
    return;
  }
  if (M.mode === 'tower') {
    if (w === 0) {
      scFire(A, 'clear');
      M.phase = 'perk';
      paused = true;
      showTowerPerkModal();
      return;
    } else {
      clearTowerRun();
      M.phase = 'end';
      showEnd(w);
      return;
    }
  }
  if (M.mode === 'tag3') {
    if (w < 0) {
      M.round++;
      if (M.round >= 10) {
        M.phase = 'end';
        const finalWinner = M.teamIdx[0] < M.teamIdx[1] ? 0 : (M.teamIdx[1] < M.teamIdx[0] ? 1 : (M.wins[0] >= M.wins[1] ? 0 : 1));
        showEnd(finalWinner);
        return;
      }
      if (!M.watchAi) recBegin('loc');
      startRound();
      return;
    }
    const loserSide = 1 - w;
    M.teamIdx[loserSide]++;
    if (M.teamIdx[loserSide] >= 3) {
      M.phase = 'end';
      showEnd(w);
      return;
    }
    const winnerFighter = [A, B][w];
    const recoverHp = CARRY_HEAL;
    const survHp = clamp(winnerFighter.hp + recoverHp, 1, winnerFighter.maxHp);
    const survRatio = survHp / winnerFighter.maxHp;
    M.carry = [null, null];
    M.carry[w] = survRatio;
    M.carry[loserSide] = 1.0;

    const nextHeroIdx = M.teams[loserSide][M.teamIdx[loserSide]];
    const loserFighter = [A, B][loserSide];
    loserFighter.setChar(nextHeroIdx);
    loserFighter.meter = 0;
    if (loserSide === 0 && M.watchAi) loserFighter.ctrl = new AICtrl(M.level || 'god');
    if (A.ctrl && typeof A.ctrl.updateTactic === 'function') A.ctrl.updateTactic(A, B);
    if (B.ctrl && typeof B.ctrl.updateTactic === 'function') B.ctrl.updateTactic(B, A);

    M.round++;
    if (!M.watchAi) recBegin('loc');
    startRound();
    const heroName = CHARS[nextHeroIdx].name;
    const isMid = M.teamIdx[loserSide] === 1;
    const txt = loserSide === 0
      ? (isMid ? `中坚 ${heroName} 接力出阵！` : `大将 ${heroName} 背水一战！`)
      : (isMid ? `敌方中坚 ${heroName} 出阵！` : `敌方大将 ${heroName} 亲征！`);
    say(txt, 1.4);
    return;
  }
  const needWins = isDuo() ? (M.duo[0].length || 3) : WINS_NEEDED;
  const maxRnds = isDuo() ? Math.max(MAX_ROUNDS, needWins * 2 + 1) : MAX_ROUNDS;
  if ((w >= 0 && M.wins[w] >= needWins) || M.round >= maxRnds) {
    if (M.mode === 'demo') return startMatch('demo');
    M.phase = 'end';
    const finalWinner = w >= 0 ? w : (M.wins[0] >= M.wins[1] ? 0 : 1);
    netEmit({ e: 'end', w: finalWinner, wins: [...M.wins] });
    if (!ROLL.on) showEnd(finalWinner);
    return;
  }
  M.round++;
  M.carry = [null, null];   // 联机车轮接力带血：活下来的人继承剩余血量 +CARRY_HEAL，倒下的人换下一名角色满血。其余模式每回合双方满血
  if (isDuo()) [A, B].forEach((f, i) => { if (f.hp > 0 && (w < 0 || i === w)) M.carry[i] = Math.min(1, (f.hp + CARRY_HEAL) / f.maxHp); });
  const relay = duoRelay(w);
  startRound();
  if (relay) say(relay, 1.4);
}
// 联机车轮接力对战（各选 3 人）：输掉这回合的一方换上下一名角色（满血），赢的人带血 +CARRY_HEAL 继续守擂；谁的全员都被击倒谁输
const isDuo = () => !!(M.duo && !is2v2() && ['net', 'replay'].includes(M.mode));
function duoRelay(w) {
  if (!isDuo() || w < 0) return '';
  const loser = 1 - w, team = M.duo[loser] || [];
  const idx = Math.min(team.length - 1, M.wins[w]);
  const next = team[idx];
  const f = [A, B][loser];
  if (next === undefined || next < 0 || next === f.chIdx) return '';
  f.setChar(next); f.meter = 0;
  if (f.ctrl && typeof f.ctrl.updateTactic === 'function') f.ctrl.updateTactic(f, [A, B][w]);
  if (team.length >= 3) {
    const isMid = idx === 1;
    return loser === localIdx()
      ? (isMid ? `中坚 ${CHARS[next].name} 接力出阵！` : `大将 ${CHARS[next].name} 背水一战！`)
      : (isMid ? `对方中坚 ${CHARS[next].name} 出阵！` : `对方大将 ${CHARS[next].name} 亲征！`);
  }
  return `${loser === localIdx() ? '' : '对方 '}${CHARS[next].name} 接力出战！`;
}
