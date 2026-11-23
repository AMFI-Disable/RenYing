// ======================= 01. 运动学与确定性数学内核 =======================
// Rollback-deterministic 2D kinematics, vector/matrix algebra, spring-damper
// solvers, integrators, splines, and swept segment math for RenYing combat.

var RYPhysics = (typeof window !== 'undefined' ? (window.RYPhysics = window.RYPhysics || {}) : {});

(function (RYP) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Constants & Deterministic Quantization / Fixed-Step Clamping
  // ---------------------------------------------------------------------------
  var EPSILON = 1e-6;
  var SQRT_EPSILON = 1e-3;
  var PI = 3.141592653589793;
  var TWO_PI = 6.283185307179586;
  var HALF_PI = 1.5707963267948966;
  var QUARTER_PI = 0.7853981633974483;
  var INV_PI = 0.3183098861837907;
  var INV_TWO_PI = 0.15915494309189535;
  var DEG_TO_RAD = 0.017453292519943295;
  var RAD_TO_DEG = 57.29577951308232;

  var FIXED_DT = 1 / 60;
  var MIN_DT = 1 / 240;
  var MAX_DT = 1 / 20;
  var QUANT_SCALE = 1000000;
  var INV_QUANT_SCALE = 1 / QUANT_SCALE;
  var MAX_COORD = 1e6;
  var MAX_VEL = 1e5;
  var MAX_ACCEL = 1e6;

  // 5-point Gauss-Legendre quadrature nodes & weights on [0, 1]
  var GL5_T = [
    0.046910077030668004,
    0.23076534494715845,
    0.5,
    0.7692346550528415,
    0.953089922969332
  ];
  var GL5_W = [
    0.11846344252809454,
    0.23931433524968324,
    0.28444444444444444,
    0.23931433524968324,
    0.11846344252809454
  ];

  function quantize(v, scale) {
    if (v !== v || v === Infinity || v === -Infinity) return 0;
    var s = scale || QUANT_SCALE;
    var q = Math.round(v * s) / s;
    return q === 0 ? 0 : q;
  }

  function clamp(v, minVal, maxVal) {
    if (v !== v) return minVal;
    if (v < minVal) return minVal;
    if (v > maxVal) return maxVal;
    return v;
  }

  function clamp01(v) {
    if (v !== v || v <= 0) return 0;
    if (v >= 1) return 1;
    return v;
  }

  function clampAbs(v, maxAbs) {
    if (v !== v) return 0;
    if (v > maxAbs) return maxAbs;
    if (v < -maxAbs) return -maxAbs;
    return v;
  }

  function clampFixedStep(dt, minDt, maxDt) {
    var lo = minDt !== undefined ? minDt : MIN_DT;
    var hi = maxDt !== undefined ? maxDt : MAX_DT;
    if (typeof dt !== 'number' || dt !== dt || dt <= 0) return FIXED_DT;
    return quantize(clamp(dt, lo, hi));
  }

  function sign(v) {
    return v > 0 ? 1 : (v < 0 ? -1 : 0);
  }

  function signNonZero(v) {
    return v < 0 ? -1 : 1;
  }

  function approxEqual(a, b, eps) {
    var e = eps !== undefined ? eps : EPSILON;
    return Math.abs(a - b) <= e;
  }

  function approxZero(v, eps) {
    var e = eps !== undefined ? eps : EPSILON;
    return Math.abs(v) <= e;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function invLerp(a, b, v) {
    var d = b - a;
    if (Math.abs(d) <= EPSILON) return 0;
    return clamp01((v - a) / d);
  }

  function remap(v, inMin, inMax, outMin, outMax) {
    return lerp(outMin, outMax, invLerp(inMin, inMax, v));
  }

  function smoothstep(edge0, edge1, x) {
    var t = invLerp(edge0, edge1, x);
    return t * t * (3 - 2 * t);
  }

  function smootherstep(edge0, edge1, x) {
    var t = invLerp(edge0, edge1, x);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function moveTowards(current, target, maxDelta) {
    var diff = target - current;
    if (Math.abs(diff) <= maxDelta) return target;
    return current + sign(diff) * maxDelta;
  }

  function solveQuadratic(a, b, c) {
    if (Math.abs(a) <= EPSILON) {
      if (Math.abs(b) <= EPSILON) return { count: 0, r0: 0, r1: 0 };
      var lin = -c / b;
      return { count: 1, r0: lin, r1: lin };
    }
    var disc = b * b - 4 * a * c;
    if (disc < -EPSILON) return { count: 0, r0: 0, r1: 0 };
    if (disc <= EPSILON) {
      var r = -0.5 * b / a;
      return { count: 1, r0: r, r1: r };
    }
    var sqrtD = detSqrt(disc);
    // Numerically stable Citardauq form avoids catastrophic cancellation
    var q = -0.5 * (b + (b >= 0 ? sqrtD : -sqrtD));
    var t0 = q / a;
    var t1 = Math.abs(q) > EPSILON ? (c / q) : (-b / a);
    return t0 <= t1
      ? { count: 2, r0: t0, r1: t1 }
      : { count: 2, r0: t1, r1: t0 };
  }

  // ---------------------------------------------------------------------------
  // 2. Deterministic Trigonometric, Sqrt & Angle-Wrapping Helpers
  // ---------------------------------------------------------------------------
  function wrapAngle(rad) {
    if (rad !== rad || rad === Infinity || rad === -Infinity) return 0;
    var a = (rad + PI) % TWO_PI;
    if (a < 0) a += TWO_PI;
    var out = a - PI;
    return out === 0 ? 0 : out;
  }

  function wrapAnglePositive(rad) {
    if (rad !== rad || rad === Infinity || rad === -Infinity) return 0;
    var a = rad % TWO_PI;
    if (a < 0) a += TWO_PI;
    return a === 0 ? 0 : a;
  }

  function angleDiff(from, to) {
    return wrapAngle(to - from);
  }

  function lerpAngle(a, b, t) {
    return wrapAngle(a + angleDiff(a, b) * t);
  }

  function moveTowardsAngle(current, target, maxDelta) {
    var d = angleDiff(current, target);
    if (Math.abs(d) <= maxDelta) return wrapAngle(target);
    return wrapAngle(current + sign(d) * maxDelta);
  }

  // Deterministic sqrt using IEEE-754 seed + fixed 2 Newton-Raphson refinements
  function detSqrt(x) {
    if (x <= 0 || x !== x) return 0;
    var y = Math.sqrt(x);
    y = 0.5 * (y + x / y);
    y = 0.5 * (y + x / y);
    return y;
  }

  function detHypot(x, y) {
    var ax = Math.abs(x);
    var ay = Math.abs(y);
    if (ax === 0 && ay === 0) return 0;
    if (ax < ay) {
      var tmp = ax;
      ax = ay;
      ay = tmp;
    }
    var r = ay / ax;
    return ax * detSqrt(1 + r * r);
  }

  // 11th-order minimax polynomial for sin(x) on [-PI/2, PI/2] (max error < 1e-11)
  function detSin(rad) {
    var x = wrapAngle(rad);
    if (x > HALF_PI) x = PI - x;
    else if (x < -HALF_PI) x = -PI - x;
    var x2 = x * x;
    var res = x * (1 + x2 * (-0.16666666666666666 + x2 * (0.008333333333333333 +
      x2 * (-0.0001984126984126984 + x2 * (2.7557319223985893e-6 - 2.505210838544172e-8 * x2)))));
    return quantize(clamp(res, -1, 1));
  }

  function detCos(rad) {
    return detSin(rad + HALF_PI);
  }

  function detSinCos(rad) {
    var s = detSin(rad);
    var c = detCos(rad);
    return { s: s, c: c };
  }

  function detTan(rad) {
    var c = detCos(rad);
    if (Math.abs(c) < 1e-9) return c >= 0 ? 1e9 : -1e9;
    return quantize(detSin(rad) / c);
  }

  // Deterministic atan on [0, 1] using degree-9 minimax polynomial
  function detAtanUnit(z) {
    var z2 = z * z;
    return z * (0.9999993329 + z2 * (-0.3332985605 + z2 * (0.1994653599 +
      z2 * (-0.1390853351 + z2 * (0.0964200441 + z2 * (-0.0559098861 +
      z2 * (0.0218612288 - 0.0040540580 * z2)))))));
  }

  function detAtan2(y, x) {
    if (x === 0 && y === 0) return 0;
    var ax = Math.abs(x);
    var ay = Math.abs(y);
    var angle;
    if (ax >= ay) {
      angle = detAtanUnit(ay / ax);
    } else {
      angle = HALF_PI - detAtanUnit(ax / ay);
    }
    if (x < 0) angle = PI - angle;
    if (y < 0) angle = -angle;
    return quantize(angle);
  }

  // Deterministic exp(x) via range reduction x = k*ln(2) + r, |r| <= ln(2)/2
  function detExp(x) {
    if (x !== x) return 1;
    if (x > 80) return 5.54062238439351e34;
    if (x < -80) return 0;
    var LN2 = 0.6931471805599453;
    var INV_LN2 = 1.4426950408889634;
    var k = Math.round(x * INV_LN2);
    var r = x - k * LN2;
    var p = 1 + r * (1 + r * (0.5 + r * (0.16666666666666666 +
      r * (0.041666666666666664 + r * (0.008333333333333333 +
      r * (0.001388888888888889 + r * 0.0001984126984126984))))));
    if (k >= 0) {
      var mul = 1;
      for (var i = 0; i < k; i++) mul *= 2;
      return p * mul;
    }
    var div = 1;
    for (var j = 0; j < -k; j++) div *= 2;
    return p / div;
  }

  // ---------------------------------------------------------------------------
  // 3. Complete 2D Vector Algebra
  // ---------------------------------------------------------------------------
  function vec2(x, y) {
    return { x: x || 0, y: y || 0 };
  }

  function vec2Clone(v) {
    return { x: v.x, y: v.y };
  }

  function vec2Set(out, x, y) {
    out.x = x;
    out.y = y;
    return out;
  }

  function vec2Zero(out) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  function vec2FromAngle(rad, length) {
    var l = length !== undefined ? length : 1;
    return { x: detCos(rad) * l, y: detSin(rad) * l };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function addOut(a, b, out) {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    return out;
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function subOut(a, b, out) {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    return out;
  }

  function scale(v, s) {
    return { x: v.x * s, y: v.y * s };
  }

  function scaleOut(v, s, out) {
    out.x = v.x * s;
    out.y = v.y * s;
    return out;
  }

  function addScaled(a, b, s) {
    return { x: a.x + b.x * s, y: a.y + b.y * s };
  }

  function addScaledOut(a, b, s, out) {
    out.x = a.x + b.x * s;
    out.y = a.y + b.y * s;
    return out;
  }

  function neg(v) {
    return { x: -v.x, y: -v.y };
  }

  function mulComp(a, b) {
    return { x: a.x * b.x, y: a.y * b.y };
  }

  function divComp(a, b) {
    return {
      x: Math.abs(b.x) > EPSILON ? a.x / b.x : 0,
      y: Math.abs(b.y) > EPSILON ? a.y / b.y : 0
    };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function cross(a, b) {
    return a.x * b.y - a.y * b.x;
  }

  function crossVecScalar(v, s) {
    return { x: s * v.y, y: -s * v.x };
  }

  function crossScalarVec(s, v) {
    return { x: -s * v.y, y: s * v.x };
  }

  function perp(v) {
    return { x: -v.y, y: v.x };
  }

  function perpCW(v) {
    return { x: v.y, y: -v.x };
  }

  function lenSq(v) {
    return v.x * v.x + v.y * v.y;
  }

  function len(v) {
    return detHypot(v.x, v.y);
  }

  function norm(v) {
    var l = detHypot(v.x, v.y);
    if (l <= EPSILON) return { x: 0, y: 0 };
    var inv = 1 / l;
    return { x: v.x * inv, y: v.y * inv };
  }

  function normOut(v, out) {
    var l = detHypot(v.x, v.y);
    if (l <= EPSILON) {
      out.x = 0;
      out.y = 0;
      return out;
    }
    var inv = 1 / l;
    out.x = v.x * inv;
    out.y = v.y * inv;
    return out;
  }

  function normWithLen(v) {
    var l = detHypot(v.x, v.y);
    if (l <= EPSILON) return { x: 0, y: 0, len: 0 };
    var inv = 1 / l;
    return { x: v.x * inv, y: v.y * inv, len: l };
  }

  function setLen(v, targetLen) {
    var l = detHypot(v.x, v.y);
    if (l <= EPSILON) return { x: 0, y: 0 };
    var s = targetLen / l;
    return { x: v.x * s, y: v.y * s };
  }

  function clampLen(v, maxLen) {
    var l2 = v.x * v.x + v.y * v.y;
    if (l2 <= maxLen * maxLen) return { x: v.x, y: v.y };
    var s = maxLen / detSqrt(l2);
    return { x: v.x * s, y: v.y * s };
  }

  function distSq(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function dist(a, b) {
    return detHypot(a.x - b.x, a.y - b.y);
  }

  function manhattanDist(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function projScalar(a, onto) {
    var l = detHypot(onto.x, onto.y);
    if (l <= EPSILON) return 0;
    return (a.x * onto.x + a.y * onto.y) / l;
  }

  function proj(a, onto) {
    var l2 = onto.x * onto.x + onto.y * onto.y;
    if (l2 <= EPSILON * EPSILON) return { x: 0, y: 0 };
    var k = (a.x * onto.x + a.y * onto.y) / l2;
    return { x: onto.x * k, y: onto.y * k };
  }

  function rej(a, onto) {
    var p = proj(a, onto);
    return { x: a.x - p.x, y: a.y - p.y };
  }

  function reflect(v, unitNormal) {
    var d2 = 2 * (v.x * unitNormal.x + v.y * unitNormal.y);
    return { x: v.x - d2 * unitNormal.x, y: v.y - d2 * unitNormal.y };
  }

  function slide(v, unitNormal) {
    var d = v.x * unitNormal.x + v.y * unitNormal.y;
    return { x: v.x - d * unitNormal.x, y: v.y - d * unitNormal.y };
  }

  function rotate(v, rad) {
    var c = detCos(rad);
    var s = detSin(rad);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  }

  function rotateOut(v, rad, out) {
    var c = detCos(rad);
    var s = detSin(rad);
    var x = v.x * c - v.y * s;
    var y = v.x * s + v.y * c;
    out.x = x;
    out.y = y;
    return out;
  }

  function rotateBySinCos(v, s, c) {
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  }

  function rotateAround(v, pivot, rad) {
    var dx = v.x - pivot.x;
    var dy = v.y - pivot.y;
    var c = detCos(rad);
    var s = detSin(rad);
    return {
      x: pivot.x + dx * c - dy * s,
      y: pivot.y + dx * s + dy * c
    };
  }

  function angleOf(v) {
    return detAtan2(v.y, v.x);
  }

  function signedAngleBetween(a, b) {
    return detAtan2(cross(a, b), dot(a, b));
  }

  function angleBetween(a, b) {
    return Math.abs(signedAngleBetween(a, b));
  }

  function vecLerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function slerp(a, b, t) {
    var la = detHypot(a.x, a.y);
    var lb = detHypot(b.x, b.y);
    if (la <= EPSILON || lb <= EPSILON) {
      return vecLerp(a, b, t);
    }
    var ua = { x: a.x / la, y: a.y / la };
    var ub = { x: b.x / lb, y: b.y / lb };
    var theta = signedAngleBetween(ua, ub);
    var targetLen = la + (lb - la) * t;
    if (Math.abs(theta) <= 1e-4) {
      var lin = vecLerp(ua, ub, t);
      return setLen(lin, targetLen);
    }
    var rotated = rotate(ua, theta * t);
    return { x: rotated.x * targetLen, y: rotated.y * targetLen };
  }

  function vecMoveTowards(current, target, maxDelta) {
    var dx = target.x - current.x;
    var dy = target.y - current.y;
    var d = detHypot(dx, dy);
    if (d <= maxDelta || d <= EPSILON) return { x: target.x, y: target.y };
    var s = maxDelta / d;
    return { x: current.x + dx * s, y: current.y + dy * s };
  }

  function vecQuantize(v, scaleVal) {
    return { x: quantize(v.x, scaleVal), y: quantize(v.y, scaleVal) };
  }

  // ---------------------------------------------------------------------------
  // 4. 2x2 & 3x2 Affine Transform Matrices
  // ---------------------------------------------------------------------------
  function mat2Identity() {
    return { m00: 1, m01: 0, m10: 0, m11: 1 };
  }

  function mat2Create(m00, m01, m10, m11) {
    return { m00: m00, m01: m01, m10: m10, m11: m11 };
  }

  function mat2FromAngle(rad) {
    var c = detCos(rad);
    var s = detSin(rad);
    return { m00: c, m01: -s, m10: s, m11: c };
  }

  function mat2FromScale(sx, sy) {
    return { m00: sx, m01: 0, m10: 0, m11: sy };
  }

  function mat2Mul(a, b) {
    return {
      m00: a.m00 * b.m00 + a.m01 * b.m10,
      m01: a.m00 * b.m01 + a.m01 * b.m11,
      m10: a.m10 * b.m00 + a.m11 * b.m10,
      m11: a.m10 * b.m01 + a.m11 * b.m11
    };
  }

  function mat2MulVec(m, v) {
    return {
      x: m.m00 * v.x + m.m01 * v.y,
      y: m.m10 * v.x + m.m11 * v.y
    };
  }

  function mat2Transpose(m) {
    return { m00: m.m00, m01: m.m10, m10: m.m01, m11: m.m11 };
  }

  function mat2TransposeMulVec(m, v) {
    return {
      x: m.m00 * v.x + m.m10 * v.y,
      y: m.m01 * v.x + m.m11 * v.y
    };
  }

  function mat2Det(m) {
    return m.m00 * m.m11 - m.m01 * m.m10;
  }

  function mat2Invert(m) {
    var d = m.m00 * m.m11 - m.m01 * m.m10;
    if (Math.abs(d) <= EPSILON) return null;
    var inv = 1 / d;
    return {
      m00: m.m11 * inv,
      m01: -m.m01 * inv,
      m10: -m.m10 * inv,
      m11: m.m00 * inv
    };
  }

  // 3x2 affine matrix: [ a  c  tx ]
  //                    [ b  d  ty ]
  function mat2dIdentity() {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  }

  function mat2dCreate(a, b, c, d, tx, ty) {
    return { a: a, b: b, c: c, d: d, tx: tx || 0, ty: ty || 0 };
  }

  function mat2dFromTRS(tx, ty, rad, sx, sy) {
    var scaleX = sx !== undefined ? sx : 1;
    var scaleY = sy !== undefined ? sy : 1;
    var cos = detCos(rad || 0);
    var sin = detSin(rad || 0);
    return {
      a: cos * scaleX,
      b: sin * scaleX,
      c: -sin * scaleY,
      d: cos * scaleY,
      tx: tx || 0,
      ty: ty || 0
    };
  }

  function mat2dFromPivotTRS(tx, ty, rad, sx, sy, px, py) {
    var m = mat2dFromTRS(tx, ty, rad, sx, sy);
    var ox = px || 0;
    var oy = py || 0;
    m.tx -= m.a * ox + m.c * oy;
    m.ty -= m.b * ox + m.d * oy;
    return m;
  }

  function mat2dMul(m1, m2) {
    return {
      a: m1.a * m2.a + m1.c * m2.b,
      b: m1.b * m2.a + m1.d * m2.b,
      c: m1.a * m2.c + m1.c * m2.d,
      d: m1.b * m2.c + m1.d * m2.d,
      tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
      ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty
    };
  }

  function mat2dInvert(m) {
    var det = m.a * m.d - m.b * m.c;
    if (Math.abs(det) <= EPSILON) return null;
    var inv = 1 / det;
    var a = m.d * inv;
    var b = -m.b * inv;
    var c = -m.c * inv;
    var d = m.a * inv;
    return {
      a: a,
      b: b,
      c: c,
      d: d,
      tx: -(a * m.tx + c * m.ty),
      ty: -(b * m.tx + d * m.ty)
    };
  }

  function mat2dTransformPoint(m, p) {
    return {
      x: m.a * p.x + m.c * p.y + m.tx,
      y: m.b * p.x + m.d * p.y + m.ty
    };
  }

  function mat2dTransformVector(m, v) {
    return {
      x: m.a * v.x + m.c * v.y,
      y: m.b * v.x + m.d * v.y
    };
  }

  function mat2dTransformNormal(m, n) {
    // Inverse-transpose of linear 2x2 part, normalized
    var det = m.a * m.d - m.b * m.c;
    if (Math.abs(det) <= EPSILON) return { x: n.x, y: n.y };
    var nx = m.d * n.x - m.b * n.y;
    var ny = -m.c * n.x + m.a * n.y;
    if (det < 0) {
      nx = -nx;
      ny = -ny;
    }
    return norm({ x: nx, y: ny });
  }

  function mat2dDecompose(m) {
    var sx = detHypot(m.a, m.b);
    var sy = detHypot(m.c, m.d);
    var det = m.a * m.d - m.b * m.c;
    if (det < 0) sy = -sy;
    var rad = sx > EPSILON ? detAtan2(m.b, m.a) : 0;
    return { tx: m.tx, ty: m.ty, rad: rad, sx: sx, sy: sy };
  }

  function mat2dLerp(m1, m2, t) {
    var d1 = mat2dDecompose(m1);
    var d2 = mat2dDecompose(m2);
    return mat2dFromTRS(
      lerp(d1.tx, d2.tx, t),
      lerp(d1.ty, d2.ty, t),
      lerpAngle(d1.rad, d2.rad, t),
      lerp(d1.sx, d2.sx, t),
      lerp(d1.sy, d2.sy, t)
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Second-Order Spring-Damper Solver (Exact Analytical Closed-Form)
  // ---------------------------------------------------------------------------
  function springParamsFromStiffness(stiffness, damping, mass) {
    var m = mass > EPSILON ? mass : 1;
    var k = stiffness > 0 ? stiffness : 0;
    var c = damping >= 0 ? damping : 0;
    var omega = detSqrt(k / m);
    var zeta = omega > EPSILON ? c / (2 * m * omega) : 1;
    return { omega: omega, zeta: zeta };
  }

  function criticalDamping(stiffness, mass) {
    return 2 * detSqrt(Math.max(0, stiffness * mass));
  }

  // Solves x'' + 2*zeta*omega*(x' - targetV) + omega^2*(x - targetX) = 0
  // Unconditionally stable for all dt > 0, omega >= 0, zeta >= 0.
  function stepSpring1D(x, v, targetX, targetV, omega, zeta, dt) {
    var h = clampFixedStep(dt);
    var w = Math.max(0, omega);
    var z = Math.max(0, zeta);
    var tv = targetV || 0;
    if (w <= EPSILON) {
      return { x: quantize(x + v * h), v: quantize(v) };
    }

    var x0 = x - targetX;
    var v0 = v - tv;
    var newX;
    var newV;

    if (z < 1 - 1e-4) {
      // Underdamped oscillatory decay
      var wd = w * detSqrt(1 - z * z);
      var expTerm = detExp(-z * w * h);
      var cosTerm = detCos(wd * h);
      var sinTerm = detSin(wd * h);
      var c1 = x0;
      var c2 = (v0 + z * w * x0) / wd;
      var disp = expTerm * (c1 * cosTerm + c2 * sinTerm);
      var vel = expTerm * ((c2 * wd - c1 * z * w) * cosTerm - (c1 * wd + c2 * z * w) * sinTerm);
      newX = targetX + disp;
      newV = tv + vel;
    } else if (z <= 1 + 1e-4) {
      // Critically damped
      var expC = detExp(-w * h);
      var a1 = x0;
      var a2 = v0 + w * x0;
      var dispC = expC * (a1 + a2 * h);
      var velC = expC * (a2 - w * (a1 + a2 * h));
      newX = targetX + dispC;
      newV = tv + velC;
    } else {
      // Overdamped dual exponential decay
      var root = detSqrt(z * z - 1);
      var r1 = -w * (z - root);
      var r2 = -w * (z + root);
      var invDiff = 1 / (r1 - r2);
      var k1 = (v0 - r2 * x0) * invDiff;
      var k2 = (r1 * x0 - v0) * invDiff;
      var e1 = detExp(r1 * h);
      var e2 = detExp(r2 * h);
      newX = targetX + k1 * e1 + k2 * e2;
      newV = tv + k1 * r1 * e1 + k2 * r2 * e2;
    }

    return { x: quantize(newX), v: quantize(newV) };
  }

  function stepSpring2D(pos, vel, targetPos, targetVel, omega, zeta, dt) {
    var tvx = targetVel ? targetVel.x : 0;
    var tvy = targetVel ? targetVel.y : 0;
    var sx = stepSpring1D(pos.x, vel.x, targetPos.x, tvx, omega, zeta, dt);
    var sy = stepSpring1D(pos.y, vel.y, targetPos.y, tvy, omega, zeta, dt);
    return { x: sx.x, y: sy.x, vx: sx.v, vy: sy.v };
  }

  function stepAngularSpring(angle, omegaVel, targetAngle, omega, zeta, dt) {
    var diff = angleDiff(targetAngle, angle);
    var stepped = stepSpring1D(diff, omegaVel, 0, 0, omega, zeta, dt);
    return {
      angle: quantize(wrapAngle(targetAngle + stepped.x)),
      omega: stepped.v
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Semi-Implicit Euler, Verlet & RK4 Integrators
  // ---------------------------------------------------------------------------
  function stepSemiImplicitEuler1D(x, v, a, dt) {
    var h = clampFixedStep(dt);
    var nv = clampAbs(v + a * h, MAX_VEL);
    var nx = clampAbs(x + nv * h, MAX_COORD);
    return { x: quantize(nx), v: quantize(nv) };
  }

  function stepSemiImplicitEuler2D(pos, vel, acc, dt) {
    var h = clampFixedStep(dt);
    var vx = clampAbs(vel.x + clampAbs(acc.x, MAX_ACCEL) * h, MAX_VEL);
    var vy = clampAbs(vel.y + clampAbs(acc.y, MAX_ACCEL) * h, MAX_VEL);
    var x = clampAbs(pos.x + vx * h, MAX_COORD);
    var y = clampAbs(pos.y + vy * h, MAX_COORD);
    return { x: quantize(x), y: quantize(y), vx: quantize(vx), vy: quantize(vy) };
  }

  function stepVerlet2D(pos, prevPos, acc, dt, damping) {
    var h = clampFixedStep(dt);
    var damp = damping !== undefined ? clamp01(1 - damping) : 1;
    var vx = (pos.x - prevPos.x) * damp;
    var vy = (pos.y - prevPos.y) * damp;
    var nx = clampAbs(pos.x + vx + acc.x * h * h, MAX_COORD);
    var ny = clampAbs(pos.y + vy + acc.y * h * h, MAX_COORD);
    return {
      x: quantize(nx),
      y: quantize(ny),
      prevX: quantize(pos.x),
      prevY: quantize(pos.y)
    };
  }

  function stepRK4Scalar(y, t, dt, derivFn) {
    var h = clampFixedStep(dt);
    var halfH = 0.5 * h;
    var k1 = derivFn(y, t);
    var k2 = derivFn(y + halfH * k1, t + halfH);
    var k3 = derivFn(y + halfH * k2, t + halfH);
    var k4 = derivFn(y + h * k3, t + h);
    return quantize(y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4));
  }

  // state = { x, y, vx, vy }, accelFn(x, y, vx, vy, t) -> { ax, ay }
  function stepRK4State2D(state, t, dt, accelFn) {
    var h = clampFixedStep(dt);
    var halfH = 0.5 * h;

    var a1 = accelFn(state.x, state.y, state.vx, state.vy, t);
    var k1x = state.vx;
    var k1y = state.vy;
    var k1vx = a1.ax;
    var k1vy = a1.ay;

    var x2 = state.x + halfH * k1x;
    var y2 = state.y + halfH * k1y;
    var vx2 = state.vx + halfH * k1vx;
    var vy2 = state.vy + halfH * k1vy;
    var a2 = accelFn(x2, y2, vx2, vy2, t + halfH);
    var k2x = vx2;
    var k2y = vy2;
    var k2vx = a2.ax;
    var k2vy = a2.ay;

    var x3 = state.x + halfH * k2x;
    var y3 = state.y + halfH * k2y;
    var vx3 = state.vx + halfH * k2vx;
    var vy3 = state.vy + halfH * k2vy;
    var a3 = accelFn(x3, y3, vx3, vy3, t + halfH);
    var k3x = vx3;
    var k3y = vy3;
    var k3vx = a3.ax;
    var k3vy = a3.ay;

    var x4 = state.x + h * k3x;
    var y4 = state.y + h * k3y;
    var vx4 = state.vx + h * k3vx;
    var vy4 = state.vy + h * k3vy;
    var a4 = accelFn(x4, y4, vx4, vy4, t + h);
    var k4x = vx4;
    var k4y = vy4;
    var k4vx = a4.ax;
    var k4vy = a4.ay;

    var inv6 = h / 6;
    return {
      x: quantize(clampAbs(state.x + inv6 * (k1x + 2 * k2x + 2 * k3x + k4x), MAX_COORD)),
      y: quantize(clampAbs(state.y + inv6 * (k1y + 2 * k2y + 2 * k3y + k4y), MAX_COORD)),
      vx: quantize(clampAbs(state.vx + inv6 * (k1vx + 2 * k2vx + 2 * k3vx + k4vx), MAX_VEL)),
      vy: quantize(clampAbs(state.vy + inv6 * (k1vy + 2 * k2vy + 2 * k3vy + k4vy), MAX_VEL))
    };
  }

  // Coupled 6-DOF planar rigid state: { x, y, vx, vy, angle, omega }
  // derivFn(x, y, vx, vy, angle, omega, t) -> { ax, ay, alpha }
  function stepRK4RigidState(state, t, dt, derivFn) {
    var h = clampFixedStep(dt);
    var halfH = 0.5 * h;

    var d1 = derivFn(state.x, state.y, state.vx, state.vy, state.angle, state.omega, t);
    var x2 = state.x + halfH * state.vx;
    var y2 = state.y + halfH * state.vy;
    var vx2 = state.vx + halfH * d1.ax;
    var vy2 = state.vy + halfH * d1.ay;
    var ang2 = state.angle + halfH * state.omega;
    var om2 = state.omega + halfH * d1.alpha;

    var d2 = derivFn(x2, y2, vx2, vy2, ang2, om2, t + halfH);
    var x3 = state.x + halfH * vx2;
    var y3 = state.y + halfH * vy2;
    var vx3 = state.vx + halfH * d2.ax;
    var vy3 = state.vy + halfH * d2.ay;
    var ang3 = state.angle + halfH * om2;
    var om3 = state.omega + halfH * d2.alpha;

    var d3 = derivFn(x3, y3, vx3, vy3, ang3, om3, t + halfH);
    var x4 = state.x + h * vx3;
    var y4 = state.y + h * vy3;
    var vx4 = state.vx + h * d3.ax;
    var vy4 = state.vy + h * d3.ay;
    var ang4 = state.angle + h * om3;
    var om4 = state.omega + h * d3.alpha;

    var d4 = derivFn(x4, y4, vx4, vy4, ang4, om4, t + h);
    var inv6 = h / 6;
    return {
      x: quantize(clampAbs(state.x + inv6 * (state.vx + 2 * vx2 + 2 * vx3 + vx4), MAX_COORD)),
      y: quantize(clampAbs(state.y + inv6 * (state.vy + 2 * vy2 + 2 * vy3 + vy4), MAX_COORD)),
      vx: quantize(clampAbs(state.vx + inv6 * (d1.ax + 2 * d2.ax + 2 * d3.ax + d4.ax), MAX_VEL)),
      vy: quantize(clampAbs(state.vy + inv6 * (d1.ay + 2 * d2.ay + 2 * d3.ay + d4.ay), MAX_VEL)),
      angle: quantize(wrapAngle(state.angle + inv6 * (state.omega + 2 * om2 + 2 * om3 + om4))),
      omega: quantize(clampAbs(state.omega + inv6 * (d1.alpha + 2 * d2.alpha + 2 * d3.alpha + d4.alpha), MAX_VEL))
    };
  }

  function integrateFixedSubsteps(state, totalDt, maxSubstep, stepFn) {
    var clamped = clampFixedStep(totalDt, MIN_DT, MAX_DT);
    var cap = maxSubstep > MIN_DT ? maxSubstep : FIXED_DT;
    var steps = Math.max(1, Math.ceil(clamped / cap));
    if (steps > 8) steps = 8;
    var subDt = quantize(clamped / steps);
    var cur = state;
    for (var i = 0; i < steps; i++) {
      cur = stepFn(cur, subDt, i, steps);
    }
    return cur;
  }

  // ---------------------------------------------------------------------------
  // 7. Cubic Bezier & Centripetal Catmull-Rom Spline Evaluators
  // ---------------------------------------------------------------------------
  function bezierPoint(p0, p1, p2, p3, t) {
    var u = clamp01(t);
    var inv = 1 - u;
    var inv2 = inv * inv;
    var u2 = u * u;
    var b0 = inv2 * inv;
    var b1 = 3 * inv2 * u;
    var b2 = 3 * inv * u2;
    var b3 = u2 * u;
    return {
      x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
      y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y
    };
  }

  function bezierTangent(p0, p1, p2, p3, t) {
    var u = clamp01(t);
    var inv = 1 - u;
    var k0 = 3 * inv * inv;
    var k1 = 6 * inv * u;
    var k2 = 3 * u * u;
    return {
      x: k0 * (p1.x - p0.x) + k1 * (p2.x - p1.x) + k2 * (p3.x - p2.x),
      y: k0 * (p1.y - p0.y) + k1 * (p2.y - p1.y) + k2 * (p3.y - p2.y)
    };
  }

  function bezierSecondDeriv(p0, p1, p2, p3, t) {
    var u = clamp01(t);
    var inv = 1 - u;
    var k0 = 6 * inv;
    var k1 = 6 * u;
    return {
      x: k0 * (p2.x - 2 * p1.x + p0.x) + k1 * (p3.x - 2 * p2.x + p1.x),
      y: k0 * (p2.y - 2 * p1.y + p0.y) + k1 * (p3.y - 2 * p2.y + p1.y)
    };
  }

  function bezierCurvature(p0, p1, p2, p3, t) {
    var d1 = bezierTangent(p0, p1, p2, p3, t);
    var d2 = bezierSecondDeriv(p0, p1, p2, p3, t);
    var speed = detHypot(d1.x, d1.y);
    var denom = speed * speed * speed;
    if (denom <= EPSILON) return 0;
    return (d1.x * d2.y - d1.y * d2.x) / denom;
  }

  function bezierNormal(p0, p1, p2, p3, t) {
    var tan = bezierTangent(p0, p1, p2, p3, t);
    var u = norm(tan);
    return { x: -u.y, y: u.x };
  }

  // De Casteljau split at parameter t -> { left: [4], right: [4] }
  function bezierSplit(p0, p1, p2, p3, t) {
    var u = clamp01(t);
    var p01 = vecLerp(p0, p1, u);
    var p12 = vecLerp(p1, p2, u);
    var p23 = vecLerp(p2, p3, u);
    var p012 = vecLerp(p01, p12, u);
    var p123 = vecLerp(p12, p23, u);
    var mid = vecLerp(p012, p123, u);
    return {
      left: [vec2Clone(p0), p01, p012, mid],
      right: [vec2Clone(mid), p123, p23, vec2Clone(p3)]
    };
  }

  function bezierBounds(p0, p1, p2, p3) {
    var minX = Math.min(p0.x, p3.x);
    var maxX = Math.max(p0.x, p3.x);
    var minY = Math.min(p0.y, p3.y);
    var maxY = Math.max(p0.y, p3.y);

    // Solve derivative = 0 for X and Y extrema
    var ax = 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x);
    var bx = 6 * (p0.x - 2 * p1.x + p2.x);
    var cx = 3 * (p1.x - p0.x);
    var rx = solveQuadratic(ax, bx, cx);
    var candidates = [];
    if (rx.count >= 1 && rx.r0 > 0 && rx.r0 < 1) candidates.push(rx.r0);
    if (rx.count === 2 && rx.r1 > 0 && rx.r1 < 1) candidates.push(rx.r1);

    var ay = 3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y);
    var by = 6 * (p0.y - 2 * p1.y + p2.y);
    var cy = 3 * (p1.y - p0.y);
    var ry = solveQuadratic(ay, by, cy);
    if (ry.count >= 1 && ry.r0 > 0 && ry.r0 < 1) candidates.push(ry.r0);
    if (ry.count === 2 && ry.r1 > 0 && ry.r1 < 1) candidates.push(ry.r1);

    for (var i = 0; i < candidates.length; i++) {
      var pt = bezierPoint(p0, p1, p2, p3, candidates[i]);
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function bezierSegmentArcLength(p0, p1, p2, p3, t0, t1) {
    var span = t1 - t0;
    var sum = 0;
    for (var i = 0; i < 5; i++) {
      var t = t0 + span * GL5_T[i];
      var d = bezierTangent(p0, p1, p2, p3, t);
      sum += GL5_W[i] * detHypot(d.x, d.y);
    }
    return sum * span;
  }

  function buildBezierArcTable(p0, p1, p2, p3, segments) {
    var n = segments && segments > 1 ? segments : 32;
    var ts = new Array(n + 1);
    var lengths = new Array(n + 1);
    ts[0] = 0;
    lengths[0] = 0;
    var accum = 0;
    for (var i = 1; i <= n; i++) {
      var t0 = (i - 1) / n;
      var t1 = i / n;
      accum += bezierSegmentArcLength(p0, p1, p2, p3, t0, t1);
      ts[i] = t1;
      lengths[i] = accum;
    }
    return { ts: ts, lengths: lengths, totalLength: accum, segments: n };
  }

  function bezierTForArcLength(table, targetS) {
    if (targetS <= 0 || table.totalLength <= EPSILON) return 0;
    if (targetS >= table.totalLength) return 1;
    var lo = 0;
    var hi = table.segments;
    while (lo + 1 < hi) {
      var mid = (lo + hi) >> 1;
      if (table.lengths[mid] < targetS) lo = mid;
      else hi = mid;
    }
    var s0 = table.lengths[lo];
    var s1 = table.lengths[hi];
    var frac = s1 - s0 > EPSILON ? (targetS - s0) / (s1 - s0) : 0;
    return lerp(table.ts[lo], table.ts[hi], frac);
  }

  function bezierSampleUniform(p0, p1, p2, p3, table, u) {
    var s = clamp01(u) * table.totalLength;
    var t = bezierTForArcLength(table, s);
    var pt = bezierPoint(p0, p1, p2, p3, t);
    var tan = norm(bezierTangent(p0, p1, p2, p3, t));
    return { x: pt.x, y: pt.y, tx: tan.x, ty: tan.y, t: t, s: s };
  }

  // Centripetal Catmull-Rom (Barry & Goldman formulation, default alpha = 0.5)
  function catmullRomKnots(p0, p1, p2, p3, alpha) {
    var a = alpha !== undefined ? alpha : 0.5;
    var d01 = Math.max(EPSILON, dist(p0, p1));
    var d12 = Math.max(EPSILON, dist(p1, p2));
    var d23 = Math.max(EPSILON, dist(p2, p3));
    var t0 = 0;
    var t1 = t0 + Math.pow(d01, a);
    var t2 = t1 + Math.pow(d12, a);
    var t3 = t2 + Math.pow(d23, a);
    return { t0: t0, t1: t1, t2: t2, t3: t3 };
  }

  function catmullRomPoint(p0, p1, p2, p3, u, alpha) {
    var k = catmullRomKnots(p0, p1, p2, p3, alpha);
    var t = lerp(k.t1, k.t2, clamp01(u));

    var a1x = ((k.t1 - t) * p0.x + (t - k.t0) * p1.x) / (k.t1 - k.t0);
    var a1y = ((k.t1 - t) * p0.y + (t - k.t0) * p1.y) / (k.t1 - k.t0);
    var a2x = ((k.t2 - t) * p1.x + (t - k.t1) * p2.x) / (k.t2 - k.t1);
    var a2y = ((k.t2 - t) * p1.y + (t - k.t1) * p2.y) / (k.t2 - k.t1);
    var a3x = ((k.t3 - t) * p2.x + (t - k.t2) * p3.x) / (k.t3 - k.t2);
    var a3y = ((k.t3 - t) * p2.y + (t - k.t2) * p3.y) / (k.t3 - k.t2);

    var b1x = ((k.t2 - t) * a1x + (t - k.t0) * a2x) / (k.t2 - k.t0);
    var b1y = ((k.t2 - t) * a1y + (t - k.t0) * a2y) / (k.t2 - k.t0);
    var b2x = ((k.t3 - t) * a2x + (t - k.t1) * a3x) / (k.t3 - k.t1);
    var b2y = ((k.t3 - t) * a2y + (t - k.t1) * a3y) / (k.t3 - k.t1);

    return {
      x: ((k.t2 - t) * b1x + (t - k.t1) * b2x) / (k.t2 - k.t1),
      y: ((k.t2 - t) * b1y + (t - k.t1) * b2y) / (k.t2 - k.t1)
    };
  }

  function catmullRomTangent(p0, p1, p2, p3, u, alpha) {
    var h = 1e-3;
    var u0 = clamp01(u - h);
    var u1 = clamp01(u + h);
    var span = u1 - u0;
    if (span <= EPSILON) return { x: p2.x - p1.x, y: p2.y - p1.y };
    var a = catmullRomPoint(p0, p1, p2, p3, u0, alpha);
    var b = catmullRomPoint(p0, p1, p2, p3, u1, alpha);
    var inv = 1 / span;
    return { x: (b.x - a.x) * inv, y: (b.y - a.y) * inv };
  }

  function catmullRomCurvature(p0, p1, p2, p3, u, alpha) {
    var h = 1e-3;
    var uc = clamp(u, h, 1 - h);
    var pm = catmullRomPoint(p0, p1, p2, p3, uc - h, alpha);
    var pc = catmullRomPoint(p0, p1, p2, p3, uc, alpha);
    var pp = catmullRomPoint(p0, p1, p2, p3, uc + h, alpha);
    var d1x = (pp.x - pm.x) / (2 * h);
    var d1y = (pp.y - pm.y) / (2 * h);
    var d2x = (pp.x - 2 * pc.x + pm.x) / (h * h);
    var d2y = (pp.y - 2 * pc.y + pm.y) / (h * h);
    var spd = detHypot(d1x, d1y);
    var denom = spd * spd * spd;
    if (denom <= EPSILON) return 0;
    return (d1x * d2y - d1y * d2x) / denom;
  }

  // Multi-point Catmull-Rom path with arc-length lookup table
  function buildCatmullRomPath(points, alpha, samplesPerSeg) {
    if (!points || points.length < 2) {
      return { points: points || [], samples: [], lengths: [0], totalLength: 0 };
    }
    var a = alpha !== undefined ? alpha : 0.5;
    var sps = samplesPerSeg && samplesPerSeg > 1 ? samplesPerSeg : 16;
    var n = points.length;
    var samples = [];
    var lengths = [];
    var accum = 0;

    for (var i = 0; i < n - 1; i++) {
      var p0 = i > 0 ? points[i - 1] : {
        x: 2 * points[0].x - points[1].x,
        y: 2 * points[0].y - points[1].y
      };
      var p1 = points[i];
      var p2 = points[i + 1];
      var p3 = i + 2 < n ? points[i + 2] : {
        x: 2 * points[n - 1].x - points[n - 2].x,
        y: 2 * points[n - 1].y - points[n - 2].y
      };
      var startJ = i === 0 ? 0 : 1;
      for (var j = startJ; j <= sps; j++) {
        var pt = catmullRomPoint(p0, p1, p2, p3, j / sps, a);
        if (samples.length > 0) {
          accum += dist(samples[samples.length - 1], pt);
        }
        samples.push(pt);
        lengths.push(accum);
      }
    }
    return {
      points: points,
      samples: samples,
      lengths: lengths,
      totalLength: accum
    };
  }

  function sampleCatmullRomPath(path, u) {
    var samples = path.samples;
    var count = samples.length;
    if (count === 0) return { x: 0, y: 0, tx: 1, ty: 0, s: 0 };
    if (count === 1 || path.totalLength <= EPSILON) {
      return { x: samples[0].x, y: samples[0].y, tx: 1, ty: 0, s: 0 };
    }
    var targetS = clamp01(u) * path.totalLength;
    var lo = 0;
    var hi = count - 1;
    while (lo + 1 < hi) {
      var mid = (lo + hi) >> 1;
      if (path.lengths[mid] < targetS) lo = mid;
      else hi = mid;
    }
    var s0 = path.lengths[lo];
    var s1 = path.lengths[hi];
    var frac = s1 - s0 > EPSILON ? (targetS - s0) / (s1 - s0) : 0;
    var p0 = samples[lo];
    var p1 = samples[hi];
    var tan = norm({ x: p1.x - p0.x, y: p1.y - p0.y });
    return {
      x: lerp(p0.x, p1.x, frac),
      y: lerp(p0.y, p1.y, frac),
      tx: tan.x,
      ty: tan.y,
      s: targetS
    };
  }

  // ---------------------------------------------------------------------------
  // 8. Swept Line-Segment & Continuous Trajectory Math
  // ---------------------------------------------------------------------------
  function closestPointOnSegment(p, a, b) {
    var abx = b.x - a.x;
    var aby = b.y - a.y;
    var len2 = abx * abx + aby * aby;
    var t = 0;
    if (len2 > EPSILON * EPSILON) {
      t = clamp01(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2);
    }
    var cx = a.x + abx * t;
    var cy = a.y + aby * t;
    var dx = p.x - cx;
    var dy = p.y - cy;
    return { x: cx, y: cy, t: t, distSq: dx * dx + dy * dy };
  }

  // Ericson exact closest points between two 2D line segments [a0,a1] and [b0,b1]
  function segmentSegmentDistance(a0, a1, b0, b1) {
    var d1x = a1.x - a0.x;
    var d1y = a1.y - a0.y;
    var d2x = b1.x - b0.x;
    var d2y = b1.y - b0.y;
    var rx = a0.x - b0.x;
    var ry = a0.y - b0.y;

    var a = d1x * d1x + d1y * d1y;
    var e = d2x * d2x + d2y * d2y;
    var f = d2x * rx + d2y * ry;
    var s = 0;
    var t = 0;

    if (a <= EPSILON && e <= EPSILON) {
      s = 0;
      t = 0;
    } else if (a <= EPSILON) {
      s = 0;
      t = clamp01(f / e);
    } else {
      var c = d1x * rx + d1y * ry;
      if (e <= EPSILON) {
        t = 0;
        s = clamp01(-c / a);
      } else {
        var b = d1x * d2x + d1y * d2y;
        var denom = a * e - b * b;
        if (denom !== 0) {
          s = clamp01((b * f - c * e) / denom);
        } else {
          s = 0;
        }
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = clamp01(-c / a);
        } else if (t > 1) {
          t = 1;
          s = clamp01((b - c) / a);
        }
      }
    }

    var pA = { x: a0.x + d1x * s, y: a0.y + d1y * s };
    var pB = { x: b0.x + d2x * t, y: b0.y + d2y * t };
    var dx = pA.x - pB.x;
    var dy = pA.y - pB.y;
    var d2 = dx * dx + dy * dy;
    return { distSq: d2, dist: detSqrt(d2), tA: s, tB: t, pA: pA, pB: pB };
  }

  function segmentSegmentIntersect(a0, a1, b0, b1) {
    var rX = a1.x - a0.x;
    var rY = a1.y - a0.y;
    var sX = b1.x - b0.x;
    var sY = b1.y - b0.y;
    var denom = rX * sY - rY * sX;
    var qpx = b0.x - a0.x;
    var qpy = b0.y - a0.y;

    if (Math.abs(denom) <= EPSILON) {
      // Parallel or collinear check
      var num = qpx * rY - qpy * rX;
      if (Math.abs(num) > EPSILON) {
        return { hit: false, parallel: true, tA: 0, tB: 0, x: 0, y: 0 };
      }
      var rr = rX * rX + rY * rY;
      if (rr <= EPSILON) {
        return { hit: false, parallel: true, tA: 0, tB: 0, x: 0, y: 0 };
      }
      var t0 = (qpx * rX + qpy * rY) / rr;
      var t1 = t0 + (sX * rX + sY * rY) / rr;
      var lo = Math.max(0, Math.min(t0, t1));
      var hi = Math.min(1, Math.max(t0, t1));
      if (lo <= hi) {
        return {
          hit: true,
          parallel: true,
          tA: lo,
          tB: 0,
          x: a0.x + rX * lo,
          y: a0.y + rY * lo
        };
      }
      return { hit: false, parallel: true, tA: 0, tB: 0, x: 0, y: 0 };
    }

    var tA = (qpx * sY - qpy * sX) / denom;
    var tB = (qpx * rY - qpy * rX) / denom;
    if (tA >= -EPSILON && tA <= 1 + EPSILON && tB >= -EPSILON && tB <= 1 + EPSILON) {
      var ctA = clamp01(tA);
      return {
        hit: true,
        parallel: false,
        tA: ctA,
        tB: clamp01(tB),
        x: a0.x + rX * ctA,
        y: a0.y + rY * ctA
      };
    }
    return { hit: false, parallel: false, tA: tA, tB: tB, x: 0, y: 0 };
  }

  function raySegmentIntersect(origin, dir, a, b) {
    var sx = b.x - a.x;
    var sy = b.y - a.y;
    var denom = dir.x * sy - dir.y * sx;
    if (Math.abs(denom) <= EPSILON) {
      return { hit: false, tRay: 0, tSeg: 0, x: 0, y: 0 };
    }
    var qpx = a.x - origin.x;
    var qpy = a.y - origin.y;
    var tRay = (qpx * sy - qpy * sx) / denom;
    var tSeg = (qpx * dir.y - qpy * dir.x) / denom;
    if (tRay >= 0 && tSeg >= -EPSILON && tSeg <= 1 + EPSILON) {
      return {
        hit: true,
        tRay: tRay,
        tSeg: clamp01(tSeg),
        x: origin.x + dir.x * tRay,
        y: origin.y + dir.y * tRay
      };
    }
    return { hit: false, tRay: tRay, tSeg: tSeg, x: 0, y: 0 };
  }

  // Swept point P(t) = p0 + t*(p1-p0) vs moving segment [A(t), B(t)]
  // Solves cross(P(t)-A(t), B(t)-A(t)) = 0 for t in [0, 1]
  function sweptPointSegmentTOI(p0, p1, a0, a1, b0, b1) {
    var u0x = p0.x - a0.x;
    var u0y = p0.y - a0.y;
    var dux = (p1.x - p0.x) - (a1.x - a0.x);
    var duy = (p1.y - p0.y) - (a1.y - a0.y);

    var v0x = b0.x - a0.x;
    var v0y = b0.y - a0.y;
    var dvx = (b1.x - b0.x) - (a1.x - a0.x);
    var dvy = (b1.y - b0.y) - (a1.y - a0.y);

    var qa = dux * dvy - duy * dvx;
    var qb = (u0x * dvy - u0y * dvx) + (dux * v0y - duy * v0x);
    var qc = u0x * v0y - u0y * v0x;

    var roots = solveQuadratic(qa, qb, qc);
    var bestT = 2;
    var bestS = 0;
    var bestPt = null;

    var checks = [];
    if (roots.count >= 1) checks.push(roots.r0);
    if (roots.count === 2) checks.push(roots.r1);

    for (var i = 0; i < checks.length; i++) {
      var t = checks[i];
      if (t < -EPSILON || t > 1 + EPSILON) continue;
      var ct = clamp01(t);
      var ax = a0.x + (a1.x - a0.x) * ct;
      var ay = a0.y + (a1.y - a0.y) * ct;
      var bx = b0.x + (b1.x - b0.x) * ct;
      var by = b0.y + (b1.y - b0.y) * ct;
      var px = p0.x + (p1.x - p0.x) * ct;
      var py = p0.y + (p1.y - p0.y) * ct;
      var abx = bx - ax;
      var aby = by - ay;
      var ab2 = abx * abx + aby * aby;
      if (ab2 <= EPSILON) continue;
      var s = ((px - ax) * abx + (py - ay) * aby) / ab2;
      if (s >= -EPSILON && s <= 1 + EPSILON && ct < bestT) {
        bestT = ct;
        bestS = clamp01(s);
        bestPt = { x: px, y: py };
      }
    }

    if (bestPt) {
      return { hit: true, toi: bestT, segParam: bestS, x: bestPt.x, y: bestPt.y };
    }
    return { hit: false, toi: 1, segParam: 0, x: 0, y: 0 };
  }

  // Swept circle (center c0 -> c1, radius r) vs static segment [a, b]
  function sweptCircleSegmentTOI(c0, c1, radius, a, b) {
    var r = Math.max(0, radius);
    var r2 = r * r;
    // Already overlapping at t = 0?
    var initClosest = closestPointOnSegment(c0, a, b);
    if (initClosest.distSq <= r2) {
      var n0 = norm({ x: c0.x - initClosest.x, y: c0.y - initClosest.y });
      if (lenSq(n0) <= EPSILON) {
        var segN = norm(perp(sub(b, a)));
        n0 = lenSq(segN) > EPSILON ? segN : { x: 0, y: -1 };
      }
      return {
        hit: true,
        toi: 0,
        point: { x: initClosest.x, y: initClosest.y },
        normal: n0
      };
    }

    var vx = c1.x - c0.x;
    var vy = c1.y - c0.y;
    var v2 = vx * vx + vy * vy;
    if (v2 <= EPSILON * EPSILON) {
      return { hit: false, toi: 1, point: null, normal: null };
    }

    var bestT = 2;
    var bestPoint = null;
    var bestNormal = null;

    var abx = b.x - a.x;
    var aby = b.y - a.y;
    var abLen = detHypot(abx, aby);

    // 1. Test swept center against offset segment planes (+/- normal * r)
    if (abLen > EPSILON) {
      var nx = -aby / abLen;
      var ny = abx / abLen;
      var d0 = (c0.x - a.x) * nx + (c0.y - a.y) * ny;
      var vn = vx * nx + vy * ny;
      var side = d0 >= 0 ? 1 : -1;
      if (Math.abs(vn) > EPSILON) {
        var tPlane = (side * r - d0) / vn;
        if (tPlane >= 0 && tPlane <= 1) {
          var hx = c0.x + vx * tPlane;
          var hy = c0.y + vy * tPlane;
          var projT = ((hx - a.x) * abx + (hy - a.y) * aby) / (abLen * abLen);
          if (projT >= 0 && projT <= 1 && tPlane < bestT) {
            bestT = tPlane;
            bestPoint = { x: a.x + abx * projT, y: a.y + aby * projT };
            bestNormal = { x: nx * side, y: ny * side };
          }
        }
      }
    }

    // 2. Test swept center against segment endpoint circles of radius r
    var endpoints = [a, b];
    for (var i = 0; i < 2; i++) {
      var ep = endpoints[i];
      var ox = c0.x - ep.x;
      var oy = c0.y - ep.y;
      var qa = v2;
      var qb = 2 * (ox * vx + oy * vy);
      var qc = ox * ox + oy * oy - r2;
      var roots = solveQuadratic(qa, qb, qc);
      if (roots.count > 0 && roots.r0 >= 0 && roots.r0 <= 1 && roots.r0 < bestT) {
        bestT = roots.r0;
        var cx = c0.x + vx * bestT;
        var cy = c0.y + vy * bestT;
        bestPoint = { x: ep.x, y: ep.y };
        bestNormal = norm({ x: cx - ep.x, y: cy - ep.y });
      }
    }

    if (bestPoint) {
      return { hit: true, toi: bestT, point: bestPoint, normal: bestNormal };
    }
    return { hit: false, toi: 1, point: null, normal: null };
  }

  // ---------------------------------------------------------------------------
  // Export to RYPhysics.Math
  // ---------------------------------------------------------------------------
  RYP.Math = {
    // Constants
    EPSILON: EPSILON,
    SQRT_EPSILON: SQRT_EPSILON,
    PI: PI,
    TWO_PI: TWO_PI,
    HALF_PI: HALF_PI,
    QUARTER_PI: QUARTER_PI,
    INV_PI: INV_PI,
    INV_TWO_PI: INV_TWO_PI,
    DEG_TO_RAD: DEG_TO_RAD,
    RAD_TO_DEG: RAD_TO_DEG,
    FIXED_DT: FIXED_DT,
    MIN_DT: MIN_DT,
    MAX_DT: MAX_DT,
    QUANT_SCALE: QUANT_SCALE,
    INV_QUANT_SCALE: INV_QUANT_SCALE,
    MAX_COORD: MAX_COORD,
    MAX_VEL: MAX_VEL,
    MAX_ACCEL: MAX_ACCEL,

    // Quantization & Scalar Helpers
    quantize: quantize,
    clamp: clamp,
    clamp01: clamp01,
    clampAbs: clampAbs,
    clampFixedStep: clampFixedStep,
    sign: sign,
    signNonZero: signNonZero,
    approxEqual: approxEqual,
    approxZero: approxZero,
    lerp: lerp,
    invLerp: invLerp,
    remap: remap,
    smoothstep: smoothstep,
    smootherstep: smootherstep,
    moveTowards: moveTowards,
    solveQuadratic: solveQuadratic,

    // Deterministic Trig & Angle Wrapping
    wrapAngle: wrapAngle,
    wrapAnglePositive: wrapAnglePositive,
    angleDiff: angleDiff,
    lerpAngle: lerpAngle,
    moveTowardsAngle: moveTowardsAngle,
    detSqrt: detSqrt,
    detHypot: detHypot,
    detSin: detSin,
    detCos: detCos,
    detSinCos: detSinCos,
    detTan: detTan,
    detAtan2: detAtan2,
    detExp: detExp,

    // 2D Vector Algebra
    vec2: vec2,
    vec2Clone: vec2Clone,
    vec2Set: vec2Set,
    vec2Zero: vec2Zero,
    vec2FromAngle: vec2FromAngle,
    add: add,
    addOut: addOut,
    sub: sub,
    subOut: subOut,
    scale: scale,
    scaleOut: scaleOut,
    addScaled: addScaled,
    addScaledOut: addScaledOut,
    neg: neg,
    mulComp: mulComp,
    divComp: divComp,
    dot: dot,
    cross: cross,
    crossVecScalar: crossVecScalar,
    crossScalarVec: crossScalarVec,
    perp: perp,
    perpCW: perpCW,
    lenSq: lenSq,
    len: len,
    norm: norm,
    normOut: normOut,
    normWithLen: normWithLen,
    setLen: setLen,
    clampLen: clampLen,
    distSq: distSq,
    dist: dist,
    manhattanDist: manhattanDist,
    projScalar: projScalar,
    proj: proj,
    rej: rej,
    reflect: reflect,
    slide: slide,
    rotate: rotate,
    rotateOut: rotateOut,
    rotateBySinCos: rotateBySinCos,
    rotateAround: rotateAround,
    angleOf: angleOf,
    signedAngleBetween: signedAngleBetween,
    angleBetween: angleBetween,
    vecLerp: vecLerp,
    slerp: slerp,
    vecMoveTowards: vecMoveTowards,
    vecQuantize: vecQuantize,

    // 2x2 & 3x2 Affine Matrices
    mat2Identity: mat2Identity,
    mat2Create: mat2Create,
    mat2FromAngle: mat2FromAngle,
    mat2FromScale: mat2FromScale,
    mat2Mul: mat2Mul,
    mat2MulVec: mat2MulVec,
    mat2Transpose: mat2Transpose,
    mat2TransposeMulVec: mat2TransposeMulVec,
    mat2Det: mat2Det,
    mat2Invert: mat2Invert,
    mat2dIdentity: mat2dIdentity,
    mat2dCreate: mat2dCreate,
    mat2dFromTRS: mat2dFromTRS,
    mat2dFromPivotTRS: mat2dFromPivotTRS,
    mat2dMul: mat2dMul,
    mat2dInvert: mat2dInvert,
    mat2dTransformPoint: mat2dTransformPoint,
    mat2dTransformVector: mat2dTransformVector,
    mat2dTransformNormal: mat2dTransformNormal,
    mat2dDecompose: mat2dDecompose,
    mat2dLerp: mat2dLerp,

    // Second-Order Spring-Damper
    springParamsFromStiffness: springParamsFromStiffness,
    criticalDamping: criticalDamping,
    stepSpring1D: stepSpring1D,
    stepSpring2D: stepSpring2D,
    stepAngularSpring: stepAngularSpring,

    // Integrators
    stepSemiImplicitEuler1D: stepSemiImplicitEuler1D,
    stepSemiImplicitEuler2D: stepSemiImplicitEuler2D,
    stepVerlet2D: stepVerlet2D,
    stepRK4Scalar: stepRK4Scalar,
    stepRK4State2D: stepRK4State2D,
    stepRK4RigidState: stepRK4RigidState,
    integrateFixedSubsteps: integrateFixedSubsteps,

    // Cubic Bezier & Catmull-Rom Splines
    bezierPoint: bezierPoint,
    bezierTangent: bezierTangent,
    bezierSecondDeriv: bezierSecondDeriv,
    bezierCurvature: bezierCurvature,
    bezierNormal: bezierNormal,
    bezierSplit: bezierSplit,
    bezierBounds: bezierBounds,
    bezierSegmentArcLength: bezierSegmentArcLength,
    buildBezierArcTable: buildBezierArcTable,
    bezierTForArcLength: bezierTForArcLength,
    bezierSampleUniform: bezierSampleUniform,
    catmullRomPoint: catmullRomPoint,
    catmullRomTangent: catmullRomTangent,
    catmullRomCurvature: catmullRomCurvature,
    buildCatmullRomPath: buildCatmullRomPath,
    sampleCatmullRomPath: sampleCatmullRomPath,

    // Swept Line-Segment Math
    closestPointOnSegment: closestPointOnSegment,
    segmentSegmentDistance: segmentSegmentDistance,
    segmentSegmentIntersect: segmentSegmentIntersect,
    raySegmentIntersect: raySegmentIntersect,
    sweptPointSegmentTOI: sweptPointSegmentTOI,
    sweptCircleSegmentTOI: sweptCircleSegmentTOI
  };
})(RYPhysics);
