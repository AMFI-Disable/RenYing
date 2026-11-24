Object.assign(ULTS, {
  // ---- 云鹤 · 大招 E：鹤舞九天（skywarddance） ----
  skywarddance: { name: '鹤舞九天', desc: '凌空振翅化入云霄，滞空滑翔期间连续倾泻六轮双发贯穿白鹤翎箭雨覆盖五层战场，并散落云岚灵息滋养沿途队友。',
    begin(f) {
      f.sp = 'soar'; f.spN = 0; f.vy = -580; f.plat = -1; f.spPose = 'yl_spread'; f.invul = 0.65;
      for (const m of sideFighters(fighterTeam(f))) {
        if (!m.hidden && m.hp > 0 && Math.hypot(m.x - f.x, m.y - f.y) < 520) {
          m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.07));
        }
      }
      SFX.dash();
    },
    update(f, foe) {
      const c = f.ctrl, dir = c && c.held ? ((c.held.right ? 1 : 0) - (c.held.left ? 1 : 0)) : 0;
      f.vx = damp(f.vx, dir ? dir * 500 : f.face * 240, 8, STEP);
      f.vy = damp(f.vy, -30, 10, STEP);
      if (f.spN < 6 && f.t >= 0.14 + f.spN * 0.11) {
        const pool = isMulti() ? foesOf(f).filter(ef => ef && !ef.hidden && ef.hp > 0) : [foe];
        const tg = pool.length ? pool[f.spN % pool.length] : foe;
        const tx = tg ? tg.x + (f.spN - 2.5) * 44 : f.x + f.face * (140 + f.spN * 50);
        const ty = tg ? tg.y - 48 : 0;
        const baseAng = Math.atan2(ty - (f.y - 50), tx - f.x);
        for (const da of [-0.1, 0.1]) {
          spawnProj(f, { kind: 'arrow', x: f.x, y: f.y - 50, vx: Math.cos(baseAng + da) * 1280, vy: Math.sin(baseAng + da) * 1280, w: 42, h: 24, life: 0.95, dmg: 22, kb: [160, -220], stun: 0.34, hs: 0.05, pierce: true, rehit: 0.4, ult: true, noScale: true, unbreakable: true, rgb: '210,245,255' });
        }
        if (!RESIM) ring(f.x, f.y - 50, 74, '215,245,255', 0.28);
        SFX.slice(); f.spN++;
      }
      if (f.t >= 0.9) endSpecial(f);
    } },
});
