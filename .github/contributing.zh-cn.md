# 参与刃影开发

[English](contributing.md)

## 谁可以合并

项目在 `main` 上直接开发。只有维护者 Even（`AMFI-Disable`）和仓库协作者的拉取请求会合并。其他玩家和开发者可在[议题区](https://github.com/BigBrainDevBros/RenYing/issues)提出问题或想法。

## 本地运行

准备 Python 3.10 或更高版本以及 Node 22，无需安装 npm 依赖。在根目录运行 `python3 -m http.server 8791` 并在浏览器打开本地地址，也可以直接访问 GitHub Pages。

## 代码位置

| 修改内容 | 位置 |
| --- | --- |
| 侠客数值、技能、故事 | `src/data/heroes/<number>-<id>.js`，字段说明在 `src/data/00-heroes.js` |
| 英文界面与侠客文案 | `src/data/30-ui-copy-*.js` 与 `src/data/31-hero-copy.js` |
| 模式、选禁顺序与地图 | `src/data/10-modes.js`、`src/data/11-bp-orders.js`、`src/data/12-maps.js` |
| 游戏逻辑 | `src/game/` 中对应的编号文件 |
| 服务端与数据库 | `cloudflare/worker/` 下的模块，以及 `cloudflare/migrations/` 下的新迁移文件 |

修改源码后运行 `python3 tools/build.py`，把源码和生成物一起提交。不要手改 `index.html`、`renying-offline.html`、`assets/qingfengxing.html`、`cloudflare/worker.js`、`cloudflare/migrations.gen.js` 或 `cloudflare/worker.bundle.js`。

## 验证与文档

- `python3 tools/build.py --check` 检查生成物是否与源码一致。涉及战斗或经济系统时，至少运行 `node tools/tests/combat-test.mjs --sim` 和 `node tools/tests/econ-test.mjs`。完整检查见[测试指南](../docs/wiki/testing-and-ci.md)。
- 提交类型后写三个小写英文单词或数字，例如 `fix: guard break timing`。跟踪文件名须小写，英文标题遵循 Title Case，文档须通过 Markdown 检查。
- 英中两份项目说明保持一致；同时更新 GitHub Wiki 及 `docs/wiki/` 镜像。介绍刃影时直接描述本作玩法。通过发布页面提供二进制文件；文档中不得写入密钥、带密钥的 Worker 地址、数据库导出或玩家资料。

## 服务端发布

维护者负责部署 Worker 与 D1。需要重新部署时，在 `docs/history/changelog.md` 记录 **Needs a Worker redeploy.**。迁移由 Worker 执行；切勿运行 `wrangler d1 migrations apply`。参阅[迁移说明](../cloudflare/migrations/readme.md)及[部署手册](../docs/ops/deploy-runbook.md)。
