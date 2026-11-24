Object.assign(ULTS, {
  // ---- 银狐 · 大招 E：九尾绝影（ninestrike） ----
  ninestrike: { name: '九尾绝影', desc: '在敌方所在层幻化三道银狐影身封锁退路，本体三次瞬移绕背交错绝斩，收招刷新闪避与虚招冷却。',
    begin(f, foe) {
      f.sp = 'ambush'; f.spN = 0; f.vx = 0; f.vy = 0; f.spPose = 'fy_blink'; f.invul = 0.75;
      if (foe) {
        for (const off of [-90, 0, 90]) {
          const dx = clamp(foe.x + off, WALL + 20, STAGE_W - WALL - 20);
          decoys.push({ owner: f.idx, sk: f.sk, x0: dx, y0: foe.y, x: dx, y: foe.y, vx: 0, vy: 0, rot: 0, vr: 0, life: 1.2, landed: true, age: 0 });
        }
      }
      SFX.dash();
    },
    update(f, foe) {
      if (f.spN < 3 && f.t >= 0.14 + f.spN * 0.16) {
        const tg = foe && foe.hp > 0 ? foe : null;
        if (tg) {
          const side = f.spN % 2 === 0 ? -1 : 1;
          f.x = clamp(tg.x + side * 78, WALL + 20, STAGE_W - WALL - 20);
          f.y = tg.y; f.plat = tg.plat; f.face = -side; f.snap = true;
          const last = f.spN === 2;
          if (!RESIM) { slashLine(tg.x, tg.y - 54, (f.spN - 1) * 0.65, '220,235,255'); ring(tg.x, tg.y - 54, last ? 150 : 95, '210,230,255', 0.36); SFX.slice(); }
          if (!invulVs(tg, f)) {
            applyHit(f, tg, { dmg: last ? 74 : 42, kb: [last ? -side * 380 : 80, last ? -540 : -120], stun: last ? 0.65 : 0.35, hs: last ? 0.16 : 0.08, launch: last, unblockable: last, ult: true, noScale: true, big: last, dir: -side }, [tg.x, tg.y - 54]);
          }
        }
        f.spN++;
      }
      if (f.t >= 0.78) {
        f.dashCD = 0; f.feintCD = 0; f.snap = false;
        endSpecial(f);
      }
    } },
});
