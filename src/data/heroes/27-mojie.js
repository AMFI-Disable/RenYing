// 墨绝：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'mojie', skin: 'mj', en: 'Mo Jie', archetype: 'controller',
  bal: { normal: 0.94, skill: 0.95, ult: 0.95, cd: 1.0, hp: 0.94 },
  char: {
    name: '墨绝', role: '断魂书生', diff: 3, escCD: 7.2,
    skill: 'inkbind', skill2: 'sealscript', ult: 'abyssscroll', passive: 'combo',
    passiveName: '断魂墨敕',
    passiveDesc: '控场凌厉的墨道书生；Q 断魂墨缚在敌足下布下墨阵禁锢迟缓，R 镇魂敕符挥毫射出墨气符波重创对手。',
    stat: { hp: 820, walk: 1.02, speed: 1.0, dmg: 1.0, reach: 1.1, swing: 1.0, jump: 1.02, weight: 0.92, defRating: 0.96, guardMax: 98, guardStab: 0.98, guardChip: 0.1, guardRegen: 29, poise: 0.96, size: 1.0 },
    hitFeel: 0.92,
    look: { body: '#1f1c2e', shade: '#0e0c18', outline: '#b48eff', outlineA: 0.9, scarf: '#7c4dff', slash: '180,142,255', blade: '#efe6ff', hair: '#181622', head: 'ink-sidepart', weapon: 'soulbrush' },
    ai: { range: [120, 275] },
    beats: ['tieshan', 'xuanwu'], weakTo: ['feiying', 'yinhu']
  },
  forest: {
    title: '墨绝传 · 墨卷镇妖', place: '墨渊书院',
    synopsis: '邪祟潜入墨渊书院污毁古籍，墨气化妖。墨绝提断魂长毫步出藏经阁，以笔为剑镇压群魔！',
    stageNames: ['墨阁起风', '断魂落笔', '敕符破障', '玄卷封妖', '绝墨镇魔'],
    waveDialogues: [
      '墨绝：「书院藏卷不容亵渎，尔等且受墨缚！」',
      '墨绝：「一笔定身，二笔镇魂，何处可逃？」',
      '墨绝：「纸墨虽轻，落笔成阵便重如千钧！」',
      '墨绝：「绝墨魂卷已展，群妖尽入画中吧！」'
    ],
    bossIntro: '墨绝：「融魂魔首，今日便以我断魂长毫，将你永封于绝墨魂卷之中！」'
  },
  saga: {
    title: '墨绝传 · 断魂笺', motive: '墨渊书院镇院秘典《断魂笺》失窃，墨绝携长毫入世追回残卷，防其落入邪道。',
    nodes: [
      { place: '清墨巷', name: '问墨', fight: { foe: 'moyu', lv: 'easy', goal: 'ko' },
        pre: [['', '细雨微凉，墨羽撑伞立于青石巷口。'], ['墨羽', '同为执笔之人，听说你在找《断魂笺》？先切磋一二！'], ['墨绝', '请墨羽兄赐教，看我断魂墨缚！']],
        post: [['墨羽', '笔意凌厉果决！残卷气息往听雨阁去了。'], ['墨绝', '多谢告知，后会有期。']] },
      { place: '听雨阁', name: '寻笺', fight: { foe: 'yuxiao', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '阁中雨声与箫声交织，玉箫横箫拦在阶前。'], ['玉箫', '阁中藏有异卷，若无定力恐遭反噬，让我试试你！'], ['墨绝', '书生执笔无惧心魔，请出招！']],
        post: [['玉箫', '笔锋稳健，确能镇得住此卷。']],
        choice: { q: '阁中查得残卷已被一分为二：正卷落入邪修之手，副卷正引发周边村镇墨瘴。', opts: [
          { t: '先追正卷擒拿窃贼', f: 'scroll', say: [['墨绝', '正卷乃秘典核心，绝不能落入邪修之手！']] },
          { t: '先赴村镇封印墨瘴', f: 'seal', say: [['墨绝', '书院秘典岂能祸及无辜，先封墨瘴救人！']] }] } },
      { place: '枯墨林', name: '敕符', fight: { foe: 'youhuang', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '林间黑雾弥漫，幽篁挥鞭截住去路。'], ['幽篁', '墨毒与竹毒撞在一起，倒想看看谁更厉害！'], ['墨绝', '镇魂敕符，破你毒瘴！']],
        post: [['幽篁', '好霸道的墨阵……前头便是古碑林。']] },
      { place: '星墨碑林', name: '破局', fight: { foe: 'xuanji', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '石碑刻满星图，玄机现身阵眼之中。'], ['玄机', '秘典引动天象异常，先破我星仪之阵再谈取卷！'], ['墨绝', '以墨破星，正合我意！']],
        post: [['玄机', '好一招绝墨断势，去取回残卷吧。']] },
      { place: '墨渊古坛', name: '归卷',
        pre: { scroll: [['', '古坛墨浪翻涌，邪修借正卷化出墨绝心魔。'], ['墨绝', '邪墨岂敢僭越，绝墨魂卷，封！']],
          seal: [['', '村镇墨瘴既除，残卷煞气尽数汇于古坛。'], ['墨绝', '万物归寂，今日便重封《断魂笺》！']] },
        fight: { scroll: { foe: 'mojie', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          seal: { foe: 'moyu', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { scroll: { title: '正卷归院', text: [['', '《断魂笺》重归藏经阁，书院再闻朗朗书声。'], ['墨绝', '笔墨存正气，秘典自长宁。']] },
          seal: { title: '墨镇苍生', text: [['', '漫天墨瘴化作甘霖，村镇重现晴空。'], ['墨绝', '文章济世，墨道亦当如此。']] } } },
    ] },
});
