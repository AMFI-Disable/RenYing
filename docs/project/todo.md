# RenYing Roadmap

This is an ambitious working draft, not a list of committed designs. Its direction comes from a conversation with the maintainer; unchecked items include both requested outcomes and ideas to investigate. Confirm open questions before making consequential design choices.

## Vision And Context

- Polish RenYing as a fighting game for friends at school, grow it to a public audience, and develop a broad martial-arts game with many modes.
- Aim for students to play regular matches during breaks. Approximately 30 students have tried the game and 25 returned; these are informal estimates, not measured retention.
- Build on what players already enjoy: heroes' personalities, abilities, and movements, and the ability to play without needing a phone.
- Protect the accessibility and speed of 3v3 relay (车轮战), currently around five minutes per match, and keep procedures minimal.
- Work in manageable increments for a small team; validate ideas with actual players.

## 3v3 Relay And Match Features

- [x] Review the current journey from opening the game to starting a 3v3 relay; remove unnecessary steps while letting players choose their three heroes.
- [x] Improve hero selection and drafting without making the default flow cumbersome.
- [ ] Explore improvements to hero order, transitions between fighters, and meaningful team combinations while retaining the relay format.
  - [x] Let Quick Relay players swap their first two heroes before choosing the third.
  - [x] Preview and rotate all three selected heroes before the final pick.
  - [x] Document existing transition and team mechanics for player evaluation.
- [ ] Explore maps, match pacing, and comeback opportunities; test that changes preserve short, enjoyable matches.
- [x] Improve post-match results and investigate fast rematches and changing teams between matches.
- [ ] Test the full flow with school players and record where they hesitate or leave.

See [3v3 Relay Review And Playtest](relay-playtest.md) for the rule review, automated coverage and proposed player sessions. The broader exploration and playtest remain open until actual players evaluate pace, combinations and maps.

## Match Review And Replays

The existing match review already uses match statistics, sampled replay states, matchup advice, and replay links. Improve it from this baseline; do not assume every frame or every player's decisions are currently captured.

- [ ] Analyze each player separately, using their own actions and situations rather than repeating generic advice.
- [ ] Develop hero-to-hero analysis grounded in the actual matchup and exchanges.
- [ ] Record and update player tendencies in different situations; define what evidence is needed before describing a preference.
- [ ] Investigate frame-by-frame replay data, storage and processing costs, and compatibility with existing recordings.
- [ ] Develop and evaluate trained models and data analyzers without a paid online AI service; establish a useful offline or local analysis path.
- [ ] Link observations to replay evidence and distinguish measured facts, uncertain interpretations, and insufficient data.
- [ ] Make the full match replay accessible from the review; investigate navigation to notable moments within it.
- [ ] Evaluate reviews on varied real matches and hero pairings, including cases with similar totals but different decisions; check that feedback is specific and useful.
- [ ] Decide how player tendency data is stored, controlled, and cleared before implementing persistence.

## Interface Features

- [ ] Audit how screens fit on the devices and display sizes students use, including scaling, clipping, scrolling, and readability.
- [ ] Improve responsive layouts for the home screen, hero selection, lobby, combat HUD, results, replays, and community; prioritize issues observed by players.
- [ ] Preserve keyboard usability and test touch layouts where applicable.
- [ ] Check Chinese and English text at different screen sizes and with longer translations.

## Heroes And Stories

- [ ] Brainstorm new heroes with the team and players; develop distinctive personalities, abilities, movements, and roles before selecting additions.
- [ ] Deepen existing heroes' stories and relationships through playable content.
- [ ] Create or refine signature animations that express each hero's personality and abilities.
- [ ] Plan and produce new skins with clear visual identity and readability in combat.
- [ ] Improve story enemies' decision-making and tune their stats so fights are engaging rather than trivial.
- [ ] Explore difficulty choices and distinctive encounters; test challenge with players of different skill levels.
- [ ] Decide how story chapters are played, how long they should take, and how relationships appear through gameplay.

## Game Modes

- [ ] Continue expanding the martial-arts game with modes, guided by player interest and the team's capacity.
- [ ] Identify which existing modes are actually played and which need polish before proposing additions.
- [ ] Brainstorm new modes and assess their fit for short school breaks and longer sessions.
- [ ] Keep 3v3 relay polished as the established school favorite while evaluating new modes independently.

## Tournaments, Spectating, And Leaderboards

- [ ] Design tournaments visible on the website, including a clear way to see brackets and results.
- [ ] Decide tournament creation permissions, registration, match coordination, result reporting, and dispute handling.
- [ ] Support or improve live spectating on individual devices and on a shared screen; assess existing capabilities first.
- [ ] Explore a tournament spectator view showing useful match and team information without obscuring the fight.
- [ ] Provide public leaderboards as the long-term direction, with both overall and mode-specific rankings.
- [ ] Define ranking rules, eligibility, ties, and how results are displayed; decide whether seasons reset rankings and preserve history.
- [ ] Test spectator and tournament flows under realistic school network and device conditions.

## Community

- [ ] Let players choose to share match results in 社区 (Community).
- [ ] Define the shared result's contents and whether it can include a link to the full replay.
- [ ] Check existing Community behavior and design appropriate controls for unwanted or excessive posts.

## Refactoring And Technical Foundations

- [ ] Map the current replay, review, AI training, 3v3 relay, spectator, and leaderboard implementations before changing them.
- [ ] Identify the most costly areas of coupling and refactor incrementally around planned features, preserving behavior and generated-build conventions.
- [ ] Define reliable match and replay data needed by review, spectators, results, and rankings; investigate backward compatibility and performance.
- [ ] Profile analysis and rendering on school devices before selecting optimizations.
- [ ] Add focused tests for meaningful new behavior and maintain the existing build and regression checks.

## Fixes And Quality

- [ ] Collect reproducible player-reported bugs, including screen size, device, mode, and steps where relevant.
- [ ] Prioritize problems that interrupt a match, obscure controls, lose progress, or prevent a replay or result from working.
- [ ] Verify fixes against the affected mode and related online, offline, and interface flows.

## GitHub And Team Workflow

- [ ] Review existing issues and workflows before creating or duplicating tracking items.
- [ ] Break agreed initiatives into small, independently reviewable tasks with acceptance criteria and relevant tests.
- [ ] Decide how the team assigns work, reviews AI-assisted changes, and gathers school-player feedback.
- [ ] Keep bilingual documentation, generated artifacts, and repository checks in sync with changes.
- [ ] Consider a public-facing roadmap and issue process when the team is ready to support outside contributors.

## Decisions To Revisit

- [ ] Which interface screens and devices have the most serious fit problems?
- [ ] What exact steps in the current 3v3 flow should change, and what team-combination mechanics fit relay play?
- [ ] How are tournaments created and managed, and who can browse and participate?
- [ ] How should public rankings work, including seasonal resets and historical results?
- [ ] When should reviews run, and how should tendency data be stored and controlled?
- [ ] Which story format and difficulty options best suit players?
- [ ] What new heroes should the team brainstorm first?
