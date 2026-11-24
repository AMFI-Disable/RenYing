Object.assign(ULTS, {
  // ---- 雷鸣 · 大招 E：雷霆万钧（thunder） ----
  // 升级：引动五道分支九天神雷贯通五层战场直劈敌阵（8v8 自动锁敌分劈，1v1 聚焦轰击），每道落雷附带跨层连锁闪电！
  thunder: { name: '雷霆万钧', desc: '一拳击破长空，引动五道九天分支神雷贯通战场各层直劈而下（每道 46 伤害，破防击飞并附带跨层连锁电弧传导至周围敌手）。引雷触发【雷帝灌顶】：重置雷闪与金刚雷铠冷却，自身回涌 30% 绝技气量！',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'lm_kick'; f.invul = 0.25;
      f.skillCD = 0; f.skill2CD = 0; f.meter = Math.min(100, f.meter + 30);
      if (!RESIM) {
        ring(f.x, f.y - 60, 180, '255,240,140', 0.42);
        if (typeof lightningArc === 'function') {
          lightningArc(f.x, f.y - 380, f.x, f.y - 50, '255,245,170', 4, 0.3);
        }
        addP({ type: 'text', text: '⚡ 雷帝灌顶 · 拳劲重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '255,230,120' });
      }
      SFX.superOn(); SFX.thunder();
    },
    update(f, foe) {
      const times = [0.02, 0.24, 0.46, 0.68, 0.90];
      if (f.spN < 5 && f.t >= times[f.spN]) {
        const idx = f.spN++;
        f.spPose = idx % 2 ? 'lm_boxer' : 'lm_kick';
        const pool = isMulti() ? foesOf(f).filter(ef => ef && !ef.hidden && ef.hp > 0) : [foe];
        const target = pool.length ? pool[idx % pool.length] : foe;
        const tx = clamp((target ? target.x + target.vx * 0.18 : f.x + f.face * 240) + (pool.length === 1 && idx > 0 ? (idx % 2 ? 32 : -32) : 0), WALL + 20, STAGE_W - WALL - 20);
        const gy = target ? target.y : f.y;
        const topY = typeof arenaTopY === 'function' ? arenaTopY() - 200 : -720;
        const boltH = Math.max(520, gy - topY);
        spawnProj(f, {
          kind: 'bolt', x: tx, y: gy - boltH * 0.5, groundY: gy, vx: 0, w: 88, h: boltH,
          life: 0.64, delay: 0.4, track: 5.5, trackEnd: 0.14,
          dmg: 46, kb: [0, -620], stun: 0.5, hs: 0.1, launch: true, unblockable: true,
          ult: true, noScale: true, unbreakable: true, pierce: true, rehit: 0.55,
          chain: 2, chainRange: 340, chainRGB: '255,245,150', rgb: '255,240,145'
        });
      }
      if (f.t >= 1.32) endSpecial(f);
    } },
});
