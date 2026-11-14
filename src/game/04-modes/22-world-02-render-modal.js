function drawWorld() {
  const vw = W / worldScale(), l = cam.x - vw / 2 - 200, r = cam.x + vw / 2 + 200;
  for (const [i, z] of WORLD_ZONES.entries()) {
    if (z.b < l || z.a > r) continue;
    ctx.fillStyle = `rgba(${z.tint},0.12)`; ctx.fillRect(z.a, 0, z.b - z.a, 120);
    const sx = worldShrineX(i);   // 土地庙：复活点
    ctx.fillStyle = '#2a1e18'; ctx.fillRect(sx - 34, -62, 68, 62);
    ctx.fillStyle = '#5a2a1e'; ctx.beginPath(); ctx.moveTo(sx - 50, -60); ctx.lineTo(sx, -96); ctx.lineTo(sx + 50, -60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,110,0.75)'; ctx.fillRect(sx - 9, -40, 18, 26);
    ctx.font = `16px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(233,196,106,0.85)'; ctx.fillText(cvT('土地庙'), sx, -106);
    if (i > 0) {   // 界碑
      ctx.fillStyle = '#3a3a44'; ctx.fillRect(z.a - 12, -120, 24, 120);
      ctx.save(); ctx.font = `20px ${TITLE_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.9)'; ctx.textAlign = 'center';
      const zn = cvT(z.n);   // 界碑上的字竖着写；英文横着写在碑顶上
      if (zn !== z.n) ctx.fillText(zn, z.a, -130); else [...z.n].forEach((c, k) => ctx.fillText(c, z.a, -94 + k * 24));
      ctx.restore();
    }
  }
  const S = WORLD.shots;
  drawMons([...WORLD.mons.values()].filter(m => m.x > l && m.x < r), S.filter(q => !q.dive && !q.charge));
  for (const q of S) if (q.dive) { ctx.strokeStyle = 'rgba(255,230,90,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.05, q.y - q.vy * 0.05); ctx.stroke(); }
  if (WORLD.boss) drawWorldBoss(WORLD.boss);
}
function drawWorldBoss(b) {
  const x = b.x, f = b.face || -1, bob = Math.sin(b.ph * 2.4) * 4, warn = b.warn > 0 || b.act === 'charge';
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, 3, 90, 12, 0, 0, Math.PI * 2); ctx.fill();
  if (warn) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,60,60,0.22)'; circle([x, -110], 150); ctx.globalCompositeOperation = 'source-over'; }
  ctx.fillStyle = b.flash > 0 ? '#f0e0e0' : '#120a10'; ctx.strokeStyle = 'rgba(255,80,80,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 66, 0); ctx.lineTo(x - 76, -120 + bob); ctx.quadraticCurveTo(x - 40, -200 + bob, x, -206 + bob);
  ctx.quadraticCurveTo(x + 40, -200 + bob, x + 76, -120 + bob); ctx.lineTo(x + 66, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 30, -196 + bob); ctx.lineTo(x - 52, -246 + bob); ctx.lineTo(x - 14, -204 + bob); ctx.moveTo(x + 30, -196 + bob); ctx.lineTo(x + 52, -246 + bob); ctx.lineTo(x + 14, -204 + bob); ctx.fill();
  ctx.fillStyle = warn ? '#ffd0a0' : '#ff3c3c'; circle([x + f * 8 - 14, -168 + bob], 5); circle([x + f * 8 + 14, -168 + bob], 5);
  ctx.strokeStyle = b.flash > 0 ? '#fff' : '#8a6070'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x + f * 60, -120 + bob); ctx.quadraticCurveTo(x + f * 130, -160 - (warn ? 50 : 0), x + f * 150, -60); ctx.stroke();
  ctx.font = `18px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,170,170,0.9)'; ctx.fillText(cvT('妖王'), x, -262 + bob);
  ctx.restore();
}
// 同道：别的侠客，头顶写名字（在自己身后画）
function drawWorldGhosts() {
  const vw = W / worldScale(), l = cam.x - vw / 2 - 200, r = cam.x + vw / 2 + 200;
  for (const g of WORLD.ghosts.values()) {
    if (g.x < l || g.x > r) continue;
    if (g.hp > 0) { ctx.save(); ctx.strokeStyle = `rgba(${ID_ALLY},0.55)`; ctx.lineWidth = 1.4 / worldScale(); ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.ellipse(g.x, 2, 36, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }   // 同道：脚下一道淡淡的虚线圈，和自己的金圈分开
    drawFighter(g);
    if (!g.sk) continue;
    ctx.save(); ctx.font = `15px ${BODY_FONT}`; ctx.textAlign = 'center';
    const y = g.sk.head[1] - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(g.x - 46, y - 14, 92, 4);
    ctx.fillStyle = g.hp > 0 ? '#46d3ea' : 'rgba(255,255,255,0.3)'; ctx.fillRect(g.x - 46, y - 14, 92 * clamp(g.hp / (g.maxHp || 1), 0, 1), 4);
    ctx.fillStyle = 'rgba(200,240,255,0.9)'; ctx.fillText(g.name || cvT('侠客'), g.x, y - 20);
    ctx.restore();
  }
}
function drawWorldHUD() {
  const key = !!M.worldKey, fs = Math.max(13, Math.round(H * 0.019)), x = W - Math.max(24, W * 0.04), y = Math.max(22, H * 0.04) + (key ? 150 : 84);
  let w = fs * 13;
  const zi = worldZoneAt(A.x), z = WORLD_ZONES[zi];
  const rows = WORLD.status ? [['状态', WORLD.status]] : key ? rgHudRows() : [
    ['所在', `${WORLD.line} 线 · ${z.n}`],
    ['本线侠客', `${WORLD.n} 人`],
    ['本线斩妖', `${WORLD.kills} 只（你 ${WORLD.myKills}）`],
    [WORLD.boss ? '妖王' : '妖王现世', WORLD.boss ? `魔窟 · 余 ${WORLD.boss.life || 0} 秒` : `还差 ${WORLD.nb} 只`],
    ...rgHudRows(),
    ...cqHudRows(),
  ];
  ctx.save(); ctx.textBaseline = 'top'; ctx.font = `${fs}px ${BODY_FONT}`;
  const title = cvT(key ? '全服肉鸽 · 关键战' : '江湖共斗 · 开放世界');
  for (const r of rows) { r[0] = cvT(r[0]); r[1] = cvT(r[1]); }
  w = Math.max(w, ctx.measureText(title).width, ...rows.map(([kk, v]) => ctx.measureText(kk).width + ctx.measureText(v).width + fs * 1.5));   // 英文长：框跟着变宽
  const hh = (rows.length + 1) * fs * 1.65 + 12;
  ctx.fillStyle = 'rgba(8,8,20,0.72)'; ctx.fillRect(x - w - 12, y - 10, w + 24, hh);
  ctx.strokeStyle = 'rgba(233,196,106,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(x - w - 12, y - 10, w + 24, hh);
  ctx.textAlign = 'left'; ctx.fillStyle = '#e9c46a'; ctx.fillText(title, x - w, y);
  rows.forEach(([kk, v], i) => {
    const yy = y + (i + 1) * fs * 1.65;
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(239,232,216,0.65)'; ctx.fillText(kk, x - w, yy);
    ctx.textAlign = 'right'; ctx.fillStyle = '#efe8d8'; ctx.fillText(v, x, yy);
  });
  if (key) { ctx.restore(); return; }   // 关键战里只留肉鸽这几行，挪到血条下面，不挡技能栏
  // 山河小图：四段地图、自己、附近的同道、妖王
  const my = y + hh + 6, mw = w + 24, mx = x - w - 12;
  ctx.fillStyle = 'rgba(8,8,20,0.72)'; ctx.fillRect(mx, my, mw, 14);
  for (const zz of WORLD_ZONES) { ctx.fillStyle = `rgba(${zz.tint},0.45)`; ctx.fillRect(mx + mw * zz.a / WORLD_W, my + 4, mw * (zz.b - zz.a) / WORLD_W - 1, 6); }
  ctx.fillStyle = '#46d3ea';
  if (WORLD.rosterPos && WORLD.rosterPos.size) {
    for (const [pid, pos] of WORLD.rosterPos) if (pid !== WORLD.id) ctx.fillRect(mx + mw * pos.x / WORLD_W - 1, my + 2, 2, 10);
  } else {
    for (const g of WORLD.ghosts.values()) ctx.fillRect(mx + mw * g.x / WORLD_W - 1, my + 2, 2, 10);
  }
  if (WORLD.boss) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(mx + mw * WORLD.boss.x / WORLD_W - 2, my, 4, 14); }
  ctx.fillStyle = '#38d976'; ctx.fillRect(mx + mw * A.x / WORLD_W - 2, my, 4, 14);
  ctx.font = `11px ${BODY_FONT}`; ctx.fillStyle = 'rgba(233,196,106,0.9)'; ctx.textAlign = 'center';
  ctx.fillText(cvT('[T] 神行千里 · 传送同道'), mx + mw / 2, my + 28);
  ctx.restore();
  if (WORLD.boss) {   // 妖王血条：全线共用
    const b = WORLD.boss, bw = Math.min(W * 0.5, 640), bx = (W - bw) / 2, by = H - Math.max(70, H * 0.1);
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 3, by - 3, bw + 6, 16);
    ctx.fillStyle = '#c42a45'; ctx.fillRect(bx, by, bw * clamp(b.hp / (b.maxHp || 1), 0, 1), 10);
    ctx.font = `${fs}px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#ffd0c0';
    ctx.fillText(`${cvT('妖王 · 全线共讨')}  ${Math.max(0, Math.ceil(b.hp))} / ${b.maxHp}`, W / 2, by - 6); ctx.restore();
  }
}
// 入口：首页「开放世界」打开一个小弹窗，直接进或者填线号找朋友。都先在点将台选侠客
function worldEnter(line) {
  WORLD.wantLine = line >= 1 && line <= 9999 ? Math.floor(line) : 0;
  bpStart('world');
}
function openWorldModal() { const m = $id('modalWorld'); if (m) m.classList.remove('hidden'); cqLoad(false); }
function closeWorldModal() { const m = $id('modalWorld'); if (m) m.classList.add('hidden'); }
if ($id('modalWorldClose')) $id('modalWorldClose').addEventListener('click', closeWorldModal);
if ($id('btnWorldGo')) $id('btnWorldGo').addEventListener('click', () => { closeWorldModal(); worldEnter(0); });
if ($id('btnWorldLine')) {
  const goLine = () => {
    const n = +(($id('worldLineIn') && $id('worldLineIn').value) || 0);
    if (!(n >= 1 && n <= 9999)) { toast('线号是 1 到 9999 的数字'); return; }
    closeWorldModal(); worldEnter(n);
  };
  $id('btnWorldLine').addEventListener('click', goLine);
  $id('worldLineIn').addEventListener('keydown', e => { if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); goLine(); } });
}

