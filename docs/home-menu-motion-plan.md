# RenYing — Home Menu Motion and Flow Plan

> [!NOTE]
> Written against the working tree at commit `351e61b` (`fix: resilient spawn runner`), game `VERSION = '4.5'`.
> Every claim below cites `src/game.js` or `src/style.css` by line so it can be checked before anything changes.
>
> This is a **proposal**: no source file has been modified.

---

## 0. What This Document Is

A priority-ordered plan for making the home screen feel continuous: one press drives one animation timeline,
the background never resets itself, and no element plays two exit animations at once.

The home is two stacked things that must move as one:

| Layer | Source | Motion Owner |
| :--- | :--- | :--- |
| The 3D-ish scene behind everything | `renderMenu()` `src/game.js:7488` (canvas, drawn every frame) | JS camera damping, always running |
| The DOM skin on top | `#menu.menuscr` `src/page.html:58`, styled `src/style.css:296`, `:1262-1317` | CSS transitions on `.scr`, `.mcard`, `.mtitle` |

Almost all of the jank comes from those two layers being driven by three different clocks — a 520 ms `setTimeout`,
a 400 ms CSS fade, and a 500 ms press transition — none of which know about each other.

---

## 1. How a Press Works Today

`#mSingle` / `#mNet` are plain buttons with `data-go` (`src/page.html:80-81`). One click does:

```text
 game.js:7723  b.classList.add('pressed')          -> .pressed rule, transform + blur, 500 ms   (style.css:306)
 game.js:7724  setTimeout(remove pressed, 900)
 game.js:7534  menuGo('single')
               initAudio()                        -> builds a 1.4 s convolver IR synchronously
               menuCam.tx = -640*1.05, tz = 1.9   -> camera targets; renderMenu damps toward them
               #menu.classList.add('leaving')     -> opacity 0 over 300 ms                     (style.css:780)
 game.js:7538  setTimeout(..., 520)               -> removes .leaving, calls openScreen('single')
 game.js:7658    openScreen -> singleSec() + renderTrainPick() + renderStages()   <-- DOM build here
 game.js:10542   showScreen('single')             -> #menu .on off, #single .on on
 style.css:22    .scr { transition: opacity .4s } -> BOTH screens fade, in parallel, for 400 ms
```

So the minimum path from click to a usable 单人 screen is ~920 ms, with a DOM build sitting exactly on the
frame where the new panel starts fading in. Twelve smaller defects follow from that shape.

---

## 2. What Reads as Jank (Evidence)

### 2.1 Two Full-Screen Fades Run over a Live Canvas

`.scr` fades opacity over 0.4 s (`src/style.css:19-24`) and `showScreen` toggles exactly one `.on` at a time
(`src/game.js:10542-10543`). During those 400 ms the outgoing home is still painted — including its own
`.home-scrim` gradient (`:1262`) and `.menuscr` radial (`:296`) — while the incoming screen paints its own
radial (`:21`) on top. Because `#menu` is the first `.scr` in the DOM (`src/page.html:58`), every other screen
paints above it: you see the new panel *rising out of* a home that is still fully opaque, while the two dark
scrims stack in the middle of the transition and then unstack as the home finishes fading. That darken-then-
brighten dip over ~400 ms is the flash — nothing is wrong with the new screen, it is just being revealed on top
of one that has not left yet.

### 2.2 The Dolly Is Cancelled by the Pointer Leaving the Card

```js
// game.js:7723-7726
b.addEventListener('pointerenter', () => { if ($id('menu').classList.contains('on')) { menuCam.tx = MENU_SPOT[b.dataset.go] * 0.55; ... } });
b.addEventListener('pointerleave', () => { if ($id('menu').classList.contains('on')) menuCam.tx = 0; $id('menu').classList.remove('hl-' + b.dataset.go); });
```

`menuGo` sets `tx = spot * 1.05` (`:7536`), then the user moves the pointer off the card they just clicked —
which they must, to look at the screen — and `pointerleave` sets `tx = 0`. `#menu` still has `.on` for the
full 520 ms, so the guard passes and **the camera reverses mid-push**. The same handler strips `hl-*`, so the
dimmed neighbor card un-dims and the pressed card un-nudges while it is still animating out.

