Object.assign(ULTS, {
  // ---- 勾陈 · 大招 E：开天一锤（skynet） ----
  skynet: { name: '开天一锤', desc: '把链锤甩上天，锤头越飞越大，变成一柄巨锤从对手头顶砸落（40 伤害，不可格挡），被砸中的人震晕定身 0.9 秒；随后扯链回锤把人拽到身前再抡一记（80 伤害，挑空），并重置飞锤冷却、附加【震魄】。巨锤落空就只砸出一个坑。',
    begin(f) { f.sp = 'cast'; f.spN = 0; f.spPose = 'gc_wind'; f.invul = 0.3; f.hitDone = false; SFX.superOn(); },
    update(f, foe) {
      if (f.spN === 0 && f.t >= 0.15) {
        f.spN = 1; f.spPose = 'gc_wind'; SFX.swing();
        spawnProj(f, { kind: 'net', vx: 0, x: foe.x, y: Math.min(0, foe.y) - 80, delay: 0.25, track: 6, trackEnd: 0.08, w: 320, h: 200, life: 0.55, dmg: 40, kb: [0, 0], stun: 0.9, hs: 0.1, root: true, pierce: true, maxHits: 2, unblockable: true, ult: true, noScale: true, unbreakable: true });
      }
      if (f.spN === 1 && f.t >= 0.95) {
        f.spN = 2;
        if (foe.rooted && foe.state === 'hitstun' && foe.hp > 0 && foe.invul <= 0) {
          f.face = foe.x >= f.x ? 1 : -1; f.spPose = 'gc_pull'; f.snap = true;
          foe.x = clamp(f.x + f.face * 70, WALL, STAGE_W - WALL); foe.y = 0;
          applyHit(f, foe, { dmg: 80, kb: [420, -820], stun: 0.6, hs: 0.2, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [foe.x, foe.y - 60]);
          foe.hookedT = 1.2; f.skillCD = 0;
          shake = Math.max(shake, 14); SFX.heavy();
          addP({ type: 'text', text: '回锤 · 飞锤重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '235,205,130' });
        } else f.spPose = 'idle';
      }
      if (f.t >= 1.3) endSpecial(f);
    } },
});
