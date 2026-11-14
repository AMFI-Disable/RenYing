Object.assign(ULTS, {
  // ---- 月华 · 大招 E：月华如水（moonflow） ----
  moonflow: { name: '月华如水', desc: '双手结月印，盘坐入定。月华凝露，回复 135 点生命；月芒震退贴身之敌（75 伤害）。绽放触发【太阴化生】：重置月镜架招与月轮回旋冷却，并获得 4 秒月魄霸体护盾（格挡硬直减伤）。',
    begin(f) {
      f.sp = 'wave'; f.spPose = 'yh_lotus'; f.invul = 0.5; f.hp = Math.min(f.maxHp, f.hp + Math.round(100 * HERO_HP_SCALE)); f.hitDone = false;
      f.skillCD = 0; f.skill2CD = 0; f.armorT = 4.0; f.armorHits = 3;
      ring(f.x, f.y - 60, 260, f.look.slash, 0.5); ring(f.x, f.y - 60, 180, '255,255,255', 0.4);
      addP({ type: 'text', text: `+${Math.round(100 * HERO_HP_SCALE)}`, x: f.x, y: f.y - 130, life: 0.9, max: 0.9, rgb: '180,255,200' });
      addP({ type: 'text', text: '🌙 月魄霸体 · 架招重置', x: f.x, y: f.y - 150, life: 1.1, max: 1.1, rgb: '215,195,255' });
      SFX.chargeFull();
    },
    update(f, foe) {
      if (f.t >= 0.1 && !f.hitDone) {
        f.hitDone = true;
        if (Math.abs(foe.x - f.x) < 280 && Math.abs(foe.y - f.y) < 220 && foe.invul <= 0)
          applyHit(f, foe, { dmg: 75, kb: [460, -640], stun: 0.6, hs: 0.15, launch: true, big: true, ult: true, noScale: true, dir: foe.x >= f.x ? 1 : -1 }, [foe.x, foe.y - 60]);
      }
      if (f.t >= 0.55) endSpecial(f);
    } },
});
