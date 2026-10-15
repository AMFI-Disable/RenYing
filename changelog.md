# Changelog

All notable changes, features, and architectural capabilities of this project are documented in this file.

---

## [Unreleased]

### Added

- Initial codebase setup for Ren Ying (刃影) martial arts duel game.
- WebRTC Peer-to-Peer serverless multiplayer support for GitHub Pages deployment.
- Real-time WebSocket matchmaking server with rooms, ladder ranking, and community hub.
- Character unlocking progression on GitHub Pages: Qing Feng as the starter hero, 10 online P2P match wins to unlock a basic hero (Tie Shan or Lei Ming), and deterministic weekly free hero rotation.
- Dev Redeem Code (`DEV`, `DEVALL`, `RENYINGDEV`, `UNLOCKALL`) unlocking all characters, skins, and stages for the active window session without polluting the permanent cloud profile or localStorage; all characters automatically re-lock upon closing and opening a new window.
- In-game currency (墨锭 / Ink) economy with client-side 问剑阁 (Wen Jian Pavilion) gacha summoning and fragment crafting on GitHub Pages.
- Cloud save and single-account synchronization using Google Firebase Auth and Cloud Firestore, with seamless offline local storage fallback.
- Production-grade Cloud Firestore security rules (`firestore.rules`) enforcing user-isolated document access and schema validation.
- Standalone offline edition and character skin assets.
- Official workspace repository migration to AMFI-Disable/RenYing.
- Single source tree (`src/`, `assets/`) with `tools/build.py` generating the online and offline pages, plus a `--check` mode used by CI.
- Version handshake for direct (P2P) rooms so mismatched game versions are rejected with a clear message.
- Optional `window.RENYING_P2P` override for self-hosted PeerJS signaling servers.
- Heartbeat for direct rooms: a silent opponent is dropped after 20 seconds instead of stalling the match.
- Dual-mode network switcher with segmented UI: LAN / Local Server (offline-friendly) vs WebRTC Direct Connect (public internet).
- In-browser connection diagnostic tool: real-time latency ping (ms) and online player count against `/health`.
- One-click room code and direct join link copying with visual feedback and cross-environment clipboard fallback.
- Domestic low-latency STUN servers (Tencent QQ, Xiaomi) for faster WebRTC NAT traversal.
- Server startup auto-detection of local and LAN Wi-Fi URLs with clear console guide.
- Full CORS header injection and OPTIONS preflight handling across all HTTP endpoints in `server.py`.

### Improved

- **Hero Skill Overhaul & Differentiated Control Profiles (Stun, Launch & Spatial Dynamics)**:
  - Thoroughly rebalanced and enhanced all 18 hero skills (Q skills and Right-click skills across all 9 heroes) with differentiated crowd-control, stun durations, hitboxes, and tactical properties:
  - **Full Stun / Lock-Down Skills**:
    - **Fei Ying (影遁)**: Cross ambush strikes vital acupoints, inflicting **0.80s Acupoint Paralysis Stun (`⚡ 封脉定身`)**, providing guaranteed setup for her +50% empowered strike.
    - **Lei Ming (雷闪)**: High-voltage lightning fist dash inflicts **0.82s Electric Shock Paralysis (`⚡ 触电麻痹`)**, locking the opponent in electrical convulsions to set up his 10-hit flurry.
    - **Mo Yu (墨阵)**: Ink trap pool expanded to **125px width**, inflicting **1.4s Full Entrapment Root (`深墨禁锢`)**, completely anchoring enemies to the ground.
    - **Yue Hua (月镜 · 太阴绝罚)**: Riposte counter-slash buffed to 14 damage, **1.05s hard stun**, and imposes a **0.75s escape lock (`禁身锁定`)**, preventing opponents from breaking out.
    - **Tie Shan (震地 & 铁壁冲)**: Quake shockwave radius expanded by 35% with 0.35s hyper armor and **0.85s heavy concussion stun (`💥 撼地重震`)**; Iron Wall shoulder tackle hitbox widened, inflicting **0.75s daze stun (`💥 崩山破势`)** and double Guard Posture damage against blocking targets.
    - **Yan Ling (俯冲)**: Talon divebomb inflicts **0.78s Ground Pin Stun (`鹰击钉地`)**, pinning targets into the floor and rebounding Yan Ling upward to reset flight.
    - **Ling Shuang (回马枪)**: Spear reach extended to 235px; spear tip sweetspot inflicts **0.85s Impale Stun (`枪尖穿心`)** and heavy skyward launch.
  - **Zero / Low-Stun Rapid Harass & Pushback Skills**:
    - **Fei Ying (飞镖)**: Fires 4 rapid shuriken in a wide fan with **no full stun and no launch (`launch: false, stun: 0.16s`)**, functioning as a pure neutral interrupt tool.
    - **Yan Ling (翎羽)**: Fires 3 razor-sharp piercing feathers in tight formation with **no launch and no long stun (`launch: false, stun: 0.20s`)**, continuously chipping and interrupting from screen-wide range.
    - **Liu Yun (风刃 & 风遁)**: Windblade enlarged to 72x62 with **no long stun (`stun: 0.22s`) but massive pushback (`620px knockback`)**; Windstep backflip releases a **0.42s Gale Repulsion shockwave (`🌪️ 惊风退敌`)** repelling adjacent enemies.
    - **Ling Shuang (枪旋)**: Spinning swings 1-7 deal **no hard stun (`stun: 0.12s`)** while deflecting projectiles within 125px; the 8th final sweep delivers a **huge radial clear (10 dmg, 0.65s stun, launch: true)**.
  - **Spatial AOE, Giant Projectiles & Trajectory Crossups**:
    - **Qing Feng (剑气 & 疾风斩)**: Sword Qi wave enlarged to 92x96 with **direct vertical sky launch (`launch: true, kb: [180, -700]`)** without ground stun; Gale slash hitbox extended with **0.65s Iai Stun (`居合斩穴`)** and instant dash cooldown reset.
    - **Lei Ming (雷踏)**: Thunder pillar enlarged to 100px width and 460px height with **vertical skyward launch (`kb: [0, -840]`, 0.65s stun)**.
    - **Mo Yu (泼墨)**: Ink blob enlarged to 50x50; impact inflicts **0.65s stun and 2.5s ink blindness/slow debuff (`墨迹遮目`)**.
    - **Yue Hua (月轮)**: Crescent blade enlarged to 56x56; forward trip deals light 0.25s flinch without launch; **return trip from behind inflicts 0.78s Back-Hit Daze Stun (`背袭破防`)** and flips enemy facing direction, shattering turtle block.
