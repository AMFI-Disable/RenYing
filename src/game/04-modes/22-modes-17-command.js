// ======================= 将令：团战里的指挥系统 =======================
// 三人以上的团战（群雄会战、夺旗争锋、四象争锋）里，每一队有一名统帅（帅旗标在头顶）：
//   · 你的队伍里统帅就是你；电脑队伍随机抽一名电脑当统帅。统帅有额外 35% 气血，倒下时全队战术暂停。
//   · 三种战术，各自让队友的打法明显不同，而且首尾相克（石头剪刀布式，像田忌赛马）：
//       锋矢（1）：集火突击，全队盯同一个人猛攻      克 铁壁
//       铁壁（2）：抱团固守，在统帅身边守住再反击    克 游袭
//       游袭（3）：分散缠斗，各找落单的人打了就走    克 锋矢
//     克制时伤害 +18%，被克制伤害 −12%。看不到对方在用哪一种，只能从他们的站位和目标里猜。
//   · Tab 轻点循环换战术；按住 Tab 看战况总览。
//   · Y 选中一名队友（再按下一名，最后回到「全队」），N 给选中的人（或全队）换任务：
//       主攻：打统帅锁定（G）或正在打的人；牵制：缠住主攻目标身边的人，别让他们去帮忙；
//       破连：专打正在连击我方队友的人，打断连击；自由：按当前战术自己决定。
//   · 电脑统帅每十几秒看一眼对面队伍的站位（是不是围着一个人、是不是散开、是不是抱团），再决定要不要换克制它的战术。
// 找 bug 提示：战术没效果先看 cmdTacticOf（统帅倒下会返回 null）；电脑队友乱走看 cmdPickTarget 和 ai.js 里的 cmdAiMod。
const CMD_TACTICS = {
  auto: { n: '智策', sub: '智能自适应', key: '4', rgb: '233,196,106', hex: '#e9c46a', beats: null },
  spear: { n: '锋矢', sub: '集火突击', key: '1', rgb: '255,165,100', hex: '#ffa564', beats: 'wall' },
  wall: { n: '铁壁', sub: '抱团固守', key: '2', rgb: '130,220,255', hex: '#82dcff', beats: 'raid' },
  raid: { n: '游袭', sub: '分散缠斗', key: '3', rgb: '140,240,180', hex: '#8cf0b4', beats: 'spear' },
};
const CMD_ORDER = ['spear', 'wall', 'raid'];
const CMD_UI_ORDER = ['auto', 'spear', 'wall', 'raid'];
const CMD_BEATEN_BY = { wall: 'spear', raid: 'wall', spear: 'raid' };   // 谁克它
const CMD_ROLES = [
  { id: 'auto', n: '自由', g: '' },
  { id: 'main', n: '主攻', g: '攻' },
  { id: 'lure', n: '牵制', g: '牵' },
  { id: 'peel', n: '破连', g: '缠' },
];
const CMD_FORMATIONS = [
  { id: 'auto', n: '自由阵型', sub: '依战术自然站位' },
  { id: 'group', n: '抱团集结', sub: '全队向队伍中心靠拢' },
  { id: 'escort', n: '护卫统帅', sub: '紧随玩家身侧协防' },
  { id: 'spread', n: '分散包抄', sub: '拉开间距多线牵制' },
];
const CMD_HP_BONUS = 1.35;
const CMD_BEAT_MUL = 1.18, CMD_BEATEN_MUL = 0.88;

// 二十位侠客团队战术画像：基于属性、射程、机动、招式定位与团队协同构建
const HERO_TACTIC_PROFILE = {
  qingfeng:   { arch: 'skirmisher', prefRole: 'main', rangeBand: 0.96, peel: 0.55, burst: 0.82, flank: 0.68, retreatHp: 0.26, synergy: ['cc', 'vanguard'], stanceAggr: 1.08 },
  feiying:    { arch: 'assassin',   prefRole: 'lure', rangeBand: 0.86, peel: 0.35, burst: 0.90, flank: 0.96, retreatHp: 0.32, synergy: ['vanguard', 'cc'], stanceAggr: 1.12 },
  tieshan:    { arch: 'vanguard',   prefRole: 'peel', rangeBand: 0.82, peel: 0.94, burst: 0.66, flank: 0.25, retreatHp: 0.18, synergy: ['zoner', 'assassin'], stanceAggr: 0.92 },
  lingshuang: { arch: 'skirmisher', prefRole: 'peel', rangeBand: 1.12, peel: 0.78, burst: 0.72, flank: 0.52, retreatHp: 0.28, synergy: ['zoner', 'vanguard'], stanceAggr: 1.04 },
  liuyun:     { arch: 'zoner',      prefRole: 'lure', rangeBand: 1.16, peel: 0.45, burst: 0.70, flank: 0.86, retreatHp: 0.34, synergy: ['vanguard', 'cc'], stanceAggr: 1.06 },
  leiming:    { arch: 'skirmisher', prefRole: 'main', rangeBand: 0.90, peel: 0.76, burst: 0.86, flank: 0.64, retreatHp: 0.22, synergy: ['cc', 'support'], stanceAggr: 1.10 },
  moyu:       { arch: 'zoner',      prefRole: 'lure', rangeBand: 1.24, peel: 0.58, burst: 0.76, flank: 0.42, retreatHp: 0.36, synergy: ['vanguard', 'cc'], stanceAggr: 1.00 },
  yuehua:     { arch: 'support',    prefRole: 'peel', rangeBand: 1.08, peel: 0.86, burst: 0.56, flank: 0.40, retreatHp: 0.34, synergy: ['skirmisher', 'vanguard'], stanceAggr: 0.95 },
  yanling:    { arch: 'assassin',   prefRole: 'lure', rangeBand: 1.06, peel: 0.32, burst: 0.84, flank: 0.94, retreatHp: 0.35, synergy: ['vanguard', 'cc'], stanceAggr: 1.10 },
  yuxiao:     { arch: 'zoner',      prefRole: 'peel', rangeBand: 1.20, peel: 0.74, burst: 0.68, flank: 0.45, retreatHp: 0.36, synergy: ['vanguard', 'support'], stanceAggr: 0.98 },
  zuixian:    { arch: 'vanguard',   prefRole: 'peel', rangeBand: 0.90, peel: 0.88, burst: 0.74, flank: 0.46, retreatHp: 0.20, synergy: ['assassin', 'zoner'], stanceAggr: 1.02 },
  gouchen:    { arch: 'vanguard',   prefRole: 'peel', rangeBand: 0.95, peel: 0.90, burst: 0.78, flank: 0.55, retreatHp: 0.22, synergy: ['assassin', 'skirmisher'], stanceAggr: 1.05 },
  lingque:    { arch: 'assassin',   prefRole: 'main', rangeBand: 1.00, peel: 0.42, burst: 0.95, flank: 0.90, retreatHp: 0.30, synergy: ['cc', 'vanguard'], stanceAggr: 1.12 },
  liying:     { arch: 'assassin',   prefRole: 'lure', rangeBand: 1.04, peel: 0.48, burst: 0.82, flank: 0.92, retreatHp: 0.32, synergy: ['vanguard', 'zoner'], stanceAggr: 1.06 },
  cixian:     { arch: 'controller', prefRole: 'peel', rangeBand: 1.08, peel: 0.84, burst: 0.80, flank: 0.56, retreatHp: 0.28, synergy: ['assassin', 'skirmisher'], stanceAggr: 1.04 },
  qianji:     { arch: 'controller', prefRole: 'lure', rangeBand: 1.16, peel: 0.62, burst: 0.78, flank: 0.62, retreatHp: 0.30, synergy: ['vanguard', 'zoner'], stanceAggr: 1.05 },
  chixiao:    { arch: 'skirmisher', prefRole: 'main', rangeBand: 1.02, peel: 0.64, burst: 0.88, flank: 0.60, retreatHp: 0.24, synergy: ['cc', 'support'], stanceAggr: 1.10 },
  xuanji:     { arch: 'zoner',      prefRole: 'lure', rangeBand: 1.22, peel: 0.70, burst: 0.82, flank: 0.48, retreatHp: 0.34, synergy: ['vanguard', 'assassin'], stanceAggr: 1.02 },
  qingluan:   { arch: 'support',    prefRole: 'peel', rangeBand: 1.15, peel: 0.92, burst: 0.52, flank: 0.50, retreatHp: 0.38, synergy: ['vanguard', 'skirmisher'], stanceAggr: 0.90 },
  xuanwu:     { arch: 'vanguard',   prefRole: 'peel', rangeBand: 0.88, peel: 0.96, burst: 0.68, flank: 0.22, retreatHp: 0.16, synergy: ['zoner', 'support'], stanceAggr: 0.94 },
};
function heroTacticProfile(f) {
  const id = f && f.ch && f.ch.id;
  return HERO_TACTIC_PROFILE[id] || { arch: 'skirmisher', prefRole: 'main', rangeBand: 1.0, peel: 0.55, burst: 0.72, flank: 0.55, retreatHp: 0.28, synergy: [], stanceAggr: 1.0 };
}

