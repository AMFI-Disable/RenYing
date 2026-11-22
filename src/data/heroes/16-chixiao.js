// 炽霄：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'chixiao', skin: 'ch', en: 'Chi Xiao',
  bal: { normal: 0.92, skill: 0.94, ult: 0.95, cd: 1.0, hp: 0.96 },
  char: {
    name: '炽霄', role: "巡火人", diff: 2, escCD: 7.5,
    skill: 'flamehalberd', skill2: 'blazering', ult: 'skyfall', passive: 'armor',
    profile: { weapon: "三齿火耙", bio: "炽霄曾在百炉坊烧饼，现在带街坊巡火。她说话像报更，句句要人答应；每救出一个人，就在火耙柄上刻一道线。" },
    passiveName: '炉火护身',
    passiveDesc: '重击与蓄力攻击附带短暂霸体；Q 烈焰突刺与 R 炎轮扫荡命中后点燃对手。',
    stat: { hp: 860, walk: 0.96, speed: 0.95, dmg: 1.04, reach: 1.12, swing: 0.9, jump: 1.0, weight: 1.15, defRating: 1.08, guardMax: 110, guardStab: 1.05, guardChip: 0.08, guardRegen: 27, poise: 1.12, size: 1.04 },
    hitFeel: 1.05,
    look: { body: '#3b1c18', shade: '#1f0d0a', outline: '#ff7a45', outlineA: 0.9, scarf: '#ff4d2e', slash: '255,115,65', blade: '#ffe6d0', hair: '#1d1210', head: 'headband', weapon: 'firerake' },
    ai: { range: [100, 240] },
    beats: ['qianji', 'lingque'], weakTo: ['lingshuang', 'liuyun']
  },
  forest: {
    title: "炽霄传 · 炉街夜班", place: "百炉坊",
    synopsis: "地底的窑火沿着废烟道钻进民居，妖物也跟着出来了。炽霄提起拆火用的三齿耙，挨家挨户叫醒街坊。",
    stageNames: ["叩门报火", "拆棚断火", "烟道逆行", "清点街坊", "封窑留灯"],
    waveDialogues: [
      "炽霄：「听得见就应一声。咳嗽也算。」",
      "炽霄：「拆棚前先看棚下。耙子举高，别碰着人。」",
      "炽霄：「出门不必锁门。钥匙留着，回来还能用。」",
      "炽霄：「名单上还有两个。再看一遍，别嫌我啰嗦。」"
    ],
    bossIntro: "炽霄：「刚才应声的都到我身后。剩下这一窑归我。」"
  },
  saga: {
    title: "炽霄传 · 缺一声", motive: "百炉坊的窑主锁住了泄烟闸，炽霄敲遍一条街，唯独没人从地下作坊答应。",
    nodes: [
      { place: "揭瓦巷", name: "敲门", fight: { foe: 'tieshan', lv: 'easy', goal: 'ko' },
        pre: [["", "半条街在冒烟，铁山还扶着一堵歪墙。"], ["铁山", "里头空了，我亲自看过。"], ["炽霄", "看过地面。现在让我看看地底。"]],
        post: [["铁山", "墙我扶着。你带人下去。"]] },
      { place: "回烟井", name: "听声", fight: { foe: 'lingshuang', lv: 'normal', goal: 'survive', time: 45 },
        pre: [["", "井底每响一次，就会倒灌一口热烟。"], ["凌霜", "这里守住四十五息，我带街坊过桥。"]],
        post: [["炽霄", "桥上都到了。地下还有敲管子的声音。"]],
        choice: { q: "开闸能给暗道换气，走暗道则能立刻接应最深处的工人。", opts: [
          { t: "先开泄烟闸", f: "source", say: [["炽霄", "先给他们一口能喘的气。"]] },
          { t: "从暗道接人", f: "rescue", say: [["炽霄", "听见我就敲两下。我下来了。"]] }] } },
      { place: "侧风廊", name: "留缝", fight: { foe: 'leiming', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [["", "雷鸣要砸开石门，炽霄用耙柄顶住了门缝。"], ["炽霄", "先留条缝。你听，里头有人在数数。"]],
        post: [["雷鸣", "我听见了。你撬门，我拉人。"]] },
      { place: "三岔烟道", name: "借链", fight: { foe: 'gouchen', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [["", "勾陈只接了拖走窑主的活。他把链子扣上了升降筐。"], ["炽霄", "先拉一筐工人。要加工钱，算我头上。"]],
        post: [["勾陈", "工钱回头再算。把筐装满。"]] },
      { place: "百炉总闸", name: "最后一户",
        pre: { source: [["", "闸杆发红，积在烟道里的火凝成了一个握耙的人影。"]],
          rescue: [["", "铁山撑着总闸。炽霄必须守住筐口，等最后一趟升上来。"]] },
        fight: { source: { foe: 'chixiao', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          rescue: { foe: 'tieshan', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { source: { title: "门门有人", text: [["", "闸门升起，整条街第一次看清天色。工人自己从暗道走了出来。"], ["炽霄", "数一遍。再数一遍。行，今天我请烧饼。"]] },
          rescue: { title: "把钥匙留下", text: [["", "百炉坊烧掉了三间店。出筐的工人把钥匙挂在废屋门框上，约好重建那天再来取。"], ["炽霄", "把我那把也挂上。往左一点，让我认得出来。"]] } } },
    ] },
});
