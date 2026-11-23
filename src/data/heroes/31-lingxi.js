// 灵犀：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'lingxi', skin: 'lx', en: 'Ling Xi', archetype: 'controller',
  bal: { normal: 0.94, skill: 0.95, ult: 0.94, cd: 1.0, hp: 0.95 },
  char: {
    name: '灵犀', role: '音律控场', diff: 3, escCD: 7.5,
    skill: 'mindwave', skill2: 'echostun', ult: 'spiritdomain', passive: 'counter',
    passiveName: '心有灵犀',
    passiveDesc: '以玉笛音律洞察先机、控场制敌；Q 灵犀音波远距扩散减速，R 余音震魄反制暗器并震晕近敌。',
    stat: { hp: 805, walk: 1.02, speed: 1.02, dmg: 0.98, reach: 1.06, swing: 1.02, jump: 1.02, weight: 0.9, defRating: 0.98, guardMax: 100, guardStab: 1.02, guardChip: 0.09, guardRegen: 30, poise: 0.96, size: 0.98 },
    hitFeel: 0.9,
    look: { body: '#e5f5f2', shade: '#8ab8b0', outline: '#4ce6c8', outlineA: 0.9, scarf: '#2ec9aa', slash: '95,235,210', blade: '#e8fffb', hair: '#122420', head: 'jade', weapon: 'flute' },
    ai: { range: [130, 290] },
    beats: ['feiying', 'lingque'], weakTo: ['chixiao', 'tieshan']
  },
  forest: {
    title: '灵犀传 · 清音涤心', place: '灵犀竹阁',
    synopsis: '魔音侵扰灵犀竹阁，四野妖物躁动不安。灵犀吹响碧玉长笛，以澄明清音荡涤群魔心神！',
    stageNames: ['玉笛初鸣', '清音破障', '余韵定风', '回响困妖', '灵犀镇魔'],
    waveDialogues: [
      '灵犀：「听见这声清笛了吗？心神不宁者，先退三步。」',
      '灵犀：「音波扩散，进退皆在我掌握之中。」',
      '灵犀：「余音绕梁，群妖休想再进一步！」',
      '灵犀：「曲至高潮，魔音尽散！」'
    ],
    bossIntro: '灵犀：「融魂魔首，你以浊音乱世，今日便听我一曲灵犀清音！」'
  },
  saga: {
    title: '灵犀传 · 碧笛吟', motive: '江湖突现摄魂魔曲，灵犀携玉笛寻访乐谱残卷以解众生之厄。',
    nodes: [
      { place: '灵犀阁', name: '听弦', fight: { foe: 'yuxiao', lv: 'easy', goal: 'ko' },
        pre: [['', '竹影摇曳，灵犀横笛静听风声。'], ['玉箫', '同道中人，不如以乐会友，合奏一曲？'], ['灵犀', '正有此意，请指教音律！']],
        post: [['玉箫', '笛音空灵清越，魔曲源头似乎在东岸古亭。'], ['灵犀', '多谢相告。']] },
      { place: '回音涧', name: '辨律', fight: { foe: 'xuanji', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '山涧回声阵阵，玄机运转星仪测算音脉。'], ['玄机', '星象示警，让我先试探你的笛音是否藏邪！'], ['灵犀', '清浊自明，请听此调！']],
        post: [['玄机', '音律中正平和，确是克制魔曲之法。']],
        choice: { q: '古亭内外：可吹奏安魂调先救中邪乐师，或直入亭中毁去魔琴。', opts: [
          { t: '先奏安魂救人', f: 'soothe', say: [['灵犀', '曲本为济世，先解诸位乐师之苦！']] },
          { t: '直入毁去魔琴', f: 'shatter', say: [['灵犀', '魔琴一日不毁，魔音一日不绝！']] }] } },
      { place: '听涛轩', name: '绝响', fight: { foe: 'cixian', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '磁石悬空嗡鸣，磁仙挡在轩门前。'], ['磁仙', '磁力与音波，看看谁更能扰乱对方心神！'], ['灵犀', '灵犀一动，万籁皆寂！']],
        post: [['磁仙', '好通透的笛音，魔琴就在里间。']] },
      { place: '翠微台', name: '清韵', fight: { foe: 'moyu', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '墨气翻涌，墨羽挥毫设下墨阵。'], ['墨羽', '以画困音，看看你的笛声能否穿出墨海！'], ['灵犀', '清音无阻，破阵！']],
        post: [['墨羽', '音透纸背，佩服。']] },
      { place: '古乐残亭', name: '心印',
        pre: { soothe: [['', '乐师苏醒，魔琴化作黑影直扑而来。'], ['灵犀', '人心已安，魔音再无立足之地！']],
          shatter: [['', '魔琴碎裂，怨念凝成魔首咆哮而出。'], ['灵犀', '一曲灵犀，送你归于寂静！']] },
        fight: { soothe: { foe: 'lingxi', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          shatter: { foe: 'yuxiao', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { soothe: { title: '清音济世', text: [['', '亭中重响清雅雅乐，诸位乐师拱手拜谢。'], ['灵犀', '心有灵犀，清音长存。']] },
          shatter: { title: '魔音永寂', text: [['', '魔琴化作尘烟，四方再无摄魂杂音。'], ['灵犀', '浊音已散，天地复明。']] } } },
    ] },
});
