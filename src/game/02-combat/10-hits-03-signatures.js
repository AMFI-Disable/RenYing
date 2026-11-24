// ======================= 招牌机制：每位侠客不一样的回报 =======================
// 本文件：几位定位接近的侠客，在同一个机制上给出不同的回报，让新玩家一上手就能分清谁是谁。
//   目前先做「霸体」：七位霸体侠客以前扛住一下的反馈完全一样（攒气加一点、技能冷却快一点），现在各按自己的定位给不一样的回报。
// 数值很小，只改变手感，不改变强弱；改之前看 docs/design/hero-roles.md 里每位的定位。
// 找 bug 提示：某位霸体侠客扛住攻击后没有回报，看 ARMOR_PERK 里有没有他的编号；没写的人走 ARMOR_PERK_DEFAULT。
const ARMOR_PERK_DEFAULT = { meter: 2.5, cd: 0.4 };
const ARMOR_PERK = {
  tieshan: { meter: 2.5, cd: 0.7 },             // 铁山：借力打力，技能转得最快
  xuanwu: { meter: 1.0, guard: 16 },            // 玄武：龟壳，扛住一下就把架势补回来一截
  tiangang: { meter: 1.0, cd: 0.9 },            // 天罡：破阵，两个技能冷却回得最多
  bawang: { meter: 5.0, cd: 0.2 },              // 霸王：越挨越怒，大招气攒得最快
  polang: { meter: 1.0, heal: 9 },              // 破浪：潮涌，扛住一下回一点血
  cangming: { meter: 1.5, cd: 0.5, guard: 8 },  // 苍冥：寒渊，冷却和架势各回一点
  chixiao: { meter: 3.0, cd: 0.3 },             // 炽霄：炎势，攒气偏快
};
// 霸体扛住一下以后的回报；被动不是「霸体」的侠客不走这里
function armorPerk(def) {
  if (!def || !def.ch || def.ch.passive !== 'armor') return;
  const p = ARMOR_PERK[def.ch.id] || ARMOR_PERK_DEFAULT;
  if (p.meter) def.meter = Math.min(100, def.meter + p.meter);
  if (p.cd) { def.skillCD = Math.max(0, def.skillCD - p.cd); def.skill2CD = Math.max(0, def.skill2CD - p.cd); }
  if (p.guard && def.guard !== undefined) def.guard = Math.min(def.maxGuard, def.guard + p.guard);
  if (p.heal && def.hp > 0) { def.hp = Math.min(def.maxHp, def.hp + p.heal); def.lagHp = Math.max(def.lagHp || 0, def.hp); }
  if (!RESIM) ring(def.x, def.y - 60, 90, def.look && def.look.slash ? def.look.slash : '255,200,120', 0.25);
}
