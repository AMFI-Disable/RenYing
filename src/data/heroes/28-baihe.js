// 白河：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'baihe', skin: 'bh', en: 'Bai He', archetype: 'swordsman',
  bal: { normal: 0.95, skill: 0.95, ult: 0.95, cd: 1.0, hp: 0.96 },
  char: {
    name: '白河', role: '霜华剑客', diff: 2, escCD: 7.5,
    skill: 'riverpierce', skill2: 'frostparry', ult: 'wintertorrent', passive: 'counter',
    passiveName: '霜华映剑',
    passiveDesc: '精准格挡与反手剑势凝结寒霜；Q 寒江贯虹疾刺减速对手，R 霜华凝镜短暂护体反震近敌。',
    stat: { hp: 835, walk: 1.03, speed: 1.02, dmg: 1.02, reach: 1.06, swing: 1.02, jump: 1.02, weight: 0.98, defRating: 1.02, guardMax: 105, guardStab: 1.04, guardChip: 0.09, guardRegen: 29, poise: 1.02, size: 1.0 },
    hitFeel: 0.96,
    look: { body: '#dcebf7', shade: '#87a8c4', outline: '#5ec8ff', outlineA: 0.9, scarf: '#48b8f0', slash: '125,220,255', blade: '#eefaff', hair: '#182430', head: 'ponytail', weapon: 'sword' },
    ai: { range: [95, 235] },
    beats: ['chixiao', 'leiming'], weakTo: ['tieshan', 'moyu']
  },
  forest: {
    title: '白河传 · 霜华渡江', place: '寒江渡口',
    synopsis: '寒江渡口冰封千里，妖雾沿水脉蔓延。白河横霜华长剑踏冰而出，誓以清霜荡尽江上妖氛！',
    stageNames: ['寒江初雪', '霜剑破雾', '冰岸截妖', '雪渡连锋', '清霜镇江'],
    waveDialogues: [
      '白河：「江面起雾，正是霜华试剑之时。」',
      '白河：「寒气已入剑锋，莫要近我三步之内。」',
      '白河：「踏冰而行，群妖休想渡过此江！」',
      '白河：「冰雪听令，剑落江平！」'
    ],
    bossIntro: '白河：「融魂魔首，寒江清流岂容你玷污，接我霜华一剑！」'
  },
  saga: {
    title: '白河传 · 寒剑誓', motive: '寒江上游一夜冰结异常，白河溯流而上查明水脉异变之源。',
    nodes: [
      { place: '寒江渡', name: '冰渡', fight: { foe: 'qingfeng', lv: 'easy', goal: 'ko' },
        pre: [['', '寒江雾雪迷蒙，白河收剑立于渡口石阶。'], ['青锋', '好凌厉的寒剑，借你剑气一试风势！'], ['白河', '江路紧急，三招之内分个高下吧。']],
        post: [['青锋', '剑势清冽如江水，上游确有寒煞异动。'], ['白河', '多谢指引，我这便启程。']] },
      { place: '雪柳岸', name: '霜痕', fight: { foe: 'lingshuang', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '雪岸冰晶遍地，凌霜横枪挡在冰桥前。'], ['凌霜', '此间寒气与你剑意相似，先接我寒枪！'], ['白河', '同为御霜之人，待我接过这阵再细说！']],
        post: [['凌霜', '你的剑意澄澈无杂，看来另有邪修作祟。']],
        choice: { q: '冰河分岔：左岸通往冰窟邪阵，右岸村落正遭冰潮围困。', opts: [
          { t: '直入冰窟破阵', f: 'cavern', say: [['白河', '毁去源头邪阵，冰潮自解！']] },
          { t: '先赴村落解围', f: 'village', say: [['白河', '先护百姓周全，再讨伐邪源！']] }] } },
      { place: '断冰崖', name: '映雪', fight: { foe: 'yuehua', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '霜月当空，月华持月刃立于冰崖之上。'], ['月华', '冰面映月，你的剑能斩破镜影吗？'], ['白河', '寒江无尘，虚实一剑可辨！']],
        post: [['月华', '好一记霜华映剑，前路已开。']] },
      { place: '玄冰峡', name: '寒涛', fight: { foe: 'polang', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '峡谷冰浪翻涌，破浪挥锚击碎浮冰。'], ['破浪', '想闯玄冰峡？先扛住我的怒涛重锚！'], ['白河', '以霜凝涛，请接剑！']],
        post: [['破浪', '痛快！峡谷深处便是冰核所在。']] },
      { place: '白河冰源', name: '江清',
        pre: { cavern: [['', '冰窟邪阵轰鸣，寒影魔首凝冰成剑。'], ['白河', '霜华入鞘前，必斩此邪冰！']],
          village: [['', '村落冰潮退去，魔首循迹追至江源。'], ['白河', '百姓已安，今日便与你做个了断！']] },
        fight: { cavern: { foe: 'baihe', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          village: { foe: 'lingshuang', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { cavern: { title: '霜净寒江', text: [['', '邪冰崩解，寒江重归奔流不息。'], ['白河', '江水长清，霜剑亦安。']] },
          village: { title: '寒剑护岸', text: [['', '沿岸渔火重燃，渡口传颂白衣剑客之名。'], ['白河', '守得一江烟火，不负此剑。']] } } },
    ] },
});
