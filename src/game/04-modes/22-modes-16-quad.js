// ======================= 四象争锋：4v4v4v4 四方混战 =======================
// 四支队伍各 N 人（默认 4 人）同屏混战：苍龙、朱雀、玄武、白虎。你带着苍龙；另外三方和你的队友都由电脑补齐。
// 战场是五层立体战场：两队在地面左右，两队在顶层左右（每局随机排位，不是永远在同一个角落）。
// 每队有兵力积分（人数 × 3），倒下一次扣一点，兵力清零又没人活着就覆灭；最后一支站着的队伍夺魁，时间到按兵力和剩余气血排名。
// 队伍编号 = 侠客编号 % 4（fighterTeam 在 08-fighter-01-entity.js）。
// 找 bug 提示：队伍分错先看 teamCount / fighterTeam；开局站位不对看 quadSpawn；结算不对看 quadMatch / quadShowEnd。
const quadOn = () => M.mode === 'quad' || (M.mode === 'replay' && REPLAY.on && !!(REPLAY.m && (REPLAY.m.mode === 'quad' || REPLAY.m.room === 'quad'))) || !!(typeof netRoom === 'function' && netRoom() && netRoom().rule === 'quad');

const QUAD_TEAMS = [
  { n: '苍龙', rgb: '70,211,234', hex: '#46d3ea' },
  { n: '朱雀', rgb: '255,100,112', hex: '#ff6470' },
  { n: '玄武', rgb: '181,140,255', hex: '#b58cff' },
  { n: '白虎', rgb: '255,198,90', hex: '#ffc65a' },
];
const QUAD_TICKETS_PER_HERO = 3;
const QUAD_MATCH_TIME = 210;
const QUAD_RESPAWN_TIME = 3.2;
// 阵营的颜色：四象争锋里每队一种，其余模式里「我方青、敌方红」
const teamHexOf = f => quadOn() ? (QUAD_TEAMS[fighterTeam(f)] || QUAD_TEAMS[0]).hex : (fighterTeam(f) === localTeam() ? '#6fe0ff' : '#ff6470');
const teamRgbOf = f => quadOn() ? (QUAD_TEAMS[fighterTeam(f)] || QUAD_TEAMS[0]).rgb : (fighterTeam(f) === localTeam() ? '111,224,255' : '255,100,112');
const teamNameOf = t => quadOn() ? (QUAD_TEAMS[t] || QUAD_TEAMS[0]).n : (t === localTeam() ? '我方' : '敌方');

// 四个出生点：0 地面左、1 地面右、2 顶层左、3 顶层右。每局随机打乱，哪队在哪里不固定
function quadPlaceSpots() {
  const spots = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = (grnd() * (i + 1)) | 0; [spots[i], spots[j]] = [spots[j], spots[i]]; }
  M.quadSpots = spots;
}
function quadSpawnPoint(team, slot) {
  const spot = (M.quadSpots || [0, 1, 2, 3])[team];
  const left = spot % 2 === 0, top = spot >= 2;
  const x0 = WALL + 430, step = 58;
  const x = left ? x0 + slot * step : STAGE_W - x0 - slot * step;
  return { x, deck: top ? 0 : -1, face: left ? 1 : -1 };   // deck：顶层平台的下标（BATTLE_DECKS[0]）；-1 是地面
}
function quadSpawn(f, offsetSlot) {
  const team = fighterTeam(f), slot = offsetSlot !== undefined ? offsetSlot : Math.floor(f.idx / teamCount());
  const p = quadSpawnPoint(team, slot);
  f.reset(p.x);
  if (p.deck >= 0) mapPutOn(f, p.deck);
  f.face = p.face;
}

function quadRoundInit() {
  const sz = clamp(M.teamSize || 4, 2, 8);
  const tk = sz * QUAD_TICKETS_PER_HERO;
  M.quad = {
    size: sz,
    tickets: [tk, tk, tk, tk],
    maxTickets: tk,
    respawn: new Array(MAX_FIGHTERS).fill(0),
    wait: new Array(MAX_FIGHTERS).fill(false),   // 倒下了、正在等复活
    out: [false, false, false, false],           // 覆灭的队伍
    dmg: [0, 0, 0, 0],
  };
  M.timer = QUAD_MATCH_TIME;
}

