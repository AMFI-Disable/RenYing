// ======================= 角色图鉴内容 =======================
// 本文件：角色图鉴的内容（纯数据，几乎没有逻辑）：
//   ICONS / SHORT：图标和短说明；HERO_MOVE_TYPES：每招的类型；HERO_HIT_DETAILS：打击数据；
//   HERO_MOVE_SEQS / HERO_ULT_REPLAYS / HERO_FULL_DEMO：图鉴里演示动画的按键脚本；SKILL_FUN：技能趣谈。
// 找 bug 提示：图鉴里的数字和实际不符时，以游戏里的数据为准（src/data/、02-heroes.js），这里改成一致即可。
const ICONS = {
  passive: '<circle cx="12" cy="12" r="9"/><path d="M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9"/><circle cx="12" cy="7.5" r="1"/><circle cx="12" cy="16.5" r="1"/>',
  light: '<path d="M20 4L7 17l-3 3 1-4L18 3l2 1zM5.5 14.5l4 4M14 6l4 4"/>',
  charge: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/>',
  air: '<path d="M12 20V5M7 10l5-5 5 5M4 17c3-2 13-2 16 0M6 21h12"/>',
  skill: '<path d="M13 2L4 14h7l-1 8 10-12h-7z"/>',
  ranged: '<path d="M3 12h14M13 6l7 6-7 6M7 8l4 4-4 4"/>',
  melee: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M7 4l-4 4"/>',
  shield_bash: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM8 11h8M12 7v8"/>',
  magic_trap: '<polygon points="12 2 19 7 19 17 12 22 5 17 5 7"/><circle cx="12" cy="12" r="4"/><path d="M12 2v6M12 16v6M5 7l5 3M14 14l5 3M19 7l-5 3M10 14l-5 3"/>',
  ult: '<polygon points="12 2 15.2 8.5 22 9.4 17 14.2 18.3 21 12 17.6 5.7 21 7 14.2 2 9.4 8.8 8.5"/><circle cx="12" cy="12" r="2.5"/>',
  esc: '<path d="M12 21V9M7 14l5-5 5 5M6 7l6-4 6 4"/>',
  adv: '<polygon points="12 2 19 9 12 22 5 9"/><path d="M5 9h14M12 2v20"/>',
  vs: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M9.5 17.5L21 6V3h-3L6.5 14.5M13 19l6-6M11 19l-6-6"/>',
  stats: '<path d="M4 20h16M6 20V10h3v10M11 20V4h3v16M16 20v-7h3v7"/>',
  skin: '<path d="M8 3l4 3 4-3 5 4-3 4v10H6V11L3 7l5-4zM12 6v15"/>',
  chronicle: '<path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8M8 11h8M8 15h5"/>',
};
const ic = (k, c) => `<span class="ic" style="color:${c}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.skill}</svg></span>`;
// 图鉴里的简短说明（数值 / 一句话）
const SHORT = {
  疾风斩: ['55', '突进穿身 · 剑气重置'], 影遁: ['45', '瞬移身后 · 下一击 ×1.5'], 震地: ['45+40', '双向地波 · 掀飞'], 回马枪: ['60', '后跃回刺 · 挑飞'],
  风刃: ['28×2', '上下两道风刃 · 几无前摇'], 雷闪: ['40', '穿身雷光 · 麻痹'], 墨阵: ['35', '踩中定身 · 二段引爆'], 月镜: ['95', '格开近战 · 自动反斩'], 俯冲: ['46', '空中俯冲 · 命中刷新'],
  剑气: ['52', '半场弧月剑气 · 挑空'], 飞镖: ['25×4', '四枚散射'], 铁壁冲: ['56', '通天巨浪 · 霸体冲撞'], 枪旋: ['15×7+48', '身前旋转 2 秒'], 开扇: ['8×5', '向前疾冲 · 撒爆米花半秒后炸'],
  金刚雷铠: ['50', '雷铠御守 · 引雷反震'], 画符: ['—', '花 3 格墨 · 符 +1'], 月轮: ['28 / 38', '飞出轻削 · 折返背袭'], 翎羽: ['22×3', '三道翎羽 · 射程无限'],
  残月: ['169', '六连居合 · 终结回气重置'], 千影: ['179', '九影乱斩 · 绝杀分身重置'], 山崩: ['185', '砸地晕眩 · 正中回满气重置'], 刹那: ['140–185', '贯穿减速 · 重置回马枪'], 百鸟朝凤: ['—', '原地八连刺'],
  留影: ['40', '脚下留雾身 · 踏步一刀'], 渡影: ['—', '换到雾身处 · 方向选身'], 万影归一: ['45–113', '雾身齐斩 · 本体补刀'],
  龙卷: ['16×16', '双龙卷浮空 · 刷新跳跃开扇'], 雷霆万钧: ['48×3', '天雷追落 · 气量回涌30%'], 符阵: ['80–280', '宣纸全图 · 按符数爆伤'], 月华如水: ['75 (+100血)', '回血霸体 · 架招重置'], 万羽: ['14×14', '羽刃天降 · 飞行重置'],
  极性反转: ['—', '换正负极 · 清零 R'], 磁极: ['48 / 16', '正极弹开 · 负极吸来定身'], 天地磁合: ['125', '天地两块磁石 · 夹成肉饼'],
  投丸: ['42', '玄铁傀丸 · 弹跳驻场'], 暴雨梨花: ['55', '八方钢针 · 受击可放'], 千丝收网: ['120', '贯穿全场 · 回收重置 Q']
};
const PASSIVE_SHORT = { qingfeng: '攒气快 10% · 攻守均衡(870血)', feiying: '最快移速出手 · 身轻体巧(800血)', tieshan: '重斩蓄力霸体 · 气血冠绝(900血)', lingshuang: '枪尖 ×1.25 · 枪身 ×0.38(815血)',
  liuyun: '三段跳 · 御风轻盈(840血)', leiming: '普攻六连 · 强横体魄(885血)', moyu: '普攻甩墨 · 蓄力远 45% · 墨韵护体(825血)', yuehua: '3 秒未受伤每秒回 14 血(780血)', yanling: '空中按住跳跃飞 1.2 秒(750血)',
  yuxiao: '普攻攒音律，清音随音律变强(775血)', zuixian: '醉意增伤，半醉可闪避近身攻击(885血)', gouchen: '被锤中的人 1.2 秒内受伤 +25%(835血)', lingque: '子母梭挂雀芒，换影穿刺引爆重置(790血)',
  liying: '最多 10 个雾身，内功波削防崩势 · 破影引爆(815血)', cixian: '开局随机正负极，负极普攻最多 15 连(815血)', qianji: '玄铁傀丸击打传动，金丝远程解控护主(830血)' };
