Object.assign(ULTS, {
  // ---- 玄武 · 大招 E：玄武镇岳（tortoiseslam） ----
  tortoiseslam: { name: '玄武镇岳', desc: '化出玄甲龟盾蓄势护体，恢复全部架势并获强效霸体，随即向当前层引爆三连镇岳震波，强破格挡并击飞近敌。',
    begin(f) {
      f.sp = 'brace'; f.spN = 0; f.vx = 0; f.spPose = 'ts_shoulder'; f.invul = 0.5;
      f.guard = f.maxGuard || 100; f.armorT = 2.6; f.armorHits = 4;
      if (!RESIM) { ring(f.x, f.y - 58, 130, '110,195,255', 0.45); SFX.charge(); }
    },
    update(f, foe) {
      if (f.spN < 3 && f.t >= 0.24 + f.spN * 0.16) {
        const rad = 155 + f.spN * 52;
        f.spPose = 'ts_slam';
        if (!RESIM) { shake = Math.max(shake, 16 + f.spN * 4); ring(f.x, f.y - 24, rad, '110,205,255', 0.42); dust(f.x, f.y, 16); if (typeof debrisBurst === 'function') debrisBurst(f.x, f.y, 10, '110,205,255'); SFX.thud(); }
        let hitIdx = 0;
        for (const tf of isMulti() ? foesOf(f) : [foe]) {
          if (!tf || tf.hp <= 0 || invulVs(tf, f) || Math.abs(tf.x - f.x) > rad || Math.abs(tf.y - f.y) > 120) continue;
          const last = f.spN === 2;
          const sc = typeof multiTargetScale === 'function' ? multiTargetScale(hitIdx++) : 1;
          applyHit(f, tf, { dmg: Math.max(1, Math.round((last ? 68 : 38) * sc)), kb: [last ? 420 : 180, last ? -640 : -220], stun: last ? 0.65 : 0.35, hs: hitIdx === 1 ? (last ? 0.16 : 0.07) : 0.03, launch: last, unblockable: last, ult: true, noScale: true, big: last && hitIdx === 1, dir: tf.x >= f.x ? 1 : -1 }, [tf.x, tf.y - 50]);
        }
        f.spN++;
      }
      if (f.t >= 0.88) endSpecial(f);
    } },
});
