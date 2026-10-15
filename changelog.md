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

- **Hero Max HP Archetype Rebalance**:
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
