# Commander And Tactics / 指挥与战术

Team modes with more than two fighters a side give each side a commander (统帅): 群雄会战 Grand Melee from 3v3 up, 四象争锋 Quad Clash, and 夺旗争锋 CTF from 3v3 up. The commander chooses the team tactic, hands out tasks to AI teammates and can lock a focus target. This is the game's command system (指挥系统). 2v2 and 同袍肉鸽 use the same panel without a commander body.

三人以上的团战（群雄会战、四象争锋、夺旗争锋）每边有一名统帅：定战术、给 AI 队友分任务、指定集火目标，这就是团战的「指挥系统」。2v2 和同袍肉鸽也用这块面板，但没有统帅本体。

## The Commander / 统帅

- One human on your team is chosen at random when the match starts. If the team has no human, a random AI carries the flag. / 开局在本队真人里随机抽一名统帅；全电脑队就随机一名电脑。
- The commander has **35% more health** and a 帅 flag above their head. The enemy commander is visible too. / 统帅气血 **+35%**，头顶「帅」字旗；敌方统帅也看得见。
- When the commander goes down the tactic pauses: the team loses its counter bonus and the AI teammates fall back to their normal behavior until the commander is back. Respawning restores the extra health. / 统帅倒下时战术暂停：没有相克加成，队友回到默认打法，直到统帅复活；复活时补回额外气血。
- You can see who the enemy commander is, never which tactic they are using. / 只看得到敌方统帅是谁，看不到对方在用哪种战术。

## Tactics / 战术

Press `1`, `2` or `3` to order a tactic. Orders can be given during the intro, before the first hit.

按 `1`/`2`/`3` 下令，开场入场阶段就能下。

| Key | Tactic | Behavior | Beats |
| :--- | :--- | :--- | :--- |
| `1` | **锋矢 Spearhead** | 集火突击: the whole team converges on one target | 铁壁 Ironwall |
| `2` | **铁壁 Ironwall** | 抱团固守: hold together around the commander, guard, then hit back | 游袭 Raiders |
| `3` | **游袭 Raiders** | 分散缠斗: spread wide, pick off isolated fighters, disengage after a hit | 锋矢 Spearhead |

The counter cycle is 锋矢 > 铁壁 > 游袭 > 锋矢. The bottom-left panel shows the commander's current order and this cycle.

相克关系为「锋矢 > 铁壁 > 游袭 > 锋矢」，左下角指挥牌会显示当前战术与相克提示。

### Counter Damage / 相克加成

| Situation | Effect |
| :--- | :--- |
| Your tactic beats the enemy's | **+18%** damage dealt |
| The enemy's beats yours | **−12%** damage dealt |
| No active tactic (commander down) | no counter modifier |

Each tactic also has a small trait that stacks with the counter: 锋矢 deals **+5%** damage, 铁壁 takes **−7%**, and 游袭 moves **+6%** faster.

每种战术还带一点小加成，和相克叠加：锋矢伤害 +5%，铁壁受伤 −7%，游袭移速 +6%。

### Reading The Enemy / 判断敌方战术

The enemy order is hidden, so read their formation instead: several fighters on one target look like 锋矢, a tight group looks like 铁壁, and a wide spread looks like 游袭. AI commanders probe the other teams the same way every 11–18 seconds, switch to the counter, and read formations more accurately at higher AI levels. A commander who is already winning often keeps the current order.

看不到对方战术就看站位：围着一个人打像锋矢，抱团像铁壁，拉得很开像游袭。电脑统帅每 11–18 秒看一次对面的站位并换克制战术，难度越高判断越准；占上风时往往不换。

## Command Panel / 指挥面板

`Tab` opens and closes the team command panel during a match. It has buttons for everything below, works with mouse, keyboard and touch, and can be dragged by its title bar.

对局中按 `Tab` 打开或关闭指挥面板；下面所有操作都能在面板里点，鼠标、键盘、触屏都行，拖标题栏可以移动。

| Section | What you can do |
| :--- | :--- |
| 战队战术 Tactic | Pick 锋矢 / 铁壁 / 游袭 |
| 阵型与集结 Formation | 自由阵型 Auto, 抱团集结 Group, 护卫统帅 Escort, 分散包抄 Spread |
| 目标集火 Focus | Click an enemy, or drag an AI teammate onto an enemy |
| 队友分工 Roles | Give one teammate or the whole team 自由 / 主攻 / 牵制 / 破连 |
| 战况总览 Overview | Every team's lineup and health; drag teammates from here to a task |

### Commander Keys / 统帅按键

| Key | Action |
| :--- | :--- |
| `1` / `2` / `3` | 锋矢 / 铁壁 / 游袭 |
| `Tab` | Open or close the team command panel |
| `Y` | Select the next teammate, then back to the whole team |
| `N` | Give the selection the next task |
| `G` | Lock a target; 主攻 teammates attack the commander's locked target |

`Y` cycles 全队 → teammate 1 → teammate 2 → … → 全队. `N` cycles 自由 → 主攻 → 牵制 → 破连. Both work on the whole team or on one selected teammate.

`Y` 按「全队 → 队友1 → 队友2 → … → 全队」循环；`N` 按「自由 → 主攻 → 牵制 → 破连」循环，对全队或选中的一名队友生效。

## Teammate Tasks / 队友分工

| Task | What the AI does |
| :--- | :--- |
| 自由 Auto | Follows the current tactic |
| 主攻 Main | Attacks the commander's locked target (`G`) or whoever the commander is fighting |
| 牵制 Lure | Keeps fighters next to the main target busy so they cannot reinforce |
| 破连 Peel | Attacks enemies who are comboing a teammate and breaks the combo |

With no manual assignment each tactic sets a default split: 锋矢 sends about 70% 主攻 and 30% 破连; 游袭 sends about 35% 牵制 and leaves the rest free; 铁壁 sends about 40% 破连 and leaves the rest free. A manual task overrides the default for that teammate.

不手动分工时战术会给默认分工：锋矢约七成主攻、三成破连；游袭约三成半牵制，其余自由；铁壁约四成破连，其余自由。手动分工对该队友优先。

## Modes And Online / 适用模式与联机

- Full commander system: 群雄会战 (3v3 / 5v5 / 8v8 / 16v16), 四象争锋 (one commander for each of the four teams) and 夺旗争锋 (3v3 and larger). / 完整统帅：群雄会战、四象争锋（四队各一名）、夺旗争锋（3v3 起）。
- 2v2 and 同袍肉鸽: the `Tab` panel gives 集火 / 掩护 / 游击 orders, formations and the same four tasks, but there is no commander body, no extra health and no counter damage. / 2v2 与同袍肉鸽：`Tab` 面板有集火/掩护/游击、阵型和同样的四种分工，但没有统帅本体、额外气血和相克伤害。
- Online 群雄会战 and 夺旗争锋 run the same deterministic simulation on both clients. 四象争锋 is local play only. / 联机的群雄会战和夺旗争锋两边跑同一套确定性模拟；四象争锋只有本机模式。
