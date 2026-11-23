// ======================= 招式 =======================
// 本文件：把 src/data/ 的侠客表展开成游戏里用的 CHARS / BAL / CHAR_MOVES。
//   balOf / balDmg：按侠客的强度倍率算伤害；buildMoves：普攻底子 × 侠客 stat × moveMods = 这位侠客的招式表
//   WEAPON_LEN / WEAPON_POSE_MODS：各种兵器的长度和出招姿势的替换
// 找 bug 提示：某位侠客的普攻帧数和预期不一样，在控制台打印 CHAR_MOVES[CHAR_IDX.<id>] 对照 src/data/01-moves.js。
// 普攻招式表 MOVES、大招收尾 FINAL / SP_SLASH 和取消规则 CANCEL 在 src/data/01-moves.js

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
const WEAPON_LEN = { wing: 48, sword: 54, dual: 40, greatsword: 70, spear: 88, fan: 36, fists: 16, brush: 66, moonblade: 58, flute: 50, gourd: 16, hammer: 56, spindle: 42, magnet: 16, puppet: 20 };
// 新兵器沿用原有骨架长度，保持招式轨迹与距离。
Object.assign(WEAPON_LEN, {
  firerake: 88, dyelash: 56, stargauge: 58, rescueanchor: 70,
  abyssblade: 70, jadefan: 36, bastionshell: 56, blazegauntlet: 16,
  foxdaggers: 40, cranewing: 48, gangpike: 88, soulbrush: 66,
  frostrapier: 54, rocwing: 48, reapscythes: 40, spiritflute: 50,
  overlordblade: 70, chimefan: 36, iaidoblade: 54, vermilionbrush: 66
});
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
  magnet: { l1: ['lm_boxer', 'lm_jab'], l2: ['l2s', 'lm_jab'], l3: ['fn_l1s', 'fn_l1a'], l4: ['lds', 'lm_kick'], hv: ['hvs', 'hva'], a1: ['aj_fists_1s', 'aj_fists_1a'], a2: ['aj_fists_2s', 'aj_fists_2a'] },   // 磁仙：两手各托一块磁石，推掌、拍掌
};
Object.assign(WEAPON_POSE_MODS, {
  firerake: { l1: ['rk_l1s', 'rk_l1a'], l2: ['rk_l2s', 'rk_l2a'], l3: ['rk_l1s', 'rk_l1a'], l5: ['rk_l2s', 'rk_l2a'], hv: ['rk_l2s', 'ts_slam'], a1: ['aj_spear_1s', 'aj_spear_1a'], a2: ['aj_spear_2s', 'aj_spear_2a'] },
  dyelash: { l1: ['dl_l1s', 'dl_l1a'], l2: ['dl_l2s', 'dl_l2a'], l3: ['dl_l1s', 'dl_l2a'], hv: ['dl_l1s', 'gc_throw'], a1: ['aj_hammer_1s', 'aj_hammer_1a'], a2: ['aj_hammer_2s', 'aj_hammer_2a'] },
  stargauge: { l1: ['sg_l1s', 'sg_l1a'], l2: ['sg_l2s', 'sg_l2a'], l3: ['sg_l1s', 'sg_l2a'], hv: ['sg_l2s', 'hva'], a1: ['aj_moonblade_1s', 'aj_moonblade_1a'], a2: ['aj_moonblade_2s', 'aj_moonblade_2a'] },
  rescueanchor: { l1: ['an_l1s', 'an_l1a'], l2: ['an_l2s', 'an_l2a'], l4: ['an_l1s', 'ts_slam'], hv: ['an_l1s', 'an_l1a'], a1: ['aj_greatsword_1s', 'aj_greatsword_1a'], a2: ['aj_greatsword_2s', 'aj_greatsword_2a'] },
  abyssblade: { l1: ['ab_l1s', 'ab_l1a'], l2: ['ab_l2s', 'ab_l2a'], l4: ['ab_l1s', 'ts_slam'], hv: ['ab_l1s', 'ab_l1a'], a1: ['aj_greatsword_1s', 'aj_greatsword_1a'], a2: ['aj_greatsword_2s', 'aj_greatsword_2a'] },
  jadefan: { l1: ['jf_l1s', 'jf_l1a'], l2: ['jf_l2s', 'jf_l2a'], l3: ['jf_l1s', 'jf_l2a'], hv: ['jf_l2s', 'hva'], a1: ['aj_fan_1s', 'aj_fan_1a'], a2: ['aj_fan_2s', 'aj_fan_2a'] },
  bastionshell: { l1: ['bs_l1s', 'bs_l1a'], l2: ['bs_l2s', 'bs_l2a'], l3: ['bs_l1s', 'bs_l1a'], hv: ['bs_l1s', 'ts_slam'], a1: ['aj_hammer_1s', 'aj_hammer_1a'], a2: ['aj_hammer_2s', 'aj_hammer_2a'] },
  blazegauntlet: { l1: ['bg_l1s', 'bg_l1a'], l2: ['bg_l2s', 'bg_l2a'], l3: ['bg_l1s', 'lm_kick'], l4: ['bg_l2s', 'bg_l2a'], hv: ['bg_l2s', 'bg_l2a'], a1: ['aj_fists_1s', 'aj_fists_1a'], a2: ['aj_fists_2s', 'aj_fists_2a'] },
  foxdaggers: { l1: ['fd_l1s', 'fd_l1a'], l2: ['fd_l2s', 'fd_l2a'], l3: ['fy_crouch', 'fy_xslash'], l4: ['fd_l1s', 'fd_l2a'], a1: ['aj_dual_1s', 'aj_dual_1a'], a2: ['aj_dual_2s', 'aj_dual_2a'] },
  cranewing: { l1: ['cw_l1s', 'cw_l1a'], l2: ['cw_l2s', 'cw_l2a'], l3: ['cw_l1s', 'cw_l2a'], hv: ['cw_l2s', 'hva'], a1: ['aj_wing_1s', 'aj_wing_1a'], a2: ['aj_wing_2s', 'aj_wing_2a'] },
  gangpike: { l1: ['gp_l1s', 'gp_l1a'], l2: ['gp_l2s', 'gp_l2a'], l3: ['gp_l1s', 'ls_thrust'], l5: ['gp_l2s', 'gp_l1a'], a1: ['aj_spear_1s', 'aj_spear_1a'], a2: ['aj_spear_2s', 'aj_spear_2a'] },
  soulbrush: { l1: ['sb_l1s', 'sb_l1a'], l2: ['sb_l2s', 'sb_l2a'], l4: ['sb_l1s', 'lda'], hv: ['sb_l1s', 'hva'], a1: ['aj_brush_1s', 'aj_brush_1a'], a2: ['aj_brush_2s', 'aj_brush_2a'] },
  frostrapier: { l1: ['fr_l1s', 'fr_l1a'], l2: ['fr_l2s', 'fr_l2a'], l3: ['fr_l1s', 'fr_l1a'], hv: ['fr_l2s', 'hva'], a1: ['aj_sword_1s', 'aj_sword_1a'], a2: ['aj_sword_2s', 'aj_sword_2a'] },
  rocwing: { l1: ['rw_l1s', 'rw_l1a'], l2: ['rw_l2s', 'rw_l2a'], l3: ['rw_l1s', 'rw_l2a'], hv: ['rw_l2s', 'hva'], a1: ['aj_wing_1s', 'aj_wing_1a'], a2: ['aj_wing_2s', 'aj_wing_2a'] },
  reapscythes: { l1: ['rs_l1s', 'rs_l1a'], l2: ['rs_l2s', 'rs_l2a'], l3: ['fy_crouch', 'rs_l2a'], l4: ['rs_l1s', 'rs_l2a'], a1: ['aj_dual_1s', 'aj_dual_1a'], a2: ['aj_dual_2s', 'aj_dual_2a'] },
  spiritflute: { l1: ['sf_l1s', 'sf_l1a'], l2: ['sf_l2s', 'sf_l2a'], l3: ['sf_l1s', 'sf_l2a'], hv: ['sf_l2s', 'hva'], a1: ['aj_flute_1s', 'aj_flute_1a'], a2: ['aj_flute_2s', 'aj_flute_2a'] },
  overlordblade: { l1: ['ob_l1s', 'ob_l1a'], l2: ['ob_l2s', 'ob_l2a'], l4: ['ob_l1s', 'ts_slam'], hv: ['ob_l1s', 'ob_l1a'], a1: ['aj_greatsword_1s', 'aj_greatsword_1a'], a2: ['aj_greatsword_2s', 'aj_greatsword_2a'] },
  chimefan: { l1: ['cf_l1s', 'cf_l1a'], l2: ['cf_l2s', 'cf_l2a'], l3: ['cf_l1s', 'cf_l2a'], hv: ['cf_l2s', 'hva'], a1: ['aj_fan_1s', 'aj_fan_1a'], a2: ['aj_fan_2s', 'aj_fan_2a'] },
  iaidoblade: { l1: ['ib_l1s', 'ib_l1a'], l2: ['ib_l2s', 'ib_l2a'], l3: ['ib_l1s', 'ib_l1a'], hv: ['ib_l1s', 'ib_l1a'], a1: ['aj_sword_1s', 'aj_sword_1a'], a2: ['aj_sword_2s', 'aj_sword_2a'] },
  vermilionbrush: { l1: ['vb_l1s', 'vb_l1a'], l2: ['vb_l2s', 'vb_l2a'], l4: ['vb_l1s', 'lda'], hv: ['vb_l1s', 'hva'], a1: ['aj_brush_1s', 'aj_brush_1a'], a2: ['aj_brush_2s', 'aj_brush_2a'] }
});
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

