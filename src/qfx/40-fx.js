/* ---------------- 特效：粒子、剑光、预警、飘字 ---------------- */
const FX = { list: [], add: null, ink: null, nums: [], shake: 0 };

class Particles {
  constructor(max, additive) {
    this.max = max; this.n = 0; const g = this.geo = new T.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.ml = new Float32Array(max); this.prm = new Float32Array(max * 6); this.c0 = new Float32Array(max * 4);
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3)); g.setAttribute('aCol', new T.BufferAttribute(this.col, 4)); g.setAttribute('aSize', new T.BufferAttribute(this.size, 1));
    this.mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending, uniforms: { uScale: { value: 600 } },
      vertexShader: 'attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol; void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize * uScale / max(.2, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: additive ? 'varying vec4 vCol; void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., 0., d); a = a * a + smoothstep(.35, 0., d) * .6; gl_FragColor = vec4(vCol.rgb, vCol.a * a); }'
        : 'varying vec4 vCol; void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., .25, d); gl_FragColor = vec4(vCol.rgb, vCol.a * a); }'
    });
    this.pts = new T.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 6 : 5;
  }
  emit(o) {
    const i = this.n++ % this.max, i3 = i * 3, i4 = i * 4, i6 = i * 6;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z; this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this.life[i] = this.ml[i] = o.life || 1; this.c0[i4] = o.r; this.c0[i4 + 1] = o.g; this.c0[i4 + 2] = o.b; this.c0[i4 + 3] = o.a === undefined ? 1 : o.a;
    this.prm[i6] = o.s0 || .2; this.prm[i6 + 1] = o.s1 === undefined ? 0 : o.s1; this.prm[i6 + 2] = o.grav === undefined ? 9 : o.grav; this.prm[i6 + 3] = o.drag || 0; this.prm[i6 + 4] = o.wob || 0; this.prm[i6 + 5] = Math.random() * 6;
  }
  update(dt, t) {
    const { pos, vel, life, ml, prm, col, c0, size, max } = this;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) continue; const i3 = i * 3, i4 = i * 4, i6 = i * 6; life[i] -= dt;
      if (life[i] <= 0) { size[i] = 0; col[i4 + 3] = 0; continue; }
      const dr = Math.max(0, 1 - prm[i6 + 3] * dt); vel[i3] *= dr; vel[i3 + 1] = vel[i3 + 1] * dr - prm[i6 + 2] * dt; vel[i3 + 2] *= dr;
      const w = prm[i6 + 4]; if (w) { vel[i3] += Math.sin(t * 2.3 + prm[i6 + 5]) * w * dt; vel[i3 + 2] += Math.cos(t * 1.9 + prm[i6 + 5]) * w * dt; }
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt; if (pos[i3 + 1] < .03 && prm[i6 + 2] > 0) { pos[i3 + 1] = .03; vel[i3 + 1] *= -.3; vel[i3] *= .6; vel[i3 + 2] *= .6; }
      const k = life[i] / ml[i]; size[i] = lerp(prm[i6 + 1], prm[i6], k); col[i4] = c0[i4]; col[i4 + 1] = c0[i4 + 1]; col[i4 + 2] = c0[i4 + 2]; col[i4 + 3] = c0[i4 + 3] * Math.min(1, k * 3) * Math.min(1, (1 - k) * 12 + .2);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aCol.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
  }
}

