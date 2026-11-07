# RenYing — Accounts And Local Storage Bug List

> [!NOTE]
> Audit only. Nothing in this document has been fixed yet, and no code was changed to produce it.
> Every entry names the file and line it comes from on `89bdbe1` (`docs: redeem codes guide`), states what the
> player actually sees, and where possible was replayed in a headless copy of `index.html` to confirm it.

---

## 1. How This List Is Organised

The game keeps account data in two places at once: `localStorage` on the device, and a Cloudflare Worker with a D1
database when the player is signed in. Most of the bugs below come from the seam between those two — the same
fact stored twice under two different names, or stored once under a name that is not the account.

Entries are grouped by the part of the flow they break, and each one carries an ID so it can be tracked:

| Group | What it covers | Entries |
| :--- | :--- | ---: |
| A | Which key a piece of progress lands in, and whether that key identifies the account | 8 |
| B | Signing in, registering, and the fallbacks that quietly do something else | 7 |
| C | Tokens, sessions, and what the browser keeps on disk | 6 |
| D | Saving, restoring, exporting and migrating a save | 9 |
| F | Server-side account handling in `cloudflare/worker.js` | 4 |
| G | Social identity and the data left behind on a shared device | 5 |

Section 7 lists every storage key the client touches, so a future change can be checked off key by key.

---

## 2. At A Glance

| | Critical | High | Medium | Low | Total |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **Accounts and storage** | 2 | 10 | 15 | 12 | **39** |

The two critical ones are worth naming up front:

- **B1** — a failed sign-up (rate limit, network blip, server error, reserved nickname) does not fail. It silently
  creates a local account and tells the player "注册成功".
- **D1** — signing out throws the guest save away and rebuilds it from a hardcoded 500 ink.

---

## 3. Account Identity And Key Scoping

### A1 — Progress Is Filed Under The Nickname, The Save Is Filed Under The Uid

**Severity:** high · `src/game.js:11049`, `11109`, `11168`, `11458`, `11461`; `src/cloud.js:197`

```text
flagsKey()   → 'renying-flags-'  + curName()   // claimed codes, tutorial flag
taskKey(name)→ 'renying-tasks-'  + (name || 'guest')
compKey()    → 'renying-comp1022-' + curName()
rkOwner()    → CloudSave.getUser().name || ACC.name
rkState()    → 'renying-rk-' + owner            // rank points, placement, history
profKey(uid) → 'renying-prof-' + uid            // the actual save
```

The save is keyed by uid; four other slices of account state are keyed by the display name. They agree only while
one name maps to exactly one uid. That stops being true in two ways the client allows:

- A local account can be created for a name that already exists on the server (see **B1**, **B4**, **B7**), giving
  two uids with one name. Both then share one `renying-flags-*`, one `renying-tasks-*` and one `renying-rk-*`.
  Claim records and rank points are what those files hold, so a fresh account can inherit someone else's claims and
  someone else's season points.
- `rkState()` also accepts `PROF.rk` from the cloud when its `owner` matches the name, so the two sources of truth
  disagree for the same reason.

**What goes wrong:** one-time rewards are already claimed for the wrong person, and a rank ladder position visibly
belongs to a different account with the same nickname.

### A2 — The Literal Nickname `guest` Is The Same Bucket As Being Signed Out

**Severity:** low · `src/game.js:11049`, `11168`; `cloudflare/worker.js:592`

Both key builders fall back to the string `guest` when there is no signed-in name, and `guest` is not in the
Worker's `RESERVED` list, so a player can register it. That account then reads and writes the exact keys the
signed-out state uses. The harness confirms the fallback works as written (`loadFlags()` on a signed-out profile
reads `renying-flags-guest`).

**What goes wrong:** a `guest` account and the anonymous device state take turns overwriting each other's claim
records and task progress.

### A3 — Stage Stars Are Global And Never Loaded Back

**Severity:** high · `src/game.js:1871`–`1872`, `1941`–`1943`; `src/cloud.js:306`

`renying-stage` is a single device-wide key with no account scope. Worse, the reverse direction is missing too:

- `stageShowEnd()` writes the star map into `PROF.stageStars` and uploads it (`1941`).
- Nothing ever assigns `PROF.stageStars` back into `STAGE_STARS`. `applyProfile()` is `Object.assign(PROF, p)`
  (`src/game.js:11078`), and `stageOpen()` only reads `STAGE_STARS` (`1873`), so the cloud copy is decoration.

Replayed in the harness:

```text
STAGE_STARS before applyProfile = {}
PROF.stageStars = {"s1":3,"s2":3,"s3":2}
STAGE_STARS after applyProfile  = {}
stageOpen(0,1) with cloud stars = false
```

