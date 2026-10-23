/* ---------------- 开放世界 · 建筑：土地庙、山门、黑风寨、古寺、剑冢、竹海祭坛、寒潭栈桥 ---------------- */
function owStructures(scene, W, rng) {
  const tx = OWTex, R2 = (a, b) => a + rng() * (b - a);
  const M = OWD.M = {
    stone: owRockMat(tx, .3, 0xd8d0c4), stoneD: owRockMat(tx, .15, 0x8a847c), red: stdMat(0x8a2a20, { rough: .62 }), redD: stdMat(0x5a1c16, { rough: .75 }),
    wood: new T.MeshStandardMaterial({ map: tx.bark.map, normalMap: tx.bark.nm, color: 0xa88a6a, roughness: .9 }), tile: stdMat(0x2a3438, { rough: .55, flat: true, side: T.DoubleSide, metal: .1 }),
    gold: stdMat(0xc8962e, { rough: .35, metal: .8 }), dark: stdMat(0x1b1714, { rough: .9 }), cloth: stdMat(0x7a1a14, { rough: .95, side: T.DoubleSide }), canvas: stdMat(0x8a7a62, { rough: 1, side: T.DoubleSide }),
    glow: stdMat(0xffb060, { emissive: 0xff8a3a, ei: 2.6 }), ember: stdMat(0xff6a20, { emissive: 0xff4a10, ei: 3.2 }), teal: stdMat(0x2a6660, { rough: .7 }), bronze: stdMat(0x5a4a30, { rough: .4, metal: .85 }),
  };
  const shadowAll = g => g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const G = (x, z, ry = 0, y = 0) => { const g = group(x, y, z, scene); g.rotation.y = ry; return g; };
  const light = (x, y, z, c = 0xff9a4a, i = 1.6, r = 18, fl = true) => OWD.lightSrc.push({ x, y, z, c, i, r, fl });
  OWD.fires = []; OWD.smokes = []; OWD.ticks = [];
  /* 石灯笼 */
  const lantern = (p, x, z, s = 1) => {
    const g = group(x, 0, z, p); g.scale.setScalar(s); mesh(boxG(.8, .28, .8), M.stone, 0, .14, 0, g); mesh(cylG(.15, .2, 1.25, 8), M.stone, 0, .9, 0, g); mesh(boxG(.66, .14, .66), M.stone, 0, 1.58, 0, g);
    const gl = mesh(boxG(.4, .42, .4), M.glow, 0, 1.86, 0, g); for (const [dx, dz] of [[-.22, -.22], [.22, -.22], [-.22, .22], [.22, .22]]) mesh(boxG(.07, .44, .07), M.stone, dx, 1.86, dz, g);
    const cp = roofMesh(1.05, 1.05, .4, M.stoneD); cp.position.y = 2.06; g.add(cp); mesh(sphG(.09, 8, 6), M.stone, 0, 2.52, 0, g); shadowAll(g); gl.castShadow = false; return g;
  };
  /* 香炉（三足鼎） */
  const ding = (p, x, z, s = 1) => {
    const g = group(x, 0, z, p); g.scale.setScalar(s); const bowl = mesh(new T.SphereGeometry(.6, 16, 10, 0, TAU, PI * .45, PI * .55), M.bronze, 0, 1.15, 0, g); bowl.scale.y = .9;
    mesh(cylG(.62, .62, .1, 16, true), M.bronze, 0, 1.18, 0, g); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; const l = mesh(cylG(.06, .09, 1, 6), M.bronze, Math.cos(a) * .42, .5, Math.sin(a) * .42, g); l.rotation.z = Math.cos(a) * .15; l.rotation.x = -Math.sin(a) * .15; }
    for (const sx of [-1, 1]) { const ear = mesh(new T.TorusGeometry(.16, .035, 6, 12, PI), M.bronze, sx * .5, 1.32, 0, g); ear.rotation.y = PI / 2; }
    mesh(cylG(.5, .5, .04, 16), M.ember, 0, 1.12, 0, g); shadowAll(g); return g;
  };
  /* 土地庙：歇脚处 */
  OWD.shrineMeshes = [];
  for (const s of OW.SHRINES) {
    const toRoad = Math.atan2(-s.x * .2 + 0, -s.z * .2 + 0), g = G(s.x, s.z, s.id === 0 ? PI : toRoad);
    mesh(boxG(5.2, .4, 4.2), M.stone, 0, .2, 0, g); mesh(boxG(3.2, .3, 3), M.stone, 0, .55, -.3, g);
    mesh(boxG(3, 2.2, .3), M.stone, 0, 1.8, -1.65, g); for (const sx of [-1, 1]) { mesh(boxG(.3, 2.2, 2.6), M.stone, sx * 1.45, 1.8, -.45, g); mesh(cylG(.13, .15, 2.3, 10), M.red, sx * 1.3, 1.85, 1.05, g); }
    const rf = roofMesh(4.4, 3.8, 1.3, M.tile); rf.position.set(0, 2.9, -.3); g.add(rf); mesh(boxG(4, .2, .2), M.redD, 0, 2.95, 1.05, g);
    // 神像：一尊披巾的小石人
    mesh(cylG(.28, .4, .9, 10), M.stoneD, 0, 1.15, -1.1, g); mesh(sphG(.22, 12, 10), M.stoneD, 0, 1.75, -1.1, g); mesh(cylG(.34, .34, .08, 10), M.cloth, 0, 1.45, -1.1, g);
    ding(g, 0, 1.55, .7); lantern(g, -2.1, 1.4, .8); lantern(g, 2.1, 1.4, .8);
    // 幡
    const pole = mesh(cylG(.05, .06, 5.5, 6), M.wood, 2.6, 2.75, -1.6, g); const flag = mesh(new T.PlaneGeometry(.7, 2.6, 1, 6), M.cloth, 2.95, 3.9, -1.6, g); flag.rotation.y = PI / 2; flag.userData.flag = true;
    shadowAll(g); OWD.shrineMeshes.push(g);
    const wp = new V3(0, 0, 1.55).applyAxisAngle(new V3(0, 1, 0), g.rotation.y); OWD.fires.push({ x: s.x + wp.x, y: 1.25, z: s.z + wp.z, k: .4 }); light(s.x + wp.x, 2.2, s.z + wp.z, 0xffa050, 1.4, 14);
    owCol(s.x, s.z - 0, 1.9);
  }
  /* 山门：牌坊、照壁、试剑石、残垣 */
  {
    const c = OW.reg('shan'), g = G(c.x, c.z);
    const floor = new T.Mesh(new T.CircleGeometry(23, 64).rotateX(-PI / 2), M.stone); floor.position.y = .04; floor.receiveShadow = true; g.add(floor);
    const gate = group(0, 0, 21, g);
    for (const [x, h] of [[-8.2, 6], [-3.4, 8], [3.4, 8], [8.2, 6]]) { mesh(cylG(.42, .46, h, 12), M.red, x, h / 2, 0, gate); mesh(boxG(1.3, .9, 1.3), M.stone, x, .45, 0, gate); owCol(c.x + x, c.z + 21, .6); }
    mesh(boxG(8.2, .8, .7), M.teal, 0, 7.2, 0, gate); mesh(boxG(8.2, .6, .6), M.red, 0, 5.9, 0, gate);
    for (const sx of [-1, 1]) { mesh(boxG(5.2, .7, .6), M.teal, sx * 5.8, 5.3, 0, gate); const rf = roofMesh(6.6, 2.6, 1.1, M.tile); rf.position.set(sx * 5.8, 5.7, 0); gate.add(rf); }
    const gr = roofMesh(10.4, 3.2, 1.5, M.tile); gr.position.set(0, 7.6, 0); gate.add(gr);
    const plq = new T.Mesh(new T.PlaneGeometry(3.4, 1.25), new T.MeshStandardMaterial({ map: canvasTex(texPlaque('青云山', 400, 150)), roughness: .6, emissive: 0x3a2a10, emissiveIntensity: .5 })); plq.position.set(0, 6.55, .4); gate.add(plq);
    // 试剑石：一块巨石，一柄古剑插在当中
    const rk = new T.Mesh(owRock(77, .9), M.stone); rk.scale.set(2.6, 1.8, 2.2); rk.position.set(0, -.2, 0); g.add(rk); owCol(c.x, c.z, 2.6);
    const sw = group(.2, 3.4, 0, g); sw.rotation.z = .12; mesh(boxG(.16, 3.2, .04), stdMat(0xc8ccd0, { rough: .25, metal: .9 }), 0, 0, 0, sw); mesh(boxG(.7, .12, .16), M.gold, 0, 1.65, 0, sw); mesh(cylG(.05, .05, .7, 8), M.dark, 0, 2.05, 0, sw); mesh(sphG(.08, 8, 6), M.gold, 0, 2.45, 0, sw);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + PI / 8; if (Math.abs(Math.sin(a)) > .9 && Math.cos(a) * 0 === 0 && Math.sin(a) > 0) continue; lantern(g, Math.cos(a) * 17, Math.sin(a) * 17, 1); owCol(c.x + Math.cos(a) * 17, c.z + Math.sin(a) * 17, .55); if (i % 3 === 0) light(c.x + Math.cos(a) * 17, 2.2, c.z + Math.sin(a) * 17, 0xff9440, 1.3, 14); }
    // 残垣与倒塌的石柱
    for (let i = 0; i < 26; i++) { const a = R2(-PI * .9, -PI * .1), r = R2(26, 31), x = Math.cos(a) * r, z = Math.sin(a) * r, h = R2(.4, 2.2); const b = mesh(boxG(R2(1.6, 3.2), h, .9), M.stoneD, x, h / 2 - .1, z, g); b.rotation.y = -a + PI / 2 + R2(-.1, .1); owCol(c.x + x, c.z + z, 1.1); }
    for (let i = 0; i < 4; i++) { const a = R2(0, TAU), x = Math.cos(a) * R2(8, 14), z = Math.sin(a) * R2(8, 14) - 6; const col = mesh(cylG(.45, .5, R2(4, 7), 10), M.redD, x, .45, z, g); col.rotation.z = PI / 2; col.rotation.y = R2(0, PI); }
    shadowAll(g); floor.castShadow = false; plq.castShadow = false;
  }
  /* 黑风寨：木栅围寨、望楼、营帐、篝火、黑旗 */
  {
    const c = OW.reg('zhai'), g = G(c.x, c.z), lp = [], prof = [[.001, 6.3], [.2, 5.7], [.27, 5.4], [.27, .4], [.3, -.6]].reverse().map(p => new T.Vector2(p[0], p[1])), logG = new T.LatheGeometry(prof, 7);
    const gateA = Math.atan2(100 - c.z, -280 - c.x);
    for (let i = 0; i < 380; i++) { const a = i / 380 * TAU; if (Math.abs(angDiff(a, gateA)) < .14) continue; const r = 40 + Math.sin(a * 5) * 1.2; lp.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, s: .85 + rng() * .3, rx: (rng() - .5) * .08, rz: (rng() - .5) * .08, ry: rng() * TAU }); if (i % 3 === 0) owCol(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, .9); }
    owInstance(scene, logG, M.wood, lp, { sector: 64 });
    const tower = (x, z) => { const t = group(x, 0, z, g); for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) mesh(cylG(.16, .2, 8, 7), M.wood, dx, 4, dz, t); mesh(boxG(3.4, .25, 3.4), M.wood, 0, 6.2, 0, t); for (let k = 0; k < 4; k++) { const r = mesh(boxG(3.4, .9, .1), M.wood, 0, 6.8, 1.65, t); r.position.applyAxisAngle(new V3(0, 1, 0), k * PI / 2); r.position.y = 6.8; r.rotation.y = k * PI / 2; } const rf = roofMesh(4.2, 4.2, 1.6, M.canvas); rf.position.y = 8.2; t.add(rf); for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) mesh(cylG(.08, .08, 1.4, 5), M.wood, dx, 7.6, dz, t); owCol(c.x + x, c.z + z, 2.2); };
    for (const a of [gateA + .3, gateA - .3, gateA + PI * .8, gateA - PI * .7]) tower(Math.cos(a) * 36, Math.sin(a) * 36);
    for (let i = 0; i < 5; i++) { const a = gateA + PI * .5 + i * .45, x = Math.cos(a) * 28, z = Math.sin(a) * 28, tn = mesh(new T.ConeGeometry(3.2, 3.6, 8, 1, true), M.canvas, x, 1.8, z, g); tn.rotation.y = rng() * TAU; mesh(cylG(.07, .07, 4.4, 5), M.wood, x, 2.2, z, g); owCol(c.x + x, c.z + z, 3); }
    for (const [x, z] of [[-6, 10], [10, -8], [-14, -16]]) { const f = group(x, 0, z, g); for (let k = 0; k < 6; k++) { const l = mesh(cylG(.1, .12, 1.4, 6), M.wood, 0, .25, 0, f); l.rotation.z = 1.2; l.rotation.y = k / 6 * TAU; } for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; mesh(icoG(.22, 0), M.stoneD, Math.cos(a) * .8, .1, Math.sin(a) * .8, f); } mesh(cylG(.45, .55, .12, 8), M.ember, 0, .12, 0, f); OWD.fires.push({ x: c.x + x, y: .4, z: c.z + z, k: 1 }); light(c.x + x, 1.4, c.z + z, 0xff8a3a, 2.2, 20); }
    const flagT = canvasTex(texPlaque('黑風', 256, 512)); for (const a of [gateA + .22, gateA - .22, gateA + PI]) { const x = Math.cos(a) * 34, z = Math.sin(a) * 34; mesh(cylG(.1, .12, 11, 6), M.wood, x, 5.5, z, g); const fl = mesh(new T.PlaneGeometry(1.6, 3.2, 1, 6), new T.MeshStandardMaterial({ map: flagT, color: 0x555555, side: T.DoubleSide, roughness: 1 }), x + .85, 9, z, g); fl.userData.flag = true; }
    shadowAll(g);
  }
  /* 古寺：大殿、宝塔、钟楼、碑 */
  {
    const c = OW.reg('si'), g = G(c.x, c.z - 18);
    mesh(boxG(26, 1.4, 18), M.stone, 0, .7, 0, g); for (let i = 0; i < 4; i++) mesh(boxG(8, .35 * (i + 1), .7), M.stone, 0, .175 * (i + 1), 9.3 + (3 - i) * .7, g);
    for (const z of [6.6, -6.6]) for (let i = 0; i < 6; i++) mesh(cylG(.42, .46, 6.4, 12), M.redD, -10.5 + i * 4.2, 4.6, z, g);
    mesh(boxG(22, 6, 12), M.redD, 0, 4.4, -.6, g); for (let i = 0; i < 5; i++) mesh(boxG(2.8, 4.4, .25), M.dark, -8.4 + i * 4.2, 3.7, 5.5, g);
    mesh(boxG(24, .8, 15), M.teal, 0, 8.1, 0, g); const r1 = roofMesh(32, 22, 4, M.tile); r1.position.set(0, 8.5, 0); g.add(r1);
    mesh(boxG(15, 2.4, 7), M.redD, 0, 13.4, 0, g); const r2 = roofMesh(21, 12, 3.8, M.tile); r2.position.set(0, 14.5, 0); g.add(r2);
    const plq = new T.Mesh(new T.PlaneGeometry(5, 1.7), new T.MeshStandardMaterial({ map: canvasTex(texPlaque('古剑禅寺')), roughness: .6, emissive: 0x3a2a10, emissiveIntensity: .4 })); plq.position.set(0, 10, 7.7); g.add(plq);
    owCol(c.x, c.z - 18, 9); owCol(c.x - 9, c.z - 18, 7); owCol(c.x + 9, c.z - 18, 7);
    ding(g, 0, 18, 1.5); owCol(c.x, c.z, 1.4);
    const pg = group(-24, 0, 4, g); let y = 0; for (let i = 0; i < 9; i++) { const w = 6.4 - i * .55; mesh(boxG(w, 3, w), i % 2 ? M.redD : M.stone, 0, y + 1.5, 0, pg); const rf = roofMesh(w + 3, w + 3, 1.4, M.tile); rf.position.y = y + 3; pg.add(rf); y += 3.7; } mesh(coneG(.4, 4, 6), M.gold, 0, y + 2, 0, pg); owCol(c.x - 24, c.z - 14, 4);
    const bt = group(22, 0, 8, g); for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) mesh(cylG(.25, .28, 6, 8), M.redD, dx, 3, dz, bt); const br = roofMesh(6.4, 6.4, 2, M.tile); br.position.y = 6; bt.add(br); const bell = mesh(new T.LatheGeometry([[.01, 0], [1.05, 0], [.95, .3], [.8, 1.5], [.55, 2.1], [.01, 2.2]].map(p => new T.Vector2(p[0], p[1])), 16), M.bronze, 0, 2.6, 0, bt); owCol(c.x + 22, c.z - 10, 2.6);
    for (let i = 0; i < 10; i++) { const x = R2(-30, 30), z = R2(12, 34); const st = mesh(boxG(1.1, R2(1.8, 2.8), .32), M.stoneD, x, 1, z, g); st.rotation.y = R2(-.3, .3); st.rotation.z = R2(-.08, .08); owCol(c.x + x, c.z - 18 + z, .6); }
    shadowAll(g); plq.castShadow = false;
    OWD.smokes.push({ x: c.x, y: 2.4, z: c.z });
  }
  /* 剑冢：满山插剑，七柄巨剑，一圈断碑 */
  {
    const c = OW.reg('zhong'), sg = new GAcc(), sc = [.72, .74, .78];
    sg.tube([new V3(0, -.6, 0), new V3(0, 1.2, 0)], [.035, .02], 4, sc); sg.tube([new V3(-.17, 1.2, 0), new V3(.17, 1.2, 0)], [.03, .03], 4, [.4, .32, .2]); sg.tube([new V3(0, 1.2, 0), new V3(0, 1.6, 0)], [.022, .022], 4, [.2, .15, .12]);
    const swG = sg.geo(), swM = new T.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .75, color: 0xffffff });
    const pts = owScatter(W, rng, 2600, 1.6, (x, z, W, k) => Math.hypot(x - c.x, z - c.z) < c.r + 30 && W.sdf.d[k] < -1 && W.RD[k] > 2 && Math.hypot(x - c.x, z - c.z + 13) > 20);
    owInstance(scene, swG, swM, pts.map(p => ({ x: p.x, z: p.z, s: .8 + rng() * .5, rx: (rng() - .5) * .7, rz: (rng() - .5) * .7, ry: rng() * TAU })), { sector: 64 });
    const big = group(0, 0, 0, scene);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + .3, r = 34 + rng() * 8, x = c.x + Math.cos(a) * r, z = c.z - 13 + Math.sin(a) * r; const s = group(x, -2, z, big); s.scale.setScalar(5 + rng() * 4); s.rotation.set((rng() - .5) * .5, rng() * TAU, (rng() - .5) * .5); mesh(boxG(.32, 3.4, .06), swM, 0, 1.7, 0, s); mesh(boxG(1.2, .2, .3), M.bronze, 0, 3.45, 0, s); mesh(cylG(.08, .08, 1, 8), M.dark, 0, 4.05, 0, s); owCol(x, z, 1.8); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, x = c.x + Math.cos(a) * 26, z = c.z - 13 + Math.sin(a) * 26, h = 1.5 + rng() * 2.5; const st = mesh(boxG(1.2, h, .45), M.stoneD, x, h / 2 - .2, z, scene); st.rotation.y = -a + PI / 2; st.rotation.x = (rng() - .5) * .15; owCol(x, z, .7); }
    shadowAll(big);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + .8; OWD.fires.push({ x: c.x + Math.cos(a) * 22, y: .3, z: c.z - 13 + Math.sin(a) * 22, k: .6, ghost: true }); light(c.x + Math.cos(a) * 22, 1.5, c.z - 13 + Math.sin(a) * 22, 0x46ffd0, 1.3, 16); }
  }
  /* 竹海深处：苔石祭坛 */
  {
    const c = OW.reg('zhu2'), g = G(c.x, c.z);
    const plat = mesh(cylG(14, 14.4, .5, 48), M.stone, 0, .05, 0, g); plat.receiveShadow = true;
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; lantern(g, Math.cos(a) * 15.5, Math.sin(a) * 15.5, 1.1); owCol(c.x + Math.cos(a) * 15.5, c.z + Math.sin(a) * 15.5, .6); }
    const alt = mesh(boxG(3, 1.2, 2), M.stoneD, 0, .6, -9, g); mesh(sphG(.9, 14, 10), M.stoneD, 0, 1.9, -9, g); owCol(c.x, c.z - 9, 1.8);
    shadowAll(g); light(c.x, 2.5, c.z - 6, 0x9fffd0, 1.2, 18);
  }
  /* 寒潭：木栈桥伸进湖里 */
  {
    const g = G(-38, 96, Math.atan2(12, -24)), len = 27, wa = M.wood.clone(); wa.defines = { NO_TERR: '' };
    for (let i = 0; i < len / 1.2; i++) { const pl = mesh(boxG(2.4, .12, 1.05), wa, 0, OW.WL + .9, i * 1.2, g); pl.rotation.z = (rng() - .5) * .03; }
    for (let i = 0; i < len / 3; i++) for (const sx of [-1, 1]) mesh(cylG(.1, .1, 4.4, 6), wa, sx * 1.1, OW.WL - 1.2, i * 3, g);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    OWD.pier = g;
  }
  /* 宝箱：散在偏僻处，离路远、离营地远 */
  OWD.chests = [];
  const chestPts = owScatter(W, mulberry(808), 22, 55, (x, z, W, k) => W.sdf.d[k] < -3 && W.RD[k] > 16 && owPadD(x, z) > 10 && W.H[k] > OW.WL + 1 && OW.CAMPS.every(cp => Math.hypot(cp.x - x, cp.z - z) > 14), 200);
  const chestM = new T.MeshStandardMaterial({ map: tx.bark.map, color: 0x8a4a2a, roughness: .7 });
  chestPts.forEach((p, i) => {
    const g = G(p.x, p.z, rng() * TAU); mesh(boxG(1.1, .6, .7), chestM, 0, .3, 0, g); const lid = mesh(new T.CylinderGeometry(.35, .35, 1.1, 10, 1, false, 0, PI), chestM, 0, .6, 0, g); lid.rotation.z = PI / 2;
    for (const sx of [-.4, .4]) mesh(boxG(.08, .66, .74), M.gold, sx, .33, 0, g); mesh(boxG(.16, .2, .06), M.gold, 0, .45, .37, g); shadowAll(g);
    let lv = 1, bd = 1e9; for (const r of OW.REG) { const d = Math.hypot(p.x - r.x, p.z - r.z); if (d < bd) { bd = d; lv = r.lv; } }
    OWD.chests.push({ id: i, x: p.x, z: p.z, g, lid, lv }); owCol(p.x, p.z, .7);
  });
  /* 火堆与香烟：只在附近时冒 */
  let fT = 0;
  OWD.ticks.push((dt, t, f) => {
    fT -= dt; if (fT > 0) return; fT = .04;
    for (const F of OWD.fires) { if (Math.abs(F.x - f.x) > 50 || Math.abs(F.z - f.z) > 50) continue; FX.add.emit({ x: F.x + rand(-.3, .3) * F.k, y: F.y, z: F.z + rand(-.3, .3) * F.k, vx: rand(-.2, .2), vy: rand(1, 2.4) * (.6 + F.k * .4), vz: rand(-.2, .2), life: rand(.4, .9), s0: rand(.4, .8) * (.5 + F.k * .5), s1: .05, r: F.ghost ? .3 : 1, g: F.ghost ? 1 : rand(.4, .65), b: F.ghost ? .8 : .12, a: .9, grav: -1 }); if (Math.random() < .25 * F.k) FX.ink.emit({ x: F.x, y: F.y + 1.2, z: F.z, vx: rand(-.2, .2), vy: rand(.6, 1.2), vz: rand(-.2, .2), life: rand(2, 3.5), s0: .4, s1: 2.4, r: .3, g: .3, b: .32, a: .18, grav: -.05, wob: 1 }); }
    for (const S of OWD.smokes) { if (Math.abs(S.x - f.x) > 70 || Math.abs(S.z - f.z) > 70) continue; if (Math.random() < .5) FX.ink.emit({ x: S.x + rand(-.3, .3), y: S.y, z: S.z + rand(-.3, .3), vx: rand(-.1, .1), vy: rand(.4, .8), vz: rand(-.1, .1), life: rand(3, 5), s0: .2, s1: 1.6, r: .75, g: .74, b: .72, a: .22, grav: -.03, wob: 1.2 }); }
    // 瀑布脚下的水雾
    if (Math.abs(f.z + 20) < 120 && Math.abs(f.x) < 120) for (let i = 0; i < 3; i++) FX.ink.emit({ x: rand(-8, 8), y: OW.WL + rand(0, 1.5) - gH(0, -22), z: -22 + rand(-3, 4), vx: rand(-1, 1), vy: rand(.8, 2.5), vz: rand(.5, 2), life: rand(1.5, 3), s0: .8, s1: 4, r: .9, g: .94, b: .96, a: .2, grav: -.1, wob: 1.5 });
  });
  const flags = []; scene.traverse(o => { if (o.userData.flag) flags.push(o); });
  OWD.ticks.push((dt, t) => { for (const o of flags) o.rotation.x = Math.sin(t * 2.2 + o.position.x) * .12; });
}
