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
// 没有统帅的多人局里「智策」自动战术：只算、不写状态。领队按 cpuTeamwork 认（录像和联机里玩家的 Ctrl 不在 human 里，不能用 human.includes）
function squadAdaptiveCompute(t) {
  const mates = sideFighters(t).filter(f => !f.hidden && f.hp > 0);
  const lf = mates.find(f => !cpuTeamwork(f)) || mates[0];
  const foes = lf ? foesOf(lf).filter(e => !e.hidden && e.hp > 0) : [];
  return cmdComputeAdaptive(t, mates, foes, null, lf, foes[0] || null);
}
function squadAdaptiveEval(t) {
  const res = squadAdaptiveCompute(t);
  if (!M.squadAuto) M.squadAuto = [{}, {}, {}, {}];
  M.squadAuto[t] = res;
  return res;
}
// 每 0.5 秒在 step() 里统一重算一次（M.squadAuto 在回滚快照里）：以前是电脑想招时顺手写，
// 本机私用的 AI（secretThink）、回放、联机重算里想招的次数不一样，写出来的状态就对不上
function squadAutoTick() {
  if (M.cmd || !isMulti() || (typeof isRaid === 'function' && isRaid()) || !M.squadOrders) return;
  if (clock - (M.squadAutoT === undefined ? -9 : M.squadAutoT) < 0.5) return;
  M.squadAutoT = clock;
  for (let t = 0; t < teamCount(); t++) if ((M.squadOrders[t] || 'auto') === 'auto') squadAdaptiveEval(t);
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
  if (!isMulti() || !cpuTeamwork(me) || (typeof isRaid === 'function' && isRaid())) return null;
  const t = fighterTeam(me);
  const ord = (M.squadOrders && M.squadOrders[t]) || 'auto';
  const fm = (M.teamFormation && M.teamFormation[t]) || 'auto';
  const roleIdx = (M.teamRoles && M.teamRoles[me.idx]) || 0;
  let role = CMD_ROLES[roleIdx] ? CMD_ROLES[roleIdx].id : 'auto';
  let tac = ({ focus: 'spear', protect: 'wall', spread: 'raid' }[ord]) || null;
  if (ord === 'auto') {
    const cached = M.squadAuto && M.squadAuto[t] && M.squadAuto[t].sub ? M.squadAuto[t] : squadAdaptiveCompute(t);   // 只读：重算在 squadAutoTick
    tac = cached.sub || 'spear';
    if (role === 'auto') role = heroTacticProfile(me).prefRole;
  }
  const allies = sideFighters(t);
  const leader = allies.find(x => !x.hidden && x.hp > 0 && !cpuTeamwork(x)) || allies[0];
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