**What goes wrong:** on a second device — or after clearing site data — every chapter is locked again while the
profile insists the stars were earned. And because the key is device-wide, a second account on the same browser
starts with the first account's unlocked chapters.

### A4 — The Saved Star Map Is The Live Object

**Severity:** low · `src/game.js:1941`

`PROF.stageStars = STAGE_STARS` stores a reference. The two later diverge in behaviour (see **A3**), and any
in-place edit of `PROF.stageStars` mutates the in-memory progress map without a `setItem` or an upload.

### A5 — Local Account Names Are Case-Sensitive, Server Names Are Not

**Severity:** medium · `src/cloud.js:628`, `685`; `cloudflare/worker.js:72`

`renying-local-accounts` is a plain object keyed by the string the player typed, while the D1 `users` table is
`username TEXT UNIQUE NOT NULL COLLATE NOCASE`. Locally `Abc` and `abc` are two accounts with two password records;
on the server they are one. After promotion of either to the cloud, one of the two local records is orphaned and
its mirror is never read again.

### A6 — Account State That Lives In Device-Wide Keys

**Severity:** medium · see Section 7 for line references

Tutorial completion, the 青锋行 clear count, the compensation claim marker, the tower run, the replay list, the last
picked hero and the 1P keybinds are all stored once per browser, not once per account. The tutorial case is the
clearest: `updateTutBtn()` reads `renying-tut-seen` / `renying-tut-done` (`src/game.js:11862`) while the account
field `PROF.tutorial` is set separately (`11872`–`11873`), so a first-time account on a used browser never sees the prompt
and never earns the completion flag.

Two of these are not just cosmetic:

- `renying-qfx` holds the best 青锋行 wave for the whole browser, and `PROF.qfx` is per account — every new account
  on that browser inherits the old progress number.
- `qfx2` (the embedded 青锋行 save, `src/qfx/75-meta.js:2`) holds `soul`, unlocks and the best record for the whole
  browser, so a second account starts that mode with the first account's currency.

### A7 — Adaptive Difficulty Carries Over Between Accounts Until Reload

**Severity:** medium · `src/game.js:1765`, `1766`, `14830`, `15377`; `src/game.js:15030`

`adaptKey()` is `renying-adapt` plus `'-' + ACC.name`, and `adaptLoad()` runs in exactly two places: at boot and
inside `setAcc()`. `doAcc()` — the function behind the login and register buttons — sets `ACC.name` directly and
never calls `adaptLoad()`, and `setAcc()` is only reachable from two legacy message handlers (see **C4**).

So after signing in as a different account, the previous account's tuning object is still in memory, and the next
`adaptSave()` (`1788`) writes it under the new account's key.

**What goes wrong:** a new account starts with the previous player's aim/aggression tuning, and that value is then
persisted as its own.

### A8 — `renying-equip` Is Written Three Times And Read Once

**Severity:** low · `src/game.js:10559`, `14569`, `15200`, `15404`

`PROF.equip` already lives in the profile and in the cloud. The flat `renying-equip` copy is written on every
skin change but only read by the offline build, so on the online build it is a stale duplicate of an account field
sitting in a global key — and `claimLegacyAccount()` (`15200`) writes into it as well.

---

## 4. Signing In And Registering

### B1 — Every Failure That Is Not "Already Registered" Becomes A Local Account

**Severity:** critical · `src/cloud.js:573`–`644`, `src/cloud.js:646`–`742`

`register()` catches its own request and only rethrows when the message contains both `已` and `注册`
(`src/cloud.js:623`). Everything else falls through to the local branch at `626`–`643`, which writes
`renying-local-accounts`, sets `renying-local-current` and returns a normal-looking user object. `login()` has the
same shape at `679`–`742`.

The paths that land in the fallback today:

| Trigger | Server behaviour | What the player gets |
| :--- | :--- | :--- |
| More than 6 registrations from one IP in an hour | `429 注册太频繁了` (`worker.js:977`) | A local account, no warning |
| Network failure, ad blocker, offline | No answer | A local account, no warning |
| `500` from D1 | `服务器内部错误` (`worker.js:1160`) | A local account, no warning |
| Reserved nickname such as `admin` | `400 这个昵称不能用` (`worker.js:996`) | A local account with that name |

`doAcc()` then reports `注册成功！大侠 <name>，已开启专属存档` (`src/game.js:15050`), so the player believes the
account is on the server. It is not: it exists only in this browser, `isCloud` is `false`, and from then on every
save stays local while the account panel says `本地存档`.

