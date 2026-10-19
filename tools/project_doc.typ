#set page(
  paper: "a4",
  margin: (x: 1.5cm, top: 1.2cm, bottom: 1.2cm),
  header: context {
    if here().page() > 1 [
      #set text(8pt, fill: rgb("#64748B"), font: ("PingFang SC", "Helvetica Neue"))
      #grid(
        columns: (1fr, 1fr),
        align(left)[*RenYing (刃影)* · Collaboration & Agent Development Guide],
        align(right)[Collaborator: *LuffyXing55*]
      )
      #v(1pt)
      #line(length: 100%, stroke: 0.5pt + rgb("#CBD5E1"))
    ]
  },
  footer: context [
    #set text(8pt, fill: rgb("#94A3B8"), font: ("PingFang SC", "Helvetica Neue"))
    #line(length: 100%, stroke: 0.5pt + rgb("#E2E8F0"))
    #v(1pt)
    #grid(
      columns: (1fr, 1fr),
      align(left)[RenYing Engineering Team · Internal],
      align(right)[Page #here().page() of #counter(page).final().at(0)]
    )
  ]
)

#set text(
  font: ("PingFang SC", "Heiti SC", "Helvetica Neue", "Arial"),
  size: 9pt,
  fill: rgb("#1E293B"),
  lang: "zh"
)

#set par(justify: true, leading: 0.52em)
#show heading: set text(fill: rgb("#0F172A"), font: ("PingFang SC", "Helvetica Neue"))
#show heading.where(level: 1): it => block(spacing: 0.55em)[
  #v(0.15em)
  #text(12pt, weight: "bold", fill: rgb("#1E3A8A"))[#it.body]
  #v(0.05em)
  #line(length: 100%, stroke: 1pt + rgb("#3B82F6"))
]
#show heading.where(level: 2): it => block(spacing: 0.4em)[
  #text(10pt, weight: "bold", fill: rgb("#1E40AF"))[#it.body]
]

#show raw: set text(font: ("Menlo", "Courier New"), size: 7.8pt)
#show raw.where(block: false): it => box(
  fill: rgb("#F1F5F9"),
  inset: (x: 2.5pt, y: 1pt),
  radius: 2.5pt,
  stroke: 0.5pt + rgb("#E2E8F0"),
  it
)
#show raw.where(block: true): it => block(
  fill: rgb("#0F172A"),
  inset: 5pt,
  radius: 4pt,
  width: 100%,
  text(fill: rgb("#F8FAFC"), it)
)

// Header Banner
#align(center)[
  #block(
    fill: rgb("#F8FAFC"),
    inset: (x: 10pt, y: 7pt),
    radius: 6pt,
    stroke: 1pt + rgb("#E2E8F0"),
    width: 100%
  )[
    #text(16pt, weight: "bold", fill: rgb("#0F172A"))[⚔️ RenYing (刃影) 协作与开发总南]
    #v(1pt)
    #text(9pt, fill: rgb("#475569"))[Project Architecture, Git/GitHub Setup & Agent Protocol Guide]
    #v(2pt)
    #grid(
      columns: (1fr, 1.2fr, 1fr),
      align(center)[*Collaborator:* LuffyXing55],
      align(center)[*Repo:* `AMFI-Disable/RenYing`],
      align(center)[*Branch:* `main` (Merged)]
    )
  ]
]

#v(0.1em)

#block(
  fill: rgb("#EFF6FF"),
  stroke: (left: 3pt + rgb("#3B82F6")),
  inset: (x: 8pt, y: 5pt),
  radius: (right: 3pt)
)[
  *⚠️ 重要通告：架构重构与单文件合并已全面完成！* \
  你当前本地可能持有一个体积巨大的独立单文件 HTML（如 `renying-overlappingchanges/index.html` 或历史单页副本）。*请注意：当前仓库 `AMFI-Disable/RenYing` 已经完成了所有特性的全面重构与合并*（包括 12 名英雄完整机制、醉翁 2.0 山水与留客重构、AI 自动训练套件、对战平衡系数 `BAL`、P2P 联机与 Firebase 云存档等）。*你现在可以完全放心、安全地废弃旧单文件，直接使用本工程代码库进行开发！*
]

