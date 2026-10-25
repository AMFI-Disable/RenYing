# 🛠 Architecture & Development / 系统架构与开发指南

## Build System (`tools/build.py`)

RenYing maintains a clean modular source tree in `src/` while compiling into single-file zero-dependency distributions:
- `python3 tools/build.py`: Bundles `src/*.js`, `src/style.css`, and `src/page.html` into `index.html` and `renying-offline.html`.
- `python3 tools/build.py --check`: Validates in CI that generated pages match sources with zero drift.

---

## Automated Verification & Test Suites

```bash
# 1. Economy & Marketplace integrity (389 tests)
node tools/econ-test.mjs

# 2. Combat state & hero moveset regressions
node tools/combat-test.mjs

# 3. Rollback determinism verification
node tools/rollback-test.mjs

# 4. Mobile & Touch layout audits
node tools/touch-audit.mjs
node tools/ui-audit.mjs
```

---

## Cloud Infrastructure (`cloudflare/`)
- Cloudflare Worker backend for cloud saves, account merges, and marketplace transactions.
- D1 SQLite schema in `cloudflare/schema.sql`.
- Admin console available at `cloudflare/admin.html`.
