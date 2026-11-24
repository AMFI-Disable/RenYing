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
      const times = [0.02, 0.36, 0.70];
      if (f.spN < 3 && f.t >= times[f.spN]) {
        const foes = (isMulti() ? foesOf(f).filter(t => t && t.hp > 0) : [foe]).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x));
        const tg = foes[f.spN % foes.length] || foe;
        f.spN++;
        f.spPose = f.spN % 2 ? 'lm_boxer' : 'lm_kick';
        const tx = clamp(tg.x + tg.vx * 0.2, WALL, STAGE_W - WALL);
        spawnProj(f, { kind: 'bolt', x: tx, y: -380, vx: 0, w: 84, h: 920, life: 0.62, delay: 0.44, track: 5, trackEnd: 0.18, dmg: 48, kb: [0, -620], stun: 0.5, hs: 0.1, launch: true, unblockable: true, ult: true, unbreakable: true, noScale: true, pierce: true, maxHits: 4 });
        for (const arcF of foes.slice(0, 3)) {
          if (!arcF || arcF === tg || Math.hypot(arcF.x - tx, arcF.y - tg.y) > 260) continue;
          spawnProj(f, { kind: 'bolt', x: arcF.x, y: arcF.y - 160, vx: 0, w: 46, h: 360, life: 0.32, delay: 0.18, dmg: 26, kb: [Math.sign(arcF.x - tx) * 140, -320], stun: 0.38, hs: 0.06, ult: true, unbreakable: true, noScale: true });
        }
      }
      if (f.t >= 1.2) endSpecial(f);
    } },
});
