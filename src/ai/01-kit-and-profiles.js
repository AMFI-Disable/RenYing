// ======================= 电脑 AI（人机） =======================
// 这个文件在 game.js 之前加载，只定义数据和函数；用到的游戏变量（clock、projs、SKILLS……）都在调用时才读。
//   1. LEVELS        五个难度的“手速与见识”：反应多快、会不会确反、压起身、骗闪、避战……（数据在 src/data/20-levels.js）
//   2. AI_KIT        每个角色的技能该怎么用（什么时候放、打中后接什么）
//   3. 打法基因      每个角色可以训练的打法参数。天道与绝顶用 tools/ai/ai-train.mjs 自我对弈进化出来的基因
//   4. 打击数据      tools/ai/ai-framedata.mjs 实测的每招距离、出手时间、收招时间，存在 src/models/ai-brain.json
//   5. FoeModel      对局中记下对手的习惯：被连几下会闪、起身爱做什么、爱不爱挡
//   6. AIBrain       每帧决策：本能（受身、破连、格挡、精准招架、躲暗器）→ 战术（连招、确反、压起身、骗闪、立回、避战）
// 找 bug 提示：电脑某个动作不对，把那名电脑的 ctrl.brain.debug 设成 []，之后每一项是 [时间, 按键, 原因]（ai-lingque-test 就这样数），
//   按原因去下面对应的那一段找；改完跑 node tools/tests/test-ai.mjs。

// ---------- 1. 难度 ----------
// 每档难度的参数（反应、格挡、连段、骗闪……）在 src/data/20-levels.js 的 DIFFICULTIES 里，src/game/01-engine/01-core.js 拆成 LEVELS 和 AI_LEVEL_KEYS。
// 这个文件比数据表先加载，所以只在函数里用 LEVELS，不在加载时读。
// 个性化“宿敌”难度：在劲敌和绝顶之间按 k（0.55~1.45）插值
function aiBlendLevel(k) {
  const [lo, hi] = (DIFFICULTIES.find(d => d.id === 'adaptive') || {}).blend || ['hard', 'impossible'];
  const a = LEVELS[lo], b = LEVELS[hi], t = Math.max(0, Math.min(1, (k - 0.55) / 0.9)), out = {};
  for (const key in a) {
    const x = a[key], y = b[key];
    out[key] = Array.isArray(x) ? [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t] : typeof x === 'number' ? x + (y - x) * t : t > 0.5 ? y : x;
  }
  return out;
}

