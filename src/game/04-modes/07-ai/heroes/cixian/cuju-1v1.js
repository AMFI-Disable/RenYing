// 磁仙 · 墨球蹴鞠 AI 调优：负极吸球控场、正极磁爆轰门
registerHeroAI('cixian', 'cuju', '*', {
  useSkills(ctrl, me, b, d, ballFront) {
    const dist = Math.hypot(b.x - me.x, b.y - (me.y - 50));
    if (me.pol < 0 && me.skill2CD <= 0 && dist > 160 && dist < 560 && Math.random() < ctrl.L.skillP * 2) {
      ctrl.press('skill2');
      return true;
    }
    if (me.pol > 0 && me.skill2CD <= 0 && ballFront > 0 && ballFront < 150 && Math.random() < ctrl.L.skillP * 2) {
      ctrl.held.aim = d;
      ctrl.press('skill2');
      return true;
    }
    if (me.pol > 0 && dist > 300 && me.skillCD <= 0 && Math.random() < ctrl.L.skillP) {
      ctrl.press('skill');
      return true;
    }
    return false;
  },
});
