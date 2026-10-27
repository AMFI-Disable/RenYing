# Bug Audit Round Two

A second pass over the game after the online-count work. Everything below was found by reading the source and then
reproduced in headless Chromium against the built `index.html` from this commit — each entry lists what I ran and what
came back. **No code was changed in this round**; this is the list, with a fix sketch for each.

Method: static review of `src/` with ESLint's correctness rules (unreachable code, duplicate keys, assignment to a
function, undefined identifiers), then targeted browser probes for anything that looked reachable, plus a click sweep
of all thirteen panels recording uncaught exceptions — that sweep found none, so every bug below is a logic bug rather
than a crash, except the latent one in 5.

## Summary

| # | Area | Bug | Severity |
| :-- | :--- | :--- | :--- |
| 1 | Save / login | A logged-out player's save round-trips through a reload and clears the guest flag, so login-only rewards become claimable | **High** |
| 2 | Language | English mode only translates what is on screen when you switch; every panel opened (or list redrawn) afterwards falls back to Chinese | **High** |
| 3 | Replays → Train AI | The exported "training trajectory" is fabricated: all samples share one made-up state vector and one action, and the replay's own frames are never read | **High** |
| 4 | Replays → Train AI | Uploading a `.jsonl` trajectory silently discards the file | Medium |
| 5 | Tasks | "前往" on a task that points at the forest calls `startForest()`, which does not exist | Medium (latent) |
| 6 | Progress | `qfxClaim` is called but never defined, so the QFX best score never reaches the save | Low |
| 7 | Anti-cheat | A local penalty record with more than 20 log lines fails its own integrity hash | Low |

---

## 1. The Guest Flag Does Not Survive A Reload

**Symptom.** Without logging in, open the game, play a little, reload. The task panel now offers the real daily and
weekly tasks with **领取** (claim) buttons enabled, and the 系统补偿 (compensation) button is clickable. Both are
supposed to be login-only — the panel is supposed to read "登录之后，方可领任务".

**Cause.** Two halves that each look fine:

- `CloudSave.saveProfile` (`src/cloud.js:778`) stores a logged-out profile under `renying-guest-profile`, using
  `toCloudData(prof)`. That function (`src/cloud.js:253`) has a field whitelist and **no `guest` field**.
- `applyProfile` (`src/game/19-progress.js:476`) decides "is this a guest blob?" by testing `p.guest`. It is not, so
  the else branch runs:

  ```js
  Object.assign(PROF, p, { guest: false });   // src/game/19-progress.js:503
  ```

  The reload path is exactly this one: `CloudSave.loadProfile()` returns the stored blob (`src/cloud.js:716`) and
  `src/game/24-account.js:615-618` feeds it to `applyProfile`.

`PROF.guest` is what gates the reward UI and the claim handlers (`19-progress.js:648-661`, `:678`, `:692`), the
compensation claim (`:548`, `:552`) and the tutorial hand-off (`20-tutorial-rollback-touch.js:79`), so all of those
now behave as if an account were logged in.

**Evidence.** Fresh profile, then a guest save, then a reload:

```text
fresh load            {"guest":true,"user":false,"stored":"no","ink":500}
after a guest save    {"stored":true,"guest":true}
after reload          {"guest":false,"user":false,"ink":777,
                       "tasksPanelHtml":"习武精进：进行 1 局对战+300/1前往…"}
guest claims reward   {"clicked":"e1000","inkBefore":500,"inkAfter":1500,"gained":1000}
```

The 1,000-ink event task was claimable with no account. The ink does not go straight to the cloud — registration
caps the carried-over ink at `REG_INK_CAP = 5000` (`cloudflare/worker.js:68`) — but that is still ten times the
normal 500 starting ink, and the gate itself is simply gone.

**Fix sketch.** Mark the blob at the source: return `{ ...JSON.parse(guest), guest: true }` from the guest branch of
`loadProfile`, or add `guest: true` in `toCloudData` when the profile is a guest. The first is a one-line change and
cannot leak into account saves.

---

## 2. English Only Covers What Was Already On Screen

**Symptom.** Switch to English in settings. The text that is already rendered turns English; everything rendered
afterwards is Chinese again — open 单人模式 and it reads "单人模式 · 选择 AI 难度与对手境界…", the settings sheet
rebuilds itself in Chinese, task rows, the codex, the leaderboard and the market all come back Chinese.

