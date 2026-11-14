Object.assign(ULTS, {
  // ---- 千机 · E：机轮三穿（recallball） ----
  recallball: { name: '机轮三穿', desc: '傀丸沿战场往返疾驰三次，再顺着金丝回到千机手中。每名敌人在本次大招中最多受到 120 点伤害；回手后傀丸收起并刷新 Q。若傀丸不在场，则先召出再发动。',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'fy_seal'; f.invul = 0.8; f.vx = 0; f.hitDone = false;
      let ball = projs.find(p => p.kind === 'ironball' && p.owner === f.idx && !p.dead);
      if (!ball) {
        spawnProj(f, { kind: 'ironball', yoyo: true, x: f.x + f.face * 42, y: f.y - 58, vx: f.face * 2700, vy: 0,
          g: 0, w: 36, h: 36, life: 999999, dmg: 40, kb: [260, -300], stun: 0.32, hs: 0.08,
          speedTier: 3, unbreakable: true, pierce: true, yoyoPhase: 'ult-pass', yoyoDir: f.face, yoyoPasses: 0, yoyoHitAt: {}, yoyoUltDealt: {} });
        ball = projs.find(p => p.kind === 'ironball' && p.owner === f.idx && !p.dead);
      }
      if (ball) {
        ball.yoyo = true; ball.yoyoPhase = 'ult-pass'; ball.yoyoDir = f.face || 1; ball.yoyoPasses = 0;
        ball.yoyoArrived = false; ball.yoyoHitAt = {}; ball.yoyoUltDealt = {}; ball.yoyoRange = STAGE_W;
        ball.dmg = 40; ball.kb = [260, -300]; ball.stun = 0.32; ball.hs = 0.08;
        ball.vx = ball.yoyoDir * 2700; ball.vy = 0; ball.g = 0; ball.unbreakable = true;
        ring(ball.x, ball.y, 100, f.look.slash || '235,165,70', 0.4);
      }
      ring(f.x, f.y - 50, 130, '255,225,120', 0.35); SFX.superOn(); SFX.gear();
    },
    update(f) {
      const ball = projs.find(p => p.kind === 'ironball' && p.owner === f.idx && !p.dead);
      if (!ball) { f.skillCD = 0; endSpecial(f); return; }
      if (ball.yoyoPhase === 'ult-return') ball.yoyoArrived = Math.abs(ball.x - f.x) < 52;
      if (ball.yoyoArrived) {
        ball.dead = true; f.skillCD = 0;
        ring(f.x, f.y - 50, 90, f.look.slash || '235,165,70', 0.35);
        addP({ type: 'text', text: '三穿归一 · 傀丸回手', x: f.x, y: f.y - 120, life: 0.9, max: 0.9, rgb: '255,225,120' });
        SFX.block(); SFX.dash(); endSpecial(f);
      }
    } },
});
