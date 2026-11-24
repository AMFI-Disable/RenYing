Object.assign(ULTS, {
  // ---- 炽霄 · 大招 E：炽霄焚天（skyfall） ----
  skyfall: { name: '炽霄焚天', desc: '腾跃至半空连掷五道爆裂烈焰火流星轰击敌方各层，随即火戟贯地爆开焚天火环与飞石，造成范围击飞与持续灼烧。',
    begin(f, foe) {
      f.sp = 'rise'; f.spN = 0; f.vy = -720; f.vx = -f.face * 120; f.plat = -1;
      f.spPose = 'qf_charge'; f.invul = 0.55; SFX.heavy();
    },
    update(f, foe) {
      if (f.sp === 'rise') {
        f.vy = damp(f.vy, 0, 8, STEP); f.vx = damp(f.vx, 0, 10, STEP);
        if (f.spN < 5 && f.t >= 0.12 + f.spN * 0.095) {
          const pool = isMulti() ? foesOf(f).filter(ef => ef && !ef.hidden && ef.hp > 0) : [foe];
          const tg = pool.length ? pool[f.spN % pool.length] : foe;
          const tx = tg ? tg.x + (f.spN - 2) * 52 : f.x + f.face * (140 + f.spN * 55);
          const ty = tg ? tg.y - 44 : f.y;
          const dx = tx - f.x, dy = ty - (f.y - 60), d = Math.hypot(dx, dy) || 1;
          spawnProj(f, { kind: 'fire', x: f.x + f.face * 24, y: f.y - 60, vx: (dx / d) * 1240, vy: (dy / d) * 1240, w: 56, h: 50, life: 0.8, dmg: 26, kb: [160, -260], stun: 0.36, hs: 0.06, burn: true, aoeR: 95, aoeMul: 0.65, ult: true, noScale: true, unbreakable: true });
          if (!RESIM) ring(f.x + f.face * 24, f.y - 60, 78, '255,115,55', 0.3);
          SFX.swing(); f.spN++;
        }
        if (f.t >= 0.62) { f.sp = 'plunge'; f.t = 0; f.vx = f.face * 360; f.vy = 1220; f.spPose = 'qf_thrust'; SFX.dash(); }
      } else if (f.sp === 'plunge') {
        f.vy += GRAV * STEP;
        const targetY = foe ? Math.max(f.y, gndY(foe)) : 0;
        if (f.y >= targetY || f.y >= 0 || f.t >= 0.36) {
          f.sp = 'burst'; f.t = 0; f.vx = 0; f.vy = 0; f.hitDone = false;
          if (!RESIM) {
            shake = Math.max(shake, 22); flashA = 0.34; flashRGB = '255,120,60';
            ring(f.x, f.y - 30, 235, '255,115,65', 0.48); dust(f.x, f.y, 20);
            if (typeof debrisBurst === 'function') debrisBurst(f.x, f.y, 12, '195,95,55');
            SFX.ko();
          }
          const hitTargets = findTargetsInRadius(f, f.x, f.y - 50, 230, 140);
          for (let i = 0; i < hitTargets.length; i++) {
            const tf = hitTargets[i];
            const mul = multiTargetScale(i);
            applyHit(f, tf, { dmg: Math.round(76 * mul), kb: [380, -680], stun: 0.65, hs: 0.16, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: tf.x >= f.x ? 1 : -1 }, [tf.x, tf.y - 50]);
            tf.burnT = Math.max(tf.burnT || 0, 3.5);
          }
        }
      } else if (f.sp === 'burst' && f.t >= 0.38) endSpecial(f);
    } },
});
