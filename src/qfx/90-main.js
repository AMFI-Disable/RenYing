/* ---------------- 流程与主循环 ---------------- */
const canvas = $('c'), root = $('game');
const QN = ['流畅', '均衡', '精美', '极致'];
function showBest() {
  const d = Save.load(), r = d.rec, run = Save.rl(), parts = [];
  if (r.clears) parts.push(`已通关 ${r.clears} 次`); else if (r.bestCh) parts.push(`最远破至${CHAPTERS[Math.min(r.bestCh, CHAPTERS.length) - 1].n}`);
  if (r.bestTime) parts.push(`最快 ${fmtTime(r.bestTime)}`); if (r.maxCombo) parts.push(`最高 ${r.maxCombo} 连`);
  $('best').textContent = parts.length ? '旧日战绩：' + parts.join(' · ') : '';
  $('btnMeta').textContent = d.soul ? `藏经阁 · 剑魄 ${d.soul}` : '藏经阁';
  const c = $('btnCont'); c.hidden = !run; if (run) c.textContent = `续行 · ${CHAPTERS[run.ch].n}${run.asc ? ' · ' + ASC[run.asc].n : ''}`;
  $('btnStart').textContent = run ? '重开一局' : '开一局'; $('btnStart').classList.toggle('pri', !run);
  // 劫数：通关一次解锁下一劫
  const m = ascMax(), seg = $('ascSeg'), cur = Math.min(d.ascPick || 0, m); seg.hidden = m <= 0; $('ascD').hidden = m <= 0; seg.innerHTML = '';
  for (let i = 0; i <= m; i++) { const b = document.createElement('button'); b.type = 'button'; b.textContent = ASC[i].n; b.className = i === cur ? 'on' : ''; b.onclick = () => { Save.load().ascPick = i; Save.write(); showBest(); }; seg.appendChild(b); }
  $('ascD').textContent = cur ? ASC.slice(1, cur + 1).map(a => a.d).join(' · ') : '寻常江湖 · 通关一次解锁下一劫';
}
function applyQuality() {
  const q = GFX.quality, pr = Math.min(window.devicePixelRatio || 1, [1, 1.25, 1.5, 2][q]); GFX.resize(root.clientWidth || innerWidth, root.clientHeight || innerHeight, pr);
  if (World.grass) World.grass.count = Math.floor(World.grass.userData.full * [.25, .55, .85, 1][q]);
  GFX.renderer.shadowMap.enabled = true; const ms = [1024, 1024, 2048, 4096][q]; if (GFX.sun.shadow.mapSize.x !== ms) { GFX.sun.shadow.mapSize.set(ms, ms); if (GFX.sun.shadow.map) { GFX.sun.shadow.map.dispose(); GFX.sun.shadow.map = null; } }
  GFX.final.uniforms.uBloom.value = q ? 1 : .8;
}
/* 清场：敌人、飞行物、地面预警、灵气珠（剩下的珠子直接收进囊中） */
function clearField() {
  for (const e of G.enemies) { GFX.scene.remove(e.rig.root); e.rig.dispose(); if (e.trail) e.trail.dispose(); if (e.tele) e.tele.cancel(); }
  for (const p of G.projs) killProj(p); for (const h of G.hazards) if (h.tele) h.tele.cancel();
  if (Pl.rig) for (const o of Orbs.list) collectOrb(o);
  Object.assign(G, { enemies: [], projs: [], hazards: [], queue: [], tokens: 0, boss: null, bossDead: false }); clearZones();
  Orbs.list.length = 0; Orbs.mesh.count = 0; FX.clear();
}
function resetGame() {
  Orbs.list.length = 0; clearField();
  Object.assign(G, { mode: 'rl', soulRun: 0, ascUnlocked: 0, rlDoneT: 0, cleared: false, eliteP: 0, stage: 0, chapter: 0, kills: 0, inter: 0, clearT: 0, intro: false, spawnT: 0, maxTokens: 2, cap: 6, endless: false, dmgDone: 0, maxCombo: 0, playT: 0, hitstop: 0, enemyTS: 1, slowT: 0, deathT: 0, t: 0, waves: [], sub: 0, subT: 0, stageName: '', atkGap: 0 });
  resetPlayer(); Pl.rig.setOpacity(1); UI.combo(0); GFX.final.uniforms.uGray.value = 0;
}
function placePlayer() {
  const sp = MAPS[World.id].spawn; Pl.pos.set(sp[0], 0, sp[1]); Pl.vel.set(0, 0, 0); Pl.kx = Pl.kz = 0; Pl.yaw = Pl.yawT = sp[2]; Pl.lock = null;
  Cam.yaw = sp[2]; Cam.pitch = .34; Cam.look.set(Pl.pos.x, 1.5, Pl.pos.z); Cam.dist = Cam.distT = 7.4;
}
function unlock() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }
function hideAll() { if (Tut.on) Tut.end(false, true); for (const id of ['title', 'levelup', 'shop', 'pause', 'over', 'interlude', 'meta', 'settings', 'rlmap', 'event']) $(id).hidden = true; }
/* 墨色过场：盖住画面 → 换地图 → 揭开 */
function travelShow(ch) {
  $('tvIdx').textContent = ch.idx; $('tvName').textContent = ch.n; $('tvSub').textContent = ch.sub; $('tvStory').textContent = ch.story;
  const el = $('travel'); el.hidden = false; void el.offsetWidth; el.classList.add('on');
}
function travelHide() { const el = $('travel'); el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, 700); }
const Game = {
  /* 开一局：从第一章的路线图起步；asc 劫数 */
  start(asc) {
    Snd.init(); const d = Save.load(); asc = clamp(asc ?? d.ascPick ?? 0, 0, ascMax()); d.ascPick = asc; d.rl = null; d.rec.runs++; Save.write();
    resetGame(); Run.begin(asc); applyMetaStart(); if (asc >= 5) Pl.pots = Math.max(0, Pl.pots - 1); Game.enterChapter(0);
  },
  /* 续行：读路线图上的存档 */
  cont() { const r = Save.rl(); if (!r || !r.map) { Game.start(); return; } Snd.init(); resetGame(); Run.load(r); Save.applyRun(r.snap); Pl.hp = clamp(r.hp || Pl.maxHp, 1, Pl.maxHp); Game.enterChapter(r.ch, true); },
  enterChapter(ci, resume) {
    hideAll(); $('hud').hidden = true; $('touch').hidden = true; unlock(); G.state = 'travel'; G.chapter = ci;
    const ch = CHAPTERS[ci]; travelShow(ch); const t0 = performance.now();
    const go = () => {
      clearField(); if (World.id !== ch.id) World.build(ch.id); placePlayer(); applyQuality();
      try { GFX.renderer.compile(GFX.scene, GFX.camera); } catch (_) {}
      if (!resume) Pl.reviveUsed = false; Pl.rerolls = up('wu'); Pl.bellT = Pl.wuyingT = 0; Object.assign(G, { stage: 0, clearT: 0, hitstop: 0, enemyTS: 1, slowT: 0, rlDoneT: 0 });
      // 过场至少停留两秒半，让章名和题记读得完；第一次开局先在山门前试剑
      setTimeout(() => {
        travelHide();
        if (ci === 0 && !resume && !Save.load().tut && !dbg('noTut')) { $('hud').hidden = false; $('touch').hidden = !Input.touch; G.state = 'playing'; canvas.focus(); UI.banner(ch.n, ch.idx + ' · ' + ch.sub, ''); Snd.gong(); Tut.begin(); }
        else Run.showMap();
      }, dbg('instant') ? 0 : Math.max(0, 2600 - (performance.now() - t0)));
    };
    if (dbg('instant')) go(); else setTimeout(go, 650);
  },
  pause() { if (G.state !== 'playing') return; G.state = 'paused'; UI.perkList('pausePerks'); $('pause').hidden = false; unlock(); },
  resume() { if (G.state !== 'paused') return; $('pause').hidden = true; G.state = 'playing'; canvas.focus(); },
  levelUp() { G.state = 'levelup'; unlock(); UI.showLevelUp(); },
  reroll() { if (G.state !== 'levelup' || Pl.rerolls <= 0) return; Pl.rerolls--; Snd.ui(); UI.showLevelUp(); },
  pickPerk(p) { if (G.state !== 'levelup' || !p) return; takeCard(p); Pl.pending--; if (Pl.pending > 0) { UI.showLevelUp(); return; } $('levelup').hidden = true; G.state = 'playing'; Pl.iframe = Math.max(Pl.iframe, .8); canvas.focus(); },
  /* 剑庐：路线图上的「市」，或者一章打完的歇脚处 */
  openShop() { if (G.state !== 'interlude') return; G.shopFrom = 'interlude'; $('interlude').hidden = true; G.state = 'shop'; unlock(); UI.showShop(); },
  closeShop() { if (G.state !== 'shop') return; $('shop').hidden = true; if (G.shopFrom === 'interlude') { G.state = 'interlude'; $('interlude').hidden = false; return; } Run.showMap(); },
  onDeath() { G.deathT = 0; Snd.gong(); },
  /* 一章打完：结算 + 剑庐 + 启程 */
  chapterClear() {
    G.state = 'interlude'; unlock(); clearField(); const ch = CHAPTERS[G.chapter], nx = CHAPTERS[G.chapter + 1];
    $('ilT').firstChild.textContent = ch.n + ' · 已破'; $('ilS').textContent = ch.idx + ' · ' + ch.sub;
    $('ilStats').innerHTML = `<div><b>${cnNum(Pl.lv)}</b>境界</div><div><b>${G.kills}</b>斩敌</div><div><b>${G.maxCombo}</b>最高连击</div><div><b>${fmtTime(G.playT)}</b>历时</div>`;
    $('ilNext').textContent = nx ? `前路：${nx.idx} · ${nx.n}。${nx.story}` : '';
    $('interlude').hidden = false; healPlayer(Pl.maxHp, true); Pl.mp = Pl.maxMp;
  },
  nextChapter() { if (G.state !== 'interlude') return; Run.nextChapter(); },
  over(win) {
    G.state = 'over'; unlock(); Save.runEnd(win); const ch = CHAPTERS[G.chapter];
    $('overT').firstChild.textContent = win ? '万剑归寂' : '剑折人亡';
    $('overS').textContent = win ? `三章尽破，青锋入鞘${G.asc ? ' · ' + ASC[G.asc].n : ''}` : `剑锋折于${ch.n} · 第${cnNum(Math.max(1, Run.step))}程`;
    $('overStats').innerHTML = `<div><b>${cnNum(win ? CHAPTERS.length : G.chapter + 1)}</b>章</div><div><b>${cnNum(Math.max(1, Run.step))}</b>程</div><div><b>${cnNum(Pl.lv)}</b>境界</div><div><b>${G.kills}</b>斩敌</div><div><b>${G.maxCombo}</b>最高连击</div><div><b>${fmtTime(G.playT)}</b>历时</div><div><b>${Math.round(G.dmgDone)}</b>总伤害</div><div><b>${swordTier().name[0]}${swordTier().name[1]}</b>佩剑</div>`;
    UI.perkList('overPerks'); const sg = addSoul(win ? 60 + 20 * (G.asc || 0) : 0) + (G.soulRun || 0);
    $('overSoul').textContent = `此行共得剑魄 ${sg} · 藏经阁中现有 ${Save.load().soul}` + (G.ascUnlocked ? ` · 解锁「${ASC[G.ascUnlocked].n}」` : '');
    $('over').hidden = false;
  },
  victory() { UI.banner('万剑归寂', '', 'gold'); Snd.level(); Game.over(true); },
  home() { hideAll(); $('hud').hidden = true; $('touch').hidden = true; clearField(); resetGame(); placePlayer(); G.state = 'title'; $('title').hidden = false; showBest(); },
};
Input.onLock = locked => { if (!locked && G.state === 'playing') Game.pause(); };