= 1. 项目架构与构建体系

本项目采用 *模块化源码开发 + 自动化一键打包* 的工程体系：

- *`src/` (核心源码目录)*：
  - `src/game.js`：核心物理引擎、战斗判定、角色状态机、12英雄机制、AI行为逻辑与UI交互。
  - `src/page.html`：页面骨架模版、Bento 风格角色图鉴、弹窗与 HUD DOM。
  - `src/style.css`：水墨国风样式、排版与动效。
  - `src/cloud.js`：Firebase 匿名登录、云存档同步与防篡改限速。
  - `src/net-p2p.js`：基于 PeerJS 的 WebRTC 零延迟联机对战。
- *`tools/` (工具链)*：
  - `python3 tools/build.py`：*打包总入口*。将 `src/` 编译并生成根目录产物：
    - `index.html`：线上全功能联机版（部署于 GitHub Pages）。
    - `renying-offline.html`：单文件离线珍藏版（内嵌全部音频与青锋行，开箱即玩）。
  - `node tools/cvc-sim.mjs`：Headless 400x 超高速 AI 对战模拟器，用于校验战斗逻辑与数值平衡。

= 2. 协作者 GitHub 认证与代码推送指南 (LuffyXing55)

本仓库地址：`https://github.com/AMFI-Disable/RenYing.git`，协作者账号已配置为 *LuffyXing55*。

== 2.1 安装与登录 GitHub CLI (`gh`)
```bash
brew install gh            # 安装 GitHub CLI (Linux 使用 sudo apt/dnf install gh)
gh auth login              # 登录：选择 GitHub.com -> HTTPS -> 网页端认证 (登录 LuffyXing55)
gh auth status             # 确认账号状态已就绪
gh auth setup-git          # 配置 Git 凭证助手，使 git push 自动鉴权免密推送
```

== 2.2 克隆代码库与配置身份
```bash
git clone https://github.com/AMFI-Disable/RenYing.git
cd RenYing
git config user.name "LuffyXing55"
git config user.email "your_email@example.com"  # 填入与 GitHub 绑定的邮箱地址
```

== 2.3 日常开发与推送流程 (Push Workflow)
#block(
  fill: rgb("#FFFBEB"),
  stroke: 1pt + rgb("#FDE68A"),
  inset: 5pt,
  radius: 3pt
)[
  *⚠️ 核心守则*：修改 `src/` 代码后，*必须先运行 `python3 tools/build.py`* 重新生成 `index.html` 和 `renying-offline.html`，然后一并提交！
]

```bash
git pull origin main                 # 1. 拉取最新远端改动
# 2. 编辑 src/game.js 或 src/page.html 等源文件...
python3 tools/build.py               # 3. 编译打包生成根目录 HTML
node --check src/game.js             # 4. 校验 JS 语法
node tools/cvc-sim.mjs --matches 10  # 5. 运行 AI 仿真对战测试
git add -A                           # 6. 暂存所有改动
git commit -m "feat: your change text" # 7. 提交（按规范：动词前缀 + 精确3个小写单词）
git push origin main                 # 8. 推送到主分支
```

#pagebreak()

= 3. Claude / AI 协同开发指南 (Context for Claude)

如果你或你的 AI 助手（如 Claude / Antigravity）在本地协助开发，请向其明确以下项目约束：

1. *严禁直接修改根目录的 `index.html` 或 `renying-offline.html`*：
   这两个文件是 `tools/build.py` 编译生成的产物。任何功能变更、样式改动必须在 `src/` 目录源文件中进行。
