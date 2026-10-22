/* ---------------- 流程与主循环 ---------------- */
const canvas = $('c'), root = $('game');
const QN = ['低', '中', '高'];
function loadBest() { try { return JSON.parse(localStorage.getItem('qfx_best') || 'null'); } catch (_) { return null; } }
function saveBest() { try { const b = loadBest() || { wave: 0, lv: 0, kills: 0 }; const n = { wave: Math.max(b.wave, G.wave), lv: Math.max(b.lv, Pl.lv), kills: Math.max(b.kills, G.kills) }; localStorage.setItem('qfx_best', JSON.stringify(n)); } catch (_) {} }
function showBest() { const b = loadBest(); $('best').textContent = b && b.wave ? `旧日战绩：守至第${cnNum(b.wave)}波 · ${cnNum(b.lv)}境 · 斩敌 ${b.kills}` : ''; }
function applyQuality() {
  const q = GFX.quality, pr = Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][q]); GFX.resize(root.clientWidth || innerWidth, root.clientHeight || innerHeight, pr);
  if (World.grass) World.grass.count = Math.floor(World.grass.userData.full * [.3, .65, 1][q]);
  GFX.renderer.shadowMap.enabled = true; const ms = [1024, 2048, 2048][q]; if (GFX.sun.shadow.mapSize.x !== ms) { GFX.sun.shadow.mapSize.set(ms, ms); if (GFX.sun.shadow.map) { GFX.sun.shadow.map.dispose(); GFX.sun.shadow.map = null; } }
  $('btnQual').textContent = '画质：' + QN[q];
}
function resetGame() {
  for (const e of G.enemies) { GFX.scene.remove(e.rig.root); e.rig.dispose(); if (e.trail) e.trail.dispose(); if (e.tele) e.tele.cancel(); }
  for (const p of G.projs) killProj(p); for (const h of G.hazards) if (h.tele) h.tele.cancel();
  Object.assign(G, { enemies: [], projs: [], hazards: [], wave: 0, kills: 0, inter: 0, queue: [], spawnT: 0, tokens: 0, maxTokens: 2, cap: 6, boss: null, endless: false, dmgDone: 0, maxCombo: 0, playT: 0, hitstop: 0, enemyTS: 1, slowT: 0, deathT: 0, bossDead: false, t: 0 });
  Orbs.list.length = 0; Orbs.mesh.count = 0; resetPlayer(); Pl.rig.setOpacity(1); UI.combo(0); Cam.yaw = PI; Cam.pitch = .34; Cam.look.set(Pl.pos.x, 1.5, Pl.pos.z); Cam.dist = Cam.distT = 7.4;
  GFX.final.uniforms.uGray.value = 0;
}
function unlock() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }
function hideAll() { for (const id of ['title', 'levelup', 'shop', 'pause', 'over']) $(id).hidden = true; }
const Game = {
  start() { Snd.init(); resetGame(); hideAll(); $('hud').hidden = false; $('touch').hidden = !Input.touch; G.state = 'playing'; G.inter = 2.6; canvas.focus(); UI.banner('青锋行', '暮山试剑', ''); UI.toast('四面来敌，守住试剑坪', 4); },
  pause() { if (G.state !== 'playing') return; G.state = 'paused'; UI.perkList('pausePerks'); $('pause').hidden = false; unlock(); },
  resume() { if (G.state !== 'paused') return; $('pause').hidden = true; G.state = 'playing'; canvas.focus(); },
  levelUp() { G.state = 'levelup'; unlock(); UI.showLevelUp(); },
  pickPerk(p) { if (G.state !== 'levelup' || !p) return; takePerk(p); Pl.pending--; if (Pl.pending > 0) { UI.showLevelUp(); return; } $('levelup').hidden = true; G.state = 'playing'; Pl.iframe = Math.max(Pl.iframe, .8); canvas.focus(); },
  openShop() { if (G.state !== 'playing' || G.inter <= 0 || !G.wave) return; G.state = 'shop'; unlock(); UI.showShop(); },
  closeShop() { if (G.state !== 'shop') return; $('shop').hidden = true; G.state = 'playing'; canvas.focus(); },
  onDeath() { G.deathT = 0; Snd.gong(); },
  over(win) {
    G.state = 'over'; unlock(); saveBest(); $('overT').firstChild.textContent = win ? '山门无恙' : '剑折人亡'; $('overS').textContent = win ? '十波尽退，暮色重归寂静' : `剑锋折于第${cnNum(G.wave)}波`;
    const mm = Math.floor(G.playT / 60), ss = Math.floor(G.playT % 60);
    $('overStats').innerHTML = `<div><b>${cnNum(G.wave)}</b>波次</div><div><b>${cnNum(Pl.lv)}</b>境界</div><div><b>${G.kills}</b>斩敌</div><div><b>${G.maxCombo}</b>最高连击</div><div><b>${mm}:${('0' + ss).slice(-2)}</b>历时</div><div><b>${Math.round(G.dmgDone)}</b>总伤害</div><div><b>${swordTier().name[0]}${swordTier().name[1]}</b>佩剑</div><div><b>${Math.floor(Pl.gold)}</b>余钱</div>`;
    UI.perkList('overPerks'); $('btnEndless').hidden = !win; $('over').hidden = false;
  },
  victory() { UI.banner('山门无恙', '', 'gold'); Snd.level(); Game.over(true); },
  endless() { if (G.state !== 'over') return; $('over').hidden = true; G.endless = true; G.state = 'playing'; G.inter = 12; canvas.focus(); UI.toast('无尽试炼：一波更比一波凶', 4); },
};
Input.onLock = locked => { if (!locked && G.state === 'playing') Game.pause(); };

