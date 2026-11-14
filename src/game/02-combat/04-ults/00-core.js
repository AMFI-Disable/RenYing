// ======================= 大招（E） =======================
// 本文件：每位侠客的大招（ULTS 表，一招一项，每项前面标了是谁的）。
// 两种写法：flurry 连斩型（n 刀、每刀间隔 iv、最后一刀 fin）由 09-actions.js 的 specialUpdate 统一处理；
//          其他的自己写 start / update / pose。大招开始时有一段定格（superFreeze），这段时间不算进招式时间。
// 找 bug 提示：大招打不中先看 update 里的判定框；大招之后动不了，看 endSpecial 有没有被调到。
// flurry 类型沿用“冲刺后乱斩”的流程，其它类型用 begin / update 自己写
const ULTS = {};

