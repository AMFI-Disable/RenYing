// ======================= 居合斩穴（居合拔刀与八脉点穴）物理与招式系统 =======================
// 本模块实现《刃影》完全可回滚确定性的「居合斩穴」武学体系（RYPhysics.IaidoAcupoint）：
//   一、居合蓄势（Iaido Sheath-Draw Stance）：
//     1. 拔刀张力蓄积曲线（收心 -> 蓄势 -> 瞬拔甜点 -> 满弓 -> 过蓄势衰）
//     2. 居合瞬拔完美帧窗口（精确核心帧判定、零起手瞬闪、破甲与点穴精度加成）
//     3. 穿身居合一闪轨迹（三次缓动速度剖面、连续线段-胶囊扫掠防穿模、纳刀迟斩队列）
//     4. 居合见切反击闪（蓄势迎击窗口、招架化解、穿身反斩与自动点穴）
//   二、八脉点穴（8-Meridian Acupoint System）：
//     1. 八大核心穴位：百会(Crown)、膻中(Chest)、气海(Dantian)、曲池(Arm)、
//        合谷(Hand)、风池(Neck)、涌泉(Foot)、命门(Spine)
//     2. 基于攻击高度、入射角度、背击/破招与受击姿态的身体分区瞄准算法
//     3. 封穴减益聚合（移速迟滞、气海封气、护体脆弱、招式冷却冻结、内劲衰减）
//     4. 经脉共振链与「经脉震爆」（2穴经典配对共振、3穴及以上内气引爆与震荡击退）
//     5. 主动「运功冲穴」反解时机窗口（完美脉冲全清+气浪反震、良性半解、走火反噬）
// 全程无非确定性随机源与时间依赖，严格量化，完整支持联机回滚与状态校验。

var RYPhysics = (typeof window !== 'undefined' ? (window.RYPhysics = window.RYPhysics || {}) : {});

