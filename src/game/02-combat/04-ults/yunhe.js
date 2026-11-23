Object.assign(ULTS, {
  // ---- 云鹤 · 大招 E：鹤舞九天（skywarddance） ----
  skywarddance: { name: '鹤舞九天', desc: '凌空振翅化入云霄，滞空滑翔期间连续俯射五道白鹤剑气雨覆盖下方多层战场，压制全屏空地走位。',
    begin(f) {
      f.sp = 'soar'; f.spN = 0; f.vy = -560; f.plat = -1; f.spPose = 'yl_spread'; f.invul = 0.65;
      SFX.dash();
    },
    update(f, foe) {
      const c = f.ctrl, dir = c && c.held ? ((c.held.right ? 1 : 0) - (c.held.left ? 1 : 0)) : 0;
      f.vx = damp(f.vx, dir ? dir * 480 : f.face * 220, 8, STEP);
      f.vy = damp(f.vy, -30, 10, STEP);
      if (f.spN < 5 && f.t >= 0.16 + f.spN * 0.12) {
        const tx = foe ? foe.x + (f.spN - 2) * 58 : f.x + f.face * (120 + f.spN * 50);
        const ty = foe ? foe.y - 45 : 0;
        const dx = tx - f.x, dy = ty - (f.y - 50), d = Math.hypot(dx, dy) || 1;
        spawnProj(f, { kind: 'feather', x: f.x, y: f.y - 50, vx: (dx / d) * 1180, vy: (dy / d) * 1180, w: 50, h: 40, life: 0.85, dmg: 32, kb: [180, -240], stun: 0.36, hs: 0.06, pierce: true, maxHits: 2, ult: true, noScale: true, unbreakable: true });
        if (!RESIM) ring(f.x, f.y - 50, 68, '215,245,255', 0.28);
        SFX.slice(); f.spN++;
      }
      if (f.t >= 0.88) endSpecial(f);
    } },
});
