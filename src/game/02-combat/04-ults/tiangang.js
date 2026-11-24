Object.assign(ULTS, {
  // ---- 天罡 · 大招 E：天罡破军（heavenbreaker） ----
  heavenbreaker: { name: '天罡破军', desc: '架枪聚罡轰出贯通全场的破军星罡长虹，沿途穿透所有敌手并强破格挡，激起连环罡气枪爆震飞敌军。',
    begin(f) {
      f.sp = 'charge_spear'; f.spN = 0; f.vx = 0; f.spPose = 'ls_thrust'; f.invul = 0.55;
      f.armorT = 1.2; f.armorHits = 2;
      if (!RESIM) { ring(f.x + f.face * 36, f.y - 62, 120, '255,210,115', 0.4); SFX.charge(); }
    },
    update(f, foe) {
      if (f.spN === 0 && f.t >= 0.24) {
        f.spN = 1; f.vx = -f.face * 180;
        if (!RESIM) {
          shake = Math.max(shake, 22); flashA = 0.34; flashRGB = '255,220,130';
          addP({ type: 'beam', x: f.x + f.face * 30, y: f.y - 62, x2: f.x + f.face * 760, y2: f.y - 62, w: 30, life: 0.28, max: 0.28, rgb: '255,215,120' });
          slashLine(f.x + f.face * 240, f.y - 62, 0, '255,215,120'); SFX.ko();
        }
        spawnProj(f, { kind: 'wave', x: f.x + f.face * 55, y: f.y - 62, vx: f.face * 1720, vy: 0, w: 155, h: 86, life: 0.78, dmg: 135, kb: [560, -480], stun: 0.68, hs: 0.18, launch: true, pierce: true, maxHits: 8, rehit: 0.45, aoeR: 95, aoeMul: 0.55, unblockable: true, ult: true, noScale: true, unbreakable: true, rgb: '255,215,120' });
      }
      if (f.t >= 0.72) endSpecial(f);
    } },
});
