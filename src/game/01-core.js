// ======================= 国风朱砂篆刻印章系统 =======================
const EMO_ICON = {'⚔':'战','🔥':'烈','🌲':'关','🥋':'练','🌱':'初','⚡':'疾','👑':'绝','🧠':'谋','🟢':'dot','💾':'存','☁':'云','📜':'卷','📥':'取','📤':'传','📂':'匣','🎁':'礼','💎':'墨','🏆':'胜','🎋':'签','⚠':'警','✅':'成','❌':'否','🔒':'锁','🎉':'贺','📦':'匣','💥':'破','🌪':'风','🌙':'月','🛡':'守','🪶':'羽','❄':'霜','💫':'震','🐉':'龙','🎨':'墨','🗡':'刃','✨':'灵','💨':'遁','★':'starf','☆':'star'};   // emoji → 印章字
const EMO_RE = new RegExp('(' + Object.keys(EMO_ICON).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')️?\\s?', 'gu');
const EMO_STRIP = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️‍]\s?/gu;
function stripEmo(t) { return typeof t === 'string' ? t.replace(EMO_STRIP, '').trim() : t; }
function sealEl(ch, label) {   // 一枚印章图标；星星和在线状态画成圆点；label 是要直接刻进印章的 2-4 个字
  const e = document.createElement('i'); e.setAttribute('aria-hidden', 'true');
  if (ch === 'starf' || ch === 'star') e.className = 'sdot' + (ch === 'starf' ? ' f' : '');
  else if (ch === 'dot') e.className = 'sdot on';
  else if (label) { e.className = 'sic w'; e.textContent = label; e.removeAttribute('aria-hidden'); }
  else { e.className = 'sic'; e.textContent = ch; }
  return e;
}
const SEAL_LABEL = /^[\u4e00-\u9fa5·]{2,4}$/;
function icoSvg(ch) { return sealEl(ch).outerHTML; }
function iconizeText(node) {
  const t = node.nodeValue; EMO_RE.lastIndex = 0;
  if (!t || !EMO_RE.test(t)) return;
  const p = node.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|OPTION|TITLE)$/.test(p.nodeName)) return;
  const frag = document.createDocumentFragment(); let last = 0; EMO_RE.lastIndex = 0; let m;
  while ((m = EMO_RE.exec(t))) {
    if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
    const rest = t.slice(m.index + m[0].length).trim(), ch = EMO_ICON[m[1]];
    if (ch.length === 1 && !t.slice(0, m.index).trim() && SEAL_LABEL.test(rest)) { frag.appendChild(sealEl(ch, rest)); last = t.length; break; }   // 「印章 + 短词」合成一枚印章
    frag.appendChild(sealEl(ch));
    last = m.index + m[0].length;
  }
  if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
  p.replaceChild(frag, node);
}
function iconizeTree(root) {
  if (root.nodeType === 3) { iconizeText(root); return; }
  if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|CANVAS)$/.test(root.nodeName)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
  while (w.nextNode()) list.push(w.currentNode);
  for (const n of list) iconizeText(n);
}
// 按钮的 title / placeholder 等属性里也不留 emoji
function stripAttrs(root) { if (root.nodeType !== 1) return; for (const el of [root, ...root.querySelectorAll('[title],[placeholder]')]) for (const a of ['title', 'placeholder']) { const v = el.getAttribute && el.getAttribute(a); if (v && EMO_STRIP.test(v)) { EMO_STRIP.lastIndex = 0; el.setAttribute(a, stripEmo(v)); } EMO_STRIP.lastIndex = 0; } }
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const go = () => {
    if (!document.body) return;
    iconizeTree(document.body);
    stripAttrs(document.body);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(ms => {
        for (const m of ms) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && !/^(CANVAS|SCRIPT|STYLE)$/.test(n.nodeName)) {
              iconizeTree(n); stripAttrs(n);
            }
          }
        }
      }).observe(document.body, { subtree: true, childList: true });
    }
  };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();

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
   联机代码在“联机（公共部分）”和“回滚联机”两节；浏览器之间直连（WebRTC）在 net-p2p.js。
   腾空闪冷却和被挑飞的滞空时间在 BREAK_CD / LAUNCH_GRAV 里调。
   右键招式在 SKILLS 表的“右键招式”一节，每个角色用 skill2 指定。设置在 SETTINGS，音乐在 MUSIC 一节。
   刀声在 SFX 里，metal() 用几组不成倍数的泛音模拟金属振动。
   ===================================================================== */

