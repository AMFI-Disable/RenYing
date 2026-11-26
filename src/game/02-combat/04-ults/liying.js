Object.assign(ULTS, {
  // ---- 离影 · 大招 E：万影归一（mistarray） ----
  mistarray: { name: '万影归一', desc: '场上每个雾身同时朝对手斩出一道影刃（极低伤害、不削架势，每道附加 3 层影印），然后全部散掉；0.3 秒后本体瞬移到对手身前补一刀（60 伤害，挑空），对手跳到半空或站在高台也追得上。雾身越多影刃越多，最多四道。没有雾身时只有本体那一刀。补刀砍中后留影冷却清零。',
    begin(f, foe) {
      f.sp = 'cast'; f.spPose = 'fy_seal'; f.invul = 0; f.spN = 0; f.vx = 0;
      // 最多四道影刃：挑离对手最近的四个雾身出刀，影刃造成极低伤害、不削架势，每道附加 3 层影印
      const near = (f.clones || []).slice().sort((a, b) => Math.hypot(a.x - foe.x, (a.y || 0) - foe.y) - Math.hypot(b.x - foe.x, (b.y || 0) - foe.y) || a.id - b.id).slice(0, 4);
      for (const c of near) {
        const d = foe.x >= c.x ? 1 : -1;
        const dy = ((foe.y || 0) - (c.y || 0));
        const dx = Math.max(120, Math.abs(foe.x - c.x));
        const spd = 1700;
        const len = Math.hypot(dx, dy) || 1;
        spawnProj(f, { kind: 'wind', x: c.x + d * 30, y: (c.y || 0) - 62, vx: (d * dx / len) * spd, vy: (dy / len) * spd, w: 70, h: 90, life: 0.45, dmg: 6, kb: [90, 0], stun: 0.25, hs: 0.04, ult: true, cloneEcho: true, noGuardDrain: true, shadowMark: 3, noScale: true, unbreakable: true });
        if (!RESIM) slashLine(c.x, (c.y || 0) - 60, d > 0 ? 0 : Math.PI, f.look.slash);
      }
      clearClones(f);
      SFX.swing();
    },
    update(f, foe) {
      if (f.spN === 0 && f.t >= 0.3) {
        f.spN = 1;
        const side = foe.x >= f.x ? 1 : -1;
        if (!RESIM) smoke(f.x, f.y - 50, 10);
        f.x = clamp(foe.x - side * 80, WALL, STAGE_W - WALL); f.vy = 0; f.face = side;
        if (foe.onGround()) mapPutOn(f, foe.plat); else { f.y = foe.y; f.plat = -1; }   // 对手站在平台上就落到那个平台；跳起来了就追到半空，砍完自己落下
        f.snap = true; f.trail.length = 0; f.scarf = [];
        f.spPose = 'l2a'; f.hitDone = false;
        if (strike(f, foe, { box: [0, -118, 110, 0], dmg: 60, kb: [240, -720], stun: 0.5, hs: 0.12, launch: true, ult: true, unblockable: true, noScale: true })) f.skillCD = 0;   // 补刀砍中：留影冷却清零，马上能再留雾身
        SFX.slice();
      }
      if (f.t >= 0.8) endSpecial(f);
    } },
  // 磁仙：正极磁石在天上、负极磁石在地上，把对手夹成三明治（对手是中间的肉饼）
});
