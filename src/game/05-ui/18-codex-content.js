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
  金丝回环: ['24', '限距往返 · 击打改向'], 穿丝急袭: ['48', '沿朝穿击 · 受击解控'], 机轮三穿: ['120上限', '全场三穿 · 回手刷新 Q']
};
const PASSIVE_SHORT = { qingfeng: '攒气快 10% · 攻守均衡(870血)', feiying: '最快移速出手 · 身轻体巧(800血)', tieshan: '重斩蓄力霸体 · 气血冠绝(900血)', lingshuang: '枪尖 ×1.25 · 枪身 ×0.38(815血)',
  liuyun: '三段跳 · 御风轻盈(840血)', leiming: '普攻六连 · 强横体魄(885血)', moyu: '普攻甩墨 · 蓄力远 45% · 墨韵护体(825血)', yuehua: '3 秒未受伤每秒回 14 血(780血)', yanling: '空中按住跳跃飞 1.2 秒(750血)',
  yuxiao: '普攻攒音律，清音随音律变强(775血)', zuixian: '醉意增伤，半醉可闪避近身攻击(885血)', gouchen: '被锤中的人 1.2 秒内受伤 +25%(835血)', lingque: '子母梭挂雀芒，换影穿刺引爆重置(790血)',
  liying: '最多 10 个雾身，内功波削防崩势 · 破影引爆(815血)', cixian: '开局随机正负极，负极普攻最多 15 连(815血)', qianji: '金丝傀丸限距往返，击打改向并加速(830血)' };
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
  qianji: '击打傀丸改向加速，受击时可按 R 穿丝解控',
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
  qianji: '【机关机栝 · 动能汇聚】金丝约束傀丸往返回环，普攻与蓄力击打可改向加速；R 穿丝急袭能在受击时解控，E 机轮三穿横扫全场并收回傀丸。',
};
// ======================= 招式类型详解 =======================
const HERO_MOVE_TYPES = {
  qianji: {
    light: { type: 'melee', label: '铜手推掌', rng: 'melee' },
    charge: { type: 'melee', label: '近战', rng: 'melee' },
    air: { type: 'melee', label: '近战', rng: 'melee' },
    skill: { type: 'proj', label: '金丝回环', rng: 'ranged', icon: 'skill' },
    ranged: { type: 'proj', label: '穿丝急袭', rng: 'ranged', icon: 'melee' },
    ult: { type: 'fullscreen', label: '机轮三穿', rng: 'screen' },
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
    skill: { name: '金丝回环', badge: '✦ 限距往返', badgeCls: 'badge-buff', dmg: '24', desc: '沿朝向放出傀丸，在有限距离内持续往返；普攻与蓄力击打可改向并短暂加速。' },
    ranged: { name: '穿丝急袭', badge: '🛡️ 受击可放', badgeCls: 'badge-break', dmg: '48', desc: '傀丸沿当前朝向高速穿击，随后回到往返环；受击硬直或浮空时可强制解控。' },
    ult: { name: '机轮三穿', badge: '✦ 三次全场穿击', badgeCls: 'badge-stun', dmg: '120上限', desc: '傀丸疾驰横穿战场三次，再沿金丝回手；每名敌人最多承受 120 点伤害，回手后刷新 Q。' },
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
    ranged: { name: '金刚·雷铠', badge: '⚡ 引雷反震 50', badgeCls: 'badge-stun', dmg: '50', desc: '架起金刚雷铠0.55秒，贴身攻击引雷反击，受雷击者快速起身；远程及雾身攻击不触发。' },
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
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'qf_charge', d: 0.15, lab: 'Q · 金丝回环' }, { p: 'l1a', d: 0.3, fx: 'proj', hit: 1, badge: '限距往返' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.2, lab: 'R · 穿丝急袭' }, { p: 'hva', d: 0.25, fx: 'ironwall', hit: 1, launch: true, badge: '傀丸穿击' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.15, lab: 'E · 机轮三穿' }, { p: 'victory', d: 0.5, fx: 'crescent', hit: 3, badge: '三穿回手' }, { p: 'idle', d: 0.35, reset: true }],
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
    { p: 'fy_seal', d: 0.25, fx: 'geartriple', lab: '机轮三穿 · 横扫战场', badge: '三次穿击' },
    { p: 'qf_charge', d: 0.42, lab: '傀丸疾返 · 穿身而过' },
    { p: 'spa', d: 0.22, badge: '傀丸回手' },
    { p: 'victory', d: 0.36, reset: true, lab: '三穿归一 · 傀丸回手' }
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
  ],
  qianji: [
    { p: 'idle', d: 0.2, reset: true },
    { p: 'l1s', d: 0.07, lab: '铜手连推' }, { p: 'l1a', d: 0.11, dx: 10, hit: 1 },
    { p: 'l2s', d: 0.07 }, { p: 'l3a', d: 0.18, dx: 16, hit: 2, launch: true },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'qf_charge', d: 0.15, lab: 'Q · 金丝回环' }, { p: 'l1a', d: 0.3, fx: 'proj', hit: 1, badge: '限距往返' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.2, lab: 'R · 穿丝急袭' }, { p: 'hva', d: 0.25, fx: 'ironwall', hit: 1, launch: true, badge: '傀丸穿击' },
    { p: 'idle', d: 0.25, reset: true },
    { p: 'fy_seal', d: 0.2, lab: 'E · 机轮三穿' }, { p: 'victory', d: 0.48, fx: 'geartriple', hit: 3, badge: '三穿回手' },
    { p: 'victory', d: 0.5, reset: true }
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
  qianji: { passive: '金丝约束傀丸往返回环，击打可改向加速。', light: '铜臂推掌，击中傀丸就能改向传动。', charge: '蓄力重击，让傀丸短暂高速穿行。', air: '空中翻掌，能将傀丸击向新方向。', skill: '金丝回环，限距往返持续施压。', ranged: '穿丝急袭，沿朝穿击并受击解控。', ult: '机轮三穿，三次横扫后回手重置 Q。', esc: '金丝借力，腾跃后退。' },
  cixian: { passive: '一会儿正极一会儿负极，脾气说变就变。', light: '负极一掌一吸，越打越近。', charge: '蓄满一掌，磁力把格挡都推开。', air: '跳起来拍一掌，像拍苍蝇。', skill: '红圈变蓝圈，R 也跟着刷新。', ranged: '正极弹飞，负极吸回，来回都是我说了算。', ult: '天一块地一块，中间夹着你。', esc: '磁力一托，人就飘起来了。' },
  lingque: { passive: '飞梭织悬丝，碰一下就留下印记。', light: '子母飞梭刺得比针还快。', charge: '蓄力一梭子，隔着衣服都疼。', air: '凌波踏空，身法灵巧似惊雀。', skill: '飞梭脱手，丝线连着千里之外。', ranged: '印记一亮，瞬身穿刺直接清空CD！', ult: '万线归宗，漫天悬丝罗网避无可避。', esc: '悬丝一荡，人已在数丈之外。' }
};

