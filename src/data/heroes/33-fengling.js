// 风铃：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'fengling', skin: 'fl', en: 'Feng Ling', archetype: 'support',
  bal: { normal: 0.94, skill: 0.95, ult: 0.94, cd: 1.0, hp: 0.96 },
  char: {
    name: '风铃', role: '听风辅助', diff: 2, escCD: 7.0,
    skill: 'chimegust', skill2: 'windblessing', ult: 'bellharmony', passive: 'counter',
    passiveName: '听风铃语',
    passiveDesc: '借清风与铃音化险为夷；Q 清铃拂风挥扇送出双股疾风击退对手，R 和风祈愿摇铃回气血并震开近敌。',
    stat: { hp: 795, walk: 1.06, speed: 1.04, dmg: 0.95, reach: 1.02, swing: 1.04, jump: 1.06, weight: 0.88, defRating: 0.98, guardMax: 100, guardStab: 1.02, guardChip: 0.09, guardRegen: 32, poise: 0.94, size: 0.96 },
    hitFeel: 0.86,
    look: { body: '#edf6fa', shade: '#9db8c9', outline: '#ffa8c8', outlineA: 0.88, scarf: '#ff85b2', slash: '165,225,255', blade: '#f5fbff', hair: '#1d222b', head: 'bun', weapon: 'fan' },
    ai: { range: [125, 285] },
    beats: ['tieshan', 'bawang'], weakTo: ['feiying', 'yanling']
  },
  forest: {
    title: '风铃传 · 清风涤尘', place: '听风长廊',
    synopsis: '听风长廊百铃失声，浊风携妖气席卷山寺。风铃轻摇玉铃展开素扇，唤来和风吹散群魔！',
    stageNames: ['铃语初响', '素扇引风', '长廊逐浊', '和风护寺', '万铃净尘'],
    waveDialogues: [
      '风铃：「听，风铃响了，大家要小心脚下哦。」',
      '风铃：「清风拂面，邪气可别想靠近长廊！」',
      '风铃：「铃音所至，浊风退散！」',
      '风铃：「万铃齐鸣，把妖雾全都吹走吧！」'
    ],
    bossIntro: '风铃：「融魂魔首，你弄乱了山寺的清风，风铃绝不会放过你！」'
  },
  saga: {
    title: '风铃传 · 听风行', motive: '山寺百枚祈福风铃一夜哑然，风铃循风声下山寻回失落的灵风。',
    nodes: [
      { place: '听风廊', name: '风起', fight: { foe: 'liuyun', lv: 'easy', goal: 'ko' },
        pre: [['', '廊檐风铃轻晃无声，风铃展开手中素扇。'], ['流云', '小丫头，你的风意还不够稳，让我指点两招！'], ['风铃', '请流云前辈赐教！']],
        post: [['流云', '好灵巧的扇风，灵风的源头在东边山谷。'], ['风铃', '谢谢前辈，我这就去看看！']] },
      { place: '杏花渡', name: '铃音', fight: { foe: 'yuxiao', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '花瓣随风飞舞，玉箫立于石桥吹奏清调。'], ['玉箫', '铃声与箫声相和，先接我几道音律试试？'], ['风铃', '风铃不会认输的！']],
        post: [['玉箫', '铃声清脆动人，前面山道风势古怪，多加小心。']],
        choice: { q: '山道分岔：一侧吹来受困旅人的呼救声，一侧直通吞风妖窟。', opts: [
          { t: '先循声救助旅人', f: 'help', say: [['风铃', '听风辨位，先把旅人们带出险境！']] },
          { t: '直赴妖窟夺回灵风', f: 'cave', say: [['风铃', '只要放回灵风，山谷的风雾自然会散！']] }] } },
      { place: '清风亭', name: '拂尘', fight: { foe: 'yuehua', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '月色清寒，月华轻抚月刃望向山亭。'], ['月华', '柔风未必敌得过寒月，出招吧。'], ['风铃', '柔风也能吹散寒雾！']],
        post: [['月华', '好温柔却坚定的风势，去吧。']] },
      { place: '翠屏岭', name: '和鸣', fight: { foe: 'zuixian', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '醉翁倚松小憩，葫芦酒香四溢。'], ['醉翁', '风铃叮当吵醒老夫午睡，先陪我活动活动！'], ['风铃', '前辈别生气，接我一阵清风！']],
        post: [['醉翁', '哈哈，醒酒舒畅！前面便是妖窟了。']] },
      { place: '灵风古窟', name: '归风',
        pre: { help: [['', '旅人平安离去，吞风魔首怒卷狂飙现身。'], ['风铃', '清风护人，万铃和鸣！']],
          cave: [['', '灵风泉眼被黑雾封锁，魔首自雾中扑出。'], ['风铃', '把山寺的清风还回来！']] },
        fight: { help: { foe: 'fengling', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          cave: { foe: 'liuyun', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { help: { title: '和风护旅', text: [['', '山谷清风徐来，听风长廊百铃再度齐鸣。'], ['风铃', '大家平安就好，风声又温柔起来啦。']] },
          cave: { title: '万铃复鸣', text: [['', '灵风重归山寺，清脆铃声传遍十里青山。'], ['风铃', '听呀，风在向我们道谢呢。']] } } },
    ] },
});