// 赛前默认战术偏好（持久化于 localStorage，默认为 auto 智能自适应）
let defaultTeamTactic = 'auto';
try {
  const savedTac = localStorage.getItem('renying-default-tactic');
  if (savedTac && CMD_TACTICS[savedTac]) defaultTeamTactic = savedTac;
} catch (e) {}
function getDefaultTeamTactic() { return CMD_TACTICS[defaultTeamTactic] ? defaultTeamTactic : 'auto'; }
function setDefaultTeamTactic(tac) {
  const next = CMD_TACTICS[tac] ? tac : 'auto';
  defaultTeamTactic = next;
  try { localStorage.setItem('renying-default-tactic', next); } catch (e) {}
  return next;
}

const cmdOn = () => !!M.cmd;
const cmdFighter = t => { const T = M.cmd && M.cmd.team[t]; return T ? FIGHTERS[T.cmdr] : null; };
const cmdIs = f => !!(M.cmd && f && M.cmd.team[fighterTeam(f)] && M.cmd.team[fighterTeam(f)].cmdr === f.idx);
const cmdIsPlayerCtrl = c => !!(c && (human.includes(c) || c.net));
const cmdIsHumanTeam = t => { const c = cmdFighter(t); return !!(c && cmdIsPlayerCtrl(c.ctrl)); };
// 这一队现在生效的战术姿态（spear/wall/raid）：当选「智策」时返回实时推演的子战术；统帅倒下时为 null
function cmdTacticOf(t) {
  const T = M.cmd && M.cmd.team[t];
  if (!T || !T.tactic) return null;
  const c = FIGHTERS[T.cmdr];
  if (!c || c.hp <= 0 || c.hidden) return null;
  if (T.tactic === 'auto') return T.autoSub || 'spear';
  return T.tactic;
}
function cmdSelectedTacticOf(t) {
  const T = M.cmd && M.cmd.team[t];
  return T ? T.tactic : null;
}
const cmdTacName = id => (id && CMD_TACTICS[id]) ? CMD_TACTICS[id].n : '无令';

const cmdRand = (a, b) => a + grnd() * (b - a);

function cmdRoundInit() {
  M.cmd = null;
  if (!isLargeTeam() || M.watchAi || M.mode === 'demo' || M.mode === 'replay') return;
  const tc = teamCount();
  const C = { team: [], role: new Array(MAX_FIGHTERS).fill(0), sel: -1, tgtCount: new Array(MAX_FIGHTERS).fill(0), obsT: 0, tabAt: 0, hint: 0 };
  for (let t = 0; t < tc; t++) {
    const members = sideFighters(t);
    const humans = members.filter(f => cmdIsPlayerCtrl(f.ctrl));
    const pool = humans.length ? humans : members;   // 有真人就从真人里随机，没有就从电脑里随机
    const cmdr = pool[(grnd() * pool.length) | 0];
    C.team.push({
      cmdr: cmdr ? cmdr.idx : t, tactic: null, autoSub: 'spear', autoReason: '均衡协同', since: clock, nextEval: clock + cmdRand(4, 7), focus: -1, focusT: 0,
      obs: { cx: 0, spread: 0, focus: 0, n: 0 }, dealt: 0, taken: 0, log: [],
    });
  }
  M.cmd = C;
  const pref = getDefaultTeamTactic();
  for (let t = 0; t < tc; t++) {
    const cmdr = FIGHTERS[C.team[t].cmdr];
    if (cmdr) cmdApplyHp(cmdr);
    if (cmdIsHumanTeam(t)) {
      C.team[t].tactic = pref;
      C.team[t].log.push(pref);
    } else {
      C.team[t].tactic = 'auto';
      C.team[t].autoSub = CMD_ORDER[(grnd() * 3) | 0];
      C.team[t].log.push('auto');
    }
  }
  for (const f of allFighters()) { f.cmdTgt = -1; f.cmdTgtT = 0; f.cmdHitBy = -1; f.cmdHitT = -99; }
  cmdObserve();
  for (let t = 0; t < tc; t++) if (C.team[t].tactic === 'auto') cmdAdaptiveEval(t);
  const lt = localTeam();
  if (cmdIsHumanTeam(lt)) say(`你是统帅 · ${CMD_TACTICS[pref].n}（1/2/3/4 或 Tab）`, 2.4, 'go');
}
function cmdApplyHp(f) {
  f.maxHp = Math.round(f.maxHp * CMD_HP_BONUS); f.hp = f.lagHp = f.maxHp;
}
// 复活后、重开一回合后：气血被重置了，统帅的额外气血补回来
function cmdAfterReset(f) {
  if (cmdIs(f)) cmdApplyHp(f);
  f.cmdTgt = -1; f.cmdTgtT = 0;
}
function cmdOnFall(f) {
  if (!M.cmd) return;
  if (cmdIs(f)) {
    const t = fighterTeam(f);
    if (!RESIM) {
      addP({ type: 'text', text: cvT(t === localTeam() ? '统帅倒下 · 战术暂停' : '敌帅倒下！'), x: f.x, y: f.y - 150, life: 1.3, max: 1.3, rgb: t === localTeam() ? '255,140,120' : '255,225,130' });
      if (t !== localTeam()) say('敌帅倒下！', 1.0, 'go');
    }
    M.cmd.team[t].nextEval = clock + 2;
  }
}
function cmdOnTeamOut(t) { if (M.cmd && M.cmd.team[t]) M.cmd.team[t].tactic = null; }

