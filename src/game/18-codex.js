// ======================= 角色图鉴 =======================
let cxIdx = 0, cxActiveMove = 'full', cxDemoSpeed = 1.0;
demoLoop($id('cxDemo'), () => cxIdx, () => $id('codex').classList.contains('on'), () => (cxPrev !== null ? cxPrev : mySkin(CHARS[cxIdx].id)), () => cxActiveMove === 'full' ? null : cxActiveMove);
function statRows(c) {
  const m = CHAR_MOVES[CHAR_IDX[c.id]];
  const st = c.stat, B = BAL[c.id] || BAL.qingfeng, hp = Math.round(st.hp * B.hp), dmg = +(st.dmg * B.normal).toFixed(2);
  const rows = [
    ['生命上限', hp, 1000, `${hp}`],
    ['体量压制', st.weight || 1, 2.0, `${st.weight || 1}×`],
    ['防御减伤', st.defRating || 1, 1.25, `×${st.defRating || 1}`],
    ['格挡架势', st.guardMax || 100, 160, `${st.guardMax || 100}`],
    ['格挡稳定性', st.guardStab || 1, 2.0, `×${st.guardStab || 1}`],
    ['格挡穿透伤', Math.round((st.guardChip || 0.12) * 100), 20, `${Math.round((st.guardChip || 0.12) * 100)}%`],
    ['受击硬直', st.poise || 1, 1.25, `×${st.poise || 1}`],
    ['移动速度', WALK * st.walk, WALK * 1.2, `${Math.round(WALK * st.walk)}`],
    ['基础伤害', dmg, 1.25, `×${dmg}`],
    ['攻击距离', m.l1.box[2], 130, `${Math.round(m.l1.box[2])}`],
    ['跳跃高度', st.jump || 1, 1.2, `×${st.jump || 1}`],
    ['卡肉感', c.hitFeel || 1, 1.6, `×${c.hitFeel || 1}`],
  ];
  if (c.fly) rows.push(['飞行时间', c.fly, 3, `${c.fly} 秒`]);
  return rows;
}
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
  龙卷: ['16×16', '双龙卷浮空 · 刷新跳跃开扇'], 雷霆万钧: ['48×3', '天雷追落 · 气量回涌30%'], 符阵: ['80–280', '宣纸全图 · 按符数爆伤'], 月华如水: ['75 (+100血)', '回血霸体 · 架招重置'], 万羽: ['14×14', '羽刃天降 · 飞行重置'],
};
const PASSIVE_SHORT = { qingfeng: '攒气快 10% · 攻守均衡(870血)', feiying: '最快移速出手 · 身轻体巧(800血)', tieshan: '重斩蓄力霸体 · 气血冠绝(900血)', lingshuang: '枪尖 ×1.25 · 枪身 ×0.38(815血)',
  liuyun: '三段跳 · 御风轻盈(840血)', leiming: '普攻六连 · 强横体魄(885血)', moyu: '普攻甩墨 · 蓄力远 45% · 墨韵护体(825血)', yuehua: '3 秒未受伤每秒回 14 血(780血)', yanling: '空中按住跳跃飞 1.2 秒(750血)',
  yuxiao: '普攻攒音律，清音随音律变强(775血)', zuixian: '醉意增伤，半醉可闪避近身攻击(885血)', gouchen: '被锤中的人 1.2 秒内受伤 +25%(835血)', lingque: '子母梭挂雀芒，换影穿刺引爆重置(790血)' };
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
  lingque: '雀芒印记配合换影穿刺，瞬发引爆清空冷却',
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
  lingque: '【飞梭穿织 · 雀芒锁脉】双持子母飞梭中远贯穿高效攒气；绝技「万线归宗」漫天悬丝全屏暴风绞杀，附加雀芒并回涌重置换影！',
};
// ======================= 招式类型与克制详解 =======================
const HERO_MOVE_TYPES = {
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
    ult: { type: 'fullscreen', label: '全屏月华', rng: 'screen' },
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
const HERO_RESTRAINTS_EXPLAIN = {
  yuxiao: {
    beatsWhy: '【克 铁山、墨羽】铁山步子慢，被三律音波隔着半屏挑起来就很难近身；墨羽的泼墨和墨团撞上回音壁会原路飞回去。',
    weakWhy: '【怕 绯影、雷鸣】绯影影遁直接闪到身后，雷鸣雷闪贴脸快拳，玉箫来不及攒音律，回音壁也挡不住连续近身。'
  },
  zuixian: {
    beatsWhy: '【克 凌霜、月华】醉步身法与飞亭留客封锁中距离，贴身后凌霜的枪施展不开；月华的月镜只格近身，醉翁可掷坛共饮或飞亭砸落。',
    weakWhy: '【怕 流云、墨羽】流云风刃一直把人往外推，醉翁拳短够不着；墨羽的墨阵定住脚，近身极其艰难。'
  },
  gouchen: {
    beatsWhy: '【克 燕翎、绯影】燕翎落地就会被旋锤卷进去；绯影血薄，被飞锤拽到身前吃满震魄增伤很快就倒。',
    weakWhy: '【怕 铁山、月华】铁山霸体直接硬吃飞锤，带不动；月华月镜格开锤子后的反斩极痛。'
  },
  lingque: {
    beatsWhy: '【克 绯影、流云】飞梭与悬丝远端穿刺直克脆皮近身；移形换影高速多角穿梭令流云风刃与爆米花频频落空。',
    weakWhy: '【怕 铁山、雷鸣】铁山厚重霸体硬抗飞梭穿刺反手重震；雷鸣雷铠与电光冲拳极易在换影突进瞬间反制重击。'
  },
  qingfeng: {
    beatsWhy: '【克 墨羽】疾风斩高速穿身无视墨阵禁锢，半场剑气可对撞消融墨团，拔剑速攻直接打断挥毫。',
    weakWhy: '【怕 月华】疾风斩正面突击必触发月镜太阴绝罚反制，月华脱战凝露使青锋换血消耗优势荡然无存。'
  },
  feiying: {
    beatsWhy: '【克 流云、凌霜】影遁瞬移与背刺能无视枪尖与风压，瞬间贴身刺入安全死角，极速爆发斩灭布衣脆皮。',
    weakWhy: '【怕 铁山、月华】铁山玄铁霸体正面硬吃飞刺直接重砸崩山；月镜完美格开多段贴身短刃必被反切。'
  },
  tieshan: {
    beatsWhy: '【克 绯影、雷鸣】玄铁重甲与蓄力霸体令短手刺客与快拳无法打断起手，狂暴裂地与铁壁冲瞬间震溃对手防御。',
    weakWhy: '【怕 流云、凌霜、燕翎】步履沉重难以触及高空燕翎，常被流云远距风刃放风筝或被凌霜枪尖在中距离精准破防。'
  },
  lingshuang: {
    beatsWhy: '【克 铁山、青锋】235px极限枪尖距离在中距离完全压制铁山与青锋，枪旋可拨落远程暗器并强力击退。',
    weakWhy: '【怕 雷鸣、绯影、燕翎】绯影瞬移背刺、雷鸣贴地雷闪与燕翎空中俯冲均能轻易越过长枪有效距离，贴身即陷被动。'
  },
  liuyun: {
    beatsWhy: '【克 铁山、月华、燕翎】三段跳滞空与风刃推搡能长线放风筝折磨铁山；远距离狂风龙卷可直接破除月华静坐与燕翎滑翔。',
    weakWhy: '【怕 雷鸣、绯影】雷鸣电光雷闪霸体直穿与绯影暗影影遁瞬移，能无视风压瞬间突脸秒杀薄弱体躯。'
  },
  leiming: {
    beatsWhy: '【克 流云、凌霜】雷闪霸体冲拳直接穿过气流与枪尖阻击，六连重拳拳拳到肉，令依赖身位拉扯的对手窒息。',
    weakWhy: '【怕 铁山、月华】铁山重甲霸体正面拼拳毫不退让并反砸击倒；月华月镜架招专克高频连击拳。'
  },
  moyu: {
    beatsWhy: '【克 铁山、青锋】画地墨阵强制定身铁山使其沦为定点木桩，大面积浓墨溅射封锁正面直冲，令笨重前压寸步难行。',
    weakWhy: '【怕 绯影、雷鸣】绯影影遁闪身无视墨阵，雷闪贴地冲拳极快，常在泼墨后摇期间直取中宫斩杀。'
  },
  yuehua: {
    beatsWhy: '【克 雷鸣、绯影、青锋、燕翎】太阴月镜能格开一切正面突进与下落扑击并自动绝罚反斩，折返月轮彻底切断贴身路线。',
    weakWhy: '【怕 流云、墨羽】流云接天龙卷风刃与墨羽远距离泼墨全屏覆盖且不触发近战月镜反制，被远程持续消耗压制。'
  },
  yanling: {
    beatsWhy: '【克 铁山、凌霜】超长时间自由滞空飞翔完全避开地面震地与一线枪芒，居高临下俯冲猎杀直取破绽。',
    weakWhy: '【怕 流云、月华】流云扶摇龙卷将高空飞行强行打落，月华月镜太阴护体与月轮折返有效拦截俯冲。'
  }
};
// ======================= 全真打击数据与时序 =======================
// 招式卡片的名字、标签、伤害说明。冷却不写在这里：图鉴和选人页直接读 SKILLS[..].cd 和 escCD，免得两边数字对不上
const HERO_HIT_DETAILS = {
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
    skill: { name: '亭中留客', badge: '禁锢 1.5s', badgeCls: 'badge-stun', dmg: '20', desc: '召唤醉翁亭从空中砸落，将对手困在亭中 1.5 秒任由宰割，霸体可硬抗。' },
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
  lingque: {
    light: { name: '飞梭快影连刺', badge: '✦ 飞梭速刺', badgeCls: 'badge-buff', dmg: '93.1 (5段)', desc: '子母梭双持穿刺连击，出手灵巧如惊雀掠空。' },
    charge: { name: '梭芒贯日蓄斩', badge: '💥 破防突刺', badgeCls: 'badge-break', dmg: '34.6 / 55.7', desc: '悬丝真气贯注双梭猛刺，强行贯通正面格挡。' },
    air: { name: '凌波空刺·掠地', badge: '✦ 空中回旋', badgeCls: 'badge-buff', dmg: '17.3 / 25', desc: '空中旋身飞梭点刺，二段凌波斜下掠击。' },
    skill: { name: '穿叶飞梭', badge: '✦ 雀芒印记 3.5s', badgeCls: 'badge-stun', dmg: '30', desc: '掷出牵丝子母梭贯穿前方，命中施加3.5秒雀芒印记。' },
    ranged: { name: '移形换影', badge: '✦ 雀芒引爆', badgeCls: 'badge-buff', dmg: '34 (+38爆伤)', desc: '化作流光追着对手飞过去穿刺（最多追 0.8 秒），只有腾空闪这类无敌身法躲得开；穿透已带印记者引爆真气并瞬间刷新冷却！' },
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

const HERO_FULL_DEMO = {
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
  lingque: { passive: '飞梭织悬丝，碰一下就留下印记。', light: '子母飞梭刺得比针还快。', charge: '蓄力一梭子，隔着衣服都疼。', air: '凌波踏空，身法灵巧似惊雀。', skill: '飞梭脱手，丝线连着千里之外。', ranged: '印记一亮，瞬身穿刺直接清空CD！', ult: '万线归宗，漫天悬丝罗网避无可避。', esc: '悬丝一荡，人已在数丈之外。' }
};

let cxPrev = null;   // 正在预览的皮肤（null = 用自己装备的）
function renderCodex() {
  const c = CHARS[cxIdx], m = CHAR_MOVES[cxIdx], S = SKILLS[c.skill], S2 = SKILLS[c.skill2], U = ULTS[c.ult];
  const skin = cxPrev !== null ? cxPrev : mySkin(c.id);
  const L = skinLook(cxIdx, skin);
  const col = `rgb(${L.slash})`;
  $id('cxTabs').innerHTML = CHARS.map((x, i) => `<button class="${i === cxIdx ? 'sel' : ''}" data-i="${i}" style="${i === cxIdx ? '' : `color:rgb(${x.look.slash})`} ">${x.name}</button>`).join('');
  const cv2 = $id('cxCard'), g = cv2.getContext && cv2.getContext('2d');
  if (g) { g.clearRect(0, 0, cv2.width, cv2.height); g.drawImage(makeCardArt(cxIdx, cv2.width, cv2.height, skin), 0, 0); }
  if (cv2) {
    cv2.style.boxShadow = `0 16px 48px ${col.replace('rgb', 'rgba').replace(')', ',0.35)')}`;
    cv2.style.borderColor = col;
  }
  const rar = CHAR_RARITY[c.id], own = ownsHero(c.id), free = heroesFree() || (PROF.rotation || []).includes(c.id);
  const skMeta = skin && SKINS[skin], skG = skMeta && skinGrade(skin);
  const skPill = skMeta ? `<span class="pill sk-pill" style="--tc:${skG.c}">${skG.n} · ${skMeta.name}</span>` : '';
  $id('cxName').innerHTML = `<div class="nm" style="color:${col}">${c.name}</div><div class="pills">${skPill}<span class="pill">${c.role}</span><span class="pill" style="color:rgb(${RAR_RGB[rar]})">${RAR_NAME[rar]}</span><span class="pill">${own ? '已拥有' : heroesFree() ? '限时免费' : free ? '本周限免' : '未拥有'}</span><span class="pill">难度 ${'●'.repeat(c.diff)}${'○'.repeat(3 - c.diff)}</span>${balNote(c.id) ? `<span class="pill" title="按电脑对打的胜率调过强度；招式说明里写的伤害是调整前的数">平衡 · ${balNote(c.id)}</span>` : ''}</div>`;
  const skList = Object.entries(SKINS).filter(([k, v]) => v.char === c.id);
  const skScn = skMeta && SCENES[skin];
  const skDesc = skMeta ? `<span style="font-size:12px;color:var(--dim);margin-left:6px">（${skMeta.rarity === 'legend' ? '✨' : '🌟'}<span>${skMeta.rarity === 'legend' ? '专属全景天象与奥义特效' : '专属灵光天色与命中特效'}</span>）</span>` : '';
  $id('cxSkinT').innerHTML = (cxPrev !== null && cxPrev !== mySkin(c.id) ? '皮肤 · 预览中' : '皮肤装束') + skDesc;

  const C_CORE = window.ArmoryCore;
  const isWukuKey = k => (C_CORE && C_CORE.CS_KEYS && C_CORE.CS_KEYS.includes(k)) || (SKINS[k] && SKINS[k].cs);
  const bdSkins = skList.filter(([k]) => !isWukuKey(k)).sort((a, b) => skinWeight(a[0]) - skinWeight(b[0]));
  const wkSkins = skList.filter(([k]) => isWukuKey(k)).sort((a, b) => skinWeight(a[0]) - skinWeight(b[0]));

  const renderSkinBtn = ([k, v]) => {
    const has = skinOwned(k), g = skinGrade(k);
    const lockHint = v.exclusive ? ' · 青锋行 / 武库' : ' · 武库';
    return `<button data-sk="${k}" class="sk-g${skin === k ? ' sel' : ''}${has ? '' : ' lock'}" style="--tc:${g.c}" title="${g.n}"><i class="sk-dot"></i>${v.name}${has ? ((PROF.skins || []).includes(k) || OFFLINE_BUILD ? '' : ' · 限免') : lockHint}</button>`;
  };

  const defaultBtn = `<button data-sk="" class="${skin ? '' : 'sel'}">默认</button>`;
  const bdHtml = defaultBtn + bdSkins.map(renderSkinBtn).join('');
  const wkHtml = wkSkins.length ? wkSkins.map(renderSkinBtn).join('') : uiState('empty', '暂无武库饰品', 'cx-skin-empty');

  $id('cxSkins').innerHTML = `
    <div class="cx-skin-row">
      <div class="cx-skin-row-hd"><span class="cx-skin-tag tag-bd">绑定装束</span></div>
      <div class="cx-skin-row-btns">${bdHtml}</div>
    </div>
    <div class="cx-skin-row">
      <div class="cx-skin-row-hd"><span class="cx-skin-tag tag-wk">武库饰品</span></div>
      <div class="cx-skin-row-btns">${wkHtml}</div>
    </div>
  `;
  $id('cxStats').innerHTML = statRows(c).map(([n, v, max, t]) => `<div class="st"><span>${n}</span><div class="bar"><i style="width:${Math.round(clamp(v / max, 0.05, 1) * 100)}%;background:${col}"></i></div><span class="v">${t}</span></div>`).join('');
  const lk = c.id === 'leiming' ? ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'] : ['l1', 'l2', 'l3', 'l4', 'l5'];
  const bn = (BAL[c.id] || BAL.qingfeng).normal, dv = d => Math.round(d * bn * 10) / 10;   // 普攻、蓄力、空中按强度调整后的数
  const sum = Math.round(lk.reduce((a, k) => a + m[k].dmg, 0) * bn * 10) / 10;
  const fun = (typeof SKILL_FUN !== 'undefined' && SKILL_FUN[c.id]) || {};
  const sh = n => { const p = (n || '').split('·'); return p.length > 1 ? [p[0].trim(), p[1].trim()] : ['', n || '']; };
  const nm = ids => ids.map(id => CHARS[CHAR_IDX[id]].name).join(' ');
  const tile = (icon, label, val, desc, cd, wide, moveKey, half) => {
    const hit = (moveKey && HERO_HIT_DETAILS[c.id] && HERO_HIT_DETAILS[c.id][moveKey]) || null;
    const mType = (moveKey && mTypes[moveKey]) || null;
    const rng = (mType && mType.rng) || (moveKey === 'ult' ? 'screen' : moveKey === 'air' ? 'air' : 'melee');
    const mini = moveKey ? `<div class="card-mini-win" data-rng="${rng}"><canvas class="card-mini-cv" data-mv="${moveKey}"></canvas><span class="mini-tag">${hit ? hit.badge : val}</span></div>` : '';
    const f = moveKey && fun[moveKey];
    return `<div class="tile t-m${half ? ' half' : wide ? ' wide' : ''}${moveKey ? ' t-has-demo' : ''}${moveKey && cxActiveMove === moveKey ? ' active-demo' : ''}" ${moveKey ? `data-move="${moveKey}" title="点击在主视窗慢放/演示该招式"` : ''}><div class="th">${ic(icon, col)}<span class="tl">${label}</span></div>${mini}${val ? `<div class="tv">${val}</div>` : ''}<div class="td">${desc}</div>${f ? `<div class="tf">“${f}”</div>` : ''}${cd ? `<span class="cd">${cd}</span>` : ''}</div>`;
  };
  const mTypes = HERO_MOVE_TYPES[c.id] || {};
  const lType = mTypes.light || { label: '近战', type: 'melee', rng: 'melee' };
  const cType = mTypes.charge || { label: '近战', type: 'melee', rng: 'melee' };
  const aType = mTypes.air || { label: '近战', type: 'melee', rng: 'melee' };
  const qType = mTypes.skill || { label: '技能', icon: 'skill', type: 'melee', rng: 'melee' };
  const rType = mTypes.ranged || { label: '远程', icon: 'ranged', type: 'ranged', rng: 'ranged' };
  const uType = mTypes.ult || { label: '奥义', type: 'fullscreen', rng: 'screen' };
  const restr = HERO_RESTRAINTS_EXPLAIN[c.id] || { beatsWhy: `克 ${nm(c.beats)}`, weakWhy: `怕 ${nm(c.weakTo)}` };
  const qName = (skin && skinSkillName(skin, 1)) || S.name;
  const rName = (skin && skinSkillName(skin, 2)) || S2.name;
  const uName = (skin && skinUltName(skin)) || U.name;
  $id('cxMoves').innerHTML = [
    tile('passive', `被动 · ${c.passiveName}`, '', PASSIVE_SHORT[c.id] || '', '', true),
    tile('light', `左键 · 连击 <small class="type-tag ${lType.type}">${lType.label}</small>`, sum, `${lk.length} 段 · 末段击飞${c.inkShot ? ` · 另有墨团 ${lk.length}×${INK_DMG}` : ''}`, '', false, 'light'),
    tile('charge', `按住左键 · 蓄力 <small class="type-tag ${cType.type}">${cType.label}</small>`, `${dv(m.cs1.dmg)} / ${dv(m.cs2.dmg)}`, '满蓄破防 · 打倒', '', false, 'charge'),
    tile('air', `空中 <small class="type-tag ${aType.type}">${aType.label}</small>`, `${dv(m.a1.dmg)} / ${dv(m.a2.dmg)}`, '空中斩 · 下砸', '', false, 'air'),
    tile(qType.icon || 'skill', `Q · ${qName} <small class="type-tag ${qType.type}">${qType.label}</small>`, sh(S.name)[0], sh(S.name)[1], `${S.cd}s`, false, 'skill'),
    tile(rType.icon || 'ranged', `左键+右键 · ${rName} <small class="type-tag ${rType.type}">${rType.label}</small>`, sh(S2.name)[0], sh(S2.name)[1], `${S2.cd}s`, false, 'ranged'),
    tile('ult', `E · ${uName} <small class="type-tag ${uType.type}">${uType.label}</small>`, sh(U.name)[0], `${sh(U.name)[1]}<div style="margin-top:4px;font-size:12px;color:#ffe8a3;line-height:1.35;opacity:0.95">${HERO_METER_EXPLAIN[c.id] || ''}</div>`, '气满', true, 'ult'),
    tile('esc', '右键 · 腾空闪', `${c.escCD || BREAK_CD}s`, '解除受制 · 落地前无敌', '', false, 'esc'),
    tile('chronicle', '宿命篇章 · 试炼与秘传', '', `<div style="font-size:12.5px;line-height:1.55;color:var(--dim);word-break:keep-all;overflow-wrap:break-word">${(() => {
      const chIdx = CHAPTERS.findIndex(chap => chap.boss === c.id);
      if (chIdx < 0) {
        return `<b>青锋传 · 月下起意</b><br>青锋行打通第三章「剑冢」，斩落剑魔，即可领悟绝学并解锁专属传说皮肤「青锋行」。`;
      }
      const ch = CHAPTERS[chIdx];
      const rSkinKey = ({ tieshan: 'ts_bronze', liuyun: 'ly_dusk', lingshuang: 'ls_plum', feiying: 'fy_jade', leiming: 'lm_violet', yanling: 'yl_raven', yuehua: 'yh_sakura', moyu: 'my_cinnabar', yuxiao: 'yx_snow', zuixian: 'zx_amber', gouchen: 'gc_crimson' })[c.id];
      const rSkin = rSkinKey && SKINS[rSkinKey];
      const skinHas = (PROF.skins || []).includes(rSkinKey) || OFFLINE_BUILD;
      const stars = (STAGE_STARS && STAGE_STARS[`${chIdx + 1}.5`]) || 0;
      const clear = stars > 0;
      return `<b style="color:#efe8d8">第 ${chIdx + 1} 章 · ${ch.name}</b>（守关：${c.name} · 难度：${LV_NAME[ch.lv]}）<br>通关破关：${clear ? `<span style="color:#7fe0b0">已破关 (★${stars})</span>` : '<span style="color:#e9c46a">未破关</span>'} · 专属皮肤：${rSkin ? `<span style="color:rgb(${RAR_RGB[rSkin.rarity] || '239,232,216'})">「${rSkin.name}」</span>（${skinHas ? '<span style="color:#7fe0b0">已获得</span>' : '破关解锁'}）` : '无'}<div style="margin-top:6px"><button type="button" class="ghost small cx-go-stage" data-c="${chIdx}" style="padding:2px 10px;font-size:12px;border-radius:4px;color:var(--gold);border-color:rgba(233,196,106,.4);cursor:pointer">⚔️ 前往第 ${chIdx + 1} 章试炼</button></div>`;
    })()}${typeof sagaCodexLine === 'function' ? sagaCodexLine(c.id) : ''}</div>`, '', true),
    ADV_SHORT[c.id] ? tile('adv', '进阶技巧', '', ADV_SHORT[c.id], '', false, null, true) : '',
    tile('vs', '克制机理详解', '', `<div class="vs-explain"><div class="vs-line beats" style="color:#7fe0b0;margin-bottom:3px">${restr.beatsWhy}</div><div class="vs-line weaks" style="color:#ff8a8a">${restr.weakWhy}</div></div>`, '', true, null, !!ADV_SHORT[c.id]),
  ].filter(Boolean).join('');
  for (const el of document.querySelectorAll('#cxBento .ic[data-ic]')) el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.dataset.ic] || ICONS.skill}</svg>`;
  if ($id('cxBento')) $id('cxBento').style.setProperty('--cx-accent', col);
  startCodexCardsDirector();
}

let cxCardsRAF = null;
function startCodexCardsDirector() {
  if (cxCardsRAF) return;
  let lastT = performance.now();
  const tick = now => {
    if (!$id('codex') || !$id('codex').classList.contains('on')) {
      cxCardsRAF = null;
      return;
    }
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const cvs = document.querySelectorAll('#cxMoves .card-mini-cv');
    const c = CHARS[cxIdx];
    if (c) {
      const skin = cxPrev !== null ? cxPrev : mySkin(c.id);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const cv of cvs) {
        const mv = cv.dataset.mv;
        if (!mv || !HERO_MOVE_SEQS[c.id] || !HERO_MOVE_SEQS[c.id][mv]) continue;
        let p = cv._pup;
        if (!p || p.chIdx !== cxIdx || p.skin !== skin || cv._mv !== mv) {
          p = new Puppet(cxIdx, skin);
          p.playSeq(HERO_MOVE_SEQS[c.id][mv], null, true);
          cv._pup = p;
          cv._mv = mv;
        }
        p.update(dt);
        const g = cv.getContext && cv.getContext('2d');
        if (g) {
          const cw = cv._w || (cv._w = cv.clientWidth || 160);
          const chh = cv._h || (cv._h = cv.clientHeight || 76);
          if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(chh * dpr)) {
            cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
          }
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.fillStyle = '#0a0b18';
          g.fillRect(0, 0, cw, chh);
          g.fillStyle = 'rgba(200,180,255,0.08)'; g.fillRect(0, chh * 0.84, cw, 1);
          p.draw(g, cw, chh, chh / 180, true);
        }
      }
    }
    cxCardsRAF = requestAnimationFrame(tick);
  };
  cxCardsRAF = requestAnimationFrame(tick);
}

$id('cxMoves').addEventListener('click', e => {
  const sagaBtn = e.target.closest('.cx-go-saga');
  if (sagaBtn) { sagaPick = sagaBtn.dataset.h; openScreen('saga'); SFX.slice && SFX.slice(); return; }
  const stageBtn = e.target.closest('.cx-go-stage');
  if (stageBtn) {
    const ch = +stageBtn.dataset.c;
    stageCh = ch;
    openScreen('stage');
    renderStages();
    SFX.slice && SFX.slice();
    return;
  }
  const tile = e.target.closest('.tile[data-move]');
  if (!tile) return;
  const m = tile.dataset.move;
  cxActiveMove = m;
  for (const t of $id('cxMoves').querySelectorAll('.tile')) t.classList.remove('active-demo');
  tile.classList.add('active-demo');
  for (const btn of $id('cxDemoTabs').querySelectorAll('button')) btn.classList.toggle('sel', btn.dataset.m === m);
  const demoCanvas = $id('cxDemo');
  if (demoCanvas && demoCanvas._pup) {
    const ch = CHARS[cxIdx];
    if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][m]) {
      demoCanvas._pup.playSeq(HERO_MOVE_SEQS[ch.id][m], null, true);
    }
    SFX.slice();
  }
});

const demoTabsEl = $id('cxDemoTabs');
if (demoTabsEl) {
  demoTabsEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-m]');
    if (!btn) return;
    const m = btn.dataset.m;
    cxActiveMove = m;
    for (const b of demoTabsEl.querySelectorAll('button')) b.classList.remove('sel');
    btn.classList.add('sel');
    for (const t of $id('cxMoves').querySelectorAll('.tile')) t.classList.toggle('active-demo', t.dataset.move === m);
    const demoCanvas = $id('cxDemo');
    if (demoCanvas && demoCanvas._pup) {
      const ch = CHARS[cxIdx];
      if (m === 'full' || m === 'all') {
        demoCanvas._pup.playSeq(HERO_FULL_DEMO[ch.id] || DEMO2, null, true);
      } else if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][m]) {
        demoCanvas._pup.playSeq(HERO_MOVE_SEQS[ch.id][m], null, true);
      }
      SFX.slice();
    }
  });
}

const demoSpdEl = $id('cxDemoSpd');
if (demoSpdEl) {
  demoSpdEl.addEventListener('click', () => {
    cxDemoSpeed = cxDemoSpeed === 1.0 ? 0.5 : 1.0;
    demoSpdEl.textContent = cxDemoSpeed === 0.5 ? '原速 1.0x' : '慢放 0.5x';
    demoSpdEl.classList.toggle('sel', cxDemoSpeed === 0.5);
    SFX.slice && SFX.slice();
  });
}

function openCodex() {
  cxPrev = null;
  cxActiveMove = 'full';
  if ($id('cxDemoTabs')) {
    for (const b of $id('cxDemoTabs').querySelectorAll('button')) b.classList.toggle('sel', b.dataset.m === 'full' || b.dataset.m === 'all');
  }
  renderCodex();
}
window.openCodex = openCodex;
$id('cxSkins').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const sk = b.dataset.sk || '';
  const id = CHARS[cxIdx].id;
  const has = skinOwned(sk);
  if (!has) {
    cxPrev = sk; renderCodex(); SFX.slice();
    toast('还没有这款皮肤，先给你看看');
    return;
  }
  cxPrev = null;
  PROF.equip = PROF.equip || {};
  PROF.equip[id] = sk;   // 点“默认”记成空串：自动选皮肤不再替这个角色换
  try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (err) {}
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
  applyProfile(PROF);
  renderCodex();
  SFX.slice();
  toast(sk ? `已装配「${SKINS[sk].name}」` : '已换回原本装束');
});
$id('cxTabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) {
    cxIdx = +b.dataset.i;
    cxPrev = null;
    cxActiveMove = 'full';
    if ($id('cxDemoTabs')) {
      for (const btn of $id('cxDemoTabs').querySelectorAll('button')) btn.classList.toggle('sel', btn.dataset.m === 'full' || btn.dataset.m === 'all');
    }
    renderCodex();
    SFX.slice();
  }
});

