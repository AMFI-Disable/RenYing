Object.assign(ULTS, {
  // ---- 丹青 · 大招 E：千里江山（grandpainting） ----
  grandpainting: { name: '千里江山', desc: '挥毫展卷泼洒朱砂青绿千里江山图，在目标所在层依次涌起三座墨峰画浪席卷全场，挑飞并压制沿途所有敌手。',
    begin(f, foe) {
      f.sp = 'paint'; f.spN = 0; f.vx = 0; f.spPose = 'my_paint'; f.invul = 0.55;
      f.dqY = foe ? gndY(foe) : f.y;
      if (!RESIM) { ring(f.x + f.face * 60, f.y - 68, 140, '240,105,85', 0.45); SFX.poof(); }
    },
    update(f, foe) {
      if (f.spN < 3 && f.t >= 0.16 + f.spN * 0.18) {
        const last = f.spN === 2;
        const wx = clamp(f.x + f.face * (110 + f.spN * 145), WALL + 40, STAGE_W - WALL - 40);
        spawnProj(f, { kind: 'dragon', x: wx, y: f.dqY - 68, groundY: f.dqY, vx: f.face * 760, vy: 0, w: 112, h: 136, life: 0.72, dmg: last ? 68 : 42, kb: [last ? 440 : 220, last ? -640 : -420], stun: last ? 0.65 : 0.4, hs: last ? 0.16 : 0.08, launch: true, pierce: true, maxHits: 2, unblockable: last, ult: true, noScale: true, unbreakable: true });
        if (!RESIM) { ring(wx, f.dqY - 24, 125, f.spN % 2 === 0 ? '240,100,80' : '75,210,175', 0.4); dust(wx, f.dqY, 14); SFX.heavy(); }
        f.spN++;
      }
      if (f.t >= 0.88) endSpecial(f);
    } },
});
