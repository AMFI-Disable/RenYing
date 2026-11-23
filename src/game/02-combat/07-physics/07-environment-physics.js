// ======================= 环境物理与地表交互模型 =======================
// 本模块实现《刃影》完全可回滚确定性的环境物理子系统（RYPhysics.Environment）：
//   1. 地表摩擦与抓地力剖面（青石 stone、翠竹 bamboo、玄冰 ice、泥沼 mud、古木 timber、浅水 water）
//   2. 空气动力学风阻与侧风升力（阵风包络、风柱上升气流、姿态迎风面积、失速钳位）
//   3. 悬崖边缘倾覆力矩与崖边抓沿自救冲量（重心悬空力矩、抓沿判定、三向自救轨迹）
//   4. 单向平台落地减震与主动下穿运动学（连续扫掠防穿模、弹性挠度、下穿清障窗口）
//   5. 天雷导电性与静电蓄能爆发（地表电导、潮湿耦合、静态电荷积蓄与弧光冲刺加成）
//   6. 酒雾/迷雾粘滞阻尼（斯托克斯+二次流体阻力、挥斩破雾尾流、醉意微扰）
// 所有计算均不依赖 Math.random / Date.now，严格遵守固定时间步与量化截断，确保联机回滚零分歧。

var RYPhysics = (typeof window !== 'undefined' ? (window.RYPhysics = window.RYPhysics || {}) : {});

