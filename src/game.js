'use strict';
/* =====================================================================
   刃影 v0.1 —— 扩展指南
   ---------------------------------------------------------------------
   POSES     角色的姿势。每个姿势写髋、颈、双手、双脚的位置和剑的角度，
             手肘和膝盖由程序自动算（反向运动学 IK），姿势之间会自动平滑过渡。
   MOVES     招式表。su 起手时间，ac 判定时间，rc 收招时间（秒），
             dmg 伤害，kb 击退速度 [横, 竖]，hs 顿帧时间，box 攻击范围，
             next 可以接哪一招，launch 是否挑空，spike 是否下砸。
   CHARS     8 个角色：属性、被动、Q 技能、E 大招、外观、电脑的站位习惯。
   SKILLS    Q 技能表；ULTS 大招表。想加新角色，在这三张表里各加一项就行。
   按键在 KEYS 里改；蓄力时间在 CHARGE_START / CHARGE_FULL 里调。
   联机代码在“联机（公共部分）”和“回滚联机”两节；服务器转发在 server.py，免服务器直连在 net-p2p.js。
   腾空闪冷却和被挑飞的滞空时间在 BREAK_CD / LAUNCH_GRAV 里调。
   右键招式在 SKILLS 表的“右键招式”一节，每个角色用 skill2 指定。设置在 SETTINGS，音乐在 MUSIC 一节。
   刀声在 SFX 里，metal() 用几组不成倍数的泛音模拟金属振动。
   ===================================================================== */

// ======================= 设置（保存在浏览器里） =======================
const SETTINGS = { bloom: 1.6, fps: 144, shake: 1.4, quality: 'high', blur: true, vig: 1, music: 0.7, sfx: 1, aim: true };
try {
  const saved = JSON.parse(localStorage.getItem('renying-settings') || '{}');
  Object.assign(SETTINGS, saved);
  // 消除任何旧配置里的自动/优化降级默认值，默认全部保持极高原生画质与 144 帧高刷
  if (!SETTINGS.quality || SETTINGS.quality === 'auto') SETTINGS.quality = 'high';
  if (SETTINGS.bloom === undefined || SETTINGS.bloom === 1) SETTINGS.bloom = 1.6;
  const ALLOWED_FPS = [144, 120, 60, 30];
  if (!SETTINGS.fps || !ALLOWED_FPS.includes(SETTINGS.fps)) SETTINGS.fps = 144;
} catch (e) {}
function saveSettings() { try { localStorage.setItem('renying-settings', JSON.stringify(SETTINGS)); } catch (e) {} }

// ======================= 基础 =======================
const VERSION = '4.5';         // 每次更新改一下，联机时双方版本必须一样
// 打包设置由 tools/build.py 写进 window.RENYING_BUILD（直接打开 src 里的文件时为空，按联网版处理）
const BUILD = window.RENYING_BUILD || {};
const OFFLINE_BUILD = !!BUILD.offline;   // 离线版：不连服务器，全部角色和皮肤可用
const TOY_BUILD = !!BUILD.toy;           // B站 Toy 版：在离线版基础上加全服排行榜
// 开发者临时全解锁特权（仅限当前窗口会话有效，关闭或新建窗口后自动恢复锁定，不污染真实云端存档）
let DEV_SESSION_UNLOCKED = false;
try {
  DEV_SESSION_UNLOCKED = sessionStorage.getItem('renying-dev-unlock') === '1';
} catch (e) {}
const cv = document.getElementById('c');
function refocusGame() {
  if (document.activeElement && document.activeElement !== cv && document.activeElement !== document.body) {
    try { document.activeElement.blur(); } catch (e) {}
  }
  try { cv.focus(); } catch (e) {}
  try { window.focus(); } catch (e) {}
}
let ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
const STEP = 1 / 120;                 // 逻辑每秒 120 次，在高刷屏上更顺
const STAGE_W = 1800, WALL = 60;
const GRAV = 2700, WALK = 280, JUMP_V = 980, DJUMP_V = 860, DASH_V = 840, DASH_T = 0.2, BUF = 0.16;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);          // 画面特效用（两边可以不一样）
// 对战用的随机数：两边用同一个种子，保证算出来的结果完全一样（回滚联机的基础）
const GRNG = { s: 1 };
function grnd() { let t = (GRNG.s = (GRNG.s + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const grand = (a, b) => a + grnd() * (b - a);
let RESIM = false;
const REC = { on: false }, REPLAY = { on: false, speed: 1, paused: false }, RP = { last: null };   // 对战回放：录制和播放的状态   // 回滚重算时为 true：不播特效和音效
const damp = (cur, target, k, dt) => target + (cur - target) * Math.exp(-k * dt);
const hash = k => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const TITLE_FONT = '"Ma Shan Zheng", "STKaiti", "KaiTi", serif';
const BODY_FONT = '"Noto Serif SC", "Songti SC", serif';

// ======================= 姿势（面朝右，单位像素，y 向上为负） =======================
const POSES = {
  idle:    { hip: [0, -48],  neck: [4, -88],   hf: [24, -64],  hb: [-2, -66],  ff: [16, 0],  fb: [-18, 0],  sw: -0.8 },
  jump:    { hip: [0, -56],  neck: [6, -95],   hf: [22, -80],  hb: [-18, -82], ff: [12, -26], fb: [-14, -14], sw: -1.1 },
  fall:    { hip: [0, -54],  neck: [3, -93],   hf: [24, -72],  hb: [-22, -76], ff: [14, -6],  fb: [-14, -20], sw: -0.5 },
  block:   { hip: [-3, -40], neck: [3, -78],   hf: [16, -72],  hb: [12, -64],  ff: [18, 0],  fb: [-20, 0],  sw: -1.7 },
  dash:    { hip: [4, -42],  neck: [28, -76],  hf: [-14, -56], hb: [-24, -62], ff: [26, -2], fb: [-30, -8], sw: 2.75 },
  bdash:   { hip: [-4, -46], neck: [-16, -82], hf: [16, -64],  hb: [-22, -70], ff: [16, -6], fb: [-26, 0],  sw: -0.6 },
  hurt:    { hip: [-6, -47], neck: [-18, -84], hf: [8, -56],   hb: [-30, -76], ff: [12, 0],  fb: [-18, 0],  sw: 1.1 },
  hurtAir: { hip: [0, -50],  neck: [-24, -78], hf: [-4, -96],  hb: [-36, -58], ff: [22, -36], fb: [10, -22], sw: -2.2 },
  lying:   { hip: [0, -7],   neck: [-38, -9],  hf: [-18, -3],  hb: [-46, -4],  ff: [40, -2], fb: [32, -6],  sw: 2.9 },
  getup:   { hip: [0, -30],  neck: [4, -66],   hf: [22, -36],  hb: [-18, -24], ff: [18, 0],  fb: [-18, 0],  sw: 0.4 },
  victory: { hip: [0, -50],  neck: [1, -90],   hf: [8, -118],  hb: [-14, -58], ff: [14, 0],  fb: [-16, 0],  sw: -1.57 },
  l1s: { hip: [-2, -48], neck: [0, -88],   hf: [2, -98],   hb: [-14, -72], ff: [16, 0], fb: [-18, 0], sw: -2.3 },
  l1a: { hip: [8, -46],  neck: [20, -84],  hf: [42, -60],  hb: [-10, -66], ff: [28, 0], fb: [-14, 0], sw: 0.35 },
  l2s: { hip: [4, -46],  neck: [12, -84],  hf: [20, -44],  hb: [-12, -68], ff: [22, 0], fb: [-14, 0], sw: 2.5 },
  l2a: { hip: [8, -48],  neck: [16, -88],  hf: [42, -78],  hb: [-16, -68], ff: [24, 0], fb: [-16, 0], sw: -0.55 },
  lcs: { hip: [-2, -46], neck: [-2, -86], hf: [-18, -64], hb: [8, -68], ff: [16, 0], fb: [-20, 0], sw: 3.05 },
  lca: { hip: [10, -44], neck: [22, -82], hf: [46, -62], hb: [-14, -66], ff: [28, 0], fb: [-16, 0], sw: 0.45 },
  lds: { hip: [0, -54], neck: [4, -96], hf: [-2, -112], hb: [-16, -90], ff: [14, -6], fb: [-18, 0], sw: -1.9 },
  lda: { hip: [14, -40], neck: [30, -74], hf: [48, -34], hb: [-6, -58], ff: [36, 0], fb: [-20, 0], sw: 1.1 },
  l3s: { hip: [-4, -44], neck: [-3, -84],  hf: [-4, -64],  hb: [-18, -68], ff: [14, 0], fb: [-24, 0], sw: 0.05 },
  l3a: { hip: [16, -42], neck: [36, -78],  hf: [62, -68],  hb: [-10, -62], ff: [42, 0], fb: [-18, 0], sw: 0.02 },
  hvs: { hip: [-4, -36], neck: [6, -74],   hf: [14, -26],  hb: [-22, -56], ff: [20, 0], fb: [-24, 0], sw: 1.9 },
  hva: { hip: [10, -56], neck: [20, -98],  hf: [32, -116], hb: [-16, -78], ff: [22, 0], fb: [-16, -6], sw: -1.35 },
  a1s: { hip: [0, -56],  neck: [4, -96],   hf: [6, -106],  hb: [-18, -82], ff: [12, -26], fb: [-14, -16], sw: -2.1 },
  a1a: { hip: [6, -54],  neck: [16, -92],  hf: [40, -54],  hb: [-14, -76], ff: [18, -24], fb: [-10, -14], sw: 0.85 },
  a2s: { hip: [-2, -58], neck: [-4, -98],  hf: [-10, -112], hb: [-24, -86], ff: [10, -30], fb: [-12, -22], sw: -2.5 },
  a2a: { hip: [6, -52],  neck: [18, -86],  hf: [30, -30],  hb: [-10, -70], ff: [20, -20], fb: [-8, -12], sw: 1.45 },
  sps: { hip: [-6, -36], neck: [-2, -74],  hf: [-14, -40], hb: [-6, -46],  ff: [22, 0], fb: [-28, 0], sw: 2.9 },
  charge: { hip: [-6, -38], neck: [-4, -76], hf: [-20, -46], hb: [-8, -50], ff: [22, 0], fb: [-26, 0], sw: 2.95 },
  spa: { hip: [20, -40], neck: [42, -76],  hf: [66, -62],  hb: [-14, -52], ff: [46, 0], fb: [-28, -4], sw: 0.08 },
  // 专属招式与大招姿势
  qf_charge: { hip: [0, -36], neck: [24, -72], hf: [-24, -48], hb: [14, -52], ff: [24, 0], fb: [-24, 0], sw: 3.1 },
  qf_thrust: { hip: [16, -42], neck: [38, -78], hf: [64, -66], hb: [-14, -60], ff: [44, 0], fb: [-20, 0], sw: 0.05 },
  fy_seal:   { hip: [-2, -42], neck: [4, -74], hf: [12, -72], hb: [6, -70], ff: [14, 0], fb: [-16, 0], sw: -1.2 },
  fy_crouch: { hip: [2, -26], neck: [22, -54], hf: [38, -38], hb: [-18, -44], ff: [28, 0], fb: [-22, 0], sw: 1.8 },
  fy_xslash: { hip: [10, -34], neck: [28, -66], hf: [48, -70], hb: [42, -32], ff: [32, 0], fb: [-18, 0], sw: -0.4 },
  ts_lift:   { hip: [-4, -44], neck: [-2, -86], hf: [-4, -135], hb: [12, -130], ff: [20, 0], fb: [-22, 0], sw: -1.6 },
  ts_slam:   { hip: [18, -36], neck: [34, -68], hf: [54, -22], hb: [36, -20], ff: [42, 0], fb: [-26, 0], sw: 1.2 },
  ts_shoulder:{ hip: [14, -38], neck: [36, -66], hf: [18, -50], hb: [-16, -56], ff: [34, 0], fb: [-26, 0], sw: 2.6 },
  ls_stance: { hip: [-8, -46], neck: [8, -82], hf: [24, -72], hb: [-18, -70], ff: [22, 0], fb: [-28, 0], sw: 0.1 },
  ls_thrust: { hip: [14, -42], neck: [34, -76], hf: [72, -70], hb: [-10, -64], ff: [46, 0], fb: [-24, 0], sw: 0.02 },
  ls_plant:  { hip: [0, -50], neck: [2, -92], hf: [18, -40], hb: [-14, -60], ff: [16, 0], fb: [-16, 0], sw: 1.57 },
  ly_fanswipe:{ hip: [-4, -48], neck: [6, -88], hf: [36, -92], hb: [-20, -68], ff: [18, 0], fb: [-18, 0], sw: -2.0 },
  ly_hover:  { hip: [0, -66], neck: [2, -104], hf: [28, -90], hb: [-28, -90], ff: [12, -32], fb: [-12, -32], sw: -0.8 },
  lm_boxer:  { hip: [2, -42], neck: [18, -76], hf: [28, -82], hb: [12, -80], ff: [24, 0], fb: [-18, 0], sw: 0 },
  lm_jab:    { hip: [14, -40], neck: [32, -76], hf: [58, -78], hb: [10, -74], ff: [38, 0], fb: [-18, 0], sw: 0 },
  lm_kick:   { hip: [0, -52], neck: [4, -90], hf: [14, -76], hb: [-16, -72], ff: [42, -100], fb: [-14, 0], sw: 0 },
  my_stroke: { hip: [-2, -46], neck: [8, -84], hf: [44, -104], hb: [-12, -60], ff: [24, 0], fb: [-20, 0], sw: -2.4 },
  my_paint:  { hip: [12, -44], neck: [26, -80], hf: [52, -50], hb: [-16, -64], ff: [34, 0], fb: [-18, 0], sw: 0.6 },
  yh_mirror: { hip: [-2, -44], neck: [2, -82], hf: [22, -84], hb: [16, -76], ff: [18, 0], fb: [-18, 0], sw: -1.4 },
  yh_lotus:  { hip: [0, -58], neck: [0, -96], hf: [16, -72], hb: [-16, -72], ff: [10, -42], fb: [-10, -42], sw: 0 },
  yl_dive:   { hip: [8, -42], neck: [32, -58], hf: [-18, -48], hb: [-24, -48], ff: [28, -18], fb: [14, -26], sw: 2.8 },
  yl_wings:  { hip: [0, -68], neck: [2, -106], hf: [42, -112], hb: [-42, -112], ff: [8, -36], fb: [-8, -36], sw: -1.5 },
};
const JOINTS = ['hip', 'neck', 'hf', 'hb', 'ff', 'fb'];

// ======================= 招式 =======================
const MOVES = {
  l1: { p: ['l1s', 'l1a'], su: .075, ac: .07, rc: .17, dmg: 5, kb: [170, 0], stun: .32, hs: .055, box: [8, -112, 82, -28], lunge: 150, next: { light: 'l2', heavy: 'hv' }, snd: 'swing' },
  l2: { p: ['l2s', 'l2a'], su: .07, ac: .07, rc: .18, dmg: 5, kb: [170, 0], stun: .32, hs: .055, box: [8, -108, 84, -36], lunge: 160, next: { light: 'l3', heavy: 'hv' }, snd: 'swing' },
  l3: { p: ['lcs', 'lca'], su: .075, ac: .075, rc: .18, dmg: 6, kb: [170, 0], stun: .34, hs: .06, box: [8, -96, 90, -10], lunge: 170, next: { light: 'l4', heavy: 'hv' }, snd: 'swing' },
  l4: { p: ['lds', 'lda'], su: .09, ac: .08, rc: .2, dmg: 7, kb: [180, 0], stun: .36, hs: .07, box: [6, -120, 92, -8], lunge: 180, next: { light: 'l5', heavy: 'hv' }, snd: 'heavy' },
  l6: { p: ['l1s', 'l1a'], su: .07, ac: .07, rc: .17, dmg: 3, kb: [110, 0], stun: .32, hs: .05, box: [8, -112, 82, -28], lunge: 120, next: { light: 'l7' }, snd: 'swing' },
  l7: { p: ['l2s', 'l2a'], su: .07, ac: .07, rc: .17, dmg: 3, kb: [110, 0], stun: .32, hs: .05, box: [8, -108, 84, -36], lunge: 120, next: { light: 'l8' }, snd: 'swing' },
  l8: { p: ['lcs', 'lca'], su: .07, ac: .07, rc: .17, dmg: 3, kb: [110, 0], stun: .32, hs: .05, box: [8, -96, 90, -10], lunge: 120, next: { light: 'l9' }, snd: 'swing' },
  l9: { p: ['lds', 'lda'], su: .07, ac: .07, rc: .17, dmg: 3, kb: [110, 0], stun: .34, hs: .06, box: [6, -120, 92, -8], lunge: 120, next: { light: 'l10' }, snd: 'swing' },
  l10: { p: ['l3s', 'l3a'], su: .09, ac: .08, rc: .24, dmg: 3, kb: [520, -260], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 260, launch: true, next: {}, snd: 'heavy' },
  l5: { p: ['l3s', 'l3a'], su: .1, ac: .09, rc: .28, dmg: 9, kb: [560, -240], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 300, launch: true, next: {}, snd: 'heavy' },
  hv: { p: ['hvs', 'hva'], su: .14, ac: .09, rc: .3, dmg: 11, kb: [80, -1020], stun: .6, hs: .11, box: [0, -150, 84, -8], lunge: 130, launch: true, jumpCancel: true, next: {}, snd: 'heavy' },
  a1: { p: ['a1s', 'a1a'], air: true, su: .06, ac: .09, rc: .14, dmg: 6, kb: [150, -430], stun: .4, hs: .065, box: [0, -84, 86, 6], next: { light: 'a2' }, snd: 'swing' },
  cs1: { p: ['charge', 'spa'], su: .04, ac: .12, rc: .06, knock: true, dmg: 10, kb: [620, -300], stun: .5, hs: .12, box: [0, -112, 112, -18], lunge: 900, launch: true, next: {}, snd: 'heavy' },
  cs2: { p: ['charge', 'spa'], su: .04, ac: .16, rc: .08, knock: true, dmg: 18, kb: [720, -720], stun: .6, hs: .2, box: [0, -120, 124, -10], lunge: 1350, launch: true, unblockable: true, big: true, next: {}, snd: 'heavy' },
  cf: { p: ['hvs', 'hva'], su: .05, ac: .1, rc: .26, dmg: 6, kb: [320, -420], stun: .45, hs: .08, box: [-6, -160, 104, -6], track: true, launch: true, next: {}, snd: 'swing' },
  a2: { p: ['a2s', 'a2a'], air: true, su: .08, ac: .09, rc: .22, dmg: 8, kb: [240, 1000], stun: .5, hs: .11, box: [-4, -70, 80, 24], spike: true, next: {}, snd: 'heavy' },
};
const FINAL = { ult: true, noScale: true, dmg: 14, kb: [520, -900], stun: .6, hs: .24, launch: true, unblockable: true };
const SP_SLASH = { ult: true, noScale: true, dmg: 2.5, kb: [0, 0], stun: .3, hs: .035, unblockable: true, hold: true };

// ======================= 角色 =======================
// stat：hp 生命，walk 移速倍率，speed 出招时间倍率（越小越快），dmg 伤害倍率，reach 攻击距离倍率
// skill 是 Q 技能，ult 是 E 大招，passive 是被动。beats/weakTo 只是给玩家看的克制关系说明。
const CHARS = [
  { id: 'qingfeng', name: '青锋', role: '游龙剑客', diff: 1, escCD: 8.5, skill: 'gale', skill2: 'swordqi', ult: 'crescent', passive: 'meter',
    passiveName: '剑意', passiveDesc: '剑意流转，聚气比常人快 8%。体量身法均称（1.00），剑气与疾风斩攻守自如。',
    stat: { hp: 105, walk: 1, speed: 1, dmg: 0.95, reach: 1, swing: 1, jump: 1, weight: 1.00, defRating: 1.00, guardMax: 100, guardStab: 1.00, guardChip: 0.11, guardRegen: 28, poise: 1.00, size: 1.00 }, meterMul: 1.08, hitFeel: 1,
    look: { body: '#e9eef6', shade: '#9aa6bd', outline: '#070914', outlineA: 1, scarf: '#46d3ea', slash: '120,230,255', blade: '#effcff', head: 'topknot', weapon: 'sword' },
    ai: { range: [70, 170] }, beats: ['moyu'], weakTo: ['yuehua'] },
  { id: 'feiying', name: '绯影', role: '暗影刺客', diff: 2, escCD: 9.5, skill: 'blink', skill2: 'kunai', ult: 'shadows', passive: 'swift',
    passiveName: '身轻', passiveDesc: '身法最快、出手最疾，但体格最轻薄（0.72）且气血偏薄（88）。格挡耐力极为脆弱（70），硬挡巨刃极易破防崩势，唯有以疾速、背刺与影遁分身取胜。',
    stat: { hp: 88, walk: 1.16, speed: 0.84, dmg: 1.05, reach: 0.92, swing: 0.8, jump: 1.08, weight: 0.72, defRating: 0.90, guardMax: 70, guardStab: 0.70, guardChip: 0.18, guardRegen: 22, poise: 1.14, size: 0.88 }, hitFeel: 0.8,
    moveMods: { l1: { dmgAbs: 5 }, l2: { dmgAbs: 5 }, l3: { dmgAbs: 6 }, l4: { dmgAbs: 7 }, l5: { dmgAbs: 9 } },
    look: { body: '#2d2336', shade: '#1b1422', outline: '#ff4a5f', outlineA: .85, scarf: '#ff3b52', slash: '255,95,115', blade: '#ffe6ea', head: 'hood', weapon: 'dual' },
    ai: { range: [60, 150] }, beats: ['liuyun', 'lingshuang'], weakTo: ['tieshan', 'yuehua'] },
  { id: 'tieshan', name: '铁山', role: '玄铁重甲', diff: 1, escCD: 7, skill: 'quake', skill2: 'ironwall', ult: 'avalanche', passive: 'armor',
    passiveName: '霸体', passiveDesc: '玄铁重甲冠绝群雄，气血极厚（140），体量威严（1.65）。重斩与蓄力斩自带霸体减伤40%，巨刃沉身格挡固若金汤（150架势/4%微伤），轻兵刃难以撼动其身。',
    stat: { hp: 140, walk: 0.84, speed: 1.20, dmg: 1.12, reach: 1.12, swing: 1.18, jump: 0.9, weight: 1.65, defRating: 1.15, guardMax: 150, guardStab: 1.85, guardChip: 0.04, guardRegen: 34, poise: 0.78, size: 1.14 }, hitFeel: 1.55,
    look: { body: '#6b6f7a', shade: '#44474f', outline: '#0c0c10', outlineA: 1, scarf: '#d9a441', slash: '255,200,120', blade: '#dcdfe6', head: 'helm', weapon: 'greatsword' },
    ai: { range: [70, 160] }, beats: ['feiying', 'leiming'], weakTo: ['liuyun', 'lingshuang', 'yanling'] },
  { id: 'lingshuang', name: '凌霜', role: '寒枪骁将', diff: 2, escCD: 8.5, skill: 'backthrust', skill2: 'spin', ult: 'timestop', passive: 'tip',
    passiveName: '枪尖', passiveDesc: '枪走一线：枪尖命中增伤 25% 且一挑冲天；贴身则力有不逮。枪长步稳（1.04体量），枪旋可拨开暗器并保持中线绝对压制。',
    stat: { hp: 100, walk: 0.98, speed: 1.05, dmg: 0.98, reach: 1.36, swing: 1.08, jump: 1, weight: 1.04, defRating: 1.02, guardMax: 110, guardStab: 1.20, guardChip: 0.09, guardRegen: 28, poise: 0.95, size: 1.02 }, hitFeel: 1.15,
    look: { body: '#dfe9f2', shade: '#8ea3b8', outline: '#0a1422', outlineA: 1, scarf: '#9fd4ff', slash: '170,220,255', blade: '#e8f6ff', head: 'ponytail', weapon: 'spear' },
    ai: { range: [115, 205] }, beats: ['tieshan', 'qingfeng'], weakTo: ['leiming', 'feiying', 'yanling'] },
  { id: 'liuyun', name: '流云', role: '御风散人', diff: 2, escCD: 9, skill: 'windblade', skill2: 'windstep', ult: 'tornado', passive: 'float',
    passiveName: '御风', passiveDesc: '御风而行，三段跳与风遁来去自如；龙卷自平地而起卷敌浮空。布衣身轻体薄（0.80体量/92血），折扇防守易受重压渗透（14%穿透），宜飘忽制胜。',
    stat: { hp: 92, walk: 1.12, speed: 0.88, dmg: 1.17, reach: 0.98, swing: 0.95, jump: 1.05, weight: 0.80, defRating: 0.96, guardMax: 85, guardStab: 0.85, guardChip: 0.14, guardRegen: 25, poise: 1.05, size: 0.98 }, jumps: 3, hitFeel: 0.9,
    look: { body: '#e8f3ea', shade: '#9cb8a4', outline: '#0b1a12', outlineA: 1, scarf: '#7fe0b0', slash: '150,255,200', blade: '#f0fff6', head: 'bun', weapon: 'fan' },
    ai: { range: [200, 380] }, beats: ['tieshan', 'yuehua', 'yanling'], weakTo: ['leiming', 'feiying'] },
  { id: 'leiming', name: '雷鸣', role: '雷拳武僧', diff: 1, escCD: 8, skill: 'thunderfist', skill2: 'stomp', ult: 'thunder', passive: 'chain',
    passiveName: '连环', passiveDesc: '十连快拳如骤雨，金刚体魄筋骨强横（118血/1.30体量）；架势耐力深厚且回涌极快（36/秒），防守沉稳，唯出拳收势空隙需防对手腾空闪。',
    stat: { hp: 118, walk: 1.18, speed: 0.68, dmg: 0.88, reach: 0.8, swing: 0.62, jump: 1, weight: 1.30, defRating: 1.08, guardMax: 125, guardStab: 1.45, guardChip: 0.06, guardRegen: 36, poise: 0.84, size: 1.05 }, scaling: 0.04, hitFeel: 0.8,
    moveMods: { l1: { dmgAbs: 3 }, l2: { dmgAbs: 3 }, l3: { dmgAbs: 3 }, l4: { dmgAbs: 3 }, l5: { dmgAbs: 3, kb: [110, 0], launch: false, lunge: 120, next: { light: 'l6', heavy: 'hv' } }, l6: { dmgAbs: 3 }, l7: { dmgAbs: 3 }, l8: { dmgAbs: 3 }, l9: { dmgAbs: 3 }, l10: { dmgAbs: 3 } },
    look: { body: '#3a2a22', shade: '#241913', outline: '#ffd84a', outlineA: .8, scarf: '#ffcf3a', slash: '255,230,120', blade: '#fff4c0', head: 'band', weapon: 'fists' },
    ai: { range: [45, 120] }, beats: ['liuyun', 'lingshuang'], weakTo: ['tieshan', 'yuehua'] },
  { id: 'moyu', name: '墨羽', role: '泼墨画师', diff: 3, escCD: 9, skill: 'inktrap', skill2: 'inksplash', ult: 'inkdragon', passive: 'brush',
    passiveName: '笔锋', passiveDesc: '墨韵宗师宗风深沉（1.10体量），墨阵定身强行封锁走位；墨水屏障加持架势耐力（115），蓄力挥洒自如，专破铁山等钝重武夫。',
    stat: { hp: 90, walk: 0.95, speed: 1.02, dmg: 1.06, reach: 1.12, swing: 1.05, jump: 1, weight: 1.10, defRating: 1.05, guardMax: 115, guardStab: 1.30, guardChip: 0.08, guardRegen: 30, poise: 0.90, size: 1.00 }, hitFeel: 1.1,
    moveMods: { l1: { dmgAbs: 4 }, l2: { dmgAbs: 4 }, l3: { dmgAbs: 4 }, l4: { dmgAbs: 4 }, l5: { dmgAbs: 4 }, cs1: { reachMul: 1.4 }, cs2: { reachMul: 1.4 } }, inkShot: true,
    look: { body: '#1c1c22', shade: '#101014', outline: '#c9c3b4', outlineA: .7, scarf: '#5a5a66', slash: '210,210,230', blade: '#222', head: 'hat', weapon: 'brush' },
    ai: { range: [150, 300] }, beats: ['tieshan', 'qingfeng'], weakTo: ['feiying', 'leiming'] },
  { id: 'yuehua', name: '月华', role: '月镜宗师', diff: 3, escCD: 8.5, skill: 'mirror', skill2: 'moonring', ult: 'moonflow', passive: 'regen',
    passiveName: '月华', passiveDesc: '月镜格开近战必出反斩锁定惩罚；体态仙灵（0.90体量/88血），自带月魄神罡（105架势/7%微透伤）与脱战自愈，以静制动。',
    stat: { hp: 88, walk: 1, speed: 0.88, dmg: 0.93, reach: 1, swing: 0.85, jump: 1, weight: 0.90, defRating: 1.04, guardMax: 105, guardStab: 1.25, guardChip: 0.07, guardRegen: 30, poise: 0.92, size: 0.96 }, hitFeel: 0.8,
    look: { body: '#f4eefc', shade: '#b3a6c9', outline: '#15102a', outlineA: 1, scarf: '#c9b6ff', slash: '215,195,255', blade: '#f6f0ff', head: 'moon', weapon: 'moonblade' },
    ai: { range: [80, 180] }, beats: ['leiming', 'feiying', 'qingfeng', 'yanling'], weakTo: ['liuyun', 'moyu'] },
  { id: 'yanling', name: '燕翎', role: '御空飞燕', diff: 2, escCD: 8.5, skill: 'dive', skill2: 'darts', ult: 'featherstorm', passive: 'flight',
    passiveName: '御空', passiveDesc: '一飞冲天，羽翼轻捷（0.84体量）；空中回避地面冲击，但空战格挡抗性偏低（80架势），一旦被重兵器挑中需速用腾空闪化解。',
    stat: { hp: 90, walk: 1.12, speed: 0.84, dmg: 1.14, reach: 1, swing: 0.85, jump: 1.05, weight: 0.84, defRating: 0.94, guardMax: 80, guardStab: 0.80, guardChip: 0.15, guardRegen: 24, poise: 1.08, size: 0.95 }, fly: 1.2, hitFeel: 0.9,
    look: { body: '#f2f6ff', shade: '#9fb1d6', outline: '#0b1030', outlineA: 1, scarf: '#6fa8ff', slash: '140,190,255', blade: '#eef4ff', head: 'feather', weapon: 'wing' },
    ai: { range: [80, 190] }, beats: ['tieshan', 'lingshuang'], weakTo: ['liuyun', 'yuehua'] },
];
const CHAR_IDX = Object.fromEntries(CHARS.map((c, i) => [c.id, i]));
// 墨羽的墨水：每甩一团墨消耗 INK_COST，每秒恢复 INK_REGEN
const INK_MAX = 100, INK_COST = 20, INK_REGEN = 10, INK_DMG = 4;
const WEAPON_LEN = { wing: 48, sword: 54, dual: 40, greatsword: 70, spear: 88, fan: 30, fists: 16, brush: 62, moonblade: 58 };
// 按角色属性生成每个角色自己的招式表
function buildMoves(ch) {
  const out = {}, st = ch.stat;
  for (const [k, m0] of Object.entries(MOVES)) {
    const m = JSON.parse(JSON.stringify(m0));
    Object.assign(m, (ch.moveMods || {})[k]);
    m.su *= st.speed; m.rc *= st.speed; m.ac *= st.swing || Math.sqrt(st.speed);
    m.dmg = m.dmgAbs !== undefined ? m.dmgAbs : Math.round(m.dmg * st.dmg * 10) / 10;
    const reach = st.reach * (m.reachMul || 1);
    m.box[2] = m.box[0] + (m.box[2] - m.box[0]) * reach;
    m.name = k; out[k] = m;
  }
  return out;
}
const CHAR_MOVES = CHARS.map(buildMoves);
const HEAVY_MOVES = ['hv', 'cs1', 'cs2'];

// ======================= 技能（Q） =======================
// 每个技能：cd 冷却，start 开始时，update 每一帧，pose 用哪个姿势，ai 电脑什么时候用
const SKILLS = {
  gale: { name: '疾风斩', cd: 5, pass: true, nofric: true, desc: '一步居合，身随刀走，直穿敌身；锋刃掠过处施加【居合斩穴】强定身（0.65 秒），并立即重置瞬步冲刺冷却。途中若遇墨阵，一刀两断。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.08) { f.skPh = 1; f.t = 0; f.vx = 1500 * f.face; f.invul = 0.12; f.hitDone = false; SFX.dash(); }
      if (f.skPh === 1) {
        // 破墨阵克制逻辑：穿过墨阵直接净化
        for (const p of projs) {
          if (p.kind === 'trap' && p.owner === foe.idx && Math.abs(p.x - f.x) < 80) {
            p.dead = true; smoke(p.x, -10, 8); SFX.slice();
            addP({ type: 'text', text: '破阵', x: p.x, y: -45, life: 0.6, max: 0.6, rgb: '120,230,255' });
          }
        }
        if (strike(f, foe, { box: [-10, -112, 92, 0], dmg: 7, kb: [180, 0], stun: 0.65, hs: 0.12 })) {
          f.dashCD = 0;
          addP({ type: 'text', text: '居合斩穴', x: f.x, y: f.y - 110, life: 0.8, max: 0.8, rgb: '120,230,255' });
        }
        if (f.t >= 0.18) { f.skPh = 2; f.t = 0; f.vx *= 0.2; }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 26] : f.skPh === 1 ? ['qf_thrust', 60] : ['idle', 14],
    ai: (me, foe, d) => d > 140 && d < 330 },
  blink: { name: '影遁', cd: 11, pass: true, desc: '结印入影，现身对手背后施展十字绞杀，附带【穴道封脉】强定身（0.8 秒）。此后 1.5 秒内，下一击威力暴涨 50%。',
    start() {},
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.14) {
        smoke(f.x, f.y - 50, 12);
        let nx = foe.x - foe.face * 70;
        if (nx < WALL || nx > STAGE_W - WALL) nx = foe.x + foe.face * 70;
        f.bbX = f.x; f.bbT = 1.5;
        f.x = clamp(nx, WALL, STAGE_W - WALL); f.y = Math.min(0, foe.y); f.vy = 0; f.vx = 0;
        f.face = foe.x >= f.x ? 1 : -1; f.buffT = 1.5;
        f.skPh = 1; f.t = 0; f.snap = true; f.trail.length = 0; f.scarf = [];
        smoke(f.x, f.y - 50, 10); SFX.poof();
        slashLine(foe.x, foe.y - 60, 0.5, '255,95,115'); slashLine(foe.x, foe.y - 60, -0.5, '255,95,115'); SFX.slice();
        if (foe.invul <= 0 && foe.hp > 0) {
          applyHit(f, foe, { dmg: 4, kb: [50, 0], stun: 0.8, hs: 0.12, noScale: true, dir: foe.x >= f.x ? 1 : -1 }, [foe.x, foe.y - 60]);
          addP({ type: 'text', text: '⚡ 封脉定身', x: foe.x, y: foe.y - 100, life: 1.0, max: 1.0, rgb: '255,100,120' });
        }
      }
      if (f.skPh === 1 && f.t >= 0.12) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 36] : ['fy_xslash', 40],
    ai: (me, foe, d) => d > 170 },
  quake: { name: '震地', cd: 8, desc: '双手擎刀，怒砸大地，地裂冲击波范围大增（扩大35%）。起手带霸体（3次抵挡），砸地直击施加【撼地重震】（0.85 秒重度脑震荡），把人掀上云霄。唯腾空者不受地裂所侵。',
    start(f) { f.armorT = 0.35; f.armorHits = 99; f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.22) {
        f.skPh = 1; f.t = 0; f.hitDone = false;
        shake = Math.max(shake, 16); dust(f.x, 0, 30); ring(f.x, 0, 160, '255,200,120', 0.4); SFX.thud(); SFX.heavy();
        for (const sd of [-1, 1]) spawnProj(f, { kind: 'quake', x: f.x + sd * 30, y: -22, vx: sd * 760, w: 96, h: 54, life: 0.9, dmg: 10, kb: [260, -840], stun: 0.55, hs: 0.12, launch: true, groundOnly: true, unbreakable: true });
        if (strike(f, foe, { box: [-45, -80, 110, 4], dmg: 8, kb: [260, -900], stun: 0.85, hs: 0.16, launch: true })) {
          addP({ type: 'text', text: '💥 撼地重震', x: f.x, y: f.y - 120, life: 0.9, max: 0.9, rgb: '255,200,120' });
        }
      }
      if (f.skPh === 1 && f.t >= 0.36) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_lift', 20] : ['ts_slam', 60],
    ai: (me, foe, d) => d < 420 && foe.onGround() },
  backthrust: { name: '回马枪', cd: 6, desc: '先退一步让开身位，再回身一枪极远距离直取咽喉（判定延伸至 235 像素）。枪尖极远端挑中触发【枪尖穿心】（0.85 秒穿心定身并冲天挑空）；枪旋余劲立时回转。',
    start(f) { f.vx = -f.face * 540; f.vy = -420; f.y = Math.min(f.y, -1); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.24) { f.skPh = 1; f.t = 0; f.vx = f.face * 180; f.hitDone = false; SFX.heavy(); }
      if (f.skPh === 1) {
        if (f.t < 0.12 && strike(f, foe, { box: [20, -104, 235, -44], dmg: 10, kb: [360, -820], stun: 0.85, hs: 0.16, launch: true })) {
          f.skill2CD *= 0.5;
          addP({ type: 'text', text: '枪尖穿心', x: foe.x, y: foe.y - 100, life: 0.8, max: 0.8, rgb: '170,220,255' });
        }
        if (f.t >= 0.34) toNeutral(f);
      }
    },
    pose: f => f.skPh === 0 ? ['ls_stance', 24] : ['ls_thrust', 60],
    ai: (me, foe, d) => d < 120 },
  windblade: { name: '风刃', cd: 1.3, air: true, desc: '挥扇生风，风刃体积扩大。此招【无长硬直】，但附带全场最强风暴推力（620 像素击退）；连飞羽轻镖也一并吹散。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.03) {
        f.skPh = 1; SFX.swing();
        if (f.twinT > 0) {
          f.twinT = 0;
          for (const vy of [-110, 110]) spawnProj(f, { kind: 'wind', x: f.x + f.face * 40, y: f.y - 62, vx: f.face * 1150, vy, w: 78, h: 66, life: 1.2, dmg: 5, kb: [580, -90], stun: 0.22, hs: 0.04 });
        } else spawnProj(f, { kind: 'wind', x: f.x + f.face * 40, y: f.y - 62, vx: f.face * 1180, w: 72, h: 62, life: 1.2, dmg: 7, kb: [620, -90], stun: 0.22, hs: 0.04 });
      }
      if (f.skPh === 1 && f.t >= 0.12) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ly_fanswipe', 32] : ['idle', 20],
    ai: () => true },
  thunderfist: { name: '雷闪', cd: 4, nofric: true, pass: true, desc: '身化雷光贴地疾冲（判定增大）。一拳贯穿附带【触电麻痹】（0.82 秒电击瘫痪硬直），冲刺途中自带霸体，为后续十连拳创造绝对破绽。',
    start(f) { f.armorT = 0.5; f.armorHits = 1; f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.1) { f.skPh = 1; f.t = 0; f.vx = f.face * 1500; f.hitDone = false; SFX.dash(); SFX.thunder(); }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-20, -110, 85, -10], dmg: 7, kb: [80, 0], stun: 0.82, hs: 0.14 })) {
          addP({ type: 'text', text: '⚡ 触电麻痹', x: foe.x, y: foe.y - 100, life: 1.0, max: 1.0, rgb: '255,240,120' });
        }
        if (Math.random() < 0.6) addP({ type: 'spark', x: f.x - f.face * 10, y: f.y - rand(20, 110), vx: -f.face * rand(100, 300), vy: rand(-100, 100), life: 0.2, max: 0.2, rgb: '255,240,150', w: 2 });
        if (f.t >= 0.26) { f.skPh = 2; f.t = 0; f.vx *= 0.15; f.armorT = 0; }
      }
      if (f.skPh === 2 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['lm_boxer', 28] : f.skPh === 1 ? ['lm_jab', 60] : ['idle', 14],
    ai: (me, foe, d) => d > 110 && d < 360 },
  inktrap: { name: '墨阵', cd: 6, desc: '提笔画出一池宽达 125 像素的巨幅墨阵。踏入者被浓墨完全锚定，陷入【深墨禁锢】（1.4 秒完全定身），寸步难移；再按 Q 可随时引爆。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.18) {
        f.skPh = 1; SFX.poof();
        for (const p of projs) if (p.kind === 'trap' && p.owner === f.idx) p.dead = true;
        spawnProj(f, { kind: 'trap', x: clamp(f.x + f.face * clamp(Math.abs(foeOf(f).x - f.x), 90, 260), WALL, STAGE_W - WALL), y: -6, vx: 0, w: 125, h: 28, life: 8, delay: 0.25, dmg: 5, kb: [0, 0], stun: 1.4, hs: 0.12, root: true, groundOnly: true });
      }
      if (f.skPh === 1 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 24] : ['my_paint', 40],
    ai: (me, foe, d) => d > 90 && d < 330 && !projs.some(p => p.kind === 'trap' && p.owner === me.idx) },
  dive: { name: '俯冲', cd: 3.5, air: true, desc: '猎鹰收翼斜下俯冲（判定扩大）。命中施加【鹰击钉地】（0.78 秒重度压制硬直）；自空中出手更可借力反弹回升并刷新技能。',
    start(f) { f.diveAir = !f.onGround(); if (f.onGround()) { f.vy = -720; f.vx = f.face * 200; f.y = -1; } else f.skPh = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.2) { f.skPh = 1; f.t = 0; }
      if (f.skPh === 1) {
        if (f.t < 0.02) { f.hitDone = false; SFX.dash(); }
        f.vx = f.face * 880; f.vy = 820;
        if (strike(f, foe, { box: [-16, -95, 96, 25], dmg: 12, kb: [260, 0], stun: 0.78, hs: 0.14 })) {
          addP({ type: 'text', text: '鹰击钉地', x: foe.x, y: foe.y - 80, life: 0.8, max: 0.8, rgb: '140,200,255' });
          f.vx *= 0.2; f.vy = -380;
          if (f.diveAir && !f.diveChained) { f.skillCD = 0; f.diveChained = true; }
        }
        if ((f.onGround() && f.t > 0.04) || f.t > 0.4) { f.skPh = 2; f.t = 0; f.vx *= 0.2; dust(f.x, 0, 10); }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['jump', 20] : f.skPh === 1 ? ['yl_dive', 50] : ['getup', 16],
    ai: (me, foe, d) => d > 110 && d < 360 },
  // ---------- 右键招式 ----------
  swordqi: { name: '剑气', cd: 5, desc: '沉步拔刀，横扫出一道宏大弧月剑气。中距离直接【掀天挑空】（无地面硬直，直接送上半空），暗器更不在话下。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) { f.skPh = 1; SFX.swing(); spawnProj(f, { kind: 'qi', x: f.x + f.face * 40, y: f.y - 65, vx: f.face * 880, w: 92, h: 96, life: 0.46, dmg: 9, kb: [180, -700], stun: 0.3, hs: 0.08, launch: true }); }
      if (f.skPh === 1 && f.t >= 0.32) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 30] : ['qf_thrust', 60], ai: (m, o, d) => d > 120 && d < 380 },
  kunai: { name: '飞镖', cd: 5, air: true, desc: '侧身一甩，四枚黑铁手里剑呈扇形激射。【无硬直击飞】，纯粹以极速密雨截断对手起手，穿透轻型投掷物。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; SFX.slice();
        for (const a of [-0.18, -0.06, 0.06, 0.18]) spawnProj(f, { kind: 'kunai', x: f.x + f.face * 30, y: f.y - 70, vx: f.face * 1250 * Math.cos(a), vy: 1250 * Math.sin(a), w: 26, h: 14, life: 0.55, dmg: 2.8, kb: [80, 0], stun: 0.16, hs: 0.02, launch: false });
      }
      if (f.skPh === 1 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 28] : ['fy_crouch', 50], ai: (m, o, d) => d > 140 },
  ironwall: { name: '铁壁冲', cd: 5, nofric: true, desc: '沉肩如山以狂暴重盾之势撞将过去（判定范围扩大）。撞击附带【崩山破势】（0.75 秒重度硬直与击退），且对格挡架势造成双倍摧毁！',
    start(f) { f.armorT = 0.55; f.armorHits = 99; f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.15) { f.skPh = 1; f.t = 0; f.vx = f.face * 740; f.hitDone = false; SFX.dash(); }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-10, -118, 90, 0], dmg: 10, kb: [560, -360], stun: 0.75, hs: 0.14, launch: true, big: true, guardBreakMul: 2.0 })) {
          addP({ type: 'text', text: '💥 崩山破势', x: f.x, y: f.y - 120, life: 0.9, max: 0.9, rgb: '255,200,100' });
          f.vx *= 0.2;
        }
        if (f.t >= 0.25) { f.skPh = 2; f.t = 0; f.vx *= 0.2; f.armorT = 0; }
      }
      if (f.skPh === 2 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_shoulder', 26] : ['ts_shoulder', 40], ai: (m, o, d) => d < 240 },
  spin: { name: '枪旋', cd: 6, nofric: true, desc: '长枪急旋如风车，弹开半径扩大至 125 像素。旋转前段【无强控硬直】，末了第 8 记以乾坤大横扫（10 伤害）将贴身之敌全额扫飞！',
    start(f) { f.vx = 0; f.spinN = 0; },
    update(f, foe) {
      const c = f.ctrl, dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
      f.vx = damp(f.vx, dir * wk(f) * 0.6, 10, STEP); f.face = faceDir(f, foe);
      // 弹开前方常规飞行道具
      for (const p of projs) {
        if (p.owner === foe.idx && !p.dead && !p.unbreakable) {
          if (Math.abs(p.x - f.x) < 125 && Math.abs(p.y - (f.y - 65)) < 85) {
            p.dead = true; blockFX(p.x, p.y, f.face); SFX.block();
            addP({ type: 'text', text: '破', x: p.x, y: p.y - 25, life: 0.45, max: 0.45, rgb: '170,220,255' });
          }
        }
      }
      const n = Math.floor(f.t / 0.25);
      if (n >= f.spinN && f.spinN < 8) {
        f.spinN++; f.hitDone = false; SFX.swing();
        const last = f.spinN === 8;
        strike(f, foe, last ? { box: [10, -135, 175, -10], dmg: 10, kb: [440, -700], stun: 0.65, hs: 0.14, launch: true, big: true }
                            : { box: [20, -126, 138, -14], dmg: 3.5, kb: [40, 0], stun: 0.12, hs: 0.02, launch: false, noScale: true });
      }
      if (f.t >= 2) toNeutral(f);
    },
    pose: () => ['ls_stance', 20], ai: (m, o, d) => d < 150 },
  windstep: { name: '风遁', cd: 4, air: true, nofric: true, pass: true, desc: '御风后翻瞬间在原地引爆【惊风退敌】斥力气旋（0.42 秒击退贴脸之敌）；下一发风刃亦得风势相助，一分为二。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0) {
        f.skPh = 1; f.invul = Math.max(f.invul, 0.15); f.twinT = 0.8; SFX.dash();
        ring(f.x, f.y - 50, 130, f.look.slash, 0.4); dust(f.x, 0, 14); SFX.swing();
        if (foe && Math.abs(foe.x - f.x) < 150 && Math.abs(foe.y - f.y) < 120 && foe.invul <= 0) {
          applyHit(f, foe, { dmg: 4, kb: [f.face * -420, -280], stun: 0.42, hs: 0.06, launch: true, noScale: true }, [foe.x, foe.y - 60]);
          addP({ type: 'text', text: '🌪️ 惊风退敌', x: f.x, y: f.y - 90, life: 0.8, max: 0.8, rgb: '140,255,200' });
        }
      }
      f.vx = -f.face * 950 * (1 - f.t / 0.24);
      if (Math.random() < 0.7) addP({ type: 'spark', x: f.x + f.face * 20, y: f.y - rand(20, 100), vx: f.face * 200, vy: rand(-40, 40), life: 0.25, max: 0.25, rgb: f.look.slash, w: 1.4 });
      if (f.t >= 0.24) toNeutral(f);
    },
    pose: () => ['ly_hover', 40], ai: (m, o, d) => d < 150 },
  stomp: { name: '雷踏', cd: 3.5, desc: '一脚踏落，前方轰然炸起通天巨型雷柱（宽 100 像素，高 460 像素，9 伤害）。垂直通天高空挑飞，将对手直接轰向穹顶。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.12) { f.skPh = 1; dust(f.x, 0, 12); SFX.thud(); spawnProj(f, { kind: 'bolt', x: clamp(f.x + f.face * 130, WALL, STAGE_W - WALL), y: -230, vx: 0, w: 100, h: 460, life: 0.42, delay: 0.15, dmg: 9, kb: [0, -840], stun: 0.65, hs: 0.12, launch: true, unbreakable: true, small: true }); }
      if (f.skPh === 1 && f.t >= 0.3) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['lm_kick', 24] : ['ts_slam', 50], ai: (m, o, d) => d > 80 && d < 240 },
  inksplash: { name: '泼墨', cd: 6, desc: '甩出一团重浓墨团（体积增大）。墨团爆裂不仅挑飞，还施加【墨迹遮目】（0.65 秒硬直 + 2.5 秒迟缓），大幅打乱对手反击步调。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.12) { f.skPh = 1; SFX.swing(); spawnProj(f, { kind: 'inkblob', x: f.x + f.face * 30, y: f.y - 90, vx: f.face * 580, vy: -460, g: 1500, lob: true, w: 50, h: 50, life: 1.4, dmg: 6, kb: [140, -480], stun: 0.65, hs: 0.08, launch: true }); }
      if (f.skPh === 1 && f.t >= 0.3) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 26] : ['my_paint', 50], ai: (m, o, d) => d > 150 && d < 420 },
  moonring: { name: '月轮', cd: 3.5, desc: '双月刃体积增大，脱手去程仅为快速轻削（无挑空）；自背后折返的一记附带【背袭破防】（0.78 秒强力击飞与晕眩），专破死守前方的架势。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) { f.skPh = 1; SFX.swing(); spawnProj(f, { kind: 'moonring', x: f.x + f.face * 40, y: f.y - 65, vx: f.face * 740, w: 56, h: 56, life: 1.8, dmg: 6, kb: [100, 0], stun: 0.25, launch: false, hs: 0.04, pierce: true, rehit: 0.3, maxHits: 2, boomer: true, turn: 0.38 }); }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yh_mirror', 28] : ['l2a', 50], ai: (m, o, d) => d > 120 && d < 400 },
  darts: { name: '翎羽', cd: 2.5, air: true, desc: '振翅激射三道极速破甲翎羽，贯穿全场。此技【不击飞、无长硬直】，专精于全屏连续穿刺牵制与打断，破尽突进节奏。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; SFX.slice();
        const air = f.y < -30;
        for (const k of [-1, 0, 1]) spawnProj(f, { kind: 'feather', x: f.x + f.face * 30, y: f.y - 70 + k * 14, vx: f.face * (air ? 880 : 1100), vy: air ? 580 + k * 90 : k * 45, w: 24, h: 36, life: 3, dmg: 3.5, kb: [100, 0], stun: 0.20, hs: 0.03, launch: false });
      }
      if (f.skPh === 1 && f.t >= 0.24) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yl_wings', 30] : ['a1a', 60], ai: (m, o, d) => d > 120 },
  mirror: { name: '月镜', cd: 7, nofric: true, desc: '举月轮如镜护胸，凝立 0.45 秒。近身来犯者被格开，随之而来的反斩施加【太阴绝罚】（14 伤害、1.05 秒超长硬直）与【禁身锁定】，无从闪避！',
    start(f) { f.parryT = 0.45; },
    update(f, foe) {
      if (f.skPh === 0) { const c = f.ctrl, dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0); f.vx = damp(f.vx, dir * wk(f), 14, STEP); } else f.vx = damp(f.vx, 0, 10, STEP);
      if (f.skPh === 0 && f.t >= 0.45) { f.skPh = 1; f.t = 0; f.parryT = 0; }
      if (f.skPh === 1 && f.t >= 0.35) toNeutral(f);
      if (f.skPh === 2) {
        if (f.t >= 0.06 && !f.hitDone) {
          f.hitDone = true;
          applyHit(f, foe, COUNTER, [foe.x, foe.y - 60]);
          foe.breakCD = Math.max(foe.breakCD, 0.75);
          addP({ type: 'text', text: '🌙 太阴绝罚 · 禁身锁定', x: foe.x, y: foe.y - 110, life: 1.1, max: 1.1, rgb: '220,190,255' });
        }
        if (f.t >= 0.42) toNeutral(f);
      }
    },
    pose: f => f.skPh === 0 ? ['yh_mirror', 40] : f.skPh === 2 ? ['hva', 60] : ['idle', 10],
    ai: () => false },
};
const COUNTER = { dmg: 14, kb: [440, -820], stun: 1.05, hs: 0.2, launch: true, big: true, unblockable: true, noScale: true };

// ======================= 大招（E） =======================
// flurry 类型沿用“冲刺后乱斩”的流程，其它类型用 begin / update 自己写
const ULTS = {
  crescent: { name: '残月', flurry: true, n: 6, iv: 0.1, slash: 2.5, fin: 14, land: true, desc: '纳刀起手，一记居合突刺撕开战局；既已斩中，六道残月剑气接踵绞杀，最后自空中劈落就地了断。终结斩落触发【剑意通明】：重置全技能与冲刺冷却，并回涌 20% 绝技气量。若突刺落空，门户大开。' },
  shadows: { name: '千影', flurry: true, n: 9, iv: 0.068, slash: 2.1, fin: 12, desc: '结印潜入暗影，贴地瞬步欺身而入；一击得手，九道猩红残像接连绝杀，收于双刃十字。绝杀达成触发【暗影绝杀】：重置影瞬与手里剑冷却，并幻化多道迷惑分身隐匿遁形。一旦扑空，任人宰割。' },
  avalanche: { name: '山崩', desc: '举巨刃蓄势一跃擎天，滞空期间可按方向键自由操控落点（亦可按 S 加速下砸），泰山压顶砸落（28 伤害，不可格挡），地裂石飞。直击命中敌方触发【怒意回涌】：强制震荡晕眩对手（1.3 秒），自身直接回涌 50% 绝技气量，并重置震地与铁壁冲冷却！',
    begin(f, foe) {
      f.sp = 'leap'; f.vy = -1050; f.y = -1;
      const c = f.ctrl, dir = (c && c.held && c.held.right ? 1 : 0) - (c && c.held && c.held.left ? 1 : 0);
      f.vx = dir * 360;
      f.spPose = 'ts_lift'; f.invul = 0.3; SFX.heavy();
    },
    update(f, foe) {
      if (f.sp === 'leap') {
        const c = f.ctrl;
        if (c && c.held) {
          const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
          if (dir !== 0) {
            f.vx = damp(f.vx, dir * 520, 10, STEP);
            f.face = dir;
          } else {
            f.vx = damp(f.vx, 0, 7, STEP);
          }
          if (c.held.down && f.t > 0.18 && f.vy > -300) {
            f.vy += 1400 * STEP;
          }
        }
        if (Math.random() < 0.35) {
          addP({ type: 'spark', x: f.x - f.face * 18, y: f.y - 65, vx: -f.face * rand(60, 160), vy: rand(-40, 40), life: 0.22, max: 0.22, rgb: '255,200,120', w: 2 });
        }
        f.vy += GRAV * STEP;
        if (f.t > 0.15 && f.y >= 0) {
          f.sp = 'slam'; f.t = 0; f.vx = 0; f.spPose = 'ts_slam'; f.snap = true;
          shake = 26; flashA = 0.4; flashRGB = '255,210,150'; dust(f.x, 0, 30); ring(f.x, 0, 240, '255,210,150', 0.4); ring(f.x, 0, 150, '255,255,255', 0.3); SFX.ko();
          for (const sd of [-1, 1]) spawnProj(f, { kind: 'quake', x: f.x + sd * 40, y: -22, vx: sd * 500, w: 80, h: 44, life: 0.3, dmg: 0, kb: [0, 0], stun: 0, hs: 0, fx: true, unbreakable: true, groundOnly: true });
          if (Math.abs(foe.x - f.x) < 170 && foe.y > -60 && foe.invul <= 0 && !foe.flying) {
            const dir = foe.x >= f.x ? 1 : -1;
            applyHit(f, foe, { dmg: 28, kb: [dir * 120, 0], stun: 1.3, hs: 0.25, root: true, unblockable: true, ult: true, noScale: true, dir, big: true }, [foe.x, foe.y - 40]);
            // 直击敌方：强制震荡晕眩 1.3 秒，自身直接回涌 50% 大招气量，重置自身全技能
            foe.state = 'hitstun'; foe.stun = 1.3; foe.rooted = true; foe.vx = dir * 60; foe.vy = 0; foe.y = 0;
            f.meter = Math.min(100, f.meter + 50);
            f.skillCD = 0; f.skill2CD = 0;
            ring(f.x, f.y - 60, 200, '255,200,120', 0.6);
            addP({ type: 'text', text: '⚡ 怒意回涌 +50% 气量', x: f.x, y: f.y - 130, life: 1.2, max: 1.2, rgb: '255,200,100' });
            addP({ type: 'text', text: '💫 震荡晕眩', x: foe.x, y: foe.y - 110, life: 1.3, max: 1.3, rgb: '255,220,120' });
            SFX.chargeFull();
          }
          // 地面碎裂：石块向两边飞溅
          for (const sd of [-1, 1]) for (let k = 0; k < 3; k++)
            spawnProj(f, { kind: 'rock', x: f.x + sd * (30 + k * 14), y: -30, vx: sd * (320 + k * 170), vy: -520 + k * 90, g: 1800, lob: true, w: 34, h: 30, life: 1.4, dmg: 6, kb: [220, -300], stun: 0.4, hs: 0.06, launch: true, ult: true, noScale: true, rot: grand(0, 6) });
        }
      } else if (f.sp === 'slam' && f.t >= 0.5) endSpecial(f);
    } },
  phoenix: { name: '百鸟朝凤', desc: '原地凝枪，向前连刺八道枪影，一枪远过一枪，末枪一挑把人送上半空。此招可挡。',
    begin(f) { f.sp = 'thrusts'; f.spN = 0; f.spPose = 'ls_stance'; f.invul = 0.2; },
    update(f, foe) {
      const n = Math.floor(f.t / 0.09);
      if (n >= f.spN && f.spN < 8) {
        const last = f.spN === 7; f.spN++;
        f.spPose = last ? 'ls_plant' : (f.spN % 2 ? 'ls_thrust' : 'ls_stance'); f.snap = true;
        slashLine(f.x + f.face * 130, f.y - 68 + rand(-18, 18), 0, f.look.slash); SFX.slice();
        if (foe.invul <= 0 && foe.hp > 0 && overlap(hitbox(f, [20, -112, 240, -28]), hurtbox(foe)))
          applyHit(f, foe, last ? { dmg: 10, kb: [520, -640], stun: 0.6, hs: 0.18, launch: true, big: true, ult: true, noScale: true }
                                : { dmg: 2.6, kb: [50, 0], stun: 0.36, hs: 0.03, ult: true, noScale: true }, [foe.x - f.face * 10, foe.y - 68]);
      }
      if (f.t >= 0.95) endSpecial(f);
    } },
  timestop: { name: '刹那', desc: '长枪拄地，凝神入定，天地为之一滞。漫天枪影泼洒开来，终归于一线寒芒，极速贯穿（12 到 22 伤害）。贯穿得手触发【寒霜贯日】：重置回马枪与枪旋冷却，并令对手陷入 4 秒冰冻迟缓（移速减慢 40%）。',
    begin(f, foe) { f.sp = 'stop'; f.spPose = 'ls_stance'; f.invul = 99; superFreeze = 0.9; superOwner = f; f.spX = f.x; f.hitDone = false; SFX.superOn(); },
    update(f, foe) {
      if (f.sp === 'stop' && f.t >= 0.45) {
        f.sp = 'sweep'; f.spPose = 'ls_thrust'; f.snap = true;
        for (let k = 0; k < 8; k++) slashLine(f.x, f.y - 60, k * Math.PI / 8, f.look.slash);
        ring(f.x, f.y - 60, 160, f.look.slash, 0.4); ring(f.x, f.y - 60, 90, '255,255,255', 0.3); SFX.slice(); metal(1800, 0.8, 0.1);
      }
      if (f.sp === 'sweep' && f.t >= 0.8) { f.sp = 'rush'; f.t = 0; f.spPose = 'ls_thrust'; f.face = foe.x >= f.x ? 1 : -1; f.spX = f.x; SFX.dash(); }
      if (f.sp === 'rush') {
        f.vx = f.face * 1700;
        if (!f.hitDone && foe.hp > 0 && overlap(hitbox(f, [0, -120, 90, 4]), hurtbox(foe))) {
          f.hitDone = true; f.vx = 0;
          const dmg = clamp(12 + Math.abs(f.x - f.spX) / 60, 12, 22);
          applyHit(f, foe, { dmg: Math.round(dmg), kb: [480, -700], stun: 0.6, hs: 0.2, launch: true, unblockable: true, big: true, ult: true, noScale: true }, [foe.x, foe.y - 60]);
          f.skillCD = 0; f.skill2CD = 0;
          foe.slowT = 4.0;
          ring(foe.x, foe.y - 60, 160, '170,220,255', 0.5);
          addP({ type: 'text', text: '❄️ 寒芒贯日 · 回马枪重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '170,220,255' });
          addP({ type: 'text', text: '❄️ 冰冻减速', x: foe.x, y: foe.y - 100, life: 1.2, max: 1.2, rgb: '140,200,255' });
          f.sp = 'done'; f.t = 0; f.spPose = 'ls_plant';
          SFX.chargeFull();
        } else if (f.t > 0.8 || f.x <= WALL || f.x >= STAGE_W - WALL) { f.sp = 'done'; f.t = 0; f.vx *= 0.2; f.spPose = 'ls_plant'; }
      }
      if (f.sp === 'done' && f.t >= 0.3) endSpecial(f);
    } },
  tornado: { name: '龙卷', desc: '舒袖展扇，乘风而起，放出两道接天龙卷横扫全场（每下 2 伤害）。施法激活【扶摇万里】：重置风刃与风遁冷却，空中跳跃次数全额回满，乘风浮空。',
    begin(f) {
      f.sp = 'cast'; f.spPose = 'ly_fanswipe'; f.invul = 0.2; f.spN = 0;
      f.skillCD = 0; f.skill2CD = 0; f.jumps = 0;
      addP({ type: 'text', text: '🌪️ 扶摇万里 · 风遁重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '150,255,200' });
      SFX.superOn();
    },
    update(f) {
      if (f.spN < 2 && f.t >= f.spN * 0.45) {
        const second = f.spN === 1; f.spN++;
        f.spPose = second ? 'ly_hover' : 'ly_fanswipe';
        spawnProj(f, { kind: 'tornado', x: f.x + f.face * 70, y: -110, vx: f.face * 360, w: 120, h: 230, life: 2.4, dmg: 2, kb: [40, -220], stun: 0.4, hs: 0.03, pierce: true, rehit: 0.12, maxHits: 8, launch: true, ult: true, unbreakable: true, noScale: true, lastBig: second });
        SFX.swing();
      }
      if (f.t >= 0.85) endSpecial(f);
    } },
  thunder: { name: '雷霆万钧', desc: '一拳击破长空，引落九天神雷。三道天雷循着对手踪迹直劈而下（每道 9 伤害，破防击飞）。引雷触发【雷帝灌顶】：重置奔雷拳与撼地冷却，自身直接回涌 30% 绝技气量！',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'lm_kick'; f.invul = 0.2;
      f.skillCD = 0; f.skill2CD = 0; f.meter = Math.min(100, f.meter + 30);
      addP({ type: 'text', text: '⚡ 雷帝灌顶 · 拳劲重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '255,230,120' });
      SFX.superOn();
    },
    update(f, foe) {
      const times = [0.02, 0.38, 0.74];
      if (f.spN < 3 && f.t >= times[f.spN]) {
        f.spN++;
        f.spPose = f.spN % 2 ? 'lm_boxer' : 'lm_kick';
        spawnProj(f, { kind: 'bolt', x: clamp(foe.x + foe.vx * 0.2, WALL, STAGE_W - WALL), y: -360, vx: 0, w: 76, h: 720, life: 0.62, delay: 0.46, dmg: 9, kb: [0, -620], stun: 0.5, hs: 0.1, launch: true, unblockable: true, ult: true, unbreakable: true, noScale: true });
      }
      if (f.t >= 1.2) endSpecial(f);
    } },
  inkdragon: { name: '墨龙', desc: '饱蘸浓墨，凌空一挥——墨即成龙！巨墨龙横扫全场（20 伤害，不可格挡）。泼墨触发【笔意长存】：墨水瞬间回满至 100%，重置墨阵与泼墨冷却，并在敌足下额外布下索敌墨印。',
    begin(f) {
      f.sp = 'cast'; f.spPose = 'my_stroke'; f.invul = 0.2; SFX.superOn();
    },
    update(f, foe) {
      if (f.t >= 0.15 && !f.hitDone) {
        f.hitDone = true; f.spPose = 'my_paint';
        spawnProj(f, { kind: 'dragon', x: f.x + f.face * 70, y: -60, vx: f.face * 760, w: 140, h: 96, life: 2, dmg: 20, kb: [520, -760], stun: 0.6, hs: 0.2, launch: true, unblockable: true, big: true, ult: true, unbreakable: true, noScale: true });
        f.ink = INK_MAX; f.skillCD = 0; f.skill2CD = 0;
        if (foe) spawnProj(f, { kind: 'trap', x: clamp(foe.x, WALL + 40, STAGE_W - WALL - 40), y: 0, vx: 0, w: 90, h: 24, life: 4.5, dmg: 4, kb: [0, 0], stun: 1.2, hs: 0.1, root: true, unblockable: true, trap: true, unbreakable: true, noScale: true });
        addP({ type: 'text', text: '🐉 笔意长存 · 墨韵回满', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '210,210,230' });
        SFX.chargeFull();
      }
      if (f.t >= 0.5) endSpecial(f);
    } },
  featherstorm: { name: '万羽', desc: '展翼直上九霄，唤来漫天破甲翎羽如暴雨倾泻（14 枚，每枚 2.2 伤害）。齐射触发【凌霄破虚】：重置俯冲突袭与翎羽射击冷却，御空飞行耐力全额回满。',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'yl_wings'; f.invul = 0.2;
      f.skillCD = 0; f.skill2CD = 0; f.flyT = f.ch.fly || 1.2;
      addP({ type: 'text', text: '🪶 凌霄破虚 · 俯冲重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '140,190,255' });
      SFX.superOn();
    },
    update(f, foe) {
      const n = Math.floor(f.t / 0.07);
      if (n >= f.spN && f.spN < 14) {
        f.spN++;
        f.spPose = f.spN % 2 ? 'yl_wings' : 'a1a';
        spawnProj(f, { kind: 'feather', x: clamp(foe.x + grand(-150, 150), WALL, STAGE_W - WALL), y: -620, vx: grand(-60, 60), vy: 1100, w: 22, h: 40, life: 1.2, dmg: 2.2, kb: [40, 0], stun: 0.3, hs: 0.02, ult: true, noScale: true, unbreakable: true });
      }
      if (f.t >= 1.1) endSpecial(f);
    } },
  moonflow: { name: '月华如水', desc: '双手结月印，盘坐入定。月华凝露，回复 22 点生命；月芒震退贴身之敌。绽放触发【太阴化生】：重置月镜架招与月轮回旋冷却，并获得 4 秒月魄霸体护盾（格挡硬直减伤）。',
    begin(f) {
      f.sp = 'wave'; f.spPose = 'yh_lotus'; f.invul = 0.5; f.hp = Math.min(f.maxHp, f.hp + 22); f.hitDone = false;
      f.skillCD = 0; f.skill2CD = 0; f.armorT = 4.0; f.armorHits = 3;
      ring(f.x, f.y - 60, 260, f.look.slash, 0.5); ring(f.x, f.y - 60, 180, '255,255,255', 0.4);
      addP({ type: 'text', text: '+22', x: f.x, y: f.y - 130, life: 0.9, max: 0.9, rgb: '180,255,200' });
      addP({ type: 'text', text: '🌙 月魄霸体 · 架招重置', x: f.x, y: f.y - 150, life: 1.1, max: 1.1, rgb: '215,195,255' });
      SFX.chargeFull();
    },
    update(f, foe) {
      if (f.t >= 0.1 && !f.hitDone) {
        f.hitDone = true;
        if (Math.abs(foe.x - f.x) < 260 && Math.abs(foe.y - f.y) < 200 && foe.invul <= 0)
          applyHit(f, foe, { dmg: 10, kb: [460, -640], stun: 0.6, hs: 0.15, launch: true, big: true, ult: true, noScale: true, dir: foe.x >= f.x ? 1 : -1 }, [foe.x, foe.y - 60]);
      }
      if (f.t >= 0.55) endSpecial(f);
    } },
};

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
  slice() { sNoise(0.02, 9000, 5000, 0.7, 0.35, 'highpass'); sNoise(0.08, 5000, 1500, 1.5, 0.22); metal(2500 + rand(-200, 200), 0.14, 0.035); },
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
};

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
  if (on('gacha')) return 'gacha';
  if (M.mode === 'cpu' || M.mode === 'net' || M.mode === 'replay') return M.ot && M.phase === 'fight' ? 'overtime' : 'fight';
  if (M.mode === 'train') return 'practice';
  return 'menu';
}
// ======================= 背景音乐文件（music 文件夹） =======================
// 每个界面一首；循环时首尾交叉淡化 0.3 秒；切换时旧曲淡出、新曲淡入。加载失败就用程序生成的音乐
const MFILE = { menu: 'menu', bp: 'select', fight: 'battle', overtime: 'overtime', practice: 'practice', gacha: 'gacha' };
const MGAIN = { menu: 1.55, select: 0.92, battle: 0.79, overtime: 0.78, practice: 1.17, gacha: 1.66, victory: 0.9, defeat: 1, legendary: 1 };   // 拉平响度
const MBUF = {}, MF = { name: null, g: null, srcs: [], tok: 0, tm: 0 };
// 音乐文件的网址（相对网页位置，GitHub Pages 和 server.py 都能用）；双击打开本地文件时没有，改用程序生成的音乐
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
  if (name === 'menu') setTimeout(() => { for (const n of ['select', 'battle', 'overtime', 'victory', 'defeat']) mload(n); }, 3000);
}
function musicLoop(name, buf, tok) {
  const g = AC.createGain(); g.gain.value = 0; g.connect(MUSIC.fileGain); g.gain.setTargetAtTime(MGAIN[name] || 1, AC.currentTime, 0.4);
  MF.g = g;
  const XF = 0.3; let t = AC.currentTime + 0.05;
  const sched = () => {
    if (tok !== MF.tok) return;
    const src = AC.createBufferSource(), eg = AC.createGain();
    src.buffer = buf; src.connect(eg); eg.connect(g);
    const end = t + buf.duration;
    eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(1, t + XF);
    eg.gain.setValueAtTime(1, end - XF); eg.gain.linearRampToValueAtTime(0, end);
    src.start(t); src.stop(end + 0.05);
    MF.srcs.push(src); if (MF.srcs.length > 3) MF.srcs.shift();
    t = end - XF;
    MF.tm = setTimeout(sched, Math.max(0, (t - AC.currentTime - 1.5) * 1000));
  };
  sched();
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

// ======================= 输入 =======================
let clock = 0;
class Ctrl {
  constructor() { this.held = { left: false, right: false, down: false, atk: false, jump: false }; this.atkT = 0; this.buf = {}; }
  press(a) { if (a === 'heavy') return; this.buf[a] = clock; if (this.rec) this.rec.push(a); }   // 重斩已取消
  consume(a) { const t = this.buf[a]; if (t !== undefined && clock - t <= BUF) { delete this.buf[a]; return true; } return false; }
  clear() { this.buf = {}; this.held.left = this.held.right = this.held.down = this.held.atk = this.held.jump = false; this.held.aim = 0; }
}
// 1P 攻击用鼠标（左键攻击/蓄力，右键重斩），其余用键盘；2P 全键盘
const DEFAULT_1P_KEYS = {
  left: 'KeyA', right: 'KeyD', jump: 'KeyW', jump2: 'Space', down: 'KeyS', dash: 'ShiftLeft', special: 'KeyE', skill: 'KeyQ', skill2: 'KeyR'
};
let custom1PKeys = { ...DEFAULT_1P_KEYS };
try {
  const savedKeys = JSON.parse(localStorage.getItem('renying-1p-keys') || '{}');
  if (savedKeys && typeof savedKeys === 'object') custom1PKeys = { ...DEFAULT_1P_KEYS, ...savedKeys };
} catch (e) {}
function keyLabel(code) {
  if (!code) return '无';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return '空格';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'Tab') return 'Tab';
  return code;
}
const KEYS = [
  {},
  { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'down', KeyK: 'atk', KeyJ: 'dash', KeyO: 'skill2', KeyI: 'special', KeyU: 'skill' },
];
function applyCustomKeys() {
  KEYS[0] = {};
  for (const [act, code] of Object.entries(custom1PKeys)) {
    if (code) {
      const realAct = act === 'jump2' ? 'jump' : act;
      KEYS[0][code] = realAct;
    }
  }
}
applyCustomKeys();
const CHARGE_START = 0.3;   // 按住攻击多久开始蓄力
const CHARGE_FULL = 0.75;   // 蓄力多久算满
const DODGE_CD = 0.3;
const BREAK_CD = 9;         // 腾空闪（按住左键再按右键）的冷却秒数
const LAUNCH_GRAV = 0.6;    // 被挑飞时的重力倍率，越小在空中越久
const human = [new Ctrl(), new Ctrl()];

// ======================= 联机（公共部分） =======================
// 两种连法，对战代码完全一样，只是消息走的路不同：
//   1. 服务器：server.py 转发消息（WebSocket），支持快速匹配、排位、账号、断线重连。
//   2. 直连：浏览器之间用 WebRTC 直接连（PeerJS 只负责牵线），不需要服务器，见 net-p2p.js。
// 房主叫 host（青锋那一边），加入的人叫 client。对战用“回滚联机”（见下面 ROLL 一节）：两边每帧只交换按键。
const NET = { role: null, ws: null, open: false, remote: new Ctrl(), out: [], presses: [] };
// 是否是从联机服务器打开的网页（而不是双击本地文件、GitHub Pages 或在线预览）
const SERVED = !OFFLINE_BUILD && /^https?:$/.test(location.protocol) && !/claude\.ai|claudeusercontent|anthropic|github\.io/.test(location.hostname);
const localIdx = () => M.mode === 'net' && NET.role === 'client' ? 1 : 0;
const isClient = () => M.mode === 'net' && NET.role === 'client' && !ROLL.on;
function netEmit(ev) { if (M.mode === 'net' && NET.role === 'host' && !ROLL.on) NET.out.push(ev); }
function netReset() {
  ROLL.on = false;
  rankUI(false);
  NET.matching = false; NET.hold = false; NET.awayUntil = 0; matchUI(false);
  if (NET.ws) { const w = NET.ws; NET.ws = null; try { w.close(); } catch (e) {} }
  p2pClose();
  NET.open = false; NET.out = []; NET.presses.length = 0; NET.remote.clear();
}
let savedNetMode = null;
try { savedNetMode = localStorage.getItem('renying-net-mode'); } catch (e) {}
let currentNetMode = savedNetMode || 'p2p';

function serverBase() {
  let v = ($id('srvIn') && $id('srvIn').value || '').trim().replace(/\/+$/, '');
  if (v) {
    if (/^https:\/\//.test(v)) return 'wss://' + v.slice(8);
    if (/^http:\/\//.test(v)) return 'ws://' + v.slice(7);
    return (/^[\d.]+(:\d+)?$/.test(v) || /^localhost/.test(v) ? 'ws://' : 'wss://') + v;
  }
  if (SERVED) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  return 'ws://127.0.0.1:8765';
}
// ---------- 断线重连用的信息，存在浏览器里（只有服务器模式能重连） ----------
function saveResume() {
  if (!NET.code || !NET.rt) return;
  try { localStorage.setItem('renying-resume', JSON.stringify({ base: NET.base, code: NET.code, rt: NET.rt, v: VERSION, at: Date.now() })); } catch (e) {}
}
function clearResume() { NET.code = NET.rt = null; try { localStorage.removeItem('renying-resume'); } catch (e) {} }
function loadResume() {
  try { const r = JSON.parse(localStorage.getItem('renying-resume') || 'null'); if (r && r.v === VERSION && Date.now() - r.at < 65000) return r; } catch (e) {}
  return null;
}
// 主动离开：告诉对方（或服务器）不用等我
function netLeave() {
  NET.leaving = true;
  if (NET.ws && NET.ws.readyState === 1) { try { NET.ws.send('{"bye":1}'); } catch (e) {} }
  p2pSend({ sys: 'left' });
  clearResume(); stopReconnect(); netReset();
}
// 建房 / 加入 / 匹配：根据所选模式或服务器自动路由
function netConnect(asHost, code, match, resume, ranked) {
  if (resume) {
    if (resume.base) return netConnectWS(asHost, code, match, resume, ranked);
    return;
  }
  if (match || ranked) {
    if (!SERVED) {
      netStatus('GitHub Pages 网页版无需服务器！点上方【建房】，把房间码发给好友；或输入房间码【加入】。');
      return;
    }
    if (currentNetMode !== 'server') {
      setNetMode('server');
      netStatus(match ? '快速匹配需用服务器，已自动切到局域网/本地服务器模式' : '排位赛需用服务器，已自动切到局域网/本地服务器模式');
    }
    return netConnectWS(asHost, code, match, resume, ranked);
  }
  if (currentNetMode === 'server') {
    return netConnectWS(asHost, code, match, resume, ranked);
  }
  netConnectP2P(asHost, code);
}
function netConnectWS(asHost, code, match, resume, ranked) {
  netReset();
  if (!resume) NET.isRanked = false;
  const base = resume ? resume.base : serverBase();
  if (!base) { netStatus('请先填入服务器网址'); return; }
  NET.asHost = asHost; NET.matching = !!match; NET.leaving = false; NET.base = base;
  if (resume) NET.hold = true;
  if (!resume) { $id('roomCode').textContent = ''; netStatus(match ? '正在寻找对手…' : asHost ? '正在建房…' : `正在加入房间 ${code}…`); }
  const q = resume ? `resume=${resume.code}&rt=${encodeURIComponent(resume.rt)}` : ranked ? 'rank=1' : match ? 'match=1' : asHost ? 'create=1' : 'join=' + encodeURIComponent(code);
  if (ranked) netStatus('正在寻找实力相近的对手…');
  let ws;
  try { ws = NET.ws = new WebSocket(`${base}/ws?${q}&v=${VERSION}&t=${encodeURIComponent(ACC.token || '')}`); }
  catch (e) { netStatus('服务器网址格式不对'); return; }
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    if (m.sys) onSys(m); else onNetMsg(m);
  };
  setTimeout(() => {   // 8 秒还没连上就放弃
    if (NET.ws === ws && ws.readyState === 0) { NET.ws = null; ws.onclose = null; try { ws.close(); } catch (e) {} ws.onerror(); }
  }, 8000);
  ws.onerror = () => { if (!NET.reconnT0) netStatus('连不上服务器：请确认房主终端已运行 python3 server.py（或在上方填入房主的 IP:8765）'); };
  ws.onclose = () => {
    if (ws !== NET.ws) return;
    NET.ws = null;
    if (NET.code && NET.rt && !NET.leaving && (NET.open || NET.reconnT0)) startReconnect();   // 对战中断线：自动重连
    else if (!NET.reconnT0) netLost();
  };
}
// ---------- 断线后每 2 秒尝试回到房间，最多 60 秒 ----------
let reconnTimer = null;
function startReconnect() {
  NET.open = false; NET.hold = true;
  if (!NET.reconnT0) NET.reconnT0 = performance.now();
  netOverlay('网络断了，正在重连…');
  clearTimeout(reconnTimer);
  reconnTimer = setTimeout(() => {
    if (performance.now() - NET.reconnT0 > 60000) { stopReconnect(); clearResume(); toMenu(); selectMode('net'); netStatus('断线太久，回不去那场对战了'); return; }
    if (!NET.ws) netConnect(false, null, false, { base: NET.base, code: NET.code, rt: NET.rt });
  }, 2000);
}
function stopReconnect() { clearTimeout(reconnTimer); NET.reconnT0 = 0; netOverlay(''); }
function netOverlay(text) { const o = $id('netOv'); o.textContent = text; o.classList.toggle('on', !!text); }
// 回来的一方需要的全部状态（由留下的一方发送）
function resyncPayload() {
  if (BP && BP.step < 4 && bpMode === 'net') return { k: 'bp', bp: BP };
  if (M.mode === 'net' && ROLL.on) return rollResumePayload();
  if (M.mode === 'net') return { k: 'match', ch: [A.chIdx, B.chIdx], s: snapshot(), end: M.phase === 'end' };
  return { k: 'idle' };
}
function applyResync(rs) {
  NET.hold = false; stopReconnect();
  if (rs.k === 'bp') { ensurePortraits(); BP = rs.bp; bpMode = 'net'; bpSel = -1; chatClear(); showScreen('bp'); renderBP(); }
  else if (rs.k === 'rmatch') rollResume(rs);
  else if (rs.k === 'match') {
    setChars(rs.ch[0], rs.ch[1]); setupNetMatch();
    applySnapshot(rs.s, true);
    BP = null; creditT = 0;
    if (rs.end && M.koWinner >= 0) showEnd(M.koWinner); else { showScreen(null); say('重归战局', 0.8, 'go'); }
  } else { toMenu(); selectMode('net'); netStatus('对手已退回菜单'); }
}
function onSys(m) {
  if (m.sys === 'oldver') {   // 这个网页是旧版本：自动刷新成新版本
    netReset(); netStatus(`游戏已经更新到 ${m.latest}（你这里还是 ${m.mine}），正在刷新…`);
    if (M.mode !== 'net') setTimeout(() => location.reload(), 1500);
    return;
  }
  if (m.sys === 'queue') { if (m.ranked) rankUI(true); else matchUI(true, m.n); return; }
  if (m.sys === 'needlogin') { netStatus('排位赛需先登录'); netReset(); return; }
  if (m.sys === 'room') { NET.code = m.code; NET.rt = m.rt; saveResume(); }
  if (m.sys === 'room' && m.resumed) { NET.role = m.role; NET.awaitSync = true; netOverlay('已重连，正在同步战局…'); return; }
  if (m.sys === 'ready' && m.resumed) { NET.names = m.names || {}; NET.open = true; return; }
  if (m.sys === 'away') {
    NET.hold = true; NET.awayUntil = performance.now() + m.t * 1000;
    return;
  }
  if (m.sys === 'back') {
    send({ rs: resyncPayload() });
    NET.hold = false; NET.awayUntil = 0; netOverlay('');
    say('对手已回座', 0.8, 'go');
    return;
  }
  if (m.sys === 'noresume') {
    stopReconnect(); clearResume(); netReset();
    if (M.mode === 'net' || bpMode === 'net') { toMenu(); selectMode('net'); }
    netStatus('方才那场对战已经结束了');
    return;
  }
  if (m.sys === 'room' && m.matched) {
    NET.role = m.role; NET.matching = false; matchUI(false); rankUI(false); NET.isRanked = !!m.ranked;
    netStatus(m.ranked ? '排位对手已找到！' : '对手已找到！'); SFX.chargeFull();
    return;
  }
  if (m.sys === 'room') {
    NET.role = m.role;
    if (m.role === 'host') {
      $id('roomCode').textContent = m.code;
      if ($id('copyCodeBtn')) $id('copyCodeBtn').classList.remove('hidden');
      netStatus('房间已建好。把上面的房间码发给朋友，静候他入局…');
    }
    else netStatus('入局成功，即刻选人…');
  } else if (m.sys === 'ready') { NET.names = m.names || {}; NET.tiers = m.tiers || {}; NET.open = true; onNetOpen(); }
  else if (m.sys === 'result') {
    if (m.me) setAcc(m.me);
    const kind = m.ranked ? '排行榜' : '切磋战绩', pm = m.won ? '+1 胜' : '+1 负', pr = m.prog || {};
    if (pr.profile) applyProfile(pr.profile);
    let t = m.forfeit ? (m.won ? `对手中途离席，这场算你赢（${kind} ${pm}）` : `中途离席，判负（${kind} ${pm}）`) : `${kind} ${pm}`;
    if (m.rk && pr.rank) {
      const up = pr.promo ? (pr.before && pr.before.idx < 0 ? ' · 定级完成！' : ' · 晋级！') : '';
      t = `排位赛 ${pr.delta >= 0 ? '+' : ''}${pr.delta} 分 · ${pr.rank.label}${up}`;
      if (pr.promo) { say(pr.rank.tier || pr.rank.label, 1.4, 'super'); SFX.gong(); }
    }
    if (pr.gain) t += ` · +${pr.gain} 墨锭`;
    $id('endRank').textContent = t; NET.lastResult = t;
  }
  else if (m.sys === 'left') { clearResume(); netLost(); }
  else if (m.sys === 'nf') { netStatus(NET.matching ? '这台服务器尚不支持快速匹配，请房主更新 server.py' : '找不到这个房间，请核对房间码'); netReset(); }
  else if (m.sys === 'full') { netStatus('这间房已经满员'); netReset(); }
  else if (m.sys === 'version') { netStatus(`你的版本与房主不同（房主是 ${m.need}），刷新网页再试`); netReset(); }
  else if (m.sys === 'busy') { netStatus('服务器房间已满，稍后再试'); netReset(); }
}
function send(o) {
  if (NET.ws && NET.ws.readyState === 1) { try { NET.ws.send(JSON.stringify(o)); } catch (e) {} }
  else p2pSend(o);
}
function onNetOpen() {
  netStatus('已连接');
  send({ pskin: PROF.equip || {} });
  initAudio();
  if (NET.role === 'host') bpStart('net');
  else netStatus('已连接，即刻选人…');
}
function netLost() {
  const was = M.mode === 'net' || bpMode === 'net';
  stopReconnect(); clearResume();
  netReset();
  if (was) { toMenu(); selectMode('net'); }
  $id('roomCode').textContent = '';
  netStatus(NET.lastResult && /中途离开/.test(NET.lastResult) ? NET.lastResult : '对方已离开房间，可重新建房或加入');
  NET.lastResult = '';
}
// 状态快照：房主每帧发一次
const FK = ['x', 'y', 'vx', 'vy', 'face', 'hp', 'meter', 'state', 't', 'invul', 'dashCD', 'jumps', 'airDash', 'stun', 'juggle', 'comboHits',
  'spiked', 'bounced', 'sp', 'slashN', 'finalDone', 'spFace', 'dashDir', 'lunged', 'hitDone', 'hitConfirmed', 'chargeFull', 'moveName', 'rot', 'breakCD',
  'skillCD', 'skPh', 'armorT', 'armorHits', 'parryT', 'buffT', 'skill', 'regenLeft', 'sinceHit', 'spN', 'spPose', 'rooted', 'flyT', 'flying', 'skill2CD', 'escInvul', 'escT', 'bbX', 'bbT', 'twinT', 'diveAir', 'diveChained', 'ink'];
// 同步数据用数组而不是对象，体积小一半多
function snapF(f) { return FK.map(k => f[k] === undefined ? null : r2(f[k])); }
// 被打的状态：这些一定听房主的
const VICTIM = ['hitstun', 'launched', 'knockdown', 'getup', 'held', 'blockstun'];
function applyF(f, arr, exact) {
  const o = {}; FK.forEach((k, i) => { o[k] = arr[i]; });
  const mine = !exact && f.idx === localIdx();
  if (mine && !VICTIM.includes(o.state) && !VICTIM.includes(f.state) && Math.abs(o.x - f.x) < 90 && Math.abs(o.y - f.y) < 90) {
    // 自己的角色：按键立刻生效，只同步血量、气和少量位置修正，不把自己拉回旧位置
    f.hp = o.hp; f.meter = o.meter; f.comboHits = o.comboHits; f.juggle = o.juggle; f.breakCD = o.breakCD;
    f.x += (o.x - f.x) * 0.08;
    return;
  }
  const ox = f.x, oy = f.y;
  for (const k of FK) f[k] = o[k];
  // 平滑修正：位置按房主的来，但画面上从旧位置慢慢滑过去（不影响判定）
  if (!exact && Math.abs(o.x - ox) < 90 && Math.abs(o.y - oy) < 90) { f.vox = (f.vox || 0) + ox - o.x; f.voy = (f.voy || 0) + oy - o.y; }
  else { f.vox = 0; f.voy = 0; }
  f.move = f.state === 'attack' && f.moveName ? f.moves[f.moveName] : null;
}
function snapshot() {
  return { f: [snapF(A), snapF(B)], m: [M.phase, M.t, M.round, M.wins, M.timer, M.koWinner], g: [r2(superFreeze), superOwner ? superOwner.idx : -1], p: projs.map(q => { const o = {}; for (const k in q) o[k] = r2(q[k]); return o; }) };
}
function applySnapshot(sn, exact) {
  applyF(A, sn.f[0], exact); applyF(B, sn.f[1], exact);
  [M.phase, M.t, M.round, M.wins, M.timer, M.koWinner] = sn.m;
  superFreeze = sn.g[0]; superOwner = sn.g[1] >= 0 ? [A, B][sn.g[1]] : null;
  if (superFreeze > 0 && !superOwner) superFreeze = 0;
  if (sn.p) { projs.length = 0; for (const q of sn.p) projs.push(q); }
}
function onNetMsg(msg) {
  if (msg.mstart || msg.report) return;
  if (msg.ru !== undefined) { rollRecv(msg); return; }
  if (msg.rstart) { rollStart(msg.rstart.ch, msg.rstart.seed); return; }
  if (msg.rsync) { rollAdopt(msg.rsync); return; }
  if (msg.rdesync) { if (NET.role === 'host') rollSendSync(); return; }
  if (msg.pg !== undefined) { send({ po: msg.pg }); return; }
  if (msg.po !== undefined) { const r = performance.now() - msg.po; NET.rtt = NET.rtt ? NET.rtt * 0.7 + r * 0.3 : r; return; }
  if (msg.spo !== undefined) { const r = performance.now() - msg.spo; NET.srtt = NET.srtt ? NET.srtt * 0.7 + r * 0.3 : r; return; }
  if (msg.chat) { chatRecv(msg.chat); return; }
  if (msg.rs) { applyResync(msg.rs); return; }
  if (msg.i) {
    const c = NET.remote, h = msg.i.h, wasAtk = c.held.atk;
    c.held.left = !!(h & 1); c.held.right = !!(h & 2); c.held.down = !!(h & 4); c.held.atk = !!(h & 8); c.held.jump = !!(h & 16); c.held.aim = (h & 64) ? ((h & 32) ? -1 : 1) : 0;
    if (c.held.atk && !wasAtk) c.atkT = clock;
    for (const a of msg.i.p) c.press(a);
  }
  if (msg.ev) for (const ev of msg.ev) playEvent(ev);
  if (msg.bps && NET.role === 'client') {
    if (!BP || BP.step !== msg.bps.step) bpSel = -1; BP = msg.bps; bpMode = 'net'; ensurePortraits(); if (BP.step < 4) showScreen('bp'); renderBP();
    if (!BP.avail || !BP.avail[1]) send({ avail: availList() });
  }
  if (msg.avail && NET.role === 'host') { NET.peerAvail = msg.avail; if (BP && BP.avail) { BP.avail[1] = msg.avail; send({ bps: BP }); renderBP(); } }
  if (msg.pskin) NET.peerSkins = msg.pskin;
  if (msg.bp !== undefined && NET.role === 'host' && BP && BP.step < 4 && BP_STEPS[BP.step][0] === 1) bpApply(msg.bp);
  if (msg.s && NET.role === 'client' && M.mode === 'net') applySnapshot(msg.s);
}
function playEvent(ev) {
  if (ev.e === 'hit') {
    const now = performance.now();
    while (predicted.length && now - predicted[0] > 400) predicted.shift();
    if (ev.a === localIdx() && predicted.length && !ev.ko) { predicted.shift(); hitVisual(ev, true); }
    else hitVisual(ev);
  }
  else if (ev.e === 'parry') parryVisual(ev);
  else if (ev.e === 'say') { say(ev.text, ev.dur, ev.style); if (ev.snd) SFX[ev.snd](); }
  else if (ev.e === 'round') {
    if (ev.ch) setChars(ev.ch[0], ev.ch[1]);
    if (M.mode !== 'net') { setupNetMatch(); MSTAT.maxcombo = 0; MSTAT.ults = 0; }
    applySkins();
    if (ev.r === 1) { send({ mstart: 1 }); $id('endRank').textContent = ''; }
    BP = null; showScreen(null);
    M.round = ev.r; M.wins = ev.w; startRound();
  } else if (ev.e === 'end') {
    M.wins = ev.wins; M.phase = 'end'; showEnd(ev.w);
  }
}
function netTick(dt) {
  // 排队时每 4 秒告诉服务器“我还在”，不然等久了会被当成掉线清出队列
  if (NET.matching && NET.ws && NET.ws.readyState === 1) { NET.kqAcc = (NET.kqAcc || 0) + dt; if (NET.kqAcc >= 4) { NET.kqAcc = 0; NET.ws.send(JSON.stringify({ kq: 1 })); } }
  if (M.mode !== 'net' && bpMode !== 'net') return;
  if (!NET.open) return;
  NET.pingAcc = (NET.pingAcc || 0) + dt;
  if (NET.pingAcc >= 1) { NET.pingAcc = 0; const now = performance.now(); send({ pg: now }); send({ sp: now }); if (NET.code) saveResume(); }
  if (M.mode !== 'net' || NET.hold || ROLL.on) return;
  const h = human[0].held;
  const hb = (h.left ? 1 : 0) | (h.right ? 2 : 0) | (h.down ? 4 : 0) | (h.atk ? 8 : 0) | (h.jump ? 16 : 0) | (h.aim < 0 ? 32 : 0) | (h.aim ? 64 : 0);
  NET.snapAcc = (NET.snapAcc || 0) + dt; NET.keepAcc = (NET.keepAcc || 0) + dt;
  const msg = {};
  if (hb !== NET.lastH || NET.presses.length || NET.keepAcc > 0.5) { msg.i = { h: hb, p: NET.presses.splice(0) }; NET.lastH = hb; NET.keepAcc = 0; }
  if (NET.role === 'host') {
    if (NET.snapAcc >= 1 / 60) { NET.snapAcc = 0; msg.s = snapshot(); }
    if (NET.out.length) msg.ev = NET.out.splice(0);
  }
  if (msg.i || msg.s || msg.ev) send(msg);
}
const r2 = v => typeof v === 'number' ? Math.round(v * 100) / 100 : v;
function setupNetMatch() {
  M.mode = 'net'; M.wins = [0, 0]; M.round = 1; M.carry = null; A.meter = B.meter = 0;
  human[0].clear(); NET.remote.clear(); NET.presses.length = 0; human[0].rec = NET.presses;
  A.ctrl = NET.role === 'host' ? human[0] : NET.remote;
  B.ctrl = NET.role === 'host' ? NET.remote : human[0];
}

// ======================= 电脑 AI =======================
const LEVELS = {
  easy:   { think: [0.35, 0.7],  block: 0.15, aggr: 0.4,  combo: 1 },
  normal: { think: [0.18, 0.42], block: 0.4,  aggr: 0.58, combo: 3 },
  hard:   { think: [0.08, 0.22], block: 0.72, aggr: 0.75, combo: 4 },
  impossible: { think: [0.012, 0.035], block: 0.99, aggr: 0.95, combo: 5, god: true },   // 绝顶：几乎零反应时间、必挡、被连必逃
};
// 个性化电脑：以困难为基础，按你对它的输赢自动调强弱；禁你胜率最高的角色，用你最常用的角色
const ADAPT = { s: 1, use: {}, win: {} };
function adaptKey() { return 'renying-adapt' + (ACC && ACC.name ? '-' + ACC.name : ''); }
function adaptLoad() { try { Object.assign(ADAPT, { s: 1, use: {}, win: {} }, JSON.parse(localStorage.getItem(adaptKey()) || '{}')); } catch (e) {} adaptLevel(); }
function adaptSave() { try { localStorage.setItem(adaptKey(), JSON.stringify(ADAPT)); } catch (e) {} }
function adaptLevel() {
  const k = clamp(ADAPT.s, 0.55, 1.45);
  LEVELS.adaptive = { think: [0.08 / k, 0.22 / k], block: Math.min(0.95, 0.72 * k), aggr: Math.min(0.95, 0.75 * k), combo: k > 1.1 ? 5 : 4 };
  const el = document.getElementById('adaptLine');
  if (el) { const fav = adaptFav(); el.textContent = `宿敌：如今强度 ${Math.round(k * 100)}%${fav.best >= 0 ? `，必禁你的${CHARS[fav.best].name}` : ''}${fav.most >= 0 ? `，惯用你的${CHARS[fav.most].name}` : ''}`; }
}
function adaptFav() {   // 你最常用的角色、胜率最高的角色（至少打过 3 场）
  let most = -1, best = -1, mu = 0, bw = -1;
  CHARS.forEach((c, i) => {
    const u = ADAPT.use[c.id] || 0, w = ADAPT.win[c.id] || 0;
    if (u > mu) { mu = u; most = i; }
    if (u >= 3 && w / u > bw) { bw = w / u; best = i; }
  });
  return { most, best: best >= 0 ? best : most };
}
function adaptRecord(won) {   // 每场打完：记录你用的角色和输赢；宿敌按输赢调强弱
  const me = [A, B][localIdx()];
  ADAPT.use[me.ch.id] = (ADAPT.use[me.ch.id] || 0) + 1;
  if (won) ADAPT.win[me.ch.id] = (ADAPT.win[me.ch.id] || 0) + 1;
  if (M.mode === 'cpu' && M.level === 'adaptive') ADAPT.s = clamp(ADAPT.s + (won ? 0.07 : -0.07), 0.55, 1.45);
  adaptSave(); adaptLevel();
}
const AI_COMBOS = [
  [['light', 0], ['light', 0.12], ['light', 0.24], ['light', 0.36], ['light', 0.48], ['light', 0.6], ['light', 0.72], ['light', 0.84], ['light', 0.96], ['light', 1.08]],
  [['light', 0], ['light', 0.17], ['light', 0.34], ['light', 0.52], ['light', 0.72]],
  [['light', 0], ['light', 0.17], ['light', 0.34]],
  [['heavy', 0]],
  [['light', 0], ['light', 0.17], ['heavy', 0.34]],
  [['light', 0], ['light', 0.17], ['heavy', 0.34], ['jump', 0.62], ['light', 0.78], ['light', 0.96], ['heavy', 1.2]],
];
// 进阶技巧：只有稀有和传说角色有，让技能更复杂，但不直接变强
const ADV = {
  moyu: '墨阵尚在场时再按 Q——引爆，阵中之敌受 4 伤害，被墨浪掀飞。',
  yuehua: '月镜格开一击后，月轮立时冷却完毕，可顺势再放一轮。',
  yanling: '自空中起手的俯冲一旦命中，此技立时冷却完毕，落地前可再冲一次（每次落地前只刷新一次）。',
  feiying: '影遁之后 1.5 秒内再按 Q——影归，瞬息退回遁走前的位置。',
  liuyun: '风遁之后 0.8 秒内，下一发风刃一分为二（每道 5 伤害）。',
  lingshuang: '回马枪得手后，枪旋余下的冷却减半。',
};
function trySecondQ(f, foe) {
  if (f.skillCD <= 0 || M.phase !== 'fight' || !['idle', 'walk', 'air'].includes(f.state)) return false;
  const c = f.ctrl;
  if (f.ch.id === 'moyu') {
    const p = projs.find(q => q.kind === 'trap' && q.owner === f.idx && !q.dead);
    if (!p || !c.consume('skill')) return false;
    p.dead = true; ring(p.x, -20, 95, '30,30,40', 0.3); SFX.thud();
    for (let i = 0; i < 14; i++) addP({ type: 'ink', x: p.x + rand(-40, 40), y: -6, vx: rand(-200, 200), vy: rand(-420, -120), g: 1200, life: 0.6, max: 0.6, r: rand(2, 4), rgb: '15,15,22' });
    if (foe.invul <= 0 && foe.hp > 0 && Math.abs(foe.x - p.x) < 95 && foe.y > -130)
      applyHit(f, foe, { dmg: 4, kb: [120, -460], stun: 0.45, hs: 0.08, launch: true, noScale: true, dir: foe.x >= p.x ? 1 : -1 }, [foe.x, foe.y - 40]);
    return false;
  }
  if (f.ch.id === 'feiying' && f.bbT > 0 && c.consume('skill')) {
    smoke(f.x, f.y - 50, 10); f.x = f.bbX; f.bbT = 0; f.trail.length = 0; f.scarf = []; smoke(f.x, f.y - 50, 8); SFX.poof();
  }
  return false;
}
// ======================= 闯关模式：六章，每章前四关打妖物，第五关挑战守关高手 =======================
const FOREST = { on: false, mons: [], shots: [], spawnT: 0, kills: {}, total: 0, t: 0, hurtT: 0 };
const MON_TYPES = {
  blade: { name: '刀鬼', kind: '近身', hp: 30, spd: 150, w: 24, h: 104, eye: '255,70,60' },
  archer: { name: '弓妖', kind: '远射', hp: 22, spd: 120, w: 20, h: 100, eye: '120,255,140' },
  binder: { name: '缚灵', kind: '缠缚', hp: 26, spd: 90, w: 24, h: 96, eye: '200,120,255', float: true },
  caster: { name: '咒师', kind: '术法', hp: 24, spd: 100, w: 22, h: 108, eye: '255,170,60' },
  owl: { name: '夜枭', kind: '飞空', hp: 18, spd: 220, w: 30, h: 40, eye: '255,230,90', fly: true },
};
const MON_KEYS = Object.keys(MON_TYPES);
// 妖物的强度：按难度值线性增长（闯关时第几个妖物关决定难度值）
function waveK(w) {
  const n = Math.max(0, w - 1);
  return { hp: 1 + 0.12 * n, dk: 1 + 0.1 * n, spd: 1 + 0.03 * n, cdk: 1 / (1 + 0.05 * n), wk: Math.max(0.55, 1 - 0.022 * n),
    cap: 3 + Math.floor(w / 3), gap: Math.max(0.45, 2 - 0.07 * n), prot: Math.max(0.3, 0.7 - 0.02 * n) };
}
// 每章：妖物种类越来越多；第五关的守关高手和电脑难度
const CHAPTERS = [
  { name: '竹林', pool: ['blade', 'archer'], boss: 'tieshan', lv: 'easy' },
  { name: '古寺', pool: ['blade', 'archer', 'owl'], boss: 'liuyun', lv: 'normal' },
  { name: '雪岭', pool: ['blade', 'archer', 'owl', 'binder'], boss: 'lingshuang', lv: 'normal' },
  { name: '血月谷', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'feiying', lv: 'hard' },
  { name: '月宫', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'yuehua', lv: 'hard' },
  { name: '墨渊', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'moyu', lv: 'impossible' },
];
const LV_NAME = { easy: '入门', normal: '寻常', hard: '劲敌', impossible: '绝顶' };
const stageId = (c, l) => `${c + 1}.${l + 1}`;   // c 第几章、l 第几关，都从 0 开始
// 一关的内容：妖物关每一波出哪些妖物是固定的（每次打都一样）
function stageInfo(c, l) {
  const C = CHAPTERS[c], id = stageId(c, l);
  if (l === 4) return { c, l, id, C, boss: true };
  const g = c * 4 + l;   // 第几个妖物关（从 0 开始），决定难度
  const fresh = C.pool.find(k => c > 0 && !CHAPTERS[c - 1].pool.includes(k)) || (c === 0 ? 'blade' : null);   // 这一章新出现的妖物
  const nw = 2 + (l >= 2 ? 1 : 0) + (c >= 3 ? 1 : 0), waves = [];
  for (let w = 0; w < nw; w++) {
    const list = [];
    for (let i = 0, n = 2 + Math.floor(g / 4) + w; i < n; i++)
      list.push(l === 0 && w === 0 && fresh ? fresh : C.pool[Math.floor(hash(g * 131 + w * 17 + i * 7 + 3) * C.pool.length)]);
    waves.push(list);
  }
  return { c, l, id, C, boss: false, waves, K: waveK(1 + g * 0.45) };
}
function nextStage(S) { return S.l < 4 ? [S.c, S.l + 1] : S.c < CHAPTERS.length - 1 ? [S.c + 1, 0] : null; }
// 进度：每关拿到的最多星数，存在本机浏览器里
let STAGE_STARS = {};
try { STAGE_STARS = JSON.parse(localStorage.getItem('renying-stage') || '{}') || {}; } catch (e) {}
function stageOpen(c, l) { return DEV_SESSION_UNLOCKED || (c === 0 && l === 0) || !!STAGE_STARS[l > 0 ? stageId(c, l - 1) : stageId(c - 1, 4)]; }
let STAGE = null, stageCh = -1;
function renderStages() {
  if (stageCh < 0) { stageCh = 0; for (let c = 0; c < CHAPTERS.length; c++) if (stageOpen(c, 0)) stageCh = c; }   // 默认翻到最新解锁的一章
  $id('stTabs').innerHTML = CHAPTERS.map((C, c) => `<button data-c="${c}" class="${c === stageCh ? 'sel' : ''}${stageOpen(c, 0) ? '' : ' lock'}">${c + 1} ${C.name}</button>`).join('');
  const C = CHAPTERS[stageCh];
  $id('stGrid').innerHTML = [0, 1, 2, 3, 4].map(l => {
    const S = stageInfo(stageCh, l), open = stageOpen(stageCh, l), st = STAGE_STARS[S.id] || 0;
    const sub = S.boss ? `守关 · ${CHARS[CHAR_IDX[C.boss]].name}` : `${S.waves.length} 波妖物`;
    return `<button data-l="${l}" class="stl${S.boss ? ' boss' : ''}" ${open ? '' : 'disabled'}><b>${S.id}</b><span>${open ? sub : '未解锁'}</span><i>${open ? '★'.repeat(st) + '☆'.repeat(3 - st) : '🔒'}</i></button>`;
  }).join('');
  const total = Object.values(STAGE_STARS).reduce((a, b) => a + b, 0);
  $id('stNote').textContent = `第 ${stageCh + 1} 章 · ${C.name}　守关难度：${LV_NAME[C.lv]}　　总星数 ${total} / ${CHAPTERS.length * 15}`;
}
$id('stTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { stageCh = +b.dataset.c; renderStages(); SFX.slice(); } });
$id('stGrid').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) startStage(stageCh, +b.dataset.l); });
function startStage(c, l) {
  const S = STAGE = stageInfo(c, l); stageCh = c;
  if (S.boss) {   // 守关：和这一章的高手打一场三局两胜
    FOREST.on = false; B.forestProxy = false; B.hidden = false; B.dummy = false;
    initAudio(); paused = false; showScreen(null);
    MSTAT.maxcombo = 0; MSTAT.ults = 0;
    startMatch('cpu', S.C.lv, [trainChar, CHAR_IDX[S.C.boss]]);
    M.stage = S;
    applySkins();
    return;
  }
  startTraining();
  Object.assign(FOREST, { on: true, mons: [], shots: [], spawnT: 1, kills: {}, total: 0, t: 0, hurtT: 9, wave: 0, toSpawn: [], breakT: 1.5, over: false, overT: 0, shown: false, prot: S.K.prot, result: null });
  B.forestProxy = true; B.hidden = true; B.x = STAGE_W / 2 + 400; B.invul = 99; B.look = { ...B.look, name: '妖物' };
  A.x = STAGE_W / 2;
  say(`${S.id} ${S.C.name}`, 1.3, 'big');
}
function forestNextWave() {
  const F = FOREST; F.wave++;
  F.toSpawn = STAGE.waves[F.wave - 1].slice(); F.spawnT = 0.8;
  say(`第 ${F.wave} / ${STAGE.waves.length} 波`, 1.2, 'big'); SFX.gong();
}
function forestDie() {
  const F = FOREST; if (F.over) return;
  F.over = true; F.overT = 2; F.result = { win: false, stars: 0, info: `折在第 ${F.wave} / ${STAGE.waves.length} 波，共击退 ${F.total} 只妖物` };
  A.hp = 0; A.state = 'launched'; A.t = 0; A.vy = -520; A.vx = -A.face * 200; A.y = Math.min(A.y, -1); A.invul = 99;
  say('力竭', 1.4, 'big'); slowmo = 1;
}
function stageClear() {
  const F = FOREST; if (F.over) return;
  const r = A.hp / A.maxHp, stars = r >= 0.6 ? 3 : r >= 0.3 ? 2 : 1;
  F.over = true; F.overT = 1.8; A.invul = 99;
  F.result = { win: true, stars, info: `残存生命 ${Math.round(r * 100)}%，共击退 ${F.total} 只妖物<br><span style="font-size:13px">余 60% 以上三星，30% 以上两星</span>` };
  say('破关', 1.4, 'big'); SFX.gong();
}
// 一关打完：记录星数，显示结算
function stageShowEnd(win, stars, info) {
  const S = STAGE;
  if (win && (STAGE_STARS[S.id] || 0) < stars) {
    const starDiff = stars - (STAGE_STARS[S.id] || 0);
    STAGE_STARS[S.id] = stars;
    PROF.ink = (PROF.ink || 0) + starDiff * 30;
    PROF.stageStars = STAGE_STARS;
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    try { localStorage.setItem('renying-stage', JSON.stringify(STAGE_STARS)); } catch (e) {}
  }
  playSting(win ? 'victory' : 'defeat');
  const nx = nextStage(S);
  $id('feWave').textContent = `${S.id} ${win ? '破关' : '折戟'}`;
  $id('feStars').textContent = win ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
  $id('feInfo').innerHTML = info + (win && !nx ? '<br><b style="color:#e9c46a">六章三十关，尽数踏破！</b>' : '');
  $id('feNext').style.display = win && nx ? '' : 'none';
  paused = true; showScreen('forestEnd');
}
function forestShowEnd() { const r = FOREST.result; stageShowEnd(r.win, r.stars, r.info); }
function monBox(m) { return [m.x - m.T.w, m.y - m.T.h, m.x + m.T.w, m.y]; }
function spawnMon(key) {
  const T = MON_TYPES[key], side = Math.random() < 0.5 ? -1 : 1, K = STAGE.K, hp = Math.round(T.hp * K.hp);
  FOREST.mons.push({ key, T, x: side < 0 ? WALL + 10 : STAGE_W - WALL - 10, y: T.fly ? -230 : 0, vx: 0, vy: 0, hp, maxHp: hp, dk: K.dk, spd: K.spd, cdk: K.cdk, wk: K.wk,
    face: -side, cd: rand(0.8, 1.6), wind: 0, act: null, stag: 0, flash: 0, ph: rand(0, 6), tx: 0 });
}
// 妖物打到玩家：不会把玩家打死；能格挡、能被腾空闪躲开
function monHitPlayer(m, dmg, kb, stun, launch, root) {
  if (A.invul > 0 || A.escInvul || A.hp <= 0 || FOREST.over || FOREST.hurtT < FOREST.prot) return;   // 挨打后短暂保护（越往后越短）
  dmg *= m.dk || 1;
  const dir = A.x >= m.x ? 1 : -1;
  const holdingBlock = !!(A.ctrl && A.ctrl.held && A.ctrl.held.down);
  const wasBlocking = ((A.state === 'block' || A.state === 'blockstun') || (holdingBlock && ['idle', 'walk'].includes(A.state)));
  if (wasBlocking && !launch) {
    A.face = -dir;
  }
  const blocking = wasBlocking && A.face === -dir && !launch;
  hitFX(A.x, A.y - 60, blocking ? 0.5 : 0.9, m.T.eye, dir);
  if (blocking) { A.state = 'blockstun'; A.t = 0; A.stun = 0.12; A.vx = dir * 160; FOREST.hurtT = 0.3; SFX.block(); return; }
  A.hp = Math.max(0, A.hp - dmg); FOREST.hurtT = 0; A.flash = 0.1; A.sinceHit = 0;
  if (A.hp <= 0) { forestDie(); hitstop = 0.2; SFX.hit(1.6); return; }
  toNeutral(A);
  if (launch) { A.state = 'launched'; A.t = 0; A.vy = -560; A.vx = dir * kb * 0.6; A.y = Math.min(A.y, -1); A.juggle = 1; }
  else { A.state = 'hitstun'; A.t = 0; A.stun = stun; A.vx = root ? 0 : dir * kb; A.rooted = !!root; }
  hitstop = Math.max(hitstop, 0.05); shake = Math.max(shake, 6); SFX.hit(1);
}
// 玩家的攻击打中“代理”（最近的妖物）时，伤害转给它
function forestHit(att, m, pt) {
  const mon = FOREST.mons.filter(q => q.hp > 0).sort((a, b) => Math.abs(a.x - B.x) + Math.abs(a.y - B.y) - Math.abs(b.x - B.x) - Math.abs(b.y - B.y))[0];
  if (!mon) return;
  const dir = m.dir || (mon.x >= att.x ? 1 : -1);
  mon.hp -= m.dmg; mon.flash = 0.1; mon.stag = Math.max(mon.stag, m.launch ? 0.6 : 0.3); mon.act = null; mon.wind = 0;
  mon.vx = dir * Math.abs(m.kb ? m.kb[0] : 200) * 0.7;
  if (m.launch && !mon.T.fly) mon.vy = -420;
  att.hitConfirmed = true; att.meter = Math.min(100, att.meter + m.dmg * 1.2);
  const ev = { e: 'hit', a: att.idx, d: 1, x: pt ? pt[0] : mon.x, y: pt ? pt[1] : mon.y - 60, dmg: m.dmg, hs: m.hs || 0.06, nc: true, f: dir };
  hitFX(ev.x, ev.y, clamp(m.dmg / 8, 0.5, 1.6), att.look.slash, dir); hitstop = Math.max(hitstop, (m.hs || 0.06) * 0.8); shake = Math.max(shake, 4); SFX.hit(1);
  addP({ type: 'text', text: String(Math.round(m.dmg * 10) / 10), x: mon.x, y: mon.y - mon.T.h - 20, life: 0.5, max: 0.5, rgb: '255,240,220' });
  if (mon.hp <= 0) {
    FOREST.kills[mon.key] = (FOREST.kills[mon.key] || 0) + 1; FOREST.total++;
    smoke(mon.x, mon.y - mon.T.h / 2, 14); ring(mon.x, mon.y - 50, 70, mon.T.eye, 0.35); SFX.poof();
  }
}
function forestUpdate() {
  const F = FOREST; F.t += STEP; F.hurtT += STEP;
  if (F.over) { F.overT -= STEP; if (F.overT <= 0 && !F.shown) { F.shown = true; forestShowEnd(); } return; }
  if (F.breakT > 0) { F.breakT -= STEP; if (F.breakT <= 0) forestNextWave(); }
  else {
    F.spawnT -= STEP;
    const alive = F.mons.filter(m => m.hp > 0).length, K = STAGE.K;
    if (F.toSpawn.length && F.spawnT <= 0 && alive < K.cap) { spawnMon(F.toSpawn.shift()); F.spawnT = K.gap * rand(0.7, 1.3); }
    if (!F.toSpawn.length && alive === 0) {
      F.shots = [];
      if (F.wave >= STAGE.waves.length) stageClear();   // 最后一波也打完了：通关
      else {   // 这一波打完：休息一下，回 15% 血
        F.breakT = 3; A.hp = Math.min(A.maxHp, A.hp + A.maxHp * 0.15);
        say(`第 ${F.wave} 波 通过`, 1, 'go');
      }
    }
  }
  for (const m of F.mons) {
    if (m.hp <= 0) continue;
    const T = m.T, dx = A.x - m.x, d = Math.abs(dx), dir = Math.sign(dx) || 1;
    m.ph += STEP; m.flash = Math.max(0, m.flash - STEP);
    if (m.stag > 0) { m.stag -= STEP; m.vx *= 0.9; }
    else {
      m.face = dir;
      m.cd -= STEP;
      const keep = { blade: 70, archer: 380, binder: 260, caster: 320, owl: 0 }[m.key];
      if (m.key === 'owl') {   // 夜枭：高处盘旋，偶尔俯冲
        if (!m.act) { m.tx = A.x + Math.sin(m.ph * 0.8) * 200; m.vx = clamp((m.tx - m.x) * 2, -(T.spd * m.spd), (T.spd * m.spd)); m.y = -230 + Math.sin(m.ph * 3) * 20; if (m.cd <= 0) { m.act = 'swoop'; m.wind = 0.45 * m.wk; m.cd = rand(2.6, 3.6) * m.cdk; } }
        else if (m.wind > 0) { m.wind -= STEP; m.vx *= 0.9; if (m.wind <= 0) { const ty = A.y - 60 - m.y; const l = Math.hypot(dx, ty) || 1; m.vx = dx / l * 760; m.vy = ty / l * 760; m.act = 'dive'; m.hitDone = false; } }
        else if (m.act === 'dive') { m.y += m.vy * STEP; if (!m.hitDone && overlap(monBox(m), hurtbox(A))) { m.hitDone = true; monHitPlayer(m, 3, 260, 0.35); } if (m.y > -30 || m.y < -300) { m.act = null; m.vy = 0; m.y = Math.min(-40, m.y); } }
        else m.act = null;
        if (!m.act) m.y = damp(m.y, -230, 3, STEP);
      } else if (m.wind > 0) {   // 出手前的蓄力（有明显的提示）
        m.wind -= STEP; m.vx *= 0.8;
        if (m.wind <= 0) {
          if (m.key === 'blade') { const hb = [m.x + (dir > 0 ? 0 : -86), m.y - 100, m.x + (dir > 0 ? 86 : 0), m.y - 10]; slashLine(m.x + dir * 50, m.y - 60, dir > 0 ? -0.3 : 3.44, T.eye); SFX.swing(); if (overlap(hb, hurtbox(A))) monHitPlayer(m, 4, 220, 0.35); }
          if (m.key === 'archer') { F.shots.push({ x: m.x + dir * 20, y: m.y - 70, vx: dir * 620 * m.spd, life: 1.6, dmg: 3, dk: m.dk }); SFX.slice(); }
          if (m.key === 'binder') { F.shots.push({ trap: true, x: m.mark, y: 0, t: 0.8 * m.wk, r: 60, dmg: 2, dk: m.dk }); }
          if (m.key === 'caster') { F.shots.push({ fire: true, x: m.mark, y: 0, t: 0.9 * m.wk, r: 52, dmg: 5, dk: m.dk }); }
        }
      } else {
        const want = m.key === 'blade' ? (d > keep ? dir : 0) : (d > keep + 60 ? dir : d < keep - 60 ? -dir : 0);
        m.vx = damp(m.vx, want * (T.spd * m.spd), 6, STEP);
        if (m.cd <= 0 && (m.key !== 'blade' || d < 110)) {
          m.wind = { blade: 0.5, archer: 0.4, binder: 0.5, caster: 0.5 }[m.key] * m.wk; m.cd = { blade: 2.2, archer: 2.8, binder: 4.5, caster: 4.5 }[m.key] * m.cdk;
          m.mark = A.x;   // 控制和法术：锁定你现在的位置
        }
      }
    }
    m.x = clamp(m.x + m.vx * STEP, WALL, STAGE_W - WALL);
    if (!T.fly) { m.vy += GRAV * STEP; m.y = Math.min(0, m.y + m.vy * STEP); if (m.y >= 0) m.vy = 0; }
  }
  // 妖物的箭、定身阵、火柱
  for (const q of F.shots) {
    if (q.trap || q.fire) {
      q.t -= STEP;
      if (q.t <= 0 && !q.done) {
        q.done = true; q.life = 0.35;
        if (q.fire) { flashA = Math.max(flashA, 0.08); flashRGB = '255,170,90'; SFX.thud(); for (let k = 0; k < 16; k++) addP({ type: 'spark', x: q.x + rand(-30, 30), y: -rand(0, 200), vx: rand(-60, 60), vy: -rand(100, 400), life: 0.5, max: 0.5, rgb: '255,160,70', w: 2 }); }
        else { ring(q.x, -10, 70, '200,120,255', 0.4); SFX.poof(); }
        if (Math.abs(A.x - q.x) < q.r && A.y > -60) monHitPlayer({ x: q.x, T: { eye: q.fire ? '255,160,70' : '200,120,255' } }, q.dmg * (q.dk || 1), 0, q.fire ? 0.4 : 0.6, q.fire, !q.fire);
      }
      if (q.done) q.life -= STEP;
    } else {
      q.x += q.vx * STEP; q.life -= STEP;
      if (overlap([q.x - 14, q.y - 5, q.x + 14, q.y + 5], hurtbox(A))) { q.life = 0; monHitPlayer({ x: q.x - Math.sign(q.vx) * 10, T: { eye: '120,255,140' } }, q.dmg * (q.dk || 1), 180, 0.3); }
      // 刀可以把箭砍掉
      if (A.state === 'attack' && A.move && A.t >= A.move.su && A.t < A.move.su + A.move.ac && overlap(hitbox(A, A.move.box), [q.x - 14, q.y - 5, q.x + 14, q.y + 5])) { q.life = 0; blockFX(q.x, q.y, A.face); SFX.block(); }
    }
  }
  F.shots = F.shots.filter(q => (q.trap || q.fire) ? !(q.done && q.life <= 0) : q.life > 0);
  F.mons = F.mons.filter(m => m.hp > 0);
  // 代理：把 B 放到离你最近的妖物身上，这样技能、飞行道具、大招都能自动瞄准它
  const near = F.mons.slice().sort((a, b) => Math.abs(a.x - A.x) - Math.abs(b.x - A.x))[0];
  if (near) { B.x = near.x; B.y = near.y; B.vx = B.vy = 0; B.invul = 0; B.state = near.T.fly ? 'launched' : 'idle'; B.hp = B.maxHp; }
  else { B.x = clamp(A.x + A.face * 400, WALL, STAGE_W - WALL); B.y = 0; B.invul = 99; }
}
function drawForest() {
  const F = FOREST;
  // 竹林深处的眼睛
  for (let k = 0; k < 9; k++) { const x = hash(k * 7) * STAGE_W, y = -120 - hash(k * 3) * 260, on = Math.sin(clock * 0.7 + k * 2.1) > 0.6; if (on) { ctx.fillStyle = 'rgba(255,60,60,0.5)'; circle([x - 5, y], 2); circle([x + 5, y], 2); } }
  for (const q of F.shots) {
    if (q.trap || q.fire) {
      const k = q.done ? q.life / 0.35 : clamp(1 - q.t / 0.9, 0, 1), c = q.fire ? '255,150,60' : '200,120,255';
      ctx.strokeStyle = `rgba(${c},${0.35 + 0.5 * k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(q.x, -2, q.r, 12, 0, 0, Math.PI * 2); ctx.stroke();
      if (q.done && q.fire) { ctx.fillStyle = `rgba(255,140,60,${k * 0.6})`; ctx.fillRect(q.x - 30, -260, 60, 260); }
      if (q.done && q.trap) { ctx.strokeStyle = `rgba(200,120,255,${k})`; ctx.lineWidth = 2; for (let a = 0; a < 6; a++) { ctx.beginPath(); ctx.moveTo(q.x + Math.cos(a) * 50, -4); ctx.lineTo(q.x, -60); ctx.stroke(); } }
    } else { ctx.strokeStyle = '#b8f5c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x - Math.sign(q.vx) * 16, q.y); ctx.lineTo(q.x + Math.sign(q.vx) * 10, q.y); ctx.stroke(); }
  }
  for (const m of F.mons) {
    const T = m.T, x = m.x, y = m.y, f = m.face, bob = Math.sin(m.ph * 4) * 3, warn = m.wind > 0 || m.act === 'swoop';
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, 2, 24, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = m.flash > 0 ? '#e8e0f0' : '#0d0b16'; ctx.strokeStyle = `rgba(${T.eye},0.5)`; ctx.lineWidth = 1.5;
    if (m.key === 'owl') {
      const fl = Math.sin(m.ph * 14) * 12;
      ctx.beginPath(); ctx.ellipse(x, y, 16, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x - 42, y - 10 + fl); ctx.lineTo(x - 16, y + 6); ctx.moveTo(x + 10, y); ctx.lineTo(x + 42, y - 10 + fl); ctx.lineTo(x + 16, y + 6); ctx.fill();
      ctx.fillStyle = `rgb(${T.eye})`; circle([x - 5, y - 3], 2.5); circle([x + 5, y - 3], 2.5);
    } else {
      const yy = T.float ? y - 20 + Math.sin(m.ph * 2) * 8 : y;
      ctx.beginPath();
      if (m.key === 'binder') { ctx.moveTo(x - 22, yy - 20); ctx.quadraticCurveTo(x - 26, yy - 90, x, yy - 98); ctx.quadraticCurveTo(x + 26, yy - 90, x + 22, yy - 20); ctx.lineTo(x + 10, yy + 4); ctx.lineTo(x, yy - 12); ctx.lineTo(x - 10, yy + 4); }
      else if (m.key === 'caster') { ctx.moveTo(x - 24, yy); ctx.lineTo(x - 12, yy - 84); ctx.lineTo(x, yy - 108); ctx.lineTo(x + 12, yy - 84); ctx.lineTo(x + 24, yy); }
      else { ctx.moveTo(x - 18, yy); ctx.lineTo(x - 20, yy - 70 + bob); ctx.quadraticCurveTo(x, yy - 110 + bob, x + 20, yy - 70 + bob); ctx.lineTo(x + 18, yy); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      const ey = m.key === 'caster' ? yy - 86 : m.key === 'binder' ? yy - 74 : yy - 84 + bob;
      ctx.fillStyle = `rgb(${T.eye})`; circle([x + f * 4 - 5, ey], 2.6); circle([x + f * 4 + 5, ey], 2.6);
      ctx.strokeStyle = m.flash > 0 ? '#fff' : '#9aa0b4'; ctx.lineWidth = 3;
      if (m.key === 'blade') { ctx.beginPath(); ctx.moveTo(x + f * 16, yy - 50); ctx.quadraticCurveTo(x + f * 60, yy - 70 - (warn ? 30 : 0), x + f * 70, yy - 30); ctx.stroke(); }
      if (m.key === 'archer') { ctx.beginPath(); ctx.arc(x + f * 18, yy - 64, 24, -1.2, 1.2); ctx.stroke(); }
      if (m.key === 'caster') { ctx.fillStyle = `rgba(${T.eye},${warn ? 1 : 0.6})`; circle([x + f * 22, yy - 70], warn ? 8 : 5); }
      if (m.key === 'binder') { ctx.strokeStyle = 'rgba(200,120,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 20, yy - 40); ctx.lineTo(x - 40, yy - 20); ctx.moveTo(x + 20, yy - 40); ctx.lineTo(x + 40, yy - 20); ctx.stroke(); }
    }
    if (warn) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${T.eye},0.25)`; circle([x, y - (T.fly ? 0 : 60)], 40); ctx.globalCompositeOperation = 'source-over'; }
    const bw = 44, top = (T.fly ? y - 26 : y - T.h - (T.float ? 30 : 12));
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - bw / 2, top - 6, bw, 4); ctx.fillStyle = `rgb(${T.eye})`; ctx.fillRect(x - bw / 2, top - 6, bw * m.hp / m.maxHp, 4);
    ctx.fillStyle = 'rgba(230,220,240,0.55)'; ctx.font = `12px ${BODY_FONT}`; ctx.textAlign = 'center'; ctx.fillText(`${T.name}·${T.kind}`, x, top - 12);
    ctx.restore();
  }
}
function drawForestHUD() {
  const S = STAGE, F = FOREST; if (!S || S.boss) return;
  const fs = Math.max(13, Math.round(H * 0.019)), x = W - Math.max(24, W * 0.04), y = Math.max(22, H * 0.04) + 70, w = fs * 11;
  const left = F.toSpawn.length + F.mons.filter(m => m.hp > 0).length;
  const rows = [[`第 ${Math.max(1, F.wave)} / ${S.waves.length} 波`, F.breakT > 0 ? '喘息' : `尚余 ${left}`], ['击退', F.total]];
  ctx.save(); ctx.textBaseline = 'top'; ctx.font = `${fs}px ${BODY_FONT}`;
  ctx.fillStyle = 'rgba(8,8,20,0.55)'; ctx.fillRect(x - w - 12, y - 10, w + 24, (rows.length + 1) * fs * 1.7 + 10);
  ctx.textAlign = 'left'; ctx.fillStyle = '#e9c46a'; ctx.fillText(`关卡 ${S.id} · ${S.C.name}`, x - w, y);
  rows.forEach(([n, v], i) => { ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(239,232,216,0.6)'; ctx.fillText(n, x - w, y + (i + 1) * fs * 1.7); ctx.textAlign = 'right'; ctx.fillStyle = '#efe8d8'; ctx.fillText(v, x, y + (i + 1) * fs * 1.7); });
  ctx.restore();
}
function backToStages() {
  toMenu();
  menuCam.tx = MENU_SPOT[OFFLINE_BUILD ? 'netp' : 'single'] * 1.05; menuCam.tz = 1.9;
  openScreen('stage');
}
$id('feNext').addEventListener('click', () => { const nx = nextStage(STAGE); if (!nx) return; paused = false; showScreen(null); startStage(nx[0], nx[1]); });
$id('feAgain').addEventListener('click', () => { paused = false; showScreen(null); startStage(STAGE.c, STAGE.l); });
$id('feMenu').addEventListener('click', () => { paused = false; backToStages(); });

// 木人桩：不还手。stand 任打不还手，block 一味死守，escape 被连便闪
const DUMMY_MODES = { stand: '任打不还手', block: '一味死守', escape: '被连便闪', fixed: '钉在原地' };
class DummyCtrl extends Ctrl {
  constructor(mode) { super(); this.mode = DUMMY_MODES[mode] ? mode : 'stand'; }
  think(me) {
    this.held.down = this.mode === 'block';
    if (this.mode === 'escape' && me.breakCD <= 0 && (me.state === 'launched' || (me.state === 'hitstun' && me.comboHits >= 4)) && me.t > 0.08) this.press('dash');
  }
}
const TRAIN = { total: 0, hits: [], best: 0, bestDmg: 0 };

// 电脑什么时候放大招
const ULT_AI = {
  crescent: (m, f, d) => d < 330, shadows: (m, f, d) => d < 330, avalanche: (m, f, d) => d < 700 && f.onGround(),
  phoenix: (m, f, d) => d < 230, timestop: (m, f, d) => d < 700, tornado: (m, f, d) => d < 650, thunder: () => true,
  inkdragon: (m, f, d) => d < 900 && f.onGround(), featherstorm: (m, f, d) => d < 500, moonflow: (m, f, d) => d < 230 || m.hp < m.maxHp * 0.45,
};
// 技能之后顺手接的动作
const SKILL_FOLLOW = { gale: [['light', 0.42], ['light', 0.6], ['light', 0.78]], blink: [['light', 0.3], ['light', 0.48], ['light', 0.66]] };
class AICtrl extends Ctrl {
  constructor(level) { super(); this.L = LEVELS[level]; this.queue = []; this.next = 0; this.holdDown = 0; this.dir = 0; this.reacted = false; this.projReact = false; }
  plan(list) { this.queue = list.map(([a, dt]) => ({ at: clock + dt, a })); }
  think(me, foe) {
    const L = this.L, d = Math.abs(foe.x - me.x), to = Math.sign(foe.x - me.x) || 1;
    const ch = me.ch, [rMin, rMax] = ch.ai.range, S = SKILLS[ch.skill];
    if ((me.state === 'launched' || me.state === 'knockdown' || (me.state === 'hitstun' && me.comboHits >= 3)) && me.breakCD <= 0 && me.t > 0.1 && Math.random() < L.block * 0.018) this.press('dash');
    if (L.god && (me.state === 'hitstun' || me.state === 'launched') && me.comboHits >= 2 && me.breakCD <= 0) this.press('dash');   // 绝顶：被连两下就闪
    while (this.queue.length && this.queue[0].at <= clock) {
      const a = this.queue.shift().a;
      if (a === 'chargeStart') { this.held.atk = true; this.atkT = clock - CHARGE_START; }
      else if (a === 'chargeEnd') this.held.atk = false;
      else if (a === 'jump' && me.ch.fly) { this.press('jump'); this.flyUntil = clock + rand(0.5, 1.4); }
      else this.press(a);
    }
    if (!this.queue.length) this.held.atk = false;
    this.holdDown = Math.max(0, this.holdDown - STEP);
    const free = me.onGround() && ['idle', 'walk', 'block'].includes(me.state);
    // 看到对手出招：防御，月华会用月镜
    const threat = foe.state === 'attack' && foe.move && foe.t < foe.move.su + 0.02 && d < foe.move.box[2] + 70;
    if (threat && !this.reacted) {
      this.reacted = true;
      if (free) {
        if (ch.skill === 'mirror' && me.skillCD <= 0 && Math.random() < L.block * 0.9) { this.queue = []; this.press('skill'); }
        else if (Math.random() < L.block) { this.holdDown = 0.38; this.queue = []; this.dir = 0; }
      }
    }
    if (foe.state !== 'attack') this.reacted = false;
    // 看到飞行道具：跳或挡；看到雷印就走开
    const inc = projs.find(p => p.owner !== me.idx && !p.fx && p.dmg > 0 && p.delay <= 0 && p.kind !== 'trap' && Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(me.x - p.x) < 280);
    if (inc && !this.projReact) {
      this.projReact = true;
      if (free && Math.random() < L.block) {
        if (inc.unblockable || inc.groundOnly || Math.random() < 0.5) { this.queue = []; this.press('jump'); this.dir = to; }
        else { this.holdDown = 0.35; this.queue = []; }
      }
    }
    if (!inc) this.projReact = false;
    const bolt = projs.find(p => p.kind === 'bolt' && p.owner !== me.idx && p.delay > 0 && Math.abs(p.x - me.x) < 80);
    if (bolt && Math.random() < L.block * 0.2) { this.dir = me.x >= bolt.x ? 1 : -1; this.next = clock + 0.25; this.queue = []; }
    const trap = projs.find(p => p.kind === 'trap' && p.owner !== me.idx && Math.abs(p.x - me.x) < 110 && Math.sign(p.x - me.x) === this.dir);
    if (trap && me.onGround() && Math.random() < L.block * 0.15) this.press('jump');

    if (clock >= this.next && !this.queue.length && this.holdDown <= 0) {
      this.next = clock + rand(L.think[0], L.think[1]);
      const r = Math.random();
      this.dir = 0;
      const atkRange = me.moves.l1.box[2] + 22;
      if (foe.rooted && foe.state === 'hitstun') {
        if (d < 300 && r < 0.6) this.plan([['chargeStart', 0], ['chargeEnd', 0.8], ['light', 0.96]]);
        else this.dir = to;
      }
      else if (foe.state === 'knockdown' || foe.state === 'getup') { this.dir = d > atkRange ? to : 0; }
      else if (me.meter >= 100 && ULT_AI[ch.ult](me, foe, d) && r < 0.5) this.plan([['special', 0]]);
      else if (me.skillCD <= 0 && S.ai(me, foe, d) && r < 0.4) this.plan([['skill', 0], ...(SKILL_FOLLOW[ch.skill] || [])]);
      else if (me.skill2CD <= 0 && SKILLS[ch.skill2].ai(me, foe, d) && r < 0.62) this.plan([['skill2', 0]]);
      else if (me.hp < me.maxHp * 0.3 && d < 150 && r < 0.2) { this.dir = -to; }
      else if (d > rMax) { this.dir = to; if (r < 0.15) this.plan([['jump', 0]]); }
      else if (d < rMin && rMin > 110) {           // 远程和长枪：太近了先还手或把人推开，再拉开距离
        if (d <= atkRange && r < L.aggr * 0.6) this.plan(AI_COMBOS[Math.random() * Math.min(L.combo, AI_COMBOS.length) | 0]);
        else if (me.skillCD <= 0 && S.ai(me, foe, d) && r < 0.6) this.plan([['skill', 0]]);
        else if (r < 0.75) this.dir = -to;
        else if (r < 0.88) { this.dir = -to; this.plan([['jump', 0], ['jump', 0.22]]); }
        else this.holdDown = 0.3;
      } else if (d <= atkRange) {
        if (r < L.aggr) this.plan(AI_COMBOS[Math.random() * Math.min(L.combo, AI_COMBOS.length) | 0]);
        else if (r < L.aggr + 0.18) this.holdDown = 0.4;
        else this.dir = -to;
      } else {
        if (r < L.aggr * 0.45) this.dir = to;
        else if (r < L.aggr * 0.7) { this.dir = to; this.plan([['jump', 0], ['light', 0.3]]); }
        else if (r < L.aggr) { this.dir = to; this.plan([['light', 0.2]]); }
        else if (r < L.aggr + 0.1) { const r2 = rand(0.35, 1.0); this.plan([['chargeStart', 0], ['chargeEnd', r2], ['light', r2 + 0.16]]); }
        else if (r < 0.85) this.dir = -to;
      }
    }
    // 往后退却快撞墙了：跳过对手头顶
    if (this.dir === -to && ((this.dir < 0 && me.x < WALL + 130) || (this.dir > 0 && me.x > STAGE_W - WALL - 130))) {
      this.dir = to; if (me.onGround() && !this.queue.length) this.plan([['jump', 0], ['jump', 0.25]]);
    }
    if (me.state === 'special' && me.ch.ult === 'avalanche') {
      this.dir = Math.abs(me.x - foe.x) > 40 ? to : 0;
      if (Math.abs(me.x - foe.x) < 80 && me.t > 0.2) this.holdDown = 0.3;
    }
    this.held.down = this.holdDown > 0;
    this.held.jump = !!(me.ch.fly && clock < (this.flyUntil || 0));
    this.held.left = this.dir < 0; this.held.right = this.dir > 0;
  }
}

// ======================= 角色对象 =======================
class Fighter {
  constructor(idx) {
    this.idx = idx; this.setChar(idx);
    this.j = {}; for (const k of JOINTS) this.j[k] = [...POSES.idle[k]]; this.j.sw = POSES.idle.sw;
    this.scarf = []; this.trail = []; this.ghosts = []; this.ghostT = 0;
    this.reset(idx === 0 ? STAGE_W / 2 - 230 : STAGE_W / 2 + 230);
    this.meter = 0;
  }
  setChar(i) {
    this.chIdx = i; this.ch = CHARS[i]; this.moves = CHAR_MOVES[i];
    this.look = { ...this.ch.look, name: this.ch.name };
    this.maxHp = this.ch.stat.hp; this.wlen = WEAPON_LEN[this.ch.look.weapon] || 54;
    this.size = this.ch.stat.size || this.ch.size || 1;
    this.maxGuard = this.ch.stat.guardMax || 100;
    this.guard = this.maxGuard;
    this.sinceBlock = 0;
  }
  reset(x) {
    this.maxGuard = (this.ch && this.ch.stat && this.ch.stat.guardMax) || 100;
    this.guard = this.maxGuard;
    this.sinceBlock = 0;
    Object.assign(this, { x, y: 0, vx: 0, vy: 0, face: this.idx === 0 ? 1 : -1, hp: this.maxHp, lagHp: this.maxHp, lagDelay: 0,
      skill: null, skPh: 0, skillCD: 0, skill2CD: 0, ink: INK_MAX, escInvul: false, escT: 0, bbX: 0, bbT: 0, twinT: 0, diveAir: false, diveChained: false, flyT: this.ch.fly || 0, flying: false, armorT: 0, armorHits: 0, parryT: 0, buffT: 0, sinceHit: 0, regenLeft: 20, spN: 0, spPose: null, rooted: false, slowT: 0,
      guard: this.maxGuard, sinceBlock: 0,
      state: 'idle', t: 0, move: null, invul: 0, dashCD: 0, jumps: 0, airDash: 1, stun: 0, flash: 0,
      juggle: 0, comboHits: 0, rot: 0, walkPh: 0, spiked: false, bounced: false, sp: null, snap: false, hitDone: false,
      breakCD: 0 });
    this.scarf = []; this.trail = []; this.ghosts = [];
  }
  onGround() { return this.y >= 0 && this.vy >= 0; }
}
let A = new Fighter(0), B = new Fighter(1);
const foeOf = f => f === A ? B : A;
const wk = f => WALK * f.ch.stat.walk * ((f.slowT || 0) > 0 ? 0.6 : 1);
function setChars(a, b) { A.setChar(a); B.setChar(b); }

// ======================= 比赛流程 =======================
const M = { mode: 'demo', level: 'normal', phase: 'intro', t: 0, round: 1, wins: [0, 0], timer: 60, koWinner: -1, flags: {} };
const CN = ['', '一', '二', '三', '四', '五'];
let hitstop = 0, slowmo = 0, superFreeze = 0, superOwner = null, shake = 0, flashA = 0, flashRGB = '255,255,255', dimA = 0, paused = false;
let announce = null;
const comboUI = [{ n: 0, dmg: 0, t: 0 }, { n: 0, dmg: 0, t: 0 }];

// 开场署名
const CREDIT = 2.4;
let creditT = 0, creditPending = false;
function say(text, dur = 1.1, style = 'big') { if (RESIM) return; announce = { text, t: 0, dur, style, seed: Math.random() * 100 }; }
function randomPair() { const a = Math.random() * CHARS.length | 0; let b = Math.random() * (CHARS.length - 1) | 0; if (b >= a) b++; return [a, b]; }
// 还在等人进房间或在排队时开始单人模式：先关掉房间，免得有人进来把你拉去选人
function netDropWaiting() { if (!NET.open && (NET.ws || p2pActive())) { netLeave(); $id('roomCode').textContent = ''; netStatus(''); } }
function startMatch(mode, level, chars) {
  if (mode !== 'demo') refocusGame();
  if (mode !== 'net' && mode !== 'demo' && mode !== 'replay') netDropWaiting();
  human[0].rec = null;
  chars = chars || randomPair();
  setChars(chars[0], chars[1]);
  if (mode === 'net') { setupNetMatch(); send({ mstart: 1 }); startRound(); return; }
  M.mode = mode; M.level = level; M.wins = [0, 0]; M.round = 1; M.carry = null; M.stage = null;
  A.meter = B.meter = 0;
  A.ctrl = mode === 'demo' ? new AICtrl('normal') : human[0];
  B.ctrl = mode === 'pvp' ? human[1] : mode === 'train' ? new DummyCtrl(level) : new AICtrl(mode === 'demo' ? 'normal' : level);
  human[0].clear(); human[1].clear();
  REC.on = false; if ((mode === 'cpu' || mode === 'pvp') && !TUT) recBegin('loc');
  startRound();
}
function startRound() {
  A.reset(STAGE_W / 2 - 230); B.reset(STAGE_W / 2 + 230);
  if ((M.mode === 'cpu' || M.mode === 'replay') && M.level === 'impossible') { B.maxHp = Math.round(B.maxHp * 1.35); B.hp = B.lagHp = B.maxHp; }   // 绝顶：多 35% 血
  if (M.carry && M.round > 1) { [A, B].forEach((f, i) => { f.hp = f.lagHp = Math.round(f.maxHp * M.carry[i] * 10) / 10; }); }
  M.carry = null; M.pre = null; M.ot = false; M.introFX = M.round === 1 && M.mode !== 'demo';
  M.phase = 'intro'; M.t = 0; M.timer = ROUND_TIME; M.koWinner = -1; M.flags = {};
  hitstop = slowmo = superFreeze = 0; particles.length = 0; decoys.length = 0; projs.length = 0;
  comboUI[0].t = comboUI[1].t = 0;
  if (M.mode !== 'demo' && M.mode !== 'train') {
    if (M.round === 1) { creditT = CREDIT; creditPending = true; metal(880, 1.8, 0.05); }   // 每场开战先显示作者
    else { say(`第${CN[M.round] || M.round}回合`, 1.1); SFX.gong(); }
  }
  netEmit({ e: 'round', r: M.round, w: [...M.wins], ch: [A.chIdx, B.chIdx] });
}
// 回合规则：25 秒；到时一方过半一方不过半，不过半的败北；否则加时 15 秒，结束时血量比例低的败北
const ROUND_TIME = 25, OT_TIME = 15;
function timeDeath(winner, text) {
  M.phase = 'ko'; M.t = 0; M.koWinner = winner;
  M.pre = [A.hp / A.maxHp, B.hp / B.maxHp];           // 记下“生前”的血量
  if (winner >= 0) {
    const l = [A, B][1 - winner];
    l.hp = 0; l.state = 'launched'; l.t = 0; l.vy = -380; l.vx = (l.x >= [A, B][winner].x ? 1 : -1) * 260; l.y = Math.min(l.y, -1); l.invul = 99; l.move = null; l.skill = null;
  }
  sayNet(text, 1.4, 'big', 'gong');
}
function updateMatch() {
  M.t += STEP;
  if (M.phase === 'intro') {
    if (M.introFX && M.t > 0.2) { M.introFX = false; for (const f of [A, B]) if (!f.hidden && !f.dummy) skinIntroFX(f); }
    const go = M.mode === 'demo' || M.mode === 'train' ? 0.3 : 1.25 + (M.round === 1 ? CREDIT : 0);
    if (M.t > go && !M.flags.go) { M.flags.go = true; if (M.mode !== 'demo' && M.mode !== 'train') sayNet('开战', 0.7, 'go', 'heavy'); }
    if (M.t > go + 0.35) { M.phase = 'fight'; M.t = 0; }
  } else if (M.phase === 'fight') {
    if (M.mode !== 'demo' && M.mode !== 'train') M.timer = Math.max(0, M.timer - STEP);
    if (M.timer <= 0) {
      const ra = A.hp / A.maxHp, rb = B.hp / B.maxHp;
      if (!M.ot) {
        if ((ra >= 0.5) !== (rb >= 0.5)) timeDeath(ra >= 0.5 ? 0 : 1, '败北');
        else { M.ot = true; M.timer = OT_TIME; sayNet('加时', 1.2, 'big', 'gong'); }
      } else timeDeath(ra > rb ? 0 : rb > ra ? 1 : -1, '时间到');
    }
  } else if (M.phase === 'ko') {
    const w = M.koWinner >= 0 ? [A, B][M.koWinner] : null;
    if (w && M.t > 1.2 && w.hp > 0 && w.onGround() && (w.state === 'idle' || w.state === 'walk')) { w.state = 'victory'; w.t = 0; skinVictoryFX(w); }
    if (M.t > 2.8) endRound();
  }
}
function sayNet(text, dur, style, snd) { say(text, dur, style); if (snd) SFX[snd](); netEmit({ e: 'say', text, dur, style, snd }); }
function showEnd(w) {
  if (REPLAY.on) { replayEnd(w); return; }
  if (REC.on) recSave(w);
  $id('againBtn').style.display = ''; $id('rpWatch').style.display = RP.last ? '' : 'none'; $id('rpWatch').textContent = '看回放';
  if (M.stage) {
    const win = w === 0;
    M.stage = null;
    setTimeout(() => stageShowEnd(win, win ? (M.wins[1] === 0 ? 3 : 2) : 0, `比分 ${M.wins[0]} : ${M.wins[1]}${win ? '<br><span style="font-size:13px">2 : 0 三星，2 : 1 两星</span>' : '，再磨一磨剑'}`), 300);
    return;
  }
  if (w >= 0) playSting(w === localIdx() ? 'victory' : 'defeat');
  if (M.mode === 'net') send({ report: w === 0 ? 'host' : 'client' });
  if (M.mode === 'cpu' || M.mode === 'net') adaptRecord(w === localIdx());
  reportProgress(w);
  $id('endRank').textContent = M.mode === 'net' && !ACC.name ? '登录后，胜负会计入排行榜' : '';
  const t = document.getElementById('endTitle');
  const wf = [A, B][w];
  t.textContent = `${wf.look.name} 胜`; t.style.color = `rgb(${wf.look.slash})`;
  document.getElementById('endSub').textContent = M.mode === 'cpu' ? (w === 0 ? '月下无敌手' : '再磨一磨剑')
    : M.mode === 'net' ? `${w === localIdx() ? '你赢了' : '你输了'}，比分 ${M.wins[0]} : ${M.wins[1]}` : `比分 ${M.wins[0]} : ${M.wins[1]}`;
  const again = document.getElementById('againBtn');
  again.disabled = isClient(); again.textContent = isClient() ? '等房主再战' : '再战';
  setTimeout(() => showScreen('end'), 300);
}
function endRound() {
  const w = M.koWinner;
  if (w >= 0) M.wins[w]++;
  if (w >= 0 && M.wins[w] >= 2) {
    if (M.mode === 'demo') return startMatch('demo');
    M.phase = 'end';
    netEmit({ e: 'end', w, wins: [...M.wins] });
    if (!ROLL.on) showEnd(w);
    return;
  }
  M.round++;
  M.carry = null;   // 每回合双方都满血开始（不再继承上一回合的血量）
  startRound();
}

// ======================= 动作 =======================
function toNeutral(f) {
  f.move = null; f.sp = null; f.snap = false; f.skill = null; f.armorT = 0; f.parryT = 0; f.rooted = false;
  f.state = f.onGround() ? 'idle' : 'air';
  if (f.onGround()) { f.juggle = 0; }
}
function startAttack(f, name) {
  endEscape(f);
  f.state = 'attack'; f.move = f.moves[name]; f.moveName = name; f.t = 0;
  if (f.ch.passive === 'armor' && HEAVY_MOVES.includes(name)) { f.armorT = f.move.su + f.move.ac; f.armorHits = 1; }
  f.lunged = false; f.hitDone = false; f.hitConfirmed = false;
  f.face = f.onGround() ? (foeOf(f).x >= f.x ? 1 : -1) : f.face;
}
function doJump(f, dir) {
  f.vy = (f.jumps === 0 ? -JUMP_V : -DJUMP_V) * (f.ch.stat.jump || 1); f.jumps++;
  f.vx = dir ? dir * wk(f) * 1.15 : f.vx * 0.5;
  f.state = 'air'; f.y = Math.min(f.y, -1);
  if (f.jumps >= 2) ring(f.x, f.y - 20, 36, f.look.slash, 0.35);
  dust(f.x, 0, 6); SFX.jump();
}
function startDash(f, dir) {
  f.state = 'dash'; f.t = 0; f.dashDir = dir; f.vx = DASH_V * dir; f.vy = 0;
  f.invul = 0.13; f.dashCD = DODGE_CD;
  if (f.onGround()) dust(f.x - dir * 20, 0, 8);
  SFX.dash();
}
function startSpecial(f) {
  endEscape(f);
  f.meter = 0; f.state = 'special'; f.sp = 'charge'; f.t = 0; f.invul = 99; f.vx = 0; f.spFace = f.face;
  superFreeze = 0.5; superOwner = f; dimA = 1;
  flashA = 0.35; flashRGB = f.look.slash;
  say(ULTS[f.ch.ult].name, 0.9, 'super'); SFX.superOn();
  if (CHAR_RARITY[f.ch.id] === 'legend') { ring(f.x, f.y - 60, 210, '233,196,106', 0.6); ring(f.x, f.y - 60, 150, f.look.slash, 0.5); flashRGB = '233,196,106'; }
  ring(f.x, f.y - 60, 120, f.look.slash, 0.5);
}
function neutral(f, foe) {
  const c = f.ctrl, onG = f.onGround();
  if (onG && f.state !== 'victory') f.face = faceDir(f, foe);
  if (M.phase !== 'fight') {
    if (onG && f.state !== 'victory') { f.state = 'idle'; }
    f.vx = damp(f.vx, 0, 10, STEP);
    return;
  }
  const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
  if (onG) {
    if (f.meter >= 100 && c.consume('special')) return startSpecial(f);
    if (c.held.atk && clock - c.atkT >= CHARGE_START) { f.state = 'charge'; f.t = 0; f.chargeFull = false; SFX.charge(); return; }
    if (c.consume('light')) return startAttack(f, 'l1');
    if (c.consume('heavy')) return startAttack(f, 'hv');
    if (c.consume('jump')) return doJump(f, dir);
    if (c.held.down) { f.state = 'block'; f.face = Math.abs(foe.x - f.x) > 6 ? (foe.x >= f.x ? 1 : -1) : f.face; f.vx = damp(f.vx, dir * wk(f) * 0.3, 20, STEP); return; }   // 格挡时可以慢慢挪步
    if (f.skillCD <= 0 && c.consume('skill')) return startSkill(f, foe);
    if (f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
    const sp = dir === f.face ? wk(f) : wk(f) * 0.78;
    f.vx = damp(f.vx, dir * sp, 16, STEP);
    f.state = Math.abs(f.vx) > 25 ? 'walk' : 'idle';
  } else {
    f.state = 'air';
    if (c.consume('light')) return startAttack(f, 'a1');
    if (c.consume('heavy')) return startAttack(f, 'a2');
    if (f.jumps < (f.ch.jumps || 2) && c.consume('jump')) return doJump(f, dir);
    // 燕翎：空中按住跳跃就能飞（过了起跳最高点之后才开始）
    if (f.ch.fly && c.held.jump && f.flyT > 0 && f.vy > -120 && M.phase === 'fight') {
      f.flying = true; f.flyT -= STEP;
      f.vy = damp(f.vy, f.y < -230 ? 90 : -70, 8, STEP);
      f.vx = clamp(f.vx + dir * 2400 * STEP, -wk(f) * 1.4, wk(f) * 1.4);
      if (Math.random() < 0.3) addP({ type: 'spark', x: f.x - f.face * 18, y: f.y - 70, vx: -f.face * 60, vy: rand(20, 80), life: 0.3, max: 0.3, rgb: f.look.slash, w: 1.2 });
      return;
    }
    if (SKILLS[f.ch.skill].air && f.skillCD <= 0 && c.consume('skill')) return startSkill(f, foe);
    if (SKILLS[f.ch.skill2].air && f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
    f.vx = clamp(f.vx + dir * 1700 * STEP, -wk(f) * 1.2, wk(f) * 1.2);
  }
}
function attackUpdate(f, foe) {
  const m = f.move, c = f.ctrl, t = f.t;
  const act0 = m.su, act1 = m.su + m.ac;
  // 格挡更灵活：出招前段、或打完判定之后的收招，按住 S 都能立刻转成格挡
  if (c.held.down && f.onGround() && M.phase === 'fight' && (t < act0 * 0.6 || (t >= act1 && !f.hitConfirmed))) { toNeutral(f); f.state = 'block'; f.face = Math.abs(foe.x - f.x) > 6 ? (foe.x >= f.x ? 1 : -1) : f.face; return; }
  if (t >= act0 && !f.lunged) {
    f.lunged = true;
    if (f.ch.inkShot && /^l[1-5]$/.test(f.moveName) && f.ink >= INK_COST) {   // 墨羽：普攻甩出一团墨，按抛物线飞向对手（要有墨水）
      f.ink -= INK_COST;
      const T = 0.42, G = 1500, sx = f.x + f.face * 40, sy = f.y - 90;
      spawnProj(f, { kind: 'inkblob', x: sx, y: sy, vx: (foe.x - sx) / T, vy: ((foe.y - 60) - sy - 0.5 * G * T * T) / T, g: G, lob: true, w: 30, h: 30, life: 1.2, dmg: INK_DMG, kb: [80, 0], stun: 0.3, hs: 0.04, noScale: true });
    }
    if (f.ch.id === 'liuyun' && (f.moveName === 'cs1' || f.moveName === 'cs2')) {
      const n = f.moveName === 'cs2' ? 2 : 1, dx = foe.x - f.x, dy = (foe.y - 60) - (f.y - 62), a0 = Math.atan2(dy, dx);
      for (let k = 0; k < n; k++) {
        const a = a0 + (n === 2 ? (k ? 0.1 : -0.1) : 0);
        spawnProj(f, { kind: 'wind', x: f.x + Math.cos(a) * 40, y: f.y - 62, vx: Math.cos(a) * 1150, vy: Math.sin(a) * 1150, w: 56, h: 52, life: 1.2, dmg: 7, kb: [420, 0], stun: 0.5, hs: 0.08, knock: true, unbreakable: f.moveName === 'cs2' });
      }
    }
    if (m.track) {
      f.face = foe.x >= f.x ? 1 : -1;
      f.vx = f.face * clamp((Math.abs(foe.x - f.x) - 40) / 0.12, 150, 1300);
    } else if (!m.air) {
      const close = Math.abs(foe.x - f.x) < 70 && Math.sign(foe.x - f.x) === f.face;
      f.vx = (m.lunge || 0) * f.face * (close ? 0.35 : 1);
    }
    SFX[m.snd]();
  }
  if (t >= act0 && t < act1 && !f.hitDone) tryHit(f, foe, m);
  if (M.phase === 'fight' && /^l\d/.test(f.moveName) && f.skill2CD <= 0 && (f.onGround() || SKILLS[f.ch.skill2].air) && c.consume('skill2')) return startSkill(f, foe, 2);
  if (M.phase === 'fight' && t >= act0 + m.ac * 0.6) {
    if (m.next.light && c.consume('light')) return startAttack(f, m.next.light);
    if (f.hitConfirmed && m.hitNext && m.hitNext.light && c.consume('light')) return startAttack(f, m.hitNext.light);
    if (m.next.heavy && c.consume('heavy')) return startAttack(f, m.next.heavy);
    if (f.hitConfirmed) {
      if (f.skillCD <= 0 && c.consume('skill')) return startSkill(f, foe);
      if (f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
      if (m.jumpCancel && c.consume('jump')) { f.jumps = 0; f.face = foe.x >= f.x ? 1 : -1; return doJump(f, f.face); }
    }
  }
  if (t >= act1 + m.rc) {
    toNeutral(f);
    if (c.held.down && f.onGround()) { f.state = 'block'; f.face = Math.abs(foe.x - f.x) > 6 ? (foe.x >= f.x ? 1 : -1) : f.face; }
  }
}
function endSpecial(f) { f.invul = 0; toNeutral(f); }
function specialUpdate(f, foe) {
  const t = f.t, U = ULTS[f.ch.ult];
  if (f.sp === 'charge') {
    if (t >= 0.42) {
      f.t = 0;
      if (U.flurry) { f.sp = 'dash'; f.vx = 1400 * f.face; SFX.dash(); }
      else U.begin(f, foe);
    }
    return;
  }
  if (!U.flurry) { U.update(f, foe); return; }
  if (f.sp === 'dash') {
    if (!isClient() && foe.hp > 0 && foe.invul <= 0 && overlap(hitbox(f, [0, -118, 96, 0]), hurtbox(foe))) {
      f.sp = 'flurry'; f.t = 0; f.slashN = 0; f.vx = 0;
      foe.state = 'held'; foe.t = 0; foe.vx = 0; foe.vy = 0; foe.move = null; foe.y = Math.min(foe.y, -50);
      const ev = { e: 'hit', a: f.idx, d: foe.idx, x: foe.x, y: foe.y - 60, dmg: 9, hs: 0.12, nc: true };
      hitVisual(ev); netEmit(ev);
    } else if (t >= 0.26) { f.sp = 'miss'; f.t = 0; f.vx *= 0.25; }
  } else if (f.sp === 'miss') {
    if (t >= 0.42) { f.invul = 0; toNeutral(f); }
  } else if (f.sp === 'flurry') {
    const n = Math.floor(t / U.iv);
    if (n > f.slashN - 1 && f.slashN < U.n) {
      const side = f.slashN % 2 ? 1 : -1;
      f.x = clamp(foe.x + side * grand(60, 90), WALL, STAGE_W - WALL);
      f.y = Math.min(0, foe.y + grand(-30, 30));
      f.face = foe.x >= f.x ? 1 : -1;
      f.snap = true; f.trail.length = 0;
      const ang = rand(0, Math.PI);
      slashLine(foe.x, foe.y - 55, ang, f.look.slash);
      if (f.ch.ult === 'shadows') {
        decoys.push({ owner: f.idx, sk: f.sk, x0: f.x, y0: f.y, x: f.x, y: f.y, vx: rand(-40, 40), vy: rand(-30, 30), rot: 0, vr: 0, life: 0.35, landed: true, age: 0 });
        smoke(f.x, f.y - 50, 6);
      } else if (f.ch.ult === 'crescent') {
        ring(foe.x, foe.y - 55, 75, '120,230,255', 0.22);
      }
      applyHit(f, foe, { ...SP_SLASH, dmg: U.slash }, [foe.x, foe.y - 55]);
      SFX.slice(); f.slashN++;
    }
    if (t >= U.iv * U.n + 0.06) {
      f.sp = 'final'; f.t = 0; f.snap = true; f.trail.length = 0;
      f.x = clamp(foe.x - f.spFace * 80, WALL, STAGE_W - WALL); f.face = f.spFace; f.y = Math.min(0, foe.y + 40);
    }
  } else if (f.sp === 'final') {
    if (t >= 0.07 && !f.finalDone) {
      f.finalDone = true; f.snap = false;
      // 残月：最后一击把对手就近打倒，自己直接落地，不能再追击
      if (U.land) { f.y = 0; f.vy = 0; applyHit(f, foe, { ...FINAL, dmg: U.fin, kb: [260, 0], knock: true }, [foe.x, foe.y - 60]); }
      else applyHit(f, foe, { ...FINAL, dmg: U.fin }, [foe.x, foe.y - 60]);
      flashA = 0.6; flashRGB = f.ch.ult === 'shadows' ? '255,95,115' : '255,255,255'; shake = 22;
      for (let i = 0; i < (f.ch.ult === 'shadows' ? 4 : 3); i++) slashLine(foe.x, foe.y - 55, rand(-0.4, 0.4), f.look.slash);
      if (f.ch.ult === 'crescent') {
        f.skillCD = 0; f.skill2CD = 0; f.dashCD = 0;
        f.meter = Math.min(100, f.meter + 20);
        addP({ type: 'text', text: '🌙 剑气归元 · 瞬步重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '120,230,255' });
        SFX.chargeFull();
      } else if (f.ch.ult === 'shadows') {
        f.skillCD = 0; f.skill2CD = 0; f.dashCD = 0;
        for (let k = 0; k < 2; k++) {
          decoys.push({ owner: f.idx, sk: f.sk, x0: f.x + (k === 0 ? -40 : 40), y0: f.y, x: f.x + (k === 0 ? -40 : 40), y: f.y, vx: rand(-50, 50), vy: rand(-30, 30), rot: 0, vr: 0, life: 1.8, landed: true, age: 0 });
          smoke(f.x + (k === 0 ? -40 : 40), f.y - 40, 8);
        }
        addP({ type: 'text', text: '🗡️ 影遁无形 · 苦无重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '255,95,115' });
        SFX.chargeFull();
      }
    }
    if (t >= 0.5) { f.finalDone = false; endSpecial(f); }
  }
}
// ======================= 技能执行 =======================
function startSkill(f, foe, slot) {
  const id = slot === 2 ? f.ch.skill2 : f.ch.skill, S = SKILLS[id];
  endEscape(f);
  f.state = 'skill'; f.skill = id; f.t = 0; f.skPh = 0; f.hitDone = false; f.move = null;
  if (slot === 2) f.skill2CD = S.cd; else f.skillCD = S.cd;
  f.face = faceDir(f, foe);   // 技能朝角色面向的方向放（电脑没有方向键，自动面向对手）
  S.start(f, foe);
}
// 技能的一次近身判定（每个阶段只会打中一次）
function strike(f, foe, spec) {
  if (f.hitDone) return false;
  const hb = hitbox(f, spec.box);
  if (hitDecoy(f, hb)) return false;
  if (foe.invul > 0 || foe.hp <= 0 || !overlap(hb, hurtbox(foe))) return false;
  f.hitDone = true;
  const hu = hurtbox(foe);
  applyHit(f, foe, spec, [(Math.max(hb[0], hu[0]) + Math.min(hb[2], hu[2])) / 2, (Math.max(hb[1], hu[1]) + Math.min(hb[3], hu[3])) / 2]);
  return true;
}
// 月镜格开：对手硬直，自己准备反斩
function parry(def, att, pt) {
  def.parryT = 0; def.skPh = 2; def.t = 0; def.hitDone = false; def.invul = 0.35; def.face = att.x >= def.x ? 1 : -1;
  att.move = null; att.state = 'hitstun'; att.t = 0; att.stun = 0.55; att.vx = def.face * 120; att.skill = null;
  att.breakCD = Math.max(att.breakCD, 0.4);
  const ev = { e: 'parry', a: def.idx, x: pt[0], y: pt[1] };
  parryVisual(ev); netEmit(ev);
}
function parryVisual(ev) {
  const d = [A, B][ev.a];
  ring(ev.x, ev.y, 110, '255,255,255', 0.35); ring(ev.x, ev.y, 60, d.look.slash, 0.3);
  slashLine(ev.x, ev.y, -0.6, d.look.slash); flashA = Math.max(flashA, 0.35); flashRGB = '255,255,255';
  hitstop = Math.max(hitstop, 0.14); shake = Math.max(shake, 10);
  addP({ type: 'callout', text: '截', x: ev.x, y: ev.y - 70, life: 0.75, max: 0.75, rgb: '255,225,120', scale: 2.2 });
  SFX.block(); metal(1900, 0.8, 0.1);
}

// ======================= 飞行道具 =======================
const projs = [];
let projSeq = 0;
function spawnProj(f, o) {
  if (isClient()) return;   // 联机时由房主生成，加入方从快照同步
  projs.push(Object.assign({ id: ++projSeq, owner: f.idx, vy: 0, life: 1, age: 0, hits: 0, hitCD: 0, delay: 0, isProj: true }, o));
}
function projBox(p) { return [p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2]; }
function updateProjs() {
  for (const p of projs) {
    if (p.dead) continue;
    p.age += STEP; p.life -= STEP; p.hitCD -= STEP;
    const wasDelay = p.delay > 0;
    if (p.delay > 0) { p.delay -= STEP; if (p.delay <= 0 && p.kind === 'bolt') { if (p.small) { dust(p.x, 0, 8); SFX.thunder(); flashA = Math.max(flashA, 0.1); flashRGB = '255,245,200'; } else boltFX(p); } continue; }
    if (p.g) p.vy += p.g * STEP;
    if (p.boomer && p.age > p.turn) {
      const o = [A, B][p.owner], dx = o.x - p.x;
      p.vx = damp(p.vx, Math.sign(dx) * 860, 7, STEP); p.vy = damp(p.vy, (o.y - 65 - p.y) * 4, 7, STEP);
      if (Math.abs(dx) < 34 && p.age > p.turn + 0.15) { p.dead = true; continue; }
    }
    p.x += p.vx * STEP; p.y += p.vy * STEP;
    if (p.lob && p.y >= -8) { p.dead = true; for (let i = 0; i < 10; i++) addP({ type: 'ink', x: p.x, y: -4, vx: rand(-160, 160), vy: rand(-200, -40), g: 1400, life: 0.5, max: 0.5, r: rand(2, 4), rgb: '15,15,22' }); continue; }
    if (p.kind === 'dragon' || p.kind === 'tornado' || p.kind === 'wind') { if (Math.random() < 0.6) addP({ type: 'ink', x: p.x - Math.sign(p.vx) * p.w * 0.4, y: p.y + rand(-p.h / 3, p.h / 3), vx: -p.vx * 0.1, vy: rand(-40, 40), life: 0.5, max: 0.5, r: rand(2, 5), rgb: p.kind === 'dragon' ? '20,20,28' : CHARS[[A, B][p.owner].chIdx].look.slash }); }
    if (p.life <= 0 || p.x < -300 || p.x > STAGE_W + 300) { p.dead = true; continue; }
    if (p.fx || p.dmg <= 0) continue;
    const owner = [A, B][p.owner], foe = foeOf(owner), box = projBox(p);
    // 斩弹：对手的刀砍中飞行道具就把它打散
    if (!p.unbreakable && foe.state === 'attack' && foe.move && foe.t >= foe.move.su && foe.t < foe.move.su + foe.move.ac && overlap(hitbox(foe, foe.move.box), box)) {
      p.dead = true; blockFX(p.x, p.y, foe.face); SFX.block();
      foe.meter = Math.min(100, foe.meter + 1.5);
      addP({ type: 'text', text: '斩', x: p.x, y: p.y - 30, life: 0.5, max: 0.5, rgb: foe.look.slash }); continue;
    }
    if (hitDecoyBox(box, p.owner)) { if (!p.pierce) p.dead = true; continue; }
    if (p.hitCD > 0 || foe.invul > 0 || foe.hp <= 0) continue;
    if ((p.groundOnly || p.kind === 'quake') && (foe.y < -16 || foe.flying)) continue;
    if (!overlap(box, hurtbox(foe))) continue;
    // 霸体吃掉飞行道具
    if (foe.armorT > 0 && !p.ult) {
      p.dead = true; ring(p.x, p.y, 50, '255,215,120', 0.25); SFX.block();
      if (foe.ch.passive === 'armor') {
        foe.meter = Math.min(100, foe.meter + 3);
        foe.skillCD = Math.max(0, foe.skillCD - 0.3);
        foe.skill2CD = Math.max(0, foe.skill2CD - 0.3);
      }
      addP({ type: 'text', text: '霸体', x: foe.x, y: foe.y - 130, life: 0.6, max: 0.6, rgb: '255,215,120' }); continue;
    }
    p.dir = p.vx !== 0 ? Math.sign(p.vx) : (foe.x >= p.x ? 1 : -1); p.srcX = p.x - p.dir * 10;
    let hitM = p.lastBig && p.hits === (p.maxHits || 1) - 1 ? { ...p, kb: [420, -780], hs: 0.14, big: true } : p;
    if (p.kind === 'moonring') {
      const returning = p.boomer && p.age > p.turn;
      if (returning) {
        hitM = { ...p, dmg: 7, stun: 0.78, hs: 0.12, launch: true, kb: [180, -580], big: true };
        addP({ type: 'text', text: '背袭破防', x: foe.x, y: foe.y - 100, life: 0.8, max: 0.8, rgb: '230,200,255' });
      } else {
        hitM = { ...p, dmg: 5, stun: 0.25, hs: 0.04, launch: false, kb: [100, 0] };
      }
    } else if (p.kind === 'inkblob') {
      foe.slowT = 2.5;
      addP({ type: 'text', text: '墨迹遮目', x: foe.x, y: foe.y - 100, life: 0.9, max: 0.9, rgb: '160,160,190' });
    }
    applyHit(owner, foe, hitM, [clamp(foe.x, box[0], box[2]), clamp(foe.y - 60, box[1], box[3])]);
    p.hits++; p.hitCD = p.rehit || 99;
    if (!p.pierce || p.hits >= (p.maxHits || 1)) p.dead = true;
  }
  for (let i = projs.length - 1; i >= 0; i--) if (projs[i].dead) projs.splice(i, 1);
}
function boltFX(p) { shake = Math.max(shake, 10); flashA = Math.max(flashA, 0.35); flashRGB = '255,245,200'; dust(p.x, 0, 12); ring(p.x, 0, 90, '255,240,150', 0.3); SFX.thunder(); }
// 腾空闪：任何状态都能用（被大招锁住时除外）。解除硬直、倒地、定身，向上闪起；落地或自己出手之前无敌
const ESC_FX = { qingfeng: 'wind', feiying: 'smoke', tieshan: 'quake', lingshuang: 'wind', liuyun: 'wind', leiming: 'bolt', moyu: 'ink', yuehua: 'moon', yanling: 'wing' };
function tryEscape(f, foe) {
  if (f.hp <= 0 || f.breakCD > 0 || M.phase !== 'fight' || ['held', 'special', 'victory'].includes(f.state)) return false;
  if (!f.ctrl.consume('dash')) return false;
  const away = f.x >= foe.x ? 1 : -1;
  f.breakCD = f.ch.escCD || BREAK_CD;
  f.state = 'air'; f.t = 0; f.move = null; f.skill = null; f.sp = null; f.rooted = false; f.stun = 0;
  f.vy = -1000 * (f.ch.id === 'yanling' ? 1.15 : f.ch.id === 'tieshan' ? 0.9 : 1); f.vx = away * 150; f.y = Math.min(f.y, -2);
  f.escInvul = true; f.escT = 0; f.invul = 99;
  f.juggle = 0; f.comboHits = 0; f.spiked = false; f.bounced = false; f.jumps = 1; f.rot = 0; f.armorT = 0;
  delete f.ctrl.buf.light; delete f.ctrl.buf.heavy; f.ctrl.atkT = clock + 1e6;   // 松开左键前不会开始蓄力
  comboUI[foe.idx].t = Math.min(comboUI[foe.idx].t, 0.3);
  const kind = ESC_FX[f.ch.id] || 'wind', c = f.look.slash;
  ring(f.x, f.y - 50, 100, c, 0.35); ring(f.x, f.y - 50, 50, '255,255,255', 0.25);
  for (let i = 0; i < 20; i++) { const a = rand(Math.PI * 0.15, Math.PI * 0.85), v = rand(200, 600); addP({ type: kind === 'smoke' || kind === 'ink' ? 'ink' : 'spark', x: f.x + rand(-20, 20), y: f.y - rand(10, 80), vx: Math.cos(a) * v * (Math.random() < 0.5 ? 1 : -1), vy: Math.sin(a) * v * 0.6, g: kind === 'ink' ? 900 : 0, life: 0.4, max: 0.4, r: rand(2, 4), rgb: kind === 'ink' || kind === 'smoke' ? '20,18,30' : c, w: 1.8, drag: 5 }); }
  if (kind === 'quake') { dust(f.x, 0, 16); shake = Math.max(shake, 6); }
  if (kind === 'smoke' || kind === 'ink') smoke(f.x, f.y - 40, 12);
  if (kind === 'bolt') { flashA = Math.max(flashA, 0.15); flashRGB = c; }
  SFX.escape();
  return true;
}
function endEscape(f) { if (f.escInvul) { f.escInvul = false; f.invul = 0; } }
const decoys = [];
function breakOut(f, foe) {
  const away = f.x >= foe.x ? 1 : -1;
  f.breakCD = f.ch.escCD || BREAK_CD;
  decoys.push({ owner: f.idx, sk: f.sk, x0: f.x, y0: f.y, x: f.x, y: f.y, vx: f.vx * 0.4, vy: Math.min(f.vy, 0) * 0.5, rot: 0, vr: away * -3, life: 1.1, landed: f.y >= -1, age: 0 });
  smoke(f.x, f.y - 50, 16);
  f.x = clamp(f.x + away * 110, WALL, STAGE_W - WALL);
  const air = f.y < -1;
  f.state = air ? 'air' : 'idle'; f.t = 0; f.move = null;
  f.vx = 0; f.vy = air ? -220 : 0; f.invul = 0.4; f.rot = 0;
  f.juggle = 0; f.comboHits = 0; f.spiked = false; f.bounced = false; f.jumps = 1; f.airDash = 1;
  f.face = foe.x >= f.x ? 1 : -1;
  f.trail.length = 0; f.scarf = []; f.ghosts = [];
  f.j = {}; for (const k of JOINTS) f.j[k] = [...POSES.fall[k]]; f.j.sw = POSES.fall.sw;
  smoke(f.x, f.y - 50, 10);
  comboUI[foe.idx].t = Math.min(comboUI[foe.idx].t, 0.3);
  hitstop = Math.max(hitstop, 0.04);
  SFX.poof();
}
function updateDecoys() {
  for (const d of decoys) {
    d.life -= STEP;
    d.age += STEP;
    if (d.landed) d.rot += ((d.vr > 0 ? 1.4 : -1.4) * clamp((d.age - 0.25) / 0.35, 0, 1) - d.rot) * 0.2;
    if (!d.landed) {
      d.vy += GRAV * LAUNCH_GRAV * STEP; d.x += d.vx * STEP; d.y += d.vy * STEP; d.rot += d.vr * STEP;
      if (d.y >= 0) { d.y = 0; d.landed = true; d.vx = 0; d.age = 0.4; dust(d.x, 0, 6); SFX.wood(); }
    }
    if (d.life <= 0 && !d.gone) { d.gone = true; smoke(d.x, d.y - 40, 12); }
  }
  for (let i = decoys.length - 1; i >= 0; i--) if (decoys[i].gone) decoys.splice(i, 1);
}
// 攻击先打到假人：假人碎掉，这一刀作废
function hitDecoy(att, box) { if (hitDecoyBox(box, att.idx)) { att.hitDone = true; return true; } return false; }
function hitDecoyBox(box, attIdx) {
  for (const d of decoys) {
    if (d.gone || d.owner === attIdx) continue;
    if (overlap(box, [d.x - 22, d.y - 100, d.x + 22, d.y + 2])) {
      d.gone = true;
      smoke(d.x, d.y - 50, 10);
      for (let i = 0; i < 14; i++) { const a = rand(-Math.PI, 0), v = rand(150, 500); addP({ type: 'ink', x: d.x, y: d.y - 50, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1500, life: 0.7, max: 0.7, r: rand(2, 4), rgb: '176,138,90' }); }
      hitstop = Math.max(hitstop, 0.04); SFX.wood();
      return true;
    }
  }
  return false;
}
function smoke(x, y, n) {
  for (let i = 0; i < n; i++) addP({ type: 'smoke', x: x + rand(-18, 18), y: y + rand(-30, 30), vx: rand(-90, 90), vy: rand(-90, 20), drag: 3, life: rand(0.4, 0.7), max: 0.7, r: rand(10, 22) });
}
function chargeUpdate(f, foe) {
  const c = f.ctrl;
  if (f.skill2CD <= 0 && c.consume('skill2')) return startSkill(f, foe, 2);
  f.face = faceDir(f, foe);
  const full = f.t >= CHARGE_FULL;
  if (full && !f.chargeFull) {
    f.chargeFull = true; ring(f.x, f.y - 60, 95, f.look.slash, 0.35);
    flashA = Math.max(flashA, 0.12); flashRGB = f.look.slash; SFX.chargeFull();
  }
  // 光点向剑尖聚集
  if (f.sk && Math.random() < (full ? 0.9 : 0.5)) {
    const a = rand(0, Math.PI * 2), r = rand(45, 95);
    addP({ type: 'spark', x: f.sk.tip[0] + Math.cos(a) * r, y: f.sk.tip[1] + Math.sin(a) * r, vx: -Math.cos(a) * r * 5, vy: -Math.sin(a) * r * 5, life: 0.18, max: 0.18, rgb: f.look.slash, w: 1.6 });
  }
  if (M.phase !== 'fight') return toNeutral(f);
  const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
  f.vx = damp(f.vx, dir * wk(f) * 0.32, 10, STEP);
  f.walkPh += STEP * f.vx * f.face * 0.07;
  if (!c.held.atk) { f.chargeFull = false; startAttack(f, full ? 'cs2' : 'cs1'); }
}
function updateFighter(f, foe) {
  f.t += STEP;
  f.dashCD = Math.max(0, f.dashCD - STEP);
  f.breakCD = Math.max(0, f.breakCD - STEP);
  f.skill2CD = Math.max(0, f.skill2CD - STEP);
  if (f.ch.inkShot) f.ink = Math.min(INK_MAX, (f.ink || 0) + INK_REGEN * STEP);
  f.bbT = Math.max(0, (f.bbT || 0) - STEP); f.twinT = Math.max(0, (f.twinT || 0) - STEP);
  if (f.onGround()) f.diveChained = false;
  trySecondQ(f, foe);
  if (f.escInvul) { f.escT += STEP; if (f.escT > 1.1 || f.flying) endEscape(f); }
  if (tryEscape(f, foe)) { physics(f); return; }
  f.skillCD = Math.max(0, f.skillCD - STEP);
  f.flying = false;
  if (f.dummy && f.sinceHit > 2 && f.hp < f.maxHp) f.hp = f.maxHp;
  if (f.dummy && f.ctrl && f.ctrl.mode === 'fixed') { f.vx = 0; f.vy = 0; f.y = 0; if (f.homeX === undefined) f.homeX = f.x; f.x = f.homeX; } else if (f.dummy) f.homeX = undefined;
  if (f.ch.fly && f.onGround()) f.flyT = Math.min(f.ch.fly, f.flyT + STEP * 0.9);
  f.armorT = Math.max(0, f.armorT - STEP);
  f.slowT = Math.max(0, (f.slowT || 0) - STEP);
  f.buffT = Math.max(0, f.buffT - STEP);
  f.sinceBlock = (f.sinceBlock || 0) + STEP;
  if (f.state !== 'block' && f.state !== 'blockstun' && f.sinceBlock > 0.6) {
    const regen = ((f.ch && f.ch.stat && f.ch.stat.guardRegen) || 26) * STEP;
    f.guard = Math.min(f.maxGuard, (f.guard !== undefined ? f.guard : f.maxGuard) + regen);
  }
  if (f.state === 'skill' && f.skill === 'mirror') f.parryT = Math.max(0, f.parryT - STEP);
  // 月华被动：3 秒没挨打缓慢回血
  f.sinceHit += STEP;
  if (f.ch.passive === 'regen' && M.phase === 'fight' && f.hp > 0 && f.hp < f.maxHp && f.sinceHit > 3 && f.regenLeft > 0) {
    const h = Math.min(1.6 * STEP, f.regenLeft); f.hp = Math.min(f.maxHp, f.hp + h); f.regenLeft -= h;
  }
  if (f.state !== 'special') f.invul = Math.max(0, f.invul - STEP);
  f.flash = Math.max(0, f.flash - STEP);
  switch (f.state) {
    case 'idle': case 'walk': case 'air': case 'block': neutral(f, foe); break;
    case 'attack': attackUpdate(f, foe); break;
    case 'dash':
      if (M.phase === 'fight' && f.t > 0.07) {
        if (f.ctrl.consume('light')) { startAttack(f, f.onGround() ? 'l3' : 'a1'); break; }
        if (f.ctrl.consume('heavy')) { startAttack(f, f.onGround() ? 'hv' : 'a2'); break; }
      }
      if (f.t >= DASH_T) { f.vx *= 0.35; toNeutral(f); }
      break;
    case 'hitstun':
      if (f.t >= f.stun) { f.comboHits = 0; toNeutral(f); }
      break;
    case 'blockstun':
      if (f.ctrl && f.ctrl.held && f.ctrl.held.down && Math.abs(foe.x - f.x) > 6) {
        f.face = foe.x >= f.x ? 1 : -1;
      }
      if (f.t >= f.stun) {
        if (!f.ctrl.held.down) {
          toNeutral(f);
          const c = f.ctrl;
          if (c && M.phase === 'fight') {
            const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
            if (f.meter >= 100 && c.consume('special')) { startSpecial(f); break; }
            if (f.skillCD <= 0 && c.consume('skill')) { startSkill(f, foe); break; }
            if (f.skill2CD <= 0 && c.consume('skill2')) { startSkill(f, foe, 2); break; }
            if (c.consume('light')) { startAttack(f, 'l1'); break; }
            if (c.consume('heavy')) { startAttack(f, 'hv'); break; }
            if (c.consume('jump')) { doJump(f, dir); break; }
          }
        } else {
          f.state = 'block';
        }
      }
      break;
    case 'knockdown': if (f.t >= 0.6 && f.hp > 0 && M.phase !== 'end') { f.state = 'getup'; f.t = 0; f.invul = 0.35; f.comboHits = 0; f.juggle = 0; } break;
    case 'getup':
      if (f.t >= 0.3) {
        if (f.ctrl && f.ctrl.held && f.ctrl.held.down) {
          f.state = 'block'; f.face = Math.abs(foe.x - f.x) > 6 ? (foe.x >= f.x ? 1 : -1) : f.face;
        } else {
          toNeutral(f);
        }
      }
      break;
    case 'special': specialUpdate(f, foe); break;
    case 'charge': chargeUpdate(f, foe); break;
    case 'skill': SKILLS[f.skill].update(f, foe); break;
    case 'launched': break;
  }
  physics(f);
}
function physics(f) {
  const wasAir = f.y < 0 || f.vy < 0;
  let g = GRAV;
  if (f.flying) g = 0;
  if (f.state === 'dash' || f.state === 'held' || f.state === 'special') g = 0;
  else if (f.state === 'attack' && f.move.air) g *= 0.45;
  else if (f.state === 'launched') {
    const w = (f.ch && f.ch.stat && f.ch.stat.weight) || 1;
    g *= LAUNCH_GRAV * (1 + f.juggle * 0.12) * Math.min(1.25, Math.max(0.85, Math.pow(w, 0.35)));
  }
  if (wasAir) f.vy += g * STEP;
  if (f.state === 'held') { f.vx = 0; f.vy = 0; }
  f.x += f.vx * STEP; f.y += f.vy * STEP;
  if (f.y >= 0) { f.y = 0; if (wasAir) onLand(f); if (f.vy > 0) f.vy = 0; }
  const onG = f.y >= 0;
  const slide = f.state === 'skill' && SKILLS[f.skill] && SKILLS[f.skill].nofric;
  if (onG && !slide && !['walk', 'dash', 'idle', 'attack', 'charge'].includes(f.state)) f.vx = damp(f.vx, 0, 9, STEP);
  if (onG && f.state === 'attack') f.vx = damp(f.vx, 0, f.lunged ? 7 : 14, STEP);
  if (f.x < WALL || f.x > STAGE_W - WALL) {
    const side = f.x < WALL ? -1 : 1;
    f.x = side < 0 ? WALL : STAGE_W - WALL;
    if (f.state === 'launched' && Math.abs(f.vx) > 350) { f.vx *= -0.4; shake = Math.max(shake, 6); ring(f.x, f.y - 50, 50, '255,255,255', 0.3); SFX.thud(); }
    else if (Math.sign(f.vx) === side) f.vx = 0;
  }
}
function onLand(f) {
  if (f.escInvul) {   // 腾空闪落地：无敌结束，短暂落地硬直
    f.escInvul = false; f.invul = 0; f.jumps = 0; f.airDash = 1;
    f.state = 'getup'; f.t = 0.15; f.vx *= 0.3; dust(f.x, 0, 6); SFX.land();
    return;
  }
  if (f.state === 'launched') {
    if (f.spiked && !f.bounced) { f.vy = -560; f.bounced = true; f.y = -1; shake = Math.max(shake, 8); dust(f.x, 0, 14); ring(f.x, 0, 70, '255,255,255', 0.35); SFX.thud(); return; }
    f.state = 'knockdown'; f.t = 0; f.vx *= 0.3; f.invul = 99; f.rot = 0;
    dust(f.x, 0, 12); shake = Math.max(shake, 5); SFX.thud();
    return;
  }
  if (f.state === 'held') return;
  f.jumps = 0; f.airDash = 1;
  if (f.state === 'air' || (f.state === 'attack' && f.move.air)) {
    toNeutral(f);
    if (f.ctrl && f.ctrl.held && f.ctrl.held.down) { f.state = 'block'; f.face = Math.abs(foeOf(f).x - f.x) > 6 ? (foeOf(f).x >= f.x ? 1 : -1) : f.face; }
    dust(f.x, 0, 4); SFX.land();
  }
  else if (f.state === 'dash') { /* 地面冲刺结束会自己转状态 */ }
}

// ======================= 判定 =======================
function hitbox(f, b) {
  const x0 = f.x + f.face * b[0], x1 = f.x + f.face * b[2];
  return [Math.min(x0, x1), f.y + b[1], Math.max(x0, x1), f.y + b[3]];
}
function hurtbox(f) {
  const s = f.size || 1;
  if (f.state === 'knockdown') return [f.x - 40 * s, f.y - 20 * s, f.x + 40 * s, f.y];
  if (f.state === 'launched' || f.state === 'held') return [f.x - 28 * s, f.y - 92 * s, f.x + 28 * s, f.y + 4];
  if (f.state === 'block' || f.state === 'blockstun' || f.state === 'getup') return [f.x - 18 * s, f.y - 92 * s, f.x + 18 * s, f.y];
  return [f.x - 18 * s, f.y - 112 * s, f.x + 18 * s, f.y];
}
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function tryHit(f, foe, m) {
  if (hitDecoy(f, hitbox(f, m.box))) return;
  if (foe.invul > 0 || foe.hp <= 0) return;
  const hb = hitbox(f, m.box), hu = hurtbox(foe);
  if (!overlap(hb, hu)) return;
  f.hitDone = true;
  const px = (Math.max(hb[0], hu[0]) + Math.min(hb[2], hu[2])) / 2, py = (Math.max(hb[1], hu[1]) + Math.min(hb[3], hu[3])) / 2;
  if (f.ch.passive === 'tip' && /^l\d/.test(m.name || '')) {
    const tip = Math.abs(hu[f.face > 0 ? 0 : 2] - f.x) > m.box[2] * 0.62;
    m = { ...m, dmg: m.dmg * (tip ? 1.25 : 1.25 / 3) };   // 枪身伤害 = 枪尖的三分之一
    if (!isClient()) addP({ type: 'text', text: tip ? '枪尖' : '枪身', x: px, y: py - 30, life: 0.5, max: 0.5, rgb: tip ? f.look.slash : '180,180,190' });
  }
  applyHit(f, foe, m, [px, py]);
}
const predicted = [];
function predictHit(att, def, m, pt) {
  if (att.idx !== localIdx() || m.isProj) return;
  const holdingBlock = !!(def.ctrl && def.ctrl.held && def.ctrl.held.down);
  const wasBlocking = ((def.state === 'block' || def.state === 'blockstun') || (holdingBlock && ['idle', 'walk'].includes(def.state))) && def.onGround();
  const sx = m.srcX !== undefined ? m.srcX : att.x, fx = m.dir || att.face;
  if (wasBlocking && !m.unblockable) {
    const atkDir = Math.sign(sx - def.x) || -fx || def.face;
    def.face = atkDir;
  }
  const blocking = wasBlocking && !m.unblockable;
  hitVisual({ e: 'hit', a: att.idx, d: def.idx, x: pt[0], y: pt[1], dmg: m.dmg, hs: m.hs, big: !!m.big, blk: blocking, f: fx, nc: true });
  predicted.push(performance.now());
}
function applyHit(att, def, m, pt) {
  if (def.forestProxy) { forestHit(att, m, pt); return; }
  if (isClient()) { predictHit(att, def, m, pt); return; }   // 联机时由房主判定；加入方先播放自己出手的效果
  const fx = m.dir || att.face, sx = m.srcX !== undefined ? m.srcX : att.x;
  // 月镜：格开近身攻击并反斩（飞行道具和大招无效）
  if (def.state === 'skill' && def.parryT > 0 && !m.isProj && !m.ult) { parry(def, att, pt); def.skill2CD = 0; return; }
  const holdingBlock = !!(def.ctrl && def.ctrl.held && def.ctrl.held.down);
  const wasBlocking = ((def.state === 'block' || def.state === 'blockstun') || (holdingBlock && ['idle', 'walk'].includes(def.state))) && def.onGround();
  if (wasBlocking && !m.unblockable) {
    const atkDir = Math.sign(sx - def.x) || -fx || def.face;
    def.face = atkDir;
  }
  const blocking = wasBlocking && !m.unblockable;
  const ev = { e: 'hit', a: att.idx, d: def.idx, x: pt[0], y: pt[1], dmg: m.dmg, hs: m.hs, big: !!m.big, wb: wasBlocking && !!m.big, blk: blocking, f: fx };
  const mm = att.ch.meterMul || 1;

  // 体量压制与动量碰撞比 (Kinetic Impact Ratio)
  const attWeight = (att.ch && att.ch.stat && att.ch.stat.weight) || 1;
  const defWeight = (def.ch && def.ch.stat && def.ch.stat.weight) || 1;
  const massRatio = clamp(attWeight / defWeight, 0.45, 2.5);

  if (blocking) {
    const chipFrac = (def.ch && def.ch.stat && def.ch.stat.guardChip) || 0.12;
    def.hp = Math.max(1, def.hp - m.dmg * chipFrac);

    // 消耗架势耐力（Guard Posture）：重体量/高威能打小体量，架势消耗倍增
    const guardLoss = (m.dmg * 1.5 * Math.sqrt(massRatio) * (m.guardBreakMul || (m.big ? 1.35 : 1))) / ((def.ch && def.ch.stat && def.ch.stat.guardStab) || 1);
    def.guard = Math.max(0, (def.guard !== undefined ? def.guard : def.maxGuard) - guardLoss);
    def.sinceBlock = 0;

    // 破防崩势判定（Guard Break）
    if (def.guard <= 0) {
      def.guard = 0;
      def.state = 'hitstun'; def.t = 0; def.stun = 0.85; def.rooted = true;
      def.vx = fx * 140;
      shake = 18; flashA = 0.4; flashRGB = '255,100,80';
      ring(def.x, def.y - 60, 160, '255,120,80', 0.45);
      addP({ type: 'text', text: '💥 破防崩势', x: def.x, y: def.y - 110, life: 1.2, max: 1.2, rgb: '255,120,80' });
      SFX.heavy();
      ev.guardBreak = true;
      hitVisual(ev); netEmit(ev);
      return;
    }

    def.state = 'blockstun'; def.t = 0;
    def.stun = (0.08 + m.hs * 0.7) * ((def.ch && def.ch.stat && def.ch.stat.poise) || 1);
    def.vx = fx * (180 + Math.abs(m.kb[0]) * 0.35) * Math.sqrt(massRatio);
    if (!m.isProj) att.vx -= att.face * (120 / Math.sqrt(massRatio));
    att.meter = Math.min(100, att.meter + 2 * mm); def.meter = Math.min(100, def.meter + 5);
    hitVisual(ev); netEmit(ev);
    return;
  }
  // 霸体：普通攻击打不断，只吃 60% 伤害
  const defRating = (def.ch && def.ch.stat && def.ch.stat.defRating) || 1;
  if (def.armorT > 0 && !m.launch && !m.unblockable && !m.hold && !m.root && def.hp - m.dmg * 0.6 > 0) {
    const dmg = (m.dmg * 0.6) / defRating;
    def.hp -= dmg; def.sinceHit = 0; def.lagDelay = 0.5;
    if (--def.armorHits <= 0) def.armorT = 0;
    att.meter = Math.min(100, att.meter + m.dmg * 0.8 * mm); def.meter = Math.min(100, def.meter + m.dmg);
    if (def.ch.passive === 'armor') {
      def.meter = Math.min(100, def.meter + 4);
      def.skillCD = Math.max(0, def.skillCD - 0.4);
      def.skill2CD = Math.max(0, def.skill2CD - 0.4);
      ring(def.x, def.y - 60, 90, '255,200,120', 0.25);
    }
    ev.armor = true; ev.dd = dmg;
    hitVisual(ev); netEmit(ev);
    return;
  }
  if (m.chip) {   // 只掉血：不会硬直、不会飞起
    const chipDmg = m.dmg / defRating;
    def.hp = Math.max(def.dummy ? 1 : 0, def.hp - chipDmg); def.sinceHit = 0; def.lagDelay = 0.5; def.flash = 0.08;
    ev.dd = chipDmg; ev.nc = true; ev.cn = def.comboHits;
    if (def.hp <= 0 && M.phase === 'fight') { def.state = 'launched'; def.vy = -520; def.vx = fx * 400; def.y = Math.min(def.y, -1); M.phase = 'ko'; M.t = 0; M.koWinner = att.idx; ev.ko = true; }
    hitVisual(ev); netEmit(ev); return;
  }
  def.armorT = 0; def.parryT = 0; def.sinceHit = 0;
  if (def.state === 'skill') def.skill = null;
  def.comboHits++;
  const isCounter = !m.isProj && ((def.state === 'attack' && def.move && def.t < (def.move.su || 0.15)) || (def.state === 'skill' && def.t < 0.2));
  const scale = m.noScale ? 1 : Math.max(0.35, 1 - (att.ch.scaling || 0.08) * (def.comboHits - 1));
  let dmg = (m.dmg * scale) / defRating;
  if (isCounter) { ev.counter = true; dmg *= 1.2; ev.big = true; }
  if (att.buffT > 0 && !m.isProj) { dmg *= 1.5; att.buffT = 0; ev.big = true; }
  // 凌霜枪尖机制：最远端枪尖命中增伤且大幅挑空，贴身过近被压制削伤
  if (att.ch.passive === 'tip' && !m.isProj && !m.ult) {
    const dist = Math.abs(def.x - att.x);
    if (dist >= 155) {
      dmg *= 1.25; m.launch = true; ev.big = true;
      ring(pt[0], pt[1], 100, '170,220,255', 0.35);
      addP({ type: 'text', text: '枪尖', x: pt[0], y: pt[1] - 40, life: 0.5, max: 0.5, rgb: '170,220,255' });
    } else if (dist < 72) {
      dmg *= 0.38; m.launch = false;
      addP({ type: 'text', text: '贴身', x: pt[0], y: pt[1] - 30, life: 0.4, max: 0.4, rgb: '160,170,190' });
    }
  }
  def.hp = Math.max(m.hold ? 1 : 0, def.hp - dmg);
  if (def.dummy) def.hp = Math.max(1, def.hp);
  att.hitConfirmed = true;
  att.meter = Math.min(100, att.meter + m.dmg * 1.5 * mm); def.meter = Math.min(100, def.meter + m.dmg * (m.isProj ? 0.4 : 0.9));
  def.move = null;
  if (m.knock && def.hp > 0) { def.state = 'launched'; def.t = 0; def.vx = m.kb[0] * fx * 0.5 * Math.sqrt(massRatio); def.vy = -300; def.y = Math.min(def.y, -1); def.invul = 1.5; def.spiked = false; def.juggle = 0; ev.knock = true; }
  else if (m.root && def.hp > 0) { def.state = 'hitstun'; def.t = 0; def.stun = m.stun; def.vx = 0; def.rooted = true; ev.root = true; }
  else if (m.hold) { def.state = 'held'; }
  else {
    const air = def.y < -2 || def.state === 'launched' || def.state === 'held';
    if (m.launch || air || def.hp <= 0) {
      def.juggle++;
      const js = Math.max(0.45, 1 - 0.1 * (def.juggle - 1));
      def.state = 'launched'; def.t = 0;
      def.vx = m.kb[0] * fx * Math.min(1.4, Math.max(0.7, Math.sqrt(massRatio)));
      const baseVy = m.spike ? m.kb[1] : (m.kb[1] === 0 ? -320 * js : m.kb[1] * js);
      def.vy = baseVy * (m.spike ? 1 : Math.min(1.25, Math.max(0.82, 1 / Math.cbrt(defWeight))));
      def.spiked = !!m.spike; if (!m.spike) def.bounced = def.bounced && air;
      def.y = Math.min(def.y, -1);
    } else {
      const hitStunDur = m.stun * ((def.ch && def.ch.stat && def.ch.stat.poise) || 1) * Math.min(1.22, Math.max(0.85, Math.pow(massRatio, 0.25)));
      def.state = 'hitstun'; def.t = 0; def.stun = hitStunDur; def.vx = m.kb[0] * fx * Math.min(1.4, Math.max(0.7, Math.sqrt(massRatio)));
    }
  }
  if (def.dummy && def.ctrl && def.ctrl.mode === 'fixed' && def.hp > 0) { def.state = 'hitstun'; def.t = 0; def.stun = 0.2; def.vx = 0; def.vy = 0; def.y = 0; def.juggle = 0; def.invul = 0; }
  if (att.y < -2 && att.state === 'attack') att.vy = Math.min(att.vy, -170);
  ev.cn = def.comboHits; ev.dd = dmg;
  if (def.hp <= 0 && M.phase === 'fight') {
    def.vx = fx * 480; def.vy = Math.min(def.vy, -520); def.state = 'launched'; def.y = Math.min(def.y, -1);
    M.phase = 'ko'; M.t = 0; M.koWinner = att.idx;
    ev.ko = true;
  }
  hitVisual(ev); netEmit(ev);
}
// 命中的画面和声音（联机时两边都会播放）
function hitVisual(ev, quiet) {
  const att = [A, B][ev.a], def = [A, B][ev.d];
  if (RESIM) {   // 重算：只保留影响对战的顿帧
    if (ev.guardBreak) hitstop = 0.22;
    else if (ev.blk) hitstop = ev.hs * 0.7;
    else if (ev.armor) hitstop = Math.max(hitstop, ev.hs * 0.6);
    else hitstop = Math.max(hitstop, ev.hs * (att.ch.hitFeel || 1));
    if (ev.ko && !ev.blk && !ev.armor) hitstop = 0.28;   // 击杀的顿帧也会影响对战，重算时不能漏掉
    return;
  }
  if (quiet) {   // 效果已经提前播过了，只更新连击数
    if (!ev.blk && !ev.armor && !ev.nc) { const cu = comboUI[ev.a]; if (cu.t <= 0 || ev.cn === 1) { cu.n = 0; cu.dmg = 0; } cu.n = ev.cn; cu.dmg += ev.dd; cu.t = 1.4; }
    def.lagDelay = 0.5; return;
  }
  if (ev.guardBreak) {
    shake = Math.max(shake, 18); flashA = Math.max(flashA, 0.4); flashRGB = '255,100,80';
    ring(ev.x, ev.y, 160, '255,120,80', 0.45);
    addP({ type: 'text', text: '💥 破防崩势', x: def.x, y: def.y - 110, life: 1.2, max: 1.2, rgb: '255,120,80' });
    SFX.heavy();
    hitstop = Math.max(hitstop, 0.22);
    return;
  }
  if (ev.wb) { ring(ev.x, ev.y, 80, '255,255,255', 0.3); SFX.block(); }
  const fdir = ev.f || att.face;
  if (ev.blk) {
    hitstop = ev.hs * 0.7; shake = Math.max(shake, 3);
    blockFX(ev.x, ev.y, fdir); SFX.block();
    return;
  }
  if (ev.armor) {
    def.flash = 0.06; def.lagDelay = 0.5; hitstop = Math.max(hitstop, ev.hs * 0.6); shake = Math.max(shake, 4);
    ring(ev.x, ev.y, 46, '255,215,120', 0.22); blockFX(ev.x, ev.y, fdir); SFX.block();
    addP({ type: 'text', text: '霸体', x: def.x, y: def.y - 130 * def.size, life: 0.55, max: 0.55, rgb: '255,215,120' });
    return;
  }
  if (ev.counter && !quiet) {
    flashA = Math.max(flashA, 0.38); flashRGB = '255,60,50'; shake = Math.max(shake, 14); hitstop = Math.max(hitstop, 0.18);
    addP({ type: 'callout', text: '破', x: ev.x, y: ev.y - 85, life: 0.75, max: 0.75, rgb: '255,75,55', scale: 2.4 });
    ring(ev.x, ev.y, 65, '255,75,55', 0.28);
  }
  if (!ev.nc) {
    const cu = comboUI[ev.a];
    if (cu.t <= 0 || ev.cn === 1) { cu.n = 0; cu.dmg = 0; }
    cu.n = ev.cn; cu.dmg += ev.dd; cu.t = 1.4;
  }
  def.flash = 0.09; def.lagDelay = 0.5;
  const feel = att.ch.hitFeel || 1;                 // 卡肉感：重武器停顿更久
  hitstop = Math.max(hitstop, ev.hs * feel);
  shake = Math.max(shake, ev.hs * 80 * feel);
  if (ev.dmg >= 8) cam.zoom *= 1 + 0.015 * feel;      // 重击时镜头轻微一顿
  hitFX(ev.x, ev.y, clamp(ev.dmg / 8, 0.5, 1.8), att.look.slash, fdir);
  if (ev.a === localIdx() && ev.cn) MSTAT.maxcombo = Math.max(MSTAT.maxcombo, ev.cn);
  { const atk = [A, B][ev.a], rt = atk && CHAR_RARITY[atk.ch.id];   // 稀有度越高，命中特效越华丽
    if (atk && !ev.blk && !quiet && rt === 'rare') ring(ev.x, ev.y, 46, atk.look.slash, 0.18);
    else if (atk && !ev.blk && !quiet && rt === 'legend') {
      ring(ev.x, ev.y, 72, atk.look.slash, 0.24); ring(ev.x, ev.y, 34, '255,240,200', 0.18);
      for (let i = 0; i < 8; i++) {
        const a = rand(0, 6.28), v = rand(150, 380);
        addP(atk.ch.id === 'moyu' ? { type: 'ink', x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, life: 0.5, max: 0.5, r: rand(2, 4), rgb: '15,15,22' }
          : { type: 'spark', x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4, max: 0.4, rgb: atk.ch.id === 'yuehua' ? '235,228,255' : '222,236,255', w: 1.6, drag: 4 });
      }
    } }
  if (!ev.blk && !quiet && [A, B][ev.a]) skinHitFX([A, B][ev.a], ev);
  if (!quiet && (ev.dd || 0) > 0) {   // 伤害数字：从命中点弹出来往上飘，越重越大
    const dd = Math.round(ev.dd * 10) / 10, big = dd >= 8;
    addP({ type: 'dmg', text: String(dd), x: ev.x + rand(-22, 22), y: ev.y - 20 - ((ev.cn || 0) % 3) * 16, vx: rand(-60, 60), vy: -150, g: 260, life: 0.85, max: 0.85,
      s: ev.blk ? 0.7 : clamp(0.8 + dd / 14, 0.85, 1.6), rgb: ev.blk ? '170,180,200' : big ? '255,210,90' : '255,250,240', edge: [A, B][ev.a] ? [A, B][ev.a].look.slash : '255,255,255' });
  }
  if (M.mode === 'train' && ev.d === 1) { TRAIN.total += ev.dd || 0; TRAIN.hits.push([clock, ev.dd || 0]); }
  if (ev.root) { for (let i = 0; i < 14; i++) addP({ type: 'ink', x: def.x + rand(-30, 30), y: -rand(0, 30), vx: rand(-60, 60), vy: rand(-200, -40), g: 900, life: 0.7, max: 0.7, r: rand(2, 5), rgb: '15,15,22' }); addP({ type: 'text', text: '定', x: def.x, y: def.y - 130, life: 0.8, max: 0.8, rgb: '210,210,230' }); }
  SFX.hit(Math.min(1.2, 0.5 + ev.dmg / 12));
  if (ev.big) { slashLine(ev.x, ev.y, rand(-0.35, 0.35), att.look.slash); flashA = Math.max(flashA, 0.35); flashRGB = att.look.slash; }
  if (ev.ko) {
    slowmo = 1.3; hitstop = 0.28; shake = 26; flashA = 0.7; flashRGB = '255,255,255';
    say('斩', 1.6, 'ko'); SFX.ko();
  }
}
function pushApart() {
  if (B.hidden) return;
  const skip = f => ['dash', 'special', 'launched', 'knockdown', 'held'].includes(f.state) || (f.state === 'skill' && SKILLS[f.skill] && SKILLS[f.skill].pass);
  if (skip(A) || skip(B)) return;
  if (Math.abs(A.y - B.y) > 90) return;
  const dx = B.x - A.x, ov = 38 - Math.abs(dx);
  if (ov > 0) {
    const s = dx === 0 ? (A.face) : Math.sign(dx);
    A.x = clamp(A.x - s * ov / 2, WALL, STAGE_W - WALL);
    B.x = clamp(B.x + s * ov / 2, WALL, STAGE_W - WALL);
    if (Math.abs(B.x - A.x) < 38) { if (A.x <= WALL + 1) B.x = A.x + 38; else if (B.x >= STAGE_W - WALL - 1) A.x = B.x - 38; }
  }
}

// ======================= 姿势动画 =======================
function targetPose(f) {
  const s = f.state;
  let p, k = 16;
  if (s === 'attack') {
    const m = f.move;
    if (f.t < m.su) { p = POSES[m.p[0]]; k = 26; } else if (f.t < m.su + m.ac) { p = POSES[m.p[1]]; k = 62; } else { p = POSES[m.p[1]]; k = 12; }
  } else if (s === 'special') {
    if (f.sp === 'charge') {
      const chargePoses = { qingfeng: 'qf_charge', feiying: 'fy_seal', tieshan: 'ts_lift', lingshuang: 'ls_stance', liuyun: 'ly_fanswipe', leiming: 'lm_boxer', moyu: 'my_stroke', yuehua: 'yh_lotus', yanling: 'yl_wings' };
      p = POSES[chargePoses[f.ch.id] || 'sps']; k = 16;
    } else if (f.ch.ult === 'crescent') {
      const m = { dash: 'qf_thrust', miss: 'l3a', flurry: f.slashN % 2 ? 'l3a' : 'hva', final: 'a2a' };
      p = POSES[m[f.sp] || 'qf_thrust'] || POSES.spa; k = 60;
    } else if (f.ch.ult === 'shadows') {
      const m = { dash: 'fy_crouch', miss: 'l3a', flurry: f.slashN % 2 ? 'fy_xslash' : 'bdash', final: 'fy_xslash' };
      p = POSES[m[f.sp] || 'fy_crouch'] || POSES.spa; k = 60;
    } else {
      p = POSES[f.spPose || 'spa'] || POSES.spa; k = 60;
    }
  } else if (s === 'skill') {
    const pr = SKILLS[f.skill] ? SKILLS[f.skill].pose(f) : ['idle', 14]; p = POSES[pr[0]]; k = pr[1];
  } else if (s === 'dash') { p = POSES[f.dashDir === f.face ? 'dash' : 'bdash']; k = 30; }
  else if (s === 'air') { p = POSES[f.vy < 0 ? 'jump' : 'fall']; k = 14; }
  else if (s === 'block' || s === 'blockstun') { p = POSES.block; k = 30; }
  else if (s === 'hitstun') { p = POSES.hurt; k = 34; }
  else if (s === 'launched' || s === 'held') { p = POSES.hurtAir; k = 22; }
  else if (s === 'knockdown') { p = POSES.lying; k = 16; }
  else if (s === 'getup') { p = POSES.getup; k = 14; }
  else if (s === 'victory') { p = POSES.victory; k = 6; }
  else if (s === 'charge') { p = POSES.charge; k = 18; }
  else p = POSES.idle;
  // 复制一份，再加上呼吸和走路的程序动画
  const out = { sw: p.sw, k };
  for (const j of JOINTS) out[j] = [p[j][0], p[j][1]];
  if (s === 'idle' || s === 'victory') {
    const b = Math.sin(clock * 3.2 + f.idx) * 1.6;
    out.hip[1] += b; out.neck[1] += b * 1.3; out.hf[1] += b; out.hb[1] += b;
    out.sw += Math.sin(clock * 2.1 + f.idx) * 0.04;
  } else if (s === 'walk') {
    const ph = f.walkPh, sn = Math.sin(ph);
    out.ff = [4 + sn * 17, -Math.max(0, Math.cos(ph)) * 11];
    out.fb = [-4 - sn * 17, -Math.max(0, -Math.cos(ph)) * 11];
    const bob = -Math.abs(Math.cos(ph)) * 2.5;
    out.hip[1] += bob; out.neck[1] += bob; out.hf[1] += bob; out.hb[1] += bob;
    const lean = f.vx * f.face > 0 ? 4 : -2;
    out.neck[0] += lean; out.hf[0] += lean * 0.5;
  }
  if (f.flash > 0 && s === 'hitstun') { out.neck[0] -= 4; }
  if (s === 'charge' && f.t >= CHARGE_FULL) { out.hf[0] += rand(-1.2, 1.2); out.hf[1] += rand(-1.2, 1.2); }
  if (s === 'charge' && Math.abs(f.vx) > 8) {   // 蓄力小碎步
    const sn = Math.sin(f.walkPh);
    out.ff = [22 + sn * 9, -Math.max(0, Math.cos(f.walkPh)) * 6];
    out.fb = [-26 - sn * 9, -Math.max(0, -Math.cos(f.walkPh)) * 6];
  }
  return out;
}
function animFighter(f) {
  if (f.state === 'walk' || (f.state === 'skill' && Math.abs(f.vx) > 20)) f.walkPh += STEP * f.vx * f.face * 0.055;
  const tp = targetPose(f);
  const a = f.snap ? 1 : 1 - Math.exp(-tp.k * STEP);
  for (const j of JOINTS) { f.j[j][0] += (tp[j][0] - f.j[j][0]) * a; f.j[j][1] += (tp[j][1] - f.j[j][1]) * a; }
  f.j.sw += (tp.sw - f.j.sw) * a;
  if (f.state === 'skill' && f.skill === 'spin') { f.j.sw = f.t * 26; f.j.hf = [44, -72]; }   // 枪在身前旋转
  if (f.snap && f.state === 'special' && f.sp !== 'final') f.snap = false;
  // 身体旋转（被击飞时翻滚）
  const rotT = f.state === 'launched' ? clamp(f.vy / 1600, -0.7, 0.7) * -1 : 0;
  f.rot += (rotT - f.rot) * (1 - Math.exp(-10 * STEP));
  f.sk = skeleton(f);
  // 剑光拖尾
  const swinging = (f.state === 'attack' && f.t > f.move.su * 0.5 && f.t < f.move.su + f.move.ac + 0.04)
    || (f.state === 'special' && ['dash', 'flurry', 'final', 'thrusts', 'slam', 'sweep', 'rush'].includes(f.sp))
    || (f.state === 'skill' && (f.skPh === 1 || f.skPh === 2) && f.t < 0.2);
  if (swinging) f.trail.push({ b: f.sk.bladeMid, t: f.sk.tip, life: 1 });
  for (const e of f.trail) e.life -= STEP / 0.15;
  while (f.trail.length && f.trail[0].life <= 0) f.trail.shift();
  if (f.trail.length > 24) f.trail.shift();
  // 残影
  f.ghostT -= STEP;
  if ((f.escInvul || f.state === 'dash' || (f.state === 'special' && f.sp !== 'charge' && f.sp !== 'cast' && f.sp !== 'wave') || (f.state === 'skill' && f.skPh === 1 && SKILLS[f.skill].nofric)) && f.ghostT <= 0) { f.ghosts.push({ sk: f.sk, life: 1 }); f.ghostT = 0.022; }
  for (const g of f.ghosts) g.life -= STEP / 0.22;
  while (f.ghosts.length && f.ghosts[0].life <= 0) f.ghosts.shift();
  updateScarf(f);
  if (f.lagDelay > 0) f.lagDelay -= STEP; else f.lagHp = damp(f.lagHp, f.hp, 6, STEP);
}
// 两段骨骼反向运动学：给定起点、终点和两段长度，求中间关节
function ik(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  d = Math.max(d, 0.01);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = Math.atan2(dy, dx) + a * bend;
  return [[ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1], [ax + dx, ay + dy]];
}
function skeleton(f) {
  const j = f.j;
  const hip = j.hip, neck = j.neck;
  const tx = neck[0] - hip[0], ty = neck[1] - hip[1], tl = Math.hypot(tx, ty) || 1;
  const head = [neck[0] + tx / tl * 13, neck[1] + ty / tl * 13];
  const sh = [neck[0] - tx / tl * 5, neck[1] - ty / tl * 5];
  const [ef, hf] = ik(sh[0], sh[1], j.hf[0], j.hf[1], 21, 21, 1);
  const [eb, hb] = ik(sh[0], sh[1], j.hb[0], j.hb[1], 21, 21, 1);
  const [kf, ff] = ik(hip[0], hip[1], j.ff[0], j.ff[1], 26, 27, -1);
  const [kb, fb] = ik(hip[0], hip[1], j.fb[0], j.fb[1], 26, 27, -1);
  const dx = Math.cos(j.sw), dy = Math.sin(j.sw);
  const guard = [hf[0] + dx * 2, hf[1] + dy * 2], hilt = [hf[0] - dx * 9, hf[1] - dy * 9];
  const wl = f.wlen || 54;
  const mid = [hf[0] + dx * wl * 0.37, hf[1] + dy * wl * 0.37], tip = [hf[0] + dx * wl, hf[1] + dy * wl];
  const cr = Math.cos(f.rot), sr = Math.sin(f.rot);
  const T = p => {
    const rx = p[0] - hip[0], ry = p[1] - hip[1];
    const x = hip[0] + rx * cr - ry * sr, y = hip[1] + rx * sr + ry * cr;
    return [f.x + (f.vox || 0) + x * f.face, f.y + (f.voy || 0) + y];
  };
  return { hip: T(hip), neck: T(neck), head: T(head), sh: T(sh), ef: T(ef), hf: T(hf), eb: T(eb), hb: T(hb),
    kf: T(kf), ff: T(ff), kb: T(kb), fb: T(fb), hilt: T(hilt), guard: T(guard), bladeMid: T(mid), tip: T(tip), face: f.face };
}
function updateScarf(f) {
  const sk = f.sk, N = 9, SEG = 7.5;
  const anchor = [sk.neck[0] - f.face * 3, sk.neck[1] + 3];
  if (!f.scarf.length) for (let i = 0; i < N; i++) f.scarf.push({ x: anchor[0] - f.face * i * SEG, y: anchor[1], px: anchor[0] - f.face * i * SEG, py: anchor[1] });
  const wind = Math.sin(clock * 2.3 + f.idx * 2) * 0.05 - 0.04;
  for (let i = 1; i < N; i++) {
    const p = f.scarf[i], vx = (p.x - p.px) * 0.94, vy = (p.y - p.py) * 0.94;
    p.px = p.x; p.py = p.y;
    p.x += vx + wind + Math.sin(clock * 7 + i) * 0.04; p.y += vy + 0.035;
  }
  f.scarf[0].x = anchor[0]; f.scarf[0].y = anchor[1];
  for (let it = 0; it < 3; it++) for (let i = 1; i < N; i++) {
    const a = f.scarf[i - 1], b = f.scarf[i];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = (d - SEG) / d;
    b.x -= dx * k; b.y -= dy * k;
  }
}

// ======================= 特效 =======================
const particles = [];
function addP(p) { if (!RESIM && particles.length < 600) particles.push(p); }
function hitFX(x, y, power, rgb, face) {
  addP({ type: 'flash', x, y, r: 26 * power, life: 0.1, max: 0.1, rgb: '255,255,255' });
  ring(x, y, 46 * power, rgb, 0.22);
  const n = Math.round(10 + 8 * power);
  for (let i = 0; i < n; i++) {
    const a = (face > 0 ? 0 : Math.PI) + rand(-1.1, 1.1) + (Math.random() < 0.25 ? Math.PI : 0), s = rand(350, 1000) * power;
    addP({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.12, 0.3), max: 0.3, rgb: Math.random() < 0.4 ? '255,255,255' : rgb, w: rand(1.5, 3) * power, drag: 6 });
  }
  for (let i = 0; i < 6 * power; i++) {
    const a = rand(-Math.PI, 0), s = rand(80, 300);
    addP({ type: 'ink', x, y, vx: Math.cos(a) * s + face * 120, vy: Math.sin(a) * s, g: 1400, life: rand(0.4, 0.8), max: 0.8, r: rand(2, 4.5), rgb });
  }
}
function blockFX(x, y, face) {
  ring(x, y, 34, '160,200,255', 0.18);
  for (let i = 0; i < 12; i++) {
    const a = (face > 0 ? Math.PI : 0) + rand(-1.3, 1.3), s = rand(250, 700);
    addP({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, g: 900, life: rand(0.15, 0.35), max: 0.35, rgb: Math.random() < 0.5 ? '255,240,200' : '170,210,255', w: 1.6, drag: 3 });
  }
}
function ring(x, y, r, rgb, life) { addP({ type: 'ring', x, y, r, life, max: life, rgb }); }
function dust(x, y, n) {
  for (let i = 0; i < n; i++) addP({ type: 'dust', x: x + rand(-16, 16), y: y - rand(0, 6), vx: rand(-140, 140), vy: rand(-80, -10), life: rand(0.3, 0.6), max: 0.6, r: rand(6, 14), drag: 4 });
}
function slashLine(x, y, ang, rgb) { addP({ type: 'slash', x, y, ang, len: 420, life: 0.28, max: 0.28, rgb }); }
function updateFX(dt) {
  for (const p of particles) {
    p.life -= dt;
    if (p.vx !== undefined) {
      if (p.drag) { p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt); }
      if (p.g) p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'ink' && p.y > 0) { p.y = 0; p.vx *= 0.3; p.vy = 0; p.g = 0; }
    }
  }
  let w = 0;
  for (let r = 0; r < particles.length; r++) {
    if (particles[r].life > 0) particles[w++] = particles[r];
  }
  particles.length = w;
}
// 背景飘落的叶子
const petals = Array.from({ length: 46 }, () => ({ x: rand(0, STAGE_W), y: rand(-700, 0), vx: rand(-40, -10), vy: rand(20, 55), r: rand(0, 6), s: rand(2.5, 4.5), ph: rand(0, 6) }));

// ======================= 主循环 =======================
function step() {
  if (M.mode === 'net' && NET.hold) return;
  if (REC.on && REC.kind === 'loc') REC.f++;
  if (REPLAY.on) REPLAY.f++;
  clock += STEP;
  if (M.mode === 'demo') { updateFX(STEP); return; }   // 主界面：没有对战
  if (hitstop > 0) { hitstop -= STEP; if (!RESIM) updateFX(STEP * 0.3); return; }
  if (superFreeze > 0) {
    superFreeze -= STEP;
    rpPoint(); updateFighter(superOwner, foeOf(superOwner)); rpPost(); if (!RESIM) { animFighter(superOwner); updateFX(STEP); }
    return;
  }
  if (!isClient()) updateMatch(); else M.t += STEP;
  for (const f of [A, B]) if (f.ctrl && f.ctrl.think) f.ctrl.think(f, foeOf(f));
  rpPoint();
  updateFighter(A, B); updateFighter(B, A);
  rpPost();
  pushApart();
  if (!RESIM) { animFighter(A); animFighter(B); }
  updateDecoys();
  updateProjs();
  if (FOREST.on) forestUpdate();
  if (!RESIM) updateFX(STEP);
  if (!RESIM) for (const p of petals) {
    p.x += (p.vx + Math.sin(clock + p.ph) * 20) * STEP; p.y += p.vy * STEP; p.r += STEP * 2;
    if (p.y > 30) { p.y = rand(-800, -500); p.x = rand(cam.x - 900, cam.x + 900); }
  }
  if (!RESIM) for (const c of comboUI) c.t -= STEP;
}
const cam = { x: STAGE_W / 2, y: 0, zoom: 1 };
let acc = 0, last = performance.now(), FPS = 0, fpsN = 0, fpsT = 0;
let lastDraw = 0, bgLast = 0;
// 鼠标朝向：角色面朝鼠标所在的一侧（按住防御时仍然自动面向对手）
// 朝向：面向最后按下的方向键（A 朝左，D 朝右）；设置里关掉就自动面向对手
function updateAim() {
  for (const h of human) if (h && (!SETTINGS.aim || M.mode === 'demo')) h.held.aim = 0;
}
function faceDir(f, foe) {
  const h = f.ctrl && f.ctrl.held, a = h && h.aim;
  const on = a && !h.down && (SETTINGS.aim || !human.includes(f.ctrl));   // 对手的设置由对手那边决定
  if (on) return a;
  const dx = foe.x - f.x;
  return Math.abs(dx) > 3 ? (dx > 0 ? 1 : -1) : f.face;
}
function simTick(real) {
  if (ROLL.on && M.mode === 'net') return rollTick(real);
  if (slowmo > 0) slowmo -= real;
  if (REPLAY.on) return replayTick(real);
  acc += real * (slowmo > 0 ? 0.28 : 1) * cineSpeed();
  if (acc > STEP * 5) acc = STEP * 5;
  let n = 0;
  while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
  if (n >= 5) acc = 0;
}
try {
  const wk = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},8)'], { type: 'text/javascript' })));
  wk.onmessage = () => {
    if (!document.hidden || M.mode !== 'net') { bgLast = 0; return; }
    const now = performance.now(), real = bgLast ? Math.min(0.05, (now - bgLast) / 1000) : 0; bgLast = now;
    if (real > 0 && !paused) { simTick(real); netTick(real); }
  };
} catch (e) {}
// ======================= 青锋行：同一个文件里的第二个游戏（放在独立的 iframe 里运行，两边互不干扰） =======================
const EXT = { on: false, url: '' };
function openQfx() {
  initAudio();
  if (!EXT.url) {
    const bin = atob($id('qfxData').textContent.trim()), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    EXT.url = URL.createObjectURL(new Blob([u8], { type: 'text/html;charset=utf-8' }));
  }
  const fr = $id('extFrame');
  fr.src = EXT.url; $id('extGame').classList.remove('hidden'); EXT.on = true;
  try { if (AC) AC.suspend(); } catch (e) {}
  fr.onload = () => { try { fr.focus(); fr.contentWindow.focus(); } catch (e) {} };
  if (SERVED) setTimeout(() => extToast('守住第三、六、十波，可在刃影领墨锭与专属皮肤「青锋行」', 6), 800);
}
function closeQfx() {
  EXT.on = false; $id('extFrame').src = 'about:blank'; $id('extGame').classList.add('hidden');
  try { if (AC) AC.resume(); } catch (e) {}
}
$id('mQfx').addEventListener('click', openQfx);
$id('extBack').addEventListener('click', closeQfx);

// ======================= 对战回放 =======================
// 对战的逻辑完全由“开场状态 + 每一帧双方的操作”决定，所以只记操作，回放时重新算一遍
const RP_KEY = 'renying-replays', RP_MAX = 10;
const RP_LV = { easy: '入门', normal: '寻常', hard: '劲敌', impossible: '绝顶', adaptive: '宿敌' };
function ctrlKey(c) { return JSON.stringify([inBits(c.held), c.atkT, c.buf]); }
function recBegin(kind) {
  Object.assign(REC, { on: true, bad: false, kind, f: 0, nf: 0, ev: [], post: ['', ''], last: [-1, -1],
    meta: { v: VERSION, kind, mode: M.mode, level: M.level || '', ch: [A.chIdx, B.chIdx], st0: capState(), t: Date.now() } });
}
// 本地对战：在角色读操作之前记下双方控制器的状态（只记变化）
function rpPoint() {
  if (REC.on && REC.kind === 'loc') {
    [A, B].forEach((f, i) => { if (ctrlKey(f.ctrl) !== REC.post[i]) REC.ev.push([REC.f, i, inBits(f.ctrl.held), f.ctrl.atkT, { ...f.ctrl.buf }]); });
  } else if (REPLAY.on && REPLAY.kind === 'loc') {
    const ev = REPLAY.ev;
    while (REPLAY.p < ev.length && ev[REPLAY.p][0] <= REPLAY.f) {
      const e = ev[REPLAY.p++], c = [A, B][e[1]].ctrl, b = e[2];
      c.held.left = !!(b & 1); c.held.right = !!(b & 2); c.held.down = !!(b & 4); c.held.atk = !!(b & 8); c.held.jump = !!(b & 16);
      c.held.aim = (b & 64) ? ((b & 32) ? -1 : 1) : 0; c.atkT = e[3]; c.buf = { ...e[4] };
    }
  }
}
function rpPost() { if (REC.on && REC.kind === 'loc') REC.post = [ctrlKey(A.ctrl), ctrlKey(B.ctrl)]; }
// 联机：只记两边都确认过的帧
function recNet() {
  if (!REC.on || REC.kind !== 'net') return;
  const R = ROLL, me = localIdx(), upto = Math.min(R.F, R.remLast + 1);
  while (REC.nf < upto) {
    const f = REC.nf++, li = R.loc[f] || EMPTY_IN, ri = R.rem[f] || EMPTY_IN, ins = me === 0 ? [li, ri] : [ri, li];
    ins.forEach((x, i) => { if (x.h !== REC.last[i] || x.p.length) { REC.ev.push([f, i, x.h, ...x.p]); REC.last[i] = x.h; } });
  }
}
function rpList() { try { const l = JSON.parse(localStorage.getItem(RP_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function rpStore(list) {
  for (;;) {
    try { localStorage.setItem(RP_KEY, JSON.stringify(list)); return; }
    catch (e) { if (list.length <= 1) return; list.pop(); }
  }
}
function recSave(w) {
  REC.on = false;
  if (M.stage || FOREST.on || REC.bad || !REC.meta) return;
  const m = REC.meta;
  Object.assign(m, { w, wins: [...M.wins], frames: REC.kind === 'net' ? REC.nf : REC.f, ev: REC.ev, skins: [A.skinKey || '', B.skinKey || ''],
    names: M.mode === 'net' ? [(NET.names || {}).host || '游客', (NET.names || {}).client || '游客'] : M.mode === 'cpu' ? [ACC.name || '你', '电脑'] : ['1P', '2P'] });
  RP.last = m;
  const list = rpList(); list.unshift(m); while (list.length > RP_MAX) list.pop();
  rpStore(list);
}
function rpTitle(m) {
  const nm = i => (CHARS[m.ch[i]] || {}).name || '?';
  return `${nm(0)} 对 ${nm(1)}`;
}
function rpSub(m) {
  const d = new Date(m.t), pad = x => String(x).padStart(2, '0');
  const mode = m.mode === 'net' ? '联机' : m.mode === 'cpu' ? `电脑·${RP_LV[m.level] || m.level}` : '本地双人';
  const win = m.w >= 0 ? `${(CHARS[m.ch[m.w]] || {}).name || ''} 胜` : '平局';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())} · ${mode} · ${(m.names || []).join(' 对 ')} · ${win} ${m.wins ? m.wins.join(':') : ''}${m.v !== VERSION ? ' · 旧版本录的，可能对不上' : ''}`;
}
function renderReplays() {
  const list = rpList();
  $id('rpList').innerHTML = list.length ? list.map((m, i) => `<div class="rprow"><div class="rpm"><div class="rpt">${escapeHTML(rpTitle(m))}</div><div class="rps">${escapeHTML(rpSub(m))}</div></div><div style="display:flex;gap:6px;"><button class="go" data-rp="${i}">播放</button><button class="ghost" data-rpexp="${i}">导出</button><button class="ghost" data-rpdel="${i}">删除</button></div></div>`).join('')
    : '<p class="netnote">还没有回放。打完一场人机或联机对战，这里会自动保存。</p>';
}
$id('rpList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const list = rpList();
  if (b.dataset.rp !== undefined) { const m = list[+b.dataset.rp]; if (m) startReplay(m); }
  else if (b.dataset.rpdel !== undefined) { list.splice(+b.dataset.rpdel, 1); rpStore(list); renderReplays(); }
  else if (b.dataset.rpexp !== undefined) {
    const m = list[+b.dataset.rpexp];
    if (!m) return;
    const blob = new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RenYing-Replay-${m.t || Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('录像已导出');
  }
});
if ($id('rpImportBtn')) {
  $id('rpImportBtn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const m = JSON.parse(evt.target.result);
          if (!m || !m.ev || !m.st0 || !Array.isArray(m.ch)) {
            throw new Error('录像文件格式不正确');
          }
          const list = rpList();
          list.unshift(m);
          while (list.length > RP_MAX) list.pop();
          rpStore(list);
          renderReplays();
          toast('录像导入成功');
        } catch (err) {
          toast(err.message || '录像解析失败');
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  });
}
function startReplay(m) {
  if (!m || !m.ev || !m.st0) return;
  if (FOREST.on) { FOREST.on = false; FOREST.mons = []; FOREST.shots = []; B.forestProxy = false; B.hidden = false; }
  ROLL.on = false; REC.on = false; paused = false; BP = null; B.dummy = false; M.stage = null;
  setChars(m.ch[0], m.ch[1]);
  A.ctrl = new Ctrl(); B.ctrl = new Ctrl();
  restState(m.st0);
  M.mode = 'replay';
  Object.assign(REPLAY, { on: true, m, kind: m.kind, ev: m.ev, p: 0, f: 0, nf: 0, lh: [0, 0], paused: false, speed: 1, names: m.names || null });
  acc = 0; creditT = 0; particles.length = 0;
  showScreen(null);
  startRound();
  [A, B].forEach((f, i) => { const k = (m.skins || [])[i] || ''; f.look = skinLook(f.chIdx, k); f.skinKey = k; });
  pickScene();
  $id('rpPause').textContent = '暂停';
  for (const x of document.querySelectorAll('#rpBar [data-sp]')) x.classList.toggle('sel', x.dataset.sp === '1');
  $id('rpBar').classList.remove('hidden');
  rpInfo();
}
function rpInfo() { if (REPLAY.on) $id('rpInfo').textContent = `回放 · 第${CN[M.round] || M.round}回合${REPLAY.paused ? ' · 已暂停' : ''}`; }
function replayFrame() {
  if (REPLAY.kind === 'net') {
    const ev = REPLAY.ev, cur = [{ h: REPLAY.lh[0], p: [] }, { h: REPLAY.lh[1], p: [] }];
    while (REPLAY.p < ev.length && ev[REPLAY.p][0] <= REPLAY.nf) { const e = ev[REPLAY.p++]; cur[e[1]] = { h: e[2], p: e.slice(3) }; REPLAY.lh[e[1]] = e[2]; }
    applyInput(A.ctrl, cur[0]); applyInput(B.ctrl, cur[1]);
    REPLAY.nf++;
  }
  step();
}
function replayTick(real) {
  if (REPLAY.paused || M.phase === 'end') return;
  acc += real * (slowmo > 0 ? 0.28 : 1) * cineSpeed() * REPLAY.speed;
  let n = 0;
  while (acc >= STEP && n < 48) { replayFrame(); acc -= STEP; n++; if (M.phase === 'end' || !REPLAY.on) break; }
  if (n >= 48) acc = 0;
  rpInfo();
}
function replayEnd(w) {
  $id('rpBar').classList.add('hidden');
  const t = $id('endTitle'), wf = [A, B][w];
  if (wf) { t.textContent = `${wf.look.name} 胜`; t.style.color = `rgb(${wf.look.slash})`; } else { t.textContent = '平局'; t.style.color = ''; }
  $id('endSub').textContent = `回放结束，比分 ${M.wins[0]} : ${M.wins[1]}`;
  $id('endRank').textContent = '';
  $id('againBtn').style.display = 'none';
  $id('rpWatch').style.display = ''; $id('rpWatch').textContent = '再看一遍';
  RP.last = REPLAY.m;
  setTimeout(() => showScreen('end'), 300);
}
$id('rpWatch').addEventListener('click', () => { if (RP.last) startReplay(RP.last); });
$id('rpPause').addEventListener('click', () => { REPLAY.paused = !REPLAY.paused; $id('rpPause').textContent = REPLAY.paused ? '继续' : '暂停'; rpInfo(); });
$id('rpExit').addEventListener('click', toMenu);
for (const b of document.querySelectorAll('#rpBar [data-sp]')) b.addEventListener('click', () => {
  REPLAY.speed = +b.dataset.sp;
  for (const x of document.querySelectorAll('#rpBar [data-sp]')) x.classList.toggle('sel', x === b);
});
window.addEventListener('keydown', e => { if (REPLAY.on && e.code === 'Space' && M.phase !== 'end') { e.preventDefault(); e.stopImmediatePropagation(); $id('rpPause').click(); } }, true);

// ======================= 青锋行打通：守住波次，在刃影领奖励 =======================
const QFX_REW = [[3, 200, ''], [6, 300, ''], [10, 500, 'qf_qfx']];
const QFX = { busy: false };
function qfxBest() { try { return +localStorage.getItem('renying-qfx') || 0; } catch (e) { return 0; } }
function extToast(msg, dur = 4.5) {
  const el = $id('extToast'); if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(extToast.t); extToast.t = setTimeout(() => el.classList.remove('on'), dur * 1000);
}
function qfxNotify(msg) { if (EXT.on) extToast(msg); else toast(msg); }
async function qfxClaim(n) {
  if (!SERVED || !ACC.token || PROF.guest || QFX.busy || (PROF.qfx || 0) >= n) return;
  if (!QFX_REW.some(r => r[0] > (PROF.qfx || 0) && r[0] <= n)) return;
  QFX.busy = true;
  try {
    const j = await api('/api/qfx', { wave: n }); applyProfile(j.profile);
    const parts = []; if (j.ink) parts.push(`${j.ink} 墨锭`); if (j.skin && SKINS[j.skin]) parts.push(`专属皮肤「${SKINS[j.skin].name}」`);
    if (parts.length) { qfxNotify(`青锋行奖励到账：${parts.join('，')}`); try { SFX.chargeFull(); } catch (e) {} }
  } catch (e) {}
  QFX.busy = false;
}
function qfxCleared(n) {
  if (n > qfxBest()) try { localStorage.setItem('renying-qfx', String(n)); } catch (e) {}
  const r = QFX_REW.find(x => x[0] === n);
  if (!SERVED) { if (r) extToast(`守住第${CN[n] || n}波！`); return; }
  if (!ACC.token || PROF.guest) { if (r) extToast('守住了！登录刃影后就能领这一档的奖励'); return; }
  qfxClaim(Math.max(n, qfxBest()));
}
window.addEventListener('message', e => {
  const fr = $id('extFrame'); if (!fr || e.source !== fr.contentWindow) return;
  const d = e.data; if (d && d.qfx === 'wave') qfxCleared(d.n | 0);
});
// 主循环：无论这一帧里哪里出错，都保证下一帧照常运行（不会让游戏“卡死”）
function frame(now) {
  if (EXT.on) { last = now; requestAnimationFrame(frame); return; }   // 正在玩青锋行：刃影这边不画也不算
  try { frameBody(now); }
  catch (e) { frame.errs = (frame.errs || 0) + 1; if (frame.errs <= 3) console.error('刃影：这一帧出错了，已跳过', e); }
  requestAnimationFrame(frame);
}
function frameBody(now) {
  const targetFps = [144, 120, 60, 30].includes(SETTINGS.fps) ? SETTINGS.fps : 144;
  const targetInterval = 1000 / targetFps;
  const elapsed = now - lastDraw;
  if (elapsed < targetInterval - 3) return;
  lastDraw = now - (elapsed % targetInterval);
  const real = Math.min(0.04, (now - last) / 1000); last = now; menuDt = real;
  fpsN++; fpsT += real; if (fpsT >= 0.5) { FPS = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  if (NET.awayUntil) { const left = Math.max(0, Math.ceil((NET.awayUntil - now) / 1000)); netOverlay(left > 0 ? `对手掉线了，等待重连 ${left} 秒…` : '对手没有回来'); }
  if (!paused) {
    if (slowmo > 0) slowmo -= real;
    for (const f of [A, B]) if (f.state === 'special' && f.sp === 'charge' && f.t < 0.06 && cine.t < 0) { cine.t = 0; cine.owner = f; if (f.idx === localIdx()) MSTAT.ults++; if (AC && MUSIC.gain) { drum(AC.currentTime, 'taiko', 0.8); flute(noteF(12), AC.currentTime + 0.05, 1.1, 0.1); } }
    if (cine.t >= 0) { cine.t += real; if (cine.t > CINE_LEN) { cine.t = -1; cine.owner = null; } }
    updateFireflies(real); updateAim();
    if (TUT && M.mode === 'train' && !paused) tutTick(real);
    for (const f of [A, B]) { if (f.vox) f.vox = damp(f.vox, 0, 14, real); if (f.voy) f.voy = damp(f.voy, 0, 14, real); }
    if (ROLL.on && M.mode === 'net') rollTick(real);
    else if (REPLAY.on) replayTick(real);
    else {
      acc += real * (slowmo > 0 ? 0.28 : 1) * cineSpeed();
      if (acc > STEP * 5) acc = STEP * 5;
      let n = 0;
      while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
      if (n >= 5) acc = 0;
    }
    shake = damp(shake, 0, 10, real);
    flashA = damp(flashA, 0, 8, real);
    dimA = damp(dimA, (superFreeze > 0 || (A.state === 'special' || B.state === 'special')) ? 1 : 0, 10, real);
    if (announce) announce.t += real;
    if (creditT > 0) {
      creditT -= real;
      if (creditT <= 0 && creditPending) { creditPending = false; say(`第${CN[M.round] || M.round}回合`, 1.1); SFX.gong(); }
    }
    updateCamera(real);
  }
  bpTick(real);
  musicSet(musicMode());
  netTick(real);
  render();
  touchUIUpdate();
}
function updateCamera(dt) {
  if (FOREST.on) {   // 闯关打妖物：镜头只跟着你，妖物离得近才一起框进来
    const near = FOREST.mons.filter(m => Math.abs(m.x - A.x) < 650);
    const xs = [A.x, ...near.map(m => m.x)], lo = Math.min(...xs), hi = Math.max(...xs);
    const fx = clamp((lo + hi) / 2, A.x - 260, A.x + 260);
    cam.x = damp(cam.x, fx, 6, dt); cam.zoom = damp(cam.zoom, clamp(1.15 - (hi - lo) / 1400, 0.72, 1.1), 3, dt);
    cam.y = damp(cam.y, Math.min(0, A.y * 0.4), 6, dt);
    return;
  }
  const mid = (A.x + B.x) / 2, d = Math.abs(A.x - B.x), base = H / 560;
  // 能装下两个人的最大缩放：左右各留一些边，上方给跳跃和击飞留空间
  const fitW = W / ((d + 340) * base);
  const top = -Math.min(A.y, B.y) + 170;
  const fitH = (H * 0.74) / (Math.max(250, top) * base);
  const fit = Math.max(0.3, Math.min(fitW, fitH));
  let focus = mid, zoomMul = superFreeze > 0 ? 1.1 : 1;
  const lf = [A, B][localIdx()];
  if (lf && lf.state === 'charge' && M.mode !== 'demo') {                 // 蓄力：镜头慢慢推向自己
    const lv = clamp(lf.t / CHARGE_FULL, 0, 1); zoomMul *= 1 + 0.24 * lv; focus = lerp(mid, lf.x, 0.4 * lv);
  }
  const ce = cineEnv();
  if (ce > 0 && cine.owner) { zoomMul *= 1 + 0.4 * ce; focus = lerp(focus, cine.owner.x, 0.6 * ce); }   // 大招：推近
  const want = Math.min(clamp(1.42 - d / 1000, 0.6, 1.35) * zoomMul, fit);
  cam.zoom = damp(cam.zoom, want, want < cam.zoom ? 12 : (ce > 0 ? 9 : 3), dt);
  cam.zoom = Math.min(cam.zoom, fit);
  cam.y = damp(cam.y, Math.min(0, Math.min(A.y, B.y) * 0.35), 4, dt);
  cam.x = damp(cam.x, focus, 8, dt);
  const vw = W / worldScale();
  cam.x = vw >= STAGE_W + 200 ? STAGE_W / 2 : clamp(cam.x, vw / 2 - 100, STAGE_W + 100 - vw / 2);
  // 最后保证两个人都在画面里
  const lo = Math.max(A.x, B.x) - vw / 2 + 60, hi = Math.min(A.x, B.x) + vw / 2 - 60;
  if (lo <= hi) cam.x = clamp(cam.x, lo, hi); else cam.x = mid;
}
const worldScale = () => (H / 560) * cam.zoom;

// ======================= 绘制：背景 =======================
function drawBackground(sc) {
  const T = SCN, sky = T ? T.sky : ['#070918', '#1a1840', '#3a2552', '#2a1a3a'];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sky[0]); g.addColorStop(0.5, sky[1]); g.addColorStop(0.78, sky[2]); g.addColorStop(1, sky[3]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 雷雨天：偶尔闪一下
  if (T && T.storm) { const k = Math.floor(clock * 0.4), ph = clock * 0.4 - k; if (hash(k) < 0.45 && ph < 0.12) { ctx.fillStyle = `rgba(200,170,255,${0.22 * (1 - ph / 0.12)})`; ctx.fillRect(0, 0, W, H); } }
  // 星星
  ctx.fillStyle = '#fff';
  for (let i = 0, ns = 90 * (T && T.stars !== undefined ? T.stars : 1); i < ns; i++) {
    const x = ((hash(i) * W * 1.4 - cam.x * 0.02 * sc) % W + W) % W, y = hash(i + 50) * H * 0.5;
    ctx.globalAlpha = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(clock * (1 + hash(i + 9) * 2) + i));
    ctx.fillRect(x, y, 1.3, 1.3);
  }
  ctx.globalAlpha = 1;
  // 月亮
  const mx = W * 0.68 - (cam.x - STAGE_W / 2) * 0.04 * sc, my = H * 0.26, mr = H * 0.11;
  drawOrb(T, mx, my, mr, clock);
  if (T && T.legend && T.rays) drawRays(T, mx, my);
  // 远山
  const gy = groundY(), mt = (T && T.mtn) || SCN_DEF.mtn, bm = (T && T.bam) || SCN_DEF.bam, mc = T ? T.mist : SCN_DEF.mist;
  mountains(0.08, gy - H * 0.2, H * 0.16, mt[0], 1.3, sc);
  mountains(0.18, gy - H * 0.1, H * 0.12, mt[1], 4.7, sc);
  const mist = ctx.createLinearGradient(0, gy - H * 0.25, 0, gy);
  mist.addColorStop(0, `rgba(${mc},0)`); mist.addColorStop(1, `rgba(${mc},${T && T.legend ? 0.26 : 0.16})`);
  ctx.fillStyle = mist; ctx.fillRect(0, gy - H * 0.25, W, H * 0.25);
  // 竹林
  bamboo(0.5, sc, gy, bm[0], 150, 0.75);
  bamboo(0.75, sc, gy, bm[1], 210, 0.9);
  if (T && T.legend) {   // 传说场景：地平线上一层主题色的光
    const gl = ctx.createLinearGradient(0, gy - H * 0.12, 0, gy + 4);
    gl.addColorStop(0, `rgba(${T.orbC},0)`); gl.addColorStop(1, `rgba(${T.orbC},0.2)`);
    ctx.fillStyle = gl; ctx.fillRect(0, gy - H * 0.12, W, H * 0.12 + 4);
  }
}
const groundY = () => H * 0.8 + (-cam.y) * worldScale();
function mountains(par, base, amp, color, seed, sc) {
  const off = (cam.x - STAGE_W / 2) * par * sc;
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W + 10; x += 10) {
    const u = (x + off) / H;
    const y = base - amp * (0.55 * Math.sin(u * 2.3 + seed) + 0.3 * Math.sin(u * 5.1 + seed * 2) + 0.15 * Math.sin(u * 11 + seed * 3));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}
function bamboo(par, sc, gy, color, spacing, scale) {
  const s = sc * scale, cx = cam.x * par;
  const k0 = Math.floor((cx - W / 2 / s) / spacing) - 1, k1 = Math.ceil((cx + W / 2 / s) / spacing) + 1;
  ctx.fillStyle = color; ctx.strokeStyle = color;
  for (let k = k0; k <= k1; k++) {
    if (hash(k * 3.1 + par) < 0.3) continue;
    const lx = k * spacing + hash(k + par * 10) * spacing * 0.6;
    const x = W / 2 + (lx - cx) * s, w = (7 + hash(k + 5) * 5) * s;
    const sway = Math.sin(clock * 0.8 + k) * 8 * s;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, gy); ctx.lineTo(x + w / 2, gy);
    ctx.lineTo(x + w / 2 + sway, -20); ctx.lineTo(x - w / 2 + sway, -20); ctx.closePath(); ctx.fill();
    for (let n = 1; n < 9; n++) {
      const yy = gy - n * 80 * s; if (yy < 0) break;
      const sx = x + sway * (1 - yy / gy);
      ctx.fillRect(sx - w * 0.7, yy, w * 1.4, 2 * s);
      if (hash(k * 7 + n) > 0.62) {
        const dir = hash(k + n * 3) > 0.5 ? 1 : -1;
        for (let l = 0; l < 3; l++) {
          ctx.save(); ctx.translate(sx, yy); ctx.rotate(dir * (0.5 + l * 0.35) + Math.sin(clock * 1.3 + k + l) * 0.08);
          ctx.beginPath(); ctx.ellipse(dir * 22 * s, 0, 22 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
    }
  }
}
function drawGround() {
  // 世界坐标里画地面、柱子、灯笼
  const g = ctx.createLinearGradient(0, 0, 0, 260);
  g.addColorStop(0, '#221c38'); g.addColorStop(1, '#0a0816');
  ctx.fillStyle = g; ctx.fillRect(-3000, 0, STAGE_W + 6000, 800);
  ctx.strokeStyle = 'rgba(200,180,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3000, 0); ctx.lineTo(STAGE_W + 3000, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,180,255,0.07)'; ctx.lineWidth = 1;
  for (const y of [22, 58, 110]) { ctx.beginPath(); ctx.moveTo(-3000, y); ctx.lineTo(STAGE_W + 3000, y); ctx.stroke(); }
  for (let x = -600; x < STAGE_W + 600; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (x - cam.x) * 0.25, 22); ctx.stroke(); }
  // 月光倒影
  const rg = ctx.createRadialGradient(cam.x + 200, 40, 10, cam.x + 200, 40, 400);
  rg.addColorStop(0, 'rgba(255,236,210,0.1)'); rg.addColorStop(1, 'rgba(255,236,210,0)');
  ctx.fillStyle = rg; ctx.fillRect(cam.x - 400, 0, 1200, 200);
  // 两侧朱红柱子（场地边界）
  for (const px of [WALL - 40, STAGE_W - WALL + 40]) {
    ctx.fillStyle = '#3a121c'; ctx.fillRect(px - 16, -900, 32, 900);
    ctx.fillStyle = 'rgba(255,120,120,0.12)'; ctx.fillRect(px - 16, -900, 6, 900);
    ctx.fillStyle = '#1e0a10'; ctx.fillRect(px - 22, -10, 44, 10);
  }
  // 石灯笼
  for (const lx of [260, STAGE_W / 2, STAGE_W - 260]) lantern(lx, -2);
}
function lantern(x, y) {
  const flick = 0.85 + Math.sin(clock * 9 + x) * 0.08 + Math.sin(clock * 23 + x) * 0.05;
  const rg = ctx.createRadialGradient(x, y - 70, 2, x, y - 70, 110);
  rg.addColorStop(0, `rgba(255,170,90,${0.35 * flick})`); rg.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = rg; ctx.fillRect(x - 110, y - 180, 220, 220);
  ctx.fillStyle = '#16121f';
  ctx.fillRect(x - 5, y - 50, 10, 50); ctx.fillRect(x - 16, y - 8, 32, 8);
  ctx.fillRect(x - 14, y - 58, 28, 8);
  ctx.beginPath(); ctx.moveTo(x - 22, y - 84); ctx.lineTo(x + 22, y - 84); ctx.lineTo(x, y - 104); ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(255,190,110,${flick})`; ctx.fillRect(x - 9, y - 80, 18, 20);
  ctx.fillStyle = '#16121f'; ctx.fillRect(x - 1, y - 80, 2, 20);
}

// ======================= 绘制：角色 =======================
function drawTrainDummy(f) {
  const lying = f.state === 'knockdown' || f.state === 'getup' && f.t < 0.15;
  const wob = Math.sin(clock * 18) * Math.min(0.25, f.flash * 3) + (f.state === 'hitstun' ? Math.sin(f.t * 30) * 0.08 * Math.max(0, 1 - f.t * 3) : 0);
  const tilt = lying ? 1.4 : f.state === 'launched' ? clamp(-f.vy / 1500, -0.8, 0.8) + f.t * 4 : wob;
  const x = f.x + (f.vox || 0), y = f.y + (f.voy || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(f.x, 2, 34, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (f.escInvul) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(233,196,106,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 60, 36, 62, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.translate(x, y - 60); ctx.rotate(tilt); ctx.translate(0, 60);
  if (f.onGround() && !lying && f.state !== 'launched') { ctx.fillStyle = '#3a2718'; ctx.fillRect(-26, -6, 52, 6); }
  ctx.fillStyle = '#4a3322'; ctx.fillRect(-4, -126, 8, 122); ctx.fillRect(-40, -96, 80, 7);
  const straw = f.flash > 0 ? '#fff4d8' : '#b08a5a';
  ctx.fillStyle = straw; ctx.beginPath(); ctx.ellipse(0, -80, 23, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,55,30,0.55)'; ctx.lineWidth = 1; for (let i = -16; i <= 16; i += 5) { ctx.beginPath(); ctx.moveTo(i, -110); ctx.lineTo(i * 0.8, -48); ctx.stroke(); }
  ctx.fillStyle = straw; ctx.beginPath(); ctx.arc(0, -126, 15, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 2.5; for (const yy of [-92, -66]) { ctx.beginPath(); ctx.moveTo(-21, yy); ctx.lineTo(21, yy); ctx.stroke(); }
  ctx.fillStyle = '#f1e2c0'; ctx.fillRect(-5, -88, 10, 18); ctx.fillStyle = '#b8392e'; ctx.fillRect(-2, -85, 4, 12);
  ctx.strokeStyle = 'rgba(60,40,25,0.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-5, -130); ctx.lineTo(5, -122); ctx.moveTo(5, -130); ctx.lineTo(-5, -122); ctx.stroke();
  if (f.state === 'block' || f.state === 'blockstun') { ctx.strokeStyle = 'rgba(170,210,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-f.face * -26, -80, 30, -1.1, 1.1); ctx.stroke(); }
  ctx.restore();
}
function drawFighter(f) {
  if (f.hidden) return;
  if (f.dummy) return drawTrainDummy(f);
  const rt = CHAR_RARITY[f.ch.id];
  if (rt === 'legend' && Math.random() < 0.2) {   // 传说角色：专属粒子
    const k = f.ch.id, x = f.x + rand(-30, 30), y = f.y - rand(20, 115);
    addP(k === 'moyu' ? { type: 'ink', x, y, vx: rand(-15, 15), vy: -rand(15, 45), g: -30, life: 0.8, max: 0.8, r: rand(1.5, 3), rgb: '15,15,22' }
      : { type: 'spark', x, y, vx: rand(-15, 15), vy: k === 'yanling' ? rand(10, 40) : -rand(20, 60), life: 0.7, max: 0.7, rgb: k === 'yanling' ? '225,238,255' : '235,228,255', w: k === 'yanling' ? 2 : 1.2 });
  } else if (rt === 'rare' && Math.random() < 0.06) addP({ type: 'spark', x: f.x + rand(-24, 24), y: f.y - rand(20, 110), vx: 0, vy: -rand(20, 50), life: 0.5, max: 0.5, rgb: f.look.slash, w: 1 });
  if (f.look.deco) skinParticles(f);
  if (!f.look.deco && f.look.legend && Math.random() < 0.35) addP({ type: 'spark', x: f.x + rand(-26, 26), y: f.y - rand(10, 120), vx: rand(-10, 10), vy: -rand(30, 90), life: 0.6, max: 0.6, rgb: f.look.slash, w: 1.2 });
  if (f.meter >= 100 && f.hp > 0 && Math.random() < 0.22) {
    addP({ type: 'spark', x: f.x + rand(-22, 22), y: f.y - rand(8, 55), vx: rand(-10, 10), vy: -rand(35, 95), life: 0.42, max: 0.42, rgb: f.look.slash, w: 1.4 });
  }
  const sk = f.sk; if (!sk) return;
  const L = f.look, sc = worldScale();
  // 影子
  const hgt = clamp(-f.y / 300, 0, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - hgt * 0.6)})`;
  ctx.beginPath(); ctx.ellipse(f.x, 2, 34 * (1 - hgt * 0.4), 6, 0, 0, Math.PI * 2); ctx.fill();
  // 蓄力光环
  if (f.state === 'charge') {
    const lv = clamp(f.t / CHARGE_FULL, 0, 1), full = f.t >= CHARGE_FULL;
    const r = 40 + lv * 55 + (full ? Math.sin(clock * 30) * 6 : 0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(f.x, f.y - 50, 4, f.x, f.y - 50, r * 1.4);
    g.addColorStop(0, `rgba(${L.slash},${0.18 + 0.3 * lv})`); g.addColorStop(1, `rgba(${L.slash},0)`);
    ctx.fillStyle = g; ctx.fillRect(f.x - r * 1.5, f.y - 50 - r * 1.5, r * 3, r * 3);
    ctx.strokeStyle = `rgba(${L.slash},${0.3 + 0.5 * lv})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(f.x, 1, 28 + lv * 34, 5 + lv * 4, 0, 0, Math.PI * 2); ctx.stroke();
    if (full) { const tg = ctx.createRadialGradient(sk.tip[0], sk.tip[1], 0, sk.tip[0], sk.tip[1], 26); tg.addColorStop(0, 'rgba(255,255,255,0.9)'); tg.addColorStop(1, `rgba(${L.slash},0)`); ctx.fillStyle = tg; ctx.fillRect(sk.tip[0] - 26, sk.tip[1] - 26, 52, 52); }
    ctx.restore();
  }
  // 腾空闪无敌时的光圈
  if (f.escInvul) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${f.look.slash},${0.4 + 0.3 * Math.sin(clock * 30)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y - 55, 34, 60, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  // 残影
  const big = f.size !== 1;
  if (big) { ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.size, f.size); ctx.translate(-f.x, -f.y); }
  for (const g of f.ghosts) drawBody(g.sk, f, { ghost: g.life * 0.4 });
  // 霸体金光 / 影遁增益 / 月镜
  if (f.armorT > 0 || f.buffT > 0 || f.parryT > 0) {
    const rgb = f.armorT > 0 ? '255,210,120' : f.parryT > 0 ? '235,225,255' : '190,80,255';
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(f.x, f.y - 55, 5, f.x, f.y - 55, 80);
    g.addColorStop(0, `rgba(${rgb},${0.28 + 0.1 * Math.sin(clock * 20)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(f.x - 90, f.y - 145, 180, 180); ctx.restore();
    if (f.parryT > 0) { ctx.strokeStyle = 'rgba(245,240,255,0.8)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(f.x + f.face * 22, f.y - 70, 38, -1.2, 1.2); ctx.stroke(); }
  }
  // 定身墨迹
  if (f.rooted && f.state === 'hitstun') { ctx.fillStyle = 'rgba(10,10,16,0.75)'; ctx.beginPath(); ctx.ellipse(f.x, 0, 36, 8, 0, 0, Math.PI * 2); ctx.fill(); }
  // 围巾
  if (f.ch && f.ch.fly) drawWings(sk, f);
  drawScarf(f);
  drawBody(sk, f, { flash: f.flash > 0, invul: f.invul > 0 && f.invul < 50 && f.state !== 'special' && f.state !== 'knockdown' });
  if (big) ctx.restore();
  // 剑光
  drawTrail(f);
  // 被连击且可以挣脱时，头顶提示
  if ((f.state === 'launched' || f.state === 'knockdown' || (f.state === 'hitstun' && f.comboHits >= 2)) && f.hp > 0 && f.breakCD <= 0 && M.phase === 'fight' && M.mode !== 'demo'
      && !(f.ctrl instanceof AICtrl) && !f.dummy && f.ctrl !== NET.remote) {
    ctx.save(); ctx.font = `22px ${TITLE_FONT}`; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.45 * Math.sin(clock * 14)})`;
    ctx.fillText('腾空闪', sk.head[0], sk.head[1] - 28); ctx.restore();
  }
}
function drawDecoys() {
  for (const d of decoys) {
    const sk = d.sk; if (!sk) continue;
    const a = clamp(d.life / 0.3, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(d.x, d.y - 40); ctx.rotate(d.rot); ctx.translate(-d.x0, -d.y0 + 40);
    const segs = [[sk.hip, sk.kb, 7], [sk.kb, sk.fb, 6.5], [sk.sh, sk.eb, 6], [sk.eb, sk.hb, 5.5], [sk.hip, sk.neck, 11], [sk.hip, sk.kf, 7], [sk.kf, sk.ff, 6.5], [sk.sh, sk.ef, 6], [sk.ef, sk.hf, 5.5]];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2e2014'; ctx.fillStyle = '#2e2014';
    for (const s of segs) { ctx.lineWidth = s[2] + 4; line(s[0], s[1]); }
    circle(sk.head, 12);
    ctx.strokeStyle = '#b08a5a'; ctx.fillStyle = '#b08a5a';
    for (const s of segs) { ctx.lineWidth = s[2]; line(s[0], s[1]); }
    circle(sk.head, 10);
    // 绑绳和符纸
    ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 1.5;
    const mx = (sk.hip[0] + sk.neck[0]) / 2, my = (sk.hip[1] + sk.neck[1]) / 2;
    line([mx - 6, my - 6], [mx + 6, my - 6]); line([mx - 6, my + 6], [mx + 6, my + 6]);
    ctx.fillStyle = '#f1e2c0'; ctx.fillRect(mx - 4, my - 9, 8, 16);
    ctx.fillStyle = '#b8392e'; ctx.fillRect(mx - 1.5, my - 6, 3, 10);
    ctx.strokeStyle = '#2e2014'; ctx.lineWidth = 1.6;
    line([sk.head[0] - 4, sk.head[1] - 3], [sk.head[0] + 4, sk.head[1] + 3]); line([sk.head[0] + 4, sk.head[1] - 3], [sk.head[0] - 4, sk.head[1] + 3]);
    ctx.restore();
  }
}
// ======================= 皮肤造型：头饰、背饰、披风、武器特效 =======================
function drawDeco(sk, f, L, layer) {
  const D = L.deco; if (!D) return;
  const t = typeof clock === 'number' ? clock : 0;
  const hx = sk.head[0], hy = sk.head[1], nx = sk.neck[0], ny = sk.neck[1];
  let ux = hx - nx, uy = hy - ny; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;   // 头的“上”方向
  const fx = -uy * sk.face, fy = ux * sk.face;                                                // 头的“前”方向
  const P = (a, b, bx = hx, by = hy) => [bx + fx * a + ux * b, by + fy * a + uy * b];      // 以头为原点：a 向前，b 向上
  const sway = Math.sin(t * 3 + (f.idx || 0)) * 3 - clamp((f.vx || 0) * sk.face / 60, -8, 8);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (layer === 'back') {
    // 背后的大装饰（在身体后面）
    const bc = P(-16, -4, nx, ny);
    if (D.back === 'sundisk' || D.back === 'bloodmoon' || D.back === 'eclipse') {
      const r = 26, col = D.back === 'sundisk' ? '255,200,90' : D.back === 'bloodmoon' ? '220,40,60' : '230,70,90';
      const g = ctx.createRadialGradient(bc[0], bc[1], 4, bc[0], bc[1], r * 1.9);
      g.addColorStop(0, `rgba(${col},0.55)`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; circle(bc, r * 1.9);
      if (D.back === 'sundisk') {
        ctx.strokeStyle = 'rgba(255,215,120,0.9)'; ctx.lineWidth = 2;
        for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6 + t * 0.4; ctx.beginPath(); ctx.moveTo(bc[0] + Math.cos(a) * r * 1.05, bc[1] + Math.sin(a) * r * 1.05); ctx.lineTo(bc[0] + Math.cos(a) * r * 1.45, bc[1] + Math.sin(a) * r * 1.45); ctx.stroke(); }
        ctx.fillStyle = '#ffcf5a'; circle(bc, r); ctx.strokeStyle = '#fff1c0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bc[0], bc[1], r * 0.7, 0, 7); ctx.stroke();
      } else if (D.back === 'bloodmoon') {
        ctx.fillStyle = '#c21e32'; circle(bc, r); ctx.fillStyle = 'rgba(40,5,10,0.85)'; circle([bc[0] - sk.face * 9, bc[1] - 4], r * 0.85);
      } else {
        ctx.strokeStyle = 'rgba(255,120,120,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bc[0], bc[1], r + 2, 0, 7); ctx.stroke();
        ctx.fillStyle = '#07050a'; circle(bc, r);
      }
    } else if (D.back === 'shell') {   // 玄武龟甲：六边形纹
      const c = P(-12, -24, nx, ny);
      ctx.fillStyle = '#211d2a'; ctx.strokeStyle = 'rgba(140,120,255,0.7)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(c[0], c[1], 20, 30, Math.atan2(uy, ux) + Math.PI / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const [a, b] of [[0, 0], [0, 14], [0, -14], [-9, 7], [-9, -7]]) { const q = P(a - 12, b - 24, nx, ny); ctx.beginPath(); for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; ctx.lineTo(q[0] + Math.cos(an) * 5.5, q[1] + Math.sin(an) * 5.5); } ctx.closePath(); ctx.stroke(); }
    } else if (D.back === 'lotus') {   // 金莲
      for (let k = -3; k <= 3; k++) {
        const a = Math.atan2(uy, ux) + k * 0.32, len = 34 - Math.abs(k) * 3;
        ctx.fillStyle = `rgba(233,196,106,${0.75 - Math.abs(k) * 0.08})`; ctx.beginPath();
        ctx.ellipse(bc[0] + Math.cos(a) * len * 0.5, bc[1] + Math.sin(a) * len * 0.5, 6, len * 0.5, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (D.back === 'snowflake') {   // 冰晶：六个分叉，缓缓旋转
      ctx.strokeStyle = 'rgba(200,240,255,0.85)'; ctx.lineWidth = 2.2;
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + t * 0.3, ex = bc[0] + Math.cos(a) * 26, ey = bc[1] + Math.sin(a) * 26;
        line(bc, [ex, ey]);
        for (const d2 of [0.5, 0.75]) { const mx = bc[0] + Math.cos(a) * 26 * d2, my = bc[1] + Math.sin(a) * 26 * d2; for (const s2 of [-1, 1]) line([mx, my], [mx + Math.cos(a + s2 * 0.8) * 7, my + Math.sin(a + s2 * 0.8) * 7]); }
      }
      ctx.fillStyle = 'rgba(230,250,255,0.9)'; circle(bc, 4);
    } else if (D.back === 'aurora') {   // 极光光带：三条波浪，从绿到紫
      for (let k = 0; k < 3; k++) {
        const g = ctx.createLinearGradient(bc[0] - 50, bc[1], bc[0] + 30, bc[1] - 40);
        g.addColorStop(0, 'rgba(120,255,210,0)'); g.addColorStop(0.4, `rgba(120,255,210,${0.55 - k * 0.12})`); g.addColorStop(1, `rgba(190,120,255,${0.45 - k * 0.1})`);
        ctx.strokeStyle = g; ctx.lineWidth = 7 - k * 1.5; ctx.beginPath();
        for (let q = 0; q <= 12; q++) { const u = q / 12, pt = P(-48 + u * 60, 6 + k * 10 + Math.sin(u * 6 + t * 2 + k) * 6, nx, ny); q ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); }
        ctx.stroke();
      }
    } else if (D.back === 'clouds') {   // 背后流云
      ctx.fillStyle = 'rgba(235,245,255,0.8)';
      for (let k = 0; k < 4; k++) { const q = P(-20 - k * 9, -6 + Math.sin(t * 2 + k) * 4 - k * 5, nx, ny); circle(q, 9 - k * 1.2); }
    }
    // 披风：从肩膀往后飘
    const capeC = D.cape || (D.back === 'aurora' ? null : null);
    if (D.cape || D.back === 'aurora') {
      const a = sk.sh, h = sk.hip, back = -sk.face;
      const tipX = h[0] + back * (26 + Math.abs(sway) * 1.5), tipY = h[1] + 22 + sway;
      if (D.back === 'aurora') { const g = ctx.createLinearGradient(a[0], a[1], tipX, tipY); g.addColorStop(0, 'rgba(120,255,210,0.85)'); g.addColorStop(0.5, 'rgba(120,170,255,0.75)'); g.addColorStop(1, 'rgba(200,120,255,0.3)'); ctx.fillStyle = g; }
      else ctx.fillStyle = D.cape;
      ctx.beginPath(); ctx.moveTo(a[0] + back * 3, a[1]);
      ctx.quadraticCurveTo(a[0] + back * 22, (a[1] + tipY) / 2 + sway, tipX, tipY);
      ctx.lineTo(tipX - back * 12, tipY - 4);
      ctx.quadraticCurveTo(h[0] + back * 4, h[1], a[0] - back * 2, a[1] + 4); ctx.closePath(); ctx.fill();
    }
    ctx.restore(); return;
  }
  // ---------- 前面一层：头饰 ----------
  const hd = D.head;
  if (hd === 'douli') {   // 斗笠
    const L1 = P(-26, 5), R1 = P(26, 5), T1 = P(0, 20);
    ctx.fillStyle = '#c9a86a'; ctx.strokeStyle = '#5a4424'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(L1[0], L1[1]); ctx.quadraticCurveTo(T1[0], T1[1], R1[0], R1[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(90,68,36,0.5)'; for (let k = -2; k <= 2; k++) line(P(k * 9, 6), P(k * 2, 18));
    ctx.strokeStyle = '#b8392e'; ctx.lineWidth = 1.2; line(P(-18, 5), P(-20 + sway, -14));
  } else if (hd === 'crown') {   // 金冠
    ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#8a5a12'; ctx.lineWidth = 1.2; ctx.beginPath();
    const pts = [P(-10, 6), P(-10, 13), P(-6, 10), P(-3, 18), P(0, 11), P(3, 18), P(6, 10), P(10, 13), P(10, 6)];
    ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8403a'; circle(P(0, 9), 2); ctx.fillStyle = '#6fd6ff'; circle(P(-6, 8), 1.4); circle(P(6, 8), 1.4);
  } else if (hd === 'horns') {   // 恶鬼角
    ctx.fillStyle = D.hornC || '#222'; ctx.strokeStyle = `rgba(${L.slash},0.8)`; ctx.lineWidth = 1.2;
    for (const s2 of [-1, 1]) {
      const b0 = P(s2 * 5 - 2, 8), b1 = P(s2 * 9 - 2, 9), c1 = P(s2 * 14 - 8, 22), tp = P(s2 * 10 - 14, 30);
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.quadraticCurveTo(c1[0] + fx * 4, c1[1] + fy * 4, b1[0], b1[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (hd === 'foxmask') {   // 狐面
    const c = P(4, 0);
    ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 8.5, 9.5, Math.atan2(uy, ux) + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    for (const s2 of [-1, 1]) { const e0 = P(s2 * 5 + 2, 7), e1 = P(s2 * 7 + 2, 16), e2 = P(s2 * 1 + 2, 9); ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.fill(); }
    ctx.strokeStyle = D.mask || '#d33'; ctx.lineWidth = 1.6; line(P(6, 3), P(10, 1)); line(P(6, -1), P(9, -4)); line(P(1, 3), P(3, 5));
  } else if (hd === 'helm') {   // 头盔 + 盔缨
    ctx.fillStyle = D.helmC; ctx.strokeStyle = '#3a2a14'; ctx.lineWidth = 1.2; ctx.beginPath();
    const a0 = Math.atan2(uy, ux); ctx.arc(hx, hy, 12, a0 - Math.PI / 2 - 0.2, a0 + Math.PI / 2 + 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = D.crest; ctx.lineWidth = 3; ctx.beginPath(); const b0 = P(0, 12), c1 = P(-10, 24), tp = P(-22, 20 + sway); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.stroke();
  } else if (hd === 'circlet') {   // 额环 + 宝石
    ctx.strokeStyle = '#e6e9f5'; ctx.lineWidth = 2; line(P(-9, 5), P(9, 5));
    ctx.fillStyle = D.gem || '#7dd'; circle(P(9, 5), 2.8); ctx.fillStyle = 'rgba(255,255,255,0.8)'; circle(P(9.6, 5.8), 1);
  } else if (hd === 'flower') {   // 花簪
    for (const [a, b, r] of [[-7, 9, 5], [-11, 3, 3.6]]) {
      const c = P(a, b); ctx.fillStyle = D.flower;
      for (let k = 0; k < 5; k++) { const an = k * Math.PI * 0.4 + t * 0.3; circle([c[0] + Math.cos(an) * r * 0.7, c[1] + Math.sin(an) * r * 0.7], r * 0.55); }
      ctx.fillStyle = '#ffe07a'; circle(c, r * 0.3);
    }
    ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 1; line(P(-9, 6), P(-14 + sway * 0.5, -10));
  } else if (hd === 'hood') {   // 兜帽
    ctx.fillStyle = D.hoodC || '#222'; ctx.beginPath();
    const a0 = Math.atan2(uy, ux); ctx.arc(hx, hy, 13, a0 - Math.PI / 2 - 0.9, a0 + Math.PI / 2 + 0.25);
    const tail = P(-18, -8 + sway * 0.5); ctx.lineTo(tail[0], tail[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(${L.slash},0.6)`; ctx.lineWidth = 1; ctx.stroke();
  } else if (hd === 'plume') {   // 翎羽冠
    const cols = D.plumeC || ['#fff', '#ddd'];
    for (let k = 0; k < 3; k++) {
      const b0 = P(-3, 10), c1 = P(-16 - k * 6, 30 + k * 4), tp = P(-34 - k * 10, 34 + k * 6 + sway * (1 + k * 0.4));
      ctx.strokeStyle = cols[k % cols.length]; ctx.lineWidth = 3.2 - k * 0.6; ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.stroke();
    }
  } else if (hd === 'headband') {   // 头巾 + 飘带
    ctx.strokeStyle = D.band; ctx.lineWidth = 3; line(P(-10, 3), P(10, 3));
    ctx.lineWidth = 2.2; for (const k of [0, 1]) { const b0 = P(-10, 3), c1 = P(-22, -2 - k * 4 + sway), tp = P(-34 - k * 4, -8 - k * 6 + sway * 1.5); ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.quadraticCurveTo(c1[0], c1[1], tp[0], tp[1]); ctx.stroke(); }
  }
  if (D.shoulder) {   // 护肩
    ctx.fillStyle = D.shoulder; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(sk.sh[0], sk.sh[1] + 2, 10, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // ---------- 武器特效 ----------
  const w = D.wfx;
  if (w) {
    const fists = L.weapon === 'fists';
    const A0 = fists ? sk.hf : sk.hilt, B0 = fists ? sk.hf : sk.tip;
    ctx.globalCompositeOperation = w === 'shadow' || w === 'ink' || w === 'lava' ? 'source-over' : 'lighter';
    if (w === 'flame') { ctx.strokeStyle = `rgba(255,${140 + Math.sin(t * 20) * 40 | 0},60,0.55)`; ctx.lineWidth = 7; if (!fists) line(A0, B0); ctx.fillStyle = 'rgba(255,170,70,0.5)'; circle(B0, 5 + Math.sin(t * 25) * 1.5); }
    if (w === 'frost') { ctx.strokeStyle = 'rgba(190,240,255,0.55)'; ctx.lineWidth = 5; if (!fists) line(A0, B0); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; for (let k = 1; k < 4; k++) { const q = [A0[0] + (B0[0] - A0[0]) * k / 4, A0[1] + (B0[1] - A0[1]) * k / 4]; line([q[0] - 3, q[1] - 3], [q[0] + 3, q[1] + 3]); line([q[0] + 3, q[1] - 3], [q[0] - 3, q[1] + 3]); } }
    if (w === 'jade') { ctx.strokeStyle = 'rgba(90,230,170,0.5)'; ctx.lineWidth = 6; if (!fists) line(A0, B0); }
    if (w === 'gold') { const k = (t * 1.2) % 1, q = [A0[0] + (B0[0] - A0[0]) * k, A0[1] + (B0[1] - A0[1]) * k]; ctx.strokeStyle = 'rgba(255,215,120,0.45)'; ctx.lineWidth = 5; if (!fists) line(A0, B0); ctx.fillStyle = 'rgba(255,245,210,0.9)'; circle(q, 3); }
    if (w === 'lightning') { ctx.strokeStyle = 'rgba(200,170,255,0.9)'; ctx.lineWidth = 1.6; for (const hnd of fists ? [sk.hf, sk.hb] : [A0]) { ctx.beginPath(); let q = hnd; ctx.moveTo(q[0], q[1]); for (let k = 0; k < 4; k++) { q = [hnd[0] + rand(-14, 14), hnd[1] + rand(-14, 14)]; ctx.lineTo(q[0], q[1]); } ctx.stroke(); } }
    if (w === 'shadow') { ctx.strokeStyle = 'rgba(40,10,50,0.45)'; ctx.lineWidth = 9; if (!fists) line(A0, B0); ctx.strokeStyle = `rgba(${L.slash},0.5)`; ctx.lineWidth = 1.5; if (!fists) line(A0, B0); }
    if (w === 'lava') { ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 4; if (!fists) line(A0, B0); ctx.strokeStyle = `rgba(255,${120 + Math.sin(t * 6) * 60 | 0},60,0.9)`; ctx.lineWidth = 1.2; ctx.beginPath(); for (let k = 0; k <= 6; k++) { const q = [A0[0] + (B0[0] - A0[0]) * k / 6 + (k % 2 ? 2 : -2), A0[1] + (B0[1] - A0[1]) * k / 6]; k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); }
    if (w === 'ink') { ctx.fillStyle = `rgba(${D.inkC || '15,15,22'},0.85)`; circle(B0, 3.5); circle([B0[0], B0[1] + 6 + Math.sin(t * 4) * 2], 1.8); }
  }
  ctx.restore();
}
// 皮肤的粒子：刀光拖尾和身上的光效（只在真正的对战里生成）
const SKIN_P = {
  ember: { rgb: '255,160,60', vy: -60, g: -40, type: 'spark' }, snow: { rgb: '220,245,255', vy: 30, g: 20, type: 'spark' },
  petal: { rgb: '255,160,190', vy: 20, g: 30, type: 'spark' }, leaf: { rgb: '120,220,150', vy: 20, g: 30, type: 'spark' },
  smoke: { rgb: '30,10,40', vy: -30, g: -20, type: 'ink' }, ink: { rgb: '15,15,22', vy: 40, g: 400, type: 'ink' },
  gold: { rgb: '255,215,120', vy: -40, g: -10, type: 'spark' }, feather: { rgb: '240,245,255', vy: 30, g: 40, type: 'spark' },
  spark: { rgb: '190,150,255', vy: 0, g: 0, type: 'spark' }, aurora: { rgb: '120,255,210', vy: -30, g: -10, type: 'spark' }, cloud: { rgb: '235,245,255', vy: -10, g: -5, type: 'spark' },
};
function skinParticles(f) {
  const D = f.look.deco; if (!D) return;
  const tr = SKIN_P[D.trail];
  if (tr && f.trail.length > 1 && Math.random() < 0.6) {
    const e = f.trail[f.trail.length - 1], q = [e.b[0] + (e.t[0] - e.b[0]) * Math.random(), e.b[1] + (e.t[1] - e.b[1]) * Math.random()];
    const rgb = D.trail === 'petal' ? D.petal || tr.rgb : D.trail === 'leaf' ? D.leaf || tr.rgb : D.trail === 'ink' ? D.inkC || tr.rgb : D.trail === 'feather' ? D.featherC || tr.rgb : tr.rgb;
    addP({ type: tr.type, x: q[0], y: q[1], vx: rand(-40, 40), vy: tr.vy + rand(-30, 30), g: tr.g, life: 0.6, max: 0.6, r: rand(1.5, 3), rgb, w: 2.2, drag: 2 });
  }
  const au = SKIN_P[D.aura];
  if (au && Math.random() < 0.22) addP({ type: au.type, x: f.x + rand(-26, 26), y: f.y - rand(10, 120), vx: rand(-15, 15), vy: au.vy + rand(-20, 20), g: au.g, life: 0.8, max: 0.8, r: rand(1.5, 3), rgb: au.rgb, w: 1.6, drag: 1 });
}
function drawBody(sk, f, o) {
  const L = f.look;
  if (L.deco && !o.ghost) drawDeco(sk, f, L, 'back');
  const segs = [
    [sk.hip, sk.kb, 7.5, 1], [sk.kb, sk.fb, 7, 1], [sk.sh, sk.eb, 6.5, 1], [sk.eb, sk.hb, 6, 1],
    [sk.hip, sk.neck, 11, 0],
    [sk.hip, sk.kf, 7.5, 0], [sk.kf, sk.ff, 7, 0],
  ];
  const arm = [[sk.sh, sk.ef, 6.5, 0], [sk.ef, sk.hf, 6, 0]];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.ghost) {
    ctx.strokeStyle = `rgba(${L.slash},${o.ghost})`;
    for (const s of [...segs, ...arm]) { ctx.lineWidth = s[2]; line(s[0], s[1]); }
    ctx.fillStyle = `rgba(${L.slash},${o.ghost})`; circle(sk.head, 10);
    if (L.weapon !== 'fists') { ctx.lineWidth = 2.5; line(sk.hilt, sk.tip); }
    return;
  }
  const alpha = o.invul ? 0.55 : 1;
  ctx.globalAlpha = alpha;
  // 外轮廓
  ctx.strokeStyle = L.outline; ctx.fillStyle = L.outline;
  ctx.globalAlpha = alpha * L.outlineA;
  for (const s of [...segs, ...arm]) { ctx.lineWidth = s[2] + 5; line(s[0], s[1]); }
  circle(sk.head, 12.5);
  headAcc(sk, 3, L.outline, L);
  weapon(sk, L, true, false);
  ctx.globalAlpha = alpha;
  // 身体
  for (const s of segs) { ctx.strokeStyle = o.flash ? '#fff' : (s[3] ? L.shade : L.body); ctx.lineWidth = s[2]; line(s[0], s[1]); }
  ctx.fillStyle = o.flash ? '#fff' : L.body; circle(sk.head, 10);
  headAcc(sk, 0, o.flash ? '#fff' : L.body, L);
  weapon(sk, L, false, o.flash);
  // 前手臂（在剑柄之上）
  for (const s of arm) { ctx.strokeStyle = o.flash ? '#fff' : L.body; ctx.lineWidth = s[2]; line(s[0], s[1]); }
  ctx.globalAlpha = 1;
  if (L.deco) drawDeco(sk, f, L, 'front');
}
// 头饰：topknot 发髻 hat 斗笠 hood 兜帽 helm 头盔 ponytail 马尾 bun 双髻 band 头带 moon 月牙簪
function headAcc(sk, grow, color, L) {
  const h = sk.head, nx = h[0] - sk.neck[0], ny = h[1] - sk.neck[1], nl = Math.hypot(nx, ny) || 1;
  const ux = nx / nl, uy = ny / nl, px = -uy, py = ux, bk = -sk.face;
  const outline = grow > 0;
  ctx.fillStyle = color; ctx.strokeStyle = color;
  switch (L.head) {
    case 'hat': hat(sk, grow); break;
    case 'topknot': topknot(sk, grow, color); break;
    case 'hood':
      ctx.beginPath(); ctx.moveTo(h[0] + ux * (12 + grow), h[1] + uy * (12 + grow)); ctx.lineTo(h[0] + bk * (22 + grow) - ux * 6, h[1] - uy * 6 + 4);
      ctx.lineTo(h[0] - ux * (8 + grow) + bk * 4, h[1] - uy * (8 + grow)); ctx.closePath();
      if (!outline) ctx.fillStyle = L.shade; ctx.fill();
      if (!outline) { ctx.fillStyle = L.scarf; ctx.fillRect(h[0] - 7 + sk.face * 2, h[1] + 1, 12, 4); }
      break;
    case 'helm':
      ctx.beginPath(); ctx.arc(h[0] + ux * 2, h[1] + uy * 2, 12 + grow, Math.atan2(uy, ux) - 1.7, Math.atan2(uy, ux) + 1.7); ctx.closePath();
      if (!outline) ctx.fillStyle = '#9a9ea8'; ctx.fill();
      if (!outline) { ctx.fillStyle = L.scarf; ctx.beginPath(); ctx.arc(h[0] + ux * 14, h[1] + uy * 14, 3.5, 0, 7); ctx.fill(); }
      break;
    case 'ponytail': {
      ctx.lineWidth = 5 + grow; ctx.lineCap = 'round';
      const a = [h[0] + ux * 6 + bk * 6, h[1] + uy * 6], b = [a[0] + bk * 16, a[1] + 10 + Math.sin(clock * 5) * 3], c = [b[0] + bk * 8, b[1] + 16];
      if (!outline) ctx.strokeStyle = '#2a2f3a';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); ctx.stroke();
      break;
    }
    case 'bun':
      if (!outline) ctx.fillStyle = '#2a3a30';
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(h[0] + ux * 9 + px * sd * 8, h[1] + uy * 9 + py * sd * 8, 5 + grow, 0, 7); ctx.fill(); }
      break;
    case 'band':
      if (!outline) {
        ctx.strokeStyle = L.scarf; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(h[0] + px * 10, h[1] + py * 10); ctx.lineTo(h[0] - px * 10, h[1] - py * 10); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h[0] + bk * 9, h[1]); ctx.lineTo(h[0] + bk * 22, h[1] + 6 + Math.sin(clock * 9) * 3); ctx.stroke();
      }
      break;
    case 'feather':
      if (!outline) {
        ctx.strokeStyle = L.scarf; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(h[0] + ux * 8, h[1] + uy * 8); ctx.quadraticCurveTo(h[0] + ux * 22 + bk * 8, h[1] + uy * 22, h[0] + ux * 16 + bk * 22, h[1] + uy * 20 + 4); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      topknot(sk, grow, outline ? color : '#2a3050');
      break;
    case 'moon':
      if (!outline) {
        ctx.strokeStyle = '#f5e6a8'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(h[0] + ux * 11 + bk * 4, h[1] + uy * 11, 7, 0.6, 3.6); ctx.stroke();
      }
      topknot(sk, grow, outline ? color : '#3a3050');
      break;
  }
}
// 武器：sword 剑 dual 双刀 greatsword 巨剑 spear 长枪 fan 扇 fists 拳套 brush 大笔 moonblade 月刃
function weapon(sk, L, outline, flash) {
  const g = sk.guard, t = sk.tip, hl = sk.hilt;
  const dx = t[0] - g[0], dy = t[1] - g[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, px = -uy, py = ux;
  const blade = flash ? '#fff' : L.blade;
  ctx.lineCap = 'round';
  const guardBar = w => { ctx.strokeStyle = '#d9b36a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g[0] - px * w, g[1] - py * w); ctx.lineTo(g[0] + px * w, g[1] + py * w); ctx.stroke(); };
  switch (L.weapon) {
    case 'fists':
      if (outline) { ctx.fillStyle = L.outline; circle(sk.hf, 8); circle(sk.hb, 7.5); }
      else { ctx.fillStyle = flash ? '#fff' : '#c9a24a'; circle(sk.hf, 6); circle(sk.hb, 5.5); ctx.fillStyle = `rgba(${L.slash},0.5)`; circle(sk.hf, 3); }
      return;
    case 'spear': {
      const back = [g[0] - ux * 36, g[1] - uy * 36];
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 6; line(back, t); return; }
      ctx.strokeStyle = '#6a4a2e'; ctx.lineWidth = 3; line(back, [t[0] - ux * 14, t[1] - uy * 14]);
      ctx.fillStyle = blade; ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(t[0] - ux * 16 + px * 4, t[1] - uy * 16 + py * 4); ctx.lineTo(t[0] - ux * 16 - px * 4, t[1] - uy * 16 - py * 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d9383a'; ctx.beginPath(); ctx.arc(t[0] - ux * 19, t[1] - uy * 19, 3.5, 0, 7); ctx.fill();
      return;
    }
    case 'greatsword':
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 11; line(hl, t); return; }
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 5; line(hl, g);
      ctx.strokeStyle = blade; ctx.lineWidth = 8; line(g, t);
      ctx.strokeStyle = `rgba(${L.slash},0.45)`; ctx.lineWidth = 2; line(g, t);
      guardBar(10);
      return;
    case 'fan': {
      if (outline) { ctx.fillStyle = L.outline; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.arc(g[0], g[1], 34, Math.atan2(uy, ux) - 0.75, Math.atan2(uy, ux) + 0.75); ctx.closePath(); ctx.fill(); return; }
      ctx.fillStyle = flash ? '#fff' : '#f3efe2'; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.arc(g[0], g[1], 31, Math.atan2(uy, ux) - 0.7, Math.atan2(uy, ux) + 0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${L.slash},0.8)`; ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) { const a = Math.atan2(uy, ux) + i * 0.2; line(g, [g[0] + Math.cos(a) * 30, g[1] + Math.sin(a) * 30]); }
      return;
    }
    case 'brush':
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 7; line(hl, t); ctx.fillStyle = L.outline; circle(t, 8); return; }
      ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 4; line(hl, [t[0] - ux * 10, t[1] - uy * 10]);
      ctx.fillStyle = '#0c0c10'; ctx.beginPath(); ctx.ellipse(t[0] - ux * 4, t[1] - uy * 4, 9, 5, Math.atan2(uy, ux), 0, 7); ctx.fill();
      return;
    case 'dual': {
      const b2 = [sk.hb[0] + ux * 38, sk.hb[1] + uy * 38];
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 6; line(hl, t); line(sk.hb, b2); return; }
      ctx.strokeStyle = blade; ctx.lineWidth = 2.6; line(g, t); line(sk.hb, b2);
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 4; line(hl, g);
      return;
    }
    case 'wing': {  // 羽刃：弯弯的一片
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 7; line(hl, t); return; }
      ctx.fillStyle = blade; ctx.beginPath(); ctx.moveTo(g[0], g[1]);
      ctx.quadraticCurveTo((g[0] + t[0]) / 2 + px * 10, (g[1] + t[1]) / 2 + py * 10, t[0], t[1]);
      ctx.quadraticCurveTo((g[0] + t[0]) / 2 - px * 2, (g[1] + t[1]) / 2 - py * 2, g[0], g[1]); ctx.fill();
      ctx.strokeStyle = `rgba(${L.slash},0.7)`; ctx.lineWidth = 1; line(g, t);
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 4; line(hl, g);
      return;
    }
    default: {  // sword / moonblade
      if (outline) { ctx.strokeStyle = L.outline; ctx.lineWidth = 6; line(hl, g); return; }
      ctx.strokeStyle = blade; ctx.lineWidth = 3.2; line(g, t);
      ctx.strokeStyle = `rgba(${L.slash},0.5)`; ctx.lineWidth = 1.2; line(g, t);
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 4.5; line(hl, g);
      guardBar(6);
      if (L.weapon === 'moonblade') { ctx.strokeStyle = blade; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(t[0] - ux * 6, t[1] - uy * 6, 10, Math.atan2(uy, ux) - 2.2, Math.atan2(uy, ux) + 2.2); ctx.stroke(); }
    }
  }
}
function hat(sk, grow) {
  const h = sk.head, nx = h[0] - sk.neck[0], ny = h[1] - sk.neck[1], nl = Math.hypot(nx, ny) || 1;
  const ux = nx / nl, uy = ny / nl, px = -uy, py = ux;
  const top = [h[0] + ux * (16 + grow), h[1] + uy * (16 + grow)];
  const bx = h[0] + ux * 3, by = h[1] + uy * 3, w = 24 + grow;
  ctx.fillStyle = grow ? ctx.fillStyle : '#5a3a2e';
  ctx.beginPath(); ctx.moveTo(bx + px * w, by + py * w); ctx.lineTo(top[0], top[1]); ctx.lineTo(bx - px * w, by - py * w); ctx.closePath(); ctx.fill();
}
function topknot(sk, grow, color) {
  const h = sk.head, nx = h[0] - sk.neck[0], ny = h[1] - sk.neck[1], nl = Math.hypot(nx, ny) || 1;
  const p = [h[0] + nx / nl * 10 - sk.face * 5, h[1] + ny / nl * 10];
  ctx.fillStyle = color; circle(p, 4.5 + grow);
}
// 燕翎的翅膀：飞行时张开扇动，平时收起
function drawWings(sk, f) {
  const open = f.flying ? 1 : (f.state === 'air' ? 0.45 : 0.15);
  const flap = f.flying ? Math.sin(clock * 22) * 0.5 : Math.sin(clock * 3) * 0.05;
  const base = [(sk.sh[0] + sk.neck[0]) / 2, (sk.sh[1] + sk.neck[1]) / 2 + 4], bk = -sk.face;
  for (const [layer, col] of [[1, f.look.shade], [0, f.look.body]]) {
    const len = 46 + 26 * open, ang = -0.4 - open * 0.9 + flap - layer * 0.25;
    ctx.fillStyle = col; ctx.strokeStyle = f.look.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(base[0], base[1]);
    for (let k = 0; k <= 5; k++) {
      const a = ang + k * (0.22 + 0.1 * open), r = len * (1 - k * 0.1);
      ctx.lineTo(base[0] + bk * Math.cos(a) * r, base[1] + Math.sin(a) * r);
      ctx.lineTo(base[0] + bk * Math.cos(a + 0.11) * r * 0.78, base[1] + Math.sin(a + 0.11) * r * 0.78);
    }
    ctx.closePath(); ctx.globalAlpha = f.look.outlineA; ctx.stroke(); ctx.globalAlpha = 1; ctx.fill();
  }
}
function drawScarf(f) {
  const s = f.scarf; if (s.length < 2) return;
  ctx.fillStyle = f.look.scarf;
  ctx.beginPath();
  const left = [], right = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const w = 4.2 * (1 - i / s.length) + 0.8;
    left.push([s[i].x - dy / d * w, s[i].y + dx / d * w]); right.push([s[i].x + dy / d * w, s[i].y - dx / d * w]);
  }
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.strokeStyle = f.look.outline; ctx.lineWidth = 3; ctx.globalAlpha = f.look.outlineA; ctx.stroke(); ctx.globalAlpha = 1; ctx.fill();
}
function drawTrail(f) {
  const tr = f.trail; if (tr.length < 2) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i], al = Math.max(0, b.life);
    ctx.fillStyle = `rgba(${f.look.slash},${0.5 * al})`;
    ctx.beginPath(); ctx.moveTo(a.b[0], a.b[1]); ctx.lineTo(a.t[0], a.t[1]); ctx.lineTo(b.t[0], b.t[1]); ctx.lineTo(b.b[0], b.b[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * al})`; ctx.lineWidth = 2.2 * al + 0.5;
    ctx.beginPath(); ctx.moveTo(a.t[0], a.t[1]); ctx.lineTo(b.t[0], b.t[1]); ctx.stroke();
  }
  ctx.restore();
}
const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
const circle = (p, r) => { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); };
function drawParticles(glowOnly) {
  for (const p of particles) {
    if (glowOnly && !(p.type === 'spark' || p.type === 'flash' || p.type === 'slash' || p.type === 'ring' || p.type === 'glyph')) continue;
    const k = clamp(p.life / p.max, 0, 1);
    if (p.type === 'spark') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${p.rgb},${k})`; ctx.lineWidth = p.w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); ctx.restore();
    } else if (p.type === 'ring') {
      ctx.strokeStyle = `rgba(${p.rgb},${k * 0.9})`; ctx.lineWidth = 3 * k + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.15 - k * 0.8), 0, Math.PI * 2); ctx.stroke();
    } else if (p.type === 'flash') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
      g.addColorStop(0, `rgba(255,255,255,${k})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4); ctx.restore();
    } else if (p.type === 'dmg') {
      const pop = 1 + Math.max(0, (p.life - p.max + 0.12) / 0.12) * 0.6;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.s * pop, p.s * pop);
      ctx.globalAlpha = Math.min(1, k * 2.5); ctx.font = `800 26px ${BODY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,8,20,0.85)'; ctx.strokeText(p.text, 0, 0);
      ctx.shadowColor = `rgba(${p.edge},0.9)`; ctx.shadowBlur = 10; ctx.fillStyle = `rgb(${p.rgb})`; ctx.fillText(p.text, 0, 0); ctx.restore();
    } else if (p.type === 'shape') {   // 皮肤碎片：雪花、花瓣、羽毛……
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.spin || 0) * (p.max - p.life));
      if (WX_RISE[p.sh] || p.sh === 'spark') ctx.globalCompositeOperation = 'lighter';
      drawShape(p.sh, p.r, p.rgb, Math.min(1, k * 1.5)); ctx.restore();
    } else if (p.type === 'glyph') {   // 皮肤命中图案
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate((p.rot || 0) + (p.spin || 0) * (p.max - p.life));
      drawGlyph(p.g2, p.r * (0.55 + 0.6 * Math.sqrt(1 - k)), p.rgb, k * 0.95); ctx.restore();
    } else if (p.type === 'ink') {
      ctx.fillStyle = `rgba(${p.rgb},${k * 0.9})`; circle([p.x, p.y], p.r * (p.y >= 0 ? 1.3 : 1));
    } else if (p.type === 'text') {
      ctx.save(); ctx.font = `28px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = k; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const yy = p.y - (1 - k) * 30; ctx.strokeText(p.text, p.x, yy); ctx.fillStyle = `rgb(${p.rgb})`; ctx.fillText(p.text, p.x, yy); ctx.restore();
    } else if (p.type === 'callout') {
      const pop = 1 + Math.max(0, (p.life - p.max + 0.15) / 0.15) * 0.75;
      const sc = (p.scale || 2) * pop;
      ctx.save(); ctx.translate(p.x, p.y - (1 - k) * 22); ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = `900 36px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(8,6,12,0.92)'; ctx.strokeText(p.text, 0, 0);
      ctx.shadowColor = `rgba(${p.rgb},0.95)`; ctx.shadowBlur = 18;
      ctx.fillStyle = `rgb(${p.rgb})`; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    } else if (p.type === 'smoke') {
      ctx.fillStyle = `rgba(215,210,232,${k * 0.32})`; circle([p.x, p.y], p.r * (1.8 - k * 0.8));
    } else if (p.type === 'dust') {
      ctx.fillStyle = `rgba(200,190,230,${k * 0.18})`; circle([p.x, p.y], p.r * (1.6 - k * 0.6));
    } else if (p.type === 'slash') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate(p.ang);
      const len = p.len * (1.2 - k * 0.2);
      ctx.fillStyle = `rgba(${p.rgb},${k * 0.8})`;
      ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -7 * k, len / 2, 0); ctx.quadraticCurveTo(0, 7 * k, -len / 2, 0); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.fillRect(-len / 2, -0.8, len, 1.6);
      ctx.restore();
    }
  }
}
function drawComboTotals() {
  for (let i = 0; i < 2; i++) {
    const cu = comboUI[i], d = [A, B][1 - i], atk = [A, B][i];
    if (!d || d.hidden || cu.t <= 0 || cu.n < 2 || cu.dmg <= 0) continue;
    const a = clamp(cu.t / 0.5, 0, 1), pop = 1 + Math.max(0, cu.t - 1.25) * 2;
    ctx.save(); ctx.translate(d.x, d.y - 200 * (d.size || 1)); ctx.scale(pop, pop); ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 40px ${BODY_FONT}`; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(10,8,20,0.85)';
    const t = String(Math.round(cu.dmg));
    ctx.strokeText(t, 0, 0); ctx.shadowColor = `rgba(${atk.look.slash},0.95)`; ctx.shadowBlur = 16; ctx.fillStyle = '#ffe9b0'; ctx.fillText(t, 0, 0);
    ctx.shadowBlur = 0; ctx.font = `16px ${TITLE_FONT}`; ctx.lineWidth = 4; ctx.strokeText(`${cu.n} 连击`, 0, 30); ctx.fillStyle = `rgb(${atk.look.slash})`; ctx.fillText(`${cu.n} 连击`, 0, 30);
    ctx.restore();
  }
}
function drawProjs(glowOnly) {
  for (const p of projs) {
    if (glowOnly && (p.kind === 'dragon' || p.kind === 'trap' || p.kind === 'quake')) continue;
    const L = [A, B][p.owner].look;
    ctx.save();
    if (p.kind === 'wind') {
      ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y);
      const scX = (Math.sign(p.vx) || 1) * ((p.w || 56) / 56), scY = (p.h || 52) / 52;
      ctx.scale(scX, scY);
      ctx.fillStyle = `rgba(${L.slash},0.55)`; ctx.beginPath(); ctx.moveTo(-26, -22); ctx.quadraticCurveTo(34, 0, -26, 22); ctx.quadraticCurveTo(10, 0, -26, -22); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-24, -20); ctx.quadraticCurveTo(30, 0, -24, 20); ctx.stroke();
    } else if (p.kind === 'quake') {
      ctx.fillStyle = 'rgba(120,95,70,0.9)';
      for (let i = 0; i < 5; i++) { const x = p.x - Math.sign(p.vx) * i * 12, h = (22 - i * 4) * (0.8 + 0.2 * Math.sin(p.age * 40 + i)); ctx.beginPath(); ctx.moveTo(x - 8, 0); ctx.lineTo(x, -h); ctx.lineTo(x + 8, 0); ctx.fill(); }
      if (Math.random() < 0.5) dust(p.x, 0, 1);
    } else if (p.kind === 'tornado') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const y = p.y + p.h / 2 - i * (p.h / 9), w = 16 + i * 6, off = Math.sin(p.age * 14 + i) * 8;
        ctx.strokeStyle = `rgba(${L.slash},${0.25 + 0.05 * i})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x + off, y, w, 6, 0, p.age * 10 + i, p.age * 10 + i + 4.5); ctx.stroke();
      }
    } else if (p.kind === 'bolt') {
      if (p.delay > 0) {
        const k = 1 - p.delay / 0.46;
        ctx.strokeStyle = `rgba(255,235,120,${0.4 + 0.5 * Math.sin(clock * 30)})`; ctx.lineWidth = p.small ? 4 : 5;
        ctx.beginPath(); ctx.ellipse(p.x, 0, (p.w || 64) * 0.5 * (0.6 + 0.4 * k), 9, 0, 0, Math.PI * 2); ctx.stroke();
        if (!p.small) { ctx.fillStyle = 'rgba(255,235,120,0.18)'; ctx.fillRect(p.x - 1, -700, 2, 700); }
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const top = p.h ? -p.h : (p.small ? -320 : -720);
        ctx.strokeStyle = 'rgba(255,245,190,0.95)'; ctx.lineWidth = p.small ? 8 : 7; ctx.beginPath(); ctx.moveTo(p.x, top);
        for (let y = top; y < 0; y += 60) ctx.lineTo(p.x + rand(-24, 24), y + 60);
        ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 2.5; ctx.stroke();
      }
    } else if (p.kind === 'rock') {
      ctx.translate(p.x, p.y); ctx.rotate((p.rot || 0) + p.age * 8);
      ctx.fillStyle = '#5a5060'; ctx.strokeStyle = '#2a2230'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-4, -14); ctx.lineTo(12, -9); ctx.lineTo(15, 6); ctx.lineTo(2, 13); ctx.lineTo(-12, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-6, -10, 8, 4);
    } else if (p.kind === 'dragon') {   // 墨龙：水墨身子蜿蜒，金眼、长须，墨雾拖尾
      const dir = Math.sign(p.vx) || 1, t = p.age;
      ctx.translate(p.x, p.y); ctx.scale(dir, 1);
      const pts = [];
      for (let i = 0; i <= 16; i++) pts.push([-i * 22, Math.sin(t * 9 - i * 0.55) * (8 + i * 1.4)]);
      for (let i = pts.length - 1; i > 0; i--) {               // 身子：从尾到头，越往前越粗越浓
        const k = 1 - i / pts.length, w = 6 + k * 34;
        ctx.strokeStyle = `rgba(12,12,20,${0.25 + 0.7 * k})`; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i - 1][0], pts[i - 1][1]); ctx.stroke();
        if (i % 3 === 0) { ctx.strokeStyle = `rgba(200,190,170,${0.18 * k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1] - w * 0.2, w * 0.35, 3.6, 5.8); ctx.stroke(); }   // 鳞光
      }
      for (const [i, s2] of [[5, 1], [10, -1]]) {               // 爪子
        const [x0, y0] = pts[i]; ctx.strokeStyle = 'rgba(12,12,20,0.8)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 8, y0 + 24 * s2); ctx.lineTo(x0 + 16, y0 + 20 * s2); ctx.stroke();
      }
      ctx.fillStyle = '#0c0c14';                                // 龙头
      ctx.beginPath(); ctx.moveTo(-8, -26); ctx.quadraticCurveTo(40, -30, 66, -10); ctx.lineTo(50, 0); ctx.lineTo(70, 10); ctx.quadraticCurveTo(36, 30, -8, 22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(232,220,190,0.85)'; ctx.lineWidth = 2;   // 角
      ctx.beginPath(); ctx.moveTo(14, -22); ctx.quadraticCurveTo(0, -48, -18, -52); ctx.moveTo(24, -24); ctx.quadraticCurveTo(16, -46, 2, -58); ctx.stroke();
      ctx.strokeStyle = 'rgba(232,220,190,0.6)'; ctx.lineWidth = 1.2;   // 须
      ctx.beginPath(); ctx.moveTo(58, 2); ctx.bezierCurveTo(40, 30 + Math.sin(t * 7) * 8, 10, 26, -20, 40 + Math.sin(t * 5) * 10); ctx.moveTo(56, -6); ctx.bezierCurveTo(40, -30, 10, -20 + Math.sin(t * 6) * 8, -26, -36); ctx.stroke();
      ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.arc(34, -10, 3.5, 0, 7); ctx.fill();   // 金眼
      ctx.fillStyle = 'rgba(233,196,106,0.25)'; ctx.beginPath(); ctx.arc(34, -10, 9, 0, 7); ctx.fill();
      if (Math.random() < 0.8) { const q = pts[4 + (Math.random() * 12 | 0)]; addP({ type: 'smoke', x: p.x + q[0] * dir, y: p.y + q[1], vx: -p.vx * 0.05, vy: rand(-30, 30), drag: 2, life: 0.6, max: 0.6, r: rand(8, 16) }); }
    } else if (p.kind === 'dragonOld') {
      const dir = Math.sign(p.vx) || 1;
      ctx.translate(p.x, p.y); ctx.scale(dir, 1);
      ctx.fillStyle = '#0b0b12';
      for (let i = 6; i >= 1; i--) { const x = -i * 26, y = Math.sin(p.age * 12 - i * 0.8) * 14; ctx.beginPath(); ctx.arc(x, y, 30 - i * 3, 0, 7); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-10, -34); ctx.quadraticCurveTo(70, -20, 76, 6); ctx.quadraticCurveTo(40, 36, -10, 34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8e2d0'; ctx.beginPath(); ctx.moveTo(30, -26); ctx.lineTo(4, -54); ctx.lineTo(18, -24); ctx.fill();
      ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(40, -8, 4.5, 0, 7); ctx.fill();
    } else if (p.kind === 'qi') {
      ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y);
      const scX = (Math.sign(p.vx) || 1) * ((p.w || 60) / 60), scY = (p.h || 70) / 70;
      ctx.scale(scX, scY);
      const a = clamp(p.life / 0.2, 0, 1);
      ctx.strokeStyle = `rgba(${L.slash},${0.85 * a})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-18, 0, 34, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2; ctx.stroke();
    } else if (p.kind === 'kunai') {
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a1a22'; ctx.fillRect(-12, -1.5, 8, 3); ctx.strokeStyle = `rgb(${L.slash})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-14, 0, 3, 0, 7); ctx.stroke();
    } else if (p.kind === 'inkblob') {
      const r = (p.w || 34) * 0.44;
      ctx.fillStyle = '#0c0c12'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x - Math.sign(p.vx) * r * 0.9, p.y + 4, r * 0.5, 0, 7); ctx.fill();
    } else if (p.kind === 'moonring') {
      ctx.translate(p.x, p.y); ctx.rotate(p.age * 18);
      const r = (p.w || 44) * 0.45;
      ctx.fillStyle = `rgba(${L.slash},0.95)`; ctx.beginPath(); ctx.arc(0, 0, r, 0.3, Math.PI * 2 - 0.3); ctx.arc(r * 0.3, 0, r * 0.75, Math.PI * 2 - 0.4, 0.4, true); ctx.closePath(); ctx.fill();
    } else if (p.kind === 'feather') {
      ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2);
      ctx.fillStyle = `rgba(${L.slash},0.9)`; ctx.beginPath(); ctx.ellipse(0, 0, 5, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 18); ctx.stroke();
    } else if (p.kind === 'trap') {
      const armed = p.delay <= 0, r = (p.w || 84) * 0.48;
      ctx.translate(p.x, 0); ctx.scale(1, 0.28);
      ctx.strokeStyle = armed ? 'rgba(20,20,30,0.95)' : 'rgba(20,20,30,0.45)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(p.age * 1.5); ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(r * 0.35, 0); ctx.lineTo(r * 0.8, 6); ctx.stroke(); }
      if (armed) { ctx.fillStyle = `rgba(${L.slash},${0.12 + 0.08 * Math.sin(clock * 6)})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
}
function drawPetals() {
  for (const p of petals) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
    ctx.fillStyle = 'rgba(255,205,220,0.55)';
    ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

// ======================= 绘制：界面 =======================
function drawTrainStats(cx, top, bh) {
  if (TUT) return;
  if (FOREST.on) return drawForestHUD();
  const cu = comboUI[0];
  if (cu.t > 0 && cu.n > TRAIN.best) { TRAIN.best = cu.n; }
  if (cu.t > 0 && cu.dmg > TRAIN.bestDmg) TRAIN.bestDmg = cu.dmg;
  while (TRAIN.hits.length && clock - TRAIN.hits[0][0] > 5) TRAIN.hits.shift();
  const dps = TRAIN.hits.reduce((a, h) => a + h[1], 0) / 5;
  const x = W - Math.max(24, W * 0.04), y = top + bh + 80, fs = Math.max(13, Math.round(H * 0.019));
  const lines = [
    ['木人桩', DUMMY_MODES[dummyMode], '#e9c46a'],
    ['当前连击', cu.t > 0 ? `${cu.n} 段 · ${Math.round(cu.dmg)} 伤` : '-', cu.t > 0 ? '#ffb088' : '#efe8d8'],
    ['最高连击', `${TRAIN.best} 段 · ${Math.round(TRAIN.bestDmg)} 伤`, '#ffd166'],
    ['累计伤害', `${Math.round(TRAIN.total)}`, '#efe8d8'],
    ['每秒伤害（DPS）', dps.toFixed(1), '#8ff0ff']
  ];
  ctx.save(); ctx.font = `${fs}px ${BODY_FONT}`;
  const pw = fs * 17;
  const cardH = (lines.length + 2) * fs * 1.75 + 16;
  ctx.fillStyle = 'rgba(10,10,24,0.68)'; ctx.fillRect(x - pw - 14, y - 12, pw + 28, cardH);
  ctx.strokeStyle = 'rgba(233,196,106,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(x - pw - 14, y - 12, pw + 28, cardH);
  ctx.font = `600 ${Math.round(fs * 1.05)}px ${TITLE_FONT}`;
  ctx.fillStyle = '#e9c46a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('试剑数据', x - pw, y - 4);
  const startY = y + fs * 1.8;
  ctx.font = `${fs}px ${BODY_FONT}`;
  lines.forEach(([k, v, col], i) => {
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(239,232,216,0.65)'; ctx.fillText(k, x - pw, startY + i * fs * 1.75);
    ctx.textAlign = 'right'; ctx.fillStyle = col || '#efe8d8'; ctx.fillText(v, x, startY + i * fs * 1.75);
  });
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(239,232,216,0.45)';
  ctx.fillText(TOUCH ? '左上角切换木人' : '按 1 2 3 4 切换木人', x, startY + lines.length * fs * 1.75);
  ctx.restore();
}
function keyHint(i, k) {
  if (TOUCH) return '';
  const spKey = keyLabel(custom1PKeys.special);
  const skKey = keyLabel(custom1PKeys.skill);
  const p1 = { sp: ` 按 ${spKey}`, sk: ` ${skKey}`, sk2: ' 左+右', esc: ' 右键' }, p2 = { sp: ' 按 I', sk: '', sk2: '', esc: '' };
  if (M.mode === 'pvp') return (i === 0 ? p1 : p2)[k];
  if (M.mode === 'cpu' || M.mode === 'train') return i === 0 ? p1[k] : '';
  if (M.mode === 'net') return i === localIdx() ? p1[k] : '';
  return '';
}
function drawHUD() {
  if (M.mode === 'demo') return;
  const barW = Math.min(W * 0.36, 520), bh = Math.max(12, H * 0.02), top = Math.max(22, H * 0.04), cx = W / 2, gap = 56;
  [A, B].forEach((f, i) => {
    if (f.hidden) return;
    const dir = i === 0 ? -1 : 1;
    const x0 = i === 0 ? cx - gap - barW : cx + gap;
    const sk = bh * 0.6;
    const para = (x, w, y, h) => {
      ctx.beginPath();
      if (i === 0) { ctx.moveTo(x + sk, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - sk, y + h); ctx.lineTo(x, y + h); }
      else { ctx.moveTo(x, y); ctx.lineTo(x + w - sk, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + sk, y + h); }
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; para(x0 - 3, barW + 6, top - 3, bh + 6);
    const lagW = barW * clamp(f.lagHp / f.maxHp, 0, 1), hpW = barW * clamp(f.hp / f.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(255,240,220,0.85)';
    para(i === 0 ? x0 : x0 + barW - lagW, lagW, top, bh);
    const g = ctx.createLinearGradient(x0, 0, x0 + barW, 0);
    if (i === 0) { g.addColorStop(0, '#2a8fb0'); g.addColorStop(1, '#8ff0ff'); } else { g.addColorStop(0, '#ff8a70'); g.addColorStop(1, '#c42a45'); }
    ctx.fillStyle = f.hp < f.maxHp * 0.25 && Math.sin(clock * 12) > 0 ? '#ffd0c0' : g;
    para(i === 0 ? x0 : x0 + barW - hpW, hpW, top, bh);

    // 格挡架势条（Guard Posture Bar）：紧贴血条下方，显示英雄防御耐力
    const gh = Math.max(4, Math.round(bh * 0.3)), gy = top + bh + 3;
    const maxG = f.maxGuard || 100, curG = clamp(f.guard !== undefined ? f.guard : maxG, 0, maxG);
    const gRatio = curG / maxG;
    const gw = barW * (f.ch.inkShot ? 0.54 : 0.88);
    const gx = i === 0 ? x0 : x0 + barW - gw;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(gx - 1, gy - 1, gw + 2, gh + 2);
    let gCol = '#e9c46a';
    if (gRatio < 0.3) gCol = Math.sin(clock * 14) > 0 ? '#ff3b52' : '#ff7a8a';
    else if (gRatio < 0.6) gCol = '#f39c12';
    ctx.fillStyle = gCol;
    ctx.fillRect(i === 0 ? gx : gx + gw - gw * gRatio, gy, gw * gRatio, gh);
    ctx.font = `${Math.max(12, Math.round(gh * 1.8))}px ${BODY_FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.fillStyle = gRatio < 0.3 ? '#ff7a8a' : 'rgba(239,232,216,0.65)';
    if (gRatio <= 0.02) ctx.fillText('💥 崩防', i === 0 ? gx + gw + 4 : gx - 4, gy + gh / 2);
    else if (gRatio < 0.95 || f.state === 'block' || f.state === 'blockstun') ctx.fillText(`势 ${Math.round(curG)}`, i === 0 ? gx + gw + 4 : gx - 4, gy + gh / 2);

    if (f.ch.inkShot) {   // 墨羽的墨水条：贴在血条下面靠中间的一侧
      const iw = barW * 0.38, ih = Math.max(5, bh * 0.5), iy = top + bh + 3, ix = i === 0 ? x0 + barW - iw : x0;
      const k = clamp(f.ink / INK_MAX, 0, 1), low = f.ink < INK_COST;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ix - 1, iy - 1, iw + 2, ih + 2);
      ctx.fillStyle = low ? `rgba(200,80,70,${0.55 + 0.25 * Math.sin(clock * 8)})` : 'rgba(205,200,225,0.9)';
      ctx.fillRect(i === 0 ? ix + iw - iw * k : ix, iy, iw * k, ih);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let n = 1; n < INK_MAX / INK_COST; n++) ctx.fillRect(ix + iw * n * INK_COST / INK_MAX - 0.5, iy, 1, ih);   // 每一格是一团墨
      ctx.font = `${Math.round(ih * 2.2)}px ${BODY_FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = i === 0 ? 'right' : 'left';
      ctx.fillStyle = 'rgba(239,232,216,0.7)'; ctx.fillText('墨', i === 0 ? ix - 5 : ix + iw + 5, iy + ih / 2);
    }
    // 名字和回合
    ctx.font = `${Math.round(bh * 2)}px ${TITLE_FONT}`; ctx.textBaseline = 'top';
    ctx.fillStyle = `rgb(${f.look.slash})`;
    ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.fillText(f.look.name, i === 0 ? x0 : x0 + barW, top + bh + 8);
    if ((M.mode === 'net' && NET.names) || (M.mode === 'replay' && REPLAY.names)) {
      const pn = M.mode === 'replay' ? REPLAY.names[i] || '' : NET.names[i === 0 ? 'host' : 'client'] || '游客', cw = ctx.measureText(f.look.name).width;
      ctx.font = `${Math.round(bh * 0.95)}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.6)';
      ctx.fillText(pn, i === 0 ? x0 + cw + 10 : x0 + barW - cw - 10, top + bh + 8 + bh * 0.6);
    }
    for (let r = 0; r < 2; r++) {
      const px = i === 0 ? cx - gap - 12 - r * 20 : cx + gap + 12 + r * 20, py = top + bh + 18;
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = M.wins[i] > r ? '#e9c46a' : 'rgba(255,255,255,0.14)'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
    }
    // 气槽
    const mw = barW * 0.55, my = top + bh + 44, mx = i === 0 ? x0 : x0 + barW - mw;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(mx - 2, my - 2, mw + 4, 8);
    const full = f.meter >= 100;
    ctx.fillStyle = full ? `rgba(${f.look.slash},${0.75 + 0.25 * Math.sin(clock * 10)})` : `rgba(${f.look.slash},0.7)`;
    const fw = mw * f.meter / 100;
    ctx.fillRect(i === 0 ? mx : mx + mw - fw, my, fw, 4);
    if (full) {
      ctx.save();
      ctx.strokeStyle = `rgba(${f.look.slash},${0.4 + 0.35 * Math.sin(clock * 12)})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx - 3, my - 3, mw + 6, 10);
      ctx.restore();
      ctx.font = `600 ${Math.round(bh * 0.95)}px ${BODY_FONT}`; ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff'; ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.shadowColor = `rgba(${f.look.slash},0.9)`; ctx.shadowBlur = 8;
      ctx.fillText(`⚡ ${ULTS[f.ch.ult].name}就绪${keyHint(i, 'sp')}`, i === 0 ? mx : mx + mw, my + 9);
      ctx.shadowBlur = 0;
    }
    // 技能冷却（木人桩不显示）
    if (!f.dummy) {
      ctx.font = `${Math.round(bh * 0.85)}px ${BODY_FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const ry = my + (full ? 9 + bh * 1.3 : 12), fs = bh * 0.85;
      const S = SKILLS[f.ch.skill];
      const S2 = SKILLS[f.ch.skill2];
      const items = [[S.name + keyHint(i, 'sk'), f.skillCD, S.cd], [S2.name + keyHint(i, 'sk2'), f.skill2CD, S2.cd], ['腾空闪' + keyHint(i, 'esc'), f.breakCD, f.ch.escCD || BREAK_CD]];
      if (f.ch.fly) items.push(['飞行', f.ch.fly - f.flyT, f.ch.fly]);
      const widths = items.map(it => ctx.measureText(it[0]).width + 8 + 46 + 16);
      const total = widths.reduce((a, b) => a + b, 0);
      let x = i === 0 ? mx : mx + mw - total;
      for (const [k, [name, cd, max]] of items.entries()) {
        const ready = cd <= 0;
        ctx.fillStyle = ready ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)';
        ctx.fillText(name, x, ry);
        const bx = x + ctx.measureText(name).width + 8, by = ry + fs * 0.45;
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, 46, 3);
        ctx.fillStyle = ready ? `rgb(${f.look.slash})` : 'rgba(255,255,255,0.5)';
        ctx.fillRect(bx, by, 46 * (1 - clamp(cd / max, 0, 1)), 3);
        x += widths[k];
      }
    }
    // 连击
    const cu = comboUI[i];
    if (cu.t > 0 && cu.n >= 2) {
      const a = clamp(cu.t / 0.4, 0, 1), pop = 1 + Math.max(0, cu.t - 1.25) * 3;
      const x = i === 0 ? W * 0.06 : W * 0.94, y = H * 0.32;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(pop, pop);
      ctx.textAlign = i === 0 ? 'left' : 'right'; ctx.textBaseline = 'alphabetic';
      ctx.font = `700 ${Math.round(H * 0.075)}px ${BODY_FONT}`; ctx.fillStyle = '#fff';
      ctx.shadowColor = `rgba(${f.look.slash},0.9)`; ctx.shadowBlur = 20;
      ctx.fillText(cu.n, 0, 0); ctx.shadowBlur = 0;
      ctx.font = `${Math.round(H * 0.035)}px ${TITLE_FONT}`; ctx.fillStyle = `rgb(${f.look.slash})`;
      ctx.fillText('连击', 0, H * 0.045);
      ctx.font = `${Math.round(H * 0.02)}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(`${Math.round(cu.dmg)} 伤害`, 0, H * 0.075);
      ctx.restore();
    }
  });
  // 计时
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(bh * 2.3)}px ${BODY_FONT}`;
  ctx.fillStyle = M.timer < 10 ? '#ff8a78' : '#efe8d8';
  if (M.ot && M.mode !== 'train') ctx.fillStyle = '#ff6a5a';
  ctx.fillText(M.mode === 'train' ? '∞' : Math.ceil(M.timer), cx, top + bh / 2 + 2);
  if (M.ot && M.mode !== 'train') { ctx.save(); ctx.font = `${Math.max(12, Math.round(bh * 0.8))}px ${TITLE_FONT}`; ctx.fillStyle = '#ff6a5a'; ctx.fillText('加时', cx, top - bh * 0.75); ctx.restore(); }
  if (M.mode === 'train') drawTrainStats(cx, top, bh);
}
function drawStats() {
  if (M.mode === 'demo') return;
  const fs = Math.max(12, Math.round(H * 0.016)), x = 14, y = H - 12;
  ctx.save(); ctx.font = `${fs}px ${BODY_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(239,232,216,0.55)';
  let t = `帧率 ${FPS}`;
  ctx.fillText(t, x, y);
  if (M.mode === 'net' && NET.rtt) {
    // 分开显示：到对手（整个来回）和到服务器，方便看出慢在哪一段
    const ms = Math.round(NET.rtt), w = ctx.measureText(t + '   ').width;
    ctx.fillStyle = ms < 80 ? '#8fe0a0' : ms < 160 ? '#e9c46a' : '#ff8a78';
    const tx = `延迟 对手 ${ms}ms`;
    ctx.fillText(tx, x + w, y);
    if (NET.srtt) { const sm = Math.round(NET.srtt); ctx.fillStyle = 'rgba(239,232,216,0.55)'; ctx.fillText(`· 服务器 ${sm}ms`, x + w + ctx.measureText(tx + ' ').width, y); }
  }
  ctx.restore();
}
function drawCredit() {
  if (creditT <= 0 || M.mode === 'demo') return;
  const t = CREDIT - creditT, a = Math.min(clamp(t / 0.35, 0, 1), clamp(creditT / 0.45, 0, 1));
  const cx = W / 2, cy = H * 0.42, s1 = Math.round(H * 0.028), s2 = Math.round(H * 0.07);
  ctx.save(); ctx.globalAlpha = a;
  const bw = Math.min(W * 0.86, s2 * 11), bh = s2 * 2.4;
  const g = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  g.addColorStop(0, 'rgba(6,5,14,0)'); g.addColorStop(0.2, 'rgba(6,5,14,0.86)'); g.addColorStop(0.8, 'rgba(6,5,14,0.86)'); g.addColorStop(1, 'rgba(6,5,14,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
  const lw = bw * 0.6 * clamp(t / 0.6, 0, 1);          // 金线从中间展开
  ctx.fillStyle = 'rgba(233,196,106,0.8)';
  ctx.fillRect(cx - lw / 2, cy - bh / 2 + 6, lw, 1.5); ctx.fillRect(cx - lw / 2, cy + bh / 2 - 8, lw, 1.5);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `italic ${s1}px ${BODY_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.72)';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(s1 * 0.3)}px`;
  ctx.fillText('Created by', cx, cy - s2 * 0.55);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const lift = (1 - clamp(t / 0.5, 0, 1)) * 12;
  ctx.font = `700 ${s2}px ${BODY_FONT}`;
  ctx.shadowColor = 'rgba(120,230,255,0.45)'; ctx.shadowBlur = 24; ctx.fillStyle = '#f4ecd8';
  ctx.fillText('Even, Luffy, and Opus 5.5', cx, cy + s2 * 0.3 + lift);
  ctx.restore();
}
function drawAnnounce() {
  if (!announce) return;
  const a = announce, k = a.t / a.dur;
  if (k >= 1) { announce = null; return; }
  const inK = clamp(a.t / 0.15, 0, 1), outK = clamp((a.dur - a.t) / 0.25, 0, 1), al = Math.min(inK, outK);
  const sc = a.style === 'ko' ? lerp(2.2, 1, Math.pow(inK, 0.5)) : lerp(1.4, 1, inK);
  ctx.save(); ctx.translate(W / 2, H * (a.style === 'super' ? 0.3 : 0.42)); ctx.scale(sc, sc); ctx.globalAlpha = al;
  const size = H * (a.style === 'ko' ? 0.26 : a.style === 'super' ? 0.12 : 0.13);
  ctx.font = `${Math.round(size)}px ${TITLE_FONT}`;
  const tw = ctx.measureText(a.text).width;
  if (a.style === 'ko') {
    ctx.fillStyle = '#b8392e'; ctx.rotate(-0.04);
    ctx.fillRect(-size * 0.62, -size * 0.62, size * 1.24, size * 1.24);
    ctx.strokeStyle = 'rgba(255,240,225,0.6)'; ctx.lineWidth = 4; ctx.strokeRect(-size * 0.54, -size * 0.54, size * 1.08, size * 1.08);
    ctx.fillStyle = '#fbeee0';
  } else {
    // 墨迹笔刷底
    ctx.fillStyle = 'rgba(6,5,14,0.82)';
    ctx.beginPath();
    const w = tw + size * 1.2, h = size * 0.95;
    ctx.moveTo(-w / 2, -h / 2);
    for (let i = 0; i <= 12; i++) ctx.lineTo(-w / 2 + w * i / 12, -h / 2 + (hash(a.seed + i) - 0.5) * size * 0.14);
    for (let i = 12; i >= 0; i--) ctx.lineTo(-w / 2 + w * i / 12 + (i === 12 ? size * 0.25 : 0), h / 2 + (hash(a.seed + i + 30) - 0.5) * size * 0.14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = a.style === 'go' ? '#ff8a78' : a.style === 'super' ? '#fff' : '#efe8d8';
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(a.text, 0, size * 0.05);
  ctx.restore();
}
// 离屏画布：背景（低分辨率 = 景深虚化）和泛光
const OFF = {};
function offCanvas(name, w, h) {
  let o = OFF[name];
  if (!o) { const c = document.createElement('canvas'); o = OFF[name] = { c, x: c.getContext && c.getContext('2d') }; }
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  if (o.c.width !== w || o.c.height !== h) { o.c.width = w; o.c.height = h; }
  return o;
}
function withCtx(c2, fn) { const main = ctx; ctx = c2; try { fn(); } finally { ctx = main; } }
// ---------- 大招电影镜头：先慢后快 ----------
const cine = { t: -1, owner: null };
const CINE_LEN = 1.3;
function cineEnv() { if (cine.t < 0) return 0; return clamp(Math.min(cine.t / 0.15, (CINE_LEN - cine.t) / 0.3), 0, 1); }
function cineSpeed() {
  const t = cine.t;
  if (t < 0) return 1;
  if (t < 0.3) return 0.35;
  if (t < 0.55) return lerp(0.35, 1.6, (t - 0.3) / 0.25);
  if (t < CINE_LEN) return lerp(1.6, 1, (t - 0.55) / (CINE_LEN - 0.55));
  return 1;
}
// ---------- 萤火虫 ----------
const FIREFLIES = Array.from({ length: 36 }, (_, i) => ({ x: rand(-200, STAGE_W + 200), y: rand(-420, -30), ph: rand(0, 6.28), sp: rand(0.4, 1.1) }));
function updateFireflies(dt) {
  for (const f of FIREFLIES) {
    f.ph += dt * f.sp; f.x += Math.cos(f.ph * 0.7) * 18 * dt; f.y += Math.sin(f.ph) * 12 * dt;
    if (f.y > -20) f.y = -20; if (f.y < -440) f.y = -440;
  }
}
function drawFireflies(glow) {
  for (const f of FIREFLIES) {
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(f.ph * 2.3));
    ctx.fillStyle = `rgba(255,236,150,${a * (glow ? 1 : 0.85)})`;
    circle([f.x, f.y], glow ? 5 : 1.8);
  }
}
// ---------- 发光层：只画会发光的东西，再模糊叠加 ----------
function drawEmissive(sc, sx, sy) {
  const mx = W * 0.68 - (cam.x - STAGE_W / 2) * 0.04 * sc, my = H * 0.26, mr = H * 0.11;
  ctx.fillStyle = 'rgba(255,236,210,0.32)'; circle([mx, my], mr * 1.02);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 90; i += 3) {
    const x = ((hash(i) * W * 1.4 - cam.x * 0.02 * sc) % W + W) % W, y = hash(i + 50) * H * 0.5;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * (1 + hash(i + 9) * 2) + i);
    ctx.fillRect(x - 1.5, y - 1.5, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(W / 2 + sx, groundY() + sy); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  for (const lx of [260, STAGE_W / 2, STAGE_W - 260]) { ctx.fillStyle = 'rgba(255,170,90,0.5)'; circle([lx, -72], 13); }
  drawFireflies(true);
  drawProjs(true);
  for (const f of [A, B]) {
    if (f.state === 'special' || (f.state === 'charge' && f.t >= CHARGE_FULL) || f.buffT > 0) {
      const g = ctx.createRadialGradient(f.x, f.y - 60, 4, f.x, f.y - 60, 90);
      g.addColorStop(0, `rgba(${f.look.slash},0.8)`); g.addColorStop(1, `rgba(${f.look.slash},0)`);
      ctx.fillStyle = g; ctx.fillRect(f.x - 90, f.y - 150, 180, 180);
    }
    drawTrail(f);
  }
  drawParticles(true);
  ctx.restore();
}
function drawBloom(sc, sx, sy, emit) {
  const b1 = offCanvas('b1', W / 4, H / 4), b2 = offCanvas('b2', W / 8, H / 8), b3 = offCanvas('b3', W / 16, H / 16);
  if (!b1.x) return;
  b1.x.setTransform(1, 0, 0, 1, 0, 0); b1.x.clearRect(0, 0, b1.c.width, b1.c.height);
  b1.x.setTransform(b1.c.width / W, 0, 0, b1.c.height / H, 0, 0);
  b1.x.globalCompositeOperation = 'lighter';
  withCtx(b1.x, () => (emit || drawEmissive)(sc, sx, sy));
  b1.x.globalCompositeOperation = 'source-over';
  for (const [src, dst] of [[b1, b2], [b2, b3]]) { dst.x.setTransform(1, 0, 0, 1, 0, 0); dst.x.clearRect(0, 0, dst.c.width, dst.c.height); dst.x.imageSmoothingEnabled = true; dst.x.drawImage(src.c, 0, 0, dst.c.width, dst.c.height); }
  const I = SETTINGS.bloom * (1 + 0.9 * cineEnv());
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.min(1, 0.32 * I); ctx.drawImage(b1.c, 0, 0, cv.width, cv.height);
  ctx.globalAlpha = Math.min(1, 0.42 * I); ctx.drawImage(b2.c, 0, 0, cv.width, cv.height);
  ctx.globalAlpha = Math.min(1, 0.55 * I); ctx.drawImage(b3.c, 0, 0, cv.width, cv.height);
  ctx.restore();
}
function cineFX(e) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#050510'; ctx.globalAlpha = 0.25 * e; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const bh = H * 0.09 * e;   // 电影黑边
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
}
function drawBackdrop(sc) {
  if (SETTINGS.blur) {
    const k = 1 / 3, o = offCanvas('bg', cv.width * k, cv.height * k);
    if (o.x) {
      o.x.setTransform(o.c.width / W, 0, 0, o.c.height / H, 0, 0);
      withCtx(o.x, () => drawBackground(sc));
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(o.c, 0, 0, cv.width, cv.height); ctx.restore();
      return;
    }
  }
  drawBackground(sc);
}
function render() {
  if (M.mode === 'demo') return renderMenu();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sc = worldScale();
  drawBackdrop(sc);
  const sk = shake * SETTINGS.shake;
  const sx = rand(-sk, sk), sy = rand(-sk, sk);
  ctx.save();
  ctx.translate(W / 2 + sx, groundY() + sy); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  drawGround();
  if (SCN) drawWeather(SCN, sc); else drawPetals();
  drawFireflies(false);
  if (FOREST.on) drawForest();
  ctx.restore();
  if (SCN) {   // 地面映出场景的颜色
    const gy = groundY(), gg = ctx.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, `rgba(${SCN.mist},${SCN.legend ? 0.16 : 0.08})`); gg.addColorStop(1, `rgba(${SCN.mist},0)`);
    ctx.fillStyle = gg; ctx.fillRect(0, gy, W, H - gy);
  }
  if (dimA > 0.01) { ctx.fillStyle = `rgba(3,3,10,${0.55 * dimA})`; ctx.fillRect(0, 0, W, H); }
  ctx.save();
  ctx.translate(W / 2 + sx, groundY() + sy); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  const order = (A.state === 'attack' || A.state === 'special') ? [B, A] : [A, B];
  drawDecoys();
  drawProjs();
  for (const f of order) drawFighter(f);
  drawParticles();
  drawComboTotals();
  ctx.restore();
  if (SETTINGS.bloom > 0) drawBloom(sc, sx, sy);
  if (FOREST.on) {
    const px = W / 2 + (A.x - cam.x) * sc, py = groundY() + (A.y - 60) * sc;
    const dk = ctx.createRadialGradient(px, py, 60 * sc, px, py, 520 * sc);
    dk.addColorStop(0, 'rgba(2,2,10,0)'); dk.addColorStop(1, 'rgba(2,2,10,0.62)');
    ctx.fillStyle = dk; ctx.fillRect(0, 0, W, H);
  }
  if (superFreeze > 0 && superOwner && superOwner.ch.ult === 'timestop' && superOwner.state === 'special') {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgb(128,128,128)'; ctx.globalAlpha = 0.85; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#6f8fd6'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  const ce = cineEnv();
  if (ce > 0.01) cineFX(ce);
  { const T = superOwner && superFreeze > 0 && sceneOf(superOwner.skinKey);
    if (T && T.legend) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.1, W / 2, H / 2, Math.max(W, H) * 0.7); g.addColorStop(0, `rgba(${T.orbC},0)`); g.addColorStop(1, `rgba(${T.orbC},0.28)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } }
  // 暗角
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.36 - 0.08 * ce), W / 2, H / 2, Math.max(W, H) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.6, `rgba(0,0,0,${0.18 * SETTINGS.vig})`); v.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, (0.66 + 0.2 * ce) * SETTINGS.vig)})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (flashA > 0.01) { ctx.fillStyle = `rgba(${flashRGB},${flashA * 0.5})`; ctx.fillRect(0, 0, W, H); }
  drawHUD();
  drawAnnounce();
  drawCredit();
  drawStats();
}

// ======================= 主界面场景：竹林、习武亭、擂台 =======================
const menuCam = { x: 0, tx: 0, z: 1, tz: 1 };
const MENU_SPOT = { single: -640, netp: 640 };
const MENU_FLIES = Array.from({ length: 60 }, () => ({ x: rand(-1500, 1500), y: rand(-420, -20), ph: rand(0, 6.28), sp: rand(0.4, 1.1) }));
const MENU_LEAVES = Array.from({ length: 40 }, () => ({ x: rand(-1500, 1500), y: rand(-700, 0), vx: rand(-30, -8), vy: rand(18, 45), r: rand(0, 6), s: rand(3, 6), ph: rand(0, 6) }));
let menuDt = 0.016;
function menuFlies(glow) {
  for (const f of MENU_FLIES) {
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(f.ph * 2.3));
    ctx.fillStyle = `rgba(255,236,150,${a})`; circle([f.x, f.y], glow ? 5 : 1.8);
  }
}
function lanternAt(x, y, glow) {
  if (glow) { ctx.fillStyle = 'rgba(255,150,80,0.6)'; circle([x, y], 15); return; }
  ctx.fillStyle = '#c23b2e'; ctx.beginPath(); ctx.ellipse(x, y, 12, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,200,130,0.55)'; ctx.beginPath(); ctx.ellipse(x, y, 6, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0b35a'; ctx.fillRect(x - 7, y - 17, 14, 3); ctx.fillRect(x - 7, y + 14, 14, 3);
  ctx.strokeStyle = '#e0b35a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y + 17); ctx.lineTo(x + Math.sin(clock * 2 + x) * 2, y + 28); ctx.stroke();
}
function roofShape(cx, y, half, h, col, edge) {
  ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(cx - half - 26, y - 14);
  ctx.quadraticCurveTo(cx - half + 20, y + 4, cx - half * 0.55, y - h * 0.55);
  ctx.lineTo(cx, y - h); ctx.lineTo(cx + half * 0.55, y - h * 0.55);
  ctx.quadraticCurveTo(cx + half - 20, y + 4, cx + half + 26, y - 14);
  ctx.lineTo(cx + half, y + 6); ctx.lineTo(cx - half, y + 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
}
function drawPavilion(x) {
  ctx.fillStyle = '#26203a'; ctx.fillRect(x - 160, -26, 320, 26);
  ctx.fillStyle = 'rgba(200,180,255,0.15)'; ctx.fillRect(x - 160, -26, 320, 2);
  ctx.fillStyle = '#1d182e'; for (let k = 0; k < 3; k++) ctx.fillRect(x - 50 + k * 4, -8 - k * 6, 100 - k * 8, 6);
  for (const dx of [-76, 76]) { ctx.fillStyle = '#3a1418'; ctx.fillRect(x + dx - 5, -236, 10, 212); }
  for (const dx of [-118, 118]) { ctx.fillStyle = '#5c1e22'; ctx.fillRect(x + dx - 7, -236, 14, 212); ctx.fillStyle = 'rgba(255,140,120,0.18)'; ctx.fillRect(x + dx - 7, -236, 3, 212); }
  ctx.strokeStyle = '#4a1a1e'; ctx.lineWidth = 3;
  for (const yy of [-66, -46]) { ctx.beginPath(); ctx.moveTo(x - 118, yy); ctx.lineTo(x + 118, yy); ctx.stroke(); }
  ctx.lineWidth = 2; for (let k = -110; k <= 110; k += 14) { ctx.beginPath(); ctx.moveTo(x + k, -66); ctx.lineTo(x + k, -26); ctx.stroke(); }
  roofShape(x, -236, 170, 70, '#181424', '#3a3056');
  roofShape(x, -300, 90, 40, '#1b1628', '#3a3056');
  ctx.fillStyle = '#e0b35a'; ctx.beginPath(); ctx.arc(x, -344, 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 36, -232, 72, 22); ctx.strokeStyle = '#e0b35a'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 36, -232, 72, 22);
  ctx.fillStyle = '#f0d890'; ctx.font = `18px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('习武亭', x, -220);
  lanternAt(x, -186, false);
}
function drawDummy(x, k) {
  const sw = Math.sin(clock * 1.3 + k) * 0.03;
  ctx.save(); ctx.translate(x, 0); ctx.rotate(sw);
  ctx.fillStyle = '#4a3322'; ctx.fillRect(-4, -140, 8, 140); ctx.fillRect(-38, -104, 76, 7);
  ctx.fillStyle = '#b08a5a'; ctx.beginPath(); ctx.ellipse(0, -88, 22, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,55,30,0.6)'; ctx.lineWidth = 1; for (let i = -16; i <= 16; i += 5) { ctx.beginPath(); ctx.moveTo(i, -118); ctx.lineTo(i * 0.8, -56); ctx.stroke(); }
  ctx.fillStyle = '#b08a5a'; ctx.beginPath(); ctx.arc(0, -136, 15, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 2.5; for (const yy of [-100, -74]) { ctx.beginPath(); ctx.moveTo(-20, yy); ctx.lineTo(20, yy); ctx.stroke(); }
  ctx.fillStyle = '#f1e2c0'; ctx.fillRect(-5, -96, 10, 18); ctx.fillStyle = '#b8392e'; ctx.fillRect(-2, -93, 4, 12);
  ctx.strokeStyle = 'rgba(60,40,25,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-5, -140); ctx.lineTo(5, -132); ctx.moveTo(5, -140); ctx.lineTo(-5, -132); ctx.stroke();
  ctx.restore();
}
function drawTarget(x) {
  ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x, -110); ctx.lineTo(x + 30, 0); ctx.moveTo(x, -110); ctx.lineTo(x + 6, 0); ctx.stroke();
  const rings = ['#e8dcc0', '#b8392e', '#e8dcc0', '#b8392e', '#e0b35a'];
  rings.forEach((c, k) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, -118, 40 - k * 8, 0, 7); ctx.fill(); });
  ctx.strokeStyle = '#2a2020'; ctx.lineWidth = 2; for (const [dx, dy] of [[-6, -4], [10, 8]]) { ctx.beginPath(); ctx.moveTo(x + dx, -118 + dy); ctx.lineTo(x + dx - 34, -118 + dy - 10); ctx.stroke(); }
}
function drawArena(x) {
  for (const dx of [-176, 176]) { ctx.fillStyle = '#2a1016'; ctx.fillRect(x + dx - 9, -330, 18, 300); }
  ctx.fillStyle = '#1a1424'; ctx.fillRect(x - 220, -300, 440, 16); ctx.fillRect(x - 200, -262, 400, 12);
  roofShape(x, -300, 210, 36, '#161222', '#3a3056');
  ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 48, -286, 96, 26); ctx.strokeStyle = '#e0b35a'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 48, -286, 96, 26);
  ctx.fillStyle = '#f0d890'; ctx.font = `20px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('擂台', x, -272);
  ctx.fillStyle = '#2c2638'; ctx.fillRect(x - 230, -34, 460, 34); ctx.fillStyle = 'rgba(200,180,255,0.18)'; ctx.fillRect(x - 230, -34, 460, 2);
  ctx.fillStyle = '#211c30'; for (let k = 0; k < 3; k++) ctx.fillRect(x - 60 + k * 5, -10 - k * 7, 120 - k * 10, 7);
  for (const [dx, ch] of [[-262, '武'], [262, '战']]) {
    ctx.fillStyle = '#3a2a1e'; ctx.fillRect(x + dx - 3, -360, 6, 360);
    const w = Math.sin(clock * 1.7 + dx) * 6;
    ctx.fillStyle = '#9e2a24'; ctx.beginPath(); ctx.moveTo(x + dx + 3, -350); ctx.lineTo(x + dx + 46 + w, -346); ctx.lineTo(x + dx + 42 + w * 1.3, -200); ctx.lineTo(x + dx + 3, -206); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0d890'; ctx.font = `26px ${TITLE_FONT}`; ctx.fillText(ch, x + dx + 24 + w * 0.6, -276);
  }
  ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 90, -34); ctx.lineTo(x + 90, -130); ctx.moveTo(x + 150, -34); ctx.lineTo(x + 150, -130); ctx.moveTo(x + 84, -120); ctx.lineTo(x + 156, -120); ctx.stroke();
  ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 2; for (const dx of [102, 118, 134]) { ctx.beginPath(); ctx.moveTo(x + dx, -36); ctx.lineTo(x + dx, -150); ctx.stroke(); }
  for (const dx of [-212, 212]) { ctx.fillStyle = '#3a2a1e'; ctx.fillRect(x + dx - 3, -110, 6, 76); lanternAt(x + dx, -122, false); }
}
function drawStoneLantern(x, glow) {
  if (glow) { ctx.fillStyle = 'rgba(255,170,90,0.5)'; circle([x, -72], 12); return; }
  lantern(x, -2);
}
function menuGround() {
  const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, '#1f1a33'); g.addColorStop(1, '#07060f');
  ctx.fillStyle = g; ctx.fillRect(-3000, 0, 6000, 900);
  ctx.strokeStyle = 'rgba(200,180,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3000, 0); ctx.lineTo(3000, 0); ctx.stroke();
  for (let k = -24; k <= 24; k++) {   // 石板路
    const x = k * 62 + hash(k) * 16, w = 40 + hash(k + 3) * 18;
    ctx.fillStyle = `rgba(120,110,150,${0.12 + hash(k + 7) * 0.08})`; ctx.beginPath(); ctx.ellipse(x, 14 + hash(k + 11) * 6, w / 2, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(20,30,20,0.9)'; ctx.lineWidth = 1.5;   // 草
  for (let k = -80; k <= 80; k++) { const x = k * 19 + hash(k * 2) * 12, h = 6 + hash(k * 5) * 12; ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 2, -h * 0.6, x + 4 + Math.sin(clock + k) * 2, -h); ctx.stroke(); }
}
function menuEmissive(sc) {
  withBloomScreen(sc);
  ctx.save(); ctx.translate(W / 2, groundY()); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  lanternAt(MENU_SPOT.single, -186, true);
  for (const dx of [-212, 212]) lanternAt(MENU_SPOT.netp + dx, -122, true);
  drawStoneLantern(160, true); drawStoneLantern(-160, true);
  menuFlies(true);
  ctx.restore();
}
function withBloomScreen(sc) {   // 月亮和星星的发光
  const mx = W * 0.68 - (cam.x - STAGE_W / 2) * 0.04 * sc, my = H * 0.26, mr = H * 0.11;
  ctx.fillStyle = 'rgba(255,236,210,0.32)'; circle([mx, my], mr * 1.02);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 90; i += 3) {
    const x = ((hash(i) * W * 1.4 - cam.x * 0.02 * sc) % W + W) % W, y = hash(i + 50) * H * 0.5;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * (1 + hash(i + 9) * 2) + i); ctx.fillRect(x - 1.5, y - 1.5, 4, 4);
  }
  ctx.globalAlpha = 1;
}
// 场景细节
function drawPlum(x) {
  ctx.strokeStyle = '#2a1a1c'; ctx.lineCap = 'round';
  const br = (x0, y0, a, len, w, d) => {
    if (d > 5 || len < 8) return;
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (d >= 2) for (let k = 0; k < 3; k++) { ctx.fillStyle = k % 2 ? 'rgba(255,190,205,0.85)' : 'rgba(255,230,236,0.9)'; circle([x1 + (hash(x1 + k) - 0.5) * 16, y1 + (hash(y1 + k) - 0.5) * 14], 3 + hash(x1 * k) * 2.5); }
    br(x1, y1, a - 0.45 - hash(d + x0) * 0.2, len * 0.72, w * 0.66, d + 1);
    br(x1, y1, a + 0.4 + hash(d + y0) * 0.2, len * 0.66, w * 0.66, d + 1);
  };
  br(x, 0, -Math.PI / 2 - 0.12, 90, 10, 0);
}
function drawFence(x0, x1) {
  ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x0, -40); ctx.lineTo(x1, -40); ctx.moveTo(x0, -22); ctx.lineTo(x1, -22); ctx.stroke();
  ctx.lineWidth = 5; for (let x = x0; x <= x1; x += 34) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -52); ctx.stroke(); }
}
function drawWarDrum(x) {
  ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 36, 0); ctx.lineTo(x - 10, -60); ctx.moveTo(x + 36, 0); ctx.lineTo(x + 10, -60); ctx.stroke();
  ctx.fillStyle = '#7a1f22'; ctx.beginPath(); ctx.ellipse(x, -82, 40, 36, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8d8b0'; ctx.beginPath(); ctx.ellipse(x + 30, -82, 8, 32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0b35a'; for (let k = -2; k <= 2; k++) circle([x + k * 12, -50], 2);
}
function drawLanternString(x0, x1, y) {
  ctx.strokeStyle = 'rgba(40,30,30,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + 40, x1, y); ctx.stroke();
  for (let k = 1; k < 5; k++) { const t = k / 5, lx = x0 + (x1 - x0) * t, ly = y + 40 * 4 * t * (1 - t) * 0.5 + 10; lanternAt(lx, ly, false); }
}
function drawRocks(x, n) {
  for (let k = 0; k < n; k++) { const w = 18 + hash(x + k) * 26; ctx.fillStyle = k % 2 ? '#2a2638' : '#34304a'; ctx.beginPath(); ctx.ellipse(x + k * 26, -w * 0.3, w, w * 0.55, 0, Math.PI, 0); ctx.fill(); }
}
const MENU_M = { x: 0, y: 0, sx: 0, sy: 0 };
window.addEventListener('pointermove', e => { MENU_M.x = (e.clientX / innerWidth - 0.5) * 2; MENU_M.y = (e.clientY / innerHeight - 0.5) * 2; });
function renderMenu() {
  const dt = menuDt;
  menuCam.x = damp(menuCam.x, menuCam.tx, 3.2, dt); menuCam.z = damp(menuCam.z, menuCam.tz, 2.4, dt);
  const onMenu = $id('menu').classList.contains('on');
  MENU_M.sx = damp(MENU_M.sx, onMenu ? MENU_M.x : 0, 2, dt); MENU_M.sy = damp(MENU_M.sy, onMenu ? MENU_M.y : 0, 2, dt);
  const dz = menuCam.z - 1, baseX = menuCam.x + MENU_M.sx * 70;
  // 分层：远处的东西随镜头移动和放大得少，近处的多 → 推进时有纵深感
  const layer = (par, zk) => { cam.x = baseX * par; cam.y = -MENU_M.sy * 14 * par - dz * 30 * zk; cam.zoom = 1 + dz * zk; };
  for (const f of MENU_FLIES) { f.ph += dt * f.sp; f.x += Math.cos(f.ph * 0.7) * 18 * dt; f.y = clamp(f.y + Math.sin(f.ph) * 12 * dt, -440, -20); }
  for (const l of MENU_LEAVES) { l.x += (l.vx + Math.sin(clock + l.ph) * 20) * dt; l.y += l.vy * dt; l.r += dt * 2; if (l.y > 20) { l.y = rand(-800, -500); l.x = rand(cam.x - 1200, cam.x + 1200); } }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layer(0.9, 0.25); drawBackdrop(worldScale());
  layer(0.95, 0.55);
  bamboo(0.3, worldScale(), groundY(), '#221e44', 120, 0.55);
  const mist = ctx.createLinearGradient(0, groundY() - H * 0.35, 0, groundY());
  mist.addColorStop(0, 'rgba(170,150,210,0)'); mist.addColorStop(1, 'rgba(170,150,210,0.14)'); ctx.fillStyle = mist; ctx.fillRect(0, 0, W, groundY());
  layer(1, 1);
  const sc = worldScale();
  ctx.save(); ctx.translate(W / 2, groundY()); ctx.scale(sc, sc); ctx.translate(-cam.x, 0);
  menuGround();
  const S1 = MENU_SPOT.single, S2 = MENU_SPOT.netp;
  drawPlum(S1 - 420); drawRocks(S1 - 520, 3); drawTarget(S1 - 260); drawFence(S1 - 360, S1 - 200);
  drawPavilion(S1); drawLanternString(S1 + 160, S1 + 420, -170);
  drawDummy(S1 + 250, 1); drawDummy(S1 + 330, 2); drawDummy(S1 + 410, 3); drawRocks(S1 + 460, 2);
  drawArena(S2); drawWarDrum(S2 - 320); drawRocks(S2 + 300, 3); drawPlum(S2 + 420);
  lantern(160, -2); lantern(-160, -2);
  menuFlies(false);
  for (const l of MENU_LEAVES) { ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.r); ctx.fillStyle = 'rgba(120,160,110,0.6)'; ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * 0.35, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  ctx.restore();
  // 前景竹子：推进时放大最快，并淡出，像镜头穿过竹林
  layer(1.1, 1.9);
  ctx.globalAlpha = clamp(1 - dz * 1.1, 0.12, 1);
  bamboo(1.45, worldScale(), groundY() + 40 * worldScale(), '#050409', 330, 1.35);
  ctx.globalAlpha = 1;
  layer(1, 1);
  if (SETTINGS.bloom > 0) drawBloom(sc, 0, 0, menuEmissive);
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, 0.7 * SETTINGS.vig)})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const dim = clamp(dz / 0.9, 0, 1) * 0.22;
  if (dim > 0.01) { ctx.fillStyle = `rgba(4,4,12,${dim})`; ctx.fillRect(0, 0, W, H); }
}
// 主界面按钮：悬停时镜头平移到对应场景，点击后推进镜头再打开页面
const MENU_SCREENS = ['menu', 'single', 'netp', 'help', 'codex', 'settings', 'community', 'acc', 'lb', 'gacha', 'tasks', 'welfare', 'replays'];
function menuGo(name) {
  initAudio();
  const spot = MENU_SPOT[name];
  menuCam.tx = spot !== undefined ? spot * 1.05 : menuCam.tx; menuCam.tz = spot !== undefined ? 1.9 : 1.35;
  $id('menu').classList.add('leaving');
  setTimeout(() => { $id('menu').classList.remove('leaving'); openScreen(name); }, spot !== undefined ? 520 : 260);
}
const AI_PROFILES = {
  easy: {
    name: '入门',
    badge: '初学练手',
    badgeCol: '#46d3ea',
    desc: '电脑出招反应较慢（0.35~0.7s），极少进行格挡招架（15%），出招以单发轻击为主。适合新手熟悉移动、按键手感与基础技能命中。',
    traits: ['出招前摇大', '极少格挡 (15%)', '低反击欲望']
  },
  normal: {
    name: '寻常',
    badge: '标准对练',
    badgeCol: '#2bd49a',
    desc: '见招拆招，具备基础格挡意识（40%），会主动施展 3 连招。攻守相对平衡，适合检验常规实战走位与破招时机。',
    traits: ['标准反应 (0.3s)', '适度格挡 (40%)', '3连段打法']
  },
  hard: {
    name: '劲敌',
    badge: '凌厉反击',
    badgeCol: '#e9c46a',
    desc: '身手敏捷（反应 0.08~0.22s），频繁格挡（72%）与主动抢攻，能熟练打出 4 连招与压制追击，稍有破绽即遭重创！',
    traits: ['敏锐反击', '高频格挡 (72%)', '4连段压制']
  },
  adaptive: {
    name: '宿敌',
    badge: '动态自适应',
    badgeCol: '#ff9f43',
    desc: '拥有自我调整与动态成长能力！根据历史战绩动态调节强弱，并必禁你胜率最高英雄、首选你最常用的英雄出战。',
    traits: ['战力动态自适应', '必禁绝活英雄', '镜像常用角色']
  },
  impossible: {
    name: '绝顶',
    badge: '极境宗师',
    badgeCol: '#ff6b6b',
    desc: '微秒级极限神经反射（12~35ms），近乎完美格挡（99%），被连击时瞬间受身脱离，神级预判与无限绝杀，挑战操作天花板！',
    traits: ['微秒反应 (12ms)', '完美格挡 (99%)', '受身必闪']
  }
};

function updateAIBrief() {
  const lv = pickLevel || 'normal';
  const p = AI_PROFILES[lv] || AI_PROFILES.normal;
  const badgeEl = $id('aiBadge');
  if (badgeEl) {
    badgeEl.textContent = p.badge;
    badgeEl.style.borderColor = p.badgeCol;
    badgeEl.style.color = p.badgeCol;
  }
  const descEl = $id('aiDesc');
  if (descEl) descEl.textContent = p.desc;
  const traitsEl = $id('aiTraits');
  if (traitsEl) traitsEl.innerHTML = p.traits.map(t => `<span class="trait-chip">${t}</span>`).join('');
  const adaptEl = $id('adaptLine');
  if (adaptEl) {
    adaptEl.style.display = lv === 'adaptive' ? '' : 'none';
  }
}

// 单人面板：sec 为空时切换至当前激活的模式标签，否则切换并显示指定模块
let currentSingleTab = 'cpu';
function singleSec(sec) {
  const active = sec || currentSingleTab || 'cpu';
  currentSingleTab = active;
  for (const b of document.querySelectorAll('#singleTabs button')) {
    b.classList.toggle('sel', b.dataset.tab === active);
  }
  for (const el of document.querySelectorAll('#single [data-sec]')) {
    const secs = el.dataset.sec.split(' ');
    el.style.display = secs.includes(active) ? '' : 'none';
  }
  $id('singleT').textContent = '单人模式';
  const subEl = $id('singleSub');
  if (subEl) {
    const subs = {
      cpu: '选择 AI 难度与对手境界，在实战对局中锤炼招式攻防',
      stage: '六大篇章逐级挑战，斩妖除魔，迎战守关宗师',
      train: '召唤不屈木人靶桩，随心演练连段、伤害与打击判定'
    };
    subEl.textContent = subs[active] || '挑选离线玩法，潜心修习剑术招式';
  }
  updateAIBrief();
}
function openScreen(name) {
  if (OFFLINE_BUILD && name === 'single') name = 'cpu';
  if (OFFLINE_BUILD && name === 'netp') name = 'stage';
  if (name === 'cpu' || name === 'stage' || name === 'train') { singleSec(name); renderTrainPick(); renderStages(); showScreen('single'); return; }
  if (name === 'single') singleSec(null);
  if (name === 'tutorial') { startTutorial(); return; }
  if (name === 'gacha') { renderGacha(); loadProfile(); }
  if (name === 'tasks') { renderTasks(); loadProfile(); }
  if (name === 'replays') renderReplays();
  if (name === 'netp') renderRankLine();
  if (name === 'single') { renderTrainPick(); renderStages(); }
  if (name === 'settings') { settingsBack = 'menu'; buildSettings(); }
  if (name === 'codex') openCodex();
  if (name === 'community') openCommunity();
  showScreen(name);
}
function backToMenu() { menuCam.tx = 0; menuCam.tz = 1; $id('menu').classList.remove('hl-single', 'hl-netp'); showScreen('menu'); }
for (const b of document.querySelectorAll('#menu [data-go]')) {
  b.addEventListener('click', () => { b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 900); menuGo(b.dataset.go); });
  if (MENU_SPOT[b.dataset.go] !== undefined) {
    b.addEventListener('pointerenter', () => { if ($id('menu').classList.contains('on')) { menuCam.tx = MENU_SPOT[b.dataset.go] * 0.55; $id('menu').classList.add('hl-' + b.dataset.go); } });
    b.addEventListener('pointerleave', () => { if ($id('menu').classList.contains('on')) menuCam.tx = 0; $id('menu').classList.remove('hl-' + b.dataset.go); });
  }
}
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', backToMenu);

// ======================= 设置 =======================
let settingsBack = 'menu';
const SETTING_ROWS = [
  { k: 'aim', name: '朝向', opts: [[true, '按 A / D 决定'], [false, '自动面向对手']] },
  { k: 'bloom', name: '泛光', opts: [[1.6, '高（最佳效果）'], [1, '中'], [0.5, '低'], [0, '关']] },
  { k: 'fps', name: '帧率上限', opts: [[144, '144'], [120, '120'], [60, '60'], [30, '30']] },
  { k: 'quality', name: '画质', opts: [['high', '极高画质（原生全像素）'], ['mid', '中'], ['low', '低']] },
  { k: 'blur', name: '背景虚化', opts: [[true, '开'], [false, '关']] },
  { k: 'shake', name: '画面震动', range: [0, 2, 0.1] },
  { k: 'vig', name: '暗角', range: [0, 1.5, 0.1] },
  { k: 'music', name: '音乐', range: [0, 1, 0.05] },
  { k: 'sfx', name: '音效', range: [0, 1, 0.05] },
];
const KEY_ACTIONS = [
  ['left', '向左移动'],
  ['right', '向右移动'],
  ['jump', '跳跃 / 二段跳'],
  ['down', '沉身格挡'],
  ['dash', '疾步冲刺'],
  ['special', '绝技（气满）'],
  ['skill', '门派绝学（Q）'],
  ['skill2', '特殊突进（R）']
];
let rebindingKey = null;
function handleKeyRebind(e) {
  if (!rebindingKey) return;
  e.preventDefault(); e.stopPropagation();
  if (e.code === 'Escape') {
    rebindingKey = null;
    window.removeEventListener('keydown', handleKeyRebind, true);
    buildSettings();
    return;
  }
  custom1PKeys[rebindingKey] = e.code;
  try { localStorage.setItem('renying-1p-keys', JSON.stringify(custom1PKeys)); } catch (err) {}
  applyCustomKeys();
  rebindingKey = null;
  window.removeEventListener('keydown', handleKeyRebind, true);
  buildSettings();
}
function buildSettings() {
  const baseHtml = SETTING_ROWS.map(r => r.opts
    ? `<div class="setrow"><span>${r.name}</span><div class="seg" data-k="${r.k}">${r.opts.map(([v, t]) => `<button data-v='${JSON.stringify(v)}' class="${SETTINGS[r.k] === v ? 'sel' : ''}">${t}</button>`).join('')}</div><span></span></div>`
    : `<div class="setrow"><span>${r.name}</span><input type="range" data-k="${r.k}" min="${r.range[0]}" max="${r.range[1]}" step="${r.range[2]}" value="${SETTINGS[r.k]}"><span class="v" id="sv_${r.k}">${Math.round(SETTINGS[r.k] * 100)}%</span></div>`).join('');
  const keyHtml = `
    <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-family:${TITLE_FONT};font-size:18px;color:#e9c46a;">1P 键位设置</span>
        <button id="resetKeysBtn" class="ghost" style="padding:4px 12px;font-size:12px;">恢复默认</button>
      </div>
      <div class="keygrid">
        ${KEY_ACTIONS.map(([act, name]) => `
          <div class="keyitem">
            <span>${name}</span>
            <button class="ghost keybind-btn ${rebindingKey === act ? 'active' : ''}" data-act="${act}">
              ${rebindingKey === act ? '请按新键…' : keyLabel(custom1PKeys[act])}
            </button>
          </div>
        `).join('')}
      </div>
      <p style="font-size:12px;color:rgba(239,232,216,0.4);margin-top:10px;">鼠标提示：左键轻击与蓄力，右键腾空闪，左键加右键使特殊技</p>
    </div>
  `;
  $id('setList').innerHTML = baseHtml + keyHtml;
}
$id('setList').addEventListener('click', e => {
  const rst = e.target.closest('#resetKeysBtn');
  if (rst) {
    custom1PKeys = { ...DEFAULT_1P_KEYS };
    try { localStorage.removeItem('renying-1p-keys'); } catch (err) {}
    applyCustomKeys();
    buildSettings();
    toast('已恢复默认键位');
    return;
  }
  const kb = e.target.closest('.keybind-btn');
  if (kb) {
    rebindingKey = kb.dataset.act;
    window.removeEventListener('keydown', handleKeyRebind, true);
    window.addEventListener('keydown', handleKeyRebind, true);
    buildSettings();
    return;
  }
  const b = e.target.closest('button'); if (!b || !b.parentElement || !b.parentElement.dataset.k) return;
  const k = b.parentElement.dataset.k; SETTINGS[k] = JSON.parse(b.dataset.v); saveSettings(); buildSettings();
  if (k === 'quality') resize();
});
$id('setList').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  SETTINGS[k] = +e.target.value; $id('sv_' + k).textContent = Math.round(SETTINGS[k] * 100) + '%'; saveSettings();
  if (k === 'music' || k === 'sfx') applyVolumes();
});
$id('setDone').addEventListener('click', () => { if (settingsBack === 'pause') showScreen('pause'); else backToMenu(); });
$id('pauseSet').addEventListener('click', () => { settingsBack = 'pause'; buildSettings(); showScreen('settings'); });

// ======================= 角色图鉴 =======================
let cxIdx = 0, cxActiveMove = 'full', cxDemoSpeed = 1.0;
demoLoop($id('cxDemo'), () => cxIdx, () => $id('codex').classList.contains('on'), () => (cxPrev !== null ? cxPrev : mySkin(CHARS[cxIdx].id)), () => cxActiveMove === 'full' ? null : cxActiveMove);
function statRows(c) {
  const m = CHAR_MOVES[CHAR_IDX[c.id]];
  const st = c.stat;
  const rows = [
    ['生命上限', st.hp, 150, `${st.hp}`],
    ['体量压制', st.weight || 1, 2.0, `${st.weight || 1}×`],
    ['防御减伤', st.defRating || 1, 1.25, `×${st.defRating || 1}`],
    ['格挡架势', st.guardMax || 100, 160, `${st.guardMax || 100}`],
    ['格挡稳定性', st.guardStab || 1, 2.0, `×${st.guardStab || 1}`],
    ['格挡穿透伤', Math.round((st.guardChip || 0.12) * 100), 20, `${Math.round((st.guardChip || 0.12) * 100)}%`],
    ['受击硬直', st.poise || 1, 1.25, `×${st.poise || 1}`],
    ['移动速度', WALK * st.walk, WALK * 1.2, `${Math.round(WALK * st.walk)}`],
    ['基础伤害', st.dmg, 1.25, `×${st.dmg}`],
    ['攻击距离', m.l1.box[2], 130, `${Math.round(m.l1.box[2])}`],
    ['跳跃高度', st.jump || 1, 1.2, `×${st.jump || 1}`],
    ['卡肉感', c.hitFeel || 1, 1.6, `×${c.hitFeel || 1}`],
  ];
  if (c.fly) rows.push(['飞行时间', c.fly, 3, `${c.fly} 秒`]);
  return rows;
}
const ICONS = {
  passive: '<circle cx="12" cy="12" r="8"/><path d="M12 4a4 4 0 0 1 0 8a4 4 0 0 0 0 8"/>',
  light: '<path d="M5 19L19 5M15 5h4v4M7 13l4 4"/>',
  charge: '<circle cx="12" cy="12" r="2.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1"/>',
  air: '<path d="M12 19V6M7 11l5-5 5 5M5 21h14"/>',
  skill: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  ranged: '<path d="M3 12h15M13 7l5 5-5 5M3 8h4M3 16h4"/>',
  ult: '<path d="M12 3l2.4 5.6L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.6-.4z"/>',
  esc: '<path d="M12 21V10M7 15l5-5 5 5M7 8l5-5 5 5"/>',
  adv: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><circle cx="12" cy="12" r="1.5"/>',
  vs: '<path d="M4 4l16 16M20 4L4 20M4 9V4h5M20 9V4h-5"/>',
  stats: '<path d="M5 20V11M12 20V4M19 20v-8"/>',
  skin: '<path d="M4 20c4 0 6-2 6-5l7-8a2 2 0 0 0-3-3l-8 7c-3 0-5 2-5 6z"/>',
};
const ic = (k, c) => `<span class="ic" style="color:${c}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg></span>`;
// 图鉴里的简短说明（数值 / 一句话）
const SHORT = {
  疾风斩: ['6', '突进穿身'], 影遁: ['3', '瞬移身后 · 下一击 ×1.5'], 震地: ['9', '双向地波 · 掀飞'], 回马枪: ['9', '后跃回刺 · 挑飞'],
  风刃: ['7', '直线风刃 · 几无前摇'], 雷闪: ['6', '穿身雷光 · 僵直'], 墨阵: ['定身', '踩中定身 1.2 秒'], 月镜: ['12', '格开近战 · 自动反斩'], 俯冲: ['11', '空中俯冲 · 僵直'],
  剑气: ['8', '半场剑气'], 飞镖: ['3×3', '三枚散射'], 铁壁冲: ['8', '霸体冲撞'], 枪旋: ['4×8', '身前旋转 2 秒'], 风遁: ['—', '快速后撤 · 短暂无敌'],
  雷踏: ['7', '前方雷柱'], 泼墨: ['4', '抛物墨团'], 月轮: ['5×2', '飞出再飞回'], 翎羽: ['4×2', '射程无限'],
  残月: ['29', '突进乱斩 · 终结回气重置'], 千影: ['31', '九影乱斩 · 绝杀分身重置'], 山崩: ['28', '砸地晕眩 · 直击回半气重置'], 刹那: ['12–22', '贯穿减速 · 重置回马枪'], 百鸟朝凤: ['—', '原地八连刺'],
  龙卷: ['≤32', '龙卷浮空 · 刷新跳跃风遁'], 雷霆万钧: ['9×3', '天雷追落 · 气量回涌30%'], 墨龙: ['20', '墨龙横扫 · 墨水回满生陷阱'], 月华如水: ['+22', '回血霸体 · 架招重置'], 万羽: ['≤31', '羽刃天降 · 飞行重置'],
};
const PASSIVE_SHORT = { qingfeng: '攒气快 8%', feiying: '最快移速出手 · 脆皮(88血)', tieshan: '重斩蓄力霸体 · 气血冠绝(140血)', lingshuang: '枪尖 ×1.25 · 枪身 ×⅓',
  liuyun: '三段跳 · 御风轻盈(92血)', leiming: '普攻十连 · 强横体魄(118血)', moyu: '普攻甩墨耗墨水 · 蓄力远 40%', yuehua: '3 秒未受伤回血', yanling: '空中按住跳跃飞 1.2 秒' };
const ADV_SHORT = { moyu: '再按 Q 引爆墨阵', yuehua: '格反成功，月轮冷却清零', yanling: '空中俯冲命中，可再冲一次',
  feiying: '1.5 秒内再按 Q 瞬回原位', liuyun: '风遁后风刃变两道', lingshuang: '回马枪命中，枪旋冷却减半' };
// ======================= 全真打击数据与时序 =======================
const HERO_HIT_DETAILS = {
  qingfeng: {
    light: { name: '五段快剑连斩', badge: '🌪️ 击飞浮空', badgeCls: 'badge-buff', dmg: '27 (5段)', cd: '', desc: '行云流水五连斩，末段挑空，青蓝弧光残影。' },
    charge: { name: '破防蓄力大劈', badge: '💥 破防打倒', badgeCls: 'badge-break', dmg: '10 / 18', cd: '', desc: '长蓄后重剑崩地，无视常规格挡，正面击倒。' },
    air: { name: '凌空挑斩·下砸', badge: '🌪️ 挑空击倒', badgeCls: 'badge-buff', dmg: '6 / 8', cd: '', desc: '空中横斩滞空，二段重坠下劈强压地面。' },
    skill: { name: '居合·疾风斩', badge: '⚡ 斩穴定身 0.65s', badgeCls: 'badge-stun', dmg: '7', cd: '5s', desc: '身随剑走瞬间穿身，施加穴道强定身并刷新冲刺。' },
    ranged: { name: '弧月·剑气', badge: '🌪️ 掀天挑空', badgeCls: 'badge-buff', dmg: '9', cd: '5s', desc: '半屏极速弧月剑刃，破尽暗器并挑飞空中。' },
    ult: { name: '绝技·残月', badge: '⚡ 剑意通明', badgeCls: 'badge-stun', dmg: '29 (6连)', cd: '气满', desc: '居合连影绞杀，斩落重置全技能与绝技气量回涌。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', cd: '8.5s', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  tieshan: {
    light: { name: '重剑沉猛四斩', badge: '💥 霸体压制', badgeCls: 'badge-break', dmg: '31 (4段)', cd: '', desc: '玄铁巨剑刀刀沉重带金属火星，体量压迫。' },
    charge: { name: '裂地狂怒崩山', badge: '💥 破防轰飞', badgeCls: 'badge-break', dmg: '12 / 20', cd: '', desc: '双足踏裂地面，满蓄霸体强攻，双倍瓦解架势。' },
    air: { name: '重剑空击·碎石', badge: '💥 沉重砸地', badgeCls: 'badge-break', dmg: '7 / 9', cd: '', desc: '高空举刃重砸，重力势能造成剧烈下坠冲击。' },
    skill: { name: '撼地·震地波', badge: '💥 撼地重震 0.85s', badgeCls: 'badge-stun', dmg: '8 + 10', cd: '8s', desc: '双手托刃砸裂地面，双向土石裂地波掀飞穹顶。' },
    ranged: { name: '玄甲·铁壁冲', badge: '💥 崩山破势', badgeCls: 'badge-break', dmg: '10', cd: '5s', desc: '沉肩如山重盾强冲，带霸体硬直，双倍摧毁格挡。' },
    ult: { name: '奥义·山崩', badge: '💫 怒意回涌 1.3s', badgeCls: 'badge-stun', dmg: '28 (直击)', cd: '气满', desc: '一跃擎天泰山压顶，直击晕眩1.3s并回半气重置CD。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', cd: '7.0s', desc: '玄铁盾身强解受控，冷却极快（7秒）。' }
  },
  feiying: {
    light: { name: '迅疾双刃刺杀', badge: '⚡ 疾风连打', badgeCls: 'badge-buff', dmg: '26 (5段)', cd: '', desc: '出刀极疾，近身密雨连刺，末段暗影穿刺。' },
    charge: { name: '疾影背刺斩', badge: '💥 破防背袭', badgeCls: 'badge-break', dmg: '9 / 16', cd: '', desc: '侧闪蓄力直取后背，大幅破除正面架势。' },
    air: { name: '回旋空刃·落刺', badge: '🌪️ 滞空穿刺', badgeCls: 'badge-buff', dmg: '5 / 7', cd: '', desc: '空中回旋双刺，下落直刺钉向地面。' },
    skill: { name: '暗影·影遁', badge: '⚡ 封脉定身 0.8s', badgeCls: 'badge-stun', dmg: '4', cd: '11s', desc: '结印化烟瞬至对手背后，十字绞杀强定身+增伤50%。' },
    ranged: { name: '飞星·手里剑', badge: '⚡ 极速截击', badgeCls: 'badge-buff', dmg: '2.8×4', cd: '5s', desc: '扇形四枚暗铁手里剑，极速打断对手起手动作。' },
    ult: { name: '绝杀·千影', badge: '⚡ 暗影绝杀', badgeCls: 'badge-stun', dmg: '31 (9连)', cd: '气满', desc: '九道猩红残影错落绞杀，终结重置影遁并化分身。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 影遁化解', badgeCls: 'badge-break', dmg: '—', cd: '9.5s', desc: '替身化烟脱困，身轻如燕迅速拉开安全身位。' }
  },
  liuyun: {
    light: { name: '折扇翻飞连舞', badge: '🌪️ 击退推搡', badgeCls: 'badge-buff', dmg: '24 (3段)', cd: '', desc: '轻扇翻转随风而动，动作轻盈且多段推退。' },
    charge: { name: '旋风拂柳蓄斩', badge: '💥 破防卷地', badgeCls: 'badge-break', dmg: '8 / 15', cd: '', desc: '引动周身气流向前爆破，推开正面一切防备。' },
    air: { name: '御风凌云·挥风', badge: '🌪️ 浮空风切', badgeCls: 'badge-buff', dmg: '6 / 8', cd: '', desc: '空中三段跳滞空扇击，下扫带风刃压制。' },
    skill: { name: '惊涛·风刃', badge: '🌪️ 狂风推搡 620px', badgeCls: 'badge-buff', dmg: '7', cd: '1.3s', desc: '挥扇生成巨型气刃，几无硬直，全场最强击退。' },
    ranged: { name: '御风·风遁', badge: '🌪️ 惊风退敌 0.42s', badgeCls: 'badge-buff', dmg: '4', cd: '4s', desc: '后跃引爆斥力气旋，下一次风刃一分为二。' },
    ult: { name: '神通·龙卷', badge: '🌪️ 扶摇万里', badgeCls: 'badge-buff', dmg: '2×16', cd: '气满', desc: '召出接天双龙卷横扫，卷入高空，跳跃次数回满。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 乘风化解', badgeCls: 'badge-break', dmg: '—', cd: '9.0s', desc: '御风乘气向后腾跃，完美契合三段跳身法。' }
  },
  leiming: {
    light: { name: '狂雷十连轰拳', badge: '⚡ 疾电连打', badgeCls: 'badge-buff', dmg: '30 (10段)', cd: '', desc: '极速拳击十连轰击，拳影交错，末拳雷暴轰天。' },
    charge: { name: '蓄力奔雷重炮', badge: '💥 破防重击', badgeCls: 'badge-break', dmg: '9 / 17', cd: '', desc: '沉腰蓄势轰出电芒重拳，无坚不摧打倒在地。' },
    air: { name: '空落雷拳·踏击', badge: '⚡ 震雷落击', badgeCls: 'badge-buff', dmg: '6 / 8', cd: '', desc: '空中重拳下砸，接连一记沉雷踏击。' },
    skill: { name: '电光·雷闪', badge: '⚡ 触电麻痹 0.82s', badgeCls: 'badge-stun', dmg: '7', cd: '4s', desc: '化身雷光贴地霸体冲拳，触电麻痹瘫痪0.82秒。' },
    ranged: { name: '轰雷·雷踏', badge: '⚡ 通天雷柱 460px', badgeCls: 'badge-stun', dmg: '9', cd: '3.5s', desc: '踏地引落通天巨型垂直落雷，垂直冲天挑飞。' },
    ult: { name: '雷帝·雷霆万钧', badge: '⚡ 雷帝灌顶 +30%', badgeCls: 'badge-stun', dmg: '9×3', cd: '气满', desc: '九天神雷三连追落敌身，重置拳劲并回涌30%大招气量。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 金刚解控', badgeCls: 'badge-break', dmg: '—', cd: '8.0s', desc: '金刚怒吼震脱受制状态，后退步稳如磐石。' }
  },
  lingshuang: {
    light: { name: '银枪连刺·抽枪', badge: '⚡ 枪芒连刺', badgeCls: 'badge-buff', dmg: '28 (4段)', cd: '', desc: '长枪一线连环突刺，枪尖命中伤害提升25%。' },
    charge: { name: '百步穿杨远刺', badge: '💥 远距破防', badgeCls: 'badge-break', dmg: '11 / 19', cd: '', desc: '极远距离枪尖猛刺，直接破除远处格挡防御。' },
    air: { name: '寒芒点水·挑刺', badge: '🌪️ 空中穿云', badgeCls: 'badge-buff', dmg: '6 / 8', cd: '', desc: '空中点枪突刺，下压枪尾横扫落地。' },
    skill: { name: '绝技·回马枪', badge: '⚡ 枪尖穿心 0.85s', badgeCls: 'badge-stun', dmg: '10', cd: '6s', desc: '后跃避开敌势，235px极限回刺穿心定身+挑空。' },
    ranged: { name: '乾坤·枪旋', badge: '🛡️ 弹飞投掷 125px', badgeCls: 'badge-break', dmg: '3.5×7+10', cd: '6s', desc: '枪如风车拨落飞行道具，末段大横扫全额击飞。' },
    ult: { name: '神技·刹那', badge: '❄️ 寒芒贯日 4.0s', badgeCls: 'badge-stun', dmg: '12–22', cd: '气满', desc: '漫天枪影化为一线寒芒贯穿，重置技能并减速40%。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 游龙脱困', badgeCls: 'badge-break', dmg: '—', cd: '8.5s', desc: '身化游龙向后挑跃，拉开枪客最强打击身位。' }
  },
  moyu: {
    light: { name: '挥毫泼墨三式', badge: '🎨 浓墨溅射', badgeCls: 'badge-buff', dmg: '25 (3段)', cd: '', desc: '狼毫大笔挥洒浓墨，附带远程墨滴额外伤害。' },
    charge: { name: '墨宝万钧重印', badge: '💥 破防顿笔', badgeCls: 'badge-break', dmg: '10 / 18', cd: '', desc: '蓄墨如山大印落下，墨意四溢击倒受击者。' },
    air: { name: '临空写意·泼洒', badge: '🎨 空中泼彩', badgeCls: 'badge-buff', dmg: '6 / 8', cd: '', desc: '空中挥墨阻击，落地重笔点化画境。' },
    skill: { name: '画地·墨阵', badge: '⚡ 深墨禁锢 1.4s', badgeCls: 'badge-stun', dmg: '5', cd: '6s', desc: '铺开125px深墨池，踏入者深陷墨中禁锢1.4秒。' },
    ranged: { name: '飞毫·泼墨', badge: '🎨 墨迹遮目 0.65s', badgeCls: 'badge-buff', dmg: '6', cd: '6s', desc: '抛物线掷出重浓墨团，炸裂挑空并施加2.5s减速。' },
    ult: { name: '绘境·墨龙', badge: '🐉 笔意长存 100%', badgeCls: 'badge-stun', dmg: '20', cd: '气满', desc: '浓墨化龙穿行全屏扫灭敌人，墨水瞬间回满。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 墨韵遁形', badgeCls: 'badge-break', dmg: '—', cd: '9.0s', desc: '借墨遁身向后飘退，重组挥毫阵地。' }
  },
  yuehua: {
    light: { name: '双月流水旋舞', badge: '🌙 月华流水', badgeCls: 'badge-buff', dmg: '26 (4段)', cd: '', desc: '双月短刃回旋如流水，舞姿飘逸清冷。' },
    charge: { name: '合璧明月蓄斩', badge: '💥 双刀破防', badgeCls: 'badge-break', dmg: '9 / 16', cd: '', desc: '双刃化作满月合璧切落，斩断对手招架。' },
    air: { name: '清辉凌波·双刃', badge: '🌙 踏月凌空', badgeCls: 'badge-buff', dmg: '5 / 7', cd: '', desc: '月刃凌空双分旋转，顺势飘然下斩。' },
    skill: { name: '神镜·月镜', badge: '🌙 太阴绝罚 1.05s', badgeCls: 'badge-stun', dmg: '14', cd: '7s', desc: '月镜架招反斩，触发太阴绝罚超长硬直与禁身。' },
    ranged: { name: '飞轮·月轮', badge: '🌙 背袭破防 0.78s', badgeCls: 'badge-break', dmg: '6×2', cd: '3.5s', desc: '双月轮飞出折返，去程轻削，返程背袭破防击飞。' },
    ult: { name: '仙术·月华如水', badge: '🌙 月魄霸体 +22HP', badgeCls: 'badge-buff', dmg: '10 (+22)', cd: '气满', desc: '月华凝露恢复22生命，月魄护体并重置月镜月轮。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 踏月退避', badgeCls: 'badge-break', dmg: '—', cd: '8.5s', desc: '月光幻化身法退后，脱离危险贴身缠斗。' }
  },
  yanling: {
    light: { name: '飞羽短刃疾斩', badge: '🪶 振羽连打', badgeCls: 'badge-buff', dmg: '27 (3段)', cd: '', desc: '羽刃翩跹迅捷凌厉，灵动逼人。' },
    charge: { name: '破云飞翔重扑', badge: '💥 破云重扑', badgeCls: 'badge-break', dmg: '9 / 17', cd: '', desc: '双翼振起猛力前扑，切断对手阵势。' },
    air: { name: '苍穹展翼·掠击', badge: '🪶 空中掠阵', badgeCls: 'badge-buff', dmg: '6 / 8', cd: '', desc: '空中长达1.2秒自由翱翔，自上而下俯瞰掠击。' },
    skill: { name: '鹰扬·俯冲', badge: '⚡ 鹰击钉地 0.78s', badgeCls: 'badge-stun', dmg: '12', cd: '3.5s', desc: '收翼斜下猎杀钉地，空中击中可刷新且再次冲锋。' },
    ranged: { name: '千机·翎羽', badge: '🪶 极速穿透', badgeCls: 'badge-buff', dmg: '3.5×3', cd: '2.5s', desc: '振翅激射三道穿透羽刃，贯穿全屏牵制打断。' },
    ult: { name: '天怒·万羽', badge: '🪶 凌霄破虚 14枚', badgeCls: 'badge-buff', dmg: '2.2×14', cd: '气满', desc: '九霄万羽暴雨倾泻，重置技能并回满飞行耐力。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 振翅凌云', badgeCls: 'badge-break', dmg: '—', cd: '8.5s', desc: '猛力振翅脱离受击，立刻升空开启空中制空权。' }
  }
};

const HERO_MOVE_SEQS = {
  qingfeng: {
    light: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'l1s', d: 0.07, lab: '普攻1' }, { p: 'l1a', d: 0.12, dx: 12, hit: 1 },
      { p: 'l2s', d: 0.06 }, { p: 'l2a', d: 0.12, dx: 12, hit: 1 },
      { p: 'lcs', d: 0.06 }, { p: 'lca', d: 0.12, dx: 12, hit: 1 },
      { p: 'l3s', d: 0.08 }, { p: 'l3a', d: 0.22, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'charge', d: 0.45, lab: '按住蓄力' },
      { p: 'hva', d: 0.30, dx: 36, hit: 3, launch: true, badge: '💥 破防打倒' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.18, lab: '空中' },
      { p: 'a1a', d: 0.18, hit: 1 },
      { p: 'a2a', d: 0.28, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'qf_charge', d: 0.14, lab: 'Q · 疾风斩' },
      { p: 'qf_thrust', d: 0.32, dx: 52, hit: 2, fx: 'gale', badge: '居合斩穴' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'qf_charge', d: 0.14, lab: 'R · 剑气' },
      { p: 'qf_thrust', d: 0.36, fx: 'swordqi', hit: 1, launch: true, badge: '掀天挑空' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'qf_charge', d: 0.18, lab: 'E · 残月' },
      { p: 'qf_thrust', d: 0.14, dx: 45, hit: 1, fx: 'crescent' },
      { p: 'l1a', d: 0.1, hit: 1 }, { p: 'l2a', d: 0.1, hit: 1 },
      { p: 'hva', d: 0.3, hit: 3, launch: true, badge: '剑意通明' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.32, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  tieshan: {
    light: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'ts_lift', d: 0.1, lab: '普攻1' }, { p: 'ts_slam', d: 0.18, dx: 14, hit: 2 },
      { p: 'ts_shoulder', d: 0.16, dx: 16, hit: 2 },
      { p: 'hva', d: 0.28, dx: 18, hit: 3, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'charge', d: 0.5, lab: '玄铁蓄力' },
      { p: 'ts_slam', d: 0.32, dx: 34, hit: 3, launch: true, fx: 'quake', badge: '💥 破防击倒' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.2, lab: '空中' },
      { p: 'a1a', d: 0.18, hit: 1 },
      { p: 'ts_slam', d: 0.3, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ts_lift', d: 0.22, lab: 'Q · 震地' },
      { p: 'ts_slam', d: 0.36, hit: 2, fx: 'quake', launch: true, badge: '💥 撼地重震' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ts_shoulder', d: 0.15, lab: 'R · 铁壁冲' },
      { p: 'ts_shoulder', d: 0.35, dx: 45, hit: 2, fx: 'ironwall', launch: true, badge: '💥 崩山破势' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ts_lift', d: 0.25, lab: 'E · 山崩' },
      { p: 'ts_slam', d: 0.45, dx: 40, hit: 4, fx: 'avalanche', launch: true, badge: '💫 怒意回涌' },
      { p: 'victory', d: 0.6, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.3, dx: -30 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  feiying: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1s', d: 0.05, lab: '连刺' }, { p: 'l1a', d: 0.09, dx: 10, hit: 1 },
      { p: 'l2s', d: 0.05 }, { p: 'l2a', d: 0.09, dx: 10, hit: 1 },
      { p: 'lca', d: 0.09, dx: 10, hit: 1 },
      { p: 'l3a', d: 0.18, dx: 14, hit: 2, launch: true },
      { p: 'idle', d: 0.3, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.35, lab: '背刺蓄力' },
      { p: 'fy_xslash', d: 0.28, dx: 36, hit: 2, launch: true, badge: '💥 破防背刺' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '空中' },
      { p: 'a1a', d: 0.15, hit: 1 },
      { p: 'a2a', d: 0.25, hit: 2, launch: true },
      { p: 'idle', d: 0.3, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fy_seal', d: 0.14, lab: 'Q · 影遁' },
      { p: 'fy_xslash', d: 0.32, dx: 55, hit: 2, fx: 'blink', badge: '⚡ 封脉定身' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fy_seal', d: 0.12, lab: 'R · 飞镖' },
      { p: 'fy_crouch', d: 0.35, fx: 'kunai', hit: 1, badge: '极速截击' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fy_seal', d: 0.18, lab: 'E · 千影' },
      { p: 'fy_xslash', d: 0.14, dx: 45, hit: 2, fx: 'shadows' },
      { p: 'l1a', d: 0.08, hit: 1 }, { p: 'l2a', d: 0.08, hit: 1 },
      { p: 'fy_xslash', d: 0.25, hit: 3, launch: true, badge: '暗影绝杀' },
      { p: 'victory', d: 0.5, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.14, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.28, dx: -35 },
      { p: 'idle', d: 0.3, reset: true }
    ]
  },
  liuyun: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1a', d: 0.1, dx: 10, hit: 1 }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
      { p: 'ly_fanswipe', d: 0.22, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.4, lab: '旋风蓄力' },
      { p: 'ly_hover', d: 0.15 },
      { p: 'hva', d: 0.28, dx: 30, hit: 2, launch: true, badge: '💥 破防卷地' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '御风浮空' },
      { p: 'ly_hover', d: 0.16 },
      { p: 'a1a', d: 0.22, hit: 2 },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_fanswipe', d: 0.1, lab: 'Q · 风刃' },
      { p: 'idle', d: 0.36, fx: 'windblade', hit: 1, badge: '🌪️ 狂风推搡' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_hover', d: 0.32, dx: -45, fx: 'windstep', hit: 1, lab: 'R · 风遁', badge: '🌪️ 惊风退敌' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_fanswipe', d: 0.22, lab: 'E · 龙卷' },
      { p: 'ly_hover', d: 0.45, fx: 'tornado', hit: 3, launch: true, badge: '🌪️ 扶摇万里' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_hover', d: 0.3, dx: -40 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  leiming: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.05, lab: '十连击' }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
      { p: 'lm_boxer', d: 0.05 }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
      { p: 'lm_boxer', d: 0.05 }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
      { p: 'lm_boxer', d: 0.05 }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
      { p: 'lm_kick', d: 0.22, dx: 18, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.42, lab: '奔雷蓄力' },
      { p: 'lm_jab', d: 0.3, dx: 36, hit: 3, launch: true, badge: '💥 破防重击' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'lm_kick', d: 0.26, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.1, lab: 'Q · 雷闪' },
      { p: 'lm_jab', d: 0.34, dx: 52, hit: 2, fx: 'thunderfist', badge: '⚡ 触电麻痹' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_kick', d: 0.18, lab: 'R · 雷踏' },
      { p: 'ts_slam', d: 0.38, fx: 'stomp', hit: 2, launch: true, badge: '⚡ 通天雷柱' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_kick', d: 0.22, lab: 'E · 雷霆万钧' },
      { p: 'lm_boxer', d: 0.25, fx: 'thunder', hit: 3, launch: true, badge: '⚡ 雷帝灌顶' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.3, dx: -30 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  lingshuang: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.08, lab: '枪舞' }, { p: 'ls_thrust', d: 0.13, dx: 14, hit: 1 },
      { p: 'ls_plant', d: 0.08 }, { p: 'ls_thrust', d: 0.22, dx: 18, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.44, lab: '穿杨蓄力' },
      { p: 'ls_thrust', d: 0.32, dx: 42, hit: 3, launch: true, badge: '💥 远距破防' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.18, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'ls_plant', d: 0.28, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.22, dx: -24, lab: 'Q · 回马枪' },
      { p: 'ls_thrust', d: 0.35, dx: 38, hit: 2, fx: 'backthrust', launch: true, badge: '枪尖穿心' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.12, lab: 'R · 枪旋' },
      { p: 'ls_plant', d: 0.16, fx: 'spin', hit: 1 },
      { p: 'ls_thrust', d: 0.26, dx: 22, hit: 2, launch: true, badge: '乾坤回旋' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.25, lab: 'E · 刹那' },
      { p: 'ls_thrust', d: 0.4, dx: 60, hit: 3, fx: 'timestop', launch: true, badge: '❄️ 寒芒贯日' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.32, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  moyu: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.1, lab: '挥毫' }, { p: 'my_paint', d: 0.14, dx: 12, hit: 1 },
      { p: 'hva', d: 0.24, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.42, lab: '万钧蓄力' },
      { p: 'my_paint', d: 0.32, dx: 32, hit: 3, launch: true, badge: '💥 破防顿笔' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'a2a', d: 0.26, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.18, lab: 'Q · 墨阵' },
      { p: 'my_paint', d: 0.36, fx: 'inktrap', hit: 1, badge: '深墨禁锢' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.14, lab: 'R · 泼墨' },
      { p: 'my_paint', d: 0.38, fx: 'inkblob', hit: 1, launch: true, badge: '墨迹遮目' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.2, lab: 'E · 墨龙' },
      { p: 'my_paint', d: 0.48, fx: 'inkdragon', hit: 3, launch: true, badge: '🐉 笔意长存' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.32, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  yuehua: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1a', d: 0.1, dx: 10, hit: 1 }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
      { p: 'lca', d: 0.1, dx: 10, hit: 1 },
      { p: 'hva', d: 0.24, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.4, lab: '明月蓄力' },
      { p: 'hva', d: 0.3, dx: 32, hit: 3, launch: true, badge: '💥 双刀破防' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'a2a', d: 0.26, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yh_mirror', d: 0.24, fx: 'mirror', lab: 'Q · 月镜' },
      { p: 'hva', d: 0.32, dx: 26, hit: 3, launch: true, badge: '🌙 太阴绝罚' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yh_mirror', d: 0.12, lab: 'R · 月轮' },
      { p: 'l2a', d: 0.45, fx: 'moonring', hit: 2, launch: true, badge: '🌙 背袭破防' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yh_lotus', d: 0.5, fx: 'moonflow', hit: 1, lab: 'E · 月华如水', badge: '🌙 月魄霸体' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.3, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  yanling: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1a', d: 0.1, dx: 10, hit: 1 }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
      { p: 'a1a', d: 0.22, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.4, lab: '破云蓄力' },
      { p: 'yl_dive', d: 0.3, dx: 36, hit: 3, launch: true, badge: '💥 破云重扑' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '展翼空战' },
      { p: 'yl_wings', d: 0.18 },
      { p: 'a1a', d: 0.24, hit: 2 },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.14, lab: 'Q · 俯冲' },
      { p: 'yl_dive', d: 0.36, dx: 48, hit: 2, fx: 'dive', badge: '鹰击钉地' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.12, lab: 'R · 翎羽' },
      { p: 'a1a', d: 0.35, fx: 'feather', hit: 1, badge: '极速穿透' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.2, lab: 'E · 万羽' },
      { p: 'a1a', d: 0.5, fx: 'featherstorm', hit: 3, launch: true, badge: '🪶 凌霄破虚' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.28, dx: -38 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  }
};

const HERO_FULL_DEMO = {
  qingfeng: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1s', d: 0.08, lab: '普攻' }, { p: 'l1a', d: 0.12, dx: 10, hit: 1 },
    { p: 'l2s', d: 0.07 }, { p: 'l2a', d: 0.12, dx: 10, hit: 1 },
    { p: 'l3s', d: 0.09 }, { p: 'l3a', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.14, lab: 'Q · 疾风斩' }, { p: 'qf_thrust', d: 0.32, dx: 46, hit: 2, fx: 'gale', badge: '居合斩穴' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.14, lab: 'R · 剑气' }, { p: 'qf_thrust', d: 0.36, fx: 'swordqi', hit: 1, launch: true, badge: '掀天挑空' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.2, lab: 'E · 残月' }, { p: 'qf_thrust', d: 0.14, dx: 40, hit: 1, fx: 'crescent' },
    { p: 'l1a', d: 0.09, hit: 1 }, { p: 'l2a', d: 0.09, hit: 1 }, { p: 'hva', d: 0.3, hit: 3, launch: true, badge: '剑意通明' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  tieshan: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'ts_lift', d: 0.1, lab: '普攻' }, { p: 'ts_slam', d: 0.18, dx: 12, hit: 2 },
    { p: 'ts_shoulder', d: 0.15, dx: 14, hit: 2 }, { p: 'hva', d: 0.26, dx: 16, hit: 3, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ts_lift', d: 0.2, lab: 'Q · 震地' }, { p: 'ts_slam', d: 0.35, hit: 2, fx: 'quake', launch: true, badge: '💥 撼地重震' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ts_shoulder', d: 0.14, lab: 'R · 铁壁冲' }, { p: 'ts_shoulder', d: 0.34, dx: 42, hit: 2, fx: 'ironwall', launch: true, badge: '💥 崩山破势' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ts_lift', d: 0.24, lab: 'E · 山崩' }, { p: 'ts_slam', d: 0.42, dx: 38, hit: 4, fx: 'avalanche', launch: true, badge: '💫 怒意回涌' },
    { p: 'victory', d: 0.6, reset: true }
  ],
  feiying: [
    { p: 'idle', d: 0.18, reset: true },
    { p: 'l1s', d: 0.05, lab: '普攻' }, { p: 'l1a', d: 0.09, dx: 10, hit: 1 },
    { p: 'l2a', d: 0.09, dx: 10, hit: 1 }, { p: 'l3a', d: 0.18, dx: 14, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.14, lab: 'Q · 影遁' }, { p: 'fy_xslash', d: 0.3, dx: 50, hit: 2, fx: 'blink', badge: '⚡ 封脉定身' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.12, lab: 'R · 飞镖' }, { p: 'fy_crouch', d: 0.32, fx: 'kunai', hit: 1, badge: '极速截击' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.18, lab: 'E · 千影' }, { p: 'fy_xslash', d: 0.14, dx: 40, hit: 2, fx: 'shadows' },
    { p: 'l1a', d: 0.08, hit: 1 }, { p: 'fy_xslash', d: 0.26, hit: 3, launch: true, badge: '暗影绝杀' },
    { p: 'victory', d: 0.5, reset: true }
  ],
  liuyun: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1a', d: 0.1, dx: 10, hit: 1, lab: '普攻' }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
    { p: 'ly_fanswipe', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ly_fanswipe', d: 0.1, lab: 'Q · 风刃' }, { p: 'idle', d: 0.35, fx: 'windblade', hit: 1, badge: '🌪️ 狂风推搡' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ly_hover', d: 0.3, dx: -40, fx: 'windstep', hit: 1, lab: 'R · 风遁', badge: '🌪️ 惊风退敌' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ly_fanswipe', d: 0.2, lab: 'E · 龙卷' }, { p: 'ly_hover', d: 0.42, fx: 'tornado', hit: 3, launch: true, badge: '🌪️ 扶摇万里' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  leiming: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'lm_boxer', d: 0.05, lab: '十连击' }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
    { p: 'lm_boxer', d: 0.05 }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
    { p: 'lm_kick', d: 0.2, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_boxer', d: 0.1, lab: 'Q · 雷闪' }, { p: 'lm_jab', d: 0.32, dx: 48, hit: 2, fx: 'thunderfist', badge: '⚡ 触电麻痹' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_kick', d: 0.16, lab: 'R · 雷踏' }, { p: 'ts_slam', d: 0.36, fx: 'stomp', hit: 2, launch: true, badge: '⚡ 通天雷柱' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_kick', d: 0.2, lab: 'E · 雷霆万钧' }, { p: 'lm_boxer', d: 0.26, fx: 'thunder', hit: 3, launch: true, badge: '⚡ 雷帝灌顶' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  lingshuang: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'ls_stance', d: 0.08, lab: '普攻' }, { p: 'ls_thrust', d: 0.13, dx: 14, hit: 1 },
    { p: 'ls_thrust', d: 0.2, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ls_stance', d: 0.2, dx: -22, lab: 'Q · 回马枪' }, { p: 'ls_thrust', d: 0.34, dx: 36, hit: 2, fx: 'backthrust', launch: true, badge: '枪尖穿心' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ls_stance', d: 0.12, lab: 'R · 枪旋' }, { p: 'ls_plant', d: 0.15, fx: 'spin', hit: 1 }, { p: 'ls_thrust', d: 0.24, dx: 20, hit: 2, launch: true, badge: '乾坤回旋' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ls_stance', d: 0.22, lab: 'E · 刹那' }, { p: 'ls_thrust', d: 0.38, dx: 55, hit: 3, fx: 'timestop', launch: true, badge: '❄️ 寒芒贯日' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  moyu: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'my_stroke', d: 0.1, lab: '普攻' }, { p: 'my_paint', d: 0.13, dx: 12, hit: 1 },
    { p: 'hva', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'my_stroke', d: 0.16, lab: 'Q · 墨阵' }, { p: 'my_paint', d: 0.34, fx: 'inktrap', hit: 1, badge: '深墨禁锢' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'my_stroke', d: 0.14, lab: 'R · 泼墨' }, { p: 'my_paint', d: 0.36, fx: 'inkblob', hit: 1, launch: true, badge: '墨迹遮目' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'my_stroke', d: 0.18, lab: 'E · 墨龙' }, { p: 'my_paint', d: 0.44, fx: 'inkdragon', hit: 3, launch: true, badge: '🐉 笔意长存' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  yuehua: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1a', d: 0.1, dx: 10, hit: 1, lab: '普攻' }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
    { p: 'hva', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yh_mirror', d: 0.22, fx: 'mirror', lab: 'Q · 月镜' }, { p: 'hva', d: 0.3, dx: 24, hit: 3, launch: true, badge: '🌙 太阴绝罚' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yh_mirror', d: 0.12, lab: 'R · 月轮' }, { p: 'l2a', d: 0.42, fx: 'moonring', hit: 2, launch: true, badge: '🌙 背袭破防' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yh_lotus', d: 0.45, fx: 'moonflow', hit: 1, lab: 'E · 月华如水', badge: '🌙 月魄霸体' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  yanling: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1a', d: 0.1, dx: 10, hit: 1, lab: '普攻' }, { p: 'a1a', d: 0.2, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yl_wings', d: 0.14, lab: 'Q · 俯冲' }, { p: 'yl_dive', d: 0.34, dx: 44, hit: 2, fx: 'dive', badge: '鹰击钉地' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yl_wings', d: 0.12, lab: 'R · 翎羽' }, { p: 'a1a', d: 0.32, fx: 'feather', hit: 1, badge: '极速穿透' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yl_wings', d: 0.18, lab: 'E · 万羽' }, { p: 'a1a', d: 0.46, fx: 'featherstorm', hit: 3, launch: true, badge: '🪶 凌霄破虚' },
    { p: 'victory', d: 0.55, reset: true }
  ]
};

let cxPrev = null;   // 正在预览的皮肤（null = 用自己装备的）
function renderCodex() {
  const c = CHARS[cxIdx], m = CHAR_MOVES[cxIdx], S = SKILLS[c.skill], S2 = SKILLS[c.skill2], U = ULTS[c.ult];
  const skin = cxPrev !== null ? cxPrev : mySkin(c.id);
  const L = skinLook(cxIdx, skin);
  const col = `rgb(${L.slash})`;
  $id('cxTabs').innerHTML = CHARS.map((x, i) => `<button class="${i === cxIdx ? 'sel' : ''}" data-i="${i}" style="${i === cxIdx ? '' : `color:rgb(${x.look.slash})`} ">${x.name}</button>`).join('');
  const cv2 = $id('cxCard'), g = cv2.getContext && cv2.getContext('2d');
  if (g) { g.clearRect(0, 0, 600, 800); g.drawImage(makeCardArt(cxIdx, 600, 800, skin), 0, 0); }
  if (cv2) {
    cv2.style.boxShadow = `0 16px 48px ${col.replace('rgb', 'rgba').replace(')', ',0.35)')}`;
    cv2.style.borderColor = col;
  }
  const rar = CHAR_RARITY[c.id], own = DEV_SESSION_UNLOCKED || PROF.owned.includes(c.id), free = (PROF.rotation || []).includes(c.id);
  const skMeta = skin && SKINS[skin];
  const skPill = skMeta ? `<span class="pill" style="color:${col};border-color:${col}">皮肤 · ${skMeta.name}</span>` : '';
  $id('cxName').innerHTML = `<div class="nm" style="color:${col}">${c.name}</div><div class="pills">${skPill}<span class="pill">${c.role}</span><span class="pill" style="color:rgb(${RAR_RGB[rar]})">${RAR_NAME[rar]}</span><span class="pill">${own ? '已拥有' : free ? '本周限免' : '未拥有'}</span><span class="pill">难度 ${'●'.repeat(c.diff)}${'○'.repeat(3 - c.diff)}</span></div>`;
  const skList = Object.entries(SKINS).filter(([k, v]) => v.char === c.id);
  $id('cxSkinT').textContent = cxPrev !== null && cxPrev !== mySkin(c.id) ? '皮肤 · 预览中' : '皮肤';
  $id('cxSkins').innerHTML = `<button data-sk="" class="${skin ? '' : 'sel'}">默认</button>` + skList.map(([k, v]) => {
    const has = (PROF.skins || []).includes(k) || OFFLINE_BUILD || DEV_SESSION_UNLOCKED;
    return `<button data-sk="${k}" class="${skin === k ? 'sel' : ''}${has ? '' : ' lock'}" style="color:rgb(${RAR_RGB[v.rarity]})">${v.name}${has ? '' : v.exclusive ? ' · 青锋行通关' : ' · 预览'}</button>`;
  }).join('');
  $id('cxStats').innerHTML = statRows(c).map(([n, v, max, t]) => `<div class="st"><span>${n}</span><div class="bar"><i style="width:${Math.round(clamp(v / max, 0.05, 1) * 100)}%;background:${col}"></i></div><span class="v">${t}</span></div>`).join('');
  const lk = c.id === 'leiming' ? ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10'] : ['l1', 'l2', 'l3', 'l4', 'l5'];
  const sum = Math.round(lk.reduce((a, k) => a + m[k].dmg, 0) * 10) / 10;
  const nm = ids => ids.map(id => CHARS[CHAR_IDX[id]].name).join(' ');
  const tile = (icon, label, val, desc, cd, wide, moveKey) => {
    const hit = (moveKey && HERO_HIT_DETAILS[c.id] && HERO_HIT_DETAILS[c.id][moveKey]) || null;
    const mini = moveKey ? `<div class="card-mini-win"><canvas class="card-mini-cv" data-mv="${moveKey}"></canvas><span class="mini-tag">${hit ? hit.badge : val}</span></div>` : '';
    return `<div class="tile t-m${wide ? ' wide' : ''}${moveKey ? ' t-has-demo' : ''}${moveKey && cxActiveMove === moveKey ? ' active-demo' : ''}" ${moveKey ? `data-move="${moveKey}" title="点击在主视窗慢放/演示该招式"` : ''}><div class="th">${ic(icon, col)}<span class="tl">${label}</span></div>${mini}${val ? `<div class="tv">${val}</div>` : ''}<div class="td">${desc}</div>${cd ? `<span class="cd">${cd}</span>` : ''}</div>`;
  };
  const sh = n => SHORT[n] || ['', ''];
  $id('cxMoves').innerHTML = [
    tile('passive', `被动 · ${c.passiveName}`, '', PASSIVE_SHORT[c.id] || '', '', true),
    tile('light', '左键 · 连击', sum, `${lk.length} 段 · 末段击飞${c.inkShot ? ` · 另有墨团 ${lk.length}×${INK_DMG}` : ''}`, '', false, 'light'),
    tile('charge', '按住左键 · 蓄力', `${m.cs1.dmg} / ${m.cs2.dmg}`, '满蓄破防 · 打倒', '', false, 'charge'),
    tile('air', '空中', `${m.a1.dmg} / ${m.a2.dmg}`, '空中斩 · 下砸', '', false, 'air'),
    tile('skill', `Q · ${S.name}`, sh(S.name)[0], sh(S.name)[1], `${S.cd}s`, false, 'skill'),
    tile('ranged', `左键+右键 · ${S2.name}`, sh(S2.name)[0], sh(S2.name)[1], `${S2.cd}s`, false, 'ranged'),
    tile('ult', `E · ${U.name}`, sh(U.name)[0], sh(U.name)[1], '气满', false, 'ult'),
    tile('esc', '右键 · 腾空闪', `${c.escCD || BREAK_CD}s`, '解除受制 · 落地前无敌', '', false, 'esc'),
    ADV_SHORT[c.id] ? tile('adv', '进阶技巧', '', ADV_SHORT[c.id]) : '',
    tile('vs', '克制关系', '', `克 ${nm(c.beats)}<br>怕 ${nm(c.weakTo)}`, '', !ADV_SHORT[c.id]),
  ].join('');
  for (const el of document.querySelectorAll('#cxBento .ic[data-ic]')) el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.dataset.ic]}</svg>`;
  if ($id('cxBento')) $id('cxBento').style.setProperty('--cx-accent', col);
  startCodexCardsDirector();
}

let cxCardsRAF = null;
function startCodexCardsDirector() {
  if (cxCardsRAF) return;
  let lastT = performance.now();
  const tick = now => {
    if (!$id('codex') || !$id('codex').classList.contains('on')) {
      cxCardsRAF = null;
      return;
    }
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const cvs = document.querySelectorAll('#cxMoves .card-mini-cv');
    const c = CHARS[cxIdx];
    if (c) {
      const skin = cxPrev !== null ? cxPrev : mySkin(c.id);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const cv of cvs) {
        const mv = cv.dataset.mv;
        if (!mv || !HERO_MOVE_SEQS[c.id] || !HERO_MOVE_SEQS[c.id][mv]) continue;
        let p = cv._pup;
        if (!p || p.chIdx !== cxIdx || p.skin !== skin || cv._mv !== mv) {
          p = new Puppet(cxIdx, skin);
          p.playSeq(HERO_MOVE_SEQS[c.id][mv], null, true);
          cv._pup = p;
          cv._mv = mv;
        }
        p.update(dt);
        const g = cv.getContext && cv.getContext('2d');
        if (g) {
          const cw = cv._w || (cv._w = cv.clientWidth || 160);
          const chh = cv._h || (cv._h = cv.clientHeight || 76);
          if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(chh * dpr)) {
            cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
          }
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.fillStyle = '#0a0b18';
          g.fillRect(0, 0, cw, chh);
          g.fillStyle = 'rgba(200,180,255,0.08)'; g.fillRect(0, chh * 0.84, cw, 1);
          p.draw(g, cw, chh, chh / 180, true);
        }
      }
    }
    cxCardsRAF = requestAnimationFrame(tick);
  };
  cxCardsRAF = requestAnimationFrame(tick);
}

$id('cxMoves').addEventListener('click', e => {
  const tile = e.target.closest('.tile[data-move]');
  if (!tile) return;
  const m = tile.dataset.move;
  cxActiveMove = m;
  for (const t of $id('cxMoves').querySelectorAll('.tile')) t.classList.remove('active-demo');
  tile.classList.add('active-demo');
  for (const btn of $id('cxDemoTabs').querySelectorAll('button')) btn.classList.toggle('sel', btn.dataset.m === m);
  const demoCanvas = $id('cxDemo');
  if (demoCanvas && demoCanvas._pup) {
    const ch = CHARS[cxIdx];
    if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][m]) {
      demoCanvas._pup.playSeq(HERO_MOVE_SEQS[ch.id][m], null, true);
    }
    SFX.slice();
  }
});

const demoTabsEl = $id('cxDemoTabs');
if (demoTabsEl) {
  demoTabsEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-m]');
    if (!btn) return;
    const m = btn.dataset.m;
    cxActiveMove = m;
    for (const b of demoTabsEl.querySelectorAll('button')) b.classList.remove('sel');
    btn.classList.add('sel');
    for (const t of $id('cxMoves').querySelectorAll('.tile')) t.classList.toggle('active-demo', t.dataset.move === m);
    const demoCanvas = $id('cxDemo');
    if (demoCanvas && demoCanvas._pup) {
      const ch = CHARS[cxIdx];
      if (m === 'full') {
        demoCanvas._pup.playSeq(HERO_FULL_DEMO[ch.id] || DEMO2, null, true);
      } else if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][m]) {
        demoCanvas._pup.playSeq(HERO_MOVE_SEQS[ch.id][m], null, true);
      }
      SFX.slice();
    }
  });
}

const demoSpdEl = $id('cxDemoSpd');
if (demoSpdEl) {
  demoSpdEl.addEventListener('click', () => {
    cxDemoSpeed = cxDemoSpeed === 1.0 ? 0.5 : 1.0;
    demoSpdEl.textContent = cxDemoSpeed === 0.5 ? '原速 1.0x' : '慢放 0.5x';
    demoSpdEl.classList.toggle('sel', cxDemoSpeed === 0.5);
    SFX.click();
  });
}

function openCodex() {
  cxPrev = null;
  cxActiveMove = 'full';
  if ($id('cxDemoTabs')) {
    for (const b of $id('cxDemoTabs').querySelectorAll('button')) b.classList.toggle('sel', b.dataset.m === 'full');
  }
  renderCodex();
}
$id('cxSkins').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const sk = b.dataset.sk || '';
  const id = CHARS[cxIdx].id;
  const has = !sk || (PROF.skins || []).includes(sk) || OFFLINE_BUILD || DEV_SESSION_UNLOCKED;
  if (!has) {
    cxPrev = sk; renderCodex(); SFX.slice();
    toast('还没有这款皮肤，先给你看看');
    return;
  }
  cxPrev = null;
  PROF.equip = PROF.equip || {};
  if (sk) PROF.equip[id] = sk; else delete PROF.equip[id];
  try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (err) {}
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
  applyProfile(PROF);
  renderCodex();
  SFX.slice();
  toast(sk ? `已装配「${SKINS[sk].name}」` : '已换回原本装束');
});
$id('cxTabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) {
    cxIdx = +b.dataset.i;
    cxPrev = null;
    cxActiveMove = 'full';
    if ($id('cxDemoTabs')) {
      for (const btn of $id('cxDemoTabs').querySelectorAll('button')) btn.classList.toggle('sel', btn.dataset.m === 'full');
    }
    renderCodex();
    SFX.slice();
  }
});

// ======================= 社区聊天 =======================
let comLast = 0, comTimer = null;
function comFmt(text) {
  return escapeHTML(text).replace(/\[e:([a-z]+)\]/g, (m, id) => EMO[id] ? `<span class="emo" title="${EMO[id].name}">${EMO[id].svg}</span>` : m);
}
function comRender(list, append) {
  const log = $id('comLog'), atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
  if (!append) log.innerHTML = '';
  for (const p of list) {
    const d = new Date(p.at * 1000), tm = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const el = document.createElement('div'); el.className = 'cm';
    el.innerHTML = `<span class="cn">${escapeHTML(p.name)}</span>${comFmt(p.text)}<span class="ct">${tm}</span>`;
    log.appendChild(el); comLast = Math.max(comLast, p.id);
  }
  if (!append || atBottom) log.scrollTop = log.scrollHeight;
}
async function comPoll(first) {
  if (!SERVED || !window.fetch) return;
  try { const j = await api('/api/posts?after=' + (first ? 0 : comLast)); if (j.list && (first || j.list.length)) comRender(j.list, !first); }
  catch (e) { if (first) $id('comHint').textContent = '读取失败：' + e.message; }
}
function openCommunity() {
  if (!$id('comEmo').innerHTML) $id('comEmo').innerHTML = EMOTES.map(e => `<button data-e="${e.id}" title="${e.name}" aria-label="${e.name}">${e.svg}</button>`).join('');
  const can = !!ACC.name;
  $id('comIn').disabled = !can; $id('comSend').disabled = !can;
  $id('comIn').placeholder = can ? '说点什么…（回车送出）' : '登录之后，方可发言';
  $id('comHint').textContent = !SERVED ? '社区需从服务器网址进入游戏才能使用' : can ? '以武会友，还请口下留情。' : '游客只能旁观；登录之后便可发言（右上角登录）';
  comLast = 0; comPoll(true);
  clearInterval(comTimer);
  comTimer = setInterval(() => { if ($id('community').classList.contains('on')) comPoll(false); else clearInterval(comTimer); }, 3000);
}
async function comSend(text) {
  text = text.trim(); if (!text || !ACC.name) return;
  try { const j = await api('/api/post', { text, token: ACC.token }); if (j.post) comRender([j.post], true); $id('comIn').value = ''; $id('comHint').textContent = '以武会友，还请口下留情。'; }
  catch (e) { $id('comHint').textContent = e.message; }
}
$id('comSend').addEventListener('click', () => comSend($id('comIn').value));
$id('comIn').addEventListener('keydown', e => { if (e.key === 'Enter') comSend($id('comIn').value); });
$id('comEmo').addEventListener('click', e => { const b = e.target.closest('button'); if (b && ACC.name) comSend(`[e:${b.dataset.e}]`); });

// ======================= 成长系统：墨锭、问剑阁、任务、皮肤、排位 =======================
const RAR_NAME = { starter: '初始', common: '普通', rare: '稀有', legend: '传说' };
const RAR_RGB = { starter: '190,190,205', common: '159,177,201', rare: '111,168,255', legend: '233,196,106' };
const CHAR_RARITY = { qingfeng: 'starter', tieshan: 'common', leiming: 'common', feiying: 'rare', liuyun: 'rare', lingshuang: 'rare', moyu: 'legend', yuehua: 'legend', yanling: 'legend' };
const DEFAULT_RATES = {
  full: { legend: 0.015, rare: 0.035, common: 0.07 },
  frag: { legend: 0.1584, rare: 0.2816, common: 0.44 },
  pool: { common: ['tieshan', 'leiming'], rare: ['feiying', 'liuyun', 'lingshuang'], legend: ['moyu', 'yuehua', 'yanling'] },
  craft: { common: 20, rare: 30, legend: 40 },
  cost: 60,
  ten: 540,
  pity: 20,
  dup: 90,
  fragInk: 6,
  skin: {
    rate: { legend: 0.03, rare: 0.12 },
    cost: 30,
    ten: 270,
    pity: 15,
    dup: 20
  }
};
function getWeeklyRotation() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const weekKey = `${d.getUTCFullYear()}-W${weekNo}`;
  const nonStarters = CHARS.map(c => c.id).filter(id => id !== 'qingfeng');
  let seed = 0;
  for (let i = 0; i < weekKey.length; i++) seed = (seed * 31 + weekKey.charCodeAt(i)) >>> 0;
  const list = [...nonStarters];
  const result = [];
  for (let i = 0; i < 3 && list.length; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const idx = Math.floor((seed / 233280) * list.length);
    result.push(list.splice(idx, 1)[0]);
  }
  return result;
}
const SKINS = {
  qf_frost: { char: 'qingfeng', rarity: 'rare', name: '寒霜', look: { body: '#e6efff', shade: '#8ea4cc', scarf: '#9fd8ff', slash: '170,220,255', blade: '#eef8ff' }, deco: { head: 'circlet', gem: '#bfefff', back: 'snowflake', wfx: 'frost', trail: 'snow' } },
  qf_gold: { char: 'qingfeng', rarity: 'legend', name: '金乌', look: { body: '#fff3d2', shade: '#c9a45a', scarf: '#ffb62e', slash: '255,196,90', blade: '#fff3cf' }, deco: { head: 'crown', back: 'sundisk', cape: '#d99a2b', wfx: 'flame', trail: 'ember', aura: 'ember' } },
  fy_jade: { char: 'feiying', rarity: 'rare', name: '碧影', look: { scarf: '#2bd49a', slash: '90,230,170', blade: '#dffff2' }, deco: { head: 'foxmask', mask: '#2bd49a', wfx: 'jade', trail: 'leaf' } },
  fy_blood: { char: 'feiying', rarity: 'legend', name: '血月', look: { body: '#3a1420', shade: '#1a080e', scarf: '#ff2a3d', slash: '255,60,80', blade: '#ffd9dd' }, deco: { head: 'horns', hornC: '#2a0a10', back: 'bloodmoon', cape: '#5a0f1a', wfx: 'shadow', trail: 'smoke', aura: 'smoke' } },
  ts_bronze: { char: 'tieshan', rarity: 'rare', name: '青铜', look: { body: '#c9a26b', shade: '#7a5a34', scarf: '#3fa37a', slash: '120,210,170' }, deco: { head: 'helm', helmC: '#a8804a', crest: '#3fa37a', shoulder: '#8a6a3a' } },
  ts_obsidian: { char: 'tieshan', rarity: 'legend', name: '玄武', look: { body: '#34303e', shade: '#18161e', scarf: '#6a5cff', slash: '140,120,255', blade: '#d8d4ff' }, deco: { head: 'horns', hornC: '#1a1822', back: 'shell', shoulder: '#2a2632', wfx: 'lava', aura: 'smoke' } },
  ls_plum: { char: 'lingshuang', rarity: 'rare', name: '红梅', look: { scarf: '#e0365a', slash: '255,110,140', blade: '#ffe3ea' }, deco: { head: 'flower', flower: '#e0365a', trail: 'petal', petal: '255,120,150' } },
  ls_aurora: { char: 'lingshuang', rarity: 'legend', name: '极光', look: { body: '#dff8f4', shade: '#7fb7c0', scarf: '#5ef2c9', slash: '120,255,210', blade: '#e9fffa' }, deco: { head: 'circlet', gem: '#7dffd8', back: 'aurora', wfx: 'frost', trail: 'snow', aura: 'aurora' } },
  ly_dusk: { char: 'liuyun', rarity: 'rare', name: '晚霞', look: { scarf: '#ff8a4a', slash: '255,160,100' }, deco: { head: 'douli', cape: '#c8602a', trail: 'leaf', leaf: '255,150,80' } },
  ly_sky: { char: 'liuyun', rarity: 'legend', name: '天青', look: { body: '#eaf6ff', shade: '#8fb4d6', scarf: '#56b8ff', slash: '130,200,255', blade: '#f0faff' }, deco: { head: 'plume', plumeC: ['#ffffff', '#bfe2ff'], back: 'clouds', cape: '#cfe8ff', trail: 'feather', aura: 'cloud' } },
  lm_violet: { char: 'leiming', rarity: 'rare', name: '紫电', look: { scarf: '#9a5cff', slash: '185,140,255' }, deco: { head: 'headband', band: '#9a5cff', wfx: 'lightning', trail: 'spark' } },
  lm_sun: { char: 'leiming', rarity: 'legend', name: '烈阳', look: { body: '#ffe7c2', shade: '#d08a3a', scarf: '#ff6a1a', slash: '255,150,60', blade: '#fff0dc' }, deco: { head: 'crown', back: 'sundisk', wfx: 'flame', trail: 'ember', aura: 'ember' } },
  my_cinnabar: { char: 'moyu', rarity: 'rare', name: '朱砂', look: { scarf: '#c8321e', slash: '230,80,60' }, deco: { head: 'douli', wfx: 'ink', trail: 'ink', inkC: '200,50,30' } },
  my_gold: { char: 'moyu', rarity: 'legend', name: '泥金', look: { body: '#f5ead0', shade: '#b39a5c', scarf: '#d8b04a', slash: '235,200,110', blade: '#fff4d6' }, deco: { head: 'hood', hoodC: '#6a5220', back: 'lotus', wfx: 'gold', trail: 'gold', aura: 'gold' } },
  yh_sakura: { char: 'yuehua', rarity: 'rare', name: '樱月', look: { scarf: '#ff9ec4', slash: '255,170,210', blade: '#fff0f6' }, deco: { head: 'flower', flower: '#ff9ec4', trail: 'petal', petal: '255,180,210' } },
  yh_eclipse: { char: 'yuehua', rarity: 'legend', name: '月蚀', look: { body: '#2c2238', shade: '#140e1c', scarf: '#c13a4a', slash: '230,90,110', blade: '#ffd8de' }, deco: { head: 'hood', hoodC: '#1c1024', back: 'eclipse', cape: '#1c1024', wfx: 'shadow', trail: 'smoke', aura: 'smoke' } },
  yl_raven: { char: 'yanling', rarity: 'rare', name: '玄羽', look: { body: '#2c2c36', shade: '#14141a', scarf: '#8a8aa6', slash: '170,170,200', blade: '#e0e0ee' }, deco: { head: 'hood', hoodC: '#16161e', trail: 'feather', featherC: '40,40,55' } },
  qf_qfx: { char: 'qingfeng', rarity: 'legend', name: '青锋行', exclusive: true, look: { body: '#f6f2e8', shade: '#9db3aa', scarf: '#c8321e', slash: '120,220,190', blade: '#eafff8' }, deco: { head: 'headband', band: '#c8321e', back: 'clouds', cape: '#1f6f62', trail: 'leaf', leaf: '150,235,200', aura: 'cloud' } },
  yl_phoenix: { char: 'yanling', rarity: 'legend', name: '凤羽', look: { body: '#fff0d8', shade: '#d6874a', scarf: '#ff5a2a', slash: '255,130,60', blade: '#fff2e0' }, deco: { head: 'plume', plumeC: ['#ff7a2a', '#ffd25a'], cape: '#e8552a', wfx: 'flame', trail: 'ember', aura: 'ember' } },
};
// ======================= 皮肤场景和特效：稀有皮肤换天色、天气和命中特效，传说皮肤整个场景都换 =======================
// sky 天空渐变 orb 天上的月亮/太阳 mist 雾色 mtn 远山 bam 竹林 wx 天气 hit 命中图案 hitC 命中颜色 stars 星星多少 rays 光柱
const SCENES = {
  qf_frost: { sky: ['#08101f', '#152a48', '#2c4a6a', '#1c2c40'], orb: 'moon', orbC: '220,240,255', mist: '180,220,255', mtn: ['#1c2c4a', '#142238'], bam: ['#0c1424', '#081020'], wx: 'snow', wxC: '230,245,255', hit: 'snowflake', hitC: '200,240,255' },
  qf_qfx: { sky: ['#120e16', '#3a2836', '#a65e5e', '#3c2630'], orb: 'moon', orbC: '255,232,214', mist: '235,200,200', mtn: ['#2a2232', '#1a1622'], bam: ['#0c1a14', '#06100a'], wx: 'petal', wxC: '255,190,210', hit: 'leaves', hitC: '140,230,200', stars: 0.4 },
  qf_gold: { sky: ['#1a0a08', '#4a1a10', '#b0561e', '#5a2410'], orb: 'sun', orbC: '255,190,80', mist: '255,170,90', mtn: ['#4a2014', '#2e140c'], bam: ['#1c0a06', '#120604'], wx: 'ember', wxC: '255,170,70', hit: 'sunburst', hitC: '255,200,90', stars: 0.15, rays: true },
  fy_jade: { sky: ['#06140f', '#0f2e26', '#1f4a3c', '#12261e'], orb: 'moon', orbC: '205,255,232', mist: '120,230,180', mtn: ['#12302a', '#0c221c'], bam: ['#081812', '#04100c'], wx: 'leaf', wxC: '90,220,160', hit: 'leaves', hitC: '90,230,170' },
  fy_blood: { sky: ['#0a0204', '#2a0610', '#5a0c1a', '#2a060c'], orb: 'bloodmoon', orbC: '230,40,60', mist: '200,40,60', mtn: ['#2a0810', '#1a0408'], bam: ['#120206', '#0a0104'], wx: 'ash', wxC: '255,80,90', hit: 'crescent', hitC: '255,60,80', stars: 0.4, rays: true },
  ts_bronze: { sky: ['#120c06', '#2e2214', '#54402a', '#2a2014'], orb: 'moon', orbC: '255,215,160', mist: '220,180,120', mtn: ['#3a2c1a', '#281e12'], bam: ['#16100a', '#0e0a06'], wx: 'dust', wxC: '220,180,120', hit: 'shards', hitC: '210,170,100' },
  ts_obsidian: { sky: ['#06040e', '#160e2e', '#2e1a4a', '#160e22'], orb: 'rift', orbC: '150,120,255', mist: '140,110,255', mtn: ['#1e1636', '#140e26'], bam: ['#0a0614', '#06040c'], wx: 'lava', wxC: '255,130,70', hit: 'hexagon', hitC: '160,130,255', rays: true },
  ls_plum: { sky: ['#120610', '#2a1028', '#4a1a38', '#2a0e20'], orb: 'moon', orbC: '255,215,225', mist: '255,140,170', wx: 'petal', wxC: '230,60,90', hit: 'flower', hitC: '255,110,140' },
  ls_aurora: { sky: ['#020a10', '#062030', '#0c3a44', '#081c22'], orb: 'aurora', orbC: '120,255,210', mist: '120,255,210', mtn: ['#0c2a30', '#081c20'], bam: ['#04121a', '#020a10'], wx: 'snow', wxC: '200,255,240', hit: 'snowflake', hitC: '120,255,210' },
  ly_dusk: { sky: ['#140a10', '#40182a', '#9a4a30', '#40201a'], orb: 'moon', orbC: '255,190,140', mist: '255,150,90', mtn: ['#3a1c22', '#2a1218'], wx: 'leaf', wxC: '255,140,70', hit: 'leaves', hitC: '255,160,100' },
  ly_sky: { sky: ['#0a1a34', '#24507e', '#6aa0cc', '#335f86'], orb: 'cloudsun', orbC: '240,250,255', mist: '230,245,255', mtn: ['#3a5a80', '#2a4868'], bam: ['#16304a', '#0e2238'], wx: 'feather', wxC: '240,248,255', hit: 'swirl', hitC: '160,215,255', stars: 0, rays: true },
  lm_violet: { sky: ['#08061a', '#1c1240', '#34205e', '#1c1236'], orb: 'moon', orbC: '215,190,255', mist: '170,130,255', wx: 'spark', wxC: '200,160,255', hit: 'bolt', hitC: '190,150,255', storm: true },
  lm_sun: { sky: ['#180804', '#501808', '#c2501a', '#5a200a'], orb: 'sun', orbC: '255,150,60', mist: '255,140,60', mtn: ['#4a1a0a', '#301006'], bam: ['#1a0804', '#100402'], wx: 'ember', wxC: '255,140,50', hit: 'sunburst', hitC: '255,150,60', stars: 0.1, rays: true },
  my_cinnabar: { sky: ['#100808', '#2a1414', '#4a2420', '#241010'], orb: 'moon', orbC: '255,190,170', mist: '220,90,70', wx: 'ink', wxC: '200,50,30', hit: 'enso', hitC: '210,60,40' },
  my_gold: { sky: ['#120c04', '#3a2a10', '#8a6a2a', '#3a2a10'], orb: 'lotus', orbC: '255,215,120', mist: '255,215,140', mtn: ['#3a2c14', '#2a1e0c'], bam: ['#161006', '#0e0a04'], wx: 'gold', wxC: '255,220,130', hit: 'lotus', hitC: '255,215,120', rays: true },
  yh_sakura: { sky: ['#120818', '#2e1436', '#52244c', '#2a1230'], orb: 'moon', orbC: '255,222,236', mist: '255,170,210', wx: 'petal', wxC: '255,175,205', hit: 'flower', hitC: '255,170,210' },
  yh_eclipse: { sky: ['#040206', '#14060e', '#300a18', '#12040a'], orb: 'eclipse', orbC: '230,80,100', mist: '200,60,90', mtn: ['#200810', '#14040a'], bam: ['#0c0206', '#060104'], wx: 'ash', wxC: '230,90,110', hit: 'crescent', hitC: '230,90,110', stars: 0.6, rays: true },
  yl_raven: { sky: ['#08090e', '#181a24', '#2c2e3c', '#16171e'], orb: 'moon', orbC: '225,225,240', mist: '170,170,200', mtn: ['#22232e', '#181922'], wx: 'feather', wxC: '175,175,200', hit: 'feathers', hitC: '180,180,210' },
  yl_phoenix: { sky: ['#160604', '#4a1206', '#b23a12', '#501806'], orb: 'phoenix', orbC: '255,130,60', mist: '255,120,60', mtn: ['#4a160a', '#300c06'], bam: ['#1a0604', '#100302'], wx: 'ember', wxC: '255,150,60', hit: 'feathers', hitC: '255,140,60', stars: 0.1, rays: true },
};
const SCN_DEF = { mtn: ['#241f48', '#1a1636'], bam: ['#110f26', '#0b0a1c'], mist: '190,160,220' };
const WX_RISE = { ember: 1, gold: 1, lava: 1 };
let SCN = null;   // 这一场的场景（null 是默认的月夜竹林）
function sceneOf(k) { const T = k && SCENES[k], S = k && SKINS[k]; return T && S ? { ...T, key: k, legend: S.rarity === 'legend', name: S.name } : null; }
// 两边都有皮肤时，用稀有度高的；一样高用自己的
function pickScene() {
  SCN = null;
  const me = localIdx();
  for (const i of [me, 1 - me]) {
    const f = [A, B][i]; if (!f || f.dummy) continue;
    const T = sceneOf(f.skinKey);
    if (T && (!SCN || (T.legend && !SCN.legend))) SCN = T;
  }
}
// ---------- 小图形：天气和命中碎片 ----------
function drawShape(kind, s, rgb, a) {
  const c = `rgba(${rgb},${a})`;
  ctx.fillStyle = c; ctx.strokeStyle = c;
  if (kind === 'snow') { ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, 7); ctx.fill(); if (s > 3) { ctx.lineWidth = 0.8; for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-s * 1.4, 0); ctx.lineTo(s * 1.4, 0); ctx.stroke(); } } }
  else if (kind === 'petal') { ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.quadraticCurveTo(s * 1.1, -s * 0.2, 0, s * 1.2); ctx.quadraticCurveTo(-s * 1.1, -s * 0.2, 0, -s * 1.3); ctx.fill(); }
  else if (kind === 'leaf') { ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.quadraticCurveTo(s * 1.1, 0, 0, s * 1.6); ctx.quadraticCurveTo(-s * 1.1, 0, 0, -s * 1.6); ctx.fill(); ctx.strokeStyle = `rgba(0,0,0,${a * 0.35})`; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, -s * 1.4); ctx.lineTo(0, s * 1.4); ctx.stroke(); }
  else if (kind === 'feather') { ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(0, -s * 2.4); ctx.quadraticCurveTo(s * 0.4, 0, 0, s * 2.4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -s * 2.2); ctx.quadraticCurveTo(s * 1.3, -s * 0.6, s * 0.2, s * 1.6); ctx.quadraticCurveTo(-s * 1.1, -s * 0.2, 0, -s * 2.2); ctx.globalAlpha *= 0.7; ctx.fill(); ctx.globalAlpha /= 0.7; }
  else if (kind === 'ink') { ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.quadraticCurveTo(s, s * 0.2, 0, s); ctx.quadraticCurveTo(-s, s * 0.2, 0, -s * 1.6); ctx.fill(); }
  else if (kind === 'ash') { ctx.fillRect(-s * 0.6, -s * 0.4, s * 1.2, s * 0.8); }
  else if (kind === 'dust') { ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, 7); ctx.fill(); }
  else if (kind === 'spark') { ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-s, -s * 1.5); ctx.lineTo(s * 0.3, -s * 0.2); ctx.lineTo(-s * 0.3, s * 0.2); ctx.lineTo(s, s * 1.5); ctx.stroke(); }
  else {   // ember gold lava：会发光的小点
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.2); g.addColorStop(0, `rgba(255,250,230,${a})`); g.addColorStop(0.35, c); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(-s * 2.2, -s * 2.2, s * 4.4, s * 4.4);
    if (kind === 'gold' && s > 2) { ctx.strokeStyle = `rgba(255,250,220,${a})`; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-s * 2.5, 0); ctx.lineTo(s * 2.5, 0); ctx.moveTo(0, -s * 2.5); ctx.lineTo(0, s * 2.5); ctx.stroke(); }
  }
}
// ---------- 命中图案：以命中点为中心，放大并淡出 ----------
function drawGlyph(kind, r, rgb, a) {
  const c = `rgba(${rgb},${a})`, w = `rgba(255,255,255,${a * 0.8})`;
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const arms = (n, f) => { for (let k = 0; k < n; k++) { ctx.save(); ctx.rotate(k * Math.PI * 2 / n); f(); ctx.restore(); } };
  if (kind === 'snowflake') arms(6, () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r, 0); for (const q of [0.45, 0.72]) { ctx.moveTo(r * q, 0); ctx.lineTo(r * (q + 0.16), r * 0.16); ctx.moveTo(r * q, 0); ctx.lineTo(r * (q + 0.16), -r * 0.16); } ctx.stroke(); });
  else if (kind === 'sunburst') { ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, 7); ctx.stroke(); arms(12, () => { ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.06); ctx.lineTo(r, 0); ctx.lineTo(r * 0.5, r * 0.06); ctx.fill(); }); }
  else if (kind === 'crescent') { ctx.beginPath(); ctx.arc(0, 0, r * 0.8, -2.2, 2.2); ctx.arc(r * 0.35, 0, r * 0.62, 2.0, -2.0, true); ctx.closePath(); ctx.fill(); ctx.strokeStyle = w; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); }
  else if (kind === 'hexagon') { for (const q of [1, 0.55]) { ctx.beginPath(); for (let k = 0; k <= 6; k++) { const an = k * Math.PI / 3; ctx.lineTo(Math.cos(an) * r * q, Math.sin(an) * r * q); } ctx.stroke(); } arms(6, () => { ctx.beginPath(); ctx.moveTo(r * 0.55, 0); ctx.lineTo(r, 0); ctx.stroke(); }); }
  else if (kind === 'flower') { arms(5, () => { ctx.beginPath(); ctx.ellipse(r * 0.48, 0, r * 0.42, r * 0.24, 0, 0, 7); ctx.stroke(); }); ctx.fillStyle = w; ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, 7); ctx.fill(); }
  else if (kind === 'leaves') arms(3, () => { ctx.beginPath(); ctx.moveTo(r * 0.1, 0); ctx.quadraticCurveTo(r * 0.55, -r * 0.32, r, 0); ctx.quadraticCurveTo(r * 0.55, r * 0.32, r * 0.1, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r * 0.15, 0); ctx.lineTo(r * 0.9, 0); ctx.stroke(); });
  else if (kind === 'swirl') arms(3, () => { ctx.beginPath(); for (let k = 0; k <= 24; k++) { const q = k / 24; ctx.lineTo(Math.cos(q * 4) * r * q, Math.sin(q * 4) * r * q); } ctx.stroke(); });
  else if (kind === 'bolt') { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 7); ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.8); ctx.lineTo(r * 0.15, -r * 0.1); ctx.lineTo(-r * 0.15, r * 0.05); ctx.lineTo(r * 0.25, r * 0.8); ctx.stroke(); }
  else if (kind === 'enso') { for (let k = 0; k < 18; k++) { const a0 = 0.4 + k * 0.3; ctx.lineWidth = 2 + 5 * Math.sin(k / 17 * Math.PI); ctx.beginPath(); ctx.arc(0, 0, r * 0.8, a0, a0 + 0.32); ctx.stroke(); } }
  else if (kind === 'lotus') { for (let k = -3; k <= 3; k++) { ctx.save(); ctx.rotate(k * 0.36); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.3, -r * 0.5, 0, -r); ctx.quadraticCurveTo(-r * 0.3, -r * 0.5, 0, 0); ctx.stroke(); ctx.restore(); } ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0.3, Math.PI - 0.3); ctx.stroke(); }
  else if (kind === 'shards') arms(5, () => { ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 0.1); ctx.lineTo(r, 0); ctx.lineTo(r * 0.35, r * 0.1); ctx.closePath(); ctx.fill(); });
  else if (kind === 'feathers') arms(5, () => { ctx.save(); ctx.translate(r * 0.55, 0); ctx.rotate(Math.PI / 2); drawShape('feather', r * 0.2, rgb, a); ctx.restore(); });
}
// ---------- 天上的东西：月亮、太阳、血月、日蚀、极光、金莲、裂月、云日、凤凰 ----------
function drawOrb(T, mx, my, mr, t) {
  const o = T ? T.orb : 'moon', c = T ? T.orbC : '255,236,210';
  const glow = (r0, r1, a) => { const g = ctx.createRadialGradient(mx, my, r0, mx, my, r1); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.fillRect(mx - r1, my - r1, r1 * 2, r1 * 2); };
  const disk = (fill, r = mr) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill(); };
  if (o === 'sun' || o === 'phoenix') {
    glow(mr * 0.5, mr * 6, 0.45);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(t * 0.05); ctx.fillStyle = `rgba(${c},0.18)`;
    for (let k = 0; k < 16; k++) { ctx.rotate(Math.PI / 8); ctx.beginPath(); ctx.moveTo(mr * 1.1, -mr * 0.12); ctx.lineTo(mr * (2.4 + (k % 2) * 0.8), 0); ctx.lineTo(mr * 1.1, mr * 0.12); ctx.fill(); }
    ctx.restore();
    if (o === 'phoenix') {   // 凤凰：太阳两侧展开火焰翅膀
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
        const f = Math.sin(t * 1.5 + k) * 0.06;
        ctx.fillStyle = `rgba(255,${120 + k * 22},60,${0.32 - k * 0.04})`;
        ctx.beginPath(); ctx.moveTo(mx + s * mr * 0.6, my);
        ctx.quadraticCurveTo(mx + s * mr * (2 + k * 0.5), my - mr * (1.6 - k * 0.15 + f * 10), mx + s * mr * (3.2 + k * 0.6), my - mr * (0.4 - k * 0.3));
        ctx.quadraticCurveTo(mx + s * mr * (1.8 + k * 0.3), my - mr * 0.2, mx + s * mr * 0.6, my + mr * 0.3); ctx.fill();
      }
    }
    const g = ctx.createRadialGradient(mx - mr * 0.2, my - mr * 0.2, 0, mx, my, mr); g.addColorStop(0, '#fffbe8'); g.addColorStop(0.6, `rgb(${c})`); g.addColorStop(1, `rgba(${c},0.9)`);
    disk(g);
  } else if (o === 'bloodmoon') {
    glow(mr * 0.6, mr * 5, 0.4);
    disk(`rgb(${c})`);
    ctx.fillStyle = 'rgba(60,0,10,0.35)'; [[-0.3, -0.2, 0.25], [0.28, 0.18, 0.32], [-0.05, 0.42, 0.14]].forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(mx + a * mr, my + b * mr, r * mr, 0, 7); ctx.fill(); });
    ctx.strokeStyle = 'rgba(20,0,4,0.7)'; ctx.lineWidth = mr * 0.05;   // 划过月面的黑云
    for (let k = 0; k < 3; k++) { const yy = my - mr * 0.5 + k * mr * 0.5, dx = Math.sin(t * 0.2 + k) * mr * 0.3; ctx.beginPath(); ctx.moveTo(mx - mr * 1.6 + dx, yy); ctx.quadraticCurveTo(mx + dx, yy - mr * 0.15, mx + mr * 1.6 + dx, yy + mr * 0.05); ctx.stroke(); }
  } else if (o === 'eclipse') {
    glow(mr * 0.9, mr * 4.5, 0.5);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(t * 0.08); ctx.strokeStyle = `rgba(${c},0.35)`; ctx.lineWidth = 1.5;
    for (let k = 0; k < 40; k++) { ctx.rotate(Math.PI / 20); ctx.beginPath(); ctx.moveTo(mr * 1.02, 0); ctx.lineTo(mr * (1.3 + hash(k) * 0.9), 0); ctx.stroke(); }
    ctx.restore();
    disk(`rgba(255,220,225,0.95)`, mr * 1.04); disk('#050206', mr);
  } else if (o === 'rift') {   // 裂月：紫色月亮，熔岩裂纹在发光
    glow(mr * 0.6, mr * 4.5, 0.38);
    disk('#cfc6f2');
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.clip();
    ctx.strokeStyle = `rgba(255,${130 + Math.sin(t * 2) * 50 | 0},70,0.9)`; ctx.lineWidth = mr * 0.045;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); let x = mx + (hash(k) - 0.5) * mr * 0.4, y = my + (hash(k + 3) - 0.5) * mr * 0.4; ctx.moveTo(x, y); for (let n = 0; n < 4; n++) { const an = k * 1.26 + (hash(k * 7 + n) - 0.5); x += Math.cos(an) * mr * 0.35; y += Math.sin(an) * mr * 0.35; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.restore();
  } else if (o === 'lotus') {   // 金莲托月
    glow(mr * 0.6, mr * 5, 0.42);
    for (let k = -4; k <= 4; k++) {
      ctx.save(); ctx.translate(mx, my + mr * 1.05); ctx.rotate(k * 0.3 + Math.sin(t * 0.6) * 0.02);
      const L = mr * (1.35 - Math.abs(k) * 0.1);
      const g = ctx.createLinearGradient(0, 0, 0, -L); g.addColorStop(0, `rgba(${c},0.75)`); g.addColorStop(1, 'rgba(255,245,215,0.25)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.42, -L * 0.55, 0, -L); ctx.quadraticCurveTo(-L * 0.42, -L * 0.55, 0, 0); ctx.fill(); ctx.restore();
    }
    disk('#fff2cc', mr * 0.86);
  } else if (o === 'cloudsun') {
    glow(mr * 0.5, mr * 6, 0.4);
    disk('#fbfdff', mr * 0.9);
    for (let k = 0; k < 4; k++) {   // 飘过的云带
      const yy = my + mr * (0.4 + k * 0.55), xx = mx + ((t * (8 + k * 4) + k * 140) % (mr * 9)) - mr * 4.5;
      ctx.fillStyle = `rgba(255,255,255,${0.3 - k * 0.05})`; ctx.beginPath(); ctx.ellipse(xx, yy, mr * (2 + k * 0.5), mr * 0.22, 0, 0, 7); ctx.fill();
    }
  } else {
    glow(mr * 0.6, mr * 4, 0.32);
    disk(T ? `rgb(${T.orbC})` : '#f7ecd8');
    ctx.fillStyle = 'rgba(150,130,160,0.12)';
    [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.3], [-0.05, 0.4, 0.12]].forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(mx + a * mr, my + b * mr, r * mr, 0, 7); ctx.fill(); });
  }
  if (o === 'aurora') {   // 极光：三条光带在天上飘
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cols = ['120,255,210', '90,200,255', '190,120,255'];
    for (let k = 0; k < 3; k++) {
      const base = my - mr * (0.2 - k * 0.5), amp = mr * 0.5;
      ctx.beginPath();
      for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, base + Math.sin(x / (mr * 2.2) + t * 0.4 + k * 1.7) * amp);
      for (let x = W + 20; x >= 0; x -= 20) ctx.lineTo(x, base + Math.sin(x / (mr * 2.2) + t * 0.4 + k * 1.7) * amp + mr * (1.4 + Math.sin(x / 90 + k) * 0.4));
      const g = ctx.createLinearGradient(0, base - amp, 0, base + mr * 2.2); g.addColorStop(0, `rgba(${cols[k]},0)`); g.addColorStop(0.4, `rgba(${cols[k]},0.3)`); g.addColorStop(1, `rgba(${cols[k]},0)`);
      ctx.fillStyle = g; ctx.fill();
    }
    ctx.restore();
  }
}
// 光柱：从天上斜照下来的几道光（传说场景）
function drawRays(T, mx, my) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 5; k++) {
    const an = 1.75 + (k - 2) * 0.17 + Math.sin(clock * 0.15 + k) * 0.03, len = H * 1.3, w = 0.05 + hash(k + 4) * 0.05;
    const g = ctx.createLinearGradient(mx, my, mx + Math.cos(an) * len, my + Math.sin(an) * len);
    g.addColorStop(0, `rgba(${T.orbC},${0.09 + 0.03 * Math.sin(clock * 0.7 + k)})`); g.addColorStop(1, `rgba(${T.orbC},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(an - w) * len, my + Math.sin(an - w) * len); ctx.lineTo(mx + Math.cos(an + w) * len, my + Math.sin(an + w) * len); ctx.fill();
  }
  ctx.restore();
}
// 天气：按时间算出位置，不用存状态（世界坐标里画，跟着镜头）
function drawWeather(T, sc) {
  const n = Math.round((T.legend ? 90 : 42) * (SETTINGS.quality === 'low' ? 0.4 : SETTINGS.quality === 'mid' ? 0.7 : 1)), spanX = W / sc + 200, top = -groundY() / sc - 60, spanY = -top + 30, rise = WX_RISE[T.wx];
  for (let i = 0; i < n; i++) {
    const sp = (T.wx === 'snow' ? 50 : T.wx === 'ink' ? 160 : rise ? 45 : 60) * (0.6 + hash(i + 3) * 0.8), dr = T.wx === 'spark' ? 0 : -25 + hash(i + 8) * 20;
    let y = (hash(i + 1) * spanY + sp * clock) % spanY; y = rise ? 20 - y : top + y;
    const x = cam.x - spanX / 2 + ((hash(i) * spanX + dr * clock + Math.sin(clock * (0.6 + hash(i + 5)) + i) * 30) % spanX + spanX) % spanX;
    const s = (T.legend ? 2 : 1.6) + hash(i + 7) * 2.4, near = hash(i + 9);
    let a = 0.35 + near * 0.55;
    if (T.wx === 'spark') { a *= Math.max(0, Math.sin(clock * 6 + i * 3.7)) ** 6; if (a < 0.02) continue; }
    if (rise) a *= clamp((20 - y) / 120, 0, 1) * clamp((y - top) / 150, 0, 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(clock * (hash(i + 2) - 0.5) * 3 + i);
    if (rise || T.wx === 'spark') ctx.globalCompositeOperation = 'lighter';
    drawShape(T.wx, s * (0.7 + near * 0.6), T.wxC, a);
    ctx.restore();
  }
}
// 命中特效：稀有皮肤飞出主题碎片 + 小图案；传说皮肤图案更大、碎片更多、多一圈光环
function skinHitFX(atk, ev) {
  const T = sceneOf(atk.skinKey); if (!T) return;
  const n = T.legend ? 12 : 6;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(120, 360) * (T.legend ? 1.2 : 1);
    addP({ type: 'shape', sh: T.wx, x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, g: WX_RISE[T.wx] ? -120 : 500, life: rand(0.45, 0.8), max: 0.8, r: rand(2.5, 4.5), rgb: T.wxC, spin: rand(-8, 8), drag: 3 });
  }
  if (T.legend || ev.dmg >= 5) addP({ type: 'glyph', g2: T.hit, x: ev.x, y: ev.y, r: (T.legend ? 62 : 38) * clamp(ev.dmg / 7, 0.7, 1.5), life: 0.42, max: 0.42, rgb: T.hitC, rot: rand(0, 6.28) });
  if (T.legend) ring(ev.x, ev.y, 90, T.hitC, 0.3);
}
// 开场亮相：传说皮肤身后升起大图案和名号，稀有皮肤显示名号
function skinIntroFX(f) {
  const T = sceneOf(f.skinKey); if (!T) return;
  addP({ type: 'text', text: `${T.legend ? '传说' : '稀有'} · ${T.name}`, x: f.x, y: f.y - 175, life: 2.2, max: 2.2, rgb: T.legend ? '233,196,106' : '150,200,255' });
  if (!T.legend) return;
  addP({ type: 'glyph', g2: T.hit, x: f.x, y: f.y - 70, r: 150, life: 1.6, max: 1.6, rgb: T.hitC, rot: 0, spin: 0.6 });
  for (let i = 0; i < 26; i++) addP({ type: 'shape', sh: T.wx, x: f.x + rand(-60, 60), y: rand(-10, 0), vx: rand(-80, 80), vy: rand(-520, -200), g: 260, life: rand(0.9, 1.6), max: 1.6, r: rand(2.5, 4.5), rgb: T.wxC, spin: rand(-6, 6), drag: 1.2 });
  ring(f.x, f.y - 60, 140, T.hitC, 0.6);
}
// 胜利：碎片像烟花一样喷出来
function skinVictoryFX(f) {
  const T = sceneOf(f.skinKey); if (!T) return;
  const n = T.legend ? 40 : 16;
  for (let i = 0; i < n; i++) { const a = rand(-Math.PI * 0.85, -Math.PI * 0.15), v = rand(250, 650); addP({ type: 'shape', sh: T.wx, x: f.x, y: f.y - 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 420, life: rand(1, 1.8), max: 1.8, r: rand(2.5, 5), rgb: T.wxC, spin: rand(-8, 8), drag: 1.5 }); }
  if (T.legend) addP({ type: 'glyph', g2: T.hit, x: f.x, y: f.y - 80, r: 130, life: 1.4, max: 1.4, rgb: T.hitC, rot: 0, spin: -0.5 });
}
// 卡面和图鉴演示用：在一块画布里画出整个皮肤场景
function paintSceneCard(CW, CH, T, t, u) {
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  T.sky.forEach((c, k) => bg.addColorStop([0, 0.45, 0.75, 1][k], c));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40 * (T.stars === undefined ? 1 : T.stars); i++) { ctx.globalAlpha = 0.25 + 0.5 * hash(i + 30); ctx.fillRect(hash(i) * CW, hash(i + 50) * CH * 0.5, 1.2 * u, 1.2 * u); }
  ctx.globalAlpha = 1;
  const keepW = W; W = CW;   // 极光按画布宽度画
  drawOrb(T, CW * 0.66, CH * 0.24, Math.min(CW, CH) * 0.13, t);
  W = keepW;
  const mt = T.mtn || SCN_DEF.mtn;
  [[0.62, 22, mt[0], 1.3], [0.72, 14, mt[1], 4.7]].forEach(([b, amp, col, sd]) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, CH); for (let x = 0; x <= CW; x += 6 * u) ctx.lineTo(x, CH * b - Math.sin(x / (40 * u) + sd) * amp * u - Math.sin(x / (17 * u) + sd * 2) * amp * 0.4 * u); ctx.lineTo(CW, CH); ctx.fill(); });
  const mist = ctx.createLinearGradient(0, CH * 0.5, 0, CH); mist.addColorStop(0, `rgba(${T.mist},0)`); mist.addColorStop(1, `rgba(${T.mist},0.22)`); ctx.fillStyle = mist; ctx.fillRect(0, CH * 0.5, CW, CH * 0.5);
  for (let i = 0; i < (T.legend ? 34 : 18); i++) {
    const rise = WX_RISE[T.wx], y = ((hash(i + 1) * CH + (rise ? -1 : 1) * 30 * u * t * (0.6 + hash(i + 3))) % CH + CH) % CH;
    ctx.save(); ctx.translate(hash(i) * CW + Math.sin(t + i) * 8 * u, y); ctx.rotate(t * (hash(i + 2) - 0.5) * 2 + i);
    if (rise || T.wx === 'spark') ctx.globalCompositeOperation = 'lighter';
    drawShape(T.wx, (1.6 + hash(i + 7) * 2.6) * u, T.wxC, 0.4 + hash(i + 9) * 0.5); ctx.restore();
  }
}
const PROF = {
  loaded: false,
  guest: true,
  ink: 500,
  owned: ['qingfeng'],
  frags: {},
  pity: 0,
  welfare: 1,
  tutorial: 0,
  rank: null,
  rotation: getWeeklyRotation(),
  rates: DEFAULT_RATES,
  daily: [],
  weekly: [],
  skins: [],
  equip: {},
  spity: 0,
  netWins: 0,
  netLosses: 0,
  online10Unlocked: false
};
const MSTAT = { maxcombo: 0, ults: 0 };
function toast(t) { const el = $id('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.tm); toast.tm = setTimeout(() => el.classList.remove('on'), 2600); }
// 能用的角色：已拥有 + 本周限免。单机离线版全部能用；在线网页版严格按解锁状态与限免判断
function availList() {
  if (OFFLINE_BUILD || DEV_SESSION_UNLOCKED) return CHARS.map((c, i) => i);
  const ok = new Set([...(PROF.owned || ['qingfeng']), ...(PROF.rotation || [])]);
  return CHARS.map((c, i) => i).filter(i => ok.has(CHARS[i].id));
}
function skinLook(ci, skin) {
  const sk = SKINS[skin];
  const ok = sk && sk.char === CHARS[ci].id;
  return { ...CHARS[ci].look, ...(ok ? sk.look : {}), name: CHARS[ci].name, legend: !!(ok && sk.rarity === 'legend'), deco: ok ? sk.deco || null : null };
}
function mySkin(id) { const k = (PROF.equip || {})[id]; return k && ((PROF.skins || []).includes(k) || OFFLINE_BUILD || DEV_SESSION_UNLOCKED) ? k : ''; }
function applySkins() {
  for (const f of [A, B]) {
    let k = '';
    if (M.mode === 'net') k = f.idx === localIdx() ? mySkin(f.ch.id) : ((NET.peerSkins || {})[f.ch.id] || '');
    else if (M.mode === 'cpu' || M.mode === 'train' || M.mode === 'forest') k = mySkin(f.ch.id);   // 对电脑时，电脑用到你装备了皮肤的角色也显示皮肤
    if (!f.dummy) f.look = skinLook(f.chIdx, k);
    f.skinKey = f.dummy ? '' : k;
  }
  pickScene();
}
async function loadProfile() {
  if (!SERVED || !window.fetch) return;
  try { const j = await api('/api/profile'); applyProfile(j.profile || j); } catch (e) {}
}
function applyProfile(p) {
  if (!p) return;
  if (p.guest) {
    const owned = Array.isArray(p.owned) ? p.owned : (PROF.owned || ['qingfeng']);
    const skins = Array.isArray(p.skins) ? p.skins : (PROF.skins || []);
    const equip = p.equip || PROF.equip || {};
    const ink = p.ink !== undefined ? p.ink : (PROF.ink || 0);
    Object.assign(PROF, {
      guest: true,
      ink: ink,
      owned: owned,
      frags: p.frags || PROF.frags || {},
      pity: p.pity || PROF.pity || 0,
      welfare: 1,
      rank: null,
      daily: [],
      weekly: [],
      skins: skins,
      equip: equip,
      spity: p.spity || PROF.spity || 0,
      rotation: p.rotation || PROF.rotation,
      rates: p.rates || PROF.rates
    });
  } else {
    Object.assign(PROF, p, { guest: false });
  }
  PROF.loaded = true;
  if (!OFFLINE_BUILD && !DEV_SESSION_UNLOCKED && PROF.equip) {
    const ownedSkins = new Set(PROF.skins || []);
    for (const [cid, sk] of Object.entries(PROF.equip)) {
      if (sk && !ownedSkins.has(sk)) delete PROF.equip[cid];
    }
  }
  renderAcc(); updateTutBtn();
  if (!PROF.guest && typeof qfxClaim === 'function' && qfxBest() > (PROF.qfx || 0)) setTimeout(() => qfxClaim(qfxBest()), 0);
  const eq = JSON.stringify(PROF.equip || {});
  if (eq !== applyProfile.eq) { applyProfile.eq = eq; if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); } }
  for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
  if ($id('gacha').classList.contains('on')) renderGacha();
  if ($id('tasks').classList.contains('on')) renderTasks();
  if ($id('netp').classList.contains('on')) renderRankLine();
  if (!PROF.guest && !PROF.welfare && $id('menu').classList.contains('on')) openWelfare();
}
// ---------- 新手福利 ----------
let wSel = -1;
function openWelfare() {
  ensurePortraits(); wSel = -1;
  $id('wGrid').innerHTML = CHARS.map((c, i) => PROF.owned.includes(c.id) ? '' : `<button data-i="${i}"><img src="${PORTRAITS[i] || ''}" alt=""><div class="wn" style="color:rgb(${c.look.slash})">${c.name}</div><div class="wr">${c.role} · ${RAR_NAME[CHAR_RARITY[c.id]]}</div></button>`).join('');
  $id('wGo').disabled = true; $id('wMsg').textContent = '';
  showScreen('welfare');
}
$id('wGrid').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; wSel = +b.dataset.i; for (const x of $id('wGrid').children) x.classList.toggle('sel', x === b); $id('wGo').disabled = false; });
$id('wGo').addEventListener('click', async () => {
  if (wSel < 0) return;
  const picked = CHARS[wSel].id;
  PROF.owned = Array.from(new Set([...(PROF.owned || ['qingfeng']), picked]));
  PROF.welfare = 1;
  if (window.CloudSave) CloudSave.saveProfile(PROF, true);
  applyProfile(PROF);
  toast(`新得角色：${CHARS[wSel].name}`);
  backToMenu();
});
// ---------- 问剑阁 ----------
let gTab = 'char', gBusy = false;
function rarPct(x) { return (Math.round(x * 1000) / 10) + '%'; }
function renderGacha() {
  ensurePortraits();
  for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
  for (const b of $id('gTabs').children) b.classList.toggle('sel', b.dataset.g === gTab);
  PROF.rates = PROF.rates || DEFAULT_RATES;
  const R = PROF.rates;
  const sk = gTab === 'skin', rs = R.skin;
  $id('gOne').textContent = `抽一次 · ${sk ? rs.cost : R.cost}`; $id('gTen').textContent = `十连 · ${sk ? rs.ten : R.ten}`;
  $id('gOne').disabled = $id('gTen').disabled = PROF.guest || gBusy;
  $id('gInfo').textContent = PROF.guest ? '登录之后，方可抽剑' : sk
    ? `再抽 ${Math.max(1, rs.pity + 1 - (PROF.spity || 0))} 次内必出一款新皮肤。只出你已拥有角色的皮肤——皮肤只改外观，不添战力。`
    : `再抽 ${Math.max(1, R.pity + 1 - (PROF.pity || 0))} 次内必出一个你没有的角色。稀有度越高，特效越华丽、招式越繁复（另带进阶技巧），但强度相近。`;
  const names = ids => ids.map(id => CHARS[CHAR_IDX[id]].name).join('、');
  $id('gRateBox').innerHTML = sk
    ? `传说皮肤 ${rarPct(rs.rate.legend)}　稀有皮肤 ${rarPct(rs.rate.rare)}——都只出你已拥有角色的皮肤　角色碎片 1 到 3 个 ${rarPct(1 - rs.rate.legend - rs.rate.rare)}（角色齐了便折算成 ${R.fragInk} 墨锭）<br>连抽 ${rs.pity} 次未见皮肤，下一次必出一款你尚未拥有的皮肤。重复的皮肤折算 ${rs.dup} 墨锭。`
    : `完整角色：传说 ${rarPct(R.full.legend)}（${names(R.pool.legend)}），稀有 ${rarPct(R.full.rare)}（${names(R.pool.rare)}），普通 ${rarPct(R.full.common)}（${names(R.pool.common)}）<br>角色碎片：传说 ${rarPct(R.frag.legend)}，稀有 ${rarPct(R.frag.rare)}，普通 ${rarPct(R.frag.common)}，每次 1 到 3 个<br>合成所需碎片：普通 ${R.craft.common}，稀有 ${R.craft.rare}，传说 ${R.craft.legend}。连抽 ${R.pity} 次未见角色，下一次必出一个你尚未拥有的角色。<br>抽到已有的角色折算 ${R.dup} 墨锭；已有角色的碎片，每个折算 ${R.fragInk} 墨锭。`;
  const rot = PROF.rotation || [];
  $id('gRoster').innerHTML = CHARS.map((c, i) => {
    const own = DEV_SESSION_UNLOCKED || PROF.owned.includes(c.id), rar = CHAR_RARITY[c.id], need = rar === 'starter' ? 0 : R.craft[rar], have = (PROF.frags || {})[c.id] || 0;
    const st = own ? '已拥有' : rot.includes(c.id) ? `本周限免 · 碎片 ${have}/${need}` : `碎片 ${have}/${need}`;
    return `<div class="gr${own ? '' : ' lock'}" style="border-color:rgba(${RAR_RGB[rar]},.5)"><img src="${PORTRAITS[i] || ''}" alt=""><div style="font-family:var(--title);font-size:17px;color:rgb(${c.look.slash})">${c.name}</div><div class="st">${RAR_NAME[rar]} · ${st}</div>${own ? '' : `<div class="bar"><i style="width:${Math.min(100, have / need * 100)}%"></i></div>`}${!own && have >= need && !PROF.guest ? `<button data-craft="${c.id}">合成</button>` : ''}</div>`;
  }).join('');
}
function gCard(r, big) {
  if (r.type === 'ink') return `<div class="gcard" style="--rc:${RAR_RGB.common};animation-delay:VAR"><div class="gn">墨锭</div><div class="gt">+${r.ink}</div></div>`;
  const ci = CHAR_IDX[r.char], c = CHARS[ci], rc = RAR_RGB[r.rarity];
  let img = PORTRAITS[ci] || '', name = c.name, tag;
  if (r.type === 'skin') { try { img = makeCardArt(ci, 180, 240, r.skin).toDataURL(); } catch (e) {} name = SKINS[r.skin].name; tag = `${RAR_NAME[r.rarity]}皮肤 · ${c.name}${r.dup ? ` · 重复 +${r.ink}` : ' · 新！'}`; }
  else if (r.type === 'char') tag = r.dup ? `重复 → +${r.ink} 墨锭` : `${RAR_NAME[r.rarity]}角色 · 新！`;
  else tag = r.ink ? `碎片 ×${r.n} → +${r.ink} 墨锭` : `碎片 ×${r.n}（${r.have}/${r.need}）`;
  return `<div class="gcard${r.type === 'frag' ? ' frag' : ''}${big ? ' big' : ''}" style="--rc:${rc};animation-delay:VAR"><img src="${img}" alt=""><div class="gn" style="color:rgb(${c.look.slash})">${name}</div><div class="gt">${tag}</div></div>`;
}
function clientDrawOne(sk) {
  const R = PROF.rates || DEFAULT_RATES;
  if (sk) {
    const rs = R.skin;
    const mine = Object.keys(SKINS).filter(k => (PROF.owned || []).includes(SKINS[k].char));
    const unowned = mine.filter(k => !(PROF.skins || []).includes(k));
    let pick = null;
    if ((PROF.spity || 0) >= rs.pity && unowned.length) {
      const leg = unowned.filter(k => SKINS[k].rarity === 'legend');
      pick = leg.length && Math.random() < 0.2 ? leg[Math.floor(Math.random() * leg.length)] : unowned[Math.floor(Math.random() * unowned.length)];
    } else {
      const r = Math.random();
      const rar = r < rs.rate.legend ? 'legend' : r < rs.rate.legend + rs.rate.rare ? 'rare' : null;
      const pool = rar ? mine.filter(k => SKINS[k].rarity === rar) : [];
      if (pool.length) pick = pool[Math.floor(Math.random() * pool.length)];
    }
    if (pick) {
      PROF.spity = 0;
      if ((PROF.skins || []).includes(pick)) {
        PROF.ink = (PROF.ink || 0) + rs.dup;
        return { type: 'skin', skin: pick, char: SKINS[pick].char, rarity: SKINS[pick].rarity, dup: true, ink: rs.dup };
      }
      PROF.skins = PROF.skins || [];
      PROF.skins.push(pick);
      return { type: 'skin', skin: pick, char: SKINS[pick].char, rarity: SKINS[pick].rarity, new: true };
    }
    PROF.spity = (PROF.spity || 0) + 1;
    const need = CHARS.map(c => c.id).filter(id => !(PROF.owned || []).includes(id));
    if (!need.length) {
      PROF.ink = (PROF.ink || 0) + R.fragInk;
      return { type: 'ink', ink: R.fragInk };
    }
    const c = need[Math.floor(Math.random() * need.length)];
    const amt = Math.random() < 0.6 ? 1 : Math.random() < 0.9 ? 2 : 3;
    PROF.frags = PROF.frags || {};
    PROF.frags[c] = (PROF.frags[c] || 0) + amt;
    return { type: 'frag', char: c, rarity: CHAR_RARITY[c], n: amt, have: PROF.frags[c], need: R.craft[CHAR_RARITY[c]] };
  }

  // 角色祈愿
  const pool = R.pool;
  const unownedChars = CHARS.map(c => c.id).filter(id => !(PROF.owned || []).includes(id));
  const fullR = Math.random();
  const forced = (PROF.pity || 0) >= R.pity && unownedChars.length > 0;
  const fullHit = forced || fullR < (R.full.legend + R.full.rare + R.full.common);

  if (fullHit) {
    let full = '';
    if (forced) {
      full = unownedChars[Math.floor(Math.random() * unownedChars.length)];
    } else {
      const rar = fullR < R.full.legend ? 'legend' : fullR < (R.full.legend + R.full.rare) ? 'rare' : 'common';
      const p = pool[rar];
      full = p[Math.floor(Math.random() * p.length)];
    }
    PROF.pity = 0;
    if ((PROF.owned || []).includes(full)) {
      PROF.ink = (PROF.ink || 0) + R.dup;
      return { type: 'char', char: full, rarity: CHAR_RARITY[full], dup: true, ink: R.dup };
    }
    PROF.owned = PROF.owned || [];
    PROF.owned.push(full);
    const leftFrags = (PROF.frags && PROF.frags[full]) || 0;
    if (PROF.frags) delete PROF.frags[full];
    const refundInk = leftFrags * R.fragInk;
    PROF.ink = (PROF.ink || 0) + refundInk;
    return { type: 'char', char: full, rarity: CHAR_RARITY[full], new: true, pity: forced, ink: refundInk };
  }

  // 碎片掉落
  PROF.pity = (PROF.pity || 0) + 1;
  const fragR = Math.random();
  const rar = fragR < 0.18 ? 'legend' : fragR < 0.5 ? 'rare' : 'common';
  const p = pool[rar];
  const c = p[Math.floor(Math.random() * p.length)];
  const n = Math.random() < 0.6 ? 1 : Math.random() < 0.9 ? 2 : 3;

  if ((PROF.owned || []).includes(c)) {
    const ink = n * R.fragInk;
    PROF.ink = (PROF.ink || 0) + ink;
    return { type: 'frag', char: c, rarity: rar, n, ink };
  }
  PROF.frags = PROF.frags || {};
  PROF.frags[c] = (PROF.frags[c] || 0) + n;
  return { type: 'frag', char: c, rarity: rar, n, have: PROF.frags[c], need: R.craft[rar] };
}

function clientGacha(n, sk) {
  const R = PROF.rates || DEFAULT_RATES;
  const cost = sk ? (n === 10 ? R.skin.ten : R.skin.cost) : (n === 10 ? R.ten : R.cost);
  if ((PROF.ink || 0) < cost) throw new Error(`囊中墨锭不够，需要 ${cost}`);
  PROF.ink -= cost;
  const results = [];
  for (let i = 0; i < n; i++) results.push(clientDrawOne(sk));
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  return { results, profile: PROF };
}

function clientCraft(charId) {
  const R = PROF.rates || DEFAULT_RATES;
  const rar = CHAR_RARITY[charId];
  if (!rar || rar === 'starter' || (PROF.owned || []).includes(charId)) {
    throw new Error('这个角色不能合成（已经拥有，或本就不能合）');
  }
  const need = R.craft[rar];
  const have = (PROF.frags && PROF.frags[charId]) || 0;
  if (have < need) throw new Error(`碎片不够，合成需要 ${need} 个（当前 ${have} 个）`);
  delete PROF.frags[charId];
  PROF.owned = PROF.owned || [];
  PROF.owned.push(charId);
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  return { got: charId, profile: PROF };
}

async function doGacha(n) {
  if (gBusy || PROF.guest) return;
  gBusy = true; renderGacha(); $id('gMsg').textContent = '';
  try {
    const j = clientGacha(n, gTab === 'skin');
    $id('gRes').innerHTML = j.results.map((r, k) => gCard(r, r.type !== 'frag' && r.type !== 'ink' && !r.dup).replace('VAR', (k * 0.14) + 's')).join('');
    const best = j.results.find(r => (r.type === 'char' || r.type === 'skin') && r.new);
    if (j.results.some(r => r.rarity === 'legend' && (r.type === 'char' || r.type === 'skin') && !r.dup)) playSting('legendary', true);
    setTimeout(() => { if (best) { SFX.gong(); toast(best.type === 'skin' ? `新得皮肤：${SKINS[best.skin].name}` : `新得角色：${CHARS[CHAR_IDX[best.char]].name}`); } else SFX.slice(); }, j.results.length * 140);
    applyProfile(j.profile || PROF);
  } catch (e) { $id('gMsg').textContent = e.message; }
  gBusy = false; renderGacha();
}
$id('gOne').addEventListener('click', () => doGacha(1));
$id('gTen').addEventListener('click', () => doGacha(10));
$id('gRates').addEventListener('click', () => $id('gRateBox').classList.toggle('hidden'));
$id('gTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { gTab = b.dataset.g; $id('gRes').innerHTML = ''; renderGacha(); } });
$id('gRoster').addEventListener('click', async e => {
  const b = e.target.closest('button[data-craft]'); if (!b) return;
  try {
    const j = clientCraft(b.dataset.craft);
    applyProfile(j.profile || PROF); SFX.gong(); toast(`合成成功：${CHARS[CHAR_IDX[b.dataset.craft]].name}`);
  } catch (err) { $id('gMsg').textContent = err.message; }
});
// ---------- 任务 ----------
function taskDest(name) {
  if (/排位|匹配|联机|好友/.test(name)) return 'netp';
  if (/青锋行|秘境|竹林/.test(name)) return 'forest';
  if (/人机|关卡/.test(name)) return 'cpu';
  if (/试炼|木人/.test(name)) return 'train';
  if (/图鉴|招式/.test(name)) return 'codex';
  return 'cpu';
}
function ensureClientTasks() {
  if (!Array.isArray(PROF.daily) || !PROF.daily.length) {
    PROF.daily = [
      { id: 'd1', name: '习武精进：进行 1 局对战', prog: 1, target: 1, reward: 30, claimed: false },
      { id: 'd2', name: '招式纯熟：打出 5 连击', prog: 0, target: 5, reward: 40, claimed: false },
      { id: 'd3', name: '破敌致胜：击败 1 名对手', prog: 0, target: 1, reward: 50, claimed: false }
    ];
  }
  if (!Array.isArray(PROF.weekly) || !PROF.weekly.length) {
    PROF.weekly = [
      { id: 'w1', name: '百炼成钢：进行 5 局切磋', prog: 0, target: 5, reward: 120, claimed: false },
      { id: 'w2', name: '名扬四海：赢得 3 场胜利', prog: 0, target: 3, reward: 180, claimed: false },
      { id: 'w3', name: '融会贯通：施展 5 次终极奥义', prog: 0, target: 5, reward: 200, claimed: false }
    ];
  }
}
function renderTasks() {
  ensureClientTasks();
  for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
  const row = t => {
    const dest = taskDest(t.name);
    const goBtn = (!t.claimed && t.prog < t.target) ? `<button class="ghost task-go" data-go="${dest}" style="margin-left:6px;padding:3px 8px;font-size:12px;">前往</button>` : '';
    return `<div class="trow"><span>${t.name}</span><div class="bar"><i style="width:${Math.min(100, t.prog / t.target * 100)}%"></i></div><span class="rw">+${t.reward}</span><div style="display:flex;align-items:center;"><button data-t="${t.id}" ${t.claimed || t.prog < t.target || PROF.guest ? 'disabled' : ''}>${t.claimed ? '已领取' : t.prog >= t.target ? '领取' : `${Math.floor(t.prog)}/${t.target}`}</button>${goBtn}</div></div>`;
  };
  $id('tDaily').innerHTML = PROF.guest ? '<p class="netnote">登录之后，方可领任务</p>' : (PROF.daily || []).map(row).join('');
  $id('tWeekly').innerHTML = PROF.guest ? '' : (PROF.weekly || []).map(row).join('');
  const canClaimAny = !PROF.guest && [...(PROF.daily || []), ...(PROF.weekly || [])].some(t => !t.claimed && t.prog >= t.target);
  if ($id('claimAllBtn')) {
    $id('claimAllBtn').classList.toggle('hidden', PROF.guest || !canClaimAny);
    $id('claimAllBtn').disabled = !canClaimAny;
  }
}
for (const id of ['tDaily', 'tWeekly']) $id(id).addEventListener('click', async e => {
  const go = e.target.closest('.task-go');
  if (go && go.dataset.go) {
    const dest = go.dataset.go;
    if (dest === 'forest') startForest();
    else if (dest === 'cpu') startMatch('cpu');
    else if (dest === 'train') startMatch('train');
    else menuGo(dest);
    return;
  }
  const b = e.target.closest('button[data-t]'); if (!b || b.disabled) return;
  const tid = b.dataset.t;
  const all = [...(PROF.daily || []), ...(PROF.weekly || [])];
  const t = all.find(x => x.id === tid);
  if (!t || t.claimed || t.prog < t.target) return;
  t.claimed = true;
  const gain = t.reward || 50;
  PROF.ink = (PROF.ink || 0) + gain;
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  applyProfile(PROF);
  SFX.chargeFull();
  toast(`+${gain} 墨锭`);
  renderTasks();
});
if ($id('claimAllBtn')) {
  $id('claimAllBtn').addEventListener('click', async () => {
    if (PROF.guest) return;
    const all = [...(PROF.daily || []), ...(PROF.weekly || [])].filter(t => !t.claimed && t.prog >= t.target);
    if (!all.length) return;
    let totalGain = 0;
    for (const t of all) {
      t.claimed = true;
      totalGain += (t.reward || 50);
    }
    PROF.ink = (PROF.ink || 0) + totalGain;
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    applyProfile(PROF);
    SFX.chargeFull();
    toast(`一键领取完成：+${totalGain} 墨锭`);
    renderTasks();
  });
}
async function redeemCode(rawCode) {
  const code = (rawCode !== undefined ? String(rawCode) : ($id('rdCode') ? $id('rdCode').value : '')).trim();
  if (!code) return;
  const up = code.toUpperCase();
  if (['LOCK', 'DEVLOCK', 'RELOCK'].includes(up)) {
    DEV_SESSION_UNLOCKED = false;
    try { sessionStorage.removeItem('renying-dev-unlock'); } catch (e) {}
    if ($id('rdCode')) $id('rdCode').value = '';
    SFX.thud();
    renderAcc();
    if (typeof BP !== 'undefined' && BP) renderBP();
    if (typeof renderCodex === 'function' && $id('codex').classList.contains('on')) renderCodex();
    if (typeof renderGacha === 'function' && $id('gacha').classList.contains('on')) renderGacha();
    if (typeof renderStages === 'function' && $id('single').classList.contains('on')) renderStages();
    if (typeof renderTrainPick === 'function') renderTrainPick();
    return;
  }
  const clientCodes = {
    'RENYING666': 300,
    'RENYING888': 500,
    'SWORD2026': 600,
    'MOYUGIFT': 400
  };
  if (clientCodes[up]) {
    const redeemed = (PROF.redeemedCodes = PROF.redeemedCodes || []);
    if (redeemed.includes(up)) {
      toast('该兑换码已使用过了');
      if ($id('tMsg')) $id('tMsg').textContent = '该兑换码已使用过了';
      return;
    }
    redeemed.push(up);
    const inkGain = clientCodes[up];
    PROF.ink = (PROF.ink || 0) + inkGain;
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    applyProfile(PROF);
    SFX.chargeFull();
    toast(`兑换成功：+${inkGain} 墨锭！`);
    if ($id('tMsg')) $id('tMsg').textContent = `兑换成功：+${inkGain} 墨锭！`;
    if ($id('rdCode')) $id('rdCode').value = '';
    renderTasks();
    return;
  }
  toast('兑换码无效或已过期');
  if ($id('tMsg')) $id('tMsg').textContent = '兑换码无效或已过期';
}
$id('rdBtn').addEventListener('click', () => redeemCode());
$id('rdCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') redeemCode(); });
window.redeemCode = redeemCode;
window.DEV_UNLOCK = () => triggerStealthDevUnlock();
window.DEV_LOCK = () => redeemCode('LOCK');
// ---------- 排位 ----------
function renderRankLine() {
  $id('rankLine').textContent = !SERVED ? '' : !ACC.name ? '排位赛需先登录' : PROF.rank ? `你的段位：${PROF.rank.label}${PROF.rank.tier ? '' : '（打满 5 场定级）'}` : '';
}
function rankUI(on) { const b = $id('rankBtn'); b.classList.toggle('searching', !!on); b.textContent = on ? '排位中… 点击取消' : '排位赛'; }
$id('rankBtn').addEventListener('click', () => {
  initAudio();
  if (!ACC.name) { netStatus('排位赛需先登录（右上角）'); return; }
  if ($id('rankBtn').classList.contains('searching') || NET.matching) { netReset(); netStatus('已取消排位'); return; }
  netConnect(false, null, true, null, true); rankUI(true);
});
function reportProgress(w) {
  if (SERVED && ACC.token && window.fetch) {
    if (M.mode === 'cpu') api('/api/progress', { mode: 'cpu', level: M.level, won: w === 0, maxcombo: MSTAT.maxcombo, ults: MSTAT.ults })
      .then(j => { applyProfile(j.profile); if (j.gain) $id('endRank').textContent = `+${j.gain} 墨锭${PROF.daily.some(t => !t.claimed && t.prog >= t.target) ? ' · 有任务可领奖了' : ''}`; }).catch(() => {});
    else if (M.mode === 'net') api('/api/progress', { mode: 'net', maxcombo: MSTAT.maxcombo, ults: MSTAT.ults }).then(j => applyProfile(j.profile)).catch(() => {});
    return;
  }
  // GitHub 站与离线模式本地结算与云端持久化
  if (M.mode === 'net') {
    const won = w === localIdx();
    const gain = won ? 60 : 30;
    PROF.ink = (PROF.ink || 0) + gain;
    if (won) {
      PROF.netWins = (PROF.netWins || 0) + 1;
      // 联机十胜：累计赢得 10 场联机对战，额外解锁一位基础英雄（铁山 或 雷鸣）
      if (PROF.netWins >= 10 && !PROF.online10Unlocked) {
        let unlockId = '';
        if (!(PROF.owned || []).includes('tieshan')) unlockId = 'tieshan';
        else if (!(PROF.owned || []).includes('leiming')) unlockId = 'leiming';
        if (unlockId) {
          PROF.owned = PROF.owned || ['qingfeng'];
          if (!PROF.owned.includes(unlockId)) PROF.owned.push(unlockId);
          PROF.online10Unlocked = true;
          const uName = CHARS[CHAR_IDX[unlockId]].name;
          setTimeout(() => {
            SFX.gong();
            toast(`【十胜功成】达成联机十胜，破境解锁基础角色：${uName}！`);
          }, 800);
        }
      }
    } else {
      PROF.netLosses = (PROF.netLosses || 0) + 1;
    }
    $id('endRank').textContent = `+${gain} 墨锭 · 联机${won ? '胜' : '负'}（累计 ${PROF.netWins || 0} 胜）`;
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    applyProfile(PROF);
  } else if (M.mode === 'cpu') {
    const won = w === 0;
    if (won) {
      const rewardMap = { easy: 10, normal: 20, hard: 40, adaptive: 40, impossible: 60 };
      const gain = rewardMap[M.level] || 20;
      PROF.ink = (PROF.ink || 0) + gain;
      $id('endRank').textContent = `+${gain} 墨锭`;
      if (window.CloudSave) CloudSave.saveProfile(PROF);
      applyProfile(PROF);
    }
  }
}

// ======================= 新手教学 =======================
// 在木人桩里一步一步教，每一步都检测你是不是真的做到了
let TUT = null;
function stunA() { A.state = 'hitstun'; A.t = 0; A.stun = 3; A.vx = 0; A.flash = 0.1; A.comboHits = 3; }
const TUT_STEPS = [
  { t: '移动', d: '按 A、D 左右走两步。', ok: () => Math.abs(A.x - TUT.x0) > 260 },
  { t: '跳跃', d: '按 W 或空格起跳，身在半空再按一次，便是二段跳。', ok: () => A.jumps >= 2 },
  { t: '五段连击', d: '贴到稻草人身边，连点左键打满五段；末了一记，会把它掀飞出去。', ok: () => TUT.hit.l5 },
  { t: '蓄力斩', d: '按住左键不放，待寒光一闪、听得一声“叮”，再松手。蓄满的一斩，连防御也能劈开。', ok: () => TUT.hit.cs2 },
  { t: '空中连击', d: '跃起后在空中点左键，再点一下便是下砸。把对手打飞之后，就靠这一手追上去。', ok: () => A.state === 'attack' && /^a[12]$/.test(A.moveName) },
  { t: '远程招式', d: '按住左键，再点右键（或按 R）。各家招式不同，青锋使的是剑气。', ok: () => A.skill2CD > 0 },
  { t: '技能', d: '按 Q 施展技能。青锋的疾风斩，能径直穿过对手。', ok: () => A.skillCD > 0 },
  { t: '防御', d: '稻草人会朝你放风刃，按住 S 挡下两次——记得面朝着它。', ok: () => TUT.blocks >= 2, setup: () => { TUT.shotT = 0.6; } },
  { t: '腾空闪', d: '你被击中，动不了了！点一下右键（或按左 Shift），腾空闪出去。', ok: () => A.escInvul, setup: () => { A.breakCD = 0; stunA(); } },
  { t: '大招', d: '气已为你蓄满——按 E，放手一搏！', ok: () => A.state === 'special', setup: () => { A.meter = 100; } },
];
function startTutorial() {
  try { localStorage.setItem('renying-tut-seen', '1'); } catch (e) {}
  trainChar = 0; dummyMode = 'stand';
  startTraining();
  B.x = STAGE_W / 2 + 220; A.x = STAGE_W / 2 - 220;
  TUT = { step: -1, wait: 0, x0: A.x, hit: {}, blocks: 0, prev: '', shotT: 0 };
  tutNext();
  $id('tutBox').classList.remove('hidden');
}
const TUT_TOUCH = ['拨左边的摇杆，左右走两步。', '摇杆往上推，或点「跳」；身在半空再点一次，便是二段跳。', '贴近稻草人，连点「攻击」打满五段。',
  '按住「攻击」不放，待寒光一闪、听得一声“叮”，再松手。', '点「跳」跃起，在空中点「攻击」，再点一下便是下砸。', '点「远程」放出远程招式，青锋使的是剑气。',
  '点「技能」施展技能。青锋的疾风斩，能径直穿过对手。', '稻草人会朝你放风刃，摇杆下推格挡，挡下两次——记得面朝着它。', '你被击中，动不了了！点「闪」腾空闪出去。', '气已为你蓄满，点那发亮的「大招」！'];
function tutNext() {
  TUT.step++; TUT.wait = 0; TUT.hit = {}; TUT.x0 = A.x;
  const st = TUT_STEPS[TUT.step];
  if (!st) return tutFinish();
  $id('tutBox').classList.remove('ok');
  $id('tutN').textContent = `新手教学 ${TUT.step + 1} / ${TUT_STEPS.length}`;
  $id('tutT').textContent = st.t; $id('tutD').textContent = TOUCH ? TUT_TOUCH[TUT.step] : st.d;
  if (st.setup) st.setup();
}
function tutTick(dt) {
  const st = TUT_STEPS[TUT.step]; if (!st) return;
  A.hp = A.maxHp; A.breakCD = TUT.step === 8 ? 0 : A.breakCD;
  if (A.state === 'attack' && A.hitConfirmed) TUT.hit[A.moveName] = true;
  if (A.state === 'blockstun' && TUT.prev !== 'blockstun') TUT.blocks++;
  TUT.prev = A.state;
  if (TUT.step === 7 && !TUT.wait) {                     // 防御：稻草人放风刃
    TUT.shotT -= dt;
    if (TUT.shotT <= 0) {
      TUT.shotT = 1.6; const dir = A.x >= B.x ? 1 : -1;
      spawnProj(B, { kind: 'wind', x: B.x + dir * 40, y: B.y - 62, vx: dir * 620, w: 56, h: 52, life: 2.4, dmg: 2, kb: [160, 0], stun: 0.3, hs: 0.04 });
    }
  }
  if (TUT.step === 8 && !TUT.wait && !A.escInvul && A.onGround() && A.state !== 'hitstun' && A.state !== 'getup') stunA();
  if (TUT.wait) { TUT.wait -= dt; if (TUT.wait <= 0) tutNext(); return; }
  if (st.ok()) { TUT.wait = 1; $id('tutBox').classList.add('ok'); SFX.chargeFull(); }
}
function updateTutBtn() {
  let done = false; try { done = !!localStorage.getItem('renying-tut-done'); } catch (e) {}
  if (!PROF.guest && PROF.tutorial) done = true;
  const b = document.querySelector('#menu [data-go="tutorial"]'); if (b) b.style.display = done ? 'none' : '';
}
async function tutFinish() {
  try { localStorage.setItem('renying-tut-done', '1'); } catch (e) {}
  updateTutBtn();
  $id('tutBox').classList.add('hidden');
  let msg = '该会的都会了。去找电脑或是同学，过几招吧。';
  if (!PROF.guest) {
    if (!PROF.tutorial) {
      PROF.tutorial = 1;
      PROF.ink = (PROF.ink || 0) + 300;
      if (window.CloudSave) CloudSave.saveProfile(PROF);
      applyProfile(PROF);
      msg += '<br>奖励 <b style="color:#e9c46a">300 墨锭</b>，去问剑阁试试手气吧！';
    }
  } else {
    msg += '<br>登录之后再走一遍教学，可领 300 墨锭。';
  }
  $id('tutReward').innerHTML = msg;
  TUT = null; paused = true; showScreen('tutdone'); SFX.gong();
}
function endTutorial() { TUT = null; $id('tutBox').classList.add('hidden'); }
$id('tutMenu').addEventListener('click', () => { paused = false; toMenu(); });
$id('tutStay').addEventListener('click', () => { paused = false; showScreen(null); });
$id('tutYes').addEventListener('click', () => startTutorial());
$id('tutNo').addEventListener('click', () => { try { localStorage.setItem('renying-tut-seen', '1'); } catch (e) {} backToMenu(); });
setTimeout(() => {
  let seen = false; try { seen = !!localStorage.getItem('renying-tut-seen'); } catch (e) {}
  if (!seen && $id('menu').classList.contains('on')) showScreen('tutask');
}, 1500);

// ======================= 回滚联机（v2.6） =======================
// 两边都完整计算对战，每帧只交换按键。对方的按键没到就先猜“他还按着之前的键”，
// 真实按键到了发现猜错，就读出那一帧的存档，用正确的按键瞬间重算到现在。
const ROLL = { on: false, F: 0, D: 3, N: 240, MAXP: 40, snaps: [], loc: [], rem: [], used: [], remChg: {}, remLast: -1,
  lastRemH: 0, lastSentH: 0, locMax: -1, pend: Infinity, out: [], peerAdv: 0, skipT: 0, stall: 0, ckOut: null, ended: false,
  rollbacks: 0, rbFrames: 0, desyncs: 0, ctrls: null };
const EMPTY_IN = { h: 0, p: [] };
// 只影响画面的字段不进存档
const F_SKIP = new Set(['ch', 'moves', 'look', 'ctrl', 'trail', 'scarf', 'j', 'sk', 'move', 'ghosts', 'ghostT', 'lagHp', 'lagDelay', 'flash', 'walkPh', 'vox', 'voy', 'snap', 'rot', 'skinKey']);
for (const k of Object.keys(SFX)) { const fn = SFX[k]; SFX[k] = (...a) => (RESIM ? undefined : fn(...a)); }
{ const m0 = metal; metal = (...a) => (RESIM ? undefined : m0(...a)); }
const jclone = v => JSON.parse(JSON.stringify(v));
function capF(f) {
  const o = {};
  for (const k in f) { if (F_SKIP.has(k)) continue; const v = f[k]; if (typeof v === 'function') continue; o[k] = v && typeof v === 'object' ? jclone(v) : v; }
  o.hasMove = !!f.move;
  return o;
}
function resF(f, o) {
  for (const k in f) if (!F_SKIP.has(k) && !(k in o)) delete f[k];
  for (const k in o) { if (k === 'hasMove') continue; const v = o[k]; f[k] = v && typeof v === 'object' ? jclone(v) : v; }
  f.move = o.hasMove && f.moveName ? f.moves[f.moveName] : null;
}
function capC(c) { return { h: { ...c.held }, b: { ...c.buf }, a: c.atkT }; }
function resC(c, o) { c.held = { ...o.h }; c.buf = { ...o.b }; c.atkT = o.a; }
function capState() {
  return { clock, hitstop, superFreeze, so: superOwner ? superOwner.idx : -1, projSeq, rng: GRNG.s,
    a: capF(A), b: capF(B), projs: jclone(projs), decoys: jclone(decoys), M: jclone(M), c: [capC(A.ctrl), capC(B.ctrl)] };
}
function restState(st) {
  clock = st.clock; hitstop = st.hitstop; superFreeze = st.superFreeze; superOwner = st.so >= 0 ? [A, B][st.so] : null;
  projSeq = st.projSeq; GRNG.s = st.rng;
  resF(A, st.a); resF(B, st.b);
  projs.length = 0; for (const q of jclone(st.projs)) projs.push(q);
  decoys.length = 0; for (const q of jclone(st.decoys)) decoys.push(q);
  for (const k of Object.keys(M)) delete M[k]; Object.assign(M, jclone(st.M));
  resC(A.ctrl, st.c[0]); resC(B.ctrl, st.c[1]);
}
function hashState(st) {
  const txt = JSON.stringify(st, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
  let h = 2166136261; for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function inBits(h) { return (h.left ? 1 : 0) | (h.right ? 2 : 0) | (h.down ? 4 : 0) | (h.atk ? 8 : 0) | (h.jump ? 16 : 0) | (h.aim < 0 ? 32 : 0) | (h.aim ? 64 : 0); }
function applyInput(c, inp) {
  const was = c.held.atk, b = inp.h;
  c.held.left = !!(b & 1); c.held.right = !!(b & 2); c.held.down = !!(b & 4); c.held.atk = !!(b & 8); c.held.jump = !!(b & 16);
  c.held.aim = (b & 64) ? ((b & 32) ? -1 : 1) : 0;
  if (c.held.atk && !was) c.atkT = clock;
  for (const a of inp.p) {
    if (a === 'skill2' && c.held.atk) { c.atkT = clock + 1e6; delete c.buf.light; }
    c.press(a);
  }
}
function rollStart(ch, seed) {
  refocusGame();
  setChars(ch[0], ch[1]);
  setupNetMatch();
  ROLL.ctrls = [new Ctrl(), new Ctrl()]; A.ctrl = ROLL.ctrls[0]; B.ctrl = ROLL.ctrls[1];
  human[0].clear(); NET.presses.length = 0; human[0].rec = NET.presses;
  for (const f of [A, B]) for (const k of ['moveName', 'lunged', 'hitConfirmed', 'chargeFull', 'homeX', 'dummy', 'spFace', 'spX', 'slashN', 'spinN', 'vox', 'voy']) delete f[k];
  clock = 0; projSeq = 0; GRNG.s = seed | 0;
  Object.assign(ROLL, { on: true, F: 0, snaps: [], loc: [], rem: [], used: [], remChg: {}, remLast: ROLL.D - 1, lastRemH: 0, lastSentH: 0,
    locMax: ROLL.D - 1, pend: Infinity, out: [], peerAdv: 0, skipT: 0, stall: 0, ckOut: null, ended: false, rollbacks: 0, rbFrames: 0, desyncs: 0 });
  for (let f = 0; f < ROLL.D; f++) { ROLL.loc[f] = EMPTY_IN; ROLL.rem[f] = EMPTY_IN; }
  BP = null; showScreen(null); creditT = 0;
  recBegin('net');
  startRound();
  applySkins(); MSTAT.maxcombo = 0; MSTAT.ults = 0; acc = 0;
  if (NET.role === 'host') send({ mstart: 1 });
  $id('endRank').textContent = '';
}
function rollFrame(f) {
  const R = ROLL;
  R.snaps[f % R.N] = { f, st: capState() };
  const li = R.loc[f] || EMPTY_IN, ri = f <= R.remLast ? (R.rem[f] || { h: R.lastRemH, p: [] }) : { h: R.lastRemH, p: [] };
  R.used[f] = ri;
  const me = localIdx();
  applyInput([A, B][me].ctrl, li); applyInput([A, B][1 - me].ctrl, ri);
  step();
}
function rollResim() {
  const R = ROLL, from = R.pend; R.pend = Infinity;
  const sn = R.snaps[from % R.N];
  if (!sn || sn.f !== from) { if (NET.role === 'host') rollSendSync(); else send({ rdesync: 1 }); return; }
  const pre = [A.x, A.y, B.x, B.y];
  restState(sn.st);
  RESIM = true;
  try { for (let f = from; f < R.F; f++) rollFrame(f); } finally { RESIM = false; }
  R.rollbacks++; R.rbFrames += R.F - from;
  // 画面上从旧位置平滑滑到新位置
  [A, B].forEach((f, i) => { const dx = pre[i * 2] - f.x, dy = pre[i * 2 + 1] - f.y; if (Math.abs(dx) < 140 && Math.abs(dy) < 140) { f.vox = (f.vox || 0) + dx; f.voy = (f.voy || 0) + dy; } });
}
function rollAdvance() {
  const R = ROLL;
  if (NET.hold || R.ended) return false;
  if (R.F - R.remLast > R.MAXP) { R.stall += STEP; return false; }          // 对方的按键太久没到：等一等
  if (R.skipT > 0) R.skipT -= STEP;
  else if ((R.F - 1 - R.remLast) - R.peerAdv > 8) { R.skipT = 0.25; return false; }   // 比对方快太多：停一帧让他追上
  R.stall = 0;
  if (R.pend < R.F) rollResim();
  const fi = R.F + R.D;
  if (fi > R.locMax) {                                                      // 记录本地按键（D 帧后生效）
    const h = inBits(human[0].held), pr = NET.presses.splice(0);
    for (let x = R.locMax + 1; x < fi; x++) R.loc[x] = { h: R.lastSentH, p: [] };
    R.loc[fi] = { h, p: pr }; R.locMax = fi;
    if (h !== R.lastSentH || pr.length) { R.out.push([fi, h, ...pr]); R.lastSentH = h; }
  }
  rollFrame(R.F);
  R.F++;
  recNet();
  // 胜负只在两边按键都确认过的帧上结算
  const cf = Math.min(R.F, R.remLast + 1), cs = R.snaps[cf % R.N];
  if (!R.ended && cs && cs.f === cf && cs.st.M.phase === 'end') { R.ended = true; showEnd(cs.st.M.koWinner); }
  if (R.F % 60 === 0) { const f = Math.min(R.F - 30, R.remLast); const sn = R.snaps[f % R.N]; if (f > 0 && sn && sn.f === f) R.ckOut = [f, hashState(sn.st)]; }
  if (R.F % 600 === 0) for (const arr of [R.loc, R.rem, R.used]) for (let k = R.F - 1200; k < R.F - 600; k++) if (k >= 0) delete arr[k];
  return true;
}
function rollSend() {
  const R = ROLL, now = performance.now();
  if (!R.out.length && !R.ckOut && now - (R.lastSend || 0) < 33) return;
  R.lastSend = now;
  const msg = { ru: R.locMax, adv: R.F - 1 - R.remLast };
  if (R.out.length) msg.ri = R.out.splice(0);
  if (R.ckOut) { msg.ck = R.ckOut; R.ckOut = null; }
  send(msg);
}
function rollTick(real) {
  const R = ROLL;
  acc += real * (slowmo > 0 ? 0.28 : 1) * cineSpeed();
  if (acc > STEP * 5) acc = STEP * 5;
  let n = 0;
  while (acc >= STEP && n < 5) { if (!rollAdvance()) { acc = 0; break; } acc -= STEP; n++; }
  if (n >= 5) acc = 0;
  if (R.pend < R.F && !NET.hold) rollResim();
  rollSend();
  if (R.stall > 0.35) { netOverlay('等待对手的网络…'); R.stallShown = true; }
  else if (R.stallShown) { netOverlay(''); R.stallShown = false; }
}
function rollRecv(msg) {
  const R = ROLL; if (!R.on) return;
  if (msg.ri) for (const r of msg.ri) R.remChg[r[0]] = { h: r[1], p: r.slice(2) };
  for (let f = R.remLast + 1; f <= msg.ru; f++) {
    const c = R.remChg[f]; let inp;
    if (c) { inp = c; R.lastRemH = c.h; delete R.remChg[f]; } else inp = { h: R.lastRemH, p: [] };
    R.rem[f] = inp;
    if (f < R.F) { const u = R.used[f]; if (!u || u.h !== inp.h || inp.p.length) R.pend = Math.min(R.pend, f); }
  }
  if (msg.ru > R.remLast) R.remLast = msg.ru;
  recNet();
  if (msg.adv !== undefined) R.peerAdv = msg.adv;
  if (msg.ck) {   // 两边校验同一帧的状态
    const [f, h] = msg.ck, sn = R.snaps[f % R.N];
    if (sn && sn.f === f && f <= R.remLast && f < R.F && R.pend > f && hashState(sn.st) !== h) {
      R.desyncs++;
      if (NET.role === 'host') rollSendSync(); else send({ rdesync: 1 });
    }
  }
}
// 状态不一致时：房主把一帧“两边都确认过”的存档发给对方
function rollSendSync() {
  const R = ROLL, f = Math.min(R.F, R.remLast + 1), sn = R.snaps[f % R.N];
  const st = f === R.F ? capState() : (sn && sn.f === f ? sn.st : null);
  if (st) send({ rsync: { f, st } });
}
function rollAdopt(p) {
  const R = ROLL; if (!R.on) return;
  REC.bad = true;
  const target = R.F;
  restState(p.st); R.F = p.f; R.pend = Infinity;
  if (R.F < target) { RESIM = true; try { while (R.F < target) { rollFrame(R.F); R.F++; } } finally { RESIM = false; } }
}
// 断线重连：留下的一方把当前状态和按键记录发给回来的一方
function rollResumePayload() {
  const R = ROLL, li = [];
  for (let f = R.F; f <= R.locMax; f++) { const x = R.loc[f] || EMPTY_IN; li.push([f, x.h, ...x.p]); }
  return { k: 'rmatch', ch: [A.chIdx, B.chIdx], F: R.F, st: capState(), rl: R.remLast, ph: R.lastRemH, li, ru: R.locMax, lh: R.lastSentH, ended: R.ended, skins: PROF.equip || {} };
}
function rollResume(p) {
  REC.on = false;
  setChars(p.ch[0], p.ch[1]);
  setupNetMatch();
  ROLL.ctrls = [new Ctrl(), new Ctrl()]; A.ctrl = ROLL.ctrls[0]; B.ctrl = ROLL.ctrls[1];
  human[0].clear(); NET.presses.length = 0; human[0].rec = NET.presses;
  Object.assign(ROLL, { on: true, snaps: [], loc: [], rem: [], used: [], remChg: {}, pend: Infinity, out: [], peerAdv: 0, skipT: 0, stall: 0, ckOut: null, ended: !!p.ended });
  restState(p.st); ROLL.F = p.F;
  for (let f = p.rl + 1; f < p.F + ROLL.D; f++) ROLL.loc[f] = { h: p.ph, p: [] };   // 掉线那段时间按对方猜的算
  ROLL.locMax = p.F + ROLL.D - 1; ROLL.lastSentH = p.ph;
  for (const r of p.li) ROLL.rem[r[0]] = { h: r[1], p: r.slice(2) };
  ROLL.remLast = p.ru; ROLL.lastRemH = p.lh;
  if (p.skins) NET.peerSkins = p.skins;
  BP = null; creditT = 0; applySkins(); acc = 0;
  if (p.ended && M.koWinner >= 0) showEnd(M.koWinner); else { showScreen(null); say('重归战局', 0.8, 'go'); }
  rollSend();
}

// ======================= 手机和平板：触屏操作 =======================
const TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);   // 主要靠手指操作的设备（手机、平板）
const TUI = { stick: null, stickUp: false, jumpHeld: false };
function touchHeldJump() { human[0].held.jump = TUI.stickUp || TUI.jumpHeld; }
function touchUIUpdate() {
  if (!TOUCH) return;
  const inFight = (M.mode === 'cpu' || M.mode === 'net' || M.mode === 'train') && !paused && !document.querySelector('.scr.on');
  $id('touchUI').classList.toggle('hidden', !inFight);
  if (!inFight) return;
  const me = [A, B][localIdx()];
  document.querySelector('.tult').classList.toggle('ready', !!me && me.meter >= 100);
  $id('tPause').classList.toggle('hidden', M.mode === 'net');
  $id('tDummy').classList.toggle('hidden', !(M.mode === 'train' && !FOREST.on && !TUT));
}
if (TOUCH) {
  document.body.classList.add('touchdev');
  for (const b of document.querySelectorAll('#touchUI [data-a]')) {
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); initAudio(); try { b.setPointerCapture(e.pointerId); } catch (err) {} b.classList.add('on');
      const c = human[0], a = b.dataset.a;
      if (a === 'atk') { c.held.atk = true; c.atkT = clock; c.press('light'); }
      else if (a === 'jump') { TUI.jumpHeld = true; touchHeldJump(); c.press('jump'); }
      else if (a === 'skill2') { if (c.held.atk) { c.atkT = clock + 1e6; delete c.buf.light; } c.press('skill2'); }
      else c.press(a);
    });
    const up = e => {
      b.classList.remove('on'); const c = human[0], a = b.dataset.a;
      if (a === 'atk') c.held.atk = false;
      if (a === 'jump') { TUI.jumpHeld = false; touchHeldJump(); }
    };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  const st = $id('tStick'), kn = $id('tKnob');
  const move = e => {
    const r = st.getBoundingClientRect(), R0 = r.width / 2;
    let dx = e.clientX - (r.left + R0), dy = e.clientY - (r.top + R0); const l = Math.hypot(dx, dy);
    if (l > R0) { dx *= R0 / l; dy *= R0 / l; }
    kn.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R0, ny = dy / R0, h = human[0].held;
    h.left = nx < -0.35; h.right = nx > 0.35; if (h.left) h.aim = -1; if (h.right) h.aim = 1;
    h.down = ny > 0.55 && Math.abs(nx) < 0.8;
    const upNow = ny < -0.6 && Math.abs(nx) < 0.8;
    if (upNow && !TUI.stickUp) human[0].press('jump');
    TUI.stickUp = upNow; touchHeldJump();
  };
  st.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); TUI.stick = e.pointerId; try { st.setPointerCapture(e.pointerId); } catch (err) {} move(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === TUI.stick) move(e); });
  const end = e => { if (e.pointerId !== TUI.stick) return; TUI.stick = null; kn.style.transform = ''; const h = human[0].held; h.left = h.right = h.down = false; TUI.stickUp = false; touchHeldJump(); };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  $id('tPause').addEventListener('click', () => { if (M.mode !== 'net' && M.phase !== 'end') { paused = true; showScreen('pause'); } });
  $id('tDummy').addEventListener('click', () => {
    if (!(B.ctrl instanceof DummyCtrl)) return;
    const order = ['stand', 'block', 'escape', 'fixed'];
    dummyMode = B.ctrl.mode = order[(order.indexOf(dummyMode) + 1) % 4];
    if (dummyMode === 'fixed') { B.x = B.homeX = STAGE_W / 2; B.y = 0; B.vx = B.vy = 0; B.state = 'idle'; B.t = 0; B.juggle = 0; B.comboHits = 0; }
    say(DUMMY_MODES[dummyMode], 0.8, 'go');
  });
  document.addEventListener('touchstart', () => initAudio(), { passive: true });
}

// ======================= 界面按钮 =======================
let pickMode = 'net', pickLevel = 'normal';
function showScreen(id) {
  for (const s of ['menu', 'pause', 'end', 'replays', 'bp', 'acc', 'lb', 'single', 'netp', 'help', 'codex', 'settings', 'community', 'welfare', 'gacha', 'tasks', 'tutask', 'tutdone', 'forestEnd']) document.getElementById(s).classList.toggle('on', s === id);
  $id('accBar').classList.toggle('hidden', !MENU_SCREENS.includes(id));
  if (id !== 'bp') { try { showPop(null); } catch (e) {} }
  if (id === 'menu') { menuCam.tx = 0; menuCam.tz = 1; }
  if (!id) {
    refocusGame();
  } else if (document.activeElement && !document.activeElement.closest('#' + id)) {
    try { document.activeElement.blur(); } catch (e) {}
  }
}
function selectMode(mode) {
  pickMode = mode;
  if (mode === 'net') { menuCam.tx = MENU_SPOT.netp; menuCam.tz = 1.9; showScreen('netp'); }
}
const levelsEl = document.getElementById('levels');
if (levelsEl) {
  levelsEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.lv) return;
    pickLevel = b.dataset.lv;
    for (const x of document.querySelectorAll('#levels button')) x.classList.toggle('sel', x === b);
    updateAIBrief();
    SFX.slice();
  });
}
const singleTabsEl = document.getElementById('singleTabs');
if (singleTabsEl) {
  singleTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.tab) return;
    singleSec(b.dataset.tab);
    if (b.dataset.tab === 'stage') renderStages();
    if (b.dataset.tab === 'train' || b.dataset.tab === 'stage') renderTrainPick();
    SFX.slice();
  });
}
const taskTabsEl = document.getElementById('taskTabs');
if (taskTabsEl) {
  taskTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.ttab) return;
    const ttab = b.dataset.ttab;
    for (const btn of document.querySelectorAll('#taskTabs button')) btn.classList.toggle('sel', btn === b);
    if ($id('taskTabQuests')) $id('taskTabQuests').style.display = ttab === 'quests' ? '' : 'none';
    if ($id('taskTabRedeem')) $id('taskTabRedeem').style.display = ttab === 'redeem' ? '' : 'none';
    if ($id('taskTabGuide')) $id('taskTabGuide').style.display = ttab === 'guide' ? '' : 'none';
    SFX.slice();
  });
}
let trainChar = 0, dummyMode = 'stand';
function startTraining() {
  FOREST.on = false; B.forestProxy = false; B.hidden = false;
  initAudio(); paused = false;
  showScreen(null);
  startMatch('train', dummyMode, [trainChar, 0]);
  Object.assign(TRAIN, { total: 0, hits: [], best: 0, bestDmg: 0 });
  B.dummy = true; B.maxHp = B.hp = B.lagHp = 300; B.look = { ...B.look, name: '木人桩' };
  applySkins();
  A.x = STAGE_W / 2 - 160; B.x = dummyMode === 'fixed' ? STAGE_W / 2 : STAGE_W / 2 + 60; B.homeX = undefined;
}
function renderTrainPick() {
  const av = availList();
  $id('trPick').innerHTML = CHARS.map((c, i) => `<button data-i="${i}" class="${i === trainChar ? 'sel' : ''}" style="color:rgb(${c.look.slash})">${c.name}${av.includes(i) ? '' : '<small style="font-size:12px;margin-left:4px;color:var(--dim)">试用</small>'}</button>`).join('');
}
$id('trPick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { trainChar = +b.dataset.i; renderTrainPick(); SFX.slice(); } });
$id('trainBtn').addEventListener('click', startTraining);
renderTrainPick();
function go() { initAudio(); paused = false; bpStart('cpu'); }
document.getElementById('goBtn').addEventListener('click', go);
document.getElementById('againBtn').addEventListener('click', () => {
  if (M.mode === 'net') { if (NET.role === 'host' && NET.open) bpStart('net'); return; }
  bpStart('cpu');
});
document.getElementById('resumeBtn').addEventListener('click', () => { paused = false; showScreen(null); refocusGame(); });
document.getElementById('pause').addEventListener('click', e => {
  if (e.target === document.getElementById('pause')) {
    paused = false;
    showScreen(null);
    refocusGame();
  }
});
function toMenu() {
  ROLL.on = false; REC.on = false;
  if (REPLAY.on) { REPLAY.on = false; $id('rpBar').classList.add('hidden'); }
  if (FOREST.on) { FOREST.on = false; FOREST.mons = []; FOREST.shots = []; B.forestProxy = false; B.hidden = false; }
  M.stage = null;
  if (M.mode === 'train' && !TUT && SERVED && ACC.token && TRAIN.total > 0) api('/api/progress', { mode: 'train', traindmg: TRAIN.total, maxcombo: TRAIN.best }).then(j => applyProfile(j.profile)).catch(() => {});
  if (TUT) endTutorial();
  paused = false; BP = null; B.dummy = false; if (M.mode === 'net' || bpMode === 'net' || NET.ws) netLeave(); bpMode = 'cpu'; showScreen('menu'); startMatch('demo'); }
document.getElementById('quitBtn').addEventListener('click', toMenu);
document.getElementById('menuBtn').addEventListener('click', toMenu);

// ======================= 选人时聊天和表情 =======================
const FACE = (inner, fill = '#f4ead5') => `<svg viewBox="0 0 48 48"><circle cx="24" cy="25" r="19" fill="${fill}" stroke="#1a1426" stroke-width="2.6"/>${inner}</svg>`;
const SEAL = (a, b) => `<svg viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" rx="4" fill="#b8392e" transform="rotate(-4 24 24)"/><rect x="9" y="9" width="30" height="30" rx="2" fill="none" stroke="rgba(255,240,225,.6)" stroke-width="1.4" transform="rotate(-4 24 24)"/><text x="24" y="23" font-family="Ma Shan Zheng, STKaiti, KaiTi, serif" font-size="15" fill="#fbeee0" text-anchor="middle">${a}</text><text x="24" y="38" font-family="Ma Shan Zheng, STKaiti, KaiTi, serif" font-size="15" fill="#fbeee0" text-anchor="middle">${b}</text></svg>`;
const K = 'stroke="#1a1426" stroke-width="2.4" fill="none" stroke-linecap="round"';
const EMOTES = [
  { id: 'hi', name: '你好', svg: FACE(`<path d="M15 23q3-4 6 0M27 23q3-4 6 0" ${K}/><path d="M17 31q7 6 14 0" ${K}/><circle cx="13" cy="29" r="3" fill="#f2a1a1"/><circle cx="35" cy="29" r="3" fill="#f2a1a1"/>`) },
  { id: 'haha', name: '哈哈', svg: FACE(`<path d="M14 22q4-5 7 0M27 22q4-5 7 0" ${K}/><path d="M15 28h18q-2 11-9 11t-9-11z" fill="#7a1f2a" stroke="#1a1426" stroke-width="2"/><path d="M11 20q-3 6 1 8" stroke="#6fc3ff" stroke-width="3" fill="none" stroke-linecap="round"/>`) },
  { id: 'cry', name: '呜呜', svg: FACE(`<path d="M15 22h6M27 22h6" ${K}/><path d="M18 24v13M30 24v13" stroke="#6fc3ff" stroke-width="3.2" stroke-linecap="round"/><path d="M19 35q5-4 10 0" ${K}/>`) },
  { id: 'angry', name: '生气', svg: FACE(`<path d="M14 18l8 4M34 18l-8 4" ${K}/><circle cx="19" cy="25" r="2.2" fill="#1a1426"/><circle cx="29" cy="25" r="2.2" fill="#1a1426"/><path d="M17 35q7-5 14 0" ${K}/><path d="M35 9l3 3m0-3l-3 3" stroke="#b8392e" stroke-width="2.4" stroke-linecap="round"/>`, '#ffc7b8') },
  { id: 'shock', name: '震惊', svg: FACE(`<circle cx="18" cy="23" r="4.5" fill="#fff" stroke="#1a1426" stroke-width="2"/><circle cx="30" cy="23" r="4.5" fill="#fff" stroke="#1a1426" stroke-width="2"/><circle cx="18" cy="23" r="1.6" fill="#1a1426"/><circle cx="30" cy="23" r="1.6" fill="#1a1426"/><ellipse cx="24" cy="34" rx="3.5" ry="4.5" fill="#1a1426"/>`) },
  { id: 'cool', name: '淡定', svg: FACE(`<path d="M11 21h26v3q-1 5-6 5t-6-5h-2q-1 5-6 5t-6-5z" fill="#1a1426"/><path d="M19 34q7 3 11-2" ${K}/>`) },
  { id: 'fight', name: '来战', svg: SEAL('来', '战') },
  { id: 'gg', name: '好局', svg: SEAL('好', '局') },
  { id: 'bow', name: '承让', svg: SEAL('承', '让') },
];
const EMO = Object.fromEntries(EMOTES.map(e => [e.id, e]));
let chatLastT = 0;
function chatClear() { $id('chatLog').innerHTML = ''; for (const b of document.querySelectorAll('.bubble')) b.remove(); }
function chatAdd(side, c) {
  const log = $id('chatLog'), mine = side === bpMySide();
  const who = mine ? '你' : bpSideName(side), col = side === 0 ? 'var(--p1)' : 'var(--p2)';
  const body = c.k === 'e' && EMO[c.v] ? `<span class="emo" title="${EMO[c.v].name}">${EMO[c.v].svg}</span>` : `<span>${escapeHTML(String(c.v).slice(0, 40))}</span>`;
  const ln = document.createElement('div'); ln.className = 'ln';
  ln.innerHTML = `<span class="who" style="color:${col}">${escapeHTML(who)}</span>${body}`;
  log.appendChild(ln); log.scrollTop = log.scrollHeight;
  const box = $id('bpS' + side); if (!box) return;
  for (const b of box.querySelectorAll('.bubble')) b.remove();
  const bb = document.createElement('div'); bb.className = 'bubble'; bb.innerHTML = body; box.appendChild(bb);
  setTimeout(() => bb.remove(), 3200);
}
function chatSend(c) {
  if (bpMode !== 'net' || !NET.open) return;
  const now = performance.now(); if (now - chatLastT < 700) return; chatLastT = now;
  send({ chat: c }); chatAdd(bpMySide(), c); sTone(700, 900, 0.08, 0.04);
}
function chatRecv(c) {
  if (!c || (c.k !== 't' && c.k !== 'e')) return;
  chatAdd(1 - bpMySide(), c); sTone(900, 700, 0.1, 0.05);
}
$id('emoBar').innerHTML = EMOTES.map(e => `<button data-e="${e.id}" title="${e.name}" aria-label="${e.name}">${e.svg}</button>`).join('');
$id('emoBar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) chatSend({ k: 'e', v: b.dataset.e }); });
function chatSendText() { const v = $id('chatIn').value.trim(); if (!v) return; $id('chatIn').value = ''; chatSend({ k: 't', v: v.slice(0, 40) }); }
$id('chatSend').addEventListener('click', chatSendText);
$id('chatIn').addEventListener('keydown', e => { if (e.key === 'Enter') chatSendText(); });

// ======================= 禁用与选人 =======================
// 顺序：1P 禁用 → 2P 禁用 → 1P 选人 → 2P 选人。联机时由房主记录结果并同步。
const BP_STEPS = [[0, 'ban'], [1, 'ban'], [0, 'pick'], [1, 'pick']];
const BP_TIME = 25;
let BP = null, bpMode = 'cpu', bpSel = -1, bpHover = -1, bpCpuT = 0;
const PORTRAITS = [];
// ======================= 演示动画（不跑对战，只按顺序摆招式） =======================
const DEMO_SEQ = [['idle', 0.55, 0], ['l1s', 0.09, 0], ['l1a', 0.15, 16], ['l2s', 0.08, 0], ['l2a', 0.15, 16], ['lcs', 0.08, 0], ['lca', 0.15, 16],
  ['lds', 0.1, 0], ['lda', 0.18, 18], ['l3s', 0.1, 0], ['l3a', 0.2, 30], ['idle', 0.4, 0], ['hvs', 0.14, 0], ['hva', 0.24, 0], ['jump', 0.22, 0],
  ['a1s', 0.08, 0], ['a1a', 0.18, 0], ['fall', 0.3, 0], ['charge', 0.7, 0], ['spa', 0.32, 34], ['idle', 0.5, 0], ['sps', 0.4, 0], ['spa', 0.18, 40],
  ['l1a', 0.12, 0], ['l2a', 0.12, 0], ['l1a', 0.12, 0], ['hva', 0.3, 0], ['victory', 0.9, 0]];
const DEMO_SWING = new Set(['l1a', 'l2a', 'lca', 'lda', 'l3a', 'hva', 'a1a', 'a2a', 'spa', 'qf_thrust', 'fy_xslash', 'ts_slam', 'ts_shoulder', 'ls_thrust', 'ly_fanswipe', 'lm_jab', 'lm_kick', 'my_stroke', 'my_paint', 'yl_dive']);
class Puppet {
  constructor(i, skin) { this.set(i, skin); }
  playSeq(seq, lab, loop = false) {
    this.customSeq = seq;
    this.customLab = lab;
    this.loopCustom = loop;
    this.k = -1;
    this.t = 99;
    this.ox = 0;
    this.x = 0;
    this.y = 0;
    this.badges = [];
    this.projs = [];
    this.rings = [];
    this.fx = [];
    this.puddles = [];
    this.hitQ = [];
  }
  set(i, skin) {
    const ch = CHARS[i];
    this.skin = skin === undefined ? mySkin(ch.id) : skin;
    Object.assign(this, { chIdx: i, ch, look: skinLook(i, this.skin), wlen: WEAPON_LEN[ch.look.weapon] || 54, size: ch.size || 1,
      j: {}, k: 0, t: 0, ox: 0, x: 0, y: 0, face: 1, rot: 0, trail: [], scarf: [], idx: 0, state: 'idle', flying: false,
      badges: [], projs: [], rings: [], fx: [], puddles: [], hitQ: [], dummyY: 0, dummyVy: 0, dummyShake: 0 });
    for (const k of JOINTS) this.j[k] = [...POSES.idle[k]]; this.j.sw = POSES.idle.sw;
    this.sk = skeleton(this);
  }
  update(dt) {
    const defaultSeq = (HERO_FULL_DEMO && HERO_FULL_DEMO[this.ch.id]) ? HERO_FULL_DEMO[this.ch.id] : DEMO2;
    let steps = this.customSeq || defaultSeq;
    this.t += dt;
    this.hitQ = this.hitQ || [];
    if (this.fx === undefined) {
      this.fx = []; this.flashT = 0; this.proj = null; this.projs = []; this.lab = '';
      this.hitQ = []; this.rings = []; this.badges = []; this.puddles = [];
      this.dummyY = 0; this.dummyVy = 0; this.dummyShake = 0;
      this.k = -1; this.t = 99;
    }
    if (this.k < 0 || this.t >= steps[this.k].d) {
      this.t = 0; this.k++;
      if (this.k >= steps.length) {
        if (this.loopCustom) {
          this.k = 0;
        } else if (this.customSeq) {
          this.customSeq = null;
          this.customLab = null;
          steps = defaultSeq;
          for (const el of document.querySelectorAll('#cxMoves .active-demo')) el.classList.remove('active-demo');
          this.k = 0;
        } else {
          this.k = 0;
        }
      }
      const st = steps[this.k], ch = this.ch;
      if (st.reset) { this.ox = 0; this.x = 0; }
      this.ox += st.dx || 0;
      if (this.customLab) this.lab = this.customLab;
      else if (st.lab) this.lab = { L: '左键 · 连击', Q: `Q · ${SKILLS[ch.skill].name}`, R: `左键+右键 · ${SKILLS[ch.skill2].name}`, E: `E · ${ULTS[ch.ult].name}`, '按住蓄力': '按住左键 · 蓄力', '空中': '空中斩', '腾空闪': '右键 · 腾空闪' }[st.lab] || st.lab;
      if (st.hit) this.hitQ.push({ t: 0.045, n: st.hit, launch: st.launch, badge: st.badge });

      // 各种招式实体特效
      if (st.fx === 'proj') this.projs.push({ kind: 'proj', x: this.x + 34, y: -62, vx: 880, life: 0.5, col: this.look.slash });
      else if (st.fx === 'swordqi') { this.projs.push({ kind: 'swordqi', x: this.x + 30, y: -62, vx: 920, life: 0.5, col: '120,230,255' }); this.rings.push({ x: this.x + 30, y: -62, r: 14, life: 0.3 }); }
      else if (st.fx === 'gale') { this.rings.push({ x: this.x + 20, y: -62, r: 18, life: 0.4 }, { x: 60, y: -62, r: 24, life: 0.4 }); this.fx.push({ x: this.x + 20, y: -62, vx: 700, vy: 0, life: 0.2, c: '120,230,255' }); }
      else if (st.fx === 'quake') { this.projs.push({ kind: 'quake', x: this.x + 20, y: 0, vx: 560, life: 0.45, col: '255,200,120' }); for (let k = 0; k < 6; k++) this.fx.push({ x: this.x + 20 + rand(-10, 10), y: 0, vx: rand(100, 300), vy: -rand(150, 350), life: 0.35, c: '200,160,100' }); }
      else if (st.fx === 'ironwall') { this.rings.push({ x: this.x + 10, y: -60, r: 30, life: 0.45 }); this.flashT = 0.15; }
      else if (st.fx === 'avalanche') { this.flashT = 0.25; this.rings.push({ x: 60, y: 0, r: 40, life: 0.5 }, { x: this.x, y: 0, r: 30, life: 0.4 }); for (let k = 0; k < 10; k++) this.fx.push({ x: 60 + rand(-20, 20), y: 0, vx: rand(-200, 200), vy: -rand(200, 450), life: 0.45, c: '220,180,120' }); }
      else if (st.fx === 'blink') { for (let k = 0; k < 10; k++) this.fx.push({ x: this.x, y: -60 + rand(-20, 20), vx: rand(-80, 80), vy: rand(-80, 80), life: 0.3, c: '40,30,50' }); for (let k = 0; k < 8; k++) this.fx.push({ x: 60, y: -62 + rand(-20, 20), vx: rand(-120, 120), vy: rand(-120, 120), life: 0.3, c: '255,95,115' }); }
      else if (st.fx === 'kunai') { for (const a of [-0.15, 0, 0.15]) this.projs.push({ kind: 'kunai', x: this.x + 25, y: -65, vx: 1100 * Math.cos(a), vy: 1100 * Math.sin(a), life: 0.4, col: '200,200,220' }); }
      else if (st.fx === 'shadows') { this.flashT = 0.2; this.rings.push({ x: 60, y: -62, r: 35, life: 0.45 }); }
      else if (st.fx === 'windblade') { this.projs.push({ kind: 'wind', x: this.x + 30, y: -62, vx: 1000, life: 0.45, col: '150,255,200' }); }
      else if (st.fx === 'windstep') { this.rings.push({ x: this.x + 20, y: -60, r: 32, life: 0.35 }); for (let k = 0; k < 8; k++) this.fx.push({ x: this.x + 10, y: -60 + rand(-20, 20), vx: rand(-150, 150), vy: rand(-100, 100), life: 0.25, c: '150,255,200' }); }
      else if (st.fx === 'tornado') { this.projs.push({ kind: 'tornado', x: this.x + 40, y: -70, vx: 380, life: 0.8, col: '150,255,200' }); }
      else if (st.fx === 'thunderfist') { this.rings.push({ x: this.x + 20, y: -62, r: 24, life: 0.35 }); for (let k = 0; k < 10; k++) this.fx.push({ x: this.x + rand(-10, 30), y: -62 + rand(-25, 25), vx: rand(-180, 180), vy: rand(-180, 180), life: 0.25, c: '255,230,120' }); }
      else if (st.fx === 'stomp') { this.projs.push({ kind: 'bolt', x: 60, y: -200, vx: 0, life: 0.35, col: '255,240,150' }); this.rings.push({ x: 60, y: 0, r: 25, life: 0.3 }); }
      else if (st.fx === 'thunder') { this.flashT = 0.25; this.projs.push({ kind: 'bolt', x: 60, y: -200, vx: 0, life: 0.45, col: '255,240,150' }); this.rings.push({ x: 60, y: 0, r: 35, life: 0.4 }); }
      else if (st.fx === 'backthrust') { this.rings.push({ x: 60, y: -68, r: 20, life: 0.3 }); for (let k = 0; k < 8; k++) this.fx.push({ x: 60, y: -68, vx: rand(100, 300), vy: rand(-120, 120), life: 0.25, c: '170,220,255' }); }
      else if (st.fx === 'spin') { this.rings.push({ x: this.x + 25, y: -65, r: 28, life: 0.35 }); }
      else if (st.fx === 'timestop') { this.flashT = 0.3; this.rings.push({ x: 60, y: -65, r: 32, life: 0.4 }); }
      else if (st.fx === 'inktrap') { this.puddles.push({ x: 60, life: 2.5 }); }
      else if (st.fx === 'inkblob') { this.projs.push({ kind: 'inkblob', x: this.x + 25, y: -80, vx: 450, vy: -380, g: 1400, life: 0.6, col: '40,40,55' }); }
      else if (st.fx === 'inkdragon') { this.projs.push({ kind: 'dragon', x: this.x + 30, y: -65, vx: 620, life: 0.8, col: '25,25,35' }); this.flashT = 0.15; }
      else if (st.fx === 'mirror') { this.rings.push({ x: this.x + 25, y: -65, r: 24, life: 0.4 }); }
      else if (st.fx === 'moonring') { this.projs.push({ kind: 'moonring', x: this.x + 30, y: -65, vx: 650, life: 0.7, col: '215,195,255' }); }
      else if (st.fx === 'moonflow') { this.rings.push({ x: this.x, y: -60, r: 35, life: 0.5 }); this.badges.push({ text: '+22', x: this.x, y: -105, life: 0.8, max: 0.8 }); }
      else if (st.fx === 'dive') { this.rings.push({ x: 60, y: -40, r: 22, life: 0.3 }); }
      else if (st.fx === 'feather') { for (const dy of [-12, 0, 12]) this.projs.push({ kind: 'feather', x: this.x + 25, y: -68 + dy, vx: 950, life: 0.45, col: '160,205,255' }); }
      else if (st.fx === 'featherstorm') { this.flashT = 0.2; for (let k = 0; k < 6; k++) this.projs.push({ kind: 'feather', x: 60 + rand(-30, 30), y: -220 - k * 30, vx: rand(-30, 30), vy: 950, life: 0.4, col: '160,205,255' }); }
    }
    const st = steps[this.k], name = st.p, p = POSES[name] || POSES.idle, a = 1 - Math.exp(-(DEMO_SWING.has(name) ? 55 : 22) * dt);
    for (const k of JOINTS) { this.j[k][0] += (p[k][0] - this.j[k][0]) * a; this.j[k][1] += (p[k][1] - this.j[k][1]) * a; }
    this.j.sw += (p.sw - this.j.sw) * a;
    this.flying = false; this.state = 'idle';
    this.y = damp(this.y, 0, 9, dt); this.x = damp(this.x, this.ox - 60, 10, dt);
    this.sk = skeleton(this);
    if (DEMO_SWING.has(name) && this.t < 0.14) this.trail.push({ b: this.sk.bladeMid, t: this.sk.tip, life: 1 });
    for (const e of this.trail) e.life -= dt / 0.18;
    while (this.trail.length && this.trail[0].life <= 0) this.trail.shift();

    // 命中稻草人反馈：火花、晃动、浮空、控制徽标
    const hit = (n, launch, badge) => {
      this.dummyShake = Math.min(0.7, this.dummyShake + 0.22 * n);
      if (launch) this.dummyVy = -320 * Math.min(1.5, Math.sqrt(n));
      for (let k = 0; k < 8 * n; k++) {
        const an = rand(-2.4, 0.6), v = rand(120, 400);
        this.fx.push({ x: 60, y: -62 + this.dummyY + rand(-16, 16), vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: rand(0.18, 0.35), c: Math.random() < 0.35 ? '255,255,255' : this.look.slash });
      }
      this.rings.push({ x: 60, y: -62 + this.dummyY, r: 8, life: 0.25 });
      if (badge) this.badges.push({ text: badge, x: 60, y: -95 + this.dummyY, life: 0.75, max: 0.75 });
    };
    for (const q of this.hitQ) { q.t -= dt; if (q.t <= 0) { hit(q.n, q.launch, q.badge); q.done = true; } }
    this.hitQ = this.hitQ.filter(q => !q.done);

    // 飞行物更新与碰撞
    for (const p of this.projs) {
      p.x += (p.vx || 0) * dt;
      p.y = (p.y || -62) + (p.vy || 0) * dt;
      if (p.g) p.vy += p.g * dt;
      p.life -= dt;
      if (p.kind === 'moonring' && p.life < 0.35 && p.vx > 0) p.vx = -p.vx;
      if (!p.hitDone && p.vx > 0 && p.x >= 50 && p.x <= 75) {
        p.hitDone = true;
        hit(1.2, p.kind === 'tornado' || p.kind === 'bolt' || p.kind === 'dragon');
      }
    }
    this.projs = this.projs.filter(p => p.life > 0);

    // 稻草人物理
    this.dummyY += this.dummyVy * dt;
    this.dummyVy += 1300 * dt;
    if (this.dummyY >= 0) { this.dummyY = 0; this.dummyVy = 0; }
    this.dummyShake = Math.max(0, this.dummyShake - dt * 2.2);

    for (const b of this.badges) { b.y -= 25 * dt; b.life -= dt; }
    this.badges = this.badges.filter(b => b.life > 0);
    for (const pud of this.puddles) pud.life -= dt;
    this.puddles = this.puddles.filter(pud => pud.life > 0);

    for (const f of this.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 600 * dt; f.life -= dt; }
    this.fx = this.fx.filter(f => f.life > 0);
    for (const r of this.rings) { r.r += 260 * dt; r.life -= dt; }
    this.rings = this.rings.filter(r => r.life > 0);
    this.flashT = Math.max(0, this.flashT - dt);
    updateScarf(this);
  }
  draw(g, w, h, scale, hideLabel = false) {
    withCtx(g, () => {
      ctx.save(); ctx.translate(w / 2, h * 0.84); ctx.scale(scale, scale);
      // 墨水池等地面特效
      for (const pud of this.puddles) {
        ctx.fillStyle = 'rgba(15,15,22,0.85)';
        ctx.beginPath(); ctx.ellipse(pud.x, 0, 34, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(40,40,65,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // 稻草人靶子（带浮空与晃动）
      const tilt = Math.sin(performance.now() / 25) * this.dummyShake;
      ctx.save(); ctx.translate(60, -60 + this.dummyY); ctx.rotate(tilt); ctx.translate(0, 60);
      ctx.fillStyle = '#4a3322'; ctx.fillRect(-3, -118, 6, 118); ctx.fillRect(-30, -88, 60, 5);
      ctx.fillStyle = this.dummyShake > 0.2 ? '#f5e6c4' : '#b08a5a'; ctx.beginPath(); ctx.ellipse(0, -76, 18, 27, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, -114, 12, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-16, -86); ctx.lineTo(16, -86); ctx.moveTo(-16, -64); ctx.lineTo(16, -64); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(this.x, 2, 36, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      if (this.size !== 1) { ctx.translate(this.x, 0); ctx.scale(this.size, this.size); ctx.translate(-this.x, 0); }
      if (this.ch.fly) drawWings(this.sk, this);
      drawScarf(this); drawBody(this.sk, this, {});
      ctx.restore();
      drawTrail(this);
      ctx.globalCompositeOperation = 'lighter';
      for (const r of this.rings) {
        const rc = r.col || this.look.slash;
        ctx.strokeStyle = `rgba(${rc},${r.life * 2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y || -62, r.r, 0, 7); ctx.stroke();
      }
      for (const f of this.fx) {
        ctx.strokeStyle = `rgba(${f.c},${Math.min(1, f.life * 4)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.03, f.y - f.vy * 0.03); ctx.stroke();
      }
      for (const p of this.projs) {
        const col = p.col || this.look.slash;
        ctx.fillStyle = `rgba(${col},0.85)`;
        if (p.kind === 'swordqi') {
          ctx.beginPath(); ctx.arc(p.x, p.y, 24, -1.2, 1.2); ctx.lineWidth = 5; ctx.strokeStyle = `rgba(${col},0.9)`; ctx.stroke();
        } else if (p.kind === 'quake') {
          ctx.fillStyle = `rgba(${col},0.75)`;
          for (let q = -12; q <= 12; q += 8) { ctx.beginPath(); ctx.moveTo(p.x + q, 0); ctx.lineTo(p.x + q + 4, -16); ctx.lineTo(p.x + q + 8, 0); ctx.fill(); }
        } else if (p.kind === 'bolt') {
          ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(p.x, -260); ctx.lineTo(p.x - 6, -140); ctx.lineTo(p.x + 8, -130); ctx.lineTo(p.x, 0); ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        } else if (p.kind === 'tornado') {
          ctx.strokeStyle = `rgba(${col},0.8)`; ctx.lineWidth = 3;
          for (let rk = 8; rk <= 32; rk += 8) { ctx.beginPath(); ctx.ellipse(p.x, p.y - rk * 1.5, rk, rk * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
        } else if (p.kind === 'dragon') {
          ctx.strokeStyle = 'rgba(25,25,35,0.95)'; ctx.lineWidth = 14; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x - 30, p.y); ctx.quadraticCurveTo(p.x, p.y - 28, p.x + 30, p.y); ctx.stroke();
          ctx.fillStyle = '#ff4a5f'; ctx.beginPath(); ctx.arc(p.x + 24, p.y - 6, 2.5, 0, 7); ctx.fill();
        } else if (p.kind === 'moonring') {
          ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 1.5); ctx.stroke();
        } else if (p.kind === 'feather') {
          ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y); ctx.stroke();
        } else if (p.kind === 'kunai') {
          ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(p.x + 8, p.y); ctx.lineTo(p.x - 6, p.y - 4); ctx.lineTo(p.x - 6, p.y + 4); ctx.fill();
        } else {
          ctx.beginPath(); ctx.ellipse(p.x, p.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      if (this.flashT > 0) { ctx.fillStyle = `rgba(${this.look.slash},${this.flashT})`; ctx.fillRect(0, 0, w, h); }
      for (const b of this.badges) {
        const alpha = Math.min(1, b.life * 2.5);
        ctx.save(); ctx.translate(w / 2, h * 0.84); ctx.scale(scale, scale);
        ctx.font = `bold 12px ${BODY_FONT}`;
        const bw = ctx.measureText(b.text).width;
        ctx.fillStyle = `rgba(10,12,24,${alpha * 0.85})`;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b.x - bw / 2 - 6, b.y - 10, bw + 12, 20, 4) : ctx.rect(b.x - bw / 2 - 6, b.y - 10, bw + 12, 20); ctx.fill();
        ctx.strokeStyle = `rgba(${this.look.slash},${alpha * 0.8})`; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.text, b.x, b.y);
        ctx.restore();
      }
      if (!hideLabel && this.lab) {
        ctx.font = `600 12px ${BODY_FONT}`; const tw = ctx.measureText(this.lab).width;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(8, 8, tw + 18, 22, 11) : ctx.rect(8, 8, tw + 18, 22); ctx.fill();
        ctx.fillStyle = `rgb(${this.look.slash})`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(this.lab, 17, 19.5);
      }
    });
  }
}
const DEMO2 = HERO_FULL_DEMO.qingfeng;
// 演示画布：在一个 canvas 上循环播放某个角色（支持指定招式与变速）
function demoLoop(canvas, getIdx, isOn, getSkin, getMoveKey) {
  const g = canvas.getContext && canvas.getContext('2d'); if (!g) return;
  let pup = null, lastT = performance.now(), curMv = undefined;
  const tick = now => {
    if (!isOn()) {
      setTimeout(() => requestAnimationFrame(tick), 350);
      return;
    }
    const spd = (canvas === $id('cxDemo')) ? cxDemoSpeed : 1.0;
    const dt = Math.min(0.05, (now - lastT) / 1000) * spd; lastT = now;
    const i = getIdx();
    if (i >= 0 && CHARS[i]) {
      const sk = getSkin ? getSkin() : mySkin(CHARS[i].id);
      const mv = getMoveKey ? getMoveKey() : null;
      if (!pup || pup.chIdx !== i || pup.skin !== sk) {
        pup = new Puppet(i, sk);
        curMv = undefined;
      }
      if (mv !== curMv) {
        curMv = mv;
        if (mv && HERO_MOVE_SEQS[CHARS[i].id] && HERO_MOVE_SEQS[CHARS[i].id][mv]) {
          pup.playSeq(HERO_MOVE_SEQS[CHARS[i].id][mv], null, true);
        } else {
          pup.playSeq(HERO_FULL_DEMO[CHARS[i].id] || DEMO2, null, true);
        }
      }
      canvas._pup = pup;
      pup.update(dt);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas._w || (canvas._w = canvas.clientWidth || 280);
      const chh = canvas._h || (canvas._h = canvas.clientHeight || 200);
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(chh * dpr)) {
        canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ST = sk ? sceneOf(sk) : null;
      if (ST) withCtx(g, () => paintSceneCard(cw, chh, ST, now / 1000, chh / 300));
      else {
        const bg = g.createLinearGradient(0, 0, 0, chh); bg.addColorStop(0, '#15163a'); bg.addColorStop(1, '#0b0b1c'); g.fillStyle = bg; g.fillRect(0, 0, cw, chh);
      }
      g.fillStyle = 'rgba(200,180,255,0.12)'; g.fillRect(0, chh * 0.84, cw, 1.5);
      pup.draw(g, cw, chh, chh / 190);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// ======================= 立绘卡面 =======================
const CARD_POSE = { qingfeng: 'hva', feiying: 'dash', tieshan: 'lda', lingshuang: 'l3a', liuyun: 'l2a', leiming: 'l3a', moyu: 'a2s', yuehua: 'victory', yanling: 'a1a' };
function makeCardArt(i, CW, CH, skin) {
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const g = c.getContext && c.getContext('2d'); if (!g) return c;
  const ch = CHARS[i], L = skin ? skinLook(i, skin) : ch.look, rgb = L.slash, seed = i * 13.7;
  withCtx(g, () => {
    const u = CW / 300;   // 卡面按 300 宽设计，再按实际大小缩放
    // 背景：夜色 + 角色主色晕染
    let bg = ctx.createLinearGradient(0, 0, 0, CH); bg.addColorStop(0, '#0d0e24'); bg.addColorStop(0.6, '#191634'); bg.addColorStop(1, '#0a0918');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
    const ST = skin ? sceneOf(skin) : null;
    let rg;
    if (ST) paintSceneCard(CW, CH, ST, 0.8, u);   // 皮肤：画出它自己的场景
    else {
      rg = ctx.createRadialGradient(CW * 0.55, CH * 0.38, 10 * u, CW * 0.55, CH * 0.38, CW * 0.8);
      rg.addColorStop(0, `rgba(${rgb},0.35)`); rg.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = rg; ctx.fillRect(0, 0, CW, CH);
      // 月亮
      ctx.fillStyle = 'rgba(247,236,216,0.9)'; ctx.beginPath(); ctx.arc(CW * 0.64, CH * 0.28, 62 * u, 0, 7); ctx.fill();
      rg = ctx.createRadialGradient(CW * 0.64, CH * 0.28, 55 * u, CW * 0.64, CH * 0.28, 150 * u);
      rg.addColorStop(0, 'rgba(255,236,210,0.35)'); rg.addColorStop(1, 'rgba(255,236,210,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, CW, CH);
      // 远山
      ctx.fillStyle = 'rgba(30,26,60,0.9)'; ctx.beginPath(); ctx.moveTo(0, CH);
      for (let x = 0; x <= CW; x += 6 * u) ctx.lineTo(x, CH * 0.66 - Math.sin(x / (40 * u) + seed) * 18 * u - Math.sin(x / (17 * u) + seed * 2) * 7 * u);
      ctx.lineTo(CW, CH); ctx.fill();
    }
    // 竹影
    ctx.strokeStyle = 'rgba(8,8,20,0.8)';
    for (let k = 0; k < 5; k++) { const x = (hash(seed + k) * 0.9 + 0.05) * CW, w = (3 + hash(seed + k + 9) * 4) * u; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, CH); ctx.lineTo(x + 6 * u, 0); ctx.stroke(); }
    // 墨点飞溅
    for (let k = 0; k < 26; k++) { ctx.fillStyle = k % 3 ? 'rgba(10,10,20,0.55)' : `rgba(${rgb},0.35)`; ctx.beginPath(); ctx.arc(hash(seed + k * 3) * CW, CH * 0.55 + hash(seed + k * 7) * CH * 0.4, (1 + hash(seed + k) * 5) * u, 0, 7); ctx.fill(); }
    // 角色（大尺寸、招式姿势，围巾先模拟一会儿让它飘起来）
    const pose = POSES[CARD_POSE[ch.id] || 'l1a'];
    const f = { x: CW * 0.42, y: CH * 0.86, face: 1, rot: 0, j: {}, look: { ...L, name: ch.name }, ch, wlen: WEAPON_LEN[L.weapon] || 54, size: ch.size || 1, idx: i, scarf: [], flying: !!ch.fly, state: ch.fly ? 'air' : 'idle' };
    for (const k of JOINTS) f.j[k] = [...pose[k]]; f.j.sw = pose.sw;
    const S = 2.25 * u * (ch.size || 1);
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(S, S); ctx.translate(-f.x, -f.y);
    f.sk = skeleton(f);
    for (let k = 0; k < 90; k++) { updateScarf(f); for (const p of f.scarf) p.x -= 0.25; }
    const gl = ctx.createRadialGradient(f.x, f.y - 60, 4, f.x, f.y - 60, 90); gl.addColorStop(0, `rgba(${rgb},0.35)`); gl.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gl; ctx.fillRect(f.x - 100, f.y - 160, 200, 200);
    if (ch.fly) drawWings(f.sk, f);
    drawScarf(f); drawBody(f.sk, f, {});
    // 刀光
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${rgb},0.55)`; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(f.x + 10, f.y - 70, 62, -1.9, 0.5); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // 竖排书法名字 + 印章
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.round(54 * u)}px ${TITLE_FONT}`;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; [...ch.name].forEach((t, k) => ctx.fillText(t, CW - 38 * u + 2 * u, 70 * u + k * 58 * u + 2 * u));
    ctx.fillStyle = '#f4ead5'; [...ch.name].forEach((t, k) => ctx.fillText(t, CW - 38 * u, 70 * u + k * 58 * u));
    ctx.translate(CW - 38 * u, 70 * u + ch.name.length * 58 * u + 16 * u); ctx.rotate(-0.06);
    ctx.fillStyle = '#b8392e'; ctx.fillRect(-16 * u, -16 * u, 32 * u, 32 * u);
    ctx.strokeStyle = 'rgba(255,240,225,0.6)'; ctx.lineWidth = 1.2 * u; ctx.strokeRect(-13 * u, -13 * u, 26 * u, 26 * u);
    ctx.fillStyle = '#fbeee0'; ctx.font = `${Math.round(15 * u)}px ${TITLE_FONT}`; ctx.fillText(ch.role.slice(0, 2), 0, 1 * u);
    ctx.restore();
    // 金色双线边框和角花
    if (ST) {   // 皮肤名：竖排名字下面的小字，稀有是银蓝色，传说是金色
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sy = 70 * u + ch.name.length * 58 * u + 58 * u;
      ctx.font = `${Math.round(13 * u)}px ${BODY_FONT}`; ctx.fillStyle = ST.legend ? '#e9c46a' : '#a8cfff';
      ctx.fillText(ST.legend ? '传说' : '稀有', CW - 38 * u, sy);
      ctx.font = `${Math.round(24 * u)}px ${TITLE_FONT}`;
      [...ST.name].forEach((t, k) => ctx.fillText(t, CW - 38 * u, sy + 26 * u + k * 27 * u));
      ctx.restore();
    }
    const fc = ST && !ST.legend ? '168,207,255' : '233,196,106';
    ctx.strokeStyle = `rgba(${fc},0.85)`; ctx.lineWidth = 2 * u; ctx.strokeRect(7 * u, 7 * u, CW - 14 * u, CH - 14 * u);
    ctx.strokeStyle = `rgba(${fc},0.4)`; ctx.lineWidth = 1 * u; ctx.strokeRect(12 * u, 12 * u, CW - 24 * u, CH - 24 * u);
    if (ST && ST.legend) {   // 传说卡面：四角云纹 + 底部的主题图案
      ctx.strokeStyle = 'rgba(255,225,150,0.9)'; ctx.lineWidth = 1.6 * u;
      for (const [cx, cy, sx, sy] of [[7, 7, 1, 1], [CW / u - 7, 7, -1, 1], [7, CH / u - 7, 1, -1], [CW / u - 7, CH / u - 7, -1, -1]]) {
        ctx.save(); ctx.translate(cx * u, cy * u); ctx.scale(sx * u, sy * u);
        ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(0, 0); ctx.lineTo(34, 0); ctx.moveTo(6, 26); ctx.quadraticCurveTo(6, 6, 26, 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(14, 14, 4, 0, 7); ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.translate(CW / 2, CH - 34 * u); ctx.globalCompositeOperation = 'lighter'; drawGlyph(ST.hit, 18 * u, ST.hitC, 0.7); ctx.restore();
    }
    for (const [cx, cy, sx, sy] of [[12, 12, 1, 1], [CW / u - 12, 12, -1, 1], [12, CH / u - 12, 1, -1], [CW / u - 12, CH / u - 12, -1, -1]]) {
      ctx.save(); ctx.translate(cx * u, cy * u); ctx.scale(sx * u, sy * u);
      ctx.strokeStyle = 'rgba(233,196,106,0.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(10, 10, 8, Math.PI, Math.PI * 1.5); ctx.moveTo(0, 22); ctx.lineTo(0, 0); ctx.lineTo(22, 0); ctx.stroke();
      ctx.restore();
    }
    // 底部渐隐和定位文字
    const fade = ctx.createLinearGradient(0, CH * 0.8, 0, CH); fade.addColorStop(0, 'rgba(10,9,24,0)'); fade.addColorStop(1, 'rgba(10,9,24,0.85)');
    ctx.fillStyle = fade; ctx.fillRect(0, CH * 0.8, CW, CH * 0.2);
    ctx.fillStyle = `rgb(${rgb})`; ctx.font = `${Math.round(13 * u)}px ${BODY_FONT}`; ctx.textAlign = 'left';
    ctx.fillText(ch.role, 20 * u, CH - 22 * u);
  });
  return c;
}
function makePortrait(i) { try { return makeCardArt(i, 240, 320, typeof mySkin === 'function' ? mySkin(CHARS[i].id) : '').toDataURL(); } catch (e) { return ''; } }
function ensurePortraits() { if (!PORTRAITS.length) for (let i = 0; i < CHARS.length; i++) PORTRAITS.push(makePortrait(i)); }
const bpMySide = () => bpMode === 'net' ? (NET.role === 'host' ? 0 : 1) : 0;
const bpAuth = () => bpMode === 'cpu' || NET.role === 'host';
const bpSideName = side => {
  if (side === bpMySide()) return '你';
  if (bpMode === 'cpu') return '电脑';
  const n = NET.names && NET.names[side === 0 ? 'host' : 'client'];
  return n ? String(n) : '对手';
};
function bpStart(mode) {
  if (mode === 'cpu') netDropWaiting();
  ensurePortraits(); chatClear();
  bpMode = mode; BP = { step: 0, bans: [-1, -1], picks: [-1, -1], t: BP_TIME, avail: [availList(), mode === 'net' ? (NET.peerAvail || null) : null] }; bpSel = -1; bpCpuT = 1;
  showScreen('bp'); renderBP();
  if (mode === 'net') send({ bps: BP });
}
function bpValid(i) {
  if (!BP || BP.step >= 4 || i < 0 || i >= CHARS.length) return false;
  if (BP.bans.includes(i)) return false;
  if (BP_STEPS[BP.step][1] === 'pick' && BP.picks.includes(i)) return false;
  if (BP_STEPS[BP.step][1] === 'pick') {
    const av = BP.avail && BP.avail[BP_STEPS[BP.step][0]];
    // 自己能用的角色都被禁或被选走时，放开限制，保证总能选
    if (av && av.some(k => !BP.bans.includes(k) && !BP.picks.includes(k)) && !av.includes(i)) return false;
  }
  return true;
}
function bpApply(i) {
  if (!bpValid(i)) return;
  const [side, type] = BP_STEPS[BP.step];
  (type === 'ban' ? BP.bans : BP.picks)[side] = i;
  BP.step++; BP.t = BP_TIME; bpSel = -1; bpCpuT = 1;
  if (type === 'ban') SFX.thud(); else { SFX.block(); }
  if (bpMode === 'net') send({ bps: BP });
  renderBP();
  if (BP.step >= 4) setTimeout(bpFinish, 1100);
}
function bpFinish() {
  if (!BP || BP.step < 4) return;
  showPop(null);
  const picks = BP.picks.slice(); BP = null;
  showScreen(null);
  MSTAT.maxcombo = 0; MSTAT.ults = 0;
  if (bpMode === 'cpu') startMatch('cpu', pickLevel, picks);
  else if (NET.role === 'host') { const seed = (Math.random() * 2147483647) | 0; send({ rstart: { ch: picks, seed } }); rollStart(picks, seed); }
  applySkins();
}
// 电脑选人：禁掉一个随机角色；选人时六成概率挑能克制你的角色
function bpCpuChoice() {
  const valid = CHARS.map((c, i) => i).filter(bpValid);
  if (pickLevel === 'adaptive') {
    const fav = adaptFav(), type = BP_STEPS[BP.step][1];
    if (type === 'ban' && fav.best >= 0 && valid.includes(fav.best)) return fav.best;       // 禁你胜率最高的
    if (type === 'pick' && fav.most >= 0 && valid.includes(fav.most)) return fav.most;      // 用你最常用的
  }
  if (BP_STEPS[BP.step][1] === 'pick' && BP.picks[0] >= 0 && Math.random() < 0.6) {
    const mine = CHARS[BP.picks[0]].id;
    const counters = valid.filter(i => CHARS[i].beats.includes(mine));
    if (counters.length) return counters[Math.random() * counters.length | 0];
  }
  return valid[Math.random() * valid.length | 0];
}
function bpTick(dt) {
  if (!BP || BP.step >= 4 || !document.getElementById('bp').classList.contains('on') || NET.hold) return;
  BP.t = Math.max(0, BP.t - dt);
  document.getElementById('bpTime').textContent = `${Math.ceil(BP.t)} 秒`;
  document.getElementById('bpTime').classList.toggle('urgent', BP.t <= 8);
  if (!bpAuth()) return;
  const side = BP_STEPS[BP.step][0];
  if (bpMode === 'cpu' && side === 1) { bpCpuT -= dt; if (bpCpuT <= 0) bpApply(bpCpuChoice()); return; }
  if (BP.t <= 0) { const v = CHARS.map((c, i) => i).filter(bpValid); bpApply(bpSel >= 0 && bpValid(bpSel) && side === bpMySide() ? bpSel : v[Math.random() * v.length | 0]); }
}
function bpDetailHTML(i) {
  if (i < 0) return '<p style="color:var(--dim);grid-column:1/-1;margin:0">把鼠标移到角色上，可查看招式与克制关系。</p>';
  const c = CHARS[i], S = SKILLS[c.skill], U = ULTS[c.ult];
  const curSkin = mySkin(c.id);
  const L = skinLook(i, curSkin);
  const col = `rgb(${L.slash})`;
  const nm = ids => (ids || []).map(id => (CHARS[CHAR_IDX[id]] ? CHARS[CHAR_IDX[id]].name : id)).filter(Boolean).join('、') || '无';

  return `<img src="${PORTRAITS[i] || makePortrait(i)}" alt="" style="border:1px solid ${col};border-radius:6px">
    <div><h3 style="color:${col};display:flex;align-items:center;gap:8px;margin:0 0 4px">${c.name}${curSkin ? `<span class="pill" style="font-size:12px;color:${col};border-color:${col}">皮肤 · ${SKINS[curSkin].name}</span>` : ''}</h3>
    <!-- 皮肤改在角色图鉴里装配：选人是有时限的，这里只显示当前装束 -->
    <div class="meta"><span>${c.role}</span><span>上手难度 ${'★'.repeat(c.diff)}${'☆'.repeat(3 - c.diff)}</span><span>生命 ${c.stat.hp}</span></div>
    <dl><dt>被动 ${c.passiveName}</dt><dd>${c.passiveDesc}</dd>
    <dt>技能 ${S.name}</dt><dd>${S.desc}（冷却 ${S.cd} 秒）</dd>
    <dt>大招 ${U.name}</dt><dd>${U.desc}</dd>${ADV[c.id] ? `<dt>进阶</dt><dd>${ADV[c.id]}</dd>` : ''}</dl>
    <p class="ctr">克制 <b>${nm(c.beats)}</b>　怕 <b>${nm(c.weakTo)}</b></p></div>`;
}
function buildDetails(force) {
  const box = document.getElementById('bpDetail');
  if (!force && box.dataset.built === String(PORTRAITS.length)) return;
  box.innerHTML = [-1, ...CHARS.map((c, i) => i)].map(i => `<div class="bpd" data-i="${i}">${bpDetailHTML(i)}</div>`).join('');
  box.dataset.built = String(PORTRAITS.length);
}
let bpDeckMove = 'light';
function updateBPDeck(i) {
  const idx = i >= 0 ? i : (bpSel >= 0 ? bpSel : 0);
  const ch = CHARS[idx];
  if (!ch) return;
  const curSkin = mySkin(ch.id);
  const L = skinLook(idx, curSkin);
  const col = `rgb(${L.slash})`;
  const tabs = [
    { k: 'light', lab: '普攻连击' },
    { k: 'charge', lab: '蓄力重斩' },
    { k: 'skill', lab: `Q · ${SKILLS[ch.skill].name}` },
    { k: 'ranged', lab: `R · ${SKILLS[ch.skill2].name}` },
    { k: 'ult', lab: `E · ${ULTS[ch.ult].name}` },
  ];
  const tabsEl = $id('bpDeckTabs');
  if (tabsEl) {
    tabsEl.innerHTML = tabs.map(t => `<button class="${t.k === bpDeckMove ? 'sel' : ''}" data-m="${t.k}">${t.lab}</button>`).join('');
    requestAnimationFrame(() => tabsEl.classList.toggle('overflowing', tabsEl.scrollWidth > tabsEl.clientWidth + 2));
  }
  const hit = (HERO_HIT_DETAILS[ch.id] && HERO_HIT_DETAILS[ch.id][bpDeckMove]) || { name: '', badge: '', badgeCls: 'badge-buff', dmg: '', desc: '' };
  const nameEl = $id('bpdHitName');
  if (nameEl) {
    nameEl.innerHTML = `<span style="color:${col}">${hit.name}</span>${hit.dmg ? ` <span style="font-size:12px;color:var(--gold);font-weight:600">· 伤害 ${hit.dmg}</span>` : ''}`;
  }
  const badgeEl = $id('bpdHitBadge');
  if (badgeEl) {
    badgeEl.innerHTML = hit.badge ? `<span class="${hit.badgeCls}">${hit.badge}</span>` : '';
  }
  const descEl = $id('bpdHitDesc');
  if (descEl) {
    descEl.textContent = hit.desc;
  }
}

const bpDeckTabsEl = $id('bpDeckTabs');
if (bpDeckTabsEl) {
  bpDeckTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    bpDeckMove = b.dataset.m;
    const idx = bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0);
    updateBPDeck(idx);
    const cv = $id('bpDeckCanvas');
    if (cv && cv._pup && HERO_MOVE_SEQS[CHARS[idx].id] && HERO_MOVE_SEQS[CHARS[idx].id][bpDeckMove]) {
      cv._pup.playSeq(HERO_MOVE_SEQS[CHARS[idx].id][bpDeckMove], null, true);
    }
    SFX.slice();
  });
}
demoLoop($id('bpDeckCanvas'), () => (bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0)), () => $id('bp') && $id('bp').classList.contains('on'), () => mySkin(CHARS[(bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0))].id), () => bpDeckMove);

const bpDetailEl = $id('bpDetail');
if (bpDetailEl) {
  bpDetailEl.addEventListener('click', e => {
    const b = e.target.closest('.bp-skin-btn');
    if (!b) return;
    const idx = +b.dataset.i;
    const sk = b.dataset.sk || '';
    const ch = CHARS[idx];
    if (!ch) return;
    const has = !sk || (PROF.skins || []).includes(sk) || OFFLINE_BUILD || DEV_SESSION_UNLOCKED;
    if (!has) {
      SFX.slice();
      toast('尚未解锁该皮肤');
      return;
    }
    PROF.equip = PROF.equip || {};
    if (sk) PROF.equip[ch.id] = sk;
    else delete PROF.equip[ch.id];
    try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (err) {}
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    PORTRAITS.length = 0;
    ensurePortraits();
    applyProfile(PROF);
    buildDetails(true);
    setDetail(idx);
    updateBPDeck(idx);
    renderBP();
    if (M.mode === 'net' || bpMode === 'net') {
      send({ pskin: PROF.equip || {} });
    }
    const cv = $id('bpDeckCanvas');
    if (cv && cv._pup) {
      cv._pup = new Puppet(idx, sk);
      if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][bpDeckMove]) {
        cv._pup.playSeq(HERO_MOVE_SEQS[ch.id][bpDeckMove], null, true);
      }
    }
    SFX.slice();
    toast(sk ? `已装配「${SKINS[sk].name}」` : '已换回原本装束');
  });
}

function setDetail(i) {
  buildDetails();
  for (const el of document.querySelectorAll('#bpDetail .bpd')) el.classList.toggle('show', +el.dataset.i === i);
  updateBPDeck(i);
}

function renderBP() {
  if (!BP) return;
  $id('bpChat').classList.toggle('hidden', bpMode !== 'net');
  const my = bpMySide(), done = BP.step >= 4;
  const [side, type] = done ? [-1, ''] : BP_STEPS[BP.step];
  const myTurn = !done && side === my;
  document.getElementById('bpStep').innerHTML = (bpMode === 'net' && NET.isRanked ? '排位赛 · ' : '') + (done ? '准备开战' : `${bpSideName(side)}${type === 'ban' ? '禁用' : '选择'}一个角色`)
    + (done ? '' : `<span class="bpcount">第 ${BP.step + 1} / ${BP_STEPS.length} 步</span>`);
  document.getElementById('bpStep').style.color = myTurn ? '#e9c46a' : 'var(--ink)';
  document.getElementById('bpTime').textContent = done ? '' : `${Math.ceil(BP.t)} 秒`;
  for (const sd of [0, 1]) {
    const slot = (idx, kind, active) => `<div class="slot2 ${kind}${active ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${kind === 'ban' ? '禁 ' : ''}${CHARS[idx].name}</span>` : (kind === 'ban' ? '禁用' : '选择')}</div>`;
    const keep = [...document.getElementById('bpS' + sd).querySelectorAll('.bubble')];
    document.getElementById('bpS' + sd).innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${escapeHTML(bpSideName(sd))}</div>
      <div class="slots">${slot(BP.bans[sd], 'ban', !done && side === sd && type === 'ban')}${slot(BP.picks[sd], 'pick', !done && side === sd && type === 'pick')}</div>`;
    for (const b of keep) document.getElementById('bpS' + sd).appendChild(b);
  }
  document.getElementById('bpGrid').innerHTML = CHARS.map((c, i) => {
    const banned = BP.bans.includes(i), pickedBy = BP.picks.indexOf(i);
    const can = myTurn && bpValid(i);
    const myAv = BP.avail && BP.avail[my];
    const lock = !OFFLINE_BUILD && !DEV_SESSION_UNLOCKED && myAv && !myAv.includes(i);
    const free = !OFFLINE_BUILD && !DEV_SESSION_UNLOCKED && !(PROF.owned || []).includes(c.id) && (PROF.rotation || []).includes(c.id);
    const tag = banned ? '<span class="tag">禁</span>' : pickedBy >= 0 ? `<span class="tag p">${escapeHTML(bpSideName(pickedBy))}</span>` : lock ? '<span class="tag lk">未拥有</span>' : free ? '<span class="tag free">限免</span>' : '';
    const state = banned ? '，已禁用' : pickedBy >= 0 ? '，已被选择' : lock ? '，未拥有' : free ? '，本周限免' : '';
    const aria = `${c.name}，${c.role}${state}${bpSel === i ? '，已选中' : ''}${can ? '' : '，当前不可选'}`;
    return `<button class="bpcard${lock ? ' lock' : ''}${banned ? ' banned' : ''}${pickedBy >= 0 ? ' picked' : ''}${bpSel === i ? ' sel' : ''}" data-i="${i}" aria-label="${aria}" ${can ? '' : 'aria-disabled="true"'}>
      ${tag}<img src="${PORTRAITS[i] || ''}" alt=""><div class="nm" style="color:rgb(${c.look.slash})">${c.name}</div><div class="rl">${c.role}</div></button>`;
  }).join('');
  const show = bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0);
  setDetail(show);
  const goB = document.getElementById('bpGo');
  goB.disabled = !(myTurn && bpValid(bpSel));
  goB.textContent = myTurn ? (bpSel >= 0 ? `${type === 'ban' ? '禁用' : '选择'} ${CHARS[bpSel].name}` : (type === 'ban' ? '选一个禁用' : '选一个角色')) : '等待对方';
}
document.getElementById('bpGrid').addEventListener('click', e => {
  const b = e.target.closest('.bpcard'); if (!b || !BP || BP.step >= 4) return;
  const i = +b.dataset.i;
  if (BP_STEPS[BP.step][0] !== bpMySide() || !bpValid(i)) return;
  bpSel = i; SFX.slice(); renderBP();
});
let lastCardClick = { i: -1, t: 0 };
document.getElementById('bpGrid').addEventListener('click', e => {
  const b = e.target.closest('.bpcard'); if (!b) return;
  const i = +b.dataset.i, now = performance.now();
  if (lastCardClick.i === i && now - lastCardClick.t < 400) {
    lastCardClick.i = -1;
    if (BP && BP.step < 4 && BP_STEPS[BP.step][0] === bpMySide() && bpValid(i)) { bpSel = i; bpConfirm(); }
    return;
  }
  lastCardClick = { i, t: now };
});
document.getElementById('bpGrid').addEventListener('dblclick', e => {
  const b = e.target.closest('.bpcard'); if (!b || !BP || BP.step >= 4) return;
  const i = +b.dataset.i;
  if (BP_STEPS[BP.step][0] !== bpMySide() || !bpValid(i)) return;
  bpSel = i; bpConfirm();
});
// 方向键在角色卡之间移动焦点（Enter 触发 click：第一次选中，400 毫秒内再按一次即确认），
// 按实际行分组，窄屏换成多行时上下键依然正确
document.getElementById('bpGrid').addEventListener('keydown', e => {
  const k = e.key;
  if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
  if (!BP || BP.step >= 4) return;
  const cards = [...document.querySelectorAll('#bpGrid .bpcard')];
  if (!cards.length) return;
  const rows = new Map();
  cards.forEach((c, i) => { const t = Math.round(c.getBoundingClientRect().top); if (!rows.has(t)) rows.set(t, []); rows.get(t).push(i); });
  const rowList = [...rows.values()];
  const cur = cards.indexOf(document.activeElement);
  let idx = cur < 0 ? 0 : cur;
  const r = Math.max(0, rowList.findIndex(list => list.includes(idx)));
  const row = rowList[r], pos = row.indexOf(idx);
  if (k === 'ArrowLeft') idx = row[Math.max(0, pos - 1)];
  else if (k === 'ArrowRight') idx = row[Math.min(row.length - 1, pos + 1)];
  else if (k === 'ArrowUp' && r > 0) idx = rowList[r - 1][Math.min(pos, rowList[r - 1].length - 1)];
  else if (k === 'ArrowDown' && r < rowList.length - 1) idx = rowList[r + 1][Math.min(pos, rowList[r + 1].length - 1)];
  if (idx !== cur) { e.preventDefault(); cards[idx].focus(); }
});
// 悬停：更新下部检视视窗
let popIdx = -1;
function showPop(card) {
  const pop = $id('bpPop');
  if (!card) { if (pop) pop.classList.remove('on'); popIdx = -1; return; }
  const i = +card.dataset.i;
  popIdx = i;
  updateBPDeck(i);
  if (pop) pop.classList.remove('on');
}
demoLoop($id('bpPopCv'), () => popIdx, () => false);
document.getElementById('bpGrid').addEventListener('pointerover', e => {
  const b = e.target.closest('.bpcard'); const i = b ? +b.dataset.i : -1;
  if (i !== bpHover) { bpHover = i; setDetail(i >= 0 ? i : bpSel); showPop(b); }
});
document.getElementById('bpGrid').addEventListener('pointerleave', () => { bpHover = -1; setDetail(bpSel); showPop(null); });
function bpConfirm() {
  if (!BP || BP.step >= 4 || BP_STEPS[BP.step][0] !== bpMySide() || !bpValid(bpSel)) return;
  if (bpAuth()) bpApply(bpSel); else { send({ bp: bpSel }); document.getElementById('bpGo').disabled = true; }
}
document.getElementById('bpGo').addEventListener('click', bpConfirm);
document.getElementById('bpQuit').addEventListener('click', () => toMenu());

// ======================= 联机界面 =======================
function $id(id) { return document.getElementById(id); }

// ======================= 账号和排行榜 =======================
const ACC = { token: '', name: '', wins: 0, losses: 0 };
try { ACC.token = localStorage.getItem('renying-token') || ''; } catch (e) {}
async function api(path, body) {
  const hd = ACC.token ? { Authorization: 'Bearer ' + ACC.token } : {};
  const opt = body ? { method: 'POST', headers: { ...hd, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: hd };
  const r = await fetch(path, opt);
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.err || '服务器出错了');
  return j;
}
function setAcc(j) {
  if (j && j.name) { Object.assign(ACC, { name: j.name, wins: j.wins, losses: j.losses, cwins: j.cwins || 0, closses: j.closses || 0 }); if (j.token) ACC.token = j.token; }
  else { ACC.token = ''; ACC.name = ''; }
  try { if (ACC.token) localStorage.setItem('renying-token', ACC.token); else localStorage.removeItem('renying-token'); } catch (e) {}
  const nk = (ACC.token || '') + '|' + ACC.name;
  if (nk !== setAcc.last) { setAcc.last = nk; loadProfile(); adaptLoad(); }
  renderAcc();
}
function renderAcc() {
  const bar = $id('accBar');
  if (OFFLINE_BUILD) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const u = (window.CloudSave && CloudSave.getUser()) || (ACC.name ? ACC : null);
  const isCloud = window.CloudSave && CloudSave.hasValidConfig();
  const cloudBadge = isCloud
    ? '<span class="rk" style="background:rgba(70,211,234,.18);color:#46d3ea">云端已连</span>'
    : '<span class="rk" style="background:rgba(233,196,106,.15);color:#e9c46a">本地存档</span>';
  bar.innerHTML = u && u.name
    ? `<span class="who">${escapeHTML(u.name)}</span>${cloudBadge}<span class="ink">墨锭 ${PROF.ink || 0}</span><button class="ghost" id="accOpen">账号与云存档</button><button class="ghost" id="logoutBtn">退出</button>`
    : `<button class="ghost" id="accOpen">登录 / 注册</button>`;
  $id('accHint').textContent = u && u.name
    ? `当前登录：【${u.name}】· 英雄与成就自动持久化保存`
    : '单账号云端存储：登录后，英雄解锁、墨锭与成就自动同步到云端';

  // 开发者专享：全量备份与 Google Cloud 编辑器仅向 Dev 账号开放
  const actionBtns = $id('accActionBtns');
  if (actionBtns) {
    const isDev = (u && u.name && u.name.toLowerCase() === 'dev') || (u && u.isDevMaster);
    const devCloudBtn = $id('devCloudBtn');
    if (devCloudBtn) {
      if (isDev) devCloudBtn.classList.remove('hidden');
      else {
        devCloudBtn.classList.add('hidden');
        if ($id('devCloudBox')) $id('devCloudBox').classList.add('hidden');
      }
    }
    let expAll = $id('exportAllBtn');
    if (isDev) {
      if (!expAll) {
        expAll = document.createElement('button');
        expAll.id = 'exportAllBtn';
        expAll.className = 'ghost small';
        expAll.style.cssText = 'font-size:12px;padding:3px 10px;color:var(--gold)';
        expAll.title = '将本机所有账号与数据打包备份';
        expAll.textContent = '📦 备份所有账号';
        expAll.addEventListener('click', () => {
          if (window.CloudSave) {
            try {
              CloudSave.exportAllAccounts();
              toast('已成功打包备份本机所有账号');
            } catch (err) {
              alert(err.message);
            }
          }
        });
        actionBtns.appendChild(expAll);
      }
    } else {
      if (expAll) expAll.remove();
    }
  }
}
function escapeHTML(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function triggerStealthDevUnlock(silent) {
  DEV_SESSION_UNLOCKED = true;
  try { sessionStorage.setItem('renying-dev-unlock', '1'); } catch (e) {}
  if (!silent) SFX.chargeFull();
  renderAcc();
  if (typeof BP !== 'undefined' && BP) renderBP();
  if (typeof renderCodex === 'function' && $id('codex').classList.contains('on')) renderCodex();
  if (typeof renderGacha === 'function' && $id('gacha').classList.contains('on')) renderGacha();
  if (typeof renderStages === 'function' && $id('single').classList.contains('on')) renderStages();
  if (typeof renderTrainPick === 'function') renderTrainPick();
}

if ($id('exportAccBtn')) {
  $id('exportAccBtn').addEventListener('click', () => {
    if (window.CloudSave) {
      CloudSave.exportCurrentAccount(PROF);
      toast('已成功导出当前账号存档');
    }
  });
}

$id('accBar').addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'accOpen') {
    $id('accMsg').textContent = '';
    const u = window.CloudSave && CloudSave.getUser();
    if (u && u.name) $id('accName').value = u.name;
    const cfg = window.CloudSave && CloudSave.getConfig();
    if ($id('fbCfgIn') && cfg && cfg.projectId) $id('fbCfgIn').value = JSON.stringify(cfg, null, 2);
    menuCam.tz = 1.35;
    showScreen('acc');
    setTimeout(() => $id('accName').focus(), 50);
  } else if (id === 'lbBtn') {
    openLeaderboard();
  } else if (id === 'logoutBtn') {
    if (SERVED && window.fetch) {
      try { await api('/api/logout', { token: ACC.token }); } catch (err) {}
    }
    if (window.CloudSave) await CloudSave.logout();
    setAcc(null);
    PROF.guest = true;
    applyProfile({ guest: true, ink: 500, owned: ['qingfeng'], frags: {}, pity: 0, skins: [], equip: {}, netWins: 0, netLosses: 0 });
    toast('已退出账号');
    renderAcc();
  }
});
async function doAcc(kind) {
  const name = $id('accName').value.trim(), pass = $id('accPass').value;
  if (!name || !pass) { $id('accMsg').textContent = '昵称与密码都得填'; return; }
  $id('accMsg').textContent = kind === 'login' ? '登录中…' : '注册中…';
  try {
    if (window.CloudSave) {
      const res = await (kind === 'login' ? CloudSave.login(name, pass) : CloudSave.register(name, pass));
      ACC.name = res.name;
      ACC.token = res.uid;
      PROF.guest = false;
      if (res.isDevMaster || (res.name && res.name.toLowerCase() === 'dev')) {
        triggerStealthDevUnlock(true);
      }
      const loaded = await CloudSave.loadProfile();
      if (loaded) {
        applyProfile(loaded);
      } else {
        CloudSave.saveProfile(PROF, true);
      }
      renderAcc();
    }
    $id('accPass').value = '';
    backToMenu();
    toast(kind === 'login' ? `欢迎归来，${name}！已载入存档` : `注册成功！大侠 ${name}，已开启专属存档`);
  } catch (err) {
    $id('accMsg').textContent = err.message;
  }
}
$id('loginBtn').addEventListener('click', () => doAcc('login'));
$id('regBtn').addEventListener('click', () => doAcc('register'));
$id('accPass').addEventListener('keydown', e => { if (e.key === 'Enter') doAcc('login'); });
$id('accBack').addEventListener('click', backToMenu);

if ($id('devCloudBtn')) {
  $id('devCloudBtn').addEventListener('click', async () => {
    const box = $id('devCloudBox');
    if (!box) return;
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) {
      const u = window.CloudSave && CloudSave.getUser();
      const isCloud = window.CloudSave && CloudSave.hasValidConfig() && u && u.isCloud;
      const badge = $id('devCloudBadge');
      if (badge) {
        if (isCloud) {
          badge.textContent = '✅ 云端已连通 (Firestore)';
          badge.style.color = '#46d3ea';
        } else if (window.CloudSave && CloudSave.hasValidConfig()) {
          badge.textContent = '⚡ 云配置就绪 (可同步)';
          badge.style.color = 'var(--gold)';
        } else {
          badge.textContent = '⚠️ 本地独立模式 (未配置云)';
          badge.style.color = '#ff6b6b';
        }
      }
      const docRef = $id('devCloudDocRef');
      if (docRef) docRef.textContent = 'users/' + ((u && u.uid) || 'dev_master');
      const inEl = $id('devCloudJsonIn');
      if (inEl && (!inEl.value || inEl.value.trim() === '')) {
        let p = null;
        if (window.CloudSave) {
          try { p = await CloudSave.loadProfile(); } catch (e) {}
        }
        inEl.value = JSON.stringify(p || PROF, null, 2);
      }
    }
  });
}

if ($id('devCloudUnlockAllBtn')) {
  $id('devCloudUnlockAllBtn').addEventListener('click', async () => {
    const msg = $id('devCloudMsg');
    if (msg) {
      msg.style.color = 'var(--gold)';
      msg.textContent = '正在向 Google Cloud 写入全解锁数据…';
    }
    try {
      if (!window.CloudSave) throw new Error('云存档模块未加载');
      const res = await CloudSave.unlockAllOnCloud();
      applyProfile(res.data);
      triggerStealthDevUnlock(true);
      if ($id('devCloudJsonIn')) $id('devCloudJsonIn').value = JSON.stringify(res.data, null, 2);
      if (msg) {
        msg.style.color = res.isCloud ? '#46d3ea' : 'var(--gold)';
        msg.textContent = res.isCloud
          ? '✅ 成功！Google Cloud Firestore (9英雄 + 18皮肤 + 99999墨锭) 已全部云端解锁并写入！'
          : '⚡ 本地全英雄全皮肤已解锁！请配置 Firebase 云端以便同步至 Google Cloud。';
      }
      toast(res.isCloud ? 'Google Cloud 全解锁成功！' : '本地全英雄皮肤全解锁已生效！');
      renderAcc();
    } catch (err) {
      if (msg) {
        msg.style.color = '#ff6b6b';
        msg.textContent = '全解锁写入失败：' + err.message;
      }
    }
  });
}

if ($id('devCloudPullBtn')) {
  $id('devCloudPullBtn').addEventListener('click', async () => {
    const msg = $id('devCloudMsg');
    if (msg) {
      msg.style.color = '#46d3ea';
      msg.textContent = '正在从 Google Cloud Firestore 拉取…';
    }
    try {
      if (!window.CloudSave) throw new Error('云存档模块未加载');
      const u = CloudSave.getUser();
      const p = await (CloudSave.hasValidConfig() && u && u.isCloud
        ? CloudSave.getCloudDocument('users', u.uid)
        : CloudSave.loadProfile());
      if (p) {
        applyProfile(p);
        renderAcc();
        if ($id('devCloudJsonIn')) $id('devCloudJsonIn').value = JSON.stringify(p, null, 2);
        if (msg) {
          msg.style.color = '#46d3ea';
          msg.textContent = '✅ 已从 Google Cloud 拉取最新档案！';
        }
        toast('已从云端拉取最新数据');
      } else {
        throw new Error('未读取到云端档案或尚未创建');
      }
    } catch (err) {
      if (msg) {
        msg.style.color = '#ff6b6b';
        msg.textContent = '拉取失败：' + err.message;
      }
    }
  });
}

if ($id('devCloudPushBtn')) {
  $id('devCloudPushBtn').addEventListener('click', async () => {
    const msg = $id('devCloudMsg');
    const inEl = $id('devCloudJsonIn');
    if (!inEl || !inEl.value.trim()) {
      if (msg) { msg.style.color = '#ff6b6b'; msg.textContent = '请输入有效的 JSON 数据'; }
      return;
    }
    if (msg) {
      msg.style.color = 'var(--gold)';
      msg.textContent = '正在推送更新至 Google Cloud…';
    }
    try {
      if (!window.CloudSave) throw new Error('云存档模块未加载');
      const parsed = JSON.parse(inEl.value.trim());
      const u = CloudSave.getUser();
      const uid = (u && u.uid) || 'dev_master';
      const saved = await CloudSave.setCloudDocument('users', uid, parsed);
      applyProfile(saved);
      renderAcc();
      if (msg) {
        msg.style.color = '#46d3ea';
        msg.textContent = '✅ 已成功将修改保存推送至 Google Cloud！';
      }
      toast('云端档案已更新');
    } catch (err) {
      if (msg) {
        msg.style.color = '#ff6b6b';
        msg.textContent = '推送失败：' + err.message;
      }
    }
  });
}

if ($id('toggleCloudCfgBtn')) {
  $id('toggleCloudCfgBtn').addEventListener('click', () => {
    $id('cloudCfgBox').classList.toggle('hidden');
  });
}
if ($id('fbCfgSaveBtn')) {
  $id('fbCfgSaveBtn').addEventListener('click', () => {
    try {
      const val = $id('fbCfgIn').value.trim();
      const parsed = JSON.parse(val);
      if (!parsed.projectId || !parsed.apiKey) throw new Error('配置需包含 projectId 和 apiKey');
      if (window.CloudSave) {
        CloudSave.setConfig(parsed);
        const u = CloudSave.getUser();
        if (u && (u.isDevMaster || (u.name && u.name.toLowerCase() === 'dev'))) {
          CloudSave.login('Dev', 'IAMADEVBRO').then(() => {
            renderAcc();
            toast('Firebase 云端已连接！Dev 账号已在 Google Cloud 完成全解锁！');
          }).catch(err => {
            console.warn('Dev auto cloud sync error:', err);
          });
        }
      }
      toast('Firebase 云端配置已保存！正在连线…');
      $id('cloudCfgBox').classList.add('hidden');
      renderAcc();
    } catch (e) {
      alert('配置格式错误：' + e.message);
    }
  });
}
if ($id('fbCfgClearBtn')) {
  $id('fbCfgClearBtn').addEventListener('click', () => {
    if (window.CloudSave) CloudSave.setConfig(null);
    if ($id('fbCfgIn')) $id('fbCfgIn').value = '';
    toast('已恢复为本地独立单账号模式');
    $id('cloudCfgBox').classList.add('hidden');
    renderAcc();
  });
}

// ======================= 老站数据继承与导入 =======================
const LEGACY_USERS = [{"id": 1, "name": "Luffy", "wins": 8, "losses": 8, "rating": 1035, "placed": 11, "ink": 1358, "owned": ["qingfeng", "yanling", "leiming", "tieshan"], "frags": {"yuehua": 12, "liuyun": 13, "lingshuang": 12, "moyu": 13, "feiying": 13}, "pity": 1, "spity": 1, "skins": ["ly_dusk", "yl_phoenix", "lm_violet", "qf_gold", "ts_obsidian", "ts_bronze"], "equip": {"yanling": "yl_phoenix", "qingfeng": "qf_gold"}}, {"id": 2, "name": "设计失败的草履虫", "wins": 11, "losses": 11, "rating": 1152, "placed": 17, "ink": 478, "owned": ["qingfeng", "leiming", "tieshan", "liuyun", "lingshuang"], "frags": {"yuehua": 15, "feiying": 22, "yanling": 15, "moyu": 15}, "pity": 1, "spity": 5, "skins": ["qf_gold", "lm_sun"], "equip": {"qingfeng": "qf_gold", "leiming": "lm_sun"}}, {"id": 3, "name": "tct33x7", "wins": 1, "losses": 1, "rating": 1103, "placed": 2, "ink": 650, "owned": ["qingfeng", "lingshuang", "leiming", "liuyun"], "frags": {"moyu": 4, "tieshan": 10, "yanling": 1}, "pity": 9, "spity": 0, "skins": [], "equip": {}}, {"id": 4, "name": "明媚的地球", "wins": 9, "losses": 4, "rating": 1093, "placed": 8, "ink": 44, "owned": ["qingfeng", "lingshuang", "liuyun", "feiying", "yuehua", "leiming", "tieshan", "yanling", "moyu"], "frags": {}, "pity": 0, "spity": 0, "skins": ["lm_violet", "ly_dusk", "yh_sakura", "lm_sun", "ly_sky", "fy_jade", "ts_obsidian", "ts_bronze", "my_cinnabar", "ls_plum"], "equip": {"leiming": "lm_sun", "tieshan": "ts_obsidian", "moyu": "my_cinnabar", "feiying": "fy_jade", "liuyun": "ly_sky"}}, {"id": 5, "name": "张涵", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 92, "owned": ["qingfeng", "lingshuang", "feiying", "yanling", "leiming", "tieshan"], "frags": {"liuyun": 24, "yuehua": 12, "moyu": 10}, "pity": 9, "spity": 1, "skins": ["ls_plum", "yl_phoenix", "qf_frost", "lm_sun", "fy_jade"], "equip": {"qingfeng": "qf_frost", "lingshuang": "ls_plum", "yanling": "yl_phoenix"}}, {"id": 6, "name": "Luffy_iMac", "wins": 1, "losses": 2, "rating": 1135, "placed": 1, "ink": 790, "owned": ["qingfeng", "lingshuang"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 7, "name": "cxt", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 50, "owned": ["qingfeng"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 8, "name": "cxy", "wins": 2, "losses": 1, "rating": 1134, "placed": 1, "ink": 300, "owned": ["qingfeng", "liuyun"], "frags": {"tieshan": 13, "lingshuang": 6, "leiming": 9, "yanling": 13, "yuehua": 7, "feiying": 9, "moyu": 6}, "pity": 0, "spity": 8, "skins": ["ly_dusk", "ly_sky", "qf_gold"], "equip": {"liuyun": "ly_sky", "qingfeng": "qf_gold"}}, {"id": 9, "name": "MoYu", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 690, "owned": ["qingfeng", "moyu"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 10, "name": "越来越挤的大巴", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 210, "owned": ["qingfeng", "moyu", "feiying"], "frags": {"leiming": 2, "liuyun": 7, "tieshan": 2, "lingshuang": 1}, "pity": 1, "spity": 0, "skins": [], "equip": {}}, {"id": 11, "name": "hanz", "wins": 1, "losses": 2, "rating": 1068, "placed": 3, "ink": 192, "owned": ["qingfeng", "lingshuang", "tieshan"], "frags": {"yuehua": 3, "leiming": 5, "liuyun": 4, "moyu": 5, "yanling": 3}, "pity": 9, "spity": 7, "skins": ["qf_frost"], "equip": {"qingfeng": "qf_frost"}}, {"id": 12, "name": "zmjjkk", "wins": 1, "losses": 2, "rating": 1100, "placed": 0, "ink": 770, "owned": ["qingfeng", "leiming"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 13, "name": "wqfnkjrnbjv", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 36, "owned": ["qingfeng", "moyu", "liuyun"], "frags": {"leiming": 8, "feiying": 1, "tieshan": 1, "yuehua": 2, "yanling": 1}, "pity": 2, "spity": 0, "skins": [], "equip": {}}, {"id": 14, "name": "Ger1m0", "wins": 0, "losses": 0, "rating": 1100, "placed": 0, "ink": 560, "owned": ["qingfeng", "lingshuang"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 15, "name": "AAAAAAAA风铃批发", "wins": 1, "losses": 0, "rating": 1127, "placed": 1, "ink": 280, "owned": ["qingfeng", "moyu"], "frags": {"liuyun": 4, "leiming": 9, "yuehua": 1, "feiying": 4, "tieshan": 1}, "pity": 3, "spity": 8, "skins": ["qf_frost"], "equip": {"qingfeng": "qf_frost"}}, {"id": 16, "name": "Hilbert", "wins": 7, "losses": 34, "rating": 963, "placed": 39, "ink": 344, "owned": ["qingfeng", "liuyun", "feiying", "yanling", "leiming", "tieshan", "moyu", "lingshuang", "yuehua"], "frags": {}, "pity": 11, "spity": 0, "skins": ["qf_gold", "lm_violet", "ly_dusk", "yl_raven", "fy_jade", "fy_blood", "qf_frost", "my_cinnabar", "ly_sky", "ts_obsidian", "yl_phoenix", "ts_bronze"], "equip": {"qingfeng": "qf_gold", "feiying": "fy_blood", "liuyun": "ly_dusk", "leiming": "lm_violet", "yanling": "yl_raven", "tieshan": "ts_obsidian", "moyu": "my_cinnabar"}}, {"id": 17, "name": "CJ", "wins": 7, "losses": 5, "rating": 1113, "placed": 12, "ink": 86, "owned": ["qingfeng", "feiying", "moyu", "lingshuang", "tieshan", "leiming"], "frags": {"yuehua": 13, "liuyun": 16, "yanling": 18}, "pity": 10, "spity": 15, "skins": ["qf_frost", "lm_sun"], "equip": {}}, {"id": 18, "name": "神明", "wins": 35, "losses": 13, "rating": 1204, "placed": 46, "ink": 28, "owned": ["qingfeng", "yanling", "tieshan", "liuyun", "feiying", "lingshuang", "leiming"], "frags": {"yuehua": 38, "moyu": 39}, "pity": 11, "spity": 1, "skins": ["qf_gold", "qf_frost", "yl_raven", "yl_phoenix", "ly_dusk", "ts_bronze", "lm_sun"], "equip": {"qingfeng": "qf_gold", "yanling": "yl_raven", "liuyun": "ly_dusk", "tieshan": "ts_bronze", "leiming": "lm_sun"}}, {"id": 19, "name": "duyiuiavuda", "wins": 0, "losses": 1, "rating": 1071, "placed": 1, "ink": 770, "owned": ["qingfeng", "feiying"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 20, "name": "青霜", "wins": 1, "losses": 0, "rating": 1142, "placed": 1, "ink": 1125, "owned": ["qingfeng", "moyu"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}, {"id": 21, "name": "111111", "wins": 0, "losses": 1, "rating": 1054, "placed": 1, "ink": 540, "owned": ["qingfeng", "lingshuang"], "frags": {}, "pity": 0, "spity": 0, "skins": [], "equip": {}}];

let currentLegacyList = [];

function populateLegacyDropdown(list, selectedName) {
  const container = $id('importSelectArea');
  if (!container) return;
  currentLegacyList = list || [];
  if (!currentLegacyList.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('hidden');
  const target = (selectedName || (ACC.name || (window.CloudSave && CloudSave.getUser() ? CloudSave.getUser().name : ''))).toLowerCase();
  container.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <select id="legacyAccSelect" style="flex:1;min-width:0;padding:5px 8px;font-size:12px;background:rgba(0,0,0,0.5);color:var(--ink);border:1px solid var(--faint);border-radius:5px">
        <option value="">-- 选择导入包中的账号（共 ${currentLegacyList.length} 位） --</option>
        ${currentLegacyList.map(a => {
          const ownCount = (a.owned || []).length;
          const skinCount = (a.skins || []).length;
          const ink = a.ink || 0;
          const matchText = (a.wins || 0) + '胜' + (a.losses || 0) + '负';
          const isSel = (target && target === a.name.toLowerCase()) ? ' selected' : '';
          return `<option value="${escapeHTML(a.name)}"${isSel}>${escapeHTML(a.name)} (${ink}墨锭 · ${ownCount}英雄 · ${skinCount}皮肤 · ${matchText})</option>`;
        }).join('')}
      </select>
      <button class="go small" id="claimLegacyBtn" style="font-size:12px;padding:5px 12px;white-space:nowrap">导入此账号</button>
    </div>
  `;
  const claimBtn = $id('claimLegacyBtn');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => {
      const sel = $id('legacyAccSelect');
      const val = sel ? sel.value : '';
      if (!val) {
        if ($id('importMsg')) {
          $id('importMsg').style.color = '#ff6b6b';
          $id('importMsg').textContent = '请先在下拉菜单中选择一个账号';
        }
        return;
      }
      const found = currentLegacyList.find(a => a.name === val);
      if (!found) {
        if ($id('importMsg')) $id('importMsg').textContent = '未找到该账号信息';
        return;
      }
      claimLegacyAccount(found);
    });
  }
}

function claimLegacyAccount(accData) {
  if (!accData) return;
  const name = accData.name;

  // 1. 英雄拥有集合并集
  const oldOwned = Array.isArray(PROF.owned) ? PROF.owned : ['qingfeng'];
  const newOwned = Array.isArray(accData.owned) ? accData.owned : ['qingfeng'];
  PROF.owned = Array.from(new Set([...oldOwned, ...newOwned]));

  // 2. 皮肤拥有集合并集
  const oldSkins = Array.isArray(PROF.skins) ? PROF.skins : [];
  const newSkins = Array.isArray(accData.skins) ? accData.skins : [];
  PROF.skins = Array.from(new Set([...oldSkins, ...newSkins]));

  // 3. 碎片最大值合并
  PROF.frags = PROF.frags || {};
  if (accData.frags && typeof accData.frags === 'object') {
    for (const [cid, cnt] of Object.entries(accData.frags)) {
      PROF.frags[cid] = Math.max(PROF.frags[cid] || 0, cnt || 0);
    }
  }

  // 4. 墨锭取更大值
  PROF.ink = Math.max(PROF.ink || 0, accData.ink || 0);

  // 5. 保底次数合并
  PROF.pity = Math.max(PROF.pity || 0, accData.pity || 0);
  PROF.spity = Math.max(PROF.spity || 0, accData.spity || 0);

  // 6. 皮肤装配（严格仅保留已解锁的皮肤）
  const validSkins = new Set(PROF.skins || []);
  const rawEquip = Object.assign({}, accData.equip || {}, PROF.equip || {});
  PROF.equip = {};
  for (const [cid, sk] of Object.entries(rawEquip)) {
    if (sk && (validSkins.has(sk) || OFFLINE_BUILD || DEV_SESSION_UNLOCKED)) {
      PROF.equip[cid] = sk;
    }
  }
  try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (e) {}

  // 7. 战绩与排位
  PROF.netWins = Math.max(PROF.netWins || 0, accData.wins || 0);
  PROF.netLosses = Math.max(PROF.netLosses || 0, accData.losses || 0);
  if (accData.rating) PROF.rating = accData.rating;
  if (accData.placed) PROF.placed = Math.max(PROF.placed || 0, accData.placed || 0);

  // 8. 账号绑定
  if (!ACC.name) {
    ACC.name = name;
  }
  PROF.guest = false;

  // 9. 存储同步（本地镜像与云端）
  try { localStorage.setItem('renying-cloud-cache', JSON.stringify(PROF)); } catch (e) {}
  if (window.CloudSave) {
    CloudSave.saveProfile(PROF, true);
  }

  // 10. 刷新界面
  applyProfile(PROF);
  renderAcc();

  const msg = `已成功继承【${name}】！已解锁 ${PROF.owned.length} 位英雄、${PROF.skins.length} 款皮肤、${PROF.ink} 墨锭！`;
  if ($id('importMsg')) {
    $id('importMsg').style.color = '#46d3ea';
    $id('importMsg').textContent = msg;
  }
  toast(msg);
}

if ($id('toggleImportBoxBtn')) {
  $id('toggleImportBoxBtn').addEventListener('click', () => {
    $id('importBox').classList.toggle('hidden');
    $id('toggleImportBoxBtn').textContent = $id('importBox').classList.contains('hidden') ? '📜 存档导入与继承' : '收起导入设置';
  });
}

if ($id('importFileInput')) {
  $id('importFileInput').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);

        // 格式 A: 单账号导出格式或裸 Profile
        if (d.format === 'single-account' || (d.profile && d.account) || Array.isArray(d.owned)) {
          if (!window.CloudSave) throw new Error('存档系统未就绪');
          const res = CloudSave.importAccountData(d);
          ACC.name = res.name;
          PROF.guest = false;
          applyProfile(res.profile);
          renderAcc();
          if ($id('importFileStatus')) $id('importFileStatus').textContent = `已成功导入【${res.name}】`;
          if ($id('importMsg')) {
            $id('importMsg').style.color = '#46d3ea';
            $id('importMsg').textContent = `成功恢复账号【${res.name}】！拥有 ${res.profile.owned ? res.profile.owned.length : 1} 位英雄、${res.profile.ink || 0} 墨锭！`;
          }
          toast(`成功恢复账号【${res.name}】！`);
          return;
        }

        // 格式 B: 全账号打包备份格式
        if (d.format === 'all-accounts-backup' && Array.isArray(d.accounts)) {
          if (!window.CloudSave) throw new Error('存档系统未就绪');
          const res = CloudSave.importAccountData(d);
          const list = d.accounts.map(item => {
            const a = item.account || {};
            const p = item.profile || {};
            return {
              id: a.uid,
              name: a.name,
              wins: p.netWins || 0,
              losses: p.netLosses || 0,
              rating: p.rating || 1100,
              placed: p.placed || 0,
              ink: p.ink || 0,
              owned: p.owned || ['qingfeng'],
              frags: p.frags || {},
              pity: p.pity || 0,
              spity: p.spity || 0,
              skins: p.skins || [],
              equip: p.equip || {}
            };
          });
          populateLegacyDropdown(list);
          if (res.name && res.profile) {
            ACC.name = res.name;
            PROF.guest = false;
            applyProfile(res.profile);
            renderAcc();
          }
          if ($id('importFileStatus')) $id('importFileStatus').textContent = `已载入全备份包（共 ${list.length} 个账号）`;
          if ($id('importMsg')) {
            $id('importMsg').style.color = '#e9c46a';
            $id('importMsg').textContent = `成功恢复 ${list.length} 个账号，请在下拉框选择切换！`;
          }
          toast(`成功恢复 ${list.length} 个账号`);
          return;
        }

        // 格式 C: 老站 SQLite 导出文件 (users + profiles)
        const users = d.users || [];
        const profiles = d.profiles || [];
        if (!Array.isArray(users) || !users.length) throw new Error('导出文件中未发现有效玩家用户数据');

        const profById = {};
        for (const p of profiles) {
          if (p && p.user_id) profById[p.user_id] = p;
        }

        const list = users.map(u => {
          const p = profById[u.id] || {};
          const pdata = (p.data && typeof p.data === 'object') ? p.data : (typeof p.data === 'string' ? JSON.parse(p.data || '{}') : {});
          return {
            id: u.id,
            name: u.name,
            wins: u.wins || 0,
            losses: u.losses || 0,
            rating: p.rating || 1100,
            placed: p.placed || 0,
            ink: pdata.ink || 50,
            owned: pdata.owned || ['qingfeng'],
            frags: pdata.frags || {},
            pity: pdata.pity || 0,
            spity: pdata.spity || 0,
            skins: pdata.skins || [],
            equip: pdata.equip || {}
          };
        });

        populateLegacyDropdown(list);
        if ($id('importFileStatus')) $id('importFileStatus').textContent = `已读取 ${file.name}（${list.length} 个账号）`;
        if ($id('importMsg')) {
          $id('importMsg').style.color = '#e9c46a';
          $id('importMsg').textContent = `文件解析成功！请在下拉框中选择要继承的账号后点击【一键继承】`;
        }
        toast(`成功载入 ${list.length} 个账号数据`);
      } catch (err) {
        if ($id('importMsg')) {
          $id('importMsg').style.color = '#ff6b6b';
          $id('importMsg').textContent = '导入失败：' + err.message;
        }
        alert('文件解析失败：' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

let lbKind = 'rank';
$id('lbTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { lbKind = b.dataset.k; openLeaderboard(); } });
async function openLeaderboard() {
  menuCam.tz = 1.35; showScreen('lb'); $id('lbSub').textContent = '加载中…'; $id('lbTable').innerHTML = '';
  for (const b of $id('lbTabs').children) b.classList.toggle('sel', b.dataset.k === lbKind);
  if (lbKind === 'rank') {
    try {
      const j = await api('/api/ranklb');
      $id('lbSub').textContent = j.list.length ? '打满 5 场定级赛后上榜。段位从低到高：砺锋、出鞘、破竹、惊鸿、踏月、刃影' : '还没有人完成定级赛。排位赛打满 5 场就能上榜！';
      $id('lbTable').innerHTML = j.list.length ? '<tr><th>名次</th><th>昵称</th><th>段位</th><th class="n">等级分</th></tr>' + j.list.map((r, i) =>
        `<tr class="${i < 3 ? 'top' + (i + 1) : ''}${r.me ? ' me' : ''}"><td class="rk">${i + 1}</td><td>${escapeHTML(r.name)}${r.me ? '（你）' : ''}</td><td>${r.label}</td><td class="n">${r.rating}</td></tr>`).join('') : '';
    } catch (err) { $id('lbSub').textContent = '读取失败：' + err.message; }
    return;
  }
  try {
    const j = await api('/api/leaderboard');
    if (j.me) setAcc(j.me);
    $id('lbSub').textContent = j.list.length ? `已注册玩家 ${j.players} 位。正式：双方皆登录；切磋：对手为游客` : '还没有人打过联机——去赢下第一场吧！';
    $id('lbTable').innerHTML = j.list.length ? '<tr><th>名次</th><th>昵称</th><th class="n">胜</th><th class="n">负</th><th class="n">胜率</th><th class="n">切磋</th></tr>' + j.list.map((r, i) => {
      const g = r.wins + r.losses, rate = g ? Math.round(r.wins / g * 100) + '%' : '-';
      return `<tr class="${i < 3 ? 'top' + (i + 1) : ''}${r.me ? ' me' : ''}"><td class="rk">${i + 1}</td><td>${escapeHTML(r.name)}${r.me ? '（你）' : ''}</td><td class="n">${r.wins}</td><td class="n">${r.losses}</td><td class="n">${rate}</td><td class="n" style="color:var(--dim)">${r.cwins} 胜 ${r.closses} 负</td></tr>`;
    }).join('') : '';
  } catch (err) { $id('lbSub').textContent = '读取失败：' + err.message; }
}
$id('lbBack').addEventListener('click', backToMenu);
adaptLoad();
if (SERVED && window.fetch && !ACC.token) loadProfile();
if (SERVED && ACC.token && window.fetch) api('/api/me').then(setAcc).catch(err => { if (/失效/.test(err.message)) setAcc(null); else renderAcc(); });

// 检查云端/本地已有登录并载入存档
if (window.CloudSave) {
  const cu = CloudSave.getUser();
  if (cu && cu.name) {
    ACC.name = cu.name;
    ACC.token = cu.uid;
    PROF.guest = false;
    CloudSave.loadProfile().then(p => {
      if (p) applyProfile(p);
      else CloudSave.saveProfile(PROF, true);
      renderAcc();
    }).catch(() => {});
  } else {
    CloudSave.loadProfile().then(p => {
      if (p) applyProfile(p);
      renderAcc();
    }).catch(() => {});
  }
}

renderAcc();
function netStatus(t) { $id('netStatus').textContent = t; }
setTimeout(renderAcc, 0);
if (!SERVED) $id('onlineLine').textContent = '';
$id('verLine').textContent = `刃影 v${VERSION}${TOY_BUILD ? ' B站版' : OFFLINE_BUILD ? ' 离线版' : ''}　Created by Even, Luffy, and Opus 5.5`;
// 离线单文件版：全部皮肤可用，装备记在本机；在线版拥有完整成长与解锁
if (OFFLINE_BUILD) { PROF.skins = Object.keys(SKINS); try { PROF.equip = JSON.parse(localStorage.getItem('renying-equip') || '{}'); } catch (e) {} }
if (OFFLINE_BUILD) {
  $id('mSingle').innerHTML = '<span class="mk">对战电脑</span><span class="ms">和电脑过招，难度可选</span>';
  $id('mNet').innerHTML = '<span class="mk">闯关模式</span><span class="ms">六章三十关，一关一关打上去</span>';
  for (const k of ['gacha', 'tasks', 'community']) { const b = document.querySelector(`#menu [data-go="${k}"]`); if (b) b.style.display = 'none'; }
  const tb = document.createElement('button'); tb.textContent = '木人桩'; tb.dataset.go = 'train';
  tb.addEventListener('click', () => menuGo('train'));
  const cx = document.querySelector('#menu [data-go="codex"]'); cx.parentNode.insertBefore(tb, cx);
  const ts = document.querySelector('#tutask .sub'); if (ts) ts.textContent = '两分钟学会基本招式，再去挑战电脑与闯关。';
}
try { $id('srvIn').value = localStorage.getItem('renying-srv') || ''; } catch (e) {}
$id('srvIn').addEventListener('change', () => { try { localStorage.setItem('renying-srv', $id('srvIn').value.trim()); } catch (e) {} });
function setNetMode(mode) {
  currentNetMode = mode;
  if (SERVED) {
    try { localStorage.setItem('renying-net-mode', mode); } catch (e) {}
  }
  const isServer = mode === 'server';
  if ($id('netModeServerBtn')) $id('netModeServerBtn').classList.toggle('sel', isServer);
  if ($id('netModeP2PBtn')) $id('netModeP2PBtn').classList.toggle('sel', !isServer);
  if ($id('netBannerServer')) $id('netBannerServer').classList.toggle('hidden', !isServer);
  if ($id('netBannerP2P')) $id('netBannerP2P').classList.toggle('hidden', isServer);
  if ($id('srvBox')) $id('srvBox').classList.toggle('hidden', !isServer || SERVED);
  if ($id('netMatchBox')) $id('netMatchBox').classList.toggle('hidden', !isServer);
}

if ($id('netModeServerBtn')) {
  $id('netModeServerBtn').addEventListener('click', () => {
    setNetMode('server');
    netStatus('已切换到【局域网 / 本地服务器】模式（推荐同 Wi-Fi 或离线单机开黑）');
  });
}
if ($id('netModeP2PBtn')) {
  $id('netModeP2PBtn').addEventListener('click', () => {
    setNetMode('p2p');
    netStatus('已切换到【WebRTC 公网直连】模式（需要双方均能连接外网）');
  });
}

setNetMode(currentNetMode);

if (SERVED && $id('serverStatusText')) {
  $id('serverStatusText').innerHTML = `🟢 <b>已连接本地/局域网服务器</b> (<code>${escapeHTML(location.host)}</code>)，建房、加入、快速匹配畅玩无阻！`;
}

if ($id('srvConnectBtn')) {
  $id('srvConnectBtn').addEventListener('click', () => {
    const base = serverBase();
    if (!base) { netStatus('请先填入服务器 IP 或网址'); return; }
    const httpUrl = base.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://') + '/health';
    netStatus(`正在测试连接 ${base}…`);
    const btn = $id('srvConnectBtn');
    btn.disabled = true;
    const t0 = performance.now();
    fetch(httpUrl, { mode: 'cors' }).then(r => r.json()).then(data => {
      btn.disabled = false;
      const ms = Math.round(performance.now() - t0);
      netStatus(`✅ 连接成功！延迟约 ${ms}ms。服务器在线：${data.online || 0} 人`);
    }).catch(err => {
      btn.disabled = false;
      netStatus(`❌ 无法连接到 ${httpUrl}。\n请确认：\n1. 房主终端已运行 python3 server.py\n2. 双方电脑处于同一 Wi-Fi 或局域网\n3. IP 和端口（默认 8765）无误`);
    });
  });
}

if ($id('srvClearBtn')) {
  $id('srvClearBtn').addEventListener('click', () => {
    if ($id('srvIn')) $id('srvIn').value = '';
    try { localStorage.removeItem('renying-srv'); } catch (e) {}
    netStatus(SERVED ? '已重置为当前服务器：' + location.host : '已重置为本机默认地址 (127.0.0.1:8765)');
  });
}

function copyRoomInvite() {
  const code = (NET.code || ($id('roomCode') && $id('roomCode').textContent) || '').trim();
  if (!code) return;
  const isWeb = /^https?:$/.test(location.protocol);
  const link = isWeb ? (location.origin + location.pathname + '?room=' + code) : '';
  const text = link ? `【刃影 · 月下一决】房间码：${code}\n点此链接直接入局：${link}` : code;
  const doFeedback = (ok) => {
    const btn = $id('copyCodeBtn');
    if (btn) {
      const orig = btn.dataset.orig || (btn.dataset.orig = btn.textContent);
      btn.textContent = ok ? '已复制房间码与链接！' : '复制失败，请手动记下';
      btn.style.color = ok ? 'var(--jade)' : 'var(--cinnabar)';
      btn.style.borderColor = ok ? 'var(--jade)' : 'var(--cinnabar)';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 1800);
    }
    netStatus(ok ? '已复制！把 4 位房间码或链接发给同学，静候他入局' : '复制失败，房间码为：' + code);
  };
  const fallbackCopy = (txt) => {
    try {
      const t = document.createElement('textarea');
      t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const res = document.execCommand('copy');
      document.body.removeChild(t);
      return res;
    } catch (e) { return false; }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => doFeedback(true)).catch(() => {
      fallbackCopy(text) ? doFeedback(true) : doFeedback(false);
    });
  } else {
    fallbackCopy(text) ? doFeedback(true) : doFeedback(false);
  }
}

if ($id('copyCodeBtn')) $id('copyCodeBtn').addEventListener('click', copyRoomInvite);
if ($id('roomCode')) $id('roomCode').addEventListener('click', copyRoomInvite);
$id('hostBtn').addEventListener('click', () => { initAudio(); netConnect(true); });
// 快速匹配：再按一次就是取消
let matchT0 = 0, matchN = 0;
function matchUI(on, n) {
  const b = $id('matchBtn');
  if (on && !b.classList.contains('searching')) matchT0 = performance.now();
  if (n !== undefined) matchN = n;
  b.classList.toggle('searching', !!on);
  b.textContent = on ? '匹配中… 点击取消' : '快速匹配';
}
$id('matchBtn').addEventListener('click', () => {
  initAudio();
  if ($id('matchBtn').classList.contains('searching') || NET.matching) { netReset(); netStatus('已取消匹配'); return; }
  netConnect(false, null, true); matchUI(true);
});
setInterval(() => {
  if (NET.matching && ($id('matchBtn').classList.contains('searching') || $id('rankBtn').classList.contains('searching'))) {
    const t = Math.floor((performance.now() - matchT0) / 1000);
    netStatus(`正在寻找对手… ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}${matchN > 1 ? `（${matchN} 人在匹配）` : ''}`);
    if (NET.ws && NET.ws.readyState === 1 && t % 4 === 0) send({ ping: 1 });   // 告诉服务器自己还在
  }
}, 1000);
// 在线情况：多少局在打、多少人在匹配
function refreshOnline() {
  if (!SERVED || !window.fetch || !document.getElementById('netp').classList.contains('on')) return;
  fetch('/health').then(r => r.json()).then(h => {
    const parts = [];
    if (h.playing) parts.push(`${h.playing} 局正在对战`);
    if (h.waiting) parts.push(`${h.waiting} 人正在匹配`);
    $id('onlineLine').textContent = parts.length ? '现在 ' + parts.join('，') : '现在没有人在玩，快速匹配会等别人加入';
  }).catch(() => {});
}
setInterval(refreshOnline, 5000); setTimeout(refreshOnline, 300);
if (SERVED && location.protocol === 'https:' && window.fetch) {
  fetch('/health').then(r => r.json()).then(h => { if (h.lan) $id('lanLine').innerHTML = `和服务器电脑在同一个 Wi-Fi？用 <b style="color:var(--ink)">${escapeHTML(h.lan)}</b> 打开更流畅（要重新登录）`; }).catch(() => {});
}
// 刚才关掉了网页？自动回到那场对战
setTimeout(() => {
  const r = SERVED ? loadResume() : null;
  if (!r) return;
  selectMode('net');
  NET.code = r.code; NET.rt = r.rt; NET.base = r.base;
  NET.reconnT0 = performance.now();
  netOverlay('正在回到刚才的对战…');
  netConnect(false, null, false, r);
}, 400);
function joinByCode() {
  initAudio();
  const code = $id('codeIn').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) return netStatus('房间码是 4 位');
  netConnect(false, code);
}
$id('joinBtn').addEventListener('click', joinByCode);
$id('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') joinByCode(); });
function checkUrlRoom() {
  try {
    const p = new URLSearchParams(location.search);
    const rm = (p.get('room') || p.get('code') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (rm.length === 4) {
      if ($id('codeIn')) $id('codeIn').value = rm;
      if (!SERVED) setNetMode('p2p');
      openScreen('netp');
      netStatus(`检测到邀请房间码 ${rm}，正在自动加入…`);
      setTimeout(() => {
        if ($id('codeIn') && $id('codeIn').value === rm && !NET.open && !NET.ws && !(typeof p2pActive === 'function' && p2pActive())) {
          joinByCode();
        }
      }, 600);
    }
  } catch (e) {}
}
setTimeout(checkUrlRoom, 300);

// ======================= 键盘 =======================
window.addEventListener('keydown', e => {
  initAudio();
  if (e.code === 'KeyM') { muted = !muted; return; }
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
    const scr = e.target.closest('.scr');
    if ((scr && !scr.classList.contains('on')) || e.target.offsetParent === null) {
      try { e.target.blur(); } catch (err) {}
      refocusGame();
    } else {
      return;
    }
  }
  if (e.target && e.target.tagName === 'BUTTON' && M.mode !== 'demo' && !paused && !document.querySelector('.scr.on')) {
    try { e.target.blur(); } catch (err) {}
    refocusGame();
  }
  if (paused && document.getElementById('pause').classList.contains('on')) {
    if (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      paused = false;
      showScreen(null);
      refocusGame();
      return;
    }
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && M.mode !== 'demo' && M.mode !== 'net' && M.phase !== 'end') {
    paused = !paused; showScreen(paused ? 'pause' : null); if (!paused) refocusGame(); return;
  }
  if (M.mode === 'demo') return;
  if (M.mode === 'train' && /^Digit[1234]$/.test(e.code) && B.ctrl instanceof DummyCtrl) {
    dummyMode = B.ctrl.mode = ['stand', 'block', 'escape', 'fixed'][+e.code.slice(5) - 1];
    if (dummyMode === 'fixed') { B.x = B.homeX = STAGE_W / 2; B.y = 0; B.vx = B.vy = 0; B.state = 'idle'; B.t = 0; B.juggle = 0; B.comboHits = 0; }
    say(DUMMY_MODES[dummyMode], 0.8, 'go'); return;
  }
  for (let p = 0; p < 2; p++) {
    const act = KEYS[p][e.code]; if (!act) continue;
    e.preventDefault();
    const c = (M.mode === 'cpu' || M.mode === 'net') ? human[0] : human[p];
    if (act === 'atk') { if (!e.repeat) { c.held.atk = true; c.atkT = clock; c.press('light'); } continue; }
    if (act === 'jump') { c.held.jump = true; if (!e.repeat) c.press('jump'); continue; }
    if (act === 'left' || act === 'right' || act === 'down') { c.held[act] = true; if (act !== 'down') c.held.aim = act === 'left' ? -1 : 1; continue; }
    if (!e.repeat) c.press(act);
  }
});
window.addEventListener('keyup', e => {
  for (let p = 0; p < 2; p++) {
    const act = KEYS[p][e.code]; if (!act) continue;
    const c = (M.mode === 'cpu' || M.mode === 'net') ? human[0] : human[p];
    if (act === 'left' || act === 'right' || act === 'down') c.held[act] = false;
    if (act === 'atk') c.held.atk = false;
    if (act === 'jump') c.held.jump = false;
  }
});
// 1P 鼠标：左键攻击（按住蓄力，松开释放），右键重斩
cv.addEventListener('mousedown', e => {
  refocusGame();
  initAudio();
  if (paused && M.mode !== 'demo' && M.phase !== 'end') {
    paused = false;
    showScreen(null);
    return;
  }
  if (M.mode === 'demo') return;
  e.preventDefault();
  const c = human[0];
  if (e.button === 0) { c.held.atk = true; c.atkT = clock; c.press('light'); }
  else if (e.button === 2) {   // 右键单点：腾空闪；按住左键时点右键：远程招式
    if (c.held.atk) { c.press('skill2'); c.atkT = clock + 1e6; delete c.buf.light; } else c.press('dash');
  }
});
cv.addEventListener('pointerdown', () => refocusGame());
window.addEventListener('mouseup', e => { if (e.button === 0) human[0].held.atk = false; });
cv.addEventListener('auxclick', e => e.preventDefault());
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', () => { human[0].clear(); human[1].clear(); if (M.mode !== 'demo' && M.mode !== 'net' && M.phase !== 'end' && !paused) { paused = true; showScreen('pause'); } });
window.addEventListener('focus', () => {
  human[0].clear(); human[1].clear();
  if (M.mode !== 'demo' && !paused && !document.querySelector('.scr.on')) {
    refocusGame();
  }
});
window.addEventListener('pointerdown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
  if (M.mode !== 'demo' && !paused && !document.querySelector('.scr.on')) {
    refocusGame();
  }
}, true);

// ======================= 启动 =======================
function resize() {
  const r = cv.getBoundingClientRect(); W = r.width || innerWidth; H = r.height || innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  // 画质：极高画质（high）采用完整原生物理像素，绝不进行像素降级或压缩
  const q = SETTINGS.quality;
  if (q === 'low') DPR = Math.min(window.devicePixelRatio || 1, 0.85);
  else if (q === 'mid') DPR = Math.min(window.devicePixelRatio || 1, 1.25);
  else DPR = Math.min(window.devicePixelRatio || 1, 2);
  DPR = Math.max(0.5, DPR);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);
resize();
startMatch('demo');
for (let i = 0; i < 4; i++) { animFighter(A); animFighter(B); }
requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
refocusGame();
window.addEventListener('load', () => refocusGame());
