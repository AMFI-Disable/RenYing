Object.assign(SKILLS, {
  // ---- 铁山 · Q：震地（quake） ----
  quake: { name: '震地', cd: 8, breakout: true, desc: '双手擎刀，怒砸大地，地裂冲击波范围大增（扩大35%）。起手带霸体（抵挡1次攻击），砸地直击施加【撼地重震】（0.45 秒脑震荡），把人掀上云霄。唯腾空者不受地裂所侵。',
    start(f) { f.armorT = 0.28; f.armorHits = 1; f.vx = 0; if (f.y < 0) f.vy = Math.min(f.vy, 0); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.24) {
        f.skPh = 1; f.t = 0; f.hitDone = false;
        shake = Math.max(shake, 14); dust(f.x, 0, 24); ring(f.x, 0, 140, '255,200,120', 0.35); SFX.thud(); SFX.heavy();
        for (const sd of [-1, 1]) spawnProj(f, { kind: 'quake', x: f.x + sd * 30, y: -22, vx: sd * 680, w: 84, h: 48, life: 0.8, dmg: 40, kb: [200, -740], stun: 0.40, hs: 0.08, launch: true, groundOnly: true, unbreakable: true });
        if (strike(f, foe, { box: [-40, -80, 100, 4], dmg: 45, kb: [220, -800], stun: 0.45, hs: 0.12, launch: true })) {
          f.guard = Math.min(f.maxGuard, (f.guard || f.maxGuard) + 30);
          f.skill2CD = Math.max(0, f.skill2CD - 2.5);
          addP({ type: 'text', text: '💥 撼地重震 · 固若金汤', x: f.x, y: f.y - 120, life: 0.9, max: 0.9, rgb: '255,200,120' });
        }
      }
      if (f.skPh === 1 && f.t >= 0.40) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_lift', 20] : ['ts_slam', 60],
    ai: (me, foe, d) => d < 420 && foe.onGround() },
  // ---- 铁山 · R（右键）：铁壁冲（ironwall） ----
  ironwall: { name: '铁壁冲', cd: 6, nofric: true, desc: '狂暴冲锋掀起通天巨浪（通天判定，彻底封锁空中跳跃与腾空位移）。携千钧重势巨浪拍岸，对空中敌人强行下砸截落，双倍瓦解一切格挡！',
    start(f) { f.armorT = 0.38; f.armorHits = 1; f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.16) {
        f.skPh = 1; f.t = 0; f.vx = f.face * 720; f.hitDone = false; SFX.dash(); SFX.thud();
        shake = Math.max(shake, 12);
      }
      if (f.skPh === 1) {
        const attWeight = (f.ch.stat && f.ch.stat.weight) || 1.50;
        const defWeight = (foe.ch.stat && foe.ch.stat.weight) || 1.0;
        const wRatio = attWeight / defWeight;
        const foeInAir = !foe.onGround() || airH(foe) > 2;
        const isCrimson = f.skinKey === 'ts_crimson';
        const waveRGB = isCrimson ? '255,60,70' : '255,200,100';

        // 巨浪推进视觉：多层直插云霄的狂涛气浪粒子
        if (!RESIM) {
          const wx = f.x + f.face * 55;
          for (let h = 0; h < 6; h++) {
            const wy = -h * 170 - rand(10, 60);
            ring(wx + rand(-20, 20), wy, 60 + h * 16, waveRGB, 0.25);
            if (Math.random() < 0.5) {
              addP({ type: 'spark', x: wx, y: wy, vx: f.face * rand(140, 360), vy: rand(-180, 180), rgb: waveRGB, w: 3, life: 0.2, max: 0.2 });
            }
          }
          dust(f.x + f.face * 35, 0, 4);
        }

        // 通天巨浪判定：高度直贯云霄（-2200px），封杀一切空中与腾空位移
        if (strike(f, foe, {
          box: [-10, -2200, 135, 0],
          dmg: 56,
          kb: foeInAir ? [Math.round(260 * wRatio), Math.round(520 * wRatio)] : [Math.round(420 * wRatio), -180],
          stun: 0.45,
          hs: 0.12,
          spike: foeInAir,
          launch: true,
          big: true,
          guardBreakMul: 1.5
        })) {
          shake = Math.max(shake, 18);
          SFX.heavy(); SFX.thud();
          for (let h = 0; h < 7; h++) {
            ring(f.x + f.face * 65, -h * 180 - 40, 90 + h * 18, waveRGB, 0.4);
          }
          const waveTxt = foeInAir ? '🌊 巨浪翻江 · 撼坠' : '🌊 巨浪裂空 · 崩山';
          addP({ type: 'text', text: waveTxt, x: f.x + f.face * 60, y: f.y - 140, life: 1.0, max: 1.0, rgb: waveRGB });
          f.vx *= 0.2;
        }
        if (f.t >= 0.25) { f.skPh = 2; f.t = 0; f.vx *= 0.2; f.armorT = 0; }
      }
      if (f.skPh === 2 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_shoulder', 26] : ['ts_shoulder', 40], ai: (m, o, d) => d < 260 },
});