// ---------- 2. 角色技能用法 ----------
// role：rush 冲过去打、proj 飞行道具、counter 架招、trap 陷阱、zone 范围、self 自身增益
// combo：打中后能否接在普攻连段后面取消出来   air：空中能用   anti：能打空中的人   follow：放完立刻接的动作
// use(me, foe, d, B)：额外的使用条件（B 是大脑，可读 B.frame 等）
// 对手对「我」还剩多少秒无敌：多人对局里别人打出的挑飞保护不挡我，倒地的人也能补刀（见 10-hits-01-collision.js）
const aiInv = (foe, me) => typeof invulLeft === 'function' ? invulLeft(foe, me) : (foe.invul || 0);
const AI_KIT = {
  gale: { role: 'rush', combo: true, follow: 'swordqi' },
  swordqi: { role: 'proj', combo: true, anti: true },
  blink: { role: 'rush', combo: false, buff: true, use: (m, o, d) => d > 160 && o.state !== 'skill' },
  kunai: { role: 'proj', combo: true, air: true },
  quake: { role: 'zone', combo: true, groundOnly: true, use: (m, o) => o.onGround() },
  ironwall: { role: 'rush', combo: true, anti: true },
  backthrust: { role: 'rush', combo: true },
  spin: { role: 'zone', combo: true, reflect: true },
  windblade: { role: 'proj', combo: true, air: true },
  windstep: { role: 'rush', combo: false, air: true },
  thunderfist: { role: 'rush', combo: true },
  stomp: { role: 'counter', combo: false, reflect: true },
  inktrap: { role: 'trap', combo: false, use: (m) => !projs.some(p => p.kind === 'trap' && p.owner === m.idx) },
  inksplash: { role: 'self', combo: false, use: (m, o, d) => d > 300 && (m.fu || 0) < FU_MAX && (m.ink || 0) >= INK_COST * (FU_INK + 1) },
  mirror: { role: 'counter', combo: false },
  moonring: { role: 'proj', combo: true },
  dive: { role: 'rush', combo: true, air: true, anti: true },
  darts: { role: 'proj', combo: true, air: true },
  soundwave: { role: 'proj', combo: true, air: true, use: (m, o, d) => (m.notes || 0) >= 2 || d > 260 },
  echowall: { role: 'counter', combo: false, reflect: true },
  // 亭子落地前走开或腾空闪都能躲：等对手在收招/挨打/挡着（走不快）而且闪用掉了再放
  pavilion: { role: 'trap', combo: true, jail: true, use: (m, o, d, B) => ['attack', 'skill', 'charge', 'block', 'blockstun', 'hitstun', 'getup', 'special'].includes(o.state) && (o.breakCD > 0.45 || B.L.read < 0.6) },
  feast: { role: 'self', combo: false, use: (m, o, d) => (m.drunk || 0) >= 50 && d > 160 && m.hp < m.maxHp * 0.72 && o.hp > m.hp * 0.7 },
  hook: { role: 'proj', combo: true, pull: true },
  whirl: { role: 'zone', combo: true, reflect: true },
  // 凌雀：飞梭打中挂【雀芒】，带印记时换影穿刺会引爆并清零冷却；换影一路追踪，只有腾空闪躲得开
  spindle: { role: 'proj', combo: true },
  shadowdash: { role: 'rush', combo: true, invul: true, air: true, use: (m, o, d, B) => !(B && B.lqHold > clock) && ((o.needleMark || 0) > 0.3 || o.breakCD > 0.5 || AI_HURT.includes(o.state) || (B && B.L.read >= 0.3 && m.skillCD > 1.5)) },   // 劲敌以上：飞梭一时挂不上印记也照放（新换影一路追到中为止，被挡也定身）
  // 离影：留影（在脚下留雾身、顺手斩一刀）当成准备动作；渡影不走通用打法，由 liyingRoute 决定什么时候、去哪个雾身
  mistmark: { role: 'self', combo: false, use: (m, o, d) => m.onGround() && (m.clones || []).length < 4 && d > 140 && d < 480 && !['attack', 'skill', 'special'].includes(o.state) },
  mistswap: { role: 'self', combo: false, use: () => false },
  // 磁仙：Q 换极性（不花时间、清零 R）——R 在冷却、身边的人想换种打法时用；R 正极贴身弹开，负极把中距离的人吸过来接负极连段
  polarswap: { role: 'self', combo: true, air: true, use: (m, o, d, B) => !(B && B.L.combo >= 3) && ((m.pol < 0 && (m.mChain || 0) >= MAG.chainCap) || (m.skill2CD > 1.2 && (m.pol > 0 ? d > 220 && d < MAG.rMinusRange - 60 : d < 150))) },   // 寻常以上换极性交给 cixianRoute
  magfield: { role: 'zone', combo: true, use: (m, o, d) => aiInv(o, m) <= 0 && (m.pol > 0 ? d < MAG.rPlusR : d > 130 && d < MAG.rMinusRange - 40) },
  // 千机：金丝回环与穿丝急袭
  throwball: { role: 'proj', combo: true, use: (m, o, d) => !projs.some(p => p.kind === 'ironball' && p.owner === m.idx && !p.dead) && d > 120 },
  ballspike: { role: 'rush', combo: true, breakout: true, use: (m, o, d) => {
    const ball = projs.find(p => p.kind === 'ironball' && p.owner === m.idx && !p.dead);
    return ball && Math.sign(o.x - ball.x) === (m.face || 1) && Math.abs(o.y - (ball.y + 58)) < 110 && Math.abs(o.x - ball.x) < 560;
  } },
  // 赤霄：焰戟突进挂灼烧、烈环近身挑飞续灼烧
  flamehalberd: { role: 'rush', combo: true, use: (m, o, d) => d > 80 && d < 390 },
  blazering: { role: 'zone', combo: true, anti: true, use: (m, o, d) => d < 160 && Math.abs(o.y - m.y) < 130 },
  // 玄机：星枢自导飞行道具、星漩中近距离引力牵引
  starorb: { role: 'proj', combo: true, air: true, anti: true },
  gravwell: { role: 'zone', combo: true, pull: true, use: (m, o, d) => d > 60 && d < 250 && Math.abs(o.y - m.y) < 135 },
  // 青鸾：翠风减速风筝、鸾羽治愈自身与280px内队友
  jadebreeze: { role: 'proj', combo: true, air: true },
  luanheal: { role: 'self', combo: false, use: (m, o, d) => {
    const lowSelf = m.hp < m.maxHp * 0.72;
    const allyLow = typeof sideFighters === 'function' && typeof fighterTeam === 'function' && sideFighters(fighterTeam(m)).some(a => a !== m && !a.hidden && a.hp > 0 && a.hp < a.maxHp * 0.65 && Math.abs(a.x - m.x) < 280);
    return lowSelf || allyLow || (d < 115 && m.hp < m.maxHp * 0.88);
  } },
  // 玄武：龟甲霸体冲撞破防、玄壁霸体回架势震地
  shellbash: { role: 'rush', combo: true, use: (m, o, d) => d > 70 && d < 360 },
  earthfort: { role: 'zone', combo: true, groundOnly: true, use: (m, o, d) => d < 260 && (o.onGround() || (m.guard || 0) < (m.maxGuard || 100) * 0.55) },
};
// 离影：用「不按方向 / 按那一边」能不能正好选到雾身 c（和游戏里 pickClone 的规则一样）
function pickCloneDir(me, foe, c) {
  if (c === cloneMark(me, foe)) return true;
  const dir = Math.sign(c.x - me.x); if (!dir) return false;
  let best = null;
  for (const k of me.clones || []) { const dd = (k.x - me.x) * dir; if (dd > 1 && (!best || dd < (best.x - me.x) * dir)) best = k; }
  return best === c;
}
// 大招：hit 按打击数据判断打不打得到；sure(me, foe, d) 额外条件
const AI_ULT = {
  crescent: { contact: true }, shadows: { contact: true }, eightimm: { contact: true },
  avalanche: { steer: true, sure: (m, o) => o.onGround() || o.y > -80 },
  phoenix: { contact: true },
  timestop: { line: true },
  tornado: { far: true },
  thunder: { far: true },
  inkdragon: { far: true, sure: (m, o) => (m.fu || 0) >= 3 || o.hp < Math.max(FU_BASE + FU_PER * (m.fu || 0), o.maxHp * 0.25) || m.hp < m.maxHp * 0.35 },
  featherstorm: { far: true },
  guangling: { far: true },
  shanshui: { far: true },
  skynet: { far: true },
  // 万线归宗全场必中、挂印记、清零换影：留着续连段用（换影在冷却、对手身上没印记时放最值），对手残血就直接放
  needlestorm: { far: true, sure: (m, o) => o.hp / Math.max(1, o.maxHp) < 0.18 || ((o.needleMark || 0) <= 0 && m.skill2CD > 0.5) },
  // 天地磁合全场都夹得到，只怕对手正在无敌里：等对手的腾空闪用掉、或者正在挨打 / 收招时放
  sandwich: { far: true, sure: (m, o) => aiInv(o, m) <= 0 && (o.breakCD > 0.6 || AI_HURT.includes(o.state) || o.hp / Math.max(1, o.maxHp) < 0.15) },
  moonflow: { contact: true, heal: true, sure: (m, o, d) => d < 240 || m.hp < m.maxHp * 0.5 },
  // 万影归一：雾身越多刀越多，至少攒一个雾身再放（对手残血就直接放）
  mistarray: { far: true, sure: (m, o) => (m.clones || []).length >= 1 || o.hp / Math.max(1, o.maxHp) < 0.12 },
  // 机轮三穿：用三次全场穿击逼迫对手交闪避
  recallball: { far: true, sure: (m, o) => aiInv(o, m) <= 0 && (AI_HURT.includes(o.state) || o.breakCD > 0.8 || o.hp / Math.max(1, o.maxHp) < 0.35) },
  // 赤霄·天火坠：灼烧加成或中距离压制收割
  skyfall: { far: true, sure: (m, o, d) => aiInv(o, m) <= 0 && (d < 460 || (o.burnT || 0) > 0 || AI_HURT.includes(o.state)) },
  // 玄机·周天星阵：对手交闪或硬直时释放
  celestial: { far: true, sure: (m, o) => aiInv(o, m) <= 0 && (o.breakCD > 0.5 || AI_HURT.includes(o.state) || o.hp / Math.max(1, o.maxHp) < 0.3) },
  // 青鸾·百鸟朝凤：团队残血或自身血线吃紧时释放回复并反打
  phoenixchorus: { far: true, heal: true, sure: (m, o, d) => m.hp < m.maxHp * 0.68 || (typeof sideFighters === 'function' && typeof fighterTeam === 'function' && sideFighters(fighterTeam(m)).some(a => a !== m && !a.hidden && a.hp > 0 && a.hp < a.maxHp * 0.6)) || d < 380 },
  // 玄武·玄龟镇岳：近身地面重压
  tortoiseslam: { contact: true, sure: (m, o, d) => d < 280 && (o.onGround() || o.y > -90) },
};

