Object.assign(ULTS, {
  // ---- 青鸾 · 大招 E：鸾鸣九霄（phoenixchorus） ----
  phoenixchorus: { name: '鸾鸣九霄', desc: '清鸣振翼展开翠岚灵域，净化自身与五层范围内队友异常并回复气血，同时向四周散射十二道贯穿追踪翠羽箭刃。',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.vx = 0; f.vy = -280; f.plat = -1; f.spPose = 'yl_spread'; f.invul = 0.6;
      for (const m of sideFighters(fighterTeam(f))) {
        if (!m.hidden && m.hp > 0 && Math.hypot(m.x - f.x, m.y - f.y) < 620) {
          m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.1));
          m.slowT = 0; m.burnT = 0; m.frostSlow = 0;
          m.guard = Math.min(m.maxGuard || 100, (m.guard || 0) + 35);
          if (!RESIM) ring(m.x, m.y - 55, 78, '90,245,195', 0.35);
        }
      }
      if (!RESIM) { ring(f.x, f.y - 60, 230, '90,240,195', 0.52); SFX.chargeFull(); }
    },
    update(f, foe) {
      f.vy = damp(f.vy, 0, 10, STEP);
      if (f.spN < 6 && f.t >= 0.1 + f.spN * 0.085) {
        for (const off of [0, Math.PI]) {
          const ang = (f.spN / 6) * Math.PI + off;
          spawnProj(f, { kind: 'arrow', x: f.x + Math.cos(ang) * 44, y: f.y - 64 + Math.sin(ang) * 34, vx: Math.cos(ang) * 1120, vy: Math.sin(ang) * 1120, w: 38, h: 24, life: 0.9, dmg: 20, kb: [180, -220], stun: 0.32, hs: 0.04, autoAim: true, pierce: true, rehit: 0.4, ult: true, noScale: true, unbreakable: true, rgb: '95,245,195' });
        }
        SFX.swing(); f.spN++;
      }
      if (f.t >= 0.84) endSpecial(f);
    } },
});
