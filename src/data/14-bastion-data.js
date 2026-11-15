// ======================= 天枢城 · 守境（资料表） =======================
// 24 种材料、6 处穿戴部位、8 大流派套装、6 位基础灵侍、7 处城池建筑与五重秘境。
const BASTION_MAT_CATS = [
  { id: 'metal', name: '金铁矿石' },
  { id: 'wood', name: '灵木织物' },
  { id: 'core', name: '妖丹兽骨' },
  { id: 'herb', name: '灵草丹材' },
  { id: 'rune', name: '符砂古卷' },
  { id: 'boss', name: '魔首秘宝' },
];

const BASTION_MATS = [
  { id: 'm_iron1', name: '粗玄铁', cat: 'metal', tier: 1, rgb: '160,175,195' },
  { id: 'm_steel2', name: '寒纹钢', cat: 'metal', tier: 2, rgb: '120,200,245' },
  { id: 'm_copper3', name: '赤霄铜', cat: 'metal', tier: 3, rgb: '240,135,90' },
  { id: 'm_gold4', name: '陨星真金', cat: 'metal', tier: 4, rgb: '245,205,95' },

  { id: 'm_bamboo1', name: '青竹韧材', cat: 'wood', tier: 1, rgb: '120,205,130' },
  { id: 'm_wood2', name: '古道铁木', cat: 'wood', tier: 2, rgb: '180,135,85' },
  { id: 'm_silk3', name: '幽冥阴丝', cat: 'wood', tier: 3, rgb: '175,130,235' },
  { id: 'm_phoenix4', name: '梧桐神木', cat: 'wood', tier: 4, rgb: '255,165,90' },

  { id: 'm_bone1', name: '碎妖骨', cat: 'core', tier: 1, rgb: '215,210,190' },
  { id: 'm_blood2', name: '凶煞血晶', cat: 'core', tier: 2, rgb: '235,75,90' },
  { id: 'm_asura3', name: '修罗魔核', cat: 'core', tier: 3, rgb: '205,65,185' },
  { id: 'm_dragon4', name: '混沌龙髓', cat: 'core', tier: 4, rgb: '255,95,65' },

  { id: 'm_herb1', name: '月见草', cat: 'herb', tier: 1, rgb: '130,225,185' },
  { id: 'm_berry2', name: '赤阳朱果', cat: 'herb', tier: 2, rgb: '255,115,85' },
  { id: 'm_lotus3', name: '玄冰玉莲', cat: 'herb', tier: 3, rgb: '115,230,255' },
  { id: 'm_fungus4', name: '九转还魂芝', cat: 'herb', tier: 4, rgb: '250,225,110' },

  { id: 'm_paper1', name: '朱砂符纸', cat: 'rune', tier: 1, rgb: '235,110,95' },
  { id: 'm_sand2', name: '星辉流砂', cat: 'rune', tier: 2, rgb: '240,210,135' },
  { id: 'm_page3', name: '天机残页', cat: 'rune', tier: 3, rgb: '145,190,255' },
  { id: 'm_void4', name: '太虚界石', cat: 'rune', tier: 4, rgb: '195,140,255' },

  { id: 'm_horn', name: '断岳雷角', cat: 'boss', tier: 4, rgb: '110,215,255' },
  { id: 'm_heart', name: '千机枢心', cat: 'boss', tier: 4, rgb: '240,185,95' },
  { id: 'm_lamp', name: '幽冥魂灯', cat: 'boss', tier: 4, rgb: '165,245,210' },
  { id: 'm_scale', name: '天魔逆鳞', cat: 'boss', tier: 4, rgb: '255,80,105' },
];
const BASTION_MAT_BY = Object.fromEntries(BASTION_MATS.map(m => [m.id, m]));

const BASTION_SLOTS = [
  { id: 'weapon', name: '兵魄', stat: '攻势' },
  { id: 'armor', name: '战袍', stat: '护体' },
  { id: 'boots', name: '战靴', stat: '身法' },
  { id: 'gauntlets', name: '护腕', stat: '巧劲' },
  { id: 'pendant', name: '佩玉', stat: '聚气' },
  { id: 'cloak', name: '背旗', stat: '同袍' },
];
const BASTION_SLOT_BY = Object.fromEntries(BASTION_SLOTS.map(s => [s.id, s]));

