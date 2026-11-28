// ======================= 泼墨山河 · 留墨成势 & 战局墨卷（v1.3.0） =======================
// 重击、破防、拼刀与击破会在战场地面留下确定性的「残墨」水墨晕染（上限 12 处，持续 12 秒）；
// 站在新墨内交锋获得 +8% 拼刀回气；在墨域内触发拼刀引发「墨爆」清场；赛后可在客户端生成「战局墨卷」PNG。
const INK_ZONE_MAX = 12;
const INK_ZONE_DUR = 12.0;
const INK_HISTORY_MAX = 48;

function inkZoneInit() {
  M.inkZones = [];
  if (M.round === 1 || !Array.isArray(M.inkHistory)) M.inkHistory = [];
  M.inkFlashCount = 0;
}

function inkZoneSpawn(x, y, r, rgb, kind) {
  if (M.mode === 'demo' || !Array.isArray(M.inkZones)) return null;
  const zx = clamp(Math.round(x), WALL + 20, STAGE_W - WALL - 20);
  const zy = Math.min(0, Math.round(y || 0));
  const zr = clamp(Math.round(r || 54), 32, 96);
  const zone = { x: zx, y: zy, r: zr, life: INK_ZONE_DUR, max: INK_ZONE_DUR, rgb: rgb || '28,32,48', kind: kind || 'heavy' };
  M.inkZones.push(zone);
  if (M.inkZones.length > INK_ZONE_MAX) M.inkZones.shift();
  if (Array.isArray(M.inkHistory)) {
    M.inkHistory.push({ x: zx, y: zy, r: zr, rgb: zone.rgb, kind: zone.kind });
    if (M.inkHistory.length > INK_HISTORY_MAX) M.inkHistory.shift();
  }
  return zone;
}

function inkZoneTick() {
  const zs = M.inkZones;
  if (!Array.isArray(zs) || !zs.length) return;
  let w = 0;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    z.life -= STEP;
    if (z.life > 0) zs[w++] = z;
  }
  zs.length = w;
}

function inkZoneAt(x, y) {
  const zs = M.inkZones;
  if (!Array.isArray(zs) || !zs.length) return null;
  for (let i = zs.length - 1; i >= 0; i--) {
    const z = zs[i];
    if (Math.abs(x - z.x) <= z.r && Math.abs((y || 0) - z.y) <= 85) return z;
  }
  return null;
}

function inkZoneOnClash(cx, cy, f1, f2) {
  const inInk = inkZoneAt(cx, Math.min(f1 ? f1.y : 0, f2 ? f2.y : 0));
  inkZoneSpawn(cx, Math.max(f1 ? f1.y : 0, f2 ? f2.y : 0), 64, '35,40,58', 'clash');
  if (!inInk) return false;
  // 墨爆：残墨内拼刀，双方回气并清散附近非大招飞行道具
  if (f1 && f1.hp > 0) f1.meter = Math.min(100, (f1.meter || 0) + 8);
  if (f2 && f2.hp > 0) f2.meter = Math.min(100, (f2.meter || 0) + 8);
  if (typeof projs !== 'undefined' && Array.isArray(projs)) {
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i];
      if (!p || p.ult || p.unbreakable || p.kind === 'ironball') continue;
      if (Math.abs(p.x - cx) <= 280 && Math.abs(p.y - cy) <= 180) projs.splice(i, 1);
    }
  }
  M.inkFlashCount = (M.inkFlashCount || 0) + 1;
  if (!RESIM) {
    ring(cx, cy, 185, '215,220,235', 0.42);
    addP({ type: 'callout', text: cvT('墨爆'), x: cx, y: cy - 64, life: 0.85, max: 0.85, rgb: '235,228,210', scale: 1.8 });
    if (!(typeof SETTINGS !== 'undefined' && SETTINGS.reducedFlash)) {
      flashA = Math.max(flashA, 0.2); flashRGB = '220,220,235';
    }
  }
  return true;
}

