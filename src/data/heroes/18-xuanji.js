// 玄机：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'xuanji', skin: 'xj', en: 'Xuan Ji',
  bal: { normal: 0.93, skill: 0.95, ult: 0.95, cd: 1.0, hp: 0.95 },
  char: {
    name: '玄机', role: "报时匠", diff: 3, escCD: 7.5,
    skill: 'starorb', skill2: 'gravwell', ult: 'celestial', passive: 'none',
    profile: { weapon: "三臂星规", bio: "玄机在刻漏城给各街的钟校时，从不接受「差不多」。他用折叠星规观星，随身带着一本小册，专记自己算错的地方。" },
    passiveName: '星枢引力',
    passiveDesc: 'Q 星规流火远程压制，R 天枢重力牵引对手并削减架势，E 星宿归元用连击破阵。',
    stat: { hp: 810, walk: 1.0, speed: 1.0, dmg: 1.0, reach: 1.05, swing: 0.96, jump: 1.02, weight: 0.96, defRating: 1.0, guardMax: 102, guardStab: 1.0, guardChip: 0.09, guardRegen: 29, poise: 1.0, size: 1.0 },
    hitFeel: 0.92,
    look: { body: '#1b2140', shade: '#0d1126', outline: '#9ea8ff', outlineA: 0.92, scarf: '#6e7bff', slash: '155,170,255', blade: '#eef0ff', hair: '#15182c', head: 'astro-crown', weapon: 'stargauge' },
    ai: { range: [130, 290] },
    beats: ['moyu', 'yuxiao'], weakTo: ['feiying', 'chixiao']
  },
  forest: {
    title: "玄机传 · 漏掉一刻", place: "刻漏城",
    synopsis: "刻漏城每晚都少走一刻，钟漏一停，妖群便从空掉的刻度里爬出来。玄机立起星规，要查明谁挪走了这一刻。",
    stageNames: ["校准子夜", "追查漏刻", "更鼓错拍", "星规对点", "还民一刻"],
    waveDialogues: [
      "玄机：「记下来。它比刚才早到一息。」",
      "玄机：「第四响迟了半拍。重敲，我这次不数妖。」",
      "玄机：「谁动了我的规尺？很好，你调得比我准。」",
      "玄机：「我算错了一次。现在换你们数，我守。」"
    ],
    bossIntro: "玄机：「你偷走的是别人的一刻。还回来，我可以不问你用它做了什么。」"
  },
  saga: {
    title: "玄机传 · 慢一刻", motive: "玄机校好全城的钟，只有母亲生前值守的东楼仍慢一刻。那一刻里竟然还能听见她的更鼓。",
    nodes: [
      { place: "东楼更台", name: "多一拍", fight: { foe: 'yuehua', lv: 'easy', goal: 'ko' },
        pre: [["", "月华两次掠过钟面。第二次，玄机没听见落脚声。"], ["玄机", "照刚才的步子再走一遍。我想知道漏的是声音，还是时辰。"]],
        post: [["月华", "漏掉的是时辰。我也记不得那一步。"]] },
      { place: "城底水钟", name: "刻痕", fight: { foe: 'cixian', lv: 'normal', goal: 'survive', time: 45 },
        pre: [["", "磁仙按住一面乱跳的铜盘，盘上有一段磨得发亮。"], ["磁仙", "你计时。我给它加一点阻力，看看什么时候会再跳。"]],
        post: [["玄机", "四十五息里跳了两次。每次都绕过我娘刻的那一道。"]],
        choice: { q: "可抹去重复的旧刻，也可把它分到各楼，每年只准响一次。", opts: [
          { t: "让旧刻走完", f: "seal", say: [["玄机", "我总不能让她天天值这一班。"]] },
          { t: "为全城留一刻", f: "channel", say: [["玄机", "每年借一刻。把这笔账写在城门上，谁都能查。"]] }] } },
      { place: "更鼓长廊", name: "听错", fight: { foe: 'yuxiao', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [["", "玉箫照着旧谱打拍子，每到末尾总空出一拍。"], ["玄机", "谱上没写空拍。"], ["玉箫", "写谱的人知道，听的人要喘气。"]],
        post: [["玄机", "原来我娘也漏过拍。我一直以为是我数错了。"]] },
      { place: "西楼配重室", name: "借重", fight: { foe: 'qianji', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [["", "千机用金丝拴住了铅坠。上面的齿轮每动一格，下面便亮起一户人家。"], ["千机", "你要取出那一刻，得有人接住这些钟。"], ["玄机", "我来。先用你的傀丸试我的星规。"]],
        post: [["千机", "这回算准了。上楼吧。"]] },
      { place: "总更台", name: "交班",
        pre: { seal: [["", "握着星规的影子迟迟不肯敲响末更。玄机认出了自己抬手的样子。"]],
          channel: [["", "磁仙稳住铜盘，震荡却一阵比一阵重。玄机要撑到各楼都接住这段时辰。"]] },
        fight: { seal: { foe: 'xuanji', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          channel: { foe: 'cixian', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { seal: { title: "准点放行", text: [["", "东楼终于报出了下一更。玄机把母亲的名字从值夜簿抄进家谱。"], ["玄机", "准点。现在我可以想她了。"]] },
          channel: { title: "一年一刻", text: [["", "以后每年有一夜，全城停钟一刻。有人想家，有人听雨，还有人只想再睡一会。"], ["玄机", "我给这条加个附注。睡觉也算用过。"]] } } },
    ] },
});