- **Stature Advantage, Physical Attributes & Guard Posture System**:
  - Expanded all 9 heroes with comprehensive realistic physical and defensive attributes: `weight` (mass & knockback inertia), `defRating` (armor absorption), `guardMax` (posture stamina), `guardStab` (stability divider), `guardChip` (chip damage fraction), `guardRegen` (recovery rate), `poise` (hitstun reduction), and `size` (collision scale).
  - Heavy titans and veteran masters (e.g., Tie Shan at 1.65 mass, Lei Ming at 1.30 mass) exert kinetic mass suppression (`massRatio`) over lighter/smaller heroes (e.g., Fei Ying at 0.72 mass).
  - Implemented the **Guard Posture & Guard Break (💥 破防崩势)** mechanic: holding block against heavy strikes depletes guard posture; small heroes with fragile guard (70) and low stability (0.7) risk shattering in 2-3 heavy hits, compelling them to leverage speed, spacing, and backstabs rather than facetanking.
  - Added dynamic real-time Guard Posture bars to the in-game HUD with multi-stage color warnings and break alerts.
  - Expanded Codex attribute rows to showcase weight class, defense rating, guard posture, stability, chip damage, and poise.
- **Elimination of Settings Downgrades & Best Quality Defaults**:
  - Completely eliminated optimized/downgraded defaults: removed the `auto` resolution cap (formerly capping render buffer at 2.6M pixels) and removed mobile initialization downscaling in the touch handler.
  - Default settings now initialize to the absolute highest quality and unlimited refresh rate: `quality: 'high'` (100% native HiDPI/Retina pixel resolution), `fps: 0` (unlimited refresh rate matching 120Hz/144Hz/240Hz/ProMotion displays), `bloom: 1.6` (high bloom), `blur: true`, and full sound fidelity.
  - Existing local storage configs automatically migrate legacy `auto` modes up to `high`.
  - Significantly buffed Tie Shan (`tieshan`) from 103 to 140 Max HP, with increased walk speed (0.84) and attack damage (1.12), firmly establishing his role as the premier heavy-armor tank.
  - Rebalanced the entire character roster's HP based on weight class and agility: Lei Ming (118), Qing Feng (105), Ling Shuang (100), Liu Yun (92), Yan Ling (90), Mo Yu (90), Fei Ying (88), and Yue Hua (88).
  - Updated Codex stat progress bar scale ceiling to 150 HP for clean UI representation.
- **Tie Shan's Avalanche (山崩) Ult Recharged & Stun**:
  - Direct hits with Tie Shan's Avalanche slam now instantly refund 50% Ult meter, refresh both skill cooldowns (Quake and Iron Wall), and inflict a 1.3-second heavy concussion stun on the opponent.
