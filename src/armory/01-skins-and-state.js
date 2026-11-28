/* =====================================================================
   刃影武库：皮肤系统
   ---------------------------------------------------------------------
   库存（斩数计数、改名标签）、武器箱开箱、货郎、玩家市场（只有玩家之间买卖饰品，标价玩家自己定）、
   熔铸契、对局掉落、每周补给、江湖行动。规则都在 armory-core.js，这里只管页面和接到游戏里。
   两种模式：
     云端账号 + 新版服务器：开箱、买卖、熔铸都交给服务器算，随机数也在服务器上取，本机只显示结果。
     其他情况（本机账号、服务器还没升级）：在本机按同一套规则算，存档带校验，被改过就作废（没有玩家市场）。
   只卖外观和便利：皮肤只换样子和特效，侠客强度不变。没有充值：武器箱和货郎在商店按固定价格用墨锭买，
   不能转卖；普通武器箱每天能开 2 个，神兵武器箱每周能开 1 个。
   文件结构：新皮肤 → 状态 → 名字、价格、卡面 → 弹窗 → 页面（各个标签页怎么画） → 事件（点击）
     → 打开武库 → 接到游戏里（对局掉落、斩数） → 一次性、按天按周的奖励。
   找 bug 提示：数值和规则的问题去 armory-core.js；这里只有显示和点击。云端模式下操作失败，
     看浏览器网络面板里 /api/econ 的返回（CloudSave.econ）。
   ===================================================================== */
  const C = window.ArmoryCore;
  if (!C || typeof PROF === 'undefined' || typeof SKINS === 'undefined') return;
  // 开局就记下原生的取时间、取随机数、云端接口，后面有人在控制台换掉也不影响这里
  const NOW = Date.now.bind(Date);
  const GRV = crypto.getRandomValues.bind(crypto);
  const CS = window.CloudSave || null;
  const ECON = CS && CS.econ, LSYNC = CS && CS.ledgerSync, FLUSH = CS && CS.flushNow, MKT = CS && CS.market;
  const GRANT = CS && CS.inkGrantKey ? CS.inkGrantKey() || (() => {}) : () => {};   // 反作弊认的入账：只有这里能记
  const rnd = () => { const a = new Uint32Array(2); GRV(a); return (a[0] * 2097152 + (a[1] >>> 11)) / 9007199254740992; };

  /* ---------- 新皮肤：24 款涂装、5 款 ★、神兵武器箱的 7 款、星座武器箱的 36 款 ---------- */
  for (const [k, char, name, look] of C.PAINTS) SKINS[k] = { char, rarity: 'rare', name, cs: 'paint', look: { ...look } };
  for (const [k, d] of Object.entries(C.FULL)) {
    SKINS[k] = { char: d.char, rarity: 'legend', name: d.name, cs: d.heirloom ? 'heirloom' : 'star', heirloom: !!d.heirloom, stOnly: !!d.stOnly, relic: d.relic ? { ...d.relic } : undefined, look: { ...d.look }, deco: JSON.parse(JSON.stringify(d.deco)), fx: { ...d.fx } };
    if (d.scene) SCENES[k] = JSON.parse(JSON.stringify(d.scene));
  }
  for (const d of Object.values(C.FULL)) if (d.deco.sign && d.deco.weapStyle) {   // 星座皮肤的流星锤：链子、锤头、锤箍、裂纹光都换成这个星座的颜色
    const { look: l, deco: e } = d;
    HAMMER_LOOK[e.weapStyle] = { chain: [e.robeC, l.metal], head: e.cape || l.shade, band: l.metal, crack: e.zc };
  }
  HAMMER_LOOK.frost_hammer = { chain: ['#3a5a7a', '#cfeaff'], head: '#e4f2ff', band: '#7fd4ff', crack: '150,220,255', spikes: '#9fc8e8' };
  SKIN_WEAP.moon_gourd = W => {   // 醉月：银白葫芦，腰上一弯新月，口上冒一缕月光
    const G = gourdParts(W); if (!G) return;
    const { top, bot, mid } = G;
    const fillG = (c, r) => { const q = ctx.createRadialGradient(c[0] - r * 0.3, c[1] - r * 0.3, 1, c[0], c[1], r); q.addColorStop(0, '#ffffff'); q.addColorStop(0.6, '#b8c4ff'); q.addColorStop(1, '#4a5694'); ctx.fillStyle = W.flash ? '#fff' : q; circle(c, r); };
    fillG(bot, 8.5); fillG(top, 5.5);
    if (!W.live) return;
    ctx.fillStyle = '#2a3460'; ctx.fillRect(mid[0] - 3.5, mid[1] - 1.2, 7, 2.4);
    ctx.fillStyle = '#f4f6ff'; ctx.beginPath(); ctx.arc(bot[0] + 1, bot[1], 4.2, 0.6, 5.2); ctx.arc(bot[0] + 2.6, bot[1] - 0.6, 3.4, 5.0, 0.8, true); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const ph = (W.T * 0.7) % 1;
    W.glow([top[0], top[1] - 6 - ph * 10], 6, '190,205,255', 0.55 * (1 - ph));
  };
  SKIN_WEAP.renying_blade = W => {   // 刃影：乌钢长刀，刃口一线朱红，刀尖滴墨
    const { P, poly, bar, live, t, T, hl } = W;
    bar(hl, W.g, 4.5, '#120c0c');
    poly([P(0, -2.6), P(0.86, -3), t, P(0.9, 1.4), P(0, 2.4)], W.lg(W.g, t, [[0, '#1a1416'], [0.7, '#2c2224'], [1, '#463638']]));
    poly([P(0.02, -6), P(-0.04, -7.2), P(-0.04, 7.2), P(0.02, 6)], '#3a1a1c');
    if (!live) return;
    ctx.strokeStyle = `rgba(255,70,60,${0.7 + Math.sin(T * 6) * 0.2})`; ctx.lineWidth = 1.2; line(P(0.05, -2.4), P(0.86, -2.8));
    ctx.globalCompositeOperation = 'lighter'; W.glow(t, 8, '255,70,60', 0.45);
    ctx.globalCompositeOperation = 'source-over';
    const ph = (T * 0.9) % 1; ctx.fillStyle = `rgba(10,6,6,${0.9 - ph * 0.6})`; circle([t[0], t[1] + ph * 16], 1.6 - ph * 0.6);
  };
  SKIN_WEAP.jiuxiao_gauntlet = W => {   // 九霄：玄青拳套镶金边，拳面一颗雷珠，三道金色电弧绕着拳头转
    fistPlates(W, (Q, h) => {
      const edge = [Q(7.5, 6.8), Q(7.5, -6.8), Q(-5, -6), Q(-6.5, 0), Q(-5, 6)];
      W.poly(edge, '#2a2452');
      if (!W.live) return;
      ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1.3; ctx.beginPath(); for (const q of edge) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.stroke();
      const c = Q(3, 0), pulse = 0.6 + 0.4 * Math.sin(W.T * 7 + h[0] * 0.1);
      ctx.globalCompositeOperation = 'lighter';
      W.glow(c, 10, '255,220,110', 0.5 * pulse);
      ctx.fillStyle = '#fff6c8'; circle(c, 2.1);
      ctx.strokeStyle = 'rgba(255,225,120,0.9)'; ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) { const an = W.T * 5 + k * 2.094 + h[1] * 0.05; zigzag(c, [h[0] + Math.cos(an) * 15, h[1] + Math.sin(an) * 15], 4, 2.4); }
      ctx.globalCompositeOperation = 'source-over';
    });
  };
  SKIN_WEAP.guanghan_moon = W => {   // 广寒：银白月刃，外面一圈淡蓝月晕，刃上缀着三点星光
    moonBlade(W, '#eef4ff', '#24305a');
    const [c, a] = moonCrescent(W, 12, W.lg(W.At(W.t, -16), W.At(W.t, 8), [[0, '#b8ccff'], [0.55, '#f4f8ff'], [1, '#ffffff']]));
    if (!W.live) return;
    ctx.strokeStyle = 'rgba(120,150,220,0.85)'; ctx.lineWidth = 0.9; line(W.P(0.05), W.P(0.85));
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(200,220,255,${0.3 + 0.15 * Math.sin(W.T * 2.4)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c[0], c[1], 14.5, a - 2, a + 2); ctx.stroke();
    for (let k = 0; k < 3; k++) { const b = a - 1.6 + k * 1.6, tw = 0.5 + 0.5 * Math.sin(W.T * 3 + k * 2); glint(c[0] + Math.cos(b) * 12.5, c[1] + Math.sin(b) * 12.5, 1.6 + tw * 1.8, '220,235,255', 0.35 + tw * 0.5); }
    ctx.globalCompositeOperation = 'source-over';
  };
  // ---------- 神兵武器箱的 7 件兵器 ----------
  SKIN_WEAP.tianhe_spear = W => {   // 天河：夜蓝枪杆里流着一道星河，枪头是一片淡蓝到粉白的星晶，下面一颗四角星，两条星云带
    const { At, t, bar, live, T } = W, back = At(W.g, -36), head0 = At(t, -26);
    bar(back, head0, 3.4, '#1a1f4a');
    W.poly([t, At(t, -8, 4.2), At(t, -20, 3), At(t, -26, 1.2), At(t, -26, -1.2), At(t, -20, -3), At(t, -8, -4.2)], W.lg(At(t, -26), t, [[0, '#7f8cff'], [0.5, '#cfd8ff'], [0.82, '#ffd6f4'], [1, '#ffffff']]));
    const sb = At(t, -28);
    W.poly([At(sb, 0, -6.5), At(sb, 1.6, -1.6), At(sb, 6, 0), At(sb, 1.6, 1.6), At(sb, 0, 6.5), At(sb, -1.6, 1.6), At(sb, -6, 0), At(sb, -1.6, -1.6)], '#e9e4ff');
    if (!live) return;
    ctx.strokeStyle = 'rgba(120,130,220,0.7)'; ctx.lineWidth = 0.8; line(At(t, -24), At(t, -3));
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = W.lg(back, head0, [[0, 'rgba(120,140,255,0.12)'], [0.5, 'rgba(170,150,255,0.5)'], [1, 'rgba(255,160,230,0.6)']]); ctx.lineWidth = 1.6; line(back, head0);
    for (let k = 0; k < 6; k++) { const u = (T * 0.35 + k / 6) % 1; ctx.fillStyle = `rgba(255,255,255,${0.9 * Math.sin(u * Math.PI)})`; circle([back[0] + (head0[0] - back[0]) * u, back[1] + (head0[1] - back[1]) * u], 0.9); }   // 星点顺着杆往枪头流
    const r0 = At(t, -29);
    for (const [k, col] of [[0, '165,185,255'], [1, '255,150,225']]) {
      const c1 = At(r0, -12, 7 * Math.sin(T * 3 + k * 2) + (k ? 4 : -4)), e1 = At(r0, -28, 11 * Math.sin(T * 3 + 1.2 + k * 2) + (k ? 7 : -7));
      ctx.strokeStyle = `rgba(${col},0.5)`; ctx.lineWidth = 3 - k; ctx.beginPath(); ctx.moveTo(...r0); ctx.quadraticCurveTo(...c1, ...e1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.8; ctx.stroke();
      const tw = 0.5 + 0.5 * Math.sin(T * 5 + k * 3); glint(e1[0], e1[1], 2 + tw * 2.5, col, 0.4 + tw * 0.5);
    }
    W.glow(At(t, -12), 10, '190,170,255', 0.35);
    const tw = 0.5 + 0.5 * Math.sin(T * 4); glint(t[0], t[1], 4 + tw * 4, '255,240,255', 0.6 + tw * 0.4);
  };
  SKIN_WEAP.butterfly_daggers = W => {   // 幻蝶：一对蝶翼短刃，刃身紫到青，根上张着两片小蝶翼，刃边绕着两只光蝶
    const pr = dualPair(W), wings = [];
    W.bar(W.hl, W.g, 4, '#2a1a48');
    for (const [a, b] of pr) {
      const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1, nx = -ey / el, ny = ex / el, h = [a[0] + ex * 0.22, a[1] + ey * 0.22];
      for (const sg of [-1, 1]) W.fillWith(() => { ctx.moveTo(...h); ctx.quadraticCurveTo(h[0] + nx * sg * 12 - ex / el * 6, h[1] + ny * sg * 12 - ey / el * 6, h[0] + nx * sg * 9 + ex / el * 4, h[1] + ny * sg * 9 + ey / el * 4); ctx.quadraticCurveTo(h[0] + nx * sg * 4 + ex / el * 6, h[1] + ny * sg * 4 + ey / el * 6, h[0] + ex / el * 4, h[1] + ey / el * 4); }, W.lg(h, [h[0] + nx * sg * 11, h[1] + ny * sg * 11], [[0, '#8ff4ff'], [1, '#c08cff']]));
      W.leaf(h, b, 4, W.lg(h, b, [[0, '#b48cff'], [0.6, '#d8ccff'], [1, '#f0fdff']]));
      wings.push([a, b, h, ex, ey, el, nx, ny]);
    }
    if (!W.live) return;
    for (const [a, b, h] of wings) { ctx.strokeStyle = 'rgba(110,60,200,0.8)'; ctx.lineWidth = 0.9; line(h, b); }
    ctx.globalCompositeOperation = 'lighter';
    wings.forEach(([a, b, h, ex, ey, el, nx, ny], i) => {
      W.glow(b, 7, '160,230,255', 0.4);
      const ph = W.T * 2.2 + i * 2.6, q = [h[0] + ex * (0.45 + 0.3 * Math.sin(ph)), h[1] + ey * (0.45 + 0.3 * Math.sin(ph))], o = 8 + 3 * Math.cos(ph * 1.3);
      ctx.save(); ctx.translate(q[0] + nx * o, q[1] + ny * o); ctx.rotate(Math.sin(ph * 2) * 0.4); drawShape('butterfly', 2.2, i ? '120,240,255' : '200,150,255', 0.9); ctx.restore();
    });
  };
  SKIN_WEAP.crystal_greatsword = W => {   // 琉璃：通透的琉璃巨剑，刃面切成几块晶面，一道光从护手扫到刃尖，护手是两簇晶石
    const { P, poly, bar, live, t, T } = W;
    bar(W.hl, W.g, 5, '#3a6a80');
    const edge = [P(0, -5.5), P(0.82, -6.2), t, P(0.82, 6.8), P(0, 5.5)];
    poly(edge, W.lg(P(0, 0), t, [[0, 'rgba(150,225,245,0.94)'], [0.5, 'rgba(214,246,255,0.92)'], [1, 'rgba(255,200,236,0.96)']]));
    for (const s2 of [-1, 1]) { poly([P(0, s2 * 3), P(0.07, s2 * 10.5), P(-0.05, s2 * 13.5), P(-0.1, s2 * 6)], '#9fd4e6'); poly([P(-0.02, s2 * 4), P(0.02, s2 * 8), P(-0.08, s2 * 9.5)], '#ffb8e0'); }
    if (!live) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1; line(P(0.02, 0), t);
    [[0, 0.3], [0.3, 0.58], [0.58, 0.82]].forEach(([a, b], k) => { for (const s2 of [-1, 1]) {   // 晶面：亮暗交替
      ctx.fillStyle = `rgba(255,255,255,${(k + (s2 > 0 ? 1 : 0)) % 2 ? 0.24 : 0.07})`; ctx.beginPath(); ctx.moveTo(...P(a, 0)); ctx.lineTo(...P(b, 0)); ctx.lineTo(...P(b, s2 * 6.2)); ctx.lineTo(...P(a, s2 * 5.6)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(110,190,225,0.55)'; ctx.lineWidth = 0.7; ctx.stroke();
    } });
    ctx.strokeStyle = 'rgba(180,245,255,0.7)'; ctx.lineWidth = 1.1; ctx.beginPath(); for (const q of edge) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.stroke();
    ctx.save(); ctx.beginPath(); for (const q of edge) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.clip();
    const k = (T * 0.6) % 1.4;
    if (k < 1.1) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(...P(k - 0.08, -8)); ctx.lineTo(...P(k, -8)); ctx.lineTo(...P(k + 0.1, 8)); ctx.lineTo(...P(k + 0.02, 8)); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { const tw = Math.max(0, Math.sin(T * 3 + i * 2.1)); if (tw > 0.15) glint(...P(0.2 + i * 0.26, (i % 2 ? 3 : -3)), 1.5 + tw * 3, '255,240,255', tw); }
    W.glow(t, 10, '255,170,230', 0.4);
  };
  SKIN_WEAP.tianlai_flute = W => {   // 天籁：象牙白的箫镶金箍，箫孔里飘出金色的音符，穗子坠一枚青玉璧
    const F = fluteBody(W, '#fbf3dc', [0.08, 0.3, 0.92], '#d8a640');
    if (!W.live) return;
    ctx.strokeStyle = 'rgba(190,140,50,0.5)'; ctx.lineWidth = 0.8; line(F(0.1, 1.7), F(0.9, 1.7));
    const k0 = W.hl, sw = Math.sin(W.T * 3.2) * 3, end = [k0[0] - W.ux * 4 + sw, k0[1] + 14];
    ctx.strokeStyle = '#e8b84a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(...k0); ctx.quadraticCurveTo(k0[0] - W.ux * 5, k0[1] + 7, ...end); ctx.stroke();
    ctx.fillStyle = '#7fd8b4'; circle(end, 3); ctx.fillStyle = '#fbf3dc'; circle(end, 1.1);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {   // 音符：从箫孔飘起来，一边飘一边淡
      const ph = (W.T * 0.55 + i / 3) % 1, h0 = F(0.45 + i * 0.15);
      ctx.save(); ctx.translate(h0[0] + Math.sin(ph * 6 + i) * 4, h0[1] - ph * 26); drawShape('note', 2.2 + ph, '255,214,120', Math.sin(ph * Math.PI) * 0.95); ctx.restore();
    }
    W.glow(F(0.5), 12, '255,215,130', 0.18);
  };
  SKIN_WEAP.jade_brush = W => {   // 青绿：翠玉笔杆、金笔斗，笔头蘸着石青石绿，滴下来是一点青绿，杆尾坠一颗玉
    const { At, t, hl, bar, live, T } = W;
    bar(hl, At(t, -11), 4.4, '#2a8a72');
    brushTip(W, W.lg(At(t, -12), At(t, 2.5), [[0, '#0e3a3a'], [0.5, '#1f8a76'], [1, '#8fe6c8']]));
    bar(At(t, -14), At(t, -11.5), 5.4, '#e8c45a');
    if (!live) return;
    ctx.strokeStyle = 'rgba(220,255,240,0.45)'; ctx.lineWidth = 1; line(At(hl, 1, -1.2), At(t, -15, -1.2));
    ctx.strokeStyle = 'rgba(10,60,50,0.5)'; ctx.lineWidth = 0.8; for (const s of [0.25, 0.5]) { const q = [hl[0] + (t[0] - hl[0]) * s, hl[1] + (t[1] - hl[1]) * s]; line(At(q, 0, -2.3), At(q, 0, 2.3)); }
    const dp = (T * 1.2) % 1; ctx.fillStyle = `rgba(40,170,140,${1 - dp})`; circle([t[0], t[1] + 4 + dp * 10], 1.5);
    const s0 = At(hl, 3), sw = Math.sin(T * 3) * 2.5;
    ctx.strokeStyle = '#d8b04a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...s0); ctx.quadraticCurveTo(s0[0] + sw * 0.4, s0[1] + 6, s0[0] + sw, s0[1] + 11); ctx.stroke();
    ctx.fillStyle = '#6ad8b4'; circle([s0[0] + sw, s0[1] + 13], 2.4); ctx.fillStyle = 'rgba(255,255,255,0.6)'; circle([s0[0] + sw - 0.7, s0[1] + 12.3], 0.8);
    ctx.globalCompositeOperation = 'lighter'; W.glow(t, 8, '90,220,180', 0.35);
  };
  SKIN_WEAP.peacock_feather = W => {   // 孔雀：碧绿翎刃，靠刃尖一只翎眼（金、青、宝蓝三圈），羽丝泛着光
    W.bar(W.hl, W.g, 4, '#0a3a32');
    const V = featherVane(W, 13, 3.5, 12, (i, u) => (i % 2 ? 1.2 : 0) * Math.sin(Math.PI * u));
    W.fillWith(() => { ctx.moveTo(...W.g); for (const q of V.outer) ctx.lineTo(q[0], q[1]); ctx.quadraticCurveTo(V.c2[0], V.c2[1], ...W.g); }, W.lg(W.g, W.t, [[0, '#0e6a5c'], [0.6, '#14a88c'], [1, '#7fe8c8']]));
    if (!W.live) return;
    ctx.strokeStyle = 'rgba(220,255,240,0.35)'; ctx.lineWidth = 0.6;
    for (let i = 1; i < 11; i++) { const u = i / 12, p = V.bz(V.c1, u), q = [W.g[0] + (W.t[0] - W.g[0]) * u, W.g[1] + (W.t[1] - W.g[1]) * u]; line(q, [q[0] + (p[0] - q[0]) * 0.95 + W.ux * 2, q[1] + (p[1] - q[1]) * 0.95 + W.uy * 2]); }
    ctx.strokeStyle = '#e8c040'; ctx.lineWidth = 1; line(W.g, W.t);
    const u = 0.62, p = V.bz(V.c1, u), q = [W.g[0] + (W.t[0] - W.g[0]) * u, W.g[1] + (W.t[1] - W.g[1]) * u], c = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], a = Math.atan2(W.uy, W.ux);
    for (const [r, col] of [[3.4, '#e8c040'], [2.6, '#14a88c'], [1.9, '#1a3a9a'], [0.9, '#0a0e2a']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 1.3, r, a, 0, 7); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    const sh = 0.5 + 0.5 * Math.sin(W.T * 3); ctx.fillStyle = `rgba(120,255,220,${0.18 + 0.16 * sh})`; ctx.beginPath(); ctx.ellipse(c[0], c[1], 5.5, 4.2, a, 0, 7); ctx.fill();
    glint(c[0] + W.ux, c[1] + W.uy - 1, 1.4 + sh * 1.4, '255,250,220', 0.6 + 0.3 * sh);
  };
  SKIN_WEAP.koi_fan = W => {   // 锦鲤：扇面是一汪浅水，一红一金两尾锦鲤绕着游，扇沿描一道朱漆
    const { g, live, T } = W, a = Math.atan2(W.uy, W.ux);
    W.bar(W.hl, g, 3.4, '#6a2a18');
    const q = ctx.createRadialGradient(g[0], g[1], 4, g[0], g[1], 32); for (const [k, c] of [[0, '#fff6ee'], [0.5, '#d8f0f6'], [1, '#8cc8dc']]) q.addColorStop(k, c);
    W.fillWith(() => fanSector(W, 31, a - 0.72, a + 0.72), q);
    if (!live) return;
    ctx.save(); ctx.beginPath(); fanSector(W, 30.5, a - 0.72, a + 0.72); ctx.closePath(); ctx.clip();
    ctx.strokeStyle = 'rgba(90,160,190,0.45)'; ctx.lineWidth = 0.8;
    for (const r of [12, 19, 26]) { ctx.beginPath(); ctx.arc(g[0], g[1], r + Math.sin(T * 2 + r) * 0.8, a - 0.7, a + 0.7); ctx.stroke(); }
    for (const [k, body, spot] of [[0, '#ff5a3a', '#ffffff'], [1, '#ffb83a', '#fff4d0']]) {   // 两尾鱼在扇面上来回游
      const ph = T * 0.9 + k * Math.PI, b = a + Math.sin(ph) * 0.5, r = 20 + Math.cos(ph * 2) * 3 + k * 3, c = [g[0] + Math.cos(b) * r, g[1] + Math.sin(b) * r];
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(b + (Math.cos(ph) >= 0 ? 1 : -1) * Math.PI / 2); drawKoi(3.4, body, spot, T * 8 + k); ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(80,30,16,0.75)'; ctx.lineWidth = 0.9;
    for (let i = -3; i <= 3; i++) { const b = a + i * 0.2; line([g[0] + Math.cos(b) * 4, g[1] + Math.sin(b) * 4], [g[0] + Math.cos(b) * 9, g[1] + Math.sin(b) * 9]); }
    ctx.strokeStyle = '#d8483a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(g[0], g[1], 30.5, a - 0.72, a + 0.72); ctx.stroke();
  };

  /* ---------- 状态 ---------- */
  let ST = null, MODE = 'none', UID = '', BUSY = false, TAB = 'inv', SIG = '', TK = 0, LOADING = null, OLDV = 0;
  // 玩家市场的行情（每一款在卖几件、最低多少、最近成交）：只有连上新版服务器才有；打开市场、货郎页时读，一分钟内不重读
  const MKD = { at: 0, items: null, err: '', busy: null };
  // 管理员在服务器上改过的经济数值（价格、每天能开几个、爆率、手续费……），服务器每次回话都带着；只在连着服务器时用，本机存档用默认值
  let CFG = null;
  const CF = () => (MODE === 'server' ? CFG : null);
  function loadMarket(force) {   // 读到新的行情时回 true
    if (MODE !== 'server' || !MKT) return Promise.resolve(false);
    if (MKD.busy) return MKD.busy.then(() => false);
    if (!force && (MKD.items || MKD.err) && NOW() - MKD.at < 60000) return Promise.resolve(false);   // 读失败了也等一分钟再试：不然每画一次就重读一次，读失败又重画，页面会卡死
    MKD.busy = MKT().then(d => { MKD.items = d && d.items && typeof d.items === 'object' ? d.items : {}; MKD.at = NOW(); MKD.err = ''; return true; })
      .catch(e => { MKD.err = e && e.status === 404 ? '服务器还没开玩家市场，等服务器更新以后就能用' : (e && e.message) || '读不到玩家市场'; MKD.at = NOW(); return true; })
      .finally(() => { MKD.busy = null; });
    return MKD.busy;
  }
  const SALT = 'ry-armory|v1|';
  const sigOf = s => C.hash32(SALT + UID + '|' + JSON.stringify(s)).toString(36) + C.hash32(JSON.stringify(s) + '|' + UID + SALT).toString(36);
  const user = () => OFFLINE_BUILD ? { uid: 'renying-offline', isCloud: false } : (window.CloudSave && CloudSave.getUser && CloudSave.getUser()) || null;
  const cloudOn = () => { const u = user(); return !!(u && u.isCloud && ECON); };
  const live = () => !!ST && (MODE === 'server' || MODE === 'local');   // 现在能不能开箱、买卖
  const OLD_MSG = '服务器还是旧版武库，等更新到新版以后才能用';
  const envBase = () => ({ now: NOW(), rnd, uid: UID, ink: Math.max(0, Math.floor(PROF.ink || 0)), skins: (PROF.skins || []).slice(), equip: { ...(PROF.equip || {}) }, server: false });
  function strike(reason) { try { if (typeof acStrike === 'function') acStrike(reason); } catch (e) {} }
  // 存档里的武库数据只能通过这里读写：读出去的是一份副本（改了也没用），写进来要过校验。
  // 刷新时存档可能在这个文件运行之前就载入了（那时 armory 还是普通字段）：先接住，下面装好读写口再读进来，否则本机账号的武库一刷新就空了
  const PRE_ARMORY = Object.prototype.hasOwnProperty.call(PROF, 'armory') ? PROF.armory : undefined;
  Object.defineProperty(PROF, 'armory', {
    configurable: false, enumerable: true,
    get() { return ST && MODE === 'local' ? Object.assign(JSON.parse(JSON.stringify(ST)), { sig: SIG }) : undefined; },
    set(v) { loadLocal(v); },
  });
  let LOCAL_V;   // 云端账号存档里带的武库数据：只在服务器还没升级（不认武库）时才用
  if (PRE_ARMORY && typeof PRE_ARMORY === 'object') setTimeout(() => { if (!ST && MODE !== 'server') { loadLocal(PRE_ARMORY); migrateLocal(); } }, 0);
  function unlockOfflineArmory(s) {
    s.badgeGift = 1;
    s.badgeOwned = Object.fromEntries(Object.keys(C.BADGES).map(id => [id, 'purpgold']));
    s.badgeSigils = Math.max(99, s.badgeSigils || 0);
    s.heroKOs = Object.fromEntries(C.HERO_IDS.map(id => [id, Math.max(300, s.heroKOs[id] || 0)]));
    s.stances = Object.fromEntries(C.HERO_IDS.map(id => [id, 1]));
    const equipped = new Set(Object.values(s.badgeEquip));
    const freeHeroes = C.HERO_IDS.filter(id => !s.badgeEquip[id]);
    for (const id of Object.keys(C.BADGES)) {
      if (equipped.has(id)) continue;
      const hero = freeHeroes.shift();
      if (!hero) break;
      s.badgeEquip[hero] = id;
      equipped.add(id);
    }
    const env = envBase();
    for (const key of Object.keys(C.ITEM)) {
      if (!s.inv.some(item => item.k === key)) C.addItem(s, C.mkItem(s, key, 'offline', rnd, { st: -1, t: NOW() }), env);
    }
    PROF.skins = Object.keys(SKINS);
    try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip || {})); } catch (e) {}
    return s;
  }
  function loadLocal(v, force) {
    const u = user(); UID = u ? String(u.uid || u.name || '') : '';
    if (OFFLINE_BUILD) {
      const data = v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([key]) => key !== 'sig')) : null;
      ST = unlockOfflineArmory(C.normalize(data || C.blank(), envBase()));
      SIG = sigOf(ST); MODE = 'local';
      return;
    }
    if (!u || PROF.guest) { ST = null; MODE = 'none'; return; }
    if (cloudOn() && !force && MODE !== 'local') {   // 云端账号先等服务器回话（connect），这期间什么都不能做，免得本机和服务器各记一笔
      LOCAL_V = v;
      if (MODE !== 'server') { ST = null; MODE = 'wait'; }
      return;
    }
    let s = null;
    if (v && typeof v === 'object') {
      const { sig, ...rest } = v;
      if (sig && sig === sigOf(rest)) s = rest;   // 校验按存进去时的原样算，所以第 1 版的存档也认
      else if (Object.keys(rest).length) { console.warn('武库存档校验不过，已作废'); strike('武库存档被改过'); }
    }
    ST = C.normalize(s || C.blank(), envBase());
    SIG = sigOf(ST);
    MODE = 'local';
  }
  if (OFFLINE_BUILD) loadLocal(PRE_ARMORY);
  // 以前不进库存的“绑定”皮肤：本机账号直接换成库存里的饰品（普通版），记进 via，之后和开箱得到的一样能卖能熔铸。
  // 要等这个账号的存档整个放好以后再做（applyProfile 之后），不然 PROF.skins 还是上一个账号的
  function migrateLocal() {
    if (MODE !== 'local' || !ST || PROF.guest || cloudOn()) return;
    voidLocal();
    if (OFFLINE_BUILD) return;
    retireLocal();
    const lg = (PROF.skins || []).filter(k => C.isItem(k) && !ST.via.includes(k) && !ST.inv.some(x => x.k === k));
    if (!lg.length) return;
    const env = envBase();
    for (const k of lg) { C.addItem(ST, C.mkItem(ST, k, 'legacy', rnd, { st: -1 }), env); ST.via.push(k); }
    SIG = sigOf(ST);
    if (window.CloudSave) CloudSave.saveProfile(PROF, true);
  }
  // 退场侠客的旧款（C.RETIRED）：库存、挂单读进来时已经换成接替的那一款；上一版读存档时丢掉了的，本机账号没有流水可查，
  // 按可穿的皮肤里还记着的旧款各补一件普通版（同款已经有了就不补），可穿的皮肤换成新编号。做完旧编号就不在了，所以只做一次
  function retireLocal() {
    const rk = (PROF.skins || []).filter(k => C.isRetired(k));
    if (!rk.length) return;
    const env = envBase();
    for (const k of rk) {
      const m = C.liveKey(k);
      if (ST.inv.some(x => x.k === m) || ST.lst.some(L => L.it.k === m)) continue;
      C.addItem(ST, C.mkItem(ST, m, 'retire', rnd, { st: -1 }), env);
      if (!ST.via.includes(m)) ST.via.push(m);
    }
    C.retireSkins(env);
    PROF.skins = env.skins; PROF.equip = env.equip;
    SIG = sigOf(ST);
    if (window.CloudSave) CloudSave.saveProfile(PROF, true);
  }
  // 写在源码里的星座码已作废：本机账号以前领到的（src 'code' 的星座饰品）收回，云端账号由服务器收回
  function voidLocal() {
    if (!(PROF.redeemedCodes || []).includes('ZODIAC2026STAR')) return;
    const ids = ST.inv.filter(x => x.src === 'code' && C.ITEM[x.k] && C.ITEM[x.k].col === 'c8').map(x => x.i);
    if (!ids.length) return;
    const env = envBase();
    for (const id of ids) C.dropItem(ST, id, env);
    PROF.skins = env.skins; PROF.equip = env.equip;
    SIG = sigOf(ST);
    if (window.CloudSave) CloudSave.saveProfile(PROF, true);
  }
  async function connect(force) {   // 云端账号先问服务器支不支持武库；支持就由服务器管
    const u = user();
    if (!u || PROF.guest) { ST = null; MODE = 'none'; return; }
    UID = String(u.uid || u.name || '');
    if (!cloudOn()) { if (!ST) loadLocal(undefined); MODE = 'local'; migrateLocal(); return; }
    if (MODE === 'server' && !force) return;
    if (LOADING) return LOADING;
    LOADING = (async () => {
      try {
        const out = await ECON('sync', {});
        if (out && out.state && out.state.v < C.VER) { MODE = 'old'; OLDV = out.state.v; ST = C.normalize(JSON.parse(JSON.stringify(out.state)), envBase()); return; }   // 服务器还是旧版的武库：先只给看，等服务器更新
        if (!out || !out.state || out.state.v !== C.VER) { if (MODE !== 'local') loadLocal(LOCAL_V, true); return; }
        MODE = 'server'; apply(out, true);
        setTimeout(() => rewardFlush().catch(() => {}), 0);   // 上次没报上去的关卡星、列传
        setTimeout(() => compatFlush().catch(() => {}), 0);   // 服务器升级后补交之前本机代领的盛典大礼
      } catch (e) {
        if (e && e.status === 404) { if (MODE !== 'local') loadLocal(LOCAL_V, true); }   // 服务器还没有武库：先用本机规则
        else if (e && e.status === 409) { /* 账号刚切换，等新账号的存档 */ }
        else { if (MODE !== 'server') { ST = null; MODE = 'offline'; } msg('连不上服务器，武库暂时只能看'); }
      } finally { LOADING = null; }
    })();
    return LOADING;
  }
  // 云端服务器还是旧版 v5（尚未部署新动作如 claimAppreciation / 灵宠 / 招式流派）时，
  // 本机先按同一套 ArmoryCore 规则结算并暂存差异，等服务器升级后自动同步，避免弹出“不认识的操作”
  const BADGE_RANK = { silver: 1, gold: 2, purpgold: 3 };
  const PET_RANK = { base: 1, spirit: 2, immortal: 3 };
  const compatKey = () => 'renying-arm-compat-' + UID;
  function compatLoad() {
    if (!UID) return null;
    try { const o = JSON.parse(localStorage.getItem(compatKey()) || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
  }
  function compatSave(o) {
    if (!UID) return;
    try {
      if (o && Object.keys(o).length) localStorage.setItem(compatKey(), JSON.stringify(o));
      else localStorage.removeItem(compatKey());
    } catch (e) {}
  }
  function mergeCompat(s) {
    const c = compatLoad();
    if (!c || !s) return s;
    if (c.appreciation2026) s.appreciation2026 = 1;
    if (c.badgeGift) s.badgeGift = 1;
    if (c.badgeOwned) {
      for (const [id, t] of Object.entries(c.badgeOwned)) {
        if ((BADGE_RANK[t] || 0) > (BADGE_RANK[s.badgeOwned[id]] || 0)) s.badgeOwned[id] = t;
      }
    }
    if (c.badgeEquip) {
      for (const [h, id] of Object.entries(c.badgeEquip)) {
        if (id) s.badgeEquip[h] = id; else delete s.badgeEquip[h];
      }
    }
    if (c.petOwned) {
      s.petOwned = s.petOwned || {};
      for (const [id, t] of Object.entries(c.petOwned)) {
        if ((PET_RANK[t] || 0) > (PET_RANK[s.petOwned[id]] || 0)) s.petOwned[id] = t;
      }
    }
    if (c.petEquip) {
      s.petEquip = s.petEquip || {};
      for (const [h, id] of Object.entries(c.petEquip)) {
        if (id) s.petEquip[h] = id; else delete s.petEquip[h];
      }
    }
    if (c.heroKOs) {
      for (const [h, n] of Object.entries(c.heroKOs)) {
        if ((s.heroKOs[h] || 0) < n) s.heroKOs[h] = n;
      }
    }
    if (c.skillUnlocks) {
      s.skillUnlocks = s.skillUnlocks || {};
      for (const [h, slots] of Object.entries(c.skillUnlocks)) {
        s.skillUnlocks[h] = s.skillUnlocks[h] || {};
        for (const [sl, list] of Object.entries(slots || {})) {
          s.skillUnlocks[h][sl] = Array.from(new Set([...(s.skillUnlocks[h][sl] || []), ...(list || [])]));
        }
      }
    }
    if (c.skillLoadout) {
      s.skillLoadout = s.skillLoadout || {};
      for (const [h, slots] of Object.entries(c.skillLoadout)) {
        s.skillLoadout[h] = Object.assign(s.skillLoadout[h] || {}, slots);
      }
    }
    if (c.stances) {
      s.stances = Object.assign(s.stances || {}, c.stances);
    }
    if (c.bonus) {
      s.badgeSigils = (s.badgeSigils || 0) + (c.bonus.badgeSigils || 0);
      s.term = (s.term || 0) + (c.bonus.term || 0);
      s.tags = (s.tags || 0) + (c.bonus.tags || 0);
      if (c.bonus.cases) {
        for (const [cid, n] of Object.entries(c.bonus.cases)) s.cases[cid] = (s.cases[cid] || 0) + (n || 0);
      }
    }
    return s;
  }
  function recordCompat(name, res, nextState) {
    const c = compatLoad() || {};
    if (name === 'claimAppreciation') {
      c.appreciation2026 = 1;
      c.badgeGift = 1;
      c.pendingClaim = (res && res.badgeId) || 'flowing';
      c.badgeOwned = Object.assign(c.badgeOwned || {}, { [c.pendingClaim]: 'purpgold' });
      c.petOwned = Object.assign(c.petOwned || {}, nextState.petOwned || {});
      c.heroKOs = Object.assign(c.heroKOs || {}, Object.fromEntries(C.HERO_IDS.map(h => [h, Math.max(20, (c.heroKOs && c.heroKOs[h]) || 0)])));
      c.skillUnlocks = JSON.parse(JSON.stringify(nextState.skillUnlocks || {}));
      c.bonus = { badgeSigils: 50, term: 10, tags: 10, cases: Object.fromEntries(C.CASES.map(cid => [cid, 10])) };
    } else if (name === 'badgeGift') {
      c.badgeGift = 1;
      c.badgeOwned = Object.assign(c.badgeOwned || {}, nextState.badgeOwned || {});
    } else if (name === 'badgeUnlock' || name === 'badgeUpgrade') {
      c.badgeOwned = Object.assign(c.badgeOwned || {}, nextState.badgeOwned || {});
      if (c.bonus && typeof c.bonus.badgeSigils === 'number' && res && res.usedSigils) c.bonus.badgeSigils = Math.max(0, c.bonus.badgeSigils - res.usedSigils);
    } else if (name === 'badgeAutoAssign' || name === 'badgeEquip') {
      c.badgeEquip = {};
      for (const h of C.HERO_IDS) c.badgeEquip[h] = (nextState.badgeEquip && nextState.badgeEquip[h]) || '';
    } else if (name === 'stanceSet') {
      c.stances = Object.assign(c.stances || {}, nextState.stances || {});
    } else if (name === 'petBuy' || name === 'petUpgrade') {
      c.petOwned = { ...(nextState.petOwned || {}) };
    } else if (name === 'petEquip') {
      c.petEquip = {};
      for (const h of C.HERO_IDS) c.petEquip[h] = (nextState.petEquip && nextState.petEquip[h]) || '';
    } else if (name === 'skillUnlock') {
      c.skillUnlocks = JSON.parse(JSON.stringify(nextState.skillUnlocks || {}));
    } else if (name === 'skillSet') {
      c.skillLoadout = JSON.parse(JSON.stringify(nextState.skillLoadout || {}));
    } else if (name === 'fullAuto') {
      c.badgeEquip = {};
      c.petEquip = {};
      for (const h of C.HERO_IDS) {
        c.badgeEquip[h] = (nextState.badgeEquip && nextState.badgeEquip[h]) || '';
        c.petEquip[h] = (nextState.petEquip && nextState.petEquip[h]) || '';
      }
      c.stances = Object.assign(c.stances || {}, nextState.stances || {});
      c.skillLoadout = JSON.parse(JSON.stringify(nextState.skillLoadout || {}));
    }
    compatSave(c);
  }
  async function compatFlush() {
    if (MODE !== 'server' || !ST) return;
    const c = compatLoad();
    if (!c || !c.pendingClaim) return;
    try {
      const out = await ECON('claimAppreciation', { badgeId: c.pendingClaim });
      if (out && out.state && out.state.appreciation2026) {
        apply(out, true);
        if ($id('armory') && $id('armory').classList.contains('on')) render();
      }
    } catch (e) {}   // 服务器还没更新时静默保留本机记录
  }
  // 动作结果落地：存档、墨锭、可穿的皮肤、穿着
  function redrawLooks() {   // 首页角色、头像、场上侠客按现在穿的重画一遍
    try {
      if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
      if (menuHeroId >= 0) { MENU_HERO = null; setMenuHero(menuHeroId); }
      applySkins();
    } catch (e) {}
  }
  // 一份补偿里有什么：「500 墨锭、初刃武器箱 ×2、货郎 ×1」
  const giftText = g => {
    if (g && g.heirloomPromo) {
      return g.n ? `《天工传世 · 器灵纪》全套典藏斩数版 ×${g.n}（解锁专属攻守双境）` : '已拥有全部 20 款《天工传世 · 器灵纪》典藏斩数版';
    }
    if (g && g.promoAll) {
      if (g.synced) return g.n ? `已同步最新内容（新增 ${g.n} 款饰品及最新解锁）` : '已同步最新更新的全部解锁内容';
      return `全侠客 + 全皮肤 + 全紫金徽记 + 全仙阶灵宠 + 全招式流派 + ${fmt(C.UNIVERSAL_PROMO_INK)} 墨锭 + 全武器箱各 ×${C.UNIVERSAL_PROMO_CASES} + 货郎 ×10 + 改名标签 ×10 + 徽记碎片 ×100`;
    }
    return [g.ink ? `${g.ink} 墨锭` : '', ...Object.entries(g.cases || {}).map(([c, n]) => C.COLS[c] ? `${C.COLS[c].name}武器箱 ×${n}` : ''), g.term ? `货郎 ×${g.term}` : '', g.tags ? `改名标签 ×${g.tags}` : '', g.n ? `${g.n} 款饰品` : '', g.skin ? `星座饰品「${skinName(g.skin)}」` : ''].filter(Boolean).join('、') || '这些饰品你都已经有了';
  };
  function apply(out, quiet) {
    if (!out) return;
    if (out.state) {
      ST = C.normalize(out.state, envBase());
      if (MODE === 'server' && !out.compat) {
        const c = compatLoad();
        if (c && ST.appreciation2026 && (c.pendingClaim || c.bonus || c.appreciation2026)) {
          delete c.pendingClaim; delete c.bonus; delete c.appreciation2026; delete c.badgeGift;
          compatSave(c);
        }
        mergeCompat(ST);
      }
      SIG = sigOf(ST);
    }
    const ink0 = Math.floor(PROF.ink || 0);
    let ink1 = ink0;
    if (out.compat && typeof out.ink === 'number') ink1 = out.ink;
    else if (MODE === 'server' && out.ledger && LSYNC) ink1 = LSYNC(out.ledger, ink0);   // 服务器的账 + 本机还没报上去的
    else if (MODE !== 'server' && typeof out.ink === 'number') ink1 = out.ink;
    if (ink1 > ink0) GRANT(ink1 - ink0);
    PROF.ink = ink1;
    let own = false;
    if (Array.isArray(out.skins)) { PROF.skins = out.skins.slice(); own = true; }
    if (out.skinsAdd || out.skinsDel) {
      const set = new Set(PROF.skins || []);
      for (const k of out.skinsAdd || []) set.add(k);
      for (const k of out.skinsDel || []) set.delete(k);
      PROF.skins = Array.from(set);
      own = (out.skinsAdd || []).length + (out.skinsDel || []).length > 0 || own;
    }
    if (Array.isArray(out.owned)) { PROF.owned = Array.from(new Set([...(PROF.owned || []), ...out.owned])); }
    if (ST && ST.promoAll) {
      PROF.owned = Array.from(new Set([...(PROF.owned || []), ...CHARS.map(c => c.id)]));
      PROF.skins = Array.from(new Set([...(PROF.skins || []), ...Object.keys(SKINS)]));
      own = true;
    }
    if (out.equip && typeof out.equip === 'object') { PROF.equip = PROF.equip || {}; for (const [c, k] of Object.entries(out.equip)) { own = true; if (k === null) delete PROF.equip[c]; else PROF.equip[c] = k; } }
    if (out.sold && out.sold.length) { MKD.at = 0; for (const x of out.sold) toast(`挂单卖给了别的玩家：${itemName({ k: x.k, st: x.st })}，到账 ${x.gain} 墨锭`); }   // 后台同步结到的也提示
    if (out.back && out.back.length) { MKD.at = 0; toast(out.back.length > 1 ? `${out.back.length} 件挂单到期没卖出，退回库存了` : `挂单到期没卖出，退回库存了：${itemName({ k: out.back[0].k, st: out.back[0].st })}`); }
    if (out.cfg !== undefined) { const c = C.cleanCfg(out.cfg); CFG = c.cfg; }
    if (Array.isArray(out.gifts)) for (const g of out.gifts) toast(`${g.skin ? '全服肉鸽奖励' : '开发组补偿'}：${String(g.note || '')}（${giftText(g)}）`);
    if (own && PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
    try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip || {})); } catch (e) {}
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    baseApply(PROF);
    if ((M.mode === 'net' || bpMode === 'net' || NET.open) && typeof send === 'function' && typeof armoryCombatLoadoutMap === 'function') send({ pload: armoryCombatLoadoutMap() });
    for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
  }
  const patchOf = (env, skins0, equip0) => {
    const a = new Set(skins0), b = new Set(env.skins), eq = {};
    for (const k of new Set([...Object.keys(equip0), ...Object.keys(env.equip)])) if (equip0[k] !== env.equip[k]) eq[k] = env.equip[k] === undefined ? null : env.equip[k];
    return { skinsAdd: [...b].filter(k => !a.has(k)), skinsDel: [...a].filter(k => !b.has(k)), equip: eq };
  };
  async function act(name, args, opt = {}) {
    if (!opt.bg && BUSY) return null;
    if (MODE === 'wait') { msg('正在连接服务器，稍等一下'); return null; }
    if (MODE === 'offline' || MODE === 'old') {   // 连不上、或者服务器还是旧版：再问一次，好了就接着做
      const was = MODE;
      await connect(true);
      if (MODE !== 'server') { if (!opt.bg) msg(was === 'old' ? OLD_MSG : '连不上服务器，等联网了再试'); return null; }
    }
    if (MODE === 'none' || !ST) { msg('登录之后才能用武库'); return null; }
    if (!opt.bg) { BUSY = true; busyUi(true); }
    try {
      let out;
      if (MODE === 'server') {
        try {
          if (FLUSH && !opt.bg) await Promise.race([FLUSH().catch(() => {}), new Promise(r => setTimeout(r, 3000))]);   // 先把本机的存档变化报上去，免得两边对不上
          out = await ECON(name, args || {});
        } catch (e) {
          if (e && e.status === 400 && e.message === '不认识的操作' && C.ACTIONS.includes(name)) {
            const env = envBase(), skins0 = env.skins.slice(), equip0 = { ...env.equip };
            const r = C.run(JSON.parse(JSON.stringify(ST)), name, args || {}, env);
            if (r.res && r.res.ok) recordCompat(name, r.res, r.state);
            out = { res: r.res, state: r.state, ink: env.ink, sold: r.sold, compat: true, ...patchOf(env, skins0, equip0) };
          } else {
            if (!opt.bg) msg(e && e.message ? e.message : '服务器出错了');
            if (e && e.ban && typeof acRefresh === 'function') acRefresh();
            return null;
          }
        }
      } else {
        const env = envBase(), skins0 = env.skins.slice(), equip0 = { ...env.equip };
        const r = C.run(ST, name, args || {}, env);
        out = { res: r.res, state: r.state, ink: env.ink, sold: r.sold, ...patchOf(env, skins0, equip0) };
      }
      apply(out, opt.bg);
      const res = out.res || {};
      if (res.err && !opt.bg) msg(res.err);
      return res;
    } finally { if (!opt.bg) { BUSY = false; busyUi(false); } }
  }

  /* ---------- 名字、价格、卡面 ---------- */
  const tierOf = k => C.ITEM[k] ? C.ITEM[k].tier : 'mil';
  const charName = k => { const c = CHARS[CHAR_IDX[C.charOf(k)]]; return c ? c.name : ''; };
  const skinName = k => (SKINS[k] && SKINS[k].name) || k;
  const colName = k => C.ITEM[k] ? C.COLS[C.ITEM[k].col].name : '';