**Cause.** Translation is a one-shot DOM walk (`src/i18n.js:668 translateNode`, driven by `applyTranslations` at `src/i18n.js:715`), and
the only caller is `setLang` (`src/i18n.js:629`). Screens rebuild their markup with `innerHTML` on every open
(`buildSettings`, `renderTasks`, `renderCodex`, `openLeaderboard`, …) and nothing re-runs the walk afterwards. There
is no `MutationObserver`, and the render entry points (`showScreen`, `openScreen`) do not call the translator.

This was invisible until now because the walk threw a `TypeError` on its first text node (fixed in the previous
round), so English mode did nothing at all; now the half that works makes the other half obvious.

**Evidence.**

```text
switch to EN       {"lang":"en","kicker":"第一赛季10.22 – 11.22 · 剩余 25 天 6 小时全服 — 人在线"}
after opening CPU  {"screen":"single","text":"单人模式 选择 AI 难度与对手境界…"}
after settings     {"screen":"settings","text":"Settings 语言 / Language简体中文English朝向按 A / D 决定…"}
re-applied?        {"screen":"settings","text":"Settings 语言 / Language简体中文EnglishFacingManual by A / DAuto face opponent…"}
```

The last line is the smoking gun: calling `I18N.applyTranslations()` by hand translates the same DOM that was
Chinese a moment earlier, so the dictionary is fine and only the trigger is missing.

Strings built at runtime also need care: `全服 — 人在线`, `剩余 25 天 6 小时` and the task rows are composed with
numbers, so the dictionary's exact-match keys can never hit them — those need pattern keys or a formatting function.

**Fix sketch.** Re-translate after a render: either a debounced `MutationObserver` on `document.body` that ignores
mutations it caused itself (guard with a flag, as the `data-orig` bookkeeping already does), or a
`showScreen`/`openScreen` hook plus calls after the big renderers. Then add pattern keys for the counted strings.

---

## 3. "Train AI" Export Is Made Up

**Symptom.** Replays → 训AI produces a `.jsonl` and reports `已将战局转录为 AI 训练轨迹 (N 样本)`. The file is
`N` copies of the same fabricated sample: it does not depend on the replay at all.

**Cause.** `src/game/11-anim-loop.js:449-470`:

```js
for (let f = 0; f < frames; f += 2) {
  samples.push({
    heroIdx: ch[0],
    s: [0, 0, 0.25, 1, 1, 1, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],  // same for every sample
    a: 5,                                                                                    // same action
    r: isWin0 ? 1.5 : -0.2,                                                                  // win/loss only
    source: 'user_replay'
  });
}
```

`s` is a literal, `a` is the constant 5, and `r` depends only on who won — the replay's `ev`, `st0` and actual frame
data are never read, only `m.ch`, `m.frames` and `m.w`. The count is `frames / 2`, so a longer replay just produces
more identical rows.

**Why it matters.** The toast says the trajectory is ready to drop into `data/` for training. Feeding it to
`tools/ai-train.mjs` teaches a policy to press the same button from a fake state, with a reward signal that repeats
the match result thousands of times — that is worse than no data.

**Fix sketch.** Either build each sample from the recorded events (`m.ev`) and the sampled fighter state, with the
action actually taken and a reward from the score difference, or rename the button to what it does today (exports a
stub) so nobody trains on it.

---

## 4. Uploading A Trajectory Throws It Away

**Symptom.** The same dialog accepts `.json,.jsonl`. For a `.jsonl` it shows `已载入自定义战局轨迹 · 神经策略将同步
蒸馏学习` and stores nothing.

**Cause.** `src/game/11-anim-loop.js:498`:

```js
if (file.name.endsWith('.jsonl')) {
  toast('已载入自定义战局轨迹 · 神经策略将同步蒸馏学习');
} else { … }
```

There is no other `.jsonl` reader anywhere in `src/` — the string appears exactly twice, both in this file (the
export above and this branch). So the "import" is a toast with no side effect.

**Fix sketch.** Parse the JSONL, validate a handful of rows, and keep them somewhere the trainer can see (or at
minimum a local store with a count shown in the panel). If importing is out of scope, drop `.jsonl` from `accept`
and say so.

---

## 5. The Task "前往" Button Calls A Function That Does Not Exist

