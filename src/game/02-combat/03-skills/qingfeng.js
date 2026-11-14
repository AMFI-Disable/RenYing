Object.assign(SKILLS, {
  // ---- 青锋 · Q：疾风斩（gale） ----
  gale: { name: '疾风斩', cd: 6, pass: true, nofric: true, desc: '一步居合，身随刀走，直穿敌身；锋刃掠过处施加【居合斩穴】强定身（0.65 秒），并立即重置瞬步冲刺冷却。途中若遇墨阵，一刀两断。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.08) { f.skPh = 1; f.t = 0; f.vx = 1500 * f.face; f.invul = 0.12; f.hitDone = false; SFX.dash(); }
      if (f.skPh === 1) {
        // 破墨阵：穿过墨阵直接净化
        for (const p of projs) {
          if (p.kind === 'trap' && p.owner === foe.idx && Math.abs(p.x - f.x) < 80) {
            p.dead = true; smoke(p.x, -10, 8); SFX.slice();
            addP({ type: 'text', text: '破阵', x: p.x, y: -45, life: 0.6, max: 0.6, rgb: '120,230,255' });
          }
        }
        if (strike(f, foe, { box: [-10, -112, 92, 0], dmg: 55, kb: [180, 0], stun: 0.65, hs: 0.12 })) {
          f.dashCD = 0;
          f.skill2CD = 0;
          addP({ type: 'text', text: '居合斩穴 · 剑气重置', x: f.x, y: f.y - 110, life: 0.8, max: 0.8, rgb: '120,230,255' });
        }
        if (f.t >= 0.18) { f.skPh = 2; f.t = 0; f.vx *= 0.2; }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 26] : f.skPh === 1 ? ['qf_thrust', 60] : ['idle', 14],
    ai: (me, foe, d) => d > 140 && d < 330 },
  // ---- 青锋 · R（右键）：剑气（swordqi） ----
  swordqi: { name: '剑气', cd: 5, desc: '沉步拔刀，横扫出一道宏大弧月剑气。中距离直接【掀天挑空】（无地面硬直，直接送上半空），暗器更不在话下。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) { f.skPh = 1; SFX.swing(); spawnProj(f, { kind: 'qi', x: f.x + f.face * 40, y: f.y - 65, vx: f.face * 880, autoAim: true, w: 92, h: 96, life: 0.46, dmg: 52, kb: [180, -700], stun: 0.3, hs: 0.08, launch: true }); }
      if (f.skPh === 1 && f.t >= 0.32) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 30] : ['qf_thrust', 60], ai: (m, o, d) => d > 120 && d < 380 },
});
