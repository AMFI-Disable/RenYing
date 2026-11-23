// 云鹤：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'yunhe', skin: 'he', en: 'Yun He', archetype: 'support',
  bal: { normal: 0.93, skill: 0.95, ult: 0.94, cd: 1.0, hp: 0.95 },
  char: {
    name: '云鹤', role: '仙羽轻功', diff: 2, escCD: 7.0,
    skill: 'craneglide', skill2: 'cloudmend', ult: 'skywarddance', passive: 'fly',
    passiveName: '仙鹤凌云',
    passiveDesc: '身轻如羽的御风仙客，可凌空滑翔；Q 鹤翼凌空振翅疾掠并射出仙羽，R 云岚沐羽悬空疗伤并震散近身强敌。',
    stat: { hp: 810, walk: 1.08, speed: 1.02, dmg: 0.97, reach: 1.04, swing: 1.02, jump: 1.08, weight: 0.85, defRating: 0.98, guardMax: 98, guardStab: 0.98, guardChip: 0.1, guardRegen: 30, poise: 0.95, size: 0.98 },
    fly: 1.0, hitFeel: 0.88,
    look: { body: '#27384a', shade: '#131d28', outline: '#a8e6ff', outlineA: 0.9, scarf: '#f2d080', slash: '168,230,255', blade: '#ffffff', hair: '#edf6ff', head: 'feather', weapon: 'wing' },
    ai: { range: [120, 270] },
    beats: ['tieshan', 'polang'], weakTo: ['lingque', 'yanling']
  },
  forest: {
    title: '云鹤传 · 凌云伏妖', place: '云鹤仙峰',
    synopsis: '黑云蔽日，妖雾漫上云鹤仙峰。云鹤展开仙羽乘风起舞，誓以轻功绝艺驱散漫山妖霾！',
    stageNames: ['云巅初霁', '鹤翼穿雾', '仙羽破阵', '凌风逐妖', '九天澄岚'],
    waveDialogues: [
      '云鹤：「仙峰清静地，岂容妖雾遮天！」',
      '云鹤：「乘风而起，你们连我的衣角都摸不到。」',
      '云鹤：「云岚流转，仙羽所指皆为正道！」',
      '云鹤：「清风已至，群魔该散场了！」'
    ],
    bossIntro: '云鹤：「融魂魔首，且看我鹤舞九天，荡尽你这身污浊魔气！」'
  },
  saga: {
    title: '云鹤传 · 听风录', motive: '云鹤仙峰护山风眼骤停，云鹤下山寻访四方风脉，欲重续天地清风。',
    nodes: [
      { place: '松风崖', name: '起风', fight: { foe: 'yanling', lv: 'easy', goal: 'ko' },
        pre: [['', '崖边松涛阵阵，燕翎收翼落在古松枝头。'], ['燕翎', '同是乘风之辈，让我看看仙峰轻功有多快！'], ['云鹤', '请燕翎兄指教，鹤翼凌空！']],
        post: [['燕翎', '身姿飘逸！东海风口近来死气沉沉，你该去瞧瞧。'], ['云鹤', '多谢指引，云鹤这便启程。']] },
      { place: '流云渡', name: '问岚', fight: { foe: 'liuyun', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '江面雾气不散，流云立于渡舟之上。'], ['流云', '风势紊乱，连我的折扇都借不到风，你来试试？'], ['云鹤', '以羽引风，请流云兄接招！']],
        post: [['流云', '你的仙羽竟能自生清风，了不得。']],
        choice: { q: '渡口分作两途：高空雷云锁住风眼，低谷商船困于死雾。', opts: [
          { t: '直上云巅破开雷云', f: 'sky', say: [['云鹤', '先破风眼雷云，天地清风自会重来！']] },
          { t: '先入低谷引风救船', f: 'valley', say: [['云鹤', '行侠济世岂能袖手，先带商船冲出死雾！']] }] } },
      { place: '天柱石林', name: '御风', fight: { foe: 'xuanji', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '星阵悬空，玄机转动星仪封锁气脉。'], ['玄机', '风脉异动关乎星象，先过我星枢力场！'], ['云鹤', '星力虽重，难困凌云仙鹤！']],
        post: [['玄机', '好轻灵的身法，风眼就在前峰之上。']] },
      { place: '断风古桥', name: '清岚', fight: { foe: 'cixian', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '磁石悬空作响，磁仙负手立于桥端。'], ['磁仙', '飞得再高，也逃不出我的磁极牵引！'], ['云鹤', '清风无形，看我破你磁阵！']],
        post: [['磁仙', '顺风借力，果然巧妙，去吧。']] },
      { place: '九霄风眼', name: '澄空',
        pre: { sky: [['', '云巅狂风倒卷，浊风凝成云鹤虚影。'], ['云鹤', '清浊自分，鹤舞九天！']],
          valley: [['', '商船驶出迷雾，风眼浊气却化作狂岚袭来。'], ['云鹤', '护得人间安渡，再清九霄浊风！']] },
        fight: { sky: { foe: 'yunhe', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          valley: { foe: 'yanling', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { sky: { title: '九霄清岚', text: [['', '乌云散尽，万里长空重现澄澈天光。'], ['云鹤', '清风复归，仙峰无恙。']] },
          valley: { title: '仁风济渡', text: [['', '江上百船齐鸣谢恩，清风吹遍两岸山河。'], ['云鹤', '轻功在身，原该为苍生开路。']] } } },
    ] },
});
