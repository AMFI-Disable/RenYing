# ⚔ 刃影 (RenYing)

<div align="center">

<img src="assets/skin-qingfengxing.png" width="240" alt="刃影艺术图" />

**高性能水墨风武侠格斗对战游戏**  
*由 Even, Luffy, and Opus 5.5 倾力创作。基于 HTML5 Canvas、WebRTC P2P 免服务器直连与轻量 Python WebSocket 服务器的实时武侠格斗游戏。*

[![在线畅玩: GitHub Pages](https://img.shields.io/badge/在线畅玩-GitHub%20Pages-success.svg?style=flat-square&logo=github)](https://amfi-disable.github.io/RenYing/)
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
- [Project Structure And Building](#project-structure-and-building)
- [Privacy And Security First](#privacy-and-security-first)
- [Educational And Fair-Play Disclaimer](#educational-and-fair-play-disclaimer)
- [License And Legal Attribution](#license-and-legal-attribution)

---

## ⚡ Overview And Core Value <a id="overview-and-core-value"></a>

**刃影 (RenYing)** 是一款由 **Even, Luffy, and Opus 5.5** 共同创作的快节奏水墨风格武侠格斗对战游戏。专门针对校园及多端对战场景设计，支持通过 GitHub Pages 进行免服务器的浏览器对浏览器 WebRTC 直连联机（$0 成本、无网络中转延迟），同时也完整保留了本地局域网 Python WebSocket 服务器模式。

---

## 🚀 Key Features <a id="key-features"></a>

- **GitHub Pages 即开即玩**：无需安装任何环境，不需克隆代码，任意浏览器点开网页即可开始。
- **免服务器 WebRTC P2P 联机**：两位玩家通过 4 位房间码直接建立浏览器间 UDP 通道，零中转延迟。
- **写意水墨美术风格**：流畅的笔墨拖尾粒子、顿挫有力的打击定格、纯正武侠意境。
- **自建 Python 独立服务器**：零依赖单文件 `server.py`，支持天梯排位、录像存储与内置社区。
- **纯本地单机离线模式**：提供单文件离线版（`renying-offline.html`），音频全内置，随时随地畅玩。

---

## 🎮 Game Controls And Mechanics <a id="game-controls-and-mechanics"></a>

### 默认键盘和鼠标操作

| 操作 | 按键 |
| :--- | :--- |
| **左右移动** | `A` / `D` |
| **跳跃 / 二段跳** | `W` 或 `空格` |
| **防御** | 按住 `S` |
| **攻击（五段连击）** | 鼠标左键 |
| **蓄力斩** | 按住鼠标左键再松开 |
| **远程招式** | 按住左键再点右键（或 `R`） |
| **腾空闪** | 鼠标右键（或 `左 Shift`） |
| **技能 / 大招** | `Q` / `E`（大招需要气满） |
| **暂停 / 静音** | `P` / `M`（单人模式） |

*(注：在移动设备或平板触控屏上，游戏将自动启用虚拟摇杆与触控按键)。*

---

## 📦 How To Play And Multiplayer Modes <a id="how-to-play-and-multiplayer-modes"></a>

### 模式一：WebRTC P2P 在线直连（推荐校园开黑，0 成本零延迟）

无需安装任何软件或启动后台：

1. 两位玩家均打开 **[https://amfi-disable.github.io/RenYing/](https://amfi-disable.github.io/RenYing/)**。
2. 玩家 1 点击 **联机对战** $\rightarrow$ **建房** $\rightarrow$ 获得 4 位房间码（例如 `K7PQ`）。
3. 玩家 2 在 **加入** 栏输入该房间码 $\rightarrow$ 点击 **加入**。
4. 双方浏览器直接建立 WebRTC 数据连接，PeerJS 只负责让两边找到对方，然后立即开始选人对决！

部分管得严的网络（某些校园 Wi-Fi 或防火墙）会拦截点对点连接。如果加入一直超时，换个网络或改用模式二。

### 模式二：本地局域网服务器（经典模式）

在仓库根目录运行服务器。它会提供游戏网页（`index.html`）、音乐和资源，并支持快速匹配、排位赛、账号和断线重连：

```bash
# 启动默认 8765 端口服务
python3 server.py

# 或指定自定义端口
python3 server.py 9000
```

同一 Wi-Fi 下的同学直接访问 `http://<你的电脑局域网IP>:8765` 即可连入。如果你的服务器有 `https://` 网址（比如通过隧道），GitHub Pages 上的玩家也可以在 **使用联机服务器（可选）** 里填上它来连入；浏览器不允许 HTTPS 网页连接 `http://` 的服务器。

### 模式三：单机离线游玩

双击打开 `renying-offline.html`，无需任何网络即可进行单人闯关、人机对战与木人桩练习。音乐和青锋行小游戏都打包在这一个文件里。

---

## 🏗 Architecture And Technical Anatomy <a id="architecture-and-technical-anatomy"></a>

```mermaid
flowchart TD
    subgraph 模式一：免服务器 P2P
        P1["玩家 1 (GitHub Pages)"] <-->|"WebRTC DataChannel (直连 UDP)"| P2["玩家 2 (GitHub Pages)"]
    end
    subgraph 模式二：自建中心服务器
        C1["客户端 1"] <-->|"WebSocket JSON"| S["server.py (Python)"]
        C2["客户端 2"] <-->|"WebSocket JSON"| S
        S <-->|"SQLite"| DB["data/renying.db"]
    end
```

- **客户端引擎**：纯原生 JavaScript + HTML5 Canvas 2D，极致低输入延迟。
- **回滚联机**：两边用同一个随机种子各自完整计算对战，每帧只交换按键；对方按键晚到时回到那一帧重算，并定期校验状态。
- **P2P 通信**：基于 WebRTC DataChannels 与 PeerJS 握手协议，自动穿透局域网 NAT（`src/net-p2p.js`）。
- **数据存储**：本地 LocalStorage 与可选 SQLite 3 服务端数据库。

---

## 🧱 Project Structure And Building <a id="project-structure-and-building"></a>

只改源文件，不要直接改生成的网页：

| 路径 | 用途 |
| :--- | :--- |
| `src/page.html` | 网页结构，带打包标记 |
| `src/style.css` | 全部样式 |
| `src/game.js` | 游戏引擎、12 名英雄机制、菜单、回滚联机和服务器联机 |
| `src/net-p2p.js` | 免服务器 WebRTC 直连 |
| `src/cloud.js` | Firebase 云存档同步与本地备份导入/导出 |
| `src/social.js` | 免服务器 P2P 江湖茶馆社区、好友与观战 |
| `src/qfx/` | 青锋行小游戏模块化源码 |
| `firestore.rules` | Firestore 云存档安全与防篡改规则 |
| `assets/music/` | 背景音乐（`.mp3`） |
| `assets/qingfengxing.html` | 生成的青锋行小游戏页面 |
| `tools/build.py` | 生成下面三个网页（只用 Python 自带的库） |
| `tools/combat-test.mjs` | 12 英雄招式、状态机与 2v2 AI 回归测试套件 |
| `tools/simulate-all.mjs` | 全模式 AI 仿真对战、克制审计与神经网络训练管线 |
| `index.html` | 生成的联网版（GitHub Pages 和 `server.py` 都用它） |
| `renying-offline.html` | 生成的单文件离线版 |
| `renying.html` | 生成的旧网址跳转页 |

改了 `src/` 或 `assets/` 里的东西之后，重新生成，并把生成的网页和源文件一起提交：

```bash
python3 tools/build.py
```

CI 会运行 `python3 tools/build.py --check`，生成的网页不是最新就会失败。

---

## 🛡 Privacy And Security First <a id="privacy-and-security-first"></a>

- **零数据追踪**：无任何第三方统计脚本或分析 SDK，纯净无广告。
- **点对点隐私保障**：P2P 模式下所有操作指令直接在两位玩家浏览器之间传输，不经过任何第三方服务器。
- **本地优先**：所有战绩和配置仅保存在本地设备。

---

## ⚖ Educational And Fair-Play Disclaimer <a id="educational-and-fair-play-disclaimer"></a>

> [!CAUTION]
> **免责声明与公平竞技声明**：
> 本项目源码与资源仅供学习研究、技术交流与个人非商业娱乐使用。
> 请遵守相关社区规范，在联机对战与社区交流中保持友善文明与公平竞技。
> 开发者对第三方独立搭建之服务器及衍生内容不承担法律责任。

---

## 📄 License And Legal Attribution <a id="license-and-legal-attribution"></a>

由 **Even, Luffy, and Opus 5.5** 倾力创作。本项目采用 [MIT License](license) 开源协议。Copyright (c) 2026 AMFI-Disable, Even, Luffy, and Opus 5.5.