// ======================= 设置（保存在浏览器里） =======================
const SETTINGS = { bloom: 1.6, fps: 144, shake: 1.4, quality: 'high', blur: true, vig: 1, music: 0.7, sfx: 1, aim: true, aimMigrated: true, vibrate: true, autoSkin: true, lang: 'zh' };
try {
  const saved = JSON.parse(localStorage.getItem('renying-settings') || '{}');
  Object.assign(SETTINGS, saved);
  // 消除任何旧配置里的自动/优化降级默认值，默认全部保持极高原生画质与 144 帧高刷
  if (!SETTINGS.quality || SETTINGS.quality === 'auto') SETTINGS.quality = 'high';
  // 旧版默认泛光是 1，只迁移一次；之后玩家自己选的「中」（也是 1）刷新后要留着
  if (SETTINGS.bloom === undefined || (SETTINGS.bloom === 1 && !saved.bloomMigrated)) SETTINGS.bloom = 1.6;
  SETTINGS.bloomMigrated = true;
  const ALLOWED_FPS = [144, 120, 60, 30];
  if (!SETTINGS.fps || !ALLOWED_FPS.includes(SETTINGS.fps)) SETTINGS.fps = 144;
  if (saved.aim === undefined || !saved.aimMigrated) { SETTINGS.aim = true; SETTINGS.aimMigrated = true; }
  if (saved.lang) SETTINGS.lang = saved.lang;
  else {
    const rawL = localStorage.getItem('renying-lang');
    if (rawL === 'en' || rawL === 'zh') SETTINGS.lang = rawL;
  }
} catch (e) {}
function saveSettings() {
  try {
    localStorage.setItem('renying-settings', JSON.stringify(SETTINGS));
    if (SETTINGS.lang) localStorage.setItem('renying-lang', SETTINGS.lang);
  } catch (e) {}
}

