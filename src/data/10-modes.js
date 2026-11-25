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
//   four    场上四个人（2v2）；raid 同袍肉鸽（三人打魔首 B）；rule 'chaos' 天机乱斗 / 'mayhem' 神决的随机词条 / 'maps' 山河异境的地图
// 找 bug 提示：某个模式开局不对，先查这里的设定，再查 src/game/08-fighter-match.js 的 startMatch 怎么读它。
const MODES = {
  cpu: { bp: 'duel', local: true, foe: '电脑' },
  cpuWatch: { bp: 'duel', local: true, sides: ['苍龙 (AI)', '赤凤 (AI)'] },
  chaos: { bp: 'open', local: true, foe: '电脑' },
  mayhem: { bp: 'open', local: true, foe: '电脑' },
  maps: { bp: 'open', local: true, foe: '电脑' },   // 山河异境：投票选地图（src/data/12-maps.js）
  cuju: { bp: 'open', local: true, foe: '电脑' },   // 墨球蹴鞠：把墨球打进对方球门（src/game/04-modes/22-modes-09-cuju.js）
  cuju2v2: { bp: 'duo', team: true, local: true, us: '我方战队', foe: '敌方战队' },   // 2v2 墨球蹴鞠
  koth: { bp: 'open', local: true, foe: '电脑' },   // 灵坛争锋：占领灵坛 + 无限复活
  koth2v2: { bp: 'duo', team: true, local: true, us: '我方战队', foe: '敌方战队' },   // 2v2 灵坛争锋
  party: { bp: 'open', local: true, foe: '电脑' },   // 江湖百戏：轮换趣味小游戏
  bastion: { bp: 'open', local: true, foe: '电脑' },   // 天枢城·守境：多人守城+肉鸽+灵侍+流派装备
  melee: { bp: 'large5', squadBp: { 3: 'large3', 5: 'large5', 8: 'large8', 16: 'large16' }, team: true, local: true, us: '我方大军', foe: '敌方大军' },   // 群雄会战：3v3 ~ 16v16 同屏大混战（完整禁选）
  ctf: { bp: 'large5', squadBp: { 2: 'large2', 3: 'large3', 5: 'large5', 8: 'large8' }, team: true, local: true, us: '我方战队', foe: '敌方战队' },   // 夺旗争锋：2v2 ~ 8v8 团队夺旗（完整禁选）
  quad: { bp: 'solo', local: true },   // 四象争锋：4v4v4v4 四方混战（只选自己的侠客，另外三方和队友由电脑补齐）
  gauntlet: { bp: 'solo', local: true },   // 无尽试炼：逐波递增车轮生存战
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
  maps: { bp: 'open', slots: [[0], [1]], rule: 'maps' },   // 山河异境：两边各投一票选地图
  cuju: { bp: 'open', slots: [[0], [1]], rule: 'cuju' },   // 墨球蹴鞠：好友房联机踢球
  koth: { bp: 'open', slots: [[0], [1]], rule: 'koth' },   // 灵坛争锋：好友房抢坛
  party: { bp: 'open', slots: [[0], [1]], rule: 'party' },   // 江湖百戏：好友房趣味百戏
  bastion: { bp: 'open', slots: [[0], [1]], rule: 'bastion' },   // 天枢守境：随时加入传音守城与远征
  melee: { bp: 'open', slots: [[0], [1]], rule: 'melee', teamSize: 8 },   // 群雄会战：联机大型团战（支持至 16v16 = 32 人）
  ctf: { bp: 'open', slots: [[0], [1]], rule: 'ctf', teamSize: 8 },   // 夺旗争锋：联机团队夺旗
  quad: { bp: 'open', slots: [[0], [1]], rule: 'quad', teamSize: 4 },   // 四象争锋：联机四方混战（支持至 8v8v8v8 = 32 人）
  pp_cc: { bp: 'duo', team: true, us: '我方战队', slots: [[0], [2]], four: true },
  pp_pp: { bp: 'duo', team: true, us: '我方战队', slots: [[0, 2], [1, 3]], four: true },
  raid: { bp: 'squadNet', team: true, us: '我方战队', slots: [[0], [2]], raid: true },   // 房主 A、好友 C、电脑同袍 D 一起打魔首 B
};
