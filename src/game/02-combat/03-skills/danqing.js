Object.assign(SKILLS, {
  // ---- 丹青 · Q：朱砂画弧（vermilionarc） ----
  vermilionarc: { name: '朱砂画弧', cd: 5, desc: '挥动丹青大笔划出朱砂弧光，挥出远程丹青气波压制并减速对手。',
    start(f) { f.vx *= 0.3; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) {
        f.skPh = 1; f.t = 0; SFX.swing();
        if (!RESIM) ring(f.x + f.face * 40, f.y - 66, 86, '245,105,80', 0.28);
        spawnProj(f, { kind: 'qi', x: f.x + f.face * 44, y: f.y - 68, vx: f.face * 860, autoAim: true, w: 78, h: 78, life: 0.68, dmg: 46, kb: [200, -210], stun: 0.4, hs: 0.08, slow: 1.5 });
      }
      if (f.skPh === 1 && f.t >= 0.27) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 26] : ['my_paint', 52],
    ai: (me, foe, d) => d > 130 && d < 420 },
  // ---- 丹青 · R：青绿封卷（cinnabarward） ----
  cinnabarward: { name: '青绿封卷', cd: 6, desc: '落笔在对手脚下布下青绿画阵，触发后定身困敌并造成伤害。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; f.t = 0; SFX.poof();
        const tx = clamp(f.x + f.face * clamp(Math.abs(foe.x - f.x), 90, 270), WALL, STAGE_W - WALL);
        const ty = foe && Math.abs(foe.x - f.x) < 320 ? gndY(foe) : f.y;
        if (!RESIM) ring(tx, ty - 10, 118, '56,152,200', 0.36);
        spawnProj(f, { kind: 'trap', x: tx, y: ty - 6, groundY: ty, vx: 0, w: 120, h: 32, life: 4.5, delay: 0.2, dmg: 38, kb: [0, 0], stun: 0.52, hs: 0.08, root: true, groundOnly: true });
      }
      if (f.skPh === 1 && f.t >= 0.26) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 24] : ['my_paint', 44],
    ai: (me, foe, d) => d > 95 && d < 300 },
});
