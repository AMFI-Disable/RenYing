# RenYing — Codebase Map & Full Hero Reference

> [!NOTE]
> Generated from the working tree at commit `351e61b` (`fix: resilient spawn runner`), game `VERSION = '4.5'`.
> Every number below was read out of the source — `src/game.js` line references are given so you can check them.
> Since the refactor, `src/game.js` is split into numbered files under `src/game/` (concatenated in order they are the old file), so old line numbers are approximate; the table in §14 names the new files.

---

## 0. One-Paragraph Summary

**RenYing (刃影)** is an ink-wash martial-arts fighting game that runs entirely in a browser tab. It is written in
plain JavaScript against a single `<canvas>` (no framework, no bundler, no npm dependencies at runtime), with:

* a deterministic 120 Hz fixed-step core so two browsers can run **rollback netcode** over WebRTC,
* an optional zero-dependency Python server (`server.py`, standard library only) for LAN play, accounts, ranked, chat,
  replays and reconnect,
* an optional Firebase/Firestore cloud-save layer that degrades to `localStorage`,
* a second, separate 3D mini-game (**青锋行 / Qingfengxing**, three.js) embedded in an iframe and packed into the same build,
* twelve playable heroes, 34 skins, 9 music tracks, and a family of headless simulation/balancing/training tools that
  produce the neural-network AI models in `models/`.

The pages at the repository root (`index.html`, `renying-offline.html`, `assets/qingfengxing.html`) are **generated**;
`src/` is the source of truth.

---

## 1. Top-Level Repository Map

| Path | Size | What it is |
| :--- | ---: | :--- |
| `index.html` | 1.5 MB | **Generated** online build (GitHub Pages + `server.py`). Loads music and the mini-game on demand. |
| `renying-offline.html` | 9.7 MB | **Generated** single-file build: music + mini-game inlined as base64. Double-click and play. |
| `renying.html` | 0.6 KB | **Generated** redirect stub for the old URL. |
| `src/page.html` | 85 KB | HTML skeleton with `<!--@style-->`, `<!--@music-->`, `<!--@scripts-->`, `<!--@qfx-->` build markers. |
| `src/style.css` | 116 KB | All UI styling (ink-wash theme, responsive + touch layouts). |
| `src/game.js` | 849 KB, 13 819 lines | The entire 2D game: engine, menus, codex, AI, netcode, store, replays. |
| `src/net-p2p.js` | 24 KB, 471 lines | Serverless WebRTC/PeerJS transport. |
| `src/cloud.js` | 41 KB, ~1 005 lines | Firebase Auth + Firestore cloud save, local fallback, `window.CloudSave`. |
| `src/social.js` | 35 KB, 603 lines | 江湖驿站: P2P hall chat, friends, DMs, groups, with store-and-forward outbox. |
| `src/qfx/` | 4 640 lines (20 files + `page.html`) | Qingfengxing mini-game sources, numbered so filename order == load order. |
| `server.py` | 1 303 lines | Optional LAN server: HTTP + hand-rolled RFC 6455 WebSocket + SQLite. |
| `assets/` | 6.4 MB | PeerJS, three.js, Firebase compat bundles, 9 MP3s, Qingfengxing build, skin artwork. |
| `models/` | 864 KB | 12 per-hero neural nets + global/2v2 nets and dated training snapshots. |
| `tools/` | 19 files | Build script, data import/export, headless simulators, trainers, UI/touch/net audits. |
| `firestore.rules` | — | Security rules for the optional cloud save. |
| `export.py`, `renying-export.json` | 39 lines / 37 KB | Legacy production-DB export helper and a sample export. |
| `changelog.md`, `walkthrough.md`, `readme*.md`, `project.pdf`, `license`, `security.md` | — | Documentation. |
| `.github/workflows/ci.yml`, `pages.yml` | — | CI quality gates and GitHub Pages deployment. |

---

## 2. Build Pipeline (`tools/build.py`, Python Stdlib Only)

```text
src/page.html ──┐
src/style.css ──┤  CSS comment-stripped, blank lines dropped
src/game.js  ───┤  cloud.js → game.js → net-p2p.js → social.js
src/net-p2p.js ─┤  each JS file: block comments removed, blank lines removed
src/cloud.js ───┤  (line numbers survive; only comments/blank lines are dropped)
src/social.js ──┘
assets/*.js    ─── inlined raw: peerjs (always), firebase ×3 (online only)
assets/music/*.mp3 ─ base64 → window.MUSIC_DATA          (offline only)
models/heroes/*.json + renying_ai_watch2v2.json ── quantized → window.RENYING_HERO_MODELS / RENYING_2V2_MODEL
src/qfx/page.html + src/qfx/NN-*.js ─ concatenated inside one IIFE → assets/qingfengxing.html
                                       (offline: also base64 → <script id="qfxData">)
```

* `window.RENYING_BUILD = {offline: false|true}` selects the offline behaviour at runtime.
* `outputs()` writes four files; `--check` mode returns exit code 1 if any generated page is stale (**CI runs this**).
* `check_js()` runs `node --check` on all five sources and on the concatenated qfx bundle (skipped if node is absent).
* Markers must appear exactly once; the build aborts otherwise.
* `quantize_obj()` rounds the AI model weights so the embedded JSON stays small.

Rebuild after any `src/` or `assets/` change:

```bash
python3 tools/build.py
python3 tools/build.py --check   # what CI does
```

---

## 3. Anatomy Of `src/game.js`

`grep -n '^// =======================' src/game.js` gives the whole skeleton:

| Line | Section | Notes |
| ---: | :--- | :--- |
| 1 | Chinese seal-glyph UI icons | Replaces emoji with drawn 印章 characters, including a `MutationObserver`. |
| 79 | Settings | `SETTINGS` persisted to `localStorage`. |
| 92 | Base constants | `VERSION 4.5`, `STEP = 1/120`, `STAGE_W 1800`, `WALL 60`, gravity/jump/walk, seeded RNG `GRNG`. |
| 135 | `POSES` | Skeleton poses: hip/neck/hands/feet + sword angle, solved with IK. |
| 218 | `MOVES` | Base move table: `su` startup, `ac` active, `rc` recovery, `dmg`, `kb`, `stun`, `hs` hitstop, `box`, `next`. |
| 240 | `BAL` + `CHARS` | Global auto-tuned multipliers and the 12 hero definitions. |
| 346 | `buildMoves()` | Generates each hero's move table from `MOVES` × `stat` multipliers + weapon pose mods. |
| 366 | `SKILLS` (Q + R) | Cooldown, start/update callbacks, pose, AI predicate, description. |
| 775 | `ULTS` (E) | `flurry` ults are data-driven; the rest use `begin`/`update`. |
| 1013 | Sound | Fully synthesized SFX (including metal via inharmonic partials). |
| 1108 | Original music | Procedural score on a pentatonic scale. |
| 1169 | Music files | MP3 playback / `MUSIC_DATA`. |
| 1274 | Input | `Ctrl` class, buffering, touch relay. |
| 1323 | Networking (shared) | `NET`, `serverBase()`, room/match/ranked plumbing, message dispatch. |
| 1717 | CPU AI | Heuristic AI + neural “God” tier that calls the trained models. |
| 1789 | Stage mode | 6 chapters × 5 stages of monsters, then a hero boss. |
| 2569 | `Fighter` | The character object: HP, guard, meter, cooldowns, state machine. |
| 2630 | Match flow | Rounds, timer, overtime, KO, results. |
| 3103 | Actions | Movement, jump/double jump/flight, attack, block, escape, skill execution. |
| 3445 | Projectiles | Wind blades, kunai, traps, bolts, tornadoes, talismans, rocks… |
| 3927 | Hit detection / `applyHit` | The whole damage pipeline (see §5). |
| 4430 | Pose animation | Procedural rig animation between poses. |
| 4589 | Effects | Particles, trails, shake, flashes. |
| 4636 | Main loop | Fixed-step accumulator, render order. |
| 4711 | Qingfengxing iframe | Loads `assets/qingfengxing.html` in an isolated iframe. |
| 4738 | Replays | Record/play matches. |
| 4972 | Mini-game rewards | Chapter clears → ink/skin rewards. |
| 5117 / 5288 / 5444 | Rendering | Background, characters, skins. |
| 6509 | UI rendering | Canvas HUD + panels. |
| 7340 | Menu scenes | Bamboo grove, pavilion, arena backdrops. |
| 7731 | Settings UI | |
| 7828 | Codex | `statRows()` builds the displayed stat bars. |
| 7911 | Move type / counter explanations | `HERO_HIT_DETAILS`, `HERO_MOVE_SEQS`, `SKILL_FUN`. |
| 8925 | Progression | Ink, gacha, fragments, tasks, skins, ranked. |
| 10160 | Tutorial | |
| 10249 | Rollback netcode v2.6 | `ROLL`, snapshots, resimulation, checksums. |
| 10466 | Touch controls | Virtual stick + buttons. |
| 10750 | 3v3 tag mode | |
| 10878 | Roguelike / endless | 问剑密卷. |
| 11469 | 2v2 AI spectator | Watch AI vs AI. |
| 11757+ | Character select, demo, card art, net UI, accounts, legacy import | |
| 13641 / 13801 | Keyboard bindings / boot | |

