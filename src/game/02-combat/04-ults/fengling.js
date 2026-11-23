Object.assign(ULTS, {
  // ---- 风铃 · 大招 E：万铃和鸣（bellharmony） ----
  bellharmony: { name: '万铃和鸣', desc: '在当前层高悬三枚清风灵铃齐声和鸣，为己方全员回复气血与架势，并向锁定的敌手连射六枚追踪铃音灵弹。',
    begin(f) {
      f.sp = 'chime'; f.spN = 0; f.vx = 0; f.spPose = 'yx_play'; f.invul = 0.55;
      for (const m of sideFighters(fighterTeam(f))) {
        if (!m.hidden && m.hp > 0 && Math.abs(m.x - f.x) < 650) {
          m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.09));
          m.guard = Math.min(m.maxGuard || 100, (m.guard || 0) + 40);
        }
      }
      if (!RESIM) {
        for (const ox of [-95, 0, 95]) ring(f.x + ox, f.y - 108, 76, '155,245,215', 0.45);
        SFX.chargeFull();
      }
    },
    update(f, foe) {
      if (f.spN < 6 && f.t >= 0.12 + f.spN * 0.1) {
        const ox = ((f.spN % 3) - 1) * 95;
        const sx = f.x + ox, sy = f.y - 108;
        const tx = foe ? foe.x : f.x + f.face * 260, ty = foe ? foe.y - 54 : f.y - 54;
        const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
        spawnProj(f, { kind: 'note', x: sx, y: sy, vx: (dx / d) * 1120, vy: (dy / d) * 1120, w: 38, h: 38, life: 0.85, dmg: 24, kb: [140, -180], stun: 0.32, hs: 0.04, autoAim: true, ult: true, noScale: true, unbreakable: true });
        if (!RESIM) ring(sx, sy, 46, '165,245,220', 0.25);
        SFX.parry(); f.spN++;
      }
      if (f.t >= 0.88) endSpecial(f);
    } },
});
