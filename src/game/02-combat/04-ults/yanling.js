Object.assign(ULTS, {
  // ---- 燕翎 · 大招 E：万羽（featherstorm） ----
  featherstorm: { name: '万羽', desc: '展翼直上九霄，唤来漫天破甲翎羽如暴雨倾泻（14 枚，每枚 14 伤害）。齐射触发【凌霄破虚】：重置俯冲突袭与翎羽射击冷却，御空飞行耐力全额回满。',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'yl_wings'; f.invul = 0.2;
      f.skillCD = 0; f.skill2CD = 0; f.flyT = f.ch.fly || 1.2;
      addP({ type: 'text', text: '🪶 凌霄破虚 · 俯冲重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '140,190,255' });
      SFX.superOn();
    },
    update(f, foe) {
      const n = Math.floor(f.t / 0.07);
      if (n >= f.spN && f.spN < 14) {
        f.spN++;
        f.spPose = f.spN % 2 ? 'yl_wings' : 'a1a';
        spawnProj(f, { kind: 'feather', x: clamp(foe.x + foe.vx * 0.4 + grand(-110, 110), WALL, STAGE_W - WALL), y: -620, vx: grand(-60, 60), vy: 1100, home: 4, homeV: 240, w: 22, h: 40, life: 1.2, dmg: 14, kb: [40, 0], stun: 0.3, hs: 0.02, ult: true, noScale: true, unbreakable: true });
      }
      if (f.t >= 1.1) endSpecial(f);
    } },
});