// ----- 下令（真人统帅按键，或电脑统帅自己决定） -----
function cmdSet(t, tac, byHuman) {
  const T = M.cmd && M.cmd.team[t];
  if (!T || !CMD_TACTICS[tac] || T.tactic === tac) return false;
  T.tactic = tac; T.since = clock; T.log.push(tac);
  if (tac === 'auto') cmdAdaptiveEval(t);
  const c = FIGHTERS[T.cmdr];
  if (byHuman && c && !RESIM) {
    const d = CMD_TACTICS[tac];
    const extra = tac === 'auto' && T.autoSub ? `→${cvT(CMD_TACTICS[T.autoSub].n)}` : '';
    addP({ type: 'text', text: `${cvT('令')} · ${cvT(d.n)}${extra}（${cvT(d.sub)}）`, x: c.x, y: c.y - 140, life: 1.1, max: 1.1, rgb: d.rgb });
    ring(c.x, c.y - 56, 150, d.rgb, 0.5);
    for (const m of sideFighters(t)) if (m !== c && m.hp > 0 && !m.hidden) ring(m.x, m.y - 50, 60, d.rgb, 0.4);
    SFX.gong ? SFX.gong() : SFX.dash();
  }
  return true;
}
function cmdCycleTactic() {
  if (!M.cmd) return;
  const t = localTeam(), c = cmdFighter(t);
  if (!c || !human.includes(c.ctrl) || c.hp <= 0 || (M.phase !== 'fight' && M.phase !== 'intro')) return;
  const T = M.cmd.team[t];
  const i = CMD_UI_ORDER.indexOf(T.tactic);
  cmdSet(t, CMD_UI_ORDER[(i + 1) % CMD_UI_ORDER.length], true);
}
// 统帅的按键：1/2/3/4 直接选战术，Y 选队友，N 给他分任务。返回 true 表示这个人在带队
function cmdHandleKeys(f, c) {
  if (!M.cmd || !cmdIs(f) || !cmdIsPlayerCtrl(f.ctrl)) return false;
  const t = fighterTeam(f);
  if (c.consume('orderFocus')) cmdSet(t, 'spear', true);
  else if (c.consume('orderProtect')) cmdSet(t, 'wall', true);
  else if (c.consume('orderSpread')) cmdSet(t, 'raid', true);
  else if (c.consume('orderAuto')) cmdSet(t, 'auto', true);
  if (c.consume('cmdSelect')) cmdSelectNext(t);
  if (c.consume('cmdRole')) cmdRoleCycle(t);
  return true;
}
function cmdSelectNext(t) {
  const C = M.cmd, mates = sideFighters(t).filter(m => m.idx !== C.team[t].cmdr && !m.hidden);
  if (!mates.length) return;
  const i = C.sel < 0 ? -1 : mates.findIndex(m => m.idx === C.sel);
  C.sel = i + 1 >= mates.length ? -1 : mates[i + 1].idx;   // 全队 → 队友 1 → 队友 2 … → 最后一下回到全队
}
function cmdRoleCycle(t) {
  const C = M.cmd, mates = sideFighters(t).filter(m => m.idx !== C.team[t].cmdr && !m.hidden);
  const targets = C.sel >= 0 ? mates.filter(m => m.idx === C.sel) : mates;
  if (!targets.length) return;
  const next = (C.role[targets[0].idx] + 1) % CMD_ROLES.length;
  for (const m of targets) C.role[m.idx] = next;
  const c = cmdFighter(t);
  if (c && !RESIM) addP({ type: 'text', text: `${C.sel >= 0 ? cvT(targets[0].look.name) : cvT('全队')} · ${cvT(CMD_ROLES[next].n)}`, x: c.x, y: c.y - 128, life: 0.9, max: 0.9, rgb: '255,235,150' });
}
// 严格模式白名单：仅在含 AI 队友的真实多人对抗模式显示战术面板与战术条（排除训练、教学、单挑、观战、闯关、列传、爬塔、无尽、百戏、回放、蹴鞠）
const CMD_EXCLUDED_MODES = new Set(['demo', 'train', 'tut', 'tutorial', 'cpu', 'pvp', 'tag3', 'stage', 'saga', 'tower', 'gauntlet', 'party', 'boss', 'replay', 'world', 'bastion', 'cuju']);
let TEAM_CMD_OPEN = false;
function teamCmdEligible() {
  if (!M || M.watchAi || CMD_EXCLUDED_MODES.has(M.mode)) return false;
  if (typeof isMulti !== 'function' || !isMulti()) return false;
  if (typeof isRaid === 'function' && isRaid()) return false;
  if (typeof cujuOn === 'function' && cujuOn()) return false;
  const t = localTeam();
  const mates = sideFighters(t).filter(f => !f.hidden);
  const hasHuman = mates.some(f => human.includes(f.ctrl));
  const hasAiMate = mates.some(f => !human.includes(f.ctrl) && !(f.ctrl && f.ctrl.net));
  return mates.length > 1 && hasHuman && hasAiMate;
}
function teamCmdOpen() {
  const el = typeof $id === 'function' ? $id('teamCmdPanel') : null;
  return !!(TEAM_CMD_OPEN && el && !el.classList.contains('hidden'));
}
function teamCmdClose() {
  TEAM_CMD_OPEN = false;
  const el = typeof $id === 'function' ? $id('teamCmdPanel') : null;
  if (el) el.classList.add('hidden');
  if (typeof refocusGame === 'function' && M.mode !== 'demo' && !paused && !document.querySelector('.scr.on')) refocusGame();
}
function toggleTeamCmdPanel(force) {
  if (force === false) { teamCmdClose(); return false; }
  if (!teamCmdEligible()) return false;
  const next = force === true ? true : !teamCmdOpen();
  TEAM_CMD_OPEN = next;
  const el = typeof $id === 'function' ? $id('teamCmdPanel') : null;
  if (!el) return false;
  el.classList.toggle('hidden', !next);
  if (next) {
    if (typeof TAB_SCOREBOARD !== 'undefined') TAB_SCOREBOARD = false;
    renderTeamCmdPanel();
  } else if (typeof refocusGame === 'function' && M.mode !== 'demo' && !paused && !document.querySelector('.scr.on')) {
    refocusGame();
  }
  return next;
}
function teamCmdSetTactic(tac) {
  const t = localTeam();
  const orderMap = { spear: 'focus', wall: 'protect', raid: 'spread', auto: 'auto' };
  if (M.cmd) {
    cmdSet(t, tac, true);
  } else {
    if (!Array.isArray(M.squadOrders)) M.squadOrders = ['auto', 'auto', 'auto', 'auto'];
    M.squadOrders[t] = orderMap[tac] || 'auto';
    if (tac === 'auto') squadAdaptiveEval(t);
    const lf = sideFighters(t).find(m => human.includes(m.ctrl)) || fighterByIdx(localIdx());
    const d = CMD_TACTICS[tac];
    if (lf && d && !RESIM) {
      addP({ type: 'text', text: `${cvT('令')} · ${cvT(d.n)}（${cvT(d.sub)}）`, x: lf.x, y: lf.y - 132, life: 1.0, max: 1.0, rgb: d.rgb });
      ring(lf.x, lf.y - 56, 120, d.rgb, 0.42);
    }
  }
  if (teamCmdOpen()) renderTeamCmdPanel();
}
function teamCmdSetFormation(fm) {
  const t = localTeam();
  if (!Array.isArray(M.teamFormation)) M.teamFormation = ['auto', 'auto', 'auto', 'auto'];
  M.teamFormation[t] = fm;
  const lf = sideFighters(t).find(m => human.includes(m.ctrl)) || fighterByIdx(localIdx());
  const fObj = CMD_FORMATIONS.find(x => x.id === fm);
  if (lf && fObj && !RESIM) {
    addP({ type: 'text', text: `${cvT('阵型')} · ${cvT(fObj.n)}`, x: lf.x, y: lf.y - 118, life: 0.9, max: 0.9, rgb: '140,225,255' });
  }
  if (teamCmdOpen()) renderTeamCmdPanel();
}
function teamCmdSetFocus(enemyIdx) {
  const t = localTeam();
  if (!Array.isArray(M.teamFocus)) M.teamFocus = [-1, -1, -1, -1];
  M.teamFocus[t] = enemyIdx;
  if (M.cmd && M.cmd.team[t]) { M.cmd.team[t].focus = enemyIdx; M.cmd.team[t].focusT = clock + 12; }
  const lf = sideFighters(t).find(m => human.includes(m.ctrl)) || fighterByIdx(localIdx());
  if (lf) lf.lockIdx = enemyIdx;
  const tgt = enemyIdx >= 0 ? FIGHTERS[enemyIdx] : null;
  if (tgt && !RESIM) {
    ring(tgt.x, tgt.y - 58, 92, '255,100,90', 0.36);
    addP({ type: 'text', text: `${cvT('全队集火')} · ${cvT(tgt.look.name)}`, x: tgt.x, y: tgt.y - 122, life: 0.95, max: 0.95, rgb: '255,150,120' });
  }
  for (const m of sideFighters(t)) if (!human.includes(m.ctrl)) { m.cmdTgt = enemyIdx; m.cmdTgtT = enemyIdx >= 0 ? clock + 1.2 : 0; }
  if (teamCmdOpen()) renderTeamCmdPanel();
}
function teamCmdSetRole(fighterIdx, roleIdx) {
  const t = localTeam();
  if (!Array.isArray(M.teamRoles)) M.teamRoles = new Array(MAX_FIGHTERS).fill(0);
  const mates = fighterIdx < 0
    ? sideFighters(t).filter(m => !m.hidden && !human.includes(m.ctrl))
    : [FIGHTERS[fighterIdx]].filter(m => m && !m.hidden);
  for (const m of mates) {
    M.teamRoles[m.idx] = roleIdx;
    if (M.cmd && M.cmd.role) M.cmd.role[m.idx] = roleIdx;
    m.cmdTgtT = 0;
  }
  if (teamCmdOpen()) renderTeamCmdPanel();
}
const CMD_ARCH_LABELS = { vanguard: '前排', skirmisher: '游斗', assassin: '刺客', controller: '控场', zoner: '远程', support: '辅助' };
function renderTeamCmdPanel() {
  const body = typeof $id === 'function' ? $id('tcpBody') : null;
  if (!body || !teamCmdEligible()) return;
  const t = localTeam();
  const T = M.cmd && M.cmd.team[t] ? M.cmd.team[t] : null;
  const curTac = T ? T.tactic : ({ focus: 'spear', protect: 'wall', spread: 'raid', auto: 'auto' }[M.squadOrders?.[t]] || 'auto');
  const activeSub = T ? cmdTacticOf(t) : (curTac === 'auto' ? ((M.squadAuto && M.squadAuto[t] && M.squadAuto[t].sub) || 'spear') : curTac);
  const autoReason = T ? (T.autoReason || '均衡协同') : ((M.squadAuto && M.squadAuto[t] && M.squadAuto[t].reason) || '均衡协同');
  const curForm = (M.teamFormation && M.teamFormation[t]) || 'auto';
  const curFocus = (M.teamFocus && M.teamFocus[t] >= 0) ? M.teamFocus[t] : -1;
  const lf = sideFighters(t).find(m => human.includes(m.ctrl)) || fighterByIdx(localIdx());
  const foes = lf ? foesOf(lf).filter(e => !e.hidden) : [];
  const mates = sideFighters(t).filter(m => !m.hidden && !human.includes(m.ctrl));
  const badge = $id('tcpModeBadge');
  if (badge) {
    badge.textContent = curTac === 'auto'
      ? `${cvT('智策')}→${cvT(cmdTacName(activeSub))} · ${cvT(autoReason)}`
      : `${cvT(M.cmd ? '统帅战术' : '小队协同')} · ${cvT(cmdTacName(curTac))}`;
  }

  const tacBtns = CMD_UI_ORDER.map(id => {
    const d = CMD_TACTICS[id];
    const isSub = curTac === 'auto' && activeSub === id;
    return `<button type="button" class="tcp-btn tcp-tac-btn${curTac === id ? ' sel' : ''}${isSub ? ' is-sub' : ''}" data-tcp-tac="${id}"><span class="tcp-k">${d.key}</span><span class="tcp-tac-txt"><b>${cvT(d.n)}</b><small>${cvT(d.sub)}</small></span></button>`;
  }).join('');
  const formBtns = CMD_FORMATIONS.map(f => `<button type="button" class="tcp-btn${curForm === f.id ? ' sel' : ''}" data-tcp-form="${f.id}" title="${cvT(f.sub)}">${cvT(f.n)}</button>`).join('');
  const focusBtns = `<button type="button" class="tcp-btn${curFocus < 0 ? ' sel' : ''}" data-tcp-focus="-1">${cvT('自动集火')}</button>` + foes.map(e => {
    const dead = e.hp <= 0;
    const pct = Math.max(0, Math.round((e.hp / Math.max(1, e.maxHp)) * 100));
    return `<button type="button" class="tcp-btn${curFocus === e.idx ? ' sel' : ''}${dead ? ' dead' : ''}" data-tcp-focus="${e.idx}"${dead ? ' disabled' : ''}>${escapeHTML(cvT(e.look.name))} <small>${dead ? cvT('阵亡') : pct + '%'}</small></button>`;
  }).join('');
  const allRoleBtns = CMD_ROLES.map((r, ri) => `<button type="button" class="tcp-btn tcp-role-drop" data-tcp-role-all="${ri}" data-tcp-drop-role="${ri}">${cvT(r.n)}</button>`).join('');
  const mateRows = mates.length ? mates.map(m => {
    const curR = (M.cmd && M.cmd.role ? M.cmd.role[m.idx] : (M.teamRoles ? M.teamRoles[m.idx] : 0)) || 0;
    const pct = Math.max(0, Math.round((m.hp / Math.max(1, m.maxHp)) * 100));
    const archTag = CMD_ARCH_LABELS[heroTacticProfile(m).arch] || '游斗';
    return `<div class="tcp-mate-row" data-tcp-drag-mate="${m.idx}" data-tcp-mate-name="${escapeHTML(cvT(m.look.name))}"><div class="tcp-mate-info"><span class="tcp-drag-grip" title="${cvT('拖拽至分工或敌方目标')}">⋮⋮</span><b>${escapeHTML(cvT(m.look.name))}</b><span class="tcp-arch">${cvT(archTag)}</span><span class="tcp-mate-hp">${m.hp <= 0 ? cvT('阵亡') : `${pct}%`}</span></div><div class="tcp-role-grp">${CMD_ROLES.map((r, ri) => `<button type="button" class="tcp-btn${curR === ri ? ' sel' : ''}" data-tcp-mate="${m.idx}" data-tcp-role="${ri}" data-tcp-drop-role="${ri}">${cvT(r.n)}</button>`).join('')}</div></div>`;
  }).join('') : `<div class="tcp-mate-hp">${cvT('当前队伍暂无 AI 队友')}</div>`;

  const autoNote = curTac === 'auto'
    ? `<div class="tcp-auto-bar"><span class="tcp-auto-dot"></span><span>${cvT('智策推演')}：<b>${cvT(cmdTacName(activeSub))}</b> · ${cvT(autoReason)}</span></div>`
    : '';

  body.innerHTML = `
    <section class="tcp-sec full"><div class="tcp-sec-h"><span>${cvT('战队战术')}</span><small>${cvT('锋矢 > 铁壁 > 游袭 > 锋矢')}</small></div>${autoNote}<div class="tcp-tac-grid">${tacBtns}</div></section>
    <section class="tcp-sec full"><div class="tcp-sec-h"><span>${cvT('阵型站位')}</span><small>${cvT('聚散与护卫')}</small></div><div class="tcp-btns">${formBtns}</div></section>
    <section class="tcp-sec full"><div class="tcp-sec-h"><span>${cvT('目标集火')}</span><small>${cvT('点选或拖入队友')}</small></div><div class="tcp-btns">${focusBtns}</div></section>
    <section class="tcp-sec full"><div class="tcp-sec-h"><span>${cvT('队友分工')}</span><div class="tcp-btns">${allRoleBtns}</div></div><div class="tcp-mates">${mateRows}</div></section>
  `;
}
if (typeof document !== 'undefined') {
  const tcpEl = $id('teamCmdPanel');
  let tcpDrag = null;
  const clearTcpDropHover = () => {
    if (!tcpEl) return;
    for (const el of tcpEl.querySelectorAll('.tcp-drop-over')) el.classList.remove('tcp-drop-over');
  };
  const endTcpDrag = () => {
    if (!tcpDrag) return;
    if (tcpDrag.ghost && tcpDrag.ghost.parentNode) tcpDrag.ghost.parentNode.removeChild(tcpDrag.ghost);
    if (tcpDrag.srcEl) tcpDrag.srcEl.classList.remove('tcp-dragging');
    if (tcpEl) tcpEl.classList.remove('is-dragging');
    clearTcpDropHover();
    tcpDrag = null;
  };
  if (tcpEl) {
    tcpEl.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      // 1) Dragging panel header repositions #teamCmdPanel smoothly within viewport
      const head = e.target.closest('.tcp-head');
      if (head && !e.target.closest('button')) {
        const rect = tcpEl.getBoundingClientRect();
        tcpDrag = {
          kind: 'panel', pid: e.pointerId, moved: false,
          sx: e.clientX, sy: e.clientY, left: rect.left, top: rect.top, w: rect.width, h: rect.height,
        };
        if (tcpEl.setPointerCapture) try { tcpEl.setPointerCapture(e.pointerId); } catch (_) {}
        e.stopPropagation();
        return;
      }
      // 2) Dragging an AI teammate row (from 队友分工 or 战况总览) onto a role or enemy focus target
      const mateEl = e.target.closest('[data-tcp-drag-mate]');
      if (mateEl && !e.target.closest('button')) {
        tcpDrag = {
          kind: 'mate', pid: e.pointerId, moved: false,
          sx: e.clientX, sy: e.clientY,
          mateIdx: +mateEl.dataset.tcpDragMate,
          mateName: mateEl.dataset.tcpMateName || '',
          srcEl: mateEl, ghost: null,
        };
        if (tcpEl.setPointerCapture) try { tcpEl.setPointerCapture(e.pointerId); } catch (_) {}
        e.stopPropagation();
      }
    });
    tcpEl.addEventListener('pointermove', e => {
      if (!tcpDrag || e.pointerId !== tcpDrag.pid) return;
      const dx = e.clientX - tcpDrag.sx, dy = e.clientY - tcpDrag.sy;
      if (!tcpDrag.moved && Math.hypot(dx, dy) < 6) return;
      if (!tcpDrag.moved) {
        tcpDrag.moved = true;
        tcpEl.classList.add('is-dragging');
        if (tcpDrag.kind === 'panel') {
          tcpEl.style.transform = 'none';
          tcpEl.style.left = `${tcpDrag.left}px`;
          tcpEl.style.top = `${tcpDrag.top}px`;
        } else if (tcpDrag.kind === 'mate') {
          if (tcpDrag.srcEl) tcpDrag.srcEl.classList.add('tcp-dragging');
          const g = document.createElement('div');
          g.className = 'tcp-drag-ghost';
          g.textContent = tcpDrag.mateName || cvT('队友');
          document.body.appendChild(g);
          tcpDrag.ghost = g;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      if (tcpDrag.kind === 'panel') {
        const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
        const nx = clamp(tcpDrag.left + dx, 8, Math.max(8, vw - tcpDrag.w - 8));
        const ny = clamp(tcpDrag.top + dy, 8, Math.max(8, vh - tcpDrag.h - 8));
        tcpEl.style.left = `${nx}px`;
        tcpEl.style.top = `${ny}px`;
      } else if (tcpDrag.kind === 'mate' && tcpDrag.ghost) {
        tcpDrag.ghost.style.left = `${e.clientX + 12}px`;
        tcpDrag.ghost.style.top = `${e.clientY - 12}px`;
        clearTcpDropHover();
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const dropEl = under && under.closest && under.closest('[data-tcp-drop-role],[data-tcp-drop-focus],[data-tcp-focus]');
        if (dropEl && tcpEl.contains(dropEl)) dropEl.classList.add('tcp-drop-over');
      }
    });
    tcpEl.addEventListener('pointerup', e => {
      if (!tcpDrag || e.pointerId !== tcpDrag.pid) return;
      const d = tcpDrag;
      if (tcpEl.releasePointerCapture) try { tcpEl.releasePointerCapture(e.pointerId); } catch (_) {}
      if (d.moved && d.kind === 'mate') {
        if (d.ghost) d.ghost.style.display = 'none';
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const roleDrop = under && under.closest && under.closest('[data-tcp-drop-role]');
        const focusDrop = under && under.closest && under.closest('[data-tcp-drop-focus],[data-tcp-focus]');
        endTcpDrag();
        if (roleDrop && tcpEl.contains(roleDrop)) {
          teamCmdSetRole(d.mateIdx, +roleDrop.dataset.tcpDropRole);
        } else if (focusDrop && tcpEl.contains(focusDrop)) {
          const foeIdx = +(focusDrop.dataset.tcpDropFocus ?? focusDrop.dataset.tcpFocus);
          if (Number.isInteger(foeIdx)) {
            const mate = FIGHTERS[d.mateIdx];
            if (mate && foeIdx >= 0) { mate.cmdTgt = foeIdx; mate.cmdTgtT = clock + 6; }
            teamCmdSetFocus(foeIdx);
          }
        }
        e.stopPropagation();
        return;
      }
      endTcpDrag();
    });
    tcpEl.addEventListener('pointercancel', endTcpDrag);
    tcpEl.addEventListener('click', e => {
      const tBtn = e.target.closest('[data-tcp-tac]');
      if (tBtn) { teamCmdSetTactic(tBtn.dataset.tcpTac); return; }
      const fBtn = e.target.closest('[data-tcp-form]');
      if (fBtn) { teamCmdSetFormation(fBtn.dataset.tcpForm); return; }
      const fcBtn = e.target.closest('[data-tcp-focus],[data-tcp-drop-focus]');
      if (fcBtn) {
        const idx = +(fcBtn.dataset.tcpFocus ?? fcBtn.dataset.tcpDropFocus);
        if (Number.isInteger(idx)) teamCmdSetFocus(idx);
        return;
      }
      const raBtn = e.target.closest('[data-tcp-role-all]');
      if (raBtn) { teamCmdSetRole(-1, +raBtn.dataset.tcpRoleAll); return; }
      const mrBtn = e.target.closest('[data-tcp-mate]');
      if (mrBtn) { teamCmdSetRole(+mrBtn.dataset.tcpMate, +mrBtn.dataset.tcpRole); return; }
    });
  }
  const tcpClose = $id('tcpCloseBtn');
  if (tcpClose) tcpClose.addEventListener('click', () => teamCmdClose());
}
function cmdTabDown() { toggleTeamCmdPanel(); }
function cmdTabUp() {}

