// ======================= 声音 =======================
let AC = null, master = null, noiseBuf = null, muted = false;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const comp = AC.createDynamicsCompressor(); comp.connect(AC.destination);
    master = AC.createGain(); master.gain.value = 0.5 * SETTINGS.sfx; master.connect(comp);
    MUSIC.gain = AC.createGain(); MUSIC.gain.gain.value = 0.32 * SETTINGS.music; MUSIC.gain.connect(comp);
    MUSIC.fileGain = AC.createGain(); MUSIC.fileGain.gain.value = 0.5 * SETTINGS.music; MUSIC.fileGain.connect(comp);
    setTimeout(() => { if (MUSIC.mode) musicFileSet(MUSIC.mode); }, 0);
    // 简单混响：让刀声有空间感
    const verb = AC.createConvolver(), len = AC.sampleRate * 1.4, ir = AC.createBuffer(2, len, AC.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; const send = AC.createGain(); send.gain.value = 0.22;
    master.connect(send); send.connect(verb); verb.connect(comp);
    const msend = AC.createGain(); msend.gain.value = 0.45; MUSIC.gain.connect(msend); msend.connect(verb);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 1, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
// 第一次按下就把音频图建好：别让建图那几毫秒挤在按钮动画的第一帧里
window.addEventListener('pointerdown', () => { initAudio(); }, { capture: true, once: true });
// 水墨微声：主按钮与卡片鼠标悬停掠过时的毛笔轻拂声 (轻柔柔和，带防抖)
let lastBrushHoverT = 0;
document.addEventListener('pointerover', e => {
  if (!AC || (typeof muted !== 'undefined' && muted)) return;
  const t = performance.now();
  if (t - lastBrushHoverT < 120) return;
  const target = e.target;
  if (!target || typeof target.closest !== 'function') return;
  if (target.closest('.go, .mm-go, .ink-card, .bpcard')) {
    lastBrushHoverT = t;
    if (typeof SFX !== 'undefined' && typeof SFX.brush === 'function') SFX.brush();
  }
}, { passive: true });
function sNoise(dur, f0, f1, q, vol, type = 'bandpass') {
  if (!AC || muted || ![dur, f0, f1, q, vol].every(Number.isFinite)) return;   // 数值不对就不播，免得浏览器报错
  const t = AC.currentTime, src = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = noiseBuf; fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl).connect(g).connect(master); src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
}
function sTone(f0, f1, dur, vol, type = 'sine') {
  if (!AC || muted || ![f0, f1, dur, vol].every(Number.isFinite)) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
// 金属振动：几组不成整数倍的泛音，每组两个略微走音的正弦波产生“嗡嗡”的拍频，这就是刀身的声音
function metal(f0, dur, vol) {
  if (!AC || muted || ![f0, dur, vol].every(Number.isFinite)) return;
  const t = AC.currentTime, ratios = [1, 2.32, 4.25, 6.63, 9.38, 12.5];
  ratios.forEach((r, i) => {
    if (f0 * r > 15000) return;
    for (const det of [1, 1.0037]) {
      const o = AC.createOscillator(), g = AC.createGain();
      o.frequency.value = f0 * r * det;
      const v = vol * Math.pow(0.6, i) * (det === 1 ? 1 : 0.6), d = dur * Math.pow(0.7, i);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.02);
    }
  });
}
const SFX = {
  swing() { sNoise(0.16, 3400, 700, 2.2, 0.26); sNoise(0.06, 7000, 5000, 0.7, 0.05, 'highpass'); },          // 挥刀破风
  heavy() { sNoise(0.26, 2400, 380, 1.6, 0.34); sNoise(0.1, 6000, 3000, 0.7, 0.07, 'highpass'); },
  hit(p = 1) {                                                                                                  // 刀砍中
    sNoise(0.025, 9000, 4000, 0.7, 0.5 * p, 'highpass');     // 刃口的脆响
    sNoise(0.15, 4200, 900, 1.1, 0.42 * p);                  // 切开的嘶声
    metal(2000 + rand(-150, 150), 0.25, 0.05 * p);           // 刀身轻颤
    sTone(140, 42, 0.17, 0.5 * p);                           // 闷击
  },
  block() {                                                                                                 // 刀剑相击
    const f = rand(760, 880);
    sNoise(0.02, 10000, 5000, 0.7, 0.55, 'highpass');
    metal(f, 1.1, 0.16); metal(f * 1.51, 0.7, 0.07);
    sNoise(0.3, 6500, 2600, 7, 0.12);                        // 刃口摩擦的尾音
  },
  parry() {                                                                                                 // 招架、拼刀清脆鸣响
    const f = rand(980, 1120);
    sNoise(0.015, 12000, 6000, 0.8, 0.6, 'highpass');
    metal(f, 1.3, 0.22); metal(f * 1.62, 0.8, 0.1);
  },
  slice() { sNoise(0.02, 9000, 5000, 0.7, 0.35, 'highpass'); sNoise(0.08, 5000, 1500, 1.5, 0.22); metal(2500 + rand(-200, 200), 0.14, 0.035); },
  brush() { sNoise(0.06, 3200, 1100, 0.8, 0.045, 'bandpass'); },
  dash() { sNoise(0.2, 400, 1600, 0.7, 0.2, 'lowpass'); },
  jump() { sNoise(0.1, 600, 1200, 1, 0.08); },
  land() { sTone(95, 50, 0.1, 0.15); },
  thud() { sTone(80, 35, 0.3, 0.4); sNoise(0.2, 800, 100, 0.6, 0.3, 'lowpass'); },
  superOn() { sNoise(0.45, 1200, 7000, 9, 0.16); metal(1650, 1.4, 0.13); sTone(80, 40, 0.6, 0.3); },          // 拔刀出鞘
  ko() { metal(520, 2.2, 0.2); metal(780, 1.6, 0.1); sTone(130, 28, 1.1, 0.6); sNoise(0.8, 1600, 80, 0.5, 0.45, 'lowpass'); },
  charge() { sNoise(0.6, 800, 3200, 6, 0.07); },                                                            // 刀刃摩擦上扬
  chargeFull() { metal(1480, 1.2, 0.12); sNoise(0.25, 3000, 8000, 5, 0.08); },
  poof() { sNoise(0.35, 2600, 300, 0.8, 0.32, 'lowpass'); sNoise(0.12, 5000, 2000, 1, 0.1); sTone(620, 220, 0.12, 0.08, 'triangle'); },
  wood() { sTone(430, 180, 0.12, 0.3, 'triangle'); sNoise(0.08, 1800, 600, 2, 0.3); },
  thunder() { sNoise(0.04, 9000, 4000, 0.7, 0.6, 'highpass'); sNoise(0.9, 2500, 60, 0.5, 0.5, 'lowpass'); sTone(70, 30, 0.9, 0.5); },
  escape() { sNoise(0.25, 600, 5000, 1.2, 0.25); metal(1700, 0.5, 0.06); },
  gong() { metal(210, 2.4, 0.16); sTone(220, 200, 1.4, 0.12, 'triangle'); },
  note(n = 0) { const f0 = [660, 784, 880, 1047][Math.min(3, n | 0)]; sTone(f0, f0 * 0.995, 0.5, 0.12, 'triangle'); sTone(f0 * 2, f0 * 2, 0.25, 0.04); },   // 箫音
  drink() { sNoise(0.25, 500, 900, 3, 0.12); sTone(220, 160, 0.18, 0.08); },   // 咕嘟一口
  fire() { sNoise(0.45, 1800, 300, 0.6, 0.3, 'lowpass'); sNoise(0.2, 4000, 1500, 0.8, 0.08); },   // 喷火
  thunderHit(p = 1) {
    sNoise(0.035, 12000, 3500, 1.2, 0.65 * p, 'highpass');
    sTone(380, 75, 0.22, 0.45 * p, 'sawtooth');
    sTone(190, 40, 0.35, 0.55 * p, 'triangle');
    sNoise(0.28, 1800, 120, 0.7, 0.4 * p, 'lowpass');
  },
  frostHit(p = 1) {
    metal(3400, 0.45, 0.12 * p);
    metal(5200, 0.28, 0.08 * p);
    sNoise(0.06, 14000, 6000, 2.5, 0.4 * p, 'highpass');
    sTone(1200, 400, 0.18, 0.18 * p, 'sine');
  },
  windHit(p = 1) {
    sNoise(0.18, 5200, 1200, 2.8, 0.45 * p);
    sNoise(0.08, 8500, 3000, 1.4, 0.35 * p, 'highpass');
    sTone(260, 90, 0.15, 0.2 * p, 'sine');
  },
  fireHit(p = 1) {
    sNoise(0.32, 2200, 300, 0.8, 0.45 * p, 'lowpass');
    sNoise(0.12, 6000, 1800, 1.5, 0.28 * p, 'highpass');
    sTone(110, 35, 0.25, 0.35 * p, 'triangle');
  },
  inkHit(p = 1) {
    sNoise(0.22, 1600, 320, 2.2, 0.38 * p, 'bandpass');
    sTone(240, 80, 0.16, 0.3 * p, 'sine');
    metal(1200, 0.18, 0.04 * p);
  },
  // 武侠拟真呼吸吐纳与气势呼喝 (Procedural Martial Voice Shouts & Callouts)
  voiceKiai(pitch = 1) {
    if (!AC || muted) return;
    sTone(220 * pitch, 140 * pitch, 0.16, 0.32, 'sawtooth');
    sNoise(0.14, 1800, 600, 1.8, 0.22, 'bandpass');
  },
  voiceHurt(pitch = 1) {
    if (!AC || muted) return;
    sTone(160 * pitch, 85 * pitch, 0.18, 0.36, 'triangle');
    sNoise(0.12, 1200, 300, 1.2, 0.28, 'lowpass');
  },
  voiceUlt(pitch = 1) {
    if (!AC || muted) return;
    sTone(130 * pitch, 280 * pitch, 0.35, 0.42, 'sawtooth');
    metal(440 * pitch, 0.6, 0.15);
    sNoise(0.35, 2400, 800, 2.4, 0.35, 'bandpass');
  },
  // 武库的好皮肤：开出金一串往上走的铃音；非凡级命中“叮”一声，隐秘级命中“铮”一声
  sparkle() { [1318.5, 1661.2, 1975.5, 2637, 3322.4].forEach((f, i) => bellAt(f, i * 0.075, 1.2 - i * 0.1, 0.075)); },
  shine(p = 1) { bellAt(2093, 0, 0.55, 0.05 * p); bellAt(3136, 0.025, 0.4, 0.028 * p); },
  shing(p = 1) { sNoise(0.05, 9500, 6000, 0.8, 0.12 * p, 'highpass'); metal(1850, 0.3, 0.035 * p); },
};
// 铃：一个基音加两个不成整数倍的泛音，起音快、尾音长（delay 秒后响）
function bellAt(f, delay, dur, vol) {
  if (!AC || muted || ![f, delay, dur, vol].every(Number.isFinite)) return;
  const t = AC.currentTime + delay;
  for (const [r, v, d] of [[1, 1, 1], [2.76, 0.42, 0.55], [5.4, 0.16, 0.3]]) {
    if (f * r > 15000) continue;
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = f * r;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * d);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur * d + 0.03);
  }
}
function haptic(pattern = 15) {
  if (typeof navigator !== 'undefined' && navigator.vibrate && SETTINGS.vibrate !== false) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

// ======================= 原创音乐（全部由程序实时生成，不用任何现成曲子） =======================
// 五声音阶（宫商角徵羽）+ 拨弦（Karplus-Strong 算法模拟琴弦）+ 箫一样的长音 + 战鼓
const MUSIC = { mode: null, next: 0, step: 0, key: 0, gain: null, mel: 7, flute: 0 };
const PENTA = [0, 2, 4, 7, 9];
function applyVolumes() { if (!AC) return; master.gain.value = 0.5 * SETTINGS.sfx; if (MUSIC.gain) MUSIC.gain.gain.value = 0.32 * SETTINGS.music; if (MUSIC.fileGain) MUSIC.fileGain.gain.value = muted ? 0 : 0.5 * SETTINGS.music; }
function noteF(deg, oct = 0) { const o = Math.floor(deg / 5), k = ((deg % 5) + 5) % 5; return 146.83 * Math.pow(2, (MUSIC.key + 12 * (oct + o) + PENTA[k]) / 12); }
const PLUCK = {};
function pluckBuf(freq) {
  const key = Math.round(freq);
  if (PLUCK[key]) return PLUCK[key];
  const sr = AC.sampleRate, n = Math.floor(sr * 2.4), buf = AC.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const N = Math.max(2, Math.round(sr / freq)), ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  let ix = 0;
  for (let i = 0; i < n; i++) { const cur = ring[ix], nx = ring[(ix + 1) % N]; ring[ix] = 0.4985 * (cur + nx); d[i] = cur; ix = (ix + 1) % N; }
  return PLUCK[key] = buf;
}
function pluck(freq, t, vol) {
  if (muted) return;
  const src = AC.createBufferSource(), g = AC.createGain(), fl = AC.createBiquadFilter();
  src.buffer = pluckBuf(freq); fl.type = 'lowpass'; fl.frequency.value = 2800;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
  src.connect(fl).connect(g).connect(MUSIC.gain); src.start(t); src.stop(t + 2.4);
}
function flute(freq, t, dur, vol) {
  if (muted) return;
  const o = AC.createOscillator(), o2 = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), g = AC.createGain(), fl = AC.createBiquadFilter();
  o.type = 'triangle'; o.frequency.value = freq; o2.type = 'sine'; o2.frequency.value = freq * 2;
  lfo.frequency.value = 5; lg.gain.value = freq * 0.006; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  fl.type = 'lowpass'; fl.frequency.value = 2200;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const g2 = AC.createGain(); g2.gain.value = 0.25;
  o.connect(fl); o2.connect(g2).connect(fl); fl.connect(g).connect(MUSIC.gain);
  for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 0.05); }
}
function drum(t, kind, vol) {
  if (muted) return;
  if (kind === 'rim') {
    const src = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = noiseBuf; fl.type = 'highpass'; fl.frequency.value = 3000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(fl).connect(g).connect(MUSIC.gain); src.start(t, Math.random() * 0.5); src.stop(t + 0.06); return;
  }
  const big = kind === 'taiko', o = AC.createOscillator(), g = AC.createGain();
  o.frequency.setValueAtTime(big ? 120 : 230, t); o.frequency.exponentialRampToValueAtTime(big ? 46 : 120, t + (big ? 0.35 : 0.12));
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.5 : 0.18));
  o.connect(g).connect(MUSIC.gain); o.start(t); o.stop(t + 0.55);
  const src = AC.createBufferSource(), fl = AC.createBiquadFilter(), g2 = AC.createGain();
  src.buffer = noiseBuf; fl.type = 'lowpass'; fl.frequency.value = big ? 500 : 1400;
  g2.gain.setValueAtTime(vol * 0.5, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  src.connect(fl).connect(g2).connect(MUSIC.gain); src.start(t, Math.random() * 0.5); src.stop(t + 0.16);
}
function musicMode() {
  const on = id => document.getElementById(id).classList.contains('on');
  if (on('bp')) return 'bp';
  if (on('end')) return 'end';
  if (on('armory')) return 'gacha';   // 武库：藏锋阁
  if (M.mode === 'cpu' || M.mode === 'net' || M.mode === 'replay' || M.mode === 'tag3') return M.ot && M.phase === 'fight' ? 'overtime' : 'fight';
  if (M.mode === 'train') return 'practice';
  return 'menu';
}
// ======================= 背景音乐文件（music 文件夹） =======================
// 每个界面一首原创曲（管弦乐 + 古筝、笛子、二胡、尺八、太鼓，用音色库渲染再混音，录成首尾无缝的 mp3）；
// 切换时旧曲淡出、新曲淡入。加载失败就用程序生成的音乐
const MFILE = { menu: 'menu', bp: 'select', fight: 'battle', overtime: 'overtime', practice: 'practice', gacha: 'gacha' };
const MGAIN = { menu: 1, select: 1, battle: 1, overtime: 1, practice: 1, gacha: 1, victory: 1, defeat: 1, legendary: 1 };   // 新曲子录制时已按响度拉平
const MBUF = {}, MF = { name: null, g: null, srcs: [], tok: 0, tm: 0 };
// 音乐文件的网址（相对网页位置）；双击打开本地文件时没有，改用程序生成的音乐
function musicURL(name) {
  if (TOY_BUILD) return `music/${name}.mp3`;
  if (OFFLINE_BUILD || !/^https?:$/.test(location.protocol)) return null;
  return `assets/music/${name}.mp3?v=${VERSION}`;
}
function mload(name) {
  if (MBUF[name] !== undefined) return MBUF[name] instanceof Promise ? MBUF[name] : Promise.resolve(MBUF[name]);
  const embedded = window.MUSIC_DATA && window.MUSIC_DATA[name];   // 离线版：音乐打包在网页里
  const url = musicURL(name);                                       // 联网版：从 assets/music 下载
  if ((!embedded && !url) || (!embedded && !window.fetch) || !AC) { MBUF[name] = false; return Promise.resolve(false); }
  const raw = embedded
    ? Promise.resolve().then(() => { const b = atob(embedded.split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; })
    : fetch(url).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); });
  MBUF[name] = raw
    .then(ab => new Promise((ok, bad) => AC.decodeAudioData(ab, ok, bad))).then(b => (MBUF[name] = b)).catch(() => (MBUF[name] = false));
  return MBUF[name];
}
function musicFileOn() { const n = MF.name; return !!n && MBUF[n] !== false; }   // 正在用音乐文件（或正在加载）
function musicFileSet(mode) {
  if (!AC || !MUSIC.fileGain) return;
  const name = MFILE[mode] || null;
  if (MF.name === name && MF.g) return;
  if (MF.g) { const g = MF.g, ss = MF.srcs; g.gain.cancelScheduledValues(AC.currentTime); g.gain.setTargetAtTime(0, AC.currentTime, 0.3); setTimeout(() => ss.forEach(x => { try { x.stop(); } catch (e) {} }), 2500); }
  MF.name = name; MF.g = null; MF.srcs = []; clearTimeout(MF.tm);
  if (!name) return;
  const tok = ++MF.tok;
  mload(name).then(buf => { if (buf && tok === MF.tok) musicLoop(name, buf, tok); });
  // 顺便预加载其他曲子
  if (name === 'menu') setTimeout(() => { for (const n of ['select', 'battle', 'overtime', 'practice', 'victory', 'defeat', 'legendary']) mload(n); }, 3000);
}
function musicLoop(name, buf, tok) {   // 曲子本身首尾无缝，直接原生循环，不再交叉淡化（淡化会吃掉 0.3 秒，节拍会跳）
  const g = AC.createGain(), src = AC.createBufferSource();
  g.gain.value = 0; g.connect(MUSIC.fileGain); g.gain.setTargetAtTime(MGAIN[name] || 1, AC.currentTime, 0.4);
  src.buffer = buf; src.loop = true; src.connect(g); src.start(AC.currentTime + 0.05);
  MF.g = g; MF.srcs = [src];
}
function playSting(name, duck) {   // 胜利、失败、抽到传说
  if (!AC || !MUSIC.fileGain) return;
  mload(name).then(buf => {
    if (!buf) return;
    const src = AC.createBufferSource(), g = AC.createGain(); src.buffer = buf; g.gain.value = MGAIN[name] || 1;
    src.connect(g); g.connect(MUSIC.fileGain); src.start();
    if (duck && MF.g) { const v = MGAIN[MF.name] || 1, now = AC.currentTime; MF.g.gain.cancelScheduledValues(now); MF.g.gain.setTargetAtTime(v * 0.25, now, 0.08); MF.g.gain.setTargetAtTime(v, now + buf.duration, 0.5); }
  });
}
function musicSet(mode) {
  if (MUSIC.mode === mode) return;
  MUSIC.mode = mode; MUSIC.step = 0;
  musicFileSet(mode);
  if (mode === 'fight') MUSIC.key = [0, 5, -2, 3][(M.round - 1) % 4 || 0];
  else if (mode === 'menu') MUSIC.key = 0;
  if (AC) MUSIC.next = Math.max(MUSIC.next, AC.currentTime + 0.12);
}
// 往后排 0.3 秒的音符，保证节奏稳定
function musicTick() {
  if (!AC || !MUSIC.gain || AC.state !== 'running') return;
  if (MUSIC.fileGain) MUSIC.fileGain.gain.value = muted ? 0 : 0.5 * SETTINGS.music;
  if (musicFileOn() || (MUSIC.mode === 'end' && MBUF.victory)) { MUSIC.next = AC.currentTime + 0.05; return; }   // 有音乐文件时不放程序生成的
  if (MUSIC.next < AC.currentTime) MUSIC.next = AC.currentTime + 0.05;
  const ahead = AC.currentTime + 0.3;
  while (MUSIC.next < ahead) {
    const t = MUSIC.next, st = MUSIC.step++, m = { overtime: 'fight', practice: 'bp', gacha: 'menu' }[MUSIC.mode] || MUSIC.mode;
    if (m === 'menu') {                      // 慢板：琴声即兴 + 偶尔的箫
      MUSIC.next += 60 / 70 / 2;
      if (st % 16 === 0) { pluck(noteF(0, -1), t, 0.5); pluck(noteF(3, -1), t + 0.02, 0.3); }
      if (st % 2 === 0 && Math.random() < 0.62) {
        MUSIC.mel = clamp(MUSIC.mel + [-2, -1, -1, 1, 1, 2, 0][Math.random() * 7 | 0], 3, 12);
        pluck(noteF(MUSIC.mel), t, 0.32);
        if (Math.random() < 0.18) pluck(noteF(MUSIC.mel + 1), t + 0.09, 0.2);
      }
      if (st % 32 === 8 && Math.random() < 0.7) flute(noteF([7, 8, 9, 10][Math.random() * 4 | 0]), t, 3.2, 0.09);
    } else if (m === 'bp') {                  // 选人：拨弦固定音型 + 低鼓
      MUSIC.next += 60 / 96 / 2;
      const pat = [0, 2, 4, 2, 5, 4, 2, 1];
      pluck(noteF(pat[st % 8] + 5), t, 0.26);
      if (st % 8 === 0 || st % 8 === 6) drum(t, 'taiko', 0.45);
      if (st % 8 === 4) drum(t, 'rim', 0.18);
      if (st % 32 === 0) flute(noteF(9), t, 2.4, 0.07);
    } else if (m === 'fight') {               // 对战：战鼓 + 快速琵琶一样的拨弦；残血或最后 10 秒更急
      const ot = M.ot && M.phase === 'fight';
      const urgent = M.phase === 'fight' && (ot || M.timer < 8 || A.hp < A.maxHp * 0.25 || B.hp < B.maxHp * 0.25);
      MUSIC.next += 60 / (ot ? 164 : urgent ? 146 : 128) / 2;
      if (ot) { if (st % 2 === 0) drum(t, 'taiko', 0.5); if (st % 4 === 2) drum(t, 'small', 0.4); if (st % 16 === 0) flute(noteF(12), t, 0.9, 0.08); }
      const b = st % 8;
      if (b === 0 || b === 3 || b === 6) drum(t, 'taiko', b === 0 ? 0.6 : 0.42);
      if (b === 4) drum(t, 'small', 0.35);
      if (urgent && b % 2 === 1) drum(t, 'rim', 0.2);
      const arps = [[0, 2, 4, 7], [0, 3, 5, 7], [1, 4, 6, 9], [0, 2, 5, 8]];
      const arp = arps[Math.floor(st / 16) % 4];
      if (b % 2 === 0 || urgent) pluck(noteF(arp[(st >> (urgent ? 0 : 1)) % 4] + 5), t, 0.22);
      if (st % 64 === 32) flute(noteF(10), t, 2, 0.07);
    } else {                                  // 结算：一个收尾的和弦后安静
      MUSIC.next += 0.5;
      if (st === 0) { for (const d of [0, 2, 4, 7]) pluck(noteF(d + 5), t + d * 0.05, 0.28); }
    }
  }
}
setInterval(musicTick, 60);