/* 关面板那一下的按键不再落到战斗里（数字键会顺手放技能、回车会跳过歇息） */
function eatKeys() { for (const k in Input.hits) delete Input.hits[k]; }
function handleKeys() {
  const s = G.state;
  if (Input.hit('KeyN')) { Snd.setMute(!Snd.muted); $('btnMute').textContent = '声音：' + (Snd.muted ? '关' : '开'); }
  if (s === 'playing') { if (Input.hit('KeyP') || Input.hit('Escape')) Game.pause(); }
  else if (s === 'rlmap') {
    const r = Run.reach().sort((a, b) => Run.map.nodes[a].x - Run.map.nodes[b].x);
    if (Input.hit('Enter') && r.length === 1) { Run.go(r[0]); eatKeys(); } else for (let i = 0; i < r.length; i++) if (Input.hit('Digit' + (i + 1)) || Input.hit('Numpad' + (i + 1))) { Run.go(r[i]); eatKeys(); break; }
  }
  else if (s === 'event') { if (Input.hit('Enter') || Input.hit('Space')) { Run.closeEvent(); eatKeys(); } else for (let i = 0; i < 4; i++) if (Input.hit('Digit' + (i + 1)) || Input.hit('Numpad' + (i + 1))) { Run.choose(Run.opts && Run.opts[i]); eatKeys(); break; } }
  else if (s === 'reward') { for (let i = 0; i < 3; i++) if (Input.hit('Digit' + (i + 1)) || Input.hit('Numpad' + (i + 1))) { Run.pickCard(Run.cards && Run.cards[i]); eatKeys(); break; } }
  else if (s === 'paused') { if (!$('settings').hidden) { if (Input.hit('Escape')) UI.closeSettings(); } else if (Input.hit('KeyP') || Input.hit('Escape')) Game.resume(); }
  else if (s === 'shop') { if (Input.hit('KeyB') || Input.hit('Escape') || Input.hit('Enter')) { Game.closeShop(); eatKeys(); } }
  else if (s === 'interlude') { if (Input.hit('KeyB')) Game.openShop(); else if (Input.hit('Enter')) Game.nextChapter(); }
  else if (s === 'levelup') { if (Input.hit('KeyR')) Game.reroll(); for (let i = 0; i < 3; i++) if (Input.hit('Digit' + (i + 1)) || Input.hit('Numpad' + (i + 1))) { Game.pickPerk(UI.perks[i]); eatKeys(); break; } }
  else if (s === 'title') { if (Input.hit('Enter') && !$('title').hidden && !$('btnStart').disabled) { if (Save.rl()) Game.cont(); else Game.start(); } }
}

