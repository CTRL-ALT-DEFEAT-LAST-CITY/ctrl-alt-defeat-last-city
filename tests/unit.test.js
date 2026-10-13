// =============================================
// UNIT TESTS · SAVE NORMALISATION AND MIGRATION
// ---------------------------------------------
// src/game/migration.js is the one module in the project that is pure enough
// to test in plain Node, and it is also the most dangerous one to get wrong:
// it runs against every save file a real player owns. These tests are written
// adversarially — the inputs are the shapes a damaged, truncated, hand-edited
// or hostile save would actually have.
// =============================================

"use strict";

const path = require("path");
const { suite, assert } = require("./harness");

const migration = require(path.resolve(__dirname, "..", "src", "game", "migration.js"));
const {
    normalizeExpansion, migrateExpansionState, resetExpansionForRebirth,
    normalizeCity, normalizeCombat, normalizePetsPlus,
    expNumber, expInt, expCounterMap, expFlagMap, EXPANSION_SAVE_VERSION, CITY_GRID
} = migration;

suite("Migration · coercion primitives", ({ test }) => {
    test("expNumber rejects non-finite input", () => {
        assert.equal(expNumber(NaN, 7), 7);
        assert.equal(expNumber(Infinity, 7), 7);
        assert.equal(expNumber(-Infinity, 7), 7);
        assert.equal(expNumber("not a number", 7), 7);
        assert.equal(expNumber(undefined, 7), 7);
        assert.equal(expNumber(null, 7), 7);
    });

    test("expNumber accepts numeric strings and clamps to range", () => {
        assert.equal(expNumber("12.5", 0), 12.5);
        assert.equal(expNumber(500, 0, 0, 100), 100);
        assert.equal(expNumber(-500, 0, 0, 100), 0);
    });

    test("expNumber does not let coercible junk become a real zero", () => {
        // Number(null), Number(""), Number([]) and Number(false) are all 0, and
        // Number(true) is 1. Accepting those would turn an absent field into a
        // meaningful value — a null `hp` would read as a destroyed building.
        for (const junk of [null, "", "   ", [], {}, false, true, () => {}]) {
            assert.equal(expNumber(junk, 42), 42, "expected the default for " + JSON.stringify(String(junk)));
        }
    });

    test("expNumber treats 0 as a real value, not as absent", () => {
        assert.equal(expNumber(0, 42), 0);
        assert.equal(expNumber("0", 42), 0);
    });

    test("expInt floors rather than rounds", () => {
        assert.equal(expInt(4.99, 0), 4);
        assert.equal(expInt(-0.5, 0, -10, 10), -1);
    });

    test("expCounterMap drops non-numeric values and caps key count", () => {
        const input = { a: 5, b: "x", c: NaN, d: 2 };
        assert.deepEqual(expCounterMap(input), { a: 5, d: 2 });

        const big = {};
        for (let i = 0; i < 1000; i++) big["k" + i] = 1;
        assert.equal(Object.keys(expCounterMap(big, { maxKeys: 10 })).length, 10);
    });

    test("expCounterMap clamps values into range", () => {
        assert.deepEqual(expCounterMap({ a: -5, b: 1e30 }, { min: 0, max: 100 }), { a: 0, b: 100 });
    });

    test("expFlagMap keeps only truthy entries", () => {
        assert.deepEqual(expFlagMap({ a: true, b: false, c: 1, d: 0, e: null }), { a: true, c: true });
    });

    test("primitives survive prototype-polluting keys", () => {
        const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":5,"real":3}');
        const result = expCounterMap(hostile);
        assert.equal({}.polluted, undefined, "Object.prototype was polluted");
        assert.equal(result.real, 3);
    });
});

