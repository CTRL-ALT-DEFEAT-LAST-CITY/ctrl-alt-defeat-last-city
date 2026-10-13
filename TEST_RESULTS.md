# Test results

Generated from a real run, not written from memory.

```
node tests/run.js --json
```

* **Run on:** 2026-10-13 17:07 UTC
* **Node:** v22.22.0
* **Browser:** headless Chromium via Playwright 1.64
* **Result: 95 passed · 0 failed · 0 skipped**

---

## By suite

| Suite | Tests | Result |
|---|---:|---|
| Static · JavaScript syntax | 3 | pass |
| Static · referenced files exist | 5 | pass |
| Static · HTML / JavaScript contract | 6 | pass |
| Static · deployment hygiene | 3 | pass |
| Migration · coercion primitives | 9 | pass |
| Migration · structure is always complete | 4 | pass |
| Migration · city grid integrity | 9 | pass |
| Migration · combat and pets | 5 | pass |
| Migration · cross-system repair | 7 | pass |
| Migration · renewal preserves permanent progress | 3 | pass |
| Migration · save size stays sane | 1 | pass |
| Browser · boot and original gameplay | 6 | pass |
| Browser · saves | 5 | pass |
| Browser · expansion integration | 6 | pass |
| Browser · presentation | 3 | pass |
| Browser · cinematic opening | 3 | pass |
| Browser · city builder | 8 | pass |
| Browser · defense | 3 | pass |
| Browser · research | 2 | pass |
| Browser · people, missions and companions | 3 | pass |
| Browser · teardown | 1 | pass |
| **Total** | **95** | **all pass** |

---

## What each area actually proves

### 1. JavaScript syntax
Every shipped script is parsed with `node --check`. No file uses ES module
syntax, since the page loads classic scripts. No stray `debugger` statements.

### 2. Asset paths
Every `<link>` and `<script>` in `index.html` resolves. Every `url()` in every
stylesheet resolves. Every `assets/…` path written in JavaScript resolves.
Asset filenames are lower-case and web-safe, because GitHub Pages is
case-sensitive and a capital letter that works on macOS 404s once deployed.

### 3. The entry page loads
The real page is served over HTTP and opened in Chromium. The test asserts a
**clean console**: no errors, no failed requests, no HTTP status ≥ 400. Script
load order is asserted too, because `defaultGame` calls `normalizeExpansion()`
while being constructed and would throw if `migration.js` moved after
`game.js`.

### 4. Construction, collection, upgrades and progression
* Gathering Salvage still increments Salvage, clicks and lifetime totals.
* Buying a building through the original path still works and changes the rate.
* All five production rates stay finite with heavy progress loaded — no `NaN`,
  no `Infinity`.
* Placing an owned building consumes it from the tray and **does not charge
  again**; placing one you do not own routes through the game's own pricing.
* Footprints cannot overlap; locked districts refuse construction.
* Demolishing an original building returns it to the tray — you can never lose
  a paid-for building by rearranging.
* Roads are stored once whichever way they are placed.
* Power, food, security and efficiency respond to what is built, and an empty
  city is exactly neutral rather than a penalty.
* Survivors appear with Population, never exceed it, and fill real posts.
* A raid damages real structures.
* A City Renewal clears the layout and roster, and keeps research.
* A deliberately badly-run city (heavy consumers, no power, no food) costs
  the original economy **at most 10%**, while the city itself still feels the
  brownout. Building a city can never be a trap.

### 5. The introduction and tutorial
* A first-time player gets the cinematic; **Skip** ends it and hands control
  back to the game's own start path.
* A returning player is never shown it again.
* All five scenes draw without error, and the script carries ≥ 12 lines.
* The cinematic is a `<dialog>` — asserted explicitly, because as a `<div>` it
  rendered behind the start screen's modal dialog and could not be clicked.
* The tutorial advances against real game state.

### 6. Combat and character interaction
* City turrets and barricades measurably increase tower health.
* A wave can be started, units deployed, charge spent, and the wave won.
* A wave's first-clear reward pays **once**; a replay pays less.
* Wave composition is deterministic per wave number, and bosses arrive every
  fifth wave in the intended order.
* Research prerequisites are enforced; researching raises production.
* A dialogue choice is recorded once and pays out once — choosing again does
  nothing.
* A mission does not resolve before its timer, rolls its outcome exactly once,
  and pays on claim.
