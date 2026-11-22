// 幽篁：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'youhuang', skin: 'yu', en: 'You Huang',
  bal: { normal: 0.94, skill: 0.95, ult: 0.94, cd: 1.0, hp: 0.94 },
  char: {
    name: '幽篁', role: "试染师", diff: 3, escCD: 7.0,
    skill: 'venomfan', skill2: 'whiplash', ult: 'thicket', passive: 'none',
    profile: { weapon: "回纹绞带", bio: "幽篁在碱湾染坊做过学徒，记药方只认实测。她把带铅坠的捞布绞带练成了兵器，最烦别人说「大概没毒」。" },
    passiveName: '染坊配方',
    passiveDesc: 'Q 幽篁毒针齐射三枚寒针使对手减速，R 回纹缠带从远处将对手拉近。',
    stat: { hp: 790, walk: 1.06, speed: 1.06, dmg: 0.98, reach: 1.08, swing: 1.06, jump: 1.06, weight: 0.88, defRating: 0.94, guardMax: 95, guardStab: 0.96, guardChip: 0.11, guardRegen: 30, poise: 0.92, size: 0.98 },
    hitFeel: 0.86,
    look: { body: '#352238', shade: '#1d1024', outline: '#f4afcc', outlineA: 0.88, scarf: '#c2528c', slash: '245,137,180', blade: '#fce7cc', hair: '#121c16', head: 'ribbon', weapon: 'dyelash' },
    ai: { range: [120, 270] },
    beats: ['tieshan', 'gouchen'], weakTo: ['feiying', 'yanling']
  },
  forest: {
    title: "幽篁传 · 一缸坏蓝", place: "碱湾染坊",
    synopsis: "碱湾新染料入水变黑，封缸的妖物沿排水渠冒了出来。幽篁带上试纸和绞带，要留一份活证。",
    stageNames: ["取水试色", "封沟隔染", "绞带翻缸", "晾场截污", "留样作证"],
    waveDialogues: [
      "幽篁：「先取样。你倒进去就只剩你的说法了。」",
      "幽篁：「指头变蓝不算中毒。不会弯了才算。」",
      "幽篁：「三枚针是三种剂量。替我记一下，第二枚见效最快。」",
      "幽篁：「我说别碰那缸。好，现在把两只手都举起来给我看。」"
    ],
    bossIntro: "幽篁：「你说这水没事？行，拿只白碗来。」"
  },
  saga: {
    title: "幽篁传 · 蓝从何来", motive: "染坊发了新方子，幽篁的师弟照着做，第二天两只手都握不住筷子。",
    nodes: [
      { place: "碱湾试台", name: "两张纸", fight: { foe: 'moyu', lv: 'easy', goal: 'ko' },
        pre: [["", "墨羽把墨滴在水样里，一张试纸变蓝，一张变灰。"], ["幽篁", "两张都晾着，我要知道哪张先褪色。你守住左边。"]],
        post: [["墨羽", "灰的先褪。那桶水出自夜班。"]] },
      { place: "晾布架", name: "逆洗", fight: { foe: 'lingque', lv: 'normal', goal: 'survive', time: 45 },
        pre: [["", "凌雀的梭子上挂着一截染坏的布。染坊的人正来收走整批。"], ["幽篁", "借你的梭把样布送过河。我把人拖住。"]],
        post: [["凌雀", "布送过去了。不过排水渠里的颜色更深。"]],
        choice: { q: "原缸可以留作证据，但闸下的污水已经快溢出来了。", opts: [
          { t: "先藏原缸保住证据", f: "stealth", say: [["幽篁", "带签子一起藏。没有批号，他们会说是我配的。"]] },
          { t: "先改水道护住下游", f: "direct", say: [["幽篁", "证据以后再找。下游那口井今晚还要有人喝。"]] }] } },
      { place: "明矾窖", name: "辨味", fight: { foe: 'liying', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [["", "两具雾身守着门。门缝里飘出一股酸味。"], ["离影", "我受托守门。你找谁？"], ["幽篁", "拎药罐的。你若真是雾，最好别先尝。"]],
        post: [["离影", "药罐在窖底。掌柜让我别问，我该问的。"]] },
      { place: "下游酒摊", name: "停杯", fight: { foe: 'zuixian', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [["", "醉翁正从渠里舀水给酒客煮茶。"], ["幽篁", "锅放下。要比谁先倒，你喝你的，我等你。"]],
        post: [["醉翁", "锅放下了。老朽现在就挨家挨户收水。"]] },
      { place: "末道滤池", name: "兑方",
        pre: { stealth: [["", "监工拿着同一批染料调出的药，来抢藏在滤池边的原缸。"]],
          direct: [["", "墨羽在滤池边勾出第二道堤。幽篁守着缺口，等他落完最后一笔。"]] },
        fight: { stealth: { foe: 'youhuang', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          direct: { foe: 'moyu', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { stealth: { title: "写清批号", text: [["", "原缸摆到议事桌上，连签子上的指印都还在。"], ["幽篁", "谁配的，谁签。以后连我也一样。"]] },
          direct: { title: "井水无色", text: [["", "原缸里的料冲散了。幽篁带着试纸挨家验井，天亮才收工。"], ["幽篁", "今天的水能喝。明天我还来，记得给我留碗。"]] } } },
    ] },
});