This is the single most visible "the animation restarts / behaves randomly" defect, and it is two lines.

### 2.3 One Gesture, Five Durations

| Stage | Duration | Where |
| :--- | ---: | :--- |
| Press scale + blur | 500 ms | `style.css:306` |
| `.pressed` removed by timer | 900 ms | `game.js:7724` |
| Home content fade-out | 300 ms | `style.css:780` |
| Home opens (spot buttons) | 520 ms | `game.js:7538` |
| Home opens (dock buttons) | 260 ms | `game.js:7538` |
| Screen crossfade | 400 ms | `style.css:22` |
| Card hover | 250 ms | `style.css:309` |
| Card transition (forced) | 450 ms | `style.css:303` |
| Title choreography | 800 ms | `style.css:299` |

The 260 ms path is fragile by construction: `.leaving` is removed at 260 ms but the rule at `:780` runs for
300 ms, so the class is yanked 40 ms before the fade lands. With `ease` timing that is only ~2 % of the fade left,
so today it reads as a faint ghost rather than a flash — but the two numbers are unconnected, and nudging the CSS
rule to `.35s` turns the same code into a visible snap-back. Every dock button
(问剑阁 / 任务 / 图鉴 / 教学 / 回放 / 社区 / 设置 / 说明) takes this path, because none of them are in
`MENU_SPOT` (`:7342`).

### 2.4 The Pressed Card Blurs Twice

`.mcard` carries `backdrop-filter: blur(6px)` (`:309`), and the exit rule animates `filter: blur(8px)` on top of
it (`:306`) with `transition: all` — so the compositor re-runs the backdrop blur under a layer that is
simultaneously scaling and blurring, for 500 ms, on the biggest surface on screen. Drop one of the two and the
exit stops stuttering on integrated GPUs.

### 2.5 `!important` Fights, and Some of It Is Already Dead

- `:303` forces `.mcard, .msmall, .msmall-dock` to `transition: ... !important`; `:306` forces `all ... !important`;
  `:309` declares `.mcard`'s transition again without it. Three owners for one property.
- `:1281-1282` force `transform: none !important` / `opacity: 1 !important` on the title inside `.menuscr`, which
  **kills the title choreography written at `:300-302`**. The `hl-single` / `hl-netp` classes are still toggled
  (`:7724-7726`), the 800 ms transition at `:299` is still live, so the title still repaints for nothing.
- `:1280` overrides the hovered card's `translateY(-8px) scale(1.07)` with `translateX(8px)`, so the hover and
  the `hl-*` state use different axes.

### 2.6 The Background Duel Restarts Every Time You Come Back

```js
// game.js:11735 toMenu()
showScreen('menu');
startMatch('demo');          // :11752 — unconditional
```

`startMatch` → `startRound` (`:2802`) resets both fighters to their spawn marks (`:2815`), clears every particle
and projectile (`:2837`), and sets `M.phase = 'intro'` (`:2836`). Meanwhile the demo fight kept running while you
were in the settings panel — `step()` only needs `!paused` and `M.mode === 'demo'` (`:5019-5033`), and it
auto-restarts itself on KO (`:3091`). So the scene you were watching is thrown away and re-staged the instant you
come back. **This is the "re-doing animations" the user feels**, and it costs nothing to fix.

### 2.7 The Home Is Painted Twice at Boot

`src/page.html:58` ships `<div id="menu" class="scr on menuscr">`, then `src/game.js:10243` runs
`setTimeout(() => { if ($id('menu').classList.contains('on')) showScreen('menu'); }, 0)`. That second call runs
`renderHome()` (`:10555`) and `renderTopNav()` (`:10553`) — both rewrite `innerHTML` of `#homeMedal`,
`#homeSeasonTxt`, `#tnMedal`, `#tnInk`, … — so anything with an entrance animation keyed to "menu shown" fires
twice, and any animation on those child nodes restarts on every nav.