Classes: `Ctrl` (human input), `DummyCtrl`, `AICtrl`, `Fighter`, `Puppet` (menu demo puppets).

---

## 4. Core Engine Facts

| Constant | Value | Meaning |
| :--- | :--- | :--- |
| `VERSION` | `4.5` | Both peers must match to play online. |
| `STEP` | `1/120 s` | Fixed logic step; render is decoupled. |
| `STAGE_W` | `1800 px` | Stage width; walls at `WALL = 60`. |
| `GRAV` | `2700` | Gravity (px/s²). |
| `WALK` | `280 px/s` | Base walk speed; hero `stat.walk` multiplies it. |
| `JUMP_V` / `DJUMP_V` | `980 / 860` | First / second jump. |
| `DASH_V` / `DASH_T` | `840 / 0.2 s` | Ground dash. |
| `BUF` | `0.16 s` | Input buffer window. |
| `INK_MAX/COST/REGEN/DMG` | `100 / 15 / 10/s / 24` | Moyu's ink resource. |
| `FU_MAX/INK/BASE/PER` | `5 / 3 ink / 80 / 40` | Moyu's talismans and ult scaling. |
| `ROUND_TIME` / `ROUND_TIME_2V2` | `50 / 75 s` | Round timer; then `OT_TIME = 20 s` overtime with damage ×`OT_DMG = 2`. |
| `CARRY_HEAL` | `80` | Round survivor carries HP + 80 into the next round. |
| `WINS_NEEDED` / `MAX_ROUNDS` | `2 / 5` | Round wins to take the match; hard cap on rounds. |
| `IMPOSSIBLE_HP` | `1.35` | HP multiplier for the 绝顶 CPU. |
| `LAST_STAND_*` | `100 meter / 3.5 s / +75 HP` | 2v2 孤军奋战 buff when a teammate falls. |
| `BP_TIME` / `BP_CPU_DELAY` | `25 / 0.85 s` | Pick-screen step timer; CPU thinking time per step. |

All match-rule numbers (the rows above from `ROUND_TIME` down, plus `CREDIT`, `PENGLAI_T`, `CINE_LEN`, `CHAOS_INTERVAL`,
`CHARGE_*`, `DODGE_CD`, `BREAK_CD`, `LAUNCH_GRAV` and the `LV_NAME` difficulty names) live in one block, 「对战规则数值」,
at the top of `src/game/01-core.js`. Skill cooldowns are read from `SKILLS[..].cd` / `escCD` only; the codex card table
`HERO_HIT_DETAILS` no longer carries its own copy.

Determinism: gameplay randomness uses the seeded `GRNG`/`grnd()`/`grand()`; cosmetic randomness uses `Math.random()`
and is explicitly excluded from rollback snapshots (`F_SKIP`).

---

## 5. Combat Math (The Part That Makes The Hero Numbers Mean Something)

`applyHit(att, def, move, point)` — `src/game.js:4036` onward — resolves in this order:

1. **Overtime** doubles all damage (`OT_DMG`).
2. **Yuehua's 月镜 parry** intercepts non-projectile, non-ult hits while `parryT > 0` → 95-damage counter.
3. **Blocking** (holding `S` on the ground, not `unblockable`):
   * perfect guard within `0.09 s` of pressing block, or normal guard → guard stamina loss:
     `dmg × 1.5 × √(massRatio) × guardBreakMul / guardStab`;
   * chip damage `guardChip` (6–13 % by hero) still applies;
   * guard break at 0 → 0.85 s rooted hitstun;
   * blockstun `(0.08 + hs × 0.7) × poise`.
4. **Armor** (`armorT > 0`, non-launch/non-unblockable): takes `dmg × 0.75 / defRating`, no hitstun; consumes one armor hit.
5. **Chip-only hits** (`m.chip`): damage without stun.
6. **Combo scaling**: `scale = max(0.35, 1 − scaling × (comboHits − 1))`, `scaling = 0.08` default,
   **0.04 for Leiming**; skipped for `noScale` moves (most ult hits).
7. **Base damage**: `dmg = move.dmg × scale × balDmg(att, move) / defRating`
   * `balDmg` picks `BAL[id].normal`, `.skill`, or `.ult` (ult moves use `.ult`, skills/projectiles from a skill use `.skill`).
8. **Counter hit** (target is in attack/skill startup): ×1.2 (chaos mutation can raise it).
9. **Chaos mutations** may multiply damage.
10. **Mayhem mode** multiplies by `3.8 / 4.5 / 5.2` (normal / skill / ult).
11. **Closing-speed bonus**: if relative approach speed > 320 px/s, up to `+25 %` (`迎锋破阵`).
12. **Passive damage modifiers**:
    * Feiying's 影遁 buff: next non-projectile hit **×1.5** (one use);
    * Zuixian: `×(1 + drunk × 0.005)` → up to **+50 %** at 100 drunk;
    * Gouchen 震魄: `×1.25` for 1.2 s after a hook;
    * Yuxiao: gains a note on each normal attack hit; **Moyu** spends 12 ink to take **−20 %** damage when ink ≥ 25;
    * Lingshuang 枪尖: distance ≥ 142 px → `×1.25` + launch; distance < 72 px → `×0.38`;
    * Zuixian's 20 % dodge at drunk ≥ 50 (in `predictHit`).
13. **Meter**: attacker gains `dmg × 0.18 × meterMul` (0.16 on armored hits), defender gains `dmg × 0.14` (0.08 for projectiles); blocked hits give small flat amounts.

Practical consequences: `stat.dmg` is baked into the move table, `BAL` is a second global layer (strong: Tieshan's is
0.67!), and `defRating` divides incoming damage, so effective toughness = `HP × BAL.hp × defRating`.

---

## 6. Movement, Defense And The Escape

* **Escape / 腾空闪** — right-click or `Left Shift`; cancels hitstun, launches upward with invulnerability until landing
  (`escInvul`) or 1.1 s. Per-hero cooldown `escCD` ranges **7.5 s (Feiying, Lingshuang) to 9.4 s (Gouchen)**.
* **Guard** — hold `S`. Pool `guardMax` 85–115, regeneration 25–32/s (`guardRegen`, after a short delay).
  `guardStab` divides stamina loss; `guardChip` is the % that leaks through.
* **Poise** — multiplies received hitstun (`<1` = sturdier).
* **Weight / mass ratio** — `attacker.weight / defender.weight`, clamped to 0.45–2.5; affects knockback, guard drain,
  hitstun and blade-clash outcomes.