const BASTION_GENRES = [
  {
    id: 'berserker', name: '狂战血煞', rgb: '235,75,85', cats: ['metal', 'core'],
    b2: '攻击 +15%，残血愈战愈勇', b4: '重击 / 蓄力斩附带 12% 吸血与霸体', b6: '半血触发血煞：增伤 35% 且挥出赤浪，15 秒内抵御一次致命伤'
  },
  {
    id: 'juggernaut', name: '玄甲镇岳', rgb: '225,185,95', cats: ['metal', 'wood'],
    b2: '气血上限 +25%，受击减伤 15%', b4: '精准格挡爆发震波并附带大量破防值', b6: '定力未空前免疫击飞；守护城门或濒死队友分担 40% 伤害'
  },
  {
    id: 'assassin', name: '疾风踏影', rgb: '95,225,215', cats: ['wood', 'rune'],
    b2: '移速 +18%，传音传送冷却缩减 25%', b4: '背击必暴 +40% 伤并返还技能冷却', b6: '传音冷却降至 15 秒，落点震波造成 300% 伤害且闪步留爆影'
  },
  {
    id: 'elemental', name: '天雷寒霜', rgb: '120,190,255', cats: ['herb', 'rune'],
    b2: '招式附带寒霜减速或链式奔雷', b4: '重击碎冰引爆雷霜，冻结周围敌人', b6: '施放绝技自动在敌阵降下天罚墨柱，元素伤提升 45%'
  },
  {
    id: 'summoner', name: '千机御兽', rgb: '235,175,90', cats: ['wood', 'rune'],
    b2: '随行灵侍攻防 +35%，灵技冷却 -25%', b4: '随时携两位灵侍共战，操炮射速提升 40%', b6: '灵侍继承 2 件套词条，按 G 齐发双灵绝技并架设连弩塔'
  },
  {
    id: 'medic', name: '济世药王', rgb: '130,235,175', cats: ['herb', 'wood'],
    b2: '救援速度 +50%，丹药有几率不消耗', b4: '0.8 秒极速救起队友并恢复 75% 气血与无敌增伤', b6: '背旗常驻 320px 回血光环；穿云箭仅 25 秒冷却并群疗'
  },
  {
    id: 'siege', name: '破军摧城', rgb: '255,125,75', cats: ['metal', 'core'],
    b2: '魔首破防效率 +30%，对攻城怪增伤 25%', b4: '破防虚弱时长 +2 秒并回复 40% 怒气', b6: '蓄力与大招发出 500px 震地波，对虚弱魔首增伤 65%'
  },
  {
    id: 'ranger', name: '寻宝奇侠', rgb: '245,215,110', cats: ['rune', 'core'],
    b2: '碎银与材谱掉落 +25%，拾取范围大幅扩大', b4: '驿站寄存零手续费，阵亡损耗减半', b6: '身上碎银每百两增伤 2%（上限 50%），撤离额外赠全队材料'
  },
];
const BASTION_GENRE_BY = Object.fromEntries(BASTION_GENRES.map(g => [g.id, g]));

const BASTION_COMPANIONS = [
  { id: 'c_blade', name: '剑傀·墨羽', role: '近战连段', skill: '回旋聚敌斩', cd: 12, rgb: '143,240,255', desc: '主动夹击并延长浮空连段，按 G 聚拢周遭妖物。' },
  { id: 'c_turtle', name: '玄龟·镇岳', role: '前排护盾', skill: '镇岳吼啸', cd: 16, rgb: '225,190,105', desc: '挡在身前拦截弹道，按 G 嘲讽聚怪并予主 25% 减伤。' },
  { id: 'c_fox', name: '灵狐·青灯', role: '疗愈救援', skill: '清心灵泉', cd: 18, rgb: '135,240,185', desc: '周期回血并在主人或队友倒地时自动上前救起。' },
  { id: 'c_kite', name: '机关鸢·穿云', role: '高空点射', skill: '猎影标记', cd: 14, rgb: '255,195,110', desc: '悬空巡弋点杀飞妖，按 G 标记强敌令其受创 +15%。' },
  { id: 'c_cub', name: '吞金兽·貔貅崽', role: '拾荒聚宝', skill: '寻宝震慑', cd: 20, rgb: '250,220,95', desc: '自动大范围吸纳碎银与材料，精英战有几率额外掉宝。' },
  { id: 'c_spark', name: '雷灵·惊蛰', role: '破防雷控', skill: '九霄落雷', cd: 14, rgb: '175,155,255', desc: '随身电弧干扰盾兵，按 G 连雷劈砍大幅削减魔首破防条。' },
];
const BASTION_COMP_BY = Object.fromEntries(BASTION_COMPANIONS.map(c => [c.id, c]));

const BASTION_BUILDINGS = [
  { id: 'array', name: '传送阵', desc: '缩短传音冷却并解锁更高重秘境' },
  { id: 'forge', name: '兵器坊', desc: '解锁高阶八流派装备锻造与炼化' },
  { id: 'sanctuary', name: '灵兽园', desc: '喂养灵侍提升羁绊并解锁全部六位灵侍' },
  { id: 'apothecary', name: '药庐', desc: '用灵草炼制回春丹与起死回生符' },
  { id: 'library', name: '藏经阁', desc: '配置开局秘卷，提升初始构筑深度' },
  { id: 'walls', name: '城防箭楼', desc: '提高城门耐久并强化守城弩炮与天雷塔' },
  { id: 'guild', name: '宗门大殿', desc: '宗门捐献、共有宗门库与全宗门研习加成' },
];

const BASTION_REALMS = [
  { tier: 1, name: '一重·竹影谷', enemyMul: 1.0, drops: ['m_iron1', 'm_bamboo1', 'm_bone1', 'm_herb1', 'm_paper1'], catDrop: 'm_horn', reqArray: 1 },
  { tier: 2, name: '二重·赤岩寨', enemyMul: 1.35, drops: ['m_steel2', 'm_wood2', 'm_blood2', 'm_berry2', 'm_sand2'], catDrop: 'm_heart', reqArray: 2 },
  { tier: 3, name: '三重·幽冥村', enemyMul: 1.75, drops: ['m_copper3', 'm_silk3', 'm_asura3', 'm_lotus3', 'm_page3'], catDrop: 'm_lamp', reqArray: 4 },
  { tier: 4, name: '四重·玄冰渊', enemyMul: 2.25, drops: ['m_gold4', 'm_phoenix4', 'm_dragon4', 'm_fungus4', 'm_void4'], catDrop: 'm_scale', reqArray: 6 },
  { tier: 5, name: '五重·万妖祖坛', enemyMul: 2.9, drops: ['m_gold4', 'm_phoenix4', 'm_dragon4', 'm_fungus4', 'm_void4', 'm_scale'], catDrop: 'm_scale', reqArray: 8 },
];