### 2.8 The Reveal Frame Is Also the Build Frame

`openScreen` (`:7658`) runs `singleSec()` (`:7619`) plus, unconditionally, `renderTrainPick()` (`:10716`, twelve
portrait rows) and `renderStages()` (`:1842`) — *after* the 520 ms wait, in the same tick as `showScreen('single')`
(`:7666-7676`). The panel is populated in the frame where it starts fading in. It also renders the stage grid even
when the visible tab is `cpu`.

### 2.9 The Nav and the Cards Don't Share One Path

`navTo` (`:7681-7690`) routes to `menuGo` only when `MENU_SPOT[name]` exists; otherwise it sets
`menuCam.tx/tz` and calls `openScreen` immediately (`:7686-7687`). Same destination, 520 ms from the card and 0 ms
from the tab. It also leaves `menuCam.tz = 1.9` behind, so the *next* return home starts pushed-in.

### 2.10 The Chrome Swap Is a Hard Cut (Minor)

`body.has-nav .msmall-dock { display: none }` (`:1233`) and `body.has-nav .scr { top: var(--nav-h) }` (`:1217`)
have no transition, and `--nav-h` changes 58 → 46 px under 520 px height (`:1259`). Only visible in the online
build when the nav appears/disappears under a fading screen; cosmetic but free to smooth.

### 2.11 The First Press Pays for the Audio Graph

`menuGo` calls `initAudio()` (`:7534`) before adding the class (`:7537`). `initAudio` (`:1015-1033`) builds a
2 × 61 600-sample convolver impulse and a 44 100-sample noise buffer synchronously. One-time, but it delays the
start of the very animation the user is judging.

### 2.12 Reduced Motion Covers Four Selectors, None of Them the Home

`@media (prefers-reduced-motion: reduce)` at `:1157` disables `.rk-shine`, `.rk-spin`, `.mm-spin`,
`.mm-card.searching::after`. Everything in this document must add to that block.

---

## 3. The Plan, Ordered by Impact

### 3.0 The Target Timeline

Everything below is in service of one shape, for the 单人练习 → 离线单机 path and for every other card:

| Time | What happens | Who owns it |
| ---: | :--- | :--- |
| 0 ms | press sink, `scale(.985)` | CSS (`--t-fast`) |
| 0 ms | camera targets set, dolly starts (damped 3.2 / 2.4) | `renderMenu` |
| 0 ms | target screen's DOM is built, off-screen | JS (`openScreen(name, false)`) |
| 40–260 ms | home content fades and drifts out, staggered by 60 ms | CSS (`[data-phase="out"]`) |
| 520 ms | `#menu` is already at opacity 0 → swap `.on`, target fades in 220 ms | JS + CSS |
| 740 ms | panel is interactive, camera still settling (that motion is desirable) | - |

The dock path (问剑阁 / 任务 / 图鉴 …) uses the same shape at 220 ms instead of 520 ms, because there is no scene
to fly to — so every exit from the home is recognisably one gesture, and only the distance changes.

Shared prerequisites, introduced once:

```css
/* style.css — one motion vocabulary, replacing the per-rule numbers */
:root {
  --t-fast: .16s;   /* state feedback: hover, press sink */
  --t-base: .28s;   /* element enter/exit */
  --t-scr:  .22s;   /* screen crossfade */
  --ease-out: cubic-bezier(.2, .8, .2, 1);
}
```

```js
// game.js, next to MENU_SCREENS
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const MENU_DOLLY = 520;   // time for the camera push; one source of truth
let menuLock = false;     // set on press, cleared on return to home
let homeEntered = false;  // has the home entrance animation played already?
let currentScreenId = 'menu';   // what showScreen() is showing right now
```

### 3.1 Lock the Press so One Click Produces One Move

*Fixes 2.2, 2.3 (double-fire), and the "it restarts" feeling.*

