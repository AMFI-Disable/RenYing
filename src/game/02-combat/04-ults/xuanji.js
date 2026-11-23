Object.assign(ULTS, {
  // ---- 玄玑 · 大招 E：星宿归元（celestial） ----
  celestial: { name: '星宿归元', desc: '布下北斗七星天枢阵，七道星辉自高空跨层追踪齐射敌手，同时为自身及附近队友回复气血与满架势。',
    begin(f, foe) {
      f.sp = 'cast'; f.spN = 0; f.vx = 0; f.spPose = 'yx_play'; f.invul = 0.55;
      for (const m of sideFighters(fighterTeam(f))) {
        if (!m.hidden && m.hp > 0 && Math.abs(m.x - f.x) < 520) {
          m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.08));
          m.guard = m.maxGuard || 100;
        }
      }
      if (!RESIM) { ring(f.x, f.y - 70, 180, '150,195,255', 0.5); SFX.chargeFull(); }
    },
    update(f, foe) {
      if (f.spN < 7 && f.t >= 0.1 + f.spN * 0.09) {
        const ang = -Math.PI + (f.spN / 6) * Math.PI;
        const sx = f.x + Math.cos(ang) * 95, sy = f.y - 120 + Math.sin(ang) * 55;
        const tx = foe ? foe.x : f.x + f.face * 260, ty = foe ? foe.y - 54 : f.y - 54;
        const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
        spawnProj(f, { kind: 'note', x: sx, y: sy, vx: (dx / d) * 1160, vy: (dy / d) * 1160, w: 42, h: 42, life: 0.85, dmg: 24, kb: [160, -240], stun: 0.34, hs: 0.05, autoAim: true, ult: true, noScale: true, unbreakable: true });
        if (!RESIM) ring(sx, sy, 48, '170,210,255', 0.28);
        SFX.slice(); f.spN++;
      }
      if (f.t >= 0.95) endSpecial(f);
    } },
});
