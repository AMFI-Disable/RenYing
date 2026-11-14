// 勾陈 · 墨球蹴鞠（1v1）AI 调优：中远距离主动甩飞锤勾球
registerHeroAI('gouchen', 'cuju', '*', {
  useSkills(ctrl, me, b, d, ballFront, hgt) {
    const dist = Math.hypot(b.x - me.x, b.y - (me.y - 50));
    const toBall = Math.sign(b.x - me.x) || d;
    if (me.skillCD <= 0 && dist > 220 && dist < 540 && Math.random() < ctrl.L.skillP * 2.2) {
      ctrl.held.aim = toBall;
      ctrl.held.left = toBall < 0;
      ctrl.held.right = toBall > 0;
      ctrl.press('skill');
      return true;
    }
    return false;
  },
});
