Object.assign(ULTS, {
  // ---- 勾陈 · 大招 E：开天一锤（skynet） ----
  skynet: { name: '开天一锤', desc: '把链锤甩上天，巨锤在目标所在平台层轰然砸落（40 伤害，不可格挡并震裂碎石），震晕范围敌手 0.9 秒；随后扯链回锤把主目标拽到身前重抡挑空（80 伤害），并重置飞锤冷却！',
    begin(f) { f.sp = 'cast'; f.spN = 0; f.spPose = 'gc_wind'; f.invul = 0.3; f.hitDone = false; SFX.superOn(); },
    update(f, foe) {
      if (f.spN === 0 && f.t >= 0.15) {
        f.spN = 1; f.spPose = 'gc_wind'; SFX.swing();
        const gy = foe ? Math.min(0, foe.y) : f.y;
        spawnProj(f, { kind: 'net', vx: 0, x: foe ? foe.x : f.x + f.face * 220, y: gy - 80, groundY: gy, delay: 0.25, track: 6, trackEnd: 0.08, w: 340, h: 210, life: 0.55, dmg: 40, kb: [0, 0], stun: 0.9, hs: 0.1, root: true, pierce: true, maxHits: 2, rehit: 0.5, unblockable: true, ult: true, noScale: true, unbreakable: true });
      }
      if (f.spN === 1 && f.t >= 0.95) {
        f.spN = 2;
        if (foe && foe.rooted && foe.state === 'hitstun' && foe.hp > 0 && foe.invul <= 0) {
          f.face = foe.x >= f.x ? 1 : -1; f.spPose = 'gc_pull'; f.snap = true;
          foe.x = clamp(f.x + f.face * 70, WALL, STAGE_W - WALL);
          if (f.plat >= 0 && typeof mapPutOn === 'function') mapPutOn(foe, f.plat);
          else { foe.y = f.y; foe.plat = f.plat; }
          applyHit(f, foe, { dmg: 80, kb: [420, -820], stun: 0.6, hs: 0.2, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [foe.x, foe.y - 60]);
          if (!isClient() && typeof strikeAoE === 'function') strikeAoE(f, foe.x, foe.y - 55, 190, 130, { dmg: 48, kb: [320, -560], stun: 0.45, hs: 0.1, launch: true, ult: true, noScale: true }, [foe.idx]);
          foe.hookedT = 1.2; f.skillCD = 0;
          shake = Math.max(shake, 16); SFX.heavy();
          if (!RESIM && typeof debrisBurst === 'function') debrisBurst(foe.x, foe.y, 12, '145,125,95');
          addP({ type: 'text', text: '回锤 · 飞锤重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '235,205,130' });
        } else f.spPose = 'idle';
      }
      if (f.t >= 1.3) endSpecial(f);
    } },
});
