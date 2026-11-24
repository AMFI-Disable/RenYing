Object.assign(ULTS, {
  // ---- 霸王 · 大招 E：力拔山兮（conquerorslam） ----
  conquerorslam: { name: '力拔山兮', desc: '披甲悍然冲阵擒拿敌手高举过顶，再以万钧之势反身重摔贯地，引发当前层巨震波破防击飞周身全部敌军！',
    begin(f) {
      f.sp = 'rush'; f.vx = f.face * 1120; f.vy = 0; f.spPose = 'ts_shoulder'; f.invul = 0.6; f.bwVictimIdx = -1;
      SFX.dash();
    },
    update(f, foe) {
      if (f.sp === 'rush') {
        for (const tf of isMulti() ? foesOf(f) : [foe]) {
          if (!tf || tf.hp <= 0 || invulVs(tf, f) || Math.abs(tf.x - f.x) > 105 || Math.abs(tf.y - f.y) > 95) continue;
          f.sp = 'hoist'; f.t = 0; f.vx = 0; f.bwVictimIdx = tf.idx; f.spPose = 'ts_lift';
          tf.state = 'held'; tf.t = 0; tf.vx = 0; tf.vy = 0; tf.move = null; tf.skill = null; tf.sp = null;
          SFX.heavy(); return;
        }
        if (f.t >= 0.34) { f.sp = 'slam_empty'; f.t = 0; f.vx = 0; f.spPose = 'ts_slam'; }
      } else if (f.sp === 'hoist') {
        const v = f.bwVictimIdx >= 0 ? fighterByIdx(f.bwVictimIdx) : null;
        if (v && v.hp > 0 && v.state === 'held') { v.x = f.x + f.face * 18; v.y = f.y - 98; }
        if (f.t >= 0.34) {
          f.sp = 'slam'; f.t = 0; f.spPose = 'ts_slam';
          if (!RESIM) { shake = Math.max(shake, 26); flashA = 0.38; flashRGB = '255,195,85'; ring(f.x + f.face * 48, f.y - 16, 225, '255,195,85', 0.5); dust(f.x + f.face * 48, f.y, 26); if (typeof debrisBurst === 'function') debrisBurst(f.x + f.face * 48, f.y, 14, '255,195,85'); SFX.ko(); }
          if (v && v.hp > 0) {
            v.x = clamp(f.x + f.face * 56, WALL + 20, STAGE_W - WALL - 20);
            if (f.plat >= 0 && typeof mapPutOn === 'function') mapPutOn(v, f.plat); else { v.y = f.y; v.plat = f.plat; }
            applyHit(f, v, { dmg: 165, kb: [420, -680], stun: 0.78, hs: 0.22, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [v.x, v.y - 40]);
          }
          let splashIdx = 1;
          for (const tf of isMulti() ? foesOf(f) : [foe]) {
            if (!tf || tf === v || tf.hp <= 0 || invulVs(tf, f) || Math.abs(tf.x - f.x) > 225 || Math.abs(tf.y - f.y) > 120) continue;
            const sc = typeof multiTargetScale === 'function' ? multiTargetScale(splashIdx++) : 1;
            applyHit(f, tf, { dmg: Math.max(1, Math.round(85 * sc)), kb: [380, -520], stun: 0.55, hs: 0.08, launch: true, unblockable: true, ult: true, noScale: true, dir: tf.x >= f.x ? 1 : -1 }, [tf.x, tf.y - 45]);
          }
        }
      } else if (f.sp === 'slam_empty' && f.t >= 0.28) {
        endSpecial(f);
      } else if (f.sp === 'slam' && f.t >= 0.42) {
        f.bwVictimIdx = -1; endSpecial(f);
      }
    } },
});
