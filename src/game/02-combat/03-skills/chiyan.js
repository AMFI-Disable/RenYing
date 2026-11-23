Object.assign(SKILLS, {
  // ---- 赤焰 · Q：烈焰冲拳（blazefist） ----
  blazefist: { name: '烈焰冲拳', cd: 5, pass: true, nofric: true, desc: '双拳燃起烈焰疾步突刺轰击，命中后引燃对手并造成持续灼烧。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.07) { f.skPh = 1; f.t = 0; f.vx = 1420 * f.face; f.hitDone = false; SFX.dash(); }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-12, -104, 96, 0], dmg: 50, kb: [260, -180], stun: 0.48, hs: 0.1 })) {
          foe.burnT = Math.max(foe.burnT || 0, 2.8);
          if (!RESIM) ring(foe.x, foe.y - 60, 88, '255,140,50', 0.28);
        }
        if (f.t >= 0.19) { f.skPh = 2; f.t = 0; f.vx *= 0.2; }
      }
      if (f.skPh === 2 && f.t >= 0.2) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['lm_boxer', 30] : f.skPh === 1 ? ['lm_jab', 58] : ['idle', 16],
    ai: (me, foe, d) => d > 90 && d < 300 },
  // ---- 赤焰 · R：烬火升龙（emberupper） ----
  emberupper: { name: '烬火升龙', cd: 5.5, desc: '旋身腾空打出灼热升龙勾拳，高高挑飞近身对手并施加烈焰灼烧。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.09) {
        f.skPh = 1; f.t = 0; f.vx = 220 * f.face; f.vy = -520; f.y = Math.min(f.y, -1); SFX.heavy();
        if (!RESIM) ring(f.x + f.face * 36, f.y - 72, 112, '255,140,50', 0.34);
        if (strike(f, foe, { box: [-35, -138, 108, 0], dmg: 52, kb: [180, -700], stun: 0.54, hs: 0.11, launch: true })) {
          foe.burnT = Math.max(foe.burnT || 0, 2.5);
        }
      }
      if (f.skPh === 1 && f.t >= 0.3) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['lm_boxer', 28] : ['l3a', 54],
    ai: (me, foe, d) => d < 145 },
});
