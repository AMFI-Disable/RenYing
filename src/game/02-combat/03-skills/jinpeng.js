Object.assign(SKILLS, {
  // ---- 金鹏 · Q：金鹏裂空（talondive） ----
  talondive: { name: '金鹏裂空', cd: 5.5, air: true, nofric: true, desc: '振翼腾空并以金爪凌厉俯冲，落地震开罡风气浪击飞范围内对手。',
    start(f) { f.vx = 0; f.vy = Math.min(f.vy, -340); f.plat = -1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.1) {
        f.skPh = 1; f.t = 0; f.vx = 1180 * f.face; f.vy = 620; f.hitDone = false; SFX.dash();
      }
      if (f.skPh === 1) {
        strike(f, foe, { box: [-25, -105, 102, 14], dmg: 54, kb: [260, -520], stun: 0.5, hs: 0.11, launch: true });
        if (f.t >= 0.22 || f.onGround()) {
          f.skPh = 2; f.t = 0; f.vx *= 0.25;
          if (!RESIM) { ring(f.x, f.y - 36, 130, '255,205,85', 0.34); dust(f.x, f.y, 10); }
        }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['jump', 24] : f.skPh === 1 ? ['yl_dive', 54] : ['getup', 16],
    ai: (me, foe, d) => d > 100 && d < 320 },
  // ---- 金鹏 · R：扶摇罡风（galestrike） ----
  galestrike: { name: '扶摇罡风', cd: 5, air: true, desc: '振开金羽双翼齐发五道贯穿裂空金羽箭，扇形覆盖上下平台层压制中远距离敌军。',
    start(f) { f.vx *= 0.25; if (f.y < 0) f.vy = Math.min(f.vy, 60); },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) {
        f.skPh = 1; f.t = 0; SFX.slice();
        for (const a of [-0.24, -0.12, 0, 0.12, 0.24]) {
          spawnProj(f, { kind: 'arrow', x: f.x + f.face * 34, y: f.y - 68, vx: f.face * 1240 * Math.cos(a), vy: 1240 * Math.sin(a), w: 36, h: 20, life: 0.9, dmg: a === 0 ? 22 : 16, kb: [160, -140], stun: 0.3, hs: 0.04, pierce: true, rehit: 0.4, rgb: '255,215,95' });
        }
        if (!RESIM) ring(f.x + f.face * 34, f.y - 68, 86, '255,215,95', 0.26);
      }
      if (f.skPh === 1 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yl_wings', 28] : ['a1a', 52],
    ai: (me, foe, d) => d > 140 && d < 520 },
});