(function (root) {
  'use strict';

  // ----------------------- 确定性数学与常量 -----------------------
  var FIXED_DT = 1 / 60;
  var QUANT_SCALE = 10000;
  var INV_QUANT = 0.0001;
  var DEG_TO_RAD = 0.017453292519943295;

  function q(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * QUANT_SCALE) * INV_QUANT;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function abs(v) {
    return v < 0 ? -v : v;
  }

  function sign(v) {
    return v > 0 ? 1 : (v < 0 ? -1 : 0);
  }

  function lerp(a, b, t) {
    var k = clamp(t, 0, 1);
    return a + (b - a) * k;
  }

  function fnv1aStep(hash, val) {
    var v = Math.round((Number.isFinite(val) ? val : 0) * 1000) | 0;
    hash ^= (v & 0xff);
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= ((v >>> 8) & 0xff);
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= ((v >>> 16) & 0xff);
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= ((v >>> 24) & 0xff);
    hash = Math.imul(hash, 16777619) >>> 0;
    return hash >>> 0;
  }

  // ----------------------- 居合蓄势配置参数 -----------------------
  var IAIDO_PROFILES = Object.freeze({
    standard: Object.freeze({
      id: 'standard',
      settleFrames: 8,
      sweetSpotStart: 18,
      sweetSpotCoreStart: 21,
      sweetSpotCoreEnd: 23,
      sweetSpotEnd: 26,
      peakHoldEnd: 46,
      maxHoldFrames: 78,
      baseDashDist: 260,
      maxDashDist: 440,
      dashDurationFrames: 10,
      delayedCutFrames: 18,
      counterWindowFrames: 14,
      sheathCooldownFrames: 20,
      staminaDrainPerSec: 11
    }),
    quickdraw: Object.freeze({
      id: 'quickdraw',
      settleFrames: 6,
      sweetSpotStart: 14,
      sweetSpotCoreStart: 16,
      sweetSpotCoreEnd: 18,
      sweetSpotEnd: 21,
      peakHoldEnd: 36,
      maxHoldFrames: 64,
      baseDashDist: 290,
      maxDashDist: 480,
      dashDurationFrames: 8,
      delayedCutFrames: 14,
      counterWindowFrames: 16,
      sheathCooldownFrames: 16,
      staminaDrainPerSec: 13
    }),
    heavy_tachi: Object.freeze({
      id: 'heavy_tachi',
      settleFrames: 11,
      sweetSpotStart: 24,
      sweetSpotCoreStart: 27,
      sweetSpotCoreEnd: 30,
      sweetSpotEnd: 34,
      peakHoldEnd: 58,
      maxHoldFrames: 92,
      baseDashDist: 230,
      maxDashDist: 410,
      dashDurationFrames: 12,
      delayedCutFrames: 22,
      counterWindowFrames: 12,
      sheathCooldownFrames: 26,
      staminaDrainPerSec: 9.5
    })
  });

  // ----------------------- 八脉点穴定义表 -----------------------
  var ACUPOINT_ORDER = Object.freeze([
    'baihui', 'tanzhong', 'qihai', 'quchi',
    'hegu', 'fengchi', 'yongquan', 'mingmen'
  ]);

  var ACUPOINTS = Object.freeze({
    baihui: Object.freeze({
      id: 'baihui',
      cnName: '百会',
      enName: 'Crown',
      meridian: 'du',
      zoneYMin: 0.85,
      zoneYMax: 1.00,
      centerY: 0.93,
      idealAngleDeg: -35,
      preferBack: false,
      preferCounter: false,
      baseDurationFrames: 240,
      sealPower: 1.20,
      primaryDebuff: 'skill_cooldown_freeze',
      effects: Object.freeze({
        skillCdRateMul: 0.15,
        airControlMul: 0.65,
        hitstunMul: 1.12
      })
    }),
    tanzhong: Object.freeze({
      id: 'tanzhong',
      cnName: '膻中',
      enName: 'Chest',
      meridian: 'ren',
      zoneYMin: 0.56,
      zoneYMax: 0.75,
      centerY: 0.66,
      idealAngleDeg: 0,
      preferBack: false,
      preferCounter: false,
      baseDurationFrames: 270,
      sealPower: 1.15,
      primaryDebuff: 'guard_fragility',
      effects: Object.freeze({
        guardDmgTakenMul: 1.48,
        guardRegenMul: 0.45
      })
    }),
    qihai: Object.freeze({
      id: 'qihai',
      cnName: '气海',
      enName: 'Dantian',
      meridian: 'ren',
      zoneYMin: 0.38,
      zoneYMax: 0.56,
      centerY: 0.47,
      idealAngleDeg: 5,
      preferBack: false,
      preferCounter: false,
      baseDurationFrames: 260,
      sealPower: 1.25,
      primaryDebuff: 'qi_seal',
      effects: Object.freeze({
        qiGainMul: 0.12,
        qiDrainPerSec: 6.5
      })
    }),
    quchi: Object.freeze({
      id: 'quchi',
      cnName: '曲池',
      enName: 'Arm',
      meridian: 'yangming',
      zoneYMin: 0.50,
      zoneYMax: 0.69,
      centerY: 0.60,
      idealAngleDeg: -10,
      preferBack: false,
      preferCounter: true,
      baseDurationFrames: 250,
      sealPower: 1.05,
      primaryDebuff: 'attack_dampen',
      effects: Object.freeze({
        attackDmgMul: 0.72,
        knockbackOutMul: 0.78
      })
    }),
    hegu: Object.freeze({
      id: 'hegu',
      cnName: '合谷',
      enName: 'Hand',
      meridian: 'yangming',
      zoneYMin: 0.42,
      zoneYMax: 0.62,
      centerY: 0.52,
      idealAngleDeg: 10,
      preferBack: false,
      preferCounter: true,
      baseDurationFrames: 220,
      sealPower: 1.00,
      primaryDebuff: 'attack_dampen',
      effects: Object.freeze({
        attackDmgMul: 0.82,
        attackStartupAdd: 3,
        weaponReachMul: 0.88
      })
    }),
    fengchi: Object.freeze({
      id: 'fengchi',
      cnName: '风池',
      enName: 'Neck',
      meridian: 'shaoyang',
      zoneYMin: 0.73,
      zoneYMax: 0.86,
      centerY: 0.80,
      idealAngleDeg: -22,
      preferBack: true,
      preferCounter: false,
      baseDurationFrames: 230,
      sealPower: 1.18,
      primaryDebuff: 'movement_slow',
      effects: Object.freeze({
        moveSpeedMul: 0.82,
        hitstunMul: 1.26
      })
    }),
    yongquan: Object.freeze({
      id: 'yongquan',
      cnName: '涌泉',
      enName: 'Foot',
      meridian: 'shaoyin',
      zoneYMin: 0.00,
      zoneYMax: 0.28,
      centerY: 0.14,
      idealAngleDeg: 40,
      preferBack: false,
      preferCounter: false,
      baseDurationFrames: 260,
      sealPower: 1.12,
      primaryDebuff: 'movement_slow',
      effects: Object.freeze({
        moveSpeedMul: 0.62,
        jumpImpulseMul: 0.70,
        dashDisabled: true
      })
    }),
    mingmen: Object.freeze({
      id: 'mingmen',
      cnName: '命门',
      enName: 'Spine',
      meridian: 'du',
      zoneYMin: 0.36,
      zoneYMax: 0.60,
      centerY: 0.48,
      idealAngleDeg: 0,
      preferBack: true,
      preferCounter: false,
      baseDurationFrames: 250,
      sealPower: 1.30,
      primaryDebuff: 'guard_fragility',
      effects: Object.freeze({
        guardDmgTakenMul: 1.32,
        damageTakenMul: 1.24
      })
    })
  });

  // 经典双穴共振配对表（触发额外经脉震爆倍率与特效标识）
  var RESONANCE_PAIRS = Object.freeze({
    'baihui+yongquan': Object.freeze({ name: '天地贯通', dmgMul: 1.45, kbScale: 1.35, guardShatter: 42 }),
    'qihai+tanzhong': Object.freeze({ name: '任脉闭锁', dmgMul: 1.38, kbScale: 1.15, guardShatter: 58 }),
    'hegu+quchi': Object.freeze({ name: '阳明断臂', dmgMul: 1.32, kbScale: 1.20, guardShatter: 36 }),
    'fengchi+mingmen': Object.freeze({ name: '督胆崩摧', dmgMul: 1.50, kbScale: 1.40, guardShatter: 52 }),
    'baihui+mingmen': Object.freeze({ name: '督脉逆冲', dmgMul: 1.42, kbScale: 1.30, guardShatter: 48 })
  });

  // ----------------------- 状态创建与回滚序列化 -----------------------
  function createIaidoState(profileKey) {
    var key = IAIDO_PROFILES[profileKey] ? profileKey : 'standard';
    return {
      profile: key,
      stanceActive: false,
      stanceFrames: 0,
      phase: 'idle',
      tension: 0,
      tensionSlope: 0,
      sweetSpotGrade: 'none',
      counterArmed: false,
      counterWindowLeft: 0,
      counterTriggered: false,
      sheathCooldown: 0,

      // 穿身居合一闪轨迹状态
      dashActive: false,
      dashFrames: 0,
      dashDuration: 0,
      dashDir: 1,
      dashStartX: 0,
      dashStartY: 0,
      dashTargetX: 0,
      dashTargetY: 0,
      dashPrevX: 0,
      dashPrevY: 0,
      dashPowerMul: 1.0,
      dashAcupointBonus: 0,
      dashHitTargets: [],

      // 纳刀迟斩队列
      delayedCuts: []
    };
  }

  function createAcupointState() {
    var seals = {};
    for (var i = 0; i < ACUPOINT_ORDER.length; i++) {
      seals[ACUPOINT_ORDER[i]] = {
        active: false,
        framesLeft: 0,
        maxFrames: 0,
        intensity: 0,
        attackerIdx: -1
      };
    }
    return {
      seals: seals,
      activeCount: 0,
      sealOrder: [],
      resonanceCharge: 0,
      resonanceImmunityFrames: 0,
      resonanceCount: 0,
      sealImmunityFrames: 0,

      // 主动运功冲穴状态
      unsealActive: false,
      unsealFrames: 0,
      unsealTotalFrames: 0,
      unsealWindowStart: 0,
      unsealWindowEnd: 0,
      unsealPerfectStart: 0,
      unsealPerfectEnd: 0,
      unsealCooldown: 0,
      unsealBacklashFrames: 0
    };
  }

  function cloneIaidoState(st) {
    return {
      profile: st.profile,
      stanceActive: st.stanceActive,
      stanceFrames: st.stanceFrames,
      phase: st.phase,
      tension: st.tension,
      tensionSlope: st.tensionSlope,
      sweetSpotGrade: st.sweetSpotGrade,
      counterArmed: st.counterArmed,
      counterWindowLeft: st.counterWindowLeft,
      counterTriggered: st.counterTriggered,
      sheathCooldown: st.sheathCooldown,
      dashActive: st.dashActive,
      dashFrames: st.dashFrames,
      dashDuration: st.dashDuration,
      dashDir: st.dashDir,
      dashStartX: st.dashStartX,
      dashStartY: st.dashStartY,
      dashTargetX: st.dashTargetX,
      dashTargetY: st.dashTargetY,
      dashPrevX: st.dashPrevX,
      dashPrevY: st.dashPrevY,
      dashPowerMul: st.dashPowerMul,
      dashAcupointBonus: st.dashAcupointBonus,
      dashHitTargets: st.dashHitTargets.slice(),
      delayedCuts: st.delayedCuts.map(function (c) {
        return Object.assign({}, c);
      })
    };
  }

  function cloneAcupointState(st) {
    var seals = {};
    for (var i = 0; i < ACUPOINT_ORDER.length; i++) {
      var id = ACUPOINT_ORDER[i];
      seals[id] = Object.assign({}, st.seals[id]);
    }
    return {
      seals: seals,
      activeCount: st.activeCount,
      sealOrder: st.sealOrder.slice(),
      resonanceCharge: st.resonanceCharge,
      resonanceImmunityFrames: st.resonanceImmunityFrames,
      resonanceCount: st.resonanceCount,
      sealImmunityFrames: st.sealImmunityFrames,
      unsealActive: st.unsealActive,
      unsealFrames: st.unsealFrames,
      unsealTotalFrames: st.unsealTotalFrames,
      unsealWindowStart: st.unsealWindowStart,
      unsealWindowEnd: st.unsealWindowEnd,
      unsealPerfectStart: st.unsealPerfectStart,
      unsealPerfectEnd: st.unsealPerfectEnd,
      unsealCooldown: st.unsealCooldown,
      unsealBacklashFrames: st.unsealBacklashFrames
    };
  }

  function serializeState(iaidoSt, acupointSt) {
    return JSON.stringify({
      iaido: iaidoSt ? cloneIaidoState(iaidoSt) : null,
      acupoint: acupointSt ? cloneAcupointState(acupointSt) : null
    });
  }

  function deserializeState(json) {
    var obj = typeof json === 'string' ? JSON.parse(json) : json;
    return {
      iaido: obj.iaido ? cloneIaidoState(obj.iaido) : null,
      acupoint: obj.acupoint ? cloneAcupointState(obj.acupoint) : null
    };
  }

  function computeChecksum(iaidoSt, acupointSt) {
    var h = 2166136261 >>> 0;
    if (iaidoSt) {
      h = fnv1aStep(h, iaidoSt.stanceFrames);
      h = fnv1aStep(h, iaidoSt.tension);
      h = fnv1aStep(h, iaidoSt.counterWindowLeft);
      h = fnv1aStep(h, iaidoSt.dashFrames);
      h = fnv1aStep(h, iaidoSt.dashTargetX);
      h = fnv1aStep(h, iaidoSt.delayedCuts.length);
      for (var c = 0; c < iaidoSt.delayedCuts.length; c++) {
        h = fnv1aStep(h, iaidoSt.delayedCuts[c].framesLeft);
        h = fnv1aStep(h, iaidoSt.delayedCuts[c].damage);
      }
    }
    if (acupointSt) {
      h = fnv1aStep(h, acupointSt.activeCount);
      h = fnv1aStep(h, acupointSt.resonanceCharge);
      h = fnv1aStep(h, acupointSt.resonanceImmunityFrames);
      h = fnv1aStep(h, acupointSt.unsealFrames);
      for (var i = 0; i < ACUPOINT_ORDER.length; i++) {
        var s = acupointSt.seals[ACUPOINT_ORDER[i]];
        h = fnv1aStep(h, s.framesLeft);
        h = fnv1aStep(h, s.intensity);
      }
    }
    return h >>> 0;
  }

  // ----------------------- 一、居合蓄势与拔刀张力曲线 -----------------------
  function computeTensionCurve(frames, profileKey) {
    var prof = IAIDO_PROFILES[profileKey] || IAIDO_PROFILES.standard;
    var f = Math.max(0, frames | 0);
    var tension = 0;
    var phase = 'settling';
    var postureStability = 1.0;

    if (f <= prof.settleFrames) {
      // 收心阶段：张力平缓启动（二次缓入）
      var t0 = f / Math.max(1, prof.settleFrames);
      tension = 0.14 * t0 * t0;
      phase = 'settling';
      postureStability = 1.10;
    } else if (f < prof.sweetSpotStart) {
      // 蓄势拉升阶段：快速 S 曲线攀升至 0.88
      var t1 = (f - prof.settleFrames) / Math.max(1, prof.sweetSpotStart - prof.settleFrames);
      var sCurve = t1 * t1 * (3 - 2 * t1);
      tension = 0.14 + 0.74 * sCurve;
      phase = 'building';
      postureStability = 1.05;
    } else if (f <= prof.sweetSpotEnd) {
      // 居合瞬拔甜点区间：张力达到巅峰 1.00（核心帧额外增益）
      var mid = (prof.sweetSpotStart + prof.sweetSpotEnd) * 0.5;
      var halfSpan = Math.max(1, (prof.sweetSpotEnd - prof.sweetSpotStart) * 0.5);
      var bell = 1 - abs(f - mid) / halfSpan;
      tension = 0.92 + 0.08 * clamp(bell, 0, 1);
      phase = 'sweetspot';
      postureStability = 1.25;
    } else if (f <= prof.peakHoldEnd) {
      // 满弓维持阶段：略微回落并维持高压
      var t3 = (f - prof.sweetSpotEnd) / Math.max(1, prof.peakHoldEnd - prof.sweetSpotEnd);
      tension = lerp(0.90, 0.82, t3);
      phase = 'peak_hold';
      postureStability = 0.96;
    } else {
      // 过蓄势衰阶段：虎口酸麻，张力与身法稳定性下滑
      var t4 = clamp((f - prof.peakHoldEnd) / Math.max(1, prof.maxHoldFrames - prof.peakHoldEnd), 0, 1);
      tension = lerp(0.82, 0.42, t4);
      phase = 'overdrawn';
      postureStability = lerp(0.92, 0.60, t4);
    }

    return {
      tension: q(tension),
      phase: phase,
      postureStability: q(postureStability),
      inSweetSpot: phase === 'sweetspot',
      inCoreSweetSpot: f >= prof.sweetSpotCoreStart && f <= prof.sweetSpotCoreEnd
    };
  }

  function enterIaidoStance(fighter, iaidoSt, armCounter) {
    if (iaidoSt.stanceActive || iaidoSt.dashActive || iaidoSt.sheathCooldown > 0) {
      return { entered: false };
    }
    var prof = IAIDO_PROFILES[iaidoSt.profile] || IAIDO_PROFILES.standard;
    iaidoSt.stanceActive = true;
    iaidoSt.stanceFrames = 0;
    iaidoSt.phase = 'settling';
    iaidoSt.tension = 0;
    iaidoSt.tensionSlope = 0;
    iaidoSt.sweetSpotGrade = 'none';
    iaidoSt.counterArmed = armCounter !== false;
    iaidoSt.counterWindowLeft = iaidoSt.counterArmed ? prof.counterWindowFrames : 0;
    iaidoSt.counterTriggered = false;

    // 纳刀沉腰：大幅制动水平滑移速度
    fighter.vx = q((fighter.vx || 0) * 0.25);
    return {
      entered: true,
      counterWindowFrames: iaidoSt.counterWindowLeft,
      sweetSpotRange: [prof.sweetSpotStart, prof.sweetSpotEnd]
    };
  }

  function evaluateQuickdrawRelease(fighter, iaidoSt, stageW, wallMargin, aimDirX) {
    if (!iaidoSt.stanceActive) {
      return { released: false };
    }
    var prof = IAIDO_PROFILES[iaidoSt.profile] || IAIDO_PROFILES.standard;
    var f = iaidoSt.stanceFrames;
    var curve = computeTensionCurve(f, iaidoSt.profile);

    var grade = 'early';
    var dmgMul = 0.85;
    var guardPierce = 0.15;
    var startupFrames = 5;
    var zanshinRecovery = 14;
    var acupointBonus = 0.05;
    var distRatio = 0.55;

    if (curve.inCoreSweetSpot) {
      grade = 'perfect_sweetspot';
      dmgMul = 1.42;
      guardPierce = 0.55;
      startupFrames = 0;
      zanshinRecovery = 7;
      acupointBonus = 0.45;
      distRatio = 1.0;
    } else if (curve.inSweetSpot) {
      grade = 'sweetspot';
      dmgMul = 1.24;
      guardPierce = 0.38;
      startupFrames = 1;
      zanshinRecovery = 9;
      acupointBonus = 0.30;
      distRatio = 0.90;
    } else if (f > prof.sweetSpotEnd && f <= prof.peakHoldEnd) {
      grade = 'good';
      dmgMul = 1.08;
      guardPierce = 0.24;
      startupFrames = 3;
      zanshinRecovery = 11;
      acupointBonus = 0.18;
      distRatio = 0.78;
    } else if (f > prof.peakHoldEnd) {
      grade = 'overdrawn';
      dmgMul = 0.78;
      guardPierce = 0.10;
      startupFrames = 6;
      zanshinRecovery = 18;
      acupointBonus = 0.0;
      distRatio = 0.52;
    } else {
      grade = 'early';
      dmgMul = lerp(0.72, 0.96, curve.tension);
      guardPierce = 0.12;
      startupFrames = 4;
      zanshinRecovery = 13;
      acupointBonus = 0.08;
      distRatio = lerp(0.45, 0.72, curve.tension);
    }

    var dir = aimDirX ? sign(aimDirX) : (fighter.face || 1);
    var dist = lerp(prof.baseDashDist, prof.maxDashDist, distRatio);
    var leftBound = Number.isFinite(wallMargin) ? wallMargin : 56;
    var rightBound = (Number.isFinite(stageW) ? stageW : 1440) - leftBound;
    var targetX = q(clamp((fighter.x || 0) + dir * dist, leftBound, rightBound));

    iaidoSt.stanceActive = false;
    iaidoSt.phase = 'dash_slash';
    iaidoSt.sweetSpotGrade = grade;
    iaidoSt.counterArmed = false;
    iaidoSt.counterWindowLeft = 0;
    iaidoSt.sheathCooldown = prof.sheathCooldownFrames;

    // 启动穿身居合一闪轨迹
    iaidoSt.dashActive = true;
    iaidoSt.dashFrames = 0;
    iaidoSt.dashDuration = grade === 'perfect_sweetspot' ? Math.max(6, prof.dashDurationFrames - 2) : prof.dashDurationFrames;
    iaidoSt.dashDir = dir;
    iaidoSt.dashStartX = q(fighter.x || 0);
    iaidoSt.dashStartY = q(fighter.y || 0);
    iaidoSt.dashTargetX = targetX;
    iaidoSt.dashTargetY = q(fighter.y || 0);
    iaidoSt.dashPrevX = iaidoSt.dashStartX;
    iaidoSt.dashPrevY = iaidoSt.dashStartY;
    iaidoSt.dashPowerMul = q(dmgMul);
    iaidoSt.dashAcupointBonus = q(acupointBonus);
    iaidoSt.dashHitTargets = [];

    fighter.face = dir;

    return {
      released: true,
      grade: grade,
      tension: curve.tension,
      damageMul: q(dmgMul),
      guardPierce: q(guardPierce),
      startupFrames: startupFrames,
      zanshinRecoveryFrames: zanshinRecovery,
      acupointPrecisionBonus: q(acupointBonus),
      dashDistance: q(abs(targetX - iaidoSt.dashStartX)),
      dashDurationFrames: iaidoSt.dashDuration
    };
  }

  // 居合见切反击闪（敌招入距瞬间拔刀化解并穿身反斩）
  function evaluateCounterIaido(defender, iaidoSt, incomingAttack, attacker, stageW, wallMargin) {
    if (!iaidoSt.stanceActive || !iaidoSt.counterArmed || iaidoSt.counterWindowLeft <= 0) {
      return { triggered: false };
    }
    var atk = incomingAttack || {};
    if (atk.unparryable) {
      return { triggered: false, reason: 'unparryable' };
    }

    var prof = IAIDO_PROFILES[iaidoSt.profile] || IAIDO_PROFILES.standard;
    var counterDir = attacker ? sign((attacker.x || 0) - (defender.x || 0)) || (defender.face || 1) : (defender.face || 1);
    var leftBound = Number.isFinite(wallMargin) ? wallMargin : 56;
    var rightBound = (Number.isFinite(stageW) ? stageW : 1440) - leftBound;
    var passDist = attacker ? Math.min(prof.maxDashDist, abs((attacker.x || 0) - (defender.x || 0)) + 145) : prof.baseDashDist;
    var endX = q(clamp((defender.x || 0) + counterDir * passDist, leftBound, rightBound));

    iaidoSt.stanceActive = false;
    iaidoSt.counterArmed = false;
    iaidoSt.counterWindowLeft = 0;
    iaidoSt.counterTriggered = true;
    iaidoSt.sweetSpotGrade = 'counter_flash';
    iaidoSt.phase = 'dash_slash';
    iaidoSt.sheathCooldown = Math.max(10, prof.sheathCooldownFrames - 6);

    iaidoSt.dashActive = true;
    iaidoSt.dashFrames = 0;
    iaidoSt.dashDuration = 6;
    iaidoSt.dashDir = counterDir;
    iaidoSt.dashStartX = q(defender.x || 0);
    iaidoSt.dashStartY = q(defender.y || 0);
    iaidoSt.dashTargetX = endX;
    iaidoSt.dashTargetY = q(defender.y || 0);
    iaidoSt.dashPrevX = iaidoSt.dashStartX;
    iaidoSt.dashPrevY = iaidoSt.dashStartY;
    iaidoSt.dashPowerMul = 1.48;
    iaidoSt.dashAcupointBonus = 0.55;
    iaidoSt.dashHitTargets = [];

    defender.face = counterDir;

    return {
      triggered: true,
      negatedDamage: true,
      hitstopFrames: 8,
      qiRestore: 22,
      counterDir: counterDir,
      counterEndX: endX,
      damageMul: 1.48,
      guaranteedAcupoint: true
    };
  }

  // 穿身居合一闪运动学与连续线段-胶囊扫掠碰撞
  function stepDashSlash(fighter, iaidoSt, targets, dt) {
    if (!iaidoSt.dashActive) return { active: false, hits: [] };
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var prof = IAIDO_PROFILES[iaidoSt.profile] || IAIDO_PROFILES.standard;

    iaidoSt.dashFrames++;
    iaidoSt.dashPrevX = q(fighter.x || 0);
    iaidoSt.dashPrevY = q(fighter.y || 0);

    var u = clamp(iaidoSt.dashFrames / Math.max(1, iaidoSt.dashDuration), 0, 1);
    // 三次爆发-急停缓动：前 25% 极速启动，中段巡航，末尾干脆刹停
    var ease = u < 0.5
      ? (4 * u * u * u)
      : (1 - Math.pow(-2 * u + 2, 3) * 0.5);

    var nextX = q(lerp(iaidoSt.dashStartX, iaidoSt.dashTargetX, ease));
    var nextY = q(lerp(iaidoSt.dashStartY, iaidoSt.dashTargetY, ease));

    fighter.vx = q((nextX - iaidoSt.dashPrevX) / stepDt);
    fighter.vy = q((nextY - iaidoSt.dashPrevY) / stepDt);
    fighter.x = nextX;
    fighter.y = nextY;

    // 连续线段扫掠判定：防止超高速穿身跳过目标身体碰撞盒
    var hits = [];
    if (Array.isArray(targets)) {
      var minX = Math.min(iaidoSt.dashPrevX, nextX);
      var maxX = Math.max(iaidoSt.dashPrevX, nextX);
      for (var i = 0; i < targets.length; i++) {
        var tg = targets[i];
        if (!tg || tg === fighter) continue;
        var tgId = Number.isFinite(tg.idx) ? tg.idx : i;
        if (iaidoSt.dashHitTargets.indexOf(tgId) !== -1) continue;

        var tgRadius = 36 * clamp(tg.size || 1, 0.7, 1.6);
        var tgHeight = 112 * clamp(tg.size || 1, 0.7, 1.6);
        var xOverlap = (tg.x + tgRadius >= minX - 18) && (tg.x - tgRadius <= maxX + 18);
        var slashY = nextY - 56;
        var yOverlap = (slashY >= (tg.y - tgHeight - 16)) && (slashY <= (tg.y + 12));

        if (xOverlap && yOverlap) {
          iaidoSt.dashHitTargets.push(tgId);
          var cutDamage = q(32 * iaidoSt.dashPowerMul);
          // 将迟斩伤害排入纳刀迟斩队列
          iaidoSt.delayedCuts.push({
            targetIdx: tgId,
            framesLeft: prof.delayedCutFrames,
            damage: cutDamage,
            hitY: slashY,
            angleDeg: iaidoSt.sweetSpotGrade === 'counter_flash' ? -18 : -6,
            isBackHit: sign(iaidoSt.dashDir) === sign(tg.face || 1),
            acupointBonus: iaidoSt.dashAcupointBonus
          });
          hits.push({
            targetIdx: tgId,
            immediateChip: q(cutDamage * 0.25),
            delayedDamage: cutDamage,
            delayedFrames: prof.delayedCutFrames,
            hitY: slashY
          });
        }
      }
    }

    var finished = iaidoSt.dashFrames >= iaidoSt.dashDuration;
    if (finished) {
      iaidoSt.dashActive = false;
      iaidoSt.phase = 'zanshin';
      fighter.vx = q(iaidoSt.dashDir * 65);
      fighter.vy = 0;
    }

    return {
      active: !finished,
      finished: finished,
      progress: q(u),
      hits: hits
    };
  }

  // ----------------------- 二、八脉点穴身体分区瞄准与封穴 -----------------------
  function resolveAcupointTarget(attackInfo, defender) {
    var atk = attackInfo || {};
    var def = defender || {};
    var defHeight = 114 * clamp(def.size || 1, 0.7, 1.6);
    var posture = def.state || 'idle';

    // 姿态导致的身体有效高度与局部暴露系数
    var heightScale = posture === 'crouch' ? 0.68 : (posture === 'knockdown' ? 0.35 : 1.0);
    var effectiveH = Math.max(36, defHeight * heightScale);
    var defGroundY = def.y || 0;
    var hitY = Number.isFinite(atk.hitY) ? atk.hitY : (defGroundY - effectiveH * 0.55);

    // 归一化命中高度 relY：0 为足底，1 为头顶
    var relY = clamp((defGroundY - hitY) / effectiveH, 0, 1);
    var angleDeg = clamp(Number.isFinite(atk.angleDeg) ? atk.angleDeg : 0, -85, 85);
    var isBackHit = !!atk.isBackHit;
    var isCounterHit = !!atk.isCounterHit || posture === 'attack';
    var isGuarding = posture === 'guard';
    var isAirborne = posture === 'air' || (def.y || 0) < -18;
    var precisionBonus = clamp(Number.isFinite(atk.precisionBonus) ? atk.precisionBonus : 0, 0, 1);

    var bestId = 'tanzhong';
    var bestScore = -999;
    var scores = {};

    for (var i = 0; i < ACUPOINT_ORDER.length; i++) {
      var id = ACUPOINT_ORDER[i];
      var pt = ACUPOINTS[id];

      // 1. 高度分区匹配分
      var dy = abs(relY - pt.centerY);
      var inZone = relY >= pt.zoneYMin && relY <= pt.zoneYMax;
      var score = (inZone ? 1.0 : 0.45) - dy * 2.15;

      // 2. 攻击入射角度匹配分
      var angleDiff = abs(angleDeg - pt.idealAngleDeg);
      score += clamp(1 - angleDiff / 75, 0, 1) * 0.48;

      // 3. 背击/破招/防反/空中姿态加权
      if (pt.preferBack) {
        score += isBackHit ? 0.85 : -0.45;
      } else if (isBackHit && (id === 'tanzhong' || id === 'qihai')) {
        score -= 0.40;
      }

      if (pt.preferCounter) {
        score += isCounterHit ? 0.72 : -0.10;
      }

      if (isGuarding) {
        if (id === 'hegu' || id === 'quchi') score += 0.55;
        if (id === 'tanzhong' || id === 'qihai') score -= 0.35;
      }

      if (isAirborne) {
        if (id === 'yongquan' && relY < 0.35) score += 0.35;
        if (id === 'mingmen' && isBackHit) score += 0.25;
      }

      score += precisionBonus * 0.18 * pt.sealPower;
      scores[id] = q(score);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    return {
      acupointId: bestId,
      acupoint: ACUPOINTS[bestId],
      relY: q(relY),
      score: q(bestScore),
      scores: scores
    };
  }

  function applyAcupointSeal(acupointSt, acupointId, attackerIdx, durationMul, intensityMul) {
    if (!ACUPOINTS[acupointId] || acupointSt.sealImmunityFrames > 0) {
      return { applied: false, reason: acupointSt.sealImmunityFrames > 0 ? 'immune' : 'invalid_point' };
    }
    var pt = ACUPOINTS[acupointId];
    var dMul = clamp(Number.isFinite(durationMul) ? durationMul : 1.0, 0.35, 2.0);
    var iMul = clamp(Number.isFinite(intensityMul) ? intensityMul : 1.0, 0.5, 1.8);
    var seal = acupointSt.seals[acupointId];

    var wasActive = seal.active;
    var durFrames = Math.round(pt.baseDurationFrames * dMul);
    seal.active = true;
    seal.framesLeft = wasActive ? Math.max(seal.framesLeft, Math.round(durFrames * 0.85)) : durFrames;
    seal.maxFrames = Math.max(seal.maxFrames, seal.framesLeft);
    seal.intensity = q(clamp(wasActive ? (seal.intensity + 0.35 * iMul) : (1.0 * iMul), 0.5, 1.8));
    seal.attackerIdx = Number.isFinite(attackerIdx) ? attackerIdx : -1;

    if (!wasActive) {
      acupointSt.activeCount++;
      acupointSt.sealOrder.push(acupointId);
    }

    // 注入经脉共振能量
    acupointSt.resonanceCharge = q(clamp(acupointSt.resonanceCharge + 38 * pt.sealPower, 0, 150));

    // 自动检查是否触发「经脉震爆」
    var resonance = evaluateMeridianResonance(acupointSt);

    return {
      applied: true,
      refreshed: wasActive,
      acupointId: acupointId,
      cnName: pt.cnName,
      framesLeft: seal.framesLeft,
      intensity: seal.intensity,
      activeCount: acupointSt.activeCount,
      resonance: resonance
    };
  }

  // 聚合所有激活封穴的战斗修正系数
  function computeSealModifiers(acupointSt) {
    var mods = {
      moveSpeedMul: 1.0,
      jumpImpulseMul: 1.0,
      airControlMul: 1.0,
      qiGainMul: 1.0,
      qiDrainPerSec: 0,
      guardDmgTakenMul: 1.0,
      guardRegenMul: 1.0,
      skillCdRateMul: 1.0,
      attackDmgMul: 1.0,
      knockbackOutMul: 1.0,
      weaponReachMul: 1.0,
      attackStartupAdd: 0,
      hitstunMul: 1.0,
      damageTakenMul: 1.0,
      dashDisabled: false,
      activeSeals: []
    };

    for (var i = 0; i < ACUPOINT_ORDER.length; i++) {
      var id = ACUPOINT_ORDER[i];
      var s = acupointSt.seals[id];
      if (!s || !s.active || s.framesLeft <= 0) continue;

      var pt = ACUPOINTS[id];
      var eff = pt.effects;
      var scale = clamp(s.intensity, 0.6, 1.5);
      mods.activeSeals.push(id);

      if (eff.moveSpeedMul !== undefined) mods.moveSpeedMul *= lerp(1, eff.moveSpeedMul, scale);
      if (eff.jumpImpulseMul !== undefined) mods.jumpImpulseMul *= lerp(1, eff.jumpImpulseMul, scale);
      if (eff.airControlMul !== undefined) mods.airControlMul *= lerp(1, eff.airControlMul, scale);
      if (eff.qiGainMul !== undefined) mods.qiGainMul *= lerp(1, eff.qiGainMul, scale);
      if (eff.qiDrainPerSec !== undefined) mods.qiDrainPerSec += eff.qiDrainPerSec * scale;
      if (eff.guardDmgTakenMul !== undefined) mods.guardDmgTakenMul *= lerp(1, eff.guardDmgTakenMul, scale);
      if (eff.guardRegenMul !== undefined) mods.guardRegenMul *= lerp(1, eff.guardRegenMul, scale);
      if (eff.skillCdRateMul !== undefined) mods.skillCdRateMul *= lerp(1, eff.skillCdRateMul, scale);
      if (eff.attackDmgMul !== undefined) mods.attackDmgMul *= lerp(1, eff.attackDmgMul, scale);
      if (eff.knockbackOutMul !== undefined) mods.knockbackOutMul *= lerp(1, eff.knockbackOutMul, scale);
      if (eff.weaponReachMul !== undefined) mods.weaponReachMul *= lerp(1, eff.weaponReachMul, scale);
      if (eff.attackStartupAdd !== undefined) mods.attackStartupAdd += Math.round(eff.attackStartupAdd * scale);
      if (eff.hitstunMul !== undefined) mods.hitstunMul *= lerp(1, eff.hitstunMul, scale);
      if (eff.damageTakenMul !== undefined) mods.damageTakenMul *= lerp(1, eff.damageTakenMul, scale);
      if (eff.dashDisabled) mods.dashDisabled = true;
    }

    mods.moveSpeedMul = q(clamp(mods.moveSpeedMul, 0.35, 1.0));
    mods.jumpImpulseMul = q(clamp(mods.jumpImpulseMul, 0.45, 1.0));
    mods.airControlMul = q(clamp(mods.airControlMul, 0.40, 1.0));
    mods.qiGainMul = q(clamp(mods.qiGainMul, 0.05, 1.0));
    mods.qiDrainPerSec = q(mods.qiDrainPerSec);
    mods.guardDmgTakenMul = q(clamp(mods.guardDmgTakenMul, 1.0, 2.2));
    mods.guardRegenMul = q(clamp(mods.guardRegenMul, 0.15, 1.0));
    mods.skillCdRateMul = q(clamp(mods.skillCdRateMul, 0.08, 1.0));
    mods.attackDmgMul = q(clamp(mods.attackDmgMul, 0.45, 1.0));
    mods.knockbackOutMul = q(clamp(mods.knockbackOutMul, 0.55, 1.0));
    mods.weaponReachMul = q(clamp(mods.weaponReachMul, 0.72, 1.0));
    mods.hitstunMul = q(clamp(mods.hitstunMul, 1.0, 1.55));
    mods.damageTakenMul = q(clamp(mods.damageTakenMul, 1.0, 1.65));

    return mods;
  }

  // ----------------------- 经脉共振链与「经脉震爆」 -----------------------
  function findBestResonancePair(activeIds) {
    var best = null;
    for (var i = 0; i < activeIds.length; i++) {
      for (var j = i + 1; j < activeIds.length; j++) {
        var a = activeIds[i];
        var b = activeIds[j];
        var key = a < b ? (a + '+' + b) : (b + '+' + a);
        var pair = RESONANCE_PAIRS[key];
        if (pair && (!best || pair.dmgMul > best.dmgMul)) {
          best = { key: key, pair: pair, points: [a, b] };
        }
      }
    }
    return best;
  }

  function evaluateMeridianResonance(acupointSt) {
    if (acupointSt.activeCount < 2 || acupointSt.resonanceImmunityFrames > 0) {
      return { triggered: false };
    }

    var activeIds = [];
    var meridians = {};
    var uniqueMeridians = 0;
    var totalPower = 0;

    for (var i = 0; i < ACUPOINT_ORDER.length; i++) {
      var id = ACUPOINT_ORDER[i];
      var s = acupointSt.seals[id];
      if (s && s.active && s.framesLeft > 0) {
        activeIds.push(id);
        var pt = ACUPOINTS[id];
        totalPower += pt.sealPower * s.intensity;
        if (!meridians[pt.meridian]) {
          meridians[pt.meridian] = true;
          uniqueMeridians++;
        }
      }
    }

    if (activeIds.length < 2) {
      return { triggered: false };
    }

    var pairMatch = findBestResonancePair(activeIds);
    var isMajorChain = activeIds.length >= 3;
    var resonanceName = isMajorChain
      ? '经脉震爆 · 三脉齐鸣'
      : (pairMatch ? ('经脉震爆 · ' + pairMatch.pair.name) : '经脉震爆 · 双穴共振');

    var baseDmg = isMajorChain ? 54 : 30;
    var pairMul = pairMatch ? pairMatch.pair.dmgMul : 1.12;
    var chainMul = 1 + Math.max(0, activeIds.length - 2) * 0.28 + Math.max(0, uniqueMeridians - 1) * 0.08;
    var detonationDamage = q(baseDmg * pairMul * chainMul * clamp(totalPower / Math.max(1, activeIds.length), 0.85, 1.5));
    var shockwaveRadius = q(110 + activeIds.length * 34);
    var knockbackVx = q(320 * (pairMatch ? pairMatch.pair.kbScale : 1.15) * (isMajorChain ? 1.25 : 1.0));
    var knockbackVy = q(isMajorChain ? -540 : -360);
    var guardShatter = Math.round((pairMatch ? pairMatch.pair.guardShatter : 32) * (isMajorChain ? 1.35 : 1.0));

    // 引爆后消耗部分或全部封穴，并给予短暂免疫窗口防止同帧循环引爆
    if (isMajorChain) {
      clearAllSeals(acupointSt);
      acupointSt.resonanceImmunityFrames = 90;
    } else {
      // 双穴共振保留最短残余时间以维持压制，但清空共振槽并开启冷却
      for (var k = 0; k < activeIds.length; k++) {
        var sk = acupointSt.seals[activeIds[k]];
        sk.framesLeft = Math.min(sk.framesLeft, 75);
      }
      acupointSt.resonanceImmunityFrames = 75;
    }

    acupointSt.resonanceCharge = 0;
    acupointSt.resonanceCount++;

    return {
      triggered: true,
      tier: isMajorChain ? 'major_chain' : 'pair_resonance',
      name: resonanceName,
      triggeredPoints: activeIds,
      uniqueMeridians: uniqueMeridians,
      internalDamage: detonationDamage,
      guardShatter: guardShatter,
      shockwaveRadius: shockwaveRadius,
      knockbackVx: knockbackVx,
      knockbackVy: knockbackVy,
      hitstopFrames: isMajorChain ? 10 : 6
    };
  }

  function clearAllSeals(acupointSt) {
    for (var i = 0; i < ACUPOINT_ORDER.length; i++) {
      var s = acupointSt.seals[ACUPOINT_ORDER[i]];
      s.active = false;
      s.framesLeft = 0;
      s.maxFrames = 0;
      s.intensity = 0;
      s.attackerIdx = -1;
    }
    acupointSt.activeCount = 0;
    acupointSt.sealOrder = [];
  }

  // ----------------------- 主动「运功冲穴」反解时机窗口 -----------------------
  function beginCounterUnseal(acupointSt) {
    if (acupointSt.activeCount <= 0 || acupointSt.unsealActive || acupointSt.unsealCooldown > 0) {
      return { started: false };
    }
    // 封穴越多、或气海被封时，运功脉冲窗口略微收紧但仍保持公平可读
    var qihaiSealed = acupointSt.seals.qihai && acupointSt.seals.qihai.active;
    var totalFrames = 28 + Math.min(10, acupointSt.activeCount * 3);
    var windowCenter = Math.round(totalFrames * 0.58);
    var halfGood = qihaiSealed ? 5 : 7;
    var halfPerfect = qihaiSealed ? 2 : 3;

    acupointSt.unsealActive = true;
    acupointSt.unsealFrames = 0;
    acupointSt.unsealTotalFrames = totalFrames;
    acupointSt.unsealWindowStart = Math.max(4, windowCenter - halfGood);
    acupointSt.unsealWindowEnd = Math.min(totalFrames - 2, windowCenter + halfGood);
    acupointSt.unsealPerfectStart = Math.max(4, windowCenter - halfPerfect);
    acupointSt.unsealPerfectEnd = Math.min(totalFrames - 2, windowCenter + halfPerfect);

    return {
      started: true,
      totalFrames: totalFrames,
      goodWindow: [acupointSt.unsealWindowStart, acupointSt.unsealWindowEnd],
      perfectWindow: [acupointSt.unsealPerfectStart, acupointSt.unsealPerfectEnd]
    };
  }

  function confirmCounterUnseal(acupointSt) {
    if (!acupointSt.unsealActive) {
      return { resolved: false };
    }
    var f = acupointSt.unsealFrames;
    var purgedCount = acupointSt.activeCount;
    acupointSt.unsealActive = false;

    // 1. 完美脉冲：清空全部封穴 + 护体气浪震退近身敌人 + 恢复护体与内气 + 短暂免疫
    if (f >= acupointSt.unsealPerfectStart && f <= acupointSt.unsealPerfectEnd) {
      clearAllSeals(acupointSt);
      acupointSt.resonanceCharge = 0;
      acupointSt.sealImmunityFrames = 48;
      acupointSt.unsealCooldown = 36;
      return {
        resolved: true,
        grade: 'perfect_unseal',
        purgedCount: purgedCount,
        qiShockwaveRadius: q(125 + purgedCount * 22),
        pushbackVx: q(340 + purgedCount * 45),
        guardRestore: 18 + purgedCount * 6,
        qiRestore: 15 + purgedCount * 5,
        immunityFrames: acupointSt.sealImmunityFrames
      };
    }

    // 2. 良性脉冲：冲开最早一个封穴，其余封穴剩余时间减半
    if (f >= acupointSt.unsealWindowStart && f <= acupointSt.unsealWindowEnd) {
      var removedId = acupointSt.sealOrder.length > 0 ? acupointSt.sealOrder.shift() : '';
      if (removedId && acupointSt.seals[removedId]) {
        acupointSt.seals[removedId].active = false;
        acupointSt.seals[removedId].framesLeft = 0;
        acupointSt.seals[removedId].intensity = 0;
        acupointSt.activeCount = Math.max(0, acupointSt.activeCount - 1);
      }
      for (var i = 0; i < ACUPOINT_ORDER.length; i++) {
        var s = acupointSt.seals[ACUPOINT_ORDER[i]];
        if (s.active) s.framesLeft = Math.max(1, Math.floor(s.framesLeft * 0.5));
      }
      acupointSt.resonanceCharge = q(acupointSt.resonanceCharge * 0.45);
      acupointSt.unsealCooldown = 48;
      return {
        resolved: true,
        grade: 'good_unseal',
        purgedPoint: removedId,
        remainingCount: acupointSt.activeCount,
        guardRestore: 10,
        qiRestore: 8
      };
    }

    // 3. 时机失误：走火反噬（短暂硬直 + 冷却）
    acupointSt.unsealCooldown = 72;
    acupointSt.unsealBacklashFrames = 14;
    return {
      resolved: true,
      grade: 'backlash',
      backlashFrames: acupointSt.unsealBacklashFrames,
      selfChipDamage: 8
    };
  }

  // ----------------------- 三、统一每帧步进管线 -----------------------
  function stepIaidoAcupoint(fighter, iaidoSt, acupointSt, targets, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var events = [];

    // 1. 居合状态步进
    if (iaidoSt) {
      var prof = IAIDO_PROFILES[iaidoSt.profile] || IAIDO_PROFILES.standard;
      if (iaidoSt.sheathCooldown > 0) iaidoSt.sheathCooldown--;

      if (iaidoSt.stanceActive) {
        var prevTension = iaidoSt.tension;
        iaidoSt.stanceFrames++;
        var curve = computeTensionCurve(iaidoSt.stanceFrames, iaidoSt.profile);
        iaidoSt.tension = curve.tension;
        iaidoSt.tensionSlope = q((curve.tension - prevTension) / stepDt);
        iaidoSt.phase = curve.phase;

        if (iaidoSt.counterWindowLeft > 0) {
          iaidoSt.counterWindowLeft--;
          if (iaidoSt.counterWindowLeft === 0) iaidoSt.counterArmed = false;
        }

        if (iaidoSt.stanceFrames === prof.sweetSpotStart) {
          events.push({ type: 'iaido_sweetspot_open', frame: iaidoSt.stanceFrames });
        }
        if (iaidoSt.stanceFrames >= prof.maxHoldFrames) {
          iaidoSt.stanceActive = false;
          iaidoSt.phase = 'exhausted';
          iaidoSt.sheathCooldown = prof.sheathCooldownFrames;
          events.push({ type: 'iaido_stance_exhausted' });
        }
      }

      if (iaidoSt.dashActive) {
        var dashRes = stepDashSlash(fighter, iaidoSt, targets, stepDt);
        if (dashRes.hits.length > 0) {
          events.push({ type: 'iaido_dash_hits', hits: dashRes.hits });
        }
        if (dashRes.finished) {
          events.push({ type: 'iaido_dash_finish', x: fighter.x, y: fighter.y });
        }
      }

      // 推进纳刀迟斩队列
      for (var c = iaidoSt.delayedCuts.length - 1; c >= 0; c--) {
        var cut = iaidoSt.delayedCuts[c];
        cut.framesLeft--;
        if (cut.framesLeft <= 0) {
          events.push({
            type: 'iaido_delayed_cut_trigger',
            targetIdx: cut.targetIdx,
            damage: cut.damage,
            hitY: cut.hitY,
            angleDeg: cut.angleDeg,
            isBackHit: cut.isBackHit,
            acupointBonus: cut.acupointBonus
          });
          iaidoSt.delayedCuts.splice(c, 1);
        }
      }
    }

    // 2. 八脉点穴与运功冲穴步进
    var sealModifiers = null;
    if (acupointSt) {
      if (acupointSt.resonanceImmunityFrames > 0) acupointSt.resonanceImmunityFrames--;
      if (acupointSt.sealImmunityFrames > 0) acupointSt.sealImmunityFrames--;
      if (acupointSt.unsealCooldown > 0) acupointSt.unsealCooldown--;
      if (acupointSt.unsealBacklashFrames > 0) acupointSt.unsealBacklashFrames--;

      // 衰减激活的封穴计时器
      var expired = [];
      for (var i = 0; i < ACUPOINT_ORDER.length; i++) {
        var id = ACUPOINT_ORDER[i];
        var s = acupointSt.seals[id];
        if (!s.active) continue;
        s.framesLeft--;
        if (s.framesLeft <= 0) {
          s.active = false;
          s.framesLeft = 0;
          s.intensity = 0;
          s.attackerIdx = -1;
          acupointSt.activeCount = Math.max(0, acupointSt.activeCount - 1);
          var ordIdx = acupointSt.sealOrder.indexOf(id);
          if (ordIdx !== -1) acupointSt.sealOrder.splice(ordIdx, 1);
          expired.push(id);
        }
      }
      if (expired.length > 0) {
        events.push({ type: 'acupoint_expired', points: expired });
      }

      // 推进运功冲穴进度，超时未按键则自动结算为走火反噬
      if (acupointSt.unsealActive) {
        acupointSt.unsealFrames++;
        if (acupointSt.unsealFrames === acupointSt.unsealWindowStart) {
          events.push({ type: 'unseal_window_open', frame: acupointSt.unsealFrames });
        }
        if (acupointSt.unsealFrames >= acupointSt.unsealTotalFrames) {
          var timeoutRes = confirmCounterUnseal(acupointSt);
          events.push({ type: 'unseal_timeout', result: timeoutRes });
        }
      }

      // 无新封穴注入时缓慢衰减共振能量
      if (acupointSt.resonanceCharge > 0) {
        acupointSt.resonanceCharge = q(Math.max(0, acupointSt.resonanceCharge - 6.5 * stepDt));
      }

      sealModifiers = computeSealModifiers(acupointSt);
    }

    return {
      events: events,
      sealModifiers: sealModifiers
    };
  }

  // ----------------------- 导出 RYPhysics.IaidoAcupoint -----------------------
  root.IaidoAcupoint = {
    VERSION: '1.0.0',
    FIXED_DT: FIXED_DT,
    IAIDO_PROFILES: IAIDO_PROFILES,
    ACUPOINT_ORDER: ACUPOINT_ORDER,
    ACUPOINTS: ACUPOINTS,
    RESONANCE_PAIRS: RESONANCE_PAIRS,
    createIaidoState: createIaidoState,
    createAcupointState: createAcupointState,
    cloneIaidoState: cloneIaidoState,
    cloneAcupointState: cloneAcupointState,
    serializeState: serializeState,
    deserializeState: deserializeState,
    computeChecksum: computeChecksum,
    computeTensionCurve: computeTensionCurve,
    enterIaidoStance: enterIaidoStance,
    evaluateQuickdrawRelease: evaluateQuickdrawRelease,
    evaluateCounterIaido: evaluateCounterIaido,
    stepDashSlash: stepDashSlash,
    resolveAcupointTarget: resolveAcupointTarget,
    applyAcupointSeal: applyAcupointSeal,
    computeSealModifiers: computeSealModifiers,
    evaluateMeridianResonance: evaluateMeridianResonance,
    clearAllSeals: clearAllSeals,
    beginCounterUnseal: beginCounterUnseal,
    confirmCounterUnseal: confirmCounterUnseal,
    stepIaidoAcupoint: stepIaidoAcupoint
  };
})(RYPhysics);
