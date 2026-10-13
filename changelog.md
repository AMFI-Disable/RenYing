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

### Improved

- Auto-facing mechanics when blocking against cross-ups, aerial dives, and back-attacks.
- Guard input buffering during neutral, walking, landing, and wake-up states.
- Reversal counter-attack buffering out of blockstun and wake-up getup.
- Opponent tracking stability with cross-up deadzone to eliminate rapid sprite jittering.
- Projectile deflection reward system granting meter gain on successful weapon parries.

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
