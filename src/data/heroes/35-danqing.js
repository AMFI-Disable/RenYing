// 丹青：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'danqing', skin: 'dq', en: 'Dan Qing', archetype: 'controller',
  bal: { normal: 0.94, skill: 0.95, ult: 0.95, cd: 1.0, hp: 0.95 },
  char: {
    name: '丹青', role: '绘卷控场', diff: 3, escCD: 7.5,
    skill: 'vermilionarc', skill2: 'cinnabarward', ult: 'grandpainting', passive: 'combo',
    passiveName: '丹青妙笔',
    passiveDesc: '以朱砂石青绘卷设阵、连绵压制；Q 朱砂画弧挥毫送出丹青弧光减速，R 青绿封卷落墨成阵定身控敌。',
    stat: { hp: 815, walk: 1.01, speed: 1.0, dmg: 1.0, reach: 1.1, swing: 1.0, jump: 1.0, weight: 0.92, defRating: 0.98, guardMax: 102, guardStab: 1.0, guardChip: 0.1, guardRegen: 29, poise: 0.98, size: 1.0 },
    hitFeel: 0.92,
    look: { body: '#2a2220', shade: '#161110', outline: '#ff6448', outlineA: 0.9, scarf: '#3898c8', slash: '245,105,80', blade: '#ffeae4', hair: '#181414', head: 'hat', weapon: 'brush' },
    ai: { range: [125, 285] },
    beats: ['tieshan', 'polang'], weakTo: ['feiying', 'lingque']
  },
  forest: {
    title: '丹青传 · 绘卷镇妖', place: '丹青画苑',
    synopsis: '丹青画苑古卷生魔，山河画境遭墨妖侵蚀。丹青手执朱砂大笔步入画中，以丹青妙笔重绘清明山河！',
    stageNames: ['朱砂落笔', '青绿初开', '画卷困妖', '山河叠影', '丹青净卷'],
    waveDialogues: [
      '丹青：「进了我的画卷，一草一木皆听我调遣。」',
      '丹青：「朱砂点睛，青绿封路，看你们往哪逃！」',
      '丹青：「笔走龙蛇，群妖皆成画中枯骨。」',
      '丹青：「千里江山收于一卷，妖邪退散！」'
    ],
    bossIntro: '丹青：「融魂魔首，你敢污我千里江山图，今日便将你永镇画中！」'
  },
  saga: {
    title: '丹青传 · 山河卷', motive: '镇苑名画《千里山河卷》突生裂墨，丹青携笔入江湖寻补画灵矿。',
    nodes: [
      { place: '丹青苑', name: '研砂', fight: { foe: 'moyu', lv: 'easy', goal: 'ko' },
        pre: [['', '画案朱砂微沸，丹青提笔蘸墨。'], ['墨羽', '水墨与丹青，先比比谁的笔意更沉！'], ['丹青', '请墨先生品鉴这一笔朱砂！']],
        post: [['墨羽', '笔力遒劲，灵矿线索在南边彩石谷。'], ['丹青', '多谢指点。']] },
      { place: '彩石谷', name: '取青', fight: { foe: 'qianji', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '谷中矿石斑斓，千机操控傀丸守在矿脉前。'], ['千机', '这批灵石我要用来铸机关，想拿先过我这关！'], ['丹青', '补画救民，恕不退让！']],
        post: [['千机', '既然为镇压画魔，这方石青便让与你。']],
        choice: { q: '画境裂缝扩大：可先落笔封住外溢妖墨护住城镇，或直入画心修补主卷。', opts: [
          { t: '先封妖墨护城', f: 'seal', say: [['丹青', '青绿封卷，绝不让妖墨漫出画苑！']] },
          { t: '直入画心修卷', f: 'core', say: [['丹青', '直补画心，方能一劳永逸！']] }] } },
      { place: '墨韵桥', name: '设色', fight: { foe: 'xuanji', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '长桥星光点点，玄机驻足观摩画气。'], ['玄机', '画境与星象相冲，先接我星仪三式！'], ['丹青', '丹青落笔，山河自定！']],
        post: [['玄机', '笔意浑然天成，去修补古卷吧。']] },
      { place: '砚池亭', name: '点睛', fight: { foe: 'zuixian', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '亭中墨香混着酒香，醉翁大笑举壶。'], ['醉翁', '山水画里岂能无酒？陪老夫过两招再画！'], ['丹青', '前辈好雅兴，请接笔！']],
        post: [['醉翁', '妙哉！这笔山河气势十足。']] },
      { place: '江山画心', name: '成卷',
        pre: { seal: [['', '城外妖墨已封，墨魔首领在画心现形。'], ['丹青', '百姓无恙，现在由我来为你收笔！']],
          core: [['', '画心裂隙翻涌，魔首企图撕碎古卷。'], ['丹青', '朱砂定魂，千里江山岂容你染指！']] },
        fight: { seal: { foe: 'danqing', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          core: { foe: 'moyu', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { seal: { title: '青绿安民', text: [['', '画苑外烟火如常，古卷重现瑰丽山河。'], ['丹青', '画护苍生，丹青不朽。']] },
          core: { title: '万里丹青', text: [['', '裂墨尽消，千里江山图熠熠生辉。'], ['丹青', '一笔定山河，千秋色不褪。']] } } },
    ] },
});
