# Changelog

All notable changes, features, and architectural capabilities of this project are documented in this file.

---

## [Unreleased]

### Added

- Initial codebase setup for Ren Ying (刃影) martial arts duel game.
- WebRTC Peer-to-Peer serverless multiplayer support for GitHub Pages deployment.
- Real-time WebSocket matchmaking server with rooms, ladder ranking, and community hub.
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

- Auto-facing mechanics when blocking against cross-ups, aerial dives, and back-attacks.
- Guard input buffering during neutral, walking, landing, and wake-up states.
- Reversal counter-attack buffering out of blockstun and wake-up getup.
- Opponent tracking stability with cross-up deadzone to eliminate rapid sprite jittering.
- Projectile deflection reward system granting meter gain on successful weapon parries.

### Changed

- `index.html` is now the single online edition for GitHub Pages and `server.py`; `renying.html` redirects to it.
- Background music moved out of the online page into `assets/music/`, shrinking `index.html` from 6.5 MB to 1.5 MB.
- PeerJS loads only when a direct room is created or joined.
- The online screen on GitHub Pages leads with direct rooms; the server address field moved into an optional section that reveals quick match and ranked play when filled.
- `server.py` serves `index.html`, `assets/music/`, and other whitelisted assets.
- Updated developer and creator attribution to Luffy & Opus 5.5 across all game clients, UI screens, server, and documentation.

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
