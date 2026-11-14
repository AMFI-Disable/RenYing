Object.assign(ULTS, {
  // ---- 醉翁 · 大招 E：山水之间（shanshui） ----
  shanshui: { name: '山水之间', desc: '醉翁之意不在酒，在乎山水之间也。展开一幅满屏山水，从天上一路压下来，压下去的过程中对手共受 120 伤害（8 下，每下 15，不可格挡，躲在哪都逃不掉，只有腾空闪的无敌能躲开几下）。画卷落下后对手困在蓬莱境里 2 秒：对手的屏幕被画挡住，看不见自己和醉翁在哪，只有醉翁一方看得见。',
    begin(f) { f.sp = 'cast'; f.spN = 0; f.spPose = 'zx_drink'; f.invul = 0.3; SFX.superOn(); },
    update(f, foe) {
      if (f.spN < 8 && f.t >= 0.35 + f.spN * 0.17) {
        f.spN++; f.spPose = f.spN % 2 ? 'zx_sway' : 'zx_drink';
        if (foe.hp > 0 && foe.invul <= 0) applyHit(f, foe, { dmg: 15, exact: true, kb: [0, 0], stun: 0.35, hs: 0.03, unblockable: true, ult: true, noScale: true, dir: f.face }, [foe.x, foe.y - 60]);
        shake = Math.max(shake, 4 + f.spN); SFX.thud();
      }
      if (f.t >= 1.95) { if (foe.hp > 0) foe.veilT = PENGLAI_T; endSpecial(f); }
    } },
});
