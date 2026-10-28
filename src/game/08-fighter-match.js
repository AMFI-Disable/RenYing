// ======================= 角色对象 =======================
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
    this.maxHp = Math.round(this.ch.stat.hp * ((BAL[this.ch.id] || {}).hp || 1)); this.wlen = WEAPON_LEN[this.ch.look.weapon] || 54;
    this.size = this.ch.stat.size || this.ch.size || 1;
    this.maxGuard = this.ch.stat.guardMax || 100;
    this.guard = this.maxGuard;
    this.sinceBlock = 0;
    delete this.bossSkills;
    delete this.bossUlts;
    delete this.bossHeroes;
    delete this.bossDmgMul;
  }
  reset(x) {
    this.maxHp = Math.round(this.ch.stat.hp * ((BAL[this.ch.id] || {}).hp || 1));
    this.maxGuard = (this.ch && this.ch.stat && this.ch.stat.guardMax) || 100;
    this.guard = this.maxGuard;
    this.sinceBlock = 0;
    Object.assign(this, { x, y: 0, vx: 0, vy: 0, face: (this.idx % 2 === 0) ? 1 : -1, hp: this.maxHp, lagHp: this.maxHp, lagDelay: 0, huiMaHits: 0,
      skill: null, skPh: 0, skillCD: 0, skill2CD: 0, ink: INK_MAX, escInvul: false, escMode: '', escT: 0, bbX: 0, bbT: 0, twinT: 0, diveAir: false, diveChained: false, skAir: false, flyT: this.ch.fly || 0, flying: false, armorT: 0, armorHits: 0, parryT: 0, thunderGuardT: 0, buffT: 0, sinceHit: 0, regenLeft: 135, spN: 0, spPose: null, rooted: false, slowT: 0,
      notes: 0, noteT: 0, drunk: 0, reflectT: 0, hookedT: 0, needleMark: 0, burnT: 0, breath: false, drinkT: 0, veilT: 0, jailT: 0, jailX: 0, avaFree: false, avaChain: false, fu: 0, fuT: 0,
      guard: this.maxGuard, sinceBlock: 0,
      state: 'idle', t: 0, move: null, invul: 0, dashCD: 0, jumps: 0, airDash: 1, stun: 0, flash: 0,
      juggle: 0, comboHits: 0, rot: 0, walkPh: 0, spiked: false, bounced: false, sp: null, snap: false, hitDone: false,
      breakCD: 0, quickGetup: false, quickGetupPhase: false });
    this.scarf = []; this.trail = []; this.ghosts = [];
  }
  onGround() { return this.y >= 0 && this.vy >= 0; }
}
// ======================= 比赛流程 =======================
const M = { mode: 'demo', level: 'normal', phase: 'intro', t: 0, round: 1, wins: [0, 0], timer: 60, koWinner: -1, flags: {}, bans: [] };
let A = new Fighter(0), B = new Fighter(1), C = new Fighter(2), D = new Fighter(3);
C.hidden = true; D.hidden = true;
const roomDef = () => ROOM_MODES[netRoomMode] || ROOM_MODES.normal;   // 联机房间的规则（src/data/10-modes.js）
// 正在按哪个联机房间的规则打：联机对局里是这个房间，放联机录像时是录像里记的那个房间（M.mode 是 replay），别的时候没有。
// 规则（2v2、同袍肉鸽、神决……）都从这里判断，不要只认 M.mode === 'net'，不然录像放出来规则不对
const netRoom = () => (M.mode === 'replay' && REPLAY.on && REPLAY.kind === 'net' && REPLAY.m) ? (ROOM_MODES[REPLAY.m.room || REPLAY.m.sub || 'normal'] || null) : M.mode === 'net' ? roomDef() : null;
// 对局要在别的机器上算得一模一样的时候（联机回滚、放联机录像）：电脑想招、抽秘卷都用对局随机数
const netSim = () => (ROLL.on && M.mode === 'net') || (M.mode === 'replay' && REPLAY.on && REPLAY.kind === 'net');
const is2v2 = () => M.mode === 'watch2v2' || M.mode === '2v2' || !!(netRoom() && netRoom().four) || (M.mode === 'replay' && REPLAY.on && REPLAY.kind !== 'net' && !!(REPLAY.m && REPLAY.m.four));
const isRaid = () => M.mode === 'raid' || !!(netRoom() && netRoom().raid);
const isMulti = () => is2v2() || isRaid();
const fighterTeam = f => isRaid() ? (f && f.idx === 1 ? 1 : 0) : (is2v2() ? ((f ? f.idx : 0) % 2) : (f ? f.idx : 0));
const sideFighters = side => isRaid() ? (side === 0 ? [A, C, D].filter(f => !f.hidden) : [B]) : (is2v2() ? (side === 0 ? [A, C] : [B, D]) : [[A, B][side]]);   // 一方场上的人：1v1 一个，2v2 两个，同袍肉鸽 2~3 人战首领
const allFighters = () => isRaid() ? [A, B, C, D].filter(f => !f.hidden) : (is2v2() ? [A, B, C, D] : [A, B]);
const isAiVsAi = () => !!(M.watchAi || (M.mode === 'watch2v2' && M.watchAi) || M.mode === 'demo' || (typeof bpMode !== 'undefined' && bpMode === 'cpuWatch') || (M.mode !== 'net' && !isMulti() && A && A.ctrl && A.ctrl !== human[0] && A.ctrl !== human[1]));
const fighterByIdx = idx => [A, B, C, D][idx] || A;
const foesOf = f => {
  if (isRaid()) {
    if (f === B) {
      const list = [A, C, D].filter(e => !e.hidden);
      const alive = list.filter(e => e.hp > 0);
      return alive.length ? alive : list;
    }
    return [B];
  }
  if (!is2v2()) return [f === A ? B : A];
  const list = (f.idx % 2 === 0) ? [B, D] : [A, C];
  const alive = list.filter(e => !e.hidden && e.hp > 0);
  return alive.length ? alive : list;
};
// 2v2 里谁算电脑（会配合队友选目标）。本地四个玩家用 human[0]～[3]；联机和本地回放里玩家的操控是普通 Ctrl，带 net 标记，也不是电脑
const cpuTeamwork = f => !!(f.ctrl && !human.includes(f.ctrl) && !f.ctrl.net);
const foeOf = f => {
  if (!isMulti()) return f === A ? B : A;
  if (isRaid() && f !== B) { f.target = B; return B; }
  const list = foesOf(f);
  if (!list.length) return A;
  if (list.length === 1) { f.target = list[0]; return list[0]; }
  // 电脑侠客的团队意识：残血的敌人两人一起收割；队友残血被缠住就过去解围（只影响电脑，玩家的朝向不变）
  if (!isRaid() && cpuTeamwork(f)) {
    const mate = fighterByIdx(f.idx ^ 2);
    const low = list.find(e => e.hp < e.maxHp * 0.25 && Math.abs(e.x - f.x) < 700);
    if (low) { f.target = low; return low; }
    if (mate && mate !== f && !mate.hidden && mate.hp > 0 && mate.hp < mate.maxHp * 0.3) {
      const bully = list.find(e => Math.abs(e.x - mate.x) < 260);
      if (bully) { f.target = bully; return bully; }
    }
  }
  let cur = f.target && !f.target.hidden && f.target.hp > 0 && list.includes(f.target) ? f.target : null;
  if (cur) {
    const curDist = Math.abs(cur.x - f.x);
    const other = list.find(e => e !== cur);
    if (other) {
      const otherDist = Math.abs(other.x - f.x);
      // 迟滞锁定：另一名敌人至少比当前目标近 85 像素才切换，防止双人靠近时左右剧烈晃动卡顿
      if (otherDist < curDist - 85) cur = other;
    }
    f.target = cur;
    return cur;
  }
  let best = list[0], minDist = Math.abs(best.x - f.x);
  for (let i = 1; i < list.length; i++) {
    const dist = Math.abs(list[i].x - f.x);
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
function initArena2v2() {
  ARENA2V2.geysers = [{ x: 460, cd: 0 }, { x: STAGE_W - 460, cd: 0 }];
  ARENA2V2.altarTimer = 4.0;
  ARENA2V2.orb = { active: false, kind: 0, y: -55 };
  ARENA2V2.hazardTimer = 7.0;
  ARENA2V2.scars = [];
}
function updateArena2v2(dt) {
  if (M.phase !== 'fight') return;
  for (const g of ARENA2V2.geysers) {
    if (g.cd > 0) g.cd = Math.max(0, g.cd - dt);
    else {
      for (const f of allFighters()) {
        if (f.hidden || f.hp <= 0 || f.state === 'special' || f.state === 'knockdown') continue;
        if (Math.abs(f.x - g.x) < 46 && f.y > -45) {
          g.cd = 4.2;
          f.vy = -1040;
          f.y = Math.min(f.y, -4);
          f.state = 'air';
          f.jumps = 0;
          f.airDash = 1;
          f.skillCD = Math.max(0, f.skillCD - 1.5);
          ring(g.x, -10, 130, '120,245,215', 0.4);
          for (let k = 0; k < 14; k++) addP({ type: 'spark', x: g.x + rand(-28, 28), y: -rand(5, 60), vx: rand(-80, 80), vy: -rand(180, 420), life: 0.55, max: 0.55, rgb: '120,245,215', w: 2.2 });
          addP({ type: 'text', text: '🌪️ 御风灵泉 · 凌空', x: f.x, y: f.y - 110, life: 0.9, max: 0.9, rgb: '120,245,215' });
          SFX.dash();
          break;
        }
      }
    }
  }
  const cx = STAGE_W / 2;
  if (!ARENA2V2.orb.active) {
    ARENA2V2.altarTimer -= dt;
    if (ARENA2V2.altarTimer <= 0) {
      ARENA2V2.orb.active = true;
      ARENA2V2.orb.kind = (grnd() * 3) | 0;   // 影响对局结果，联机两边要算得一样：用对局随机数
      const names = ['🔥 朱雀神火 · 破军', '🌕 太阴灵丹 · 固本', '⚡ 紫微星魄 · 满怒'];
      const cols = ['255,120,70', '120,245,190', '190,140,255'];
      ring(cx, -65, 180, cols[ARENA2V2.orb.kind], 0.5);
      addP({ type: 'text', text: '剑坛赐福：' + names[ARENA2V2.orb.kind], x: cx, y: -150, life: 1.3, max: 1.3, rgb: cols[ARENA2V2.orb.kind] });
    }
  } else {
    for (const f of allFighters()) {
      if (f.hidden || f.hp <= 0) continue;
      if (Math.abs(f.x - cx) < 56 && Math.abs((f.y - 50) - (-60)) < 65) {
        const k = ARENA2V2.orb.kind;
        ARENA2V2.orb.active = false;
        ARENA2V2.altarTimer = 8.5;
        const shareList = (isRaid() && fighterTeam(f) === 0) ? sideFighters(0).filter(m => m.hp > 0) : [f];
        for (const mf of shareList) {
          if (k === 0) {
            mf.buffT = 4.5; mf.skillCD = 0; mf.skill2CD = 0;
            ring(mf.x, mf.y - 55, 170, '255,120,70', 0.45);
            addP({ type: 'text', text: shareList.length > 1 ? '🔥 同袍共享 · 朱雀狂暴' : '🔥 朱雀战魂 · 狂暴破招', x: mf.x, y: mf.y - 125, life: 1.1, max: 1.1, rgb: '255,130,80' });
          } else if (k === 1) {
            mf.hp = Math.min(mf.maxHp, mf.hp + 75);
            mf.lagHp = Math.max(mf.lagHp, mf.hp);
            mf.guard = Math.min(mf.maxGuard, (mf.guard || 0) + 25);
            ring(mf.x, mf.y - 55, 170, '120,245,190', 0.45);
            addP({ type: 'text', text: shareList.length > 1 ? '🌕 同袍共享 · 灵丹 +75' : '🌕 太阴灵丹 +75', x: mf.x, y: mf.y - 125, life: 1.1, max: 1.1, rgb: '120,245,190' });
          } else {
            mf.meter = 100; mf.armorT = 2.2; mf.armorHits = 3;
            ring(mf.x, mf.y - 55, 170, '190,140,255', 0.45);
            addP({ type: 'text', text: shareList.length > 1 ? '⚡ 同袍共享 · 绝技满盈' : '⚡ 紫微星魄 · 绝技满盈', x: mf.x, y: mf.y - 125, life: 1.1, max: 1.1, rgb: '195,145,255' });
          }
        }
        SFX.parry();
        break;
      }
    }
  }
  ARENA2V2.hazardTimer -= dt;
  if (ARENA2V2.hazardTimer <= 0) {
    ARENA2V2.hazardTimer = 11.5;
    const alive = allFighters().filter(f => !f.hidden && f.hp > 0);
    for (const t of alive) {
      const hx = clamp(t.x + (grnd() * 180 - 90), WALL + 80, STAGE_W - WALL - 80);
      ring(hx, -4, 95, '255,215,90', 0.5);
      addP({ type: 'text', text: '⚡ 天劫落雷', x: hx, y: -95, life: 0.65, max: 0.65, rgb: '255,220,100' });
      const foeSetter = foesOf(t)[0] || A;
      spawnProj(foeSetter, { kind: 'bolt', x: hx, y: -360, vx: 0, w: 68, h: 720, life: 0.72, delay: 0.52, dmg: 38, stun: 0.45, hs: 0.1, kb: [160, -480], launch: true, unblockable: false });
    }
  }
}

const CN = ['', '一', '二', '三', '四', '五'];
let hitstop = 0, slowmo = 0, superFreeze = 0, superOwner = null, shake = 0, flashA = 0, flashRGB = '255,255,255', dimA = 0, paused = false;
let shakeDirX = 0, shakeDirY = 0; // 方向性屏幕震动向量 (Directional screen shake)
let debugHitbox = false;          // 试剑模式：判定框与帧优势实时透视 (F1 切换)
let announce = null;
const announceQueue = [];
const comboUI = [{ n: 0, dmg: 0, t: 0 }, { n: 0, dmg: 0, t: 0 }, { n: 0, dmg: 0, t: 0 }, { n: 0, dmg: 0, t: 0 }];

// 开场署名（停留时长 CREDIT 在 01-core.js）
let creditT = 0, creditPending = false;
function say(text, dur = 1.1, style = 'big', sub = '') {
  if (RESIM) return;
  const item = { text, t: 0, dur, style, sub, seed: Math.random() * 100 };
  if (!announce) {
    announce = item;
  } else {
    if (announce.text !== text && !announceQueue.some(q => q.text === text)) {
      announceQueue.push(item);
    }
  }
}
function randomPair() { const a = Math.random() * CHARS.length | 0; let b = Math.random() * (CHARS.length - 1) | 0; if (b >= a) b++; return [a, b]; }
// 还在等人进房间或在排队时开始单人模式：先关掉房间，免得有人进来把你拉去选人
function netDropWaiting() { if (!NET.open && p2pActive()) { netLeave(); $id('roomCode').textContent = ''; netStatus(''); } }
function startMatch(mode, level, chars, isWatch = false) {
  if (mode !== 'demo') refocusGame();
  if (mode !== 'net' && mode !== 'demo' && mode !== 'replay') netDropWaiting();
  human[0].rec = null;
  chars = chars || randomPair();
  // 常规对战各选 2 人：chars 是 [[我方第一人, 第二人], [对方第一人, 第二人]]，先由各自的第一人出战
  const duo = Array.isArray(chars[0]) ? chars : null;
  if (duo) chars = [duo[0][0], duo[1][0]];
  setChars(chars[0], chars[1]);
  if (mode === 'net') { setupNetMatch(); send({ mstart: 1 }); startRound(); return; }
  M.mode = mode; M.level = level; M.wins = [0, 0]; M.round = 1; M.carry = null; M.stage = null; M.duo = duo; M.quick = false;
  M.watchAi = !!isWatch;
  A.meter = B.meter = 0;
  A.ctrl = (mode === 'demo' || isWatch) ? new AICtrl(level || 'god') : human[0];
  B.ctrl = mode === 'pvp' ? human[1] : mode === 'train' ? new DummyCtrl(level) : new AICtrl(mode === 'demo' ? 'normal' : level);
  human[0].clear(); human[1].clear();
  REC.on = false; if ((mode === 'cpu' || mode === 'pvp') && !TUT && !isWatch) recBegin('loc');
  startRound();
  if (isWatch && mode !== 'demo') say('AI 对决 · 演武观战', 1.4);
}
function startRound() {
  STAGE_W = M.mode === 'world' ? WORLD_W : (isMulti() ? 2600 : 1800);   // 开放世界是 8000 宽的大地图
  if (typeof applySkins === 'function') applySkins();
  if (isRaid()) {
    const sq = M.raidSquadSize || 3;
    C.hidden = false;
    D.hidden = sq < 3;
    A.reset(STAGE_W / 2 - 440); A.face = 1;
    C.reset(STAGE_W / 2 - 260); C.face = 1;
    if (!D.hidden) { D.reset(STAGE_W / 2 - 110); D.face = 1; }
    B.reset(STAGE_W / 2 + 300); B.face = -1;
    if (typeof applyRaidBossToB === 'function') applyRaidBossToB();
    initArena2v2();
    for (const f of allFighters()) {
      if (f.ctrl && typeof f.ctrl.updateTactic === 'function') f.ctrl.updateTactic(f, foeOf(f));
    }
  } else if (is2v2()) {
    C.hidden = false; D.hidden = false;
    A.reset(STAGE_W / 2 - 420); C.reset(STAGE_W / 2 - 210);
    B.reset(STAGE_W / 2 + 210); D.reset(STAGE_W / 2 + 420);
    initArena2v2();
    for (const f of [A, B, C, D]) {
      if (f.ctrl && typeof f.ctrl.updateTactic === 'function') f.ctrl.updateTactic(f, foeOf(f));
    }
  } else {
    C.hidden = true; D.hidden = true;
    A.reset(STAGE_W / 2 - 230); B.reset(STAGE_W / 2 + 230);
    if (A.ctrl && typeof A.ctrl.updateTactic === 'function') A.ctrl.updateTactic(A, B);
    if (B.ctrl && typeof B.ctrl.updateTactic === 'function') B.ctrl.updateTactic(B, A);
  }
  const isMayhem = M.mode === 'mayhem' || (netRoom() || {}).rule === 'mayhem';
  if (isMayhem) {
    A.maxHp = Math.round(A.maxHp * 10);
    B.maxHp = Math.round(B.maxHp * 10);
    A.hp = A.lagHp = A.maxHp;
    B.hp = B.lagHp = B.maxHp;
    A.guard = A.maxGuard = 500;
    B.guard = B.maxGuard = 500;
    A.meter = B.meter = 100;
  }
  if (chaosOn() && M.round === 1) M.chaos = { i: -1, t: 0 };   // 天机乱斗：开打第一帧抽第一条异变（updateChaos），之后的回合接着换
  const foeHp = (LEVEL_BY_ID[M.level] || {}).foeHp || 1;   // 难度表里的电脑气血倍数（绝顶多 35%）
  if ((M.mode === 'cpu' || (M.mode === 'replay' && REPLAY.kind !== 'net') || M.mode === 'tag3') && foeHp !== 1) { B.maxHp = Math.round(B.maxHp * foeHp); B.hp = B.lagHp = B.maxHp; }
  if (M.carry && M.round > 1) { [A, B].forEach((f, i) => { if (M.carry[i] !== null && M.carry[i] !== undefined) f.hp = f.lagHp = Math.round(f.maxHp * M.carry[i] * 10) / 10; }); }
  M.carry = null; M.pre = null; M.ot = false; M.rseq = (M.rseq || 0) + 1; M.introFX = M.round === 1 && M.mode !== 'demo';
  M.phase = 'intro'; M.t = 0; M.timer = isRaid() ? 120 : (is2v2() ? ROUND_TIME_2V2 : ROUND_TIME); M.koWinner = -1; M.flags = {};
  hitstop = slowmo = superFreeze = 0; particles.length = 0; decoys.length = 0; projs.length = 0;
  for (const cu of comboUI) cu.t = 0;
  if (M.mode !== 'demo' && M.mode !== 'train') {
    if (M.round === 1) {
      creditT = CREDIT; creditPending = true; metal(880, 1.8, 0.05);
    } else {
      const txt = M.mode === 'tag3' ? `第${CN[M.round] || M.round}局` : `第${CN[M.round] || M.round}回合`;
      say(txt, 1.1); SFX.gong();
    }
  }
  scRoundStart();
  netEmit({ e: 'round', r: M.round, w: [...M.wins], ch: [A.chIdx, B.chIdx] });
}
// 回合规则的数值（回合时长、加时、带血 +CARRY_HEAL）都在 01-core.js 的「对战规则数值」里
function timeDeath(winner, text) {
  M.phase = 'ko'; M.t = 0; M.koWinner = winner;
  M.pre = [A.hp / A.maxHp, B.hp / B.maxHp];           // 记下“生前”的血量
  if (winner >= 0) {
    const losers = sideFighters(1 - winner);
    const winRef = [A, B][winner];
    for (const l of losers) {
      l.hp = 0; l.state = 'launched'; l.t = 0; l.vy = -380; l.vx = (l.x >= winRef.x ? 1 : -1) * 260; l.y = Math.min(l.y, -1); l.invul = 99; l.move = null; l.skill = null;
    }
  }
  sayNet(text, 1.4, 'big', 'gong');
}
function updateMatch() {
  M.t += STEP;
  if (M.phase === 'intro') {
    if (M.introFX && M.t > 0.2) { M.introFX = false; for (const f of allFighters()) if (!f.hidden && !f.dummy) skinIntroFX(f); }
    const go = M.mode === 'demo' || M.mode === 'train' ? 0.3 : 1.25 + (M.round === 1 ? CREDIT : 0);
    if (M.t > go && !M.flags.go) { M.flags.go = true; if (M.mode !== 'demo' && M.mode !== 'train') sayNet('开战', 0.7, 'go', 'heavy'); }
    if (M.t > go + 0.35) { M.phase = 'fight'; M.t = 0; }
  } else if (M.phase === 'fight') {
    if (FOREST.on) return;   // 斩妖波次由 forestUpdate 独立推进，清完群妖再衔接六技魔首或结算
    if (M.mode === 'boss') gbossStep();   // 天魔倒下会再站起来，见 22-tianmo.js
    if (isRaid() && typeof updateRaidBoss === 'function') updateRaidBoss(STEP);
    const team0Out = isRaid() ? sideFighters(0).every(f => f.hp <= 0) : (is2v2() ? (A.hp <= 0 && C.hp <= 0) : (A.hp <= 0));
    const team1Out = isRaid() ? (B.hp <= 0) : (is2v2() ? (B.hp <= 0 && D.hp <= 0) : (B.hp <= 0));
    if (M.mode !== 'train' && (team0Out || team1Out)) {
      const sumHp = sd => sideFighters(sd).reduce((s, f) => s + Math.max(0, f.hp), 0);
      const winner = (team0Out && team1Out)
        ? (sumHp(0) >= sumHp(1) ? 0 : 1)
        : (team0Out ? 1 : 0);
      const losers = sideFighters(1 - winner);
      for (const loser of losers) {
        loser.hp = 0;
        if (loser.state !== 'launched' && loser.state !== 'knockdown') {
          loser.state = 'launched';
          loser.t = 0;
          loser.vy = Math.min(loser.vy, -520);
          loser.y = Math.min(loser.y, -1);
        }
      }
      M.phase = 'ko';
      M.t = 0;
      M.koWinner = winner;
    } else if (M.mode !== 'demo' && M.mode !== 'train') {
      if (chaosOn()) updateChaos(STEP);   // 联机两边都算（以前只有房主抽，异变也只认本地模式，联机等于没有）
      M.timer = Math.max(0, M.timer - STEP);
      if (M.timer <= 0) {
        const s0 = sideFighters(0), s1 = sideFighters(1);
        const ra = s0.reduce((s, f) => s + Math.max(0, f.hp), 0) / Math.max(1, s0.reduce((s, f) => s + f.maxHp, 0));
        const rb = s1.reduce((s, f) => s + Math.max(0, f.hp), 0) / Math.max(1, s1.reduce((s, f) => s + f.maxHp, 0));
        if (M.mode === 'boss') timeDeath(-1, '时辰已到');
        else if (M.mode === 'saga') sagaTimeUp(ra, rb);   // 侠客列传：按这一战的胜利条件判
        else if (!M.ot) { M.ot = true; M.timer = OT_TIME; sayNet('加时 · 伤害翻倍', 1.4, 'big', 'gong'); }
        else timeDeath(ra > rb ? 0 : rb > ra ? 1 : -1, '时间到');
      }
    }
  } else if (M.phase === 'ko') {
    const winners = M.koWinner >= 0 ? sideFighters(M.koWinner) : [];
    for (const w of winners) {
      if (w && M.t > 1.2 && w.hp > 0 && w.onGround() && (w.state === 'idle' || w.state === 'walk')) { w.state = 'victory'; w.t = 0; skinVictoryFX(w); }
    }
    if (M.t > 2.8) {
      try { endRound(); } catch (err) { console.error('endRound error:', err); showEnd(M.koWinner >= 0 ? M.koWinner : 0); }
    }
  }
}
function saveProfile() {
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  applyProfile(PROF);
}
function sayNet(text, dur, style, snd) { say(text, dur, style); if (snd) SFX[snd](); netEmit({ e: 'say', text, dur, style, snd }); }
// 结算大字：墨笔写“谁，胜”，胜字盖成朱印
function inkTitle(name, lost) {
  const t = $id('endTitle');
  t.style.color = '';
  t.className = 'ink-title' + (lost ? ' lost' : '');
  t.innerHTML = `<span class="it-name">${escapeHTML(name)}</span><span class="it-comma">，</span><span class="it-seal">胜</span>`;
}
function showEnd(w) {
  if (REPLAY.on) { replayEnd(w); return; }
  if (M.worldKey) { worldKeyRound(w); return; }
  if (REC.on) recSave(w);
  taskMatchEnd(w);
  $id('endKicker').textContent = '';
  $id('endRk').innerHTML = ''; $id('endRk').classList.add('hidden');
  $id('netRepickBtn').classList.add('hidden');   // 「换人再战」只给联机局；上一局是联机时别带到肉鸽、剑阁、车轮战的结算里
  $id('againBtn').style.display = (isAiVsAi() || M.watchAi || (M.mode === 'watch2v2' && M.watchAi)) ? 'none' : ''; $id('rpWatch').style.display = RP.last ? '' : 'none'; $id('rpWatch').textContent = '看回放';
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
    else { again.style.display = ''; again.disabled = false; again.textContent = '再战一场'; }
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
  $id('endRank').textContent = M.mode === 'net' && !ACC.name ? '登录后，胜负会计入排行榜' : '';
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
  if (M.mode === 'boss') { gbossFinish(w < 0 ? 'time' : 'down'); return; }
  if (M.worldKey && M.worldKey.kind === 'boss') { worldKeyRound(w); return; }   // 全服肉鸽的天道 Boss：结果和奖励都以服务器为准，这里不加墨锭（车轮战照常换人，打完在 showEnd 里交出去）
  if (M.mode === 'saga') { sagaEnd(w); return; }
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

