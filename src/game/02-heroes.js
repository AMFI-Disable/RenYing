// ======================= 招式 =======================
const MOVES = {
  l1: { p: ['l1s', 'l1a'], su: .075, ac: .07, rc: .17, dmg: 14, kb: [170, 0], stun: .32, hs: .055, box: [8, -112, 82, -28], lunge: 150, next: { light: 'l2', heavy: 'hv' }, snd: 'swing' },
  l2: { p: ['l2s', 'l2a'], su: .07, ac: .07, rc: .18, dmg: 15, kb: [170, 0], stun: .32, hs: .055, box: [8, -108, 84, -36], lunge: 160, next: { light: 'l3', heavy: 'hv' }, snd: 'swing' },
  l3: { p: ['lcs', 'lca'], su: .075, ac: .075, rc: .18, dmg: 18, kb: [170, 0], stun: .34, hs: .06, box: [8, -96, 90, -10], lunge: 170, next: { light: 'l4', heavy: 'hv' }, snd: 'swing' },
  l4: { p: ['lds', 'lda'], su: .09, ac: .08, rc: .2, dmg: 22, kb: [180, 0], stun: .36, hs: .07, box: [6, -120, 92, -8], lunge: 180, next: { light: 'l5', heavy: 'hv' }, snd: 'heavy' },
  l6: { p: ['l1s', 'l1a'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .32, hs: .05, box: [8, -112, 82, -28], lunge: 120, next: { light: 'l7' }, snd: 'swing' },
  l7: { p: ['l2s', 'l2a'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .32, hs: .05, box: [8, -108, 84, -36], lunge: 120, next: { light: 'l8' }, snd: 'swing' },
  l8: { p: ['lcs', 'lca'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .32, hs: .05, box: [8, -96, 90, -10], lunge: 120, next: { light: 'l9' }, snd: 'swing' },
  l9: { p: ['lds', 'lda'], su: .07, ac: .07, rc: .17, dmg: 10, kb: [110, 0], stun: .34, hs: .06, box: [6, -120, 92, -8], lunge: 120, next: { light: 'l10' }, snd: 'swing' },
  l10: { p: ['l3s', 'l3a'], su: .09, ac: .08, rc: .24, dmg: 12, kb: [520, -260], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 260, launch: true, next: {}, snd: 'heavy' },
  l5: { p: ['l3s', 'l3a'], su: .1, ac: .09, rc: .28, dmg: 28, kb: [560, -240], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 300, launch: true, next: {}, snd: 'heavy' },
  hv: { p: ['hvs', 'hva'], su: .14, ac: .09, rc: .3, dmg: 38, kb: [80, -1020], stun: .6, hs: .11, box: [0, -150, 84, -8], lunge: 130, launch: true, jumpCancel: true, next: {}, snd: 'heavy' },
  a1: { p: ['a1s', 'a1a'], air: true, su: .06, ac: .09, rc: .14, dmg: 18, kb: [150, -430], stun: .4, hs: .065, box: [0, -84, 86, 6], next: { light: 'a2' }, snd: 'swing' },
  cs1: { p: ['charge', 'spa'], su: .04, ac: .12, rc: .06, knock: true, dmg: 36, kb: [620, -300], stun: .5, hs: .12, box: [0, -112, 112, -18], lunge: 900, launch: true, next: {}, snd: 'heavy' },
  cs2: { p: ['charge', 'spa'], su: .04, ac: .16, rc: .08, knock: true, dmg: 58, kb: [720, -720], stun: .6, hs: .2, box: [0, -120, 124, -10], lunge: 1350, launch: true, unblockable: true, big: true, next: {}, snd: 'heavy' },
  cf: { p: ['hvs', 'hva'], su: .05, ac: .1, rc: .26, dmg: 22, kb: [320, -420], stun: .45, hs: .08, box: [-6, -160, 104, -6], track: true, launch: true, next: {}, snd: 'swing' },
  a2: { p: ['a2s', 'a2a'], air: true, su: .08, ac: .09, rc: .22, dmg: 26, kb: [240, 1000], stun: .5, hs: .11, box: [-4, -70, 80, 24], spike: true, next: {}, snd: 'heavy' },
  dl: { p: ['fy_crouch', 'fy_crouch'], su: .055, ac: .06, rc: .12, dmg: 5, kb: [45, 0], stun: .28, hs: .03, box: [12, -45, 82, 0], lunge: 60, next: { light: 'l1', heavy: 'hv' }, hitNext: { light: 'l1', heavy: 'hv' }, snd: 'swing' },
};
const FINAL = { ult: true, noScale: true, dmg: 85, kb: [520, -900], stun: .6, hs: .24, launch: true, unblockable: true };
const SP_SLASH = { ult: true, noScale: true, dmg: 16, kb: [0, 0], stun: .3, hs: .035, unblockable: true, hold: true };

// ======================= 角色 =======================
// 全英雄基础属性与战斗配置（严格遵循英雄设定）
// 强度：伤害（普攻 normal、技能 skill、大招 ult）、冷却 cd、气血 hp 的倍率。
// 用 tools/ai-arena.mjs 在五个难度各打同级对局（每个难度 864 场，每个侠客 144 场），按各侠客的平均胜率迭代五轮，取最后三轮的几何平均：
// 调之前各侠客平均胜率 28%~91%，调之后 47%~56%。铁山原来九成胜率，削得最多；它的大招“山崩”正中能回满气量连放，单独多削一些。
const BAL = {
  qingfeng: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  feiying: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  tieshan: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  lingshuang: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  liuyun: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  leiming: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  moyu: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  yuehua: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  yanling: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  yuxiao: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  zuixian: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  gouchen: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
  lingque: { normal: 1.0, skill: 1.0, ult: 1.0, cd: 1.0, hp: 1.0 },
};
const balOf = f => (f && f.ch && BAL[f.ch.id]) || BAL.qingfeng;
function balDmg(att, m) { const b = balOf(att); return m.ult ? b.ult : (m.sk || (!m.isProj && att.state === 'skill')) ? b.skill : b.normal; }
// 图鉴里标出强度调整（招式说明里写的伤害是调整前的数）
function balNote(id) {
  const b = BAL[id], x = v => `×${+v.toFixed(2)}`; if (!b) return '';
  if (b.normal === b.skill && b.skill === b.ult && b.ult === b.hp) return b.hp === 1 ? '' : `伤害与气血 ${x(b.hp)}`;
  const out = [b.normal === b.skill ? `伤害 ${x(b.normal)}` : `普攻 ${x(b.normal)}`];
  if (b.normal !== b.skill) out.push(`技能${b.ult === b.skill ? '与大招' : ''} ${x(b.skill)}`);
  if (b.ult !== b.skill) out.push(`大招 ${x(b.ult)}`);
  out.push(`气血 ${x(b.hp)}`);
  return out.join(' · ');
}

// stat：hp 生命，walk 移速倍率，speed 出招时间倍率（越小越快），dmg 伤害倍率，reach 攻击距离倍率
// skill 是 Q 技能，ult 是 E 大招，passive 是被动。beats/weakTo 只是给玩家看的克制关系说明。
const CHARS = [
  { id: 'qingfeng', name: '青锋', role: '游龙剑客', diff: 1, escCD: 8.0, skill: 'gale', skill2: 'swordqi', ult: 'crescent', passive: 'meter',
    passiveName: '剑意', passiveDesc: '剑意流转，聚气比常人快 10%。体量身法均称（1.02），剑气与疾风斩攻守自如。',
    stat: { hp: 510, walk: 1.02, speed: 0.96, dmg: 1.04, reach: 1.02, swing: 0.95, jump: 1, weight: 1.02, defRating: 1.02, guardMax: 105, guardStab: 1.10, guardChip: 0.09, guardRegen: 30, poise: 0.95, size: 1.00 }, meterMul: 1.10, hitFeel: 1,
    look: { body: '#e9eef6', shade: '#9aa6bd', outline: '#070914', outlineA: 1, scarf: '#46d3ea', slash: '120,230,255', blade: '#effcff', head: 'topknot', weapon: 'sword' },
    ai: { range: [70, 170] }, beats: ['moyu'], weakTo: ['yuehua'] },
  { id: 'feiying', name: '绯影', role: '暗影刺客', diff: 2, escCD: 8.0, skill: 'blink', skill2: 'kunai', ult: 'shadows', passive: 'swift',
    passiveName: '身轻', passiveDesc: '身法最快、出手最疾，体格轻巧（0.82）且气血充实（470）。架势耐力韧性提升（95/9%微伤），身手矫捷，唯有以疾速、背刺与影遁分身取胜。',
    stat: { hp: 470, walk: 1.18, speed: 0.82, dmg: 1.12, reach: 0.96, swing: 0.78, jump: 1.08, weight: 0.82, defRating: 0.98, guardMax: 95, guardStab: 1.05, guardChip: 0.09, guardRegen: 28, poise: 1.00, size: 0.88 }, hitFeel: 0.8,
    moveMods: { l1: { dmgAbs: 14 }, l2: { dmgAbs: 15 }, l3: { dmgAbs: 17 }, l4: { dmgAbs: 20 }, l5: { dmgAbs: 26 } },
    look: { body: '#2d2336', shade: '#1b1422', outline: '#ff4a5f', outlineA: .85, scarf: '#ff3b52', slash: '255,95,115', blade: '#ffe6ea', head: 'hood', weapon: 'dual' },
    ai: { range: [60, 150] }, beats: ['liuyun', 'lingshuang'], weakTo: ['tieshan', 'yuehua'] },
  { id: 'tieshan', name: '铁山', role: '玄铁重甲', diff: 1, escCD: 8.5, skill: 'quake', skill2: 'ironwall', ult: 'avalanche', passive: 'armor',
    passiveName: '霸体', passiveDesc: '玄铁重甲冠绝群雄，气血深厚（530），体量威严（1.35）。重斩与蓄力斩自带霸体减伤20%，巨刃沉身格挡稳健（115架势/8%微伤），刚猛沉稳。',
    stat: { hp: 530, walk: 0.82, speed: 1.15, dmg: 0.96, reach: 1.08, swing: 1.15, jump: 0.9, weight: 1.35, defRating: 1.05, guardMax: 115, guardStab: 1.30, guardChip: 0.08, guardRegen: 28, poise: 0.90, size: 1.10 }, hitFeel: 1.55,
    moveMods: { l1: { suAdd: 0.1 } },   // 巨刃第一刀先举起、顿 0.1 秒再砍下来
    look: { body: '#6b6f7a', shade: '#44474f', outline: '#0c0c10', outlineA: 1, scarf: '#d9a441', slash: '255,200,120', blade: '#dcdfe6', head: 'helm', weapon: 'greatsword' },
    ai: { range: [70, 160] }, beats: ['feiying', 'leiming'], weakTo: ['liuyun', 'lingshuang', 'yanling'] },
  { id: 'lingshuang', name: '凌霜', role: '寒枪骁将', diff: 2, escCD: 8.0, skill: 'backthrust', skill2: 'spin', ult: 'timestop', passive: 'tip',
    passiveName: '枪尖', passiveDesc: '枪走一线：枪尖命中增伤 25% 且一挑冲天。枪长步稳（1.05体量），枪旋可拨开暗器并保持中线绝对压制。',
    stat: { hp: 480, walk: 0.98, speed: 1.05, dmg: 1.00, reach: 1.28, swing: 1.08, jump: 1, weight: 1.05, defRating: 1.02, guardMax: 110, guardStab: 1.20, guardChip: 0.08, guardRegen: 28, poise: 0.95, size: 1.02 }, hitFeel: 1.15,
    look: { body: '#dfe9f2', shade: '#8ea3b8', outline: '#0a1422', outlineA: 1, scarf: '#9fd4ff', slash: '170,220,255', blade: '#e8f6ff', head: 'ponytail', weapon: 'spear' },
    ai: { range: [90, 185] }, beats: ['tieshan', 'qingfeng'], weakTo: ['leiming', 'feiying', 'yanling'] },
  { id: 'liuyun', name: '流云', role: '御风散人', diff: 2, escCD: 8.0, skill: 'windblade', skill2: 'windstep', ult: 'tornado', passive: 'float',
    passiveName: '御风', passiveDesc: '御风而行，三段跳与开扇疾冲来去自如；龙卷自平地而起卷敌浮空。折扇迎风架势大幅强化（112架势/7%微穿透），身法飘忽制胜。',
    stat: { hp: 495, walk: 1.15, speed: 0.85, dmg: 1.18, reach: 1.06, swing: 0.90, jump: 1.08, weight: 0.88, defRating: 1.02, guardMax: 112, guardStab: 1.15, guardChip: 0.07, guardRegen: 32, poise: 0.95, size: 0.98 }, jumps: 3, hitFeel: 0.9,
    look: { body: '#e8f3ea', shade: '#9cb8a4', outline: '#0b1a12', outlineA: 1, scarf: '#7fe0b0', slash: '150,255,200', blade: '#f0fff6', head: 'bun', weapon: 'fan' },
    ai: { range: [180, 360] }, beats: ['tieshan', 'yuehua', 'yanling'], weakTo: ['leiming', 'feiying'] },
  { id: 'leiming', name: '雷鸣', role: '雷拳武僧', diff: 1, escCD: 8.0, skill: 'thunderfist', skill2: 'stomp', ult: 'thunder', passive: 'chain',
    passiveName: '连环', passiveDesc: '六连重拳如惊雷，金刚体魄筋骨强横（520血/1.22体量）；架势耐力深厚且回涌较快（32/秒），金刚雷铠御守引雷反击，防守沉稳转守为攻。',
    stat: { hp: 520, walk: 1.14, speed: 0.70, dmg: 0.94, reach: 0.8, swing: 0.64, jump: 1, weight: 1.22, defRating: 1.02, guardMax: 115, guardStab: 1.25, guardChip: 0.07, guardRegen: 32, poise: 0.90, size: 1.05 }, scaling: 0.04, hitFeel: 0.8,
    moveMods: { l1: { dmgAbs: 19 }, l2: { dmgAbs: 19 }, l3: { dmgAbs: 20 }, l4: { dmgAbs: 20 }, l5: { dmgAbs: 22, kb: [110, 0], launch: false, lunge: 110, next: { light: 'l6', heavy: 'hv' } },
      l6: { p: ['l3s', 'l3a'], su: .09, ac: .08, rc: .24, dmgAbs: 32, kb: [520, -260], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 260, launch: true, next: {}, snd: 'heavy' } },   // 六连重拳，第六拳收尾挑飞
    look: { body: '#3a2a22', shade: '#241913', outline: '#ffd84a', outlineA: .8, scarf: '#ffcf3a', slash: '255,230,120', blade: '#fff4c0', head: 'band', weapon: 'fists' },
    ai: { range: [45, 120] }, beats: ['liuyun', 'lingshuang'], weakTo: ['tieshan', 'yuehua'] },
  { id: 'moyu', name: '墨羽', role: '泼墨画师', diff: 3, escCD: 8.5, skill: 'inktrap', skill2: 'inksplash', ult: 'inkdragon', passive: 'brush',
    passiveName: '笔锋', passiveDesc: '墨韵宗师宗风深沉（1.10体量），墨阵定身强行封锁走位；墨水屏障加持架势耐力（115），蓄力挥洒自如，更有【墨韵护体】减免重创，专破铁山等钝重武夫。',
    stat: { hp: 485, walk: 1.02, speed: 0.90, dmg: 1.08, reach: 1.15, swing: 0.95, jump: 1.02, weight: 1.10, defRating: 1.02, guardMax: 115, guardStab: 1.18, guardChip: 0.07, guardRegen: 32, poise: 0.92, size: 1.00 }, hitFeel: 1.05,
    moveMods: { l1: { dmgAbs: 15 }, l2: { dmgAbs: 15 }, l3: { dmgAbs: 17 }, l4: { dmgAbs: 17 }, l5: { dmgAbs: 22 }, cs1: { reachMul: 1.45 }, cs2: { reachMul: 1.45 } }, inkShot: true,
    look: { body: '#1c1c22', shade: '#101014', outline: '#c9c3b4', outlineA: .7, scarf: '#5a5a66', slash: '210,210,230', blade: '#222', head: 'hat', weapon: 'brush' },
    ai: { range: [140, 290] }, beats: ['tieshan', 'qingfeng'], weakTo: ['feiying', 'leiming'] },
  { id: 'yuehua', name: '月华', role: '月镜宗师', diff: 3, escCD: 8.0, skill: 'mirror', skill2: 'moonring', ult: 'moonflow', passive: 'regen',
    passiveName: '月华', passiveDesc: '月镜格开近战必出反斩锁定惩罚；体态仙灵（0.92体量/460血），自带月魄神罡（110架势/6%微透伤）与脱战自愈，以静制动。',
    stat: { hp: 460, walk: 1.02, speed: 0.86, dmg: 1.00, reach: 1.02, swing: 0.84, jump: 1, weight: 0.92, defRating: 1.06, guardMax: 110, guardStab: 1.30, guardChip: 0.06, guardRegen: 32, poise: 0.90, size: 0.96 }, hitFeel: 0.8,
    look: { body: '#f4eefc', shade: '#b3a6c9', outline: '#15102a', outlineA: 1, scarf: '#c9b6ff', slash: '215,195,255', blade: '#f6f0ff', head: 'moon', weapon: 'moonblade' },
    ai: { range: [80, 180] }, beats: ['leiming', 'feiying', 'qingfeng', 'yanling'], weakTo: ['liuyun', 'moyu'] },
  { id: 'yanling', name: '燕翎', role: '御空飞燕', diff: 2, escCD: 8.5, skill: 'dive', skill2: 'darts', ult: 'featherstorm', passive: 'flight',
    passiveName: '御空', passiveDesc: '一飞冲天，羽翼轻捷（0.84体量）；空中回避地面冲击，但空战格挡抗性偏低（85架势），一旦被重兵器挑中需速用腾空闪化解。',
    stat: { hp: 440, walk: 1.10, speed: 0.86, dmg: 1.04, reach: 1, swing: 0.88, jump: 1.05, weight: 0.84, defRating: 0.95, guardMax: 85, guardStab: 0.85, guardChip: 0.13, guardRegen: 25, poise: 1.05, size: 0.95 }, fly: 1.2, hitFeel: 0.9,
    look: { body: '#f2f6ff', shade: '#9fb1d6', outline: '#0b1030', outlineA: 1, scarf: '#6fa8ff', slash: '140,190,255', blade: '#eef4ff', head: 'feather', weapon: 'wing' },
    ai: { range: [80, 190] }, beats: ['tieshan', 'lingshuang'], weakTo: ['liuyun', 'yuehua'] },
  { id: 'yuxiao', name: '玉箫', role: '箫音乐师', diff: 3, escCD: 9.0, skill: 'soundwave', skill2: 'echowall', ult: 'guangling', passive: 'rhythm',
    passiveName: '宫商', passiveDesc: '以箫为刃，以音为兵。普攻每命中一次积攒一枚音律，不出手时每 2.5 秒也会自己攒一枚（最多 3 枚），清音会把音律一次吹尽：音律越满，音波越大、越快、越重，三律齐鸣时音波可穿透、挑空并令对手失律迟缓。身形清瘦（0.86 体量/455 血），被近身缠斗时要靠回音壁脱身。',
    stat: { hp: 455, walk: 1.04, speed: 0.88, dmg: 0.98, reach: 1.12, swing: 0.86, jump: 1, weight: 0.86, defRating: 0.98, guardMax: 90, guardStab: 0.95, guardChip: 0.12, guardRegen: 27, poise: 1.00, size: 0.96 }, hitFeel: 0.85,
    look: { body: '#eef4ec', shade: '#9fb7a6', outline: '#0d1a14', outlineA: 1, scarf: '#5fcf9a', slash: '150,240,200', blade: '#d8f5e4', head: 'jade', weapon: 'flute' },
    ai: { range: [110, 280] }, beats: ['tieshan', 'moyu'], weakTo: ['feiying', 'leiming'] },
  { id: 'zuixian', name: '醉翁', role: '山水醉翁', diff: 3, escCD: 8.5, skill: 'pavilion', skill2: 'feast', ult: 'shanshui', passive: 'drunk',
    passiveName: '酒', passiveDesc: '腰间一壶酒。放任何技能都能添 30 酒（大招也算），打中人 +4（酒 0 到 100，每秒缓慢消退），每点酒增伤 0.5%（满壶 +50%）；酒过半壶就东倒西歪，有两成几率闪开近身攻击。与民同乐至少要半壶酒，并会把酒全部倒光。拳脚短（0.86 臂展）。',
    stat: { hp: 520, walk: 1.12, speed: 0.84, dmg: 1.00, reach: 0.86, swing: 0.8, jump: 1, weight: 1.15, defRating: 1.00, guardMax: 105, guardStab: 1.15, guardChip: 0.09, guardRegen: 30, poise: 0.92, size: 1.02 }, hitFeel: 1.0,
    look: { body: '#c9a882', shade: '#8a6a4a', outline: '#1a0e06', outlineA: 1, scarf: '#d8452f', slash: '255,170,90', blade: '#f2d8a8', head: 'messy', weapon: 'gourd' },
    ai: { range: [50, 140] }, beats: ['lingshuang', 'yuehua'], weakTo: ['liuyun', 'moyu'] },
  { id: 'gouchen', name: '勾陈', role: '链锤游侠', diff: 2, escCD: 9.0, skill: 'hook', skill2: 'whirl', ult: 'skynet', passive: 'bind',
    passiveName: '震魄', passiveDesc: '一条铁链拴着一柄方锤，走路时锤子在身边晃荡，出手时整条链子甩出去。飞锤砸中会扯链把对手拽到身前，被锤中的 1.2 秒内对手承受的伤害提高 25%；旋锤抡圆了能连砸带甩。链长（1.25 臂展），但霸体能硬吃飞锤。',
    stat: { hp: 490, walk: 1.10, speed: 1.0, dmg: 0.97, reach: 1.25, swing: 1.0, jump: 1, weight: 0.98, defRating: 1.00, guardMax: 100, guardStab: 1.00, guardChip: 0.11, guardRegen: 28, poise: 1.00, size: 1.00 }, hitFeel: 1.0,
    look: { body: '#3a3f4a', shade: '#22262e', outline: '#d9c7a0', outlineA: .7, scarf: '#c8a24a', slash: '235,205,130', blade: '#e8e8ee', head: 'mask', weapon: 'hammer' },
    ai: { range: [120, 260] }, beats: ['yanling', 'feiying'], weakTo: ['tieshan', 'yuehua'] },
  { id: 'lingque', name: '凌雀', role: '飞梭游侠', diff: 3, escCD: 8.0, skill: 'spindle', skill2: 'shadowdash', ult: 'needlestorm', passive: 'needlemark',
    passiveName: '雀芒', passiveDesc: '双持子母飞梭，以悬丝牵引。飞梭与悬丝技能击中敌人附加【雀芒】印记（持续4秒）；移形换影冲刺穿刺带印记者，瞬间引爆悬丝真气重创敌人并清零技能冷却；雀步凌波可灵活穿梭战场。',
    stat: { hp: 465, walk: 1.15, speed: 0.85, dmg: 1.02, reach: 1.08, swing: 0.82, jump: 1.05, weight: 0.86, defRating: 0.98, guardMax: 95, guardStab: 1.05, guardChip: 0.09, guardRegen: 30, poise: 0.98, size: 0.94 }, hitFeel: 0.85,
    look: { body: '#2a1a2e', shade: '#160c1c', outline: '#e07ac8', outlineA: .85, scarf: '#e056b0', slash: '235,110,210', blade: '#ffe8fa', head: 'topknot', weapon: 'spindle' },
    ai: { range: [70, 220] }, beats: ['feiying', 'liuyun'], weakTo: ['tieshan', 'leiming'] },
];
const CHAR_IDX = Object.fromEntries(CHARS.map((c, i) => [c.id, i]));
// 墨羽的墨水：每甩一团墨消耗 INK_COST，每秒恢复 INK_REGEN
const INK_MAX = 100, INK_COST = 15, INK_REGEN = 10, INK_DMG = 24;
// 墨羽的符：R 画一张花 FU_INK 格墨水，最多 FU_MAX 张；大招全部烧掉，伤害 FU_BASE + FU_PER × 张数
const FU_MAX = 5, FU_INK = 3, FU_BASE = 80, FU_PER = 40;
const WEAPON_LEN = { wing: 48, sword: 54, dual: 40, greatsword: 70, spear: 88, fan: 36, fists: 16, brush: 66, moonblade: 58, flute: 50, gourd: 16, hammer: 56, spindle: 42 };
// 按兵器流派定制专属普攻武学动作映射
const WEAPON_POSE_MODS = {
  wing: { a1: ['aj_wing_1s', 'aj_wing_1a'], a2: ['aj_wing_2s', 'aj_wing_2a'] },
  moonblade: { a1: ['aj_moonblade_1s', 'aj_moonblade_1a'], a2: ['aj_moonblade_2s', 'aj_moonblade_2a'] },
  sword: { a1: ['aj_sword_1s', 'aj_sword_1a'], a2: ['aj_sword_2s', 'aj_sword_2a'] },
  spear: { l1: ['sp_l1s', 'sp_l1a'], l2: ['sp_l2s', 'sp_l2a'], l3: ['ls_stance', 'ls_thrust'], l5: ['ls_stance', 'ls_thrust'], a1: ['aj_spear_1s', 'aj_spear_1a'], a2: ['aj_spear_2s', 'aj_spear_2a'] },
  dual: { l1: ['du_l1s', 'du_l1a'], l2: ['du_l2s', 'du_l2a'], l3: ['fy_crouch', 'fy_xslash'], l4: ['du_l1s', 'fy_xslash'], a1: ['aj_dual_1s', 'aj_dual_1a'], a2: ['aj_dual_2s', 'aj_dual_2a'] },
  greatsword: { l1: ['gs_l1s', 'gs_l1a'], l2: ['l2s', 'l2a'], l4: ['ts_lift', 'ts_slam'], hv: ['ts_lift', 'hva'], a1: ['aj_greatsword_1s', 'aj_greatsword_1a'], a2: ['aj_greatsword_2s', 'aj_greatsword_2a'] },
  fists: { l1: ['lm_boxer', 'lm_jab'], l2: ['l2s', 'lm_jab'], l3: ['lm_boxer', 'lm_kick'], l4: ['lds', 'lm_kick'], l6: ['lm_boxer', 'lm_jab'], l8: ['lm_boxer', 'lm_kick'], a1: ['aj_fists_1s', 'aj_fists_1a'], a2: ['aj_fists_2s', 'aj_fists_2a'] },
  gourd: { l1: ['zx_sway', 'lm_jab'], l2: ['zx_drink', 'zx_breath'], l3: ['zx_sway', 'zx_upper'], hv: ['zx_sway', 'zx_upper'], a1: ['aj_gourd_1s', 'aj_gourd_1a'], a2: ['aj_gourd_2s', 'aj_gourd_2a'] },
  fan: { l1: ['fn_l1s', 'fn_l1a'], l2: ['ly_fanswipe', 'l2a'], l3: ['fn_l1s', 'ly_fanswipe'], a1: ['aj_fan_1s', 'aj_fan_1a'], a2: ['aj_fan_2s', 'aj_fan_2a'] },
  flute: { l1: ['yx_play', 'yx_push'], l2: ['fn_l1s', 'fn_l1a'], l3: ['yx_play', 'lca'], a1: ['aj_flute_1s', 'aj_flute_1a'], a2: ['aj_flute_2s', 'aj_flute_2a'] },
  brush: { l1: ['my_stroke', 'my_paint'], l2: ['l2s', 'my_paint'], l4: ['my_stroke', 'lda'], a1: ['aj_brush_1s', 'aj_brush_1a'], a2: ['aj_brush_2s', 'aj_brush_2a'] },
  hammer: { l1: ['gc_wind', 'gc_throw'], l2: ['gc_pull', 'gc_sweep'], l3: ['gc_wind', 'gc_throw'], a1: ['aj_hammer_1s', 'aj_hammer_1a'], a2: ['aj_hammer_2s', 'aj_hammer_2a'] },
  spindle: { l1: ['du_l1s', 'du_l1a'], l2: ['du_l2s', 'du_l2a'], l3: ['du_l1s', 'lca'], hv: ['du_l1s', 'hva'], a1: ['aj_spindle_1s', 'aj_spindle_1a'], a2: ['aj_spindle_2s', 'aj_spindle_2a'] },
};
// 按角色属性生成每个角色自己的招式表
function buildMoves(ch) {
  const out = {}, st = ch.stat;
  const wMods = WEAPON_POSE_MODS[ch.look && ch.look.weapon] || {};
  for (const [k, m0] of Object.entries(MOVES)) {
    const m = JSON.parse(JSON.stringify(m0));
    if (wMods[k]) m.p = [...wMods[k]];
    Object.assign(m, (ch.moveMods || {})[k]);
    m.su *= st.speed; m.rc *= st.speed; m.ac *= st.swing || Math.sqrt(st.speed);
    if (m.suAdd) m.su += m.suAdd;   // 额外的起手僵直（不随出手速度缩放）
    m.dmg = m.dmgAbs !== undefined ? m.dmgAbs : Math.round(m.dmg * st.dmg * 10) / 10;
    const reach = st.reach * (m.reachMul || 1);
    m.box[2] = m.box[0] + (m.box[2] - m.box[0]) * reach;
    m.name = k; out[k] = m;
  }
  return out;
}
const CHAR_MOVES = CHARS.map(buildMoves);
const HEAVY_MOVES = ['hv', 'cs1', 'cs2'];

