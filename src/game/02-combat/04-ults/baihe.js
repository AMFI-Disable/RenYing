Object.assign(ULTS, {
  // ---- 白鹤 · 大招 E：冰河奔涌（wintertorrent） ----
  wintertorrent: { name: '冰河奔涌', desc: '霜剑引寒疾掠过阵，在所经层高连续凝结四座破土冰晶尖刺并齐射贯穿寒冰长枪，冻结迟缓沿途敌军并将其挑飞。',
    begin(f) {
      f.sp = 'skate'; f.spN = 0; f.vx = f.face * 1340; f.vy = 0; f.spPose = 'qf_thrust'; f.invul = 0.6;
      SFX.dash();
    },
    update(f, foe) {
      if (f.sp === 'skate') {
        if (f.spN < 4 && f.t >= 0.06 + f.spN * 0.08) {
          const sx = clamp(f.x, WALL + 30, STAGE_W - WALL - 30), sy = f.y;
          spawnProj(f, { kind: 'bolt', x: sx, y: sy - 95, groundY: sy, vx: 0, vy: 0, w: 78, h: 210, life: 0.44, delay: 0.09, dmg: 42, kb: [f.face * 180, -620], stun: 0.5, hs: 0.08, launch: true, unblockable: f.spN === 3, ult: true, noScale: true, unbreakable: true, small: true, pierce: true, rehit: 0.45, rgb: '150,235,255' });
          for (const dy of [-0.14, 0, 0.14]) {
            spawnProj(f, { kind: 'ice', x: sx + f.face * 24, y: sy - 64, vx: f.face * 1320 * Math.cos(dy), vy: 1320 * Math.sin(dy), w: 46, h: 22, life: 0.72, dmg: 18, kb: [140, -160], stun: 0.3, hs: 0.04, pierce: true, rehit: 0.4, ult: true, noScale: true, unbreakable: true });
          }
          if (!RESIM) { ring(sx, sy - 16, 94, '150,235,255', 0.36); dust(sx, sy, 8); SFX.slice(); }
          f.spN++;
        }
        if (f.t >= 0.36) { f.sp = 'finish'; f.t = 0; f.vx *= 0.15; }
      } else if (f.sp === 'finish') {
        if (f.t >= 0.26) endSpecial(f);
      }
    } },
});