function handleKeys() {
  const s = G.state;
  if (Input.hit('KeyM')) { Snd.setMute(!Snd.muted); $('btnMute').textContent = '声音：' + (Snd.muted ? '关' : '开'); }
  if (s === 'playing') { if (Input.hit('KeyP') || Input.hit('Escape')) Game.pause(); else if (Input.hit('KeyB')) Game.openShop(); }
  else if (s === 'paused') { if (Input.hit('KeyP') || Input.hit('Escape')) Game.resume(); }
  else if (s === 'shop') { if (Input.hit('KeyB') || Input.hit('Escape') || Input.hit('Enter')) Game.closeShop(); }
  else if (s === 'levelup') { for (let i = 0; i < 3; i++) if (Input.hit('Digit' + (i + 1)) || Input.hit('Numpad' + (i + 1))) { Game.pickPerk(UI.perks[i]); break; } }
  else if (s === 'title') { if (Input.hit('Enter') && !$('btnStart').disabled) Game.start(); }
}

let last = 0, slowAcc = 0, fN = 0, fT = 0;
function frame(now) {
  if (!window.__manual) requestAnimationFrame(frame);
  let rdt = Math.min(.05, (now - last) / 1000); last = now; if (!(rdt > 0)) rdt = .001;
  GFX.time.value += rdt; handleKeys(); let dt = 0; const U = GFX.final.uniforms;
  if (G.state === 'playing') {
    if (G.hitstop > 0) { G.hitstop -= rdt; dt = rdt * .05; } else dt = rdt;
    if (G.slowT > 0) { G.slowT -= rdt; if (G.slowT <= 0) G.enemyTS = 1; }
    if (Pl.state === 'dead') { dt *= .45; G.deathT += rdt; U.uGray.value = sat(G.deathT / 1.5); if (G.deathT > 2.4) Game.over(false); }
    G.t += dt; if (Pl.state !== 'dead') G.playT += dt;
    updatePlayer(dt);
    for (let i = G.enemies.length - 1; i >= 0; i--) if (!updateEnemy(G.enemies[i], dt, G.t)) G.enemies.splice(i, 1);
    updateProjs(dt, G.t); updateOrbs(dt, G.t); if (G.state === 'playing') updateWaves(dt);
    Snd.combat = G.enemies.length ? 1 : 0;
    if (G.state === 'playing' && Pl.pending > 0 && Pl.state !== 'ult' && Pl.state !== 'dead' && G.hitstop <= 0 && Pl.state !== 'attack') Game.levelUp();
    FX.update(dt, G.t); World.update(rdt, GFX.time.value, Pl.pos); updateCamera(dt, rdt); UI.update(rdt);
  } else if (G.state === 'title') {
    G.t += rdt; Pl.rig.root.position.copy(Pl.pos); Pl.rig.root.rotation.y = .3; animHuman(Pl.rig, rdt, G.t, { speed: 0, rate: 10, pose: P => setHand(P, -.36, .98, -.1, -.1, .94, -.33) });
    FX.update(rdt, G.t); World.update(rdt, GFX.time.value, Pl.pos); updateCamera(rdt, rdt);
  } else { World.update(0, GFX.time.value, Pl.pos); }
  GFX.followSun(Pl.pos); GFX.updateFlash(rdt);
  const low = Pl.hp / Pl.maxHp < .3 && Pl.state !== 'dead' && G.state !== 'title' ? (.3 + Math.sin(GFX.time.value * 5) * .12) : 0;
  U.uHurt.value = Math.max(Pl.hurtV * .75, low); U.uFlash.value = Math.max(0, U.uFlash.value - rdt * 1.6); U.uFocus.value = damp(U.uFocus.value, G.state === 'playing' && G.enemyTS < 1 && Pl.state !== 'dead' ? 1 : 0, 8, rdt);
  FX.updateNums(G.state === 'playing' ? rdt : 0, GFX.camera, root.clientWidth, root.clientHeight);
  if (!window.__norender) GFX.render(); Input.endFrame();
  // 自适应画质
  fN++; fT += rdt; if (fT >= 1) { const fps = fN / fT; fN = 0; fT = 0; if (G.state === 'playing' && fps < 38) { if (++slowAcc >= 3 && GFX.quality > 0) { GFX.quality--; applyQuality(); slowAcc = 0; UI.toast('画面已自动调低，可在暂停菜单更改', 3); } } else slowAcc = 0; }
}