let last = 0, slowAcc = 0, fN = 0, fT = 0;
function frame(now) {
  if (!dbg('manual')) requestAnimationFrame(frame);
  let rdt = Math.min(.05, (now - last) / 1000); last = now; if (!(rdt > 0)) rdt = .001;
  GFX.time.value += rdt; handleKeys(); let dt = 0; const U = GFX.final.uniforms;
  if (G.state === 'playing') {
    if (G.hitstop > 0) { G.hitstop -= rdt; dt = rdt * .05; } else dt = rdt;
    if (G.slowT > 0) { G.slowT -= rdt; if (G.slowT <= 0) G.enemyTS = 1; }
    if (Pl.state === 'dead') { dt *= .45; G.deathT += rdt; U.uGray.value = sat(G.deathT / 1.5); if (G.deathT > 2.4) Game.over(false); }
    G.t += dt; if (Pl.state !== 'dead') G.playT += dt;
    updatePlayer(dt);
    for (let i = G.enemies.length - 1; i >= 0; i--) if (!updateEnemy(G.enemies[i], dt, G.t)) G.enemies.splice(i, 1);
    updateProjs(dt, G.t); updateZones(dt); updateOrbs(dt, G.t); if (G.state === 'playing') updateStage(dt);
    Snd.combat = G.enemies.length ? 1 : 0;
    if (G.state === 'playing' && Pl.pending > 0 && !['ult', 'ultL', 'dead', 'attack', 'exec', 'flash', 'charge', 'skShadow'].includes(Pl.state) && G.hitstop <= 0) Game.levelUp();
    FX.update(dt, G.t); World.update(rdt, GFX.time.value, Pl.pos); updateCamera(dt, rdt); UI.update(rdt);
  } else if (G.state === 'title') {
    G.t += rdt; Pl.rig.root.position.copy(Pl.pos); Pl.rig.root.rotation.y = .3; animHuman(Pl.rig, rdt, G.t, { speed: 0, rate: 10, pose: P => setHand(P, -.36, .98, -.1, -.1, .94, -.33) });
    FX.update(rdt, G.t); World.update(rdt, GFX.time.value, Pl.pos); updateCamera(rdt, rdt);
  } else { World.update(0, GFX.time.value, Pl.pos); }
  GFX.followSun(Pl.pos); GFX.updateFlash(rdt); GFX.sky.position.copy(GFX.camera.position);
  const low = Pl.hp / Pl.maxHp < .3 && Pl.state !== 'dead' && G.state !== 'title' ? (.3 + Math.sin(GFX.time.value * 5) * .12) : 0;
  U.uHurt.value = Math.max(Pl.hurtV * .75, low); U.uFlash.value = Math.max(0, U.uFlash.value - rdt * 1.6); U.uFocus.value = damp(U.uFocus.value, G.state === 'playing' && G.enemyTS < 1 && Pl.state !== 'dead' ? 1 : 0, 8, rdt);
  FX.updateNums(G.state === 'playing' ? rdt : 0, GFX.camera, root.clientWidth, root.clientHeight);
  if (!dbg('noRender') && G.state !== 'travel') GFX.render(); Input.endFrame();
  // 自适应画质
  fN++; fT += rdt; if (fT >= 1) { const fps = fN / fT; fN = 0; fT = 0; if (G.state === 'playing' && fps < 38) { if (++slowAcc >= 3 && GFX.quality > 0) { GFX.quality--; applyQuality(); slowAcc = 0; UI.toast('画面已自动调低，可在暂停菜单更改', 3); } } else slowAcc = 0; }
}

