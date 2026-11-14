Object.assign(SKILLS, {
  // ---- 墨羽 · Q：墨阵（inktrap） ----
  inktrap: { name: '墨阵', cd: 5.2, desc: '提笔画出一池宽 115 像素的墨阵。踏入者陷入【深墨禁锢】（0.48 秒定身 + 2.8 秒迟缓）；再按 Q 可随时引爆。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.16) {
        f.skPh = 1; SFX.poof();
        for (const p of projs) if (p.kind === 'trap' && p.owner === f.idx) p.dead = true;
        spawnProj(f, { kind: 'trap', x: clamp(f.x + f.face * clamp(Math.abs(foeOf(f).x - f.x), 80, 260), WALL, STAGE_W - WALL), y: -6, vx: 0, w: 115, h: 28, life: 5.0, delay: 0.22, dmg: 35, kb: [0, 0], stun: 0.48, hs: 0.07, root: true, groundOnly: true });
      }
      if (f.skPh === 1 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 24] : ['my_paint', 40],
    ai: (me, foe, d) => d > 80 && d < 340 && !projs.some(p => p.kind === 'trap' && p.owner === me.idx) },
  // ---- 墨羽 · R（右键）：画符（inksplash） ----
  inksplash: { name: '画符', cd: 2.5, can: f => (f.ink || 0) >= INK_COST * FU_INK && (f.fu || 0) < FU_MAX, lack: f => (f.fu || 0) >= FU_MAX ? '符已画满' : '墨不够', desc: `提笔画一张符，花 ${FU_INK} 格墨水，符条 +1（最多 ${FU_MAX} 张）。符攒着给大招用，攒得越多大招越痛。`,
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.2) {
        f.skPh = 1; f.ink -= INK_COST * FU_INK; f.fu = Math.min(FU_MAX, (f.fu || 0) + 1); SFX.swing();
        ring(f.x + f.face * 30, f.y - 120, 40, '235,200,90', 0.35);
        addP({ type: 'text', text: `画符 · ${f.fu}/${FU_MAX}`, x: f.x, y: f.y - 140, life: 0.8, max: 0.8, rgb: '235,200,90' });
      }
      if (f.skPh === 1 && f.t >= 0.4) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 26] : ['my_paint', 50], ai: (m, o, d) => d > 260 && (m.fu || 0) < FU_MAX && (m.ink || 0) >= INK_COST * (FU_INK + 1) },   // 电脑留一格墨甩墨团，墨不够就不去画
});
