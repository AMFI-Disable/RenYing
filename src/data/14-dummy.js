// ======================= 木人试剑：稻草人的对手行为 =======================
// 木人桩里点「对手行为」（键盘 Tab，触屏左上角）打开的那一栏：稻草人做什么、做一次还是一直做、多久做一次、几项特性。
// 动作的具体做法在 src/game/07-ai-story.js 的 DummyCtrl（DUMMY_JOBS）；栏在 src/game/21-buttons.js。随机用对局随机数 grnd，不用 Math.random。
//   DUMMY_ACTS   动作：id、n 名字、d 一句说明、k 种类
//                k: 'hold' 一直保持（站桩、走动、格挡），'react' 看时机反应（招架、受击反击、起身攻击），'do' 每隔一段时间做一次
//   DUMMY_GAPS   「do」类动作两次之间隔几秒
//   DUMMY_FEATURES  可以和动作一起开的特性（都能单独开关）
const DUMMY_ACTS = [
  { id: 'stand', n: '站桩', d: '站着不动，任你打', k: 'hold' },
  { id: 'walk', n: '来回走动', d: '在原地附近左右走', k: 'hold' },
  { id: 'light', n: '近身普攻', d: '走到你身边砍一刀', k: 'do' },
  { id: 'ranged', n: '远程攻击', d: '放一发飞行道具', k: 'do' },
  { id: 'block', n: '一直格挡', d: '全程举刀防御', k: 'hold' },
  { id: 'parry', n: '精准招架', d: '你的招打到前一刻才格挡', k: 'react' },
  { id: 'jump', n: '跳', d: '原地跳一下', k: 'do' },
  { id: 'djump', n: '二段跳', d: '跳起来在空中再跳一次', k: 'do' },
  { id: 'dash', n: '冲刺闪避', d: '腾空闪往后撤开', k: 'do' },
  { id: 'skill', n: '技能 Q', d: '放第一个技能', k: 'do' },
  { id: 'skill2', n: '技能 R', d: '放第二个技能', k: 'do' },
  { id: 'ult', n: '大招 E', d: '直接放大招（真元自动补满）', k: 'do' },
  { id: 'combo', n: '连招', d: '贴身打满五段，再接技能', k: 'do' },
  { id: 'counter', n: '受击反击', d: '挨打或被格挡后马上还手', k: 'react' },
  { id: 'wakeup', n: '起身攻击', d: '倒地起身时立刻出刀', k: 'react' },
  { id: 'random', n: '随机', d: '每次从会出手的动作里抽一个', k: 'do' },
];
const DUMMY_GAPS = [0.5, 1, 2, 3];
const DUMMY_FEATURES = {
  fixed: { name: '钉在原地', desc: '不被击飞、不被打退' },
  escape: { name: '被连便闪', desc: '被挑空或连中 4 下就腾空闪' },
  infGuard: { name: '坚若磐石', desc: '架势恒满，不会破防' },
  autoHeal: { name: '连段自愈', desc: '连击停下后血量回满' },
};