function bindUI() {
  $('btnStart').onclick = () => { if (Save.rl() && !dbg('instant') && !confirm('重开会放弃存着的那一局（剑魄和藏经阁不受影响），确定吗？')) return; Game.start(); }; $('btnCont').onclick = () => Game.cont();
  $('btnResume').onclick = () => Game.resume(); $('btnRestart').onclick = () => { if (!dbg('instant') && !confirm('放弃这一局？剑魄照样留着。')) return; $('pause').hidden = true; Game.over(false); };
  $('btnRmLeave').onclick = () => Game.home(); $('evGo').onclick = () => Run.closeEvent();
  $('btnAgain').onclick = () => Game.start(); $('btnHome').onclick = () => Game.home(); $('btnShopClose').onclick = () => Game.closeShop();
  $('btnIlShop').onclick = () => Game.openShop(); $('btnIlGo').onclick = () => Game.nextChapter();
  $('btnMute').onclick = () => { Snd.setMute(!Snd.muted); $('btnMute').textContent = '声音：' + (Snd.muted ? '关' : '开'); };
  $('btnMeta').onclick = () => UI.showMeta(); $('btnMetaClose').onclick = () => { $('meta').hidden = true; $('title').hidden = false; showBest(); };
  $('btnSet').onclick = () => UI.showSettings('title'); $('btnSet2').onclick = () => UI.showSettings('pause'); $('btnSetClose').onclick = () => UI.closeSettings();
  $('btnReroll').onclick = () => Game.reroll(); $('btnTutSkip').onclick = () => { Tut.end(false); canvas.focus(); };
  $('setSens').oninput = e => setSetting('sens', +e.target.value); $('setVol').oninput = e => setSetting('vol', +e.target.value);
  const fs = () => { const el = document.documentElement; try { if (document.fullscreenElement) document.exitFullscreen(); else { const p = (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); if (p && p.catch) p.catch(() => {}); } } catch (_) {} };
  $('btnFull').onclick = fs; $('btnFull2').onclick = fs;
  for (let i = 0; i < 4; i++) $('sk' + i).onclick = () => { Input.hits['Sk' + i] = true; canvas.focus(); }; $('sk4').onclick = () => { Input.hits.KeyC = true; canvas.focus(); };
  let qT = 0; addEventListener('resize', () => { clearTimeout(qT); qT = setTimeout(applyQuality, 120); });   // 拖窗口时会连发几十次：停下来再重建一次 document.addEventListener('visibilitychange', () => { if (document.hidden) Game.pause(); });
  addEventListener('touchstart', () => { if (!Input.touch) { Input.touch = true; if (G.state === 'playing') $('touch').hidden = false; } }, { passive: true });
  setupPointer(canvas, () => G.state === 'playing' && !Input.touch); setupTouchUI();
}
async function boot() {
  const q0 = setting('q'); if (typeof dbg('quality') !== 'number') GFX.quality = q0 >= 0 ? q0 : (matchMedia('(pointer:coarse)').matches || Math.min(innerWidth, innerHeight) < 500 ? 1 : 2);
  bindUI(); showBest();
  try { if (document.fonts && document.fonts.load) await Promise.race([Promise.all([document.fonts.load('80px "Ma Shan Zheng"', '青云剑宗试坪'), document.fonts.load('900 20px "Noto Serif SC"', '0123456789')]), new Promise(r => setTimeout(r, 2500))]); } catch (_) {}
  await new Promise(r => setTimeout(r, 30));
  try {
    initGfx(canvas); FX.init(GFX.scene); World.build('gate'); initPlayer(GFX.scene); initOrbs(GFX.scene); placePlayer(); applyQuality();
    GFX.renderer.compile(GFX.scene, GFX.camera);
    last = performance.now(); requestAnimationFrame(frame);
    $('btnStart').disabled = false; $('loading').hidden = true;
    if (DBG) DBG.game = { G, Pl, Game, Input, GFX, Cam, spawnEnemy, UI, ET, frame, FX, gainXp, Orbs, setSwordTier, World, Save, CHAPTERS, MAPS, killEnemy, damageEnemy, hurtPlayer, SK, ULT, PERKS, SCHOOLS, reso, learnSkill, offerCards, findExec, startExec, parriedBy, breakPoise, Tut, TERR, gH, Run, NODE, EVENTS, genMap, genWaves, rareCards, ascApply, ASC };
  } catch (err) { console.error(err && err.stack || err); $('loading').textContent = '无法启动 3D 画面：' + (err && err.message ? err.message : err) + '。请换用支持 WebGL 的桌面浏览器。'; }
}
boot();