const _c = new T.Color();
FX.sparks = (p, n, color, sp = 7, up = 2) => { _c.set(color); for (let i = 0; i < n; i++) { const a = rand(TAU), e = rand(-.4, 1), s = rand(.3, 1) * sp; FX.add.emit({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s, vy: e * s * .7 + up, vz: Math.sin(a) * s, life: rand(.2, .55), s0: rand(.06, .16), s1: 0, r: _c.r, g: _c.g, b: _c.b, grav: 14, drag: 1.5 }); } };
FX.glow = (p, color, size = 1.6, life = .22) => { _c.set(color); FX.add.emit({ x: p.x, y: p.y, z: p.z, life, s0: size * .3, s1: size, r: _c.r, g: _c.g, b: _c.b, a: .9, grav: 0 }); };
FX.inkBurst = (p, n, sc = 1) => { for (let i = 0; i < n; i++) { const a = rand(TAU), s = rand(.5, 3.2) * sc, l = rand(.02, .09); FX.ink.emit({ x: p.x + rand(-.2, .2), y: p.y + rand(-.3, .3), z: p.z + rand(-.2, .2), vx: Math.cos(a) * s, vy: rand(.2, 2.6) * sc, vz: Math.sin(a) * s, life: rand(.5, 1.2), s0: rand(.5, 1.3) * sc, s1: rand(.1, .5) * sc, r: l, g: l, b: l * 1.2, a: rand(.5, .85), grav: rand(-.5, 1.5), drag: 2.2 }); } };
FX.smoke = (p, n, sc = 1, col = .06, a = .7) => { for (let i = 0; i < n; i++) { const an = rand(TAU), s = rand(.2, 1.4) * sc; FX.ink.emit({ x: p.x + Math.cos(an) * rand(.6) * sc, y: p.y + rand(.1, 1.6) * sc, z: p.z + Math.sin(an) * rand(.6) * sc, vx: Math.cos(an) * s, vy: rand(.4, 1.8), vz: Math.sin(an) * s, life: rand(.7, 1.6), s0: rand(.3, .7) * sc, s1: rand(1.2, 2.2) * sc, r: col, g: col, b: col * 1.15, a: a * rand(.5, 1), grav: -.4, drag: 1.6 }); } };
FX.dust = (p, n, rad = 1) => { for (let i = 0; i < n; i++) { const a = rand(TAU), s = rand(2, 5) * rad; FX.ink.emit({ x: p.x + Math.cos(a) * rad * .4, y: .12, z: p.z + Math.sin(a) * rad * .4, vx: Math.cos(a) * s, vy: rand(.3, 1.4), vz: Math.sin(a) * s, life: rand(.5, 1.1), s0: rand(.3, .6), s1: rand(1, 1.9), r: .62, g: .55, b: .46, a: rand(.2, .4), grav: -.2, drag: 3 }); } };
FX.wisp = (p, color, n = 4, sp = 1) => { _c.set(color); for (let i = 0; i < n; i++) FX.add.emit({ x: p.x + rand(-.3, .3), y: p.y + rand(-.5, .5), z: p.z + rand(-.3, .3), vx: rand(-1, 1) * sp, vy: rand(.2, 1.5) * sp, vz: rand(-1, 1) * sp, life: rand(.3, .8), s0: rand(.1, .28), s1: 0, r: _c.r, g: _c.g, b: _c.b, a: .85, grav: -1, drag: 1.5 }); };
FX.pillar = (p, color, h = 6) => { _c.set(color); for (let i = 0; i < 70; i++) { const a = rand(TAU), r = rand(.2, 1.1); FX.add.emit({ x: p.x + Math.cos(a) * r, y: rand(0, .5), z: p.z + Math.sin(a) * r, vx: 0, vy: rand(3, h * 2), vz: 0, life: rand(.5, 1.2), s0: rand(.12, .34), s1: 0, r: _c.r, g: _c.g, b: _c.b, grav: -2, drag: .6 }); } };