```js
// game.js:7533-7539 — replace menuGo
function menuGo(name) {
  if (menuLock) return;                       // no double click, no second timer
  menuLock = true;
  const spot = MENU_SPOT[name];
  if (spot !== undefined) { menuCam.tx = spot * 1.05; menuCam.tz = 1.9; }
  $id('menu').dataset.phase = spot !== undefined ? 'out' : 'out-fast';   // attribute present = leaving
  document.body.classList.add('menu-handoff');
  const id = openScreen(name, false);          // 3.6: build now, reveal later
  if (!id) {                                   // tutorial reveals itself by starting a match
    menuLock = false;
    $id('menu').removeAttribute('data-phase');
    return;
  }
  setTimeout(() => {
    $id('menu').removeAttribute('data-phase');  // an empty attribute still matches [data-phase]!
    showScreen(id);                           // the only place a new screen turns .on
  }, reducedMotion() ? 0 : (spot !== undefined ? MENU_DOLLY : 220));
}
```

```js
// game.js:7723-7726 — the hover pair must respect the lock
b.addEventListener('pointerenter', () => {
  if (menuLock || !$id('menu').classList.contains('on')) return;
  menuCam.tx = MENU_SPOT[b.dataset.go] * 0.55;
  $id('menu').classList.add('hl-' + b.dataset.go);
});
b.addEventListener('pointerleave', () => {
  if (menuLock) return;                       // already committed; do not pull back
  if ($id('menu').classList.contains('on')) menuCam.tx = 0;
  $id('menu').classList.remove('hl-' + b.dataset.go);
});
```

```js
// game.js:7678 — the lock is released only by coming home
function backToMenu() {
  menuLock = false;
  $id('menu').removeAttribute('data-phase');
  document.body.classList.remove('menu-handoff');
  $id('menu').classList.remove('hl-single', 'hl-netp');
  showScreen('menu');
  compMaybe();
}
```

*Risk:* `menuLock` must also be cleared wherever a screen is opened without going through `menuGo` (page reload,
`openQfx`, tutorial exit). Grep for `showScreen('menu')` and route all of them through `backToMenu`, or clear the
flag in `showScreen` when `id === 'menu'`.

### 3.2 Make the Demo Duel Survive the Trip Through the Menus

*Fixes 2.6. Highest visible win per line changed.*

```js
// game.js:11743-11752
const prevMode = M.mode;
if (prevMode === 'tower') saveTowerRun();
M.mode = 'demo';
if (prevMode === 'tag3' || prevMode === 'tower' || prevMode === 'chaos' || prevMode === 'mayhem' || prevMode === 'watch2v2') {
  singleSec(prevMode);
  showScreen('single');
} else {
  showScreen('menu');
}
if (prevMode !== 'demo') startMatch('demo');   // the duel behind the menu is still running
```

The demo match already restarts itself on KO (`:3091`), so skipping the reset leaves a scene that has been fighting
continuously while you were in 设置 — the camera pans back to it instead of jumping to a fresh spawn.

*Risk:* coming back from `train`, `cpu`, `net`, `replay`, `stage`, `watch2v2` still restarts, which is what you
want (those change `STAGE_W`, the fighter set, or `B.dummy`).

### 3.3 One Sequential Hand-Off Instead of Two Parallel Crossfades

*Fixes 2.1 and the 520 vs 300 vs 500 ms disagreement in 2.3.*

Instead of the outgoing and incoming `.scr` fading at the same time, the home dissolves **first**, and the target
fades in over the tail of the dolly:

```css
/* style.css — the outgoing home gets out of the way before the new screen arrives */
#menu[data-phase="out"]      { opacity: 0; transition: opacity .4s ease .02s; }
#menu[data-phase="out-fast"] { opacity: 0; transition: opacity .24s ease; }

/* the incoming screen is short and low, not a 400 ms wash */
body.menu-handoff .scr.on { transition-duration: var(--t-scr); }
body.menu-handoff .scr.on > .panel { animation: scrIn .26s var(--ease-out) both; }
@keyframes scrIn { from { opacity: 0; transform: translateY(10px); } }
```

