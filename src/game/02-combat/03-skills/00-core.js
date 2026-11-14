// ======================= 技能（Q） =======================
// 本文件：每位侠客的 Q 技能和 R 招式（SKILLS 表，一招一项，每项前面标了是谁的哪个键），以及几个技能共用的机制：
//   凌雀的换影瞄准（sd*）、印记（addNeedleMark）、磁仙的磁极（MAG / mag*）、千机的傀丸。
// 一招的写法：{ name, cd 冷却秒数, desc 说明, start(f, foe) 起手, update(f, foe) 每帧, pose(f) 姿势, … }
//   pass 可穿过对手、nofric 不受地面摩擦、air 空中可放、breakout 受击硬直中可放。
// 找 bug 提示：搜「---- 侠客名」就能跳到他的招式；技能状态在 f.skPh（阶段）和 f.t（这一招放了多久）。
// 每个技能：cd 冷却，start 开始时，update 每一帧，pose 用哪个姿势，ai 电脑什么时候用
// 凌雀「移形换影」的追踪：大幅提升飞行速度、漂移回拉最大距离与转向灵敏度
const SD_SPD = 3525, SD_TURN = 20, SD_DRIFT_MAX = 360, SD_DRIFT_SPD = 1900;
// 迂回：第一次近身从对手头顶翻过去（横向速度、起跳速度、下落加速度），对手身后至少要留这么多地方
const SD_OVER_VX = 1450, SD_OVER_VY = -950, SD_OVER_G = 3800, SD_OVER_ROOM = 170;
function sdTarget(f, foe) {   // 2v2 追最近的那个还站着的对手
  if (typeof is2v2 === 'function' && is2v2()) {
    let best = null, bd = Infinity;
    for (const o of foesOf(f)) { if (o.hp <= 0) continue; const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; best = o; } }
    if (best) return best;
  }
  return foe || (typeof foeOf === 'function' ? foeOf(f) : null);
}
const sdAim = (f, t) => Math.atan2(t.y - f.y, t.x - f.x);   // 两人都按身体中间（脚下往上 50）算，高度差就是 y 差
// 凌雀雀芒印记：上限 5 层，每次施加刷新 5 秒持续时间
function addNeedleMark(target, count = 1) {
  if (!target || target.hp <= 0) return;
  target.needleMark = Math.min(5, (target.needleMark || 0) + count);
  target.needleMarkT = 5.0;
  if (!RESIM) {
    ring(target.x, target.y - 50, 60, '235,110,210', 0.25);
    addP({ type: 'text', text: `✦ 雀芒印记 (${Math.round(target.needleMark)}/5)`, x: target.x, y: target.y - 100, life: 0.8, max: 0.8, rgb: '235,110,210' });
  }
}
// 磁仙的磁极（极性 f.pol：1 正极 ⊕，-1 负极 ⊖；每回合开局由 magRoll 用对局随机数抽）
// 吸和弹都按真磁铁来：离得越近力越大（力 ∝ 1 / 距离²，再夹在上下限之间）。
//   普攻   正极：伤害 ×plusDmg，地上轻攻击每下都击飞；负极：伤害 ×minusDmg，每下把对手往身边吸一下
//          负极四段循环能一直连，但负极普攻连中 chainCap 下就「消磁」：之后的负极普攻不再吸、硬直只剩 capStun 倍，还把人推开，连段就断了。
//          消磁只管负极普攻（不是角色状态，Q、R、大招不受影响）；停手 demagRest 秒没再用负极普攻打中人，或者按 Q 换极性，就恢复
//   R      正极：身边一圈磁石炸开，把半径 rPlusR 里的敌人用力弹走，离得越近弹得越远；rPlusDir = 1 弹开、-1 改成吸到身边（只改这一个数）
//          负极：把 rMinusRange 以内的对手吸过来，越近吸得越快，到身前定住 rMinusStun 秒（不倒地）
const MAG = { plusDmg: 1.9, plusKb: [300, -620], minusDmg: 0.62, pullK: 2.6e6, pullMax: 320, chainCap: 15, capStun: 0.3, demagRest: 1.0,
  rPlusDir: 1, rPlusR: 175, rPlusDmg: 80, rPlusKb: [360, 900], rMinusRange: 620, rMinusDmg: 16, rMinusStun: 0.5, rMinusK: 6.4e7, rMinusV: [1100, 2600], rMinusTime: 0.4 };