function drawLivingInkZones() {
  const zs = M.inkZones;
  if (!Array.isArray(zs) || !zs.length) return;
  const reduced = typeof SETTINGS !== 'undefined' && SETTINGS.reducedFlash;
  const crowdLod = typeof isLargeTeam === 'function' && isLargeTeam() && allFighters().length >= 16;
  ctx.save();
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    if (typeof inRenderFrustum === 'function' && !inRenderFrustum(z.x, z.y, z.r + 20)) continue;
    const a = clamp(z.life / z.max, 0, 1) * (reduced ? 0.24 : 0.44);
    ctx.globalAlpha = a;
    ctx.fillStyle = z.kind === 'ko' ? 'rgba(130,26,28,0.65)' : 'rgba(14,16,26,0.75)';
    ctx.beginPath();
    ctx.ellipse(z.x, z.y + 3, z.r, Math.max(7, z.r * 0.16), 0, 0, Math.PI * 2);
    ctx.fill();
    if (!crowdLod) {
      ctx.globalAlpha = a * 0.65;
      ctx.strokeStyle = `rgba(${z.rgb},0.85)`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(z.x, z.y + 3, z.r * 0.84, Math.max(5, z.r * 0.12), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function exportBattleScrollPng() {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 1200; cv.height = 420;
  const g = cv.getContext('2d');
  if (!g) return null;
  // 宣纸卷轴底色
  const bg = g.createLinearGradient(0, 0, 1200, 420);
  bg.addColorStop(0, '#f4ecdc'); bg.addColorStop(0.5, '#efe4ce'); bg.addColorStop(1, '#e6d6b8');
  g.fillStyle = bg; g.fillRect(0, 0, 1200, 420);
  g.strokeStyle = 'rgba(40,34,28,0.35)'; g.lineWidth = 4; g.strokeRect(18, 18, 1164, 384);
  g.strokeStyle = 'rgba(180,50,42,0.4)'; g.lineWidth = 1.5; g.strokeRect(26, 26, 1148, 368);
  // 地面水墨线
  g.strokeStyle = 'rgba(28,28,34,0.35)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(64, 326); g.lineTo(1136, 326); g.stroke();
  // 绘制本局残墨笔触
  const hist = Array.isArray(M.inkHistory) ? M.inkHistory : [];
  const sw = Math.max(1, STAGE_W || 1800);
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    const px = 80 + clamp(h.x / sw, 0, 1) * 1040;
    const py = 324 + clamp(h.y / 380, -0.65, 0) * 180;
    const rad = clamp(h.r * 0.85, 22, 82);
    g.save();
    g.globalAlpha = h.kind === 'ko' ? 0.52 : 0.24;
    g.fillStyle = h.kind === 'ko' ? '#9e2624' : '#181a24';
    g.beginPath(); g.ellipse(px, py, rad, rad * 0.32, (i % 5 - 2) * 0.08, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // 题款与朱印
  const aName = (A && A.look && A.look.name) || '青锋';
  const bName = (B && B.look && B.look.name) || '绯影';
  g.fillStyle = '#1c1b18';
  g.font = 'bold 34px serif';
  g.textAlign = 'left';
  g.fillText(`刃影 · 战局墨卷`, 56, 80);
  g.font = '20px sans-serif';
  g.fillStyle = '#4c463c';
  g.fillText(`${aName}  对  ${bName}  ·  比分 ${(M.wins || [0, 0]).join(' : ')}  ·  残墨 ${hist.length} 笔`, 56, 116);
  // 右上角朱红印章
  g.fillStyle = '#b83226';
  g.fillRect(1084, 52, 56, 56);
  g.strokeStyle = '#f4ecdc'; g.lineWidth = 2; g.strokeRect(1089, 57, 46, 46);
  g.fillStyle = '#f4ecdc'; g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('斩', 1112, 81);
  const url = cv.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `renying-battle-scroll-${Date.now()}.png`;
  a.click();
  if (typeof toast === 'function') toast('已导出本局战局墨卷');
  return url;
}