The login side is worse in one respect. If the server answers `401` but a local account with that name and that
password exists, the player is signed into the **local** account, and the fallback then silently tries
`POST /api/register` for it (`700`–`730`); if that also fails, it returns the local account anyway (`735`–`740`).

### B2 — A Corrupted Account Table Turns Sign-Up Into A Crash

**Severity:** high · `src/cloud.js:628`

```js
} catch (err) {
  ...
  const mockUsers = JSON.parse(localStorage.getItem('renying-local-accounts') || '{}');
```

This parse sits inside the catch block, not inside its own `try`. Any malformed `renying-local-accounts` value —
truncated by a quota error, written by an older build, or edited — makes `register()` reject with a raw
`SyntaxError` instead of creating a local account or explaining itself. Replayed:

```text
register with corrupt account table -> SyntaxError: Expected property name or '}' in JSON at position 1
```

The equivalent place in `login()` is guarded (`685`), so the two paths disagree about how much they trust storage.

### B3 — The Dev Account Can Be Fabricated Offline With Any Password

**Severity:** high · `src/cloud.js:500`–`568`, `578`–`581`; `src/game.js:11294`–`11340`

`loginDev()` rethrows only when the server actually answered (`if (netErr && netErr.status)`, `550`). A network
failure therefore builds a local `dev_master` profile with `isDevMaster: true` at `553`–`566` — for **any**
password typed. `register('Dev', …)` routes into the same function (`578`).

`isDevMaster` is exactly the check the super redemption code trusts (`src/game.js:11296`), so offline, or while
rate-limited, anyone can type `Dev` / `x` and then redeem `VG8KS7K8PYP5R36P` for 1,000,000 ink, every hero and
skin, 1000 of each case and rank 25000. `DEV_SESSION_UNLOCKED` (all chapters, all skins) is set from the same
branch and kept in `sessionStorage` (`11367`).

The unlocked state is local, and the Worker will not accept most of it from a non-Dev account (`worker.js:575`),
but the profile mirror keeps it, so that browser is permanently unlocked.

### B4 — Reserved Nicknames Are Only Enforced On The Server

**Severity:** medium · `cloudflare/worker.js:592`; `src/cloud.js:573`

`RESERVED` lives in the Worker only. Through **B1**, a rejected `官方` / `admin` registration becomes a local
account carrying that name, which then renders in the account bar and in friend requests as if it were official.

### B5 — Local Passwords Are Unsalted, And The Backup File Contains The Hashes

**Severity:** medium · `src/cloud.js:147`–`160`, `1031`

`pwHash()` is `SHA-256('ry_pw_v2|' + password)` with no per-record salt, stored as `v2$…` in
`renying-local-accounts`. Two players who pick the same password get the same record, and a precomputed table
cracks the whole file at once.

`exportAllAccounts()` then pushes the raw record:

```js
accounts.push({ account: u, profile: prof, _sig: … });   // u includes .pw
```

so a support ticket that includes a backup file hands over the password hashes for every local account on that
device.

### B6 — Login Tells You Whether A Nickname Exists

**Severity:** medium · `cloudflare/worker.js:1059`–`1070`

An unknown nickname returns `404 未找到该账号，请先点击“注册”`; a known nickname with a wrong password returns
`401 昵称或密码不对`. That is a working account enumerator, and it makes the lockout easy to aim at a specific
nickname.

### B7 — Local Accounts Are Silently Promoted To Cloud Accounts

**Severity:** low · `src/cloud.js:679`–`742`

A successful local login automatically attempts `POST /api/register` with the local mirror, and on success rewrites
the record's uid to the new cloud id (`708`–`724`). Usually helpful. When the registration fails, the player stays
on the local account (`735`–`740`) with no explanation, and if a cloud account with that name exists, they now have
two accounts and are looking at the wrong one.

---

## 5. Tokens, Sessions And What Lands On Disk

### C1 — The Bearer Token Is Stored Twice, And A Uid Is Stored Where A Token Goes

**Severity:** high · `src/cloud.js:173`–`184`, `609`; `src/game.js:14816`, `14818`, `14828`, `15384`

- `renying-cloud-token` is the real 30-day session token (`src/cloud.js:175`).
- `renying-local-current` also stores the full user object, including `token` (`609`, `670`, `723`) — a second copy
  of the same secret in a second key.
- `renying-token` is a third key, read at boot into `ACC.token` (`14816`), persisted by `setAcc()` (`14828`), and
  sent as `Authorization: Bearer …` by `api()` (`14818`).
