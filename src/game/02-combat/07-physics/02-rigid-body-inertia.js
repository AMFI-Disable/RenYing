// ======================= 02. 刚体动力学与转动惯量 =======================
// Rollback-deterministic per-fighter rigid-body state, hero-archetype mass &
// inertia profiles, dynamic center-of-mass shifting, Coulomb friction,
// quadratic aerodynamic drag, linear-angular coupling, and snapshot packing.

var RYPhysics = (typeof window !== 'undefined' ? (window.RYPhysics = window.RYPhysics || {}) : {});

(function (RYP) {
  'use strict';

  var M = RYP.Math;
  var EPS = M ? M.EPSILON : 1e-6;

  // ---------------------------------------------------------------------------
  // 1. Physical Constants & Hero Archetype Mass / Inertia Profiles
  // ---------------------------------------------------------------------------
  // RenYing coordinate convention: +X right, +Y downward (ground at y = 0, air y < 0)
  var DEFAULT_GRAVITY = 1560;         // px/s^2 downward (+Y)
  var DEFAULT_AIR_DENSITY = 0.001225; // scaled air density for px/s units
  var MAX_LINEAR_SPEED = 4200;
  var MAX_ANGULAR_SPEED = 36;         // rad/s
  var SLEEP_LIN_THRESH = 2.5;
  var SLEEP_ANG_THRESH = 0.04;
  var SLEEP_TIME_REQ = 0.45;

  // Surface material friction & restitution database (matches arena maps)
  var SURFACE_MATERIALS = {
    stone:  { muS: 0.78, muK: 0.62, restitution: 0.14, grip: 1.00 },
    wood:   { muS: 0.66, muK: 0.50, restitution: 0.18, grip: 0.92 },
    ice:    { muS: 0.12, muK: 0.07, restitution: 0.10, grip: 0.24 },
    sand:   { muS: 0.88, muK: 0.74, restitution: 0.05, grip: 0.80 },
    water:  { muS: 0.34, muK: 0.28, restitution: 0.06, grip: 0.55 },
    bamboo: { muS: 0.58, muK: 0.44, restitution: 0.24, grip: 0.88 },
    iron:   { muS: 0.52, muK: 0.40, restitution: 0.28, grip: 0.85 },
    air:    { muS: 0.00, muK: 0.00, restitution: 0.00, grip: 0.00 }
  };

  // Hero-archetype rigid body profiles:
  // mass (kg-equiv), width/height (px), inertiaMul, dragCoeff, crossSection,
  // gravityScale, muStatic, muKinetic, restitution, linearDamping, angularDamping,
  // knockbackResist, stanceBaseWidth (foot span for balance stability)
  var ARCHETYPE_PROFILES = {
    light_blade: {
      id: 'light_blade',
      mass: 68,
      width: 34,
      height: 82,
      inertiaMul: 1.00,
      dragCoeff: 0.42,
      crossSection: 0.58,
      gravityScale: 1.00,
      muStatic: 0.76,
      muKinetic: 0.58,
      restitution: 0.16,
      linearDamping: 0.08,
      angularDamping: 0.28,
      knockbackResist: 1.00,
      stanceBaseWidth: 32
    },
    assassin: {
      id: 'assassin',
      mass: 56,
      width: 30,
      height: 78,
      inertiaMul: 0.82,
      dragCoeff: 0.34,
      crossSection: 0.50,
      gravityScale: 0.96,
      muStatic: 0.84,
      muKinetic: 0.64,
      restitution: 0.20,
      linearDamping: 0.06,
      angularDamping: 0.22,
      knockbackResist: 0.86,
      stanceBaseWidth: 28
    },
    heavy_tank: {
      id: 'heavy_tank',
      mass: 108,
      width: 44,
      height: 90,
      inertiaMul: 1.48,
      dragCoeff: 0.56,
      crossSection: 0.82,
      gravityScale: 1.12,
      muStatic: 0.92,
      muKinetic: 0.76,
      restitution: 0.10,
      linearDamping: 0.12,
      angularDamping: 0.40,
      knockbackResist: 1.42,
      stanceBaseWidth: 44
    },
    spear_master: {
      id: 'spear_master',
      mass: 74,
      width: 36,
      height: 86,
      inertiaMul: 1.24,
      dragCoeff: 0.44,
      crossSection: 0.62,
      gravityScale: 1.02,
      muStatic: 0.80,
      muKinetic: 0.62,
      restitution: 0.14,
      linearDamping: 0.09,
      angularDamping: 0.30,
      knockbackResist: 1.10,
      stanceBaseWidth: 38
    },
    brawler: {
      id: 'brawler',
      mass: 84,
      width: 38,
      height: 82,
      inertiaMul: 0.94,
      dragCoeff: 0.48,
      crossSection: 0.68,
      gravityScale: 1.05,
      muStatic: 0.88,
      muKinetic: 0.70,
      restitution: 0.15,
      linearDamping: 0.10,
      angularDamping: 0.26,
      knockbackResist: 1.20,
      stanceBaseWidth: 36
    },
    mystic_float: {
      id: 'mystic_float',
      mass: 60,
      width: 32,
      height: 80,
      inertiaMul: 0.92,
      dragCoeff: 0.64,
      crossSection: 0.76,
      gravityScale: 0.84,
      muStatic: 0.64,
      muKinetic: 0.48,
      restitution: 0.22,
      linearDamping: 0.14,
      angularDamping: 0.34,
      knockbackResist: 0.92,
      stanceBaseWidth: 30
    },
    artificer: {
      id: 'artificer',
      mass: 66,
      width: 34,
      height: 80,
      inertiaMul: 1.08,
      dragCoeff: 0.46,
      crossSection: 0.60,
      gravityScale: 0.98,
      muStatic: 0.74,
      muKinetic: 0.56,
      restitution: 0.18,
      linearDamping: 0.09,
      angularDamping: 0.32,
      knockbackResist: 1.02,
      stanceBaseWidth: 32
    }
  };

  // Mapping of RenYing's 20 heroes to rigid-body archetypes
  var HERO_ARCHETYPE_MAP = {
    qingfeng:   'light_blade',
    feiying:    'assassin',
    tieshan:    'heavy_tank',
    lingshuang: 'spear_master',
    liuyun:     'mystic_float',
    leiming:    'brawler',
    moyu:       'mystic_float',
    yuehua:     'light_blade',
    yanling:    'spear_master',
    yuxiao:     'mystic_float',
    zuixian:    'brawler',
    gouchen:    'heavy_tank',
    lingque:    'assassin',
    liying:     'assassin',
    cixian:     'brawler',
    qianji:     'artificer',
    chixiao:    'light_blade',
    xuanji:     'artificer',
    qingluan:   'mystic_float',
    xuanwu:     'heavy_tank'
  };

  // Posture-dependent local Center-of-Mass offsets (relative to body origin at feet-center)
  // x is along facing direction (+x forward), y is vertical (negative = higher above feet)
  var POSTURE_COM_OFFSETS = {
    idle:         { x: 0,   y: -42, areaMul: 1.00, springOmega: 18, springZeta: 0.85 },
    walk:         { x: 5,   y: -41, areaMul: 0.98, springOmega: 20, springZeta: 0.85 },
    run:          { x: 11,  y: -38, areaMul: 0.86, springOmega: 22, springZeta: 0.82 },
    crouch:       { x: 3,   y: -24, areaMul: 0.64, springOmega: 24, springZeta: 0.90 },
    guard:        { x: -6,  y: -36, areaMul: 0.90, springOmega: 24, springZeta: 0.92 },
    lunge:        { x: 18,  y: -35, areaMul: 0.78, springOmega: 28, springZeta: 0.78 },
    heavy_windup: { x: -12, y: -44, areaMul: 1.08, springOmega: 16, springZeta: 0.85 },
    heavy_slam:   { x: 20,  y: -30, areaMul: 0.88, springOmega: 30, springZeta: 0.75 },
    uppercut:     { x: 8,   y: -52, areaMul: 0.82, springOmega: 26, springZeta: 0.80 },
    leap:         { x: 4,   y: -46, areaMul: 0.74, springOmega: 20, springZeta: 0.82 },
    aerial:       { x: 2,   y: -40, areaMul: 0.94, springOmega: 18, springZeta: 0.84 },
    dive:         { x: 14,  y: -34, areaMul: 0.56, springOmega: 26, springZeta: 0.80 },
    spin:         { x: 0,   y: -40, areaMul: 0.88, springOmega: 24, springZeta: 0.88 },
    hitstun:      { x: -10, y: -43, areaMul: 1.12, springOmega: 22, springZeta: 0.72 },
    knockdown:    { x: -4,  y: -14, areaMul: 1.24, springOmega: 16, springZeta: 0.95 }
  };

  var POSTURE_IDS = Object.keys(POSTURE_COM_OFFSETS);
  var POSTURE_TO_IDX = {};
  for (var pi = 0; pi < POSTURE_IDS.length; pi++) {
    POSTURE_TO_IDX[POSTURE_IDS[pi]] = pi;
  }

  var SURFACE_IDS = Object.keys(SURFACE_MATERIALS);
  var SURFACE_TO_IDX = {};
  for (var si = 0; si < SURFACE_IDS.length; si++) {
    SURFACE_TO_IDX[SURFACE_IDS[si]] = si;
  }

  function q(v) {
    return M ? M.quantize(v) : (Math.round(v * 1e6) / 1e6 || 0);
  }

  function getProfileForHero(heroId) {
    var archId = HERO_ARCHETYPE_MAP[heroId] || 'light_blade';
    return ARCHETYPE_PROFILES[archId] || ARCHETYPE_PROFILES.light_blade;
  }

  function computeRectInertia(mass, width, height, mul) {
    // Planar rigid rectangle moment of inertia about CoM: I = (1/12) * m * (w^2 + h^2)
    var base = (mass * (width * width + height * height)) / 12;
    return Math.max(100, base * (mul || 1));
  }

  // ---------------------------------------------------------------------------
  // 2. Rigid Body Lifecycle (createBody, resetBody, configureHeroProfile)
  // ---------------------------------------------------------------------------
  function createBody(options) {
    var opts = options || {};
    var body = {
      id: opts.id !== undefined ? opts.id : 0,
      heroId: opts.heroId || 'qingfeng',
      archetypeId: 'light_blade',

      // Kinematics
      x: opts.x || 0,
      y: opts.y || 0,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      angle: opts.angle || 0,
      omega: opts.omega || 0,
      facing: opts.facing === -1 ? -1 : 1,

      // Force & torque accumulators
      fx: 0,
      fy: 0,
      torque: 0,

      // Mass & inertia tensor (2D planar scalar I + dynamic parallel-axis I)
      baseMass: 68,
      mass: 68,
      invMass: 1 / 68,
      baseInertia: 40000,
      inertia: 40000,
      invInertia: 1 / 40000,
      width: 34,
      height: 82,
      sizeScale: opts.sizeScale || 1,
      stanceBaseWidth: 32,
      knockbackResist: 1,

      // Dynamic Center-of-Mass (local to body feet-center)
      comX: 0,
      comY: -42,
      comTargetX: 0,
      comTargetY: -42,
      comVx: 0,
      comVy: 0,
      comRestY: -42,
      posture: 'idle',

      // Material, surface & aerodynamic state
      muStatic: 0.76,
      muKinetic: 0.58,
      restitution: 0.16,
      dragCoeff: 0.42,
      crossSection: 0.58,
      airDensity: DEFAULT_AIR_DENSITY,
      linearDamping: 0.08,
      angularDamping: 0.28,
      gravityScale: 1,
      magnusCoeff: 0.015,

      // Ground contact & slope
      grounded: true,
      surfaceType: 'stone',
      groundNormalX: 0,
      groundNormalY: -1,

      // Sleep & stability diagnostics
      sleeping: false,
      sleepTimer: 0,
      stanceStability: 1,
      lastImpulseMag: 0,
      lastTorqueMag: 0,
      isStatic: !!opts.isStatic
    };

    configureHeroProfile(body, body.heroId, body.sizeScale);
    if (body.isStatic) {
      body.mass = 0;
      body.invMass = 0;
      body.inertia = 0;
      body.invInertia = 0;
    }
    return body;
  }

  function configureHeroProfile(body, heroId, sizeScale) {
    var profile = getProfileForHero(heroId);
    var scale = sizeScale && sizeScale > 0.2 ? sizeScale : 1;
    var massScale = scale * scale; // 2D area-proportional mass scaling

    body.heroId = heroId || 'qingfeng';
    body.archetypeId = profile.id;
    body.sizeScale = scale;
    body.width = q(profile.width * scale);
    body.height = q(profile.height * scale);
    body.stanceBaseWidth = q(profile.stanceBaseWidth * scale);
    body.knockbackResist = profile.knockbackResist;

    if (!body.isStatic) {
      body.baseMass = q(profile.mass * massScale);
      body.mass = body.baseMass;
      body.invMass = body.mass > EPS ? q(1 / body.mass) : 0;
      body.baseInertia = q(computeRectInertia(body.mass, body.width, body.height, profile.inertiaMul));
      body.inertia = body.baseInertia;
      body.invInertia = body.inertia > EPS ? q(1 / body.inertia) : 0;
    }

    body.muStatic = profile.muStatic;
    body.muKinetic = profile.muKinetic;
    body.restitution = profile.restitution;
    body.dragCoeff = profile.dragCoeff;
    body.crossSection = q(profile.crossSection * scale);
    body.gravityScale = profile.gravityScale;
    body.linearDamping = profile.linearDamping;
    body.angularDamping = profile.angularDamping;
    body.comRestY = q(-body.height * 0.51);
    body.comX = 0;
    body.comY = body.comRestY;
    body.comTargetX = 0;
    body.comTargetY = body.comRestY;
    body.comVx = 0;
    body.comVy = 0;
    return body;
  }

  function resetBody(body, x, y, facing) {
    body.x = q(x || 0);
    body.y = q(y || 0);
    body.vx = 0;
    body.vy = 0;
    body.angle = 0;
    body.omega = 0;
    body.facing = facing === -1 ? -1 : 1;
    body.fx = 0;
    body.fy = 0;
    body.torque = 0;
    body.posture = 'idle';
    body.comX = 0;
    body.comY = body.comRestY;
    body.comTargetX = 0;
    body.comTargetY = body.comRestY;
    body.comVx = 0;
    body.comVy = 0;
    body.grounded = body.y >= 0;
    body.groundNormalX = 0;
    body.groundNormalY = -1;
    body.sleeping = false;
    body.sleepTimer = 0;
    body.stanceStability = 1;
    body.lastImpulseMag = 0;
    body.lastTorqueMag = 0;
    if (!body.isStatic) {
      body.mass = body.baseMass;
      body.invMass = body.mass > EPS ? q(1 / body.mass) : 0;
      body.inertia = body.baseInertia;
      body.invInertia = body.inertia > EPS ? q(1 / body.inertia) : 0;
    }
    return body;
  }

  // Optional bridge to sync with RenYing Fighter entity
  function syncFromFighter(body, fighter) {
    if (!fighter) return body;
    body.x = q(fighter.x || 0);
    body.y = q(fighter.y || 0);
    body.vx = q(fighter.vx || 0);
    body.vy = q(fighter.vy || 0);
    body.angle = q(fighter.rot || 0);
    body.facing = fighter.face === -1 ? -1 : 1;
    body.grounded = typeof fighter.onGround === 'function' ? fighter.onGround() : (body.y >= 0 && body.vy >= 0);
    return body;
  }

  function syncToFighter(body, fighter) {
    if (!fighter) return fighter;
    fighter.x = body.x;
    fighter.y = body.y;
    fighter.vx = body.vx;
    fighter.vy = body.vy;
    fighter.rot = body.angle;
    return fighter;
  }

  // ---------------------------------------------------------------------------
  // 3. Center-of-Mass Shifting & Parallel-Axis Inertia Tensor Update
  // ---------------------------------------------------------------------------
  function setPosture(body, postureName, customOffsetX, customOffsetY) {
    var key = POSTURE_COM_OFFSETS[postureName] ? postureName : 'idle';
    var spec = POSTURE_COM_OFFSETS[key];
    body.posture = key;
    var scale = body.sizeScale || 1;
    var tx = (customOffsetX !== undefined ? customOffsetX : spec.x) * body.facing * scale;
    var ty = (customOffsetY !== undefined ? customOffsetY : spec.y) * scale;
    body.comTargetX = q(tx);
    body.comTargetY = q(ty);
    return body;
  }

  function getWorldCenterOfMass(body) {
    var c = M.detCos(body.angle);
    var s = M.detSin(body.angle);
    return {
      x: q(body.x + body.comX * c - body.comY * s),
      y: q(body.y + body.comX * s + body.comY * c)
    };
  }

  function computeParallelAxisInertia(body) {
    if (body.isStatic || body.mass <= EPS) return 0;
    var dx = body.comX;
    var dy = body.comY - body.comRestY;
    var d2 = dx * dx + dy * dy;
    // Parallel-axis theorem: I_eff = I_cm + m * d^2
    return q(body.baseInertia + body.mass * d2);
  }

  function computeStanceStability(body) {
    if (!body.grounded) return 0;
    var worldCom = getWorldCenterOfMass(body);
    var halfBase = Math.max(8, body.stanceBaseWidth * 0.5);
    var lateralDisp = Math.abs(worldCom.x - body.x);
    var tiltPenalty = Math.min(1, Math.abs(body.angle) / 0.85);
    var supportRatio = M.clamp01(1 - lateralDisp / (halfBase * 1.45));
    var stability = M.clamp01(supportRatio * (1 - 0.55 * tiltPenalty));
    return q(stability);
  }

  function updateCenterOfMass(body, dt) {
    var spec = POSTURE_COM_OFFSETS[body.posture] || POSTURE_COM_OFFSETS.idle;
    var step = M.stepSpring2D(
      { x: body.comX, y: body.comY },
      { x: body.comVx, y: body.comVy },
      { x: body.comTargetX, y: body.comTargetY },
      { x: 0, y: 0 },
      spec.springOmega,
      spec.springZeta,
      dt
    );
    body.comX = step.x;
    body.comY = step.y;
    body.comVx = step.vx;
    body.comVy = step.vy;

    if (!body.isStatic) {
      body.inertia = computeParallelAxisInertia(body);
      body.invInertia = body.inertia > EPS ? q(1 / body.inertia) : 0;
    }
    body.stanceStability = computeStanceStability(body);
    return body;
  }

  // ---------------------------------------------------------------------------
  // 4. Force, Impulse & Torque Application
  // ---------------------------------------------------------------------------
  function wakeBody(body) {
    body.sleeping = false;
    body.sleepTimer = 0;
  }

  function clearAccumulators(body) {
    body.fx = 0;
    body.fy = 0;
    body.torque = 0;
  }

  function applyForce(body, fx, fy) {
    if (body.isStatic) return;
    if (Math.abs(fx) > EPS || Math.abs(fy) > EPS) wakeBody(body);
    body.fx = q(body.fx + fx);
    body.fy = q(body.fy + fy);
  }

  function applyTorque(body, tau) {
    if (body.isStatic) return;
    if (Math.abs(tau) > EPS) wakeBody(body);
    body.torque = q(body.torque + tau);
    body.lastTorqueMag = q(Math.abs(tau));
  }

  // Apply force at a world-space point -> generates both linear force and torque
  function applyForceAtPoint(body, fx, fy, worldX, worldY) {
    if (body.isStatic) return;
    applyForce(body, fx, fy);
    var com = getWorldCenterOfMass(body);
    var rx = worldX - com.x;
    var ry = worldY - com.y;
    var tau = rx * fy - ry * fx;
    applyTorque(body, tau);
  }

  function applyForceAtLocalPoint(body, fx, fy, localX, localY) {
    if (body.isStatic) return;
    var c = M.detCos(body.angle);
    var s = M.detSin(body.angle);
    var wx = body.x + localX * c - localY * s;
    var wy = body.y + localX * s + localY * c;
    applyForceAtPoint(body, fx, fy, wx, wy);
  }

  function applyImpulse(body, jx, jy, ignoreKnockbackResist) {
    if (body.isStatic || body.invMass <= 0) return;
    var scale = ignoreKnockbackResist ? 1 : (1 / Math.max(0.25, body.knockbackResist));
    var effJx = jx * scale;
    var effJy = jy * scale;
    if (Math.abs(effJx) > EPS || Math.abs(effJy) > EPS) wakeBody(body);
    body.vx = q(M.clampAbs(body.vx + effJx * body.invMass, MAX_LINEAR_SPEED));
    body.vy = q(M.clampAbs(body.vy + effJy * body.invMass, MAX_LINEAR_SPEED));
    body.lastImpulseMag = q(M.detHypot(effJx, effJy));
  }

  function applyAngularImpulse(body, angularJ) {
    if (body.isStatic || body.invInertia <= 0) return;
    if (Math.abs(angularJ) > EPS) wakeBody(body);
    body.omega = q(M.clampAbs(body.omega + angularJ * body.invInertia, MAX_ANGULAR_SPEED));
  }

  function applyImpulseAtPoint(body, jx, jy, worldX, worldY, ignoreKnockbackResist) {
    if (body.isStatic || body.invMass <= 0) return;
    var scale = ignoreKnockbackResist ? 1 : (1 / Math.max(0.25, body.knockbackResist));
    var effJx = jx * scale;
    var effJy = jy * scale;
    wakeBody(body);
    body.vx = q(M.clampAbs(body.vx + effJx * body.invMass, MAX_LINEAR_SPEED));
    body.vy = q(M.clampAbs(body.vy + effJy * body.invMass, MAX_LINEAR_SPEED));

    var com = getWorldCenterOfMass(body);
    var rx = worldX - com.x;
    var ry = worldY - com.y;
    var angJ = rx * effJy - ry * effJx;
    body.omega = q(M.clampAbs(body.omega + angJ * body.invInertia, MAX_ANGULAR_SPEED));
    body.lastImpulseMag = q(M.detHypot(effJx, effJy));
  }

  function getPointVelocity(body, worldX, worldY) {
    var com = getWorldCenterOfMass(body);
    var rx = worldX - com.x;
    var ry = worldY - com.y;
    // v_p = v_cm + omega x r = (vx - omega*ry, vy + omega*rx)
    return {
      x: q(body.vx - body.omega * ry),
      y: q(body.vy + body.omega * rx)
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Static & Kinetic Surface Friction Solver (Coulomb Cone)
  // ---------------------------------------------------------------------------
  function getCombinedFriction(body, surfaceType) {
    var surf = SURFACE_MATERIALS[surfaceType || body.surfaceType] || SURFACE_MATERIALS.stone;
    // Geometric mean combination (standard physics engine material pairing)
    return {
      muS: q(M.detSqrt(Math.max(0, body.muStatic * surf.muS))),
      muK: q(M.detSqrt(Math.max(0, body.muKinetic * surf.muK))),
      restitution: q(Math.max(body.restitution, surf.restitution)),
      grip: surf.grip
    };
  }

  function computeNormalForce(body, gravity) {
    if (!body.grounded || body.isStatic) return 0;
    var g = gravity !== undefined ? gravity : DEFAULT_GRAVITY;
    var gravY = body.mass * g * body.gravityScale;
    // Normal points upward (-Y for flat ground); project downward weight onto -normal
    var normalComp = -(body.groundNormalX * body.fx + body.groundNormalY * (body.fy + gravY));
    return Math.max(0, normalComp);
  }

  // Solves static vs kinetic surface friction impulse over step dt.
  // Returns { appliedFx, appliedFy, regime: 'none'|'static'|'kinetic', slipSpeed }
  function solveSurfaceFriction(body, dt, gravity) {
    if (!body.grounded || body.isStatic || body.invMass <= 0) {
      return { appliedFx: 0, appliedFy: 0, regime: 'none', slipSpeed: 0 };
    }
    var h = M.clampFixedStep(dt);
    var normalForce = computeNormalForce(body, gravity);
    if (normalForce <= EPS) {
      return { appliedFx: 0, appliedFy: 0, regime: 'none', slipSpeed: 0 };
    }

    var mat = getCombinedFriction(body, body.surfaceType);
    // Surface tangent perpendicular to groundNormal (pointing +X on flat ground)
    var tx = -body.groundNormalY;
    var ty = body.groundNormalX;

    // Tangential velocity and external tangential force
    var vt = body.vx * tx + body.vy * ty;
    var ftExt = body.fx * tx + body.fy * ty;
    // Required impulse to bring tangential velocity + external force to zero
    var jRequired = -(body.mass * vt + ftExt * h);
    var maxStaticJ = mat.muS * normalForce * h;

    if (Math.abs(vt) < 8 && Math.abs(jRequired) <= maxStaticJ) {
      // Static friction regime: body grips the surface without slipping
      var fxStatic = (jRequired / h) * tx;
      var fyStatic = (jRequired / h) * ty;
      body.vx = q(body.vx - vt * tx);
      body.vy = q(body.vy - vt * ty);
      return {
        appliedFx: q(fxStatic),
        appliedFy: q(fyStatic),
        regime: 'static',
        slipSpeed: 0
      };
    }

    // Kinetic friction regime: opposes tangential motion, clamped against overshoot
    var maxKineticJ = mat.muK * normalForce * h;
    var dir = Math.abs(vt) > EPS ? M.sign(vt) : M.sign(ftExt);
    var jFriction = -dir * maxKineticJ;
    var maxStopJ = Math.abs(body.mass * vt);
    if (Math.abs(vt) > EPS && Math.abs(jFriction) > maxStopJ && Math.abs(ftExt) < mat.muK * normalForce) {
      jFriction = -body.mass * vt;
    }

    var dv = jFriction * body.invMass;
    body.vx = q(body.vx + dv * tx);
    body.vy = q(body.vy + dv * ty);
    return {
      appliedFx: q((jFriction / h) * tx),
      appliedFy: q((jFriction / h) * ty),
      regime: 'kinetic',
      slipSpeed: q(Math.abs(vt + dv))
    };
  }

  function computeStoppingDistance(body, speed, gravity) {
    var g = gravity !== undefined ? gravity : DEFAULT_GRAVITY;
    var mat = getCombinedFriction(body, body.surfaceType);
    var decel = mat.muK * g * body.gravityScale;
    if (decel <= EPS) return Infinity;
    return q((speed * speed) / (2 * decel));
  }

  // ---------------------------------------------------------------------------
  // 6. Aerodynamic Quadratic Drag & Magnus Spin Forces
  // ---------------------------------------------------------------------------
  function computeAerodynamicDrag(body, windX, windY) {
    if (body.isStatic) return { fx: 0, fy: 0, magnusFx: 0, magnusFy: 0, relSpeed: 0 };
    var wx = windX || 0;
    var wy = windY || 0;
    var rvx = body.vx - wx;
    var rvy = body.vy - wy;
    var speed = M.detHypot(rvx, rvy);
    if (speed <= EPS) {
      return { fx: 0, fy: 0, magnusFx: 0, magnusFy: 0, relSpeed: 0 };
    }

    var postureSpec = POSTURE_COM_OFFSETS[body.posture] || POSTURE_COM_OFFSETS.idle;
    var effArea = body.crossSection * postureSpec.areaMul;
    // F_drag = -0.5 * rho * Cd * A * |v_rel| * v_rel
    var dragFactor = -0.5 * body.airDensity * body.dragCoeff * effArea * speed;
    var fx = dragFactor * rvx;
    var fy = dragFactor * rvy;

    // 2D Magnus lift force for spinning airborne fighters: F_m = k_m * (omega x v_rel)
    var magnusFx = 0;
    var magnusFy = 0;
    if (!body.grounded && Math.abs(body.omega) > 0.05) {
      var mScale = body.magnusCoeff * body.mass * body.omega;
      magnusFx = -mScale * rvy;
      magnusFy = mScale * rvx;
    }

    return {
      fx: q(fx),
      fy: q(fy),
      magnusFx: q(magnusFx),
      magnusFy: q(magnusFy),
      relSpeed: q(speed)
    };
  }

  function applyAerodynamicForces(body, windX, windY) {
    var aero = computeAerodynamicDrag(body, windX, windY);
    applyForce(body, aero.fx + aero.magnusFx, aero.fy + aero.magnusFy);
    return aero;
  }

  // ---------------------------------------------------------------------------
  // 7. Linear-Angular Impulse Coupling Solver (Rigid Body vs Rigid Body)
  // ---------------------------------------------------------------------------
  function computeEffectiveMassAtPoint(body, worldX, worldY, unitAxis) {
    if (body.isStatic || body.invMass <= 0) return 0;
    var com = getWorldCenterOfMass(body);
    var rx = worldX - com.x;
    var ry = worldY - com.y;
    var rCrossN = rx * unitAxis.y - ry * unitAxis.x;
    var invEff = body.invMass + rCrossN * rCrossN * body.invInertia;
    return invEff > EPS ? q(1 / invEff) : 0;
  }

  // Resolves coupled linear + angular impulse between bodyA and bodyB at contactPoint
  // normal points from bodyA toward bodyB.
  function resolveLinearAngularCoupling(bodyA, bodyB, contactPoint, normal, restitutionOverride, muStaticOverride, muKineticOverride) {
    var invMa = bodyA.isStatic ? 0 : bodyA.invMass;
    var invMb = bodyB.isStatic ? 0 : bodyB.invMass;
    var invIa = bodyA.isStatic ? 0 : bodyA.invInertia;
    var invIb = bodyB.isStatic ? 0 : bodyB.invInertia;

    if (invMa + invMb <= EPS && invIa + invIb <= EPS) {
      return { resolved: false, jn: 0, jt: 0, relVn: 0, relVt: 0 };
    }

    var n = M.norm(normal);
    var comA = getWorldCenterOfMass(bodyA);
    var comB = getWorldCenterOfMass(bodyB);
    var rAx = contactPoint.x - comA.x;
    var rAy = contactPoint.y - comA.y;
    var rBx = contactPoint.x - comB.x;
    var rBy = contactPoint.y - comB.y;

    // Velocity at contact point on each body: v_p = v + omega x r
    var vAx = bodyA.vx - bodyA.omega * rAy;
    var vAy = bodyA.vy + bodyA.omega * rAx;
    var vBx = bodyB.vx - bodyB.omega * rBy;
    var vBy = bodyB.vy + bodyB.omega * rBx;

    var rvx = vBx - vAx;
    var rvy = vBy - vAy;
    var velAlongNormal = rvx * n.x + rvy * n.y;

    // Separating along normal -> no impulse needed
    if (velAlongNormal > 0) {
      return { resolved: false, jn: 0, jt: 0, relVn: q(velAlongNormal), relVt: 0 };
    }

    var e = restitutionOverride !== undefined
      ? restitutionOverride
      : Math.min(bodyA.restitution, bodyB.restitution);
    // Suppress micro-bounces below velocity threshold
    if (Math.abs(velAlongNormal) < 24) e = 0;

    var rACrossN = rAx * n.y - rAy * n.x;
    var rBCrossN = rBx * n.y - rBy * n.x;
    var denomN = invMa + invMb + rACrossN * rACrossN * invIa + rBCrossN * rBCrossN * invIb;
    if (denomN <= EPS) {
      return { resolved: false, jn: 0, jt: 0, relVn: q(velAlongNormal), relVt: 0 };
    }

    var jn = -(1 + e) * velAlongNormal / denomN;
    var impNx = jn * n.x;
    var impNy = jn * n.y;

    if (!bodyA.isStatic) {
      wakeBody(bodyA);
      bodyA.vx = q(M.clampAbs(bodyA.vx - impNx * invMa, MAX_LINEAR_SPEED));
      bodyA.vy = q(M.clampAbs(bodyA.vy - impNy * invMa, MAX_LINEAR_SPEED));
      bodyA.omega = q(M.clampAbs(bodyA.omega - (rAx * impNy - rAy * impNx) * invIa, MAX_ANGULAR_SPEED));
    }
    if (!bodyB.isStatic) {
      wakeBody(bodyB);
      bodyB.vx = q(M.clampAbs(bodyB.vx + impNx * invMb, MAX_LINEAR_SPEED));
      bodyB.vy = q(M.clampAbs(bodyB.vy + impNy * invMb, MAX_LINEAR_SPEED));
      bodyB.omega = q(M.clampAbs(bodyB.omega + (rBx * impNy - rBy * impNx) * invIb, MAX_ANGULAR_SPEED));
    }

    // Recompute relative velocity for coupled Coulomb tangential friction impulse
    vAx = bodyA.vx - bodyA.omega * rAy;
    vAy = bodyA.vy + bodyA.omega * rAx;
    vBx = bodyB.vx - bodyB.omega * rBy;
    vBy = bodyB.vy + bodyB.omega * rBx;
    rvx = vBx - vAx;
    rvy = vBy - vAy;

    var vnNow = rvx * n.x + rvy * n.y;
    var tx = rvx - vnNow * n.x;
    var ty = rvy - vnNow * n.y;
    var tLen = M.detHypot(tx, ty);
    var jt = 0;

    if (tLen > EPS) {
      tx /= tLen;
      ty /= tLen;
      var rACrossT = rAx * ty - rAy * tx;
      var rBCrossT = rBx * ty - rBy * tx;
      var denomT = invMa + invMb + rACrossT * rACrossT * invIa + rBCrossT * rBCrossT * invIb;
      if (denomT > EPS) {
        var jtRaw = -(rvx * tx + rvy * ty) / denomT;
        var muS = muStaticOverride !== undefined
          ? muStaticOverride
          : M.detSqrt(bodyA.muStatic * bodyB.muStatic);
        var muK = muKineticOverride !== undefined
          ? muKineticOverride
          : M.detSqrt(bodyA.muKinetic * bodyB.muKinetic);

        if (Math.abs(jtRaw) <= jn * muS) {
          jt = jtRaw;
        } else {
          jt = -jn * muK * M.sign(rvx * tx + rvy * ty);
        }

        var impTx = jt * tx;
        var impTy = jt * ty;
        if (!bodyA.isStatic) {
          bodyA.vx = q(M.clampAbs(bodyA.vx - impTx * invMa, MAX_LINEAR_SPEED));
          bodyA.vy = q(M.clampAbs(bodyA.vy - impTy * invMa, MAX_LINEAR_SPEED));
          bodyA.omega = q(M.clampAbs(bodyA.omega - (rAx * impTy - rAy * impTx) * invIa, MAX_ANGULAR_SPEED));
        }
        if (!bodyB.isStatic) {
          bodyB.vx = q(M.clampAbs(bodyB.vx + impTx * invMb, MAX_LINEAR_SPEED));
          bodyB.vy = q(M.clampAbs(bodyB.vy + impTy * invMb, MAX_LINEAR_SPEED));
          bodyB.omega = q(M.clampAbs(bodyB.omega + (rBx * impTy - rBy * impTx) * invIb, MAX_ANGULAR_SPEED));
        }
      }
    }

    return {
      resolved: true,
      jn: q(jn),
      jt: q(jt),
      relVn: q(velAlongNormal),
      relVt: q(tLen)
    };
  }

  // ---------------------------------------------------------------------------
  // 8. Rigid Body Integration (Semi-Implicit Euler + Optional RK4)
  // ---------------------------------------------------------------------------
  function integrateBody(body, dt, env) {
    if (body.isStatic) {
      clearAccumulators(body);
      return body;
    }

    var h = M.clampFixedStep(dt);
    var environment = env || {};
    var gravity = environment.gravity !== undefined ? environment.gravity : DEFAULT_GRAVITY;
    var windX = environment.windX || 0;
    var windY = environment.windY || 0;
    var groundY = environment.groundY !== undefined ? environment.groundY : 0;
    var autoGround = environment.autoGround !== false;

    // 1. Update dynamic Center-of-Mass & parallel-axis inertia tensor
    updateCenterOfMass(body, h);

    if (body.sleeping) {
      clearAccumulators(body);
      return body;
    }

    // 2. Apply aerodynamic drag & Magnus lift
    applyAerodynamicForces(body, windX, windY);

    // 3. Apply gravity when airborne or on slopes
    if (!body.grounded) {
      body.fy = q(body.fy + body.mass * gravity * body.gravityScale);
    }

    // 4. Semi-implicit Euler velocity update
    var ax = body.fx * body.invMass;
    var ay = body.fy * body.invMass;
    var alpha = body.torque * body.invInertia;

    var linDamp = M.detExp(-body.linearDamping * h);
    var angDamp = M.detExp(-body.angularDamping * h);

    body.vx = q(M.clampAbs((body.vx + ax * h) * linDamp, MAX_LINEAR_SPEED));
    body.vy = q(M.clampAbs((body.vy + ay * h) * linDamp, MAX_LINEAR_SPEED));
    body.omega = q(M.clampAbs((body.omega + alpha * h) * angDamp, MAX_ANGULAR_SPEED));

    // 5. Solve surface friction if grounded
    if (body.grounded) {
      solveSurfaceFriction(body, h, gravity);
    }

    // 6. Position & orientation integration
    body.x = q(M.clampAbs(body.x + body.vx * h, M.MAX_COORD));
    body.y = q(M.clampAbs(body.y + body.vy * h, M.MAX_COORD));
    body.angle = q(M.wrapAngle(body.angle + body.omega * h));

    // 7. Ground plane contact clamp (y >= groundY means touching/below floor)
    if (autoGround && body.y >= groundY) {
      body.y = q(groundY);
      if (body.vy > 0) {
        var mat = getCombinedFriction(body, body.surfaceType);
        if (body.vy > 180 && mat.restitution > 0.05) {
          body.vy = q(-body.vy * mat.restitution);
          body.grounded = false;
        } else {
          body.vy = 0;
          body.grounded = true;
        }
      } else {
        body.grounded = true;
      }
      body.groundNormalX = 0;
      body.groundNormalY = -1;
    } else if (autoGround && body.y < groundY - 0.5) {
      body.grounded = false;
    }

    // 8. Upright postural self-righting torque when grounded and not knocked down
    if (body.grounded && body.posture !== 'knockdown' && Math.abs(body.angle) > 1e-4) {
      var righted = M.stepAngularSpring(body.angle, body.omega, 0, 16, 0.85, h);
      body.angle = righted.angle;
      body.omega = righted.omega;
    }

    // 9. Sleep detection for resting bodies
    var linSpd = M.detHypot(body.vx, body.vy);
    if (body.grounded && linSpd < SLEEP_LIN_THRESH && Math.abs(body.omega) < SLEEP_ANG_THRESH) {
      body.sleepTimer = q(body.sleepTimer + h);
      if (body.sleepTimer >= SLEEP_TIME_REQ) {
        body.vx = 0;
        body.vy = 0;
        body.omega = 0;
        body.sleeping = true;
      }
    } else {
      body.sleepTimer = 0;
    }

    clearAccumulators(body);
    return body;
  }

  // High-accuracy RK4 ballistic integration for airborne launches / juggles
  function integrateBodyRK4(body, dt, env) {
    if (body.isStatic) {
      clearAccumulators(body);
      return body;
    }
    var h = M.clampFixedStep(dt);
    var environment = env || {};
    var gravity = environment.gravity !== undefined ? environment.gravity : DEFAULT_GRAVITY;
    var windX = environment.windX || 0;
    var windY = environment.windY || 0;
    var extFx = body.fx;
    var extFy = body.fy;
    var extTau = body.torque;
    var postureSpec = POSTURE_COM_OFFSETS[body.posture] || POSTURE_COM_OFFSETS.idle;
    var effArea = body.crossSection * postureSpec.areaMul;

    updateCenterOfMass(body, h);

    var next = M.stepRK4RigidState(
      {
        x: body.x,
        y: body.y,
        vx: body.vx,
        vy: body.vy,
        angle: body.angle,
        omega: body.omega
      },
      0,
      h,
      function (_x, _y, vx, vy, _ang, om) {
        var rvx = vx - windX;
        var rvy = vy - windY;
        var spd = M.detHypot(rvx, rvy);
        var dragF = -0.5 * body.airDensity * body.dragCoeff * effArea * spd;
        var fx = extFx + dragF * rvx - body.linearDamping * body.mass * vx;
        var fy = extFy + dragF * rvy - body.linearDamping * body.mass * vy;
        if (!body.grounded) {
          fy += body.mass * gravity * body.gravityScale;
        }
        var tau = extTau - body.angularDamping * body.inertia * om;
        return {
          ax: fx * body.invMass,
          ay: fy * body.invMass,
          alpha: tau * body.invInertia
        };
      }
    );

    body.x = next.x;
    body.y = next.y;
    body.vx = next.vx;
    body.vy = next.vy;
    body.angle = next.angle;
    body.omega = next.omega;
    clearAccumulators(body);
    return body;
  }

  // ---------------------------------------------------------------------------
  // 9. Momentum & Kinetic Energy Diagnostics
  // ---------------------------------------------------------------------------
  function computeMomentum(body) {
    if (body.isStatic) {
      return { px: 0, py: 0, mag: 0, angularL: 0 };
    }
    var px = body.mass * body.vx;
    var py = body.mass * body.vy;
    var angularL = body.inertia * body.omega;
    return {
      px: q(px),
      py: q(py),
      mag: q(M.detHypot(px, py)),
      angularL: q(angularL)
    };
  }

  function computeKineticEnergy(body) {
    if (body.isStatic) {
      return { linear: 0, rotational: 0, total: 0 };
    }
    var v2 = body.vx * body.vx + body.vy * body.vy;
    var linear = 0.5 * body.mass * v2;
    var rotational = 0.5 * body.inertia * body.omega * body.omega;
    return {
      linear: q(linear),
      rotational: q(rotational),
      total: q(linear + rotational)
    };
  }

  function computeTotalEnergy(body, gravity, groundY) {
    var ke = computeKineticEnergy(body);
    var g = gravity !== undefined ? gravity : DEFAULT_GRAVITY;
    var floorY = groundY !== undefined ? groundY : 0;
    // Height above floor is (floorY - body.y) since +Y is downward
    var height = Math.max(0, floorY - body.y);
    var pe = body.isStatic ? 0 : body.mass * g * body.gravityScale * height;
    return {
      kinetic: ke.total,
      potential: q(pe),
      total: q(ke.total + pe)
    };
  }

  // ---------------------------------------------------------------------------
  // 10. Deterministic Rollback Snapshot Packing & Unpacking
  // ---------------------------------------------------------------------------
  var PACK_STRIDE = 34;

  function packBody(body, outArray, offset) {
    var arr = outArray || new Array(PACK_STRIDE);
    var o = offset || 0;
    arr[o + 0]  = body.id;
    arr[o + 1]  = body.x;
    arr[o + 2]  = body.y;
    arr[o + 3]  = body.vx;
    arr[o + 4]  = body.vy;
    arr[o + 5]  = body.angle;
    arr[o + 6]  = body.omega;
    arr[o + 7]  = body.facing;
    arr[o + 8]  = body.fx;
    arr[o + 9]  = body.fy;
    arr[o + 10] = body.torque;
    arr[o + 11] = body.mass;
    arr[o + 12] = body.inertia;
    arr[o + 13] = body.comX;
    arr[o + 14] = body.comY;
    arr[o + 15] = body.comTargetX;
    arr[o + 16] = body.comTargetY;
    arr[o + 17] = body.comVx;
    arr[o + 18] = body.comVy;
    arr[o + 19] = POSTURE_TO_IDX[body.posture] || 0;
    arr[o + 20] = SURFACE_TO_IDX[body.surfaceType] || 0;
    arr[o + 21] = body.grounded ? 1 : 0;
    arr[o + 22] = body.groundNormalX;
    arr[o + 23] = body.groundNormalY;
    arr[o + 24] = body.sleeping ? 1 : 0;
    arr[o + 25] = body.sleepTimer;
    arr[o + 26] = body.stanceStability;
    arr[o + 27] = body.lastImpulseMag;
    arr[o + 28] = body.lastTorqueMag;
    arr[o + 29] = body.gravityScale;
    arr[o + 30] = body.muStatic;
    arr[o + 31] = body.muKinetic;
    arr[o + 32] = body.restitution;
    arr[o + 33] = body.isStatic ? 1 : 0;
    return arr;
  }

  function unpackBody(body, arr, offset) {
    var o = offset || 0;
    body.id = arr[o + 0];
    body.x = arr[o + 1];
    body.y = arr[o + 2];
    body.vx = arr[o + 3];
    body.vy = arr[o + 4];
    body.angle = arr[o + 5];
    body.omega = arr[o + 6];
    body.facing = arr[o + 7] === -1 ? -1 : 1;
    body.fx = arr[o + 8];
    body.fy = arr[o + 9];
    body.torque = arr[o + 10];
    body.mass = arr[o + 11];
    body.inertia = arr[o + 12];
    body.comX = arr[o + 13];
    body.comY = arr[o + 14];
    body.comTargetX = arr[o + 15];
    body.comTargetY = arr[o + 16];
    body.comVx = arr[o + 17];
    body.comVy = arr[o + 18];
    body.posture = POSTURE_IDS[arr[o + 19]] || 'idle';
    body.surfaceType = SURFACE_IDS[arr[o + 20]] || 'stone';
    body.grounded = arr[o + 21] === 1;
    body.groundNormalX = arr[o + 22];
    body.groundNormalY = arr[o + 23];
    body.sleeping = arr[o + 24] === 1;
    body.sleepTimer = arr[o + 25];
    body.stanceStability = arr[o + 26];
    body.lastImpulseMag = arr[o + 27];
    body.lastTorqueMag = arr[o + 28];
    body.gravityScale = arr[o + 29];
    body.muStatic = arr[o + 30];
    body.muKinetic = arr[o + 31];
    body.restitution = arr[o + 32];
    body.isStatic = arr[o + 33] === 1;

    body.invMass = (!body.isStatic && body.mass > EPS) ? q(1 / body.mass) : 0;
    body.invInertia = (!body.isStatic && body.inertia > EPS) ? q(1 / body.inertia) : 0;
    return body;
  }

  function packBodyPool(bodies) {
    var count = bodies.length;
    var out = new Array(count * PACK_STRIDE);
    for (var i = 0; i < count; i++) {
      packBody(bodies[i], out, i * PACK_STRIDE);
    }
    return out;
  }

  function unpackBodyPool(bodies, packed) {
    var count = Math.min(bodies.length, Math.floor(packed.length / PACK_STRIDE));
    for (var i = 0; i < count; i++) {
      unpackBody(bodies[i], packed, i * PACK_STRIDE);
    }
    return bodies;
  }

  // Deterministic FNV-1a 32-bit hash over quantized rigid body state for desync detection
  function checksumBody(body) {
    var snap = packBody(body);
    var hash = 2166136261;
    for (var i = 0; i < PACK_STRIDE; i++) {
      var v = Math.round(snap[i] * 1000) | 0;
      hash ^= (v & 0xff);
      hash = Math.imul(hash, 16777619);
      hash ^= ((v >>> 8) & 0xff);
      hash = Math.imul(hash, 16777619);
      hash ^= ((v >>> 16) & 0xff);
      hash = Math.imul(hash, 16777619);
      hash ^= ((v >>> 24) & 0xff);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // ---------------------------------------------------------------------------
  // Export to RYPhysics.RigidBody
  // ---------------------------------------------------------------------------
  RYP.RigidBody = {
    // Constants & Tables
    DEFAULT_GRAVITY: DEFAULT_GRAVITY,
    DEFAULT_AIR_DENSITY: DEFAULT_AIR_DENSITY,
    MAX_LINEAR_SPEED: MAX_LINEAR_SPEED,
    MAX_ANGULAR_SPEED: MAX_ANGULAR_SPEED,
    PACK_STRIDE: PACK_STRIDE,
    SURFACE_MATERIALS: SURFACE_MATERIALS,
    ARCHETYPE_PROFILES: ARCHETYPE_PROFILES,
    HERO_ARCHETYPE_MAP: HERO_ARCHETYPE_MAP,
    POSTURE_COM_OFFSETS: POSTURE_COM_OFFSETS,

    // Lifecycle & Hero Profiles
    getProfileForHero: getProfileForHero,
    computeRectInertia: computeRectInertia,
    createBody: createBody,
    configureHeroProfile: configureHeroProfile,
    resetBody: resetBody,
    syncFromFighter: syncFromFighter,
    syncToFighter: syncToFighter,

    // Center-of-Mass & Inertia Tensor
    setPosture: setPosture,
    getWorldCenterOfMass: getWorldCenterOfMass,
    computeParallelAxisInertia: computeParallelAxisInertia,
    computeStanceStability: computeStanceStability,
    updateCenterOfMass: updateCenterOfMass,

    // Forces, Torques & Impulses
    wakeBody: wakeBody,
    clearAccumulators: clearAccumulators,
    applyForce: applyForce,
    applyTorque: applyTorque,
    applyForceAtPoint: applyForceAtPoint,
    applyForceAtLocalPoint: applyForceAtLocalPoint,
    applyImpulse: applyImpulse,
    applyAngularImpulse: applyAngularImpulse,
    applyImpulseAtPoint: applyImpulseAtPoint,
    getPointVelocity: getPointVelocity,

    // Friction & Aerodynamics
    getCombinedFriction: getCombinedFriction,
    computeNormalForce: computeNormalForce,
    solveSurfaceFriction: solveSurfaceFriction,
    computeStoppingDistance: computeStoppingDistance,
    computeAerodynamicDrag: computeAerodynamicDrag,
    applyAerodynamicForces: applyAerodynamicForces,

    // Coupling & Integration
    computeEffectiveMassAtPoint: computeEffectiveMassAtPoint,
    resolveLinearAngularCoupling: resolveLinearAngularCoupling,
    integrateBody: integrateBody,
    integrateBodyRK4: integrateBodyRK4,

    // Energy & Momentum
    computeMomentum: computeMomentum,
    computeKineticEnergy: computeKineticEnergy,
    computeTotalEnergy: computeTotalEnergy,

    // Rollback Snapshot Serialization
    packBody: packBody,
    unpackBody: unpackBody,
    packBodyPool: packBodyPool,
    unpackBodyPool: unpackBodyPool,
    checksumBody: checksumBody
  };
})(RYPhysics);
