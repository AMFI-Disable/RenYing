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
  spear: { n: '锋矢', sub: '集火突击', key: '1', rgb: '255,165,100', hex: '#ffa564', beats: 'wall' },
  wall: { n: '铁壁', sub: '抱团固守', key: '2', rgb: '130,220,255', hex: '#82dcff', beats: 'raid' },
  raid: { n: '游袭', sub: '分散缠斗', key: '3', rgb: '140,240,180', hex: '#8cf0b4', beats: 'spear' },
};
const CMD_ORDER = ['spear', 'wall', 'raid'];
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

const cmdOn = () => !!M.cmd;
const cmdFighter = t => { const T = M.cmd && M.cmd.team[t]; return T ? FIGHTERS[T.cmdr] : null; };
const cmdIs = f => !!(M.cmd && f && M.cmd.team[fighterTeam(f)] && M.cmd.team[fighterTeam(f)].cmdr === f.idx);
const cmdIsHumanTeam = t => { const c = cmdFighter(t); return !!(c && human.includes(c.ctrl)); };
// 这一队现在生效的战术：统帅倒下时是 null（没有克制，队友回到默认打法）
function cmdTacticOf(t) {
  const T = M.cmd && M.cmd.team[t];
  if (!T || !T.tactic) return null;
  const c = FIGHTERS[T.cmdr];
  return c && c.hp > 0 && !c.hidden ? T.tactic : null;
}
const cmdTacName = id => id ? CMD_TACTICS[id].n : '无令';

const cmdRand = (a, b) => a + grnd() * (b - a);

