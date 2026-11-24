Object.assign(ULTS, {
  // ---- 玄玑 · 大招 E：星宿归元（celestial） ----
  celestial: { name: '星宿归元', desc: '布下北斗七星天枢阵，七道星辉星丸自高空跨层追踪齐射敌阵并引落紫微星雷，同时为自身及附近队友回复气血与满架势。',
    begin(f, foe) {
      f.sp = 'cast'; f.spN = 0; f.vx = 0; f.spPose = 'yx_play'; f.invul = 0.55;
      for (const m of sideFighters(fighterTeam(f))) {
        if (!m.hidden && m.hp > 0 && Math.hypot(m.x - f.x, m.y - f.y) < 580) {
          m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.08));
          m.guard = m.maxGuard || 100;
        }
      }
      if (!RESIM) { ring(f.x, f.y - 70, 200, '165,195,255', 0.5); SFX.chargeFull(); }
    },
    update(f, foe) {
      if (f.spN < 7 && f.t >= 0.09 + f.spN * 0.09) {
        const idx = f.spN++;
        const pool = isMulti() ? foesOf(f).filter(ef => ef && !ef.hidden && ef.hp > 0) : [foe];
        const tg = pool.length ? pool[idx % pool.length] : foe;
        const ang = -Math.PI + (idx / 6) * Math.PI;
        const sx = f.x + Math.cos(ang) * 100, sy = f.y - 125 + Math.sin(ang) * 58;
        const tx = tg ? tg.x : f.x + f.face * 260, ty = tg ? tg.y - 54 : f.y - 54;
        const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
        spawnProj(f, { kind: 'star', x: sx, y: sy, vx: (dx / d) * 1220, vy: (dy / d) * 1220, w: 40, h: 40, life: 0.92, dmg: 24, kb: [160, -240], stun: 0.34, hs: 0.05, autoAim: true, pierce: true, rehit: 0.4, aoeR: 75, aoeMul: 0.6, ult: true, noScale: true, unbreakable: true, rgb: '175,205,255' });
        if (idx === 6 && tg) {
          const gy = tg.y, topY = (typeof arenaTopY === 'function' ? arenaTopY() : 0) - 180;
          const bh = Math.max(480, gy - topY);
          spawnProj(f, { kind: 'bolt', x: clamp(tg.x, WALL + 20, STAGE_W - WALL - 20), y: gy - bh * 0.5, groundY: gy, vx: 0, w: 92, h: bh, life: 0.55, delay: 0.25, dmg: 44, kb: [0, -560], stun: 0.48, hs: 0.1, launch: true, unblockable: true, ult: true, noScale: true, unbreakable: true, pierce: true, chain: 2, chainRange: 340, chainRGB: '175,195,255', rgb: '175,200,255' });
        }
        if (!RESIM) {
          ring(sx, sy, 52, '170,210,255', 0.28);
          addP({ type: 'beam', x: sx, y: sy, x2: sx + (dx / d) * 90, y2: sy + (dy / d) * 90, w: 10, life: 0.18, max: 0.18, rgb: '180,215,255' });
        }
        SFX.slice();
      }
      if (f.t >= 0.98) endSpecial(f);
    } },
});
