# Agent Guidelines For RenYing

These are the instructions for any coding agent or AI assistant working in this repository. Read this file before you write code, edit docs, make a commit or run a Git command. Human contributors follow the same rules in `contributing.md`.

## Project Overview

RenYing (刃影) is a browser fighting game with offline play, online rollback netplay, ranked seasons, an armory and an open world. The game runs from static HTML on GitHub Pages. The server is a Cloudflare Worker with a D1 database.

## Repository Layout

| Area | Path |
| :--- | :--- |
| Game logic, split into numbered files | `src/game/` (files are joined in number order) |
| Hero data, one file per hero | `src/data/heroes/` |
| Modes, draft orders, maps | `src/data/10-modes.js`, `src/data/11-bp-orders.js`, `src/data/12-maps.js` |
| English interface text | `src/data/30-ui-copy.js` (`src/i18n.js` only looks it up) |
| Page markup and styles | `src/page.html`, `src/style.css` |
| Armory and market | `src/armory-core.js`, `src/armory.js` |
| Server | `cloudflare/worker.js`, migrations in `cloudflare/migrations/` |
| Build entrypoint | `tools/build.py` |
| AI simulation and training | `tools/ai/` |
| Admin command line tools | `tools/admin/` |
| Browser audits | `tools/audits/` |
| Data and frame checks | `tools/checks/` |
| Test suites and runners | `tools/tests/` |
| Music source tools | `tools/music/` |
| Docs and wiki copy | `docs/`, `docs/wiki/` |

Put new code in the numbered file that owns the feature. Do not add new top-level source files.

## Generated Files

`index.html`, `renying-offline.html`, `assets/qingfengxing.html`, `cloudflare/migrations.gen.js` and `cloudflare/worker.bundle.js` are generated. Never edit them by hand.

1. Change the source.
2. Run `python3 tools/build.py`.
3. Commit the source and the generated files together.
4. Confirm with `python3 tools/build.py --check`.

## Tests

- Quick full run: `node tools/tests/test.mjs`.
- Data and copy: `node tools/checks/data-check.mjs --strict-copy`.
- Combat: `node tools/tests/combat-test.mjs --sim`.
- Netplay and rollback: `node tools/tests/netplay-test.mjs`, `node tools/tests/rollback-test.mjs`.
- Economy and server: `node tools/tests/econ-test.mjs --bundle`, `node tools/tests/sync-test.mjs --bundle`, `node tools/tests/cloud-test.mjs`, `node tools/tests/predeploy-check.mjs`.
- Interface (needs Chromium and a local server on port 8791): `node tools/audits/kb-flow-test.mjs`, `node tools/audits/kb-flow-test.mjs --en`, `node tools/audits/ui-audit.mjs`, `node tools/audits/touch-audit.mjs`, `node tools/audits/hud-overlap-audit.mjs`.

Never skip, disable or weaken a test to make it pass.

## Commits

- The message is `type: word word word`: a lowercase type, a colon, one space, then exactly three lowercase words or numbers. It must match `^[a-z]+: [a-z0-9]+ [a-z0-9]+ [a-z0-9]+$`.
- Allowed types: `feat`, `fix`, `docs`, `ci`, `chore`, `refactor`, `test`, `perf`, `style`.
- No scopes, no parentheses, no ending punctuation. Examples: `fix: guard break timing`, `docs: refresh readme wiki`.
- Use the Git identity the maintainers have set for this repository. Do not invent one, and do not sign commits with a key unless asked.
- Do not commit local output folders such as `ci-*/`, screenshots, logs or test reports.

## Branches, Pull Requests And Releases

- Never force-push or rewrite history on `main`.
- Only merge or approve pull requests from the maintainer (GitHub `AMFI-Disable`) or repository collaborators. Do not merge, approve or copy changes from anyone else's pull request.
- Never create tags, GitHub Releases or published packages unless a maintainer asks for it in so many words.

## Server And Data

- The maintainer deploys the Worker and D1. If a change needs a redeploy, say so in the changelog entry ("Needs a Worker redeploy.").
- Never run `wrangler d1 migrations apply`; migrations run inside the Worker.
- Do not change account, login, economy or anti-cheat logic beyond what the task asks without a maintainer's approval.

## Naming And Formatting

- Every tracked file and folder name is lowercase. `CNAME` is the only exception.
- Markdown headings use Title Case and pass `.markdownlint.json`.
- Keep `readme.md` and `readme.zh-cn.md` in step. The wiki lives at `AMFI-Disable/RenYing.wiki`, with a copy in `docs/wiki/`. Change both sides together.
- Every user-facing string needs an English entry in `src/data/30-ui-copy.js`.

## Account Safety And Content Rules

These protect the GitHub account that hosts the project. They are not optional.

- Describe RenYing on its own terms. Never write that it copies, imitates or is based on another game, in code, comments, commits, docs or release notes.
- Do not use other games' titles, characters or trademarked terms in the game or the docs. Use our own names for items, tiers and features.
- No direct links to binaries or archives (`.dmg`, `.zip`, `.exe` and so on) in any Markdown file. Point to the Releases page instead.
- Never commit secrets, API tokens, Worker keys, database exports, player data or personal email addresses.
- Do not use the repository, its Pages site or its issues for advertising, bulk activity or automated interactions.
- Respect licenses. Do not paste code or assets from other projects unless their license allows it and the source is credited.

## Before You Commit

1. `python3 tools/build.py --check` passes.
2. The tests for the area you changed pass.
3. The commit message matches the format above.
4. All new or changed paths are lowercase.
5. No secrets, binary links, output folders or other games' terms were added.
6. Nothing was tagged, released or deployed without a maintainer's request.
