// ======================= 多人同屏：一眼找到自己和队友 =======================
// 2v2、同袍肉鸽、全服肉鸽的关键战和开放世界里，人一多、特效一密就找不到自己。
// 自己：脚下金色双圈 + 头顶金色箭头和「你」（同屏几个人一起玩时写 1P / 2P …，各用各的颜色）；
// 队友：脚下一道队色细圈 + 头顶名字；对手只留一个红色小三角；魔首有自己的血条，不另加。
// 跑出画面时在屏幕左右边缘留一个指向他的箭头。字号按屏幕像素算，窄屏、拉远镜头都一样大。
const ID_SELF = ['46,213,115', '190,150,255', '255,140,200', '233,196,106'];   // 1P 金绿/青绿、2P 紫、3P 粉、4P 金
const ID_ALLY = '140,220,255', ID_FOE = '70,75,85';
function idHumans() { return allFighters().filter(f => !f.hidden && human.includes(f.ctrl)); }
const youLabel = () => (window.I18N ? I18N.t('我') : '我');   // 默认「我」，多玩家同屏时显示 1P/2P

// 这个人对我来说是谁：{ kind: 'self' | 'ally' | 'foe', rgb, label }，不用标的返回 null
function idRole(f) {
  if (!f || f.hidden || f.dummy || !f.sk) return null;
  if (M.mode === 'demo') return null;
  if (isAiVsAi()) {
    if (M.watchAi) return fighterTeam(f) === 0 ? { kind: 'ally', rgb: ID_ALLY, label: cvT(f.look.name) } : { kind: 'foe', rgb: ID_FOE };
    return null;
  }
  const k = human.indexOf(f.ctrl);
  if (k >= 0 || (f === A && !isMulti() && !(A.ctrl instanceof AICtrl))) {
    const idx = k >= 0 ? k : 0;
    const label = idHumans().length > 1 ? `${idx + 1}P` : youLabel();
    return { kind: 'self', rgb: ID_SELF[idx] || ID_SELF[0], label };
  }
  if (isMulti() && fighterTeam(f) === localTeam()) {
    const name = (f.ctrl === NET.remote && (NET.names || {})[NET.role === 'host' ? 'client' : 'host'])
      ? String(NET.names[NET.role === 'host' ? 'client' : 'host']).slice(0, 6)
      : cvT(f.look.name);
    return { kind: 'ally', rgb: ID_ALLY, label: name };
  }
  return { kind: 'foe', rgb: ID_FOE };
}

