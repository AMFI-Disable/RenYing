Object.assign(SKILLS, {
  // ---- 幽冥 · Q：噬影掠杀（reapdash） ----
  reapdash: { name: '噬影掠杀', cd: 5.5, pass: true, nofric: true, desc: '遁入暗影高速掠过敌身，双刃交叉斩击并留下一团幽雾。',
    start(f) { f.vx = 0; if (!RESIM) smoke(f.x, f.y - 52, 8); SFX.poof(); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.07) {
        f.skPh = 1; f.t = 0; f.vx = 1520 * f.face; f.invul = 0.14; f.hitDone = false; SFX.dash();
      }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-18, -104, 96, 0], dmg: 48, kb: [180, -220], stun: 0.46, hs: 0.09 })) {
          if (!RESIM) { slashLine(foe.x, foe.y - 60, 0.55, '180,110,255'); slashLine(foe.x, foe.y - 60, -0.55, '180,110,255'); }
          SFX.slice();
        }
        if (f.t >= 0.18) { f.skPh = 2; f.t = 0; f.vx *= 0.18; }
      }
      if (f.skPh === 2 && f.t >= 0.2) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 32] : f.skPh === 1 ? ['dash', 60] : ['fy_xslash', 42],
    ai: (me, foe, d) => d > 95 && d < 320 },
  // ---- 幽冥 · R：幽冥拘魂（soulpull） ----
  soulpull: { name: '幽冥拘魂', cd: 5.5, desc: '挥出幽影锁链远距拘魂，命中将对手拽向身前并施加迟缓。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.1) {
        f.skPh = 1; f.t = 0; SFX.slice();
        if (!RESIM) ring(f.x + f.face * 95, f.y - 64, 110, '180,110,255', 0.3);
        if (strike(f, foe, { box: [8, -110, 225, 0], dmg: 42, kb: [-280, -140], stun: 0.52, hs: 0.09 })) {
          foe.slowT = Math.max(foe.slowT || 0, 1.6);
        }
      }
      if (f.skPh === 1 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 28] : ['gc_throw', 54],
    ai: (me, foe, d) => d > 90 && d < 245 },
});
