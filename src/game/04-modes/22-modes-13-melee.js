// ======================= 群雄会战：3v3 ~ 16v16 大型同屏团战 =======================
// 支持 3v3 ~ 16v16（最多 32 人同屏），带兵力积分、复活机制（每人复活一次，统帅只有一条命）、战术指令与自标定位。
const meleeOn = () => M.mode === 'melee' || (M.mode === 'replay' && REPLAY.on && !!(REPLAY.m && (REPLAY.m.mode === 'melee' || REPLAY.m.room === 'melee'))) || !!(typeof netRoom === 'function' && netRoom() && netRoom().rule === 'melee');

// 复活规则（群雄会战、四象争锋共用）：每人一共两条命（倒下能复活一次），统帅只有一条命，倒下就不再回来。
// 兵力 = 这一队所有人还剩的命数（场上活着的那条也算），兵力清零就是全队覆灭。
const TEAM_LIVES = 2, CMDR_LIVES = 1;
const teamLivesOf = f => (typeof cmdIs === 'function' && cmdIs(f)) ? CMDR_LIVES : TEAM_LIVES;
function teamLivesLeft(S, f) { return Math.max(0, teamLivesOf(f) - (S.deaths[f.idx] || 0)); }
function teamTickets(S, team) { return sideFighters(team).reduce((n, f) => n + teamLivesLeft(S, f), 0); }

function meleeRoundInit() {
  const sz = clamp(M.teamSize || 5, 3, 16);
  M.melee = {
    size: sz,
    tickets: [0, 0],
    maxTickets: 0,
    respawn: new Array(MAX_FIGHTERS).fill(0),
    deaths: new Array(MAX_FIGHTERS).fill(0),
  };
  const S = M.melee;
  S.tickets = [teamTickets(S, 0), teamTickets(S, 1)];
  S.maxTickets = Math.max(S.tickets[0], S.tickets[1]);
  M.timer = 180;
}

function meleeMatch() {
  const S = M.melee;
  if (!S) return;
  M.timer = Math.max(0, M.timer - STEP);
  if (chaosOn()) updateChaos(STEP);
  const fs = allFighters();
  for (const f of fs) {
    if (f.hidden) continue;
    if (f.hp <= 0) {
      if (S.respawn[f.idx] <= 0) {
        S.deaths[f.idx] = (S.deaths[f.idx] || 0) + 1;
        const canReturn = teamLivesLeft(S, f) > 0;
        S.respawn[f.idx] = canReturn ? 3.2 : 1e9;   // 命用完了：不再复活
        if (typeof cmdOnFall === 'function') cmdOnFall(f);
        if (!RESIM && f.idx === localIdx()) say(canReturn ? '即将重返战场…（最后一条命）' : '阵亡 · 观战队友', 1.3, 'go');
      } else {
        S.respawn[f.idx] -= STEP;
        if (S.respawn[f.idx] <= 0 && teamLivesLeft(S, f) > 0) {
          const team = fighterTeam(f);
          const slot = Math.floor(f.idx / 2);
          const bm = typeof battleMapDef === 'function' ? battleMapDef() : null;
          // 大型团战（10v10 / 16v16）采用前沿分流复活点（地面 + 一层廊台），减少长距离跑图时间
          const baseOffset = S.size >= 10 ? Math.min(STAGE_W * 0.22, 920) : (WALL + 140);
          const col = S.size >= 10 ? Math.floor(slot / 2) : slot;
          const stepX = S.size >= 10 ? 72 : 56;
          const rx = team === 0
            ? clamp(baseOffset + col * stepX, WALL + 90, STAGE_W / 2 - 260)
            : clamp(STAGE_W - baseOffset - col * stepX, STAGE_W / 2 + 260, STAGE_W - WALL - 90);
          const prevRelic = f.relicStance;
          f.reset(rx);
          if (bm && S.size >= 10 && (slot % 2) === 1 && bm.decks.length) {
            mapPutOn(f, bm.decks.length - 1);
          }
          f.face = team === 0 ? 1 : -1;
          f.invul = 1.1;
          if (f.idx === localIdx()) { f.beaconT = 1.4; camFocusPingT = 0.9; }
          if (typeof applyCombatLoadouts === 'function') applyCombatLoadouts(f);
          if (f.relicStanceUnlocked && (prevRelic === 1 || prevRelic === 2)) f.relicStance = prevRelic;
          if (mayhemOn()) applyMayhemStats(f);
          if (typeof cmdAfterReset === 'function') cmdAfterReset(f);
        }
      }
    }
  }
  S.tickets[0] = teamTickets(S, 0); S.tickets[1] = teamTickets(S, 1);
  if (S.tickets[0] <= 0 || S.tickets[1] <= 0 || M.timer <= 0) {
    const hp = t => sideFighters(t).reduce((n, f) => n + Math.max(0, f.hp), 0);
    const winner = S.tickets[0] > S.tickets[1] ? 0 : S.tickets[1] > S.tickets[0] ? 1 : hp(0) > hp(1) ? 0 : hp(1) > hp(0) ? 1 : -1;
    M.phase = 'ko'; M.t = 0; M.koWinner = winner;
    sayNet(winner < 0 ? '平手' : winner === localTeam() ? '大军凯旋！' : '惜败收兵', 1.4, 'big', 'gong');
  }
}

function startMelee(teamSize = 5, heroIdx = 0, level = 'normal', mut = 'normal', drafted = null) {
  const sz = clamp(teamSize | 0, 3, 16);
  debugHitbox = false;
  refocusGame();
  netDropWaiting();
  M.mode = 'melee';
  M.teamSize = sz;
  M.level = level || 'normal';
  M.teamMutator = mut === 'mayhem' ? 'mayhem' : 'normal';
  M.wins = [0, 0]; M.round = 1; M.watchAi = false;
  const total = sz * 2;
  const hasDraft = Array.isArray(drafted) && Array.isArray(drafted[0]) && Array.isArray(drafted[1]);
  for (let i = 0; i < total; i++) {
    const f = FIGHTERS[i];
    const side = i % 2, slot = Math.floor(i / 2);
    const draftedCid = hasDraft && Number.isInteger(drafted[side][slot]) && drafted[side][slot] >= 0 ? drafted[side][slot] : -1;
    const stride = side === 0 ? 3 : 7;
    const cid = draftedCid >= 0 ? draftedCid : (i === 0 ? (heroIdx | 0) : ((heroIdx + (side ? 1 : 0) + slot * stride) % CHARS.length));
    f.setChar(cid);
    f.ctrl = i === 0 ? human[0] : new AICtrl(M.level);
    f.hidden = false;
  }
  for (let i = total; i < MAX_FIGHTERS; i++) FIGHTERS[i].hidden = true;
  if (typeof invalidateFighterCache === 'function') invalidateFighterCache();
  human[0].clear();
  paused = false;
  showScreen(null);
  REC.on = false; recBegin('loc');
  startRound();
  say(`群雄会战 · ${sz}v${sz}`, 1.4);
}
