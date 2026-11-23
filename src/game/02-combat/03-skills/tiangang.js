Object.assign(SKILLS, {
  // ---- 天罡 · Q：破阵长驱（gangthrust） ----
  gangthrust: { name: '破阵长驱', cd: 6, nofric: true, desc: '身披铁甲霸体挺枪直驱，超长枪芒贯穿敌阵并大幅削减防御架势。',
    start(f) { f.vx = 0; f.armorT = 0.28; f.armorHits = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.1) { f.skPh = 1; f.t = 0; f.vx = 1240 * f.face; f.hitDone = false; SFX.dash(); }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-10, -108, 128, 0], dmg: 56, kb: [320, -200], stun: 0.5, hs: 0.12, guardDamage: 36 })) {
          if (!RESIM) ring(foe.x, foe.y - 60, 96, '240,200,96', 0.3);
        }
        if (f.t >= 0.22) { f.skPh = 2; f.t = 0; f.vx *= 0.2; }
      }
      if (f.skPh === 2 && f.t >= 0.24) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ls_stance', 26] : f.skPh === 1 ? ['ls_thrust', 56] : ['idle', 14],
    ai: (me, foe, d) => d > 110 && d < 340 },
  // ---- 天罡 · R：铁壁震枪（ironbulwark） ----
  ironbulwark: { name: '铁壁震枪', cd: 6.5, desc: '玄铁长枪顿地立起天罡铁壁，获持久霸体与架势回复，并横扫挑飞近身敌军。',
    start(f) { f.vx = 0; f.armorT = 0.65; f.armorHits = 2; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.14) {
        f.skPh = 1; f.t = 0; SFX.heavy(); shake = Math.max(shake, 9);
        f.guard = Math.min(f.guardMax, (f.guard || 0) + 32);
        if (!RESIM) ring(f.x + f.face * 48, f.y - 54, 142, '240,200,96', 0.4);
        strike(f, foe, { box: [-110, -125, 145, 5], dmg: 50, kb: [280, -600], stun: 0.52, hs: 0.12, launch: true, guardDamage: 34 });
      }
      if (f.skPh === 1 && f.t >= 0.3) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ls_stance', 24] : ['l3a', 52],
    ai: (me, foe, d) => d < 175 },
});
