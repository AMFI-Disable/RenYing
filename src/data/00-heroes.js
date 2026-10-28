// ======================= 侠客数据表 =======================
// 每位侠客一个文件：src/data/heroes/NN-<id>.js，NN 是选人界面和 CHARS 里的顺序（00 青锋 … 12 凌雀）。
// 改一位侠客的数值、属性、招式或故事，只改他自己那个文件；游戏里的 CHARS、BAL、HERO_FOREST_STORIES、SAGA 都是从这里拼出来的。
// 加一位侠客：新建一个文件（编号接着往后排），再在 src/game/ 里补上他的技能、大招、皮肤和动作。
// 构建时 tools/data-check.mjs 会按下面的写法逐项检查（少字段、多了不认识的字段、编号重复、引用不存在都会让构建失败）。
//
// defHero({ id, skin, en, bal, char, forest, saga })
//   id      英文编号，存档、皮肤、对手都用它，定了就别改
//   skin    皮肤编号的前缀：这位侠客的皮肤都叫 <skin>_xxx（和 src/armory-core.js 的 PREFIX 对得上）
//   en      英文名
//   bal     强度：伤害（普攻 normal、技能 skill、大招 ult）、冷却 cd、气血 hp 的倍率。
//           2026-10-27 按 tools/trainer.mjs 方案 B 调过：天道、劲敌两档各打一遍，先改 7 项技能冷却和墨团瞄准，再按胜率迭代倍率（伤害和气血乘同一个数）。
//           调之前各侠客平均胜率 24%~83%，换一组随机种子复核 44%~54%。详见 docs/trainer/plan.md。
//   char    基础设定（就是 CHARS 里的一项，id 自动补上）：
//           name 名字，role 称号，diff 上手难度，escCD 腾空闪冷却，skill 是 Q 技能，skill2 是右键招式，ult 是 E 大招，passive 是被动。
//           stat：hp 生命，walk 移速倍率，speed 出招时间倍率（越小越快），dmg 伤害倍率，reach 攻击距离倍率，其余是体量和架势。
//           moveMods 改这位侠客的普攻招式（前摇、判定、后摇、连段，字段见 src/data/01-moves.js），cancel 改取消规则（只写要改的项），
//           look 画法和配色，ai.range 电脑喜欢站的距离。beats/weakTo 只是给玩家看的克制关系说明。
//   forest  斩妖列传（打小怪剧情）：title、place、synopsis、stageNames 五关名字、waveDialogues 四波台词、bossIntro 魔首登场
//           （hero、heroName 自动从 id 和 char.name 补上）
//   saga    侠客列传（引擎在 src/game/22-saga.js）。每条路 5 节：前四节按顺序打，第 3 节打完要做一个抉择（记成 flag），
//           第 5 节的对话、对手和结局跟着这个抉择走。
//           一节：place 地点、name 标题、pre 开打前的对话、fight 这一战、post 打赢后的对话、choice 抉择（只有一节有）。
//             对话一行是 [说话的人, 话]，说话的人写 '' 是旁白。
//             fight：foe 对手、lv 电脑难度、goal 胜利条件（ko 打倒对手 / survive 撑到时间结束 / fast 时限内打倒）、time 秒数、
//                    hp 开局自己剩几成血、foeHp 对手血量倍数、mySc 自己身上的秘卷、foeSc 对手身上的秘卷（都是 22-scrolls.js 里的编号）。
//             第 5 节的 pre / fight / post 可以写成 { 抉择的 flag: 内容 }，end 是两个结局。
//
// 故事的统一模板（tools/data-check.mjs 逐项检查，名字一律用 char.name，不用别称）：
//   forest.title、saga.title  「名字传 · 两到八个字」，比如「青锋传 · 竹海断剑」
//   forest.synopsis           一两句交代起因，里面要出现名字，以句号或叹号结尾
//   forest.stageNames         五关，每关四个字，不重复
//   forest.waveDialogues      四句，forest.bossIntro 一句，都写成「名字：「台词」」
//   saga.motive               一句话的起因，以句号结尾
//   saga.nodes                五节，节标题不重复；前四节的 pre 第一行是旁白（先交代场景）；
//                             抉择放在第 2 或第 3 节；第 5 节的两个结局标题不一样
const HEROES = [];
function defHero(h) {
  h.char = { id: h.id, ...h.char, cancel: { ...CANCEL, ...(h.char && h.char.cancel) } };   // 取消规则：通用的 CANCEL（src/data/01-moves.js）加上这位侠客自己改的
  h.forest = { hero: h.id, heroName: h.char.name, ...h.forest };
  HEROES.push(h);
}