2. *全角色体系已包含 12 名英雄*：
   - 经典英雄：青锋、铁山、绯影、流云、雷鸣、凌霜、墨羽、月华、燕翎。
   - 最新英雄：*玉箫*（箫音叠律）、*醉翁*（2.0 亭中留客禁锢 + 与民同乐掷酒坛 + 全屏山水之间）、*勾陈*（锁链飞锤 + 破防震魄 + 开天一锤）。
3. *提交信息约束规范*：
   Git 提交必须遵循动词前缀加 *精确 3 个全小写单词*（例如：`feat: migrate overlapping changes` 或 `fix: player hurtbox bug`）。
4. *每次任务交付必须校验*：必须做到编译成功、语法通过、仿真对局无异常。

= 4. 任务交付自检清单 (Task Completion Checklist)

#block(
  fill: rgb("#F8FAFC"),
  stroke: 1pt + rgb("#CBD5E1"),
  inset: 7pt,
  radius: 4pt
)[
  *📋 开发者与 AI 每次完成任务后必须逐项对照检查（Check Every Time）：*

  - [ ] *源文件修改合规*：改动均位于 `src/` 内部文件（如 `src/game.js`、`src/page.html` 等），未破坏无关逻辑。
  - [ ] *JS 语法校验*：运行 `node --check src/game.js` 无语法解析错误。
  - [ ] *执行打包构建*：运行 `python3 tools/build.py`，确认 `index.html` 与 `renying-offline.html` 同步生成。
  - [ ] *构建版本自检*：运行 `python3 tools/build.py --check` 输出 `网页都是最新的。`
  - [ ] *无头对战模拟*：运行 `node tools/cvc-sim.mjs --matches 12` 跑完所有对局，确认帧率正常、无运行时崩溃。
  - [ ] *Git 提交规范*：Commit 信息形如 `feat: foo bar baz`（动词前缀 + 精确 3 个小写单词）。
  - [ ] *分支同步推送*：执行 `git push origin main` 成功推送到远端仓库。
]

= 5. 常用开发模版 (Development Templates)

== 5.1 新招式定义模版 (Move Template in `src/game.js`)
```javascript
// 在 SKILLS 字典中添加技能定义
my_skill: {
  name: '技能名称', cd: 8.0, desc: '技能说明文本...',
  start(f) { f.vx = 0; f.armorT = 0.35; },
  update(f, foe) {
    if (f.skPh === 0 && f.t >= 0.12) {
      f.skPh = 1; SFX.swing();
      spawnProj(f, {
        kind: 'my_proj', x: f.x + f.face * 30, y: f.y - 60,
        vx: f.face * 650, vy: 0, dmg: 25, kb: [180, -220], stun: 0.4
      });
    }
    if (f.t >= 0.40) toNeutral(f);
  },
  pose: f => f.skPh === 0 ? ['l1s', 20] : ['l1a', 25],
  ai: (me, foe, d) => d < 200 && me.hp > 100
}
```

== 5.2 任务交付报告模版 (Task Check Markdown Template)
```markdown
### 任务交付报告 (Task Delivery Report)
- **任务目标**: [简述改动需求]
- **受影响模块**: `src/game.js` / `src/page.html` / `tools/`
- **自检清单验证**:
  - [x] 源码已编辑并维护良好注释
  - [x] `node --check src/game.js` 通过
  - [x] `python3 tools/build.py` 成功生成 index.html & renying-offline.html
  - [x] `python3 tools/build.py --check` 状态最新
  - [x] `node tools/cvc-sim.mjs` 仿真对局通过
  - [x] Git Commit 遵循 3 词规范并成功 Push
```

#v(0.3em)
#align(center)[
  #block(
    fill: rgb("#FEF2F2"),
    stroke: 1pt + rgb("#FECACA"),
    inset: (x: 10pt, y: 5pt),
    radius: 3.5pt
  )[
    #text(8.5pt, weight: "bold", fill: rgb("#991B1B"))[
      🔔 核心提示：Claude / AI 助手与开发者在每次任务完成后，必须查阅本自检清单方可交付！
    ]
  ]
]