// 战斗开局与受身/起身降临垂直水墨光束（Beacon）
function drawIdentityBeacon(f, px) {
  const matchStartT = (M.phase === 'fight' && M.t < 1.5) ? clamp((1.5 - M.t) / 1.5, 0, 1) : 0;
  const recoveryT = (f.beaconT && f.beaconT > 0) ? clamp(f.beaconT / 0.5, 0, 1) : 0;
  const alpha = Math.max(matchStartT, recoveryT);
  if (alpha <= 0.01) return;

  const gy = (typeof gndY === 'function') ? gndY(f) : 2;
  const topY = gy - 950, botY = gy + 2;
  const bw = 38 * (0.88 + 0.12 * Math.sin(clock * 12));

  ctx.save();
  // 外层淡雅水墨光束
  const bg = ctx.createLinearGradient(f.x - bw, 0, f.x + bw, 0);
  bg.addColorStop(0, 'rgba(120, 240, 180, 0)');
  bg.addColorStop(0.25, `rgba(140, 245, 195, ${0.14 * alpha})`);
  bg.addColorStop(0.5, `rgba(220, 255, 235, ${0.34 * alpha})`);
  bg.addColorStop(0.75, `rgba(140, 245, 195, ${0.14 * alpha})`);
  bg.addColorStop(1, 'rgba(120, 240, 180, 0)');
  ctx.fillStyle = bg;
  ctx.fillRect(f.x - bw, topY, bw * 2, botY - topY);

  // 垂直金色/青绿色水墨流线
  ctx.strokeStyle = `rgba(233, 196, 106, ${0.35 * alpha})`;
  ctx.lineWidth = 1.4 * px;
  for (let i = -1; i <= 1; i++) {
    const lx = f.x + i * 12;
    const offY = (clock * 500 + (i + 1) * 160) % 280;
    ctx.beginPath();
    ctx.moveTo(lx, botY - offY - 90);
    ctx.lineTo(lx, botY - offY);
    ctx.stroke();
  }

  // 核心微光柱
  const cw = 11;
  const cg = ctx.createLinearGradient(f.x - cw, 0, f.x + cw, 0);
  cg.addColorStop(0, 'rgba(255, 255, 255, 0)');
  cg.addColorStop(0.5, `rgba(255, 255, 255, ${0.48 * alpha})`);
  cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = cg;
  ctx.fillRect(f.x - cw, topY, cw * 2, botY - topY);

  // 降临光晕与落地点水墨涟漪
  ctx.fillStyle = `rgba(160, 255, 210, ${0.22 * alpha})`;
  ctx.beginPath();
  ctx.ellipse(f.x, botY, 44, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  const ripR = 26 + (1 - alpha) * 26;
  ctx.strokeStyle = `rgba(233, 196, 106, ${0.65 * alpha})`;
  ctx.lineWidth = 2 * px;
  ctx.beginPath();
  ctx.ellipse(f.x, botY, ripR, ripR * 0.28, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// 脚下的圈：在画人之前画，身体会压在上面，不挡招式
function drawIdentityGround(list) {
  const px = 1 / worldScale();
  for (const f of list) {
    const r = f.hp > 0 && idRole(f); if (!r) continue;
    const gy = (typeof gndY === 'function') ? gndY(f) : 2;
    const hgt = clamp((gy - f.y) / 300, 0, 1);

    if (r.kind === 'self') {
      // 降临水墨光束 (Beacon)
      drawIdentityBeacon(f, px);

      // 常驻金绿/青绿太极莲华微光环（半径 ~35px，带微弱呼吸光效，高对比度）
      const pulse = 0.5 + 0.5 * Math.sin(clock * 3.6);
      const hurt = f.flash > 0;
      const rx = (35 + pulse * 3) * (1 - hgt * 0.3);
      const ry = (9.5 + pulse * 1) * (1 - hgt * 0.3);

      ctx.save();
      // 底层高对比度深墨阴影环：确保在白雪、明亮月影或强烈招式白光下始终清晰可辨
      ctx.fillStyle = 'rgba(6, 10, 16, 0.65)';
      ctx.beginPath(); ctx.ellipse(f.x, gy + 2, rx + 4, ry + 1.5, 0, 0, Math.PI * 2); ctx.fill();

      // 内层青绿/金绿水墨呼吸晕光
      ctx.fillStyle = hurt ? `rgba(255,70,70,${0.25 + 0.1 * pulse})` : `rgba(46,213,115,${0.16 + 0.09 * pulse})`;
      ctx.beginPath(); ctx.ellipse(f.x, gy + 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill();

      // 太极/莲华微动墨韵旋转饰线 (4瓣微动回旋)
      ctx.save();
      ctx.translate(f.x, gy + 2);
      ctx.scale(1, ry / rx);
      const rot = clock * 1.3;
      ctx.strokeStyle = hurt ? 'rgba(255,120,100,0.6)' : `rgba(233,196,106,${0.4 + 0.35 * pulse})`;
      ctx.lineWidth = 1.6 * px;
      for (let p = 0; p < 4; p++) {
        const ang = rot + (p * Math.PI / 2);
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * (rx * 0.45), Math.sin(ang) * (rx * 0.45), rx * 0.35, ang - 0.75, ang + 0.75);
        ctx.stroke();
      }
      ctx.restore();

      // 内圈主环（高亮青绿）
      ctx.strokeStyle = hurt ? 'rgba(255,90,80,0.95)' : 'rgba(46,230,135,0.95)';
      ctx.lineWidth = 2.4 * px;
      ctx.beginPath(); ctx.ellipse(f.x, gy + 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();

      // 外圈金光呼吸薄晕
      const outRx = rx + 6 + pulse * 3.5, outRy = ry + 2 + pulse * 1.2;
      ctx.strokeStyle = hurt ? 'rgba(255,120,100,0.45)' : `rgba(233,196,106,${0.35 + 0.35 * pulse})`;
      ctx.lineWidth = 1.4 * px;
      ctx.beginPath(); ctx.ellipse(f.x, gy + 2, outRx, outRy, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (r.kind === 'ally') {
      // 队友：淡冰蓝色细环
      const rx = 33 * (1 - hgt * 0.3), ry = 8.5 * (1 - hgt * 0.3);
      ctx.save();
      ctx.fillStyle = 'rgba(8, 20, 32, 0.35)';
      ctx.beginPath(); ctx.ellipse(f.x, gy + 2, rx + 2, ry + 1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(140,220,255,0.85)'; ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.ellipse(f.x, gy + 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (r.kind === 'foe') {
      // 对手：极淡的灰色暗影，避免视觉杂乱
      const rx = 30 * (1 - hgt * 0.3), ry = 6.5 * (1 - hgt * 0.3);
      ctx.save();
      ctx.fillStyle = 'rgba(60, 65, 80, 0.08)';
      ctx.beginPath(); ctx.ellipse(f.x, gy + 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}

// 头顶徽章标 + 脚下名牌：视距补偿缩放，不会因为拉远而缩成小点
function drawIdentityTags(list) {
  const px = 1 / worldScale(), fs = Math.max(13, Math.round(H * 0.019)), tags = [];
  for (const f of list) {
    const r = f.hp > 0 && idRole(f); if (!r) continue;
    const sz = f.size || 1, hx = f.x + (f.sk.head[0] - f.x) * sz, hy = f.y + (f.sk.head[1] - f.y) * sz;
    tags.push({ f, r, hx, hy: hy - 32 * sz, x: f.x, row: 0 });
  }
  tags.sort((a, b) => (a.r.kind === 'self') - (b.r.kind === 'self') || a.f.idx - b.f.idx);

  // 1P 的徽章胶囊标 [ ▼ 我 ] / [ ▼ 1P ]：带微型发光描边与向下指针，视距补偿（乘 1 / cam.zoom 像素恒定）
  for (const { f, r, hx, hy } of tags) {
    if (r.kind === 'foe') continue;   // 对手不显示头顶标，避免视觉杂乱
    const self = r.kind === 'self';
    const bob = Math.sin(clock * 5 + f.idx * 1.5) * 2;
    const tagText = self ? (r.label || youLabel()) : (r.label || '友');

    ctx.save();
    ctx.translate(hx, hy + bob * px);
    ctx.scale(px, px); // 视距补偿：无论相机拉远至 zoom=0.7 还是特写，徽章在屏幕上的像素大小严格恒定！

    ctx.font = `bold 12px ${BODY_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(tagText).width;
    const bw = Math.max(38, tw + 22), bh = 20;

    // 阴影发光描边
    const pulse = 0.5 + 0.5 * Math.sin(clock * 5);
    ctx.shadowColor = self ? 'rgba(52, 231, 155, 0.9)' : 'rgba(140, 220, 255, 0.85)';
    ctx.shadowBlur = 6;

    // 胶囊深色背景底衬
    ctx.fillStyle = self ? 'rgba(10, 16, 24, 0.92)' : 'rgba(8, 16, 28, 0.88)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2) : ctx.rect(-bw / 2, -bh / 2, bw, bh);
    ctx.fill();

    // 发光外边框
    ctx.strokeStyle = self ? `rgba(52, 231, 155, ${0.85 + 0.15 * pulse})` : 'rgba(140, 220, 255, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 底部小三角指示针 ▼ 指向角色头顶
    ctx.beginPath();
    ctx.moveTo(-4, bh / 2 - 0.5);
    ctx.lineTo(0, bh / 2 + 4.5);
    ctx.lineTo(4, bh / 2 - 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0; // 重置发光阴影以清晰绘制内部字标

    // 胶囊内微型向下箭头图标 ▼
    const arrowX = -bw / 2 + 10;
    ctx.fillStyle = self ? '#34e79b' : '#8cdfff';
    ctx.beginPath();
    ctx.moveTo(arrowX - 3.5, -2.5);
    ctx.lineTo(arrowX + 3.5, -2.5);
    ctx.lineTo(arrowX, 2.5);
    ctx.closePath();
    ctx.fill();

    // 胶囊文字（“我” 或 “1P”）
    const textX = 4;
    ctx.fillStyle = self ? '#ffffff' : '#e0f6ff';
    ctx.fillText(tagText, textX, 0.5);

    ctx.restore();
  }
}

// 跑出画面的自己和队友：在屏幕边缘绘制绿色指向箭头与距离标尺（防迷失）
function drawIdentityEdges(list, sx, sy) {
  const sc = worldScale(), fs = Math.max(12, Math.round(H * 0.016));
  const leftM = 36, rightM = W - 36, topM = 68, botM = H - 54;
  const cx = W / 2, cy = H / 2;

  for (const f of list) {
    const r = f.hp > 0 && idRole(f); if (!r || r.kind === 'foe') continue;
    const sxWorld = W / 2 + sx + (f.x - cam.x) * sc;
    const syWorld = groundY() + sy + (f.y - 60) * sc;

    // 判断角色是否处于镜头可视边界之外
    const isOff = (sxWorld < -15 || sxWorld > W + 15 || syWorld < -15 || syWorld > H + 15);
    if (!isOff) continue;

    const self = r.kind === 'self';
    const dx = sxWorld - cx, dy = syWorld - cy;
    const ang = Math.atan2(dy, dx);

    // 射线精准交界屏幕安全矩形边框
    let t = 1e6;
    if (dx > 0) t = Math.min(t, (rightM - cx) / dx);
    if (dx < 0) t = Math.min(t, (leftM - cx) / dx);
    if (dy > 0) t = Math.min(t, (botM - cy) / dy);
    if (dy < 0) t = Math.min(t, (topM - cy) / dy);

    const ex = cx + dx * t;
    const ey = cy + dy * t;

    // 与自身视距/镜头中心的物理距离换算（米数：120px ~ 1.75m -> 1m ≈ 68px）
    const distWorld = Math.hypot(f.x - cam.x, f.y - (cam.y || 0));
    const distM = Math.max(1, Math.round(distWorld / 68));
    const labelText = `${self ? (r.label || youLabel()) : (r.label || '友')} ${distM}m`;

    ctx.save();
    ctx.translate(ex, ey);

    const pulse = 0.5 + 0.5 * Math.sin(clock * 6);
    const borderRgb = self ? '46,213,115' : '140,220,255';
    ctx.shadowColor = `rgba(${borderRgb}, 0.85)`;
    ctx.shadowBlur = 8;

    // 胶囊外壳尺寸
    ctx.font = `bold ${fs}px ${BODY_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(labelText).width;
    const bw = tw + 28, bh = 24;

    // 深色墨玉底衬
    ctx.fillStyle = 'rgba(8, 14, 22, 0.94)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2) : ctx.rect(-bw / 2, -bh / 2, bw, bh);
    ctx.fill();

    // 发光外边框
    ctx.strokeStyle = `rgba(${borderRgb}, ${0.85 + 0.15 * pulse})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 绿色指向箭头（沿目标世界角度 ang 旋转）
    ctx.save();
    ctx.translate(-bw / 2 + 11, 0);
    ctx.rotate(ang);
    ctx.fillStyle = self ? '#2ed573' : '#8cdfff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -5.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.shadowBlur = 0;

    // 角色名称与距离标注
    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, 7, 0.5);

    ctx.restore();
  }
}
// 离影的雾身：本体的半透明剪影（一眼分得清哪个是本体），脚下一圈雾；只按 R 会去的那个（离对手最近）多一圈光；
// 最后 1 秒闪；结印时本体和目标雾身之间连一条雾线。只画，不改任何对局状态（不调用会记目标的 foeOf）
function drawClones() {
  const now = performance.now();
  for (let i = CLONE_FADES.length - 1; i >= 0; i--) {
    const fade = CLONE_FADES[i], age = (now - fade.at) / 430;
    if (age >= 1) { CLONE_FADES.splice(i, 1); continue; }
    const owner = fighterByIdx(fade.owner);
    if (!owner || !fade.sk) continue;
    const alpha = (1 - age) * (fade.sub ? 0.32 : 0.48), scale = 1 + age * 0.16;
    ctx.save();
    ctx.translate(fade.x, fade.y - age * 28); ctx.scale(scale, scale); ctx.translate(-fade.x, -fade.y);
    drawBody(fade.sk, owner, { ghost: alpha, tint: fade.tint });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = `rgba(${fade.tint},${0.7 * (1 - age)})`;
    ctx.lineWidth = 2.5 * (1 - age);
    ctx.beginPath(); ctx.ellipse(fade.x, fade.y - 8 - age * 18, 34 + age * 32, 7 + age * 10, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  for (const f of allFighters()) {
    if (f.hidden || !f.clones || !f.clones.length) continue;
    const C = f.ch.clone || { life: 15 }, rgb = f.look.slash;
    const foe = (f.target && !f.target.hidden) ? f.target : foesOf(f)[0], mark = foe ? cloneMark(f, foe) : null;
    const isSwapping = f.state === 'skill' && f.skill === 'mistswap' && f.skPh === 0;

    for (const c of f.clones) {
      const left = C.life - c.t, blink = left < 1 && Math.floor(left * 8) % 2 ? 0.3 : 1, cy = c.y || 0;
      const isSub = !!c.sub;
      const alphaMul = isSub ? 0.65 : 1.0;
      ctx.save();
      ctx.fillStyle = `rgba(${rgb},${(isSub ? 0.14 : 0.24) * blink})`;
      ctx.beginPath();
      ctx.ellipse(c.x, cy, isSub ? 28 : 36, isSub ? 6 : 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const rec = CLONE_SK[f.idx + ':' + c.id];
      const echoing = ['attack', 'skill', 'special'].includes(f.state);
      const ghostAlpha = (isSub ? 0.35 : 0.5) * blink;
      if (f.sk && echoing) { ctx.save(); ctx.translate(c.x - f.x, cy - f.y); drawBody(f.sk, f, { ghost: ghostAlpha, tint: rgb }); ctx.restore(); }
      else if (rec) drawBody(rec.sk, f, { ghost: ghostAlpha, tint: rgb });
      else if (f.sk) { ctx.save(); ctx.translate(c.x - f.x, cy - f.y); drawBody(f.sk, f, { ghost: ghostAlpha, tint: rgb }); ctx.restore(); }

      // 生命值微型印条（若受损）
      if (c.maxHp && c.hp < c.maxHp) {
        ctx.save();
        const barW = 34, hpFrac = clamp(c.hp / c.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(c.x - barW / 2, cy - 105, barW, 4);
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.fillRect(c.x - barW / 2, cy - 105, barW * hpFrac, 4);
        ctx.restore();
      }

      // 可渡影标志 / 当前高亮目标
      if (!isSub && (c === mark || c.id === f.swapId)) {
        ctx.save();
        const isTarget = isSwapping && c.id === f.swapId;
        ctx.strokeStyle = isTarget ? `rgba(255,255,255,${0.9 * blink})` : `rgba(${rgb},${0.85 * blink})`;
        ctx.lineWidth = isTarget ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.ellipse(c.x, cy, 46, 11, 0, 0, Math.PI * 2);
        ctx.stroke();
        // 浮空印记标记真身可渡
        ctx.font = `11px ${TITLE_FONT || 'sans-serif'}`;
        ctx.fillStyle = `rgba(${rgb},0.85)`;
        ctx.textAlign = 'center';
        ctx.fillText('真影', c.x, cy - 110);
        ctx.restore();
      }
    }
    if (isSwapping) {
      const c = f.clones.find(k => k.id === f.swapId && !k.sub);
      if (c) {
        ctx.save(); ctx.strokeStyle = `rgba(${rgb},0.65)`; ctx.lineWidth = 3.5; ctx.setLineDash([10, 8]);
        const cy = c.y || 0;
        ctx.beginPath(); ctx.moveTo(f.x, f.y - 55); ctx.lineTo(c.x, cy - 55); ctx.stroke();
        ctx.setLineDash([]); ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(clock * 40)})`;
        ctx.beginPath(); ctx.ellipse(c.x, cy, 52, 13, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  }
}
function drawDecoys() {
  for (const d of decoys) {
    const sk = d.sk; if (!sk) continue;
    const a = clamp(d.life / 0.3, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(d.x, d.y - 40); ctx.rotate(d.rot); ctx.translate(-d.x0, -d.y0 + 40);
    const segs = [[sk.hip, sk.kb, 7], [sk.kb, sk.fb, 6.5], [sk.sh, sk.eb, 6], [sk.eb, sk.hb, 5.5], [sk.hip, sk.neck, 11], [sk.hip, sk.kf, 7], [sk.kf, sk.ff, 6.5], [sk.sh, sk.ef, 6], [sk.ef, sk.hf, 5.5]];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2e2014'; ctx.fillStyle = '#2e2014';
    for (const s of segs) { ctx.lineWidth = s[2] + 4; line(s[0], s[1]); }
    circle(sk.head, 12);
    ctx.strokeStyle = '#b08a5a'; ctx.fillStyle = '#b08a5a';
    for (const s of segs) { ctx.lineWidth = s[2]; line(s[0], s[1]); }
    circle(sk.head, 10);
    // 绑绳和符纸
    ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 1.5;
    const mx = (sk.hip[0] + sk.neck[0]) / 2, my = (sk.hip[1] + sk.neck[1]) / 2;
    line([mx - 6, my - 6], [mx + 6, my - 6]); line([mx - 6, my + 6], [mx + 6, my + 6]);
    ctx.fillStyle = '#f1e2c0'; ctx.fillRect(mx - 4, my - 9, 8, 16);
    ctx.fillStyle = '#b8392e'; ctx.fillRect(mx - 1.5, my - 6, 3, 10);
    ctx.strokeStyle = '#2e2014'; ctx.lineWidth = 1.6;
    line([sk.head[0] - 4, sk.head[1] - 3], [sk.head[0] + 4, sk.head[1] + 3]); line([sk.head[0] + 4, sk.head[1] - 3], [sk.head[0] - 4, sk.head[1] + 3]);
    ctx.restore();
  }
}
