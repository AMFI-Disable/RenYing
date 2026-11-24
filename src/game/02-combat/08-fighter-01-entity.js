// ======================= 角色对象 =======================
// 本文件：侠客对象和一场比赛的流程。
//   1. Fighter：一位侠客在场上的全部状态（位置、速度、气血、气、状态机 state、计时器……）
//   2. 比赛：M（当前对局）、A / B（双方）、2v2 / 肉鸽的队伍和找对手（foeOf）
//   3. 山河异境的地图：选图、冰面、悬崖、平台、风、天雷（mapTick 每帧更新）
//   4. 开局 / 回合（startMatch / startRound）、每帧对局逻辑（updateMatch）、结算（showEnd / endRound）
// 找 bug 提示：对局状态全在 M 和各个 Fighter 里，回滚存档也只存这些；新加的状态字段要放进去，否则联机会不同步。
const CLONE_SK = {};   // 离影雾身的样子（留下那一刻的骨架，键是「侠客序号:雾身编号」）：只是画面，不进存档
const CLONE_FADES = []; // 雾身消散残影：纯视觉效果，不进回滚状态
class Fighter {
  constructor(idx) {
    this.idx = idx; this.setChar(idx);
    this.j = {}; for (const k of JOINTS) this.j[k] = [...POSES.idle[k]]; this.j.sw = POSES.idle.sw;
    this.scarf = []; this.trail = []; this.ghosts = []; this.ghostT = 0;
    this.reset(idx === 0 ? STAGE_W / 2 - 230 : STAGE_W / 2 + 230);
    this.meter = 0;
  }
  setChar(i) {
    if (typeof i === 'string' && CHAR_IDX[i] !== undefined) i = CHAR_IDX[i];
    if (typeof i !== 'number' || isNaN(i) || i < 0 || i >= CHARS.length) i = 0;
    this.chIdx = i; this.ch = CHARS[i]; this.moves = CHAR_MOVES[i];
    let k = '';
    try {
      if (typeof mySkin === 'function') {
        if (typeof M !== 'undefined' && M.mode === 'net') {
          k = this.idx === (typeof localIdx === 'function' ? localIdx() : 0) ? mySkin(this.ch.id) : ((typeof NET !== 'undefined' && NET.peerSkins && NET.peerSkins[this.ch.id]) || '');
        } else {
          k = mySkin(this.ch.id);
        }
      } else if (typeof window !== 'undefined' && window.mySkin) {
        if (typeof M !== 'undefined' && M.mode === 'net') {
          k = this.idx === (typeof localIdx === 'function' ? localIdx() : 0) ? window.mySkin(this.ch.id) : ((typeof NET !== 'undefined' && NET.peerSkins && NET.peerSkins[this.ch.id]) || '');
        } else {
          k = window.mySkin(this.ch.id);
        }
      }
    } catch (e) {}
    this.skinKey = this.dummy ? '' : k;
    let look = null;
    try {
      if (typeof skinLook === 'function' && !this.dummy) {
        look = skinLook(i, k);
      } else if (typeof window !== 'undefined' && window.skinLook && !this.dummy) {
        look = window.skinLook(i, k);
      }
    } catch (e) {}
    this.look = look || { ...this.ch.look, name: this.ch.name };
    this.maxHp = Math.round(this.ch.stat.hp * ((BAL[this.ch.id] || {}).hp || 1) * HERO_HP_SCALE); this.wlen = WEAPON_LEN[this.ch.look.weapon] || 54;
    this.size = this.ch.stat.size || this.ch.size || 1;
    this.maxGuard = this.ch.stat.guardMax || 100;
    this.guard = this.maxGuard;
    this.sinceBlock = 0;
    this.clones = []; this.cloneN = 0; this.swapId = -1;   // 离影的雾身（09-actions.js「雾身」）：换人、每回合都清空
    for (const k of Object.keys(CLONE_SK)) if (k.startsWith(this.idx + ':')) delete CLONE_SK[k];
    delete this.bossSkills;
    delete this.bossUlts;
    delete this.bossHeroes;
    delete this.bossDmgMul;
  }
  reset(x) {
    this.maxHp = Math.round(this.ch.stat.hp * ((BAL[this.ch.id] || {}).hp || 1) * HERO_HP_SCALE);
    this.maxGuard = (this.ch && this.ch.stat && this.ch.stat.guardMax) || 100;
    this.guard = this.maxGuard;
    this.sinceBlock = 0;
    this.clones = []; this.cloneN = 0; this.swapId = -1;   // 离影的雾身（09-actions.js「雾身」）：换人、每回合都清空
    for (const k of Object.keys(CLONE_SK)) if (k.startsWith(this.idx + ':')) delete CLONE_SK[k];
    Object.assign(this, { x, y: 0, vx: 0, vy: 0, face: (this.idx % 2 === 0) ? 1 : -1, hp: this.maxHp, lagHp: this.maxHp, lagDelay: 0, huiMaHits: 0,
      skill: null, skPh: 0, skillCD: 0, skill2CD: 0, ink: INK_MAX, escInvul: false, escMode: '', escT: 0, bbX: 0, bbT: 0, twinT: 0, diveAir: false, diveChained: false, skAir: false, flyT: this.ch.fly || 0, flying: false, armorT: 0, armorHits: 0, parryT: 0, thunderGuardT: 0, buffT: 0, sinceHit: 0, regenLeft: Math.round(135 * HERO_HP_SCALE), spN: 0, spPose: null, rooted: false, slowT: 0, defDebuffT: 0, swapFreezeT: 0,
      notes: 0, noteT: 0, drunk: 0, reflectT: 0, hookedT: 0, needleMark: 0, needleMarkT: 0, lqNormHits: 0, shadowMarks: 0, shadowMarkT: 0, shadowExecTarget: -1, shadowExecT: 0, burnT: 0, breath: false, drinkT: 0, veilT: 0, jailT: 0, jailX: 0, avaFree: false, avaChain: false, fu: 0, fuT: 0, pol: 0, polT: 0, magN: 0, magTg: -1, mChain: 0, mT: 0, sw: null, squashT: 0,
      guard: this.maxGuard, sinceBlock: 0,
      state: 'idle', t: 0, move: null, invul: 0, hitInvulBy: -1, hitInvulEnd: 0, lastHitByIdx: -1, lastHitByT: -99, lastLandIdx: -1, lastLandT: -99, comboT0: -99, dashCD: 0, jumps: 0, airDash: 1, stun: 0, flash: 0,
      stance: 0, stanceUnlocked: false, stanceT: 0, badgeId: '', badgeTier: '', badgeDashT: 0,
      badgeLinkT: 0, badgePressureT: 0, badgePressureSkill: 0, badgeRiposteT: 0, badgeBreakT: 0, badgeAirSkillT: 0, badgeExitT: 0, badgeAirUsed: 0, badgeAirSkillUsed: 0,
      ballGuardBreakT: 0,
      juggle: 0, comboHits: 0, rot: 0, walkPh: 0, spiked: false, bounced: false, sp: null, snap: false, hitDone: false,
      iaidoCD: 0, grappleCD: 0, acupointT: 0,
      breakCD: 0, beaconT: 0, quickGetup: false, quickGetupPhase: false, plat: -1, dropT: 0,
      airCharged: false, feintCD: 0, qiParryCD: 0, qiParryT: 0, petCD: 0, rallyCD: 0, lockIdx: -1, koCount: 0 });   // plat：站在山河异境第几个平台上（-1 是地上或空中）；dropT：刚从平台上落下，这段时间穿过平台
    this.scarf = []; this.trail = []; this.ghosts = [];
    if (this.ch.passive === 'magnet') this.pol = 1;   // 磁仙的极性：真正开局时 startRound 用对局随机数再抽（magRoll）
  }
  onGround() { return (this.y >= 0 || this.plat >= 0) && this.vy >= 0; }
}
// ======================= 比赛流程 =======================
const M = { mode: 'demo', level: 'normal', phase: 'intro', t: 0, round: 1, wins: [0, 0], timer: 60, koWinner: -1, flags: {}, bans: [], teamSize: 0, squadOrders: ['auto', 'auto'] };
const MAX_FIGHTERS = 32;   // 最多支持 16v16 同屏大混战（32 名侠客）；四象争锋是 4 队各 4 人
const FIGHTERS = Array.from({ length: MAX_FIGHTERS }, (_, i) => new Fighter(i));
let A = FIGHTERS[0], B = FIGHTERS[1], C = FIGHTERS[2], D = FIGHTERS[3];
for (let i = 2; i < MAX_FIGHTERS; i++) FIGHTERS[i].hidden = true;
const roomDef = () => ROOM_MODES[netRoomMode] || ROOM_MODES.normal;   // 联机房间的规则（src/data/10-modes.js）
// 正在按哪个联机房间的规则打：联机对局里是这个房间，放联机录像时是录像里记的那个房间（M.mode 是 replay），别的时候没有。
// 规则（2v2、同袍肉鸽、神决……）都从这里判断，不要只认 M.mode === 'net'，不然录像放出来规则不对
const netRoom = () => (M.mode === 'replay' && REPLAY.on && REPLAY.kind === 'net' && REPLAY.m) ? (ROOM_MODES[REPLAY.m.room || REPLAY.m.sub || 'normal'] || null) : M.mode === 'net' ? roomDef() : null;
// 对局要在别的机器上算得一模一样的时候（联机回滚、放联机录像）：电脑想招、抽秘卷都用对局随机数
const netSim = () => (ROLL.on && M.mode === 'net') || (M.mode === 'replay' && REPLAY.on && REPLAY.kind === 'net');
const isLargeTeam = () => meleeOn() || quadOn() || (ctfOn() && M.teamSize > 2);
// 同屏有几个阵营：四象争锋是 4 个，其余都是 2 个（按编号 idx % 阵营数 分队）
const teamCount = () => quadOn() ? 4 : 2;
const is2v2 = () => !isLargeTeam() && (M.mode === 'watch2v2' || M.mode === '2v2' || ctfOn() || (M.mode === 'cuju' && !!M.cujuFour) || (M.mode === 'koth' && !!M.kothFour) || (typeof bastionOn === 'function' && bastionOn()) || !!(netRoom() && netRoom().four) || (M.mode === 'replay' && REPLAY.on && REPLAY.kind !== 'net' && !!(REPLAY.m && REPLAY.m.four)));
const isRaid = () => M.mode === 'raid' || (M.mode === 'replay' && REPLAY.on && !!(REPLAY.m && REPLAY.m.raid)) || !!(netRoom() && netRoom().raid);
const isMulti = () => is2v2() || isRaid() || isLargeTeam();
const fighterTeam = f => isRaid() ? (f && f.idx === 1 ? 1 : 0) : (isLargeTeam() ? ((f ? f.idx : 0) % teamCount()) : is2v2() ? ((f ? f.idx : 0) % 2) : (f ? f.idx : 0));
let _afMask = -1, _afMode = '', _afAll = [A, B], _afS0 = [A], _afS1 = [B], _afSides = [[A], [B]];
function _syncFighterCache() {
  const large = isLargeTeam(), raid = !large && isRaid(), two = !large && !raid && is2v2();
  const tc = large ? teamCount() : 2;
  const modeKey = large ? 'L' + tc : raid ? 'R' : two ? '2' : '1';
  let mask = 0;
  if (large) {
    for (let i = 0; i < MAX_FIGHTERS; i++) if (!FIGHTERS[i].hidden) mask += Math.pow(2, i);   // 32 人不能用 1 << i（会溢出成负数）
  } else if (raid) {
    for (let i = 0; i < 4; i++) if (!FIGHTERS[i].hidden) mask |= (1 << i);
  }
  if (modeKey === _afMode && mask === _afMask) return;
  _afMode = modeKey; _afMask = mask;
  if (large) {
    _afAll = []; _afSides = Array.from({ length: tc }, () => []);
    for (let i = 0; i < MAX_FIGHTERS; i++) {
      const f = FIGHTERS[i];
      if (f.hidden) continue;
      _afAll.push(f);
      _afSides[i % tc].push(f);
    }
    _afS0 = _afSides[0]; _afS1 = _afSides[1];
  } else if (raid) {
    _afAll = []; _afS0 = []; _afS1 = [B];
    for (let i = 0; i < 4; i++) {
      const f = FIGHTERS[i];
      if (!f.hidden) { _afAll.push(f); if (i !== 1) _afS0.push(f); }
    }
    _afSides = [_afS0, _afS1];
  } else if (two) {
    _afAll = [A, B, C, D]; _afS0 = [A, C]; _afS1 = [B, D]; _afSides = [_afS0, _afS1];
  } else {
    _afAll = [A, B]; _afS0 = [A]; _afS1 = [B]; _afSides = [_afS0, _afS1];
  }
}
const sideFighters = side => { _syncFighterCache(); return _afSides[side] || []; };
const allFighters = () => { _syncFighterCache(); return _afAll; };
const isAiVsAi = () => !!(M.watchAi || (M.mode === 'watch2v2' && M.watchAi) || M.mode === 'demo' || (typeof bpMode !== 'undefined' && bpMode === 'cpuWatch') || (M.mode !== 'net' && !isMulti() && A && A.ctrl && A.ctrl !== human[0] && A.ctrl !== human[1]));
const fighterByIdx = idx => FIGHTERS[idx] || A;
const foesOf = f => {
  if (isRaid()) {
    if (f === B) {
      const list = [A, C, D].filter(e => !e.hidden);
      const alive = list.filter(e => e.hp > 0);
      return alive.length ? alive : list;
    }
    return [B];
  }
  if (isLargeTeam()) {
    const myT = fighterTeam(f);
    const list = FIGHTERS.filter(e => !e.hidden && fighterTeam(e) !== myT);
    const alive = list.filter(e => e.hp > 0);
    return alive.length ? alive : list;
  }
  if (!is2v2()) return [f === A ? B : A];
  const list = (f.idx % 2 === 0) ? [B, D] : [A, C];
  const alive = list.filter(e => !e.hidden && e.hp > 0);
  return alive.length ? alive : list;
};
// 2v2 / 大型团战里谁算电脑（会配合队友选目标）。本地四个玩家用 human[0]～[3]；联机和本地回放里玩家的操控是普通 Ctrl，带 net 标记，也不是电脑
const cpuTeamwork = f => !!(f.ctrl && !human.includes(f.ctrl) && !f.ctrl.net);
// 多人对局电脑侠客的「脑子」：专心打一个人的时候，就算被别人打了，也先把手上这套连招打完，再回头反击打他的人。
//   commit：打中对手后这么多秒内算「连招进行中」；maxCombo：一套连招最多让他专注这么久，免得被人一直牵着；
//   revenge：被打后这么多秒内，连招一结束就优先反击那个人；range：反击的人离得太远就不追。
const BRAIN = { commit: 0.6, maxCombo: 3.5, revenge: 2.6, range: 560 };
const BRAIN_STUN = ['hitstun', 'launched', 'held', 'blockstun'];
const brainT = t => t === undefined ? -99 : t;   // 时间戳可能正好是 0（对局刚开始），不能用 || 兜底
function brainCommitted(f, cur) {
  if (!cur || cur.hidden || cur.hp <= 0) return false;
  if (clock - brainT(f.comboT0) > BRAIN.maxCombo) return false;
  const swinging = f.state === 'attack' || f.state === 'skill' || f.state === 'special';
  if (swinging && f.lastLandIdx === cur.idx && clock - brainT(f.lastLandT) < BRAIN.commit * 3) return true;
  return f.lastLandIdx === cur.idx && clock - brainT(f.lastLandT) < BRAIN.commit && (BRAIN_STUN.includes(cur.state) || cur.state === 'knockdown');
}
function brainRevenge(f, list, distance) {
  const by = f.lastHitByIdx >= 0 ? fighterByIdx(f.lastHitByIdx) : null;
  if (!by || by.hidden || by.hp <= 0 || !list.includes(by)) return null;
  if (clock - brainT(f.lastHitByT) > BRAIN.revenge || distance(by, f) > BRAIN.range) return null;
  return by;
}
const foeOf = f => {
  if (!isMulti()) return f === A ? B : A;
  if (isRaid() && f !== B) { f.target = B; return B; }
  const list = foesOf(f);
  if (!list.length) return A;
  if (list.length === 1) { f.target = list[0]; return list[0]; }
  // 玩家手动锁定目标（按 G 切换锁定）
  if (f.lockIdx >= 0) {
    const locked = fighterByIdx(f.lockIdx);
    if (locked && !locked.hidden && locked.hp > 0 && list.includes(locked)) {
      f.target = locked;
      return locked;
    }
    f.lockIdx = -1;
  }
  const layered = battleMapOn();
  const distance = (a, b) => layered ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) * 2 : Math.abs(a.x - b.x);
  // 电脑侠客的脑子：正在连招的时候不换人，连招打完才回头反击
  if (!isRaid() && cpuTeamwork(f) && f.target && list.includes(f.target) && brainCommitted(f, f.target)) return f.target;
  // 电脑侠客的团队意识：支持 1/2/3 战术指令、Tab 指挥面板的目标集火 / 阵型 / 队友分工（覆盖 2v2、3v3–16v16 团战、夺旗、四象与同袍肉鸽）
  if (cpuTeamwork(f)) {
    if (M.cmd) { const ct = cmdPickTarget(f, list, distance); if (ct) { f.target = ct; return ct; } }   // 统帅的战术和任务（22-modes-17-command.js）
    const myTeam = fighterTeam(f);
    // 显式集火目标（由 Tab 指挥面板或 G 锁定设置）
    const explicitIdx = M.teamFocus && M.teamFocus[myTeam] >= 0 ? M.teamFocus[myTeam] : -1;
    const explicitTgt = explicitIdx >= 0 ? fighterByIdx(explicitIdx) : null;
    const roleIdx = (M.teamRoles && M.teamRoles[f.idx]) || 0;
    const roleId = typeof CMD_ROLES !== 'undefined' && CMD_ROLES[roleIdx] ? CMD_ROLES[roleIdx].id : 'auto';
    if (roleId === 'peel' && typeof cmdPeelTarget === 'function') {
      const peelT = cmdPeelTarget(f, list, distance);
      if (peelT) { f.target = peelT; return peelT; }
    }
    if (explicitTgt && !explicitTgt.hidden && explicitTgt.hp > 0 && list.includes(explicitTgt)) {
      if (roleId === 'lure' && typeof cmdLureTarget === 'function') {
        const lureT = cmdLureTarget(f, list, explicitTgt, distance);
        if (lureT) { f.target = lureT; return lureT; }
      }
      f.target = explicitTgt; return explicitTgt;
    }
    const order = M.squadOrders?.[myTeam] || 'auto';
    if (order !== 'auto' || roleId !== 'auto') {
      const playerF = sideFighters(myTeam).find(m => human.includes(m.ctrl)) || fighterByIdx(myTeam);
      const leaderTarget = playerF && (playerF.lockIdx >= 0 ? fighterByIdx(playerF.lockIdx) : playerF.target);
      if ((order === 'focus' || roleId === 'main') && leaderTarget && !leaderTarget.hidden && leaderTarget.hp > 0 && list.includes(leaderTarget)) {
        f.target = leaderTarget; return leaderTarget;
      }
      if (order === 'protect' && playerF && !playerF.hidden && playerF.hp > 0) {
        let nearP = list[0], minD = distance(nearP, playerF);
        for (let i = 1; i < list.length; i++) { const d = distance(list[i], playerF); if (d < minD) { nearP = list[i]; minD = d; } }
        f.target = nearP; return nearP;
      }
      if (order === 'spread') {
        const pick = list[(Math.floor(f.idx / 2)) % list.length];
        if (pick) { f.target = pick; return pick; }
      }
    }
    if (!isRaid()) {
      const mate = is2v2() ? fighterByIdx(f.idx ^ 2) : sideFighters(myTeam).find(m => m !== f && m.hp > 0 && m.hp < m.maxHp * 0.3);
      const low = list.find(e => e.hp < e.maxHp * 0.25 && distance(e, f) < 700);
      if (low) { f.target = low; return low; }
      if (mate && mate !== f && !mate.hidden && mate.hp > 0 && mate.hp < mate.maxHp * 0.3) {
        const bully = list.find(e => distance(e, mate) < 260);
        if (bully) { f.target = bully; return bully; }
      }
    }
  }
  if (!isRaid() && cpuTeamwork(f)) {
    const avenge = brainRevenge(f, list, distance);
    if (avenge) { f.target = avenge; return avenge; }
  }
  let cur = f.target && !f.target.hidden && f.target.hp > 0 && list.includes(f.target) ? f.target : null;
  if (cur) {
    const curDist = distance(cur, f);
    let closest = cur, minDist = curDist;
    for (const e of list) {
      if (e === cur) continue;
      const d = distance(e, f);
      if (d < minDist - 85) { closest = e; minDist = d; }
    }
    f.target = closest;
    return closest;
  }
  let best = list[0], minDist = distance(best, f);
  for (let i = 1; i < list.length; i++) {
    const dist = distance(list[i], f);
    if (dist < minDist) { best = list[i]; minDist = dist; }
  }
  f.target = best;
  return best;
};
const wk = f => WALK * f.ch.stat.walk * ((f.slowT || 0) > 0 ? 0.6 : 1) * (scOn() ? scSpd(f) : 1) * (M.cmd ? cmdSpeedMul(f) : 1);   // 爬塔里秘卷、霜冻会改移速
function setChars(a, b) { A.setChar(a); B.setChar(b); }

// 2v2 扩阔擂台交互机关（御风灵泉、天道剑坛、天劫剑雨）
const ARENA2V2 = {
  geysers: [{ x: 460, cd: 0 }, { x: 2140, cd: 0 }],
  altarTimer: 0,
  orb: { active: false, kind: 0, y: -55 },
  hazardTimer: 0,
  scars: []
};
