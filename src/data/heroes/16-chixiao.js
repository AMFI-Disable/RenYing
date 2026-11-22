// 炽霄：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'chixiao', skin: 'ch', en: 'Chi Xiao',
  bal: { normal: 0.92, skill: 0.94, ult: 0.95, cd: 1.0, hp: 0.96 },
  char: {
    name: '炽霄', role: '烈焰戟将', diff: 2, escCD: 7.5,
    skill: 'flamehalberd', skill2: 'blazering', ult: 'skyfall', passive: 'armor',
    passiveName: '赤炎戟势',
    passiveDesc: '重击与蓄力斩附带短暂霸体；Q 烈焰突刺与 R 炎轮扫荡命中后点燃对手，持续灼烧气血。',
    stat: { hp: 860, walk: 0.96, speed: 0.95, dmg: 1.04, reach: 1.12, swing: 0.9, jump: 1.0, weight: 1.15, defRating: 1.08, guardMax: 110, guardStab: 1.05, guardChip: 0.08, guardRegen: 27, poise: 1.12, size: 1.04 },
    hitFeel: 1.05,
    look: { body: '#3b1c18', shade: '#1f0d0a', outline: '#ff7a45', outlineA: 0.9, scarf: '#ff4d2e', slash: '255,115,65', blade: '#ffe6d0', hair: '#1d1210', head: 'headband', weapon: 'spear' },
    ai: { range: [100, 240] },
    beats: ['qianji', 'lingque'], weakTo: ['lingshuang', 'liuyun']
  },
  forest: {
    title: '炽霄传 · 焚野破关', place: '赤焰关',
    synopsis: '赤焰关外魔气冲霄，炽霄提烈焰长戟独守雄关，势要以赤火荡尽群魔！',
    stageNames: ['烽火初燃', '烈戟破阵', '赤风掠野', '焦土重围', '焚天镇关'],
    waveDialogues: [
      '炽霄：「长戟在手，群妖休想越雷池一步！」',
      '炽霄：「火势已起，尝尝赤炎焚身的滋味！」',
      '炽霄：「区区魔障，也敢犯我赤焰关？」',
      '炽霄：「戟锋所指，万魔皆烬！」'
    ],
    bossIntro: '炽霄：「融魂魔首，今日便以我赤炎长戟，斩断你的邪焰！」'
  },
  saga: {
    title: '炽霄传 · 赤戟誓', motive: '赤焰关烽火连天，炽霄追查边关失火之谜，誓护关内百姓。',
    nodes: [
      { place: '赤焰关', name: '烽起', fight: { foe: 'tieshan', lv: 'easy', goal: 'ko' },
        pre: [['', '赤焰关城楼烈风呼啸，炽霄长戟拄地。'], ['铁山', '你这杆火戟太招摇，先过我这关！'], ['炽霄', '关外异变将至，恕不奉陪，接戟！']],
        post: [['铁山', '好重的戟劲！关外西谷确有妖火。'], ['炽霄', '多谢告知，我这就去查明。']] },
      { place: '赤风谷', name: '火痕', fight: { foe: 'lingshuang', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '赤风谷中冰火交错，凌霜长枪横立。'], ['凌霜', '此地邪火反常，莫非是你所为？'], ['炽霄', '误会！待我压下邪焰再向你解释！']],
        post: [['凌霜', '你的火焰堂堂正正，确实不是谷中邪火。']],
        choice: { q: '谷底分岔：一侧直通火脉源头，一侧通往受困商队。', opts: [
          { t: '直捣火脉源头', f: 'source', say: [['炽霄', '断其源头，方能永绝后患！']] },
          { t: '先救受困商队', f: 'rescue', say: [['炽霄', '百姓性命要紧，我先护送他们出谷！']] }] } },
      { place: '熔岩栈道', name: '炙行', fight: { foe: 'leiming', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '炽热岩浆翻涌，雷鸣拦路试戟。'], ['雷鸣', '雷火相激，让我看看你能否扛得住！'], ['炽霄', '来得正好！']],
        post: [['雷鸣', '好气魄，前面便是火山祭坛。']] },
      { place: '炎狱前殿', name: '焚阵', fight: { foe: 'gouchen', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '铁链横空，勾陈挥锤震裂石板。'], ['勾陈', '想过去？先接住我的流星锤！'], ['炽霄', '火戟破链，看招！']],
        post: [['勾陈', '真是烫手的疯子……过去吧。']] },
      { place: '赤霄熔炉', name: '镇火',
        pre: { source: [['', '火山熔炉深处，赤焰魔影咆哮。'], ['炽霄', '借天地正火，斩尽邪焰！']],
          rescue: [['', '商队脱险，邪焰却已凝成巨影。'], ['炽霄', '护得了百姓，同样镇得住你！']] },
        fight: { source: { foe: 'chixiao', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          rescue: { foe: 'tieshan', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { source: { title: '正火明霄', text: [['', '邪焰散尽，赤焰关重归安宁。'], ['炽霄', '长戟不熄，边关长明。']] },
          rescue: { title: '赤心护民', text: [['', '商队平安归城，百姓焚香相迎。'], ['炽霄', '守土安民，本就是武者本分。']] } } },
    ] },
});
