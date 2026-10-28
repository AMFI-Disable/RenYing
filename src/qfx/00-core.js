const T = THREE, V3 = T.Vector3, PI = Math.PI, TAU = PI * 2;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const smooth = t => { t = sat(t); return t * t * (3 - 2 * t); };
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const easeOut = t => 1 - Math.pow(1 - sat(t), 3);
const easeIn = t => { t = sat(t); return t * t * t; };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function angDiff(a, b) { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; }
const dampAng = (a, b, k, dt) => a + angDiff(a, b) * (1 - Math.exp(-k * dt));
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
function fbm(x, y, o = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= .5; } return s; }
const CN = '零一二三四五六七八九';
function cnNum(n) { n = Math.floor(n); if (n <= 10) return n === 10 ? '十' : CN[n]; if (n < 20) return '十' + CN[n % 10]; if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : ''); return '' + n; }

/* ---------------- 输入 ---------------- */
const Input = {
  keys: {}, hits: {}, mdx: 0, mdy: 0, locked: false, drag: false, ax: 0, ay: 0, touch: false,
  down(c) { return !!this.keys[c]; },
  hit(c) { return !!this.hits[c]; },
  endFrame() { this.hits = {}; this.mdx = 0; this.mdy = 0; }
};
const GAME_KEYS = new Set(['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const typingIn = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const pressingUi = (el, code) => (code === 'Enter' || code === 'Space') && !!el && !!el.closest && !!el.closest('button, a, [role="button"], [tabindex]:not(#c)');
// 只有在打的时候才把游戏键拦下来；面板里（菜单、暂停、设置、商店……）键盘照常用：Tab 换焦点、方向键调滑块、空格回车按按钮
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey) return;
  const playing = G.state === 'playing';
  if (!playing && e.code !== 'Escape' && (typingIn(e.target) || pressingUi(e.target, e.code))) return;   // 这一下是给面板的，不当游戏输入
  if (playing && GAME_KEYS.has(e.code)) e.preventDefault();
  if (!e.repeat) Input.hits[e.code] = true;
  Input.keys[e.code] = true;
});
addEventListener('keyup', e => { Input.keys[e.code] = false; });
addEventListener('blur', () => { Input.keys = {}; });
function setupPointer(canvas, canLock) {
  canvas.addEventListener('mousedown', e => {
    canvas.focus();
    Input.hits['Mouse' + e.button] = true; Input.keys['Mouse' + e.button] = true; Input.drag = true;
    if (!Input.locked && canLock() && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
  });
  addEventListener('mouseup', e => { Input.keys['Mouse' + e.button] = false; Input.drag = false; });
  addEventListener('mousemove', e => { if (Input.locked || Input.drag) { Input.mdx += e.movementX || 0; Input.mdy += e.movementY || 0; } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { Input.locked = document.pointerLockElement === canvas; if (Input.onLock) Input.onLock(Input.locked); });
  // 触屏：右半屏拖动转视角
  let camTouch = null, lx = 0, ly = 0;
  canvas.addEventListener('touchstart', e => { Input.touch = true; const t = e.changedTouches[0]; camTouch = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === camTouch) { Input.mdx += (t.clientX - lx) * 1.6; Input.mdy += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; } e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', () => { camTouch = null; });
}
function setupTouchUI() {
  const stick = $('stick'), knob = $('knob'); let id = null;
  const mv = t => { const r = stick.getBoundingClientRect(); let x = (t.clientX - r.left - r.width / 2) / (r.width / 2), y = (t.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } Input.ax = x; Input.ay = -y; knob.style.transform = `translate(${x * 36}px,${y * 36}px)`; };
  stick.addEventListener('touchstart', e => { id = e.changedTouches[0].identifier; mv(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
  stick.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === id) mv(t); e.preventDefault(); }, { passive: false });
  const end = () => { id = null; Input.ax = Input.ay = 0; knob.style.transform = ''; };
  stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
  const tap = (el, code) => el.addEventListener('touchstart', e => { Input.hits[code] = true; e.preventDefault(); }, { passive: false });
  tap($('tAtk'), 'KeyJ'); tap($('tDodge'), 'Space'); tap($('tParry'), 'KeyF'); tap($('tLock'), 'Tab'); tap($('tPause'), 'KeyP');
  // 旋：轻点旋风斩，按住蓄力破山
  const th = $('tHeavy'), up = () => { Input.keys.TouchK = false; };
  th.addEventListener('touchstart', e => { Input.hits.KeyK = true; Input.keys.TouchK = true; e.preventDefault(); }, { passive: false }); th.addEventListener('touchend', up); th.addEventListener('touchcancel', up);
}

/* ---------------- 声音（全部合成） ---------------- */
const Snd = {
  ctx: null, out: null, rev: null, muted: false, nbuf: null, combat: 0, _next: 0, _step: 0, _timer: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      const c = this.ctx = new AC();
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
      this.out = c.createGain(); this.out.gain.value = this.muted ? 0 : .55 * setting('vol') / .8; this.out.connect(comp); comp.connect(c.destination);
      const len = c.sampleRate * 2.6, ib = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ib.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      this.rev = c.createConvolver(); this.rev.buffer = ib; const rg = c.createGain(); rg.gain.value = .5; this.rev.connect(rg); rg.connect(this.out);
      this.nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const nd = this.nbuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      // 山风底噪
      const w = c.createBufferSource(); w.buffer = this.nbuf; w.loop = true; const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
      const wg = c.createGain(); wg.gain.value = .05; w.connect(wf); wf.connect(wg); wg.connect(this.out); w.start();
      const lfo = c.createOscillator(); lfo.frequency.value = .11; const lg = c.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
      this._next = c.currentTime + .4; this._timer = setInterval(() => this.music(), 120);
    } catch (_) { this.ctx = null; }
  },
  setMute(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : .55 * setting('vol') / .8; },
  noise(t, dur, f0, f1, q, g, type = 'bandpass') {
    const c = this.ctx; if (!c) return; const s = c.createBufferSource(); s.buffer = this.nbuf; s.playbackRate.value = rand(.8, 1.2);
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const gn = c.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + dur * .25); gn.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(gn); gn.connect(this.out); s.start(t, rand(0, .5), dur + .05);
  },
  tone(t, f0, f1, dur, g, type = 'sine', wet = 0) {
    const c = this.ctx; if (!c) return; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const gn = c.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(gn); gn.connect(this.out); if (wet) { const wg = c.createGain(); wg.gain.value = wet; gn.connect(wg); wg.connect(this.rev); }
    o.start(t); o.stop(t + dur + .05);
  },
  pluck(t, f, g, dur = 1.8) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.012, t); o.frequency.exponentialRampToValueAtTime(f, t + .06);
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.001;
    const gn = c.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + .006); gn.gain.exponentialRampToValueAtTime(.001, t + dur);
    const g2 = c.createGain(); g2.gain.setValueAtTime(g * .35, t); g2.gain.exponentialRampToValueAtTime(.001, t + dur * .4);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3800, t); lp.frequency.exponentialRampToValueAtTime(700, t + dur * .6);
    o.connect(gn); o2.connect(g2); g2.connect(gn); gn.connect(lp); lp.connect(this.out); const wg = c.createGain(); wg.gain.value = .6; lp.connect(wg); wg.connect(this.rev);
    o.start(t); o2.start(t); o.stop(t + dur + .1); o2.stop(t + dur + .1);
  },
  music() {
    const c = this.ctx; if (!c || this.muted || c.state !== 'running') { if (c) this._next = Math.max(this._next, c.currentTime + .2); return; }
    const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 784]; // 羽调五声
    while (this._next < c.currentTime + .3) {
      const fight = this.combat > .5, beat = fight ? .27 : .46, s = this._step++, t = this._next;
      if (s % 8 === 0) this.pluck(t, pick([110, 110, 146.83, 98]), .16, 3.2);
      if (this._mel === undefined) this._mel = 4;
      if (Math.random() < (fight ? .62 : .4)) { this._mel = clamp(this._mel + pick([-2, -1, -1, 1, 1, 2, 3, -3]), 0, scale.length - 1); this.pluck(t, scale[this._mel], fight ? .11 : .09, fight ? 1.2 : 2.2); if (Math.random() < .18) this.pluck(t + beat * .5, scale[clamp(this._mel + 1, 0, 9)], .06, 1.4); }
      if (fight) { if (s % 4 === 0) this.tone(t, 92, 44, .3, .34); if (s % 4 === 2 || s % 8 === 7) this.tone(t, 132, 70, .16, .16); if (s % 2 === 1) this.noise(t, .05, 5200, 3000, 2, .03, 'highpass'); }
      this._next += beat;
    }
  },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  swing(h = 0) { if (!this.ctx) return; this.noise(this.now(), .2 + h * .1, 700 + rand(300), 3200 + h * 800, 1.6, .2 + h * .1); },
  hit(h = 0) { if (!this.ctx) return; const t = this.now(); this.tone(t, 170, 46, .13 + h * .1, .4 + h * .2); this.noise(t, .09, 2600, 900, .9, .26); this.tone(t, rand(1500, 2300), 1200, .12, .07, 'triangle', .4); },
  clang() { if (!this.ctx) return; const t = this.now(); this.tone(t, 2100, 1900, .3, .1, 'triangle', .6); this.tone(t, 3170, 2900, .22, .06, 'sine', .6); this.noise(t, .05, 6000, 3000, 2, .14, 'highpass'); },
  hurt() { if (!this.ctx) return; const t = this.now(); this.tone(t, 120, 40, .25, .5); this.noise(t, .16, 900, 200, .7, .3, 'lowpass'); },
  dodge() { if (!this.ctx) return; this.noise(this.now(), .26, 400, 2400, .8, .14); },
  perfect() { if (!this.ctx) return; const t = this.now(); this.tone(t, 1318, 1318, .7, .1, 'sine', .9); this.tone(t + .05, 1975, 1975, .8, .07, 'sine', .9); },
  pick() { if (!this.ctx) return; this.tone(this.now(), rand(1000, 1500), 1900, .09, .035, 'sine', .3); },
  coin() { if (!this.ctx) return; const t = this.now(); this.tone(t, 2400, 2400, .08, .04, 'square'); this.tone(t + .05, 3200, 3200, .12, .035, 'square', .3); },
  skill() { if (!this.ctx) return; const t = this.now(); this.noise(t, .5, 300, 5200, 2.5, .22); this.tone(t, 440, 880, .4, .09, 'sawtooth', .5); },
  boom() { if (!this.ctx) return; const t = this.now(); this.tone(t, 90, 28, .6, .7); this.noise(t, .5, 500, 60, .6, .5, 'lowpass'); },
  bolt() { if (!this.ctx) return; const t = this.now(); this.noise(t, .3, 7000, 300, .5, .4, 'highpass'); this.tone(t, 60, 30, .4, .5); },
  level() { if (!this.ctx) return; const t = this.now();[392, 523.25, 659.25, 784, 1046.5].forEach((f, i) => this.pluck(t + i * .09, f, .16, 2.4)); },
  ui() { if (!this.ctx) return; this.pluck(this.now(), 659.25, .1, .8); },
  gong() { if (!this.ctx) return; const t = this.now();[82, 123.5, 164.8, 207].forEach((f, i) => this.tone(t, f * 1.02, f, 3.2 - i * .5, .26 - i * .04, 'sine', .8)); this.noise(t, .4, 900, 200, 1, .2); },
  bow() { if (!this.ctx) return; const t = this.now(); this.tone(t, 320, 140, .12, .16, 'triangle'); this.noise(t, .18, 2500, 5000, 3, .1); },
  cast() { if (!this.ctx) return; this.tone(this.now(), 180, 520, .45, .12, 'sawtooth', .7); },
  forge() { if (!this.ctx) return; const t = this.now(); for (let i = 0; i < 3; i++) { this.tone(t + i * .16, 1400 + i * 200, 900, .25, .14, 'triangle', .5); this.noise(t + i * .16, .05, 5000, 2000, 1, .2, 'highpass'); } },
  guard() { if (!this.ctx) return; this.noise(this.now(), .09, 2200, 900, 1.2, .1); },
  parry() { if (!this.ctx) return; const t = this.now(); this.tone(t, 2650, 2380, .55, .16, 'triangle', .9); this.tone(t, 3970, 3650, .4, .08, 'sine', .9); this.tone(t, 1320, 1180, .32, .1, 'sine', .5); this.noise(t, .06, 7000, 3500, 1.5, .26, 'highpass'); },
  block() { if (!this.ctx) return; const t = this.now(); this.tone(t, 900, 620, .2, .14, 'triangle', .3); this.noise(t, .1, 1600, 500, .8, .22); },
  glint() { if (!this.ctx) return; this.tone(this.now(), 3300, 4700, .18, .045, 'sine', .8); },
  danger() { if (!this.ctx) return; const t = this.now(); this.tone(t, 196, 150, .4, .14, 'sawtooth', .4); this.tone(t, 294, 230, .36, .06, 'square', .2); },
  exec() { if (!this.ctx) return; const t = this.now(); this.tone(t, 72, 28, .9, .8); this.noise(t, .45, 1200, 70, .7, .5, 'lowpass'); this.noise(t + .02, .12, 4200, 1500, 1, .3); this.tone(t, 1600, 900, .45, .08, 'triangle', .8); },
  charged() { if (!this.ctx) return; const t = this.now(); this.tone(t, 880, 1760, .22, .07, 'sine', .7); this.tone(t + .08, 1760, 1760, .6, .06, 'sine', .9); },
  flash() { if (!this.ctx) return; const t = this.now(); this.noise(t, .2, 500, 6500, 1.2, .24); this.tone(t, 1200, 2600, .22, .05, 'sine', .6); }
};

