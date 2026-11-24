Object.assign(ULTS, {
  // ---- 灵犀 · 大招 E：心音幻境（spiritdomain） ----
  spiritdomain: { name: '心音幻境', desc: '吹奏灵犀心音释放四圈递进扩散的音波结界，粉碎敌方飞行物、削减架势并施加迟缓，同时为附近队友充能真气。',
    begin(f) {
      f.sp = 'play'; f.spN = 0; f.vx = 0; f.spPose = 'yx_play'; f.invul = 0.6;
      for (const m of sideFighters(fighterTeam(f))) {
        if (m !== f && !m.hidden && m.hp > 0 && Math.abs(m.x - f.x) < 620) m.meter = Math.min(100, (m.meter || 0) + 22);
      }
      SFX.superOn();
    },
    update(f, foe) {
      if (f.spN < 4 && f.t >= 0.14 + f.spN * 0.16) {
        const rad = 140 + f.spN * 68, last = f.spN === 3;
        if (!RESIM) { ring(f.x, f.y - 60, rad, '135,230,255', 0.42); SFX.parry(); }
        for (const p of projs) {
          if (p.owner !== f.idx && !p.dead && !p.ult && !p.unbreakable && Math.hypot(p.x - f.x, p.y - (f.y - 60)) < rad) p.dead = true;
        }
        for (const tf of isMulti() ? foesOf(f) : [foe]) {
          if (!tf || tf.hp <= 0 || invulVs(tf, f) || Math.hypot(tf.x - f.x, tf.y - f.y) > rad) continue;
          tf.slowT = Math.max(tf.slowT || 0, 2.0);
          tf.guard = Math.max(0, (tf.guard || 0) - 22);
          applyHit(f, tf, { dmg: last ? 58 : 28, kb: [last ? 420 : 120, last ? -520 : -140], stun: last ? 0.6 : 0.32, hs: last ? 0.14 : 0.05, launch: last, unblockable: last, ult: true, noScale: true, big: last, dir: tf.x >= f.x ? 1 : -1 }, [tf.x, tf.y - 54]);
        }
        f.spN++;
      }
      if (f.t >= 0.92) endSpecial(f);
    } },
});
