// ======================= 侠客列传：每位侠客自己的一条路（剧情数据） =======================
// 引擎在 22-saga.js；故事写在 src/data/heroes/ 里每位侠客自己的文件（saga 一项，写法见 src/data/00-heroes.js）。
const SAGA = Object.fromEntries(HEROES.map(x => [x.id, x.saga]));