suite("Migration · structure is always complete", ({ test }) => {
    const REQUIRED = ["version", "city", "survivors", "research", "combat", "pets", "narrative", "cinematic", "tutorial", "settings", "stock"];

    test("an empty save produces every section", () => {
        const state = normalizeExpansion({});
        for (const key of REQUIRED) assert.ok(state[key] !== undefined, "missing section: " + key);
        assert.equal(state.version, EXPANSION_SAVE_VERSION);
    });

    test("hostile inputs never throw and still produce a complete structure", () => {
        for (const input of [undefined, null, 0, "", "a string", [], true, NaN, () => {}]) {
            const state = normalizeExpansion(input);
            for (const key of REQUIRED) assert.ok(state[key] !== undefined, "missing " + key + " for input " + typeof input);
        }
    });

    test("normalisation is idempotent through a JSON round-trip", () => {
        // This is the real-world path: normalize → save → load → normalize.
        // A field that is not stable across that cycle would drift every save.
        const once = normalizeExpansion({});
        const twice = normalizeExpansion(JSON.parse(JSON.stringify(once)));
        assert.deepEqual(twice, once);
    });

    test("a rich save round-trips without losing player progress", () => {
        const rich = normalizeExpansion({
            city: { plots: [{ id: 3, type: "farm", x: 2, y: -1, level: 4, hp: 62 }], built: 11 },
            research: { unlocked: { salvageLogistics: true }, points: 240.5, lifetimePoints: 900 },
            combat: { wavesCleared: 17, bestWave: 9, deck: ["militia", "militia", "sniper"] },
            pets: { levels: { "1-4": 12 }, xp: { "1-4": 4400 } },
            narrative: { choices: { gateChoice: "open" }, relationships: { mara: 40 } }
        });
        const again = normalizeExpansion(JSON.parse(JSON.stringify(rich)));
        assert.deepEqual(again, rich);
        assert.equal(again.city.plots[0].type, "farm");
        assert.equal(again.research.points, 240.5);
        assert.equal(again.combat.bestWave, 9);
        assert.equal(again.pets.levels["1-4"], 12);
        assert.equal(again.narrative.choices.gateChoice, "open");
    });
});

suite("Migration · city grid integrity", ({ test }) => {
    test("plots outside the grid are dropped, not clamped", () => {
        // Clamping would silently stack two buildings on one cell.
        const city = normalizeCity({
            plots: [
                { id: 1, type: "farm", x: 0, y: 0 },
                { id: 2, type: "farm", x: CITY_GRID.maxX + 5, y: 0 },
                { id: 3, type: "farm", x: 0, y: CITY_GRID.minY - 5 }
            ]
        });
        assert.equal(city.plots.length, 1);
        assert.equal(city.plots[0].x, 0);
    });

    test("two plots on the same cell collapse to one", () => {
        const city = normalizeCity({
            plots: [
                { id: 1, type: "farm", x: 1, y: 1 },
                { id: 2, type: "turret", x: 1, y: 1 }
            ]
        });
        assert.equal(city.plots.length, 1);
        assert.equal(city.plots[0].type, "farm", "the first occurrence should win, for determinism");
    });

    test("plots with no type or no coordinates are dropped", () => {
        const city = normalizeCity({
            plots: [
                { id: 1, x: 0, y: 0 },
                { id: 2, type: "farm" },
                { id: 3, type: "farm", x: "abc", y: 2 },
                { id: 4, type: "farm", x: 3, y: 3 },
                null, 42, "nope"
            ]
        });
        assert.equal(city.plots.length, 1);
        assert.equal(city.plots[0].id, 4);
    });

    test("nextPlotId is always ahead of every id in use", () => {
        const city = normalizeCity({
            plots: [{ id: 90, type: "farm", x: 0, y: 0 }, { id: 91, type: "farm", x: 1, y: 0 }],
            nextPlotId: 2
        });
        assert.ok(city.nextPlotId > 91, "a stale counter must not reissue a live id");
    });

    test("plots with no id are assigned unique ids", () => {
        const city = normalizeCity({
            plots: [{ type: "farm", x: 0, y: 0 }, { type: "farm", x: 1, y: 0 }, { type: "farm", x: 2, y: 0 }]
        });
        const ids = city.plots.map(p => p.id);
        assert.equal(new Set(ids).size, 3, "ids must be unique");
        assert.notOk(ids.includes(0), "0 is not a valid id");
    });

    test("health is clamped to a percentage", () => {
        const city = normalizeCity({
            plots: [
                { id: 1, type: "farm", x: 0, y: 0, hp: -40 },
                { id: 2, type: "farm", x: 1, y: 0, hp: 5000 }
            ]
        });
        assert.equal(city.plots[0].hp, 0);
        assert.equal(city.plots[1].hp, 100);
    });

    test("roads cannot overlap a building cell", () => {
        const city = normalizeCity({
            plots: [{ id: 1, type: "farm", x: 0, y: 0 }],
            roads: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }]
        });
        assert.equal(city.roads.length, 1, "the overlapping road and the duplicate should both go");
        assert.deepEqual(city.roads[0], { x: 1, y: 0 });
    });

    test("a construction timer with no end time is discarded", () => {
        const city = normalizeCity({
            plots: [{ id: 1, type: "farm", x: 0, y: 0, constructing: { started: 5 } }]
        });
        assert.equal(city.plots[0].constructing, null, "a site with no end time would never finish");
    });

    test("the plot list is capped", () => {
        const plots = [];
        for (let i = 0; i < 5000; i++) plots.push({ id: i + 1, type: "wall", x: i % 25 - 12, y: Math.floor(i / 25) % 25 - 12 });
        const city = normalizeCity({ plots });
        assert.ok(city.plots.length <= migration.CITY_MAX_PLOTS, "plot count must be bounded");
    });
});