const magRGB = pol => pol > 0 ? '255,96,84' : '96,156,255';
const magName = pol => pol > 0 ? '⊕ 正极' : '⊖ 负极';
const magForce = (k, d, lo, hi) => clamp(k / Math.max(40, d) ** 2, lo, hi);   // 磁力：离得越近越大
// 普攻打中时按极性改这一下（applyHit 一开头调用；只管普攻，技能、大招、飞行道具不走这里）
function magHit(att, def, m) {
  if (att.pol > 0) {
    const light = /^l\d/.test(m.name || '');
    return light ? { ...m, dmg: m.dmg * MAG.plusDmg, launch: true, kb: MAG.plusKb, big: true } : { ...m, dmg: m.dmg * MAG.plusDmg };
  }
  if (m.launch || m.spike || m.knock) return { ...m, dmg: m.dmg * MAG.minusDmg };
  att.mT = 0;
  if (att.mChain >= MAG.chainCap) return { ...m, dmg: m.dmg * MAG.minusDmg, kb: [220, 0], stun: m.stun * MAG.capStun };   // 消磁了：不吸，推开
  att.mChain = (att.mChain || 0) + 1;
  if (att.mChain === MAG.chainCap) {
    addP({ type: 'text', text: '消磁', x: att.x, y: att.y - 125, life: 0.8, max: 0.8, rgb: '200,210,230' });
    ring(att.x, att.y - 60, 70, '200,210,230', 0.3);
    return { ...m, dmg: m.dmg * MAG.minusDmg, kb: [220, 0], stun: m.stun * MAG.capStun };
  }
  const dist = Math.abs(att.x - def.x);
  for (let k = 0; k < 3; k++) addP({ type: 'spark', x: def.x, y: def.y - 60 + rand(-25, 25), vx: Math.sign(att.x - def.x) * rand(160, 320), vy: rand(-30, 30), rgb: magRGB(-1), life: 0.22, max: 0.22, w: 1.6 });
  return { ...m, dmg: m.dmg * MAG.minusDmg, kb: [dist > 58 ? -magForce(MAG.pullK, dist, 60, MAG.pullMax) : 0, 0] };
}
// 磁力直接把人挪到 x（负极 R、大招）：断崖台上走 mapEdge，吸不穿崖边；别的场地夹在两边墙里。普攻和正极 R 是给速度，物理那边已经按 mapGrip / mapEdge 算
function magMove(tg, x) {
  const cl = (mapNow() || {}).cliff;
  tg.x = x;
  if (cl) mapEdge(tg, cl); else tg.x = clamp(tg.x, WALL, STAGE_W - WALL);
}
// 大招收尾：磁石收掉，还被吸着的人放开
function magRelease(f) {
  const S = f.sw; f.sw = null;
  if (S && S.hit) { const v = fighterByIdx(S.v); if (v.state === 'held') toNeutral(v); }
}
// 每帧：消磁计时、Q 圆圈的计时
function magTick(f) {
  if (f.magTg >= 0 && !(f.state === 'skill' && f.skill === 'magfield')) {   // 吸人吸到一半被打断：把人放开
    const tg = fighterByIdx(f.magTg); f.magTg = -1;
    if (tg.state === 'held') toNeutral(tg);
  }
  if (f.sw && f.state !== 'special') magRelease(f);   // 大招被打断（回合结束之类）：磁石收掉，夹住的人放开
  if (f.polT > 0) f.polT = Math.max(0, f.polT - STEP);
  if (f.mChain > 0) { f.mT = (f.mT || 0) + STEP; if (f.mT >= MAG.demagRest) { f.mChain = 0; f.mT = 0; } }
}
const SKILLS = {};
const COUNTER = { dmg: 95, kb: [440, -820], stun: 1.05, hs: 0.2, launch: true, big: true, unblockable: true, noScale: true };

