function b2dDrawWorld() {
  const cv = document.getElementById('bastionCanvas'); if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const c2 = cv.getContext('2d');
  c2.save();
  c2.scale(dpr, dpr);
  c2.fillStyle = '#070b11';
  c2.fillRect(0, 0, w, h);

  const ox = w / 2 - B2D.camX, oy = h / 2 - B2D.camY;
  c2.translate(ox, oy);

  // 1. 四大 2D 平面地貌分区
  for (const bm of B2D_BIOMES) {
    c2.fillStyle = bm.bg;
    c2.fillRect(bm.x0, bm.y0, bm.x1 - bm.x0, bm.y1 - bm.y0);
    c2.strokeStyle = bm.grid;
    c2.lineWidth = 1;
    const step = 120;
    for (let x = bm.x0; x <= bm.x1; x += step) {
      c2.beginPath(); c2.moveTo(x, bm.y0); c2.lineTo(x, bm.y1); c2.stroke();
    }
    for (let y = bm.y0; y <= bm.y1; y += step) {
      c2.beginPath(); c2.moveTo(bm.x0, y); c2.lineTo(bm.x1, y); c2.stroke();
    }
    c2.font = '700 22px "Noto Serif SC", serif';
    c2.fillStyle = `rgba(${bm.rgb},0.22)`;
    c2.textAlign = 'center';
    c2.fillText(`${bm.name} (T${bm.tier})`, (bm.x0 + bm.x1) / 2, (bm.y0 + bm.y1) / 2 - 220);
  }

  // 四方驰道（连接主城与四方驿站）
  c2.fillStyle = 'rgba(233,196,106,0.06)';
  c2.fillRect(B2D_CITADEL.x - 42, 460, 84, B2D_H - 920);
  c2.fillRect(700, B2D_CITADEL.y - 42, B2D_W - 1400, 84);

  // 2. 天枢主城（城墙、核心、炮台、七座建筑）
  c2.beginPath(); c2.arc(B2D_CITADEL.x, B2D_CITADEL.y, B2D_CITADEL.r, 0, Math.PI * 2);
  c2.fillStyle = '#151925'; c2.fill();
  c2.lineWidth = 8; c2.strokeStyle = 'rgba(233,196,106,0.48)'; c2.stroke();

  const B0 = bastionEnsureState();
  c2.beginPath(); c2.arc(B2D_CITADEL.x, B2D_CITADEL.y, 44, 0, Math.PI * 2);
  c2.fillStyle = 'rgba(95,225,215,0.2)'; c2.fill();
  c2.lineWidth = 3; c2.strokeStyle = '#6fe8dc'; c2.stroke();
  c2.font = '700 13px "Noto Serif SC", sans-serif'; c2.fillStyle = '#e9c46a'; c2.textAlign = 'center';
  c2.fillText(`天枢核心 ${Math.round(B0.gateHp)}/${B0.gateMaxHp}`, B2D_CITADEL.x, B2D_CITADEL.y - 54);

  for (const tr of B2D_TURRETS) {
    c2.fillStyle = '#2b3248'; c2.strokeStyle = '#e9c46a'; c2.lineWidth = 2;
    c2.beginPath(); c2.arc(tr.x, tr.y, 16, 0, Math.PI * 2); c2.fill(); c2.stroke();
  }

  const p = bastionProfile();
  for (const bs of B2D_BUILD_SPOTS) {
    const bDef = BASTION_BUILDINGS.find(b => b.id === bs.id);
    const active = B2D.nearInteract && B2D.nearInteract.x === bs.x && B2D.nearInteract.y === bs.y;
    c2.fillStyle = active ? 'rgba(233,196,106,0.28)' : 'rgba(233,196,106,0.1)';
    c2.strokeStyle = active ? '#ffd97a' : 'rgba(233,196,106,0.45)';
    c2.lineWidth = active ? 2.5 : 1.5;
    c2.beginPath(); c2.arc(bs.x, bs.y, 26, 0, Math.PI * 2); c2.fill(); c2.stroke();
    c2.font = '600 12px "Noto Serif SC", sans-serif'; c2.fillStyle = '#efe8d8';
    c2.fillText(`${bDef ? bDef.name : bs.id} L${p.buildings[bs.id] || 1}`, bs.x, bs.y - 32);
  }

  // 3. 四方驿站
  for (const ws of B2D_WAYSTATIONS) {
    c2.beginPath(); c2.arc(ws.x, ws.y, ws.r, 0, Math.PI * 2);
    c2.fillStyle = 'rgba(110,235,175,0.12)'; c2.fill();
    c2.lineWidth = 2.5; c2.strokeStyle = 'rgba(110,235,175,0.65)'; c2.stroke();
    c2.font = '700 13px "Noto Serif SC", sans-serif'; c2.fillStyle = '#9ef5c8';
    c2.fillText(`⛩ ${ws.name}`, ws.x, ws.y - ws.r - 8);
  }

  // 4. 地面掉落与 SOS 信标
  for (const d of B0.drops) {
    const rgb = d.kind === 'silver' ? '245,215,110' : ((BASTION_MAT_BY[d.id] && BASTION_MAT_BY[d.id].rgb) || '180,220,255');
    c2.fillStyle = `rgb(${rgb})`;
    c2.beginPath(); c2.arc(d.x, d.y, 8, 0, Math.PI * 2); c2.fill();
  }
  for (const sb of B2D.sosBeacons) {
    const pulse = 28 + Math.sin(B2D.clock * 8) * 10;
    c2.strokeStyle = 'rgba(255,165,80,0.85)'; c2.lineWidth = 3;
    c2.beginPath(); c2.arc(sb.x, sb.y, pulse, 0, Math.PI * 2); c2.stroke();
  }

  // 5. 敌人
  for (const e of B2D.enemies) {
    c2.fillStyle = `rgba(${e.rgb},0.88)`;
    c2.beginPath(); c2.arc(e.x, e.y, e.r, 0, Math.PI * 2); c2.fill();
    c2.strokeStyle = '#111'; c2.lineWidth = 2; c2.stroke();
    c2.fillStyle = 'rgba(0,0,0,0.65)'; c2.fillRect(e.x - 22, e.y - e.r - 12, 44, 5);
    c2.fillStyle = `rgb(${e.rgb})`; c2.fillRect(e.x - 22, e.y - e.r - 12, 44 * Math.max(0, e.hp / e.maxHp), 5);
    c2.font = '600 12px "Noto Serif SC", sans-serif'; c2.fillStyle = '#f8d8d0';
    c2.fillText(e.name, e.x, e.y - e.r - 16);
  }

  // 6. 冲刺残影、队友、同房玩家、灵侍与本地玩家（分层俯视角武侠身形）
  for (const g of B2D.ghosts) {
    const a = (g.life / g.max) * 0.45;
    c2.save();
    c2.translate(g.x, g.y); c2.rotate(g.aim || 0);
    c2.fillStyle = `rgba(${g.rgb},${a})`;
    c2.beginPath(); c2.arc(0, 0, g.r * 0.9, 0, Math.PI * 2); c2.fill();
    c2.restore();
  }

  const drawWeapon = (genre, r, accentRgb) => {
    c2.save();
    if (genre === 'ranger') {
      c2.strokeStyle = '#d9b578'; c2.lineWidth = 3;
      c2.beginPath(); c2.arc(r * 0.55, 0, r * 0.95, -0.85, 0.85); c2.stroke();
      c2.strokeStyle = 'rgba(255,255,255,0.65)'; c2.lineWidth = 1.2;
      c2.beginPath(); c2.moveTo(r * 0.55 + Math.cos(-0.85) * r * 0.95, Math.sin(-0.85) * r * 0.95);
      c2.lineTo(r * 0.55 + Math.cos(0.85) * r * 0.95, Math.sin(0.85) * r * 0.95); c2.stroke();
      c2.strokeStyle = '#e7edf5'; c2.lineWidth = 2;
      c2.beginPath(); c2.moveTo(r * 0.45, 0); c2.lineTo(r * 1.9, 0); c2.stroke();
    } else if (genre === 'assassin') {
      for (const sgn of [-1, 1]) {
        c2.fillStyle = '#dce6f2'; c2.strokeStyle = `rgb(${accentRgb})`; c2.lineWidth = 1.2;
        c2.beginPath(); c2.moveTo(r * 0.6, sgn * r * 0.72);
        c2.lineTo(r * 1.75, sgn * r * 0.55); c2.lineTo(r * 0.85, sgn * r * 0.92);
        c2.closePath(); c2.fill(); c2.stroke();
      }
    } else if (genre === 'elemental' || genre === 'medic' || genre === 'summoner') {
      c2.strokeStyle = '#9c784c'; c2.lineWidth = 3;
      c2.beginPath(); c2.moveTo(-r * 0.4, r * 0.62); c2.lineTo(r * 1.65, r * 0.36); c2.stroke();
      c2.fillStyle = `rgb(${accentRgb})`;
      c2.beginPath(); c2.arc(r * 1.72, r * 0.34, 4.5, 0, Math.PI * 2); c2.fill();
    } else if (genre === 'juggernaut' || genre === 'warden' || genre === 'siege') {
      c2.fillStyle = '#536275'; c2.strokeStyle = '#e9c46a'; c2.lineWidth = 2;
      c2.beginPath(); c2.arc(r * 0.85, -r * 0.42, r * 0.72, -1.1, 1.1); c2.stroke();
      c2.strokeStyle = '#d8dee8'; c2.lineWidth = 3;
      c2.beginPath(); c2.moveTo(0, r * 0.72); c2.lineTo(r * 2.0, r * 0.62); c2.stroke();
    } else {
      c2.fillStyle = '#dde5ef'; c2.strokeStyle = '#8b9bb0'; c2.lineWidth = 1.2;
      c2.beginPath(); c2.moveTo(r * 0.65, r * 0.5); c2.lineTo(r * 2.05, r * 0.32);
      c2.lineTo(r * 1.88, r * 0.64); c2.lineTo(r * 0.65, r * 0.66);
      c2.closePath(); c2.fill(); c2.stroke();
      c2.strokeStyle = '#e9c46a'; c2.lineWidth = 2.4;
      c2.beginPath(); c2.moveTo(r * 0.62, r * 0.32); c2.lineTo(r * 0.62, r * 0.8); c2.stroke();
    }
    c2.restore();
  };

  const drawActor = (act, fillRgb, label) => {
    const r = act.r || 15;
    const genre = act.genre || 'berserker';
    const wepDef = BASTION_GENRE_BY[genre];
    const accentRgb = wepDef ? wepDef.rgb : fillRgb;
    const walk = act.walkT || 0;
    const stride = Math.sin(walk) * 5.5;
    const swing = act.atkAnim > 0 ? ((act.atkAnim / 0.22) - 0.5) * 1.9 : 0;
    const spd = Math.hypot(act.vx || 0, act.vy || 0);
    const flutter = Math.sin(B2D.clock * 8 + act.x * 0.02) * (spd > 20 ? 5.5 : 2.2);

    c2.save();
    // 地面投影
    c2.save();
    c2.translate(act.x + 2, act.y + 6);
    c2.scale(1.18, 0.72);
    c2.fillStyle = 'rgba(0,0,0,0.42)';
    c2.beginPath(); c2.arc(0, 0, r * 0.96, 0, Math.PI * 2); c2.fill();
    c2.restore();

    // 无敌 / 护盾 / 倒地外环
    if (act.downed) {
      const pulse = 0.45 + 0.35 * Math.sin(B2D.clock * 7);
      c2.strokeStyle = `rgba(255,95,95,${pulse})`; c2.lineWidth = 3;
      c2.beginPath(); c2.arc(act.x, act.y, r + 10, 0, Math.PI * 2); c2.stroke();
    } else if (act.invul > 0) {
      c2.strokeStyle = 'rgba(130,235,255,0.82)'; c2.lineWidth = 3;
      c2.beginPath(); c2.arc(act.x, act.y, r + 8, 0, Math.PI * 2); c2.stroke();
    }
    if ((act.shield || 0) > 0) {
      c2.fillStyle = 'rgba(115,215,255,0.16)'; c2.strokeStyle = 'rgba(130,230,255,0.72)'; c2.lineWidth = 2;
      c2.beginPath(); c2.arc(act.x, act.y, r + 5, 0, Math.PI * 2); c2.fill(); c2.stroke();
    }

    // 旋转至面朝方向绘制角色身形
    c2.save();
    c2.translate(act.x, act.y);
    c2.rotate(act.aim || 0);
    if (act.downed) c2.scale(0.9, 0.72);

    // 飘动披风/绶带
    c2.fillStyle = `rgba(${fillRgb},0.48)`;
    c2.beginPath();
    c2.moveTo(-r * 0.35, -r * 0.62);
    c2.quadraticCurveTo(-r * 1.45, -r * 0.25 + flutter, -r * 1.65 - Math.min(8, spd * 0.025), flutter);
    c2.quadraticCurveTo(-r * 1.3, r * 0.45 + flutter, -r * 0.35, r * 0.62);
    c2.closePath();
    c2.fill();

    // 行走双足
    c2.fillStyle = '#1d2230';
    for (const [fx, fy] of [[stride, -r * 0.46], [-stride, r * 0.46]]) {
      c2.beginPath(); c2.arc(fx, fy, 4.2, 0, Math.PI * 2); c2.fill();
    }

    // 武器与双掌（随攻击挥砍摆动）
    c2.save();
    c2.rotate(swing);
    drawWeapon(genre, r, accentRgb);
    c2.fillStyle = '#f2cfb0'; c2.strokeStyle = '#2b221a'; c2.lineWidth = 1.2;
    for (const [hx, hy] of [[r * 0.56, r * 0.58], [r * 0.52, -r * 0.54]]) {
      c2.beginPath(); c2.arc(hx, hy, 4, 0, Math.PI * 2); c2.fill(); c2.stroke();
    }
    c2.restore();

    // 宽肩武袍与护肩
    c2.save();
    c2.scale(0.76, 1.16);
    c2.fillStyle = `rgb(${fillRgb})`;
    c2.strokeStyle = 'rgba(255,255,255,0.88)'; c2.lineWidth = 1.8;
    c2.beginPath(); c2.arc(0, 0, r * 0.92, 0, Math.PI * 2); c2.fill(); c2.stroke();
    // 交领前襟
    c2.strokeStyle = 'rgba(22,26,36,0.65)'; c2.lineWidth = 2;
    c2.beginPath(); c2.moveTo(r * 0.15, -r * 0.45); c2.lineTo(r * 0.68, r * 0.25); c2.stroke();
    c2.restore();

    // 头部、束发发髻与护额
    c2.fillStyle = '#202432';
    c2.beginPath(); c2.arc(2, 0, r * 0.56, 0, Math.PI * 2); c2.fill();
    c2.fillStyle = '#f3d2b5';
    c2.beginPath(); c2.arc(5, 0, r * 0.34, -1.1, 1.1); c2.fill();
    c2.fillStyle = '#181b26';
    c2.beginPath(); c2.arc(-3, 0, r * 0.28, 0, Math.PI * 2); c2.fill();
    c2.fillStyle = `rgb(${accentRgb})`;
    c2.beginPath(); c2.arc(-3, 0, r * 0.13, 0, Math.PI * 2); c2.fill();
    c2.restore();

    // 血条与姓名
    c2.fillStyle = 'rgba(0,0,0,0.68)'; c2.fillRect(act.x - 24, act.y - r - 18, 48, 5);
    c2.fillStyle = act.downed ? '#eb5f5f' : '#6fe89f';
    c2.fillRect(act.x - 24, act.y - r - 18, 48 * Math.max(0, act.hp / act.maxHp), 5);
    if ((act.shield || 0) > 0) {
      c2.fillStyle = '#8ad8ff';
      c2.fillRect(act.x - 24, act.y - r - 18, 48 * Math.min(1, act.shield / act.maxHp), 2);
    }
    c2.font = '700 12px "Noto Serif SC", sans-serif'; c2.fillStyle = '#fff'; c2.textAlign = 'center';
    c2.fillText(label, act.x, act.y - r - 23);
    c2.restore();
  };
  drawActor(B2D.ally, B2D.ally.rgb, B2D.ally.name);
  const now = Date.now();
  for (const peer of B2D.peers.values()) {
    if (now - peer.ts < 8000) {
      drawActor({ ...peer, r: 15, invul: 0, walkT: B2D.clock * (Math.hypot(peer.vx || 0, peer.vy || 0) > 20 ? 10 : 0) }, peer.rgb, peer.name);
    }
  }
  drawActor(B2D.player, B2D.player.downed ? '235,95,95' : '233,196,106', (typeof curName === 'function' && curName()) || '你');

  for (const cp of B0.comps || []) {
    const def = BASTION_COMP_BY[cp.id]; if (!def) continue;
    c2.fillStyle = `rgba(${def.rgb},0.35)`; c2.strokeStyle = `rgb(${def.rgb})`; c2.lineWidth = 2;
    c2.beginPath(); c2.arc(cp.x, cp.y, 11, 0, Math.PI * 2); c2.fill(); c2.stroke();
    c2.font = '600 12px "Noto Serif SC", sans-serif'; c2.fillStyle = `rgb(${def.rgb})`; c2.textAlign = 'center';
    c2.fillText(def.name, cp.x, cp.y - 15);
  }

  for (const o of B2D.orbs) {
    const def = BASTION_BOOSTS[o.kind] || { name: '灵珠', rgb: '233,196,106' };
    const bob = Math.sin(B2D.clock * 6 + o.x) * 3;
    c2.fillStyle = `rgba(${def.rgb},0.32)`; c2.strokeStyle = `rgb(${def.rgb})`; c2.lineWidth = 2.5;
    c2.beginPath(); c2.arc(o.x, o.y + bob, 13, 0, Math.PI * 2); c2.fill(); c2.stroke();
    c2.fillStyle = '#fff';
    c2.beginPath(); c2.arc(o.x - 3, o.y + bob - 3, 3.5, 0, Math.PI * 2); c2.fill();
    c2.font = '700 12px "Noto Serif SC", sans-serif'; c2.fillStyle = `rgb(${def.rgb})`; c2.textAlign = 'center';
    c2.fillText(def.name, o.x, o.y + bob - 18);
  }

  // 7. 挥砍弧光、光环、投射物与飘字
  for (const s of B2D.slashes) {
    const a = s.life / s.max;
    c2.strokeStyle = `rgba(${s.rgb},${a})`; c2.lineWidth = 10 * a;
    c2.beginPath(); c2.arc(s.x, s.y, s.r, s.ang - 1.1, s.ang + 1.1); c2.stroke();
  }
  for (const r of B2D.rings) {
    const p2 = 1 - r.life / r.max;
    c2.strokeStyle = `rgba(${r.rgb},${r.life / r.max})`; c2.lineWidth = 3;
    c2.beginPath(); c2.arc(r.x, r.y, r.r + (r.maxR - r.r) * p2, 0, Math.PI * 2); c2.stroke();
  }
  for (const pr of B2D.projs) {
    c2.fillStyle = `rgb(${pr.rgb})`;
    c2.beginPath(); c2.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); c2.fill();
  }
  for (const tx of B2D.texts) {
    c2.font = '700 13px "Noto Serif SC", sans-serif';
    c2.fillStyle = `rgba(${tx.rgb},${tx.life / tx.max})`;
    c2.textAlign = 'center';
    c2.fillText(tx.text, tx.x, tx.y);
  }

  // 附近交互提示
  if (B2D.nearInteract) {
    c2.font = '700 13px "Noto Serif SC", sans-serif';
    c2.fillStyle = '#ffe596';
    c2.textAlign = 'center';
    c2.fillText(B2D.nearInteract.kind === 'waystation' ? `[E] 寄存战利品 (${B2D.nearInteract.name})` : `[E] 进入 ${B2D.nearInteract.name}`, B2D.player.x, B2D.player.y + 38);
  }
  c2.restore();

  // 屏幕左下提示队列
  if (B2D.toasts.length) {
    c2.save();
    c2.scale(dpr, dpr);
    c2.font = '600 13px "Noto Serif SC", sans-serif';
    c2.textAlign = 'left';
    B2D.toasts.forEach((tt, idx) => {
      c2.fillStyle = 'rgba(12,15,24,0.82)';
      c2.fillRect(16, h - 135 - idx * 30, 320, 24);
      c2.fillStyle = '#f5de9a';
      c2.fillText(tt.text, 24, h - 118 - idx * 30);
    });
    c2.restore();
  }

  b2dDrawMinimap();
}