- But the boot block sets `ACC.token = cu.uid` (`15384`). For a signed-in player, `ACC.token` therefore holds a uid,
  not a token.

`renying-token` is only written by `setAcc()`, which is only reachable from two dead handlers (see **C4**), so today
the key is vestigial — but it is read on every boot, never cleared, and would be sent as a bearer token by any code
that revives `api()`.

**What goes wrong:** sign-out only clears two of the three copies by design, and any injected script that reads
`localStorage` gets a live 30-day credential.

### C2 — An Expired Or Refused Session Is Never Surfaced

**Severity:** high · `src/cloud.js:178`–`192`, `438`–`492`; `src/game.js:14847`

`cloudActive()` is "an endpoint is configured, `isCloud` is true, and a token string exists" (`src/cloud.js:188`).
It never asks whether that token still works. Consequences:

- `renderAcc()` decides the `云端已连` badge from `hasValidConfig()` alone (`src/game.js:14846`), so the badge stays
  green after the 30-day session expires.
- The next `POST /api/profile` answers `401`; `doSync()` treats any 4xx other than 429 as terminal, clears
  `pendingData` **and** `renying-sync-dirty-<uid>` (`src/cloud.js:474`–`478`), and waits for the player to act.

Nothing offers that action. The panel notes the refusal, but there is no "sign in again" prompt and no queue: the
save stays in the local mirror and simply stops reaching the cloud.

### C3 — Sign-Out Only Ends The Session It Is Called From

**Severity:** medium · `cloudflare/worker.js:1149`; `815`–`832`

`POST /api/logout` deletes the presented token and nothing else. Sessions live 30 days with no refresh and no
rotation, so a phone, a laptop and a shared PC can all hold valid tokens for the same account, and a player has no
way to end them. Admins can: `POST /api/admin/password` deletes every session for the user (`830`).

### C4 — Two Dead Auth Paths And A Leaderboard That Cannot Load

**Severity:** low · `src/game.js:1508`–`1560`, `15359`, `15367`, `15368`; `cloudflare/worker.js` router

- `else if (m.sys === 'result') { if (m.me) setAcc(m.me); }` (`1552`) survives from the old room server. `'result'`
  is not in `P2P_SYS` (`src/net-p2p.js:37`), so the branch is unreachable — but if it were reachable, `setAcc()`
  would copy a peer-supplied `me.token` into `ACC.token` and persist it to `renying-token`.
- The leaderboard screen calls `api('/api/ranklb')` (`15359`) and `api('/api/leaderboard')` (`15367`). The Worker
  routes only `register`, `login`, `logout`, `profile`, `econ`, `ac`, `market` and `admin/*`, and `api()` builds a
  path relative to whatever origin served the page (GitHub Pages), not the Worker endpoint. Both tabs of the
  leaderboard therefore always show `读取失败`.
- `api()` reads `j.err` for the message (`14822`) while the Worker returns `error` (`worker.js:48`), so even a real
  error would be printed as the generic `服务器出错了`.

### C5 — The API Endpoint Is User-Editable, And Passwords Go To It

**Severity:** medium · `src/cloud.js:9`–`30`; `src/game.js:15069`–`15099`

`renying-cloud-endpoint` (or `window.RENYING_CLOUD_API`) replaces the Worker address, and the account panel exposes
a text box that writes it (`fbCfgSaveBtn`). `register()` and `login()` POST the plaintext password to whatever that
value holds. Anyone with thirty seconds at a browser, or any script on the page, can point the client at a
look-alike endpoint and collect every password entered afterwards.

### C6 — `renying-token` Is Never Cleaned Up

**Severity:** low · `src/game.js:14816`, `14828`; `src/cloud.js:184`

`logout()` clears `renying-cloud-token` and `renying-local-current`, but no code path removes `renying-token`. Left
over from an older build, it survives logout, account switches and endpoint changes.

---

## 6. Saving, Restoring And Migrating

### D1 — Signing Out Replaces The Guest Save With A Hardcoded One

**Severity:** critical · `src/game.js:14907`–`14912`; `src/cloud.js:846`–`850`

```js
async function doLogout() {
  …
  PROF.guest = true;
  applyProfile({ guest: true, ink: 500, owned: ['qingfeng'], frags: {}, pity: 0,
                 skins: [], equip: {}, netWins: 0, netLosses: 0 }, { reset: true });
```

Only `reset: true` is allowed to wipe the profile (that guard was added deliberately), but the values it wipes to
are literals rather than the guest save that is still sitting in `renying-guest-profile` — the file
`saveProfile()` writes for a signed-out player (`src/cloud.js:848`) and `loadProfile()` reads back (`784`).
Replayed in the harness:

