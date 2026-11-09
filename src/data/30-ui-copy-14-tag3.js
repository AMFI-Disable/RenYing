// 英文界面词条 · 3v3 车轮战：{ 中文原文: 英文译文 }，由 src/i18n.js 查表。
// 规则：键必须和源码里的中文一字不差（改了中文要同步改这里，否则那句会退回中文）；同一个键只写一次，
// 后写的会悄悄盖掉先写的（tools/checks/data-check.mjs 会查重、查过期）。
Object.assign(UI_COPY_EN, {
  // 对战页的 3v3 卡（src/page.html 的 #tagPortal，规则名在 src/game/24-account-02-lobby.js 的 ROOM_RULE_NAMES）
  "3V3 RELAY": "3V3 RELAY",
  "两边各禁 1 名侠客，再轮流各选 3 人；输掉一回合就换下一位上场，三人都倒下的一方输。": "Each side bans 1 hero, then both take turns picking 3. Lose a round and your next hero steps in; the side whose three all fall loses.",
  "全服随机对手 · 不影响段位": "Random opponent from anywhere · Rank unaffected",
  "好友约战": "Friend Room",
  "FRIEND ROOM": "FRIEND ROOM",
  "段位与分数保存在账号里": "Your rank and points are saved to your account",
  "建房": "Create Room",
  "加入": "Join",
  "输入房号，例如 K7PQ": "Room code, e.g. K7PQ",
  "好友的房间号": "Your friend's room code",
  "更多规则 ·": "More rules ·",
  "好友房规则": "Friend room rules",
  "2v2 · 两人打两电脑": "2v2 · Two players vs two AI",
  "2v2 · 两人对两人": "2v2 · Two vs two players",
  "联机打魔首": "Online Boss Raid",
  "建房前选好；进了房间以后房主还能改，对面会跟着变。2v2 的全服匹配和同一台电脑对战在「开始演武」的 2v2 组队里。": "Pick before you create the room; inside the room the host can still change it and the other side follows. 2v2 matchmaking and same-computer 2v2 are under 2v2 Team in Play.",

  "快速车轮 · 自选三将": "Quick Relay · Choose Three",
  "撤销上一名": "Undo Last Pick",
  "交换先锋与中坚": "Swap First Two",
  "快速车轮免禁选，电脑自动选将，双方使用推荐密卷；完整点将保留禁选与密卷选择。": "Quick Relay skips bans, chooses the opposing team automatically, and equips recommended scrolls for both sides. Full draft keeps bans and scroll selection.",
});
