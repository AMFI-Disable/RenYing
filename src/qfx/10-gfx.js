/* ---------------- 渲染器 / 后期 / 材质 ---------------- */
const GFX = { time: { value: 0 }, quality: typeof window.__QUALITY === 'number' ? window.__QUALITY : 2 };
const SUN_DIR = new V3(-.72, .36, -.6).normalize();
const FOG_COL = new T.Color(0xb9a2a8);

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, srgb = true, repeat) {
  const t = new T.CanvasTexture(c); if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat); } return t;
}
function normalFromCanvas(src, strength = 2) {
  const w = src.width, h = src.height, sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h), ctx = out.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const L = (x, y) => { x = (x + w) % w; y = (y + h) % h; const i = (y * w + x) * 4; return (sd[i] + sd[i + 1] + sd[i + 2]) / 765; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y) - L(x - 1, y)) * strength, dy = (L(x, y + 1) - L(x, y - 1)) * strength, il = 1 / Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx * il * .5 + .5) * 255; d[i + 1] = (dy * il * .5 + .5) * 255; d[i + 2] = (il * .5 + .5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return out;
}

const RIM_FRAG = 'float rimF = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 2.6);\n outgoingLight += uRim * rimF;\n gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
function rimHook(shader) { shader.uniforms.uRim = this.userData.rim; shader.fragmentShader = 'uniform vec3 uRim;\n' + shader.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', RIM_FRAG); }
function stdMat(color, o = {}) {
  const m = new T.MeshStandardMaterial({ color, roughness: o.rough === undefined ? .82 : o.rough, metalness: o.metal || 0, flatShading: !!o.flat, side: o.side || T.FrontSide });
  if (o.emissive !== undefined) { m.emissive.set(o.emissive); m.emissiveIntensity = o.ei === undefined ? 1 : o.ei; }
  if (o.map) m.map = o.map; if (o.normalMap) { m.normalMap = o.normalMap; if (o.ns) m.normalScale.set(o.ns, o.ns); }
  if (o.vc) m.vertexColors = true;
  if (o.rim) { m.userData.rim = { value: new T.Color(o.rim === true ? 0x4a3524 : o.rim) }; m.onBeforeCompile = rimHook; }
  if (o.opacity !== undefined) { m.transparent = true; m.opacity = o.opacity; }
  return m;
}
/* 风：草、竹叶的顶点摆动 + 被玩家拨开 */
const WIND_U = { uTime: GFX.time, uPlayer: { value: new V3() } };
function windMat(mat, amp, hScale, push) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = WIND_U.uTime; sh.uniforms.uPlayer = WIND_U.uPlayer;
    sh.vertexShader = 'uniform float uTime;uniform vec3 uPlayer;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.);
      #endif
      float wh = clamp(position.y * ${hScale.toFixed(3)}, 0., 1.); wh *= wh;
      float ph = uTime * 1.6 + ip.x * .21 + ip.z * .17;
      float sw = (sin(ph) + .5 * sin(ph * 2.7 + 1.3) + .6 * sin(uTime * .5 + ip.x * .03)) * ${amp.toFixed(3)} * wh;
      mvPosition.x += sw; mvPosition.z += sw * .55;
      ${push ? `vec2 dp = ip.xz - uPlayer.xz; float dl = length(dp); float pf = (1. - smoothstep(.2, 1.3, dl)) * wh;
      mvPosition.xz += normalize(dp + vec2(.001)) * pf * .32; mvPosition.y -= pf * .2;` : ''}
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp + '_' + hScale + '_' + push;
  return mat;
}

