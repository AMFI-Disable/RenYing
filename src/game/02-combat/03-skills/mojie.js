Object.assign(SKILLS, {
  // ---- 墨绝 · Q：断魂墨缚（inkbind） ----
  inkbind: { name: '断魂墨缚', cd: 5.5, desc: '挥毫在敌足下布下断魂墨阵，踏入者陷入禁锢硬直并被墨意迟缓。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.14) {
        f.skPh = 1; f.t = 0; SFX.poof();
        for (const p of projs) if (p.kind === 'trap' && p.owner === f.idx) p.dead = true;
        const tx = clamp(f.x + f.face * clamp(Math.abs(foe.x - f.x), 85, 290), WALL, STAGE_W - WALL);
        if (!RESIM) ring(tx, -12, 90, '180,142,255', 0.35);
        spawnProj(f, { kind: 'trap', x: tx, y: -6, vx: 0, w: 120, h: 30, life: 4.5, delay: 0.2, dmg: 38, kb: [0, 0], stun: 0.52, hs: 0.08, root: true, slow: 1.8, groundOnly: true });
      }
      if (f.skPh === 1 && f.t >= 0.24) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 26] : ['my_paint', 44],
    ai: (me, foe, d) => d > 85 && d < 350 && !projs.some(p => p.kind === 'trap' && p.owner === me.idx) },
  // ---- 墨绝 · R：镇魂敕符（sealscript） ----
  sealscript: { name: '镇魂敕符', cd: 5, desc: '凌空疾书镇魂墨敕，射出一道追踪墨气符波压制中远距离对手。',
    start(f) { f.vx *= 0.25; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) {
        f.skPh = 1; f.t = 0; SFX.swing();
        if (!RESIM) ring(f.x + f.face * 42, f.y - 70, 86, '180,142,255', 0.32);
        spawnProj(f, { kind: 'qi', x: f.x + f.face * 44, y: f.y - 68, vx: f.face * 940, autoAim: true, w: 68, h: 68, life: 0.65, dmg: 44, kb: [200, -220], stun: 0.44, hs: 0.08, slow: 1.5 });
      }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 28] : ['my_paint', 52],
    ai: (me, foe, d) => d > 130 && d < 420 },
});
