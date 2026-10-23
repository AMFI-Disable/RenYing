/* ---------------- 开放世界 · 材质：地表混合、树叶透光、岩石三向投影、草海、湖水、飞瀑 ---------------- */
const OWU = { uTime: GFX.time, uSunV: { value: new V3(0, 1, 0) }, uWL: { value: OW.WL }, uGR: { value: 58 }, uPl: { value: new V3() }, uSkyZ: { value: new T.Color() }, uSkyH: { value: new T.Color() } };
const SRGB = 'vec3 s2l(vec3 c){ return c * c * (c * .31 + .69); }\nfloat lum(vec3 c){ return dot(c, vec3(.3,.59,.11)); }\n';

/* 地表：草、土、岩、苔四层按顶点权重 + 贴图明暗做高度混合；岩层三向投影；水边湿润 */
function owTerrainMat(tx) {
  const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .92, metalness: 0, vertexColors: true });
  m.onBeforeCompile = sh => {
    terrU(sh); Object.assign(sh.uniforms, { tG: { value: tx.grass }, tGN: { value: tx.grassN }, tD: { value: tx.dirt }, tDN: { value: tx.dirtN }, tR: { value: tx.rock }, tRN: { value: tx.rockN }, tM: { value: tx.moss }, tMN: { value: tx.mossN }, tMac: { value: tx.macro }, uWL: OWU.uWL });
    sh.vertexShader = 'attribute vec4 aSp; attribute float aWet; varying vec4 vSp; varying vec3 vTW, vNW; varying float vWet;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vSp = aSp; vTW = tWP.xyz; vNW = normal; vWet = aWet;');
    sh.fragmentShader = 'uniform sampler2D tG, tGN, tD, tDN, tR, tRN, tM, tMN, tMac; uniform float uWL; varying vec4 vSp; varying vec3 vTW, vNW; varying float vWet;\n' + SRGB + 'vec4 owW; float owWet;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 tp = vTW.xz; vec4 mac = texture2D(tMac, tp * .0023), mac2 = texture2D(tMac, tp * .011 + .3);
        vec2 u1 = tp * .21, u2 = tp * .057 + .37;
        vec3 cG = mix(texture2D(tG, u1).rgb, texture2D(tG, u2).rgb, .42);
        vec3 cD = mix(texture2D(tD, tp * .19).rgb, texture2D(tD, tp * .049 + .2).rgb, .38);
        vec3 cM = mix(texture2D(tM, tp * .2).rgb, texture2D(tM, tp * .06).rgb, .35);
        vec3 nA = normalize(vNW), bw = pow(abs(nA), vec3(6.)); bw /= dot(bw, vec3(1.));
        vec3 cR = texture2D(tR, vTW.zy * .085).rgb * bw.x + texture2D(tR, tp * .085).rgb * bw.y + texture2D(tR, vTW.xy * .085).rgb * bw.z;
        cR = mix(cR, texture2D(tR, tp * .021).rgb, .3 * bw.y);
        vec4 hb = vec4(lum(cG) + .1, lum(cD) * .9, lum(cR) + .05, lum(cM));
        owW = vSp * (.35 + hb); owW = owW * owW * owW * owW; owW /= max(1e-4, owW.x + owW.y + owW.z + owW.w);
        vec3 alb = s2l(cG) * owW.x + s2l(cD) * owW.y + s2l(cR) * owW.z + s2l(cM) * owW.w;
        alb *= .72 + .56 * mac.r * (.8 + .4 * mac2.g);
        alb = mix(alb, alb * vec3(1.08, .96, .82), (mac2.r - .5) * .6 * owW.x);
        owWet = vWet;
        alb *= mix(1., .5, owWet);
        diffuseColor.rgb *= alb;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(.96, .82, owW.z), .28, owWet);')
      .replace('#include <normal_fragment_maps>', `
        vec2 tq = vTW.xz;
        vec3 nT = (texture2D(tGN, tq * .21).xyz * 2. - 1.) * owW.x + (texture2D(tDN, tq * .19).xyz * 2. - 1.) * owW.y + (texture2D(tRN, tq * .085).xyz * 2. - 1.) * owW.z * 1.4 + (texture2D(tMN, tq * .2).xyz * 2. - 1.) * owW.w;
        vec3 nw = normalize(normalize(vNW) + vec3(nT.x, 0., -nT.y) * .9);
        normal = normalize((viewMatrix * vec4(nw, 0.)).xyz);`);
  };
  m.customProgramCacheKey = () => 'owTerrain';
  return m;
}
/* 树叶：alphaTest 裁剪；风中摇曳（越高越摆）；逆光时透出暖色 */
function owLeafMat(tex, trans, sway = 1) {
  const m = new T.MeshStandardMaterial({ map: tex, alphaTest: .42, side: T.DoubleSide, roughness: .78, vertexColors: true, color: 0xffffff });
  m.onBeforeCompile = sh => {
    terrU(sh); sh.uniforms.uTime = OWU.uTime; sh.uniforms.uSunV = OWU.uSunV; sh.uniforms.uTrans = { value: new T.Color(trans) };
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 lw = instanceMatrix[3].xyz;
      #else
        vec3 lw = vec3(0.);
      #endif
      float sk = max(0., position.y) * .045 * ${sway.toFixed(2)}, ph = uTime * 1.3 + lw.x * .13 + lw.z * .11;
      transformed.x += (sin(ph) + .4 * sin(ph * 2.3 + position.y)) * sk; transformed.z += cos(ph * .8 + .7) * sk * .6;
      transformed += normal * sin(uTime * 4. + position.x * 3. + position.z * 2.) * .03;`);
    sh.fragmentShader = 'uniform vec3 uSunV, uTrans;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float bl = pow(max(dot(-normalize(vViewPosition), uSunV), 0.), 3.);
      totalEmissiveRadiance += diffuseColor.rgb * uTrans * (bl * 1.4 + .03);`);
  };
  m.customProgramCacheKey = () => 'owLeaf' + trans + '_' + sway;
  return m;
}
function owBarkMat(tx) { const m = new T.MeshStandardMaterial({ map: tx.bark.map, normalMap: tx.bark.nm, roughness: .95, vertexColors: true, color: 0xffffff }); m.normalScale.set(1.2, 1.2); return m; }
/* 岩石：世界坐标三向投影，朝上的面长苔 */
function owRockMat(tx, mossK = 1, tint = 0xffffff) {
  const m = new T.MeshStandardMaterial({ color: tint, roughness: .9 });
  m.onBeforeCompile = sh => {
    terrU(sh); Object.assign(sh.uniforms, { tR: { value: tx.rock }, tRN: { value: tx.rockN }, tM: { value: tx.moss } });
    sh.vertexShader = 'varying vec3 vRW, vRN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vRW = tWP.xyz;
      #ifdef USE_INSTANCING
        vRN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
      #else
        vRN = normalize(mat3(modelMatrix) * objectNormal);
      #endif`);
    sh.fragmentShader = 'uniform sampler2D tR, tRN, tM; varying vec3 vRW, vRN;\n' + SRGB + 'float owMs;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 bw = pow(abs(vRN), vec3(5.)); bw /= dot(bw, vec3(1.)); float sc = .23;
        vec3 c = texture2D(tR, vRW.zy * sc).rgb * bw.x + texture2D(tR, vRW.xz * sc).rgb * bw.y + texture2D(tR, vRW.xy * sc).rgb * bw.z;
        vec3 cm = texture2D(tM, vRW.xz * .3).rgb;
        owMs = smoothstep(.45, .85, vRN.y + (c.g - .45) * .8) * ${mossK.toFixed(2)};
        diffuseColor.rgb *= mix(s2l(c) * 1.15, s2l(cm) * 1.1, owMs);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 bw2 = pow(abs(vRN), vec3(5.)); bw2 /= dot(bw2, vec3(1.));
        vec3 nX = texture2D(tRN, vRW.zy * .23).xyz * 2. - 1., nY = texture2D(tRN, vRW.xz * .23).xyz * 2. - 1., nZ = texture2D(tRN, vRW.xy * .23).xyz * 2. - 1.;
        vec3 nw = normalize(vRN + (vec3(0., nX.y, nX.x) * bw2.x + vec3(nY.x, 0., nY.y) * bw2.y + vec3(nZ.x, nZ.y, 0.) * bw2.z) * 1.1);
        normal = normalize((viewMatrix * vec4(nw, 0.)).xyz);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(.86, .97, owMs);');
  };
  m.defines = { TERR_VERT: '' }; m.customProgramCacheKey = () => 'owRock' + mossK + '_' + tint;
  return m;
}
/* 草海：实例只平移不旋转；按高度图 G 通道（草密度）决定这丛长不长；远处缩没；被人拨开 */
function owGrassMat() {
  const m = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
  m.onBeforeCompile = sh => {
    terrU(sh); Object.assign(sh.uniforms, { uTime: OWU.uTime, uGR: OWU.uGR, uPl: OWU.uPl });
    sh.vertexShader = 'uniform float uTime, uGR; uniform vec3 uPl;\n' + sh.vertexShader.replace('#include <clipping_planes_pars_vertex>', '#include <clipping_planes_pars_vertex>\nvec3 tCs(vec2 g){ return texture2D(uHM, (g + .5) * uHMn.y).gba; }')
      .replace('#include <color_vertex>', `#include <color_vertex>
        vec3 iw = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.)).xyz;
        vec2 gg = clamp((iw.xz - uHMp.xy) * uHMp.z, vec2(0.), vec2(uHMn.x - 1.001)); vec3 gc = tCs(floor(gg + .5));
        float rnd = fract(sin(dot(floor(iw.xz * 7.), vec2(12.9898, 78.233))) * 43758.5453);
        float dens = gc.x, autumn = gc.y, dry = gc.z;
        float nz = sin(iw.x * .07 + sin(iw.z * .05) * 2.) * .5 + .5;
        vec3 gcol = mix(vec3(.42, .6, .2), vec3(.58, .66, .24), nz);
        gcol = mix(gcol, vec3(.86, .62, .3), autumn * (.5 + .4 * rnd));
        gcol = mix(gcol, vec3(.56, .5, .36), dry);
        gcol *= .8 + .4 * rnd;
        vColor.rgb *= gcol;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float dc = length(iw.xz - uCamP.xz);
        float sc = step(rnd, dens * 1.15) * (1. - smoothstep(uGR * .62, uGR, dc));
        float wh = position.y * position.y;
        float ph = uTime * 1.9 + iw.x * .35 + iw.z * .27;
        vec2 wind = vec2(sin(ph) + .5 * sin(ph * 2.3 + 1.1) + .8 * sin(uTime * .6 + iw.x * .02), cos(ph * .9) * .5) * .11 * wh;
        vec2 dp = iw.xz - uPl.xz; float pf = (1. - smoothstep(.3, 1.5, length(dp))) * wh;
        transformed.xz += wind + normalize(dp + vec2(.001)) * pf * .5; transformed.y -= pf * .25;
        transformed *= sc;`);
  };
  m.customProgramCacheKey = () => 'owGrass';
  return m;
}
/* 湖水：按水下地形深浅变色、岸边白沫、菲涅尔反天光、日光高光；不随地形抬升 */
function owWaterMat(level, tint) {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, defines: { NO_TERR: '' },
    uniforms: Object.assign(T.UniformsUtils.merge([T.UniformsLib.fog]), { uTime: GFX.time, uLv: { value: level }, uSun: { value: SUN_DIR }, uSunC: { value: new T.Color(1, .85, .6) }, uZ: OWU.uSkyZ, uH: OWU.uSkyH, uTint: { value: new T.Color(tint) } }),
    vertexShader: TERR_PARS + 'varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){ vec4 tWP = modelMatrix * vec4(position, 1.); vW = tWP.xyz; vec4 mvPosition = viewMatrix * tWP; gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: TERR_PARS.replace(/vec4 terr[\s\S]*$/, '') + `uniform float uTime, uLv; uniform vec3 uSun, uSunC, uZ, uH, uTint; varying vec3 vW;
      #include <fog_pars_fragment>
      float wh(vec2 p){ return sin(p.x * .9 + uTime * 1.3) * .3 + sin(p.y * 1.3 - uTime * 1.1 + p.x * .4) * .25 + sin((p.x + p.y) * 2.7 + uTime * 2.4) * .1 + sin((p.x * .7 - p.y) * 5.1 - uTime * 3.1) * .05; }
      void main(){
        float depth = uLv - tH(vW.xz);
        vec2 e = vec2(.08, 0.); float h0 = wh(vW.xz), hx = wh(vW.xz + e.xy), hz = wh(vW.xz + e.yx);
        vec3 n = normalize(vec3((h0 - hx) * .5, 1., (h0 - hz) * .5));
        vec3 v = normalize(cameraPosition - vW); float fr = .02 + .98 * pow(1. - max(dot(n, v), 0.), 5.);
        vec3 r = reflect(-v, n); vec3 sky = mix(uH, uZ, smoothstep(0., .5, r.y));
        float sp = pow(max(dot(r, uSun), 0.), 380.) * 6. + pow(max(dot(r, uSun), 0.), 28.) * .25;
        vec3 deepC = uTint * .25, shalC = uTint * .9 + vec3(.05, .08, .06);
        vec3 body = mix(shalC, deepC, smoothstep(0., 4.5, depth));
        vec3 c = mix(body, sky, fr) + uSunC * sp;
        float foam = smoothstep(.45, 0., depth) * (.55 + .45 * sin(vW.x * 3. + vW.z * 2. + uTime * 2.)) + smoothstep(.12, 0., depth) * .5;
        c = mix(c, vec3(.92, .95, .93), clamp(foam, 0., 1.) * .7);
        float a = clamp(mix(.25, .95, smoothstep(0., 2.5, depth)) + fr * .4 + foam * .5, 0., 1.) * smoothstep(-.05, .06, depth);
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
  });
}
/* 飞瀑：顺着崖面的一条水带，竖向流动的白练 */
function owFallMat() {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, defines: { NO_TERR: '' }, uniforms: { uTime: GFX.time },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vec2(vUv.x * 14., vUv.y * 9. + uTime * 2.6);
        float s = n(p) * .6 + n(p * 2.3 + 4.) * .3 + n(vec2(vUv.x * 40., vUv.y * 3. + uTime * 3.4)) * .4;
        float edge = smoothstep(0., .18, vUv.x) * smoothstep(1., .82, vUv.x);
        vec3 c = mix(vec3(.55, .68, .7), vec3(.97, .99, 1.), smoothstep(.35, .85, s));
        float a = (.42 + .5 * s) * edge * smoothstep(1., .96, vUv.y);
        a = max(a, smoothstep(.1, 0., vUv.y) * .9 * edge);
        gl_FragColor = vec4(c, a);
      }`,
  });
}