function b2dDrawMinimap() {
  const mm = document.getElementById('bastionMinimap'); if (!mm) return;
  const mc = mm.getContext('2d'), mw = mm.width, mh = mm.height;
  const sx = mw / B2D_W, sy = mh / B2D_H;
  mc.clearRect(0, 0, mw, mh);
  for (const bm of B2D_BIOMES) {
    mc.fillStyle = bm.bg;
    mc.fillRect(bm.x0 * sx, bm.y0 * sy, (bm.x1 - bm.x0) * sx, (bm.y1 - bm.y0) * sy);
  }
  mc.strokeStyle = 'rgba(233,196,106,0.7)'; mc.lineWidth = 1.5;
  mc.beginPath(); mc.arc(B2D_CITADEL.x * sx, B2D_CITADEL.y * sy, B2D_CITADEL.r * sx, 0, Math.PI * 2); mc.stroke();
  mc.fillStyle = '#9ef5c8';
  for (const ws of B2D_WAYSTATIONS) { mc.fillRect(ws.x * sx - 2, ws.y * sy - 2, 4, 4); }
  mc.fillStyle = '#ff6d6d';
  for (const e of B2D.enemies) { mc.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3); }
  mc.fillStyle = '#ffa84a';
  for (const sb of B2D.sosBeacons) { mc.beginPath(); mc.arc(sb.x * sx, sb.y * sy, 5, 0, Math.PI * 2); mc.fill(); }
  mc.fillStyle = '#6fe8dc';
  mc.beginPath(); mc.arc(B2D.ally.x * sx, B2D.ally.y * sy, 4, 0, Math.PI * 2); mc.fill();
  const now = Date.now();
  for (const peer of B2D.peers.values()) {
    if (now - peer.ts < 8000) {
      mc.fillStyle = '#8cc8ff';
      mc.beginPath(); mc.arc(peer.x * sx, peer.y * sy, 4, 0, Math.PI * 2); mc.fill();
    }
  }
  mc.fillStyle = '#ffd97a';
  mc.beginPath(); mc.arc(B2D.player.x * sx, B2D.player.y * sy, 4.5, 0, Math.PI * 2); mc.fill();
}