// ======================= 扩展 20 位侠客专属图鉴内容与全套动画脚本 =======================
Object.assign(PASSIVE_SHORT, {
  chixiao: '重击蓄力霸体 · 烈焰突刺与炎轮点燃对手(860血)',
  youhuang: '移速灵巧 · 毒针迟缓与回纹绞带拉拽控制(790血)',
  xuanji: '三臂星规控距 · 星火压制与重力场削减架势(810血)',
  polang: '沧澜重锚霸体 · 震锚削防与冲锋撞飞(920血)',
  cangming: '寒渊重剑霸体 · 霜气迟缓与裂魂破防挑空(875血)',
  qingluan: '翠羽济世回春 · 清风击退迟缓与近身护体(805血)',
  xuanwu: '玄甲不动霸体 · 冲撞削防与镇岳壁垒回势(940血)',
  chiyan: '焚心烈拳连打 · 冲拳升龙附带持续烈焰灼烧(845血)',
  yinhu: '幻月狐踪极速 · 穿身强化与空中十字双刃连切(785血)',
  yunhe: '仙鹤凌云御风 · 展翅齐射仙羽与云岚回血(800血)',
  tiangang: '天罡铁壁长枪 · 霸体长驱破阵与震枪横扫(915血)',
  mojie: '断魂墨敕控场 · 墨阵禁锢与追踪墨符压制(810血)',
  baihe: '霜华映剑凝霜 · 寒江贯刺减速与霜镜弹反(830血)',
  jinpeng: '扶摇金翼制空 · 俯冲罡风与三道裂空金羽(825血)',
  youming: '噬影潜行突袭 · 暗影掠杀与幽影锁链拘魂(790血)',
  lingxi: '心有灵犀音律 · 扩张音环减速与余音弹反震晕(805血)',
  bawang: '霸王重甲撼岳 · 霸体裂地破防与楚歌气浪减速(935血)',
  fengling: '听风铃语轻灵 · 双风刃压制与风铃回血弹反(795血)',
  wuya: '无涯剑意居合 · 按鞘瞬闪拔刀与踏虚无敌斩影(835血)',
  danqing: '丹青妙笔绘卷 · 朱砂远波迟缓与青绿画阵定身(815血)',
});

