// =============================================
// LAST CITY · EXPANSION STATE & SAVE MIGRATION
// CTRL + ALT + DEFEAT
// ---------------------------------------------
// Every system added by this update stores its state under `game.expansion`.
// Keeping it in one namespace means:
//   * the original save shape is untouched, so an old save loads as-is;
//   * a save written by this build still loads in the previous build (the
//     unknown `expansion` key is simply carried along and ignored);
//   * one normalizer can repair or backfill the whole addition.
//
// The golden rule here is that nothing trusts the loaded value. Every field is
// re-derived through a clamp/coerce helper, so a truncated upload, a
// hand-edited localStorage entry, or a save from a newer build can never put
// the game into a state the renderers cannot draw.
//
// This file must load BEFORE src/game/game.js, because `defaultGame` calls
// normalizeExpansion() while it is being constructed.
// =============================================

// Bump when a change needs an actual data transform rather than a backfill.
// The normalizer is additive, so most changes do not need a bump.
const EXPANSION_SAVE_VERSION = 2;

// ---------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------

// Deliberately stricter than Number(). Plain coercion turns null, "", [] and
// false into 0 and true into 1, which would silently rewrite an absent field
// as a real zero — a `hp: null` would become a destroyed building instead of a
// healthy one. Only an actual number, or a non-empty numeric string, counts as
// a value; everything else is treated as absent and takes the default.
function expNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
    let n;
    if (typeof value === "number") n = value;
    else if (typeof value === "string" && value.trim() !== "") n = Number(value);
    else return fallback;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function expInt(value, fallback = 0, min = -Infinity, max = Infinity) {
    return Math.floor(expNumber(value, fallback, min, max));
}

function expBool(value, fallback = false) {
    return typeof value === "boolean" ? value : fallback;
}

function expString(value, fallback = "", maxLength = 64) {
    if (typeof value !== "string") return fallback;
    return value.slice(0, maxLength);
}

// A plain object of counters: {key: number}. Keys are length-capped so a
// corrupted save cannot balloon the object, and values are clamped.
function expCounterMap(value, { min = 0, max = 1e12, maxKeys = 400, keyLength = 48 } = {}) {
    const out = {};
    if (!value || typeof value !== "object") return out;
    let count = 0;
    for (const [key, raw] of Object.entries(value)) {
        if (count++ >= maxKeys) break;
        if (typeof key !== "string" || !key.length) continue;
        const n = Number(raw);
        if (!Number.isFinite(n)) continue;
        out[key.slice(0, keyLength)] = Math.min(max, Math.max(min, n));
    }
    return out;
}

// A plain object of booleans: {key: true}. Only truthy entries are kept, which
// keeps unlock maps compact.
function expFlagMap(value, { maxKeys = 600, keyLength = 48 } = {}) {
    const out = {};
    if (!value || typeof value !== "object") return out;
    let count = 0;
    for (const [key, raw] of Object.entries(value)) {
        if (count++ >= maxKeys) break;
        if (typeof key !== "string" || !key.length) continue;
        if (raw) out[key.slice(0, keyLength)] = true;
    }
    return out;
}

function expStringMap(value, { maxKeys = 300, keyLength = 48, valueLength = 64 } = {}) {
    const out = {};
    if (!value || typeof value !== "object") return out;
    let count = 0;
    for (const [key, raw] of Object.entries(value)) {
        if (count++ >= maxKeys) break;
        if (typeof key !== "string" || !key.length) continue;
        if (typeof raw !== "string") continue;
        out[key.slice(0, keyLength)] = raw.slice(0, valueLength);
    }
    return out;
}

function expArray(value, maxLength = 200) {
    return Array.isArray(value) ? value.slice(0, maxLength) : [];
}

