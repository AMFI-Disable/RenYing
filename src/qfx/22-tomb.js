/* ---------------- 第三章 · 剑冢：绝顶之上，万剑埋骨 ---------------- */
function tombH(x, z) {
  const r = Math.hypot(x, z), n = noise2(x * .15 + 3, z * .15 - 1);
  if (r < 45.5) return 0;
  if (r < 52) return sstep(45.5, 49, r) * (.4 + 1.2 * n);
  return lerp(.4 + 1.2 * n, -78 - 12 * fbm(x * .02, z * .02, 3), sstep(52, 76, r + 8 * (n - .5)));
}
/* 若干方块 / 柱体合成一块带顶点色的几何（剑、碑座之类的小件） */
function mergeParts(parts) {
  const pos = [], nor = [], col = [], m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sc = new V3();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); e.set(p.r ? p.r[0] : 0, p.r ? p.r[1] : 0, p.r ? p.r[2] : 0); q.setFromEuler(e); sc.set(p.s ? p.s[0] : 1, p.s ? p.s[1] : 1, p.s ? p.s[2] : 1);
    m.compose(new V3(p.p[0], p.p[1], p.p[2]), q, sc); g.applyMatrix4(m); const pa = g.attributes.position, na = g.attributes.normal;
    for (let i = 0; i < pa.count; i++) { pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i)); col.push(p.c[0], p.c[1], p.c[2]); }
    g.dispose();
  }
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new T.Float32BufferAttribute(col, 3)); return out;
}
/* 一柄插在地上的剑：护手在 y=0，剑身向下，剑柄向上 */
function swordGeo(broken) {
  const L = broken ? .55 : 1.0, steel = [.62, .63, .64], bronze = [.42, .3, .18], grip = [.28, .1, .08];
  const parts = [
    { geo: new T.CylinderGeometry(.024, .03, L - .12, 4), p: [0, -(L - .12) / 2, 0], s: [1.7, 1, .32], c: steel },
    { geo: new T.BoxGeometry(.24, .04, .06), p: [0, .01, 0], c: bronze },
    { geo: new T.CylinderGeometry(.02, .022, .22, 6), p: [0, .14, 0], c: grip },
    { geo: new T.IcosahedronGeometry(.035, 0), p: [0, .27, 0], c: bronze },
  ];
  if (!broken) parts.push({ geo: new T.ConeGeometry(.03, .14, 4), p: [0, -(L - .12) - .07, 0], r: [PI, 0, 0], s: [1.7, 1, .32], c: steel });
  else parts.push({ geo: new T.ConeGeometry(.03, .06, 4), p: [0, -(L - .12) - .03, 0], r: [PI, .4, .3], s: [1.7, 1, .32], c: steel });
  return mergeParts(parts);
}
/* 巨剑：剑身六棱带脊，护手两翼下垂，剑柄缠绳，剑首圆环；剑身长约 1，护手在 y=0 */
function giantSwordGeo() {
  const steel = [.1, .1, .11], bronze = [.19, .11, .05], grip = [.06, .022, .018], wrap = [.11, .045, .03];
  const parts = [
    { geo: new T.CylinderGeometry(.075, .056, .9, 6), p: [0, -.45, 0], s: [.26, 1, 1], c: steel },
    { geo: new T.ConeGeometry(.056, .12, 6), p: [0, -.96, 0], r: [PI, 0, 0], s: [.26, 1, 1], c: steel },
    { geo: new T.BoxGeometry(.07, .05, .2), p: [0, .02, 0], c: bronze },
    { geo: new T.BoxGeometry(.05, .034, .13), p: [0, -.005, .14], r: [.5, 0, 0], c: bronze },
    { geo: new T.BoxGeometry(.05, .034, .13), p: [0, -.005, -.14], r: [-.5, 0, 0], c: bronze },
    { geo: new T.IcosahedronGeometry(.026, 0), p: [0, -.04, .195], c: bronze },
    { geo: new T.IcosahedronGeometry(.026, 0), p: [0, -.04, -.195], c: bronze },
    { geo: new T.CylinderGeometry(.022, .027, .26, 8), p: [0, .185, 0], c: grip },
    { geo: new T.TorusGeometry(.042, .013, 6, 14), p: [0, .36, 0], r: [0, PI / 2, 0], c: bronze },
  ];
  for (let k = 0; k < 5; k++) parts.push({ geo: new T.CylinderGeometry(.03, .03, .016, 8), p: [0, .085 + k * .048, 0], c: wrap });
  return mergeParts(parts);
}
/* 剑身铭文：黑底亮字竖排，自护手往下刻，当自发光贴图用 */
function texRunes(text) {
  const w = 64, h = 1024, c = makeCanvas(w, h), g = c.getContext('2d'), n = text.length, step = Math.min(h / (n + .6), 128);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 6;
  g.font = `${w * .8 | 0}px "Ma Shan Zheng","STKaiti","KaiTi",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) g.fillText(text[i], w / 2, 70 + step * i);
  return c;
}
/* 剑冢地面：焦土、铁锈、灰烬，越近祭台裂纹越亮 */
function texTombGround(S, span) {
  const c = makeCanvas(S, S), g = c.getContext('2d'), h = S / 2, c2 = makeCanvas(h, h), g2 = c2.getContext('2d'), img = g2.createImageData(h, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
    const wx = (x / h - .5) * span, wz = (y / h - .5) * span, n = fbm(wx * .07, wz * .07, 3), n2 = noise2(wx * .8, wz * .8), rust = sstep(.55, .72, fbm(wx * .05 + 9, wz * .05, 3)), ash = sstep(.6, .75, fbm(wx * .06 - 4, wz * .06 + 2, 3)), sh = .8 + .32 * n2;
    let r = lerp(62, 96, n) * sh, gg = lerp(52, 80, n) * sh, b = lerp(48, 72, n) * sh;
    r = lerp(r, 118 * sh, rust * .6); gg = lerp(gg, 64 * sh, rust * .6); b = lerp(b, 44 * sh, rust * .6);
    r = lerp(r, 138 * sh, ash * .55); gg = lerp(gg, 130 * sh, ash * .55); b = lerp(b, 124 * sh, ash * .55);
    const i = (y * h + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g2.putImageData(img, 0, 0); g.drawImage(c2, 0, 0, S, S);
  const e = makeCanvas(S, S), ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const rng = mulberry(77), W = v => (v / span + .5) * S;
  // 裂纹：从祭台向外蔓延
  for (let k = 0; k < 46; k++) {
    let a = rng() * TAU, r = 9 + rng() * 6, x = Math.cos(a) * r, z = Math.sin(a) * r; const len = 8 + rng() * 26, glow = rng() < .6;
    g.strokeStyle = 'rgba(10,8,8,.75)'; ge.strokeStyle = 'rgba(255,90,40,.9)'; g.lineWidth = 2.2; ge.lineWidth = 1.6; g.beginPath(); ge.beginPath(); g.moveTo(W(x), W(z)); ge.moveTo(W(x), W(z));
    for (let s = 0; s < len; s += .8) { a += (rng() - .5) * .7; x += Math.cos(a) * .8; z += Math.sin(a) * .8; g.lineTo(W(x), W(z)); ge.lineTo(W(x), W(z)); if (rng() < .08) { g.lineWidth = Math.max(.8, g.lineWidth * .8); } }
    g.stroke(); if (glow) { ge.globalAlpha = Math.max(.15, 1 - r / 20); ge.stroke(); ge.globalAlpha = 1; }
  }
  // 散落的断刃
  for (let i = 0; i < 900; i++) { const x = rng() * S, y = rng() * S, a = rng() * PI, l = 3 + rng() * 6; g.strokeStyle = `rgba(${150 + rng() * 40 | 0},${150 + rng() * 40 | 0},${150 + rng() * 40 | 0},${.25 + rng() * .3})`; g.lineWidth = 1 + rng(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  for (let i = 0; i < 16000; i++) { g.fillStyle = rng() < .5 ? 'rgba(0,0,0,.14)' : 'rgba(255,230,220,.05)'; g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2); }
  return { c, e };
}
/* 祭台：八剑朝心的剑阵，阵纹发红光 */
function texAltar(S) {
  const c = makeCanvas(S, S), g = c.getContext('2d'), e = makeCanvas(S, S), ge = e.getContext('2d'), R = S / 2, rng = mulberry(31);
  g.fillStyle = '#4a4744'; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S); g.save(); ge.save(); g.translate(R, R); ge.translate(R, R);
  // 石板纹
  for (let ring = 0; ring < 6; ring++) { const a0 = ring * 80 + 40, a1 = a0 + 80, n = 8 + ring * 6; for (let i = 0; i < n; i++) { const t0 = i / n * TAU + ring, t1 = (i + 1) / n * TAU + ring, v = 58 + rng() * 26; g.fillStyle = `rgb(${v + 4 | 0},${v | 0},${v - 3 | 0})`; g.beginPath(); g.arc(0, 0, Math.min(R, a1) - 2, t0 + .01, t1 - .01); g.arc(0, 0, a0 + 2, t1 - .01, t0 + .01, true); g.closePath(); g.fill(); } }
  const both = f => { f(g, 'rgba(18,14,14,.85)'); f(ge, 'rgba(255,80,36,1)'); };
  both((x, col) => { x.strokeStyle = col; x.lineWidth = 7; x.beginPath(); x.arc(0, 0, R - 14, 0, TAU); x.stroke(); x.lineWidth = 4; x.beginPath(); x.arc(0, 0, R * .62, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, R * .24, 0, TAU); x.stroke(); });
  // 八柄剑
  for (let i = 0; i < 8; i++) both((x, col) => { x.save(); x.rotate(i / 8 * TAU); x.fillStyle = col; x.beginPath(); x.moveTo(-9, -R * .9); x.lineTo(9, -R * .9); x.lineTo(7, -R * .34); x.lineTo(0, -R * .27); x.lineTo(-7, -R * .34); x.closePath(); x.fill(); x.fillRect(-26, -R * .9 - 6, 52, 10); x.fillRect(-5, -R * .97, 10, R * .07); x.restore(); });
  // 符文
  for (let i = 0; i < 32; i++) both((x, col) => { x.save(); x.rotate(i / 32 * TAU + .1); x.translate(0, -R * .78); x.strokeStyle = col; x.lineWidth = 3; const r2 = mulberry(i + 5); x.beginPath(); for (let k = 0; k < 4; k++) { x.moveTo((r2() - .5) * 26, (r2() - .5) * 26); x.lineTo((r2() - .5) * 26, (r2() - .5) * 26); } x.stroke(); x.restore(); });
  both((x, col) => { x.fillStyle = col; x.font = `${R * .3}px "Ma Shan Zheng","STKaiti","KaiTi",serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('冢', 0, 6); });
  for (let i = 0; i < 9000; i++) { const a = rng() * TAU, r = Math.sqrt(rng()) * R; g.fillStyle = rng() < .5 ? 'rgba(0,0,0,.12)' : 'rgba(255,240,230,.06)'; g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 1 + rng() * 2.5, 1 + rng() * 2.5); }
  g.restore(); ge.restore(); return { c, e };
}
/* 墓碑碑面 */
function texTablet(text, seed) {
  const w = 128, h = 256, c = makeCanvas(w, h), g = c.getContext('2d'), rng = mulberry(seed);
  g.fillStyle = '#5a5652'; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { g.fillStyle = rng() < .5 ? 'rgba(0,0,0,.12)' : 'rgba(255,250,240,.06)'; g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3); }
  g.strokeStyle = 'rgba(20,18,18,.6)'; g.lineWidth = 4; g.strokeRect(9, 9, w - 18, h - 18); g.fillStyle = '#1d1a1a'; g.font = `${w * .3}px "Ma Shan Zheng","STKaiti","KaiTi",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = text.length; for (let i = 0; i < n; i++) g.fillText(text[i], w / 2, h * (.5 + (i - (n - 1) / 2) * (.8 / Math.max(n, 3)))); return c;
}

function buildTomb(scene) {
  const rng = mulberry(20261023), R2 = (a, b) => a + rng() * (b - a), R = World.R;
  const q = new T.Quaternion(), e = new T.Euler(), v = new V3(), UPV = new V3(0, 1, 0), C = (h, s, l) => new T.Color().setHSL(h, s, l);
  const addCol = (x, z, r) => World.colliders.push({ x, z, r });
  const shadowAll = g => g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  /* 地形：台地边缘之外是断崖 */
  const tg = new T.PlaneGeometry(900, 900, 200, 200); tg.rotateX(-PI / 2);
  const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i), hh = tombH(x, z); tp.setY(i, hh - (Math.hypot(x, z) < 45 ? .2 : 0)); const n = fbm(x * .04, z * .04, 3), deep = sstep(0, -40, hh); tc[i * 3] = lerp(lerp(.075, .12, n), .035, deep); tc[i * 3 + 1] = lerp(lerp(.058, .085, n), .02, deep); tc[i * 3 + 2] = lerp(lerp(.052, .075, n), .025, deep); }
  tg.setAttribute('color', new T.BufferAttribute(tc, 3)); tg.computeVertexNormals();
  const terr = new T.Mesh(tg, stdMat(0xffffff, { vc: true, rough: 1, flat: true })); terr.receiveShadow = true; scene.add(terr);
  const gt = texTombGround(1024, 112), gtex = canvasTex(gt.e);
  const inner = new T.Mesh(new T.CircleGeometry(48, 96).rotateX(-PI / 2), stdMat(0xffffff, { map: canvasTex(gt.c), normalMap: canvasTex(normalFromCanvas(gt.c, 1.8), false), ns: .7, rough: .95, emissive: 0xff4a22, ei: .9 }));
  inner.material.emissiveMap = gtex; inner.geometry.attributes.uv.array.forEach((u, i, arr) => { arr[i] = (u - .5) * (96 / 112) + .5; }); inner.position.y = .01; inner.receiveShadow = true; scene.add(inner);
  const at = texAltar(1024), altarTex = canvasTex(at.e);
  const altar = new T.Mesh(new T.CircleGeometry(10.2, 96).rotateX(-PI / 2), stdMat(0xffffff, { map: canvasTex(at.c), normalMap: canvasTex(normalFromCanvas(at.c, 2.4), false), ns: 1, rough: .85, emissive: 0xff4a22, ei: 1.2 }));
  altar.material.emissiveMap = altarTex; altar.position.y = .05; altar.receiveShadow = true; scene.add(altar);
  World.runes = [{ m: inner.material, k: .9 }, { m: altar.material, k: 1.25 }];
  // 祭台石沿：一圈条石环在台面外侧，侧面一道矮边
  const curbM = stdMat(0x1c1918, { rough: .9, flat: true });
  mesh(new T.RingGeometry(10.2, 10.7, 96, 1).rotateX(-PI / 2), curbM, 0, .05, 0, scene).receiveShadow = true;
  mesh(cylG(10.7, 10.85, .12, 96, true), curbM, 0, -.01, 0, scene).receiveShadow = true;

  /* 云海与远峰 */
  const sea = new T.Mesh(new T.CircleGeometry(1000, 64).rotateX(-PI / 2), new T.ShaderMaterial({ fog: false, depthWrite: true, uniforms: { uTime: GFX.time, uSun: { value: SUN_DIR }, uLit: { value: new T.Color(.62, .2, .12) }, uDark: { value: new T.Color(.08, .03, .045) }, uHor: { value: new T.Color(.4, .1, .07) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; uniform float uTime; uniform vec3 uSun, uLit, uDark, uHor;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+vec2(3.1,1.7); a*=.5; } return s; }
      void main(){ vec2 p = vW.xz * .012 + vec2(uTime * .01, uTime * .004); float c = fbm(p), c2 = fbm(p * 2.6 + 7.);
        float lit = pow(max(dot(normalize(vW.xz), normalize(uSun.xz)), 0.), 2.);
        vec3 col = mix(uDark, uLit, smoothstep(.38, .78, c * .7 + c2 * .3) * (.3 + .7 * lit));
        col = mix(col, uHor, smoothstep(180., 700., length(vW.xz)));
        gl_FragColor = vec4(col, 1.); }` }));
  sea.position.y = -52; sea.renderOrder = -4; scene.add(sea);
  farMountains(scene, [[360, 30, 120, 0x080203, 41], [520, 70, 190, 0x120405, 53], [700, 110, 260, 0x1c0606, 67]], 0x2a0806);
  const peakMat = stdMat(0xffffff, { vc: true, flat: true, rough: 1 });
  const moonA = Math.atan2(SUN_DIR.z, SUN_DIR.x);
  for (let i = 0; i < 22; i++) {
    const a = R2(0, TAU), rad = R2(105, 380); if (Math.abs(Math.atan2(Math.sin(a - moonA), Math.cos(a - moonA))) < .3) continue;
    const hh = R2(60, 175), rb = R2(8, 19), sd = R2(0, 50), lx = R2(-.14, .14), lz = R2(-.14, .14);
    const g = new T.CylinderGeometry(rb * R2(.3, .55), rb, hh, 11, 18), p = g.attributes.position, cl = new Float32Array(p.count * 3);
    for (let j = 0; j < p.count; j++) {
      const x = p.getX(j), y = p.getY(j), z = p.getZ(j), up = y + hh / 2, t = up / hh, an = Math.atan2(z, x);
      const n = fbm(Math.cos(an) * 1.4 + sd, Math.sin(an) * 1.4 + y * .03, 4), k = (.5 + n) * (1 + .2 * Math.max(0, Math.sin(y * .12 + sd + n * 5)));
      p.setXYZ(j, x * k + lx * up, y, z * k + lz * up);
      const l = lerp(.03, .16, t * t) * (.75 + .5 * n); cl[j * 3] = l; cl[j * 3 + 1] = l * .42; cl[j * 3 + 2] = l * .4;
    }
    g.setAttribute('color', new T.BufferAttribute(cl, 3)); g.computeVertexNormals(); mesh(g, peakMat, Math.cos(a) * rad, -60 + hh / 2, Math.sin(a) * rad, scene);
  }

  /* 满地剑 */
  const swords = [new Batch(swordGeo(false), stdMat(0xffffff, { vc: true, metal: .55, rough: .45, flat: true })), new Batch(swordGeo(true), stdMat(0xffffff, { vc: true, metal: .55, rough: .5, flat: true }))];
  const sword = (x, z, y0 = 0, big = 1) => { e.set(R2(-.42, .42), R2(0, TAU), R2(-.42, .42)); const s = R2(.85, 1.25) * big, rust = R2(.55, 1); swords[rng() < .3 ? 1 : 0].add(new V3(x, y0 + R2(.25, .65) * s, z), new T.Quaternion().setFromEuler(e), new V3(s, s, s), new T.Color(rust * 1.05, rust * .86, rust * .76)); };
  const graves = [[-16, -12, 2.4], [18, -9, 2.0], [-21, 15, 2.2], [14, 21, 2.6], [-6, 31, 1.8], [30, 9, 1.9], [-32, -4, 2.0], [4, -27, 2.2], [24, -27, 1.8], [-25, -28, 2.3]];
  for (const [gx, gz, gr] of graves) { const n = 18 + (rng() * 14 | 0); for (let i = 0; i < n; i++) { const a = R2(0, TAU), r = Math.sqrt(rng()) * gr; sword(gx + Math.cos(a) * r, gz + Math.sin(a) * r); } addCol(gx, gz, gr + .1); }
  for (let i = 0; i < 70; i++) { const a = R2(0, TAU), r = R2(14, 44), x = Math.cos(a) * r, z = Math.sin(a) * r; sword(x, z); }
  for (let i = 0; i < 1400; i++) { const a = R2(0, TAU), r = R + .8 + Math.pow(rng(), 1.3) * 10, x = Math.cos(a) * r, z = Math.sin(a) * r; sword(x, z, tombH(x, z) - .05); }
  for (const b of swords) b.build(scene);

  /* 巨剑：插在台地外缘的断崖上，北面一柄最大；剑面朝向台心，两面刻着发光的符 */
  const giantMat = stdMat(0xffffff, { vc: true, metal: .35, rough: .55, flat: true }), gGeo = giantSwordGeo();
  const runeG = new T.PlaneGeometry(.045, .72), runeMats = ['一剑霜寒十四州', '万剑同悲'].map(t => { const m = stdMat(0x18181a, { metal: .35, rough: .55, emissive: 0xff3a14, ei: 2.2 }); m.emissiveMap = canvasTex(texRunes(t)); World.runes.push({ m, k: 2.2 }); return m; });
  // [x, z, 尺寸, 护手高, 扭转, 侧倾, 前倾（负值压向台地）]
  const giants = [[0, -57, 52, 24, 0, .05, -.1], [-40, -40, 34, 16, .3, -.14, .05], [44, -34, 36, 17, -.25, .16, -.06], [-56, 12, 30, 14, .4, .2, .08], [54, 19, 34, 16, -.35, -.15, -.12], [-26, 51, 28, 13, .2, .12, .1], [29, 50, 30, 14, -.3, -.18, -.05]];
  World.giants = []; const feet = [], guards = [], tip = new V3();
  for (const [x, z, s, gy, tw, side, lean] of giants) {
    const g = group(x, gy - s * .6, z, scene); g.rotation.set(side, Math.atan2(x, z) + PI / 2 + tw, lean, 'YXZ');
    const sg = group(0, s * .6, 0, g); sg.scale.setScalar(s); mesh(gGeo, giantMat, 0, 0, 0, sg);
    for (const sgn of [1, -1]) { const rp = mesh(runeG, runeMats[guards.length ? 1 : 0], sgn * .0168, -.42, 0, sg); rp.rotation.y = sgn * PI / 2; }
    // 剑尖至少埋进岩里两米；再沿剑身往下找入岩处，堆些碎石
    g.updateMatrixWorld(true); sg.localToWorld(tip.set(0, -1.02, 0)); const dy = tip.y - (tombH(tip.x, tip.z) - 2); if (dy > 0) { g.position.y -= dy; g.updateMatrixWorld(true); }
    for (let t = 0; t < 1.02; t += .02) { sg.localToWorld(tip.set(0, -t, 0)); if (tip.y < tombH(tip.x, tip.z)) { feet.push([tip.x, tip.z, s]); break; } }
    guards.push(sg.localToWorld(new V3(0, .02, 0))); shadowAll(g); World.giants.push(sg);
  }
  /* 北面巨剑剑首垂下的红穗，被风吹向台地 */
  const ribG = new T.PlaneGeometry(1.2, 9, 1, 20); ribG.translate(0, -4.5, 0); const rib0 = Float32Array.from(ribG.attributes.position.array);
  const rib = mesh(ribG, stdMat(0x7a0a08, { side: T.DoubleSide, rough: .8, emissive: 0x2a0303 }), 0, 0, 0, scene); rib.position.copy(World.giants[0].localToWorld(new V3(0, .36, .05))); rib.castShadow = true;
  /* 锁链：巨剑护手之间两两相连，南面留一道口 */
  { const linkG = new T.TorusGeometry(.55, .13, 6, 10), lm = stdMat(0x2a2422, { metal: .6, rough: .5 }), links = [new Batch(linkG, lm), new Batch(linkG, lm)], X = new V3(1, 0, 0), qx = new T.Quaternion().setFromAxisAngle(X, PI / 2), d = new V3(), sc = new V3(1.35, 1, 1);
    const chain = (a, b, sag) => { const n = Math.ceil(a.distanceTo(b) / .95);
      for (let i = 0; i <= n; i++) { const t = i / n, p = new V3().lerpVectors(a, b, t); p.y -= Math.sin(PI * t) * sag; d.subVectors(b, a); d.y -= PI * Math.cos(PI * t) * sag; d.normalize();
        const qq = new T.Quaternion().setFromUnitVectors(X, d); if (i % 2) qq.multiply(qx); links[i % 2].add(p, qq, sc, null); } };
    chain(guards[0], guards[1], 9); chain(guards[0], guards[2], 9); chain(guards[1], guards[3], 8); chain(guards[2], guards[4], 8); chain(guards[3], guards[5], 8); chain(guards[4], guards[6], 8);
    for (const b of links) b.build(scene); }

  /* 墓碑 */
  const names = ['无名剑客之墓', '断水剑主', '青霜埋骨', '葬剑于此', '天涯孤客', '三尺青锋', '剑痴', '孤鸿'];
  const tabGeo = new T.BoxGeometry(.8, 1.5, .18); tabGeo.translate(0, .6, 0);
  const tabs = names.slice(0, 4).map((n, i) => new Batch(tabGeo, stdMat(0xffffff, { map: canvasTex(texTablet(n, i + 1)), rough: .92 })));
  const tablet = (x, z, ry, y0 = 0) => { e.set(R2(-.18, .18), ry, R2(-.18, .18)); const s = R2(.85, 1.25); tabs[(rng() * 4) | 0].add(new V3(x, y0, z), new T.Quaternion().setFromEuler(e), new V3(s, s, s), null); };
  for (const [gx, gz, gr] of graves) { const a = Math.atan2(-gx, -gz); tablet(gx + Math.sin(a) * (gr + .3), gz + Math.cos(a) * (gr + .3), a); }
  for (let i = 0; i < 36; i++) { const a = R2(0, TAU), r = R2(R + 1, R + 7), x = Math.cos(a) * r, z = Math.sin(a) * r; tablet(x, z, -a + PI / 2 + R2(-.4, .4), tombH(x, z) - .1); }
  for (const t of tabs) t.build(scene);

  /* 断栏：台地边缘的残破石栏 */
  { const bal = new Batch(boxG(1, 1, 1), stdMat(0xffffff, { rough: .95, flat: true })), n = 150;
    for (let i = 0; i < n; i++) { const a = i / n * TAU, x = Math.cos(a) * (R + 1.2), z = Math.sin(a) * (R + 1.2), y0 = tombH(x, z); if (fbm(x * .07, z * .07, 2) > .58) continue; const l = R2(.11, .16);
      e.set(0, -a + PI / 2, 0); const qq = new T.Quaternion().setFromEuler(e); if (i % 3 === 0) bal.add(new V3(x, y0 + .55, z), qq, new V3(.36, 1.1, .36), new T.Color(l, l * .95, l * .92)); if (rng() < .7) bal.add(new V3(x, y0 + .95, z), qq, new V3(1.95, .18, .2), new T.Color(l, l * .95, l * .92)); }
    for (let i = 0; i < 40; i++) { const a = R2(0, TAU), r = R2(R + .5, R + 4), x = Math.cos(a) * r, z = Math.sin(a) * r; e.set(R2(0, 1.4), R2(0, TAU), R2(0, 1.4)); const l = R2(.1, .15); bal.add(new V3(x, tombH(x, z) + .1, z), new T.Quaternion().setFromEuler(e), new V3(R2(.3, 1.6), .2, .2), new T.Color(l, l * .95, l * .92)); }
    bal.build(scene); }

  /* 枯树 */
  { const bark = new Batch(cylG(.72, 1, 1, 6), stdMat(0x1c1614, { flat: true, rough: 1 }));
    const seg = (a, b, r) => { v.subVectors(b, a); const l = v.length(); q.setFromUnitVectors(UPV, v.normalize()); bark.add(a.clone().lerp(b, .5), q.clone(), new V3(r, l, r), null); };
    const branch = (p, dir, len, r, depth) => { const end = p.clone().addScaledVector(dir, len); seg(p, end, r); if (depth <= 0) return; const nb = depth > 2 ? 2 : 3; for (let i = 0; i < nb; i++) { const d2 = dir.clone().add(new V3(R2(-.9, .9), R2(-.1, .5), R2(-.9, .9))).normalize(); branch(end, d2, len * R2(.55, .78), r * .62, depth - 1); } };
    for (let i = 0; i < 9; i++) { const a = R2(0, TAU), r = R2(R + 1.5, R + 6), x = Math.cos(a) * r, z = Math.sin(a) * r; branch(new V3(x, tombH(x, z) - .2, z), new V3(R2(-.25, .25), 1, R2(-.25, .25)).normalize(), R2(2.2, 3.4), R2(.22, .34), 4); }
    bark.build(scene); }

  /* 祭台八柱，四柱燃着青色冥火 */
  const pillarM = stdMat(0x24201f, { rough: .92, flat: true }), bowlM = stdMat(0x181514, { metal: .5, rough: .6 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + PI / 8, x = Math.cos(a) * 11.6, z = Math.sin(a) * 11.6, g = group(x, 0, z, scene);
    mesh(boxG(.9, .3, .9), pillarM, 0, .15, 0, g); mesh(cylG(.3, .38, 1.5, 6), pillarM, 0, 1.05, 0, g); mesh(cylG(.55, .3, .35, 8), bowlM, 0, 1.95, 0, g);
    shadowAll(g); addCol(x, z, .6);
    if (i % 2 === 0) { World.fires.push(new V3(x, 2.15, z)); const pl = new T.PointLight(0x46ffd0, 1.3, 15, 2); pl.position.set(x, 2.6, z); scene.add(pl); World.lamps.push(pl); }
  }

  /* 碎石 */
  { const rockGeo = new T.IcosahedronGeometry(1, 1); const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = .78 + .45 * hash2(Math.round(x * 31), Math.round(y * 17 + z * 53)); p.setXYZ(i, x * k, y * k * .7, z * k); } rockGeo.computeVertexNormals();
    const rocks = new Batch(rockGeo, stdMat(0xffffff, { flat: true, rough: .95 }));
    for (let i = 0; i < 80; i++) { const a = R2(0, TAU), r = R2(R + .5, 70), x = Math.cos(a) * r, z = Math.sin(a) * r; e.set(R2(-.3, .3), R2(0, TAU), R2(-.3, .3)); const sc = R2(.4, 2.2), l = R2(.08, .13); rocks.add(new V3(x, tombH(x, z) + sc * .2, z), new T.Quaternion().setFromEuler(e), new V3(sc, sc * R2(.6, 1), sc), new T.Color(l * 1.05, l * .92, l * .9)); }
    for (const [fx, fz, s] of feet) for (let k = 0; k < 8; k++) { const a = R2(0, TAU), r = R2(.05, .16) * s, x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r, sc = R2(.03, .07) * s, l = R2(.07, .11); e.set(R2(-.4, .4), R2(0, TAU), R2(-.4, .4)); rocks.add(new V3(x, tombH(x, z) + sc * .1, z), new T.Quaternion().setFromEuler(e), new V3(sc, sc * R2(.5, .9), sc), new T.Color(l * 1.05, l * .92, l * .9)); }
    for (const [x, z, sc] of [[-36, 22, 1.4], [37, -20, 1.6], [10, 38, 1.2], [-12, -37, 1.3]]) { rocks.add(new V3(x, sc * .3, z), null, new V3(sc, sc * .8, sc), new T.Color(.11, .095, .09)); addCol(x, z, sc); }
    rocks.build(scene); }

  /* 冥火游魂、灰烬、余烬 */
  const ash = fallingBits(scene, { n: 260, w: .07, h: .07, color: 0x5c5450, fall: .6, spin: 1.2, drift: [.5, .2], top: [6, 14] });
  const mist = mistRing(scene, { n: 12, color: 0x8a3a30, op: [.06, .12], r: [70, 160], y: [-8, 6], sx: [60, 110], sy: [12, 22] });
  const wisps = []; for (let i = 0; i < 12; i++) { const a = R2(0, TAU), r = R2(10, 52); wisps.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: R2(.6, 2.2), a: R2(0, TAU), s: R2(.6, 1.4), t: R2(0, 10) }); }
  let fireT = 0, emberT = 0;
  World.tick = (dt, t, focus) => {
    ash(dt, focus); mist(dt, t);
    const pulse = .75 + .25 * Math.sin(t * 1.3) + .1 * Math.sin(t * 3.7); for (const r of World.runes) r.m.emissiveIntensity = r.k * pulse * (World.rage || 1);
    { const pa = ribG.attributes.position; for (let j = 0; j < pa.count; j++) { const x0 = rib0[j * 3], y0 = rib0[j * 3 + 1], d = -y0 / 9, w = d * (1.6 + .7 * Math.sin(t * 1.1 + d * 2.4)), sx = d * 1.3 * Math.sin(t * 1.7 + d * 3.1) + .25 * Math.sin(t * 4.3 + d * 7);
        pa.setXYZ(j, x0 + sx, y0 + w * w * .08, w * 1.6); } pa.needsUpdate = true; ribG.computeVertexNormals(); }
    const fl = 1 + Math.sin(t * 8) * .07 + Math.sin(t * 19.3) * .05; for (const l of World.lamps) if (l.isPointLight) l.intensity = 1.3 * fl;
    fireT -= dt; if (fireT < 0) { fireT = .04; for (const f of World.fires) FX.add.emit({ x: f.x + rand(-.25, .25), y: f.y, z: f.z + rand(-.25, .25), vx: rand(-.15, .15), vy: rand(1, 2.2), vz: rand(-.15, .15), life: rand(.4, .8), s0: rand(.45, .8), s1: .05, r: .3, g: 1, b: .82, a: .85, grav: -1 }); }
    for (const w of wisps) { w.t += dt; w.a += dt * .4 * Math.sin(w.t * .3 + w.s); w.x += Math.cos(w.a) * dt * w.s; w.z += Math.sin(w.a) * dt * w.s; const r = Math.hypot(w.x, w.z); if (r > 58 || r < 9) w.a += PI * dt * 2; const y = w.y + Math.sin(w.t * 1.7) * .35; if (Math.random() < .7) FX.add.emit({ x: w.x + rand(-.08, .08), y, z: w.z + rand(-.08, .08), vx: 0, vy: rand(.2, .6), vz: 0, life: rand(.4, .8), s0: rand(.22, .36), s1: 0, r: .35, g: 1, b: .85, a: .8, grav: -.4 }); }
    emberT -= dt; if (emberT < 0) { emberT = .08; const a = rand(TAU), r = rand(3, 26); FX.add.emit({ x: focus.x + Math.cos(a) * r, y: rand(.1, .6), z: focus.z + Math.sin(a) * r, vx: rand(-.3, .3), vy: rand(.5, 1.2), vz: rand(-.3, .3), life: rand(2, 4), s0: .08, s1: .02, r: 1, g: .42, b: .18, a: .85, grav: -.15, wob: 1.6 }); }
  };
}

