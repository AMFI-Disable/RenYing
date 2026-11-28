// ======================= 3v3 门派车轮战 & 援护换阵（v1.3.0） =======================
// 本文件：3v3 车轮战的模式卡、开局（startTag3Match）以及确定性援护登场（Bench Assist）与换阵连携（Hot-Tag Relay Swap）。
const TAG3_ASSIST_CD = 14.0;
const TAG3_ASSIST_COST = 25;
const TAG3_HOTTAG_COST = 35;
const TAG3_HOTTAG_LOCK = 2.5;

const TAG3_ASSIST_EFFECTS = {
  qingfeng:   { label: '疾风剑气', rgb: '120,230,255', dmg: 26, range: 460, effect: 'launch' },
  feiying:    { label: '影镖突袭', rgb: '235,95,125',  dmg: 24, range: 440, effect: 'root' },
  tieshan:    { label: '玄铁震波', rgb: '240,185,95',  dmg: 22, range: 260, effect: 'armor' },
  lingshuang: { label: '寒枪点雪', rgb: '165,235,255', dmg: 25, range: 360, effect: 'frost' },
  liuyun:     { label: '双风破阵', rgb: '145,245,220', dmg: 22, range: 520, effect: 'push' },
  leiming:    { label: '天雷落击', rgb: '175,185,255', dmg: 28, range: 340, effect: 'stun' },
  moyu:       { label: '泼墨成阵', rgb: '165,165,205', dmg: 20, range: 380, effect: 'root' },
  yuehua:     { label: '月华护心', rgb: '215,210,255', dmg: 16, range: 300, effect: 'heal' },
  yanling:    { label: '凌空翎雨', rgb: '150,235,245', dmg: 24, range: 480, effect: 'launch' },
  yuxiao:     { label: '清音震魂', rgb: '155,245,205', dmg: 22, range: 440, effect: 'guard' },
  zuixian:    { label: '醉意倾壶', rgb: '255,175,90',  dmg: 20, range: 360, effect: 'burn' },
  gouchen:    { label: '飞锤钩索', rgb: '235,165,110', dmg: 20, range: 480, effect: 'pull' },
  lingque:    { label: '飞梭挂印', rgb: '235,125,215', dmg: 22, range: 460, effect: 'mark' },
  liying:     { label: '雾影袭背', rgb: '195,145,245', dmg: 24, range: 380, effect: 'mark' },
  cixian:     { label: '磁极牵引', rgb: '125,210,255', dmg: 20, range: 440, effect: 'pull' },
  qianji:     { label: '机傀针雨', rgb: '245,200,115', dmg: 24, range: 460, effect: 'guard' },
  chixiao:    { label: '烈焰灼阵', rgb: '255,120,75',  dmg: 26, range: 360, effect: 'burn' },
  xuanji:     { label: '星漩引力', rgb: '165,180,255', dmg: 22, range: 420, effect: 'pull' },
  qingluan:   { label: '青鸾清音', rgb: '120,245,195', dmg: 14, range: 320, effect: 'heal' },
  xuanwu:     { label: '玄壁镇岳', rgb: '130,215,195', dmg: 22, range: 280, effect: 'armor' },
};

function tag3AssistInit() {
  M.tag3Assist = { cd: [0, 0], tagLock: [0, 0], cameo: null };
  if (!M.tag3BenchHp) M.tag3BenchHp = [{}, {}];
}

function tag3BenchSlot(side) {
  if (M.mode === 'tag3' && Array.isArray(M.teams) && Array.isArray(M.teams[side])) {
    const nextSlot = (M.teamIdx[side] || 0) + 1;
    if (nextSlot < M.teams[side].length) return { slot: nextSlot, chIdx: M.teams[side][nextSlot] };
  } else if (typeof isDuo === 'function' && isDuo() && Array.isArray(M.duo) && Array.isArray(M.duo[side])) {
    const curSlot = Math.min(M.duo[side].length - 1, M.wins[1 - side] || 0);
    const nextSlot = curSlot + 1;
    if (nextSlot < M.duo[side].length) return { slot: nextSlot, chIdx: M.duo[side][nextSlot] };
  }
  return null;
}

function tag3AssistTick() {
  const st = M.tag3Assist;
  if (!st) return;
  for (let i = 0; i < 2; i++) {
    if (st.cd[i] > 0) st.cd[i] = Math.max(0, st.cd[i] - STEP);
    if (st.tagLock[i] > 0) st.tagLock[i] = Math.max(0, st.tagLock[i] - STEP);
  }
  if (st.cameo) {
    st.cameo.t += STEP;
    if (st.cameo.t >= st.cameo.dur) st.cameo = null;
  }
}