function cmdRoundInit() {
  M.cmd = null;
  if (!isLargeTeam() || M.watchAi || M.mode === 'demo') return;
  const tc = teamCount();
  const C = { team: [], role: new Array(MAX_FIGHTERS).fill(0), sel: -1, tgtCount: new Array(MAX_FIGHTERS).fill(0), obsT: 0, tabAt: 0, hint: 0 };
  for (let t = 0; t < tc; t++) {
    const members = sideFighters(t);
    const humans = members.filter(f => human.includes(f.ctrl));
    const pool = humans.length ? humans : members;   // 有真人就从真人里随机，没有就从电脑里随机
    const cmdr = pool[(grnd() * pool.length) | 0];
    C.team.push({
      cmdr: cmdr ? cmdr.idx : t, tactic: null, since: clock, nextEval: clock + cmdRand(5, 9), focus: -1, focusT: 0,
      obs: { cx: 0, spread: 0, focus: 0, n: 0 }, dealt: 0, taken: 0, log: [],
    });
  }
  M.cmd = C;
  for (let t = 0; t < tc; t++) {
    const cmdr = FIGHTERS[C.team[t].cmdr];
    if (cmdr) cmdApplyHp(cmdr);
    if (!cmdIsHumanTeam(t)) { C.team[t].tactic = CMD_ORDER[(grnd() * 3) | 0]; C.team[t].log.push(C.team[t].tactic); }
  }
  for (const f of allFighters()) { f.cmdTgt = -1; f.cmdTgtT = 0; f.cmdHitBy = -1; f.cmdHitT = -99; }
  const lt = localTeam();
  if (cmdIsHumanTeam(lt)) say('你是统帅 · 1/2/3 或 Tab 下令', 2.4, 'go');
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
  if (!T || T.tactic === tac) return false;
  T.tactic = tac; T.since = clock; T.log.push(tac);
  const c = FIGHTERS[T.cmdr];
  if (byHuman && c && !RESIM) {
    const d = CMD_TACTICS[tac];
    addP({ type: 'text', text: `${cvT('令')} · ${cvT(d.n)}（${cvT(d.sub)}）`, x: c.x, y: c.y - 140, life: 1.1, max: 1.1, rgb: d.rgb });
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
  const i = CMD_ORDER.indexOf(T.tactic);
  cmdSet(t, CMD_ORDER[(i + 1) % 3], true);
}
// 统帅的按键：1/2/3 直接选战术，Y 选队友，N 给他分任务。返回 true 表示这个人在带队（不再走老的「全军集火」指令）
function cmdHandleKeys(f, c) {
  if (!M.cmd || !cmdIs(f) || !human.includes(f.ctrl)) return false;
  const t = fighterTeam(f);
  if (c.consume('orderFocus')) cmdSet(t, 'spear', true);
  else if (c.consume('orderProtect')) cmdSet(t, 'wall', true);
  else if (c.consume('orderSpread')) cmdSet(t, 'raid', true);
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
// Tab：在任何含 AI 队友的团队模式中直接开关交互式「战队指挥面板」（可配置目标集火、战术、阵型与队友分工）
let TEAM_CMD_OPEN = false;
function teamCmdEligible() {
  if (M.mode === 'demo' || M.watchAi || !isMulti()) return false;
  const t = localTeam();
  const mates = sideFighters(t).filter(f => !f.hidden);
  return mates.length > 1 && mates.some(f => human.includes(f.ctrl));
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
  const orderMap = { spear: 'focus', wall: 'protect', raid: 'spread' };
  if (M.cmd) {
    cmdSet(t, tac, true);
  } else {
    if (!Array.isArray(M.squadOrders)) M.squadOrders = ['auto', 'auto', 'auto', 'auto'];
    M.squadOrders[t] = orderMap[tac] || 'auto';
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
function renderTeamCmdPanel() {
  const body = typeof $id === 'function' ? $id('tcpBody') : null;
  if (!body || !teamCmdEligible()) return;
  const t = localTeam();
  const curTac = M.cmd && M.cmd.team[t] ? M.cmd.team[t].tactic : ({ focus: 'spear', protect: 'wall', spread: 'raid' }[M.squadOrders?.[t]] || '');
  const curForm = (M.teamFormation && M.teamFormation[t]) || 'auto';
  const curFocus = (M.teamFocus && M.teamFocus[t] >= 0) ? M.teamFocus[t] : -1;
  const lf = sideFighters(t).find(m => human.includes(m.ctrl)) || fighterByIdx(localIdx());
  const foes = lf ? foesOf(lf).filter(e => !e.hidden) : [];
  const mates = sideFighters(t).filter(m => !m.hidden && !human.includes(m.ctrl));
  const badge = $id('tcpModeBadge');
  if (badge) badge.textContent = M.cmd ? `${cvT('统帅战术')} · ${cvT(cmdTacName(curTac))}` : `${cvT('小队协同')} · ${mates.length} ${cvT('名 AI 队友')}`;

  const tacBtns = CMD_ORDER.map(id => {
    const d = CMD_TACTICS[id];
    return `<button type="button" class="tcp-btn${curTac === id ? ' sel' : ''}" data-tcp-tac="${id}"><b>[${d.key}]</b> ${cvT(d.n)} <small>${cvT(d.sub)}</small></button>`;
  }).join('');
  const formBtns = CMD_FORMATIONS.map(f => `<button type="button" class="tcp-btn${curForm === f.id ? ' sel' : ''}" data-tcp-form="${f.id}" title="${cvT(f.sub)}">${cvT(f.n)}</button>`).join('');
  const focusBtns = `<button type="button" class="tcp-btn${curFocus < 0 ? ' sel' : ''}" data-tcp-focus="-1">${cvT('自动 / 跟随统帅')}</button>` + foes.map(e => {
    const dead = e.hp <= 0;
    const pct = Math.max(0, Math.round((e.hp / Math.max(1, e.maxHp)) * 100));
    return `<button type="button" class="tcp-btn${curFocus === e.idx ? ' sel' : ''}${dead ? ' dead' : ''}" data-tcp-focus="${e.idx}"${dead ? ' disabled' : ''}>${escapeHTML(cvT(e.look.name))} <small>${dead ? cvT('阵亡') : pct + '%'}</small></button>`;
  }).join('');
  const allRoleBtns = CMD_ROLES.map((r, ri) => `<button type="button" class="tcp-btn" data-tcp-role-all="${ri}">${cvT('全队')}${cvT(r.n)}</button>`).join('');
  const mateRows = mates.length ? mates.map(m => {
    const curR = (M.cmd && M.cmd.role ? M.cmd.role[m.idx] : (M.teamRoles ? M.teamRoles[m.idx] : 0)) || 0;
    const pct = Math.max(0, Math.round((m.hp / Math.max(1, m.maxHp)) * 100));
    return `<div class="tcp-mate-row"><div class="tcp-mate-info"><b>${escapeHTML(cvT(m.look.name))}</b><span class="tcp-mate-hp">${m.hp <= 0 ? cvT('阵亡') : `${Math.round(m.hp)}/${m.maxHp} (${pct}%)`}</span></div><div class="tcp-role-grp">${CMD_ROLES.map((r, ri) => `<button type="button" class="tcp-btn${curR === ri ? ' sel' : ''}" data-tcp-mate="${m.idx}" data-tcp-role="${ri}">${cvT(r.n)}</button>`).join('')}</div></div>`;
  }).join('') : `<div class="tcp-mate-hp">${cvT('当前队伍暂无 AI 队友')}</div>`;

  const tc = isLargeTeam() ? teamCount() : 2;
  const ovCols = Array.from({ length: tc }, (_, ti) => {
    const list = sideFighters(ti).filter(f => !f.hidden);
    const title = tc > 2 ? cvT(QUAD_TEAMS[ti].n) + (ti === t ? ' (' + cvT('我方') + ')' : '') : cvT(ti === t ? '我方阵营' : '敌方阵营');
    const col = tc > 2 ? QUAD_TEAMS[ti].hex : (ti === t ? '#6fe0ff' : '#ff7878');
    return `<div class="tcp-team-col"><b style="color:${col}">${title}</b>${list.map(f => `<div class="tcp-ov-row"><span>${f.idx === localIdx() ? '★ ' : ''}${cmdIs(f) ? cvT('帅') + ' ' : ''}${escapeHTML(cvT(f.look.name))}</span><span>${f.hp <= 0 ? cvT('阵亡') : `${Math.round(f.hp)}/${f.maxHp}`}</span></div>`).join('')}</div>`;
  }).join('');

  body.innerHTML = `
    <section class="tcp-sec"><div class="tcp-sec-h"><span>${cvT('战队战术')}</span><small>${cvT('锋矢 > 铁壁 > 游袭 > 锋矢')}</small></div><div class="tcp-btns">${tacBtns}</div></section>
    <section class="tcp-sec"><div class="tcp-sec-h"><span>${cvT('阵型与集结')}</span><small>${cvT('控制 AI 队友站位与聚散')}</small></div><div class="tcp-btns">${formBtns}</div></section>
    <section class="tcp-sec full"><div class="tcp-sec-h"><span>${cvT('目标集火')}</span><small>${cvT('指定全队 AI 优先攻击的目标')}</small></div><div class="tcp-btns">${focusBtns}</div></section>
    <section class="tcp-sec full"><div class="tcp-sec-h"><span>${cvT('队友分工')}</span><div class="tcp-btns">${allRoleBtns}</div></div><div class="tcp-mates">${mateRows}</div></section>
    <section class="tcp-sec full"><div class="tcp-sec-h"><span>${cvT('战况总览')}</span></div><div class="tcp-overview">${ovCols}</div></section>
  `;
}
if (typeof document !== 'undefined') {
  const tcpEl = $id('teamCmdPanel');
  if (tcpEl) tcpEl.addEventListener('click', e => {
    const tBtn = e.target.closest('[data-tcp-tac]');
    if (tBtn) { teamCmdSetTactic(tBtn.dataset.tcpTac); return; }
    const fBtn = e.target.closest('[data-tcp-form]');
    if (fBtn) { teamCmdSetFormation(fBtn.dataset.tcpForm); return; }
    const fcBtn = e.target.closest('[data-tcp-focus]');
    if (fcBtn) { teamCmdSetFocus(+fcBtn.dataset.tcpFocus); return; }
    const raBtn = e.target.closest('[data-tcp-role-all]');
    if (raBtn) { teamCmdSetRole(-1, +raBtn.dataset.tcpRoleAll); return; }
    const mrBtn = e.target.closest('[data-tcp-mate]');
    if (mrBtn) { teamCmdSetRole(+mrBtn.dataset.tcpMate, +mrBtn.dataset.tcpRole); return; }
  });
  const tcpClose = $id('tcpCloseBtn');
  if (tcpClose) tcpClose.addEventListener('click', () => teamCmdClose());
}
function cmdTabDown() { toggleTeamCmdPanel(); }
function cmdTabUp() {}

// ----- 每一帧：观察对面、电脑统帅决策、刷新目标统计 -----
function cmdTick() {
  const C = M.cmd;
  if (C && M.phase === 'intro') {   // 开战前就能下令：按键在这里处理（fight 阶段由 tryTacticalKeys 处理）
    for (let t = 0; t < C.team.length; t++) {
      const hc = cmdFighter(t);
      if (hc && human.includes(hc.ctrl) && hc.hp > 0) cmdHandleKeys(hc, hc.ctrl);
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
      if (cmdIsHumanTeam(t)) continue;
      const c = FIGHTERS[T.cmdr];
      if (!c || c.hp <= 0) continue;
      if (!T.tactic || clock >= T.nextEval) cmdAiEval(t);
    }
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
// 电脑统帅：找最近的、还有人的对手队伍，看它的站位像哪一种战术，选克制它的；难度越高越准
function cmdAiEval(t) {
  const C = M.cmd, T = C.team[t], me = C.team[t].obs;
  const skill = clamp((LEVELS[M.level] || {}).read !== undefined ? (LEVELS[M.level].read * 0.8 + 0.2) : 0.55, 0.2, 0.95);
  let rival = -1, rd = Infinity;
  for (let k = 0; k < C.team.length; k++) {
    if (k === t || C.team[k].obs.n === 0) continue;
    const d = Math.abs(C.team[k].obs.cx - me.cx);
    if (d < rd) { rd = d; rival = k; }
  }
  T.nextEval = clock + cmdRand(11, 18);
  if (rival < 0) { if (!T.tactic) cmdSet(t, CMD_ORDER[(grnd() * 3) | 0], false); return; }
  const o = C.team[rival].obs, n = Math.max(2, o.n);
  let guess = null;
  if (o.n >= 3 && o.focus >= 0.5) guess = 'spear';
  else if (o.spread > 230 + n * 28) guess = 'raid';
  else if (o.spread < 120 + n * 16) guess = 'wall';
  if (!guess || grnd() > skill) guess = CMD_ORDER[(grnd() * 3) | 0];
  let next = CMD_BEATEN_BY[guess];   // 克制 guess 的战术：guess 被谁克，就选谁
  // 这边正占上风就不换（打得好别折腾）
  const winning = T.dealt > T.taken * 1.3;
  if (T.tactic && winning && grnd() < 0.6) next = T.tactic;
  T.dealt *= 0.4; T.taken *= 0.4;
  cmdSet(t, next, false);
}

// ----- 队友怎么选目标 -----
function cmdRoleOf(f) {
  const C = M.cmd; if (!C) return 'auto';
  if (C.role[f.idx]) return CMD_ROLES[C.role[f.idx]].id;
  const t = fighterTeam(f), tac = cmdTacticOf(t);
  if (!tac) return 'auto';
  const r = ((f.idx * 37 + 11) % 100) / 100;   // 每个人固定的伪随机数：同一战术下谁主攻谁牵制不会乱跳
  if (tac === 'spear') return r < 0.7 ? 'main' : 'peel';
  if (tac === 'raid') return r < 0.35 ? 'lure' : 'auto';
  return r < 0.4 ? 'peel' : 'auto';
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
  if (cmdr && human.includes(cmdr.ctrl)) {
    // 真人统帅：锁定（G）的人，没锁就是统帅现在打的人
    const c = cmdr.lockIdx >= 0 ? FIGHTERS[cmdr.lockIdx] : cmdr.target;
    return cmdAlive(c, list) ? c : null;
  }
  const cur = T.focus >= 0 ? FIGHTERS[T.focus] : null;
  if (cmdAlive(cur, list) && clock < T.focusT) return cur;
  const base = cmdr && cmdr.hp > 0 ? cmdr : (sideFighters(t).find(m => m.hp > 0) || null);
  if (!base) return null;
  let best = null, bs = Infinity;
  for (const e of list) {
    if (e.hp <= 0 || e.hidden) continue;
    const s = distance(e, base) - (1 - e.hp / e.maxHp) * 420 - (cmdIs(e) ? 140 : 0);   // 近的、残血的、敌帅优先
    if (s < bs) { bs = s; best = e; }
  }
  if (best) { T.focus = best.idx; T.focusT = clock + cmdRand(3, 5); }
  return best;
}
// 谁正在打我方队友：最近 1.2 秒内打中过队友的敌人
function cmdPeelTarget(f, list, distance) {
  let best = null, bd = Infinity;
  for (const m of sideFighters(fighterTeam(f))) {
    if (m === f || m.hidden || m.hp <= 0 || clock - m.cmdHitT > 1.2 || m.cmdHitBy < 0) continue;
    const e = FIGHTERS[m.cmdHitBy];
    if (!cmdAlive(e, list)) continue;
    const d = distance(e, f);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// 牵制：缠住主攻目标身边的人，别让他们去支援
function cmdLureTarget(f, list, focus, distance) {
  const ref = focus || f;
  let best = null, bs = Infinity;
  for (const e of list) {
    if (e.hp <= 0 || e.hidden || e === focus) continue;
    const s = distance(e, ref) + distance(e, f) * 0.5 + (M.cmd.tgtCount[e.idx] || 0) * 90;
    if (s < bs) { bs = s; best = e; }
  }
  return best || focus;
}
// 游袭：找离同伴最远的落单者，已经有很多人盯的就换人
function cmdRaidTarget(f, list, distance) {
  let best = null, bs = Infinity;
  for (const e of list) {
    if (e.hp <= 0 || e.hidden) continue;
    let iso = 700;
    for (const o of sideFighters(fighterTeam(e))) { if (o !== e && o.hp > 0 && !o.hidden) iso = Math.min(iso, Math.abs(o.x - e.x)); }
    const s = distance(e, f) - iso * 0.45 + (M.cmd.tgtCount[e.idx] || 0) * 170;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
// 铁壁：只打闯进统帅身边的人（没人闯进来就返回 null，走默认的就近目标）
function cmdWallTarget(f, list, distance) {
  const cmdr = cmdFighter(fighterTeam(f)), anchor = cmdr && cmdr.hp > 0 ? cmdr : f;
  let best = null, bd = 520;
  for (const e of list) {
    if (e.hp <= 0 || e.hidden) continue;
    const d = distance(e, anchor);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// foeOf 的钩子：返回这个电脑队友这一刻该打谁（null 就走原来的就近目标）。选好的目标留 0.7 秒左右，免得一帧一换
function cmdPickTarget(f, list, distance) {
  const C = M.cmd, t = fighterTeam(f);
  if (!C || !C.team[t] || human.includes(f.ctrl) || !list.length) return null;
  const tac = cmdTacticOf(t), role = cmdRoleOf(f);
  if (!tac && role === 'auto') return null;
  if (f.cmdTgt >= 0 && clock < f.cmdTgtT) { const c = FIGHTERS[f.cmdTgt]; if (cmdAlive(c, list)) return c; }
  const focus = cmdFocusOf(t, list, distance);
  let pick = null;
  if (role === 'main') pick = focus;
  else if (role === 'peel') pick = cmdPeelTarget(f, list, distance) || focus;
  else if (role === 'lure') pick = cmdLureTarget(f, list, focus, distance);
  else if (tac === 'spear') pick = focus;
  else if (tac === 'raid') pick = cmdRaidTarget(f, list, distance);
  else if (tac === 'wall') pick = cmdWallTarget(f, list, distance);
  if (!pick) return null;
  f.cmdTgt = pick.idx; f.cmdTgtT = clock + 0.6 + (f.idx % 5) * 0.08;
  return pick;
}

// ai.js 的 neutral() 用：统一处理团战统帅战术（M.cmd）与 2v2 / 同袍肉鸽小队战术、阵型集结与角色分工
function cmdAiMod(me, foe, d) {
  const C = M.cmd; if (!C || human.includes(me.ctrl)) return null;
  const t = fighterTeam(me), tac = cmdTacticOf(t), role = cmdRoleOf(me);
  const fm = (M.teamFormation && M.teamFormation[t]) || 'auto';
  if (!tac && role === 'auto' && fm === 'auto') return null;
  const m = { aggr: 1, range: 1, block: 0, dir: 0 };
  if (tac === 'spear') { m.aggr = 1.3; m.range = 0.88; }
  else if (tac === 'raid') { m.aggr = 1.12; m.range = 1.14; }
  else if (tac === 'wall') { m.aggr = 0.78; m.block = 0.3; }
  if (role === 'main') m.aggr *= 1.12;
  else if (role === 'lure') { m.aggr *= 0.82; m.range *= 1.12; m.block += 0.12; }
  else if (role === 'peel') m.aggr *= 1.18;
  const cmdr = cmdFighter(t);
  if (fm === 'escort' && cmdr && cmdr !== me && cmdr.hp > 0 && Math.abs(me.x - cmdr.x) > 220 && d > 220) {
    m.dir = Math.sign(cmdr.x - me.x);
  } else if (fm === 'group') {
    const alive = sideFighters(t).filter(x => !x.hidden && x.hp > 0);
    if (alive.length > 1) {
      const cx = alive.reduce((s, x) => s + x.x, 0) / alive.length;
      if (Math.abs(me.x - cx) > 210 && d > 220) m.dir = Math.sign(cx - me.x);
    }
  } else if (fm === 'spread') {
    const nearMate = sideFighters(t).find(x => x !== me && !x.hidden && x.hp > 0 && Math.abs(x.x - me.x) < 150);
    if (nearMate && d > 190) m.dir = Math.sign(me.x - nearMate.x) || (me.idx % 2 ? 1 : -1);
  } else if (tac === 'wall' && cmdr && cmdr !== me && cmdr.hp > 0 && d > 330 && Math.abs(me.x - cmdr.x) > 300) {
    m.dir = Math.sign(cmdr.x - me.x);
  } else if (tac === 'spear' && d > 260) {
    m.dir = Math.sign(foe.x - me.x);
  }
  return m;
}
function squadAiMod(me, foe, d) {
  if (M.cmd) return cmdAiMod(me, foe, d);
  if (!isMulti() || human.includes(me.ctrl)) return null;
  const t = fighterTeam(me);
  const ord = (M.squadOrders && M.squadOrders[t]) || 'auto';
  const fm = (M.teamFormation && M.teamFormation[t]) || 'auto';
  const roleIdx = (M.teamRoles && M.teamRoles[me.idx]) || 0;
  const role = CMD_ROLES[roleIdx] ? CMD_ROLES[roleIdx].id : 'auto';
  if (ord === 'auto' && fm === 'auto' && role === 'auto') return null;
  const m = { aggr: 1, range: 1, block: 0, dir: 0 };
  if (ord === 'focus') { m.aggr = 1.26; m.range = 0.9; }
  else if (ord === 'protect') { m.aggr = 0.82; m.block = 0.28; }
  else if (ord === 'spread') { m.aggr = 1.1; m.range = 1.14; }
  if (role === 'main') m.aggr *= 1.12;
  else if (role === 'lure') { m.aggr *= 0.84; m.range *= 1.12; m.block += 0.12; }
  else if (role === 'peel') m.aggr *= 1.16;
  const leader = sideFighters(t).find(x => !x.hidden && x.hp > 0 && human.includes(x.ctrl));
  if ((fm === 'escort' || ord === 'protect') && leader && leader !== me && Math.abs(me.x - leader.x) > 240 && d > 240) {
    m.dir = Math.sign(leader.x - me.x);
  } else if (fm === 'group') {
    const alive = sideFighters(t).filter(x => !x.hidden && x.hp > 0);
    if (alive.length > 1) {
      const cx = alive.reduce((s, x) => s + x.x, 0) / alive.length;
      if (Math.abs(me.x - cx) > 210 && d > 220) m.dir = Math.sign(cx - me.x);
    }
  } else if (fm === 'spread' || ord === 'spread') {
    const nearMate = sideFighters(t).find(x => x !== me && !x.hidden && x.hp > 0 && Math.abs(x.x - me.x) < 150);
    if (nearMate && d > 190) m.dir = Math.sign(me.x - nearMate.x) || 1;
  } else if (ord === 'focus' && d > 260) {
    m.dir = Math.sign(foe.x - me.x);
  }
  return m;
}

// ----- 伤害：相克和战术自带的小加成 -----
function cmdDmgMul(att, def) {
  const C = M.cmd; if (!C || !att || !def) return 1;
  const ta = cmdTacticOf(fighterTeam(att)), td = cmdTacticOf(fighterTeam(def));
  let mul = 1;
  if (ta === 'spear') mul *= 1.05;
  if (td === 'wall') mul *= 0.93;
  if (ta && td) { if (CMD_TACTICS[ta].beats === td) mul *= CMD_BEAT_MUL; else if (CMD_TACTICS[td].beats === ta) mul *= CMD_BEATEN_MUL; }
  return mul;
}
function cmdNoteHit(att, def, dmg) {
  const C = M.cmd; if (!C || !att || !def) return;
  const ta = fighterTeam(att), td = fighterTeam(def);
  if (C.team[ta]) C.team[ta].dealt += dmg;
  if (C.team[td]) C.team[td].taken += dmg;
  def.cmdHitBy = att.idx; def.cmdHitT = clock;
}
const cmdSpeedMul = f => (M.cmd && cmdTacticOf(fighterTeam(f)) === 'raid') ? 1.06 : 1;

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
// 左下角的指挥牌：三种战术的按钮、相克提示、选中的队友和任务。不显示对方的战术
function drawCmdPanel() {
  const C = M.cmd; if (!C) return;
  const t = localTeam(), T = C.team[t], c = cmdFighter(t);
  if (!T || !c || !human.includes(c.ctrl)) return;
  const cw = 264, ch = 78, px = 14, py = H - 76 - 34 - ch - 8;
  const down = c.hp <= 0;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,24,0.82)'; ctx.fillRect(px, py, cw, ch);
  ctx.strokeStyle = 'rgba(233,196,106,0.6)'; ctx.lineWidth = 1.2; ctx.strokeRect(px, py, cw, ch);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = `bold 12px ${TITLE_FONT}`; ctx.fillStyle = '#e9c46a';
  ctx.fillText(`${cvT('统帅')} · ${cvT('战术')}${down ? ' (' + cvT('暂停') + ')' : ''}  [Tab ${cvT('指挥面板')}]`, px + 8, py + 6);
  const bw = (cw - 16 - 12) / 3;
  CMD_ORDER.forEach((id, i) => {
    const d = CMD_TACTICS[id], x = px + 8 + i * (bw + 6), on = T.tactic === id;
    ctx.fillStyle = on ? `rgba(${d.rgb},0.34)` : 'rgba(255,255,255,0.05)'; ctx.fillRect(x, py + 24, bw, 22);
    ctx.strokeStyle = on ? `rgb(${d.rgb})` : 'rgba(255,255,255,0.18)'; ctx.lineWidth = on ? 1.8 : 1; ctx.strokeRect(x, py + 24, bw, 22);
    ctx.font = `bold 12px ${BODY_FONT}`; ctx.fillStyle = on ? '#ffffff' : 'rgba(239,232,216,0.8)'; ctx.textAlign = 'center';
    ctx.fillText(`${d.key} ${cvT(d.n)}`, x + bw / 2, py + 29);
  });
  ctx.textAlign = 'left'; ctx.font = `11px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.82)';
  ctx.fillText(`${cvT('锋矢')}>${cvT('铁壁')}>${cvT('游袭')}>${cvT('锋矢')}  ${T.tactic ? cvT(CMD_TACTICS[T.tactic].sub) : cvT('尚未下令')}`, px + 8, py + 50);
  const sel = C.sel >= 0 ? FIGHTERS[C.sel] : null;
  const roleId = sel ? C.role[sel.idx] : (C.role.some((r, i) => r && fighterTeam(FIGHTERS[i]) === t) ? -1 : 0);
  ctx.fillStyle = '#ffeb96';
  ctx.fillText(`[Y] ${cvT('选中')}: ${sel ? cvT(sel.look.name) : cvT('全队')}   [N] ${cvT('任务')}: ${roleId >= 0 ? cvT(CMD_ROLES[roleId].n) : cvT('各异')}`, px + 8, py + 64);
  ctx.restore();
}