Object.assign(ADV_SHORT, {
  chixiao: 'Q 烈焰突刺近身点燃后，立刻接 R 炎轮扫荡挑空追击',
  youhuang: '先用 Q 毒针减速，再甩 R 回纹缠带将对手拽回身前打连段',
  xuanji: 'R 天枢重力把敌人拉进中距削防后，接 Q 星规流火精准补伤',
  polang: '先用 R 破浪霸体突进贴脸，落地立刻接 Q 怒涛震锚破防挑飞',
  cangming: 'Q 寒渊斩近身重斩并挂寒霜迟缓，再以 R 裂魂斩蓄势破防浮空',
  qingluan: '中距用 Q 翠羽清风控场拉扯，被贴身时用 R 鸾羽回春震退回血',
  xuanwu: '先开 R 镇岳壁垒拿霸体与架势回复，再用 Q 玄甲冲撞顶飞对手',
  chiyan: 'Q 烈焰冲拳突入点燃后，顺势接 R 烬火升龙勾拳追空连打',
  yinhu: 'Q 狐步幻移穿身绕后强化下一击，立刻接 R 幻月双斩打出爆发',
  yunhe: '利用 Q 鹤翼凌空齐射仙羽抢先手，被反打时开 R 云岚沐羽稳血线',
  tiangang: 'Q 破阵长驱远端削防，对手反扑时用 R 铁壁震枪霸体横扫挑飞',
  mojie: '先用 Q 断魂墨缚禁锢走位，再用 R 镇魂敕符远程追踪压制',
  baihe: 'R 霜华凝镜弹反暗器并震退减速，再接 Q 寒江贯虹极速穿刺',
  jinpeng: '中远距用 R 扶摇罡风压制跳跃，抓住破绽以 Q 金鹏裂空俯冲收割',
  youming: 'R 幽冥拘魂把远敌拉至身前减速，立刻接 Q 噬影掠杀十字穿斩',
  lingxi: 'Q 灵犀音波远距扩张减速，对手近身或出暗器时用 R 余音震魄反制',
  bawang: '先用 R 楚歌震军震退减速，再接 Q 霸王裂地霸体劈落瓦解防线',
  fengling: 'Q 清铃拂风双风刃保持安全距离，被压制时用 R 和风祈愿回血反推',
  wuya: 'R 踏虚斩影借短暂无敌躲招挑空，再以 Q 无涯居合瞬闪收尾',
  danqing: '先用 R 青绿封卷定身困敌，接 Q 朱砂画弧远程气波连环压制',
});

