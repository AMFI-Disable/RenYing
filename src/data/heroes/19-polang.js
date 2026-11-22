// 破浪：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'polang', skin: 'pl', en: 'Po Lang',
  bal: { normal: 0.92, skill: 0.94, ult: 0.94, cd: 1.0, hp: 0.96 },
  char: {
    name: '破浪', role: '沧海锚客', diff: 2, escCD: 8.0,
    skill: 'tidalslam', skill2: 'undertow', ult: 'maelstrom', passive: 'armor',
    passiveName: '沧澜重锚',
    passiveDesc: '力大无穷的沧海豪客；重击带霸体，Q 怒涛震锚砸地掀浪破防，R 破浪突进携霸体冲阵撞飞敌群。',
    stat: { hp: 900, walk: 0.92, speed: 0.9, dmg: 1.06, reach: 1.1, swing: 0.86, jump: 0.96, weight: 1.28, defRating: 1.12, guardMax: 120, guardStab: 1.1, guardChip: 0.07, guardRegen: 26, poise: 1.2, size: 1.08 },
    hitFeel: 1.12,
    look: { body: '#193545', shade: '#0c1c26', outline: '#54d8ff', outlineA: 0.9, scarf: '#2ca8d8', slash: '80,210,255', blade: '#dff8ff', hair: '#142028', head: 'headband', weapon: 'greatsword' },
    ai: { range: [75, 215] },
    beats: ['feiying', 'chixiao'], weakTo: ['youhuang', 'xuanji']
  },
  forest: {
    title: '破浪传 · 怒海靖妖', place: '东海沧澜港',
    synopsis: '东海巨浪滔天，海妖趁潮攻港。破浪双臂抡起玄铁重锚，一夫当关击碎妖潮！',
    stageNames: ['海潮初涌', '重锚镇港', '破浪冲阵', '怒涛连环', '沧海平妖'],
    waveDialogues: [
      '破浪：「哈哈！这点风浪也配叫海啸？」',
      '破浪：「吃我一记重锚砸地，站稳喽！」',
      '破浪：「破浪冲阵，全都给我让开！」',
      '破浪：「大潮已定，妖孽受死！」'
    ],
    bossIntro: '破浪：「融魂魔首，兴风作浪害我渔港？今日用铁锚把你砸回海底！」'
  },
  saga: {
    title: '破浪传 · 沧海行', motive: '东海航道突现诡异漩涡，破浪驾舟提锚直探海眼。',
    nodes: [
      { place: '沧澜码头', name: '起锚', fight: { foe: 'qingfeng', lv: 'easy', goal: 'ko' },
        pre: [['', '海风猎猎，破浪肩扛玄铁重锚大笑。'], ['青锋', '海路凶险，先试过你这一身筋骨。'], ['破浪', '好！接我一锚！']],
        post: [['青锋', '好霸道的巨力，祝你一路顺风。']] },
      { place: '礁石浅滩', name: '听潮', fight: { foe: 'gouchen', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '浪花拍岸，勾陈甩动链锤拦路。'], ['勾陈', '比比是你的铁锚沉，还是我的链锤狠！'], ['破浪', '哈哈，正合我意！']],
        post: [['勾陈', '痛快！漩涡就在前方的断崖海峡。']],
        choice: { q: '海峡风浪大作：直接破浪冲入海眼，或先加固灯塔指引航船。', opts: [
          { t: '直冲海眼中心', f: 'eye', say: [['破浪', '长风破浪，直捣海眼！']] },
          { t: '先固海港灯塔', f: 'beacon', say: [['破浪', '灯塔不灭，渔船才回得了家！']] }] } },
      { place: '怒涛海峡', name: '踏浪', fight: { foe: 'liuyun', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '狂风卷浪，流云御风而立。'], ['流云', '风助浪势，你这重锚还能挥动吗？'], ['破浪', '越是大风大浪，我越来劲！']],
        post: [['流云', '真乃沧海豪杰！']] },
      { place: '沉船古礁', name: '镇渊', fight: { foe: 'tieshan', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '沉船甲板之上，铁山如山岳般矗立。'], ['铁山', '硬碰硬，看谁先退半步！'], ['破浪', '来得好！']],
        post: [['铁山', '哈哈，好一个不退的沧海汉子！']] },
      { place: '东海海眼', name: '平澜',
        pre: { eye: [['', '巨涡中心，深海魔影冲天而起。'], ['破浪', '沧海重锚，给我镇下这片海！']],
          beacon: [['', '灯塔高照，魔影怒扑港湾。'], ['破浪', '有我在，休想碰灯塔一根毫毛！']] },
        fight: { eye: { foe: 'polang', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          beacon: { foe: 'gouchen', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { eye: { title: '沧海晏清', text: [['', '漩涡平息，旭日跃出海面。'], ['破浪', '海阔天空，扬帆起航！']] },
          beacon: { title: '长灯护港', text: [['', '灯塔长明，百船安然归港。'], ['破浪', '沧澜港的风浪，我破浪替你们扛着！']] } } },
    ] },
});