function b2dRenderTopBar() {
  const bar = document.getElementById('bastionTopBar'); if (!bar) return;
  const B0 = bastionEnsureState(), p = bastionProfile(), bm = b2dBiomeAt(B2D.player.x, B2D.player.y);
  const now = Date.now(), peers = [];
  for (const pr of B2D.peers.values()) if (now - pr.ts < 8000) peers.push(pr);
  const allyHtml = `<button type="button" class="b2d-ally-btn" data-tp="${B2D.ally.id}">TP → ${B2D.ally.name}</button>`
    + peers.map(pr => `<button type="button" class="b2d-ally-btn" data-tp="${pr.id}">TP → ${pr.name}</button>`).join('');
  const cardStacks = Object.values(B0.cards || {}).reduce((a, b) => a + b, 0);
  const activeBoosts = Object.entries(B0.boosts || {}).map(([k, t]) => `${BASTION_BOOSTS[k]?.name || k} ${Math.ceil(t)}s`).join(' · ');
  bar.innerHTML = `<span class="b2d-pill"><b>${B0.space === 'siege' ? '守城战' : bm.name}</b> · 威胁 ${Math.floor(p.threat)}%</span>`
    + `<span class="b2d-pill"><b>Lv.${p.level || 1}</b> (${p.xp || 0}/${bastionXpNeeded(p.level || 1)})${cardStacks ? ` · 秘卷×${cardStacks}` : ''}${activeBoosts ? ` · ${activeBoosts}` : ''}</span>`
    + `<span class="b2d-pill">气血 <b>${Math.round(B2D.player.hp)}/${B2D.player.maxHp}</b>${B2D.player.shield > 0 ? ` (+${Math.round(B2D.player.shield)}盾)` : ''}</span>`
    + `<span class="b2d-pill">功勋 <b>${p.merit}</b> · 随身银 <b>${B0.unbankedSilver}</b> · 寄存 <b>${B0.bankedSilver}</b></span>`
    + allyHtml
    + `<button type="button" class="b2d-ally-btn" id="b2dRoomBtn">房号:${B2D.roomCode} (${1 + peers.length}人)</button>`;
  for (const btn of bar.querySelectorAll('[data-tp]')) btn.onclick = () => bastionTpToAlly(btn.dataset.tp);
  const rb = document.getElementById('b2dRoomBtn');
  if (rb) rb.onclick = () => {
    const nxt = prompt('输入联机房号（相同房号可随时加入并互相传送）：', B2D.roomCode);
    if (nxt && nxt.trim()) { bastionCoopOpen(nxt.trim()); b2dRenderTopBar(); }
  };
}

