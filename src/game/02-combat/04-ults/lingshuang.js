Object.assign(ULTS, {
  // ---- 凌霜 · 大招 E：刹那（timestop） ----
  timestop: { name: '刹那', desc: '长枪拄地，凝神入定，天地为之一滞。漫天枪影泼洒开来，终归于一线寒芒，极速贯穿（140 到 185 伤害）。贯穿得手触发【寒霜贯日】：重置回马枪与枪旋冷却，并令对手陷入 4 秒冰冻迟缓（移速减慢 40%）。',
    begin(f, foe) { f.sp = 'stop'; f.spPose = 'ls_stance'; f.invul = 99; superFreeze = 0.9; superOwner = f; f.spX = f.x; f.hitDone = false; SFX.superOn(); },
    update(f, foe) {
      if (f.sp === 'stop' && f.t >= 0.45) {
        f.sp = 'sweep'; f.spPose = 'ls_thrust'; f.snap = true;
        for (let k = 0; k < 8; k++) slashLine(f.x, f.y - 60, k * Math.PI / 8, f.look.slash);
        ring(f.x, f.y - 60, 160, f.look.slash, 0.4); ring(f.x, f.y - 60, 90, '255,255,255', 0.3); SFX.slice(); metal(1800, 0.8, 0.1);
      }
      if (f.sp === 'sweep' && f.t >= 0.8) { f.sp = 'rush'; f.t = 0; f.spPose = 'ls_thrust'; f.face = faceDir(f, foe); f.spX = f.x; SFX.dash(); }
      if (f.sp === 'rush') {
        f.vx = f.face * 1700;
        if (!f.hitDone && foe.hp > 0 && overlap(hitbox(f, [0, -150, 105, 4]), hurtbox(foe))) {
          f.hitDone = true; f.vx = 0;
          const dmg = clamp(140 + Math.abs(f.x - f.spX) / 10, 140, 185);
          applyHit(f, foe, { dmg: Math.round(dmg), kb: [480, -700], stun: 0.6, hs: 0.2, launch: true, unblockable: true, big: true, ult: true, noScale: true }, [foe.x, foe.y - 60]);
          f.skillCD = 0; f.skill2CD = 0;
          foe.slowT = 4.0;
          ring(foe.x, foe.y - 60, 160, '170,220,255', 0.5);
          addP({ type: 'text', text: '❄️ 寒芒贯日 · 回马枪重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '170,220,255' });
          addP({ type: 'text', text: '❄️ 冰冻减速', x: foe.x, y: foe.y - 100, life: 1.2, max: 1.2, rgb: '140,200,255' });
          f.sp = 'done'; f.t = 0; f.spPose = 'ls_plant';
          SFX.chargeFull();
        } else if (f.t > 0.8 || f.x <= WALL || f.x >= STAGE_W - WALL) { f.sp = 'done'; f.t = 0; f.vx *= 0.2; f.spPose = 'ls_plant'; }
      }
      if (f.sp === 'done' && f.t >= 0.3) endSpecial(f);
    } },
});
