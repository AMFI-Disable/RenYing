Object.assign(ULTS, {
  // ---- 幽冥 · 大招 E：永夜绝斩（nightmarecut） ----
  nightmarecut: { name: '永夜绝斩', desc: '遁入永夜幽影隐身瞬移至目标背后（精准跨层锁定），挥出不可格挡的镰影绝斩，对低血量目标触发高额斩杀！',
    begin(f) {
      f.sp = 'vanish'; f.vx = 0; f.vy = 0; f.spPose = 'fy_blink'; f.invul = 0.72;
      if (!RESIM) { smoke(f.x, f.y - 54, 16); ring(f.x, f.y - 54, 110, '185,95,255', 0.4); SFX.poof(); }
    },
    update(f, foe) {
      if (f.sp === 'vanish' && f.t >= 0.28) {
        f.sp = 'reap'; f.t = 0; f.spPose = 'qf_thrust'; f.snap = true;
        if (foe && foe.hp > 0) {
          const behind = -foe.face || -1;
          f.x = clamp(foe.x + behind * 76, WALL + 20, STAGE_W - WALL - 20);
          if (foe.plat >= 0 && typeof mapPutOn === 'function') mapPutOn(f, foe.plat);
          else { f.y = foe.y; f.plat = foe.plat; }
          f.face = foe.x >= f.x ? 1 : -1;
          if (!RESIM) { shake = Math.max(shake, 22); flashA = 0.38; flashRGB = '195,95,255'; slashLine(foe.x, foe.y - 58, -0.5 * f.face, '200,105,255'); slashLine(foe.x, foe.y - 58, 0.5 * f.face, '255,220,255'); SFX.ko(); }
          if (foe.invul <= 0) {
            const lowBonus = foe.hp < foe.maxHp * 0.35 ? 1.32 : 1;
            applyHit(f, foe, { dmg: Math.round(145 * lowBonus), kb: [460, -560], stun: 0.72, hs: 0.2, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [foe.x, foe.y - 56]);
            if (lowBonus > 1 && !RESIM) addP({ type: 'text', text: '☠ 永夜斩杀!', x: foe.x, y: foe.y - 126, life: 1.0, max: 1.0, rgb: '220,120,255' });
          }
        }
      } else if (f.sp === 'reap' && f.t >= 0.42) {
        f.snap = false; endSpecial(f);
      }
    } },
});