* Companions gain levels, learn abilities, equip items and hold one role.

### 7. Save and load compatibility
* Save, reload, and progress is intact.
* **A pre-update save** — 42 camps, 3 rebirths, retired legacy buildings, pets,
  equipped companions, beacon modules, infrastructure, glyph research,
  achievements — loads with nothing lost and no console errors.
* **A much older glyph save**, from before the version-3 glyph format, is
  upgraded rather than discarded: per-zone research is carried across and
  already-earned glyph power is preserved as a floor.
* A save written by this build still parses if its `expansion` key is stripped,
  which is what the previous build would do with it.
* A deliberately corrupted `expansion` section is repaired rather than fatal.
* A maxed-out save stays well under a `localStorage` quota.

### 8. Local functionality does not depend on unavailable services
The browser suite **blocks all external network traffic**. Anything that is not
the local test server is refused outright. The game boots, plays, saves and
loads with no internet at all. The Supabase SDK request is answered with a
local stub.

### 9. Presentation
* At 390 px wide there is no horizontal scroll.
* `prefers-reduced-motion` is respected: the cinematic becomes a static
  storyboard and the city stops its animation loop.
* A minute of the real game loop produces no errors.

### 10. Deployment hygiene
* No secret-looking keys are committed. The publishable Supabase key is safe by
  design — it is meant to sit in client code. A `service_role` key, an
  `sb_secret_` key, a private key or a JWT whose payload decodes to a
  `service_role` claim would fail the build. None are present.
* No absolute local filesystem paths leaked into any shipped file.
* No root-absolute `src`/`href` paths, which would break a project site served
  from `/<repo>/`.

---

## Verified by hand as well

Driven in a real browser and inspected visually:

* All five cinematic scenes, at 1400×820.
* The city at three zoom levels, in daylight, at night and in rain, with a
  twenty-structure settlement, roads and walking citizens.
* The battle arena mid-fight and during a boss wave.
* The research tree with a completed node and an active project.
* The start screen, to confirm the WebP artwork renders.
* The whole game at 390×844 with touch enabled.

Screenshots were reviewed at each step and several visual defects were fixed as
a result: characters framed behind the dialogue plate, invisible roads, a boss
that read as a tent rather than a figure, and units too small to see.

---

## Not verified — stated plainly

These could not be tested here, and are **not** claimed to work:

1. **Cloud saving and account login, end to end.** Creating an account, signing
   in with email or with Google, syncing a save to Supabase and resolving a
   save conflict all require live Supabase credentials and a real browser
   session. An automated suite must not carry those credentials, so the tests
   stub the SDK and cover only the local save path.
   **The cloud code path is untouched by this update.** `cloud-save.js` and
   `cloud-config.js` are byte-identical to what you supplied. The one new
   interaction — a cloud save arriving through `LastCityGame.load()` — is
   covered indirectly, because that path calls the same `loadGame()` the tested
   device-save path uses, and the new normalizer runs on both exit paths.
   **Please test a real login and a real cloud save once after deploying.**

2. **What the audio sounds like.** The engine is tested for structure — it
   exposes its five tracks and thirty-two effects, and it respects the
   preference flags — but no test listens. Audio also cannot start before a
   user gesture, by browser policy.

3. **Real devices.** Testing used headless Chromium with a phone viewport and
   touch emulation. No physical iPhone, iPad or Android device was used, and
   Safari and Firefox were not tested at all.

4. **Long-session balance.** The new systems are bounded and their arithmetic
   is tested, but nobody has played for ten hours. Expect to tune numbers.

5. **Performance on low-end hardware.** There is an automatic quality tier that
   lowers particle counts on a small screen or a low core count, but it has not
   been measured on an actual low-end phone.

6. **Accessibility beyond the basics.** Keyboard access, focus-visible styles,
   ARIA labelling and reduced-motion are implemented and partly tested. No
   screen-reader pass was done.

---

## Reproducing this

```bash
# static + unit only, no dependencies at all
node tests/run.js --no-browser

# everything, including the real browser
npm install --no-save playwright
node tests/run.js

# machine-readable summary
node tests/run.js --json
```

The browser suite finds Chromium automatically: if Playwright's bundled build
is missing it looks for a usable Chromium beside it before giving up, and
reports every test as *skipped* rather than failed when Playwright is absent.
A skipped test is always counted and reported, so a green result is never
misleading.
