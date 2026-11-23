// 幽冥：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'youming', skin: 'ym', en: 'You Ming', archetype: 'assassin',
  bal: { normal: 0.94, skill: 0.96, ult: 0.95, cd: 1.0, hp: 0.94 },
  char: {
    name: '幽冥', role: '噬影刺客', diff: 3, escCD: 7.0,
    skill: 'reapdash', skill2: 'soulpull', ult: 'nightmarecut', passive: 'stealth',
    passiveName: '噬影潜行',
    passiveDesc: '身法诡谲难测，双刃连击迅疾致命；Q 噬影掠杀瞬闪穿敌，R 幽冥拘魂扯回中距对手并减速。',
    stat: { hp: 780, walk: 1.11, speed: 1.08, dmg: 1.03, reach: 0.96, swing: 1.1, jump: 1.08, weight: 0.85, defRating: 0.92, guardMax: 90, guardStab: 0.92, guardChip: 0.12, guardRegen: 30, poise: 0.9, size: 0.96 },
    hitFeel: 0.88,
    look: { body: '#1c1528', shade: '#0d0914', outline: '#b26bff', outlineA: 0.9, scarf: '#8f44f5', slash: '180,110,255', blade: '#efe0ff', hair: '#110c1a', head: 'ghost-cowl', weapon: 'reapscythes' },
    ai: { range: [75, 220] },
    beats: ['yuxiao', 'xuanji'], weakTo: ['tieshan', 'polang']
  },
  forest: {
    title: '幽冥传 · 永夜噬影', place: '幽冥鬼市',
    synopsis: '幽冥鬼市灯火骤熄，妖影四起吞噬行人魂魄。幽冥双刃出鞘遁入暗影，以影噬影诛灭群魔！',
    stageNames: ['鬼市灯熄', '暗刃掠影', '幽链拘魂', '夜幕连斩', '永夜诛魔'],
    waveDialogues: [
      '幽冥：「熄了灯，这片黑夜便归我主宰。」',
      '幽冥：「你们的影子，已经出卖了落脚处。」',
      '幽冥：「逃不掉的，幽冥之刃最喜猎杀背影。」',
      '幽冥：「夜幕合拢，魂归幽冥！」'
    ],
    bossIntro: '幽冥：「融魂魔首，敢在幽冥地界玩弄暗影，今夜便收了你的魂！」'
  },
  saga: {
    title: '幽冥传 · 暗影契', motive: '幽冥阁镇魂灯失窃，幽冥踏入黑夜追猎盗灯之徒。',
    nodes: [
      { place: '幽冥巷', name: '夜行', fight: { foe: 'feiying', lv: 'easy', goal: 'ko' },
        pre: [['', '幽暗长街无声无息，幽冥双刃微颤。'], ['绯影', '同在暗处行走，谁的刀更快？'], ['幽冥', '闪开，我的猎物在前面。']],
        post: [['绯影', '好诡异的瞬步，盗灯者往荒坟坡去了。'], ['幽冥', '多谢。']] },
      { place: '荒坟坡', name: '迷魂', fight: { foe: 'liying', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '鬼火明灭，离影的雾身封住坡顶。'], ['离影', '影与雾，谁才是黑夜的主人？'], ['幽冥', '一试便知！']],
        post: [['离影', '你的杀意比雾更冷，过去吧。']],
        choice: { q: '古庙门前：可潜入密道直取镇魂灯，或正面肃清守阵妖影。', opts: [
          { t: '潜入密道夺灯', f: 'shadow', say: [['幽冥', '刺客之道，无声取物最省力。']] },
          { t: '正面肃清妖影', f: 'purge', say: [['幽冥', '留着这些妖影，日后仍是祸患。']] }] } },
      { place: '黑松林', name: '拘影', fight: { foe: 'lingque', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '林间寒芒四射，凌雀飞梭截住去路。'], ['凌雀', '黑灯瞎火乱闯，先接住我的飞梭！'], ['幽冥', '双刃破梭，接招！']],
        post: [['凌雀', '真难缠的影子，祭坛就在林后。']] },
      { place: '阴风殿', name: '绝杀', fight: { foe: 'gouchen', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '铁链拖地作响，勾陈守在殿门。'], ['勾陈', '想拿回镇魂灯？先挣脱我的锁链！'], ['幽冥', '暗影无形，链锁何用！']],
        post: [['勾陈', '好快的双刀……灯在里面。']] },
      { place: '镇魂古坛', name: '归冥',
        pre: { shadow: [['', '镇魂灯近在咫尺，暗影魔首自灯焰中现身。'], ['幽冥', '灯归原主，魂留此处！']],
          purge: [['', '妖影尽灭，魔首暴怒卷起黑潮。'], ['幽冥', '永夜之下，双刃送你归冥！']] },
        fight: { shadow: { foe: 'youming', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          purge: { foe: 'feiying', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { shadow: { title: '幽灯重明', text: [['', '镇魂灯重燃幽蓝微光，鬼市恢复往昔秩序。'], ['幽冥', '影归暗处，灯护幽冥。']] },
          purge: { title: '夜尽魂安', text: [['', '妖影尽散，黑夜重归静谧无声。'], ['幽冥', '有我在夜里，群邪休想妄动。']] } } },
    ] },
});
