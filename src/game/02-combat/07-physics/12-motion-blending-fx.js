// ============================================================================
// RenYing Martial Arts Physics — Module 12: Motion Blending, FX & Integration
// ----------------------------------------------------------------------------
// Procedural martial arts animation dynamics, ink-wash combat FX & top-level
// RYPhysics integration hooks:
//   - Procedural pose blending & 2nd-order spring-interpolated limb/torso recoil
//   - Volume-preserving squash-and-stretch impulse deformation
//   - Procedural weapon ribbon trail history buffer (水墨刀光)
//   - Directional impact sparks, ground shockwaves & meridian ring particles
//   - Cinematic finisher slow-motion camera impulse (timeScale, zoom, focus)
//   - Top-level hooks: RYPhysics.ensureFighter, stepFighter, resolveHit,
//     drawFighterFx, getTelemetry, snapshotFighter, restoreFighter
// ============================================================================
(function (root) {
  'use strict';

  var RYPhysics = (typeof window !== 'undefined'
    ? (window.RYPhysics = window.RYPhysics || {})
    : (root.RYPhysics = root.RYPhysics || {}));

  // --------------------------------------------------------------------------
  // 1. Deterministic Math, Hash PRNG & Environment Helpers
  // --------------------------------------------------------------------------
  var PI = Math.PI;
  var TWO_PI = Math.PI * 2;
  var EPS = 1e-6;

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

  // Pure deterministic hash in [0, 1) — zero Math.random() calls
  function detRand(seed) {
    var x = (seed | 0) ^ 0x9e3779b9;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  }

  function detRange(seed, lo, hi) {
    return lo + (hi - lo) * detRand(seed);
  }

  function isResimulating() {
    return typeof RESIM !== 'undefined' && !!RESIM;
  }

  function isFighterGrounded(f) {
    if (!f) return true;
    if (typeof f.onGround === 'function') return !!f.onGround();
    return (f.y || 0) >= -2 && (f.vy || 0) >= 0;
  }

  function getWeaponLength(f) {
    if (!f) return 54;
    if (typeof f.wlen === 'number' && f.wlen > 0) return f.wlen;
    return 54;
  }

  function getFighterPalette(f) {
    var primary = '233,196,106';
    var secondary = '120,220,255';
    if (f && f.look) {
      if (typeof f.look.rgb === 'string') primary = f.look.rgb;
      else if (typeof f.look.accentRgb === 'string') primary = f.look.accentRgb;
    }
    return { primary: primary, secondary: secondary, ink: '24,26,34' };
  }

  // --------------------------------------------------------------------------
  // 2. Configuration Constants
  // --------------------------------------------------------------------------
  var CONFIG = {
    // Spring-damper pose recoil parameters
    torsoStiffness: 240,
    torsoDamping: 22,
    headStiffness: 290,
    headDamping: 20,
    limbStiffness: 320,
    limbDamping: 24,
    poseBlendRate: 14.0,

    // Squash-and-stretch oscillator
    deformStiffness: 260,
    deformDamping: 18,
    minScaleX: 0.72,
    maxScaleX: 1.38,
    minScaleY: 0.72,
    maxScaleY: 1.38,

    // Weapon ribbon trail buffer
    ribbonMaxPoints: 18,
    ribbonPointLifeSec: 0.20,
    ribbonMinSpeedSq: 180,

    // Visual particle & ring pools
    maxParticles: 240,
    maxRings: 48,
    sparkGravity: 820,
    inkGravity: 420,

    // Cinematic finisher camera impulse
    maxCinematicSec: 0.75,
    cameraSpringK: 140,
    cameraSpringC: 18
  };

  // --------------------------------------------------------------------------
  // 3. Per-Fighter Motion & Recoil State (Deterministic Simulation State)
  // --------------------------------------------------------------------------
  function createMotionState() {
    return {
      // 2nd-order damped harmonic springs
      torsoPitch: 0,
      torsoPitchVel: 0,
      torsoOffX: 0,
      torsoOffXVel: 0,
      torsoOffY: 0,
      torsoOffYVel: 0,
      headNod: 0,
      headNodVel: 0,
      leadArmRecoil: 0,
      leadArmVel: 0,
      rearArmRecoil: 0,
      rearArmVel: 0,

      // Pose transition blending
      prevState: 'idle',
      poseBlend: 1.0,
      wasGrounded: true,
      prevVy: 0,

      // Volume-preserving squash & stretch
      stretch: 0,          // >0 = vertical stretch, <0 = horizontal squash
      stretchVel: 0,
      scaleX: 1.0,
      scaleY: 1.0,

      // Deterministic FX seed counter (monotone per fighter)
      fxSeq: 0
    };
  }

  function createVisualFxState() {
    return {
      ribbon: [],          // Array of { tipX, tipY, baseX, baseY, age, maxAge, width, alpha }
      activeSwing: false,
      lastTipX: 0,
      lastTipY: 0,
      hasLastTip: false
    };
  }

  function ensureMotionState(f) {
    if (!f) return null;
    if (!f._ryPhys) f._ryPhys = {};
    if (!f._ryPhys.motion) f._ryPhys.motion = createMotionState();
    return f._ryPhys.motion;
  }

  function ensureVisualFx(f) {
    if (!f) return null;
    if (!f._ryFx) f._ryFx = createVisualFxState();
    return f._ryFx;
  }

  function snapshotMotionState(f) {
    var m = ensureMotionState(f);
    if (!m) return null;
    return {
      torsoPitch: m.torsoPitch,
      torsoPitchVel: m.torsoPitchVel,
      torsoOffX: m.torsoOffX,
      torsoOffXVel: m.torsoOffXVel,
      torsoOffY: m.torsoOffY,
      torsoOffYVel: m.torsoOffYVel,
      headNod: m.headNod,
      headNodVel: m.headNodVel,
      leadArmRecoil: m.leadArmRecoil,
      leadArmVel: m.leadArmVel,
      rearArmRecoil: m.rearArmRecoil,
      rearArmVel: m.rearArmVel,
      prevState: m.prevState,
      poseBlend: m.poseBlend,
      wasGrounded: m.wasGrounded,
      prevVy: m.prevVy,
      stretch: m.stretch,
      stretchVel: m.stretchVel,
      scaleX: m.scaleX,
      scaleY: m.scaleY,
      fxSeq: m.fxSeq
    };
  }

  function restoreMotionState(f, snap) {
    if (!f || !snap) return;
    var m = ensureMotionState(f);
    for (var k in snap) {
      if (Object.prototype.hasOwnProperty.call(snap, k)) {
        m[k] = snap[k];
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. Spring-Damper Solver & Squash-and-Stretch Impulse Engine
  // --------------------------------------------------------------------------
  function stepSpring(pos, vel, target, k, c, dt) {
    var safeDt = clamp(dt, 0, 0.033);
    var acc = -k * (pos - target) - c * vel;
    vel += acc * safeDt;
    pos += vel * safeDt;
    if (Math.abs(pos - target) < 1e-4 && Math.abs(vel) < 1e-4) {
      pos = target;
      vel = 0;
    }
    return { p: quantize(pos), v: quantize(vel) };
  }

  function applyRecoilImpulse(f, impulse) {
    var m = ensureMotionState(f);
    if (!m || !impulse) return;
    if (impulse.torsoPitchVel) m.torsoPitchVel += impulse.torsoPitchVel;
    if (impulse.torsoOffXVel) m.torsoOffXVel += impulse.torsoOffXVel;
    if (impulse.torsoOffYVel) m.torsoOffYVel += impulse.torsoOffYVel;
    if (impulse.headNodVel) m.headNodVel += impulse.headNodVel;
    if (impulse.leadArmVel) m.leadArmVel += impulse.leadArmVel;
    if (impulse.rearArmVel) m.rearArmVel += impulse.rearArmVel;
    if (impulse.stretchVel) m.stretchVel += impulse.stretchVel;
  }

  function applySquashStretch(f, stretchImpulse) {
    var m = ensureMotionState(f);
    if (!m) return;
    m.stretchVel = clamp(m.stretchVel + stretchImpulse, -14, 14);
  }

  function stepMotionSprings(f, dt) {
    var m = ensureMotionState(f);
    if (!m) return;
    var safeDt = clamp(dt || 0.016, 0, 0.033);
    var state = f.state || 'idle';
    var face = signOr(f.face, 1);
    var grounded = isFighterGrounded(f);

    // Detect state change -> initiate procedural pose blend
    if (state !== m.prevState) {
      m.poseBlend = 0.0;
      if (state === 'attack' || state === 'skill') {
        m.leadArmVel += 7.5;
        m.stretchVel += 2.2;
      } else if (state === 'block' || state === 'blockstun') {
        m.torsoPitchVel -= 4.2 * face;
        m.stretchVel -= 2.4;
      } else if (state === 'hitstun' || state === 'thrown') {
        m.headNodVel += 9.0 * face;
        m.stretchVel -= 3.8;
      } else if (state === 'air' && m.wasGrounded && (f.vy || 0) < -160) {
        // Jump takeoff vertical stretch
        m.stretchVel += 5.4;
      }
      m.prevState = state;
    }

    // Detect ground landing -> volume-preserving impact squash
    if (grounded && !m.wasGrounded) {
      var impactSpeed = Math.abs(m.prevVy || 0);
      var squashMag = clamp(impactSpeed / 140, 1.8, 7.5);
      m.stretchVel -= squashMag;
      m.torsoOffYVel += squashMag * 12;
      if (!isResimulating() && impactSpeed > 260) {
        spawnDustPuff(f.x, 0, clamp(impactSpeed / 320, 0.7, 1.8), (f.idx || 0) * 97 + (++m.fxSeq));
      }
    }
    m.wasGrounded = grounded;
    m.prevVy = f.vy || 0;

    // Advance procedural pose blend weight
    m.poseBlend = clamp(m.poseBlend + CONFIG.poseBlendRate * safeDt, 0, 1);

    // Target torso lean based on horizontal velocity & combat state
    var vx = f.vx || 0;
    var targetPitch = clamp((vx / 480) * 0.22, -0.28, 0.28);
    if (state === 'block' || state === 'blockstun') targetPitch = -0.14 * face;
    else if (state === 'attack') targetPitch = 0.16 * face;

    var spPitch = stepSpring(m.torsoPitch, m.torsoPitchVel, targetPitch, CONFIG.torsoStiffness, CONFIG.torsoDamping, safeDt);
    m.torsoPitch = spPitch.p;
    m.torsoPitchVel = spPitch.v;

    var spOffX = stepSpring(m.torsoOffX, m.torsoOffXVel, 0, CONFIG.torsoStiffness, CONFIG.torsoDamping, safeDt);
    m.torsoOffX = spOffX.p;
    m.torsoOffXVel = spOffX.v;

    var spOffY = stepSpring(m.torsoOffY, m.torsoOffYVel, 0, CONFIG.torsoStiffness, CONFIG.torsoDamping, safeDt);
    m.torsoOffY = spOffY.p;
    m.torsoOffYVel = spOffY.v;

    var spHead = stepSpring(m.headNod, m.headNodVel, 0, CONFIG.headStiffness, CONFIG.headDamping, safeDt);
    m.headNod = spHead.p;
    m.headNodVel = spHead.v;

    var spLead = stepSpring(m.leadArmRecoil, m.leadArmVel, 0, CONFIG.limbStiffness, CONFIG.limbDamping, safeDt);
    m.leadArmRecoil = spLead.p;
    m.leadArmVel = spLead.v;

    var spRear = stepSpring(m.rearArmRecoil, m.rearArmVel, 0, CONFIG.limbStiffness, CONFIG.limbDamping, safeDt);
    m.rearArmRecoil = spRear.p;
    m.rearArmVel = spRear.v;

    // Volume-preserving squash-and-stretch spring (scaleX * scaleY ~= 1)
    var spStretch = stepSpring(m.stretch, m.stretchVel, 0, CONFIG.deformStiffness, CONFIG.deformDamping, safeDt);
    m.stretch = clamp(spStretch.p, -0.32, 0.36);
    m.stretchVel = spStretch.v;

    var sy = clamp(1.0 + m.stretch, CONFIG.minScaleY, CONFIG.maxScaleY);
    var sx = clamp(1.0 / sy, CONFIG.minScaleX, CONFIG.maxScaleX);
    m.scaleX = quantize(sx);
    m.scaleY = quantize(sy);
  }

  function getDeformTransform(f) {
    var m = ensureMotionState(f);
    if (!m) {
      return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, leanRad: 0, headNod: 0, poseBlend: 1 };
    }
    return {
      scaleX: m.scaleX,
      scaleY: m.scaleY,
      offsetX: m.torsoOffX,
      offsetY: m.torsoOffY,
      leanRad: m.torsoPitch,
      headNod: m.headNod,
      leadArmRecoil: m.leadArmRecoil,
      rearArmRecoil: m.rearArmRecoil,
      poseBlend: m.poseBlend
    };
  }

  // --------------------------------------------------------------------------
  // 5. Procedural Weapon Ribbon Trail Buffer (Visual-Only, RESIM-Safe)
  // --------------------------------------------------------------------------
  function sampleWeaponSegment(f) {
    var face = signOr(f.face, 1);
    var wlen = getWeaponLength(f);
    var m = ensureMotionState(f);
    var baseX = (f.x || 0) + face * 18 + (m ? m.torsoOffX : 0);
    var baseY = (f.y || 0) - 56 + (m ? m.torsoOffY : 0);

    var swAngle = (f.j && typeof f.j.sw === 'number') ? f.j.sw : 0;
    var swingOffset = m ? m.leadArmRecoil * 0.35 : 0;
    var worldAngle = (swAngle + swingOffset) * face + (face < 0 ? PI : 0);

    var tipX = baseX + Math.cos(worldAngle) * wlen;
    var tipY = baseY + Math.sin(worldAngle) * wlen;
    return { baseX: baseX, baseY: baseY, tipX: tipX, tipY: tipY };
  }

  function updateWeaponRibbon(f, dt) {
    if (!f || isResimulating()) return;
    var fx = ensureVisualFx(f);
    var safeDt = clamp(dt || 0.016, 0, 0.05);

    // Age existing ribbon points and prune expired ones
    var writeIdx = 0;
    for (var i = 0; i < fx.ribbon.length; i++) {
      var pt = fx.ribbon[i];
      pt.age += safeDt;
      if (pt.age < pt.maxAge) {
        fx.ribbon[writeIdx++] = pt;
      }
    }
    fx.ribbon.length = writeIdx;

    var st = f.state || 'idle';
    var swinging = st === 'attack' || st === 'skill' || st === 'special' || st === 'throw_exec';
    var seg = sampleWeaponSegment(f);

    if (swinging) {
      var distSq = fx.hasLastTip
        ? ((seg.tipX - fx.lastTipX) * (seg.tipX - fx.lastTipX) + (seg.tipY - fx.lastTipY) * (seg.tipY - fx.lastTipY))
        : CONFIG.ribbonMinSpeedSq + 1;

      if (distSq >= CONFIG.ribbonMinSpeedSq * 0.25 || fx.ribbon.length === 0) {
        fx.ribbon.push({
          tipX: seg.tipX,
          tipY: seg.tipY,
          baseX: seg.baseX,
          baseY: seg.baseY,
          age: 0,
          maxAge: st === 'special' ? CONFIG.ribbonPointLifeSec * 1.45 : CONFIG.ribbonPointLifeSec,
          intensity: st === 'special' ? 1.35 : (st === 'skill' ? 1.15 : 0.9)
        });
        if (fx.ribbon.length > CONFIG.ribbonMaxPoints) {
          fx.ribbon.shift();
        }
      }
      fx.activeSwing = true;
    } else {
      fx.activeSwing = false;
    }

    fx.lastTipX = seg.tipX;
    fx.lastTipY = seg.tipY;
    fx.hasLastTip = true;
  }

  function drawWeaponRibbon(ctx, f) {
    if (!ctx || !f || !f._ryFx) return;
    var pts = f._ryFx.ribbon;
    if (!pts || pts.length < 2) return;

    var pal = getFighterPalette(f);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw tapered ink-wash outer blade ribbon
    for (var i = 1; i < pts.length; i++) {
      var p0 = pts[i - 1];
      var p1 = pts[i];
      var lifeFrac = 1 - clamp(p1.age / p1.maxAge, 0, 1);
      var alpha = lifeFrac * lifeFrac * 0.58 * (p1.intensity || 1);
      if (alpha <= 0.01) continue;

      ctx.beginPath();
      ctx.moveTo(p0.baseX, p0.baseY);
      ctx.lineTo(p0.tipX, p0.tipY);
      ctx.lineTo(p1.tipX, p1.tipY);
      ctx.lineTo(p1.baseX, p1.baseY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + pal.primary + ',' + alpha.toFixed(3) + ')';
      ctx.fill();

      // Bright inner edge spine along the weapon tip arc
      ctx.beginPath();
      ctx.moveTo(p0.tipX, p0.tipY);
      ctx.lineTo(p1.tipX, p1.tipY);
      ctx.strokeStyle = 'rgba(255,250,235,' + (alpha * 1.15).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.2, 4.2 * lifeFrac);
      ctx.stroke();
    }

    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // 6. Directional Impact Sparks, Shockwaves & Meridian Ring Particle Physics
  // --------------------------------------------------------------------------
  var PARTICLES = [];
  var RINGS = [];

  function pushParticle(p) {
    if (isResimulating()) return;
    if (PARTICLES.length >= CONFIG.maxParticles) {
      PARTICLES.shift();
    }
    PARTICLES.push(p);
  }

  function pushRing(r) {
    if (isResimulating()) return;
    if (RINGS.length >= CONFIG.maxRings) {
      RINGS.shift();
    }
    RINGS.push(r);
  }

  function spawnImpactSparks(x, y, dirX, count, rgb, seedBase, intensity) {
    if (isResimulating()) return;
    var n = clamp(count || 10, 2, 28);
    var scale = intensity || 1.0;
    var baseAngle = dirX >= 0 ? 0 : PI;

    for (var i = 0; i < n; i++) {
      var s = (seedBase || 1) + i * 31;
      var spread = detRange(s, -0.95, 0.95);
      var speed = detRange(s + 7, 190, 560) * scale;
      var ang = baseAngle + spread;
      var isInk = (i % 3 === 0);

      pushParticle({
        kind: isInk ? 'ink_droplet' : 'spark',
        x: x,
        y: y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - detRange(s + 13, 30, 140),
        age: 0,
        maxAge: detRange(s + 19, 0.16, 0.34),
        size: isInk ? detRange(s + 23, 2.5, 5.5) : detRange(s + 23, 1.6, 3.2),
        drag: isInk ? 3.8 : 2.2,
        rgb: isInk ? '24,26,34' : (rgb || '255,220,130')
      });
    }
  }

  function spawnMeridianBurst(x, y, rgb, seedBase, ringCount) {
    if (isResimulating()) return;
    var rings = clamp(ringCount || 2, 1, 3);
    for (var r = 0; r < rings; r++) {
      pushRing({
        kind: 'meridian_ring',
        x: x,
        y: y,
        radius: 14 + r * 10,
        maxRadius: 115 + r * 38,
        age: 0,
        maxAge: 0.34 + r * 0.08,
        lineWidth: 3.2 - r * 0.7,
        rot: r * 0.9,
        rotSpeed: (r % 2 === 0 ? 1 : -1) * 4.5,
        rgb: rgb || '120,230,255',
        squashY: 1.0
      });
    }

    // Orbiting meridian qi motes
    for (var i = 0; i < 8; i++) {
      var s = (seedBase || 17) + i * 43;
      var ang = (TWO_PI * i) / 8 + detRange(s, -0.15, 0.15);
      var spd = detRange(s + 5, 110, 230);
      pushParticle({
        kind: 'meridian_node',
        x: x + Math.cos(ang) * 14,
        y: y + Math.sin(ang) * 14,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        age: 0,
        maxAge: detRange(s + 11, 0.28, 0.48),
        size: detRange(s + 17, 2.8, 4.8),
        drag: 3.2,
        rgb: rgb || '120,230,255'
      });
    }
  }

  function spawnGroundShockwave(x, y, radius, energy, seedBase) {
    if (isResimulating()) return;
    var rMax = clamp(radius || 150, 70, 320);
    pushRing({
      kind: 'shockwave',
      x: x,
      y: y,
      radius: 18,
      maxRadius: rMax,
      age: 0,
      maxAge: 0.38,
      lineWidth: 4.5 * clamp(energy || 1, 0.7, 1.5),
      rot: 0,
      rotSpeed: 0,
      rgb: '233,196,106',
      squashY: 0.34
    });
    spawnDustPuff(x, y, clamp(energy || 1, 0.8, 2.0), seedBase || 101);
  }

  function spawnDustPuff(x, y, intensity, seedBase) {
    if (isResimulating()) return;
    var count = Math.round(clamp(6 * intensity, 4, 14));
    for (var i = 0; i < count; i++) {
      var s = (seedBase || 53) + i * 29;
      var dir = (i % 2 === 0 ? 1 : -1);
      pushParticle({
        kind: 'dust_puff',
        x: x + detRange(s, -18, 18),
        y: y - detRange(s + 3, 2, 10),
        vx: dir * detRange(s + 7, 70, 230) * intensity,
        vy: -detRange(s + 11, 35, 135) * intensity,
        age: 0,
        maxAge: detRange(s + 13, 0.26, 0.48),
        size: detRange(s + 17, 5.0, 12.0) * intensity,
        drag: 4.5,
        rgb: '195,186,168'
      });
    }
  }

  function stepParticlesAndRings(dt) {
    if (isResimulating()) return;
    var safeDt = clamp(dt || 0.016, 0, 0.05);

    // Step particles
    var pWrite = 0;
    for (var i = 0; i < PARTICLES.length; i++) {
      var p = PARTICLES[i];
      p.age += safeDt;
      if (p.age >= p.maxAge) continue;

      var damp = Math.max(0, 1 - p.drag * safeDt);
      p.vx *= damp;
      p.vy *= damp;
      if (p.kind === 'spark') p.vy += CONFIG.sparkGravity * safeDt;
      else if (p.kind === 'ink_droplet') p.vy += CONFIG.inkGravity * safeDt;
      else if (p.kind === 'dust_puff') p.vy -= 45 * safeDt;

      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      if (p.y > 0 && (p.kind === 'spark' || p.kind === 'ink_droplet')) {
        p.y = 0;
        p.vy = -Math.abs(p.vy) * 0.35;
        p.vx *= 0.65;
      }
      PARTICLES[pWrite++] = p;
    }
    PARTICLES.length = pWrite;

    // Step rings
    var rWrite = 0;
    for (var j = 0; j < RINGS.length; j++) {
      var r = RINGS[j];
      r.age += safeDt;
      if (r.age >= r.maxAge) continue;
      var t = clamp(r.age / r.maxAge, 0, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      r.radius = lerp(14, r.maxRadius, eased);
      r.rot += (r.rotSpeed || 0) * safeDt;
      RINGS[rWrite++] = r;
    }
    RINGS.length = rWrite;
  }

  function drawGlobalFx(ctx) {
    if (!ctx) return;
    ctx.save();

    // Draw expanding shockwaves & meridian rings
    for (var i = 0; i < RINGS.length; i++) {
      var r = RINGS[i];
      var life = 1 - clamp(r.age / r.maxAge, 0, 1);
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.scale(1, r.squashY || 1);
      ctx.rotate(r.rot || 0);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, r.radius), 0, TWO_PI);
      ctx.strokeStyle = 'rgba(' + r.rgb + ',' + (life * 0.82).toFixed(3) + ')';
      ctx.lineWidth = Math.max(0.8, r.lineWidth * life);
      if (r.kind === 'meridian_ring') {
        ctx.setLineDash([12, 8]);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw directional sparks, ink droplets, meridian motes & dust
    for (var j = 0; j < PARTICLES.length; j++) {
      var p = PARTICLES[j];
      var pLife = 1 - clamp(p.age / p.maxAge, 0, 1);
      if (p.kind === 'spark') {
        var tailX = p.x - p.vx * 0.022;
        var tailY = p.y - p.vy * 0.022;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = 'rgba(' + p.rgb + ',' + (pLife * 0.95).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1.0, p.size * pLife);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.8, p.size * (p.kind === 'dust_puff' ? (1.3 - 0.5 * pLife) : pLife)), 0, TWO_PI);
        ctx.fillStyle = 'rgba(' + p.rgb + ',' + (pLife * (p.kind === 'dust_puff' ? 0.38 : 0.85)).toFixed(3) + ')';
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // 7. Cinematic Finisher Slow-Motion Camera Impulse
  // --------------------------------------------------------------------------
  var CAMERA = {
    active: false,
    timer: 0,
    duration: 0,
    timeScale: 1.0,
    targetTimeScale: 1.0,
    zoomOffset: 0,
    zoomVel: 0,
    targetZoom: 0,
    shakeMag: 0,
    shakeX: 0,
    shakeY: 0,
    focusX: 0,
    focusY: 0,
    flashAlpha: 0,
    seq: 0
  };

  function triggerCinematicImpulse(opts) {
    if (isResimulating()) return;
    opts = opts || {};
    var dur = clamp(opts.durationSec || 0.36, 0.08, CONFIG.maxCinematicSec);
    CAMERA.active = true;
    CAMERA.timer = 0;
    CAMERA.duration = Math.max(CAMERA.duration - CAMERA.timer, dur);
    CAMERA.targetTimeScale = clamp(opts.timeScale || 0.32, 0.18, 1.0);
    CAMERA.timeScale = Math.min(CAMERA.timeScale, CAMERA.targetTimeScale);
    CAMERA.targetZoom = clamp(opts.zoomOffset || 0.14, 0, 0.32);
    CAMERA.shakeMag = Math.max(CAMERA.shakeMag, clamp(opts.shake || 8, 0, 24));
    if (typeof opts.x === 'number') CAMERA.focusX = opts.x;
    if (typeof opts.y === 'number') CAMERA.focusY = opts.y;
    CAMERA.flashAlpha = Math.max(CAMERA.flashAlpha, clamp(opts.flashAlpha || 0.25, 0, 0.65));
  }

  function stepCameraImpulse(dt) {
    if (isResimulating()) return;
    var safeDt = clamp(dt || 0.016, 0, 0.05);

    if (CAMERA.active) {
      CAMERA.timer += safeDt;
      if (CAMERA.timer >= CAMERA.duration) {
        CAMERA.active = false;
        CAMERA.targetTimeScale = 1.0;
        CAMERA.targetZoom = 0;
      }
    }

    // Smooth recovery of timeScale & spring-damped zoom
    CAMERA.timeScale = lerp(CAMERA.timeScale, CAMERA.targetTimeScale, clamp(10 * safeDt, 0, 1));
    if (!CAMERA.active && Math.abs(CAMERA.timeScale - 1.0) < 0.005) {
      CAMERA.timeScale = 1.0;
    }

    var spZ = stepSpring(CAMERA.zoomOffset, CAMERA.zoomVel, CAMERA.targetZoom, CONFIG.cameraSpringK, CONFIG.cameraSpringC, safeDt);
    CAMERA.zoomOffset = spZ.p;
    CAMERA.zoomVel = spZ.v;

    // Deterministic decaying micro-shake
    if (CAMERA.shakeMag > 0.15) {
      CAMERA.seq++;
      CAMERA.shakeX = detRange(CAMERA.seq * 73, -CAMERA.shakeMag, CAMERA.shakeMag);
      CAMERA.shakeY = detRange(CAMERA.seq * 137, -CAMERA.shakeMag, CAMERA.shakeMag);
      CAMERA.shakeMag *= Math.max(0, 1 - 11 * safeDt);
    } else {
      CAMERA.shakeMag = 0;
      CAMERA.shakeX = 0;
      CAMERA.shakeY = 0;
    }

    if (CAMERA.flashAlpha > 0) {
      CAMERA.flashAlpha = Math.max(0, CAMERA.flashAlpha - 2.2 * safeDt);
    }
  }

  function getCameraImpulse() {
    return {
      active: CAMERA.active,
      timeScale: quantize(CAMERA.timeScale),
      zoomOffset: quantize(CAMERA.zoomOffset),
      shakeX: quantize(CAMERA.shakeX),
      shakeY: quantize(CAMERA.shakeY),
      focusX: CAMERA.focusX,
      focusY: CAMERA.focusY,
      flashAlpha: quantize(CAMERA.flashAlpha)
    };
  }

  function resetGlobalFx() {
    PARTICLES.length = 0;
    RINGS.length = 0;
    CAMERA.active = false;
    CAMERA.timer = 0;
    CAMERA.duration = 0;
    CAMERA.timeScale = 1.0;
    CAMERA.targetTimeScale = 1.0;
    CAMERA.zoomOffset = 0;
    CAMERA.zoomVel = 0;
    CAMERA.targetZoom = 0;
    CAMERA.shakeMag = 0;
    CAMERA.shakeX = 0;
    CAMERA.shakeY = 0;
    CAMERA.flashAlpha = 0;
  }

  // --------------------------------------------------------------------------
  // 8. Event Bridge for Grapple / Combo / Hit FX
  // --------------------------------------------------------------------------
  function handlePhysicsEvents(events) {
    if (!Array.isArray(events) || isResimulating()) return;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev) continue;
      if (ev.type === 'throw_tech') {
        spawnMeridianBurst(ev.x, ev.y, '120,235,255', (ev.attackerIdx + 1) * 199, 2);
        spawnImpactSparks(ev.x, ev.y, 1, 10, '160,240,255', (ev.victimIdx + 1) * 131, 0.9);
      } else if (ev.type === 'ground_slam') {
        spawnGroundShockwave(ev.x, 0, ev.radius, ev.energy, (ev.victimIdx + 1) * 257);
        spawnImpactSparks(ev.x, -6, 1, 14, '255,205,110', (ev.victimIdx + 1) * 311, 1.15);
        triggerCinematicImpulse({
          durationSec: 0.24,
          timeScale: 0.45,
          zoomOffset: 0.11,
          shake: ev.shake || 11,
          x: ev.x,
          y: -24,
          flashAlpha: 0.18
        });
      } else if (ev.type === 'acupoint_pulse' || ev.type === 'acupoint_seal') {
        spawnMeridianBurst(ev.x, ev.y, '255,150,220', (ev.victimIdx + 1) * 401 + (ev.pulseIndex || 0) * 17, 1);
      } else if (ev.type === 'crowd_throw_hit') {
        spawnImpactSparks(ev.x, ev.y, 1, 12, '255,190,95', (ev.bystanderIdx + 1) * 353, 1.0);
        CAMERA.shakeMag = Math.max(CAMERA.shakeMag, 7);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 9. Top-Level RYPhysics Integration Hooks
  // --------------------------------------------------------------------------
  function ensureFighter(f) {
    if (!f) return null;
    if (!f._ryPhys) f._ryPhys = {};

    // Initialize sibling modules if loaded
    if (RYPhysics.Kinematics && typeof RYPhysics.Kinematics.ensureState === 'function') RYPhysics.Kinematics.ensureState(f);
    if (RYPhysics.Stance && typeof RYPhysics.Stance.ensureState === 'function') RYPhysics.Stance.ensureState(f);
    if (RYPhysics.Guard && typeof RYPhysics.Guard.ensureState === 'function') RYPhysics.Guard.ensureState(f);
    if (RYPhysics.Aerial && typeof RYPhysics.Aerial.ensureState === 'function') RYPhysics.Aerial.ensureState(f);
    if (RYPhysics.Knockback && typeof RYPhysics.Knockback.ensureState === 'function') RYPhysics.Knockback.ensureState(f);

    // Initialize modules 10, 11, 12
    if (RYPhysics.Grapple && typeof RYPhysics.Grapple.ensureState === 'function') RYPhysics.Grapple.ensureState(f);
    if (RYPhysics.ComboEngine && typeof RYPhysics.ComboEngine.ensureState === 'function') RYPhysics.ComboEngine.ensureState(f);
    ensureMotionState(f);
    ensureVisualFx(f);
    return f._ryPhys;
  }

  function snapshotFighter(f) {
    if (!f) return null;
    ensureFighter(f);
    var snap = {
      motion: snapshotMotionState(f)
    };
    if (RYPhysics.Grapple && typeof RYPhysics.Grapple.snapshotState === 'function') {
      snap.grapple = RYPhysics.Grapple.snapshotState(f);
    }
    if (RYPhysics.ComboEngine && typeof RYPhysics.ComboEngine.snapshotState === 'function') {
      snap.combo = RYPhysics.ComboEngine.snapshotState(f);
    }
    return snap;
  }

  function restoreFighter(f, snap) {
    if (!f || !snap) return;
    ensureFighter(f);
    if (snap.motion) restoreMotionState(f, snap.motion);
    if (snap.grapple && RYPhysics.Grapple && typeof RYPhysics.Grapple.restoreState === 'function') {
      RYPhysics.Grapple.restoreState(f, snap.grapple);
    }
    if (snap.combo && RYPhysics.ComboEngine && typeof RYPhysics.ComboEngine.restoreState === 'function') {
      RYPhysics.ComboEngine.restoreState(f, snap.combo);
    }
  }

  function stepFighter(f, dt, opts) {
    opts = opts || {};
    if (!f || f.hidden) return { events: [] };
    ensureFighter(f);

    var safeDt = clamp(dt || 0.016, 0, 0.05);
    var events = [];

    // 1. Step grapple / throw coupled physics
    if (RYPhysics.Grapple && typeof RYPhysics.Grapple.stepFighter === 'function') {
      RYPhysics.Grapple.stepFighter(f, safeDt, opts.fighters, events);
    }

    // 2. Step combo chain timers, cancel buffers & juggle scaling recovery
    if (RYPhysics.ComboEngine && typeof RYPhysics.ComboEngine.stepFighter === 'function') {
      RYPhysics.ComboEngine.stepFighter(f, safeDt);
    }

    // 3. Step sibling physics modules if present
    if (RYPhysics.Kinematics && typeof RYPhysics.Kinematics.stepFighter === 'function') {
      RYPhysics.Kinematics.stepFighter(f, safeDt, opts);
    }
    if (RYPhysics.Stance && typeof RYPhysics.Stance.stepFighter === 'function') {
      RYPhysics.Stance.stepFighter(f, safeDt, opts);
    }
    if (RYPhysics.Guard && typeof RYPhysics.Guard.stepFighter === 'function') {
      RYPhysics.Guard.stepFighter(f, safeDt, opts);
    }
    if (RYPhysics.Aerial && typeof RYPhysics.Aerial.stepFighter === 'function') {
      RYPhysics.Aerial.stepFighter(f, safeDt, opts);
    }

    // 4. Step deterministic spring-damper pose recoil & squash-stretch
    stepMotionSprings(f, safeDt);

    // 5. Visual-only FX updates (strictly skipped on RESIM)
    if (!isResimulating()) {
      updateWeaponRibbon(f, safeDt);
      if (events.length > 0) handlePhysicsEvents(events);
      if (opts.stepGlobalFx !== false && (opts.isPrimaryFighter || f.idx === 0)) {
        stepParticlesAndRings(safeDt);
        stepCameraImpulse(safeDt);
      }
    }

    return {
      events: events,
      deform: getDeformTransform(f)
    };
  }

  function resolveHit(att, def, move, hitPt, opts) {
    opts = opts || {};
    if (!att || !def) return null;
    ensureFighter(att);
    ensureFighter(def);

    var m = move || {};
    var ptX = (hitPt && typeof hitPt[0] === 'number') ? hitPt[0] : ((att.x + def.x) * 0.5);
    var ptY = (hitPt && typeof hitPt[1] === 'number') ? hitPt[1] : ((def.y || 0) - 56);
    var dirX = signOr(m.dir || att.face || (def.x - att.x), 1);

    // Classify move category for ComboEngine
    var category = opts.category || m.category || (m.ult ? 'ult' : (m.skill ? 'skill' : (m.big ? 'heavy' : 'light')));
    var moveId = opts.moveId || m.name || m.directionalId || category;
    var baseDmg = typeof m.dmg === 'number' ? m.dmg : 16;
    var baseStun = typeof m.stun === 'number' ? m.stun : (m.big ? 0.38 : 0.24);

    // Evaluate through ComboEngine (proration, counter-hit, frame advantage, team synergy)
    var comboRes = null;
    if (RYPhysics.ComboEngine && typeof RYPhysics.ComboEngine.recordHit === 'function') {
      comboRes = RYPhysics.ComboEngine.recordHit(att, def, {
        category: category,
        moveId: moveId,
        damage: baseDmg,
        stunSec: baseStun,
        blocked: !!opts.blocked,
        launch: !!m.launch,
        hitstunBonusSec: m.hitstunBonusSec || 0,
        blockstunBonusSec: m.blockstunBonusSec || 0
      }, opts.fighters);
    }

    // Apply deterministic spring recoil & squash-and-stretch impulses to both fighters
    var heavyFactor = (m.ult ? 1.65 : (m.big ? 1.25 : 0.85));
    var defMotion = ensureMotionState(def);
    var attMotion = ensureMotionState(att);
    defMotion.fxSeq++;
    attMotion.fxSeq++;

    if (opts.blocked) {
      applyRecoilImpulse(def, {
        torsoPitchVel: -4.5 * dirX * heavyFactor,
        torsoOffXVel: 85 * dirX * heavyFactor,
        stretchVel: -2.8 * heavyFactor
      });
      applyRecoilImpulse(att, {
        leadArmVel: -5.5 * heavyFactor,
        torsoOffXVel: -32 * dirX * heavyFactor
      });
    } else {
      applyRecoilImpulse(def, {
        torsoPitchVel: 7.2 * dirX * heavyFactor,
        torsoOffXVel: 145 * dirX * heavyFactor,
        headNodVel: 11.0 * dirX * heavyFactor,
        stretchVel: (m.launch ? 5.2 : -4.6) * heavyFactor
      });
      applyRecoilImpulse(att, {
        leadArmVel: 6.0 * heavyFactor,
        stretchVel: 1.8 * heavyFactor
      });
    }

    // Spawn visual impact FX & cinematic slow-mo (non-simulation, RESIM-guarded)
    if (!isResimulating()) {
      var seed = ((att.idx || 0) * 131 + (def.idx || 0) * 257 + defMotion.fxSeq * 37) | 0;
      var isCounter = !!(comboRes && comboRes.context && comboRes.context.isCounter);
      var isSynergy = !!(comboRes && comboRes.synergy && comboRes.synergy.triggered);
      var isFinisherKO = !opts.blocked && (def.hp || 0) - (comboRes ? comboRes.damage : baseDmg) <= 0;

      if (opts.blocked) {
        spawnImpactSparks(ptX, ptY, -dirX, 7, '130,225,255', seed, 0.78);
      } else {
        var sparkRgb = isCounter ? '255,115,90' : (isSynergy ? '140,255,210' : '255,220,130');
        spawnImpactSparks(ptX, ptY, dirX, Math.round(10 * heavyFactor), sparkRgb, seed, heavyFactor);
      }

      if (isCounter || isSynergy || m.ult) {
        var ringRgb = isSynergy ? '130,255,210' : (isCounter ? '255,110,85' : '255,225,130');
        spawnMeridianBurst(ptX, ptY, ringRgb, seed + 9, m.ult ? 3 : 2);
      }

      if (isFinisherKO || m.ult || (isCounter && m.big)) {
        triggerCinematicImpulse({
          durationSec: isFinisherKO ? 0.58 : (m.ult ? 0.38 : 0.22),
          timeScale: isFinisherKO ? 0.22 : (m.ult ? 0.34 : 0.48),
          zoomOffset: isFinisherKO ? 0.22 : (m.ult ? 0.16 : 0.10),
          shake: isFinisherKO ? 16 : (m.ult ? 14 : 10),
          x: ptX,
          y: ptY,
          flashAlpha: isFinisherKO ? 0.42 : (m.ult ? 0.28 : 0.16)
        });
      }
    }

    return {
      damage: comboRes ? comboRes.damage : baseDmg,
      stunSec: comboRes ? comboRes.stunSec : baseStun,
      hitstopBonusSec: comboRes ? comboRes.hitstopBonusSec : 0,
      proration: comboRes ? comboRes.proration : 1.0,
      gravityScale: comboRes ? comboRes.gravityScale : 1.0,
      launchScale: comboRes ? comboRes.launchScale : 1.0,
      context: comboRes ? comboRes.context : null,
      frameAdvantage: comboRes ? comboRes.frameAdvantage : null,
      synergy: comboRes ? comboRes.synergy : null,
      deform: getDeformTransform(def)
    };
  }

  function drawFighterFx(ctx, f, opts) {
    if (!ctx) return;
    opts = opts || {};
    if (f) {
      drawWeaponRibbon(ctx, f);
    }
    if (opts.drawGlobal || (f && f.idx === 0 && opts.drawGlobal !== false)) {
      drawGlobalFx(ctx);
    }
  }

  function getTelemetry(f) {
    var out = {
      camera: getCameraImpulse(),
      activeParticles: PARTICLES.length,
      activeRings: RINGS.length
    };
    if (f) {
      ensureFighter(f);
      out.motion = getDeformTransform(f);
      if (RYPhysics.Grapple && typeof RYPhysics.Grapple.getDebugInfo === 'function') {
        out.grapple = RYPhysics.Grapple.getDebugInfo(f);
      }
      if (RYPhysics.ComboEngine && typeof RYPhysics.ComboEngine.getTelemetry === 'function') {
        out.combo = RYPhysics.ComboEngine.getTelemetry(f);
      }
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // 10. Public Exports on RYPhysics.MotionFX & Top-Level RYPhysics Hooks
  // --------------------------------------------------------------------------
  RYPhysics.MotionFX = {
    CONFIG: CONFIG,
    ensureMotionState: ensureMotionState,
    ensureVisualFx: ensureVisualFx,
    snapshotMotionState: snapshotMotionState,
    restoreMotionState: restoreMotionState,
    applyRecoilImpulse: applyRecoilImpulse,
    applySquashStretch: applySquashStretch,
    stepMotionSprings: stepMotionSprings,
    getDeformTransform: getDeformTransform,
    updateWeaponRibbon: updateWeaponRibbon,
    drawWeaponRibbon: drawWeaponRibbon,
    spawnImpactSparks: spawnImpactSparks,
    spawnMeridianBurst: spawnMeridianBurst,
    spawnGroundShockwave: spawnGroundShockwave,
    spawnDustPuff: spawnDustPuff,
    stepParticlesAndRings: stepParticlesAndRings,
    drawGlobalFx: drawGlobalFx,
    triggerCinematicImpulse: triggerCinematicImpulse,
    stepCameraImpulse: stepCameraImpulse,
    getCameraImpulse: getCameraImpulse,
    handlePhysicsEvents: handlePhysicsEvents,
    resetGlobalFx: resetGlobalFx
  };

  // Top-level integration hooks required by RenYing combat & render loops
  RYPhysics.ensureFighter = ensureFighter;
  RYPhysics.snapshotFighter = snapshotFighter;
  RYPhysics.restoreFighter = restoreFighter;
  RYPhysics.stepFighter = stepFighter;
  RYPhysics.resolveHit = resolveHit;
  RYPhysics.drawFighterFx = drawFighterFx;
  RYPhysics.getTelemetry = getTelemetry;
})(typeof globalThis !== 'undefined' ? globalThis : this);
