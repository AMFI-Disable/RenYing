# RenYing — Bug Status Board

> [!NOTE]
> Snapshot of branch `arena/4976911d-renying` after `fix: isolate cloud saves`.
> The audit that started this work ran against the old Firebase/Firestore client; the cloud layer has since been
> rewritten upstream around a Cloudflare Worker with a D1 database and a server-side ink ledger. Findings that the
> rewrite removed by design are listed as superseded rather than silently dropped.

---

## 1. At A Glance

| | Critical | High | Medium | Low | Total |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **Fixed (through v1.1.0)** | 1 | 3 | 4 | 3 | **11** |
| **Superseded by Worker rewrite** | 2 | 4 | 1 | 0 | **7** |
| **Still open** | 0 | 0 | 0 | 0 | **0** |

Two rounds of work landed here. The first shipped against the old Firestore client and was merged as PR #2; when
main's history was replaced by a single commit with the Worker rewrite, that work was re-applied to the new code
so nothing was lost.

---

## 2. Fixed On This Branch

| ID | Bug | Where | Guard |
| :--- | :--- | :--- | :--- |
| C4 | A new account inherited the previous player's save from a shared cache key | `src/cloud.js` mirrors | `tools/tests/cloud-test.mjs` |
| C5 | A debounced save crossed an account switch and was written to the next account | `doSync`, `logout` | `tools/tests/cloud-test.mjs` |
| C10 | A save the server refused was retried forever, on every boot | `doSync` | `tools/tests/cloud-test.mjs` |
| C6 | A password with non-Latin-1 characters threw before a local account could exist | `pwHash` / `pwMatches` | `tools/tests/cloud-test.mjs` |
| C11 | Exported backups signed six fields and fell back to a 32-bit hash | `computeProfileDigest` | `tools/tests/cloud-test.mjs` |
| C2 / L2 | A guest profile answer overwrote the roster, ink, welfare flag and tasks | `applyProfile` | page-scope probe, manual |
| D6 | `#onlineLine` writes targeted an element no page renders | `src/game.js` | grep |

### C4 — One Account, One Mirror

Every local mirror is now `renying-prof-<uid>`; the shared `renying-cloud-cache` key is gone and
`migrateLegacyCache()` moves it into the current account once, then deletes it. `loadProfile()` reads only the
signed-in account's mirror instead of falling back to whoever saved last.

Why it mattered: on a shared device a freshly registered account could load the previous player's ink and roster
and then upload them as its own.

### C5 — A Save Belongs To The Account That Scheduled It

The pending payload carries its owner in `pendingUid`; `doSync()` drops it when the uid no longer matches, and
`logout()` clears both the timer and the payload. Verified: schedule a save as one account, sign out, register
another, wait past the debounce — no request reaches the second account.

### C10 — A Refusal Is Terminal, A Rate Limit Is Not

Any 4xx except 429 now clears the pending payload and the dirty marker and reports `blocked` in the account panel
and the top-bar dot, with a pointer to export a backup. Before, a 400/403 re-armed the retry timer and left the
dirty marker set, so the same doomed write repeated on every boot. 429 and network failures still retry with
backoff.

### C6 — Local Passwords That Do Not Crash

`btoa()` throws `InvalidCharacterError` on anything outside Latin-1, so a Chinese password could not create or open
a local account at all. `pwHash()` now uses SHA-256 through WebCrypto with a UTF-8-safe fallback, records `pwv: 2`,
and `pwMatches()` still accepts the old base64 records and upgrades them on the next successful login.

Cloud accounts were never affected — the Worker hashes the password itself.

### C11 / L3 — Signatures That Cover The Profile

The digest now signs all sixteen exported fields with sorted keys and records `_alg: sha256-v2` in the payload.
`verifyProfileDigest()` returns `ok` / `tampered` / `weak` / `unsigned` instead of a bare boolean and `null`, so an
old file is reported as weak rather than trusted. Exporting from a plain-HTTP page now fails with an explanation
instead of silently writing a 32-bit hash that looks like a signature. A `weak` import still works but carries a
note that only ink and win counts were covered.

### C2 / L2 — A Guest Answer Is A Hint

`applyProfile(p, opts)` treats `p.guest` as advisory: it may set the weekly rotation and drop rates and nothing
else. The destructive path is now behind `opts.reset`, which only signing out passes. On a `server.py`-hosted build
this was the difference between a save surviving a refresh and the roster collapsing to `qingfeng`.

