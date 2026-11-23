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
      notes: 0, noteT: 0, drunk: 0, reflectT: 0, hookedT: 0, needleMark: 0, needleMarkT: 0, lqNormHits: 0, burnT: 0, breath: false, drinkT: 0, veilT: 0, jailT: 0, jailX: 0, avaFree: false, avaChain: false, fu: 0, fuT: 0, pol: 0, polT: 0, magN: 0, magTg: -1, mChain: 0, mT: 0, sw: null, squashT: 0,
      guard: this.maxGuard, sinceBlock: 0,
      state: 'idle', t: 0, move: null, invul: 0, dashCD: 0, jumps: 0, airDash: 1, stun: 0, flash: 0,
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
const MAX_FIGHTERS = 16;   // 最多支持 8v8 同屏大混战（16 名侠客）
const FIGHTERS = Array.from({ length: MAX_FIGHTERS }, (_, i) => new Fighter(i));
let A = FIGHTERS[0], B = FIGHTERS[1], C = FIGHTERS[2], D = FIGHTERS[3];
for (let i = 2; i < MAX_FIGHTERS; i++) FIGHTERS[i].hidden = true;
const roomDef = () => ROOM_MODES[netRoomMode] || ROOM_MODES.normal;   // 联机房间的规则（src/data/10-modes.js）
// 正在按哪个联机房间的规则打：联机对局里是这个房间，放联机录像时是录像里记的那个房间（M.mode 是 replay），别的时候没有。
// 规则（2v2、同袍肉鸽、神决……）都从这里判断，不要只认 M.mode === 'net'，不然录像放出来规则不对
const netRoom = () => (M.mode === 'replay' && REPLAY.on && REPLAY.kind === 'net' && REPLAY.m) ? (ROOM_MODES[REPLAY.m.room || REPLAY.m.sub || 'normal'] || null) : M.mode === 'net' ? roomDef() : null;
// 对局要在别的机器上算得一模一样的时候（联机回滚、放联机录像）：电脑想招、抽秘卷都用对局随机数
const netSim = () => (ROLL.on && M.mode === 'net') || (M.mode === 'replay' && REPLAY.on && REPLAY.kind === 'net');
const isLargeTeam = () => meleeOn() || (ctfOn() && M.teamSize > 2);
const is2v2 = () => !isLargeTeam() && (M.mode === 'watch2v2' || M.mode === '2v2' || ctfOn() || (M.mode === 'cuju' && !!M.cujuFour) || (M.mode === 'koth' && !!M.kothFour) || (typeof bastionOn === 'function' && bastionOn()) || !!(netRoom() && netRoom().four) || (M.mode === 'replay' && REPLAY.on && REPLAY.kind !== 'net' && !!(REPLAY.m && REPLAY.m.four)));
const isRaid = () => M.mode === 'raid' || (M.mode === 'replay' && REPLAY.on && !!(REPLAY.m && REPLAY.m.raid)) || !!(netRoom() && netRoom().raid);
const isMulti = () => is2v2() || isRaid() || isLargeTeam();
const fighterTeam = f => isRaid() ? (f && f.idx === 1 ? 1 : 0) : ((is2v2() || isLargeTeam()) ? ((f ? f.idx : 0) % 2) : (f ? f.idx : 0));
const sideFighters = side => {
  if (isLargeTeam()) return FIGHTERS.filter(f => !f.hidden && (f.idx % 2) === side);
  if (isRaid()) return side === 0 ? [A, C, D].filter(f => !f.hidden) : [B];
  if (is2v2()) return side === 0 ? [A, C] : [B, D];
  return [[A, B][side]];
};
const allFighters = () => {
  if (isLargeTeam()) return FIGHTERS.filter(f => !f.hidden);
  if (isRaid()) return [A, B, C, D].filter(f => !f.hidden);
  if (is2v2()) return [A, B, C, D];
  return [A, B];
};
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
  // 电脑侠客的团队意识：支持 1/2/3 战术指令（集火 / 掩护 / 散开）
  if (!isRaid() && cpuTeamwork(f)) {
    const myTeam = fighterTeam(f);
    const order = M.squadOrders?.[myTeam] || 'auto';
    if (order !== 'auto') {
      const playerF = fighterByIdx(myTeam);
      if (order === 'focus' && playerF && playerF.target && list.includes(playerF.target) && playerF.target.hp > 0) {
        f.target = playerF.target; return playerF.target;
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
    const mate = is2v2() ? fighterByIdx(f.idx ^ 2) : sideFighters(myTeam).find(m => m !== f && m.hp > 0 && m.hp < m.maxHp * 0.3);
    const low = list.find(e => e.hp < e.maxHp * 0.25 && distance(e, f) < 700);
    if (low) { f.target = low; return low; }
    if (mate && mate !== f && !mate.hidden && mate.hp > 0 && mate.hp < mate.maxHp * 0.3) {
      const bully = list.find(e => distance(e, mate) < 260);
      if (bully) { f.target = bully; return bully; }
    }
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
const wk = f => WALK * f.ch.stat.walk * ((f.slowT || 0) > 0 ? 0.6 : 1) * (scOn() ? scSpd(f) : 1);   // 爬塔里秘卷、霜冻会改移速
function setChars(a, b) { A.setChar(a); B.setChar(b); }

// 2v2 扩阔擂台交互机关（御风灵泉、天道剑坛、天劫剑雨）
const ARENA2V2 = {
  geysers: [{ x: 460, cd: 0 }, { x: 2140, cd: 0 }],
  altarTimer: 0,
  orb: { active: false, kind: 0, y: -55 },
  hazardTimer: 0,
  scars: []
};