// ---------- 6. 大脑 ----------
const AI_FREE = ['idle', 'walk', 'block'];
const AI_ACT_KEYS = ['l1', 'dl', 'cs1', 'cs2', 'air', 'skill', 'skill2', 'special'];
const AI_ACT_REL = { l1: 1, dl: 0.75, cs1: 0.5, cs2: 0.4, air: 0.5 };   // 可靠程度：蓄力和跳入太好躲

// Lightweight strategic identities shared by every difficulty. The frame model
// still decides whether an action can connect; these profiles only break ties.
const AI_HERO_TACTICS = {
  qingfeng: { style: 'balanced', teamRole: 'skirmisher', range: 0.96, schools: ['feng', 'qi'] },
  feiying: { style: 'assassin', teamRole: 'assassin', range: 0.88, schools: ['ying', 'feng'] },
  tieshan: { style: 'bulwark', teamRole: 'vanguard', range: 0.82, schools: ['jin', 'mo'] },
  lingshuang: { style: 'footsies', teamRole: 'skirmisher', range: 1.12, schools: ['feng', 'jin'] },
  liuyun: { style: 'air', teamRole: 'zoner', range: 1.12, schools: ['feng', 'qi'] },
  leiming: { style: 'counter', teamRole: 'skirmisher', range: 0.9, schools: ['lei', 'jin'] },
  moyu: { style: 'zoner', teamRole: 'zoner', range: 1.2, schools: ['mo', 'qi'] },
  yuehua: { style: 'sustain', teamRole: 'support', range: 1.08, schools: ['ying', 'xue'] },
  yanling: { style: 'air', teamRole: 'assassin', range: 1.08, schools: ['feng', 'ying'] },
  yuxiao: { style: 'zoner', teamRole: 'zoner', range: 1.15, schools: ['qi', 'feng'] },
  zuixian: { style: 'brawler', teamRole: 'vanguard', range: 0.9, schools: ['xue', 'jin'] },
  gouchen: { style: 'grappler', teamRole: 'vanguard', range: 0.94, schools: ['mo', 'jin'] },
  lingque: { style: 'assassin', teamRole: 'assassin', range: 1.02, schools: ['ying', 'feng'] },
  liying: { style: 'trickster', teamRole: 'assassin', range: 1.02, schools: ['ying', 'mo'] },
  cixian: { style: 'control', teamRole: 'controller', range: 1.08, schools: ['qi', 'jin'] },
  qianji: { style: 'setplay', teamRole: 'controller', range: 1.14, schools: ['feng', 'qi'] },
  chixiao: { style: 'brawler', teamRole: 'skirmisher', range: 1.04, schools: ['jin', 'xue'] },
  xuanji: { style: 'zoner', teamRole: 'zoner', range: 1.18, schools: ['qi', 'mo'] },
  qingluan: { style: 'zoner', teamRole: 'support', range: 1.12, schools: ['feng', 'qi'] },
  xuanwu: { style: 'bulwark', teamRole: 'vanguard', range: 0.92, schools: ['jin', 'mo'] },
};

