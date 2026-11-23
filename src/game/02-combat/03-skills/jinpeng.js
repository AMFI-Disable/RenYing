Object.assign(SKILLS, {
  // ---- 金鹏 · Q：金鹏裂空（talondive） ----
  talondive: { name: '金鹏裂空', cd: 5.5, air: true, nofric: true, desc: '振翼腾空并以金爪凌厉俯冲，落地震开罡风气浪击飞对手。',
    start(f) { f.vx = 0; f.vy = Math.min(f.vy, -340); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.1) {
        f.skPh = 1; f.t = 0; f.vx = 1180 * f.face; f.vy = 620; f.hitDone = false; SFX.dash();
      }
      if (f.skPh === 1) {
        strike(f, foe, { box: [-25, -105, 98, 12], dmg: 54, kb: [260, -520], stun: 0.5, hs: 0.11, launch: true });
        if (f.t >= 0.22 || f.y >= 0) {
          f.skPh = 2; f.t = 0; f.vx *= 0.25;
          if (!RESIM) { ring(f.x, f.y - 36, 125, '255,205,85', 0.34); dust(f.x, 0, 10); }
        }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['jump', 24] : f.skPh === 1 ? ['yl_dive', 54] : ['getup', 16],
    ai: (me, foe, d) => d > 100 && d < 320 },
  // ---- 金鹏 · R：扶摇罡风（galestrike） ----
  galestrike: { name: '扶摇罡风', cd: 5, air: true, desc: '振开金羽双翼齐发三道裂空金羽，压制中远距离对手。',
    start(f) { f.vx *= 0.25; if (f.y < 0) f.vy = Math.min(f.vy, -120); },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.09) {
        f.skPh = 1; f.t = 0; SFX.slice();
        if (!RESIM) ring(f.x + f.face * 24, f.y - 68, 92, '255,205,85', 0.28);
        for (const k of [-1, 0, 1]) {
          spawnProj(f, { kind: 'feather', x: f.x + f.face * 34, y: f.y - 68 + k * 16, vx: f.face * 1120, vy: k * 75, autoAim: true, w: 28, h: 36, life: 0.72, dmg: 20, kb: [130, -80], stun: 0.24, hs: 0.04 });
        }
      }
      if (f.skPh === 1 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yl_wings', 30] : ['a1a', 54],
    ai: (me, foe, d) => d > 130 && d < 420 },
});