function b2dLoop(ts) {
  if (!B2D.open) return;
  const dt = Math.min(0.05, Math.max(0.004, (ts - (B2D.lastTs || ts)) / 1000));
  B2D.lastTs = ts;
  bastion2dStep(dt);
  b2dDrawWorld();
  B2D.raf = requestAnimationFrame(b2dLoop);
}

function b2dBindDom() {
  if (B2D.boundDom) return;
  B2D.boundDom = true;
  const cv = document.getElementById('bastionCanvas');
  const mm = document.getElementById('bastionMinimap');
  const back = document.getElementById('bastionBack');
  if (back) back.onclick = closeBastion;
  if (cv) {
    cv.addEventListener('mousemove', e => {
      const r = cv.getBoundingClientRect();
      B2D.mouse.x = e.clientX - r.left; B2D.mouse.y = e.clientY - r.top;
      const wx = B2D.mouse.x - r.width / 2 + B2D.camX;
      const wy = B2D.mouse.y - r.height / 2 + B2D.camY;
      B2D.player.aim = Math.atan2(wy - B2D.player.y, wx - B2D.player.x);
      B2D.mouse.movedAt = B2D.clock;
    });
    cv.addEventListener('mousedown', e => {
      if (e.button === 2) b2dPlayerDash();
      else { B2D.mouse.down = true; b2dPlayerAttack(); }
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }
  if (mm) {
    mm.onclick = ev => {
      const r = mm.getBoundingClientRect();
      const wx = ((ev.clientX - r.left) / r.width) * B2D_W;
      const wy = ((ev.clientY - r.top) / r.height) * B2D_H;
      let nearest = B2D.ally, best = Math.hypot(B2D.ally.x - wx, B2D.ally.y - wy);
      for (const peer of B2D.peers.values()) {
        const d = Math.hypot(peer.x - wx, peer.y - wy);
        if (d < best) { best = d; nearest = peer; }
      }
      if (best < 420 && nearest) bastionTpToAlly(nearest.id);
    };
  }
  window.addEventListener('mouseup', () => { B2D.mouse.down = false; });
  window.addEventListener('keydown', e => {
    if (!B2D.open) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    B2D.keys.add(e.code);
    if (e.repeat) return;
    if (M.bastion && M.bastion.pendingCards && M.bastion.pendingCards.length) {
      if (e.code === 'Digit1') { e.preventDefault(); bastionPickCard(0); return; }
      if (e.code === 'Digit2') { e.preventDefault(); bastionPickCard(1); return; }
      if (e.code === 'Digit3') { e.preventDefault(); bastionPickCard(2); return; }
    }
    if (e.code === 'KeyT') { e.preventDefault(); bastionTpToAlly(); }
    else if (e.code === 'KeyV') { e.preventDefault(); bastionFireSos(); }
    else if (e.code === 'KeyG') { e.preventDefault(); bastionCastCompanionSkill(); }
    else if (e.code === 'KeyB') { e.preventDefault(); bastionToggleArmory(); }
    else if (e.code === 'KeyE' || e.code === 'KeyR') { e.preventDefault(); b2dInteract(); }
    else if (e.code === 'KeyJ' || e.code === 'Space') { e.preventDefault(); b2dPlayerAttack(); }
    else if (e.code === 'KeyK' || e.code === 'ShiftLeft') { e.preventDefault(); b2dPlayerDash(); }
    else if (e.code === 'KeyU') { e.preventDefault(); b2dPlayerSkill(); }
    else if (e.code === 'Escape') {
      e.preventDefault();
      if (M.bastion && M.bastion.armoryOpen) bastionToggleArmory(false);
      else closeBastion();
    }
  });
  window.addEventListener('keyup', e => { B2D.keys.delete(e.code); });
  window.addEventListener('blur', () => { B2D.keys.clear(); B2D.mouse.down = false; });   // 切出窗口时松开所有键，回来不会自己一直走
}

function openBastion() {
  initAudio();
  b2dBindDom();
  const wrap = document.getElementById('bastionGame');
  if (wrap) wrap.classList.remove('hidden');
  B2D.open = true;
  B2D.lastTs = performance.now();
  const B0 = bastionEnsureState();
  bastionSync2dPlayerStats();
  bastionInitCompanions();
  if (!B2D.enemies.length) {
    for (const bm of B2D_BIOMES) b2dSpawnPack((bm.x0 + bm.x1) / 2, (bm.y0 + bm.y1) / 2, bm.tier, true);
  }
  bastionCoopOpen(B2D.roomCode);
  b2dRenderTopBar();
  ensureBastionOverlay();
  bastionSyncHUD();
  bastionMsg('已进入 2D 平面天枢大世界（WASD移动 · 鼠标/J攻击 · K冲刺 · T传音 · V穿云）');
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(B2D.raf);
  B2D.raf = requestAnimationFrame(b2dLoop);
  const cv = document.getElementById('bastionCanvas');
  if (cv && typeof cv.focus === 'function') cv.focus();
}

function closeBastion() {
  B2D.open = false;
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(B2D.raf);
  B2D.keys.clear();
  B2D.mouse.down = false;
  if (B2D.bc) { try { B2D.bc.close(); } catch (e) {} B2D.bc = null; }
  const wrap = document.getElementById('bastionGame');
  if (wrap) wrap.classList.add('hidden');
  if (M.bastion) M.bastion.armoryOpen = false;
  bastionSyncHUD();
}