**Symptom.** `taskDest()` (`src/game/19-progress.js:584-591`) routes any task whose name matches
`青锋行|秘境|竹林` to the forest, and the click handler calls `startForest()` unconditionally
(`src/game/19-progress.js:670`). `startForest` is defined nowhere — not in `src/`, not in the worker, not in the
build script. Clicking 前往 on such a task throws and the button does nothing.

**Evidence.**

```text
dead references   {"qfxClaim":"undefined","startForest":"undefined","qfxBest":"function"}
startForest call  "ReferenceError: startForest is not defined"
```

Today no shipped task matches those words (`TASK_DEFS` and `EVT_TASK` use 对战 / 连击 / 击败 / 人机), so this is
latent rather than live — but it is one content change away from a dead button, and the other branches of the same
handler (`cpu`, `train`, `codex`, `netp`) all work.

**Fix sketch.** Guard it (`typeof startForest === 'function'`) and fall back to `openScreen('single')`, or delete the
`forest` branch until the forest screen exists.

---

## 6. `qfxClaim` Never Exists, So The QFX Score Never Saves

**Symptom.** The best QFX score is written to `localStorage['renying-qfx']` (`src/game/11-anim-loop.js:609-617`) and
`PROF.qfx` is a cloud-synced field (`src/cloud.js:268`, `:351`), but `PROF.qfx` is never updated.

**Cause.** The only code that would copy one to the other is `src/game/19-progress.js:523`:

```js
if (!PROF.guest && typeof qfxClaim === 'function' && qfxBest() > (PROF.qfx || 0)) setTimeout(() => qfxClaim(qfxBest()), 0);
```

`qfxClaim` is not defined anywhere (`typeof qfxClaim === 'undefined'` in the running page, confirmed above), so the
guard is always false and the branch is dead. The name appears nowhere in `src/`, including the QFX game's own sources under
`src/qfx/`, nor in `tools/build.py`.

**Effect.** `PROF.qfx` stays at whatever it was, so the cloud merge (`Math.max`) and the `qfx` field in the save carry
a constant. Any UI or server rule that reads it later will read the wrong number.

**Fix sketch.** Define it (`PROF.qfx = Math.max(PROF.qfx || 0, n); CloudSave.saveProfile(PROF)`) or delete the dead
branch; the guard hides the problem either way, which is why it survived.

---

## 7. A Penalty Record With More Than 20 Lines Fails Its Own Check

**Symptom.** A local anti-cheat record that holds more than 20 log entries is rejected by its own hash and upgraded
to a permanent ban.

**Cause.** The two halves disagree about how much of the log is hashed:

- `acSaveLocal` (`src/anticheat.js:42`) hashes `acPack(r)` — the whole log, however long.
- `acLoadLocal` (`src/anticheat.js:38-39`) slices the stored log to the last 20 first, then hashes that and compares.

So a stored record with 21+ entries can never verify. The mismatch path then does `strikes = max(strikes, 3)`,
`perm = true`, and pushes *another* line — which keeps the record at 21 the next time it is saved.

**Evidence.** Write a valid record with 21 entries through the game's own `acSaveLocal`, read it back:

```text
{"savedEntries":21,"loadedStrikes":3,"loadedPerm":true,"loadedLog":21,"verdict":"flagged as tampered"}
```

**Who can hit it.** Only a record that already went through the tamper path, because every normal writer trims to 20
(`acStrike:75`, `acMerge:59`). So this is not a false positive for honest players — but it means the "record is
corrupt, escalate" state can be produced by the detector itself, is unrecoverable, and defeats a later local pardon.

**Fix sketch.** Hash the same slice on both sides: have `acPack` pack `log.slice(-20)`, or have the loader verify
before trimming.

---

## Checked And Clean

For the record, things that looked risky and turned out fine: player-supplied names in the hall, friend lists, the
ranked and win-rate leaderboards, the global-boss damage table and market listings are all escaped (renamed item
labels have control characters and `<>"'` stripped in `armory-core.js:733` (`A.rename`) before they are stored, and
listing rows are escaped when drawn); WebRTC peer names are reduced to
letters, digits, underscore and CJK by `p2pName`; admin auth uses a length-independent compare plus a 20-try-per-hour
lockout; market buy/cancel runs inside an optimistic transaction keyed on the listing still being on sale; replay
storage trims on quota failure; and a click sweep of all thirteen panels produced no uncaught exceptions.
