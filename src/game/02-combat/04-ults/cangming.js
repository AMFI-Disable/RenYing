Object.assign(ULTS, {
  // ---- 苍冥 · 大招 E：冥蚀断渊（eclipsecleave） ----
  eclipsecleave: { name: '冥蚀断渊', desc: '释放渊蚀引力将附近敌手牵引至剑锋之前，随即一记不可格挡的断渊斩月横扫斩落，重创架势并远距击飞。',
    begin(f) {
      f.sp = 'pull'; f.spN = 0; f.vx = 0; f.spPose = 'ts_lift'; f.invul = 0.65;
      if (!RESIM) { ring(f.x, f.y - 64, 240, '165,115,255', 0.48); SFX.charge(); }
    },
    update(f, foe) {
      if (f.sp === 'pull') {
        for (const tf of isMulti() ? foesOf(f) : [foe]) {
          if (!tf || tf.hp <= 0 || tf.invul > 0 || Math.abs(tf.x - f.x) > 340 || Math.abs(tf.y - f.y) > 130) continue;
          const pullX = clamp(f.x + f.face * 86, WALL + 20, STAGE_W - WALL - 20);
          tf.x = damp(tf.x, pullX, 11, STEP);
        }
        if (f.t >= 0.34) {
          f.sp = 'cleave'; f.t = 0; f.spPose = 'ts_slam'; f.hitDone = false;
          if (!RESIM) { shake = Math.max(shake, 24); flashA = 0.36; flashRGB = '175,115,255'; slashLine(f.x + f.face * 95, f.y - 68, -0.25 * f.face, '185,125,255'); ring(f.x + f.face * 95, f.y - 64, 210, '175,115,255', 0.45); SFX.ko(); }
          for (const tf of isMulti() ? foesOf(f) : [foe]) {
            if (!tf || tf.hp <= 0 || tf.invul > 0 || Math.abs(tf.x - (f.x + f.face * 95)) > 175 || Math.abs(tf.y - f.y) > 120) continue;
            applyHit(f, tf, { dmg: 155, kb: [520, -640], stun: 0.72, hs: 0.2, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [tf.x, tf.y - 58]);
          }
          spawnProj(f, { kind: 'wind', x: f.x + f.face * 90, y: f.y - 62, vx: f.face * 1050, vy: 0, w: 96, h: 118, life: 0.55, dmg: 55, kb: [380, -340], stun: 0.45, hs: 0.1, ult: true, noScale: true, unbreakable: true });
        }
      } else if (f.sp === 'cleave' && f.t >= 0.42) endSpecial(f);
    } },
});
