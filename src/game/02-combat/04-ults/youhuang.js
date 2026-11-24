Object.assign(ULTS, {
  // ---- 幽篁 · 大招 E：千缕重叠（thicket） ----
  thicket: { name: '千缕重叠', desc: '掷出碧竹阵符，沿对手所在层依次破土而出五道翠竹枪阵并齐射漫天毒针，连续穿刺挑飞敌众并重置自身闪避与技能冷却。',
    begin(f, foe) {
      f.sp = 'cast'; f.spN = 0; f.vx = 0; f.spPose = 'my_paint'; f.invul = 0.45;
      f.thBaseX = foe ? foe.x : f.x + f.face * 220;
      f.thBaseY = foe ? gndY(foe) : f.y;
      SFX.swing();
    },
    update(f, foe) {
      if (f.spN < 5 && f.t >= 0.09 + f.spN * 0.11) {
        const px = clamp(f.thBaseX + (f.spN - 2) * 88, WALL + 30, STAGE_W - WALL - 30);
        const py = f.thBaseY;
        spawnProj(f, { kind: 'bolt', x: px, y: py - 110, groundY: py, vx: 0, vy: 0, w: 70, h: 230, life: 0.36, delay: 0.05, dmg: 34, kb: [f.face * 120, -620], stun: 0.48, hs: 0.07, launch: true, unblockable: f.spN === 4, ult: true, noScale: true, unbreakable: true, small: true, pierce: true, rehit: 0.45, rgb: '85,235,155' });
        for (const sd of [-1, 1]) {
          spawnProj(f, { kind: 'dart', x: px, y: py - 70, vx: sd * 980, vy: -220, w: 30, h: 16, life: 0.55, dmg: 14, kb: [80, -100], stun: 0.24, hs: 0.03, pierce: true, rehit: 0.4, ult: true, noScale: true, unbreakable: true, rgb: '100,245,165' });
        }
        if (!RESIM) { ring(px, py - 10, 92, '80,225,150', 0.34); dust(px, py, 8); SFX.slice(); }
        f.spN++;
      }
      if (f.t >= 0.85) {
        f.dashCD = 0; f.skillCD = Math.max(0, f.skillCD - 2.5);
        endSpecial(f);
      }
    } },
});