function tryTag3Assist(f, foe, hotTag) {
  if (!f || M.phase !== 'fight' || f.hp <= 0) return false;
  if (M.mode !== 'tag3' && !(typeof isDuo === 'function' && isDuo())) return false;
  const side = f.idx === 0 ? 0 : 1;
  const bench = tag3BenchSlot(side);
  if (!bench || !CHARS[bench.chIdx]) return false;
  if (!M.tag3Assist) tag3AssistInit();
  const st = M.tag3Assist;
  const benchCh = CHARS[bench.chIdx];

  // 按住下键 + 援护键（或显式 hotTag）：3v3 车轮战中场换阵连携（Hot-Tag Relay Swap）
  if (hotTag && M.mode === 'tag3') {
    if (st.tagLock[side] > 0 || f.meter < TAG3_HOTTAG_COST) return false;
    if (['special', 'held', 'knockdown'].includes(f.state)) return false;
    const curSlot = M.teamIdx[side] || 0;
    const curChIdx = M.teams[side][curSlot];
    const hpMap = (M.tag3BenchHp && M.tag3BenchHp[side]) || (M.tag3BenchHp = [{}, {}])[side];
    hpMap[curChIdx] = clamp(f.hp / Math.max(1, f.maxHp), 0.05, 1);

    M.teams[side][curSlot] = bench.chIdx;
    M.teams[side][bench.slot] = curChIdx;
    const nextRatio = hpMap[bench.chIdx] !== undefined ? hpMap[bench.chIdx] : 1;
    const prevMeter = Math.max(0, f.meter - TAG3_HOTTAG_COST);
    const px = f.x, py = f.y, pface = f.face;

    f.setChar(bench.chIdx);
    f.hp = f.lagHp = Math.max(1, Math.round(f.maxHp * nextRatio * 10) / 10);
    f.meter = prevMeter;
    f.x = px; f.y = py; f.face = pface;
    f.invul = Math.max(f.invul || 0, 0.25);
    f.state = f.onGround() ? 'idle' : 'air';
    f.t = 0; f.move = null; f.skill = null;
    st.tagLock[side] = TAG3_HOTTAG_LOCK;
    if (f.ctrl && typeof f.ctrl.updateTactic === 'function') f.ctrl.updateTactic(f, foe);

    // 若对手近身或浮空，换阵进场带一记接力挑斩延长连段
    if (foe && foe.hp > 0 && Math.abs(foe.x - f.x) < 220 && Math.abs(foe.y - f.y) < 130 && foe.invul <= 0) {
      const defRating = (foe.ch && foe.ch.stat && foe.ch.stat.defRating) || 1;
      foe.hp = Math.max(foe.dummy ? 1 : 1, foe.hp - 18 / defRating);
      foe.vy = Math.min(foe.vy, -360);
      foe.vx = f.face * 180;
      foe.state = 'launched'; foe.t = 0;
    }
    if (!RESIM) {
      ring(f.x, f.y - 56, 130, f.look.slash || '233,196,106', 0.42);
      addP({ type: 'callout', text: `${cvT('换阵连携')} · ${cvT(benchCh.name)}`, x: f.x, y: f.y - 118, life: 0.9, max: 0.9, rgb: f.look.slash || '233,196,106', scale: 1.45 });
      SFX.dash();
    }
    return true;
  }

  // 点按援护键：召唤候补侠客释放一记招牌援护技（Bench Assist Cameo）
  if (st.cd[side] > 0 || f.meter < TAG3_ASSIST_COST) return false;
  const spec = TAG3_ASSIST_EFFECTS[benchCh.id] || TAG3_ASSIST_EFFECTS.qingfeng;
  f.meter = Math.max(0, f.meter - TAG3_ASSIST_COST);
  st.cd[side] = TAG3_ASSIST_CD;
  st.cameo = { side, chIdx: bench.chIdx, name: benchCh.name, label: spec.label, x: clamp(f.x - f.face * 68, WALL + 30, STAGE_W - WALL - 30), y: f.y, face: f.face, t: 0, dur: 0.65, rgb: spec.rgb };

  if (spec.effect === 'heal') {
    const heal = Math.round(f.maxHp * 0.08);
    f.hp = Math.min(f.maxHp, f.hp + heal);
    if (f.guard !== undefined) f.guard = Math.min(f.maxGuard || 100, f.guard + 20);
  } else if (spec.effect === 'armor') {
    f.armorT = Math.max(f.armorT || 0, 1.2);
    f.armorHits = Math.max(f.armorHits || 0, 2);
  }

  if (foe && foe.hp > 0 && foe.invul <= 0 && Math.abs(foe.x - f.x) <= spec.range && Math.abs(foe.y - f.y) <= 160) {
    const dir = Math.sign(foe.x - f.x) || f.face;
    const defRating = (foe.ch && foe.ch.stat && foe.ch.stat.defRating) || 1;
    const dmg = spec.dmg / defRating;
    foe.hp = Math.max(foe.dummy ? 1 : 1, foe.hp - dmg);
    foe.sinceHit = 0; foe.lagDelay = 0.45;
    if (spec.effect === 'launch') { foe.state = 'launched'; foe.t = 0; foe.vy = -420; foe.vx = dir * 210; }
    else if (spec.effect === 'root') { foe.state = 'hitstun'; foe.t = 0; foe.stun = 0.52; foe.rooted = true; foe.vx = 0; }
    else if (spec.effect === 'stun') { foe.state = 'hitstun'; foe.t = 0; foe.stun = 0.48; foe.vx = dir * 160; }
    else if (spec.effect === 'frost') { foe.slowT = Math.max(foe.slowT || 0, 2.2); foe.frostSlow = Math.max(foe.frostSlow || 0, 2.2); }
    else if (spec.effect === 'burn') { foe.burnT = Math.max(foe.burnT || 0, 2.8); }
    else if (spec.effect === 'pull') { foe.vx = -dir * 420; foe.hookedT = Math.max(foe.hookedT || 0, 1.2); foe.state = 'hitstun'; foe.t = 0; foe.stun = 0.35; }
    else if (spec.effect === 'push') { foe.vx = dir * 480; foe.state = 'hitstun'; foe.t = 0; foe.stun = 0.32; }
    else if (spec.effect === 'guard' && foe.guard !== undefined) { foe.guard = Math.max(0, foe.guard - 28); }
    else if (spec.effect === 'mark' && typeof addNeedleMark === 'function') { addNeedleMark(foe, 1); }
  }

  if (!RESIM) {
    ring(st.cameo.x, st.cameo.y - 54, 120, spec.rgb, 0.4);
    addP({ type: 'callout', text: `${cvT('援护')} · ${cvT(benchCh.name)}`, x: st.cameo.x, y: st.cameo.y - 116, life: 0.9, max: 0.9, rgb: spec.rgb, scale: 1.4 });
    addP({ type: 'text', text: cvT(spec.label), x: st.cameo.x, y: st.cameo.y - 148, life: 0.85, max: 0.85, rgb: spec.rgb });
    if (SFX.gong) SFX.gong();
  }
  return true;
}

