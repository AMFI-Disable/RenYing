// 离影 · 墨球蹴鞠（2v2）AI 调优：在门前与中场留雾身协防截球
registerHeroAI('liying', 'cuju', '2v2', {
  useSkills(ctrl, me, b, d, ballFront) {
    if (me.skillCD <= 0 && (!me.clones || me.clones.length < 3) && Math.random() < ctrl.L.skillP * 1.5) {
      ctrl.press('skill');
      return true;
    }
    if (me.skill2CD <= 0 && me.clones && me.clones.length > 0 && ballFront < -80 && Math.random() < ctrl.L.skillP) {
      ctrl.press('skill2');
      return true;
    }
    return false;
  },
});
