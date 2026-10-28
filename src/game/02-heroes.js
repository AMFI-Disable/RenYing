// ======================= 招式 =======================
const MOVES = {
  l1: { p: ['l1s', 'l1a'], su: .075, ac: .07, rc: .17, dmg: 14, kb: [170, 0], stun: .32, hs: .055, box: [8, -112, 82, -28], lunge: 150, next: { light: 'l2', heavy: 'hv' }, snd: 'swing' },
  l2: { p: ['l2s', 'l2a'], su: .07, ac: .07, rc: .18, dmg: 15, kb: [170, 0], stun: .32, hs: .055, box: [8, -108, 84, -36], lunge: 160, next: { light: 'l3', heavy: 'hv' }, snd: 'swing' },
  l3: { p: ['lcs', 'lca'], su: .075, ac: .075, rc: .18, dmg: 18, kb: [170, 0], stun: .34, hs: .06, box: [8, -96, 90, -10], lunge: 170, next: { light: 'l4', heavy: 'hv' }, snd: 'swing' },
  l4: { p: ['lds', 'lda'], su: .09, ac: .08, rc: .2, dmg: 22, kb: [180, 0], stun: .36, hs: .07, box: [6, -120, 92, -8], lunge: 180, next: { light: 'l5', heavy: 'hv' }, snd: 'heavy' },
  l6: { p: ['l1s', 'l1a'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .32, hs: .05, box: [8, -112, 82, -28], lunge: 120, next: { light: 'l7' }, snd: 'swing' },
  l7: { p: ['l2s', 'l2a'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .32, hs: .05, box: [8, -108, 84, -36], lunge: 120, next: { light: 'l8' }, snd: 'swing' },
  l8: { p: ['lcs', 'lca'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .32, hs: .05, box: [8, -96, 90, -10], lunge: 120, next: { light: 'l9' }, snd: 'swing' },
  l9: { p: ['lds', 'lda'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .34, hs: .06, box: [6, -120, 92, -8], lunge: 120, next: { light: 'l10' }, snd: 'swing' },
  l10: { p: ['l3s', 'l3a'], su: .09, ac: .08, rc: .24, dmg: 12, kb: [520, -260], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 260, launch: true, next: {}, snd: 'heavy' },
  l5: { p: ['l3s', 'l3a'], su: .1, ac: .09, rc: .28, dmg: 28, kb: [560, -240], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 300, launch: true, next: {}, snd: 'heavy' },
  hv: { p: ['hvs', 'hva'], su: .14, ac: .09, rc: .3, dmg: 38, kb: [80, -1020], stun: .6, hs: .11, box: [0, -150, 84, -8], lunge: 130, launch: true, jumpCancel: true, next: {}, snd: 'heavy' },
  a1: { p: ['a1s', 'a1a'], air: true, su: .06, ac: .09, rc: .14, dmg: 18, kb: [150, -430], stun: .4, hs: .065, box: [0, -84, 86, 6], next: { light: 'a2' }, snd: 'swing' },
  cs1: { p: ['charge', 'spa'], su: .04, ac: .12, rc: .06, dmg: 36, kb: [540, 0], stun: .5, hs: .12, box: [0, -112, 112, -18], lunge: 900, next: {}, snd: 'heavy' },
  cs2: { p: ['charge', 'spa'], su: .04, ac: .16, rc: .08, knock: true, dmg: 58, kb: [720, -720], stun: .6, hs: .2, box: [0, -120, 124, -10], lunge: 1350, launch: true, unblockable: true, big: true, next: {}, snd: 'heavy' },
  cf: { p: ['hvs', 'hva'], su: .05, ac: .1, rc: .26, dmg: 22, kb: [320, -420], stun: .45, hs: .08, box: [-6, -160, 104, -6], track: true, launch: true, next: {}, snd: 'swing' },
  a2: { p: ['a2s', 'a2a'], air: true, su: .08, ac: .09, rc: .22, dmg: 26, kb: [240, 1000], stun: .5, hs: .11, box: [-4, -70, 80, 24], spike: true, next: {}, snd: 'heavy' },
  dl: { p: ['fy_crouch', 'fy_crouch'], su: .055, ac: .06, rc: .12, dmg: 5, kb: [45, 0], stun: .28, hs: .03, box: [12, -45, 82, 0], lunge: 60, next: { light: 'l1', heavy: 'hv' }, hitNext: { light: 'l1', heavy: 'hv' }, snd: 'swing' },
};
const FINAL = { ult: true, noScale: true, dmg: 85, kb: [520, -900], stun: .6, hs: .24, launch: true, unblockable: true };
const SP_SLASH = { ult: true, noScale: true, dmg: 16, kb: [0, 0], stun: .3, hs: .035, unblockable: true, hold: true };

// ======================= 角色 =======================
// 每位侠客的强度、属性和故事都在 src/data/heroes/ 里，一位一个文件（说明在 src/data/00-heroes.js）
const BAL = Object.fromEntries(HEROES.map(x => [x.id, x.bal]));
const balOf = f => (f && f.ch && BAL[f.ch.id]) || BAL.qingfeng;
function balDmg(att, m) { const b = balOf(att); return m.ult ? b.ult : (m.sk || (!m.isProj && att.state === 'skill')) ? b.skill : b.normal; }
// 图鉴里标出强度调整（招式说明里写的伤害是调整前的数）
function balNote(id) {
  const b = BAL[id], x = v => `×${+v.toFixed(2)}`; if (!b) return '';
  if (b.normal === b.skill && b.skill === b.ult && b.ult === b.hp) return b.hp === 1 ? '' : `伤害与气血 ${x(b.hp)}`;
  const out = [b.normal === b.skill ? `伤害 ${x(b.normal)}` : `普攻 ${x(b.normal)}`];
  if (b.normal !== b.skill) out.push(`技能${b.ult === b.skill ? '与大招' : ''} ${x(b.skill)}`);
  if (b.ult !== b.skill) out.push(`大招 ${x(b.ult)}`);
  out.push(`气血 ${x(b.hp)}`);
  return out.join(' · ');
}

const CHARS = HEROES.map(x => x.char);
const CHAR_IDX = Object.fromEntries(CHARS.map((c, i) => [c.id, i]));
// 墨羽的墨水：每甩一团墨消耗 INK_COST，每秒恢复 INK_REGEN
const INK_MAX = 100, INK_COST = 15, INK_REGEN = 10, INK_DMG = 24;
// 墨羽的符：R 画一张花 FU_INK 格墨水，最多 FU_MAX 张；大招全部烧掉，伤害 FU_BASE + FU_PER × 张数
const FU_MAX = 5, FU_INK = 3, FU_BASE = 80, FU_PER = 40;
const WEAPON_LEN = { wing: 48, sword: 54, dual: 40, greatsword: 70, spear: 88, fan: 36, fists: 16, brush: 66, moonblade: 58, flute: 50, gourd: 16, hammer: 56, spindle: 42 };
// 按兵器流派定制专属普攻武学动作映射
const WEAPON_POSE_MODS = {
  wing: { a1: ['aj_wing_1s', 'aj_wing_1a'], a2: ['aj_wing_2s', 'aj_wing_2a'] },
  moonblade: { a1: ['aj_moonblade_1s', 'aj_moonblade_1a'], a2: ['aj_moonblade_2s', 'aj_moonblade_2a'] },
  sword: { a1: ['aj_sword_1s', 'aj_sword_1a'], a2: ['aj_sword_2s', 'aj_sword_2a'] },
  spear: { l1: ['sp_l1s', 'sp_l1a'], l2: ['sp_l2s', 'sp_l2a'], l3: ['ls_stance', 'ls_thrust'], l5: ['ls_stance', 'ls_thrust'], a1: ['aj_spear_1s', 'aj_spear_1a'], a2: ['aj_spear_2s', 'aj_spear_2a'] },
  dual: { l1: ['du_l1s', 'du_l1a'], l2: ['du_l2s', 'du_l2a'], l3: ['fy_crouch', 'fy_xslash'], l4: ['du_l1s', 'fy_xslash'], a1: ['aj_dual_1s', 'aj_dual_1a'], a2: ['aj_dual_2s', 'aj_dual_2a'] },
  greatsword: { l1: ['gs_l1s', 'gs_l1a'], l2: ['l2s', 'l2a'], l4: ['ts_lift', 'ts_slam'], hv: ['ts_lift', 'hva'], a1: ['aj_greatsword_1s', 'aj_greatsword_1a'], a2: ['aj_greatsword_2s', 'aj_greatsword_2a'] },
  fists: { l1: ['lm_boxer', 'lm_jab'], l2: ['l2s', 'lm_jab'], l3: ['lm_boxer', 'lm_kick'], l4: ['lds', 'lm_kick'], l6: ['lm_boxer', 'lm_jab'], l8: ['lm_boxer', 'lm_kick'], a1: ['aj_fists_1s', 'aj_fists_1a'], a2: ['aj_fists_2s', 'aj_fists_2a'] },
  gourd: { l1: ['zx_sway', 'lm_jab'], l2: ['zx_drink', 'zx_breath'], l3: ['zx_sway', 'zx_upper'], hv: ['zx_sway', 'zx_upper'], a1: ['aj_gourd_1s', 'aj_gourd_1a'], a2: ['aj_gourd_2s', 'aj_gourd_2a'] },
  fan: { l1: ['fn_l1s', 'fn_l1a'], l2: ['ly_fanswipe', 'l2a'], l3: ['fn_l1s', 'ly_fanswipe'], a1: ['aj_fan_1s', 'aj_fan_1a'], a2: ['aj_fan_2s', 'aj_fan_2a'] },
  flute: { l1: ['yx_play', 'yx_push'], l2: ['fn_l1s', 'fn_l1a'], l3: ['yx_play', 'lca'], a1: ['aj_flute_1s', 'aj_flute_1a'], a2: ['aj_flute_2s', 'aj_flute_2a'] },
  brush: { l1: ['my_stroke', 'my_paint'], l2: ['l2s', 'my_paint'], l4: ['my_stroke', 'lda'], a1: ['aj_brush_1s', 'aj_brush_1a'], a2: ['aj_brush_2s', 'aj_brush_2a'] },
  hammer: { l1: ['gc_wind', 'gc_throw'], l2: ['gc_pull', 'gc_sweep'], l3: ['gc_wind', 'gc_throw'], a1: ['aj_hammer_1s', 'aj_hammer_1a'], a2: ['aj_hammer_2s', 'aj_hammer_2a'] },
  spindle: { l1: ['du_l1s', 'du_l1a'], l2: ['du_l2s', 'du_l2a'], l3: ['du_l1s', 'lca'], hv: ['du_l1s', 'hva'], a1: ['aj_spindle_1s', 'aj_spindle_1a'], a2: ['aj_spindle_2s', 'aj_spindle_2a'] },
};
// 按角色属性生成每个角色自己的招式表
function buildMoves(ch) {
  const out = {}, st = ch.stat;
  const wMods = WEAPON_POSE_MODS[ch.look && ch.look.weapon] || {};
  for (const [k, m0] of Object.entries(MOVES)) {
    const m = JSON.parse(JSON.stringify(m0));
    if (wMods[k]) m.p = [...wMods[k]];
    Object.assign(m, (ch.moveMods || {})[k]);
    m.su *= st.speed; m.rc *= st.speed; m.ac *= st.swing || Math.sqrt(st.speed);
    if (m.suAdd) m.su += m.suAdd;   // 额外的起手僵直（不随出手速度缩放）
    m.dmg = m.dmgAbs !== undefined ? m.dmgAbs : Math.round(m.dmg * st.dmg * 10) / 10;
    const reach = st.reach * (m.reachMul || 1);
    m.box[2] = m.box[0] + (m.box[2] - m.box[0]) * reach;
    m.name = k; out[k] = m;
  }
  return out;
}
const CHAR_MOVES = CHARS.map(buildMoves);
const HEAVY_MOVES = ['hv', 'cs1', 'cs2'];