function bindUI() {
  $('btnStart').onclick = () => Game.start(); $('btnResume').onclick = () => Game.resume(); $('btnRestart').onclick = () => { $('pause').hidden = true; Game.start(); };
  $('btnAgain').onclick = () => Game.start(); $('btnEndless').onclick = () => Game.endless(); $('btnShopClose').onclick = () => Game.closeShop();
  $('btnMute').onclick = () => { Snd.setMute(!Snd.muted); $('btnMute').textContent = '声音：' + (Snd.muted ? '关' : '开'); };
  $('btnQual').onclick = () => { GFX.quality = (GFX.quality + 2) % 3; applyQuality(); };
  const fs = () => { const el = document.documentElement; try { if (document.fullscreenElement) document.exitFullscreen(); else { const p = (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); if (p && p.catch) p.catch(() => {}); } } catch (_) {} };
  $('btnFull').onclick = fs; $('btnFull2').onclick = fs;
  for (let i = 0; i < SKILLS.length; i++) $('sk' + i).onclick = () => { Input.hits['Sk' + i] = true; canvas.focus(); }; $('sk4').onclick = () => { Input.hits.KeyC = true; canvas.focus(); };
  addEventListener('resize', () => applyQuality()); document.addEventListener('visibilitychange', () => { if (document.hidden) Game.pause(); });
  addEventListener('touchstart', () => { if (!Input.touch) { Input.touch = true; if (G.state === 'playing') $('touch').hidden = false; } }, { passive: true });
  setupPointer(canvas, () => G.state === 'playing' && !Input.touch); setupTouchUI();
}
async function boot() {
  showBest(); bindUI();
  try { if (document.fonts && document.fonts.load) await Promise.race([Promise.all([document.fonts.load('80px "Ma Shan Zheng"', '青云剑宗试坪'), document.fonts.load('900 20px "Noto Serif SC"', '0123456789')]), new Promise(r => setTimeout(r, 2500))]); } catch (_) {}
  await new Promise(r => setTimeout(r, 30));
  try {
    initGfx(canvas); FX.init(GFX.scene); if (window.__NOWORLD) { World.update = () => {}; const gp = new T.Mesh(new T.CircleGeometry(30, 32).rotateX(-PI / 2), stdMat(0x8a857b)); gp.receiveShadow = true; GFX.scene.add(gp); } else buildWorld(GFX.scene); initPlayer(GFX.scene); initOrbs(GFX.scene); applyQuality();
    GFX.renderer.compile(GFX.scene, GFX.camera);
    last = performance.now(); requestAnimationFrame(frame);
    $('btnStart').disabled = false; $('loading').hidden = true;
    window.__game = { G, Pl, Game, Input, GFX, Cam, spawnEnemy, startWave, UI, ET, frame, FX, gainXp, Orbs, setSwordTier };
  } catch (err) { console.error(err && err.stack || err); $('loading').textContent = '无法启动 3D 画面：' + (err && err.message ? err.message : err) + '。请换用支持 WebGL 的桌面浏览器。'; }
}
boot();
