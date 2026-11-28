// ======================= 跨侠客武学共鸣（v1.3.0） =======================
// 仅在 2v2 与多人团战（isMulti()）中生效，1v1 严格关闭；全部使用确定性数值与空间判定（回滚安全）。
const CROSS_HERO_SYNERGIES = [
  { id: 'flame_cyclone', name: '炽风烈卷', a: ['chixiao'], b: ['liuyun'], rgb: '255,145,70', bonus: 18,
    apply(att, def, mate) { def.burnT = Math.max(def.burnT || 0, 2.5); def.vy = Math.min(def.vy, -240); } },
  { id: 'conductive_ink', name: '墨雷导引', a: ['moyu'], b: ['leiming', 'cixian'], rgb: '140,195,255', bonus: 16,
    apply(att, def, mate) { def.rooted = true; def.stun = Math.max(def.stun || 0, 0.38); if (def.guard !== undefined) def.guard = Math.max(0, def.guard - 15); } },
  { id: 'frost_shatter', name: '玄冰碎甲', a: ['lingshuang'], b: ['tieshan', 'gouchen'], rgb: '165,235,255', bonus: 20,
    apply(att, def, mate) { def.defDebuffT = Math.max(def.defDebuffT || 0, 2.5); if (def.guard !== undefined) def.guard = Math.max(0, def.guard - 22); } },
  { id: 'harmonic_echo', name: '月箫和鸣', a: ['yuxiao'], b: ['yuehua'], rgb: '175,245,215', bonus: 15,
    apply(att, def, mate) { att.meter = Math.min(100, (att.meter || 0) + 10); if (mate && mate.hp > 0) mate.meter = Math.min(100, (mate.meter || 0) + 10); } },
  { id: 'shadow_hook', name: '影锁夺魂', a: ['feiying', 'liying'], b: ['gouchen'], rgb: '230,115,215', bonus: 18,
    apply(att, def, mate) { def.hookedT = Math.max(def.hookedT || 0, 1.4); } },
  { id: 'gale_feather', name: '御风逐羽', a: ['liuyun'], b: ['yanling'], rgb: '145,240,225', bonus: 14,
    apply(att, def, mate) {
      for (const h of [att, mate]) {
        if (!h || h.hp <= 0) continue;
        if (h.ch && h.ch.fly) h.flyT = h.ch.fly;
        h.airDash = 1;
      }
    } },
  { id: 'iron_aegis', name: '玄壁鸾护', a: ['tieshan', 'xuanwu'], b: ['qingluan'], rgb: '120,245,190', bonus: 14,
    apply(att, def, mate) {
      for (const h of [att, mate]) {
        if (!h || h.hp <= 0) continue;
        h.hp = Math.min(h.maxHp, h.hp + 22);
        if (h.guard !== undefined) h.guard = Math.min(h.maxGuard || 100, h.guard + 15);
      }
    } },
  { id: 'silk_resonance', name: '千丝合鸣', a: ['lingque'], b: ['qianji'], rgb: '245,190,120', bonus: 18,
    apply(att, def, mate) { def.slowT = Math.max(def.slowT || 0, 2.0); if (typeof addNeedleMark === 'function') addNeedleMark(def, 1); } },
];

function findCrossHeroSynergy(id1, id2) {
  if (!id1 || !id2 || id1 === id2) return null;
  for (let i = 0; i < CROSS_HERO_SYNERGIES.length; i++) {
    const s = CROSS_HERO_SYNERGIES[i];
    if ((s.a.includes(id1) && s.b.includes(id2)) || (s.b.includes(id1) && s.a.includes(id2))) return s;
  }
  return null;
}

function hasCrossHeroSynergyPair(id1, id2) {
  return !!findCrossHeroSynergy(id1, id2);
}

function checkCrossHeroSynergy(att, def, m, pt) {
  if (!att || !def || att === def || !att.ch || !def.ch) return null;
  if (typeof isMulti !== 'function' || !isMulti()) return null;
  if (M.phase !== 'fight' || def.hp <= 0 || (m && m.chip)) return null;
  const team = typeof fighterTeam === 'function' ? fighterTeam(att) : (att.idx % 2);
  const now = clock;
  const prev = def.synTag;
  let triggered = null;
  if (prev && prev.team === team && prev.attIdx !== att.idx && (now - prev.t) <= 2.4 && (def.synCd || 0) <= now) {
    const syn = findCrossHeroSynergy(prev.heroId, att.ch.id);
    if (syn) {
      def.synCd = now + 3.5;
      def.synTag = null;
      const mate = typeof fighterByIdx === 'function' ? fighterByIdx(prev.attIdx) : null;
      const defRating = (def.ch && def.ch.stat && def.ch.stat.defRating) || 1;
      const bonusDmg = syn.bonus / defRating;
      def.hp = Math.max(def.dummy ? 1 : 0, def.hp - bonusDmg);
      syn.apply(att, def, mate);
      M.synergyCount = (M.synergyCount || 0) + 1;
      triggered = { id: syn.id, name: syn.name, bonusDmg };
      if (!RESIM) {
        const px = pt ? pt[0] : def.x, py = pt ? pt[1] : def.y - 60;
        ring(px, py, 128, syn.rgb, 0.42);
        addP({ type: 'callout', text: cvT(syn.name), x: px, y: py - 58, life: 0.9, max: 0.9, rgb: syn.rgb, scale: 1.55 });
        addP({ type: 'text', text: `${cvT('武学共鸣')} +${Math.round(bonusDmg)}`, x: px, y: py - 98, life: 0.85, max: 0.85, rgb: syn.rgb });
        if (SFX.justGuard) SFX.justGuard();
      }
    }
  }
  if (!triggered) {
    def.synTag = { heroId: att.ch.id, team, attIdx: att.idx, t: now };
  }
  return triggered;
}
