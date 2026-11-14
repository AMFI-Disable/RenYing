Object.assign(ULTS, {
  // ---- 流云 · 大招 E：龙卷（tornado） ----
  tornado: { name: '龙卷', desc: '舒袖展扇，乘风而起，放出两道接天龙卷横扫全场（每下 16 伤害）。施法激活【扶摇万里】：重置风刃与开扇冷却，空中跳跃次数全额回满，乘风浮空。',
    begin(f) {
      f.sp = 'cast'; f.spPose = 'ly_fanswipe'; f.invul = 0.2; f.spN = 0;
      f.skillCD = 0; f.skill2CD = 0; f.jumps = 0;
      addP({ type: 'text', text: '🌪️ 扶摇万里 · 开扇重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '150,255,200' });
      SFX.superOn();
    },
    update(f) {
      if (f.spN < 2 && f.t >= f.spN * 0.45) {
        const second = f.spN === 1; f.spN++;
        f.spPose = second ? 'ly_hover' : 'ly_fanswipe';
        spawnProj(f, { kind: 'tornado', x: f.x + f.face * 70, y: -110, vx: f.face * 360, w: 120, h: 230, life: 2.4, dmg: 16, kb: [40, -220], stun: 0.4, hs: 0.03, pierce: true, rehit: 0.12, maxHits: 8, launch: true, ult: true, unbreakable: true, noScale: true, lastBig: second, stick: 0.55 });
        SFX.swing();
      }
      if (f.t >= 0.85) endSpecial(f);
    } },
});
