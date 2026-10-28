// 雷鸣：这一位侠客的全部数据。改强度、属性、招式、故事都只改这个文件（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'leiming', skin: 'lm', en: 'Lei Ming',
  bal: { normal: 1.067, skill: 1.067, ult: 1.067, cd: 1.0, hp: 1.067 },
  char: { name: '雷鸣', role: '雷拳武僧', diff: 1, escCD: 8.0, skill: 'thunderfist', skill2: 'stomp', ult: 'thunder', passive: 'chain',
    passiveName: '连环', passiveDesc: '六连重拳如惊雷，金刚体魄筋骨强横（520血/1.22体量）；架势耐力深厚且回涌较快（32/秒），金刚雷铠御守引雷反击，防守沉稳转守为攻。',
    stat: { hp: 520, walk: 1.14, speed: 0.70, dmg: 0.94, reach: 0.8, swing: 0.64, jump: 1, weight: 1.22, defRating: 1.02, guardMax: 115, guardStab: 1.25, guardChip: 0.07, guardRegen: 32, poise: 0.90, size: 1.05 }, scaling: 0.04, hitFeel: 0.8,
    moveMods: { l1: { dmgAbs: 19 }, l2: { dmgAbs: 19 }, l3: { dmgAbs: 20 }, l4: { dmgAbs: 20 }, l5: { dmgAbs: 22, kb: [110, 0], launch: false, lunge: 110, next: { light: 'l6', heavy: 'hv' } },
      l6: { p: ['l3s', 'l3a'], su: .09, ac: .08, rc: .24, dmgAbs: 32, kb: [520, -260], stun: .5, hs: .09, box: [20, -92, 116, -46], lunge: 260, launch: true, next: {}, snd: 'heavy' } },   // 六连重拳，第六拳收尾挑飞
    look: { body: '#3a2a22', shade: '#241913', outline: '#ffd84a', outlineA: .8, scarf: '#ffcf3a', slash: '255,230,120', blade: '#fff4c0', head: 'band', weapon: 'fists' },
    ai: { range: [45, 120] }, beats: ['liuyun', 'lingshuang'], weakTo: ['tieshan', 'yuehua'] },
  forest: {
    title: '雷鸣传 · 雷音伏魔', place: '雷音绝顶',
    synopsis: '妖邪侵染雷音宝刹，妄图夺取舍利金身。武僧雷鸣怒目金刚，引九天狂雷入双拳，以刚猛拳意荡涤群魔。',
    stageNames: ['石阶破戒', '金钟抗箭', '狂雷踏地', '金刚怒目', '雷音诛魔'],
    waveDialogues: [
      '雷鸣：「阿弥陀佛！妖孽敢犯山门，休怪贫僧铁拳无情！」',
      '雷鸣：「金刚雷铠护体，弓妖的毒箭便是引下天雷的香火！」',
      '雷鸣：「雷闪贴地，千钧震踏！佛门狮子吼，震碎尔等邪祟！」',
      '雷鸣：「诸位同袍，随贫僧一鼓作气，护住雷音正道！」'
    ],
    bossIntro: '雷鸣：「融汇三家邪功的魔首，且吃贫僧一记九天落雷正法拳！」'
  },
  saga: {
    title: '雷鸣传 · 破戒', motive: '雷音寺戒武。雷鸣为了救山下的村子，一拳打碎了戒律碑。',
    nodes: [
      { place: '雷音顶', name: '戒律碑', fight: { foe: 'tieshan', lv: 'easy', goal: 'ko' },
        pre: [['', '戒律碑碎了一地。住持罚雷鸣下山，带回一百个「不打」的理由。'], ['', '山门外，一个铁塔似的汉子正在劈柴。'], ['铁山', '小和尚，听说你一拳打碎了碑？我这块柴劈不开，你试试。'], ['雷鸣', '出家人不……'], ['铁山', '那就让我试试你。']],
        post: [['铁山', '拳是好拳，就是心里有疙瘩。'], ['铁山', '理由不用找一百个，找到一个真的就够。']] },
      { place: '古寺', name: '不打的理由', fight: { foe: 'zuixian', lv: 'normal', goal: 'survive', time: 50, mySc: ['guard_wall'] },
        pre: [['', '路过的古寺里，一个醉翁在佛像前喝酒。'], ['雷鸣', '施主，佛前不可饮酒。'], ['醉翁', '那你来抢啊。不过你不能还手，不然又破戒了。']],
        post: [['醉翁', '一拳都没还，能忍。'], ['醉翁', '可你知道吗，忍和不打不是一回事。你忍的时候，拳头一直攥着。']] },
      { place: '血月谷', name: '山下的村子', fight: { foe: 'gouchen', lv: 'hard', goal: 'ko', foeSc: ['bx_venom'] },
        pre: [['', '雷鸣回到当初救下的村子。村子又被围了，领头的还是那个使链锤的。'], ['勾陈', '上次被个和尚打跑了。这次我带够了人。'], ['雷鸣', '……这次我也带够了理由。']],
        post: [['勾陈', '你们和尚，不是不打人吗？'], ['雷鸣', '我在找答案。'], ['', '村民们跪在地上谢他。雷鸣却想起了住持的话：拳头打得走一个恶人，打不走下一个。']],
        choice: { q: '拳头救了村子，却打碎了戒律。', opts: [
          { t: '回山认罚，重立戒律碑', f: 'vow', say: [['雷鸣', '我回山认罚。但新碑上，我要加一条。'], ['村长', '加什么？'], ['雷鸣', '回去就知道了。']] },
          { t: '还俗，留在山下护村', f: 'world', say: [['雷鸣', '寺里有一百个和尚念经，山下只有我一个能挡刀。'], ['', '他摘下了念珠，挂在村口的树上。']] }] } },
      { place: '雷音顶', name: '雷雨', fight: { foe: 'yuehua', lv: 'hard', goal: 'ko', foeSc: ['bx_thunder'] },
        pre: [['', '雷雨夜，雷音顶上来了一位月宫的宗师。'], ['月华', '我的镜子照见你会让雷音寺毁于一旦。我来看看，你是哪一种雷。']],
        post: [['月华', '镜子里的雷劈碎了寺，也劈开了一条路。'], ['月华', '去吧，住持在等你。']] },
      { place: '雷音寺', name: '一百个理由',
        pre: { vow: [['', '雷鸣跪在新立的戒律碑前。住持让他做最后一件事：和自己打一场。'], ['住持', '心里那个想出拳的你，赢了他，戒律才算立住。']],
          world: [['', '雷鸣下山前，来送他的是一个吹箫的乐师，奉住持之命。'], ['玉箫', '住持说，要走可以，先让我听听你拳里的声音还干不干净。']] },
        fight: { vow: { foe: 'leiming', lv: 'impossible', goal: 'ko', foeSc: ['bx_enrage', 'bx_thunder'] },
          world: { foe: 'yuxiao', lv: 'impossible', goal: 'ko', foeSc: ['bx_regen', 'bx_haste'] } },
        end: { vow: { title: '新戒', text: [['', '新碑立在雷音顶上，比旧碑多了一行字：「戒武，不戒护人。」'], ['', '从此雷音寺的和尚每天多练一个时辰的拳。山下的村子再没有被围过。'], ['', '雷鸣成了戒律院的首座，管的第一条规矩是：谁也不许打碎这块碑。']] },
          world: { title: '护村人', text: [['玉箫', '拳声干净。住持让我告诉你：佛不在寺里，在你护着的人那里。'], ['', '雷鸣在村口开了一间武馆，不收学费，只教孩子们怎么护住自己。'], ['', '村口那棵树上的念珠，被雨淋了十年，一颗都没有掉。']] } } },
    ] },
});
