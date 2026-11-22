// 玄机：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'xuanji', skin: 'xj', en: 'Xuan Ji',
  bal: { normal: 0.93, skill: 0.95, ult: 0.95, cd: 1.0, hp: 0.95 },
  char: {
    name: '玄机', role: '星仪阵师', diff: 3, escCD: 7.5,
    skill: 'starorb', skill2: 'gravwell', ult: 'celestial', passive: 'none',
    passiveName: '星枢引力',
    passiveDesc: '执星仪控场的宗师；Q 星仪灵珠远程压制，R 天枢重力牵引近身敌众并削减架势，E 星宿归元连斩破阵。',
    stat: { hp: 810, walk: 1.0, speed: 1.0, dmg: 1.0, reach: 1.05, swing: 0.96, jump: 1.02, weight: 0.96, defRating: 1.0, guardMax: 102, guardStab: 1.0, guardChip: 0.09, guardRegen: 29, poise: 1.0, size: 1.0 },
    hitFeel: 0.92,
    look: { body: '#1b2140', shade: '#0d1126', outline: '#9ea8ff', outlineA: 0.92, scarf: '#6e7bff', slash: '155,170,255', blade: '#eef0ff', hair: '#15182c', head: 'starguan', weapon: 'moonblade' },
    ai: { range: [130, 290] },
    beats: ['moyu', 'yuxiao'], weakTo: ['feiying', 'chixiao']
  },
  forest: {
    title: '玄机传 · 星枢镇魔', place: '观星台',
    synopsis: '观星台星轨错乱，魔潮趁夜袭来。玄机运转天枢星仪，以星辉重定乾坤！',
    stageNames: ['星轨初偏', '天枢布阵', '银辉破暗', '周天合围', '星宿归位'],
    waveDialogues: [
      '玄机：「星轨已定，尔等皆在局中。」',
      '玄机：「天枢引力既开，休想脱身！」',
      '玄机：「星辉所照，邪祟无所遁形。」',
      '玄机：「周天星阵已成，归元！」'
    ],
    bossIntro: '玄机：「融魂魔首，妄图吞噬星辉？今夜便让你见识天枢正道！」'
  },
  saga: {
    title: '玄机传 · 天枢录', motive: '北斗星象骤暗，玄机携星仪下山查探异星坠落之地。',
    nodes: [
      { place: '观星台', name: '星陨', fight: { foe: 'yuehua', lv: 'easy', goal: 'ko' },
        pre: [['', '夜空星陨如雨，玄机轻转手中星仪。'], ['月华', '星月同辉，不妨切磋一局再同行。'], ['玄机', '请月华姑娘赐教。']],
        post: [['月华', '星阵精妙，异星落在了北岭。']] },
      { place: '北岭古坛', name: '星痕', fight: { foe: 'cixian', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '古坛磁力乱流，磁仙正查探陨石。'], ['磁仙', '磁场被星力搅乱了，先接我两招！'], ['玄机', '星磁相生，正可一试！']],
        post: [['磁仙', '好玄妙的引力，陨石核心在坛下。']],
        choice: { q: '陨石灵力外泄：可立刻布阵封印，或引导灵力回流观星台。', opts: [
          { t: '就地布阵封印', f: 'seal', say: [['玄机', '立刻封锁异力，免伤山野。']] },
          { t: '引流回观星台', f: 'channel', say: [['玄机', '化邪为正，重燃观星星盘！']] }] } },
      { place: '星枢秘廊', name: '斗转', fight: { foe: 'yuxiao', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '箫声回荡星廊，玉箫横笛相迎。'], ['玉箫', '音律合星辰，让我听听你的节奏。'], ['玄机', '请听星枢之音。']],
        post: [['玉箫', '余音绕星，令人叹服。']] },
      { place: '周天殿', name: '星移', fight: { foe: 'qianji', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '千机傀丸高速回旋，挡住殿门。'], ['千机', '天工与星象，谁更精密？'], ['玄机', '试过便知！']],
        post: [['千机', '好个天枢重力，甘拜下风。']] },
      { place: '星穹核心', name: '归元',
        pre: { seal: [['', '星阵合拢之际，异星魔影破封而出。'], ['玄机', '周天星宿，镇！']],
          channel: [['', '星流汇入星盘，魔影企图夺阵。'], ['玄机', '星辉归位，邪影退散！']] },
        fight: { seal: { foe: 'xuanji', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          channel: { foe: 'cixian', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { seal: { title: '星锁长夜', text: [['', '异星归寂，北斗重明。'], ['玄机', '星河安澜，人间无恙。']] },
          channel: { title: '天枢耀世', text: [['', '观星台星盘大亮，照彻万里山河。'], ['玄机', '星辉不灭，正道长存。']] } } },
    ] },
});
