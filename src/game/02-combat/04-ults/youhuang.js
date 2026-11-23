Object.assign(ULTS, {
  // ---- 幽篁 · 大招 E：千缕重叠（thicket） ----
  thicket: { name: '千缕重叠', desc: '掷出碧竹阵符，沿对手所在层依次破土而出五道翠竹枪阵，连续穿刺挑飞敌众并重置自身闪避与技能冷却。',
    begin(f, foe) {
      f.sp = 'cast'; f.spN = 0; f.vx = 0; f.spPose = 'my_paint'; f.invul = 0.45;
      f.thBaseX = foe ? foe.x : f.x + f.face * 220;
      f.thBaseY = foe ? gndY(foe) : f.y;
      SFX.swing();
    },
    update(f, foe) {
      if (f.spN < 5 && f.t >= 0.1 + f.spN * 0.11) {
        const px = clamp(f.thBaseX + (f.spN - 2) * 84, WALL + 30, STAGE_W - WALL - 30);
        const py = f.thBaseY;
        spawnProj(f, { kind: 'bolt', x: px, y: py - 110, groundY: py, vx: 0, vy: 0, w: 64, h: 220, life: 0.34, delay: 0.05, dmg: 34, kb: [f.face * 120, -620], stun: 0.48, hs: 0.07, launch: true, unblockable: f.spN === 4, ult: true, noScale: true, unbreakable: true, small: true });
        if (!RESIM) { ring(px, py - 10, 88, '80,225,150', 0.34); dust(px, py, 8); SFX.slice(); }
        f.spN++;
      }
      if (f.t >= 0.85) {
        f.dashCD = 0; f.skillCD = Math.max(0, f.skillCD - 2.5);
        endSpecial(f);
      }
    } },
});
