Object.assign(ULTS, {
  // ---- 雷鸣 · 大招 E：雷霆万钧（thunder） ----
  thunder: { name: '雷霆万钧', desc: '一拳击破长空，引落九天神雷。三道天雷循着对手踪迹直劈而下（每道 48 伤害，破防击飞）。引雷触发【雷帝灌顶】：重置奔雷拳与撼地冷却，自身直接回涌 30% 绝技气量！',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'lm_kick'; f.invul = 0.2;
      f.skillCD = 0; f.skill2CD = 0; f.meter = Math.min(100, f.meter + 30);
      addP({ type: 'text', text: '⚡ 雷帝灌顶 · 拳劲重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '255,230,120' });
      SFX.superOn();
    },
    update(f, foe) {
      const times = [0.02, 0.38, 0.74];
      if (f.spN < 3 && f.t >= times[f.spN]) {
        f.spN++;
        f.spPose = f.spN % 2 ? 'lm_boxer' : 'lm_kick';
        spawnProj(f, { kind: 'bolt', x: clamp(foe.x + foe.vx * 0.2, WALL, STAGE_W - WALL), y: -360, vx: 0, w: 76, h: 720, life: 0.62, delay: 0.46, track: 5, trackEnd: 0.18, dmg: 48, kb: [0, -620], stun: 0.5, hs: 0.1, launch: true, unblockable: true, ult: true, unbreakable: true, noScale: true });
      }
      if (f.t >= 1.2) endSpecial(f);
    } },
});