`menuGo` adds `body.menu-handoff` in the same statement as the phase attribute, and `backToMenu` removes it, so the
shorter crossfade is scoped to the home path only.

and delete the old leaving rules:

```css
/* delete style.css:306 and style.css:780 — replaced by the phase attribute above */
```

Because the home is at `opacity: 0` by ~520 ms and the target fades in over 220 ms *after* that, no two
full-bleed scrims are ever visible at once, so the luminance bump disappears and the canvas stays continuous
behind both. For the 260 ms dock path, `out-fast` (240 ms) now finishes before the swap instead of being yanked
while the fade is still running.

*Risk:* `.scr` opacity is also used by every other screen (`pause`, `end`, `bp`). Keep the 400 ms default there;
only the menu path shortens it.

### 3.4 Give the Card One Exit, and Stop Blurring It Twice

*Fixes 2.4 and most of 2.5.*

```css
/* style.css — one owner per property, no !important */
.mcard {
  transition: transform var(--t-base) var(--ease-out),
              border-color var(--t-base),
              box-shadow var(--t-base),
              opacity var(--t-base),
              filter var(--t-base);
}
.menuscr .mcard { /* visual overrides only — remove the transition line at :303 */ }

/* press: a 90 ms sink reads as "I heard you"; the exit belongs to the camera */
#menu .mcard.pressed { transform: scale(.985); transition-duration: .09s; }

/* exit: fade + drift, one pass, no second blur */
#menu[data-phase] .mcard            { opacity: 0; transform: translateY(8px) scale(.98); transition-duration: .2s; }
#menu[data-phase] .mcard.pressed    { transform: translateY(6px) scale(1.02); }
#menu[data-phase] .mcard            { backdrop-filter: none; -webkit-backdrop-filter: none; }
```

Then remove `!important` from `:303`, drop `.mcard`'s duplicate transition at `:309`, and delete `:780`/`:306`.

*Risk:* `.hl-single` / `.hl-netp` also target `.mcard` transforms (`:304-305`, `:1280`). Collapse them to
opacity/filter only and let the transform be owned by press/exit; that also removes the axis mismatch in 2.5.

### 3.5 Enter the Home Once, Not on Every Return

*Fixes 2.7, and is the precondition for any entrance animation.*

```js
// game.js:10546-10556 — inside showScreen
const prevScreen = currentScreenId;
currentScreenId = id;
if (id === 'menu') {
  renderHome();
  const play = !homeEntered || prevScreen === null;   // cold boot, or back from a real match
  if (play && !reducedMotion()) $id('menu').dataset.enter = 'run';
  else $id('menu').removeAttribute('data-enter');
  homeEntered = true;
}
```

`prevScreen === null` is the "returning from the arena" case (game screens call `showScreen(null)`), so the
staggered entrance plays when the home has actually been away — and does **not** replay when you come back from
设置 / 任务 / 图鉴, which are part of the same browsing session.

```css
/* the stagger lives on containers, never on nodes that renderHome() rewrites */
#menu[data-enter="run"] .home-kicker { animation: homeIn .42s var(--ease-out) both; }
#menu[data-enter="run"] .home-tag    { animation: homeIn .42s var(--ease-out) .06s both; }
#menu[data-enter="run"] .home-card   { animation: homeIn .42s var(--ease-out) both; }
#menu[data-enter="run"] .home-card:nth-child(2) { animation-delay: .06s; }
#menu[data-enter="run"] .home-card:nth-child(3) { animation-delay: .12s; }
#menu[data-enter="run"] .mcard       { animation: homeIn .46s var(--ease-out) .1s both; }
#menu[data-enter="run"] .mcard.right { animation-delay: .16s; }
/* these two are centered with translateX(-50%) — the keyframe must keep it */
#menu[data-enter="run"] .mtitle,
#menu[data-enter="run"] .msmall-dock { animation: homeInCenter .52s var(--ease-out) .04s both; }

@keyframes homeIn       { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes homeInCenter { from { opacity: 0; transform: translateX(-50%) translateY(14px); } to { opacity: 1; transform: translateX(-50%); } }
```

