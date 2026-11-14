Object.assign(SKILLS, {
  // ---- 千机 · Q：金丝回环（throwball） ----
  throwball: { name: '金丝回环', cd: 0, desc: '沿当前朝向放出傀丸。金丝让它在有限距离内持续往返；普攻与蓄力攻击可以击打傀丸，改变方向并加速。傀丸回到身边后会再次出发。',
    can: f => !projs.some(p => p.kind === 'ironball' && p.owner === f.idx && !p.dead),
    lack: () => '傀丸已在阵中',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; f.t = 0;
        spawnProj(f, {
          kind: 'ironball', yoyo: true, yoyoPhase: 'loop', yoyoLeg: 'out', yoyoDir: f.face,
          yoyoCycle: 0, yoyoHitAt: {}, x: f.x + f.face * 40, y: f.y - 58, vx: f.face * 1450, vy: 0,
          g: 0, w: 36, h: 36, life: 999999, dmg: 24, kb: [180, -120], stun: 0.24, hs: 0.06, guardDamage: 34, blockGuardDamage: 12,
          speedTier: 2, resting: false, unbreakable: true, pierce: true, rehit: 0.7
        });
        ring(f.x + f.face * 40, f.y - 58, 60, f.look.slash || '235,165,70', 0.3);
        SFX.gear(); SFX.heavy();
      }
      if (f.skPh === 1 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 20] : ['l1a', 50],
    ai: (me, foe, d) => !projs.some(p => p.kind === 'ironball' && p.owner === me.idx && !p.dead) && d > 120 },
  // R snaps the tether into a fast lash and remains available as a hitstun breakout.
  // ---- 千机 · R：穿丝急袭（ballspike） ----
  ballspike: { name: '穿丝急袭', cd: 8, breakout: true, desc: '牵引傀丸沿当前朝向高速穿击，随后回到往返环。即使千机正处于受击硬直或浮空，也能强制解控发动；需要傀丸在场。',
    can: f => projs.some(p => p.kind === 'ironball' && p.owner === f.idx && !p.dead),
    lack: () => '阵中无傀丸',
    start(f) {
      const ball = projs.find(p => p.kind === 'ironball' && p.owner === f.idx && !p.dead);
      if (ball) {
        ball.yoyoPhase = 'lash'; ball.yoyoDir = f.face; ball.yoyoActionT = 0.42; ball.yoyoHitAt = {};
        ball.dmg = 48; ball.yoyoDmgT = 0.8; ball.speedTier = 3; ball.vy = 0; ball.g = 0;
        ring(ball.x, ball.y, 100, '255,220,110', 0.35); ring(ball.x, ball.y, 65, f.look.slash || '235,165,70', 0.3);
        shake = Math.max(shake, 8); SFX.dash();
      }
    },
    update(f) { if (f.t >= 0.2) toNeutral(f); },
    pose: () => ['fy_seal', 30],
    ai: (me, foe) => {
      const ball = projs.find(p => p.kind === 'ironball' && p.owner === me.idx && !p.dead);
      return ball && Math.sign(foe.x - ball.x) === (me.face || 1) && Math.abs(foe.y - (ball.y + 58)) < 110 && Math.abs(foe.x - ball.x) < 560;
    } },
});
