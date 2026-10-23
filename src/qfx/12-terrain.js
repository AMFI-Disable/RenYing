/* ---------------- 地形起伏：玩法始终在 y=0 平面上算，渲染时每个顶点按高度图抬起 ----------------
   人物、特效、预警圈、阴影全走同一套着色器补丁，所以爬坡下谷不用改任何战斗代码。
   擂台地图关掉高度图（uHMp.w = 0），一切照旧。 */
const TERR = {
  on: false, N: 2, cell: 1, x0: 0, z0: 0, h: new Float32Array(4), sdf: null,
  U: { uHM: { value: null }, uHMp: { value: new T.Vector4(0, 0, 1, 0) }, uHMn: { value: new T.Vector2(2, .5) } },
};
/* 高度雾 + 逆光：x 雾底高度，y 随高度变稀的速率，z 未用，w 太阳染雾强度；uCamP 是镜头位置（three 只给部分材质传 cameraPosition） */
const FOGX = { U: { uCamP: { value: new V3() }, uFogH: { value: new T.Vector4(0, 0, 0, 0) }, uFogSun: { value: SUN_DIR }, uFogSunC: { value: new T.Color(1, .8, .6) } } };
function terrU(sh) { Object.assign(sh.uniforms, TERR.U, FOGX.U); }

const TERR_PARS = `#define TERR_PARS_OK
uniform sampler2D uHM; uniform vec4 uHMp; uniform vec2 uHMn; uniform vec3 uCamP;
float tHs(vec2 g){ return texture2D(uHM, (g + .5) * uHMn.y).r; }
float tH(vec2 p){
  if (uHMp.w < .5) return 0.;
  vec2 g = clamp((p - uHMp.xy) * uHMp.z, vec2(0.), vec2(uHMn.x - 1.001)); vec2 i = floor(g), f = g - i;
  return mix(mix(tHs(i), tHs(i + vec2(1., 0.)), f.x), mix(tHs(i + vec2(0., 1.)), tHs(i + vec2(1., 1.)), f.x), f.y);
}
vec4 terrW(vec3 p){ vec4 w = modelMatrix * vec4(p, 1.); w.y += tH(w.xz); return w; }
vec4 terrMV(vec3 p){ return viewMatrix * terrW(p); }
`;
(function patchChunks() {
  const C = T.ShaderChunk;
  C.clipping_planes_pars_vertex = TERR_PARS + C.clipping_planes_pars_vertex;
  /* 实例（树、石、草）整棵抬起不变形；其余逐顶点贴地 */
  C.project_vertex = `vec4 tWP = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  tWP = instanceMatrix * tWP;
#endif
tWP = modelMatrix * tWP;
#if defined( TERR_PARS_OK ) && !defined( NO_TERR )
  #if defined( USE_INSTANCING ) && !defined( TERR_VERT )
    tWP.y += tH( ( modelMatrix * vec4( instanceMatrix[3].xyz, 1. ) ).xz );
  #elif defined( TERR_RIGID )
    tWP.y += tH( modelMatrix[3].xz );
  #else
    tWP.y += tH( tWP.xz );
  #endif
#endif
vec4 mvPosition = viewMatrix * tWP;
gl_Position = projectionMatrix * mvPosition;`;
  C.worldpos_vertex = `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP )
  vec4 worldPosition = tWP;
#endif`;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float fogDepth; varying vec3 vFogW;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n fogDepth = - mvPosition.z; vFogW = tWP.xyz;\n#endif';
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float fogDepth; varying vec3 vFogW;
  uniform vec4 uFogH; uniform vec3 uFogSun, uFogSunC;
  #ifndef TERR_PARS_OK
    uniform vec3 uCamP;
  #endif
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
  /* 沿视线积分的指数高度雾：谷底浓、峰顶淡；朝太阳看时雾被染成暖色 */
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogK = fogDensity * fogDepth; fogK *= fogK;
  #else
    float fogK = smoothstep( fogNear, fogFar, fogDepth ) * 3.;
  #endif
  float hk = 1.;
  if ( uFogH.y > 0. ) {
    float yc = uCamP.y - uFogH.x, yp = vFogW.y - uFogH.x, dy = yp - yc;
    float a = exp( -uFogH.y * max( yc, -30. ) ), b = exp( -uFogH.y * max( yp, -30. ) );
    hk = abs( dy ) > .05 ? ( a - b ) / ( uFogH.y * dy ) : a; hk = clamp( hk, 0., 4. );
  }
  float fogFactor = 1.0 - exp( - fogK * hk );
  vec3 fogV = normalize( vFogW - uCamP );
  vec3 fogC = mix( fogColor, uFogSunC, pow( max( dot( fogV, uFogSun ), 0. ), 6. ) * uFogH.w );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
#endif`;
  const S = T.ShaderLib.sprite;
  S.vertexShader = S.vertexShader.replace('vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );', `vec4 tWP = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  #if !defined( NO_TERR )
    tWP.y += tH( tWP.xz );
  #endif
  vec4 mvPosition = viewMatrix * tWP;`);
  /* 所有材质编译前都挂上高度图与雾的 uniform；自带 onBeforeCompile 的材质自己调 terrU */
  T.Material.prototype.onBeforeCompile = function (sh) { terrU(sh); };
})();

