Object.assign(ULTS, {
  // ---- 青鸾 · 大招 E：鸾鸣九霄（phoenixchorus） ----
  phoenixchorus: { name: '鸾鸣九霄', desc: '清鸣振翼展开翠岚灵域，净化自身与附近队友异常状态并回复气血，同时向四周散射六道追踪翠羽风刃。',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.vx = 0; f.vy = -260; f.plat = -1; f.spPose = 'yl_spread'; f.invul = 0.6;
      for (const m of sideFighters(fighterTeam(f))) {
        if (!m.hidden && m.hp > 0 && Math.abs(m.x - f.x) < 560) {
          m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.1));
          m.slowT = 0; m.burnT = 0; m.frostSlow = 0;
          m.guard = Math.min(m.maxGuard || 100, (m.guard || 0) + 35);
        }
      }
      if (!RESIM) { ring(f.x, f.y - 60, 210, '90,240,195', 0.5); SFX.chargeFull(); }
    },
    update(f, foe) {
      f.vy = damp(f.vy, 0, 10, STEP);
      if (f.spN < 6 && f.t >= 0.12 + f.spN * 0.08) {
        const ang = (f.spN / 6) * Math.PI * 2;
        spawnProj(f, { kind: 'feather', x: f.x + Math.cos(ang) * 42, y: f.y - 64 + Math.sin(ang) * 32, vx: Math.cos(ang) * 1040, vy: Math.sin(ang) * 1040, w: 46, h: 36, life: 0.85, dmg: 26, kb: [200, -240], stun: 0.34, hs: 0.05, autoAim: true, ult: true, noScale: true, unbreakable: true });
        SFX.swing(); f.spN++;
      }
      if (f.t >= 0.82) endSpecial(f);
    } },
});
