Object.assign(SKILLS, {
  // ---- 月华 · R（右键）：月轮（moonring） ----
  moonring: { name: '月轮', cd: 4.5, desc: '双月刃体积增大，脱手去程仅为快速轻削（无挑空）；自背后折返的一记附带【背袭破防】（0.78 秒强力击飞与晕眩），专破死守前方的架势。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) { f.skPh = 1; SFX.swing(); spawnProj(f, { kind: 'moonring', x: f.x + f.face * 40, y: f.y - 65, vx: f.face * 740, w: 56, h: 56, life: 1.8, dmg: 28, kb: [100, 0], stun: 0.25, launch: false, hs: 0.04, pierce: true, rehit: 0.3, maxHits: 2, boomer: true, turn: 0.38 }); }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yh_mirror', 28] : ['l2a', 50], ai: (m, o, d) => d > 120 && d < 400 },
  // ---- 月华 · Q：月镜（mirror） ----
  mirror: { name: '月镜', cd: 7, nofric: true, desc: '举月轮如镜护胸，凝立 0.45 秒。近身来犯者被格开，随之而来的反斩施加【太阴绝罚】（95 伤害、1.05 秒超长硬直）与【禁身锁定】，无从闪避！',
    start(f) { f.parryT = 0.45; },
    update(f, foe) {
      if (f.skPh === 0) { const c = f.ctrl, dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0); f.vx = damp(f.vx, dir * wk(f), 14, STEP); } else f.vx = damp(f.vx, 0, 10, STEP);
      if (f.skPh === 0 && f.t >= 0.45) { f.skPh = 1; f.t = 0; f.parryT = 0; }
      if (f.skPh === 1 && f.t >= 0.35) toNeutral(f);
      if (f.skPh === 2) {
        if (f.t >= 0.06 && !f.hitDone) {
          f.hitDone = true;
          applyHit(f, foe, COUNTER, [foe.x, foe.y - 60]);
          foe.breakCD = Math.max(foe.breakCD, 0.75);
          addP({ type: 'text', text: '🌙 太阴绝罚 · 禁身锁定', x: foe.x, y: foe.y - 110, life: 1.1, max: 1.1, rgb: '220,190,255' });
        }
        if (f.t >= 0.42) toNeutral(f);
      }
    },
    pose: f => f.skPh === 0 ? ['yh_mirror', 40] : f.skPh === 2 ? ['hva', 60] : ['idle', 10],
    ai: () => false },
});
