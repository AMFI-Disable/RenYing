# Combat AI Architecture

This document describes the shipped combat AI in `src/ai.js`. It records the current decision model and its guardrails; it is not a promise that every difficulty uses every tactic equally.

## Decision Order

Each fighter AI makes a decision from the shared fixed-step simulation. It first handles defensive reactions and observed opponent behavior, then continues a queued combo or runs hero-specific routes, punishes, wake-up play and neutral spacing. Move frame data from `src/models/ai-brain.json` is used to estimate reach, startup and recovery. Hero profiles adjust preferences only; they do not override move range, cooldowns, skill requirements or counterplay checks.

## Hero Tactical Profiles

All 16 heroes have a compact style, preferred spacing and scroll-school affinity. Existing routes remain authoritative for characters with dedicated mechanics, such as 凌雀 marks, 离影 mist doubles, 磁仙 polarities and 千机's iron ball.

| Hero | Tactical Focus | Scroll Affinities |
| :--- | :--- | :--- |
| 青锋 | Balanced sword and projectile play | Wind, Qi |
| 绯影 | Close-range opening and escape | Shadow, Wind |
| 铁山 | Guard pressure and heavy attacks | Metal, Ink |
| 凌霜 | Long-range footsies | Wind, Metal |
| 流云 | Air control and projectiles | Wind, Qi |
| 雷鸣 | Counter opportunities | Thunder, Metal |
| 墨羽 | Ranged control | Ink, Qi |
| 月华 | Sustain and defensive reads | Shadow, Blood |
| 燕翎 | Air mobility | Wind, Shadow |
| 玉箫 | Ranged control and resource use | Qi, Wind |
| 醉翁 | Close-range brawling | Blood, Metal |
| 勾陈 | Pulls and set play | Ink, Metal |
| 凌雀 | Mark and dash conversions | Shadow, Wind |
| 离影 | Mist positioning and mix-ups | Shadow, Ink |
| 磁仙 | Range control and polarity setup | Qi, Metal |
| 千机 | Ball setup and ranged pressure | Wind, Qi |

## Match Context

- **Health:** Low-health AI de-emphasizes slow, risky commitments and favors available defensive or quick options. A substantial health lead reduces avoidable high-risk attacks. Finishing opportunities receive a modest preference.
- **Scrolls:** The AI reads active scroll IDs without modifying fighter state. Action scoring favors matching effects such as light-hit scrolls, heavy-hit scrolls, skill triggers and ultimate amplification. Tower spectator AI chooses signature scrolls first, then values school resonance, build synergy and low-health sustain.
- **Maps:** Neutral spacing reflects each hero's preferred range, ice traction and active wind. The AI can move into guard-regeneration mist when its guard is low, or seek it while injured and carrying a recovery scroll. An airborne AI leaves a marked thunder lane before the strike when it can move freely.
- **天机乱斗:** The active mutation changes priorities for mobility, air play, attacks, meter and cooldowns. Mutations remain simulation-owned; the AI only reads their current type.
- **通天神诀:** The AI begins with full meter as the mode defines. It modestly increases confirmed ultimate use, while ultimate kill thresholds use health ratios so the enlarged health pools do not cause premature finishes. The shared `mayhemOn()` check also covers team mutators and replay contexts.

## Determinism And Safety

- The AI does not alter attack damage, hitboxes, scroll effects, map effects, cooldown values or mode rules.
- Tactical profile and scroll reads do not write to fighter, rollback or replay state.
- Existing frame checks, skill `can` checks, hero routes and opponent counter checks remain in force.
- Decisions continue to use the simulation's seeded random source where the existing AI already uses chance. Tower draft tie-breaking is stable by card order.
- When changing move reach or timing, update the source move and regenerate the AI frame model with `node tools/ai/ai-framedata.mjs` before relying on matchup reports.

## Verification

Run the focused policy checks with `node tools/tests/ai-tactics-test.mjs`. The broader AI checks run with `node tools/tests/test-ai.mjs`; combat and rollback checks are `node tools/tests/combat-test.mjs --sim` and `node tools/tests/rollback-test.mjs --rollback`.
