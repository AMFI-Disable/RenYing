# RenYing Tactics System Architecture And Multi-Million-Frame Benchmarks

## Overview

This document specifies the redesigned team tactics engine (`src/game/04-modes/22-modes-17-command/`), AI tactical integration (`src/ai/`), non-obstructive in-combat tactics drawer (`src/styles/84-page-team-command.css`, `src/pages/06-modals-and-overlays.html`), strict multi-fighter mode visibility rules, pre-match default tactic selector (`src/pages/02-mode-hall.html`), 20-hero tactical profiles, and empirical validation results from **2,385,151 simulated combat frames** across **720 headless matches** (`tools/tests/tactics-bench.mjs`).

## Mode Visibility And Pre-Match Configuration

### Strict Multi-Fighter Visibility Rules

The tactics panel (`#teamCmdPanel`), tactical HUD bars (`drawCmdPanel`, `drawSquadTacticalBar`), and tactical hotkeys (`1`, `2`, `3`, `4`, `Tab`) are restricted by `teamCmdEligible()` strictly to active multi-fighter team combat modes with human and AI teammates:

| Mode Category | Modes | Tactics Panel & HUD |
| :--- | :--- | :--- |
| Large Team Combat | `melee` (3v3–16v16), `ctf` (2v2–10v10), `quad` (2v2v2v2–8v8v8v8) | Enabled (Commander + Adaptive/Manual Tactics) |
| Co-Op Team Combat | `2v2` (`p_cc` with AI teammate) | Enabled (Squad Tactics + Adaptive `auto`) |
| Excluded Modes | `train`, `tut`, `cpu`, `pvp`, `tag3`, `stage`, `saga`, `tower`, `gauntlet`, `party`, `boss`, `cuju`, `replay`, `demo`, `watchAi` | Strictly Hidden |

### Pre-Match Default Tactic Selector

In the Mode Hall (`#single`), `#xiwuTacticRow` appears only when configuring `watch2v2`, `melee`, `ctf`, or `quad`. Players can choose their default starting tactic (`auto`, `spear`, `wall`, `raid`), persisted in `localStorage` under `renying-default-tactic` (default: `auto`) and applied automatically on match start in both `cmdRoundInit()` and `startRound()`.

### Non-Obstructive Tactics Drawer Redesign

The in-combat panel (`#teamCmdPanel`) was redesigned from a centered 820px modal into a compact, semi-transparent top-right docked drawer (`width: min(440px, 92vw)`, draggable by its header) so the center arena remains unobstructed during live combat. It exposes all four tactics (`[4] 智策`, `[1] 锋矢`, `[2] 铁壁`, `[3] 游袭`), a live adaptive reasoning bar when `auto` is active, formation pills, focus-target selection, and per-ally role assignment with hero archetype badges.

## Redesigned Tactics And Intelligent Adaptive Default

### Deep Behavioral Modifiers

Every tactic modifies AI decision-making across `buildTacticAiMod()` (`src/game/04-modes/22-modes-17-command/03-adaptive-ai-engine.js`) and `AIBrain` (`src/ai/04-brain-offense-and-neutral.js`, `src/ai/05-brain-hero-routes-and-team.js`):

| Tactic | Key | Counter | Aggression | Spacing | Guard Bonus | Skill / Ult Sync | Retreat Threshold | Core AI Behavior |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **智策 (Auto)** | `4` | Dynamic | Dynamic | Dynamic | Dynamic | Dynamic | Dynamic | Evaluates team comp, enemy posture, map hazards, mode objectives, and live battle state every 0.5s with 1.8s hysteresis |
| **锋矢 (Spear)** | `1` | Beats Wall | `1.36x` | `0.84x` | `+0.00` | `1.28x` / `1.32x` (`+35%`/`+45%` on CC) | `0.65x` base | Synchronizes focus-fire and burst skills/ults onto low-HP, stunned, launched, or guard-broken targets |
| **铁壁 (Wall)** | `2` | Beats Raid | `0.74x` | `1.06x` | `+0.36` | `0.94x` (`1.22x` counter) / `1.12x` | `1.28x` base | Anchors around commander/backline, raises guard rate, and prioritizes peel interrupts for attacked allies |
| **游袭 (Raid)** | `3` | Beats Spear | `1.16x` | `1.18x` | `+0.00` | `1.24x` / `1.08x` | `1.15x` base | `+6%` movement speed, targets isolated foes and backliners, increases aerial flank probability (`1.45x`) |

### Five-Dimension Adaptive Engine (`cmdComputeAdaptive`)

When `auto` is active (in both commander modes and 2v2 co-op), the engine scores `spear`, `wall`, and `raid` every 0.5 seconds using:

1. **Team Composition**: Aggregates all 20 heroes' archetype weights (`vanguard`, `skirmisher`, `assassin`, `controller`, `zoner`, `support`), average burst, peel, and flank ratings.
2. **Enemy Composition & Live Posture**: Detects enemy focus-fire (`focus >= 0.52` countered by `raid`), spread (`spread > 235 + 28n` countered by `wall`), huddle (`spread < 125 + 16n` countered by `spear`), and backline zoner/support density.
3. **Map & Hazards**: Adjusts posture for cliff knockback arenas, thunder/wind hazards, ice traction, and multi-layer battle maps.
4. **Game Mode Objectives**: Prioritizes `spear` to intercept enemy flag carriers and `wall` to escort friendly carriers in `ctf`, and survival/flank pivots in `quad`.
5. **Evolving Combat State**: Responds to commander HP (`< 42%`), team HP average, allies under hitstun/launch CC, and enemies stunned/guard-broken.

## Twenty-Hero Tactical Analysis And Empirical Profiles

Every hero in RenYing has a dedicated `HERO_TACTIC_PROFILE` entry driving dynamic role allocation (`main`, `lure`, `peel`), optimal spacing, low-HP retreat thresholds, and stance modifiers. The table below combines each hero's structural profile with empirical performance across **2,385,151 simulated combat frames** (211–265 team matches per hero):

| Hero | ID | Archetype | Default Role | Spacing | Peel / Burst / Flank | Retreat HP | Empirical WR | Survival | Top Tactic (WR) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 青锋 | `qingfeng` | Skirmisher | `main` | `0.96` | `0.55 / 0.82 / 0.68` | `26%` | `48.1%` | `99.6%` | `auto` (`66%`) |
| 绯影 | `feiying` | Assassin | `lure` | `0.86` | `0.35 / 0.90 / 0.96` | `32%` | `52.8%` | `97.2%` | `auto` (`66%`) |
| 铁山 | `tieshan` | Vanguard | `peel` | `0.82` | `0.94 / 0.66 / 0.25` | `18%` | `62.2%` | `99.6%` | `auto` (`72%`) |
| 凌霜 | `lingshuang` | Skirmisher | `peel` | `1.12` | `0.78 / 0.72 / 0.52` | `28%` | `51.7%` | `98.7%` | `auto` (`68%`) |
| 流云 | `liuyun` | Zoner | `lure` | `1.16` | `0.45 / 0.70 / 0.86` | `34%` | `52.9%` | `100.0%` | `auto` (`68%`) |
| 雷鸣 | `leiming` | Skirmisher | `main` | `0.90` | `0.76 / 0.86 / 0.64` | `22%` | `54.1%` | `98.3%` | `auto` (`63%`) |
| 墨羽 | `moyu` | Zoner | `lure` | `1.24` | `0.58 / 0.76 / 0.42` | `36%` | `49.2%` | `99.2%` | `auto` (`63%`) |
| 月华 | `yuehua` | Support | `peel` | `1.08` | `0.86 / 0.56 / 0.40` | `34%` | `47.0%` | `98.7%` | `auto` (`53%`) |
| 燕翎 | `yanling` | Assassin | `lure` | `1.06` | `0.32 / 0.84 / 0.94` | `35%` | `54.9%` | `98.7%` | `auto` (`77%`) |
| 玉箫 | `yuxiao` | Zoner | `peel` | `1.20` | `0.74 / 0.68 / 0.45` | `36%` | `49.0%` | `97.1%` | `auto` (`64%`) |
| 醉翁 | `zuixian` | Vanguard | `peel` | `0.90` | `0.88 / 0.74 / 0.46` | `20%` | `43.6%` | `98.8%` | `auto` (`57%`) |
| 勾陈 | `gouchen` | Vanguard | `peel` | `0.95` | `0.90 / 0.78 / 0.55` | `22%` | `45.5%` | `98.8%` | `auto` (`62%`) |
| 凌雀 | `lingque` | Assassin | `main` | `1.00` | `0.42 / 0.95 / 0.90` | `30%` | `39.5%` | `93.6%` | `spear` (`42%`) |
| 离影 | `liying` | Assassin | `lure` | `1.04` | `0.48 / 0.82 / 0.92` | `32%` | `37.6%` | `96.9%` | `raid` (`48%`) |
| 磁仙 | `cixian` | Controller | `peel` | `1.08` | `0.84 / 0.80 / 0.56` | `28%` | `43.6%` | `98.1%` | `auto` (`60%`) |
| 千机 | `qianji` | Controller | `lure` | `1.16` | `0.62 / 0.78 / 0.62` | `30%` | `65.2%` | `95.7%` | `auto` (`85%`) |
| 炽霄 | `chixiao` | Skirmisher | `main` | `1.02` | `0.64 / 0.88 / 0.60` | `24%` | `48.9%` | `99.1%` | `auto` (`72%`) |
| 玄机 | `xuanji` | Zoner | `lure` | `1.22` | `0.70 / 0.82 / 0.48` | `34%` | `52.7%` | `98.7%` | `auto` (`64%`) |
| 青鸾 | `qingluan` | Support | `peel` | `1.15` | `0.92 / 0.52 / 0.50` | `38%` | `49.8%` | `99.2%` | `auto` (`65%`) |
| 玄武 | `xuanwu` | Vanguard | `peel` | `0.88` | `0.96 / 0.68 / 0.22` | `16%` | `50.0%` | `98.8%` | `auto` (`70%`) |

