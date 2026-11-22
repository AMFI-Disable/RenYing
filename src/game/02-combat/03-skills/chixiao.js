Object.assign(SKILLS, {
  // ---- 炽霄 · Q：烈焰突刺（flamehalberd） ----
  flamehalberd: { name: '烈焰突刺', cd: 6, pass: true, nofric: true, desc: '挺起火耙冲刺，命中引燃对手。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.09) { f.skPh = 1; f.t = 0; f.vx = 1360 * f.face; f.armorT = 0.22; f.armorHits = 1; f.hitDone = false; SFX.dash(); }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-10, -110, 108, 0], dmg: 54, kb: [240, -180], stun: 0.52, hs: 0.11 })) {
          foe.burnT = Math.max(foe.burnT || 0, 3.0);
        }
        if (f.t >= 0.2) { f.skPh = 2; f.t = 0; f.vx *= 0.2; }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 26] : f.skPh === 1 ? ['qf_thrust', 56] : ['idle', 14],
    ai: (me, foe, d) => d > 110 && d < 320 },
  // ---- 炽霄 · R：炎轮扫荡（blazering） ----
  blazering: { name: '炎轮扫荡', cd: 5.5, desc: '横抡火耙，卷出的火轮挑飞近处对手并点燃他们。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.11) {
        f.skPh = 1; f.t = 0; SFX.heavy();
        if (!RESIM) ring(f.x, f.y - 58, 128, '255,115,65', 0.36);
        if (strike(f, foe, { box: [-115, -125, 115, 0], dmg: 48, kb: [210, -640], stun: 0.45, hs: 0.1, launch: true })) {
          foe.burnT = Math.max(foe.burnT || 0, 2.5);
        }
      }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 28] : ['l3a', 52],
    ai: (me, foe, d) => d < 160 },
});
