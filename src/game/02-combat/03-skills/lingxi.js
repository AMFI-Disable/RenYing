Object.assign(SKILLS, {
  // ---- 灵犀 · Q：灵犀音波（mindwave） ----
  mindwave: { name: '灵犀音波', cd: 5, desc: '横笛吹出逐渐扩张的灵犀音环，穿透中远距离并减速对手。',
    start(f) { f.vx *= 0.3; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) {
        f.skPh = 1; f.t = 0; SFX.note(1);
        spawnProj(f, { kind: 'note', x: f.x + f.face * 42, y: f.y - 68, vx: f.face * 800, autoAim: true, w: 62, h: 62, grow: 44, life: 0.85, dmg: 42, kb: [190, -180], stun: 0.42, hs: 0.07, slow: 1.5 });
      }
      if (f.skPh === 1 && f.t >= 0.27) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yx_play', 28] : ['yx_push', 54],
    ai: (me, foe, d) => d > 135 && d < 420 },
  // ---- 灵犀 · R：余音震魄（echostun） ----
  echostun: { name: '余音震魄', cd: 6, desc: '奏响清越强音护体反弹暗器，震晕周围敌军并削减大量架势。',
    start(f) { f.vx = 0; f.reflectT = 0.36; f.armorT = 0.24; f.armorHits = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; f.t = 0; SFX.note(3);
        if (!RESIM) ring(f.x, f.y - 60, 148, '95,235,210', 0.4);
        strike(f, foe, { box: [-135, -135, 135, 0], dmg: 46, kb: [240, -520], stun: 0.62, hs: 0.11, launch: true, guardDamage: 34 });
      }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yx_play', 34] : ['yx_push', 52],
    ai: (me, foe, d) => d < 175 },
});
