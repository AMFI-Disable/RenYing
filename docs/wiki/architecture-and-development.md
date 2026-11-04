# Architecture And Development / 架构与开发

## Big Picture / 总体

- **No framework, no bundler, no runtime npm packages.** The game is vanilla JavaScript drawing on one `<canvas>`. Vendored libraries are only `assets/peerjs.min.js` (handshake) and `assets/three.min.js` (青锋行).
- **Sources in `src/`, generated pages at the root.** `tools/build.py` (Python standard library only) joins the sources into `index.html` and `renying-offline.html`. GitHub Pages serves `index.html`.
- **Optional server.** A Cloudflare Worker with D1 handles accounts, saves, the armory economy, leaderboards, matchmaking, TURN credentials and the open world. The game works without it.

## Source Layout / 源码结构

| Path | Contents |
| :--- | :--- |
| `src/page.html` | Page markup with build markers |
| `src/style.css` | All styles; design tokens are documented in `docs/design-tokens.md` |
| `src/data/` | Data tables, built **before** `src/game/` |
| `src/data/heroes/` | One file per hero (`NN-<id>.js`) |
| `src/data/10-modes.js`, `11-bp-orders.js` | Local and online modes, draft orders |
| `src/data/12-maps.js`, `13-chron.js`, `14-dummy.js`, `20-levels.js` | Terrain maps, world story, dummy options, AI levels |
| `src/data/30-ui-copy.js`, `31-hero-copy.js` | Chinese → English text for the interface and heroes |
| `src/game/` | The game, numbered files joined in order (`01-core.js` constants and RNG, `02-heroes.js`, `03-skills.js`, `04-ults.js`, … `26-kbnav.js` keyboard navigation) |
| `src/ai.js`, `models/ai-brain.json` | Computer opponents and the trained model behind the top level |
| `src/net-p2p.js`, `src/social.js` | Peer-to-peer connection, community features |
| `src/cloud.js`, `src/errlog.js` | Accounts, sync, error reports |
| `src/armory-core.js`, `src/armory.js` | Armory rules (shared with the Worker) and screens |
| `src/anticheat.js` | Client-side integrity checks |
| `src/i18n.js` | Translation lookup (the text itself is in `src/data/30-ui-copy.js`) |
| `src/qfx/` | 青锋行 mini-game, built into `assets/qingfengxing.html` |
| `cloudflare/` | `worker.js`, `admin.html`, `schema.sql`, `migrations/`, `wrangler.toml`; `worker.bundle.js` and `migrations.gen.js` are generated |
| `tools/` | Build, tests, audits, AI training (`trainer.mjs`, `ai-train.mjs`), frame data, music tools |
| `docs/` | Design notes, deploy runbook, admin guide, frame data, AI benchmark, and a copy of this wiki in `docs/wiki/` |

## Building / 构建

```bash
python3 tools/build.py
```

Regenerates every generated file: both game pages, the mini-game page, the Worker bundle and the migration list. It also runs `tools/checks/data-check.mjs`, which fails the build if a hero file or data table has a missing, unknown or wrong field, or if a story breaks the story template.

```bash
python3 tools/build.py --check
```

Fails if any generated file is out of date. CI runs it on every push.

Never edit `index.html`, `renying-offline.html`, `assets/qingfengxing.html`, `cloudflare/worker.bundle.js` or `cloudflare/migrations.gen.js` by hand.

## Adding Things / 加内容

### A Hero / 加侠客

1. Create `src/data/heroes/NN-<id>.js` with `defHero({...})`, following the field reference in `src/data/00-heroes.js`.
2. Add the skill to `src/game/03-skills.js`, the ultimate to `src/game/04-ults.js`, skins and weapon looks in `src/game/13-skins.js` to `15-skin-weapons.js`, and the AI profile in `src/ai.js`.
3. Add the English text to `src/data/31-hero-copy.js`, the id to `C.HERO_IDS` in `src/armory-core.js`.
4. Rebuild, then run `node tools/tests/combat-test.mjs --sim` and `node tools/checks/frame-data.mjs`.

### A Mode / 加模式

Add one line to `MODES` (local) or `ROOM_MODES` (online) in `src/data/10-modes.js`; draft orders are in `src/data/11-bp-orders.js`.

### A Database Change / 改数据库

Add the next numbered file in `cloudflare/migrations/`, update `cloudflare/schema.sql`, rebuild and run `node tools/tests/econ-test.mjs`. Migrations run inside the Worker on its first request; never use `wrangler d1 migrations apply`. Details: `cloudflare/migrations/readme.md`.

## The Server / 服务器

- `cloudflare/worker.js` handles HTTP routes under `/api/…` and the admin page at `/admin`.
- `WorldLine` Durable Objects run the open world lines.
- Big changes can ship behind server feature flags (admin page → 功能开关), off, Dev-only or on for everyone.
- CORS only allows the game's own page and local development.
- The Worker is deployed by the maintainer. Deploy, backup and rollback steps are in `docs/deploy-runbook.md`; admin roles in `docs/admin.md`.

## Determinism Rules / 确定性规则

Online play depends on both browsers computing the same match. In match logic:

- use `grnd()`, never `Math.random()` (visual effects may use `rand()`),
- keep every piece of match state inside the rollback snapshot,
- never read the wall clock or the frame rate.

`node tools/tests/rollback-test.mjs --rollback` and `node tools/tests/netplay-test.mjs` catch most mistakes.