// ---------------------------------------------------------------
// City layout
//
// The interactive city is a sparse grid. Only occupied cells are stored, so a
// large unlocked map costs nothing until the player builds on it.
// Grid coordinates are integers in a fixed window; anything outside is dropped
// rather than clamped, because a clamped plot would silently stack on top of
// another one.
// ---------------------------------------------------------------

const CITY_GRID = { minX: -12, maxX: 12, minY: -12, maxY: 12 };
const CITY_MAX_PLOTS = 240;

function normalizeCityPlot(raw, seenCells) {
    if (!raw || typeof raw !== "object") return null;

    const x = expInt(raw.x, NaN);
    const y = expInt(raw.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < CITY_GRID.minX || x > CITY_GRID.maxX) return null;
    if (y < CITY_GRID.minY || y > CITY_GRID.maxY) return null;

    // One structure per cell. A duplicate means the save was damaged; the
    // first occurrence wins so the result is deterministic.
    const cell = x + ":" + y;
    if (seenCells.has(cell)) return null;

    const type = expString(raw.type, "", 40);
    if (!type) return null;
    seenCells.add(cell);

    const plot = {
        id: expInt(raw.id, 0, 0, 1e9),
        type,
        x, y,
        level: expInt(raw.level, 1, 1, 50),
        // Health is a percentage so damage survives balance changes to max HP.
        hp: expNumber(raw.hp, 100, 0, 100),
        rotation: expInt(raw.rotation, 0, 0, 3),
        builtAt: expInt(raw.builtAt, 0, 0, Number.MAX_SAFE_INTEGER),
        workers: expInt(raw.workers, 0, 0, 99),
        // `constructing` is a live timer. A save taken mid-build keeps it, and
        // the city builder finishes or fast-forwards it on load.
        constructing: null,
        upgrading: false
    };

    if (raw.constructing && typeof raw.constructing === "object") {
        const until = expInt(raw.constructing.until, 0, 0, Number.MAX_SAFE_INTEGER);
        const started = expInt(raw.constructing.started, 0, 0, Number.MAX_SAFE_INTEGER);
        if (until > 0) {
            plot.constructing = {
                until,
                started: started || until - 4000,
                upgrade: expBool(raw.constructing.upgrade, false)
            };
            plot.upgrading = plot.constructing.upgrade;
        }
    }
    return plot;
}

function normalizeCity(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};
    const seenCells = new Set();

    const plots = expArray(source.plots, CITY_MAX_PLOTS)
        .map(raw => normalizeCityPlot(raw, seenCells))
        .filter(Boolean);

    // Roads are decorative/connective and cheap, stored as a flat cell list.
    const seenRoads = new Set();
    const roads = [];
    for (const raw of expArray(source.roads, 400)) {
        if (!raw || typeof raw !== "object") continue;
        const x = expInt(raw.x, NaN), y = expInt(raw.y, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < CITY_GRID.minX || x > CITY_GRID.maxX) continue;
        if (y < CITY_GRID.minY || y > CITY_GRID.maxY) continue;
        const cell = x + ":" + y;
        if (seenRoads.has(cell) || seenCells.has(cell)) continue;
        seenRoads.add(cell);
        roads.push({ x, y });
    }

    // Keep ids unique and ahead of everything in use, so a damaged counter
    // cannot hand out an id that already exists.
    const highestId = plots.reduce((max, plot) => Math.max(max, plot.id), 0);
    let nextPlotId = expInt(source.nextPlotId, highestId + 1, 1, 1e9);
    if (nextPlotId <= highestId) nextPlotId = highestId + 1;
    for (const plot of plots) if (!plot.id) plot.id = nextPlotId++;

    return {
        plots,
        roads,
        nextPlotId,
        // District 0 is the starting plateau and is always available.
        districts: expFlagMap(source.districts, { maxKeys: 24 }),
        // Remembered camera framing, so returning to the city view feels
        // continuous rather than snapping home.
        camera: {
            x: expNumber(source.camera?.x, 0, -4000, 4000),
            y: expNumber(source.camera?.y, 0, -4000, 4000),
            zoom: expNumber(source.camera?.zoom, 1, 0.45, 2.4)
        },
        // Totals used for achievements and the city report.
        built: expInt(source.built, 0, 0, 1e9),
        demolished: expInt(source.demolished, 0, 0, 1e9),
        repaired: expInt(source.repaired, 0, 0, 1e9),
        lastTick: expInt(source.lastTick, 0, 0, Number.MAX_SAFE_INTEGER)
    };
}

