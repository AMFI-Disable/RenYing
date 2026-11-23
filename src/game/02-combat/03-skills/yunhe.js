Object.assign(SKILLS, {
  // ---- 云鹤 · Q：鹤翼凌空（craneglide） ----
  craneglide: { name: '鹤翼凌空', cd: 5, air: true, pass: true, nofric: true, desc: '展翅御风向前疾掠，沿途扫击敌人并齐射两道仙羽穿刺牵制。',
    start(f) { if (f.onGround()) { f.vy = -340; f.y = -1; } else { f.vy *= 0.25; } },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; f.t = 0; f.vx = 1120 * f.face; f.vy = -60; f.hitDone = false; SFX.dash();
        for (const k of [-1, 1]) {
          spawnProj(f, { kind: 'feather', x: f.x + f.face * 32, y: f.y - 68 + k * 16, vx: f.face * 1020, vy: k * 65, autoAim: true, w: 26, h: 34, life: 1.2, dmg: 20, kb: [120, -60], stun: 0.24, hs: 0.04 });
        }
      }
      if (f.skPh === 1) {
        strike(f, foe, { box: [-20, -102, 94, 16], dmg: 38, kb: [220, -240], stun: 0.4, hs: 0.07 });
        if (f.t >= 0.22) { f.skPh = 2; f.t = 0; f.vx *= 0.25; }
      }
      if (f.skPh === 2 && f.t >= 0.2) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yl_wings', 28] : f.skPh === 1 ? ['yl_dive', 54] : ['a1a', 26],
    ai: (me, foe, d) => d > 110 && d < 360 },
  // ---- 云鹤 · R：云岚沐羽（cloudmend） ----
  cloudmend: { name: '云岚沐羽', cd: 9, air: true, desc: '振翅悬空唤出仙岚灵光，回复自身气血并震开周身强敌。',
    start(f) { f.vx *= 0.2; f.vy = Math.min(f.vy, -120); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.13) {
        f.skPh = 1; f.t = 0; SFX.swing();
        const heal = Math.round(86 * HERO_HP_SCALE);
        f.hp = Math.min(f.maxHp, f.hp + heal);
        if (!RESIM) {
          ring(f.x, f.y - 64, 134, '168,230,255', 0.4);
          addP({ type: 'text', text: `+${heal}`, x: f.x, y: f.y - 124, life: 0.85, max: 0.85, rgb: '168,230,255' });
        }
        strike(f, foe, { box: [-118, -124, 118, 12], dmg: 28, kb: [320, -260], stun: 0.38, hs: 0.07 });
      }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yl_wings', 26] : ['a1a', 46],
    ai: (me, foe, d) => me.hp < me.maxHp * 0.85 || d < 125 },
});
