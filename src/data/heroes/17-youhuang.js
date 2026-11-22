// 幽篁：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'youhuang', skin: 'yu', en: 'You Huang',
  bal: { normal: 0.94, skill: 0.95, ult: 0.94, cd: 1.0, hp: 0.94 },
  char: {
    name: '幽篁', role: '竹鞭毒师', diff: 3, escCD: 7.0,
    skill: 'venomfan', skill2: 'whiplash', ult: 'thicket', passive: 'none',
    passiveName: '幽竹缠毒',
    passiveDesc: '灵活轻捷的竹林策士；Q 幽篁毒针齐射三枚寒针减速敌人，R 青竹缠鞭远距抽击并将敌拉近。',
    stat: { hp: 790, walk: 1.06, speed: 1.06, dmg: 0.98, reach: 1.08, swing: 1.06, jump: 1.06, weight: 0.88, defRating: 0.94, guardMax: 95, guardStab: 0.96, guardChip: 0.11, guardRegen: 30, poise: 0.92, size: 0.98 },
    hitFeel: 0.86,
    look: { body: '#1c3329', shade: '#0e1d16', outline: '#5ee8a0', outlineA: 0.88, scarf: '#2fd080', slash: '85,235,155', blade: '#dffef0', hair: '#121c16', head: 'bamboohat', weapon: 'hammer' },
    ai: { range: [120, 270] },
    beats: ['tieshan', 'gouchen'], weakTo: ['feiying', 'yanling']
  },
  forest: {
    title: '幽篁传 · 翠影除瘴', place: '幽篁深谷',
    synopsis: '幽篁深谷毒瘴四起，群妖借林影藏身。幽篁挥动青竹长鞭，以毒攻毒清扫魔林！',
    stageNames: ['翠影初动', '寒针破雾', '青鞭缠风', '竹海迷阵', '幽篁清瘴'],
    waveDialogues: [
      '幽篁：「藏在竹影里？这片林子我比你们熟。」',
      '幽篁：「三枚毒针封路，看你们往哪躲！」',
      '幽篁：「青竹长鞭所及之处，寸步难行。」',
      '幽篁：「竹海合围，该收网了。」'
    ],
    bossIntro: '幽篁：「融魂魔首，你污染了整片竹谷，今日便用青竹鞭了结你！」'
  },
  saga: {
    title: '幽篁传 · 翠鞭引', motive: '幽篁竹谷灵泉突染黑毒，幽篁循毒踪入江湖查明幕后黑手。',
    nodes: [
      { place: '幽篁谷口', name: '毒泉', fight: { foe: 'moyu', lv: 'easy', goal: 'ko' },
        pre: [['', '竹叶婆娑，幽篁捻起一滴黑水。'], ['墨羽', '这墨毒颇为古怪，莫急，先试过你身手。'], ['幽篁', '请墨先生指教！']],
        post: [['墨羽', '鞭法灵动，去东边竹林找寻毒源吧。']] },
      { place: '翠风坡', name: '暗针', fight: { foe: 'lingque', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '竹梢寒光一闪，凌雀飞梭掠过。'], ['凌雀', '比比谁的暗器更快？'], ['幽篁', '正合我意！']],
        post: [['凌雀', '好刁钻的毒针，毒源就在前面古亭。']],
        choice: { q: '古亭内外：可潜行绕后截断毒囊，或正面破阵震散瘴气。', opts: [
          { t: '潜行截断毒囊', f: 'stealth', say: [['幽篁', '悄无声息拔除毒囊最为稳妥。']] },
          { t: '正面震散毒瘴', f: 'direct', say: [['幽篁', '以鞭引风，一举吹散毒瘴！']] }] } },
      { place: '寒竹亭', name: '缠风', fight: { foe: 'liying', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '雾影重重，离影现身亭中。'], ['离影', '竹林雾大，你分得清真身吗？'], ['幽篁', '长鞭横扫，真假立判！']],
        post: [['离影', '鞭影如网，佩服。']] },
      { place: '毒潭栈桥', name: '清源', fight: { foe: 'zuixian', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '醉翁倚栏独酌，挡在潭口。'], ['醉翁', '以酒解毒，不如先陪老夫过两招！'], ['幽篁', '前辈请出招！']],
        post: [['醉翁', '痛快！潭底便交给你了。']] },
      { place: '万竹灵泉', name: '澄翠',
        pre: { stealth: [['', '毒囊已破，暗影魔首暴怒现身。'], ['幽篁', '万竹听令，清瘴！']],
          direct: [['', '瘴气尽散，魔首直扑而来。'], ['幽篁', '来得正好，青竹鞭已蓄满毒劲！']] },
        fight: { stealth: { foe: 'youhuang', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          direct: { foe: 'moyu', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { stealth: { title: '翠影澄泉', text: [['', '灵泉重现碧色，竹林再起清风。'], ['幽篁', '林静泉清，足矣。']] },
          direct: { title: '清风扫瘴', text: [['', '漫山翠竹摇曳，江湖再无黑瘴之忧。'], ['幽篁', '幽篁仍在，邪毒难侵。']] } } },
    ] },
});
