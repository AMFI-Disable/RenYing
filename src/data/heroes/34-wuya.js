// 无涯：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'wuya', skin: 'wy', en: 'Wu Ya', archetype: 'swordsman',
  bal: { normal: 0.94, skill: 0.95, ult: 0.95, cd: 1.0, hp: 0.96 },
  char: {
    name: '无涯', role: '居合剑圣', diff: 3, escCD: 7.5,
    skill: 'iaidodraw', skill2: 'voidstep', ult: 'endlessblade', passive: 'counter',
    passiveName: '无涯剑意',
    passiveDesc: '收鞘蓄势，出剑即决胜负；Q 无涯居合瞬闪拔刀穿斩，R 踏虚斩影闪避反击并挥出远程剑气。',
    stat: { hp: 850, walk: 1.04, speed: 1.05, dmg: 1.05, reach: 1.08, swing: 1.05, jump: 1.02, weight: 0.98, defRating: 1.02, guardMax: 108, guardStab: 1.06, guardChip: 0.08, guardRegen: 29, poise: 1.05, size: 1.0 },
    hitFeel: 1.02,
    look: { body: '#1a2030', shade: '#0c101a', outline: '#d8e4ff', outlineA: 0.92, scarf: '#7c96d8', slash: '215,230,255', blade: '#f8fbff', hair: '#141822', head: 'topknot', weapon: 'sword' },
    ai: { range: [95, 245] },
    beats: ['qianji', 'xuanji'], weakTo: ['tieshan', 'bawang']
  },
  forest: {
    title: '无涯传 · 一剑破境', place: '剑冢断崖',
    synopsis: '剑冢断崖魔气冲天，万剑悲鸣不止。无涯按剑归鞘步入妖阵，以无涯居合斩尽群魔！',
    stageNames: ['断崖按剑', '拔刀初鸣', '踏虚斩影', '剑意纵横', '无涯绝境'],
    waveDialogues: [
      '无涯：「剑未出鞘，胜负已分。」',
      '无涯：「看清这一刀的轨迹了吗？」',
      '无涯：「踏虚而行，剑气无涯。」',
      '无涯：「万剑归寂，尔等退散！」'
    ],
    bossIntro: '无涯：「融魂魔首，接得住我这一记居合，再谈胜负！」'
  },
  saga: {
    title: '无涯传 · 剑心劫', motive: '剑冢镇山古剑骤裂，无涯携残鞘行走江湖寻找铸剑真意。',
    nodes: [
      { place: '剑冢口', name: '按鞘', fight: { foe: 'qingfeng', lv: 'easy', goal: 'ko' },
        pre: [['', '风卷落叶，无涯按住腰间剑柄。'], ['青锋', '久闻居合剑圣之名，请赐一剑！'], ['无涯', '出剑吧，莫留余力。']],
        post: [['青锋', '好快的一刀！古剑残气似乎飘向了西岭。'], ['无涯', '承让。']] },
      { place: '试剑坪', name: '拔锋', fight: { foe: 'liying', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '石坪雾起，离影刀锋隐于白雾。'], ['离影', '雾中分身千百，你这一刀斩向何处？'], ['无涯', '心无旁骛，一刀足以破雾！']],
        post: [['离影', '好纯粹的剑意，佩服。']],
        choice: { q: '西岭剑炉前：可静心重铸残剑以镇魔气，或直追逃逸的剑煞魔影。', opts: [
          { t: '先镇剑炉重铸', f: 'forge', say: [['无涯', '剑心稳固，方能斩尽外邪。']] },
          { t: '直追剑煞魔影', f: 'chase', say: [['无涯', '剑煞不除，必祸及沿途生灵！']] }] } },
      { place: '听剑峡', name: '踏虚', fight: { foe: 'lingshuang', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '峡风如刃，凌霜挺枪迎面而立。'], ['凌霜', '一寸长一寸强，你的拔刀术近得了身吗？'], ['无涯', '踏虚一瞬，便是咫尺！']],
        post: [['凌霜', '好一记踏虚斩影，前路归你。']] },
      { place: '孤峰台', name: '归寂', fight: { foe: 'chixiao', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '夕阳如血，炽霄火戟直指孤峰。'], ['炽霄', '让我见识居合剑圣的巅峰一斩！'], ['无涯', '接剑！']],
        post: [['炽霄', '痛快，剑煞就在峰顶。']] },
      { place: '无涯峰顶', name: '剑极',
        pre: { forge: [['', '剑炉重燃清光，剑煞魔首破空袭来。'], ['无涯', '剑已成，请君试锋！']],
          chase: [['', '剑煞被逼至绝崖，化作魔首反扑。'], ['无涯', '剑气无涯，今日彻底了结！']] },
        fight: { forge: { foe: 'wuya', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          chase: { foe: 'qingfeng', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { forge: { title: '剑心澄明', text: [['', '古剑重归剑冢，万剑齐鸣致敬。'], ['无涯', '剑有尽，意无涯。']] },
          chase: { title: '一剑封煞', text: [['', '剑煞消散于云海，孤峰重归寂静。'], ['无涯', '归鞘之日，天下太平。']] } } },
    ] },
});
