# ⚔ RenYing

<div align="center">

<img src="assets/skin-qingfengxing.png" width="240" alt="RenYing Artwork" />

**High-Performance Ink-Wash Martial Arts Action Duel Game**  
*Fluid real-time martial arts fighting game powered by HTML5 Canvas and lightweight Python WebSocket networking.*

[![Platform: Web & Python](https://img.shields.io/badge/Platform-Web%20%7C%20Python%203.10%2B-blue.svg?style=flat-square&logo=python)](https://python.org)
[![Technology: HTML5 Canvas](https://img.shields.io/badge/Technology-HTML5%20Canvas-orange.svg?style=flat-square&logo=html5)](https://html.spec.whatwg.org)
[![Network: WebSocket](https://img.shields.io/badge/Network-Realtime%20WebSocket-success.svg?style=flat-square)](#-architecture-and-technical-anatomy)
[![Release: v1.0.0](https://img.shields.io/badge/Release-v1.0.0-blue.svg?style=flat-square&logo=github)](https://github.com/luffyxing55/Luffx/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](license)
[![Privacy: Zero Telemetry](https://img.shields.io/badge/Privacy-Zero%20Telemetry%20%2F%20100%25%20Local-purple.svg?style=flat-square)](#-privacy-and-security-first)
[![Pricing: Free & Open-Source](https://img.shields.io/badge/Pricing-100%25%20Free%20%26%20Open%20Source-success.svg?style=flat-square)](#-overview-and-core-value)

</div>

---

## 🌐 Select Language / 选择语言

**[English](readme.md)** •
**[简体中文](readme.zh-cn.md)**

---

## 🧭 Table Of Contents

- [Overview And Core Value](#-overview-and-core-value)
- [Key Features](#-key-features)
- [Game Controls And Mechanics](#-game-controls-and-mechanics)
- [Quick Start And Running The Server](#-quick-start-and-running-the-server)
- [Architecture And Technical Anatomy](#-architecture-and-technical-anatomy)
- [Privacy And Security First](#-privacy-and-security-first)
- [Educational And Fair-Play Disclaimer](#-educational-and-fair-play-disclaimer)
- [License And Legal Attribution](#-license-and-legal-attribution)

---

## ⚡ Overview And Core Value

**RenYing (刃影)** is a high-speed ink-wash martial arts action duel game. Engineered with standard HTML5 Canvas graphics and a zero-external-dependency Python WebSocket server, it delivers instantaneous combat responses, expressive martial arts animation, and seamless online and offline gameplay.

---

## 🚀 Key Features

- **Ink-Wash Visual Style**: Fluid brushstroke effects, dynamic particle trails, and responsive hit-pause visual feedback.
- **Real-Time Multiplayer Combat**: Room code matchmaking, quick matchmaking queue, and competitive ladder divisions.
- **Zero-Dependency Server**: Standalone Python 3 WebSocket and HTTP server using standard libraries only.
- **Offline Standalone Client**: Complete offline edition (`renying-offline.html`) with embedded audio and character roster.
- **Reconnection Resilience**: Graceful 60-second connection recovery preserves active duel rooms during temporary disconnects.
- **Integrated Community & Hub**: In-game player chat, combat replays, character encyclopedia, and custom skins.

---

## 🎮 Game Controls And Mechanics

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

## 📦 Quick Start And Running The Server

### 1. Launch Multiplayer Server

Run the bundled Python server directly with standard Python 3 (no third-party packages required):

```bash
# Start server on default port 8765
python3 server.py

# Or specify a custom port
python3 server.py 9000
```

### 2. Connect In Browser

Open your preferred modern web browser and navigate to:

```text
http://localhost:8765
```

For players on the same local network, connect using the host machine's local IP address (displayed in the server launch log).

### 3. Pure Offline Play

Double-click or open `renying-offline.html` directly in any web browser without running a server or requiring an active internet connection.

---

## 🏗 Architecture And Technical Anatomy

```mermaid
flowchart LR
    A["renying.html (Client)"] <-->|"WebSocket (JSON Frames)"| B["server.py (Server)"]
    B <-->|"SQLite Database"| C["data/renying.db"]
    D["renying-offline.html"] -->|"Local Browser Engine"| E["Self-Contained Client"]
```

- **Client Runtime**: Pure vanilla JavaScript utilizing HTML5 Canvas 2D context for ultra-low rendering latency.
- **Networking Stack**: Raw WebSocket implementation with RFC 6455 framing and keep-alive ping cycles.
- **Persistence**: SQLite 3 database (`data/renying.db`) storing user accounts with PBKDF2/SHA-256 salted hashes, match replays, and ranking ladders.

---

## 🛡 Privacy And Security First

- **Zero Telemetry**: No third-party analytics, external trackers, or diagnostic telemetry.
- **Local-First Data**: All matchmaking history, ladder statistics, and replay files remain strictly on your host machine.
- **Salted Cryptography**: User passwords never persist in plain text; all credentials use cryptographically secure salted hashes.

---

## ⚖ Educational And Fair-Play Disclaimer

> [!CAUTION]
> **IMPORTANT NOTICE & DISCLAIMER**:
> This codebase is provided strictly for educational, research, and non-commercial gaming entertainment purposes.
> Please respect community guidelines and maintain fair-play conduct during multiplayer matchmaking and community chat interactions.
> The developers and contributors accept no responsibility or liability for third-party hosting or server operations.

---

## 📄 License And Legal Attribution

Licensed under the [MIT License](license). Copyright (c) 2026 AMFI-Disable.
