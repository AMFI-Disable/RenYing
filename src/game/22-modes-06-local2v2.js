// ======================= 2v2 组队：你 + 电脑队友 vs 两电脑（p_cc）、两人 vs 两电脑（pp_cc）、两人 vs 两人（pp_pp） =======================
// 本文件：本机 2v2 的开局（两人 vs 两电脑、两人 vs 两人）和组队弹窗。
// ally：队友 C 交给电脑（p_cc），不然是同一台电脑上的 2P
function start2v2LocalCoop(p1 = 0, p2 = 2, foe1 = 1, foe2 = 3, level = 'normal', ally = false) {
  if (p2pActive()) netDropWaiting();
  initAudio(); refocusGame(); paused = false; human[0].rec = null; REC.on = false;
  M.mode = '2v2'; M.teamMutator = teamMutator;
  M.subMode = ally ? 'p_cc' : 'pp_cc';
  M.watchAi = false;
  M.level = level;
  M.bans = [];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  if (!M.map) M.map = rollMap();
  A.setChar(p1); C.setChar(p2);
  B.setChar(foe1); D.setChar(foe2);
  A.ctrl = human[0]; // 1P
  C.ctrl = ally ? new AICtrl(level) : human[1]; // 2P，或者电脑队友
  B.ctrl = new AICtrl(level);
  D.ctrl = new AICtrl(level);
  A.meter = B.meter = C.meter = D.meter = 35;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  showScreen(null);
  recBegin('loc');   // 2v2 也录回放：四个人每帧的按键（电脑的也记下来），回放时照着按
  startRound();
  say(ally ? `携手共斗 · 【${CHARS[p1].name}】与电脑队友【${CHARS[p2].name}】并肩！` : `双人共斗 · 【${CHARS[p1].name} & ${CHARS[p2].name}】同心破天道！`, 1.4);
}

function start2v2LocalVs(p1 = 0, p2 = 2, p3 = 1, p4 = 3) {
  if (p2pActive()) netDropWaiting();
  initAudio(); refocusGame(); paused = false; human[0].rec = null; REC.on = false;
  M.mode = '2v2'; M.teamMutator = teamMutator;
  M.subMode = 'pp_pp';
  M.watchAi = false;
  M.level = 'god';
  M.bans = [];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  if (!M.map) M.map = rollMap();
  A.setChar(p1); C.setChar(p2);
  B.setChar(p3); D.setChar(p4);
  A.ctrl = human[0]; // 1P
  C.ctrl = human[1]; // 2P
  B.ctrl = human[2] || new AICtrl('god'); // 3P
  D.ctrl = human[3] || new AICtrl('god'); // 4P
  A.meter = B.meter = C.meter = D.meter = 35;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  showScreen(null);
  recBegin('loc');
  startRound();
  say(`2v2 四人对决 · 苍龙 vs 赤凤！`, 1.4);
}

