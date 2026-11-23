// 霸王：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'bawang', skin: 'bw', en: 'Ba Wang', archetype: 'tank',
  bal: { normal: 0.92, skill: 0.94, ult: 0.95, cd: 1.0, hp: 0.98 },
  char: {
    name: '霸王', role: '霸天铁卫', diff: 1, escCD: 8.5,
    skill: 'overlordchop', skill2: 'warroar', ult: 'conquerorslam', passive: 'armor',
    passiveName: '霸王重甲',
    passiveDesc: '重剑挥斩沉猛稳固，出招自带霸体抗压；Q 霸王裂地重劈破防挑空，R 楚歌震军霸体怒吼震退四方。',
    stat: { hp: 930, walk: 0.89, speed: 0.88, dmg: 1.08, reach: 1.14, swing: 0.84, jump: 0.92, weight: 1.32, defRating: 1.18, guardMax: 128, guardStab: 1.18, guardChip: 0.06, guardRegen: 26, poise: 1.28, size: 1.1 },
    hitFeel: 1.16,
    look: { body: '#3c2520', shade: '#1e100d', outline: '#e6b450', outlineA: 0.92, scarf: '#c82e28', slash: '245,180,75', blade: '#f2e4cc', hair: '#1a1210', head: 'helm', weapon: 'greatsword' },
    ai: { range: [85, 220] },
    beats: ['feiying', 'lingque'], weakTo: ['youhuang', 'moyu']
  },
  forest: {
    title: '霸王传 · 破阵横戈', place: '乌江古垒',
    synopsis: '妖军压境乌江古垒，铁骑黑压压逼近城壕。霸王提玄铁重剑独当千军，势以霸道重锋踏平魔阵！',
    stageNames: ['古垒点兵', '重剑裂阵', '战吼惊涛', '铁壁横扫', '霸王镇岳'],
    waveDialogues: [
      '霸王：「来多少妖兵都一样，一起上吧！」',
      '霸王：「重剑之下，岂有完卵！」',
      '霸王：「听我一声战吼，尔等胆寒了吗？」',
      '霸王：「力拔山河，万魔皆碎！」'
    ],
    bossIntro: '霸王：「融魂魔首，你敢挡在霸王面前，便尝尝这柄重剑的份量！」'
  },
  saga: {
    title: '霸王传 · 霸天誓', motive: '乌江古垒外魔旗再起，霸王披甲提剑踏出营门讨伐群邪。',
    nodes: [
      { place: '乌江营', name: '披甲', fight: { foe: 'tieshan', lv: 'easy', goal: 'ko' },
        pre: [['', '战鼓低沉，霸王单手提起玄铁重剑。'], ['铁山', '好沉的剑气，先与我比比谁的筋骨更硬！'], ['霸王', '痛快，接我一剑！']],
        post: [['铁山', '名不虚传！魔军主力正在西坡集结。'], ['霸王', '待我前去踏平！']] },
      { place: '巨石坡', name: '震军', fight: { foe: 'polang', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '山坡滚石遍地，破浪扛着玄铁锚挡路。'], ['破浪', '想领兵冲锋？先接住我的沧澜重锚！'], ['霸王', '重兵相碰，正合我意！']],
        post: [['破浪', '好稳的下盘，果然是霸天铁卫。']],
        choice: { q: '战线分兵：可正面硬撼魔军中军大旗，或驰援侧翼受困守军。', opts: [
          { t: '正面斩断魔旗', f: 'charge', say: [['霸王', '擒贼先擒王，直冲中军斩旗！']] },
          { t: '驰援侧翼守军', f: 'defend', say: [['霸王', '绝不让弟兄们孤军奋战！']] }] } },
      { place: '断戟原', name: '破甲', fight: { foe: 'chixiao', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '原野火光冲天，炽霄横戟立于阵前。'], ['炽霄', '重甲配重剑，且看你扛不扛得住我的赤炎！'], ['霸王', '区区烈火，烧不穿霸王铁甲！']],
        post: [['炽霄', '好刚猛的霸气，魔首就在前方高台。']] },
      { place: '铁血关', name: '横扫', fight: { foe: 'leiming', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '雷声轰鸣，雷鸣抱拳镇守关口。'], ['雷鸣', '让我见识见识霸王的拳脚与剑势！'], ['霸王', '放马过来！']],
        post: [['雷鸣', '果然势不可挡，高台归你了。']] },
      { place: '点将魔台', name: '定鼎',
        pre: { charge: [['', '中军大旗已断，魔首怒啸踏上高台。'], ['霸王', '千军已破，现在轮到你了！']],
          defend: [['', '侧翼守军重整旗鼓，魔首亲自杀至。'], ['霸王', '有我霸王在此，寸土不让！']] },
        fight: { charge: { foe: 'bawang', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          defend: { foe: 'tieshan', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { charge: { title: '霸业定疆', text: [['', '魔旗尽倒，乌江古垒欢声雷动。'], ['霸王', '重剑所指，再无敌手。']] },
          defend: { title: '铁卫安邦', text: [['', '守军齐声高呼，古垒安然无恙。'], ['霸王', '铁甲在身，江山无忧。']] } } },
    ] },
});
