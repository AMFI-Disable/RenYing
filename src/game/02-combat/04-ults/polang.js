Object.assign(ULTS, {
  // ---- 破浪 · 大招 E：沧海倾覆（maelstrom） ----
  maelstrom: { name: '沧海倾覆', desc: '重锚顿地崩裂碎石，掀起向两侧席卷的沧海双涛巨浪，强力破防并冲飞沿途所有敌军，同时自身回复满架势并获护体霸体。',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.vx = 0; f.spPose = 'ts_lift'; f.invul = 0.5;
      f.guard = f.maxGuard || 100; f.armorT = 2.0; f.armorHits = 3;
      SFX.heavy();
    },
    update(f, foe) {
      if (f.spN === 0 && f.t >= 0.22) {
        f.spN = 1; f.spPose = 'ts_slam';
        if (!RESIM) {
          shake = Math.max(shake, 22); flashA = 0.3; flashRGB = '90,215,255';
          ring(f.x, f.y - 30, 235, '90,215,255', 0.5); dust(f.x, f.y, 24);
          if (typeof debrisBurst === 'function') debrisBurst(f.x, f.y, 12, '105,185,220');
          SFX.ko();
        }
        strikeAoE(f, f.x, f.y - 50, 170, 120, { dmg: 52, kb: [300, -480], stun: 0.5, hs: 0.12, launch: true, unblockable: true, ult: true, noScale: true });
        for (const sd of [-1, 1]) {
          spawnProj(f, { kind: 'wave', x: f.x + sd * 45, y: f.y - 68, groundY: f.y, vx: sd * 960, vy: 0, w: 130, h: 145, life: 0.95, dmg: 95, kb: [560, -520], stun: 0.65, hs: 0.16, launch: true, pierce: true, maxHits: 4, rehit: 0.45, unblockable: true, ult: true, noScale: true, unbreakable: true, rgb: '85,215,255' });
        }
      }
      if (f.t >= 0.72) endSpecial(f);
    } },
});
