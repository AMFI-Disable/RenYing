Object.assign(ULTS, {
  // ---- 墨劫 · 大招 E：绝墨魂卷（abyssscroll） ----
  abyssscroll: { name: '绝墨魂卷', desc: '在敌方所在层展开绝墨判魂大阵，先定身迟缓并大幅削减架势，随即引爆漫天浓墨吞噬阵中敌手。',
    begin(f, foe) {
      f.sp = 'seal'; f.spN = 0; f.vx = 0; f.spPose = 'my_paint'; f.invul = 0.5;
      f.mjX = clamp(foe ? foe.x : f.x + f.face * 240, WALL + 60, STAGE_W - WALL - 60);
      f.mjY = foe ? gndY(foe) : f.y;
      if (!RESIM) { ring(f.mjX, f.mjY - 12, 165, '160,115,255', 0.48); SFX.poof(); }
    },
    update(f, foe) {
      if (f.spN === 0 && f.t >= 0.2) {
        f.spN = 1;
        for (const tf of isMulti() ? foesOf(f) : [foe]) {
          if (!tf || tf.hp <= 0 || invulVs(tf, f) || Math.abs(tf.x - f.mjX) > 175 || Math.abs(tf.y - f.mjY) > 110) continue;
          tf.slowT = Math.max(tf.slowT || 0, 2.5);
          tf.guard = Math.max(0, (tf.guard || 0) - 45);
          applyHit(f, tf, { dmg: 38, kb: [0, 0], stun: 0.55, hs: 0.08, root: true, unblockable: true, ult: true, noScale: true, dir: f.face }, [tf.x, tf.y - 50]);
        }
      }
      if (f.spN === 1 && f.t >= 0.58) {
        f.spN = 2;
        if (!RESIM) { shake = Math.max(shake, 22); flashA = 0.34; flashRGB = '170,120,255'; ring(f.mjX, f.mjY - 40, 225, '170,120,255', 0.5); dust(f.mjX, f.mjY, 22); SFX.ko(); }
        for (const tf of isMulti() ? foesOf(f) : [foe]) {
          if (!tf || tf.hp <= 0 || invulVs(tf, f) || Math.abs(tf.x - f.mjX) > 210 || Math.abs(tf.y - f.mjY) > 140) continue;
          applyHit(f, tf, { dmg: 115, kb: [340, -680], stun: 0.72, hs: 0.18, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: tf.x >= f.mjX ? 1 : -1 }, [tf.x, tf.y - 56]);
        }
      }
      if (f.t >= 0.92) endSpecial(f);
    } },
});