Also remove `on` from `src/page.html:58` (`class="scr menuscr"`) and let the boot `showScreen('menu')` reveal it:
that kills the double first paint in 2.7 and gives the boot its entrance for free.

*Risk:* the `data-enter` attribute is only *set* when the animation should run, never toggled, so the browser
won't restart it on the next return.

### 3.6 Take the DOM Build off the Reveal Frame

*Fixes 2.8.*

Split `openScreen` (`:7658`) into "build" and "reveal":

```js
function openScreen(name, reveal = true) {
  if (OFFLINE_BUILD && name === 'single') name = 'cpu';
  if (OFFLINE_BUILD && name === 'netp') name = 'stage';
  if (name === 'cpu' || name === 'tag3' || /* … */ name === 'watch2v2') {
    singleSec(name);
    if (reveal) showScreen('single');
    return 'single';
  }
  /* … the existing one-liners … */
  if (name === 'tutorial') { startTutorial(); return null; }   // starts a match, no .scr to reveal
  if (name === 'single') { singleSec(null); renderTrainPick(); renderStages(); }   // keep singleSec(null)
  if (reveal) showScreen(name);
  return name;
}
```

Two wins: the 12-portrait picker and stage grid are built during the 520 ms dolly (hidden work, no dropped frame
at the reveal), and `renderStages()` stops running when the user is on the 木人试剑 tab. `navTo` (`:7681`) keeps
calling `openScreen(name)` and gets the new behaviour for free.

### 3.7 Unify the Nav Strip and the Cards on One Transition

*Fixes 2.9.*

```js
// game.js:7681
function navTo(name) {
  initAudio();
  if (name === 'menu') { backToMenu(); return; }
  if (name === 'acc') { openAcc(); return; }
  if (name === 'qfx') { openQfx(); return; }
  if ($id('menu').classList.contains('on')) { menuGo(name); return; }   // same timeline for every destination
  if (MENU_SPOT[name] !== undefined) { menuCam.tx = MENU_SPOT[name]; menuCam.tz = 1.35; }
  openScreen(name);
}
```

Now every route off the home is one dolly, and the camera no longer leaves `tz = 1.9` behind when you jump from
图鉴 to 对战.

### 3.8 Let the Return Trip Be the Animation

There is no camera pop on return — `showScreen` sets `tx/tz` *targets* (`:10546`) and `renderMenu` damps toward
them at 3.2 / 2.4 per second (`:7489`), so the camera already eases back. Two things still read badly:

- `backToMenu` (`:7678`) sets the same two targets that `showScreen('menu')` sets four lines later — delete one.
- The pull-back takes ~1.2 s to settle but the home is interactive at 400 ms, so the first hover adds its own
  `tx` target on top of a still-moving camera. Either raise the damp rate while returning
  (`menuCam.x = damp(menuCam.x, menuCam.tx, 6, dt)` behind a `returning` flag for the first 600 ms), or ignore
  hover until `Math.abs(menuCam.x - menuCam.tx) < 8`.

### 3.9 Animate the Nav/Dock Swap Instead of Cutting It

*Fixes 2.10, cosmetic.*

```css
.scr { transition: opacity .4s ease, top .22s ease; }
.msmall-dock { transition: opacity .2s, transform .2s; }
body.has-nav .msmall-dock { opacity: 0; transform: translateX(-50%) translateY(18px); pointer-events: none; }
/* replaces `display: none` at style.css:1233 */
```

### 3.10 Warm the Audio Graph on Pointer-Down, Not on the Animation Frame

*Fixes 2.11.*

```js
// once, capture phase — the graph is ready before the click handler runs
let audioWarm = false;
window.addEventListener('pointerdown', () => { if (!audioWarm) { audioWarm = true; initAudio(); } }, { capture: true, once: true });
```

and drop the `initAudio()` call from `menuGo` (`:7534`) / `navTo` (`:7682`). Keep the remaining call sites —
they are cheap once `AC` exists (`:1016`).

