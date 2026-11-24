# Hero Roles And Signatures

This note lists the groups of heroes whose roles overlapped, what makes each hero different now, and how to keep the groups apart when a new hero is added. It belongs to issue #31. The one-line play tips for the pick screen are issue #32 and use the wording below.

## Overlapping Groups

| Group | Heroes | What overlapped |
| :--- | :--- | :--- |
| Armor tanks | Tie Shan, Xuan Wu, Tian Gang, Ba Wang, Po Lang, Cang Ming, Chi Xiao | Same armor passive, near-identical hit points, weight, guard and damage |
| Assassins | Fei Ying, Yin Hu, You Ming | Fast, fragile, short reach |
| Controllers | Mo Yu, Mo Jue, Dan Qing, Ling Xi, Xuan Ji, Yu Xiao | Mid-to-long range, same stat shape |
| Supports | Qing Luan, Yun He, Feng Ling | Same stat shape, heal and buff skills |

## Armor Tanks

Heavy and charged attacks carry armor for every hero in this group. Each hero now gets a different reward for absorbing a hit, set in `ARMOR_PERK` in `src/game/02-combat/10-hits-03-signatures.js`. The numbers are small on purpose: they change how a hero feels, not how strong the hero is.

| Hero | Role | Stat change | Reward for absorbing a hit |
| :--- | :--- | :--- | :--- |
| Tie Shan | Slowest and heaviest brawler | Unchanged | Skill cooldowns refresh fastest among the plain brawlers (0.7 s) |
| Xuan Wu | Turtle | Largest guard bar (140) and the most stable guard, lowest chip damage, less damage and reach | Restores 16 guard |
| Tian Gang | Long spear tank | Longest reach of the group (1.28), lighter guard and poise, a little faster on foot | Both skill cooldowns drop by 0.9 s |
| Ba Wang | Bruiser | Highest damage of the group (1.15), faster swings, lowest defense and a smaller guard bar | Gains 5 ultimate meter |
| Po Lang | Mobile grappler | Faster walk and higher jump, lighter body, a little less health | Recovers 9 health |
| Cang Ming | Cold sword tank | Unchanged | Cooldowns drop by 0.5 s and 8 guard comes back |
| Chi Xiao | Fire bruiser | Unchanged | Gains 3 meter and cooldowns drop by 0.3 s |

## Other Groups

The assassin, controller and support groups keep their stats. They already differ in skills and range, so the pick-screen text from issue #32 should lead with the signature skill:

- Assassins: Fei Ying is the fastest mover, Yin Hu hides and strikes from behind, You Ming pulls enemies in.
- Controllers: Mo Yu and Dan Qing paint zones, Mo Jue seals moves, Ling Xi stuns on a beat, Xuan Ji bends space, Yu Xiao controls rhythm.
- Supports: Qing Luan heals, Yun He flies and mends, Feng Ling blesses allies with wind.

## Checking Balance

After a change to this group, run the same hero pool against the field and compare with the old numbers:

```bash
node tools/ai/ai-arena.mjs --a hard --b hard --n 2 --heroes 2,16,19,20,22,26,32
```

A hero whose win rate moves more than about ten points against the old run needs its `bal` multiplier adjusted in `src/data/heroes/`.

## Adding A Hero

1. Pick the group the hero belongs to and write down what the hero does that nobody else in the group does.
2. Give the hero a different stat shape from the rest of the group (reach, speed, guard or weight, at least two of them).
3. If the hero uses the armor passive, add an entry to `ARMOR_PERK`.
4. Add a skin and a map strengths and weaknesses entry (`beats` and `weakTo`) before the hero is announced.