const ADV_SHORT = {
  qingfeng: '疾风斩直击穿身，立时重置剑气冷却',
  tieshan: '震地直击得手，回涌 30 架势并减铁壁冲冷却',
  feiying: '1.5 秒内再按 Q 瞬回原位',
  liuyun: '风刃两道 · 开扇撒爆米花',
  leiming: '雷闪冲拳命中，立时重置金刚雷铠冷却',
  lingshuang: '回马枪命中，枪旋冷却减半',
  moyu: '再按 Q 引爆墨阵',
  yuehua: '格反成功，月轮冷却清零',
  yanling: '空中俯冲命中，可再冲一次',
  yuxiao: '回音壁能把暗器弹回去',
  zuixian: '酒过半壶可闪避近战，并可掷坛与民同乐回春',
  gouchen: '飞锤拽到身前，接旋锤',
  cixian: 'Q 换极性立刻清零 R：先弹开，再吸回来',
  lingque: '雀芒印记配合换影穿刺，瞬发引爆清空冷却',
  liying: 'R 加方向选雾身：← → 选那一边，↓ 选最早留下的',
  qianji: '击打傀丸传动加速，受击硬直亦可按 R 爆针护主',
};
// 各角色大招怒气积攒专属特性与通用规则
const HERO_METER_EXPLAIN = {
  qingfeng: '【聚气流转 · 极速充能】天生剑意通明，命中与受击攒气速度常驻 +10%（meterMul 1.10）。绝技「残月」终结斩落额外回涌 20% 气量。',
  feiying: '【高频近身 · 疾速积怒】普攻五段与双刃连削出手极快，高频判定迅速攒气；贴身破防刺杀令怒意飙升。',
  tieshan: '【承伤蓄怒 · 绝境回涌】重甲霸体受击全额聚气（受击攒气效率极高）。奥义「山崩」正中命中更是气量回满，可以立刻再砸一次（砸偏或砸倒地的对手只回一半）！',
  lingshuang: '【枪尖聚焦 · 远距破阵】235px 枪尖极远端命中造成 1.25 倍伤害并按比例高效攒气；长线牵制保持安全聚气。',
  liuyun: '【御风牵制 · 风暴蓄势】远距离双风刃与开扇爆米花安全换血聚气；大招「龙卷」重置全技能与空中跳跃，开辟新一轮节奏。',
  leiming: '【狂雷六连 · 雷帝灌顶】六连重拳记记沉猛令气量暴涨；大招「雷霆万钧」施展即刻触发雷帝灌顶，直接回涌 30% 气量！',
  moyu: '【墨符蓄势 · 一纸封喉】普攻甩墨攒气，R 花墨画符攒符；大招「符阵」把符全部烧掉，全图宣纸，符越多伤害越高。',
  yuehua: '【以静制动 · 月镜返照】月镜精准架招反斩直接获取高额怒气；近战格挡换血配合脱战自愈，稳步积累大招。',
  yanling: '【制空掠阵 · 翎羽贯穿】空中滞空翎羽全屏三连穿透安全攒气；俯冲空中刷新二次突刺加速怒气积攒。',
  yuxiao: '【音律和鸣 · 广陵绝响】普攻与回音弹回暗器积攒音律；绝技「广陵散」终结炸裂令音律回满并清零清音冷却。',
  zuixian: '【豪饮留客 · 山水醉意】放招与拳脚命中迅速累积醉意（增伤最高 +50%）；绝技「山水之间」全屏墨染八段重创并令醉意飙升！',
  gouchen: '【飞锤扯链 · 震魄巨力】飞锤拉拽破防附加震魄增伤；奥义「开天一锤」砸落定身并重置飞锤冷却。',
  cixian: '【两极磁力 · 一弹一吸】正极普攻伤害高、每下击飞，负极普攻轻吸对手、四段循环连个不停；绝技「天地磁合」天上正极、地上负极，把对手夹成肉饼！',
  lingque: '【飞梭穿织 · 雀芒锁脉】双持子母飞梭中远贯穿高效攒气；绝技「万线归宗」漫天悬丝全屏暴风绞杀，附加雀芒并回涌重置换影！',
  liying: '【雾身换位 · 碎影反噬】雾身具高额生命承受伤害，碎裂反噬自爆；出招释放内功波动飞刃，虽伤害偏低但直透防御加速架势消耗。渡影霸体且伴随全场 0.5 秒时空凝滞供拣选真身。',
  qianji: '【机关机栝 · 动能汇聚】投掷傀丸与击打传动高效聚气；大招「千丝收网」直线拉回贯穿全屏，并瞬间刷新 Q 技能！',
};
// ======================= 招式类型详解 =======================
const HERO_MOVE_TYPES = {
  qianji: {
    light: { type: 'melee', label: '铜手推掌', rng: 'melee' },
    charge: { type: 'melee', label: '近战', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'proj', label: '投掷傀丸', rng: 'ranged', icon: 'skill' },
    ranged: { type: 'zone', label: '八方钢针', rng: 'mid', icon: 'melee' },
    ult: { type: 'fullscreen', label: '千丝收网', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  liying: {
    light: { type: 'melee', label: '近战', rng: 'melee' },
    charge: { type: 'melee', label: '近战', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'dash', label: '留身踏斩', rng: 'melee', icon: 'melee' },
    ranged: { type: 'esc', label: '换位', rng: 'screen', icon: 'esc' },
    ult: { type: 'ranged', label: '雾身齐斩', rng: 'ranged', icon: 'ranged' },
    esc: { type: 'esc', label: '身法' }
  },
  cixian: {
    light: { type: 'melee', label: '近战磁掌', rng: 'melee' },
    charge: { type: 'melee', label: '近战', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'buff', label: '换极性', rng: 'self', icon: 'skill' },
    ranged: { type: 'mid', label: '弹开 / 吸来', rng: 'mid', icon: 'melee' },
    ult: { type: 'fullscreen', label: '天地夹击', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  lingque: {
    light: { type: 'melee', label: '近战飞梭', rng: 'melee' },
    charge: { type: 'melee', label: '近战突刺', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'ranged', label: '远距飞梭', rng: 'ranged', icon: 'ranged' },
    ranged: { type: 'dash', label: '追踪换影', rng: 'ranged', icon: 'melee' },
    ult: { type: 'fullscreen', label: '全域悬丝', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  qingfeng: {
    light: { type: 'melee', label: '近战', rng: 'melee' },
    charge: { type: 'melee', label: '近战', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'dash', label: '突进', rng: 'mid', icon: 'melee' },
    ranged: { type: 'ranged', label: '远距', rng: 'ranged', icon: 'ranged' },
    ult: { type: 'melee', label: '居合绝技', rng: 'mid' },
    esc: { type: 'esc', label: '身法' }
  },
  tieshan: {
    light: { type: 'melee', label: '近战', rng: 'melee' },
    charge: { type: 'mid', label: '中距霸体', rng: 'mid' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'mid', label: '中距重震', rng: 'mid', icon: 'melee' },
    ranged: { type: 'dash', label: '突进冲阵', rng: 'mid', icon: 'shield_bash' },
    ult: { type: 'fullscreen', label: '全屏撼地', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  feiying: {
    light: { type: 'melee', label: '近战', rng: 'melee' },
    charge: { type: 'melee', label: '近战背刺', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'dash', label: '闪身突进', rng: 'mid', icon: 'melee' },
    ranged: { type: 'ranged', label: '远距暗器', rng: 'ranged', icon: 'ranged' },
    ult: { type: 'melee', label: '近身绝杀', rng: 'melee' },
    esc: { type: 'esc', label: '身法' }
  },
  liuyun: {
    light: { type: 'melee', label: '近战', rng: 'melee' },
    charge: { type: 'mid', label: '中距卷地', rng: 'mid' },
    air: { type: 'air', label: '空战御风', rng: 'air' },
    skill: { type: 'ranged', label: '远距风刃', rng: 'ranged', icon: 'ranged' },
    ranged: { type: 'mid', label: '中距退扇', rng: 'mid', icon: 'ranged' },
    ult: { type: 'fullscreen', label: '全域龙卷', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  leiming: {
    light: { type: 'melee', label: '近战', rng: 'melee' },
    charge: { type: 'melee', label: '近战破防', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'dash', label: '电光突进', rng: 'mid', icon: 'melee' },
    ranged: { type: 'counter', label: '反震雷铠', rng: 'melee', icon: 'shield_bash' },
    ult: { type: 'fullscreen', label: '全域天雷', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  lingshuang: {
    light: { type: 'mid', label: '中距枪芒', rng: 'mid' },
    charge: { type: 'mid', label: '中距穿杨', rng: 'mid' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'mid', label: '中距突刺', rng: 'mid', icon: 'melee' },
    ranged: { type: 'melee', label: '近战枪旋', rng: 'melee', icon: 'melee' },
    ult: { type: 'fullscreen', label: '全域刹那', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  moyu: {
    light: { type: 'melee', label: '近战墨痕', rng: 'melee' },
    charge: { type: 'mid', label: '中距顿笔', rng: 'mid' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'trap', label: '中距阵地', rng: 'mid', icon: 'magic_trap' },
    ranged: { type: 'ranged', label: '远距墨符', rng: 'ranged', icon: 'ranged' },
    ult: { type: 'fullscreen', label: '全图绝杀', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  yuehua: {
    light: { type: 'melee', label: '近战', rng: 'melee' },
    charge: { type: 'melee', label: '近战破防', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'counter', label: '反制月镜', rng: 'melee', icon: 'shield_bash' },
    ranged: { type: 'mid', label: '中距折返', rng: 'mid', icon: 'ranged' },
    ult: { type: 'mid', label: '近距震退', rng: 'mid' },
    esc: { type: 'esc', label: '身法' }
  },
  yanling: {
    light: { type: 'air', label: '空战回旋', rng: 'air' },
    charge: { type: 'mid', label: '中距破云', rng: 'mid' },
    air: { type: 'air', label: '自由空战', rng: 'air' },
    skill: { type: 'dash', label: '中距鹰击', rng: 'mid', icon: 'melee' },
    ranged: { type: 'ranged', label: '远距翎羽', rng: 'ranged', icon: 'ranged' },
    ult: { type: 'fullscreen', label: '全域天怒', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  yuxiao: {
    light: { type: 'mid', label: '中距音律', rng: 'mid' },
    charge: { type: 'melee', label: '近战扫击', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'ranged', label: '远距音波', rng: 'ranged', icon: 'ranged' },
    ranged: { type: 'counter', label: '中距回音', rng: 'mid', icon: 'shield_bash' },
    ult: { type: 'fullscreen', label: '全域绝响', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  zuixian: {
    light: { type: 'melee', label: '近战醉拳', rng: 'melee' },
    charge: { type: 'melee', label: '近战撞钟', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'trap', label: '中距禁锢', rng: 'mid', icon: 'magic_trap' },
    ranged: { type: 'ranged', label: '远距掷坛', rng: 'ranged', icon: 'ranged' },
    ult: { type: 'fullscreen', label: '全图墨染', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  },
  gouchen: {
    light: { type: 'mid', label: '中距链锤', rng: 'mid' },
    charge: { type: 'mid', label: '中距砸地', rng: 'mid' },
    air: { type: 'mid', label: '中距空砸', rng: 'mid' },
    skill: { type: 'ranged', label: '远距飞锤', rng: 'ranged', icon: 'ranged' },
    ranged: { type: 'mid', label: '中距旋锤', rng: 'mid', icon: 'melee' },
    ult: { type: 'fullscreen', label: '全图巨锤', rng: 'screen' },
    esc: { type: 'esc', label: '身法' }
  }
};
// ======================= 全真打击数据与时序 =======================
// 招式卡片的名字、标签、伤害说明。冷却不写在这里：图鉴和选人页直接读 SKILLS[..].cd 和 escCD，免得两边数字对不上
const HERO_HIT_DETAILS = {
  liying: {
    light: { name: '离魂五斩', badge: '✦ 快刀', badgeCls: 'badge-buff', dmg: '77 (5段)', desc: '单刀五连斩，末段挑空。' },
    charge: { name: '雾里藏锋', badge: '💥 破防', badgeCls: 'badge-break', dmg: '—', desc: '按住蓄力，一刀破开正面格挡。' },
    air: { name: '落影斩', badge: '✦ 挑空', badgeCls: 'badge-buff', dmg: '—', desc: '空中两段斩。他只有一段跳，跳起来就要想好怎么落地。' },
    skill: { name: '留影', badge: '✦ 留下雾身', badgeCls: 'badge-buff', dmg: '40', desc: '在脚下留一个雾身，向前踏出一大步斩一刀。已有雾身同步出刀并在身后留下一具较弱子影。场上最多 10 个雾身，具高额生命承受伤害，碎裂反噬引爆。出招伴随内功气刃直透防御。' },
    ranged: { name: '渡影', badge: '✦ 霸体换位', badgeCls: 'badge-stun', dmg: '—', desc: '获得 0.25 秒霸体护身，全场进入 0.5 秒时空凝滞供拣选目标真身雾身；未选则随机指定。结印后身形瞬现，消去真身雾身，路径间飞身割裂。' },
    ult: { name: '万影归一', badge: '✦ 雾身齐斩', badgeCls: 'badge-stun', dmg: '45~113', desc: '每个雾身朝对手斩出一道刀光，然后本体瞬移到对手身前补一刀挑空。全程没有无敌。' },
    esc: { name: '散影', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  yuxiao: {
    light: { name: '玉箫点穴连击', badge: '攒音律', badgeCls: 'badge-buff', dmg: '95 (5段)', desc: '箫管点打五连击，每中一击攒一枚音律，最多三枚。' },
    charge: { name: '横吹破气扫击', badge: '破防打倒', badgeCls: 'badge-break', dmg: '35.3 / 56.8', desc: '旋身横扫破开防守，将对手打倒在地。' },
    air: { name: '高音穿云斩', badge: '挑空', badgeCls: 'badge-buff', dmg: '17.6 / 25.5', desc: '跃起凌空横箫劈点，二段把人送上云霄。' },
    skill: { name: '清音破空', badge: '音波穿透', badgeCls: 'badge-stun', dmg: '22~82', desc: '将身上的音律一次吹尽，三律齐鸣时音波贯穿挑空并迟缓对手。' },
    ranged: { name: '回音壁', badge: '弹回暗器', badgeCls: 'badge-break', dmg: '18~42', desc: '筑起回音屏障推开近敌，弹回期间飞来的暗器并获得音律。' },
    ult: { name: '广陵散', badge: '曲终绝响', badgeCls: 'badge-stun', dmg: '144~189', desc: '六道音刃轮番穿身，曲终绝响从脚下炸开，音律回满。' },
    esc: { name: '休止符', badge: '霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  zuixian: {
    light: { name: '醉拳五打', badge: '醉意增伤', badgeCls: 'badge-buff', dmg: '97 (5段)', desc: '东倒西歪的五连拳，醉意越高越痛。' },
    charge: { name: '醉汉撞钟', badge: '破防击飞', badgeCls: 'badge-break', dmg: '36 / 58', desc: '身如醉钟横撞，正面撞碎对手防御。' },
    air: { name: '倒踢金钩', badge: '挑空', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '凌空一记醉倒踢，翻身把人踢上半空。' },
    skill: { name: '亭中留客', badge: '禁锢 1.5s', badgeCls: 'badge-stun', dmg: '20', desc: '召唤醉翁亭从空中砸落，将对手困在亭中 1.5 秒任由宰割；对手可用腾空闪脱困，霸体可硬抗。' },
    ranged: { name: '与民同乐', badge: '共饮回春', badgeCls: 'badge-buff', dmg: '0 (+135血)', desc: '半壶酒掷向对手，自身回135血晕0.7秒，对手回85血晕1.5秒并清空酒意。' },
    ult: { name: '山水之间', badge: '全屏墨染', badgeCls: 'badge-stun', dmg: '120 (8段)', desc: '醉意化作山水墨色浸染乾坤，全屏判定八段绝杀，无法闪避。' },
    esc: { name: '醉卧浮生', badge: '霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  gouchen: {
    light: { name: '链锤连打', badge: '长臂展', badgeCls: 'badge-buff', dmg: '94.1 (5段)', desc: '甩着链锤抡打五连击，攻击距离比常人长一截。' },
    charge: { name: '流星坠地', badge: '破防砸倒', badgeCls: 'badge-break', dmg: '34.9 / 56.3', desc: '铁锤绷直重重砸落，崩裂地面砸倒对手。' },
    air: { name: '飞轮落锤', badge: '挑空下砸', badgeCls: 'badge-buff', dmg: '17.5 / 25.2', desc: '空中抡圆链锤扫打，二段势大力沉压向地面。' },
    skill: { name: '飞锤拉拽', badge: '拽至身前', badgeCls: 'badge-stun', dmg: '18', desc: '甩出链锤将远处的对手一把拽到跟前，附加震魄增伤。' },
    ranged: { name: '旋锤风暴', badge: '砸碎暗器', badgeCls: 'badge-buff', dmg: '58 (5圈)', desc: '头顶抡圆飞转砸碎飞镖暗器，第五圈脱手一甩把人击飞。' },
    ult: { name: '开天一锤', badge: '巨锤震晕', badgeCls: 'badge-stun', dmg: '120', desc: '将链锤甩上天化作百倍巨锤砸落震晕，回锤再抡一击。' },
    esc: { name: '钩索腾云', badge: '霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  qianji: {
    light: { name: '天工连推', badge: '✦ 传动机掌', badgeCls: 'badge-buff', dmg: '88 (4段)', desc: '铜腕推击，末段推掌击飞；命中场上傀丸可将其击飞平推加速。' },
    charge: { name: '重机轰爆', badge: '💥 破防重击', badgeCls: 'badge-break', dmg: '36 / 60', desc: '机关臂重轰，击中傀丸时将其轰击成极速重炮。' },
    air: { name: '机影凌空', badge: '✦ 空中连击', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '半空翻身拍掌，二段势大力沉压地。' },
    skill: { name: '投丸', badge: '✦ 弹跳驻场', badgeCls: 'badge-buff', dmg: '42', desc: '掷出玄铁傀丸反弹驻留阵中，未收回前不可重复释放。' },
    ranged: { name: '暴雨梨花', badge: '🛡️ 受击可放', badgeCls: 'badge-break', dmg: '55', desc: '金丝震弦，远程激发傀丸向八方爆射钢针击飞敌人；受击解控。' },
    ult: { name: '千丝收网', badge: '✦ 贯穿回手', badgeCls: 'badge-stun', dmg: '120', desc: '发条全力反卷，傀丸直线贯穿全场拉回并重置 Q 技能。' },
    esc: { name: '金丝引遁', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，借金丝后撤腾空。' }
  },
  cixian: {
    light: { name: '两极磁掌', badge: '⊕ 击飞 / ⊖ 轻吸', badgeCls: 'badge-buff', dmg: '⊕ ×1.35 / ⊖ ×0.55', desc: '正极每掌击飞，伤害高；负极每掌把人吸近一点，四段循环可以一直连，连中 15 下消磁。' },
    charge: { name: '磁暴蓄掌', badge: '💥 破防推掌', badgeCls: 'badge-break', dmg: '36 / 58', desc: '蓄满一掌推出，强行贯穿正面格挡。' },
    air: { name: '凌空磁掌', badge: '✦ 空中连击', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '空中拍掌，二段向下压地。' },
    skill: { name: '极性反转', badge: '⊕ ⇄ ⊖', badgeCls: 'badge-buff', dmg: '—', desc: '正负极互换，不花出招时间，身上亮起红色 ⊕ 或蓝色 ⊖，立刻清零 R 的冷却。' },
    ranged: { name: '磁极', badge: '⊕ 弹开 / ⊖ 吸来', badgeCls: 'badge-stun', dmg: '48 / 16', desc: '正极身边磁石炸开把人用力弹走，越近越远；负极把中距离的人吸到身前定住 0.5 秒。' },
    ult: { name: '天地磁合', badge: '✦ 夹成肉饼', badgeCls: 'badge-stun', dmg: '125', desc: '天上的正极和地上的负极把对手夹在中间，合拢后定住 1 秒。' },
    esc: { name: '磁浮腾空', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，借磁力腾空退避，落地前无敌。' }
  },
  lingque: {
    light: { name: '飞梭快影连刺', badge: '✦ 飞梭速刺', badgeCls: 'badge-buff', dmg: '93.1 (5段)', desc: '子母梭双持穿刺连击，出手灵巧如惊雀掠空。' },
    charge: { name: '梭芒贯日蓄斩', badge: '💥 破防突刺', badgeCls: 'badge-break', dmg: '34.6 / 55.7', desc: '悬丝真气贯注双梭猛刺，强行贯通正面格挡。' },
    air: { name: '凌波空刺·掠地', badge: '✦ 空中回旋', badgeCls: 'badge-buff', dmg: '17.3 / 25', desc: '空中旋身飞梭点刺，二段凌波斜下掠击。' },
    skill: { name: '穿叶飞梭', badge: '✦ 雀芒印记 5s', badgeCls: 'badge-stun', dmg: '30', desc: '掷出牵丝子母梭贯穿前方，命中施加5秒雀芒印记。' },
    ranged: { name: '移形换影', badge: '✦ 雀芒引爆', badgeCls: 'badge-buff', dmg: '34 (+30爆伤)', desc: '化作流光追着对手飞过去穿刺（最多追 0.8 秒），只有腾空闪这类无敌身法躲得开；穿透已带印记者追加30爆炸伤害、挑空并瞬间刷新冷却！' },
    ult: { name: '万线归宗', badge: '✦ 全域悬丝', badgeCls: 'badge-stun', dmg: '140 (8段)', desc: '漫天悬丝罗网交错绞杀，附加雀芒印记并清零换影冷却。' },
    esc: { name: '雀步凌波', badge: '🛡️ 悬丝脱困', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，牵引悬丝腾空退避，落地前无敌。' }
  },
  qingfeng: {
    light: { name: '五段快剑连斩', badge: '🌪️ 击飞浮空', badgeCls: 'badge-buff', dmg: '100.9 (5段)', desc: '行云流水五连斩，末段挑空，青蓝弧光残影。' },
    charge: { name: '破防蓄力大劈', badge: '💥 破防打倒', badgeCls: 'badge-break', dmg: '37.4 / 60.3', desc: '长蓄后重剑崩地，无视常规格挡，正面击倒。' },
    air: { name: '凌空挑斩·下砸', badge: '🌪️ 挑空击倒', badgeCls: 'badge-buff', dmg: '18.7 / 27', desc: '空中横斩滞空，二段重坠下劈强压地面。' },
    skill: { name: '居合·疾风斩', badge: '⚡ 斩穴定身 0.65s', badgeCls: 'badge-stun', dmg: '55', desc: '身随剑走瞬间穿身，施加穴道强定身并刷新剑气与冲刺。' },
    ranged: { name: '弧月·剑气', badge: '🌪️ 掀天挑空', badgeCls: 'badge-buff', dmg: '52', desc: '半屏极速弧月剑刃，破尽暗器并挑飞空中。' },
    ult: { name: '绝技·残月', badge: '⚡ 剑意通明', badgeCls: 'badge-stun', dmg: '169 (6连)', desc: '居合连影绞杀，斩落重置全技能与绝技气量回涌。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  tieshan: {
    light: { name: '重剑沉猛五斩', badge: '💥 霸体压制', badgeCls: 'badge-break', dmg: '93.1 (5段)', desc: '玄铁巨剑刀刀沉重带金属火星，体量压迫。' },
    charge: { name: '裂地狂怒崩山', badge: '💥 破防轰飞', badgeCls: 'badge-break', dmg: '34.6 / 55.7', desc: '双足踏裂地面，满蓄霸体强攻，双倍瓦解架势。' },
    air: { name: '重剑空击·碎石', badge: '💥 沉重砸地', badgeCls: 'badge-break', dmg: '17.3 / 25', desc: '高空举刃重砸，重力势能造成剧烈下坠冲击。' },
    skill: { name: '撼地·震地波', badge: '💥 撼地重震 0.45s', badgeCls: 'badge-stun', dmg: '45 + 40', desc: '双手托刃砸裂地面，双向土石裂地波掀飞穹顶。' },
    ranged: { name: '焚血狂突·玄甲巨浪', badge: '🌊 通天巨浪', badgeCls: 'badge-break', dmg: '56', desc: '掀起通天巨浪呼啸冲锋，通天高度彻底封杀空中与腾空，巨浪拍岸瓦解防御。' },
    ult: { name: '奥义·山崩', badge: '💫 怒意回涌 1.3s', badgeCls: 'badge-stun', dmg: '185 (直击)', desc: '一跃擎天泰山压顶，正中晕眩1.3s并回满气重置CD；砸偏或砸倒地的对手只回半气。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '玄铁重甲强解受控，稳健退避重整架势。' }
  },
  feiying: {
    light: { name: '迅疾双刃刺杀', badge: '⚡ 疾风连打', badgeCls: 'badge-buff', dmg: '92 (5段)', desc: '出刀极疾，近身密雨连刺，末段暗影穿刺。' },
    charge: { name: '疾影背刺斩', badge: '💥 破防背袭', badgeCls: 'badge-break', dmg: '40.3 / 65', desc: '侧闪蓄力直取后背，大幅破除正面架势。' },
    air: { name: '回旋空刃·落刺', badge: '🌪️ 滞空穿刺', badgeCls: 'badge-buff', dmg: '20.2 / 29.1', desc: '空中回旋双刺，下落直刺钉向地面。' },
    skill: { name: '暗影·影遁', badge: '🌑 背后绞杀', badgeCls: 'badge-stun', dmg: '45', desc: '结印化烟，0.15 秒掠到对手背后十字绞杀（不让对手僵直），之后下一击增伤50%。' },
    ranged: { name: '飞星·手里剑', badge: '⚡ 极速截击', badgeCls: 'badge-buff', dmg: '25×4', desc: '扇形四枚暗铁手里剑，极速打断对手起手动作。' },
    ult: { name: '绝杀·千影', badge: '⚡ 暗影绝杀', badgeCls: 'badge-stun', dmg: '179 (9连)', desc: '九道猩红残影错落绞杀，终结重置影遁并化分身。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 影遁化解', badgeCls: 'badge-break', dmg: '—', desc: '替身化烟脱困，身轻如燕迅速拉开安全身位。' }
  },
  liuyun: {
    light: { name: '折扇翻飞连舞', badge: '🌪️ 击退推搡', badgeCls: 'badge-buff', dmg: '114.5 (5段)', desc: '轻扇翻转随风而动，动作轻盈且多段推退。' },
    charge: { name: '旋风拂柳蓄斩', badge: '💥 破防卷地', badgeCls: 'badge-break', dmg: '42.5 / 68.4', desc: '引动周身气流向前爆破，推开正面一切防备。' },
    air: { name: '御风凌云·挥风', badge: '🌪️ 浮空风切', badgeCls: 'badge-buff', dmg: '21.2 / 30.7', desc: '空中三段跳滞空扇击，下扫带风刃压制。' },
    skill: { name: '惊涛·风刃', badge: '🌪️ 双刃齐发', badgeCls: 'badge-buff', dmg: '28×2', desc: '挥扇一次扇出上下两道风刃，几无硬直，击退极强。' },
    ranged: { name: '开扇·米花', badge: '🍿 半秒后爆', badgeCls: 'badge-buff', dmg: '8×5', desc: '张开折扇朝前疾冲，一路撒下爆米花，半秒后噼啪炸开。' },
    ult: { name: '神通·龙卷', badge: '🌪️ 扶摇万里', badgeCls: 'badge-buff', dmg: '16×16', desc: '召出接天双龙卷横扫，卷入高空，跳跃次数回满。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 乘风化解', badgeCls: 'badge-break', dmg: '—', desc: '御风乘气向后腾跃，完美契合三段跳身法。' }
  },
  leiming: {
    light: { name: '狂雷六连轰拳', badge: '⚡ 疾电连打', badgeCls: 'badge-buff', dmg: '132 (6段)', desc: '六记重拳连环轰击，拳拳带雷，末拳雷暴轰天。' },
    charge: { name: '蓄力奔雷重炮', badge: '💥 破防重击', badgeCls: 'badge-break', dmg: '33.8 / 54.5', desc: '沉腰蓄势轰出电芒重拳，无坚不摧打倒在地。' },
    air: { name: '空落雷拳·踏击', badge: '⚡ 震雷落击', badgeCls: 'badge-buff', dmg: '16.9 / 24.4', desc: '空中重拳下砸，接连一记沉雷踏击。' },
    skill: { name: '电光·雷闪', badge: '⚡ 触电麻痹 0.38s', badgeCls: 'badge-stun', dmg: '40', desc: '化身雷光贴地霸体冲拳，触电麻痹瘫痪0.38秒并重置雷铠。' },
    ranged: { name: '金刚·雷铠', badge: '⚡ 引雷反震 50', badgeCls: 'badge-stun', dmg: '50', desc: '架起金刚雷铠0.55秒，受击消解攻击并引落九天玄雷反制敌首。' },
    ult: { name: '雷帝·雷霆万钧', badge: '⚡ 雷帝灌顶 +30%', badgeCls: 'badge-stun', dmg: '48×3', desc: '九天神雷三连追落敌身，重置拳劲并回涌30%大招气量。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 金刚解控', badgeCls: 'badge-break', dmg: '—', desc: '金刚怒吼震脱受制状态，后退步稳如磐石。' }
  },
  lingshuang: {
    light: { name: '银枪连刺·抽枪', badge: '⚡ 枪芒连刺', badgeCls: 'badge-buff', dmg: '97 (5段)', desc: '长枪一线连环突刺，枪尖命中伤害提升25%。' },
    charge: { name: '百步穿杨远刺', badge: '💥 远距破防', badgeCls: 'badge-break', dmg: '36 / 58', desc: '极远距离枪尖猛刺，直接破除远处格挡防御。' },
    air: { name: '寒芒点水·挑刺', badge: '🌪️ 空中穿云', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '空中点枪突刺，下压枪尾横扫落地。' },
    skill: { name: '绝技·回马枪', badge: '⚡ 枪尖穿心 0.48s', badgeCls: 'badge-stun', dmg: '60', desc: '后跃避开敌势，235px极限回刺穿心定身+挑空。' },
    ranged: { name: '乾坤·枪旋', badge: '🛡️ 弹飞投掷 125px', badgeCls: 'badge-break', dmg: '15×7+48', desc: '枪如风车拨落飞行道具，末段大横扫全额击飞。' },
    ult: { name: '神技·刹那', badge: '❄️ 寒芒贯日 4.0s', badgeCls: 'badge-stun', dmg: '140–185', desc: '漫天枪影化为一线寒芒贯穿，重置技能并减速40%。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 游龙脱困', badgeCls: 'badge-break', dmg: '—', desc: '身化游龙向后挑跃，拉开枪客最强打击身位。' }
  },
  moyu: {
    light: { name: '挥毫泼墨五式', badge: '🎨 浓墨溅射', badgeCls: 'badge-buff', dmg: '86 (5段)', desc: '狼毫大笔挥洒浓墨，附带远程墨滴额外伤害（每团24）。' },
    charge: { name: '墨宝万钧重印', badge: '💥 破防顿笔', badgeCls: 'badge-break', dmg: '38.9 / 62.6', desc: '蓄墨如山大印落下，墨意四溢击倒受击者。' },
    air: { name: '临空写意·泼洒', badge: '🎨 空中泼彩', badgeCls: 'badge-buff', dmg: '19.4 / 28.1', desc: '空中挥墨阻击，落地重笔点化画境。' },
    skill: { name: '画地·墨阵', badge: '⚡ 深墨禁锢 0.48s', badgeCls: 'badge-stun', dmg: '35', desc: '铺开115px深墨池，踏入者定身0.48秒并迟缓2.8秒；二段Q引爆25伤害。' },
    ranged: { name: '提笔·画符', badge: '📜 符 +1', badgeCls: 'badge-buff', dmg: '—', desc: '花 3 格墨水画一张符，最多攒 5 张，留给大招。' },
    ult: { name: '宣纸·符阵', badge: '📜 全图符爆', badgeCls: 'badge-stun', dmg: '80~280', desc: '整张图化作宣纸，对手染红，头顶的符炸开；符越多伤害越高。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 墨韵遁形', badgeCls: 'badge-break', dmg: '—', desc: '借墨遁身向后飘退，重组挥毫阵地。' }
  },
  yuehua: {
    light: { name: '双月流水旋舞', badge: '🌙 月华流水', badgeCls: 'badge-buff', dmg: '97 (5段)', desc: '双月短刃回旋如流水，舞姿飘逸清冷。' },
    charge: { name: '合璧明月蓄斩', badge: '💥 双刀破防', badgeCls: 'badge-break', dmg: '36 / 58', desc: '双刃化作满月合璧切落，斩断对手招架。' },
    air: { name: '清辉凌波·双刃', badge: '🌙 踏月凌空', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '月刃凌空双分旋转，顺势飘然下斩。' },
    skill: { name: '神镜·月镜', badge: '🌙 太阴绝罚 1.05s', badgeCls: 'badge-stun', dmg: '95', desc: '月镜架招反斩，触发太阴绝罚95伤害、1.05秒超长硬直与禁身。' },
    ranged: { name: '飞轮·月轮', badge: '🌙 背袭破防 0.78s', badgeCls: 'badge-break', dmg: '28 / 38', desc: '双月轮飞出折返，去程28轻削，返程38背袭破防击飞。' },
    ult: { name: '仙术·月华如水', badge: '🌙 月魄霸体 +100HP', badgeCls: 'badge-buff', dmg: '75 (+100血)', desc: '月华凝露恢复100生命并震退近敌75伤害，月魄护体并重置月镜月轮。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 踏月退避', badgeCls: 'badge-break', dmg: '—', desc: '月光幻化身法退后，脱离危险贴身缠斗。' }
  },
  yanling: {
    light: { name: '飞羽短刃疾斩', badge: '🪶 振羽连打', badgeCls: 'badge-buff', dmg: '100.9 (5段)', desc: '羽刃翩跹迅捷凌厉，灵动逼人。' },
    charge: { name: '破云飞翔重扑', badge: '💥 破云重扑', badgeCls: 'badge-break', dmg: '37.4 / 60.3', desc: '双翼振起猛力前扑，切断对手阵势。' },
    air: { name: '苍穹展翼·掠击', badge: '🪶 空中掠阵', badgeCls: 'badge-buff', dmg: '18.7 / 27', desc: '空中长达1.2秒自由翱翔，自上而下俯瞰掠击。' },
    skill: { name: '鹰扬·俯冲', badge: '⚡ 鹰击钉地 0.40s', badgeCls: 'badge-stun', dmg: '46', desc: '收翼斜下猎杀钉地，空中击中可刷新且再次冲锋。' },
    ranged: { name: '千机·翎羽', badge: '🪶 极速穿透', badgeCls: 'badge-buff', dmg: '22×3', desc: '振翅激射三道穿透羽刃，贯穿全屏牵制打断。' },
    ult: { name: '天怒·万羽', badge: '🪶 凌霄破虚 14枚', badgeCls: 'badge-buff', dmg: '14×14', desc: '九霄万羽暴雨倾泻，重置技能并回满飞行耐力。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 振翅凌云', badgeCls: 'badge-break', dmg: '—', desc: '猛力振翅脱离受击，立刻升空开启空中制空权。' }
  }
};

const HERO_MOVE_SEQS = {
  liying: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1s', d: 0.07, lab: '离魂五斩' }, { p: 'l1a', d: 0.12, dx: 12, hit: 1 },
      { p: 'l2s', d: 0.06 }, { p: 'l2a', d: 0.12, dx: 12, hit: 1 },
      { p: 'l3s', d: 0.08 }, { p: 'l3a', d: 0.22, dx: 16, hit: 2, launch: true, badge: '挑空' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'hva', d: 0.3, dx: 30, hit: 3, launch: true, badge: '破防' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中（一段跳）' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.12, fx: 'mist', lab: 'Q · 留影' }, { p: 'l2a', d: 0.24, dx: 40, hit: 2, badge: '留下雾身' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.1, lab: 'R · 渡影' }, { p: 'idle', d: 0.08, fx: 'mistswap', dx: -60, badge: '换位' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.2, lab: 'E · 万影归一' }, { p: 'l3a', d: 0.45, dx: 40, fx: 'mistarray', hit: 3, launch: true, badge: '雾身齐斩' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '散影' }, { p: 'idle', d: 0.35, reset: true }]
  },
  yuxiao: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yx_play', d: 0.08, lab: '起奏' }, { p: 'yx_push', d: 0.12, dx: 10, hit: 1 },
      { p: 'fn_l1s', d: 0.08 }, { p: 'fn_l1a', d: 0.12, dx: 12, hit: 1 },
      { p: 'yx_play', d: 0.08 }, { p: 'lca', d: 0.18, dx: 14, hit: 2, launch: true, badge: '音律 +3' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'hva', d: 0.3, dx: 30, hit: 3, launch: true, badge: '破防打倒' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'yx_play', d: 0.14, lab: 'Q · 清音' }, { p: 'yx_push', d: 0.36, dx: 18, hit: 2, fx: 'note', launch: true, badge: '三律齐鸣' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'yx_play', d: 0.42, fx: 'mirror', hit: 1, lab: 'R · 回音壁', badge: '回音' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'yx_play', d: 0.2, lab: 'E · 广陵散' }, { p: 'yx_push', d: 0.45, fx: 'guangling', hit: 3, launch: true, badge: '曲终绝响' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '休止符' }, { p: 'idle', d: 0.35, reset: true }]
  },
  zuixian: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'zx_sway', d: 0.08, lab: '醉步连打' }, { p: 'lm_jab', d: 0.11, dx: 10, hit: 1 },
      { p: 'zx_drink', d: 0.08 }, { p: 'zx_breath', d: 0.12, dx: 12, hit: 1 },
      { p: 'zx_sway', d: 0.08 }, { p: 'zx_upper', d: 0.22, dx: 14, hit: 2, launch: true, badge: '醉意增伤' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'zx_upper', d: 0.3, dx: 30, hit: 3, launch: true, badge: '破防撞钟' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'zx_sway', d: 0.15, lab: 'Q · 亭中留客' }, { p: 'gc_wind', d: 0.32, fx: 'avalanche', hit: 2, badge: '飞亭砸落' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'zx_drink', d: 0.25, lab: 'R · 与民同乐' }, { p: 'gc_throw', d: 0.3, fx: 'proj', hit: 1, badge: '掷坛共饮' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'zx_drink', d: 0.2, lab: 'E · 山水之间' }, { p: 'zx_upper', d: 0.48, fx: 'shanshui', hit: 8, launch: true, badge: '全屏墨染' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '醉卧浮生' }, { p: 'idle', d: 0.35, reset: true }]
  },
  gouchen: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'gc_wind', d: 0.08, lab: '链锤连砸' }, { p: 'gc_throw', d: 0.12, dx: 12, hit: 1 },
      { p: 'gc_pull', d: 0.08 }, { p: 'gc_sweep', d: 0.22, dx: 16, hit: 2, launch: true, badge: '长臂挥砸' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'gc_sweep', d: 0.32, dx: 34, hit: 3, launch: true, badge: '破防砸倒' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'gc_sweep', d: 0.26, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'gc_throw', d: 0.2, fx: 'proj', lab: 'Q · 飞锤' }, { p: 'gc_pull', d: 0.3, hit: 1, badge: '震魄' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'gc_spin', d: 0.4, fx: 'spin', hit: 2, lab: 'R · 旋锤' }, { p: 'gc_throw', d: 0.25, hit: 2, badge: '击飞' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'gc_wind', d: 0.25, lab: 'E · 开天一锤' }, { p: 'gc_sweep', d: 0.42, fx: 'skynet', hit: 3, launch: true, badge: '巨锤震晕' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '钩索腾云' }, { p: 'idle', d: 0.35, reset: true }]
  },
  qianji: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1s', d: 0.07, lab: '铜手连推' }, { p: 'l1a', d: 0.11, dx: 10, hit: 1 },
      { p: 'l2s', d: 0.07 }, { p: 'l2a', d: 0.11, dx: 12, hit: 1 },
      { p: 'lcs', d: 0.07 }, { p: 'lca', d: 0.11, dx: 12, hit: 1 },
      { p: 'l3s', d: 0.08 }, { p: 'l3a', d: 0.18, dx: 16, hit: 2, launch: true, badge: '机掌击飞' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'spa', d: 0.3, dx: 32, hit: 3, launch: true, badge: '重械爆轰' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'qf_charge', d: 0.15, lab: 'Q · 投丸' }, { p: 'l1a', d: 0.3, fx: 'proj', hit: 1, badge: '玄铁傀丸' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.2, lab: 'R · 暴雨梨花' }, { p: 'hva', d: 0.25, fx: 'ironwall', hit: 2, launch: true, badge: '八方钢针' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.15, lab: 'E · 千丝收网' }, { p: 'victory', d: 0.5, fx: 'crescent', hit: 1, badge: '贯穿重置' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '金丝引遁' }, { p: 'idle', d: 0.35, reset: true }]
  },
  cixian: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.07, lab: '负极磁掌' }, { p: 'lm_jab', d: 0.11, dx: 8, hit: 1 },
      { p: 'l2s', d: 0.07 }, { p: 'lm_jab', d: 0.11, dx: 8, hit: 1 },
      { p: 'fn_l1s', d: 0.07 }, { p: 'fn_l1a', d: 0.11, dx: 8, hit: 1 },
      { p: 'lds', d: 0.07 }, { p: 'lm_kick', d: 0.14, dx: 8, hit: 1, badge: '接回第一掌' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'spa', d: 0.3, dx: 32, hit: 3, launch: true, badge: '破防推掌' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'aj_fists_1a', d: 0.16, hit: 1 }, { p: 'aj_fists_2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'idle', d: 0.3, fx: 'ironwall', lab: 'Q · 极性反转', badge: '⊕ ⇄ ⊖' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'lm_boxer', d: 0.15, lab: 'R · 磁极' }, { p: 'hva', d: 0.25, fx: 'ironwall', hit: 2, launch: true, badge: '弹开' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'lm_boxer', d: 0.15, lab: 'E · 天地磁合' }, { p: 'victory', d: 0.5, fx: 'crescent', hit: 1, badge: '夹成肉饼' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '磁浮腾空' }, { p: 'idle', d: 0.35, reset: true }]
  },
  lingque: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'du_l1s', d: 0.07, lab: '飞梭速刺' }, { p: 'du_l1a', d: 0.11, dx: 12, hit: 1 },
      { p: 'du_l2s', d: 0.07 }, { p: 'du_l2a', d: 0.11, dx: 14, hit: 1 },
      { p: 'du_l1s', d: 0.07 }, { p: 'lca', d: 0.18, dx: 16, hit: 2, launch: true, badge: '击飞' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'hva', d: 0.3, dx: 32, hit: 3, launch: true, badge: '破防突刺' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'du_l1s', d: 0.12, lab: 'Q · 穿叶飞梭' }, { p: 'du_l1a', d: 0.24, fx: 'proj', hit: 1, badge: '雀芒印记' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'du_l1s', d: 0.08, lab: 'R · 移形换影' }, { p: 'dash', d: 0.22, dx: 45, hit: 2, launch: true, badge: '雀芒引爆' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'du_l1s', d: 0.15, lab: 'E · 万线归宗' }, { p: 'du_l2a', d: 0.45, fx: 'needlestorm', hit: 8, launch: true, badge: '全域悬丝' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '雀步凌波' }, { p: 'idle', d: 0.35, reset: true }]
  },
  qingfeng: {
    light: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'l1s', d: 0.07, lab: '普攻1' }, { p: 'l1a', d: 0.12, dx: 12, hit: 1 },
      { p: 'l2s', d: 0.06 }, { p: 'l2a', d: 0.12, dx: 12, hit: 1 },
      { p: 'lcs', d: 0.06 }, { p: 'lca', d: 0.12, dx: 12, hit: 1 },
      { p: 'l3s', d: 0.08 }, { p: 'l3a', d: 0.22, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'charge', d: 0.45, lab: '按住蓄力' },
      { p: 'hva', d: 0.30, dx: 36, hit: 3, launch: true, badge: '💥 破防打倒' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.18, lab: '空中' },
      { p: 'a1a', d: 0.18, hit: 1 },
      { p: 'a2a', d: 0.28, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'qf_charge', d: 0.14, lab: 'Q · 疾风斩' },
      { p: 'qf_thrust', d: 0.32, dx: 52, hit: 2, fx: 'gale', badge: '居合斩穴' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'qf_charge', d: 0.14, lab: 'R · 剑气' },
      { p: 'l3a', d: 0.36, fx: 'swordqi', hit: 1, launch: true, badge: '掀天挑空' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'qf_charge', d: 0.18, lab: 'E · 残月' },
      { p: 'qf_thrust', d: 0.14, dx: 45, hit: 1, fx: 'crescent' },
      { p: 'l1a', d: 0.1, hit: 1 }, { p: 'l2a', d: 0.1, hit: 1 },
      { p: 'hva', d: 0.3, hit: 3, launch: true, badge: '剑意通明' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.32, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  tieshan: {
    light: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'gs_l1s', d: 0.1, lab: '巨刃蓄势' }, { p: 'gs_l1a', d: 0.18, dx: 14, hit: 2 },
      { p: 'l2s', d: 0.08 }, { p: 'l2a', d: 0.16, dx: 16, hit: 2 },
      { p: 'ts_lift', d: 0.12 }, { p: 'ts_slam', d: 0.28, dx: 18, hit: 3, launch: true, badge: '巨刃崩地' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'charge', d: 0.5, lab: '玄铁蓄力' },
      { p: 'ts_slam', d: 0.32, dx: 34, hit: 3, launch: true, fx: 'quake', badge: '💥 破防击倒' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.2, lab: '空中' },
      { p: 'a1a', d: 0.18, hit: 1 },
      { p: 'ts_slam', d: 0.3, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ts_lift', d: 0.22, lab: 'Q · 震地' },
      { p: 'ts_slam', d: 0.36, hit: 2, fx: 'quake', launch: true, badge: '💥 撼地重震' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ts_lift', d: 0.12, lab: 'R · 铁壁冲' },
      { p: 'ts_shoulder', d: 0.38, dx: 48, hit: 2, fx: 'ironwall', launch: true, badge: '💥 崩山破势' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ts_lift', d: 0.25, lab: 'E · 山崩' },
      { p: 'ts_slam', d: 0.45, dx: 40, hit: 4, fx: 'avalanche', launch: true, badge: '💫 怒意回涌' },
      { p: 'victory', d: 0.6, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.3, dx: -30 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  feiying: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'du_l1s', d: 0.05, lab: '双刃连舞' }, { p: 'du_l1a', d: 0.09, dx: 10, hit: 1 },
      { p: 'du_l2s', d: 0.05 }, { p: 'du_l2a', d: 0.09, dx: 10, hit: 1 },
      { p: 'fy_crouch', d: 0.07 }, { p: 'fy_xslash', d: 0.16, dx: 14, hit: 2, launch: true, badge: '十字双刃' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.35, lab: '背刺蓄力' },
      { p: 'fy_xslash', d: 0.28, dx: 36, hit: 2, launch: true, badge: '💥 破防背刺' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '空中' },
      { p: 'a1a', d: 0.15, hit: 1 },
      { p: 'a2a', d: 0.25, hit: 2, launch: true },
      { p: 'idle', d: 0.3, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fy_seal', d: 0.14, lab: 'Q · 影遁' },
      { p: 'fy_xslash', d: 0.32, dx: 105, hit: 2, fx: 'blink', badge: '🌑 背后绞杀' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fy_seal', d: 0.12, lab: 'R · 飞镖' },
      { p: 'fy_crouch', d: 0.35, fx: 'kunai', hit: 1, badge: '极速截击' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fy_seal', d: 0.18, lab: 'E · 千影' },
      { p: 'fy_xslash', d: 0.14, dx: 45, hit: 2, fx: 'shadows' },
      { p: 'l1a', d: 0.08, hit: 1 }, { p: 'l2a', d: 0.08, hit: 1 },
      { p: 'fy_xslash', d: 0.25, hit: 3, launch: true, badge: '暗影绝杀' },
      { p: 'victory', d: 0.5, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.14, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.28, dx: -35 },
      { p: 'idle', d: 0.3, reset: true }
    ]
  },
  liuyun: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fn_l1s', d: 0.08, lab: '折扇点穴' }, { p: 'fn_l1a', d: 0.12, dx: 10, hit: 1 },
      { p: 'ly_fanswipe', d: 0.1 }, { p: 'l2a', d: 0.12, dx: 10, hit: 1 },
      { p: 'fn_l1s', d: 0.08 }, { p: 'ly_fanswipe', d: 0.22, dx: 16, hit: 2, launch: true, badge: '乘风回扇' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.4, lab: '旋风蓄力' },
      { p: 'ly_hover', d: 0.15 },
      { p: 'hva', d: 0.28, dx: 30, hit: 2, launch: true, badge: '💥 破防卷地' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '御风浮空' },
      { p: 'ly_hover', d: 0.16 },
      { p: 'a1a', d: 0.22, hit: 2 },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_fanswipe', d: 0.14, lab: 'Q · 风刃' },
      { p: 'ly_hover', d: 0.36, fx: 'windblade', hit: 1, badge: '🌪️ 狂风推搡' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_hover', d: 0.32, dx: -45, fx: 'windstep', hit: 1, lab: 'R · 开扇', badge: '🍿 爆米花' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_fanswipe', d: 0.22, lab: 'E · 龙卷' },
      { p: 'ly_hover', d: 0.45, fx: 'tornado', hit: 3, launch: true, badge: '🌪️ 扶摇万里' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_hover', d: 0.3, dx: -40 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  leiming: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.05, lab: '快拳六连' }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
      { p: 'l2s', d: 0.04 }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
      { p: 'lm_boxer', d: 0.05 }, { p: 'lm_kick', d: 0.08, dx: 8, hit: 1 },
      { p: 'lds', d: 0.05 }, { p: 'lm_kick', d: 0.08, dx: 8, hit: 1 },
      { p: 'lm_boxer', d: 0.05 }, { p: 'lm_jab', d: 0.08, dx: 8, hit: 1 },
      { p: 'lm_boxer', d: 0.06 }, { p: 'lm_kick', d: 0.22, dx: 18, hit: 2, launch: true, badge: '奔雷破空' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.42, lab: '奔雷蓄力' },
      { p: 'lm_jab', d: 0.3, dx: 36, hit: 3, launch: true, badge: '💥 破防重击' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'lm_kick', d: 0.26, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.1, lab: 'Q · 雷闪' },
      { p: 'lm_jab', d: 0.34, dx: 52, hit: 2, fx: 'thunderfist', badge: '⚡ 触电麻痹' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.12, lab: 'R · 金刚雷铠' },
      { p: 'ts_slam', d: 0.38, dx: 15, fx: 'stomp', hit: 2, launch: true, badge: '⚡ 引雷反震' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_kick', d: 0.22, lab: 'E · 雷霆万钧' },
      { p: 'lm_boxer', d: 0.25, fx: 'thunder', hit: 3, launch: true, badge: '⚡ 雷帝灌顶' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.3, dx: -30 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  lingshuang: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'sp_l1s', d: 0.08, lab: '一线枪芒' }, { p: 'sp_l1a', d: 0.12, dx: 14, hit: 1 },
      { p: 'sp_l2s', d: 0.08 }, { p: 'sp_l2a', d: 0.12, dx: 14, hit: 1 },
      { p: 'ls_stance', d: 0.08 }, { p: 'ls_thrust', d: 0.22, dx: 22, hit: 2, launch: true, badge: '枪芒贯穿' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.44, lab: '穿杨蓄力' },
      { p: 'ls_thrust', d: 0.32, dx: 42, hit: 3, launch: true, badge: '💥 远距破防' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.18, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'ls_plant', d: 0.28, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.22, dx: -24, lab: 'Q · 回马枪' },
      { p: 'ls_thrust', d: 0.35, dx: 38, hit: 2, fx: 'backthrust', launch: true, badge: '枪尖穿心' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.12, lab: 'R · 枪旋' },
      { p: 'ls_plant', d: 0.16, fx: 'spin', hit: 1 },
      { p: 'ls_thrust', d: 0.26, dx: 22, hit: 2, launch: true, badge: '乾坤回旋' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.25, lab: 'E · 刹那' },
      { p: 'ls_thrust', d: 0.4, dx: 60, hit: 3, fx: 'timestop', launch: true, badge: '❄️ 寒芒贯日' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.32, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  moyu: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.09, lab: '挥毫泼墨' }, { p: 'my_paint', d: 0.13, dx: 12, hit: 1 },
      { p: 'l2s', d: 0.08 }, { p: 'my_paint', d: 0.14, dx: 14, hit: 1 },
      { p: 'my_stroke', d: 0.09 }, { p: 'lda', d: 0.22, dx: 16, hit: 2, launch: true, badge: '墨染宣纸' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.42, lab: '万钧蓄力' },
      { p: 'my_paint', d: 0.32, dx: 32, hit: 3, launch: true, badge: '💥 破防顿笔' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'a2a', d: 0.26, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.18, lab: 'Q · 墨阵' },
      { p: 'my_paint', d: 0.36, fx: 'inktrap', hit: 1, badge: '深墨禁锢' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.14, lab: 'R · 画符' },
      { p: 'my_paint', d: 0.38, fx: 'inkblob', hit: 1, launch: true, badge: '墨迹遮目' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.2, lab: 'E · 符阵' },
      { p: 'my_paint', d: 0.48, fx: 'inkdragon', hit: 3, launch: true, badge: '📜 符爆' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.32, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  yuehua: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1a', d: 0.1, dx: 10, hit: 1 }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
      { p: 'lca', d: 0.1, dx: 10, hit: 1 },
      { p: 'hva', d: 0.24, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.4, lab: '明月蓄力' },
      { p: 'hva', d: 0.3, dx: 32, hit: 3, launch: true, badge: '💥 双刀破防' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'a2a', d: 0.26, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yh_mirror', d: 0.24, fx: 'mirror', lab: 'Q · 月镜' },
      { p: 'hva', d: 0.32, dx: 26, hit: 3, launch: true, badge: '🌙 太阴绝罚' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yh_mirror', d: 0.12, lab: 'R · 月轮' },
      { p: 'l2a', d: 0.45, fx: 'moonring', hit: 2, launch: true, badge: '🌙 背袭破防' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yh_lotus', d: 0.5, fx: 'moonflow', hit: 1, lab: 'E · 月华如水', badge: '🌙 月魄霸体' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.3, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  yanling: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1a', d: 0.1, dx: 10, hit: 1 }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
      { p: 'a1a', d: 0.22, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.4, lab: '破云蓄力' },
      { p: 'yl_dive', d: 0.3, dx: 36, hit: 3, launch: true, badge: '💥 破云重扑' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '展翼空战' },
      { p: 'yl_wings', d: 0.18 },
      { p: 'a1a', d: 0.24, hit: 2 },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.14, lab: 'Q · 俯冲' },
      { p: 'yl_dive', d: 0.36, dx: 48, hit: 2, fx: 'dive', badge: '鹰击钉地' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.12, lab: 'R · 翎羽' },
      { p: 'a1a', d: 0.35, fx: 'feather', hit: 1, badge: '极速穿透' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.2, lab: 'E · 万羽' },
      { p: 'a1a', d: 0.5, fx: 'featherstorm', hit: 3, launch: true, badge: '🪶 凌霄破虚' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.28, dx: -38 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  }
};

// Card replays follow the phase order and timings in src/game/04-ults.js.
// Shortened only where needed to fit the miniature loop; repeat hits stay
// separate so the target reacts to the actual rhythm of each ultimate.
const HERO_ULT_REPLAYS = {
  qingfeng: [
    { p: 'qf_charge', d: 0.48, lab: '纳刀 · 蓄势' },
    { p: 'qf_thrust', d: 0.24, dx: 46, fx: 'crescent', hit: 1, badge: '居合突刺' },
    { p: 'l1a', d: 0.12, hit: 1 }, { p: 'l2a', d: 0.12, hit: 1 },
    { p: 'l1a', d: 0.12, hit: 1 }, { p: 'l2a', d: 0.12, hit: 1 },
    { p: 'l1a', d: 0.12, hit: 1 }, { p: 'l2a', d: 0.12, hit: 1 },
    { p: 'jump', d: 0.16, dy: -38, lab: '残月剑气 · 追斩' },
    { p: 'hva', d: 0.32, dy: 0, hit: 3, launch: true, fx: 'crescent', badge: '终结斩' },
    { p: 'victory', d: 0.46, reset: true, lab: '剑意通明 · 收势' }
  ],
  feiying: [
    { p: 'fy_seal', d: 0.42, lab: '结印 · 入影' },
    { p: 'dash', d: 0.28, dx: 90, fx: 'shadows', badge: '瞬步近身' },
    { p: 'fy_xslash', d: 0.1, hit: 1 }, { p: 'l1a', d: 0.1, hit: 1 },
    { p: 'l2a', d: 0.1, hit: 1 }, { p: 'fy_xslash', d: 0.1, hit: 1 },
    { p: 'l1a', d: 0.1, hit: 1 }, { p: 'l2a', d: 0.1, hit: 1 },
    { p: 'fy_xslash', d: 0.1, hit: 1 }, { p: 'l1a', d: 0.1, hit: 1 },
    { p: 'fy_xslash', d: 0.25, hit: 2, launch: true, badge: '双刃终结' },
    { p: 'victory', d: 0.42, reset: true, lab: '暗影绝杀 · 收势' }
  ],
  tieshan: [
    { p: 'ts_lift', d: 0.3, lab: '擎刃 · 起跳' },
    { p: 'jump', d: 0.35, dy: -92, lab: '滞空 · 调整落点' },
    { p: 'ts_slam', d: 0.16, dy: 0, fx: 'avalanche', hit: 1, launch: true, badge: '泰山压顶' },
    { p: 'victory', d: 0.52, reset: true, lab: '地裂 · 回涌' }
  ],
  lingshuang: [
    { p: 'ls_stance', d: 0.45, lab: '拄枪 · 凝神' },
    { p: 'ls_thrust', d: 0.35, fx: 'timestop', lab: '天地停滞 · 枪影铺开' },
    { p: 'ls_thrust', d: 0.28, dx: 84, hit: 1, launch: true, badge: '寒芒贯日' },
    { p: 'ls_plant', d: 0.3, reset: true, lab: '冰封 · 收枪' }
  ],
  liuyun: [
    { p: 'ly_fanswipe', d: 0.3, lab: '展扇 · 引风' },
    { p: 'ly_hover', d: 0.32, dy: -32, fx: 'tornado', badge: '双道龙卷' },
    { p: 'ly_hover', d: 0.32, dy: -20, hit: 1, launch: true, badge: '卷入高空' },
    { p: 'victory', d: 0.42, dy: 0, reset: true, lab: '扶摇万里 · 浮空' }
  ],
  leiming: [
    { p: 'lm_kick', d: 0.18, fx: 'thunder', hit: 1, launch: true, badge: '第一道天雷' },
    { p: 'lm_boxer', d: 0.36, fx: 'thunder', hit: 1, launch: true, badge: '第二道天雷' },
    { p: 'lm_kick', d: 0.36, fx: 'thunder', hit: 1, launch: true, badge: '第三道天雷' },
    { p: 'victory', d: 0.42, reset: true, lab: '雷帝灌顶 · 收势' }
  ],
  moyu: [
    { p: 'my_stroke', d: 0.4, lab: '展纸 · 运笔' },
    { p: 'my_paint', d: 0.55, fx: 'inkdragon', lab: '全场染纸 · 符印浮现' },
    { p: 'my_paint', d: 0.24, hit: 2, launch: true, badge: '符阵引爆' },
    { p: 'victory', d: 0.46, reset: true, lab: '朱砂散尽 · 收笔' }
  ],
  yuehua: [
    { p: 'yh_lotus', d: 0.5, fx: 'moonflow', lab: '结月印 · 凝露回气' },
    { p: 'yh_lotus', d: 0.14, hit: 1, launch: true, badge: '月芒震退' },
    { p: 'victory', d: 0.38, reset: true, lab: '月魄护体 · 收势' }
  ],
  yanling: [
    { p: 'yl_wings', d: 0.34, dy: -66, lab: '展翼 · 冲上九霄' },
    { p: 'a1a', d: 0.28, dy: -66, fx: 'featherstorm', count: 7, hit: 2, launch: true, badge: '翎羽齐射' },
    { p: 'yl_wings', d: 0.28, dy: -40, fx: 'featherstorm', count: 7, hit: 2, launch: true, badge: '破甲暴雨' },
    { p: 'victory', d: 0.4, dy: 0, reset: true, lab: '凌霄破虚 · 回落' }
  ],
  yuxiao: [
    { p: 'yx_play', d: 0.3, lab: '起奏 · 广陵散' },
    { p: 'yx_push', d: 0.15, fx: 'note', badge: '音刃一' },
    { p: 'yx_play', d: 0.15, fx: 'note', badge: '音刃二' },
    { p: 'yx_push', d: 0.15, fx: 'note', badge: '音刃三' },
    { p: 'yx_play', d: 0.15, fx: 'note', badge: '音刃四' },
    { p: 'yx_push', d: 0.15, fx: 'note', badge: '音刃五' },
    { p: 'yx_play', d: 0.2, fx: 'note', badge: '音刃六' },
    { p: 'yx_push', d: 0.28, fx: 'guangling', hit: 3, launch: true, badge: '曲终绝响' },
    { p: 'yx_play', d: 0.42, reset: true, lab: '音律回满 · 曲终' }
  ],
  zuixian: [
    { p: 'zx_drink', d: 0.34, fx: 'shanshui', lab: '举酒 · 展开山水' },
    { p: 'zx_sway', d: 0.17, hit: 1, badge: '墨染一' }, { p: 'zx_drink', d: 0.17, hit: 1 },
    { p: 'zx_sway', d: 0.17, hit: 1 }, { p: 'zx_drink', d: 0.17, hit: 1 },
    { p: 'zx_sway', d: 0.17, hit: 1 }, { p: 'zx_drink', d: 0.17, hit: 1 },
    { p: 'zx_sway', d: 0.17, hit: 1 }, { p: 'zx_upper', d: 0.2, hit: 1, badge: '八重墨浪' },
    { p: 'victory', d: 0.4, reset: true, lab: '蓬莱境 · 收卷' }
  ],
  gouchen: [
    { p: 'gc_wind', d: 0.4, lab: '抡锤 · 锁定目标' },
    { p: 'gc_wind', d: 0.55, fx: 'skynet', hit: 1, badge: '巨锤砸落 · 震晕' },
    { p: 'gc_pull', d: 0.16, fx: 'magnet', lab: '扯链 · 回锤' },
    { p: 'gc_sweep', d: 0.3, hit: 2, launch: true, badge: '近身重抡' },
    { p: 'victory', d: 0.38, reset: true, lab: '震魄 · 收链' }
  ],
  lingque: [
    { p: 'du_l1s', d: 0.2, dy: -60, lab: '跃起 · 织网' },
    { p: 'du_l2a', d: 0.08, dy: -60, fx: 'needlestorm', hit: 1, badge: '悬丝一' },
    { p: 'du_l1a', d: 0.08, dy: -60, hit: 1, badge: '悬丝二' },
    { p: 'du_l2a', d: 0.08, dy: -60, hit: 1, badge: '悬丝三' },
    { p: 'du_l1a', d: 0.08, dy: -60, hit: 1, badge: '悬丝四' },
    { p: 'du_l2a', d: 0.08, dy: -60, hit: 1, badge: '悬丝五' },
    { p: 'du_l1a', d: 0.08, dy: -60, hit: 1, badge: '悬丝六' },
    { p: 'du_l2a', d: 0.12, dy: -60, hit: 1, badge: '悬丝七' },
    { p: 'l3a', d: 0.28, dy: 0, hit: 3, launch: true, badge: '终结 · 雀芒入魂' },
    { p: 'victory', d: 0.38, reset: true, lab: '悬丝归宗 · 落地' }
  ],
  liying: [
    { p: 'fy_seal', d: 0.3, lab: '结印 · 雾身齐发' },
    { p: 'fy_xslash', d: 0.16, fx: 'mistarray', badge: '雾身刀光' },
    { p: 'l1a', d: 0.14, hit: 1 }, { p: 'l2a', d: 0.14, hit: 1 },
    { p: 'dash', d: 0.3, dx: 74, fx: 'blink', lab: '瞬身 · 追至身前' },
    { p: 'l2a', d: 0.22, hit: 2, launch: true, badge: '本体补刀' },
    { p: 'victory', d: 0.36, reset: true, lab: '雾身散尽 · 收势' }
  ],
  cixian: [
    { p: 'lm_boxer', d: 0.28, fx: 'magnet', lab: '异极 · 磁石升起' },
    { p: 'victory', d: 0.5, fx: 'sandwich', lab: '双极合拢 · 吸住目标' },
    { p: 'lm_jab', d: 0.18, hit: 2, badge: '天地夹击' },
    { p: 'victory', d: 0.42, reset: true, lab: '定身 · 收势' }
  ],
  qianji: [
    { p: 'fy_seal', d: 0.25, fx: 'recallball', lab: '发条反卷 · 召回傀丸', badge: '傀丸贯穿' },
    { p: 'qf_charge', d: 0.42, lab: '傀丸疾返 · 穿身而过' },
    { p: 'spa', d: 0.22, badge: '傀丸回手' },
    { p: 'victory', d: 0.36, reset: true, lab: '傀丸回手 · 重置投丸' }
  ]
};

const HERO_FULL_DEMO = {
  liying: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1s', d: 0.07, lab: '普攻' }, { p: 'l1a', d: 0.12, dx: 10, hit: 1 },
    { p: 'l3s', d: 0.08 }, { p: 'l3a', d: 0.2, dx: 14, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.12, fx: 'mist', lab: 'Q · 留影' }, { p: 'l2a', d: 0.24, dx: 40, hit: 2, badge: '留下雾身' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.1, lab: 'R · 渡影' }, { p: 'idle', d: 0.08, fx: 'mistswap', dx: -60, badge: '换位' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.2, lab: 'E · 万影归一' }, { p: 'l3a', d: 0.45, dx: 40, fx: 'mistarray', hit: 3, launch: true, badge: '雾身齐斩' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  yuxiao: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'yx_play', d: 0.08, lab: '普攻' }, { p: 'yx_push', d: 0.12, dx: 10, hit: 1 },
    { p: 'fn_l1s', d: 0.08 }, { p: 'lca', d: 0.18, dx: 14, hit: 2, badge: '音律 +3' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yx_play', d: 0.14, lab: 'Q · 清音' }, { p: 'yx_push', d: 0.36, fx: 'note', hit: 2, launch: true, badge: '三律齐鸣' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yx_play', d: 0.4, fx: 'mirror', hit: 1, lab: 'R · 回音壁', badge: '回音' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yx_play', d: 0.2, lab: 'E · 广陵散' }, { p: 'yx_push', d: 0.45, fx: 'guangling', hit: 3, launch: true, badge: '曲终绝响' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  zuixian: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'zx_sway', d: 0.08, lab: '普攻' }, { p: 'lm_jab', d: 0.1, dx: 10, hit: 1 },
    { p: 'zx_drink', d: 0.08 }, { p: 'zx_upper', d: 0.2, dx: 12, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'zx_sway', d: 0.15, lab: 'Q · 亭中留客' }, { p: 'gc_wind', d: 0.32, fx: 'avalanche', hit: 2, badge: '飞亭砸落' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'zx_drink', d: 0.25, lab: 'R · 与民同乐' }, { p: 'gc_throw', d: 0.3, fx: 'proj', hit: 1, badge: '掷坛共饮' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'zx_drink', d: 0.2, lab: 'E · 山水之间' }, { p: 'zx_upper', d: 0.48, fx: 'shanshui', hit: 8, launch: true, badge: '全屏墨染' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  gouchen: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'gc_wind', d: 0.08, lab: '普攻' }, { p: 'gc_throw', d: 0.12, dx: 12, hit: 1 },
    { p: 'gc_pull', d: 0.08 }, { p: 'gc_sweep', d: 0.2, dx: 14, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'gc_throw', d: 0.2, fx: 'proj', lab: 'Q · 飞锤' }, { p: 'gc_pull', d: 0.3, hit: 1, badge: '震魄' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'gc_spin', d: 0.4, fx: 'spin', hit: 2, lab: 'R · 旋锤' }, { p: 'gc_throw', d: 0.25, hit: 2, badge: '击飞' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'gc_wind', d: 0.25, lab: 'E · 开天一锤' }, { p: 'gc_sweep', d: 0.42, fx: 'skynet', hit: 3, launch: true, badge: '巨锤震晕' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  cixian: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'lm_boxer', d: 0.07, lab: '普攻' }, { p: 'lm_jab', d: 0.11, dx: 8, hit: 1 },
    { p: 'l2s', d: 0.07 }, { p: 'lm_jab', d: 0.12, dx: 8, hit: 1 },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'idle', d: 0.3, fx: 'ironwall', lab: 'Q · 极性反转', badge: '⊕ ⇄ ⊖' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_boxer', d: 0.15, lab: 'R · 磁极' }, { p: 'hva', d: 0.25, fx: 'ironwall', hit: 2, launch: true, badge: '弹开' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_boxer', d: 0.15, lab: 'E · 天地磁合' }, { p: 'victory', d: 0.5, fx: 'crescent', hit: 1, badge: '夹成肉饼' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  lingque: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'du_l1s', d: 0.07, lab: '普攻' }, { p: 'du_l1a', d: 0.11, dx: 12, hit: 1 },
    { p: 'du_l2s', d: 0.07 }, { p: 'lca', d: 0.16, dx: 14, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'du_l1s', d: 0.12, lab: 'Q · 穿叶飞梭' }, { p: 'du_l1a', d: 0.24, fx: 'proj', hit: 1, badge: '雀芒印记' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'du_l1s', d: 0.08, lab: 'R · 移形换影' }, { p: 'dash', d: 0.22, dx: 45, hit: 2, launch: true, badge: '雀芒引爆' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'du_l1s', d: 0.15, lab: 'E · 万线归宗' }, { p: 'du_l2a', d: 0.45, fx: 'needlestorm', hit: 8, launch: true, badge: '全域悬丝' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  qingfeng: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1s', d: 0.08, lab: '普攻' }, { p: 'l1a', d: 0.12, dx: 10, hit: 1 },
    { p: 'l2s', d: 0.07 }, { p: 'l2a', d: 0.12, dx: 10, hit: 1 },
    { p: 'l3s', d: 0.09 }, { p: 'l3a', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.14, lab: 'Q · 疾风斩' }, { p: 'qf_thrust', d: 0.32, dx: 46, hit: 2, fx: 'gale', badge: '居合斩穴' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.14, lab: 'R · 剑气' }, { p: 'qf_thrust', d: 0.36, fx: 'swordqi', hit: 1, launch: true, badge: '掀天挑空' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.2, lab: 'E · 残月' }, { p: 'qf_thrust', d: 0.14, dx: 40, hit: 1, fx: 'crescent' },
    { p: 'l1a', d: 0.09, hit: 1 }, { p: 'l2a', d: 0.09, hit: 1 }, { p: 'hva', d: 0.3, hit: 3, launch: true, badge: '剑意通明' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  tieshan: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'gs_l1s', d: 0.1, lab: '普攻' }, { p: 'gs_l1a', d: 0.18, dx: 12, hit: 2 },
    { p: 'l2s', d: 0.08 }, { p: 'ts_slam', d: 0.24, dx: 16, hit: 3, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ts_lift', d: 0.2, lab: 'Q · 震地' }, { p: 'ts_slam', d: 0.35, hit: 2, fx: 'quake', launch: true, badge: '💥 撼地重震' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ts_lift', d: 0.14, lab: 'R · 铁壁冲' }, { p: 'ts_shoulder', d: 0.34, dx: 42, hit: 2, fx: 'ironwall', launch: true, badge: '💥 崩山破势' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ts_lift', d: 0.24, lab: 'E · 山崩' }, { p: 'ts_slam', d: 0.42, dx: 38, hit: 4, fx: 'avalanche', launch: true, badge: '💫 怒意回涌' },
    { p: 'victory', d: 0.6, reset: true }
  ],
  feiying: [
    { p: 'idle', d: 0.18, reset: true },
    { p: 'du_l1s', d: 0.05, lab: '普攻' }, { p: 'du_l1a', d: 0.09, dx: 10, hit: 1 },
    { p: 'du_l2s', d: 0.05 }, { p: 'fy_xslash', d: 0.18, dx: 14, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.14, lab: 'Q · 影遁' }, { p: 'fy_xslash', d: 0.3, dx: 50, hit: 2, fx: 'blink', badge: '🌑 背后绞杀' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.12, lab: 'R · 飞镖' }, { p: 'fy_crouch', d: 0.32, fx: 'kunai', hit: 1, badge: '极速截击' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.18, lab: 'E · 千影' }, { p: 'fy_xslash', d: 0.14, dx: 40, hit: 2, fx: 'shadows' },
    { p: 'l1a', d: 0.08, hit: 1 }, { p: 'fy_xslash', d: 0.26, hit: 3, launch: true, badge: '暗影绝杀' },
    { p: 'victory', d: 0.5, reset: true }
  ],
  liuyun: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'fn_l1s', d: 0.08, lab: '普攻' }, { p: 'fn_l1a', d: 0.1, dx: 10, hit: 1 },
    { p: 'ly_fanswipe', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ly_fanswipe', d: 0.1, lab: 'Q · 风刃' }, { p: 'idle', d: 0.35, fx: 'windblade', hit: 1, badge: '🌪️ 狂风推搡' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ly_hover', d: 0.3, dx: -40, fx: 'windstep', hit: 1, lab: 'R · 开扇', badge: '🍿 爆米花' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ly_fanswipe', d: 0.2, lab: 'E · 龙卷' }, { p: 'ly_hover', d: 0.42, fx: 'tornado', hit: 3, launch: true, badge: '🌪️ 扶摇万里' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  leiming: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'lm_boxer', d: 0.05, lab: '六连击' }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
    { p: 'lm_boxer', d: 0.05 }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
    { p: 'lm_kick', d: 0.2, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_boxer', d: 0.1, lab: 'Q · 雷闪' }, { p: 'lm_jab', d: 0.32, dx: 48, hit: 2, fx: 'thunderfist', badge: '⚡ 触电麻痹' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_kick', d: 0.16, lab: 'R · 金刚雷铠' }, { p: 'ts_slam', d: 0.36, fx: 'stomp', hit: 2, launch: true, badge: '⚡ 引雷反震' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'lm_kick', d: 0.2, lab: 'E · 雷霆万钧' }, { p: 'lm_boxer', d: 0.26, fx: 'thunder', hit: 3, launch: true, badge: '⚡ 雷帝灌顶' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  lingshuang: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'sp_l1s', d: 0.08, lab: '普攻' }, { p: 'sp_l1a', d: 0.13, dx: 14, hit: 1 },
    { p: 'sp_l2a', d: 0.12, dx: 14, hit: 1 },
    { p: 'ls_thrust', d: 0.2, dx: 18, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ls_stance', d: 0.2, dx: -22, lab: 'Q · 回马枪' }, { p: 'ls_thrust', d: 0.34, dx: 36, hit: 2, fx: 'backthrust', launch: true, badge: '枪尖穿心' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ls_stance', d: 0.12, lab: 'R · 枪旋' }, { p: 'ls_plant', d: 0.15, fx: 'spin', hit: 1 }, { p: 'ls_thrust', d: 0.24, dx: 20, hit: 2, launch: true, badge: '乾坤回旋' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'ls_stance', d: 0.22, lab: 'E · 刹那' }, { p: 'ls_thrust', d: 0.38, dx: 55, hit: 3, fx: 'timestop', launch: true, badge: '❄️ 寒芒贯日' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  moyu: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'my_stroke', d: 0.08, lab: '普攻' }, { p: 'my_paint', d: 0.13, dx: 12, hit: 1 },
    { p: 'my_stroke', d: 0.08 }, { p: 'lda', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'my_stroke', d: 0.16, lab: 'Q · 墨阵' }, { p: 'my_paint', d: 0.34, fx: 'inktrap', hit: 1, badge: '深墨禁锢' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'my_stroke', d: 0.14, lab: 'R · 画符' }, { p: 'my_paint', d: 0.36, fx: 'inkblob', hit: 1, launch: true, badge: '墨迹遮目' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'my_stroke', d: 0.18, lab: 'E · 符阵' }, { p: 'my_paint', d: 0.44, fx: 'inkdragon', hit: 3, launch: true, badge: '📜 符爆' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  yuehua: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1a', d: 0.1, dx: 10, hit: 1, lab: '普攻' }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
    { p: 'hva', d: 0.22, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yh_mirror', d: 0.22, fx: 'mirror', lab: 'Q · 月镜' }, { p: 'hva', d: 0.3, dx: 24, hit: 3, launch: true, badge: '🌙 太阴绝罚' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yh_mirror', d: 0.12, lab: 'R · 月轮' }, { p: 'l2a', d: 0.42, fx: 'moonring', hit: 2, launch: true, badge: '🌙 背袭破防' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yh_lotus', d: 0.45, fx: 'moonflow', hit: 1, lab: 'E · 月华如水', badge: '🌙 月魄霸体' },
    { p: 'victory', d: 0.55, reset: true }
  ],
  yanling: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1a', d: 0.1, dx: 10, hit: 1, lab: '普攻' }, { p: 'a1a', d: 0.2, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yl_wings', d: 0.14, lab: 'Q · 俯冲' }, { p: 'yl_dive', d: 0.34, dx: 44, hit: 2, fx: 'dive', badge: '鹰击钉地' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yl_wings', d: 0.12, lab: 'R · 翎羽' }, { p: 'a1a', d: 0.32, fx: 'feather', hit: 1, badge: '极速穿透' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'yl_wings', d: 0.18, lab: 'E · 万羽' }, { p: 'a1a', d: 0.46, fx: 'featherstorm', hit: 3, launch: true, badge: '🪶 凌霄破虚' },
    { p: 'victory', d: 0.55, reset: true }
  ]
};

const SKILL_FUN = {
  qingfeng: { passive: '师父说他悟性一般，攒气倒是一绝。', light: '五剑连刺，每一剑都在心里喊招式名。', charge: '憋了半天就为这一下，憋不住就是普通一刀。', air: '跳起来砍人，是剑客的基本修养。', skill: '一步过去，对手还没回头就定住了。', ranged: '剑气出鞘，隔空也要把你挑上天。', ult: '残月一出，月亮都得往旁边让让。', esc: '打不过就飞，这叫战术性腾空。' },
  feiying: { passive: '血条薄如纸，跑得比消息还快。', light: '刀快到连自己都看不清。', charge: '蓄力背刺，专治站桩选手。', air: '从天而降的不只有惊喜。', skill: '“我在你身后。”经典台词，屡试不爽。', ranged: '四枚飞镖，总有一枚能中。', ult: '九个分身，哪个是真的？都是。', esc: '留下一缕烟，人早溜了。' },
  tieshan: { passive: '出门从不带伞，雨点打在身上算挠痒。', light: '慢是慢了点，挨一下你就知道了。', charge: '蓄满这一刀，连地板都害怕。', air: '他能跳起来，本身就是奇迹。', skill: '砸地之前，请确认脚下不是自家院子。', ranged: '掀起通天巨浪，飞得再高也得被拍下来。', ult: '跳起来砸你，落点还能自己挑。', esc: '一百八十斤腾空，地面松了口气。' },
  lingshuang: { passive: '一寸长一寸强，贴脸了一寸也不强。', light: '枪出如龙，每一下都戳在节奏上。', charge: '一枪捅穿防御，顺便捅穿你的心态。', air: '空中挑枪，专挑跳得高的。', skill: '先退半步，是为了捅得更远。', ranged: '转起来像风车，暗器都绕道走。', ult: '时间停一下，够她把话说完。', esc: '枪往地上一撑，人就弹出去了。' },
  liuyun: { passive: '三段跳是基本操作，落地才算失误。', light: '扇子不是用来扇风的，是用来扇人的。', charge: '蓄一口大风，把人吹到地图那头。', air: '他在天上的时间比在地上多。', skill: '一扇子风刃，顺手吹散飞镖。', ranged: '后翻一下原地起风，优雅退场。', ult: '今日天气：平地龙卷，有人起飞。', esc: '风往哪吹，他就往哪飘。' },
  leiming: { passive: '出家人不打诳语，只打六连。', light: '六连重拳，数到第四下你就晕了。', charge: '蓄力一拳，阿弥陀佛。', air: '跳起来的和尚最危险。', skill: '带电冲拳，碰一下全身发麻。', ranged: '一脚跺出雷柱，邻居以为要下雨。', ult: '三道天雷，师父说这招不许在庙里用。', esc: '金刚一吼，震开一切。' },
  moyu: { passive: '画师的笔，比刀还难缠。', light: '每一笔都是真迹，挨打也算收藏。', charge: '大印落下，盖章认证“你输了”。', air: '空中挥毫，落笔即是落人。', skill: '地上画个圈，踩进去就别想走。', ranged: '一团墨泼过去，糊脸又糊眼。', ult: '画龙点睛，龙就真的飞出来了。', esc: '化作一滩墨，洗都洗不掉。' },
  yuehua: { passive: '不打架的时候会悄悄回血，很养生。', light: '双刀如月，一刀圆一刀缺。', charge: '合璧一斩，月亮都满了。', air: '月下起舞，顺便斩人。', skill: '你打过来，我就照回去，物理反弹。', ranged: '月轮会自己飞回来，像回旋镖但更贵。', ult: '月华如水，泼你一身。', esc: '踏月而退，拒绝贴贴。' },
  yanling: { passive: '恐高？不存在的。', light: '翅膀扇人，羽毛乱飞。', charge: '振翅一扑，落地像只大鹅。', air: '天上就是她的主场。', skill: '鹰击长空，专啄脑门。', ranged: '三根翎羽，一根比一根快。', ult: '漫天羽毛，下雨天记得带伞。', esc: '振翅一飞，你够不着了。' },
  yuxiao: { passive: '打人也讲节奏，三拍一小节。', light: '箫管敲头，咚咚咚，是节拍。', charge: '横扫一记，音符都震飞了。', air: '跳起来吹一个高音。', skill: '攒满三个音符再吹，伤害翻倍不是梦。', ranged: '你的暗器我收下了，原样奉还。', ult: '广陵散于今绝矣？今天再奏一遍。', esc: '一个休止符，人先撤了。' },
  zuixian: { passive: '酒量即战力，放招添酒打中添酒，东倒西歪能闪避。', light: '东倒西歪五连拳，步法虚实难测。', charge: '蓄力一撞，重若巨石倾覆。', air: '醉步腾跃，飘忽不定难预测。', skill: '亭中留客，飞亭砸落禁锢两秒任你痛揍。', ranged: '与民同乐，半壶酒掷向对手，共醉回春。', ult: '山水之间，水墨泼染全屏八段重创。', esc: '醉意腾身，踏风撤步。' },
  gouchen: { passive: '锤子拴链子，走路都叮当响。', light: '链锤甩出去，回来时小心别砸到自己。', charge: '蓄力一锤，链子都绷直了。', air: '空中甩锤，物理老师看了都说好。', skill: '“过来吧你！”一链子拽到面前。', ranged: '抡圆了转，转晕的是对手。', ult: '锤子扔上天，下来大了一号。', esc: '锤子先走，人跟着链子飞。' },
  liying: { passive: '一缕魂留在原地，碰一下就散。', light: '单刀五连，干净利落。', charge: '雾里藏着的那一刀最重。', air: '只有一段跳，跳之前先想好落点。', skill: '人往前走，魂留在后面。', ranged: '结个印，人就到了雾身那里。', ult: '雾身一起出刀，本体最后补上。', esc: '雾一散，人已退开。' },
  qianji: { passive: '玄铁傀丸击打加速，金丝在手随时护主。', light: '铜臂推掌，能把铁球打飞。', charge: '蓄力重击，傀丸化作重炮轰击。', air: '空中翻掌压地，灵动机变。', skill: '投丸驻场，球不回手绝不重复丢。', ranged: '暴雨梨花，受击亦可引爆钢针护身。', ult: '千丝收网，贯穿全场拉回重置 Q。', esc: '金丝借力，腾跃后退。' },
  cixian: { passive: '一会儿正极一会儿负极，脾气说变就变。', light: '负极一掌一吸，越打越近。', charge: '蓄满一掌，磁力把格挡都推开。', air: '跳起来拍一掌，像拍苍蝇。', skill: '红圈变蓝圈，R 也跟着刷新。', ranged: '正极弹飞，负极吸回，来回都是我说了算。', ult: '天一块地一块，中间夹着你。', esc: '磁力一托，人就飘起来了。' },
  lingque: { passive: '飞梭织悬丝，碰一下就留下印记。', light: '子母飞梭刺得比针还快。', charge: '蓄力一梭子，隔着衣服都疼。', air: '凌波踏空，身法灵巧似惊雀。', skill: '飞梭脱手，丝线连着千里之外。', ranged: '印记一亮，瞬身穿刺直接清空CD！', ult: '万线归宗，漫天悬丝罗网避无可避。', esc: '悬丝一荡，人已在数丈之外。' }
};

let cxPrev = null;   // 正在预览的皮肤（null = 用自己装备的）