// ---------------------------------------------------------------
// Survivors and jobs
// ---------------------------------------------------------------

function normalizeSurvivors(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};
    const roster = expArray(source.roster, 120).map((raw, index) => {
        if (!raw || typeof raw !== "object") return null;
        return {
            id: expInt(raw.id, index + 1, 1, 1e9),
            name: expString(raw.name, "Survivor", 32),
            // `role` is validated against the live job table by the city
            // builder; an unknown role falls back to idle there.
            role: expString(raw.role, "idle", 24),
            assignedTo: expInt(raw.assignedTo, 0, 0, 1e9),
            skill: expNumber(raw.skill, 1, 0, 20),
            morale: expNumber(raw.morale, 70, 0, 100),
            recruitedAt: expInt(raw.recruitedAt, 0, 0, Number.MAX_SAFE_INTEGER),
            portrait: expInt(raw.portrait, 0, 0, 23)
        };
    }).filter(Boolean);

    const highestId = roster.reduce((max, s) => Math.max(max, s.id), 0);
    let nextId = expInt(source.nextId, highestId + 1, 1, 1e9);
    if (nextId <= highestId) nextId = highestId + 1;

    return {
        roster,
        nextId,
        recruited: expInt(source.recruited, roster.length, 0, 1e9),
        lost: expInt(source.lost, 0, 0, 1e9)
    };
}

// ---------------------------------------------------------------
// Research
// ---------------------------------------------------------------

function normalizeResearch(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};
    let active = null;
    if (source.active && typeof source.active === "object") {
        const id = expString(source.active.id, "", 48);
        if (id) {
            active = {
                id,
                // Progress is stored as accumulated points, not a deadline, so
                // research does not silently complete while offline.
                invested: expNumber(source.active.invested, 0, 0, 1e15),
                startedAt: expInt(source.active.startedAt, 0, 0, Number.MAX_SAFE_INTEGER)
            };
        }
    }
    return {
        unlocked: expFlagMap(source.unlocked, { maxKeys: 200 }),
        points: expNumber(source.points, 0, 0, 1e15),
        lifetimePoints: expNumber(source.lifetimePoints, 0, 0, 1e18),
        active,
        // Remembered tree scroll position.
        view: {
            x: expNumber(source.view?.x, 0, -20000, 20000),
            y: expNumber(source.view?.y, 0, -20000, 20000)
        }
    };
}

// ---------------------------------------------------------------
// Combat
// ---------------------------------------------------------------

function normalizeCombat(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};
    // The deck is a list of unit ids; duplicates are dropped and the length is
    // capped. The combat module validates the ids against its own roster.
    const deck = [];
    for (const raw of expArray(source.deck, 12)) {
        const id = expString(raw, "", 40);
        if (id && !deck.includes(id)) deck.push(id);
    }
    return {
        deck,
        unitLevels: expCounterMap(source.unitLevels, { min: 0, max: 50, maxKeys: 60 }),
        unitsUnlocked: expFlagMap(source.unitsUnlocked, { maxKeys: 60 }),
        defenses: expCounterMap(source.defenses, { min: 0, max: 50, maxKeys: 40 }),
        wavesCleared: expInt(source.wavesCleared, 0, 0, 1e7),
        bestWave: expInt(source.bestWave, 0, 0, 1e7),
        totalKills: expInt(source.totalKills, 0, 0, 1e9),
        losses: expInt(source.losses, 0, 0, 1e9),
        bossesDefeated: expFlagMap(source.bossesDefeated, { maxKeys: 40 }),
        // Last result is presentation only; it never gates a reward.
        lastResult: ["win", "loss", null].includes(source.lastResult) ? source.lastResult : null,
        // Encounters already paid out, so a reload cannot re-claim them.
        rewarded: expFlagMap(source.rewarded, { maxKeys: 200 })
    };
}

