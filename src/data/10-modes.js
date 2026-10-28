// ======================= 模式表 =======================
// 点将台和对局按这里的设定走，加一个模式先在这里加一行。点将台的顺序在 src/data/11-bp-orders.js。
//
// MODES：本机打开点将台时的模式（bpStart 的第一个参数）
//   bp      用 BP_ORDERS 里哪个顺序；squadBp 按同袍人数换顺序（{ 人数: 顺序 }，没写的人数用 bp）
//   team    每边选好几个人（picks 是 [[…], […]]），不写就是每边一个人
//   local   本机自己推进每一步（不等联机对面）
//   sides   两边固定的名字；us 你这一边的名字（不写是「你」）；foe 对面的名字（不写就用联机对手的名字或「对手」）
// ROOM_MODES：联机房间的规则（netRoomMode），点将台的写法同上，另外：
//   slots   [房主控制的侠客, 加入的人控制的侠客]，编号 0 A、1 B、2 C、3 D；其余侠客由电脑控制
//   four    场上四个人（2v2）；raid 同袍肉鸽；rule 'chaos' 天机乱斗 / 'mayhem' 神决的随机词条
const MODES = {
  cpu: { bp: 'duel', local: true, foe: '电脑' },
  cpuWatch: { bp: 'duel', local: true, sides: ['苍龙 (AI)', '赤凤 (AI)'] },
  chaos: { bp: 'open', local: true, foe: '电脑' },
  mayhem: { bp: 'open', local: true, foe: '电脑' },
  tag3: { bp: 'trio', team: true, local: true, foe: '敌方战队' },
  tower: { bp: 'solo', local: true },
  stage: { bp: 'solo', local: true },
  train: { bp: 'solo', local: true },
  world: { bp: 'solo', local: true },
  raid: { bp: 'squad3', squadBp: { 2: 'squad2' }, team: true, local: true, sides: ['同袍义军', '融魂魔首'] },
  '2v2': { bp: 'duo', team: true, local: true, us: '我方战队', foe: '敌方战队' },
};
const MODE_DEFAULT = { bp: 'duel' };   // 不在表里的模式

const ROOM_MODES = {
  normal: { bp: 'trioSnake', team: true, slots: [[0], [1]] },
  chaos: { bp: 'open', slots: [[0], [1]], rule: 'chaos' },
  mayhem: { bp: 'open', slots: [[0], [1]], rule: 'mayhem' },
  pp_cc: { bp: 'duo', team: true, us: '我方战队', slots: [[0], [2]], four: true },
  pp_pp: { bp: 'duo', team: true, us: '我方战队', slots: [[0, 2], [1, 3]], four: true },
  raid: { bp: 'duo', team: true, us: '我方战队', slots: [[0], [1]], raid: true },
};
