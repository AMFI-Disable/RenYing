Object.assign(SKILLS, {
  // ---- 流云 · Q：风刃（windblade） ----
  windblade: { name: '风刃', cd: 4.0, air: true, desc: '挥扇生风，一次扇出上下两道风刃（每道 28 伤害）。此招【无长硬直】，附带风暴推力（360 像素击退）；连飞羽轻镖也一并吹散。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.04) {
        f.skPh = 1; SFX.swing();
        for (const vy of [-110, 110]) spawnProj(f, { kind: 'wind', x: f.x + f.face * 40, y: f.y - 62, vx: f.face * 1100, vy, autoAim: true, w: 70, h: 58, life: 1.1, dmg: 28, kb: [360, -80], stun: 0.18, hs: 0.03 });
      }
      if (f.skPh === 1 && f.t >= 0.11) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ly_fanswipe', 32] : ['idle', 20],
    ai: () => true },
  // ---- 流云 · R（右键）：开扇（windstep） ----
  windstep: { name: '开扇', cd: 4, air: true, nofric: true, desc: '唰地张开折扇，朝面前方向疾冲过去，一路撒下 5 颗爆米花。爆米花落下半秒后噼啪炸开（每颗 8 伤害，轻微击退）。在空中开扇会斜着俯冲下去，落地炸开一圈风爆（24 伤害，挑起），再崩出 5 颗爆米花。',
    start(f) { f.vx = 0; f.invul = Math.max(f.invul, 0.1); SFX.dash(); if (airH(f) > 40) { f.skPh = 10; f.vy = Math.max(f.vy, 600); } },
    update(f, foe) {
      if (f.skPh >= 10) { windDive(f, foe); return; }
      if (f.skPh < 5 && f.t >= f.skPh * 0.07) {   // 冲的路上每隔一小段撒一颗
        f.skPh++;
        spawnProj(f, { kind: 'popcorn', x: f.x, y: -12, vx: 0, delay: 0.5, life: 0.62, w: 84, h: 76, dmg: 8, kb: [70, -140], stun: 0.22, hs: 0.03, unbreakable: true, noScale: true, seed: (clock * 7.3 + f.x * 0.013) % 6 });   // 只管画面的花样，但存进回滚存档里，两边要一样
      }
      f.vx = f.face * 1450 * Math.max(0, 1 - f.t / 0.38);
      if (Math.random() < 0.7) addP({ type: 'spark', x: f.x - f.face * 20, y: f.y - rand(20, 100), vx: -f.face * 200, vy: rand(-40, 40), life: 0.25, max: 0.25, rgb: f.look.slash, w: 1.4 });
      if (f.t >= 0.4) toNeutral(f);
    },
    pose: f => f.skPh === 10 ? ['a2', 50] : ['ly_fanswipe', 40], ai: (m, o, d) => d > 90 && d < 420 && Math.sign(o.x - m.x) === m.face },
});
