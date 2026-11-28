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
