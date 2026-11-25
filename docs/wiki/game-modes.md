# Game Modes / 游戏模式

"Server" means the mode needs the online edition and the game's Worker; "account" means you must be signed in to a cloud account. Everything else works for guests and, unless noted, in the offline edition too.

「服务器」表示要用在线版并连上游戏的 Worker；「账号」表示要登录云端账号。其余模式游客也能玩，没特别说明的离线版也有。

## Fighting The Computer / 对战电脑

| Mode | How it plays | Needs |
| :--- | :--- | :--- |
| **演武 · Play vs AI** | One-on-one against the computer. Pick the arena, a rule set and an AI level. | — |
| **天机乱斗 · Chaos** | A new random mutation hits the arena every 15 seconds. | — |
| **通天神决 · Mayhem** | Ten times the meter, no cooldowns, doubled skill power for both sides. | — |
| **山河异境 · Terrain Clash** | Six maps: 断崖台, 寒潭冰面, 竹海悬岩 (gale), 雷泽石坛 (lightning altar), 皇城飞檐 (three tiers of eaves), 醉翁墨阁 (wine mist restores guard). The map is drawn by vote; each map gives two home-ground heroes a small bonus. | — |
| **墨球蹴鞠 · Ink Ball** | A goal at each end and an ink ball in the middle. Attacks and skills knock the ball; first to three goals wins, and a tie at 150 seconds goes to a golden goal. Hits still knock heroes around but nobody loses health. Blocking saves a shot, holding ↓ while attacking keeps the ball low, 勾陈's hammer hooks the ball back and 磁仙 pulls it in on the negative pole. Play the AI, two players on one computer (1P keyboard and mouse, 2P arrow keys + K), or watch two AIs. 场地两边各一个球门，用普攻和技能把墨球打进对方球门，先进三球获胜，不比气血。 | — |
| **3v3 车轮战 · Relay** | Three heroes a side (先锋, 中坚, 大将), snake draft. The loser of a round swaps in the next hero; the winner keeps their remaining health plus a small heal. | — |
| **2v2** | Two players against two AIs or against two players. **即刻开战 / Fight Now** starts at once with random heroes. If your partner falls you get 孤军奋战 (Last Stand): full meter, a short power-up and some health back. | Online variants: server |

### AI Levels / 电脑难度

| Level | Name | Notes |
| :--- | :--- | :--- |
| 1 | 入门 Easy | Slow reactions, good for learning |
| 2 | 寻常 Normal | |
| 3 | 劲敌 Hard | |
| 4 | 宿敌 Adaptive | Adjusts to how you play |
| 5 | 绝顶 Impossible | |
| 6 | 天道 Transcendent | The strongest; driven by a trained model |

## Large Team Battles / 大型团战

### 群雄会战 · Grand Melee (3v3–16v16)

Three to sixteen heroes a side fight on one screen, up to 32 fighters in all. Choose 3v3, 5v5, 8v8 or 16v16, then take the draft: you ban and pick your own hero and the AI fills the other slots at speed.

三人一队到十六人一队同屏混战，最多 32 人。选 3v3 / 5v5 / 8v8 / 16v16 后进点将台：自己禁人、选本命侠客，其余位置由 AI 快速补齐。

| Scale | Arena |
| :--- | :--- |
| 3v3 | 2,600 px open ground |
| 5v5 | 2,800 px, three levels (演武楼阁) linked by four staircases |
| 8v8 | 3,600 px, five levels |
| 16v16 | 6,400 px battlefield |

- Each team starts with **three tickets per hero** (size × 3, shown as 兵力). Every knockout costs one ticket and brings you back after 3.2 seconds.
- The match ends when one team's tickets reach zero, or when the **3-minute** timer runs out. The team with more tickets wins; equal tickets are a draw.
- Each team has a commander with `1` / `2` / `3` tactics and teammate tasks. See [Commander And Tactics](commander-and-tactics.md).
- The mouse wheel zooms the camera (middle click resets it). The HUD adds a minimap and every team's health.
- 16v16 needs more picks than the current roster has heroes, so the two teams may pick the same hero; smaller scales keep every hero unique.

每队初始兵力是「人数 × 3」。每倒下一次扣一点，3.2 秒后在己方阵地复活；一方兵力归零或 3 分钟到时比赛结束，兵力多的一方获胜，相同为平手。每队一名统帅，按 `1`/`2`/`3` 下令，用法见 [指挥与战术](commander-and-tactics.md)。滚轮缩放镜头、中键复位，顶部有小地图和各队血条。16v16 要选的人数超过当前侠客总数，双方可以选到同一名侠客；小规模仍然一人一份。

### 四象争锋 · Quad Clash (4v4v4v4)

