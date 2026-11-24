Object.assign(SKILLS, {
  // ---- 云鹤 · Q：鹤翼凌空（craneglide） ----
  craneglide: { name: '鹤翼凌空', cd: 5, air: true, pass: true, nofric: true, desc: '展翅御风向前疾掠，沿途扫击敌人并齐射两道仙羽穿刺牵制。',
    start(f) { if (f.onGround()) { f.vy = -340; f.plat = -1; f.y -= 1; } else { f.vy *= 0.25; } },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; f.t = 0; f.vx = 1120 * f.face; f.vy = -60; f.hitDone = false; SFX.dash();
        for (const k of [-1, 0, 1]) {
          spawnProj(f, { kind: 'arrow', x: f.x + f.face * 32, y: f.y - 68 + k * 14, vx: f.face * 1080, vy: k * 75, autoAim: k === 0, w: 34, h: 24, life: 1.15, dmg: 18, pierce: true, maxHits: 1, kb: [120, -60], stun: 0.24, hs: 0.04, rgb: '168,230,255' });
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
  cloudmend: { name: '云岚沐羽', cd: 9, air: true, desc: '振翅悬空唤出仙岚灵光，回复自身与周围友军气血并震开周身强敌。',
    start(f) { f.vx *= 0.2; f.vy = Math.min(f.vy, -120); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.13) {
        f.skPh = 1; f.t = 0; SFX.swing();
        const heal = Math.round(86 * HERO_HP_SCALE);
        f.hp = Math.min(f.maxHp, f.hp + heal);
        const allyHeal = Math.round(heal * 0.55);
        for (const ally of allFighters()) {
          if (ally === f || ally.hidden || ally.team !== f.team || ally.hp <= 0) continue;
          if (Math.hypot(ally.x - f.x, ally.y - f.y) <= 280) {
            ally.hp = Math.min(ally.maxHp, ally.hp + allyHeal);
            if (!RESIM) { ring(ally.x, ally.y - 60, 88, '168,230,255', 0.35); addP({ type: 'text', text: `+${allyHeal}`, x: ally.x, y: ally.y - 118, life: 0.8, max: 0.8, rgb: '168,230,255' }); }
          }
        }
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
