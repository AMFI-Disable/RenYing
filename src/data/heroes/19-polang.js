// 破浪：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'polang', skin: 'pl', en: 'Po Lang',
  bal: { normal: 0.92, skill: 0.94, ult: 0.94, cd: 1.0, hp: 0.96 },
  char: {
    name: '破浪', role: "捞船人", diff: 2, escCD: 8.0,
    skill: 'tidalslam', skill2: 'undertow', ult: 'maelstrom', passive: 'armor',
    profile: { weapon: "燕尾救生锚", bio: "破浪小时候靠一根空船绳活下来，如今在回头湾捞船也捞人。他一害怕就笑得格外响，还给每条靠岸的船起外号。" },
    passiveName: '沧澜重锚',
    passiveDesc: '重击与蓄力攻击附带短暂霸体；Q 怒涛震锚重创架势并挑飞对手，R 破浪突进携霸体冲锋。',
    stat: { hp: 900, walk: 1.0, speed: 0.9, dmg: 1.06, reach: 1.1, swing: 0.86, jump: 1.04, weight: 1.18, defRating: 1.08, guardMax: 120, guardStab: 1.1, guardChip: 0.07, guardRegen: 26, poise: 1.2, size: 1.08 },
    hitFeel: 1.12,
    look: { body: '#193545', shade: '#0c1c26', outline: '#54d8ff', outlineA: 0.9, scarf: '#2ca8d8', slash: '80,210,255', blade: '#dff8ff', hair: '#142028', head: 'wave-visor', weapon: 'rescueanchor' },
    ai: { range: [75, 215] },
    beats: ['feiying', 'chixiao'], weakTo: ['youhuang', 'xuanji']
  },
  forest: {
    title: "破浪传 · 空船回信", place: "回头湾",
    synopsis: "回头湾漂来一队无人渡船，船底却缠着活人的求救绳。破浪卸下救生锚，一条条把船拉回浅滩。",
    stageNames: ["空船撞岸", "水底牵绳", "双钩挂礁", "接人上滩", "退潮数船"],
    waveDialogues: [
      "破浪：「这艘叫漏勺。漏勺，你给我浮稳了。」",
      "破浪：「绳子扯三下就是有人。扯四下是我没听清。」",
      "破浪：「哈哈哈。听见我笑就把绳攥紧点。」",
      "破浪：「一个个上岸。谁说自己不怕，谁就先帮我扶梯子。」"
    ],
    bossIntro: "破浪：「老伙计，把绳借我。水底那位脾气大，咱们别跟他客气。」"
  },
  saga: {
    title: "破浪传 · 捞错一条船", motive: "撤渡那年，破浪亲手割过一条拖绳。如今同一条船空着漂回来，舱里多了正在划动的桨。",
    nodes: [
      { place: "回头湾旧埠", name: "认船", fight: { foe: 'qingfeng', lv: 'easy', goal: 'ko' },
        pre: [["", "青锋拦下空船，船头露出一道补过的裂痕。"], ["破浪", "是歪嘴。裂的那边是我补的。她还肯回来骂我，真好。"]],
        post: [["青锋", "桨还在划。去看一眼吧，我替你拴住。"]] },
      { place: "双绳浮桥", name: "回拉", fight: { foe: 'gouchen', lv: 'normal', goal: 'survive', time: 45 },
        pre: [["", "勾陈的链钩扯住了浮桥。每一道浪都把桥往外推一寸。"], ["破浪", "链子借我受个力。你别收劲，让我试试锚会不会脱。"]],
        post: [["勾陈", "锚没脱。可旧渡口和这浮桥，你只能先挂一边。"]],
        choice: { q: "先走旧渡道能赶到空船旁，先系浮桥能给幸存者留一条退路。", opts: [
          { t: "沿旧渡道追船", f: "eye", say: [["破浪", "这回我上船。该听谁骂，我就在那儿听。"]] },
          { t: "先把浮桥系牢", f: "beacon", say: [["破浪", "骂我可以等。过桥的人等不了。"]] }] } },
      { place: "倒潮闸口", name: "等风", fight: { foe: 'liuyun', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [["", "流云站在闸上，风把绳吹得笔直。"], ["破浪", "别把风都收了。绳子松了，我就摸不到回去的路。"]],
        post: [["流云", "我留一股横风。你沿绳走，别顺浪漂。"]] },
      { place: "翻壳船坞", name: "报数", fight: { foe: 'tieshan', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [["", "铁山顶住翻过来的船壳，下面还有人在敲木板。"], ["破浪", "扛得住多久？说实数。我会笑，手会抖，数不会错。"]],
        post: [["铁山", "够你回返一趟。用你那双钩，别再割绳。"]] },
      { place: "风眼系缆柱", name: "收绳",
        pre: { eye: [["", "歪嘴船上站着年少的破浪，刀已架在湿透的拖绳上。"]],
          beacon: [["", "勾陈守着桥外一头。破浪扛住内侧浪涌，等众人全部走过浮桥。"]] },
        fight: { eye: { foe: 'polang', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          beacon: { foe: 'gouchen', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { eye: { title: "空船有名", text: [["", "破浪握住自己的手，把刀放下。退潮时，他拖回了歪嘴和满船的旧渡票。"], ["破浪", "往后叫她回来的船。歪嘴这名字，也留着。"]] },
          beacon: { title: "桥上满员", text: [["", "空船不见了，浮桥上却挤满了人。有人问破浪要收多少渡钱。"], ["破浪", "一人喊一声到。听齐了我就收摊。"]] } } },
    ] },
});
