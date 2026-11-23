Object.assign(SKILLS, {
  // ---- 霸王 · Q：霸王裂地（overlordchop） ----
  overlordchop: { name: '霸王裂地', cd: 6, desc: '身披霸体高举重剑全力劈落，震裂地面重创架势并挑飞对手。',
    start(f) { f.vx = 0; f.armorT = 0.32; f.armorHits = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.16) {
        f.skPh = 1; f.t = 0; SFX.heavy(); SFX.thud(); shake = Math.max(shake, 12);
        if (!RESIM) { ring(f.x + f.face * 76, -12, 152, '245,180,75', 0.38); dust(f.x + f.face * 76, 0, 14); }
        strike(f, foe, { box: [-30, -118, 185, 10], dmg: 64, kb: [260, -640], stun: 0.56, hs: 0.14, launch: true, guardDamage: 42 });
      }
      if (f.skPh === 1 && f.t >= 0.32) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_lift', 24] : ['ts_slam', 56],
    ai: (me, foe, d) => d < 190 },
  // ---- 霸王 · R：楚歌震军（warroar） ----
  warroar: { name: '楚歌震军', cd: 6, desc: '霸体怒吼释放雄浑气浪，震退并减速周围所有敌军。',
    start(f) { f.vx = 0; f.armorT = 0.38; f.armorHits = 2; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; f.t = 0; SFX.thud(); SFX.heavy(); shake = Math.max(shake, 10);
        if (!RESIM) { ring(f.x, f.y - 62, 165, '245,180,75', 0.42); dust(f.x, 0, 16); }
        if (strike(f, foe, { box: [-148, -138, 148, 0], dmg: 48, kb: [420, -280], stun: 0.5, hs: 0.11, knock: true, guardDamage: 30 })) {
          foe.slowT = Math.max(foe.slowT || 0, 1.5);
        }
      }
      if (f.skPh === 1 && f.t >= 0.3) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_shoulder', 26] : ['ts_slam', 50],
    ai: (me, foe, d) => d < 170 },
});
