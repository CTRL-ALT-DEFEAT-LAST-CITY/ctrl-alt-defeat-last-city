# What changed

This update adds a cinematic opening, an interactive city builder, real-time
defense, a research tree, NPCs with branching dialogue, exploration missions
and companion progression — **without rewriting the game that was already
there**.

The guiding rule throughout: the original economy stays authoritative, and a
save with no new progress in it behaves exactly as it did before.

---

## The shape of the change

| | Lines | Notes |
|---|---:|---|
| New JavaScript | ~11,200 | Nine new modules |
| New CSS | ~2,200 | Six new stylesheets |
| New tests | ~2,200 | 94 automated tests |
| **Changed lines in original files** | **~149** | Across 8 files |

Nothing was deleted. No original system was rewritten. The archived `v2/`,
`v3/` and `v3.2/` folders are untouched.

---

## New files

### `src/game/migration.js` — state and save migration
Everything the update adds lives under one key, `game.expansion`. One
normalizer rebuilds that whole namespace from whatever is in the save, with
every field clamped and coerced. A truncated upload, a hand-edited
`localStorage` entry or a save from a newer build cannot put the game into a
state the renderers cannot draw.

Loaded **before** `game.js`, because `defaultGame` calls `normalizeExpansion()`
while it is being constructed.

### `src/ui/expansion.js` — the joining layer
A registry the feature modules plug into. Nothing here imports a feature
module directly, so a module that fails to load degrades to "that tab is
unavailable" instead of taking the game down. It also owns the secondary
resource simulation (power, food, security, jobs, efficiency), the service
HUD, the tutorial, and the new settings.

### `src/game/citybuilder.js` — the interactive city
An isometric canvas settlement: drag-and-drop placement, click-to-inspect,
roads, construction and upgrade animation, citizens that walk a road network,
job assignment, repair, damage, camera pan/zoom/pinch, districts that open as
you progress, a day/night cycle, weather, and five environment themes.

Everything is drawn procedurally. There are no sprite sheets to go missing and
the art is sharp at every zoom level and pixel density.

### `src/game/cinematic.js` — the opening
Five animated scenes with a keyframed camera, procedural skylines whose lights
go out block by block, fire, embers, ash, rain, light shafts and silhouetted
characters. Dialogue types in over the top. Skip is always one tap away, a
returning player never sees it again, and `prefers-reduced-motion` turns it
into a readable storyboard with the same script.

### `src/game/combat.js` — defense
A three-lane real-time battle: a charge meter, a six-card deck, eight unit
types with distinct roles, six enemies, five bosses with abilities, towers
drawn from the turrets and barricades you actually built, projectiles, splash,
healing, shields and a fixed 60 Hz simulation so a fight plays out identically
on any display.

### `src/game/research.js` — the technology tree
Twenty-four technologies across five eras with prerequisites, drawn as a
pannable SVG tree with full keyboard access. Every effect funnels through one
audited function.

### `src/game/events.js` — people, missions and events
Five named characters, branching conversations whose answers are recorded
permanently, relationships, seven exploration missions on real timers, hidden
discoveries, and ambient city events. Every reward is granted through a single
`applyOutcome` function, so nothing can pay out twice.

### `src/game/companions-plus.js` — companion progression
Levels, experience, six abilities, three equipment slots, nine items, timed
training, feeding and play, and three assignable roles. Keyed by the existing
pet ids, so an existing collection gains all of it without being rebuilt.

### `src/game/audio.js` — music and sound
A synthesised score with five tracks and thirty-two sound effects, built from
oscillators and filtered noise. No audio files, no downloads, no external
service. Respects the existing sound toggle and adds separate music and effects
volumes.

### New stylesheets
`expansion.css`, `citybuilder.css`, `cinematic.css`, `combat.css`,
`research.css`, `companions-plus.css`.

---

## Changes to original files

### `index.html` — 29 lines
Six stylesheet links, eight script tags, three nav tabs, three mode panels, the
service HUD and the tutorial element. Nothing was removed or restructured.

Script order is load-bearing and is enforced by a test:
`migration.js` → … → `game.js` → `expansion.js` → the feature modules.

### `src/game/game.js` — 65 lines
1. `defaultGame` gains `expansion`, `musicEnabled`, `musicVolume`, `sfxVolume`.
2. `loadGame` normalizes the expansion block and calls `notifyExpansionLoaded()`
   on **both** exit paths, so a cloud save or an account switch re-normalizes
   exactly like a fresh load.
3. The five production functions each multiply by `expansionMultiplier(stage)`.
4. `getSupplyDropValue` multiplies by the Supply Depot bonus.
5. `updateGame` calls `renderExpansion()`.
6. `doRebirth` and `resetSimulatorStage` notify the new systems.

