Object.assign(ULTS, {
  // ---- 无涯 · 大招 E：剑气无涯（endlessblade） ----
  endlessblade: { name: '剑气无涯', desc: '纳刀入鞘蓄势瞬拔，一闪横穿四百六十像素斩断虚空，收刀瞬间沿途触发三段延迟空间剑爆，不可格挡！',
    begin(f) {
      f.sp = 'sheathe'; f.vx = 0; f.vy = 0; f.spPose = 'qf_charge'; f.invul = 0.65;
      f.wyStartX = f.x; f.wyY = f.y; f.wyBurst = false;
      if (!RESIM) { ring(f.x, f.y - 56, 95, '235,245,255', 0.4); SFX.charge(); }
    },
    update(f, foe) {
      if (f.sp === 'sheathe' && f.t >= 0.28) {
        f.sp = 'flash'; f.t = 0; f.spPose = 'qf_thrust'; f.snap = true;
        const endX = clamp(f.wyStartX + f.face * 460, WALL + 20, STAGE_W - WALL - 20);
        f.x = endX;
        const lo = Math.min(f.wyStartX, endX) - 35, hi = Math.max(f.wyStartX, endX) + 35;
        if (!RESIM) {
          for (let k = 0; k < 5; k++) slashLine(lerp(f.wyStartX, endX, k / 4), f.wyY - 58, 0, '235,248,255');
          flashA = 0.34; flashRGB = '235,248,255'; SFX.slice();
        }
        for (const tf of isMulti() ? foesOf(f) : [foe]) {
          if (!tf || tf.hp <= 0 || tf.invul > 0 || tf.x < lo || tf.x > hi || Math.abs(tf.y - f.wyY) > 105) continue;
          applyHit(f, tf, { dmg: 55, kb: [0, 0], stun: 0.55, hs: 0.1, root: true, unblockable: true, ult: true, noScale: true, dir: f.face }, [tf.x, tf.y - 58]);
        }
      } else if (f.sp === 'flash' && f.t >= 0.24 && !f.wyBurst) {
        f.wyBurst = true; f.snap = false;
        const lo = Math.min(f.wyStartX, f.x) - 45, hi = Math.max(f.wyStartX, f.x) + 45;
        if (!RESIM) {
          shake = Math.max(shake, 22); flashA = 0.36; flashRGB = '255,255,255';
          for (let k = 0; k < 3; k++) {
            const bx = lerp(f.wyStartX, f.x, (k + 0.5) / 3);
            ring(bx, f.wyY - 58, 125, '220,240,255', 0.42);
            slashLine(bx, f.wyY - 58, (k - 1) * 0.55, '255,255,255');
          }
          SFX.ko();
        }
        for (const tf of isMulti() ? foesOf(f) : [foe]) {
          if (!tf || tf.hp <= 0 || tf.invul > 0 || tf.x < lo || tf.x > hi || Math.abs(tf.y - f.wyY) > 120) continue;
          applyHit(f, tf, { dmg: 105, kb: [440, -620], stun: 0.72, hs: 0.2, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [tf.x, tf.y - 58]);
        }
      } else if (f.sp === 'flash' && f.t >= 0.56) endSpecial(f);
    } },
});
