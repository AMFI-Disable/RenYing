/* =====================================================================
   刃影武库：CS 那样的皮肤系统
   ---------------------------------------------------------------------
   库存（斩数计数、改名标签）、武器箱开箱、终端机、江湖市场（每天浮动的价格、挂单）、
   汰换合同、对局掉落、每周补给、江湖行动。规则都在 armory-core.js，这里只管页面和接到游戏里。
   两种模式：
     云端账号 + 新版服务器：开箱、买卖、汰换都交给服务器算，随机数也在服务器上取，本机只显示结果。
     其他情况（本机账号、服务器还没升级）：在本机按同一套规则算，存档带校验，被改过就作废。
   只卖外观和便利：皮肤只换样子和特效，侠客强度不变。没有充值：武器箱和终端机在市场上用墨锭买卖，
   普通武器箱每天能开 2 个，神兵武器箱每周能开 1 个。
   ===================================================================== */
(function () {
  'use strict';
  const C = window.ArmoryCore;
  if (!C || typeof PROF === 'undefined' || typeof SKINS === 'undefined') return;
  if (typeof OFFLINE_BUILD !== 'undefined' && OFFLINE_BUILD) return;   // 离线版没有武库（也不把武库皮肤放进图鉴）
  // 开局就记下原生的取时间、取随机数、云端接口，后面有人在控制台换掉也不影响这里
  const NOW = Date.now.bind(Date);
  const GRV = crypto.getRandomValues.bind(crypto);
  const CS = window.CloudSave || null;
  const ECON = CS && CS.econ, LSYNC = CS && CS.ledgerSync, FLUSH = CS && CS.flushNow;
  const GRANT = CS && CS.inkGrantKey ? CS.inkGrantKey() || (() => {}) : () => {};   // 反作弊认的入账：只有这里能记
  const rnd = () => { const a = new Uint32Array(2); GRV(a); return (a[0] * 2097152 + (a[1] >>> 11)) / 9007199254740992; };

  /* ---------- 新皮肤：24 款涂装、5 款 ★、神兵武器箱的 7 款 ---------- */
  for (const [k, char, name, look] of C.PAINTS) SKINS[k] = { char, rarity: 'rare', name, cs: 'paint', look: { ...look } };
  for (const [k, d] of Object.entries(C.FULL)) {
    SKINS[k] = { char: d.char, rarity: 'legend', name: d.name, cs: 'star', look: { ...d.look }, deco: JSON.parse(JSON.stringify(d.deco)), fx: { ...d.fx } };
    SCENES[k] = JSON.parse(JSON.stringify(d.scene));
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
  const SALT = 'ry-armory|v1|';
  const sigOf = s => C.hash32(SALT + UID + '|' + JSON.stringify(s)).toString(36) + C.hash32(JSON.stringify(s) + '|' + UID + SALT).toString(36);
  const user = () => (window.CloudSave && CloudSave.getUser && CloudSave.getUser()) || null;
  const cloudOn = () => { const u = user(); return !!(u && u.isCloud && ECON); };
  const live = () => !!ST && (MODE === 'server' || MODE === 'local');   // 现在能不能开箱、买卖
  const OLD_MSG = '服务器还是旧版武库，等更新到新版以后才能用';
  const envBase = () => ({ now: NOW(), rnd, uid: UID, ink: Math.max(0, Math.floor(PROF.ink || 0)), skins: (PROF.skins || []).slice(), equip: { ...(PROF.equip || {}) }, server: false });
  function strike(reason) { try { if (typeof acStrike === 'function') acStrike(reason); } catch (e) {} }
  // 存档里的武库数据只能通过这里读写：读出去的是一份副本（改了也没用），写进来要过校验
  Object.defineProperty(PROF, 'armory', {
    configurable: false, enumerable: true,
    get() { return ST && MODE === 'local' ? Object.assign(JSON.parse(JSON.stringify(ST)), { sig: SIG }) : undefined; },
    set(v) { loadLocal(v); },
  });
  let LOCAL_V;   // 云端账号存档里带的武库数据：只在服务器还没升级（不认武库）时才用
  function loadLocal(v, force) {
    const u = user(); UID = u ? String(u.uid || u.name || '') : '';
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
  async function connect(force) {   // 云端账号先问服务器支不支持武库；支持就由服务器管
    const u = user();
    if (!u || PROF.guest) { ST = null; MODE = 'none'; return; }
    UID = String(u.uid || u.name || '');
    if (!cloudOn()) { if (!ST) loadLocal(undefined); MODE = 'local'; return; }
    if (MODE === 'server' && !force) return;
    if (LOADING) return LOADING;
    LOADING = (async () => {
      try {
        const out = await ECON('sync', {});
        if (out && out.state && out.state.v < C.VER) { MODE = 'old'; OLDV = out.state.v; ST = C.normalize(JSON.parse(JSON.stringify(out.state)), envBase()); return; }   // 服务器还是旧版的武库：先只给看，等服务器更新
        if (!out || !out.state || out.state.v !== C.VER) { if (MODE !== 'local') loadLocal(LOCAL_V, true); return; }
        MODE = 'server'; apply(out, true);
      } catch (e) {
        if (e && e.status === 404) { if (MODE !== 'local') loadLocal(LOCAL_V, true); }   // 服务器还没有武库：先用本机规则
        else if (e && e.status === 409) { /* 账号刚切换，等新账号的存档 */ }
        else { if (MODE !== 'server') { ST = null; MODE = 'offline'; } msg('连不上服务器，武库暂时只能看'); }
      } finally { LOADING = null; }
    })();
    return LOADING;
  }
  // 动作结果落地：存档、墨锭、可穿的皮肤、穿着
  function redrawLooks() {   // 首页角色、头像、场上侠客按现在穿的重画一遍
    try {
      if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
      if (menuHeroId >= 0) { MENU_HERO = null; setMenuHero(menuHeroId); }
      applySkins();
    } catch (e) {}
  }
  function apply(out, quiet) {
    if (!out) return;
    if (out.state) { ST = C.normalize(out.state, envBase()); SIG = sigOf(ST); }
    const ink0 = Math.floor(PROF.ink || 0);
    let ink1 = ink0;
    if (MODE === 'server' && out.ledger && LSYNC) ink1 = LSYNC(out.ledger, ink0);   // 服务器的账 + 本机还没报上去的
    else if (MODE !== 'server' && typeof out.ink === 'number') ink1 = out.ink;
    if (ink1 > ink0) GRANT(ink1 - ink0);
    PROF.ink = ink1;
    let own = false;
    if (Array.isArray(out.skins)) { PROF.skins = out.skins.slice(); own = true; }
    if (out.skinsAdd || out.skinsDel) { const set = new Set(PROF.skins || []); for (const k of out.skinsAdd || []) set.add(k); for (const k of out.skinsDel || []) set.delete(k); PROF.skins = Array.from(set); own = (out.skinsAdd || []).length + (out.skinsDel || []).length > 0 || own; }
    if (out.equip && typeof out.equip === 'object') { PROF.equip = PROF.equip || {}; for (const [c, k] of Object.entries(out.equip)) { own = true; if (k === null) delete PROF.equip[c]; else PROF.equip[c] = k; } }
    if (out.sold && out.sold.length && !quiet) for (const x of out.sold) toast(`挂单卖出：${x.g ? goodName(x.g) : itemName({ k: x.k, st: -1 })}，到账 ${x.gain} 墨锭`);
    if (own && PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
    try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip || {})); } catch (e) {}
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    baseApply(PROF);
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
          if (!opt.bg) msg(e && e.message ? e.message : '服务器出错了');
          if (e && e.ban && typeof acRefresh === 'function') acRefresh();
          return null;
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
  function itemName(it) {
    const star = tierOf(it.k) === 'gold' ? '★ ' : '', stp = it.st >= 0 ? '斩数 · ' : '';
    return `${star}${stp}${charName(it.k)} | ${skinName(it.k)}`;
  }
  const tc = k => C.TIER[tierOf(k)].c;
  const today = () => C.day(NOW());
  const ART = new Map();
  function art(k) {
    if (ART.has(k)) return ART.get(k);
    let url = '';
    try { url = makeCardArt(CHAR_IDX[C.charOf(k)], 150, 200, k).toDataURL('image/jpeg', 0.86); } catch (e) {}
    ART.set(k, url); return url;
  }
  const fmt = n => Math.round(n).toLocaleString();
  const ink = n => `<span class="ar-cur ar-ink"><i>墨</i>${fmt(n)}</span>`;
  const pct = x => `${+(x * 100).toFixed(2)}%`;
  function msg(t) { const el = $id('arMsg'); if (el && $id('armory').classList.contains('on')) { el.textContent = t; clearTimeout(msg.tm); msg.tm = setTimeout(() => { el.textContent = ''; }, 4500); } else toast(t); }
  function busyUi(on) { const m = $id('armory'); if (m) m.classList.toggle('ar-busy', on); }
  const seenKey = () => 'renying-arm-seen-' + UID;
  const seenAt = () => { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } };
  const markSeen = () => { try { localStorage.setItem(seenKey(), String(NOW())); } catch (e) {} };
  const tagLeft = s => { const g = C.STORE[0], b = s.buys[g.id]; return Math.max(0, g.lim - (b && b.k === 'w' + C.week(today()) ? b.n : 0)); };

  /* ---------- 弹窗 ---------- */
  function modal(html, cls = '') { const m = $id('arModal'); m.innerHTML = `<div class="ar-box ${cls}">${html}</div>`; m.hidden = false; return m; }
  function closeModal() { const m = $id('arModal'); m.hidden = true; m.innerHTML = ''; REEL.on = false; }
  function confirmBox(title, body, okText, fn) {
    modal(`<h3>${title}</h3><p>${body}</p><div class="row"><button class="go small" id="arOk">${okText}</button><button class="ghost small" data-ar-close>取消</button></div>`);
    $id('arOk').addEventListener('click', async () => { closeModal(); await fn(); });
  }
  function tile(it, extra = '') {
    const eq = ST && Object.values(ST.eq).includes(it.i), fresh = it.t && it.t > seenAt() && it.i;
    return `<button type="button" class="ar-it${eq ? ' eq' : ''}" style="--tc:${tc(it.k)}" ${it.i ? `data-it="${it.i}"` : ''} ${extra}>
      <img src="${art(it.k)}" alt="" loading="lazy">${it.st >= 0 ? `<span class="ar-st">斩数 ${it.st}</span>` : ''}${eq ? '<span class="ar-eq">穿着</span>' : ''}${fresh ? '<span class="ar-new">新</span>' : ''}
      <b>${tierOf(it.k) === 'gold' ? '★ ' : ''}${escapeHTML(skinName(it.k))}</b><small>${charName(it.k)}${it.n ? ` · ‘${escapeHTML(it.n)}’` : ''}</small><i class="ar-bar"></i></button>`;
  }

  /* ---------- 页面 ---------- */
  const TABS = [['inv', '库存'], ['cases', '武器箱'], ['term', '终端机'], ['market', '江湖市场'], ['trade', '汰换合同'], ['op', '江湖行动']];
  function dots() {
    if (!ST || MODE === 'none') return {};
    const d = {};
    d.inv = ST.inv.some(x => x.t > seenAt());
    d.op = (ST.drop.g >= C.SUPPLY_GAMES && !ST.drop.sup) || ST.op.ms.some((m, i) => !ST.op.done.includes(i) && (ST.op.prog[i] || 0) >= m.n);
    d.cases = !ST.gift || C.CASES.some(c => ST.cases[c] > 0 && C.openLeft(ST, c) > 0);   // 有箱子、今天（这周）还能开
    d.term = ST.term > 0 || !!ST.tm;
    d.any = d.inv || d.op || d.cases || d.term;
    return d;
  }
  function render() {
    if (!$id('armory')) return;
    const d = dots();
    for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
    $id('arTabs').innerHTML = TABS.map(([k, n]) => `<button type="button" data-tab="${k}" class="${k === TAB ? 'sel' : ''}">${n}${d[k] ? '<i class="ar-dot"></i>' : ''}</button>`).join('');
    const banner = MODE === 'none' ? '<p class="ar-banner">登录之后才能开箱、交易。先逛逛看吧。</p>'
      : MODE === 'wait' ? '<p class="ar-banner soft">正在连接服务器…</p>'
      : MODE === 'offline' ? '<p class="ar-banner">连不上服务器，武库暂时只能看。</p>'
      : MODE === 'old' ? `<p class="ar-banner">服务器上还是旧版武库，现在只能看。等服务器更新到新版就能开箱、交易，你的饰品和武器箱都在${OLDV === 1 ? '，没用完的钥匙会一把换一台终端机' : ''}。</p>`
      : MODE === 'local' && cloudOn() ? '<p class="ar-banner soft">测试期：服务器还没开武库，现在开箱、交易都只记在你的存档里，用来试玩。服务器版上线以后武库从零开始（会重新发新手礼），测试期开出来的东西不会带过去。</p>' : '';
    const R = { inv: pInv, cases: pCases, term: pTerm, market: pMarket, trade: pTrade, op: pOp }[TAB] || pInv;
    $id('arMain').innerHTML = banner + R();
    if (TAB === 'inv') markSeenSoon();
    if (TAB === 'term') termTick();
    renderTopNav();
  }
  let seenTm = 0;
  function markSeenSoon() { clearTimeout(seenTm); seenTm = setTimeout(() => { if (TAB === 'inv' && $id('armory').classList.contains('on')) markSeen(); }, 2500); }
  function blankS() { return ST || C.normalize(C.blank(), { now: NOW(), uid: '' }); }

  // 库存
  const INV = { char: '', tier: '', sort: 'new' };
  function invValue(s) { const d = today(); return s.inv.reduce((a, x) => a + C.price(x, d), 0); }
  function legacySkins(s) { return (PROF.skins || []).filter(k => SKINS[k] && !s.via.includes(k) && !s.inv.some(x => x.k === k) && !(OFFLINE_BUILD || DEV_SESSION_UNLOCKED)); }
  function pInv() {
    const s = blankS(), d = today();
    let list = s.inv.filter(x => (!INV.char || C.charOf(x.k) === INV.char) && (!INV.tier || tierOf(x.k) === INV.tier));
    const tr = x => C.TIERS.indexOf(tierOf(x.k));
    const sorts = { new: (a, b) => b.i - a.i, tier: (a, b) => tr(b) - tr(a) || b.i - a.i, price: (a, b) => C.price(b, d) - C.price(a, d), st: (a, b) => b.st - a.st || b.i - a.i };
    list = list.slice().sort(sorts[INV.sort] || sorts.new);
    const cases = C.CASES.filter(c => s.cases[c] > 0).map(c => `<button type="button" class="ar-caseitem" data-gotab="cases" style="--cc:${C.COLS[c].col}"><span class="ar-emb">${C.COLS[c].emblem}</span><b>${C.COLS[c].name}武器箱</b><small>×${s.cases[c]}</small></button>`).join('')
      + (s.term || s.tm ? `<button type="button" class="ar-caseitem" data-gotab="term" style="--cc:120,220,200"><span class="ar-emb">终</span><b>终端机</b><small>×${s.term + (s.tm ? 1 : 0)}</small></button>` : '');
    const legacy = legacySkins(s), tl = tagLeft(s);
    return `<div class="ar-sum"><span>饰品 <b>${s.inv.length}</b> / ${C.INV_MAX}</span><span>库存估值 ${ink(invValue(s))}</span><span>改名标签 <b>${s.tags}</b>${live() ? ` <button type="button" class="ar-link" data-store="tag" ${tl ? '' : 'disabled'}>${tl ? `买一张（${C.STORE[0].cost} 墨锭）` : '本周买满了'}</button>` : ''}</span></div>
      ${cases ? `<div class="ar-caserow">${cases}</div>` : ''}
      <div class="ar-filter">
        <select id="arInvChar" class="ar-sel"><option value="">全部侠客</option>${CHARS.map(c => `<option value="${c.id}" ${INV.char === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <select id="arInvTier" class="ar-sel"><option value="">全部品质</option>${C.TIERS.map(t => `<option value="${t}" ${INV.tier === t ? 'selected' : ''}>${C.TIER[t].n}</option>`).join('')}</select>
        <select id="arInvSort" class="ar-sel">${[['new', '最新获得'], ['tier', '品质最高'], ['price', '最值钱'], ['st', '斩数最多']].map(([k, n]) => `<option value="${k}" ${INV.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      ${list.length ? `<div class="ar-grid">${list.map(x => tile(x)).join('')}</div>` : `<div class="ar-empty"><p>${s.inv.length ? '没有符合条件的饰品。' : `武库的库存还是空的${legacy.length ? '（以前得到的皮肤在下面，一直都能穿）' : ''}。打对局有机会掉落，或者去开箱、逛市场。`}</p>${s.inv.length ? '' : '<button type="button" class="go small" data-gotab="cases">去开箱</button>'}</div>`}
      ${legacy.length ? `<h4 class="ar-h">以前得到的皮肤 <small>绑定账号，不能出售和汰换</small></h4><div class="ar-grid sm">${legacy.map(k => `<div class="ar-it bound" style="--tc:${C.isItem(k) ? tc(k) : SKINS[k].rarity === 'legend' ? '235,75,75' : '136,71,255'}"><img src="${art(k)}" alt="" loading="lazy"><b>${escapeHTML(SKINS[k].name)}</b><small>${charName(k)} · 绑定</small><i class="ar-bar"></i></div>`).join('')}</div>` : ''}
      ${typeof freeSkinEvent === 'function' && freeSkinEvent() ? '<p class="ar-note">限免活动只包括游戏里原有的皮肤，活动结束就收回。从武库拿到的饰品永久拥有，能在市场卖掉，开出斩数版还会记击倒数。</p>' : ''}`;
  }

  // 检视：左边是会动的侠客（穿着这一件），右边是详细信息
  let INS = null;
  function inspect(it, from) {
    INS = { it, from };
    const box = $id('arIns'); box.hidden = false;
    const cv = $id('arInsCv'); cv._w = 0; cv._h = 0;
    insInfo();
  }
  function insInfo() {
    const it = INS.it, own = INS.from === 'inv' && ST && ST.inv.some(x => x.i === it.i), d = today(), price = C.price(it, d);
    const worn = own && ST.eq[C.charOf(it.k)] === it.i, can = live();
    const src = { case: '开箱', drop: '对局掉落', market: '市场买入', trade: '汰换合同', supply: '每周补给', op: '江湖行动', term: '终端机' }[it.src] || '';
    $id('arInsInfo').innerHTML = `<span class="ar-tier" style="--tc:${tc(it.k)}">${C.TIER[tierOf(it.k)].n}</span>
      <h3>${escapeHTML(itemName(it))}</h3>${it.n ? `<p class="ar-tagname">‘${escapeHTML(it.n)}’</p>` : ''}
      <dl class="ar-dl">${it.st >= 0 ? `<dt>斩数</dt><dd><b class="ar-stn">${it.st}</b>（穿着它每击倒一个对手 +1）</dd>` : ''}<dt>收藏品</dt><dd>${colName(it.k)}武器箱</dd>
      ${src ? `<dt>来历</dt><dd>${src}${it.t ? ' · ' + new Date(it.t).toLocaleDateString() : ''}</dd>` : ''}<dt>市场价</dt><dd>${ink(price)}</dd></dl>
      <div class="ar-insbtns">${own ? `${worn ? `<button type="button" class="ghost small" data-ins="unequip">脱下</button>` : `<button type="button" class="go small" data-ins="equip" ${can ? '' : 'disabled'}>穿上</button>`}
        <button type="button" class="ghost small" data-ins="quick" ${can ? '' : 'disabled'}>直接卖出 ${ink(C.quick(price))}</button>
        <button type="button" class="ghost small" data-ins="list" ${can ? '' : 'disabled'}>挂单</button>
        <button type="button" class="ghost small" data-ins="rename" ${can ? '' : 'disabled'}>改名${ST.tags ? `（标签 ${ST.tags}）` : ''}</button>` : ''}
        ${INS.from === 'pv' ? `<button type="button" class="ghost small" data-ins="market">去江湖市场看看</button>` : ''}<button type="button" class="ghost small" data-ins="close">关闭</button></div>
      <p class="ar-note">${INS.from === 'pv' ? `这是预览。从${colName(it.k)}武器箱开出来、在江湖市场买到，或者汰换合同、终端机碰上了，就能穿上。` : `直接卖出是卖给收购商（市场价的 ${Math.round(C.BID * 100)}%），挂单能多卖一点；成交都扣 ${Math.round(C.FEE * 100)}% 手续费。`}</p>`;
  }
  function closeIns() { $id('arIns').hidden = true; INS = null; }
  async function insAction(a) {
    const it = INS && INS.it; if (!it) return;
    if (a === 'close') { closeIns(); return; }
    if (a === 'market') { closeIns(); marketItem(it.k); return; }
    if (a === 'equip') { const r = await act('equip', { i: it.i }); if (r && r.ok) { SFX.slice && SFX.slice(); toast(`已穿上「${skinName(it.k)}」`); insInfo(); render(); } return; }
    if (a === 'unequip') { const r = await act('unequip', { char: C.charOf(it.k) }); if (r && r.ok) { insInfo(); render(); } return; }
    if (a === 'quick') {
      const p = C.quick(C.price(it, today()));
      confirmBox('直接卖出', `把「${escapeHTML(itemName(it))}」卖给收购的人，到手 ${ink(p)}（已扣手续费）。`, '卖出', async () => {
        const r = await act('quick', { i: it.i }); if (r && r.ok) { closeIns(); SFX.wood && SFX.wood(); toast(`卖出到账 ${r.gain} 墨锭`); render(); }
      });
      return;
    }
    if (a === 'list') { listBox(it); return; }
    if (a === 'rename') renameBox(it);
  }
  function renameBox(it) {
    const tl = tagLeft(ST);
    modal(`<h3>改名标签</h3><p>给「${escapeHTML(itemName(it))}」起个名字（最多 12 个字），用掉 1 张改名标签。留空就是去掉名字（不用标签）。</p>
      <input id="arName" class="ar-input" maxlength="12" value="${escapeHTML(it.n || '')}" autocomplete="off" spellcheck="false">
      <div class="row">${ST.tags < 1 ? `<button class="ghost small" id="arTagBuy" ${tl ? '' : 'disabled'}>${tl ? `买一张标签 ${ink(C.STORE[0].cost)}` : '本周的标签买满了'}</button>` : ''}<button class="go small" id="arNameGo">确定</button><button class="ghost small" data-ar-close>取消</button></div>`);
    $id('arName').addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
    if ($id('arTagBuy')) $id('arTagBuy').addEventListener('click', async () => { const name = $id('arName').value; if (await buyTag()) { renameBox(it); $id('arName').value = name; } });
    $id('arNameGo').addEventListener('click', async () => { const r = await act('rename', { i: it.i, name: $id('arName').value }); if (r && r.ok) { closeModal(); INS.it = ST.inv.find(x => x.i === it.i) || it; insInfo(); render(); } });
  }
  async function buyTag() { const r = await act('store', { id: 'tag' }); if (r && r.ok) { SFX.wood && SFX.wood(); toast('改名标签 +1'); render(); return true; } return false; }
  function listBox(it, g) {   // 挂单：一件饰品（it），或者一个箱子（g：武器箱编号或 'term'）
    const mk = g ? C.goodPrice(g, today()) : C.price(it, today()), top = Math.floor(mk * C.LIST_MAX_R);
    modal(`<h3>挂单出售</h3><p>${g ? `一个${goodName(g)}` : `「${escapeHTML(itemName(it))}」`}现在的市场价是 ${ink(mk)}，最高能标到 ${ink(top)}。标得越低卖得越快，成交后扣 ${Math.round(C.FEE * 100)}% 手续费再到账。</p>
      <div class="ar-listrow"><input id="arPrice" class="ar-input" type="number" min="1" max="${top}" step="1" value="${top}"><span id="arEta" class="ar-note"></span></div>
      <div class="row"><button class="go small" id="arListGo">挂上去</button><button class="ghost small" data-ar-close>取消</button></div>`);
    const eta = () => {
      const v = Math.floor(+$id('arPrice').value || 0), r = C.sellRate(v / mk);
      $id('arEta').innerHTML = v < 1 ? '' : v > top ? `最高标 ${fmt(top)}，再高没人买` : `到手 ${ink(C.net(v))} · ${r >= 2 ? '很快就能卖掉' : `大约 ${Math.max(1, Math.round(1 / r))} 小时卖掉`}`;
    };
    $id('arPrice').addEventListener('input', eta); $id('arPrice').addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); }); eta();
    $id('arListGo').addEventListener('click', async () => {
      const price = Math.floor(+$id('arPrice').value || 0), r = await act('list', g ? { c: g, price } : { i: it.i, price });
      if (r && r.ok) { closeModal(); if (!g) closeIns(); toast('已挂到江湖市场，卖掉了会通知你'); render(); }
    });
  }
  function buyGood(k) {   // 一键买一个箱子：今天在售里最便宜的那一个
    const c = cheapest(k, blankS());
    if (!c.left) { msg('今天市场上的已经卖完了，明天再来'); return; }
    confirmBox(`买${goodName(k)}`, `花 ${ink(c.p)} 买一个${goodName(k)}？这是今天在售里最便宜的一个（还有 ${c.left} 个在售）。`, '买入', async () => {
      const r = await act(k === 'term' ? 'buyTerm' : 'buyCase', k === 'term' ? { n: 1 } : { c: k, n: 1 });
      if (r && r.ok) { SFX.wood && SFX.wood(); toast(`买到了：${goodName(k)}（${r.price} 墨锭）`); render(); }
    });
  }
  function sellGood(k) {   // 直接卖一个给收购的人
    const p = C.quick(C.goodPrice(k, today()));
    confirmBox('直接卖出', `把一个${goodName(k)}卖给收购的人，到手 ${ink(p)}（已扣手续费）。`, '卖出', async () => {
      const r = await act(k === 'term' ? 'sellTerm' : 'sellCase', k === 'term' ? { n: 1 } : { c: k, n: 1 });
      if (r && r.ok) { SFX.wood && SFX.wood(); toast(`卖出到账 ${r.gain} 墨锭`); render(); }
    });
  }

  // 武器箱
  // 箱子（武器箱、终端机）今天市场上最便宜的那一个：一键买就是买它
  function cheapest(k, s) { const L = C.listings(k, today()).filter(x => !s.bought.ids.includes(x.l)); return { p: L.length ? L[0].price : 0, left: L.length }; }
  const goodName = k => k === 'term' ? '终端机' : `${C.COLS[k].name}武器箱`;
  const goodHave = (s, k) => k === 'term' ? s.term : s.cases[k] || 0;
  const pips = (n, max) => Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
  function pCases() {
    const s = blankS(), d = today(), dl = C.openLeft(s, C.REG[0]), wl = C.openLeft(s, 'c7');
    const gift = live() && !ST.gift ? `<div class="ar-card ar-gift"><span><b>新手礼</b> 送你一个初刃武器箱和一台终端机，先开一个试试手气。</span><button type="button" class="go small" id="arGift">领取</button></div>` : '';
    const lim = `<div class="ar-card ar-week"><span>今天还能开 <b>${dl}</b> 个普通武器箱</span><span class="ar-pips" aria-hidden="true">${pips(dl, C.OPEN_DAY)}</span>
      <span>本周还能开 <b>${wl}</b> 个神兵武器箱</span><span class="ar-pips gold" aria-hidden="true">${pips(wl, C.PREM_WEEK)}</span><small>普通的每天零点刷新，神兵的每周一刷新；箱子随时能在市场上买卖</small></div>`;
    const card = cid => {
      const col = C.COLS[cid], O = C.oddsOf(cid), n = s.cases[cid], left = C.openLeft(s, cid), buy = cheapest(cid, s);
      const have = col.mil.filter(k => s.inv.some(x => x.k === k)).length, claimed = s.cc.includes(cid);
      const tiers = C.TIERS.filter(t => O[t] > 0 && (col[t] || []).length).map(t => `<div class="ar-ctier" style="--tc:${C.TIER[t].c}"><span>${C.TIER[t].n} · ${pct(O[t])}</span><div class="ar-minis">${col[t].map(k => `<img src="${art(k)}" alt="" title="${escapeHTML(itemName({ k, st: -1 }))}" data-pv="${k}" loading="lazy">`).join('')}</div></div>`).join('');
      const openTxt = n && !left ? '今天开完了' : '开启';
      return `<div class="ar-casecard" style="--cc:${col.col}">
        <div class="ar-casehead"><div class="ar-casebox"><span>${col.emblem}</span></div><div><h3>${col.name}武器箱</h3><p>拥有 <b>${n}</b> 个 · 市场价 ${ink(C.casePrice(cid, d))}</p>
          <div class="row"><button type="button" class="go small" data-open="${cid}" ${n && left ? '' : 'disabled'}>${openTxt}</button><button type="button" class="ghost small" data-buyg="${cid}" ${buy.left ? '' : 'disabled'}>${buy.left ? `买一个 ${ink(buy.p)}` : '今天卖完了'}</button></div></div></div>
        ${tiers}
        ${col.mil.length ? `<div class="ar-col"><span>集齐这个箱子的 ${col.mil.length} 款军规级：${have}/${col.mil.length}，送 1 个${col.name}武器箱 + 1 张改名标签</span><button type="button" class="${have >= col.mil.length && !claimed ? 'go' : 'ghost'} small" data-collect="${cid}" ${have >= col.mil.length && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : have >= col.mil.length ? '领取' : '未集齐'}</button></div>` : ''}
      </div>`;
    };
    const premCard = cid => {   // 神兵武器箱：左边开箱、右边把 7 款饰品摆出来，点一下就能看穿上的样子
      const col = C.COLS[cid], O = C.oddsOf(cid), n = s.cases[cid], left = C.openLeft(s, cid), buy = cheapest(cid, s);
      const ts = ['gold', 'cov', 'cla'].filter(t => O[t] > 0 && (col[t] || []).length);
      const show = ts.flatMap(t => col[t].map(k => `<button type="button" class="ar-pcard t-${t}" data-pv="${k}" style="--tc:${C.TIER[t].c}" title="看看穿上的样子"><span class="ar-pimg"><img src="${art(k)}" alt="" loading="lazy"></span><b>${escapeHTML(skinName(k))}</b><small>${C.TIER[t].n} · ${escapeHTML(charName(k))}</small></button>`)).join('');
      return `<div class="ar-casecard prem" style="--cc:${col.col}"><div class="ar-premside">
        <span class="ar-premtag">每周限开 ${C.PREM_WEEK} 个 · 隐秘和非凡加起来 ${pct(O.cov + O.gold)}</span>
        <div class="ar-casehead"><div class="ar-casebox"><span>${col.emblem}</span></div><div><h3>${col.name}武器箱</h3><p>拥有 <b>${n}</b> 个 · 市场价 ${ink(C.casePrice(cid, d))}</p>
          <div class="row"><button type="button" class="go small" data-open="${cid}" ${n && left ? '' : 'disabled'}>${n && !left ? '这周开过了' : '开启'}</button><button type="button" class="ghost small" data-buyg="${cid}" ${buy.left ? '' : 'disabled'}>${buy.left ? `买一个 ${ink(buy.p)}` : '今天卖完了'}</button></div></div></div>
        <div class="ar-podds">${ts.slice().reverse().map(t => `<span style="--tc:${C.TIER[t].c}">${C.TIER[t].n}<b>${pct(O[t])}</b></span>`).join('')}</div>
        <p class="ar-note">只出这三档，这 ${ts.reduce((a, t) => a + col[t].length, 0)} 款饰品别的武器箱都开不出来，开它也不占每天那 ${C.OPEN_DAY} 个。点一下饰品，就能先看看穿上的样子。</p>
      </div><div class="ar-pshow">${show}</div></div>`;
    };
    return `${gift}${lim}<div class="ar-cases">${C.CASES.filter(c => C.COLS[c].prem).map(premCard).join('')}${C.REG.map(card).join('')}</div>`;
  }
  // 开箱滚轮：结果已经由服务器（或本机）定好了，滚轮只是把它转出来
  const REEL = { on: false };
  const CW = 132;   // 每格宽 + 间隔
  function reelFill(cid, win) {   // 滚轮上的其他格子按这个箱子的爆率随便摆（好的那几档多摆一点，看着热闹）
    const col = C.COLS[cid], O = C.oddsOf(cid), ts = C.TIERS.filter(t => O[t] > 0 && (col[t] || []).length), w = ts.map((t, i) => O[t] * (i ? 3 : 1)), sum = w.reduce((a, b) => a + b, 0), out = [];
    for (let i = 0; i < 56; i++) {
      let r = Math.random() * sum, j = 0; while (j < ts.length - 1 && r >= w[j]) r -= w[j++];
      const a = col[ts[j]]; out.push({ k: a[Math.floor(Math.random() * a.length)], st: -1 });
    }
    out[48] = win;
    return out;
  }
  function skipAnim() { try { return localStorage.getItem('renying-arm-fast') === '1'; } catch (e) { return false; } }
  async function openCase(cid) {
    if (REEL.on) return;
    const r = await act('open', { c: cid });
    if (!r || !r.ok) { render(); return; }
    const win = r.item, big = C.TIERS.indexOf(tierOf(win.k)) >= 2;
    render();
    const strip = reelFill(cid, win);
    REEL.on = true;
    modal(`<h3>${C.COLS[cid].name}武器箱</h3><div class="ar-reel${C.COLS[cid].prem ? ' prem' : ''}"><div class="ar-strip" id="arStrip">${strip.map(x => `<div class="ar-rt" style="--tc:${tc(x.k)}"><img src="${art(x.k)}" alt=""><b>${escapeHTML(skinName(x.k))}</b></div>`).join('')}</div><i class="ar-mark"></i></div>
      <div class="row"><button class="ghost small" id="arSkip">跳过</button><label class="ar-fast"><input type="checkbox" id="arFast" ${skipAnim() ? 'checked' : ''}> 以后直接出结果</label></div>`, 'wide');
    $id('arFast').addEventListener('change', e => { try { localStorage.setItem('renying-arm-fast', e.target.checked ? '1' : '0'); } catch (err) {} });
    const el = $id('arStrip'), box = el.parentElement, mid = box.clientWidth / 2;
    const target = -(48 * CW + CW / 2 - mid) + Math.round((Math.random() - 0.5) * (CW - 24));
    let done = false, lastI = -1, raf = 0;
    const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); REEL.on = false; reveal(win, cid); };
    const land = () => {   // 停在保密以上：中间那一格先亮一下，再出结果
      if (done) return;
      if (!big) { setTimeout(finish, 450); return; }
      const t = el.children[48]; if (t) t.classList.add('win');
      box.classList.add('land'); box.style.setProperty('--wc', tc(win.k));
      try { SFX.shine ? SFX.shine() : SFX.chargeFull && SFX.chargeFull(); } catch (e) {}
      setTimeout(finish, 750);
    };
    const tick = () => {
      if (done) return;
      const m = getComputedStyle(el).transform, x = m && m !== 'none' ? +m.split(',')[4] : 0, i = Math.floor((mid - x) / CW);
      if (i !== lastI) { lastI = i; try { sNoise(0.012, 7000, 4000, 1, 0.1, 'highpass'); } catch (e) {} }
      raf = requestAnimationFrame(tick);
    };
    $id('arSkip').addEventListener('click', finish);
    if (skipAnim()) { finish(); return; }
    requestAnimationFrame(() => { el.style.transition = 'transform 6.2s cubic-bezier(0.06, 0.62, 0.1, 1)'; el.style.transform = `translateX(${target}px)`; raf = requestAnimationFrame(tick); });
    el.addEventListener('transitionend', land, { once: true });
  }
  function sting(k) {   // 越好的越响：非凡是一串铃音，隐秘、保密是锣
    const t = tierOf(k);
    try {
      if (t === 'gold') { playSting('legendary', true); SFX.sparkle && SFX.sparkle(); }
      else if (t === 'cov') { playSting('legendary', true); SFX.gong && SFX.gong(); }
      else if (t === 'cla') { SFX.gong && SFX.gong(); SFX.shine && SFX.shine(); }
      else SFX.chargeFull && SFX.chargeFull();
    } catch (e) {}
  }
  // 保密以上的揭晓：背后转着光、卡面扫过一道亮光、四周飘星点（越好的越多）
  function revealFx(lv) {
    if (lv < 2) return '';
    const n = [0, 0, 10, 16, 26][lv], dots = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = 90 + Math.random() * 120;
      dots.push(`<b style="--x:${Math.round(Math.cos(a) * r)}px;--y:${Math.round(Math.sin(a) * r * 0.8)}px;--d:${(Math.random() * 1.6).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.9).toFixed(2)}"></b>`);
    }
    return `<div class="ar-rvfx" aria-hidden="true"><i class="ar-rays"></i><i class="ar-burst"></i>${dots.join('')}</div>`;
  }
  function reveal(it, cid) {
    const t = tierOf(it.k), lv = C.TIERS.indexOf(t);
    sting(it.k);
    const again = cid && ST.cases[cid] > 0 && C.openLeft(ST, cid) > 0;
    modal(`<div class="ar-reveal t-${t}" style="--tc:${tc(it.k)}">${revealFx(lv)}<span class="ar-tier" style="--tc:${tc(it.k)}">${C.TIER[t].n}</span><div class="ar-rvart"><img src="${art(it.k)}" alt=""><i class="ar-shine"></i></div><h3>${escapeHTML(itemName(it))}</h3>
      ${it.st >= 0 ? '<p class="ar-stline">斩数版：穿着它每击倒一个对手，计数 +1</p>' : ''}<p>${colName(it.k)}武器箱 · 市场价 ${ink(C.price(it, today()))}</p></div>
      <div class="row"><button class="go small" id="arKeep">收下</button><button class="ghost small" id="arSee">检视</button>${again ? `<button class="ghost small" id="arAgain">再开一个</button>` : ''}</div>`, `rv t-${t}`);
    $id('arKeep').addEventListener('click', () => { closeModal(); render(); });
    $id('arSee').addEventListener('click', () => { closeModal(); const x = ST.inv.find(y => y.i === it.i); if (x) inspect(x, 'inv'); });
    if (again) $id('arAgain').addEventListener('click', () => { closeModal(); openCase(cid); });
  }

  // 终端机（照 CS2）：开封后一次报一件，买下就用掉；不要就换下一件，最多 5 件
  let TERM_FX = 0;   // 新的一件刚出来：卡面播一下“解码”的动画
  function pTerm() {
    const s = blankS(), tm = s.tm, d = today(), O = C.TERM.odds;
    const odds = `<div class="ar-todds">${C.TIERS.map(t => `<span style="--tc:${C.TIER[t].c}"><i></i>${C.TIER[t].n} ${pct(O[t])}</span>`).join('')}<span class="ar-st-chip">斩数版 ${pct(C.ST_P)}</span></div>`;
    let body;
    if (tm) {
      const o = tm.o, mk = C.price(o, d), left = C.TERM.offers - tm.n, fx = NOW() - TERM_FX < 1500;
      const diff = o.price / mk - 1;
      body = `<div class="ar-term${fx ? ' scan' : ''}" style="--tc:${tc(o.k)}">
        <div class="ar-termart"><img src="${art(o.k)}" alt="">${o.st >= 0 ? `<span class="ar-st">斩数 ${o.st}</span>` : ''}<i class="ar-scanline"></i></div>
        <div class="ar-terminfo"><span class="ar-k">终端机 · 第 ${tm.n} / ${C.TERM.offers} 件</span>
          <span class="ar-tier" style="--tc:${tc(o.k)}">${C.TIER[tierOf(o.k)].n}</span>
          <h3>${escapeHTML(itemName(o))}</h3>
          <p class="ar-note">${colName(o.k)}武器箱 · ${charName(o.k)}</p>
          <div class="ar-termprice"><span>报价</span>${ink(o.price)}</div>
          <p class="ar-note">市场价 ${ink(mk)}${Math.abs(diff) >= 0.005 ? `，${diff > 0 ? '贵' : '便宜'} ${Math.round(Math.abs(diff) * 100)}%` : ''}</p>
          <div class="ar-insbtns"><button type="button" class="go small" data-term="buy" ${live() ? '' : 'disabled'}>买下 ${ink(o.price)}</button><button type="button" class="ghost small" data-term="next" ${live() ? '' : 'disabled'}>${left ? `不要，换下一件（还能换 ${left} 次）` : '不要（这台终端机就没了）'}</button></div>
          <p class="ar-note" id="arTermLeft"></p></div></div>`;
    } else {
      const buy = cheapest('term', s);
      body = `<div class="ar-card ar-termseal"><span class="ar-termbox"><span>终</span></span><div><h3>终端机 <small>还有 ${s.term} 台没开封</small></h3>
        <p class="ar-note">${s.term ? '开封以后一次给你看一件饰品、报一个价：想要就买下，不要就换下一件，最多看 5 件。' : '终端机可以在江湖市场上买，每周补给、星章兑换也有，新手礼也送一台。'}</p></div>
        <div class="ar-termbtns"><button type="button" class="go small" data-term="unseal" ${s.term && live() ? '' : 'disabled'}>开封一台</button>${s.term ? '' : `<button type="button" class="ghost small" data-buyg="term" ${buy.left ? '' : 'disabled'}>${buy.left ? `买一台 ${ink(buy.p)}` : '今天卖完了'}</button>`}</div></div>`;
    }
    return `${body}<h4 class="ar-h">终端机报价的概率 <small>每件都从七个武器箱的全部饰品里抽（神兵武器箱的也有），价格是当天市场价的 1~1.3 倍</small></h4>${odds}
      <p class="ar-note">买下一件，这台终端机就用掉了；5 件都不要，终端机也没了。开封 ${C.TERM.days} 天内不处理会作废。没开封的终端机能在江湖市场上买卖。</p>`;
  }
  let TERM_TM = 0;
  function termTick() {   // 开着的终端机：显示还剩多久作废
    clearTimeout(TERM_TM);
    const el = $id('arTermLeft'); if (!el || !ST || !ST.tm) return;
    const ms = ST.tm.t0 + C.TERM.days * 86400e3 - NOW();
    if (ms <= 0) { ST.tm = null; render(); return; }
    const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60;
    el.textContent = `还剩 ${h >= 24 ? `${Math.floor(h / 24)} 天 ${h % 24} 小时` : h ? `${h} 小时 ${m} 分` : `${Math.max(1, m)} 分钟`}作废`;
    TERM_TM = setTimeout(termTick, 30000);
  }
  async function termAct(a) {
    if (a === 'unseal') { const r = await act('unseal', {}); if (r && r.ok) { TERM_FX = NOW(); SFX.chargeFull && SFX.chargeFull(); render(); } return; }
    const tm = ST && ST.tm; if (!tm) { render(); return; }
    if (a === 'buy') {
      const o = tm.o;
      confirmBox('买下这一件', `花 ${ink(o.price)} 买下「${escapeHTML(itemName(o))}」？买下以后这台终端机就用掉了。`, '买下', async () => {
        const r = await act('termBuy', { n: tm.n });
        if (r && r.ok) { render(); reveal(r.item); } else render();
      });
      return;
    }
    if (a === 'next') {
      const go = async () => {
        const r = await act('termNext', { n: tm.n });
        if (r && r.ok) { if (r.gone) toast('5 件都没要，这台终端机用完了'); else { TERM_FX = NOW(); SFX.slice && SFX.slice(); } }
        render();
      };
      if (tm.n >= C.TERM.offers) confirmBox('最后一件', '这是这台终端机的最后一件了。不要的话，终端机就没了。', '不要了', go);
      else go();
    }
  }

  // 江湖市场
  const MK = { view: 'items', tier: '', char: '', sort: 'hot' };
  function spark(k, w = 120, h = 34, days = 30, price = C.refPrice) {
    const d = today(), ys = []; for (let i = days - 1; i >= 0; i--) ys.push(price(k, d - i));
    const lo = Math.min(...ys), hi = Math.max(...ys), sp = hi - lo || 1;
    const pts = ys.map((y, i) => `${(i / (ys.length - 1) * w).toFixed(1)},${(h - 3 - (y - lo) / sp * (h - 6)).toFixed(1)}`).join(' ');
    const up = ys[ys.length - 1] >= ys[ys.length - 8];
    return `<svg class="ar-spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke-width="1.6"/></svg>`;
  }
  const chg = (k, price = C.refPrice) => { const d = today(), a = price(k, d - 7), b = price(k, d); return (b - a) / a; };
  const chgTag = c => `<span class="ar-chg ${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${(c * 100).toFixed(1)}%</span>`;
  const goodCol = k => k === 'term' ? '120,220,200' : C.COLS[k].col;
  const goodIcon = k => k === 'term' ? '<span class="ar-termbox sm"><span>终</span></span>' : `<span class="ar-casebox sm${C.COLS[k].prem ? ' prem' : ''}" style="--cc:${C.COLS[k].col}"><span>${C.COLS[k].emblem}</span></span>`;
  function chart(k, price, what) {   // 近 30 天的参考价
    const d = today(), ys = []; for (let i = 29; i >= 0; i--) ys.push(price(k, d - i));
    const W = 520, H = 150, lo = Math.min(...ys), hi = Math.max(...ys), sp = hi - lo || 1;
    const pts = ys.map((y, i) => `${(i / 29 * W).toFixed(1)},${(H - 14 - (y - lo) / sp * (H - 28)).toFixed(1)}`).join(' ');
    return `<div class="ar-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="近 30 天参考价"><polyline points="0,${H} ${pts} ${W},${H}" class="fill"/><polyline points="${pts}" class="line"/></svg><div class="ar-chartlbl"><span>30 天前</span><span>${what}：最高 ${fmt(hi)} · 最低 ${fmt(lo)} · 今天 ${fmt(ys[29])}</span><span>今天</span></div></div>`;
  }
  function pMarket() {
    const s = blankS(), d = today();
    const tabs = [['items', '饰品'], ['cases', '箱子'], ['mine', `我的挂单${s.lst.length ? ` (${s.lst.length})` : ''}`], ['hist', '成交记录']].map(([k, n]) => `<button type="button" data-mkv="${k}" class="${MK.view === k ? 'sel' : ''}">${n}</button>`).join('');
    let body = '';
    if (MK.view === 'items') {
      let keys = Object.keys(C.ITEM).filter(k => (!MK.tier || tierOf(k) === MK.tier) && (!MK.char || C.charOf(k) === MK.char));
      const lo = k => cheapest(k, s).p;
      const sorts = { hot: (a, b) => C.TIERS.indexOf(tierOf(b)) - C.TIERS.indexOf(tierOf(a)) || lo(b) - lo(a), up: (a, b) => chg(b) - chg(a), down: (a, b) => chg(a) - chg(b), cheap: (a, b) => lo(a) - lo(b) };
      keys = keys.sort(sorts[MK.sort] || sorts.hot);
      body = `<div class="ar-filter"><select id="arMkTier" class="ar-sel"><option value="">全部品质</option>${C.TIERS.map(t => `<option value="${t}" ${MK.tier === t ? 'selected' : ''}>${C.TIER[t].n}</option>`).join('')}</select>
        <select id="arMkChar" class="ar-sel"><option value="">全部侠客</option>${CHARS.map(c => `<option value="${c.id}" ${MK.char === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <select id="arMkSort" class="ar-sel">${[['hot', '品质高的在前'], ['up', '这周涨得多'], ['down', '这周跌得多'], ['cheap', '最便宜']].map(([k, n]) => `<option value="${k}" ${MK.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="ar-mklist">${keys.map(k => { const p = lo(k); return `<button type="button" class="ar-mkrow" data-mk="${k}" style="--tc:${tc(k)}"><img src="${art(k)}" alt="" loading="lazy"><span class="ar-mkn"><b>${escapeHTML(itemName({ k, st: -1 }))}</b><small>${C.TIER[tierOf(k)].n} · ${colName(k)}武器箱</small></span>${spark(k)}${chgTag(chg(k))}<span class="ar-mkp">${p ? `最低 ${ink(p)}` : '暂无在售'}</span></button>`; }).join('')}</div>`;
    } else if (MK.view === 'cases') {   // 武器箱和终端机：一键买最便宜的、直接卖给收购商，点“在售 / 挂单”看每一个
      body = `<div class="ar-mklist">${[...C.CASES.filter(c => C.COLS[c].prem), ...C.REG, 'term'].map(k => {
        const buy = cheapest(k, s), n = goodHave(s, k), mk = C.goodPrice(k, d);
        return `<div class="ar-mkrow static" style="--tc:${goodCol(k)}">${goodIcon(k)}<span class="ar-mkn"><b>${goodName(k)}</b><small>拥有 ${n} 个 · 今天在售 ${buy.left} 个${k !== 'term' && C.COLS[k].prem ? ' · 每周限开 1 个' : ''}</small></span>${spark(k, 120, 34, 30, C.goodPrice)}${chgTag(chg(k, C.goodPrice))}<span class="ar-mkp">${buy.left ? `最低 ${ink(buy.p)}` : '今天卖完了'}<small>市场价 ${fmt(mk)}</small></span>
          <span class="ar-mkbtns"><button type="button" class="go small" data-buyg="${k}" ${buy.left ? '' : 'disabled'}>买入</button><button type="button" class="ghost small" data-sellg="${k}" ${n ? '' : 'disabled'}>卖出 ${ink(C.quick(mk))}</button><button type="button" class="ghost small" data-mkg="${k}">在售 / 挂单</button></span></div>`;
      }).join('')}</div>
        <p class="ar-note">“买入”买的是今天在售里最便宜的那一个。开箱有次数限制（普通武器箱每天 ${C.OPEN_DAY} 个、神兵武器箱每周 ${C.PREM_WEEK} 个），买卖不限。</p>`;
    } else if (MK.view === 'mine') {
      body = s.lst.length ? `<div class="ar-mklist">${s.lst.map(L => {
        const g = L.g, mk = g ? C.goodPrice(g, d) : C.price(L.it, d), r = C.sellRate(L.price / mk);
        return `<div class="ar-mkrow static" style="--tc:${g ? goodCol(g) : tc(L.it.k)}">${g ? goodIcon(g) : `<img src="${art(L.it.k)}" alt="">`}<span class="ar-mkn"><b>${g ? goodName(g) : escapeHTML(itemName(L.it))}</b><small>挂于 ${new Date(L.t).toLocaleString()} · ${r <= 0 ? '标价太高，基本卖不掉' : '等人来买'}</small></span><span class="ar-mkp">标价 ${ink(L.price)}<small>到手 ${fmt(C.net(L.price))}</small></span><span class="ar-mkbtns"><button type="button" class="ghost small" data-cancel="${L.l}">撤下</button></span></div>`;
      }).join('')}</div>`
        : '<p class="ar-empty">没有挂单。在库存里点一件饰品选“挂单”，或者在“箱子”里点“在售 / 挂单”，就能自己定价卖。</p>';
    } else {
      body = s.hist.length ? `<div class="ar-hist">${s.hist.map(h => `<div class="ar-hrow"><span>${new Date(h.t).toLocaleString()}</span><span>${{ buy: '买入', sell: '卖出', sold: '挂单成交', term: '终端机买入' }[h.kind] || ''}</span><span>${h.g ? `${goodName(h.g)} ×${h.n}` : escapeHTML(itemName({ k: h.k, st: h.st }))}</span><span>${h.kind === 'buy' || h.kind === 'term' ? '−' : '+'}${fmt(h.gain || h.price)}</span></div>`).join('')}</div>` : '<p class="ar-empty">还没有成交记录。</p>';
    }
    return `<div class="ar-seg">${tabs}</div><p class="ar-note top">价格每天小幅浮动。在售的比市场价贵一点；直接卖出按市场价的 ${Math.round(C.BID * 100)}% 收，自己挂单最高标到 ${Math.round(C.LIST_MAX_R * 100)}%；成交扣 ${Math.round(C.FEE * 100)}% 手续费。</p>${body}`;
  }
  const buyBtn = (s, x) => { const sold = s.bought.ids.includes(x.l); return [sold, `<button type="button" class="go small" data-buyl="${x.l}" ${sold || !live() ? 'disabled' : ''}>${sold ? '已买' : '购买'}</button>`]; };
  function marketItem(k) {
    const s = blankS(), d = today(), L = C.listings(k, d);
    const mine = s.inv.filter(x => x.k === k);
    const row = (x, btn, gone) => `<div class="ar-lrow${gone ? ' gone' : ''}"><span>${x.st >= 0 ? `<b class="ar-stn">斩数 ${x.st}</b>` : '普通版'}</span><span>${ink(x.price !== undefined ? x.price : C.price(x, d))}</span>${btn}</div>`;
    modal(`<div class="ar-mkhead" style="--tc:${tc(k)}"><img src="${art(k)}" alt=""><div><span class="ar-tier" style="--tc:${tc(k)}">${C.TIER[tierOf(k)].n}</span><h3>${escapeHTML(itemName({ k, st: -1 }))}</h3><p class="ar-note">${colName(k)}武器箱 · 斩数版贵 ${Math.round((C.ST_MUL(tierOf(k)) - 1) * 100)}%</p></div></div>
      ${chart(k, C.refPrice, '参考价（普通版）')}
      <h4 class="ar-h">在售</h4><div class="ar-lst">${L.map(x => { const [sold, btn] = buyBtn(s, x); return row(x, btn, sold); }).join('')}</div>
      ${mine.length ? `<h4 class="ar-h">我库存里的这款</h4><div class="ar-lst">${mine.map(x => row(x, `<button type="button" class="ghost small" data-insp="${x.i}">卖出 / 检视</button>`)).join('')}</div>` : ''}
      <div class="row"><button class="ghost small" data-ar-close>关闭</button></div>`, 'wide');
  }
  function marketGood(k) {   // 一种箱子：今天在售的每一个、自己手上的直接卖或者挂单
    const s = blankS(), d = today(), L = C.listings(k, d), n = goodHave(s, k), mk = C.goodPrice(k, d), can = live();
    modal(`<div class="ar-mkhead" style="--tc:${goodCol(k)}">${goodIcon(k).replace(' sm', '')}<div><h3>${goodName(k)}</h3><p class="ar-note">拥有 ${n} 个 · 市场价 ${ink(mk)}${k === 'term' ? '' : C.COLS[k].prem ? ` · 每周限开 ${C.PREM_WEEK} 个` : ` · 普通武器箱每天一共能开 ${C.OPEN_DAY} 个`}</p></div></div>
      ${chart(k, C.goodPrice, '参考价')}
      <h4 class="ar-h">在售 <small>别的江湖人挂的，每天换一批</small></h4><div class="ar-lst">${L.map((x, i) => { const [sold, btn] = buyBtn(s, x); return `<div class="ar-lrow${sold ? ' gone' : ''}"><span>第 ${i + 1} 个</span><span>${ink(x.price)}</span>${btn}</div>`; }).join('')}</div>
      <h4 class="ar-h">卖出我的 <small>手上有 ${n} 个</small></h4>
      <div class="ar-insbtns"><button type="button" class="ghost small" data-sellg="${k}" ${n && can ? '' : 'disabled'}>直接卖出一个 ${ink(C.quick(mk))}</button><button type="button" class="ghost small" data-listg="${k}" ${n && can ? '' : 'disabled'}>挂单（自己定价）</button></div>
      <div class="row"><button class="ghost small" data-ar-close>关闭</button></div>`, 'wide');
  }

  // 汰换合同
  const TR = { tier: 'mil', sel: [] };
  function pTrade() {
    const s = blankS(), up = C.UP[TR.tier], need = C.NEED[TR.tier];
    TR.sel = TR.sel.filter(id => s.inv.some(x => x.i === id && tierOf(x.k) === TR.tier));
    const chk = TR.sel.length ? C.tradeCheck(s, TR.sel) : null;
    const selItems = TR.sel.map(id => s.inv.find(x => x.i === id));
    const stMode = selItems.length ? selItems[0].st >= 0 : null;
    const usable = x => tierOf(x.k) === TR.tier && (C.COLS[C.ITEM[x.k].col][up] || []).length && (stMode === null || (x.st >= 0) === stMode);
    const pool = s.inv.filter(x => tierOf(x.k) === TR.tier && !TR.sel.includes(x.i));
    const slots = []; for (let i = 0; i < need; i++) { const it = selItems[i]; slots.push(it ? `<button type="button" class="ar-slot on" data-unsel="${it.i}" style="--tc:${tc(it.k)}"><img src="${art(it.k)}" alt=""><small>${it.st >= 0 ? '斩数' : escapeHTML(colName(it.k))}</small></button>` : '<span class="ar-slot"></span>'); }
    const outs = chk && chk.outs ? chk.outs.map(o => `<div class="ar-out" style="--tc:${tc(o.k)}"><img src="${art(o.k)}" alt=""><b>${escapeHTML(skinName(o.k))}</b><small>${charName(o.k)} · ${(o.p * 100).toFixed(1)}%</small></div>`).join('') : '';
    return `<div class="ar-seg">${['mil', 'res', 'cla', 'cov'].map(t => `<button type="button" data-trt="${t}" class="${TR.tier === t ? 'sel' : ''}">${C.TIER[t].n} → ${C.TIER[C.UP[t]].n}</button>`).join('')}</div>
      <p class="ar-note top">放进 ${need} 件${C.TIER[TR.tier].n}饰品，换 1 件${C.TIER[up].n}。出什么取决于材料来自哪个武器箱；斩数版只能和斩数版一起换，换出来的也是斩数版。</p>
      <div class="ar-slots">${slots.join('')}</div>
      <div class="ar-trbar"><span>${TR.sel.length} / ${need}</span>${chk && chk.err && chk.full === undefined ? `<span class="ar-err">${chk.err}</span>` : ''}<button type="button" class="go small" id="arTradeGo" ${chk && chk.ok ? '' : 'disabled'}>签订合同</button><button type="button" class="ghost small" id="arTradeClr" ${TR.sel.length ? '' : 'disabled'}>清空</button></div>
      ${outs ? `<h4 class="ar-h">可能换到</h4><div class="ar-outs">${outs}</div>` : ''}
      <h4 class="ar-h">库存里的${C.TIER[TR.tier].n}饰品 <small>点一下放进合同</small></h4>
      ${pool.length ? `<div class="ar-grid sm">${pool.map(x => tile(x, usable(x) && TR.sel.length < need ? 'data-sel="1"' : 'disabled')).join('')}</div>` : '<p class="ar-empty">库存里没有这一档的饰品。</p>'}`;
  }

  // 江湖行动
  function supplyName(o) {
    if (o.t === 'case') return `${C.COLS[o.c].name}武器箱`;
    if (o.t === 'term') return '终端机';
    if (o.t === 'tag') return '改名标签';
    if (o.t === 'ink') return `${o.n} 墨锭`;
    return itemName({ k: o.k, st: -1 });
  }
  const SUP = { pick: [] };
  function pOp() {
    const s = blankS(), se = C.season(today()), left = se.end - today(), stars = s.op.earned - s.op.spent;
    const ms = s.op.ms.map((m, i) => {
      const prog = Math.min(m.n, s.op.prog[i] || 0), done = s.op.done.includes(i), D = C.MISSIONS[m.id];
      const name = D.t.replace('{n}', m.n).replace('{h}', m.h ? `「${CHARS[CHAR_IDX[m.h]].name}」` : '');
      return `<div class="trow"><span>${name}</span><div class="bar"><i style="width:${prog / m.n * 100}%"></i></div><span class="rw">${'★'.repeat(m.star)}</span><div><button data-mission="${i}" ${done || prog < m.n || !live() ? 'disabled' : ''}>${done ? '已领' : prog >= m.n ? '领星章' : `${prog}/${m.n}`}</button></div></div>`;
    }).join('');
    const opts = live() ? C.supplyOpts(UID, s.drop.w) : [];
    const ready = s.drop.g >= C.SUPPLY_GAMES;
    const sup = s.drop.sup ? '<p class="ar-note">这周的补给已经领了，下周一再来。</p>'
      : `<div class="ar-sup">${opts.map((o, i) => `<button type="button" class="ar-supo${SUP.pick.includes(i) ? ' sel' : ''}" data-sup="${i}" ${ready ? '' : 'disabled'} style="--tc:${o.t === 'item' ? tc(o.k) : o.t === 'term' ? '120,220,200' : '233,196,106'}">${o.t === 'item' ? `<img src="${art(o.k)}" alt="">` : `<span class="ar-supi">${{ case: '箱', term: '终', tag: '签', ink: '墨' }[o.t]}</span>`}<b>${escapeHTML(supplyName(o))}</b></button>`).join('')}</div>
        <div class="row"><button type="button" class="go small" id="arSupGo" ${ready && SUP.pick.length === 2 ? '' : 'disabled'}>领取这两样</button></div>`;
    const shop = C.STAR_SHOP.map(g => `<div class="ar-card ar-starg"><b>${g.name}</b><span class="ar-starc">${'★'.repeat(Math.min(g.cost, 5))}${g.cost > 5 ? ` ×${g.cost}` : ''}</span><button type="button" class="go small" data-star="${g.id}" ${stars >= g.cost && live() ? '' : 'disabled'}>${g.cost} 星章兑换</button></div>`).join('');
    return `<div class="ar-ophead"><div><span class="ar-k">江湖行动 · 第 ${se.k + 1} 季 · 剩 ${left} 天</span><h3>星章 <b>${stars}</b> <small>本季共得 ${s.op.earned}</small></h3></div><p class="ar-note">每周一换四个任务，完成拿星章，星章换武器箱、终端机、改名标签和饰品。</p></div>
      <h4 class="ar-h">本周任务</h4><div class="tlist">${ms || '<p class="ar-empty">登录之后才有任务。</p>'}</div>
      <h4 class="ar-h">每周补给 <small>${ready ? '已解锁：四样里挑两样' : `这周再打 ${C.SUPPLY_GAMES - s.drop.g} 局解锁（${s.drop.g}/${C.SUPPLY_GAMES}）`}</small></h4>${live() ? sup : ''}
      <h4 class="ar-h">星章兑换 <small>饰品都从普通武器箱里出，神兵武器箱的那 7 款换不到</small></h4><div class="ar-grid3">${shop}</div>
      <p class="ar-note">对局掉落：每局 ${Math.round(C.DROP_P * 100)}% 机会掉一件饰品或武器箱，每周最多 ${C.DROP_CAP} 次（本周已掉 ${s.drop.n} 次）。</p>`;
  }
  function covPick() {
    const list = C.ofTierReg('cov');   // 神兵武器箱的不能拿星章换
    modal(`<h3>自选一件隐秘饰品</h3><div class="ar-grid sm">${list.map(k => `<button type="button" class="ar-it" style="--tc:${tc(k)}" data-opcov="${k}"><img src="${art(k)}" alt=""><b>${escapeHTML(skinName(k))}</b><small>${charName(k)} · ${colName(k)}</small><i class="ar-bar"></i></button>`).join('')}</div><div class="row"><button class="ghost small" data-ar-close>取消</button></div>`, 'wide');
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $id('arTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; SFX.slice && SFX.slice(); TAB = b.dataset.tab; render(); $id('arMain').scrollTop = 0; });
    $id('arModal').addEventListener('click', async e => {
      if (e.target.closest('[data-ar-close]') || e.target === $id('arModal')) { if (!REEL.on) closeModal(); return; }
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.buyl) {
        const r = await act('buy', { l: b.dataset.buyl });
        if (r && r.ok) { SFX.wood && SFX.wood(); if (r.good) { toast(`买到了：${goodName(r.good)}`); marketGood(r.good); } else { toast(`买到了：${itemName(r.item)}`); marketItem(r.item.k); } render(); }
      }
      else if (b.dataset.sellg) sellGood(b.dataset.sellg);
      else if (b.dataset.listg) listBox(null, b.dataset.listg);
      else if (b.dataset.insp) { const it = ST.inv.find(x => x.i === +b.dataset.insp); closeModal(); if (it) inspect(it, 'inv'); }
      else if (b.dataset.opcov) { const r = await act('star', { id: 'cov', k: b.dataset.opcov }); if (r && r.ok) { closeModal(); reveal(r.item); render(); } }
    });
    $id('arIns').addEventListener('click', e => { if (e.target === $id('arIns')) { closeIns(); return; } const b = e.target.closest('[data-ins]'); if (b && !b.disabled) insAction(b.dataset.ins); });
    const main = $id('arMain');
    main.addEventListener('change', e => {
      const id = e.target.id, v = e.target.value;
      if (id === 'arInvChar') INV.char = v; else if (id === 'arInvTier') INV.tier = v; else if (id === 'arInvSort') INV.sort = v;
      else if (id === 'arMkTier') MK.tier = v; else if (id === 'arMkChar') MK.char = v; else if (id === 'arMkSort') MK.sort = v; else return;
      render();
    });
    main.addEventListener('keydown', e => { if (e.key === 'Escape') return; e.stopPropagation(); });   // 打字时别触发游戏的快捷键
    main.addEventListener('click', async e => {
      const pv = e.target.closest('[data-pv]');   // 武器箱里的饰品：点开预览
      if (pv) { inspect({ i: -1, k: pv.dataset.pv, st: -1, t: 0 }, 'pv'); return; }
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.gotab) { TAB = d.gotab; render(); return; }
      if (d.it && !d.sel) { const it = ST && ST.inv.find(x => x.i === +d.it); if (it) inspect(it, 'inv'); return; }
      if (d.mk) { marketItem(d.mk); return; }
      if (d.mkv) { MK.view = d.mkv; render(); return; }
      if (d.trt) { TR.tier = d.trt; TR.sel = []; render(); return; }
      if (d.sel) { TR.sel.push(+d.it); render(); return; }
      if (d.unsel) { TR.sel = TR.sel.filter(x => x !== +d.unsel); render(); return; }
      if (d.sup !== undefined) { const i = +d.sup; SUP.pick = SUP.pick.includes(i) ? SUP.pick.filter(x => x !== i) : [...SUP.pick, i].slice(-2); render(); return; }
      if (!live() && (MODE === 'old' || MODE === 'offline')) {   // 再问一次服务器：联网了、或者服务器更新好了，就刷新页面让人再点一次
        await connect(true);
        if (live()) { render(); msg('连上了，可以用了'); return; }
      }
      if (!live()) { msg(MODE === 'wait' ? '正在连接服务器，稍等一下' : MODE === 'offline' ? '连不上服务器，等联网了再试' : MODE === 'old' ? OLD_MSG : '登录之后才能用武库'); return; }
      if (d.open) { openCase(d.open); return; }
      if (d.term) { termAct(d.term); return; }
      if (d.buyg) { buyGood(d.buyg); return; }
      if (d.sellg) { sellGood(d.sellg); return; }
      if (d.mkg) { marketGood(d.mkg); return; }
      if (d.cancel) { const r = await act('cancel', { l: d.cancel }); if (r && r.ok) { toast('已撤下，放回库存'); render(); } return; }
      if (d.collect) { const r = await act('collect', { c: d.collect }); if (r && r.ok) { SFX.gong && SFX.gong(); toast(`集齐奖励：${C.COLS[d.collect].name}武器箱 +1，改名标签 +1`); render(); } return; }
      if (d.mission !== undefined) { const r = await act('mission', { m: +d.mission }); if (r && r.ok) { SFX.chargeFull && SFX.chargeFull(); toast(`星章 +${r.star}`); render(); } return; }
      if (d.star) {
        if (d.star === 'cov') { covPick(); return; }
        const r = await act('star', { id: d.star });
        if (r && r.ok) { if (r.item) reveal(r.item); else toast('兑换成功'); render(); }
        return;
      }
      if (d.store) { confirmBox('买改名标签', `花 ${ink(C.STORE[0].cost)} 买一张改名标签？每周最多买 ${C.STORE[0].lim} 张。`, '购买', buyTag); return; }
      if (b.id === 'arGift') { const r = await act('gift', {}); if (r && r.ok) { SFX.gong && SFX.gong(); toast('新手礼：初刃武器箱 +1，终端机 +1'); render(); } return; }
      if (b.id === 'arTradeGo') { tradeGo(); return; }
      if (b.id === 'arTradeClr') { TR.sel = []; render(); return; }
      if (b.id === 'arSupGo') { const r = await act('supply', { picks: SUP.pick }); if (r && r.ok) { SUP.pick = []; SFX.gong && SFX.gong(); const it = r.got.find(x => x.t === 'item'); if (it) reveal(it.item); else toast('补给到手'); render(); } return; }
    });
  }
  function tradeGo() {
    const s = ST, chk = C.tradeCheck(s, TR.sel); if (!chk.ok) { msg(chk.err); return; }
    confirmBox('签订汰换合同', `这 ${TR.sel.length} 件${C.TIER[chk.tier].n}饰品会被收走，换 1 件${C.TIER[chk.up].n}。确定吗？`, '签订', async () => {
      const r = await act('trade', { ids: TR.sel });
      if (r && r.ok) { TR.sel = []; reveal(r.item); render(); }
    });
  }

  /* ---------- 打开武库 ---------- */
  let POLL = 0;
  async function openArmory(tab) {
    if (tab) TAB = tab;
    ensurePortraits();
    render();
    await connect(false);
    if (MODE === 'server') { try { apply(await ECON('sync', {})); } catch (e) {} }
    else if (MODE === 'local' && ST) { const env = envBase(), sold = C.settle(ST, env); if (sold.length) apply({ state: ST, ink: env.ink, sold }); }
    render();
    clearInterval(POLL);
    POLL = setInterval(() => { if (!$id('armory').classList.contains('on')) { clearInterval(POLL); return; } if (!BUSY && !REEL.on) act('sync', {}, { bg: true }).then(() => { if (!BUSY && !REEL.on && $id('arModal').hidden && $id('arIns').hidden) render(); }); }, 60000);
  }
  window.openArmory = openArmory;
  bind();
  document.addEventListener('keydown', e => {   // Esc 关掉弹窗 / 检视
    if (e.key !== 'Escape' || !$id('armory').classList.contains('on')) return;
    if (!$id('arModal').hidden) { if (!REEL.on) closeModal(); }
    else if (INS) closeIns();
  });
  // 检视用的小舞台：一直在，打开检视时才画
  demoLoop($id('arInsCv'), () => INS ? CHARS.findIndex(c => c.id === C.charOf(INS.it.k)) : -1, () => !$id('arIns').hidden && !!INS, () => INS ? INS.it.k : '', () => null);
  (function leaveWatch() {   // 离开武库就收起检视和弹窗（开箱滚轮转完再收）
    if (!$id('armory').classList.contains('on')) {
      if (INS) closeIns();
      if (!REEL.on && !$id('arModal').hidden) closeModal();
    }
    requestAnimationFrame(leaveWatch);
  })();

  /* ---------- 接到游戏里 ---------- */
  // 存档同步的回执：墨锭按服务器的账走；服务器拿掉 / 补上的皮肤照着改
  let CAP_TOAST = 0;
  if (CS && CS.onLedger) CS.onLedger((L, fix, capped, owed) => {
    const before = Math.floor(PROF.ink || 0), v = LSYNC(L, before);
    if (v > before) GRANT(v - before);
    PROF.ink = v;
    if (fix) {
      const set = new Set(PROF.skins || []);
      for (const k of fix.skinsAdd || []) set.add(k);
      for (const k of fix.skinsDel || []) { set.delete(k); for (const [c, x] of Object.entries(PROF.equip || {})) if (x === k) delete PROF.equip[c]; }
      PROF.skins = Array.from(set);
      if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
      try { applySkins(); } catch (e) {}
    }
    if (capped > 0 && NOW() - CAP_TOAST > 10 * 60000) {   // 十分钟最多提醒一次
      CAP_TOAST = NOW();
      toast(owed > 0 ? `墨锭收入超过今天的额度，${capped} 先记着，之后补上` : `墨锭收入超过今天的额度，${capped} 没有计入`);   // 额度：每天 1500 + 每局对战 80
    }
    for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
    try { renderTopNav(); } catch (e) {}
  });
  const baseApply = applyProfile;
  applyProfile = function (p) {
    if (p && p !== PROF && typeof p === 'object') {
      const u = user(), uid = u ? String(u.uid || u.name || '') : '';
      if (uid !== UID || p.guest) { ST = null; MODE = 'none'; UID = uid; }
      if (!p.guest && !('armory' in p) && MODE !== 'server') loadLocal(undefined);
    }
    const r = baseApply.apply(this, arguments);
    if (p && p !== PROF && !PROF.guest && cloudOn() && MODE !== 'server') connect(false).then(() => { if ($id('armory').classList.contains('on')) render(); });
    try { if (p && p !== PROF && $id('armory').classList.contains('on')) render(); } catch (e) {}
    return r;
  };
  window.applyProfile = applyProfile;
  // 斩数：这局里自己的侠客每击倒一个对手记一笔（按侠客分开记，车轮战换人也不乱）。重算、预演的不算
  let KO = {};
  const baseHitVisual = hitVisual;
  hitVisual = function (ev, quiet) {
    try {
      if (ev && ev.ko && !quiet && !RESIM && ev.a === localIdx() && C.MODES.includes(M.mode)) {
        const f = fighterByIdx(ev.a), id = f && f.ch && f.ch.id;
        if (id) KO[id] = (KO[id] || 0) + 1;
      }
    } catch (e) {}
    return baseHitVisual.apply(this, arguments);
  };
  // 开局领一张票（服务器用来判断这局是不是真打了）
  const baseStartRound = startRound;
  startRound = function () {
    if (M.round === 1) KO = {};
    const r = baseStartRound.apply(this, arguments);
    try {
      const mode = M.mode;
      if (MODE === 'server' && C.MODES.includes(mode) && !M.watchAi && !(typeof isAiVsAi === 'function' && isAiVsAi()) && (!TK || NOW() - TK > 40 * 60000)) { TK = NOW(); ECON('matchStart', { mode }).catch(() => { TK = 0; }); }
    } catch (e) {}
    return r;
  };
  // 一局打完：斩数、行动任务、每周补给进度、掉落
  const baseTaskEnd = taskMatchEnd;
  taskMatchEnd = function (w) {
    const r = baseTaskEnd.apply(this, arguments);
    try { matchEnd(w); } catch (e) { console.warn('armory match end', e); }
    return r;
  };
  async function matchEnd(w) {
    const el = $id('endArm'); if (el) el.innerHTML = '';
    const ko = KO; KO = {};
    if (!live() || PROF.guest || OFFLINE_BUILD || REPLAY.on) return;
    if (!C.MODES.includes(M.mode) || M.watchAi || (typeof isAiVsAi === 'function' && isAiVsAi())) return;
    const me = typeof localTeam === 'function' ? localTeam() : 0, f = M.mode === 'net' ? [A, B][localIdx()] : A;
    const wins = M.wins || [0, 0], win = w >= 0 && w === me;
    const ctx = { mode: M.mode, level: M.level || '', char: f && f.ch ? f.ch.id : '', win, flawless: win && !(wins[1 - me] || 0), combo: MSTAT.maxcombo || 0, ults: MSTAT.ults || 0, ko };
    TK = 0;
    const res = await act('matchEnd', { ctx }, { bg: true });
    if (!res || !res.ok) return;
    const notes = [];
    for (const x of res.st || []) notes.push(`斩数 +${x.add}（${escapeHTML(skinName(x.k))} 共 ${x.total}）`);
    if (res.drop) notes.push(res.drop.t === 'case' ? `掉落：${C.COLS[res.drop.c].name}武器箱` : `<span style="color:rgb(${tc(res.drop.item.k)})">掉落：${escapeHTML(itemName(res.drop.item))}</span>`);
    if (ST.drop.g === C.SUPPLY_GAMES && !ST.drop.sup) notes.push('每周补给已解锁，去武库领');
    if (res.drop) { SFX.chargeFull && SFX.chargeFull(); }
    if (el && notes.length) el.innerHTML = notes.join(' · ');
  }
  const baseTopNav = renderTopNav;
  renderTopNav = function () {
    const r = baseTopNav.apply(this, arguments);
    try { const b = document.querySelector('#topNav [data-nav="armory"]'); if (b) b.classList.toggle('tn-dot', !!dots().any); } catch (e) {}
    return r;
  };
  // game.js 先载入，那时首页角色和头像是按不认识武库皮肤画的：这里重画一次
  redrawLooks();
  // 本机模式：存档每秒对一次校验，绕过这里直接改的会被发现
  setInterval(() => {
    if (MODE !== 'local' || !ST) return;
    if (sigOf(ST) !== SIG) { strike('武库数据被篡改'); loadLocal(undefined); render(); }
  }, 1000);
})();
