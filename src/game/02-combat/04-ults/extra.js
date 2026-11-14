Object.assign(ULTS, {
  // ---- 辅助招式（不直接占一个按键）：百鸟朝凤（phoenix） ----
  phoenix: { name: '百鸟朝凤', desc: '原地凝枪，向前连刺八道枪影，一枪远过一枪，末枪一挑把人送上半空（终结75伤害）。此招可挡。',
    begin(f) { f.sp = 'thrusts'; f.spN = 0; f.spPose = 'ls_stance'; f.invul = 0.2; },
    update(f, foe) {
      const n = Math.floor(f.t / 0.09);
      if (n >= f.spN && f.spN < 8) {
        const last = f.spN === 7; f.spN++;
        f.spPose = last ? 'ls_plant' : (f.spN % 2 ? 'ls_thrust' : 'ls_stance'); f.snap = true;
        slashLine(f.x + f.face * 130, f.y - 68 + rand(-18, 18), 0, f.look.slash); SFX.slice();
        if (foe.invul <= 0 && foe.hp > 0 && overlap(hitbox(f, [20, -112, 240, -28]), hurtbox(foe)))
          applyHit(f, foe, last ? { dmg: 75, kb: [520, -640], stun: 0.6, hs: 0.18, launch: true, big: true, ult: true, noScale: true }
                                : { dmg: 16, kb: [50, 0], stun: 0.36, hs: 0.03, ult: true, noScale: true }, [foe.x - f.face * 10, foe.y - 68]);
      }
      if (f.t >= 0.95) endSpecial(f);
    } },
  // ---- 辅助招式（不直接占一个按键）：八仙过海（eightimm） ----
  eightimm: { name: '八仙过海', flurry: true, n: 8, iv: 0.085, slash: 12, fin: 76, desc: '醉眼一睁，滚身扑入；一扑得手，八仙醉拳轮番上身。打完醉意直接灌满。' },
});
