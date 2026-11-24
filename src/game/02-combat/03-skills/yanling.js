Object.assign(SKILLS, {
  // ---- 燕翎 · Q：俯冲（dive） ----
  dive: { name: '俯冲', cd: 4.5, air: true, desc: '猎鹰收翼斜下俯冲，落地激起羽风气浪。命中施加【鹰击钉地】（0.40 秒压制硬直）；自空中出手可借力回升并刷新技能。',
    start(f) { f.diveAir = !f.onGround(); if (f.onGround()) { f.vy = -700; f.vx = f.face * 200; f.plat = -1; f.y -= 1; } else f.skPh = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.2) { f.skPh = 1; f.t = 0; }
      if (f.skPh === 1) {
        if (f.t < 0.02) { f.hitDone = false; SFX.dash(); }
        f.vx = f.face * 840; f.vy = 780;
        if (strike(f, foe, { box: [-20, -90, 96, 20], dmg: 46, kb: [220, 0], stun: 0.40, hs: 0.09 })) {
          addP({ type: 'text', text: '鹰击钉地', x: foe.x, y: foe.y - 80, life: 0.8, max: 0.8, rgb: '140,200,255' });
          ring(f.x, f.y - 40, 120, '140,210,255', 0.28);
          f.vx *= 0.2; f.vy = -380;
          if (f.diveAir && !f.diveChained) { f.skillCD = 0; f.diveChained = true; }
        }
        if ((f.onGround() && f.t > 0.04) || f.t > 0.4) { f.skPh = 2; f.t = 0; f.vx *= 0.2; dust(f.x, f.y, 10); }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['jump', 20] : f.skPh === 1 ? ['yl_dive', 50] : ['getup', 16],
    ai: (me, foe, d) => d > 110 && d < 360 },
  // ---- 燕翎 · R（右键）：翎羽（darts） ----
  darts: { name: '翎羽', cd: 2.5, air: true, desc: '振翅激射五道极速贯穿破甲箭羽，扇形覆盖上下战场层。专精于全场穿刺牵制、跨层压制与破招打断。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; SFX.slice();
        const air = airH(f) > 30;
        for (const k of [-2, -1, 0, 1, 2]) {
          spawnProj(f, {
            kind: 'arrow', x: f.x + f.face * 32, y: f.y - 70 + k * 10,
            vx: f.face * (air ? 960 : 1220), vy: air ? 540 + k * 115 : k * 95,
            autoAim: k === 0, w: 34, h: 22, life: 2.8, dmg: k === 0 ? 22 : 16,
            kb: [100, 0], stun: 0.20, hs: 0.03, launch: false, pierce: true, rehit: 0.4, rgb: '145,215,255'
          });
        }
      }
      if (f.skPh === 1 && f.t >= 0.24) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yl_wings', 30] : ['a1a', 60], ai: (m, o, d) => d > 120 },
});
