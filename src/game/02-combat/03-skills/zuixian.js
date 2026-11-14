Object.assign(SKILLS, {
  // ---- 醉翁 · Q：亭中留客（pavilion） ----
  pavilion: { name: '亭中留客', cd: 16, desc: '把对手当作客人留下：一座醉翁亭从对手头顶砸落（出手约 0.5 秒落地，射程约 720），罩住了就把人禁锢在亭中 1.5 秒，期间无法移动，但可以用腾空闪脱困；也可以随便打（被打不会飞出亭子）。落地前走开就罩不住。霸体能硬扛。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.05) {
        f.skPh = 1; SFX.swing();
        const towardFoe = Math.sign(foe.x - f.x) === f.face;
        const tx = clamp(towardFoe ? foe.x : f.x + f.face * 260, WALL + 40, STAGE_W - WALL - 40);
        if (Math.abs(tx - f.x) <= 720) spawnProj(f, { kind: 'pavilion', vx: 0, x: tx, y: -260, delay: 0.45, w: 150, h: 560, life: 0.95, dmg: 20, kb: [0, 0], stun: 0.3, hs: 0.08, jail: true, unblockable: true, unbreakable: true });
        else addP({ type: 'text', text: '客在远方', x: f.x, y: f.y - 120, life: 0.7, max: 0.7, rgb: '255,190,90' });
      }
      if (f.t >= 0.27) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['zx_sway', 30] : ['gc_wind', 40],
    ai: (me, foe, d) => d < 650 },
  // ---- 醉翁 · R（右键）：与民同乐（feast） ----
  feast: { name: '与民同乐', cd: 16, can: f => (f.drunk || 0) >= 50, lack: () => '酒不够', desc: '至少半壶酒才能用，一次把酒全部倒光：先朝对手丢去一瓶酒，砸中就得陪他喝——对手回 115 血，捧着酒瓶僵直 1 秒；醉翁自己也灌一口回 182 血，僵直 0.7 秒。自己先喝完，中间这一小段空当可以过去揍他。',
    start(f) { f.vx = 0; f.drunk = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.18) {
        f.skPh = 1; SFX.swing();
        spawnProj(f, { kind: 'bottle', x: f.x + f.face * 40, y: f.y - 92, vx: f.face * 950, vy: -60, g: 260, w: 40, h: 46, life: 0.9, dmg: 1, kb: [0, 0], stun: 0, hs: 0, feast: true, unblockable: true, unbreakable: true });
      }
      if (f.skPh === 1 && f.t >= 0.35) {
        f.skPh = 2; f.hp = Math.min(f.maxHp, f.hp + Math.round(135 * HERO_HP_SCALE)); SFX.drink();
        addP({ type: 'text', text: `+${Math.round(135 * HERO_HP_SCALE)}`, x: f.x, y: f.y - 120, life: 0.8, max: 0.8, rgb: '130,230,140' });
      }
      if (f.t >= 1.05) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['gc_wind', 30] : f.skPh === 1 ? ['gc_throw', 60] : ['zx_drink', 24],
    ai: (me, foe, d) => (me.drunk || 0) >= 50 && d > 120 && d < 800 && me.hp < me.maxHp * 0.85 },
});
