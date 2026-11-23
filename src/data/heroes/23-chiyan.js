// 赤焰：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'chiyan', skin: 'cy', en: 'Chi Yan', archetype: 'fighter',
  bal: { normal: 0.94, skill: 0.95, ult: 0.94, cd: 1.0, hp: 0.95 },
  char: {
    name: '赤焰', role: '焚天拳师', diff: 2, escCD: 7.0,
    skill: 'blazefist', skill2: 'emberupper', ult: 'infernorush', passive: 'combo',
    passiveName: '焚心烈拳',
    passiveDesc: '拳风炽烈的近战猛将；Q 烈焰冲拳疾步轰击引燃对手，R 烬火升龙腾空勾拳挑飞并持续灼烧。',
    stat: { hp: 860, walk: 1.05, speed: 1.06, dmg: 1.03, reach: 0.96, swing: 1.08, jump: 1.05, weight: 1.04, defRating: 1.02, guardMax: 105, guardStab: 1.02, guardChip: 0.09, guardRegen: 29, poise: 1.06, size: 1.02 },
    hitFeel: 1.06,
    look: { body: '#451812', shade: '#240a07', outline: '#ff9638', outlineA: 0.92, scarf: '#ff521b', slash: '255,140,50', blade: '#fff0d6', hair: '#2a0e0a', head: 'band', weapon: 'fists' },
    ai: { range: [60, 185] },
    beats: ['moyu', 'yuxiao'], weakTo: ['lingshuang', 'xuanji']
  },
  forest: {
    title: '赤焰传 · 烈拳焚妖', place: '炎拳武馆',
    synopsis: '妖众夜袭炎拳武馆，火光冲天。赤焰缠紧赤红拳带冲入敌阵，以焚天双拳打穿群魔！',
    stageNames: ['拳风燃起', '烈焰破围', '烬火连环', '焚天激斗', '赤拳镇魔'],
    waveDialogues: [
      '赤焰：「敢来炎拳馆撒野，先问过我这双拳头！」',
      '赤焰：「热身完毕，接下来可要动真格了！」',
      '赤焰：「拳风如火，烧尽你们这些藏头露尾的妖怪！」',
      '赤焰：「连招不断，火势不熄，全部给我倒下！」'
    ],
    bossIntro: '赤焰：「融魂魔首，看我这双焚天铁拳把你轰成灰烬！」'
  },
  saga: {
    title: '赤焰传 · 燃拳路', motive: '炎拳馆失传已久的「焚天拳谱」重现江湖，赤焰踏上武林寻谱试拳之路。',
    nodes: [
      { place: '烈风演武场', name: '试拳', fight: { foe: 'leiming', lv: 'easy', goal: 'ko' },
        pre: [['', '演武场尘土飞扬，雷鸣双拳带电迎战。'], ['雷鸣', '听说炎拳馆的赤焰出拳比雷还快，来比比！'], ['赤焰', '正合我意，接我烈焰冲拳！']],
        post: [['雷鸣', '拳头真烫手！听说拳谱残页在赤峡客栈露过面。'], ['赤焰', '多谢，我这就去看看！']] },
      { place: '赤峡客栈', name: '争锋', fight: { foe: 'chixiao', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '客栈门前火星四溅，炽霄提戟挡路。'], ['炽霄', '又是个玩火的？先过我这杆烈焰长戟！'], ['赤焰', '火戟配火拳，正好烧个痛快！']],
        post: [['炽霄', '拳劲刚猛，你这人倒合我胃口。']],
        choice: { q: '客栈掌柜道出线索：拳谱已被分为两半，一半落入黑市拳场，一半藏于古火山庙。', opts: [
          { t: '闯入黑市拳场夺回残页', f: 'arena', say: [['赤焰', '既然是拳场，那就用拳头把东西赢回来！']] },
          { t: '直赴古火山庙寻回真本', f: 'temple', say: [['赤焰', '先去火山庙找回师门真本，再算黑市这笔账！']] }] } },
      { place: '炎石擂台', name: '连击', fight: { foe: 'qianji', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '机关傀儡封锁擂台，千机冷眼俯视。'], ['千机', '血肉之拳也敢碰我的玄铁傀儡？'], ['赤焰', '烧红了照样一拳打穿！']],
        post: [['千机', '好霸道的烈焰拳劲……前面通道打开了。']] },
      { place: '熔火长廊', name: '破壁', fight: { foe: 'polang', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '热浪滚滚，破浪抡起巨锚拦在廊口。'], ['破浪', '水火不容，接住我这记怒涛震锚！'], ['赤焰', '看我的烬火升龙掀翻你的巨锚！']],
        post: [['破浪', '痛快！后面那关可不简单，挺住！']] },
      { place: '焚天古殿', name: '登峰',
        pre: { arena: [['', '黑市幕后强敌现身古殿，拳风如飓。'], ['赤焰', '今日便以焚天乱舞，夺回师门拳谱！']],
          temple: [['', '火山神像前烈焰化影，考验炎拳传人。'], ['赤焰', '以我赤心烈拳，承继焚天之道！']] },
        fight: { arena: { foe: 'chiyan', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          temple: { foe: 'leiming', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { arena: { title: '拳震黑市', text: [['', '黑市拳场烟消云散，焚天拳谱重归炎拳馆。'], ['赤焰', '武道在拳，更在堂堂正正！']] },
          temple: { title: '焚天宗师', text: [['', '古殿烈火化作金霞，赤焰悟透焚天真意。'], ['赤焰', '拳焰不熄，江湖再无敌手！']] } } },
    ] },
});
