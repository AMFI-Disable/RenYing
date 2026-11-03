# Testing And CI / 测试与 CI

Everything runs with plain **Node 22** and **Python 3.10+**. There is no `npm install`. Browser audits use Playwright with Chromium and need a local server first:

```bash
python3 -m http.server 8791
```

所有测试只要 Node 22 和 Python 3.10 以上，不用 `npm install`。浏览器检查要先开上面这个本地服务器。

## Quick Run / 一次跑完

```bash
node tools/test.mjs
```

Rebuilds if needed and runs the main suites in one go. `--full` adds the long UI simulations.

## Test Matrix / 测试清单

| Area | Command | What it checks |
| :--- | :--- | :--- |
| Build | `python3 tools/build.py --check` | Generated pages, Worker bundle and migration list match the sources |
| Data | `node tools/data-check.mjs` | Hero files and data tables: required and unknown fields, unique ids, story template (also runs inside the build) |
| Combat | `node tools/combat-test.mjs --sim` | Every hero, combat states, skills, maps, 2v2 AI |
| AI | `node tools/ai-lingque-test.mjs` | Ling Que AI combos and level separation |
| Anti-cheat | `node tools/anticheat-test.mjs` | Oversized hits are only logged; edited move tables still strike |
| Rollback | `node tools/rollback-test.mjs --rollback` | Snapshot, restore and re-simulation are deterministic |
| Netplay | `node tools/netplay-test.mjs` | Two game copies over a laggy link end every match identically |
| Economy | `node tools/econ-test.mjs` (`--bundle` for the built Worker) | Armory, market, odds, limits, anti-abuse, admin routes; D1 migrations on empty and old databases match `cloudflare/schema.sql` |
| Cloud client | `node tools/cloud-test.mjs` | Per-account save isolation, retries, local accounts, export signatures |
| Sync | `node tools/sync-test.mjs` (`--bundle`) | Real Worker with several devices: progress is summed, never counted twice |
| Open world | `node tools/world-test.mjs` | World line cap, view range, damage caps, world boss, restarts |
| Predeploy | `node tools/predeploy-check.mjs` | `wrangler.toml`, migration numbering, admin page CSP, API smoke test on a local Worker |
| Draft flow | `node tools/bp-flow-test.mjs` | Draft screen and offline font fallback |
| Panels | `node tools/ui-audit.mjs ci-ui 1440 900` | Every panel fits, nothing clipped or too small to read |
| HUD | `node tools/hud-audit.mjs ci-hud 1440 900` | No in-match HUD text below 12 px |
| HUD overlap | `node tools/hud-overlap-audit.mjs ci-hud-ov 1440 900 watch2v2` | HUD text and bars never overlap or leave the canvas |
| Touch | `node tools/touch-audit.mjs ci-touch` | Phone and tablet touch controls |
| Keyboard | `node tools/kb-flow-test.mjs ci-kb 1440 900` | A new player with no mouse: language prompt → home → match → results |
| Performance | `node tools/perf-audit.mjs ci-perf` | Load time, panel switching and AI-vs-AI frame rate within `tools/perf-budget.json` |
| First load | `node tools/firstload-audit.mjs ci-firstload 3` | First paint, largest paint, layout shift, fonts; no music on the first screen |
| Frame data | `node tools/frame-data.mjs --check` | Move timing did not change by accident |
| AI ladder | `node tools/ai-ladder-report.mjs` | Win rates between AI levels and heroes (writes `docs/ai-ladder-benchmark.md`) |

Audit screenshots go into the `ci-*` folders, which are ignored by git.

检查截图会写进 `ci-*` 文件夹，这些都在 `.gitignore` 里，不会被提交。

## GitHub Workflows / 工作流

| Workflow | Runs |
| :--- | :--- |
| **CI** (`ci.yml`) | YAML check, lowercase file names, build check, economy, cloud, sync, open world, combat, AI, anti-cheat, draft flow, panel, HUD, touch and keyboard audits, commit message format |
| **Build & Syntax Gate** | `build.py --check` and syntax checks |
| **Armory Economy & Anti-Cheat** | Economy tests on sources and bundle |
| **Combat & Physics Engine** | Combat suite |
| **Rollback Netcode & P2P Sync** | Rollback and netplay tests |
| **UI Panels & Canvas HUD Layout** | Panels, HUD, overlap, keyboard on a phone-sized screen, performance, first load |
| **Mobile & Touch Controls** | Touch audit |
| **Offline Standalone Build** | The offline file works with no network |
| **QingFengXing 3D Action Mode** | Mini-game smoke test |
| **Cloudflare Worker & D1 Schema Sync** | Bundle syntax, schema, predeploy checks |
| **AI Difficulty Ladder & Win-Rate Report** | AI ladder report |
| **Deploy GitHub Pages** | Publishes the site from `main` |

## Commit Message Format / 提交信息格式

CI rejects any commit whose subject does not match:

```text
type: word word word
```

A lowercase type, a colon and a space, then exactly three lowercase words or numbers. Examples: `fix: guard break timing`, `docs: refresh readme wiki`, `feat: add qianji hero`.

提交信息必须是 `类型: 三个小写单词`，否则 CI 不通过。