Every one of those hooks is guarded with `typeof fn === "function"`, so if a
new script fails to load the original game carries on unchanged.

### `src/ui/world.js` — 15 lines
`switchGameMode` learned the three new modes and refuses a locked one.

### `src/ui/effects.js` — 4 lines
The tab tooltip table gained entries for the new tabs. Without this they
displayed the literal text `undefined`.

### Stylesheets — 36 lines
Artwork references switched from `.png` to `.webp` (see below).

---

## How added power is kept honest

Everything the update can contribute to production goes through exactly one
function, `expansionProductionMultiplier(stage)`, which returns **1** when the
player has earned nothing. Three sources feed it:

* **Research** — the deliberate, player-chosen source.
* **City efficiency** — clamped to ×0.9 … ×1.3 where it touches the original
  economy. Inside the city, a brownout bites harder than that (it slows
  research and drops morale), but a first experiment with the city view can
  never cost more than 10% of the rate the player is watching.
* **Companion levels and equipment** — bounded.

A test asserts that a save with no expansion progress produces a multiplier of
exactly 1, so the original balance curves cannot drift.

New "service" structures — roads, farms, turrets, labs, clinics, depots,
beacons — deliberately do **not** touch Salvage per second. They affect only
the new secondary resources. Adding one can never re-balance an original curve.

---

## Save compatibility

* An old save has no `expansion` key. The normalizer builds one from nothing.
* A save written by this build still loads in the **previous** build: the
  unknown `expansion` key is carried along and ignored.
* Corrupted or hostile data is repaired rather than fatal: plots outside the
  grid are dropped, duplicates on one cell collapse, health is clamped to a
  percentage, ids are reissued so none collide, and every collection is capped.
* Cross-system repair runs after load: every owned companion is given at least
  level 1, a player who already beat the Guardian keeps that credit in the new
  combat records, and construction that finished while the game was closed is
  completed rather than left stalled.
* A City Renewal clears the city layout and the survivor roster — they belong
  to the run — and keeps research, companions, discoveries, relationships and
  combat records, which are permanent.

---

## Bugs found and fixed along the way

Four of these were pre-existing or would have shipped broken:

1. **The expansion layer was inert.** It read `window.game` and
   `window.gameStarted`. The original files declare those with top-level `let`,
   which creates a global *lexical* binding and **not** a property of `window`,
   so both were permanently `undefined`. Every accessor now reads the bare
   identifier inside a `try`/`catch`. The same bug was fixed in `audio.js` and
   in the test suite.

2. **The cinematic rendered behind the start screen.** The game's start screen
   is a native modal `<dialog>`, which the browser paints in its *top layer* —
   above everything with a `z-index`. The cinematic was a positioned `<div>`,
   so it was invisible and un-clickable. It is now a `<dialog>` itself.

3. **Roads could exist twice.** Placing a road from the build tray created a
   generic building plot, while the Roads tool created a road tile. The two
   disagreed about what a road was. Both paths now route to the same function.

4. **The new tabs showed a tooltip reading `undefined`.** The tooltip lookup
   table had no entry for them and no fallback.

5. **The battle arena could be drawn before a battle existed**, throwing from a
   `ResizeObserver` on mount.

---

## Artwork

The zone and companion artwork is now loaded as **WebP** instead of PNG:
the same images, re-encoded, at about 6% of the size. That takes the artwork
the game downloads from roughly 23 MB to 1.5 MB, which is the difference
between a slow and a fast first load on a phone.

Verified rather than assumed: in the visible (opaque) pixels the WebP differs
from the PNG by about 5 parts in 255, and the alpha channel is identical.

There is deliberately no PNG fallback. The game already calls
`dialog.showModal()`, which needs Safari 15.4+. WebP has been supported since
Safari 14 — strictly earlier — so any browser that can run this game can
display WebP.

The original PNG files are **not** in this ZIP, because they are already in
your repository and the game no longer loads them. Keep them as editable source
art; nothing will break.

---

## Known limitations

These are stated rather than hidden. TEST_RESULTS.md has the full list.

* **Cloud saving and Google sign-in were not verified end to end.** They need
  live Supabase credentials, which an automated test must not carry. The code
  path is untouched by this update and the local save path is tested
  thoroughly.
* **Audio output was not verified by listening.** The engine is tested for its
  structure, but no test confirms what it sounds like.
* **Balance is first-pass.** The new systems are bounded and tested for
  correctness, not tuned over long play sessions.
* The city map holds 240 structures and 400 road tiles. These caps exist to
  keep the save small and the frame rate steady.
