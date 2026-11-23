Object.assign(SKILLS, {
  // ---- 苍冥 · Q：寒渊斩（abyssslash） ----
  abyssslash: { name: '寒渊斩', cd: 5.5, desc: '持重剑蓄势挥出寒渊霜气，近身重斩并释放寒波迟缓对手。',
    start(f) { f.vx *= 0.25; f.armorT = 0.22; f.armorHits = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.14) {
        f.skPh = 1; f.t = 0; SFX.heavy();
        if (!RESIM) ring(f.x + f.face * 56, f.y - 62, 118, '110,196,255', 0.34);
        if (strike(f, foe, { box: [-15, -118, 128, 0], dmg: 52, kb: [240, -180], stun: 0.48, hs: 0.11 })) {
          foe.slowT = Math.max(foe.slowT || 0, 1.8);
        }
        spawnProj(f, { kind: 'qi', x: f.x + f.face * 48, y: f.y - 64, vx: f.face * 920, w: 68, h: 64, life: 0.55, dmg: 32, kb: [180, -120], stun: 0.34, hs: 0.06, slow: 1.6 });
      }
      if (f.skPh === 1 && f.t >= 0.3) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['hva', 26] : ['lda', 52],
    ai: (me, foe, d) => d > 90 && d < 360 },
  // ---- 苍冥 · R：裂魂斩（soulrift） ----
  soulrift: { name: '裂魂斩', cd: 6, desc: '沉肩蓄势以寒渊重剑自下而上裂空重挑，破防并高高挑飞对手。',
    start(f) { f.vx = 0; f.armorT = 0.26; f.armorHits = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.15) {
        f.skPh = 1; f.t = 0; f.vx = 280 * f.face; SFX.heavy(); shake = Math.max(shake, 8);
        if (!RESIM) ring(f.x + f.face * 68, f.y - 52, 136, '110,196,255', 0.38);
        strike(f, foe, { box: [-25, -135, 145, 5], dmg: 58, kb: [210, -680], stun: 0.56, hs: 0.13, launch: true, guardDamage: 36 });
      }
      if (f.skPh === 1 && f.t >= 0.32) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 24] : ['l3a', 54],
    ai: (me, foe, d) => d < 170 },
});
