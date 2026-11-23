// ============================================================================
// RenYing Martial Arts Physics — Module 06: Impulse, Knockback & Crowd Collisions
// Rollback-deterministic directional impact decomposition, mass-scaled
// knockback trajectories, wall-splat & wall-rebound with corner-trap relief,
// ground-bounce elasticity & tumble-friction decay, radial shockwaves for
// 8v8 brawls, crowd chain collisions, and hit-stop momentum freeze/release.
// ============================================================================

var RYPhysics = (typeof window !== 'undefined' ? (window.RYPhysics = window.RYPhysics || {}) : {});

(function (RY) {
  'use strict';

  var QUANT = 10000;
  var PI = 3.141592653589793;
  var DEFAULT_STEP = 1 / 60;
  var BASE_GRAVITY = 1520;
  var REF_MASS = 68;
  var EPS = 1e-6;

  function q(v) {
    if (!isFinite(v)) return 0;
    return Math.round(v * QUANT) / QUANT;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(e0, e1, x) {
    var d = e1 - e0;
    if (Math.abs(d) < EPS) return x >= e1 ? 1 : 0;
    var t = clamp((x - e0) / d, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function signNonZero(v) {
    return v < 0 ? -1 : 1;
  }

  // ==========================================================================
  // 1. MATERIAL & BODY WEIGHT-CLASS PRESETS
  // ==========================================================================

  var WALL_MATERIALS = {
    stone: {
      id: 'stone',
      restitution: 0.62,
      tangentialFriction: 0.28,
      splatThreshold: 360,
      splatHoldSec: 0.16,
      reboundLiftVy: -220
    },
    wood: {
      id: 'wood',
      restitution: 0.72,
      tangentialFriction: 0.22,
      splatThreshold: 330,
      splatHoldSec: 0.14,
      reboundLiftVy: -245
    },
    bamboo: {
      id: 'bamboo',
      restitution: 0.84,
      tangentialFriction: 0.15,
      splatThreshold: 410,
      splatHoldSec: 0.10,
      reboundLiftVy: -260
    },
    ice: {
      id: 'ice',
      restitution: 0.56,
      tangentialFriction: 0.06,
      splatThreshold: 390,
      splatHoldSec: 0.11,
      reboundLiftVy: -195
    },
    invisible_bound: {
      id: 'invisible_bound',
      restitution: 0.48,
      tangentialFriction: 0.18,
      splatThreshold: 420,
      splatHoldSec: 0.12,
      reboundLiftVy: -180
    }
  };

  var GROUND_MATERIALS = {
    stone: {
      id: 'stone',
      restitution: 0.54,
      bounceThresholdVy: 270,
      slideFriction: 920,
      tumbleFriction: 640,
      spinTransfer: 0.018
    },
    wood: {
      id: 'wood',
      restitution: 0.60,
      bounceThresholdVy: 250,
      slideFriction: 840,
      tumbleFriction: 590,
      spinTransfer: 0.020
    },
    sand: {
      id: 'sand',
      restitution: 0.28,
      bounceThresholdVy: 360,
      slideFriction: 1180,
      tumbleFriction: 880,
      spinTransfer: 0.014
    },
    mud: {
      id: 'mud',
      restitution: 0.18,
      bounceThresholdVy: 420,
      slideFriction: 1320,
      tumbleFriction: 1020,
      spinTransfer: 0.010
    },
    ice: {
      id: 'ice',
      restitution: 0.42,
      bounceThresholdVy: 300,
      slideFriction: 240,
      tumbleFriction: 210,
      spinTransfer: 0.024
    }
  };

  var BODY_CLASSES = {
    feather: { mass: 52, airDrag: 0.36, gravityScale: 0.92, radius: 18 },
    light: { mass: 60, airDrag: 0.30, gravityScale: 0.96, radius: 19 },
    medium: { mass: 68, airDrag: 0.24, gravityScale: 1.00, radius: 20 },
    heavy: { mass: 84, airDrag: 0.18, gravityScale: 1.08, radius: 23 },
    titan: { mass: 104, airDrag: 0.14, gravityScale: 1.16, radius: 26 }
  };

  var MODES = {
    NONE: 'none',
    SLIDE: 'slide',
    LAUNCHED: 'launched',
    WALL_SPLAT: 'wall_splat',
    TUMBLE: 'tumble',
    BOUNCE_RECOVER: 'bounce_recover'
  };

  function getWallMaterial(id) {
    return (id && WALL_MATERIALS[id]) || WALL_MATERIALS.stone;
  }

  function getGroundMaterial(id) {
    return (id && GROUND_MATERIALS[id]) || GROUND_MATERIALS.stone;
  }

  // ==========================================================================
  // 2. ROLLBACK-DETERMINISTIC KNOCKBACK BODY STATE
  // ==========================================================================

  function createState(options) {
    var opts = options || {};
    var cls = (opts.bodyClass && BODY_CLASSES[opts.bodyClass]) || BODY_CLASSES.medium;

    return {
      fighterId: opts.fighterId || 0,
      team: opts.team || 0,
      x: q(opts.x || 0),
      y: q(opts.y || 0),
      vx: q(opts.vx || 0),
      vy: q(opts.vy || 0),
      rot: 0,
      omega: 0,

      mass: q(opts.mass || cls.mass),
      radius: q(opts.radius || cls.radius),
      height: q(opts.height || 108),
      airDrag: q(opts.airDrag !== undefined ? opts.airDrag : cls.airDrag),
      gravityScale: q(opts.gravityScale !== undefined ? opts.gravityScale : cls.gravityScale),
      grounded: opts.grounded !== undefined ? !!opts.grounded : true,

      mode: MODES.NONE,
      juggleHits: 0,
      juggleGravityMul: 1.0,

      // Wall-splat & corner-trap relief
      wallSplatTimer: 0,
      wallSplatSide: 0, // -1 left wall, +1 right wall
      wallReboundVx: 0,
      wallReboundVy: 0,
      wallBouncesThisCombo: 0,
      maxWallBounces: opts.maxWallBounces !== undefined ? opts.maxWallBounces : 2,
      cornerTrapCount: 0,
      cornerReliefTimer: 0,
      cornerDecayTimer: 0,

      // Ground-bounce & tumble friction
      groundBounces: 0,
      maxGroundBounces: opts.maxGroundBounces !== undefined ? opts.maxGroundBounces : 2,
      tumbleTimer: 0,

      // Hit-stop momentum freeze / release buffer
      hitstopTimer: 0,
      hitstopTotal: 0,
      frozenVx: 0,
      frozenVy: 0,
      frozenOmega: 0,
      hasPendingImpulse: false,
      pendingVx: 0,
      pendingVy: 0,
      pendingOmega: 0,
      pendingMode: MODES.NONE,
      vibrationPhase: 0,
      vibrationAmp: 0,

      // Crowd chain-collision cooldown
      chainCooldown: 0
    };
  }

  function resetState(state, x, y) {
    state.x = q(x !== undefined ? x : state.x);
    state.y = q(y !== undefined ? y : 0);
    state.vx = 0;
    state.vy = 0;
    state.rot = 0;
    state.omega = 0;
    state.grounded = state.y >= 0;
    state.mode = MODES.NONE;
    state.juggleHits = 0;
    state.juggleGravityMul = 1.0;
    state.wallSplatTimer = 0;
    state.wallSplatSide = 0;
    state.wallReboundVx = 0;
    state.wallReboundVy = 0;
    state.wallBouncesThisCombo = 0;
    state.cornerTrapCount = 0;
    state.cornerReliefTimer = 0;
    state.cornerDecayTimer = 0;
    state.groundBounces = 0;
    state.tumbleTimer = 0;
    state.hitstopTimer = 0;
    state.hitstopTotal = 0;
    state.frozenVx = 0;
    state.frozenVy = 0;
    state.frozenOmega = 0;
    state.hasPendingImpulse = false;
    state.pendingVx = 0;
    state.pendingVy = 0;
    state.pendingOmega = 0;
    state.pendingMode = MODES.NONE;
    state.vibrationPhase = 0;
    state.vibrationAmp = 0;
    state.chainCooldown = 0;
    return state;
  }

  function snapshotState(state) {
    return Object.assign({}, state);
  }

  function restoreState(target, snap) {
    if (!target || !snap) return target;
    var keys = Object.keys(snap);
    for (var i = 0; i < keys.length; i++) {
      target[keys[i]] = snap[keys[i]];
    }
    return target;
  }

  // ==========================================================================
  // 3. DIRECTIONAL IMPACT IMPULSE DECOMPOSITION & MASS SCALING
  // ==========================================================================

  // Compute nonlinear mass inertia resistance factor (1.0 at REF_MASS = 68kg)
  function computeMassScale(mass) {
    var m = Math.max(20, mass || REF_MASS);
    return q(Math.pow(REF_MASS / m, 0.82));
  }

  // Decompose a martial arts strike into horizontal drive, vertical launch,
  // rotational spin torque, and launch classification.
  function decomposeImpactImpulse(state, impact) {
    var imp = impact || {};
    var massScale = computeMassScale(state.mass);

    // Resolve impact direction & magnitude
    var dirX = imp.dirX !== undefined ? imp.dirX : (imp.face !== undefined ? signNonZero(imp.face) : 1);
    var baseHoriz = imp.horizontalImpulse !== undefined ? imp.horizontalImpulse : (imp.kbX || 0);
    var baseVert = imp.verticalImpulse !== undefined ? imp.verticalImpulse : (imp.kbY || 0);

    // Optional polar form: magnitude + angleRad (0 = straight forward, -PI/2 = straight up)
    if (imp.magnitude !== undefined && imp.angleRad !== undefined) {
      baseHoriz = Math.cos(imp.angleRad) * imp.magnitude * signNonZero(dirX);
      baseVert = Math.sin(imp.angleRad) * imp.magnitude;
    } else if (baseHoriz !== 0 && imp.dirX !== undefined) {
      baseHoriz = Math.abs(baseHoriz) * signNonZero(dirX);
    }

    // Attacker momentum carry-through (adds physical weight to running/dashing strikes)
    var carryX = (imp.attackerVx || 0) * (imp.momentumCarry !== undefined ? imp.momentumCarry : 0.22);
    var carryY = (imp.attackerVy || 0) * (imp.momentumCarry !== undefined ? imp.momentumCarry * 0.15 : 0.05);

    // Directional Influence (DI): defender can subtly bend launch trajectory (+/- 12 deg)
    var diX = clamp(imp.diX || 0, -1, 1);
    var diY = clamp(imp.diY || 0, -1, 1);

    // Juggle scaling: repeated air hits decay upward pop so combos cannot loop infinitely
    var juggleDecayH = state.grounded ? 1.0 : Math.pow(0.94, Math.min(state.juggleHits, 10));
    var juggleDecayV = state.grounded ? 1.0 : Math.pow(0.86, Math.min(state.juggleHits, 10));

    var driveX = (baseHoriz + carryX) * massScale * juggleDecayH;
    var launchY = (baseVert + carryY) * massScale * (baseVert < 0 ? juggleDecayV : 1.0);

    // Apply subtle DI steering perpendicular/aligned with launch
    var speedMag = Math.sqrt(driveX * driveX + launchY * launchY);
    if (speedMag > 40 && (diX !== 0 || diY !== 0)) {
      driveX += diX * speedMag * 0.11;
      launchY += diY * speedMag * 0.09;
    }

    // Spin torque from vertical lever arm relative to center of mass (CoM ~ 58% of height)
    var comHeight = state.height * 0.58;
    var hitHeight = imp.hitHeight !== undefined ? imp.hitHeight : comHeight;
    var lever = (hitHeight - comHeight) / Math.max(20, state.height); // roughly [-0.58 .. +0.42]
    var spinTorque = (driveX * lever * 0.045) + (imp.bonusSpin || 0);
    // Spikes and uppercuts impart characteristic forward/backward tumble spin
    if (launchY < -360) {
      spinTorque += signNonZero(driveX) * Math.abs(launchY) * 0.0085;
    } else if (launchY > 280) {
      spinTorque -= signNonZero(driveX) * Math.abs(launchY) * 0.011;
    }
    var spinOmega = q(clamp(spinTorque * massScale, -18, 18));

    // Classify knockback mode
    var launchClass = 'grounded_slide';
    var nextMode = MODES.SLIDE;
    if (launchY > 220 && !state.grounded) {
      launchClass = 'spike_meteor';
      nextMode = MODES.LAUNCHED;
    } else if (launchY <= -380) {
      launchClass = 'high_launch';
      nextMode = MODES.LAUNCHED;
    } else if (launchY <= -150) {
      launchClass = 'pop_up';
      nextMode = MODES.LAUNCHED;
    } else if (Math.abs(driveX) >= 420) {
      launchClass = 'horizontal_blast';
      nextMode = state.grounded ? MODES.SLIDE : MODES.LAUNCHED;
    } else if (!state.grounded) {
      launchClass = 'air_juggle';
      nextMode = MODES.LAUNCHED;
    }

    return {
      driveX: q(driveX),
      launchY: q(launchY),
      spinOmega: spinOmega,
      massScale: massScale,
      lever: q(lever),
      launchClass: launchClass,
      nextMode: nextMode
    };
  }

  // ==========================================================================
  // 4. HIT-STOP MOMENTUM FREEZE / RELEASE BUFFER
  // ==========================================================================

  // Apply an impact impulse to a knockback state.
  // If hitstopSec > 0, freezes momentum immediately and buffers the decomposed
  // velocity & spin for deterministic release on the exact exit frame.
  function applyImpactImpulse(state, impact, arenaBounds) {
    var imp = impact || {};
    var decomp = decomposeImpactImpulse(state, imp);

    // Corner-trap relief attenuation if fighter is already under corner relief
    var cornerReliefApplied = false;
    if (arenaBounds && state.cornerReliefTimer > 0) {
      var nearLeft = (state.x - arenaBounds.minX) < (arenaBounds.cornerZone || 110);
      var nearRight = (arenaBounds.maxX - state.x) < (arenaBounds.cornerZone || 110);
      if ((nearLeft && decomp.driveX < 0) || (nearRight && decomp.driveX > 0)) {
        decomp.driveX = q(decomp.driveX * 0.35);
        decomp.launchY = q(Math.min(decomp.launchY, -210));
        cornerReliefApplied = true;
      }
    }

    // Track juggle escalation when airborne
    if (!state.grounded || decomp.launchY < -140) {
      state.juggleHits = Math.min(16, state.juggleHits + 1);
      state.juggleGravityMul = q(1 + Math.min(state.juggleHits, 10) * 0.085);
    } else {
      state.juggleHits = 0;
      state.juggleGravityMul = 1.0;
    }

    var hitstopSec = Math.max(0, imp.hitstopSec || 0);
    var additive = !!imp.additive;

    if (hitstopSec > 0) {
      if (state.hitstopTimer <= 0) {
        // Enter fresh momentum freeze
        state.frozenVx = state.vx;
        state.frozenVy = state.vy;
        state.frozenOmega = state.omega;
        state.vx = 0;
        state.vy = 0;
        state.omega = 0;
        state.pendingVx = additive ? q(state.frozenVx + decomp.driveX) : decomp.driveX;
        state.pendingVy = additive ? q(state.frozenVy + decomp.launchY) : decomp.launchY;
        state.pendingOmega = additive ? q(state.frozenOmega + decomp.spinOmega) : decomp.spinOmega;
      } else {
        // Multi-hit during active hitstop (e.g., 8v8 synchronized strikes): accumulate!
        state.pendingVx = q(state.pendingVx + decomp.driveX * 0.65);
        state.pendingVy = q(Math.min(state.pendingVy, decomp.launchY));
        state.pendingOmega = q(clamp(state.pendingOmega + decomp.spinOmega * 0.5, -18, 18));
      }

      state.hasPendingImpulse = true;
      state.pendingMode = decomp.nextMode;
      state.hitstopTimer = q(Math.max(state.hitstopTimer, hitstopSec));
      state.hitstopTotal = q(Math.max(state.hitstopTotal, state.hitstopTimer));
      state.vibrationAmp = q(clamp(Math.sqrt(decomp.driveX * decomp.driveX + decomp.launchY * decomp.launchY) * 0.012, 2, 10));
      state.vibrationPhase = 0;

      return {
        buffered: true,
        hitstopSec: state.hitstopTimer,
        cornerReliefApplied: cornerReliefApplied,
        decomposition: decomp
      };
    }

    // Immediate release (zero hitstop)
    state.vx = additive ? q(state.vx + decomp.driveX) : decomp.driveX;
    state.vy = additive ? q(state.vy + decomp.launchY) : decomp.launchY;
    state.omega = additive ? q(clamp(state.omega + decomp.spinOmega, -18, 18)) : decomp.spinOmega;
    state.mode = decomp.nextMode;
    if (decomp.launchY < -80) {
      state.grounded = false;
    }

    return {
      buffered: false,
      hitstopSec: 0,
      cornerReliefApplied: cornerReliefApplied,
      decomposition: decomp
    };
  }

  // Step hit-stop freeze buffer; returns { frozen, released, vibX, vibY }
  function stepHitstopBuffer(state, dt) {
    var stepDt = dt || DEFAULT_STEP;
    if (state.hitstopTimer <= 0) {
      return { frozen: false, released: false, vibX: 0, vibY: 0 };
    }

    state.hitstopTimer = q(Math.max(0, state.hitstopTimer - stepDt));
    state.vibrationPhase = q(state.vibrationPhase + stepDt * 62);
    var decay = state.hitstopTotal > EPS ? clamp(state.hitstopTimer / state.hitstopTotal, 0, 1) : 0;
    var vibX = q(Math.sin(state.vibrationPhase) * state.vibrationAmp * decay);
    var vibY = q(Math.cos(state.vibrationPhase * 1.37) * state.vibrationAmp * 0.45 * decay);

    if (state.hitstopTimer <= 0) {
      // Release buffered momentum cleanly
      if (state.hasPendingImpulse) {
        state.vx = state.pendingVx;
        state.vy = state.pendingVy;
        state.omega = state.pendingOmega;
        state.mode = state.pendingMode;
        if (state.vy < -80) {
          state.grounded = false;
        }
      } else {
        state.vx = state.frozenVx;
        state.vy = state.frozenVy;
        state.omega = state.frozenOmega;
      }
      state.hasPendingImpulse = false;
      state.pendingVx = 0;
      state.pendingVy = 0;
      state.pendingOmega = 0;
      state.hitstopTotal = 0;
      state.vibrationAmp = 0;
      return { frozen: false, released: true, vibX: 0, vibY: 0 };
    }

    return { frozen: true, released: false, vibX: vibX, vibY: vibY };
  }

  // ==========================================================================
  // 5. WALL-SPLAT & WALL-REBOUND RESTITUTION SOLVER + CORNER-TRAP RELIEF
  // ==========================================================================

  function solveWallCollision(state, arenaBounds) {
    var bounds = arenaBounds || { minX: 40, maxX: 1160, wallMaterial: 'stone', cornerZone: 110 };
    var minX = (bounds.minX !== undefined ? bounds.minX : 40) + state.radius;
    var maxX = (bounds.maxX !== undefined ? bounds.maxX : 1160) - state.radius;
    var mat = getWallMaterial(bounds.wallMaterial);

    var hitSide = 0; // -1 = left wall, +1 = right wall
    if (state.x <= minX && state.vx < -10) {
      state.x = q(minX);
      hitSide = -1;
    } else if (state.x >= maxX && state.vx > 10) {
      state.x = q(maxX);
      hitSide = 1;
    }

    if (hitSide === 0) {
      return { hitWall: false, outcome: 'none' };
    }

    var normalSpeed = Math.abs(state.vx);
    var awayDir = -hitSide;

    // Increment corner-trap counter & refresh decay window
    state.cornerTrapCount = Math.min(8, state.cornerTrapCount + 1);
    state.cornerDecayTimer = q(1.65);

    // Check Corner-Trap Relief activation (prevents indefinite wall pinning in 1v1 & 8v8)
    var reliefTriggered = false;
    if (state.cornerTrapCount >= 3 || state.wallBouncesThisCombo >= state.maxWallBounces) {
      reliefTriggered = true;
      state.cornerReliefTimer = q(0.95);
      state.cornerTrapCount = 0;
      var reliefVx = q(awayDir * clamp(Math.max(240, normalSpeed * 0.58), 240, 420));
      var reliefVy = q(Math.min(state.vy * 0.35, -260));
      state.vx = reliefVx;
      state.vy = reliefVy;
      state.omega = q(awayDir * 5.2);
      state.grounded = false;
      state.mode = MODES.LAUNCHED;

      return {
        hitWall: true,
        wallSide: hitSide,
        outcome: 'corner_relief_escape',
        impactSpeed: q(normalSpeed),
        reboundVx: reliefVx,
        reboundVy: reliefVy,
        attackerPushbackVx: q(awayDir * 190),
        splatHoldSec: 0,
        reliefTriggered: true
      };
    }

    // High-speed impact -> Wall-Splat stick & delayed elastic rebound
    if (normalSpeed >= mat.splatThreshold && state.wallBouncesThisCombo < state.maxWallBounces) {
      state.wallBouncesThisCombo += 1;
      state.mode = MODES.WALL_SPLAT;
      state.wallSplatSide = hitSide;
      state.wallSplatTimer = q(mat.splatHoldSec);

      var reboundVx = q(awayDir * clamp(normalSpeed * mat.restitution * 0.65, 165, 390));
      var reboundVy = q(Math.min(state.vy * (1 - mat.tangentialFriction), mat.reboundLiftVy));
      state.wallReboundVx = reboundVx;
      state.wallReboundVy = reboundVy;
      state.vx = 0;
      state.vy = 0;
      state.omega = 0;
      state.grounded = false;

      return {
        hitWall: true,
        wallSide: hitSide,
        outcome: 'wall_splat',
        impactSpeed: q(normalSpeed),
        reboundVx: reboundVx,
        reboundVy: reboundVy,
        attackerPushbackVx: q(awayDir * 95),
        splatHoldSec: state.wallSplatTimer,
        reliefTriggered: false
      };
    }

    // Moderate impact -> immediate elastic wall-rebound with tangential wall friction
    var bounceVx = q(awayDir * normalSpeed * mat.restitution);
    var bounceVy = q(state.vy * (1 - mat.tangentialFriction));
    state.vx = bounceVx;
    state.vy = bounceVy;
    // Wall friction reverses / imparts spin based on tangential velocity
    state.omega = q(clamp(-state.omega * 0.55 + hitSide * bounceVy * 0.012, -16, 16));

    return {
      hitWall: true,
      wallSide: hitSide,
      outcome: 'wall_rebound',
      impactSpeed: q(normalSpeed),
      reboundVx: bounceVx,
      reboundVy: bounceVy,
      attackerPushbackVx: 0,
      splatHoldSec: 0,
      reliefTriggered: false
    };
  }

  // ==========================================================================
  // 6. GROUND-BOUNCE ELASTICITY & TUMBLE-FRICTION DECAY
  // ==========================================================================

  function solveGroundCollision(state, groundY, groundMaterialId) {
    var gY = groundY !== undefined ? groundY : 0;
    if (state.y < gY || state.vy < 0) {
      return { hitGround: false, outcome: 'airborne' };
    }

    var mat = getGroundMaterial(groundMaterialId);
    var impactVy = state.vy;
    state.y = q(gY);

    // Check elastic ground-bounce (when falling fast and bounce budget remains)
    var canBounce = state.mode === MODES.LAUNCHED &&
      impactVy >= mat.bounceThresholdVy &&
      state.groundBounces < state.maxGroundBounces;

    if (canBounce) {
      state.groundBounces += 1;
      // Progressive elasticity decay on consecutive bounces
      var bounceDecay = Math.pow(0.72, state.groundBounces - 1);
      var effRestitution = mat.restitution * bounceDecay;
      var nextVy = q(-impactVy * effRestitution);
      var nextVx = q(state.vx * (0.76 - (1 - mat.restitution) * 0.14));
      state.vy = nextVy;
      state.vx = nextVx;
      state.omega = q(clamp(state.vx * mat.spinTransfer, -14, 14));
      state.grounded = false;

      return {
        hitGround: true,
        outcome: 'ground_bounce',
        bounceNumber: state.groundBounces,
        impactVy: q(impactVy),
        reboundVy: nextVy,
        reboundVx: nextVx
      };
    }

    // Landing without bounce -> enter tumble if sliding fast, else clean touchdown
    state.vy = 0;
    state.grounded = true;
    state.juggleHits = 0;
    state.juggleGravityMul = 1.0;
    state.wallBouncesThisCombo = 0;

    if (Math.abs(state.vx) >= 135 && (state.mode === MODES.LAUNCHED || state.mode === MODES.BOUNCE_RECOVER)) {
      state.mode = MODES.TUMBLE;
      state.tumbleTimer = q(clamp(Math.abs(state.vx) / Math.max(180, mat.tumbleFriction), 0.16, 0.72));
      state.omega = q(clamp(state.vx * mat.spinTransfer * 1.25, -15, 15));
      return {
        hitGround: true,
        outcome: 'enter_tumble',
        bounceNumber: state.groundBounces,
        impactVy: q(impactVy),
        reboundVy: 0,
        reboundVx: state.vx
      };
    }

    state.groundBounces = 0;
    state.omega = 0;
    state.rot = 0;
    if (Math.abs(state.vx) > 25) {
      state.mode = MODES.SLIDE;
    } else {
      state.vx = 0;
      state.mode = MODES.NONE;
    }

    return {
      hitGround: true,
      outcome: 'landed',
      bounceNumber: 0,
      impactVy: q(impactVy),
      reboundVy: 0,
      reboundVx: state.vx
    };
  }

  function stepGroundFriction(state, dt, groundMaterialId) {
    var stepDt = dt || DEFAULT_STEP;
    var mat = getGroundMaterial(groundMaterialId);

    if (state.mode === MODES.TUMBLE) {
      // Combined Coulomb rolling friction + velocity-proportional tumble drag
      var decel = (mat.tumbleFriction + Math.abs(state.vx) * 1.85) * stepDt;
      if (Math.abs(state.vx) <= decel) {
        state.vx = 0;
        state.omega = 0;
      } else {
        state.vx = q(state.vx - signNonZero(state.vx) * decel);
        state.omega = q(state.vx * mat.spinTransfer);
      }
      state.rot = q(state.rot + state.omega * stepDt);
      state.tumbleTimer = q(Math.max(0, state.tumbleTimer - stepDt));

      if (state.tumbleTimer <= 0 && Math.abs(state.vx) < 28) {
        state.vx = 0;
        state.omega = 0;
        state.rot = 0;
        state.groundBounces = 0;
        state.mode = MODES.NONE;
      }
      return;
    }

    // Standard grounded slide friction
    if (Math.abs(state.vx) > 0.5) {
      var slideDecel = mat.slideFriction * stepDt;
      if (Math.abs(state.vx) <= slideDecel) {
        state.vx = 0;
        if (state.mode === MODES.SLIDE) state.mode = MODES.NONE;
      } else {
        state.vx = q(state.vx - signNonZero(state.vx) * slideDecel);
      }
    } else {
      state.vx = 0;
      if (state.mode === MODES.SLIDE) state.mode = MODES.NONE;
    }
  }

  // ==========================================================================
  // 7. INTEGRATED PER-FRAME KNOCKBACK STEPPER & TRAJECTORY PREDICTOR
  // ==========================================================================

  function stepKnockback(state, dt, arenaBounds) {
    var stepDt = dt || DEFAULT_STEP;
    var bounds = arenaBounds || {
      minX: 40,
      maxX: 1160,
      groundY: 0,
      wallMaterial: 'stone',
      groundMaterial: 'stone',
      cornerZone: 110
    };

    if (state.chainCooldown > 0) {
      state.chainCooldown = q(Math.max(0, state.chainCooldown - stepDt));
    }
    if (state.cornerReliefTimer > 0) {
      state.cornerReliefTimer = q(Math.max(0, state.cornerReliefTimer - stepDt));
    }
    if (state.cornerDecayTimer > 0) {
      state.cornerDecayTimer = q(Math.max(0, state.cornerDecayTimer - stepDt));
      if (state.cornerDecayTimer <= 0) state.cornerTrapCount = 0;
    }

    // 1. Hit-stop momentum freeze buffer
    var hs = stepHitstopBuffer(state, stepDt);
    if (hs.frozen) {
      return {
        x: state.x,
        y: state.y,
        vx: 0,
        vy: 0,
        rot: state.rot,
        mode: state.mode,
        frozen: true,
        vibX: hs.vibX,
        vibY: hs.vibY,
        wallEvent: null,
        groundEvent: null
      };
    }

    // 2. Wall-splat hold countdown & release
    if (state.mode === MODES.WALL_SPLAT) {
      state.wallSplatTimer = q(Math.max(0, state.wallSplatTimer - stepDt));
      if (state.wallSplatTimer <= 0) {
        state.vx = state.wallReboundVx;
        state.vy = state.wallReboundVy;
        state.omega = q(-state.wallSplatSide * 4.8);
        state.mode = MODES.LAUNCHED;
        state.grounded = false;
      } else {
        return {
          x: state.x,
          y: state.y,
          vx: 0,
          vy: 0,
          rot: state.rot,
          mode: state.mode,
          frozen: false,
          vibX: 0,
          vibY: 0,
          wallEvent: null,
          groundEvent: null
        };
      }
    }

    // 3. Airborne gravity & aerodynamic drag integration
    if (!state.grounded) {
      var effGravity = BASE_GRAVITY * state.gravityScale * state.juggleGravityMul;
      state.vy = q(state.vy + effGravity * stepDt);

      // Exponential aerodynamic drag
      var dragFactor = Math.exp(-state.airDrag * stepDt);
      state.vx = q(state.vx * dragFactor);
      state.rot = q(state.rot + state.omega * stepDt);
      state.omega = q(state.omega * Math.exp(-1.1 * stepDt));
    } else {
      stepGroundFriction(state, stepDt, bounds.groundMaterial);
    }

    // 4. Advance position
    state.x = q(state.x + state.vx * stepDt);
    state.y = q(state.y + state.vy * stepDt);

    // 5. Wall & ground collisions
    var wallEvent = solveWallCollision(state, bounds);
    var groundEvent = solveGroundCollision(state, bounds.groundY !== undefined ? bounds.groundY : 0, bounds.groundMaterial);

    return {
      x: state.x,
      y: state.y,
      vx: state.vx,
      vy: state.vy,
      rot: state.rot,
      mode: state.mode,
      frozen: false,
      vibX: 0,
      vibY: 0,
      wallEvent: wallEvent.hitWall ? wallEvent : null,
      groundEvent: groundEvent.hitGround ? groundEvent : null
    };
  }

  // Pure side-effect-free trajectory preview for AI spacing & debugging
  function predictTrajectory(state, maxSteps, dt, arenaBounds) {
    var sim = snapshotState(state);
    var steps = clamp(Math.round(maxSteps || 45), 1, 180);
    var stepDt = dt || DEFAULT_STEP;
    var points = [];
    var apexY = sim.y;
    var wallSplatPredicted = false;
    var landingX = sim.x;
    var landingFrame = -1;

    for (var i = 1; i <= steps; i++) {
      var res = stepKnockback(sim, stepDt, arenaBounds);
      points.push({ frame: i, x: res.x, y: res.y, vx: res.vx, vy: res.vy, mode: res.mode });
      if (res.y < apexY) apexY = res.y;
      if (res.wallEvent && res.wallEvent.outcome === 'wall_splat') wallSplatPredicted = true;
      if (res.groundEvent && landingFrame < 0 && res.groundEvent.outcome !== 'ground_bounce') {
        landingFrame = i;
        landingX = res.x;
      }
      if (res.mode === MODES.NONE && Math.abs(res.vx) < 1 && Math.abs(res.vy) < 1) {
        break;
      }
    }

    return {
      points: points,
      apexY: q(apexY),
      wallSplatPredicted: wallSplatPredicted,
      landingX: q(landingX),
      landingFrame: landingFrame
    };
  }

  // ==========================================================================
  // 8. RADIAL SHOCKWAVE & 8v8 CROWD CHAIN COLLISION SOLVERS
  // ==========================================================================

  // Distribute deterministic radial shockwave impulses across up to 16 fighters
  // (8v8 melee brawls), with smooth distance falloff, mass scaling, and optional
  // vortex pull vs outward blast.
  function solveRadialShockwave(origin, bodies, spec) {
    var cfg = spec || {};
    var ox = origin && origin.x !== undefined ? origin.x : 0;
    var oy = origin && origin.y !== undefined ? origin.y : -48;
    var radius = Math.max(20, cfg.radius || 220);
    var innerRadius = clamp(cfg.innerRadius || 30, 0, radius * 0.75);
    var peakImpulse = cfg.peakImpulse || 460;
    var upwardLift = cfg.upwardLift !== undefined ? cfg.upwardLift : -240;
    var isVortex = !!cfg.vortex;
    var sourceTeam = cfg.sourceTeam;
    var friendlyFire = !!cfg.friendlyFire;
    var excludeId = cfg.excludeFighterId;
    var hitstopSec = cfg.hitstopSec !== undefined ? cfg.hitstopSec : 0.05;

    // Sort bodies deterministically by fighterId so evaluation order never varies
    var list = (bodies || []).slice().sort(function (a, b) {
      return (a.fighterId || 0) - (b.fighterId || 0);
    });

    var results = [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b) continue;
      if (excludeId !== undefined && b.fighterId === excludeId) continue;
      if (!friendlyFire && sourceTeam !== undefined && b.team === sourceTeam) continue;

      var bx = b.x;
      var by = b.y - (b.height || 108) * 0.5;
      var dx = bx - ox;
      var dy = by - oy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      // Smooth inverse-falloff attenuation: 1.0 inside innerRadius -> 0.0 at radius
      var falloff = dist <= innerRadius
        ? 1.0
        : 1 - smoothstep(innerRadius, radius, dist);

      var dirX = dist > EPS ? dx / dist : signNonZero((b.fighterId % 2 === 0) ? 1 : -1);
      var dirY = dist > EPS ? dy / dist : -0.35;
      if (isVortex) {
        dirX = -dirX;
        dirY = -dirY * 0.5;
      }

      var horizImp = q(dirX * peakImpulse * falloff);
      var vertImp = q((dirY * peakImpulse * 0.40 + upwardLift) * falloff);

      var applied = null;
      if (cfg.apply !== false) {
        applied = applyImpactImpulse(b, {
          horizontalImpulse: horizImp,
          verticalImpulse: vertImp,
          hitHeight: (b.height || 108) * 0.52,
          hitstopSec: hitstopSec * (0.5 + 0.5 * falloff),
          additive: !!cfg.additive
        }, cfg.arenaBounds);
      }

      results.push({
        fighterId: b.fighterId,
        dist: q(dist),
        falloff: q(falloff),
        impulseX: horizImp,
        impulseY: vertImp,
        applied: applied
      });
    }

    return results;
  }

  // Domino / bowling-ball crowd collision solver for 8v8 brawls:
  // When a fast-moving launched or knocked-back fighter collides with another
  // fighter, transfers momentum via 2D elastic-inelastic impulse resolution.
  function solveCrowdChainCollisions(bodies, options) {
    var opts = options || {};
    var minTriggerSpeed = opts.minTriggerSpeed || 240;
    var restitution = clamp(opts.restitution !== undefined ? opts.restitution : 0.68, 0.1, 0.95);
    var friendlyDomino = opts.friendlyDomino !== undefined ? !!opts.friendlyDomino : true;
    var cooldownSec = opts.cooldownSec || 0.18;

    var list = (bodies || []).slice().sort(function (a, b) {
      return (a.fighterId || 0) - (b.fighterId || 0);
    });

    var events = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || a.hitstopTimer > 0 || a.chainCooldown > 0) continue;

      for (var j = i + 1; j < list.length; j++) {
        var b = list[j];
        if (!b || b.hitstopTimer > 0 || b.chainCooldown > 0) continue;
        if (!friendlyDomino && a.team === b.team) continue;

        // Only trigger chain knockback if at least one body is actively flying/sliding fast
        var speedA = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
        var speedB = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        var aKnock = a.mode === MODES.LAUNCHED || a.mode === MODES.SLIDE || a.mode === MODES.TUMBLE;
        var bKnock = b.mode === MODES.LAUNCHED || b.mode === MODES.SLIDE || b.mode === MODES.TUMBLE;
        if (!(aKnock && speedA >= minTriggerSpeed) && !(bKnock && speedB >= minTriggerSpeed)) {
          continue;
        }

        // Capsule-center distance test
        var ax = a.x, ay = a.y - a.height * 0.5;
        var bx = b.x, by = b.y - b.height * 0.5;
        var dx = bx - ax;
        var dy = by - ay;
        var minDist = a.radius + b.radius + 4;
        var distSq = dx * dx + dy * dy;
        if (distSq > minDist * minDist) continue;

        var dist = Math.sqrt(distSq);
        var nx = dist > EPS ? dx / dist : signNonZero(a.vx || 1);
        var ny = dist > EPS ? dy / dist : 0;

        // Relative velocity along collision normal
        var rvx = b.vx - a.vx;
        var rvy = b.vy - a.vy;
        var velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal > 0) continue; // already separating

        var invMassA = 1 / Math.max(20, a.mass);
        var invMassB = 1 / Math.max(20, b.mass);
        var impulseScalar = -(1 + restitution) * velAlongNormal / (invMassA + invMassB);

        var ix = impulseScalar * nx;
        var iy = impulseScalar * ny;

        a.vx = q(a.vx - ix * invMassA);
        a.vy = q(a.vy - iy * invMassA);
        b.vx = q(b.vx + ix * invMassB);
        b.vy = q(b.vy + iy * invMassB);

        // Ensure struck bystander gets a crisp pop/slide reaction
        if (!bKnock && Math.abs(ix * invMassB) >= 95) {
          b.mode = Math.abs(b.vy) > 120 ? MODES.LAUNCHED : MODES.SLIDE;
          if (b.vy < -80) b.grounded = false;
          b.omega = q(clamp(nx * Math.abs(impulseScalar) * 0.00035, -12, 12));
        }
        if (!aKnock && Math.abs(ix * invMassA) >= 95) {
          a.mode = Math.abs(a.vy) > 120 ? MODES.LAUNCHED : MODES.SLIDE;
          if (a.vy < -80) a.grounded = false;
          a.omega = q(clamp(-nx * Math.abs(impulseScalar) * 0.00035, -12, 12));
        }

        // Separate overlap deterministically
        var overlapDepth = Math.max(0, minDist - dist);
        if (overlapDepth > 0) {
          var sepRatioA = invMassA / (invMassA + invMassB);
          var sepRatioB = invMassB / (invMassA + invMassB);
          a.x = q(a.x - nx * overlapDepth * sepRatioA);
          b.x = q(b.x + nx * overlapDepth * sepRatioB);
        }

        a.chainCooldown = q(cooldownSec);
        b.chainCooldown = q(cooldownSec);

        events.push({
          fighterA: a.fighterId,
          fighterB: b.fighterId,
          contactX: q((ax + bx) * 0.5),
          contactY: q((ay + by) * 0.5),
          impulseMag: q(Math.abs(impulseScalar)),
          normalX: q(nx),
          normalY: q(ny)
        });
      }
    }

    return events;
  }

  // Export public API onto RYPhysics.Knockback
  RY.Knockback = {
    VERSION: '1.0.0',
    MODES: MODES,
    WALL_MATERIALS: WALL_MATERIALS,
    GROUND_MATERIALS: GROUND_MATERIALS,
    BODY_CLASSES: BODY_CLASSES,
    getWallMaterial: getWallMaterial,
    getGroundMaterial: getGroundMaterial,
    createState: createState,
    resetState: resetState,
    snapshotState: snapshotState,
    restoreState: restoreState,
    computeMassScale: computeMassScale,
    decomposeImpactImpulse: decomposeImpactImpulse,
    applyImpactImpulse: applyImpactImpulse,
    stepHitstopBuffer: stepHitstopBuffer,
    solveWallCollision: solveWallCollision,
    solveGroundCollision: solveGroundCollision,
    stepGroundFriction: stepGroundFriction,
    stepKnockback: stepKnockback,
    predictTrajectory: predictTrajectory,
    solveRadialShockwave: solveRadialShockwave,
    solveCrowdChainCollisions: solveCrowdChainCollisions
  };
})(RYPhysics);