Object.assign(HERO_METER_EXPLAIN, {
  chixiao: '【火耙炙魂 · 灼烧积怒】三齿火耙重击霸体换血与持续点燃稳定攒气；奥义「炽霄焚天」六连火星连斩接跃起火耙重劈。',
  youhuang: '【绞带控距 · 连抽蓄势】毒针远程牵制与回纹绞带拉拽连击快速充能；奥义「千缕重叠」七连绞带鞭抽接坠锤终结。',
  xuanji: '【星枢牵引 · 刻线聚元】星规流火与重力力场持续削防攒气；奥义「星宿归元」循星轨六连斩后合拢三臂重击。',
  polang: '【重锚抗压 · 破浪蓄怒】高体量重锚霸体承伤与震锚破防高效聚气；奥义「沧海倾覆」五记重锚连砸接双钩覆海。',
  cangming: '【寒渊重剑 · 断渊蓄威】重剑霸体硬扛与寒波减速稳步蓄能；奥义「冥蚀断渊」五道幽蓝霜剑连环破防并裂地终结。',
  qingluan: '【翠羽灵风 · 绵延聚气】远程清风拉扯与回春续航持久作战；奥义「鸾鸣九霄」六道清风扇影连扫接鸾鸣风爆。',
  xuanwu: '【玄甲承伤 · 镇岳积威】顶级气血与玄甲壁垒承伤攒气极快；奥义「玄武镇岳」四记撼岳重锤连震后泰山压顶。',
  chiyan: '【烈焰连拳 · 灼心暴怒】高频烈拳与灼烧伤害迅速拉满怒气；奥义「焚天乱舞」八记疾风烈焰连拳接赤焰爆裂冲拳。',
  yinhu: '【狐步瞬影 · 疾刃充能】极速连段与穿身背袭高速攒气；奥义「九尾绝影」九道银月残影疾斩接交叉封喉。',
  yunhe: '【御风仙羽 · 凌云蓄势】制空仙羽穿透与云岚续航稳健充能；奥义「鹤舞九天」六道云岚羽芒凌空连击接九天俯冲。',
  tiangang: '【长驱破阵 · 铁壁蓄锋】超长枪芒贯穿与霸体抗压高效攒气；奥义「天罡破军」五道金戈枪芒贯杀接天罡坠世。',
  mojie: '【断魂敕墨 · 阵法聚元】墨缚禁锢与追踪墨符持续压制积怒；奥义「绝墨魂卷」在目标所在层布阵，先定身削减架势，再引爆画阵。',
  baihe: '【霜镜凝华 · 寒江聚锋】霜镜弹反暗器与寒江贯刺灵动攒气；奥义「冰河奔涌」六道清霜剑影连斩接冰封江面。',
  jinpeng: '【裂空金羽 · 扶摇蓄势】三羽远程消耗与俯冲突袭迅猛积怒；奥义「鹏程万里」七道裂空罡风撕扯接大鹏压顶。',
  youming: '【暗影锁魂 · 永夜积煞】拘魂拉拽接双镰掠杀极速充能；奥义「永夜绝斩」八道幽冥双镰瞬息交错接噬影断魂。',
  lingxi: '【灵犀音环 · 余音聚气】音环远程穿透与余音弹反稳步蓄能；奥义「心音幻境」四圈音波粉碎敌方飞行物、削减架势并迟缓敌人，同时为附近队友充能。',
  bawang: '【霸王悍勇 · 裂地积威】重甲霸体换血与震军气浪高效充能；奥义「力拔山兮」五记雷霆重劈接力拔山河压垮敌军。',
  fengling: '【清铃和风 · 轻灵充能】双风刃安全消耗与风铃回血弹反稳健攒气；奥义「万铃和鸣」六道和风刃影连斩接万铃共振。',
  wuya: '【无涯剑心 · 居合积势】踏虚闪避与疾闪居合节奏明快；奥义「剑气无涯」七道银月居合连闪接万道剑气爆发。',
  danqing: '【丹青点墨 · 画卷聚意】远程朱砂气波与青绿封卷控场攒气；奥义「千里江山」在目标所在层依次掀起三重墨浪挑飞敌人。',
});

