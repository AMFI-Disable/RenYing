# Mode Feature Matrix

This note lists every local and online mode, the shared systems each one uses today, and the systems each mode still needs. It is the analysis for the v1.5.0 milestone (mode transition stability and screen isolation). Every row was read from the source named in the last section, not from older docs, so check the code again before relying on a cell after a later change.

## Shared Systems

| System | What it does | Where it lives |
| :--- | :--- | :--- |
| Draft | Ban and pick on the draft screen, order set per mode | `MODES` and `ROOM_MODES` in `src/data/10-modes.js`, orders in `src/data/11-bp-orders.js` |
| AI level | One shared level bar (`pickLevel`) for modes against the computer | `src/game/05-ui/21-buttons-01-screen-controls.js` |
| Terrain map | Map vote and terrain physics (`M.map`) | `mapsOn` and `mapNow` in `src/game/02-combat/08-fighter-02-maps-arena.js` |
| Battle map | Layered arenas for large team fights | `battleMapDef` in the same file |
| Mayhem rule | Ten times meter, no cooldowns | `mayhemOn` in the same file |
| Scrolls | Run buffs (`M.towerPerks`, `M.foeScrolls`) and drafted competitive scrolls | `scOn` and `scIds` in `src/game/04-modes/22-scrolls.js` |
| Commander | Tactics, formations and teammate tasks | `teamCmdEligible` in `src/game/04-modes/22-modes-17-command.js` |
| Online room | Friend room rule for rollback netplay | `ROOM_MODES` in `src/data/10-modes.js` |
| Rematch and quit | What "again" starts and where "quit" returns to | `MODE_HANDLERS` and `toMenu` in `src/game/05-ui/22-match-flow.js` |
| Recording | Local replay and match review | `recBegin` in `src/game/02-combat/11-loop-03-replay.js` |
| Leaderboard | Public boards | `#lbTabs` in `src/pages/05-account-and-progression.html` |

## Fighting Modes

| Mode | Draft | AI level | Map | Mayhem | Scrolls | Commander | Online room | Quit returns to | Leaderboard |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 演武 Play vs AI (`cpu`) | duel | Yes | Flat | Yes | Drafted only | No | `normal` (3v3 snake draft) | Home | No (Ranked and wins count online matches) |
| 天机乱斗 Chaos (`chaos`) | open | Yes | Flat | No | Drafted only | No | `chaos` | Hall tab | No |
| 通天神决 Mayhem (`mayhem`) | open | Yes | Flat | Always | Drafted only | No | `mayhem` | Hall tab | No |
| 山河异境 Terrain Clash (`maps`) | open | Yes | Vote | Yes | Drafted only | No | `maps` | Home | No |
| 3v3 车轮战 Relay (`tag3`) | trio | Yes | Random roll | Yes | Drafted only | No | `normal` | Hall tab | 3v3 board |
| 2v2 (`2v2`, `watch2v2`) | duo | Yes | Random roll | Yes | Drafted only | When a teammate is AI | `pp_cc`, `pp_pp` | 2v2 hub | 2v2 board |
| 墨球蹴鞠 Ink Ball (`cuju`) | open or duo | Yes | Pitch | No | No | No | `cuju` (1v1 only) | Hall tab | No |
| 灵坛争锋 Altar (`koth`) | open or duo | Yes | Fixed altar map | No | No | 2v2 only | `koth` (1v1 only) | Hall tab | No |
| 江湖百戏 Party (`party`) | open | Yes | Per game | No | No | No | `party` | Hall tab | No |
| 天枢守境 Bastion (`bastion`) | open | Yes | Bastion arena | No | No | No | `bastion` | Hall tab | No |

## Large Team Modes