/* 装一张高度图：h 为 N×N 浮点（行优先，z 为行），cell 米一格，(x0,z0) 为第 0 格的世界坐标；ex 为每格三个附加量（草密度、秋色、枯色） */
TERR.set = (h, N, cell, x0, z0, ex) => {
  Object.assign(TERR, { h, N, cell, x0, z0, on: true });
  const d = new Float32Array(N * N * 4); for (let i = 0; i < N * N; i++) { d[i * 4] = h[i]; if (ex) { d[i * 4 + 1] = ex[i * 3]; d[i * 4 + 2] = ex[i * 3 + 1]; d[i * 4 + 3] = ex[i * 3 + 2]; } }
  if (TERR.tex) TERR.tex.dispose();
  const t = TERR.tex = new T.DataTexture(d, N, N, T.RGBAFormat, T.FloatType); t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
  TERR.U.uHM.value = t; TERR.U.uHMp.value.set(x0, z0, 1 / cell, 1); TERR.U.uHMn.value.set(N, 1 / N);
};
TERR.off = () => { TERR.on = false; TERR.sdf = null; TERR.U.uHMp.value.w = 0; FOGX.U.uFogH.value.set(0, 0, 0, 0); };
/* 与着色器完全一致的双线性采样 */
function gH(x, z) {
  if (!TERR.on) return 0; const N = TERR.N, h = TERR.h;
  let gx = (x - TERR.x0) / TERR.cell, gz = (z - TERR.z0) / TERR.cell; gx = clamp(gx, 0, N - 1.001); gz = clamp(gz, 0, N - 1.001);
  const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * N + ix;
  return lerp(lerp(h[i], h[i + 1], fx), lerp(h[i + N], h[i + N + 1], fx), fz);
}
/* 坡面法线（世界） */
function gN(x, z, out) { const e = TERR.cell * .5; return out.set(gH(x - e, z) - gH(x + e, z), 2 * e, gH(x, z - e) - gH(x, z + e)).normalize(); }
/* 可走区域的有向距离场：正值 = 在禁区里（陡坡、深水、界外），按梯度推出去 */
function sdfAt(x, z) {
  const S = TERR.sdf; if (!S) return -99; const N = S.N;
  let gx = (x - S.x0) / S.cell, gz = (z - S.z0) / S.cell; if (gx < 0 || gz < 0 || gx >= N - 1 || gz >= N - 1) return 99;
  const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * N + ix, d = S.d;
  return lerp(lerp(d[i], d[i + 1], fx), lerp(d[i + N], d[i + N + 1], fx), fz);
}
function terrPush(p, rad) {
  if (!TERR.sdf) return;
  for (let k = 0; k < 3; k++) {
    const d = sdfAt(p.x, p.z) + rad; if (d <= 0) return;
    const e = .6, gx = sdfAt(p.x + e, p.z) - sdfAt(p.x - e, p.z), gz = sdfAt(p.x, p.z + e) - sdfAt(p.x, p.z - e), l = Math.hypot(gx, gz);
    if (l < 1e-5) return; p.x -= gx / l * (d + .02); p.z -= gz / l * (d + .02);
  }
}
