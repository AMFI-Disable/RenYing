Object.assign(ULTS, {
  // ---- 炽霄 · 大招 E：炽霄焚天（skyfall） ----
  skyfall: { name: '炽霄焚天', desc: '腾跃至半空连掷四道烈焰火流星轰击敌方所在层，随即火戟贯地爆开焚天火环，造成范围击飞与持续灼烧。',
    begin(f, foe) {
      f.sp = 'rise'; f.spN = 0; f.vy = -680; f.vx = -f.face * 120; f.plat = -1;
      f.spPose = 'qf_charge'; f.invul = 0.5; SFX.heavy();
    },
    update(f, foe) {
      if (f.sp === 'rise') {
        f.vy = damp(f.vy, 0, 8, STEP); f.vx = damp(f.vx, 0, 10, STEP);
        if (f.spN < 4 && f.t >= 0.14 + f.spN * 0.11) {
          const tx = foe ? foe.x + (f.spN - 1.5) * 65 : f.x + f.face * (140 + f.spN * 55);
          const ty = foe ? foe.y - 40 : f.y;
          const dx = tx - f.x, dy = ty - (f.y - 60), d = Math.hypot(dx, dy) || 1;
          spawnProj(f, { kind: 'fire', x: f.x + f.face * 24, y: f.y - 60, vx: (dx / d) * 1180, vy: (dy / d) * 1180, w: 54, h: 48, life: 0.72, dmg: 26, kb: [160, -260], stun: 0.36, hs: 0.06, burn: true, ult: true, noScale: true, unbreakable: true });
          if (!RESIM) ring(f.x + f.face * 24, f.y - 60, 72, '255,110,55', 0.3);
          SFX.swing(); f.spN++;
        }
        if (f.t >= 0.62) { f.sp = 'plunge'; f.t = 0; f.vx = f.face * 340; f.vy = 1150; f.spPose = 'qf_thrust'; SFX.dash(); }
      } else if (f.sp === 'plunge') {
        f.vy += GRAV * STEP;
        const targetY = foe ? Math.max(f.y, gndY(foe)) : 0;
        if (f.y >= targetY || f.y >= 0 || f.t >= 0.36) {
          f.sp = 'burst'; f.t = 0; f.vx = 0; f.vy = 0; f.hitDone = false;
          if (!RESIM) { shake = Math.max(shake, 20); flashA = 0.32; flashRGB = '255,120,60'; ring(f.x, f.y - 30, 210, '255,115,65', 0.48); dust(f.x, f.y, 20); SFX.ko(); }
          for (const tf of isMulti() ? foesOf(f) : [foe]) {
            if (!tf || tf.hp <= 0 || tf.invul > 0 || Math.abs(tf.x - f.x) > 210 || Math.abs(tf.y - f.y) > 120) continue;
            applyHit(f, tf, { dmg: 76, kb: [380, -680], stun: 0.65, hs: 0.16, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: tf.x >= f.x ? 1 : -1 }, [tf.x, tf.y - 50]);
            tf.burnT = Math.max(tf.burnT || 0, 3.5);
          }
        }
      } else if (f.sp === 'burst' && f.t >= 0.38) endSpecial(f);
    } },
});
