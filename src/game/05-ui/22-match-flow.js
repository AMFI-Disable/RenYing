// === 全局对局流转（再战 / 暂停 / 返回大厅） ===
const MODE_HANDLERS = {
  boss: {
    rematch: () => { M.mode = 'demo'; openGboss(); startMatch('demo'); },   // 天魔讨伐：回讨伐页看结果
    onLeave: () => gbossQuit(),   // 打到一半退出：已经打出的伤害照样交
    toMenuScreen: () => openGboss(),
  },
  net: {
    rematch: () => {
      if (!NET.open) {
        toast('网络已断开');
        return;
      }
      if (NET.role === 'host') {
        const duo = M.duo ? JSON.parse(JSON.stringify(M.duo)) : null;   // 各选 2 人的对局：同阵容再战，从各自第一人打起
        const picks = roomDef().four ? [A.chIdx, B.chIdx, C.chIdx, D.chIdx] : duo ? [duo[0][0], duo[1][0]] : [A.chIdx, B.chIdx];
        const seed = (Math.random() * 2147483647) | 0;
        const mv = netMapVotes();
        send({ sys: 'rematch', action: 'start' });
        const mut = netTeamMutator();
        const competitiveScrolls = M.hasBuffs && M.competitiveScrolls ? JSON.parse(JSON.stringify(M.competitiveScrolls)) : null;
        const loadouts = [typeof armoryCombatLoadoutMap === 'function' ? armoryCombatLoadoutMap() : {}, NET.peerLoadout || {}];
        send({ rstart: duo ? { ch: picks, seed, duo, mv, mut, competitiveScrolls, loadouts } : { ch: picks, seed, mv, mut, competitiveScrolls, loadouts } });
        rollStart(picks, seed, duo, mv, undefined, mut, competitiveScrolls, loadouts);
      } else {
        send({ sys: 'rematch', action: 'ask' });
        toast('已向房主发送再战请求');
      }
    },
  },
  '2v2': {
    rematch: () => bpStart('2v2', { subMode: M.subMode || 'pp_cc', level: M.level || 'normal' }),
    toMenuScreen: () => open2v2Hub(),
  },
  watch2v2: {
    rematch: () => {
      if (!M.watchAi) bpStart('2v2', { subMode: M.subMode || 'pp_cc', level: M.level || 'normal' });
      else startWatch2v2Draft();
    },
    toMenuScreen: () => open2v2Hub(),
  },
  cuju: {
    rematch: () => bpStart('cuju', { level: M.level || pickLevel, pvp: !!M.cujuPvp }),   // 再踢一场：同样的对手（电脑或本地 2P），重新选人
    toMenuScreen: () => { singleSec('cuju'); showScreen('single'); },
  },
  mayhem: {
    rematch: () => bpStart('mayhem', { level: pickLevel, isWatch: false }),
    toMenuScreen: () => { singleSec('mayhem'); showScreen('single'); },
  },
  maps: {
    rematch: () => bpStart('maps', { level: pickLevel, isWatch: false }),   // 再来一局：按现在的票重新选图
  },
  tag3: {
    rematch: () => tag3Rematch(),
    toMenuScreen: () => { singleSec('tag3'); showScreen('single'); },
  },
  tower: {
    rematch: () => bpStart('tower', { isWatch: false }),
    onLeave: () => saveTowerRun(),
    toMenuScreen: () => { singleSec('tower'); showScreen('single'); },
  },
  chaos: {
    rematch: () => bpStart('chaos', { level: pickLevel, isWatch: false }),
    toMenuScreen: () => { singleSec('chaos'); showScreen('single'); },
  },
  saga: {
    toMenuScreen: () => { singleSec('saga'); showScreen('single'); },
  },
  cpu: {
    rematch: () => {
      if (M.quick) {   // 从首页直接开打的：同一个角色、同一个难度，换个随机对手再来
        menuLock = false;
        heroQuickFight(M.level);
        return;
      }
      bpStart('cpu');
    },
  },
};

function registerModeHandler(mode, handler) {
  MODE_HANDLERS[mode] = Object.assign(MODE_HANDLERS[mode] || {}, handler);
}

const cpuTutBtn = document.getElementById('cpuTutBtn');
if (cpuTutBtn) cpuTutBtn.addEventListener('click', () => { initAudio(); startTutorial(); });

document.getElementById('againBtn').addEventListener('click', () => {
  if (M.mode === 'boss') { MODE_HANDLERS.boss.rematch(); return; }
  if (isAiVsAi() || M.watchAi || (M.mode === 'watch2v2' && M.watchAi)) return;
  if (M.mode === 'net' && NET.isRanked) return;   // 排位赛没有再来一场
  if (isRaid()) {
    if (M.koWinner === 0) {
      M.phase = 'perk';
      paused = true;
      showTowerPerkModal();
    } else {
      bpStart('raid', { squadSize: M.raidSquadSize || rougeSquadSize || 3 });
    }
    return;
  }
  const handler = MODE_HANDLERS[M.mode];
  if (handler && handler.rematch) {
    handler.rematch();
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

function toMenu(returnHome = false) {
  if (typeof competitiveDraftStopTimer === 'function') competitiveDraftStopTimer();
  if (typeof mapBriefingTimer !== 'undefined' && mapBriefingTimer) { clearInterval(mapBriefingTimer); mapBriefingTimer = null; }
  if (typeof competitiveDraft !== 'undefined') competitiveDraft = null;
  if (typeof onlineCompetitiveDraft !== 'undefined') onlineCompetitiveDraft = null;
  ROLL.on = false; REC.on = false;
  if (REPLAY.on) { REPLAY.on = false; $id('rpBar').classList.add('hidden'); }
  if (FOREST.on) { FOREST.on = false; FOREST.mons = []; FOREST.shots = []; B.forestProxy = false; B.hidden = false; }
  if (WORLD.on) worldLeave();
  M.worldKey = null;
  M.hasBuffs = false; M.competitiveScrolls = null;
  M.stage = null;
  if (TUT) endTutorial();
  // 好友房的房主在结算页，对手已经走了、房间还开着：不关房间，回到联机页继续等人
  const keepRoom = !!(NET.keepRoom && !NET.open && typeof P2P !== 'undefined' && P2P.friend && P2P.peer);
  paused = false; BP = null; watch2v2Bp = null; B.dummy = false; if (!keepRoom && (M.mode === 'net' || bpMode === 'net')) netLeave(); bpMode = 'cpu';
  const prevMode = M.mode;
  const handler = MODE_HANDLERS[prevMode];
  if (handler && handler.onLeave) handler.onLeave();
  M.mode = 'demo';
  if (returnHome) showScreen('menu');
  else if (handler && handler.toMenuScreen) handler.toMenuScreen();
  else showScreen('menu');
  if (prevMode !== 'demo') startMatch('demo');   // 首页背景那场比武本来就还在打，别重新摆一次
  if (keepRoom && !returnHome) selectMode('net');
}

document.getElementById('quitBtn').addEventListener('click', toMenu);
document.getElementById('menuBtn').addEventListener('click', () => { if (typeof statMatchQuit === 'function') statMatchQuit(); toMenu(true); });
