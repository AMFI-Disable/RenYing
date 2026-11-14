Object.assign(SKILLS, {
  // ---- 磁仙 · Q：极性反转（polarswap） ----
  polarswap: { name: '极性反转', cd: 6, instant: true, desc: '正极和负极互换，不花出招时间，空中也能用；身上亮起一个大大的红色 ⊕ 或蓝色 ⊖，换完立刻清零「磁极」（R）的冷却。负极普攻消磁了，换一下极性就恢复。',
    start(f) {
      f.pol = f.pol > 0 ? -1 : 1; f.polT = 0.6; f.skill2CD = 0; f.mChain = 0; f.mT = 0;   // 换极性也顺便恢复消磁
      ring(f.x, f.y - 60, 90, magRGB(f.pol), 0.3); SFX.parry();
      addP({ type: 'text', text: magName(f.pol), x: f.x, y: f.y - 125, life: 0.7, max: 0.7, rgb: magRGB(f.pol) });
      toNeutral(f);
    },
    update(f) { toNeutral(f); },
    pose: () => ['idle', 14],
    ai: () => false },
  // ---- 磁仙 · R（右键）：磁极（magfield） ----
  magfield: { name: '磁极', cd: 6, desc: `正极：身边生出一圈磁石，把周围的敌人用力弹走，离得越近弹得越远（${MAG.rPlusDmg} 伤害）。负极：把中距离的对手吸过来，越近吸得越快，吸到身前定住 ${MAG.rMinusStun} 秒，不会倒地（${MAG.rMinusDmg} 伤害，挡不住）。`,
    start(f) { f.vx = 0; f.magN = f.pol; f.magTg = -1; },   // 按起手那一刻的极性放
    update(f, foe) {
      const plus = f.magN > 0;
      if (f.skPh === 0 && f.t >= (plus ? 0.14 : 0.16)) {
        f.skPh = 1; f.t = 0; f.hitDone = false;
        const tg = sdTarget(f, foe) || foe, rgb = magRGB(f.magN), plusRange = mapMagRange(f, MAG.rPlusR), minusRange = mapMagRange(f, MAG.rMinusRange);
        if (plus) {
          for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; addP({ type: 'mag', pol: 1, x: f.x + Math.cos(a) * 40, y: f.y - 60 + Math.sin(a) * 30, vx: Math.cos(a) * 520, vy: Math.sin(a) * 300, rot: a, r: 11, life: 0.32, max: 0.32, drag: 3 }); }
          ring(f.x, f.y - 60, plusRange, rgb, 0.35); shake = Math.max(shake, 10); SFX.heavy();
          const d = Math.hypot(tg.x - f.x, tg.y - f.y), near = clamp(1 - d / plusRange, 0, 1);   // 越近越大
          const dir = (Math.sign(tg.x - f.x) || f.face) * MAG.rPlusDir;
          strike(f, tg, { box: [-plusRange, -150, plusRange, 20], dmg: MAG.rPlusDmg, kb: [MAG.rPlusKb[0] + MAG.rPlusKb[1] * near, -360 - 260 * near], stun: 0.5, hs: 0.1, launch: true, big: true, dir });
        } else {
          ring(f.x, f.y - 60, 70, rgb, 0.3); SFX.dash();
          addP({ type: 'mag', pol: -1, x: f.x + f.face * 34, y: f.y - 62, vx: 0, vy: 0, rot: 0, r: 13, life: 0.45, max: 0.45 });
          const dx = tg.x - f.x;
          if (!isClient() && tg.hp > 0 && tg.invul <= 0 && Math.abs(dx) <= minusRange && Math.abs(tg.y - f.y) < 310) {
            f.face = Math.sign(dx) || f.face; f.magTg = tg.idx; f.hitDone = true;
            tg.state = 'held'; tg.t = 0; tg.vx = 0; tg.vy = 0; tg.move = null; tg.skill = null; tg.sp = null;
          }
        }
      }
      if (f.skPh === 1 && f.magTg >= 0) {   // 负极：一帧一帧吸过来，越近越快
        const tg = fighterByIdx(f.magTg), dx = f.x + f.face * 72 - tg.x, d = Math.abs(tg.x - f.x);
        if (tg.state !== 'held' || tg.hp <= 0) f.magTg = -1;
        else {
          const v = magForce(MAG.rMinusK, d, MAG.rMinusV[0], MAG.rMinusV[1]), stepX = Math.sign(dx) * Math.min(Math.abs(dx), v * STEP);
          magMove(tg, tg.x + stepX); tg.y = damp(tg.y, gndY(f), 18, STEP);   // 吸到磁仙脚下那一层
          if (!RESIM && Math.random() < 0.7) addP({ type: 'spark', x: tg.x, y: tg.y - 60 + rand(-20, 20), vx: Math.sign(dx) * rand(300, 600), vy: rand(-30, 30), rgb: magRGB(-1), life: 0.2, max: 0.2, w: 2 });
          if (Math.abs(dx) < 2 || f.t >= MAG.rMinusTime) {
            f.magTg = -1; mapPutOn(tg, f.plat);
            applyHit(f, tg, { dmg: MAG.rMinusDmg, kb: [0, 0], stun: MAG.rMinusStun, hs: 0.08, root: true, unblockable: true, dir: f.face }, [tg.x, tg.y - 60]);
            if (tg.state === 'held') toNeutral(tg);
            ring(tg.x, tg.y - 60, 60, magRGB(-1), 0.25); SFX.thud();
          }
        }
      }
      if (f.skPh === 1 && f.magTg < 0 && f.t >= 0.24) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['lm_boxer', 26] : [f.magN > 0 ? 'hva' : 'yx_push', 56],
    ai: (me, foe, d) => me.pol > 0 ? d < MAG.rPlusR + 10 : d > 120 && d < MAG.rMinusRange - 40 },
  // 千机：Q 投出傀丸，金丝将其约束在可控的往返环中。
});