```text
guest profile on disk ink = 4321 ; PROF.ink after logout = 500
```

**What goes wrong:** play as a guest, sign in once to look at something, sign out — the guest's ink, roster,
skins, equipment and record are gone, and the stale file that still holds them is never consulted again.

### D2 — `toCloudData()` Drops Fields The Game Treats As Account State

**Severity:** high · `src/cloud.js:292`–`314`; `src/game.js:11388`–`11399`

The whitelist keeps fifteen fields. It does not keep `redeemedCodes`, which is where promo-code redemption is
recorded, and the local flag file that backs it is keyed by nickname (see **A1**). A player who redeems
`RENYING888` on a laptop and then signs in on a phone is offered the same code again, because neither the cloud
profile nor the new device knows it was used. `tutorial` and `welfare` are dropped the same way. (`daily` and
`weekly` are re-derived from the task store on every render, so those two are harmless.)

The ledger bounds the damage — ink earned locally is capped per day (`worker.js:275`–`277`, default 1500 base,
6000 cap) — but the codes are still double-claimed and the local ink display is wrong until the next sync.

### D3 — Promoting A Local Account To The Cloud Drops The Armory

**Severity:** high · `src/armory.js:218`–`252`; `src/cloud.js:197`; `cloudflare/worker.js:537`

Three facts combine:

1. The armory signature is `sigOf()` over `SALT + UID + JSON` (`src/armory.js:219`), so it is bound to the uid that
   was current when it was written.
2. The mirror is `renying-prof-<uid>` (`src/cloud.js:197`), so a uid change means a different mirror key.
3. The Worker deletes `armory` from the profile it stores for every account that is not Dev (`worker.js:537`,
   `563`), so the new uid's mirror comes back from the server without it.

Between them, the inventory, case counts, kill counters and rename tags of a local account are unreachable after
`promoteLocalToCloud()` (`src/cloud.js:1072`) or the automatic promotion in **B7**. If the old data is ever loaded
under the new uid instead, `loadLocal()` rejects it as tampered and fires an anti-cheat strike
(`'武库存档被改过'`, `src/armory.js:245`).

### D4 — Every Write Is Wrapped In An Empty Catch

**Severity:** high · `src/cloud.js` (36 empty handlers), `src/game.js` (56)

`try { localStorage.setItem(…) } catch (e) {}` is the pattern everywhere, including the mirror write
(`src/cloud.js:853`), the account table (`636`), the ledger (`77`) and the armory save. There is no
`QuotaExceededError` handling anywhere in `src/`, no `navigator.storage.persist()` request, and no pruning:

| Keys that grow | Bound |
| :--- | :--- |
| `renying-prof-<uid>`, `renying-ledger-<uid>`, `renying-ac-<uid>`, `renying-sync-at-<uid>`, `renying-sync-dirty-<uid>`, `renying-flags-<name>`, `renying-tasks-<name>`, `renying-rk-<name>` | one set per account ever used on the device, never deleted |
| `renying-social-<name>` | 200 messages per conversation, every conversation |
| `renying-hall-cache` | 150 messages |
| `renying-replays` | 10 replays (`src/game.js:4623`) |
| `renying-local-accounts` | one record per local account |

Once the roughly 5 MB origin quota is full, saves stop being written and the player is never told; the game keeps
running against memory and the loss only becomes visible after a reload.

### D5 — The Legacy Cache Migration Hands The Blob To Whoever Is Current

**Severity:** medium · `src/cloud.js:203`–`215`

`migrateLegacyCache()` copies the old shared `renying-cloud-cache` value into `renying-prof-<current uid>` when that
mirror does not exist yet, then deletes the key unconditionally. If nobody is signed in, or the current account
already has a mirror, the blob is deleted without being claimed — and it cannot be attributed after the fact,
because it never recorded a uid.

### D6 — A Corrupt Mirror Is Indistinguishable From A Missing One

**Severity:** medium · `src/cloud.js:198`–`201`

```js
function readMirror(uid) {
  if (!uid) return null;
  try { const raw = localStorage.getItem(profKey(uid)); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
```

`loadProfile()` reacts to `null` by treating the device as fresh and re-uploading (`819`–`824`). A mirror truncated
by a quota failure therefore looks like a first install, and the local copy is overwritten by the cloud copy
instead of being reported.

### D7 — "备份所有账号" Produces A File That Cannot Be Restored

**Severity:** medium · `src/cloud.js:1019`–`1044`, `1046`–`1066`; `src/game.js:15112`–`15154`, `15265`–`15292`