/* 剑光拖尾 */
const TRAIL_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const TRAIL_FS = 'varying vec2 vUv; uniform vec3 uCol; uniform float uInt; void main(){ float t = 1. - vUv.x; float a = t * t * (.12 + .88 * pow(vUv.y, 2.2)) * smoothstep(0., .05, vUv.x + .05); vec3 c = mix(uCol, vec3(1.), pow(vUv.y, 6.) * t * .85); gl_FragColor = vec4(c * uInt, a); }';
class Trail {
  constructor(color, life = .2, inten = 1.1) {
    this.pts = []; this.life = life; this.SUB = 3; this.MAXP = 18; const nv = ((this.MAXP - 1) * this.SUB + 1) * 2;
    this.pos = new Float32Array(nv * 3); this.uv = new Float32Array(nv * 2); const idx = []; for (let i = 0; i < nv / 2 - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = this.geo = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(this.pos, 3)); g.setAttribute('uv', new T.BufferAttribute(this.uv, 2)); g.setIndex(idx); g.setDrawRange(0, 0);
    this.mat = new T.ShaderMaterial({ vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, uniforms: { uCol: { value: new T.Color(color) }, uInt: { value: inten } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    this.mesh = new T.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; GFX.scene.add(this.mesh);
  }
  push(b, t) { this.pts.unshift({ b: b.clone(), t: t.clone(), age: 0 }); if (this.pts.length > this.MAXP) this.pts.pop(); }
  update(dt) {
    const P = this.pts; for (const p of P) p.age += dt; while (P.length && P[P.length - 1].age > this.life) P.pop();
    if (P.length < 2) { this.geo.setDrawRange(0, 0); return; }
    let n = 0; const S = this.SUB, pos = this.pos, uv = this.uv, L = this.life;
    const cr = (a, b, c, d, f) => { const f2 = f * f, f3 = f2 * f; return .5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3); };
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)], last = i === P.length - 2;
      for (let s = 0; s < (last ? S + 1 : S); s++) {
        const f = s / S, u = sat(lerp(p1.age, p2.age, f) / L);
        pos[n * 6] = cr(p0.b.x, p1.b.x, p2.b.x, p3.b.x, f); pos[n * 6 + 1] = cr(p0.b.y, p1.b.y, p2.b.y, p3.b.y, f); pos[n * 6 + 2] = cr(p0.b.z, p1.b.z, p2.b.z, p3.b.z, f);
        pos[n * 6 + 3] = cr(p0.t.x, p1.t.x, p2.t.x, p3.t.x, f); pos[n * 6 + 4] = cr(p0.t.y, p1.t.y, p2.t.y, p3.t.y, f); pos[n * 6 + 5] = cr(p0.t.z, p1.t.z, p2.t.z, p3.t.z, f);
        uv[n * 4] = u; uv[n * 4 + 1] = 0; uv[n * 4 + 2] = u; uv[n * 4 + 3] = 1; n++;
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.uv.needsUpdate = true; this.geo.setDrawRange(0, (n - 1) * 6);
  }
  setColor(c) { this.mat.uniforms.uCol.value.set(c); }
  dispose() { GFX.scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

/* 月牙剑光 */
const _sect = {};
function sectorGeo(arc, inner = .5) {
  const k = arc.toFixed(2) + '_' + inner; if (_sect[k]) return _sect[k];
  const N = 40, pos = [], uv = [], idx = []; for (let i = 0; i <= N; i++) { const u = i / N, th = (u - .5) * arc, sx = Math.sin(th), cz = Math.cos(th); pos.push(sx * inner, 0, cz * inner, sx, 0, cz); uv.push(u, 0, u, 1); if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return _sect[k] = g;
}
const SLASH_FS = `varying vec2 vUv; uniform vec3 uCol; uniform float uProg, uDir, uInt, uStatic;
  void main(){ float al = uDir > 0. ? vUv.x : 1. - vUv.x; float head = uProg * 1.9; float rev = smoothstep(head, head - .35, al) * smoothstep(head - 1.25, head - .25, al);
    float rad = pow(vUv.y, 5.) * smoothstep(1., .92, vUv.y) * .75 + pow(vUv.y, 16.) * .8; float a = rev * rad * (1. - uProg * uProg);
    if (uStatic > .5) a = pow(sin(3.14159 * vUv.x), 1.4) * rad * (1. - uProg);
    vec3 c = mix(uCol, vec3(1.), pow(vUv.y, 7.) * .9); gl_FragColor = vec4(c * uInt, a); }`;
function slashMat(color, inten) { return new T.ShaderMaterial({ vertexShader: TRAIL_VS, fragmentShader: SLASH_FS, uniforms: { uCol: { value: new T.Color(color) }, uProg: { value: 0 }, uDir: { value: 1 }, uInt: { value: inten }, uStatic: { value: 0 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }); }
FX.slash = o => {
  const m = new T.Mesh(sectorGeo(o.arc || 2.8, o.inner || .45), slashMat(o.color, o.inten || .85)); m.frustumCulled = false; m.renderOrder = 8;
  m.position.set(o.x, o.y, o.z); m.rotation.set(o.pitch || 0, o.yaw, o.roll || 0, 'YXZ'); m.scale.setScalar(o.r); m.material.uniforms.uDir.value = o.dir || 1; GFX.scene.add(m);
  let t = 0; const dur = o.dur || .22; FX.list.push({ update(dt) { t += dt; m.material.uniforms.uProg.value = sat(t / dur); if (o.follow) { m.position.x = o.follow.x; m.position.z = o.follow.z; } if (t >= dur) { GFX.scene.remove(m); m.material.dispose(); return false; } return true; } });
};
FX.ring = (p, r0, r1, color, dur = .4, y = .12) => {
  const m = new T.Mesh(FX.ringGeo || (FX.ringGeo = new T.RingGeometry(.9, 1, 64).rotateX(-PI / 2)), new T.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
  m.position.set(p.x, y, p.z); m.renderOrder = 4; GFX.scene.add(m); let t = 0;
  FX.list.push({ update(dt) { t += dt; const k = sat(t / dur); m.scale.setScalar(lerp(r0, r1, easeOut(k))); m.material.opacity = (1 - k) * (1 - k) * .6; if (k >= 1) { GFX.scene.remove(m); m.material.dispose(); return false; } return true; } });
};
FX.bolt = p => {
  const pos = [], idx = []; let x = 0, z = 0; const N = 12;
  for (let i = 0; i <= N; i++) { const y = i / N * 22; if (i) { x += rand(-.7, .7); z += rand(-.7, .7); } const w = .16 + i * .015; pos.push(x - w, y, z, x + w, y, z, x, y, z - w, x, y, z + w); if (i < N) { const a = i * 4; idx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4, a + 2, a + 3, a + 6, a + 3, a + 7, a + 6); } }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false })); m.position.set(p.x, 0, p.z); m.frustumCulled = false; GFX.scene.add(m);
  let t = 0; FX.list.push({ update(dt) { t += dt; m.material.opacity = t < .05 ? 1 : (1 - (t - .05) / .2) * (Math.sin(t * 90) * .3 + .7); if (t > .25) { GFX.scene.remove(m); g.dispose(); m.material.dispose(); return false; } return true; } });
  FX.sparks({ x: p.x, y: .3, z: p.z }, 26, 0xcfe0ff, 9, 3); FX.ring(p, .5, 4.5, 0xa8c4ff, .35); GFX.flashAt(p, 0xbcd0ff, 5);
};

/* 地面预警 */
const TELE_FS = `varying vec2 vUv; uniform vec3 uCol; uniform float uProg, uFade, uSide;
  void main(){ float fill = step(vUv.y, uProg); float rim = smoothstep(.94, 1., vUv.y); float side = uSide * (smoothstep(.05, 0., vUv.x) + smoothstep(.95, 1., vUv.x));
    float front = smoothstep(.07, 0., abs(vUv.y - uProg)); float a = (fill * .17 + max(rim, side) * .6 + front * .3 + .05) * uFade; gl_FragColor = vec4(uCol, a); }`;
function fanGeo(arc) { const k = 'f' + arc.toFixed(2); if (_sect[k]) return _sect[k]; const N = 48, pos = [0, 0, 0], uv = [.5, 0], idx = []; for (let i = 0; i <= N; i++) { const u = i / N, th = (u - .5) * arc; pos.push(Math.sin(th), 0, Math.cos(th)); uv.push(u, 1); if (i < N) idx.push(0, i + 1, i + 2); } const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return _sect[k] = g; }
function rectGeo() { if (_sect.rect) return _sect.rect; const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, -.5, 0, 1, .5, 0, 1], 3)); g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2)); g.setIndex([0, 2, 1, 1, 2, 3]); return _sect.rect = g; }
FX.telegraph = o => {
  const mat = new T.ShaderMaterial({ vertexShader: TRAIL_VS, fragmentShader: TELE_FS, uniforms: { uCol: { value: new T.Color(o.color || 0xff3a22) }, uProg: { value: 0 }, uFade: { value: 1 }, uSide: { value: o.type === 'circle' ? 0 : 1 } }, transparent: true, depthWrite: false, side: T.DoubleSide });
  const m = new T.Mesh(o.type === 'line' ? rectGeo() : fanGeo(o.type === 'circle' ? TAU : o.arc), mat); m.position.set(o.x, .3, o.z); m.rotation.y = o.yaw || 0; m.renderOrder = 3; m.frustumCulled = false;
  if (o.type === 'line') m.scale.set(o.w, 1, o.len); else m.scale.setScalar(o.r); GFX.scene.add(m);
  const h = { t: 0, dur: o.dur, dead: false, mesh: m, cancel() { this.dead = true; }, update(dt) { this.t += dt; mat.uniforms.uProg.value = sat(this.t / this.dur); if (this.t > this.dur) this.dead = true; if (this.dead) { mat.uniforms.uFade.value -= dt * 7; if (mat.uniforms.uFade.value <= 0) { GFX.scene.remove(m); mat.dispose(); return false; } } return true; } };
  FX.list.push(h); return h;
};
/* 墨迹 */
FX.decal = (p, size) => {
  if (!FX.inkTex) { FX.inkTex = [0, 1, 2].map(s => { const c = makeCanvas(128, 128), g = c.getContext('2d'), r = mulberry(s + 3); for (let i = 0; i < 16; i++) { const a = r() * TAU, d = r() * r() * 46, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, rr = (i < 4 ? 26 : 4 + r() * 12) * (1 - d / 80); const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.7, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); } return canvasTex(c, false); }); FX.decals = []; }
  const m = new T.Mesh(FX.decalGeo || (FX.decalGeo = new T.PlaneGeometry(1, 1).rotateX(-PI / 2)), new T.MeshBasicMaterial({ map: pick(FX.inkTex), color: 0x0b0b0e, transparent: true, opacity: .78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.position.set(p.x, .045 + rand(.01), p.z); m.rotation.y = rand(TAU); m.scale.setScalar(size); m.renderOrder = 1; GFX.scene.add(m); let t = 0;
  FX.list.push({ update(dt) { t += dt; if (t > 9) { m.material.opacity = .78 * (1 - (t - 9) / 3); if (t > 12) { GFX.scene.remove(m); m.material.dispose(); return false; } } return true; } });
};

/* 飘字 */
const _pv = new V3();
FX.initNums = () => { const host = $('dmg'); for (let i = 0; i < 56; i++) { const el = document.createElement('span'); el.style.opacity = 0; host.appendChild(el); FX.nums.push({ el, t: 0, life: 0, p: new V3(), ox: 0 }); } FX.ni = 0; };
FX.num = (p, text, cls = '', life = .85) => { const n = FX.nums[FX.ni++ % FX.nums.length]; n.el.textContent = text; n.el.className = cls; n.t = 0; n.life = life; n.p.set(p.x + rand(-.35, .35), p.y + rand(-.1, .3), p.z + rand(-.35, .35)); n.ox = rand(-14, 14); };
FX.updateNums = (dt, cam, w, h) => {
  for (const n of FX.nums) {
    if (n.life <= 0) continue; n.t += dt; const k = n.t / n.life; if (k >= 1) { n.life = 0; n.el.style.opacity = 0; continue; }
    _pv.copy(n.p); _pv.y += k * 1.1; _pv.project(cam); if (_pv.z > 1) { n.el.style.opacity = 0; continue; }
    const sc = k < .12 ? lerp(1.7, 1, k / .12) : 1; n.el.style.opacity = k > .7 ? (1 - k) / .3 : 1;
    n.el.style.transform = `translate(${((_pv.x * .5 + .5) * w + n.ox).toFixed(1)}px,${((-_pv.y * .5 + .5) * h).toFixed(1)}px) translate(-50%,-50%) scale(${sc.toFixed(2)})`;
  }
};
FX.init = scene => { FX.add = new Particles(3600, true); FX.ink = new Particles(1800, false); scene.add(FX.ink.pts); scene.add(FX.add.pts); FX.initNums(); };
FX.update = (dt, t) => {
  const sc = GFX.H / (2 * Math.tan(GFX.camera.fov * PI / 360)); FX.add.mat.uniforms.uScale.value = sc; FX.ink.mat.uniforms.uScale.value = sc;
  FX.add.update(dt, t); FX.ink.update(dt, t);
  for (let i = FX.list.length - 1; i >= 0; i--) if (!FX.list[i].update(dt)) FX.list.splice(i, 1);
};
FX.clear = () => { for (const f of FX.list) { if (f.mesh) f.dead = true; } };

