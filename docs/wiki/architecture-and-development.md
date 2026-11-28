# Architecture And Development / 架构与开发

## Big Picture / 总体

- **No framework, no bundler, no runtime npm packages.** The game is vanilla JavaScript drawing on one `<canvas>`. Vendored libraries are only `assets/peerjs.min.js` (handshake) and `assets/three.min.js` (青锋行).
- **Sources in `src/`, generated pages at the root.** `tools/build.py` (Python standard library only) joins the sources into `index.html` and `renying-offline.html`. GitHub Pages serves `index.html`.
- **Optional server.** A Cloudflare Worker with D1 handles accounts, saves, the armory economy, leaderboards, matchmaking, TURN credentials and the open world. The game works without it.

## Source Layout / 源码结构

| Path | Contents |
| :--- | :--- |
| `src/page.html` + `src/pages/` | Lightweight HTML shell (`page.html`) expanding 6 numbered screen partials (`src/pages/01-*.html` – `06-*.html`) |
| `src/style.css` + `src/styles/` | Base design tokens plus numbered per-page CSS modules (`docs/design/design-tokens.md`) |
| `src/data/` | Data tables, built **before** `src/game/` |
| `src/data/heroes/` | One file per hero (`NN-<id>.js`) |
| `src/data/10-modes.js`, `11-bp-orders.js` | Local and online modes, draft orders |
| `src/data/12-maps.js`, `13-chron.js`, `14-dummy.js`, `20-levels.js` | Terrain maps, world story, dummy options, AI levels |
| `src/data/30-ui-copy-*.js`, `31-hero-copy.js` | Chinese → English text for the interface and heroes |
| `src/game/` | Layered game modules (`01-engine/`, `02-combat/`, `03-render/` including `15-skin-weapons/`, `04-modes/` including `22-modes-12-bastion/`, `05-ui/`) |
| `src/ai/`, `src/models/ai-brain.json` | Modular computer AI (`01-kit-and-profiles.js` – `05-brain-hero-routes-and-team.js`) and trained gene model |
| `src/net-p2p.js`, `src/social.js` | Peer-to-peer connection, community features |
| `src/cloud/`, `src/errlog.js` | Modular cloud client (`01-config-and-ledgers.js` – `04-sync-and-accounts.js`), sync, error reports |
| `src/armory-core.js`, `src/armory/` | Armory rules (shared with the Worker) and modular armory UI (`01-skins-and-state.js` – `05-bridge-and-hooks.js`) |
| `src/anticheat.js` | Client-side integrity checks |
| `src/i18n.js` | Translation lookup (the text itself is in `src/data/30-ui-copy-*.js`) |
| `src/qfx/` | 青锋行 mini-game, built into `assets/qingfengxing.html` |
| `cloudflare/` | Numbered Worker source modules in `worker/`; generated `worker.js`, `worker.bundle.js` and `migrations.gen.js`; plus `admin.html`, `schema.sql`, `migrations/` and `wrangler.toml` |
| `tools/` | Build, tests, audits, AI training (`trainer.mjs`, `ai-train.mjs`), frame data, music tools |
| `docs/` | By topic: `ai/` (AI specs, frame data, AI benchmark, trainer reports), `bugs/`, `design/`, `ops/` (deploy runbook, admin guide), `project/`, `history/` (changelog, version history), and a copy of this wiki in `docs/wiki/` |

## Building / 构建

```bash
python3 tools/build.py
```

Regenerates every generated file: both game pages, the mini-game page, the Worker entry and bundle, and the migration list. It also runs `tools/checks/data-check.mjs`, which fails the build if a hero file or data table has a missing, unknown or wrong field, or if a story breaks the story template.

```bash
python3 tools/build.py --check
```

Fails if any generated file is out of date. CI runs it on every push.

Never edit `index.html`, `renying-offline.html`, `assets/qingfengxing.html`, `cloudflare/worker.js`, `cloudflare/worker.bundle.js` or `cloudflare/migrations.gen.js` by hand.

## Adding Things / 加内容

### A Hero / 加侠客

1. Create `src/data/heroes/NN-<id>.js` with `defHero({...})`, following the field reference in `src/data/00-heroes.js`.
2. Add the skill in `src/game/02-combat/03-skills/`, the ultimate in `src/game/02-combat/04-ults/`, skins and weapon looks in `src/game/03-render/13-skins.js` and `15-skin-weapons/`, and the AI profile in `src/ai/01-kit-and-profiles.js`.
3. Add the English text to `src/data/31-hero-copy.js`, the id to `C.HERO_IDS` in `src/armory-core.js`.
4. Rebuild, then run `node tools/tests/combat-test.mjs --sim` and `node tools/checks/frame-data.mjs`.

### A Mode / 加模式

Add one line to `MODES` (local) or `ROOM_MODES` (online) in `src/data/10-modes.js`; draft orders are in `src/data/11-bp-orders.js`.

### A Database Change / 改数据库

Add the next numbered file in `cloudflare/migrations/`, update `cloudflare/schema.sql`, rebuild and run `node tools/tests/econ-test.mjs`. Migrations run inside the Worker on its first request; never use `wrangler d1 migrations apply`. Details: `cloudflare/migrations/readme.md`.

## The Server / 服务器

- `cloudflare/worker.js` is assembled from numbered files in `cloudflare/worker/`; it handles HTTP routes under `/api/…` and the admin page at `/admin`.
- `WorldLine` Durable Objects run the open world lines.
- Big changes can ship behind server feature flags (admin page → 功能开关), off, Dev-only or on for everyone.
- CORS only allows the game's own page and local development.
- The Worker is deployed by the maintainer. Deploy, backup and rollback steps are in `docs/ops/deploy-runbook.md`; admin roles in `docs/ops/admin.md`.

## Determinism Rules / 确定性规则

Online play depends on both browsers computing the same match. In match logic:

- use `grnd()`, never `Math.random()` (visual effects may use `rand()`),
- keep every piece of match state inside the rollback snapshot,
- never read the wall clock or the frame rate.

`node tools/tests/rollback-test.mjs --rollback` and `node tools/tests/netplay-test.mjs` catch most mistakes.
