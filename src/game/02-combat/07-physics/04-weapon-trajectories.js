// ============================================================================
// RenYing Martial Arts Physics — Module 04: Weapon Trajectories & Kinematics
// Rollback-deterministic weapon physical profiles, kinematic arc sampling,
// sweet-spot / sour-spot impact evaluation, blade-on-blade clash solver,
// and multi-sample swept hitbox ribbon generation for all 15 weapon classes.
// ============================================================================

var RYPhysics = (typeof window !== 'undefined' ? (window.RYPhysics = window.RYPhysics || {}) : {});

(function (RY) {
  'use strict';

  // Fixed-precision quantization (1e-4) to guarantee cross-platform IEEE-754
  // determinism across rollback frames and heterogeneous JS engines.
  var QUANT = 10000;
  var PI = 3.141592653589793;
  var TWO_PI = 6.283185307179586;
  var HALF_PI = 1.5707963267948966;
  var DEG2RAD = PI / 180;
  var DEFAULT_STEP = 1 / 60;
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

  function smoothstep(edge0, edge1, x) {
    var denom = edge1 - edge0;
    if (Math.abs(denom) < EPS) return x >= edge1 ? 1 : 0;
    var t = clamp((x - edge0) / denom, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function signNonZero(v) {
    return v < 0 ? -1 : 1;
  }

  // Deterministic 2D vector primitives (plain objects to stay GC-friendly & serializable)
  function v2(x, y) {
    return { x: q(x), y: q(y) };
  }

  function v2Add(a, b) {
    return { x: q(a.x + b.x), y: q(a.y + b.y) };
  }

  function v2Sub(a, b) {
    return { x: q(a.x - b.x), y: q(a.y - b.y) };
  }

  function v2Scale(a, s) {
    return { x: q(a.x * s), y: q(a.y * s) };
  }

  function v2Dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function v2Cross(a, b) {
    return a.x * b.y - a.y * b.x;
  }

  function v2LenSq(a) {
    return a.x * a.x + a.y * a.y;
  }

  function v2Len(a) {
    return Math.sqrt(a.x * a.x + a.y * a.y);
  }

  function v2Norm(a) {
    var l = v2Len(a);
    if (l < EPS) return { x: 1, y: 0 };
    return { x: q(a.x / l), y: q(a.y / l) };
  }

  function v2Dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ==========================================================================
  // 1. PHYSICAL WEAPON PROFILES (All 15 RenYing Weapon Archetypes)
  // ==========================================================================
  // Coordinate conventions match RenYing combat space:
  //   - x: horizontal (+ right, scaled by fighter.face in {-1, +1})
  //   - y: vertical (0 = ground, negative = upward; head ~ -112px)
  //   - length: world pixels (aligned with WEAPON_LEN in 02-heroes.js)
  //   - mass: effective martial combat mass (kg)
  //   - comRatio: center-of-mass position along [0=hilt .. 1=tip]
  //   - angularInertia: rotational inertia about grip pivot (kg * m^2 normalized)
  //   - sweetSpot: [min, max, peak, multiplier] along normalized weapon span
  //   - edgeFactor: cutting / slicing transfer efficiency
  //   - bluntFactor: concussive / bone-shock transfer efficiency
  //   - guardBreakFactor: posture & guard-meter drain multiplier
  //   - parryRecoil: deflection recoil multiplier when parried or clashed
  //   - clashTier: structural dominance weight (0.5 light .. 2.2 heavy)

  var PROFILES = {
    sword: {
      id: 'sword',
      category: 'blade',
      mass: 1.35,
      length: 54,
      width: 5.5,
      comRatio: 0.34,
      angularInertia: 0.42,
      sweetSpot: { min: 0.62, max: 0.88, peak: 0.76, multiplier: 1.24 },
      sourSpot: { hiltMultiplier: 0.72, tipMultiplier: 0.90 },
      edgeFactor: 0.94,
      bluntFactor: 0.36,
      guardBreakFactor: 1.00,
      parryRecoil: 1.00,
      clashTier: 1.05,
      aeroDrag: 0.04,
      dual: false,
      defaultArc: {
        arcType: 'slash_down',
        startAngle: -115 * DEG2RAD,
        endAngle: 48 * DEG2RAD,
        shoulderOffset: { x: 8, y: -74 },
        armReach: 24,
        wristWhip: 0.28,
        followThrough: 0.14
      }
    },
    dual: {
      id: 'dual',
      category: 'paired',
      mass: 0.88,
      length: 40,
      width: 4.5,
      comRatio: 0.30,
      angularInertia: 0.24,
      sweetSpot: { min: 0.58, max: 0.86, peak: 0.72, multiplier: 1.20 },
      sourSpot: { hiltMultiplier: 0.78, tipMultiplier: 0.88 },
      edgeFactor: 0.96,
      bluntFactor: 0.25,
      guardBreakFactor: 0.82,
      parryRecoil: 1.18,
      clashTier: 0.82,
      aeroDrag: 0.03,
      dual: true,
      dualPhaseOffset: 0.22,
      defaultArc: {
        arcType: 'figure_eight',
        startAngle: -95 * DEG2RAD,
        endAngle: 65 * DEG2RAD,
        shoulderOffset: { x: 10, y: -70 },
        armReach: 22,
        wristWhip: 0.36,
        followThrough: 0.12
      }
    },
    greatsword: {
      id: 'greatsword',
      category: 'blade',
      mass: 4.60,
      length: 70,
      width: 11.0,
      comRatio: 0.56,
      angularInertia: 1.95,
      sweetSpot: { min: 0.54, max: 0.86, peak: 0.72, multiplier: 1.32 },
      sourSpot: { hiltMultiplier: 0.64, tipMultiplier: 0.86 },
      edgeFactor: 0.84,
      bluntFactor: 0.88,
      guardBreakFactor: 1.62,
      parryRecoil: 0.62,
      clashTier: 1.95,
      aeroDrag: 0.09,
      dual: false,
      defaultArc: {
        arcType: 'overhead_slam',
        startAngle: -145 * DEG2RAD,
        endAngle: 32 * DEG2RAD,
        shoulderOffset: { x: 4, y: -78 },
        armReach: 26,
        wristWhip: 0.14,
        followThrough: 0.24
      }
    },
    spear: {
      id: 'spear',
      category: 'polearm',
      mass: 2.35,
      length: 88,
      width: 6.5,
      comRatio: 0.58,
      angularInertia: 1.48,
      sweetSpot: { min: 0.76, max: 0.98, peak: 0.90, multiplier: 1.30 },
      sourSpot: { hiltMultiplier: 0.52, tipMultiplier: 0.96 },
      edgeFactor: 0.90,
      bluntFactor: 0.48,
      guardBreakFactor: 1.18,
      parryRecoil: 0.88,
      clashTier: 1.32,
      aeroDrag: 0.05,
      dual: false,
      defaultArc: {
        arcType: 'thrust',
        startAngle: -14 * DEG2RAD,
        endAngle: 6 * DEG2RAD,
        shoulderOffset: { x: 6, y: -68 },
        armReach: 30,
        wristWhip: 0.12,
        followThrough: 0.16
      }
    },
    fan: {
      id: 'fan',
      category: 'exotic',
      mass: 0.68,
      length: 36,
      width: 14.0,
      comRatio: 0.44,
      angularInertia: 0.22,
      sweetSpot: { min: 0.66, max: 0.96, peak: 0.84, multiplier: 1.22 },
      sourSpot: { hiltMultiplier: 0.70, tipMultiplier: 0.92 },
      edgeFactor: 0.86,
      bluntFactor: 0.30,
      guardBreakFactor: 0.78,
      parryRecoil: 1.25,
      clashTier: 0.74,
      aeroDrag: 0.16,
      dual: false,
      defaultArc: {
        arcType: 'slash_horiz',
        startAngle: -75 * DEG2RAD,
        endAngle: 85 * DEG2RAD,
        shoulderOffset: { x: 10, y: -72 },
        armReach: 24,
        wristWhip: 0.48,
        followThrough: 0.15
      }
    },
    fists: {
      id: 'fists',
      category: 'unarmed',
      mass: 1.10,
      length: 16,
      width: 11.0,
      comRatio: 0.72,
      angularInertia: 0.14,
      sweetSpot: { min: 0.60, max: 1.00, peak: 0.88, multiplier: 1.18 },
      sourSpot: { hiltMultiplier: 0.82, tipMultiplier: 0.95 },
      edgeFactor: 0.15,
      bluntFactor: 0.98,
      guardBreakFactor: 1.12,
      parryRecoil: 0.92,
      clashTier: 0.90,
      aeroDrag: 0.02,
      dual: true,
      dualPhaseOffset: 0.30,
      defaultArc: {
        arcType: 'palm_drive',
        startAngle: -18 * DEG2RAD,
        endAngle: 8 * DEG2RAD,
        shoulderOffset: { x: 12, y: -72 },
        armReach: 28,
        wristWhip: 0.10,
        followThrough: 0.08
      }
    },
    brush: {
      id: 'brush',
      category: 'polearm',
      mass: 1.65,
      length: 66,
      width: 8.5,
      comRatio: 0.52,
      angularInertia: 0.92,
      sweetSpot: { min: 0.70, max: 0.96, peak: 0.86, multiplier: 1.26 },
      sourSpot: { hiltMultiplier: 0.62, tipMultiplier: 0.94 },
      edgeFactor: 0.58,
      bluntFactor: 0.64,
      guardBreakFactor: 1.04,
      parryRecoil: 0.98,
      clashTier: 1.02,
      aeroDrag: 0.08,
      dual: false,
      defaultArc: {
        arcType: 'figure_eight',
        startAngle: -120 * DEG2RAD,
        endAngle: 62 * DEG2RAD,
        shoulderOffset: { x: 6, y: -74 },
        armReach: 26,
        wristWhip: 0.42,
        followThrough: 0.18
      }
    },
    moonblade: {
      id: 'moonblade',
      category: 'blade',
      mass: 1.55,
      length: 58,
      width: 9.0,
      comRatio: 0.48,
      angularInertia: 0.64,
      sweetSpot: { min: 0.60, max: 0.92, peak: 0.78, multiplier: 1.28 },
      sourSpot: { hiltMultiplier: 0.68, tipMultiplier: 0.92 },
      edgeFactor: 0.98,
      bluntFactor: 0.34,
      guardBreakFactor: 1.08,
      parryRecoil: 0.94,
      clashTier: 1.15,
      aeroDrag: 0.05,
      dual: false,
      defaultArc: {
        arcType: 'spin_360',
        startAngle: -135 * DEG2RAD,
        endAngle: 95 * DEG2RAD,
        shoulderOffset: { x: 8, y: -72 },
        armReach: 24,
        wristWhip: 0.38,
        followThrough: 0.18
      }
    },
    flute: {
      id: 'flute',
      category: 'exotic',
      mass: 0.75,
      length: 50,
      width: 4.5,
      comRatio: 0.46,
      angularInertia: 0.32,
      sweetSpot: { min: 0.64, max: 0.92, peak: 0.80, multiplier: 1.20 },
      sourSpot: { hiltMultiplier: 0.68, tipMultiplier: 0.90 },
      edgeFactor: 0.40,
      bluntFactor: 0.72,
      guardBreakFactor: 0.88,
      parryRecoil: 1.12,
      clashTier: 0.84,
      aeroDrag: 0.03,
      dual: false,
      defaultArc: {
        arcType: 'thrust',
        startAngle: -28 * DEG2RAD,
        endAngle: 18 * DEG2RAD,
        shoulderOffset: { x: 9, y: -74 },
        armReach: 24,
        wristWhip: 0.34,
        followThrough: 0.14
      }
    },
    gourd: {
      id: 'gourd',
      category: 'blunt',
      mass: 2.15,
      length: 16,
      width: 15.0,
      comRatio: 0.64,
      angularInertia: 0.38,
      sweetSpot: { min: 0.50, max: 0.96, peak: 0.78, multiplier: 1.22 },
      sourSpot: { hiltMultiplier: 0.80, tipMultiplier: 0.92 },
      edgeFactor: 0.10,
      bluntFactor: 1.00,
      guardBreakFactor: 1.24,
      parryRecoil: 0.84,
      clashTier: 1.18,
      aeroDrag: 0.07,
      dual: false,
      defaultArc: {
        arcType: 'slash_up',
        startAngle: 58 * DEG2RAD,
        endAngle: -88 * DEG2RAD,
        shoulderOffset: { x: 10, y: -66 },
        armReach: 25,
        wristWhip: 0.26,
        followThrough: 0.20
      }
    },
    hammer: {
      id: 'hammer',
      category: 'blunt',
      mass: 5.40,
      length: 56,
      width: 16.0,
      comRatio: 0.78,
      angularInertia: 2.35,
      sweetSpot: { min: 0.72, max: 1.00, peak: 0.90, multiplier: 1.38 },
      sourSpot: { hiltMultiplier: 0.48, tipMultiplier: 0.94 },
      edgeFactor: 0.12,
      bluntFactor: 1.08,
      guardBreakFactor: 1.85,
      parryRecoil: 0.54,
      clashTier: 2.15,
      aeroDrag: 0.11,
      dual: false,
      defaultArc: {
        arcType: 'overhead_slam',
        startAngle: -155 * DEG2RAD,
        endAngle: 40 * DEG2RAD,
        shoulderOffset: { x: 4, y: -78 },
        armReach: 25,
        wristWhip: 0.10,
        followThrough: 0.28
      }
    },
    spindle: {
      id: 'spindle',
      category: 'exotic',
      mass: 0.95,
      length: 42,
      width: 6.0,
      comRatio: 0.62,
      angularInertia: 0.36,
      sweetSpot: { min: 0.70, max: 0.98, peak: 0.88, multiplier: 1.26 },
      sourSpot: { hiltMultiplier: 0.60, tipMultiplier: 0.92 },
      edgeFactor: 0.88,
      bluntFactor: 0.42,
      guardBreakFactor: 0.90,
      parryRecoil: 1.10,
      clashTier: 0.86,
      aeroDrag: 0.04,
      dual: true,
      dualPhaseOffset: 0.26,
      defaultArc: {
        arcType: 'whip_snap',
        startAngle: -85 * DEG2RAD,
        endAngle: 55 * DEG2RAD,
        shoulderOffset: { x: 10, y: -70 },
        armReach: 26,
        wristWhip: 0.54,
        followThrough: 0.16
      }
    },
    magnet: {
      id: 'magnet',
      category: 'unarmed',
      mass: 1.85,
      length: 16,
      width: 14.0,
      comRatio: 0.68,
      angularInertia: 0.28,
      sweetSpot: { min: 0.55, max: 1.00, peak: 0.85, multiplier: 1.24 },
      sourSpot: { hiltMultiplier: 0.78, tipMultiplier: 0.94 },
      edgeFactor: 0.22,
      bluntFactor: 0.95,
      guardBreakFactor: 1.26,
      parryRecoil: 0.82,
      clashTier: 1.22,
      aeroDrag: 0.03,
      dual: true,
      dualPhaseOffset: 0.18,
      defaultArc: {
        arcType: 'palm_drive',
        startAngle: -24 * DEG2RAD,
        endAngle: 14 * DEG2RAD,
        shoulderOffset: { x: 12, y: -70 },
        armReach: 28,
        wristWhip: 0.18,
        followThrough: 0.12
      }
    },
    puppet: {
      id: 'puppet',
      category: 'exotic',
      mass: 1.20,
      length: 20,
      width: 10.0,
      comRatio: 0.55,
      angularInertia: 0.46,
      sweetSpot: { min: 0.62, max: 0.96, peak: 0.82, multiplier: 1.22 },
      sourSpot: { hiltMultiplier: 0.68, tipMultiplier: 0.90 },
      edgeFactor: 0.64,
      bluntFactor: 0.66,
      guardBreakFactor: 0.96,
      parryRecoil: 1.04,
      clashTier: 0.94,
      aeroDrag: 0.06,
      dual: false,
      defaultArc: {
        arcType: 'whip_snap',
        startAngle: -65 * DEG2RAD,
        endAngle: 42 * DEG2RAD,
        shoulderOffset: { x: 14, y: -68 },
        armReach: 34,
        wristWhip: 0.46,
        followThrough: 0.14
      }
    },
    wing: {
      id: 'wing',
      category: 'blade',
      mass: 1.40,
      length: 48,
      width: 10.5,
      comRatio: 0.42,
      angularInertia: 0.52,
      sweetSpot: { min: 0.58, max: 0.90, peak: 0.76, multiplier: 1.26 },
      sourSpot: { hiltMultiplier: 0.72, tipMultiplier: 0.92 },
      edgeFactor: 0.92,
      bluntFactor: 0.44,
      guardBreakFactor: 1.06,
      parryRecoil: 0.96,
      clashTier: 1.08,
      aeroDrag: 0.12,
      dual: true,
      dualPhaseOffset: 0.16,
      defaultArc: {
        arcType: 'slash_horiz',
        startAngle: -108 * DEG2RAD,
        endAngle: 72 * DEG2RAD,
        shoulderOffset: { x: 6, y: -76 },
        armReach: 24,
        wristWhip: 0.34,
        followThrough: 0.18
      }
    }
  };

  var WEAPON_IDS = Object.keys(PROFILES);

  function getProfile(weaponId) {
    if (weaponId && PROFILES[weaponId]) return PROFILES[weaponId];
    return PROFILES.sword;
  }

  function resolveFighterWeaponId(fighter) {
    if (!fighter) return 'sword';
    if (typeof fighter === 'string') return PROFILES[fighter] ? fighter : 'sword';
    if (fighter.look && fighter.look.weapon && PROFILES[fighter.look.weapon]) {
      return fighter.look.weapon;
    }
    if (fighter.ch && fighter.ch.look && fighter.ch.look.weapon && PROFILES[fighter.ch.look.weapon]) {
      return fighter.ch.look.weapon;
    }
    return 'sword';
  }

  function computeEffectiveInertia(profile, scale, twoHanded) {
    var s = scale || 1;
    var gripFactor = twoHanded ? 1.22 : 1.0;
    // Rotational inertia scales with mass * length^2 (approximated by s^3 for uniform scaling)
    return q(profile.angularInertia * s * s * s * gripFactor);
  }

  // ==========================================================================
  // 2. SWING PHASE CURVES & ARC KINEMATICS
  // ==========================================================================
  // Phase t in [0, 1] maps the active swing envelope:
  //   - Windup anticipation: slight reverse cocking at t in [0, 0.12]
  //   - Acceleration burst: explosive angular whip through t in [0.12, 0.65]
  //   - Peak strike velocity around t ~ 0.45 - 0.58
  //   - Deceleration & follow-through: t in [0.65, 1.0]

  var ARC_PRESETS = {
    slash_down: {
      startAngle: -122 * DEG2RAD,
      endAngle: 52 * DEG2RAD,
      radialCurve: 'arc',
      anticipation: -0.08,
      peakPhase: 0.48,
      thrustExtend: 0.12,
      verticalLift: -6
    },
    slash_up: {
      startAngle: 64 * DEG2RAD,
      endAngle: -102 * DEG2RAD,
      radialCurve: 'arc',
      anticipation: -0.07,
      peakPhase: 0.44,
      thrustExtend: 0.16,
      verticalLift: 8
    },
    slash_horiz: {
      startAngle: -88 * DEG2RAD,
      endAngle: 86 * DEG2RAD,
      radialCurve: 'sweep',
      anticipation: -0.06,
      peakPhase: 0.50,
      thrustExtend: 0.22,
      verticalLift: 0
    },
    thrust: {
      startAngle: -10 * DEG2RAD,
      endAngle: 6 * DEG2RAD,
      radialCurve: 'linear',
      anticipation: -0.14,
      peakPhase: 0.42,
      thrustExtend: 0.85,
      verticalLift: 0
    },
    overhead_slam: {
      startAngle: -152 * DEG2RAD,
      endAngle: 38 * DEG2RAD,
      radialCurve: 'heavy',
      anticipation: -0.12,
      peakPhase: 0.58,
      thrustExtend: 0.15,
      verticalLift: -12
    },
    spin_360: {
      startAngle: -165 * DEG2RAD,
      endAngle: 195 * DEG2RAD,
      radialCurve: 'spin',
      anticipation: -0.04,
      peakPhase: 0.52,
      thrustExtend: 0.25,
      verticalLift: -4
    },
    figure_eight: {
      startAngle: -110 * DEG2RAD,
      endAngle: 78 * DEG2RAD,
      radialCurve: 'lissajous',
      anticipation: -0.05,
      peakPhase: 0.46,
      thrustExtend: 0.24,
      verticalLift: -3
    },
    whip_snap: {
      startAngle: -92 * DEG2RAD,
      endAngle: 54 * DEG2RAD,
      radialCurve: 'whip',
      anticipation: -0.10,
      peakPhase: 0.54,
      thrustExtend: 0.48,
      verticalLift: -2
    },
    palm_drive: {
      startAngle: -18 * DEG2RAD,
      endAngle: 10 * DEG2RAD,
      radialCurve: 'linear',
      anticipation: -0.12,
      peakPhase: 0.38,
      thrustExtend: 0.72,
      verticalLift: 2
    }
  };

  // Evaluate normalized swing progress u(t) with anticipation & follow-through.
  // Returns { u, duDt, d2uDt2 } where derivatives are with respect to phase t.
  function evalSwingProgress(t, preset, aeroDrag) {
    var tc = clamp(t, 0, 1);
    var ant = preset.anticipation || -0.08;
    var peak = clamp(preset.peakPhase || 0.48, 0.25, 0.75);
    var drag = clamp(aeroDrag || 0.04, 0, 0.35);

    // Piecewise C1-continuous progress curve:
    // Segment 1 [0, 0.15]: reverse windup into anticipation valley
    // Segment 2 [0.15, peak]: cubic acceleration up to peak velocity
    // Segment 3 [peak, 1.0]: damped deceleration into follow-through
    var u = 0;
    var wEnd = 0.15;
    if (tc < wEnd) {
      var s1 = tc / wEnd;
      u = ant * Math.sin(s1 * PI);
    } else if (tc < peak) {
      var s2 = (tc - wEnd) / (peak - wEnd);
      // Smooth cubic ease-in toward peak velocity
      u = 0.52 * (s2 * s2 * (2.2 - 1.2 * s2));
    } else {
      var s3 = (tc - peak) / (1 - peak);
      // Exponentially damped follow-through governed by aeroDrag
      var decay = 1 - Math.exp(-(2.8 - drag * 2.0) * s3);
      var normDecay = 1 - Math.exp(-(2.8 - drag * 2.0));
      var frac = normDecay > EPS ? decay / normDecay : s3;
      u = 0.52 + 0.48 * frac;
    }
    return u;
  }

  function evalSwingProgressWithDerivs(t, preset, aeroDrag, durationSec) {
    var dur = Math.max(0.03, durationSec || 0.16);
    var dt = 0.004;
    var t0 = clamp(t - dt, 0, 1);
    var t1 = clamp(t + dt, 0, 1);
    var span = Math.max(EPS, t1 - t0);

    var uC = evalSwingProgress(t, preset, aeroDrag);
    var u0 = evalSwingProgress(t0, preset, aeroDrag);
    var u1 = evalSwingProgress(t1, preset, aeroDrag);

    var duDtPhase = (u1 - u0) / span;
    var d2uDt2Phase = (u1 - 2 * uC + u0) / (dt * dt);

    return {
      u: q(uC),
      duDt: q(duDtPhase / dur),
      d2uDt2: q(d2uDt2Phase / (dur * dur))
    };
  }

  // Evaluate raw pose (pivot, hilt, tip, angle) at a single phase t.
  function evalPoseAtPhase(fighter, profile, arcCfg, preset, t) {
    var face = signNonZero(fighter.face !== undefined ? fighter.face : 1);
    var size = fighter.size || 1;
    var fx = fighter.x || 0;
    var fy = fighter.y || 0;

    var prog = evalSwingProgress(t, preset, profile.aeroDrag);
    var startA = arcCfg.startAngle !== undefined ? arcCfg.startAngle : preset.startAngle;
    var endA = arcCfg.endAngle !== undefined ? arcCfg.endAngle : preset.endAngle;

    // Local angle in facing frame (0 = straight forward, negative = up, positive = down)
    var baseAngle = lerp(startA, endA, prog);
    var wristWhip = (arcCfg.wristWhip !== undefined ? arcCfg.wristWhip : 0.25);
    var whipAngle = wristWhip * Math.sin(clamp(t, 0, 1) * PI * 1.5 - 0.35);

    var curve = preset.radialCurve || 'arc';
    var extend = preset.thrustExtend || 0.15;
    var shOff = arcCfg.shoulderOffset || { x: 8, y: -72 };
    var armReach = (arcCfg.armReach !== undefined ? arcCfg.armReach : 24) * size;

    var shoulderX = fx + face * shOff.x * size;
    var shoulderY = fy + shOff.y * size;

    var localReach = armReach;
    var extraY = (preset.verticalLift || 0) * size * Math.sin(clamp(t, 0, 1) * PI);
    var bladeAngleLocal = baseAngle + whipAngle;

    if (curve === 'linear') {
      // Thrust / palm drive: retract during windup, explosive forward extension at peak
      var thrustProfile = Math.sin(clamp(t, 0, 1) * PI);
      localReach = armReach * (0.45 + (0.55 + extend) * thrustProfile);
      bladeAngleLocal = baseAngle + whipAngle * 0.25;
    } else if (curve === 'lissajous') {
      // Figure-eight flourish: horizontal + vertical harmonic weave
      var theta = clamp(t, 0, 1) * TWO_PI;
      localReach = armReach * (0.82 + extend * Math.cos(theta));
      extraY += 14 * size * Math.sin(2 * theta);
      bladeAngleLocal = baseAngle + 0.32 * Math.sin(2 * theta) + whipAngle;
    } else if (curve === 'whip') {
      // Flexible/tethered snap: late radial extension + trailing tip lag
      var snapFactor = smoothstep(0.25, 0.72, clamp(t, 0, 1));
      localReach = armReach * (0.70 + extend * snapFactor);
      bladeAngleLocal = baseAngle + whipAngle * (1.25 - 0.5 * snapFactor);
    } else if (curve === 'heavy') {
      // Heavy overhead cleave: wide lever arm at apex, slight drop into follow-through
      localReach = armReach * (0.92 + extend * Math.sin(clamp(t, 0, 1) * PI));
      extraY += 8 * size * prog * prog;
    } else if (curve === 'spin') {
      localReach = armReach * (0.85 + extend * Math.sin(clamp(t, 0, 1) * PI));
    } else {
      localReach = armReach * (0.88 + extend * Math.sin(clamp(t, 0, 1) * PI));
    }

    // Hilt position from shoulder + extended arm along baseAngle
    var hiltLocalX = Math.cos(baseAngle) * localReach;
    var hiltLocalY = Math.sin(baseAngle) * localReach + extraY;

    var hiltX = shoulderX + face * hiltLocalX;
    var hiltY = shoulderY + hiltLocalY;

    // Weapon length scaled by fighter size and optional move reach multiplier
    var reachMul = arcCfg.reachMul || 1;
    var wLen = (arcCfg.length || profile.length) * size * reachMul;

    var dirLocalX = Math.cos(bladeAngleLocal);
    var dirLocalY = Math.sin(bladeAngleLocal);
    var dirWorldX = face * dirLocalX;
    var dirWorldY = dirLocalY;

    var tipX = hiltX + dirWorldX * wLen;
    var tipY = hiltY + dirWorldY * wLen;

    var midX = hiltX + dirWorldX * (wLen * 0.5);
    var midY = hiltY + dirWorldY * (wLen * 0.5);

    var comX = hiltX + dirWorldX * (wLen * profile.comRatio);
    var comY = hiltY + dirWorldY * (wLen * profile.comRatio);

    var sweetPeak = profile.sweetSpot.peak;
    var sweetX = hiltX + dirWorldX * (wLen * sweetPeak);
    var sweetY = hiltY + dirWorldY * (wLen * sweetPeak);

    return {
      shoulder: v2(shoulderX, shoulderY),
      hilt: v2(hiltX, hiltY),
      mid: v2(midX, midY),
      com: v2(comX, comY),
      sweet: v2(sweetX, sweetY),
      tip: v2(tipX, tipY),
      dir: v2(dirWorldX, dirWorldY),
      angleLocal: q(bladeAngleLocal),
      angleWorld: q(Math.atan2(dirWorldY, dirWorldX)),
      length: q(wLen),
      progress: q(prog)
    };
  }

  // Main kinematic sampler: returns hilt/mid/CoM/sweet/tip positions, instantaneous
  // world velocities, angular velocity/acceleration, and kinetic energy metrics.
  function sampleWeaponKinematics(params) {
    var fighter = (params && params.fighter) || { x: 0, y: 0, vx: 0, vy: 0, face: 1, size: 1 };
    var weaponId = (params && params.weaponId) || resolveFighterWeaponId(fighter);
    var profile = getProfile(weaponId);
    var defArc = profile.defaultArc;
    var arcCfg = Object.assign({}, defArc, (params && params.arc) || {});
    var arcType = (params && params.arcType) || arcCfg.arcType || 'slash_down';
    var preset = ARC_PRESETS[arcType] || ARC_PRESETS.slash_down;

    var t = clamp(params && params.t !== undefined ? params.t : 0.5, 0, 1);
    var duration = Math.max(0.03, (params && params.duration) || 0.16);
    var dtPhase = 0.005;
    var tPrev = clamp(t - dtPhase, 0, 1);
    var tNext = clamp(t + dtPhase, 0, 1);
    var dtSec = Math.max(EPS, (tNext - tPrev) * duration);

    var poseC = evalPoseAtPhase(fighter, profile, arcCfg, preset, t);
    var pose0 = evalPoseAtPhase(fighter, profile, arcCfg, preset, tPrev);
    var pose1 = evalPoseAtPhase(fighter, profile, arcCfg, preset, tNext);

    var fvx = fighter.vx || 0;
    var fvy = fighter.vy || 0;

    function velOf(p0, p1) {
      return v2((p1.x - p0.x) / dtSec + fvx, (p1.y - p0.y) / dtSec + fvy);
    }

    var hiltVel = velOf(pose0.hilt, pose1.hilt);
    var midVel = velOf(pose0.mid, pose1.mid);
    var comVel = velOf(pose0.com, pose1.com);
    var sweetVel = velOf(pose0.sweet, pose1.sweet);
    var tipVel = velOf(pose0.tip, pose1.tip);

    // Shortest-arc angular velocity & acceleration
    var dAngle = pose1.angleLocal - pose0.angleLocal;
    var omega = dAngle / dtSec; // rad/s in local facing frame
    var dAngle0 = poseC.angleLocal - pose0.angleLocal;
    var dAngle1 = pose1.angleLocal - poseC.angleLocal;
    var halfDtSec = Math.max(EPS, dtSec * 0.5);
    var alpha = (dAngle1 - dAngle0) / (halfDtSec * halfDtSec);

    // Kinetic energy: E_trans + E_rot (scaled from px/s to m/s with 100 px ~ 1 m)
    var pxToM = 0.01;
    var comSpeedM = v2Len(comVel) * pxToM;
    var effInertia = computeEffectiveInertia(profile, fighter.size || 1, !!(params && params.twoHanded));
    var eTrans = 0.5 * profile.mass * comSpeedM * comSpeedM;
    var eRot = 0.5 * effInertia * omega * omega;
    var totalKE = eTrans + eRot;

    var tipSpeed = v2Len(tipVel);
    var sweetSpeed = v2Len(sweetVel);
    var momentum = profile.mass * (sweetSpeed * pxToM);

    return {
      weaponId: profile.id,
      arcType: arcType,
      t: q(t),
      duration: q(duration),
      progress: poseC.progress,
      shoulder: poseC.shoulder,
      hilt: poseC.hilt,
      mid: poseC.mid,
      com: poseC.com,
      sweet: poseC.sweet,
      tip: poseC.tip,
      dir: poseC.dir,
      length: poseC.length,
      width: q(profile.width * (fighter.size || 1)),
      angleLocal: poseC.angleLocal,
      angleWorld: poseC.angleWorld,
      hiltVel: hiltVel,
      midVel: midVel,
      comVel: comVel,
      sweetVel: sweetVel,
      tipVel: tipVel,
      tipSpeed: q(tipSpeed),
      sweetSpeed: q(sweetSpeed),
      omega: q(omega),
      alpha: q(alpha),
      inertia: effInertia,
      kineticEnergy: q(totalKE),
      transEnergy: q(eTrans),
      rotEnergy: q(eRot),
      momentum: q(momentum)
    };
  }

  // Dual-weapon sampler: evaluates both primary hand and phase-offset offhand
  function sampleDualWeaponKinematics(params) {
    var fighter = (params && params.fighter) || { x: 0, y: 0, vx: 0, vy: 0, face: 1, size: 1 };
    var weaponId = (params && params.weaponId) || resolveFighterWeaponId(fighter);
    var profile = getProfile(weaponId);
    var primary = sampleWeaponKinematics(params);

    if (!profile.dual) {
      return { primary: primary, offhand: null };
    }

    var offset = profile.dualPhaseOffset || 0.20;
    var tMain = clamp(params && params.t !== undefined ? params.t : 0.5, 0, 1);
    var tOff = clamp(tMain - offset, 0, 1);

    var offArc = Object.assign({}, (params && params.arc) || {});
    // Mirror offhand sweep vertically for authentic twin-blade crossing arcs
    var baseArc = profile.defaultArc;
    if (offArc.startAngle === undefined) offArc.startAngle = -baseArc.startAngle * 0.85;
    if (offArc.endAngle === undefined) offArc.endAngle = -baseArc.endAngle * 0.85;
    offArc.shoulderOffset = {
      x: (baseArc.shoulderOffset.x || 8) - 4,
      y: (baseArc.shoulderOffset.y || -70) + 4
    };

    var offhand = sampleWeaponKinematics({
      fighter: fighter,
      weaponId: weaponId,
      arcType: (params && params.arcType) || baseArc.arcType,
      arc: offArc,
      t: tOff,
      duration: params && params.duration
    });

    return { primary: primary, offhand: offhand };
  }

  // Sample linear velocity at any normalized blade coordinate s in [0, 1]
  function samplePointAtSpan(kinematics, s) {
    var sc = clamp(s, 0, 1);
    var pos = v2(
      lerp(kinematics.hilt.x, kinematics.tip.x, sc),
      lerp(kinematics.hilt.y, kinematics.tip.y, sc)
    );
    var vel = v2(
      lerp(kinematics.hiltVel.x, kinematics.tipVel.x, sc),
      lerp(kinematics.hiltVel.y, kinematics.tipVel.y, sc)
    );
    return { pos: pos, vel: vel, s: q(sc) };
  }

  // ==========================================================================
  // 3. SWEET-SPOT vs SOUR-SPOT KINETIC IMPACT MULTIPLIER
  // ==========================================================================
  // Projects an impact point onto the weapon segment [hilt, tip], classifies
  // contact into 'sweet', 'sour_hilt', or 'sour_tip', and computes physically
  // grounded damage, impulse, guard-break, and hitstop modifiers.

  function projectPointOntoSegment(p, a, b) {
    var abx = b.x - a.x;
    var aby = b.y - a.y;
    var lenSq = abx * abx + aby * aby;
    if (lenSq < EPS) {
      return { s: 0, point: v2(a.x, a.y), dist: v2Dist(p, a) };
    }
    var rawS = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
    var s = clamp(rawS, 0, 1);
    var cx = a.x + abx * s;
    var cy = a.y + aby * s;
    return {
      s: q(s),
      point: v2(cx, cy),
      dist: q(Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy)))
    };
  }

  function evaluateImpactZone(kinematics, contactPoint, targetVel, options) {
    var profile = getProfile(kinematics.weaponId);
    var opts = options || {};
    var proj = projectPointOntoSegment(contactPoint, kinematics.hilt, kinematics.tip);
    var s = proj.s;

    var sw = profile.sweetSpot;
    var sr = profile.sourSpot;
    var zone = 'sweet';
    var zoneMul = 1.0;

    if (s >= sw.min && s <= sw.max) {
      zone = 'sweet';
      // Smooth bell peaking at sw.peak
      var distFromPeak = s < sw.peak
        ? (sw.peak - s) / Math.max(EPS, sw.peak - sw.min)
        : (s - sw.peak) / Math.max(EPS, sw.max - sw.peak);
      var bell = Math.cos(clamp(distFromPeak, 0, 1) * HALF_PI);
      zoneMul = lerp(1.02, sw.multiplier, bell * bell);
    } else if (s < sw.min) {
      zone = 'sour_hilt';
      var tHilt = smoothstep(0, sw.min, s);
      zoneMul = lerp(sr.hiltMultiplier, 0.98, tHilt);
    } else {
      zone = 'sour_tip';
      var tTip = smoothstep(sw.max, 1.0, s);
      zoneMul = lerp(1.00, sr.tipMultiplier, tTip);
    }

    // Relative impact velocity at exact contact point s
    var sample = samplePointAtSpan(kinematics, s);
    var tv = targetVel || { x: 0, y: 0 };
    var relVel = v2Sub(sample.vel, tv);
    var impactSpeed = v2Len(relVel);

    // Edge alignment:
    // - Slicing/sweeping strikes transfer maximum energy when motion is perpendicular to blade
    // - Thrusting/palm strikes transfer maximum energy when motion is parallel to blade
    var relDir = v2Norm(relVel);
    var cosAlign = Math.abs(v2Dot(relDir, kinematics.dir));
    var sinAlign = Math.sqrt(Math.max(0, 1 - cosAlign * cosAlign));
    var isThrust = kinematics.arcType === 'thrust' || kinematics.arcType === 'palm_drive';
    var rawAlign = isThrust ? (0.35 + 0.65 * cosAlign) : (0.35 + 0.65 * sinAlign);
    var edgeAlignment = clamp(rawAlign, 0.35, 1.0);

    // Kinetic speed normalization (baseline reference speed ~ 420 px/s)
    var refSpeed = opts.refSpeed || 420;
    var speedFactor = clamp(Math.pow(Math.max(80, impactSpeed) / refSpeed, 0.42), 0.72, 1.48);

    // Combine zone quality, velocity factor, and edge/blunt transfer
    var materialTransfer = isThrust
      ? (0.65 * profile.edgeFactor + 0.55 * profile.bluntFactor)
      : (0.75 * profile.edgeFactor + 0.45 * profile.bluntFactor);
    materialTransfer = clamp(materialTransfer, 0.75, 1.25);

    var damageMul = clamp(zoneMul * (0.78 + 0.22 * speedFactor) * (0.85 + 0.15 * edgeAlignment), 0.55, 1.55);
    var impulseMul = clamp(zoneMul * speedFactor * (0.70 + 0.30 * profile.bluntFactor), 0.50, 1.75);
    var guardBreakMul = clamp(
      profile.guardBreakFactor * (zone === 'sweet' ? 1.18 : (zone === 'sour_hilt' ? 0.76 : 0.92)) * (0.82 + 0.18 * speedFactor),
      0.45,
      2.35
    );

    // Hitstop bonus frames (+2F on crisp sweet-spot, -1F on sour hilt jam)
    var hitstopDelta = zone === 'sweet' ? (zoneMul >= sw.multiplier * 0.96 ? 2 : 1) : (zone === 'sour_hilt' ? -1 : 0);

    // Local effective kinetic energy at contact point
    var pxToM = 0.01;
    var speedM = impactSpeed * pxToM;
    var localKE = 0.5 * profile.mass * speedM * speedM * (0.55 + 0.45 * s);

    return {
      weaponId: profile.id,
      zone: zone,
      s: q(s),
      contactPoint: proj.point,
      weaponVel: sample.vel,
      relVel: relVel,
      impactSpeed: q(impactSpeed),
      edgeAlignment: q(edgeAlignment),
      speedFactor: q(speedFactor),
      zoneMul: q(zoneMul),
      damageMul: q(damageMul),
      impulseMul: q(impulseMul),
      guardBreakMul: q(guardBreakMul),
      hitstopDelta: hitstopDelta,
      kineticEnergy: q(localKE),
      isSweetSpot: zone === 'sweet',
      isSourSpot: zone !== 'sweet'
    };
  }

  // ==========================================================================
  // 4. SEGMENT GEOMETRY & BLADE-ON-BLADE WEAPON CLASH SOLVER
  // ==========================================================================

  function intersectSegments(p1, p2, p3, p4) {
    var d1x = p2.x - p1.x;
    var d1y = p2.y - p1.y;
    var d2x = p4.x - p3.x;
    var d2y = p4.y - p3.y;
    var denom = d1x * d2y - d1y * d2x;

    if (Math.abs(denom) < EPS) {
      return { hit: false, parallel: true, sA: 0, sB: 0, point: null };
    }

    var rx = p3.x - p1.x;
    var ry = p3.y - p1.y;
    var sA = (rx * d2y - ry * d2x) / denom;
    var sB = (rx * d1y - ry * d1x) / denom;

    if (sA >= 0 && sA <= 1 && sB >= 0 && sB <= 1) {
      return {
        hit: true,
        parallel: false,
        sA: q(sA),
        sB: q(sB),
        point: v2(p1.x + sA * d1x, p1.y + sA * d1y)
      };
    }

    return { hit: false, parallel: false, sA: q(sA), sB: q(sB), point: null };
  }

  // Closest distance and parameter pair (sA, sB) between two line segments [p1,p2] and [p3,p4]
  function closestSegmentPoints(p1, p2, p3, p4) {
    var ux = p2.x - p1.x, uy = p2.y - p1.y;
    var vx = p4.x - p3.x, vy = p4.y - p3.y;
    var wx = p1.x - p3.x, wy = p1.y - p3.y;

    var a = ux * ux + uy * uy;
    var b = ux * vx + uy * vy;
    var c = vx * vx + vy * vy;
    var d = ux * wx + uy * wy;
    var e = vx * wx + vy * wy;
    var D = a * c - b * b;

    var sN, sD = D;
    var tN, tD = D;

    if (D < EPS) {
      sN = 0.0;
      sD = 1.0;
      tN = e;
      tD = c;
    } else {
      sN = (b * e - c * d);
      tN = (a * e - b * d);
      if (sN < 0.0) {
        sN = 0.0;
        tN = e;
        tD = c;
      } else if (sN > sD) {
        sN = sD;
        tN = e + b;
        tD = c;
      }
    }

    if (tN < 0.0) {
      tN = 0.0;
      if (-d < 0.0) {
        sN = 0.0;
      } else if (-d > a) {
        sN = sD;
      } else {
        sN = -d;
        sD = a;
      }
    } else if (tN > tD) {
      tN = tD;
      if ((-d + b) < 0.0) {
        sN = 0.0;
      } else if ((-d + b) > a) {
        sN = sD;
      } else {
        sN = (-d + b);
        sD = a;
      }
    }

    var sc = Math.abs(sN) < EPS ? 0.0 : clamp(sN / Math.max(EPS, sD), 0, 1);
    var tc = Math.abs(tN) < EPS ? 0.0 : clamp(tN / Math.max(EPS, tD), 0, 1);

    var cA = v2(p1.x + sc * ux, p1.y + sc * uy);
    var cB = v2(p3.x + tc * vx, p3.y + tc * vy);
    var dist = v2Dist(cA, cB);

    return {
      sA: q(sc),
      sB: q(tc),
      pointA: cA,
      pointB: cB,
      midpoint: v2((cA.x + cB.x) * 0.5, (cA.y + cB.y) * 0.5),
      dist: q(dist)
    };
  }

  // Detect blade-on-blade clash between two weapon kinematics snapshots (or swept windows)
  function detectWeaponClash(kinA, kinB, extraTolerance) {
    var tol = (kinA.width + kinB.width) * 0.5 + (extraTolerance || 4.0);

    // Fast broad-phase AABB rejection
    var minAx = Math.min(kinA.hilt.x, kinA.tip.x) - tol;
    var maxAx = Math.max(kinA.hilt.x, kinA.tip.x) + tol;
    var minAy = Math.min(kinA.hilt.y, kinA.tip.y) - tol;
    var maxAy = Math.max(kinA.hilt.y, kinA.tip.y) + tol;

    var minBx = Math.min(kinB.hilt.x, kinB.tip.x);
    var maxBx = Math.max(kinB.hilt.x, kinB.tip.x);
    var minBy = Math.min(kinB.hilt.y, kinB.tip.y);
    var maxBy = Math.max(kinB.hilt.y, kinB.tip.y);

    if (maxAx < minBx || minAx > maxBx || maxAy < minBy || minAy > maxBy) {
      return { clashed: false, dist: Infinity };
    }

    var inter = intersectSegments(kinA.hilt, kinA.tip, kinB.hilt, kinB.tip);
    if (inter.hit) {
      return {
        clashed: true,
        exactCross: true,
        sA: inter.sA,
        sB: inter.sB,
        contactPoint: inter.point,
        dist: 0
      };
    }

    var closest = closestSegmentPoints(kinA.hilt, kinA.tip, kinB.hilt, kinB.tip);
    if (closest.dist <= tol) {
      return {
        clashed: true,
        exactCross: false,
        sA: closest.sA,
        sB: closest.sB,
        contactPoint: closest.midpoint,
        dist: closest.dist
      };
    }

    return { clashed: false, dist: closest.dist };
  }

  // Swept sub-step clash detector across phase windows [tA0..tA1] and [tB0..tB1]
  function detectSweptWeaponClash(paramsA, paramsB, subSteps) {
    var steps = clamp(Math.round(subSteps || 6), 2, 16);
    var tA0 = clamp(paramsA.tStart !== undefined ? paramsA.tStart : 0, 0, 1);
    var tA1 = clamp(paramsA.tEnd !== undefined ? paramsA.tEnd : 1, 0, 1);
    var tB0 = clamp(paramsB.tStart !== undefined ? paramsB.tStart : 0, 0, 1);
    var tB1 = clamp(paramsB.tEnd !== undefined ? paramsB.tEnd : 1, 0, 1);

    for (var i = 0; i <= steps; i++) {
      var frac = i / steps;
      var kA = sampleWeaponKinematics(Object.assign({}, paramsA, { t: lerp(tA0, tA1, frac) }));
      var kB = sampleWeaponKinematics(Object.assign({}, paramsB, { t: lerp(tB0, tB1, frac) }));
      var det = detectWeaponClash(kA, kB, paramsA.tolerance || paramsB.tolerance || 4.0);
      if (det.clashed) {
        return {
          clashed: true,
          subStepFrac: q(frac),
          kinA: kA,
          kinB: kB,
          detection: det
        };
      }
    }
    return { clashed: false, subStepFrac: -1, kinA: null, kinB: null, detection: null };
  }

  // Blade-on-blade deflection impulse & dominance solver.
  // Incorporates classical swordplay leverage (forte near hilt vs foible near tip),
  // weapon mass, angular inertia, clashTier, and relative impact velocity.
  function solveWeaponClash(kinA, kinB, detection, fighterA, fighterB) {
    if (!detection || !detection.clashed) {
      return { resolved: false, outcome: 'none' };
    }

    var profA = getProfile(kinA.weaponId);
    var profB = getProfile(kinB.weaponId);

    var sA = clamp(detection.sA, 0, 1);
    var sB = clamp(detection.sB, 0, 1);

    // Forte-vs-foible leverage: closer to hilt (s -> 0) gives stronger structural leverage
    // against deflection, while tip (s -> 1) has higher linear speed but weaker bind leverage.
    var forteA = 1.28 - 0.56 * sA;
    var forteB = 1.28 - 0.56 * sB;

    var sampleA = samplePointAtSpan(kinA, sA);
    var sampleB = samplePointAtSpan(kinB, sB);

    var relVel = v2Sub(sampleA.vel, sampleB.vel);
    var closingSpeed = v2Len(relVel);

    // Angle between the two blades (0 = parallel/glancing, PI/2 = perpendicular full bind)
    var bladeDot = Math.abs(v2Dot(kinA.dir, kinB.dir));
    var crossSin = Math.sqrt(Math.max(0, 1 - bladeDot * bladeDot));

    // Fighter weight multipliers (defaults to 1.0)
    var weightA = (fighterA && fighterA.ch && fighterA.ch.stat && fighterA.ch.stat.weight) || 1.0;
    var weightB = (fighterB && fighterB.ch && fighterB.ch.stat && fighterB.ch.stat.weight) || 1.0;

    var effMassA = (profA.mass + 0.65 * weightA) * profA.clashTier;
    var effMassB = (profB.mass + 0.65 * weightB) * profB.clashTier;

    var speedA = Math.max(90, v2Len(sampleA.vel));
    var speedB = Math.max(90, v2Len(sampleB.vel));

    // Effective clash power combines momentum, rotational energy, and bind leverage
    var powerA = (effMassA * speedA * 0.01 + kinA.kineticEnergy * 0.45) * forteA;
    var powerB = (effMassB * speedB * 0.01 + kinB.kineticEnergy * 0.45) * forteB;
    var ratio = powerA / Math.max(0.05, powerB);

    // Separation axis from B toward A (deterministic fallback using fighter faces)
    var faceA = signNonZero(fighterA && fighterA.face !== undefined ? fighterA.face : 1);
    var faceB = signNonZero(fighterB && fighterB.face !== undefined ? fighterB.face : -faceA);
    var sepDir = v2Sub(kinA.hilt, kinB.hilt);
    if (v2Len(sepDir) < EPS) {
      sepDir = { x: -faceA, y: 0 };
    } else {
      sepDir = v2Norm(sepDir);
    }

    // Restitution impulse magnitude from reduced mass * closing speed
    var reducedMass = (effMassA * effMassB) / Math.max(0.1, effMassA + effMassB);
    var restitution = 0.62;
    var baseImpulse = clamp(reducedMass * Math.max(160, closingSpeed) * (1 + restitution) * 0.42, 110, 420);

    var outcome = 'deadlock_rebound';
    var recoilA = 0;
    var recoilB = 0;
    var stunA = 0;
    var stunB = 0;
    var guardDrainA = 0;
    var guardDrainB = 0;
    var hitstopFrames = 5;

    if (crossSin < 0.24 && ratio > 0.68 && ratio < 1.48) {
      // Shallow grazing blade slide: glancing deflection with minimal stun
      outcome = 'glancing_deflect';
      recoilA = baseImpulse * 0.42 * profA.parryRecoil / Math.sqrt(weightA);
      recoilB = baseImpulse * 0.42 * profB.parryRecoil / Math.sqrt(weightB);
      stunA = 0.08;
      stunB = 0.08;
      guardDrainA = 6;
      guardDrainB = 6;
      hitstopFrames = 3;
    } else if (ratio >= 1.85) {
      // Fighter A's weapon overpowers B (heavy cleave or forte bind)
      outcome = 'dominate_a';
      recoilA = baseImpulse * 0.28 / Math.sqrt(weightA);
      recoilB = baseImpulse * 1.45 * profB.parryRecoil / Math.sqrt(weightB);
      stunA = 0.04;
      stunB = clamp(0.24 + 0.06 * (ratio - 1.85), 0.24, 0.44);
      guardDrainA = 4;
      guardDrainB = clamp(18 * profA.guardBreakFactor, 12, 42);
      hitstopFrames = 7;
    } else if (ratio <= 0.54) {
      // Fighter B's weapon overpowers A
      outcome = 'dominate_b';
      recoilA = baseImpulse * 1.45 * profA.parryRecoil / Math.sqrt(weightA);
      recoilB = baseImpulse * 0.28 / Math.sqrt(weightB);
      stunA = clamp(0.24 + 0.06 * ((1 / Math.max(0.1, ratio)) - 1.85), 0.24, 0.44);
      stunB = 0.04;
      guardDrainA = clamp(18 * profB.guardBreakFactor, 12, 42);
      guardDrainB = 4;
      hitstopFrames = 7;
    } else {
      // Balanced clash: symmetric momentum-weighted rebound
      outcome = 'deadlock_rebound';
      var shareA = effMassB / Math.max(0.1, effMassA + effMassB);
      var shareB = effMassA / Math.max(0.1, effMassA + effMassB);
      recoilA = clamp(baseImpulse * (0.75 + shareA) * profA.parryRecoil / Math.sqrt(weightA), 120, 310);
      recoilB = clamp(baseImpulse * (0.75 + shareB) * profB.parryRecoil / Math.sqrt(weightB), 120, 310);
      stunA = 0.14;
      stunB = 0.14;
      guardDrainA = 10;
      guardDrainB = 10;
      hitstopFrames = 6;
    }

    // Horizontal deflection impulses (keep vertical kick subtle so grounded clashes stay crisp)
    var impulseA = v2(sepDir.x * recoilA, clamp(sepDir.y * recoilA * 0.25, -45, 25));
    var impulseB = v2(-sepDir.x * recoilB, clamp(-sepDir.y * recoilB * 0.25, -45, 25));

    // Angular whipback torque experienced by each wrist
    var angularRecoilA = q(-signNonZero(kinA.omega || 1) * (recoilA * sA) / Math.max(0.2, profA.angularInertia * 120));
    var angularRecoilB = q(-signNonZero(kinB.omega || 1) * (recoilB * sB) / Math.max(0.2, profB.angularInertia * 120));

    // Spark spray axis perpendicular to average blade tangent
    var avgDir = v2Norm(v2Add(kinA.dir, kinB.dir));
    var sparkDir = v2(-avgDir.y, avgDir.x);

    return {
      resolved: true,
      outcome: outcome,
      contactPoint: detection.contactPoint,
      sA: q(sA),
      sB: q(sB),
      powerA: q(powerA),
      powerB: q(powerB),
      powerRatio: q(ratio),
      closingSpeed: q(closingSpeed),
      crossAngleSin: q(crossSin),
      impulseA: impulseA,
      impulseB: impulseB,
      angularRecoilA: angularRecoilA,
      angularRecoilB: angularRecoilB,
      stunA: q(stunA),
      stunB: q(stunB),
      guardDrainA: q(guardDrainA),
      guardDrainB: q(guardDrainB),
      hitstopFrames: hitstopFrames,
      sparkDir: sparkDir,
      faceA: faceA,
      faceB: faceB
    };
  }

  // ==========================================================================
  // 5. MULTI-SAMPLE SWEPT HITBOX RIBBON GENERATION & COLLISION
  // ==========================================================================
  // Prevents fast swings from tunneling through slim hurtboxes by generating
  // a deterministic ribbon of swept quads between consecutive sub-samples
  // along [tStart, tEnd].

  function computeQuadAABB(p0, p1, p2, p3, pad) {
    var margin = pad || 0;
    return [
      q(Math.min(p0.x, p1.x, p2.x, p3.x) - margin),
      q(Math.min(p0.y, p1.y, p2.y, p3.y) - margin),
      q(Math.max(p0.x, p1.x, p2.x, p3.x) + margin),
      q(Math.max(p0.y, p1.y, p2.y, p3.y) + margin)
    ];
  }

  function aabbOverlap(a, b) {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  }

  function pointInAABB(p, rect) {
    return p.x >= rect[0] && p.x <= rect[2] && p.y >= rect[1] && p.y <= rect[3];
  }

  // Liang-Barsky deterministic segment vs AABB intersection
  function intersectSegmentAABB(p0, p1, rect) {
    var dx = p1.x - p0.x;
    var dy = p1.y - p0.y;
    var tMin = 0;
    var tMax = 1;

    var checks = [
      [-dx, p0.x - rect[0]],
      [dx, rect[2] - p0.x],
      [-dy, p0.y - rect[1]],
      [dy, rect[3] - p0.y]
    ];

    for (var i = 0; i < 4; i++) {
      var p = checks[i][0];
      var r = checks[i][1];
      if (Math.abs(p) < EPS) {
        if (r < 0) return { hit: false };
      } else {
        var u = r / p;
        if (p < 0) {
          if (u > tMax) return { hit: false };
          if (u > tMin) tMin = u;
        } else {
          if (u < tMin) return { hit: false };
          if (u < tMax) tMax = u;
        }
      }
    }

    var tHit = clamp((tMin + tMax) * 0.5, 0, 1);
    return {
      hit: true,
      tEntry: q(tMin),
      tExit: q(tMax),
      s: q(tHit),
      point: v2(p0.x + dx * tHit, p0.y + dy * tHit)
    };
  }

  function pointInTriangle(pt, a, b, c) {
    var d1 = (pt.x - b.x) * (a.y - b.y) - (a.x - b.x) * (pt.y - b.y);
    var d2 = (pt.x - c.x) * (b.y - c.y) - (b.x - c.x) * (pt.y - c.y);
    var d3 = (pt.x - a.x) * (c.y - a.y) - (c.x - a.x) * (pt.y - a.y);
    var hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    var hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
  }

  function quadVsAABB(quad, rect) {
    if (!aabbOverlap(quad.aabb, rect)) return { hit: false };

    // 1. Test blade leading/trailing/swept edges against AABB
    var edges = [
      [quad.hilt0, quad.tip0],
      [quad.hilt1, quad.tip1],
      [quad.tip0, quad.tip1],
      [quad.hilt0, quad.hilt1],
      [quad.mid0, quad.mid1]
    ];

    for (var i = 0; i < edges.length; i++) {
      var res = intersectSegmentAABB(edges[i][0], edges[i][1], rect);
      if (res.hit) {
        return { hit: true, point: res.point, edgeIndex: i };
      }
    }

    // 2. Test AABB center and corners inside the swept quad (two triangles)
    var cx = (rect[0] + rect[2]) * 0.5;
    var cy = (rect[1] + rect[3]) * 0.5;
    var testPts = [
      { x: cx, y: cy },
      { x: rect[0], y: rect[1] },
      { x: rect[2], y: rect[1] },
      { x: rect[2], y: rect[3] },
      { x: rect[0], y: rect[3] }
    ];

    for (var j = 0; j < testPts.length; j++) {
      var pt = testPts[j];
      if (
        pointInTriangle(pt, quad.hilt0, quad.tip0, quad.tip1) ||
        pointInTriangle(pt, quad.hilt0, quad.tip1, quad.hilt1)
      ) {
        return { hit: true, point: v2(pt.x, pt.y), edgeIndex: -1 };
      }
    }

    return { hit: false };
  }

  // Generate a multi-sample swept hitbox ribbon over phase window [tStart, tEnd]
  function generateSweptRibbon(params) {
    var fighter = (params && params.fighter) || { x: 0, y: 0, vx: 0, vy: 0, face: 1, size: 1 };
    var weaponId = (params && params.weaponId) || resolveFighterWeaponId(fighter);
    var profile = getProfile(weaponId);
    var tStart = clamp(params && params.tStart !== undefined ? params.tStart : 0, 0, 1);
    var tEnd = clamp(params && params.tEnd !== undefined ? params.tEnd : 1, 0, 1);
    var sampleCount = clamp(Math.round((params && params.samples) || 6), 2, 24);
    var duration = Math.max(0.03, (params && params.duration) || 0.16);

    var samples = [];
    var quads = [];

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var pad = profile.width * 0.5 * (fighter.size || 1);

    for (var i = 0; i < sampleCount; i++) {
      var frac = sampleCount > 1 ? i / (sampleCount - 1) : 0;
      var t = lerp(tStart, tEnd, frac);
      var k = sampleWeaponKinematics({
        fighter: fighter,
        weaponId: weaponId,
        arcType: params && params.arcType,
        arc: params && params.arc,
        t: t,
        duration: duration,
        twoHanded: params && params.twoHanded
      });
      samples.push(k);

      minX = Math.min(minX, k.hilt.x - pad, k.tip.x - pad);
      minY = Math.min(minY, k.hilt.y - pad, k.tip.y - pad);
      maxX = Math.max(maxX, k.hilt.x + pad, k.tip.x + pad);
      maxY = Math.max(maxY, k.hilt.y + pad, k.tip.y + pad);
    }

    var sw = profile.sweetSpot;
    for (var j = 0; j < samples.length - 1; j++) {
      var s0 = samples[j];
      var s1 = samples[j + 1];

      var sweetMin0 = samplePointAtSpan(s0, sw.min).pos;
      var sweetMax0 = samplePointAtSpan(s0, sw.max).pos;
      var sweetMin1 = samplePointAtSpan(s1, sw.min).pos;
      var sweetMax1 = samplePointAtSpan(s1, sw.max).pos;

      // Swept area via cross product of diagonals
      var diag1 = v2Sub(s1.tip, s0.hilt);
      var diag2 = v2Sub(s1.hilt, s0.tip);
      var sweptArea = Math.abs(v2Cross(diag1, diag2)) * 0.5;

      quads.push({
        index: j,
        t0: s0.t,
        t1: s1.t,
        hilt0: s0.hilt,
        mid0: s0.mid,
        tip0: s0.tip,
        hilt1: s1.hilt,
        mid1: s1.mid,
        tip1: s1.tip,
        sweetQuad: [sweetMin0, sweetMax0, sweetMax1, sweetMin1],
        aabb: computeQuadAABB(s0.hilt, s0.tip, s1.tip, s1.hilt, pad),
        sweptArea: q(sweptArea),
        kinStart: s0,
        kinEnd: s1
      });
    }

    return {
      weaponId: profile.id,
      tStart: q(tStart),
      tEnd: q(tEnd),
      sampleCount: sampleCount,
      bounds: [q(minX), q(minY), q(maxX), q(maxY)],
      samples: samples,
      quads: quads
    };
  }

  // Test a swept ribbon against a target hurtbox [x0, y0, x1, y1] in chronological order.
  // Returns the earliest deterministic hit + full sweet-spot/sour-spot evaluation.
  function testRibbonVsHurtbox(ribbon, hurtboxRect, targetVel, options) {
    if (!ribbon || !hurtboxRect || !ribbon.quads || !ribbon.quads.length) {
      return { hit: false };
    }
    if (!aabbOverlap(ribbon.bounds, hurtboxRect)) {
      return { hit: false };
    }

    for (var i = 0; i < ribbon.quads.length; i++) {
      var quad = ribbon.quads[i];
      var res = quadVsAABB(quad, hurtboxRect);
      if (res.hit) {
        // Interpolate midpoint kinematics for this swept sub-quad
        var kin = quad.kinEnd;
        var evalResult = evaluateImpactZone(kin, res.point, targetVel, options);
        return {
          hit: true,
          quadIndex: i,
          tHit: q((quad.t0 + quad.t1) * 0.5),
          contactPoint: evalResult.contactPoint,
          kinematics: kin,
          impact: evalResult
        };
      }
    }

    return { hit: false };
  }

  // ==========================================================================
  // 6. ROLLBACK-DETERMINISTIC SWING TRACKER (Per-Fighter State)
  // ==========================================================================

  function createSwingTrack(fighterId) {
    return {
      fighterId: fighterId || 0,
      active: false,
      weaponId: 'sword',
      arcType: 'slash_down',
      phase: 0,
      prevPhase: 0,
      duration: 0.16,
      elapsed: 0,
      hitRegistry: {},
      clashCooldown: 0,
      lastTipX: 0,
      lastTipY: 0
    };
  }

  function startSwingTrack(track, weaponId, arcType, duration) {
    track.active = true;
    track.weaponId = PROFILES[weaponId] ? weaponId : 'sword';
    track.arcType = ARC_PRESETS[arcType] ? arcType : getProfile(track.weaponId).defaultArc.arcType;
    track.phase = 0;
    track.prevPhase = 0;
    track.duration = Math.max(0.03, duration || 0.16);
    track.elapsed = 0;
    track.hitRegistry = {};
    return track;
  }

  function stepSwingTrack(track, fighter, dt) {
    var stepDt = dt || DEFAULT_STEP;
    if (track.clashCooldown > 0) {
      track.clashCooldown = Math.max(0, q(track.clashCooldown - stepDt));
    }
    if (!track.active) return null;

    track.prevPhase = track.phase;
    track.elapsed = q(track.elapsed + stepDt);
    track.phase = clamp(q(track.elapsed / track.duration), 0, 1);

    var ribbon = generateSweptRibbon({
      fighter: fighter,
      weaponId: track.weaponId,
      arcType: track.arcType,
      tStart: track.prevPhase,
      tEnd: track.phase,
      duration: track.duration,
      samples: 4
    });

    var lastSample = ribbon.samples[ribbon.samples.length - 1];
    if (lastSample) {
      track.lastTipX = lastSample.tip.x;
      track.lastTipY = lastSample.tip.y;
    }

    if (track.elapsed >= track.duration) {
      track.active = false;
    }

    return ribbon;
  }

  function snapshotTrack(track) {
    var regCopy = {};
    var keys = Object.keys(track.hitRegistry);
    for (var i = 0; i < keys.length; i++) {
      regCopy[keys[i]] = track.hitRegistry[keys[i]];
    }
    return {
      fighterId: track.fighterId,
      active: track.active,
      weaponId: track.weaponId,
      arcType: track.arcType,
      phase: track.phase,
      prevPhase: track.prevPhase,
      duration: track.duration,
      elapsed: track.elapsed,
      hitRegistry: regCopy,
      clashCooldown: track.clashCooldown,
      lastTipX: track.lastTipX,
      lastTipY: track.lastTipY
    };
  }

  function restoreTrack(track, snap) {
    if (!snap) return track;
    track.fighterId = snap.fighterId;
    track.active = snap.active;
    track.weaponId = snap.weaponId;
    track.arcType = snap.arcType;
    track.phase = snap.phase;
    track.prevPhase = snap.prevPhase;
    track.duration = snap.duration;
    track.elapsed = snap.elapsed;
    track.clashCooldown = snap.clashCooldown;
    track.lastTipX = snap.lastTipX;
    track.lastTipY = snap.lastTipY;
    track.hitRegistry = {};
    var keys = Object.keys(snap.hitRegistry || {});
    for (var i = 0; i < keys.length; i++) {
      track.hitRegistry[keys[i]] = snap.hitRegistry[keys[i]];
    }
    return track;
  }

  // Infer best arc archetype from a RenYing move object (e.g., l1, l2, hv, a1, cs2)
  function inferArcTypeFromMove(move, weaponId) {
    var profile = getProfile(weaponId);
    if (!move || !move.name) return profile.defaultArc.arcType;
    var name = String(move.name);
    if (name === 'hv' || name === 'cs2' || name === 'slam') return 'overhead_slam';
    if (name === 'a1' || name === 'a2') return profile.category === 'blade' ? 'spin_360' : 'slash_down';
    if (name === 'l3' || name === 'l5') {
      if (weaponId === 'spear' || weaponId === 'flute') return 'thrust';
      if (weaponId === 'fists' || weaponId === 'magnet') return 'palm_drive';
      return 'slash_horiz';
    }
    if (name === 'l2') return 'slash_up';
    return profile.defaultArc.arcType;
  }

  // Export public API onto RYPhysics.Weapons
  RY.Weapons = {
    VERSION: '1.0.0',
    WEAPON_IDS: WEAPON_IDS,
    PROFILES: PROFILES,
    ARC_PRESETS: ARC_PRESETS,
    getProfile: getProfile,
    resolveFighterWeaponId: resolveFighterWeaponId,
    computeEffectiveInertia: computeEffectiveInertia,
    inferArcTypeFromMove: inferArcTypeFromMove,
    evalSwingProgress: evalSwingProgress,
    evalSwingProgressWithDerivs: evalSwingProgressWithDerivs,
    sampleWeaponKinematics: sampleWeaponKinematics,
    sampleDualWeaponKinematics: sampleDualWeaponKinematics,
    samplePointAtSpan: samplePointAtSpan,
    projectPointOntoSegment: projectPointOntoSegment,
    evaluateImpactZone: evaluateImpactZone,
    intersectSegments: intersectSegments,
    closestSegmentPoints: closestSegmentPoints,
    detectWeaponClash: detectWeaponClash,
    detectSweptWeaponClash: detectSweptWeaponClash,
    solveWeaponClash: solveWeaponClash,
    generateSweptRibbon: generateSweptRibbon,
    testRibbonVsHurtbox: testRibbonVsHurtbox,
    createSwingTrack: createSwingTrack,
    startSwingTrack: startSwingTrack,
    stepSwingTrack: stepSwingTrack,
    snapshotTrack: snapshotTrack,
    restoreTrack: restoreTrack
  };
})(RYPhysics);