// 2v2 只有这一个入口：对战页的 2v2 卡片（离线版是单人页的「2v2 组队」）打开这个弹窗，先选对阵，再选同一台电脑 / 全服匹配 / 好友房间
let active2v2ModalMode = 'pp_cc';
const M2_TEXT = {
  p_cc: { desc: '你和一个电脑队友一队，对阵两个电脑。', local: '你用 WASD 或方向键，队友由电脑操控', match: '' },
  pp_cc: { desc: '你和队友一队，对阵两个电脑。', local: '1P 用 WASD，2P 用方向键 + K 攻击', match: '全服找一位队友，一起打两个电脑' },
  pp_pp: { desc: '两队各两人对打：你们两个对另外两个玩家。', local: '四人一台电脑：1P、2P 一队，3P、4P 一队', match: '全服找一位队友和两位对手' }
};
function render2v2Inline() {
  const mode = active2v2ModalMode, tx = M2_TEXT[mode];
  if (!tx) return;
  for (const b of document.querySelectorAll('#xiwu2v2Seg button')) b.classList.toggle('sel', b.dataset.m === mode);
  const descEl = $id('xiwu2v2Desc'), localDescEl = $id('xiwu2v2LocalDesc');
  if (descEl) descEl.textContent = tx.desc;
  if (localDescEl) localDescEl.textContent = tx.local;
}
function render2v2Modal() {
  render2v2Inline();
  const mode = active2v2ModalMode, tx = M2_TEXT[mode];
  if (!tx) return;
  for (const b of document.querySelectorAll('#m2Mutator button')) { b.classList.toggle('sel', b.dataset.mut === teamMutator); b.setAttribute('aria-pressed', String(b.dataset.mut === teamMutator)); }
  for (const b of document.querySelectorAll('#modal2v2Seg button')) b.classList.toggle('sel', b.dataset.m === mode);
  if ($id('m2LvWrap')) $id('m2LvWrap').hidden = mode === 'pp_pp';
  for (const id of ['btn2v2GoMatch', 'btn2v2GoOnline']) { if ($id(id)) $id(id).style.display = mode === 'p_cc' ? 'none' : ''; }
  if ($id('modal2v2Desc')) $id('modal2v2Desc').textContent = tx.desc;
  if ($id('modal2v2LocalDesc')) $id('modal2v2LocalDesc').textContent = tx.local;
  if ($id('modal2v2MatchDesc')) $id('modal2v2MatchDesc').textContent = tx.match;
}
if ($id('xiwu2v2Seg')) {
  $id('xiwu2v2Seg').addEventListener('click', e => {
    const b = e.target.closest('button[data-m]'); if (!b) return;
    active2v2ModalMode = b.dataset.m; SFX.slice(); render2v2Inline();
  });
}
if ($id('xiwu2v2StartBtn')) {
  $id('xiwu2v2StartBtn').addEventListener('click', () => {
    bpStart('2v2', { subMode: active2v2ModalMode, level: pickLevel });
  });
}
if ($id('xiwu2v2QuickBtn')) {
  $id('xiwu2v2QuickBtn').addEventListener('click', () => {
    const hero = menuHeroPick();
    const pool = CHARS.map((c, i) => i).filter(i => i !== hero);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (active2v2ModalMode === 'pp_pp') start2v2LocalVs(hero, pool[0], pool[1], pool[2]);
    else start2v2LocalCoop(hero, pool[0], pool[1], pool[2], pickLevel, active2v2ModalMode === 'p_cc');
    applySkins();
  });
}
if ($id('xiwu2v2WatchBtn')) {
  $id('xiwu2v2WatchBtn').addEventListener('click', () => {
    startWatch2v2Draft();
  });
}
function open2v2Modal(mode) {
  if (M2_TEXT[mode]) active2v2ModalMode = mode;
  $id('modal2v2').classList.remove('hidden');
  levelBarTo($id('m2LvWrap'));   // 对阵电脑时（你 + 电脑队友、两人 vs 两电脑）电脑的境界：借用共用的那一条，队友和对手一样
  render2v2Modal();
}
function open2v2Hub(mode, reveal = true) {   // 先回到放 2v2 卡片的那一页（离线版没有对战页，回单人页），再打开弹窗
  const scr = openScreen(OFFLINE_BUILD ? 'single' : 'netp', reveal);
  open2v2Modal(mode);
  return scr;
}
function close2v2Modal() { $id('modal2v2').classList.add('hidden'); levelBarTo(null); }
if ($id('m2Mutator')) $id('m2Mutator').addEventListener('click', e => { const b = e.target.closest('button[data-mut]'); if (b) { teamMutator = b.dataset.mut; render2v2Modal(); } });
$id('modal2v2Seg').addEventListener('click', e => {
  const b = e.target.closest('button[data-m]'); if (!b) return;
  active2v2ModalMode = b.dataset.m; SFX.slice(); render2v2Modal();
});
$id('modal2v2Close').addEventListener('click', close2v2Modal);
if ($id('btn2v2Quick')) $id('btn2v2Quick').addEventListener('click', () => {
  const hero = menuHeroPick();
  const pool = CHARS.map((c, i) => i).filter(i => i !== hero);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  close2v2Modal();
  if (active2v2ModalMode === 'pp_pp') start2v2LocalVs(hero, pool[0], pool[1], pool[2]);
  else start2v2LocalCoop(hero, pool[0], pool[1], pool[2], pickLevel, active2v2ModalMode === 'p_cc');
  applySkins();
});
$id('btn2v2GoLocal').addEventListener('click', () => {
  close2v2Modal();
  bpStart('2v2', { subMode: active2v2ModalMode, level: pickLevel });
});
$id('btn2v2GoMatch').addEventListener('click', () => {
  close2v2Modal();
  if (!$id('netp').classList.contains('on')) openScreen('netp');
  mmGo(active2v2ModalMode === 'pp_cc' ? '2v2_coop' : '2v2_vs');
});
$id('btn2v2GoOnline').addEventListener('click', () => {
  close2v2Modal();
  if (!$id('netp').classList.contains('on')) openScreen('netp');
  netRoomMode = active2v2ModalMode;
  setRoomModeUI(netRoomMode);
  const hb = $id('hostBtn');
  if (hb) hb.click();
  toast(`已建好${active2v2ModalMode === 'pp_cc' ? '两人 vs 两电脑' : '两人 vs 两人'}的房间，把房间号发给朋友`);
});
$id('btn2v2GoWatch').addEventListener('click', () => {
  close2v2Modal();
  startWatch2v2Draft();
});