function aiHeroTactic(id) { return AI_HERO_TACTICS[id] || { style: 'balanced', range: 1, schools: [] }; }
function aiScrollIds(f) {
  if (typeof scIds !== 'function' || typeof scOn !== 'function' || !scOn()) return [];
  return scIds(f).filter(id => typeof SC_BY !== 'undefined' && !!SC_BY[id]);
}
function aiScrollActionWeight(f, key) {
  const ids = aiScrollIds(f), schools = new Set(aiHeroTactic(f.ch.id).schools);
  if (!ids.length) return 1;
  let weight = 1;
  const has = id => ids.includes(id);
  if ((key === 'l1' || key === 'dl') && (has('ink_blade') || has('needle_rain'))) weight *= 1.18;
  if ((key === 'cs1' || key === 'cs2') && (has('heavy_hand') || has('shockwave'))) weight *= 1.16;
  if ((key === 'skill' || key === 'skill2') && (has('double_strike') || has('skill_echo') || has('haste'))) weight *= 1.12;
  if (key === 'special' && has('ult_amp')) weight *= 1.22;
  const scrolls = typeof SC_BY !== 'undefined' ? ids.map(id => SC_BY[id]).filter(Boolean) : [];
  if (scrolls.some(s => s.h === f.ch.id)) weight *= 1.1;
  if (scrolls.some(s => s.s && schools.has(s.s))) weight *= 1.04;
  return weight;
}

