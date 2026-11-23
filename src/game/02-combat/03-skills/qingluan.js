Object.assign(SKILLS, {
  // ---- 青鸾 · Q：翠羽清风（jadebreeze） ----
  jadebreeze: { name: '翠羽清风', cd: 5, desc: '轻挥翠羽医扇卷出清风气浪，击退中远距离敌人并附带迟缓。',
    start(f) { f.vx *= 0.3; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.09) {
        f.skPh = 1; f.t = 0; SFX.swing();
        if (!RESIM) ring(f.x + f.face * 42, f.y - 68, 92, '82,240,200', 0.3);
        spawnProj(f, { kind: 'wind', x: f.x + f.face * 44, y: f.y - 68, vx: f.face * 960, w: 76, h: 72, life: 0.62, dmg: 40, kb: [290, -160], stun: 0.38, hs: 0.07, slow: 1.4 });
      }
      if (f.skPh === 1 && f.t >= 0.26) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 28] : ['ly_fanswipe', 54],
    ai: (me, foe, d) => d > 110 && d < 390 },
  // ---- 青鸾 · R：鸾羽回春（luanheal） ----
  luanheal: { name: '鸾羽回春', cd: 9.5, desc: '旋扇聚拢翠羽灵风，恢复自身气血并震开贴身强敌。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.14) {
        f.skPh = 1; f.t = 0; SFX.swing();
        const heal = Math.round(92 * HERO_HP_SCALE);
        f.hp = Math.min(f.maxHp, f.hp + heal);
        if (!RESIM) {
          ring(f.x, f.y - 60, 132, '82,240,200', 0.42);
          addP({ type: 'text', text: `+${heal}`, x: f.x, y: f.y - 122, life: 0.85, max: 0.85, rgb: '110,245,195' });
        }
        strike(f, foe, { box: [-115, -120, 115, 0], dmg: 30, kb: [340, -240], stun: 0.4, hs: 0.08 });
      }
      if (f.skPh === 1 && f.t >= 0.3) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yh_mirror', 28] : ['ly_fanswipe', 48],
    ai: (me, foe, d) => me.hp < me.maxHp * 0.85 || d < 120 },
});
