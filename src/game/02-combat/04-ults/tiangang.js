Object.assign(ULTS, {
  // ---- 天罡 · 大招 E：天罡破军（heavenbreaker） ----
  heavenbreaker: { name: '天罡破军', desc: '架枪聚罡轰出贯通全场的破军枪芒，沿途穿透所有敌手并强破格挡，末端引爆罡气枪爆震飞敌军。',
    begin(f) {
      f.sp = 'charge_spear'; f.spN = 0; f.vx = 0; f.spPose = 'ls_thrust'; f.invul = 0.55;
      f.armorT = 1.2; f.armorHits = 2;
      if (!RESIM) { ring(f.x + f.face * 36, f.y - 62, 110, '255,210,115', 0.4); SFX.charge(); }
    },
    update(f, foe) {
      if (f.spN === 0 && f.t >= 0.24) {
        f.spN = 1; f.vx = -f.face * 180;
        if (!RESIM) { shake = Math.max(shake, 20); flashA = 0.32; flashRGB = '255,220,130'; slashLine(f.x + f.face * 240, f.y - 62, 0, '255,215,120'); SFX.ko(); }
        spawnProj(f, { kind: 'wind', x: f.x + f.face * 50, y: f.y - 62, vx: f.face * 1650, vy: 0, w: 145, h: 78, life: 0.72, dmg: 135, kb: [560, -480], stun: 0.68, hs: 0.18, launch: true, pierce: true, maxHits: 5, unblockable: true, ult: true, noScale: true, unbreakable: true });
      }
      if (f.t >= 0.72) endSpecial(f);
    } },
});
