// ======================= 空中连段与浮空追击物理模型 =======================
// 本模块实现《刃影》完全可回滚确定性的空中战斗与浮空连段物理子系统（RYPhysics.Aerial）：
//   1. 连段动态重力曲线（滞空顶点轻功漂浮、下落加速倍率、连击重力递升、招式重量分级）
//   2. 受击浮空衰减与连段极限脱出稳定（指数+双曲浮空衰减、浮空点数预算、软上限推离与硬上限翻身脱出）
//   3. 终端速度与凌空急停气动阻力（各向异性空气阻力、方向性终端速度钳位、主动凌空急停反推）
//   4. 飞踢俯冲与下坠重击动量传递（高度势能转化、落地冲击波滑行、命中弹性反跳与下砸钉地）
//   5. 空中蓄力悬停推力（空中蓄力减重悬停、三阶蓄劲积蓄、释放瞬间动能爆发与后坐力）
//   6. 多段轻功跳跃动量守恒（水平动量点积继承、反向折返能量损耗、逐段高度衰减）
//   7. 蹬壁反跳矢量（贴壁滑降摩擦、撞壁宽限期弹性增益、连续蹬壁递减与受击撞墙区分）
//   8. 空中受身定向漂移（五向受身轨迹、受身无敌帧、漂移加速度控制与输入缓冲）
// 严格遵循固定步长与量化运算，无任何非确定性随机源，支持联机回滚存档校验。

var RYPhysics = (typeof window !== 'undefined' ? (window.RYPhysics = window.RYPhysics || {}) : {});