// AI-controlled tower runs build around both the hero's signature and the
// effects already collected. Stable scoring keeps same-seed replays consistent.
function aiChooseScroll(heroId, choices, owned = []) {
  if (!Array.isArray(choices) || !choices.length) return null;
  const profile = aiHeroTactic(heroId), ownedSet = new Set(owned), counts = {};
  for (const id of ownedSet) { const s = typeof SC_BY !== 'undefined' && SC_BY[id]; if (s && s.s) counts[s.s] = (counts[s.s] || 0) + 1; }
  const ranked = choices.map((choice, index) => {
    const s = typeof choice === 'string' ? (typeof SC_BY !== 'undefined' && SC_BY[choice]) : choice;
    if (!s || ownedSet.has(s.id)) return { choice, score: -Infinity, index };
    let score = s.h === heroId ? 8 : 0;
    if (s.s && profile.schools.includes(s.s)) score += 3;
    if (s.s && counts[s.s]) score += Math.min(3, counts[s.s]) * 1.5;
    // Favor sustain when pressured and reliable finishers when the opponent is low.
    const hp = (typeof A !== 'undefined' && A && A.ch && A.ch.id === heroId) ? A.hp / Math.max(1, A.maxHp) : 1;
    if (hp < 0.4 && ['second_wind', 'meditation', 'golden_bell', 'last_stand'].includes(s.id)) score += 4;
    if (s.id === 'executioner' || s.id === 'first_blood' || s.id === 'crescendo') score += 1;
    return { choice, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0].choice;
}

function aiModeActionWeight(f, opp, key, d) {
  const profile = aiHeroTactic(f.ch.id), ownHp = f.hp / Math.max(1, f.maxHp);
  const foeHp = opp.hp / Math.max(1, opp.maxHp), mu = typeof chaosNow === 'function' ? chaosNow() : null;
  let weight = 1;
  if (profile.style === 'air' && key === 'air') weight *= 1.12;
  if (profile.style === 'zoner' && (key === 'skill' || key === 'skill2') && [f.ch.skill, f.ch.skill2].some(id => AI_KIT[id] && AI_KIT[id].role === 'proj')) weight *= 1.12;
  if (profile.style === 'bulwark' && (key === 'cs2' || key === 'skill' || key === 'skill2')) weight *= 1.06;
  if (profile.style === 'assassin' && AI_HURT.includes(opp.state)) weight *= 1.12;
  if (profile.style === 'counter' && (opp.state === 'attack' || opp.state === 'skill')) weight *= 1.1;
  if (profile.style === 'setplay' && (key === 'skill' || key === 'skill2')) weight *= 1.08;
  if (ownHp < 0.3) {
    if (key === 'cs2' || key === 'air') weight *= 0.78;
    if ((key === 'skill' || key === 'skill2') && ['rush', 'counter', 'self'].includes((AI_KIT[f.ch[key === 'skill' ? 'skill' : 'skill2']] || {}).role)) weight *= 1.08;
  } else if (ownHp - foeHp > 0.25 && (key === 'cs2' || key === 'air')) weight *= 0.9;
  if (foeHp < 0.22 && (key === 'special' || key === 'skill' || key === 'skill2')) weight *= 1.12;
  if (mu) {
    if (mu.type === 'spd' || mu.type === 'dash_cd') {
      if (key === 'air') weight *= 0.9;
      if ((key === 'skill' || key === 'skill2') && ['rush', 'proj'].includes((AI_KIT[f.ch[key === 'skill' ? 'skill' : 'skill2']] || {}).role)) weight *= 1.08;
    } else if (mu.type === 'dmg' || mu.type === 'crit' || mu.type === 'vamp' || mu.type === 'armor') {
      if (key === 'l1' || key === 'skill' || key === 'skill2') weight *= 1.06;
    } else if (mu.type === 'kb') {
      if (key === 'l1' || key === 'skill' || key === 'skill2') weight *= 1.04;
      if (key === 'cs2') weight *= 0.9;
    } else if (mu.type === 'grav' || mu.type === 'jump') {
      if (key === 'air' || key === 'antiAir') weight *= 1.12;
    } else if (mu.type === 'meter_gain') {
      if (key === 'special' && f.meter >= 100) weight *= 1.12;
    } else if (mu.type === 'cd') {
      if (key === 'skill' || key === 'skill2') weight *= 1.12;
    } else if (mu.type === 'guard_stab' && (key === 'cs2' || key === 'dl')) weight *= 1.08;
  }
  return weight * aiScrollActionWeight(f, key);
}
