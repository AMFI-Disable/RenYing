Object.assign(SKILLS, {
  // ---- 白河 · Q：寒江贯虹（riverpierce） ----
  riverpierce: { name: '寒江贯虹', cd: 5.5, pass: true, nofric: true, desc: '凝霜蓄剑疾步贯刺，穿透对手并施加寒霜减速。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; f.t = 0; f.vx = 1420 * f.face; f.invul = 0.08; f.hitDone = false; SFX.dash();
        if (!RESIM) slashLine(f.x + f.face * 48, f.y - 62, 0.08 * f.face, '125,220,255');
      }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-10, -108, 108, 0], dmg: 50, kb: [220, -160], stun: 0.48, hs: 0.1 })) {
          foe.slowT = Math.max(foe.slowT || 0, 1.8);
        }
        if (f.t >= 0.19) { f.skPh = 2; f.t = 0; f.vx *= 0.2; }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 26] : f.skPh === 1 ? ['qf_thrust', 58] : ['idle', 14],
    ai: (me, foe, d) => d > 110 && d < 330 },
  // ---- 白河 · R：霜华凝镜（frostparry） ----
  frostparry: { name: '霜华凝镜', cd: 6, desc: '横剑凝结霜镜护体并反弹飞行道具，随即绽放寒环震退并减速近敌。',
    start(f) { f.vx = 0; f.reflectT = 0.34; f.armorT = 0.26; f.armorHits = 1; SFX.parry(); if (!RESIM) ring(f.x, f.y - 60, 88, '125,220,255', 0.28); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.14) {
        f.skPh = 1; f.t = 0; SFX.slice();
        if (!RESIM) ring(f.x, f.y - 58, 132, '125,220,255', 0.36);
        if (strike(f, foe, { box: [-112, -124, 112, 0], dmg: 44, kb: [280, -460], stun: 0.48, hs: 0.1, launch: true })) {
          foe.slowT = Math.max(foe.slowT || 0, 2.0);
        }
      }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yh_mirror', 30] : ['l3a', 52],
    ai: (me, foe, d) => d < 165 },
});