// ---------------------------------------------------------------
// Pets: levels, equipment, training, care
//
// Keyed by the EXISTING pet id format ("<stage>-<rarity>") so the player's
// current collection gains levels without any of it being rebuilt.
// ---------------------------------------------------------------

function normalizePetsPlus(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};
    return {
        xp: expCounterMap(source.xp, { min: 0, max: 1e12, maxKeys: 80 }),
        levels: expCounterMap(source.levels, { min: 1, max: 60, maxKeys: 80 }),
        // {petId: {slot: itemId}}
        equipment: (() => {
            const out = {};
            if (!source.equipment || typeof source.equipment !== "object") return out;
            let count = 0;
            for (const [petId, slots] of Object.entries(source.equipment)) {
                if (count++ >= 80) break;
                if (typeof petId !== "string" || !slots || typeof slots !== "object") continue;
                out[petId.slice(0, 24)] = expStringMap(slots, { maxKeys: 4, keyLength: 16, valueLength: 40 });
            }
            return out;
        })(),
        inventory: expCounterMap(source.inventory, { min: 0, max: 9999, maxKeys: 120 }),
        training: (() => {
            const out = {};
            if (!source.training || typeof source.training !== "object") return out;
            let count = 0;
            for (const [petId, raw] of Object.entries(source.training)) {
                if (count++ >= 80) break;
                if (typeof petId !== "string" || !raw || typeof raw !== "object") continue;
                const until = expInt(raw.until, 0, 0, Number.MAX_SAFE_INTEGER);
                if (until <= 0) continue;
                out[petId.slice(0, 24)] = {
                    until,
                    started: expInt(raw.started, 0, 0, Number.MAX_SAFE_INTEGER),
                    kind: expString(raw.kind, "focus", 24)
                };
            }
            return out;
        })(),
        care: (() => {
            const out = {};
            if (!source.care || typeof source.care !== "object") return out;
            let count = 0;
            for (const [petId, raw] of Object.entries(source.care)) {
                if (count++ >= 80) break;
                if (typeof petId !== "string" || !raw || typeof raw !== "object") continue;
                out[petId.slice(0, 24)] = {
                    fedAt: expInt(raw.fedAt, 0, 0, Number.MAX_SAFE_INTEGER),
                    playedAt: expInt(raw.playedAt, 0, 0, Number.MAX_SAFE_INTEGER),
                    bond: expNumber(raw.bond, 0, 0, 100)
                };
            }
            return out;
        })(),
        abilityUnlocks: expFlagMap(source.abilityUnlocks, { maxKeys: 200 }),
        // Which pet is assigned to help where: {city|explore|combat: petId}
        assignments: expStringMap(source.assignments, { maxKeys: 6, keyLength: 16, valueLength: 24 }),
        totalLevels: expInt(source.totalLevels, 0, 0, 1e7),
        trainingsCompleted: expInt(source.trainingsCompleted, 0, 0, 1e7)
    };
}

// ---------------------------------------------------------------
// NPCs, choices, missions, discoveries
// ---------------------------------------------------------------