MAPS.tomb = {
  R: 45, spawn: [0, 28, PI], build: buildTomb,
  env: {
    fog: 0x2a1216, fogD: .0082, hemi: [0x5a3048, 0x1a0e0c, .62], sun: [0xff5a3c, 1.15], sunDir: [-.18, .3, -.94], fill: [0x5a3a9a, .32], exp: 1.06,
    sky: { uZen: [.03, .012, .03], uMid: [.16, .04, .06], uHor: [.42, .1, .07], uHor2: [.75, .2, .08], uGlow: [.4, .07, .02], uHalo: [.55, .1, .04], uDisc: [1.5, .26, .14], uDiscK: .9988,
      uCloudD: [.08, .02, .03], uCloudL: [.55, .14, .08], uCloudG: [.4, .1, .05], uCov: .42, uGround: [.12, .03, .03], uStars: .35, uMoon: 1 },
    envGrad: [[0, '#140610'], [.4, '#3a1018'], [.5, '#8a2a1a'], [.52, '#2a1210'], [1, '#0c0606']], envGlow: ['rgba(255,140,90,1)', 'rgba(220,60,30,.7)', 'rgba(160,30,20,0)'],
  },
  mini(g, P) { for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + PI / 8, p = P(Math.cos(a) * 11.6, Math.sin(a) * 11.6); g.fillStyle = i % 2 ? 'rgba(233,223,200,.4)' : 'rgba(70,255,208,.8)'; g.fillRect(p[0] - 2, p[1] - 2, 4, 4); } },
};
