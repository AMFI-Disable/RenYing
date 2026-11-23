// ============================================================================
// RenYing Martial Arts Physics — Module 05: Dynamic Balance, Footwork & Stagger
// Rollback-deterministic stance stability, inverted-pendulum CoG tipping torque,
// poise & hyper-armor absorption, micro/heavy/stumble state machine,
// guard-posture & perfect-guard deflection torque, sweep/ankle-break solver,
// and recovery-frame footwork acceleration curves.
// ============================================================================

var RYPhysics = (typeof window !== 'undefined' ? (window.RYPhysics = window.RYPhysics || {}) : {});

(function (RY) {
  'use strict';

  var QUANT = 10000;
  var PI = 3.141592653589793;
  var DEFAULT_STEP = 1 / 60;
  var GRAVITY_PX = 980;
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
  // 1. MARTIAL ARTS STANCE & FOOTWORK PROFILES
  // ==========================================================================
  // baseHalfWidth: half-span of the fighter's foot support polygon (px)
  // cogHeight: center-of-gravity elevation above ground (px)
  // balanceRegen: stance stability recovery rate (pts/sec)
  // postureRegen: guard stability recovery rate (pts/sec)
  // poiseMul: effective poise resilience multiplier
  // sweepResist: resistance against low-line ankle sweeps
  // tippingDamp: rotational damping applied to body lean velocity
  // restoringK: muscular CoG restoring spring stiffness (1/s^2)

  var STANCE_PROFILES = {
    neutral: {
      id: 'neutral',
      baseHalfWidth: 20,
      cogHeight: 62,
      balanceRegen: 22,
      postureRegen: 26,
      poiseMul: 1.00,
      sweepResist: 1.00,
      tippingDamp: 7.5,
      restoringK: 42.0,
      forwardBias: 0
    },
    rooted: {
      id: 'rooted',
      baseHalfWidth: 29,
      cogHeight: 48,
      balanceRegen: 30,
      postureRegen: 32,
      poiseMul: 1.42,
      sweepResist: 1.55,
      tippingDamp: 10.5,
      restoringK: 64.0,
      forwardBias: 0
    },
    guard: {
      id: 'guard',
      baseHalfWidth: 25,
      cogHeight: 54,
      balanceRegen: 16,
      postureRegen: 10,
      poiseMul: 1.25,
      sweepResist: 1.18,
      tippingDamp: 9.2,
      restoringK: 56.0,
      forwardBias: -4
    },
    attack_lunge: {
      id: 'attack_lunge',
      baseHalfWidth: 22,
      cogHeight: 60,
      balanceRegen: 6,
      postureRegen: 12,
      poiseMul: 1.08,
      sweepResist: 0.78,
      tippingDamp: 5.8,
      restoringK: 34.0,
      forwardBias: 11
    },
    dash_lean: {
      id: 'dash_lean',
      baseHalfWidth: 16,
      cogHeight: 58,
      balanceRegen: 4,
      postureRegen: 14,
      poiseMul: 0.72,
      sweepResist: 0.58,
      tippingDamp: 4.5,
      restoringK: 26.0,
      forwardBias: 14
    },
    airborne: {
      id: 'airborne',
      baseHalfWidth: 8,
      cogHeight: 66,
      balanceRegen: 0,
      postureRegen: 18,
      poiseMul: 0.65,
      sweepResist: 0.25,
      tippingDamp: 2.2,
      restoringK: 4.0,
      forwardBias: 0
    },
    drunk_sway: {
      id: 'drunk_sway',
      baseHalfWidth: 24,
      cogHeight: 56,
      balanceRegen: 20,
      postureRegen: 22,
      poiseMul: 1.12,
      sweepResist: 1.15,
      tippingDamp: 6.2,
      restoringK: 38.0,
      forwardBias: 0
    }
  };

  var STAGGER_STATES = {
    STABLE: 'stable',
    MICRO: 'micro_stagger',
    HEAVY: 'heavy_stagger',
    STUMBLE: 'stumble',
    TRIPPED: 'tripped',
    GUARD_BROKEN: 'guard_broken',
    RECOVERING: 'recovering'
  };

  var SURFACE_PRESETS = {
    stone: { friction: 1.00, gripRestore: 1.00, slipThreshold: 210 },
    wood: { friction: 0.92, gripRestore: 0.96, slipThreshold: 195 },
    sand: { friction: 0.78, gripRestore: 0.85, slipThreshold: 170 },
    mud: { friction: 0.62, gripRestore: 0.72, slipThreshold: 145 },
    ice: { friction: 0.30, gripRestore: 0.45, slipThreshold: 95 }
  };

  function getStanceProfile(stanceId) {
    if (stanceId && STANCE_PROFILES[stanceId]) return STANCE_PROFILES[stanceId];
    return STANCE_PROFILES.neutral;
  }

  function getSurfacePreset(surfaceId) {
    if (surfaceId && SURFACE_PRESETS[surfaceId]) return SURFACE_PRESETS[surfaceId];
    return SURFACE_PRESETS.stone;
  }

  // ==========================================================================
  // 2. ROLLBACK-DETERMINISTIC BALANCE STATE MANAGEMENT
  // ==========================================================================

  function createState(options) {
    var opts = options || {};
    var maxBal = opts.maxBalance || 100;
    var maxPoise = opts.maxPoise || 100;
    var maxPosture = opts.maxPosture || 100;

    return {
      fighterId: opts.fighterId || 0,
      mass: q(opts.mass || 68),
      size: q(opts.size || 1.0),
      stance: opts.stance || 'neutral',
      surface: opts.surface || 'stone',
      grounded: opts.grounded !== undefined ? !!opts.grounded : true,
      face: signNonZero(opts.face !== undefined ? opts.face : 1),

      // Core stability meters (0..100)
      balance: q(maxBal),
      maxBalance: q(maxBal),
      balanceRegenDelay: 0,

      poise: q(maxPoise),
      maxPoise: q(maxPoise),
      poiseRegenDelay: 0,
      hyperArmorLevel: 0, // 0=none, 1=light, 2=heavy, 3=super

      posture: q(maxPosture),
      maxPosture: q(maxPosture),
      postureRegenDelay: 0,
      guardActive: false,
      guardHoldTime: 0,
      perfectGuardWindow: q(opts.perfectGuardWindow || 0.115),
      riposteWindow: 0,

      // Inverted-pendulum Center-of-Gravity dynamics
      cogOffsetX: 0,     // px relative to support base center (+ = world right)
      cogVelX: 0,        // px/s
      leanAngle: 0,      // radians (+ = leaning right, - = leaning left)
      leanVel: 0,        // rad/s
      swayPhase: 0,      // deterministic phase accumulator for drunk_sway

      // Ankle / low-line sweep destabilization
      ankleStrain: 0,    // 0..100
      footSlipVel: 0,    // px/s instantaneous foot slide

      // Stagger & recovery state machine
      staggerState: STAGGER_STATES.STABLE,
      staggerTimer: 0,
      staggerDuration: 0,
      staggerDir: 0,
      stumbleSteps: 0,
      stumbleStepTimer: 0,
      stumbleDriftVx: 0,

      // Recovery-frame acceleration state
      recoveryTimer: 0,
      recoveryDuration: 0,
      recoveryCurve: 'standard',
      lastTransitionReason: 'init'
    };
  }

  function resetState(state) {
    state.balance = state.maxBalance;
    state.balanceRegenDelay = 0;
    state.poise = state.maxPoise;
    state.poiseRegenDelay = 0;
    state.hyperArmorLevel = 0;
    state.posture = state.maxPosture;
    state.postureRegenDelay = 0;
    state.guardActive = false;
    state.guardHoldTime = 0;
    state.riposteWindow = 0;
    state.cogOffsetX = 0;
    state.cogVelX = 0;
    state.leanAngle = 0;
    state.leanVel = 0;
    state.swayPhase = 0;
    state.ankleStrain = 0;
    state.footSlipVel = 0;
    state.staggerState = STAGGER_STATES.STABLE;
    state.staggerTimer = 0;
    state.staggerDuration = 0;
    state.staggerDir = 0;
    state.stumbleSteps = 0;
    state.stumbleStepTimer = 0;
    state.stumbleDriftVx = 0;
    state.recoveryTimer = 0;
    state.recoveryDuration = 0;
    state.recoveryCurve = 'standard';
    state.lastTransitionReason = 'reset';
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
  // 3. CENTER-OF-GRAVITY (CoG) TIPPING TORQUE & INVERTED PENDULUM SOLVER
  // ==========================================================================

  // Compute Zero-Moment Point (ZMP) stability margin in [-inf .. 1.0].
  // 1.0 = perfectly centered; 0.0 = right on edge of foot support base; <0 = tipping over.
  function computeZmpMargin(state) {
    var prof = getStanceProfile(state.stance);
    var halfBase = Math.max(4, prof.baseHalfWidth * state.size);
    var normOffset = Math.abs(state.cogOffsetX) / halfBase;
    return q(1 - normOffset);
  }

  // Compute tipping torque (N*m equivalent) produced by a directional impact
  // impulse (impulseX, impulseY) applied at vertical height hitHeight (0=feet .. 112=head).
  function computeTippingTorque(state, impulseX, impulseY, hitHeight) {
    var prof = getStanceProfile(state.stance);
    var cogH = prof.cogHeight * state.size;
    var h = clamp(hitHeight !== undefined ? hitHeight : cogH, 0, 120 * state.size);

    // Lever arm above ankle pivot:
    // - High strikes (head/chest, h > cogH) exert strong backward toppling torque
    // - Mid strikes (h ~ cogH) drive translational push + moderate tipping
    // - Low strikes (ankles/shins, h < 28) undercut the base in opposite rotational sense
    var leverHeight = (h - 14 * state.size) * 0.01; // convert px -> meters
    var horizTorque = impulseX * leverHeight * 0.028;

    // Vertical impulse creates overturning moment if CoG is already offset
    var cogM = state.cogOffsetX * 0.01;
    var vertTorque = -impulseY * cogM * 0.018;

    // Rotational inertia of human body about ankle pivot I ~ m * h_cog^2 * 1.15
    var hM = Math.max(0.25, cogH * 0.01);
    var inertia = Math.max(8, state.mass * hM * hM * 1.15);

    var totalTorque = horizTorque + vertTorque;
    var angularImpulse = totalTorque / inertia; // rad/s delta to leanVel
    var cogVelImpulse = (impulseX / Math.max(20, state.mass)) * (0.45 + 0.55 * (h / Math.max(1, cogH)));

    return {
      torque: q(totalTorque),
      angularImpulse: q(angularImpulse),
      cogVelImpulse: q(cogVelImpulse),
      leverHeight: q(leverHeight),
      inertia: q(inertia),
      isHighStrike: h >= cogH * 1.25,
      isLowStrike: h <= 28 * state.size
    };
  }

  // Step inverted-pendulum CoG & body lean dynamics for one deterministic frame
  function stepCoGDynamics(state, dt, inputAccelX) {
    var stepDt = dt || DEFAULT_STEP;
    var prof = getStanceProfile(state.stance);
    var surf = getSurfacePreset(state.surface);
    var halfBase = Math.max(4, prof.baseHalfWidth * state.size);
    var cogH = Math.max(24, prof.cogHeight * state.size);

    // Desired CoG resting offset (stance bias + optional drunken sway oscillation)
    var targetOffset = prof.forwardBias * state.face * state.size;
    if (state.stance === 'drunk_sway') {
      state.swayPhase = q((state.swayPhase + stepDt * 3.4) % (2 * PI));
      targetOffset += Math.sin(state.swayPhase) * 9.5 * state.size;
    }

    // Footwork acceleration shifts inertial CoG backward slightly (d'Alembert force)
    var footAccel = inputAccelX || 0;
    var inertialShiftAccel = -footAccel * 0.16;

    // Can the fighter actively brace with muscular restoring force?
    var canBrace = state.grounded &&
      state.staggerState !== STAGGER_STATES.HEAVY &&
      state.staggerState !== STAGGER_STATES.TRIPPED &&
      state.staggerState !== STAGGER_STATES.GUARD_BROKEN;

    var gripScale = surf.gripRestore * (0.45 + 0.55 * clamp(state.balance / state.maxBalance, 0, 1));
    var braceMul = canBrace ? gripScale : 0.12;

    // Spring-damper restoring CoG toward targetOffset
    var errX = state.cogOffsetX - targetOffset;
    var restoreAccelX = -prof.restoringK * braceMul * errX - prof.tippingDamp * state.cogVelX;

    // Gravity overturning destabilization when CoG crosses outside support base
    var overshoot = Math.max(0, Math.abs(state.cogOffsetX) - halfBase);
    var gravityToppleX = 0;
    if (overshoot > 0 && state.grounded) {
      gravityToppleX = signNonZero(state.cogOffsetX) * (GRAVITY_PX * (overshoot / cogH) * 0.68);
    }

    var totalCogAccel = restoreAccelX + gravityToppleX + inertialShiftAccel;
    state.cogVelX = q(clamp(state.cogVelX + totalCogAccel * stepDt, -480, 480));
    state.cogOffsetX = q(clamp(state.cogOffsetX + state.cogVelX * stepDt, -halfBase * 2.4, halfBase * 2.4));

    // Synchronize angular lean dynamics with CoG displacement
    var targetLean = Math.atan2(state.cogOffsetX, cogH);
    var leanRestore = -prof.restoringK * 0.65 * braceMul * (state.leanAngle - targetLean) - prof.tippingDamp * state.leanVel;
    var gravityLean = state.grounded ? (GRAVITY_PX / cogH) * Math.sin(state.leanAngle) * (overshoot > 0 ? 0.55 : 0.10) : 0;

    state.leanVel = q(clamp(state.leanVel + (leanRestore + gravityLean) * stepDt, -14, 14));
    state.leanAngle = q(clamp(state.leanAngle + state.leanVel * stepDt, -1.35, 1.35));

    // Decay foot slip velocity via Coulomb surface friction
    if (Math.abs(state.footSlipVel) > 0.5) {
      var fricDecel = GRAVITY_PX * surf.friction * 0.85 * stepDt;
      if (Math.abs(state.footSlipVel) <= fricDecel) {
        state.footSlipVel = 0;
      } else {
        state.footSlipVel = q(state.footSlipVel - signNonZero(state.footSlipVel) * fricDecel);
      }
    } else {
      state.footSlipVel = 0;
    }

    return {
      cogOffsetX: state.cogOffsetX,
      leanAngle: state.leanAngle,
      zmpMargin: computeZmpMargin(state),
      overshoot: q(overshoot)
    };
  }

  // ==========================================================================
  // 4. POISE & HYPER-ARMOR ABSORPTION SOLVER
  // ==========================================================================

  function solvePoiseAbsorption(state, poiseDamage, impactTier) {
    var prof = getStanceProfile(state.stance);
    var tier = impactTier !== undefined ? impactTier : 1; // 1=light, 2=heavy, 3=ult/unstoppable
    var rawDmg = Math.max(0, poiseDamage || 0);
    var effectiveDmg = rawDmg / Math.max(0.4, prof.poiseMul);

    // Hyper-armor level attenuates poise damage unless incoming tier breaks armor class
    var armor = state.hyperArmorLevel || 0;
    var armorIntact = armor > 0 && tier <= armor;
    var armorAttenuation = 1.0;

    if (armorIntact) {
      armorAttenuation = armor >= 3 ? 0.18 : (armor === 2 ? 0.42 : 0.68);
    } else if (armor > 0 && tier > armor) {
      // Armor-piercing hit cracks hyper-armor with bonus shatter
      armorAttenuation = 1.25;
    }

    var appliedPoiseDmg = q(effectiveDmg * armorAttenuation);
    var prevPoise = state.poise;
    state.poise = q(Math.max(0, state.poise - appliedPoiseDmg));
    state.poiseRegenDelay = q(Math.max(state.poiseRegenDelay, 0.85));

    var poiseBroken = state.poise <= 0;
    var absorbed = !poiseBroken && (armorIntact || appliedPoiseDmg < state.maxPoise * 0.28);

    // Even when poise absorbs a hit, heavy kinetic shock still chips balance slightly
    var chipBalanceDrain = absorbed ? q(appliedPoiseDmg * (armorIntact ? 0.22 : 0.38)) : 0;
    if (chipBalanceDrain > 0) {
      state.balance = q(Math.max(5, state.balance - chipBalanceDrain));
      state.balanceRegenDelay = q(Math.max(state.balanceRegenDelay, 0.45));
    }

    // Overflow damage carries into stagger severity when poise shatters
    var overflow = poiseBroken ? q(Math.max(0, appliedPoiseDmg - prevPoise)) : 0;

    if (poiseBroken && armor > 0 && tier >= armor) {
      state.hyperArmorLevel = 0;
    }

    return {
      absorbed: absorbed,
      poiseBroken: poiseBroken,
      armorIntact: armorIntact && !poiseBroken,
      armorCracked: armor > 0 && (poiseBroken || tier > armor),
      appliedPoiseDmg: appliedPoiseDmg,
      poiseRemaining: state.poise,
      overflow: overflow,
      chipBalanceDrain: chipBalanceDrain,
      damageReductionMul: armorIntact ? (armor >= 3 ? 0.65 : (armor === 2 ? 0.78 : 0.88)) : 1.0
    };
  }

  // ==========================================================================
  // 5. GUARD-STABILITY POSTURE DRAIN & PERFECT-GUARD DEFLECTION TORQUE
  // ==========================================================================

  function solveGuardImpact(state, impact) {
    var imp = impact || {};
    var impulseX = imp.impulseX || 0;
    var impulseY = imp.impulseY || 0;
    var guardBreakMul = imp.guardBreakMul !== undefined ? imp.guardBreakMul : 1.0;
    var hitHeight = imp.hitHeight !== undefined ? imp.hitHeight : 64 * state.size;
    var unblockable = !!imp.unblockable;

    if (unblockable) {
      state.guardActive = false;
      state.posture = q(Math.max(0, state.posture - 35));
      return {
        blocked: false,
        perfectGuard: false,
        guardBroken: false,
        unblockableBypass: true,
        postureDrain: 35,
        postureRemaining: state.posture,
        pushbackVx: 0,
        blockstunSec: 0,
        deflectionTorque: 0,
        attackerRecoilVx: 0,
        attackerBalanceDrain: 0,
        attackerStaggerSec: 0,
        riposteWindowSec: 0
      };
    }

    var isPerfect = state.guardActive && state.guardHoldTime <= state.perfectGuardWindow;
    var impMag = Math.sqrt(impulseX * impulseX + impulseY * impulseY);
    var dir = signNonZero(impulseX || -state.face);

    if (isPerfect) {
      // Perfect Guard / Just Defend:
      // Zero posture loss, restores posture & balance, redirects rotational deflection
      // torque back into the attacker's weapon arm to open a riposte window.
      var postureGain = 14;
      var balanceGain = 12;
      state.posture = q(Math.min(state.maxPosture, state.posture + postureGain));
      state.balance = q(Math.min(state.maxBalance, state.balance + balanceGain));
      state.cogOffsetX = q(state.cogOffsetX * 0.35);
      state.cogVelX = 0;
      state.leanVel = 0;
      state.riposteWindow = q(0.32);

      var deflectionTorque = q(clamp(impMag * 0.085 * (imp.parryRecoil || 1.0), 8, 52));
      var attackerRecoilVx = q(-dir * clamp(impMag * 0.58 * (imp.parryRecoil || 1.0), 130, 340));
      var attackerBalanceDrain = q(clamp(16 + impMag * 0.045, 16, 38));
      var attackerStaggerSec = q(clamp(0.24 + impMag * 0.00045, 0.24, 0.46));

      return {
        blocked: true,
        perfectGuard: true,
        guardBroken: false,
        unblockableBypass: false,
        postureDrain: 0,
        postureGain: postureGain,
        postureRemaining: state.posture,
        pushbackVx: q(dir * clamp(impMag * 0.14, 24, 75)),
        blockstunSec: 0.05,
        deflectionTorque: deflectionTorque,
        attackerRecoilVx: attackerRecoilVx,
        attackerBalanceDrain: attackerBalanceDrain,
        attackerStaggerSec: attackerStaggerSec,
        riposteWindowSec: state.riposteWindow
      };
    }

    // Standard braced guard: posture drain rises when fighter's balance is already shaken
    var instabilityFactor = 1 + (1 - clamp(state.balance / state.maxBalance, 0, 1)) * 0.48;
    var baseDrain = (10 + impMag * 0.068) * guardBreakMul * instabilityFactor;
    var postureDrain = q(clamp(baseDrain, 4, 85));

    state.posture = q(Math.max(0, state.posture - postureDrain));
    state.postureRegenDelay = q(Math.max(state.postureRegenDelay, 0.95));

    // Braced CoG rock & guard pushback
    var tip = computeTippingTorque(state, impulseX * 0.45, impulseY * 0.30, hitHeight);
    state.cogVelX = q(state.cogVelX + tip.cogVelImpulse * 0.55);
    state.leanVel = q(state.leanVel + tip.angularImpulse * 0.42);
    state.balance = q(Math.max(0, state.balance - postureDrain * 0.28));
    state.balanceRegenDelay = q(Math.max(state.balanceRegenDelay, 0.55));

    var surf = getSurfacePreset(state.surface);
    var pushbackVx = q(dir * clamp((impMag * 0.52) / Math.max(0.45, Math.sqrt(surf.friction)), 55, 290));
    var blockstunSec = q(clamp(0.10 + postureDrain * 0.0045, 0.10, 0.34));

    if (state.posture <= 0) {
      // Guard Break!
      state.guardActive = false;
      state.staggerState = STAGGER_STATES.GUARD_BROKEN;
      state.staggerDuration = q(0.68);
      state.staggerTimer = state.staggerDuration;
      state.staggerDir = dir;
      state.balance = q(Math.min(state.balance, 18));
      state.cogVelX = q(state.cogVelX + dir * 165);
      state.leanVel = q(state.leanVel + dir * 3.8);
      state.lastTransitionReason = 'guard_broken';

      return {
        blocked: true,
        perfectGuard: false,
        guardBroken: true,
        unblockableBypass: false,
        postureDrain: postureDrain,
        postureRemaining: 0,
        pushbackVx: q(pushbackVx * 1.35),
        blockstunSec: state.staggerDuration,
        deflectionTorque: 0,
        attackerRecoilVx: 0,
        attackerBalanceDrain: 0,
        attackerStaggerSec: 0,
        riposteWindowSec: 0
      };
    }

    return {
      blocked: true,
      perfectGuard: false,
      guardBroken: false,
      unblockableBypass: false,
      postureDrain: postureDrain,
      postureRemaining: state.posture,
      pushbackVx: pushbackVx,
      blockstunSec: blockstunSec,
      deflectionTorque: 0,
      attackerRecoilVx: q(-dir * clamp(impMag * 0.12, 18, 65)),
      attackerBalanceDrain: 0,
      attackerStaggerSec: 0,
      riposteWindowSec: 0
    };
  }

  // ==========================================================================
  // 6. ANKLE-BREAK / SWEEP TRIP SOLVER
  // ==========================================================================

  function solveSweepTrip(state, sweepImpulseX, options) {
    var opts = options || {};
    var prof = getStanceProfile(state.stance);
    var surf = getSurfacePreset(state.surface);
    var dir = signNonZero(sweepImpulseX || -state.face);
    var mag = Math.abs(sweepImpulseX || 0);

    // Threshold to break foot-ground static friction & stance root
    var frictionForce = (state.mass / 68) * surf.slipThreshold * prof.sweepResist;
    var balanceFactor = 0.55 + 0.45 * clamp(state.balance / state.maxBalance, 0, 1);
    var effectiveThreshold = frictionForce * balanceFactor;

    // Accumulate ankle strain from low hits
    var strainGain = q(clamp((mag / Math.max(40, effectiveThreshold)) * 52, 10, 75));
    state.ankleStrain = q(clamp(state.ankleStrain + strainGain, 0, 100));

    // Foot undercut rotates the torso in the OPPOSITE direction of the foot sweep!
    // (Sweeping feet forward causes fighter to pitch backward onto their back.)
    var toppleDir = -dir;
    var slipRatio = mag / Math.max(25, effectiveThreshold);
    var tripped = false;

    if (!state.grounded) {
      // Airborne low clips spin the body rather than ground-tripping
      state.leanVel = q(state.leanVel + toppleDir * clamp(slipRatio * 4.5, 1.5, 8.5));
      return {
        tripped: false,
        airborneSpin: true,
        slipRatio: q(slipRatio),
        ankleStrain: state.ankleStrain,
        footSlipVel: 0,
        toppleAngularVel: state.leanVel,
        balanceDrain: q(strainGain * 0.35),
        staggerState: state.staggerState
      };
    }

    // Check hyper-armor resistance against sweeps
    if (state.hyperArmorLevel >= 2 && !(opts.unstoppableSweep)) {
      state.balance = q(Math.max(10, state.balance - strainGain * 0.30));
      state.footSlipVel = q(dir * clamp(mag * 0.22, 20, 95));
      return {
        tripped: false,
        armorResisted: true,
        slipRatio: q(slipRatio),
        ankleStrain: state.ankleStrain,
        footSlipVel: state.footSlipVel,
        toppleAngularVel: 0,
        balanceDrain: q(strainGain * 0.30),
        staggerState: state.staggerState
      };
    }

    var tripScore = slipRatio + (state.ankleStrain / 100) * 0.45 + (computeZmpMargin(state) < 0.25 ? 0.35 : 0);
    tripped = tripScore >= 1.15 || !!opts.forceTrip;

    state.footSlipVel = q(dir * clamp(mag * (0.55 + (1 - surf.friction) * 0.55), 70, 360));
    state.cogVelX = q(state.cogVelX + toppleDir * clamp(mag * 0.48, 45, 220));
    state.leanVel = q(state.leanVel + toppleDir * clamp(slipRatio * 5.2, 2.2, 10.5));

    var balDrain = q(clamp(strainGain * (tripped ? 0.85 : 0.55), 8, 52));
    state.balance = q(Math.max(0, state.balance - balDrain));
    state.balanceRegenDelay = q(Math.max(state.balanceRegenDelay, 0.90));

    if (tripped) {
      state.staggerState = STAGGER_STATES.TRIPPED;
      state.staggerDuration = q(clamp(0.46 + slipRatio * 0.14, 0.46, 0.72));
      state.staggerTimer = state.staggerDuration;
      state.staggerDir = toppleDir;
      state.ankleStrain = 0;
      state.lastTransitionReason = 'ankle_sweep_trip';
    } else if (tripScore >= 0.78) {
      enterStumble(state, toppleDir, clamp(Math.round(tripScore * 2), 1, 3), mag * 0.45, 'ankle_buckled');
    }

    return {
      tripped: tripped,
      tripScore: q(tripScore),
      slipRatio: q(slipRatio),
      ankleStrain: state.ankleStrain,
      footSlipVel: state.footSlipVel,
      toppleAngularVel: state.leanVel,
      balanceDrain: balDrain,
      staggerState: state.staggerState,
      staggerDuration: state.staggerDuration
    };
  }

  // ==========================================================================
  // 7. STAGGER STATE MACHINE (Micro / Heavy / Stumble / Recovery)
  // ==========================================================================

  function enterStumble(state, dir, steps, driftVx, reason) {
    state.staggerState = STAGGER_STATES.STUMBLE;
    state.staggerDir = signNonZero(dir);
    state.stumbleSteps = clamp(Math.round(steps || 2), 1, 3);
    state.stumbleStepTimer = q(0.14);
    state.staggerDuration = q(state.stumbleSteps * 0.14 + 0.08);
    state.staggerTimer = state.staggerDuration;
    state.stumbleDriftVx = q(state.staggerDir * clamp(Math.abs(driftVx || 110), 65, 220));
    state.lastTransitionReason = reason || 'off_balance_stumble';
  }

  function enterRecovery(state, durationSec, curveType, reason) {
    state.staggerState = STAGGER_STATES.RECOVERING;
    state.recoveryDuration = q(Math.max(0.06, durationSec || 0.18));
    state.recoveryTimer = state.recoveryDuration;
    state.recoveryCurve = curveType || 'standard';
    state.staggerTimer = 0;
    state.staggerDuration = 0;
    state.lastTransitionReason = reason || 'recovering';
  }

  // Primary entry point when a fighter takes an unblocked (or guard-checked) directional hit.
  // Integrates guard solver -> sweep solver -> poise/hyper-armor -> CoG tipping -> stagger FSM.
  function applyDirectionalImpact(state, impact) {
    var imp = impact || {};
    var impulseX = imp.impulseX || 0;
    var impulseY = imp.impulseY || 0;
    var hitHeight = imp.hitHeight !== undefined ? imp.hitHeight : 64 * state.size;
    var poiseDamage = imp.poiseDamage !== undefined ? imp.poiseDamage : Math.abs(impulseX) * 0.18;
    var impactTier = imp.impactTier !== undefined ? imp.impactTier : 1;
    var dir = signNonZero(impulseX || -state.face);

    // 1. Check active guard first (unless hit is low-sweep bypassing high guard or unblockable)
    var isLowSweep = !!imp.isSweep || hitHeight <= 24 * state.size;
    if (state.guardActive && state.grounded && !(isLowSweep && imp.breaksHighGuard)) {
      var guardRes = solveGuardImpact(state, imp);
      if (guardRes.blocked) {
        return {
          outcome: guardRes.perfectGuard ? 'perfect_guard' : (guardRes.guardBroken ? 'guard_broken' : 'guarded'),
          guard: guardRes,
          poise: null,
          sweep: null,
          tipping: null,
          staggerState: state.staggerState,
          staggerDuration: state.staggerDuration,
          zmpMargin: computeZmpMargin(state)
        };
      }
    }

    // 2. Low-line sweep / ankle-break evaluation
    if (isLowSweep && Math.abs(impulseX) >= 60) {
      var sweepRes = solveSweepTrip(state, impulseX, imp);
      if (sweepRes.tripped) {
        return {
          outcome: 'tripped',
          guard: null,
          poise: null,
          sweep: sweepRes,
          tipping: null,
          staggerState: state.staggerState,
          staggerDuration: state.staggerDuration,
          zmpMargin: computeZmpMargin(state)
        };
      }
    }

    // 3. Poise & hyper-armor absorption
    var poiseRes = solvePoiseAbsorption(state, poiseDamage, impactTier);
    var tip = computeTippingTorque(state, impulseX, impulseY, hitHeight);

    if (poiseRes.absorbed) {
      // Fighter powers through with minor CoG rock
      state.cogVelX = q(state.cogVelX + tip.cogVelImpulse * 0.35);
      state.leanVel = q(state.leanVel + tip.angularImpulse * 0.30);
      return {
        outcome: 'poise_absorbed',
        guard: null,
        poise: poiseRes,
        sweep: null,
        tipping: tip,
        staggerState: state.staggerState,
        staggerDuration: 0,
        zmpMargin: computeZmpMargin(state)
      };
    }

    // 4. Apply full CoG tipping impulse & balance drain
    state.cogVelX = q(state.cogVelX + tip.cogVelImpulse);
    state.leanVel = q(state.leanVel + tip.angularImpulse);

    var impMag = Math.sqrt(impulseX * impulseX + impulseY * impulseY);
    var balanceDrain = q(clamp(10 + impMag * 0.082 + poiseRes.overflow * 0.45, 8, 65));
    state.balance = q(Math.max(0, state.balance - balanceDrain));
    state.balanceRegenDelay = q(Math.max(state.balanceRegenDelay, 0.78));

    var zmpMargin = computeZmpMargin(state);
    var absLean = Math.abs(state.leanAngle);

    // 5. Classify stagger transition: tripped -> stumble -> heavy_stagger -> micro_stagger
    var outcome = STAGGER_STATES.MICRO;
    if (state.grounded && (absLean > 0.78 || (state.balance <= 0 && zmpMargin < -0.35))) {
      state.staggerState = STAGGER_STATES.TRIPPED;
      state.staggerDuration = q(0.52);
      state.staggerTimer = state.staggerDuration;
      state.staggerDir = dir;
      state.lastTransitionReason = 'cog_topple_collapse';
      outcome = STAGGER_STATES.TRIPPED;
    } else if (state.grounded && (state.balance <= 24 || zmpMargin < -0.10 || absLean > 0.44)) {
      var steps = state.balance <= 10 ? 3 : (zmpMargin < -0.22 ? 2 : 1);
      enterStumble(state, dir, steps, Math.abs(impulseX) * 0.42, 'low_balance_stumble');
      outcome = STAGGER_STATES.STUMBLE;
    } else if (impMag >= 210 || poiseRes.poiseBroken || impactTier >= 2) {
      state.staggerState = STAGGER_STATES.HEAVY;
      state.staggerDuration = q(clamp(0.28 + impMag * 0.00042, 0.28, 0.48));
      state.staggerTimer = state.staggerDuration;
      state.staggerDir = dir;
      state.lastTransitionReason = poiseRes.poiseBroken ? 'poise_shatter_heavy' : 'heavy_impact';
      outcome = STAGGER_STATES.HEAVY;
    } else {
      state.staggerState = STAGGER_STATES.MICRO;
      state.staggerDuration = q(clamp(0.11 + impMag * 0.00028, 0.11, 0.20));
      state.staggerTimer = state.staggerDuration;
      state.staggerDir = dir;
      state.lastTransitionReason = 'light_flinch';
      outcome = STAGGER_STATES.MICRO;
    }

    return {
      outcome: outcome,
      guard: null,
      poise: poiseRes,
      sweep: null,
      tipping: tip,
      balanceDrain: balanceDrain,
      balanceRemaining: state.balance,
      staggerState: state.staggerState,
      staggerDuration: state.staggerDuration,
      zmpMargin: zmpMargin
    };
  }

  // ==========================================================================
  // 8. REALISTIC RECOVERY-FRAME ACCELERATION CURVES & PER-FRAME STEPPER
  // ==========================================================================

  // Evaluate footwork traction, turn authority, and cancel permissions along
  // normalized recovery progress p in [0..1].
  function evalRecoveryAcceleration(curveType, progress) {
    var p = clamp(progress, 0, 1);
    var accelMul = 1.0;
    var turnMul = 1.0;
    var canGuard = false;
    var canAttack = false;
    var canDash = false;

    if (curveType === 'brace_snap') {
      // Crisp martial plant: fast exponential traction ramp, early guard cancel
      accelMul = 0.35 + 0.65 * (1 - Math.exp(-5.2 * p));
      turnMul = 0.45 + 0.55 * smoothstep(0, 0.55, p);
      canGuard = p >= 0.25;
      canDash = p >= 0.45;
      canAttack = p >= 0.60;
    } else if (curveType === 'quick_roll') {
      // Ukemi momentum roll: strong burst mid-roll, clean exit into combat
      accelMul = 0.55 + 0.45 * Math.sin(p * PI * 0.5);
      turnMul = smoothstep(0.35, 0.90, p);
      canGuard = p >= 0.55;
      canDash = p >= 0.65;
      canAttack = p >= 0.78;
    } else if (curveType === 'heavy_getup') {
      // Heavy weight shift off the mat: sluggish start, strong finish once hips rise
      accelMul = 0.08 + 0.92 * (p * p * p);
      turnMul = 0.10 + 0.90 * smoothstep(0.45, 1.0, p);
      canGuard = p >= 0.72;
      canDash = p >= 0.85;
      canAttack = p >= 0.92;
    } else {
      // 'standard': smooth Hermite martial footwork ramp
      accelMul = 0.18 + 0.82 * smoothstep(0, 1, p);
      turnMul = 0.25 + 0.75 * smoothstep(0.10, 0.85, p);
      canGuard = p >= 0.42;
      canDash = p >= 0.62;
      canAttack = p >= 0.72;
    }

    return {
      progress: q(p),
      moveAccelMul: q(clamp(accelMul, 0, 1)),
      turnRateMul: q(clamp(turnMul, 0, 1)),
      canGuard: canGuard,
      canDash: canDash,
      canAttack: canAttack
    };
  }

  // Advance the fighter's balance, CoG pendulum, stagger FSM, and meter regeneration
  // by one deterministic timestep dt.
  function stepBalance(state, dt, controls) {
    var stepDt = dt || DEFAULT_STEP;
    var ctrl = controls || {};
    var prof = getStanceProfile(state.stance);

    if (ctrl.stance && STANCE_PROFILES[ctrl.stance]) state.stance = ctrl.stance;
    if (ctrl.surface && SURFACE_PRESETS[ctrl.surface]) state.surface = ctrl.surface;
    if (ctrl.grounded !== undefined) state.grounded = !!ctrl.grounded;
    if (ctrl.face !== undefined) state.face = signNonZero(ctrl.face);
    if (ctrl.hyperArmorLevel !== undefined) state.hyperArmorLevel = ctrl.hyperArmorLevel;

    // Guard hold timer (tracks perfect-guard window)
    if (ctrl.guardActive !== undefined) {
      if (ctrl.guardActive && !state.guardActive) {
        state.guardActive = true;
        state.guardHoldTime = 0;
      } else if (!ctrl.guardActive) {
        state.guardActive = false;
        state.guardHoldTime = 0;
      }
    }
    if (state.guardActive) {
      state.guardHoldTime = q(state.guardHoldTime + stepDt);
    }

    if (state.riposteWindow > 0) {
      state.riposteWindow = q(Math.max(0, state.riposteWindow - stepDt));
    }

    // Decay ankle strain steadily when grounded
    if (state.ankleStrain > 0 && state.grounded) {
      state.ankleStrain = q(Math.max(0, state.ankleStrain - 22 * stepDt));
    }

    // Step CoG pendulum
    var cogRes = stepCoGDynamics(state, stepDt, ctrl.inputAccelX || 0);

    // Step stagger / recovery state machine
    var rootMotionVx = state.footSlipVel;
    var recoveryOutput = {
      progress: 1,
      moveAccelMul: 1,
      turnRateMul: 1,
      canGuard: true,
      canDash: true,
      canAttack: true
    };

    if (state.staggerState === STAGGER_STATES.STUMBLE) {
      state.staggerTimer = q(Math.max(0, state.staggerTimer - stepDt));
      state.stumbleStepTimer = q(state.stumbleStepTimer - stepDt);
      rootMotionVx = q(rootMotionVx + state.stumbleDriftVx);
      state.stumbleDriftVx = q(state.stumbleDriftVx * Math.pow(0.18, stepDt));

      // Each catch-step pulls CoG back toward the support base
      if (state.stumbleStepTimer <= 0 && state.stumbleSteps > 0) {
        state.stumbleSteps -= 1;
        state.stumbleStepTimer = q(0.14);
        state.cogOffsetX = q(state.cogOffsetX * 0.58);
        state.leanAngle = q(state.leanAngle * 0.62);
      }

      recoveryOutput = {
        progress: q(1 - state.staggerTimer / Math.max(EPS, state.staggerDuration)),
        moveAccelMul: 0.22,
        turnRateMul: 0.15,
        canGuard: false,
        canDash: false,
        canAttack: false
      };

      if (state.staggerTimer <= 0) {
        // If CoG still catastrophically outside base, collapse into tripped
        if (Math.abs(state.leanAngle) > 0.72) {
          state.staggerState = STAGGER_STATES.TRIPPED;
          state.staggerDuration = q(0.45);
          state.staggerTimer = state.staggerDuration;
          state.lastTransitionReason = 'stumble_failed_catch';
        } else {
          enterRecovery(state, 0.16, 'standard', 'stumble_recovered');
        }
      }
    } else if (
      state.staggerState === STAGGER_STATES.MICRO ||
      state.staggerState === STAGGER_STATES.HEAVY ||
      state.staggerState === STAGGER_STATES.TRIPPED ||
      state.staggerState === STAGGER_STATES.GUARD_BROKEN
    ) {
      state.staggerTimer = q(Math.max(0, state.staggerTimer - stepDt));
      recoveryOutput = {
        progress: q(1 - state.staggerTimer / Math.max(EPS, state.staggerDuration)),
        moveAccelMul: 0,
        turnRateMul: 0,
        canGuard: false,
        canDash: false,
        canAttack: false
      };

      if (state.staggerTimer <= 0) {
        var nextCurve = state.staggerState === STAGGER_STATES.TRIPPED
          ? (ctrl.quickGetup ? 'quick_roll' : 'heavy_getup')
          : (state.staggerState === STAGGER_STATES.MICRO ? 'brace_snap' : 'standard');
        var nextDur = state.staggerState === STAGGER_STATES.TRIPPED
          ? (ctrl.quickGetup ? 0.22 : 0.36)
          : (state.staggerState === STAGGER_STATES.GUARD_BROKEN ? 0.26 : 0.14);
        enterRecovery(state, nextDur, nextCurve, state.staggerState + '_exit');
      }
    } else if (state.staggerState === STAGGER_STATES.RECOVERING) {
      state.recoveryTimer = q(Math.max(0, state.recoveryTimer - stepDt));
      var pRec = 1 - state.recoveryTimer / Math.max(EPS, state.recoveryDuration);
      recoveryOutput = evalRecoveryAcceleration(state.recoveryCurve, pRec);
      if (state.recoveryTimer <= 0) {
        state.staggerState = STAGGER_STATES.STABLE;
        state.lastTransitionReason = 'stabilized';
      }
    }

    // Regenerate balance, poise, and posture when delays expire
    if (state.balanceRegenDelay > 0) {
      state.balanceRegenDelay = q(Math.max(0, state.balanceRegenDelay - stepDt));
    } else if (state.grounded && (state.staggerState === STAGGER_STATES.STABLE || state.staggerState === STAGGER_STATES.RECOVERING)) {
      state.balance = q(Math.min(state.maxBalance, state.balance + prof.balanceRegen * stepDt));
    }

    if (state.poiseRegenDelay > 0) {
      state.poiseRegenDelay = q(Math.max(0, state.poiseRegenDelay - stepDt));
    } else if (state.poise < state.maxPoise) {
      state.poise = q(Math.min(state.maxPoise, state.poise + 28 * stepDt));
    }

    if (state.postureRegenDelay > 0) {
      state.postureRegenDelay = q(Math.max(0, state.postureRegenDelay - stepDt));
    } else if (!state.guardActive && state.staggerState !== STAGGER_STATES.GUARD_BROKEN) {
      state.posture = q(Math.min(state.maxPosture, state.posture + prof.postureRegen * stepDt));
    }

    return {
      staggerState: state.staggerState,
      balance: state.balance,
      poise: state.poise,
      posture: state.posture,
      cogOffsetX: cogRes.cogOffsetX,
      leanAngle: cogRes.leanAngle,
      zmpMargin: cogRes.zmpMargin,
      rootMotionVx: q(rootMotionVx),
      recovery: recoveryOutput,
      inPerfectGuardWindow: state.guardActive && state.guardHoldTime <= state.perfectGuardWindow,
      riposteActive: state.riposteWindow > 0
    };
  }

  // Export public API onto RYPhysics.Balance
  RY.Balance = {
    VERSION: '1.0.0',
    STANCE_PROFILES: STANCE_PROFILES,
    STAGGER_STATES: STAGGER_STATES,
    SURFACE_PRESETS: SURFACE_PRESETS,
    getStanceProfile: getStanceProfile,
    getSurfacePreset: getSurfacePreset,
    createState: createState,
    resetState: resetState,
    snapshotState: snapshotState,
    restoreState: restoreState,
    computeZmpMargin: computeZmpMargin,
    computeTippingTorque: computeTippingTorque,
    stepCoGDynamics: stepCoGDynamics,
    solvePoiseAbsorption: solvePoiseAbsorption,
    solveGuardImpact: solveGuardImpact,
    solveSweepTrip: solveSweepTrip,
    applyDirectionalImpact: applyDirectionalImpact,
    evalRecoveryAcceleration: evalRecoveryAcceleration,
    stepBalance: stepBalance
  };
})(RYPhysics);
