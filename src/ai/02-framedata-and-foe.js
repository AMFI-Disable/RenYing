// ---------- 3. 打法基因 ----------
// 每个角色一组，取值范围 [最小, 最大, 默认]。训练时在范围里变异，挑胜率最高的留下。
const AI_GENE_DEF = {
  range: [0.7, 1.35, 1],      // 立回站位：相对“我够得着、对手够不着”的理想距离的倍率
  aggr: [0.15, 1, 0.6],       // 立回时主动出手的倾向
  poke: [0, 1, 0.5],          // 用轻击点人的比例（其余用蓄力、技能、跳入）
  charge: [0, 1, 0.3],        // 蓄力斩（破防、不可挡）的使用
  qn: [0, 1, 0.5],            // 立回时放 Q 的倾向
  rn: [0, 1, 0.5],            // 立回时放 R 的倾向
  cancel: [0, 1, 0.8],        // 连招中取消接技能的倾向
  cancelAt: [1, 4.99, 2],     // 连段第几下开始取消接技能
  jumpIn: [0, 0.6, 0.15],     // 跳入进攻
  antiAir: [0, 1, 0.6],       // 对空
  zone: [0, 1, 0.5],          // 拉开距离用远程压制（有远程技能的角色）
  breakAt: [1, 5.99, 3],      // 被连到第几下用腾空闪
  okiCharge: [0, 1, 0.35],    // 压起身时用蓄力（不可挡）的比例
  bait: [0, 1, 0.5],          // 骗闪倾向
  lead: [0.05, 0.6, 0.25],    // 血量领先多少开始避战
  ultSave: [0, 1, 0.3],       // 留着大招当无敌反打的倾向
  jg: [0, 1, 0.8],            // 用精准招架代替普通格挡的倾向
  back: [0, 1, 0.3],          // 立回中后撤诱招
  adapt: [0, 1.5, 1],         // 针对打法的力度（按双方角色特性调整，0 = 不针对）
};
const AI_GENE_KEYS = Object.keys(AI_GENE_DEF);
function aiDefaultGenes() { const g = {}; for (const k of AI_GENE_KEYS) g[k] = AI_GENE_DEF[k][2]; return g; }
// 训练好的数据：打包时写进 window.RENYING_AI_BRAIN；训练工具运行时会用 aiTuneReload 换一套
let AI_BRAIN = null;
function aiTuneReload() { AI_BRAIN = (typeof window !== 'undefined' && (window.RENYING_AI_TUNE || window.RENYING_AI_BRAIN)) || {}; }
function aiBrainData() { if (!AI_BRAIN) aiTuneReload(); return AI_BRAIN; }
// lvGenes：某个难度单独训练过的角色（比如天道的铁山）在共用基因上再改几项
function aiGenes(heroId, lv) {
  const B = aiBrainData(), g = B.genes && B.genes[heroId], o = lv && B.lvGenes && B.lvGenes[lv] && B.lvGenes[lv][heroId];
  return Object.assign(aiDefaultGenes(), g || {}, o || {});
}

