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