// ----- 每一帧：观察对面、智能自适应推演、电脑统帅决策、刷新目标统计 -----
function cmdTick() {
  const C = M.cmd;
  if (C && M.phase === 'intro') {   // 开战前就能下令：按键在这里处理（fight 阶段由 tryTacticalKeys 处理）
    for (let t = 0; t < C.team.length; t++) {
      const hc = cmdFighter(t);
      if (hc && cmdIsPlayerCtrl(hc.ctrl) && hc.hp > 0) cmdHandleKeys(hc, hc.ctrl);
    }
  }
  if (!C || M.phase !== 'fight') return;
  if (clock - C.obsT >= 0.5) {
    C.obsT = clock;
    cmdObserve();
    C.tgtCount.fill(0);
    for (const f of allFighters()) if (!f.hidden && f.hp > 0 && f.cmdTgt >= 0 && clock < f.cmdTgtT) C.tgtCount[f.cmdTgt]++;
    for (let t = 0; t < C.team.length; t++) {
      const T = C.team[t];
      const c = FIGHTERS[T.cmdr];
      if (!c || c.hp <= 0) continue;
      if (T.tactic === 'auto') {
        cmdAdaptiveEval(t);
      } else if (!cmdIsHumanTeam(t) && (!T.tactic || clock >= T.nextEval)) {
        cmdAiEval(t);
      }
    }
    if (teamCmdOpen() && typeof renderTeamCmdPanel === 'function') renderTeamCmdPanel();
  }
}
// 观察每一队能被对面看到的东西：队伍中心、分散程度、有多少人在打同一个人
function cmdObserve() {
  const C = M.cmd;
  for (let t = 0; t < C.team.length; t++) {
    const alive = sideFighters(t).filter(f => !f.hidden && f.hp > 0);
    const o = C.team[t].obs;
    o.n = alive.length;
    if (!alive.length) { o.cx = 0; o.spread = 0; o.focus = 0; continue; }
    let cx = 0; for (const f of alive) cx += f.x; cx /= alive.length;
    let v = 0; for (const f of alive) v += (f.x - cx) * (f.x - cx);
    const cnt = {}; let best = 0;
    for (const f of alive) { if (f.target && f.target.hp > 0) { const k = f.target.idx; cnt[k] = (cnt[k] || 0) + 1; if (cnt[k] > best) best = cnt[k]; } }
    o.cx = cx; o.spread = Math.sqrt(v / alive.length); o.focus = alive.length > 1 ? best / alive.length : 0;
  }
}
// 统计一支队伍的阵容构成（20侠客画像）
function cmdCompStats(fighters) {
  const s = { vanguard: 0, skirmisher: 0, assassin: 0, controller: 0, zoner: 0, support: 0, avgHp: 0, lowCnt: 0, hurtCnt: 0, avgBurst: 0, avgPeel: 0, avgFlank: 0, n: 0 };
  for (const f of fighters) {
    if (!f || f.hidden || f.hp <= 0) continue;
    const p = heroTacticProfile(f);
    s.n++;
    s[p.arch] = (s[p.arch] || 0) + 1;
    const hpR = f.hp / Math.max(1, f.maxHp);
    s.avgHp += hpR;
    if (hpR < 0.36) s.lowCnt++;
    if (['hitstun', 'launched', 'knockdown', 'held'].includes(f.state) || (clock - (f.cmdHitT || -99) < 0.7)) s.hurtCnt++;
    s.avgBurst += p.burst;
    s.avgPeel += p.peel;
    s.avgFlank += p.flank;
  }
  if (s.n > 0) { s.avgHp /= s.n; s.avgBurst /= s.n; s.avgPeel /= s.n; s.avgFlank /= s.n; }
  return s;
}
// 智能自适应战术推演（auto）：综合我方阵容、敌方阵容与态势、地形、模式（夺旗/四象/团战/2v2）与实时血线/受控状态
function cmdComputeAdaptive(t, mates, foes, rivalObs, cmdr, rivalCmdr) {
  const myS = cmdCompStats(mates);
  const foeS = cmdCompStats(foes);
  const sc = { spear: 0, wall: 0, raid: 0 };
  let reason = '均衡协同';

  // 1. 阵容协同基线（基于20侠客画像）
  sc.spear += (myS.skirmisher + myS.assassin) * 0.45 + myS.avgBurst * 1.4;
  sc.wall += (myS.vanguard + myS.support + myS.controller) * 0.52 + myS.avgPeel * 1.3;
  sc.raid += (myS.assassin + myS.zoner) * 0.48 + myS.avgFlank * 1.35;
  // 针对敌方阵容：敌方远程/辅助多则游袭切后；敌方刺客多则铁壁护阵；敌方重装前排多则锋矢集火破点
  if (foeS.zoner + foeS.support >= 2) { sc.raid += 1.45; }
  if (foeS.assassin >= 2) { sc.wall += 1.35; }
  if (foeS.vanguard >= 2) { sc.spear += 1.25; }

  // 2. 地图与地形机制感知
  const mp = typeof mapNow === 'function' ? mapNow() : null;
  if (mp) {
    if (mp.cliff) sc.raid += 0.9;
    if (mp.thunder || mp.wind) sc.raid += 0.55;
    if (mp.ice) sc.wall += 0.45;
  }
  if (typeof battleMapOn === 'function' && battleMapOn()) sc.raid += 0.35;

  // 3. 模式目标优先（夺旗 / 四象）
  if (typeof ctfOn === 'function' && ctfOn() && M.ctf && M.ctf.flags) {
    const myFlag = M.ctf.flags[t], foeFlag = M.ctf.flags[1 - t];
    if (myFlag && myFlag.carrier >= 0) { sc.spear += 3.2; reason = '截杀夺旗'; }
    else if (foeFlag && foeFlag.carrier >= 0) { sc.wall += 2.8; reason = '护送战旗'; }
  } else if (typeof quadOn === 'function' && quadOn()) {
    if (myS.n <= 2) { sc.wall += 1.6; reason = '四象保帅'; }
    else if (foeS.n >= myS.n + 2) { sc.raid += 1.4; reason = '四象游斗'; }
  }

  // 4. 实时战局态势（人数、血线、统帅安危、集火窗口、队友受控）
  const myCmdrHp = cmdr && cmdr.hp > 0 ? cmdr.hp / Math.max(1, cmdr.maxHp) : 1;
  const foeCmdrHp = rivalCmdr && rivalCmdr.hp > 0 ? rivalCmdr.hp / Math.max(1, rivalCmdr.maxHp) : 1;
  const foeCC = foes.some(e => !e.hidden && e.hp > 0 && (['hitstun', 'launched', 'knockdown', 'held'].includes(e.state) || (e.jailT || 0) > 0 || (e.guard || 100) < 25));
  if (myCmdrHp < 0.42 || (myS.avgHp < 0.46 && myS.n <= foeS.n) || myS.hurtCnt >= Math.max(2, Math.ceil(myS.n * 0.5))) {
    sc.wall += 3.0;
    reason = myCmdrHp < 0.42 ? '护卫统帅' : '稳守反击';
  } else if (foeCmdrHp < 0.42 || myS.n >= foeS.n + 2 || (foeS.lowCnt >= 1 && myS.avgHp > 0.52) || foeCC) {
    sc.spear += 2.6;
    reason = foeCmdrHp < 0.42 ? '斩首敌帅' : foeCC ? '乘势集火' : '集火残血';
  }

  // 5. 敌方实时阵型反制（克制对手姿态）
  if (rivalObs && rivalObs.n >= 2) {
    const n = Math.max(2, rivalObs.n);
    if (rivalObs.n >= 3 && rivalObs.focus >= 0.52) {
      sc.raid += 2.1;
      if (reason === '均衡协同') reason = '游袭破锋';
    } else if (rivalObs.spread > 235 + n * 28) {
      sc.wall += 1.9;
      if (reason === '均衡协同') reason = '铁壁制游';
    } else if (rivalObs.spread < 125 + n * 16) {
      sc.spear += 1.9;
      if (reason === '均衡协同') reason = '锋矢破壁';
    }
  }

  let best = 'spear';
  if (sc.wall > sc[best]) best = 'wall';
  if (sc.raid > sc[best]) best = 'raid';
  if (reason === '均衡协同') {
    reason = best === 'spear' ? '锋矢强攻' : best === 'wall' ? '铁壁护阵' : '包抄后排';
  }
  return { sub: best, reason, scores: sc };
}
function cmdAdaptiveEval(t) {
  const C = M.cmd; if (!C || !C.team[t]) return;
  const T = C.team[t], me = T.obs;
  let rival = -1, rd = Infinity;
  for (let k = 0; k < C.team.length; k++) {
    if (k === t || C.team[k].obs.n === 0) continue;
    const d = Math.abs(C.team[k].obs.cx - me.cx);
    if (d < rd) { rd = d; rival = k; }
  }
  const mates = sideFighters(t).filter(f => !f.hidden && f.hp > 0);
  const foes = rival >= 0 ? sideFighters(rival).filter(f => !f.hidden && f.hp > 0) : [];
  const res = cmdComputeAdaptive(t, mates, foes, rival >= 0 ? C.team[rival].obs : null, cmdFighter(t), rival >= 0 ? cmdFighter(rival) : null);
  // 滞回防抖：刚切换不满 1.8 秒且差距不大时保持当前子战术，避免高频抖动
  const cur = T.autoSub || 'spear';
  if (cur !== res.sub && clock - (T.autoAt || -9) < 1.8 && (res.scores[res.sub] - res.scores[cur]) < 1.2) return;
  if (cur !== res.sub) T.autoAt = clock;
  T.autoSub = res.sub;
  T.autoReason = res.reason;
}
function squadAdaptiveEval(t) {
  const mates = sideFighters(t).filter(f => !f.hidden && f.hp > 0);
  const lf = mates.find(f => human.includes(f.ctrl)) || mates[0];
  const foes = lf ? foesOf(lf).filter(e => !e.hidden && e.hp > 0) : [];
  const res = cmdComputeAdaptive(t, mates, foes, null, lf, foes[0] || null);
  if (!M.squadAuto) M.squadAuto = [{}, {}, {}, {}];
  M.squadAuto[t] = res;
  return res;
}
// 电脑统帅：找最近的、还有人的对手队伍，结合智策评估动态切换战术；难度越高越准
function cmdAiEval(t) {
  const C = M.cmd, T = C.team[t], me = C.team[t].obs;
  const skill = clamp((LEVELS[M.level] || {}).read !== undefined ? (LEVELS[M.level].read * 0.8 + 0.2) : 0.55, 0.2, 0.95);
  let rival = -1, rd = Infinity;
  for (let k = 0; k < C.team.length; k++) {
    if (k === t || C.team[k].obs.n === 0) continue;
    const d = Math.abs(C.team[k].obs.cx - me.cx);
    if (d < rd) { rd = d; rival = k; }
  }
  T.nextEval = clock + cmdRand(8, 14);
  if (rival < 0) { if (!T.tactic) cmdSet(t, CMD_ORDER[(grnd() * 3) | 0], false); return; }
  const mates = sideFighters(t).filter(f => !f.hidden && f.hp > 0);
  const foes = sideFighters(rival).filter(f => !f.hidden && f.hp > 0);
  let next = grnd() < skill
    ? cmdComputeAdaptive(t, mates, foes, C.team[rival].obs, cmdFighter(t), cmdFighter(rival)).sub
    : CMD_ORDER[(grnd() * 3) | 0];
  const winning = T.dealt > T.taken * 1.3;
  if (T.tactic && T.tactic !== 'auto' && winning && grnd() < 0.55) next = T.tactic;
  T.dealt *= 0.4; T.taken *= 0.4;
  cmdSet(t, next, false);
}

