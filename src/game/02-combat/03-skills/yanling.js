Object.assign(SKILLS, {
  // ---- 燕翎 · Q：俯冲（dive） ----
  dive: { name: '俯冲', cd: 4.5, air: true, desc: '猎鹰收翼斜下俯冲。命中施加【鹰击钉地】（0.40 秒压制硬直）；自空中出手可借力回升并刷新技能。',
    start(f) { f.diveAir = !f.onGround(); if (f.onGround()) { f.vy = -700; f.vx = f.face * 200; f.y = -1; } else f.skPh = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.2) { f.skPh = 1; f.t = 0; }
      if (f.skPh === 1) {
        if (f.t < 0.02) { f.hitDone = false; SFX.dash(); }
        f.vx = f.face * 840; f.vy = 780;
        if (strike(f, foe, { box: [-16, -90, 88, 20], dmg: 46, kb: [220, 0], stun: 0.40, hs: 0.09 })) {
          addP({ type: 'text', text: '鹰击钉地', x: foe.x, y: foe.y - 80, life: 0.8, max: 0.8, rgb: '140,200,255' });
          f.vx *= 0.2; f.vy = -380;
          if (f.diveAir && !f.diveChained) { f.skillCD = 0; f.diveChained = true; }
        }
        if ((f.onGround() && f.t > 0.04) || f.t > 0.4) { f.skPh = 2; f.t = 0; f.vx *= 0.2; dust(f.x, 0, 10); }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['jump', 20] : f.skPh === 1 ? ['yl_dive', 50] : ['getup', 16],
    ai: (me, foe, d) => d > 110 && d < 360 },
  // ---- 燕翎 · R（右键）：翎羽（darts） ----
  darts: { name: '翎羽', cd: 2.5, air: true, desc: '振翅激射三道极速破甲翎羽，贯穿全场。此技【不击飞、无长硬直】，专精于全屏连续穿刺牵制与打断，破尽突进节奏。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; SFX.slice();
        const air = airH(f) > 30;
        for (const k of [-1, 0, 1]) spawnProj(f, { kind: 'feather', x: f.x + f.face * 30, y: f.y - 70 + k * 14, vx: f.face * (air ? 880 : 1100), vy: air ? 580 + k * 90 : k * 45, autoAim: true, w: 24, h: 36, life: 3, dmg: 22, kb: [100, 0], stun: 0.20, hs: 0.03, launch: false });
      }
      if (f.skPh === 1 && f.t >= 0.24) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yl_wings', 30] : ['a1a', 60], ai: (m, o, d) => d > 120 },
});