(function (root) {
  'use strict';

  // ----------------------- 确定性数学与常量 -----------------------
  var FIXED_DT = 1 / 60;
  var QUANT_SCALE = 10000;
  var INV_QUANT = 0.0001;
  var DEG_TO_RAD = 0.017453292519943295;
  var PI = 3.141592653589793;
  var TWO_PI = 6.283185307179586;
  var HALF_PI = 1.5707963267948966;

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

  function detSin(rad) {
    var x = rad % TWO_PI;
    if (x > PI) x -= TWO_PI;
    else if (x < -PI) x += TWO_PI;
    var y = (1.2732395447351628 * x) - (0.4052847345693511 * x * abs(x));
    y = 0.225 * (y * abs(y) - y) + y;
    return q(y);
  }

  function detCos(rad) {
    return detSin(rad + HALF_PI);
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

  // ----------------------- 物理配置文件与参数表 -----------------------
  var GRAVITY_PROFILES = Object.freeze({
    standard: Object.freeze({
      id: 'standard',
      baseGravity: 2150,
      apexVyThreshold: 145,
      apexGravityMul: 0.62,
      riseGravityMul: 0.96,
      fallGravityMul: 1.24,
      fastFallMul: 1.68,
      juggleStepMul: 0.085,
      juggleMaxMul: 2.35,
      terminalFallVy: 1380,
      terminalFastFallVy: 1760,
      terminalRiseVy: -1520,
      airDragX: 0.55,
      airDragY: 0.18,
      quadDragX: 0.00045
    }),
    qinggong: Object.freeze({
      id: 'qinggong',
      baseGravity: 1820,
      apexVyThreshold: 175,
      apexGravityMul: 0.50,
      riseGravityMul: 0.90,
      fallGravityMul: 1.12,
      fastFallMul: 1.55,
      juggleStepMul: 0.078,
      juggleMaxMul: 2.20,
      terminalFallVy: 1240,
      terminalFastFallVy: 1620,
      terminalRiseVy: -1640,
      airDragX: 0.42,
      airDragY: 0.22,
      quadDragX: 0.00038
    }),
    heavy_iron: Object.freeze({
      id: 'heavy_iron',
      baseGravity: 2480,
      apexVyThreshold: 115,
      apexGravityMul: 0.76,
      riseGravityMul: 1.04,
      fallGravityMul: 1.34,
      fastFallMul: 1.82,
      juggleStepMul: 0.095,
      juggleMaxMul: 2.55,
      terminalFallVy: 1580,
      terminalFastFallVy: 1960,
      terminalRiseVy: -1360,
      airDragX: 0.68,
      airDragY: 0.14,
      quadDragX: 0.00052
    })
  });

  // 招式重量级对应的浮空点数消耗与浮空衰减速
  var MOVE_WEIGHT_CLASSES = Object.freeze({
    light: Object.freeze({ juggleCost: 11, liftDecayRate: 0.10, gravityBump: 0.05, liftFloor: 0.34 }),
    medium: Object.freeze({ juggleCost: 16, liftDecayRate: 0.13, gravityBump: 0.08, liftFloor: 0.30 }),
    heavy: Object.freeze({ juggleCost: 22, liftDecayRate: 0.16, gravityBump: 0.11, liftFloor: 0.26 }),
    launcher: Object.freeze({ juggleCost: 18, liftDecayRate: 0.07, gravityBump: 0.04, liftFloor: 0.48 }),
    spike: Object.freeze({ juggleCost: 26, liftDecayRate: 0.22, gravityBump: 0.16, liftFloor: 0.15 }),
    ultimate: Object.freeze({ juggleCost: 28, liftDecayRate: 0.05, gravityBump: 0.03, liftFloor: 0.55 })
  });

  // 飞踢/俯冲攻击角度预设
  var DIVE_PROFILES = Object.freeze({
    shallow: Object.freeze({ angleDeg: 30, baseSpeed: 980, accel: 620, maxSpeed: 1560, bounceScale: 0.68, guardBonus: 1.15 }),
    standard: Object.freeze({ angleDeg: 45, baseSpeed: 1080, accel: 740, maxSpeed: 1720, bounceScale: 0.62, guardBonus: 1.28 }),
    steep: Object.freeze({ angleDeg: 65, baseSpeed: 1180, accel: 880, maxSpeed: 1880, bounceScale: 0.54, guardBonus: 1.42 }),
    plunge: Object.freeze({ angleDeg: 85, baseSpeed: 1260, accel: 1050, maxSpeed: 2050, bounceScale: 0.42, guardBonus: 1.65 })
  });

  // 空中蓄力三阶参数
  var HOVER_TIERS = Object.freeze([
    Object.freeze({ tier: 1, name: '凝气', minCharge: 0.0, gravityScale: 0.26, burstSpeed: 640, dmgMul: 1.12, kbMul: 1.08, recoilSpeed: 180 }),
    Object.freeze({ tier: 2, name: '聚劲', minCharge: 0.45, gravityScale: 0.18, burstSpeed: 880, dmgMul: 1.32, kbMul: 1.24, recoilSpeed: 260 }),
    Object.freeze({ tier: 3, name: '破空', minCharge: 0.85, gravityScale: 0.10, burstSpeed: 1160, dmgMul: 1.58, kbMul: 1.45, recoilSpeed: 340 })
  ]);

  // 空中受身五向轨迹预设
  var AIR_TECH_DIRS = Object.freeze({
    neutral: Object.freeze({ vx: 0, vy: -420, driftAx: 260, invulFrames: 12, durationFrames: 18 }),
    forward: Object.freeze({ vx: 380, vy: -340, driftAx: 420, invulFrames: 11, durationFrames: 18 }),
    back: Object.freeze({ vx: -410, vy: -360, driftAx: 380, invulFrames: 14, durationFrames: 20 }),
    up: Object.freeze({ vx: 0, vy: -610, driftAx: 220, invulFrames: 13, durationFrames: 20 }),
    down: Object.freeze({ vx: 120, vy: 280, driftAx: 320, invulFrames: 10, durationFrames: 14 })
  });

  // ----------------------- 空中状态管理与回滚接口 -----------------------
  function createAerialState(config) {
    var cfg = config || {};
    var profileId = GRAVITY_PROFILES[cfg.profile] ? cfg.profile : 'standard';
    return {
      profile: profileId,
      airborne: false,
      airFrames: 0,
      fastFalling: false,
      gravityScale: 1.0,
      effectiveGravity: GRAVITY_PROFILES[profileId].baseGravity,

      // 连段与浮空极限状态
      juggleCount: 0,
      jugglePoints: 0,
      juggleLimit: Number.isFinite(cfg.juggleLimit) ? cfg.juggleLimit : 100,
      juggleGravityBonus: 0,
      liftDecayFactor: 1.0,
      stabilizing: false,
      stabilizeFrames: 0,
      groundBounces: 0,
      maxGroundBounces: Number.isFinite(cfg.maxGroundBounces) ? cfg.maxGroundBounces : 1,
      wallBounces: 0,
      maxWallBounces: Number.isFinite(cfg.maxWallBounces) ? cfg.maxWallBounces : 1,

      // 凌空急停状态
      airBrakeActive: false,
      airBrakeFrames: 0,
      airBrakeCD: 0,

      // 空中蓄力悬停状态（空中蓄力）
      hoverActive: false,
      hoverFrames: 0,
      hoverCharge: 0,
      hoverTier: 1,
      hoverFuel: 1.0,
      hoverMaxFrames: Number.isFinite(cfg.hoverMaxFrames) ? cfg.hoverMaxFrames : 72,
      postBurstFloatFrames: 0,

      // 飞踢/俯冲状态
      diveActive: false,
      diveProfile: 'standard',
      diveDirX: 1,
      diveSpeed: 0,
      diveStartY: 0,
      diveFrames: 0,

      // 多段跳与蹬壁状态
      jumpsUsed: 0,
      maxJumps: Number.isFinite(cfg.maxJumps) ? cfg.maxJumps : 2,
      wallContactSide: 0,
      wallImpactGraceFrames: 0,
      wallImpactSpeed: 0,
      wallJumpCD: 0,
      wallJumpChain: 0,
      lastWallSide: 0,

      // 空中受身状态
      airTechActive: false,
      airTechDir: 'neutral',
      airTechFrames: 0,
      airTechInvulFrames: 0,
      airTechBufferFrames: 0,
      airTechDriftInputX: 0
    };
  }

  function cloneState(st) {
    return Object.assign({}, st);
  }

  function serializeState(st) {
    return JSON.stringify(cloneState(st));
  }

  function deserializeState(json) {
    var obj = typeof json === 'string' ? JSON.parse(json) : json;
    return Object.assign(createAerialState({ profile: obj.profile }), obj);
  }

  function computeChecksum(st) {
    var h = 2166136261 >>> 0;
    h = fnv1aStep(h, st.airFrames);
    h = fnv1aStep(h, st.gravityScale);
    h = fnv1aStep(h, st.juggleCount);
    h = fnv1aStep(h, st.jugglePoints);
    h = fnv1aStep(h, st.liftDecayFactor);
    h = fnv1aStep(h, st.stabilizeFrames);
    h = fnv1aStep(h, st.hoverCharge);
    h = fnv1aStep(h, st.hoverFuel);
    h = fnv1aStep(h, st.diveSpeed);
    h = fnv1aStep(h, st.jumpsUsed);
    h = fnv1aStep(h, st.wallJumpChain);
    h = fnv1aStep(h, st.airTechFrames);
    return h >>> 0;
  }

  function resetOnLanding(st) {
    st.airborne = false;
    st.airFrames = 0;
    st.fastFalling = false;
    st.gravityScale = 1.0;
    st.juggleCount = 0;
    st.jugglePoints = 0;
    st.juggleGravityBonus = 0;
    st.liftDecayFactor = 1.0;
    st.stabilizing = false;
    st.stabilizeFrames = 0;
    st.groundBounces = 0;
    st.wallBounces = 0;
    st.airBrakeActive = false;
    st.airBrakeFrames = 0;
    st.hoverActive = false;
    st.hoverFrames = 0;
    st.hoverCharge = 0;
    st.hoverTier = 1;
    st.hoverFuel = 1.0;
    st.postBurstFloatFrames = 0;
    st.diveActive = false;
    st.diveSpeed = 0;
    st.diveFrames = 0;
    st.jumpsUsed = 0;
    st.wallContactSide = 0;
    st.wallImpactGraceFrames = 0;
    st.wallImpactSpeed = 0;
    st.wallJumpChain = 0;
    st.lastWallSide = 0;
    st.airTechActive = false;
    st.airTechFrames = 0;
    st.airTechInvulFrames = 0;
    return st;
  }

  // ----------------------- 1. 连段动态重力曲线 -----------------------
  function computeComboGravity(fighter, st) {
    var prof = GRAVITY_PROFILES[st.profile] || GRAVITY_PROFILES.standard;
    var vy = fighter.vy || 0;
    var inHitstun = fighter.state === 'hitstun' || fighter.state === 'launch';

    // 阶段重力倍率：上升段、顶点轻功漂浮段、下落段、急坠段
    var phaseMul = 1.0;
    if (abs(vy) <= prof.apexVyThreshold && !st.fastFalling) {
      var apexT = 1 - (abs(vy) / Math.max(1, prof.apexVyThreshold));
      phaseMul = lerp(1.0, prof.apexGravityMul, apexT * apexT);
    } else if (vy < 0) {
      phaseMul = prof.riseGravityMul;
    } else {
      phaseMul = st.fastFalling ? prof.fastFallMul : prof.fallGravityMul;
    }

    // 连段浮空重力递升：防止无限空中循环
    var juggleMul = 1.0;
    if (inHitstun && st.juggleCount > 0) {
      var softExcess = Math.max(0, st.juggleCount - 2);
      var quadRamp = softExcess * softExcess * 0.012;
      juggleMul = clamp(
        1 + st.juggleCount * prof.juggleStepMul + st.juggleGravityBonus + quadRamp,
        1.0,
        prof.juggleMaxMul
      );
      // 滞空时间过长时额外增加重力压迫
      if (st.airFrames > 90) {
        juggleMul = clamp(juggleMul + (st.airFrames - 90) * 0.0045, 1.0, prof.juggleMaxMul + 0.35);
      }
    }

    // 空中蓄力或爆发后短暂轻功减重覆盖
    var overrideMul = 1.0;
    if (st.hoverActive) {
      var tierDef = HOVER_TIERS[clamp(st.hoverTier - 1, 0, HOVER_TIERS.length - 1)];
      overrideMul = tierDef.gravityScale;
    } else if (st.postBurstFloatFrames > 0) {
      overrideMul = 0.42;
    } else if (st.stabilizing) {
      overrideMul = 1.18;
    }

    var totalScale = q(phaseMul * juggleMul * overrideMul);
    var effectiveG = q(prof.baseGravity * totalScale);
    st.gravityScale = totalScale;
    st.effectiveGravity = effectiveG;

    return {
      gravity: effectiveG,
      scale: totalScale,
      phaseMul: q(phaseMul),
      juggleMul: q(juggleMul),
      overrideMul: q(overrideMul)
    };
  }

  // ----------------------- 2. 受击浮空衰减与连段极限脱出稳定 -----------------------
  function computeHitLiftImpulse(fighter, st, hitSpec) {
    var spec = hitSpec || {};
    var weightKey = MOVE_WEIGHT_CLASSES[spec.weightClass] ? spec.weightClass : 'medium';
    var weight = MOVE_WEIGHT_CLASSES[weightKey];
    var baseKbX = Number.isFinite(spec.kbX) ? spec.kbX : 180;
    var baseKbY = Number.isFinite(spec.kbY) ? spec.kbY : -480;
    var hitDir = spec.dirX ? sign(spec.dirX) : -(fighter.face || 1);

    // 若已处于浮空极限脱出无敌期，拒绝继续追击
    if (st.stabilizing && st.stabilizeFrames > 0) {
      return {
        accepted: false,
        stabilized: true,
        appliedVx: fighter.vx || 0,
        appliedVy: fighter.vy || 0,
        jugglePoints: st.jugglePoints,
        liftDecay: st.liftDecayFactor
      };
    }

    st.juggleCount++;
    st.jugglePoints = q(st.jugglePoints + weight.juggleCost);
    st.juggleGravityBonus = q(st.juggleGravityBonus + weight.gravityBump);

    // 指数 + 双曲复合衰减公式，确保前几段手感饱满，后段自然下坠
    var n = Math.max(0, st.juggleCount - 1);
    var expDecay = Math.pow(1 - weight.liftDecayRate, n);
    var hypDecay = 1 / (1 + n * 0.085);
    var combinedDecay = clamp(expDecay * 0.65 + hypDecay * 0.35, weight.liftFloor, 1.0);

    var limitRatio = st.jugglePoints / Math.max(1, st.juggleLimit);
    var pushOutBonus = 1.0;

    // 软上限区间（70%~99%）：压缩纵向浮空并放大水平推离，自然拉开身位
    if (limitRatio >= 0.70 && limitRatio < 1.0) {
      var softT = (limitRatio - 0.70) / 0.30;
      combinedDecay = clamp(combinedDecay * lerp(1.0, 0.58, softT), weight.liftFloor * 0.75, 1.0);
      pushOutBonus = lerp(1.0, 1.48, softT);
    }

    st.liftDecayFactor = q(combinedDecay);

    // 硬上限触发（>=100%）：强制进入连段极限翻身脱出状态
    if (limitRatio >= 1.0) {
      st.stabilizing = true;
      st.stabilizeFrames = 26;
      st.airTechInvulFrames = 24;
      var escapeVx = q(hitDir * Math.max(360, abs(baseKbX) * 1.45));
      var escapeVy = q(-430);
      fighter.vx = escapeVx;
      fighter.vy = escapeVy;
      return {
        accepted: true,
        stabilized: true,
        triggeredFlipOut: true,
        appliedVx: escapeVx,
        appliedVy: escapeVy,
        jugglePoints: st.jugglePoints,
        liftDecay: st.liftDecayFactor,
        invulFrames: st.airTechInvulFrames
      };
    }

    // 向下钉地招式不衰减正向 vy，反而强化下砸速度
    var scaledVy = baseKbY < 0
      ? q(baseKbY * combinedDecay)
      : q(baseKbY * (1 + n * 0.04));
    var scaledVx = q(hitDir * abs(baseKbX) * pushOutBonus);

    // 保留极少量原有水平惯性以保证连击弧线平滑
    fighter.vx = q(scaledVx + (fighter.vx || 0) * 0.14);
    fighter.vy = scaledVy;

    return {
      accepted: true,
      stabilized: false,
      triggeredFlipOut: false,
      appliedVx: fighter.vx,
      appliedVy: fighter.vy,
      jugglePoints: st.jugglePoints,
      juggleRatio: q(limitRatio),
      liftDecay: st.liftDecayFactor,
      pushOutBonus: q(pushOutBonus)
    };
  }

  // ----------------------- 3. 终端速度与凌空急停气动阻力 -----------------------
  function triggerAirBrake(fighter, st) {
    if (!st.airborne || st.airBrakeCD > 0 || st.diveActive || st.stabilizing) {
      return { activated: false };
    }
    st.airBrakeActive = true;
    st.airBrakeFrames = 10;
    st.airBrakeCD = 26;
    // 瞬间削减 38% 水平动量并略微托举减速，营造武侠凌空折身感
    fighter.vx = q((fighter.vx || 0) * 0.62);
    if ((fighter.vy || 0) > 160) {
      fighter.vy = q(fighter.vy * 0.58);
    }
    return {
      activated: true,
      durationFrames: st.airBrakeFrames,
      vxAfter: fighter.vx,
      vyAfter: fighter.vy
    };
  }

  function applyTerminalVelocityAndDrag(fighter, st, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var prof = GRAVITY_PROFILES[st.profile] || GRAVITY_PROFILES.standard;
    var vx = fighter.vx || 0;
    var vy = fighter.vy || 0;

    if (st.airBrakeCD > 0) st.airBrakeCD--;

    // 凌空急停期间施加高阻尼反推
    if (st.airBrakeActive) {
      st.airBrakeFrames--;
      var brakeDecelX = 2400;
      var dvx = brakeDecelX * stepDt;
      vx = abs(vx) <= dvx ? 0 : (vx - sign(vx) * dvx);
      if (vy > 0) vy *= 0.86;
      if (st.airBrakeFrames <= 0) st.airBrakeActive = false;
    } else if (!st.diveActive) {
      // 常规各向异性空气阻力（水平线性+二次阻力，纵向轻度线性阻力）
      var dragAx = -(prof.airDragX * vx + prof.quadDragX * vx * abs(vx));
      var dragAy = -(prof.airDragY * vy);
      vx += dragAx * stepDt;
      vy += dragAy * stepDt;
    }

    // 方向性终端速度钳位
    var maxDownVy = st.diveActive
      ? (DIVE_PROFILES[st.diveProfile] ? DIVE_PROFILES[st.diveProfile].maxSpeed : 1850)
      : (st.fastFalling ? prof.terminalFastFallVy : prof.terminalFallVy);
    var maxUpVy = prof.terminalRiseVy;

    vy = clamp(vy, maxUpVy, maxDownVy);
    vx = clamp(vx, -1650, 1650);

    fighter.vx = q(vx);
    fighter.vy = q(vy);

    return {
      vx: fighter.vx,
      vy: fighter.vy,
      atTerminalFall: fighter.vy >= maxDownVy - 1,
      airBraking: st.airBrakeActive
    };
  }

  // ----------------------- 4. 飞踢俯冲与下坠重击动量传递 -----------------------
  function initiateDiveKick(fighter, st, profileKey, dirX) {
    if (!st.airborne || st.stabilizing || st.diveActive) {
      return { started: false };
    }
    var key = DIVE_PROFILES[profileKey] ? profileKey : 'standard';
    var prof = DIVE_PROFILES[key];
    var dir = dirX ? sign(dirX) : (fighter.face || 1);
    var rad = prof.angleDeg * DEG_TO_RAD;

    // 结合起手水平惯性与俯冲初速
    var carryX = clamp((fighter.vx || 0) * dir, 0, 260) * 0.35;
    var startSpeed = prof.baseSpeed + carryX;

    st.diveActive = true;
    st.diveProfile = key;
    st.diveDirX = dir;
    st.diveSpeed = q(startSpeed);
    st.diveStartY = q(fighter.y || 0);
    st.diveFrames = 0;
    st.hoverActive = false;
    st.airBrakeActive = false;

    fighter.face = dir;
    fighter.vx = q(dir * startSpeed * detCos(rad));
    fighter.vy = q(startSpeed * detSin(rad));

    return {
      started: true,
      profile: key,
      angleDeg: prof.angleDeg,
      vx: fighter.vx,
      vy: fighter.vy
    };
  }

  function stepDiveKick(fighter, st, dt) {
    if (!st.diveActive) return { active: false };
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var prof = DIVE_PROFILES[st.diveProfile] || DIVE_PROFILES.standard;
    var rad = prof.angleDeg * DEG_TO_RAD;

    st.diveFrames++;
    // 下坠高度势能持续转化为俯冲动能
    var dropHeight = Math.max(0, (fighter.y || 0) - st.diveStartY);
    var altitudeAccel = prof.accel + clamp(dropHeight * 1.15, 0, 520);
    st.diveSpeed = q(Math.min(prof.maxSpeed, st.diveSpeed + altitudeAccel * stepDt));

    fighter.vx = q(st.diveDirX * st.diveSpeed * detCos(rad));
    fighter.vy = q(st.diveSpeed * detSin(rad));

    var mass = clamp(fighter.mass || 1, 0.5, 2.5);
    var kineticEnergy = q(0.5 * mass * (st.diveSpeed * st.diveSpeed) * 0.0001);

    return {
      active: true,
      speed: st.diveSpeed,
      kineticEnergy: kineticEnergy,
      dropHeight: q(dropHeight),
      frames: st.diveFrames
    };
  }

  function resolveDiveImpact(attacker, attSt, impactType, defender, defSt, blocked) {
    if (!attSt.diveActive) {
      return { resolved: false };
    }
    var prof = DIVE_PROFILES[attSt.diveProfile] || DIVE_PROFILES.standard;
    var speed = attSt.diveSpeed;
    var dropH = Math.max(0, (attacker.y || 0) - attSt.diveStartY);
    var massA = clamp(attacker.mass || 1, 0.5, 2.5);
    var energyNorm = clamp((speed * speed * 0.00000042 + dropH * 0.0014) * massA, 0.35, 2.2);

    attSt.diveActive = false;
    attSt.diveSpeed = 0;

    if (impactType === 'ground') {
      var slideVx = q(attSt.diveDirX * speed * detCos(prof.angleDeg * DEG_TO_RAD) * 0.44);
      var shockRadius = q(70 + 85 * energyNorm);
      var recoveryFrames = clamp(Math.round(8 + energyNorm * 5), 8, 18);
      attacker.vx = slideVx;
      attacker.vy = 0;
      return {
        resolved: true,
        impactType: 'ground',
        energyNorm: q(energyNorm),
        slideVx: slideVx,
        shockRadius: shockRadius,
        recoveryFrames: recoveryFrames
      };
    }

    // 命中目标：计算动量守恒与弹性反跳矢量
    var massD = defender ? clamp(defender.mass || 1, 0.5, 2.5) : 1.0;
    var massRatio = massA / (massA + massD);
    var bounceFactor = prof.bounceScale * (blocked ? 1.18 : 0.92);

    // 攻击者反跳：向上后方弹开，便于后续空中衔接或安全脱离
    var recoilVx = q(-attSt.diveDirX * (220 + 180 * bounceFactor));
    var recoilVy = q(-(420 + 260 * bounceFactor));
    attacker.vx = recoilVx;
    attacker.vy = recoilVy;

    var result = {
      resolved: true,
      impactType: blocked ? 'block' : 'hit',
      energyNorm: q(energyNorm),
      attackerRecoilVx: recoilVx,
      attackerRecoilVy: recoilVy,
      damageMul: q(0.95 + 0.35 * energyNorm),
      guardDamageMul: q(prof.guardBonus * (0.85 + 0.25 * energyNorm)),
      defenderKbVx: 0,
      defenderKbVy: 0
    };

    if (defender) {
      var transferVx = q(attSt.diveDirX * speed * massRatio * (blocked ? 0.45 : 0.78));
      var isSpike = !blocked && prof.angleDeg >= 60 && (defender.y || 0) < -24;
      var transferVy = blocked
        ? 0
        : (isSpike ? q(speed * 0.68 * massRatio) : q(-310 - 140 * energyNorm));

      if (!blocked && defSt && (defender.y || 0) < -4) {
        var liftRes = computeHitLiftImpulse(defender, defSt, {
          weightClass: isSpike ? 'spike' : 'heavy',
          kbX: abs(transferVx),
          kbY: transferVy,
          dirX: attSt.diveDirX
        });
        result.defenderKbVx = liftRes.appliedVx;
        result.defenderKbVy = liftRes.appliedVy;
        result.juggleResult = liftRes;
      } else {
        defender.vx = transferVx;
        defender.vy = transferVy;
        result.defenderKbVx = transferVx;
        result.defenderKbVy = transferVy;
      }
    }

    return result;
  }

  // ----------------------- 5. 空中蓄力悬停推力（空中蓄力） -----------------------
  function beginAirChargeHover(fighter, st) {
    if (!st.airborne || st.hoverActive || st.hoverFuel <= 0.15 || st.stabilizing) {
      return { started: false };
    }
    st.hoverActive = true;
    st.hoverFrames = 0;
    st.hoverCharge = 0;
    st.hoverTier = 1;
    st.diveActive = false;
    st.fastFalling = false;

    // 起手瞬间阻尼下坠速度，产生凌空凝滞的武侠张力
    if ((fighter.vy || 0) > 0) {
      fighter.vy = q(fighter.vy * 0.28);
    } else {
      fighter.vy = q((fighter.vy || 0) * 0.45);
    }
    fighter.vx = q((fighter.vx || 0) * 0.55);

    return {
      started: true,
      tier: st.hoverTier,
      fuel: st.hoverFuel
    };
  }

  function stepAirChargeHover(fighter, st, steerDirX, dt) {
    if (!st.hoverActive) return { active: false };
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;

    st.hoverFrames++;
    var chargeRate = 1 / Math.max(12, st.hoverMaxFrames * 0.78);
    st.hoverCharge = q(clamp(st.hoverCharge + chargeRate, 0, 1));
    st.hoverFuel = q(Math.max(0, st.hoverFuel - (1 / Math.max(18, st.hoverMaxFrames))));

    // 更新蓄力阶位
    var newTier = 1;
    for (var i = HOVER_TIERS.length - 1; i >= 0; i--) {
      if (st.hoverCharge >= HOVER_TIERS[i].minCharge) {
        newTier = HOVER_TIERS[i].tier;
        break;
      }
    }
    st.hoverTier = newTier;

    // 悬停平衡推力：将纵向速度稳定收敛到微幅缓降/悬停态
    var targetVy = 18 * (1 - st.hoverCharge * 0.75);
    var hoverThrust = (targetVy - (fighter.vy || 0)) * 7.5;
    fighter.vy = q((fighter.vy || 0) + hoverThrust * stepDt);

    // 悬停期间允许极微幅水平微调以对准目标
    if (steerDirX) {
      fighter.vx = q(clamp((fighter.vx || 0) + sign(steerDirX) * 320 * stepDt, -190, 190));
    } else {
      fighter.vx = q((fighter.vx || 0) * 0.90);
    }

    var autoRelease = st.hoverFuel <= 0 || st.hoverFrames >= st.hoverMaxFrames;
    return {
      active: true,
      charge: st.hoverCharge,
      tier: st.hoverTier,
      tierName: HOVER_TIERS[newTier - 1].name,
      fuel: st.hoverFuel,
      autoRelease: autoRelease
    };
  }

  function releaseAirChargeBurst(fighter, st, aimDirX, aimDirY) {
    if (!st.hoverActive) {
      return { released: false };
    }
    var tierIdx = clamp(st.hoverTier - 1, 0, HOVER_TIERS.length - 1);
    var tierDef = HOVER_TIERS[tierIdx];
    var charge = st.hoverCharge;

    st.hoverActive = false;
    st.postBurstFloatFrames = 10 + tierIdx * 3;

    // 归一化释放方向（默认朝向前方略微斜下）
    var dx = Number.isFinite(aimDirX) && aimDirX !== 0 ? aimDirX : (fighter.face || 1);
    var dy = Number.isFinite(aimDirY) ? aimDirY : 0.18;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) {
      dx = fighter.face || 1;
      dy = 0;
      len = 1;
    }
    dx /= len;
    dy /= len;

    var burstMag = lerp(tierDef.burstSpeed * 0.88, tierDef.burstSpeed * 1.12, charge);
    var burstVx = q(dx * burstMag);
    var burstVy = q(dy * burstMag);

    fighter.vx = burstVx;
    fighter.vy = burstVy;

    var recoilVx = q(-dx * tierDef.recoilSpeed);
    var recoilVy = q(-dy * tierDef.recoilSpeed - 120);

    st.hoverCharge = 0;
    st.hoverFrames = 0;

    return {
      released: true,
      tier: tierDef.tier,
      tierName: tierDef.name,
      charge: q(charge),
      burstVx: burstVx,
      burstVy: burstVy,
      recoilVx: recoilVx,
      recoilVy: recoilVy,
      damageMul: tierDef.dmgMul,
      knockbackMul: tierDef.kbMul,
      postBurstFloatFrames: st.postBurstFloatFrames
    };
  }

  // ----------------------- 6. 多段轻功跳跃动量守恒 -----------------------
  function executeMultiJump(fighter, st, inputDirX, jumpSpec) {
    if (st.stabilizing || st.jumpsUsed >= st.maxJumps) {
      return { jumped: false, reason: st.stabilizing ? 'stabilizing' : 'no_jumps_left' };
    }

    var spec = jumpSpec || {};
    var baseJumpVy = Number.isFinite(spec.jumpVy) ? spec.jumpVy : -820;
    var baseAirSpeed = Number.isFinite(spec.airSpeed) ? spec.airSpeed : 420;
    var jumpIndex = st.jumpsUsed;

    // 逐段轻功高度衰减：一段 100%，二段 86%，三段 74%
    var heightDecay = jumpIndex === 0 ? 1.0 : (jumpIndex === 1 ? 0.86 : Math.max(0.62, 0.86 - (jumpIndex - 1) * 0.12));
    var targetVy = baseJumpVy * heightDecay;

    var curVx = fighter.vx || 0;
    var curVy = fighter.vy || 0;
    var dir = inputDirX ? sign(inputDirX) : 0;

    // 水平动量守恒：同向起跳继承高比例惯性，反向折返则执行动能折损并急转
    var nextVx = curVx;
    if (dir !== 0) {
      var dot = sign(curVx) * dir;
      if (dot > 0) {
        // 同向轻功连跳：保留 88% 已有动量并叠加轻功助推，钳位在高速上限内
        var boosted = curVx * 0.88 + dir * baseAirSpeed * 0.36;
        var cap = Math.max(abs(curVx), baseAirSpeed * 1.28);
        nextVx = clamp(boosted, -cap, cap);
      } else if (dot < 0) {
        // 反向折返踏空：吸收部分逆向速度转化为反冲
        var redirectBonus = Math.min(140, abs(curVx) * 0.22);
        nextVx = dir * (baseAirSpeed * 0.92 + redirectBonus);
      } else {
        nextVx = dir * baseAirSpeed;
      }
      fighter.face = dir;
    } else {
      nextVx = curVx * 0.85;
    }

    // 纵向动量守恒：若仍在高速上升，保留 28% 剩余上升冲量；若正在下落，则清空下坠势能重新发力
    var nextVy = curVy < 0 ? Math.max(targetVy * 1.18, targetVy + curVy * 0.28) : targetVy;

    st.jumpsUsed++;
    st.airborne = true;
    st.fastFalling = false;
    st.hoverActive = false;
    st.diveActive = false;

    fighter.vx = q(nextVx);
    fighter.vy = q(nextVy);

    return {
      jumped: true,
      jumpNumber: st.jumpsUsed,
      jumpsRemaining: st.maxJumps - st.jumpsUsed,
      heightDecay: q(heightDecay),
      vx: fighter.vx,
      vy: fighter.vy
    };
  }

  // ----------------------- 7. 蹬壁反跳矢量与贴壁滑降 -----------------------
  function evaluateWallContact(fighter, st, stageW, wallMargin, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var leftWall = Number.isFinite(wallMargin) ? wallMargin : 56;
    var rightWall = (Number.isFinite(stageW) ? stageW : 1440) - leftWall;
    var prevSide = st.wallContactSide;

    if (st.wallJumpCD > 0) st.wallJumpCD--;
    if (st.wallImpactGraceFrames > 0) st.wallImpactGraceFrames--;

    if (!st.airborne) {
      st.wallContactSide = 0;
      return { touching: false, side: 0, wallBounce: false };
    }

    var side = 0;
    if (fighter.x <= leftWall + 4) side = -1;
    else if (fighter.x >= rightWall - 4) side = 1;

    st.wallContactSide = side;
    if (side === 0) {
      return { touching: false, side: 0, wallBounce: false };
    }

    var impactSpeed = abs(fighter.vx || 0);
    var movingIntoWall = sign(fighter.vx || 0) === side;

    // 受击高速撞墙 -> 触发战斗撞墙反弹（Wall-Bounce），而非主动蹬壁
    var inHitstun = fighter.state === 'hitstun' || fighter.state === 'launch';
    if (inHitstun && movingIntoWall && impactSpeed >= 420 && st.wallBounces < st.maxWallBounces) {
      st.wallBounces++;
      var reboundVx = q(-side * clamp(impactSpeed * 0.62, 260, 560));
      var reboundVy = q(Math.min(fighter.vy || 0, -440));
      fighter.vx = reboundVx;
      fighter.vy = reboundVy;
      fighter.x = q(side === -1 ? leftWall + 5 : rightWall - 5);
      return {
        touching: true,
        side: side,
        wallBounce: true,
        reboundVx: reboundVx,
        reboundVy: reboundVy,
        wallBouncesUsed: st.wallBounces
      };
    }

    // 首次接触墙壁时记录撞击速度并开启 8 帧弹性蹬壁宽限窗口
    if (prevSide !== side && movingIntoWall) {
      st.wallImpactGraceFrames = 8;
      st.wallImpactSpeed = q(impactSpeed);
    }

    // 主动贴壁滑降：限制最大下落速度
    var wallSlideCap = 240;
    if (!inHitstun && (fighter.vy || 0) > wallSlideCap) {
      var slideDrag = (fighter.vy - wallSlideCap) * 12 * stepDt;
      fighter.vy = q(Math.max(wallSlideCap, fighter.vy - slideDrag));
    }

    return {
      touching: true,
      side: side,
      wallBounce: false,
      sliding: !inHitstun && (fighter.vy || 0) > 0,
      graceWindow: st.wallImpactGraceFrames > 0
    };
  }

  function executeWallJump(fighter, st, jumpSpec) {
    if (!st.airborne || st.wallContactSide === 0 || st.wallJumpCD > 0 || st.stabilizing) {
      return { wallJumped: false };
    }

    var spec = jumpSpec || {};
    var side = st.wallContactSide;
    var kickDir = -side;
    var baseKickX = Number.isFinite(spec.kickVx) ? spec.kickVx : 520;
    var baseKickY = Number.isFinite(spec.kickVy) ? spec.kickVy : -790;

    // 连续蹬同一面墙衰减更快，交替蹬双壁衰减更轻
    if (st.lastWallSide === side) {
      st.wallJumpChain += 2;
    } else {
      st.wallJumpChain += 1;
    }
    st.lastWallSide = side;

    var chainDecay = clamp(1 - (st.wallJumpChain - 1) * 0.11, 0.56, 1.0);
    // 若在撞壁后 8 帧宽限窗口内蹬壁，按入墙速度给予弹性反冲加成
    var elasticBonus = st.wallImpactGraceFrames > 0
      ? clamp(st.wallImpactSpeed * 0.28, 0, 170)
      : 0;

    var kickVx = q(kickDir * (baseKickX * chainDecay + elasticBonus));
    var kickVy = q(baseKickY * chainDecay - elasticBonus * 0.35);

    fighter.face = kickDir;
    fighter.vx = kickVx;
    fighter.vy = kickVy;

    st.wallJumpCD = 12;
    st.wallImpactGraceFrames = 0;
    st.wallImpactSpeed = 0;
    st.fastFalling = false;
    st.diveActive = false;
    st.hoverActive = false;

    return {
      wallJumped: true,
      kickDir: kickDir,
      vx: kickVx,
      vy: kickVy,
      chainDecay: q(chainDecay),
      elasticBonus: q(elasticBonus),
      wallJumpChain: st.wallJumpChain
    };
  }

  // ----------------------- 8. 空中受身定向漂移（空中受身） -----------------------
  function canAirTech(fighter, st, stunRemaining) {
    if (!st.airborne || st.airTechActive) return false;
    if (st.stabilizing) return true;
    var inHitstun = fighter.state === 'hitstun' || fighter.state === 'launch';
    if (!inHitstun) return false;
    var stunLeft = Number.isFinite(stunRemaining) ? stunRemaining : (fighter.stun || 0);
    // 软上限以上提前放宽受身窗口
    var earlyWindow = (st.jugglePoints / Math.max(1, st.juggleLimit)) >= 0.72 ? 0.08 : 0.02;
    return stunLeft <= earlyWindow;
  }

  function executeAirTech(fighter, st, dirKey, driftInputX) {
    var key = AIR_TECH_DIRS[dirKey] ? dirKey : 'neutral';
    var prof = AIR_TECH_DIRS[key];
    var face = fighter.face || 1;

    // forward/back 相对侠客朝向映射，确保左右方位一致
    var worldVx = prof.vx;
    if (key === 'forward' || key === 'back') {
      worldVx = prof.vx * face;
    }

    st.airTechActive = true;
    st.airTechDir = key;
    st.airTechFrames = prof.durationFrames;
    st.airTechInvulFrames = prof.invulFrames;
    st.airTechDriftInputX = driftInputX ? sign(driftInputX) : 0;
    st.stabilizing = false;
    st.stabilizeFrames = 0;
    st.juggleCount = 0;
    st.jugglePoints = 0;
    st.juggleGravityBonus = 0;
    st.liftDecayFactor = 1.0;

    fighter.vx = q(worldVx);
    fighter.vy = q(prof.vy);

    return {
      teched: true,
      direction: key,
      vx: fighter.vx,
      vy: fighter.vy,
      invulFrames: prof.invulFrames,
      durationFrames: prof.durationFrames
    };
  }

  function stepAirTechDrift(fighter, st, driftInputX, dt) {
    if (!st.airTechActive) return { active: false };
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var prof = AIR_TECH_DIRS[st.airTechDir] || AIR_TECH_DIRS.neutral;

    st.airTechFrames--;
    if (st.airTechInvulFrames > 0) st.airTechInvulFrames--;

    var steer = driftInputX ? sign(driftInputX) : st.airTechDriftInputX;
    if (steer !== 0) {
      fighter.vx = q(clamp((fighter.vx || 0) + steer * prof.driftAx * stepDt, -540, 540));
    }

    var completed = st.airTechFrames <= 0;
    if (completed) {
      st.airTechActive = false;
      st.airTechDir = 'neutral';
      st.airTechDriftInputX = 0;
    }

    return {
      active: !completed,
      completed: completed,
      invulFrames: st.airTechInvulFrames,
      remainingFrames: st.airTechFrames
    };
  }

  // ----------------------- 9. 统一每帧空中物理步进管线 -----------------------
  function stepAerialPhysics(fighter, st, input, worldCfg, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var inp = input || {};
    var cfg = worldCfg || {};
    var stageW = Number.isFinite(cfg.stageW) ? cfg.stageW : 1440;
    var wallMargin = Number.isFinite(cfg.wall) ? cfg.wall : 56;
    var groundY = Number.isFinite(cfg.groundY) ? cfg.groundY : 0;

    var grounded = (fighter.y || 0) >= groundY - 0.5 && (fighter.vy || 0) >= 0 && !inp.forceAirborne;
    if (grounded) {
      if (st.airborne) {
        var diveLand = st.diveActive ? resolveDiveImpact(fighter, st, 'ground', null, null, false) : null;
        resetOnLanding(st);
        return { airborne: false, landed: true, diveLanding: diveLand };
      }
      return { airborne: false, landed: false };
    }

    st.airborne = true;
    st.airFrames++;

    if (st.postBurstFloatFrames > 0) st.postBurstFloatFrames--;
    if (st.stabilizeFrames > 0) {
      st.stabilizeFrames--;
      if (st.stabilizeFrames === 0) st.stabilizing = false;
    }
    if (!st.airTechActive && st.airTechInvulFrames > 0) {
      st.airTechInvulFrames--;
    }

    // 急坠判定：仅在非蓄力、非俯冲、下落阶段允许开启
    if (inp.fastFall && !st.hoverActive && !st.diveActive && (fighter.vy || 0) > 40) {
      st.fastFalling = true;
    } else if (!inp.fastFall) {
      st.fastFalling = false;
    }

    // 处理空中受身缓冲与执行
    var techRes = { active: false };
    if (inp.techPressed) st.airTechBufferFrames = 6;
    else if (st.airTechBufferFrames > 0) st.airTechBufferFrames--;

    if (st.airTechBufferFrames > 0 && canAirTech(fighter, st, inp.stunRemaining)) {
      st.airTechBufferFrames = 0;
      techRes = executeAirTech(fighter, st, inp.techDir || 'neutral', inp.dirX || 0);
    } else if (st.airTechActive) {
      techRes = stepAirTechDrift(fighter, st, inp.dirX || 0, stepDt);
    }

    // 悬停蓄力与俯冲步进
    var hoverRes = { active: false };
    var diveRes = { active: false };
    if (st.hoverActive) {
      hoverRes = stepAirChargeHover(fighter, st, inp.dirX || 0, stepDt);
    } else if (st.diveActive) {
      diveRes = stepDiveKick(fighter, st, stepDt);
    }

    // 计算连段动态重力并积分速度
    var gravRes = computeComboGravity(fighter, st);
    if (!st.diveActive) {
      fighter.vy = q((fighter.vy || 0) + gravRes.gravity * stepDt);
    }

    // 空中轻度可控水平漂移（非受击、非俯冲、非悬停时）
    var inHitstun = fighter.state === 'hitstun' || fighter.state === 'launch';
    if (!inHitstun && !st.diveActive && !st.hoverActive && !st.airTechActive && inp.dirX) {
      var airAccel = Number.isFinite(cfg.airControlAccel) ? cfg.airControlAccel : 1180;
      var maxAirVx = Number.isFinite(cfg.maxAirVx) ? cfg.maxAirVx : 470;
      var nextVx = (fighter.vx || 0) + sign(inp.dirX) * airAccel * stepDt;
      if (abs(nextVx) <= maxAirVx || abs(nextVx) < abs(fighter.vx || 0)) {
        fighter.vx = q(nextVx);
      }
    }

    // 终端速度与气动阻力
    var dragRes = applyTerminalVelocityAndDrag(fighter, st, stepDt);

    // 位置积分
    fighter.x = q((fighter.x || 0) + fighter.vx * stepDt);
    fighter.y = q((fighter.y || 0) + fighter.vy * stepDt);

    // 墙体接触、贴壁滑降与撞墙反弹
    var wallRes = evaluateWallContact(fighter, st, stageW, wallMargin, stepDt);

    // 地面碰撞与受击弹地判定
    var groundBounce = false;
    if (fighter.y >= groundY) {
      var impactVy = fighter.vy;
      if (inHitstun && impactVy >= 560 && st.groundBounces < st.maxGroundBounces) {
        st.groundBounces++;
        fighter.y = q(groundY - 2);
        fighter.vy = q(-impactVy * 0.56);
        fighter.vx = q(fighter.vx * 0.82);
        groundBounce = true;
      } else {
        fighter.y = q(groundY);
        var diveLandFinal = st.diveActive ? resolveDiveImpact(fighter, st, 'ground', null, null, false) : null;
        fighter.vy = 0;
        resetOnLanding(st);
        return {
          airborne: false,
          landed: true,
          impactVy: q(impactVy),
          diveLanding: diveLandFinal,
          wall: wallRes
        };
      }
    }

    return {
      airborne: true,
      landed: false,
      groundBounce: groundBounce,
      gravity: gravRes,
      drag: dragRes,
      hover: hoverRes,
      dive: diveRes,
      wall: wallRes,
      tech: techRes
    };
  }

  // ----------------------- 导出 RYPhysics.Aerial -----------------------
  root.Aerial = {
    VERSION: '1.0.0',
    FIXED_DT: FIXED_DT,
    GRAVITY_PROFILES: GRAVITY_PROFILES,
    MOVE_WEIGHT_CLASSES: MOVE_WEIGHT_CLASSES,
    DIVE_PROFILES: DIVE_PROFILES,
    HOVER_TIERS: HOVER_TIERS,
    AIR_TECH_DIRS: AIR_TECH_DIRS,
    createAerialState: createAerialState,
    cloneState: cloneState,
    serializeState: serializeState,
    deserializeState: deserializeState,
    computeChecksum: computeChecksum,
    resetOnLanding: resetOnLanding,
    computeComboGravity: computeComboGravity,
    computeHitLiftImpulse: computeHitLiftImpulse,
    triggerAirBrake: triggerAirBrake,
    applyTerminalVelocityAndDrag: applyTerminalVelocityAndDrag,
    initiateDiveKick: initiateDiveKick,
    stepDiveKick: stepDiveKick,
    resolveDiveImpact: resolveDiveImpact,
    beginAirChargeHover: beginAirChargeHover,
    stepAirChargeHover: stepAirChargeHover,
    releaseAirChargeBurst: releaseAirChargeBurst,
    executeMultiJump: executeMultiJump,
    evaluateWallContact: evaluateWallContact,
    executeWallJump: executeWallJump,
    canAirTech: canAirTech,
    executeAirTech: executeAirTech,
    stepAirTechDrift: stepAirTechDrift,
    stepAerialPhysics: stepAerialPhysics
  };
})(RYPhysics);