function normalizeNarrative(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};

    const missions = {};
    if (source.missions && typeof source.missions === "object") {
        let count = 0;
        for (const [id, raw] of Object.entries(source.missions)) {
            if (count++ >= 120) break;
            if (typeof id !== "string" || !raw || typeof raw !== "object") continue;
            missions[id.slice(0, 48)] = {
                state: ["available", "active", "done", "failed"].includes(raw.state) ? raw.state : "available",
                progress: expNumber(raw.progress, 0, 0, 1e9),
                startedAt: expInt(raw.startedAt, 0, 0, Number.MAX_SAFE_INTEGER),
                completedAt: expInt(raw.completedAt, 0, 0, Number.MAX_SAFE_INTEGER),
                // Mission payouts are one-shot; this is the guard.
                claimed: expBool(raw.claimed, false)
            };
        }
    }

    // The event log is capped and purely informational.
    const log = [];
    for (const raw of expArray(source.log, 60)) {
        if (!raw || typeof raw !== "object") continue;
        log.push({
            at: expInt(raw.at, 0, 0, Number.MAX_SAFE_INTEGER),
            text: expString(raw.text, "", 200),
            kind: expString(raw.kind, "info", 24)
        });
    }

    return {
        met: expFlagMap(source.met, { maxKeys: 80 }),
        // {choiceId: optionId} — a permanent record of what the player decided.
        choices: expStringMap(source.choices, { maxKeys: 200, keyLength: 48, valueLength: 40 }),
        relationships: expCounterMap(source.relationships, { min: -100, max: 100, maxKeys: 40 }),
        missions,
        discoveries: expFlagMap(source.discoveries, { maxKeys: 200 }),
        // Clickable world objects already collected, per zone.
        props: expFlagMap(source.props, { maxKeys: 400 }),
        log,
        // Scheduling state for ambient city events.
        nextEventAt: expInt(source.nextEventAt, 0, 0, Number.MAX_SAFE_INTEGER),
        eventsSeen: expInt(source.eventsSeen, 0, 0, 1e7),
        activeEvent: expString(source.activeEvent, "", 48)
    };
}

// ---------------------------------------------------------------
// Cinematic + tutorial + settings
// ---------------------------------------------------------------

// Bump to re-show the opening cinematic to everyone (for example after the
// story is extended). Returning players otherwise skip straight past it.
const CINEMATIC_VERSION = 1;

function normalizeCinematic(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};
    return {
        seenVersion: expInt(source.seenVersion, 0, 0, 1000),
        plays: expInt(source.plays, 0, 0, 1e6),
        skipped: expBool(source.skipped, false),
        // Lets the player replay it from Settings without it auto-running.
        replayRequested: false
    };
}

function normalizeTutorial(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};
    return {
        step: expInt(source.step, 0, 0, 100),
        done: expBool(source.done, false),
        completedSteps: expFlagMap(source.completedSteps, { maxKeys: 100 }),
        dismissed: expBool(source.dismissed, false)
    };
}

function normalizeExpansionSettings(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};
    const quality = ["low", "medium", "high", "auto"].includes(source.quality) ? source.quality : "auto";
    return {
        weather: expBool(source.weather, true),
        dayNight: expBool(source.dayNight, true),
        cameraShake: expBool(source.cameraShake, true),
        showNpcs: expBool(source.showNpcs, true),
        showGrid: expBool(source.showGrid, true),
        quality,
        // Remembered sub-view selections so tabs feel sticky.
        cityTool: expString(source.cityTool, "inspect", 24),
        lastCombatTab: expString(source.lastCombatTab, "campaign", 24)
    };
}

// ---------------------------------------------------------------
// Top-level normalizer
// ---------------------------------------------------------------

