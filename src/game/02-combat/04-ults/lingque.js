Object.assign(ULTS, {
  // ---- 凌雀 · 大招 E：万线归宗（needlestorm） ----
  needlestorm: { name: '万线归宗', desc: '凌雀跃至半空织就漫天悬丝罗网，子母梭如疾风暴雨全屏交错绞杀敌人（7 段 12 伤害 + 终结 56 伤害），附加【雀芒】印记并重置换影冷却。',
    begin(f, foe) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'du_l1s'; f.invul = 0.40; f.vx = 0; f.vy = -360; f.y = -1; SFX.superOn();
    },
    update(f, foe) {
      f.vx = 0; f.vy = damp(f.vy, 0, 8, STEP);
      if (f.spN < 7 && f.t >= 0.15 + f.spN * 0.08) {
        f.spN++;
        SFX.slice();
        const sd = (f.spN % 2 === 0) ? 1 : -1;
        const ang = (f.spN * 0.6) % 3.14;
        slashLine(foe.x + rand(-40, 40), foe.y - 50 + rand(-30, 30), ang, '235,110,210');
        ring(foe.x, foe.y - 50, 70 + f.spN * 10, '235,110,210', 0.25);
        if (foe.hp > 0 && foe.invul <= 0) {
          applyHit(f, foe, { dmg: 12, exact: true, kb: [60, -40], stun: 0.26, hs: 0.03, unblockable: true, ult: true, noScale: true, dir: sd }, [foe.x, foe.y - 50]);
          addNeedleMark(foe, 1);
        }
      }
      if (f.spN === 7 && f.t >= 0.78) {
        f.spN = 8;
        f.y = 0; f.vy = 0;
        shake = Math.max(shake, 16); SFX.heavy(); SFX.slice();
        ring(foe.x, foe.y - 50, 150, '255,140,225', 0.45);
        if (foe.hp > 0 && foe.invul <= 0) {
          applyHit(f, foe, { dmg: 56, kb: [300, -700], stun: 0.55, hs: 0.16, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [foe.x, foe.y - 50]);   // kb 只写大小，方向由 dir 带
          addNeedleMark(foe, 1);
          f.skill2CD = 0;
          addP({ type: 'text', text: '✦ 雀芒入魂 · 悬丝归宗 ✦', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '255,140,225' });
        }
      }
      if (f.t >= 1.15) endSpecial(f);
    } },
  // 离影：每个雾身朝对手斩出一道刀光，然后全部散掉；本体最后瞬移到对手身前补一刀。没有雾身就只剩这一刀。没有无敌（只有出手那一下的定格）
});
