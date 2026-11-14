Object.assign(SKILLS, {
  // ---- 玉箫 · Q：清音（soundwave） ----
  soundwave: { name: '清音', cd: 3.2, air: true, desc: '横箫一吹，放出一道音波。普攻攒下的音律会一次吹尽：每枚音律让音波更大、更快、伤害 +20；三律齐鸣时音波穿透、挑空、不可斩散，并让对手陷入【绕梁 · 失律】（2.2 秒迟缓）。',
    start(f) { f.vx *= 0.3; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; const n = Math.min(3, f.notes || 0); f.notes = 0;
        SFX.note(n);
        spawnProj(f, { kind: 'note', x: f.x + f.face * 40, y: f.y - 70, vx: f.face * (620 + 60 * n), autoAim: true, w: 54 + 16 * n, h: 54 + 16 * n, grow: 40 + 14 * n, life: 0.95,
          dmg: 22 + 20 * n, kb: [200 + 40 * n, n >= 3 ? -420 : 0], stun: 0.3 + 0.06 * n, hs: 0.05 + 0.015 * n, launch: n >= 3, unbreakable: n >= 3, maxHits: 1, notes: n });
        if (n >= 3) addP({ type: 'text', text: '三律齐鸣', x: f.x, y: f.y - 120, life: 0.8, max: 0.8, rgb: '150,240,200' });
      }
      if (f.skPh === 1 && f.t >= 0.2) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yx_play', 30] : ['yx_push', 50],
    ai: (me, foe, d) => d > 110 && d < 700 && ((me.notes || 0) >= 2 || d > 240) },
  // ---- 玉箫 · R（右键）：回音壁（echowall） ----
  echowall: { name: '回音壁', cd: 6, breakout: true, desc: '以箫声筑起一道回音壁（0.6 秒）：贴身之敌被音浪推开（身上每枚音律 +8 伤害）；期间飞来的暗器、剑气、风刃会原路弹回，归玉箫所有，每弹回一次再得一枚音律。起手自带一次霸体。大招与地面陷阱无法弹回。',
    start(f) { f.vx = 0; if (f.y < 0) f.vy = Math.min(f.vy, 0); f.reflectT = 0.6; f.armorT = 0.6; f.armorHits = 1; ring(f.x, f.y - 60, 90, f.look.slash, 0.3); SFX.note(1); },
    update(f, foe) {
      f.vx = damp(f.vx, 0, 12, STEP);
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; f.hitDone = false;
        if (strike(f, foe, { box: [-10, -130, 110, 0], dmg: 18 + 8 * (f.notes || 0), kb: [520, -120], stun: 0.35, hs: 0.06 })) {
          f.notes = Math.min(3, (f.notes || 0) + 1);
          addP({ type: 'text', text: '音浪', x: foe.x, y: foe.y - 100, life: 0.6, max: 0.6, rgb: '150,240,200' });
        }
      }
      if (f.t >= 0.45) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yx_play', 40] : ['yx_play', 20],
    ai: (me, foe, d) => d < 120 || projs.some(p => p.owner === foe.idx && !p.ult && Math.abs(p.x - me.x) < 260) },
});
