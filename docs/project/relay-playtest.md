# 3v3 Relay Review And Playtest

## Current Rules

Local relay uses three heroes in the selected order. When a fighter loses, the next enters at full health; the winner carries remaining health plus 182 points, capped at maximum health. Each bout has 80 seconds of fight time and, if neither fighter is defeated, 20 seconds of overtime with doubled damage. Overtime can end in a draw; a drawn bout does not advance either team. The match ends when one team loses all three fighters, or after the draw limit. The normal three-to-five decisive bouts can therefore take up to 300–500 seconds of fight-clock time if all reach the overtime limit, plus introductions, knockouts and setup. This is a ceiling for those bouts, not a measurement of typical duration.

Quick Relay skips bans and assigns recommended scrolls. The player can undo a pick, swap the first two, or rotate a highlighted third hero through the three positions before confirming. The full draft offers bans and manual scroll selection. A same-team rematch preserves the teams, difficulty, map, mutator and scrolls; choosing a new team opens Quick Relay. These paths do not introduce a new team-wide combat bonus.

## Maps And Team Choices

All six maps are eligible for local relay: cliff, ice, bamboo, thunder, pagoda and wine. Their terrain and hero-specific advantages already affect movement, positioning or abilities. Quick Relay uses the existing map selection and recommended scroll logic. The scroll recommendation considers each hero and map; it is not evidence that a three-hero combination is balanced or effective. Compare contrasting ranges, mobility and map advantages with players before adding a new combination mechanic or changing carryover.

Automated combat checks cover ordered substitutions, health carryover and its cap, drawn rounds, each map, rematches and repicking. These checks do not establish actual match length, player comprehension, balance or enjoyment.

## AI Exploration

At revision `a5ddef9`, `node tools/ai/relay-study.mjs` ran 24 seeded, headless AI-versus-AI relay matches: four per map, using two fixed pairs of three-hero teams with both starting sides represented. Both sides used normal difficulty and recommended scrolls. The simulation starts matches directly; it does not exercise the Quick Relay interface. The reproducible per-match records are in [relay-ai-study.jsonl](relay-ai-study.jsonl); `frames / 120` is simulated match time from initialization to the end, including simulated introductions and knockout transitions. It excludes selection, rendering overhead, pauses and real players.

All 24 matches finished. Simulated durations ranged from 78.2 to 225.6 seconds, with a median of 158.9 seconds; none exceeded 300 simulated seconds. Seven winners had at some point trailed by one eliminated fighter, and none won after trailing by two. Three matches had three bouts, ten had four, and eleven had five.

| Map | Median Simulated Seconds | Matches |
| :--- | ---: | ---: |
| Cliff | 131.6 | 4 |
| Ice | 183.3 | 4 |
| Bamboo | 152.8 | 4 |
| Thunder | 191.0 | 4 |
| Pagoda | 152.4 | 4 |
| Wine | 153.3 | 4 |

These are descriptive observations from a small fixed set of AI teams and seeds, not estimates of student match duration, map balance, comeback probability or enjoyment. Seeded side reversals do not eliminate hero, scroll, AI or map interactions. No change to timing, recovery or team bonuses is justified by this sample alone.

## School Playtest

Run several complete matches with volunteers of different experience levels. Include both languages and the keyboard and touch devices players actually use. Record the game revision, mode, map, difficulty, device and viewport, but do not record names or account details. For each match record:

- Time from opening the game to combat, fight duration, and total time to results; record pauses or interruptions separately.
- The ordered teams, number of bouts and draws, winner, and whether a team came back after losing the first or second fighter.
- Whether players notice the current fighter, next fighter, health carryover, team order controls, results and rematch choices.
- Any hesitation, accidental selection, unreadable or clipped control, disconnect, replay failure or unexpected transition, with steps to reproduce.
- A short player assessment of pace, clarity, map influence and whether they would play another match.

Try the full draft and Quick Relay, same-team rematch and new-team repick, and several maps and team compositions. Compare results and observations before changing timers, recovery, map effects or combination bonuses. Record the number of sessions and report the distribution of durations rather than presenting the informal five-minute estimate as a measured result.