// ======================= 基础 =======================
const VERSION = '1.0.0';         // 每次更新改一下，联机时双方版本必须一样
// 打包设置由 tools/build.py 写进 window.RENYING_BUILD（直接打开 src 里的文件时为空，按联网版处理）
const BUILD = window.RENYING_BUILD || {};
const OFFLINE_BUILD = !!BUILD.offline;   // 离线版：不连服务器，全部角色和皮肤可用
const TOY_BUILD = !!BUILD.toy;           // B站 Toy 版：在离线版基础上加全服排行榜
let NET_HUD = false;                     // 回滚与联机遥测 HUD 开关（按 ~ 或 F2 切换）
// 开发者临时全解锁特权（仅限当前窗口会话有效，关闭或新建窗口后自动恢复锁定，不污染真实云端存档）
let DEV_SESSION_UNLOCKED = false;
// 限免活动：北京时间 10.22 0:00 起 14 天，所有玩家所有皮肤都能穿
const FREE_SKIN_EVENT = { start: Date.UTC(2026, 9, 21, 16), end: Date.UTC(2026, 10, 4, 16) };
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
let STAGE_W = 1800;
const WALL = 60;
const GRAV = 2700, WALK = 280, JUMP_V = 980, DJUMP_V = 860, DASH_V = 840, DASH_T = 0.2, BUF = 0.16;
// ---------- 对战规则数值：改规则、调手感都在这里改 ----------
// 回合：50 秒内击倒对手才算赢；到时没人倒下就进 20 秒加时，加时里所有伤害 ×OT_DMG；加时也结束时血量比例低的败北。2v2 一回合 75 秒
const ROUND_TIME = 50, ROUND_TIME_2V2 = 75, OT_TIME = 20, OT_DMG = 2;
// 联机两人接力和车轮战：活下来的人带着剩下的血量 +CARRY_HEAL 进下一回合（不超过上限），换上来的人满血；其余模式每回合双方满血
const CARRY_HEAL = 80;
const WINS_NEEDED = 2, MAX_ROUNDS = 5;     // 先赢 2 回合的一方获胜；平局太多时第 5 回合打完就结束
const IMPOSSIBLE_HP = 1.35;                // 绝顶难度的电脑多 35% 血
const LAST_STAND_METER = 100, LAST_STAND_T = 3.5, LAST_STAND_HEAL = 75;   // 2v2 队友倒下后「孤军奋战」：气满、强化 3.5 秒、回 75 血
const CREDIT = 2.4;                        // 第一回合开场署名多停留的秒数
const PENGLAI_T = 2;                       // 醉翁大招之后对手困在蓬莱境里的秒数（屏幕被画挡住）
const CINE_LEN = 1.3;                      // 大招特写镜头的秒数
const CHAOS_INTERVAL = 15;                 // 天机乱斗每隔多少秒换一种异变
const BP_TIME = 25, BP_CPU_DELAY = 0.85;   // 点将台每一步的时限；电脑每一步想多久
// 操作手感
const CHARGE_START = 0.3;   // 按住攻击多久开始蓄力
const CHARGE_FULL = 0.75;   // 蓄力多久算满
const DODGE_CD = 0.3;
const BREAK_CD = 9;         // 腾空闪（按住左键再按右键）的冷却秒数
const LAUNCH_GRAV = 0.6;    // 被挑飞时的重力倍率，越小在空中越久
// 难度的中文名（关卡、回放列表都用这一份）
const LV_NAME = { easy: '入门', normal: '寻常', hard: '劲敌', impossible: '绝顶', god: '天道', adaptive: '宿敌' };
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
  yx_play:   { hip: [0, -48],  neck: [4, -88],   hf: [16, -84],  hb: [10, -84],  ff: [16, 0],  fb: [-18, 0],  sw: 1.25 },
  yx_push:   { hip: [8, -46],  neck: [20, -84],  hf: [48, -74],  hb: [-12, -66], ff: [28, 0],  fb: [-16, 0],  sw: 0.2 },
  zx_drink:  { hip: [-4, -48], neck: [-10, -88], hf: [20, -70], hb: [4, -102], ff: [16, 0],  fb: [-20, 0],  sw: -1.2 },
  zx_breath: { hip: [6, -46],  neck: [22, -84],  hf: [14, -70], hb: [-16, -64], ff: [26, 0],  fb: [-18, 0],  sw: 0.6 },
  zx_sway:   { hip: [-6, -44], neck: [-18, -82], hf: [14, -62], hb: [-28, -74], ff: [20, 0],  fb: [-12, -4], sw: 0.9 },
  zx_roll:   { hip: [0, -24],  neck: [16, -36],  hf: [20, -20], hb: [-6, -18],  ff: [-10, -14],fb: [-20, -6], sw: 2.2 },
  zx_upper:  { hip: [8, -52],  neck: [16, -92],  hf: [30, -118],hb: [-14, -70], ff: [18, 0],  fb: [-16, -4], sw: -1.6 },
  gc_wind:   { hip: [-4, -46], neck: [0, -86],   hf: [-6, -112],hb: [14, -70],  ff: [18, 0],  fb: [-22, 0],  sw: -2.2 },
  gc_throw:  { hip: [12, -44], neck: [30, -80],  hf: [62, -80], hb: [-12, -64], ff: [40, 0],  fb: [-20, 0],  sw: 0 },
  gc_pull:   { hip: [-10, -44],neck: [-18, -82], hf: [8, -70],  hb: [-24, -66], ff: [16, 0],  fb: [-28, 0],  sw: 0.3 },
  gc_sweep:  { hip: [8, -32],  neck: [26, -64],  hf: [52, -26], hb: [-12, -50], ff: [36, 0],  fb: [-26, 0],  sw: 0.08 },
  gc_spin:   { hip: [0, -46],  neck: [2, -86],   hf: [8, -130], hb: [-18, -72], ff: [22, 0],  fb: [-22, 0],  sw: -1.6 },
  // 兵器流派专属普攻起手与挥击姿态（长枪、双刃、重剑、折扇/玉箫、拳法）
  sp_l1s:    { hip: [-6, -46], neck: [4, -84],   hf: [18, -68], hb: [-16, -68], ff: [20, 0],  fb: [-26, 0],  sw: 0.06 },
  sp_l1a:    { hip: [14, -42], neck: [32, -78],  hf: [68, -68], hb: [12, -66],  ff: [42, 0],  fb: [-22, 0],  sw: -0.02 },
  sp_l2s:    { hip: [2, -40],  neck: [12, -76],  hf: [-8, -48], hb: [-24, -56], ff: [24, 0],  fb: [-20, 0],  sw: 0.45 },
  sp_l2a:    { hip: [12, -46], neck: [26, -84],  hf: [62, -86], hb: [8, -72],   ff: [34, 0],  fb: [-18, 0],  sw: -0.38 },
  du_l1s:    { hip: [4, -40],  neck: [18, -74],  hf: [-12, -54],hb: [28, -76],  ff: [24, 0],  fb: [-20, 0],  sw: 2.6 },
  du_l1a:    { hip: [14, -38], neck: [32, -70],  hf: [52, -64], hb: [-22, -52], ff: [36, 0],  fb: [-18, 0],  sw: -0.25 },
  du_l2s:    { hip: [2, -36],  neck: [14, -68],  hf: [34, -42], hb: [-18, -78], ff: [26, 0],  fb: [-22, 0],  sw: 1.9 },
  du_l2a:    { hip: [16, -42], neck: [34, -76],  hf: [48, -82], hb: [44, -48],  ff: [34, 0],  fb: [-16, 0],  sw: -0.75 },
  gs_l1s:    { hip: [-8, -42], neck: [-6, -80],  hf: [-16, -118],hb: [-8, -112],ff: [16, 0],  fb: [-28, 0],  sw: -2.45 },
  gs_l1a:    { hip: [14, -36], neck: [30, -68],  hf: [54, -28], hb: [38, -32],  ff: [38, 0],  fb: [-24, 0],  sw: 0.95 },
  fn_l1s:    { hip: [-2, -50], neck: [4, -90],   hf: [-8, -84], hb: [-18, -68], ff: [14, 0],  fb: [-18, 0],  sw: -2.1 },
  fn_l1a:    { hip: [10, -48], neck: [22, -88],  hf: [50, -76], hb: [-24, -74], ff: [28, 0],  fb: [-16, 0],  sw: 0.15 },
  // 空中普攻：每种兵器自己的一套（a1 上挑、a2 下砸）
  aj_sword_1s: { hip: [-2, -58], neck: [-4, -98], hf: [-18, -66], hb: [14, -80], ff: [16, -30], fb: [-10, -22], sw: 2.6 },
  aj_sword_1a: { hip: [6, -56], neck: [18, -94], hf: [40, -108], hb: [-22, -74], ff: [22, -34], fb: [-16, -18], sw: -1.0 },
  aj_sword_2s: { hip: [0, -60], neck: [2, -100], hf: [-4, -120], hb: [-20, -96], ff: [14, -36], fb: [-12, -30], sw: -2.7 },
  aj_sword_2a: { hip: [8, -54], neck: [24, -88], hf: [30, -40], hb: [-14, -78], ff: [14, -6], fb: [-6, -12], sw: 1.35 },
  aj_dual_1s: { hip: [0, -58], neck: [10, -96], hf: [16, -76], hb: [8, -80], ff: [18, -32], fb: [-12, -20], sw: 2.5 },
  aj_dual_1a: { hip: [8, -56], neck: [24, -92], hf: [48, -98], hb: [40, -52], ff: [20, -28], fb: [-20, -22], sw: -0.7 },
  aj_dual_2s: { hip: [0, -62], neck: [16, -96], hf: [-10, -88], hb: [18, -104], ff: [16, -40], fb: [2, -36], sw: -2.8 },
  aj_dual_2a: { hip: [6, -54], neck: [22, -88], hf: [36, -38], hb: [22, -34], ff: [-8, -28], fb: [-22, -20], sw: 1.6 },
  aj_greatsword_1s: { hip: [-4, -58], neck: [-8, -96], hf: [-18, -110], hb: [-6, -108], ff: [16, -30], fb: [-14, -24], sw: -2.7 },
  aj_greatsword_1a: { hip: [10, -56], neck: [24, -92], hf: [50, -80], hb: [40, -82], ff: [24, -26], fb: [-14, -16], sw: 0.1 },
  aj_greatsword_2s: { hip: [-2, -62], neck: [0, -102], hf: [-2, -138], hb: [8, -134], ff: [16, -38], fb: [-14, -32], sw: -1.75 },
  aj_greatsword_2a: { hip: [10, -52], neck: [28, -84], hf: [44, -34], hb: [32, -32], ff: [24, -10], fb: [-10, -4], sw: 1.35 },
  aj_spear_1s: { hip: [-6, -58], neck: [0, -96], hf: [-6, -76], hb: [-24, -80], ff: [16, -28], fb: [-18, -24], sw: -0.3 },
  aj_spear_1a: { hip: [10, -58], neck: [26, -96], hf: [50, -110], hb: [4, -92], ff: [18, -26], fb: [-22, -30], sw: -0.75 },
  aj_spear_2s: { hip: [0, -62], neck: [6, -102], hf: [14, -124], hb: [2, -112], ff: [12, -36], fb: [-14, -30], sw: -1.6 },
  aj_spear_2a: { hip: [4, -54], neck: [12, -94], hf: [26, -46], hb: [18, -60], ff: [8, -4], fb: [-10, -10], sw: 1.5 },
  aj_fan_1s: { hip: [-2, -58], neck: [2, -98], hf: [10, -92], hb: [-20, -80], ff: [12, -30], fb: [-14, -18], sw: -2.0 },
  aj_fan_1a: { hip: [6, -58], neck: [14, -98], hf: [42, -102], hb: [-34, -92], ff: [26, -30], fb: [-26, -22], sw: -0.4 },
  aj_fan_2s: { hip: [0, -60], neck: [-4, -100], hf: [-14, -112], hb: [-28, -90], ff: [14, -38], fb: [-10, -28], sw: -2.4 },
  aj_fan_2a: { hip: [8, -56], neck: [22, -92], hf: [40, -52], hb: [-26, -96], ff: [18, -14], fb: [-14, -20], sw: 1.0 },
  aj_fists_1s: { hip: [0, -58], neck: [10, -96], hf: [18, -80], hb: [10, -82], ff: [22, -44], fb: [-12, -18], sw: 0 },
  aj_fists_1a: { hip: [6, -60], neck: [14, -100], hf: [28, -130], hb: [-12, -84], ff: [28, -48], fb: [-10, -14], sw: -1.57 },
  aj_fists_2s: { hip: [-2, -62], neck: [-8, -100], hf: [-6, -80], hb: [-24, -88], ff: [30, -104], fb: [-12, -26], sw: 0 },
  aj_fists_2a: { hip: [6, -56], neck: [14, -94], hf: [20, -70], hb: [-20, -80], ff: [44, -20], fb: [-10, -24], sw: 0 },
  aj_brush_1s: { hip: [-2, -58], neck: [2, -98], hf: [-10, -104], hb: [-18, -80], ff: [14, -30], fb: [-12, -20], sw: -2.4 },
  aj_brush_1a: { hip: [8, -56], neck: [20, -94], hf: [48, -84], hb: [-18, -76], ff: [22, -28], fb: [-14, -18], sw: -0.2 },
  aj_brush_2s: { hip: [0, -60], neck: [6, -100], hf: [18, -128], hb: [-16, -90], ff: [12, -34], fb: [-14, -28], sw: -1.9 },
  aj_brush_2a: { hip: [10, -54], neck: [26, -88], hf: [40, -38], hb: [-14, -80], ff: [22, -12], fb: [-10, -16], sw: 1.25 },
  aj_moonblade_1s: { hip: [-2, -58], neck: [0, -98], hf: [-14, -70], hb: [-22, -86], ff: [10, -20], fb: [-6, -14], sw: 2.2 },
  aj_moonblade_1a: { hip: [4, -60], neck: [10, -100], hf: [36, -112], hb: [-36, -96], ff: [10, -14], fb: [-2, -10], sw: -1.2 },
  aj_moonblade_2s: { hip: [0, -62], neck: [0, -100], hf: [16, -76], hb: [-16, -76], ff: [10, -44], fb: [-10, -44], sw: -0.4 },
  aj_moonblade_2a: { hip: [8, -56], neck: [20, -94], hf: [42, -50], hb: [-30, -92], ff: [16, -18], fb: [-12, -24], sw: 0.9 },
  aj_wing_1s: { hip: [-2, -60], neck: [2, -100], hf: [-30, -98], hb: [-40, -104], ff: [8, -26], fb: [-12, -22], sw: -2.4 },
  aj_wing_1a: { hip: [8, -60], neck: [28, -94], hf: [48, -72], hb: [-38, -100], ff: [-8, -24], fb: [-22, -28], sw: 0.3 },
  aj_wing_2s: { hip: [0, -62], neck: [4, -102], hf: [38, -110], hb: [-38, -110], ff: [18, -44], fb: [2, -40], sw: -1.4 },
  aj_wing_2a: { hip: [2, -58], neck: [0, -98], hf: [36, -104], hb: [-38, -104], ff: [26, -6], fb: [16, -2], sw: -0.6 },
  aj_flute_1s: { hip: [0, -58], neck: [4, -98], hf: [16, -92], hb: [10, -92], ff: [14, -38], fb: [-12, -34], sw: 1.25 },
  aj_flute_1a: { hip: [6, -58], neck: [16, -98], hf: [40, -106], hb: [-24, -82], ff: [22, -28], fb: [-16, -22], sw: -0.9 },
  aj_flute_2s: { hip: [0, -62], neck: [2, -102], hf: [4, -128], hb: [-16, -110], ff: [14, -36], fb: [-12, -30], sw: -1.6 },
  aj_flute_2a: { hip: [8, -54], neck: [22, -90], hf: [36, -44], hb: [-18, -80], ff: [18, -10], fb: [-12, -16], sw: 1.2 },
  aj_gourd_1s: { hip: [0, -58], neck: [-12, -96], hf: [-4, -110], hb: [-24, -80], ff: [20, -36], fb: [-6, -20], sw: -1.4 },
  aj_gourd_1a: { hip: [2, -60], neck: [-14, -96], hf: [36, -100], hb: [-30, -84], ff: [36, -60], fb: [4, -24], sw: -0.8 },
  aj_gourd_2s: { hip: [0, -62], neck: [18, -90], hf: [10, -72], hb: [-6, -76], ff: [-6, -40], fb: [-16, -36], sw: 0.6 },
  aj_gourd_2a: { hip: [6, -58], neck: [26, -86], hf: [32, -34], hb: [-12, -60], ff: [-14, -50], fb: [-24, -40], sw: 1.4 },
  aj_hammer_1s: { hip: [-2, -58], neck: [-4, -98], hf: [-22, -100], hb: [10, -80], ff: [16, -30], fb: [-14, -22], sw: -2.6 },
  aj_hammer_1a: { hip: [8, -58], neck: [22, -96], hf: [46, -98], hb: [-16, -80], ff: [22, -26], fb: [-16, -20], sw: -0.7 },
  aj_hammer_2s: { hip: [0, -62], neck: [2, -102], hf: [6, -132], hb: [-18, -92], ff: [16, -38], fb: [-12, -30], sw: -1.6 },
  aj_hammer_2a: { hip: [10, -54], neck: [28, -86], hf: [36, -30], hb: [-12, -72], ff: [22, -10], fb: [-10, -14], sw: 1.5 },
  aj_spindle_1s: { hip: [0, -58], neck: [8, -98], hf: [-18, -88], hb: [22, -82], ff: [18, -30], fb: [-12, -20], sw: 2.8 },
  aj_spindle_1a: { hip: [10, -58], neck: [26, -94], hf: [50, -86], hb: [-26, -78], ff: [20, -24], fb: [-18, -26], sw: -0.1 },
  aj_spindle_2s: { hip: [0, -62], neck: [14, -98], hf: [20, -108], hb: [-10, -104], ff: [16, -40], fb: [0, -36], sw: -2.0 },
  aj_spindle_2a: { hip: [6, -54], neck: [20, -90], hf: [30, -40], hb: [20, -36], ff: [-6, -26], fb: [-20, -20], sw: 1.4 },
  // 空中放技能的姿势（AIR_SKILL_POSE 里按技能对照地面姿势）
  ak_gale0: { hip: [0, -58], neck: [20, -92], hf: [-22, -68], hb: [12, -72], ff: [20, -32], fb: [-18, -26], sw: 3.1 },
  ak_gale1: { hip: [14, -60], neck: [40, -86], hf: [68, -82], hb: [-16, -74], ff: [-14, -40], fb: [-30, -34], sw: 0.0 },
  ak_swordqi0: { hip: [-2, -60], neck: [-4, -100], hf: [-10, -118], hb: [16, -88], ff: [16, -36], fb: [-12, -28], sw: -2.5 },
  ak_swordqi1: { hip: [8, -58], neck: [22, -94], hf: [48, -62], hb: [-24, -90], ff: [22, -22], fb: [-18, -30], sw: 0.6 },
  ak_blink0: { hip: [0, -60], neck: [4, -100], hf: [12, -88], hb: [6, -86], ff: [12, -40], fb: [-10, -38], sw: -1.2 },
  ak_blink1: { hip: [6, -58], neck: [30, -86], hf: [-10, -70], hb: [-22, -72], ff: [-10, -40], fb: [-26, -34], sw: 2.75 },
  ak_blink2: { hip: [8, -58], neck: [24, -94], hf: [50, -96], hb: [42, -52], ff: [22, -30], fb: [-20, -24], sw: -0.6 },
  ak_kunai0: { hip: [0, -58], neck: [6, -98], hf: [-14, -90], hb: [18, -78], ff: [18, -34], fb: [-12, -26], sw: -2.4 },
  ak_kunai1: { hip: [6, -58], neck: [24, -92], hf: [50, -72], hb: [-30, -88], ff: [16, -24], fb: [-20, -30], sw: 0.5 },
  ak_quake0: { hip: [-2, -62], neck: [0, -102], hf: [0, -138], hb: [10, -134], ff: [18, -40], fb: [-14, -34], sw: -1.7 },
  ak_quake1: { hip: [12, -52], neck: [30, -84], hf: [48, -30], hb: [36, -28], ff: [10, -2], fb: [-6, -4], sw: 1.35 },
  ak_ironwall0: { hip: [10, -60], neck: [38, -76], hf: [24, -58], hb: [-14, -64], ff: [-18, -46], fb: [-32, -40], sw: 2.4 },
  ak_backthrust0: { hip: [-6, -58], neck: [4, -98], hf: [-4, -82], hb: [-28, -88], ff: [18, -26], fb: [-20, -32], sw: 0.05 },
  ak_backthrust1: { hip: [12, -58], neck: [34, -90], hf: [74, -84], hb: [-14, -80], ff: [-8, -28], fb: [-24, -38], sw: 0.02 },
  ak_spin0: { hip: [0, -60], neck: [6, -100], hf: [44, -76], hb: [-24, -90], ff: [22, -34], fb: [-22, -30], sw: 0 },
  ak_windblade0: { hip: [-2, -60], neck: [6, -100], hf: [38, -104], hb: [-24, -82], ff: [22, -32], fb: [-20, -22], sw: -2.2 },
  ak_windblade1: { hip: [6, -58], neck: [18, -96], hf: [46, -60], hb: [-32, -94], ff: [10, -26], fb: [-6, -30], sw: 0.5 },
  ak_windstep0: { hip: [0, -60], neck: [4, -100], hf: [20, -120], hb: [-26, -96], ff: [16, -36], fb: [-14, -28], sw: -1.7 },
  ak_windstep1: { hip: [6, -50], neck: [30, -72], hf: [54, -46], hb: [-24, -72], ff: [-14, -38], fb: [-26, -32], sw: 0.7 },
  ak_thunderfist0: { hip: [0, -58], neck: [14, -96], hf: [6, -82], hb: [24, -86], ff: [24, -42], fb: [-14, -20], sw: 0 },
  ak_thunderfist1: { hip: [6, -62], neck: [36, -80], hf: [68, -82], hb: [-8, -70], ff: [-24, -48], fb: [-36, -40], sw: 0 },
  ak_stomp0: { hip: [0, -60], neck: [4, -100], hf: [18, -82], hb: [14, -84], ff: [14, -32], fb: [-14, -32], sw: 0 },
  ak_stomp1: { hip: [4, -58], neck: [12, -98], hf: [42, -54], hb: [-24, -120], ff: [18, -10], fb: [-18, -16], sw: 0 },
  ak_inktrap0: { hip: [-2, -60], neck: [6, -100], hf: [30, -120], hb: [-14, -84], ff: [14, -34], fb: [-12, -28], sw: -2.2 },
  ak_inktrap1: { hip: [10, -56], neck: [28, -90], hf: [50, -42], hb: [-16, -78], ff: [18, -16], fb: [-14, -22], sw: 1.0 },
  ak_inksplash0: { hip: [0, -60], neck: [6, -100], hf: [20, -96], hb: [10, -88], ff: [16, -38], fb: [-10, -32], sw: -2.0 },
  ak_inksplash1: { hip: [8, -58], neck: [20, -96], hf: [50, -94], hb: [-24, -76], ff: [22, -26], fb: [-18, -22], sw: -0.3 },
  ak_mirror0: { hip: [0, -60], neck: [2, -100], hf: [22, -92], hb: [16, -86], ff: [10, -42], fb: [-10, -42], sw: -1.4 },
  ak_mirror1: { hip: [8, -60], neck: [18, -100], hf: [40, -114], hb: [-30, -82], ff: [22, -26], fb: [-16, -30], sw: -1.0 },
  ak_moonring0: { hip: [-2, -60], neck: [0, -100], hf: [-24, -92], hb: [16, -82], ff: [16, -34], fb: [-12, -26], sw: 2.6 },
  ak_moonring1: { hip: [8, -58], neck: [22, -96], hf: [50, -90], hb: [-28, -84], ff: [18, -24], fb: [-18, -30], sw: -0.3 },
  ak_dive0: { hip: [0, -64], neck: [2, -104], hf: [40, -118], hb: [-40, -118], ff: [6, -30], fb: [-6, -30], sw: -1.5 },
  ak_dive1: { hip: [6, -46], neck: [30, -58], hf: [50, -32], hb: [-26, -44], ff: [-12, -40], fb: [-24, -34], sw: 1.0 },
  ak_darts0: { hip: [0, -62], neck: [4, -102], hf: [-34, -106], hb: [-42, -98], ff: [10, -30], fb: [-10, -26], sw: -2.6 },
  ak_darts1: { hip: [8, -60], neck: [24, -96], hf: [48, -88], hb: [40, -80], ff: [-4, -26], fb: [-18, -30], sw: 0.0 },
  ak_soundwave0: { hip: [0, -60], neck: [4, -100], hf: [16, -92], hb: [10, -92], ff: [12, -40], fb: [-12, -36], sw: 1.25 },
  ak_soundwave1: { hip: [8, -58], neck: [20, -96], hf: [50, -84], hb: [-22, -92], ff: [24, -28], fb: [-22, -22], sw: 0.1 },
  ak_echowall0: { hip: [0, -62], neck: [4, -102], hf: [18, -120], hb: [-12, -118], ff: [16, -36], fb: [-14, -32], sw: 0.0 },
  ak_pavilion0: { hip: [0, -60], neck: [-14, -96], hf: [10, -122], hb: [-28, -82], ff: [22, -36], fb: [-6, -22], sw: -1.4 },
  ak_pavilion1: { hip: [6, -58], neck: [18, -96], hf: [46, -66], hb: [-24, -90], ff: [30, -44], fb: [-10, -20], sw: 0.6 },
  ak_feast0: { hip: [0, -60], neck: [-10, -98], hf: [-20, -106], hb: [16, -82], ff: [18, -30], fb: [-8, -34], sw: -2.2 },
  ak_feast1: { hip: [8, -58], neck: [24, -94], hf: [52, -82], hb: [-18, -76], ff: [4, -30], fb: [-14, -26], sw: 0.0 },
  ak_feast2: { hip: [0, -60], neck: [-12, -98], hf: [18, -80], hb: [2, -112], ff: [20, -34], fb: [-8, -24], sw: -1.2 },
  ak_hook0: { hip: [-2, -60], neck: [0, -100], hf: [-4, -124], hb: [16, -82], ff: [16, -34], fb: [-14, -28], sw: -2.2 },
  ak_hook1: { hip: [12, -60], neck: [34, -90], hf: [66, -86], hb: [-16, -76], ff: [-6, -30], fb: [-22, -36], sw: 0 },
  ak_hook2: { hip: [-8, -60], neck: [-16, -98], hf: [10, -82], hb: [-26, -80], ff: [20, -28], fb: [-20, -36], sw: 0.3 },
  ak_whirl0: { hip: [0, -62], neck: [2, -102], hf: [10, -134], hb: [-20, -90], ff: [26, -34], fb: [-26, -30], sw: -1.6 },
  ak_whirl1: { hip: [10, -60], neck: [28, -94], hf: [60, -98], hb: [-18, -80], ff: [22, -26], fb: [-22, -32], sw: -0.3 },
  ak_spindle0: { hip: [2, -60], neck: [16, -96], hf: [-14, -80], hb: [30, -90], ff: [20, -32], fb: [-12, -24], sw: 2.6 },
  ak_spindle1: { hip: [10, -58], neck: [28, -92], hf: [54, -86], hb: [-24, -70], ff: [0, -28], fb: [-18, -34], sw: -0.2 },
  ak_shadowdash0: { hip: [0, -60], neck: [14, -98], hf: [-10, -86], hb: [24, -96], ff: [18, -38], fb: [-6, -34], sw: 2.4 },
  ak_shadowdash1: { hip: [8, -56], neck: [36, -78], hf: [60, -74], hb: [-20, -66], ff: [-16, -40], fb: [-30, -34], sw: 0.1 },
};
const JOINTS = ['hip', 'neck', 'hf', 'hb', 'ff', 'fb'];

