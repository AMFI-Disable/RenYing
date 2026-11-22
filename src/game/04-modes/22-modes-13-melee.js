// ======================= 群雄会战：3v3 ~ 8v8 大型同屏团战 =======================
// 支持 3v3、5v5、8v8（最多 16 人同屏），带兵力积分、复活机制、战术指令与自标定位。
const meleeOn = () => M.mode === 'melee' || !!(typeof netRoom === 'function' && netRoom() && netRoom().rule === 'melee');

function meleeRoundInit() {
  const sz = clamp(M.teamSize || 5, 3, 8);
  M.melee = {
    size: sz,
    tickets: [sz * 3, sz * 3],
    maxTickets: sz * 3,
    respawn: new Array(MAX_FIGHTERS).fill(0),
    kos: [0, 0],
  };
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
        const team = fighterTeam(f);
        S.tickets[team] = Math.max(0, S.tickets[team] - 1);
        S.kos[1 - team]++;
        S.respawn[f.idx] = 3.2;
        if (!RESIM && f.idx === localIdx()) say('即将重返战场…', 1.1, 'go');
      } else {
        S.respawn[f.idx] -= STEP;
        if (S.respawn[f.idx] <= 0 && S.tickets[fighterTeam(f)] > 0) {
          const team = fighterTeam(f);
          const rx = team === 0 ? WALL + 120 + (f.idx % 4) * 55 : STAGE_W - WALL - 120 - (f.idx % 4) * 55;
          f.reset(rx);
          f.face = team === 0 ? 1 : -1;
          f.invul = 1.1;
          if (f.idx === localIdx()) { f.beaconT = 1.4; camFocusPingT = 0.9; }
          if (typeof applyCombatLoadouts === 'function') applyCombatLoadouts();
        }
      }
    }
  }
  if (S.tickets[0] <= 0 || S.tickets[1] <= 0 || M.timer <= 0) {
    const winner = S.tickets[0] > S.tickets[1] ? 0 : S.tickets[1] > S.tickets[0] ? 1 : (S.kos[0] >= S.kos[1] ? 0 : 1);
    M.phase = 'ko'; M.t = 0; M.koWinner = winner;
    sayNet(winner === localTeam() ? '大军凯旋！' : '惜败收兵', 1.4, 'big', 'gong');
  }
}

function drawMeleeField() {
  if (!meleeOn() || !M.melee) return;
  const S = M.melee;
  ctx.save();
  ctx.font = `bold 13px ${BODY_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6fe0ff';
  ctx.fillText(`${cvT('我方兵力')} ${S.tickets[0]}/${S.maxTickets}`, W / 2 - 140, 12);
  ctx.fillStyle = '#ff7878';
  ctx.fillText(`${cvT('敌方兵力')} ${S.tickets[1]}/${S.maxTickets}`, W / 2 + 140, 12);
  ctx.restore();
}

function startMelee(teamSize = 5, heroIdx = 0, level = 'normal', mut = 'normal') {
  const sz = clamp(teamSize | 0, 3, 8);
  debugHitbox = false;
  refocusGame();
  netDropWaiting();
  M.mode = 'melee';
  M.teamSize = sz;
  M.level = level || 'normal';
  M.teamMutator = ['chaos', 'mayhem'].includes(mut) ? mut : 'normal';
  M.squadOrder = 'auto';
  M.wins = [0, 0]; M.round = 1; M.watchAi = false;
  const total = sz * 2;
  for (let i = 0; i < total; i++) {
    const f = FIGHTERS[i];
    const cid = i === 0 ? (heroIdx | 0) : ((heroIdx + i * 3) % CHARS.length);
    f.setChar(cid);
    f.ctrl = i === 0 ? human[0] : new AICtrl(M.level);
    f.hidden = false;
  }
  for (let i = total; i < MAX_FIGHTERS; i++) FIGHTERS[i].hidden = true;
  human[0].clear();
  showScreen(null);
  startRound();
  say(`群雄会战 · ${sz}v${sz}`, 1.4);
}