- **Unique Ultimate Specialties for All 9 Heroes**:
  - **Qing Feng (残月)**: Final strike refreshes all skill and dash cooldowns and refunds +20% Ult meter (`剑气归元`).
  - **Fei Ying (千影)**: Final strike refreshes all skill and dash cooldowns and spawns two decoy clones enveloped in smoke screens (`影遁无形`).
  - **Tie Shan (山崩)**: Direct hit inflicts 1.3s stun, refunds 50% Ult meter, and resets all skill cooldowns (`怒意回涌`).
  - **Ling Shuang (刹那)**: Direct spear hit refreshes all skill cooldowns and inflicts a 4.0s frost chill slow reducing enemy movement speed by 40% (`寒芒贯日 · 冰冻减速`).
  - **Liu Yun (龙卷)**: Casting refreshes all skill cooldowns and resets jump count to 0, granting immediate aerial mobility (`扶摇万里 · 风遁重置`).
  - **Lei Ming (雷霆万钧)**: Casting refreshes all skill cooldowns and refunds +30% Ult meter directly (`雷帝灌顶 · 拳劲重置`).
  - **Mo Yu (墨龙)**: Casting refills ink meter to 100%, refreshes all skill cooldowns, and places a tracking ink trap beneath the opponent's feet (`笔意长存 · 墨韵回满`).
  - **Yan Ling (万羽)**: Casting refreshes all skill cooldowns and restores full flight stamina (`凌霄破虚 · 俯冲重置`).
  - **Yue Hua (月华如水)**: Heals 22 HP, refreshes all skill cooldowns, and grants 4 seconds of super armor with 3 hits absorption (`太阴化生 · 月魄霸体`).
- Tie Shan's Avalanche (山崩) ultimate is now fully steerable during the airborne leap, allowing horizontal directional steering (A/D / arrows) and fast-plunge slam acceleration (S / down), with spark trails and intelligent AI airborne tracking.
- Character-specific skeletal animation poses: 22 bespoke joint poses across all 9 fighters for skills, ultimate charges, flurry attacks, and finishers.
- Mechanic-driven 克制 (Counter / Matchup Advantage) system without flat stat debuffs:
  - Ground tremors and shockwaves naturally bypass airborne and flying fighters (Yan Ling, Liu Yun).
  - Qing Feng's Gale dash slices through and purges Mo Yu's Ink Traps on contact.
  - Ling Shuang's Spin deflects incoming non-unbreakable projectiles.
  - Tie Shan's Hyper Armor absorbs incoming kinetic impacts, restoring skill cooldowns and meter when struck by rapid multi-hit attacks.
  - Ling Shuang spear tip sweetspot system: +25% bonus damage and heavy launch at max reach (>155px), reduced to 38% damage inside (<72px).
  - Yue Hua's Mirror parry counter applies an escape lock, guaranteeing punish execution against mashing.
- Hero damage profile and escape balance spectrum (easy to escape vs hard to escape):
  - Individualized escape cooldowns (`escCD` from 7.0s for heavy armor to 9.5s for fragile assassins).
  - Multi-hit combos (e.g., Lei Ming's 10-hit chain) leave clear escape gaps between punches, while high-commitment punish skills enforce tight escape windows.
- Auto-facing mechanics when blocking against cross-ups, aerial dives, and back-attacks.
- Guard input buffering during neutral, walking, landing, and wake-up states.
- Reversal counter-attack buffering out of blockstun and wake-up getup.
- Opponent tracking stability with cross-up deadzone to eliminate rapid sprite jittering.
- Projectile deflection reward system granting meter gain on successful weapon parries.

### Changed

- `index.html` is now the single online edition for GitHub Pages and `server.py`; `renying.html` redirects to it.
- Background music moved out of the online page into `assets/music/`, shrinking `index.html` from 6.5 MB to 1.6 MB.
- PeerJS (`assets/peerjs.min.js`) bundled directly into `index.html` to eliminate external script downloads and latency on slow networks.
- WebRTC P2P connection timeouts extended to 45 seconds with staged status messages for high-latency networks.
- Static hosting (GitHub Pages) automatically defaults to P2P direct connect, preventing unintended fallbacks to local `server.py`.
- The online screen on GitHub Pages leads with direct rooms; the server address field moved into an optional section that reveals quick match and ranked play when filled.
- `server.py` serves `index.html`, `assets/music/`, and other whitelisted assets.
- Updated developer and creator attribution to Even, Luffy, and Opus 5.5 across all game clients, UI screens, server, and documentation.

### Fixed

- Creating a direct room on GitHub Pages crashed before showing the room code.
- Players joining a direct room were assigned an unknown role, so character select never appeared on their side.
- Late events from an old direct connection could close a newly created room.
- Opponent names from direct rooms are sanitized before being shown, and system messages from the peer are whitelisted.
- A waiting host keeps the same room code when the PeerJS signaling connection drops.
- Starting a single-player match closes a waiting room, so a late joiner can no longer pull the player into character select.

---

## [1.0.0] - Production Release (Inaugural Release)

Inaugural release of Ren Ying (刃影), an ink-wash martial arts action duel game.

### Added

- **Core Engine**: High-performance HTML5 Canvas ink-wash fighting physics and animation engine.
- **Multiplayer Server**: Standalone Python server with WebSocket matchmaking, room codes, rankings, and replay storage.
- **Offline Edition**: Standalone bundled offline game client with embedded audio and full character roster.
- **Game Modes**: 1v1 duel, training mode, ladder matchmaking, and Qingfengxing survival mini-game.

### Security

- Enforced local-first execution, salted password hashing, and clean zero-telemetry architecture.
