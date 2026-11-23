Object.assign(SKILLS, {
  // ---- 风铃 · Q：清铃拂风（chimegust） ----
  chimegust: { name: '清铃拂风', cd: 5, desc: '轻展素扇送出双股清风刃，远距压制并吹退逼近之敌。',
    start(f) { f.vx *= 0.3; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.09) {
        f.skPh = 1; f.t = 0; SFX.swing();
        for (const vy of [-95, 95]) {
          spawnProj(f, { kind: 'wind', x: f.x + f.face * 38, y: f.y - 64, vx: f.face * 1060, vy, autoAim: true, w: 68, h: 56, life: 0.95, dmg: 26, kb: [320, -90], stun: 0.24, hs: 0.04 });
        }
      }
      if (f.skPh === 1 && f.t >= 0.26) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ly_fanswipe', 30] : ['idle', 18],
    ai: (me, foe, d) => d > 130 && d < 420 },
  // ---- 风铃 · R：和风祈愿（windblessing） ----
  windblessing: { name: '和风祈愿', cd: 6.5, desc: '摇响祈福风铃恢复少量气血并反弹暗器，同时唤出清风气环吹开近敌。',
    start(f) { f.vx = 0; f.reflectT = 0.32; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; f.t = 0; SFX.note(2);
        f.hp = Math.min(f.maxHp, f.hp + Math.round(52 * HERO_HP_SCALE));
        if (!RESIM) {
          ring(f.x, f.y - 60, 138, '165,225,255', 0.4);
          addP({ type: 'text', text: '✦ 和风祈愿', x: f.x, y: f.y - 115, life: 0.8, max: 0.8, rgb: '255,168,200' });
        }
        strike(f, foe, { box: [-128, -128, 128, 0], dmg: 34, kb: [380, -340], stun: 0.42, hs: 0.08, launch: true });
      }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yx_play', 28] : ['ly_fanswipe', 48],
    ai: (me, foe, d) => d < 160 || me.hp < me.maxHp * 0.72 },
});
