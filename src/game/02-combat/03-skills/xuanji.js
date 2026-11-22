Object.assign(SKILLS, {
  // ---- 玄机 · Q：星规流火（starorb） ----
  starorb: { name: '星规流火', cd: 5, desc: '让三臂星规对准一线，向中远距离射出星火。',
    start(f) { f.vx *= 0.3; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) {
        f.skPh = 1; f.t = 0; SFX.swing();
        spawnProj(f, { kind: 'qi', x: f.x + f.face * 42, y: f.y - 68, vx: f.face * 900, autoAim: true, w: 72, h: 72, life: 0.65, dmg: 46, kb: [210, -240], stun: 0.4, hs: 0.08 });
      }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yx_play', 28] : ['yx_push', 56],
    ai: (me, foe, d) => d > 140 && d < 420 },
  // ---- 玄机 · R：天枢重力（gravwell） ----
  gravwell: { name: '天枢重力', cd: 6, desc: '拨开星规三臂，在身前展开力场，牵引对手并削减架势。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; f.t = 0; SFX.thud();
        if (!RESIM) ring(f.x + f.face * 110, f.y - 56, 140, '155,170,255', 0.42);
        strike(f, foe, { box: [-20, -135, 220, 0], dmg: 46, kb: [-220, -420], stun: 0.55, hs: 0.11, launch: true, guardDamage: 32 });
      }
      if (f.skPh === 1 && f.t >= 0.3) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yx_play', 26] : ['yx_push', 52],
    ai: (me, foe, d) => d < 220 },
});
