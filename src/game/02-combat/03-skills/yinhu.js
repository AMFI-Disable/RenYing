Object.assign(SKILLS, {
  // ---- 银狐 · Q：狐步幻移（foxstep） ----
  foxstep: { name: '狐步幻移', cd: 6, pass: true, nofric: true, desc: '化作银月狐影穿身突袭并强化后续攻击，贴脸瞬间划出幻月双刃斩击。',
    start(f) { f.vx = 0; if (!RESIM) smoke(f.x, f.y - 50, 8); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; f.t = 0; f.vx = 1650 * f.face; f.invul = Math.max(f.invul || 0, 0.14); f.hitDone = false; SFX.poof();
      }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-24, -104, 92, 0], dmg: 44, kb: [160, -140], stun: 0.44, hs: 0.08 })) {
          f.buffT = 1.4;
          if (!RESIM) slashLine(foe.x, foe.y - 60, 0.45, '212,184,255');
        }
        if (f.t >= 0.18) { f.skPh = 2; f.t = 0; f.vx *= 0.15; f.face = foe.x >= f.x ? 1 : -1; }
      }
      if (f.skPh === 2 && f.t >= 0.18) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 32] : f.skPh === 1 ? ['dash', 60] : ['fy_xslash', 42],
    ai: (me, foe, d) => d > 100 && d < 340 },
  // ---- 银狐 · R：幻月双斩（miragecut） ----
  miragecut: { name: '幻月双斩', cd: 4.5, air: true, desc: '旋身跃起施展双刃十字连切，出招迅捷，可于空中连段打断对手。',
    start(f) { f.vx = f.face * 320; if (f.onGround()) { f.vy = -260; f.y = -1; } },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.06) {
        f.skPh = 1; f.t = 0; f.hitDone = false; SFX.slice();
        if (!RESIM) slashLine(f.x + f.face * 48, f.y - 62, 0.55, '212,184,255');
        strike(f, foe, { box: [-20, -112, 104, 10], dmg: 24, kb: [120, -180], stun: 0.34, hs: 0.05 });
      }
      if (f.skPh === 1 && f.t >= 0.1) {
        f.skPh = 2; f.t = 0; f.hitDone = false; SFX.slice();
        if (!RESIM) slashLine(f.x + f.face * 54, f.y - 62, -0.55, '212,184,255');
        strike(f, foe, { box: [-20, -112, 110, 10], dmg: 28, kb: [240, -280], stun: 0.42, hs: 0.07 });
      }
      if (f.skPh === 2 && f.t >= 0.2) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['du_l1s', 32] : f.skPh === 1 ? ['du_l1a', 56] : ['fy_xslash', 48],
    ai: (me, foe, d) => d < 150 },
});