* **Flight** — Yanling holds jump in the air to fly for `ch.fly = 1.1 s` of stamina (gravity off while flying).
* **Extra jumps** — Liuyun has `jumps: 3`.

---

## 7. Multiplayer & Online Services

### 7.1 Serverless P2P (`src/net-p2p.js`)

* PeerJS broker for signalling only; gameplay rides a **WebRTC DataChannel**.
* 4-character room code (`p2pCode()`), host creates `renying-<version>-<code>`, guest joins.
* Matchmaking: `MM` walks a deterministic ladder of “seats” (`mm-<version>-<pool>-<band>-<seat>`) so two strangers find
  each other without a server; ranked bands, probes every 3 s, avoids the same opponent for 10 min.
* Works from GitHub Pages with no backend; blocked on some campus networks.

### 7.2 Dedicated Server (`server.py`, Stdlib Only)

```text
HTTP:  /  /index.html  /renying.html
       /assets/... (js/png/html) and /music/*.mp3
       /health
       /api/register /login /logout /me /leaderboard /posts /post /profile /welfare
       /api/gacha /craft /claim /progress /tutorial /ranklb /skingacha /equip /redeem /qfx
WS:    /ws?create=1 | join=CODE | match=1 | rank=1 | resume=CODE&rt=...   (+ &v=VERSION&t=token)
```

* Hand-rolled RFC 6455 framing (`read_frame`, `frame`, `Peer`), per-peer send queues, heartbeat.
* Rooms: 4-character code, 2 slots, 60 s reconnect grace, `finish_room()` handles forfeits/results.
* Ranked: placement matches, six tiers, rating deltas; both players must be logged in for a rated result.
* Data: SQLite `data/renying.db` — users (salted PBKDF2-SHA256), profiles, matches, posts.
* Also serves quick match, chat/social posts with rate limits, daily/weekly tasks, 问剑阁 gacha, skins.

### 7.3 Cloud Save (`src/cloud.js`)

* Firebase **Auth + Firestore**, config from `window.FIREBASE_CONFIG` or `localStorage`.
* `window.CloudSave` exposes login/register/logout/save/load and a sync state machine:
  `local → idle → pending → syncing → ok / offline / error`, with retry, `pagehide` flush, and a dirty flag so the next
  visit retries.
* Accounts that were local (`local_…`) are migrated up to the cloud on login.
* `firestore.rules` validates starter profiles and per-user documents.

### 7.4 Social (`src/social.js`)

* One “江湖驿站” screen: public hall, friends, DMs, group chats — all over the same PeerJS broker.
* First client to claim the hall slot relays hall chat/presence; another takes over if it leaves.
* Messages to offline friends are queued in `outbox` and delivered when both are online (`未送达` until acked).

### 7.5 Rollback Netcode (`src/game.js:10249`)

* Both peers simulate the full match; only **input bits** cross the wire (`inBits`: left/right/down/atk/jump/aim).
* Default input delay `ROLL.D = 3` frames, 240-frame history, max 40 predicted frames.
* Each frame: capture `capState()` (fighters, both controllers, projectiles, decoys, match state, RNG seed) →
  on a mispredicted input, restore the snapshot and resimulate to the present (`RESIM` suppresses SFX/FX).
* Periodic FNV-1a checksum of rounded state (`hashState`) detects desync.
* `host` (青锋 side) is authoritative for hit resolution when not rolling back (`isClient()` paths do prediction).

---

## 8. Qingfengxing (青锋行) — The Second Game

`src/qfx/` is a standalone three.js action roguelike, concatenated in filename order into one IIFE.
A run is three chapters; each chapter is a seven-row route map (遭遇 / 精锐 / 奇遇 / 剑庐 / 歇脚 / 藏宝 → 首领).
Dying ends the run; 剑魄 and the 藏经阁 upgrades carry over, and clearing a run unlocks the next 劫 (ascension, up to 五劫).

| File | Role |
| :--- | :--- |
| `00-core.js` | Constants, input, fully synthesized audio. |
| `10-gfx.js` | Renderer, post-processing, materials, geometry cache. |
| `12-terrain.js` | Height-map shader patch (off on the three arena maps). |
| `20-world.js` | Map framework + Chapter 1 山门 (training yard). |
| `21-bamboo.js` | Chapter 2 竹林 (bamboo night). |
| `22-tomb.js` | Chapter 3 剑冢 (sword tomb). |
| `30-rig.js` / `31-hero.js` | Procedural rigs (skinned humanoid, weapons, wolf) and the detailed Qingfeng model. |
| `40-fx.js` | Particles, slash arcs, telegraphs, damage numbers. |
| `50-player.js` | Global state, camera, player controller. |
| `55-skills.js` | Skill book: Q/E/R slots + V ultimate, upgrades. |
| `60-enemies.js` / `62-foes.js` | Enemy types, chapter 2–3 foes, boss phases, elite and 劫 scaling. |
| `65-levels.js` | Chapter definitions and the wave spawner for one fight. |
| `68-run.js` | The run: route-map generation, node types, events (奇遇), rare rewards, 劫 rules, run save. |
| `70-game.js` | Orbs, projectiles, growth, boons, 剑庐. |
| `75-meta.js` | Saves (`qfx2`, run in `rl`), 剑魄 currency, permanent upgrades, settings. |
| `80-ui.js`, `85-tutorial.js`, `90-main.js` | UI, six-step tutorial, flow and loop. |

The main game embeds it in an iframe; clearing chapters reports back to `server.py` (`/api/qfx`) for ink and an
exclusive Qingfeng skin (`qf_qfx`).

---

## 9. AI Models & The Tooling That Makes Them

* `models/heroes/<hero>.json` — one policy per hero, architecture **25 → 64 → 32 → 10** (`W1,b1,W2,b2,W3,b3`),
  outputs the 10 actions `idle,left,right,down,jump,atk,skill1,skill2,dash,special`.
  Quantized copies are embedded into the built pages (`window.RENYING_HERO_MODELS`).
* `models/renying_ai_latest.json`, `renying_ai_v1.json`, dated snapshots, `renying_ai_watch2v2.json`,
  `renying_ai_coop_2v2.json` — global / 2v2 / co-op nets.
* In game, the “God” difficulty feeds a 25-dim observation into these nets for macro decisions.

Tooling (`tools/`):