The Dev-only button exports `{ format: 'all-accounts-backup', accounts: [...] }`. The importer that the UI uses,
`importAccountData()`, accepts only `format === 'single-account'` (`1048`) and throws `不支持的文件格式` for anything else
(`1068`).

The UI has a second branch for the all-accounts format (`src/game.js:15265`), but it does not restore accounts. It
flattens each record into an in-memory array (`15268`), renders a dropdown (`15112`), and the button behind it calls
`claimLegacyAccount()` (`15161`), which merges one record into **the currently signed-in account**. The list is not
persisted, so a reload loses the whole backup.

Two smaller faults in the same path: `populateLegacyDropdown()` dereferences `a.name.toLowerCase()` unguarded, so a
record without a name throws; and `claimLegacyAccount()` takes `max()` of ink and wins with a
`accData._sig ? 999999 : 5000` ceiling (`15184`), so a hand-edited but signed backup can inject 999,999 ink into a
local profile.

### D8 — The Save-File Signature Is An Unkeyed Hash

**Severity:** medium · `src/cloud.js:939`–`948`, `975`–`985`

`computeProfileDigest()` hashes `RY_V2|<canonical>|ry_sword_auth_2026`, with the salt written in the shipped
source. Anyone can edit a backup and recompute the digest, so `tampered` only catches accidental edits — which is
worth saying plainly because the UI presents it as a tamper check, and the docs do too.

There is also a hard edge: on a plain-HTTP origin `crypto.subtle` is absent, `computeProfileDigest()` returns `''`,
and `verifyProfileDigest()` falls through to `weak` for every input, so nothing is checked at all. (Export refuses
in that situation; import does not.)

### D9 — A Claimed Legacy Record Can Disagree With The Signed-In Identity

**Severity:** low · `src/game.js:15161`–`15200`

`claimLegacyAccount()` sets `ACC.name` only `if (!ACC.name)`, merges assets by maximum, and then calls
`CloudSave.saveProfile(PROF, true)`. A player who claims a legacy record while signed in keeps their own name but
gains the other record's ink and roster, and that combination is what gets uploaded.

---

## 7. Every Key, One Table

Scope is "per account" only when the key contains the uid or the nickname; everything else is shared by every
account on that browser.

| Key | Written by | Scope | Note |
| :--- | :--- | :--- | :--- |
| `renying-prof-<uid>` | `src/cloud.js:853` | per account | The save mirror; whitelisted fields only (**D2**) |
| `renying-ledger-<uid>` | `src/cloud.js:65`–`77` | per account | Ink deltas awaiting upload |
| `renying-ac-<uid>`, `renying-ac-device` | `src/anticheat.js:27` | per account / device | Anti-cheat record; resettable by clearing the key |
| `renying-sync-at-<uid>`, `renying-sync-dirty-<uid>` | `src/cloud.js:193`, `222` | per account | Never pruned |
| `renying-flags-<name>` | `src/game.js:11049` | per nickname | Claimed codes, tutorial flag (**A1**, **A2**) |
| `renying-tasks-<name>` | `src/game.js:11168` | per nickname | Daily/weekly/event progress |
| `renying-rk-<name>` | `src/game.js:11461` | per nickname | Rank points, placement, history |
| `renying-comp1022-<name>` | `src/game.js:11109` | per nickname | Compensation claim marker |
| `renying-social-<name>` | `src/social.js:54` | per nickname | Friends, groups, 200 messages per conversation |
| `renying-adapt-<name>` | `src/game.js:1765` | per nickname | Only reloaded in dead code paths (**A7**) |
| `renying-arm-seen-<uid>` | `src/armory.js:388` | per account | Armory "new item" markers |
| `renying-local-accounts` | `src/cloud.js:636` | device | Name → record map, includes password hashes (**B5**) |
| `renying-local-current` | `src/cloud.js:609` | device | Includes a second copy of the token (**C1**) |
| `renying-cloud-token` | `src/cloud.js:183` | device | 30-day bearer token (**C1**) |
| `renying-cloud-endpoint` | `src/cloud.js:23` | device | Redirection target for passwords (**C5**) |
| `renying-cloud-cache` | legacy | device | Only read by `migrateLegacyCache()` (**D5**) |
| `renying-token` | `src/game.js:14828` | device | Vestigial; holds a uid (**C1**, **C6**) |
| `renying-guest-profile` | `src/cloud.js:848` | device | Ignored by sign-out (**D1**) |
| `renying-guest-name` | `src/social.js:43` | device | One random `游客NNNN` for every guest (**G3**) |
| `renying-stage` | `src/game.js:1943` | device | Star map, never reloaded (**A3**) |
| `renying-qfx` | `src/game.js:4866` | device | Best 青锋行 wave (**A6**) |
| `qfx2` | `src/qfx/75-meta.js:2` | device | Embedded 青锋行 save: soul, unlocks, record |
| `renying-tut-seen`, `renying-tut-done` | `src/game.js:11803`, `11867` | device | Tutorial completion (**A6**) |
| `renying-settings`, `renying-lang`, `renying-lang-chosen` | `src/game.js:82` | device | Presentation only; acceptable |
| `renying-1p-keys`, `renying-arm-fast`, `renying-hero` | `src/game.js:1423` | device | Device preferences; acceptable |
| `renying-custom-ice` | `src/net-p2p.js:45` | device | Plaintext ICE list, may hold TURN credentials (**G4**) |
| `renying-hall-cache` | `src/social.js:68` | device | 150 hall messages, kept across accounts (**G2**) |
| `renying-replays` | `src/game.js:4623` | device | 10 replays, kept across accounts |
| `renying-tower-run` | `src/game.js:12652` | device | In-progress tower run, resumed by the next account |
| `renying-equip` | `src/game.js:10559` | device | Stale duplicate of `PROF.equip` (**A8**) |
| `renying-dev-unlock` | `src/game.js:11367` | session | Full unlock for the tab (**B3**) |

