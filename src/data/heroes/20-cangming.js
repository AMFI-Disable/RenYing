// 苍冥：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'cangming', skin: 'cm', en: 'Cang Ming', archetype: 'swordsman',
  bal: { normal: 0.93, skill: 0.95, ult: 0.95, cd: 1.0, hp: 0.96 },
  char: {
    name: '苍冥', role: '寒渊剑宗', diff: 2, escCD: 7.5,
    skill: 'abyssslash', skill2: 'soulrift', ult: 'eclipsecleave', passive: 'armor',
    passiveName: '寒渊重剑',
    passiveDesc: '重击与蓄力斩附带短暂霸体；Q 寒渊斩挥出寒渊剑气并迟缓对手，R 裂魂斩蓄势上挑破防浮空。',
    stat: { hp: 875, walk: 0.95, speed: 0.92, dmg: 1.05, reach: 1.12, swing: 0.88, jump: 0.98, weight: 1.18, defRating: 1.08, guardMax: 112, guardStab: 1.08, guardChip: 0.08, guardRegen: 26, poise: 1.15, size: 1.05 },
    hitFeel: 1.08,
    look: { body: '#182438', shade: '#0b121e', outline: '#6ec4ff', outlineA: 0.9, scarf: '#2b6cb0', slash: '110,196,255', blade: '#e0f4ff', hair: '#d8e8f8', head: 'topknot', weapon: 'greatsword' },
    ai: { range: [95, 235] },
    beats: ['qingfeng', 'qianji'], weakTo: ['feiying', 'lingque']
  },
  forest: {
    title: '苍冥传 · 寒渊斩魔', place: '寒渊剑冢',
    synopsis: '寒渊剑冢封印松动，幽冥群妖蜂拥而出。苍冥背负寒渊重剑独镇谷口，誓以霜寒剑意斩灭邪魔！',
    stageNames: ['渊雪初降', '霜锋试刃', '裂魂破阵', '幽谷寒潮', '冥渊镇魔'],
    waveDialogues: [
      '苍冥：「寒渊剑冢乃清净之地，群妖速速退散！」',
      '苍冥：「重剑无锋，寒意入骨，接我一记寒渊斩！」',
      '苍冥：「区区魔影也敢扰动剑冢灵脉？」',
      '苍冥：「剑意已聚，今日便令尔等葬身渊底！」'
    ],
    bossIntro: '苍冥：「融魂魔首，你身上的浊气玷污了寒渊，接我冥蚀断渊！」'
  },
  saga: {
    title: '苍冥传 · 霜剑誓', motive: '寒渊剑宗世代镇守的渊底古碑突现裂痕，苍冥携重剑出山追查异变根源。',
    nodes: [
      { place: '寒渊山门', name: '雪启', fight: { foe: 'qingfeng', lv: 'easy', goal: 'ko' },
        pre: [['', '风雪漫山，苍冥负剑而立，青锋迎面走来。'], ['青锋', '寒渊剑宗闭山十年，今日出山所为何事？'], ['苍冥', '渊碑生变，恕难久留，请借路一试剑意。']],
        post: [['青锋', '好沉的寒剑！南边雪原近日确有异动。'], ['苍冥', '多谢告知，苍冥告辞。']] },
      { place: '冻月荒原', name: '霜途', fight: { foe: 'lingshuang', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '冻月荒原寒雾弥漫，凌霜持枪挡在冰桥之上。'], ['凌霜', '此地寒气反常，你这柄重剑脱不了干系！'], ['苍冥', '寒气源自渊底残碑，容我压住你枪势再细说！']],
        post: [['凌霜', '剑意纯粹凛冽，倒是我错怪你了。']],
        choice: { q: '荒原尽头分作两路：左通冰裂古祭坛，右通受寒雾围困的村落。', opts: [
          { t: '直赴古祭坛查明碑纹', f: 'altar', say: [['苍冥', '唯有先查明古碑异变，方能彻底平息寒灾。']] },
          { t: '先入村落护送百姓撤离', f: 'village', say: [['苍冥', '剑宗立世以护民为先，先救百姓脱险！']] }] } },
      { place: '断冰栈道', name: '凛斩', fight: { foe: 'tieshan', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '险峻冰栈上，铁山横刀截住去路。'], ['铁山', '听说寒渊重剑力压群雄，正好比比谁的刃更沉！'], ['苍冥', '既如此，接我裂魂一斩！']],
        post: [['铁山', '痛快！前头寒渊深处寒气逼人，小心些。']] },
      { place: '冥渊前廊', name: '幽影', fight: { foe: 'liying', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '幽蓝雾气在古廊翻涌，离影自影中缓步现身。'], ['离影', '寒渊里的秘密，可不是一把重剑就能斩开的。'], ['苍冥', '魑魅伎俩，一剑破之！']],
        post: [['离影', '剑气竟能冻住雾身……你进去吧。']] },
      { place: '寒渊祭坛', name: '镇渊',
        pre: { altar: [['', '古碑裂口黑气喷涌，寒渊心魔凝形而出。'], ['苍冥', '以寒渊剑意重铸古印，斩！']],
          village: [['', '村民已安然撤离，渊底魔影却趁机破封。'], ['苍冥', '百姓无恙，今日便与你决一死战！']] },
        fight: { altar: { foe: 'cangming', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          village: { foe: 'lingshuang', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { altar: { title: '重剑镇渊', text: [['', '裂碑重归完整，寒渊风雪渐歇。'], ['苍冥', '剑在渊宁，霜雪常清。']] },
          village: { title: '霜心护世', text: [['', '劫后余生的村民在山脚燃起灯火。'], ['苍冥', '守碑亦守人，此行无愧剑心。']] } } },
    ] },
});
