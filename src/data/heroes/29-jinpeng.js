// 金鹏：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'jinpeng', skin: 'jp', en: 'Jin Peng', archetype: 'fighter',
  bal: { normal: 0.94, skill: 0.95, ult: 0.94, cd: 1.0, hp: 0.96 },
  char: {
    name: '金鹏', role: '裂空武师', diff: 2, escCD: 7.5,
    skill: 'talondive', skill2: 'galestrike', ult: 'roctempest', passive: 'fly',
    passiveName: '扶摇金翼',
    passiveDesc: '双翼御风可滞空搏杀；Q 金鹏裂空可自空中俯冲破敌，R 扶摇罡风振翼齐发金羽烈风。',
    stat: { hp: 845, walk: 1.06, speed: 0.96, dmg: 1.04, reach: 1.02, swing: 0.96, jump: 1.08, weight: 0.94, defRating: 1.0, guardMax: 100, guardStab: 0.98, guardChip: 0.1, guardRegen: 28, poise: 1.04, size: 1.02 },
    fly: 1.0, hitFeel: 0.98,
    look: { body: '#3a2d18', shade: '#1f160a', outline: '#ffc84a', outlineA: 0.92, scarf: '#f0a828', slash: '255,205,85', blade: '#fff4d0', hair: '#1d150a', head: 'feather', weapon: 'wing' },
    ai: { range: [90, 250] },
    beats: ['moyu', 'youhuang'], weakTo: ['lingshuang', 'gouchen']
  },
  forest: {
    title: '金鹏传 · 裂空荡魔', place: '扶摇绝壁',
    synopsis: '妖云遮蔽扶摇绝壁，群魔盘踞云巅。金鹏展开金羽双翼破云而上，以裂空武道扫清穹苍！',
    stageNames: ['振翼破云', '金爪裂风', '绝壁逐妖', '罡风扫云', '大鹏镇空'],
    waveDialogues: [
      '金鹏：「区区妖云，也配遮我扶摇九万里之路？」',
      '金鹏：「抬头看！金鹏之影已罩定尔等！」',
      '金鹏：「罡风起处，群魔尽皆坠崖！」',
      '金鹏：「金翼既展，万里长空唯我独尊！」'
    ],
    bossIntro: '金鹏：「融魂魔首，躲在黑云里可逃不过金鹏利爪，下来受死！」'
  },
  saga: {
    title: '金鹏传 · 扶摇志', motive: '云巅圣羽碑遭妖风折断，金鹏振翼巡天追索断碑真凶。',
    nodes: [
      { place: '扶摇台', name: '振羽', fight: { foe: 'yanling', lv: 'easy', goal: 'ko' },
        pre: [['', '云海翻腾，金鹏立于绝壁石碑前。'], ['燕翎', '同为御空武者，敢不敢在云上比试一番？'], ['金鹏', '正要活动筋骨，来战！']],
        post: [['燕翎', '好刚猛的翼风！断碑的妖气飘向了西边风谷。'], ['金鹏', '谢过，我这就振翼追去。']] },
      { place: '裂风峡', name: '罡翼', fight: { foe: 'liuyun', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '峡谷狂风呼啸，流云摇扇御风而至。'], ['流云', '你的翼风太急，先把这阵狂风稳住再走！'], ['金鹏', '大鹏乘风而起，何惧狂飙！']],
        post: [['流云', '劲力刚柔并济，果真不凡。']],
        choice: { q: '云端岔路：高空可截击妖云先锋，谷底则有被困山民待救。', opts: [
          { t: '凌空截击妖云', f: 'sky', say: [['金鹏', '直冲云霄，把妖风碾碎在半空！']] },
          { t: '俯冲护送山民', f: 'ground', say: [['金鹏', '金翼所护，绝不弃山下生灵！']] }] } },
      { place: '雷云峰', name: '破穹', fight: { foe: 'leiming', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '乌云电闪，雷鸣双拳噼啪作响。'], ['雷鸣', '能穿雷云者，先接我三记雷拳！'], ['金鹏', '金爪破雷，看谁更硬！']],
        post: [['雷鸣', '痛快！云巅祭坛就在上方。']] },
      { place: '断云桥', name: '逐风', fight: { foe: 'chixiao', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '长桥悬于云海，炽霄火戟映红天际。'], ['炽霄', '风助火势，让我试试你的双翼经不经得起烈焰！'], ['金鹏', '扶摇罡风，正好吹散你的火阵！']],
        post: [['炽霄', '好一记俯冲裂空，去吧！']] },
      { place: '九霄云巅', name: '鹏举',
        pre: { sky: [['', '妖云汇聚成渊，暗影魔首踞于云端。'], ['金鹏', '今日便以金鹏之翼，重开万里晴空！']],
          ground: [['', '山民脱险，魔首怒卷黑风扑向绝壁。'], ['金鹏', '来得正好，接我扶摇九天一击！']] },
        fight: { sky: { foe: 'jinpeng', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          ground: { foe: 'yanling', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { sky: { title: '万里晴空', text: [['', '妖云尽散，圣羽碑重沐朝阳金光。'], ['金鹏', '长风万里，大鹏展翼永不停歇。']] },
          ground: { title: '金翼护山', text: [['', '云海归于宁静，山谷重闻欢声笑语。'], ['金鹏', '既能凌绝顶，亦当护苍生。']] } } },
    ] },
});
