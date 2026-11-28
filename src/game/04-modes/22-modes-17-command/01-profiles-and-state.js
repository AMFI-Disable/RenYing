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
// 这一局开打用的默认战术：赛前偏好只是本机设置，联机两边可能不一样，回放时看的人也可能改过，
// 所以联机一律「智策」，回放用录像里记下的那一个（录像 meta.tac0，见 recBegin）
function matchDefaultTactic() {
  if (M.mode === 'net') return 'auto';
  if (M.mode === 'replay') { const t = REPLAY.m && REPLAY.m.tac0; return CMD_TACTICS[t] ? t : 'auto'; }
  return getDefaultTeamTactic();
}
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
  if (!isLargeTeam() || M.watchAi || M.mode === 'demo') return;   // 回放也要建统帅：统帅加气血、电脑统帅换战术都在模拟里，少了回放就和实战对不上
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
  const pref = matchDefaultTactic();
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
  // 新一回合还没人选过目标：上一局留下的 f.target 不能算进「集火程度」，不然实战和回放（从录像快照恢复）开局算出的战术不一样
  for (const f of allFighters()) { f.cmdTgt = -1; f.cmdTgtT = 0; f.cmdHitBy = -1; f.cmdHitT = -99; f.target = null; }
  cmdObserve();
  for (let t = 0; t < tc; t++) if (C.team[t].tactic === 'auto') cmdAdaptiveEval(t);
  const lt = localTeam();
  if (cmdIsHumanTeam(lt) && M.mode !== 'replay') say(`你是统帅 · ${CMD_TACTICS[pref].n}（1/2/3/4 或 Tab）`, 2.4, 'go');
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
