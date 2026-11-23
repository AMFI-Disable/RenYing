// 银狐：这一位侠客的全部数据（字段说明在 src/data/00-heroes.js）。
defHero({
  id: 'yinhu', skin: 'fx', en: 'Yin Hu', archetype: 'assassin',
  bal: { normal: 0.94, skill: 0.95, ult: 0.95, cd: 1.0, hp: 0.93 },
  char: {
    name: '银狐', role: '幻月影刺', diff: 3, escCD: 6.5,
    skill: 'foxstep', skill2: 'miragecut', ult: 'ninestrike', passive: 'stealth',
    passiveName: '幻月狐踪',
    passiveDesc: '身法诡谲的月下刺客；Q 狐步幻移穿影掠至敌后突袭并强化下击，R 幻月双斩凌空双刃连切打断起手。',
    stat: { hp: 785, walk: 1.14, speed: 1.12, dmg: 1.02, reach: 0.96, swing: 1.12, jump: 1.1, weight: 0.84, defRating: 0.92, guardMax: 90, guardStab: 0.94, guardChip: 0.12, guardRegen: 30, poise: 0.9, size: 0.94 },
    hitFeel: 0.86,
    look: { body: '#272038', shade: '#130e1e', outline: '#d4b8ff', outlineA: 0.92, scarf: '#a78bfa', slash: '212,184,255', blade: '#f5f0ff', hair: '#e8e4f5', head: 'silver-ears', weapon: 'foxdaggers' },
    ai: { range: [65, 200] },
    beats: ['xuanji', 'yuxiao'], weakTo: ['tieshan', 'xuanwu']
  },
  forest: {
    title: '银狐传 · 幻月猎妖', place: '幻月幽林',
    synopsis: '残月高悬，妖魅借雾气潜入幻月幽林。银狐戴起狐面手握银月双刃，化影掠林猎杀群魔！',
    stageNames: ['月影潜踪', '狐步穿林', '双刃破雾', '幻夜追猎', '九尾断妖'],
    waveDialogues: [
      '银狐：「月色正好，你们的影子已经出卖了行踪。」',
      '银狐：「看清我的真身了吗？太晚了。」',
      '银狐：「双刃无声，群妖不过是月下猎物！」',
      '银狐：「狐步已至，今夜一个也别想逃！」'
    ],
    bossIntro: '银狐：「融魂魔首，躲在暗处这么久，该尝尝九尾绝影的滋味了！」'
  },
  saga: {
    title: '银狐传 · 狐面令', motive: '一枚刻着幻月族徽的密令现身暗市，银狐隐入夜色追查失落族人的下落。',
    nodes: [
      { place: '夜雾长街', name: '暗影', fight: { foe: 'feiying', lv: 'easy', goal: 'ko' },
        pre: [['', '长街灯火稀疏，屋檐上落下绯影的身影。'], ['绯影', '同行？这枚暗市密令我也盯上了。'], ['银狐', '那便看谁的刀更快吧！']],
        post: [['绯影', '身法真快……密令是从月影楼流出来的。'], ['银狐', '谢了，下次再会。']] },
      { place: '月影画舫', name: '迷踪', fight: { foe: 'yuehua', lv: 'normal', goal: 'survive', time: 45 },
        pre: [['', '画舫月光如水，月华手持双月刃拦在船头。'], ['月华', '闯我画舫还戴着狐面，报上名来！'], ['银狐', '借道查人，无意冒犯，接招吧！']],
        post: [['月华', '你的刀光倒有几分月影古族的影子。']],
        choice: { q: '画舫密室查出两份密报：一份指向劫走族人的暗桩，一份指向幕后买主的密会。', opts: [
          { t: '直扑暗桩先救族人', f: 'rescue', say: [['银狐', '族人安危最重，先拔掉暗桩再说！']] },
          { t: '潜入密会斩草除根', f: 'syndicate', say: [['银狐', '擒贼先擒王，我要亲手掀翻幕后黑手！']] }] } },
      { place: '残月石林', name: '狐步', fight: { foe: 'liying', lv: 'hard', goal: 'ko', foeSc: ['bx_armor'] },
        pre: [['', '石林雾影幢幢，离影自石柱后缓步转出。'], ['离影', '比幻影？你这只小狐狸还嫩了点。'], ['银狐', '那便试试谁的幻术更真！']],
        post: [['离影', '狐步穿雾……确实有点门道。']] },
      { place: '银霜暗道', name: '绝影', fight: { foe: 'lingque', lv: 'hard', goal: 'fast', time: 70, foeSc: ['bx_enrage'] },
        pre: [['', '金线封锁暗道，凌雀指间飞梭寒光闪烁。'], ['凌雀', '敢硬闯我的金线阵，胆子不小！'], ['银狐', '双刃断线，看招！']],
        post: [['凌雀', '真难缠的影子……里面的人就在前头。']] },
      { place: '幻月密殿', name: '明月',
        pre: { rescue: [['', '地牢铁门已开，暗桩首领持双刃堵住退路。'], ['银狐', '带族人走，这里交给我！']],
          syndicate: [['', '密殿烛火摇曳，幕后黑手摘下面具。'], ['银狐', '月下清算，九尾绝影！']] },
        fight: { rescue: { foe: 'yinhu', lv: 'impossible', goal: 'ko', foeSc: ['bx_haste', 'bx_armor'] },
          syndicate: { foe: 'feiying', lv: 'impossible', goal: 'survive', time: 60, foeSc: ['bx_venom', 'bx_enrage'] } },
        end: { rescue: { title: '月影归巢', text: [['', '失散的族人重聚月下，银狐轻轻摘下狐面。'], ['银狐', '只要你们平安，再长的黑夜也值了。']] },
          syndicate: { title: '暗夜清账', text: [['', '幕后密会灰飞烟灭，江湖暗市再无人敢动幻月族。'], ['银狐', '月落无声，账已清矣。']] } } },
    ] },
});