function normalizeExpansion(saved = {}) {
    const source = saved && typeof saved === "object" ? saved : {};
    const state = {
        version: EXPANSION_SAVE_VERSION,
        city: normalizeCity(source.city),
        survivors: normalizeSurvivors(source.survivors),
        research: normalizeResearch(source.research),
        combat: normalizeCombat(source.combat),
        pets: normalizePetsPlus(source.pets),
        narrative: normalizeNarrative(source.narrative),
        cinematic: normalizeCinematic(source.cinematic),
        tutorial: normalizeTutorial(source.tutorial),
        settings: normalizeExpansionSettings(source.settings),
        // Secondary city resources. These are stocks, not rates: the city
        // builder derives production and consumption live.
        stock: {
            food: expNumber(source.stock?.food, 0, 0, 1e15),
            power: expNumber(source.stock?.power, 0, 0, 1e15),
            security: expNumber(source.stock?.security, 0, 0, 1e15)
        }
    };

    // ---- versioned transforms -------------------------------------------
    // Applied in order. A save with no version is treated as version 0, which
    // is also what a save from before this update looks like.
    const from = expInt(source.version, 0, 0, 1000);

    if (from < 2) {
        // v1 stored one flat `petLevels` map and no per-pet XP. Convert any
        // level found there into the new XP/level pair so nothing is lost.
        const legacyLevels = expCounterMap(source.petLevels, { min: 1, max: 60, maxKeys: 80 });
        for (const [petId, level] of Object.entries(legacyLevels)) {
            if (!state.pets.levels[petId]) state.pets.levels[petId] = level;
        }
    }

    return state;
}

// Called once after a save has loaded, with the live `game` object. This is
// where cross-system repairs belong: things that need to look at the ORIGINAL
// save fields (buildings, stages, pet collection) as well as the expansion.
function migrateExpansionState(state) {
    if (!state || typeof state !== "object" || !state.expansion) return state;
    const exp = state.expansion;

    // The starting district is always open, even on a brand-new save.
    exp.city.districts["0"] = true;

    // Every pet the player owns gets at least level 1, so the inventory never
    // shows a companion with no level. Existing collections are untouched
    // otherwise.
    const collection = state.adventure?.collection;
    if (collection && typeof collection === "object") {
        for (const petId of Object.keys(collection)) {
            if ((collection[petId] || 0) > 0 && !exp.pets.levels[petId]) {
                exp.pets.levels[petId] = 1;
            }
        }
    }

    // Preserve the original Guardian fight: a player who already beat it keeps
    // that credited in the new combat records rather than being asked again.
    if (state.adventure?.bossDefeated) exp.combat.bossesDefeated.guardian = true;

    // Drop plots whose construction timer finished while the game was closed:
    // they become finished buildings rather than stalled sites.
    const stamp = Date.now();
    for (const plot of exp.city.plots) {
        if (plot.constructing && plot.constructing.until <= stamp) {
            plot.constructing = null;
            plot.upgrading = false;
        }
    }

    // Clear a stale active event so a save taken mid-dialogue reopens cleanly.
    exp.narrative.activeEvent = "";

    return state;
}

// Called when the player performs a Stage 1 City Renewal (rebirth). The city
// layout belongs to the run, so it resets — but anything the player earned
// permanently does not. This mirrors how the base game treats buildings
// versus glyphs and pets.
function resetExpansionForRebirth(state, { keepLayout = false } = {}) {
    if (!state?.expansion) return;
    const exp = state.expansion;
    if (!keepLayout) {
        exp.city.plots = [];
        exp.city.roads = [];
        exp.city.nextPlotId = 1;
        exp.city.districts = { 0: true };
        exp.survivors.roster = [];
        exp.stock = { food: 0, power: 0, security: 0 };
    }
    // Research, pets, combat records, discoveries and relationships are
    // permanent progress and deliberately survive a renewal.
}

// Exposed for the test harness, which runs these in plain Node without a DOM.
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        EXPANSION_SAVE_VERSION,
        CINEMATIC_VERSION,
        CITY_GRID,
        CITY_MAX_PLOTS,
        normalizeExpansion,
        migrateExpansionState,
        resetExpansionForRebirth,
        normalizeCity,
        normalizeSurvivors,
        normalizeResearch,
        normalizeCombat,
        normalizePetsPlus,
        normalizeNarrative,
        expNumber,
        expInt,
        expBool,
        expString,
        expCounterMap,
        expFlagMap
    };
}
