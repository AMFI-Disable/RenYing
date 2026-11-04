# Contributing To RenYing

Thanks for helping. This page lists the rules the repository and CI enforce. The Chinese summary is at the end.

## Who Can Merge

Only pull requests from the maintainer (Even, GitHub `AMFI-Disable`) and repository collaborators are merged. Pull requests from anyone else are not merged or copied into `main`. Bug reports and ideas are welcome from everyone in [Issues](https://github.com/AMFI-Disable/RenYing/issues).

## Before You Start

- Python 3.10+ and Node 22. No `npm install`.
- Clone the repository and open `index.html` through a local server (`python3 -m http.server 8791`) or just open it from GitHub Pages.

## Where Code Goes

| Change | File |
| :--- | :--- |
| A hero's stats, moves or story | `src/data/heroes/<number>-<id>.js` (field reference in `src/data/00-heroes.js`) |
| English text for the interface | `src/data/30-ui-copy.js`; hero text in `src/data/31-hero-copy.js` |
| Modes and draft orders | `src/data/10-modes.js`, `src/data/11-bp-orders.js` |
| Maps | `src/data/12-maps.js` |
| Game logic | The matching numbered file in `src/game/` (do not add new top-level files) |
| Server | Worker source modules in `cloudflare/worker/`; database changes as a new file in `cloudflare/migrations/` |

`index.html`, `renying-offline.html`, `assets/qingfengxing.html`, `cloudflare/worker.js`, `cloudflare/migrations.gen.js` and `cloudflare/worker.bundle.js` are generated. Never edit them by hand.

## Rules CI Checks

1. **Generated files are current.** Run `python3 tools/build.py` after a change and commit the output together with the source. `python3 tools/build.py --check` must pass.
2. **Commit messages** match `type: word word word`: a lowercase type, a colon, then exactly three lowercase words or numbers. Examples: `fix: guard break timing`, `docs: refresh readme wiki`, `feat: add qianji hero`.
3. **File names are lowercase** for every tracked file.
4. **Markdown headings use Title Case** and pass `.markdownlint.json`.
5. **Tests pass.** At least `node tools/tests/combat-test.mjs --sim` and `node tools/tests/econ-test.mjs` for gameplay or economy changes. See the [Testing And CI](https://github.com/AMFI-Disable/RenYing/wiki/Testing-and-CI) wiki page for the full list.
6. **No direct binary download links** (`.dmg`, `.zip`) in the readme or docs.

## Writing Docs

- Keep `readme.md` and `readme.zh-cn.md` saying the same thing.
- The wiki lives at <https://github.com/AMFI-Disable/RenYing/wiki>. A copy of its pages is kept in `docs/wiki/` (lowercase file names). When you change one, change the other.
- Describe RenYing on its own terms, without comparing it to other games.
- Do not put secrets, Worker URLs with keys, database exports or player data in any file.

## Server Changes

The Worker and the D1 database are deployed by the maintainer. If your change needs a redeploy, write **Needs a Worker redeploy.** in the changelog entry. Never run `wrangler d1 migrations apply`; migrations run inside the Worker. See `cloudflare/migrations/readme.md` and `docs/deploy-runbook.md`.

## 中文摘要

- 只合并 Even（`AMFI-Disable`）和仓库协作者的 PR。
- 改 `src/`、`assets/`、`cloudflare/` 之后跑 `python3 tools/build.py`，生成的文件和源码一起提交。
- 提交信息：`类型: 三个小写单词`，例如 `fix: guard break timing`。
- 文件名全部小写，Markdown 标题用 Title Case。
- 两份 readme 内容保持一致；改 Wiki 时同步改 `docs/wiki/`。
- 介绍刃影时只说它自己，不要写成照着别的游戏做的。
