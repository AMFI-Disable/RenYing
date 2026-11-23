Object.assign(ULTS, {
  // ---- 赤炎 · 大招 E：焚天乱舞（infernorush） ----
  infernorush: { name: '焚天乱舞', desc: '燃起赤炎罡气突进轰拳，命中后立刻接升龙烈拳将敌轰上高空，再跃起回身炎肘重砸引爆烈焰灼烧。',
    begin(f) {
      f.sp = 'charge_in'; f.spN = 0; f.vx = f.face * 1280; f.vy = 0; f.spPose = 'lm_boxer'; f.invul = 0.55; f.hitDone = false;
      SFX.dash();
    },
    update(f, foe) {
      if (f.sp === 'charge_in') {
        if (!RESIM && Math.random() < 0.6) addP({ type: 'spark', x: f.x - f.face * 20, y: f.y - 54, vx: -f.face * 240, vy: rand(-60, 60), life: 0.24, max: 0.24, rgb: '255,110,55', w: 2.5 });
        for (const tf of isMulti() ? foesOf(f) : [foe]) {
          if (!tf || tf.hp <= 0 || tf.invul > 0 || Math.abs(tf.x - f.x) > 105 || Math.abs(tf.y - f.y) > 95) continue;
          f.sp = 'upper'; f.t = 0; f.vx = f.face * 160; f.vy = -780; f.plat = -1; f.spPose = 'lm_upper';
          applyHit(f, tf, { dmg: 65, kb: [160, -760], stun: 0.6, hs: 0.14, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [tf.x, tf.y - 54]);
          tf.burnT = Math.max(tf.burnT || 0, 3.0);
          if (!RESIM) { ring(tf.x, tf.y - 50, 140, '255,105,50', 0.42); SFX.heavy(); }
          return;
        }
        if (f.t >= 0.3) { f.sp = 'miss'; f.t = 0; f.vx *= 0.25; }
      } else if (f.sp === 'upper') {
        f.vy += GRAV * 0.7 * STEP;
        if (f.t >= 0.28) {
          f.sp = 'slam'; f.t = 0; f.vx = f.face * 220; f.vy = 980; f.spPose = 'ts_slam'; f.hitDone = false;
          SFX.heavy();
        }
      } else if (f.sp === 'slam') {
        f.vy += GRAV * STEP;
        const floor = gndY(f);
        if (f.y >= floor || f.y >= 0 || f.t >= 0.34) {
          f.sp = 'done'; f.t = 0; f.vx = 0; f.vy = 0;
          if (!RESIM) { shake = Math.max(shake, 22); flashA = 0.34; flashRGB = '255,115,55'; ring(f.x, f.y - 24, 195, '255,110,55', 0.45); dust(f.x, f.y, 18); SFX.ko(); }
          for (const tf of isMulti() ? foesOf(f) : [foe]) {
            if (!tf || tf.hp <= 0 || tf.invul > 0 || Math.abs(tf.x - f.x) > 195 || Math.abs(tf.y - f.y) > 130) continue;
            applyHit(f, tf, { dmg: 85, kb: [420, -480], stun: 0.65, hs: 0.18, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: tf.x >= f.x ? 1 : -1 }, [tf.x, tf.y - 48]);
            tf.burnT = Math.max(tf.burnT || 0, 3.5);
          }
        }
      } else if ((f.sp === 'done' && f.t >= 0.32) || (f.sp === 'miss' && f.t >= 0.3)) endSpecial(f);
    } },
});
