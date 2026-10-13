# CTRL + ALT + DEFEAT — LAST CITY

A post-apocalyptic city-building strategy game that runs entirely in the
browser. Gather Salvage from the ruins, lay out a settlement by hand, put
survivors to work, research lost technology, and hold the perimeter when the
raids come.

No build step, no framework, no package install. It is HTML, CSS and
JavaScript, and it runs from any static host including GitHub Pages.

---

## Running the game

### The quickest way

Open `index.html` in a modern browser. Everything works except cloud saves,
which need a real `http(s)` origin.

### The way that matches production

Serve the folder over HTTP. Any of these will do:

```bash
# Python 3 (installed on macOS and most Linux systems)
python3 -m http.server 8000

# Node
npx serve .
```

Then open <http://localhost:8000>.

A real origin matters because browsers treat `file://` as a special case:
`localStorage` and the account system behave differently there. If you are
testing saving or logging in, use the HTTP route.

### On GitHub Pages

Push the contents of this folder to a repository and enable Pages. See
**INSTALL.md** for step-by-step instructions written for a first-time user.

---

## What you do in the game

### The five zones

Progress runs through five zones, each with its own currency, its own activity
and its own permanent upgrades:

| Zone | Name | Currency | What you do there |
|---|---|---|---|
| 01 | Ashfall Outpost | Salvage | Gather, build, restore the beacon |
| 02 | Overgrown Depot | Scrap | Search sites for keys and supplies |
| 03 | Copperworks Foundry | Parts | Assemble engines to a changing recipe |
| 04 | Neon Relay | Circuits | Harvest energy from the field |
| 05 | Celestial Citadel | Cores | Break the Guardian's shields and fire |

### The tabs

* **Play** — the original zone activity for whichever zone you are in.
* **City** — the interactive settlement. Drag buildings onto plots, lay roads,
  assign jobs, repair damage, open new districts.
* **Defense** — real-time lane battles against incoming waves.
* **Research** — a branching technology tree across five eras.
* **Upgrades** — buildings, tools and permanent research, as before.
* **Glyphs** — permanent collection buffs, as before.
* **Pets** — hatch, equip and merge companions, plus levelling, equipment,
  training and roles.
* **Stories** — the recovered transmissions archive.
* **Stats** — lifetime records and achievements.

---

## The city

The City tab is an isometric settlement you lay out yourself.

* **Place a building** — drag it from the build tray onto a lit plot, or tap
  the tray entry and then tap the map. Buildings you already own are free to
  place; you are only charged when you need to buy a new one, and that
  purchase goes through the game's own pricing.
* **Pick one up** — clearing an original building returns it to the tray. You
  never lose a building you paid for by rearranging your city.
* **Roads** — the Roads tool lays and removes them. Roads speed citizens up
  and give a small efficiency bonus.
* **Jobs** — survivors arrive as your Population grows. Assign them to posts
  that your buildings provide, or press Auto-assign.
* **Services** — power, food and security come from what you build. A
  brownout or a food shortage lowers city efficiency, which feeds back into
  production. A well-run city helps; a neglected one costs you.
* **Districts** — the map opens outward as you unlock zones.
* **Camera** — drag to pan, scroll or pinch to zoom, arrow keys to move,
  `+`/`-` to zoom, `Home` to recentre.
* **Search the ruins** — wreckage, crates and old terminals are scattered
  across the map. With the Inspect tool, tap one to recover Salvage, research
  points or a piece of the story.

---

## Defense

Waves advance down three lanes toward your core.

* A **charge** meter refills over time; each card costs charge.
* Tap a card, then tap a lane to deploy there.
* **Melee** units cannot reach fliers. **Siege** units walk past defenders and
  go for towers. **Support** units heal whoever is in front of them.
* Your towers are the turrets and barricades you actually built in the City
  tab, so a defended settlement fights better.
* Every fifth wave is a boss with an ability of its own.
* Lose, and the wave damages real structures, which you repair for Salvage.

