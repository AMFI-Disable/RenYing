const HERO_HIT_DETAILS = {
  liying: {
    light: { name: '离魂五斩', badge: '✦ 快刀', badgeCls: 'badge-buff', dmg: '77 (5段)', desc: '单刀五连斩，末段挑空。' },
    charge: { name: '雾里藏锋', badge: '💥 破防', badgeCls: 'badge-break', dmg: '—', desc: '按住蓄力，一刀破开正面格挡。' },
    air: { name: '落影斩', badge: '✦ 挑空', badgeCls: 'badge-buff', dmg: '—', desc: '空中两段斩。他只有一段跳，跳起来就要想好怎么落地。' },
    skill: { name: '留影', badge: '✦ 留下雾身', badgeCls: 'badge-buff', dmg: '40', desc: '在脚下留一个雾身，向前踏出一大步斩一刀。已有雾身同步出刀并在身后留下一具较弱子影。场上最多 10 个雾身，具高额生命承受伤害，碎裂反噬引爆。出招伴随内功气刃直透防御。' },
    ranged: { name: '渡影', badge: '✦ 霸体换位', badgeCls: 'badge-stun', dmg: '—', desc: '获得 0.25 秒霸体护身，全场进入 0.5 秒时空凝滞供拣选目标真身雾身；未选则随机指定。结印后身形瞬现，消去真身雾身，路径间飞身割裂。' },
    ult: { name: '万影归一', badge: '✦ 雾身齐斩', badgeCls: 'badge-stun', dmg: '45~113', desc: '每个雾身朝对手斩出一道刀光，然后本体瞬移到对手身前补一刀挑空。全程没有无敌。' },
    esc: { name: '散影', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  yuxiao: {
    light: { name: '玉箫点穴连击', badge: '攒音律', badgeCls: 'badge-buff', dmg: '95 (5段)', desc: '箫管点打五连击，每中一击攒一枚音律，最多三枚。' },
    charge: { name: '横吹破气扫击', badge: '破防打倒', badgeCls: 'badge-break', dmg: '35.3 / 56.8', desc: '旋身横扫破开防守，将对手打倒在地。' },
    air: { name: '高音穿云斩', badge: '挑空', badgeCls: 'badge-buff', dmg: '17.6 / 25.5', desc: '跃起凌空横箫劈点，二段把人送上云霄。' },
    skill: { name: '清音破空', badge: '音波穿透', badgeCls: 'badge-stun', dmg: '22~82', desc: '将身上的音律一次吹尽，三律齐鸣时音波贯穿挑空并迟缓对手。' },
    ranged: { name: '回音壁', badge: '弹回暗器', badgeCls: 'badge-break', dmg: '18~42', desc: '筑起回音屏障推开近敌，弹回期间飞来的暗器并获得音律。' },
    ult: { name: '广陵散', badge: '曲终绝响', badgeCls: 'badge-stun', dmg: '144~189', desc: '六道音刃轮番穿身，曲终绝响从脚下炸开，音律回满。' },
    esc: { name: '休止符', badge: '霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  zuixian: {
    light: { name: '醉拳五打', badge: '醉意增伤', badgeCls: 'badge-buff', dmg: '97 (5段)', desc: '东倒西歪的五连拳，醉意越高越痛。' },
    charge: { name: '醉汉撞钟', badge: '破防击飞', badgeCls: 'badge-break', dmg: '36 / 58', desc: '身如醉钟横撞，正面撞碎对手防御。' },
    air: { name: '倒踢金钩', badge: '挑空', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '凌空一记醉倒踢，翻身把人踢上半空。' },
    skill: { name: '亭中留客', badge: '禁锢 1.5s', badgeCls: 'badge-stun', dmg: '20', desc: '召唤醉翁亭从空中砸落，将对手困在亭中 1.5 秒任由宰割；对手可用腾空闪脱困，霸体可硬抗。' },
    ranged: { name: '与民同乐', badge: '共饮回春', badgeCls: 'badge-buff', dmg: '0 (+135血)', desc: '半壶酒掷向对手，自身回135血晕0.7秒，对手回85血晕1.5秒并清空酒意。' },
    ult: { name: '山水之间', badge: '全屏墨染', badgeCls: 'badge-stun', dmg: '120 (8段)', desc: '醉意化作山水墨色浸染乾坤，全屏判定八段绝杀，无法闪避。' },
    esc: { name: '醉卧浮生', badge: '霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  gouchen: {
    light: { name: '链锤连打', badge: '长臂展', badgeCls: 'badge-buff', dmg: '94.1 (5段)', desc: '甩着链锤抡打五连击，攻击距离比常人长一截。' },
    charge: { name: '流星坠地', badge: '破防砸倒', badgeCls: 'badge-break', dmg: '34.9 / 56.3', desc: '铁锤绷直重重砸落，崩裂地面砸倒对手。' },
    air: { name: '飞轮落锤', badge: '挑空下砸', badgeCls: 'badge-buff', dmg: '17.5 / 25.2', desc: '空中抡圆链锤扫打，二段势大力沉压向地面。' },
    skill: { name: '飞锤拉拽', badge: '拽至身前', badgeCls: 'badge-stun', dmg: '18', desc: '甩出链锤将远处的对手一把拽到跟前，附加震魄增伤。' },
    ranged: { name: '旋锤风暴', badge: '砸碎暗器', badgeCls: 'badge-buff', dmg: '58 (5圈)', desc: '头顶抡圆飞转砸碎飞镖暗器，第五圈脱手一甩把人击飞。' },
    ult: { name: '开天一锤', badge: '巨锤震晕', badgeCls: 'badge-stun', dmg: '120', desc: '将链锤甩上天化作百倍巨锤砸落震晕，回锤再抡一击。' },
    esc: { name: '钩索腾云', badge: '霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  qianji: {
    light: { name: '天工连推', badge: '✦ 传动机掌', badgeCls: 'badge-buff', dmg: '88 (4段)', desc: '铜腕推击，末段推掌击飞；命中场上傀丸可将其击飞平推加速。' },
    charge: { name: '重机轰爆', badge: '💥 破防重击', badgeCls: 'badge-break', dmg: '36 / 60', desc: '机关臂重轰，击中傀丸时将其轰击成极速重炮。' },
    air: { name: '机影凌空', badge: '✦ 空中连击', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '半空翻身拍掌，二段势大力沉压地。' },
    skill: { name: '金丝回环', badge: '✦ 限距往返', badgeCls: 'badge-buff', dmg: '24', desc: '沿朝向放出傀丸，在有限距离内持续往返；普攻与蓄力击打可改向并短暂加速。' },
    ranged: { name: '穿丝急袭', badge: '🛡️ 受击可放', badgeCls: 'badge-break', dmg: '48', desc: '傀丸沿当前朝向高速穿击，随后回到往返环；受击硬直或浮空时可强制解控。' },
    ult: { name: '机轮三穿', badge: '✦ 三次全场穿击', badgeCls: 'badge-stun', dmg: '120上限', desc: '傀丸疾驰横穿战场三次，再沿金丝回手；每名敌人最多承受 120 点伤害，回手后刷新 Q。' },
    esc: { name: '金丝引遁', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，借金丝后撤腾空。' }
  },
  cixian: {
    light: { name: '两极磁掌', badge: '⊕ 击飞 / ⊖ 轻吸', badgeCls: 'badge-buff', dmg: '⊕ ×1.35 / ⊖ ×0.55', desc: '正极每掌击飞，伤害高；负极每掌把人吸近一点，四段循环可以一直连，连中 15 下消磁。' },
    charge: { name: '磁暴蓄掌', badge: '💥 破防推掌', badgeCls: 'badge-break', dmg: '36 / 58', desc: '蓄满一掌推出，强行贯穿正面格挡。' },
    air: { name: '凌空磁掌', badge: '✦ 空中连击', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '空中拍掌，二段向下压地。' },
    skill: { name: '极性反转', badge: '⊕ ⇄ ⊖', badgeCls: 'badge-buff', dmg: '—', desc: '正负极互换，不花出招时间，身上亮起红色 ⊕ 或蓝色 ⊖，立刻清零 R 的冷却。' },
    ranged: { name: '磁极', badge: '⊕ 弹开 / ⊖ 吸来', badgeCls: 'badge-stun', dmg: '48 / 16', desc: '正极身边磁石炸开把人用力弹走，越近越远；负极把中距离的人吸到身前定住 0.5 秒。' },
    ult: { name: '天地磁合', badge: '✦ 夹成肉饼', badgeCls: 'badge-stun', dmg: '125', desc: '天上的正极和地上的负极把对手夹在中间，合拢后定住 1 秒。' },
    esc: { name: '磁浮腾空', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，借磁力腾空退避，落地前无敌。' }
  },
  lingque: {
    light: { name: '飞梭快影连刺', badge: '✦ 飞梭速刺', badgeCls: 'badge-buff', dmg: '93.1 (5段)', desc: '子母梭双持穿刺连击，出手灵巧如惊雀掠空。' },
    charge: { name: '梭芒贯日蓄斩', badge: '💥 破防突刺', badgeCls: 'badge-break', dmg: '34.6 / 55.7', desc: '悬丝真气贯注双梭猛刺，强行贯通正面格挡。' },
    air: { name: '凌波空刺·掠地', badge: '✦ 空中回旋', badgeCls: 'badge-buff', dmg: '17.3 / 25', desc: '空中旋身飞梭点刺，二段凌波斜下掠击。' },
    skill: { name: '穿叶飞梭', badge: '✦ 雀芒印记 5s', badgeCls: 'badge-stun', dmg: '30', desc: '掷出牵丝子母梭贯穿前方，命中施加5秒雀芒印记。' },
    ranged: { name: '移形换影', badge: '✦ 雀芒引爆', badgeCls: 'badge-buff', dmg: '34 (+30爆伤)', desc: '化作流光追着对手飞过去穿刺（最多追 0.8 秒），只有腾空闪这类无敌身法躲得开；穿透已带印记者追加30爆炸伤害、挑空并瞬间刷新冷却！' },
    ult: { name: '万线归宗', badge: '✦ 全域悬丝', badgeCls: 'badge-stun', dmg: '140 (8段)', desc: '漫天悬丝罗网交错绞杀，附加雀芒印记并清零换影冷却。' },
    esc: { name: '雀步凌波', badge: '🛡️ 悬丝脱困', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，牵引悬丝腾空退避，落地前无敌。' }
  },
  qingfeng: {
    light: { name: '五段快剑连斩', badge: '🌪️ 击飞浮空', badgeCls: 'badge-buff', dmg: '100.9 (5段)', desc: '行云流水五连斩，末段挑空，青蓝弧光残影。' },
    charge: { name: '破防蓄力大劈', badge: '💥 破防打倒', badgeCls: 'badge-break', dmg: '37.4 / 60.3', desc: '长蓄后重剑崩地，无视常规格挡，正面击倒。' },
    air: { name: '凌空挑斩·下砸', badge: '🌪️ 挑空击倒', badgeCls: 'badge-buff', dmg: '18.7 / 27', desc: '空中横斩滞空，二段重坠下劈强压地面。' },
    skill: { name: '居合·疾风斩', badge: '⚡ 斩穴定身 0.65s', badgeCls: 'badge-stun', dmg: '55', desc: '身随剑走瞬间穿身，施加穴道强定身并刷新剑气与冲刺。' },
    ranged: { name: '弧月·剑气', badge: '🌪️ 掀天挑空', badgeCls: 'badge-buff', dmg: '52', desc: '半屏极速弧月剑刃，破尽暗器并挑飞空中。' },
    ult: { name: '绝技·残月', badge: '⚡ 剑意通明', badgeCls: 'badge-stun', dmg: '169 (6连)', desc: '居合连影绞杀，斩落重置全技能与绝技气量回涌。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '强解受击硬直，腾空向后位移，落地前无敌。' }
  },
  tieshan: {
    light: { name: '重剑沉猛五斩', badge: '💥 霸体压制', badgeCls: 'badge-break', dmg: '93.1 (5段)', desc: '玄铁巨剑刀刀沉重带金属火星，体量压迫。' },
    charge: { name: '裂地狂怒崩山', badge: '💥 破防轰飞', badgeCls: 'badge-break', dmg: '34.6 / 55.7', desc: '双足踏裂地面，满蓄霸体强攻，双倍瓦解架势。' },
    air: { name: '重剑空击·碎石', badge: '💥 沉重砸地', badgeCls: 'badge-break', dmg: '17.3 / 25', desc: '高空举刃重砸，重力势能造成剧烈下坠冲击。' },
    skill: { name: '撼地·震地波', badge: '💥 撼地重震 0.45s', badgeCls: 'badge-stun', dmg: '45 + 40', desc: '双手托刃砸裂地面，双向土石裂地波掀飞穹顶。' },
    ranged: { name: '焚血狂突·玄甲巨浪', badge: '🌊 通天巨浪', badgeCls: 'badge-break', dmg: '56', desc: '掀起通天巨浪呼啸冲锋，通天高度彻底封杀空中与腾空，巨浪拍岸瓦解防御。' },
    ult: { name: '奥义·山崩', badge: '💫 怒意回涌 1.3s', badgeCls: 'badge-stun', dmg: '185 (直击)', desc: '一跃擎天泰山压顶，正中晕眩1.3s并回满气重置CD；砸偏或砸倒地的对手只回半气。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 霸体解控', badgeCls: 'badge-break', dmg: '—', desc: '玄铁重甲强解受控，稳健退避重整架势。' }
  },
  feiying: {
    light: { name: '迅疾双刃刺杀', badge: '⚡ 疾风连打', badgeCls: 'badge-buff', dmg: '92 (5段)', desc: '出刀极疾，近身密雨连刺，末段暗影穿刺。' },
    charge: { name: '疾影背刺斩', badge: '💥 破防背袭', badgeCls: 'badge-break', dmg: '40.3 / 65', desc: '侧闪蓄力直取后背，大幅破除正面架势。' },
    air: { name: '回旋空刃·落刺', badge: '🌪️ 滞空穿刺', badgeCls: 'badge-buff', dmg: '20.2 / 29.1', desc: '空中回旋双刺，下落直刺钉向地面。' },
    skill: { name: '暗影·影遁', badge: '🌑 背后绞杀', badgeCls: 'badge-stun', dmg: '45', desc: '结印化烟，0.15 秒掠到对手背后十字绞杀（不让对手僵直），之后下一击增伤50%。' },
    ranged: { name: '飞星·手里剑', badge: '⚡ 极速截击', badgeCls: 'badge-buff', dmg: '25×4', desc: '扇形四枚暗铁手里剑，极速打断对手起手动作。' },
    ult: { name: '绝杀·千影', badge: '⚡ 暗影绝杀', badgeCls: 'badge-stun', dmg: '179 (9连)', desc: '九道猩红残影错落绞杀，终结重置影遁并化分身。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 影遁化解', badgeCls: 'badge-break', dmg: '—', desc: '替身化烟脱困，身轻如燕迅速拉开安全身位。' }
  },
  liuyun: {
    light: { name: '折扇翻飞连舞', badge: '🌪️ 击退推搡', badgeCls: 'badge-buff', dmg: '114.5 (5段)', desc: '轻扇翻转随风而动，动作轻盈且多段推退。' },
    charge: { name: '旋风拂柳蓄斩', badge: '💥 破防卷地', badgeCls: 'badge-break', dmg: '42.5 / 68.4', desc: '引动周身气流向前爆破，推开正面一切防备。' },
    air: { name: '御风凌云·挥风', badge: '🌪️ 浮空风切', badgeCls: 'badge-buff', dmg: '21.2 / 30.7', desc: '空中三段跳滞空扇击，下扫带风刃压制。' },
    skill: { name: '惊涛·风刃', badge: '🌪️ 双刃齐发', badgeCls: 'badge-buff', dmg: '28×2', desc: '挥扇一次扇出上下两道风刃，几无硬直，击退极强。' },
    ranged: { name: '开扇·米花', badge: '🍿 半秒后爆', badgeCls: 'badge-buff', dmg: '8×5', desc: '张开折扇朝前疾冲，一路撒下爆米花，半秒后噼啪炸开。' },
    ult: { name: '神通·龙卷', badge: '🌪️ 扶摇万里', badgeCls: 'badge-buff', dmg: '16×16', desc: '召出接天双龙卷横扫，卷入高空，跳跃次数回满。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 乘风化解', badgeCls: 'badge-break', dmg: '—', desc: '御风乘气向后腾跃，完美契合三段跳身法。' }
  },
  leiming: {
    light: { name: '狂雷六连轰拳', badge: '⚡ 疾电连打', badgeCls: 'badge-buff', dmg: '132 (6段)', desc: '六记重拳连环轰击，拳拳带雷，末拳雷暴轰天。' },
    charge: { name: '蓄力奔雷重炮', badge: '💥 破防重击', badgeCls: 'badge-break', dmg: '33.8 / 54.5', desc: '沉腰蓄势轰出电芒重拳，无坚不摧打倒在地。' },
    air: { name: '空落雷拳·踏击', badge: '⚡ 震雷落击', badgeCls: 'badge-buff', dmg: '16.9 / 24.4', desc: '空中重拳下砸，接连一记沉雷踏击。' },
    skill: { name: '电光·雷闪', badge: '⚡ 触电麻痹 0.38s', badgeCls: 'badge-stun', dmg: '40', desc: '化身雷光贴地霸体冲拳，触电麻痹瘫痪0.38秒并重置雷铠。' },
    ranged: { name: '金刚·雷铠', badge: '⚡ 引雷反震 50', badgeCls: 'badge-stun', dmg: '50', desc: '架起金刚雷铠0.55秒，贴身攻击引雷反击，受雷击者快速起身；远程及雾身攻击不触发。' },
    ult: { name: '雷帝·雷霆万钧', badge: '⚡ 雷帝灌顶 +30%', badgeCls: 'badge-stun', dmg: '48×3', desc: '九天神雷三连追落敌身，重置拳劲并回涌30%大招气量。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 金刚解控', badgeCls: 'badge-break', dmg: '—', desc: '金刚怒吼震脱受制状态，后退步稳如磐石。' }
  },
  lingshuang: {
    light: { name: '银枪连刺·抽枪', badge: '⚡ 枪芒连刺', badgeCls: 'badge-buff', dmg: '97 (5段)', desc: '长枪一线连环突刺，枪尖命中伤害提升25%。' },
    charge: { name: '百步穿杨远刺', badge: '💥 远距破防', badgeCls: 'badge-break', dmg: '36 / 58', desc: '极远距离枪尖猛刺，直接破除远处格挡防御。' },
    air: { name: '寒芒点水·挑刺', badge: '🌪️ 空中穿云', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '空中点枪突刺，下压枪尾横扫落地。' },
    skill: { name: '绝技·回马枪', badge: '⚡ 枪尖穿心 0.48s', badgeCls: 'badge-stun', dmg: '60', desc: '后跃避开敌势，235px极限回刺穿心定身+挑空。' },
    ranged: { name: '乾坤·枪旋', badge: '🛡️ 弹飞投掷 125px', badgeCls: 'badge-break', dmg: '15×7+48', desc: '枪如风车拨落飞行道具，末段大横扫全额击飞。' },
    ult: { name: '神技·刹那', badge: '❄️ 寒芒贯日 4.0s', badgeCls: 'badge-stun', dmg: '140–185', desc: '漫天枪影化为一线寒芒贯穿，重置技能并减速40%。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 游龙脱困', badgeCls: 'badge-break', dmg: '—', desc: '身化游龙向后挑跃，拉开枪客最强打击身位。' }
  },
  moyu: {
    light: { name: '挥毫泼墨五式', badge: '🎨 浓墨溅射', badgeCls: 'badge-buff', dmg: '86 (5段)', desc: '狼毫大笔挥洒浓墨，附带远程墨滴额外伤害（每团24）。' },
    charge: { name: '墨宝万钧重印', badge: '💥 破防顿笔', badgeCls: 'badge-break', dmg: '38.9 / 62.6', desc: '蓄墨如山大印落下，墨意四溢击倒受击者。' },
    air: { name: '临空写意·泼洒', badge: '🎨 空中泼彩', badgeCls: 'badge-buff', dmg: '19.4 / 28.1', desc: '空中挥墨阻击，落地重笔点化画境。' },
    skill: { name: '画地·墨阵', badge: '⚡ 深墨禁锢 0.48s', badgeCls: 'badge-stun', dmg: '35', desc: '铺开115px深墨池，踏入者定身0.48秒并迟缓2.8秒；二段Q引爆25伤害。' },
    ranged: { name: '提笔·画符', badge: '📜 符 +1', badgeCls: 'badge-buff', dmg: '—', desc: '花 3 格墨水画一张符，最多攒 5 张，留给大招。' },
    ult: { name: '宣纸·符阵', badge: '📜 全图符爆', badgeCls: 'badge-stun', dmg: '80~280', desc: '整张图化作宣纸，对手染红，头顶的符炸开；符越多伤害越高。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 墨韵遁形', badgeCls: 'badge-break', dmg: '—', desc: '借墨遁身向后飘退，重组挥毫阵地。' }
  },
  yuehua: {
    light: { name: '双月流水旋舞', badge: '🌙 月华流水', badgeCls: 'badge-buff', dmg: '97 (5段)', desc: '双月短刃回旋如流水，舞姿飘逸清冷。' },
    charge: { name: '合璧明月蓄斩', badge: '💥 双刀破防', badgeCls: 'badge-break', dmg: '36 / 58', desc: '双刃化作满月合璧切落，斩断对手招架。' },
    air: { name: '清辉凌波·双刃', badge: '🌙 踏月凌空', badgeCls: 'badge-buff', dmg: '18 / 26', desc: '月刃凌空双分旋转，顺势飘然下斩。' },
    skill: { name: '神镜·月镜', badge: '🌙 太阴绝罚 1.05s', badgeCls: 'badge-stun', dmg: '95', desc: '月镜架招反斩，触发太阴绝罚95伤害、1.05秒超长硬直与禁身。' },
    ranged: { name: '飞轮·月轮', badge: '🌙 背袭破防 0.78s', badgeCls: 'badge-break', dmg: '28 / 38', desc: '双月轮飞出折返，去程28轻削，返程38背袭破防击飞。' },
    ult: { name: '仙术·月华如水', badge: '🌙 月魄霸体 +100HP', badgeCls: 'badge-buff', dmg: '75 (+100血)', desc: '月华凝露恢复100生命并震退近敌75伤害，月魄护体并重置月镜月轮。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 踏月退避', badgeCls: 'badge-break', dmg: '—', desc: '月光幻化身法退后，脱离危险贴身缠斗。' }
  },
  yanling: {
    light: { name: '飞羽短刃疾斩', badge: '🪶 振羽连打', badgeCls: 'badge-buff', dmg: '100.9 (5段)', desc: '羽刃翩跹迅捷凌厉，灵动逼人。' },
    charge: { name: '破云飞翔重扑', badge: '💥 破云重扑', badgeCls: 'badge-break', dmg: '37.4 / 60.3', desc: '双翼振起猛力前扑，切断对手阵势。' },
    air: { name: '苍穹展翼·掠击', badge: '🪶 空中掠阵', badgeCls: 'badge-buff', dmg: '18.7 / 27', desc: '空中长达1.2秒自由翱翔，自上而下俯瞰掠击。' },
    skill: { name: '鹰扬·俯冲', badge: '⚡ 鹰击钉地 0.40s', badgeCls: 'badge-stun', dmg: '46', desc: '收翼斜下猎杀钉地，空中击中可刷新且再次冲锋。' },
    ranged: { name: '千机·翎羽', badge: '🪶 极速穿透', badgeCls: 'badge-buff', dmg: '22×3', desc: '振翅激射三道穿透羽刃，贯穿全屏牵制打断。' },
    ult: { name: '天怒·万羽', badge: '🪶 凌霄破虚 14枚', badgeCls: 'badge-buff', dmg: '14×14', desc: '九霄万羽暴雨倾泻，重置技能并回满飞行耐力。' },
    esc: { name: '右键·腾空闪', badge: '🛡️ 振翅凌云', badgeCls: 'badge-break', dmg: '—', desc: '猛力振翅脱离受击，立刻升空开启空中制空权。' }
  }
};

const HERO_MOVE_SEQS = {
  liying: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1s', d: 0.07, lab: '离魂五斩' }, { p: 'l1a', d: 0.12, dx: 12, hit: 1 },
      { p: 'l2s', d: 0.06 }, { p: 'l2a', d: 0.12, dx: 12, hit: 1 },
      { p: 'l3s', d: 0.08 }, { p: 'l3a', d: 0.22, dx: 16, hit: 2, launch: true, badge: '挑空' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'hva', d: 0.3, dx: 30, hit: 3, launch: true, badge: '破防' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中（一段跳）' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.12, fx: 'mist', lab: 'Q · 留影' }, { p: 'l2a', d: 0.24, dx: 40, hit: 2, badge: '留下雾身' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.1, lab: 'R · 渡影' }, { p: 'idle', d: 0.08, fx: 'mistswap', dx: -60, badge: '换位' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.2, lab: 'E · 万影归一' }, { p: 'l3a', d: 0.45, dx: 40, fx: 'mistarray', hit: 3, launch: true, badge: '雾身齐斩' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '散影' }, { p: 'idle', d: 0.35, reset: true }]
  },
  yuxiao: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yx_play', d: 0.08, lab: '起奏' }, { p: 'yx_push', d: 0.12, dx: 10, hit: 1 },
      { p: 'fn_l1s', d: 0.08 }, { p: 'fn_l1a', d: 0.12, dx: 12, hit: 1 },
      { p: 'yx_play', d: 0.08 }, { p: 'lca', d: 0.18, dx: 14, hit: 2, launch: true, badge: '音律 +3' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'hva', d: 0.3, dx: 30, hit: 3, launch: true, badge: '破防打倒' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'yx_play', d: 0.14, lab: 'Q · 清音' }, { p: 'yx_push', d: 0.36, dx: 18, hit: 2, fx: 'note', launch: true, badge: '三律齐鸣' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'yx_play', d: 0.42, fx: 'mirror', hit: 1, lab: 'R · 回音壁', badge: '回音' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'yx_play', d: 0.2, lab: 'E · 广陵散' }, { p: 'yx_push', d: 0.45, fx: 'guangling', hit: 3, launch: true, badge: '曲终绝响' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '休止符' }, { p: 'idle', d: 0.35, reset: true }]
  },
  zuixian: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'zx_sway', d: 0.08, lab: '醉步连打' }, { p: 'lm_jab', d: 0.11, dx: 10, hit: 1 },
      { p: 'zx_drink', d: 0.08 }, { p: 'zx_breath', d: 0.12, dx: 12, hit: 1 },
      { p: 'zx_sway', d: 0.08 }, { p: 'zx_upper', d: 0.22, dx: 14, hit: 2, launch: true, badge: '醉意增伤' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'zx_upper', d: 0.3, dx: 30, hit: 3, launch: true, badge: '破防撞钟' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'zx_sway', d: 0.15, lab: 'Q · 亭中留客' }, { p: 'gc_wind', d: 0.32, fx: 'avalanche', hit: 2, badge: '飞亭砸落' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'zx_drink', d: 0.25, lab: 'R · 与民同乐' }, { p: 'gc_throw', d: 0.3, fx: 'proj', hit: 1, badge: '掷坛共饮' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'zx_drink', d: 0.2, lab: 'E · 山水之间' }, { p: 'zx_upper', d: 0.48, fx: 'shanshui', hit: 8, launch: true, badge: '全屏墨染' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '醉卧浮生' }, { p: 'idle', d: 0.35, reset: true }]
  },
  gouchen: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'gc_wind', d: 0.08, lab: '链锤连砸' }, { p: 'gc_throw', d: 0.12, dx: 12, hit: 1 },
      { p: 'gc_pull', d: 0.08 }, { p: 'gc_sweep', d: 0.22, dx: 16, hit: 2, launch: true, badge: '长臂挥砸' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'gc_sweep', d: 0.32, dx: 34, hit: 3, launch: true, badge: '破防砸倒' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'gc_sweep', d: 0.26, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'gc_throw', d: 0.2, fx: 'proj', lab: 'Q · 飞锤' }, { p: 'gc_pull', d: 0.3, hit: 1, badge: '震魄' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'gc_spin', d: 0.4, fx: 'spin', hit: 2, lab: 'R · 旋锤' }, { p: 'gc_throw', d: 0.25, hit: 2, badge: '击飞' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'gc_wind', d: 0.25, lab: 'E · 开天一锤' }, { p: 'gc_sweep', d: 0.42, fx: 'skynet', hit: 3, launch: true, badge: '巨锤震晕' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '钩索腾云' }, { p: 'idle', d: 0.35, reset: true }]
  },
  qianji: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1s', d: 0.07, lab: '铜手连推' }, { p: 'l1a', d: 0.11, dx: 10, hit: 1 },
      { p: 'l2s', d: 0.07 }, { p: 'l2a', d: 0.11, dx: 12, hit: 1 },
      { p: 'lcs', d: 0.07 }, { p: 'lca', d: 0.11, dx: 12, hit: 1 },
      { p: 'l3s', d: 0.08 }, { p: 'l3a', d: 0.18, dx: 16, hit: 2, launch: true, badge: '机掌击飞' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'spa', d: 0.3, dx: 32, hit: 3, launch: true, badge: '重械爆轰' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'qf_charge', d: 0.15, lab: 'Q · 金丝回环' }, { p: 'l1a', d: 0.3, fx: 'proj', hit: 1, badge: '限距往返' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.2, lab: 'R · 穿丝急袭' }, { p: 'hva', d: 0.25, fx: 'ironwall', hit: 1, launch: true, badge: '傀丸穿击' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'fy_seal', d: 0.15, lab: 'E · 机轮三穿' }, { p: 'victory', d: 0.5, fx: 'crescent', hit: 3, badge: '三穿回手' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '金丝引遁' }, { p: 'idle', d: 0.35, reset: true }]
  },
  cixian: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.07, lab: '负极磁掌' }, { p: 'lm_jab', d: 0.11, dx: 8, hit: 1 },
      { p: 'l2s', d: 0.07 }, { p: 'lm_jab', d: 0.11, dx: 8, hit: 1 },
      { p: 'fn_l1s', d: 0.07 }, { p: 'fn_l1a', d: 0.11, dx: 8, hit: 1 },
      { p: 'lds', d: 0.07 }, { p: 'lm_kick', d: 0.14, dx: 8, hit: 1, badge: '接回第一掌' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'spa', d: 0.3, dx: 32, hit: 3, launch: true, badge: '破防推掌' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'aj_fists_1a', d: 0.16, hit: 1 }, { p: 'aj_fists_2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'idle', d: 0.3, fx: 'ironwall', lab: 'Q · 极性反转', badge: '⊕ ⇄ ⊖' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'lm_boxer', d: 0.15, lab: 'R · 磁极' }, { p: 'hva', d: 0.25, fx: 'ironwall', hit: 2, launch: true, badge: '弹开' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'lm_boxer', d: 0.15, lab: 'E · 天地磁合' }, { p: 'victory', d: 0.5, fx: 'crescent', hit: 1, badge: '夹成肉饼' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '磁浮腾空' }, { p: 'idle', d: 0.35, reset: true }]
  },
  lingque: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'du_l1s', d: 0.07, lab: '飞梭速刺' }, { p: 'du_l1a', d: 0.11, dx: 12, hit: 1 },
      { p: 'du_l2s', d: 0.07 }, { p: 'du_l2a', d: 0.11, dx: 14, hit: 1 },
      { p: 'du_l1s', d: 0.07 }, { p: 'lca', d: 0.18, dx: 16, hit: 2, launch: true, badge: '击飞' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [{ p: 'idle', d: 0.1, reset: true }, { p: 'charge', d: 0.42, lab: '按住蓄力' }, { p: 'hva', d: 0.3, dx: 32, hit: 3, launch: true, badge: '破防突刺' }, { p: 'idle', d: 0.35, reset: true }],
    air: [{ p: 'idle', d: 0.1, reset: true }, { p: 'jump', d: 0.16, lab: '空中' }, { p: 'a1a', d: 0.16, hit: 1 }, { p: 'a2a', d: 0.24, hit: 2, launch: true }, { p: 'idle', d: 0.35, reset: true }],
    skill: [{ p: 'idle', d: 0.1, reset: true }, { p: 'du_l1s', d: 0.12, lab: 'Q · 穿叶飞梭' }, { p: 'du_l1a', d: 0.24, fx: 'proj', hit: 1, badge: '雀芒印记' }, { p: 'idle', d: 0.35, reset: true }],
    ranged: [{ p: 'idle', d: 0.1, reset: true }, { p: 'du_l1s', d: 0.08, lab: 'R · 移形换影' }, { p: 'dash', d: 0.22, dx: 45, hit: 2, launch: true, badge: '雀芒引爆' }, { p: 'idle', d: 0.35, reset: true }],
    ult: [{ p: 'idle', d: 0.1, reset: true }, { p: 'du_l1s', d: 0.15, lab: 'E · 万线归宗' }, { p: 'du_l2a', d: 0.45, fx: 'needlestorm', hit: 8, launch: true, badge: '全域悬丝' }, { p: 'idle', d: 0.35, reset: true }],
    esc: [{ p: 'idle', d: 0.1, reset: true }, { p: 'bdash', d: 0.28, dx: -34, lab: '右键·身法', badge: '雀步凌波' }, { p: 'idle', d: 0.35, reset: true }]
  },
  qingfeng: {
    light: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'l1s', d: 0.07, lab: '普攻1' }, { p: 'l1a', d: 0.12, dx: 12, hit: 1 },
      { p: 'l2s', d: 0.06 }, { p: 'l2a', d: 0.12, dx: 12, hit: 1 },
      { p: 'lcs', d: 0.06 }, { p: 'lca', d: 0.12, dx: 12, hit: 1 },
      { p: 'l3s', d: 0.08 }, { p: 'l3a', d: 0.22, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'charge', d: 0.45, lab: '按住蓄力' },
      { p: 'hva', d: 0.30, dx: 36, hit: 3, launch: true, badge: '💥 破防打倒' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.18, lab: '空中' },
      { p: 'a1a', d: 0.18, hit: 1 },
      { p: 'a2a', d: 0.28, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'qf_charge', d: 0.14, lab: 'Q · 疾风斩' },
      { p: 'qf_thrust', d: 0.32, dx: 52, hit: 2, fx: 'gale', badge: '居合斩穴' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'qf_charge', d: 0.14, lab: 'R · 剑气' },
      { p: 'l3a', d: 0.36, fx: 'swordqi', hit: 1, launch: true, badge: '掀天挑空' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'qf_charge', d: 0.18, lab: 'E · 残月' },
      { p: 'qf_thrust', d: 0.14, dx: 45, hit: 1, fx: 'crescent' },
      { p: 'l1a', d: 0.1, hit: 1 }, { p: 'l2a', d: 0.1, hit: 1 },
      { p: 'hva', d: 0.3, hit: 3, launch: true, badge: '剑意通明' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.32, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  tieshan: {
    light: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'gs_l1s', d: 0.1, lab: '巨刃蓄势' }, { p: 'gs_l1a', d: 0.18, dx: 14, hit: 2 },
      { p: 'l2s', d: 0.08 }, { p: 'l2a', d: 0.16, dx: 16, hit: 2 },
      { p: 'ts_lift', d: 0.12 }, { p: 'ts_slam', d: 0.28, dx: 18, hit: 3, launch: true, badge: '巨刃崩地' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.12, reset: true },
      { p: 'charge', d: 0.5, lab: '玄铁蓄力' },
      { p: 'ts_slam', d: 0.32, dx: 34, hit: 3, launch: true, fx: 'quake', badge: '💥 破防击倒' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.2, lab: '空中' },
      { p: 'a1a', d: 0.18, hit: 1 },
      { p: 'ts_slam', d: 0.3, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ts_lift', d: 0.22, lab: 'Q · 震地' },
      { p: 'ts_slam', d: 0.36, hit: 2, fx: 'quake', launch: true, badge: '💥 撼地重震' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ts_lift', d: 0.12, lab: 'R · 铁壁冲' },
      { p: 'ts_shoulder', d: 0.38, dx: 48, hit: 2, fx: 'ironwall', launch: true, badge: '💥 崩山破势' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ts_lift', d: 0.25, lab: 'E · 山崩' },
      { p: 'ts_slam', d: 0.45, dx: 40, hit: 4, fx: 'avalanche', launch: true, badge: '💫 怒意回涌' },
      { p: 'victory', d: 0.6, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.3, dx: -30 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  feiying: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'du_l1s', d: 0.05, lab: '双刃连舞' }, { p: 'du_l1a', d: 0.09, dx: 10, hit: 1 },
      { p: 'du_l2s', d: 0.05 }, { p: 'du_l2a', d: 0.09, dx: 10, hit: 1 },
      { p: 'fy_crouch', d: 0.07 }, { p: 'fy_xslash', d: 0.16, dx: 14, hit: 2, launch: true, badge: '十字双刃' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.35, lab: '背刺蓄力' },
      { p: 'fy_xslash', d: 0.28, dx: 36, hit: 2, launch: true, badge: '💥 破防背刺' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '空中' },
      { p: 'a1a', d: 0.15, hit: 1 },
      { p: 'a2a', d: 0.25, hit: 2, launch: true },
      { p: 'idle', d: 0.3, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fy_seal', d: 0.14, lab: 'Q · 影遁' },
      { p: 'fy_xslash', d: 0.32, dx: 105, hit: 2, fx: 'blink', badge: '🌑 背后绞杀' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fy_seal', d: 0.12, lab: 'R · 飞镖' },
      { p: 'fy_crouch', d: 0.35, fx: 'kunai', hit: 1, badge: '极速截击' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fy_seal', d: 0.18, lab: 'E · 千影' },
      { p: 'fy_xslash', d: 0.14, dx: 45, hit: 2, fx: 'shadows' },
      { p: 'l1a', d: 0.08, hit: 1 }, { p: 'l2a', d: 0.08, hit: 1 },
      { p: 'fy_xslash', d: 0.25, hit: 3, launch: true, badge: '暗影绝杀' },
      { p: 'victory', d: 0.5, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.14, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.28, dx: -35 },
      { p: 'idle', d: 0.3, reset: true }
    ]
  },
  liuyun: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'fn_l1s', d: 0.08, lab: '折扇点穴' }, { p: 'fn_l1a', d: 0.12, dx: 10, hit: 1 },
      { p: 'ly_fanswipe', d: 0.1 }, { p: 'l2a', d: 0.12, dx: 10, hit: 1 },
      { p: 'fn_l1s', d: 0.08 }, { p: 'ly_fanswipe', d: 0.22, dx: 16, hit: 2, launch: true, badge: '乘风回扇' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.4, lab: '旋风蓄力' },
      { p: 'ly_hover', d: 0.15 },
      { p: 'hva', d: 0.28, dx: 30, hit: 2, launch: true, badge: '💥 破防卷地' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '御风浮空' },
      { p: 'ly_hover', d: 0.16 },
      { p: 'a1a', d: 0.22, hit: 2 },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_fanswipe', d: 0.14, lab: 'Q · 风刃' },
      { p: 'ly_hover', d: 0.36, fx: 'windblade', hit: 1, badge: '🌪️ 狂风推搡' },
      { p: 'idle', d: 0.3, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_hover', d: 0.32, dx: -45, fx: 'windstep', hit: 1, lab: 'R · 开扇', badge: '🍿 爆米花' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_fanswipe', d: 0.22, lab: 'E · 龙卷' },
      { p: 'ly_hover', d: 0.45, fx: 'tornado', hit: 3, launch: true, badge: '🌪️ 扶摇万里' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ly_hover', d: 0.3, dx: -40 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  leiming: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.05, lab: '快拳六连' }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
      { p: 'l2s', d: 0.04 }, { p: 'lm_jab', d: 0.06, dx: 5, hit: 1 },
      { p: 'lm_boxer', d: 0.05 }, { p: 'lm_kick', d: 0.08, dx: 8, hit: 1 },
      { p: 'lds', d: 0.05 }, { p: 'lm_kick', d: 0.08, dx: 8, hit: 1 },
      { p: 'lm_boxer', d: 0.05 }, { p: 'lm_jab', d: 0.08, dx: 8, hit: 1 },
      { p: 'lm_boxer', d: 0.06 }, { p: 'lm_kick', d: 0.22, dx: 18, hit: 2, launch: true, badge: '奔雷破空' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.42, lab: '奔雷蓄力' },
      { p: 'lm_jab', d: 0.3, dx: 36, hit: 3, launch: true, badge: '💥 破防重击' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'lm_kick', d: 0.26, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.1, lab: 'Q · 雷闪' },
      { p: 'lm_jab', d: 0.34, dx: 52, hit: 2, fx: 'thunderfist', badge: '⚡ 触电麻痹' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_boxer', d: 0.12, lab: 'R · 金刚雷铠' },
      { p: 'ts_slam', d: 0.38, dx: 15, fx: 'stomp', hit: 2, launch: true, badge: '⚡ 引雷反震' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'lm_kick', d: 0.22, lab: 'E · 雷霆万钧' },
      { p: 'lm_boxer', d: 0.25, fx: 'thunder', hit: 3, launch: true, badge: '⚡ 雷帝灌顶' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.3, dx: -30 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  lingshuang: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'sp_l1s', d: 0.08, lab: '一线枪芒' }, { p: 'sp_l1a', d: 0.12, dx: 14, hit: 1 },
      { p: 'sp_l2s', d: 0.08 }, { p: 'sp_l2a', d: 0.12, dx: 14, hit: 1 },
      { p: 'ls_stance', d: 0.08 }, { p: 'ls_thrust', d: 0.22, dx: 22, hit: 2, launch: true, badge: '枪芒贯穿' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.44, lab: '穿杨蓄力' },
      { p: 'ls_thrust', d: 0.32, dx: 42, hit: 3, launch: true, badge: '💥 远距破防' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.18, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'ls_plant', d: 0.28, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.22, dx: -24, lab: 'Q · 回马枪' },
      { p: 'ls_thrust', d: 0.35, dx: 38, hit: 2, fx: 'backthrust', launch: true, badge: '枪尖穿心' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.12, lab: 'R · 枪旋' },
      { p: 'ls_plant', d: 0.16, fx: 'spin', hit: 1 },
      { p: 'ls_thrust', d: 0.26, dx: 22, hit: 2, launch: true, badge: '乾坤回旋' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'ls_stance', d: 0.25, lab: 'E · 刹那' },
      { p: 'ls_thrust', d: 0.4, dx: 60, hit: 3, fx: 'timestop', launch: true, badge: '❄️ 寒芒贯日' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.32, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  moyu: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.09, lab: '挥毫泼墨' }, { p: 'my_paint', d: 0.13, dx: 12, hit: 1 },
      { p: 'l2s', d: 0.08 }, { p: 'my_paint', d: 0.14, dx: 14, hit: 1 },
      { p: 'my_stroke', d: 0.09 }, { p: 'lda', d: 0.22, dx: 16, hit: 2, launch: true, badge: '墨染宣纸' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.42, lab: '万钧蓄力' },
      { p: 'my_paint', d: 0.32, dx: 32, hit: 3, launch: true, badge: '💥 破防顿笔' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'a2a', d: 0.26, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.18, lab: 'Q · 墨阵' },
      { p: 'my_paint', d: 0.36, fx: 'inktrap', hit: 1, badge: '深墨禁锢' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.14, lab: 'R · 画符' },
      { p: 'my_paint', d: 0.38, fx: 'inkblob', hit: 1, launch: true, badge: '墨迹遮目' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'my_stroke', d: 0.2, lab: 'E · 符阵' },
      { p: 'my_paint', d: 0.48, fx: 'inkdragon', hit: 3, launch: true, badge: '📜 符爆' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.32, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  yuehua: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1a', d: 0.1, dx: 10, hit: 1 }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
      { p: 'lca', d: 0.1, dx: 10, hit: 1 },
      { p: 'hva', d: 0.24, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.4, lab: '明月蓄力' },
      { p: 'hva', d: 0.3, dx: 32, hit: 3, launch: true, badge: '💥 双刀破防' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.16, lab: '空中' },
      { p: 'a1a', d: 0.16, hit: 1 },
      { p: 'a2a', d: 0.26, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yh_mirror', d: 0.24, fx: 'mirror', lab: 'Q · 月镜' },
      { p: 'hva', d: 0.32, dx: 26, hit: 3, launch: true, badge: '🌙 太阴绝罚' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yh_mirror', d: 0.12, lab: 'R · 月轮' },
      { p: 'l2a', d: 0.45, fx: 'moonring', hit: 2, launch: true, badge: '🌙 背袭破防' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yh_lotus', d: 0.5, fx: 'moonflow', hit: 1, lab: 'E · 月华如水', badge: '🌙 月魄霸体' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '右键 · 腾空闪' },
      { p: 'bdash', d: 0.3, dx: -35 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  },
  yanling: {
    light: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'l1a', d: 0.1, dx: 10, hit: 1 }, { p: 'l2a', d: 0.1, dx: 10, hit: 1 },
      { p: 'a1a', d: 0.22, dx: 16, hit: 2, launch: true },
      { p: 'idle', d: 0.35, reset: true }
    ],
    charge: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'charge', d: 0.4, lab: '破云蓄力' },
      { p: 'yl_dive', d: 0.3, dx: 36, hit: 3, launch: true, badge: '💥 破云重扑' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    air: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'jump', d: 0.15, lab: '展翼空战' },
      { p: 'yl_wings', d: 0.18 },
      { p: 'a1a', d: 0.24, hit: 2 },
      { p: 'idle', d: 0.35, reset: true }
    ],
    skill: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.14, lab: 'Q · 俯冲' },
      { p: 'yl_dive', d: 0.36, dx: 48, hit: 2, fx: 'dive', badge: '鹰击钉地' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ranged: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.12, lab: 'R · 翎羽' },
      { p: 'a1a', d: 0.35, fx: 'feather', hit: 1, badge: '极速穿透' },
      { p: 'idle', d: 0.35, reset: true }
    ],
    ult: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.2, lab: 'E · 万羽' },
      { p: 'a1a', d: 0.5, fx: 'featherstorm', hit: 3, launch: true, badge: '🪶 凌霄破虚' },
      { p: 'victory', d: 0.55, reset: true }
    ],
    esc: [
      { p: 'idle', d: 0.1, reset: true },
      { p: 'yl_wings', d: 0.28, dx: -38 },
      { p: 'idle', d: 0.35, reset: true }
    ]
  }
};

// Card replays follow the phase order and timings in src/game/02-combat/04-ults/.
// Shortened only where needed to fit the miniature loop; repeat hits stay
// separate so the target reacts to the actual rhythm of each ultimate.