// 每队活着的人数（含倒下等复活的算「还在场」：兵力没清零就还会回来）
function quadTeamAlive(team) { return sideFighters(team).filter(f => f.hp > 0).length; }
function quadTeamHp(team) { return sideFighters(team).reduce((s, f) => s + Math.max(0, f.hp), 0); }
function quadStanding() {
  const S = M.quad;
  const out = [];
  for (let t = 0; t < 4; t++) if (!S.out[t]) out.push(t);
  return out;
}
// 排名：兵力多的在前，同兵力比场上剩余气血
function quadRanking() {
  const S = M.quad;
  return [0, 1, 2, 3].sort((a, b) => (S.tickets[b] + (S.out[b] ? -99 : 0)) - (S.tickets[a] + (S.out[a] ? -99 : 0)) || quadTeamHp(b) - quadTeamHp(a) || a - b);
}

function quadMatch() {
  const S = M.quad;
  if (!S) return;
  M.timer = Math.max(0, M.timer - STEP);
  if (chaosOn()) updateChaos(STEP);
  for (const f of allFighters()) {
    if (f.hidden) continue;
    const team = fighterTeam(f);
    if (S.out[team]) continue;
    if (f.hp <= 0) {
      if (!S.wait[f.idx]) {
        S.wait[f.idx] = true;
        S.tickets[team] = Math.max(0, S.tickets[team] - 1);
        S.respawn[f.idx] = QUAD_RESPAWN_TIME;
        if (!RESIM && f.idx === localIdx()) say('即将重返战场…', 1.1, 'go');
        if (typeof cmdOnFall === 'function') cmdOnFall(f);
      } else {
        S.respawn[f.idx] -= STEP;
        if (S.respawn[f.idx] <= 0 && S.tickets[team] > 0) {
          S.wait[f.idx] = false;
          quadSpawn(f, Math.floor(f.idx / 4));
          f.invul = 1.1;
          if (f.idx === localIdx()) { f.beaconT = 1.4; camFocusPingT = 0.9; }
          if (typeof applyCombatLoadouts === 'function') applyCombatLoadouts(f);
          if (mayhemOn()) applyMayhemStats(f);
          if (typeof cmdAfterReset === 'function') cmdAfterReset(f);
        }
      }
    }
  }
  // 兵力清零又没人活着：这一队覆灭
  for (let t = 0; t < 4; t++) {
    if (S.out[t]) continue;
    if (S.tickets[t] <= 0 && quadTeamAlive(t) === 0) {
      S.out[t] = true;
      if (!RESIM) { sayNet(t === localTeam() ? '全军覆没…' : `${cvT(QUAD_TEAMS[t].n)} ${cvT('覆灭！')}`, 1.3, 'big', 'gong'); }
      if (typeof cmdOnTeamOut === 'function') cmdOnTeamOut(t);
    }
  }
  const standing = quadStanding();
  if (S.out[localTeam()] || standing.length <= 1 || M.timer <= 0) {
    const rank = quadRanking();
    const winner = standing.length === 1 ? standing[0] : rank[0];
    M.phase = 'ko'; M.t = 0; M.koWinner = winner;
    S.rank = rank;
    sayNet(winner === localTeam() ? '四象称雄！' : (S.out[localTeam()] ? '全军覆没' : `${cvT(QUAD_TEAMS[winner].n)} ${cvT('夺魁')}`), 1.5, 'big', 'gong');
  }
}

