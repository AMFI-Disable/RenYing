Object.assign(ULTS, {
  // ---- 金鹏 · 大招 E：鹏程万里（roctempest） ----
  roctempest: { name: '鹏程万里', desc: '金翅振空直冲云霄，齐射八道贯穿金羽箭矢封锁多层空域，随即雷霆俯冲砸向敌阵所在层，激起碎石与双向金色飓风横扫全场。',
    begin(f, foe) {
      f.sp = 'ascend'; f.vy = -1120; f.vx = 0; f.plat = -1; f.spPose = 'yl_spread'; f.invul = 0.75;
      f.jpX = foe ? foe.x : f.x + f.face * 240;
      f.jpY = foe ? gndY(foe) : f.y;
      f.jpVolley = false;
      SFX.dash();
    },
    update(f, foe) {
      if (f.sp === 'ascend') {
        if (foe && foe.hp > 0) { f.jpX = damp(f.jpX, foe.x, 8, STEP); f.jpY = gndY(foe); }
        f.x = damp(f.x, f.jpX, 5, STEP);
        f.vy = damp(f.vy, 0, 8, STEP);
        if (!f.jpVolley && f.t >= 0.16) {
          f.jpVolley = true;
          for (let k = 0; k < 8; k++) {
            const ang = Math.PI * 0.15 + (k / 7) * Math.PI * 0.7;
            spawnProj(f, { kind: 'arrow', x: f.x, y: f.y - 50, vx: Math.cos(ang) * 1240, vy: Math.sin(ang) * 1240, w: 36, h: 20, life: 0.9, dmg: 18, kb: [140, -180], stun: 0.28, hs: 0.04, pierce: true, rehit: 0.4, ult: true, noScale: true, unbreakable: true, rgb: '255,215,95' });
          }
          if (!RESIM) ring(f.x, f.y - 50, 150, '255,215,95', 0.32);
          SFX.slice();
        }
        if (f.t >= 0.36) {
          f.sp = 'dive'; f.t = 0; f.spPose = 'a2';
          const dx = f.jpX - f.x, dy = f.jpY - f.y, d = Math.hypot(dx, dy) || 1;
          f.vx = (dx / d) * 1500; f.vy = Math.max(960, (dy / d) * 1500);
          SFX.heavy();
        }
      } else if (f.sp === 'dive') {
        if (f.y >= f.jpY || f.y >= 0 || f.t >= 0.38) {
          f.sp = 'gust'; f.t = 0; f.y = Math.min(0, f.jpY); f.vx = 0; f.vy = 0;
          if (!RESIM) {
            shake = Math.max(shake, 24); flashA = 0.35; flashRGB = '255,215,105';
            ring(f.x, f.y - 24, 230, '255,215,105', 0.48); dust(f.x, f.y, 22);
            if (typeof debrisBurst === 'function') debrisBurst(f.x, f.y, 12, '185,150,80');
            SFX.ko();
          }
          strikeAoE(f, f.x, f.y - 52, 220, 130, { dmg: 115, kb: [380, -680], stun: 0.65, hs: 0.18, launch: true, unblockable: true, ult: true, noScale: true, big: true });
          for (const sd of [-1, 1]) spawnProj(f, { kind: 'wind', x: f.x + sd * 36, y: f.y - 58, groundY: f.y, vx: sd * 1080, vy: 0, w: 94, h: 102, life: 0.7, dmg: 38, kb: [360, -340], stun: 0.42, hs: 0.08, launch: true, ult: true, noScale: true, unbreakable: true, pierce: true, rehit: 0.45 });
        }
      } else if (f.sp === 'gust' && f.t >= 0.36) endSpecial(f);
    } },
});