function initGfx(canvas) {
  const R = GFX.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.02;
  R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap; R.autoClear = true; R.info.autoReset = true;
  const scene = GFX.scene = new T.Scene();
  scene.fog = new T.FogExp2(FOG_COL.getHex(), .0052);
  const cam = GFX.camera = new T.PerspectiveCamera(52, 1, .2, 1400);

  // 光
  const hemi = GFX.hemi = new T.HemisphereLight(0x93aede, 0x6f5a48, .78); scene.add(hemi);
  const sun = GFX.sun = new T.DirectionalLight(0xffc48a, 1.22); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 10; sc.far = 220;
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .04; sun.shadow.radius = 2.2;
  scene.add(sun); scene.add(sun.target);
  const fill = GFX.fill = new T.DirectionalLight(0x6f8fd0, .32); fill.position.set(.7, .5, .6); scene.add(fill);
  GFX.flash = [0, 1].map(() => { const l = new T.PointLight(0xffffff, 0, 16, 2); l.userData.v = 0; scene.add(l); return l; });

  // 天空：颜色全走 uniform，换地图时整套替换（GFX.setEnv）
  const C3 = () => ({ value: new T.Color() });
  const SU = GFX.skyU = { uSun: { value: SUN_DIR }, uTime: GFX.time, uZen: C3(), uMid: C3(), uHor: C3(), uHor2: C3(), uGlow: C3(), uHalo: C3(), uDisc: C3(), uDiscK: { value: .9992 }, uCloudD: C3(), uCloudL: C3(), uCloudG: C3(), uCov: { value: .46 }, uGround: C3(), uStars: { value: 0 }, uMoon: { value: 0 } };
  const sky = new T.Mesh(new T.SphereGeometry(1200, 40, 20), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false, uniforms: SU,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun, uZen, uMid, uHor, uHor2, uGlow, uHalo, uDisc, uCloudD, uCloudL, uCloudG, uGround; uniform float uTime, uDiscK, uCov, uStars, uMoon;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+vec2(3.1,1.7); a*=.5; } return s; }
      void main(){ vec3 d = normalize(vD); float y = max(d.y, 0.);
        float sd = max(dot(d, uSun), 0.); float az = max(dot(normalize(d.xz), normalize(uSun.xz)), 0.);
        vec3 hor = mix(uHor, uHor2, pow(az, 2.2));
        vec3 c = mix(hor, uMid, smoothstep(0., .22, y)); c = mix(c, uZen, smoothstep(.12, .7, y));
        if (uStars > 0.) { vec2 sp = d.xz / (d.y + .35) * 150.; float st = h(floor(sp)); float tw = .55 + .45 * sin(uTime * (1.3 + st * 3.) + st * 40.);
          c += vec3(.86,.9,1.) * step(.986, st) * smoothstep(.45, .0, length(fract(sp) - .5)) * tw * uStars * smoothstep(.06, .4, y); }
        c += uGlow * pow(sd, 6.); c += uHalo * pow(sd, 90.);
        float disc = smoothstep(uDiscK, uDiscK + (1. - uDiscK) * .5, sd);
        if (uMoon > 0.) { vec3 tp = d - uSun * dot(d, uSun); disc *= mix(1., .7 + .3 * fbm(tp.xy * 700. + tp.zx * 400.), uMoon); }
        c += uDisc * disc;
        vec2 cp = d.xz / (y + .16) * 1.3 + vec2(uTime * .006, uTime * .002);
        float cl = fbm(cp); float cov = smoothstep(uCov, uCov + .32, cl) * smoothstep(.0, .12, y) * .92;
        vec3 cc = mix(uCloudD, uCloudL, pow(sd, 1.6) * .9 + .12); cc += uCloudG * smoothstep(.5,.9,cl) * pow(sd, 5.);
        c = mix(c, cc, cov);
        c = mix(uGround, c, smoothstep(-.03, .05, d.y));
        gl_FragColor = vec4(c, 1.); }`
  })); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky); GFX.sky = sky;
  // 环境反射：一条竖向渐变 + 几团日光，经 PMREM 预滤波
  const makeEnv = (grad, glow) => {
    const ec = makeCanvas(256, 128), eg = ec.getContext('2d'); let gr = eg.createLinearGradient(0, 0, 0, 128); for (const [o, c] of grad) gr.addColorStop(o, c); eg.fillStyle = gr; eg.fillRect(0, 0, 256, 128);
    for (const sx of [60, 316, -196]) { gr = eg.createRadialGradient(sx, 50, 0, sx, 50, 70); gr.addColorStop(0, glow[0]); gr.addColorStop(.12, glow[1]); gr.addColorStop(1, glow[2]); eg.fillStyle = gr; eg.fillRect(sx - 70, 0, 140, 110); }
    const et = canvasTex(ec); et.mapping = T.EquirectangularReflectionMapping; let rt = null; try { const pm = new T.PMREMGenerator(R); rt = pm.fromEquirectangular(et); pm.dispose(); } catch (err) { rt = null; } et.dispose(); return rt;
  };
  GFX.setEnv = e => {
    scene.fog.color.setHex(e.fog); scene.fog.density = e.fogD; FOG_COL.setHex(e.fog);
    hemi.color.setHex(e.hemi[0]); hemi.groundColor.setHex(e.hemi[1]); hemi.intensity = e.hemi[2];
    sun.color.setHex(e.sun[0]); sun.intensity = e.sun[1]; SUN_DIR.set(e.sunDir[0], e.sunDir[1], e.sunDir[2]).normalize();
    fill.color.setHex(e.fill[0]); fill.intensity = e.fill[1]; R.toneMappingExposure = e.exp || 1.02;
    for (const k in e.sky) { const u = SU[k], v = e.sky[k]; if (!u) continue; if (u.value && u.value.isColor) u.value.setRGB(v[0], v[1], v[2]); else u.value = v; }
    // 预滤波结果是一张渲染目标，换图时连目标一起释放
    const old = GFX.env, oldRT = GFX.envRT; GFX.envRT = makeEnv(e.envGrad, e.envGlow); GFX.env = GFX.envRT ? GFX.envRT.texture : null;
    if (old) scene.traverse(o => { if (!o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.envMap === old) m.envMap = GFX.env; });
    if (oldRT) oldRT.dispose();
  };

  // ---- 后期：泛光 + 暗角 + 调色 ----
  const tri = new T.BufferGeometry();
  tri.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  tri.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const pm = (fs, u) => new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
  const mBright = pm('varying vec2 vUv; uniform sampler2D tD; void main(){ vec3 c = texture2D(tD, vUv).rgb; float l = max(c.r, max(c.g, c.b)); float k = smoothstep(.85, 1., l); gl_FragColor = vec4(c * k, 1.); }', { tD: { value: null } });
  const mBlur = pm(`varying vec2 vUv; uniform sampler2D tD; uniform vec2 uDir;
    void main(){ vec3 c = texture2D(tD, vUv).rgb * .2270; c += (texture2D(tD, vUv + uDir*1.385).rgb + texture2D(tD, vUv - uDir*1.385).rgb) * .3162;
      c += (texture2D(tD, vUv + uDir*3.231).rgb + texture2D(tD, vUv - uDir*3.231).rgb) * .0703; gl_FragColor = vec4(c, 1.); }`, { tD: { value: null }, uDir: { value: new T.Vector2() } });
  const mFinal = GFX.final = pm(`varying vec2 vUv; uniform sampler2D tS, tB1, tB2; uniform float uHurt, uGray, uTime, uFlash, uFocus, uBloom;
    void main(){ vec2 uv = vUv; vec2 q = uv - .5; float r2 = dot(q, q);
      vec3 c = texture2D(tS, uv).rgb;
      if (uFocus > .001) { vec2 o = q * uFocus * .09 * smoothstep(.02, .3, r2); c = (c + texture2D(tS, uv - o).rgb + texture2D(tS, uv - o * 2.).rgb + texture2D(tS, uv - o * 3.).rgb) * .25; }
      vec3 b = texture2D(tB1, uv).rgb * .6 + texture2D(tB2, uv).rgb * .7; c += b * uBloom;
      float l = dot(c, vec3(.299,.587,.114));
      c = mix(c, c * vec3(.94,1.0,1.07), (1. - smoothstep(0., .45, l)) * .55); c = mix(c, c * vec3(1.05,1.0,.93), smoothstep(.5, 1., l) * .5);
      c = mix(vec3(l), c, 1.08); c = (c - .5) * 1.05 + .5;
      c = mix(c, vec3(l) * vec3(.92,.9,.86), uGray);
      c *= 1. - r2 * .9; c = mix(c, vec3(.55,.03,.02), smoothstep(.1, .55, r2) * uHurt);
      c += uFlash; c += (fract(sin(dot(uv * (uTime + 1.), vec2(12.9898,78.233))) * 43758.5453) - .5) * .018;
      gl_FragColor = vec4(c, 1.); }`,
    { tS: { value: null }, tB1: { value: null }, tB2: { value: null }, uHurt: { value: 0 }, uGray: { value: 0 }, uTime: GFX.time, uFlash: { value: 0 }, uFocus: { value: 0 }, uBloom: { value: 1 } });
  const quad = new T.Mesh(tri, mFinal); quad.frustumCulled = false; const pScene = new T.Scene(); pScene.add(quad); const pCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let rtS, rtA, rtB, rtC, rtD, rtE;
  const mk = (w, h) => new T.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), { minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false });
  GFX.resize = (w, h, pr) => {
    R.setPixelRatio(pr); R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    const W = Math.max(2, Math.floor(w * pr)), H = Math.max(2, Math.floor(h * pr));
    [rtS, rtA, rtB, rtC, rtD, rtE].forEach(r => r && r.dispose());
    if (R.capabilities.isWebGL2) { rtS = new T.WebGLMultisampleRenderTarget(W, H, { minFilter: T.LinearFilter, magFilter: T.LinearFilter }); rtS.samples = GFX.quality >= 1 ? 4 : 0; }
    else rtS = new T.WebGLRenderTarget(W, H, { minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    rtS.texture.encoding = T.sRGBEncoding;
    rtA = mk(W / 2, H / 2); rtB = mk(W / 4, H / 4); rtC = mk(W / 4, H / 4); rtD = mk(W / 8, H / 8); rtE = mk(W / 8, H / 8);
    GFX.W = W; GFX.H = H; GFX.vh = h;
  };
  const pass = (mat, target) => { quad.material = mat; R.setRenderTarget(target); R.render(pScene, pCam); };
  GFX.render = () => {
    R.setRenderTarget(rtS); R.render(scene, cam);
    mBright.uniforms.tD.value = rtS.texture; pass(mBright, rtA);
    mBlur.uniforms.tD.value = rtA.texture; mBlur.uniforms.uDir.value.set(1 / rtB.width, 0); pass(mBlur, rtB);
    mBlur.uniforms.tD.value = rtB.texture; mBlur.uniforms.uDir.value.set(0, 1 / rtC.height); pass(mBlur, rtC);
    mBlur.uniforms.tD.value = rtC.texture; mBlur.uniforms.uDir.value.set(1.6 / rtD.width, 0); pass(mBlur, rtD);
    mBlur.uniforms.tD.value = rtD.texture; mBlur.uniforms.uDir.value.set(0, 1.6 / rtE.height); pass(mBlur, rtE);
    mFinal.uniforms.tS.value = rtS.texture; mFinal.uniforms.tB1.value = rtC.texture; mFinal.uniforms.tB2.value = rtE.texture; pass(mFinal, null);
  };
  // 太阳阴影跟随
  const tmp = new V3();
  GFX.followSun = p => { tmp.set(Math.round(p.x), 0, Math.round(p.z)); sun.target.position.copy(tmp); sun.position.copy(tmp).addScaledVector(SUN_DIR, 110); sun.target.updateMatrixWorld(); };
  GFX.flashAt = (pos, color, intensity) => { const l = GFX.flash[0].userData.v <= GFX.flash[1].userData.v ? GFX.flash[0] : GFX.flash[1]; l.position.copy(pos); l.position.y += 1.2; l.color.set(color); l.userData.v = intensity; };
  GFX.updateFlash = dt => { for (const l of GFX.flash) { l.userData.v = Math.max(0, l.userData.v - dt * 14 * (l.userData.v + .3)); l.intensity = l.userData.v; } };
}

/* ---------------- 几何缓存 ---------------- */
/* 共用几何缓存：打上 cached 标记，换地图时不释放 */
const _geo = {};
function geoC(k, mk) { let g = _geo[k]; if (!g) { g = _geo[k] = mk(); g.userData.cached = true; } return g; }
function cylG(rt, rb, h, seg = 10, open = false) { return geoC('c' + rt + '_' + rb + '_' + h + '_' + seg + open, () => new T.CylinderGeometry(rt, rb, h, seg, 1, open)); }
function sphG(r, w = 14, h = 10) { return geoC('s' + r + '_' + w + '_' + h, () => new T.SphereGeometry(r, w, h)); }
function boxG(x, y, z) { return geoC('b' + x + '_' + y + '_' + z, () => new T.BoxGeometry(x, y, z)); }
function coneG(r, h, seg = 10) { return geoC('k' + r + '_' + h + '_' + seg, () => new T.ConeGeometry(r, h, seg)); }
function icoG(r, d = 1) { return geoC('i' + r + '_' + d, () => new T.IcosahedronGeometry(r, d)); }
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
function group(x = 0, y = 0, z = 0, parent) { const g = new T.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }

/* 实例批次：攒矩阵，一次绘制 */
class Batch {
  constructor(geo, mat, shadow = true) { this.geo = geo; this.mat = mat; this.m = []; this.c = []; this.shadow = shadow; }
  add(pos, quat, scale, color) { const mt = new T.Matrix4(); mt.compose(pos, quat || Batch.Q0, scale || Batch.S1); this.m.push(mt); this.c.push(color || null); return this; }
  build(scene) {
    const im = new T.InstancedMesh(this.geo, this.mat, this.m.length); const col = new T.Color(1, 1, 1);
    for (let i = 0; i < this.m.length; i++) { im.setMatrixAt(i, this.m[i]); if (this.c.some(c => c)) im.setColorAt(i, this.c[i] || col); }
    im.castShadow = this.shadow; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im;
  }
}
Batch.Q0 = new T.Quaternion(); Batch.S1 = new V3(1, 1, 1);

