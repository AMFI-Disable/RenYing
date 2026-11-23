Object.assign(ULTS, {
  // ---- 金鹏 · 大招 E：鹏程万里（roctempest） ----
  roctempest: { name: '鹏程万里', desc: '金翅振空直冲云霄锁定敌手，以雷霆俯冲砸向目标所在层，激起双向金色飓风横扫战场。',
    begin(f, foe) {
      f.sp = 'ascend'; f.vy = -1020; f.vx = 0; f.plat = -1; f.spPose = 'yl_spread'; f.invul = 0.7;
      f.jpX = foe ? foe.x : f.x + f.face * 240;
      f.jpY = foe ? gndY(foe) : f.y;
      SFX.dash();
    },
    update(f, foe) {
      if (f.sp === 'ascend') {
        if (foe && foe.hp > 0) { f.jpX = damp(f.jpX, foe.x, 8, STEP); f.jpY = gndY(foe); }
        f.x = damp(f.x, f.jpX, 5, STEP);
        f.vy = damp(f.vy, 0, 8, STEP);
        if (f.t >= 0.34) {
          f.sp = 'dive'; f.t = 0; f.spPose = 'a2';
          const dx = f.jpX - f.x, dy = f.jpY - f.y, d = Math.hypot(dx, dy) || 1;
          f.vx = (dx / d) * 1420; f.vy = Math.max(920, (dy / d) * 1420);
          SFX.heavy();
        }
      } else if (f.sp === 'dive') {
        if (f.y >= f.jpY || f.y >= 0 || f.t >= 0.38) {
          f.sp = 'gust'; f.t = 0; f.y = Math.min(0, f.jpY); f.vx = 0; f.vy = 0;
          if (!RESIM) { shake = Math.max(shake, 24); flashA = 0.35; flashRGB = '255,215,105'; ring(f.x, f.y - 24, 210, '255,215,105', 0.48); dust(f.x, f.y, 22); SFX.ko(); }
          for (const tf of isMulti() ? foesOf(f) : [foe]) {
            if (!tf || tf.hp <= 0 || tf.invul > 0 || Math.abs(tf.x - f.x) > 190 || Math.abs(tf.y - f.y) > 125) continue;
            applyHit(f, tf, { dmg: 115, kb: [380, -680], stun: 0.65, hs: 0.18, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: tf.x >= f.x ? 1 : -1 }, [tf.x, tf.y - 52]);
          }
          for (const sd of [-1, 1]) spawnProj(f, { kind: 'wind', x: f.x + sd * 36, y: f.y - 58, groundY: f.y, vx: sd * 1020, vy: 0, w: 86, h: 96, life: 0.65, dmg: 38, kb: [360, -340], stun: 0.42, hs: 0.08, launch: true, ult: true, noScale: true, unbreakable: true });
        }
      } else if (f.sp === 'gust' && f.t >= 0.36) endSpecial(f);
    } },
});
