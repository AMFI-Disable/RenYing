Object.assign(ULTS, {
  // ---- 磁仙 · 大招 E：天地磁合（sandwich） ----
  sandwich: { name: '天地磁合', desc: '对手脚下浮出一块负极磁石、头顶压下一块正极磁石，两块磁石异极相吸，把对手牢牢吸住、越合越快，最后合拢夹成肉饼（125 伤害，不可格挡），被夹扁的人定住 1 秒。放的时候对手正在腾空闪这类无敌里，就只吸得住磁石，夹不到人。',
    begin(f, foe) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'lm_boxer'; f.invul = 0.75; f.vx = 0; f.hitDone = false;   // 合拢之前不会被打断
      f.sw = { x: clamp(foe.x, WALL, STAGE_W - WALL), top: -640, hit: 0, v: foe.idx, t: 0 };   // v：夹的是谁（存序号，回滚存档存得下）
      SFX.superOn(); ring(f.sw.x, -10, 120, magRGB(-1), 0.4);
    },
    update(f, foe) {
      const S = f.sw; if (!S) { endSpecial(f); return; }
      foe = fighterByIdx(S.v);   // 2v2 里一直夹放招时选中的那个人
      S.t = f.t;
      if (f.spN === 0 && foe.hp > 0) S.x = clamp(damp(S.x, foe.x, 12, STEP), WALL, STAGE_W - WALL);   // 吸住之前磁石跟着对手
      if (f.spN === 0 && f.t >= 0.12) {   // 吸住：对手被两块磁石定在中间
        f.spN = 1; f.spPose = 'victory';
        if (!isClient() && foe.hp > 0 && foe.invul <= 0) {
          S.hit = 1;
          foe.state = 'held'; foe.t = 0; foe.vx = 0; foe.vy = 0; foe.move = null; foe.skill = null; foe.sp = null;
        }
        SFX.charge();
      }
      if (f.spN === 1) {
        const u = clamp((f.t - 0.12) / 0.5, 0, 1);
        S.top = -640 + (640 - 120) * u * u * u;   // 越合越快
        if (S.hit && foe.state === 'held') { magMove(foe, damp(foe.x, S.x, 14, STEP)); foe.y = damp(foe.y, 0, 14, STEP); }
        if (!RESIM && Math.random() < 0.5) addP({ type: 'spark', x: S.x + rand(-60, 60), y: S.top + 20, vx: 0, vy: rand(300, 600), rgb: magRGB(1), life: 0.2, max: 0.2, w: 1.6 });
        if (u >= 1) {
          f.spN = 2; S.top = -120;
          shake = Math.max(shake, 20); flashA = Math.max(flashA, 0.3); flashRGB = '255,255,255'; SFX.heavy(); SFX.thud();
          dust(S.x, 0, 18); ring(S.x, -60, 150, magRGB(1), 0.4); ring(S.x, -60, 110, magRGB(-1), 0.4);
          const caught = S.hit ? foe.state === 'held' : (foe.hp > 0 && foe.invul <= 0 && Math.abs(foe.x - S.x) < 90 && foe.y > -170);
          if (caught && !isClient()) {
            magMove(foe, S.x); foe.y = 0;
            applyHit(f, foe, { dmg: 125, kb: [0, 0], stun: 1.0, hs: 0.22, root: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [foe.x, foe.y - 60]);
            if (foe.state === 'held') toNeutral(foe);
            foe.squashT = 1.0;
            addP({ type: 'text', text: '天地磁合 · 夹成肉饼', x: S.x, y: -200, life: 1.1, max: 1.1, rgb: '255,220,200' });
          }
        }
      }
      if (f.t >= 1.15) { magRelease(f); endSpecial(f); }
    } },
  // 千机：三次横穿后沿金丝收回，单个目标每次最多承受 120 点。
});