### 3.11 Extend Reduced Motion to the Whole Plan

```css
@media (prefers-reduced-motion: reduce) {
  /* keep style.css:1157, add: */
  #menu[data-enter] *, #menu[data-phase] * { animation: none !important; }
  .scr { transition-duration: .12s !important; }
  .menuscr .mcard, .msmall-dock, .home-card { transition-duration: .12s !important; }
  #menu[data-enter] .mtitle, #menu[data-enter] .msmall-dock { animation: none !important; }
}
```

`reducedMotion()` in 3.1/3.5 already collapses the dolly to 0 ms, so the screens swap instantly while the canvas
keeps drawing (it is not decorative-only motion, so it stays).

### 3.12 Clean up What the `!important` Rules Made Dead

Only after 3.4 lands: either delete `:300-302` + the `hl-*` class toggles in the pointer handlers, or remove the
`!important` from `:1281-1282` and let the title actually respond. Do not leave both, or the 800 ms transition at
`:299` keeps repainting for a state that cannot change.

---

## 4. Suggested Order and Effort

| # | Change | Files | Lines touched | Impact |
| :-- | :--- | :--- | ---: | :--- |
| 1 | Press lock + one timeline (3.1) | `src/game.js` | ~25 | kills the camera reverse and double-fire |
| 2 | Keep the demo duel running (3.2) | `src/game.js` | 1 | the background stops resetting |
| 3 | Sequential hand-off (3.3) | `src/style.css` | ~20 | removes the flash itself |
| 4 | Card exit / no double blur (3.4, 3.12) | `src/style.css` | ~20 | smooth, cheaper exit |
| 5 | Build off the reveal frame (3.6) | `src/game.js` | ~15 | no hitch at the reveal |
| 6 | Entrance once (3.5) | `src/game.js`, `src/style.css`, `src/page.html` | ~30 | the home arrives instead of appearing |
| 7 | Nav unification + return damping (3.7, 3.8) | `src/game.js` | ~10 | consistent routes |
| 8 | Audio warm-up (3.10), nav/dock swap (3.9), reduced motion (3.11) | `src/game.js`, `src/style.css` | ~15 | polish |

Items 1–3 are the ones the user will notice; each is small and independently revertable.

---

## 5. Verification

There is no Chrome/Chromium in this sandbox, so the plan is verified by code review plus the repo's own gates:

```bash
python3 tools/build.py            # regenerate index.html + renying-offline.html
python3 tools/build.py --check    # CI's "generated pages up to date" gate
node --check src/game.js          # syntax before anything else
```

CI additionally runs `tools/ui-audit.mjs ci-ui 1440 900`, `tools/hud-audit.mjs`, `tools/touch-audit.mjs`,
`tools/net-test.mjs server ci-net` and `tools/protocol-test.mjs` (`.github/workflows/ci.yml`), so layout and
touch regressions are caught there — but no gate here can see a flash.

Manual checklist for whoever has a browser:

1. Click 单人练习 and move the mouse away immediately — the camera must keep pushing in, not reverse.
2. Click 单人练习 twice quickly — one transition, one screen.
3. Click 设置 in the dock — the home content must finish fading instead of popping back part-way.
4. Watch the background duel across 设置 → 返回 — the same fight must still be going.
5. 返回 to the home three times — the title/cards must not replay their entrance, and the medal must not
   re-animate.
6. Reload — the home should build once and stagger in once.
7. Toggle the OS "reduce motion" setting — no dollies, no stagger, instant screens.

---

## 6. Non-Goals

- No change to `renderMenu`'s scene, the parallax layers, or the `MENU_SPOT` camera framing — those are well
  tuned and are what the new timeline drives.
- No new dependency, no animation library: the whole plan is CSS transitions, `transform`/`opacity`, and the
  existing damping.
- No change to `src/cloud.js`, `src/social.js`, `src/net-p2p.js`, or the generated root HTML by hand.
- Not touching the touch layout at 520 px height (`style.css:1259`) beyond the `top` transition in 3.9.
