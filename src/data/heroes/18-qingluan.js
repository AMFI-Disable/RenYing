// 青鸾：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'qingluan', skin: 'ql', en: 'Qing Luan', archetype: 'support',
  bal: { normal: 0.94, skill: 0.95, ult: 0.94, cd: 1.0, hp: 0.95 },
  char: {
    name: '青鸾', role: '翠羽铃医', diff: 2, escCD: 7.0,
    skill: 'jadebreeze', skill2: 'luanheal', ult: 'phoenixchorus', passive: 'soothe',
    profile: { weapon: '药灯铃杖', bio: '青鸾药谷传人，以悬灯翠羽铃杖行医济世；清铃起风时既可涤荡邪瘴，也能驰援护佑同袍。' },
    passiveName: '铃风济世',
    passiveDesc: '团队医辅核心；施放 Q/R/E 时震响药灯铃杖，为附近友军提速并回复架势，自身招架反击时亦回血。',
    stat: { hp: 800, walk: 1.04, speed: 1.02, dmg: 0.96, reach: 1.04, swing: 1.02, jump: 1.04, weight: 0.9, defRating: 1.0, guardMax: 102, guardStab: 1.02, guardChip: 0.09, guardRegen: 32, poise: 0.98, size: 0.97 },
    hitFeel: 0.88,
    look: { body: '#163a36', shade: '#0a201e', outline: '#52f0c8', outlineA: 0.9, scarf: '#28c79e', slash: '82,240,200', blade: '#e0fff6', hair: '#182b28', head: 'luan-crest', weapon: 'chimestaff' },
    ai: { range: [110, 250] },
    beats: ['chixiao', 'moyu'], weakTo: ['feiying', 'leiming']
  },
  forest: {
    title: '青鸾传 · 铃杖除瘟', place: '青鸾药谷',
    synopsis: '药谷灵草遭妖瘴侵蚀，瘟气四散。青鸾轻摇药灯铃杖踏入妖林，以清风灵药涤荡魔氛！',
    stageNames: ['药风初起', '翠羽清瘴', '灵铃回春', '百草伏妖', '青鸾济世'],
    waveDialogues: [
      '青鸾：「药谷灵草不容糟蹋，请诸位退避三舍！」',
      '青鸾：「清风拂面，邪瘴自消，莫要再执迷不悟。」',
      '青鸾：「医者仁心，却也绝不姑息作祟群妖！」',
      '青鸾：「翠羽齐鸣，这片药谷该重见天日了。」'
    ],
    bossIntro: '青鸾：「融魂魔首，你散播的邪毒害苦了谷中生灵，今日便以鸾鸣九霄净你邪祟！」'
  },
  saga: {
    title: '青鸾传 · 翠羽方', motive: '江湖突现无名奇疫，青鸾携药灯铃杖下山采药行医，追寻疫病之源。',
    nodes: [
      { place: '杏林渡口', name: '问诊', fight: { foe: 'zuixian', lv: 'easy', goal: 'ko' },
        pre: [['', '渡口药香袅袅，醉翁提壶拦在桥头。'], ['醉翁', '小姑娘莫急，老夫以酒克疫，先切磋两招再走！'], ['青鸾', '前辈酒气太重，且看青鸾的清风铃杖！']],
        post: [['醉翁', '好柔韧的风劲！西山药圃近来古怪得很。'], ['青鸾', '多谢前辈指路，晚辈这就去查看。']] },
      { place: '翠微药圃', name: '寻草', fight: { foe: 'liuyun', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '花瓣随风飘落，流云轻摇折扇现身药圃。'], ['流云', '听闻你以铃杖御风，让我看看有几分火候！'], ['青鸾', '既如此，便以风会友，请接招！']],
        post: [['流云', '清风化劲，果然名不虚传。']],
        choice: { q: '药圃深处发现两处线索：一处是枯萎的灵泉源头，一处是染疫的商旅营地。', opts: [
          { t: '先查灵泉根除疫源', f: 'spring', say: [['青鸾', '若不截断疫源，只怕更多百姓会染病。']] },
          { t: '先赴营地施药救人', f: 'camp', say: [['青鸾', '救人如救火，先稳住商旅性命要紧！']] }] } },
      { place: '墨林山道', name: '解毒', fight: { foe: 'moyu', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '山道墨雾弥漫，墨羽提笔拦在石阶中央。'], ['墨羽', '医者也敢闯瘴林？先接住我的墨符再说！'], ['青鸾', '以瘴封山非正道，看我翠羽清风！']],
        post: [['墨羽', '你的铃风竟能散去墨瘴……往前走吧。']] },
      { place: '古亭药坊', name: '试药', fight: { foe: 'yuxiao', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '古亭箫声凄切，玉箫立于石阶之上。'], ['玉箫', '疫气扰心，唯有清音与清风方能安魂，来过招！'], ['青鸾', '请玉先生赐教！']],
        post: [['玉箫', '心静风清，前面便是疫源所在。']] },
      { place: '青鸾灵台', name: '回春',
        pre: { spring: [['', '灵泉黑雾翻滚，疫影化作青鸾模样扑来。'], ['青鸾', '邪不胜正，翠羽回春！']],
          camp: [['', '商旅转危为安，疫源却在灵台凝聚成形。'], ['青鸾', '众生安好，如今该彻底清除你了！']] },
        fight: { spring: { foe: 'qingluan', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          camp: { foe: 'moyu', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { spring: { title: '灵泉清疫', text: [['', '灵泉重现清冽甘甜，山野瘟气一扫而空。'], ['青鸾', '清风拂山岗，人间再无疫苦。']] },
          camp: { title: '仁心济世', text: [['', '商旅康复归乡，沿途传颂翠羽铃医之名。'], ['青鸾', '一杖清风，护得安康便好。']] } } },
    ] },
});