(() => {
  const EXP_HEROES = [
    ['chixiao', 'rk', '三齿火耙连挑', '烈焰重耙', '凌空火耙', '烈焰突刺', '炎轮扫荡', '炽霄焚天', '火耙腾跃', 'dash', 'mid', 'gale', 'quake', 'avalanche', '点燃灼烧', '炎轮挑空', '六连火耙重劈', '火耙不是农具，烧起来比刀还烫。', '三齿齐出，火星子能点亮整条街。'],
    ['youhuang', 'dl', '绞带连抽', '坠锤重甩', '空甩绞带', '幽篁毒针', '回纹缠带', '千缕重叠', '绞带借力', 'ranged', 'ranged', 'kunai', 'proj', 'shadows', '淬药减速', '绞带拉拽', '七连抽击重砸', '染坊出来的带子，甩在身上顺带染色。', '别躲，三枚细针总有一枚认得你。'],
    ['xuanji', 'sg', '星规弧斩', '三臂合击', '凌空测影', '星规流火', '天枢重力', '星宿归元', '星轨撤步', 'ranged', 'trap', 'proj', 'inktrap', 'timestop', '星火穿刺', '重力削防', '六连星轨合击', '他打架前先量距离，误差不超过半寸。', '星规一合，重力场里谁都跑不快。'],
    ['polang', 'an', '重锚沉砸', '沧澜蓄锚', '高空坠锚', '怒涛震锚', '破浪突进', '沧海倾覆', '锚链腾跃', 'mid', 'dash', 'quake', 'ironwall', 'avalanche', '震锚挑飞', '霸体撞飞', '五连重锚覆海', '两百斤的救生锚，救船也顺便救对手清醒。', '别跳了，浪打过来站都站不稳。'],
    ['cangming', 'ab', '寒渊重剑五斩', '霜渊蓄劈', '凌空霜斩', '寒渊斩', '裂魂斩', '冥蚀断渊', '渊雪撤步', 'mid', 'melee', 'swordqi', 'quake', 'crescent', '寒波迟缓', '破防挑空', '五道幽蓝断渊', '重剑无锋，但寒气已经透进骨头里了。', '接完寒渊斩再接裂魂斩，脚都不沾地。'],
    ['qingluan', 'jf', '翠羽扇舞', '青鸾蓄风', '御风轻扇', '翠羽清风', '鸾羽回春', '鸾鸣九霄', '翠羽腾空', 'ranged', 'counter', 'windblade', 'moonflow', 'tornado', '清风迟缓', '回春震退', '六道鸾风扫荡', '医扇既能救人，也能把人扇出三丈远。', '别急着贴脸，回春扇一震你就飞了。'],
    ['xuanwu', 'bs', '玄甲重盾砸', '镇岳蓄撞', '凌空龟甲压', '玄甲冲撞', '镇岳壁垒', '玄武镇岳', '玄甲腾跃', 'dash', 'counter', 'ironwall', 'mirror', 'avalanche', '霸体撞飞', '壁垒回势', '四记撼岳重锤', '玄武龟甲敲起来咚咚响，震麻的是你的手。', '开起镇岳壁垒，你先打完一套我再动。'],
    ['chiyan', 'bg', '烈焰连拳', '赤焰重炮', '空坠火拳', '烈焰冲拳', '烬火升龙', '焚天乱舞', '炎步后撤', 'dash', 'melee', 'thunderfist', 'quake', 'thunder', '烈焰灼烧', '升龙挑空', '八连赤焰轰击', '拳套自带火炉，冬天打架最暖和。', '先冲拳再升龙，火候刚刚好。'],
    ['yinhu', 'fd', '银狐双匕连刺', '幻月蓄刺', '空翻狐刃', '狐步幻移', '幻月双斩', '九尾绝影', '狐步遁影', 'dash', 'melee', 'blink', 'shadows', 'shadows', '穿身强化', '十字连切', '九道银月绝影', '银狐出手前，你看到的只是上一秒的影子。', '九尾残影齐出，数清之前胜负已分。'],
    ['yunhe', 'cw', '仙羽清拂', '云翼蓄掠', '凌云翔击', '鹤翼凌空', '云岚沐羽', '鹤舞九天', '鹤翼腾空', 'dash', 'counter', 'feather', 'moonflow', 'featherstorm', '双羽穿刺', '云岚回血', '六道羽芒俯冲', '云鹤在天上盘旋，地面上的招式全扑空。', '打完一套顺手回口血，优雅得很。'],
    ['tiangang', 'gp', '天罡长枪连刺', '金戈蓄刺', '凌空点枪', '破阵长驱', '铁壁震枪', '天罡破军', '持枪退步', 'dash', 'counter', 'backthrust', 'spin', 'timestop', '霸体破防', '铁壁挑飞', '五道金戈贯杀', '一杆天罡枪立在阵前，千军万马都得绕道。', '红缨一抖，枪尖已经抵到眉心。'],
    ['mojie', 'sb', '断魂墨毫五式', '魂笔重印', '凌空书敕', '断魂墨缚', '镇魂敕符', '绝墨魂卷', '墨影撤步', 'trap', 'ranged', 'inktrap', 'inkblob', 'inkdragon', '墨阵禁锢', '追踪墨符', '绝墨判魂大阵', '一笔定生死，画完这卷就送你上路。', '脚下的墨圈别乱踩，踩进去可拔不出脚。'],
    ['baihe', 'fr', '霜华细剑连刺', '寒芒蓄刺', '冰河空刺', '寒江贯虹', '霜华凝镜', '冰河奔涌', '踏霜撤步', 'dash', 'counter', 'gale', 'mirror', 'timestop', '贯刺减速', '霜镜弹反', '六道清霜冰封', '剑身细如冰棱，出手快得连霜花都追不上。', '暗器飞过来？霜镜原路奉还。'],
    ['jinpeng', 'rw', '金翼疾掠连击', '金爪蓄扑', '苍穹展翅', '金鹏裂空', '扶摇罡风', '鹏程万里', '振翼腾空', 'dash', 'ranged', 'dive', 'feather', 'featherstorm', '俯冲罡风', '三羽裂空', '七道罡风压顶', '大鹏一日同风起，俯冲下来地都抖三抖。', '三道金羽封走位，天上地下无处可逃。'],
    ['youming', 'rs', '幽冥双镰连割', '噬魂蓄镰', '空旋冥镰', '噬影掠杀', '幽冥拘魂', '永夜绝斩', '幽雾遁身', 'dash', 'ranged', 'blink', 'proj', 'shadows', '暗影穿斩', '锁链拘魂', '八道永夜绝斩', '双镰划过不留血，只留一团散不去的幽雾。', '跑远了？幽影锁链把你乖乖请回来。'],
    ['lingxi', 'sf', '灵犀玉笛连点', '清音蓄扫', '凌空吹笛', '灵犀音波', '余音震魄', '心音幻境', '踏音后撤', 'ranged', 'counter', 'note', 'mirror', 'guangling', '音环减速', '余音震晕', '四重音波结界', '一曲灵犀吹罢，对手连招式节拍都乱了。', '笛声听着柔和，震在架势上可一点不客气。'],
    ['bawang', 'ob', '霸王重刃连劈', '撼山蓄劈', '凌空断岳', '霸王裂地', '楚歌震军', '力拔山兮', '重甲后撤', 'mid', 'mid', 'quake', 'ironwall', 'avalanche', '裂地挑飞', '怒吼减速', '五记雷霆重劈', '力拔山兮气盖世，重刃落下谁敢硬接？', '一声楚歌震军，方圆三丈都得矮三分。'],
    ['fengling', 'cf', '素扇清铃舞', '和风蓄扇', '踏风轻掠', '清铃拂风', '和风祈愿', '万铃和鸣', '听风撤步', 'ranged', 'counter', 'windblade', 'moonflow', 'tornado', '双风刃击退', '祈愿回血', '六道和风共振', '风铃叮当一响，双道清风已经吹到脸上。', '别看扇子小，吹退强敌顺带回血两不误。'],
    ['wuya', 'ib', '无涯快刀五斩', '纳鞘蓄居合', '凌空拔刀', '无涯居合', '踏虚斩影', '剑气无涯', '踏虚瞬撤', 'dash', 'dash', 'gale', 'swordqi', 'crescent', '瞬闪居合', '无敌弯月', '七道银月剑气', '刀未出鞘，胜负已在按鞘的一瞬注定。', '踏虚闪过你的大招，反手就是一道弯月。'],
    ['danqing', 'vb', '丹青五韵连画', '朱砂重笔', '凌空点彩', '朱砂画弧', '青绿封卷', '千里江山', '踏墨退避', 'ranged', 'trap', 'inkblob', 'inktrap', 'shanshui', '朱砂减速', '画阵定身', '三座墨峰画浪', '挥毫泼出千里江山，顺便把对手裱进画里。', '朱砂勾轮廓，青绿封退路，妥妥一幅名画。'],
  ];
  for (const [id, pfx, lName, cName, aName, qName, rName, eName, escName, qType, rType, qFx, rFx, eFx, qTag, rTag, eTag, fun1, fun2] of EXP_HEROES) {
    const s1 = pfx + '_l1s', a1 = pfx + '_l1a', s2 = pfx + '_l2s', a2 = pfx + '_l2a';
    HERO_MOVE_TYPES[id] = {
      light: { type: 'melee', label: '近战连招', rng: 'melee' },
      charge: { type: 'melee', label: '蓄力破防', rng: 'melee' },
      air: { type: 'air', label: '空中连击', rng: 'air' },
      skill: { type: qType, label: qTag, rng: qType === 'ranged' ? 'ranged' : 'mid', icon: qType === 'ranged' ? 'ranged' : qType === 'trap' ? 'magic_trap' : 'melee' },
      ranged: { type: rType, label: rTag, rng: rType === 'ranged' ? 'ranged' : 'mid', icon: rType === 'counter' ? 'shield_bash' : rType === 'trap' ? 'magic_trap' : rType === 'ranged' ? 'ranged' : 'melee' },
      ult: { type: 'fullscreen', label: eTag, rng: 'screen' },
      esc: { type: 'esc', label: '身法' }
    };
    HERO_HIT_DETAILS[id] = {
      light: { name: lName, badge: '✦ 专属兵器连段', badgeCls: 'badge-buff', dmg: '5段连击', desc: `${lName}，以专属兵器轨迹连环压制，末段击飞。` },
      charge: { name: cName, badge: '💥 破防打倒', badgeCls: 'badge-break', dmg: '满蓄破防', desc: `长按蓄力施展${cName}，正面击穿防御并打倒对手。` },
      air: { name: aName, badge: '🌪️ 空中压制', badgeCls: 'badge-buff', dmg: '空中2段', desc: `跃起施展${aName}，灵活衔接空中追击与下压。` },
      skill: { name: qName, badge: `⚡ ${qTag}`, badgeCls: 'badge-stun', dmg: 'Q 技能', desc: `施展${qName}，${qTag}并创造连段节奏。` },
      ranged: { name: rName, badge: `✦ ${rTag}`, badgeCls: 'badge-break', dmg: 'R 绝技', desc: `施展${rName}，${rTag}扭转战局。` },
      ult: { name: eName, badge: `✦ ${eTag}`, badgeCls: 'badge-stun', dmg: '终极奥义', desc: `气满爆发「${eName}」，${eTag}重创对手。` },
      esc: { name: escName, badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空后撤位移，落地前无敌。' }
    };
    HERO_MOVE_SEQS[id] = {
      light: [
        { p: 'idle', d: 0.1, reset: true },
        { p: s1, d: 0.08, lab: lName }, { p: a1, d: 0.13, dx: 12, hit: 1 },
        { p: s2, d: 0.08 }, { p: a2, d: 0.13, dx: 14, hit: 1 },
        { p: s1, d: 0.08 }, { p: a2, d: 0.22, dx: 18, hit: 2, launch: true, badge: '末段击飞' },
        { p: 'idle', d: 0.32, reset: true }
      ],
      charge: [
        { p: 'idle', d: 0.1, reset: true },
        { p: 'charge', d: 0.42, lab: cName },
        { p: a2, d: 0.3, dx: 34, hit: 3, launch: true, badge: '💥 破防打倒' },
        { p: 'idle', d: 0.32, reset: true }
      ],
      air: [
        { p: 'idle', d: 0.1, reset: true },
        { p: 'jump', d: 0.16, dy: -46, lab: aName },
        { p: a1, d: 0.16, dy: -42, hit: 1 },
        { p: a2, d: 0.24, dy: 0, hit: 2, launch: true },
        { p: 'idle', d: 0.32, reset: true }
      ],
      skill: [
        { p: 'idle', d: 0.1, reset: true },
        { p: s1, d: 0.14, lab: `Q · ${qName}` },
        { p: a1, d: 0.34, dx: qType === 'dash' ? 48 : 18, hit: 2, fx: qFx, launch: qType === 'mid', badge: qTag },
        { p: 'idle', d: 0.32, reset: true }
      ],
      ranged: [
        { p: 'idle', d: 0.1, reset: true },
        { p: s2, d: 0.14, lab: `R · ${rName}` },
        { p: a2, d: 0.36, dx: rType === 'dash' ? 44 : 14, hit: 2, fx: rFx, launch: true, badge: rTag },
        { p: 'idle', d: 0.32, reset: true }
      ],
      ult: [
        { p: 'idle', d: 0.1, reset: true },
        { p: s1, d: 0.2, lab: `E · ${eName}` },
        { p: a1, d: 0.16, dx: 42, hit: 1, fx: eFx },
        { p: a2, d: 0.14, hit: 1 },
        { p: a1, d: 0.14, hit: 1 },
        { p: a2, d: 0.32, hit: 3, launch: true, fx: eFx, badge: eTag },
        { p: 'victory', d: 0.45, reset: true }
      ],
      esc: [
        { p: 'idle', d: 0.1, reset: true },
        { p: 'jump', d: 0.14, lab: `右键 · ${escName}` },
        { p: 'bdash', d: 0.3, dx: -36, badge: escName },
        { p: 'idle', d: 0.32, reset: true }
      ]
    };
    HERO_ULT_REPLAYS[id] = [
      { p: s1, d: 0.36, lab: `${eName} · 蓄势` },
      { p: 'dash', d: 0.22, dx: 54, fx: eFx, badge: '疾驰突进' },
      { p: a1, d: 0.12, hit: 1 }, { p: a2, d: 0.12, hit: 1 },
      { p: a1, d: 0.12, hit: 1 }, { p: a2, d: 0.12, hit: 1 },
      { p: s2, d: 0.16, dy: -32, lab: `${eTag} · 终结` },
      { p: a2, d: 0.32, dy: 0, hit: 3, launch: true, fx: eFx, badge: eTag },
      { p: 'victory', d: 0.42, reset: true, lab: `${eName} · 收势` }
    ];
    HERO_FULL_DEMO[id] = [
      { p: 'idle', d: 0.18, reset: true },
      { p: s1, d: 0.08, lab: lName }, { p: a1, d: 0.12, dx: 12, hit: 1 },
      { p: s2, d: 0.08 }, { p: a2, d: 0.2, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.22, reset: true },
      { p: s1, d: 0.14, lab: `Q · ${qName}` }, { p: a1, d: 0.32, dx: qType === 'dash' ? 44 : 16, hit: 2, fx: qFx, badge: qTag },
      { p: 'idle', d: 0.22, reset: true },
      { p: s2, d: 0.14, lab: `R · ${rName}` }, { p: a2, d: 0.34, dx: rType === 'dash' ? 40 : 14, hit: 2, fx: rFx, launch: true, badge: rTag },
      { p: 'idle', d: 0.22, reset: true },
      { p: s1, d: 0.2, lab: `E · ${eName}` }, { p: a1, d: 0.14, dx: 42, hit: 1, fx: eFx },
      { p: a2, d: 0.12, hit: 1 }, { p: a2, d: 0.32, hit: 3, launch: true, fx: eFx, badge: eTag },
      { p: 'victory', d: 0.5, reset: true }
    ];
    SKILL_FUN[id] = {
      passive: fun1,
      light: `${lName}，每一式都带着独门兵器的劲道。`,
      charge: `蓄满${cName}，格挡在它面前像纸一样薄。`,
      air: `凌空使出${aName}，制空追击一气呵成。`,
      skill: fun2,
      ranged: `${rName}一出，${rTag}让对手措手不及。`,
      ult: `气满施展「${eName}」，${eTag}定乾坤。`,
      esc: `${escName}顺势抽身，化险为夷。`
    };
  }
})();

let cxPrev = null;   // 正在预览的皮肤（null = 用自己装备的）
