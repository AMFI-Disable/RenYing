// 天罡：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'tiangang', skin: 'tg', en: 'Tian Gang', archetype: 'tank',
  bal: { normal: 0.92, skill: 0.94, ult: 0.95, cd: 1.0, hp: 0.97 },
  char: {
    name: '天罡', role: '破阵铁卫', diff: 2, escCD: 8.0,
    skill: 'gangthrust', skill2: 'ironbulwark', ult: 'heavenbreaker', passive: 'armor',
    passiveName: '天罡铁壁',
    passiveDesc: '军阵出身的铁甲枪卫；重击附带霸体，Q 破阵长驱顶枪霸体突进破防，R 铁壁震枪固守架势并震退近敌。',
    stat: { hp: 910, walk: 0.93, speed: 0.9, dmg: 1.05, reach: 1.15, swing: 0.86, jump: 0.95, weight: 1.28, defRating: 1.14, guardMax: 124, guardStab: 1.12, guardChip: 0.06, guardRegen: 28, poise: 1.22, size: 1.08 },
    hitFeel: 1.12,
    look: { body: '#222b3d', shade: '#111622', outline: '#f0c860', outlineA: 0.92, scarf: '#c83e3b', slash: '240,200,96', blade: '#fff6d6', hair: '#1d1d24', head: 'halberd-plume', weapon: 'gangpike' },
    ai: { range: [100, 250] },
    beats: ['qingfeng', 'feiying'], weakTo: ['moyu', 'youhuang']
  },
  forest: {
    title: '天罡传 · 铁枪破阵', place: '天罡军营',
    synopsis: '妖兵夜袭天罡古营，营垒告急。天罡身着重甲挺起玄铁长枪，单骑破阵誓守军旗不倒！',
    stageNames: ['夜营鸣鼓', '铁壁拒妖', '长驱破阵', '金戈荡寇', '天罡镇营'],
    waveDialogues: [
      '天罡：「军旗在此，妖孽休想越过营门一步！」',
      '天罡：「列阵！看我铁枪挑碎你们的妖阵！」',
      '天罡：「重甲如山，枪出如龙，来多少破多少！」',
      '天罡：「胜负已分，今日便以尔等祭旗！」'
    ],
    bossIntro: '天罡：「融魂魔首，你敢犯我天罡营垒，便接我一记天罡破军！」'
  },
  saga: {
    title: '天罡传 · 铁卫令', motive: '边关军饷离奇失踪，天罡奉帅令独行千里，誓查劫饷真凶以安军心。',
    nodes: [
      { place: '铁马驿站', name: '查踪', fight: { foe: 'chixiao', lv: 'easy', goal: 'ko' },
        pre: [['', '驿站旌旗猎猎，炽霄横戟挡在官道中央。'], ['炽霄', '同为军旅中人，先试过你这杆铁枪的斤两！'], ['天罡', '军务在身，十招之内分胜负！']],
        post: [['炽霄', '枪势沉稳如山！劫饷的马蹄印朝黑风峡去了。'], ['天罡', '多谢兄弟相告！']] },
      { place: '黑风峡口', name: '破关', fight: { foe: 'lingshuang', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '峡谷寒风凛冽，凌霜长枪斜指拦住山口。'], ['凌霜', '此处已封山，军爷请回吧。'], ['天罡', '军饷关乎十万将士性命，恕难从命，接枪！']],
        post: [['凌霜', '好刚正的枪意，确实不像奸邪之辈。']],
        choice: { q: '峡谷内发现劫匪分兵：一队押运银箱直奔山寨，一队伏击前来接应的粮队。', opts: [
          { t: '直追银箱端掉贼巢', f: 'vault', say: [['天罡', '夺回军饷捣毁贼巢，方能绝其后患！']] },
          { t: '回援粮队护住弟兄', f: 'escort', say: [['天罡', '银两可再寻，弟兄性命耽误不得，先救粮队！']] }] } },
      { place: '断崖寨门', name: '冲阵', fight: { foe: 'gouchen', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '寨门铁索高悬，勾陈冷笑挥动流星锤。'], ['勾陈', '铁卫孤身闯寨？正好拿你试锤！'], ['天罡', '破阵长驱，区区铁链何足挂齿！']],
        post: [['勾陈', '硬吃一锤都不退半步……算你狠。']] },
      { place: '聚义石台', name: '震军', fight: { foe: 'tieshan', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '石台之上，铁山抱刀而立挡住主殿。'], ['铁山', '想进殿拿人，先破我铁山这一刀！'], ['天罡', '以枪对刀，天罡绝不退缩！']],
        post: [['铁山', '好一条铁骨硬汉，真凶就在殿内。']] },
      { place: '黑风主殿', name: '归旗',
        pre: { vault: [['', '银箱堆积如山，叛将披甲持枪现身殿中。'], ['天罡', '背叛军魂者，今日以天罡铁枪正法！']],
          escort: [['', '粮队脱困重整旗鼓，叛将恼羞成怒率众杀出。'], ['天罡', '众将随我，天罡破军！']] },
        fight: { vault: { foe: 'tiangang', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          escort: { foe: 'chixiao', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { vault: { title: '铁枪追饷', text: [['', '军饷全数追回，边关军心大振。'], ['天罡', '枪在人在，军魂永存。']] },
          escort: { title: '义护三军', text: [['', '粮队安然归营，众将齐声高呼天罡之名。'], ['天罡', '护得袍泽周全，胜过千金万银。']] } } },
    ] },
});
