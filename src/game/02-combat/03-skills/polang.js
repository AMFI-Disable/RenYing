Object.assign(SKILLS, {
  // ---- 破浪 · Q：怒涛震锚（tidalslam） ----
  tidalslam: { name: '怒涛震锚', cd: 6, desc: '举起玄铁重锚猛砸地面，掀起怒涛震波破防挑空。',
    start(f) { f.vx = 0; f.armorT = 0.25; f.armorHits = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.16) {
        f.skPh = 1; f.t = 0; SFX.heavy(); shake = Math.max(shake, 10);
        if (!RESIM) ring(f.x + f.face * 70, -10, 145, '80,210,255', 0.38);
        strike(f, foe, { box: [-40, -110, 175, 10], dmg: 60, kb: [240, -620], stun: 0.55, hs: 0.14, launch: true, guardDamage: 38 });
      }
      if (f.skPh === 1 && f.t >= 0.32) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['hva', 24] : ['lda', 52],
    ai: (me, foe, d) => d < 185 },
  // ---- 破浪 · R：破浪突进（undertow） ----
  undertow: { name: '破浪突进', cd: 5.5, nofric: true, desc: '身披沧澜霸体顶锚冲锋，强行撞开正面敌军。',
    start(f) { f.vx = 0; f.armorT = 0.36; f.armorHits = 2; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.08) { f.skPh = 1; f.t = 0; f.vx = 1120 * f.face; f.hitDone = false; SFX.dash(); }
      if (f.skPh === 1) {
        strike(f, foe, { box: [-15, -110, 96, 0], dmg: 52, kb: [380, -240], stun: 0.48, hs: 0.11, knock: true });
        if (f.t >= 0.24) { f.skPh = 2; f.t = 0; f.vx *= 0.25; }
      }
      if (f.skPh === 2 && f.t >= 0.24) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 24] : f.skPh === 1 ? ['dash', 52] : ['idle', 14],
    ai: (me, foe, d) => d > 110 && d < 320 },
});
