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
| **Fixed on this branch** | 1 | 3 | 2 | 1 | **7** |
| **Superseded upstream** | 2 | 4 | 1 | 0 | **7** |
| **Still open** | 0 | 0 | 2 | 2 | **4** |

Two rounds of work landed here. The first shipped against the old Firestore client and was merged as PR #2; when
main's history was replaced by a single commit with the Worker rewrite, that work was re-applied to the new code
so nothing was lost.

---

## 2. Fixed On This Branch

| ID | Bug | Where | Guard |
| :--- | :--- | :--- | :--- |
| C4 | A new account inherited the previous player's save from a shared cache key | `src/cloud.js` mirrors | `tools/cloud-test.mjs` |
| C5 | A debounced save crossed an account switch and was written to the next account | `doSync`, `logout` | `tools/cloud-test.mjs` |
| C10 | A save the server refused was retried forever, on every boot | `doSync` | `tools/cloud-test.mjs` |
| C6 | A password with non-Latin-1 characters threw before a local account could exist | `pwHash` / `pwMatches` | `tools/cloud-test.mjs` |
| C11 | Exported backups signed six fields and fell back to a 32-bit hash | `computeProfileDigest` | `tools/cloud-test.mjs` |
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
| C7 | The dev superuser test could never match; the dev password shipped in the bundle | No client-side dev login path; `Dev` is a reserved nickname created from the admin backend (`/api/admin/*`, `tools/econ-admin.mjs`) |
| D1 | Two growth systems with drifted rates | The armory economy runs in the Worker only; `/api/econ` and `/api/market` are the single source, covered by `tools/econ-test.mjs` |
| D2 | Eight server endpoints were dead code | Those endpoints are gone with `server.py` |
| D3 / D4 / D5 | Two rank ladders, two task systems, two difficulty tables | Ladder, tasks and rewards are defined once in `src/` and `cloudflare/worker.js` |

---

## 4. Still Open

### 4.1 Medium

**O1 — A full-backup import switches the active account without saying so.**
`importAccountData()` writes `renying-local-current` and sets `currentUser` for the account it imports, so restoring
a backup silently signs the player into it. The single-account branch the UI uses does the same. It is arguably the
intended "restore" behaviour, but it is not announced: the toast says the account was restored, not that the
session changed. Needs a decision — either an explicit "switch to this account?" prompt or a line in the toast.

**O2 — `loadProfile()` re-uploads once per boot when local ink exceeds the cloud's.**
`localChanged` compares the merged profile against the cloud copy, and `mergeProfiles()` takes the maximum ink, so
any local gain triggers a delayed `saveProfile()` on every load. Usually harmless (the server recomputes ink from
the ledger), but it is one extra write per app start and could keep a "pending" dot on screen. Not fixed because
the correct rule depends on how the ledger's `owed` accounting is meant to settle.

### 4.2 Low

**O3 — A `weak` (v1) backup is accepted silently.**
The import note is attached to the returned profile (`_importNote`) but the UI does not display it yet. The
information is now available; surfacing it is a two-line change in the import handler.

**O4 — `mergeProfiles()` takes the maximum of `netWins` / `netLosses`.**
Correct for "never lose progress", wrong for a loss that only exists on one side: merging two devices can raise the
loss count without a corresponding win. The rating path is server-owned, so this only affects the displayed record.

**Fixed during this pass — the combat suite flake (was O5).**
`tools/combat-test.mjs --sim` used to fail intermittently on "2v2 Single KO Survival: Surviving teammate did not
receive last stand meter buff" (reproduced 2/3 runs on `903dfaa`, so it predates this branch). It was a test bug
with two causes, both now fixed, and the suite passes 10/10 consecutive runs:

- `M.flags['buff_<idx>']` is per-match state, so the first mode that triggered the buff left the flag set and the
  following modes short-circuited the guard — the check silently passed when it should have exercised the mechanic.
- The check read `D.meter` **after** `step()`, by which time the AI had already spent the meter it was granted, and
  occasionally the whole round had restarted. The assertion now clears the flag per mode and reads the meter
  immediately after `applyHit()`, before the engine gets a frame.

The game behaviour was correct all along: the last-stand buff fires once per fighter per match and grants full
meter, which the AI is free to spend on the next frame.

---

## 5. Regression Coverage

`tools/cloud-test.mjs` is new and runs in CI as **Cloud Save Client Tests**. It loads `src/cloud.js` in a Node
`vm` with a fake Worker, a fake `localStorage` and a fake `document`, and asserts twenty behaviours:

| Group | Checks |
| :--- | :--- |
| Per-account mirrors | no shared key at boot, per-account mirror written, a new account inherits nothing |
| Pending save ownership | nothing written to the next account, stale payload dropped |
| Refusal handling | 4xx reports `blocked`, dirty marker cleared, exactly one attempt, 429 still retries |
| Local passwords | Chinese password registers, logs back in, stored as `v2$` |
| Export signatures | signature produced, `stageStars` and `frags` tampering detected, `ok` / `tampered` / `unsigned` |

It has no dependencies (no `linkedom`, no network), so it runs anywhere Node runs.

Full local run:

```bash
python3 tools/build.py --check
node tools/cloud-test.mjs          # 20 checks
node tools/econ-test.mjs           # 396 checks
node tools/combat-test.mjs --sim   # 22 checks
```

---

## 6. Notes On The Two Rounds

- **Round one** (merged as PR #2, `539503c`) fixed C2, C3, C4, C5, C10, D6, L2 against the Firestore client and
  shipped three documents: an audit, a remediation plan and a status board.
- Upstream then replaced `main` with a single commit (`903dfaa`) containing the Worker rewrite. The branch was
  reset onto it and the fixes re-applied by hand; C3 was already fixed upstream (`owned` defaults to `['qingfeng']`,
  a blank name to `侠客`), so it is not re-claimed here.
- The audit and plan documents were written against files that no longer exist (`firestore.rules`, `server.py`).
  They were not restored; their still-relevant findings are the ones carried into this board.
- `docs/codebase-and-heroes.md` still describes the Firebase-era layout in places (it references `server.py` and
  `firestore.rules`). It is otherwise accurate about the game core and needs a refresh pass, not a correction.
