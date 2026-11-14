Object.assign(SKILLS, {
  // ---- 凌霜 · Q：回马枪（backthrust） ----
  backthrust: { name: '回马枪', cd: 6, desc: '先退一步让开身位，再回身一枪极远距离直取咽喉（判定延伸至 235 像素）。枪尖极远端挑中触发【枪尖穿心】（同一目标最多连挑 3 次，第 4 记强力震飞脱离）；枪旋余劲立时回转。',
    start(f) { f.vx = -f.face * 540; f.vy = -420; f.y = Math.min(f.y, -1); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.24) { f.skPh = 1; f.t = 0; f.vx = f.face * 180; f.hitDone = false; SFX.heavy(); }
      if (f.skPh === 1) {
        if (f.t < 0.12) {
          const curHits = foe.huiMaHits || 0;
          if (curHits >= 3) {
            if (strike(f, foe, { box: [20, -104, 235, -44], dmg: 45, kb: [680, -320], stun: 0.4, hs: 0.16, launch: true, big: true })) {
              foe.huiMaHits = 0;
              foe.invul = 0.65;
              foe.airRecover = true;
              f.skill2CD *= 0.5;
              shake = Math.max(shake, 14);
              ring(foe.x, foe.y - 60, 160, '170,220,255', 0.45);
              addP({ type: 'text', text: '💨 枪劲震退 · 浮空脱离', x: foe.x, y: foe.y - 110, life: 1.0, max: 1.0, rgb: '170,220,255' });
              SFX.heavy();
            }
          } else {
            if (strike(f, foe, { box: [20, -104, 235, -44], dmg: 60, kb: [340, -800], stun: 0.48, hs: 0.12, launch: true })) {
              foe.huiMaHits = curHits + 1;
              f.skill2CD *= 0.5;
              addP({ type: 'text', text: '枪尖穿心 (' + foe.huiMaHits + '/3)', x: foe.x, y: foe.y - 100, life: 0.8, max: 0.8, rgb: '170,220,255' });
            }
          }
        }
        if (f.t >= 0.34) toNeutral(f);
      }
    },
    pose: f => f.skPh === 0 ? ['ls_stance', 24] : ['ls_thrust', 60],
    ai: (me, foe, d) => d < 120 },
  // ---- 凌霜 · R（右键）：枪旋（spin） ----
  spin: { name: '枪旋', cd: 6, nofric: true, desc: '长枪急旋如风车，弹开半径扩大至 125 像素。旋转前段【无强控硬直】，末了第 8 记以乾坤大横扫（48 伤害）扫飞贴身之敌（对地面敌人仅平推硬直，仅浮空敌人会被击落地面）！',
    start(f) { f.vx = 0; f.spinN = 0; },
    update(f, foe) {
      const c = f.ctrl, dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
      f.vx = damp(f.vx, dir * wk(f) * 0.6, 10, STEP);
      if (dir !== 0) f.face = dir;
      // 弹开前方常规飞行道具
      for (const p of projs) {
        if (p.owner === foe.idx && !p.dead && !p.unbreakable) {
          if (Math.abs(p.x - f.x) < 125 && Math.abs(p.y - (f.y - 65)) < 85) {
            p.dead = true; blockFX(p.x, p.y, f.face); SFX.block();
            addP({ type: 'text', text: '破', x: p.x, y: p.y - 25, life: 0.45, max: 0.45, rgb: '170,220,255' });
          }
        }
      }
      const n = Math.floor(f.t / 0.25);
      if (n >= f.spinN && f.spinN < 8) {
        f.spinN++; f.hitDone = false; SFX.swing();
        const last = f.spinN === 8;
        const foeInAir = !foe.onGround() || airH(foe) > 2;
        strike(f, foe, last ? { box: [10, -135, 175, -10], dmg: 48, kb: foeInAir ? [420, -640] : [440, 0], stun: 0.50, hs: 0.12, launch: foeInAir, big: true }
                            : { box: [20, -126, 142, -14], dmg: 15, kb: [40, 0], stun: 0.18, hs: 0.03, launch: false, noScale: true });
      }
      if (f.t >= 2) toNeutral(f);
    },
    pose: () => ['ls_stance', 20], ai: (m, o, d) => d < 150 },
});