suite("Migration · combat and pets", ({ test }) => {
    test("duplicate deck entries are removed and length is capped", () => {
        const combat = normalizeCombat({ deck: ["a", "a", "b", "b", "c"] });
        assert.deepEqual(combat.deck, ["a", "b", "c"]);
    });

    test("lastResult only accepts known values", () => {
        assert.equal(normalizeCombat({ lastResult: "win" }).lastResult, "win");
        assert.equal(normalizeCombat({ lastResult: "cheated" }).lastResult, null);
    });

    test("pet levels are floored at 1 and capped", () => {
        const pets = normalizePetsPlus({ levels: { "1-0": 0, "1-1": 999, "1-2": 7 } });
        assert.equal(pets.levels["1-0"], 1);
        assert.equal(pets.levels["1-1"], 60);
        assert.equal(pets.levels["1-2"], 7);
    });

    test("a training timer with no end time is discarded", () => {
        const pets = normalizePetsPlus({ training: { "1-0": { kind: "focus" } } });
        assert.equal(pets.training["1-0"], undefined);
    });

    test("version 1 petLevels are carried into the new level map", () => {
        const state = normalizeExpansion({ version: 1, petLevels: { "2-3": 9 } });
        assert.equal(state.pets.levels["2-3"], 9, "a v1 save must not lose its pet levels");
        assert.equal(state.version, EXPANSION_SAVE_VERSION);
    });
});

suite("Migration · cross-system repair", ({ test }) => {
    function fakeGame(overrides) {
        return Object.assign({
            buildings: { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 },
            adventure: { collection: {}, bossDefeated: false },
            expansion: normalizeExpansion({})
        }, overrides || {});
    }

    test("the starting district is always open", () => {
        const game = fakeGame();
        delete game.expansion.city.districts["0"];
        migrateExpansionState(game);
        assert.equal(game.expansion.city.districts["0"], true);
    });

    test("every owned pet gets at least level 1", () => {
        const game = fakeGame({ adventure: { collection: { "1-0": 2, "3-4": 1, "5-2": 0 }, bossDefeated: false } });
        migrateExpansionState(game);
        assert.equal(game.expansion.pets.levels["1-0"], 1);
        assert.equal(game.expansion.pets.levels["3-4"], 1);
        assert.equal(game.expansion.pets.levels["5-2"], undefined, "a pet with zero copies is not owned");
    });

    test("an existing pet level is never downgraded", () => {
        const game = fakeGame({ adventure: { collection: { "1-0": 1 }, bossDefeated: false } });
        game.expansion.pets.levels["1-0"] = 22;
        migrateExpansionState(game);
        assert.equal(game.expansion.pets.levels["1-0"], 22);
    });

    test("a player who already beat the Guardian keeps the credit", () => {
        const game = fakeGame({ adventure: { collection: {}, bossDefeated: true } });
        migrateExpansionState(game);
        assert.equal(game.expansion.combat.bossesDefeated.guardian, true,
            "the original boss win must not have to be repeated");
    });

    test("construction that finished while away is completed, not stalled", () => {
        const game = fakeGame();
        game.expansion.city.plots.push({
            id: 1, type: "farm", x: 0, y: 0, level: 1, hp: 100, rotation: 0,
            builtAt: 0, workers: 0, upgrading: true,
            constructing: { until: Date.now() - 60000, started: Date.now() - 120000, upgrade: true }
        });
        migrateExpansionState(game);
        assert.equal(game.expansion.city.plots[0].constructing, null);
        assert.equal(game.expansion.city.plots[0].upgrading, false);
    });

    test("construction still in progress is preserved", () => {
        const game = fakeGame();
        const until = Date.now() + 60000;
        game.expansion.city.plots.push({
            id: 1, type: "farm", x: 0, y: 0, level: 1, hp: 100, rotation: 0,
            builtAt: 0, workers: 0, upgrading: false,
            constructing: { until, started: Date.now(), upgrade: false }
        });
        migrateExpansionState(game);
        assert.ok(game.expansion.city.plots[0].constructing, "an unfinished site must survive a reload");
    });

    test("migrateExpansionState tolerates a save with no expansion key", () => {
        const game = { buildings: {}, adventure: { collection: {} } };
        migrateExpansionState(game);     // must not throw
        assert.equal(game.expansion, undefined);
    });
});