// ----- 队友智能分工（基于20侠客画像 + 实时血线 + 队友受击求援 + 战术协同） -----
function cmdRoleOf(f) {
  const C = M.cmd; if (!C) return 'auto';
  if (C.role[f.idx]) return CMD_ROLES[C.role[f.idx]].id;
  const t = fighterTeam(f), tac = cmdTacticOf(t);
  if (!tac) return 'auto';
  const prof = heroTacticProfile(f);
  const hpPct = f.hp / Math.max(1, f.maxHp);
  // 1. 残血保护：低血量前排/刺客自动转为牵制或破连，避免无脑送头
  if (hpPct < prof.retreatHp + 0.08 && prof.arch !== 'vanguard') return 'lure';
  // 2. 紧急护卫：若统帅或高价值辅助正在挨打，擅长破连的队友立即补位破连
  const cmdr = cmdFighter(t);
  const allyInDanger = sideFighters(t).some(m => m !== f && !m.hidden && m.hp > 0 && (clock - (m.cmdHitT || -99) < 0.85) && (m === cmdr || m.hp < m.maxHp * 0.45 || heroTacticProfile(m).arch === 'support'));
  if (allyInDanger && prof.peel >= 0.72) return 'peel';
  // 3. 按当前生效战术与侠客画像自然分工
  if (tac === 'spear') {
    if (prof.burst >= 0.78 || prof.arch === 'skirmisher' || prof.arch === 'assassin') return 'main';
    return prof.peel >= 0.80 ? 'peel' : 'main';
  }
  if (tac === 'wall') {
    if (prof.peel >= 0.68 || prof.arch === 'vanguard' || prof.arch === 'support' || prof.arch === 'controller') return 'peel';
    return 'lure';
  }
  if (tac === 'raid') {
    if (prof.flank >= 0.62 || prof.arch === 'assassin' || prof.arch === 'zoner') return 'lure';
    return prof.peel >= 0.82 ? 'peel' : 'main';
  }
  return prof.prefRole || 'auto';
}
const cmdAlive = (e, list) => e && !e.hidden && e.hp > 0 && list.includes(e);
function cmdFocusOf(t, list, distance) {
  const T = M.cmd.team[t], cmdr = FIGHTERS[T.cmdr];
  // 优先使用玩家在 Tab 指挥面板指定的集火目标
  const explicitIdx = (M.teamFocus && M.teamFocus[t] >= 0) ? M.teamFocus[t] : -1;
  if (explicitIdx >= 0) {
    const ef = FIGHTERS[explicitIdx];
    if (cmdAlive(ef, list)) return ef;
    if (M.teamFocus) M.teamFocus[t] = -1;
  }
  if (cmdr && cmdIsPlayerCtrl(cmdr.ctrl)) {
    const c = cmdr.lockIdx >= 0 ? FIGHTERS[cmdr.lockIdx] : cmdr.target;
    if (cmdAlive(c, list)) return c;
  }
  const cur = T.focus >= 0 ? FIGHTERS[T.focus] : null;
  if (cmdAlive(cur, list) && clock < T.focusT) return cur;
  const base = cmdr && cmdr.hp > 0 ? cmdr : (sideFighters(t).find(m => m.hp > 0) || null);
  if (!base) return null;
  const ctfActive = typeof ctfOn === 'function' && ctfOn() && M.ctf && M.ctf.flags;
  const myFlag = ctfActive ? M.ctf.flags[t] : null;
  let best = null, bs = Infinity;
  for (const e of list) {
    if (e.hp <= 0 || e.hidden) continue;
    const ep = heroTacticProfile(e);
    const stunned = ['hitstun', 'launched', 'knockdown', 'held'].includes(e.state) || (e.jailT || 0) > 0;
    const s = distance(e, base)
      - (1 - e.hp / Math.max(1, e.maxHp)) * 460
      - (cmdIs(e) ? 160 : 0)
      - (stunned ? 170 : 0)
      - ((e.guard || 100) < 28 ? 110 : 0)
      - (ep.arch === 'support' ? 120 : 0)
      - (myFlag && myFlag.carrier === e.idx ? 520 : 0);
    if (s < bs) { bs = s; best = e; }
  }
  if (best) { T.focus = best.idx; T.focusT = clock + cmdRand(2.4, 4.2); }
  return best;
}
// 谁正在打我方队友：优先保护统帅、残血队友与辅助
function cmdPeelTarget(f, list, distance) {
  const t = fighterTeam(f), cmdr = cmdFighter(t);
  let best = null, bs = Infinity;
  for (const m of sideFighters(t)) {
    if (m === f || m.hidden || m.hp <= 0 || clock - m.cmdHitT > 1.35 || m.cmdHitBy < 0) continue;
    const e = FIGHTERS[m.cmdHitBy];
    if (!cmdAlive(e, list)) continue;
    const prio = (m === cmdr ? 260 : 0) + (m.hp < m.maxHp * 0.45 ? 180 : 0) + (heroTacticProfile(m).arch === 'support' ? 140 : 0);
    const s = distance(e, f) - prio;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
// 牵制：缠住敌方后排远程/辅助或主攻目标身边的增援
function cmdLureTarget(f, list, focus, distance) {
  const ref = focus || f;
  const myProf = heroTacticProfile(f);
  let best = null, bs = Infinity;
  for (const e of list) {
    if (e.hp <= 0 || e.hidden || (e === focus && list.length > 1)) continue;
    const ep = heroTacticProfile(e);
    const backlineBonus = (myProf.arch === 'assassin' || myProf.flank >= 0.75) && (ep.arch === 'zoner' || ep.arch === 'support') ? 220 : 0;
    const s = distance(e, ref) * 0.7 + distance(e, f) * 0.55 + (M.cmd ? (M.cmd.tgtCount[e.idx] || 0) * 110 : 0) - backlineBonus;
    if (s < bs) { bs = s; best = e; }
  }
  return best || focus;
}
// 游袭：找离同伴最远的落单者或脆皮后排，避免多人扎堆打同一人
function cmdRaidTarget(f, list, distance) {
  let best = null, bs = Infinity;
  for (const e of list) {
    if (e.hp <= 0 || e.hidden) continue;
    let iso = 700;
    for (const o of sideFighters(fighterTeam(e))) { if (o !== e && o.hp > 0 && !o.hidden) iso = Math.min(iso, Math.abs(o.x - e.x)); }
    const ep = heroTacticProfile(e);
    const squishy = (ep.arch === 'zoner' || ep.arch === 'support') ? 140 : 0;
    const s = distance(e, f) - iso * 0.52 - squishy + (M.cmd.tgtCount[e.idx] || 0) * 190;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
// 铁壁：优先拦截闯进统帅或辅助身边的敌人
function cmdWallTarget(f, list, distance) {
  const cmdr = cmdFighter(fighterTeam(f)), anchor = cmdr && cmdr.hp > 0 ? cmdr : f;
  let best = null, bd = 560;
  for (const e of list) {
    if (e.hp <= 0 || e.hidden) continue;
    const d = distance(e, anchor) - (clock - (anchor.cmdHitT || -99) < 1.2 && anchor.cmdHitBy === e.idx ? 220 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// foeOf 的钩子：返回这个电脑队友这一刻该打谁（null 就走原来的就近目标）。选好的目标留 0.65 秒左右，免得一帧一换
function cmdPickTarget(f, list, distance) {
  const C = M.cmd, t = fighterTeam(f);
  if (!C || !C.team[t] || cmdIsPlayerCtrl(f.ctrl) || !list.length) return null;
  const tac = cmdTacticOf(t), role = cmdRoleOf(f);
  if (!tac && role === 'auto') return null;
  if (f.cmdTgt >= 0 && clock < f.cmdTgtT) { const c = FIGHTERS[f.cmdTgt]; if (cmdAlive(c, list)) return c; }
  const focus = cmdFocusOf(t, list, distance);
  let pick = null;
  if (role === 'main') pick = focus;
  else if (role === 'peel') pick = cmdPeelTarget(f, list, distance) || (tac === 'wall' ? cmdWallTarget(f, list, distance) : null) || focus;
  else if (role === 'lure') pick = cmdLureTarget(f, list, focus, distance);
  else if (tac === 'spear') pick = focus;
  else if (tac === 'raid') pick = cmdRaidTarget(f, list, distance);
  else if (tac === 'wall') pick = cmdPeelTarget(f, list, distance) || cmdWallTarget(f, list, distance);
  if (!pick) return null;
  f.cmdTgt = pick.idx; f.cmdTgtT = clock + 0.55 + (f.idx % 5) * 0.07;
  return pick;
}

// 统一计算团队战术对 AI 决策的深度修正（攻势、间距、格挡、技能/奥义同步、低血撤退、包抄与破连）
function buildTacticAiMod(me, foe, d, tac, role, fm, anchor, allies) {
  const prof = heroTacticProfile(me);
  const stanceMul = me.stance ? prof.stanceAggr : 1;
  const hpPct = me.hp / Math.max(1, me.maxHp);
  const foeStunned = foe && (['hitstun', 'launched', 'knockdown', 'held'].includes(foe.state) || (foe.jailT || 0) > 0 || (foe.guard || 100) < 25);
  const m = {
    aggr: stanceMul,
    range: prof.rangeBand,
    block: 0,
    dir: 0,
    skillMul: 1,
    ultMul: 1,
    retreat: false,
    comboSync: false,
    flankBias: prof.flank,
    peelUrgent: false,
  };

  // 1. 三大战术姿态深度差异
  if (tac === 'spear') {
    m.aggr *= 1.36;
    m.range *= 0.84;
    m.skillMul *= 1.28;
    m.ultMul *= 1.32;
    m.comboSync = true;
    if (foeStunned) { m.skillMul *= 1.35; m.ultMul *= 1.45; }
  } else if (tac === 'wall') {
    m.aggr *= 0.74;
    m.range *= 1.06;
    m.block += 0.36;
    m.skillMul *= 0.94;
    m.ultMul *= 1.12;
    m.peelUrgent = true;
    if (foe && (foe.state === 'attack' || foe.state === 'skill')) m.skillMul *= 1.22;
  } else if (tac === 'raid') {
    m.aggr *= 1.16;
    m.range *= 1.18;
    m.skillMul *= 1.24;
    m.ultMul *= 1.08;
    m.flankBias *= 1.45;
  }

  // 2. 队友职责细化修正
  if (role === 'main') {
    m.aggr *= 1.14;
    m.skillMul *= 1.14;
    m.comboSync = true;
  } else if (role === 'lure') {
    m.aggr *= 0.88;
    m.range *= 1.14;
    m.block += 0.14;
    m.flankBias *= 1.25;
  } else if (role === 'peel') {
    m.aggr *= 1.18;
    m.block += 0.12;
    m.peelUrgent = true;
    if (foe && allies.some(a => a !== me && !a.hidden && a.hp > 0 && clock - (a.cmdHitT || -99) < 0.85 && a.cmdHitBy === foe.idx)) {
      m.skillMul *= 1.35;
      m.aggr *= 1.2;
    }
  }

  // 3. 低血量智能撤退与脱战重整（按战术与侠客血线阈值动态决定）
  const retreatTh = prof.retreatHp * (tac === 'wall' ? 1.28 : tac === 'raid' ? 1.15 : 0.65);
  const foesNear = typeof foesOf === 'function' ? foesOf(me).filter(e => !e.hidden && e.hp > 0 && Math.abs(e.y - me.y) < 120 && Math.abs(e.x - me.x) < 320).length : 1;
  const alliesNear = allies.filter(a => a !== me && !a.hidden && a.hp > 0 && Math.abs(a.y - me.y) < 120 && Math.abs(a.x - me.x) < 340).length;
  if (hpPct < retreatTh && (foesNear > alliesNear || (prof.arch === 'zoner' || prof.arch === 'support')) && d < 280) {
    m.retreat = true;
    m.aggr *= 0.55;
    m.block += 0.24;
    const safeAlly = allies.find(a => a !== me && !a.hidden && a.hp > a.maxHp * 0.45 && Math.abs(a.x - me.x) > 120);
    m.dir = safeAlly ? Math.sign(safeAlly.x - me.x) : -Math.sign((foe ? foe.x : me.x) - me.x);
    return m;
  }

  // 4. 阵型与站位牵引
  if (fm === 'escort' && anchor && anchor !== me && anchor.hp > 0 && Math.abs(me.x - anchor.x) > 210 && d > 210) {
    m.dir = Math.sign(anchor.x - me.x);
  } else if (fm === 'group') {
    const alive = allies.filter(x => !x.hidden && x.hp > 0);
    if (alive.length > 1) {
      const cx = alive.reduce((s, x) => s + x.x, 0) / alive.length;
      if (Math.abs(me.x - cx) > 200 && d > 210) m.dir = Math.sign(cx - me.x);
    }
  } else if (fm === 'spread' || tac === 'raid') {
    const nearMate = allies.find(x => x !== me && !x.hidden && x.hp > 0 && Math.abs(x.y - me.y) < 110 && Math.abs(x.x - me.x) < 155);
    if (nearMate && d > 180) m.dir = Math.sign(me.x - nearMate.x) || (me.idx % 2 ? 1 : -1);
  } else if (tac === 'wall' && anchor && anchor !== me && anchor.hp > 0 && d > 310 && Math.abs(me.x - anchor.x) > 260) {
    m.dir = Math.sign(anchor.x - me.x);
  } else if (tac === 'spear' && d > 250 && prof.arch !== 'zoner') {
    m.dir = Math.sign(foe.x - me.x);
  }
  return m;
}
// ai.js 的 neutral() 用：统一处理团战统帅战术（M.cmd）与 2v2 小队战术、阵型集结与角色分工
function cmdAiMod(me, foe, d) {
  const C = M.cmd; if (!C || cmdIsPlayerCtrl(me.ctrl)) return null;
  const t = fighterTeam(me), tac = cmdTacticOf(t), role = cmdRoleOf(me);
  const fm = (M.teamFormation && M.teamFormation[t]) || 'auto';
  if (!tac && role === 'auto' && fm === 'auto') return null;
  return buildTacticAiMod(me, foe, d, tac, role, fm, cmdFighter(t), sideFighters(t));
}
function squadAiMod(me, foe, d) {
  if (M.cmd) return cmdAiMod(me, foe, d);
  if (!isMulti() || human.includes(me.ctrl) || (typeof isRaid === 'function' && isRaid())) return null;
  const t = fighterTeam(me);
  const ord = (M.squadOrders && M.squadOrders[t]) || 'auto';
  const fm = (M.teamFormation && M.teamFormation[t]) || 'auto';
  const roleIdx = (M.teamRoles && M.teamRoles[me.idx]) || 0;
  let role = CMD_ROLES[roleIdx] ? CMD_ROLES[roleIdx].id : 'auto';
  let tac = ({ focus: 'spear', protect: 'wall', spread: 'raid' }[ord]) || null;
  if (ord === 'auto') {
    if (!M.squadAuto || !M.squadAuto[t] || (clock - (M.squadAutoT || -9) >= 0.5)) {
      M.squadAutoT = clock;
      squadAdaptiveEval(t);
    }
    tac = (M.squadAuto && M.squadAuto[t] && M.squadAuto[t].sub) || 'spear';
    if (role === 'auto') role = heroTacticProfile(me).prefRole;
  }
  const allies = sideFighters(t);
  const leader = allies.find(x => !x.hidden && x.hp > 0 && human.includes(x.ctrl)) || allies[0];
  return buildTacticAiMod(me, foe, d, tac, role, fm, leader, allies);
}

// ----- 伤害：相克和战术自带的小加成 -----
function cmdDmgMul(att, def) {
  const C = M.cmd; if (!C || !att || !def) return 1;
  const ta = cmdTacticOf(fighterTeam(att)), td = cmdTacticOf(fighterTeam(def));
  let mul = 1;
  if (ta === 'spear') mul *= 1.05;
  if (td === 'wall') mul *= 0.93;
  if (ta && td && CMD_TACTICS[ta] && CMD_TACTICS[td]) {
    if (CMD_TACTICS[ta].beats === td) mul *= CMD_BEAT_MUL;
    else if (CMD_TACTICS[td].beats === ta) mul *= CMD_BEATEN_MUL;
  }
  return mul;
}
function cmdNoteHit(att, def, dmg) {
  const C = M.cmd; if (!C || !att || !def) return;
  const ta = fighterTeam(att), td = fighterTeam(def);
  if (C.team[ta]) C.team[ta].dealt += dmg;
  if (C.team[td]) C.team[td].taken += dmg;
  def.cmdHitBy = att.idx; def.cmdHitT = clock;
}
const cmdSpeedMul = f => {
  if (!f) return 1;
  if (M.cmd) return cmdTacticOf(fighterTeam(f)) === 'raid' ? 1.06 : 1;
  if (isMulti() && M.squadOrders) {
    const t = fighterTeam(f), o = M.squadOrders[t];
    if (o === 'spread' || (o === 'auto' && M.squadAuto && M.squadAuto[t] && M.squadAuto[t].sub === 'raid')) return 1.05;
  }
  return 1;
};

// ----- 画面 -----
// 头顶的帅旗：每队统帅都看得见（敌帅也是显眼的目标）；自己队的队友另外显示被分到的任务
function cmdDrawCrown(f, hx, hy, px) {
  const C = M.cmd; if (!C || f.hidden || f.hp <= 0) return;
  const t = fighterTeam(f), mine = t === localTeam();
  const isC = cmdIs(f), role = mine && !isC ? C.role[f.idx] : 0, sel = mine && C.sel === f.idx;
  if (!isC && !role && !sel) return;
  const rgb = quadOn() ? teamRgbOf(f) : (mine ? '111,224,255' : '255,100,112');
  ctx.save();
  ctx.translate(hx, hy - 22 * px);
  ctx.scale(px, px);
  if (isC) {
    const bob = Math.sin(clock * 4 + f.idx) * 1.5;
    ctx.translate(0, bob);
    ctx.fillStyle = `rgba(${rgb},0.95)`; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(-10, -6); ctx.lineTo(-5, -1); ctx.lineTo(0, -10); ctx.lineTo(5, -1); ctx.lineTo(10, -6); ctx.lineTo(10, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = `bold 11px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#101018';
    ctx.fillText(cvT('帅'), 0, -1);
  }
  if (role) {
    ctx.translate(0, isC ? -16 : 0);
    ctx.fillStyle = 'rgba(10,14,26,0.88)'; ctx.strokeStyle = 'rgba(255,235,150,0.9)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = `bold 11px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffeb96';
    ctx.fillText(cvT(CMD_ROLES[role].g), 0, 0.5);
  }
  if (sel) {
    ctx.strokeStyle = `rgba(255,235,120,${0.6 + 0.4 * Math.sin(clock * 8)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, -18); ctx.lineTo(0, -10); ctx.lineTo(8, -18); ctx.stroke();
  }
  ctx.restore();
}
// 左下角的紧凑战术指挥条：仅在符合条件的多人团队对抗模式显示（不遮挡战场中心）
function drawCmdPanel() {
  const C = M.cmd; if (!C || !teamCmdEligible()) return;
  const t = localTeam(), T = C.team[t], c = cmdFighter(t);
  if (!T || !c || !human.includes(c.ctrl)) return;
  const cw = 292, ch = 82, px = 14, py = H - 76 - 34 - ch - 8;
  const down = c.hp <= 0;
  const activeSub = cmdTacticOf(t);
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,24,0.82)'; ctx.fillRect(px, py, cw, ch);
  ctx.strokeStyle = 'rgba(233,196,106,0.6)'; ctx.lineWidth = 1.2; ctx.strokeRect(px, py, cw, ch);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = `bold 12px ${TITLE_FONT}`; ctx.fillStyle = '#e9c46a';
  ctx.fillText(`${cvT('统帅战术')}${down ? ' (' + cvT('暂停') + ')' : ''}  [Tab ${cvT('面板')}]`, px + 8, py + 6);
  const bw = (cw - 16 - 15) / 4;
  CMD_UI_ORDER.forEach((id, i) => {
    const d = CMD_TACTICS[id], x = px + 8 + i * (bw + 5), on = T.tactic === id;
    ctx.fillStyle = on ? `rgba(${d.rgb},0.34)` : 'rgba(255,255,255,0.05)'; ctx.fillRect(x, py + 24, bw, 22);
    ctx.strokeStyle = on ? `rgb(${d.rgb})` : 'rgba(255,255,255,0.18)'; ctx.lineWidth = on ? 1.8 : 1; ctx.strokeRect(x, py + 24, bw, 22);
    ctx.font = `bold 12px ${BODY_FONT}`; ctx.fillStyle = on ? '#ffffff' : 'rgba(239,232,216,0.82)'; ctx.textAlign = 'center';
    ctx.fillText(`${d.key} ${cvT(d.n)}`, x + bw / 2, py + 29);
  });
  ctx.textAlign = 'left'; ctx.font = `12px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.88)';
  const statusTxt = T.tactic === 'auto'
    ? `${cvT('智策')}→${cvT(cmdTacName(activeSub))} · ${cvT(T.autoReason || '均衡协同')}`
    : `${cvT('锋矢')}>${cvT('铁壁')}>${cvT('游袭')} · ${T.tactic ? cvT(CMD_TACTICS[T.tactic].sub) : cvT('尚未下令')}`;
  ctx.fillText(statusTxt, px + 8, py + 50);
  const sel = C.sel >= 0 ? FIGHTERS[C.sel] : null;
  const roleId = sel ? C.role[sel.idx] : (C.role.some((r, i) => r && fighterTeam(FIGHTERS[i]) === t) ? -1 : 0);
  ctx.fillStyle = '#ffeb96';
  ctx.fillText(`[Y] ${sel ? cvT(sel.look.name) : cvT('全队')}  [N] ${roleId >= 0 ? cvT(CMD_ROLES[roleId].n) : cvT('各异')}`, px + 8, py + 66);
  ctx.restore();
}
