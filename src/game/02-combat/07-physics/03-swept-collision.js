// ======================= 03. 连续碰撞检测与空间哈希宽相 =======================
// Rollback-deterministic CCD & narrow-phase solvers (AABB, OBB SAT + clipping,
// Capsule-Capsule, Circle-Capsule, Swept Segment-OBB TOI, Swept Arc-Body),
// contact manifolds, Baumgarte stabilization, and 16-fighter spatial hash grid.

var RYPhysics = (typeof window !== 'undefined' ? (window.RYPhysics = window.RYPhysics || {}) : {});

(function (RYP) {
  'use strict';

  var M = RYP.Math;
  var RB = RYP.RigidBody;
  var EPS = M ? M.EPSILON : 1e-6;

  // Baumgarte stabilization defaults
  var DEFAULT_BAUMGARTE_BETA = 0.24;
  var DEFAULT_SLOP = 0.5;
  var DEFAULT_MAX_CORRECTION = 18;
  var DEFAULT_CELL_SIZE = 128;

  function q(v) {
    return M ? M.quantize(v) : (Math.round(v * 1e6) / 1e6 || 0);
  }

  // ---------------------------------------------------------------------------
  // 1. Collision Primitives & Bounding Volumes
  // ---------------------------------------------------------------------------
  function createAABB(minX, minY, maxX, maxY) {
    return {
      type: 'aabb',
      minX: Math.min(minX, maxX),
      minY: Math.min(minY, maxY),
      maxX: Math.max(minX, maxX),
      maxY: Math.max(minY, maxY)
    };
  }

  function aabbFromCenter(cx, cy, hx, hy) {
    var ex = Math.abs(hx);
    var ey = Math.abs(hy);
    return {
      type: 'aabb',
      minX: cx - ex,
      minY: cy - ey,
      maxX: cx + ex,
      maxY: cy + ey
    };
  }

  function aabbMerge(a, b) {
    return {
      type: 'aabb',
      minX: Math.min(a.minX, b.minX),
      minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX),
      maxY: Math.max(a.maxY, b.maxY)
    };
  }

  function aabbExpand(a, pad) {
    return {
      type: 'aabb',
      minX: a.minX - pad,
      minY: a.minY - pad,
      maxX: a.maxX + pad,
      maxY: a.maxY + pad
    };
  }

  function aabbOverlap(a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  }

  function aabbContainsPoint(a, p) {
    return p.x >= a.minX && p.x <= a.maxX && p.y >= a.minY && p.y <= a.maxY;
  }

  function aabbArea(a) {
    return Math.max(0, a.maxX - a.minX) * Math.max(0, a.maxY - a.minY);
  }

  function createCircle(cx, cy, radius) {
    return {
      type: 'circle',
      cx: cx || 0,
      cy: cy || 0,
      r: Math.max(0, radius || 0)
    };
  }

  function circleToAABB(c) {
    return createAABB(c.cx - c.r, c.cy - c.r, c.cx + c.r, c.cy + c.r);
  }

  function createCapsule(ax, ay, bx, by, radius) {
    return {
      type: 'capsule',
      ax: ax || 0,
      ay: ay || 0,
      bx: bx || 0,
      by: by || 0,
      r: Math.max(0, radius || 0)
    };
  }

  function capsuleToAABB(cap) {
    return createAABB(
      Math.min(cap.ax, cap.bx) - cap.r,
      Math.min(cap.ay, cap.by) - cap.r,
      Math.max(cap.ax, cap.bx) + cap.r,
      Math.max(cap.ay, cap.by) + cap.r
    );
  }

  // Build an upright or tilted fighter hurtbox capsule from a RigidBody
  function capsuleFromBody(body) {
    var r = Math.max(6, (body.width || 34) * 0.45);
    var h = Math.max(r * 2 + 4, body.height || 82);
    var c = M.detCos(body.angle || 0);
    var s = M.detSin(body.angle || 0);
    // Local spine from feet+r up to head-r (negative Y is up)
    var y0 = -r;
    var y1 = -(h - r);
    return createCapsule(
      q(body.x - y0 * s),
      q(body.y + y0 * c),
      q(body.x - y1 * s),
      q(body.y + y1 * c),
      q(r)
    );
  }

  function createOBB(cx, cy, hx, hy, angle) {
    var ang = angle || 0;
    var c = M.detCos(ang);
    var s = M.detSin(ang);
    return {
      type: 'obb',
      cx: cx || 0,
      cy: cy || 0,
      hx: Math.abs(hx || 0),
      hy: Math.abs(hy || 0),
      angle: ang,
      // Local X axis (ux, uy) and Local Y axis (vx, vy)
      ux: c,
      uy: s,
      vx: -s,
      vy: c
    };
  }

  function getOBBCorners(obb) {
    var exX = obb.ux * obb.hx;
    var exY = obb.uy * obb.hx;
    var eyX = obb.vx * obb.hy;
    var eyY = obb.vy * obb.hy;
    return [
      { x: obb.cx - exX - eyX, y: obb.cy - exY - eyY },
      { x: obb.cx + exX - eyX, y: obb.cy + exY - eyY },
      { x: obb.cx + exX + eyX, y: obb.cy + exY + eyY },
      { x: obb.cx - exX + eyX, y: obb.cy - exY + eyY }
    ];
  }

  function obbToAABB(obb) {
    var rx = Math.abs(obb.ux) * obb.hx + Math.abs(obb.vx) * obb.hy;
    var ry = Math.abs(obb.uy) * obb.hx + Math.abs(obb.vy) * obb.hy;
    return createAABB(obb.cx - rx, obb.cy - ry, obb.cx + rx, obb.cy + ry);
  }

  function closestPointOnOBB(p, obb) {
    var dx = p.x - obb.cx;
    var dy = p.y - obb.cy;
    var lx = M.clamp(dx * obb.ux + dy * obb.uy, -obb.hx, obb.hx);
    var ly = M.clamp(dx * obb.vx + dy * obb.vy, -obb.hy, obb.hy);
    return {
      x: obb.cx + obb.ux * lx + obb.vx * ly,
      y: obb.cy + obb.uy * lx + obb.vy * ly,
      localX: lx,
      localY: ly
    };
  }

  function shapeToAABB(shape) {
    if (!shape) return createAABB(0, 0, 0, 0);
    if (shape.type === 'aabb') return shape;
    if (shape.type === 'circle') return circleToAABB(shape);
    if (shape.type === 'capsule') return capsuleToAABB(shape);
    if (shape.type === 'obb') return obbToAABB(shape);
    return createAABB(0, 0, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // 2. Contact Manifold Builder & Relative Velocity Kinematics
  // ---------------------------------------------------------------------------
  function computeContactRelativeVelocity(point, normal, velOrBodyA, velOrBodyB) {
    var vAx = 0;
    var vAy = 0;
    var vBx = 0;
    var vBy = 0;

    if (velOrBodyA) {
      if (RB && velOrBodyA.invMass !== undefined) {
        var pva = RB.getPointVelocity(velOrBodyA, point.x, point.y);
        vAx = pva.x;
        vAy = pva.y;
      } else {
        vAx = velOrBodyA.vx !== undefined ? velOrBodyA.vx : (velOrBodyA.x || 0);
        vAy = velOrBodyA.vy !== undefined ? velOrBodyA.vy : (velOrBodyA.y || 0);
      }
    }
    if (velOrBodyB) {
      if (RB && velOrBodyB.invMass !== undefined) {
        var pvb = RB.getPointVelocity(velOrBodyB, point.x, point.y);
        vBx = pvb.x;
        vBy = pvb.y;
      } else {
        vBx = velOrBodyB.vx !== undefined ? velOrBodyB.vx : (velOrBodyB.x || 0);
        vBy = velOrBodyB.vy !== undefined ? velOrBodyB.vy : (velOrBodyB.y || 0);
      }
    }

    var rvx = vBx - vAx;
    var rvy = vBy - vAy;
    var tx = -normal.y;
    var ty = normal.x;
    return {
      rvx: q(rvx),
      rvy: q(rvy),
      relVn: q(rvx * normal.x + rvy * normal.y),
      relVt: q(rvx * tx + rvy * ty),
      tangent: { x: q(tx), y: q(ty) }
    };
  }

  function buildContactManifold(point, normal, depth, velOrBodyA, velOrBodyB, extraContacts, toi) {
    var n = M.norm(normal);
    if (M.lenSq(n) <= EPS) n = { x: 1, y: 0 };
    var pt = { x: q(point.x), y: q(point.y) };
    var kin = computeContactRelativeVelocity(pt, n, velOrBodyA, velOrBodyB);
    return {
      hit: true,
      point: pt,
      contacts: extraContacts && extraContacts.length ? extraContacts : [pt],
      normal: { x: q(n.x), y: q(n.y) },
      tangent: kin.tangent,
      depth: q(Math.max(0, depth)),
      relVn: kin.relVn,
      relVt: kin.relVt,
      toi: toi !== undefined ? q(toi) : 0
    };
  }

  function noHitManifold() {
    return {
      hit: false,
      point: null,
      contacts: [],
      normal: { x: 0, y: 0 },
      tangent: { x: 0, y: 0 },
      depth: 0,
      relVn: 0,
      relVt: 0,
      toi: 1
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Narrow-Phase Solvers: AABB, OBB (Full SAT + Face Clipping), Circle, Capsule
  // ---------------------------------------------------------------------------
  function collideAABBvsAABB(a, b, velA, velB) {
    var overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    if (overlapX < 0) return noHitManifold();
    var overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
    if (overlapY < 0) return noHitManifold();

    var aCx = 0.5 * (a.minX + a.maxX);
    var aCy = 0.5 * (a.minY + a.maxY);
    var bCx = 0.5 * (b.minX + b.maxX);
    var bCy = 0.5 * (b.minY + b.maxY);

    var normal;
    var depth;
    var contactX = 0.5 * (Math.max(a.minX, b.minX) + Math.min(a.maxX, b.maxX));
    var contactY = 0.5 * (Math.max(a.minY, b.minY) + Math.min(a.maxY, b.maxY));

    if (overlapX <= overlapY) {
      depth = overlapX;
      normal = bCx >= aCx ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      depth = overlapY;
      normal = bCy >= aCy ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }
    return buildContactManifold({ x: contactX, y: contactY }, normal, depth, velA, velB);
  }

  // Helper: clip segment [v0, v1] against half-space dot(n, p) <= offset
  function clipSegmentToLine(v0, v1, nx, ny, offset) {
    var out = [];
    var d0 = nx * v0.x + ny * v0.y - offset;
    var d1 = nx * v1.x + ny * v1.y - offset;
    if (d0 <= 0) out.push(v0);
    if (d1 <= 0) out.push(v1);
    if (d0 * d1 < 0) {
      var alpha = d0 / (d0 - d1);
      out.push({
        x: v0.x + alpha * (v1.x - v0.x),
        y: v0.y + alpha * (v1.y - v0.y)
      });
    }
    return out;
  }

  function projectOBBRadius(obb, ax, ay) {
    return obb.hx * Math.abs(obb.ux * ax + obb.uy * ay) +
           obb.hy * Math.abs(obb.vx * ax + obb.vy * ay);
  }

  // Find the incident face (2 vertices) on obb whose outward normal is most anti-parallel to refNormal
  function findIncidentFace(obb, refNx, refNy) {
    var corners = getOBBCorners(obb);
    // Face normals corresponding to edges (0-1: -v), (1-2: +u), (2-3: +v), (3-0: -u)
    var faceNormals = [
      { x: -obb.vx, y: -obb.vy, a: corners[0], b: corners[1] },
      { x:  obb.ux, y:  obb.uy, a: corners[1], b: corners[2] },
      { x:  obb.vx, y:  obb.vy, a: corners[2], b: corners[3] },
      { x: -obb.ux, y: -obb.uy, a: corners[3], b: corners[0] }
    ];
    var bestIdx = 0;
    var minDot = Infinity;
    for (var i = 0; i < 4; i++) {
      var d = faceNormals[i].x * refNx + faceNormals[i].y * refNy;
      if (d < minDot) {
        minDot = d;
        bestIdx = i;
      }
    }
    return [faceNormals[bestIdx].a, faceNormals[bestIdx].b];
  }

  // Full OBB vs OBB Separating Axis Theorem + Sutherland-Hodgman Contact Clipping
  function collideOBBvsOBB(obbA, obbB, velA, velB) {
    var dx = obbB.cx - obbA.cx;
    var dy = obbB.cy - obbA.cy;

    var axes = [
      { x: obbA.ux, y: obbA.uy, owner: 0, axisIdx: 0 },
      { x: obbA.vx, y: obbA.vy, owner: 0, axisIdx: 1 },
      { x: obbB.ux, y: obbB.uy, owner: 1, axisIdx: 0 },
      { x: obbB.vx, y: obbB.vy, owner: 1, axisIdx: 1 }
    ];

    var minPen = Infinity;
    var bestAxis = null;

    for (var i = 0; i < 4; i++) {
      var ax = axes[i].x;
      var ay = axes[i].y;
      var distProj = Math.abs(dx * ax + dy * ay);
      var rA = projectOBBRadius(obbA, ax, ay);
      var rB = projectOBBRadius(obbB, ax, ay);
      var pen = rA + rB - distProj;
      if (pen < 0) return noHitManifold();
      // Slight deterministic tie-break favoring owner A to prevent axis flicker
      var bias = axes[i].owner === 1 ? 1.002 : 1.0;
      if (pen * bias < minPen) {
        minPen = pen;
        bestAxis = axes[i];
      }
    }

    // Orient normal from A toward B
    var nx = bestAxis.x;
    var ny = bestAxis.y;
    if (dx * nx + dy * ny < 0) {
      nx = -nx;
      ny = -ny;
    }

    // Reference OBB owns the separating axis; Incident OBB provides the clipped edge
    var refOBB = bestAxis.owner === 0 ? obbA : obbB;
    var incOBB = bestAxis.owner === 0 ? obbB : obbA;
    var refNx = bestAxis.owner === 0 ? nx : -nx;
    var refNy = bestAxis.owner === 0 ? ny : -ny;

    // Side tangent along reference face
    var sideNx = -refNy;
    var sideNy = refNx;
    var refFrontExtent = bestAxis.axisIdx === 0 ? refOBB.hx : refOBB.hy;
    var refSideExtent = bestAxis.axisIdx === 0 ? refOBB.hy : refOBB.hx;

    var refFrontOffset = (refOBB.cx * refNx + refOBB.cy * refNy) + refFrontExtent;
    var refSideCenter = refOBB.cx * sideNx + refOBB.cy * sideNy;

    var incEdge = findIncidentFace(incOBB, refNx, refNy);
    var clipped = clipSegmentToLine(incEdge[0], incEdge[1], sideNx, sideNy, refSideCenter + refSideExtent);
    if (clipped.length < 2) {
      // Fallback to midpoint if degenerate
      var fallback = {
        x: 0.5 * (obbA.cx + obbB.cx),
        y: 0.5 * (obbA.cy + obbB.cy)
      };
      return buildContactManifold(fallback, { x: nx, y: ny }, minPen, velA, velB);
    }
    clipped = clipSegmentToLine(clipped[0], clipped[1], -sideNx, -sideNy, -(refSideCenter - refSideExtent));

    var contacts = [];
    var avgX = 0;
    var avgY = 0;
    for (var c = 0; c < clipped.length; c++) {
      var sep = (clipped[c].x * refNx + clipped[c].y * refNy) - refFrontOffset;
      if (sep <= EPS) {
        var pt = { x: q(clipped[c].x), y: q(clipped[c].y) };
        contacts.push(pt);
        avgX += pt.x;
        avgY += pt.y;
      }
    }

    var contactPt;
    if (contacts.length > 0) {
      contactPt = { x: avgX / contacts.length, y: avgY / contacts.length };
    } else {
      contactPt = { x: 0.5 * (obbA.cx + obbB.cx), y: 0.5 * (obbA.cy + obbB.cy) };
    }

    return buildContactManifold(contactPt, { x: nx, y: ny }, minPen, velA, velB, contacts);
  }

  function collideCirclevsCircle(cA, cB, velA, velB) {
    var dx = cB.cx - cA.cx;
    var dy = cB.cy - cA.cy;
    var rSum = cA.r + cB.r;
    var d2 = dx * dx + dy * dy;
    if (d2 > rSum * rSum) return noHitManifold();

    var d = M.detSqrt(d2);
    var nx = d > EPS ? dx / d : 1;
    var ny = d > EPS ? dy / d : 0;
    var depth = rSum - d;
    var pt = {
      x: cA.cx + nx * (cA.r - depth * 0.5),
      y: cA.cy + ny * (cA.r - depth * 0.5)
    };
    return buildContactManifold(pt, { x: nx, y: ny }, depth, velA, velB);
  }

  function collideCirclevsCapsule(circle, capsule, velA, velB) {
    var closest = M.closestPointOnSegment(
      { x: circle.cx, y: circle.cy },
      { x: capsule.ax, y: capsule.ay },
      { x: capsule.bx, y: capsule.by }
    );
    var dx = closest.x - circle.cx;
    var dy = closest.y - circle.cy;
    var rSum = circle.r + capsule.r;
    var d2 = dx * dx + dy * dy;
    if (d2 > rSum * rSum) return noHitManifold();

    var d = M.detSqrt(d2);
    var nx;
    var ny;
    if (d > EPS) {
      nx = dx / d;
      ny = dy / d;
    } else {
      var segPerp = M.norm(M.perp({ x: capsule.bx - capsule.ax, y: capsule.by - capsule.ay }));
      nx = M.lenSq(segPerp) > EPS ? segPerp.x : 1;
      ny = M.lenSq(segPerp) > EPS ? segPerp.y : 0;
    }
    var depth = rSum - d;
    var pt = {
      x: circle.cx + nx * (circle.r - depth * 0.5),
      y: circle.cy + ny * (circle.r - depth * 0.5)
    };
    return buildContactManifold(pt, { x: nx, y: ny }, depth, velA, velB);
  }

  function collideCapsulevsCapsule(capA, capB, velA, velB) {
    var segDist = M.segmentSegmentDistance(
      { x: capA.ax, y: capA.ay },
      { x: capA.bx, y: capA.by },
      { x: capB.ax, y: capB.ay },
      { x: capB.bx, y: capB.by }
    );
    var rSum = capA.r + capB.r;
    if (segDist.distSq > rSum * rSum) return noHitManifold();

    var dx = segDist.pB.x - segDist.pA.x;
    var dy = segDist.pB.y - segDist.pA.y;
    var d = segDist.dist;
    var nx;
    var ny;
    if (d > EPS) {
      nx = dx / d;
      ny = dy / d;
    } else {
      var caX = 0.5 * (capA.ax + capA.bx);
      var caY = 0.5 * (capA.ay + capA.by);
      var cbX = 0.5 * (capB.ax + capB.bx);
      var cbY = 0.5 * (capB.ay + capB.by);
      var fallbackN = M.norm({ x: cbX - caX, y: cbY - caY });
      nx = M.lenSq(fallbackN) > EPS ? fallbackN.x : 1;
      ny = M.lenSq(fallbackN) > EPS ? fallbackN.y : 0;
    }

    var depth = rSum - d;
    var pt = {
      x: segDist.pA.x + nx * (capA.r - depth * 0.5),
      y: segDist.pA.y + ny * (capA.r - depth * 0.5)
    };
    return buildContactManifold(pt, { x: nx, y: ny }, depth, velA, velB);
  }

  function collideCirclevsOBB(circle, obb, velA, velB) {
    var cp = closestPointOnOBB({ x: circle.cx, y: circle.cy }, obb);
    var dx = cp.x - circle.cx;
    var dy = cp.y - circle.cy;
    var d2 = dx * dx + dy * dy;
    if (d2 > circle.r * circle.r) return noHitManifold();

    var d = M.detSqrt(d2);
    var nx;
    var ny;
    var depth;
    if (d > EPS) {
      nx = dx / d;
      ny = dy / d;
      depth = circle.r - d;
    } else {
      // Circle center lies inside the OBB: push out along nearest OBB face
      var penX = obb.hx - Math.abs(cp.localX);
      var penY = obb.hy - Math.abs(cp.localY);
      if (penX <= penY) {
        var sx = cp.localX >= 0 ? -1 : 1;
        nx = obb.ux * sx;
        ny = obb.uy * sx;
        depth = penX + circle.r;
      } else {
        var sy = cp.localY >= 0 ? -1 : 1;
        nx = obb.vx * sy;
        ny = obb.vy * sy;
        depth = penY + circle.r;
      }
    }
    return buildContactManifold({ x: cp.x, y: cp.y }, { x: nx, y: ny }, depth, velA, velB);
  }

  function collideCapsulevsOBB(capsule, obb, velA, velB) {
    // Evaluate capsule spine endpoints + closest point of spine to OBB center & edges
    var a = { x: capsule.ax, y: capsule.ay };
    var b = { x: capsule.bx, y: capsule.by };
    var cCenter = M.closestPointOnSegment({ x: obb.cx, y: obb.cy }, a, b);
    var samples = [a, b, { x: cCenter.x, y: cCenter.y }];

    // Also include closest spine point to each OBB corner for sharp-corner hits
    var corners = getOBBCorners(obb);
    for (var i = 0; i < 4; i++) {
      var sc = M.closestPointOnSegment(corners[i], a, b);
      samples.push({ x: sc.x, y: sc.y });
    }

    var best = null;
    for (var s = 0; s < samples.length; s++) {
      var cand = collideCirclevsOBB(createCircle(samples[s].x, samples[s].y, capsule.r), obb, velA, velB);
      if (cand.hit && (!best || cand.depth > best.depth)) {
        best = cand;
      }
    }
    return best || noHitManifold();
  }

  // Generic narrow-phase dispatcher for any pair of supported shapes
  function collideShapes(shapeA, shapeB, velA, velB) {
    var tA = shapeA.type;
    var tB = shapeB.type;
    if (tA === 'aabb' && tB === 'aabb') return collideAABBvsAABB(shapeA, shapeB, velA, velB);
    if (tA === 'obb' && tB === 'obb') return collideOBBvsOBB(shapeA, shapeB, velA, velB);
    if (tA === 'circle' && tB === 'circle') return collideCirclevsCircle(shapeA, shapeB, velA, velB);
    if (tA === 'capsule' && tB === 'capsule') return collideCapsulevsCapsule(shapeA, shapeB, velA, velB);
    if (tA === 'circle' && tB === 'capsule') return collideCirclevsCapsule(shapeA, shapeB, velA, velB);
    if (tA === 'capsule' && tB === 'circle') {
      var invCC = collideCirclevsCapsule(shapeB, shapeA, velB, velA);
      if (!invCC.hit) return invCC;
      return buildContactManifold(invCC.point, { x: -invCC.normal.x, y: -invCC.normal.y }, invCC.depth, velA, velB, invCC.contacts);
    }
    if (tA === 'circle' && tB === 'obb') return collideCirclevsOBB(shapeA, shapeB, velA, velB);
    if (tA === 'obb' && tB === 'circle') {
      var invCO = collideCirclevsOBB(shapeB, shapeA, velB, velA);
      if (!invCO.hit) return invCO;
      return buildContactManifold(invCO.point, { x: -invCO.normal.x, y: -invCO.normal.y }, invCO.depth, velA, velB, invCO.contacts);
    }
    if (tA === 'capsule' && tB === 'obb') return collideCapsulevsOBB(shapeA, shapeB, velA, velB);
    if (tA === 'obb' && tB === 'capsule') {
      var invKO = collideCapsulevsOBB(shapeB, shapeA, velB, velA);
      if (!invKO.hit) return invKO;
      return buildContactManifold(invKO.point, { x: -invKO.normal.x, y: -invKO.normal.y }, invKO.depth, velA, velB, invKO.contacts);
    }
    // Convert AABB to OBB for mixed AABB queries
    if (tA === 'aabb') {
      var obbFromA = createOBB(0.5 * (shapeA.minX + shapeA.maxX), 0.5 * (shapeA.minY + shapeA.maxY), 0.5 * (shapeA.maxX - shapeA.minX), 0.5 * (shapeA.maxY - shapeA.minY), 0);
      return collideShapes(obbFromA, shapeB, velA, velB);
    }
    if (tB === 'aabb') {
      var obbFromB = createOBB(0.5 * (shapeB.minX + shapeB.maxX), 0.5 * (shapeB.minY + shapeB.maxY), 0.5 * (shapeB.maxX - shapeB.minX), 0.5 * (shapeB.maxY - shapeB.minY), 0);
      return collideShapes(shapeA, obbFromB, velA, velB);
    }
    return noHitManifold();
  }

  // ---------------------------------------------------------------------------
  // 4. Continuous Collision Detection (CCD): Swept AABB, Segment-OBB, Arc-Body
  // ---------------------------------------------------------------------------
  function sweptAABBvsAABB(a, velA, b, velB) {
    if (aabbOverlap(a, b)) {
      var staticHit = collideAABBvsAABB(a, b, velA, velB);
      staticHit.toi = 0;
      return staticHit;
    }
    var rvx = (velA ? velA.x : 0) - (velB ? velB.x : 0);
    var rvy = (velA ? velA.y : 0) - (velB ? velB.y : 0);

    var txEnter;
    var txExit;
    var tyEnter;
    var tyExit;

    if (Math.abs(rvx) <= EPS) {
      if (a.maxX < b.minX || a.minX > b.maxX) return noHitManifold();
      txEnter = -Infinity;
      txExit = Infinity;
    } else if (rvx > 0) {
      txEnter = (b.minX - a.maxX) / rvx;
      txExit = (b.maxX - a.minX) / rvx;
    } else {
      txEnter = (b.maxX - a.minX) / rvx;
      txExit = (b.minX - a.maxX) / rvx;
    }

    if (Math.abs(rvy) <= EPS) {
      if (a.maxY < b.minY || a.minY > b.maxY) return noHitManifold();
      tyEnter = -Infinity;
      tyExit = Infinity;
    } else if (rvy > 0) {
      tyEnter = (b.minY - a.maxY) / rvy;
      tyExit = (b.maxY - a.minY) / rvy;
    } else {
      tyEnter = (b.maxY - a.minY) / rvy;
      tyExit = (b.minY - a.maxY) / rvy;
    }

    var tEnter = Math.max(txEnter, tyEnter);
    var tExit = Math.min(txExit, tyExit);
    if (tEnter > tExit || tEnter < 0 || tEnter > 1) {
      return noHitManifold();
    }

    var normal = txEnter > tyEnter
      ? { x: rvx > 0 ? 1 : -1, y: 0 }
      : { x: 0, y: rvy > 0 ? 1 : -1 };
    var cx = 0.5 * (a.minX + a.maxX) + (velA ? velA.x * tEnter : 0);
    var cy = 0.5 * (a.minY + a.maxY) + (velA ? velA.y * tEnter : 0);
    return buildContactManifold({ x: cx, y: cy }, normal, 0, velA, velB, null, tEnter);
  }

  // Continuous Swept Segment [p0 -> p1] vs OBB (with optional OBB linear delta)
  // Returns { hit, toi, exitT, point, normal, insideStart }
  function sweptSegmentvsOBB(p0, p1, obb, obbDelta) {
    var relDx = (p1.x - p0.x) - (obbDelta ? obbDelta.x : 0);
    var relDy = (p1.y - p0.y) - (obbDelta ? obbDelta.y : 0);

    // Transform segment origin & relative direction into OBB local space
    var ox = p0.x - obb.cx;
    var oy = p0.y - obb.cy;
    var lx0 = ox * obb.ux + oy * obb.uy;
    var ly0 = ox * obb.vx + oy * obb.vy;
    var ldx = relDx * obb.ux + relDy * obb.uy;
    var ldy = relDx * obb.vx + relDy * obb.vy;

    var tMin = 0;
    var tMax = 1;
    var hitLocalNx = 0;
    var hitLocalNy = 0;

    // Slab test along local X axis [-hx, hx]
    if (Math.abs(ldx) <= EPS) {
      if (lx0 < -obb.hx || lx0 > obb.hx) {
        return { hit: false, toi: 1, exitT: 0, point: null, normal: null, insideStart: false };
      }
    } else {
      var invX = 1 / ldx;
      var t1 = (-obb.hx - lx0) * invX;
      var t2 = (obb.hx - lx0) * invX;
      var nx1 = -1;
      if (t1 > t2) {
        var tmpX = t1;
        t1 = t2;
        t2 = tmpX;
        nx1 = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitLocalNx = nx1;
        hitLocalNy = 0;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) {
        return { hit: false, toi: 1, exitT: 0, point: null, normal: null, insideStart: false };
      }
    }

    // Slab test along local Y axis [-hy, hy]
    if (Math.abs(ldy) <= EPS) {
      if (ly0 < -obb.hy || ly0 > obb.hy) {
        return { hit: false, toi: 1, exitT: 0, point: null, normal: null, insideStart: false };
      }
    } else {
      var invY = 1 / ldy;
      var ty1 = (-obb.hy - ly0) * invY;
      var ty2 = (obb.hy - ly0) * invY;
      var ny1 = -1;
      if (ty1 > ty2) {
        var tmpY = ty1;
        ty1 = ty2;
        ty2 = tmpY;
        ny1 = 1;
      }
      if (ty1 > tMin) {
        tMin = ty1;
        hitLocalNx = 0;
        hitLocalNy = ny1;
      }
      if (ty2 < tMax) tMax = ty2;
      if (tMin > tMax) {
        return { hit: false, toi: 1, exitT: 0, point: null, normal: null, insideStart: false };
      }
    }

    var insideStart = (Math.abs(lx0) <= obb.hx && Math.abs(ly0) <= obb.hy);
    if (insideStart) {
      // Point starts inside OBB: pick nearest face normal
      var penX = obb.hx - Math.abs(lx0);
      var penY = obb.hy - Math.abs(ly0);
      if (penX <= penY) {
        hitLocalNx = lx0 >= 0 ? 1 : -1;
        hitLocalNy = 0;
      } else {
        hitLocalNx = 0;
        hitLocalNy = ly0 >= 0 ? 1 : -1;
      }
    }

    var worldNx = obb.ux * hitLocalNx + obb.vx * hitLocalNy;
    var worldNy = obb.uy * hitLocalNx + obb.vy * hitLocalNy;
    var hitX = p0.x + (p1.x - p0.x) * tMin;
    var hitY = p0.y + (p1.y - p0.y) * tMin;

    return {
      hit: true,
      toi: q(M.clamp01(tMin)),
      exitT: q(M.clamp01(tMax)),
      point: { x: q(hitX), y: q(hitY) },
      normal: { x: q(worldNx), y: q(worldNy) },
      insideStart: insideStart
    };
  }

  // Swept Martial Arts Weapon Arc vs Fighter Body Shape (Capsule / Circle / OBB / AABB)
  // pivot: { x, y }, innerR..outerR: blade active segment, startAngle -> endAngle (radians)
  // bladeThickness: half-thickness radius of blade capsule
  function sweptArcvsBody(pivot, innerR, outerR, startAngle, endAngle, bladeThickness, bodyShape, substeps) {
    var rIn = Math.max(0, innerR || 0);
    var rOut = Math.max(rIn + 1, outerR || 48);
    var thick = Math.max(1, bladeThickness || 4);
    var sweep = endAngle - startAngle;

    // Broadphase radial rejection against target shape's AABB
    var targetBox = shapeToAABB(bodyShape);
    var arcBox = createAABB(
      pivot.x - rOut - thick,
      pivot.y - rOut - thick,
      pivot.x + rOut + thick,
      pivot.y + rOut + thick
    );
    if (!aabbOverlap(arcBox, targetBox)) {
      return { hit: false, toi: 1, hitAngle: startAngle, bladeFrac: 0, point: null, normal: null, depth: 0 };
    }

    // Adaptive step count based on arc length at blade tip so tip never tunnels > thick*1.5
    var tipArcLen = Math.abs(sweep) * rOut;
    var autoSteps = Math.max(4, Math.min(24, Math.ceil(tipArcLen / Math.max(6, thick * 1.8))));
    var steps = substeps && substeps > 0 ? Math.min(32, substeps) : autoSteps;

    var prevTip = null;
    for (var i = 0; i <= steps; i++) {
      var u = i / steps;
      var ang = startAngle + sweep * u;
      var c = M.detCos(ang);
      var s = M.detSin(ang);
      var hilt = { x: pivot.x + c * rIn, y: pivot.y + s * rIn };
      var tip = { x: pivot.x + c * rOut, y: pivot.y + s * rOut };

      // 1. Instantaneous blade capsule vs bodyShape test
      var bladeCap = createCapsule(hilt.x, hilt.y, tip.x, tip.y, thick);
      var hit = collideShapes(bladeCap, bodyShape);
      if (hit.hit) {
        var bladeDist = M.dist(pivot, hit.point);
        var frac = M.clamp01((bladeDist - rIn) / Math.max(EPS, rOut - rIn));
        // Tangent impact direction along swing
        var swingDir = sweep >= 0 ? 1 : -1;
        var tang = { x: -s * swingDir, y: c * swingDir };
        return {
          hit: true,
          toi: q(u),
          hitAngle: q(ang),
          bladeFrac: q(frac),
          point: hit.point,
          normal: hit.normal,
          swingTangent: { x: q(tang.x), y: q(tang.y) },
          depth: hit.depth
        };
      }

      // 2. Continuous chordal sweep of blade tip against OBB to prevent ultra-fast slash tunneling
      if (prevTip && bodyShape.type === 'obb') {
        var segHit = sweptSegmentvsOBB(prevTip, tip, bodyShape);
        if (segHit.hit) {
          var subU = ((i - 1) + segHit.toi) / steps;
          var subAng = startAngle + sweep * subU;
          var sc = M.detCos(subAng);
          var ss = M.detSin(subAng);
          var swDir = sweep >= 0 ? 1 : -1;
          return {
            hit: true,
            toi: q(subU),
            hitAngle: q(subAng),
            bladeFrac: 1,
            point: segHit.point,
            normal: segHit.normal,
            swingTangent: { x: q(-ss * swDir), y: q(sc * swDir) },
            depth: 0
          };
        }
      }
      prevTip = tip;
    }

    return { hit: false, toi: 1, hitAngle: endAngle, bladeFrac: 0, point: null, normal: null, depth: 0 };
  }

  // ---------------------------------------------------------------------------
  // 5. Baumgarte Positional Stabilization & Full Contact Resolution
  // ---------------------------------------------------------------------------
  function applyBaumgarteStabilization(bodyA, bodyB, manifold, dt, opts) {
    if (!manifold || !manifold.hit) return { corrX: 0, corrY: 0, magnitude: 0 };
    var invMa = bodyA.isStatic ? 0 : bodyA.invMass;
    var invMb = bodyB.isStatic ? 0 : bodyB.invMass;
    var totalInvM = invMa + invMb;
    if (totalInvM <= EPS) return { corrX: 0, corrY: 0, magnitude: 0 };

    var cfg = opts || {};
    var beta = cfg.beta !== undefined ? cfg.beta : DEFAULT_BAUMGARTE_BETA;
    var slop = cfg.slop !== undefined ? cfg.slop : DEFAULT_SLOP;
    var maxCorr = cfg.maxCorrection !== undefined ? cfg.maxCorrection : DEFAULT_MAX_CORRECTION;

    var excess = Math.max(0, manifold.depth - slop);
    if (excess <= EPS) return { corrX: 0, corrY: 0, magnitude: 0 };

    var corrMag = Math.min(maxCorr, (excess * beta) / totalInvM);
    var cx = manifold.normal.x * corrMag;
    var cy = manifold.normal.y * corrMag;

    if (!bodyA.isStatic) {
      bodyA.x = q(bodyA.x - cx * invMa);
      bodyA.y = q(bodyA.y - cy * invMa);
    }
    if (!bodyB.isStatic) {
      bodyB.x = q(bodyB.x + cx * invMb);
      bodyB.y = q(bodyB.y + cy * invMb);
    }
    return { corrX: q(cx), corrY: q(cy), magnitude: q(corrMag) };
  }

  function resolveContactManifold(bodyA, bodyB, manifold, dt, opts) {
    if (!manifold || !manifold.hit) {
      return { resolved: false, impulse: null, correction: null };
    }
    var cfg = opts || {};
    var impulseRes = null;
    if (RB && typeof RB.resolveLinearAngularCoupling === 'function') {
      impulseRes = RB.resolveLinearAngularCoupling(
        bodyA,
        bodyB,
        manifold.point,
        manifold.normal,
        cfg.restitution,
        cfg.muStatic,
        cfg.muKinetic
      );
    }
    var corrRes = applyBaumgarteStabilization(bodyA, bodyB, manifold, dt, cfg);
    return {
      resolved: true,
      impulse: impulseRes,
      correction: corrRes
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Multi-Body Spatial Hash Grid (16-Fighter 8v8 Broadphase Culling)
  // ---------------------------------------------------------------------------
  function createSpatialHashGrid(cellSize) {
    var size = cellSize && cellSize >= 16 ? cellSize : DEFAULT_CELL_SIZE;
    var invSize = 1 / size;
    var cells = Object.create(null);
    var items = Object.create(null);
    var itemList = [];

    function cellKey(cx, cy) {
      return cx + ',' + cy;
    }

    function clear() {
      cells = Object.create(null);
      items = Object.create(null);
      itemList.length = 0;
    }

    function insert(id, aabb, layerMask, userData) {
      var mask = layerMask !== undefined ? layerMask : 0xffffffff;
      var minCx = Math.floor(aabb.minX * invSize);
      var maxCx = Math.floor(aabb.maxX * invSize);
      var minCy = Math.floor(aabb.minY * invSize);
      var maxCy = Math.floor(aabb.maxY * invSize);

      var entry = {
        id: id,
        aabb: aabb,
        mask: mask,
        data: userData || null,
        minCx: minCx,
        maxCx: maxCx,
        minCy: minCy,
        maxCy: maxCy
      };
      items[id] = entry;
      itemList.push(entry);

      for (var cx = minCx; cx <= maxCx; cx++) {
        for (var cy = minCy; cy <= maxCy; cy++) {
          var key = cellKey(cx, cy);
          var bucket = cells[key];
          if (!bucket) {
            bucket = [];
            cells[key] = bucket;
          }
          bucket.push(entry);
        }
      }
      return entry;
    }

    function queryAABB(aabb, layerMask) {
      var mask = layerMask !== undefined ? layerMask : 0xffffffff;
      var minCx = Math.floor(aabb.minX * invSize);
      var maxCx = Math.floor(aabb.maxX * invSize);
      var minCy = Math.floor(aabb.minY * invSize);
      var maxCy = Math.floor(aabb.maxY * invSize);

      var seen = Object.create(null);
      var results = [];
      for (var cx = minCx; cx <= maxCx; cx++) {
        for (var cy = minCy; cy <= maxCy; cy++) {
          var bucket = cells[cellKey(cx, cy)];
          if (!bucket) continue;
          for (var i = 0; i < bucket.length; i++) {
            var e = bucket[i];
            if (seen[e.id]) continue;
            seen[e.id] = true;
            if ((e.mask & mask) !== 0 && aabbOverlap(aabb, e.aabb)) {
              results.push(e);
            }
          }
        }
      }
      // Deterministic sort by id for rollback safety
      results.sort(function (a, b) {
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
      });
      return results;
    }

    function queryRadius(cx, cy, radius, layerMask) {
      var r = Math.max(0, radius);
      var box = createAABB(cx - r, cy - r, cx + r, cy + r);
      return queryAABB(box, layerMask);
    }

    // Compute all unique overlapping broadphase candidate pairs in deterministic order
    function computeCandidatePairs(pairFilterFn) {
      var pairSeen = Object.create(null);
      var pairs = [];
      var n = itemList.length;

      for (var i = 0; i < n; i++) {
        var eA = itemList[i];
        for (var cx = eA.minCx; cx <= eA.maxCx; cx++) {
          for (var cy = eA.minCy; cy <= eA.maxCy; cy++) {
            var bucket = cells[cellKey(cx, cy)];
            if (!bucket) continue;
            for (var j = 0; j < bucket.length; j++) {
              var eB = bucket[j];
              if (eA.id >= eB.id) continue;
              var pKey = eA.id + ':' + eB.id;
              if (pairSeen[pKey]) continue;
              pairSeen[pKey] = true;

              if ((eA.mask & eB.mask) === 0) continue;
              if (!aabbOverlap(eA.aabb, eB.aabb)) continue;
              if (pairFilterFn && !pairFilterFn(eA, eB)) continue;
              pairs.push({ a: eA, b: eB });
            }
          }
        }
      }

      // Canonical sort by (a.id, b.id) so rollback replay always resolves in identical order
      pairs.sort(function (p1, p2) {
        if (p1.a.id !== p2.a.id) return p1.a.id < p2.a.id ? -1 : 1;
        return p1.b.id < p2.b.id ? -1 : (p1.b.id > p2.b.id ? 1 : 0);
      });
      return pairs;
    }

    function getStats() {
      var cellCount = 0;
      var maxOccupancy = 0;
      for (var k in cells) {
        cellCount++;
        if (cells[k].length > maxOccupancy) maxOccupancy = cells[k].length;
      }
      return {
        cellSize: size,
        itemCount: itemList.length,
        activeCells: cellCount,
        maxOccupancy: maxOccupancy
      };
    }

    return {
      cellSize: size,
      clear: clear,
      insert: insert,
      queryAABB: queryAABB,
      queryRadius: queryRadius,
      computeCandidatePairs: computeCandidatePairs,
      getStats: getStats
    };
  }

  // End-to-end broadphase + narrowphase + optional impulse/Baumgarte resolution
  // entries: [{ id, body, shape, mask }]
  function stepBroadphaseNarrowphase(entries, grid, dt, opts) {
    var cfg = opts || {};
    var g = grid || createSpatialHashGrid(cfg.cellSize || DEFAULT_CELL_SIZE);
    g.clear();

    for (var i = 0; i < entries.length; i++) {
      var ent = entries[i];
      if (!ent || !ent.shape) continue;
      var aabb = shapeToAABB(ent.shape);
      g.insert(ent.id, aabb, ent.mask !== undefined ? ent.mask : 0xffffffff, ent);
    }

    var pairs = g.computeCandidatePairs(cfg.pairFilter);
    var manifolds = [];
    var resolve = cfg.resolve !== false;

    for (var p = 0; p < pairs.length; p++) {
      var entA = pairs[p].a.data;
      var entB = pairs[p].b.data;
      var m = collideShapes(entA.shape, entB.shape, entA.body, entB.body);
      if (m.hit) {
        m.idA = entA.id;
        m.idB = entB.id;
        if (resolve && entA.body && entB.body) {
          m.resolution = resolveContactManifold(entA.body, entB.body, m, dt, cfg);
        }
        manifolds.push(m);
      }
    }
    return manifolds;
  }

  // ---------------------------------------------------------------------------
  // Export to RYPhysics.Collision
  // ---------------------------------------------------------------------------
  RYP.Collision = {
    // Constants
    DEFAULT_BAUMGARTE_BETA: DEFAULT_BAUMGARTE_BETA,
    DEFAULT_SLOP: DEFAULT_SLOP,
    DEFAULT_MAX_CORRECTION: DEFAULT_MAX_CORRECTION,
    DEFAULT_CELL_SIZE: DEFAULT_CELL_SIZE,

    // Primitive Constructors & Bounds
    createAABB: createAABB,
    aabbFromCenter: aabbFromCenter,
    aabbMerge: aabbMerge,
    aabbExpand: aabbExpand,
    aabbOverlap: aabbOverlap,
    aabbContainsPoint: aabbContainsPoint,
    aabbArea: aabbArea,
    createCircle: createCircle,
    circleToAABB: circleToAABB,
    createCapsule: createCapsule,
    capsuleToAABB: capsuleToAABB,
    capsuleFromBody: capsuleFromBody,
    createOBB: createOBB,
    getOBBCorners: getOBBCorners,
    obbToAABB: obbToAABB,
    closestPointOnOBB: closestPointOnOBB,
    shapeToAABB: shapeToAABB,

    // Contact Manifolds
    computeContactRelativeVelocity: computeContactRelativeVelocity,
    buildContactManifold: buildContactManifold,
    noHitManifold: noHitManifold,

    // Narrow-Phase Solvers
    collideAABBvsAABB: collideAABBvsAABB,
    collideOBBvsOBB: collideOBBvsOBB,
    collideCirclevsCircle: collideCirclevsCircle,
    collideCirclevsCapsule: collideCirclevsCapsule,
    collideCapsulevsCapsule: collideCapsulevsCapsule,
    collideCirclevsOBB: collideCirclevsOBB,
    collideCapsulevsOBB: collideCapsulevsOBB,
    collideShapes: collideShapes,

    // Continuous Collision Detection (CCD)
    sweptAABBvsAABB: sweptAABBvsAABB,
    sweptSegmentvsOBB: sweptSegmentvsOBB,
    sweptArcvsBody: sweptArcvsBody,

    // Baumgarte Stabilization & Resolution
    applyBaumgarteStabilization: applyBaumgarteStabilization,
    resolveContactManifold: resolveContactManifold,

    // Broadphase Spatial Hash Grid (8v8 16-Fighter Culling)
    createSpatialHashGrid: createSpatialHashGrid,
    stepBroadphaseNarrowphase: stepBroadphaseNarrowphase
  };
})(RYPhysics);