(function (root) {
  'use strict';

  // ----------------------- 确定性数学与量化工具 -----------------------
  var FIXED_DT = 1 / 60;
  var QUANT_SCALE = 10000;
  var INV_QUANT = 0.0001;
  var PI = 3.141592653589793;
  var TWO_PI = 6.283185307179586;
  var HALF_PI = 1.5707963267948966;
  var DEFAULT_GRAVITY = 2150;
  var DEFAULT_STAGE_W = 1440;
  var DEFAULT_WALL = 56;
  var AIR_DENSITY = 1.225;

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

  function smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) return x < edge0 ? 0 : 1;
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // 确定性三角函数近似（跨 JS 引擎零浮点尾差，精度 < 1e-4）
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

  // 确定性哈希（用于阵风微扰与雷电火花分布，不消耗外部 GRNG）
  function detHash01(seed, salt) {
    var h = (seed | 0) ^ Math.imul((salt | 0) + 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h & 0xffff) / 65536;
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

  // ----------------------- 1. 地表摩擦与抓地力剖面 -----------------------
  var SURFACES = Object.freeze({
    stone: Object.freeze({
      id: 'stone',
      label: '青石',
      muStatic: 0.92,
      muKinetic: 0.78,
      stribeckSpeed: 110,
      rollingResist: 0.04,
      accelGrip: 1.0,
      brakeGrip: 1.05,
      dashGrip: 1.0,
      knockbackSlide: 1.0,
      massGripSensitivity: 0.08,
      sinkDepthMax: 0,
      sinkRate: 0,
      sinkRecovery: 10,
      hydroDrag: 0,
      restitution: 0.14,
      flexStiffness: 0,
      flexDamping: 0,
      conductivity: 0.22,
      wetnessRate: 0,
      stepImpulse: 1.0
    }),
    bamboo: Object.freeze({
      id: 'bamboo',
      label: '翠竹',
      muStatic: 0.76,
      muKinetic: 0.62,
      stribeckSpeed: 95,
      rollingResist: 0.03,
      accelGrip: 0.94,
      brakeGrip: 0.88,
      dashGrip: 1.08,
      knockbackSlide: 1.12,
      massGripSensitivity: 0.14,
      sinkDepthMax: 0,
      sinkRate: 0,
      sinkRecovery: 12,
      hydroDrag: 0,
      restitution: 0.34,
      flexStiffness: 185,
      flexDamping: 14,
      conductivity: 0.08,
      wetnessRate: 0,
      stepImpulse: 1.12
    }),
    ice: Object.freeze({
      id: 'ice',
      label: '玄冰',
      muStatic: 0.19,
      muKinetic: 0.11,
      stribeckSpeed: 55,
      rollingResist: 0.008,
      accelGrip: 0.34,
      brakeGrip: 0.22,
      dashGrip: 0.48,
      knockbackSlide: 1.78,
      massGripSensitivity: 0.42,
      sinkDepthMax: 0,
      sinkRate: 0,
      sinkRecovery: 10,
      hydroDrag: 0,
      restitution: 0.18,
      flexStiffness: 0,
      flexDamping: 0,
      conductivity: 0.32,
      wetnessRate: 0.08,
      stepImpulse: 0.86
    }),
    mud: Object.freeze({
      id: 'mud',
      label: '泥沼',
      muStatic: 1.08,
      muKinetic: 0.96,
      stribeckSpeed: 65,
      rollingResist: 0.28,
      accelGrip: 0.64,
      brakeGrip: 1.24,
      dashGrip: 0.62,
      knockbackSlide: 0.56,
      massGripSensitivity: 0.52,
      sinkDepthMax: 22,
      sinkRate: 14,
      sinkRecovery: 28,
      hydroDrag: 0.0018,
      restitution: 0.04,
      flexStiffness: 0,
      flexDamping: 0,
      conductivity: 0.72,
      wetnessRate: 0.35,
      stepImpulse: 0.72
    }),
    timber: Object.freeze({
      id: 'timber',
      label: '古木',
      muStatic: 0.84,
      muKinetic: 0.70,
      stribeckSpeed: 100,
      rollingResist: 0.05,
      accelGrip: 0.96,
      brakeGrip: 0.95,
      dashGrip: 0.98,
      knockbackSlide: 1.04,
      massGripSensitivity: 0.12,
      sinkDepthMax: 0,
      sinkRate: 0,
      sinkRecovery: 10,
      hydroDrag: 0,
      restitution: 0.22,
      flexStiffness: 260,
      flexDamping: 20,
      conductivity: 0.06,
      wetnessRate: 0,
      stepImpulse: 1.03
    }),
    water: Object.freeze({
      id: 'water',
      label: '浅水',
      muStatic: 0.62,
      muKinetic: 0.48,
      stribeckSpeed: 85,
      rollingResist: 0.12,
      accelGrip: 0.82,
      brakeGrip: 0.84,
      dashGrip: 0.90,
      knockbackSlide: 0.88,
      massGripSensitivity: 0.22,
      sinkDepthMax: 12,
      sinkRate: 24,
      sinkRecovery: 40,
      hydroDrag: 0.0024,
      restitution: 0.10,
      flexStiffness: 0,
      flexDamping: 0,
      conductivity: 0.98,
      wetnessRate: 0.85,
      stepImpulse: 0.91
    })
  });

  // 姿态空气动力学截面参数（CdA 阻力面积，ClMax 最大侧风升力系数）
  var STANCE_AERO = Object.freeze({
    idle: Object.freeze({ cda: 0.46, clMax: 0.16, cloakArea: 0.18 }),
    walk: Object.freeze({ cda: 0.48, clMax: 0.18, cloakArea: 0.22 }),
    crouch: Object.freeze({ cda: 0.28, clMax: 0.08, cloakArea: 0.12 }),
    guard: Object.freeze({ cda: 0.36, clMax: 0.10, cloakArea: 0.14 }),
    dash: Object.freeze({ cda: 0.30, clMax: 0.22, cloakArea: 0.32 }),
    air: Object.freeze({ cda: 0.56, clMax: 0.42, cloakArea: 0.38 }),
    attack: Object.freeze({ cda: 0.52, clMax: 0.24, cloakArea: 0.26 }),
    hitstun: Object.freeze({ cda: 0.68, clMax: 0.34, cloakArea: 0.28 }),
    knockdown: Object.freeze({ cda: 0.22, clMax: 0.05, cloakArea: 0.10 })
  });

  // 崖边自救选项运动学配置
  var LEDGE_RECOVERY_PROFILES = Object.freeze({
    climb: Object.freeze({
      vx: 210,
      vy: -360,
      invulFrames: 10,
      recoveryFrames: 16,
      staminaCost: 12
    }),
    vault: Object.freeze({
      vx: 360,
      vy: -780,
      invulFrames: 8,
      recoveryFrames: 14,
      staminaCost: 18
    }),
    roll: Object.freeze({
      vx: 510,
      vy: -140,
      invulFrames: 16,
      recoveryFrames: 22,
      staminaCost: 22
    })
  });

  // ----------------------- 环境状态创建与回滚序列化 -----------------------
  function createEnvironmentState(config) {
    var cfg = config || {};
    var stageW = Number.isFinite(cfg.stageW) ? cfg.stageW : DEFAULT_STAGE_W;
    var wall = Number.isFinite(cfg.wall) ? cfg.wall : DEFAULT_WALL;
    var gravity = Number.isFinite(cfg.gravity) ? cfg.gravity : DEFAULT_GRAVITY;

    var zones = Array.isArray(cfg.surfaceZones) ? cfg.surfaceZones.map(function (z) {
      return {
        x1: q(z.x1 || 0),
        x2: q(z.x2 || stageW),
        surface: SURFACES[z.surface] ? z.surface : 'stone',
        blendWidth: q(Number.isFinite(z.blendWidth) ? z.blendWidth : 28)
      };
    }) : [{ x1: 0, x2: stageW, surface: cfg.defaultSurface && SURFACES[cfg.defaultSurface] ? cfg.defaultSurface : 'stone', blendWidth: 0 }];

    var platforms = Array.isArray(cfg.platforms) ? cfg.platforms.map(function (p, i) {
      var surf = SURFACES[p.surface] ? p.surface : 'timber';
      return {
        id: Number.isFinite(p.id) ? p.id : i,
        x1: q(p.x1 || 0),
        x2: q(p.x2 || 0),
        y: q(p.y || -180),
        thickness: q(Number.isFinite(p.thickness) ? p.thickness : 14),
        surface: surf,
        oneWay: p.oneWay !== false,
        flexStiffness: q(Number.isFinite(p.flexStiffness) ? p.flexStiffness : SURFACES[surf].flexStiffness),
        flexDamping: q(Number.isFinite(p.flexDamping) ? p.flexDamping : SURFACES[surf].flexDamping),
        maxDeflection: q(Number.isFinite(p.maxDeflection) ? p.maxDeflection : (surf === 'bamboo' ? 24 : 12)),
        deflection: 0,
        deflectionVel: 0,
        shockTimer: 0
      };
    }) : [];

    var cliffs = Array.isArray(cfg.cliffs) ? cfg.cliffs.map(function (c) {
      return {
        side: c.side === 'left' ? 'left' : 'right',
        edgeX: q(c.edgeX || (c.side === 'left' ? wall + 120 : stageW - wall - 120)),
        lipY: q(Number.isFinite(c.lipY) ? c.lipY : 0),
        dropDepth: q(Number.isFinite(c.dropDepth) ? c.dropDepth : 360),
        grabRadiusX: q(Number.isFinite(c.grabRadiusX) ? c.grabRadiusX : 46),
        grabRadiusY: q(Number.isFinite(c.grabRadiusY) ? c.grabRadiusY : 58),
        tipMargin: q(Number.isFinite(c.tipMargin) ? c.tipMargin : 24)
      };
    }) : [];

    var windCfg = cfg.wind || {};
    var updrafts = Array.isArray(windCfg.updrafts) ? windCfg.updrafts.map(function (u) {
      return {
        x: q(u.x || stageW * 0.5),
        halfW: q(Number.isFinite(u.halfW) ? u.halfW : 70),
        yTop: q(Number.isFinite(u.yTop) ? u.yTop : -520),
        yBottom: q(Number.isFinite(u.yBottom) ? u.yBottom : 0),
        vy: q(Number.isFinite(u.vy) ? u.vy : -520),
        swirl: q(Number.isFinite(u.swirl) ? u.swirl : 45),
        active: u.active !== false
      };
    }) : [];

    var stormCfg = cfg.storm || {};
    var mistCfg = Array.isArray(cfg.mistZones) ? cfg.mistZones : [];
    var mistZones = mistCfg.map(function (m, idx) {
      var cells = Math.max(4, Math.min(32, (m.cells | 0) || 12));
      var wake = new Array(cells);
      for (var c = 0; c < cells; c++) wake[c] = 1;
      return {
        id: idx,
        x1: q(m.x1 || 0),
        x2: q(m.x2 || stageW),
        yTop: q(Number.isFinite(m.yTop) ? m.yTop : -260),
        yBottom: q(Number.isFinite(m.yBottom) ? m.yBottom : 0),
        baseDensity: q(clamp(Number.isFinite(m.density) ? m.density : 0.65, 0, 1)),
        viscosityLinear: q(Number.isFinite(m.viscosityLinear) ? m.viscosityLinear : 2.6),
        viscosityQuad: q(Number.isFinite(m.viscosityQuad) ? m.viscosityQuad : 0.0022),
        aromaPotency: q(Number.isFinite(m.aromaPotency) ? m.aromaPotency : 0.45),
        regenRate: q(Number.isFinite(m.regenRate) ? m.regenRate : 0.32),
        cellCount: cells,
        wakeCells: wake
      };
    });

    return {
      frame: 0,
      seed: (cfg.seed | 0) || 1337,
      stageW: q(stageW),
      wall: q(wall),
      gravity: q(gravity),
      defaultSurface: cfg.defaultSurface && SURFACES[cfg.defaultSurface] ? cfg.defaultSurface : 'stone',
      surfaceZones: zones,
      platforms: platforms,
      cliffs: cliffs,
      wind: {
        enabled: !!windCfg.enabled,
        baseVx: q(windCfg.baseVx || 0),
        baseVy: q(windCfg.baseVy || 0),
        gustAmp: q(windCfg.gustAmp || 0),
        gustFreq: q(Number.isFinite(windCfg.gustFreq) ? windCfg.gustFreq : 0.35),
        gustPhase: q(windCfg.gustPhase || 0),
        curVx: q(windCfg.baseVx || 0),
        curVy: q(windCfg.baseVy || 0),
        turbulence: q(clamp(windCfg.turbulence || 0, 0, 1)),
        updrafts: updrafts
      },
      storm: {
        enabled: !!stormCfg.enabled,
        ambientChargeRate: q(Number.isFinite(stormCfg.ambientChargeRate) ? stormCfg.ambientChargeRate : 6.5),
        rainRate: q(clamp(stormCfg.rainRate || 0, 0, 1)),
        strikeInterval: Math.max(60, (stormCfg.strikeInterval | 0) || 420),
        strikeTimer: Math.max(30, (stormCfg.strikeTimer | 0) || 240),
        telegraphFrames: Math.max(15, (stormCfg.telegraphFrames | 0) || 42),
        strikes: []
      },
      mistZones: mistZones
    };
  }

  function createFighterEnvState() {
    return {
      surfaceId: 'stone',
      effectiveGrip: 1,
      sinkDepth: 0,
      wetness: 0,
      staticCharge: 0,
      staticOverloadT: 0,
      staticBoostT: 0,
      mistExposure: 0,
      swayPhase: 0,
      tipBalance: 0,
      tipAngle: 0,
      onCliffEdge: false,
      cliffSide: '',
      ledgeGrabbed: false,
      ledgeSide: '',
      ledgeX: 0,
      ledgeY: 0,
      ledgeHangFrames: 0,
      ledgeCD: 0,
      platIndex: -1,
      dropFrames: 0,
      dropIgnorePlat: -1,
      landingShockFrames: 0,
      landingSquash: 0,
      windForceX: 0,
      windForceY: 0,
      mistDragX: 0,
      mistDragY: 0
    };
  }

  function cloneEnvironmentState(env) {
    return {
      frame: env.frame,
      seed: env.seed,
      stageW: env.stageW,
      wall: env.wall,
      gravity: env.gravity,
      defaultSurface: env.defaultSurface,
      surfaceZones: env.surfaceZones.map(function (z) {
        return { x1: z.x1, x2: z.x2, surface: z.surface, blendWidth: z.blendWidth };
      }),
      platforms: env.platforms.map(function (p) {
        return {
          id: p.id, x1: p.x1, x2: p.x2, y: p.y, thickness: p.thickness,
          surface: p.surface, oneWay: p.oneWay,
          flexStiffness: p.flexStiffness, flexDamping: p.flexDamping,
          maxDeflection: p.maxDeflection, deflection: p.deflection,
          deflectionVel: p.deflectionVel, shockTimer: p.shockTimer
        };
      }),
      cliffs: env.cliffs.map(function (c) {
        return {
          side: c.side, edgeX: c.edgeX, lipY: c.lipY, dropDepth: c.dropDepth,
          grabRadiusX: c.grabRadiusX, grabRadiusY: c.grabRadiusY, tipMargin: c.tipMargin
        };
      }),
      wind: {
        enabled: env.wind.enabled,
        baseVx: env.wind.baseVx,
        baseVy: env.wind.baseVy,
        gustAmp: env.wind.gustAmp,
        gustFreq: env.wind.gustFreq,
        gustPhase: env.wind.gustPhase,
        curVx: env.wind.curVx,
        curVy: env.wind.curVy,
        turbulence: env.wind.turbulence,
        updrafts: env.wind.updrafts.map(function (u) {
          return {
            x: u.x, halfW: u.halfW, yTop: u.yTop, yBottom: u.yBottom,
            vy: u.vy, swirl: u.swirl, active: u.active
          };
        })
      },
      storm: {
        enabled: env.storm.enabled,
        ambientChargeRate: env.storm.ambientChargeRate,
        rainRate: env.storm.rainRate,
        strikeInterval: env.storm.strikeInterval,
        strikeTimer: env.storm.strikeTimer,
        telegraphFrames: env.storm.telegraphFrames,
        strikes: env.storm.strikes.map(function (s) {
          return { x: s.x, radius: s.radius, phase: s.phase, framesLeft: s.framesLeft, intensity: s.intensity };
        })
      },
      mistZones: env.mistZones.map(function (m) {
        return {
          id: m.id, x1: m.x1, x2: m.x2, yTop: m.yTop, yBottom: m.yBottom,
          baseDensity: m.baseDensity, viscosityLinear: m.viscosityLinear,
          viscosityQuad: m.viscosityQuad, aromaPotency: m.aromaPotency,
          regenRate: m.regenRate, cellCount: m.cellCount,
          wakeCells: m.wakeCells.slice()
        };
      })
    };
  }

  function cloneFighterEnvState(st) {
    return Object.assign({}, st);
  }

  function serializeState(env, fighterStates) {
    return JSON.stringify({
      env: cloneEnvironmentState(env),
      fighters: Array.isArray(fighterStates) ? fighterStates.map(cloneFighterEnvState) : []
    });
  }

  function deserializeState(json) {
    var parsed = typeof json === 'string' ? JSON.parse(json) : json;
    return {
      env: cloneEnvironmentState(parsed.env),
      fighters: Array.isArray(parsed.fighters) ? parsed.fighters.map(cloneFighterEnvState) : []
    };
  }

  function computeChecksum(env, fighterStates) {
    var h = 2166136261 >>> 0;
    h = fnv1aStep(h, env.frame);
    h = fnv1aStep(h, env.wind.curVx);
    h = fnv1aStep(h, env.wind.curVy);
    h = fnv1aStep(h, env.wind.gustPhase);
    h = fnv1aStep(h, env.storm.strikeTimer);
    for (var i = 0; i < env.platforms.length; i++) {
      h = fnv1aStep(h, env.platforms[i].deflection);
      h = fnv1aStep(h, env.platforms[i].deflectionVel);
    }
    for (var s = 0; s < env.storm.strikes.length; s++) {
      h = fnv1aStep(h, env.storm.strikes[s].x);
      h = fnv1aStep(h, env.storm.strikes[s].framesLeft);
    }
    for (var m = 0; m < env.mistZones.length; m++) {
      var cells = env.mistZones[m].wakeCells;
      for (var c = 0; c < cells.length; c++) h = fnv1aStep(h, cells[c]);
    }
    if (Array.isArray(fighterStates)) {
      for (var f = 0; f < fighterStates.length; f++) {
        var fs = fighterStates[f];
        h = fnv1aStep(h, fs.effectiveGrip);
        h = fnv1aStep(h, fs.sinkDepth);
        h = fnv1aStep(h, fs.wetness);
        h = fnv1aStep(h, fs.staticCharge);
        h = fnv1aStep(h, fs.mistExposure);
        h = fnv1aStep(h, fs.tipBalance);
        h = fnv1aStep(h, fs.ledgeHangFrames);
        h = fnv1aStep(h, fs.platIndex);
      }
    }
    return h >>> 0;
  }

  // ----------------------- 地表解析与库仑-斯特里贝克摩擦求解 -----------------------
  function resolveSurfaceAt(env, x, y, platIndex) {
    if (platIndex >= 0 && platIndex < env.platforms.length) {
      var plat = env.platforms[platIndex];
      return SURFACES[plat.surface] || SURFACES.timber;
    }
    if (y < -2) {
      return SURFACES[env.defaultSurface] || SURFACES.stone;
    }
    var zones = env.surfaceZones;
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (x >= z.x1 && x <= z.x2) {
        return SURFACES[z.surface] || SURFACES.stone;
      }
    }
    return SURFACES[env.defaultSurface] || SURFACES.stone;
  }

  function computeEffectiveGrip(surface, mass, terrainAffinity) {
    var m = clamp(Number.isFinite(mass) ? mass : 1.0, 0.5, 2.5);
    var affinity = clamp(Number.isFinite(terrainAffinity) ? terrainAffinity : 0, 0, 1);
    // 重型侠客在冰面/泥沼上受重力惯性影响更大；具备地利天赋的侠客拥有抓地保底
    var massPenalty = (m - 1.0) * surface.massGripSensitivity;
    var rawGrip = surface.accelGrip * (1 - massPenalty);
    var floorGrip = lerp(0.18, 0.72, affinity);
    return q(clamp(rawGrip, floorGrip, 1.35));
  }

  function applySurfaceTraction(fighter, fEnv, env, inputDirX, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var grounded = (fighter.y >= -0.5 || fEnv.platIndex >= 0) && fighter.vy >= -1;
    var surface = resolveSurfaceAt(env, fighter.x, fighter.y, fEnv.platIndex);
    fEnv.surfaceId = surface.id;

    var mass = Number.isFinite(fighter.mass) ? fighter.mass : 1.0;
    var affinity = Number.isFinite(fighter.terrainAffinity) ? fighter.terrainAffinity : 0;
    var grip = computeEffectiveGrip(surface, mass, affinity);
    fEnv.effectiveGrip = grip;

    // 泥沼/浅水下陷深度更新
    if (grounded && surface.sinkDepthMax > 0) {
      var sinkDelta = surface.sinkRate * mass * stepDt;
      if (abs(inputDirX) > 0.1) sinkDelta *= 0.65;
      fEnv.sinkDepth = q(clamp(fEnv.sinkDepth + sinkDelta, 0, surface.sinkDepthMax));
    } else {
      fEnv.sinkDepth = q(Math.max(0, fEnv.sinkDepth - surface.sinkRecovery * stepDt));
    }

    // 潮湿度累积与风干
    if (grounded && surface.wetnessRate > 0) {
      fEnv.wetness = q(clamp(fEnv.wetness + surface.wetnessRate * stepDt, 0, 1));
    } else if (env.storm.enabled && env.storm.rainRate > 0) {
      fEnv.wetness = q(clamp(fEnv.wetness + env.storm.rainRate * 0.25 * stepDt, 0, 1));
    } else {
      var dryRate = 0.08 + abs(env.wind.curVx) * 0.00025;
      fEnv.wetness = q(Math.max(0, fEnv.wetness - dryRate * stepDt));
    }

    if (!grounded) {
      return {
        grounded: false,
        surface: surface.id,
        frictionAccel: 0,
        hydroDragAccel: 0,
        maxSpeedScale: 1
      };
    }

    var vx = fighter.vx || 0;
    var speed = abs(vx);
    var sinkRatio = surface.sinkDepthMax > 0 ? (fEnv.sinkDepth / surface.sinkDepthMax) : 0;

    // 斯特里贝克摩擦曲线：静止到滑动的平滑过渡
    var vStribeck = Math.max(10, surface.stribeckSpeed);
    var ratio = speed / vStribeck;
    var stribeckDecay = 1 / (1 + ratio * ratio);
    var mu = surface.muKinetic + (surface.muStatic - surface.muKinetic) * stribeckDecay;

    var state = fighter.state || 'idle';
    var stateMul = 1.0;
    if (state === 'hitstun' || state === 'knockdown') {
      stateMul = 1 / Math.max(0.25, surface.knockbackSlide);
    } else if (state === 'dash') {
      stateMul = surface.dashGrip;
    }

    // 法向加速度下的库仑摩擦力
    var frictionDecel = mu * env.gravity * 0.62 * stateMul * (1 + sinkRatio * 0.45);
    var hydroDrag = surface.hydroDrag * speed * speed / Math.max(0.5, mass);
    var totalDecel = frictionDecel + hydroDrag + surface.rollingResist * env.gravity * 0.15;

    var braking = (inputDirX === 0) || (sign(inputDirX) !== sign(vx) && speed > 5);
    if (braking) {
      var brakeDecel = totalDecel * surface.brakeGrip;
      var dv = brakeDecel * stepDt;
      if (dv >= speed) {
        fighter.vx = 0;
      } else {
        fighter.vx = q(vx - sign(vx) * dv);
      }
    } else if (surface.hydroDrag > 0 && speed > 0) {
      var dragDv = hydroDrag * stepDt;
      fighter.vx = q(vx - sign(vx) * Math.min(speed, dragDv));
    }

    // 涉水与陷泥导致的最大移动速度折减
    var maxSpeedScale = q(clamp(1 - sinkRatio * 0.34 - (surface.id === 'water' ? 0.08 : 0), 0.52, 1.08));

    return {
      grounded: true,
      surface: surface.id,
      frictionAccel: q(frictionDecel),
      hydroDragAccel: q(hydroDrag),
      maxSpeedScale: maxSpeedScale
    };
  }

  // ----------------------- 2. 空气动力学风阻与侧风升力 -----------------------
  function stepWindField(env, dt) {
    var w = env.wind;
    if (!w.enabled) {
      w.curVx = 0;
      w.curVy = 0;
      return;
    }
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    w.gustPhase = q((w.gustPhase + TWO_PI * w.gustFreq * stepDt) % TWO_PI);

    // 双谐波确定性阵风包络，叠加微幅高频湍流
    var primary = detSin(w.gustPhase);
    var secondary = detSin(w.gustPhase * 2.37 + 1.1) * 0.35;
    var turb = w.turbulence > 0
      ? (detHash01(env.seed, env.frame * 7 + 13) * 2 - 1) * w.turbulence * w.gustAmp * 0.25
      : 0;

    w.curVx = q(w.baseVx + w.gustAmp * (primary + secondary) + turb);
    w.curVy = q(w.baseVy + w.gustAmp * 0.18 * detCos(w.gustPhase * 1.5));
  }

  function sampleWindAt(env, x, y) {
    var w = env.wind;
    if (!w.enabled) return { vx: 0, vy: 0, inUpdraft: false };
    var vx = w.curVx;
    var vy = w.curVy;
    var inUpdraft = false;

    for (var i = 0; i < w.updrafts.length; i++) {
      var u = w.updrafts[i];
      if (!u.active) continue;
      if (y >= u.yTop && y <= u.yBottom) {
        var dx = x - u.x;
        var adx = abs(dx);
        if (adx < u.halfW) {
          var radialFalloff = 1 - smoothstep(0, u.halfW, adx);
          var heightRatio = clamp((u.yBottom - y) / Math.max(1, u.yBottom - u.yTop), 0, 1);
          var verticalEnvelope = 1 - 0.35 * heightRatio;
          vy += u.vy * radialFalloff * verticalEnvelope;
          // 涡旋切向吸入：将边缘侠客向风柱中心轻度聚拢
          vx += -sign(dx) * u.swirl * (adx / Math.max(1, u.halfW)) * radialFalloff;
          inUpdraft = true;
        }
      }
    }
    return { vx: q(vx), vy: q(vy), inUpdraft: inUpdraft };
  }

  function computeAerodynamicForces(fighter, fEnv, env, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var localWind = sampleWindAt(env, fighter.x, fighter.y);
    var state = fighter.state || 'idle';
    var aero = STANCE_AERO[state] || STANCE_AERO.idle;
    var mass = clamp(Number.isFinite(fighter.mass) ? fighter.mass : 1.0, 0.5, 2.5);
    var size = clamp(Number.isFinite(fighter.size) ? fighter.size : 1.0, 0.6, 1.8);

    // 相对风速（将像素/秒缩放到米/秒量级以保证动压合理）
    var relVx = (fighter.vx || 0) - localWind.vx;
    var relVy = (fighter.vy || 0) - localWind.vy;
    var relSpeedSq = relVx * relVx + relVy * relVy;
    var relSpeed = Math.sqrt(relSpeedSq);

    if (relSpeed < 0.001) {
      fEnv.windForceX = 0;
      fEnv.windForceY = 0;
      return { ax: 0, ay: 0, inUpdraft: localWind.inUpdraft, lift: 0, drag: 0 };
    }

    var cda = (aero.cda + aero.cloakArea * (fighter.y < -2 ? 1.0 : 0.45)) * size;
    var dynamicPressure = 0.5 * AIR_DENSITY * (relSpeedSq * 0.000018);
    var dragMag = dynamicPressure * cda * 115;

    var invSpeed = 1 / relSpeed;
    var dragAx = -(relVx * invSpeed) * dragMag / mass;
    var dragAy = -(relVy * invSpeed) * dragMag / mass;

    // 侧风升力：仅在滞空或上升气流中生效，攻角过大触发失速衰减
    var liftAy = 0;
    if (fighter.y < -2 || localWind.inUpdraft) {
      var crosswind = abs(localWind.vx);
      var aoaSin = clamp(abs(relVy) * invSpeed, 0, 1);
      // 失速包络：攻角 sin(alpha) 在 0.35 附近升力最大，超过 0.7 后失速下降
      var stallFactor = aoaSin <= 0.35
        ? (aoaSin / 0.35)
        : clamp(1 - (aoaSin - 0.35) * 1.15, 0.15, 1);
      var cl = aero.clMax * stallFactor;
      var crossPressure = 0.5 * AIR_DENSITY * (crosswind * crosswind * 0.000022);
      // 升力方向向上（负 y）
      liftAy = -(crossPressure * cl * size * 165) / mass;
      if (localWind.inUpdraft) {
        liftAy += (localWind.vy * 0.85) / mass;
      }
    }

    // 地面静摩擦抵消微弱风推力，防止静止人物被微风吹跑
    var grounded = (fighter.y >= -0.5 || fEnv.platIndex >= 0) && (fighter.vy || 0) >= 0;
    if (grounded) {
      var surf = resolveSurfaceAt(env, fighter.x, fighter.y, fEnv.platIndex);
      var staticResist = surf.muStatic * env.gravity * 0.22;
      if (abs(dragAx) < staticResist && abs(fighter.vx || 0) < 12) {
        dragAx = 0;
      } else {
        dragAx *= 0.65;
      }
      dragAy = 0;
      liftAy = Math.min(0, liftAy * 0.2);
    }

    var totalAx = q(clamp(dragAx, -1600, 1600));
    var totalAy = q(clamp(dragAy + liftAy, -1800, 1200));

    fighter.vx = q((fighter.vx || 0) + totalAx * stepDt);
    fighter.vy = q((fighter.vy || 0) + totalAy * stepDt);

    fEnv.windForceX = totalAx;
    fEnv.windForceY = totalAy;

    return {
      ax: totalAx,
      ay: totalAy,
      inUpdraft: localWind.inUpdraft,
      lift: q(liftAy),
      drag: q(dragMag)
    };
  }

  // ----------------------- 3. 悬崖倾覆力矩与崖边抓沿自救 -----------------------
  function evaluateCliffTipping(fighter, fEnv, env, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    fEnv.onCliffEdge = false;
    fEnv.cliffSide = '';

    if (env.cliffs.length === 0 || fEnv.ledgeGrabbed) {
      fEnv.tipBalance = q(Math.max(0, fEnv.tipBalance - 2.5 * stepDt));
      fEnv.tipAngle = q(fEnv.tipAngle * 0.85);
      return { tipping: false, slippedOff: false, torque: 0 };
    }

    var groundedOnMain = fighter.y >= -1 && fEnv.platIndex < 0 && (fighter.vy || 0) >= 0;
    if (!groundedOnMain) {
      fEnv.tipBalance = q(Math.max(0, fEnv.tipBalance - 3.0 * stepDt));
      fEnv.tipAngle = q(fEnv.tipAngle * 0.82);
      return { tipping: false, slippedOff: false, torque: 0 };
    }

    var footHalfW = 18 * clamp(fighter.size || 1, 0.7, 1.6);
    var mass = clamp(fighter.mass || 1, 0.5, 2.5);

    for (var i = 0; i < env.cliffs.length; i++) {
      var cliff = env.cliffs[i];
      var overhang = 0;
      var outDir = 0;
      if (cliff.side === 'left') {
        // 左侧悬崖：edgeX 以左为深渊
        if (fighter.x < cliff.edgeX + cliff.tipMargin) {
          overhang = (cliff.edgeX + footHalfW) - fighter.x;
          outDir = -1;
        }
      } else {
        // 右侧悬崖：edgeX 以右为深渊
        if (fighter.x > cliff.edgeX - cliff.tipMargin) {
          overhang = fighter.x - (cliff.edgeX - footHalfW);
          outDir = 1;
        }
      }

      if (overhang > 0) {
        fEnv.onCliffEdge = true;
        fEnv.cliffSide = cliff.side;

        // 重心悬空力矩 tau = m * g * leverArm
        var leverArm = clamp(overhang / Math.max(1, footHalfW * 2), 0, 1.5);
        var torque = q(mass * env.gravity * leverArm * 0.012);
        var inertia = mass * 1.15;
        var angularAcc = torque / inertia;

        // 若侠客正朝深渊外侧移动或处于受击僵直，倾覆速度加倍
        var movingOut = sign(fighter.vx || 0) === outDir ? 1.45 : 0.85;
        var stunnedMul = (fighter.state === 'hitstun' || fighter.state === 'knockdown') ? 1.8 : 1.0;

        fEnv.tipBalance = q(clamp(fEnv.tipBalance + angularAcc * movingOut * stunnedMul * stepDt * 0.09, 0, 1.2));
        fEnv.tipAngle = q(clamp(outDir * fEnv.tipBalance * 0.65, -0.78, 0.78));

        // 施加向外滑移加速度
        var slipAccel = outDir * env.gravity * 0.32 * leverArm * (0.5 + fEnv.tipBalance);
        fighter.vx = q((fighter.vx || 0) + slipAccel * stepDt);

        // 重心彻底越过崖沿或失衡满值 -> 滑落悬崖
        var pastEdge = cliff.side === 'left' ? (fighter.x < cliff.edgeX - 6) : (fighter.x > cliff.edgeX + 6);
        if (pastEdge || fEnv.tipBalance >= 1.0) {
          fighter.vx = q((fighter.vx || 0) + outDir * 145);
          fighter.vy = q(Math.max(fighter.vy || 0, 120));
          fighter.y = q(fighter.y + 4);
          fEnv.tipBalance = 0;
          fEnv.tipAngle = 0;
          return { tipping: true, slippedOff: true, torque: torque, outDir: outDir };
        }
        return { tipping: true, slippedOff: false, torque: torque, outDir: outDir };
      }
    }

    fEnv.tipBalance = q(Math.max(0, fEnv.tipBalance - 2.2 * stepDt));
    fEnv.tipAngle = q(fEnv.tipAngle * 0.84);
    return { tipping: false, slippedOff: false, torque: 0 };
  }

  function evaluateLedgeRecovery(fighter, fEnv, env, recoveryInput, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    if (fEnv.ledgeCD > 0) fEnv.ledgeCD--;

    // 已经处于抓沿状态：处理自救选项或体力耗尽坠落
    if (fEnv.ledgeGrabbed) {
      fEnv.ledgeHangFrames++;
      fighter.x = fEnv.ledgeX;
      fighter.y = fEnv.ledgeY;
      fighter.vx = 0;
      fighter.vy = 0;

      var inDir = fEnv.ledgeSide === 'left' ? 1 : -1;
      var maxHangFrames = 150;
      var action = recoveryInput || '';

      if (action === 'drop' || fEnv.ledgeHangFrames >= maxHangFrames) {
        fEnv.ledgeGrabbed = false;
        fEnv.ledgeCD = 28;
        fEnv.ledgeHangFrames = 0;
        fighter.vy = 180;
        fighter.vx = q(-inDir * 65);
        return { state: 'dropped', invulFrames: 0, recoveryFrames: 8, staminaCost: 0 };
      }

      if (action === 'climb' || action === 'vault' || action === 'roll') {
        var prof = LEDGE_RECOVERY_PROFILES[action];
        fEnv.ledgeGrabbed = false;
        fEnv.ledgeCD = 24;
        fEnv.ledgeHangFrames = 0;
        fighter.face = inDir;
        fighter.vx = q(inDir * prof.vx);
        fighter.vy = q(prof.vy);
        fighter.y = q(fEnv.ledgeY - 12);
        return {
          state: 'recovered_' + action,
          invulFrames: prof.invulFrames,
          recoveryFrames: prof.recoveryFrames,
          staminaCost: prof.staminaCost
        };
      }

      return { state: 'hanging', hangFrames: fEnv.ledgeHangFrames, remainingFrames: maxHangFrames - fEnv.ledgeHangFrames };
    }

    // 未抓沿：检查是否满足抓沿捕获窗口
    if (fEnv.ledgeCD > 0 || env.cliffs.length === 0) {
      return { state: 'none' };
    }
    var st = fighter.state || 'air';
    if (st === 'hitstun' || st === 'knockdown' || st === 'ko') {
      return { state: 'none' };
    }
    // 仅在下落或低速上升且处于崖口下方附近时触发抓沿
    if ((fighter.vy || 0) < -180) {
      return { state: 'none' };
    }

    for (var i = 0; i < env.cliffs.length; i++) {
      var cliff = env.cliffs[i];
      var dx = fighter.x - cliff.edgeX;
      var dy = fighter.y - cliff.lipY;
      var onAbyssSide = cliff.side === 'left' ? (dx <= 14 && dx >= -cliff.grabRadiusX) : (dx >= -14 && dx <= cliff.grabRadiusX);
      if (onAbyssSide && dy >= 4 && dy <= cliff.grabRadiusY) {
        fEnv.ledgeGrabbed = true;
        fEnv.ledgeSide = cliff.side;
        fEnv.ledgeX = q(cliff.edgeX + (cliff.side === 'left' ? -14 : 14));
        fEnv.ledgeY = q(cliff.lipY + 26);
        fEnv.ledgeHangFrames = 0;
        fighter.x = fEnv.ledgeX;
        fighter.y = fEnv.ledgeY;
        fighter.vx = 0;
        fighter.vy = 0;
        fighter.face = cliff.side === 'left' ? 1 : -1;
        return { state: 'grabbed', side: cliff.side, invulFrames: 12 };
      }
    }

    return { state: 'none', dt: stepDt };
  }

  // ----------------------- 4. 单向平台落地减震与下穿运动学 -----------------------
  function stepPlatforms(env, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    for (var i = 0; i < env.platforms.length; i++) {
      var p = env.platforms[i];
      if (p.shockTimer > 0) p.shockTimer = q(Math.max(0, p.shockTimer - stepDt));
      if (p.flexStiffness > 0 && (abs(p.deflection) > 0.005 || abs(p.deflectionVel) > 0.005)) {
        // 阻尼谐振子：a = -k*x - c*v
        var acc = -p.flexStiffness * p.deflection - p.flexDamping * p.deflectionVel;
        p.deflectionVel = q(p.deflectionVel + acc * stepDt);
        p.deflection = q(clamp(p.deflection + p.deflectionVel * stepDt, -p.maxDeflection * 0.5, p.maxDeflection));
      } else {
        p.deflection = 0;
        p.deflectionVel = 0;
      }
    }
  }

  function initiateDropThrough(fighter, fEnv, env) {
    if (fEnv.platIndex < 0 || fEnv.platIndex >= env.platforms.length) {
      return { dropped: false };
    }
    var plat = env.platforms[fEnv.platIndex];
    if (!plat.oneWay) {
      return { dropped: false };
    }
    fEnv.dropIgnorePlat = fEnv.platIndex;
    fEnv.platIndex = -1;
    fEnv.dropFrames = 14;
    fighter.y = q(fighter.y + 6);
    fighter.vy = q(Math.max(fighter.vy || 0, 210));
    return { dropped: true, ignoredPlat: fEnv.dropIgnorePlat, dropFrames: fEnv.dropFrames };
  }

  function sweepPlatformLanding(fighter, fEnv, env, prevY, nextY, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    if (fEnv.landingShockFrames > 0) fEnv.landingShockFrames--;
    if (fEnv.landingSquash > 0) fEnv.landingSquash = q(Math.max(0, fEnv.landingSquash - 4.5 * stepDt));

    if (fEnv.dropFrames > 0) {
      fEnv.dropFrames--;
      if (fEnv.dropFrames === 0) fEnv.dropIgnorePlat = -1;
    }

    // 已经站在某平台上：检查是否走离边缘或起跳
    if (fEnv.platIndex >= 0 && fEnv.platIndex < env.platforms.length) {
      var curPlat = env.platforms[fEnv.platIndex];
      var outOfBounds = fighter.x < curPlat.x1 - 10 || fighter.x > curPlat.x2 + 10;
      if (outOfBounds || (fighter.vy || 0) < -5) {
        fEnv.platIndex = -1;
      } else {
        fighter.y = q(curPlat.y + curPlat.deflection);
        fighter.vy = 0;
        return { landed: false, onPlatform: true, platIndex: fEnv.platIndex, shockLag: 0, bounceVy: 0 };
      }
    }

    // 仅在下落时执行单向平台连续扫掠检测
    var vy = fighter.vy || 0;
    if (vy < 0 || env.platforms.length === 0) {
      return { landed: false, onPlatform: false, platIndex: -1, shockLag: 0, bounceVy: 0 };
    }

    for (var i = 0; i < env.platforms.length; i++) {
      if (i === fEnv.dropIgnorePlat && fEnv.dropFrames > 0) continue;
      var p = env.platforms[i];
      if (fighter.x < p.x1 - 8 || fighter.x > p.x2 + 8) continue;

      var surfY = p.y + p.deflection;
      if (prevY <= surfY + 6 && nextY >= surfY - 2) {
        var impactVy = vy;
        var mass = clamp(fighter.mass || 1, 0.5, 2.5);
        var surface = SURFACES[p.surface] || SURFACES.timber;

        // 注入平台弹性冲击速度
        if (p.flexStiffness > 0) {
          var impulse = clamp(impactVy * 0.24 * mass, 0, 260);
          p.deflectionVel = q(p.deflectionVel + impulse);
          p.shockTimer = 0.28;
        }

        // 受击/倒地高速砸台会按恢复系数反弹；正常落地则由膝盖与台面弹性吸收
        var inStun = fighter.state === 'hitstun' || fighter.state === 'knockdown';
        if (inStun && impactVy > 460 && surface.restitution > 0.08) {
          var bounceVy = q(-impactVy * surface.restitution * 1.35);
          fighter.y = q(surfY - 2);
          fighter.vy = bounceVy;
          fEnv.platIndex = -1;
          return { landed: true, onPlatform: false, platIndex: i, shockLag: 0, bounceVy: bounceVy, impactVy: q(impactVy) };
        }

        // 正常落地减震：弹性台面（翠竹/古木）吸收部分硬直
        var flexAbsorb = p.flexStiffness > 0 ? 0.72 : 1.0;
        var shockEnergy = Math.max(0, impactVy - 340) * flexAbsorb;
        var shockLag = Math.min(10, Math.floor(shockEnergy / 125));
        fEnv.platIndex = i;
        fEnv.landingShockFrames = shockLag;
        fEnv.landingSquash = q(clamp(impactVy / 1100, 0.12, 0.85));
        fighter.y = q(surfY);
        fighter.vy = 0;

        return {
          landed: true,
          onPlatform: true,
          platIndex: i,
          shockLag: shockLag,
          bounceVy: 0,
          impactVy: q(impactVy),
          squash: fEnv.landingSquash
        };
      }
    }

    return { landed: false, onPlatform: false, platIndex: -1, shockLag: 0, bounceVy: 0 };
  }

  // ----------------------- 5. 天雷导电性与静电蓄能爆发 -----------------------
  function computeConductivity(fighter, fEnv, env) {
    var surface = resolveSurfaceAt(env, fighter.x, fighter.y, fEnv.platIndex);
    var grounded = (fighter.y >= -1 || fEnv.platIndex >= 0);
    var surfCond = grounded ? surface.conductivity : 0.12;
    var metalFactor = clamp(Number.isFinite(fighter.metalConductivity) ? fighter.metalConductivity : 0.45, 0, 1);
    var wetBonus = fEnv.wetness * 0.65;
    var altitudeBonus = !grounded ? clamp((-fighter.y) / 480, 0, 0.45) : 0;
    return q(clamp(surfCond * 0.55 + wetBonus + metalFactor * 0.35 + altitudeBonus, 0.05, 1.8));
  }

  function stepStormSystem(env, fighters, fighterEnvStates, dt) {
    var storm = env.storm;
    var events = [];
    if (!storm.enabled) return events;

    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    storm.strikeTimer--;

    // 触发新的天雷预警点：优先锁定导电性最高的区域并叠加确定性偏移
    if (storm.strikeTimer <= 0) {
      storm.strikeTimer = storm.strikeInterval;
      var targetX = env.stageW * 0.5;
      var bestCond = -1;
      for (var i = 0; i < fighters.length; i++) {
        var f = fighters[i];
        var fe = fighterEnvStates[i];
        if (!f || !fe || (f.hp !== undefined && f.hp <= 0)) continue;
        var cond = computeConductivity(f, fe, env);
        if (cond > bestCond) {
          bestCond = cond;
          targetX = f.x;
        }
      }
      var jitter = (detHash01(env.seed, env.frame * 13 + 7) * 2 - 1) * 95;
      var strikeX = q(clamp(targetX + jitter, env.wall + 64, env.stageW - env.wall - 64));
      storm.strikes.push({
        x: strikeX,
        radius: 78,
        phase: 'telegraph',
        framesLeft: storm.telegraphFrames,
        intensity: q(clamp(0.85 + bestCond * 0.35, 0.85, 1.5))
      });
      events.push({ type: 'storm_telegraph', x: strikeX, frames: storm.telegraphFrames });
    }

    // 推进所有落雷生命周期
    for (var s = storm.strikes.length - 1; s >= 0; s--) {
      var st = storm.strikes[s];
      st.framesLeft--;
      if (st.phase === 'telegraph' && st.framesLeft <= 0) {
        st.phase = 'active';
        st.framesLeft = 10;
        events.push({ type: 'storm_strike', x: st.x, radius: st.radius, intensity: st.intensity });

        // 对落雷范围内与近旁侠客注入静电或雷击判定
        for (var k = 0; k < fighters.length; k++) {
          var fk = fighters[k];
          var fek = fighterEnvStates[k];
          if (!fk || !fek) continue;
          var dist = abs(fk.x - st.x);
          var condK = computeConductivity(fk, fek, env);
          var effectiveRadius = st.radius * (1 + (condK - 0.5) * 0.25);
          if (dist <= effectiveRadius) {
            fek.staticCharge = q(clamp(fek.staticCharge + 48 * condK, 0, 100));
            events.push({
              type: 'lightning_hit',
              fighterIdx: k,
              x: st.x,
              conductivity: condK,
              damageScale: q(st.intensity * (0.75 + condK * 0.45))
            });
          } else if (dist <= effectiveRadius * 2.4) {
            // 近距感应电弧：充能而不直接命中
            var induction = (1 - (dist - effectiveRadius) / (effectiveRadius * 1.4)) * 34 * condK;
            fek.staticCharge = q(clamp(fek.staticCharge + induction, 0, 100));
          }
        }
      } else if (st.phase === 'active' && st.framesLeft <= 0) {
        storm.strikes.splice(s, 1);
      }
    }

    // 常规环境静电蓄能与自然泄漏
    for (var j = 0; j < fighters.length; j++) {
      var fj = fighters[j];
      var fej = fighterEnvStates[j];
      if (!fj || !fej) continue;
      if (fej.staticOverloadT > 0) fej.staticOverloadT = q(Math.max(0, fej.staticOverloadT - stepDt));
      if (fej.staticBoostT > 0) fej.staticBoostT = q(Math.max(0, fej.staticBoostT - stepDt));

      var condJ = computeConductivity(fj, fej, env);
      var speed = Math.sqrt((fj.vx || 0) * (fj.vx || 0) + (fj.vy || 0) * (fj.vy || 0));
      var kineticCharge = (speed / 500) * storm.ambientChargeRate * condJ * stepDt;
      var leak = (fej.wetness > 0.6 ? 2.2 : 4.5) * stepDt;
      fej.staticCharge = q(clamp(fej.staticCharge + kineticCharge - leak, 0, 100));
    }

    return events;
  }

  function triggerStaticDischarge(fighter, fEnv, env, actionDirX, nearbyFighters, nearbyEnvStates) {
    if (fEnv.staticOverloadT > 0 || fEnv.staticCharge < 35) {
      return { triggered: false, boostVx: 0, shockRadius: 0, arcTargets: [] };
    }
    var charge = fEnv.staticCharge;
    var power = clamp((charge - 25) / 75, 0.15, 1.0);
    var dir = actionDirX !== 0 ? sign(actionDirX) : (fighter.face || 1);
    var boostVx = q(dir * (180 + 260 * power));
    var shockRadius = q(75 + 95 * power);

    fighter.vx = q((fighter.vx || 0) + boostVx);
    fEnv.staticCharge = 0;
    fEnv.staticBoostT = q(0.35 + 0.35 * power);
    fEnv.staticOverloadT = q(1.6);

    // 连锁导电弧判定：若附近对手潮湿或站在导电地表，触发电弧传导
    var arcTargets = [];
    if (Array.isArray(nearbyFighters) && Array.isArray(nearbyEnvStates)) {
      for (var i = 0; i < nearbyFighters.length; i++) {
        var other = nearbyFighters[i];
        var otherEnv = nearbyEnvStates[i];
        if (!other || other === fighter || !otherEnv) continue;
        var dx = other.x - fighter.x;
        var dy = other.y - fighter.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var cond = computeConductivity(other, otherEnv, env);
        var arcRange = shockRadius * (0.85 + cond * 0.55);
        if (dist <= arcRange && cond >= 0.45) {
          arcTargets.push({
            idx: i,
            dist: q(dist),
            conductivity: cond,
            damageMul: q(0.45 + power * 0.55 * cond),
            stunFrames: Math.round(6 + 8 * power)
          });
        }
      }
    }

    return {
      triggered: true,
      power: q(power),
      boostVx: boostVx,
      shockRadius: shockRadius,
      damageBonusMul: q(1 + 0.28 * power),
      arcTargets: arcTargets
    };
  }

  // ----------------------- 6. 酒雾 / 迷雾粘滞阻尼与破雾尾流 -----------------------
  function stepMistZones(env, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    for (var i = 0; i < env.mistZones.length; i++) {
      var m = env.mistZones[i];
      var cells = m.wakeCells;
      for (var c = 0; c < cells.length; c++) {
        if (cells[c] < 1) {
          cells[c] = q(Math.min(1, cells[c] + m.regenRate * stepDt));
        }
      }
    }
  }

  function disperseMistWake(env, x, y, radius, strength) {
    var str = clamp(Number.isFinite(strength) ? strength : 0.6, 0, 1);
    var rad = Math.max(20, Number.isFinite(radius) ? radius : 80);
    var dispersed = 0;
    for (var i = 0; i < env.mistZones.length; i++) {
      var m = env.mistZones[i];
      if (y < m.yTop - rad || y > m.yBottom + rad) continue;
      var span = Math.max(1, m.x2 - m.x1);
      var cellW = span / m.cellCount;
      for (var c = 0; c < m.cellCount; c++) {
        var cx = m.x1 + (c + 0.5) * cellW;
        var dist = abs(cx - x);
        if (dist <= rad) {
          var falloff = 1 - smoothstep(0, rad, dist);
          var nextVal = Math.max(0.08, m.wakeCells[c] - str * falloff);
          dispersed += (m.wakeCells[c] - nextVal);
          m.wakeCells[c] = q(nextVal);
        }
      }
    }
    return q(dispersed);
  }

  function sampleMistAt(env, x, y) {
    var totalDensity = 0;
    var viscLin = 0;
    var viscQuad = 0;
    var aroma = 0;
    for (var i = 0; i < env.mistZones.length; i++) {
      var m = env.mistZones[i];
      if (x < m.x1 || x > m.x2 || y < m.yTop || y > m.yBottom) continue;
      var span = Math.max(1, m.x2 - m.x1);
      var idx = clamp(Math.floor(((x - m.x1) / span) * m.cellCount), 0, m.cellCount - 1);
      var localD = m.baseDensity * m.wakeCells[idx];
      if (localD > totalDensity) {
        totalDensity = localD;
        viscLin = m.viscosityLinear;
        viscQuad = m.viscosityQuad;
        aroma = m.aromaPotency;
      }
    }
    return {
      density: q(clamp(totalDensity, 0, 1)),
      viscosityLinear: viscLin,
      viscosityQuad: viscQuad,
      aromaPotency: aroma
    };
  }

  function applyMistViscosityDamping(fighter, fEnv, env, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var sample = sampleMistAt(env, fighter.x, fighter.y - 32);

    if (sample.density <= 0.01) {
      fEnv.mistDragX = 0;
      fEnv.mistDragY = 0;
      fEnv.mistExposure = q(Math.max(0, fEnv.mistExposure - 0.18 * stepDt));
      return { inMist: false, density: 0, swayVx: 0 };
    }

    var vx = fighter.vx || 0;
    var vy = fighter.vy || 0;
    var speed = Math.sqrt(vx * vx + vy * vy);
    var mass = clamp(fighter.mass || 1, 0.5, 2.5);

    // 高速冲刺或大招掠过时自动冲散局部迷雾
    if (speed > 380) {
      disperseMistWake(env, fighter.x, fighter.y - 32, 72, clamp((speed - 380) / 900, 0.08, 0.45) * stepDt * 8);
    }

    // 斯托克斯线性粘滞阻力 + 高速二次涡流阻力
    var dampFactor = (sample.viscosityLinear * sample.density + sample.viscosityQuad * sample.density * speed) / mass;
    var ax = q(clamp(-vx * dampFactor, -1400, 1400));
    var ay = q(clamp(-vy * dampFactor * 0.72, -1200, 1200));

    fighter.vx = q(vx + ax * stepDt);
    fighter.vy = q(vy + ay * stepDt);
    fEnv.mistDragX = ax;
    fEnv.mistDragY = ay;

    // 酒雾醉意累积与确定性微幅重心摇曳
    fEnv.mistExposure = q(clamp(fEnv.mistExposure + sample.density * sample.aromaPotency * stepDt, 0, 1));
    var swayVx = 0;
    if (fEnv.mistExposure > 0.35) {
      fEnv.swayPhase = q((fEnv.swayPhase + 3.4 * stepDt) % TWO_PI);
      var swayAmp = (fEnv.mistExposure - 0.35) * 85;
      swayVx = q(detSin(fEnv.swayPhase) * swayAmp);
      fighter.vx = q(fighter.vx + swayVx * stepDt);
    }

    return {
      inMist: true,
      density: sample.density,
      dragAx: ax,
      dragAy: ay,
      exposure: fEnv.mistExposure,
      swayVx: swayVx
    };
  }

  function dampProjectileInMist(proj, env, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    var sample = sampleMistAt(env, proj.x, proj.y);
    if (sample.density <= 0.01) return false;
    var vx = proj.vx || 0;
    var vy = proj.vy || 0;
    var speed = Math.sqrt(vx * vx + vy * vy);
    var decay = clamp(1 - (sample.viscosityLinear * 0.55 + sample.viscosityQuad * speed * 0.45) * sample.density * stepDt, 0.72, 1);
    proj.vx = q(vx * decay);
    proj.vy = q(vy * decay);
    return true;
  }

  // ----------------------- 7. 统一每帧环境物理步进管线 -----------------------
  function stepEnvironment(env, fighters, fighterEnvStates, inputs, dt) {
    var stepDt = Number.isFinite(dt) ? dt : FIXED_DT;
    env.frame++;

    stepWindField(env, stepDt);
    stepPlatforms(env, stepDt);
    stepMistZones(env, stepDt);

    var stormEvents = stepStormSystem(env, fighters, fighterEnvStates, stepDt);
    var fighterReports = [];

    for (var i = 0; i < fighters.length; i++) {
      var f = fighters[i];
      var fe = fighterEnvStates[i];
      var inp = (inputs && inputs[i]) || {};
      if (!f || !fe) continue;

      var prevY = Number.isFinite(inp.prevY) ? inp.prevY : (f.y || 0);
      var dropRes = inp.dropThrough ? initiateDropThrough(f, fe, env) : { dropped: false };
      var ledgeRes = evaluateLedgeRecovery(f, fe, env, inp.ledgeAction || '', stepDt);

      if (fe.ledgeGrabbed) {
        fighterReports.push({
          idx: i,
          ledge: ledgeRes,
          dropped: dropRes.dropped,
          platform: { landed: false, onPlatform: false, platIndex: -1 },
          surface: { grounded: false, surface: fe.surfaceId },
          aero: { ax: 0, ay: 0 },
          cliff: { tipping: false, slippedOff: false },
          mist: { inMist: false, density: 0 }
        });
        continue;
      }

      var platRes = sweepPlatformLanding(f, fe, env, prevY, f.y || 0, stepDt);
      var surfRes = applySurfaceTraction(f, fe, env, inp.dirX || 0, stepDt);
      var aeroRes = computeAerodynamicForces(f, fe, env, stepDt);
      var cliffRes = evaluateCliffTipping(f, fe, env, stepDt);
      var mistRes = applyMistViscosityDamping(f, fe, env, stepDt);

      fighterReports.push({
        idx: i,
        ledge: ledgeRes,
        dropped: dropRes.dropped,
        platform: platRes,
        surface: surfRes,
        aero: aeroRes,
        cliff: cliffRes,
        mist: mistRes
      });
    }

    return {
      frame: env.frame,
      stormEvents: stormEvents,
      fighters: fighterReports
    };
  }

  // ----------------------- 导出 RYPhysics.Environment -----------------------
  root.Environment = {
    VERSION: '1.0.0',
    FIXED_DT: FIXED_DT,
    SURFACES: SURFACES,
    STANCE_AERO: STANCE_AERO,
    LEDGE_RECOVERY_PROFILES: LEDGE_RECOVERY_PROFILES,
    createEnvironmentState: createEnvironmentState,
    createFighterEnvState: createFighterEnvState,
    cloneEnvironmentState: cloneEnvironmentState,
    cloneFighterEnvState: cloneFighterEnvState,
    serializeState: serializeState,
    deserializeState: deserializeState,
    computeChecksum: computeChecksum,
    resolveSurfaceAt: resolveSurfaceAt,
    computeEffectiveGrip: computeEffectiveGrip,
    applySurfaceTraction: applySurfaceTraction,
    stepWindField: stepWindField,
    sampleWindAt: sampleWindAt,
    computeAerodynamicForces: computeAerodynamicForces,
    evaluateCliffTipping: evaluateCliffTipping,
    evaluateLedgeRecovery: evaluateLedgeRecovery,
    stepPlatforms: stepPlatforms,
    initiateDropThrough: initiateDropThrough,
    sweepPlatformLanding: sweepPlatformLanding,
    computeConductivity: computeConductivity,
    stepStormSystem: stepStormSystem,
    triggerStaticDischarge: triggerStaticDischarge,
    stepMistZones: stepMistZones,
    disperseMistWake: disperseMistWake,
    sampleMistAt: sampleMistAt,
    applyMistViscosityDamping: applyMistViscosityDamping,
    dampProjectileInMist: dampProjectileInMist,
    stepEnvironment: stepEnvironment
  };
})(RYPhysics);