Four teams of four — 苍龙 Azure Dragon, 朱雀 Vermilion Bird, 玄武 Black Tortoise and 白虎 White Tiger — fight at the same time on the five-level 3,600 px arena. You pick only your own hero; your three teammates and the other three teams are AI.

苍龙、朱雀、玄武、白虎四队各四人在五层立体战场上同时开打。你只选自己的侠客，三名队友和三支敌队都是电脑。

- Each team spawns on one of four points: ground left, ground right, top left, top right. Which team gets which point is shuffled every match.
- **Three tickets per hero.** A knockout costs one ticket; respawning takes 3.2 seconds.
- A team is eliminated when its tickets are gone and none of its members is alive.
- The last team standing wins. If the **3½-minute** timer runs out first, teams rank by tickets and then by total remaining health.
- If your team is eliminated the match ends and shows your place out of four. There is no Ink payout, only the ranking.
- Every team has a commander, and the enemy orders stay hidden.

四个出生点（地面左、地面右、顶层左、顶层右）每局随机分配。每队兵力为「人数 × 3」，倒下一次扣一点，3.2 秒后复活；兵力清零且无人存活时覆灭。最后一支站着的队伍夺魁；3 分 30 秒到时按兵力、再按剩余总气血排名。我方覆灭即结束并显示四队名次，只排名次、不发墨锭。每队都有统帅，敌方战术不可见。

## Single-Player Content / 单人内容

| Mode | How it plays |
| :--- | :--- |
| **守关挑战 · Stages** | Chapters of five stages; each stage gives up to three stars and Ink. |
| **侠客列传 · Hero Chronicles** | A five-part story for every hero. One choice in part 2 or 3 decides the final fight and which of two endings you get. |
| **问剑密卷 · Sword Pagoda** | Climb a tower and pick scrolls (秘卷) between floors to build your run. |
| **训练场 · Training Grounds** | Move lessons, a configurable dummy, AI sparring with standard stats, six scenario drills and every AI exhibition. See [Training Grounds](training-grounds.md). |
| **新手教学 · Tutorial** | Teaches the basics step by step on a straw dummy, including the perfect parry. |

## Co-op And Server Modes / 合作与全服模式

| Mode | How it plays | Needs |
| :--- | :--- | :--- |
| **同袍肉鸽 · 斩妖列传 (Co-op Roguelike)** | Each hero's monster-fighting story: five stages of waves and a boss, picking shared scrolls along the way. Solo or with friends. | Online co-op: server |
| **同袍肉鸽 · 众志破魔 (Co-op Raid)** | 2 to 3 players share scrolls and healing against the 融魂魔首, a boss with six skills taken from three heroes. Local, matchmaking or a private room. | Online: server |
| **江湖共斗 · Open World** | One shared 24,000 px map in eight zones (竹林, 古道, 山寨, 魔窟, 荒村, 寒渊, 绝峰, 祭坛), harder further in. Join or leave any time, up to 40 players per line, a world boss (妖王) and the server-wide story 江湖长卷 (51 chapters). `T` opens 神行千里 to teleport to allies or shrines. | Server; rewards need an account |
| **天魔讨伐 · Demon Raid** | A server-wide boss. Draft ten scrolls before each fight, choosing from three options each time; a hero-curated Heavenly Favor is highlighted. | Server |

## Online / 联机

| Mode | How it plays | Needs |
| :--- | :--- | :--- |
| **快速匹配 · Quick Match** | 3v3 relay against a random opponent. | Server |
| **排位赛 · Ranked** | 3v3 relay with a ladder rank; placement takes 3 matches. | Server + account |
| **好友约战 · Friend Room** | Room code, direct peer-to-peer. The host can switch rules (2v2, raid, Chaos, Mayhem, Terrain Clash) from **更多规则 / More Rules**. | Online edition |

## Watching And Replays / 观战与回放

- **AI exhibitions:** every computer-vs-computer match is under 习武 → 训练场 → AI 观战: 1v1, 2v2, 3v3 relay, Chaos, Ink Ball, Terrain Clash and Mayhem. See [Training Grounds](training-grounds.md).
- **Replays:** matches can be saved, exported as a file and imported again (对战回放 · 导入回放).

## 青锋行 · Qingfengxing

A separate 3D action game made with three.js, opened from the home screen. Play alone, or 2 to 4 players in co-op over a 4-digit room code: shared route map, more enemies per player, and allies revive each other by standing close. Included in the offline edition.

青锋行是独立的 3D 动作小游戏，可以单人，也可以 2 到 4 人用四位房间号联机：共用路线图，人越多怪越多，倒下的队友站在旁边就能扶起来。离线版里也有。
