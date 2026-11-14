// 千机 · 墨球蹴鞠（2v2）AI 调优：中场放傀儡截球并用铁球轰门
registerHeroAI('qianji', 'cuju', '2v2', {
  useSkills(ctrl, me, b, d, ballFront) {
    const dist = Math.hypot(b.x - me.x, b.y - (me.y - 50));
    if (me.skillCD <= 0 && dist > 180 && dist < 520 && Math.random() < ctrl.L.skillP * 1.8) {
      ctrl.held.aim = d;
      ctrl.press('skill');
      return true;
    }
    if (me.skill2CD <= 0 && ballFront > 0 && ballFront < 240 && Math.random() < ctrl.L.skillP * 1.6) {
      ctrl.held.aim = d;
      ctrl.press('skill2');
      return true;
    }
    return false;
  },
});
