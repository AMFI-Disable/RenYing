Object.assign(ULTS, {
  // ---- 燕翎 · 大招 E：万羽（featherstorm） ----
  // 升级：展翼凌霄，向五层战场倾泻 20 枚贯穿破甲箭羽（多角度扇射 + 穹顶箭雨，附带爆裂气环），适配 8v8 跨层覆射！
  featherstorm: { name: '万羽', desc: '展翼凌霄，唤来漫天贯穿破甲翎箭如暴雨倾泻（20 枚贯穿羽箭覆盖全场各层，命中激起穿甲风爆）。齐射触发【凌霄破虚】：重置俯冲与翎羽冷却，御空飞行耐力全额回满。',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'yl_wings'; f.invul = 0.28;
      f.skillCD = 0; f.skill2CD = 0; f.flyT = f.ch.fly || 1.2;
      if (!RESIM) {
        ring(f.x, f.y - 60, 165, '140,210,255', 0.4);
        addP({ type: 'text', text: '🪶 凌霄破虚 · 万箭齐发', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '140,190,255' });
      }
      SFX.superOn();
    },
    update(f, foe) {
      const n = Math.floor(f.t / 0.055);
      if (n >= f.spN && f.spN < 20) {
        const idx = f.spN++;
        f.spPose = idx % 2 ? 'yl_wings' : 'a1a';
        const pool = isMulti() ? foesOf(f).filter(ef => ef && !ef.hidden && ef.hp > 0) : [foe];
        const tg = pool.length ? pool[idx % pool.length] : foe;
        const skyY = Math.min((typeof arenaTopY === 'function' ? arenaTopY() : 0) - 200, (tg ? tg.y : 0) - 520);
        const tx = clamp((tg ? tg.x + tg.vx * 0.32 : f.x + f.face * 260) + grand(-140, 140), WALL + 16, STAGE_W - WALL - 16);
        const isVolley = idx % 4 === 0;
        if (isVolley) {
          // 自身位置扇形贯穿长箭（横扫当前与上下相邻层）
          const baseAng = tg ? Math.atan2((tg.y - 55) - (f.y - 68), tg.x - f.x) : (f.face > 0 ? 0 : Math.PI);
          for (const da of [-0.18, 0, 0.18]) {
            spawnProj(f, {
              kind: 'arrow', x: f.x + f.face * 28, y: f.y - 68,
              vx: Math.cos(baseAng + da) * 1450, vy: Math.sin(baseAng + da) * 1450,
              w: 38, h: 20, life: 1.15, dmg: 14, kb: [70, -120], stun: 0.28, hs: 0.02,
              ult: true, noScale: true, unbreakable: true, pierce: true, rehit: 0.35, aoeR: 54, aoeMul: 0.55, rgb: '140,220,255'
            });
          }
        } else {
          // 穹顶垂直贯层羽箭雨
          spawnProj(f, {
            kind: 'arrow', x: tx, y: skyY, vx: grand(-90, 90), vy: 1320, home: 4.5, homeV: 260,
            w: 24, h: 44, life: 1.45, dmg: 14, kb: [40, 0], stun: 0.28, hs: 0.02,
            ult: true, noScale: true, unbreakable: true, pierce: true, rehit: 0.4, rgb: '160,230,255'
          });
        }
      }
      if (f.t >= 1.18) endSpecial(f);
    } },
});
