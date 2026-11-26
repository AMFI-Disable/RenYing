// ===========================================================================
// 20 侠客 · 墨球蹴鞠专属 AI 策略（覆盖其余 16 位侠客，并补全离影/千机 1v1 覆盖）
// ===========================================================================
(function () {
  if (typeof registerHeroAI !== 'function') return;
  const distTo = (me, b) => Math.hypot(b.x - me.x, b.y - (me.y - 50));
  const ownGoal = d => d > 0 ? WALL + CUJU.GD : STAGE_W - WALL - CUJU.GD;
  const incoming = (me, b, d, spd = 280) => (b.x - me.x) * d > 0 && b.vx * d < -spd;

  // 离影 / 千机：补齐 1v1 与通用场景覆盖（2v2 仍优先匹配 heroes/liying 与 heroes/qianji）
  registerHeroAI('liying', 'cuju', '1v1', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skillCD <= 0 && (!me.clones || me.clones.length < 2) && Math.random() < ctrl.L.skillP * 1.4) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && me.clones && me.clones.length > 0 && ballFront < -60 && Math.random() < ctrl.L.skillP * 1.2) {
        ctrl.press('skill2'); return true;
      }
      return false;
    },
  });
  registerHeroAI('qianji', 'cuju', '1v1', {
    useSkills(ctrl, me, b, d, ballFront) {
      const dist = distTo(me, b);
      if (me.skillCD <= 0 && dist > 170 && dist < 540 && Math.random() < ctrl.L.skillP * 1.7) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && ballFront > 0 && ballFront < 240 && Math.random() < ctrl.L.skillP * 1.5) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      return false;
    },
  });

  // 青锋：剑气远程推球、疾风斩中距突进射门
  registerHeroAI('qingfeng', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skill2CD <= 0 && ballFront > 140 && ballFront < 620 && Math.random() < ctrl.L.skillP * 1.7) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      if (me.skillCD <= 0 && ballFront > 90 && ballFront < 340 && Math.random() < ctrl.L.skillP * 1.6) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      return false;
    },
  });

  // 绯影：飞镖远距加速控球、影遁绕后抢点
  registerHeroAI('feiying', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      const dist = distTo(me, b);
      if (me.skill2CD <= 0 && ballFront > 130 && ballFront < 540 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      if (me.skillCD <= 0 && (ballFront < -60 || dist > 260) && dist < 520 && Math.random() < ctrl.L.skillP * 1.4) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      return false;
    },
  });

  // 铁山：铁壁冲霸体轰门、震地近身挑球解围
  registerHeroAI('tieshan', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront, hgt) {
      if (me.skill2CD <= 0 && ballFront > 60 && ballFront < 290 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      if (me.skillCD <= 0 && Math.abs(b.x - me.x) < 170 && hgt < 95 && Math.random() < ctrl.L.skillP * 1.5) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      return false;
    },
  });

  // 凌霜：回马枪长距点射、枪旋门前拦截高速来球
  registerHeroAI('lingshuang', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skill2CD <= 0 && incoming(me, b, d, 260) && Math.abs(b.x - me.x) < 190 && Math.random() < ctrl.L.skillP * 2.2) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      if (me.skillCD <= 0 && ballFront > 85 && ballFront < 270 && Math.random() < ctrl.L.skillP * 1.7) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      return false;
    },
  });

  // 流云：风刃远距推进、风遁近身气浪解围
  registerHeroAI('liuyun', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skillCD <= 0 && ballFront > 140 && ballFront < 640 && Math.random() < ctrl.L.skillP * 1.9) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && Math.abs(b.x - me.x) < 180 && Math.random() < ctrl.L.skillP * 1.5) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      return false;
    },
  });

  // 雷鸣：雷闪突进重炮、雷铠近身拦截
  registerHeroAI('leiming', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skillCD <= 0 && ballFront > 80 && ballFront < 320 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && incoming(me, b, d, 300) && Math.abs(b.x - me.x) < 175 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      return false;
    },
  });

  // 墨羽：泼墨远距吊射、墨阵门前布防
  registerHeroAI('moyu', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skill2CD <= 0 && ballFront > 130 && ballFront < 560 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      if (me.skillCD <= 0 && Math.abs(me.x - ownGoal(d)) < 560 && Math.abs(b.x - me.x) < 220 && Math.random() < ctrl.L.skillP * 1.4) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      return false;
    },
  });

  // 月华：月轮回旋二段射门、月镜扑救高速来球
  registerHeroAI('yuehua', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skillCD <= 0 && incoming(me, b, d, 320) && Math.abs(b.x - me.x) < 190 && Math.random() < ctrl.L.skillP * 2.1) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && ballFront > 140 && ballFront < 600 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      return false;
    },
  });

  // 燕翎：翎羽远程连射、俯冲凌空轰门
  registerHeroAI('yanling', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skillCD <= 0 && !me.onGround() && ballFront > 0 && ballFront < 240 && Math.random() < ctrl.L.skillP * 2.0) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && ballFront > 140 && ballFront < 620 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      return false;
    },
  });

  // 玉箫：音波远距推球、回音壁门前阻截
  registerHeroAI('yuxiao', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skill2CD <= 0 && incoming(me, b, d, 260) && Math.abs(b.x - me.x) < 210 && Math.random() < ctrl.L.skillP * 2.2) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      if (me.skillCD <= 0 && ballFront > 140 && ballFront < 580 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      return false;
    },
  });

  // 醉翁：亭中留客干扰抢点、与民同乐（醉意足够时）远距抛射
  registerHeroAI('zuixian', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skill2CD <= 0 && (me.drunk || 0) >= 50 && ballFront > 140 && ballFront < 520 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      if (me.skillCD <= 0 && ballFront > 160 && ballFront < 600 && Math.random() < ctrl.L.skillP * 1.5) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      return false;
    },
  });

  // 凌雀：穿叶飞梭远距点射、移形换影高速截球
  registerHeroAI('lingque', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      const dist = distTo(me, b);
      if (me.skillCD <= 0 && ballFront > 150 && ballFront < 620 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && dist > 190 && dist < 520 && Math.random() < ctrl.L.skillP * 1.6) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      return false;
    },
  });

  // 炽霄：炎戟突刺重射、烈焰环近身清球
  registerHeroAI('chixiao', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skillCD <= 0 && ballFront > 80 && ballFront < 310 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && Math.abs(b.x - me.x) < 185 && Math.random() < ctrl.L.skillP * 1.6) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      return false;
    },
  });

  // 玄机：星仪弹远距狙射、引力井中场控球
  registerHeroAI('xuanji', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skillCD <= 0 && ballFront > 150 && ballFront < 620 && Math.random() < ctrl.L.skillP * 1.9) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && ballFront > 100 && ballFront < 420 && Math.random() < ctrl.L.skillP * 1.5) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      return false;
    },
  });

  // 青鸾：翠岚风刃远射、鸾羽愈气场加速协防
  registerHeroAI('qingluan', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront) {
      if (me.skillCD <= 0 && ballFront > 140 && ballFront < 580 && Math.random() < ctrl.L.skillP * 1.9) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && distTo(me, b) > 240 && Math.random() < ctrl.L.skillP * 1.2) {
        ctrl.press('skill2'); return true;
      }
      return false;
    },
  });

  // 玄武：玄甲冲撞霸体推进、厚土堡门前震荡解围
  registerHeroAI('xuanwu', 'cuju', '*', {
    useSkills(ctrl, me, b, d, ballFront, hgt) {
      if (me.skillCD <= 0 && ballFront > 70 && ballFront < 290 && Math.random() < ctrl.L.skillP * 1.8) {
        ctrl.held.aim = d; ctrl.press('skill'); return true;
      }
      if (me.skill2CD <= 0 && Math.abs(b.x - me.x) < 180 && hgt < 105 && Math.random() < ctrl.L.skillP * 1.6) {
        ctrl.held.aim = d; ctrl.press('skill2'); return true;
      }
      return false;
    },
  });
})();
