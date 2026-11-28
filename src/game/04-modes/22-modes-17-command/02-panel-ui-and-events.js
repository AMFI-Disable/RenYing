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

