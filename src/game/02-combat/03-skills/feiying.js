Object.assign(SKILLS, {
  // ---- 绯影 · Q：影遁（blink） ----
  blink: { name: '影遁', cd: 11, pass: true, desc: '结印 0.3 秒后入影（结印时站着不动），影子 0.15 秒掠到对手背后施展十字绞杀（只伤血，不让对手僵直）。此后 1.5 秒内，下一击威力暴涨 50%。',
    start() {},
    update(f, foe) {
      const behind = () => { let nx = foe.x - foe.face * 70; if (nx < WALL || nx > STAGE_W - WALL) nx = foe.x + foe.face * 70; return clamp(nx, WALL, STAGE_W - WALL); };
      if (f.skPh === 0 && f.t >= 0.3) {   // 结印 0.3 秒，入影
        smoke(f.x, f.y - 50, 12);
        f.bbX = f.x; f.bbT = 1.5; f.blinkX0 = f.x; f.vx = 0; f.vy = 0;
        f.skPh = 2; f.t = 0;
      }
      if (f.skPh === 2) {   // 影子贴地飞过去，0.15 秒才到对手背后（对手这时还能走开）
        const k = Math.min(1, f.t / 0.15);
        f.x = f.blinkX0 + (behind() - f.blinkX0) * k; f.vx = 0; f.vy = 0;
        if (Math.random() < 0.7) smoke(f.x, f.y - 40, 2);
      }
      if (f.skPh === 2 && f.t >= 0.15) {
        f.x = behind(); f.y = Math.min(0, foe.y); f.vy = 0; f.vx = 0;
        f.face = foe.x >= f.x ? 1 : -1; f.buffT = 1.5;
        f.skPh = 1; f.t = 0; f.snap = true; f.trail.length = 0; f.scarf = [];
        smoke(f.x, f.y - 50, 10); SFX.poof();
        slashLine(foe.x, foe.y - 60, 0.5, '255,95,115'); slashLine(foe.x, foe.y - 60, -0.5, '255,95,115'); SFX.slice();
        if (foe.invul <= 0 && foe.hp > 0) {
          applyHit(f, foe, { dmg: 45, kb: [0, 0], stun: 0, hs: 0.06, noScale: true, noStun: true, dir: foe.x >= f.x ? 1 : -1 }, [foe.x, foe.y - 60]);   // 只掉血，不让对手僵直
        }
      }
      if (f.skPh === 1 && f.t >= 0.12) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 36] : f.skPh === 2 ? ['dash', 60] : ['fy_xslash', 40],
    ai: (me, foe, d) => d > 120 },
  // ---- 绯影 · R（右键）：飞镖（kunai） ----
  kunai: { name: '飞镖', cd: 5, air: true, desc: '侧身一甩，四枚黑铁手里剑呈扇形激射。【无硬直击飞】，纯粹以极速密雨截断对手起手，穿透轻型投掷物。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; SFX.slice();
        for (const a of [-0.18, -0.06, 0.06, 0.18]) spawnProj(f, { kind: 'kunai', x: f.x + f.face * 30, y: f.y - 70, vx: f.face * 1250 * Math.cos(a), vy: 1250 * Math.sin(a), autoAim: true, w: 26, h: 14, life: 0.55, dmg: 25, kb: [80, 0], stun: 0.18, hs: 0.03, launch: false });
      }
      if (f.skPh === 1 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 28] : ['fy_crouch', 50], ai: (m, o, d) => d > 140 },
});
