Object.assign(SKILLS, {
  // ---- 勾陈 · Q：飞锤（hook） ----
  hook: { name: '飞锤', cd: 4, air: true, desc: '把链锤朝对手甩出去（射程约 495），锤头砸中就扯链把对手拽到身前，并施加【震魄】：1.2 秒内对手受到的伤害提高 25%。被格挡或被霸体吃掉时带不动。',
    start(f) { f.vx *= 0.2; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.12) { f.skPh = 1; SFX.heavy(); spawnProj(f, { kind: 'hook', x: f.x + f.face * 40, y: f.y - 72, vx: f.face * 1500, autoAim: true, w: 44, h: 40, life: 0.33, dmg: 18, kb: [0, 0], stun: 0.35, hs: 0.06, hook: true }); }
      if (f.skPh === 1 && f.t >= 0.36) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['gc_wind', 30] : f.t < 0.18 ? ['gc_throw', 60] : ['gc_pull', 40],
    ai: (me, foe, d) => d > 160 && d < 500 },
  // ---- 勾陈 · R（右键）：旋锤（whirl） ----
  whirl: { name: '旋锤', cd: 5, nofric: true, desc: '把链锤拎过头顶抡圆了转（约 1 秒，半径约 150），转圈时能慢慢挪步：前四圈每圈砸一下（每下 7 伤害），第五圈松手一甩把人砸飞（30 伤害）。锤风还能砸碎飞来的暗器。',
    start(f) { f.vx = 0; f.spN = 0; f.hitDone = false; },
    update(f, foe) {
      const c = f.ctrl, dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
      f.vx = damp(f.vx, dir * wk(f) * 0.45, 10, STEP);
      if (dir !== 0) f.face = dir;
      if (f.t > 0.1 && f.t < 1.0) for (const p of projs) {
        if (p.owner === foe.idx && !p.dead && !p.unbreakable && !p.ult && Math.abs(p.x - f.x) < 150 && Math.abs(p.y - (f.y - 90)) < 100) { p.dead = true; blockFX(p.x, p.y, f.face); SFX.block(); }
      }
      const n = f.t < 0.15 ? 0 : Math.min(5, 1 + Math.floor((f.t - 0.15) / 0.2));
      if (n > f.spN) {
        f.spN = n; f.hitDone = false; SFX.swing();
        const last = n === 5;
        if (strike(f, foe, last ? { box: [-160, -190, 160, 0], dmg: 30, kb: [560, -380], stun: 0.55, hs: 0.12, launch: true, big: true }
                                : { box: [-150, -180, 150, 0], dmg: 7, kb: [40, 0], stun: 0.28, hs: 0.03, noScale: true }) && last)
          addP({ type: 'text', text: '脱手一甩', x: foe.x, y: foe.y - 100, life: 0.7, max: 0.7, rgb: '235,205,130' });
      }
      if (f.t >= 1.2) toNeutral(f);
    },
    pose: f => f.spN >= 5 ? ['gc_throw', 50] : ['gc_spin', 30],
    ai: (me, foe, d) => d < 170 },
});
