// ============================================================================
// RenYing Martial Arts Physics — Module 10: Grapple, Clinch & Throw Physics
// ----------------------------------------------------------------------------
// Deterministic, rollback-safe two-body grappling & throw dynamics:
//   - Proximity clinch capture with anti-guard / anti-armor bypass
//   - Throw-tech (拆投) escape timing window & mutual break impulse
//   - 4 directional martial arts throws:
//       1. Forward Slam  (前摔 / 过肩摔)
//       2. Back Suplex   (背摔 / 抱腰背摔)
//       3. Sky Toss      (腾空抛 / 腾空抛摔)
//       4. Acupoint Lock (擒拿锁脉)
//   - Coupled two-body Bezier arc trajectories with mass-ratio recoil
//   - Ground-slam impact shockwave, crater bounce & AoE tremor
//   - 2v2 / 8v8 crowd-throw bowling collisions with bitmask deduplication
// ============================================================================
(function (root) {
  'use strict';

  var RYPhysics = (typeof window !== 'undefined'
    ? (window.RYPhysics = window.RYPhysics || {})
    : (root.RYPhysics = root.RYPhysics || {}));

  // --------------------------------------------------------------------------
  // 1. Deterministic Math & Environment Helpers
  // --------------------------------------------------------------------------
  var EPS = 1e-6;
  var PI = Math.PI;
  var TWO_PI = Math.PI * 2;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function signOr(v, fallback) {
    if (v > EPS) return 1;
    if (v < -EPS) return -1;
    return fallback !== undefined ? fallback : 1;
  }

  function quantize(v) {
    return Math.round(v * 1000) * 0.001;
  }

  function easeOutCubic(t) {
    var u = 1 - clamp(t, 0, 1);
    return 1 - u * u * u;
  }

  function easeInQuad(t) {
    var c = clamp(t, 0, 1);
    return c * c;
  }

  function easeInOutSine(t) {
    var c = clamp(t, 0, 1);
    return 0.5 * (1 - Math.cos(PI * c));
  }

  function cubicBezier1D(p0, p1, p2, p3, t) {
    var c = clamp(t, 0, 1);
    var u = 1 - c;
    return (u * u * u) * p0
      + 3 * (u * u) * c * p1
      + 3 * u * (c * c) * p2
      + (c * c * c) * p3;
  }

  function getStageBounds() {
    var w = typeof STAGE_W !== 'undefined' ? STAGE_W : 1600;
    var wall = typeof WALL !== 'undefined' ? WALL : 60;
    return { minX: wall, maxX: w - wall, width: w, wall: wall };
  }

  function getFighterWeight(f) {
    if (!f) return 1.0;
    var w = (f.ch && f.ch.stat && f.ch.stat.weight) ? f.ch.stat.weight : 1.0;
    return clamp(w, 0.55, 2.4);
  }

  function getFighterSize(f) {
    if (!f) return 1.0;
    var s = f.size || (f.ch && f.ch.stat && f.ch.stat.size) || 1.0;
    return clamp(s, 0.7, 1.8);
  }

  function getFighterTeam(f) {
    if (!f) return -1;
    if (typeof fighterTeam === 'function') return fighterTeam(f);
    return (f.idx || 0) % 2;
  }

  function isFighterGrounded(f) {
    if (!f) return true;
    if (typeof f.onGround === 'function') return !!f.onGround();
    return (f.y || 0) >= -2 && (f.vy || 0) >= 0;
  }

  function isResimulating() {
    return typeof RESIM !== 'undefined' && !!RESIM;
  }

  function getActiveFighters(listOverride) {
    if (Array.isArray(listOverride)) return listOverride;
    if (typeof allFighters === 'function') return allFighters();
    if (typeof FIGHTERS !== 'undefined' && Array.isArray(FIGHTERS)) {
      var out = [];
      for (var i = 0; i < FIGHTERS.length; i++) {
        if (FIGHTERS[i] && !FIGHTERS[i].hidden) out.push(FIGHTERS[i]);
      }
      return out;
    }
    return [];
  }

  function findFighterByIdx(idx, pool) {
    if (idx < 0) return null;
    if (typeof fighterByIdx === 'function') {
      var f = fighterByIdx(idx);
      if (f && f.idx === idx) return f;
    }
    var list = getActiveFighters(pool);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].idx === idx) return list[i];
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // 2. Grapple & Throw Configuration Tables
  // --------------------------------------------------------------------------
  var CONFIG = {
    // Clinch capture envelope
    grabStartupSec: 0.085,        // ~5 frames at 60fps
    grabActiveSec: 0.055,         // ~3 frames active capture window
    grabWhiffSec: 0.34,           // ~20 frames whiff recovery
    grabReachX: 98,               // Base horizontal reach (scaled by size)
    grabReachY: 64,               // Vertical tolerance for ground grabs
    airGrabReachX: 92,
    airGrabReachY: 78,
    backReachTolerance: 22,       // Slight overlap behind center allowed

    // Throw-tech (拆投) parameters
    clinchDurationSec: 0.165,     // ~10 frames clinch hold before throw commits
    techWindowSec: 0.145,         // ~8-9 frames victim can press grab to tech
    techPushVelX: 340,            // Symmetric separation velocity on tech
    techInvulSec: 0.22,           // Post-tech throw & strike grace
    techMeterGain: 6,             // Small qi gain for successful tech
    techGuardRestore: 10,         // Posture recovery on tech
    postHitThrowInvulSec: 0.14,   // Brief throw protection after blockstun/wakeup
    grappleCooldownSec: 0.42,     // Prevent frame-1 infinite re-grab loop

    // Ground slam & bounce physics
    slamGravity: 1950,            // Downward gravity for thrown victims
    defaultRestitutionY: 0.42,    // Vertical bounce coefficient
    defaultRestitutionX: 0.68,    // Horizontal friction retention on bounce
    minBounceSpeedY: 165,         // Threshold below which victim settles on ground
    shockwaveBaseRadius: 155,     // Base AoE shockwave radius on heavy slam
    shockwaveMaxDamage: 14,       // Splash damage to nearby enemies in 2v2/8v8

    // Crowd-throw bowling parameters
    crowdHitRadiusX: 62,
    crowdHitRadiusY: 84,
    crowdRestitution: 0.58,
    crowdBaseDamage: 18,
    crowdMeterBonus: 8,
    crowdStunSec: 0.42,
    crowdLaunchVy: -290,

    // Interruption safety
    interruptionDamageThreshold: 1 // Any external hit on thrower breaks clinch/lock
  };

  // 4 Directional Martial Arts Throws
  var THROWS = {
    forward_slam: {
      id: 'forward_slam',
      name: '前摔',
      label: '过肩前摔',
      dirKey: 'forward',
      flipFacing: false,
      totalSec: 0.44,
      releaseFrac: 0.72,
      damage: 42,
      meterAttacker: 10,
      meterVictim: 6,
      guardDrain: 0,
      hitstopSec: 0.095,
      shake: 11,
      // Coupled 2-body cubic Bezier relative offsets (victim relative to thrower, x in facing dir, y up negative)
      arcX: [52, 22, -14, 96],
      arcY: [-12, -108, -124, -6],
      // Attacker torso recoil offsets (applied as micro-shift)
      attShiftX: [0, -10, 14, 24],
      attLeanRot: [0.0, -0.22, 0.35, 0.18],
      // Victim spin angle (radians) across throw progress
      victimSpinStart: 0.0,
      victimSpinEnd: PI * 1.15,
      // Release velocity (facing-aligned X, downward/upward Y)
      releaseVx: 390,
      releaseVy: 520,
      bounceRestitutionY: 0.46,
      bounceRestitutionX: 0.72,
      causesSlam: true,
      shockwaveScale: 1.0,
      juggleLaunch: false,
      crowdBowling: true,
      crowdDmgScale: 1.05,
      stunSec: 0.56
    },

    back_suplex: {
      id: 'back_suplex',
      name: '背摔',
      label: '抱腰背摔',
      dirKey: 'back',
      flipFacing: true,
      totalSec: 0.52,
      releaseFrac: 0.76,
      damage: 48,
      meterAttacker: 13,
      meterVictim: 7,
      guardDrain: 0,
      hitstopSec: 0.115,
      shake: 14,
      // High back-arch suplex: starts in front (+44), arches high over head (-138), slams behind (-104)
      arcX: [44, 8, -58, -104],
      arcY: [-18, -138, -132, -4],
      attShiftX: [0, -8, -28, -36],
      attLeanRot: [0.0, -0.45, -0.95, -0.32],
      victimSpinStart: 0.0,
      victimSpinEnd: -PI * 1.45,
      releaseVx: -310,
      releaseVy: 610,
      bounceRestitutionY: 0.52,
      bounceRestitutionX: 0.62,
      causesSlam: true,
      shockwaveScale: 1.28,
      juggleLaunch: false,
      crowdBowling: true,
      crowdDmgScale: 1.15,
      stunSec: 0.64
    },

    sky_toss: {
      id: 'sky_toss',
      name: '腾空抛',
      label: '腾空抛摔',
      dirKey: 'up',
      flipFacing: false,
      totalSec: 0.36,
      releaseFrac: 0.68,
      damage: 28,
      meterAttacker: 9,
      meterVictim: 5,
      guardDrain: 0,
      hitstopSec: 0.06,
      shake: 7,
      // Low squat dip then explosive upward sky-launch
      arcX: [46, 36, 48, 66],
      arcY: [-8, 10, -86, -148],
      attShiftX: [0, -6, 6, 12],
      attLeanRot: [0.0, 0.25, -0.28, -0.14],
      victimSpinStart: 0.0,
      victimSpinEnd: PI * 0.85,
      releaseVx: 175,
      releaseVy: -640,
      bounceRestitutionY: 0.28,
      bounceRestitutionX: 0.78,
      causesSlam: false,
      shockwaveScale: 0.0,
      juggleLaunch: true,
      crowdBowling: true,
      crowdDmgScale: 0.85,
      stunSec: 0.68
    },

    acupoint_lock: {
      id: 'acupoint_lock',
      name: '擒拿锁脉',
      label: '擒拿锁脉',
      dirKey: 'down',
      flipFacing: false,
      totalSec: 0.58,
      releaseFrac: 0.88,
      damage: 36,
      meterAttacker: 12,
      meterVictim: -12,           // Drains victim's qi (内力封锁)
      guardDrain: 28,             // Breaks posture stability
      hitstopSec: 0.05,
      shake: 8,
      // Tight close-quarters joint lock with 3 acupoint strike pulses
      arcX: [54, 48, 52, 68],
      arcY: [-14, -22, -16, -24],
      attShiftX: [0, 4, 8, 16],
      attLeanRot: [0.0, 0.12, 0.18, 0.26],
      victimSpinStart: 0.0,
      victimSpinEnd: 0.28,
      releaseVx: 360,
      releaseVy: -155,
      bounceRestitutionY: 0.0,
      bounceRestitutionX: 0.8,
      causesSlam: false,
      shockwaveScale: 0.0,
      juggleLaunch: false,
      crowdBowling: true,
      crowdDmgScale: 0.75,
      stunSec: 0.52,
      // Acupoint-specific meridian pulse timing
      pulseFracs: [0.24, 0.52, 0.80],
      pulseDamageFrac: [0.22, 0.28, 0.50],
      sealDebuffSec: 3.2,
      slowDebuffSec: 2.0
    }
  };

  // --------------------------------------------------------------------------
  // 3. Per-Fighter Serializable State Management
  // --------------------------------------------------------------------------
  function createDefaultState() {
    return {
      phase: 'none',           // none | startup | clinch | executing | whiff | teched | victim_clinch | victim_thrown | victim_locked
      role: 'none',            // none | attacker | victim
      partnerIdx: -1,
      throwId: '',
      timer: 0,
      phaseDuration: 0,
      totalDuration: 0,
      dir: 1,                  // Throw facing direction at capture
      techWindowT: 0,
      techAttempted: false,
      techResult: '',          // '' | 'escaped' | 'late'
      throwInvulT: 0,
      grappleCD: 0,
      anchorX: 0,
      anchorY: 0,
      lastAttOffsetX: 0,
      pulseIndex: 0,
      released: false,
      slamTriggered: false,
      bounceCount: 0,
      crowdHitMask: 0,
      airThrow: false,
      inputDirX: 0,
      inputDirY: 0,
      savedAttHp: 0,
      spinAngle: 0,
      spinVel: 0,
      lastThrowId: '',
      throwsLanded: 0,
      techsEscaped: 0,
      crowdHitsTotal: 0
    };
  }

  function ensureState(f) {
    if (!f) return null;
    if (!f._ryPhys) f._ryPhys = {};
    if (!f._ryPhys.grapple) f._ryPhys.grapple = createDefaultState();
    return f._ryPhys.grapple;
  }

  function resetState(f) {
    if (!f) return null;
    if (!f._ryPhys) f._ryPhys = {};
    f._ryPhys.grapple = createDefaultState();
    return f._ryPhys.grapple;
  }

  function snapshotState(f) {
    var s = ensureState(f);
    if (!s) return null;
    return {
      phase: s.phase,
      role: s.role,
      partnerIdx: s.partnerIdx,
      throwId: s.throwId,
      timer: s.timer,
      phaseDuration: s.phaseDuration,
      totalDuration: s.totalDuration,
      dir: s.dir,
      techWindowT: s.techWindowT,
      techAttempted: s.techAttempted,
      techResult: s.techResult,
      throwInvulT: s.throwInvulT,
      grappleCD: s.grappleCD,
      anchorX: s.anchorX,
      anchorY: s.anchorY,
      lastAttOffsetX: s.lastAttOffsetX,
      pulseIndex: s.pulseIndex,
      released: s.released,
      slamTriggered: s.slamTriggered,
      bounceCount: s.bounceCount,
      crowdHitMask: s.crowdHitMask,
      airThrow: s.airThrow,
      inputDirX: s.inputDirX,
      inputDirY: s.inputDirY,
      savedAttHp: s.savedAttHp,
      spinAngle: s.spinAngle,
      spinVel: s.spinVel,
      lastThrowId: s.lastThrowId,
      throwsLanded: s.throwsLanded,
      techsEscaped: s.techsEscaped,
      crowdHitsTotal: s.crowdHitsTotal
    };
  }

  function restoreState(f, snap) {
    if (!f || !snap) return;
    var s = ensureState(f);
    for (var k in snap) {
      if (Object.prototype.hasOwnProperty.call(snap, k)) {
        s[k] = snap[k];
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. Clinch Capture, Anti-Guard / Anti-Armor Bypass & Direction Selection
  // --------------------------------------------------------------------------
  function isBusyInGrapple(f) {
    var s = ensureState(f);
    if (!s) return false;
    return s.phase !== 'none';
  }

  function canInitiateGrab(att) {
    if (!att || att.hidden || (att.hp || 0) <= 0) return false;
    var s = ensureState(att);
    if (s.phase !== 'none' || s.grappleCD > 0) return false;
    if ((att.stun || 0) > 0) return false;
    var st = att.state || 'idle';
    if (st === 'hitstun' || st === 'blockstun' || st === 'knockdown' || st === 'ko' || st === 'special') {
      return false;
    }
    return true;
  }

  function isTargetGrabbable(att, def, airThrow) {
    if (!att || !def || att === def) return false;
    if (def.hidden || (def.hp || 0) <= 0) return false;
    if (getFighterTeam(att) === getFighterTeam(def)) return false;

    // Hard invulnerability and escape states cannot be grabbed
    if ((def.invul || 0) > 0 || def.escInvul) return false;
    if (def.state === 'knockdown' || def.state === 'ko' || def.state === 'special') return false;

    // Post-tech / wakeup throw immunity
    var ds = ensureState(def);
    if (ds.throwInvulT > 0) return false;

    // Already locked in another fighter's grapple (prevent double-clinch desync in 2v2/8v8)
    if (ds.phase === 'clinch' || ds.phase === 'executing'
      || ds.phase === 'victim_clinch' || ds.phase === 'victim_thrown' || ds.phase === 'victim_locked') {
      return false;
    }

    // Ground vs Air throw compatibility
    var defGrounded = isFighterGrounded(def);
    if (airThrow) {
      if (defGrounded && (def.y || 0) > -18) return false;
    } else {
      if (!defGrounded && (def.y || 0) < -CONFIG.grabReachY) return false;
    }

    // Proximity envelope check (scaled by both fighters' sizes)
    var attSize = getFighterSize(att);
    var defSize = getFighterSize(def);
    var scale = 0.5 * (attSize + defSize);
    var maxReachX = (airThrow ? CONFIG.airGrabReachX : CONFIG.grabReachX) * scale;
    var maxReachY = (airThrow ? CONFIG.airGrabReachY : CONFIG.grabReachY) * scale;

    var face = signOr(att.face, 1);
    var dx = (def.x - att.x) * face;
    var dy = Math.abs((def.y || 0) - (att.y || 0));

    if (dx < -CONFIG.backReachTolerance || dx > maxReachX) return false;
    if (dy > maxReachY) return false;

    // Note: Intentionally bypasses def.state === 'block', def.armorT > 0, def.armorHits > 0,
    // def.parryT > 0, and def.qiParryT > 0 (Anti-Guard & Anti-Armor Bypass).
    return true;
  }

  function detectBypassFlags(def) {
    if (!def) return { bypassedGuard: false, bypassedArmor: false, bypassedParry: false };
    var holdingBlock = !!(def.ctrl && def.ctrl.held && def.ctrl.held.down);
    var bypassedGuard = def.state === 'block' || def.state === 'blockstun'
      || (holdingBlock && (def.state === 'idle' || def.state === 'walk'));
    var bypassedArmor = (def.armorT || 0) > 0 || (def.armorHits || 0) > 0;
    var bypassedParry = (def.parryT || 0) > 0 || (def.qiParryT || 0) > 0 || (def.thunderGuardT || 0) > 0;
    return {
      bypassedGuard: bypassedGuard,
      bypassedArmor: bypassedArmor,
      bypassedParry: bypassedParry
    };
  }

  function readDirectionalInput(f, explicitDir) {
    if (explicitDir && (typeof explicitDir.x === 'number' || typeof explicitDir.y === 'number')) {
      return {
        x: clamp(Math.round(explicitDir.x || 0), -1, 1),
        y: clamp(Math.round(explicitDir.y || 0), -1, 1)
      };
    }
    var held = (f && f.ctrl && f.ctrl.held) ? f.ctrl.held : null;
    if (!held) return { x: 0, y: 0 };
    var x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    var y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
    return { x: x, y: y };
  }

  function selectThrowId(att, inputDir) {
    var face = signOr(att.face, 1);
    var relX = (inputDir.x || 0) * face;
    var relY = inputDir.y || 0;

    if (relY < 0) return 'sky_toss';          // Up + Grab -> 腾空抛
    if (relY > 0) return 'acupoint_lock';     // Down + Grab -> 擒拿锁脉
    if (relX < 0) return 'back_suplex';       // Back + Grab -> 背摔
    return 'forward_slam';                    // Forward / Neutral + Grab -> 前摔
  }

  function findClincheableTarget(att, fighters, airThrow) {
    var pool = getActiveFighters(fighters);
    var best = null;
    var bestDistSq = Infinity;
    for (var i = 0; i < pool.length; i++) {
      var cand = pool[i];
      if (!isTargetGrabbable(att, cand, airThrow)) continue;
      var dx = cand.x - att.x;
      var dy = (cand.y || 0) - (att.y || 0);
      var d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = cand;
      }
    }
    return best;
  }

  // Initiate a grab attempt (enters brief startup, or directly resolves if immediate)
  function initiateGrab(att, fighters, opts) {
    opts = opts || {};
    if (!canInitiateGrab(att)) {
      return { started: false, reason: 'cannot_initiate' };
    }
    var as = ensureState(att);
    var dirIn = readDirectionalInput(att, opts.inputDir);
    var airThrow = !isFighterGrounded(att);

    // If victim is currently in clinch and presses grab, treat as throw-tech!
    if (as.phase === 'victim_clinch') {
      return attemptTech(att, fighters);
    }

    as.phase = 'startup';
    as.role = 'attacker';
    as.partnerIdx = -1;
    as.throwId = selectThrowId(att, dirIn);
    as.timer = 0;
    as.phaseDuration = CONFIG.grabStartupSec;
    as.totalDuration = CONFIG.grabStartupSec;
    as.dir = signOr(att.face, 1);
    as.airThrow = airThrow;
    as.inputDirX = dirIn.x;
    as.inputDirY = dirIn.y;
    as.released = false;
    as.slamTriggered = false;
    as.pulseIndex = 0;
    as.crowdHitMask = 0;
    as.savedAttHp = att.hp || 0;

    att.state = 'grapple_start';
    att.t = 0;
    att.vx = (att.vx || 0) * 0.35;

    if (opts.immediate) {
      return resolveGrabAttempt(att, fighters, []);
    }
    return { started: true, throwId: as.throwId, airThrow: airThrow };
  }

  function resolveGrabAttempt(att, fighters, events) {
    var as = ensureState(att);
    var target = findClincheableTarget(att, fighters, as.airThrow);

    if (!target) {
      // Grab whiffed
      as.phase = 'whiff';
      as.role = 'attacker';
      as.timer = 0;
      as.phaseDuration = CONFIG.grabWhiffSec;
      as.grappleCD = CONFIG.grappleCooldownSec;
      att.state = 'grapple_whiff';
      att.t = 0;
      att.vx = as.dir * 60;
      events.push({
        type: 'grab_whiff',
        attackerIdx: att.idx,
        x: att.x + as.dir * 42,
        y: (att.y || 0) - 54
      });
      return { captured: false, whiffed: true };
    }

    var ds = ensureState(target);

    // Simultaneous grab clash -> instant mutual throw-tech!
    if (ds.phase === 'startup' && ds.role === 'attacker') {
      return resolveThrowTech(att, target, events, 'simultaneous');
    }

    // Successful clinch capture!
    var bypass = detectBypassFlags(target);
    var dir = signOr(target.x - att.x, as.dir);
    att.face = dir;
    target.face = -dir;

    // Strip bypassed defensive states cleanly
    target.armorT = 0;
    target.armorHits = 0;
    target.parryT = 0;
    target.qiParryT = 0;
    target.thunderGuardT = 0;
    target.move = null;

    var anchorX = clamp(att.x, getStageBounds().minX + 36, getStageBounds().maxX - 36);
    var anchorY = as.airThrow ? Math.min(att.y || 0, -24) : 0;

    as.phase = 'clinch';
    as.role = 'attacker';
    as.partnerIdx = target.idx;
    as.timer = 0;
    as.phaseDuration = CONFIG.clinchDurationSec;
    as.dir = dir;
    as.anchorX = anchorX;
    as.anchorY = anchorY;
    as.lastAttOffsetX = 0;
    as.savedAttHp = att.hp || 0;
    as.crowdHitMask = (1 << (att.idx & 31)) | (1 << (target.idx & 31));

    ds.phase = 'victim_clinch';
    ds.role = 'victim';
    ds.partnerIdx = att.idx;
    ds.throwId = as.throwId;
    ds.timer = 0;
    ds.phaseDuration = CONFIG.clinchDurationSec;
    ds.dir = dir;
    ds.techWindowT = CONFIG.techWindowSec;
    ds.techAttempted = false;
    ds.techResult = '';
    ds.anchorX = anchorX;
    ds.anchorY = anchorY;
    ds.released = false;
    ds.slamTriggered = false;
    ds.bounceCount = 0;
    ds.crowdHitMask = as.crowdHitMask;

    att.state = 'clinch';
    att.t = 0;
    att.vx = 0;
    att.vy = 0;
    target.state = 'clinched';
    target.t = 0;
    target.vx = 0;
    target.vy = 0;
    target.x = clamp(anchorX + dir * 48, getStageBounds().minX, getStageBounds().maxX);
    target.y = anchorY;

    events.push({
      type: 'clinch_capture',
      attackerIdx: att.idx,
      victimIdx: target.idx,
      throwId: as.throwId,
      x: (att.x + target.x) * 0.5,
      y: anchorY - 58,
      bypassedGuard: bypass.bypassedGuard,
      bypassedArmor: bypass.bypassedArmor,
      bypassedParry: bypass.bypassedParry
    });

    return {
      captured: true,
      victimIdx: target.idx,
      throwId: as.throwId,
      bypass: bypass
    };
  }

  // --------------------------------------------------------------------------
  // 5. Throw-Tech (拆投) Escape Solver
  // --------------------------------------------------------------------------
  function attemptTech(victim, fighters, events) {
    events = events || [];
    if (!victim) return { teched: false, reason: 'no_victim' };
    var vs = ensureState(victim);
    if (vs.phase !== 'victim_clinch') {
      return { teched: false, reason: 'not_in_clinch' };
    }
    var att = findFighterByIdx(vs.partnerIdx, fighters);
    if (!att) {
      resetState(victim);
      return { teched: false, reason: 'missing_attacker' };
    }
    if (vs.techWindowT > 0 && !vs.techAttempted) {
      vs.techAttempted = true;
      vs.techResult = 'escaped';
      return resolveThrowTech(att, victim, events, 'escape');
    }
    // Late tech attempt — failed escape
    vs.techAttempted = true;
    vs.techResult = 'late';
    return { teched: false, reason: 'window_expired' };
  }

  function resolveThrowTech(att, def, events, kind) {
    var as = ensureState(att);
    var ds = ensureState(def);
    var sepDir = signOr(def.x - att.x, signOr(att.face, 1));
    var midX = (att.x + def.x) * 0.5;
    var midY = ((att.y || 0) + (def.y || 0)) * 0.5 - 56;

    // Elastic weight-scaled separation velocities
    var wA = getFighterWeight(att);
    var wD = getFighterWeight(def);
    var totalW = wA + wD;
    var pushA = CONFIG.techPushVelX * (2 * wD / totalW);
    var pushD = CONFIG.techPushVelX * (2 * wA / totalW);

    att.vx = -sepDir * pushA;
    att.vy = isFighterGrounded(att) ? 0 : -140;
    def.vx = sepDir * pushD;
    def.vy = isFighterGrounded(def) ? 0 : -140;

    att.state = isFighterGrounded(att) ? 'idle' : 'air';
    def.state = isFighterGrounded(def) ? 'idle' : 'air';
    att.t = 0;
    def.t = 0;
    att.stun = 0.08;
    def.stun = 0.08;

    // Reward tech defender with posture & small qi recovery
    def.meter = Math.min(100, (def.meter || 0) + CONFIG.techMeterGain);
    if (typeof def.guard === 'number' && typeof def.maxGuard === 'number') {
      def.guard = Math.min(def.maxGuard, def.guard + CONFIG.techGuardRestore);
    }

    var savedThrowsA = as.throwsLanded;
    var savedTechsA = as.techsEscaped;
    var savedCrowdA = as.crowdHitsTotal;
    var savedThrowsD = ds.throwsLanded;
    var savedTechsD = ds.techsEscaped + 1;
    var savedCrowdD = ds.crowdHitsTotal;

    resetState(att);
    resetState(def);

    as = ensureState(att);
    ds = ensureState(def);
    as.throwInvulT = CONFIG.techInvulSec;
    ds.throwInvulT = CONFIG.techInvulSec;
    as.grappleCD = CONFIG.grappleCooldownSec * 0.75;
    ds.grappleCD = CONFIG.grappleCooldownSec * 0.75;
    as.throwsLanded = savedThrowsA;
    as.techsEscaped = savedTechsA;
    as.crowdHitsTotal = savedCrowdA;
    ds.throwsLanded = savedThrowsD;
    ds.techsEscaped = savedTechsD;
    ds.crowdHitsTotal = savedCrowdD;

    events.push({
      type: 'throw_tech',
      kind: kind || 'escape',
      attackerIdx: att.idx,
      victimIdx: def.idx,
      x: midX,
      y: midY,
      label: '拆投'
    });

    return { teched: true, kind: kind || 'escape', x: midX, y: midY };
  }

  // --------------------------------------------------------------------------
  // 6. Coupled Two-Body Arc Trajectory Solver
  // --------------------------------------------------------------------------
  function getThrowDef(throwId) {
    return THROWS[throwId] || THROWS.forward_slam;
  }

  function sampleThrowKinematics(throwDef, progress, dir, massRatio) {
    var t = clamp(progress, 0, 1);
    // Ease-in-out timing gives crisp martial arts windup and explosive snap
    var curveT = t < 0.35
      ? easeInOutSine(t / 0.35) * 0.35
      : 0.35 + easeOutCubic((t - 0.35) / 0.65) * 0.65;

    var rx = cubicBezier1D(
      throwDef.arcX[0], throwDef.arcX[1], throwDef.arcX[2], throwDef.arcX[3], curveT
    );
    var ry = cubicBezier1D(
      throwDef.arcY[0], throwDef.arcY[1], throwDef.arcY[2], throwDef.arcY[3], curveT
    );

    // Heavier victim compresses arc height slightly and increases thrower recoil
    var recoilScale = clamp(1 / massRatio, 0.65, 1.45);
    var attShiftX = cubicBezier1D(
      throwDef.attShiftX[0], throwDef.attShiftX[1], throwDef.attShiftX[2], throwDef.attShiftX[3], curveT
    ) * recoilScale;
    var attLean = cubicBezier1D(
      throwDef.attLeanRot[0], throwDef.attLeanRot[1], throwDef.attLeanRot[2], throwDef.attLeanRot[3], curveT
    ) * dir;

    var spin = lerp(throwDef.victimSpinStart, throwDef.victimSpinEnd, curveT) * dir;

    return {
      victimRelX: quantize(rx * dir),
      victimRelY: quantize(ry * clamp(0.85 + 0.15 * massRatio, 0.78, 1.12)),
      attOffsetX: quantize(attShiftX * dir),
      attLeanRot: quantize(attLean),
      victimSpin: quantize(spin)
    };
  }

  function computeScaledThrowDamage(att, def, baseDamage, throwId) {
    var dmg = baseDamage;
    if (RYPhysics.ComboEngine && typeof RYPhysics.ComboEngine.getProratedDamage === 'function') {
      dmg = RYPhysics.ComboEngine.getProratedDamage(att, def, baseDamage, {
        category: 'grapple',
        moveId: throwId,
        isThrow: true
      });
    }
    return Math.max(1, Math.round(dmg));
  }

  function applyDamageSafe(att, def, dmg) {
    if (!def || dmg <= 0) return 0;
    var before = def.hp || 0;
    def.hp = Math.max(0, before - dmg);
    def.flash = 0.14;
    return before - def.hp;
  }

  function commitClinchToThrow(att, def, events) {
    var as = ensureState(att);
    var ds = ensureState(def);

    // Allow attacker to steer throw direction during clinch before commit
    var liveDir = readDirectionalInput(att, null);
    if (liveDir.x !== 0 || liveDir.y !== 0) {
      as.throwId = selectThrowId(att, liveDir);
      ds.throwId = as.throwId;
    }

    var defObj = getThrowDef(as.throwId);
    as.phase = 'executing';
    as.timer = 0;
    as.phaseDuration = defObj.totalSec;
    as.totalDuration = defObj.totalSec;
    as.pulseIndex = 0;
    as.released = false;
    as.lastAttOffsetX = 0;
    as.lastThrowId = defObj.id;

    ds.phase = defObj.id === 'acupoint_lock' ? 'victim_locked' : 'victim_thrown';
    ds.timer = 0;
    ds.phaseDuration = defObj.totalSec;
    ds.techWindowT = 0;
    ds.released = false;
    ds.slamTriggered = false;
    ds.bounceCount = 0;

    att.state = 'throw_exec';
    att.t = 0;
    def.state = 'thrown';
    def.t = 0;

    events.push({
      type: 'throw_commit',
      attackerIdx: att.idx,
      victimIdx: def.idx,
      throwId: defObj.id,
      name: defObj.name,
      label: defObj.label,
      x: att.x,
      y: (att.y || 0) - 64
    });
  }

  function stepExecutingThrow(att, def, dt, fighters, events) {
    var as = ensureState(att);
    var ds = ensureState(def);
    var defObj = getThrowDef(as.throwId);

    // Interruption check: if a third party hits the thrower before release, abort safely
    if (!as.released && (att.hp || 0) < as.savedAttHp - CONFIG.interruptionDamageThreshold) {
      abortGrapple(att, def, events, 'interrupted');
      return;
    }
    as.savedAttHp = att.hp || 0;

    as.timer += dt;
    ds.timer = as.timer;
    var progress = clamp(as.timer / Math.max(EPS, defObj.totalSec), 0, 1);

    var wA = getFighterWeight(att);
    var wD = getFighterWeight(def);
    var massRatio = clamp(wA / wD, 0.55, 1.85);
    var bounds = getStageBounds();

    // Handle Acupoint Lock multi-pulse strikes
    if (defObj.id === 'acupoint_lock' && Array.isArray(defObj.pulseFracs)) {
      while (as.pulseIndex < defObj.pulseFracs.length && progress >= defObj.pulseFracs[as.pulseIndex]) {
        var frac = defObj.pulseDamageFrac[as.pulseIndex] || 0.33;
        var pulseDmg = computeScaledThrowDamage(att, def, defObj.damage * frac, defObj.id);
        applyDamageSafe(att, def, pulseDmg);
        // Drain qi & posture on each meridian pulse
        def.meter = clamp((def.meter || 0) + (defObj.meterVictim * frac), 0, 100);
        if (typeof def.guard === 'number') {
          def.guard = Math.max(0, def.guard - defObj.guardDrain * frac);
        }
        att.meter = clamp((att.meter || 0) + (defObj.meterAttacker * frac), 0, 100);

        events.push({
          type: 'acupoint_pulse',
          attackerIdx: att.idx,
          victimIdx: def.idx,
          pulseIndex: as.pulseIndex,
          damage: pulseDmg,
          x: def.x,
          y: (def.y || 0) - 62,
          hitstopSec: defObj.hitstopSec,
          shake: defObj.shake * 0.65
        });
        as.pulseIndex++;
      }
    }

    // Coupled two-body kinematics while victim is still held
    if (!as.released) {
      var kin = sampleThrowKinematics(defObj, progress, as.dir, massRatio);
      var targetAttX = clamp(as.anchorX + kin.attOffsetX, bounds.minX + 24, bounds.maxX - 24);
      att.x = targetAttX;
      att.rot = kin.attLeanRot;
      as.lastAttOffsetX = kin.attOffsetX;

      var prevVx = def.x;
      var prevVy = def.y || 0;
      var targetDefX = clamp(att.x + kin.victimRelX, bounds.minX, bounds.maxX);
      var targetDefY = Math.min(0, as.anchorY + kin.victimRelY);

      def.x = targetDefX;
      def.y = targetDefY;
      def.vx = dt > EPS ? (def.x - prevVx) / dt : 0;
      def.vy = dt > EPS ? (def.y - prevVy) / dt : 0;
      def.rot = kin.victimSpin;
      ds.spinAngle = kin.victimSpin;

      // Check crowd-throw bowling even during the swing arc!
      if (defObj.crowdBowling && progress >= 0.32) {
        resolveCrowdThrowCollisions(att, def, defObj, fighters, events, 0.75);
      }

      // Check release threshold
      if (progress >= defObj.releaseFrac) {
        releaseThrownVictim(att, def, defObj, massRatio, events);
      }
    } else {
      // Attacker follow-through recovery after releasing victim
      var recFrac = clamp((progress - defObj.releaseFrac) / Math.max(EPS, 1 - defObj.releaseFrac), 0, 1);
      att.rot = lerp(att.rot || 0, 0, recFrac);
    }

    // End attacker execution state when throw animation completes
    if (progress >= 1.0) {
      if (defObj.flipFacing) {
        att.face = -as.dir;
      }
      att.rot = 0;
      att.state = isFighterGrounded(att) ? 'idle' : 'air';
      att.t = 0;
      as.throwsLanded++;

      var keepLanded = as.throwsLanded;
      var keepTechs = as.techsEscaped;
      var keepCrowd = as.crowdHitsTotal;
      var keepLast = defObj.id;

      resetState(att);
      as = ensureState(att);
      as.grappleCD = CONFIG.grappleCooldownSec;
      as.throwsLanded = keepLanded;
      as.techsEscaped = keepTechs;
      as.crowdHitsTotal = keepCrowd;
      as.lastThrowId = keepLast;
    }
  }

  function releaseThrownVictim(att, def, defObj, massRatio, events) {
    var as = ensureState(att);
    var ds = ensureState(def);

    as.released = true;
    ds.released = true;

    // Velocity scaling by mass ratio (lighter victim flies further/faster)
    var velScale = clamp(0.72 + 0.28 * massRatio, 0.72, 1.32);
    def.vx = quantize(defObj.releaseVx * as.dir * velScale);
    def.vy = quantize(defObj.releaseVy * velScale);
    ds.spinVel = (defObj.victimSpinEnd - defObj.victimSpinStart) * as.dir * 2.4;

    if (defObj.id !== 'acupoint_lock') {
      var dmg = computeScaledThrowDamage(att, def, defObj.damage, defObj.id);
      applyDamageSafe(att, def, dmg);
      att.meter = clamp((att.meter || 0) + defObj.meterAttacker, 0, 100);
      def.meter = clamp((def.meter || 0) + defObj.meterVictim, 0, 100);

      // Register hit in ComboEngine if available
      if (RYPhysics.ComboEngine && typeof RYPhysics.ComboEngine.recordHit === 'function') {
        RYPhysics.ComboEngine.recordHit(att, def, {
          category: 'grapple',
          moveId: defObj.id,
          damage: dmg,
          stunSec: defObj.stunSec,
          launch: !!defObj.juggleLaunch,
          isThrow: true
        });
      }

      events.push({
        type: 'throw_release',
        attackerIdx: att.idx,
        victimIdx: def.idx,
        throwId: defObj.id,
        damage: dmg,
        x: def.x,
        y: def.y || 0,
        vx: def.vx,
        vy: def.vy,
        juggleLaunch: !!defObj.juggleLaunch,
        hitstopSec: defObj.causesSlam ? 0 : defObj.hitstopSec,
        shake: defObj.causesSlam ? 0 : defObj.shake
      });
    } else {
      // Acupoint Lock finale: apply meridian seal debuffs and palm-push stagger
      def.defDebuffT = Math.max(def.defDebuffT || 0, defObj.sealDebuffSec || 3.0);
      def.slowT = Math.max(def.slowT || 0, defObj.slowDebuffSec || 1.8);
      def.state = 'hitstun';
      def.stun = Math.max(def.stun || 0, defObj.stunSec);
      def.t = 0;

      events.push({
        type: 'acupoint_seal',
        attackerIdx: att.idx,
        victimIdx: def.idx,
        x: def.x,
        y: (def.y || 0) - 56,
        label: '封脉',
        debuffSec: defObj.sealDebuffSec
      });
    }

    // Transition victim state based on throw type
    if (defObj.juggleLaunch) {
      def.state = 'hitstun';
      def.stun = Math.max(def.stun || 0, defObj.stunSec);
      def.juggle = (def.juggle || 0) + 1;
      def.t = 0;
    } else if (defObj.causesSlam) {
      def.state = 'thrown';
      def.stun = Math.max(def.stun || 0, defObj.stunSec);
      def.t = 0;
    }

    // Immediate slam if victim is already at ground level on release
    if (defObj.causesSlam && (def.y || 0) >= -8 && def.vy > 0) {
      triggerGroundSlam(att, def, defObj, null, events);
    }
  }

  // --------------------------------------------------------------------------
  // 7. Ground-Slam Impact Shockwave & Bounce Physics
  // --------------------------------------------------------------------------
  function triggerGroundSlam(att, def, defObj, fighters, events) {
    var ds = ensureState(def);
    if (ds.slamTriggered) return;
    ds.slamTriggered = true;
    ds.bounceCount = 1;

    var impactVy = Math.abs(def.vy || defObj.releaseVy || 480);
    var impactVx = Math.abs(def.vx || 0);
    var victimWeight = getFighterWeight(def);

    // Kinetic impact energy metric (normalized around ~1.0 for standard slam)
    var kineticEnergy = clamp(
      victimWeight * (impactVy * impactVy + 0.35 * impactVx * impactVx) / 360000,
      0.55,
      2.2
    );

    // Bounce velocity with restitution
    var eY = defObj.bounceRestitutionY !== undefined ? defObj.bounceRestitutionY : CONFIG.defaultRestitutionY;
    var eX = defObj.bounceRestitutionX !== undefined ? defObj.bounceRestitutionX : CONFIG.defaultRestitutionX;

    def.y = 0;
    var bounceVy = -impactVy * eY;
    if (Math.abs(bounceVy) < CONFIG.minBounceSpeedY) {
      def.vy = 0;
      def.vx = (def.vx || 0) * 0.45;
      def.state = 'knockdown';
      def.bounced = true;
      def.rot = 0;
      ds.phase = 'none';
      ds.role = 'none';
      ds.throwInvulT = CONFIG.postHitThrowInvulSec;
    } else {
      def.vy = quantize(bounceVy);
      def.vx = quantize((def.vx || 0) * eX);
      def.bounced = true;
      def.state = 'thrown';
    }

    // Ground-slam shockwave AoE affecting nearby enemies (2v2 / 8v8 tremor)
    var shockRadius = CONFIG.shockwaveBaseRadius * (defObj.shockwaveScale || 1.0) * Math.sqrt(kineticEnergy);
    var shockedIndices = [];

    if (shockRadius > 20) {
      var pool = getActiveFighters(fighters);
      var attTeam = att ? getFighterTeam(att) : (1 - getFighterTeam(def));
      for (var i = 0; i < pool.length; i++) {
        var other = pool[i];
        if (!other || other === def || other === att || other.hidden || (other.hp || 0) <= 0) continue;
        if (getFighterTeam(other) === attTeam) continue;
        if ((other.invul || 0) > 0) continue;

        // Grounded or low-altitude enemies feel the tremor
        var distX = other.x - def.x;
        var absX = Math.abs(distX);
        var altY = Math.abs(other.y || 0);
        if (absX > shockRadius || altY > 75) continue;

        var falloff = 1 - (absX / shockRadius);
        var splashDmg = Math.max(1, Math.round(CONFIG.shockwaveMaxDamage * falloff * kineticEnergy));
        applyDamageSafe(att, other, splashDmg);

        var pushDir = signOr(distX, signOr(def.vx, 1));
        other.vx = (other.vx || 0) + pushDir * (220 * falloff);
        other.vy = Math.min(other.vy || 0, -240 * falloff);
        other.state = 'hitstun';
        other.stun = Math.max(other.stun || 0, 0.28 * falloff + 0.12);
        other.t = 0;
        shockedIndices.push(other.idx);
      }
    }

    events.push({
      type: 'ground_slam',
      attackerIdx: att ? att.idx : -1,
      victimIdx: def.idx,
      throwId: defObj.id,
      x: def.x,
      y: 0,
      radius: quantize(shockRadius),
      energy: quantize(kineticEnergy),
      hitstopSec: defObj.hitstopSec || 0.09,
      shake: (defObj.shake || 10) * Math.sqrt(kineticEnergy),
      shockedIndices: shockedIndices
    });
  }

  function stepThrownVictimFlight(def, dt, fighters, events) {
    var ds = ensureState(def);
    var defObj = getThrowDef(ds.throwId);
    var att = findFighterByIdx(ds.partnerIdx, fighters);
    var bounds = getStageBounds();

    // Integrate ballistic motion
    def.vy = (def.vy || 0) + CONFIG.slamGravity * dt;
    def.x = (def.x || 0) + (def.vx || 0) * dt;
    def.y = (def.y || 0) + (def.vy || 0) * dt;

    // Wall bounce if thrown into stage corner
    if (def.x < bounds.minX) {
      def.x = bounds.minX;
      def.vx = Math.abs(def.vx || 0) * 0.55;
      events.push({ type: 'wall_impact', victimIdx: def.idx, x: bounds.minX, y: def.y, side: -1 });
    } else if (def.x > bounds.maxX) {
      def.x = bounds.maxX;
      def.vx = -Math.abs(def.vx || 0) * 0.55;
      events.push({ type: 'wall_impact', victimIdx: def.idx, x: bounds.maxX, y: def.y, side: 1 });
    }

    // Spin decay during flight
    ds.spinAngle += (ds.spinVel || 0) * dt;
    ds.spinVel *= Math.max(0, 1 - 2.5 * dt);
    def.rot = ds.spinAngle;

    // Crowd-throw bowling check while flying
    if (defObj.crowdBowling) {
      resolveCrowdThrowCollisions(att, def, defObj, fighters, events, 1.0);
    }

    // Ground impact check
    if (def.y >= 0) {
      def.y = 0;
      if (defObj.causesSlam && !ds.slamTriggered) {
        triggerGroundSlam(att, def, defObj, fighters, events);
      } else {
        // Secondary bounce or settle
        var absVy = Math.abs(def.vy || 0);
        if (ds.bounceCount < 2 && absVy >= CONFIG.minBounceSpeedY) {
          ds.bounceCount++;
          def.vy = quantize(-absVy * 0.32);
          def.vx = quantize((def.vx || 0) * 0.6);
        } else {
          def.vy = 0;
          def.vx = quantize((def.vx || 0) * 0.35);
          def.rot = 0;
          def.state = 'knockdown';
          def.t = 0;
          ds.phase = 'none';
          ds.role = 'none';
          ds.partnerIdx = -1;
          ds.throwInvulT = CONFIG.postHitThrowInvulSec;
        }
      }
    }

    // Safety timeout so victim can never stay stuck in victim_thrown
    ds.timer += dt;
    if (ds.timer > 1.8) {
      def.rot = 0;
      ds.phase = 'none';
      ds.role = 'none';
      ds.partnerIdx = -1;
      ds.throwInvulT = CONFIG.postHitThrowInvulSec;
    }
  }

  // --------------------------------------------------------------------------
  // 8. Crowd-Throw Bowling Collision (2v2 / 8v8)
  // --------------------------------------------------------------------------
  function resolveCrowdThrowCollisions(att, thrownVictim, defObj, fighters, events, speedScale) {
    var ds = ensureState(thrownVictim);
    var pool = getActiveFighters(fighters);
    if (pool.length <= 2) return 0; // No bystanders in 1v1

    var attTeam = att ? getFighterTeam(att) : (1 - getFighterTeam(thrownVictim));
    var vWeight = getFighterWeight(thrownVictim);
    var vSpeed = Math.sqrt((thrownVictim.vx || 0) * (thrownVictim.vx || 0) + (thrownVictim.vy || 0) * (thrownVictim.vy || 0));
    var hitCount = 0;

    for (var i = 0; i < pool.length; i++) {
      var bystander = pool[i];
      if (!bystander || bystander === thrownVictim || bystander === att) continue;
      if (bystander.hidden || (bystander.hp || 0) <= 0) continue;
      if (getFighterTeam(bystander) === attTeam) continue;
      if ((bystander.invul || 0) > 0) continue;

      // Bitmask deduplication (supports up to 16 fighters in 8v8 deterministically)
      var bit = 1 << (bystander.idx & 31);
      if ((ds.crowdHitMask & bit) !== 0) continue;

      var combinedScale = 0.5 * (getFighterSize(thrownVictim) + getFighterSize(bystander));
      var dx = bystander.x - thrownVictim.x;
      var dy = (bystander.y || 0) - (thrownVictim.y || 0);
      if (Math.abs(dx) > CONFIG.crowdHitRadiusX * combinedScale) continue;
      if (Math.abs(dy) > CONFIG.crowdHitRadiusY * combinedScale) continue;

      // Record hit in bitmask on both victim and attacker states
      ds.crowdHitMask |= bit;
      if (att) {
        var as = ensureState(att);
        as.crowdHitMask |= bit;
        as.crowdHitsTotal++;
      }

      // 1D/2D momentum transfer impulse (elastic-inelastic collision)
      var bWeight = getFighterWeight(bystander);
      var e = CONFIG.crowdRestitution;
      var dirX = signOr(thrownVictim.vx, signOr(dx, att ? att.face : 1));
      var relVx = (thrownVictim.vx || (dirX * 320)) - (bystander.vx || 0);
      var impulseJ = -(1 + e) * relVx / (1 / vWeight + 1 / bWeight);

      // Apply velocity exchange (minimum launch floor so bowling feels impactful)
      var newBystanderVx = (bystander.vx || 0) - impulseJ / bWeight;
      if (Math.abs(newBystanderVx) < 220) newBystanderVx = dirX * 260;

      bystander.vx = quantize(newBystanderVx);
      bystander.vy = quantize(Math.min(bystander.vy || 0, CONFIG.crowdLaunchVy * clamp(speedScale || 1, 0.7, 1.2)));
      bystander.state = 'hitstun';
      bystander.stun = Math.max(bystander.stun || 0, CONFIG.crowdStunSec);
      bystander.t = 0;

      // Thrown victim loses a fraction of forward momentum on impact
      thrownVictim.vx = quantize((thrownVictim.vx || 0) * 0.78);

      // Collateral bowling damage
      var speedBonus = clamp(vSpeed / 450, 0.75, 1.45);
      var rawDmg = CONFIG.crowdBaseDamage * (defObj.crowdDmgScale || 1.0) * speedBonus * (speedScale || 1.0);
      var finalDmg = computeScaledThrowDamage(att, bystander, rawDmg, 'crowd_throw');
      applyDamageSafe(att, bystander, finalDmg);

      if (att) {
        att.meter = clamp((att.meter || 0) + CONFIG.crowdMeterBonus, 0, 100);
      }

      events.push({
        type: 'crowd_throw_hit',
        attackerIdx: att ? att.idx : -1,
        projectileIdx: thrownVictim.idx,
        bystanderIdx: bystander.idx,
        damage: finalDmg,
        x: (thrownVictim.x + bystander.x) * 0.5,
        y: ((thrownVictim.y || 0) + (bystander.y || 0)) * 0.5 - 52,
        label: '撞击'
      });

      hitCount++;
    }

    return hitCount;
  }

  // --------------------------------------------------------------------------
  // 9. Safe Abort & Per-Frame Update Loop
  // --------------------------------------------------------------------------
  function abortGrapple(att, def, events, reason) {
    events = events || [];
    if (att) {
      var as = ensureState(att);
      att.rot = 0;
      if (att.state === 'clinch' || att.state === 'throw_exec' || att.state === 'grapple_start') {
        att.state = isFighterGrounded(att) ? 'idle' : 'air';
        att.t = 0;
      }
      as.phase = 'none';
      as.role = 'none';
      as.partnerIdx = -1;
      as.grappleCD = CONFIG.grappleCooldownSec * 0.5;
    }
    if (def) {
      var ds = ensureState(def);
      def.rot = 0;
      if (def.state === 'clinched' || def.state === 'thrown') {
        def.state = isFighterGrounded(def) ? 'idle' : 'air';
        def.t = 0;
      }
      ds.phase = 'none';
      ds.role = 'none';
      ds.partnerIdx = -1;
      ds.throwInvulT = CONFIG.postHitThrowInvulSec;
    }
    events.push({
      type: 'grapple_abort',
      attackerIdx: att ? att.idx : -1,
      victimIdx: def ? def.idx : -1,
      reason: reason || 'aborted'
    });
  }

  function stepFighter(f, dt, fighters, events) {
    events = events || [];
    if (!f || f.hidden) return events;
    var s = ensureState(f);

    // Tick passive timers
    if (s.throwInvulT > 0) s.throwInvulT = Math.max(0, s.throwInvulT - dt);
    if (s.grappleCD > 0) s.grappleCD = Math.max(0, s.grappleCD - dt);

    // Grant brief post-blockstun/wakeup throw protection automatically
    if (f.state === 'blockstun' || f.state === 'knockdown') {
      s.throwInvulT = Math.max(s.throwInvulT, CONFIG.postHitThrowInvulSec);
    }

    if (s.phase === 'none') return events;

    // KO safety check
    if ((f.hp || 0) <= 0 && s.phase !== 'victim_thrown') {
      var partnerKO = findFighterByIdx(s.partnerIdx, fighters);
      abortGrapple(s.role === 'attacker' ? f : partnerKO, s.role === 'victim' ? f : partnerKO, events, 'ko');
      return events;
    }

    if (s.phase === 'startup') {
      s.timer += dt;
      if (s.timer >= s.phaseDuration) {
        resolveGrabAttempt(f, fighters, events);
      }
      return events;
    }

    if (s.phase === 'whiff') {
      s.timer += dt;
      f.vx = (f.vx || 0) * Math.max(0, 1 - 6 * dt);
      if (s.timer >= s.phaseDuration) {
        s.phase = 'none';
        s.role = 'none';
        f.state = isFighterGrounded(f) ? 'idle' : 'air';
        f.t = 0;
      }
      return events;
    }

    if (s.phase === 'clinch') {
      var victim = findFighterByIdx(s.partnerIdx, fighters);
      if (!victim || victim.hidden || (victim.hp || 0) <= 0) {
        abortGrapple(f, victim, events, 'partner_lost');
        return events;
      }
      // Interruption check during clinch
      if ((f.hp || 0) < s.savedAttHp - CONFIG.interruptionDamageThreshold) {
        abortGrapple(f, victim, events, 'interrupted');
        return events;
      }
      s.savedAttHp = f.hp || 0;
      s.timer += dt;

      var vs = ensureState(victim);
      vs.timer = s.timer;
      if (vs.techWindowT > 0) {
        vs.techWindowT = Math.max(0, vs.techWindowT - dt);
      }

      // Keep clinch locked at anchor
      f.x = s.anchorX;
      f.y = s.anchorY;
      victim.x = clamp(s.anchorX + s.dir * 48, getStageBounds().minX, getStageBounds().maxX);
      victim.y = s.anchorY;

      if (s.timer >= s.phaseDuration) {
        commitClinchToThrow(f, victim, events);
      }
      return events;
    }

    if (s.phase === 'executing') {
      var vExec = findFighterByIdx(s.partnerIdx, fighters);
      if (!vExec || vExec.hidden) {
        abortGrapple(f, vExec, events, 'partner_lost');
        return events;
      }
      stepExecutingThrow(f, vExec, dt, fighters, events);
      return events;
    }

    if (s.phase === 'victim_thrown' && s.released) {
      stepThrownVictimFlight(f, dt, fighters, events);
      return events;
    }

    if (s.phase === 'victim_locked' && s.released) {
      // Acupoint lock finished releasing; clear victim grapple state cleanly
      f.rot = 0;
      s.phase = 'none';
      s.role = 'none';
      s.partnerIdx = -1;
      s.throwInvulT = CONFIG.postHitThrowInvulSec;
      return events;
    }

    return events;
  }

  function stepAll(fighters, dt) {
    var events = [];
    var pool = getActiveFighters(fighters);
    // Deterministic index order
    for (var i = 0; i < pool.length; i++) {
      stepFighter(pool[i], dt, pool, events);
    }
    return events;
  }

  function getDebugInfo(f) {
    var s = ensureState(f);
    if (!s) return null;
    return {
      phase: s.phase,
      role: s.role,
      partnerIdx: s.partnerIdx,
      throwId: s.throwId,
      techWindowT: quantize(s.techWindowT),
      throwInvulT: quantize(s.throwInvulT),
      grappleCD: quantize(s.grappleCD),
      throwsLanded: s.throwsLanded,
      techsEscaped: s.techsEscaped,
      crowdHitsTotal: s.crowdHitsTotal
    };
  }

  // --------------------------------------------------------------------------
  // 10. Public Export on RYPhysics.Grapple
  // --------------------------------------------------------------------------
  RYPhysics.Grapple = {
    CONFIG: CONFIG,
    THROWS: THROWS,
    ensureState: ensureState,
    resetState: resetState,
    snapshotState: snapshotState,
    restoreState: restoreState,
    isBusyInGrapple: isBusyInGrapple,
    canInitiateGrab: canInitiateGrab,
    isTargetGrabbable: isTargetGrabbable,
    detectBypassFlags: detectBypassFlags,
    selectThrowId: selectThrowId,
    findClincheableTarget: findClincheableTarget,
    initiateGrab: initiateGrab,
    resolveGrabAttempt: resolveGrabAttempt,
    attemptTech: attemptTech,
    resolveThrowTech: resolveThrowTech,
    sampleThrowKinematics: sampleThrowKinematics,
    triggerGroundSlam: triggerGroundSlam,
    resolveCrowdThrowCollisions: resolveCrowdThrowCollisions,
    abortGrapple: abortGrapple,
    stepFighter: stepFighter,
    stepAll: stepAll,
    getDebugInfo: getDebugInfo
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