// ---------- 4. 打击数据 ----------
// 每招：min/max 打得到的距离（对手身宽为 1 时），hit 按键到打中的秒数，dur 打空后多久能再动，blockable 能否格挡，adv 被挡后自己比对手早动多少秒
const AI_FRAME_DEFAULT = { min: 0, max: 0, hit: 0.3, dmg: 0, dur: 0.6, move: 0, blockable: true, adv: -0.2 };
function aiFrame(f, key) {
  const t = aiBrainData().frames;
  if ((key === 'skill' || key === 'skill2') && f && f.bossSkills && f.ch) {
    const skId = f.ch[key];
    const owner = CHARS.find(c => c.skill === skId || c.skill2 === skId);
    if (owner && t && t[owner.id]) {
      const oKey = owner.skill2 === skId ? 'skill2' : 'skill';
      if (t[owner.id][oKey]) return t[owner.id][oKey];
    }
  }
  const F = t && t[f.ch.id];
  if (F && F[key]) return F[key];
  // 没测过（比如直接打开 src）：普攻按招式表估算，技能当作打不到
  if (key === 'l1' || key === 'dl') { const m = f.moves[key]; return { min: 0, max: m.box[2] + 18, hit: m.su, dmg: m.dmg, dur: m.su + m.ac + m.rc, blockable: true, adv: -0.13 }; }
  return AI_FRAME_DEFAULT;
}
// 在距离 d 上按下这一招，几秒后打中（按实测表插值；没有表就用中位数）
function aiHitTime(F, d) {
  const h = F && F.ht;
  if (!h) return F ? F.hit : 0.3;
  const i = Math.max(0, Math.min(h.length - 1, Math.round((d - 20) / 20)));
  if (h[i]) return h[i];
  for (let k = 1; k < 6; k++) { if (h[i - k]) return h[i - k]; if (h[i + k]) return h[i + k]; }
  return F.hit;
}
// 这一招打在对手的架势上会削掉多少（和 applyHit 的算法一致）
function aiGuardLoss(att, def, dmg, gbMul) {
  const mr = Math.max(0.45, Math.min(2.5, ((att.ch.stat && att.ch.stat.weight) || 1) / ((def.ch.stat && def.ch.stat.weight) || 1)));
  return dmg * 1.5 * Math.sqrt(mr) * (gbMul || 1) / ((def.ch.stat && def.ch.stat.guardStab) || 1);
}
// 这一招在当前距离上打不打得到（按对手体型修正身宽）
function aiInRange(F, d, foe, slack = 0) {
  if (!F || F.max <= 0) return false;
  const w = 18 * ((foe && foe.size) || 1) - 18;
  return d >= F.min - slack && d <= F.max + w + slack;
}
// 预测 t 秒后这个人在哪：地面挨打 / 被挡时按摩擦减速滑行，空中按抛物线（被挑飞时重力小，和 09-actions.js 的算法一致）
function aiPredict(f, t) {
  if (f.onGround()) {
    const sliding = !['walk', 'idle', 'dash', 'attack', 'charge'].includes(f.state);
    return { x: clamp(f.x + (sliding ? f.vx * (1 - Math.exp(-8.5 * t)) / 8.5 : f.vx * t), WALL, STAGE_W - WALL), y: f.y };
  }
  let g = GRAV;
  if (f.state === 'launched') g *= LAUNCH_GRAV * (1 + (f.juggle || 0) * 0.12) * Math.min(1.25, Math.max(0.85, Math.pow((f.ch.stat && f.ch.stat.weight) || 1, 0.35)));
  else if (f.state === 'attack' && f.move && f.move.air) g *= 0.45;
  else if (f.flying || f.airHover > 0) g = 0;
  return { x: clamp(f.x + f.vx * t, WALL, STAGE_W - WALL), y: Math.min(0, f.y + f.vy * t + 0.5 * g * t * t) };
}
// 空中的人还要多久落地
function aiLandTime(f) {
  if (f.onGround()) return 0;
  for (let t = 0.05; t < 2; t += 0.05) if (aiPredict(f, t).y >= 0) return t;
  return 2;
}

// ---------- 5. 对手习惯 ----------
class FoeModel {
  constructor() {
    this.escHits = 3; this.escN = 0;        // 对手平均被连到第几下用腾空闪
    this.escRate = 0.5;                       // 被连时腾空闪的几率
    this.wake = { block: 1, attack: 1, escape: 1, skill: 1 };   // 起身选择次数
    this.blockRate = 0.5;                     // 我出手时对手挡住的比例
    this.jumpRate = 0.2;                      // 立回时对手跳的频率
    this.aggr = 0.5;                          // 对手主动出手的频率
    this.projRate = 0.3;
  }
  ema(k, v, a = 0.15) { this[k] += (v - this[k]) * a; }
  wakeTop() { let best = 'block', n = -1; for (const k in this.wake) if (this.wake[k] > n) { n = this.wake[k]; best = k; } return best; }
}

