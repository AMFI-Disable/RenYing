Object.assign(SKILLS, {
  // ---- 玄武 · Q：玄甲冲撞（shellbash） ----
  shellbash: { name: '玄甲冲撞', cd: 6, nofric: true, desc: '身披玄甲霸体持锤向前猛冲，强行撞飞正面敌军并重创架势。',
    start(f) { f.vx = 0; f.armorT = 0.36; f.armorHits = 2; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.1) { f.skPh = 1; f.t = 0; f.vx = 1080 * f.face; f.hitDone = false; SFX.dash(); }
      if (f.skPh === 1) {
        strike(f, foe, { box: [-18, -112, 98, 0], dmg: 54, kb: [380, -240], stun: 0.5, hs: 0.12, knock: true, guardDamage: 34 });
        if (f.t >= 0.24) { f.skPh = 2; f.t = 0; f.vx *= 0.2; }
      }
      if (f.skPh === 2 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_shoulder', 26] : f.skPh === 1 ? ['dash', 52] : ['idle', 14],
    ai: (me, foe, d) => d > 95 && d < 310 },
  // ---- 玄武 · R：镇岳壁垒（earthfort） ----
  earthfort: { name: '镇岳壁垒', cd: 7, desc: '重锤顿地唤出玄甲壁垒，获得持久霸体与架势回复，并掀起震波挑空近敌。',
    start(f) { f.vx = 0; f.armorT = 0.8; f.armorHits = 2; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.16) {
        f.skPh = 1; f.t = 0; SFX.thud(); shake = Math.max(shake, 10);
        f.guard = Math.min(f.guardMax, (f.guard || 0) + 35);
        if (!RESIM) ring(f.x, -8, 155, '140,212,140', 0.44);
        strike(f, foe, { box: [-135, -115, 135, 10], dmg: 52, kb: [260, -580], stun: 0.52, hs: 0.13, launch: true, guardDamage: 36 });
        spawnProj(f, { kind: 'quake', x: f.x + f.face * 72, y: -12, vx: f.face * 540, w: 68, h: 48, life: 0.45, dmg: 26, kb: [160, -340], stun: 0.36, hs: 0.06, groundOnly: true });
      }
      if (f.skPh === 1 && f.t >= 0.32) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_lift', 24] : ['ts_slam', 52],
    ai: (me, foe, d) => d < 190 },
});
