// ======================= 招牌机制：每位侠客不一样的回报 =======================
// 本文件：几位定位接近的侠客，在同一个机制上给出不同的回报，让新玩家一上手就能分清谁是谁。
//   目前先做「霸体」：七位霸体侠客以前扛住一下的反馈完全一样（攒气加一点、技能冷却快一点），现在各按自己的定位给不一样的回报。
// 数值很小，只改变手感，不改变强弱；改之前看 docs/design/hero-roles.md 里每位的定位。
// 找 bug 提示：某位霸体侠客扛住攻击后没有回报，看 ARMOR_PERK 里有没有他的编号；没写的人走 ARMOR_PERK_DEFAULT。
const ARMOR_PERK_DEFAULT = { meter: 2.5, cd: 0.4 };
const ARMOR_PERK = {
  tieshan: { meter: 2.5, cd: 0.7 },             // 铁山：借力打力，技能转得最快
  xuanwu: { meter: 1.0, guard: 16, reflect: 10 }, // 玄武：玄甲反震，补架势并反震近身攻击者
};
// 霸体扛住一下以后的回报；被动不是「霸体/玄甲反震」的侠客不走这里
function armorPerk(def, att) {
  if (!def || !def.ch || (def.ch.passive !== 'armor' && def.ch.passive !== 'shell')) return;
  const p = ARMOR_PERK[def.ch.id] || ARMOR_PERK_DEFAULT;
  if (p.meter) def.meter = Math.min(100, def.meter + p.meter);
  if (p.cd) { def.skillCD = Math.max(0, def.skillCD - p.cd); def.skill2CD = Math.max(0, def.skill2CD - p.cd); }
  if (p.guard && def.guard !== undefined) def.guard = Math.min(def.maxGuard, def.guard + p.guard);
  if (p.reflect && att && att !== def && att.hp > 1 && Math.abs(att.x - def.x) <= 175) {
    att.hp = Math.max(1, att.hp - p.reflect);
    att.vx = Math.sign(att.x - def.x || -def.face) * 210;
    if (!RESIM) addP({ type: 'text', text: `反震 -${p.reflect}`, x: att.x, y: att.y - 110, life: 0.6, max: 0.6, rgb: '140,212,140' });
  }
  if (!RESIM) ring(def.x, def.y - 60, 90, def.look && def.look.slash ? def.look.slash : '255,200,120', 0.25);
}
