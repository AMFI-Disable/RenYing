Object.assign(ULTS, {
  // ---- 离影 · 大招 E：万影归一（mistarray） ----
  mistarray: { name: '万影归一', desc: '场上每个雾身同时朝对手斩出一道刀光（每道 30 伤害，按雾身复制攻击的 75% 计算），然后全部散掉；0.3 秒后本体瞬移到对手身前补一刀（60 伤害，挑空），对手跳到半空也追得上。雾身越多刀越多，最多四刀。没有雾身时只有本体那一刀。刀光和补刀都不能格挡，但全程没有无敌：出手前被打中、对手闪开都会落空。补刀砍中后留影冷却清零。',
    begin(f, foe) {
      f.sp = 'cast'; f.spPose = 'fy_seal'; f.invul = 0; f.spN = 0; f.vx = 0;
      for (const c of (f.clones || []).slice()) {
        const d = foe.x >= c.x ? 1 : -1;
        spawnProj(f, { kind: 'wind', x: c.x + d * 30, y: (c.y || 0) - 62, vx: d * 1700, vy: 0, w: 70, h: 90, life: 0.45, dmg: 30, kb: [160, 0], stun: 0.6, hs: 0.08, ult: true, unblockable: true, noScale: true, unbreakable: true });   // 雾身以 75% 伤害出刀，本体后到
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
