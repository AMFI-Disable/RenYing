// 英文界面词条 · 山河异境的地图投票：{ 中文原文: 英文译文 }，由 src/i18n.js 查表。
// 规则：键必须和源码里的中文一字不差（改了中文要同步改这里，否则那句会退回中文）；同一个键只写一次，
// 后写的会悄悄盖掉先写的（tools/checks/data-check.mjs 会查重、查过期）。
Object.assign(UI_COPY_EN, {
  // 山河异境：投票选地图（src/data/12-maps.js、src/game/22-modes-04-maps.js 的 renderMaps、联机房间的地图投票）
  "山河异境": "Terrain Clash",
  "山河异境 · 投票选地图": "Terrain Clash · Vote for the Map",
  "特殊地形 · 不计排位": "Special terrain · Unranked",
  "换一处战场比试：每张图的地形会改变侠客的走位和招式。开打前投一票，每张图被选中的概率按票数算，没人投票时每张图机会一样。": "Fight somewhere new: each map's terrain changes how heroes move and use their skills. Cast a vote before the match; each map's chance is its share of the votes, and with no votes every map is equally likely.",
  "投出你的一票（再按一次收回）": "Cast your vote (press again to take it back)",
  "电脑境界": "AI Tier",

});
