# ⚔ RenYing

<div align="center">

<img src="assets/skin-qingfengxing.png" width="240" alt="RenYing Artwork" />

**High-Performance Ink-Wash Martial Arts Action Duel Game**  
*Fluid real-time martial arts fighting game powered by HTML5 Canvas, serverless WebRTC P2P multiplayer, and lightweight Python WebSocket networking.*

[![Play Online: GitHub Pages](https://img.shields.io/badge/Play%20Online-GitHub%20Pages-success.svg?style=flat-square&logo=github)](https://amfi-disable.github.io/RenYing/)
[![Platform: Web & Python](https://img.shields.io/badge/Platform-Web%20%7C%20Python%203.10%2B-blue.svg?style=flat-square&logo=python)](https://python.org)
[![Technology: HTML5 Canvas](https://img.shields.io/badge/Technology-HTML5%20Canvas-orange.svg?style=flat-square&logo=html5)](https://html.spec.whatwg.org)
[![Multiplayer: WebRTC P2P](https://img.shields.io/badge/Multiplayer-WebRTC%20P2P%20%2F%20WebSocket-blue.svg?style=flat-square)](#architecture-and-technical-anatomy)
[![Release: v1.0.0](https://img.shields.io/badge/Release-v1.0.0-blue.svg?style=flat-square&logo=github)](https://github.com/AMFI-Disable/RenYing/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](license)
[![Privacy: Zero Telemetry](https://img.shields.io/badge/Privacy-Zero%20Telemetry%20%2F%20100%25%20Local-purple.svg?style=flat-square)](#privacy-and-security-first)
[![Pricing: Free & Open-Source](https://img.shields.io/badge/Pricing-100%25%20Free%20%26%20Open%20Source-success.svg?style=flat-square)](#overview-and-core-value)

</div>

---

## 🌐 Select Language / 选择语言

**[English](readme.md)** •
**[简体中文](readme.zh-cn.md)**

---

## 🧭 Table Of Contents

- [Overview And Core Value](#overview-and-core-value)
- [Key Features](#key-features)
- [Game Controls And Mechanics](#game-controls-and-mechanics)
- [How To Play And Multiplayer Modes](#how-to-play-and-multiplayer-modes)
- [Architecture And Technical Anatomy](#architecture-and-technical-anatomy)
- [Privacy And Security First](#privacy-and-security-first)
- [Educational And Fair-Play Disclaimer](#educational-and-fair-play-disclaimer)
- [License And Legal Attribution](#license-and-legal-attribution)

---

## ⚡ Overview And Core Value <a id="overview-and-core-value"></a>

**RenYing (刃影)** is a high-speed ink-wash martial arts action duel game. Designed for immediate play in school or at home, it offers both serverless browser-to-browser WebRTC Peer-to-Peer multiplayer on GitHub Pages and a standalone zero-dependency Python WebSocket server for local networks.

---

## 🚀 Key Features <a id="key-features"></a>

- **Instant Online Play on GitHub Pages**: Open in any browser without installation, clone, or server hosting.
- **Serverless WebRTC P2P Multiplayer**: Direct peer-to-peer UDP networking between two players with 4-letter room codes and ultra-low input lag.
- **Ink-Wash Visual Style**: Fluid brushstroke particle trails, hit-stop impacts, and traditional Chinese martial arts aesthetic.
- **Optional Dedicated Python Server**: Zero-dependency `server.py` supporting ladder ranking, match replays, and community hub.
- **Pure Offline Standalone Edition**: Complete client (`renying-offline.html`) with embedded audio for single-player and training mode.

---

## 🎮 Game Controls And Mechanics <a id="game-controls-and-mechanics"></a>

### Default Keyboard Controls

| Action | Player 1 (Left) | Player 2 (Local / Numpad) |
| :--- | :--- | :--- |
| **Move Left / Right** | `A` / `D` | `Left Arrow` / `Right Arrow` |
| **Jump** | `W` | `Up Arrow` |
| **Crouch / Drop** | `S` | `Down Arrow` |
| **Light Attack** | `J` | `Numpad 1` |
| **Heavy Attack** | `K` | `Numpad 2` |
| **Dash / Dodge** | `L` | `Numpad 3` |
| **Special / Burst** | `U` / `I` | `Numpad 4` / `Numpad 5` |

*(Note: Custom touch controls and virtual joysticks activate automatically on mobile and tablet devices).*

---

## 📦 How To Play And Multiplayer Modes <a id="how-to-play-and-multiplayer-modes"></a>

### Option 1: Instant WebRTC P2P (Recommended For School - $0 Budget)

No software installation or Python server required:

1. Both players visit **[https://amfi-disable.github.io/RenYing/](https://amfi-disable.github.io/RenYing/)** on their devices.
2. Player 1 navigates to **联机对战** $\rightarrow$ clicks **建房** $\rightarrow$ shares the generated 4-digit room code (e.g., `K7PQ`).
3. Player 2 enters the code into the **加入** box $\rightarrow$ clicks **加入**.
4. Both browsers connect directly via WebRTC DataChannels with zero intermediate server lag.

### Option 2: Local Dedicated Server (LAN Mode)

To host your own private server on your local Wi-Fi or LAN:

```bash
# Start server on default port 8765
python3 server.py

# Or specify a custom port
python3 server.py 9000
```

Open `http://localhost:8765` in your browser. Classmates on the same Wi-Fi can connect directly via `http://<your-lan-ip>:8765`.

### Option 3: Standalone Offline Play

Double-click or open `renying-offline.html` directly in any web browser without running a server or requiring an active internet connection.

---

## 🏗 Architecture And Technical Anatomy <a id="architecture-and-technical-anatomy"></a>

```mermaid
flowchart TD
    subgraph Mode 1: Serverless P2P
        P1["Player 1 Browser (GitHub Pages)"] <-->|"WebRTC DataChannel (Direct UDP)"| P2["Player 2 Browser (GitHub Pages)"]
    end
    subgraph Mode 2: Dedicated Server
        C1["Client 1"] <-->|"WebSocket JSON"| S["server.py (Python)"]
        C2["Client 2"] <-->|"WebSocket JSON"| S
        S <-->|"SQLite"| DB["data/renying.db"]
    end
```

- **Client Runtime**: Pure vanilla JavaScript utilizing HTML5 Canvas 2D context for ultra-low rendering latency.
- **P2P Networking**: WebRTC DataChannels with PeerJS handshake and Google STUN NAT traversal.
- **Server Networking**: Raw WebSocket implementation with RFC 6455 framing and keep-alive ping cycles.
- **Persistence**: Local storage and optional SQLite 3 database (`data/renying.db`) storing user accounts with PBKDF2/SHA-256 salted hashes.

---

## 🛡 Privacy And Security First <a id="privacy-and-security-first"></a>

- **Zero Telemetry**: No third-party analytics, external trackers, or diagnostic telemetry.
- **Peer-to-Peer Privacy**: In WebRTC P2P mode, game inputs travel directly between player browsers without passing through any server.
- **Local-First Data**: All matchmaking history, ladder statistics, and replay files remain strictly on your host machine.

---

## ⚖ Educational And Fair-Play Disclaimer <a id="educational-and-fair-play-disclaimer"></a>

> [!CAUTION]
> **IMPORTANT NOTICE & DISCLAIMER**:
> This codebase is provided strictly for educational, research, and non-commercial gaming entertainment purposes.
> Please respect community guidelines and maintain fair-play conduct during multiplayer matchmaking and community chat interactions.
> The developers and contributors accept no responsibility or liability for third-party hosting or server operations.

---

## 📄 License And Legal Attribution <a id="license-and-legal-attribution"></a>

Licensed under the [MIT License](license). Copyright (c) 2026 AMFI-Disable.