| Tool | Purpose |
| :--- | :--- |
| `build.py` | Build / verify generated pages. |
| `cvc-sim.mjs` | Headless computer-vs-computer VM simulation (~60 k frames/s), dataset generation. |
| `simulate-all.mjs` | Exhaustive multi-mode, all-matchup simulation + meta report + optional publish. |
| `auto-balance.mjs` | Parallel worker tournament that micro-tunes `stat.dmg`, `escCD`, HP against counter windows. |
| `train-policy.mjs`, `train-heroes.mjs`, `auto-train.mjs` | Behavioral cloning / reward-weighted training pipelines. |
| `gamemode-meta.mjs` | Per-mode tier lists. |
| `ui-audit.mjs`, `hud-audit.mjs`, `hud-overlap-audit.mjs`, `touch-audit.mjs` | Headless Chrome layout/legibility/touch gates. |
| `ai-arena.mjs`, `ai-train.mjs` | CPU-vs-CPU win rates (`--a god --b impossible`, `AI_BAL` to try a balance table) and gene training; `--lvkey` trains one difficulty only (`lvGenes` in `models/ai-brain.json`), `--opp` trains against another difficulty. |
| `music/` | Python sources of the nine tracks in `assets/music/` (MIDI → FluidSynth stems → numpy mix → mp3); see `tools/music/readme.md`. |
| `combat-test.mjs` | Per-hero move/state/combo regression suite. |
| `econ-admin.mjs` | Admin CLI for the Worker: look up accounts, adjust ink and items, ban/unban, compensation gifts, live economy values (the same as the Worker's `/admin` page; see `docs/admin.md`). |
| `econ-test.mjs` | Runs the Worker on an emulated D1 and checks the armory economy, anti-cheat and admin backend (`--bundle` tests `cloudflare/worker.bundle.js`). |
| `export_data.py` / `import_data.py` | SQLite → JSON → SQLite migration. |

CI (`ci.yml`) runs: Python syntax check, YAML lint, **lowercase-filename rule**, entrypoint existence,
`build.py --check`, UI/HUD/touch audits, LAN multiplayer test, protocol hardening tests, and a strict commit-message
pattern (`^[a-z]+: [a-z0-9]+ [a-z0-9]+ [a-z0-9]+$`). `pages.yml` publishes the repo root to GitHub Pages.

Game modes present in the code: `cpu` (1v1 vs AI), `net` (PvP), `train` (dummy), `demo`, `replay`, `tower`
(问剑密卷 roguelike), `chaos` (天机乱斗 mutations), `mayhem` (神魔乱斗 10× everything), `tag3` (3v3 车轮战), `watch2v2`
(2v2 AI spectacle), `fixed` (training presets).

Round HP rules: every mode restores both fighters to full HP each round, with two exceptions that carry HP + `CARRY_HEAL`
(80) for the round's survivor:
* Online 1v1 (net rooms, quick match, ranked) uses `BP_DUO_STEPS`: each side bans 1 and picks 2. The first picks fight;
  whoever loses a round swaps in their second pick at full HP. Two round wins end the match, so a side loses once both its
  heroes are down (`M.duo`, `isDuo()`, `duoRelay()` in `08-fighter-match.js`).
* `tag3` (3v3 车轮战) keeps the survivor's HP while the loser sends in the next of three heroes.

Vs-AI matches use `BP_STEPS` (ban 1, pick 1). The home screen's quick fight skips the pick screen entirely and starts with
the home hero against a random opponent (`heroQuickFight()` in `17-home.js`).

---

## 10. Hero Data Model

Each hero is one object in `CHARS` (`src/game.js:261`):

```js
{ id, name, role, diff, escCD, skill, skill2, ult, passive,
  passiveName, passiveDesc,
  stat: { hp, walk, speed, dmg, reach, swing, jump, weight,
          defRating, guardMax, guardStab, guardChip, guardRegen, poise, size },
  meterMul, hitFeel, moveMods, jumps, fly, scaling,
  look: { body, shade, outline, scarf, slash, blade, head, weapon },
  ai: { range: [min, max] }, beats: [...], weakTo: [...] }
```

| Field | Effect |
| :--- | :--- |
| `hp` | Base HP; effective HP = `round(hp × BAL.hp)`. |
| `walk` | × `WALK (280 px/s)`. |
| `speed` | Multiplies **startup and recovery** of every move (lower = faster). |
| `swing` | Multiplies the **active** frames. |
| `dmg` | Multiplies every normal-move damage in the move table. |
| `reach` | Stretches the length of attack boxes. |
| `jump` | Jump velocity multiplier. |
| `weight` | Mass for knockback / guard pressure / clashes. |
| `defRating` | Divides incoming damage. |
| `guardMax/Stab/Chip/Regen` | Guard pool, stability, chip %, regen per second. |
| `poise` | Hitstun multiplier (and blockstun). |
| `size` | Visual/body scale. |
| `meterMul` | Ult-meter gain multiplier. |
| `hitFeel` | Hitstop/impact-flash flavour. |
| `moveMods` | Per-move overrides (`dmgAbs`, `reachMul`, box, `next`, extra moves like Leiming's `l6`). |
| `jumps` / `fly` | Extra air jumps / flight stamina. |
| `scaling` | Combo-scaling step (default 0.08; Leiming 0.04). |
| `ai.range` | Preferred spacing for the CPU. |
| `beats` / `weakTo` | Flavour counter chart (shown in UI; no hidden damage rule). |

### `BAL` — The Global Balance Layer (`src/game.js:242`)

| Hero | normal | skill | ult | cd | hp |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 青锋 Qingfeng | 1.055 | 1.055 | 0.946 | 1.00 | 1.019 |
| 绯影 Feiying | 1.12 | 1.17 | 0.976 | 0.95 | 1.009 |
| 铁山 Tieshan | **0.67** | **0.64** | **0.676** | 1.00 | **0.90** |
| 凌霜 Lingshuang | 1.047 | 1.047 | 0.943 | 1.00 | 1.027 |
| 流云 Liuyun | 1.16 | 1.14 | 0.98 | 0.92 | 1.06 |
| 雷鸣 Leiming | 1.085 | 0.806 | 0.806 | 1.10 | 1.022 |
| 墨羽 Moyu | 1.03 | 1.04 | 0.94 | 0.90 | 1.06 |
| 月华 Yuehua | 1.12 | 1.12 | 1.00 | 1.00 | 1.05 |
| 燕翎 Yanling | 1.08 | 1.08 | 0.94 | 1.00 | 1.08 |
| 玉箫 Yuxiao | 1.10 | 1.10 | 0.93 | 0.92 | 1.06 |
| 醉翁 Zuixian | 1.22 | 1.22 | 0.956 | 0.90 | 1.16 |
| 勾陈 Gouchen | 1.22 | 1.22 | 0.977 | 0.88 | 1.17 |

`cd` multiplies skill cooldowns. The comment above the table says it was “validated over 5 940 high-intensity matches”.

> ⚠️ **Observation:** Tieshan's `hp` multiplier (0.90) makes his effective HP the lowest-but-one in the cast even though
> his raw HP is mid-high, and his 0.67 damage multiplier is far below everyone else. Whatever the auto-balancer was
> optimising, “tank” here is a description of mass (1.32) and guard (115), not of survivability. Worth a second look.

---

## 11. Roster At A Glance

Raw values from `CHARS`; damage numbers are the move-table values (**after** `stat.dmg`, **before** `BAL` and the
defender's `defRating`). `L1 reach` = first light-attack box length in px. `Walk` in px/s.

| Hero | Role | Rarity | Diff | HP (eff.) | Walk | Atk spd | Dmg × | L1 reach | Weight | Guard max/stab/chip | Escape CD |
| :--- | :--- | :--- | :-: | ---: | ---: | :-: | ---: | ---: | ---: | :--- | ---: |
| 青锋 Qingfeng | 游龙剑客 Sword duelist | Starter | 1 | 540 (550) | 286 | 0.96 | 1.145 | 84 | 1.02 | 105 / 1.10 / 9 % | 7.6 s |
| 绯影 Feiying | 暗影刺客 Shadow assassin | Rare | 2 | 520 (525) | 330 | 0.82 | 1.22 | 79 | 0.82 | 95 / 1.05 / 9 % | 7.5 s |
| 铁山 Tieshan | 玄铁重甲 Iron juggernaut | Common | 1 | 510 (**459**) | 230 | 1.25 | 0.91 | 88 | 1.32 | 115 / 1.30 / 8 % | 8.7 s |
| 凌霜 Lingshuang | 寒枪骁将 Frost lancer | Rare | 2 | 520 (534) | 274 | 1.05 | 1.116 | 103 | 1.04 | 110 / 1.20 / 8 % | 7.5 s |
| 流云 Liuyun | 御风散人 Wind wanderer | Rare | 2 | 505 (535) | 322 | 0.85 | 1.19 | 86 | 0.88 | 112 / 1.15 / 7 % | 7.9 s |
| 雷鸣 Leiming | 雷拳武僧 Thunder monk | Common | 1 | 540 (552) | 319 | **0.70** | 0.991 | **67** | 1.22 | 115 / 1.25 / 7 % | 7.8 s |
| 墨羽 Moyu | 泼墨画师 Ink painter | Legend | 3 | 475 (504) | 286 | 0.90 | 1.053 | 93 | 1.04 | 115 / 1.18 / 7 % | 8.6 s |
| 月华 Yuehua | 月镜宗师 Moon mirror | Legend | 3 | 460 (483) | 286 | 0.86 | 1.014 | 84 | 0.92 | 110 / 1.30 / 6 % | 7.9 s |
| 燕翎 Yanling | 御空飞燕 Sky swallow | Legend | 2 | 450 (486) | 308 | 0.86 | 1.068 | 82 | 0.84 | **85 / 0.85 / 13 %** | 8.4 s |
| 玉箫 Yuxiao | 箫音乐师 Flute bard | Legend | 3 | 455 (482) | 291 | 0.88 | 1.012 | 91 | 0.86 | 90 / 0.95 / 12 % | 8.8 s |
| 醉翁 Zuixian | 山水醉翁 Drunken sage | Rare | 3 | 470 (545) | 314 | 0.84 | 0.883 | 76 | 1.15 | 105 / 1.15 / 9 % | 9.0 s |
| 勾陈 Gouchen | 链锤游侠 Chain ranger | Rare | 2 | 450 (527) | 308 | 1.00 | 0.88 | 101 | 0.98 | 100 / 1.00 / 11 % | 9.4 s |

Weapon/rig scale comes from `WEAPON_LEN`: sword 54, dual 40, greatsword 70, spear 88, fan 36, fists 16, brush 66,
moonblade 58, wing 48, flute 50, gourd 16, hammer 56.

### Damage Table (Light Chain, Heavy, Air, Charged, Q/R/E)

| Hero | L1→L5 per-hit | 5-hit total | Heavy (`hv`) | Air (`a1`) | Charge 1 / 2 | Q (cd) | R (cd) | E |
| :--- | :--- | ---: | ---: | ---: | :--- | :--- | :--- | :--- |
| Qingfeng | 16 / 17.2 / 20.6 / 25.2 / 32.1 | 111.1 | 43.5 | 20.6 | 41.2 / 66.4 | 疾风斩 55 (5 s) | 剑气 52 (5 s) | 残月 9 + 6×2.5 + 85 |
| Feiying | 14 / 15 / 17 / 20 / 26 | 92.0 | 46.4 | 22.0 | 43.9 / 70.8 | 影遁 45 (11 s) | 飞镖 4×25 (5 s) | 千影 9 + 9×2.1 + 80 |
| Tieshan | 12.7 / 13.7 / 16.4 / 20 / 25.5 | 88.3 | 34.6 | 16.4 | 32.8 / 52.8 | 震地 40+45 (8 s) | 铁壁冲 56 (7.5 s) | 山崩 140 (+6×35 rocks) |
| Lingshuang | 15.6 / 16.7 / 20.1 / 24.6 / 31.2 | 108.2 | 42.4 | 20.1 | 40.2 / 64.7 | 回马枪 60 (45 on 4th) (6 s) | 枪旋 7×12 + 38 (6 s) | 刹那 140–185 |
| Liuyun | 16.7 / 17.8 / 21.4 / 26.2 / 33.3 | 115.4 | 45.2 | 21.4 | 42.8 / 69 | 风刃 2×28 (**2 s**) | 开扇 5×8 (+24 landing) (4 s) | 龙卷 2×(16, up to 8 hits) |
| Leiming | 19 / 19 / 20 / 20 / 22 | 100.0 | 37.7 | 17.8 | 35.7 / 57.5 | 雷闪 40 (5 s) | 雷踏 48 (4.5 s) | 雷霆万钧 3×48 |
| Moyu | 15 / 15 / 17 / 17 / 22 | 86.0 | 40.0 | 19.0 | 37.9 / 61.1 | 墨阵 35 (5.2 s) | 画符 — (2.5 s) | 符阵 80 + 40/符 (max 280) |
| Yuehua | 14.2 / 15.2 / 18.3 / 22.3 / 28.4 | 98.4 | 38.5 | 18.3 | 36.5 / 58.8 | 月镜 counter 95 (7 s) | 月轮 28 (3.5 s) | 月华如水 75 + 60 heal |
| Yanling | 15 / 16 / 19.2 / 23.5 / 29.9 | 103.6 | 40.6 | 19.2 | 38.4 / 61.9 | 俯冲 46 (4.5 s) | 翎羽 3×22 (2.5 s) | 万羽 14×14 |
| Yuxiao | 14.2 / 15.2 / 18.2 / 22.3 / 28.3 | 98.2 | 38.5 | 18.2 | 36.4 / 58.7 | 清音 22+20/note (3.2 s) | 回音壁 18+8/note (6 s) | 广陵散 6×14 + 60(+15/note) |
| Zuixian | 12.4 / 13.2 / 15.9 / 19.4 / 24.7 | 85.6 | 33.6 | 15.9 | 31.8 / 51.2 | 亭中留客 20 (16 s) | 与民同乐 1 (16 s) | 山水之间 8×15 |
| Gouchen | 12.3 / 13.2 / 15.8 / 19.4 / 24.6 | 85.3 | 33.4 | 15.8 | 31.7 / 51 | 飞锤 18 (5 s) | 旋锤 4×7 + 30 (6 s) | 开天一锤 40 + 80 |

Flurry ults (`crescent`, `shadows`, `eightimm`) all start with a 9-damage dash-in grab, then `n` hits that do
`U.slash` damage each, then a finisher; all are `noScale` and unblockable on the finisher.

---

## 12. Hero-By-Hero Detail

Each card lists: identity, exact stats, passive, and kit with the code's own numbers. “AI spacing” is the CPU's preferred
range. “Beats / weak to” is the in-game counter chart text.

### 12.1 青锋 Qingfeng — 游龙剑客 (Azure Blade)

* **Weapon** sword · **Rarity** starter · **Difficulty** 1 · **AI spacing** 70–170 px · **Beats** Moyu · **Weak to** Yuehua
* **Stats:** HP 540 (550), walk 286, attack-speed 0.96, damage ×1.145, reach ×1.02 (L1 84 px), weight 1.02,
  guard 105/1.10/9 % @30/s, poise 0.95, defense ×1.02, jump 1.0, size 1.00, escape 7.6 s, **meterMul 1.10**.
* **Passive 剑意 (Sword Intent):** builds ult meter 10 % faster (`meterMul 1.10`); the ultimate refunds 20 % meter.
  *(The codex text still says 8 % — see §13.)*
* **Normals:** 16 → 17.2 → 20.6 → 25.2 → 32.1, total **111.1**; heavy 43.5; air 20.6; charge 41.2 / 66.4 (charged L2 unblockable).
* **Q 疾风斩 (Gale Slash)** — 5 s. Iai dash that passes through the opponent; **55** damage, **0.65 s** root,
  then **resets both dash and R cooldown**. Also deletes Moyu's ink traps on the way through.
* **R 剑气 (Sword Qi)** — 5 s. Crescent projectile, **52** damage, **launches** airborne even on a grounded hit.
* **E 残月 (Crescent Moon)** — 9 grab + 6 × 2.5 + **85** finisher (≈109 raw). On hit, resets all skills + dash and
  refunds 20 % meter.
* **Playstyle:** the all-rounder; the reset on Q makes Q → R → Q the core pressure loop. Loses hard to Yuehua's parry.

### 12.2 绯影 Feiying — 暗影刺客 (Crimson Shade)

* **Weapon** dual blades · **Rarity** rare · **Difficulty** 2 · **AI spacing** 60–150 px · **Beats** Liuyun, Lingshuang · **Weak to** Tieshan, Yuehua
* **Stats:** HP 520 (525), walk **330** (fastest), attack-speed **0.82**, damage ×1.22, reach ×0.96 (L1 79 px),
  weight **0.82**, guard 95/1.05/9 % @28/s, poise 1.00, defense ×0.98, jump 1.08, size 0.88, escape 7.5 s.
* **moveMods:** light chain replaced by flat damage: 14 / 15 / 17 / 20 / 26 (already in the table).
* **Passive 身轻 (Featherweight):** purely the statline — fastest walk and startup, smallest body, worst guard stability.
  *(The `passive: 'swift'` tag has no code branch; everything is in `stat`/`moveMods`.)*
* **Normals:** total 92 — the second-lowest raw chain, but the fastest to come out.
* **Q 影遁 (Shadow Step)** — **11 s**. 0.3 s seal (fully vulnerable), then teleports behind the target:
  **45** damage, **0.45 s** stun, and sets `buffT` so the **next hit does ×1.5**.
* **R 飞镖 (Kunai)** — 5 s. Fan of **4 × 25**, no landing lag, pierces light projectiles.
* **E 千影 (Thousand Shadows)** — 9 + 9 × 2.1 + **80** (≈108 raw); on hit resets Q/R and spawns 2 decoys.
* **Playstyle:** glass-cannon hit-and-run. The 0.3 s seal on Q is punishable; the ×1.5 buff is what actually kills.

### 12.3 铁山 Tieshan — 玄铁重甲 (Iron Mountain)

* **Weapon** greatsword · **Rarity** common · **Difficulty** 1 · **AI spacing** 70–160 px · **Beats** Feiying, Leiming · **Weak to** Liuyun, Lingshuang, Yanling
* **Stats:** HP 510 → **459 effective** (BAL hp 0.90), walk **230** (slowest), attack-speed **1.25**, damage ×0.91
  (×0.67 after BAL!), reach ×1.08 (L1 88 px), weight **1.32**, guard **115/1.30/8 %** @28/s, poise 0.90,
  defense ×1.05, jump 0.9, size 1.10, escape 8.7 s.
* **Passive 霸体 (Armor):** heavy/charged attacks (`hv`, `cs1`, `cs2`) grant **1 hit of armor** for startup+active,
  taking 75 % damage with no hitstun; each armored hit refunds 2.5 meter and shaves 0.4 s off both cooldowns.
* **Normals:** total 88.3 raw — but **59.2 after BAL**, by far the lowest in the game; heavy 34.6.
* **Q 震地 (Quake)** — 8 s. 0.28 s armor, then two ground shockwaves (`40` each, ground-only) plus a direct `45`
  that launches; direct hit refunds **15 guard** and **1.5 s** of R cooldown. Whiffed direct slam recovers in 0.48 s (0.40 s on hit).
* **R 铁壁冲 (Iron Wall Charge)** — 7.5 s. 0.38 s armor, dash 620 px/s, wave box up to y −165 (catches grounded and
  low-hop targets; high double-jumps and flyers clear it), **56** damage, ×1.5 guard break, slams airborne targets down.
  Whiff recovery 0.40 s (0.28 s on hit).
* **E 山崩 (Avalanche)** — steerable leap, then **140** unblockable slam (crushes even ground-ult armor) +
  up to 6 rocks × 35. Sweet-spot hit: 0.75 s stun, meter refilled, Q/R reset. The chained second slam deals 65 %
  (91) and refunds +50 % on a sweet-spot hit; edge or knocked-down hits refund only +25 %.
* **Playstyle:** the “wall” is guard + armor + mass, not HP. Needs to land the ult or he loses on damage output.

### 12.4 凌霜 Lingshuang — 寒枪骁将 (Frost Lancer)

* **Weapon** spear (88 px) · **Rarity** rare · **Difficulty** 2 · **AI spacing** 90–185 px · **Beats** Tieshan, Qingfeng · **Weak to** Leiming, Feiying, Yanling
* **Stats:** HP 520 (534), walk 274, attack-speed 1.05, damage ×1.116, reach **×1.28** (L1 **103 px**), weight 1.04,
  guard 110/1.20/8 % @28/s, poise 0.95, defense ×1.02, escape 7.5 s.
* **Passive 枪尖 (Spear Tip):** normal attacks scale with distance —
  **≥142 px: ×1.25 and launch**; **<72 px: ×0.38**. The sweet spot is the whole character.
* **Normals:** 108.2 total (before the tip bonus), heavy 42.4.
* **Q 回马枪 (Backthrust)** — 6 s. Hops backward, then a **235 px** thrust: `60` and launch for hits 1–3;
  the **4th** hit on the same target does `45` but blasts them away (680 knockback) and clears the counter.
  Landing multiplies R's remaining cooldown by 0.5.
* **R 枪旋 (Spear Whirl)** — 6 s. 8 ticks over ~2 s: `12` each, final sweep `38`; destroys incoming projectiles in a
  125 px radius.
* **E 刹那 (Instant)** — freeze-frame, then a **140–185** damage (distance-scaled) unblockable pierce; on hit resets
  Q/R and applies **4 s of 40 % slow**.
* **Playstyle:** spacing control. Weak when rushed — Feiying/Leiming/Yanling all bypass her tip.

### 12.5 流云 Liuyun — 御风散人 (Wandering Wind)

* **Weapon** fan · **Rarity** rare · **Difficulty** 2 · **AI spacing** **180–360 px** · **Beats** Tieshan, Yuehua, Yanling · **Weak to** Leiming, Feiying
* **Stats:** HP 505 (535), walk 322, attack-speed 0.85, damage ×1.19, reach ×1.06 (L1 86 px), weight 0.88,
  guard 112/1.15/7 % @32/s, poise 0.95, defense ×1.02, jump 1.08, **3 jumps**, escape 7.9 s.
* **Passive 御风 (Windrider):** triple jump (`jumps: 3`) plus the aerial dive on R.
* **Normals:** **115.4 total — the highest raw chain in the game** (133.9 after BAL), heavy 45.2.
* **Q 风刃 (Wind Blade)** — **2 s**. Two projectiles (up/down) × **28**, almost no recovery, 360 knockback;
  clears kunai/darts on contact.
* **R 开扇 (Open Fan)** — 4 s. Dash ~270 px scattering **5 popcorn** (8 each, 0.5 s fuse);
  in the air it becomes a diagonal dive with a landing burst (**24**, launches) and 5 more popcorn.
* **E 龙卷 (Tornado)** — two tornadoes, `16` per tick, re-hit every 0.12 s up to 8 hits each; resets Q/R and jumps.
* **Playstyle:** the zoner. Keep 200+ px, chip with Q (2 s cooldown!), punish jumps with tornadoes. Dies instantly if
  Leiming or Feiying gets in.

### 12.6 雷鸣 Leiming — 雷拳武僧 (Thunder Monk)

* **Weapon** fists · **Rarity** common · **Difficulty** 1 · **AI spacing** 45–120 px · **Beats** Liuyun, Lingshuang · **Weak to** Tieshan, Yuehua
* **Stats:** HP 540 (552 — highest effective), walk 319, attack-speed **0.70** (fastest), damage ×0.991 (×1.085 after BAL),
  reach **×0.8** (L1 **67 px**, shortest), weight 1.22, guard 115/1.25/7 % @32/s, poise 0.90, defense ×1.02,
  size 1.05, escape 7.8 s, **combo scaling 0.04** (least damage falloff).
* **Passive 连环 (Chain):** six-hit light string — `moveMods` adds an `l6` finisher (32 damage, launch) and reduces the
  combo-scaling penalty to 0.04.
* **Normals:** 19 / 19 / 20 / 20 / 22 = 100, then L6 32 → a full string is 132.
* **Q 雷闪 (Thunder Flash)** — 5 s. Ground dash punch, `40`, 0.38 s stun, 0.28 s armor on startup; hit cuts 2 s off R.
* **R 雷踏 (Thunder Stomp)** — 4.5 s. Bolt pillar 85 × 420 px, `48`, launch.
* **E 雷霆万钧 (Thunder Wrath)** — 3 strikes × `48` (144), resets Q/R and refunds **30 %** meter immediately.
* **Playstyle:** pressure monster. Six-hit strings with low scaling, but 67 px reach means he must walk through
  projectiles — Feiying and Liuyun exist specifically to punish that.

### 12.7 墨羽 Moyu — 泼墨画师 (Ink Painter)

* **Weapon** brush · **Rarity** legend · **Difficulty** 3 · **AI spacing** 140–290 px · **Beats** Tieshan, Qingfeng · **Weak to** Feiying, Leiming
* **Stats:** HP 475 (504), walk 286, attack-speed 0.90, damage ×1.053, reach ×1.15 (L1 93 px), weight 1.04,
  guard 115/1.18/7 % @32/s, poise 0.92, defense ×1.02, size 1.00, escape 8.6 s.
* **Resources:** ink 100, +10/s, 15 per thrown blob; **every light attack also lobs a blob** (24 damage) if ink allows.
  **Ink Barrier:** while ink ≥ 25, taking a hit > 8 damage spends 12 ink and cuts that hit by **20 %**.
* **Normals:** 86 total (88.6 after BAL) plus blob damage; heavy 40.
* **Q 墨阵 (Ink Trap)** — 5.2 s. Paints a 115 px pool: **35** damage, 0.48 s root, then 2.8 s slow; press Q again to detonate.
* **R 画符 (Talisman)** — 2.5 s. Spends 3 ink per talisman, max 5, no direct damage — fuel for the ult.
* **E 符阵 (Talisman Array)** — `80 + 40 × talismans` (**80–280**), unblockable, whole-screen, launches.
* **Playstyle:** setup zoner with the highest ceiling. Without talismans the ult is nearly worthless; with five it deletes
  half a health bar.

### 12.8 月华 Yuehua — 月镜宗师 (Moon Mirror)

* **Weapon** moon blade · **Rarity** legend · **Difficulty** 3 · **AI spacing** 80–180 px · **Beats** Leiming, Feiying, Qingfeng, Yanling · **Weak to** Liuyun, Moyu
* **Stats:** HP 460 (483), walk 286, attack-speed 0.86, damage ×1.014 (1.12 after BAL), reach ×1.02 (L1 84 px),
  weight 0.92, guard 110/**1.30**/6 % @32/s, poise 0.90, defense **×1.06**, size 0.96, escape 7.9 s.
* **Passive 月华 (Moonlight):** out-of-combat regeneration — 3 s after the last hit taken it heals **1.6 HP/s**,
  spending a 20 s `regenLeft` budget (≈32 HP per round).
* **Normals:** 98.4 total, heavy 38.5.
* **Q 月镜 (Moon Mirror)** — 7 s. 0.45 s parry stance that **negates any non-projectile, non-ult hit** and answers with
  `COUNTER` = **95 damage, 1.05 s stun, unblockable, launch**; also blocks the target's escape for 0.75 s.
* **R 月轮 (Moon Wheel)** — 3.5 s. Boomerang, `28` per pass, 2 hits; the returning pass is the punish (0.78 s stagger as designed).
* **E 月华如水 (Moonflow)** — heals **60**, deals **75** in a 260 px radius, and grants 4 s of 3-hit armor; resets Q/R.
* **Playstyle:** the anti-rush character. Every melee opener is a coin flip against the parry; zoners (Liuyun, Moyu)
  beat him because their damage never triggers it.

### 12.9 燕翎 Yanling — 御空飞燕 (Sky Swallow)

* **Weapon** wing blade · **Rarity** legend · **Difficulty** 2 · **AI spacing** 80–190 px · **Beats** Tieshan, Lingshuang · **Weak to** Liuyun, Yuehua
* **Stats:** HP 450 (486 — tied-lowest raw HP), walk 308, attack-speed 0.86, damage ×1.068, reach ×1.00 (L1 82 px),
  weight 0.84, guard **85/0.85/13 %** @25/s (worst defense), poise 1.05, defense ×0.95, jump 1.05, size 0.95, escape 8.4 s.
* **Passive 御空 (Skyborne):** hold jump in the air to **fly for 1.1 s** of stamina (gravity off, free horizontal control);
  many ground attacks (`groundOnly` projectiles, quakes) miss her entirely while airborne.
* **Normals:** 103.6 total, heavy 40.6.
* **Q 俯冲 (Dive)** — 4.5 s. Diagonal dive: `46`, 0.40 s pin. **Airborne use refunds the cooldown once** (`diveChained`).
* **R 翎羽 (Feathers)** — 2.5 s. 3 piercing feathers × `22`, no launch, near-zero recovery.
* **E 万羽 (Feather Storm)** — 14 feathers × `14` (196 total), resets Q/R and refills flight stamina.
* **Playstyle:** the only true air character. Ground-only attacks whiff, but her guard is paper and any launch ends her.

### 12.10 玉箫 Yuxiao — 箫音乐师 (Flute Bard)

* **Weapon** flute · **Rarity** legend · **Difficulty** 3 · **AI spacing** 110–280 px · **Beats** Tieshan, Moyu · **Weak to** Feiying, Leiming
* **Stats:** HP 455 (482), walk 291, attack-speed 0.88, damage ×1.012 (1.10 after BAL), reach ×1.12 (L1 91 px),
  weight 0.86, guard 90/0.95/12 % @27/s, poise 1.00, defense ×0.98, size 0.96, escape 8.8 s.
* **Passive 宫商 (Harmony):** max 3 **notes**. Each normal-attack hit adds one; idle time adds one every **2.5 s**.
  Q consumes all notes.
* **Normals:** 98.2 total, heavy 38.5.
* **Q 清音 (Pure Note)** — 3.2 s. Wave damage `22 + 20 × notes` (**22 / 42 / 62 / 82**), growing size and speed;
  at 3 notes it is **unblockable, piercing and launches**, and applies **2.2 s slow**.
* **R 回音壁 (Echo Wall)** — 6 s. 0.6 s window: knocks nearby enemies away (`18 + 8 × notes`), **reflects incoming
  projectiles** back as yours (each reflect grants a note); one hit of armor on startup. Ults and ground traps can't be reflected.
* **E 广陵散 (Guangling San)** — 6 blades × `14` + a finisher of `60 + 15 × notes` (144–189), unblockable; refills notes
  and resets Q.
* **Playstyle:** the “loaded gun” zoner. Playing with 0 notes is a bad Q; the skill is counting 2.5 s windows.

### 12.11 醉翁 Zuixian — 山水醉翁 (Drunken Sage)

* **Weapon** gourd · **Rarity** rare · **Difficulty** 3 · **AI spacing** 50–140 px · **Beats** Lingshuang, Yuehua · **Weak to** Liuyun, Moyu
* **Stats:** HP 470 (545 after BAL hp 1.16 — the highest effective HP), walk 314, attack-speed 0.84, damage ×0.883
  (×1.22 after BAL), reach ×0.92 (L1 76 px), weight 1.15, guard 105/1.15/9 % @30/s, poise 0.92, size 1.02, escape 9.0 s.
* **Passive 酒 (Drunk):** 0–100, decays 1/s. **Every skill adds +30**, each landed non-ult hit adds +4;
  damage scales `×(1 + drunk × 0.005)` → **+50 % at 100**; at drunk ≥ 50 he has a **20 % chance to slip any
  non-ult melee hit** (spending 10 drunk). It only decays with time (1 point per second); being hit does not remove it.
* **Normals:** 85.6 total raw (lowest), but ×1.22 BAL and up to +50 % drunk → ~reach 104-156 effective; heavy 33.6.
* **Q 亭中留客 (Pavilion Guest)** — **16 s**. Drops a pavilion (≈720 px range, 0.35 s delay): **20** damage and
  **1.5 s jail** — the victim cannot move or escape but can be hit freely (jail removes launch).
* **R 与民同乐 (Drink Together)** — **16 s**, needs drunk ≥ 50. Throws a bottle: opponent heals **50** but is rooted and
  stunned **1.5 s**; Zuixian heals **80** at 0.35 s into the animation (which runs to 1.05 s). Drunk resets to 0.
* **E 山水之间 (Mountains and Rivers)** — 8 × `15` = **120** unblockable, unavoidable damage; then the victim is
  blinded (painted-over screen) for **2 s**.
* **Playstyle:** resource snowball. Drunk → bigger hits → more drunk. Both Q and R have 16 s cooldowns, so he lives or
  dies on one setup.

### 12.12 勾陈 Gouchen — 链锤游侠 (Chain Ranger)

* **Weapon** chain hammer · **Rarity** rare · **Difficulty** 2 · **AI spacing** 120–260 px · **Beats** Yanling, Feiying · **Weak to** Tieshan, Yuehua
* **Stats:** HP 450 (527), walk 308, attack-speed 1.00, damage ×0.88 (×1.22 after BAL), reach **×1.25** (L1 **101 px**),
  weight 0.98, guard 100/1.00/11 % @28/s, poise 1.00, defense ×1.00, size 1.00, escape **9.4 s** (longest).
* **Passive 震魄 (Soul Shake):** a target hit by the hook (Q) or the ult's re-hammer takes **+25 % damage for 1.2 s**.
* **Normals:** 85.3 total raw (≈104 after BAL), heavy 33.4, but the chain gives him 101 px of light-attack reach.
* **Q 飞锤 (Flying Hammer)** — 5 s. ~420 px chain: `18`, **pulls the target to you**, applies 震魄. Blocked or armored
  hits don't pull.
* **R 旋锤 (Whirl)** — 6 s. Spins ~1 s, radius 150 px: 4 × `7` then a `30` launch; destroys projectiles while spinning.
* **E 开天一锤 (Sky Splitter)** — giant hammer from above: `40` unblockable + 1.2 s root, then a `80` launch pull-in
  (**120 total**), resets Q and applies 震魄 again.
* **Playstyle:** mid-range grappler. The hook converts any hit into a full combo, but Tieshan's armor ignores the pull and
  Yuehua's parry eats the approach.

---

## 13. Inconsistencies And Dead Content Found While Reading

These are worth knowing before you touch balance or the codex UI:

1. **`readme.md` says “Nine characters”** and `src/game.js`'s header comment says “8 个角色”; `CHARS` actually has **12**.
2. **Stale HP in `passiveDesc`:** Feiying says 470 (actual 520), Tieshan says 530 (actual 510), Leiming says 520
   (actual 540), Yuehua says 460 (actual 460 ✓), Yuxiao says 455 ✓. The codex numbers come from `stat.hp`, so only the
   prose is wrong.
3. **Qingfeng's meter passive** is described as “+8 % (meterMul 1.08)” in the codex string, but `CHARS` sets
   `meterMul: 1.10` (and `PASSIVE_SHORT` also says 8 %).
4. **Feiying's 影遁 text** says the next hit gains **+30 %**, the implementation multiplies by **1.5** (`dmg *= 1.5`).
5. **`HERO_HIT_DETAILS`** (`src/game.js:7976`) is a hand-written marketing table whose numbers do not match the engine —
   e.g. Qingfeng light chain “27 (5段)” vs 111.1 actual; Yuehua ult “10 (+12)” vs 75 + 60 heal.
   Use `CHAR_MOVES` as truth. Meanwhile the codex **stat bars** (`statRows`) are correct.
6. **`HERO_MOVE_SEQS`** and `SKILL_FUN` are animation/voice-line data — harmless, but they encode some of the same stale
   move names.
7. **Two unused ultimates:** `phoenix` (百鸟朝凤, Lingshuang's old kit) and `eightimm` (八仙过海, Zuixian's flurry) are
   fully implemented in `ULTS` and referenced by the AI ult table, but **no hero has `ult: 'phoenix'` or `'eightimm'`**.
8. **`PASSIVE_SHORT`** still says “脆皮(88血)” for Feiying and “气血冠绝(140血)” for Tieshan — pre-rework numbers.
9. **Tieshan's BAL** (0.67 damage / 0.90 HP) makes the “tank” the lowest effective-HP and lowest-DPS hero. If that was
   intentional (mass + guard + armor compensation), fine; if not, the auto-balancer overshot.
10. **`export.py`** hard-codes `/opt/renying/data/renying.db` and a `~ubuntu` home, i.e. it targets the legacy VPS, while
    `tools/export_data.py` is the portable one.

---

## 14. Where To Change What

| Task | File / location |
| :--- | :--- |
| Tweak a hero's raw stats | that hero's file in `src/data/heroes/`, `char.stat` block |
| Global damage/HP/cooldown tuning | that hero's file in `src/data/heroes/`, `bal` block |
| Change a normal attack's frames/damage | `MOVES` — `src/game/02-heroes.js` (global) or `moveMods` (per hero) |
| Change a Q/R ability | `SKILLS` — `src/game/03-skills.js` |
| Change an ultimate | `ULTS` — `src/game/04-ults.js` |
| Change reach/hitbox | move `box` + `stat.reach` (and `reachMul` in `moveMods`) |
| Add a hero | a new file in `src/data/heroes/` + `SKILLS`/`ULTS` entries + `SKINS`/`CHAR_RARITY` + pose data |
| Add a skin | `SKINS` — `src/game/19-progress.js` (plus `SCENES` there for legendary sky/FX; drawing in `13-skins.js`–`15-skin-weapons.js`) |
| English translation of a UI string | `UI_COPY_EN` — `src/data/30-ui-copy.js` (numbered sentences: `PATTERNS_EN` in `src/i18n.js`) |
| UI copy / numbers shown in codex | `statRows`, `HERO_HIT_DETAILS`, `PASSIVE_SHORT` — `src/game/18-codex.js` |
| Netcode | rollback in `src/game/20-tutorial-rollback-touch.js`, shared net code in `06-input-net.js`, transport in `src/net-p2p.js` |
| Server features | `server.py` (`routes` dict at ~1200) |
| Cloud save | `src/cloud.js`, `firestore.rules` |
| Mini-game | `src/qfx/NN-*.js` + `src/qfx/page.html` |
| Build/packaging | `tools/build.py`, `src/page.html` markers |

After changes: `python3 tools/build.py`, then run the relevant audit (`node tools/ui-audit.mjs`, `hud-audit`,
`touch-audit`, `combat-test.mjs`) and commit sources **with** the regenerated pages.

---

## 15. Quick Reference: One-Screen Hero Cheat Sheet

| Hero | One-line game plan | Signature threat |
| :--- | :--- | :--- |
| Qingfeng | Balanced pressure, Q→R→Q loops | 0.65 s root + full cooldown reset |
| Feiying | Teleport behind, one ×1.5 hit | 11 s blink with 45 + stun |
| Tieshan | Armor through, land the slam | 185 unblockable, meter refund |
| Lingshuang | Hold 142–235 px, punish with tip | 25 % tip damage + launch, 4-hit juggle |
| Liuyun | Kite at 300 px, 3 jumps | 2 s cooldown twin wind blades |
| Leiming | Walk them down, six-hit strings | 3 × 48 lightning + 30 % meter back |
| Moyu | Trap, paint 5 talismans, nuke | 280-damage screen-wide ult |
| Yuehua | Parry everything melee | 95-damage unstoppable counter |
| Yanling | Live in the air, dive reset | Flight immune to ground attacks |
| Yuxiao | Bank 3 notes, then unblockable wave | 82 damage + slow + launch |
| Zuixian | Build drunk, jail with pavilion | up to +50 % damage, 1.5 s jail |
| Gouchen | Hook into full combo | pull + 25 % damage amp for 1.2 s |