function renderTag3() {}

function tag3Rematch() {
  if (M.mode !== 'tag3' || M.watchAi || !Array.isArray(M.teams) || M.teams.length !== 2 || M.teams.some(team => !Array.isArray(team) || team.length !== 3)) return false;
  const teams = M.teams.map(team => team.slice());
  teamMutator = M.teamMutator || 'normal';
  startTag3Match(teams[0], teams[1], M.level || pickLevel);
  return true;
}
function tag3Repick() {
  if (M.mode !== 'tag3' || M.watchAi) return false;
  initAudio(); paused = false;
  bpStart('tag3', { level: M.level || pickLevel, quickRelay: true });
  return true;
}
function startTag3Match(pTeam, eTeam, lv, isWatch = false) {
  if (p2pActive()) netDropWaiting();
  refocusGame();
  human[0].rec = null;
  REC.on = false;

  M.mode = 'tag3'; M.teamMutator = teamMutator;
  M.level = lv || pickLevel || 'normal';
  M.teams = [[...pTeam], [...eTeam]];
  M.teamIdx = [0, 0];
  M.tag3BenchHp = [{}, {}];
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
  if (!isWatch) rpRunBegin('tag3');
  if (!isWatch) recBegin('loc');
  startRound();
  say(isWatch ? '3v3 门派车轮战 · AI 群英观战' : '3v3 门派车轮战', 1.4);
}

const tag3StartBtn = document.getElementById('tag3StartBtn');
const tag3QuickBtn = document.getElementById('tag3QuickBtn');
if (tag3QuickBtn) tag3QuickBtn.addEventListener('click', () => {
  initAudio();
  paused = false;
  bpStart('tag3', { level: pickLevel, quickRelay: true });
});
if (tag3StartBtn) {
  tag3StartBtn.addEventListener('click', () => {
    initAudio();
    paused = false;
    bpStart('tag3', { level: pickLevel, isWatch: false });
  });
}
