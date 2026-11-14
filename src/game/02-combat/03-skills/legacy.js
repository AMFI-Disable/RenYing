Object.assign(SKILLS, {
  // ---- 没有侠客把它设成 Q / R（旧招式，删之前先搜有没有按 id 取用）：豪饮（drink） ----
  drink: { name: '豪饮', cd: 2.6, desc: '仰头灌一大口酒，醉意 +50。', start(f){ f.vx = 0; }, update(f){ if (f.t >= 0.3) toNeutral(f); }, pose: () => ['zx_drink', 24], ai: () => false },
  // ---- 没有侠客把它设成 Q / R（旧招式，删之前先搜有没有按 id 取用）：醉步（drunkstep） ----
  drunkstep: { name: '醉步', cd: 4.5, desc: '东倒西歪一个滚翻。', start(f){ f.vx = 0; }, update(f){ if (f.t >= 0.36) toNeutral(f); }, pose: () => ['zx_roll', 40], ai: () => false },
});
