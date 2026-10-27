// ======================= 电脑 AI =======================
// 难度、打法和大脑都在 src/ai.js
// 个性化电脑：以困难为基础，按你对它的输赢自动调强弱；禁你胜率最高的角色，用你最常用的角色
const ADAPT = { s: 1, use: {}, win: {} };
function adaptKey() { return 'renying-adapt' + (ACC && ACC.name ? '-' + ACC.name : ''); }
function adaptLoad() { try { Object.assign(ADAPT, { s: 1, use: {}, win: {} }, JSON.parse(localStorage.getItem(adaptKey()) || '{}')); } catch (e) {} adaptLevel(); }
function adaptSave() { try { localStorage.setItem(adaptKey(), JSON.stringify(ADAPT)); } catch (e) {} }
function adaptLevel() {
  const k = clamp(ADAPT.s, 0.55, 1.45);
  LEVELS.adaptive = aiBlendLevel(k);
  const el = document.getElementById('adaptLine');
  if (el) { const fav = adaptFav(); el.textContent = `宿敌：如今强度 ${Math.round(k * 100)}%${fav.best >= 0 ? `，必禁你的${CHARS[fav.best].name}` : ''}${fav.most >= 0 ? `，惯用你的${CHARS[fav.most].name}` : ''}`; }
}
function adaptFav() {   // 你最常用的角色、胜率最高的角色（至少打过 3 场）
  let most = -1, best = -1, mu = 0, bw = -1;
  CHARS.forEach((c, i) => {
    const u = ADAPT.use[c.id] || 0, w = ADAPT.win[c.id] || 0;
    if (u > mu) { mu = u; most = i; }
    if (u >= 3 && w / u > bw) { bw = w / u; best = i; }
  });
  return { most, best: best >= 0 ? best : most };
}
function adaptRecord(won) {   // 每场打完：记录你用的角色和输赢；宿敌按输赢调强弱
  const me = [A, B][localIdx()];
  ADAPT.use[me.ch.id] = (ADAPT.use[me.ch.id] || 0) + 1;
  if (won) ADAPT.win[me.ch.id] = (ADAPT.win[me.ch.id] || 0) + 1;
  if (M.level === 'adaptive') ADAPT.s = clamp(ADAPT.s + (won ? 0.07 : -0.07), 0.55, 1.45);
  adaptSave(); adaptLevel();
}
// 进阶技巧：每个角色独有的实战招式联动与进阶操作
const ADV = {
  qingfeng: '疾风斩直击穿身得手后，立时重置剑气冷却，可瞬间接出弧月剑气连招。',
  tieshan: '震地直击得手后，瞬时回涌 30 点架势耐力，并削减铁壁冲 2.5 秒冷却。',
  feiying: '影遁之后 1.5 秒内再按 Q——影归，瞬息退回遁走前的位置。',
  liuyun: '风刃一次扇出两道；开扇冲过去撒下的爆米花半秒后会炸。',
  leiming: '雷闪贴地冲拳命中对手，立时重置金刚雷铠冷却，可瞬间转守为攻。',
  lingshuang: '回马枪得手后，枪旋余下的冷却减半。',
  moyu: '墨阵尚在场时再按 Q——引爆，阵中之敌受 25 伤害，被墨浪掀飞。',
  yuehua: '月镜格开一击后，月轮立时冷却完毕，可顺势再放一轮。',
  yanling: '自空中起手的俯冲一旦命中，此技立时冷却完毕，落地前可再冲一次（每次落地前只刷新一次）。',
  yuxiao: '回音壁可将暗器、剑气、风刃原路弹回，每弹回一次额外积攒一枚音律。',
  zuixian: '酒过半壶可触发两成近战闪避，并可掷坛施展与民同乐回春80血且压制对手。',
  gouchen: '飞锤拽敌至身前附加 1.2 秒 25% 震魄易伤，立时衔接旋锤连砸。',
  lingque: '锦梭穿云标记敌身后，幽影掠步可循印瞬身突袭并刷新连段。',
};
function trySecondQ(f, foe) {
  if (f.skillCD <= 0 || M.phase !== 'fight' || !['idle', 'walk', 'air'].includes(f.state)) return false;
  const c = f.ctrl;
  if (f.ch.id === 'moyu') {
    const p = projs.find(q => q.kind === 'trap' && q.owner === f.idx && !q.dead);
    if (!p || !c.consume('skill')) return false;
    p.dead = true; ring(p.x, -20, 95, '30,30,40', 0.3); SFX.thud();
    for (let i = 0; i < 14; i++) addP({ type: 'ink', x: p.x + rand(-40, 40), y: -6, vx: rand(-200, 200), vy: rand(-420, -120), g: 1200, life: 0.6, max: 0.6, r: rand(2, 4), rgb: '15,15,22' });
    if (foe.invul <= 0 && foe.hp > 0 && Math.abs(foe.x - p.x) < 95 && foe.y > -130)
      applyHit(f, foe, { dmg: 25, kb: [120, -460], stun: 0.45, hs: 0.08, launch: true, noScale: true, dir: foe.x >= p.x ? 1 : -1 }, [foe.x, foe.y - 40]);
    return false;
  }
  if (f.ch.id === 'feiying' && f.bbT > 0 && c.consume('skill')) {
    smoke(f.x, f.y - 50, 10); f.x = f.bbX; f.bbT = 0; f.trail.length = 0; f.scarf = []; smoke(f.x, f.y - 50, 8); SFX.poof();
  }
  return false;
}
// ======================= 十三侠客斩妖列传 & 同袍肉鸽共斗（打小怪剧情 + 肉鸽秘卷 + 六技魔首合一） =======================
const FOREST = { on: false, mons: [], shots: [], spawnT: 0, kills: {}, total: 0, t: 0, hurtT: 0, storyTitle: '', storyLine: '', raidStory: false };
const MON_TYPES = {
  blade: { name: '刀鬼', kind: '近身', hp: 30, spd: 150, w: 24, h: 104, eye: '255,70,60' },
  archer: { name: '弓妖', kind: '远射', hp: 22, spd: 120, w: 20, h: 100, eye: '120,255,140' },
  binder: { name: '缚灵', kind: '缠缚', hp: 26, spd: 90, w: 24, h: 96, eye: '200,120,255', float: true },
  caster: { name: '咒师', kind: '术法', hp: 24, spd: 100, w: 22, h: 108, eye: '255,170,60' },
  owl: { name: '夜枭', kind: '飞空', hp: 18, spd: 220, w: 30, h: 40, eye: '255,230,90', fly: true },
};
const MON_KEYS = Object.keys(MON_TYPES);
// 十三位侠客在斩妖除魔（打小怪 + 肉鸽共斗）模式中的专属故事篇章
const HERO_FOREST_STORIES = {
  qingfeng: {
    hero: 'qingfeng', heroName: '青锋', title: '青锋传 · 竹海断剑', place: '苍竹林',
    synopsis: '师父殒命前留下半截断剑与剑冢密语。青锋踏入妖雾弥漫的苍竹林，一路斩尽拦路刀鬼与弓妖，寻回断剑遗落的剑魂。',
    stageNames: ['竹径初逢', '冷雨惊弓', '断碑残剑', '竹海破阵', '剑冢魔影'],
    waveDialogues: [
      '青锋：「竹叶未落，刀鬼已至——师父，看好了，徒儿的疾风斩不曾生锈！」',
      '青锋：「暗箭藏于密林？弧月剑气，给我破开这片瘴雾！」',
      '青锋：「断剑在共鸣……原来十年前围攻师门的妖邪，至今仍盘踞竹海！」',
      '青锋：「同袍在此，纵有百鬼夜行，我亦一剑荡平！」'
    ],
    bossIntro: '青锋：「剑冢石门已开！吞噬三侠绝技的融魂魔首，把师门遗落的气魄还来！」'
  },
  tieshan: {
    hero: 'tieshan', heroName: '铁山', title: '铁山传 · 孤关镇岳', place: '铁门关',
    synopsis: '老将军临终托付「关在人在」。十二年后妖潮再临铁门关，铁山横刀立马，以血肉之躯在万妖冲阵中筑起不破铁壁。',
    stageNames: ['烽火重燃', '箭雨孤城', '不动如山', '血染残旗', '镇岳破魔'],
    waveDialogues: [
      '铁山：「铁门关前，一步不退！刀鬼再多，也休想越过老子半步！」',
      '铁山：「弓妖放箭？举盾硬抗，让它们见识何为北境重甲！」',
      '铁山：「十二年了，老将军，当年守关的弟兄们今日与我同袍再战！」',
      '铁山：「震地裂石！把这群魑魅魍魉全震碎在关墙之下！」'
    ],
    bossIntro: '铁山：「魔首亲临又如何？只要我铁山还站着，铁门关便永世不倒！」'
  },
  liuyun: {
    hero: 'liuyun', heroName: '流云', title: '流云传 · 古寺听风', place: '栖霞古寺',
    synopsis: '尘封古寺夜半钟声自鸣，夜枭与刀鬼窃据佛堂。流云摇扇踏月而来，于談笑风生间借八面来风涤荡妖氛。',
    stageNames: ['山门落叶', '夜枭啼月', '风卷残香', '爆竹惊邪', '听风伏魔'],
    waveDialogues: [
      '流云：「好好的古寺被刀鬼弄得乌烟瘴气，且借清风替佛祖扫个地。」',
      '流云：「梁上夜枭飞得挺快？可惜快不过我扇底的两道风刃。」',
      '流云：「开扇俯冲，落地生花！请诸位小妖尝尝刚出锅的爆米花！」',
      '流云：「风起云涌，同袍协力，这最后一炉香该由我们点上了！」'
    ],
    bossIntro: '流云：「三魂融一的魔头？折扇虽轻，亦能为你扇散这身戾气！」'
  },
  lingshuang: {
    hero: 'lingshuang', heroName: '凌霜', title: '凌霜传 · 雪岭寒枪', place: '北境雪岭',
    synopsis: '北境冰原封印松动，缚灵与寒妖倾巢而出。凌霜单枪匹马深入暴风雪，以一寸枪尖的极寒锋芒重定边疆。',
    stageNames: ['风雪巡边', '冰谷缚灵', '寒梅泣血', '回马破阵', '冰原斩魔'],
    waveDialogues: [
      '凌霜：「北境军令在此，凡越雪线半步之妖物，格杀勿论！」',
      '凌霜：「缚灵想用定身阵困我？枪旋卷雪，距离由我掌控！」',
      '凌霜：「一寸长，一寸强！退半步蓄势，回马一枪定叫群妖胆寒！」',
      '凌霜：「风雪虽烈，同袍热血未冷，随我杀出雪岭！」'
    ],
    bossIntro: '凌霜：「窃取百家的融魂妖首，且看你挡不挡得住我北境寒枪的锋芒！」'
  },
  feiying: {
    hero: 'feiying', heroName: '绯影', title: '绯影传 · 血月夜行', place: '血月幽谷',
    synopsis: '叛出影楼之夜，满谷咒师与刀鬼奉命截杀。绯影握紧双刃，在血月之下斩断过去的枷锁，杀出一条自由之路。',
    stageNames: ['影楼追杀', '咒火迷踪', '双刃饮血', '影归绝境', '焚楼断命'],
    waveDialogues: [
      '绯影：「做完九十九单，这第一百单——我接自己的命！」',
      '绯影：「咒师的火柱？影遁留痕，影归回撤，你们连我的衣角都摸不到！」',
      '绯影：「苦无封喉，十字连斩！影楼圈养的妖物不过如此！」',
      '绯影：「今夜有同袍并肩，影楼的规矩，到今夜彻底作废！」'
    ],
    bossIntro: '绯影：「影楼倾尽秘术炼出的六技魔首？正好拿你祭我自由之刃！」'
  },
  leiming: {
    hero: 'leiming', heroName: '雷鸣', title: '雷鸣传 · 雷音伏魔', place: '雷音绝顶',
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
  zuixian: {
    hero: 'zuixian', heroName: '醉仙', title: '醉仙传 · 醉翁梦蝶', place: '杏花醉翁亭',
    synopsis: '千年佳酿引来百妖觊觎，醉翁亭外群魔乱舞。醉仙仰头饮尽半壶陈酿，步履踉跄却招招致命，请群妖共赴黄泉酒局。',
    stageNames: ['偷酒小妖', '步步生莲', '与民同乐', '醉眼看剑', '一梦乾坤'],
    waveDialogues: [
      '醉仙：「好哇，连老夫埋在亭下的杏花村都敢偷？先吃我一记醉拳！」',
      '醉仙：「酒过半壶，刀鬼砍得着老夫算我输！来来来，干了这坛！」',
      '醉仙：「醉翁亭落，画卷封疆！进了我这亭子，谁也别想飞出去！」',
      '醉仙：「好酒当与同袍共饮，斩妖除魔亦当痛快淋漓！」'
    ],
    bossIntro: '醉仙：「身怀六技的大家伙？正好给老夫醒醒酒，看招！」'
  },
  gouchen: {
    hero: 'gouchen', heroName: '勾陈', title: '勾陈传 · 陨星锁魂', place: '陨星深渊',
    synopsis: '陨星渊底锁妖铁链崩裂，上古恶灵咆哮而出。守墓人勾陈抡起千斤飞锤，将逃逸的群妖一一拽回深渊。',
    stageNames: ['断链惊变', '飞锤索命', '旋锤碎骨', '深渊镇魂', '天谴封魔'],
    waveDialogues: [
      '勾陈：「在深渊底下关了十年还不老实？飞锤所至，给老子滚回来！」',
      '勾陈：「远处的咒师以为站得远就安全？锁链一响，震魄碎魂！」',
      '勾陈：「旋锤狂舞，暗器全数弹回！陨星渊的规矩由我定！」',
      '勾陈：「同袍们，收紧铁链，别放跑一只深渊恶灵！」'
    ],
    bossIntro: '勾陈：「融聚三魂的深渊魔首！这根陨铁链，今日专为你而铸！」'
  },
  yanling: {
    hero: 'yanling', heroName: '燕翎', title: '燕翎传 · 云雀穿云', place: '万仞云雀崖',
    synopsis: '黑风遮蔽云雀崖，夜枭妖群截断飞鸽传书。燕翎展翅腾空，以漫天羽镖与凌空俯冲夺回苍穹。',
    stageNames: ['折翼迷雾', '羽镖追风', '鹰击长空', '万里传书', '苍穹破魔'],
    waveDialogues: [
      '燕翎：「云雀崖的天空，什么时候轮到夜枭作威作福了？」',
      '燕翎：「漫天羽镖，三连贯空！在天上，还没人能逃过我的眼睛！」',
      '燕翎：「空中俯冲命中立时腾跃再冲，群妖连地面都站不稳！」',
      '燕翎：「同袍们在地面掠阵，苍穹之上的妖氛交给我肃清！」'
    ],
    bossIntro: '燕翎：「哪怕你融汇三侠六技，也休想折断云雀崖的羽翼！」'
  },
  yuxiao: {
    hero: 'yuxiao', heroName: '玉箫', title: '玉箫传 · 清音绝响', place: '潇湘清音筑',
    synopsis: '魔音入竹林，百鬼循声噬人。玉箫横吹碧玉箫，以三叠清音化作无形气刃与回音壁，涤清天地浊气。',
    stageNames: ['竹露初凝', '回音反弹', '三叠惊鸿', '曲终人散', '清音破障'],
    waveDialogues: [
      '玉箫：「魔音乱人心智，且听我一曲清心普善，送尔等归西。」',
      '玉箫：「弓妖毒矢？回音壁立，原路奉还，再添我一枚音律！」',
      '玉箫：「三枚音律已齐，音浪震荡，百鬼皆伏！」',
      '玉箫：「高山流水遇知音，与诸位同袍合奏此曲，何惧群魔！」'
    ],
    bossIntro: '玉箫：「窃尽天下武学却无半点琴心——这一曲绝响，送魔首伏诛！」'
  },
  yuehua: {
    hero: 'yuehua', heroName: '月华', title: '月华传 · 广寒镜影', place: '太阴月宫',
    synopsis: '朔月之夜妖邪侵袭月宫，妄图污染太阴宝镜。月华执月轮迎敌，镜花水月间将一切邪祟攻势尽数反斩。',
    stageNames: ['朔月妖氛', '明镜止水', '月轮回旋', '清辉遍照', '太阴诛邪'],
    waveDialogues: [
      '月华：「月宫净土，岂容尔等污秽染指？月轮旋斩！」',
      '月华：「月镜格开刀鬼重劈，反手一剑如霜雪降世！」',
      '月华：「月轮去而复返，背袭破防，缚灵与咒师皆无可遁形！」',
      '月华：「清辉庇佑同袍，愿月光洗尽这漫山遍野的妖邪！」'
    ],
    bossIntro: '月华：「明镜照见万象，纵使魔首身负三侠六技，亦难逃月轮裁决！」'
  },
  moyu: {
    hero: 'moyu', heroName: '墨羽', title: '墨羽传 · 墨渊画魂', place: '无底墨渊',
    synopsis: '墨渊画卷被妖血浸染，画中恶鬼破纸而出。墨羽提笔蘸墨，布墨阵、泼浓墨，以山河为卷将百鬼重新封印。',
    stageNames: ['画卷惊魂', '墨阵困妖', '浓墨重彩', '点睛破壁', '山河封魔'],
    waveDialogues: [
      '墨羽：「我画中的刀鬼竟被邪气唤醒？提笔落墨，收尔入卷！」',
      '墨羽：「墨阵已成，引爆墨浪！浓墨护体可抵群妖利爪！」',
      '墨羽：「泼墨成刃，画龙点睛！每一滴墨水都是镇妖的符印！」',
      '墨羽：「得诸位同袍相助，这幅万里斩妖图，今日定能圆满收笔！」'
    ],
    bossIntro: '墨羽：「盗取三家真意的画魔首领！我便用这最后一池朱砂将你彻底抹去！」'
  },
  lingque: {
    hero: 'lingque', heroName: '灵雀', title: '灵雀传 · 幽谷织锦', place: '锦屏幽谷',
    synopsis: '幽谷灵脉遭群妖窃据，传世云锦被魔气撕裂。灵雀手捏金梭，穿花度柳般在妖群中织就天罗地网。',
    stageNames: ['断锦寻踪', '金梭穿云', '幽影掠步', '百鸟朝凤', '织天伏魔'],
    waveDialogues: [
      '灵雀：「敢撕毁我织了三年的云锦？金梭穿刺，把你们串成一线！」',
      '灵雀：「锦梭留印，幽影掠步瞬身突袭——夜枭也休想逃出金线！」',
      '灵雀：「梭影纵横，步步生花，群妖皆是我锦缎上的败笔！」',
      '灵雀：「同袍结阵如经纬交织，看我们合力拿下这幕后魔首！」'
    ],
    bossIntro: '灵雀：「身披三侠六技的融魂魔首，且看我以金梭幽影破你金身！」'
  }
};
// 妖物的强度：按难度值线性增长（闯关时第几个妖物关决定难度值）
function waveK(w) {
  const n = Math.max(0, w - 1);
  return { hp: 1 + 0.12 * n, dk: 1 + 0.1 * n, spd: 1 + 0.03 * n, cdk: 1 / (1 + 0.05 * n), wk: Math.max(0.55, 1 - 0.022 * n),
    cap: 3 + Math.floor(w / 3), gap: Math.max(0.45, 2 - 0.07 * n), prot: Math.max(0.3, 0.7 - 0.02 * n) };
}
// 十三章：对应十三位侠客的专属斩妖传；第五关迎战守关宗师或六技融魂魔首
const CHAPTERS = [
  { hero: 'qingfeng', name: '竹林', pool: ['blade', 'archer'], boss: 'tieshan', lv: 'easy' },
  { hero: 'tieshan', name: '铁关', pool: ['blade', 'archer'], boss: 'qingfeng', lv: 'easy' },
  { hero: 'liuyun', name: '古寺', pool: ['blade', 'archer', 'owl'], boss: 'liuyun', lv: 'normal' },
  { hero: 'lingshuang', name: '雪岭', pool: ['blade', 'archer', 'owl', 'binder'], boss: 'lingshuang', lv: 'normal' },
  { hero: 'feiying', name: '血月谷', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'feiying', lv: 'hard' },
  { hero: 'leiming', name: '雷音顶', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'leiming', lv: 'hard' },
  { hero: 'zuixian', name: '醉翁亭', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'zuixian', lv: 'hard' },
  { hero: 'gouchen', name: '陨星渊', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'gouchen', lv: 'hard' },
  { hero: 'yanling', name: '云雀崖', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'yanling', lv: 'hard' },
  { hero: 'yuxiao', name: '清音筑', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'yuxiao', lv: 'impossible' },
  { hero: 'yuehua', name: '月宫', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'yuehua', lv: 'impossible' },
  { hero: 'moyu', name: '墨渊', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'moyu', lv: 'impossible' },
  { hero: 'lingque', name: '织锦谷', pool: ['blade', 'archer', 'owl', 'binder', 'caster'], boss: 'lingque', lv: 'impossible' },
];
const stageId = (c, l) => `${c + 1}.${l + 1}`;   // c 第几章、l 第几关，都从 0 开始
// 一关的内容：妖物关每一波出哪些妖物是固定的（每次打都一样），并附上该侠客的专属剧情
function stageInfo(c, l) {
  const C = CHAPTERS[c] || CHAPTERS[0], id = stageId(c, l);
  const story = HERO_FOREST_STORIES[C.hero] || HERO_FOREST_STORIES.qingfeng;
  const stgName = (story.stageNames && story.stageNames[l]) || `第 ${l + 1} 幕`;
  if (l === 4) return { c, l, id, C, story, stgName, boss: true };
  const g = c * 4 + l;   // 第几个妖物关（从 0 开始），决定难度
  const fresh = C.pool.find(k => c > 0 && !CHAPTERS[c - 1].pool.includes(k)) || (c === 0 ? 'blade' : null);   // 这一章新出现的妖物
  const nw = 2 + (l >= 2 ? 1 : 0) + (c >= 3 ? 1 : 0), waves = [];
  for (let w = 0; w < nw; w++) {
    const list = [];
    for (let i = 0, n = 2 + Math.floor(g / 4) + w; i < n; i++)
      list.push(l === 0 && w === 0 && fresh ? fresh : C.pool[Math.floor(hash(g * 131 + w * 17 + i * 7 + 3) * C.pool.length)]);
    waves.push(list);
  }
  return { c, l, id, C, story, stgName, boss: false, waves, K: waveK(1 + g * 0.45) };
}
function nextStage(S) { return S.l < 4 ? [S.c, S.l + 1] : S.c < CHAPTERS.length - 1 ? [S.c + 1, 0] : null; }
// 进度：每关拿到的最多星数，存在本机浏览器里
let STAGE_STARS = {};
try { STAGE_STARS = JSON.parse(localStorage.getItem('renying-stage') || '{}') || {}; } catch (e) {}
function stageOpen(c, l) { return (c === 0 && l === 0) || l === 0 || !!STAGE_STARS[l > 0 ? stageId(c, l - 1) : stageId(c - 1, 4)]; }
let STAGE = null, stageCh = -1;
function renderStages() {
  if (stageCh < 0) { stageCh = 0; for (let c = 0; c < CHAPTERS.length; c++) if ( STAGE_STARS[stageId(c, 0)] ) stageCh = c; }
  const C = CHAPTERS[stageCh] || CHAPTERS[0];
  const story = HERO_FOREST_STORIES[C.hero] || HERO_FOREST_STORIES.qingfeng;
  $id('stTabs').innerHTML = CHAPTERS.map((ch, c) => {
    const st = HERO_FOREST_STORIES[ch.hero];
    return `<button data-c="${c}" class="${c === stageCh ? 'sel' : ''}">${st ? st.heroName : ch.name}·${ch.name}</button>`;
  }).join('');
  const storyBox = $id('stStoryBox');
  if (storyBox) {
    storyBox.innerHTML = `
      <div class="st-story-txt">
        <b>📖 ${story.title}（${story.place}）</b>
        <span>${story.synopsis}</span>
      </div>
      <button class="go small" id="stRougeCoopBtn" type="button">🔥 同袍肉鸽多人共斗此篇</button>
    `;
    const coopBtn = $id('stRougeCoopBtn');
    if (coopBtn) coopBtn.addEventListener('click', () => { SFX.slice(); if (typeof openRougeModal === 'function') openRougeModal(stageCh); });
  }
  $id('stGrid').innerHTML = [0, 1, 2, 3, 4].map(l => {
    const S = stageInfo(stageCh, l), open = stageOpen(stageCh, l), st = STAGE_STARS[S.id] || 0;
    const sub = S.boss ? `${S.stgName} · 魔首决战` : `${S.stgName} (${S.waves.length}波妖)`;
    return `<button data-l="${l}" class="stl${S.boss ? ' boss' : ''}" ${open ? '' : 'disabled'}><b>${S.id}</b><span>${open ? sub : '未解锁'}</span><i>${open ? '★'.repeat(st) + '☆'.repeat(3 - st) : '🔒'}</i></button>`;
  }).join('');
  const total = Object.values(STAGE_STARS).reduce((a, b) => a + b, 0);
  $id('stNote').textContent = `${story.title}　|　首幕直享多人肉鸽秘卷 · 终幕迎战六技魔首　|　总星数 ${total} / ${CHAPTERS.length * 15}`;
}
$id('stTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { stageCh = +b.dataset.c; renderStages(); SFX.slice(); } });
$id('stGrid').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b && !b.disabled) {
    const l = +b.dataset.l;
    STAGE = stageInfo(stageCh, l);
    const hIdx = CHAR_IDX[CHAPTERS[stageCh].hero] !== undefined ? CHAR_IDX[CHAPTERS[stageCh].hero] : 0;
    if (typeof openRougeModal === 'function' && l === 4) {
      openRougeModal(stageCh);
      return;
    }
    startStage(stageCh, l, false, hIdx);
  }
});
function startStage(c, l, isWatch = false, heroIdx = trainChar) {
  const CHAP = CHAPTERS[c] || CHAPTERS[0];
  if (typeof heroIdx !== 'number' || heroIdx < 0 || heroIdx >= CHARS.length) {
    heroIdx = CHAR_IDX[CHAP.hero] !== undefined ? CHAR_IDX[CHAP.hero] : 0;
  }
  trainChar = heroIdx;
  const S = STAGE = stageInfo(c, l); stageCh = c;
  const story = S.story || HERO_FOREST_STORIES[CHAP.hero] || HERO_FOREST_STORIES.qingfeng;
  M.watchAi = !!isWatch;
  if (S.boss) {   // 第五幕：与同袍肉鸽合流，迎战三侠六技融魂魔首（或守关宗师）
    FOREST.on = false; B.forestProxy = false; B.hidden = false; B.dummy = false;
    initAudio(); paused = false; showScreen(null);
    MSTAT.maxcombo = 0; MSTAT.ults = 0;
    if (!isWatch && typeof startRaidMatch === 'function') {
      const mate1 = (heroIdx + 2) % CHARS.length;
      const mate2 = (heroIdx + 4) % CHARS.length;
      startRaidMatch([heroIdx, mate1, mate2], 3, { chapterIdx: c, stageBoss: S });
      M.stage = S;
      return;
    }
    startMatch('cpu', S.C.lv, [trainChar, CHAR_IDX[S.C.boss]], isWatch);
    M.stage = S;
    applySkins();
    if (isWatch) say(`天道破关 · 迎战 ${S.C.name}`, 1.4);
    return;
  }
  startDummyTraining();
  // 闯关斩妖与同袍肉鸽合流：开启秘卷增益与 2~3 人同袍协战
  M.mode = 'raid';
  M.raidSquadSize = 3;
  M.raidWave = l + 1;
  M.raidStoryHero = CHAP.hero;
  M.raidStoryChapter = c;
  if (!M.towerPerks || !M.towerPerks.length) {
    M.towerPerks = scDraw(CHARS[heroIdx].id, [], 2).map(s => s.id);
  }
  C_ALLY: {
    const m1 = (heroIdx + 2) % CHARS.length;
    const m2 = (heroIdx + 4) % CHARS.length;
    C.setChar(m1); D.setChar(m2);
    C.hidden = false; D.hidden = false;
    C.reset(STAGE_W / 2 - 140); C.ctrl = new AICtrl('god');
    D.reset(STAGE_W / 2 + 140); D.ctrl = new AICtrl('god');
  }
  const initLine = (story.waveDialogues && story.waveDialogues[l % story.waveDialogues.length]) || story.synopsis;
  Object.assign(FOREST, {
    on: true, mons: [], shots: [], spawnT: 1, kills: {}, total: 0, t: 0, hurtT: 9, wave: 0, toSpawn: [], breakT: 1.5,
    over: false, overT: 0, shown: false, prot: S.K.prot, result: null,
    storyTitle: `${story.title} · ${S.stgName}`,
    storyLine: initLine,
    raidStory: false
  });
  B.forestProxy = true; B.hidden = true; B.x = STAGE_W / 2 + 400; B.invul = 99; B.look = { ...B.look, name: '妖物' };
  A.x = STAGE_W / 2;
  if (isWatch) A.ctrl = new AICtrl('god');
  scRoundStart();
  say(`${story.title} · ${S.stgName}`, 1.4, 'big', initLine);
}
function forestNextWave() {
  const F = FOREST; F.wave++;
  F.toSpawn = STAGE.waves[F.wave - 1].slice(); F.spawnT = 0.8;
  const story = (STAGE && STAGE.story) || HERO_FOREST_STORIES.qingfeng;
  const lineIdx = ((STAGE ? STAGE.l : 0) + F.wave - 1) % (story.waveDialogues ? story.waveDialogues.length : 1);
  F.storyLine = (story.waveDialogues && story.waveDialogues[lineIdx]) || story.synopsis;
  say(`第 ${F.wave} / ${STAGE.waves.length} 波妖潮`, 1.2, 'big', F.storyLine); SFX.gong();
}
function forestDie() {
  const F = FOREST; if (F.over) return;
  F.over = true; F.overT = 2; F.result = { win: false, stars: 0, info: `折在第 ${F.wave} / ${STAGE.waves.length} 波，共击退 ${F.total} 只妖物` };
  for (const f of sideFighters(0)) {
    f.hp = 0; f.state = 'launched'; f.t = 0; f.vy = -520; f.vx = -f.face * 200; f.y = Math.min(f.y, -1); f.invul = 99;
  }
  say('力竭', 1.4, 'big'); slowmo = 1;
}
function transitionForestToRaidBoss() {
  const F = FOREST;
  F.on = false;
  B.forestProxy = false;
  B.hidden = false;
  B.dummy = false;
  const story = (STAGE && STAGE.story) || HERO_FOREST_STORIES[M.raidStoryHero] || HERO_FOREST_STORIES.qingfeng;
  // 群妖肃清后全员回满气血并额外领悟一卷共享秘卷，直接迎战三侠六技融魂魔首！
  const bonusPerk = scDraw(A.ch.id, M.towerPerks || [], 1)[0];
  if (bonusPerk) {
    M.towerPerks = M.towerPerks || [];
    M.towerPerks.push(bonusPerk.id);
  }
  startRound();
  const perkSub = bonusPerk ? `群妖肃清！全队共享顿悟「${bonusPerk.n}」` : '群妖肃清 · 决战六技融魂魔首！';
  say(`终幕魔首降临 · ${B.look.name}`, 1.6, 'big', story.bossIntro || perkSub);
  toast(`⚔️ ${story.bossIntro || perkSub}`);
}
function stageClear() {
  const F = FOREST; if (F.over) return;
  if (F.raidStory) {
    transitionForestToRaidBoss();
    return;
  }
  const allies = sideFighters(0);
  const totalHp = allies.reduce((s, f) => s + Math.max(0, f.hp), 0);
  const totalMax = Math.max(1, allies.reduce((s, f) => s + f.maxHp, 0));
  const r = totalHp / totalMax, stars = r >= 0.6 ? 3 : r >= 0.3 ? 2 : 1;
  const story = (STAGE && STAGE.story) || HERO_FOREST_STORIES.qingfeng;
  const bonusInk = 150 + stars * 50;
  PROF.ink = (PROF.ink || 0) + bonusInk;
  saveProfile();
  F.over = true; F.overT = 1.8; for (const f of allies) f.invul = 99;
  F.result = {
    win: true,
    stars,
    info: `<b>${story.title} · ${STAGE.stgName}</b><br>${F.storyLine}<br>同袍残存气血 ${Math.round(r * 100)}%，共斩灭 ${F.total} 只妖物 · <b>全员共享斩妖赏金 +${bonusInk} 墨锭！</b>`
  };
  say('斩妖破关', 1.4, 'big', `全员共享 +${bonusInk} 墨锭`); SFX.gong();
}
// 一关打完：记录星数，显示结算
function stageShowEnd(win, stars, info) {
  const S = STAGE;
  if (win && S && (STAGE_STARS[S.id] || 0) < stars) {
    const starDiff = stars - (STAGE_STARS[S.id] || 0);
    STAGE_STARS[S.id] = stars;
    PROF.ink = (PROF.ink || 0) + starDiff * 30;
    PROF.stageStars = STAGE_STARS;
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    try { localStorage.setItem('renying-stage', JSON.stringify(STAGE_STARS)); } catch (e) {}
  }
  const CHRONICLE_SKIN_REWARDS = {
    tieshan: 'ts_bronze',
    liuyun: 'ly_dusk',
    lingshuang: 'ls_plum',
    feiying: 'fy_jade',
    leiming: 'lm_violet',
    zuixian: 'zx_amber',
    gouchen: 'gc_crimson',
    yanling: 'yl_raven',
    yuxiao: 'yx_snow',
    yuehua: 'yh_sakura',
    moyu: 'my_cinnabar'
  };
  let skinUnlockedText = '';
  if (win && S.boss && S.C && S.C.boss) {
    const rSkinKey = CHRONICLE_SKIN_REWARDS[S.C.boss];
    if (rSkinKey && SKINS[rSkinKey]) {
      PROF.skins = PROF.skins || [];
      if (!PROF.skins.includes(rSkinKey)) {
        PROF.skins.push(rSkinKey);
        if (window.CloudSave) CloudSave.saveProfile(PROF);
        skinUnlockedText = `<br><span style="color:#e9c46a;font-weight:bold">🎉 宿命通关奖励：已解锁【${CHARS[CHAR_IDX[S.C.boss]].name}】专属皮肤「${SKINS[rSkinKey].name}」！</span>`;
        try { SFX.chargeFull(); } catch (e) {}
      }
    }
  }
  playSting(win ? 'victory' : 'defeat');
  const nx = nextStage(S);
  $id('feWave').textContent = `${S.id} ${win ? '破关' : '折戟'}`;
  $id('feStars').textContent = win ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
  $id('feInfo').innerHTML = info + skinUnlockedText + (win && !nx ? '<br><b style="color:#e9c46a">八章四十关，天下豪杰尽数折服！</b>' : '');
  $id('feNext').style.display = win && nx ? '' : 'none';
  paused = true; showScreen('forestEnd');
}
function forestShowEnd() { const r = FOREST.result; stageShowEnd(r.win, r.stars, r.info); }
function monBox(m) { return [m.x - m.T.w, m.y - m.T.h, m.x + m.T.w, m.y]; }
function spawnMon(key) {
  const T = MON_TYPES[key], side = Math.random() < 0.5 ? -1 : 1, K = STAGE.K, hp = Math.round(T.hp * K.hp);
  FOREST.mons.push({ key, T, x: side < 0 ? WALL + 10 : STAGE_W - WALL - 10, y: T.fly ? -230 : 0, vx: 0, vy: 0, hp, maxHp: hp, dk: K.dk, spd: K.spd, cdk: K.cdk, wk: K.wk,
    face: -side, cd: rand(0.8, 1.6), wind: 0, act: null, stag: 0, flash: 0, ph: rand(0, 6), tx: 0 });
}
// 妖物打到玩家：不会把玩家打死；能格挡、能被腾空闪躲开
function monHitPlayer(m, dmg, kb, stun, launch, root, targetF) {
  const tf = targetF || A;
  if (tf.invul > 0 || tf.escInvul || tf.hp <= 0 || FOREST.over || FOREST.hurtT < FOREST.prot) return;
  dmg *= m.dk || 1;
  const dir = tf.x >= m.x ? 1 : -1;
  const holdingBlock = !!(tf.ctrl && tf.ctrl.held && tf.ctrl.held.down);
  const wasBlocking = ((tf.state === 'block' || tf.state === 'blockstun') || (holdingBlock && ['idle', 'walk'].includes(tf.state)));
  if (wasBlocking && !launch) {
    tf.face = -dir;
  }
  const blocking = wasBlocking && tf.face === -dir && !launch;
  hitFX(tf.x, tf.y - 60, blocking ? 0.5 : 0.9, m.T.eye, dir);
  if (blocking) { tf.state = 'blockstun'; tf.t = 0; tf.stun = 0.12; tf.vx = dir * 160; FOREST.hurtT = 0.3; SFX.block(); return; }
  tf.hp = Math.max(0, tf.hp - dmg); FOREST.hurtT = 0; tf.flash = 0.1; tf.sinceHit = 0;
  if (sideFighters(0).every(f => f.hp <= 0)) { forestDie(); hitstop = 0.2; SFX.hit(1.6); return; }
  toNeutral(tf);
  if (launch) { tf.state = 'launched'; tf.t = 0; tf.vy = -560; tf.vx = dir * kb * 0.6; tf.y = Math.min(tf.y, -1); tf.juggle = 1; }
  else { tf.state = 'hitstun'; tf.t = 0; tf.stun = stun; tf.vx = root ? 0 : dir * kb; tf.rooted = !!root; }
  hitstop = Math.max(hitstop, 0.05); shake = Math.max(shake, 6); SFX.hit(1);
}
// 玩家的攻击打中“代理”（最近的妖物）时，伤害转给它（支持 2~3 名同袍协同斩妖 + 共享秘卷加成）
function forestHit(att, m, pt) {
  const mon = FOREST.mons.filter(q => q.hp > 0).sort((a, b) => Math.abs(a.x - att.x) + Math.abs(a.y - att.y) - Math.abs(b.x - att.x) - Math.abs(b.y - att.y))[0];
  if (!mon) return;
  const dir = m.dir || (mon.x >= att.x ? 1 : -1);
  let dmg = m.dmg;
  if (scOn() && scCount(att, 'mo') >= 1) dmg *= 1.15;
  if (scOn() && scReso(att, 'xue')) scHeal(att, Math.max(1, Math.round(dmg * 0.08)));
  mon.hp -= dmg; mon.flash = 0.1; mon.stag = Math.max(mon.stag, m.launch ? 0.6 : 0.3); mon.act = null; mon.wind = 0;
  mon.vx = dir * Math.abs(m.kb ? m.kb[0] : 200) * 0.7;
  if (m.launch && !mon.T.fly) mon.vy = -420;
  att.hitConfirmed = true; scMeter(att, dmg * 0.35);
  const ev = { e: 'hit', a: att.idx, d: 1, x: pt ? pt[0] : mon.x, y: pt ? pt[1] : mon.y - 60, dmg, hs: m.hs || 0.06, nc: true, f: dir };
  hitFX(ev.x, ev.y, clamp(dmg / 8, 0.5, 1.6), att.look.slash, dir); hitstop = Math.max(hitstop, (m.hs || 0.06) * 0.8); shake = Math.max(shake, 4); SFX.hit(1);
  addP({ type: 'text', text: String(Math.round(dmg * 10) / 10), x: mon.x, y: mon.y - mon.T.h - 20, life: 0.5, max: 0.5, rgb: '255,240,220' });
  if (mon.hp <= 0) {
    FOREST.kills[mon.key] = (FOREST.kills[mon.key] || 0) + 1; FOREST.total++;
    smoke(mon.x, mon.y - mon.T.h / 2, 14); ring(mon.x, mon.y - 50, 70, mon.T.eye, 0.35); SFX.poof();
  }
}
function forestUpdate() {
  const F = FOREST; F.t += STEP; F.hurtT += STEP;
  if (F.over) { F.overT -= STEP; if (F.overT <= 0 && !F.shown) { F.shown = true; forestShowEnd(); } return; }
  const allies = sideFighters(0).filter(f => !f.hidden && f.hp > 0);
  const refAlly = allies[0] || A;
  // 队友或全队的近身斩击即使没打在代理 B 身上，只要刀锋扫过任何妖物也直接命中该妖物！
  for (const af of allies) {
    if (af.state === 'attack' && af.move && !af.hitDone && af.t >= af.move.su && af.t < af.move.su + af.move.ac) {
      const hb = hitbox(af, af.move.box);
      const hitMon = F.mons.find(m => m.hp > 0 && overlap(hb, monBox(m)));
      if (hitMon) {
        B.x = hitMon.x; B.y = hitMon.y;
        af.hitDone = true;
        forestHit(af, af.move, [hitMon.x, hitMon.y - 50]);
      }
    }
  }
  if (F.breakT > 0) { F.breakT -= STEP; if (F.breakT <= 0) forestNextWave(); }
  else {
    F.spawnT -= STEP;
    const alive = F.mons.filter(m => m.hp > 0).length, K = STAGE.K;
    if (F.toSpawn.length && F.spawnT <= 0 && alive < K.cap) { spawnMon(F.toSpawn.shift()); F.spawnT = K.gap * rand(0.7, 1.3); }
    if (!F.toSpawn.length && alive === 0) {
      F.shots = [];
      if (F.wave >= STAGE.waves.length) stageClear();   // 最后一波也打完了：通关或进入终幕六技魔首决战
      else {   // 这一波打完：全队共享回血 + 自动感悟一卷共享肉鸽秘卷
        F.breakT = 2.6;
        for (const af of allies) {
          af.hp = Math.min(af.maxHp, af.hp + Math.round(af.maxHp * 0.2));
          af.lagHp = Math.max(af.lagHp, af.hp);
        }
        const newPerk = scDraw(A.ch.id, M.towerPerks || [], 1)[0];
        if (newPerk) {
          M.towerPerks = M.towerPerks || [];
          M.towerPerks.push(newPerk.id);
          say(`第 ${F.wave} 波击退 · 全队共享「${newPerk.n}」`, 1.2, 'go', newPerk.d);
        } else {
          say(`第 ${F.wave} 波 通过 · 全队回血 +20%`, 1, 'go');
        }
      }
    }
  }
  for (const m of F.mons) {
    if (m.hp <= 0) continue;
    // 寻找离这只妖物最近的存活同袍侠客
    let tgt = refAlly, bestD = Math.abs(refAlly.x - m.x);
    for (const af of allies) {
      const dist = Math.abs(af.x - m.x);
      if (dist < bestD) { bestD = dist; tgt = af; }
    }
    const T = m.T, dx = tgt.x - m.x, d = Math.abs(dx), dir = Math.sign(dx) || 1;
    m.ph += STEP; m.flash = Math.max(0, m.flash - STEP);
    if (m.stag > 0) { m.stag -= STEP; m.vx *= 0.9; }
    else {
      m.face = dir;
      m.cd -= STEP;
      const keep = { blade: 70, archer: 380, binder: 260, caster: 320, owl: 0 }[m.key];
      if (m.key === 'owl') {   // 夜枭：高处盘旋，偶尔俯冲
        if (!m.act) { m.tx = tgt.x + Math.sin(m.ph * 0.8) * 200; m.vx = clamp((m.tx - m.x) * 2, -(T.spd * m.spd), (T.spd * m.spd)); m.y = -230 + Math.sin(m.ph * 3) * 20; if (m.cd <= 0) { m.act = 'swoop'; m.wind = 0.45 * m.wk; m.cd = rand(2.6, 3.6) * m.cdk; } }
        else if (m.wind > 0) { m.wind -= STEP; m.vx *= 0.9; if (m.wind <= 0) { const ty = tgt.y - 60 - m.y; const l = Math.hypot(dx, ty) || 1; m.vx = dx / l * 760; m.vy = ty / l * 760; m.act = 'dive'; m.hitDone = false; } }
        else if (m.act === 'dive') { m.y += m.vy * STEP; const hitAf = allies.find(af => overlap(monBox(m), hurtbox(af))); if (!m.hitDone && hitAf) { m.hitDone = true; monHitPlayer(m, 3, 260, 0.35, false, false, hitAf); } if (m.y > -30 || m.y < -300) { m.act = null; m.vy = 0; m.y = Math.min(-40, m.y); } }
        else m.act = null;
        if (!m.act) m.y = damp(m.y, -230, 3, STEP);
      } else if (m.wind > 0) {   // 出手前的蓄力（有明显的提示）
        m.wind -= STEP; m.vx *= 0.8;
        if (m.wind <= 0) {
          if (m.key === 'blade') { const hb = [m.x + (dir > 0 ? 0 : -86), m.y - 100, m.x + (dir > 0 ? 86 : 0), m.y - 10]; slashLine(m.x + dir * 50, m.y - 60, dir > 0 ? -0.3 : 3.44, T.eye); SFX.swing(); const hitAf = allies.find(af => overlap(hb, hurtbox(af))); if (hitAf) monHitPlayer(m, 4, 220, 0.35, false, false, hitAf); }
          if (m.key === 'archer') { F.shots.push({ x: m.x + dir * 20, y: m.y - 70, vx: dir * 620 * m.spd, life: 1.6, dmg: 3, dk: m.dk }); SFX.slice(); }
          if (m.key === 'binder') { F.shots.push({ trap: true, x: m.mark, y: 0, t: 0.8 * m.wk, r: 60, dmg: 2, dk: m.dk }); }
          if (m.key === 'caster') { F.shots.push({ fire: true, x: m.mark, y: 0, t: 0.9 * m.wk, r: 52, dmg: 5, dk: m.dk }); }
        }
      } else {
        const want = m.key === 'blade' ? (d > keep ? dir : 0) : (d > keep + 60 ? dir : d < keep - 60 ? -dir : 0);
        m.vx = damp(m.vx, want * (T.spd * m.spd), 6, STEP);
        if (m.cd <= 0 && (m.key !== 'blade' || d < 110)) {
          m.wind = { blade: 0.5, archer: 0.4, binder: 0.5, caster: 0.5 }[m.key] * m.wk; m.cd = { blade: 2.2, archer: 2.8, binder: 4.5, caster: 4.5 }[m.key] * m.cdk;
          m.mark = tgt.x;   // 控制和法术：锁定最近侠客的位置
        }
      }
    }
    m.x = clamp(m.x + m.vx * STEP, WALL, STAGE_W - WALL);
    if (!T.fly) { m.vy += GRAV * STEP; m.y = Math.min(0, m.y + m.vy * STEP); if (m.y >= 0) m.vy = 0; }
  }
  // 妖物的箭、定身阵、火柱
  for (const q of F.shots) {
    if (q.trap || q.fire) {
      q.t -= STEP;
      if (q.t <= 0 && !q.done) {
        q.done = true; q.life = 0.35;
        if (q.fire) { flashA = Math.max(flashA, 0.08); flashRGB = '255,170,90'; SFX.thud(); for (let k = 0; k < 16; k++) addP({ type: 'spark', x: q.x + rand(-30, 30), y: -rand(0, 200), vx: rand(-60, 60), vy: -rand(100, 400), life: 0.5, max: 0.5, rgb: '255,160,70', w: 2 }); }
        else { ring(q.x, -10, 70, '200,120,255', 0.4); SFX.poof(); }
        for (const af of allies) {
          if (Math.abs(af.x - q.x) < q.r && af.y > -60) monHitPlayer({ x: q.x, T: { eye: q.fire ? '255,160,70' : '200,120,255' } }, q.dmg * (q.dk || 1), 0, q.fire ? 0.4 : 0.6, q.fire, !q.fire, af);
        }
      }
      if (q.done) q.life -= STEP;
    } else {
      q.x += q.vx * STEP; q.life -= STEP;
      const hitAf = allies.find(af => overlap([q.x - 14, q.y - 5, q.x + 14, q.y + 5], hurtbox(af)));
      if (hitAf) { q.life = 0; monHitPlayer({ x: q.x - Math.sign(q.vx) * 10, T: { eye: '120,255,140' } }, q.dmg * (q.dk || 1), 180, 0.3, false, false, hitAf); }
      // 任一同袍挥刀都可以把箭砍掉
      for (const af of allies) {
        if (af.state === 'attack' && af.move && af.t >= af.move.su && af.t < af.move.su + af.move.ac && overlap(hitbox(af, af.move.box), [q.x - 14, q.y - 5, q.x + 14, q.y + 5])) {
          q.life = 0; blockFX(q.x, q.y, af.face); SFX.block();
        }
      }
    }
  }
  F.shots = F.shots.filter(q => (q.trap || q.fire) ? !(q.done && q.life <= 0) : q.life > 0);
  F.mons = F.mons.filter(m => m.hp > 0);
  // 代理：把 B 放到离主控最近的妖物身上，这样技能、飞行道具、大招与同袍 AI 都能自动瞄准它
  const near = F.mons.slice().sort((a, b) => Math.abs(a.x - refAlly.x) - Math.abs(b.x - refAlly.x))[0];
  if (near) { B.x = near.x; B.y = near.y; B.vx = B.vy = 0; B.invul = 0; B.state = near.T.fly ? 'launched' : 'idle'; B.hp = B.maxHp; }
  else { B.x = clamp(refAlly.x + refAlly.face * 400, WALL, STAGE_W - WALL); B.y = 0; B.invul = 99; }
}
function drawForest() {
  const F = FOREST;
  // 竹林深处的眼睛
  for (let k = 0; k < 9; k++) { const x = hash(k * 7) * STAGE_W, y = -120 - hash(k * 3) * 260, on = Math.sin(clock * 0.7 + k * 2.1) > 0.6; if (on) { ctx.fillStyle = 'rgba(255,60,60,0.5)'; circle([x - 5, y], 2); circle([x + 5, y], 2); } }
  drawMons(F.mons, F.shots);
}
// 妖物和它们的箭、定身阵、火柱（斩妖列传和开放世界共用）
function drawMons(mons, shots) {
  for (const q of shots) {
    if (q.trap || q.fire) {
      const k = q.done ? q.life / 0.35 : clamp(1 - q.t / 0.9, 0, 1), c = q.fire ? '255,150,60' : '200,120,255';
      ctx.strokeStyle = `rgba(${c},${0.35 + 0.5 * k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(q.x, -2, q.r, 12, 0, 0, Math.PI * 2); ctx.stroke();
      if (q.done && q.fire) { ctx.fillStyle = `rgba(255,140,60,${k * 0.6})`; ctx.fillRect(q.x - 30, -260, 60, 260); }
      if (q.done && q.trap) { ctx.strokeStyle = `rgba(200,120,255,${k})`; ctx.lineWidth = 2; for (let a = 0; a < 6; a++) { ctx.beginPath(); ctx.moveTo(q.x + Math.cos(a) * 50, -4); ctx.lineTo(q.x, -60); ctx.stroke(); } }
    } else { ctx.strokeStyle = '#b8f5c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x - Math.sign(q.vx) * 16, q.y); ctx.lineTo(q.x + Math.sign(q.vx) * 10, q.y); ctx.stroke(); }
  }
  for (const m of mons) {
    const T = m.T, x = m.x, y = m.y, f = m.face, bob = Math.sin(m.ph * 4) * 3, warn = m.wind > 0 || m.act === 'swoop';
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, 2, 24, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = m.flash > 0 ? '#e8e0f0' : '#0d0b16'; ctx.strokeStyle = `rgba(${T.eye},0.5)`; ctx.lineWidth = 1.5;
    if (m.key === 'owl') {
      const fl = Math.sin(m.ph * 14) * 12;
      ctx.beginPath(); ctx.ellipse(x, y, 16, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x - 42, y - 10 + fl); ctx.lineTo(x - 16, y + 6); ctx.moveTo(x + 10, y); ctx.lineTo(x + 42, y - 10 + fl); ctx.lineTo(x + 16, y + 6); ctx.fill();
      ctx.fillStyle = `rgb(${T.eye})`; circle([x - 5, y - 3], 2.5); circle([x + 5, y - 3], 2.5);
    } else {
      const yy = T.float ? y - 20 + Math.sin(m.ph * 2) * 8 : y;
      ctx.beginPath();
      if (m.key === 'binder') { ctx.moveTo(x - 22, yy - 20); ctx.quadraticCurveTo(x - 26, yy - 90, x, yy - 98); ctx.quadraticCurveTo(x + 26, yy - 90, x + 22, yy - 20); ctx.lineTo(x + 10, yy + 4); ctx.lineTo(x, yy - 12); ctx.lineTo(x - 10, yy + 4); }
      else if (m.key === 'caster') { ctx.moveTo(x - 24, yy); ctx.lineTo(x - 12, yy - 84); ctx.lineTo(x, yy - 108); ctx.lineTo(x + 12, yy - 84); ctx.lineTo(x + 24, yy); }
      else { ctx.moveTo(x - 18, yy); ctx.lineTo(x - 20, yy - 70 + bob); ctx.quadraticCurveTo(x, yy - 110 + bob, x + 20, yy - 70 + bob); ctx.lineTo(x + 18, yy); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      const ey = m.key === 'caster' ? yy - 86 : m.key === 'binder' ? yy - 74 : yy - 84 + bob;
      ctx.fillStyle = `rgb(${T.eye})`; circle([x + f * 4 - 5, ey], 2.6); circle([x + f * 4 + 5, ey], 2.6);
      ctx.strokeStyle = m.flash > 0 ? '#fff' : '#9aa0b4'; ctx.lineWidth = 3;
      if (m.key === 'blade') { ctx.beginPath(); ctx.moveTo(x + f * 16, yy - 50); ctx.quadraticCurveTo(x + f * 60, yy - 70 - (warn ? 30 : 0), x + f * 70, yy - 30); ctx.stroke(); }
      if (m.key === 'archer') { ctx.beginPath(); ctx.arc(x + f * 18, yy - 64, 24, -1.2, 1.2); ctx.stroke(); }
      if (m.key === 'caster') { ctx.fillStyle = `rgba(${T.eye},${warn ? 1 : 0.6})`; circle([x + f * 22, yy - 70], warn ? 8 : 5); }
      if (m.key === 'binder') { ctx.strokeStyle = 'rgba(200,120,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 20, yy - 40); ctx.lineTo(x - 40, yy - 20); ctx.moveTo(x + 20, yy - 40); ctx.lineTo(x + 40, yy - 20); ctx.stroke(); }
    }
    if (warn) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${T.eye},0.25)`; circle([x, y - (T.fly ? 0 : 60)], 40); ctx.globalCompositeOperation = 'source-over'; }
    const bw = 44, top = (T.fly ? y - 26 : y - T.h - (T.float ? 30 : 12));
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - bw / 2, top - 6, bw, 4); ctx.fillStyle = `rgb(${T.eye})`; ctx.fillRect(x - bw / 2, top - 6, bw * m.hp / m.maxHp, 4);
    ctx.fillStyle = 'rgba(230,220,240,0.55)'; ctx.font = `12px ${BODY_FONT}`; ctx.textAlign = 'center'; ctx.fillText(`${T.name}·${T.kind}`, x, top - 12);
    ctx.restore();
  }
}
function drawForestHUD() {
  const S = STAGE, F = FOREST; if (!S || S.boss) return;
  if (isRaid()) drawHUDRaid();
  const fs = Math.max(13, Math.round(H * 0.019)), x = W - Math.max(24, W * 0.04), y = Math.max(22, H * 0.04) + 84, w = fs * 12;
  const left = F.toSpawn.length + F.mons.filter(m => m.hp > 0).length;
  const perkCnt = (M.towerPerks || []).length;
  const rows = [
    [`第 ${Math.max(1, F.wave)} / ${S.waves.length} 波妖潮`, F.breakT > 0 ? '喘息休整' : `尚余 ${left} 妖`],
    ['全队已斩妖物', `${F.total} 只`],
    ['同袍共享秘卷', `${perkCnt} 卷`]
  ];
  ctx.save(); ctx.textBaseline = 'top'; ctx.font = `${fs}px ${BODY_FONT}`;
  ctx.fillStyle = 'rgba(8,8,20,0.72)'; ctx.fillRect(x - w - 12, y - 10, w + 24, (rows.length + 1) * fs * 1.65 + 12);
  ctx.strokeStyle = 'rgba(233,196,106,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(x - w - 12, y - 10, w + 24, (rows.length + 1) * fs * 1.65 + 12);
  ctx.textAlign = 'left'; ctx.fillStyle = '#e9c46a'; ctx.fillText(`${F.storyTitle || (`关卡 ${S.id} · ${S.C.name}`)}`, x - w, y);
  rows.forEach(([n, v], i) => { ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(239,232,216,0.7)'; ctx.fillText(n, x - w, y + (i + 1) * fs * 1.65); ctx.textAlign = 'right'; ctx.fillStyle = '#efe8d8'; ctx.fillText(v, x, y + (i + 1) * fs * 1.65); });
  // 底部显示当前侠客斩妖剧情台词条幅
  if (F.storyLine) {
    const bw = Math.min(W - 60, 760), bx = (W - bw) / 2, by = H - 54;
    ctx.fillStyle = 'rgba(10,12,24,0.82)';
    ctx.fillRect(bx, by, bw, 36);
    ctx.strokeStyle = 'rgba(233,196,106,0.55)';
    ctx.strokeRect(bx, by, bw, 36);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(12, fs - 1)}px ${BODY_FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(F.storyLine, W / 2, by + 18);
  }
  ctx.restore();
}
function backToStages() {
  toMenu();
  menuCam.tx = MENU_SPOT[OFFLINE_BUILD ? 'netp' : 'single'] * 1.05; menuCam.tz = 1.9;
  openScreen('stage');
}
$id('feNext').addEventListener('click', () => { const nx = nextStage(STAGE); if (!nx) return; paused = false; showScreen(null); startStage(nx[0], nx[1]); });
$id('feAgain').addEventListener('click', () => { paused = false; showScreen(null); startStage(STAGE.c, STAGE.l); });
$id('feMenu').addEventListener('click', () => { paused = false; backToStages(); });

// 木人桩高级功能特性清单：将四种情况（钉在原地、持续格挡、受击腾空闪、不还手）及扩展功能融合成统一的特性列表
const DUMMY_FEATURES = {
  fixed: { name: '钉在原地', desc: '免除击飞击退位移，锁死原点' },
  block: { name: '一味死守', desc: '全程保持防御格挡' },
  escape: { name: '被连便闪', desc: '被挑空/连击4段受身腾空闪' },
  counter: { name: '防守反击', desc: '格挡受击后适度出拳打断' },
  infGuard: { name: '坚若磐石', desc: '架势耐力恒满永不破防' },
  autoHeal: { name: '连段自愈', desc: '连击结束后血量秒回满' }
};
let dummyCfg = { fixed: false, block: false, escape: false, counter: false, infGuard: true, autoHeal: true };
const DUMMY_MODES = { stand: '任打不还手', block: '一味死守', escape: '被连便闪', fixed: '钉在原地' };

class DummyCtrl extends Ctrl {
  constructor(modeOrCfg) {
    super();
    if (typeof modeOrCfg === 'object' && modeOrCfg !== null) {
      this.cfg = { ...modeOrCfg };
    } else {
      this.cfg = {
        fixed: modeOrCfg === 'fixed' || dummyCfg.fixed,
        block: modeOrCfg === 'block' || dummyCfg.block,
        escape: modeOrCfg === 'escape' || dummyCfg.escape,
        counter: !!dummyCfg.counter,
        infGuard: !!dummyCfg.infGuard,
        autoHeal: !!dummyCfg.autoHeal
      };
    }
    this.mode = typeof modeOrCfg === 'string' ? modeOrCfg : 'custom';
  }
  think(me) {
    this.held.down = !!this.cfg.block;
    if (this.cfg.escape && me.breakCD <= 0 && (me.state === 'launched' || (me.state === 'hitstun' && me.comboHits >= 4)) && me.t > 0.08) {
      this.press('dash');
    }
    if (this.cfg.counter && me.breakCD <= 0 && me.state === 'blockstun' && Math.random() < 0.25) {
      this.press('light');
    }
  }
}
const TRAIN = { total: 0, hits: [], best: 0, bestDmg: 0 };

// 电脑：按键都由 src/ai.js 里的 AIBrain 决定，这里只是接到操作上
class AICtrl extends Ctrl {
  constructor(level) { super(); this.level = level; this.brain = new AIBrain(this, level); this.L = this.brain.L; }
  updateTactic() { this.brain.newRound(); }
  think(me, foe) {
    // 联机回滚时两边各跑一份电脑，必须掷出同样的骰子：想招这一下借用对局随机数（会进存档），想完换回来
    if (!(ROLL.on && M.mode === 'net')) return this.brain.think(me, foe);
    const r0 = Math.random; Math.random = grnd;
    try { this.brain.think(me, foe); } finally { Math.random = r0; }
  }
}