### D6 And A Stray Import Call

The two `#onlineLine` writes are gone (`#netOnlineOverview` is the element that exists). The full-backup import
branch also called `importAccountData()` without awaiting it for a format that function rejects — an unhandled
rejection on every backup import; the call is removed.

---

## 3. Superseded By The Worker Rewrite

These were real against the Firestore client. The rewrite replaced the mechanism, so the code they describe no
longer exists. They are kept here so the history is not rewritten.

| ID | Old bug | What replaced it |
| :--- | :--- | :--- |
| C1 | Starter caps denied the first upload of any real save, permanently | The Worker merges the incoming profile server-side (`handleProfilePost`) and has no create-time cap |
| C9 | Per-write progression caps sat below a single session's gains | Ink moves through a ledger of deltas with daily allowances; the server accepts, caps and reports `capped` / `owed` instead of denying the write |
| C12 | `rating` / `placed` were dropped by the field whitelist; `rk` was silently stripped | `toCloudData()` now emits both, and `mergeProfiles()` merges `rk` |
| C7 | The dev superuser test could never match; the dev password shipped in the bundle | No client-side dev login path; `Dev` is a reserved nickname created from the admin backend (`/api/admin/*`, `tools/admin/econ-admin.mjs`) |
| D1 | Two growth systems with drifted rates | The armory economy runs in the Worker only; `/api/econ` and `/api/market` are the single source, covered by `tools/tests/econ-test.mjs` |
| D2 | Eight server endpoints were dead code | Those endpoints are gone with `server.py` |
| D3 / D4 / D5 | Two rank ladders, two task systems, two difficulty tables | Ladder, tasks and rewards are defined once in `src/` and `cloudflare/worker.js` |

---

## 4. Resolved Follow-Up Items (O1 To O5)

All four previously open follow-up items (`O1`–`O4`) and the combat flake (`O5`) are resolved on `main` as of `v1.1.0`:

| ID | Issue | Resolution | Guard |
| :--- | :--- | :--- | :--- |
| O1 | Full-backup import switched active account silently | `importAccountData()` returns `{ uid, name, profile, note }` and the UI announces the switched account | `tools/tests/cloud-test.mjs` |
| O2 | `loadProfile()` re-uploaded once per boot when local ink exceeded cloud ink | `loadProfile()` checks `dirtyKey()` before calling `ledgerNote()`, snapping clean boots to the authoritative server ledger with zero redundant `POST /api/profile` writes | `tools/tests/cloud-test.mjs` |
| O3 | Weak (v1) backup accepted silently | `importAccountData()` surfaces `note` ("旧版备份：只有墨锭与胜负经过校验") in the UI | `tools/tests/cloud-test.mjs` |
| O4 | `mergeProfiles()` took max of `netWins` / `netLosses` | `netWins`, `netLosses`, and hero fragments moved to the incremental progress ledger (`progAdopt` / `progAck`) | `tools/tests/sync-test.mjs` |
| O5 | Intermittent 2v2 last-stand meter test flake | Cleared per-mode `M.flags` and asserted immediately after `applyHit()` | `tools/tests/combat-test.mjs` |

---

## 5. Regression Coverage

`tools/tests/cloud-test.mjs` runs in CI as **Cloud Save Client Tests** in a Node `vm` with a mock Worker, `localStorage`, and `document`, verifying per-account mirrors, pending save ownership, 4xx refusal handling, non-Latin-1 local passwords, SHA-256 v2 export signatures, and O2 clean-boot sync idempotency.

Full local run:

```bash
python3 tools/build.py --check
node tools/tests/cloud-test.mjs
node tools/tests/sync-test.mjs
node tools/tests/econ-test.mjs --bundle
node tools/tests/predeploy-check.mjs
node tools/tests/combat-test.mjs --sim
```

---

## 6. Notes On Architecture History

- The original audit targeted legacy files (`firestore.rules`, `server.py`) that were completely replaced by the Cloudflare Worker + D1 architecture (`cloudflare/worker/` and `cloudflare/migrations/`).
- `docs/project/codebase-and-heroes.md` has been refreshed for `v1.1.0` to reflect the Cloudflare Worker + D1 + PeerJS architecture and 20-hero roster.