## Comparative Simulation And Benchmark Results

Run command: `node tools/tests/tactics-bench.mjs` (raw dataset archived in `docs/design/tactics-benchmark-data.json`).

### Execution Summary

- **Total Matches Simulated**: 720
- **Total Combat Frames Simulated**: 2,385,151 (at 120 Hz simulation timestep)
- **Wall-Clock Duration**: 74.2 seconds across 8 parallel workers
- **Average Simulation Cost**: `0.2455 ms/frame` (34x faster than the `8.33 ms` 120 Hz real-time budget)

### Head-To-Head Tactic Win Rates

| Matchup (Team A vs Team B) | Team A Win Rate | Record | Frames Simulated | Avg Frame Time |
| :--- | :---: | :---: | :---: | :---: |
| `auto` vs `spear` | **62.4%** | 63 / 101 | 333,000 | `0.2593 ms/f` |
| `auto` vs `wall` | **65.3%** | 66 / 101 | 333,000 | `0.2532 ms/f` |
| `auto` vs `raid` | **64.3%** | 63 / 98 | 322,800 | `0.2439 ms/f` |
| `spear` vs `wall` | **67.3%** | 68 / 101 | 333,000 | `0.2598 ms/f` |
| `wall` vs `raid` | **74.3%** | 75 / 101 | 332,551 | `0.2824 ms/f` |
| `raid` vs `spear` | **68.3%** | 69 / 101 | 333,000 | `0.2477 ms/f` |

### Adaptive Auto Win Rate By Mode And Team Size

| Mode | Team Size | Auto Win Rate vs Fixed Tactics | Frames Simulated | Avg Frame Time |
| :--- | :---: | :---: | :---: | :---: |
| 2v2 Co-Op | 2v2 | **59.3%** (32 / 54) | 301,951 | `0.1009 ms/f` |
| Melee | 3v3 | **54.8%** (69 / 126) | 1,291,200 | `0.1970 ms/f` |
| Melee | 5v5 | **77.1%** (37 / 48) | 345,600 | `0.3658 ms/f` |
| Melee | 8v8 | **72.2%** (13 / 18) | 100,800 | `0.7192 ms/f` |
| Capture The Flag | 3v3 | **60.0%** (18 / 30) | 192,000 | `0.2522 ms/f` |
| Quad Clash | 2v2v2v2 | **95.8%** (23 / 24) | 153,600 | `0.3477 ms/f` |

### Adaptive Auto Win Rate By AI Difficulty

| AI Difficulty | Auto Win Rate vs Fixed Tactics | Frames Simulated |
| :--- | :---: | :---: |
| Easy (`easy`) | **62.1%** (36 / 58) | 476,800 |
| Normal (`normal`) | **59.7%** (37 / 62) | 480,800 |
| Hard (`hard`) | **77.6%** (45 / 58) | 476,800 |
| Impossible (`impossible`) | **61.9%** (39 / 63) | 476,351 |
| God (`god`) | **59.3%** (35 / 59) | 474,400 |

### Coordination Metrics By Tactic

| Tactic | Focus-Fire Concentration | Peel Interventions (Per 30s) | CC Burst Follow-Ups (Per 30s) | Low-HP Survival Rate | Adaptive Switches |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Auto (智策)** | `72.1%` | `55.67` | `34.27` | `89.8%` | `2,900` |
| **Spear (锋矢)** | `88.5%` | `57.78` | `35.13` | `90.3%` | `0` |
| **Wall (铁壁)** | `72.6%` | `77.18` | `34.29` | `87.7%` | `0` |
| **Raid (游袭)** | `63.0%` | `63.49` | `31.14` | `84.1%` | `0` |

## Verification Status

- `python3 tools/build.py && python3 tools/build.py --check`: Passed (`index.html` and `renying-offline.html` synchronized)
- `node tools/checks/data-check.mjs --strict-copy`: Passed (zero missing or duplicate bilingual keys)
- `node tools/tests/combat-test.mjs --sim`: Passed (all combat, commander, adaptive tactic, and strict mode visibility checks green)
- `node tools/tests/rollback-test.mjs --offline`: Passed (deterministic offline build and rollback checks green)
- `node tools/tests/tactics-bench.mjs`: Passed (2,385,151 combat frames across 720 matches)
