Object.assign(SKILLS, {
  // ---- 幽篁 · Q：幽篁毒针（venomfan） ----
  venomfan: { name: '幽篁毒针', cd: 5, desc: '挥袖齐射三枚翠竹寒针，命中减速对手。',
    start(f) { f.vx *= 0.3; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; f.t = 0; SFX.swing();
        for (let k = -1; k <= 1; k++) {
          spawnProj(f, { kind: 'dart', x: f.x + f.face * 34, y: f.y - 68 + k * 14, vx: f.face * 1040, vy: k * 90, w: 38, h: 24, life: 0.65, dmg: 18, kb: [110, 0], stun: 0.26, hs: 0.04, slow: 1.4 });
        }
      }
      if (f.skPh === 1 && f.t >= 0.26) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 30] : ['qf_thrust', 56],
    ai: (me, foe, d) => d > 150 && d < 420 },
  // ---- 幽篁 · R：青竹缠鞭（whiplash） ----
  whiplash: { name: '青竹缠鞭', cd: 5.5, desc: '甩出青竹长鞭远距抽击，将对手拽至身前并造成硬直。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.1) {
        f.skPh = 1; f.t = 0; SFX.swing();
        if (strike(f, foe, { box: [10, -108, 220, 0], dmg: 44, kb: [-260, -120], stun: 0.52, hs: 0.09 })) {
          foe.slowT = Math.max(foe.slowT || 0, 1.5);
        }
      }
      if (f.skPh === 1 && f.t >= 0.26) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 28] : ['gc_throw', 54],
    ai: (me, foe, d) => d > 95 && d < 250 },
});