First clears pay full rewards once. Replays pay a reduced amount, so a wave is
practice rather than a farm.

---

## Research

Twenty-four technologies across five eras, with prerequisites. Research points
come from Research Labs you build in the city and from caches you find in the
ruins. Banked points flow into whichever project is active.

Research is permanent: it survives every reset, including a City Renewal.

---

## Companions

The existing collection, hatching, merging and zone multipliers are unchanged.
On top of them:

* **Levels** earned by playing, with six abilities unlocked along the way.
* **Equipment** in three slots, found through training, missions and discoveries.
* **Training** sessions on a timer.
* **Care** — feeding and play build a bond.
* **Roles** — one companion can help the city, one can scout, one can fight.

Open it from the button at the bottom of the Pets tab.

---

## People and missions

Named survivors turn up as the settlement grows. Conversations branch, and
your answers are recorded permanently — they change what each character offers
you later and what missions open up.

Exploration missions run in real time with a success chance you can improve by
growing your roster, training your crews, researching, and assigning a scout
companion.

City events interrupt occasionally with a decision that costs or pays something
real.

---

## Settings

Under **⚙ Settings** in the header:

* Sound, ambient audio, effects and story popups (original controls).
* Music on/off, with separate music and effects volume sliders.
* Weather, day/night, citizens and screen shake.
* Detail level — Automatic, High, Medium or Low. Automatic samples the device
  once and lowers particle counts on a small or low-core machine.
* Replay the opening cinematic.

Your operating system's **reduced-motion** setting always wins. With it on, the
cinematic becomes a readable storyboard you page through, the city stops
animating and draws on demand, and decorative motion is switched off.

---

## Saving

* **Guest play** saves to this browser's `localStorage`.
* **An account** adds cloud saves through Supabase, including Google sign-in.
* Saves from the previous build load with nothing lost. See CHANGES.md for how
  that is guaranteed and TEST_RESULTS.md for how it was verified.

---

## Project layout

```
index.html              the game
src/
  game/
    game.js             core loop, economy, saves  (original)
    economy.js          upgrade curves             (original)
    progression.js      zone projects              (original)
    adventure.js        zones and companions       (original)
    pets.js             hatching and merging       (original)
    glyphs.js           glyph collections          (original)
    migration.js        new-state schema + save migration      (new)
    audio.js            music and sound engine                 (new)
    citybuilder.js      the interactive city                   (new)
    cinematic.js        the opening sequence                   (new)
    combat.js           lane battles                           (new)
    research.js         the technology tree                    (new)
    events.js           NPCs, missions, city events            (new)
    companions-plus.js  companion levels and equipment         (new)
  ui/
    expansion.js        the layer that joins new to old        (new)
    world.js, player-ui.js, terminal.js, effects.js,
    startup.js, feedback.js                        (original)
  cloud/
    cloud-config.js     public Supabase config     (original)
    cloud-save.js       accounts and cloud saves   (original)
  styles/               stylesheets, original and new
assets/                 zone and companion artwork (WebP)
supabase/               SQL for the cloud-save backend
tests/                  the automated test suite
```

---

## Tests

```bash
node tests/run.js              # everything available
node tests/run.js --no-browser # static and unit tests only
```

The static and unit suites are dependency-free and run on a clean checkout.
The browser suite needs Playwright, and reports as skipped without it:

```bash
npm install --no-save playwright
node tests/run.js
```

See TEST_RESULTS.md for the most recent run and for what is deliberately not
covered.

---

## Credits

Created by **CTRL + ALT + DEFEAT** · IT 485 Capstone Project.

Zone illustrations and companion portraits are the project's own AI-generated
artwork. Everything drawn in the city, the battle arena and the opening
cinematic is generated procedurally in code — there are no sprite sheets. All
music and sound effects are synthesised in the browser with the Web Audio API;
no audio files are downloaded and no external audio service is used.
