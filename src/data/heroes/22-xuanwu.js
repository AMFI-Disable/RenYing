// 玄武：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'xuanwu', skin: 'xw', en: 'Xuan Wu', archetype: 'tank',
  bal: { normal: 0.91, skill: 0.94, ult: 0.94, cd: 1.0, hp: 0.97 },
  char: {
    name: '玄武', role: '镇山玄卫', diff: 1, escCD: 8.2,
    skill: 'shellbash', skill2: 'earthfort', ult: 'tortoiseslam', passive: 'armor',
    passiveName: '玄甲不动',
    passiveDesc: '稳如泰山的玄甲重卫；重击附带霸体，Q 玄甲冲撞顶锤突进击退破防，R 镇岳壁垒强化护体霸体并震地反击。',
    stat: { hp: 920, walk: 0.9, speed: 0.88, dmg: 1.06, reach: 1.06, swing: 0.84, jump: 0.94, weight: 1.32, defRating: 1.16, guardMax: 128, guardStab: 1.14, guardChip: 0.06, guardRegen: 28, poise: 1.25, size: 1.1 },
    hitFeel: 1.15,
    look: { body: '#222b26', shade: '#101613', outline: '#8cd48c', outlineA: 0.9, scarf: '#4c7a5a', slash: '140,212,140', blade: '#e4f7dc', hair: '#1b201d', head: 'turtle-crown', weapon: 'bastionshell' },
    ai: { range: [70, 205] },
    beats: ['feiying', 'chixiao'], weakTo: ['moyu', 'xuanji']
  },
  forest: {
    title: '玄武传 · 玄甲镇岳', place: '玄岳古关',
    synopsis: '妖潮冲击玄岳古关，山石崩裂。玄武身披玄甲手执镇山重锤，巍然屹立关前寸步不退！',
    stageNames: ['古关列阵', '玄甲御敌', '重锤震岳', '铁壁合围', '镇山伏魔'],
    waveDialogues: [
      '玄武：「有我玄武守关，群妖休想踏入半步！」',
      '玄武：「重锤撼地，看看是你们的爪牙硬，还是我的玄甲硬！」',
      '玄武：「山岳不动，尔等不过螳臂当车！」',
      '玄武：「妖阵已乱，今日便将你们尽数碾碎！」'
    ],
    bossIntro: '玄武：「融魂魔首，来撞撞我这副镇山玄甲吧！」'
  },
  saga: {
    title: '玄武传 · 镇岳铭', motive: '北境玄岳地脉震动，古碑镇山阵摇摇欲坠，玄武奉命巡山查探地裂之因。',
    nodes: [
      { place: '玄岳山脚', name: '问岳', fight: { foe: 'polang', lv: 'easy', goal: 'ko' },
        pre: [['', '山道碎石滚落，破浪扛着重锚迎面走来。'], ['破浪', '好厚重的甲胄！先让我试试你的下盘稳不稳！'], ['玄武', '沧海重锚？来得正好，接锤！']],
        post: [['破浪', '纹丝不动！山上矿洞刚传来巨响，你快去瞧瞧。'], ['玄武', '多谢相告！']] },
      { place: '黑石矿道', name: '撼地', fight: { foe: 'gouchen', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '矿道深处火光摇曳，勾陈甩动链锤拦住去路。'], ['勾陈', '铁疙瘩走得这么慢，接得住我的锁链吗？'], ['玄武', '任你链锤如雨，我自岿然不动！']],
        post: [['勾陈', '砸得虎口发麻，算你硬气。']],
        choice: { q: '矿道分岔：一侧通向地脉主阵眼，一侧有坍塌危及山脚工匠。', opts: [
          { t: '直奔阵眼稳固地脉', f: 'core', say: [['玄武', '阵眼若毁，整座玄岳都会崩塌，必须先稳地脉！']] },
          { t: '先撑岩壁救出工匠', f: 'miners', say: [['玄武', '玄甲在身，岂能见死不救！先护工匠出洞！']] }] } },
      { place: '断崖石桥', name: '铁壁', fight: { foe: 'tieshan', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '石桥狭窄，铁山横刀立于桥心。'], ['铁山', '玄岳双壁今日相遇，正好分个高下！'], ['玄武', '铁山兄请出刀，玄武接招！']],
        post: [['铁山', '好重的镇岳劲！桥那头便是地脉神坛。']] },
      { place: '地脉前厅', name: '破障', fight: { foe: 'leiming', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '雷光在石柱间闪烁，雷鸣跃下高台。'], ['雷鸣', '试试我的奔雷拳能不能劈开你的龟甲！'], ['玄武', '雷霆虽烈，难撼玄山！']],
        post: [['雷鸣', '真够结实……里面那个家伙交给你了。']] },
      { place: '玄岳地脉坛', name: '镇山',
        pre: { core: [['', '地脉灵石裂纹密布，煞影自岩浆中升起。'], ['玄武', '以玄武重锤镇压地脉，起！']],
          miners: [['', '工匠尽数脱险，地脉煞影已化作巨躯扑来。'], ['玄武', '人已救出，如今再无顾忌，接锤！']] },
        fight: { core: { foe: 'xuanwu', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          miners: { foe: 'tieshan', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { core: { title: '玄岳永固', text: [['', '地脉归稳，玄岳古关重归安宁。'], ['玄武', '山岳长存，玄卫不倒。']] },
          miners: { title: '铁甲护生', text: [['', '获救工匠齐声高呼，合众之力重修古阵。'], ['玄武', '护民如护山，这才是玄武之道。']] } } },
    ] },
});