| Mode | Draft | Map | Mayhem | Commander | Online room | Quit returns to |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 群雄会战 Grand Melee (`melee`) | large3 to large16 | Battle map by size | Yes | Yes | `melee` | Hall tab (fixed in v1.5.0) |
| 夺旗争锋 Capture The Flag (`ctf`) | large2 to large10 | Battle map by size | Yes | Yes | `ctf` | Hall tab (fixed in v1.5.0) |
| 四象争锋 Quad Clash (`quad`) | solo | Battle map by size | No | Yes | `quad` | Hall tab (fixed in v1.5.0) |
| 无尽试炼 Gauntlet (`gauntlet`) | solo | Flat | No | No | None | Hall tab (fixed in v1.5.0) |

## Story, Run And Training Modes

| Mode | Draft | Scrolls | Online | Quit returns to | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 侠客列传 Hero Chronicles (`saga`) | None | Per chapter | No | Hall tab | No rematch handler yet, see the gaps below |
| 守关挑战 Stages (`stage`) | solo | Fresh draw per run (fixed in v1.5.0) | No | Home | Shelved in the online edition; wave stages run on the `raid` rules |
| 问剑密卷 Sword Pagoda (`tower`) | solo | Run scrolls, saved on quit | No | Hall (Chronicles tab while shelved) | Shelved in both editions |
| 同袍肉鸽 Raid (`raid`) | squad3 or squad2 | Run scrolls | `raid` | Home | Rematch reopens the scroll pick after a win |
| 天魔讨伐 Global Boss (`boss`) | None | Boss affixes | Server | Boss page | Damage is submitted on quit |
| 训练场 Training (`train`) | solo | No | No | Home | Frame inspector and status panel belong only to dummy training |
| 新手教学 Tutorial | None | No | No | Home | Uses the training dummy; training tools stay hidden (fixed in v1.5.0) |
| 开放世界 Open World (`world`) | solo | World scrolls | Server | Home | Leaves through `worldLeave` |

## What Each Mode Still Needs

These are the gaps found while building the matrix and the mode switch audit. Each one is small enough for a single issue.

1. **Quit target for every hall mode.** Training, Terrain Clash, Raid and Stages still return to the home page because they have no `toMenuScreen` handler. Training should return to the training tab it came from; Terrain Clash has no hall tab of its own, so the home page is acceptable until it gets one.
2. **One place that owns match-scoped state.** `toMenu` now clears the terrain map and run scrolls, but `M.subMode`, `M.cujuFour`, `M.kothFour`, `M.party` and `M.raidSquadSize` still survive into later matches. They are gated by `M.mode` today, so nothing breaks, but a single `resetMatchState()` that every mode start calls would stop the next leak before it happens.
3. **Online parity.** Ink Ball and Altar support 2v2 locally but only 1v1 in friend rooms. Gauntlet and the tutorial have no online form, which is fine; Ink Ball and Altar 2v2 rooms are the useful additions.
4. **Mayhem coverage.** The mayhem rule reaches the duel, terrain, relay, 2v2 and large team modes, but not Quad Clash or Gauntlet. Decide per mode whether the rule belongs there and show the toggle only where it works.
5. **Leaderboards.** Only Ranked, wins, Relay, 2v2, Global Boss and mastery have boards. Gauntlet (best wave) and Quad Clash (placements) produce scores players would compare.
6. **Rematch for Chronicles.** Chronicles has no rematch handler, so "again" after a lost chapter fight falls back to a plain duel draft. It should restart the same chapter fight.
7. **Screen isolation gate.** `tools/audits/mode-switch-audit.mjs` now runs in CI. Any new mode should add a row to its `CASES` list so its quit target and leftover overlays are checked.

## Sources

`src/data/10-modes.js`, `src/game/02-combat/08-fighter-01-entity.js`, `src/game/02-combat/08-fighter-02-maps-arena.js`, `src/game/04-modes/22-scrolls.js`, `src/game/04-modes/22-modes-17-command.js`, `src/game/05-ui/17-home-02-mode-hall.js`, `src/game/05-ui/21-buttons-01-screen-controls.js`, `src/game/05-ui/22-match-flow.js`, `src/pages/05-account-and-progression.html`.