suite("Migration · renewal preserves permanent progress", ({ test }) => {
    test("a City Renewal clears the layout but keeps earned progress", () => {
        const game = { expansion: normalizeExpansion({}) };
        const exp = game.expansion;
        exp.city.plots.push({ id: 1, type: "farm", x: 0, y: 0, level: 1, hp: 100, rotation: 0, builtAt: 0, workers: 0, constructing: null, upgrading: false });
        exp.city.roads.push({ x: 1, y: 1 });
        exp.survivors.roster.push({ id: 1, name: "Mara", role: "farmer", assignedTo: 1, skill: 3, morale: 80, recruitedAt: 0, portrait: 1 });
        exp.research.unlocked.salvageLogistics = true;
        exp.research.lifetimePoints = 500;
        exp.combat.bestWave = 12;
        exp.pets.levels["1-4"] = 20;
        exp.narrative.discoveries.vault = true;
        exp.narrative.relationships.mara = 45;

        resetExpansionForRebirth(game);

        // Reset for the new run:
        assert.equal(exp.city.plots.length, 0, "layout should reset with the run");
        assert.equal(exp.city.roads.length, 0);
        assert.equal(exp.survivors.roster.length, 0);
        assert.equal(exp.city.districts["0"], true, "the starting district stays open");

        // Permanent, matching how the base game treats glyphs and pets:
        assert.equal(exp.research.unlocked.salvageLogistics, true, "research must be permanent");
        assert.equal(exp.research.lifetimePoints, 500);
        assert.equal(exp.combat.bestWave, 12, "combat records must be permanent");
        assert.equal(exp.pets.levels["1-4"], 20, "pet levels must be permanent");
        assert.equal(exp.narrative.discoveries.vault, true, "discoveries must be permanent");
        assert.equal(exp.narrative.relationships.mara, 45, "relationships must be permanent");
    });

    test("keepLayout leaves the city standing", () => {
        const game = { expansion: normalizeExpansion({}) };
        game.expansion.city.plots.push({ id: 1, type: "farm", x: 0, y: 0, level: 1, hp: 100, rotation: 0, builtAt: 0, workers: 0, constructing: null, upgrading: false });
        resetExpansionForRebirth(game, { keepLayout: true });
        assert.equal(game.expansion.city.plots.length, 1);
    });

    test("resetExpansionForRebirth tolerates a missing expansion key", () => {
        resetExpansionForRebirth({});       // must not throw
        resetExpansionForRebirth(null);
    });
});

suite("Migration · save size stays sane", ({ test }) => {
    test("a maxed-out expansion save stays well under a localStorage quota", () => {
        // localStorage is typically 5MB per origin and the base save shares it,
        // so the expansion's own ceiling needs to be small.
        const plots = [];
        let id = 1;
        for (let x = CITY_GRID.minX; x <= CITY_GRID.maxX; x++) {
            for (let y = CITY_GRID.minY; y <= CITY_GRID.maxY; y++) {
                plots.push({ id: id++, type: "wall", x, y, level: 9, hp: 73.5 });
            }
        }
        const levels = {}, xp = {};
        for (let stage = 1; stage <= 5; stage++) {
            for (let rarity = 0; rarity <= 4; rarity++) {
                levels[stage + "-" + rarity] = 60;
                xp[stage + "-" + rarity] = 1e9;
            }
        }
        const state = normalizeExpansion({
            city: { plots },
            pets: { levels, xp },
            narrative: { log: Array.from({ length: 200 }, (_, i) => ({ at: Date.now(), text: "x".repeat(200), kind: "info" })) }
        });
        const bytes = JSON.stringify(state).length;
        assert.inRange(bytes, 1, 400 * 1024, "expansion save is " + Math.round(bytes / 1024) + "KB");
    });
});