function startQuad(teamSize = 4, heroIdx = 0, level = 'normal') {
  const sz = clamp(teamSize | 0, 2, 8);
  debugHitbox = false;
  refocusGame();
  netDropWaiting();
  M.mode = 'quad';
  M.teamSize = sz;
  M.level = level || 'normal';
  M.teamMutator = 'normal';
  M.wins = [0, 0, 0, 0]; M.round = 1; M.watchAi = false; M.bans = [];
  const total = sz * 4;
  // 电脑的侠客：从剩下的人里抽，尽量不重复
  const pool = [];
  for (let i = 0; i < CHARS.length; i++) if (i !== (heroIdx | 0)) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (let i = 0; i < total; i++) {
    const f = FIGHTERS[i];
    f.setChar(i === 0 ? (heroIdx | 0) : pool[(i - 1) % pool.length]);
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
  say(`${cvT('四象争锋')} · ${sz}v${sz}v${sz}v${sz}`, 1.4);
}

// 四个出生点在地上画一圈队色，让人一眼看出各队的地盘
function drawQuadField() {
  if (!quadOn() || !M.quad) return;
  const bm = battleMapDef();
  for (let t = 0; t < 4; t++) {
    const p = quadSpawnPoint(t, 0), q = quadSpawnPoint(t, M.quad.size - 1);
    const cx = (p.x + q.x) / 2, w = Math.abs(q.x - p.x) / 2 + 70;
    const y = p.deck >= 0 ? (bm ? bm.decks[p.deck].y : 0) : 0;
    ctx.save();
    ctx.strokeStyle = `rgba(${QUAD_TEAMS[t].rgb},${M.quad.out[t] ? 0.15 : 0.55})`; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(cx, y + 2, w, 13, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(${QUAD_TEAMS[t].rgb},0.07)`; ctx.fill();
    ctx.restore();
  }
}

// 顶部四队状态：队名、在场人数、兵力、总气血条
function drawHUDQuad(top, cx) {
  const S = M.quad; if (!S) return;
  const bw = Math.min(236, Math.round(W * 0.19)), bh = 12, gap = 10, mid = 46;
  const order = [0, 1, 2, 3];
  const xs = [cx - mid - 2 * bw - gap, cx - mid - bw, cx + mid, cx + mid + bw + gap];
  ctx.save();
  order.forEach((t, i) => {
    const x = xs[i], list = sideFighters(t);
    const hp = list.reduce((s, f) => s + Math.max(0, f.hp), 0), max = Math.max(1, list.reduce((s, f) => s + f.maxHp, 0));
    const out = S.out[t], me = t === localTeam();
    ctx.globalAlpha = out ? 0.4 : 1;
    ctx.fillStyle = 'rgba(6,8,18,0.78)'; ctx.fillRect(x - 2, top - 2, bw + 4, bh + 4);
    ctx.fillStyle = QUAD_TEAMS[t].hex; ctx.fillRect(x, top, bw * clamp(hp / max, 0, 1), bh);
    if (me) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.strokeRect(x - 2, top - 2, bw + 4, bh + 4); }
    ctx.font = `bold 12px ${TITLE_FONT}`; ctx.fillStyle = '#f2ead8'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${cvT(QUAD_TEAMS[t].n)}${me ? ' ' + cvT('(我方)') : ''}`, x, top + bh + 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e9c46a';
    ctx.fillText(out ? cvT('覆灭') : `${quadTeamAlive(t)}/${list.length} · ${cvT('兵力')} ${S.tickets[t]}`, x + bw, top + bh + 4);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 26px ${BODY_FONT}`; ctx.fillStyle = M.timer < 15 ? '#ff7868' : '#efe8d8';
  ctx.fillText(Math.ceil(M.timer), cx, top + 12);
  ctx.font = `600 11px ${BODY_FONT}`; ctx.fillStyle = '#e9c46a';
  ctx.fillText(`${M.teamSize}v${M.teamSize}v${M.teamSize}v${M.teamSize}`, cx, top + 30);
  ctx.restore();
}

// 结算：名次、各队兵力。只看名次，不发墨锭
function quadShowEnd(w) {
  const S = M.quad || { tickets: [0, 0, 0, 0], out: [false, false, false, false], rank: [0, 1, 2, 3] };
  const rank = S.rank || quadRanking();
  const win = w === localTeam();
  playSting(win ? 'victory' : 'defeat');
  inkTitle(w >= 0 ? cvT(QUAD_TEAMS[w].n) : cvT('平手'), !win && w >= 0);
  $id('endKicker').textContent = cvT('四象争锋');
  $id('endSub').textContent = rank.map((t, i) => `${i + 1}. ${cvT(QUAD_TEAMS[t].n)}${S.out[t] ? '' : ' ' + S.tickets[t]}`).join(' · ');
  $id('endRank').textContent = win ? cvT('四象之首') : `${cvT("你的名次")}: ${rank.indexOf(localTeam()) + 1}/4`;
  const again = $id('againBtn');
  again.style.display = ''; again.disabled = false; again.textContent = cvT('再战');
  scheduleEndScreen();
}
