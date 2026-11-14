Object.assign(SKILLS, {
  // ---- 雷鸣 · Q：雷闪（thunderfist） ----
  thunderfist: { name: '雷闪', cd: 5, nofric: true, pass: true, desc: '身化雷光贴地疾冲。一拳贯穿附带【触电麻痹】（0.38 秒电击瘫痪硬直），起手片刻后化为雷光霸体。',
    start(f) { f.armorT = 0; f.armorHits = 0; f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.12) { f.skPh = 1; f.t = 0; f.vx = f.face * 1350; f.armorT = 0.28; f.armorHits = 1; f.hitDone = false; SFX.dash(); SFX.thunder(); }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-20, -110, 75, -10], dmg: 40, kb: [80, 0], stun: 0.38, hs: 0.08 })) {
          f.skill2CD = 0;
          addP({ type: 'text', text: '⚡ 触电麻痹 · 雷铠重置', x: foe.x, y: foe.y - 100, life: 1.0, max: 1.0, rgb: '255,240,120' });
        }
        if (Math.random() < 0.6) addP({ type: 'spark', x: f.x - f.face * 10, y: f.y - rand(20, 110), vx: -f.face * rand(100, 300), vy: rand(-100, 100), life: 0.2, max: 0.2, rgb: '255,240,150', w: 2 });
        const through = f.hitDone && foe && (f.x - foe.x) * f.face > 45;   // 一拳贯穿、穿过对手身后就收住，不再继续往前冲
        if (f.t >= 0.26 || through) { f.skPh = 2; f.t = 0; f.vx *= 0.15; f.armorT = 0; }
      }
      if (f.skPh === 2 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['lm_boxer', 28] : f.skPh === 1 ? ['lm_jab', 60] : ['idle', 14],
    ai: (me, foe, d) => d > 110 && d < 360 },
  // ---- 雷鸣 · R（右键）：金刚雷铠（stomp） ----
  stomp: { name: '金刚雷铠', cd: 5.5, breakout: true, desc: '运转金刚雷体，架起防守雷铠（持续 0.55 秒，受创大减75%并霸体）。期间遭贴身攻击时消解攻击并引雷反击（50 伤害，挑飞后快速起身）；远程攻击和雾身攻击不会引雷。',
    start(f) {
      f.vx = 0; if (f.y < 0) f.vy = Math.min(f.vy, 0);
      f.thunderGuardT = 0.55; f.skPh = 0; f.armorT = 0.55; f.armorHits = 99;
      dust(f.x, 0, 10); SFX.block();
      ring(f.x, f.y - 60, 75, '255,230,120', 0.35);
    },
    update(f, foe) {
      if (f.skPh === 0) {
        f.vx = 0;
        if (Math.random() < 0.4) addP({ type: 'spark', x: f.x + rand(-25, 25), y: f.y - rand(20, 90), vx: rand(-40, 40), vy: rand(-50, 20), life: 0.22, max: 0.22, rgb: '255,230,120', w: 1.6 });
        if (f.t >= 0.55) {
          f.thunderGuardT = 0; f.armorT = 0; f.skPh = 2; f.t = 0;
        }
      } else if (f.skPh === 1) {
        if (f.t >= 0.24) toNeutral(f);
      } else if (f.skPh === 2) {
        if (f.t >= 0.20) toNeutral(f);
      }
    },
    pose: f => f.skPh === 0 ? ['lm_boxer', 26] : f.skPh === 1 ? ['ts_slam', 48] : ['idle', 18],
    ai: (m, o, d) => projs.some(p => p.owner !== m.idx && p.dmg > 0 && Math.abs(p.x - m.x) < 260) || (d < 150 && Math.random() < 0.75) },
});
