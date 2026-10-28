// ======================= 招式 =======================
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

