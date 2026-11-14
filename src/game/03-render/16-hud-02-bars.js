// ============ 2v2 天道演武专用 HUD ============
// 四名角色分左右两队两行排布：每行 = 名字 + 血量数值 + 势值，下面依次是血条、架势条、真气条。
// 中线只留给计时器；"👁️ 2v2 天道演武 · 禁选" 挪到屏幕底部，避免与任何顶部信息打架。
function combatLoadoutLabel(f) {
  const stance = f && f.stance && HERO_STANCES[f.ch.id] ? HERO_STANCES[f.ch.id].name : '本式';
  const badge = f && f.badgeId && COMBAT_BADGES[f.badgeId] ? `${COMBAT_BADGES[f.badgeId].n} · ${f.badgeTier === 'purpgold' ? '紫金' : f.badgeTier === 'gold' ? '金' : '银'}` : '';
  return [stance, badge].filter(Boolean).map(cvT).join(' · ');
}
function drawHUD2v2() {
  const bh = Math.max(12, H * 0.02);
  const top = Math.max(22, H * 0.04) + (H < 520 ? 8 : 0);
  const cx = W / 2;
  const margin = Math.max(10, Math.round(W * 0.012));
  const gutter = Math.max(84, Math.round(W * 0.1));
  const blk = Math.max(160, Math.floor((W - margin * 2 - gutter) / 2));
  const fsTop = Math.max(13, Math.round(bh * 1.3));
  const fsSub = Math.max(12, Math.round(bh * 0.95));
  const fsNum = Math.max(12, Math.round(bh * 0.82));
  const hpTopH = Math.max(9, Math.round(bh * 0.95));
  const hpSubH = Math.max(8, Math.round(bh * 0.7));
  const gmH = Math.max(4, Math.round(bh * 0.32));
  const txtGap = 8, rowGap = Math.max(7, Math.round(bh * 0.55));
  // 行 1（先锋 A/B）与行 2（次锋 C/D）的纵向节奏
  const r1 = { y: top, fs: fsTop, hpY: top + fsTop + 4, hpH: hpTopH };
  r1.gmY = r1.hpY + r1.hpH + 2;
  const hasLocalHudPlayer = [A, B, C, D].some(hudLocalPlayer);
  const r2 = { y: r1.gmY + gmH + rowGap + (hasLocalHudPlayer ? 15 : 0), fs: fsSub, hpH: hpSubH };
  r2.hpY = r2.y + fsSub + 4; r2.gmY = r2.hpY + r2.hpH + 2;

  // —— 中央计时（正好落在左右两队之间的空档里）
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(bh * 2.3)}px ${BODY_FONT}`;
  ctx.fillStyle = M.timer < 10 ? '#ff8a78' : '#efe8d8';
  if (M.ot) ctx.fillStyle = '#ff6a5a';
  ctx.fillText(Math.ceil(M.timer), cx, top + bh / 2 + 2);
  if (M.ot) { ctx.font = `${Math.max(12, Math.round(bh * 0.8))}px ${TITLE_FONT}`; ctx.fillStyle = '#ff6a5a'; ctx.fillText(cvT('加时'), cx, top - bh * 0.75); }
  ctx.restore();

  // 通用条：黑底 + 残影 + 填充；rev 表示从右端开始填充（右队）
  const bar = (x, y, w, h, ratio, style, rev, lag) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    if (lag > 0) { ctx.fillStyle = 'rgba(255,240,220,0.7)'; ctx.fillRect(rev ? x + w - w * lag : x, y, w * lag, h); }
    if (ratio > 0) { ctx.fillStyle = style; ctx.fillRect(rev ? x + w - w * ratio : x, y, w * ratio, h); }
  };

  const team = (main, sub, si) => {
    const rev = si === 1;
    const x = rev ? W - margin - blk : margin;
    const edge = rev ? x + blk : x;
    const line = (f, y, fsN) => {
      if (!f) return;
      const dead = f.hp <= 0;
      const maxG = f.maxGuard || 100;
      const curG = Math.round(clamp(f.guard !== undefined ? f.guard : maxG, 0, maxG));
      const gLow = curG < maxG * 0.3;
      const hpTxt = `${Math.max(0, Math.round(f.hp))}/${f.maxHp}`;
      const gTxt = `${cvT('势')} ${curG}`;
      let fTag = '';
      if (f.ctrl === human[0]) fTag = ' [1P]';
      else if (f.ctrl === human[1] && (M.subMode === 'pp_cc' || M.subMode === 'pp_pp')) fTag = ' [2P]';
      else if (f === C && M.subMode === 'p_cc') fTag = ' [队友]';
      else if (f.ctrl === human[2]) fTag = ' [3P]';
      else if (f.ctrl === human[3]) fTag = ' [4P]';
      else if (M.mode === 'net') {
        if (netRoomMode === 'pp_cc') {
          fTag = (f === A || f === C) ? (f.ctrl === human[0] ? ' [我]' : ' [队友]') : ' [电脑]';
        } else if (netRoomMode === 'pp_pp') {
          fTag = (f === A || f === C) ? (NET.role === 'host' ? ' [我方]' : ' [敌方]') : (NET.role === 'client' ? ' [我方]' : ' [敌方]');
        }
      }
      const loadout = combatLoadoutLabel(f), dispName = cvT(f.look.name) + (fTag && window.I18N ? fTag.replace(/\[(.+)\]/, (m0, w) => `[${I18N.t(w)}]`) : fTag) + ` · ${loadout}`;   // 显示双方当前架势与徽记
      ctx.font = `bold ${fsN}px ${TITLE_FONT}`; const nameW = ctx.measureText(dispName).width;
      ctx.font = `${fsNum}px ${BODY_FONT}`; const hpW = ctx.measureText(hpTxt).width, gW = ctx.measureText(gTxt).width;
      const total = nameW + hpW + gW + txtGap * 2;
      const nameFont = `bold ${fsN}px ${TITLE_FONT}`, numFont = `${fsNum}px ${BODY_FONT}`;
      const items = rev
        ? [[gTxt, numFont, gLow ? '#ff7a8a' : 'rgba(233,196,106,0.95)', gW], [hpTxt, numFont, dead ? 'rgba(200,140,140,0.8)' : 'rgba(255,255,255,0.92)', hpW], [dispName, nameFont, dead ? 'rgba(200,120,120,0.65)' : `rgb(${f.look.slash})`, nameW]]
        : [[dispName, nameFont, dead ? 'rgba(200,120,120,0.65)' : `rgb(${f.look.slash})`, nameW], [hpTxt, numFont, dead ? 'rgba(200,140,140,0.8)' : 'rgba(255,255,255,0.92)', hpW], [gTxt, numFont, gLow ? '#ff7a8a' : 'rgba(233,196,106,0.95)', gW]];
      let px = rev ? edge - total : x;
      const yMid = y + Math.max(fsN, fsNum) / 2;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const [str, font, col, w] of items) { ctx.font = font; ctx.fillStyle = col; ctx.fillText(str, px, yMid); px += w + txtGap; }
    };
    const rows = [[main, r1], [sub, r2]];
    for (const [f, R] of rows) {
      if (!f) continue;
      line(f, R.y, R.fs);
      const dead = f.hp <= 0;
      const grad = ctx.createLinearGradient(x, 0, x + blk, 0);
      if (!rev) { grad.addColorStop(0, '#2a8fb0'); grad.addColorStop(1, '#8ff0ff'); }
      else { grad.addColorStop(0, '#ff8a70'); grad.addColorStop(1, '#c42a45'); }
      bar(x, R.hpY, blk, R.hpH, clamp(f.hp / f.maxHp, 0, 1), dead ? 'rgba(120,120,130,0.45)' : grad, rev, clamp(f.lagHp / f.maxHp, 0, 1));
      // 架势（外侧）与真气（内侧）并排在同一条窄带上，不占用额外高度
      const gW2 = Math.round(blk * 0.46), mW2 = Math.round(blk * 0.46);
      const gMax = f.maxGuard || 100, gRatio = clamp(clamp(f.guard !== undefined ? f.guard : gMax, 0, gMax) / gMax, 0, 1);
      let gCol = '#e9c46a';
      if (gRatio < 0.3) gCol = Math.sin(clock * 14) > 0 ? '#ff3b52' : '#ff7a8a';
      else if (gRatio < 0.6) gCol = '#f39c12';
      bar(rev ? x + blk - gW2 : x, R.gmY, gW2, gmH, gRatio, gCol, rev, 0);
      const mRatio = clamp(f.meter / 100, 0, 1), full = f.meter >= 100;
      if (full) { ctx.save(); ctx.shadowColor = `rgba(${f.look.slash},0.9)`; ctx.shadowBlur = 8 + 4 * (0.5 + 0.5 * Math.sin(clock * 14)); }
      bar(rev ? x : x + blk - mW2, R.gmY, mW2, gmH, mRatio, full ? '#ffe9a8' : `rgba(${f.look.slash},0.85)`, !rev, 0);
      if (full) ctx.restore();
      if (hudLocalPlayer(f) && !f.dummy) {
        const q = Math.max(0, f.skillCD || 0), r = Math.max(0, f.skill2CD || 0);
        const qText = q < 0.05 ? 'Q ✓' : `Q ${q.toFixed(1)}`, rText = r < 0.05 ? 'R ✓' : `R ${r.toFixed(1)}`;
        ctx.save(); ctx.font = `${Math.max(10, Math.round(fsNum * 0.8))}px ${BODY_FONT}`;
        ctx.textAlign = rev ? 'right' : 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255,255,255,0.68)';
        ctx.fillText(`${qText} · ${rText}`, rev ? x + blk : x, R.gmY + gmH + 5);
        ctx.restore();
      }
    }
  };
  team(A, C, 0);
  team(B, D, 1);

  // —— 底部标签与模式
  ctx.save();
  ctx.font = `bold ${Math.max(12, Math.round(H * 0.018))}px ${TITLE_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#46d3ea';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
  const banTxt = (M.bans && M.bans.length === 2 && CHARS[M.bans[0]] && CHARS[M.bans[1]]) ? ` · 禁选：${CHARS[M.bans[0]].name} / ${CHARS[M.bans[1]].name}` : '';
  let bTitle = `👁️ 2v2 天道演武 (纯观战)${banTxt}`;
  if (!M.watchAi) {
    if (M.subMode === 'p_cc') bTitle = '⚔️ 2v2 携手共斗 (你 + 电脑队友 vs 双AI)';
    else if (M.subMode === 'pp_cc') bTitle = '⚔️ 2v2 双人共斗 (双人破阵 vs 双AI)';
    else if (M.subMode === 'pp_pp') bTitle = '⚔️ 2v2 四方争锋 (双人对决)';
    else if (M.mode === 'net' && netRoomMode === 'pp_cc') bTitle = '🌐 2v2 双人联机共斗 (抗击双天道)';
    else if (M.mode === 'net' && netRoomMode === 'pp_pp') bTitle = '🌐 2v2 四人对决 (全员切磋)';
  }
  if (chaosOn()) bTitle += ' · 天机乱斗';
  if (chaosOn()) drawChaosHUD(cx, H - 48, true);
  ctx.fillText(window.I18N ? I18N.t(bTitle) : bTitle, cx, H - 10);
  ctx.restore();
}
function hudLocalPlayer(f) {
  if (!f) return false;
  if (M.mode === 'net') return !!((ROLL.slots || [])[localIdx()] || []).includes([A, B, C, D].indexOf(f));
  return human.includes(f.ctrl);
}
function drawChaosHUD(cx, y, compact) {
  const mutation = chaosNow();
  const name = mutation ? `${mutation.icon} ${cvT(mutation.name)} · ${chaosLeft()}s` : cvT('🎲 乾坤异变');
  const desc = mutation && mutation.desc ? cvT(mutation.desc).split(' · ')[0] : '';
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(11, Math.round(H * (compact ? 0.015 : 0.018)))}px ${TITLE_FONT}`;
  ctx.fillStyle = '#e9c46a'; ctx.fillText(name, cx, y);
  if (desc) {
    ctx.font = `${Math.max(10, Math.round(H * 0.013))}px ${BODY_FONT}`;
    ctx.fillStyle = 'rgba(239,232,216,0.82)';
    let text = desc;
    while (text.length > 8 && ctx.measureText(text).width > W * 0.88) text = text.slice(0, -2);
    ctx.fillText(text, cx, y + (compact ? 13 : 15));
  }
  ctx.restore();
}
function drawHUDRaid() {
  const u = clamp(W / 1280, 0.72, 1.25);
  const pad = Math.round(24 * u), topY = Math.round((TOUCH ? 50 : 16) * u);
  const totalW = Math.min(Math.round(W - pad * 2), Math.round(1260 * u));
  const centerGap = Math.round(128 * u);
  const teamW = Math.floor((totalW - centerGap) / 2);
  const lx = Math.round(W / 2 - centerGap / 2 - teamW);
  const rx = Math.round(W / 2 + centerGap / 2);
  const allies = sideFighters(0);
  const barH = Math.round((allies.length >= 3 ? 13 : 16) * u);
  const rowGap = Math.round((allies.length >= 3 ? 21 : 28) * u);
  const drawSubRow = (f, x, y, w, left, roleTag) => {
    const dead = f.hp <= 0;
    const ratio = clamp(f.hp / f.maxHp, 0, 1), lag = clamp(f.lagHp / f.maxHp, 0, 1);
    ctx.save();
    if (dead) ctx.globalAlpha = 0.42;
    ctx.fillStyle = 'rgba(10,10,20,0.78)';
    ctx.fillRect(x, y, w, barH);
    const fill = (r, c) => {
      const fw = Math.max(0, (w - 2) * r);
      ctx.fillStyle = c;
      ctx.fillRect(left ? x + 1 : x + w - 1 - fw, y + 1, fw, barH - 2);
    };
    fill(lag, 'rgba(255,110,90,0.45)');
    const g = ctx.createLinearGradient(x, y, x, y + barH);
    g.addColorStop(0, `rgb(${f.look.slash})`);
    g.addColorStop(1, `rgba(${f.look.slash},0.62)`);
    fill(ratio, g);
    ctx.strokeStyle = 'rgba(233,196,106,0.52)';
    ctx.lineWidth = 1.1;
    ctx.strokeRect(x, y, w, barH);
    const gRatio = clamp((f.guard !== undefined ? f.guard : f.maxGuard) / (f.maxGuard || 100), 0, 1);
    const mRatio = clamp(f.meter / 100, 0, 1);
    const gW = Math.floor(w * 0.48), mW = w - gW - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y + barH + 2, gW, 3);
    ctx.fillStyle = gRatio < 0.28 ? '#ff5e5e' : '#7ec8ff';
    ctx.fillRect(left ? x : x + gW * (1 - gRatio), y + barH + 2, gW * gRatio, 3);
    const mx = x + gW + 4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(mx, y + barH + 2, mW, 3);
    ctx.fillStyle = f.meter >= 100 ? '#ffd25a' : '#d49b38';
    ctx.fillRect(left ? mx : mx + mW * (1 - mRatio), y + barH + 2, mW * mRatio, 3);
    ctx.font = `600 ${Math.round(11.5 * u)}px ${BODY_FONT}`;
    ctx.fillStyle = dead ? '#ff7676' : '#f4efe6';
    ctx.textAlign = left ? 'left' : 'right';
    const tx = left ? x + 6 : x + w - 6;
    const statusTxt = dead ? cvT('【重伤倒地】') : `${Math.ceil(f.hp)}/${f.maxHp}`;
    ctx.fillText(`${cvT(roleTag)} · ${cvT(f.look.name)} · ${combatLoadoutLabel(f)}  ${statusTxt}`, tx, y + barH - 3);
    ctx.restore();
  };
  allies.forEach((f, idx) => {
    const tag = idx === 0 ? '同袍·壹(1P)' : idx === 1 ? '同袍·贰(2P)' : '同袍·叁(3P)';
    drawSubRow(f, lx, topY + idx * rowGap, teamW, true, tag);
  });
  const bossH = Math.round(24 * u);
  const bRatio = clamp(B.hp / B.maxHp, 0, 1), bLag = clamp(B.lagHp / B.maxHp, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(18,8,16,0.85)';
  ctx.fillRect(rx, topY, teamW, bossH);
  const fillB = (r, c) => {
    const fw = Math.max(0, (teamW - 2) * r);
    ctx.fillStyle = c;
    ctx.fillRect(rx + teamW - 1 - fw, topY + 1, fw, bossH - 2);
  };
  fillB(bLag, 'rgba(255,180,90,0.45)');
  const bg = ctx.createLinearGradient(rx, topY, rx, topY + bossH);
  bg.addColorStop(0, '#ff4d5a');
  bg.addColorStop(1, '#a81c2e');
  fillB(bRatio, bg);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rx, topY, teamW, bossH);
  ctx.font = `bold ${Math.round(12.5 * u)}px ${BODY_FONT}`;
  ctx.fillStyle = '#fff5e4';
  ctx.textAlign = 'right';
  ctx.fillText(`👹 ${cvT(B.look.name)} ${cvT('(3xHP · 1.25x伤)')}  ${Math.ceil(B.hp)}/${B.maxHp}`, rx + teamW - 8, topY + bossH - 6);
  const sks = B.bossSkills || [B.ch.skill, B.ch.skill2];
  const en = cvT('六技轮转') !== '六技轮转';
  const skNames = sks.map(id => {
    const n = cvT((SKILLS[id] && SKILLS[id].name) || id);
    return (id === B.ch.skill || id === B.ch.skill2) ? (en ? `[${n}]` : `【${n}】`) : n;
  }).join(' · ');
  ctx.font = `600 ${Math.round(11 * u)}px ${BODY_FONT}`;
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`${cvT('六技轮转')}${en ? ': ' : '：'}${skNames}`, rx + teamW - 4, topY + bossH + Math.round(16 * u));
  const perkCount = (M.towerPerks || []).length;
  ctx.fillStyle = '#7fe0b0';
  ctx.textAlign = 'left';
  ctx.fillText(cvT(M.worldKey ? `全服共享秘卷：${perkCount} 卷 · 魔首血量全线共享` : `全队共享秘卷：${perkCount} 卷 · 破魔悬赏 +${600 + ((M.raidWave || 1) - 1) * 200} 墨锭`), lx, topY + allies.length * rowGap + Math.round(6 * u));
  ctx.restore();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = `700 ${Math.round(12 * u)}px ${TITLE_FONT}`;
  ctx.fillText(cvT(`同袍肉鸽 · 第${M.raidWave || 1}劫`), W / 2, topY + Math.round(14 * u));
  ctx.fillStyle = M.timer <= 15 ? '#ff6464' : '#f5ebd6';
  ctx.font = `bold ${Math.round(24 * u)}px ${TITLE_FONT}`;
  ctx.fillText(Math.ceil(M.timer).toString(), W / 2, topY + Math.round(38 * u));
  ctx.restore();
}
function drawHUD() {
  if (M.mode === 'demo') return;
  if (isRaid()) { drawHUDRaid(); return; }
  if (is2v2()) { drawHUD2v2(); return; }
  const barW = Math.min(W * 0.36, 520), bh = Math.max(12, H * 0.02), top = Math.max(22, H * 0.04), cx = W / 2, gap = 56;
  [A, B].forEach((f, i) => {
    if (f.hidden) return;
    const dir = i === 0 ? -1 : 1;
    const x0 = i === 0 ? cx - gap - barW : cx + gap;
    const sk = bh * 0.6;
    const para = (x, w, y, h) => {
      ctx.beginPath();
      if (i === 0) { ctx.moveTo(x + sk, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - sk, y + h); ctx.lineTo(x, y + h); }
      else { ctx.moveTo(x, y); ctx.lineTo(x + w - sk, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + sk, y + h); }
      ctx.closePath(); ctx.fill();
    };
    if (!cujuOn()) {   // 墨球蹴鞠不比气血：这里画比分（drawCujuScore）
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; para(x0 - 3, barW + 6, top - 3, bh + 6);
      const lagW = barW * clamp(f.lagHp / f.maxHp, 0, 1), hpW = barW * clamp(f.hp / f.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(255,240,220,0.85)';
      para(i === 0 ? x0 : x0 + barW - lagW, lagW, top, bh);
      const g = ctx.createLinearGradient(x0, 0, x0 + barW, 0);
      if (i === 0) { g.addColorStop(0, '#2a8fb0'); g.addColorStop(1, '#8ff0ff'); } else { g.addColorStop(0, '#ff8a70'); g.addColorStop(1, '#c42a45'); }
      ctx.fillStyle = f.hp < f.maxHp * 0.25 && Math.sin(clock * 12) > 0 ? '#ffd0c0' : g;
      para(i === 0 ? x0 : x0 + barW - hpW, hpW, top, bh);

      // 顶部血量数值显示（Top Bar exact numeric HP right next to health bar）
      ctx.save();
      ctx.font = `bold ${Math.max(12, Math.round(bh * 0.95))}px ${BODY_FONT}`;
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 4;
      const curHpStr = Math.max(0, Math.round(f.hp));
      const hpStr = `${curHpStr} / ${f.maxHp}`;
      if (i === 0) {
        ctx.textAlign = 'right';
        ctx.fillStyle = f.hp < f.maxHp * 0.25 ? '#ff7a8a' : 'rgba(255,255,255,0.95)';
        ctx.fillText(hpStr, x0 - 10, top + bh / 2);
      } else {
        ctx.textAlign = 'left';
        ctx.fillStyle = f.hp < f.maxHp * 0.25 ? '#ff7a8a' : 'rgba(255,255,255,0.95)';
        ctx.fillText(hpStr, x0 + barW + 10, top + bh / 2);
      }
      ctx.restore();
    }

    // 格挡架势条（Guard Posture Bar）：紧贴血条下方，显示英雄防御耐力
    const gh = Math.max(4, Math.round(bh * 0.3)), gy = top + bh + 3;
    const maxG = f.maxGuard || 100, curG = clamp(f.guard !== undefined ? f.guard : maxG, 0, maxG);
    const gRatio = curG / maxG;
    const gw = barW * (f.ch.inkShot ? 0.54 : 0.88);
    const gx = i === 0 ? x0 : x0 + barW - gw;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(gx - 1, gy - 1, gw + 2, gh + 2);
    let gCol = '#e9c46a';
    if (gRatio < 0.3) gCol = Math.sin(clock * 14) > 0 ? '#ff3b52' : '#ff7a8a';
    else if (gRatio < 0.6) gCol = '#f39c12';
    ctx.fillStyle = gCol;
    ctx.fillRect(i === 0 ? gx : gx + gw - gw * gRatio, gy, gw * gRatio, gh);
    ctx.font = `${Math.max(12, Math.round(gh * 1.8))}px ${BODY_FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.fillStyle = gRatio < 0.3 ? '#ff7a8a' : 'rgba(239,232,216,0.65)';
    if (gRatio <= 0.02) ctx.fillText('💥 崩防', i === 0 ? gx + gw + 4 : gx - 4, gy + gh / 2);
    else if (gRatio < 0.95 || f.state === 'block' || f.state === 'blockstun') ctx.fillText(`势 ${Math.round(curG)}`, i === 0 ? gx + gw + 4 : gx - 4, gy + gh / 2);

    if (f.ch.inkShot) {   // 墨羽的墨水条：贴在血条下面靠中间的一侧
      const iw = barW * 0.38, ih = Math.max(5, bh * 0.5), iy = top + bh + 3, ix = i === 0 ? x0 + barW - iw : x0;
      const k = clamp(f.ink / INK_MAX, 0, 1), low = f.ink < INK_COST;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ix - 1, iy - 1, iw + 2, ih + 2);
      ctx.fillStyle = low ? `rgba(200,80,70,${0.55 + 0.25 * Math.sin(clock * 8)})` : 'rgba(205,200,225,0.9)';
      ctx.fillRect(i === 0 ? ix + iw - iw * k : ix, iy, iw * k, ih);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let n = 1; n < INK_MAX / INK_COST; n++) ctx.fillRect(ix + iw * n * INK_COST / INK_MAX - 0.5, iy, 1, ih);   // 每一格是一团墨
      ctx.font = `${Math.round(ih * 2.2)}px ${BODY_FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = i === 0 ? 'right' : 'left';
      ctx.fillStyle = 'rgba(239,232,216,0.7)'; ctx.fillText('墨', i === 0 ? ix - 5 : ix + iw + 5, iy + ih / 2);
      // 符条：墨水条下面一排小黄符，和墨水分开算
      const fy = iy + ih * 1.9, fh = Math.max(9, ih * 1.6), gap = 3, fw = (iw - gap * (FU_MAX - 1)) / FU_MAX, fu = f.fu || 0;
      for (let n = 0; n < FU_MAX; n++) {
        const fx = i === 0 ? ix + iw - (n + 1) * (fw + gap) + gap : ix + n * (fw + gap);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(fx - 1, fy - 1, fw + 2, fh + 2);
        ctx.fillStyle = n < fu ? '#efd27a' : 'rgba(239,210,122,0.14)'; ctx.fillRect(fx, fy, fw, fh);
        if (n < fu) { ctx.fillStyle = '#b8321e'; ctx.fillRect(fx + fw / 2 - 1.5, fy + 2, 3, fh - 4); }
      }
      ctx.font = `${Math.round(fh * 1.2)}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.7)'; ctx.fillText('符', i === 0 ? ix - 5 : ix + iw + 5, fy + fh / 2);
    }
    // 名字和回合
    ctx.font = `${Math.round(bh * 2)}px ${TITLE_FONT}`; ctx.textBaseline = 'top';
    ctx.fillStyle = `rgb(${f.look.slash})`;
    ctx.textAlign = i === 0 ? 'left' : 'right';
    const nm = cvT(f.look.name);
    ctx.fillText(nm, i === 0 ? x0 : x0 + barW, top + bh + 8);
    ctx.font = `${Math.max(10, Math.round(bh * 0.78))}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.78)';
    ctx.fillText(combatLoadoutLabel(f), i === 0 ? x0 : x0 + barW, top + bh * 3.15);
    let badgeW = 0;
    if (f.ch.passive === 'magnet') {   // 磁仙：名字旁边一个大的红 ⊕ / 蓝 ⊖，一眼看出现在是哪一极
      const r = bh * 0.85, nw = ctx.measureText(nm).width; badgeW = r * 2 + 8;
      drawMagSym(i === 0 ? x0 + nw + 8 + r : x0 + barW - nw - 8 - r, top + bh + 8 + bh, r, f.pol || 1, 1, false);
    }
    if ((M.mode === 'net' && NET.names) || (M.mode === 'replay' && REPLAY.names)) {
      const pn = M.mode === 'replay' ? REPLAY.names[i] || '' : NET.names[i === 0 ? 'host' : 'client'] || cvT('游客'), cw = ctx.measureText(nm).width + badgeW;
      ctx.font = `${Math.round(bh * 0.95)}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.6)';
      ctx.fillText(pn, i === 0 ? x0 + cw + 10 : x0 + barW - cw - 10, top + bh + 8 + bh * 0.6);
    }
    // 车轮战三人、联机接力三人（或两人）：名字旁边一排圆点，正在打的亮起，被击倒的打叉
    const roster = M.mode === 'tag3' && M.teams && M.teams[i] ? { titles: ['先', '中', '大'], out: M.teamIdx[i] }
      : isDuo() ? { titles: M.duo[i].length >= 3 ? ['先', '中', '大'] : ['首', '接'], out: Math.min(M.duo[i].length, M.wins[1 - i]) } : null;
    if (roster) {
      const slotTitles = roster.titles;
      for (let r = 0; r < slotTitles.length; r++) {
        const px = i === 0 ? cx - gap - 14 - r * 26 : cx + gap + 14 + r * 26, py = top + bh + 18;
        const isDead = r < roster.out;
        const isActive = r === roster.out;
        ctx.save();
        ctx.translate(px, py);
        if (isActive) {
          ctx.fillStyle = '#e9c46a';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = `bold 12px ${BODY_FONT}`;
          ctx.fillStyle = '#0c0b16';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(slotTitles[r], 0, 1);
        } else if (isDead) {
          ctx.fillStyle = 'rgba(255,80,80,0.35)';
          ctx.strokeStyle = 'rgba(255,80,80,0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = `12px ${BODY_FONT}`;
          ctx.fillStyle = '#ff7a8a';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('✕', 0, 0);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = `12px ${BODY_FONT}`;
          ctx.fillStyle = 'rgba(239,232,216,0.6)';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(slotTitles[r], 0, 0);
        }
        ctx.restore();
      }
    } else if (M.mode !== 'world' && !cujuOn()) {
      for (let r = 0; r < 2; r++) {
        const px = i === 0 ? cx - gap - 12 - r * 20 : cx + gap + 12 + r * 20, py = top + bh + 18;
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = M.wins[i] > r ? '#e9c46a' : 'rgba(255,255,255,0.14)'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      }
    }
    // 气槽
    const mw = barW * 0.55, my = top + bh + 44, mx = i === 0 ? x0 : x0 + barW - mw;
    // 角色资源条（玉箫·音律 / 醉翁·醉意）：紧贴在大招气槽下面
    let resH = 0;
    if (f.ch.passive === 'rhythm' || f.ch.passive === 'drunk' || f.ch.passive === 'magnet') {
      resH = 9;
      const ry0 = my + 8, lab = cvT(f.ch.passive === 'rhythm' ? '音律' : f.ch.passive === 'magnet' ? '磁极' : '醉意');
      ctx.save();
      ctx.font = Math.round(bh * 0.7) + 'px ' + BODY_FONT; ctx.textBaseline = 'middle';
      const lw = ctx.measureText(lab).width + 6, bw = mw - lw;
      const bx0 = i === 0 ? mx + lw : mx;
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(lab, i === 0 ? mx : mx + mw, ry0 + 1.5);
      if (f.ch.passive === 'rhythm') {
        const n = f.notes || 0, sw = (bw - 8) / 3;
        for (let k = 0; k < 3; k++) {
          const sx = i === 0 ? bx0 + k * (sw + 4) : bx0 + bw - (k + 1) * sw - k * 4;
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(sx - 1, ry0 - 1, sw + 2, 5);
          if (k < n) { ctx.fillStyle = n >= 3 ? 'rgba(150,240,200,' + (0.8 + 0.2 * Math.sin(clock * 9)) + ')' : 'rgb(150,240,200)'; ctx.fillRect(sx, ry0, sw, 3); }
          else if (k === n) { ctx.fillStyle = 'rgba(150,240,200,0.35)'; ctx.fillRect(sx, ry0, sw * clamp((f.noteT || 0) / 2.5, 0, 1), 3); }
        }
      } else if (f.ch.passive === 'magnet') {   // 磁仙：当前极性（红 ⊕ / 蓝 ⊖），负极后面一条细条是负极普攻离消磁还差几下
        const pol = f.pol || 1, rgb = magRGB(pol), sx = i === 0 ? bx0 : bx0 + bw;
        ctx.fillStyle = `rgb(${rgb})`; ctx.textAlign = i === 0 ? 'left' : 'right';
        const txt = cvT(magName(pol)); ctx.fillText(txt, sx, ry0 + 1.5);
        if (pol < 0) {
          const tw = ctx.measureText(txt).width + 8, cw = Math.max(0, bw - tw), c = clamp((f.mChain || 0) / MAG.chainCap, 0, 1);
          const cx0 = i === 0 ? bx0 + tw : bx0;
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx0 - 1, ry0 - 1, cw + 2, 5);
          ctx.fillStyle = c >= 1 ? 'rgba(200,210,230,0.9)' : `rgb(${rgb})`; ctx.fillRect(i === 0 ? cx0 : cx0 + cw - cw * c, ry0, cw * c, 3);
        }
      } else {
        const d = clamp((f.drunk || 0) / 100, 0, 1), dw = bw * d;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx0 - 1, ry0 - 1, bw + 2, 5);
        ctx.fillStyle = d >= 0.5 ? 'rgba(255,170,70,' + (0.8 + 0.2 * Math.sin(clock * 7)) + ')' : 'rgb(230,160,90)';
        ctx.fillRect(i === 0 ? bx0 : bx0 + bw - dw, ry0, dw, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx0 + bw * 0.5 - 0.5, ry0 - 1, 1, 5);   // 50 醉意刻度
      }
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mx - 2, my - 2, mw + 4, 9);
    const full = f.meter >= 100;
    const fw = mw * clamp(f.meter / 100, 0, 1);
    if (full) {
      // 沸腾真气火焰光效与高亮脉冲
      const pulse = 0.5 + 0.5 * Math.sin(clock * 14);
      const auraG = ctx.createLinearGradient(mx, 0, mx + mw, 0);
      auraG.addColorStop(0, '#e9c46a');
      auraG.addColorStop(0.5, '#fff');
      auraG.addColorStop(1, '#ff6a5a');
      ctx.save();
      ctx.shadowColor = `rgba(${f.look.slash}, 0.95)`;
      ctx.shadowBlur = 10 + 6 * pulse;
      ctx.fillStyle = auraG;
      ctx.fillRect(i === 0 ? mx : mx + mw - fw, my - 1, fw, 6);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(mx - 3, my - 3, mw + 6, 11);
      ctx.restore();
      ctx.font = `bold ${Math.max(12, Math.round(bh * 0.96))}px ${BODY_FONT}`; ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff'; ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.shadowColor = `rgba(${f.look.slash}, 0.9)`; ctx.shadowBlur = 8;
      const ultNm = skinUltName(f) || ULTS[f.ch.ult].name;
      ctx.fillText(`⚡ ${cvT(ultNm)} ${cvT('绝技就绪')}${keyHint(i, 'sp')}`, i === 0 ? mx : mx + mw, my + 11 + resH);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = `rgba(${f.look.slash}, 0.75)`;
      ctx.fillRect(i === 0 ? mx : mx + mw - fw, my, fw, 5);
    }
    // 技能冷却（木人桩不显示）
    if (!f.dummy) {
      ctx.font = `${Math.round(bh * 0.85)}px ${BODY_FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const ry = my + resH + (full ? 9 + bh * 1.3 : 12), fs = bh * 0.85;   // 有角色资源条就往下让一行
      const S = SKILLS[f.ch.skill];
      const S2 = SKILLS[f.ch.skill2];
      const hasBall = f.ch.id === 'qianji' && projs.some(p => p.kind === 'ironball' && p.owner === f.idx && !p.dead);
      const s1Nm = cvT(skinSkillName(f, 1) || (hasBall ? '丸在阵中' : S.name));
      const s2Nm = cvT(skinSkillName(f, 2) || S2.name);
      const items = [[s1Nm + keyHint(i, 'sk'), hasBall ? 1 : f.skillCD, hasBall ? 1 : (S.cd || 1)], [s2Nm + keyHint(i, 'sk2'), f.skill2CD, S2.cd], [cvT('腾空闪') + keyHint(i, 'esc'), f.breakCD, f.ch.escCD || BREAK_CD]];
      if (f.ch.fly) items.push([cvT('飞行'), f.ch.fly - f.flyT, f.ch.fly]);
      const widths = items.map(it => ctx.measureText(it[0]).width + 8 + 46 + 16);
      // 一行放到场地中线还放不下（英文名字长、窄屏）就折到下一行，别和对面那一排撞上
      const room = i === 0 ? cx - gap / 2 - mx : mx + mw - (cx + gap / 2);
      const rows = [[]]; let rowW = 0;
      for (const k of items.keys()) { if (rows[rows.length - 1].length && rowW + widths[k] - 16 > room) { rows.push([]); rowW = 0; } rows[rows.length - 1].push(k); rowW += widths[k]; }
      rows.forEach((row, r) => {
        const total = row.reduce((a, k) => a + widths[k], 0);
        let x = i === 0 ? mx : mx + mw - total;
        const yy = ry + r * fs * 1.35;
        for (const k of row) {
          const [name, cd, max] = items[k], ready = cd <= 0;
          ctx.fillStyle = ready ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)';
          ctx.fillText(name, x, yy);
          const bx = x + ctx.measureText(name).width + 8, by = yy + fs * 0.45;
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, 46, 3);
          ctx.fillStyle = ready ? `rgb(${f.look.slash})` : 'rgba(255,255,255,0.5)';
          ctx.fillRect(bx, by, 46 * (1 - clamp(cd / max, 0, 1)), 3);
          x += widths[k];
        }
      });
    }
    // 连击
    const cu = comboUI[i];
    if (cu.t > 0 && cu.n >= 2) {
      const a = clamp(cu.t / 0.4, 0, 1), pop = 1 + Math.max(0, cu.t - 1.25) * 3;
      const x = i === 0 ? W * 0.06 : W * 0.94, y = H * 0.32;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(pop, pop);
      ctx.textAlign = i === 0 ? 'left' : 'right'; ctx.textBaseline = 'alphabetic';
      ctx.font = `700 ${Math.round(H * 0.058)}px ${BODY_FONT}`; ctx.fillStyle = '#fff';
      ctx.shadowColor = `rgba(${f.look.slash},0.9)`; ctx.shadowBlur = 20;
      ctx.fillText(cu.n, 0, 0); ctx.shadowBlur = 0;
      ctx.font = `${Math.round(H * 0.028)}px ${TITLE_FONT}`; ctx.fillStyle = `rgb(${f.look.slash})`;
      ctx.fillText(cvT('连击'), 0, H * 0.036);
      ctx.font = `${Math.round(H * 0.02)}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(`${Math.round(cu.dmg)} ${cvT('伤害')}`, 0, H * 0.075);
      ctx.restore();
    }
  });
  // 计时
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(bh * 2.3)}px ${BODY_FONT}`;
  ctx.fillStyle = M.timer < 10 ? '#ff8a78' : '#efe8d8';
  if (M.ot && M.mode !== 'train') ctx.fillStyle = '#ff6a5a';
  ctx.fillText(M.mode === 'train' || M.mode === 'world' ? '∞' : (cujuOn() && M.cuju && M.cuju.golden) ? '—' : Math.ceil(M.timer), cx, top + bh / 2 + 2);
  if (M.ot && M.mode !== 'train') { ctx.save(); ctx.font = `${Math.max(12, Math.round(bh * 0.8))}px ${TITLE_FONT}`; ctx.fillStyle = '#ff6a5a'; ctx.fillText(cvT('加时'), cx, top - bh * 0.75); ctx.restore(); }
  if (M.mode === 'tower') {
    ctx.save();
    ctx.font = `bold ${Math.max(12, Math.round(bh * 0.95))}px ${TITLE_FONT}`;
    ctx.fillStyle = '#e9c46a';
    ctx.fillText(cvT(`问剑 · 第 ${M.towerFloor || 1} 层`), cx, top + bh + 18);
    ctx.restore();
  } else if (chaosOn()) {
    drawChaosHUD(cx, H - 42, false);
  } else if (M.mode === 'mayhem') {
    ctx.save();
    ctx.font = `bold ${Math.max(12, Math.round(bh * 0.95))}px ${TITLE_FONT}`;
    ctx.fillStyle = '#ff9f43';
    ctx.fillText('💥 通天神决 · 神魔乱战', cx, top + bh + 18);
    ctx.restore();
  }
  if (M.mode === 'train') drawTrainStats(cx, top, bh);
  if (cujuOn()) drawCujuScore(cx, top, bh, gap);
}
