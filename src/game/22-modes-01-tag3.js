// ======================= 3v3 门派车轮战 =======================
// 车轮战设置页没有自己的设置了：电脑境界用单人页顶上共用的那一条（pickLevel），选人统一在点将台里做（各禁 1 选 3）
function renderTag3() {}

function startTag3Match(pTeam, eTeam, lv, isWatch = false) {
  if (p2pActive()) netDropWaiting();
  refocusGame();
  human[0].rec = null;
  REC.on = false;

  M.mode = 'tag3'; M.teamMutator = teamMutator;
  M.level = lv || pickLevel || 'normal';
  M.teams = [[...pTeam], [...eTeam]];
  M.teamIdx = [0, 0];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  M.duo = null;
  M.watchAi = !!isWatch;
  if (!M.map) M.map = rollMap();

  setChars(M.teams[0][0], M.teams[1][0]);
  A.ctrl = isWatch ? new AICtrl(M.level || 'god') : human[0];
  B.ctrl = new AICtrl(M.level || 'god');
  A.meter = B.meter = 0;
  human[0].clear(); human[1].clear();

  showScreen(null);
  startRound();
  say(isWatch ? '3v3 门派车轮战 · AI 群英观战' : '3v3 门派车轮战', 1.4);
}

const tag3StartBtn = document.getElementById('tag3StartBtn');
if (tag3StartBtn) {
  tag3StartBtn.addEventListener('click', () => {
    initAudio();
    paused = false;
    bpStart('tag3', { level: pickLevel, isWatch: false });
  });
}
