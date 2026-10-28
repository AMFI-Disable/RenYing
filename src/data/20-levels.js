// ======================= 电脑难度表 =======================
// 每档电脑难度一项，按从易到难排。改某一档有多强、叫什么、怎么介绍，只改这里。
// 游戏里的 LEVELS（AI 参数）、AI_LEVEL_KEYS、LV_NAME、AI_PROFILES 都是在 src/game/01-core.js 从这张表拆出来的。
//
// { id, name, ai | blend, badge, badgeCol, desc, traits, foeHp, reward }
//   id        英文编号，存档、回放、关卡、天梯都用它，定了就别改                                              （必填）
//   name      中文名（关卡、回放列表、对局信息都显示这个）                                                    （必填）
//   ai        这一档电脑的“手速与见识”（src/ai.js 的 AIBrain 读，写在 this.L 里）                     （ai 和 blend 二选一）
//             react [最快, 最慢] 看到对手出招到能反应的秒数    think [最快, 最慢] 立回时多久想一次
//             block 看到来招时防住的几率    jg 精准招架几率    punish 抓破绽几率    combo 一套最多打几下
//             cancel 连招取消接技能几率    tech 落地受身几率    breaker 腾空闪用得多好    oki 压起身几率
//             bait 骗闪几率    read 记对手习惯的本事    lead 领先后避战    error 失误几率    skill 技能用得准不准
//             ult 大招用得准不准    aggr 主动程度    genes 是否用训练出来的角色打法    matchup 是否按双方角色针对
//   blend     不单独写参数，对局时按玩家水平在两档之间插值：[较弱的一档, 较强的一档]（宿敌用，见 src/ai.js 的 aiBlendLevel）
//   badge     选难度时显示的小标签          badgeCol 小标签的颜色
//   desc      选难度时的介绍（写清楚这一档会什么、不会什么）    traits 介绍下面的几个关键词
//             （badge / badgeCol / desc / traits 只有能在选难度界面直接选的档要写）
//   foeHp     人机对战里电脑的气血倍数（不写就是 1）
//   reward    人机对战打赢给的墨锭（不写就是 20）
const DIFFICULTIES = [
  {
    id: 'easy', name: '入门',
    ai: { react: [0.42, 0.7], think: [0.34, 0.62], block: 0.15, jg: 0, punish: 0.08, combo: 2, cancel: 0, tech: 0.1, breaker: 0.05, oki: 0, bait: 0, read: 0, lead: 0, error: 0.3, skill: 0.3, ult: 0.25, aggr: 0.42, genes: false, matchup: false },
    badge: '初学练手', badgeCol: '#46d3ea',
    desc: '反应很慢（0.42~0.7 秒），很少格挡（15%），一套最多打 2 下，技能常常乱放，三成动作会失误。适合熟悉移动、按键手感和技能命中。',
    traits: ['反应 0.4 秒以上', '很少格挡 (15%)', '2 连段'],
    reward: 10,
  },
  {
    id: 'normal', name: '寻常',
    ai: { react: [0.26, 0.42], think: [0.2, 0.42], block: 0.4, jg: 0, punish: 0.3, combo: 3, cancel: 0.2, tech: 0.35, breaker: 0.3, oki: 0.15, bait: 0, read: 0, lead: 0, error: 0.15, skill: 0.55, ult: 0.5, aggr: 0.55, genes: false, matchup: false },
    badge: '标准对练', badgeCol: '#2bd49a',
    desc: '反应 0.26~0.42 秒，会格挡（40%）、偶尔确反，能打 3 连段、偶尔取消接技能，被连多了会腾空闪。适合练常规走位和破招时机。',
    traits: ['反应约 0.3 秒', '格挡 40%', '3 连段'],
    reward: 20,
  },
  {
    id: 'hard', name: '劲敌',
    ai: { react: [0.15, 0.25], think: [0.1, 0.24], block: 0.68, jg: 0.1, punish: 0.62, combo: 5, cancel: 0.55, tech: 0.7, breaker: 0.6, oki: 0.45, bait: 0.2, read: 0.3, lead: 0.4, error: 0.06, skill: 0.8, ult: 0.75, aggr: 0.68, genes: false, matchup: true },
    badge: '凌厉反击', badgeCol: '#e9c46a',
    desc: '反应 0.15~0.25 秒，格挡 68% 并偶尔精准招架，挡住就确反，5 连段接技能，会压起身、偶尔骗闪，血量领先会拉开距离，并按双方角色调整站位。',
    traits: ['挡后确反', '压起身', '按角色针对'],
    reward: 40,
  },
  {
    id: 'adaptive', name: '宿敌',
    blend: ['hard', 'impossible'],
    reward: 40,
  },
  {
    id: 'impossible', name: '绝顶',
    ai: { react: [0.075, 0.13], think: [0.04, 0.1], block: 0.88, jg: 0.4, punish: 0.88, combo: 6, cancel: 0.85, tech: 0.92, breaker: 0.85, oki: 0.8, bait: 0.6, read: 0.7, lead: 0.8, error: 0.02, skill: 0.95, ult: 0.92, aggr: 0.78, genes: true, matchup: true },
    badge: '极境宗师', badgeCol: '#ff6b6b',
    desc: '反应 0.08~0.13 秒，格挡 88%、四成精准招架，记住你被连几下会闪并停手骗闪，算好起身时机压起身，用自我对弈训练出的角色打法。本难度电脑多 35% 血。',
    traits: ['骗闪', '读你的起身习惯', '训练出的角色打法'],
    foeHp: 1.35,
    reward: 60,
  },
  {
    id: 'god', name: '天道',
    ai: { react: [0.025, 0.05], think: [0.016, 0.04], block: 0.99, jg: 0.9, punish: 1, combo: 6, cancel: 1, tech: 1, breaker: 1, oki: 1, bait: 1, read: 1, lead: 1, error: 0, skill: 1, ult: 1, aggr: 0.85, genes: true, matchup: true },
    badge: '天道神境 · 自我对弈', badgeCol: '#d946ef',
    desc: '反应只有 0.025~0.05 秒，几乎每招都防、九成精准招架，蓄力斩没蓄满就打断，躲大招、骗闪、压起身、针对角色特性全开；每个角色的打法都是 AI 和 AI 自我对弈进化出来的。',
    traits: ['自我对弈训练', '九成精准招架', '骗闪与压起身'],
  },
];
