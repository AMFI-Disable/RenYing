Object.assign(ULTS, {
  // ---- 墨羽 · 大招 E：符阵（inkdragon） ----
  inkdragon: { name: '符阵', desc: `把攒下的符全部烧掉：整张图化作一张宣纸，全场一览无余，对手被朱砂染红，头顶的符轰然炸开。全图命中、不可格挡，伤害 = ${FU_BASE} + 每张符 ${FU_PER}（最多 ${FU_BASE + FU_PER * FU_MAX}）。`,
    begin(f) {
      f.sp = 'cast'; f.spPose = 'my_stroke'; f.invul = 0.2; SFX.superOn();
      f.spN = f.fu || 0; f.fu = 0;   // 符全部烧掉，记下这次烧了几张
    },
    update(f, foe) {
      if (f.t >= 0.25) f.spPose = 'my_paint';
      const foes = foesOf(f).filter(e => e && e.hp > 0);   // 全图命中：2v2 里两个对手都会炸
      const wait = foes.some(e => e.invul > 0) && f.t < 2.4;   // 对手正无敌（比如也在放大招）就等它结束再炸，最多多等一秒多
      if (f.t >= 0.95 && !f.hitDone && !wait) {
        f.hitDone = true; f.fuT = f.t;
        const n = f.spN || 0;
        if (foes.length) { shake = Math.max(shake, 14 + n * 3); flashA = Math.max(flashA, 0.35); flashRGB = '230,70,50'; SFX.ko(); }
        for (const e of foes) {
          const x = e.x, y = e.y - 150;
          ring(x, y, 90 + n * 18, '230,70,50', 0.5); ring(x, y, 50, '255,230,150', 0.4);
          for (let k = 0; k < 18 + n * 4; k++) { const a = rand(0, 6.28), v = rand(120, 420); addP({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, max: 0.6, rgb: k % 2 ? '235,200,90' : '230,70,50', w: 2.4, drag: 2 }); }
          if (e.invul <= 0) applyHit(f, e, { dmg: FU_BASE + FU_PER * n, kb: [0, -520], stun: 0.6, hs: 0.2, launch: true, unblockable: true, big: true, ult: true, noScale: true, dir: e.face * -1 }, [e.x, e.y - 80]);
          addP({ type: 'text', text: n ? `符爆 ×${n}` : '空符一张', x: e.x, y: e.y - 200, life: 1.1, max: 1.1, rgb: '230,70,50' });
        }
      }
      if (f.hitDone && f.t >= (f.fuT || 0.95) + 0.5) endSpecial(f);
    } },
});
