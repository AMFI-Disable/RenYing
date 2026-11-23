Object.assign(SKILLS, {
  // ---- 无涯 · Q：无涯居合（iaidodraw） ----
  iaidodraw: { name: '无涯居合', cd: 5.5, pass: true, nofric: true, desc: '按鞘蓄势一瞬拔刀疾闪，以迅雷居合剑光穿透并重创对手。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.11) {
        f.skPh = 1; f.t = 0; f.vx = 1560 * f.face; f.invul = 0.11; f.hitDone = false; SFX.dash(); SFX.slice();
        if (!RESIM) slashLine(f.x + f.face * 64, f.y - 60, 0.04 * f.face, '215,230,255');
      }
      if (f.skPh === 1) {
        strike(f, foe, { box: [-14, -112, 118, 0], dmg: 56, kb: [240, -220], stun: 0.54, hs: 0.12 });
        if (f.t >= 0.17) { f.skPh = 2; f.t = 0; f.vx *= 0.15; }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 28] : f.skPh === 1 ? ['qf_thrust', 60] : ['idle', 14],
    ai: (me, foe, d) => d > 110 && d < 340 },
  // ---- 无涯 · R：踏虚斩影（voidstep） ----
  voidstep: { name: '踏虚斩影', cd: 5.5, desc: '踏虚闪避短暂无敌，随即挥出一道凌厉弯月剑气挑空对手。',
    start(f) { f.vx = -260 * f.face; f.invul = Math.max(f.invul || 0, 0.16); if (!RESIM) smoke(f.x, f.y - 54, 7); SFX.dash(); },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.11) {
        f.skPh = 1; f.t = 0; f.vx = 0; SFX.swing();
        spawnProj(f, { kind: 'qi', x: f.x + f.face * 42, y: f.y - 66, vx: f.face * 940, autoAim: true, w: 88, h: 92, life: 0.52, dmg: 48, kb: [200, -560], stun: 0.36, hs: 0.08, launch: true });
      }
      if (f.skPh === 1 && f.t >= 0.26) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 30] : ['qf_thrust', 56],
    ai: (me, foe, d) => d > 110 && d < 360 },
});