One reconciliation is missing rather than merely scoped: `PROF.qfx` is per account and `renying-qfx` is per device,
and the function that was supposed to bridge them (`qfxClaim`, called behind a `typeof … === 'function'` guard at
`src/game.js:11091`) does not exist anywhere in `src/`. The 青锋行 chapter rewards defined at `4856` are therefore
never paid, and `PROF.qfx` only ever changes through a cloud merge.

---

## 8. Server-Side Account Handling

### F1 — Passwords Are Single-Round Salted SHA-256

> **Fixed:** new passwords use PBKDF2-SHA256 with `PW_ITER` (25000) iterations; old `sha256-v1` hashes are upgraded on the next successful login. See `users.password_algo`.

**Severity:** medium · `cloudflare/worker.js:102`–`108`

`hashPassword()` is one SHA-256 over `salt + ':' + password + ':renying_sword_salt_2026'`. The 12-character salt
(`1009`) stops rainbow tables, the missing work factor does not stop a GPU: a leaked `users` table is a few billion
candidates per second. PBKDF2 with an iteration count (available in Workers via `crypto.subtle.deriveBits`) or
Argon2 would be the fix.

The client-side hash used for local accounts (**B5**) is weaker still: no salt at all.

### F2 — Rate Limits Can Be Keyed On A Spoofed Address

**Severity:** medium · `cloudflare/worker.js:173`

```js
const clientIp = request => (request.headers.get('CF-Connecting-IP')
  || request.headers.get('X-Forwarded-For') || 'unknown').split(',')[0].trim().slice(0, 64);
```

`CF-Connecting-IP` is trustworthy only because Cloudflare sets it. On any other deployment — a local `wrangler dev`,
a reverse proxy, a self-hosted copy — the header is client-controlled, so the per-IP registration limit (6/hour),
the login lockout and the profile sync limit (40/minute) can all be bypassed by rotating the header.

### F3 — The Login Lockout Follows The Typed Name, Not The Account

**Severity:** low · `cloudflare/worker.js:1049`–`1050`

The lockout key is `'lf:' + username.toLowerCase().slice(0, 40)`. Nothing has to authenticate to consume those
eight attempts, so anyone can lock a known nickname out for 15 minutes at a time. The counter is also not keyed on
the user id, so a rename or a different capitalisation starts a fresh budget.

### F4 — Permissive CORS On An Authenticated API

**Severity:** low · `cloudflare/worker.js:31`–`36`

`Access-Control-Allow-Origin: *` with `Authorization` allowed is reasonable for a bearer-token API with no cookies,
and it is what lets the GitHub Pages build talk to the Worker. It does mean any origin can drive the API with a
token it has obtained elsewhere, so the token's storage (**C1**) is the only thing standing in the way.

---

## 9. Social Identity And Shared Devices

### G1 — Social Identity Is A Public Hash Of The Nickname

**Severity:** high · `src/social.js:34`–`41`, `95`

```js
const socUid = name => 'renying-u-' + socHash(name);
const socIdOk = (pid, name) => !!name && (pid === socUid(name) || String(pid).startsWith(socUid(name) + '-'));
```

`socHash()` is a 64-bit FNV-style mix with no secret. Anyone can compute the peer id for any nickname, register it
first, and be indistinguishable from that player to every client that checks `socIdOk()` — which is exactly what
incoming connections and direct messages are screened by (`src/social.js:247`, `302`). Friends, group invitations
and the hall roster are all keyed on the nickname too, so this is impersonation with no credential involved. Being
64-bit, accidental collisions are also reachable at scale.

### G2 — Chat History Survives Sign-Out

**Severity:** medium · `src/social.js:54`, `61`, `68`

`renying-social-<name>` holds friends, groups, unread state and the last 200 messages of every conversation;
`renying-hall-cache` holds the last 150 hall messages and is device-wide. Neither is touched by `doLogout()`. On a
shared or borrowed browser, the next person to open the game can read the previous player's conversations by
picking the same nickname, or the hall log with no nickname at all.

### G3 — One Guest Name For Every Guest

**Severity:** low · `src/social.js:42`–`48`

`socGuest()` mints one `游客NNNN` per browser and stores it in `renying-guest-name`. Two different people using the
signed-out build on the same machine are the same social identity, and that identity is also the input to the peer
id in **G1**.

### G4 — ICE Configuration Is Stored In Plaintext

**Severity:** low · `src/net-p2p.js:42`–`53`

`renying-custom-ice` is parsed straight into `RTCPeerConnection` options. If a TURN server is configured with
long-lived credentials, they sit in `localStorage` in the clear and are readable by any script on the origin.

### G5 — Twenty-One Real Accounts Ship Inside The Client

**Severity:** low · `src/game.js:15108`

`LEGACY_USERS` is a literal array of 21 old players with their nicknames, ink, rating, placement, roster and skins.
It is never referenced — dead data — but it is public, it names real players, and pasting it into
`populateLegacyDropdown()` in the console hands `claimLegacyAccount()` a list of records to merge into the current
save (including the `999999` ink path in **D7**).

---

## 10. What Was Replayed, And What Was Only Read

Four findings were confirmed by running the shipped `index.html` in a headless DOM with a stubbed `localStorage`
and a `fetch` that always fails, which is the "server unreachable" path a real player hits behind a blocker:

| Finding | Result |
| :--- | :--- |
| **A3** stage stars not reloaded | `applyProfile({stageStars:{s1:3,s2:3,s3:2}})` left `STAGE_STARS` empty; `stageOpen(0,1)` stayed `false` |
| **B2** corrupt account table | `register()` rejected with `SyntaxError: Expected property name or '}' in JSON at position 1` |
| **D1** sign-out discards the guest save | `renying-guest-profile` held `ink: 4321`; `PROF.ink` after `doLogout()` was `500` |
| **A1**/**A6** key scoping | Boot plus two registrations produced only `renying-flags-<name>` style keys; nothing account-scoped for tasks, claims or stars |

Everything else in this list was read from the source at the cited lines — the Worker routes, the fallback branches
and the armory uid binding are all straight-line code, not inference.

---

## 11. Cross-Reference To The Existing Board

These are already tracked in [`bug-status.md`](bug-status.md) and are deliberately not re-numbered here:

- **O1** — a backup import switches the active account without saying so; related to **D7**.
- **O2** — one redundant upload per boot when local ink exceeds the cloud copy; caused by the `max()` merge in
  `mergeProfiles()`.
- **O3** — `_importNote` from a `weak` import is never displayed.
- **O4** — `mergeProfiles()` takes the maximum of `netWins` and `netLosses` independently, so a loss can be merged
  in without its win.

Two further merge behaviours are worth folding into **O4** if that ever gets fixed: `ink: Math.max(...)` makes the
client display an ink total the ledger will not honour, and `updatedAt: Math.max(…, Date.now())` makes every merged
profile look freshly written, which is what keeps **O2**'s re-upload firing.

---

## 12. Suggested Order If Fixing Starts

Not a plan, just the order the severity implies — the first three are the ones players can actually lose data to.

1. **B1** and **D1**: stop lying about registration, and stop overwriting the guest save on sign-out.
2. **A3** and **D3**: make the cloud copy loadable (stage stars) and stop dropping the armory on promotion.
3. **C1**, **C2**: one token key, expiry surfaced, and a way back in.
4. **D4**, **D2**: surface quota failures instead of swallowing them, and put `redeemedCodes` in the signed data.
5. **A1**, **A2**, **A5**: move the nickname-keyed files to uid-keyed ones, with a one-time migration.
6. **B3**, **G1**: close the offline Dev escalation and stop treating a public hash as an identity.
7. The remaining medium and low entries, which are individually small but mostly share the same cause: two names for
   one account, and a silent `catch`.
